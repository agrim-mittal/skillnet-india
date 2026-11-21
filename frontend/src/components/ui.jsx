import { useId, useMemo, useState } from "react";
import { Info, X, ChevronDown, Search } from "lucide-react";
import { fmt, sgiColor, sgiInk, DIVERGING, C } from "../theme";
import { useData } from "../data";

export function Panel({ title, eyebrow, right, children, className = "", pad = true, info }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`panel ${className}`}>
      {(title || eyebrow || right || info) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="text-[14.5px] font-semibold text-ink flex items-center gap-1.5">{title}
              {info && <InfoButton open={open} onClick={() => setOpen(!open)} label={typeof title === "string" ? title : "this section"} />}</h2>}
          </div>
          {right}
        </header>
      )}
      {info && open && <div className="px-4"><InfoBox onClose={() => setOpen(false)}>{info}</InfoBox></div>}
      <div className={pad ? "px-4 pb-4" : ""}>{children}</div>
    </section>
  );
}

// ⓘ button that reveals an explanation only when the user asks for it
export function InfoButton({ open, onClick, label = "this" }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={`${open ? "Hide" : "Explain"} ${label}`}
      className={`inline-grid place-items-center w-6 h-6 rounded-full shrink-0 ${open ? "bg-accent text-onaccent" : "text-muted hover:text-ink hover:bg-panel2"}`}>
      <Info size={15} />
    </button>
  );
}
export function InfoBox({ children, onClose }) {
  return (
    <div role="note" className="mb-3 rounded-lg border-l-4 border-saffron bg-panel2 px-3 py-2.5 text-[13.5px] text-ink2 leading-relaxed flex gap-2">
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} aria-label="Close explanation" className="text-muted hover:text-ink self-start"><X size={14} /></button>}
    </div>
  );
}
// Inline ⓘ + text pair (for places without a Panel header)
export function Explain({ label, children, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Info size={14} />{label}
      </button>
      {open && <div className="mt-2"><InfoBox onClose={() => setOpen(false)}>{children}</InfoBox></div>}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, icon: Icon }) {
  const color = tone === "bad" ? "text-short" : tone === "good" ? "text-surplus" : "text-ink";
  return (
    <div className="panel px-4 py-3 min-w-0">
      <div className="flex items-center gap-1.5 eyebrow">{Icon && <Icon size={14} className="text-cyan" aria-hidden="true" />}{label}</div>
      <div className={`mt-1 text-[22px] font-semibold leading-tight num ${color}`}>{value}</div>
      {sub && <div className="text-[12.5px] text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

export function SourceBadge({ type }) {
  const map = { real: ["Real", "var(--c-good)"], synthetic: ["Synthetic (demo)", "var(--c-warn)"], reference: ["Reference", "var(--c-violet)"] };
  const [label, c] = map[type] || [type, "var(--c-muted)"];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold border" style={{ color: c, borderColor: c }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{label}
    </span>
  );
}

export function DemoNote({ className = "" }) {
  const { go } = useData() || {};
  return (
    <button onClick={() => go?.("method")} className={`text-[12px] text-muted inline-flex items-center gap-1.5 hover:text-ink ${className}`}>
      <Info size={12} className="text-warn" /> Demo data: some figures are simulated
    </button>
  );
}

export function ConfDot({ c }) {
  const m = [["Less certain", "var(--c-muted)"], ["Fairly certain", "var(--c-warn)"], ["Certain", "var(--c-good)"]][c ?? 0];
  return <span title={m[0]} role="img" aria-label={m[0]} className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: m[1] }} />;
}

export function SgiChip({ v }) {
  return (
    <span className="num inline-flex min-w-[42px] justify-center rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold"
      style={{ background: sgiColor(v), color: sgiInk(v) }} title={`Gap score ${fmt.sgi(v)}`}>{fmt.sgi(v)}</span>
  );
}

