"use client";

import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { memo, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { latLonToVec3, offsetLatLon } from "@/lib/geo";
import { type Surface, useSurface } from "@/lib/heights";
import { toWorld } from "@/lib/moonFrame";
import { halfSizeOf, hourOf, regionKey, useStore } from "@/lib/store";
import type { LandingZone, RegionAnalysis, RegionSummary, Site } from "@/lib/types";
import { LIMITED_VIABLE_SHARE, MIN_VIABLE_SHARE, regionAssessment, sharePercent } from "@/lib/regionAssessment";
import { landSolid } from "../ai/palette";

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
  terrain: "terrain constraints",
};

type Look = { verdict: "go" | "caution" | "no-go" | null; short: string; detail: string };

/** Map label + verdict. Uses the full region analysis when loaded, else the fast 1.5 km summary. */
export function regionLook(summary: RegionSummary | undefined, detail: RegionAnalysis | undefined): Look {
  if (detail?.available) {
    const a = regionAssessment(detail);
    const share = detail.stats.viable_share;
    const km2 = detail.stats.viable_km2 >= 10 ? Math.round(detail.stats.viable_km2) : detail.stats.viable_km2;
    if (a.verdict === "no-go") return { verdict: a.verdict, short: a.short, detail: detail.stats.viable_km2 > 0 ? `only ${sharePercent(share)} viable` : "no viable area" };
    return { verdict: a.verdict, short: a.short, detail: `${sharePercent(share)} · ${km2} km²` };
  }
  if (!summary) return { verdict: null, short: "Assessing", detail: "…" };
  if (!summary.available) return { verdict: null, short: "No AI data", detail: "outside coverage" };
  const share = summary.viable_share ?? 0;
  const km2 = (summary.viable_km2 ?? 0) >= 10 ? Math.round(summary.viable_km2!) : summary.viable_km2;
  if (share <= MIN_VIABLE_SHARE) return { verdict: "no-go", short: "Poor", detail: (summary.viable_km2 ?? 0) > 0 ? `only ${sharePercent(share)} viable` : LIMIT_TEXT[summary.limiting ?? "terrain"] };
  if (share < LIMITED_VIABLE_SHARE) return { verdict: "caution", short: "Limited", detail: `${sharePercent(share)} · ${km2} km²` };
  return { verdict: "go", short: "Viable", detail: `${sharePercent(share)} · ${km2} km²` };
}

const OUTLINE: Record<string, string> = { go: "#e2e8f0", caution: "#fbbf24", "no-go": "#f87171" };
const LABEL_TONE: Record<string, string> = { go: "text-sky-200", caution: "text-amber-200", "no-go": "text-red-300" };

const RegionFootprint = memo(function RegionFootprint({ S, site, summary, selected, labelSlot }: { S: Surface; site: Site; summary?: RegionSummary; selected: boolean; labelSlot: boolean }) {
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState(false);
  const half = halfSizeOf(site);
  const detail = useStore((s) => s.regions[regionKey(site.id, s.landingTime, half)]);
  const look = regionLook(summary, detail);
  const geom = useMemo(() => footprintGeometry(S, site.lat, site.lon, half), [S, site.lat, site.lon, half]);
  const outline = useMemo(() => outlinePoints(S, site.lat, site.lon, half), [S, site.lat, site.lon, half]);
  // label sits just above the region's north edge, so it never covers the landing zones inside
  const anchor = useMemo(() => {
    const ll = offsetLatLon(site.lat, site.lon, 0, half);
    return onSurface(S, ll.lat, ll.lon, 0.0004);
  }, [S, site.lat, site.lon, half]);
  const share = detail?.available ? detail.stats.viable_share : summary?.available ? (summary.viable_share ?? 0) : 0;
  const poor = look.verdict === "no-go";
  const fill = look.verdict === null ? "#475569" : poor ? "#64748b" : landSolid(0.55 + share * 0.45);
  const fillOpacity = poor ? 0.16 : selected ? 0.6 : hover ? 0.52 : 0.3 + share * 0.3;
  const lineColor = selected ? "#22d3ee" : hover ? "#ffffff" : look.verdict ? OUTLINE[look.verdict] : "#94a3b8";
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
          opacity={fillOpacity}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Line
        points={outline}
        color={lineColor}
        lineWidth={selected ? 2.6 : hover ? 2 : 1.4}
        dashed={poor && !selected}
        dashSize={0.0015}
        gapSize={0.001}
        transparent
        opacity={selected ? 1 : 0.85}
        renderOrder={4}
      />
      {showLabel && (
        <Html position={anchor} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <button
            type="button"
            title={`Select ${site.name}`}
            onClick={(e) => {
              e.stopPropagation();
              select(site.id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            style={{ pointerEvents: "auto" }}
            className={`block -translate-y-5 cursor-pointer whitespace-nowrap rounded-md border px-2 py-1 text-left shadow-lg transition-colors ${selected ? "border-cyan-300/60 bg-slate-950/95" : "border-white/10 bg-slate-950/90 hover:border-white/40"}`}
          >
            <div className={`text-[11px] font-semibold leading-tight ${selected ? "text-cyan-100" : "text-white"}`}>{site.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium leading-tight tabular-nums">
              {look.verdict && <span className="h-1.5 w-1.5 rounded-full" style={{ background: OUTLINE[look.verdict] }} />}
              <span className={look.verdict ? LABEL_TONE[look.verdict] : "text-white/45"}>{look.short}</span>
              <span className="text-white/55">{look.detail}</span>
            </div>
          </button>
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
        <Html center style={{ pointerEvents: "none" }} zIndexRange={[25, 0]}>
          <div className="-translate-y-4 whitespace-nowrap rounded px-1.5 py-px text-[10.5px] font-bold" style={{ background: color, color: "#020617" }}>
            {z.id} · {Math.round(z.mean_success * 100)}% here
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
  const summaries = useStore((s) => s.summaries[hourOf(s.landingTime)] ?? s.lastSummaries);
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
