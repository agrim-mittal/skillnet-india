import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, Briefcase, Gauge, ArrowRight, X, Sparkles, MousePointerClick } from "lucide-react";
import MapView from "../components/MapView";
import { useData, stateMetric, loadCentres } from "../data";
import { Kpi, DivergingLegend, SeqLegend, SgiChip, BarList, SkillSelect, ClusterSelect, StateSelect, Switch, Chip, InfoButton, InfoBox, Collapse, PickHint } from "../components/ui";
import { fmt, sgiColor, seqColor, gapWord, SEQ_BLUE, SEQ_VIOLET, SEQ_AQUA, SERIES, C } from "../theme";

// [id, short label, explanation shown only on request]
const LAYERS = [
  ["sgi", "Skill gap now", "Compares jobs with trained people. Saffron = more jobs than trained people (shortage). Green = more trained people than jobs. Darker = bigger gap."],
  ["sgi2", "Gap in 1 year", "The same comparison a year from now, using the demand forecast."],
  ["demand", "Job demand", "How many jobs were posted for every lakh people living in the state."],
  ["supply", "Trained workers", "How many workers have the skill, per 1,000 people in the workforce."],
  ["growth", "Job growth", "How much demand is expected to grow over the next 12 months."],
];
const typeColor = () => ({ "Govt ITI": SERIES[0], "Private ITI": SERIES[2], Polytechnic: SERIES[1] });

