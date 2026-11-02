import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, School, GraduationCap, AlertTriangle } from "lucide-react";
import MapView from "../components/MapView";
import { useData, loadCentres } from "../data";
import { Panel, Kpi, StateSelect, SkillSelect, BarList, DemoNote, SeqLegend } from "../components/ui";
import { fmt, SERIES, seqColor, SEQ_BLUE } from "../theme";

const TYPE_COLOR = { "Govt ITI": SERIES[0], "Private ITI": SERIES[2], Polytechnic: SERIES[1] };

export default function Training() {
  const data = useData();
  const [state, setState] = useState(data.params.state || data.selState || null);
  const [skill, setSkill] = useState(null);
  const [centres, setCentres] = useState(null);
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
          <MapView geoStates={data.geo_states} geoDistricts={data.geo_districts} stateColor={stateColor} selected={state} onSelect={setState}
            points={pts} pointColor={(p) => TYPE_COLOR[p.type]}
            tooltip={(k, p) => k === "state" && <div><b>{p.state}</b><div className="num text-muted">{(seatsPerLakh[p.state] || 0).toFixed(0)} training seats per lakh population</div></div>}
            pointTooltip={(p) => <div><b>{p.name}</b><div className="text-muted">{p.type} · {p.seats} seats</div><div className="text-[11px] text-ink2 mt-1">{p.skills}</div></div>} />
          <div className="absolute top-3 left-3 glass p-3 flex gap-2 items-center">
            <StateSelect value={state} onChange={setState} />
            <SkillSelect value={skill} onChange={setSkill} allLabel="Any trade / skill" />
          </div>
          <div className="absolute bottom-3 left-3 glass p-3 w-[280px] space-y-2">
            <SeqLegend title="State fill: training seats per lakh population" ramp={SEQ_BLUE.slice(0, 5)} lo="fewer" hi="more" />
            <div className="flex gap-3 text-[11px] text-ink2">{Object.entries(TYPE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}</span>)}</div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Kpi icon={Building2} label="Centres shown" value={fmt.int(pts.length)} sub={state || "All India"} />
            <Kpi icon={School} label="Seats" value={fmt.compact(kpi.seats)} sub={`${Math.round(kpi.util * 100)}% avg utilisation`} />
            <Kpi icon={GraduationCap} label="Certified per year" value={fmt.compact(kpi.out)} sub="seats × utilisation × pass rate" />
            <Kpi label="Govt / Private ITI / Poly" value={`${kpi.byType["Govt ITI"]?.n || 0} / ${kpi.byType["Private ITI"]?.n || 0} / ${kpi.byType["Polytechnic"]?.n || 0}`} />
          </div>
          <Panel eyebrow={state || "All India"} title="Lowest training coverage" right={<span className="text-[11px] text-muted">graduates ÷ openings</span>}>
            <BarList rows={coverage} max={1} valueFmt={(v) => `${Math.round(v * 100)}%`} colorFn={(r) => (r.value < 0.1 ? "#d03b3b" : r.value < 0.3 ? "#ec835a" : SERIES[2])} />
            <div className="text-[11px] text-muted mt-2">Share of each year's openings that local ITIs/polytechnics can fill. Red = under 10%.</div>
          </Panel>
        </div>
      </div>
      <Panel eyebrow="Where to build or expand centres" title={<span className="flex items-center gap-1.5"><AlertTriangle size={15} className="text-warn" />Training deserts: high demand, few seats</span>} right={<DemoNote />}>
        <table className="data">
          <thead><tr><th>District</th><th>State</th><th className="!text-right">Postings (12 mo)</th><th className="!text-right">Per lakh pop.</th><th className="!text-right">Centres</th><th className="!text-right">Seats per lakh</th><th>Main sectors hiring</th></tr></thead>
          <tbody>{deserts.map((d) => (
            <tr key={d.code}><td className="font-medium">{d.name}</td><td className="text-ink2">{d.state}</td><td className="num text-right">{fmt.int(d.postings12)}</td>
              <td className="num text-right">{d.dpl.toFixed(1)}</td><td className="num text-right">{d.centres}</td><td className="num text-right text-[#f39b93]">{d.spl.toFixed(0)}</td>
              <td className="text-[11.5px] text-muted">{Object.entries(d.byCluster || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => data.clusters[c]).join(", ")}</td></tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}
