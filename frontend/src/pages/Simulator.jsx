import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { useData, simulate } from "../data";
import { Panel, StateSelect, SkillSelect, SgiChip, Collapse, Explain } from "../components/ui";
import { MultiLine } from "../components/charts";
import { fmt, SERIES, C } from "../theme";

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
      <div className="panel px-5 py-3.5 space-y-2">
        <div className="text-[15px] font-semibold">What happens if we train people?</div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[13px] text-muted">Examples:</span>
          {PRESETS.map(([st, s, n, l]) => (
            <button key={l} onClick={() => choose(st, s, n)} className="text-[13px] rounded-full border border-line px-3 py-1.5 hover:border-accent hover:text-ink flex items-center gap-1"><Zap size={13} className="text-cyan" />{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] gap-4">
        <Panel title="Your plan">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StateSelect value={state} onChange={(v) => v && setState(v)} allLabel={null} />
            <SkillSelect value={skill} onChange={(v) => { if (v) { setSkill(v); setCost(data.skillBy[v].cost); } }} />
          </div>
          <Lever label="People to train" value={fmt.int(trainees)} min={500} max={maxTrainees} step={500} v={trainees} set={setTrainees} />
          <Lever label="Cost per trainee" value={fmt.inr(cost)} min={1000} max={Math.max(150000, cost * 2)} step={500} v={cost} set={setCost} />
          <Lever label="Finish the course" value={`${Math.round(completion * 100)}%`} min={0.3} max={1} step={0.05} v={completion} set={setCompletion} />
          <Lever label="Get a job after" value={`${Math.round(placement * 100)}%`} min={0.1} max={0.95} step={0.05} v={placement} set={setPlacement} />
          {row && sk && (
            <Collapse title={`Today: ${skill} in ${state}`} open className="mt-2">
            <div className="rounded-xl border border-line bg-panel2 p-3 text-[13px] space-y-1.5">
              <Row k="Jobs a year" v={fmt.int(row.openings)} />
              <Row k="Trained people a year" v={fmt.int(row.available)} />
              <Row k="Shortage a year" v={<b className={row.openings - row.available > 0 ? "text-short" : "text-surplus"}>{fmt.int(row.openings - row.available)}</b>} />
              <Row k="Gap score now → in 1 year" v={<span className="flex gap-1"><SgiChip v={row.sgi} /><SgiChip v={row.sgi2} /></span>} />
              <Row k="Job growth" v={fmt.pct(row.growth)} />
              <Row k="Course" v={<span className="text-right">{sk.route} · {sk.weeks} weeks</span>} />
            </div>
            </Collapse>
          )}
        </Panel>

        <div className="space-y-4 min-w-0">
          {res ? <>
            <div className="grid grid-cols-4 gap-3">
              <Big label="Shortage closed" value={`${Math.round(res.closed * 100)}%`} sub={`of ${fmt.compact(res.shortage)} unfilled jobs a year`} accent />
              <Big label="People who get jobs" value={fmt.compact(res.placed)} sub={`${fmt.compact(res.completers)} finish the course`} />
              <Big label="Cost per job" value={fmt.inr(res.costPerPlacement)} sub={`total ${fmt.inr(res.cost)}`} />
              <Big label="Wages earned a year" value={fmt.inr(res.wage)} sub={`${(res.wage / Math.max(res.cost, 1)).toFixed(1)}× what it costs`} good />
            </div>
            <Panel title={`Unfilled jobs over the next ${res.months} months`} info={<>Dashed line: no training. Solid line: with your plan. The first trainees start jobs in month {res.trainM + 1}. Jobs grow with the forecast, the number of trained people grows 3% a year, and wages use the typical posted salary.</>}>
              <MultiLine rows={res.series} xKey="month" height={290}
                series={[{ key: "baseline", name: "Without the plan", color: C.baseline, dash: "5 4" }, { key: "programme", name: "With your plan", color: SERIES[1] }]} />
              <div className="text-[13.5px] text-ink2 mt-1">Your plan fills <b className="text-ink num">{fmt.int(res.avoided)}</b> jobs that would otherwise stay empty.</div>
            </Panel>
            {alternatives.length > 0 && (
              <Panel title={`Same money (${fmt.inr(res.cost)}), other skills in ${state}`}>
                <div className="grid grid-cols-3 gap-3">
                  {alternatives.map((a) => (
                    <button key={a.skill} onClick={() => { setSkill(a.skill); setCost(a.cost); setTrainees(Math.round(res.cost / a.cost / 500) * 500 || 500); }}
                      className="text-left rounded-xl border border-line bg-panel2 p-3 hover:border-accent">
                      <div className="text-[14px] font-medium">{a.skill}</div>
                      <div className="text-[13px] text-muted num">{fmt.compact(a.placed)} people get jobs</div>
                      <div className={`text-[12.5px] mt-1 ${a.placed > res.placed ? "text-cyan" : "text-muted"}`}>{a.placed > res.placed ? `${(a.placed / Math.max(res.placed, 1)).toFixed(1)}× more jobs filled` : "fewer jobs filled"}</div>
                    </button>
                  ))}
                </div>
              </Panel>
            )}
          </> : <Panel><div className="text-muted py-16 text-center">No figures for {skill} in {state}. Try another skill.</div></Panel>}
          
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => <div className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="num text-ink">{v}</span></div>;

function Lever({ label, value, min, max, step, v, set }) {
  return (
    <div className="mb-3.5">
      <div className="flex justify-between text-[14px] mb-1"><span className="text-ink2">{label}</span><span className="num rounded-md bg-panel2 border border-line px-2 py-0.5 text-[13px]">{value}</span></div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={v} onChange={(e) => set(+e.target.value)} />
    </div>
  );
}

function Big({ label, value, sub, accent, good }) {
  return (
    <div className={`panel px-4 py-3 ${accent ? "!border-saffron border-2" : ""}`}>
      <div className="eyebrow">{label}</div>
      <div className={`text-[28px] font-semibold num leading-tight mt-1 ${accent ? "text-cyan" : good ? "text-good" : ""}`}>{value}</div>
      <div className="text-[12.5px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}
