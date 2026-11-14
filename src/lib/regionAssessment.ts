import type { RegionAnalysis, Verdict } from "./types";

// Match the minimum viable share used by the backend's region landing windows.
export const MIN_VIABLE_SHARE = 0.02;

export function sharePercent(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 0.01) return "<0.01%";
  return `${Number(percent.toFixed(percent > 0 && percent < 1 ? 2 : 0))}%`;
}

/** Below this viable share a region only offers limited room to choose and re-target. */
export const LIMITED_VIABLE_SHARE = 0.1;

export type RegionVerdict = { verdict: Verdict; label: string; short: string; reasons: string[]; fittingZones: number };

/**
 * Region-level verdict (the region is the unit NASA plans with):
 *  - poor (no-go):  ≤ 2 % of the region viable, or no landing zone fits the full ellipse
 *  - limited (caution): fits, but < 10 % of the region viable or best spot < 90 %
 *  - viable (go):   otherwise
 */
export function regionAssessment(region: RegionAnalysis): RegionVerdict {
  const { stats } = region;
  const fittingZones = region.zones.filter((z) => z.fits_ellipse).length;
  const reasons: string[] = [];
  if (stats.viable_share <= MIN_VIABLE_SHARE) {
    reasons.push(stats.viable_km2 > 0 ? `Only ${stats.viable_km2} of ${stats.area_km2} km² is viable (${sharePercent(stats.viable_share)}).` : "No viable landing area at this time.");
  }
  if (!fittingZones) reasons.push("No landing zone fits the full landing ellipse.");
  if (stats.best_success < 0.8 && stats.viable_km2 > 0) reasons.push("Even the best sampled spot is below 80% predicted success.");
  if (reasons.length) {
    const limiting = REGION_CONSTRAINTS.filter((c) => stats[c.key] <= MIN_VIABLE_SHARE).sort((a, b) => stats[a.key] - stats[b.key])[0];
    if (limiting) reasons.push(`${limiting.label}: only ${sharePercent(stats[limiting.key])} of the region meets this requirement.`);
    return { verdict: "no-go", label: "Poor candidate at this time", short: "Poor", reasons, fittingZones };
  }
  const zonesText = fittingZones === 1 ? "One continuous landing zone fits the ellipse; it can hold several possible targets." : `${fittingZones} landing zones fit the ellipse, including backup options.`;
  if (stats.viable_share < LIMITED_VIABLE_SHARE || stats.best_success < 0.9) {
    const why = stats.viable_share < LIMITED_VIABLE_SHARE ? `Only ${sharePercent(stats.viable_share)} of the region (${stats.viable_km2} km²) is viable, leaving little room to re-target.` : "The best spot is below 90% predicted success.";
    return { verdict: "caution", label: "Limited candidate at this time", short: "Limited", reasons: [why, zonesText], fittingZones };
  }
  return { verdict: "go", label: "Viable candidate at this time", short: "Viable", reasons: [zonesText], fittingZones };
}

export const REGION_CONSTRAINTS = [
  { key: "safe_ground_share", label: "Safe ground", source: "ai" },
  { key: "lit_share", label: "Sunlit at touchdown", source: "computed" },
  { key: "power_share", label: "Power through the stay", source: "computed" },
  { key: "comms_share", label: "Earth link", source: "computed" },
] as const;
