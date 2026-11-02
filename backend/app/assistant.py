"""AI Skill Assistant: an LLM agent that can only answer through tools over the platform's own data.

Grounding rule: the model is told never to state a number it did not get from a tool, and every
answer returns the tool calls it made as `evidence`, so the UI can show where each figure came from.

Providers (env):
  ANTHROPIC_API_KEY [+ ANTHROPIC_MODEL]                 -> Anthropic Messages API with tool use
  OPENAI_API_KEY [+ OPENAI_BASE_URL, OPENAI_MODEL]      -> any OpenAI-compatible endpoint (OpenAI, Gemini, Groq, Ollama)
With neither set, /api/assistant returns 503 and the web app falls back to its built-in offline engine.
"""
import json
import os

from . import data

SYSTEM = """You are the SkillNet India assistant for policymakers, colleges, industry and students.
Answer ONLY with figures returned by the tools. If a tool returns nothing, say the data is not available.
Units: openings/available/shortage are persons per year; SGI is the Skill Gap Index (-100 surplus .. +100 shortage).
Mention when evidence is low-confidence or when the underlying dataset is synthetic (demo). Be concise; use short bullet lists."""

TOOLS = [
    {"name": "top_gaps", "description": "Largest skill shortages (or surpluses) for a state or all India, optionally within a skill cluster.",
     "input_schema": {"type": "object", "properties": {"state": {"type": "string"}, "cluster": {"type": "string", "description": "cluster code e.g. GE, HC, SW"},
                                                       "direction": {"type": "string", "enum": ["shortage", "surplus"]}, "n": {"type": "integer"}}}},
    {"name": "state_summary", "description": "Labour market and gap summary for one state.",
     "input_schema": {"type": "object", "properties": {"state": {"type": "string"}}, "required": ["state"]}},
    {"name": "compare_states", "description": "Compare states on a skill (or overall if skill omitted).",
     "input_schema": {"type": "object", "properties": {"states": {"type": "array", "items": {"type": "string"}}, "skill": {"type": "string"}}, "required": ["states"]}},
    {"name": "skill_forecast", "description": "12-month demand forecast for a skill (national postings).",
     "input_schema": {"type": "object", "properties": {"skill": {"type": "string"}}, "required": ["skill"]}},
    {"name": "where_to_train", "description": "States with the largest shortage of a skill, and training centres teaching it there.",
     "input_schema": {"type": "object", "properties": {"skill": {"type": "string"}, "n": {"type": "integer"}}, "required": ["skill"]}},
    {"name": "simulate", "description": "What-if: impact of training N people in a skill in a state.",
     "input_schema": {"type": "object", "properties": {"state": {"type": "string"}, "skill": {"type": "string"}, "trainees": {"type": "integer"}},
                      "required": ["state", "skill", "trainees"]}},
    {"name": "career_path", "description": "Skills, pay and demand for a target job role.",
     "input_schema": {"type": "object", "properties": {"role": {"type": "string"}}, "required": ["role"]}},
]


