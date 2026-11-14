"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { latLonToVec3, offsetLatLon } from "@/lib/geo";
import { type Surface, useSurface } from "@/lib/heights";
import { toWorld } from "@/lib/moonFrame";
import { halfSizeOf, hourOf, regionKey, useStore } from "@/lib/store";
import type { LandingZone, RegionSummary, Site } from "@/lib/types";
import { seqColor } from "../ai/palette";

// Overlays sit just above the rendered terrain (sphere units; 0.0003 ≈ 0.5 km at 2x relief)
const ON_SURFACE = 0.00035;

const onSurface = (S: Surface, lat: number, lon: number, extra = 0) => latLonToVec3(lat, lon, S.radius(lat, lon) + ON_SURFACE + extra);

/** Square region footprint draped on the terrain. */
function footprintGeometry(S: Surface, lat: number, lon: number, half: number, n = 14) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const ll = offsetLatLon(lat, lon, -half + (2 * half * j) / n, half - (2 * half * i) / n);
      const v = onSurface(S, ll.lat, ll.lon);
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
  return g;
}

function outlinePoints(S: Surface, lat: number, lon: number, half: number, per = 20) {
  const c: [number, number][] = [
    [-half, half],
    [half, half],
    [half, -half],
    [-half, -half],
    [-half, half],
  ];
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++)
    for (let s = 0; s <= per; s++) {
      const ll = offsetLatLon(lat, lon, c[k][0] + ((c[k + 1][0] - c[k][0]) * s) / per, c[k][1] + ((c[k + 1][1] - c[k][1]) * s) / per);
      pts.push(onSurface(S, ll.lat, ll.lon, 0.0002));
    }
  return pts;
}

/** True when a Moon-local point faces the camera and is within `maxDist` (sphere units). */
function facing(camera: THREE.Camera, local: THREE.Vector3, maxDist: number) {
  const w = toWorld(local);
  const toCam = camera.position.clone().sub(w);
  return toCam.dot(w.clone().normalize()) > 0.08 * toCam.length() && toCam.length() < maxDist;
}

const LIMIT_TEXT: Record<string, string> = {
  sunlight: "in shadow",
  power: "too little sun for power",
  earth_link: "no Earth link",
  terrain: "terrain too steep",
};

function summaryText(s?: RegionSummary) {
  if (!s) return { text: "assessing…", tone: "text-white/50" };
  if (!s.available) return { text: "outside AI coverage", tone: "text-white/40" };
  if ((s.viable_km2 ?? 0) <= 0) return { text: `No safe landing now · ${LIMIT_TEXT[s.limiting ?? "terrain"]}`, tone: "text-amber-200/80" };
  const km2 = s.viable_km2! >= 10 ? Math.round(s.viable_km2!) : s.viable_km2;
  return { text: `${Math.round((s.viable_share ?? 0) * 100)}% landable · ${km2} km²`, tone: "text-sky-200" };
}

