import { useEffect, useMemo, useState } from "react";
import { Radar, Eye, EyeOff, ShieldCheck, Info, ArrowRight, Loader2 } from "lucide-react";
import { ROLES, DEMO_USERS, DEMO_PASSWORD, SELF_SERVICE } from "../roles";
import { signIn, signUp, authMode } from "../auth";
import { fmt } from "../theme";

// Glowing India outline drawn from the state boundaries (equirectangular projection, cos-latitude corrected)
function IndiaGlow({ geo }) {
  const paths = useMemo(() => {
    const k = 13, X = (lon) => (lon - 68) * k * 0.94, Y = (lat) => (37.5 - lat) * k;
    const ring = (r) => r.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join("") + "Z";
    return geo.features.map((f) => {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      return { id: f.properties.state, d: polys.map((p) => ring(p[0])).join("") };
    });
  }, [geo]);
  return (
    <svg viewBox="0 0 370 420" className="w-full h-full" aria-hidden="true">
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="fillg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3987e5" stopOpacity="0.35" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0.12" /></linearGradient>
      </defs>
      <g filter="url(#glow)">
        {paths.map((p) => <path key={p.id} d={p.d} fill="url(#fillg)" stroke="#5aa7ff" strokeOpacity="0.85" strokeWidth="0.7" />)}
      </g>
      {[[152, 312], [118, 238], [104, 96], [196, 330], [260, 205], [176, 182], [92, 268]].map(([x, y], i) => (
        <g key={i}><circle cx={x} cy={y} r="2.6" fill="#22d3ee" /><line x1={x} x2={x} y1={y} y2={y - 18 - (i % 3) * 12} stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1.2" /></g>
      ))}
    </svg>
  );
}

