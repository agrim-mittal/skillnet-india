"""Decision intelligence: salary premiums, priority scores, budget allocation, career role profiles."""
import numpy as np
import pandas as pd
from scipy.optimize import linprog
from scipy.sparse import csr_matrix, hstack
from sklearn.linear_model import Ridge
from sklearn.preprocessing import OneHotEncoder

from .config import DEFAULT_COMPLETION, DEFAULT_PLACEMENT
from .reference import CLUSTERS, MICRO_SKILLS, SKILL_BY_NAME

DEFAULT_WEIGHTS = {"shortage": 0.30, "sgi": 0.15, "growth": 0.20, "wage": 0.10, "training_gap": 0.15, "youth_unemployment": 0.10}


def salary_premiums(postings, min_n=150):
    """Hedonic regression: log(salary) ~ role + state + experience + year + skills. Coef on a skill = within-role pay premium."""
    d = postings.dropna(subset=["salary_min_lpa", "salary_max_lpa"]).copy()
    d = d[d["role"].notna()]
    d["y"] = np.log((d.salary_min_lpa + d.salary_max_lpa) / 2)
    skills = d["skills"].explode().value_counts()
    skills = [s for s, n in skills.items() if n >= min_n]
    sidx = {s: i for i, s in enumerate(skills)}
    rows, cols = [], []
    for i, sl in enumerate(d["skills"]):
        for s in sl:
            if s in sidx:
                rows.append(i); cols.append(sidx[s])
    S = csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(d), len(skills)))
    enc = OneHotEncoder(handle_unknown="ignore")
    C = enc.fit_transform(d[["role", "state"]].astype(str))
    num = csr_matrix(np.c_[d["exp_min"].fillna(0).values, d["date"].dt.year.values - 2021 + d["date"].dt.month.values / 12])
    X = hstack([S, C, num]).tocsr()
    m = Ridge(alpha=1.0).fit(X, d["y"].values)
    prem = pd.DataFrame({"skill": skills, "premium_pct": np.round(100 * (np.exp(m.coef_[:len(skills)]) - 1), 1),
                         "n_salaried_postings": [int(skills_n) for skills_n in d["skills"].explode().value_counts().reindex(skills).values]})
    med = {}
    ex = d[["skills", "salary_min_lpa", "salary_max_lpa"]].explode("skills")
    ex["mid"] = (ex.salary_min_lpa + ex.salary_max_lpa) / 2
    med = ex.groupby("skills")["mid"].median()
    prem["median_salary_lpa"] = prem["skill"].map(med).round(2)
    return prem.sort_values("premium_pct", ascending=False).reset_index(drop=True)


def _norm(x):
    x = np.asarray(x, float)
    lo, hi = np.nanmin(x), np.nanmax(x)
    return np.zeros_like(x) if hi - lo < 1e-12 else (x - lo) / (hi - lo)


def priority_scores(gap, growth_state_cluster, growth_skill, premiums, state_lab, weights=DEFAULT_WEIGHTS):
    g = gap[(gap.cluster != "CS") & ~gap.skill.isin(MICRO_SKILLS)].copy()
    g["growth"] = [growth_state_cluster.get((r.state, r.cluster), growth_skill.get(r.skill, 0.0)) * 0.6 + growth_skill.get(r.skill, 0.0) * 0.4
                   for r in g.itertuples()]
    prem = premiums.set_index("skill")["premium_pct"]
    g["wage_premium_pct"] = g["skill"].map(prem).fillna(0)
    g["trained_cover"] = (g["available_trained"] / g["openings"].replace(0, np.nan)).fillna(1).clip(0, 1)
    g["youth_ur"] = g["state"].map(state_lab["youth_unemployment_rate"]).fillna(0)
    comp = pd.DataFrame({
        "shortage": _norm(np.log1p(g["shortage"].clip(lower=0))),
        "sgi": g["sgi"].clip(lower=0).values / 100,
        "growth": _norm(g["growth"].clip(-0.3, 1.0)),
        "wage": _norm(g["wage_premium_pct"].clip(-5, 20)),
        "training_gap": 1 - g["trained_cover"].values,
        "youth_unemployment": _norm(g["youth_ur"]),
    }, index=g.index)
    for k in comp:
        g["c_" + k] = comp[k].round(4)
    g["priority"] = sum(weights[k] * comp[k] for k in weights).round(4) * 100
    g.loc[g["confidence"] == "low", "priority"] *= 0.6   # thin evidence -> down-weight
    g["priority"] = g["priority"].round(1)
    return g.sort_values("priority", ascending=False).reset_index(drop=True)