const RegionFootprint = memo(function RegionFootprint({ S, site, summary, selected, labelSlot }: { S: Surface; site: Site; summary?: RegionSummary; selected: boolean; labelSlot: boolean }) {
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState(false);
  const half = halfSizeOf(site);
  const geom = useMemo(() => footprintGeometry(S, site.lat, site.lon, half), [S, site.lat, site.lon, half]);
  const outline = useMemo(() => outlinePoints(S, site.lat, site.lon, half), [S, site.lat, site.lon, half]);
  const centre = useMemo(() => onSurface(S, site.lat, site.lon, 0.0004), [S, site.lat, site.lon]);
  const share = summary?.available ? (summary.viable_share ?? 0) : 0;
  const fill = summary?.available ? seqColor(0.15 + share * 0.85) : "#475569";
  const st = summaryText(summary);
  const showLabel = selected || hover || labelSlot;
  return (
    <group>
      <mesh
        geometry={geom}
        renderOrder={3}
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
        <meshBasicMaterial
          color={fill}
          transparent
          opacity={selected ? 0.62 : hover ? 0.55 : 0.32 + share * 0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Line points={outline} color={selected ? "#22d3ee" : hover ? "#ffffff" : "#cbd5e1"} lineWidth={selected ? 2.6 : hover ? 2 : 1.2} transparent opacity={selected ? 1 : 0.8} renderOrder={4} />
      {showLabel && (
        <Html position={centre} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className={`-translate-y-7 whitespace-nowrap rounded-md border px-2 py-1 text-center shadow-lg ${selected ? "border-cyan-300/60 bg-slate-950/95" : "border-white/10 bg-slate-950/90"}`}>
            <div className={`text-[11px] font-semibold leading-tight ${selected ? "text-cyan-100" : "text-white"}`}>{site.name}</div>
            <div className={`text-[10px] font-medium leading-tight tabular-nums ${st.tone}`}>{st.text}</div>
          </div>
        </Html>
      )}
    </group>
  );
});

function ZoneDot({ S, z, primary }: { S: Surface; z: LandingZone; primary: boolean }) {
  const p = useMemo(() => onSurface(S, z.lat, z.lon, 0.0004), [S, z.lat, z.lon]);
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const [near, setNear] = useState(false);
  useFrame(() => {
    const n = facing(camera, p, 0.4);
    if (n !== near) setNear(n);
    if (ref.current) ref.current.scale.setScalar(Math.min(1, Math.max(0.002, camera.position.distanceTo(toWorld(p)) * 0.9)));
  });
  const color = primary ? "#22d3ee" : "#e2e8f0";
  return (
    <group ref={ref} position={p} visible={near}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[primary ? 0.008 : 0.0055, 14, 14]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {near && (
        <Html center style={{ pointerEvents: "none" }} zIndexRange={[40, 0]}>
          <div className="-translate-y-4 whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-bold" style={{ background: color, color: "#020617" }}>
            {z.id} {Math.round(z.mean_success * 100)}%
          </div>
        </Html>
      )}
    </group>
  );
}

function SelectedZones({ S }: { S: Surface }) {
  const zones = useStore((s) => {
    const site = s.sites.find((x) => x.id === s.selectedId);
    const r = site ? s.regions[regionKey(site.id, s.landingTime, halfSizeOf(site))] : undefined;
    return r?.available ? r.zones : undefined;
  });
  const paths = useMemo(() => {
    if (!zones || zones.length < 2) return [];
    const a = zones[0];
    const pa = onSurface(S, a.lat, a.lon, 0.0003);
    return zones.slice(1).map((z) => {
      const pb = onSurface(S, z.lat, z.lon, 0.0003);
      const mid = pa.clone().add(pb).multiplyScalar(0.5);
      mid.setLength(Math.max(pa.length(), pb.length()) + pa.distanceTo(pb) * 0.2);
      return { id: z.id, pts: new THREE.QuadraticBezierCurve3(pa, mid, pb).getPoints(20) };
    });
  }, [S, zones]);
  if (!zones) return null;
  return (
    <group>
      {paths.map((p) => (
        <Line key={p.id} points={p.pts} color="#e2e8f0" lineWidth={1.2} dashed dashSize={0.0012} gapSize={0.0008} transparent opacity={0.75} />
      ))}
      {zones.map((z) => (
        <ZoneDot key={z.id} S={S} z={z} primary={z.rank === 1} />
      ))}
    </group>
  );
}

/**
 * Label decluttering: project every region label to the screen and place them greedily
 * (selected first, then by landable area); labels that would overlap a placed one are hidden
 * until hovered. Runs at most ~6x per second, not every frame.
 */
function useLabelSlots(S: Surface, regions: Site[], summaries: Record<string, RegionSummary> | undefined, selectedId: string | null) {
  const { camera, size } = useThree();
  const [slots, setSlots] = useState<Set<string>>(new Set());
  const last = useRef("");
  const tick = useRef(0);
  const anchors = useMemo(() => regions.map((r) => ({ id: r.id, p: onSurface(S, r.lat, r.lon, 0.0004) })), [S, regions]);
  useFrame((_, dt) => {
    tick.current += dt;
    if (tick.current < 0.16) return;
    tick.current = 0;
    const order = [...anchors].sort((a, b) => {
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      return (summaries?.[b.id]?.viable_km2 ?? -1) - (summaries?.[a.id]?.viable_km2 ?? -1);
    });
    const placed: { x: number; y: number }[] = [];
    const ok: string[] = [];
    for (const a of order) {
      if (!facing(camera, a.p, 1.6)) continue;
      const v = toWorld(a.p).project(camera);
      if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || v.z > 1) continue;
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      if (placed.some((q) => Math.abs(q.x - x) < 170 && Math.abs(q.y - y) < 40)) continue;
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

function Regions({ S }: { S: Surface }) {
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedId);
  const summaries = useStore((s) => s.summaries[hourOf(s.landingTime)]);
  const regions = useMemo(() => sites.filter((s) => s.group !== "Historic landing"), [sites]);
  const slots = useLabelSlots(S, regions, summaries, selectedId);
  return (
    <group>
      {regions.map((s) => (
        <RegionFootprint key={s.id} S={S} site={s} summary={summaries?.[s.id]} selected={s.id === selectedId} labelSlot={slots.has(s.id)} />
      ))}
      <SelectedZones S={S} />
    </group>
  );
}

/** Must be rendered inside the Moon-local group (see moonFrame.ts). */
export default function RegionLayer() {
  const S = useSurface();
  return S ? <Regions S={S} /> : null;
}
