import { useEffect, useMemo, useRef, useState } from "react";
import { Map, BarChart3, TrendingUp, Building2, Target, SlidersHorizontal, GraduationCap, Bot, Database, Search, FileDown, LogOut, Lock, Sun, Moon, HelpCircle, X, Info } from "lucide-react";
import { DataCtx, loadAll } from "./data";
import { restore, signOut, authHeader } from "./auth";
import { ROLES, canOpen } from "./roles";
import { setMode, initialMode } from "./theme";
import { Chakra } from "./components/Chakra";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import SkillGap from "./pages/SkillGap";
import Demand from "./pages/Demand";
import Training from "./pages/Training";
import Priority from "./pages/Priority";
import Simulator from "./pages/Simulator";
import Career from "./pages/Career";
import Assistant from "./pages/Assistant";
import Methodology from "./pages/Methodology";
import Report from "./pages/Report";

// Plain-language page names
const NAV = [
  ["Explore", [["map", "India Skill Map", Map], ["gap", "Skill Gaps", BarChart3], ["demand", "Job Trends", TrendingUp], ["training", "Training Centres", Building2]]],
  ["Plan", [["priority", "What to Fund", Target], ["simulator", "Try a Plan", SlidersHorizontal]]],
  ["For you", [["career", "Find a Career", GraduationCap], ["assistant", "Ask SkillNet", Bot]]],
  ["About", [["method", "About the Data", Database]]],
];
const PAGES = { map: Overview, gap: SkillGap, demand: Demand, training: Training, priority: Priority, simulator: Simulator, career: Career, assistant: Assistant, method: Methodology };
const TITLES = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([id, t]) => [id, t])));

// Short "how to use this page" notes, shown only when the user presses the help button
const HELP = {
  map: ["Saffron states are short of trained workers; green states have more workers than jobs.", "Tap a state (or pick one from the list) to see its top skill needs and districts.", "Lost the map? Press the target button at the bottom right, or “Back to India”."],
  gap: ["The list shows which skills employers can't find enough people for.", "Click a skill to see what the numbers mean and what you can do next.", "Use the filters to look at one state or one sector."],
  demand: ["Pick a skill to see how many jobs asked for it and how many are expected next year.", "The shaded band is the likely range, not a guarantee.", "Lists on the right show skills that are rising or falling."],
  training: ["Dots are ITIs and polytechnics. Darker states have more training seats per person.", "Pick a state or skill to filter the centres.", "Click a district in the table to see why it needs more training."],
  priority: ["Move the sliders to say what matters most to you; the list re-ranks itself.", "Set a budget to see how many people could be trained and placed in jobs.", "Click any row to see why it ranks where it does."],
  simulator: ["Choose a state and a skill, then set how many people to train.", "The results show how much of the shortage closes and the cost per job.", "Try one of the examples at the top to get started."],
  career: ["Tell us your state, education and the skills you have.", "Pick a career from the list to see what to learn next, in order.", "The right side shows pay, where the jobs are and centres near you."],
  assistant: ["Type a question in plain words, or tap a suggestion.", "Answers come only from SkillNet's data and list their sources."],
  method: ["Where every dataset comes from, and which parts are simulated for this demo.", "How each model was tested, and its known limits."],
};

