"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { regionAssessment, sharePercent } from "@/lib/regionAssessment";
import type { RegionAnalysis } from "@/lib/types";
import { VERDICT } from "@/lib/ui";

export default function CandidateAssessment({ region, loading = false, compact = false }: { region?: RegionAnalysis; loading?: boolean; compact?: boolean }) {
  if (!region) return (
    <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 p-3 text-xs text-white/60">
      <Loader2 size={14} className="animate-spin" /> Assessing this region…
    </div>
  );
  if (!region.available) return <div className="mt-3 rounded-lg border border-white/10 p-3 text-xs text-white/60">Region assessment unavailable</div>;
  const assessment = regionAssessment(region);
  const tone = VERDICT[assessment.verdict];
  const Icon = assessment.verdict === "go" ? CheckCircle2 : AlertTriangle;
  return (
    <div role="status" aria-busy={loading} className={`mt-3 rounded-lg border p-3 transition-opacity ${loading ? "opacity-60" : ""}`} style={{ borderColor: `${tone.color}50`, background: tone.bg }}>
      <div className="flex items-center gap-2" style={{ color: tone.color }}>
        <Icon size={compact ? 15 : 18} className="shrink-0" />
        <span className="flex-1 text-[13px] font-semibold leading-snug">{assessment.label}</span>
      </div>
      <div className="mt-1 text-[10px] text-white/50">Simulation-based estimate · generic lander</div>
      <div className="mt-1.5 space-y-1 text-[11.5px] leading-snug text-white/80">
        {(compact ? assessment.reasons.slice(0, 1) : assessment.reasons).map((reason) => <p key={reason}>{reason}</p>)}
      </div>
      {!compact && (
        <div className="mt-3 border-t border-white/10 pt-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider text-white/55">Viable share of region</span>
            <span className="text-xl font-semibold tabular-nums text-white">{sharePercent(region.stats.viable_share)}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/25">
            <div className="h-full rounded-full" style={{ width: `${region.stats.viable_share * 100}%`, background: tone.color }} />
          </div>
          <div className="mt-1.5 flex justify-between gap-2 text-[10.5px] text-white/60">
            <span>{region.stats.viable_km2} / {region.stats.area_km2} km²</span>
            <span>{assessment.fittingZones} zone{assessment.fittingZones === 1 ? " fits" : "s fit"} the ellipse</span>
          </div>
        </div>
      )}
    </div>
  );
}
