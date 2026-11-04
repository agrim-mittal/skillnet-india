import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, User, Database, ArrowRight, Sparkles } from "lucide-react";
import { useData, apiBase, detectBackend } from "../data";
import { makeEngine } from "../assistantEngine";
import { ForecastChart } from "../components/charts";

const API = import.meta.env.VITE_API_URL || "";
const MAX_HISTORY = 6;   // last turns sent to the LLM for follow-up questions
const SUGGEST = [
  "Which skills are short in Punjab?",
  "What if Punjab trains 10,000 solar technicians?",
  "Compare Karnataka and Telangana for Generative AI",
  "Where should we train nurses?",
  "Forecast for EV battery skills",
  "How do I become a CNC operator?",
  "Which skills are in surplus in Kerala?",
  "What are the emerging skills?",
];

export default function Assistant() {
  const data = useData();
  const [taxonomy, setTaxonomy] = useState(null);
  const [msgs, setMsgs] = useState([{ role: "bot", a: { text: ["Hi! I answer from SkillNet's own data: skill gaps, forecasts, training centres, careers and what-if scenarios. Every figure shows its source below the answer."] } }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [llm, setLlm] = useState(false);
  const end = useRef(null);
  useEffect(() => { fetch(API ? `${API}/api/data/taxonomy` : "./data/taxonomy.json").then((r) => r.json()).then(setTaxonomy); }, []);
  useEffect(() => { detectBackend().then((h) => setLlm(h?.assistant === "llm")); }, []);
  const engine = useMemo(() => (taxonomy ? makeEngine(data, taxonomy) : null), [taxonomy, data]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function ask(text) {
    if (!text.trim() || !engine) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setQ(""); setBusy(true);
    let a = null;
    if (llm) {
      try {
        // previous question/answer pairs, oldest first, so follow-ups ("and in Bihar?") work
        const history = [];
        for (let i = 1; i + 1 < msgs.length; i += 2) {
          if (msgs[i].role === "user" && msgs[i + 1].role === "bot") {
            history.push({ role: "user", content: msgs[i].text }, { role: "assistant", content: msgs[i + 1].a.text.filter(Boolean).join("\n") });
          }
        }
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 45000);   // never leave the user waiting forever
        const r = await fetch(`${apiBase}/api/assistant`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", ...data.authHeaders },
          body: JSON.stringify({ question: text, history: history.slice(-2 * MAX_HISTORY) }) });
        clearTimeout(timer);
        if (r.ok) {
          const j = await r.json();
          a = { text: (j.answer || "").split("\n"), evidence: (j.evidence || []).map((e) => `${e.tool}(${JSON.stringify(e.input)})`), provider: j.provider };
        }
      } catch { /* fall back to offline engine */ }
    }
    if (!a) a = { ...engine.answer(text), provider: llm ? "offline engine (LLM unavailable)" : "offline engine" };
    setTimeout(() => { setMsgs((m) => [...m, { role: "bot", a }]); setBusy(false); }, llm ? 0 : 250);
  }

  return (
    <div className="p-4 grid grid-cols-[minmax(0,1fr)_300px] gap-4 h-full">
      <div className="panel flex flex-col min-h-[640px]">
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {msgs.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end gap-2"><div className="rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-[13.5px] max-w-[70%]">{m.text}</div><User size={18} className="text-muted mt-2" /></div>
          ) : <BotMsg key={i} a={m.a} data={data} />)}
          {busy && <div className="flex gap-2 items-center text-muted text-[13px]"><Bot size={18} className="text-cyan" />{llm ? "Asking the AI agent (it queries the data first)…" : "Looking it up…"}</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="border-t border-line p-3 flex gap-2">
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about skill gaps, forecasts, training or careers…" className="flex-1 !py-2.5 !text-[13.5px]" />
          <button className="rounded-xl bg-accent px-4 flex items-center gap-1.5 text-[13px] font-medium hover:brightness-110" disabled={!engine}><Send size={15} />Ask</button>
        </form>
      </div>
      <div className="space-y-4">
        <div className="panel p-4">
          <div className="flex items-center gap-1.5 font-semibold text-[14px] mb-2"><Sparkles size={15} className="text-cyan" />Try asking</div>
          <div className="space-y-1.5">{SUGGEST.map((s) => <button key={s} onClick={() => ask(s)} className="w-full text-left text-[12.5px] rounded-lg border border-line px-3 py-2 hover:border-accent text-ink2 hover:text-ink">{s}</button>)}</div>
        </div>
        <div className="panel p-4 text-[12px] text-ink2 leading-relaxed">
          <div className="font-semibold text-ink mb-1 flex items-center gap-1.5"><Database size={14} className="text-cyan" />How it stays grounded</div>
          It can only answer from SkillNet's datasets: it links states, skills and careers in your question to the data and computes the answer. With an LLM key set on the backend, an LLM agent calls the same data through tools and must cite them. {llm ? "LLM agent connected: answers come from the backend's tools." : "Running the offline engine (no LLM key needed)."}
        </div>
      </div>
    </div>
  );
}

function BotMsg({ a, data }) {
  const f = a.chart && data.forecasts.series[a.chart];
  return (
    <div className="flex gap-2.5">
      <div className="w-8 h-8 shrink-0 rounded-full grid place-items-center bg-gradient-to-br from-accent to-violet"><Bot size={16} /></div>
      <div className="glass px-4 py-3 max-w-[85%] text-[13.5px] space-y-1.5">
        {a.text.filter(Boolean).map((l, i) => <Line key={i} l={l} />)}
        {a.table && a.table.rows.length > 0 && (
          <table className="data mt-2"><thead><tr>{a.table.cols.map((c, i) => <th key={c} className={i ? "!text-right" : ""}>{c}</th>)}</tr></thead>
            <tbody>{a.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "num text-right" : "font-medium"}>{c}</td>)}</tr>)}</tbody></table>
        )}
        {f && <div className="mt-2 w-[560px] max-w-full"><ForecastChart hist={f.h} fut={f} histMonths={data.forecasts.hist_months} futMonths={data.forecasts.fut_months} height={200} /></div>}
        {a.action && data.can(a.action.page) && <button onClick={() => data.go(a.action.page, a.action.params)} className="mt-1 inline-flex items-center gap-1 text-cyan text-[12.5px]">{a.action.label}<ArrowRight size={13} /></button>}
        {a.evidence?.length > 0 && <div className="pt-2 mt-1 border-t border-line text-[11px] text-muted"><span className="eyebrow">Sources</span> {a.evidence.join(" · ")}{a.provider && ` · ${a.provider}`}</div>}
      </div>
    </div>
  );
}

function Line({ l }) {
  const bullet = l.startsWith("- ");
  const s = bullet ? l.slice(2) : l;
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => p.startsWith("**") ? <b key={i} className="text-ink">{p.slice(2, -2)}</b> : p.startsWith("*") ? <i key={i} className="text-cyan">{p.slice(1, -1)}</i> : p);
  return bullet ? <div className="flex gap-2 text-ink2"><span className="text-cyan">•</span><span>{parts}</span></div> : <div className="text-ink2">{parts}</div>;
}
