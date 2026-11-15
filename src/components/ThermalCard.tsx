"use client";

import { Loader2, Thermometer } from "lucide-react";
import { useEffect } from "react";
import { fmtDuration, fmtTemp } from "@/lib/compare";
import { useStore } from "@/lib/store";
import type { Conditions, Site } from "@/lib/types";
import { tempColor } from "./ai/palette";

/** 14 days of surface temperature as a colour band, the stay bracketed. */
export function TempStrip({ c, height = 10 }: { c: Conditions; height?: number }) {
  const s = c.series.surface_temp_k;
  if (!s?.length) return null;
  const stayX = Math.min(s.length, c.stay.hours);
  return (
    <svg viewBox={`0 0 ${s.length} ${height + 4}`} preserveAspectRatio="none" className="block w-full" style={{ height: height + 4 }} role="img" aria-label="Surface temperature over 14 days">
      {s.map((k, i) => (
        <rect key={i} x={i} y={4} width={1.05} height={height} fill={tempColor(k)} />
      ))}
      <path d={`M0.5,3 V0.5 H${stayX - 0.5} V3`} fill="none" stroke="#e2e8f0" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ k, label }: { k: number; label: string }) {
  return (
    <div>
      <div className="text-[18px] font-semibold tabular-nums" style={{ color: tempColor(k) === "#383835" ? "#e2e8f0" : undefined }}>
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: tempColor(k) }} />
        {fmtTemp(k)}
      </div>
      <div className="text-[10.5px] text-white/45">
        {label} · {Math.round(k)} K
      </div>
    </div>
  );
}

/** Surface temperature at the selected site and touchdown time (thermal model, /api/conditions). */
export default function ThermalCard({ site }: { site: Site }) {
  const landingTime = useStore((s) => s.landingTime);
  const c = useStore((s) => s.conditions[`${site.id}|${s.landingTime}`]);
  const loadConditions = useStore((s) => s.loadConditions);
  useEffect(() => {
    void loadConditions(site.id, landingTime);
  }, [site.id, landingTime, loadConditions]);
  const t = c?.thermal;
  return (
    <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
        <Thermometer size={12} className="text-white/50" /> Surface temperature
      </div>
      {!c || !t ? (
        <div className="flex items-center gap-2 py-2 text-[11px] text-white/45">
          <Loader2 size={12} className="animate-spin" /> Modelling sunlight and shadow on the ground…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat k={t.now_k} label="at touchdown" />
            <Stat k={t.stay_min_k} label="coldest in stay" />
            <Stat k={t.stay_max_k} label="hottest in stay" />
          </div>
          <div className="mt-2.5">
            <TempStrip c={c} />
            <div className="mt-0.5 flex justify-between text-[9.5px] text-white/35">
              <span>touchdown</span>
              <span>stay {fmtDuration(c.stay.hours)}</span>
              <span>+14 d</span>
            </div>
          </div>
          <div className="mt-1.5 text-[10.5px] text-white/40">
            Ground slope {t.slope_deg}° facing {Math.round(t.aspect_deg)}°{t.stay_min_k < 100 ? " · below 100 K the lander needs heaters to survive" : ""}
          </div>
        </>
      )}
    </div>
  );
}
