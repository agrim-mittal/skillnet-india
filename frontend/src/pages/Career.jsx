import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Route, IndianRupee, MapPin, CheckCircle2, Circle, Wand2 } from "lucide-react";
import { useData, loadCentres } from "../data";
import { Panel, StateSelect, SkillChips, BarList, DemoNote } from "../components/ui";
import { fmt, SERIES } from "../theme";

const EDU = [["10", "Class 10"], ["12", "Class 12"], ["iti", "ITI / Diploma"], ["grad", "Graduate"], ["pg", "Postgraduate"]];
const eduRank = { "10": 0, "12": 1, iti: 2, grad: 3, pg: 4 };
const roleNeeds = (nco) => (nco[0] === "2" ? 3 : nco[0] === "3" || nco === "13" || nco === "24" ? 2 : 0);

export default function Career() {
  const data = useData();
  const roles = data.roles;
  const [state, setState] = useState(data.selState || "Punjab");
  const [edu, setEdu] = useState("iti");
  const [mine, setMine] = useState(["Electrician (Wiring)", "Communication (English)"]);
  const [roleKey, setRoleKey] = useState(data.params.role || null);
  const [centres, setCentres] = useState(null);
  useEffect(() => { loadCentres().then(setCentres); }, []);

  const ranked = useMemo(() => roles.map((r) => {
    const tot = r.skills.reduce((a, s) => a + s.share, 0) || 1;
    const match = r.skills.filter((s) => mine.includes(s.skill)).reduce((a, s) => a + s.share, 0) / tot;
    const local = r.top_states.find((x) => x.state === state)?.postings_12m || 0;
    const eligible = eduRank[edu] >= roleNeeds(r.nco);
    return { ...r, match, local, eligible, score: (match * 0.7 + Math.min(local / 300, 1) * 0.15 + Math.max(r.growth_12m, 0) * 0.3) * (eligible ? 1 : 0.25) };
  }).sort((a, b) => b.score - a.score), [roles, mine, state, edu]);

  const role = roles.find((r) => r.role === roleKey) || ranked[0];
  const match = ranked.find((r) => r.role === role.role)?.match ?? 0;
  const missing = role.skills.filter((s) => !mine.includes(s.skill) && data.skillBy[s.skill]?.cluster !== "CS");
  // learning path: start with the missing skill closest to what you know (skill2vec neighbours), then by importance
  const path = useMemo(() => {
    const left = [...missing]; const out = []; const known = new Set(mine);
    while (left.length) {
      left.sort((a, b) => adj(b.skill) - adj(a.skill) || b.share - a.share);
      const nx = left.shift(); out.push({ ...nx, bridge: bridgeOf(nx.skill) }); known.add(nx.skill);
    }
    return out;
    function adj(s) { const n = data.skillBy[s]?.neighbours || []; return n.filter((x) => known.has(x)).length * 0.5 + (data.skillBy[s] ? 0 : 0); }
    function bridgeOf(s) { const n = data.skillBy[s]?.neighbours || []; return n.find((x) => known.has(x)); }
  }, [missing.map((m) => m.skill).join("|"), mine.join("|")]);
  const weeks = path.reduce((a, s) => a + (s.weeks || 0), 0);
  const nearby = useMemo(() => centres ? path.slice(0, 4).map((s) => ({ skill: s.skill, list: centres.filter((c) => c.state === state && c.skills.includes(s.skill)) })) : [], [centres, path, state]);

  return (
    <div className="p-4 grid grid-cols-[360px_minmax(0,1fr)] gap-4">
      <div className="space-y-4">
        <Panel eyebrow="About you" title={<span className="flex items-center gap-1.5"><GraduationCap size={16} className="text-cyan" />Student profile</span>}>
          <label className="text-[12px] text-muted">Home state</label>
          <StateSelect value={state} onChange={(v) => v && setState(v)} allLabel={null} className="w-full mb-3 mt-1" />
          <label className="text-[12px] text-muted">Education</label>
          <div className="flex flex-wrap gap-1.5 mt-1 mb-3">{EDU.map(([k, l]) => <button key={k} onClick={() => setEdu(k)} className={`text-[12px] rounded-full px-2.5 py-1 border ${edu === k ? "bg-accent border-accent" : "border-line text-ink2"}`}>{l}</button>)}</div>
          <label className="text-[12px] text-muted">Skills you already have</label>
          <div className="mt-1"><SkillChips value={mine} onChange={setMine} /></div>
        </Panel>
        <Panel eyebrow="Ranked for you" title={<span className="flex items-center gap-1.5"><Wand2 size={15} className="text-cyan" />Careers you're closest to</span>}>
          <div className="space-y-1">
            {ranked.slice(0, 8).map((r) => (
              <button key={r.role} onClick={() => setRoleKey(r.role)} className={`w-full text-left rounded-lg px-2.5 py-2 border ${r.role === role.role ? "border-accent bg-accent/10" : "border-transparent hover:bg-white/5"}`}>
                <div className="flex justify-between text-[13px]"><span className="font-medium">{r.title}</span><span className="num text-cyan">{Math.round(r.match * 100)}%</span></div>
                <div className="text-[11px] text-muted">{r.cluster_name} · {r.salary_median_lpa ? `₹${r.salary_median_lpa} LPA median` : ""} · {fmt.pct(r.growth_12m)} demand{!r.eligible && " · needs higher qualification"}</div>
              </button>
            ))}
          </div>
          <select className="w-full mt-2" value={role.role} onChange={(e) => setRoleKey(e.target.value)}>
            {[...roles].sort((a, b) => a.title.localeCompare(b.title)).map((r) => <option key={r.role} value={r.role}>{r.title}</option>)}
          </select>
        </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        <div className="panel p-5 flex items-center gap-6 bg-gradient-to-r from-[#0f1d44] to-transparent">
          <Gauge v={match} />
          <div className="flex-1">
            <div className="eyebrow">Target career</div>
            <div className="text-[24px] font-semibold">{role.title}</div>
            <div className="text-[13px] text-ink2">{role.cluster_name} · NCO-2015 group {role.nco} ({data.meta.nco_groups[role.nco]})</div>
            <div className="flex gap-5 mt-2 text-[13px]">
              <span><IndianRupee size={13} className="inline text-cyan" /> <b className="num">₹{role.salary_p25_lpa}–{role.salary_p75_lpa} LPA</b> <span className="text-muted">(middle half of posted salaries)</span></span>
              <span><Route size={13} className="inline text-cyan" /> <b>{path.length}</b> skills to add · ~<b className="num">{weeks}</b> weeks</span>
              <span className="text-muted">Demand {fmt.pct(role.growth_12m)} next 12 mo</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
          <Panel eyebrow="Personalised learning path" title="What to learn, in order">
            <ol className="relative border-l border-line ml-2 space-y-3">
              {role.skills.filter((s) => mine.includes(s.skill)).map((s) => (
                <li key={s.skill} className="ml-4"><CheckCircle2 size={16} className="absolute -left-2 text-[#4cc24c] bg-panel rounded-full" /><div className="text-[13px] text-ink2">{s.skill} <span className="text-muted">— you have this</span></div></li>
              ))}
              {path.map((s, i) => (
                <li key={s.skill} className="ml-4">
                  <Circle size={16} className="absolute -left-2 text-cyan bg-panel rounded-full" />
                  <div className="flex justify-between gap-3">
                    <div className="text-[13.5px] font-medium">Step {i + 1}: {s.skill}</div>
                    <div className="text-[11.5px] num text-muted whitespace-nowrap">{Math.round(s.share * 100)}% of postings{s.premium_pct ? ` · pay ${s.premium_pct > 0 ? "+" : ""}${s.premium_pct}%` : ""}</div>
                  </div>
                  <div className="text-[12px] text-ink2">{s.training_route} · {s.weeks} weeks</div>
                  {s.bridge && <div className="text-[11.5px] text-cyan/90">Builds on your {s.bridge}</div>}
                </li>
              ))}
              {path.length === 0 && <li className="ml-4 text-[13px] text-cyan">You already cover this role's core skills. Apply now.</li>}
            </ol>
          </Panel>
          <div className="space-y-4">
            <Panel eyebrow="Where the jobs are" title={<span className="flex items-center gap-1.5"><MapPin size={15} className="text-cyan" />Top states hiring</span>}>
              <BarList rows={role.top_states.map((s) => ({ label: s.state, value: s.postings_12m }))} colorFn={(r) => (r.label === state ? SERIES[1] : SERIES[0])} valueFmt={fmt.int} />
              <div className="text-[11px] text-muted mt-1.5">Postings in the last 12 months. Your state is highlighted in orange.</div>
            </Panel>
            <Panel eyebrow={`Train near you · ${state}`} title="Centres teaching your next skills">
              {!centres ? <div className="text-muted text-[12px]">Loading…</div> : nearby.map((n) => (
                <div key={n.skill} className="mb-2">
                  <div className="text-[12.5px] font-medium">{n.skill} <span className="text-muted font-normal">· {n.list.length} centres</span></div>
                  <div className="text-[11.5px] text-ink2">{n.list.length ? n.list.slice(0, 3).map((c) => `${c.name} (${c.seats} seats)`).join(" · ") : `Not taught at ITIs/polytechnics here. Route: ${data.skillBy[n.skill]?.route}`}</div>
                </div>
              ))}
            </Panel>
          </div>
        </div>
        <DemoNote />
      </div>
    </div>
  );
}

function Gauge({ v }) {
  const r = 46, c = 2 * Math.PI * r;
  return (
    <div className="relative w-[120px] h-[120px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="#1d2945" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke="#22d3ee" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} style={{ filter: "drop-shadow(0 0 6px #22d3ee88)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className="text-[26px] font-semibold num">{Math.round(v * 100)}%</div><div className="text-[10px] text-muted -mt-1">skill match</div></div>
      </div>
    </div>
  );
}
