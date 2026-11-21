import { useMemo, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { useData } from "../data";
import { Panel, SkillSelect, Seg, BarList, Kpi, Chip, InfoBox } from "../components/ui";
import { ForecastChart } from "../components/charts";
import { fmt, SERIES, CLUSTER_ORDER } from "../theme";

export default function Demand() {
  const data = useData();
  const f = data.forecasts;
  const [mode, setMode] = useState("skill");
  const [skill, setSkill] = useState(data.params.skill || "Generative AI");
  const [state, setState] = useState(data.params.state || "Punjab");
  const [cluster, setCluster] = useState("AG");

  const stateClusters = useMemo(() => Object.keys(f.series).filter((k) => k.startsWith(`sc::${state}::`)).map((k) => k.split("::")[2]), [f, state]);
  const key = mode === "skill" ? `skill::${skill}` : `sc::${state}::${stateClusters.includes(cluster) ? cluster : stateClusters[0]}`;
  const s = f.series[key];
  const last12 = s ? s.h.slice(-12).reduce((a, b) => a + b, 0) : 0;
  const next12 = s ? s.f.reduce((a, b) => a + b, 0) : 0;

  const clusterGrowth = useMemo(() => stateClusters.map((c) => ({ label: data.clusters[c], value: f.series[`sc::${state}::${c}`].g, c }))
    .sort((a, b) => b.value - a.value), [stateClusters, f, state, data]);
  const forecastStates = useMemo(() => [...new Set(Object.keys(f.series).filter((k) => k.startsWith("sc::")).map((k) => k.split("::")[1]))].sort(), [f]);
  const em = data.emerging;
  const [term, setTerm] = useState(null);
  const T = term && em.new_terms.find((t) => t.term === term);
  const bt = data.meta.models.forecast;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Panel title="Jobs posted, and what to expect next year"
          info={<>The solid line is the number of job posts each month. The dashed line is the forecast, and the shaded band is the likely range. Forecast model: {f.model}, picked because it was the most accurate when tested on the last 12 months ({bt.table[0].model} error score {bt.table[0].MASE_all} vs {bt.table.find((r) => r.model === "Seasonal naive")?.MASE_all} for simply repeating last year).</>}
          right={<Seg label="Look at" options={[["skill", "One skill"], ["sc", "One state & sector"]]} value={mode} onChange={setMode} />}>
          <div className="flex flex-wrap gap-2 mb-3">
            {mode === "skill" ? <SkillSelect value={skill} onChange={(v) => v && setSkill(v)} includeCore /> : <>
              <select aria-label="State" value={state} onChange={(e) => setState(e.target.value)}>{forecastStates.map((x) => <option key={x}>{x}</option>)}</select>
              <select aria-label="Sector" value={stateClusters.includes(cluster) ? cluster : stateClusters[0]} onChange={(e) => setCluster(e.target.value)}>
                {stateClusters.map((c) => <option key={c} value={c}>{data.clusters[c]}</option>)}
              </select>
            </>}
          </div>
          {s ? <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Kpi label="Jobs posted, last year" value={fmt.int(last12)} />
              <Kpi label="Expected next year" value={fmt.int(next12)} sub={`likely ${fmt.compact(s.lo.reduce((a, b) => a + b, 0))} – ${fmt.compact(s.hi.reduce((a, b) => a + b, 0))}`} />
              <Kpi label="Change" value={fmt.pct(s.g)} sub={s.g > 0.05 ? "more jobs coming" : s.g < -0.03 ? "fewer jobs coming" : "about the same"} />
            </div>
            <ForecastChart hist={s.h} fut={s} histMonths={f.hist_months} futMonths={f.fut_months} />
          </> : <div className="text-muted text-sm py-10 text-center">Not enough postings to forecast this series.</div>}
        </Panel>

        <div className="space-y-4">
          <Panel title={<span className="flex items-center gap-1.5"><TrendingUp size={16} className="text-short" />Skills in rising demand</span>}>
            <BarList rows={em.rising.slice(0, 9).map((r) => ({ label: r.skill, value: r.growth }))} valueFmt={(v) => fmt.pct(v)} color={SERIES[1]}
              onClick={(r) => { setMode("skill"); setSkill(r.label); }} selected={mode === "skill" ? skill : null} />
          </Panel>
          <Panel title={<span className="flex items-center gap-1.5"><TrendingDown size={16} className="text-muted" />Skills in falling demand</span>}>
            <BarList rows={em.declining.slice(0, 5).map((r) => ({ label: r.skill, value: r.growth }))} valueFmt={(v) => fmt.pct(v)} color={SERIES[0]}
              onClick={(r) => { setMode("skill"); setSkill(r.label); }} selected={mode === "skill" ? skill : null} />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        <Panel title={<span className="flex items-center gap-1.5"><Sparkles size={16} className="text-cyan" />New skills employers started asking for</span>}
          info={<>These words appear in job posts but aren't in SkillNet's skill list yet. They are sorted by how fast they are spreading. Colleges can use this to update courses.</>}>
          <div className="flex flex-wrap gap-2">
            {em.new_terms.slice(0, 8).map((t) => <Chip key={t.term} on={term === t.term} onClick={() => setTerm(term === t.term ? null : t.term)}>{t.term} <span className="num opacity-80">{t.growth_x.toFixed(1)}×</span></Chip>)}
          </div>
          {T ? <div className="mt-3"><InfoBox onClose={() => setTerm(null)}>
            <b className="text-ink">{T.term}</b> appeared in <b className="num">{fmt.int(T.postings_total)}</b> job posts. Its share of posts grew <b className="num">{T.growth_x.toFixed(1)}×</b> in a year ({T.share_prior_pct.toFixed(2)}% → {T.share_recent_pct.toFixed(2)}%). First seen {T.first_seen}.
          </InfoBox></div> : <div className="text-[13px] text-muted mt-3">Tap a skill for details</div>}
        </Panel>
        <Panel title={`Which sectors will hire more in ${state}?`}
          right={<select aria-label="State" value={state} onChange={(e) => setState(e.target.value)} className="!py-1">{forecastStates.map((x) => <option key={x}>{x}</option>)}</select>}>
          <BarList rows={clusterGrowth} valueFmt={(v) => fmt.pct(v)} colorFn={(r) => (r.value >= 0 ? SERIES[1] : SERIES[0])}
            onClick={(r) => { setMode("sc"); setCluster(r.c); }} />
                  </Panel>
      </div>
    </div>
  );
}
