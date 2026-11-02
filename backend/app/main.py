"""SkillNet India API.  Run:  uvicorn backend.app.main:app --reload --port 8000"""
import os
import time
from collections import defaultdict, deque
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import assistant, data

app = FastAPI(title="SkillNet India API", version="1.0",
              description="National skill-gap intelligence: demand (job postings + NLP), supply (PLFS), forecasts, recommendations.")
# CORS: in the single-container deploy the app and API share one origin, so no CORS is needed.
# For local dev (Vite on :5173) or a separately hosted frontend, set ALLOWED_ORIGINS="https://your-site.com,http://localhost:5173".
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["content-type"])

# Cost protection for the LLM endpoint (in-memory, resets on restart; also set a spend cap at your LLM provider).
RATE_PER_MIN = int(os.getenv("ASSISTANT_RATE_PER_MIN", "6"))      # per client IP
DAILY_CAP = int(os.getenv("ASSISTANT_DAILY_CAP", "300"))          # all users combined, per 24h
_hits: dict = defaultdict(deque)
_day: deque = deque()


def _check_limits(ip: str):
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    while _day and now - _day[0] > 86400:
        _day.popleft()
    if len(q) >= RATE_PER_MIN:
        raise HTTPException(429, "Too many questions, please wait a minute.")
    if len(_day) >= DAILY_CAP:
        raise HTTPException(429, "The assistant has reached today's usage limit. Offline mode still works.")
    q.append(now)
    _day.append(now)
    if len(_hits) > 5000:  # keep memory bounded
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > 60]:
            _hits.pop(k, None)


@app.get("/api/health")
def health():
    m = data.web("meta")
    return {"status": "ok", "generated_at": m["generated_at"], "counts": m["counts"],
            "assistant": "llm" if (os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")) else "offline"}


@app.get("/api/data/{name}")
def web_file(name: str):
    p = data.WEB / f"{name}.json"
    if not p.exists() or "/" in name:
        raise HTTPException(404)
    return FileResponse(p, media_type="application/json")


@app.get("/api/states")
def list_states():
    return data.web("states")


@app.get("/api/states/{state}")
def get_state(state: str):
    s = data.resolve(state, data.states())
    if not s:
        raise HTTPException(404, "unknown state")
    g = data.gap_rows(state=s, include_low=True)
    return {"summary": data.state_summary(s), "gap": g.sort_values("shortage", ascending=False).to_dict("records")}


@app.get("/api/gap")
def gap(state: Optional[str] = None, skill: Optional[str] = None, cluster: Optional[str] = None,
        include_low: bool = False, limit: int = 200):
    s = data.resolve(state, data.states()) if state else None
    k = data.resolve_skill(skill) if skill else None
    g = data.gap_rows(state=s, skill=k, cluster=cluster, include_low=include_low)
    return g.sort_values("shortage", ascending=False).head(limit).to_dict("records")


@app.get("/api/forecast")
def forecast(skill: Optional[str] = None, state: Optional[str] = None, cluster: Optional[str] = None):
    f = data.forecast(skill=data.resolve_skill(skill) if skill else None,
                      state=data.resolve(state, data.states()) if state else None, cluster=cluster)
    if not f:
        raise HTTPException(404, "no forecast series for that combination")
    return f


@app.get("/api/centres")
def centres(state: Optional[str] = None, skill: Optional[str] = None, lat: Optional[float] = None,
            lon: Optional[float] = None, k: int = 20):
    if os.getenv("DATABASE_URL") and lat is not None:
        return _postgis_nearest(lat, lon, skill, k)
    c = data.centres(state=data.resolve(state, data.states()) if state else None,
                     skill=data.resolve_skill(skill) if skill else None, lat=lat, lon=lon, k=k)
    return c.to_dict("records")


def _postgis_nearest(lat, lon, skill, k):
    import psycopg
    q = """SELECT name, type, state, district, seats, skills,
                  ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(%s,%s),4326)::geography)/1000 AS km
           FROM training_centres WHERE (%s IS NULL OR skills LIKE '%%' || %s || '%%')
           ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%s,%s),4326) LIMIT %s"""
    with psycopg.connect(os.environ["DATABASE_URL"]) as con:
        cur = con.execute(q, (lon, lat, skill, skill, lon, lat, k))
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]


class SimIn(BaseModel):
    state: str
    skill: str
    trainees: int = Field(1000, ge=1, le=1_000_000)
    cost_per_trainee: Optional[float] = None
    completion: float = Field(0.8, ge=0, le=1)
    placement: float = Field(0.55, ge=0, le=1)
    months: int = Field(24, ge=6, le=60)


@app.post("/api/simulate")
def simulate(p: SimIn):
    r = data.simulate(data.resolve(p.state, data.states()), data.resolve_skill(p.skill), p.trainees,
                      p.cost_per_trainee, p.completion, p.placement, p.months)
    if not r:
        raise HTTPException(404, "no gap estimate for that state/skill")
    return r


class OptIn(BaseModel):
    budget_inr: float = 5e9
    completion: float = 0.8
    placement: float = 0.55
    weights: Optional[dict] = None
    state_caps: Optional[dict] = None
    max_cohort: int = 20000


@app.post("/api/optimise")
def optimise(p: OptIn):
    import sys
    sys.path.insert(0, str(data.ROOT))
    from pipeline import recommend
    pr = data.table("priority")
    if p.weights:
        w = {**recommend.DEFAULT_WEIGHTS, **p.weights}
        tot = sum(w.values()) or 1
        pr = pr.copy()
        pr["priority"] = sum((w[k] / tot) * pr["c_" + k] for k in w) * 100
        pr.loc[pr.confidence == "low", "priority"] *= 0.6
        pr = pr.sort_values("priority", ascending=False)
    a = recommend.optimise_budget(pr, p.budget_inr, p.completion, p.placement, p.state_caps, max_cohort=p.max_cohort)
    return {"allocation": a.to_dict("records"), "total_cost_inr": int(a.cost_inr.sum()),
            "expected_placements": int(a.expected_placements.sum()), "trainees": int(a.trainees.sum())}


class CareerIn(BaseModel):
    role: str
    skills: list[str] = []
    state: Optional[str] = None


@app.post("/api/career")
def career(p: CareerIn):
    role = data.resolve_role(p.role)
    if not role:
        raise HTTPException(404, "unknown role")
    have = {data.resolve_skill(s) for s in p.skills} - {None}
    need = role["skills"]
    match = sum(s["share"] for s in need if s["skill"] in have) / max(sum(s["share"] for s in need), 1e-9)
    missing = [s for s in need if s["skill"] not in have]
    st = data.resolve(p.state, data.states()) if p.state else None
    centres = []
    if st:
        for s in missing[:4]:
            c = data.centres(state=st, skill=s["skill"], k=3)
            centres += [{"skill": s["skill"], **r} for r in c[["name", "district", "seats"]].to_dict("records")]
    return {"role": role, "match_pct": round(100 * match), "missing": missing, "centres": centres}


class AskIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=500)


@app.post("/api/assistant")
def ask(p: AskIn, request: Request):
    # Check for a configured LLM first so unconfigured deployments never count against limits.
    if not (os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")):
        raise HTTPException(503, "No LLM configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY). The web app uses its offline engine.")
    _check_limits(request.client.host if request.client else "unknown")
    r = assistant.answer(p.question, None)  # client-supplied history is ignored on purpose
    if r is None:
        raise HTTPException(503, "No LLM configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY). The web app uses its offline engine.")
    return r


# serve the built frontend if present (single-container deploy)
_dist = data.ROOT / "frontend" / "dist"
if _dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_dist, html=True), name="web")
