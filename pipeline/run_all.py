"""End-to-end pipeline: ingest -> NLP -> occupation mapping -> supply & gap -> forecasts -> recommendations -> export.

    python -m pipeline.run_all            # full run
    python -m pipeline.run_all --fast     # smaller GRU/XGB budgets for quick iteration
"""
import json
import sys
import time
from datetime import datetime

import numpy as np
import pandas as pd

from . import forecast as fc
from . import gap as gp
from . import geo, ingest, nlp, occupation, recommend, synth
from .config import (DEFAULT_COMPLETION, DEFAULT_PLACEMENT, ANNUAL_HIRE_RATE, ITI_PASS_RATE, HISTORY_END, PROC,
                     SNAPSHOT_MONTHS, WEB)
from .reference import CLUSTERS, NCO_GROUPS, SKILLS

T0 = time.time()


def log(*a):
    print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)


def _r(x, n=1):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def _clean(o):
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if hasattr(o, "item"):
        o = o.item()
    if isinstance(o, float) and (np.isnan(o) or np.isinf(o)):
        return None
    return o


def dump(name, obj):
    with open(WEB / f"{name}.json", "w") as f:
        json.dump(_clean(obj), f, separators=(",", ":"), allow_nan=False, default=str)
    log(f"  wrote {name}.json ({(WEB / f'{name}.json').stat().st_size / 1e3:.0f} KB)")


