import { useMemo, useState } from "react";
import { Info, X, ChevronDown, Search } from "lucide-react";
import { fmt, sgiColor, SGI_STOPS, DIVERGING } from "../theme";
import { useData } from "../data";

export function Panel({ title, eyebrow, right, children, className = "", pad = true }) {
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || right) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div>
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? "px-4 pb-4" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, icon: Icon }) {
  const color = tone === "bad" ? "text-[#f39b93]" : tone === "good" ? "text-[#86b6ef]" : "text-ink";
  return (
    <div className="glass px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 eyebrow">{Icon && <Icon size={12} className="text-cyan" />}{label}</div>
      <div className={`mt-1 text-[22px] font-semibold leading-tight num ${color}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function SourceBadge({ type }) {
  const map = { real: ["Real", "#0ca30c"], synthetic: ["Synthetic", "#fab219"], reference: ["Reference", "#9085e9"] };
  const [label, c] = map[type] || [type, "#7d88a3"];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: c + "22", color: c, border: `1px solid ${c}55` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{label}
    </span>
  );
}

export function DemoNote({ className = "" }) {
  return (
    <div className={`text-[11px] text-muted flex items-center gap-1.5 ${className}`}>
      <Info size={12} className="text-warn" /> Demo build: demand & supply partly synthetic (see Data & Methodology). Real files drop in via <code className="text-ink2">data/raw/</code>.
    </div>
  );
}

export function ConfDot({ c }) {
  const m = [["Low evidence", "#7d88a3"], ["Medium", "#fab219"], ["High", "#0ca30c"]][c ?? 0];
  return <span title={`${m[0]} confidence`} className="inline-block w-2 h-2 rounded-full" style={{ background: m[1] }} />;
}

export function SgiChip({ v }) {
  return (
    <span className="num inline-flex min-w-[42px] justify-center rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold"
      style={{ background: sgiColor(v), color: Math.abs(v) >= 40 ? "#fff" : "#eef1f8" }}>{fmt.sgi(v)}</span>
  );
}

export function DivergingLegend({ title = "Skill Gap Index", left = "Surplus", right = "Shortage" }) {
  const cells = [...DIVERGING.neg, DIVERGING.mid, ...DIVERGING.pos];
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="flex gap-[2px]">{cells.map((c, i) => <div key={i} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
      <div className="flex justify-between text-[10.5px] text-muted mt-1"><span>← {left}</span><span>balanced</span><span>{right} →</span></div>
    </div>
  );
}

export function SeqLegend({ title, ramp, lo, hi }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="flex gap-[2px]">{ramp.map((c, i) => <div key={i} className="h-2.5 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
      <div className="flex justify-between text-[10.5px] text-muted mt-1"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

export function Seg({ options, value, onChange, size = "sm" }) {
  return (
    <div className="inline-flex rounded-lg bg-[#0a1122] border border-line p-0.5">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 ${size === "sm" ? "py-1 text-[12px]" : "py-1.5 text-[13px]"} rounded-md transition ${value === v ? "bg-accent/90 text-white shadow" : "text-ink2 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

export function StateSelect({ value, onChange, allLabel = "All India", className = "" }) {
  const data = useData();
  const states = useMemo(() => data.states.map((s) => s.state).sort(), [data]);
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      {allLabel && <option value="">{allLabel}</option>}
      {states.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

export function SkillSelect({ value, onChange, allLabel, includeCore = false, className = "" }) {
  const data = useData();
  const groups = useMemo(() => {
    const g = {};
    data.skillsList.forEach((s) => { if (includeCore || s.cluster !== "CS") (g[s.cluster] ||= []).push(s.name); });
    return g;
  }, [data, includeCore]);
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      {allLabel && <option value="">{allLabel}</option>}
      {Object.entries(groups).map(([c, list]) => (
        <optgroup key={c} label={data.clusters[c]}>{list.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
      ))}
    </select>
  );
}

export function ClusterSelect({ value, onChange, allLabel = "All clusters", className = "" }) {
  const data = useData();
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{allLabel}</option>
      {Object.entries(data.clusters).filter(([k]) => k !== "CS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function SkillChips({ value, onChange, placeholder = "Add a skill…" }) {
  const data = useData();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const t = q.toLowerCase();
    return data.skillsList.filter((s) => !value.includes(s.name) && (!t || s.name.toLowerCase().includes(t))).slice(0, 8);
  }, [q, value, data]);
  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-[#0a1122] p-2 min-h-[44px]">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-accent/20 border border-accent/40 px-2.5 py-0.5 text-[12px]">
            {s}<button onClick={() => onChange(value.filter((x) => x !== s))}><X size={12} /></button>
          </span>
        ))}
        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
          <Search size={13} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder} className="!border-0 !bg-transparent !p-0 !shadow-none flex-1 text-[13px]" type="text" />
        </div>
      </div>
      {open && hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-full glass p-1 max-h-64 overflow-auto">
          {hits.map((s) => (
            <button key={s.name} onMouseDown={() => { onChange([...value, s.name]); setQ(""); }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] hover:bg-accent/20 flex justify-between">
              <span>{s.name}</span><span className="text-muted text-[11px]">{data.clusters[s.cluster]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal bar list: label | bar | value  (thin bars, 4px rounded data-end, value in text ink)
export function BarList({ rows, max, color = "#3987e5", valueFmt = fmt.compact, onClick, colorFn, sub }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <button key={r.label + i} onClick={() => onClick?.(r)} className="w-full grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] items-center gap-2.5 text-left group">
          <span className="text-[12.5px] text-ink2 truncate group-hover:text-ink" title={r.label}>{r.label}{sub && r.sub && <span className="text-muted"> · {r.sub}</span>}</span>
          <span className="h-[9px] rounded-full bg-[#121b33] overflow-hidden">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (100 * Math.abs(r.value)) / m)}%`, background: colorFn ? colorFn(r) : color }} />
          </span>
          <span className="num text-[12px] text-ink w-14 text-right">{valueFmt(r.value)}</span>
        </button>
      ))}
    </div>
  );
}

export function Tip({ x, y, children }) {
  if (x == null) return null;
  return (
    <div className="pointer-events-none absolute z-40 glass px-3 py-2 text-[12px] shadow-xl" style={{ left: x + 14, top: y + 14, maxWidth: 280 }}>
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="text-muted text-[12.5px] py-6 text-center">{children}</div>;
}

export function Collapse({ title, children, open: o = false }) {
  const [open, setOpen] = useState(o);
  return (
    <div className="border-t border-line">
      <button className="w-full flex items-center justify-between py-2 text-[12.5px] text-ink2" onClick={() => setOpen(!open)}>
        {title}<ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export { SGI_STOPS };
