// Colour encodings for AI outputs (dataviz reference palette, dark-mode steps).
// Sequential = one hue (blue); on the dark surface "near zero" recedes into the background,
// high values are bright. Diverging = blue (helps) ↔ red (hurts) with a neutral gray midpoint.

const BLUE_RAMP = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: number[]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}
function lerpHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}

/** Probability 0..1 → sequential blue (dark = low, light = high). */
export function seqColor(p: number): string {
  const x = Math.max(0, Math.min(1, p)) * (BLUE_RAMP.length - 1);
  const i = Math.min(BLUE_RAMP.length - 2, Math.floor(x));
  return lerpHex(BLUE_RAMP[i], BLUE_RAMP[i + 1], x - i);
}

/**
 * Landing-success encoding for maps: one hue (the GO green), so "can I land here?" reads at a
 * glance on grey terrain. Below ~30% nothing is drawn (the bare terrain means "no"); above it the
 * green gets stronger and brighter. Mirrored in the backend polar map (ai_polar.png).
 */
const LAND_STOPS: [number, [number, number, number], number][] = [
  [0.3, [6, 95, 70], 0],
  [0.5, [5, 150, 105], 0.45],
  [0.7, [16, 185, 129], 0.75],
  [0.85, [52, 211, 153], 0.88],
  [1.0, [167, 243, 208], 0.95],
];

/** Probability → { rgb, alpha } for map overlays (alpha 0 = leave the terrain as is). */
export function landColor(p: number): { rgb: [number, number, number]; a: number } {
  const x = Math.max(0, Math.min(1, p));
  if (x <= LAND_STOPS[0][0]) return { rgb: LAND_STOPS[0][1], a: 0 };
  for (let i = 0; i < LAND_STOPS.length - 1; i++) {
    const [p0, c0, a0] = LAND_STOPS[i];
    const [p1, c1, a1] = LAND_STOPS[i + 1];
    if (x <= p1) {
      const f = (x - p0) / (p1 - p0);
      return { rgb: c0.map((v, k) => v + (c1[k] - v) * f) as [number, number, number], a: a0 + (a1 - a0) * f };
    }
  }
  const last = LAND_STOPS[LAND_STOPS.length - 1];
  return { rgb: last[1], a: last[2] };
}

const PANEL_BG: [number, number, number] = [30, 41, 59];
/** Landing success as a solid colour on a dark panel (bars, heatmap cells). */
export function landSolid(p: number, bg: [number, number, number] = PANEL_BG): string {
  const { rgb, a } = landColor(p);
  return rgbToHex(rgb.map((v, i) => bg[i] + (v - bg[i]) * a));
}

/** Legend gradient for the landing map: bare terrain → bright green. */
export const LAND_GRADIENT = `linear-gradient(90deg, #64748b 0%, #64748b 28%, ${[0.4, 0.55, 0.7, 0.85, 1].map((p) => `${landSolid(p, [100, 116, 139])} ${p * 100}%`).join(", ")})`;

export const SEQ_GRADIENT = `linear-gradient(90deg, ${BLUE_RAMP.join(", ")})`;

export const DIVERGING = { pos: "#3987e5", neg: "#e66767", mid: "#383835" };

export const HEAD_META: Record<string, { label: string; short: string }> = {
  touchdown: { label: "Safe touchdown", short: "Touchdown" },
  lit0: { label: "Light at landing", short: "Light" },
  energy_ok: { label: "Power through the stay", short: "Power" },
  comms_ok: { label: "Earth link", short: "Earth link" },
};

export const pct = (p: number | undefined | null, digits = 0) => (p === undefined || p === null ? "—" : `${(p * 100).toFixed(digits)}%`);

/** Surface temperature (K) → diverging colour: cold blue, neutral grey at 0 °C, hot red. */
export function tempColor(k: number): string {
  const mid = 273.15;
  if (k <= mid) return lerpHex("#383835", DIVERGING.pos, Math.min(1, (mid - k) / (mid - 40)));
  return lerpHex("#383835", DIVERGING.neg, Math.min(1, (k - mid) / (400 - mid)));
}
