// Offline AI Skill Assistant: intent detection + entity linking over the platform's own data.
// Every number in an answer comes from the loaded datasets; `evidence` lists what was used.
import { simulate } from "./data";
import { fmt } from "./theme";

// everyday words people use for skills (taxonomy aliases cover recruiter language)
const ALIASES = [[/\bnurses?\b/, "Nursing"], [/\bwelders?\b/, "Welding"], [/\bchip|semiconductor/, "Semiconductor Fab & OSAT"],
  [/\bev\b|electric vehicle/, "EV Battery & Powertrain"], [/\bsolar\b(?! plant)/, "Solar PV Installation"], [/\bplumbers?\b/, "Plumbing"],
  [/\bcoders?\b|programmers?\b|developers?\b/, "Python"], [/\bdrones?\b/, "Precision Farming & Agri-Drones"], [/\bcooks?\b|chefs?\b/, "Food Production (Cook/Chef)"],
  [/\btailors?\b/, "Sewing Machine Operation"], [/\bai\b/, "Generative AI"], [/\bcaregivers?\b|elderly/, "Home Health & Elderly Care"]];

const CLUSTER_WORDS = {
  GE: /green|renewable|solar|clean energy|\bev\b|electric vehicle/, HC: /health|hospital|medical|nurs/, SW: /\bit\b|software|tech jobs|coding/,
  DA: /\bdata\b|\bai\b|analytics/, MF: /manufactur|factory|industrial/, AG: /agri|farm|food/, TX: /textile|garment|apparel/,
  LR: /logistic|warehouse|retail|delivery/, CO: /construct|building trade|plumb|mason/, EL: /electronic|semiconductor|chip/,
  BF: /bank|financ|account|insurance/, HT: /hospitality|tourism|hotel/, CY: /cyber|security|network/, SM: /marketing|sales|customer service/,
};

