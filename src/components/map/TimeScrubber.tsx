"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TRACK_DAYS, useRegionTimeline, useSelected, useStore } from "@/lib/store";
import { fmtTime } from "@/lib/ui";

const DAY = 86400e3;
const SPAN_DAYS = TRACK_DAYS;

function roundHour(t: number) {
  return Math.round(t / 3600e3) * 3600e3;
}

/** Month-long time track under the map: drag to change the touchdown time. */
export default function TimeScrubber() {
  const landingTime = useStore((s) => s.landingTime);
  const setLandingTime = useStore((s) => s.setLandingTime);
  const site = useSelected();
  const tl = useRegionTimeline(site?.id);
  const ref = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const anchorIso = useStore((s) => s.timeAnchor);
  const t0 = new Date(anchorIso).getTime();
  const t1 = t0 + SPAN_DAYS * DAY;
  const cur = preview ?? new Date(landingTime).getTime();
  const x = (t: number) => ((t - t0) / (t1 - t0)) * 100;

  const ticks = useMemo(() => {
    const out: { t: number; label: string; major: boolean }[] = [];
    for (let d = 0; d <= SPAN_DAYS; d++) {
      const t = t0 + d * DAY;
      const date = new Date(t);
      out.push({ t, label: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }), major: d % 4 === 0 });
    }
    return out;
  }, [t0]);

  const area = useMemo(() => {
    if (!tl?.available) return null;
    const pts = tl.times.map((t, i) => [x(new Date(t).getTime()), 100 - tl.viable_share[i] * 100] as const).filter(([px]) => px >= 0 && px <= 100);
    if (!pts.length) return null;
    return `M${pts[0][0]},100 ` + pts.map(([px, py]) => `L${px},${py}`).join(" ") + ` L${pts[pts.length - 1][0]},100 Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl, t0]);

  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return roundHour(t0 + f * (t1 - t0));
  };
  const commit = (t: number) => {
    setPreview(null);
    if (Math.abs(t - new Date(landingTime).getTime()) >= 3600e3) setLandingTime(new Date(t).toISOString());
  };
  const step = (h: number) => setLandingTime(new Date(roundHour(new Date(landingTime).getTime() + h * 3600e3)).toISOString());

  return (
    <div className="absolute inset-x-3 bottom-3 z-40 rounded-xl border border-white/10 bg-slate-950/85 px-3 pb-2 pt-2 shadow-xl">
      <div className="mb-1 flex items-center gap-2 text-[10.5px]">
        <span className="font-semibold uppercase tracking-[0.14em] text-white/45">Time</span>
        <span className="tabular-nums text-white" suppressHydrationWarning>
          {fmtTime(new Date(cur).toISOString())}
        </span>
        {preview !== null && <span className="text-white/40">release to set</span>}
        <span className="ml-auto flex items-center gap-2 text-white/45">
          {tl?.available && site ? (
            <>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-[#10b981]/70" /> {site.name.split(" · ")[0]}: landable share
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1 w-3 rounded-sm bg-[#cde2fb]" /> landing windows
              </span>
            </>
          ) : (
            <span>{site ? tl ? "Landing windows unavailable for this region" : "Computing this region’s landing windows…" : "Select a region to see its landing windows"}</span>
          )}
          <button onClick={() => step(-6)} className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white" title="6 hours earlier">
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => step(6)} className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white" title="6 hours later">
            <ChevronRight size={14} />
          </button>
        </span>
      </div>
      <div
        ref={ref}
        className="relative h-9 cursor-ew-resize touch-none select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setPreview(timeAt(e.clientX));
        }}
        onPointerMove={(e) => preview !== null && setPreview(timeAt(e.clientX))}
        onPointerUp={(e) => preview !== null && commit(timeAt(e.clientX))}
        onPointerCancel={() => setPreview(null)}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="100" fill="rgba(255,255,255,0.03)" />
          {area && <path d={area} fill="#10b981" fillOpacity={0.45} stroke="#10b981" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
          {tl?.available &&
            tl.windows.map((w) => (
              <rect key={w.start} x={x(new Date(w.start).getTime())} y={0} width={Math.max(0.3, x(new Date(w.end).getTime()) - x(new Date(w.start).getTime()))} height={10} fill="#cde2fb" />
            ))}
          {ticks.map((t) => (
            <line key={t.t} x1={x(t.t)} x2={x(t.t)} y1={t.major ? 70 : 85} y2={100} stroke="rgba(255,255,255,0.18)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {ticks
          .filter((t) => t.major)
          .map((t) => (
            <span key={t.t} className="pointer-events-none absolute bottom-0 -translate-x-1/2 translate-y-full pt-0.5 text-[9.5px] text-white/40" style={{ left: `${x(t.t)}%` }}>
              {t.label}
            </span>
          ))}
        <div className="pointer-events-none absolute inset-y-[-3px] w-0.5 -translate-x-1/2 rounded bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" style={{ left: `${Math.min(100, Math.max(0, x(cur)))}%` }}>
          <div className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-white" />
        </div>
      </div>
      <div className="h-3" />
    </div>
  );
}
