"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { latLonToVec3, offsetLatLon } from "@/lib/geo";
import { halfSizeOf, hourOf, regionKey, useStore } from "@/lib/store";
import type { LandingZone, RegionSummary, Site } from "@/lib/types";
import { seqColor } from "../ai/palette";

const LIFT_POLAR = 1.0105; // above the exaggerated polar relief
const LIFT = 1.0065;
const lift = (lat: number) => (Math.abs(lat) > 80 ? LIFT_POLAR : LIFT);

/** Square region footprint as a subdivided patch on the sphere. */
function footprintGeometry(lat: number, lon: number, half: number, n = 10) {
  const pos: number[] = [];
  const idx: number[] = [];
  const r = lift(lat);
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const e = -half + (2 * half * j) / n;
      const no = half - (2 * half * i) / n;
      const ll = offsetLatLon(lat, lon, e, no);
      const v = latLonToVec3(ll.lat, ll.lon, r);
      pos.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j;
      idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function outlinePoints(lat: number, lon: number, half: number, per = 12) {
  const c: [number, number][] = [
    [-half, half],
    [half, half],
    [half, -half],
    [-half, -half],
    [-half, half],
  ];
  const r = lift(lat) + 0.0004;
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++)
    for (let s = 0; s <= per; s++) {
      const ll = offsetLatLon(lat, lon, c[k][0] + ((c[k + 1][0] - c[k][0]) * s) / per, c[k][1] + ((c[k + 1][1] - c[k][1]) * s) / per);
      pts.push(latLonToVec3(ll.lat, ll.lon, r));
    }
  return pts;
}

/** Visible when the point faces the camera and the camera is within `maxDist` (sphere units). */
function useVisibleFrom(p: THREE.Vector3, maxDist: number) {
  const [vis, setVis] = useState(false);
  const { camera } = useThree();
  const last = useRef(false);
  useFrame(() => {
    const toCam = camera.position.clone().sub(p);
    const facing = toCam.dot(p.clone().normalize()) > 0.08 * toCam.length();
    const v = facing && toCam.length() < maxDist;
    if (v !== last.current) {
      last.current = v;
      setVis(v);
    }
  });
  return vis;
}

function summaryText(s?: RegionSummary) {
  if (!s) return { text: "…", tone: "text-white/50" };
  if (!s.available) return { text: "no AI data", tone: "text-white/40" };
  if ((s.viable_km2 ?? 0) <= 0) return { text: "closed now", tone: "text-white/45" };
  return { text: `${s.viable_km2 && s.viable_km2 >= 10 ? Math.round(s.viable_km2) : s.viable_km2} km² open`, tone: "text-sky-200" };
}

