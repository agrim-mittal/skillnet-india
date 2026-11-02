"""Supply estimation (PLFS) and the Skill Gap Index.

Units are persons per year, per state x skill:
  openings(r,s)  = H(r) * D(r,s)
      H(r)  annual hires = ANNUAL_HIRE_RATE x non-farm employed persons (PLFS weights)
      D(r,s) share of the state's postings (last 12 months) that ask for skill s
  available(r,s) = sum over PLFS jobseekers of  weight x P(has s | education, technical education, training field)
                   + annual certified output of ITIs/polytechnics teaching s
  SGI(r,s)       = 100 x (openings - available) / (openings + available)     in [-100, 100]; >0 = shortage

Employed skill stock (shown on the map as "supply") = sum over employed workers of weight x P(s | NCO group),
where P(s | NCO group) is learned from postings mapped to that NCO group (occupation classifier) and
smoothed toward the taxonomy prior.
"""
import numpy as np
import pandas as pd

from .config import ANNUAL_HIRE_RATE, ITI_PASS_RATE, MIN_POSTINGS_CONFIDENT
from .reference import (CLUSTERS, GEN_EDU_TO_CLUSTER, SKILLS, TECH_EDU_TO_CLUSTER, VOC_FIELD_TO_CLUSTER)

SKILL_NAMES = [s["name"] for s in SKILLS]
SKILL_CLUSTER = {s["name"]: s["cluster"] for s in SKILLS}
CORE = {s["name"] for s in SKILLS if s["cluster"] == "CS"}
FARM = {"61", "62", "63", "92"}


def occupation_skill_profile(postings, alpha=40.0):
    """P(skill | NCO 2-digit group) from postings, Bayesian-smoothed toward the taxonomy prior."""
    occs = sorted({str(s) for sk in SKILLS for s in sk["nco_prior"]} | set(postings["nco"].astype(str)))
    prior = pd.DataFrame(0.0, index=occs, columns=SKILL_NAMES)
    for sk in SKILLS:
        for o in sk["nco_prior"]:
            prior.loc[o, sk["name"]] = 1.0
    prior = prior.div(prior.sum(1).replace(0, 1), axis=0) * 1.6   # ~1.6 domain skills per worker
    counts = pd.DataFrame(0.0, index=occs, columns=SKILL_NAMES)
    n = postings.groupby("nco").size().reindex(occs).fillna(0)
    ex = postings[["nco", "skills"]].explode("skills").dropna()
    c = ex.groupby(["nco", "skills"]).size()
    for (o, s), v in c.items():
        if s in counts.columns:
            counts.loc[str(o), s] = v
    prof = (counts + alpha * prior).div(n + alpha, axis=0)
    return prof.clip(0, 1)


def _jobseeker_cluster_mix(row):
    if row.Field_of_Training and row.Vocational_Training <= 5:
        return VOC_FIELD_TO_CLUSTER.get(int(row.Field_of_Training), {"SM": 1})
    if row.Technical_Education_Level and int(row.Technical_Education_Level) > 1:
        return TECH_EDU_TO_CLUSTER.get(int(row.Technical_Education_Level), {"SM": 1})
    e = int(row.General_Education_Level)
    return GEN_EDU_TO_CLUSTER["low" if e <= 7 else "secondary" if e <= 11 else "graduate"]


def entry_level_bundles(postings):
    """q(s | cluster): share of entry-level postings (exp<=2) in a cluster that ask for skill s."""
    p = postings[postings["exp_min"].fillna(0) <= 2]
    out = {}
    for cl, g in p.groupby("cluster"):
        ex = g["skills"].explode().dropna()
        out[cl] = (ex.value_counts() / len(g)).to_dict()
    return out


