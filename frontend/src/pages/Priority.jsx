import { useMemo, useState } from "react";
import { Scale, Wallet, Download, ChevronDown } from "lucide-react";
import { useData, allocate } from "../data";
import { Panel, Kpi, StateSelect, ClusterSelect, SgiChip, ConfDot, BarList, DemoNote, Collapse } from "../components/ui";
import { fmt, SERIES } from "../theme";

// [label, colour] - a function so colours follow the light/dark theme
const comp = () => ({
  shortage: ["How many jobs are unfilled", SERIES[7]], sgi: ["How severe the gap is", SERIES[1]], growth: ["How fast jobs are growing", SERIES[6]],
  wage: ["Extra pay the skill brings", SERIES[3]], training_gap: ["How little training exists", SERIES[2]], youth_unemployment: ["Young people without jobs", SERIES[0]],
});

export default function Priority() {
  const data = useData();
  const [w, setW] = useState({ ...data.priorityWeights });
  const [cohort, setCohort] = useState(20000);
  const [state, setState] = useState(data.params.state || null);
  const [cluster, setCluster] = useState(null);
  const [budget, setBudget] = useState(500); // crore
  const [completion, setCompletion] = useState(0.8);
  const [placement, setPlacement] = useState(0.55);
  const [copied, setCopied] = useState("");
  const [open, setOpen] = useState(null);
  const COMP = comp();

  const scored = useMemo(() => {
    const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return data.priority.map((r) => {
      let p = 0; const parts = {};
      for (const k of data.comps) { parts[k] = (w[k] / tot) * r.c[k] * 100; p += parts[k]; }
      if (r.conf === 0) p *= 0.6;
      return { ...r, priority: p, parts };
    }).sort((a, b) => b.priority - a.priority);
  }, [data, w]);
  const view = scored.filter((r) => (!state || r.state === state) && (!cluster || r.cluster === cluster));
  const alloc = useMemo(() => allocate(scored.filter((r) => (!state || r.state === state) && (!cluster || r.cluster === cluster)), data.skillBy, budget * 1e7, completion, placement, cohort), [scored, budget, completion, placement, cohort, state, cluster, data]);
  const totals = alloc.reduce((a, r) => ({ t: a.t + r.trainees, p: a.p + r.placements, s: a.s + r.spend }), { t: 0, p: 0, s: 0 });
  const byState = useMemo(() => {
    const m = {}; alloc.forEach((r) => (m[r.state] = (m[r.state] || 0) + r.spend));
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [alloc]);
  const bySkill = useMemo(() => {
    const m = {}; alloc.forEach((r) => (m[r.skill] = (m[r.skill] || 0) + r.placements));
    return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [alloc]);

  const csv = () => {
    const rows = [["state", "skill", "priority", "shortage", "trainees", "spend_inr", "expected_placements"], ...alloc.map((r) => [r.state, r.skill, r.priority.toFixed(1), r.shortage, r.trainees, r.spend, r.placements])];
    const text = rows.map((r) => r.join(",")).join("\n");
    if (window.self !== window.top) {   // hosted/sandboxed view: downloads are blocked, copy instead
      navigator.clipboard.writeText(text).then(() => setCopied("CSV copied"), () => setCopied("Copy blocked"));
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `skillnet_allocation_${budget}cr.csv`; a.click();
  };

  return (
    <div className="p-4 grid grid-cols-[320px_minmax(0,1fr)] gap-4">
      <div className="space-y-4">
        <Panel title={<span className="flex items-center gap-1.5"><Scale size={16} className="text-cyan" />What matters most to you?</span>}
          info={<>Each slider sets how much one factor counts when ranking where to train people. The list on the right re-ranks as you move them.</>}>
          <div className="space-y-3">
            {data.comps.map((k) => (
              <div key={k}>
                <div className="flex justify-between text-[13.5px]"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COMP[k][1] }} />{COMP[k][0]}</span><span className="num text-muted">{Math.round(w[k] * 100)}</span></div>
                <input type="range" aria-label={COMP[k][0]} min={0} max={0.6} step={0.05} value={w[k]} onChange={(e) => setW({ ...w, [k]: +e.target.value })} />
              </div>
            ))}
          </div>
          <button className="mt-2 text-[13px] text-cyan underline" onClick={() => setW({ ...data.priorityWeights })}>Reset</button>
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><Wallet size={16} className="text-cyan" />Your training budget</span>}
          info={<>Money goes first to the programmes that give the most value per rupee. No programme trains more people than the jobs need, or more than it can handle in a year. Only courses of 4 weeks or more are funded.</>}>
          <label className="text-[13.5px] text-ink2">Budget: <b className="text-ink num">₹{budget} crore</b></label>
          <input type="range" aria-label="Budget in crore" min={50} max={3000} step={50} value={budget} onChange={(e) => setBudget(+e.target.value)} />
          <Collapse title="More settings" className="mt-3">
          <label className="text-[13.5px] text-ink2 block">People who finish the course: <b className="text-ink">{Math.round(completion * 100)}%</b></label>
          <input type="range" aria-label="Course completion" min={0.4} max={1} step={0.05} value={completion} onChange={(e) => setCompletion(+e.target.value)} />
          <label className="text-[13.5px] text-ink2 block mt-2">Of those, people who get a job: <b className="text-ink">{Math.round(placement * 100)}%</b></label>
          <input type="range" aria-label="Placement rate" min={0.2} max={0.9} step={0.05} value={placement} onChange={(e) => setPlacement(+e.target.value)} />
          <label className="text-[13.5px] text-ink2 block mt-2">Most trainees one programme can take a year: <b className="text-ink num">{fmt.int(cohort)}</b></label>
          <input type="range" aria-label="Maximum trainees per programme" min={2000} max={100000} step={1000} value={cohort} onChange={(e) => setCohort(+e.target.value)} />
          </Collapse>
                  </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="People to train" value={fmt.compact(totals.t)} sub={`${alloc.length} programmes`} />
          <Kpi label="Expected to get jobs" value={fmt.compact(totals.p)} sub={`${Math.round(completion * placement * 100)}% of trainees`} tone="good" />
          <Kpi label="Budget used" value={fmt.inr(totals.s)} sub={`of ₹${budget} crore`} />
          <Kpi label="Cost per job" value={fmt.inr(totals.s / Math.max(totals.p, 1))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Where the money goes"><BarList rows={byState} valueFmt={fmt.inr} color={SERIES[0]} /></Panel>
          <Panel title="Jobs filled, by skill"><BarList rows={bySkill} color={SERIES[2]} /></Panel>
        </div>
        <Panel title={<span className="whitespace-nowrap">Best places to invest</span>} info={<>Ranked by the priorities you set on the left. Click any row to see why it ranks there.</>}
          right={<div className="flex gap-2 items-center"><StateSelect value={state} onChange={setState} className="w-[150px]" /><ClusterSelect value={cluster} onChange={setCluster} className="w-[150px]" />
            <button onClick={csv} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[13px] hover:border-accent"><Download size={14} />{copied || "Download"}</button></div>}>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-line">
            <table className="data">
              <thead><tr><th>#</th><th>Where</th><th>Skill</th><th className="w-[200px]">Score</th><th className="!text-right">People funded</th><th className="w-8"><span className="sr-only">Details</span></th></tr></thead>
              <tbody>{view.slice(0, 60).map((r, i) => {
                const a = alloc.find((x) => x.state === r.state && x.skill === r.skill);
                const id = r.state + "|" + r.skill, on = open === id;
                return [
                  <tr key={id} onClick={() => setOpen(on ? null : id)} className={`cursor-pointer ${on ? "bg-panel2" : ""}`}>
                    <td className="text-muted num">{i + 1}</td><td>{r.state}</td><td className="font-medium">{r.skill}</td>
                    <td><div className="flex items-center gap-2"><div className="flex-1 h-2.5 rounded-full overflow-hidden bg-panel2"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, r.priority * 1.4)}%` }} /></div><span className="num text-[13px] w-8 text-right">{r.priority.toFixed(0)}</span></div></td>
                    <td className="num text-right">{a ? fmt.compact(a.trainees) : <span className="text-muted text-[12px]">Not in budget</span>}</td>
                    <td><button aria-expanded={on} aria-label={`Why ${r.skill} in ${r.state} ranks here`} onClick={(e) => { e.stopPropagation(); setOpen(on ? null : id); }}><ChevronDown size={16} className={`transition ${on ? "rotate-180" : ""}`} /></button></td>
                  </tr>,
                  on && <tr key={id + "x"}><td colSpan={6} className="!bg-panel2">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 py-1">
                      <div>
                        <div className="text-[13.5px] font-semibold mb-1.5">Why it ranks here</div>
                        {data.comps.map((k) => (
                          <div key={k} className="grid grid-cols-[minmax(0,1fr)_120px_36px] items-center gap-2 text-[13px] py-0.5">
                            <span className="text-ink2">{COMP[k][0]}</span>
                            <span className="h-2 rounded-full bg-panel overflow-hidden"><span className="block h-full" style={{ width: `${Math.min(100, r.parts[k] * 4)}%`, background: COMP[k][1] }} /></span>
                            <span className="num text-right text-muted">{r.parts[k].toFixed(1)}</span>
                          </div>))}
                      </div>
                      <div className="text-[13.5px] space-y-1">
                        <div className="flex justify-between"><span className="text-muted">Unfilled jobs a year</span><b className="num">{fmt.int(r.shortage)}</b></div>
                        <div className="flex justify-between"><span className="text-muted">Gap score</span><SgiChip v={r.sgi} /></div>
                        <div className="flex justify-between"><span className="text-muted">Job growth</span><b className="num">{fmt.pct(r.growth)}</b></div>
                        <div className="flex justify-between"><span className="text-muted">Extra pay</span><b className="num">{r.premium ? `${r.premium > 0 ? "+" : ""}${r.premium.toFixed(0)}%` : "–"}</b></div>
                        <div className="flex justify-between items-center"><span className="text-muted">Certainty</span><span className="flex items-center gap-1.5"><ConfDot c={r.conf} />{["Low", "Medium", "High"][r.conf ?? 0]}</span></div>
                        {a && data.can("simulator") && <button className="mt-2 rounded-full bg-accent text-onaccent px-3 py-1.5 text-[13px] font-semibold" onClick={() => data.go("simulator", { state: r.state, skill: r.skill, n: a.trainees })}>Try this plan</button>}
                      </div>
                    </div>
                  </td></tr>,
                ];
              })}</tbody>
            </table>
          </div>
          <DemoNote className="mt-2" />
        </Panel>
      </div>
    </div>
  );
}
