"use client";

import { Loader2, X } from "lucide-react";
import { evalKey, useStore } from "@/lib/store";
import type { Evaluation } from "@/lib/types";
import { scoreColor } from "@/lib/ui";
import { VerdictChip } from "./Chip";

const ROWS: { key: string; label: string; get: (e: Evaluation) => number | string | undefined; best?: "max" | "min" }[] = [
  { key: "overall", label: "Overall", get: (e) => e.overall, best: "max" },
  { key: "ground", label: "Ground safety", get: (e) => e.factors.find((f) => f.key === "ground")?.score, best: "max" },
  { key: "sunlight", label: "Sunlight", get: (e) => e.factors.find((f) => f.key === "sunlight")?.score, best: "max" },
  { key: "earth", label: "Earth contact", get: (e) => e.factors.find((f) => f.key === "earth")?.score, best: "max" },
  { key: "backups", label: "Backup options", get: (e) => e.factors.find((f) => f.key === "backups")?.score, best: "max" },
  { key: "craters", label: "Crater risk", get: (e) => e.factors.find((f) => f.key === "craters")?.score, best: "max" },
  { key: "science", label: "Science value", get: (e) => e.factors.find((f) => f.key === "science")?.score, best: "max" },
  { key: "tilt", label: "Ground tilt (°)", get: (e) => e.terrain.slope_deg, best: "min" },
  { key: "nbk", label: "Safe backups", get: (e) => e.backups?.filter((b) => b.verdict !== "no-go").length ?? 0, best: "max" },
  { key: "near", label: "Closest backup (m)", get: (e) => (e.backups?.length ? Math.min(...e.backups.map((b) => b.distance_m)) : undefined), best: "min" },
];

export default function ComparePanel() {
  const s = useStore();
  const cols = s.compareIds.map((id) => ({ site: s.sites.find((x) => x.id === id)!, ev: s.evals[evalKey(id, s)] })).filter((c) => c.site);
  if (!cols.length) return <div className="p-6 text-sm text-white/50">Tick the boxes next to candidates to compare them side by side at the same touchdown time.</div>;
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            <th className="sticky left-0 bg-slate-950 p-2 text-left font-medium text-white/40" />
            {cols.map(({ site, ev }) => (
              <th key={site.id} className="min-w-[150px] p-2 text-left align-top">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => s.select(site.id)} className="text-left font-semibold text-white hover:text-cyan-200">
                    {site.name}
                  </button>
                  <button onClick={() => s.toggleCompare(site.id)} className="text-white/30 hover:text-white">
                    <X size={12} />
                  </button>
                </div>
                <div className="mt-1">{ev ? <VerdictChip v={ev.verdict} /> : <Loader2 size={12} className="animate-spin text-white/40" />}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const vals = cols.map((c) => (c.ev ? r.get(c.ev) : undefined));
            const nums = vals.filter((v): v is number => typeof v === "number");
            const allSame = nums.every((v) => Math.round(v * 10) === Math.round(nums[0] * 10));
            const best = nums.length > 1 && !allSame ? (r.best === "min" ? Math.min(...nums) : Math.max(...nums)) : undefined;
            return (
              <tr key={r.key} className="border-t border-white/5">
                <td className="sticky left-0 border-t border-white/5 bg-slate-950 p-2 text-white/55">{r.label}</td>
                {vals.map((v, i) => {
                  const isScore = !["tilt", "nbk", "near"].includes(r.key);
                  const isBest = best !== undefined && v === best;
                  return (
                    <td key={i} className={`border-t border-white/5 p-2 tabular-nums ${isBest ? "bg-emerald-400/[0.07]" : ""}`}>
                      {typeof v === "number" ? (
                        <span style={{ color: isScore ? scoreColor(v) : undefined }} className={isScore ? "font-semibold" : "text-white/80"}>
                          {r.key === "tilt" ? v.toFixed(1) : Math.round(v)}
                          {isBest && <span className="ml-1 text-[10px] text-emerald-300">★</span>}
                        </span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
