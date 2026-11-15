"use client";

import { useEffect, useState } from "react";

export interface Pose {
  /** Tracking map the pixel coordinates refer to. */
  map: { id: string; width_px: number; height_px: number } | null;
  tracking_status: string;
  x_px: number | null;
  y_px: number | null;
  z_m: number | null;
  frame_age_ms: number | null;
  heading_deg: number | null;
  heading_source: string | null;
  imu_estimated: boolean | null;
}

/** Poll the pose tracker through the Next.js proxy (/api/pose): fast while tracking, slow otherwise. */
export function usePose(): Pose | null {
  const [pose, setPose] = useState<Pose | null>(null);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let next: Pose | null = null;
      try {
        next = (await fetch("/api/pose", { cache: "no-store" }).then((r) => r.json())) as Pose;
      } catch {
        next = null;
      }
      if (!live) return;
      setPose(next);
      timer = setTimeout(tick, next?.tracking_status === "tracking" || next?.tracking_status === "active" ? 200 : 2000);
    };
    void tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);
  return pose;
}
