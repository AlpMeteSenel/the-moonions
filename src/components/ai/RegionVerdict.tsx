"use client";

import { Loader2, Maximize2 } from "lucide-react";
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDist } from "@/lib/geo";
import { halfSizeOf, useRegion, useRegionLoading, useRegionTimeline, useStore } from "@/lib/store";
import type { LandingZone, RegionTimeline, Site } from "@/lib/types";
import { fmtTime } from "@/lib/ui";
import { MIN_VIABLE_SHARE, REGION_CONSTRAINTS, regionAssessment, sharePercent } from "@/lib/regionAssessment";
import { landSolid, pct } from "./palette";
import Source from "./Source";

export const ZONE_PRIMARY = "#22d3ee";
export const ZONE_BACKUP = "#e2e8f0";

function Title({ children, source }: { children: React.ReactNode; source?: React.ComponentProps<typeof Source>["kind"] }) {
  return (
    <div className="mb-2 mt-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
      {children}
      {source && <Source kind={source} />}
    </div>
  );
}

function Share({ label, value, source }: { label: string; value: number; source: "ai" | "computed" }) {
  const limited = value <= MIN_VIABLE_SHARE;
  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <span className="w-36 shrink-0 text-[12px] text-white/75">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value * 100}%`, background: limited ? "#f87171" : value < 0.5 ? "#fbbf24" : landSolid(0.5 + value * 0.5) }} />
      </div>
      <span className={`w-12 text-right text-[12px] font-semibold tabular-nums ${limited ? "text-red-300" : "text-white/90"}`}>{sharePercent(value)}</span>
      <Source kind={source} />
    </div>
  );
}

function ZoneRow({ z, active, onClick, limited }: { z: LandingZone; active: boolean; onClick: () => void; limited: boolean }) {
  const primary = z.rank === 1;
  return (
    <button onClick={onClick} className={`w-full rounded-lg border p-2.5 text-left transition ${active ? "border-white/30 bg-white/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]"}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[11px] font-bold text-slate-950" style={{ background: primary ? ZONE_PRIMARY : ZONE_BACKUP }}>
          {z.id}
        </span>
        <div className="flex-1 text-[12px] text-white">
          {!z.fits_ellipse ? "Patch too small for ellipse" : primary ? limited ? "Potential target zone" : "Primary landing zone" : `${fmtDist(z.from_primary?.distance_m ?? 0)} ${z.from_primary?.direction ?? ""} of Z1`}
        </div>
        <span className="text-right text-sm font-semibold tabular-nums text-white">{pct(z.mean_success)}<span className="block text-[9px] font-normal text-white/45">in this zone</span></span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-white/50">
        <div>
          <div className="text-white/35">Zone area</div>
          <div className="font-medium text-white/80">{z.area_km2} km²</div>
        </div>
        <div>
          <div className="text-white/35">Clearance to boundary</div>
          <div className="font-medium text-white/80">{Math.round(z.margin_m)} m</div>
        </div>
        <div>
          <div className="text-white/35">{primary ? "Target spot" : "Decide by"}</div>
          <div className="font-medium text-white/80">{primary ? pct(z.target_success) : `T−${z.from_primary?.decide_by_s}s`}</div>
        </div>
      </div>
    </button>
  );
}