const RegionFootprint = memo(function RegionFootprint({ site, summary, selected, labelSlot }: { site: Site; summary?: RegionSummary; selected: boolean; labelSlot: boolean }) {
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState(false);
  const half = halfSizeOf(site);
  const geom = useMemo(() => footprintGeometry(site.lat, site.lon, half), [site.lat, site.lon, half]);
  const outline = useMemo(() => outlinePoints(site.lat, site.lon, half), [site.lat, site.lon, half]);
  const centre = useMemo(() => latLonToVec3(site.lat, site.lon, lift(site.lat) + 0.0005), [site.lat, site.lon]);
  const share = summary?.available ? (summary.viable_share ?? 0) : 0;
  const fill = summary?.available ? seqColor(0.15 + share * 0.85) : "#475569";
  const st = summaryText(summary);
  const showLabel = selected || hover || labelSlot;
  return (
    <group>
      <mesh
        geometry={geom}
        onClick={(e) => {
          e.stopPropagation();
          select(site.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = "";
        }}
      >
        <meshBasicMaterial color={fill} transparent opacity={selected ? 0.72 : hover ? 0.62 : 0.45 + share * 0.25} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Line points={outline} color={selected ? "#22d3ee" : hover ? "#ffffff" : "#cbd5e1"} lineWidth={selected ? 2.6 : hover ? 2 : 1.2} transparent opacity={selected ? 1 : 0.75} />
      {showLabel && (
        <Html position={centre} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className={`-translate-y-7 whitespace-nowrap rounded-md border px-2 py-1 text-center shadow-lg ${selected ? "border-cyan-300/60 bg-slate-950/95" : "border-white/10 bg-slate-950/85"}`}>
            <div className={`text-[11px] font-semibold leading-tight ${selected ? "text-cyan-100" : "text-white"}`}>{site.name}</div>
            <div className={`text-[10px] font-medium leading-tight tabular-nums ${st.tone}`}>{st.text}</div>
          </div>
        </Html>
      )}
    </group>
  );
});

function ZoneDot({ z, primary }: { z: LandingZone; primary: boolean }) {
  const p = useMemo(() => latLonToVec3(z.lat, z.lon, lift(z.lat) + 0.0008), [z.lat, z.lon]);
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const near = useVisibleFrom(p, 0.35);
  useFrame(() => ref.current && ref.current.scale.setScalar(Math.min(1, Math.max(0.002, camera.position.distanceTo(p) * 0.9))));
  if (!near) return null;
  const color = primary ? "#22d3ee" : "#e2e8f0";
  return (
    <group ref={ref} position={p}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[primary ? 0.008 : 0.0055, 14, 14]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Html center style={{ pointerEvents: "none" }} zIndexRange={[40, 0]}>
        <div className="-translate-y-4 whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-bold" style={{ background: color, color: "#020617" }}>
          {z.id} {Math.round(z.mean_success * 100)}%
        </div>
      </Html>
    </group>
  );
}

function SelectedZones() {
  const zones = useStore((s) => {
    const site = s.sites.find((x) => x.id === s.selectedId);
    const r = site ? s.regions[regionKey(site.id, s.landingTime, halfSizeOf(site))] : undefined;
    return r?.available ? r.zones : undefined;
  });
  const paths = useMemo(() => {
    if (!zones || zones.length < 2) return [];
    const a = zones[0];
    return zones.slice(1).map((z) => {
      const pa = latLonToVec3(a.lat, a.lon, lift(a.lat) + 0.0006);
      const pb = latLonToVec3(z.lat, z.lon, lift(z.lat) + 0.0006);
      const mid = pa.clone().add(pb).multiplyScalar(0.5).normalize().multiplyScalar(lift(a.lat) + 0.0006 + pa.distanceTo(pb) * 0.25);
      return { id: z.id, pts: new THREE.QuadraticBezierCurve3(pa, mid, pb).getPoints(16) };
    });
  }, [zones]);
  if (!zones) return null;
  return (
    <group>
      {paths.map((p) => (
        <Line key={p.id} points={p.pts} color="#e2e8f0" lineWidth={1.2} dashed dashSize={0.0012} gapSize={0.0008} transparent opacity={0.7} />
      ))}
      {zones.map((z) => (
        <ZoneDot key={z.id} z={z} primary={z.rank === 1} />
      ))}
    </group>
  );
}

/**
 * Label decluttering: project every region label to the screen each frame and place them greedily
 * (selected first, then by open area); labels that would overlap a placed one are hidden until hovered.
 */
function useLabelSlots(regions: Site[], summaries: Record<string, RegionSummary> | undefined, selectedId: string | null) {
  const { camera, size } = useThree();
  const [slots, setSlots] = useState<Set<string>>(new Set());
  const last = useRef("");
  const anchors = useMemo(() => regions.map((r) => ({ id: r.id, p: latLonToVec3(r.lat, r.lon, lift(r.lat) + 0.0005) })), [regions]);
  useFrame(() => {
    const order = [...anchors].sort((a, b) => {
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      return (summaries?.[b.id]?.viable_km2 ?? -1) - (summaries?.[a.id]?.viable_km2 ?? -1);
    });
    const placed: { x: number; y: number }[] = [];
    const ok: string[] = [];
    const W = 150;
    const H = 38;
    for (const a of order) {
      const toCam = camera.position.clone().sub(a.p);
      if (toCam.dot(a.p.clone().normalize()) < 0.08 * toCam.length() || toCam.length() > 1.6) continue;
      const v = a.p.clone().project(camera);
      if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || v.z > 1) continue;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      if (placed.some((q) => Math.abs(q.x - x) < W && Math.abs(q.y - y) < H)) continue;
      placed.push({ x, y });
      ok.push(a.id);
    }
    const key = ok.sort().join(",");
    if (key !== last.current) {
      last.current = key;
      setSlots(new Set(ok));
    }
  });
  return slots;
}

export default function RegionLayer() {
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedId);
  const summaries = useStore((s) => s.summaries[hourOf(s.landingTime)]);
  const regions = useMemo(() => sites.filter((s) => s.group !== "Historic landing"), [sites]);
  const slots = useLabelSlots(regions, summaries, selectedId);
  return (
    <group>
      {regions.map((s) => (
        <RegionFootprint key={s.id} site={s} summary={summaries?.[s.id]} selected={s.id === selectedId} labelSlot={slots.has(s.id)} />
      ))}
      <SelectedZones />
    </group>
  );
}
