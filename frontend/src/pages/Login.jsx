import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, ShieldCheck, Info, ArrowRight, Loader2, Sun, Moon } from "lucide-react";
import { ROLES, DEMO_USERS, DEMO_PASSWORD, SELF_SERVICE } from "../roles";
import { signIn, signUp, authMode } from "../auth";
import { fmt, C } from "../theme";
import { Chakra } from "../components/Chakra";

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
        <linearGradient id="fillg" gradientUnits="userSpaceOnUse" x1="0" y1="5" x2="0" y2="385">
          <stop offset="0" stopColor="#ff9933" stopOpacity="0.85" /><stop offset="0.36" stopColor="#ff9933" stopOpacity="0.85" />
          <stop offset="0.36" stopColor="#ffffff" stopOpacity="0.9" /><stop offset="0.64" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.64" stopColor={C.outlineFill2} stopOpacity="0.85" /><stop offset="1" stopColor={C.outlineFill2} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {paths.map((p) => <path key={p.id} d={p.d} fill="url(#fillg)" stroke={C.outlineStroke} strokeOpacity="0.55" strokeWidth="0.7" />)}
      <g transform="translate(130 176)" color="#0b2a6b"><Chakra size={40} /></g>
    </svg>
  );
}

export default function Login({ meta, geo, onSession, mode: themeMode, onToggleMode }) {
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
    <div className="min-h-full flex flex-col relative"><div className="tricolour" aria-hidden="true" />
    <button onClick={onToggleMode} className="absolute top-4 right-4 z-10 flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 text-[13.5px] text-ink2 hover:border-accent" aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}>{themeMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}{themeMode === "dark" ? "Light" : "Dark"}</button>
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      <section className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden border-r border-line bg-panel2">
        <div className="flex items-center gap-2.5">
          <Chakra size={40} className="text-accent" />
          <div><div className="font-bold text-[18px]"><span className="text-cyan">Skill</span>Net <span className="text-good">India</span></div><div className="text-[13px] text-muted">Jobs and skills, state by state</div></div>
        </div>
        <div className="grid grid-cols-[1fr_330px] items-center gap-6">
          <div>
            <h1 className="text-[38px] leading-[1.1] font-bold">Where India's skills<br /><span className="text-cyan">meet its jobs</span></h1>
            <p className="text-ink2 mt-4 text-[16px] max-w-[440px]">See which skills are needed where, and where to train next.</p>
            <div className="flex flex-wrap gap-2 mt-6">
              {[[fmt.compact(meta.counts.postings), "job postings analysed"], [meta.counts.skills, "skills tracked"], [fmt.compact(meta.counts.centres), "training centres mapped"], [meta.counts.districts, "districts"]].map(([v, l]) => (
                <div key={l} className="panel px-3 py-2"><div className="text-[18px] font-semibold num">{v}</div><div className="text-[12px] text-muted">{l}</div></div>
              ))}
            </div>
          </div>
          <div className="h-[380px]"><IndiaGlow geo={geo} /></div>
        </div>
        <div className="text-[13px] text-muted">For government, colleges, employers and students.</div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[440px]">
          <div className="panel p-6">
            <div role="tablist" className="flex rounded-lg bg-field border border-line p-0.5 mb-5">
              {[["signin", "Sign in"], ["signup", "Create account"]].map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setErr(""); }} className={`flex-1 py-2 rounded-md text-[14.5px] ${tab === k ? "bg-accent text-onaccent font-semibold" : "text-ink2"}`}>{l}</button>
              ))}
            </div>

            {tab === "signin" ? (
              <form onSubmit={(e) => { e.preventDefault(); run(() => signIn(email, password)); }} className="space-y-3">
                <Field label="Email"><input type="text" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" className="w-full" /></Field>
                <Field label="Password">
                  <div className="relative">
                    <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full pr-9" />
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
                        aria-pressed={form.role === k} className={`text-left rounded-xl border p-2.5 transition ${form.role === k ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-line hover:border-accent"}`}>
                        <Icon size={16} className="text-cyan mb-1" /><div className="text-[13.5px] font-semibold leading-tight">{r.label}</div>
                        <div className="text-[12px] text-muted leading-snug mt-0.5">{r.sub}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[12.5px] text-ink2 bg-panel2 border border-line rounded-lg px-3 py-2">{ROLES[form.role].can}</div>
                <Field label="Full name"><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full" /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={form.role === "student" ? "College / school (optional)" : "Organisation"}><input type="text" value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} className="w-full" /></Field>
                  <Field label="State">
                    <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full"><option value="">Select</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
                  </Field>
                </div>
                <Field label="Email"><input type="text" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" className="w-full" /></Field>
                <Field label="Password (8+ characters, letters and numbers)"><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" className="w-full" /></Field>
                {!SELF_SERVICE.includes(form.role) && (
                  <Field label="Government invite code"><input type="text" value={form.invite_code} onChange={(e) => setForm({ ...form, invite_code: e.target.value })} placeholder="Given by the administrator" className="w-full" /></Field>
                )}
                <Submit busy={busy} label="Create account" />
              </form>
            )}

            {err && <div role="alert" className="mt-3 text-[13.5px] rounded-lg border border-crit/50 bg-crit/10 text-crit px-3 py-2">{err}</div>}

            <div className="mt-5">
              <div className="eyebrow mb-2">Try a demo account</div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_USERS.map((u) => {
                  const r = ROLES[u.role], Icon = r.icon;
                  return (
                    <button key={u.email} disabled={busy} onClick={() => demo(u)} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left hover:border-accent disabled:opacity-50">
                      <Icon size={15} className="text-cyan shrink-0" /><span className="text-[13px] leading-tight">{r.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] text-muted mt-2">Demo password for all four: <code className="text-ink2">{DEMO_PASSWORD}</code></div>
            </div>
          </div>
          <div className="mt-3 text-[12.5px] text-muted flex gap-1.5">
            {mode === "server"
              ? <><ShieldCheck size={14} className="text-good shrink-0" />Secure sign-in: passwords are hashed on the server and each session is a signed token that expires in 12 hours.</>
              : mode === "demo"
                ? <><Info size={14} className="text-warn shrink-0" />Demo mode: this copy has no server, so sign-in is simulated in your browser. Don't use a real password here.</>
                : <><Loader2 size={14} className="animate-spin shrink-0" />Checking for the server…</>}
          </div>
        </div>
      </section>
    </div></div>
  );
}

const Field = ({ label, children }) => <label className="block"><span className="text-[13px] text-muted">{label}</span><div className="mt-1">{children}</div></label>;
const Submit = ({ busy, label }) => (
  <button disabled={busy} className="w-full rounded-lg bg-accent text-onaccent py-2.5 text-[14px] font-semibold flex items-center justify-center gap-2 hover:brightness-110 disabled:opacity-60">
    {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}{label}
  </button>
);
