import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, School, GraduationCap, AlertTriangle, X } from "lucide-react";
import MapView from "../components/MapView";
import { useData, loadCentres } from "../data";
import { Panel, Kpi, StateSelect, SkillSelect, BarList, SeqLegend, InfoBox } from "../components/ui";
import { fmt, SERIES, STATUS, seqColor, SEQ_BLUE } from "../theme";

const typeColor = () => ({ "Govt ITI": SERIES[0], "Private ITI": SERIES[2], Polytechnic: SERIES[1] });

export default function Training() {
  const data = useData();
  const [state, setState] = useState(data.params.state || data.selState || null);
  const [skill, setSkill] = useState(null);
  const [centres, setCentres] = useState(null);
  const [pickD, setPickD] = useState(null);
  const TYPE_COLOR = typeColor();
  useEffect(() => { loadCentres().then(setCentres); }, []);

  const pts = useMemo(() => centres?.filter((c) => (!state || c.state === state) && (!skill || c.skills.includes(skill)))
    .map((c) => ({ ...c, r: c.type === "Polytechnic" ? 3.4 : 2.5 })) ?? [], [centres, state, skill]);
  const seatsPerLakh = useMemo(() => Object.fromEntries(data.states.map((s) => [s.state, (s.seats / Math.max(s.pop2011, 1)) * 1e5])), [data]);
  const maxSPL = Math.max(...Object.values(seatsPerLakh));
  const stateColor = useCallback((s) => seqColor(Math.sqrt((seatsPerLakh[s] || 0) / maxSPL) * 0.85, SEQ_BLUE), [seatsPerLakh, maxSPL]);

  const kpi = useMemo(() => {
    const byType = {};
    pts.forEach((c) => { const o = (byType[c.type] ||= { n: 0, seats: 0 }); o.n++; o.seats += c.seats; });
    const seats = pts.reduce((a, c) => a + c.seats, 0);
    const out = pts.reduce((a, c) => a + c.seats * c.util * 0.75 / (c.type === "Polytechnic" ? 3 : 2), 0);
    return { byType, seats, out, util: pts.length ? pts.reduce((a, c) => a + c.util, 0) / pts.length : 0 };
  }, [pts]);

  // coverage: how much of annual openings does training output cover, for skills that ITIs/polytechnics teach
  const coverage = useMemo(() => {
    const rows = data.gap.filter((r) => (!state || r.state === state) && r.cluster !== "CS");
    const agg = {};
    rows.forEach((r) => { const o = (agg[r.skill] ||= { o: 0, t: 0 }); o.o += r.openings; o.t += r.availTr; });
    return Object.entries(agg).filter(([, o]) => o.t > 0 && o.o > 500).map(([s, o]) => ({ label: s, value: Math.min(o.t / o.o, 1.5), o: o.o, t: o.t }))
      .sort((a, b) => a.value - b.value).slice(0, 10);
  }, [data, state]);

  // training deserts: districts with demand but few seats
  const deserts = useMemo(() => data.districts.filter((d) => (!state || d.state === state) && d.postings12 >= 15)
    .map((d) => ({ ...d, dpl: (d.postings12 / d.pop) * 1e5, spl: (d.seats / d.pop) * 1e5 }))
    .map((d) => ({ ...d, score: d.dpl / (d.spl + 5) })).sort((a, b) => b.score - a.score).slice(0, 8), [data, state]);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4">
        <div className="panel relative overflow-hidden h-[600px]">
          <MapView geoStates={data.geo_states} geoDistricts={data.geo_districts} stateColor={stateColor} selected={state} onSelect={setState} mode={data.mode}
            points={pts} pointColor={(p) => typeColor()[p.type]} label="Map of training centres" padTop={80}
            tooltip={(k, p) => k === "state" && <div><b>{p.state}</b><div className="num text-muted">{(seatsPerLakh[p.state] || 0).toFixed(0)} training seats per lakh people</div></div>}
            pointTooltip={(p) => <div><b>{p.name}</b><div className="text-muted">{p.type} · {p.seats} seats</div><div className="text-[12px] text-ink2 mt-1">{p.skills}</div></div>} />
          {state && <button onClick={() => setState(null)} className="absolute top-3 right-3 glass px-3 py-2 text-[14px] font-medium flex items-center gap-1.5 hover:border-accent"><X size={15} />Back to India</button>}
          <div className="absolute top-3 left-3 glass p-3 flex gap-2 items-center">
            <StateSelect value={state} onChange={setState} />
            <SkillSelect value={skill} onChange={setSkill} allLabel="Any skill" />
          </div>
          <div className="absolute bottom-3 left-3 glass p-3 w-[280px] space-y-2">
            <SeqLegend title="Training seats per person" ramp={SEQ_BLUE.slice(0, 5)} lo="fewer" hi="more" />
            <div className="flex gap-3 text-[12px] text-ink2">{Object.entries(TYPE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}</span>)}</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi icon={Building2} label="Training centres" value={fmt.int(pts.length)} sub={state || "All India"} />
            <Kpi icon={School} label="Seats" value={fmt.compact(kpi.seats)} sub={`${Math.round(kpi.util * 100)}% filled`} />
            <div className="col-span-2"><Kpi icon={GraduationCap} label="People who finish training each year" value={fmt.compact(kpi.out)} /></div>
          </div>
          <Panel eyebrow={state || "All India"} title="Skills with too little training"
            info={<>For each skill: how many of the year's jobs local ITIs and polytechnics can fill. 20% means trainees cover only 1 in 5 jobs. Red bars are under 10%.</>}>
            <BarList rows={coverage} max={1} valueFmt={(v) => `${Math.round(v * 100)}%`} colorFn={(r) => (r.value < 0.1 ? STATUS.critical : r.value < 0.3 ? STATUS.serious : SERIES[2])} />
          </Panel>
        </div>
      </div>
      <Panel title={<span className="flex items-center gap-1.5"><AlertTriangle size={16} className="text-warn" />Places that need more training centres</span>}
        info={<>Districts with many job posts but few training seats for the number of people who live there. Click a row for details.</>}>
        {pickD && (() => { const d = deserts.find((x) => x.code === pickD); return d && (
          <InfoBox onClose={() => setPickD(null)}>
            <b className="text-ink">{d.name}, {d.state}</b> had <b className="num">{fmt.int(d.postings12)}</b> job posts last year but has only <b className="num">{d.centres}</b> training centres
            (<b className="num">{d.spl.toFixed(0)}</b> seats per lakh people). Most jobs are in {Object.entries(d.byCluster || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => data.clusters[c]).join(", ")}.
          </InfoBox>); })()}
        <table className="data">
          <thead><tr><th>District</th><th>State</th><th className="!text-right">Job posts (1 yr)</th><th className="!text-right">Training centres</th><th className="!text-right">Seats per lakh people</th></tr></thead>
          <tbody>{deserts.map((d) => (
            <tr key={d.code} onClick={() => setPickD(d.code)} className={`cursor-pointer ${pickD === d.code ? "bg-panel2" : ""}`}>
              <td className="font-medium"><button className="text-left hover:text-cyan" onClick={() => setPickD(d.code)}>{d.name}</button></td><td className="text-ink2">{d.state}</td><td className="num text-right">{fmt.int(d.postings12)}</td>
              <td className="num text-right">{d.centres}</td><td className="num text-right text-short font-semibold">{d.spl.toFixed(0)}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}
