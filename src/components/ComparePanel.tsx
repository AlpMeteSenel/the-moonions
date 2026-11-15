"use client";

import { Check, Globe2, Loader2, Plus, Sun, Thermometer, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { earthLine, fmtDuration, rankKey, runs, stayOutcome, sunLine, thermalLine, thermalTone, type Tone } from "@/lib/compare";
import { TempStrip } from "./ThermalCard";
import { halfSizeOf, hourOf, regionKey, useStore } from "@/lib/store";
import type { Conditions, Site } from "@/lib/types";
import { fmtTime, VERDICT } from "@/lib/ui";
import { regionLook } from "./map/RegionLayer";

const SLIPS = [-7 * 24, 24, 3 * 24, 7 * 24, 14 * 24];
const TONE_TEXT: Record<Tone, string> = { go: "text-emerald-300", caution: "text-amber-300", "no-go": "text-red-300" };

type Option = { key: string; site: Site; offsetH: number; iso: string; tag: string; onRemove?: () => void };

function slipLabel(h: number) {
  return `${h > 0 ? "+" : "−"}${fmtDuration(Math.abs(h))}`;
}

/** Two 14-day lanes: when the Sun is up and when Earth is in view, with the surface stay bracketed. */
function DayStrip({ c }: { c: Conditions }) {
  const n = c.series.times.length;
  const sun = runs(c.series.sun_visible_fraction.map((f) => f > 0.5));
  const earth = runs(c.series.earth_above_skyline.map((e) => e >= c.comm_mask_deg));
  const stayX = Math.min(n, c.stay.hours);
  return (
    <div>
      <svg viewBox={`0 0 ${n} 30`} preserveAspectRatio="none" className="block h-[30px] w-full" role="img" aria-label="Sun and Earth over the next 14 days">
        <rect x={0} y={4} width={n} height={10} fill="rgba(255,255,255,0.05)" />
        <rect x={0} y={18} width={n} height={10} fill="rgba(255,255,255,0.05)" />
        {sun.map(([a, b]) => (
          <rect key={`s${a}`} x={a} y={4} width={b - a} height={10} fill="#fbbf24" />
        ))}
        {earth.map(([a, b]) => (
          <rect key={`e${a}`} x={a} y={18} width={b - a} height={10} fill="#3b82f6" />
        ))}
        <path d={`M0.5,3 V0.5 H${stayX - 0.5} V3`} fill="none" stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
      <TempStrip c={c} height={8} />
      <div className="mt-0.5 flex justify-between text-[9.5px] text-white/35">
        <span>touchdown</span>
        <span>stay {fmtDuration(c.stay.hours)}</span>
        <span>+14 d</span>
      </div>
    </div>
  );
}

function OptionCard({ o, best }: { o: Option; best: boolean }) {
  const c = useStore((s) => s.conditions[`${o.site.id}|${o.iso}`]);
  const summary = useStore((s) => s.summaries[hourOf(o.iso)]?.[o.site.id]);
  // the detailed region analysis (same one the side panel shows) wins over the coarse polar grid when available
  const detail = useStore((s) => s.regions[regionKey(o.site.id, o.iso, halfSizeOf(o.site))]);
  const use = useStore((s) => s.setLandingTimeAndSelect);
  const out = c ? stayOutcome(c) : null;
  const look = regionLook(summary, detail);
  const ring = out ? VERDICT[out.tone].ring : "rgba(255,255,255,0.1)";
  return (
    <article className="flex w-[260px] shrink-0 flex-col rounded-xl border bg-white/[0.025] p-3" style={{ borderColor: out ? `${ring}55` : "rgba(255,255,255,0.1)" }}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
        <span>{o.tag}</span>
        {best && <span className="rounded bg-emerald-400/15 px-1.5 py-px text-emerald-300">Best option</span>}
        {o.onRemove && (
          <button onClick={o.onRemove} className="ml-auto rounded p-0.5 text-white/35 hover:bg-white/10 hover:text-white" title="Remove from comparison">
            <X size={12} />
          </button>
        )}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-white" title={o.site.name}>
        {o.site.name}
      </div>
      <div className="text-[11px] text-white/50" suppressHydrationWarning>
        {fmtTime(o.iso)}
      </div>

      {!c || !out ? (
        <div className="flex flex-1 items-center gap-2 py-6 text-[11px] text-white/45">
          <Loader2 size={12} className="animate-spin" /> Working out Sun and Earth…
        </div>
      ) : (
        <>
          <div className="mt-2.5">
            <div className={`text-[15px] font-bold leading-tight ${TONE_TEXT[out.tone]}`}>{out.title}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-white/65">{out.detail}</div>
          </div>
          <dl className="mt-2.5 grid grid-cols-[18px_1fr] items-center gap-x-1.5 gap-y-1 text-[11.5px]">
            <dt>
              <Sun size={13} className="text-amber-300" aria-label="Sun" />
            </dt>
            <dd className={c.now.sun_up ? "text-white" : "text-white/60"}>{sunLine(c)}</dd>
            <dt>
              <Globe2 size={13} className="text-sky-400" aria-label="Earth" />
            </dt>
            <dd className={c.now.earth_up ? "text-white" : "text-white/60"}>{earthLine(c)}</dd>
            {thermalLine(c) && (
              <>
                <dt>
                  <Thermometer size={13} className="text-rose-300" aria-label="Surface temperature" />
                </dt>
                <dd className={thermalTone(c) === "caution" ? "text-amber-200" : "text-white/80"}>{thermalLine(c)}</dd>
              </>
            )}
            <dt>
              <span className="block h-2.5 w-2.5 rounded-sm border" style={{ borderColor: look.verdict ? VERDICT[look.verdict].color : "#64748b" }} aria-label="Landing area" />
            </dt>
            <dd className="text-white/80">
              <span className={look.verdict ? TONE_TEXT[look.verdict] : "text-white/45"}>{look.short}</span> <span className="text-white/45">landing area · {look.detail}</span>
            </dd>
          </dl>
          <div className="mt-2.5">
            <DayStrip c={c} />
          </div>
        </>
      )}
      <button onClick={() => use(o.site.id, o.iso)} className="mt-2.5 rounded-md bg-white/[0.06] px-2 py-1.5 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white">
        Show on map
      </button>
    </article>
  );
}

export default function ComparePanel() {
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedId);
  const compareIds = useStore((s) => s.compareIds);
  const slips = useStore((s) => s.compareSlips);
  const landingTime = useStore((s) => s.landingTime);
  const conditions = useStore((s) => s.conditions);
  const summaries = useStore((s) => s.summaries);
  const { toggleCompare, addSlip, removeSlip, loadConditions, loadSummaries } = useStore.getState();

  const base = sites.find((x) => x.id === (selectedId ?? compareIds[0]));

  const options = useMemo(() => {
    const t0 = new Date(landingTime).getTime();
    const out: Option[] = [];
    const seen = new Set<string>();
    const push = (o: Omit<Option, "key" | "iso">) => {
      const iso = o.offsetH === 0 ? landingTime : new Date(t0 + o.offsetH * 3600e3).toISOString();
      const key = `${o.site.id}|${o.offsetH}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ ...o, key, iso });
    };
    if (base) push({ site: base, offsetH: 0, tag: "Planned", onRemove: compareIds.includes(base.id) ? () => toggleCompare(base.id) : undefined });
    for (const id of compareIds) {
      const site = sites.find((x) => x.id === id);
      if (site) push({ site, offsetH: 0, tag: base && id !== base.id ? "Other site, same time" : "Planned", onRemove: () => toggleCompare(id) });
    }
    for (const sl of slips) {
      const site = sites.find((x) => x.id === sl.siteId);
      if (site) push({ site, offsetH: sl.offsetH, tag: `${sl.offsetH > 0 ? "Slips" : "Earlier"} ${slipLabel(sl.offsetH)}`, onRemove: () => removeSlip(sl.siteId, sl.offsetH) });
    }
    return out;
  }, [base, compareIds, slips, sites, landingTime, toggleCompare, removeSlip]);

  useEffect(() => {
    for (const o of options) {
      void loadConditions(o.site.id, o.iso);
      void loadSummaries(o.iso);
    }
  }, [options, loadConditions, loadSummaries]);

  const bestKey = useMemo(() => {
    const scored = options
      .map((o) => {
        const c = conditions[`${o.site.id}|${o.iso}`];
        return c ? { key: o.key, tone: stayOutcome(c).tone, r: rankKey(c, summaries[hourOf(o.iso)]?.[o.site.id]?.viable_share) } : null;
      })
      .filter((x): x is { key: string; tone: Tone; r: number } => x !== null);
    if (options.length < 2 || scored.length < options.length) return null;
    const top = scored.sort((a, b) => b.r - a.r)[0];
    return top.tone === "no-go" ? null : top.key;
  }, [options, conditions, summaries]);

  if (!base) return <div className="p-6 text-sm text-white/50">Select a landing region, then compare it against later dates or other regions.</div>;

  return (
    <div className="flex h-full flex-col gap-2.5 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-white/55">
          What if <span className="font-semibold text-white">{base.name}</span> slips?
        </span>
        <div className="flex gap-1">
          {SLIPS.map((h) => {
            const on = slips.some((x) => x.siteId === base.id && x.offsetH === h);
            return (
              <button
                key={h}
                onClick={() => (on ? removeSlip(base.id, h) : addSlip(base.id, h))}
                className={`flex items-center gap-1 rounded-md border px-2 py-1 tabular-nums ${on ? "border-cyan-300/50 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-white/70 hover:border-white/30 hover:text-white"}`}
              >
                {on ? <Check size={11} /> : <Plus size={11} />}
                {slipLabel(h)}
              </button>
            );
          })}
        </div>
        <span className="text-white/35">Tick regions in the left list to compare other sites at the same time.</span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto pb-1">
        {options.map((o) => (
          <OptionCard key={o.key} o={o} best={o.key === bestKey} />
        ))}
        {options.length === 1 && (
          <div className="flex w-[220px] shrink-0 items-center rounded-xl border border-dashed border-white/10 p-4 text-[11px] leading-relaxed text-white/40">
            Add a date slip above, or tick other regions on the left, to see them side by side.
          </div>
        )}
      </div>
    </div>
  );
}