// Plain #page hashes (bookmarkable); page parameters travel in memory, not in the URL.
function useHashRoute() {
  const pageFromHash = () => { const h = window.location.hash.replace(/^#\/?/, "").split("?")[0]; return PAGES[h] ? h : "map"; };
  const [route, setRoute] = useState(() => ({ page: pageFromHash(), params: {}, n: 0 }));
  useEffect(() => {
    const f = () => setRoute((r) => (r.page === pageFromHash() ? r : { page: pageFromHash(), params: {}, n: r.n + 1 }));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  const go = (page, params = {}) => {
    setRoute((r) => ({ page, params, n: r.n + 1 }));
    if (window.location.hash !== "#" + page) window.location.hash = page;
  };
  return [route, go];
}

export default function App() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [route, go] = useHashRoute();
  const [selState, setSelState] = useState(null);
  const [report, setReport] = useState(false);
  const [session, setSession] = useState(undefined);   // undefined = checking, null = signed out
  const [notice, setNotice] = useState("");
  const [mode, setModeState] = useState(() => { const m = initialMode(); setMode(m); return m; });
  const toggleMode = () => { const m = mode === "dark" ? "light" : "dark"; setMode(m); setModeState(m); };

  useEffect(() => { loadAll().then(setData).catch((e) => setErr(String(e))); }, []);
  useEffect(() => { restore().then(setSession).catch(() => setSession(null)); }, []);
  useEffect(() => { if (route.params.state) setSelState(route.params.state); }, [route.params.state]);
  useEffect(() => { document.title = `${TITLES[route.page]} · SkillNet India`; }, [route.page]);
  const user = session?.user;
  // authorisation in the UI: a page the role can't open sends the user to their home page
  useEffect(() => {
    if (user && !canOpen(user, route.page)) {
      setNotice(`${TITLES[route.page]} isn't available for the ${user.role_label} role.`);
      go(ROLES[user.role].home);
    }
  }, [user, route.page]);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(t); } }, [notice]);

  if (err) return <div className="p-10 text-crit">Could not load data: {err}</div>;
  if (!data || session === undefined) return <Loading />;
  if (!session) {
    const stateNames = data.states.map((s) => s.state).sort();
    return <Login meta={{ ...data.meta, __states: stateNames }} geo={data.geo_states} mode={mode} onToggleMode={toggleMode}
      onSession={(s) => { setSession(s); go(ROLES[s.user.role].home); }} />;
  }
  if (!canOpen(user, route.page)) return <Loading />;
  const Page = PAGES[route.page];
  const logout = () => { signOut(); setSession(null); };
  const ctx = { ...data, go, selState, setSelState, params: route.params, session, user, authHeaders: authHeader(session), can: (pg) => canOpen(user, pg), mode };

  return (
    <DataCtx.Provider value={ctx}>
      <a href="#main" className="skip-link no-print">Skip to main content</a>
      <div className="flex flex-col h-full no-print">
        <div className="tricolour shrink-0" aria-hidden="true" />
        <div className="flex flex-1 min-h-0">
          <Sidebar page={route.page} go={go} user={user} />
          <main className="flex-1 min-w-0 flex flex-col">
            <TopBar title={TITLES[route.page]} page={route.page} go={go} onReport={() => setReport(true)} user={user} onLogout={logout} mode={mode} onToggleMode={toggleMode} />
            {notice && <div role="status" className="mx-4 mt-3 rounded-lg border border-warn/40 bg-warn/10 text-warn px-3 py-2 text-[13.5px] flex items-center gap-2"><Lock size={13} />{notice}</div>}
            <div id="main" tabIndex={-1} className="flex-1 min-h-0 overflow-auto outline-none"><Page key={route.page + route.n} /></div>
          </main>
        </div>
      </div>
      {report && <ReportModal state={selState} onClose={() => setReport(false)} />}
      <div className="print-only"><Report state={selState} /></div>
    </DataCtx.Provider>
  );
}

function Loading() {
  return (
    <div className="h-full grid place-items-center" role="status">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12 rounded-full bg-accent/30 pulse" />
        <div className="text-ink2 text-sm">Loading SkillNet India…</div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <Chakra className="text-accent shrink-0" />
      <div className="leading-tight">
        <div className="font-bold text-[16px]"><span className="text-cyan">Skill</span><span className="text-ink">Net</span> <span className="text-good">India</span></div>
        <div className="text-[12px] text-muted">Skills and jobs by state</div>
      </div>
    </div>
  );
}

