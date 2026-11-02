// Printable state / national report (shown only when printing via "Export report").
import { useData } from "../data";
import { fmt } from "../theme";

export default function Report({ state }) {
  const data = useData();
  if (!data) return null;
  const s = state && data.stateBy[state];
  const pr = data.priority.filter((r) => !state || r.state === state).slice(0, 8);
  const agg = {};
  data.gap.forEach((r) => { if (r.cluster === "CS" || (state && r.state !== state) || r.conf === 0) return; const o = (agg[r.skill] ||= { o: 0, a: 0 }); o.o += r.openings; o.a += r.available; });
  const rows = Object.entries(agg).map(([k, o]) => ({ k, sh: o.o - o.a, sgi: (100 * (o.o - o.a)) / (o.o + o.a) }));
  const short = [...rows].sort((a, b) => b.sh - a.sh).slice(0, 8);
  const surp = [...rows].sort((a, b) => a.sh - b.sh).slice(0, 5);
  const box = { border: "1px solid #ccc", padding: 8, borderRadius: 6 };
  return (
    <div style={{ fontFamily: "system-ui", color: "#000", padding: 24, fontSize: 12 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>SkillNet India — {state || "All India"} skill-gap brief</h1>
      <div style={{ color: "#555" }}>Generated {data.meta.generated_at} · demand window {data.meta.snapshot} · demo data (partly synthetic, see methodology)</div>
      {s && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, margin: "14px 0" }}>
          {[["Gap index now", fmt.sgi(s.sgi)], ["In 12 months", fmt.sgi(s.sgi_next12)], ["Unemployment", s.ur + "%"], ["Youth unemployment", s.youth_ur + "%"], ["Training seats", fmt.int(s.seats)]].map(([k, v]) => (
            <div key={k} style={box}><div style={{ color: "#666" }}>{k}</div><b style={{ fontSize: 16 }}>{v}</b></div>))}
        </div>
      )}
      <h3>Largest shortages (persons per year)</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>{short.map((r) => <tr key={r.k}><td style={{ padding: 3 }}>{r.k}</td><td style={{ textAlign: "right" }}>{fmt.int(r.sh)}</td><td style={{ textAlign: "right" }}>{fmt.sgi(r.sgi)}</td></tr>)}</tbody></table>
      <h3>Surpluses</h3>
      <div>{surp.map((r) => `${r.k} (${fmt.sgi(r.sgi)})`).join(" · ")}</div>
      <h3>Recommended training priorities</h3>
      <ol>{pr.map((r) => <li key={r.state + r.skill}>{state ? "" : r.state + " — "}{r.skill}: priority {r.priority.toFixed(1)}, shortage {fmt.int(r.shortage)}/yr, demand {fmt.pct(r.growth)}</li>)}</ol>
      <p style={{ color: "#555", marginTop: 16 }}>Method: openings = annual hires × share of postings needing the skill; available = jobseekers with matching education/training + ITI graduates. Skill Gap Index = 100 × (openings − available)/(openings + available).</p>
    </div>
  );
}