def main():
    provenance = []
    # ------------------------------------------------------------------ 1. ingest
    log("1/9 ingest")
    real_files = ingest.real_job_files()
    frames = []
    if real_files:
        for f in real_files:
            d = ingest.load_job_csv(f); frames.append(d)
            provenance.append({"dataset": f"Job postings: {f.name}", "type": "real", "rows": len(d), "use": "Demand"})
    syn = synth.generate_postings()
    frames.append(syn)
    provenance.append({"dataset": "Multi-sector job postings, Jan 2021 - Oct 2026", "type": "synthetic", "rows": len(syn),
                       "use": "Demand (all sectors, monthly history for forecasting)",
                       "note": "Generated to Naukri-style schema (title, JD, key skills, location, salary). Replace via data/raw/jobs/"})
    ds = ingest.load_github_ds_jobs()
    frames.append(ds)
    provenance.append({"dataset": "India data & analytics job postings 2025 (LinkedIn/Indeed)", "type": "real", "rows": len(ds),
                       "use": "Demand snapshot, NLP validation, skill co-occurrence",
                       "source": "github.com/AlokTheDataGuy/Data-Science-Jobs-Analytics"})
    jobs = pd.concat(frames, ignore_index=True)
    jobs = jobs[jobs["state"].notna() & jobs["date"].notna()].reset_index(drop=True)
    if "dt_code" not in jobs or jobs["dt_code"].isna().all():
        jobs["dt_code"] = None
    miss = jobs["dt_code"].isna()
    jobs.loc[miss, "dt_code"] = [geo.geocode(c, s)[1] for c, s in zip(jobs.loc[miss, "city"], jobs.loc[miss, "state"])]
    log(f"  postings: {len(jobs):,} ({(jobs.source != 'synthetic').sum():,} real)")

    plfs = ingest.load_plfs()
    if plfs is None:
        plfs = synth.generate_plfs()
        provenance.append({"dataset": "Workforce sample in PLFS person-level format", "type": "synthetic", "rows": len(plfs),
                           "use": "Supply: employed occupations, jobseekers, education, vocational training",
                           "note": "Same fields/codes as PLFS cperv1 (State, NCO-2015, education, training field, Multiplier). Replace via data/raw/plfs/"})
    else:
        provenance.append({"dataset": "PLFS person-level file", "type": "real", "rows": len(plfs), "use": "Supply"})
    centres = ingest.load_centres()
    if centres is None:
        centres = synth.generate_training_centres()
        provenance.append({"dataset": "ITIs and polytechnics with trades, seats, location", "type": "synthetic", "rows": len(centres),
                           "use": "Training infrastructure, training output in supply",
                           "note": "Real DGT trade names; counts close to national totals. Replace via data/raw/training_centres.csv"})
    provenance += [
        {"dataset": "District boundaries (Census 2011 codes, incl. Telangana & Ladakh)", "type": "real", "rows": len(geo.districts()),
         "use": "Map", "source": "github.com/udit-001/india-maps-data"},
        {"dataset": "Census 2011 state, district & city population and coordinates", "type": "real", "rows": 738 + 523,
         "use": "Geocoding postings, per-capita normalisation", "source": "github.com/recurze/IndianCities"},
        {"dataset": "Skill taxonomy (132 skills, aliases, training routes) + NCO-2015 groups + DGT ITI trades", "type": "reference",
         "rows": len(SKILLS), "use": "NLP vocabulary and the demand-supply bridge", "source": "pipeline/reference.py"},
    ]

    # ------------------------------------------------------------------ 2. NLP
    log("2/9 NLP skill extraction")
    ex = nlp.SkillExtractor()
    jobs = ex.run(jobs)
    syn_mask = jobs.source == "synthetic"
    nlp_eval = nlp.evaluate_synthetic(jobs[syn_mask].sample(40000, random_state=0))
    real_eval = nlp.evaluate_against_reference(jobs[jobs.source == "real:linkedin_indeed_2025"], ex)
    log("  synthetic eval", nlp_eval, "| real vs reference", real_eval)
    emerg = nlp.emerging_terms(jobs)
    log("  emerging terms:", emerg.head(8).term.tolist())
    cooc = nlp.cooccurrence(jobs["skills"])
    w2v = nlp.train_skill2vec(jobs["skills"])
    neigh = nlp.skill_neighbours(w2v, cooc)

    # ------------------------------------------------------------------ 3. occupation mapping
    log("3/9 occupation classifier (title -> NCO-2015)")
    occ_model, occ_metrics = occupation.train_and_evaluate(jobs[syn_mask])
    log("  ", occ_metrics)
    nco_pred, nco_conf = occ_model.predict(jobs["title"], jobs["skills"])
    jobs["nco"] = nco_pred
    jobs["nco_conf"] = nco_conf
    # cluster for real postings = dominant cluster of extracted skills (fallback by NCO)
    skill_cluster = {s["name"]: s["cluster"] for s in SKILLS}
    nco_cluster = jobs[syn_mask].groupby("nco")["cluster"].agg(lambda x: x.mode().iloc[0]).to_dict()

    def dom_cluster(sk, n):
        c = pd.Series([skill_cluster[s] for s in sk if skill_cluster[s] != "CS"])
        return c.mode().iloc[0] if len(c) else nco_cluster.get(n, "SM")
    m = jobs["cluster"].isna()
    jobs.loc[m, "cluster"] = [dom_cluster(s, n) for s, n in zip(jobs.loc[m, "skills"], jobs.loc[m, "nco"])]

    # ------------------------------------------------------------------ 4. supply & gap
    log("4/9 supply (PLFS) and gap index")
    snap, cnt, share, n_state = gp.demand_tables(jobs, HISTORY_END, SNAPSHOT_MONTHS)
    prof = gp.occupation_skill_profile(jobs[jobs.date.dt.to_period("M") > pd.Period(HISTORY_END, "M") - 24])
    stock, js_skill, training, state_lab = gp.supply_tables(plfs, jobs, centres, prof)
    gap = gp.gap_table(cnt, share, n_state, stock, js_skill, training, state_lab)
    log(f"  gap rows {len(gap)}; national shortage share {(gap.shortage > 0).mean():.2f}")

    # ------------------------------------------------------------------ 5. forecasting
    log("5/9 forecasting (backtest 4 models + ensemble)")
    series, months = fc.build_series(jobs[syn_mask])
    log(f"  series: {len(series)} ({sum(i.startswith('skill::') for i in series.index)} skill, rest state x cluster) x {len(months)} months")
    bt, hold_preds, hold_actual, names = fc.backtest(series, months, log=log)
    log("\n" + bt.to_string())
    best = bt.iloc[0]["model"]
    names, P, lo, hi, fut = fc.final_forecast(series, months, best, hold_preds, hold_actual)
    hist = series.loc[names].values
    growth = (P.sum(1) + 1) / (hist[:, -12:].sum(1) + 1) - 1
    g_skill = {n.split("::", 1)[1]: float(g) for n, g in zip(names, growth) if n.startswith("skill::")}
    g_sc = {(n.split("::")[1], n.split("::")[2]): float(g) for n, g in zip(names, growth) if n.startswith("sc::")}

    # future gap
    gap["growth_12m"] = [g_sc.get((r.state, r.cluster), g_skill.get(r.skill, 0.0)) * 0.6 + g_skill.get(r.skill, 0.0) * 0.4 for r in gap.itertuples()]
    gap["openings_next12"] = (gap["openings"] * (1 + gap["growth_12m"])).round()
    gap["available_next12"] = (gap["available"] * 1.03).round()
    tot = gap["openings_next12"] + gap["available_next12"]
    gap["sgi_next12"] = (100 * (gap["openings_next12"] - gap["available_next12"]) / tot.replace(0, np.nan)).fillna(0).round(1)

    # ------------------------------------------------------------------ 6. salary premiums
    log("6/9 salary premium model")
    prem = recommend.salary_premiums(jobs[syn_mask])
    truth = pd.Series(synth.SALARY_PREMIUM).sub(1).mul(100)
    chk = prem.set_index("skill")["premium_pct"].reindex(truth.index).dropna()
    sal_valid = {"model": "Ridge hedonic regression: log(salary) ~ role + state + experience + time + skills",
                 "n_salaried_postings": int(jobs[syn_mask].salary_min_lpa.notna().sum()),
                 "recovery_corr_vs_planted": round(float(np.corrcoef(chk.values, truth.reindex(chk.index).values)[0, 1]), 3),
                 "mean_abs_error_pp": round(float((chk - truth.reindex(chk.index)).abs().mean()), 2)}
    log("  ", sal_valid)

    # ------------------------------------------------------------------ 7. priorities, optimiser, careers
    log("7/9 priorities, budget optimiser, career profiles")
    pr = recommend.priority_scores(gap, g_sc, g_skill, prem, state_lab)
    alloc = recommend.optimise_budget(pr, 500e7)   # Rs 500 crore
    roles = recommend.role_profiles(jobs[syn_mask], snap[snap.source == "synthetic"], g_skill, prem)

    # ------------------------------------------------------------------ 8. persist
    log("8/9 persist processed tables")
    keep = ["job_id", "source", "title", "company", "state", "dt_code", "city", "date", "skills", "new_terms", "nco", "nco_conf",
            "cluster", "salary_min_lpa", "salary_max_lpa", "exp_min", "role"]
    jobs[keep].to_parquet(PROC / "postings.parquet")
    gap.to_parquet(PROC / "gap.parquet"); pr.to_parquet(PROC / "priority.parquet")
    centres.to_parquet(PROC / "centres.parquet"); state_lab.to_parquet(PROC / "state_labour.parquet")
    prem.to_parquet(PROC / "salary_premiums.parquet"); emerg.to_parquet(PROC / "emerging_terms.parquet")
    plfs.to_parquet(PROC / "plfs.parquet")

    # ------------------------------------------------------------------ 9. export for web
    log("9/9 export web JSON")
    export(jobs, snap, gap, pr, alloc, roles, prem, emerg, neigh, centres, state_lab, series, months, names, P, lo, hi, fut,
           bt, hold_preds, hold_actual, g_skill, g_sc, provenance, nlp_eval, real_eval, occ_metrics, sal_valid, best)
    log("done")


