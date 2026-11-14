"use client";

import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { api } from "@/lib/api";
import { bearingToEN, enuToScene, fmtDist, sunVectorLocal } from "@/lib/geo";
import { useEval, useSelected, useStore } from "@/lib/store";
import type { AISiteMap, BackupSite, Evaluation, TerrainPatch } from "@/lib/types";
import { seqColor } from "./ai/palette";
import { TIER_COLOR, VERDICT } from "@/lib/ui";

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
      if (aiMap?.available) {
        const east = (i % n) * step - t.half_size_m;
        const north = t.half_size_m - Math.floor(i / n) * step;
        c.set(seqColor(sampleAI(aiMap, east, north)));
      } else if (slopeTint) slopeColor(t.slopes[i], c);
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

function Pin({ pos, color, label, sub, big = false, onClick, active }: { pos: [number, number, number]; color: string; label: string; sub?: string; big?: boolean; onClick?: () => void; active?: boolean }) {
  const h = big ? 0.55 : 0.35;
  return (
    <group position={pos}>
      <Line points={[new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]} color={color} lineWidth={2} />
      <mesh position={[0, h, 0]} onClick={onClick}>
        <sphereGeometry args={[big ? 0.06 : 0.04, 20, 20]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Html position={[0, h + 0.08, 0]} center distanceFactor={7} zIndexRange={[10, 0]}>
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

function Scene({ t, ev, aiMap }: { t: TerrainPatch; ev: Evaluation; aiMap: AISiteMap | null }) {
  const focusBackup = useStore((s) => s.focusBackup);
  const real = useStore((s) => s.realLighting);
  const setFocusBackup = useStore((s) => s.setFocusBackup);
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
  const zone = 300;
  const divert = ev.divert?.radius_m ?? 3000;

  const backupPos = (b: BackupSite): [number, number, number] => {
    const [e, n] = bearingToEN(b.distance_m, b.bearing_deg);
    return enuToScene(e, n, sampleHeight(t, e, n) * V_EXAG);
  };

  return (
    <>
      <color attach="background" args={["#010208"]} />
      <Stars radius={60} depth={30} count={3000} factor={3} fade />
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

      {/* primary landing zone */}
      <Ring radiusM={zone} y={y0 + 0.02} color="#22d3ee" />
      <Ring radiusM={divert} y={y0 + 0.02} color="#e2e8f0" dashed opacity={0.45} />
      <Pin pos={[0, y0, 0]} color={VERDICT[ev.verdict].color} label="PRIMARY" sub={`${Math.round(ev.overall)}`} big />

      {ev.backups?.map((b) => {
        const p = backupPos(b);
        const color = TIER_COLOR[b.tier];
        const active = focusBackup === b.id;
        return (
          <group key={b.id}>
            <Line
              points={[new THREE.Vector3(0, y0 + 0.3, 0), new THREE.Vector3(p[0] / 2, Math.max(y0, p[1]) + 0.5, p[2] / 2), new THREE.Vector3(p[0], p[1] + 0.3, p[2])]}
              color={color}
              lineWidth={active ? 3 : 1.5}
              dashed
              dashSize={0.06}
              gapSize={0.04}
              transparent
              opacity={active ? 1 : 0.65}
            />
            <Ring radiusM={150} y={p[1] + 0.015} color={color} opacity={0.9} />
            <group position={[p[0], 0, p[2]]}>
              <Pin
                pos={[0, p[1], 0]}
                color={color}
                label={b.id}
                sub={`${fmtDist(b.distance_m)} · ${Math.round(b.overall)}`}
                active={active}
                onClick={() => setFocusBackup(active ? null : b.id)}
              />
            </group>
          </group>
        );
      })}

      {/* north arrow and Earth direction */}
      <Html position={[0, y0, -size / 2 - 0.25]} center>
        <div className="text-xs font-bold tracking-widest text-white/70">N</div>
      </Html>
      <Html position={earthDir.clone().multiplyScalar(size * 0.6).add(new THREE.Vector3(0, y0, 0))} center>
        <div className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${eEl > 0 ? "bg-sky-500/20 text-sky-200" : "bg-white/5 text-white/40"}`}>
          ◉ Earth {eEl.toFixed(0)}°
        </div>
      </Html>
      <Html position={sunDir.clone().multiplyScalar(size * 0.6).add(new THREE.Vector3(0, y0, 0))} center>
        <div className="whitespace-nowrap rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">☀ Sun {el.toFixed(1)}°</div>
      </Html>

      <OrbitControls target={[0, y0, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={0.8} maxDistance={size * 2.5} enableDamping />
    </>
  );
}

export default function SiteView() {
  const site = useSelected();
  const ev = useEval(site?.id);
  const divert = useStore((s) => s.divertRadius);
  const landingTime = useStore((s) => s.landingTime);
  const showAiMap = useStore((s) => s.showAiMap);
  const [patch, setPatch] = useState<TerrainPatch | null>(null);
  const [aiMap, setAiMap] = useState<AISiteMap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!site || !patch || !showAiMap) {
      setAiMap(null);
      useStore.setState({ aiMapStatus: null });
      return;
    }
    let live = true;
    useStore.setState({ aiMapStatus: "loading" });
    api
      .siteMap(site.lat, site.lon, landingTime, patch.half_size_m, 25)
      .then((m) => {
        if (!live) return;
        setAiMap(m.available ? m : null);
        useStore.setState({ aiMapStatus: m.available ? "ready" : null });
      })
      .catch(() => live && useStore.setState({ aiMapStatus: null }));
    return () => {
      live = false;
    };
  }, [site, patch, landingTime, showAiMap]);

  useEffect(() => {
    if (!site) return;
    let live = true;
    setPatch(null);
    setErr(null);
    api
      .terrain(site.lat, site.lon, Math.max(2000, divert * 1.35), 181)
      .then((p) => live && setPatch(p))
      .catch((e) => live && setErr(String(e)));
    return () => {
      live = false;
    };
  }, [site, divert]);

  useEffect(() => {
    useStore.setState({ siteStatus: !site ? "Select a candidate to inspect the site" : err ? `Terrain error: ${err}` : !ev || !patch ? "Loading terrain…" : null });
  }, [site, ev, patch, err]);

  if (!site || !ev || !patch) return null;
  return <Scene t={patch} ev={ev} aiMap={aiMap} />;
}
