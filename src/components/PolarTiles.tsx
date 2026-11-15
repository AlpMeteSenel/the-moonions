"use client";

import { useLoader, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { create } from "zustand";
import { API_URL, texture } from "@/lib/api";
import { latLonToVec3 } from "@/lib/geo";
import { RELIEF_EXAGGERATION, setCapHeightProvider } from "@/lib/heights";
import { toWorld } from "@/lib/moonFrame";
import { BACKEND_HEADERS, HeaderTextureLoader } from "@/lib/net";
import { holeMaterial } from "@/lib/siteFrame";

/**
 * Level-of-detail polar caps from the backend's LOLA quadtree tiles (/api/tiles): only the tiles in
 * view are loaded, at the detail the camera distance needs (down to 20 m at the south pole).
 * A tile stays on screen until all its visible children have arrived; skirts hide level cracks.
 */

export interface PoleTiles {
  half_size_m: number;
  segments: number;
  max_level: number;
  finest_m: number;
}

const R = 1737400;
const SPLIT = 2.6; // split a tile when the camera is closer than SPLIT x its size
const MAX_INFLIGHT = 6;
const MAX_CACHED = 600;
const CAP_KEEP_LAT = 79.85; // a hair past the globe band edge so there is no gap

type Tile = { key: string; z: number; x: number; y: number; state: "idle" | "loading" | "ready" | "failed"; geom?: THREE.BufferGeometry; dn?: Int16Array; used: number };

const rhoOf = (absLat: number) => 2 * R * Math.tan(((90 - absLat) * Math.PI) / 360);

function toLatLon(south: boolean, x: number, y: number) {
  const rho = Math.hypot(x, y);
  const colat = (2 * Math.atan(rho / (2 * R)) * 180) / Math.PI;
  return { lat: (south ? -1 : 1) * (90 - colat), lon: (Math.atan2(x, south ? y : -y) * 180) / Math.PI };
}

/** Tile heights → mesh (positions, outward normals from the 1-sample border, cap UVs, skirts). */
function buildGeometry(dn: Int16Array, south: boolean, z: number, tx: number, ty: number, half: number, n: number) {
  const g = n + 3;
  const size = (2 * half) / 2 ** z;
  const sp = size / n;
  const x0 = -half + tx * size;
  const y0 = half - ty * size;
  // all (n+3)^2 positions (incl. border) in double precision
  const P = new Float64Array(g * g * 3);
  for (let i = 0; i < g; i++) {
    const y = y0 - (i - 1) * sp;
    for (let j = 0; j < g; j++) {
      const x = x0 + (j - 1) * sp;
      const { lat, lon } = toLatLon(south, x, y);
      const r = 1 + ((dn[i * g + j] * 0.5) / R) * RELIEF_EXAGGERATION;
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      const k = (i * g + j) * 3;
      P[k] = r * Math.cos(la) * Math.cos(lo);
      P[k + 1] = r * Math.sin(la);
      P[k + 2] = -r * Math.cos(la) * Math.sin(lo);
    }
  }
  const m = n + 1; // inner vertices per edge
  const edge = 4 * n; // skirt vertices (perimeter)
  const count = m * m + edge;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      const gi = i + 1;
      const gj = j + 1;
      const k = (gi * g + gj) * 3;
      const v = i * m + j;
      pos[v * 3] = P[k];
      pos[v * 3 + 1] = P[k + 1];
      pos[v * 3 + 2] = P[k + 2];
      // central differences across the border-extended grid → seamless normals
      const kr = (gi * g + gj + 1) * 3;
      const kl = (gi * g + gj - 1) * 3;
      const kd = ((gi + 1) * g + gj) * 3;
      const ku = ((gi - 1) * g + gj) * 3;
      a.set(P[kr] - P[kl], P[kr + 1] - P[kl + 1], P[kr + 2] - P[kl + 2]);
      b.set(P[ku] - P[kd], P[ku + 1] - P[kd + 1], P[ku + 2] - P[kd + 2]);
      c.crossVectors(a, b).normalize();
      if (c.x * P[k] + c.y * P[k + 1] + c.z * P[k + 2] < 0) c.negate();
      nrm[v * 3] = c.x;
      nrm[v * 3 + 1] = c.y;
      nrm[v * 3 + 2] = c.z;
      const x = x0 + j * sp;
      const y = y0 - i * sp;
      uv[v * 2] = 0.5 + x / (2 * half);
      uv[v * 2 + 1] = 0.5 + y / (2 * half);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = i * m + j;
      idx.push(v, v + m, v + 1, v + 1, v + m, v + m + 1);
    }
  }
  // skirt: walk the perimeter, drop a copy of each edge vertex towards the centre of the Moon
  const ring: number[] = [];
  for (let j = 0; j < n; j++) ring.push(j);
  for (let i = 0; i < n; i++) ring.push(i * m + n);
  for (let j = n; j > 0; j--) ring.push(n * m + j);
  for (let i = n; i > 0; i--) ring.push(i * m);
  const drop = 1 - Math.max(sp * 6, 60) / R * RELIEF_EXAGGERATION;
  ring.forEach((v, s) => {
    const w = m * m + s;
    for (let q = 0; q < 3; q++) {
      pos[w * 3 + q] = pos[v * 3 + q] * drop;
      nrm[w * 3 + q] = nrm[v * 3 + q];
    }
    uv[w * 2] = uv[v * 2];
    uv[w * 2 + 1] = uv[v * 2 + 1];
  });
  for (let s = 0; s < ring.length; s++) {
    const v0 = ring[s];
    const v1 = ring[(s + 1) % ring.length];
    const w0 = m * m + s;
    const w1 = m * m + ((s + 1) % ring.length);
    idx.push(v0, w0, v1, v1, w0, w1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeBoundingSphere();
  return geom;
}

/** Bumped (throttled) whenever tiles load, so overlays that sit on the terrain can re-fit. */
export const useTileEpoch = create<{ epoch: number }>(() => ({ epoch: 0 }));
let epochTimer: ReturnType<typeof setTimeout> | null = null;
function bumpEpoch() {
  if (epochTimer) return;
  epochTimer = setTimeout(() => {
    epochTimer = null;
    useTileEpoch.setState((s) => ({ epoch: s.epoch + 1 }));
  }, 400);
}

/** Area (stereographic metres) to load at full detail regardless of camera distance: the 3D site region. */
const focus: Record<string, { x: number; y: number; half: number } | null> = {};
export function setTileFocus(pole: "s" | "n", f: { x: number; y: number; half: number } | null) {
  focus[pole] = f;
  useTileEpoch.setState((s) => ({ epoch: s.epoch + 1 }));
}

/** Whether a pole is drawn from tiles (the 3D site view then uses them instead of a separate patch). */
export const hasTiles = (pole: "s" | "n") => Boolean(registries[pole]);

/** Finest loaded tile height (m, true scale) at a stereographic point, or null: lets overlays sit on the tiles. */
const registries: Record<string, { half: number; n: number; maxZ: number; tiles: Map<string, Tile> }> = {};
export function tileHeightAt(pole: "s" | "n", x: number, y: number): number | null {
  const reg = registries[pole];
  if (!reg) return null;
  for (let z = reg.maxZ; z >= 0; z--) {
    const size = (2 * reg.half) / 2 ** z;
    const tx = Math.floor((x + reg.half) / size);
    const ty = Math.floor((reg.half - y) / size);
    const t = reg.tiles.get(`${z}/${tx}/${ty}`);
    if (t?.state !== "ready" || !t.dn) continue;
    const g = reg.n + 3;
    const fj = ((x - (-reg.half + tx * size)) / size) * reg.n + 1;
    const fi = (((reg.half - ty * size) - y) / size) * reg.n + 1;
    const j = Math.min(g - 2, Math.max(0, Math.floor(fj)));
    const i = Math.min(g - 2, Math.max(0, Math.floor(fi)));
    const u = fj - j;
    const v = fi - i;
    const h = (ii: number, jj: number) => t.dn![ii * g + jj] * 0.5;
    return (h(i, j) * (1 - u) + h(i, j + 1) * u) * (1 - v) + (h(i + 1, j) * (1 - u) + h(i + 1, j + 1) * u) * v;
  }
  return null;
}

export default function PolarTiles({ pole, info, overlay }: { pole: "s" | "n"; info: PoleTiles; overlay: THREE.Texture | null }) {
  const south = pole === "s";
  const { camera, invalidate } = useThree();
  const color = useLoader(HeaderTextureLoader, texture(`cap_${pole}_color.jpg`));
  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 4;
  }, [color]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: color, roughness: 0.96, metalness: 0 });
    holeMaterial(m, true);
    return m;
  }, [color]);
  const overlayMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    holeMaterial(m);
    return m;
  }, []);
  useEffect(() => {
    overlayMat.map = overlay;
    overlayMat.needsUpdate = true;
    invalidate();
  }, [overlay, overlayMat, invalidate]);

  const tiles = useRef(new Map<string, Tile>());
  const inflight = useRef(0);
  const version = useRef(0);
  const last = useRef({ m: new THREE.Matrix4(), v: -1, e: -1 });
  const [visible, setVisible] = useState<string[]>([]);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const pm = useMemo(() => new THREE.Matrix4(), []);
  const sphere = useMemo(() => new THREE.Sphere(), []);

  useEffect(() => {
    registries[pole] = { half: info.half_size_m, n: info.segments, maxZ: info.max_level, tiles: tiles.current };
    setCapHeightProvider(tileHeightAt);
    const all = tiles.current;
    return () => {
      for (const t of all.values()) t.geom?.dispose();
      all.clear();
      delete registries[pole];
    };
  }, [pole, info]);

  const load = (t: Tile) => {
    t.state = "loading";
    inflight.current++;
    fetch(`${API_URL}/api/tiles/${pole}/${t.z}/${t.x}/${t.y}.bin`, { headers: BACKEND_HEADERS })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((buf) => {
        t.dn = new Int16Array(buf);
        t.geom = buildGeometry(t.dn, south, t.z, t.x, t.y, info.half_size_m, info.segments);
        t.state = "ready";
        bumpEpoch();
      })
      .catch(() => {
        t.state = "failed";
      })
      .finally(() => {
        inflight.current--;
        version.current++;
        invalidate();
      });
  };

  useFrame(() => {
    camera.updateMatrixWorld();
    const ep = useTileEpoch.getState().epoch;
    if (last.current.v === version.current && last.current.m.equals(camera.matrixWorld) && last.current.e === ep) return;
    last.current.e = ep;
    last.current.m.copy(camera.matrixWorld);
    last.current.v = version.current;

    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pm);
    const cam = camera.position;
    const half = info.half_size_m;
    const rhoKeep = rhoOf(CAP_KEEP_LAT);
    const now = performance.now();
    const out: string[] = [];
    const want: { t: Tile; pri: number }[] = [];

    const get = (z: number, x: number, y: number) => {
      const key = `${z}/${x}/${y}`;
      let t = tiles.current.get(key);
      if (!t) {
        t = { key, z, x, y, state: "idle", used: now };
        tiles.current.set(key, t);
      }
      t.used = now;
      return t;
    };
    const geo = (z: number, x: number, y: number) => {
      const size = (2 * half) / 2 ** z;
      const x0 = -half + x * size;
      const y1 = half - y * size;
      // nearest point of the tile to the pole: is the tile inside the cap at all?
      const nx = Math.max(x0, Math.min(0, x0 + size));
      const ny = Math.max(y1 - size, Math.min(0, y1));
      if (Math.hypot(nx, ny) > rhoKeep) return null;
      const { lat, lon } = toLatLon(south, x0 + size / 2, y1 - size / 2);
      const c = toWorld(latLonToVec3(lat, lon, 1));
      return { c, r: (size / R) * 0.75 + 0.009, sizeU: size / R };
    };
    const ready = (t: Tile) => t.state === "ready";
    const request = (t: Tile, pri: number) => {
      if (t.state === "idle") want.push({ t, pri });
    };

    const select = (z: number, x: number, y: number): void => {
      const gg = geo(z, x, y);
      if (!gg) return;
      sphere.set(gg.c, gg.r);
      if (z > 0 && !frustum.intersectsSphere(sphere)) return;
      const t = get(z, x, y);
      const d = Math.max(0, cam.distanceTo(gg.c) - gg.r);
      if (!ready(t)) {
        request(t, z * 10 + d);
        return;
      }
      const f = focus[pole];
      const size = (2 * half) / 2 ** z;
      const fx0 = -half + x * size;
      const fy1 = half - y * size;
      const inFocus = Boolean(f && fx0 < f.x + f.half && fx0 + size > f.x - f.half && fy1 > f.y - f.half && fy1 - size < f.y + f.half);
      if (z < info.max_level && (d < SPLIT * gg.sizeU || inFocus)) {
        const kids: [number, number, number][] = [];
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const k = geo(z + 1, 2 * x + dx, 2 * y + dy);
          if (!k) continue;
          sphere.set(k.c, k.r);
          if (!frustum.intersectsSphere(sphere)) continue;
          kids.push([z + 1, 2 * x + dx, 2 * y + dy]);
        }
        const kt = kids.map(([a, b, c]) => get(a, b, c));
        if (kt.length && kt.every((k) => ready(k) || k.state === "failed")) {
          kids.forEach(([a, b, c], i) => (kt[i].state === "failed" ? out.push(t.key) : select(a, b, c)));
          return;
        }
        kt.forEach((k) => request(k, (z + 1) * 10 + d));
      }
      out.push(t.key);
    };
    select(0, 0, 0);

    // start the most urgent loads (coarse and near first)
    want.sort((p, q) => p.pri - q.pri);
    for (const { t } of want) {
      if (inflight.current >= MAX_INFLIGHT) break;
      if (t.state !== "idle") continue;
      load(t);
    }
    // evict least-recently-used tiles that are not on screen
    if (tiles.current.size > MAX_CACHED) {
      const shown = new Set(out);
      const old = [...tiles.current.values()].filter((t) => !shown.has(t.key) && t.state !== "loading").sort((p, q) => p.used - q.used);
      for (const t of old.slice(0, tiles.current.size - MAX_CACHED)) {
        t.geom?.dispose();
        tiles.current.delete(t.key);
      }
    }
    const uniq = [...new Set(out)];
    setVisible((prev) => (prev.length === uniq.length && prev.every((k, i) => k === uniq[i]) ? prev : uniq));
  });

  return (
    <group>
      {visible.map((key) => {
        const t = tiles.current.get(key);
        if (!t?.geom) return null;
        return (
          <group key={key}>
            <mesh geometry={t.geom} material={material} raycast={() => null} castShadow receiveShadow />
            {overlay && <mesh geometry={t.geom} material={overlayMat} raycast={() => null} renderOrder={2} />}
          </group>
        );
      })}
    </group>
  );
}
