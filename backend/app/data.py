"""Loads processed pipeline outputs once and exposes query helpers used by the API and the AI assistant."""
import json
import math
from functools import lru_cache
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "data" / "processed"
WEB = ROOT / "frontend" / "public" / "data"


@lru_cache(None)
def web(name):
    return json.load(open(WEB / f"{name}.json"))


@lru_cache(None)
def table(name):
    return pd.read_parquet(PROC / f"{name}.parquet")


def skills_meta():
    return {s["name"]: s for s in web("skills")["skills"]}


def resolve(name, choices):
    """Fuzzy-resolve a user-typed state/skill/role name: exact > substring > token-set fuzzy."""
    from rapidfuzz import fuzz, process
    if not name:
        return None
    n = str(name).strip().lower()
    for c in choices:
        if c.lower() == n:
            return c
    subs = [c for c in choices if n in c.lower()]
    if subs:
        return min(subs, key=len)
    m = process.extractOne(n, choices, scorer=fuzz.token_set_ratio, score_cutoff=75) or \
        process.extractOne(n, choices, scorer=fuzz.WRatio, score_cutoff=80)
    return m[0] if m else None


@lru_cache(None)
def _extractor():
    import sys
    sys.path.insert(0, str(ROOT))
    from pipeline.nlp import SkillExtractor
    return SkillExtractor()


ALIASES = {"nurse": "Nursing", "welder": "Welding", "chip": "Semiconductor Fab & OSAT", "ev": "EV Battery & Powertrain",
           "solar": "Solar PV Installation", "plumber": "Plumbing", "drone": "Precision Farming & Agri-Drones", "cook": "Food Production (Cook/Chef)",
           "chef": "Food Production (Cook/Chef)", "tailor": "Sewing Machine Operation", "ai": "Generative AI", "caregiver": "Home Health & Elderly Care"}


def resolve_skill(name):
    """Skill names via the NLP taxonomy first (so 'genai', 'tally prime', 'plc' work), then plurals/aliases, then fuzzy."""
    if not name:
        return None
    n = str(name).strip()
    for cand in (n, " ".join(w[:-1] if w.lower().endswith("s") and len(w) > 3 else w for w in n.split())):
        hit = sorted(_extractor().extract(cand))
        if hit:
            return hit[0]
    for w in n.lower().replace("s ", " ").split():
        w = w.rstrip("s") if len(w) > 3 else w
        if w in ALIASES:
            return ALIASES[w]
    return resolve(n, skill_names())


def resolve_role(name):
    roles = web("roles")
    lookup = {t: r["title"] for r in roles for t in [r["title"], *r.get("titles", []), r["role"].replace("_", " ")]}
    t = resolve(name, list(lookup))
    return next((r for r in roles if r["title"] == lookup.get(t)), None)


def states():
    return sorted(table("gap").state.unique())


def skill_names():
    return list(skills_meta())


def gap_rows(state=None, skill=None, cluster=None, include_low=False, include_core=False):
    g = table("gap")
    if state:
        g = g[g.state == state]
    if skill:
        g = g[g.skill == skill]
    if cluster:
        g = g[g.cluster == cluster]
    if not include_low:
        g = g[g.confidence != "low"]
    if not include_core:
        g = g[g.cluster != "CS"]
    return g


def state_summary(state):
    for s in web("states"):
        if s["state"] == state:
            return s
    return None


def forecast(skill=None, state=None, cluster=None):
    f = web("forecasts")
    key = f"skill::{skill}" if skill else f"sc::{state}::{cluster}"
    s = f["series"].get(key)
    if not s:
        return None
    return {"series": key, "model": f["model"], "hist_months": f["hist_months"], "fut_months": f["fut_months"], **s}


def haversine(lat1, lon1, lat2, lon2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def centres(state=None, skill=None, lat=None, lon=None, k=10):
    c = table("centres")
    if state:
        c = c[c.state == state]
    if skill:
        c = c[c.skills.str.contains(skill, regex=False)]
    c = c.copy()
    if lat is not None and lon is not None:
        c["km"] = [haversine(lat, lon, a, b) for a, b in zip(c.lat, c.lon)]
        c = c.sort_values("km")
    else:
        c = c.sort_values("seats", ascending=False)
    return c.head(k)


def centre_count(state, skill):
    c = table("centres")
    return int(((c.state == state) & c.skills.str.contains(skill, regex=False)).sum())


def simulate(state, skill, trainees, cost_per_trainee=None, completion=0.8, placement=0.55, months=24):
    g = table("gap")
    row = g[(g.state == state) & (g.skill == skill)]
    if row.empty:
        return None
    r = row.iloc[0]
    meta = skills_meta()[skill]
    cost = cost_per_trainee if cost_per_trainee is not None else meta["cost"]
    train_m = max(1, math.ceil(meta["weeks"] / 4.33))
    placed_total = trainees * completion * placement
    base, interv, cum_b, cum_i = [], [], 0.0, 0.0
    for t in range(1, months + 1):
        o = r.openings / 12 * (1 + r.growth_12m) ** (t / 12)
        a = r.available / 12 * 1.03 ** (t / 12)
        extra = placed_total / 3 if train_m < t <= train_m + 3 else 0.0
        cum_b += max(o - a, 0)
        cum_i += max(o - a - extra, 0) if o - a > 0 else 0
        base.append(round(cum_b)); interv.append(round(cum_i))
    shortage = max(r.shortage, 0)
    salary = meta.get("salary") or 2.5
    return {"state": state, "skill": skill, "annual_shortage": int(shortage), "openings": int(r.openings), "available": int(r.available),
            "growth_12m": float(r.growth_12m), "trainees": trainees, "completers": round(trainees * completion),
            "placed": round(placed_total), "gap_closed_pct": round(100 * min(placed_total / shortage, 1), 1) if shortage else 100.0,
            "cost_inr": round(trainees * cost), "cost_per_placement_inr": round(trainees * cost / max(placed_total, 1)),
            "annual_wage_uplift_inr": round(placed_total * salary * 1e5), "months_to_first_placement": train_m + 1,
            "trajectory": {"month": list(range(1, months + 1)), "baseline_cum_unfilled": base, "with_programme_cum_unfilled": interv}}
