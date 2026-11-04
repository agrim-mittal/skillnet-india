// Sign-in for SkillNet.
// Server mode (Render/Docker): the FastAPI backend checks passwords (PBKDF2) and issues signed JWTs; every API call sends the token.
// Demo mode (static hosting with no backend, e.g. the claude.ai preview or GitHub Pages): sign-in is simulated in the browser,
// so the dashboard can still be shown. It protects nothing and the login page says so.
import { createContext, useContext } from "react";
import { apiBase, detectBackend } from "./data";
import { DEMO_PASSWORD, DEMO_USERS, ROLES, SELF_SERVICE } from "./roles";

const KEY = "skillnet.session";
const DEMO_DB = "skillnet.demoUsers";
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: session lasts for this tab */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

let mode = null;   // "server" | "demo"
export async function authMode() {
  if (mode) return mode;
  const h = await detectBackend();
  mode = h?.auth === "jwt" ? "server" : "demo";
  return mode;
}

const decorate = (u) => ({ ...u, role_label: ROLES[u.role]?.label, pages: ROLES[u.role]?.pages || [] });

async function post(path, body) {
  const r = await fetch(`${apiBase}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = j.detail;
    throw new Error(Array.isArray(d) ? d.map((x) => `${x.loc?.at(-1)}: ${x.msg}`).join("; ") : d || `Request failed (${r.status})`);
  }
  return j;
}

async function sha(text) {
  try {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch { return text; }
}

export async function signIn(email, password) {
  const m = await authMode();
  email = email.trim().toLowerCase();
  let session;
  if (m === "server") {
    const j = await post("/api/auth/login", { email, password });
    session = { token: j.token, user: decorate(j.user), mode: m };
  } else {
    const demo = DEMO_USERS.find((u) => u.email === email);
    const local = (store.get(DEMO_DB) || []).find((u) => u.email === email);
    if (demo && password === DEMO_PASSWORD) session = { token: null, user: decorate(demo), mode: m };
    else if (local && local.hash === (await sha(password))) session = { token: null, user: decorate(local), mode: m };
    else throw new Error("Wrong email or password.");
  }
  store.set(KEY, session);
  return session;
}

export async function signUp(form) {
  const m = await authMode();
  const email = form.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) throw new Error("Password needs at least 8 characters with letters and numbers.");
  let session;
  if (m === "server") {
    const j = await post("/api/auth/register", { ...form, email });
    session = { token: j.token, user: decorate(j.user), mode: m };
  } else {
    if (!SELF_SERVICE.includes(form.role)) throw new Error("Government accounts need an invite code from the administrator (server mode). Use the Government demo account instead.");
    const users = store.get(DEMO_DB) || [];
    if (users.find((u) => u.email === email) || DEMO_USERS.find((u) => u.email === email)) throw new Error("An account with this email already exists. Sign in instead.");
    const u = { name: form.name.trim(), email, role: form.role, organisation: form.organisation, state: form.state, hash: await sha(form.password) };
    store.set(DEMO_DB, [...users, u]);
    session = { token: null, user: decorate(u), mode: m };
  }
  store.set(KEY, session);
  return session;
}

export async function restore() {
  const s = store.get(KEY);
  if (!s?.user) return null;
  const m = await authMode();
  if (m !== s.mode) { store.del(KEY); return null; }
  if (m === "server") {
    try {
      const r = await fetch(`${apiBase}/api/auth/me`, { headers: { authorization: `Bearer ${s.token}` } });
      if (!r.ok) { store.del(KEY); return null; }
      return { ...s, user: decorate(await r.json()) };
    } catch { return s; }
  }
  return s;
}

export function signOut() { store.del(KEY); }

export const authHeader = (session) => (session?.token ? { authorization: `Bearer ${session.token}` } : {});
