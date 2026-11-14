"use client";

import { Html, Line, OrbitControls, Stars, useTexture } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { API_URL, texture } from "@/lib/api";
import { latLonToVec3, regionOutline, vec3ToLatLon } from "@/lib/geo";
import { evalKey, halfSizeOf, useStore } from "@/lib/store";
import { TIER_COLOR, VERDICT } from "@/lib/ui";
import PolarCap, { CAP_EDGE_LAT, type CapMeta } from "./PolarCap";

const MOON_R_KM = 1737.4;
const RELIEF_EXAGGERATION = 2.0;
// height map range from textures.json (LOLA, metres)
const H_MIN = -8981.5;
const H_MAX = 10685.5;

export interface TextureMeta {
  caps?: Record<string, CapMeta>;
}

function useTextureMeta() {
  const [meta, setMeta] = useState<TextureMeta | null>(null);
  useEffect(() => {
    fetch(texture("textures.json"))
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({}));
  }, []);
  return meta;
}

/** Sphere band between the polar caps with UVs that still span the full equirectangular map. */
function useBandGeometry(hasCaps: boolean) {
  return useMemo(() => {
    const edge = hasCaps ? CAP_EDGE_LAT + 0.05 : 90;
    const t0 = ((90 - edge) * Math.PI) / 180;
    const g = new THREE.SphereGeometry(1, 384, 192, 0, Math.PI * 2, t0, Math.PI - 2 * t0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const lat = Math.asin(Math.max(-1, Math.min(1, pos.getY(i))));
      uv.setY(i, 0.5 + lat / Math.PI);
    }
    uv.needsUpdate = true;
    return g;
  }, [hasCaps]);
}

function Moon({ onFlyTo }: { onFlyTo: (p: THREE.Vector3) => void }) {
  const meta = useTextureMeta();
  const caps = meta?.caps;
  const band = useBandGeometry(Boolean(caps?.cap_s));
  const [color, normal, height, hazard] = useTexture([
    texture("moon_color_4k.jpg"),
    texture("moon_normal_4k.jpg"),
    texture("moon_height_2k.png"),
    texture("hazard.png"),
  ]);
  const showHazard = useStore((s) => s.showHazard);
  const showAiMap = useStore((s) => s.showAiMap);
  const aiReady = useStore((s) => Boolean(s.modelCard?.success_model));
  const landingTime = useStore((s) => s.landingTime);
  const aiOverlay = showAiMap && aiReady ? `${API_URL}/api/ai/polar-map.png?time=${encodeURIComponent(landingTime.slice(0, 13) + ":00:00Z")}` : null;
  const placing = useStore((s) => s.placing);
  const addCustom = useStore((s) => s.addCustom);
  const [hover, setHover] = useState<{ lat: number; lon: number; p: THREE.Vector3 } | null>(null);

  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 8;
    for (const t of [color, normal, height, hazard]) t.wrapS = THREE.RepeatWrapping;
  }, [color, normal, height, hazard]);

  const normalScale = useMemo(() => new THREE.Vector2(1.4, 1.4), []);
  const dispScale = ((H_MAX - H_MIN) / 1000 / MOON_R_KM) * RELIEF_EXAGGERATION;
  const dispBias = (H_MIN / 1000 / MOON_R_KM) * RELIEF_EXAGGERATION;

  // All pointer interaction goes through this cheap proxy sphere (2k triangles) instead of
  // raycasting the 150k-triangle displaced surface on every mouse move.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!placing) return;
    e.stopPropagation();
    const { lat, lon } = vec3ToLatLon(e.point);
    addCustom(lat, lon);
    setHover(null);
  };
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onFlyTo(e.point.clone());
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!placing) return;
    setHover({ ...vec3ToLatLon(e.point), p: e.point.clone() });
  };

  return (
    <group>
      <mesh geometry={band} raycast={() => null}>
        <meshStandardMaterial
          map={color}
          normalMap={normal}
          normalScale={normalScale}
          displacementMap={height}
          displacementScale={dispScale}
          displacementBias={dispBias}
          roughness={0.96}
          metalness={0}
        />
      </mesh>
      {caps &&
        (["s", "n"] as const).map((pole) => caps[`cap_${pole}`] && <PolarCap key={pole} pole={pole} meta={caps[`cap_${pole}`]} exaggeration={RELIEF_EXAGGERATION} overlayUrl={pole === "s" ? aiOverlay : null} />)}
      {showHazard && (
        <mesh raycast={() => null}>
          <sphereGeometry args={[1.004, 192, 96]} />
          <meshBasicMaterial map={hazard} transparent opacity={0.75} depthWrite={false} />
        </mesh>
      )}
      {/* interaction proxy */}
      <mesh onClick={onClick} onDoubleClick={onDouble} onPointerMove={onMove} onPointerOut={() => setHover(null)}>
        <sphereGeometry args={[1.0, 64, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      {placing && hover && (
        <group position={hover.p.clone().multiplyScalar(1.004)}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[0.006, 12, 12]} />
            <meshBasicMaterial color="#22d3ee" />
          </mesh>
          <Html center style={{ pointerEvents: "none" }}>
            <div className="-translate-y-5 whitespace-nowrap rounded bg-slate-950/90 px-2 py-0.5 text-[11px] text-cyan-200">
              {hover.lat.toFixed(2)}°, {hover.lon.toFixed(2)}° · click to add
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}

function SunLight() {
  const sun = useStore((s) => s.sun);
  const real = useStore((s) => s.realLighting);
  const light = useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!light.current) return;
    if (real && sun) light.current.position.copy(latLonToVec3(sun.sun_lat, sun.sun_lon, 10));
    else light.current.position.copy(camera.position).normalize().multiplyScalar(10);
  });
  return (
    <>
      <directionalLight ref={light} intensity={real ? 3.2 : 2.4} color="#fff8ee" />
      <ambientLight intensity={real ? 0.07 : 0.25} color="#9db4ff" />
    </>
  );
}

