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

export const SEQ_GRADIENT = `linear-gradient(90deg, ${BLUE_RAMP.join(", ")})`;

export const DIVERGING = { pos: "#3987e5", neg: "#e66767", mid: "#383835" };

export const HEAD_META: Record<string, { label: string; short: string }> = {
  touchdown: { label: "Safe touchdown", short: "Touchdown" },
  lit0: { label: "Light at landing", short: "Light" },
  energy_ok: { label: "Power through the stay", short: "Power" },
  comms_ok: { label: "Earth link", short: "Earth link" },
};

export const pct = (p: number | undefined | null, digits = 0) => (p === undefined || p === null ? "—" : `${(p * 100).toFixed(digits)}%`);
