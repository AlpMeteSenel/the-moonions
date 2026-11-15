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

/** Globe mesh resolution (Globe.tsx band sphere, PolarCap grid): needed to know what is actually drawn. */
export const BAND_SEGMENTS: [number, number] = [384, 192];
export const bandEdgeLat = (hasCaps: boolean) => (hasCaps ? CAP_EDGE_LAT + 0.05 : 90);
export const CAP_GRID = 220;
export const capExtentM = () => 2 * MOON_R_M * Math.tan(((90 - (CAP_EDGE_LAT - 0.3)) * Math.PI) / 360);

export interface Surface {
  /** Radius of the surface height map (sphere units) at a selenographic point. */
  radius: (lat: number, lon: number) => number;
  /** Radius of the globe mesh as drawn: height map at the mesh vertices, linear in between. */
  rendered: (lat: number, lon: number) => number;
}

/** Height (m) of the drawn LOD tiles at a stereographic point, registered by PolarTiles. */
let capHeight: ((pole: "s" | "n", x: number, y: number) => number | null) | null = null;
export function setCapHeightProvider(fn: typeof capHeight) {
  capHeight = fn;
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
    const capXY = (lat: number, lon: number) => {
      const colat = 90 - Math.abs(lat);
      const rho = 2 * MOON_R_M * Math.tan((colat * Math.PI) / 360);
      const lr = (lon * Math.PI) / 180;
      return { x: rho * Math.sin(lr), y: lat < 0 ? rho * Math.cos(lr) : -rho * Math.cos(lr) };
    };
    const capRadiusXY = (south: boolean, x: number, y: number) => {
      const cap = (south ? capS : capN)!;
      const cm = south ? caps.cap_s : caps.cap_n;
      const u = 0.5 + x / (2 * cm.half_size_m);
      const v = 0.5 + y / (2 * cm.half_size_m);
      const g = bilinear(cap, u * (cap.w - 1), (1 - v) * (cap.h - 1), false);
      const h = cm.height_min_m + g * (cm.height_max_m - cm.height_min_m);
      return 1 + (h / MOON_R_M) * RELIEF_EXAGGERATION;
    };
    const hasCap = (lat: number) => Boolean(lat < 0 ? capS && caps.cap_s : capN && caps.cap_n);
    // GPU displacement: texel centres at (i + 0.5) / size, flipY → row 0 is the north edge
    const bandRadius = (lat: number, lon: number) => {
      const u = (lon + 180) / 360;
      const v = 0.5 + lat / 180;
      const g = bilinear(global, u * global.w - 0.5, (1 - v) * global.h - 0.5, true);
      return 1 + DISP_BIAS + DISP_SCALE * g;
    };
    const radius = (lat: number, lon: number) => {
      if (Math.abs(lat) >= CAP_EDGE_LAT && hasCap(lat)) {
        const { x, y } = capXY(lat, lon);
        return capRadiusXY(lat < 0, x, y);
      }
      return bandRadius(lat, lon);
    };
    const edge = bandEdgeLat(Boolean(capS && caps.cap_s));
    const [BW, BH] = BAND_SEGMENTS;
    const ext = capExtentM();
    const D = Math.PI / 180;
    const dirOf = (lat: number, lon: number) => [Math.cos(lat * D) * Math.cos(lon * D), Math.sin(lat * D), -Math.cos(lat * D) * Math.sin(lon * D)];
    const vert = (lat: number, lon: number, r: number) => dirOf(lat, lon).map((c) => c * r);
    /** Distance from the centre along `u` to the plane of triangle (p, q, w): the drawn surface. */
    const onTriangle = (u: number[], p: number[], q: number[], w: number[]) => {
      const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const e2 = [w[0] - p[0], w[1] - p[1], w[2] - p[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      return (n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) / (n[0] * u[0] + n[1] * u[1] + n[2] * u[2]);
    };
    const capVert = (south: boolean, x: number, y: number) => {
      const rho = Math.hypot(x, y);
      const colat = (2 * Math.atan(rho / (2 * MOON_R_M))) / D;
      const lat = (south ? -1 : 1) * (90 - colat);
      const lon = Math.atan2(x, south ? y : -y) / D;
      return vert(lat, lon, capRadiusXY(south, x, y));
    };
    const rendered = (lat: number, lon: number) => {
      const u = dirOf(lat, lon);
      if (Math.abs(lat) >= CAP_EDGE_LAT && capHeight) {
        const { x, y } = capXY(lat, lon);
        const h = capHeight(lat < 0 ? "s" : "n", x, y);
        if (h !== null) return 1 + (h / MOON_R_M) * RELIEF_EXAGGERATION;
      }
      if (Math.abs(lat) >= CAP_EDGE_LAT && hasCap(lat)) {
        // PolarCap grid: quad (i, j) → triangles (a, b, a+1) and (a+1, b, b+1), a = (i, j), b = (i+1, j)
        const south = lat < 0;
        const { x, y } = capXY(lat, lon);
        const fj = ((x + ext) / (2 * ext)) * CAP_GRID;
        const fi = ((ext - y) / (2 * ext)) * CAP_GRID;
        const j = Math.floor(fj);
        const i = Math.floor(fi);
        const at = (ii: number, jj: number) => capVert(south, -ext + (2 * ext * jj) / CAP_GRID, ext - (2 * ext * ii) / CAP_GRID);
        const A = at(i, j);
        const A1 = at(i, j + 1);
        const B = at(i + 1, j);
        const B1 = at(i + 1, j + 1);
        return fj - j + (fi - i) < 1 ? onTriangle(u, A, B, A1) : onTriangle(u, A1, B, B1);
      }
      // band SphereGeometry: quad a = (iy, ix+1), b = (iy, ix), c = (iy+1, ix), d = (iy+1, ix+1) → (a, b, d), (b, c, d)
      const dLat = (2 * edge) / BH;
      const dLon = 360 / BW;
      const fi = Math.max(0, Math.min(BH - 1e-6, (edge - lat) / dLat));
      const fj = (lon + 180) / dLon;
      const i = Math.floor(fi);
      const j = Math.floor(fj);
      const at = (ii: number, jj: number) => {
        const la = edge - ii * dLat;
        const lo = -180 + jj * dLon;
        return vert(la, lo, bandRadius(la, lo));
      };
      const a = at(i, j + 1);
      const b2 = at(i, j);
      const c = at(i + 1, j);
      const d = at(i + 1, j + 1);
      return fj - j > fi - i ? onTriangle(u, a, b2, d) : onTriangle(u, b2, c, d);
    };
    return { radius, rendered };
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
