// Offline AI Skill Assistant: understands everyday questions and answers ONLY from SkillNet's loaded data.
// Pipeline: normalise -> find entities (states, cities, skills, roles, sectors, numbers, education) -> pick intent -> answer.
// Every answer lists the data it used (`evidence`).
import { simulate } from "./data";
import { fmt } from "./theme";

// ---------------------------------------------------------------- vocabulary
const CLUSTER_WORDS = {
  GE: /green|renewable|solar|clean energy|\bev\b|electric vehicle|wind energy/, HC: /health|hospital|medical|nurs|pharma/, SW: /\bit\b|software|coding|programming|tech jobs/,
  DA: /\bdata\b|\bai\b|artificial intelligence|analytics|machine learning/, MF: /manufactur|factory|industrial|automation/, AG: /agri|farm|food processing|dairy/,
  TX: /textile|garment|apparel/, LR: /logistic|warehouse|retail|delivery|supply chain/, CO: /construct|building|plumb|mason|electrician/,
  EL: /electronic|semiconductor|chip/, BF: /bank|financ|account|insurance|bfsi/, HT: /hospitality|tourism|hotel/, CY: /cyber|security|network/,
  SM: /marketing|sales|customer service|bpo/,
};
const ALIASES = [[/\bnurses?\b/, "Nursing"], [/\bwelders?\b/, "Welding"], [/\bchips?\b|semiconductor/, "Semiconductor Fab & OSAT"],
  [/\bev\b|electric vehicles?/, "EV Battery & Powertrain"], [/\bsolar\b(?! plant)/, "Solar PV Installation"], [/\bplumbers?\b/, "Plumbing"],
  [/\bcoders?\b|\bprogrammers?\b|\bsoftware developers?\b/, "Python"], [/\bdrones?\b/, "Precision Farming & Agri-Drones"], [/\bcooks?\b|\bchefs?\b/, "Food Production (Cook/Chef)"],
  [/\btailors?\b/, "Sewing Machine Operation"], [/\bgen ?ai\b|\bai\b/, "Generative AI"], [/\bcaregivers?\b|elderly care/, "Home Health & Elderly Care"],
  [/\bdrivers?\b/, "Commercial Driving"], [/\bcarpenters?\b/, "Carpentry"], [/\bfitters?\b/, "Fitting & Machining"], [/\bmechanics?\b/, "Automobile Servicing"]];
const STATE_ABBR = { UP: "Uttar Pradesh", MP: "Madhya Pradesh", AP: "Andhra Pradesh", TN: "Tamil Nadu", HP: "Himachal Pradesh", WB: "West Bengal",
  JK: "Jammu and Kashmir", "J&K": "Jammu and Kashmir", MH: "Maharashtra", KA: "Karnataka", GJ: "Gujarat", RJ: "Rajasthan", PB: "Punjab",
  HR: "Haryana", KL: "Kerala", OD: "Odisha", BR: "Bihar", TS: "Telangana", CG: "Chhattisgarh", JH: "Jharkhand", DL: "Delhi" };
const STATE_WORDS = { orissa: "Odisha", bengal: "West Bengal", tamilnadu: "Tamil Nadu", kashmir: "Jammu and Kashmir", ncr: "Delhi", "new delhi": "Delhi",
  pondicherry: "Puducherry", uttaranchal: "Uttarakhand", andaman: "Andaman and Nicobar Islands" };
// city -> [state, district name in the boundary file]
const CITIES = { bangalore: ["Karnataka", "Bengaluru Urban"], bengaluru: ["Karnataka", "Bengaluru Urban"], mysore: ["Karnataka", "Mysuru"], mysuru: ["Karnataka", "Mysuru"],
  mumbai: ["Maharashtra", "Mumbai"], pune: ["Maharashtra", "Pune"], nagpur: ["Maharashtra", "Nagpur"], thane: ["Maharashtra", "Thane"], nashik: ["Maharashtra", "Nashik"],
  hyderabad: ["Telangana", "Hyderabad"], chennai: ["Tamil Nadu", "Chennai"], coimbatore: ["Tamil Nadu", "Coimbatore"], madurai: ["Tamil Nadu", "Madurai"],
  kolkata: ["West Bengal", "Kolkata"], calcutta: ["West Bengal", "Kolkata"], ahmedabad: ["Gujarat", "Ahmedabad"], surat: ["Gujarat", "Surat"],
  vadodara: ["Gujarat", "Vadodara"], rajkot: ["Gujarat", "Rajkot"], jaipur: ["Rajasthan", "Jaipur"], jodhpur: ["Rajasthan", "Jodhpur"],
  lucknow: ["Uttar Pradesh", "Lucknow"], kanpur: ["Uttar Pradesh", "Kanpur Nagar"], noida: ["Uttar Pradesh", "Gautam Buddha Nagar"], varanasi: ["Uttar Pradesh", "Varanasi"],
  agra: ["Uttar Pradesh", "Agra"], gurgaon: ["Haryana", "Gurugram"], gurugram: ["Haryana", "Gurugram"], faridabad: ["Haryana", "Faridabad"],
  ludhiana: ["Punjab", "Ludhiana"], amritsar: ["Punjab", "Amritsar"], patiala: ["Punjab", "Patiala"], jalandhar: ["Punjab", "Jalandhar"], mohali: ["Punjab", "S.A.S. Nagar"],
  chandigarh: ["Chandigarh", "Chandigarh"], patna: ["Bihar", "Patna"], bhopal: ["Madhya Pradesh", "Bhopal"], indore: ["Madhya Pradesh", "Indore"],
  kochi: ["Kerala", "Ernakulam"], cochin: ["Kerala", "Ernakulam"], trivandrum: ["Kerala", "Thiruvananthapuram"], thiruvananthapuram: ["Kerala", "Thiruvananthapuram"],
  bhubaneswar: ["Odisha", "Khordha"], guwahati: ["Assam", "Kamrup Metropolitan"], dehradun: ["Uttarakhand", "Dehradun"], ranchi: ["Jharkhand", "Ranchi"],
  raipur: ["Chhattisgarh", "Raipur"], visakhapatnam: ["Andhra Pradesh", "Visakhapatnam"], vizag: ["Andhra Pradesh", "Visakhapatnam"],
  vijayawada: ["Andhra Pradesh", "Krishna"], srinagar: ["Jammu and Kashmir", "Srinagar"], shimla: ["Himachal Pradesh", "Shimla"], panaji: ["Goa", "North Goa"] };
