"""SkillNet India API.  Run:  uvicorn backend.app.main:app --reload --port 8000"""
import os
from typing import Optional

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import assistant, auth, data
from .auth import current_user, require_roles

app = FastAPI(title="SkillNet India API", version="1.0",
              description="National skill-gap intelligence: demand (job postings + NLP), supply (PLFS), forecasts, recommendations.")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
auth.init_db()

GOV = ("government",)
ANALYSTS = ("government", "college")
CAREER = ("government", "college", "student")


# ------------------------------------------------------------------ authentication
@app.post("/api/auth/register")
def register(p: auth.RegisterIn):
    return auth.register(p)


@app.post("/api/auth/login")
def login(p: auth.LoginIn):
    return auth.login(p)


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return user


@app.get("/api/auth/roles")
def roles():
    return {k: {"label": v["label"], "pages": v["pages"], "self_service": k in auth.SELF_SERVICE_ROLES} for k, v in auth.ROLES.items()}


@app.get("/api/health")
def health():
    m = data.web("meta")
    return {"status": "ok", "generated_at": m["generated_at"], "counts": m["counts"],
            "assistant": "llm" if (os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")) else "offline",
            "auth": "jwt", "auth_secret_persistent": not auth.SECRET_IS_EPHEMERAL}


@app.get("/api/data/{name}")
def web_file(name: str):
    p = data.WEB / f"{name}.json"
    if not p.exists() or "/" in name:
        raise HTTPException(404)
    return FileResponse(p, media_type="application/json")


@app.get("/api/states")
def list_states(user=Depends(current_user)):
    return data.web("states")


@app.get("/api/states/{state}")
def get_state(state: str, user=Depends(current_user)):
    s = data.resolve(state, data.states())
    if not s:
        raise HTTPException(404, "unknown state")
    g = data.gap_rows(state=s, include_low=True)
    return {"summary": data.state_summary(s), "gap": g.sort_values("shortage", ascending=False).to_dict("records")}


@app.get("/api/gap")
def gap(state: Optional[str] = None, skill: Optional[str] = None, cluster: Optional[str] = None,
        include_low: bool = False, limit: int = 200, user=Depends(current_user)):
    s = data.resolve(state, data.states()) if state else None
    k = data.resolve_skill(skill) if skill else None
    g = data.gap_rows(state=s, skill=k, cluster=cluster, include_low=include_low)
    return g.sort_values("shortage", ascending=False).head(limit).to_dict("records")


@app.get("/api/forecast")
def forecast(skill: Optional[str] = None, state: Optional[str] = None, cluster: Optional[str] = None, user=Depends(current_user)):
    f = data.forecast(skill=data.resolve_skill(skill) if skill else None,
                      state=data.resolve(state, data.states()) if state else None, cluster=cluster)
    if not f:
        raise HTTPException(404, "no forecast series for that combination")
    return f


@app.get("/api/centres")
def centres(state: Optional[str] = None, skill: Optional[str] = None, lat: Optional[float] = None,
            lon: Optional[float] = None, k: int = 20, user=Depends(current_user)):
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
def simulate(p: SimIn, user=Depends(require_roles(*ANALYSTS))):
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
def optimise(p: OptIn, user=Depends(require_roles(*GOV))):
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
def career(p: CareerIn, user=Depends(require_roles(*CAREER))):
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
    question: str
    history: list = []


@app.post("/api/assistant")
def ask(p: AskIn, user=Depends(current_user)):
    try:
        r = assistant.answer(p.question[:2000], p.history)
    except Exception as e:   # bad key, model name, timeout, provider outage -> the web app falls back to its offline engine
        raise HTTPException(502, f"LLM call failed: {type(e).__name__}: {str(e)[:300]}")
    if r is None:
        raise HTTPException(503, "No LLM configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY). The web app uses its offline engine.")
    if not (r.get("answer") or "").strip():
        raise HTTPException(502, "LLM returned an empty answer.")
    return r


# serve the built frontend if present (single-container deploy)
_dist = data.ROOT / "frontend" / "dist"
if _dist.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_dist, html=True), name="web")
