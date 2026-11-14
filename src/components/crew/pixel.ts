/**
 * Pixel-art mission control on the Moon: a cut-away habitat at the south pole with seven astronaut
 * agents at their consoles. Everything is drawn in code on a 320x180 canvas (no image assets),
 * then scaled up with nearest-neighbour filtering.
 */

import type { AgentId } from "@/lib/agents";

export const W = 320;
export const H = 180;
export const FLOOR = 163; // feet line inside the habitat

/** Console positions (x of the console centre). Chief stands at the holo table in the middle. */
export const DESK: Record<AgentId, number> = { scout: 38, terrain: 82, power: 126, chief: 160, comms: 196, timing: 240, safety: 284 };
/** Where each agent stands while working (left of the console, facing it). */
export const HOME: Record<AgentId, number> = { scout: 26, terrain: 70, power: 114, chief: 160, comms: 184, timing: 228, safety: 272 };
export const TABLE_X = 160;

// ---------------------------------------------------------------- sprites
// 11 x 15 astronaut, facing right. Legend:
//  . clear  W suit  S suit shade  V visor  G visor glare  B backpack  C role colour  K boot  H hand
const BODY = [
  "...WWWWW...",
  "..WWWWWWW..",
  "..WWWVVVV..",
  "..WWVVGGV..",
  "..WWWVVVV..",
  "...WWWWW...",
  ".BBWWCCWW..",
  ".BBWWCCWWW.",
  ".BBWWWWWWW.",
  ".BBSWWWWS..",
  "...SWWWWS..",
];
const LEGS: Record<string, string[]> = {
  stand: ["...WW.WW...", "...WW.WW...", "...SS.SS...", "..KKK.KKK.."],
  walk1: ["...WW..WW..", "..WW....WW.", "..SS....SS.", ".KKK....KKK"],
  walk2: ["....WWW....", "....WWW....", "....SSS....", "...KKKK...."],
};
// arm variants replace rows 7-8 (index 7,8)
const ARMS: Record<string, [string, string]> = {
  rest: [".BBWWWWWWW.", ".BBSWWWWS.."],
  type1: [".BBWWWWWWHH", ".BBSWWWWS.."],
  type2: [".BBWWWWWWW.", ".BBSWWWWSHH"],
  cheer: [".BBWWWWWWWH", ".BBSWWWWS.H"],
};

export type Pose = "stand" | "walk1" | "walk2" | "type1" | "type2" | "cheer";

const PAL: Record<string, string> = { W: "#eef2f7", S: "#a9b4c4", V: "#1e2a44", G: "#8fd3ff", B: "#7c8798", K: "#3b4252", H: "#d7dde6" };

function rows(pose: Pose): string[] {
  const body = BODY.slice();
  const arms = pose === "type1" ? ARMS.type1 : pose === "type2" ? ARMS.type2 : pose === "cheer" ? ARMS.cheer : ARMS.rest;
  body[7] = arms[0];
  body[8] = arms[1];
  const legs = pose === "walk1" ? LEGS.walk1 : pose === "walk2" ? LEGS.walk2 : LEGS.stand;
  return [...body, ...legs];
}

/** Draw an astronaut with feet at (x, y). facing 1 = right, -1 = left. */
export function drawAstronaut(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, pose: Pose, facing: 1 | -1, chief = false) {
  const r = rows(pose);
  const h = r.length;
  const w = r[0].length;
  const ox = Math.round(x - w / 2);
  const oy = Math.round(y - h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ch = r[j][facing === 1 ? i : w - 1 - i];
      if (ch === ".") continue;
      ctx.fillStyle = ch === "C" ? color : PAL[ch];
      ctx.fillRect(ox + i, oy + j, 1, 1);
    }
  }
  // helmet stripe in the role colour; the Flight Director also gets an antenna with a beacon
  ctx.fillStyle = color;
  ctx.fillRect(ox + (facing === 1 ? 3 : w - 6), oy + 1, 3, 1);
  if (chief) {
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(ox + (facing === 1 ? 3 : w - 4), oy - 3, 1, 3);
    ctx.fillStyle = color;
    ctx.fillRect(ox + (facing === 1 ? 2 : w - 5), oy - 4, 3, 1);
  }
}