const EDU = [[/\b10th|class 10|matric|sslc\b/, "10", "Class 10"], [/\b12th|class 12|intermediate|higher secondary|hsc\b|puc\b/, "12", "Class 12"],
  [/\biti pass|\biti student|\bdiploma\b|polytechnic student|after iti/, "iti", "ITI / Diploma"],
  [/\bpost ?grad|\bmtech\b|\bm\.tech|\bmba\b|\bmsc\b|\bmca\b|\bmasters\b/, "pg", "Postgraduate"],
  [/\bgraduate\b|\bdegree\b|\bbtech\b|\bb\.tech|\bbsc\b|\bbcom\b|\bb\.com|\bbca\b|\bba\b|\bbe\b|engineering student|college student/, "grad", "Graduate"]];
const EDU_RANK = { "10": 0, "12": 1, iti: 2, grad: 3, pg: 4 };
const roleNeeds = (nco) => (nco[0] === "2" ? 3 : nco[0] === "3" || nco === "13" || nco === "24" ? 2 : 0);
const EXAMPLES = ["Which skills are short in Punjab?", "What if Punjab trains 10,000 solar technicians?", "Which state has the highest youth unemployment?",
  "Best career after 12th in Bihar", "Compare UP and Bihar", "Where should the government invest?"];