function Windows({ tl, landingTime, onPick }: { tl?: RegionTimeline; landingTime: string; onPick: (iso: string) => void }) {
  if (!tl) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/45">
        <Loader2 size={12} className="animate-spin" /> Checking every 6 h over the next month…
      </div>
    );
  }
  if (!tl.available) return null;
  const data = tl.times.map((t, i) => ({ t: new Date(t).getTime(), v: tl.viable_share[i], b: tl.best_success[i] }));
  const lt = new Date(landingTime).getTime();
  return (
    <div>
      <div className="h-28">
        <ResponsiveContainer>
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 4, left: -30, bottom: 0 }}
            onClick={(e) => {
              const p = (e as unknown as { activePayload?: { payload: { t: number } }[] })?.activePayload?.[0]?.payload;
              if (p) onPick(new Date(p.t).toISOString());
            }}
          >
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
              stroke="rgba(255,255,255,0.1)"
              minTickGap={34}
            />
            <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v) => `${v * 100}%`} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
            <Tooltip
              contentStyle={{ background: "#0b1020", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
              labelFormatter={(v) => fmtTime(new Date(v as number).toISOString())}
              formatter={(v, n) => [pct(Number(v)), n === "v" ? "Region viable" : "Best spot"]}
            />
            <ReferenceLine x={lt} stroke="#e2e8f0" strokeWidth={1.5} />
            <Area type="stepAfter" dataKey="v" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={1.5} isAnimationActive={false} />
            <Line type="stepAfter" dataKey="b" stroke="#cde2fb" strokeWidth={1.2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mb-1.5 flex gap-3 text-[10px] text-white/45">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-[#10b981]/60" /> share of region viable
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-[#cde2fb]" /> best landing spot
        </span>
      </div>
      <div className="space-y-1">
        {tl.windows.length === 0 && <div className="text-[11px] text-red-300">No landing window for this region in the next month.</div>}
        {tl.windows.slice(0, 4).map((w, i) => {
          const active = new Date(w.start).getTime() <= lt && lt < new Date(w.end).getTime();
          return (
            <button
              key={w.best}
              onClick={() => onPick(w.best)}
              className={`grid w-full grid-cols-[18px_1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition ${active ? "bg-sky-400/15 ring-1 ring-sky-300/40" : "bg-white/[0.03] hover:bg-white/[0.07]"}`}
            >
              <span className="text-[10px] font-bold text-white/40">{i === 0 ? "★" : i + 1}</span>
              <span className="text-white/85">{fmtTime(w.best)}</span>
              <span className="text-[10px] text-white/40">{Math.round(w.hours_open)} h window</span>
              <span className="w-10 text-right font-semibold tabular-nums text-white">{pct(w.best_success)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SIZES = [1500, 3000, 5000, 7500];

export default function RegionVerdict({ site }: { site: Site }) {
  const r = useRegion(site.id);
  const loading = useRegionLoading(site.id);
  const tl = useRegionTimeline(site.id);
  const landingTime = useStore((s) => s.landingTime);
  const setLandingTime = useStore((s) => s.setLandingTime);
  const focusZone = useStore((s) => s.focusZone);
  const setFocusZone = useStore((s) => s.setFocusZone);
  const setView = useStore((s) => s.setView);
  const setRegionSize = useStore((s) => s.setRegionSize);
  const half = halfSizeOf(site);
  const assessment = r?.available ? regionAssessment(r) : null;
  const nextWindow = tl?.available ? tl.windows.find((w) => new Date(w.end).getTime() > new Date(landingTime).getTime()) : undefined;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <Maximize2 size={12} /> {((2 * half) / 1000).toFixed(half % 500 ? 1 : 0)} × {((2 * half) / 1000).toFixed(half % 500 ? 1 : 0)} km region
          {site.approx && <span className="text-white/35">(approx. centre)</span>}
        </span>
        {site.custom && (
          <span className="flex gap-0.5">
            {SIZES.map((h) => (
              <button key={h} onClick={() => setRegionSize(site.id, h)} className={`rounded px-1.5 py-0.5 text-[10.5px] ${h === half ? "bg-white/15 text-white" : "text-white/45 hover:text-white"}`}>
                {(2 * h) / 1000} km
              </button>
            ))}
          </span>
        )}
      </div>

      {!r ? (
        <div className="flex items-center gap-2 py-6 text-sm text-white/50">
          <Loader2 size={14} className="animate-spin" /> Mapping landing success across the region…
        </div>
      ) : !r.available ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-[12px] text-white/60">The AI model isn&apos;t trained yet.</div>
      ) : (
        <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/45">
                Best sampled spot <Source kind="ai" />
              </div>
              <div className="text-[10.5px] text-white/45">One location only, not a score for the region</div>
            </div>
            <div className="text-[20px] font-semibold tabular-nums text-white/80">
              {Math.round(r.stats.best_success * 100)}
              <span className="text-xs text-white/50">%</span>
            </div>
          </div>
          {assessment?.verdict === "no-go" && r.stats.best_success >= 0.8 && <p className="mt-2 text-[11px] leading-relaxed text-white/60">A high score at one spot does not make the region suitable. A landing needs enough viable area to contain the full ±{Math.round(r.ellipse_radius_m)} m ellipse.</p>}

          <Title>What limits this region</Title>
          <p className="mb-2 text-[10.5px] leading-snug text-white/50">Share of the region meeting each requirement. All four must hold in the same landing zone.</p>
          {REGION_CONSTRAINTS.map((c) => <Share key={c.key} label={c.label} value={r.stats[c.key]} source={c.source} />)}
          {assessment?.verdict === "no-go" && <p className="mt-2 text-[10.5px] leading-snug text-red-200/80">{r.stats.viable_share <= MIN_VIABLE_SHARE ? "At or below the 2% viable-area threshold used to identify landing windows." : "No full landing ellipse fits the viable patches."}</p>}

          <Title source="ai">Landing zones</Title>
          {r.zones.length === 0 ? (
            <div className="rounded-md border border-red-400/40 bg-red-400/10 p-2.5 text-[11.5px] text-red-200">
              No zone fits the full ±{Math.round(r.ellipse_radius_m)} m landing ellipse at this time.
            </div>
          ) : (
            <div className="space-y-1.5">
              {r.zones.map((z) => (
                <ZoneRow
                  key={z.id}
                  z={z}
                  active={focusZone === z.id}
                  limited={assessment?.verdict === "no-go"}
                  onClick={() => {
                    setFocusZone(focusZone === z.id ? null : z.id);
                    setView("site");
                  }}
                />
              ))}
              <div className="text-[10.5px] leading-snug text-white/40">
                {assessment?.verdict === "no-go" ? "These patches do not make the region a recommended candidate at this time." : r.zones.length === 1 ? "Z1 is one continuous viable area. Alternate targets within it have not been assessed individually." : "Z1 is the primary target. Other zones are potential backups within this region."}
              </div>
            </div>
          )}
        </div>
      )}

      <Title source="ai">Landing windows</Title>
      {nextWindow && assessment?.verdict === "no-go" && <button onClick={() => setLandingTime(nextWindow.best)} className="mb-3 w-full rounded-md border border-sky-400/30 bg-sky-400/10 p-2 text-left text-[11px] text-sky-200 hover:bg-sky-400/20">Try next landing window · {fmtTime(nextWindow.best)} →</button>}
      {assessment?.verdict === "no-go" && <button onClick={() => useStore.getState().setPanel("planner")} className="mb-3 w-full rounded-md bg-white/[0.06] px-3 py-2 text-left text-[11px] font-medium text-white/85 hover:bg-white/10">Compare other regions in the mission planner →</button>}
      <Windows tl={tl} landingTime={landingTime} onPick={setLandingTime} />
    </div>
  );
}
