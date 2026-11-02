import { useMemo, useState } from "react";
import { FlaskConical, Zap, Info } from "lucide-react";
import { useData, simulate } from "../data";
import { Panel, StateSelect, SkillSelect, SgiChip, DemoNote } from "../components/ui";
import { MultiLine } from "../components/charts";
import { fmt, SERIES } from "../theme";

const PRESETS = [
  ["Punjab", "Solar PV Installation", 10000, "Punjab trains 10,000 solar technicians"],
  ["Bihar", "Nursing", 20000, "Bihar trains 20,000 nurses"],
  ["Gujarat", "Semiconductor Fab & OSAT", 6000, "Gujarat trains 6,000 chip-plant technicians"],
  ["Tamil Nadu", "EV Battery & Powertrain", 8000, "Tamil Nadu trains 8,000 EV technicians"],
];

export default function Simulator() {
  const data = useData();
  const p = data.params;
  const [state, setState] = useState(p.state || "Punjab");
  const [skill, setSkill] = useState(p.skill || "Solar PV Installation");
  const [trainees, setTrainees] = useState(+p.n || 10000);
  const sk = data.skillBy[skill];
  const [cost, setCost] = useState(sk?.cost || 10000);
  const [completion, setCompletion] = useState(data.meta.assumptions.completion);
  const [placement, setPlacement] = useState(data.meta.assumptions.placement);
  const row = data.gapBy[state]?.[skill];

  const res = useMemo(() => row && sk ? simulate(row, sk, { trainees, cost, completion, placement }) : null, [row, sk, trainees, cost, completion, placement]);
  const alternatives = useMemo(() => {
    if (!res) return [];
    const budget = trainees * cost;
    return data.gap.filter((r) => r.state === state && r.cluster !== "CS" && r.openings - r.available > 0 && r.conf > 0 && r.skill !== skill)
      .map((r) => {
        const s = data.skillBy[r.skill];
        const n = Math.min(budget / Math.max(s.cost, 1000), (r.openings - r.available) / (completion * placement));
        return { skill: r.skill, placed: Math.round(n * completion * placement), cost: s.cost };
      }).sort((a, b) => b.placed - a.placed).slice(0, 3);
  }, [res, data, state, skill, trainees, cost, completion, placement]);

  const choose = (st, s, n) => { setState(st); setSkill(s); setTrainees(n); setCost(data.skillBy[s].cost); };
  const maxTrainees = row ? Math.max(5000, Math.ceil((Math.max(row.openings - row.available, 0) / (completion * placement)) * 1.5 / 1000) * 1000) : 50000;

  return (
    <div className="p-4 space-y-4">
      <div className="panel px-5 py-4 flex items-center justify-between gap-4 bg-gradient-to-r from-[#0f1d44] to-transparent">
        <div>
          <div className="eyebrow text-cyan flex items-center gap-1.5"><FlaskConical size={12} />Scenario modelling</div>
          <div className="text-[22px] font-semibold">Intervention Simulator</div>
          <div className="text-[13px] text-ink2">Set a training programme and see how much of the skill gap it closes, how fast, and at what cost.</div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end max-w-[560px]">
          {PRESETS.map(([st, s, n, l]) => (
            <button key={l} onClick={() => choose(st, s, n)} className="text-[12px] rounded-full border border-line px-3 py-1.5 hover:border-cyan hover:text-cyan flex items-center gap-1"><Zap size={12} />{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-4">
        <Panel eyebrow="Parameters" title="Adjustment levers">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StateSelect value={state} onChange={(v) => v && setState(v)} allLabel={null} />
            <SkillSelect value={skill} onChange={(v) => { if (v) { setSkill(v); setCost(data.skillBy[v].cost); } }} />
          </div>
          <Lever label="People trained" value={fmt.int(trainees)} min={500} max={maxTrainees} step={500} v={trainees} set={setTrainees} />
          <Lever label="Cost per trainee" value={fmt.inr(cost)} min={1000} max={Math.max(150000, cost * 2)} step={500} v={cost} set={setCost} />
          <Lever label="Course completion rate" value={`${Math.round(completion * 100)}%`} min={0.3} max={1} step={0.05} v={completion} set={setCompletion} />
          <Lever label="Placement rate after course" value={`${Math.round(placement * 100)}%`} min={0.1} max={0.95} step={0.05} v={placement} set={setPlacement} />
          {row && sk && (
            <div className="mt-4 rounded-xl border border-line bg-[#0a1122] p-3 text-[12px] space-y-1.5">
              <div className="eyebrow mb-1">Baseline for {skill} in {state}</div>
              <Row k="Openings per year" v={fmt.int(row.openings)} />
              <Row k="Available per year (jobseekers + trainees)" v={fmt.int(row.available)} />
              <Row k="Annual shortage" v={<b className={row.openings - row.available > 0 ? "text-[#f39b93]" : "text-[#86b6ef]"}>{fmt.int(row.openings - row.available)}</b>} />
              <Row k="Gap index now → 12 months" v={<span className="flex gap-1"><SgiChip v={row.sgi} /><SgiChip v={row.sgi2} /></span>} />
              <Row k="Forecast demand growth" v={fmt.pct(row.growth)} />
              <Row k="Training route" v={<span className="text-right">{sk.route} · {sk.weeks} wks</span>} />
            </div>
          )}
        </Panel>

        <div className="space-y-4 min-w-0">
          {res ? <>
            <div className="grid grid-cols-4 gap-3">
              <Big label="Gap closed" value={`${Math.round(res.closed * 100)}%`} sub={`of ${fmt.compact(res.shortage)} annual shortage`} accent />
              <Big label="People placed" value={fmt.compact(res.placed)} sub={`${fmt.compact(res.completers)} complete the course`} />
              <Big label="Cost per placement" value={fmt.inr(res.costPerPlacement)} sub={`total ${fmt.inr(res.cost)}`} />
              <Big label="Annual wages created" value={fmt.inr(res.wage)} sub={`${(res.wage / Math.max(res.cost, 1)).toFixed(1)}× programme cost`} good />
            </div>
            <Panel eyebrow={`${res.months}-month projection`} title="Unfilled openings, cumulative" right={<span className="text-[11.5px] text-muted">first placements in month {res.trainM + 1}</span>}>
              <MultiLine rows={res.series} xKey="month" height={290}
                series={[{ key: "baseline", name: "No programme", color: "#7d88a3", dash: "5 4" }, { key: "programme", name: "With programme", color: SERIES[0] }]} />
              <div className="text-[12.5px] text-ink2 mt-1">Over {res.months} months the programme fills <b className="text-ink num">{fmt.int(res.avoided)}</b> openings that would otherwise stay vacant.</div>
            </Panel>
            {alternatives.length > 0 && (
              <Panel eyebrow={`Same budget (${fmt.inr(res.cost)}) in ${state}`} title="Compare: other skills short here">
                <div className="grid grid-cols-3 gap-3">
                  {alternatives.map((a) => (
                    <button key={a.skill} onClick={() => { setSkill(a.skill); setCost(a.cost); setTrainees(Math.round(res.cost / a.cost / 500) * 500 || 500); }}
                      className="text-left rounded-xl border border-line bg-[#0a1122] p-3 hover:border-accent">
                      <div className="text-[13px] font-medium">{a.skill}</div>
                      <div className="text-[12px] text-muted num">{fmt.compact(a.placed)} placements · {fmt.inr(a.cost)}/trainee</div>
                      <div className={`text-[11.5px] mt-1 ${a.placed > res.placed ? "text-cyan" : "text-muted"}`}>{a.placed > res.placed ? `${(a.placed / Math.max(res.placed, 1)).toFixed(1)}× more people placed` : "fewer placements"}</div>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
          </> : <Panel><div className="text-muted py-16 text-center">No gap estimate for {skill} in {state}.</div></Panel>}
          <div className="text-[11.5px] text-muted flex gap-1.5"><Info size={13} className="shrink-0" />Openings grow with the demand forecast; supply grows 3%/yr; placements arrive over 3 months after the course ends. Wage figure uses the skill's median posted salary. <DemoNote /></div>
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => <div className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="num text-ink">{v}</span></div>;

function Lever({ label, value, min, max, step, v, set }) {
  return (
    <div className="mb-3.5">
      <div className="flex justify-between text-[13px] mb-1"><span className="text-ink2">{label}</span><span className="num rounded-md bg-[#0a1122] border border-line px-2 py-0.5 text-[12px]">{value}</span></div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} />
    </div>
  );
}

function Big({ label, value, sub, accent, good }) {
  return (
    <div className={`glass px-4 py-3 ${accent ? "border-cyan/50 shadow-[0_0_30px_#22d3ee22]" : ""}`}>
      <div className="eyebrow">{label}</div>
      <div className={`text-[28px] font-semibold num leading-tight mt-1 ${accent ? "text-cyan glow-text" : good ? "text-[#4cc24c]" : ""}`}>{value}</div>
      <div className="text-[11.5px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}
