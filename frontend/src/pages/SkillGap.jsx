import { useMemo, useState } from "react";
import { ArrowUpDown, MousePointerClick, Map as MapIcon, SlidersHorizontal, TrendingUp } from "lucide-react";
import { useData } from "../data";
import { Panel, StateSelect, ClusterSelect, SkillSelect, SgiChip, ConfDot, DivergingLegend, BarList, Seg, Switch, Collapse, PickHint, DemoNote } from "../components/ui";
import { fmt, sgiColor, gapWord, CLUSTER_ORDER, C } from "../theme";

const SHORT = { SW: "Software", DA: "Data/AI", CY: "Cyber", EL: "Electr.", GE: "Green", MF: "Mfg", CO: "Constr.", HC: "Health",
  LR: "Logist.", BF: "Banking", SM: "Sales", AG: "Agri", HT: "Hospit.", TX: "Textile" };

export default function SkillGap() {
  const data = useData();
  const { params, go } = data;
  const [state, setState] = useState(params.state || null);
  const [cluster, setCluster] = useState(null);
  const [skill, setSkill] = useState(params.skill || null);
  const [lowConf, setLowConf] = useState(false);
  const [horizon, setHorizon] = useState("now");
  const [sort, setSort] = useState(["shortage", -1]);
  const [hover, setHover] = useState(null);
  const [pick, setPick] = useState(null);

  const rows = useMemo(() => {
    const src = data.gap.filter((r) => r.cluster !== "CS" && (!cluster || r.cluster === cluster) && (!skill || r.skill === skill) && (lowConf || r.conf > 0 || !state));
    if (state) return src.filter((r) => r.state === state).map((r) => ({ ...r, label: r.skill }));
    if (skill) return src.map((r) => ({ ...r, label: r.state }));
    const agg = {};
    src.forEach((r) => {
      const o = (agg[r.skill] ||= { label: r.skill, skill: r.skill, cluster: r.cluster, openings: 0, available: 0, availJS: 0, availTr: 0, postings: 0, openings2: 0, avail2: 0 });
      o.openings += r.openings; o.available += r.available; o.availJS += r.availJS; o.availTr += r.availTr; o.postings += r.postings; o.openings2 += r.openings2; o.avail2 += r.available * 1.03;
    });
    return Object.values(agg).map((o) => ({ ...o, shortage: o.openings - o.available, sgi: (100 * (o.openings - o.available)) / (o.openings + o.available || 1),
      sgi2: (100 * (o.openings2 - o.avail2)) / (o.openings2 + o.avail2 || 1), conf: o.postings > 100 ? 2 : o.postings > 25 ? 1 : 0, growth: o.openings ? o.openings2 / o.openings - 1 : 0 }));
  }, [data.gap, state, cluster, skill, lowConf]);

  const sorted = useMemo(() => [...rows].sort((a, b) => sort[1] * ((a[sort[0]] ?? 0) - (b[sort[0]] ?? 0))), [rows, sort]);
  const key = horizon === "now" ? "sgi" : "sgi2";
  const top = [...rows].sort((a, b) => b.shortage - a.shortage).slice(0, 10);
  const bottom = [...rows].sort((a, b) => a.shortage - b.shortage).filter((r) => r.shortage < 0).slice(0, 5);
  const picked = pick && rows.find((r) => r.label === pick);

  // heatmap: states x sectors
  const heat = useMemo(() => {
    const m = {};
    data.gap.forEach((r) => {
      if (r.cluster === "CS") return;
      const o = ((m[r.state] ||= {})[r.cluster] ||= { o: 0, a: 0, o2: 0, a2: 0, n: 0 });
      o.o += r.openings; o.a += r.available; o.o2 += r.openings2; o.a2 += r.available * 1.03; o.n += r.postings;
    });
    const states = Object.keys(m).filter((s) => (data.stateBy[s]?.postings12 || 0) >= 150)
      .sort((a, b) => (data.stateBy[b][horizon === "now" ? "sgi" : "sgi_next12"]) - (data.stateBy[a][horizon === "now" ? "sgi" : "sgi_next12"]));
    return { m, states };
  }, [data.gap, data.stateBy, horizon]);
  const cellV = (o) => (!o || o.o + o.a === 0 ? null : horizon === "now" ? (100 * (o.o - o.a)) / (o.o + o.a) : (100 * (o.o2 - o.a2)) / (o.o2 + o.a2));

  const scope = state ? `in ${state}` : skill ? `${skill}, by state` : "across India";
  const listLabel = skill && !state ? "States most short of this skill" : "Most needed skills";
  const head = (k, l, right = true) => (
    <th className={right ? "!text-right" : ""} aria-sort={sort[0] === k ? (sort[1] < 0 ? "descending" : "ascending") : "none"}>
      <button className="inline-flex items-center gap-1" onClick={() => setSort([k, sort[0] === k ? -sort[1] : -1])}>{l}<ArrowUpDown size={11} aria-hidden="true" /></button>
    </th>
  );
  const choose = (r) => setPick(pick === r.label ? null : r.label);

  return (
    <div className="p-4 space-y-4">
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-3">
        <StateSelect value={state} onChange={(v) => { setState(v); setPick(null); if (v) setSkill(null); }} />
        <ClusterSelect value={cluster} onChange={(v) => { setCluster(v); setPick(null); }} />
        <SkillSelect value={skill} onChange={(v) => { setSkill(v); setPick(null); if (v) setState(null); }} allLabel="Any skill" />
        <div className="ml-auto"><Seg label="Time" options={[["now", "Now"], ["next", "In 1 year"]]} value={horizon} onChange={setHorizon} /></div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <Panel title={listLabel} eyebrow={scope.charAt(0).toUpperCase() + scope.slice(1)}
          info={<>Each bar is the number of jobs a year that can't be filled with locally trained people. Click one to see what it means.</>}>
          <BarList rows={top.map((r) => ({ label: r.label, value: Math.max(r.shortage, 0), sgi: r[key] }))} colorFn={(x) => sgiColor(x.sgi)}
            onClick={choose} selected={pick} />
          {bottom.length > 0 && <>
            <div className="text-[13.5px] text-ink2 mt-4 mb-1.5 font-semibold">More workers than jobs</div>
            <BarList rows={bottom.map((r) => ({ label: r.label, value: -r.shortage, sgi: r[key] }))} colorFn={(x) => sgiColor(x.sgi)} onClick={choose} selected={pick} />
          </>}
          <div className="mt-4"><DivergingLegend title={null} /></div>
        </Panel>

        <div className="space-y-4">
          {picked ? <Detail r={picked} state={state} skill={skill} data={data} go={go} /> :
            <PickHint icon={MousePointerClick}>Click a skill in the list to see what it means and what you can do</PickHint>}

          <Panel title="Compare states and sectors" eyebrow={horizon === "now" ? "Now" : "In 1 year"}
            info={<>Each square is one state and one sector. Saffron = shortage, green = extra workers, grey = too few job posts to tell. Click a square to filter the page.</>}>
            <Collapse title="Show the comparison grid">
              <div className="relative overflow-auto">
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: `120px repeat(${CLUSTER_ORDER.length}, minmax(26px, 1fr))` }}>
                  <div />
                  {CLUSTER_ORDER.map((c) => <div key={c} className="text-[12px] text-muted text-center pb-1 leading-tight truncate" title={data.clusters[c]}>{SHORT[c]}</div>)}
                  {heat.states.map((s) => [
                    <button key={s} onClick={() => { setState(s); setPick(null); }} className="text-[12.5px] text-ink2 text-left truncate pr-2 hover:text-cyan">{s}</button>,
                    ...CLUSTER_ORDER.map((c) => {
                      const o = heat.m[s]?.[c]; const v = cellV(o);
                      return <button key={s + c} onMouseEnter={() => setHover({ s, c, o, v })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ s, c, o, v })}
                        onClick={() => { setState(s); setCluster(c); setPick(null); }} aria-label={`${s}, ${data.clusters[c]}: ${o && o.n >= 15 ? gapWord(v) : "not enough data"}`}
                        className="h-[19px] rounded-[3px] hover:ring-2 hover:ring-accent" style={{ background: o && o.n >= 15 ? sgiColor(v) : C.none }} />;
                    }),
                  ])}
                </div>
                <div className="mt-2 text-[13px] text-ink2 num min-h-[18px]">
                  {hover ? <><b className="text-ink">{hover.s}</b> · {data.clusters[hover.c]}: {hover.o && hover.o.n >= 15 ? <>{gapWord(hover.v)} ({fmt.sgi(hover.v)})</> : "not enough data"}</> : <span className="text-muted">Point at a square for details</span>}
                </div>
              </div>
            </Collapse>
          </Panel>
        </div>
      </div>

      <Panel title="All the numbers" eyebrow={scope.charAt(0).toUpperCase() + scope.slice(1)}
        info={<>Jobs a year = expected hires × share of job posts asking for the skill. Trained people = job seekers whose education or training fits, plus new ITI and polytechnic graduates. Gap score runs from −100 (many extra workers) to +100 (big shortage).</>}>
        <div className="flex flex-wrap items-center gap-4 mb-1">
          <div className="w-[260px] text-[13.5px]"><Switch checked={lowConf} onChange={setLowConf} label="Include less certain results" /></div>
          <DemoNote />
        </div>
        <Collapse title="Show the full data table">
          <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
            <table className="data">
              <caption className="sr-only">Skill gap figures {scope}</caption>
              <thead><tr>
                <th>{state ? "Skill" : skill ? "State" : "Skill"}</th><th>Sector</th>
                {head("openings", "Jobs / yr")}{head("availJS", "Job seekers")}{head("availTr", "New trainees")}{head("shortage", "Shortage")}
                {head("sgi", "Gap now")}{head("sgi2", "In 1 yr")}<th>Certainty</th>
              </tr></thead>
              <tbody>
                {sorted.slice(0, 200).map((r) => (
                  <tr key={r.label + r.skill} onClick={() => setPick(r.label)} className="cursor-pointer">
                    <td className="font-medium">{r.label}</td>
                    <td className="text-muted text-[12.5px]">{data.clusters[r.cluster]}</td>
                    <td className="num text-right">{fmt.int(r.openings)}</td>
                    <td className="num text-right">{fmt.int(r.availJS)}</td>
                    <td className="num text-right">{fmt.int(r.availTr)}</td>
                    <td className={`num text-right font-semibold ${r.shortage > 0 ? "text-short" : "text-surplus"}`}>{fmt.int(r.shortage)}</td>
                    <td className="text-right"><SgiChip v={r.sgi} /></td>
                    <td className="text-right"><SgiChip v={r.sgi2} /></td>
                    <td><ConfDot c={r.conf} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapse>
      </Panel>
    </div>
  );
}

// Plain-language explanation of one selected row, with next steps
function Detail({ r, state, skill, data, go }) {
  const isState = !!skill && !state;          // rows are states when a skill is chosen
  const sk = isState ? skill : r.label;
  const st = isState ? r.label : state;
  const where = st ? ` in ${st}` : " across India";
  const short = r.shortage > 0;
  // for an India-wide skill, the simulator needs a state: use the one most short of it
  const simState = st || data.gap.filter((g) => g.skill === sk).sort((a, b) => b.shortage - a.shortage)[0]?.state;
  return (
    <div className="panel p-4" aria-live="polite">
      <div className="text-[18px] font-semibold">{isState ? `${skill} in ${r.label}` : r.label}</div>
      <div className="text-[13px] text-muted mb-3">{data.clusters[r.cluster]}</div>
      <div className={`rounded-lg px-3 py-2.5 text-[14.5px] leading-relaxed border-l-4 ${short ? "border-saffron bg-saffron/10" : "border-green bg-green/10"}`}>
        {short
          ? <>About <b className="num">{fmt.int(r.openings)}</b> jobs a year need this skill{where}, but only <b className="num">{fmt.int(r.available)}</b> trained people are available. Around <b className="num text-short">{fmt.int(r.shortage)}</b> jobs a year are hard to fill.</>
          : <>Only <b className="num">{fmt.int(r.openings)}</b> jobs a year need this skill{where}, for <b className="num">{fmt.int(r.available)}</b> trained people. About <b className="num text-surplus">{fmt.int(-r.shortage)}</b> people a year may not find work using it.</>}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[13px]">
        <div className="rounded-lg bg-panel2 px-2.5 py-2"><div className="text-muted">Gap now</div><div className="mt-0.5"><SgiChip v={r.sgi} /></div></div>
        <div className="rounded-lg bg-panel2 px-2.5 py-2"><div className="text-muted">In 1 year</div><div className="mt-0.5"><SgiChip v={r.sgi2} /></div></div>
        <div className="rounded-lg bg-panel2 px-2.5 py-2"><div className="text-muted">Certainty</div><div className="mt-1 flex items-center gap-1.5"><ConfDot c={r.conf} />{["Low", "Medium", "High"][r.conf ?? 0]}</div></div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {short && data.can("simulator") && simState && <button onClick={() => go("simulator", { state: simState, skill: sk })} className="rounded-full bg-accent text-onaccent px-3 py-1.5 text-[13.5px] font-semibold flex items-center gap-1.5"><SlidersHorizontal size={14} />Try a training plan</button>}
        <button onClick={() => go("map", { skill: sk, ...(st ? { state: st } : {}) })} className="rounded-full border border-line px-3 py-1.5 text-[13.5px] hover:border-accent flex items-center gap-1.5"><MapIcon size={14} />See on map</button>
        <button onClick={() => go("demand", { skill: sk })} className="rounded-full border border-line px-3 py-1.5 text-[13.5px] hover:border-accent flex items-center gap-1.5"><TrendingUp size={14} />Job trend</button>
      </div>
    </div>
  );
}
