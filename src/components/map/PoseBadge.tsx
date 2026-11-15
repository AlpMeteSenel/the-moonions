"use client";

import { Navigation } from "lucide-react";
import { Component, type ReactNode } from "react";
import { usePose } from "@/lib/pose";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A malformed tracker payload must only hide the badge, never take the dashboard down. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function PoseBadge() {
  return (
    <Guard>
      <Badge />
    </Guard>
  );
}

/** Live readout of the physical pose tracker (via /api/pose). Hidden when no tracker is reachable. */
function Badge() {
  const pose = usePose();
  if (!pose || pose.tracking_status === "offline") return null;
  const tracking = num(pose.x_px) && num(pose.y_px);
  return (
    <div className="pointer-events-none absolute right-3 top-[120px] z-20 rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 text-[11px] text-white/70">
      <div className="flex items-center gap-1.5 font-semibold text-white/85">
        <span className={`h-2 w-2 rounded-full ${tracking ? "bg-emerald-400" : "bg-white/30"}`} />
        Tracker · {String(pose.tracking_status)}
        {pose.map && typeof pose.map === "object" && (
          <span className="font-normal text-white/45">
            · map {pose.map.width_px}×{pose.map.height_px}
          </span>
        )}
      </div>
      {tracking && (
        <div className="mt-1 flex items-center gap-3 tabular-nums">
          <span>
            x {Math.round(pose.x_px!)} · y {Math.round(pose.y_px!)} px
          </span>
          {num(pose.z_m) && <span>z {pose.z_m.toFixed(2)} m</span>}
          {num(pose.heading_deg) && (
            <span className="flex items-center gap-1">
              <Navigation size={11} style={{ transform: `rotate(${pose.heading_deg}deg)` }} className="text-cyan-300" />
              {Math.round(pose.heading_deg)}°
            </span>
          )}
          {num(pose.frame_age_ms) && <span className="text-white/40">{Math.round(pose.frame_age_ms)} ms</span>}
        </div>
      )}
    </div>
  );
}
