import { useMemo, useState } from "react";
import { Scale, Wallet, Download, Info } from "lucide-react";
import { useData, allocate } from "../data";
import { Panel, Kpi, StateSelect, ClusterSelect, SgiChip, ConfDot, BarList, DemoNote } from "../components/ui";
import { fmt, SERIES } from "../theme";

const COMP = {
  shortage: ["Size of shortage", SERIES[7]], sgi: ["Gap severity", SERIES[1]], growth: ["Demand growth", SERIES[6]],
  wage: ["Wage premium", SERIES[3]], training_gap: ["Training gap", SERIES[2]], youth_unemployment: ["Youth unemployment", SERIES[0]],
};

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
        <Panel eyebrow="Policy priorities" title={<span className="flex items-center gap-1.5"><Scale size={15} className="text-cyan" />What matters most?</span>}>
          <div className="space-y-3">
            {data.comps.map((k) => (
              <div key={k}>
                <div className="flex justify-between text-[12.5px]"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COMP[k][1] }} />{COMP[k][0]}</span><span className="num text-muted">{Math.round(w[k] * 100)}</span></div>
                <input type="range" min={0} max={0.6} step={0.05} value={w[k]} onChange={(e) => setW({ ...w, [k]: +e.target.value })} />
              </div>
            ))}
          </div>
          <button className="mt-2 text-[12px] text-cyan" onClick={() => setW({ ...data.priorityWeights })}>Reset to default</button>
        </Panel>
        <Panel eyebrow="Budget optimiser" title={<span className="flex items-center gap-1.5"><Wallet size={15} className="text-cyan" />Allocate a training budget</span>}>
          <label className="text-[12.5px] text-ink2">Budget: <b className="text-ink num">₹{budget} crore</b></label>
          <input type="range" min={50} max={3000} step={50} value={budget} onChange={(e) => setBudget(+e.target.value)} />
          <label className="text-[12.5px] text-ink2 block mt-2">Course completion: <b className="text-ink">{Math.round(completion * 100)}%</b></label>
          <input type="range" min={0.4} max={1} step={0.05} value={completion} onChange={(e) => setCompletion(+e.target.value)} />
          <label className="text-[12.5px] text-ink2 block mt-2">Placement after course: <b className="text-ink">{Math.round(placement * 100)}%</b></label>
          <input type="range" min={0.2} max={0.9} step={0.05} value={placement} onChange={(e) => setPlacement(+e.target.value)} />
          <label className="text-[12.5px] text-ink2 block mt-2">Max trainees per programme / yr: <b className="text-ink num">{fmt.int(cohort)}</b></label>
          <input type="range" min={2000} max={100000} step={1000} value={cohort} onChange={(e) => setCohort(+e.target.value)} />
          <div className="text-[11px] text-muted mt-2 flex gap-1.5"><Info size={12} className="shrink-0 mt-0.5" />Funds the best priority-per-rupee programmes first, never training more people than the shortage needs or one programme can absorb in a year. Only courses of 4+ weeks are funded on their own. The API runs the same as a linear programme with per-state capacity caps.</div>
        </Panel>
      </div>

      <div className="space-y-4 min-w-0">
        <div className="grid grid-cols-4 gap-3">
          <Kpi label="People to train" value={fmt.compact(totals.t)} sub={`${alloc.length} state × skill programmes`} />
          <Kpi label="Expected placements" value={fmt.compact(totals.p)} sub={`${Math.round(completion * placement * 100)}% of trainees`} tone="good" />
          <Kpi label="Budget used" value={fmt.inr(totals.s)} sub={`of ₹${budget} crore`} />
          <Kpi label="Cost per placement" value={fmt.inr(totals.s / Math.max(totals.p, 1))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Panel title="Where the money goes" eyebrow="Spend by state"><BarList rows={byState} valueFmt={fmt.inr} color={SERIES[0]} /></Panel>
          <Panel title="What people are trained in" eyebrow="Placements by skill"><BarList rows={bySkill} color={SERIES[2]} /></Panel>
        </div>
        <Panel eyebrow="Ranked by your priorities" title="Where to invest, and why"
          right={<div className="flex gap-2 items-center"><StateSelect value={state} onChange={setState} /><ClusterSelect value={cluster} onChange={setCluster} />
            <button onClick={csv} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] hover:border-accent"><Download size={13} />{copied || "CSV"}</button></div>}>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
            <table className="data">
              <thead><tr><th>#</th><th>State</th><th>Skill</th><th className="!text-right">Score</th><th className="w-[230px]">Why (score breakdown)</th><th className="!text-right">Shortage</th><th className="!text-right">Gap</th><th className="!text-right">Growth</th><th className="!text-right">Pay +</th><th></th><th className="!text-right">Funded</th></tr></thead>
              <tbody>{view.slice(0, 60).map((r, i) => {
                const a = alloc.find((x) => x.state === r.state && x.skill === r.skill);
                return (
                  <tr key={r.state + r.skill}>
                    <td className="text-muted num">{i + 1}</td><td>{r.state}</td><td className="font-medium">{r.skill}</td>
                    <td className="num text-right font-semibold">{r.priority.toFixed(1)}</td>
                    <td><div className="flex h-2.5 gap-[2px] rounded overflow-hidden" title={Object.entries(r.parts).map(([k, v]) => `${COMP[k][0]}: ${v.toFixed(1)}`).join("\n")}>
                      {data.comps.map((k) => <div key={k} style={{ width: `${r.parts[k] * 1.4}%`, background: COMP[k][1] }} />)}</div></td>
                    <td className="num text-right">{fmt.compact(r.shortage)}</td><td className="text-right"><SgiChip v={r.sgi} /></td>
                    <td className="num text-right">{fmt.pct(r.growth)}</td><td className="num text-right">{r.premium ? `${r.premium > 0 ? "+" : ""}${r.premium.toFixed(0)}%` : "–"}</td>
                    <td><ConfDot c={r.conf} /></td>
                    <td className="num text-right">{a ? <button className="text-cyan" onClick={() => data.go("simulator", { state: r.state, skill: r.skill, n: a.trainees })}>{fmt.compact(a.trainees)}</button> : <span className="text-muted">–</span>}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <DemoNote className="mt-2" />
        </Panel>
      </div>
    </div>
  );
}