def run_tool(name, a):
    st = lambda x: data.resolve(x, data.states()) if x else None
    sk = lambda x: data.resolve_skill(x) if x else None
    if name == "top_gaps":
        g = data.gap_rows(state=st(a.get("state")), cluster=a.get("cluster"))
        if not a.get("state"):
            g = g.groupby(["skill", "cluster"], as_index=False)[["openings", "available", "shortage", "postings_12m"]].sum()
            g["sgi"] = (100 * (g.openings - g.available) / (g.openings + g.available)).round(1)
        g = g.sort_values("shortage", ascending=a.get("direction") == "surplus").head(a.get("n", 8))
        return g[["skill", "cluster", "openings", "available", "shortage", "sgi"]].to_dict("records")
    if name == "state_summary":
        return data.state_summary(st(a["state"]))
    if name == "compare_states":
        out = []
        for s in a["states"]:
            s = st(s)
            if a.get("skill"):
                g = data.gap_rows(state=s, skill=sk(a["skill"]), include_low=True)
                out += g[["state", "skill", "openings", "available", "shortage", "sgi", "growth_12m", "confidence"]].to_dict("records")
            else:
                ss = data.state_summary(s)
                if ss:
                    out.append({k: ss[k] for k in ("state", "sgi", "sgi_next12", "ur", "youth_ur", "openings", "available", "postings12")})
        return out
    if name == "skill_forecast":
        f = data.forecast(skill=sk(a["skill"]))
        return f and {"skill": sk(a["skill"]), "model": f["model"], "last12_postings": sum(f["h"][-12:]), "next12_forecast": sum(f["f"]),
                      "growth_pct": round(100 * f["g"], 1), "interval_80": [sum(f["lo"]), sum(f["hi"])]}
    if name == "where_to_train":
        s = sk(a["skill"])
        if not s:
            return {"error": f"unknown skill '{a['skill']}'"}
        g = data.gap_rows(skill=s).sort_values("shortage", ascending=False).head(a.get("n", 5))
        rows = []
        for r in g.itertuples():
            c = data.centres(state=r.state, skill=s, k=3)
            rows.append({"state": r.state, "shortage": int(r.shortage), "sgi": r.sgi,
                         "centres_teaching_it": data.centre_count(r.state, s),
                         "examples": c[["name", "district", "seats"]].to_dict("records")})
        route = data.skills_meta()[s]["route"]
        note = None if any(x["centres_teaching_it"] for x in rows) else f"Not taught at ITIs/polytechnics in this dataset. Usual route: {route}"
        return {"skill": s, "training_route": route, "note": note, "states": rows}
    if name == "simulate":
        s, k = st(a["state"]), sk(a["skill"])
        return data.simulate(s, k, int(a["trainees"])) if s and k else {"error": "unknown state or skill"}
    if name == "career_path":
        return data.resolve_role(a["role"])
    return {"error": f"unknown tool {name}"}


def answer(question, history=None):
    history = history or []
    if os.getenv("ANTHROPIC_API_KEY"):
        return _anthropic(question, history)
    if os.getenv("OPENAI_API_KEY"):
        return _openai(question, history)
    return None


def _anthropic(question, history):
    import anthropic
    client = anthropic.Anthropic()
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
    msgs = history + [{"role": "user", "content": question}]
    evidence = []
    for _ in range(6):
        r = client.messages.create(model=model, max_tokens=1200, system=SYSTEM, tools=TOOLS, messages=msgs)
        if r.stop_reason != "tool_use":
            return {"answer": "".join(b.text for b in r.content if b.type == "text"), "evidence": evidence, "provider": "anthropic"}
        msgs.append({"role": "assistant", "content": r.content})
        results = []
        for b in r.content:
            if b.type == "tool_use":
                out = run_tool(b.name, b.input)
                evidence.append({"tool": b.name, "input": b.input, "output": out})
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out, default=str)[:12000]})
        msgs.append({"role": "user", "content": results})
    return {"answer": "I could not finish within the tool-call budget.", "evidence": evidence, "provider": "anthropic"}


def _openai(question, history):
    from openai import OpenAI
    client = OpenAI(base_url=os.getenv("OPENAI_BASE_URL") or None)
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]}} for t in TOOLS]
    msgs = [{"role": "system", "content": SYSTEM}] + history + [{"role": "user", "content": question}]
    evidence = []
    for _ in range(6):
        r = client.chat.completions.create(model=model, messages=msgs, tools=tools)
        m = r.choices[0].message
        if not m.tool_calls:
            return {"answer": m.content, "evidence": evidence, "provider": "openai-compatible"}
        msgs.append(m)
        for tc in m.tool_calls:
            args = json.loads(tc.function.arguments or "{}")
            out = run_tool(tc.function.name, args)
            evidence.append({"tool": tc.function.name, "input": args, "output": out})
            msgs.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(out, default=str)[:12000]})
    return {"answer": "I could not finish within the tool-call budget.", "evidence": evidence, "provider": "openai-compatible"}
