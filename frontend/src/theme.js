// India theme colours for JS-drawn graphics (map fills, charts). CSS colours live in index.css.
// Palettes are mutated in place by setMode(), so every import sees the current mode after a re-render.
// Meaning is the same in both modes: saffron = shortage / more needed, green = surplus / enough, navy = neutral data.

const PAL = {
  light: {
    series: ["#0b3d91", "#d9700f", "#138808", "#a87400", "#c2185b", "#2e7d32", "#5b46c2", "#c73a3a"],
    status: { good: "#13790a", warning: "#a15c00", serious: "#c2410c", critical: "#b42318" },
    ink: { primary: "#1c2140", secondary: "#3e4566", muted: "#61667d", grid: "#ece5d6", axis: "#d9cfbb" },
    // [strongest .. weakest] surplus (green) | neutral | [weakest .. strongest] shortage (saffron)
    div: { neg: ["#0b6e2e", "#2e9e4f", "#74c27f", "#b9e0b5"], mid: "#ece5d6", pos: ["#ffd3a3", "#ffa552", "#ec7a12", "#a8420a"] },
    blue: ["#e8eef8", "#c3d3ee", "#8faedd", "#5a86c8", "#2f5fa8", "#0b3d91"],
    aqua: ["#fff1df", "#ffd9ab", "#ffbb70", "#f79533", "#d0690c", "#8f4204"],
    violet: ["#f0eefb", "#d6d1f4", "#b1a8ea", "#8678da", "#5e4dc2", "#3f2f99"],
    c: {
      empty: "#ece6da", none: "#f3eee4", highlight: "#b45309", forecast: "#d9700f", actual: "#0b3d91", track: "#ece5d6",
      baseline: "#8a8fa3", ref: "#b9b0a0", stateLine: "#ffffff", stateHover: "#0b2a6b", sel: "#0b2a6b", distLine: "#ffffff", ptStroke: "#ffffff",
      outlineFill: "#ff9933", outlineFill2: "#138808", outlineStroke: "#0b2a6b",
    },
  },
  dark: {
    series: ["#6c9bea", "#ff9933", "#3cc24a", "#e0b020", "#e86a9a", "#5ccb5f", "#9d8cf0", "#f07070"],
    status: { good: "#5fd16a", warning: "#f2c14e", serious: "#f59a5a", critical: "#f27b6b" },
    ink: { primary: "#eef1f8", secondary: "#c6cce0", muted: "#9aa4c0", grid: "#1d2850", axis: "#2b3866" },
    div: { neg: ["#7be08c", "#3cb95a", "#1f8a3e", "#17552b"], mid: "#2a3354", pos: ["#7a4a1f", "#b8661c", "#f08a24", "#ffbd7a"] },
    blue: ["#16214a", "#1e3770", "#28529c", "#3a70c2", "#6c97da", "#a9c4ee"],
    aqua: ["#24190e", "#43290f", "#704012", "#ad5c17", "#ec8424", "#ffc27f"],
    violet: ["#1b1838", "#2f2a66", "#4b3fa3", "#6a5fd0", "#9085e9", "#c4bdf6"],
    c: {
      empty: "#1a2242", none: "#141c38", highlight: "#ffb366", forecast: "#ff9933", actual: "#8fb4f0", track: "#24315c",
      baseline: "#8a93b0", ref: "#3b4a7a", stateLine: "#0a1128", stateHover: "#ffb366", sel: "#ff9933", distLine: "#0a1128", ptStroke: "#0a1128",
      outlineFill: "#ff9933", outlineFill2: "#1fa31a", outlineStroke: "#eef1f8",
    },
  },
};

export const SERIES = [...PAL.light.series];
export const STATUS = { ...PAL.light.status };
export const INK = { ...PAL.light.ink };
export const DIVERGING = { neg: [...PAL.light.div.neg], mid: PAL.light.div.mid, pos: [...PAL.light.div.pos] };
export const SEQ_BLUE = [...PAL.light.blue];
export const SEQ_AQUA = [...PAL.light.aqua];
export const SEQ_VIOLET = [...PAL.light.violet];
export const C = { ...PAL.light.c };
export let MODE = "light";

const fill = (arr, src) => arr.splice(0, arr.length, ...src);
export function setMode(m) {
  MODE = m === "dark" ? "dark" : "light";
  const p = PAL[MODE];
  fill(SERIES, p.series); Object.assign(STATUS, p.status); Object.assign(INK, p.ink);
  fill(DIVERGING.neg, p.div.neg); fill(DIVERGING.pos, p.div.pos); DIVERGING.mid = p.div.mid;
  fill(SEQ_BLUE, p.blue); fill(SEQ_AQUA, p.aqua); fill(SEQ_VIOLET, p.violet); Object.assign(C, p.c);
  if (typeof document !== "undefined") document.documentElement.dataset.theme = MODE;
  try { localStorage.setItem("skillnet-theme", MODE); } catch { /* storage blocked */ }
}
export function initialMode() {
  try { const s = localStorage.getItem("skillnet-theme"); if (s === "light" || s === "dark") return s; } catch { /* storage blocked */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export const CLUSTER_ORDER = ["SW", "DA", "CY", "EL", "GE", "MF", "CO", "HC", "LR", "BF", "SM", "AG", "HT", "TX"];

export function sgiColor(v) {
  if (v == null || isNaN(v)) return C.empty;
  const a = Math.abs(v);
  if (a < 5) return DIVERGING.mid;
  const i = a < 20 ? 0 : a < 40 ? 1 : a < 65 ? 2 : 3;
  return v > 0 ? DIVERGING.pos[i] : DIVERGING.neg[3 - i];
}
// text colour that stays readable on top of sgiColor(v)
export function sgiInk(v) {
  const a = Math.abs(v ?? 0);
  if (MODE === "light") return a >= 40 ? "#ffffff" : "#1c2140";
  return v > 0 ? (a >= 40 ? "#1f1200" : "#ffe9d2") : a >= 40 ? "#06210c" : "#e2f6e4";
}

export function seqColor(t, ramp = SEQ_BLUE) {
  if (t == null || isNaN(t)) return C.empty;
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)));
  return ramp[i];
}

// Plain-language words for a gap score
export function gapWord(v) {
  if (v == null || isNaN(v)) return "No data";
  if (v >= 40) return "Big shortage";
  if (v >= 5) return "Shortage";
  if (v > -5) return "Balanced";
  if (v > -40) return "Extra workers";
  return "Many extra workers";
}

export const fmt = {
  int: (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-IN")),
  compact: (n) => {
    if (n == null || isNaN(n)) return "–";
    const a = Math.abs(n);
    if (a >= 1e7) return (n / 1e7).toFixed(a >= 1e8 ? 0 : 1) + " Cr";
    if (a >= 1e5) return (n / 1e5).toFixed(a >= 1e6 ? 0 : 1) + " L";
    if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
    return Math.round(n).toString();
  },
  pct: (n, d = 0) => (n == null || isNaN(n) ? "–" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`),
  sgi: (n) => (n == null ? "–" : `${n > 0 ? "+" : ""}${Math.round(n)}`),
  inr: (n) => {
    if (n == null) return "–";
    if (Math.abs(n) >= 1e7) return "₹" + (n / 1e7).toFixed(n >= 1e9 ? 0 : 1) + " Cr";
    if (Math.abs(n) >= 1e5) return "₹" + (n / 1e5).toFixed(1) + " L";
    return "₹" + Math.round(n).toLocaleString("en-IN");
  },
};
