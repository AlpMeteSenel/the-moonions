"use client";

import { useEffect, useState } from "react";
import { texture } from "./api";
import { BACKEND_HEADERS, blobUrl } from "./net";

/**
 * CPU copy of the rendered lunar surface, so overlays (regions, zones, labels) sit exactly on the
 * terrain instead of floating above it (floating overlays slide against the terrain when rotating).
 * Mirrors the globe: equirectangular displacement map between ±80°, LOLA polar caps beyond.
 */

export const RELIEF_EXAGGERATION = 2.0;
export const CAP_EDGE_LAT = 80;
const MOON_R_KM = 1737.4;
const MOON_R_M = 1737400;
// global height map range (textures.json → height_min_m / height_max_m)
const H_MIN = -8981.5;
const H_MAX = 10685.5;
export const DISP_SCALE = ((H_MAX - H_MIN) / 1000 / MOON_R_KM) * RELIEF_EXAGGERATION;
export const DISP_BIAS = (H_MIN / 1000 / MOON_R_KM) * RELIEF_EXAGGERATION;

interface Px {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}
interface CapMeta {
  height_min_m: number;
  height_max_m: number;
  half_size_m: number;
}

async function pixels(url: string): Promise<Px> {
  const src = await blobUrl(url);
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
}

/** Bilinear sample of the red channel (0..1) at fractional pixel coordinates. */
function bilinear(p: Px, fx: number, fy: number, wrapX: boolean) {
  const x0 = Math.floor(fx);
  const y0 = Math.max(0, Math.min(p.h - 2, Math.floor(fy)));
  const ax = fx - x0;
  const ay = Math.max(0, Math.min(1, fy - y0));
  const cx = (x: number) => (wrapX ? ((x % p.w) + p.w) % p.w : Math.max(0, Math.min(p.w - 1, x)));
  const at = (x: number, y: number) => p.data[(y * p.w + cx(x)) * 4] / 255;
  return (at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay;
}

export interface Surface {
  /** Radius of the rendered surface (sphere units) at a selenographic point. */
  radius: (lat: number, lon: number) => number;
}

let loading: Promise<Surface> | null = null;

export function loadSurface(): Promise<Surface> {
  if (loading) return loading;
  loading = (async () => {
    const meta = await fetch(texture("textures.json"), { headers: BACKEND_HEADERS }).then((r) => r.json());
    const caps: Record<string, CapMeta> = meta.caps ?? {};
    const [global, capS, capN] = await Promise.all([
      pixels(texture("moon_height_2k.png")),
      caps.cap_s ? pixels(texture("cap_s_height.png")) : Promise.resolve(null),
      caps.cap_n ? pixels(texture("cap_n_height.png")) : Promise.resolve(null),
    ]);
    const radius = (lat: number, lon: number) => {
      const south = lat < 0;
      const cap = south ? capS : capN;
      const cm = south ? caps.cap_s : caps.cap_n;
      if (cap && cm && Math.abs(lat) >= CAP_EDGE_LAT) {
        const colat = 90 - Math.abs(lat);
        const rho = 2 * MOON_R_M * Math.tan((colat * Math.PI) / 360);
        const lr = (lon * Math.PI) / 180;
        const x = rho * Math.sin(lr);
        const y = south ? rho * Math.cos(lr) : -rho * Math.cos(lr);
        const u = 0.5 + x / (2 * cm.half_size_m);
        const v = 0.5 + y / (2 * cm.half_size_m);
        const g = bilinear(cap, u * (cap.w - 1), (1 - v) * (cap.h - 1), false);
        const h = cm.height_min_m + g * (cm.height_max_m - cm.height_min_m);
        return 1 + (h / MOON_R_M) * RELIEF_EXAGGERATION;
      }
      // GPU displacement: texel centres at (i + 0.5) / size, flipY → row 0 is the north edge
      const u = (lon + 180) / 360;
      const v = 0.5 + lat / 180;
      const g = bilinear(global, u * global.w - 0.5, (1 - v) * global.h - 0.5, true);
      return 1 + DISP_BIAS + DISP_SCALE * g;
    };
    return { radius };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

export function useSurface(): Surface | null {
  const [s, setS] = useState<Surface | null>(null);
  useEffect(() => {
    let live = true;
    loadSurface()
      .then((x) => live && setS(x))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return s;
}