// ---------------------------------------------------------------- static background
function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function disk(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}

export function drawBackground(ctx: CanvasRenderingContext2D) {
  const rnd = rand(7);
  // sky: the lunar sky is black even in daylight
  ctx.fillStyle = "#03040a";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 110; i++) {
    const b = rnd();
    ctx.fillStyle = b > 0.85 ? "#ffffff" : b > 0.5 ? "#8b93a7" : "#3d4456";
    ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * 70), 1, 1);
  }
  // the Sun, low on the horizon as always at the pole
  disk(ctx, 22, 58, 9, "rgba(253,224,71,0.10)");
  disk(ctx, 22, 58, 6, "rgba(253,224,71,0.25)");
  disk(ctx, 22, 58, 4, "#fff7c2");
  // Earth hangs low over the horizon too
  disk(ctx, 292, 26, 10, "#1d4ed8");
  ctx.fillStyle = "#22c55e";
  [[287, 21, 4, 2], [289, 23, 3, 3], [295, 28, 4, 3], [294, 31, 2, 2], [286, 29, 2, 1]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
  ctx.fillStyle = "#e0f2fe";
  [[290, 17, 4, 1], [297, 22, 3, 1], [284, 26, 2, 1]].forEach(([x, y, w, h]) => ctx.fillRect(x, y, w, h));
  // night side of Earth (Sun is to the left)
  ctx.fillStyle = "rgba(2,6,23,0.55)";
  for (let y = -10; y <= 10; y++) {
    const half = Math.floor(Math.sqrt(100 - y * y));
    ctx.fillRect(292 + Math.floor(half * 0.25), 26 + y, half - Math.floor(half * 0.25) + 1, 1);
  }
  // far crater rims and massifs
  ctx.fillStyle = "#3a3f4b";
  for (let x = 0; x < W; x++) {
    const h = 66 + Math.round(5 * Math.sin(x / 23) + 3 * Math.sin(x / 7.3 + 1) + 2 * Math.sin(x / 3.1));
    ctx.fillRect(x, h, 1, 90 - h);
  }
  ctx.fillStyle = "#575d6b";
  for (let x = 0; x < W; x++) {
    const h = 76 + Math.round(4 * Math.sin(x / 31 + 2) + 2 * Math.sin(x / 9 + 0.5));
    ctx.fillRect(x, h, 1, 92 - h);
  }
  // regolith
  ctx.fillStyle = "#7b8190";
  ctx.fillRect(0, 88, W, H - 88);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd() > 0.5 ? "#6c7280" : "#8a909e";
    ctx.fillRect(Math.floor(rnd() * W), 88 + Math.floor(rnd() * (H - 88)), 1 + Math.floor(rnd() * 2), 1);
  }
  // sunlit edge on the left of every rock: the Sun is that low
  // habitat shell
  ctx.fillStyle = "#c7ccd6";
  ctx.fillRect(8, 98, 304, 74);
  ctx.fillRect(12, 94, 296, 4);
  ctx.fillRect(18, 91, 284, 3);
  ctx.fillStyle = "#9aa1ae";
  ctx.fillRect(8, 170, 304, 2);
  // interior
  ctx.fillStyle = "#1b2233";
  ctx.fillRect(13, 101, 294, 62);
  ctx.fillStyle = "#222b40";
  for (let x = 13; x < 307; x += 22) ctx.fillRect(x, 101, 1, 62);
  // windows onto the surface
  for (const wx of [30, 92, 222, 284]) {
    ctx.fillStyle = "#0b0f1a";
    ctx.fillRect(wx - 9, 108, 18, 12);
    ctx.fillStyle = "#4b5160";
    ctx.fillRect(wx - 9, 116, 18, 4);
    ctx.fillStyle = "#93a1b8";
    ctx.fillRect(wx - 10, 107, 20, 1);
    ctx.fillRect(wx - 10, 120, 20, 1);
  }
  // big mission screen above the holo table
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(132, 104, 56, 16);
  ctx.fillStyle = "#334155";
  ctx.fillRect(131, 103, 58, 1);
  ctx.fillRect(131, 120, 58, 1);
  // floor
  ctx.fillStyle = "#2e3850";
  ctx.fillRect(13, FLOOR, 294, 1);
  ctx.fillStyle = "#26304a";
  ctx.fillRect(13, FLOOR + 1, 294, 6);
  // consoles
  (Object.keys(DESK) as AgentId[]).forEach((id) => {
    if (id === "chief") return;
    const x = DESK[id];
    ctx.fillStyle = "#475569";
    ctx.fillRect(x - 8, 151, 18, 2);
    ctx.fillStyle = "#334155";
    ctx.fillRect(x - 7, 153, 2, 10);
    ctx.fillRect(x + 7, 153, 2, 10);
    ctx.fillStyle = "#64748b";
    ctx.fillRect(x - 3, 139, 12, 10);
    ctx.fillRect(x + 2, 149, 2, 2);
  });
  // Ada's telescope at the window
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(43, 136, 1, 15);
  ctx.fillRect(40, 132, 8, 3);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(46, 131, 3, 2);
  // holo table
  ctx.fillStyle = "#475569";
  ctx.fillRect(TABLE_X - 13, 151, 26, 3);
  ctx.fillStyle = "#334155";
  ctx.fillRect(TABLE_X - 6, 154, 12, 9);
  ctx.fillStyle = "#22d3ee";
  ctx.fillRect(TABLE_X - 11, 150, 22, 1);
  // airlock and a parked rover outside
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(304, 128, 4, 35);
  ctx.fillStyle = "#4b5563";
  ctx.fillRect(312, 158, 8, 10);
  ctx.fillStyle = "#e5e7eb";
  ctx.fillRect(2, 160, 4, 6);
}

