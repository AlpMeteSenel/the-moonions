"use client";

import { Navigation } from "lucide-react";
import { Component, type ReactNode } from "react";
import { fmtDist } from "@/lib/geo";
import { landerState, TRACKER_SITE_ID, usePose } from "@/lib/pose";
import { halfSizeOf, useStore } from "@/lib/store";


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
  const site = useStore((s) => s.sites.find((x) => x.id === TRACKER_SITE_ID));
  const select = useStore((s) => s.select);
  if (!pose || pose.tracking_status === "offline") return null;
  const st = site ? landerState(pose, halfSizeOf(site)) : null;
  const dir = (v: number, pos: string, neg: string) => `${fmtDist(Math.abs(v))} ${v >= 0 ? pos : neg}`;
  return (
    <button
      onClick={() => site && select(site.id)}
      className="absolute right-3 top-[120px] z-20 rounded-lg border border-pink-300/25 bg-slate-950/85 px-3 py-2 text-left text-[11px] text-white/70 hover:border-pink-300/50"
      title={site ? `Show ${site.name}` : undefined}
    >
      <div className="flex items-center gap-1.5 font-semibold text-white/90">
        <span className={`h-2 w-2 rounded-full ${st?.live ? "animate-pulse bg-pink-400" : st ? "bg-pink-300/60" : "bg-white/30"}`} />
        Lander
        <span className="font-normal text-white/45">· {String(pose.tracking_status)}</span>
      </div>
      {st && site ? (
        <div className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
          <span className="text-white/45">Altitude</span>
          <span className="font-semibold text-white">{st.alt_m !== null ? fmtDist(st.alt_m) : "—"}</span>
          <span className="text-white/45">Over</span>
          <span>{site.name}</span>
          <span className="text-white/45">From centre</span>
          <span>
            {dir(st.east_m, "E", "W")}, {dir(st.north_m, "N", "S")}
          </span>
          {st.heading_deg !== null && (
            <>
              <span className="text-white/45">Heading</span>
              <span className="flex items-center gap-1">
                <Navigation size={11} style={{ transform: `rotate(${st.heading_deg}deg)` }} className="text-pink-300" />
                {Math.round(st.heading_deg)}°
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="mt-0.5 text-white/45">waiting for position…</div>
      )}
    </button>
  );
}