export default function Overview() {
  const data = useData();
  const { selState, setSelState, go, params, mode } = data;
  const [layer, setLayer] = useState("sgi");
  const [info, setInfo] = useState(false);
  const [skill, setSkill] = useState(params.skill || null);
  const [cluster, setCluster] = useState(null);
  const [showCentres, setShowCentres] = useState(false);
  const [allDistricts, setAllDistricts] = useState(false);
  const [extrude, setExtrude] = useState(false);
  const [centres, setCentres] = useState(null);
  useEffect(() => { if (showCentres && !centres) loadCentres().then(setCentres); }, [showCentres, centres]);

  const sm = useMemo(() => stateMetric(data, { skill, cluster }), [data.gap, data.states, skill, cluster]);
  const ranges = useMemo(() => {
    const v = Object.entries(sm);
    const demand = v.map(([s, o]) => (o.postings / Math.max(data.stateBy[s]?.pop2011 || 1, 1)) * 1e5);
    return { demandMax: Math.max(...demand, 1e-9), supplyMax: Math.max(...v.map(([, o]) => o.stockPer1k), 1e-9) };
  }, [sm, data.stateBy]);
  const stateColor = useCallback((st) => {
    const o = sm[st];
    if (!o) return C.empty;
    if (layer === "sgi") return sgiColor(o.sgi);
    if (layer === "sgi2") return sgiColor(o.sgi2);
    if (layer === "demand") return seqColor(Math.sqrt(((o.postings / (data.stateBy[st]?.pop2011 || 1)) * 1e5) / ranges.demandMax), SEQ_AQUA);
    if (layer === "supply") return seqColor(Math.sqrt(o.stockPer1k / ranges.supplyMax));
    if (layer === "growth") return o.growth == null ? C.empty : seqColor(Math.max(0, Math.min(0.999, (o.growth + 0.02) / 0.5)), SEQ_VIOLET);
    return C.empty;
  }, [sm, layer, ranges, data.stateBy]);

  const distBy = useMemo(() => Object.fromEntries(data.districts.map((d) => [d.code, d])), [data.districts]);
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
  }, [data.districts, distVal]);
  const districtColor = useCallback((code) => {
    const v = distVal(code);
    return v <= 0 ? C.none : seqColor(Math.min(0.999, Math.sqrt(v / distMax)), SEQ_AQUA);
  }, [distVal, distMax]);
  const districtHeight = useCallback((code) => Math.min(distVal(code) / distMax, 1.6) * 260000 + 2000, [distVal, distMax]);

  const tooltip = useCallback((kind, p) => {
    if (kind === "state") {
      const o = sm[p.state];
      if (!o) return <b>{p.state}</b>;
      return (
        <div>
          <div className="font-semibold text-ink">{p.state}</div>
          <div className="text-ink2">{gapWord(o.sgi)} · gap score <b className="num">{fmt.sgi(o.sgi)}</b></div>
          <div className="text-muted num">{fmt.compact(o.openings)} jobs vs {fmt.compact(o.available)} trained people a year</div>
          <div className="text-[12px] text-cyan mt-0.5">Click for details</div>
        </div>
      );
    }
    const d = distBy[p.dt_code];
    return d && (
      <div>
        <div className="font-semibold text-ink">{d.name}<span className="text-muted font-normal">, {d.state}</span></div>
        <div className="num">{fmt.int(effCluster ? d.byCluster?.[effCluster] || 0 : d.postings12)} jobs posted · {d.centres} training centres</div>
      </div>
    );
  }, [sm, distBy, effCluster]);

  const tc = typeColor();
  const points = useMemo(() => (showCentres && centres ? centres.filter((c) => (!selState || c.state === selState) && (!skill || c.skills.includes(skill))).map((c) => ({ ...c, r: c.type === "Polytechnic" ? 3.5 : 2.6 })) : null), [showCentres, centres, selState, skill]);
  const nat = useMemo(() => {
    const o = Object.values(sm).reduce((a, b) => ({ openings: a.openings + b.openings, available: a.available + b.available }), { openings: 0, available: 0 });
    return { ...o, sgi: (100 * (o.openings - o.available)) / (o.openings + o.available) };
  }, [sm]);
  const filterLabel = skill || (cluster ? data.clusters[cluster] : "All skills");
  const L = LAYERS.find((l) => l[0] === layer);

  return (
    <div className="p-4 grid grid-cols-[minmax(0,1fr)_340px] gap-4 h-full min-h-[760px]">
      <div className="flex flex-col gap-4 min-h-0">
        <div className="panel relative flex-1 min-h-[540px] overflow-hidden">
          <MapView geoStates={data.geo_states} geoDistricts={data.geo_districts} stateColor={stateColor} mode={mode}
            districtColor={districtColor} districtHeight={districtHeight} selected={selState} onSelect={setSelState}
            showDistricts={allDistricts || extrude} extrude={extrude} points={points} pointColor={(p) => typeColor()[p.type]}
            padTop={150} tooltip={tooltip} label={`Map of India showing ${L[1].toLowerCase()}`}
            pointTooltip={(p) => <div><b>{p.name}</b><div className="text-muted">{p.type} · {p.seats} seats</div></div>} />

          {/* what is shown + filters */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
            <div className="glass px-3 py-2.5 pointer-events-auto max-w-[720px]">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="What the map shows">
                {LAYERS.map(([id, label]) => <Chip key={id} on={layer === id} onClick={() => setLayer(id)}>{label}</Chip>)}
                <InfoButton open={info} onClick={() => setInfo(!info)} label="this map layer" />
              </div>
              {info && <div className="mt-2 -mb-3"><InfoBox onClose={() => setInfo(false)}>{L[2]}</InfoBox></div>}
              <div className="flex flex-wrap gap-2 mt-2">
                <StateSelect value={selState} onChange={setSelState} allLabel="Choose a state…" className="w-[170px]" label="Choose a state" />
                <SkillSelect value={skill} onChange={(v) => { setSkill(v); if (v) setCluster(null); }} allLabel="Any skill" className="w-[170px]" />
                <ClusterSelect value={cluster} onChange={(v) => { setCluster(v); setSkill(null); }} className="w-[160px]" />
              </div>
            </div>
            {selState && (
              <button onClick={() => setSelState(null)} className="pointer-events-auto glass px-3 py-2 text-[14px] font-medium flex items-center gap-1.5 hover:border-accent shrink-0">
                <X size={15} /> Back to India
              </button>
            )}
          </div>

          <div className="absolute bottom-3 left-3 glass p-3 w-[260px]">
            {layer.startsWith("sgi") ? <DivergingLegend title={null} /> : layer === "growth"
              ? <SeqLegend title="Expected job growth" ramp={SEQ_VIOLET} lo="none" hi="+48%" />
              : <SeqLegend title={layer === "demand" ? "Jobs posted per lakh people" : "Trained workers per 1,000"} ramp={layer === "demand" ? SEQ_AQUA : SEQ_BLUE} lo="fewer" hi="more" />}
            {(selState || allDistricts || extrude) && <div className="mt-2 pt-2 border-t border-line"><SeqLegend title="Districts: jobs posted" ramp={SEQ_AQUA} lo="fewer" hi="more" /></div>}
            {showCentres && <div className="mt-2 pt-2 border-t border-line flex gap-3 text-[12px] text-ink2">{Object.entries(tc).map(([k, c]) => <span key={k} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{k}</span>)}</div>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Kpi icon={Briefcase} label="Jobs a year" value={fmt.compact(nat.openings)} sub={filterLabel} />
          <Kpi icon={Users} label="Trained people a year" value={fmt.compact(nat.available)} sub="job seekers + new trainees" />
          <Kpi icon={Gauge} label="India gap score" value={fmt.sgi(nat.sgi)} tone={nat.sgi > 0 ? "bad" : "good"} sub={gapWord(nat.sgi)} />
        </div>
      </div>

      <div className="flex flex-col gap-4 min-h-0 overflow-auto pr-0.5">
        {selState ? <StatePanel st={selState} go={go} /> : <NationalPanel go={go} setSelState={setSelState} />}
        <div className="panel px-4 py-3 space-y-2.5 text-[14px]">
          <div className="eyebrow">Map options</div>
          <Switch checked={showCentres} onChange={setShowCentres} label="Show training centres" />
          <Switch checked={allDistricts} onChange={setAllDistricts} label="Show all districts" />
          <Switch checked={extrude} onChange={setExtrude} label="3D view of jobs" />
        </div>
      </div>
    </div>
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
  }, [data.gap]);
  const short = [...rows].sort((a, b) => b.value - a.value).slice(0, 5);
  const surplus = [...rows].sort((a, b) => a.value - b.value).slice(0, 4);
  const worstStates = [...data.states].filter((s) => s.postings12 > 300).sort((a, b) => b.sgi_next12 - a.sgi_next12).slice(0, 5);
  return (
    <div className="panel p-4 space-y-3">
      <PickHint icon={MousePointerClick}>Tap a state on the map to see its details</PickHint>
      <div>
        <div className="text-[14px] font-semibold mb-1.5">Most needed skills in India</div>
        <BarList rows={short} colorFn={(r) => sgiColor(r.sgi)} onClick={data.can("gap") ? (r) => go("gap", { skill: r.label }) : undefined} />
      </div>
      <Collapse title="More: extra workers and states to watch">
        <div className="text-[13.5px] font-semibold mb-1">More workers than jobs</div>
        <BarList rows={surplus.map((r) => ({ ...r, value: -r.value }))} colorFn={(r) => sgiColor(r.sgi)} />
        <div className="text-[13.5px] font-semibold mt-3 mb-1 flex items-center gap-1.5"><Sparkles size={13} className="text-cyan" />Shortages getting worse</div>
        {worstStates.map((s) => (
          <button key={s.state} onClick={() => setSelState(s.state)} className="w-full flex justify-between items-center py-1 text-[13.5px] hover:text-cyan">
            <span>{s.state}</span><span className="flex items-center gap-1.5 num"><SgiChip v={s.sgi} /><ArrowRight size={12} className="text-muted" aria-label="becomes" /><SgiChip v={s.sgi_next12} /></span>
          </button>
        ))}
      </Collapse>
    </div>
  );
}