def export(jobs, snap, gap, pr, alloc, roles, prem, emerg, neigh, centres, state_lab, series, months, names, P, lo, hi, fut,
           bt, hold_preds, hold_actual, g_skill, g_sc, provenance, nlp_eval, real_eval, occ_metrics, sal_valid, best):
    states = sorted(gap.state.unique())
    sidx = {s: i for i, s in enumerate(states)}
    skills = [s["name"] for s in SKILLS]
    kidx = {s: i for i, s in enumerate(skills)}

    st_geo, dt_geo = geo.web_geojson(0.012)
    dump("geo_states", st_geo)
    dump("geo_districts", dt_geo)

    # skills
    nat = gap.groupby("skill").agg(openings=("openings", "sum"), available=("available", "sum"), postings=("postings_12m", "sum"))
    nat["sgi"] = 100 * (nat.openings - nat.available) / (nat.openings + nat.available).replace(0, np.nan)
    premi = prem.set_index("skill")
    sk_out = []
    for s in SKILLS:
        n = s["name"]
        sk_out.append({"id": s["id"], "name": n, "cluster": s["cluster"], "route": s["training_route"], "weeks": s["training_weeks"],
                       "cost": s["cost_inr"], "postings12": int(nat.loc[n, "postings"]), "openings": int(nat.loc[n, "openings"]),
                       "available": int(nat.loc[n, "available"]), "sgi": _r(nat.loc[n, "sgi"]),
                       "growth": _r(g_skill.get(n), 3), "premium": _r(premi["premium_pct"].get(n)) if n in premi.index else None,
                       "salary": _r(premi["median_salary_lpa"].get(n), 2) if n in premi.index else None,
                       "neighbours": [x["skill"] for x in neigh.get(n, [])][:8]})
    dump("skills", {"clusters": CLUSTERS, "skills": sk_out})
    dump("taxonomy", [{"name": s["name"], "pattern": s["pattern"]} for s in SKILLS])   # assistant entity linking

    # gap (columnar)
    gg = gap.copy()
    cols = {"s": gg.state.map(sidx).tolist(), "k": gg.skill.map(kidx).tolist(), "o": gg.openings.astype(int).tolist(),
            "a": gg.available.astype(int).tolist(), "aj": gg.available_jobseekers.astype(int).tolist(),
            "at": gg.available_trained.astype(int).tolist(), "sgi": gg.sgi.tolist(), "n": gg.postings_12m.astype(int).tolist(),
            "c": gg.confidence.map({"low": 0, "medium": 1, "high": 2}).tolist(), "st": gg.employed_stock.astype(int).tolist(),
            "g": gg.growth_12m.round(3).tolist(), "o2": gg.openings_next12.astype(int).tolist(), "sgi2": gg.sgi_next12.tolist()}
    dump("gap", {"states": states, "skills": skills, "cols": cols})

    # states summary
    core = gp.CORE
    st_out = []
    cent = centres.groupby("state").agg(centres=("centre_id", "count"), seats=("seats", "sum"))
    for st in states:
        g = gap[(gap.state == st) & ~gap.skill.isin(core)]
        o, a = g.openings.sum(), g.available.sum()
        o2, a2 = g.openings_next12.sum(), g.available_next12.sum()
        conf = g[g.confidence != "low"]
        short = conf.sort_values("shortage", ascending=False).head(6)
        surp = conf.sort_values("shortage").head(4)
        lab = state_lab.loc[st] if st in state_lab.index else None
        gs = [v for (s, c), v in g_sc.items() if s == st]
        st_out.append({"state": st, "postings12": int(snap[snap.state == st].shape[0]), "openings": int(o), "available": int(a),
                       "sgi": _r(100 * (o - a) / (o + a)) if o + a else 0, "sgi_next12": _r(100 * (o2 - a2) / (o2 + a2)) if o2 + a2 else 0,
                       "growth": _r(np.mean(gs), 3) if gs else None,
                       "labour_force": int(lab.labour_force) if lab is not None else 0, "jobseekers": int(lab.jobseekers) if lab is not None else 0,
                       "ur": _r(100 * lab.unemployment_rate, 1) if lab is not None else None,
                       "youth_ur": _r(100 * lab.youth_unemployment_rate, 1) if lab is not None else None,
                       "employed_nonfarm": int(lab.employed_nonfarm) if lab is not None else 0,
                       "centres": int(cent.centres.get(st, 0)), "seats": int(cent.seats.get(st, 0)),
                       "top_shortages": [{"skill": r.skill, "shortage": int(r.shortage), "sgi": r.sgi} for r in short.itertuples()],
                       "top_surpluses": [{"skill": r.skill, "shortage": int(r.shortage), "sgi": r.sgi} for r in surp.itertuples()],
                       "pop2011": int(geo.states().set_index("state").pop2011.get(st, 0))})
    dump("states", st_out)

    # cluster rollup
    cr = gp.cluster_rollup(gap)
    dump("clusters", cr.assign(growth=[g_sc.get((r.state, r.cluster)) for r in cr.itertuples()]).round(3).to_dict("records"))

    # districts
    d = geo.districts()
    s12 = snap.copy()
    dcnt = s12.groupby("dt_code").size()
    dcl = s12.groupby(["dt_code", "cluster"]).size().unstack(fill_value=0)
    dcent = centres.groupby("dt_code").agg(n=("centre_id", "count"), seats=("seats", "sum"))
    d_out = []
    for r in d.itertuples():
        row = {"code": r.dt_code, "name": r.district, "state": r.state, "pop": int(r.pop2011), "postings12": int(dcnt.get(r.dt_code, 0)),
               "centres": int(dcent.n.get(r.dt_code, 0)), "seats": int(dcent.seats.get(r.dt_code, 0))}
        if r.dt_code in dcl.index:
            row["byCluster"] = {k: int(v) for k, v in dcl.loc[r.dt_code].items() if v}
        d_out.append(row)
    dump("districts", d_out)

    # centres (compact)
    types = sorted(centres["type"].unique())
    dump("centres", {"types": types, "states": states, "skills": skills,
                     "rows": [[round(r.lon, 3), round(r.lat, 3), types.index(r.type), sidx.get(r.state, -1), r.district, int(r.seats),
                               [kidx[s] for s in str(r.skills).split("|") if s in kidx], r.utilisation]
                              for r in centres.itertuples()]})

    # forecasts
    hist_n = 36
    labels_hist = [str(m) for m in months[-hist_n:]]
    labels_fut = [str(m) for m in fut]
    fco = {"hist_months": labels_hist, "fut_months": labels_fut, "model": best, "series": {}}
    for i, n in enumerate(names):
        fco["series"][n] = {"h": series.loc[n].values[-hist_n:].astype(int).tolist(), "f": np.round(P[i]).astype(int).tolist(),
                            "lo": np.round(lo[i]).astype(int).tolist(), "hi": np.round(hi[i]).astype(int).tolist(),
                            "g": round(float((P[i].sum() + 1) / (series.loc[n].values[-12:].sum() + 1) - 1), 3)}
    dump("forecasts", fco)

    # backtest detail for the methodology page: a few example series
    examples = {}
    pick = [n for n in names if n in ("skill::Generative AI", "skill::Solar PV Installation", "skill::Nursing", "skill::Telecalling / Voice Process",
                                      "skill::Semiconductor Fab & OSAT", "sc::Punjab::AG", "sc::Gujarat::EL", "sc::Karnataka::DA")]
    for n in pick:
        i = names.index(n)
        examples[n] = {"actual": hold_actual[i].astype(int).tolist(),
                       "preds": {k: np.round(v[i]).astype(int).tolist() for k, v in hold_preds.items()},
                       "train_tail": series.loc[n].values[-36:-12].astype(int).tolist()}
    hold_months = [str(m) for m in months[-12:]]

    # emerging
    top_g = sorted(((s, g) for s, g in g_skill.items() if s not in core), key=lambda x: -x[1])
    dump("emerging", {"new_terms": emerg.head(15).to_dict("records"),
                      "rising": [{"skill": s, "growth": round(g, 3)} for s, g in top_g[:12]],
                      "declining": [{"skill": s, "growth": round(g, 3)} for s, g in top_g[::-1][:8]]})

    # priority (columnar with components)
    p = pr
    dump("priority", {"states": states, "skills": skills, "weights": recommend.DEFAULT_WEIGHTS,
                      "cols": {"s": p.state.map(sidx).tolist(), "k": p.skill.map(kidx).tolist(), "p": p.priority.tolist(),
                               "short": p.shortage.astype(int).tolist(), "sgi": p.sgi.tolist(), "g": p.growth.round(3).tolist(),
                               "wp": p.wage_premium_pct.round(1).tolist(), "tc": p.trained_cover.round(3).tolist(),
                               "yu": p.youth_ur.round(3).tolist(), "conf": p.confidence.map({"low": 0, "medium": 1, "high": 2}).tolist(),
                               **{"c_" + k: p["c_" + k].round(3).tolist() for k in recommend.DEFAULT_WEIGHTS}},
                      "default_allocation": alloc.to_dict("records")})
    dump("roles", roles)
    dump("salary", prem.to_dict("records"))

    meta = {
        "generated_at": datetime.now().isoformat(timespec="minutes"),
        "snapshot": f"{pd.Period(HISTORY_END, 'M') - SNAPSHOT_MONTHS + 1} to {HISTORY_END}",
        "history": f"{months[0]} to {months[-1]}",
        "counts": {"postings": int(len(jobs)), "postings_real": int((jobs.source != "synthetic").sum()), "skills": len(SKILLS),
                   "states": len(states), "districts": len(d), "centres": int(len(centres)), "nco_groups": len(NCO_GROUPS)},
        "assumptions": {"annual_hire_rate": ANNUAL_HIRE_RATE, "iti_pass_rate": ITI_PASS_RATE, "completion": DEFAULT_COMPLETION,
                        "placement": DEFAULT_PLACEMENT, "supply_growth": 0.03},
        "provenance": provenance,
        "models": {
            "skill_extraction": {"method": "Taxonomy regex matcher (132 skills, ~520 aliases) + RapidFuzz tag normaliser", **nlp_eval,
                                 "real_data_agreement": real_eval},
            "occupation": occ_metrics,
            "forecast": {"chosen": best, "holdout_months": hold_months, "table": bt.to_dict("records"), "examples": examples},
            "salary": sal_valid,
            "skill2vec": {"method": "Word2Vec skip-gram (48-d) on skill sequences of all postings", "vocab": len(neigh)},
            "emerging": {"method": "Unmatched recruiter tags ranked by share growth, last 6 months vs prior 12",
                         "planted_terms": list(synth.NEW_TERMS), "found_top8": emerg.head(8).term.tolist() if len(emerg) else []},
            "priority": {"method": "Transparent weighted index of 6 normalised components; weights editable in UI", "weights": recommend.DEFAULT_WEIGHTS},
            "optimiser": {"method": "Linear programme (HiGHS): maximise priority-weighted placements s.t. budget and shortage caps",
                          "default_budget_inr": 5e9, "allocated_rows": int(len(alloc)),
                          "expected_placements": int(alloc.expected_placements.sum()) if len(alloc) else 0},
        },
        "nco_groups": NCO_GROUPS,
    }
    dump("meta", meta)


if __name__ == "__main__":
    main()
