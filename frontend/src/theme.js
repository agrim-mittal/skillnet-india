// Colour roles (validated: dark categorical slots on #0c1326 pass lightness, chroma, CVD and contrast checks)
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };
export const INK = { primary: "#eef1f8", secondary: "#b4bdd3", muted: "#7d88a3", grid: "#1b2440", axis: "#2b3655" };

// Diverging (Skill Gap Index): surplus (blue) <- neutral -> shortage (red); brighter = larger magnitude on dark surface
export const DIVERGING = {
  neg: ["#86b6ef", "#3987e5", "#256abf", "#1c4a86"],
  mid: "#343a48",
  pos: ["#7a2d34", "#b63b3f", "#e05a57", "#f39b93"],
};
// Sequential (magnitude) - blue, near-surface -> bright
export const SEQ_BLUE = ["#13213d", "#173a6e", "#1c5cab", "#2a78d6", "#5598e7", "#9ec5f4"];
// Demand magnitude (aqua) - distinct from the diverging blue/red so state gap + district demand can share a screen
export const SEQ_AQUA = ["#0e2427", "#0f3f3c", "#126358", "#199e70", "#3cc28f", "#8be0bd"];
// Second sequential context (growth) takes the next slot's hue family (violet)
export const SEQ_VIOLET = ["#1b1838", "#2f2a66", "#4b3fa3", "#6a5fd0", "#9085e9", "#c4bdf6"];

export const CLUSTER_ORDER = ["SW", "DA", "CY", "EL", "GE", "MF", "CO", "HC", "LR", "BF", "SM", "AG", "HT", "TX"];

export function sgiColor(v) {
  if (v == null || isNaN(v)) return "#1a2035";
  const a = Math.abs(v);
  if (a < 5) return DIVERGING.mid;
  const i = a < 20 ? 0 : a < 40 ? 1 : a < 65 ? 2 : 3;
  return v > 0 ? DIVERGING.pos[i] : DIVERGING.neg[3 - i];
}
export const SGI_STOPS = [
  [-100, DIVERGING.neg[0]], [-65, DIVERGING.neg[1]], [-40, DIVERGING.neg[2]], [-20, DIVERGING.neg[3]],
  [-5, DIVERGING.mid], [5, DIVERGING.mid], [20, DIVERGING.pos[0]], [40, DIVERGING.pos[1]], [65, DIVERGING.pos[2]], [100, DIVERGING.pos[3]],
];

export function seqColor(t, ramp = SEQ_BLUE) {
  if (t == null || isNaN(t)) return "#141b30";
  const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(t * ramp.length)));
  return ramp[i];
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