export function DivergingLegend({ title = "Gap score", left = "Extra workers", right = "Shortage" }) {
  const cells = [...DIVERGING.neg, DIVERGING.mid, ...DIVERGING.pos];
  return (
    <div>
      {title && <div className="eyebrow mb-1.5">{title}</div>}
      <div className="flex gap-[2px]" aria-hidden="true">{cells.map((c, i) => <div key={i} className="h-3 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
      <div className="flex justify-between text-[12px] text-muted mt-1"><span>← {left}</span><span>{right} →</span></div>
    </div>
  );
}

export function SeqLegend({ title, ramp, lo, hi }) {
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      <div className="flex gap-[2px]" aria-hidden="true">{ramp.map((c, i) => <div key={i} className="h-3 flex-1 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
      <div className="flex justify-between text-[12px] text-muted mt-1"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

export function Seg({ options, value, onChange, size = "sm", label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-field border border-line p-0.5">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`px-3 ${size === "sm" ? "py-1 text-[13px]" : "py-1.5 text-[14px]"} rounded-md transition ${value === v ? "bg-accent text-onaccent font-medium" : "text-ink2 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

// Accessible on/off switch
export function Switch({ checked, onChange, label }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <span id={id} className="text-ink2">{label}</span>
      <button role="switch" aria-checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full relative transition shrink-0 border ${checked ? "bg-accent border-accent" : "bg-panel2 border-line"}`}>
        <span className={`absolute top-[3px] w-4 h-4 rounded-full transition-all ${checked ? "left-[20px] bg-onaccent" : "left-[3px] bg-muted"}`} />
      </button>
    </div>
  );
}

export function Chip({ on, onClick, children, ...rest }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} {...rest}
      className={`rounded-full px-3 py-1.5 text-[13.5px] border transition ${on ? "bg-accent border-accent text-onaccent font-medium" : "bg-panel border-line text-ink2 hover:border-accent hover:text-ink"}`}>
      {children}
    </button>
  );
}

export function StateSelect({ value, onChange, allLabel = "All India", className = "", label = "State" }) {
  const data = useData();
  const states = useMemo(() => data.states.map((s) => s.state).sort(), [data.states]);
  return (
    <select aria-label={label} className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      {allLabel && <option value="">{allLabel}</option>}
      {states.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

export function SkillSelect({ value, onChange, allLabel, includeCore = false, className = "", label = "Skill" }) {
  const data = useData();
  const groups = useMemo(() => {
    const g = {};
    data.skillsList.forEach((s) => { if (includeCore || s.cluster !== "CS") (g[s.cluster] ||= []).push(s.name); });
    return g;
  }, [data.skillsList, includeCore]);
  return (
    <select aria-label={label} className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      {allLabel && <option value="">{allLabel}</option>}
      {Object.entries(groups).map(([c, list]) => (
        <optgroup key={c} label={data.clusters[c]}>{list.map((s) => <option key={s} value={s}>{s}</option>)}</optgroup>
      ))}
    </select>
  );
}

export function ClusterSelect({ value, onChange, allLabel = "All sectors", className = "", label = "Sector" }) {
  const data = useData();
  return (
    <select aria-label={label} className={className} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{allLabel}</option>
      {Object.entries(data.clusters).filter(([k]) => k !== "CS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function SkillChips({ value, onChange, placeholder = "Type a skill…" }) {
  const data = useData();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const t = q.toLowerCase();
    return data.skillsList.filter((s) => !value.includes(s.name) && (!t || s.name.toLowerCase().includes(t))).slice(0, 8);
  }, [q, value, data.skillsList]);
  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-field p-2 min-h-[44px]">
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-accent/15 border border-accent/40 px-2.5 py-0.5 text-[13px]">
            {s}<button onClick={() => onChange(value.filter((x) => x !== s))} aria-label={`Remove ${s}`}><X size={13} /></button>
          </span>
        ))}
        <div className="flex items-center gap-1 flex-1 min-w-[140px]">
          <Search size={14} className="text-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder} aria-label="Add a skill" className="!border-0 !bg-transparent !p-0 !shadow-none !min-h-0 flex-1 text-[14px]" type="text" />
        </div>
      </div>
      {open && hits.length > 0 && (
        <div className="absolute z-30 mt-1 w-full glass p-1 max-h-64 overflow-auto" role="listbox">
          {hits.map((s) => (
            <button key={s.name} role="option" onMouseDown={() => { onChange([...value, s.name]); setQ(""); }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[13.5px] hover:bg-accent/15 flex justify-between">
              <span>{s.name}</span><span className="text-muted text-[12px]">{data.clusters[s.cluster]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Horizontal bar list: label | bar | value. `selected` highlights the chosen row.
export function BarList({ rows, max, color, valueFmt = fmt.compact, onClick, colorFn, sub, selected }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const Tag = onClick ? "button" : "div";
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const on = selected != null && selected === r.label;
        return (
          <Tag key={r.label + i} onClick={onClick ? () => onClick(r) : undefined} aria-pressed={onClick ? on : undefined}
            className={`w-full grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] items-center gap-2.5 text-left rounded-md px-1.5 py-1 group ${onClick ? "hover:bg-panel2" : ""} ${on ? "bg-panel2 ring-2 ring-accent" : ""}`}>
            <span className="text-[13.5px] text-ink2 truncate group-hover:text-ink" title={r.label}>{r.label}{sub && r.sub && <span className="text-muted"> · {r.sub}</span>}</span>
            <span className="h-[10px] rounded-full overflow-hidden" style={{ background: C.track }}>
              <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (100 * Math.abs(r.value)) / m)}%`, background: colorFn ? colorFn(r) : color || "var(--c-accent)" }} />
            </span>
            <span className="num text-[13px] text-ink w-14 text-right">{valueFmt(r.value)}</span>
          </Tag>
        );
      })}
    </div>
  );
}

export function Tip({ x, y, children }) {
  if (x == null) return null;
  return (
    <div className="pointer-events-none absolute z-40 glass px-3 py-2 text-[13px]" style={{ left: x + 14, top: y + 14, maxWidth: 280 }}>
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="text-muted text-[13.5px] py-6 text-center">{children}</div>;
}

// Prompt shown before the user has picked anything
export function PickHint({ icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[14px] text-muted">
      {Icon && <Icon size={20} className="mx-auto mb-1.5 text-cyan" aria-hidden="true" />}{children}
    </div>
  );
}

export function Collapse({ title, children, open: o = false, className = "" }) {
  const [open, setOpen] = useState(o);
  const id = useId();
  return (
    <div className={`border-t border-line ${className}`}>
      <button className="w-full flex items-center justify-between py-2.5 text-[13.5px] text-ink2 hover:text-ink font-medium" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={id}>
        {title}<ChevronDown size={16} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div id={id} className="pb-3">{children}</div>}
    </div>
  );
}