export function makeEngine(data, taxonomy) {
  const skillRx = taxonomy.map((t) => {
    try { return [t.name, new RegExp(`(?<![\\w.#+])(?:${t.pattern})(?:e?s)?(?![\\w+#])`, "i")]; } catch { return [t.name, null]; }
  });
  const states = data.states.map((s) => s.state);
  const stateAlias = { "j&k": "Jammu and Kashmir", kashmir: "Jammu and Kashmir", orissa: "Odisha", bengal: "West Bengal", "tamilnadu": "Tamil Nadu", ncr: "Delhi" };

  function entities(q) {
    const t = q.toLowerCase();
    const st = states.filter((s) => new RegExp(`\\b${s.toLowerCase()}\\b`).test(t));
    Object.entries(stateAlias).forEach(([a, s]) => { if (t.includes(a) && !st.includes(s)) st.push(s); });
    let sk = skillRx.filter(([n, rx]) => (rx && rx.test(q)) || t.includes(n.toLowerCase())).map(([n]) => n)
      .filter((n) => data.skillBy[n]?.cluster !== "CS" || /communication|english/.test(t));
    if (!sk.length) sk = ALIASES.filter(([rx]) => rx.test(t)).map(([, n]) => n).slice(0, 1);
    let role = null, best = 0;
    data.roles.forEach((r) => [r.title, ...(r.titles || [])].forEach((x) => {
      if (t.includes(x.toLowerCase()) && x.length > best) { best = x.length; role = { ...r, asked: x }; }
    }));
    const m = t.match(/(\d[\d,.]*)\s*(k\b|thousand|lakh|lac)?/);
    let n = m ? parseFloat(m[1].replace(/,/g, "")) : null;
    if (n && m[2]) n *= /lakh|lac/.test(m[2]) ? 1e5 : 1e3;
    const cluster = Object.entries(CLUSTER_WORDS).find(([, rx]) => rx.test(t))?.[0];
    return { t, st, sk, role, n, cluster };
  }

  const g = (st, sk) => data.gapBy[st]?.[sk];
  const natSkill = (sk) => {
    const rows = data.gap.filter((r) => r.skill === sk);
    const o = rows.reduce((a, r) => a + r.openings, 0), a = rows.reduce((x, r) => x + r.available, 0);
    return { o, a, sgi: (100 * (o - a)) / (o + a || 1), rows };
  };

  function answer(q) {
    const e = entities(q);
    const { t, st, sk, role, n, cluster } = e;
    const ev = [];
    // 1. what-if simulation
    if (/simulat|what if|what-if|\btrains?\b|\btraining \d|invest/.test(t) && st.length && sk.length) {
      const row = g(st[0], sk[0]); const skill = data.skillBy[sk[0]];
      if (!row) return none(`I have no gap estimate for ${sk[0]} in ${st[0]}.`);
      const N = n && n >= 50 ? n : 10000;
      const r = simulate(row, skill, { trainees: N, cost: skill.cost, completion: data.meta.assumptions.completion, placement: data.meta.assumptions.placement });
      ev.push(`gap.json → ${st[0]} × ${sk[0]}`, "skills.json → cost, duration, median salary", `assumptions: completion ${data.meta.assumptions.completion}, placement ${data.meta.assumptions.placement}`);
      return {
        text: [`**What if ${st[0]} trains ${fmt.int(N)} people in ${sk[0]}?**`,
          `- Annual shortage today: **${fmt.int(Math.max(row.openings - row.available, 0))}** (${fmt.int(row.openings)} openings vs ${fmt.int(row.available)} available)`,
          `- Expected placements: **${fmt.int(r.placed)}**, which closes **${Math.round(r.closed * 100)}%** of the annual gap`,
          `- Cost: **${fmt.inr(r.cost)}** (${fmt.inr(r.costPerPlacement)} per placement); first placements after ~${r.trainM + 1} months`,
          `- Wages created: about **${fmt.inr(r.wage)}** a year`,
          r.closed >= 1 ? "- This over-shoots the shortage; a smaller cohort would do." : ""],
        action: { label: "Open in simulator", page: "simulator", params: { state: st[0], skill: sk[0], n: N } }, evidence: ev,
      };
    }
    // 2. compare states
    if (st.length >= 2 && (/compar|\bvs\b|versus|between/.test(t) || sk.length)) {
      const rows = st.slice(0, 4).map((s) => {
        if (sk.length) { const r = g(s, sk[0]); return r && [s, fmt.int(r.openings), fmt.int(r.available), fmt.int(r.openings - r.available), fmt.sgi(r.sgi), fmt.pct(r.growth)]; }
        const S = data.stateBy[s]; return S && [s, fmt.int(S.openings), fmt.int(S.available), `${S.youth_ur}%`, fmt.sgi(S.sgi), fmt.sgi(S.sgi_next12)];
      }).filter(Boolean);
      ev.push(sk.length ? `gap.json → ${sk[0]} for ${st.join(", ")}` : `states.json → ${st.join(", ")}`);
      return {
        text: [`**${st.slice(0, 4).join(" vs ")}${sk.length ? ` — ${sk[0]}` : ""}**`, sk.length ? "Openings and available are persons per year; gap index runs -100 (surplus) to +100 (shortage)." : "Overall labour-market comparison across all skills."],
        table: { cols: sk.length ? ["State", "Openings", "Available", "Shortage", "Gap", "Growth"] : ["State", "Openings", "Available", "Youth UR", "Gap now", "Gap 12m"], rows }, evidence: ev,
      };
    }
    // 3. career
    if (role && (/career|become|how (do|can|should) i|path|learn|skills? (for|needed)|job as|work as/.test(t) || !st.length)) {
      ev.push(`roles.json → ${role.title}`);
      return {
        text: [`**Becoming a ${role.asked}**${role.asked !== role.title ? ` (role family: ${role.titles.slice(0, 3).join(", ")})` : ""}`,
          `- Core skills: ${role.skills.slice(0, 6).map((s) => `${s.skill} (${Math.round(s.share * 100)}%)`).join(", ")}`,
          `- Pay: ₹${role.salary_p25_lpa}–${role.salary_p75_lpa} LPA (median ₹${role.salary_median_lpa} LPA)`,
          `- Most hiring: ${role.top_states.slice(0, 4).map((s) => s.state).join(", ")}`,
          `- Demand outlook: **${fmt.pct(role.growth_12m)}** over the next 12 months`,
          `- Start with: ${role.skills[0].training_route}`],
        action: { label: "Build my learning path", page: "career", params: { role: role.role } }, evidence: ev,
      };
    }
    // 4. forecast
    if (/forecast|future|trend|next (year|12)|grow|outlook|demand for|rising|emerging/.test(t) && sk.length) {
      const f = data.forecasts.series[`skill::${sk[0]}`];
      if (f) {
        ev.push(`forecasts.json → skill::${sk[0]} (${data.forecasts.model})`);
        const last = f.h.slice(-12).reduce((a, b) => a + b, 0), next = f.f.reduce((a, b) => a + b, 0);
        return { text: [`**${sk[0]}: demand outlook**`, `- Postings, last 12 months: **${fmt.int(last)}**`, `- Forecast, next 12 months: **${fmt.int(next)}** (80% range ${fmt.int(f.lo.reduce((a, b) => a + b, 0))}–${fmt.int(f.hi.reduce((a, b) => a + b, 0))})`,
          `- Change: **${fmt.pct(f.g)}** · model: ${data.forecasts.model}`], chart: `skill::${sk[0]}`, evidence: ev };
      }
    }
    if (/emerging|new skills|rising skills|fastest/.test(t)) {
      ev.push("emerging.json");
      return { text: ["**Fastest-rising skills (next 12 months)**", ...data.emerging.rising.slice(0, 6).map((r) => `- ${r.skill}: **${fmt.pct(r.growth)}**`),
        "**New terms recruiters started using** (found by NLP, not yet in the taxonomy)", ...data.emerging.new_terms.slice(0, 5).map((x) => `- ${x.term}: ${x.growth_x}× share growth, first seen ${x.first_seen}`)], evidence: ev };
    }
    // 5. where to train
    if (sk.length && (/where|which state|best place|locat|set up|open/.test(t) || !st.length)) {
      const N = natSkill(sk[0]);
      const top = N.rows.filter((r) => r.conf > 0 && r.openings > r.available).sort((a, b) => (b.openings - b.available) - (a.openings - a.available)).slice(0, 5);
      ev.push(`gap.json → ${sk[0]} across ${N.rows.length} states`);
      return {
        text: [`**${sk[0]}: where the shortage is**`, `All India: ${fmt.int(N.o)} openings/yr vs ${fmt.int(N.a)} available (gap index **${fmt.sgi(N.sgi)}**).`,
          `Training route: ${data.skillBy[sk[0]].route} (${data.skillBy[sk[0]].weeks} weeks, about ${fmt.inr(data.skillBy[sk[0]].cost)} per trainee).`,
          top.length ? "Best places to train:" : "No state shows a reliable shortage for this skill."],
        table: top.length ? { cols: ["State", "Shortage / yr", "Gap", "Growth", "Trainees from ITIs"], rows: top.map((r) => [r.state, fmt.int(r.openings - r.available), fmt.sgi(r.sgi), fmt.pct(r.growth), fmt.int(r.availTr)]) } : null,
        action: top[0] && { label: `Simulate in ${top[0].state}`, page: "simulator", params: { state: top[0].state, skill: sk[0] } }, evidence: ev,
      };
    }
    // 6. centres
    if (/centre|center|\biti\b|polytechnic|institute|college/.test(t)) {
      const s = data.stateBy[st[0]];
      if (s) { ev.push(`states.json → ${st[0]}`); return { text: [`**Training capacity in ${st[0]}**`, `- ${fmt.int(s.centres)} ITIs & polytechnics, ${fmt.int(s.seats)} seats`, `- ${((s.seats / s.pop2011) * 1e5).toFixed(0)} seats per lakh population`], action: { label: "Open training map", page: "training", params: { state: st[0] } }, evidence: ev }; }
    }
    // 7. state summary (shortage / surplus)
    if (st.length) {
      const S = data.stateBy[st[0]];
      const wantSurplus = /surplus|too many|over ?supply|excess/.test(t);
      let rows = data.gap.filter((r) => r.state === st[0] && r.cluster !== "CS" && r.conf > 0 && (!cluster || r.cluster === cluster)
        && (wantSurplus ? r.openings < r.available : r.openings > r.available));
      rows = rows.sort((a, b) => (wantSurplus ? -1 : 1) * ((b.openings - b.available) - (a.openings - a.available))).slice(0, 6);
      ev.push(`states.json → ${st[0]}`, `gap.json → ${st[0]}${cluster ? " · " + data.clusters[cluster] : ""}`);
      return {
        text: [`**${st[0]}${cluster ? ` — ${data.clusters[cluster]}` : ""}**`,
          `- Gap index **${fmt.sgi(S.sgi)}** now → **${fmt.sgi(S.sgi_next12)}** in 12 months · unemployment ${S.ur}% (youth ${S.youth_ur}%)`,
          wantSurplus ? "Largest surpluses (more workers than openings):" : "Largest shortages (persons per year):"],
        table: { cols: ["Skill", "Openings", "Available", wantSurplus ? "Surplus" : "Shortage", "Gap"], rows: rows.map((r) => [r.skill, fmt.int(r.openings), fmt.int(r.available), fmt.int(Math.abs(r.openings - r.available)), fmt.sgi(r.sgi)]) },
        action: { label: "See recommendations", page: "priority", params: { state: st[0] } }, evidence: ev,
      };
    }
    // 8. cluster / national
    if (cluster || /shortage|gap|need|demand|in-demand|most wanted/.test(t)) {
      const agg = {};
      data.gap.forEach((r) => { if (r.cluster === "CS" || (cluster && r.cluster !== cluster)) return; const o = (agg[r.skill] ||= { o: 0, a: 0 }); o.o += r.openings; o.a += r.available; });
      const rows = Object.entries(agg).map(([s, o]) => [s, o.o - o.a, (100 * (o.o - o.a)) / (o.o + o.a)]).sort((a, b) => b[1] - a[1]).slice(0, 7);
      ev.push(`gap.json → all states${cluster ? " · " + data.clusters[cluster] : ""}`);
      return { text: [`**Largest skill shortages in India${cluster ? ` — ${data.clusters[cluster]}` : ""}**`], table: { cols: ["Skill", "Shortage / yr", "Gap"], rows: rows.map((r) => [r[0], fmt.int(r[1]), fmt.sgi(r[2])]) }, evidence: ev };
    }
    return none();
  }

  function none(msg) {
    return { text: [msg || "I couldn't map that to the data. Try one of these:", "- *Which skills are short in Punjab?*", "- *What if Punjab trains 10,000 solar technicians?*",
      "- *Compare Karnataka and Telangana for Generative AI*", "- *Where should we train nurses?*", "- *Forecast for EV battery skills*", "- *How do I become a CNC operator?*"] };
  }
  return { answer };
}