def optimise_budget(pr, budget_inr, completion=DEFAULT_COMPLETION, placement=DEFAULT_PLACEMENT, state_cap=None, top=400,
                    max_cohort=20000):
    """LP: maximise priority-weighted placements subject to budget, no training beyond the shortage,
    optional per-state trainee capacity. Returns allocation table."""
    fundable = pr["skill"].map(lambda s: SKILL_BY_NAME[s]["training_weeks"] >= 4)   # short add-on certs aren't standalone programmes
    cand = pr[(pr.shortage > 0) & (pr.confidence != "low") & fundable].head(top).copy()
    cost = cand["skill"].map(lambda s: max(SKILL_BY_NAME[s]["cost_inr"], 1000)).values.astype(float)
    cp = completion * placement
    value = cand["priority"].values * cp
    ub = np.minimum(cand["shortage"].values / cp, max_cohort)   # absorption: one programme can't train unlimited people a year
    A, b = [cost], [budget_inr]
    if state_cap:
        for st, cap in state_cap.items():
            A.append((cand["state"].values == st).astype(float)); b.append(cap)
    res = linprog(-value, A_ub=np.array(A), b_ub=np.array(b), bounds=list(zip(np.zeros(len(ub)), ub)), method="highs")
    cand["trainees"] = np.floor(res.x).astype(int)
    cand = cand[cand.trainees > 0].copy()
    cand["cost_inr"] = (cand["trainees"] * cand["skill"].map(lambda s: SKILL_BY_NAME[s]["cost_inr"])).astype(int)
    cand["expected_placements"] = (cand["trainees"] * cp).round().astype(int)
    return cand[["state", "skill", "cluster", "priority", "shortage", "trainees", "cost_inr", "expected_placements"]]


def role_profiles(postings, snap, growth_skill, premiums, min_n=150):
    """Career targets for students: skill bundle, pay, where demand is, how it is trending."""
    key = "role" if "role" in postings and postings["role"].notna().any() else "nco"
    out = []
    prem = premiums.set_index("skill")
    for r, g in postings[postings[key].notna()].groupby(key):
        if len(g) < min_n:
            continue
        ex = g["skills"].explode().dropna()
        bundle = (ex.value_counts() / len(g))
        bundle = bundle[bundle >= 0.08].head(10)
        sal = ((g.salary_min_lpa + g.salary_max_lpa) / 2).dropna()
        sg = snap[snap[key] == r]
        by_state = sg.groupby("state").size().sort_values(ascending=False).head(6)
        tv = g["title"].str.replace(r"^(Senior|Junior) ", "", regex=True).value_counts()
        title = tv.index[0]
        gr = float(np.average([growth_skill.get(s, 0) for s in bundle.index[:4]], weights=bundle.values[:4])) if len(bundle) else 0
        out.append({"role": r, "title": title, "titles": tv.index[:6].tolist(), "nco": str(g["nco"].mode().iloc[0]), "cluster": g["cluster"].mode().iloc[0],
                    "cluster_name": CLUSTERS.get(g["cluster"].mode().iloc[0], ""), "postings_12m": int(len(sg)),
                    "skills": [{"skill": s, "share": round(float(v), 3),
                                "training_route": SKILL_BY_NAME[s]["training_route"], "weeks": SKILL_BY_NAME[s]["training_weeks"],
                                "premium_pct": float(prem["premium_pct"].get(s, 0)) if s in prem.index else 0.0}
                               for s, v in bundle.items()],
                    "salary_p25_lpa": round(float(sal.quantile(.25)), 2) if len(sal) else None,
                    "salary_median_lpa": round(float(sal.median()), 2) if len(sal) else None,
                    "salary_p75_lpa": round(float(sal.quantile(.75)), 2) if len(sal) else None,
                    "top_states": [{"state": s, "postings_12m": int(n)} for s, n in by_state.items()],
                    "growth_12m": round(gr, 3)})
    return sorted(out, key=lambda x: -x["postings_12m"])
