import { useMemo, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, Cpu } from "lucide-react";
import { useData } from "../data";
import { Panel, SkillSelect, StateSelect, Seg, BarList, DemoNote, Kpi } from "../components/ui";
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
  const bt = data.meta.models.forecast;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
        <Panel eyebrow={`Model: ${f.model} · chosen by 12-month backtest`} title="Demand forecast"
          right={<Seg options={[["skill", "Skill (national)"], ["sc", "State × sector"]]} value={mode} onChange={setMode} />}>
          <div className="flex flex-wrap gap-2 mb-3">
            {mode === "skill" ? <SkillSelect value={skill} onChange={(v) => v && setSkill(v)} includeCore /> : <>
              <select value={state} onChange={(e) => setState(e.target.value)}>{forecastStates.map((x) => <option key={x}>{x}</option>)}</select>
              <select value={stateClusters.includes(cluster) ? cluster : stateClusters[0]} onChange={(e) => setCluster(e.target.value)}>
                {stateClusters.map((c) => <option key={c} value={c}>{data.clusters[c]}</option>)}
              </select>
            </>}
          </div>
          {s ? <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Kpi label="Postings, last 12 months" value={fmt.int(last12)} />
              <Kpi label="Forecast, next 12 months" value={fmt.int(next12)} sub={`80% range ${fmt.compact(s.lo.reduce((a, b) => a + b, 0))} – ${fmt.compact(s.hi.reduce((a, b) => a + b, 0))}`} />
              <Kpi label="Expected change" value={fmt.pct(s.g)} tone={s.g > 0.05 ? "bad" : s.g < -0.03 ? "good" : undefined} sub={s.g > 0.05 ? "demand rising" : s.g < -0.03 ? "demand easing" : "flat"} />
            </div>
            <ForecastChart hist={s.h} fut={s} histMonths={f.hist_months} futMonths={f.fut_months} />
          </> : <div className="text-muted text-sm py-10 text-center">Not enough postings to forecast this series.</div>}
          <DemoNote className="mt-2" />
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="Next 12 months" title={<span className="flex items-center gap-1.5"><TrendingUp size={15} className="text-[#f39b93]" />Fastest-rising skills</span>}>
            <BarList rows={em.rising.slice(0, 9).map((r) => ({ label: r.skill, value: r.growth }))} valueFmt={(v) => fmt.pct(v)} color={SERIES[6]}
              onClick={(r) => { setMode("skill"); setSkill(r.label); }} />
          </Panel>
          <Panel title={<span className="flex items-center gap-1.5"><TrendingDown size={15} className="text-[#86b6ef]" />Declining skills</span>}>
            <BarList rows={em.declining.slice(0, 5).map((r) => ({ label: r.skill, value: r.growth }))} valueFmt={(v) => fmt.pct(v)} color={SERIES[0]}
              onClick={(r) => { setMode("skill"); setSkill(r.label); }} />
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        <Panel eyebrow="NLP discovery · not in the taxonomy yet" title={<span className="flex items-center gap-1.5"><Sparkles size={15} className="text-cyan" />Emerging skills found in job postings</span>}>
          <table className="data">
            <thead><tr><th>Term recruiters started using</th><th className="!text-right">Postings</th><th className="!text-right">Share now</th><th className="!text-right">Share 1 yr ago</th><th className="!text-right">Growth</th><th>First seen</th></tr></thead>
            <tbody>{em.new_terms.slice(0, 8).map((t) => (
              <tr key={t.term}><td className="font-medium">{t.term}</td><td className="num text-right">{fmt.int(t.postings_total)}</td>
                <td className="num text-right">{t.share_recent_pct.toFixed(2)}%</td><td className="num text-right text-muted">{t.share_prior_pct.toFixed(2)}%</td>
                <td className="num text-right font-semibold text-cyan">{t.growth_x.toFixed(1)}×</td><td className="text-muted">{t.first_seen}</td></tr>
            ))}</tbody>
          </table>
          <div className="text-[11.5px] text-muted mt-2">Recruiter tags that match no taxonomy skill are tracked; terms whose share of postings is climbing fastest are flagged for curriculum review. Add them to the taxonomy to start measuring their gap.</div>
        </Panel>
        <Panel eyebrow={`Forecast growth by sector`} title={`Which sectors will hire more in ${state}?`}
          right={<select value={state} onChange={(e) => setState(e.target.value)} className="!py-1">{forecastStates.map((x) => <option key={x}>{x}</option>)}</select>}>
          <BarList rows={clusterGrowth} valueFmt={(v) => fmt.pct(v)} colorFn={(r) => (r.value >= 0 ? SERIES[6] : SERIES[0])}
            onClick={(r) => { setMode("sc"); setCluster(r.c); }} />
          <div className="mt-3 rounded-lg bg-[#0a1122] border border-line p-3 text-[12px] text-ink2 flex gap-2">
            <Cpu size={15} className="text-cyan shrink-0 mt-0.5" />
            <span>Backtest on the last 12 months: <b className="text-ink">{bt.table[0].model}</b> MASE {bt.table[0].MASE_all} vs seasonal-naive {bt.table.find((r) => r.model === "Seasonal naive")?.MASE_all}. Lower is better; under 1 beats "same month last year". Full comparison in Data & Methodology.</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}
