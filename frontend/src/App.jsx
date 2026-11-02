import { useEffect, useMemo, useState } from "react";
import { Map, BarChart3, TrendingUp, Building2, Target, SlidersHorizontal, GraduationCap, Bot, Database, Search, FileDown, Radar } from "lucide-react";
import { DataCtx, loadAll } from "./data";
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

const NAV = [
  ["OVERVIEW", [["map", "India Skill Map", Map]]],
  ["SKILL INTELLIGENCE", [["gap", "Skill Gap Analysis", BarChart3], ["demand", "Demand & Forecasts", TrendingUp], ["training", "Training Infrastructure", Building2]]],
  ["DECISION INTELLIGENCE", [["priority", "Priority Recommendations", Target], ["simulator", "What-If Simulator", SlidersHorizontal]]],
  ["USER SERVICES", [["career", "Student Career Path", GraduationCap], ["assistant", "AI Skill Assistant", Bot]]],
  ["OTHERS", [["method", "Data & Methodology", Database]]],
];
const PAGES = { map: Overview, gap: SkillGap, demand: Demand, training: Training, priority: Priority, simulator: Simulator, career: Career, assistant: Assistant, method: Methodology };
const TITLES = Object.fromEntries(NAV.flatMap(([, items]) => items.map(([id, t]) => [id, t])));

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

  useEffect(() => { loadAll().then(setData).catch((e) => setErr(String(e))); }, []);
  useEffect(() => { if (route.params.state) setSelState(route.params.state); }, [route.params.state]);

  if (err) return <div className="p-10 text-crit">Could not load data: {err}</div>;
  if (!data) return <Loading />;
  const Page = PAGES[route.page];
  const ctx = { ...data, go, selState, setSelState, params: route.params };

  return (
    <DataCtx.Provider value={ctx}>
      <div className="flex h-full no-print">
        <Sidebar page={route.page} go={go} />
        <main className="flex-1 min-w-0 flex flex-col">
          <TopBar title={TITLES[route.page]} go={go} onReport={() => setReport(true)} />
          <div className="flex-1 min-h-0 overflow-auto"><Page key={route.page + route.n} /></div>
        </main>
      </div>
      {report && <ReportModal state={selState} onClose={() => setReport(false)} />}
      <div className="print-only"><Report state={selState} /></div>
    </DataCtx.Provider>
  );
}

function Loading() {
  return (
    <div className="h-full grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12 rounded-full bg-accent/30 pulse" />
        <div className="text-ink2 text-sm">Loading national skill intelligence…</div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-4">
      <div className="relative w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-violet shadow-[0_0_24px_#3987e566]">
        <Radar size={19} className="text-white" />
      </div>
      <div className="leading-tight">
        <div className="font-bold tracking-wide text-[15px]">SkillNet <span className="text-cyan">India</span></div>
        <div className="text-[10.5px] text-muted">National Skill Intelligence</div>
      </div>
    </div>
  );
}

function Sidebar({ page, go }) {
  return (
    <aside className="w-[244px] shrink-0 border-r border-line bg-[#070c1b]/90 flex flex-col">
      <Logo />
      <nav className="flex-1 overflow-auto px-2.5 pb-4">
        {NAV.map(([section, items]) => (
          <div key={section} className="mt-3">
            <div className="eyebrow px-2 mb-1.5 text-[9.5px]">{section}</div>
            {items.map(([id, label, Icon]) => (
              <button key={id} onClick={() => go(id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] mb-0.5 transition ${page === id ? "bg-accent text-white shadow-[0_0_20px_#3987e555]" : "text-ink2 hover:bg-white/5 hover:text-ink"}`}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="p-3 m-2.5 rounded-xl border border-line bg-panel text-[11px] text-muted leading-relaxed">
        <div className="text-ink2 font-semibold mb-1">Demo dataset</div>
        Real 2025 job postings + Census + boundaries; workforce, multi-sector postings & ITIs are synthetic. <button className="text-cyan" onClick={() => go("method")}>Details →</button>
      </div>
    </aside>
  );
}

function ReportModal({ state, onClose }) {
  const [msg, setMsg] = useState("");
  const copy = async () => {
    const el = document.getElementById("report-body");
    try { await navigator.clipboard.writeText(el.innerText); setMsg("Copied to clipboard"); } catch { setMsg("Copy blocked here: select the text and copy"); }
  };
  const print = () => { try { window.print(); } catch { setMsg("Printing isn't available in this view"); } };
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 grid place-items-center p-6 no-print" onClick={onClose}>
      <div className="bg-white text-black rounded-xl max-w-[860px] w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-b sticky top-0 bg-white">
          <b>{state ? `${state} brief` : "All India brief"}</b>
          <div className="flex gap-2 items-center text-[13px]">
            <span className="text-gray-500">{msg}</span>
            <button onClick={copy} className="rounded-lg border px-3 py-1.5">Copy text</button>
            <button onClick={print} className="rounded-lg border px-3 py-1.5">Print / save PDF</button>
            <button onClick={onClose} className="rounded-lg bg-black text-white px-3 py-1.5">Close</button>
          </div>
        </div>
        <div id="report-body"><Report state={state} /></div>
      </div>
    </div>
  );
}

function TopBar({ title, go, onReport }) {
  const { states, skillsList, roles, setSelState } = useContextData();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const s = states.filter((x) => x.state.toLowerCase().includes(t)).slice(0, 4).map((x) => ({ k: "State", label: x.state, act: () => { setSelState(x.state); go("map", { state: x.state }); } }));
    const k = skillsList.filter((x) => x.name.toLowerCase().includes(t)).slice(0, 4).map((x) => ({ k: "Skill", label: x.name, act: () => go("gap", { skill: x.name }) }));
    const r = roles.filter((x) => x.title.toLowerCase().includes(t)).slice(0, 3).map((x) => ({ k: "Career", label: x.title, act: () => go("career", { role: x.role }) }));
    return [...s, ...k, ...r];
  }, [q, states, skillsList, roles]);
  return (
    <header className="h-[60px] shrink-0 border-b border-line flex items-center gap-4 px-5 bg-[#070c1b]/70 backdrop-blur">
      <h1 className="text-[16px] font-semibold whitespace-nowrap">{title}</h1>
      <div className="relative flex-1 max-w-[520px] mx-auto">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-[#0a1122] px-3 py-2">
          <Search size={15} className="text-muted" />
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a state, skill or career…"
            className="!border-0 !p-0 !bg-transparent !shadow-none flex-1 text-[13px]" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-50 mt-1 w-full glass p-1">
            {hits.map((h, i) => (
              <button key={i} onClick={() => { h.act(); setQ(""); }} className="w-full flex justify-between px-3 py-1.5 rounded-md text-[13px] hover:bg-accent/20">
                <span>{h.label}</span><span className="text-muted text-[11px]">{h.k}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onReport} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[12.5px] text-ink2 hover:text-ink hover:border-accent">
        <FileDown size={15} />Export report
      </button>
    </header>
  );
}

import { useData as useContextData } from "./data";
