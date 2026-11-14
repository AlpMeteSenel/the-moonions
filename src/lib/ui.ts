import type { Verdict } from "./types";

export const VERDICT: Record<Verdict, { label: string; color: string; bg: string; ring: string }> = {
  go: { label: "GO", color: "#34d399", bg: "rgba(52,211,153,0.14)", ring: "#34d399" },
  caution: { label: "CAUTION", color: "#fbbf24", bg: "rgba(251,191,36,0.14)", ring: "#fbbf24" },
  "no-go": { label: "NO-GO", color: "#f87171", bg: "rgba(248,113,113,0.14)", ring: "#f87171" },
};

export const TIER_COLOR: Record<string, string> = { near: "#22d3ee", mid: "#a78bfa", far: "#f472b6" };

export function scoreColor(s: number) {
  if (s >= 70) return "#34d399";
  if (s >= 45) return "#fbbf24";
  return "#f87171";
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}