export default function Login({ meta, geo, onSession }) {
  const [tab, setTab] = useState("signin");
  const [mode, setMode] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student", organisation: "", state: "", invite_code: "" });
  useEffect(() => { authMode().then(setMode); }, []);

  const run = async (fn) => {
    setErr(""); setBusy(true);
    try { onSession(await fn()); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  const demo = (u) => run(() => signIn(u.email, DEMO_PASSWORD));
  const states = meta.__states || [];

  return (
    <div className="min-h-full grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden border-r border-line bg-[radial-gradient(900px_600px_at_30%_40%,#10234d_0%,transparent_60%)]">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-violet shadow-[0_0_24px_#3987e566]"><Radar size={20} className="text-white" /></div>
          <div><div className="font-bold text-[17px]">SkillNet <span className="text-cyan">India</span></div><div className="text-[11px] text-muted">National Skill Intelligence</div></div>
        </div>
        <div className="grid grid-cols-[1fr_330px] items-center gap-6">
          <div>
            <h1 className="text-[38px] leading-[1.1] font-bold">Where India's skills<br /><span className="text-cyan glow-text">meet its jobs</span></h1>
            <p className="text-ink2 mt-4 text-[15px] max-w-[440px]">Compare what employers need with what the workforce has, state by state, forecast the gaps, and decide where to train next.</p>
            <div className="flex flex-wrap gap-2 mt-6">
              {[[fmt.compact(meta.counts.postings), "job postings analysed"], [meta.counts.skills, "skills tracked"], [fmt.compact(meta.counts.centres), "training centres mapped"], [meta.counts.districts, "districts"]].map(([v, l]) => (
                <div key={l} className="glass px-3 py-2"><div className="text-[18px] font-semibold num">{v}</div><div className="text-[11px] text-muted">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="h-[380px]"><IndiaGlow geo={geo} /></div>
        </div>
        <div className="text-[11.5px] text-muted">Built for governments, colleges, industry and students.</div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[440px]">
          <div className="panel p-6">
            <div className="flex rounded-lg bg-[#0a1122] border border-line p-0.5 mb-5">
              {[["signin", "Sign in"], ["signup", "Create account"]].map(([k, l]) => (
                <button key={k} onClick={() => { setTab(k); setErr(""); }} className={`flex-1 py-2 rounded-md text-[13.5px] ${tab === k ? "bg-accent text-white" : "text-ink2"}`}>{l}</button>
              ))}
            </div>

            {tab === "signin" ? (
              <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)); }} className="space-y-3">
                <Field label="Email"><input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" className="w-full" /></Field>
                <Field label="Password">
                  <div className="relative">
                    <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full pr-9 bg-[#0a1122] border border-line rounded-[9px] px-[10px] py-[7px] text-[13px] outline-none focus:border-accent" />
                    <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" aria-label="Show password">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </Field>
                <Submit busy={busy} label="Sign in" />
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); run(() => signUp(form)); }} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLES).map(([k, r]) => {
                    const Icon = r.icon;
                    return (
                      <button type="button" key={k} onClick={() => setForm({ ...form, role: k })}
                        className={`text-left rounded-xl border p-2.5 transition ${form.role === k ? "border-cyan bg-cyan/10" : "border-line hover:border-accent"}`}>
                        <Icon size={16} className="text-cyan mb-1" /><div className="text-[12.5px] font-semibold leading-tight">{r.label}</div>
                        <div className="text-[10.5px] text-muted leading-snug mt-0.5">{r.sub}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11.5px] text-ink2 bg-[#0a1122] border border-line rounded-lg px-3 py-2">{ROLES[form.role].can}</div>
                <Field label="Full name"><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={form.role === "student" ? "College / school (optional)" : "Organisation"}><input type="text" value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} className="w-full" /></Field>
                  <Field label="State">
                    <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full"><option value="">Select</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
                  </Field>
                </div>
                <Field label="Email"><input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" className="w-full" /></Field>
                <Field label="Password (8+ characters, letters and numbers)"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" className="w-full bg-[#0a1122] border border-line rounded-[9px] px-[10px] py-[7px] text-[13px] outline-none focus:border-accent" /></Field>
                {!SELF_SERVICE.includes(form.role) && (
                  <Field label="Government invite code"><input type="text" value={form.invite_code} onChange={(e) => setForm({ ...form, invite_code: e.target.value })} placeholder="Given by the administrator" className="w-full" /></Field>
                )}
                <Submit busy={busy} label="Create account" />
              </form>
            )}

            {err && <div role="alert" className="mt-3 text-[12.5px] rounded-lg border border-crit/50 bg-crit/10 text-[#f39b93] px-3 py-2">{err}</div>}

            <div className="mt-5">
              <div className="eyebrow mb-2">Try a demo account</div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((u) => {
                  const r = ROLES[u.role], Icon = r.icon;
                  return (
                    <button key={u.email} disabled={busy} onClick={() => demo(u)} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left hover:border-cyan disabled:opacity-50">
                      <Icon size={15} className="text-cyan shrink-0" /><span className="text-[12px] leading-tight">{r.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted mt-2">Demo password for all four: <code className="text-ink2">{DEMO_PASSWORD}</code></div>
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-muted flex gap-1.5">
            {mode === "server"
              ? <><ShieldCheck size={14} className="text-good shrink-0" />Secure sign-in: passwords are hashed on the server and each session is a signed token that expires in 12 hours.</>
              : mode === "demo"
                ? <><Info size={14} className="text-warn shrink-0" />Demo mode: this copy has no server, so sign-in is simulated in your browser. Don't use a real password here.</>
                : <><Loader2 size={14} className="animate-spin shrink-0" />Checking for the server…</>}
          </div>
        </div>
      </section>
    </div>
  );
}

const Field = ({ label, children }) => <label className="block"><span className="text-[12px] text-muted">{label}</span><div className="mt-1">{children}</div></label>;
const Submit = ({ busy, label }) => (
  <button disabled={busy} className="w-full rounded-lg bg-accent py-2.5 text-[14px] font-medium flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60">
    {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}{label}
  </button>
);
