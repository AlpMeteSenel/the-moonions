"use client";

import { Html, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { fmtDist, latLonToVec3, offsetLatLon, sunVectorLocal } from "@/lib/geo";
import { landerState, TRACKER_SITE_ID, usePose } from "@/lib/pose";
import { type Surface, useSurface } from "@/lib/heights";
import { toWorld } from "@/lib/moonFrame";
import { DRAPE, HOLE, KM, MOON_R_KM, patchHalfM, type SiteFrame, useSiteFrame } from "@/lib/siteFrame";
import { setTileFocus, useTileEpoch, useTileShadows, useTilesInfo } from "./PolarTiles";

const BLANK_TEX = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
BLANK_TEX.needsUpdate = true;
import { DEFAULT_HALF_SIZE, halfSizeOf, useEval, useRegion, useSelected, useStore } from "@/lib/store";
import type { AISiteMap, Evaluation, LandingZone, RegionAnalysis, TerrainPatch } from "@/lib/types";
import { landColor } from "./ai/palette";
import { ZONE_BACKUP, ZONE_PRIMARY } from "./ai/RegionVerdict";
import { VERDICT } from "@/lib/ui";

const V_EXAG = 2.0; // vertical exaggeration so relief reads at km scale

function slopeColor(s: number, out: THREE.Color) {
  // safe → marginal → unsafe, aligned with the 8° / 15° lander limits
  const stops: [number, THREE.Color][] = [
    [0, new THREE.Color("#7f8c8d")],
    [4, new THREE.Color("#9aa5a6")],
    [8, new THREE.Color("#d6b45a")],
    [12, new THREE.Color("#e07b39")],
    [18, new THREE.Color("#c0392b")],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (s <= b) return out.copy(ca).lerp(cb, Math.max(0, (s - a) / (b - a)));
  }
  return out.copy(stops[stops.length - 1][1]);
}

function sampleHeight(t: TerrainPatch, east: number, north: number) {
  const n = t.size;
  const step = (2 * t.half_size_m) / (n - 1);
  const c = (east + t.half_size_m) / step;
  const r = (t.half_size_m - north) / step;
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c)));
  const r0 = Math.max(0, Math.min(n - 2, Math.floor(r)));
  const fc = Math.min(1, Math.max(0, c - c0));
  const fr = Math.min(1, Math.max(0, r - r0));
  const h = (rr: number, cc: number) => t.heights[rr * n + cc];
  const top = h(r0, c0) * (1 - fc) + h(r0, c0 + 1) * fc;
  const bot = h(r0 + 1, c0) * (1 - fc) + h(r0 + 1, c0 + 1) * fc;
  return top * (1 - fr) + bot * fr;
}

/** Bilinear sample of the AI map (row 0 = north) at a local east/north offset (m). */
function sampleAI(m: AISiteMap, east: number, north: number) {
  const n = m.cells;
  const step = (2 * m.half_size_m) / (n - 1);
  const c = Math.min(n - 1.001, Math.max(0, (east + m.half_size_m) / step));
  const r = Math.min(n - 1.001, Math.max(0, (m.half_size_m - north) / step));
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const fc = c - c0;
  const fr = r - r0;
  const v = (rr: number, cc: number) => m.success[rr * n + cc];
  return (v(r0, c0) * (1 - fc) + v(r0, c0 + 1) * fc) * (1 - fr) + (v(r0 + 1, c0) * (1 - fc) + v(r0 + 1, c0 + 1) * fc) * fr;
}

