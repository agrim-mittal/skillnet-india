import { useMemo, useState } from "react";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { useData } from "../data";
import { Panel, StateSelect, ClusterSelect, SkillSelect, SgiChip, ConfDot, DivergingLegend, BarList, DemoNote, Seg } from "../components/ui";
import { fmt, sgiColor, CLUSTER_ORDER } from "../theme";

const SHORT = { SW: "Software", DA: "Data/AI", CY: "Cyber", EL: "Electr.", GE: "Green", MF: "Mfg", CO: "Constr.", HC: "Health",
  LR: "Logist.", BF: "BFSI", SM: "Sales", AG: "Agri", HT: "Hospit.", TX: "Textile" };

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
  }, [data, state, cluster, skill, lowConf]);

  const sorted = useMemo(() => [...rows].sort((a, b) => sort[1] * ((a[sort[0]] ?? 0) - (b[sort[0]] ?? 0))), [rows, sort]);
  const key = horizon === "now" ? "sgi" : "sgi2";
  const top = [...rows].sort((a, b) => b.shortage - a.shortage).slice(0, 10);
  const bottom = [...rows].sort((a, b) => a.shortage - b.shortage).filter((r) => r.shortage < 0).slice(0, 6);

  // heatmap: states x clusters
  const heat = useMemo(() => {
    const m = {};
    data.clusters_rows ||= null;
    data.gap.forEach((r) => {
      if (r.cluster === "CS") return;
      const o = ((m[r.state] ||= {})[r.cluster] ||= { o: 0, a: 0, o2: 0, a2: 0, n: 0 });
      o.o += r.openings; o.a += r.available; o.o2 += r.openings2; o.a2 += r.available * 1.03; o.n += r.postings;
    });
    const states = Object.keys(m).filter((s) => (data.stateBy[s]?.postings12 || 0) >= 150)
      .sort((a, b) => (data.stateBy[b][horizon === "now" ? "sgi" : "sgi_next12"]) - (data.stateBy[a][horizon === "now" ? "sgi" : "sgi_next12"]));
    return { m, states };
  }, [data, horizon]);
  const cellV = (o) => (!o || o.o + o.a === 0 ? null : horizon === "now" ? (100 * (o.o - o.a)) / (o.o + o.a) : (100 * (o.o2 - o.a2)) / (o.o2 + o.a2));

  const scope = state ? state : skill ? `${skill} by state` : "All India";
  const head = (k, l, right = true) => (
    <th className={right ? "!text-right" : ""}><button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort([k, sort[0] === k ? -sort[1] : -1])}>{l}<ArrowUpDown size={10} /></button></th>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="panel px-4 py-3 flex flex-wrap items-center gap-3">
        <SlidersHorizontal size={15} className="text-cyan" />
        <StateSelect value={state} onChange={(v) => { setState(v); if (v) setSkill(null); }} />
        <ClusterSelect value={cluster} onChange={setCluster} />
        <SkillSelect value={skill} onChange={(v) => { setSkill(v); if (v) setState(null); }} allLabel="Any skill" />
        <label className="flex items-center gap-1.5 text-[12.5px] text-ink2"><input type="checkbox" checked={lowConf} onChange={(e) => setLowConf(e.target.checked)} />Include low-evidence rows</label>
        <div className="ml-auto"><Seg options={[["now", "Now"], ["next", "In 12 months"]]} value={horizon} onChange={setHorizon} /></div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4">
        <Panel eyebrow={scope} title="Where the gap is largest" right={<span className="text-[11px] text-muted">persons / year</span>}>
          <div className="text-[12px] text-ink2 mb-2 font-medium">Shortage (openings exceed available workers)</div>
          <BarList rows={top.map((r) => ({ label: r.label, value: Math.max(r.shortage, 0), sgi: r.sgi, r }))} colorFn={(x) => sgiColor(x.sgi)}
            onClick={(x) => (state ? (data.can("simulator") && go("simulator", { state, skill: x.label })) : skill ? (data.can("simulator") && go("simulator", { state: x.label, skill })) : setSkill(x.label))} />
          {bottom.length > 0 && <>
            <div className="text-[12px] text-ink2 mt-4 mb-2 font-medium">Surplus (more workers than openings)</div>
            <BarList rows={bottom.map((r) => ({ label: r.label, value: -r.shortage, sgi: r.sgi }))} colorFn={(x) => sgiColor(x.sgi)} />
          </>}
          <div className="mt-4"><DivergingLegend /></div>
        </Panel>

        <Panel eyebrow={horizon === "now" ? "Current" : "12-month forecast"} title="Skill Gap Index by state and sector"
          right={<span className="text-[11px] text-muted">states with 150+ postings · sorted by overall gap</span>}>
          <div className="relative overflow-auto">
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `128px repeat(${CLUSTER_ORDER.length}, minmax(30px, 1fr))` }}>
              <div />
              {CLUSTER_ORDER.map((c) => <div key={c} className="text-[10px] text-muted text-center pb-1 leading-tight truncate" title={data.clusters[c]}>{SHORT[c]}</div>)}
              {heat.states.map((s) => [
                <button key={s} onClick={() => setState(s)} className="text-[11.5px] text-ink2 text-left truncate pr-2 hover:text-cyan">{s}</button>,
                ...CLUSTER_ORDER.map((c) => {
                  const o = heat.m[s]?.[c]; const v = cellV(o);
                  return <div key={s + c} onMouseEnter={(e) => setHover({ s, c, o, v })} onMouseLeave={() => setHover(null)}
                    onClick={() => { setState(s); setCluster(c); }}
                    className="h-[19px] rounded-[3px] cursor-pointer hover:ring-2 hover:ring-cyan/70" style={{ background: o && o.n >= 15 ? sgiColor(v) : "#111829" }} />;
                }),
              ])}
            </div>
            {hover && (
              <div className="mt-2 text-[12px] text-ink2 num">
                <b className="text-ink">{hover.s}</b> · {data.clusters[hover.c]}: gap index <b className="text-ink">{fmt.sgi(hover.v)}</b>
                {hover.o && <> · {fmt.compact(hover.o.o)} openings vs {fmt.compact(hover.o.a)} available · {hover.o.n} postings{hover.o.n < 15 && " (too few, greyed)"}</>}
              </div>
            )}
            {!hover && <div className="mt-2 text-[11.5px] text-muted">Hover a cell for numbers; click to drill in. Grey = fewer than 15 postings.</div>}
          </div>
        </Panel>
      </div>

      <Panel eyebrow={scope} title="Gap table" right={<DemoNote />}>
        <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
          <table className="data">
            <thead><tr>
              <th>{state ? "Skill" : skill ? "State" : "Skill"}</th><th>Sector</th>
              {head("openings", "Openings / yr")}{head("availJS", "Jobseekers")}{head("availTr", "Trainees")}{head("shortage", "Shortage")}
              {head("sgi", "Gap now")}{head("sgi2", "Gap 12m")}{head("postings", "Postings")}<th>Evidence</th>
            </tr></thead>
            <tbody>
              {sorted.slice(0, 200).map((r) => (
                <tr key={r.label + r.skill}>
                  <td className="font-medium">{r.label}</td>
                  <td className="text-muted text-[11.5px]">{data.clusters[r.cluster]}</td>
                  <td className="num text-right">{fmt.int(r.openings)}</td>
                  <td className="num text-right">{fmt.int(r.availJS)}</td>
                  <td className="num text-right">{fmt.int(r.availTr)}</td>
                  <td className={`num text-right font-semibold ${r.shortage > 0 ? "text-[#f39b93]" : "text-[#86b6ef]"}`}>{fmt.int(r.shortage)}</td>
                  <td className="text-right"><SgiChip v={r.sgi} /></td>
                  <td className="text-right"><SgiChip v={r.sgi2} /></td>
                  <td className="num text-right text-ink2">{fmt.int(r.postings)}</td>
                  <td><ConfDot c={r.conf} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11.5px] text-muted mt-2">Openings = annual hires (7% of non-farm workers, PLFS) × share of postings asking for the skill. Available = jobseekers whose education or training points to the skill, plus ITI/polytechnic graduates.</div>
      </Panel>
    </div>
  );
}
