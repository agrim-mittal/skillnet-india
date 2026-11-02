// Data layer: loads the pipeline's JSON exports (static files or the FastAPI backend) and builds lookups.
import { createContext, useContext } from "react";

const API = import.meta.env.VITE_API_URL || "";
const url = (name) => (API ? `${API}/api/data/${name}` : `./data/${name}.json`);

export async function loadAll() {
  const names = ["meta", "skills", "gap", "states", "clusters", "districts", "forecasts", "emerging", "priority", "roles", "salary", "geo_states", "geo_districts"];
  const parts = await Promise.all(names.map((n) => fetch(url(n)).then((r) => r.json())));
  const d = Object.fromEntries(names.map((n, i) => [n, parts[i]]));
  return build(d);
}

export async function loadCentres() {
  const c = await fetch(url("centres")).then((r) => r.json());
  return c.rows.map(([lon, lat, t, s, district, seats, skills, util]) => ({
    lon, lat, type: c.types[t], state: c.states[s], district, seats, skills: skills.map((k) => c.skills[k]), util, name: `${c.types[t]}, ${district}`,
  }));
}

function build(d) {
  const skills = d.skills.skills;
  const skillBy = Object.fromEntries(skills.map((s) => [s.name, s]));
  const clusters = d.skills.clusters;
  // gap rows (columnar -> objects)
  const g = d.gap.cols;
  const gap = g.s.map((_, i) => ({
    state: d.gap.states[g.s[i]], skill: d.gap.skills[g.k[i]], openings: g.o[i], available: g.a[i], availJS: g.aj[i], availTr: g.at[i],
    sgi: g.sgi[i], postings: g.n[i], conf: g.c[i], stock: g.st[i], growth: g.g[i], openings2: g.o2[i], sgi2: g.sgi2[i],
  }));
  gap.forEach((r) => (r.cluster = skillBy[r.skill].cluster, r.shortage = r.openings - r.available));
  const p = d.priority.cols;
  const comps = Object.keys(d.priority.weights);
  const priority = p.s.map((_, i) => {
    const o = { state: d.priority.states[p.s[i]], skill: d.priority.skills[p.k[i]], priority: p.p[i], shortage: p.short[i], sgi: p.sgi[i],
      growth: p.g[i], premium: p.wp[i], trainedCover: p.tc[i], youthUR: p.yu[i], conf: p.conf[i], c: {} };
    comps.forEach((k) => (o.c[k] = (p["c_" + k] || p[k])[i]));
    o.cluster = skillBy[o.skill].cluster;
    return o;
  });
  const gapIdx = {};
  gap.forEach((r) => (gapIdx[r.state + "|" + r.skill] = r));
  priority.forEach((o) => { const r = gapIdx[o.state + "|" + o.skill]; if (r) o.sgi = r.sgi; });
  const stateBy = Object.fromEntries(d.states.map((s) => [s.state, s]));
  const gapBy = {};
  gap.forEach((r) => ((gapBy[r.state] ||= {})[r.skill] = r));
  return { ...d, skillsList: skills, skillBy, clusters, gap, gapBy, priority, priorityWeights: d.priority.weights, defaultAllocation: d.priority.default_allocation, comps, stateBy, roles: d.roles };
}

export const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);

// Aggregate gap rows over a filter (skill / cluster / all non-core skills) per state.
export function stateMetric(data, { skill, cluster, metric }) {
  const out = {};
  for (const r of data.gap) {
    if (skill && r.skill !== skill) continue;
    if (!skill && cluster && r.cluster !== cluster) continue;
    if (!skill && r.cluster === "CS") continue;
    const o = (out[r.state] ||= { openings: 0, available: 0, postings: 0, stock: 0, openings2: 0, avail2: 0, growthW: 0 });
    o.openings += r.openings; o.available += r.available; o.postings += r.postings; o.stock += r.stock;
    o.openings2 += r.openings2; o.avail2 += r.available * 1.03; o.growthW += r.growth * r.openings;
  }
  for (const [st, o] of Object.entries(out)) {
    o.sgi = o.openings + o.available ? (100 * (o.openings - o.available)) / (o.openings + o.available) : null;
    o.sgi2 = o.openings2 + o.avail2 ? (100 * (o.openings2 - o.avail2)) / (o.openings2 + o.avail2) : null;
    o.growth = o.openings ? o.growthW / o.openings : null;
    const lf = data.stateBy[st]?.labour_force || 1;
    o.stockPer1k = (1000 * o.stock) / lf;
    o.lowConf = o.postings < 60;
  }
  return out;
}

export function simulate(row, skill, { trainees, cost, completion, placement, months }) {
  const trainM = Math.max(1, Math.ceil(skill.weeks / 4.33));
  months = months || Math.max(24, Math.ceil((trainM + 12) / 12) * 12);   // long courses (e.g. nursing) need a longer horizon
  const placed = trainees * completion * placement;
  const series = [];
  let cb = 0, ci = 0;
  for (let t = 1; t <= months; t++) {
    const o = (row.openings / 12) * Math.pow(1 + row.growth, t / 12);
    const a = (row.available / 12) * Math.pow(1.03, t / 12);
    const extra = t > trainM && t <= trainM + 3 ? placed / 3 : 0;
    const gapM = o - a;
    cb += Math.max(gapM, 0);
    ci += gapM > 0 ? Math.max(gapM - extra, 0) : 0;
    series.push({ month: t, baseline: Math.round(cb), programme: Math.round(ci) });
  }
  const shortage = Math.max(row.openings - row.available, 0);
  const salary = skill.salary || 2.5;
  return {
    placed: Math.round(placed), completers: Math.round(trainees * completion), cost: trainees * cost,
    costPerPlacement: (trainees * cost) / Math.max(placed, 1), closed: shortage ? Math.min(placed / shortage, 1) : 1,
    wage: placed * salary * 1e5, trainM, shortage, series,
    avoided: series.at(-1).baseline - series.at(-1).programme, months,
  };
}

// Fundable programmes are at least 4 weeks long; short add-on certificates are bundled into those, not funded alone.
export const MIN_WEEKS = 4;
// Greedy budget allocation (optimal for one budget constraint with per-item caps - fractional knapsack).
export function allocate(rows, skillBy, budget, completion, placement, maxCohort = 20000) {
  const cp = completion * placement;
  const cand = rows.filter((r) => r.shortage > 0 && r.conf > 0 && skillBy[r.skill].weeks >= MIN_WEEKS)
    .map((r) => ({ ...r, cost: Math.max(skillBy[r.skill].cost, 1000), cap: Math.min(r.shortage / cp, maxCohort) }))
    .sort((a, b) => b.priority / b.cost - a.priority / a.cost);
  let left = budget; const out = [];
  for (const c of cand) {
    if (left <= 0) break;
    const n = Math.floor(Math.min(c.cap, left / c.cost));
    if (n <= 0) continue;
    left -= n * c.cost;
    out.push({ ...c, trainees: n, spend: n * c.cost, placements: Math.round(n * cp) });
  }
  return out;
}
