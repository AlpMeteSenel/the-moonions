"use client";

import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { sunVectorLocal } from "@/lib/geo";
import { DEFAULT_HALF_SIZE, halfSizeOf, useEval, useRegion, useSelected, useStore } from "@/lib/store";
import type { AISiteMap, Evaluation, LandingZone, RegionAnalysis, TerrainPatch } from "@/lib/types";
import { seqColor } from "./ai/palette";
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
    const n = t.size;
    const step = (2 * t.half_size_m) / (n - 1);
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (t.heights[i] * V_EXAG) / 1000);
      const east = (i % n) * step - t.half_size_m;
      const north = t.half_size_m - Math.floor(i / n) * step;
      if (aiMap?.available && Math.abs(east) <= aiMap.half_size_m && Math.abs(north) <= aiMap.half_size_m) {
        c.set(seqColor(sampleAI(aiMap, east, north)));
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
  return (
    <mesh geometry={geom} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} flatShading={false} />
    </mesh>
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

function RegionOutline({ t, half, y }: { t: TerrainPatch; half: number; y: (e: number, n: number) => number }) {
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
  void t;
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

/** Frame the whole region from above its highest terrain, looking at its mid height
 *  (terrain heights are relative to the region centre, so the centre alone says little). */
function FrameCamera({ size, t }: { size: number; t: TerrainPatch }) {
  const { camera, invalidate } = useThree();
  const { top, mid } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const h of t.heights) {
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return { top: (hi * V_EXAG) / 1000, mid: ((lo + hi) / 2) * (V_EXAG / 1000) };
  }, [t]);
  useEffect(() => {
    camera.position.set(size * 0.12, top + size * 0.7, size * 0.62);
    camera.lookAt(0, mid, 0);
    invalidate();
  }, [camera, size, top, mid, invalidate]);
  return null;
}

function Scene({ t, ev, aiMap, region }: { t: TerrainPatch; ev: Evaluation; aiMap: AISiteMap | null; region?: RegionAnalysis }) {
  const real = useStore((s) => s.realLighting);
  const focusZone = useStore((s) => s.focusZone);
  const setFocusZone = useStore((s) => s.setFocusZone);
  const sunF = ev.factors.find((f) => f.key === "sunlight");
  const az = Number(sunF?.details.sun_azimuth_deg ?? 90);
  const el = Number(sunF?.details.sun_elevation_deg ?? 20);
  // Real light: the true Sun direction (grazing at the poles). Otherwise a high, readable light.
  const sunDir = real ? sunVectorLocal(az, Math.max(el, 1.5)) : sunVectorLocal(az, 45);
  const earthF = ev.factors.find((f) => f.key === "earth");
  const eAz = Number(earthF?.details.earth_azimuth_deg ?? 0);
  const eEl = Number(earthF?.details.earth_elevation_deg ?? 10);
  const earthDir = sunVectorLocal(eAz, eEl);
  const size = (2 * t.half_size_m) / 1000;
  const y0 = (sampleHeight(t, 0, 0) * V_EXAG) / 1000;
  const yAt = useMemo(() => (e: number, n: number) => (sampleHeight(t, e, n) * V_EXAG) / 1000, [t]);
  const zones = region?.available ? region.zones : [];
  const z1 = zones[0];

  return (
    <>
      <color attach="background" args={["#010208"]} />
      <Stars radius={size * 6} depth={size * 3} count={3000} factor={3} fade />
      <FrameCamera size={size} t={t} />
      <directionalLight
        position={sunDir.clone().multiplyScalar(size * 2)}
        intensity={real ? (el > -1 ? 3.2 : 0.5) : 2.2}
        color="#fff6e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-near={0.1}
        shadow-camera-far={size * 6}
        shadow-bias={-0.0005}
      />
      <hemisphereLight args={["#c7d2fe", "#1a1a22", real ? 0.55 : 0.9]} />
      <TerrainMesh t={t} slopeTint aiMap={aiMap} />

      {region?.available && <RegionOutline t={t} half={region.half_size_m} y={yAt} />}

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

      <OrbitControls target={[0, y0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={size * 0.08} maxDistance={size * 2.5} enableDamping />
    </>
  );
}

export default function SiteView() {
  const site = useSelected();
  const ev = useEval(site?.id);
  const region = useRegion(site?.id);
  const showAiMap = useStore((s) => s.showAiMap);
  const [patch, setPatch] = useState<TerrainPatch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const half = site ? halfSizeOf(site) : DEFAULT_HALF_SIZE;

  const aiMap = useMemo<AISiteMap | null>(
    () => (showAiMap && region?.available ? { available: true, half_size_m: region.half_size_m, cells: region.cells, success: region.success, touchdown: region.touchdown } : null),
    [showAiMap, region],
  );

  useEffect(() => {
    useStore.setState({ aiMapStatus: !showAiMap ? null : aiMap ? "ready" : region === undefined ? "loading" : null });
  }, [aiMap, region, showAiMap]);

  useEffect(() => {
    if (!site) return;
    let live = true;
    setPatch(null);
    setErr(null);
    api
      .terrain(site.lat, site.lon, Math.max(2000, half * 1.12), 201)
      .then((p) => live && setPatch(p))
      .catch((e) => live && setErr(String(e)));
    return () => {
      live = false;
    };
  }, [site, half]);

  useEffect(() => {
    useStore.setState({ siteStatus: !site ? "Select a candidate to inspect the site" : err ? `Terrain error: ${err}` : !ev || !patch ? "Loading terrain…" : null });
  }, [site, ev, patch, err]);

  if (!site || !ev || !patch) return null;
  return <Scene t={patch} ev={ev} aiMap={aiMap} region={region} />;
}