function TerrainMesh({ t, slopeTint, aiMap }: { t: TerrainPatch; slopeTint: boolean; aiMap: AISiteMap | null }) {
  const geom = useMemo(() => {
    const size = (2 * t.half_size_m) / 1000;
    const g = new THREE.PlaneGeometry(size, size, t.size - 1, t.size - 1);
    g.rotateX(-Math.PI / 2); // plane now in XZ; first row at z = -size/2 (north)
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const land = new THREE.Color();
    const n = t.size;
    const step = (2 * t.half_size_m) / (n - 1);
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (t.heights[i] * V_EXAG) / 1000);
      const east = (i % n) * step - t.half_size_m;
      const north = t.half_size_m - Math.floor(i / n) * step;
      if (aiMap?.available && Math.abs(east) <= aiMap.half_size_m && Math.abs(north) <= aiMap.half_size_m) {
        // bare terrain where a landing would fail, green where it would succeed
        const { rgb, a } = landColor(sampleAI(aiMap, east, north));
        c.set("#8a8d91").lerp(land.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace), a);
      } else if (slopeTint) {
        slopeColor(t.slopes[i], c);
        if (aiMap?.available) c.multiplyScalar(0.55); // outside the region: dimmed context
      }
      else c.set("#8a8d91");
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [t, slopeTint, aiMap]);
  // Skirt: a wall hanging from the patch edge down below any nearby globe surface, so the seam
  // between the detailed patch and the (coarser) globe around its hole never shows a gap.
  const skirt = useMemo(() => {
    const n = t.size;
    const half = t.half_size_m / 1000;
    const step = (2 * half) / (n - 1);
    let lo = Infinity;
    for (const h of t.heights) lo = Math.min(lo, h);
    const bottom = ((lo - 3000) * V_EXAG) / 1000;
    // edge vertex indices, walking the border once around
    const ring: number[] = [];
    for (let c = 0; c < n; c++) ring.push(c);
    for (let r = 1; r < n; r++) ring.push(r * n + n - 1);
    for (let c = n - 2; c >= 0; c--) ring.push((n - 1) * n + c);
    for (let r = n - 2; r > 0; r--) ring.push(r * n);
    ring.push(0);
    const pos = new Float32Array(ring.length * 2 * 3);
    ring.forEach((i, k) => {
      const x = (i % n) * step - half;
      const z = Math.floor(i / n) * step - half;
      pos.set([x, (t.heights[i] * V_EXAG) / 1000, z, x, bottom, z], k * 6);
    });
    const idx: number[] = [];
    for (let k = 0; k < ring.length - 1; k++) {
      const a = 2 * k;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [t]);
  return (
    <>
      <mesh geometry={geom} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} flatShading={false} />
      </mesh>
      <mesh geometry={skirt}>
        <meshStandardMaterial color="#5b5f66" roughness={1} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function Ring({ radiusM, y, color, dashed = false, opacity = 0.8 }: { radiusM: number; y: number; color: string; dashed?: boolean; opacity?: number }) {
  const pts = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      out.push(new THREE.Vector3((Math.sin(a) * radiusM) / 1000, y, (-Math.cos(a) * radiusM) / 1000));
    }
    return out;
  }, [radiusM, y]);
  return <Line points={pts} color={color} lineWidth={1.5} dashed={dashed} dashSize={0.08} gapSize={0.05} transparent opacity={opacity} />;
}