function StatePanel({ st, go }) {
  const data = useData();
  const s = data.stateBy[st];
  if (!s) return <div className="panel p-4 text-muted">No data for {st}.</div>;
  const short = s.top_shortages.slice(0, 5).map((r) => ({ label: r.skill, value: r.shortage, sgi: r.sgi }));
  return (
    <div className="panel p-4 space-y-3.5" aria-live="polite">
      <div>
        <div className="text-[19px] font-semibold">{st}</div>
        <div className={`text-[14px] font-medium ${s.sgi > 5 ? "text-short" : s.sgi < -5 ? "text-surplus" : "text-ink2"}`}>{gapWord(s.sgi)}</div>
        {s.postings12 < 300 && <div className="text-[12px] text-warn">Few job posts here, so treat as a rough guide</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Mini label="Gap score now" v={<SgiChip v={s.sgi} />} />
        <Mini label="In 1 year" v={<SgiChip v={s.sgi_next12} />} />
        <Mini label="Young people jobless" v={`${s.youth_ur}%`} />
        <Mini label="Job growth" v={fmt.pct(s.growth)} />
      </div>
      {short.length > 0 && (
        <div>
          <div className="text-[14px] font-semibold mb-1">Skills most needed here</div>
          <BarList rows={short} colorFn={(r) => sgiColor(r.sgi)} onClick={data.can("simulator") ? (r) => go("simulator", { state: st, skill: r.label }) : undefined} />
          {data.can("simulator") && <div className="text-[12px] text-muted mt-1">Click a skill to try a training plan</div>}
        </div>
      )}
      {s.top_surpluses.length > 0 && (
        <Collapse title="Skills with extra workers">
          <div className="flex flex-wrap gap-1.5">{s.top_surpluses.map((r) => <span key={r.skill} className="text-[12.5px] rounded-full border border-line px-2 py-0.5 text-ink2">{r.skill} <span className="num text-surplus">{fmt.sgi(r.sgi)}</span></span>)}</div>
        </Collapse>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        {data.can("priority") && <button onClick={() => go("priority", { state: st })} className="rounded-lg bg-accent text-onaccent px-3 py-2 text-[13.5px] font-semibold hover:brightness-110">What to fund</button>}
        {data.can("gap") && <button onClick={() => go("gap", { state: st })} className="rounded-lg border border-line px-3 py-2 text-[13.5px] hover:border-accent">All skill gaps</button>}
        {!data.can("gap") && data.can("career") && <button onClick={() => go("career")} className="col-span-2 rounded-lg bg-accent text-onaccent px-3 py-2 text-[13.5px] font-semibold hover:brightness-110">Find careers here</button>}
      </div>
    </div>
  );
}

const Mini = ({ label, v }) => (
  <div className="rounded-lg bg-panel2 border border-line px-2.5 py-2">
    <div className="text-[12px] text-muted">{label}</div>
    <div className="text-[14px] font-semibold num mt-0.5">{v}</div>
  </div>
);