def supply_tables(plfs, postings, centres, prof):
    w = plfs["Multiplier"]
    status = plfs["Principal_Status_Code"].astype(int)
    emp = plfs[status < 81].copy()
    emp["occ2"] = (emp["NCO_2015_3d"].astype(int) // 10).astype(str)
    W = emp.groupby(["State", "occ2"])["Multiplier"].sum().unstack(fill_value=0)
    P = prof.reindex(W.columns).fillna(0)
    stock = W.dot(P)                                                # employed persons with skill s
    nonfarm = emp[~emp["occ2"].isin(FARM)].groupby("State")["Multiplier"].sum()
    labour = plfs[status < 90].groupby("State")["Multiplier"].sum()
    jobseekers = plfs[status == 81].copy()
    J = jobseekers.groupby("State")["Multiplier"].sum()
    # jobseeker skills: cluster orientation from education/training x entry-level bundle of that cluster
    bundles = entry_level_bundles(postings)
    key = jobseekers[["Vocational_Training", "Field_of_Training", "Technical_Education_Level", "General_Education_Level"]].astype(int)
    combos = key.drop_duplicates()
    combo_vec = {}
    for r in combos.itertuples(index=False):
        mix = _jobseeker_cluster_mix(r)
        v = pd.Series(0.0, index=SKILL_NAMES)
        for cl, share in mix.items():
            for s, q in bundles.get(cl, {}).items():
                if s in v.index:
                    v[s] += share * q
        combo_vec[tuple(r)] = v
    js_skill = pd.DataFrame(0.0, index=sorted(plfs["State"].unique()), columns=SKILL_NAMES)
    grp = jobseekers.assign(_k=list(map(tuple, key.values))).groupby(["State", "_k"])["Multiplier"].sum()
    for (st, k), wt in grp.items():
        js_skill.loc[st] += wt * combo_vec[k]
    # training output
    tr = pd.DataFrame(0.0, index=js_skill.index, columns=SKILL_NAMES)
    for r in centres.itertuples():
        sk = [s for s in str(r.skills).split("|") if s in tr.columns]
        if not sk or r.state not in tr.index:
            continue
        out = r.seats * r.utilisation * ITI_PASS_RATE / (2.0 if "ITI" in r.type else 3.0)  # 1-2 yr ITI, 3-yr diploma
        for s in sk:
            tr.loc[r.state, s] += out / len(sk)
    youth = plfs[(plfs["Age"] < 30) & (status < 90)].groupby("State")["Multiplier"].sum()
    youth_u = plfs[(plfs["Age"] < 30) & (status == 81)].groupby("State")["Multiplier"].sum()
    state_lab = pd.DataFrame({"employed_nonfarm": nonfarm, "labour_force": labour, "jobseekers": J,
                              "youth_unemployment_rate": (youth_u / youth).fillna(0)}).fillna(0)
    state_lab["unemployment_rate"] = state_lab["jobseekers"] / state_lab["labour_force"].replace(0, np.nan)
    return stock, js_skill, tr, state_lab


def demand_tables(postings, snapshot_end, months=12):
    end = pd.Period(snapshot_end, "M")
    m = postings["date"].dt.to_period("M")
    snap = postings[(m > end - months) & (m <= end)]
    n_state = snap.groupby("state").size()
    ex = snap[["state", "skills"]].explode("skills").dropna()
    cnt = ex.groupby(["state", "skills"]).size().unstack(fill_value=0).reindex(columns=SKILL_NAMES, fill_value=0)
    share = cnt.div(n_state, axis=0)
    return snap, cnt, share, n_state


def gap_table(cnt, share, n_state, stock, js_skill, training, state_lab):
    states = sorted(set(state_lab.index) & set(share.index))
    H = ANNUAL_HIRE_RATE * state_lab["employed_nonfarm"]
    rows = []
    for st in states:
        for s in SKILL_NAMES:
            o = float(H[st] * share.loc[st, s])
            a_js = float(js_skill.loc[st, s]) if st in js_skill.index else 0.0
            a_tr = float(training.loc[st, s]) if st in training.index else 0.0
            a = a_js + a_tr
            n = int(cnt.loc[st, s])
            sgi = 100 * (o - a) / (o + a) if (o + a) > 0 else 0.0
            rows.append({"state": st, "skill": s, "cluster": SKILL_CLUSTER[s], "postings_12m": n,
                         "demand_share_pct": round(100 * float(share.loc[st, s]), 3),
                         "openings": round(o), "available": round(a), "available_jobseekers": round(a_js),
                         "available_trained": round(a_tr), "shortage": round(o - a), "sgi": round(sgi, 1),
                         "employed_stock": round(float(stock.loc[st, s])) if st in stock.index else 0,
                         "confidence": "high" if n >= 4 * MIN_POSTINGS_CONFIDENT else "medium" if n >= MIN_POSTINGS_CONFIDENT else "low"})
    g = pd.DataFrame(rows)
    return g


def cluster_rollup(g):
    c = g[~g.skill.isin(CORE)].groupby(["state", "cluster"]).agg(openings=("openings", "sum"), available=("available", "sum"),
                                                                   postings_12m=("postings_12m", "sum")).reset_index()
    c["sgi"] = (100 * (c.openings - c.available) / (c.openings + c.available).replace(0, np.nan)).fillna(0).round(1)
    c["cluster_name"] = c["cluster"].map(CLUSTERS)
    return c
