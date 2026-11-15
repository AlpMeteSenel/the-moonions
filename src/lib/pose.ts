"use client";

import { useEffect } from "react";
import { create } from "zustand";

export interface Pose {
  /** Tracking map the pixel coordinates refer to. */
  map: { id: string; width_px: number; height_px: number } | null;
  tracking_status: string;
  x_px: number | null;
  y_px: number | null;
  /** Position on the map, 0..1 (x → east, y → down = south). */
  x_norm?: number | null;
  y_norm?: number | null;
  /** Lander altitude above the surface. */
  altitude_m?: number | null;
  z_m: number | null;
  height_calibrated?: boolean | null;
  frame_age_ms: number | null;
  heading_deg: number | null;
  heading_source: string | null;
  imu_estimated: boolean | null;
}

/** The tracker's map stands for this landing region. */
export const TRACKER_SITE_ID = "mouton-plateau";
/**
 * Tracker altitudes are measured over the physical map; scale them like the map itself
 * (map width ↔ region width). Override with NEXT_PUBLIC_TRACKER_MAP_WIDTH_M.
 */
const MAP_WIDTH_M = Number(process.env.NEXT_PUBLIC_TRACKER_MAP_WIDTH_M ?? 1.0);

const usePoseStore = create<{ pose: Pose | null; users: number }>(() => ({ pose: null, users: 0 }));
let timer: ReturnType<typeof setTimeout> | null = null;

async function tick() {
  let next: Pose | null = null;
  try {
    next = (await fetch("/api/pose", { cache: "no-store" }).then((r) => r.json())) as Pose;
  } catch {
    next = null;
  }
  usePoseStore.setState({ pose: next });
  if (usePoseStore.getState().users > 0) timer = setTimeout(tick, next && next.tracking_status !== "offline" && next.tracking_status !== "inactive" ? 200 : 2000);
  else timer = null;
}

/** Shared tracker pose (one poller for every component), via the Next.js proxy /api/pose. */
export function usePose(): Pose | null {
  useEffect(() => {
    usePoseStore.setState((s) => ({ users: s.users + 1 }));
    if (!timer) void tick();
    return () => usePoseStore.setState((s) => ({ users: s.users - 1 }));
  }, []);
  return usePoseStore((s) => s.pose);
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export interface LanderState {
  /** Offset from the region centre, metres. */
  east_m: number;
  north_m: number;
  /** Altitude above the surface in lunar metres (null when the tracker gives none). */
  alt_m: number | null;
  heading_deg: number | null;
  live: boolean;
}

/** Tracker pose → lander position inside a region of half-size `halfM`. */
export function landerState(pose: Pose | null, halfM: number): LanderState | null {
  if (!pose) return null;
  let x = num(pose.x_norm) ? pose.x_norm : null;
  let y = num(pose.y_norm) ? pose.y_norm : null;
  if ((x === null || y === null) && pose.map && num(pose.x_px) && num(pose.y_px) && pose.map.width_px > 0 && pose.map.height_px > 0) {
    x = pose.x_px / pose.map.width_px;
    y = pose.y_px / pose.map.height_px;
  }
  if (x === null || y === null) return null;
  // altitude_m is the lander's altitude as given; z_m is a height over the physical map, scaled like the map
  const alt = num(pose.altitude_m) ? pose.altitude_m : num(pose.z_m) ? (pose.z_m / MAP_WIDTH_M) * 2 * halfM : null;
  return {
    east_m: (x - 0.5) * 2 * halfM,
    north_m: (0.5 - y) * 2 * halfM,
    alt_m: alt === null ? null : Math.max(0, alt),
    heading_deg: num(pose.heading_deg) ? pose.heading_deg : null,
    live: pose.tracking_status === "tracking" || pose.tracking_status === "active",
  };
}