// ---------------------------------------------------------------- dynamic layer
export function drawMonitor(ctx: CanvasRenderingContext2D, id: AgentId, color: string, active: boolean, t: number) {
  const x = DESK[id];
  ctx.fillStyle = active ? "#0b1220" : "#111827";
  ctx.fillRect(x - 2, 140, 10, 8);
  if (!active) {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(x - 1, 143, 6, 1);
    return;
  }
  // scrolling "data" lines in the agent's colour
  const k = Math.floor(t * 8);
  for (let j = 0; j < 4; j++) {
    const w = 2 + ((k + j * 3) % 6);
    ctx.fillStyle = j === k % 4 ? "#ffffff" : color;
    ctx.fillRect(x - 1, 141 + j * 2, w, 1);
  }
}

/** Hologram of the Moon's south pole over the table, with candidate regions blinking. */
export function drawHologram(ctx: CanvasRenderingContext2D, t: number, busy: boolean, decided: string | null) {
  const cx = TABLE_X;
  const cy = 136;
  const r = 10;
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillStyle = (y + Math.floor(t * 6)) % 3 === 0 ? "rgba(34,211,238,0.45)" : "rgba(34,211,238,0.22)";
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
  ctx.fillStyle = "rgba(34,211,238,0.12)";
  ctx.beginPath();
  ctx.moveTo(cx - 11, 150);
  ctx.lineTo(cx + 11, 150);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx - r, cy);
  ctx.fill();
  const spin = t * (busy ? 1.6 : 0.4);
  for (let i = 0; i < 7; i++) {
    const a = spin + i * 0.9;
    const rr = 3 + (i % 3) * 2.5;
    const px = Math.round(cx + Math.cos(a) * rr);
    const py = Math.round(cy + Math.sin(a) * rr * 0.6);
    ctx.fillStyle = decided && i === 0 ? "#4ade80" : Math.floor(t * 4 + i) % 2 ? "#e0f2fe" : "#22d3ee";
    ctx.fillRect(px, py, 1, 1);
  }
  // mission screen
  ctx.fillStyle = decided ? (decided === "GO" ? "#16a34a" : "#dc2626") : busy ? "#0e7490" : "#1e293b";
  ctx.fillRect(134, 106, 52, 12);
  if (busy && !decided) {
    ctx.fillStyle = "#67e8f9";
    const k = Math.floor(t * 10) % 48;
    ctx.fillRect(135 + k, 111, 4, 2);
  }
}

/** A report flying between agents: a little sheet of paper on an arc. */
export function drawPaper(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(Math.round(x) - 2, Math.round(y) - 3, 5, 6);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 2, 3, 1);
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
}