function Earth() {
  const sun = useStore((s) => s.sun);
  if (!sun) return null;
  const p = latLonToVec3(sun.earth_lat, sun.earth_lon, 28);
  return (
    <group position={p}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.9, 32, 32]} />
        <meshStandardMaterial color="#3b82f6" emissive="#0b2a66" emissiveIntensity={0.6} roughness={0.6} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.97, 32, 32]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.12} />
      </mesh>
    </group>
  );
}

const _v = new THREE.Vector3();

/** Keeps a marker a constant size on screen at any zoom. */
function useZoomScale(at: THREE.Vector3, k = 0.9) {
  const ref = useRef<THREE.Group>(null);
  const { camera } = useThree();
  useFrame(() => {
    if (!ref.current) return;
    const d = camera.position.distanceTo(at);
    ref.current.scale.setScalar(Math.min(1.6, Math.max(0.003, d * k)));
  });
  return ref;
}

function Marker({ id, lat, lon, name, color, selected, score }: { id: string; lat: number; lon: number; name: string; color: string; selected: boolean; score?: number }) {
  const select = useStore((s) => s.select);
  const [hover, setHover] = useState(false);
  const at = useMemo(() => latLonToVec3(lat, lon, 1.0 + (Math.abs(lat) > 80 ? 0.006 : 0.004)), [lat, lon]);
  const ref = useZoomScale(at);
  const big = selected || hover;
  return (
    <group ref={ref} position={at}>
      {/* generous invisible hit target */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          select(id);
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
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
      <mesh raycast={() => null}>
        <sphereGeometry args={[big ? 0.0085 : 0.006, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {selected && (
        <mesh raycast={() => null} lookAt={_v.set(0, 0, 0)}>
          <ringGeometry args={[0.012, 0.0145, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}
      {big && (
        <Html center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="-translate-y-6 whitespace-nowrap rounded-md border border-white/10 bg-slate-950/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg">
            {name}
            {score !== undefined && (
              <span className="ml-2 font-semibold" style={{ color }}>
                {Math.round(score)}
              </span>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

function BackupDot({ lat, lon, color }: { lat: number; lon: number; color: string }) {
  const at = useMemo(() => latLonToVec3(lat, lon, 1.0 + (Math.abs(lat) > 80 ? 0.006 : 0.004)), [lat, lon]);
  const ref = useZoomScale(at);
  return (
    <group ref={ref} position={at}>
      <mesh raycast={() => null}>
        <sphereGeometry args={[0.0035, 10, 10]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RegionOutlines() {
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedId);
  const outlines = useMemo(
    () => sites.filter((s) => s.half_size_m || s.custom).map((s) => ({ id: s.id, pts: regionOutline(s.lat, s.lon, halfSizeOf(s), Math.abs(s.lat) > 80 ? 1.0065 : 1.0045) })),
    [sites],
  );
  return (
    <group>
      {outlines.map((o) => (
        <Line key={o.id} points={o.pts} color={o.id === selectedId ? "#22d3ee" : "#e2e8f0"} lineWidth={o.id === selectedId ? 2 : 1} transparent opacity={o.id === selectedId ? 0.95 : 0.35} />
      ))}
    </group>
  );
}

function SiteMarkers() {
  const sites = useStore((s) => s.sites);
  const selectedId = useStore((s) => s.selectedId);
  const evals = useStore((s) => s.evals);
  const landingTime = useStore((s) => s.landingTime);
  const profile = useStore((s) => s.profile);
  const divertRadius = useStore((s) => s.divertRadius);
  const missionHours = useStore((s) => s.missionHours);
  const keyOf = (id: string) => evalKey(id, { landingTime, profile, divertRadius, missionHours });
  const selEval = selectedId ? evals[keyOf(selectedId)] : undefined;
  return (
    <group>
      {sites.map((s) => {
        const ev = evals[keyOf(s.id)];
        const color = ev ? VERDICT[ev.verdict].color : s.custom ? "#22d3ee" : s.group.startsWith("Historic") ? "#94a3b8" : "#e2e8f0";
        return <Marker key={s.id} id={s.id} lat={s.lat} lon={s.lon} name={s.name} color={color} selected={s.id === selectedId} score={ev?.overall} />;
      })}
      {selEval?.backups?.map((b) => <BackupDot key={b.id} lat={b.lat} lon={b.lon} color={TIER_COLOR[b.tier]} />)}
    </group>
  );
}

function CameraRig({ flyTo }: { flyTo: THREE.Vector3 | null }) {
  const selected = useStore((s) => s.sites.find((x) => x.id === s.selectedId));
  const sun = useStore((s) => s.sun);
  const framed = useRef(false);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const target = useRef<THREE.Vector3 | null>(null);
  const { camera, invalidate } = useThree();

  // First view: the sunlit south-polar region (where the Artemis candidates are)
  useEffect(() => {
    if (framed.current || selected || !sun) return;
    framed.current = true;
    target.current = latLonToVec3(-50, sun.sun_lon - 20, 2.9);
    invalidate();
  }, [sun, selected, invalidate]);

  useEffect(() => {
    if (!selected) return;
    target.current = latLonToVec3(selected.lat, selected.lon, 1.32);
    invalidate();
  }, [selected, invalidate]);

  useEffect(() => {
    if (!flyTo) return;
    const d = Math.max(1.15, camera.position.length() * 0.7);
    target.current = flyTo.clone().normalize().multiplyScalar(d);
    invalidate();
  }, [flyTo, camera, invalidate]);

  // Fly along the sphere (direction slerp + distance lerp) so the camera never cuts through the Moon
  useFrame(() => {
    const c = controls.current;
    const d0 = camera.position.length();
    if (c) {
      // slow, precise rotation close to the surface; faster when far away
      const alt = d0 - 1;
      c.rotateSpeed = Math.min(0.6, Math.max(0.03, alt * 0.55));
      c.zoomSpeed = Math.min(0.9, Math.max(0.25, alt * 0.8));
    }
    if (!target.current) return;
    const d1 = target.current.length();
    const dir = camera.position.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(dir, target.current.clone().normalize());
    dir.applyQuaternion(new THREE.Quaternion().slerp(q, 0.09));
    camera.position.copy(dir.multiplyScalar(d0 + (d1 - d0) * 0.09));
    if (camera.position.distanceTo(target.current) < 0.002) target.current = null;
    c?.update();
    invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableDamping
      dampingFactor={0.1}
      minDistance={1.03}
      maxDistance={8}
      onStart={() => (target.current = null)}
    />
  );
}

export default function Globe() {
  const [flyTo, setFlyTo] = useState<THREE.Vector3 | null>(null);
  return (
    <>
      <color attach="background" args={["#02030a"]} />
      <Stars radius={120} depth={60} count={3000} factor={4} saturation={0} fade speed={0} />
      <SunLight />
      <Moon onFlyTo={setFlyTo} />
      <Earth />
      <RegionOutlines />
      <SiteMarkers />
      <CameraRig flyTo={flyTo} />
    </>
  );
}