function Pin({ pos, color, label, sub, big = false, onClick, active, scale = 1 }: { pos: [number, number, number]; color: string; label: string; sub?: string; big?: boolean; onClick?: () => void; active?: boolean; scale?: number }) {
  const h = (big ? 0.55 : 0.35) * scale;
  return (
    <group position={pos}>
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]} color={color} lineWidth={2} />
      <mesh position={[0, h, 0]} onClick={onClick}>
        <sphereGeometry args={[(big ? 0.06 : 0.04) * scale, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Html position={[0, h + 0.08 * scale, 0]} center zIndexRange={[10, 0]}>
        <button
          onClick={onClick}
          className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[12px] font-semibold shadow-lg transition ${active ? "scale-110" : ""}`}
          style={{ borderColor: color, color: "#fff", background: "rgba(2,6,23,0.75)" }}
        >
          {label}
          {sub && <span className="ml-1.5 font-normal text-white/70">{sub}</span>}
        </button>
      </Html>
    </group>
  );
}

function RegionOutline({ half, y }: { half: number; y: (e: number, n: number) => number }) {
  const pts = useMemo(() => {
    const out: THREE.Vector3[] = [];
    const corners: [number, number][] = [
      [-half, half],
      [half, half],
      [half, -half],
      [-half, -half],
      [-half, half],
    ];
    for (let c = 0; c < 4; c++) {
      const [e0, n0] = corners[c];
      const [e1, n1] = corners[c + 1];
      for (let k = 0; k <= 40; k++) {
        const e = e0 + ((e1 - e0) * k) / 40;
        const n = n0 + ((n1 - n0) * k) / 40;
        out.push(new THREE.Vector3(e / 1000, y(e, n) + 0.04, -n / 1000));
      }
    }
    return out;
  }, [half, y]);
  return <Line points={pts} color="#e2e8f0" lineWidth={1.5} dashed dashSize={0.15} gapSize={0.1} transparent opacity={0.7} />;
}

function ZoneMarker({ z, ellipse, y, primary, active, onClick, scale }: { z: LandingZone; ellipse: number; y: number; primary: boolean; active: boolean; onClick: () => void; scale: number }) {
  const color = primary ? ZONE_PRIMARY : ZONE_BACKUP;
  const pos: [number, number, number] = [z.east_m / 1000, 0, -z.north_m / 1000];
  return (
    <group position={pos}>
      <Ring radiusM={ellipse} y={y + 0.03} color={color} opacity={active || primary ? 1 : 0.8} />
      <Ring radiusM={Math.min(z.margin_m, ellipse * 4)} y={y + 0.03} color={color} dashed opacity={0.35} />
      <Pin pos={[0, y, 0]} color={color} label={z.id} sub={`${Math.round(z.mean_success * 100)}% here`} big={primary} active={active} onClick={onClick} scale={scale} />
    </group>
  );
}

/**
 * Ease the patch's outer margin into the globe surface as it is actually drawn (the globe mesh is
 * far coarser than the patch), so the patch meets the globe without a step or a gap. The region
 * itself (inside the margin) keeps its true heights.
 */
function blendIntoGlobe(t: TerrainPatch, site: { lat: number; lon: number }, frame: SiteFrame, surface: Surface, regionHalfM: number): TerrainPatch {
  const n = t.size;
  const half = t.half_size_m;
  const step = (2 * half) / (n - 1);
  const margin = Math.max(half - regionHalfM, half * 0.08);
  const rC = frame.center.length();
  const R = MOON_R_KM * 1000;
  const out = new Float32Array(t.heights.length);
  for (let i = 0; i < out.length; i++) {
    const east = (i % n) * step - half;
    const north = half - Math.floor(i / n) * step;
    const e = half - Math.max(Math.abs(east), Math.abs(north)); // distance to the patch edge
    if (e >= margin) {
      out[i] = t.heights[i];
      continue;
    }
    const ll = offsetLatLon(site.lat, site.lon, east, north);
    const a = Math.hypot(east, north) / R;
    // the globe's height above the patch's tangent plane, back in un-exaggerated metres
    const g = ((surface.rendered(ll.lat, ll.lon) * Math.cos(a) - rC) * R) / V_EXAG;
    const x = Math.max(0, e / margin);
    const w = x * x * (3 - 2 * x);
    out[i] = g + (t.heights[i] - g) * w;
  }
  return { ...t, heights: Array.from(out) };
}

const LANDER = "#f472b6";

/** The tracked lander in the site scene (km units; terrain and altitude both ×V_EXAG). */
function SiteLander({ halfM, yAt, scale }: { halfM: number; yAt: (e: number, n: number) => number; scale: number }) {
  const st = landerState(usePose(), halfM);
  if (!st) return null;
  const x = st.east_m / 1000;
  const z = -st.north_m / 1000;
  const g = yAt(st.east_m, st.north_m);
  const y = g + ((st.alt_m ?? 0) * V_EXAG) / 1000 + 0.05 * scale;
  const k = 0.24 * scale;
  return (
    <group>
      <Line points={[new THREE.Vector3(x, g, z), new THREE.Vector3(x, y, z)]} color={LANDER} lineWidth={1.5} dashed dashSize={0.06} gapSize={0.04} transparent opacity={0.8} />
      <group position={[x, g + 0.02, z]}>
        <Ring radiusM={k * 1500} y={0} color={LANDER} dashed opacity={0.7} />
      </group>
      <group position={[x, y, z]} rotation={[0, st.heading_deg !== null ? (-st.heading_deg * Math.PI) / 180 : 0, 0]} scale={k}>
        <mesh castShadow>
          <cylinderGeometry args={[0.45, 0.55, 0.6, 8]} />
          <meshStandardMaterial color="#e5e7eb" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.4, 0.3, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.45, 0]}>
          <coneGeometry args={[0.22, 0.3, 12]} />
          <meshBasicMaterial color={LANDER} toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const a = (i * Math.PI) / 2 + Math.PI / 4;
          return (
            <Line key={i} points={[new THREE.Vector3(Math.cos(a) * 0.45, -0.2, Math.sin(a) * 0.45), new THREE.Vector3(Math.cos(a) * 0.9, -0.75, Math.sin(a) * 0.9)]} color="#e5e7eb" lineWidth={2} />
          );
        })}
        {st.heading_deg !== null && (
          <mesh position={[0, 0.05, -0.75]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.15, 0.35, 3]} />
            <meshBasicMaterial color={LANDER} toneMapped={false} />
          </mesh>
        )}
      </group>
      <Html position={[x, y + 1.3 * k, z]} center zIndexRange={[12, 0]}>
        <div className="whitespace-nowrap rounded-md border border-pink-300/50 bg-slate-950/85 px-2 py-0.5 text-[12px] font-semibold text-pink-200 shadow-lg">
          Lander{st.alt_m !== null && <span className="ml-1.5 font-normal text-white/75">{fmtDist(st.alt_m)} up</span>}
        </div>
      </Html>
    </group>
  );
}

function sunOf(ev: Evaluation, real: boolean) {
  const sunF = ev.factors.find((f) => f.key === "sunlight");
  const az = Number(sunF?.details.sun_azimuth_deg);
  const el = Number(sunF?.details.sun_elevation_deg);
  // Real light: the true Sun direction (grazing at the poles). Otherwise a high, readable light.
  return { el, dir: real ? sunVectorLocal(az, el) : sunVectorLocal(az, 45) };
}

function Scene({ t, ev, aiMap, region, frame, siteId, halfM, sizeKm, yAt }: { t: TerrainPatch | null; ev: Evaluation; aiMap: AISiteMap | null; region?: RegionAnalysis; frame: SiteFrame; siteId: string; halfM: number; sizeKm: number; yAt: (e: number, n: number) => number }) {
  const real = useStore((s) => s.realLighting);
  const focusZone = useStore((s) => s.focusZone);
  const setFocusZone = useStore((s) => s.setFocusZone);
  const { el, dir: sunDir } = sunOf(ev, real);
  const earthF = ev.factors.find((f) => f.key === "earth");
  const eAz = Number(earthF?.details.earth_azimuth_deg);
  const eEl = Number(earthF?.details.earth_elevation_deg);
  const earthDir = sunVectorLocal(eAz, eEl);
  const size = sizeKm;
  const y0 = yAt(0, 0);
  const zones = region?.available ? region.zones : [];
  const z1 = zones[0];

  return (
    <group matrix={frame.matrix} matrixAutoUpdate={false}>
      {t && <TerrainMesh t={t} slopeTint aiMap={aiMap} />}

      {region?.available && <RegionOutline half={region.half_size_m} y={yAt} />}

      {zones.map((z) => (
        <ZoneMarker
          key={z.id}
          z={z}
          ellipse={region!.ellipse_radius_m}
          y={yAt(z.east_m, z.north_m)}
          primary={z.rank === 1}
          active={focusZone === z.id}
          onClick={() => setFocusZone(focusZone === z.id ? null : z.id)}
          scale={Math.max(1, size / 6)}
        />
      ))}
      {z1 &&
        zones.slice(1).map((z) => {
          const a = new THREE.Vector3(z1.east_m / 1000, yAt(z1.east_m, z1.north_m) + 0.3, -z1.north_m / 1000);
          const b = new THREE.Vector3(z.east_m / 1000, yAt(z.east_m, z.north_m) + 0.3, -z.north_m / 1000);
          const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, a.distanceTo(b) * 0.12, 0));
          const active = focusZone === z.id;
          return <Line key={z.id} points={[a, mid, b]} color={ZONE_BACKUP} lineWidth={active ? 2.5 : 1.2} dashed dashSize={0.12} gapSize={0.08} transparent opacity={active ? 0.95 : 0.45} />;
        })}

      {siteId === TRACKER_SITE_ID && <SiteLander halfM={halfM} yAt={yAt} scale={Math.max(1, size / 6)} />}

      {!region?.available && <Pin pos={[0, y0, 0]} color={VERDICT[ev.verdict].color} label="CENTRE" sub={`${Math.round(ev.overall)}`} big />}

      {/* north arrow and Earth / Sun directions */}
      <Html position={[0, y0, -size / 2 - size * 0.03]} center zIndexRange={[10, 0]}>
        <div className="text-xs font-bold tracking-widest text-white/70">N</div>
      </Html>
      <Html position={earthDir.clone().multiplyScalar(size * 0.6).add(new THREE.Vector3(0, y0, 0))} center zIndexRange={[10, 0]}>
        <div className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${eEl > 0 ? "bg-sky-500/20 text-sky-200" : "bg-white/5 text-white/40"}`}>
          ◉ Earth {eEl.toFixed(0)}°
        </div>
      </Html>
      <Html position={sunDir.clone().multiplyScalar(size * 0.6).add(new THREE.Vector3(0, y0, 0))} center zIndexRange={[10, 0]}>
        <div className="whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">☀ Sun {el.toFixed(1)}°</div>
      </Html>

    </group>
  );
}

