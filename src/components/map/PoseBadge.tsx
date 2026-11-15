"use client";

import { Navigation } from "lucide-react";
import { usePose } from "@/lib/pose";

/** Live readout of the physical pose tracker (via /api/pose). Hidden when no tracker is reachable. */
export default function PoseBadge() {
  const pose = usePose();
  if (!pose || pose.tracking_status === "offline") return null;
  const tracking = pose.x_px !== null && pose.y_px !== null;
  return (
    <div className="pointer-events-none absolute right-3 top-[120px] z-20 rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 text-[11px] text-white/70">
      <div className="flex items-center gap-1.5 font-semibold text-white/85">
        <span className={`h-2 w-2 rounded-full ${tracking ? "bg-emerald-400" : "bg-white/30"}`} />
        Tracker · {pose.tracking_status}
        {pose.map && <span className="font-normal text-white/45">· {pose.map}</span>}
      </div>
      {tracking && (
        <div className="mt-1 flex items-center gap-3 tabular-nums">
          <span>
            x {Math.round(pose.x_px!)} · y {Math.round(pose.y_px!)} px
          </span>
          {pose.z_m !== null && <span>z {pose.z_m.toFixed(2)} m</span>}
          {pose.heading_deg !== null && (
            <span className="flex items-center gap-1">
              <Navigation size={11} style={{ transform: `rotate(${pose.heading_deg}deg)` }} className="text-cyan-300" />
              {Math.round(pose.heading_deg)}°
            </span>
          )}
          {pose.frame_age_ms !== null && <span className="text-white/40">{Math.round(pose.frame_age_ms)} ms</span>}
        </div>
      )}
    </div>
  );
}