export function makeEngine(data, taxonomy) {
  const skillRx = taxonomy.map((t) => {
    try { return [t.name, new RegExp(`(?<![\\w.#+])(?:${t.pattern})(?:e?s)?(?![\\w+#])`, "i")]; } catch { return [t.name, null]; }
  });
  const states = data.states.map((s) => s.state);
  const reliable = (s) => (data.stateBy[s]?.postings12 || 0) >= 300;
  const M = data.meta;

  // ---------------------------------------------------------------- entities
  function entities(q) {
    const t = " " + q.toLowerCase().replace(/[?!.,;:()]/g, " ").replace(/\s+/g, " ") + " ";
    const st = [];
    const add = (s) => { if (s && !st.includes(s)) st.push(s); };
    states.forEach((s) => { if (t.includes(" " + s.toLowerCase() + " ")) add(s); });
    Object.entries(STATE_WORDS).forEach(([w, s]) => { if (t.includes(" " + w + " ")) add(s); });
    Object.entries(STATE_ABBR).forEach(([a, s]) => {
      if (new RegExp(`(^|[^A-Za-z&])${a.replace("&", "\\&")}([^A-Za-z&]|$)`).test(q)) add(s);
      else if (a.length === 2 && new RegExp(`\\b(in|of|for|and|vs|versus|compare|from|with|to)\\s+${a.toLowerCase()}\\b(?!\\s+(to|with|on|for)\\b)|\\b${a.toLowerCase()}\\s+(and|vs|versus)\\b`).test(t)) add(s);
    });
    let city = null;
    for (const [c, [s, d]] of Object.entries(CITIES)) if (t.includes(" " + c + " ")) { city = { name: c[0].toUpperCase() + c.slice(1), state: s, district: d }; add(s); break; }
    let sk = skillRx.filter(([, rx]) => rx && rx.test(q)).map(([n]) => n);
    sk = sk.filter((n) => data.skillBy[n]?.cluster !== "CS" || /communication|english|spoken/.test(t));
    if (!sk.length) sk = ALIASES.filter(([rx]) => rx.test(t)).map(([, n]) => n).slice(0, 1);
    let role = null, best = 0;
    data.roles.forEach((r) => [r.title, ...(r.titles || [])].forEach((x) => {
      const xl = x.toLowerCase();
      if ((t.includes(" " + xl + " ") || t.includes(" " + xl + "s ")) && x.length > best) { best = x.length; role = { ...r, asked: x }; }
    }));
    const m = t.match(/(\d[\d,.]*)\s*(k\b|thousand|lakh|lac|crore|cr\b)?/);
    let n = m ? parseFloat(m[1].replace(/,/g, "")) : null;
    if (n && m[2]) n *= /lakh|lac/.test(m[2]) ? 1e5 : /crore|cr/.test(m[2]) ? 1e7 : 1e3;
    const topN = (t.match(/\btop\s+(\d{1,2})\b/) || [])[1];
    const cluster = Object.entries(CLUSTER_WORDS).find(([, rx]) => rx.test(t))?.[0];
    const edu = EDU.find(([rx]) => rx.test(t));
    return { t, st, city, sk, role, n, topN: topN ? +topN : null, cluster, edu: edu ? { key: edu[1], label: edu[2] } : null };
  }

  // ---------------------------------------------------------------- data helpers
  const g = (st, sk) => data.gapBy[st]?.[sk];
  const sgiOf = (o, a) => (100 * (o - a)) / (o + a || 1);
  const natSkill = (sk) => {
    const rows = data.gap.filter((r) => r.skill === sk);
    const o = rows.reduce((x, r) => x + r.openings, 0), a = rows.reduce((x, r) => x + r.available, 0);
    return { o, a, sgi: sgiOf(o, a), rows };
  };
  const sectors = () => {
    const agg = {};
    data.gap.forEach((r) => {
      if (r.cluster === "CS") return;
      const o = (agg[r.cluster] ||= { o: 0, a: 0, gw: 0 });
      o.o += r.openings; o.a += r.available; o.gw += r.growth * r.openings;
    });
    return Object.entries(agg).map(([c, o]) => ({ c, name: data.clusters[c], sgi: sgiOf(o.o, o.a), growth: o.gw / (o.o || 1), short: o.o - o.a }));
  };
  const shortages = (state, cluster, surplus = false, k = 6) => {
    let rows = data.gap.filter((r) => (!state || r.state === state) && r.cluster !== "CS" && (!cluster || r.cluster === cluster) && (state ? r.conf > 0 : true));
    if (!state) {
      const agg = {};
      rows.forEach((r) => { const o = (agg[r.skill] ||= { skill: r.skill, openings: 0, available: 0 }); o.openings += r.openings; o.available += r.available; });
      rows = Object.values(agg).map((o) => ({ ...o, sgi: sgiOf(o.openings, o.available) }));
    }
    return rows.filter((r) => (surplus ? r.openings < r.available : r.openings > r.available))
      .sort((a, b) => (surplus ? -1 : 1) * ((b.openings - b.available) - (a.openings - a.available))).slice(0, k);
  };
  const district = (city) => {
    const want = city.district.toLowerCase();
    return data.districts.find((d) => d.state === city.state && d.name.toLowerCase() === want)
      || data.districts.find((d) => d.state === city.state && (d.name.toLowerCase().includes(want.split(" ")[0]) || want.includes(d.name.toLowerCase())));
  };
  const rolesFor = (edu, state, k = 6) => data.roles.map((r) => {
    const eligible = !edu || EDU_RANK[edu.key] >= roleNeeds(r.nco);
    const local = state ? r.top_states.find((x) => x.state === state)?.postings_12m || 0 : r.postings_12m;
    return { ...r, eligible, local, score: Math.max(r.growth_12m, -0.2) * 2 + Math.log10(local + 10) };
  }).filter((r) => r.eligible && (!state || r.local > 0)).sort((a, b) => b.score - a.score).slice(0, k);
  const tbl = (cols, rows) => ({ cols, rows });

  // ---------------------------------------------------------------- answers
  const A = {
    greet: () => ({ text: ["**Hi! I'm the SkillNet assistant.** I answer from SkillNet's own data on job demand, worker supply, training centres and forecasts. You can ask me:",
      "- which skills are short in a state, city or sector", "- which states have the highest shortage or unemployment", "- what-if training scenarios and where to invest",
      "- career advice for your education and state", "- what the project, its data and its models are", "Try: *" + EXAMPLES.slice(0, 3).join("*, *") + "*"] }),
    thanks: () => ({ text: ["You're welcome! Ask me anything else about skills, states, careers or training. For example: *" + EXAMPLES[3] + "*"] }),
    define: (key) => {
      const d = {
        sgi: ["**Skill Gap Index (SGI)**: one score per state and skill, from -100 to +100.", "- It compares **openings** (people employers need per year) with **available** people (jobseekers who have the skill plus ITI/polytechnic graduates).",
          "- **+100**: lots of openings and nobody available (severe shortage). **0**: balanced. **-100**: plenty of workers but no openings (surplus).",
          `- Right now the national score is **${fmt.sgi(sgiOf(data.gap.filter((r) => r.cluster !== "CS").reduce((a, r) => a + r.openings, 0), data.gap.filter((r) => r.cluster !== "CS").reduce((a, r) => a + r.available, 0)))}**, a net shortage.`],
        plfs: ["**PLFS (Periodic Labour Force Survey)** is the Government of India's official jobs survey by MoSPI.", "- It records who is working, who is unemployed, their job (NCO code), education and vocational training.",
          "- SkillNet uses it for the **supply side**: how many people have each skill and how many are looking for work.", "- This demo uses a sample in the exact PLFS format; the real file drops into data/raw/plfs/."],
        nco: ["**NCO-2015 (National Classification of Occupations)** is India's official list of job codes, e.g. 25 = IT professionals, 74 = electricians.", "- Job ads use titles; the survey uses NCO codes. SkillNet's job-title classifier converts one into the other so demand and supply can be compared."],
        iti: [`**ITIs and polytechnics** are vocational training institutes. SkillNet maps **${fmt.int(M.counts.centres)}** of them with their trades and seats.`, "- Their graduates count as skill supply, and areas with high demand but few seats show up as \"training deserts\"."],
        forecast: [`**How forecasts work:** we counted job postings per skill per month (${M.history}) and tested 4 forecasting methods on the last 12 months.`,
          `- The winner, **${M.models.forecast.chosen}**, predicts the next 12 months with an 80% range.`, "- XGBoost and a GRU deep-learning model were also tested; the pipeline picks whichever is most accurate."],
        priority: ["**Priority score** ranks every state and skill pair for training investment, from 0 to 100.", "- It combines: size of the shortage (30%), demand growth (20%), gap severity (15%), training gap (15%), wage premium (10%) and youth unemployment (10%).", "- You can change these weights on the Priority Recommendations page."],
        project: ["**SkillNet India** shows where India's workforce lacks the skills employers want, and what to do about it.",
          "1. **Demand:** reads job ads and pulls out the skills they ask for (NLP).", "2. **Supply:** counts who has those skills from survey data and training centres.",
          "3. **Gap:** demand minus supply gives a Skill Gap Score for every state and skill.", "4. **Future:** forecasts demand 12 months ahead.",
          "5. **Action:** ranks where to train, splits a budget, simulates what-ifs and guides students."],
        data: [`**Datasets used (${M.provenance.length}):**`, ...M.provenance.map((p) => `- ${p.dataset} (${p.type}, ${fmt.int(p.rows)} rows): ${p.use}`)],
        models: ["**Models used:**", `- Skill extractor (NLP): F1 ${M.models.skill_extraction.f1}`, "- New-skill finder: spots rising new skills in job ads", "- Skill2Vec: learns which skills go together",
          `- Job-title classifier: maps titles to NCO codes (${Math.round(M.models.occupation.accuracy_unseen_job_families * 100)}% on unseen job families)`,
          `- Forecasting: ${M.models.forecast.table.map((r) => r.model).join(", ")} (winner: ${M.models.forecast.chosen})`, `- Salary model (Ridge regression): r = ${M.models.salary.recovery_corr_vs_planted}`,
          "- Plus calculation tools: Skill Gap Index, priority score, budget optimiser, what-if simulator"],
        synthetic: ["**Is the data real?** Partly.", "- **Real:** 7,674 job postings from 2025, India's district map and Census 2011 population.", "- **Synthetic (practice data in the real format):** multi-sector job postings, the PLFS workforce sample and the ITI list, because the real files couldn't be downloaded when this was built.", "- Drop the real files into data/raw/ and everything rebuilds on real data."],
      }[key];
      return { text: d, evidence: ["meta.json → methodology"] };
    },
    simulate: (st, sk, n) => {
      const row = g(st, sk), skill = data.skillBy[sk];
      if (!row) return { text: [`I have no gap estimate for ${sk} in ${st}.`] };
      const N = n && n >= 50 ? n : 10000;
      const r = simulate(row, skill, { trainees: N, cost: skill.cost, completion: M.assumptions.completion, placement: M.assumptions.placement });
      return { text: [`**What if ${st} trains ${fmt.int(N)} people in ${sk}?**`,
        `- Shortage today: **${fmt.int(Math.max(row.openings - row.available, 0))}** a year (${fmt.int(row.openings)} openings vs ${fmt.int(row.available)} available)`,
        `- People placed in jobs: **${fmt.int(r.placed)}**, which closes **${Math.round(r.closed * 100)}%** of the yearly gap`,
        `- Cost: **${fmt.inr(r.cost)}**, or ${fmt.inr(r.costPerPlacement)} per person placed; first placements after about ${r.trainM + 1} months`,
        `- Wages created: about **${fmt.inr(r.wage)}** a year`, r.closed >= 1 ? "- This is more than the shortage needs; a smaller batch would do." : ""],
        action: { label: "Open in simulator", page: "simulator", params: { state: st, skill: sk, n: N } },
        evidence: [`gap.json → ${st} × ${sk}`, "skills.json → course cost and length", `assumptions: ${M.assumptions.completion * 100}% complete, ${M.assumptions.placement * 100}% placed`] };
    },
    compare: (sts, sk) => {
      const rows = sts.slice(0, 4).map((s) => {
        if (sk) { const r = g(s, sk); return r && [s, fmt.int(r.openings), fmt.int(r.available), fmt.int(r.openings - r.available), fmt.sgi(r.sgi), fmt.pct(r.growth)]; }
        const S = data.stateBy[s]; return S && [s, fmt.sgi(S.sgi), fmt.sgi(S.sgi_next12), `${S.ur}%`, `${S.youth_ur}%`, fmt.int(S.postings12)];
      }).filter(Boolean);
      return { text: [`**${sts.slice(0, 4).join(" vs ")}${sk ? ` — ${sk}` : ""}**`, sk ? "Openings and available are people per year. Gap: -100 surplus to +100 shortage." : "Gap score: -100 surplus to +100 shortage."],
        table: sk ? tbl(["State", "Openings", "Available", "Shortage", "Gap", "Growth"], rows) : tbl(["State", "Gap now", "Gap in 12 mo", "Unemployment", "Youth unemp.", "Job postings"], rows),
        evidence: [sk ? `gap.json → ${sk}` : "states.json"] };
    },
    rankStates: (t, k) => {
      const low = /\b(lowest|least|fewest|minimum|smallest|lower|less|bottom)\b/.test(t);
      let metric, label, fmtv;
      if (/youth/.test(t)) [metric, label, fmtv] = [(s) => s.youth_ur, "Youth unemployment", (v) => `${v}%`];
      else if (/unemploy|jobless/.test(t)) [metric, label, fmtv] = [(s) => s.ur, "Unemployment", (v) => `${v}%`];
      else if (/grow|growth|future|next year/.test(t)) [metric, label, fmtv] = [(s) => s.growth, "Demand growth", fmt.pct];
      else if (/seat|iti|polytechnic|training cent|institute/.test(t)) [metric, label, fmtv] = [(s) => (s.seats / s.pop2011) * 1e5, "Training seats per lakh people", (v) => v.toFixed(0)];
      else if (/job|posting|demand|hiring|opportunit/.test(t) && !/shortage|gap/.test(t)) [metric, label, fmtv] = [(s) => s.postings12, "Job postings (12 mo)", fmt.int];
      else if (/surplus/.test(t)) [metric, label, fmtv] = [(s) => -s.sgi, "Surplus (gap score)", (v) => fmt.sgi(-v)];
      else [metric, label, fmtv] = [(s) => s.sgi, "Gap score (shortage)", fmt.sgi];
      const rows = data.states.filter((s) => reliable(s.state) && metric(s) != null).sort((a, b) => (low ? 1 : -1) * (metric(a) - metric(b))).slice(0, k || 6);
      return { text: [`**States with the ${low ? "lowest" : "highest"} ${label.toLowerCase()}**`, "Only states with 300+ job postings are ranked, so the numbers are reliable."],
        table: tbl(["State", label, "Gap now", "Youth unemp."], rows.map((s) => [s.state, fmtv(metric(s)), fmt.sgi(s.sgi), `${s.youth_ur}%`])),
        action: rows[0] && { label: `Open ${rows[0].state} on the map`, page: "map", params: { state: rows[0].state } }, evidence: ["states.json → all states"] };
    },
    sectors: (t) => {
      const growth = /grow|future|next|rising|boom/.test(t), surplus = /surplus|oversupply|too many/.test(t);
      const rows = sectors().sort((a, b) => growth ? b.growth - a.growth : surplus ? a.sgi - b.sgi : b.sgi - a.sgi).slice(0, 7);
      return { text: [growth ? "**Sectors where hiring will grow most (next 12 months)**" : surplus ? "**Sectors with more workers than jobs**" : "**Sectors with the biggest skill shortage**"],
        table: tbl(["Sector", "Gap score", "Demand growth"], rows.map((r) => [r.name, fmt.sgi(r.sgi), fmt.pct(r.growth)])), evidence: ["gap.json → all states, by sector", "forecasts → 12-month growth"] };
    },
    trend: (declining) => declining
      ? { text: ["**Skills with falling demand (next 12 months)**", ...data.emerging.declining.slice(0, 6).map((r) => `- ${r.skill}: **${fmt.pct(r.growth)}**`), "People in these skills may want to reskill into a growing one."], evidence: ["forecasts → 12-month change"] }
      : { text: ["**Fastest-rising skills (next 12 months)**", ...data.emerging.rising.slice(0, 6).map((r) => `- ${r.skill}: **${fmt.pct(r.growth)}**`),
          "**Brand-new skills employers started asking for** (found by our NLP model):", ...data.emerging.new_terms.slice(0, 5).map((x) => `- ${x.term}: share of job ads up ${x.growth_x}× since ${x.first_seen}`)],
          action: { label: "Open Demand & Forecasts", page: "demand" }, evidence: ["emerging.json", "forecasts"] },
    invest: (st, k) => {
      const rows = data.priority.filter((r) => (!st || r.state === st) && r.conf > 0).slice(0, k || 6);
      return { text: [`**Where to invest in training${st ? ` in ${st}` : ""} first**`, "Ranked by the priority score: shortage size, growth, severity, training gap, pay and youth unemployment."],
        table: tbl(st ? ["Skill", "Score", "Shortage / yr", "Growth"] : ["State", "Skill", "Score", "Shortage / yr"],
          rows.map((r) => st ? [r.skill, r.priority.toFixed(0), fmt.int(r.shortage), fmt.pct(r.growth)] : [r.state, r.skill, r.priority.toFixed(0), fmt.int(r.shortage)])),
        action: { label: "Open Priority Recommendations", page: "priority", params: { state: st } }, evidence: ["priority.json"] };
    },
    totals: (t, st) => {
      const S = st && data.stateBy[st];
      const sum = (f) => data.states.reduce((a, s) => a + (f(s) || 0), 0);
      const lines = [];
      if (/jobseeker|unemploy|jobless/.test(t)) lines.push(`- Jobseekers${st ? ` in ${st}` : ""}: **${fmt.int(S ? S.jobseekers : sum((s) => s.jobseekers))}**${S ? ` (unemployment ${S.ur}%, youth ${S.youth_ur}%)` : ""}`);
      if (/posting|job ad|jobs\b|vacanc/.test(t)) lines.push(`- Job postings analysed${st ? ` in ${st}` : ""}: **${fmt.int(S ? S.postings12 : M.counts.postings)}**${S ? " (last 12 months)" : ` (${fmt.int(M.counts.postings_real)} real)`}`);
      if (/iti|polytechnic|centre|center|institute|college/.test(t)) lines.push(`- Training centres${st ? ` in ${st}` : ""}: **${fmt.int(S ? S.centres : M.counts.centres)}** with **${fmt.int(S ? S.seats : sum((s) => s.seats))}** seats`);
      if (/skill/.test(t)) lines.push(`- Skills tracked: **${M.counts.skills}** across ${Object.keys(data.clusters).length} sectors`);
      if (/district/.test(t)) lines.push(`- Districts on the map: **${M.counts.districts}**`);
      if (/state/.test(t) && !st) lines.push(`- States and UTs covered: **${M.counts.states}**`);
      if (/model/.test(t)) return A.define("models");
      if (/dataset|data set/.test(t)) return A.define("data");
      if (!lines.length) return null;
      return { text: [`**${st || "India"} in numbers**`, ...lines], evidence: [st ? `states.json → ${st}` : "meta.json + states.json"] };
    },
    salary: (role, sk) => {
      if (role) return { text: [`**Pay for a ${role.asked}**`, `- Typical range: **₹${role.salary_p25_lpa} – ${role.salary_p75_lpa} lakh a year** (median ₹${role.salary_median_lpa} LPA)`,
        `- Skills that raise pay: ${role.skills.filter((s) => s.premium_pct > 0).sort((a, b) => b.premium_pct - a.premium_pct).slice(0, 3).map((s) => `${s.skill} (+${s.premium_pct}%)`).join(", ") || "none stand out"}`],
        evidence: [`roles.json → ${role.title}`, "salary model"] };
      const s = data.skillBy[sk];
      return { text: [`**Pay with ${sk}**`, s.salary ? `- Median posted salary: **₹${s.salary} lakh a year**` : "- Not enough salary data for this skill.",
        s.premium != null ? `- Pay effect within the same job: **${s.premium > 0 ? "+" : ""}${s.premium}%**` : ""], evidence: ["salary model", "skills.json"] };
    },
    careerRole: (role) => ({ text: [`**Becoming a ${role.asked}**`, `- Skills you need: ${role.skills.slice(0, 6).map((s) => s.skill).join(", ")}`,
      `- Pay: ₹${role.salary_p25_lpa}–${role.salary_p75_lpa} lakh a year (median ₹${role.salary_median_lpa})`, `- Most jobs in: ${role.top_states.slice(0, 4).map((s) => s.state).join(", ")}`,
      `- Demand next 12 months: **${fmt.pct(role.growth_12m)}**`, `- How to start: ${role.skills[0].training_route} (${role.skills[0].weeks} weeks)`],
      action: { label: "Build my learning path", page: "career", params: { role: role.role } }, evidence: [`roles.json → ${role.title}`] }),
    careerAdvice: (edu, st) => {
      const rows = rolesFor(edu, st);
      return { text: [`**Good careers${edu ? ` after ${edu.label}` : ""}${st ? ` in ${st}` : ""}**`, "Picked for growing demand and open jobs" + (edu ? ", and matched to your education." : ". Tell me your education (e.g. 12th, ITI, graduate) for a better match.")],
        table: tbl(["Career", "Median pay", "Demand outlook", "Learn first"], rows.map((r) => [r.title, r.salary_median_lpa ? `₹${r.salary_median_lpa} LPA` : "–", fmt.pct(r.growth_12m), r.skills[0]?.skill || "–"])),
        action: { label: "Open Student Career Path", page: "career" }, evidence: ["roles.json", edu ? `education filter: ${edu.label}` : "all education levels"].filter(Boolean) };
    },
    forecast: (sk) => {
      const f = data.forecasts.series[`skill::${sk}`];
      if (!f) return null;
      const last = f.h.slice(-12).reduce((a, b) => a + b, 0), next = f.f.reduce((a, b) => a + b, 0);
      return { text: [`**${sk}: demand outlook**`, `- Job postings, last 12 months: **${fmt.int(last)}**`, `- Expected next 12 months: **${fmt.int(next)}** (likely range ${fmt.int(f.lo.reduce((a, b) => a + b, 0))}–${fmt.int(f.hi.reduce((a, b) => a + b, 0))})`,
        `- Change: **${fmt.pct(f.g)}** · model: ${data.forecasts.model}`], chart: `skill::${sk}`, evidence: [`forecasts → ${sk}`] };
    },
    city: (city) => {
      const d = district(city), S = data.stateBy[city.state];
      const top = d?.byCluster ? Object.entries(d.byCluster).sort((a, b) => b[1] - a[1]).slice(0, 4) : [];
      return { text: [`**Jobs in ${city.name}** (${d ? d.name + ", " : ""}${city.state})`,
        d ? `- Job postings in the last 12 months: **${fmt.int(d.postings12)}** (${((d.postings12 / d.pop) * 1e5).toFixed(1)} per lakh people)` : "- No district-level data for this city; showing the state.",
        top.length ? `- Most hiring in: ${top.map(([c, v]) => `${data.clusters[c]} (${v})`).join(", ")}` : "",
        d ? `- Training centres in the district: **${d.centres}** with ${fmt.int(d.seats)} seats` : "",
        S ? `- ${city.state} overall: gap score ${fmt.sgi(S.sgi)}, youth unemployment ${S.youth_ur}%` : ""],
        table: tbl(["Skill short in " + city.state, "Shortage / yr", "Gap"], shortages(city.state, null, false, 5).map((r) => [r.skill, fmt.int(r.openings - r.available), fmt.sgi(r.sgi)])),
        action: { label: `Open ${city.state} on the map`, page: "map", params: { state: city.state } }, evidence: [`districts.json → ${d?.name || city.state}`, `gap.json → ${city.state}`] };
    },
    stateSkill: (st, sk) => {
      const r = g(st, sk), s = data.skillBy[sk];
      if (!r) return null;
      const short = r.openings - r.available;
      return { text: [`**${sk} in ${st}**`, short > 0 ? `- **Yes, there is a shortage:** ${fmt.int(r.openings)} openings a year vs ${fmt.int(r.available)} available, so **${fmt.int(short)}** short.`
          : `- **No shortage:** ${fmt.int(r.available)} available vs ${fmt.int(r.openings)} openings a year, so ${fmt.int(-short)} more workers than jobs.`,
        `- Gap score **${fmt.sgi(r.sgi)}** now, **${fmt.sgi(r.sgi2)}** in 12 months; demand ${fmt.pct(r.growth)}`,
        `- Local ITIs/polytechnics produce about **${fmt.int(r.availTr)}** trained people a year in this skill`, `- How to train: ${s.route} (${s.weeks} weeks, about ${fmt.inr(s.cost)} per person)`,
        r.conf === 0 ? "- Note: few job postings here, so treat this as a rough estimate." : ""],
        action: short > 0 ? { label: "Simulate a training programme", page: "simulator", params: { state: st, skill: sk } } : null, evidence: [`gap.json → ${st} × ${sk}`] };
    },
    whereSkill: (sk) => {
      const N = natSkill(sk);
      const top = N.rows.filter((r) => r.conf > 0 && r.openings > r.available).sort((a, b) => (b.openings - b.available) - (a.openings - a.available)).slice(0, 5);
      const s = data.skillBy[sk];
      return { text: [`**${sk}: where it's needed**`, `All India: ${fmt.int(N.o)} openings a year vs ${fmt.int(N.a)} available (gap score **${fmt.sgi(N.sgi)}**).`,
        `Training: ${s.route} (${s.weeks} weeks, about ${fmt.inr(s.cost)} per person).`, top.length ? "States with the biggest shortage:" : "No state shows a reliable shortage for this skill."],
        table: top.length ? tbl(["State", "Shortage / yr", "Gap", "Growth"], top.map((r) => [r.state, fmt.int(r.openings - r.available), fmt.sgi(r.sgi), fmt.pct(r.growth)])) : null,
        action: top[0] && { label: `Simulate training in ${top[0].state}`, page: "simulator", params: { state: top[0].state, skill: sk } }, evidence: [`gap.json → ${sk} in ${N.rows.length} states`] };
    },
    centres: (st) => {
      const S = data.stateBy[st];
      const ds = data.districts.filter((d) => d.state === st).sort((a, b) => b.seats - a.seats).slice(0, 4);
      return { text: [`**Training centres in ${st}**`, `- **${fmt.int(S.centres)}** ITIs and polytechnics with **${fmt.int(S.seats)}** seats`, `- ${((S.seats / S.pop2011) * 1e5).toFixed(0)} seats per lakh people`,
        ds.length ? `- Most seats: ${ds.map((d) => `${d.name} (${fmt.int(d.seats)})`).join(", ")}` : ""],
        action: { label: "Open the training map", page: "training", params: { state: st } }, evidence: [`states.json + districts.json → ${st}`] };
    },
    stateSummary: (st, cluster, surplus) => {
      const S = data.stateBy[st];
      const rows = shortages(st, cluster, surplus);
      return { text: [`**${st}${cluster ? ` — ${data.clusters[cluster]}` : ""}**`, `- Gap score **${fmt.sgi(S.sgi)}** now → **${fmt.sgi(S.sgi_next12)}** in 12 months · unemployment ${S.ur}% (youth ${S.youth_ur}%)`,
        rows.length ? (surplus ? "Skills with more workers than jobs:" : "Skills most in short supply (people per year):") : `No reliable ${surplus ? "surplus" : "shortage"} found${cluster ? " in this sector" : ""}.`],
        table: rows.length ? tbl(["Skill", "Openings", "Available", surplus ? "Surplus" : "Shortage", "Gap"], rows.map((r) => [r.skill, fmt.int(r.openings), fmt.int(r.available), fmt.int(Math.abs(r.openings - r.available)), fmt.sgi(r.sgi)])) : null,
        action: { label: "See recommendations", page: "priority", params: { state: st } }, evidence: [`states.json → ${st}`, `gap.json → ${st}`] };
    },
    national: (cluster, surplus) => {
      const rows = shortages(null, cluster, surplus, 7);
      return { text: [`**${surplus ? "Biggest surpluses" : "Biggest skill shortages"} in India${cluster ? ` — ${data.clusters[cluster]}` : ""}**`],
        table: tbl(["Skill", surplus ? "Surplus / yr" : "Shortage / yr", "Gap"], rows.map((r) => [r.skill, fmt.int(Math.abs(r.openings - r.available)), fmt.sgi(r.sgi)])),
        evidence: [`gap.json → all states${cluster ? ", " + data.clusters[cluster] : ""}`] };
    },
  };

  // ---------------------------------------------------------------- routing
  function answer(q) {
    const e = entities(q);
    const { t, st, city, sk, role, n, topN, cluster, edu } = e;
    const words = t.trim().split(" ").filter(Boolean);
    const has = (rx) => rx.test(t);
    const noEntities = !st.length && !sk.length && !role && !cluster;
    const asksWhat = has(/\b(what|whats|what's|explain|define|meaning|tell me about|how does|how do you|how is|why)\b/);

    if (!words.length) return A.greet();
    if (noEntities && words.length <= 6 && has(/\b(hi|hii|hello|hey|namaste|hola|good (morning|evening|afternoon)|yo)\b|what can you do|help\b|who are you/)) return A.greet();
    if (noEntities && words.length <= 5 && has(/\b(thanks|thank you|thx|ok|okay|great|nice|cool|good)\b/)) return A.thanks();

    // explanations
    if (asksWhat || has(/\b(how accurate|accuracy)\b/)) {
      if (has(/skill gap index|\bsgi\b|gap index|gap score/)) return A.define("sgi");
      if (has(/\bplfs\b|labour force survey/)) return A.define("plfs");
      if (has(/\bnco\b|occupation code/)) return A.define("nco");
      if (has(/priority score|priority index/)) return A.define("priority");
      if (has(/forecast|predict|\bmase\b/) && !sk.length) return A.define("forecast");
      if (has(/dataset|data set|data sources?|which data|what data/)) return A.define("data");
      if (has(/\bmodels?\b|algorithm|accuracy|how accurate/)) return A.define("models");
      if (has(/synthetic|real data|fake|is the data real/)) return A.define("synthetic");
      if (has(/\bitis?\b|polytechnic/) && !st.length) return A.define("iti");
      if (has(/project|skillnet|this (app|platform|website|dashboard)|how does (it|this) work/)) return A.define("project");
    }
    if (has(/dataset|data sources?/) && noEntities) return A.define("data");
    if (has(/synthetic|is the data real|real data/)) return A.define("synthetic");

    // what-if
    if (has(/simulat|what if|what-if|\btrains?\b|\btraining \d|invest \d/) && st.length && sk.length) return A.simulate(st[0], sk[0], n);
    // compare
    if (st.length >= 2) return A.compare(st, sk[0]);
    // rankings across states
    if (has(/\b(which|what|top|best|worst)\b.*\bstates?\b|\bstates? (with|having|has)\b|\bhighest\b|\blowest\b|\bmost\b.*\bstates?\b|\bleast\b/) && !st.length) {
      if (sk.length) return A.whereSkill(sk[0]);
      if (has(/sector|industr|field/)) return A.sectors(t);
      return A.rankStates(t, topN);
    }
    // sectors
    if (has(/\b(sectors?|industr(y|ies)|fields?|domains?)\b/) && !sk.length && !st.length) return A.sectors(t);
    // trends
    if (has(/declin|falling|dying|obsolete|outdated|less demand/)) return A.trend(true);
    if (has(/emerging|rising|trending|future skills|new skills|upcoming|hot skills/) && !sk.length) return A.trend(false);
    // where to invest / recommendations
    if (has(/invest|recommend|priorit|government (should|focus)|where should (we|the government)|focus on|fund/) && !sk.length) return A.invest(st[0], topN);
    // totals
    if (has(/\bhow many\b|\bnumber of\b|\btotal\b|\bcount\b/)) { const r = A.totals(t, st[0]); if (r) return r; }
    // pay
    if (has(/salary|salaries|\bpay\b|\bearn|\bctc\b|\blpa\b|\bwage/) && (role || sk.length)) return A.salary(role, sk[0]);
    // careers
    if (has(/career|become|job for me|should i (learn|study|do)|what (to|should i) learn|fresher|after (10th|12th|iti|graduation|btech)|best course|which course|future for me|get a job/) || (edu && !st.length && !sk.length)) {
      if (role) return A.careerRole(role);
      return A.careerAdvice(edu, st[0] || city?.state);
    }
    // forecasts
    if (has(/forecast|future|trend|next (year|12)|grow|outlook|predict|demand for/) && sk.length) { const r = A.forecast(sk[0]); if (r) return r; }
    // a city
    if (city && !sk.length) return A.city(city);
    // state + skill
    if (st.length && sk.length) { const r = A.stateSkill(st[0], sk[0]); if (r) return r; }
    // skill (or role) alone
    if (sk.length && (!role || has(/where|need|demand|shortage|short|which state|jobs?\b|hiring|train/))) return A.whereSkill(sk[0]);
    if (role) return A.careerRole(role);
    // training centres
    if (has(/\bitis?\b|polytechnic|training cent|institute/) && st.length) return A.centres(st[0]);
    // state
    if (st.length) return A.stateSummary(st[0], cluster, has(/surplus|too many|over ?supply|excess/));
    // sector / national
    if (cluster) return A.national(cluster, has(/surplus|too many|excess/));
    if (has(/shortage|gap|need|demand|in-demand|most wanted|skills?\b|jobs?\b/)) return A.national(null, has(/surplus|too many|excess/));
    // nothing matched: still useful
    const r = A.national(null, false);
    r.text = ["I'm not sure what you meant, so here is the national picture. Try a state, city, skill, job or your education, e.g. *" + EXAMPLES[3] + "*.", ...r.text];
    return r;
  }
  return { answer };
}
