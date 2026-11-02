import { useState } from "react";
import { ArrowRight, Database, Brain, Network, LineChart as LC, Scale, Layers, CheckCircle2, AlertTriangle, FolderInput } from "lucide-react";
import { useData } from "../data";
import { Panel, SourceBadge } from "../components/ui";
import { MultiLine } from "../components/charts";
import { SERIES, fmt } from "../theme";

const FLOW = [
  [Database, "Sources", "Job postings · PLFS · ITIs · Census · boundaries"],
  [Brain, "NLP skill extraction", "Taxonomy matcher + tag normaliser + Skill2Vec"],
  [Network, "Occupation bridge", "Job title → NCO-2015 group (classifier)"],
  [Layers, "Supply model", "PLFS workers & jobseekers → skills"],
  [Scale, "Skill Gap Index", "Openings vs available, by state × skill"],
  [LC, "Forecasting", "ETS · XGBoost · GRU · ensemble, backtested"],
  [CheckCircle2, "Decisions", "Priority index · LP budget optimiser · simulator"],
];

export default function Methodology() {
  const { meta } = useData();
  const M = meta.models;
  const ex = M.forecast.examples;
  const [ser, setSer] = useState(Object.keys(ex)[0]);
  const e = ex[ser];
  const models = ["Seasonal naive", "ETS (Holt-Winters)", "XGBoost (global)", "GRU (global, PyTorch)"];
  const rows = [...e.train_tail.map((v, i) => ({ m: `t-${e.train_tail.length - i + 12}`, actual: v })),
    ...e.actual.map((v, i) => ({ m: M.forecast.holdout_months[i], actual: v, ...Object.fromEntries(models.map((k) => [k, e.preds[k][i]])) }))];

  return (
    <div className="p-4 space-y-4">
      <Panel eyebrow="How SkillNet works" title="Pipeline">
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {FLOW.map(([Icon, t, s], i) => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="glass px-3 py-2.5 w-[150px] h-full">
                <Icon size={16} className="text-cyan mb-1" />
                <div className="text-[12.5px] font-semibold">{t}</div>
                <div className="text-[11px] text-muted leading-snug">{s}</div>
              </div>
              {i < FLOW.length - 1 && <ArrowRight size={16} className="text-muted shrink-0" />}
            </div>
          ))}
        </div>
      </Panel>

      <Panel eyebrow={`Generated ${meta.generated_at} · demand snapshot ${meta.snapshot} · history ${meta.history}`} title="Datasets used">
        <table className="data">
          <thead><tr><th>Dataset</th><th>Type</th><th className="!text-right">Rows</th><th>Used for</th><th>Source / note</th></tr></thead>
          <tbody>{meta.provenance.map((p) => (
            <tr key={p.dataset}><td className="font-medium">{p.dataset}</td><td><SourceBadge type={p.type} /></td><td className="num text-right">{fmt.int(p.rows)}</td>
              <td className="text-ink2">{p.use}</td><td className="text-[11.5px] text-muted">{p.source || p.note}</td></tr>
          ))}</tbody>
        </table>
      </Panel>

      <div className="grid grid-cols-3 gap-4">
        <Card title="Skill extraction (NLP)" method={M.skill_extraction.method}
          stats={[["Precision", M.skill_extraction.precision], ["Recall", M.skill_extraction.recall], ["F1", M.skill_extraction.f1]]}
          note={`Scored on ${fmt.int(M.skill_extraction.n_postings)} synthetic postings with known skills. On ${fmt.int(M.skill_extraction.real_data_agreement.n_postings)} real 2025 postings it finds ${Math.round(M.skill_extraction.real_data_agreement.recall_vs_reference * 100)}% of the skills the dataset's own keyword labels found; it also finds more (taxonomy is broader), so "precision vs reference" (${M.skill_extraction.real_data_agreement.precision_vs_reference}) understates true precision.`} />
        <Card title="Occupation bridge" method={M.occupation.model}
          stats={[["Unseen job families", M.occupation.accuracy_unseen_job_families], ["Macro-F1 (unseen)", M.occupation.macro_f1_unseen_job_families], ["Classes", M.occupation.n_classes]]}
          note={`Maps a posting's title + skills to one of ${M.occupation.n_classes} NCO-2015 groups so demand can be compared with PLFS supply. Accuracy on a random split is ${M.occupation.accuracy_random_split} (titles repeat); the honest number is on job families held out of training.`} />
        <Card title="Salary premium model" method={M.salary.model}
          stats={[["Recovery r", M.salary.recovery_corr_vs_planted], ["Mean error (pp)", M.salary.mean_abs_error_pp], ["Salaried postings", fmt.compact(M.salary.n_salaried_postings)]]}
          note="Pay premium of each skill within the same role, state and experience. Validated by recovering premiums planted in the synthetic data." />
        <Card title="Emerging-skill discovery" method={M.emerging.method}
          stats={[["Planted", M.emerging.planted_terms.length], ["Found (top 8)", M.emerging.found_top8.filter((t) => M.emerging.planted_terms.includes(t)).length]]}
          note={`Found: ${M.emerging.found_top8.join(", ")}. "Drone Surveying" was folded into the existing Surveying skill by the tag normaliser, which is the intended behaviour.`} />
        <Card title="Skill2Vec" method={M.skill2vec.method} stats={[["Skills embedded", M.skill2vec.vocab]]}
          note="Learns which skills travel together. Powers 'adjacent skills' and the order of each student's learning path." />
        <Card title="Priority index & optimiser" method={`${M.priority.method}. ${M.optimiser.method}.`}
          stats={[["Default budget", "₹500 Cr"], ["Programmes funded", M.optimiser.allocated_rows], ["Placements", fmt.compact(M.optimiser.expected_placements)]]}
          note="Components: shortage size, gap severity, forecast growth, wage premium, training gap, youth unemployment. Weights are editable on the Recommendations page." />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
        <Panel eyebrow="12-month holdout, rolling origin" title="Forecast model comparison">
          <table className="data">
            <thead><tr><th>Model</th><th className="!text-right">MASE all</th><th className="!text-right">Skill series</th><th className="!text-right">State × sector</th><th className="!text-right">sMAPE</th></tr></thead>
            <tbody>{M.forecast.table.map((r, i) => (
              <tr key={r.model}><td className={i === 0 ? "font-semibold text-cyan" : ""}>{r.model}{i === 0 && " ✓"}</td><td className="num text-right">{r.MASE_all}</td>
                <td className="num text-right">{r.MASE_skill_series}</td><td className="num text-right">{r.MASE_state_cluster_series}</td><td className="num text-right">{r.sMAPE_pct}%</td></tr>
            ))}</tbody>
          </table>
          <div className="text-[12px] text-ink2 mt-3 leading-relaxed">
            MASE below 1 beats "same month last year". With about 70 months per series, the classic ETS model narrowly wins; the global XGBoost and GRU models help most on noisier state × sector series, which is why the ensemble is close behind. The deep model is kept but doesn't win on this much history. Retest when more months of real data arrive.
          </div>
        </Panel>
        <Panel eyebrow="Holdout months" title="Actual vs model predictions"
          right={<select value={ser} onChange={(e) => setSer(e.target.value)} className="!py-1">{Object.keys(ex).map((k) => <option key={k} value={k}>{k.replace("skill::", "").replace("sc::", "").replace("::", " · ")}</option>)}</select>}>
          <MultiLine rows={rows} xKey="m" height={260} refX={M.forecast.holdout_months[0]}
            series={[{ key: "actual", name: "Actual", color: "#eef1f8" }, ...models.map((k, i) => ({ key: k, name: k, color: SERIES[i], width: 1.6 }))]} />
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Panel title="Key definitions & assumptions" eyebrow="Read before quoting numbers">
          <ul className="text-[12.5px] text-ink2 space-y-1.5 list-disc pl-4">
            <li><b className="text-ink">Openings</b> = annual hires ({meta.assumptions.annual_hire_rate * 100}% of non-farm workers) × share of the state's postings asking for the skill.</li>
            <li><b className="text-ink">Available</b> = jobseekers whose education, technical education or training field points to the skill, plus ITI/polytechnic graduates (pass rate {meta.assumptions.iti_pass_rate * 100}%).</li>
            <li><b className="text-ink">Skill Gap Index</b> = 100 × (openings − available) / (openings + available).</li>
            <li>Supply grows {meta.assumptions.supply_growth * 100}%/yr; simulator defaults: completion {meta.assumptions.completion * 100}%, placement {meta.assumptions.placement * 100}%.</li>
            <li>Supply is estimated at state level (PLFS is designed for state estimates). District maps show demand only.</li>
          </ul>
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><AlertTriangle size={15} className="text-warn" />Limitations</span>}>
          <ul className="text-[12.5px] text-ink2 space-y-1.5 list-disc pl-4">
            <li>This demo's multi-sector postings, workforce sample and ITI list are synthetic. They follow the real schemas, but the results illustrate the method and are not findings.</li>
            <li>Online postings over-represent formal, urban jobs; informal hiring is under-counted even with real data.</li>
            <li>A gap estimate built on fewer than 25 postings is flagged low-evidence and down-weighted.</li>
            <li>Occupation mapping is {Math.round(M.occupation.accuracy_unseen_job_families * 100)}% accurate on unseen job families: usable for state aggregates, not for classifying individual postings.</li>
          </ul>
        </Panel>
        <Panel title={<span className="flex items-center gap-1.5"><FolderInput size={15} className="text-cyan" />Switch to real data</span>}>
          <ol className="text-[12.5px] text-ink2 space-y-1.5 list-decimal pl-4">
            <li>Put the Kaggle job CSVs in <code className="text-ink">data/raw/jobs/</code> (columns are auto-detected).</li>
            <li>Put the PLFS person file (cperv1, CSV/DTA) in <code className="text-ink">data/raw/plfs/</code>.</li>
            <li>Optional: the ITI list as <code className="text-ink">data/raw/training_centres.csv</code>.</li>
            <li>Run <code className="text-ink">python -m pipeline.run_all</code>. Every page rebuilds; this table relabels sources as Real.</li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function Card({ title, method, stats, note }) {
  return (
    <div className="panel p-4">
      <div className="text-[14px] font-semibold">{title}</div>
      <div className="text-[11.5px] text-muted mb-2.5">{method}</div>
      <div className="flex gap-2 mb-2.5">
        {stats.map(([k, v]) => <div key={k} className="flex-1 rounded-lg bg-[#0a1122] border border-line px-2.5 py-2"><div className="text-[10.5px] text-muted">{k}</div><div className="text-[17px] font-semibold num text-cyan">{v}</div></div>)}
      </div>
      <div className="text-[11.5px] text-ink2 leading-relaxed">{note}</div>
    </div>
  );
}