function Sidebar({ page, go, user }) {
  return (
    <aside className="w-[236px] shrink-0 border-r border-line bg-side flex flex-col">
      <Logo />
      <nav aria-label="Main" className="flex-1 overflow-auto px-2.5 pb-4">
        {NAV.map(([section, all]) => [section, all.filter(([id]) => canOpen(user, id))]).filter(([, items]) => items.length).map(([section, items]) => (
          <div key={section} className="mt-3">
            <div className="eyebrow px-2 mb-1.5">{section}</div>
            {items.map(([id, label, Icon]) => (
              <button key={id} onClick={() => go(id)} aria-current={page === id ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[14.5px] mb-0.5 transition ${page === id ? "bg-accent text-onaccent font-semibold" : "text-ink2 hover:bg-panel2 hover:text-ink"}`}>
                <Icon size={18} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <button onClick={() => go("method")} className="m-2.5 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12.5px] text-muted text-left flex items-center gap-1.5 hover:text-ink">
        <Info size={14} className="text-warn shrink-0" />Demo data: some figures are simulated
      </button>
    </aside>
  );
}

function UserChip({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const R = ROLES[user.role], Icon = R.icon;
  const initials = user.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-line pl-1.5 pr-3 py-1.5 hover:border-accent" aria-label={`Account: ${user.name}`}>
        <span className="w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold bg-accent text-onaccent">{initials}</span>
        <span className="text-left leading-tight hidden xl:block"><span className="block text-[13.5px] text-ink max-w-[140px] truncate">{user.name}</span><span className="block text-[12px] text-cyan">{R.label}</span></span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-[260px] glass p-3 z-50">
          <div className="text-[14px] font-semibold">{user.name}</div>
          <div className="text-[12.5px] text-muted truncate">{user.email}</div>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-cyan"><Icon size={14} />{R.label}</div>
          <div className="text-[12px] text-muted mt-1">{R.can}</div>
          <button onClick={onLogout} className="mt-3 w-full flex items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[13.5px] hover:border-crit hover:text-crit"><LogOut size={14} />Sign out</button>
        </div>
      )}
    </div>
  );
}

function ReportModal({ state, onClose }) {
  const [msg, setMsg] = useState("");
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const copy = async () => {
    const el = document.getElementById("report-body");
    try { await navigator.clipboard.writeText(el.innerText); setMsg("Copied"); } catch { setMsg("Copy blocked here: select the text and copy"); }
  };
  const print = () => { try { window.print(); } catch { setMsg("Printing isn't available in this view"); } };
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 grid place-items-center p-6 no-print" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Report" className="bg-white text-black rounded-xl max-w-[860px] w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="tricolour" />
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b sticky top-0 bg-white">
          <b>{state ? `${state} report` : "All India report"}</b>
          <div className="flex gap-2 items-center text-[14px]">
            <span className="text-gray-600" role="status">{msg}</span>
            <button onClick={copy} className="rounded-lg border px-3 py-1.5">Copy text</button>
            <button onClick={print} className="rounded-lg border px-3 py-1.5">Print / save PDF</button>
            <button ref={closeRef} onClick={onClose} className="rounded-lg bg-[#0b2a6b] text-white px-3 py-1.5">Close</button>
          </div>
        </div>
        <div id="report-body"><Report state={state} /></div>
      </div>
    </div>
  );
}

function HelpPopover({ page, onClose }) {
  const items = HELP[page] || [];
  return (
    <div className="absolute right-0 top-full mt-2 w-[340px] glass p-4 z-50" role="dialog" aria-label="How to use this page">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-[14px] flex items-center gap-1.5"><HelpCircle size={16} className="text-cyan" />How to use this page</div>
        <button onClick={onClose} aria-label="Close help" className="text-muted hover:text-ink"><X size={16} /></button>
      </div>
      <ol className="space-y-2 text-[14px] text-ink2 list-decimal pl-5">{items.map((t) => <li key={t}>{t}</li>)}</ol>
    </div>
  );
}

function TopBar({ title, page, go, onReport, user, onLogout, mode, onToggleMode }) {
  const { states, skillsList, roles, setSelState } = useContextData();
  const [q, setQ] = useState("");
  const [help, setHelp] = useState(false);
  useEffect(() => setHelp(false), [page]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const s = states.filter((x) => x.state.toLowerCase().includes(t)).slice(0, 4).map((x) => ({ k: "State", label: x.state, act: () => { setSelState(x.state); go("map", { state: x.state }); } }));
    const skillPage = canOpen(user, "gap") ? "gap" : "demand";
    const k = skillsList.filter((x) => x.name.toLowerCase().includes(t)).slice(0, 4).map((x) => ({ k: "Skill", label: x.name, act: () => go(skillPage, { skill: x.name }) }));
    const r = canOpen(user, "career") ? roles.filter((x) => x.title.toLowerCase().includes(t)).slice(0, 3).map((x) => ({ k: "Career", label: x.title, act: () => go("career", { role: x.role }) })) : [];
    return [...s, ...k, ...r];
  }, [q, states, skillsList, roles]);
  const iconBtn = "flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[13.5px] text-ink2 hover:text-ink hover:border-accent";
  return (
    <header className="h-[62px] shrink-0 border-b border-line flex items-center gap-3 px-5 bg-panel">
      <h1 className="text-[18px] font-semibold whitespace-nowrap">{title}</h1>
      <div className="relative">
        <button onClick={() => setHelp(!help)} aria-expanded={help} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] text-cyan border border-line hover:border-accent">
          <HelpCircle size={15} />How to use
        </button>
        {help && <HelpPopover page={page} onClose={() => setHelp(false)} />}
      </div>
      <div className="relative flex-1 max-w-[460px] mx-auto">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-field px-3 py-2">
          <Search size={16} className="text-muted" aria-hidden="true" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a state, skill or career" aria-label="Search a state, skill or career"
            className="!border-0 !p-0 !bg-transparent !shadow-none !min-h-0 flex-1 text-[14px]" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-50 mt-1 w-full glass p-1" role="listbox">
            {hits.map((h, i) => (
              <button key={i} role="option" onClick={() => { h.act(); setQ(""); }} className="w-full flex justify-between px-3 py-1.5 rounded-md text-[14px] hover:bg-accent/15">
                <span>{h.label}</span><span className="text-muted text-[12px]">{h.k}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onToggleMode} className={iconBtn} aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} title={`Switch to ${mode === "dark" ? "light" : "dark"} mode`}>
        {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span className="hidden 2xl:inline">{mode === "dark" ? "Light" : "Dark"}</span>
      </button>
      <button onClick={onReport} className={iconBtn}><FileDown size={16} />Report</button>
      <UserChip user={user} onLogout={onLogout} />
    </header>
  );
}

import { useData as useContextData } from "./data";