const aiMapFor = (show: boolean, region?: RegionAnalysis) => show && Boolean(region?.available) && Boolean(region?.success?.length);

export function SiteLayer() {
  const site = useSelected();
  const ev = useEval(site?.id);
  const region = useRegion(site?.id);
  const showAiMap = useStore((s) => s.showAiMap);
  const [patch, setPatch] = useState<TerrainPatch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const half = site ? halfSizeOf(site) : DEFAULT_HALF_SIZE;
  const frame = useSiteFrame(site);
  const surface = useSurface();
  const invalidate = useThree((s) => s.invalidate);
  // polar sites: the LOD tiles are the terrain (down to 20 m); elsewhere a detailed patch is set into the globe
  const tilesInfo = useTilesInfo((s) => s.info);
  const tiled = Boolean(site && Math.abs(site.lat) >= 80.3 && tilesInfo?.[site.lat < 0 ? "s" : "n"]);
  useEffect(() => {
    useTileShadows.setState({ on: tiled });
    return () => useTileShadows.setState({ on: false });
  }, [tiled]);
  const epoch = useTileEpoch((s) => s.epoch);
  const fitted = useMemo(() => (!tiled && patch && frame && surface && site ? blendIntoGlobe(patch, site, frame, surface, half) : null), [tiled, patch, frame, surface, site, half]);
  const sizeKm = site ? (2 * patchHalfM(site)) / 1000 : 0;
  // overlay heights (km above the frame centre, same exaggeration as the terrain)
  const yAt = useMemo(() => {
    if (fitted) return (e: number, n: number) => (sampleHeight(fitted, e, n) * V_EXAG) / 1000;
    if (!tiled || !site || !frame || !surface) return null;
    const rC = frame.center.length();
    return (e: number, n: number) => {
      const ll = offsetLatLon(site.lat, site.lon, e, n);
      const a = Math.hypot(e, n) / (MOON_R_KM * 1000);
      return (surface.rendered(ll.lat, ll.lon) * Math.cos(a) - rC) * MOON_R_KM;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted, tiled, site, frame, surface, epoch]);

  // the AI map painted onto the tiles inside the region
  const drapeTex = useMemo(() => {
    if (!tiled || !aiMapFor(showAiMap, region)) return null; // no AI map: the shader shows slope colours
    const r = region!;
    const n = r.cells;
    const data = new Uint8Array(n * n * 4);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const { rgb, a } = landColor(r.success[row * n + col]);
        const k = ((n - 1 - row) * n + col) * 4; // texture row 0 = south
        data[k] = rgb[0];
        data[k + 1] = rgb[1];
        data[k + 2] = rgb[2];
        data[k + 3] = Math.round(a * 255);
      }
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [tiled, showAiMap, region]);
  // colour the tiles like the site patch (AI map in the region, slope tint around it), and load
  // the site area at full tile detail whatever the camera distance
  useEffect(() => {
    if (!tiled || !frame || !site) return;
    const regionHalf = region?.available ? region.half_size_m : half;
    DRAPE.uDrapeTex.value = drapeTex ?? BLANK_TEX;
    DRAPE.uDrapeAi.value = drapeTex ? 1 : 0;
    DRAPE.uDrapeC.value.copy(frame.center);
    DRAPE.uDrapeE.value.copy(frame.east);
    DRAPE.uDrapeN.value.copy(frame.north);
    DRAPE.uDrapeHalf.value = (regionHalf / 1000) * KM;
    DRAPE.uDrapeOuter.value = patchHalfM(site) / regionHalf;
    DRAPE.uDrapeOn.value = 1;
    invalidate();
    return () => {
      DRAPE.uDrapeOn.value = 0;
      drapeTex?.dispose();
      invalidate();
    };
  }, [tiled, drapeTex, frame, region, site, half, invalidate]);
  useEffect(() => {
    if (!tiled || !site) return;
    const pole = site.lat < 0 ? "s" : "n";
    const rho = 2 * MOON_R_KM * 1000 * Math.tan(((90 - Math.abs(site.lat)) * Math.PI) / 360);
    const lr = (site.lon * Math.PI) / 180;
    setTileFocus(pole, { x: rho * Math.sin(lr), y: pole === "s" ? rho * Math.cos(lr) : -rho * Math.cos(lr), half: patchHalfM(site) * 1.05 });
    invalidate();
    return () => setTileFocus(pole, null);
  }, [tiled, site, invalidate]);

  const aiMap = useMemo<AISiteMap | null>(
    () => (showAiMap && region?.available ? { available: true, half_size_m: region.half_size_m, cells: region.cells, success: region.success, touchdown: region.touchdown } : null),
    [showAiMap, region],
  );

  useEffect(() => {
    useStore.setState({ aiMapStatus: !showAiMap ? null : aiMap ? "ready" : region === undefined ? "loading" : null });
  }, [aiMap, region, showAiMap]);

  useEffect(() => {
    if (!site || tiled) return;
    let live = true;
    setPatch(null);
    setErr(null);
    api
      .terrain(site.lat, site.lon, patchHalfM(site), 201)
      .then((p) => live && setPatch(p))
      .catch((e) => live && setErr(String(e)));
    return () => {
      live = false;
    };
  }, [site, half, tiled]);

  useEffect(() => {
    useStore.setState({ siteStatus: !site ? "Select a candidate to inspect the site" : err ? `Terrain error: ${err}` : !ev || (!tiled && !patch) ? "Loading terrain…" : null });
  }, [site, ev, patch, err, tiled]);

  // cut the globe open where the detailed patch sits, once it is there to fill the hole
  useEffect(() => {
    if (!frame || !fitted) return;
    HOLE.uHoleC.value.copy(frame.center);
    HOLE.uHoleE.value.copy(frame.east);
    HOLE.uHoleN.value.copy(frame.north);
    HOLE.uHoleHalf.value = (fitted.half_size_m / 1000) * KM * 0.985;
    HOLE.uHoleOn.value = 1;
    invalidate();
    return () => {
      HOLE.uHoleOn.value = 0;
      invalidate();
    };
  }, [frame, fitted, invalidate]);

  if (!site || !ev || !frame || !yAt || (!tiled && !fitted)) return null;
  return <Scene t={fitted} ev={ev} aiMap={aiMap} region={region} frame={frame} siteId={site.id} halfM={half} sizeKm={sizeKm} yAt={yAt} />;
}

/** The site's Sun (world space), casting terrain shadows over the patch. */
export function SiteSun() {
  const site = useSelected();
  const ev = useEval(site?.id);
  const real = useStore((s) => s.realLighting);
  const track = useStore((s) => s.sun);
  const frame = useSiteFrame(site);
  const target = useMemo(() => new THREE.Object3D(), []);
  if (!site || !frame) return <ambientLight intensity={0.25} color="#9db4ff" />;
  const size = ((2 * patchHalfM(site)) / 1000) * KM;
  const at = toWorld(frame.center);
  let sun = ev ? sunOf(ev, real) : { el: 20, dir: sunVectorLocal(90, 45) };
  let dirWorld = toWorld(sun.dir.clone().applyMatrix4(new THREE.Matrix4().extractRotation(frame.matrix)));
  if (real && track) {
    // true Sun direction from the time track: follows scrubbing and playback with no request
    const up = toWorld(frame.up);
    dirWorld = toWorld(latLonToVec3(track.sun_lat, track.sun_lon, 1)).normalize();
    const el = (Math.asin(Math.max(-1, Math.min(1, dirWorld.dot(up)))) * 180) / Math.PI;
    sun = { el, dir: sun.dir };
    if (el < 1.5) dirWorld.addScaledVector(up, Math.sin(((1.5 - el) * Math.PI) / 180)).normalize();
  }
  target.position.copy(at);
  target.updateMatrixWorld();
  return (
    <>
      <primitive object={target} />
      <directionalLight
        target={target}
        position={at.clone().addScaledVector(dirWorld, size * 2)}
        intensity={real ? (sun.el > -1 ? 3.2 : 0.5) : 2.4}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-near={size * 0.05}
        shadow-camera-far={size * 6}
        shadow-bias={-0.00005}
        // offset along the surface normal by ~1.5 shadow texels: no self-shadowing stripes on the tiles
        shadow-normalBias={((2 * size) / 4096) * 1.5}
      />
      {/* sky fill from the site's zenith (stands in for the old hemisphere light) */}
      <directionalLight position={at.clone().addScaledVector(toWorld(frame.up), size * 2)} target={target} intensity={real ? 0.7 : 1.1} color="#c7d2fe" />
      <ambientLight intensity={real ? 0.25 : 0.4} color="#c7d2fe" />
    </>
  );
}
