import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Users, Briefcase, Gauge, Building2, FileSearch, ArrowRight, Box, X, Sparkles } from "lucide-react";
import MapView from "../components/MapView";
import { useData, stateMetric, loadCentres } from "../data";
import { Kpi, DivergingLegend, SeqLegend, SgiChip, BarList, SkillSelect, ClusterSelect, DemoNote } from "../components/ui";
import { fmt, sgiColor, seqColor, SEQ_BLUE, SEQ_VIOLET, SEQ_AQUA, SERIES } from "../theme";

const LAYERS = [
  ["sgi", "Skill Gap Index (now)", "Openings vs available workers"],
  ["sgi2", "Skill Gap Index (12-mo forecast)", "Where shortages are heading"],
  ["demand", "Job demand", "Postings per lakh population"],
  ["supply", "Skilled workforce", "Workers with the skill per 1,000 labour force"],
  ["growth", "Demand growth", "Forecast change, next 12 months"],
];
const TYPE_COLOR = { "Govt ITI": SERIES[0], "Private ITI": SERIES[2], Polytechnic: SERIES[1] };

export default function Overview() {
  const data = useData();
  const { selState, setSelState, go, params } = data;
  const [layer, setLayer] = useState("sgi");
  const [skill, setSkill] = useState(params.skill || null);
  const [cluster, setCluster] = useState(null);
  const [showCentres, setShowCentres] = useState(false);
  const [allDistricts, setAllDistricts] = useState(false);
  const [extrude, setExtrude] = useState(false);
  const [centres, setCentres] = useState(null);

  useEffect(() => { if (showCentres && !centres) loadCentres().then(setCentres); }, [showCentres, centres]);

  const sm = useMemo(() => stateMetric(data, { skill, cluster }), [data, skill, cluster]);
  const ranges = useMemo(() => {
    const v = Object.entries(sm);
    const demand = v.map(([s, o]) => (o.postings / Math.max(data.stateBy[s]?.pop2011 || 1, 1)) * 1e5);
    return { demandMax: Math.max(...demand, 1e-9), supplyMax: Math.max(...v.map(([, o]) => o.stockPer1k), 1e-9) };
  }, [sm, data]);

  const stateColor = useCallback((st) => {
    const o = sm[st];
    if (!o) return "#141b30";
    if (layer === "sgi") return sgiColor(o.sgi);
    if (layer === "sgi2") return sgiColor(o.sgi2);
    if (layer === "demand") return seqColor(Math.sqrt(((o.postings / (data.stateBy[st]?.pop2011 || 1)) * 1e5) / ranges.demandMax), SEQ_AQUA);
    if (layer === "supply") return seqColor(Math.sqrt(o.stockPer1k / ranges.supplyMax));
    if (layer === "growth") return o.growth == null ? "#141b30" : seqColor(Math.max(0, Math.min(0.999, (o.growth + 0.02) / 0.5)), SEQ_VIOLET);
    return "#141b30";
  }, [sm, layer, ranges, data]);

  const distBy = useMemo(() => Object.fromEntries(data.districts.map((d) => [d.code, d])), [data]);
  const effCluster = skill ? data.skillBy[skill].cluster : cluster;
  const distVal = useCallback((code) => {
    const d = distBy[code];
    if (!d) return 0;
    const n = effCluster ? d.byCluster?.[effCluster] || 0 : d.postings12;
    return (n / Math.max(d.pop, 1)) * 1e5;
  }, [distBy, effCluster]);
  const distMax = useMemo(() => {
    const vals = data.districts.map((d) => distVal(d.code)).sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.97)] || 1;
  }, [data, distVal]);
  const districtColor = useCallback((code) => {
    const v = distVal(code);
    return v <= 0 ? "#10182c" : seqColor(Math.min(0.999, Math.sqrt(v / distMax)), SEQ_AQUA);
  }, [distVal, distMax]);
  const districtHeight = useCallback((code) => Math.min(distVal(code) / distMax, 1.6) * 260000 + 2000, [distVal, distMax]);

  const tooltip = useCallback((kind, p) => {
    if (kind === "state") {
      const o = sm[p.state], s = data.stateBy[p.state];
      if (!o) return <b>{p.state}</b>;
      return (
        <div>
          <div className="font-semibold text-ink mb-1">{p.state}</div>
          <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 num">
            <span className="text-muted">Gap index</span><span><b>{fmt.sgi(o.sgi)}</b> → {fmt.sgi(o.sgi2)} (12 mo)</span>
            <span className="text-muted">Openings / yr</span><b>{fmt.compact(o.openings)}</b>
            <span className="text-muted">Available / yr</span><b>{fmt.compact(o.available)}</b>
            <span className="text-muted">Demand growth</span><b>{fmt.pct(o.growth)}</b>
            <span className="text-muted">Postings (12 mo)</span><b>{fmt.int(o.postings)}</b>
            {s && <><span className="text-muted">Youth unemployment</span><b>{s.youth_ur}%</b></>}
          </div>
          {o.lowConf && <div className="text-warn text-[11px] mt-1">Few postings: low confidence</div>}
        </div>
      );
    }
    const d = distBy[p.dt_code];
    return d && (
      <div>
        <div className="font-semibold text-ink">{d.name}<span className="text-muted font-normal">, {d.state}</span></div>
        <div className="num">{fmt.int(effCluster ? d.byCluster?.[effCluster] || 0 : d.postings12)} postings{effCluster ? ` in ${data.clusters[effCluster]}` : ""} · <b>{distVal(d.code).toFixed(1)}</b> per lakh</div>
        <div className="text-muted num">{d.centres} training centres · {fmt.int(d.seats)} seats</div>
      </div>
    );
  }, [sm, data, distBy, effCluster, distVal]);

  const points = useMemo(() => (showCentres && centres ? centres.filter((c) => (!selState || c.state === selState) && (!skill || c.skills.includes(skill))).map((c) => ({ ...c, r: c.type === "Polytechnic" ? 3.5 : 2.6 })) : null), [showCentres, centres, selState, skill]);

  const nat = useMemo(() => {
    const o = Object.values(sm).reduce((a, b) => ({ openings: a.openings + b.openings, available: a.available + b.available, postings: a.postings + b.postings }), { openings: 0, available: 0, postings: 0 });
    return { ...o, sgi: (100 * (o.openings - o.available)) / (o.openings + o.available) };
  }, [sm]);
  const jobseekers = data.states.reduce((a, s) => a + s.jobseekers, 0);
  const centresN = data.states.reduce((a, s) => a + s.centres, 0);
  const filterLabel = skill || (cluster ? data.clusters[cluster] : "All skills");

  return (
    <div className="p-4 grid grid-cols-[minmax(0,1fr)_350px] gap-4 h-full min-h-[760px]">
      <div className="flex flex-col gap-4 min-h-0">
        <div className="panel relative flex-1 min-h-[520px] overflow-hidden">
          <MapView geoStates={data.geo_states} geoDistricts={data.geo_districts} stateColor={stateColor}
            districtColor={districtColor} districtHeight={districtHeight} selected={selState} onSelect={setSelState}
            showDistricts={allDistricts || extrude} extrude={extrude} points={points} pointColor={(p) => TYPE_COLOR[p.type]}
            tooltip={tooltip} pointTooltip={(p) => <div><b>{p.name}</b><div className="text-muted">{p.type} · {p.seats} seats</div><div className="text-[11px] text-ink2 mt-1">{p.skills}</div></div>} />
          <div className="absolute top-3 left-3 glass px-3 py-2.5 max-w-[440px]">
            <div className="eyebrow">Showing</div>
            <div className="text-[15px] font-semibold">{LAYERS.find((l) => l[0] === layer)[1]} <span className="text-cyan">· {filterLabel}</span></div>
            <div className="flex gap-2 mt-2">
              <SkillSelect value={skill} onChange={(v) => { setSkill(v); if (v) setCluster(null); }} allLabel="Any skill" className="w-[190px]" />
              <ClusterSelect value={cluster} onChange={(v) => { setCluster(v); setSkill(null); }} className="w-[170px]" />
            </div>
          </div>
          {selState && (
            <button onClick={() => setSelState(null)} className="absolute top-3 right-3 glass px-3 py-1.5 text-[12px] flex items-center gap-1.5 hover:border-cyan">
              <X size={13} /> Back to India
            </button>
          )}
          <div className="absolute bottom-3 left-3 glass p-3 w-[300px]">
            {layer.startsWith("sgi") ? <DivergingLegend /> : layer === "growth"
              ? <SeqLegend title="Demand growth (12-mo forecast)" ramp={SEQ_VIOLET} lo="≤ 0%" hi="+48%" />
              : <SeqLegend title={layer === "demand" ? "Postings per lakh population" : "Skilled workers per 1,000 labour force"} ramp={layer === "demand" ? SEQ_AQUA : SEQ_BLUE} lo="low" hi="high" />}
            {(selState || allDistricts || extrude) && <div className="mt-2 pt-2 border-t border-line"><SeqLegend title="Districts: job postings per lakh population" ramp={SEQ_AQUA} lo="0" hi={`${Math.round(distMax)}+`} /></div>}
            {showCentres && <div className="mt-2 pt-2 border-t border-line flex gap-3 text-[11px] text-ink2">{Object.entries(TYPE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}</span>)}</div>}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-3">
          <Kpi icon={Briefcase} label="Openings / year" value={fmt.compact(nat.openings)} sub={filterLabel} />
          <Kpi icon={Users} label="Available / year" value={fmt.compact(nat.available)} sub="jobseekers + trainees" />
          <Kpi icon={Gauge} label="National gap index" value={fmt.sgi(nat.sgi)} tone={nat.sgi > 0 ? "bad" : "good"} sub={nat.sgi > 0 ? "net shortage" : "net surplus"} />
          <Kpi icon={FileSearch} label="Postings analysed" value={fmt.compact(data.meta.counts.postings)} sub={`${fmt.compact(data.meta.counts.postings_real)} real · NLP-parsed`} />
          <Kpi icon={Users} label="Jobseekers" value={fmt.compact(jobseekers)} sub="PLFS-format estimate" />
          <Kpi icon={Building2} label="Training centres" value={fmt.compact(centresN)} sub="ITIs + polytechnics" />
        </div>
      </div>

      <div className="flex flex-col gap-4 min-h-0 overflow-auto pr-0.5">
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-2.5"><Layers size={15} className="text-cyan" /><span className="font-semibold text-[14px]">Layers</span></div>
          <div className="space-y-1">
            {LAYERS.map(([id, label, sub]) => (
              <label key={id} className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer border ${layer === id ? "border-accent/60 bg-accent/10" : "border-transparent hover:bg-white/5"}`}>
                <input type="radio" checked={layer === id} onChange={() => setLayer(id)} className="mt-0.5 accent-[#22d3ee]" />
                <span><span className="text-[13px] block">{label}</span><span className="text-[11px] text-muted">{sub}</span></span>
              </label>
            ))}
          </div>
          <div className="border-t border-line mt-2.5 pt-2.5 space-y-2 text-[13px]">
            <Toggle checked={showCentres} onChange={setShowCentres} label="Training centres (ITIs, polytechnics)" />
            <Toggle checked={allDistricts} onChange={setAllDistricts} label="District demand, all India" />
            <Toggle checked={extrude} onChange={setExtrude} label={<span className="flex items-center gap-1"><Box size={13} />3D demand towers</span>} />
          </div>
        </div>
        {selState ? <StatePanel st={selState} go={go} /> : <NationalPanel go={go} setSelState={setSelState} />}
        <DemoNote />
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-ink2">{label}</span>
      <button onClick={() => onChange(!checked)} className={`w-9 h-5 rounded-full relative transition ${checked ? "bg-cyan/80" : "bg-[#1d2945]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function NationalPanel({ go, setSelState }) {
  const data = useData();
  const rows = useMemo(() => {
    const agg = {};
    data.gap.forEach((r) => {
      if (r.cluster === "CS") return;
      const o = (agg[r.skill] ||= { o: 0, a: 0 });
      o.o += r.openings; o.a += r.available;
    });
    return Object.entries(agg).map(([s, o]) => ({ label: s, value: o.o - o.a, sgi: (100 * (o.o - o.a)) / (o.o + o.a) }));
  }, [data]);
  const short = [...rows].sort((a, b) => b.value - a.value).slice(0, 7);
  const surplus = [...rows].sort((a, b) => a.value - b.value).slice(0, 4);
  const worstStates = [...data.states].filter((s) => s.postings12 > 300).sort((a, b) => b.sgi_next12 - a.sgi_next12).slice(0, 5);
  return (
    <div className="panel p-4 space-y-4">
      <div>
        <div className="eyebrow">All India</div>
        <div className="text-[15px] font-semibold">Largest skill shortages</div>
        <div className="text-[11.5px] text-muted mb-2">Persons per year, openings minus available</div>
        <BarList rows={short} colorFn={(r) => sgiColor(r.sgi)} onClick={data.can("gap") ? (r) => go("gap", { skill: r.label }) : undefined} />
      </div>
      <div>
        <div className="text-[13px] font-semibold mb-1.5">Largest surpluses</div>
        <BarList rows={surplus.map((r) => ({ ...r, value: -r.value }))} colorFn={(r) => sgiColor(r.sgi)} onClick={data.can("gap") ? (r) => go("gap", { skill: r.label }) : undefined} />
      </div>
      <div>
        <div className="text-[13px] font-semibold mb-1.5 flex items-center gap-1.5"><Sparkles size={13} className="text-cyan" />States heading for the tightest market</div>
        {worstStates.map((s) => (
          <button key={s.state} onClick={() => setSelState(s.state)} className="w-full flex justify-between items-center py-1 text-[12.5px] hover:text-cyan">
            <span>{s.state}</span><span className="flex items-center gap-1.5 num"><SgiChip v={s.sgi} /><ArrowRight size={12} className="text-muted" /><SgiChip v={s.sgi_next12} /></span>
          </button>
        ))}
      </div>
      <div className="text-[11.5px] text-muted">Click any state to drill down to districts.</div>
    </div>
  );
}

function StatePanel({ st, go }) {
  const data = useData();
  const s = data.stateBy[st];
  if (!s) return <div className="panel p-4 text-muted">No data for {st}.</div>;
  const short = s.top_shortages.map((r) => ({ label: r.skill, value: r.shortage, sgi: r.sgi }));
  return (
    <div className="panel p-4 space-y-3.5">
      <div>
        <div className="eyebrow">State profile</div>
        <div className="text-[19px] font-semibold glow-text">{st}</div>
        {s.postings12 < 300 && <div className="text-[11px] text-warn">Few postings in this state: treat as indicative</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Gap index now" v={<SgiChip v={s.sgi} />} />
        <Mini label="In 12 months" v={<SgiChip v={s.sgi_next12} />} />
        <Mini label="Unemployment" v={`${s.ur}%`} />
        <Mini label="Youth (15-29)" v={`${s.youth_ur}%`} />
        <Mini label="Demand growth" v={fmt.pct(s.growth)} />
        <Mini label="Training seats" v={fmt.compact(s.seats)} />
      </div>
      {short.length > 0 && (
        <div>
          <div className="text-[13px] font-semibold mb-1.5">Top shortages <span className="text-muted font-normal">(persons / yr)</span></div>
          <BarList rows={short} colorFn={(r) => sgiColor(r.sgi)} onClick={data.can("simulator") ? (r) => go("simulator", { state: st, skill: r.label }) : undefined} />
          {data.can("simulator") && <div className="text-[11px] text-muted mt-1">Click a skill to simulate a training programme.</div>}
        </div>
      )}
      {s.top_surpluses.length > 0 && (
        <div>
          <div className="text-[13px] font-semibold mb-1">Surplus skills</div>
          <div className="flex flex-wrap gap-1.5">{s.top_surpluses.map((r) => <span key={r.skill} className="text-[11.5px] rounded-full border border-line px-2 py-0.5 text-ink2">{r.skill} <span className="num text-[#86b6ef]">{fmt.sgi(r.sgi)}</span></span>)}</div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {data.can("priority") && <button onClick={() => go("priority", { state: st })} className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium hover:brightness-110">Recommendations</button>}
        {data.can("gap") && <button onClick={() => go("gap", { state: st })} className="rounded-lg border border-line px-3 py-2 text-[12.5px] hover:border-accent">Full gap table</button>}
        {!data.can("gap") && data.can("career") && <button onClick={() => go("career")} className="col-span-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-medium hover:brightness-110">Find careers here</button>}
      </div>
    </div>
  );
}

const Mini = ({ label, v }) => (
  <div className="rounded-lg bg-[#0a1122] border border-line px-2.5 py-2">
    <div className="text-[10.5px] text-muted">{label}</div>
    <div className="text-[14px] font-semibold num mt-0.5">{v}</div>
  </div>
);
