"use client";

import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import { type ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { API_URL, texture } from "@/lib/api";
import { BACKEND_HEADERS, HeaderTextureLoader } from "@/lib/net";
import { fmtDist, latLonToVec3, offsetLatLon, vec3ToLatLon } from "@/lib/geo";
import { BAND_SEGMENTS, bandEdgeLat, DISP_BIAS, DISP_SCALE, RELIEF_EXAGGERATION, useSurface } from "@/lib/heights";
import { landerState, TRACKER_SITE_ID, usePose } from "@/lib/pose";
import { MOON_Q, toLocal, toWorld } from "@/lib/moonFrame";
import { holeMaterial, KM, patchHalfM, useSiteFrame } from "@/lib/siteFrame";
import { evalKey, halfSizeOf, useStore } from "@/lib/store";
import { VERDICT } from "@/lib/ui";
import RegionLayer from "./map/RegionLayer";
import PolarCap, { type CapMeta } from "./PolarCap";
import { SiteLayer, SiteSun } from "./SiteView";

export interface TextureMeta {
  caps?: Record<string, CapMeta>;
}

function useTextureMeta() {
  const [meta, setMeta] = useState<TextureMeta | null>(null);
  useEffect(() => {
    fetch(texture("textures.json"), { headers: BACKEND_HEADERS })
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta({}));
  }, []);
  return meta;
}

/** Sphere band between the polar caps with UVs that still span the full equirectangular map. */
function useBandGeometry(hasCaps: boolean) {
  return useMemo(() => {
    const edge = bandEdgeLat(hasCaps);
    const t0 = ((90 - edge) * Math.PI) / 180;
    const g = new THREE.SphereGeometry(1, BAND_SEGMENTS[0], BAND_SEGMENTS[1], 0, Math.PI * 2, t0, Math.PI - 2 * t0);
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
  const [color, normal, height, hazard] = useLoader(HeaderTextureLoader, [
    texture("moon_color_4k.jpg"),
    texture("moon_normal_4k.jpg"),
    texture("moon_height_2k.png"),
    texture("hazard.png"),
  ]);
  const showHazard = useStore((s) => s.showHazard && s.view === "globe");
  const showAiMap = useStore((s) => s.showAiMap);
  const aiReady = useStore((s) => Boolean(s.modelCard?.success_model));
  const landingTime = useStore((s) => s.settledTime);
  const selectedTime = useStore((s) => s.landingTime);
  const aiOverlay = showAiMap && aiReady && landingTime === selectedTime ? `${API_URL}/api/ai/polar-map.png?time=${encodeURIComponent(landingTime.slice(0, 13) + ":00:00Z")}` : null;
  const placing = useStore((s) => s.placing);
  const addCustom = useStore((s) => s.addCustom);
  const [hover, setHover] = useState<{ lat: number; lon: number; p: THREE.Vector3 } | null>(null);

  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 4;
    for (const t of [color, normal, height, hazard]) t.wrapS = THREE.RepeatWrapping;
  }, [color, normal, height, hazard]);

  const normalScale = useMemo(() => new THREE.Vector2(1.4, 1.4), []);
  const dispScale = DISP_SCALE;
  const dispBias = DISP_BIAS;

  // All pointer interaction goes through this cheap proxy sphere (2k triangles) instead of
  // raycasting the 150k-triangle displaced surface on every mouse move.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!placing) return;
    e.stopPropagation();
    const { lat, lon } = vec3ToLatLon(toLocal(e.point));
    addCustom(lat, lon);
    setHover(null);
  };
  const onDouble = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onFlyTo(e.point.clone());
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!placing) return;
    const lp = toLocal(e.point);
    setHover({ ...vec3ToLatLon(lp), p: lp });
  };

  return (
    <group>
      <mesh geometry={band} raycast={() => null}>
        <meshStandardMaterial
          ref={holeMaterial}
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
    if (real && sun) light.current.position.copy(toWorld(latLonToVec3(sun.sun_lat, sun.sun_lon, 10)));
    else if (!real) light.current.position.copy(camera.position).normalize().multiplyScalar(10);
  });
  return (
    <>
      <directionalLight ref={light} intensity={real ? (sun ? 3.2 : 0) : 2.4} color="#fff8ee" />
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
    const d = camera.position.distanceTo(toWorld(at));
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              select(id);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => setHover(false)}
            style={{ pointerEvents: "auto" }}
            className="block -translate-y-6 cursor-pointer whitespace-nowrap rounded-md border border-white/10 bg-slate-950/90 px-2 py-1 text-[11px] font-medium text-white shadow-lg hover:border-white/40"
          >
            {name}
            {score !== undefined && (
              <span className="ml-2 font-semibold" style={{ color }}>
                {Math.round(score)}
              </span>
            )}
          </button>
        </Html>
      )}
    </group>
  );
}

const LANDER = "#f472b6";

function LanderGlyph({ at, alt }: { at: THREE.Vector3; alt: number | null }) {
  const ref = useZoomScale(at, 0.7);
  return (
    <group ref={ref} position={at}>
      <mesh raycast={() => null}>
        <octahedronGeometry args={[0.009, 0]} />
        <meshBasicMaterial color={LANDER} toneMapped={false} />
      </mesh>
      <Html center style={{ pointerEvents: "none" }} zIndexRange={[25, 0]}>
        <div className="-translate-y-5 whitespace-nowrap rounded-md border border-pink-300/50 bg-slate-950/90 px-2 py-0.5 text-[11px] font-semibold text-pink-200 shadow-lg">
          Lander{alt !== null && <span className="ml-1.5 font-normal text-white/75">{fmtDist(alt)} up</span>}
        </div>
      </Html>
    </group>
  );
}

/** The tracked lander over its region (the tracker's map = this region), at its altitude. */
function GlobeLander() {
  const pose = usePose();
  const site = useStore((s) => s.sites.find((x) => x.id === TRACKER_SITE_ID));
  const S = useSurface();
  const st = site ? landerState(pose, halfSizeOf(site)) : null;
  const pts = useMemo(() => {
    if (!site || !S || !st) return null;
    const ll = offsetLatLon(site.lat, site.lon, st.east_m, st.north_m);
    const r0 = S.rendered(ll.lat, ll.lon);
    // altitude drawn with the same vertical exaggeration as the terrain
    const top = r0 + ((st.alt_m ?? 0) / 1737400) * RELIEF_EXAGGERATION;
    return { ground: latLonToVec3(ll.lat, ll.lon, r0 + 0.0003), top: latLonToVec3(ll.lat, ll.lon, Math.max(top, r0 + 0.0006)) };
  }, [site, S, st?.east_m, st?.north_m, st?.alt_m]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pts || !st) return null;
  return (
    <group>
      <Line points={[pts.ground, pts.top]} color={LANDER} lineWidth={1.5} dashed dashSize={0.001} gapSize={0.0007} transparent opacity={0.85} />
      <LanderGlyph at={pts.top} alt={st.alt_m} />
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
  const showHistoric = useStore((s) => s.showHistoric);
  return (
    <group>
      {sites.filter((s) => s.group === "Historic landing" && (showHistoric || s.id === selectedId)).map((s) => {
        const ev = evals[keyOf(s.id)];
        const color = ev ? VERDICT[ev.verdict].color : s.custom ? "#22d3ee" : s.group.startsWith("Historic") ? "#94a3b8" : "#e2e8f0";
        return <Marker key={s.id} id={s.id} lat={s.lat} lon={s.lon} name={s.name} color={color} selected={s.id === selectedId} score={ev?.overall} />;
      })}

    </group>
  );
}

type Goal = { pos: THREE.Vector3; quat: THREE.Quaternion; target: THREE.Vector3; up: THREE.Vector3; mode: "globe" | "site"; size: number };
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function CameraRig({ flyTo }: { flyTo: THREE.Vector3 | null }) {
  const selected = useStore((s) => s.sites.find((x) => x.id === s.selectedId));
  const view = useStore((s) => s.view);
  const sun = useStore((s) => s.sun);
  const preset = useStore((s) => s.cameraPreset);
  const frame = useSiteFrame(selected);
  const framed = useRef(false);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const target = useRef<THREE.Vector3 | null>(null);
  // a perspective change between the globe and the site close-up (camera position, look and up)
  const goal = useRef<Goal | null>(null);
  const mode = useRef<"globe" | "site">("globe");
  const { camera, invalidate } = useThree();
  const globe = view === "globe";

  // First view: the sunlit south-polar region (where the Artemis candidates are)
  useEffect(() => {
    if (framed.current || selected || !sun) return;
    framed.current = true;
    target.current = toWorld(latLonToVec3(-89.0, sun.sun_lon - 15, 1.45));
    invalidate();
  }, [sun, selected, invalidate]);

  useEffect(() => {
    if (preset.nonce === 0 || !globe) return;
    const lon = sun?.sun_lon ?? 0;
    if (preset.kind === "moon") target.current = toWorld(latLonToVec3(-30, lon - 25, 3.2));
    else if (preset.kind === "pole") target.current = toWorld(latLonToVec3(-89.0, lon - 15, 1.45));
    else if (selected) target.current = toWorld(latLonToVec3(selected.lat, selected.lon, 1.09));
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    if (!selected || !globe || mode.current === "site") return;
    target.current = toWorld(latLonToVec3(selected.lat, selected.lon, 1.09));
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!flyTo || !globe) return;
    const d = Math.max(1.15, camera.position.length() * 0.7);
    target.current = flyTo.clone().normalize().multiplyScalar(d);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  // Globe ⇄ site: tilt down onto the site's terrain, or pull back up to the globe above it
  useEffect(() => {
    target.current = null;
    const look = (pos: THREE.Vector3, at: THREE.Vector3, up: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, at, up));
    if (view === "site" && frame && selected) {
      const s = (2 * patchHalfM(selected)) / 1000; // patch size, km
      const w = (v: THREE.Vector3) => toWorld(v.applyMatrix4(frame.matrix));
      const pos = w(new THREE.Vector3(s * 0.15, s * 1.05, s * 0.95));
      const at = w(new THREE.Vector3(0, 0, 0));
      const up = toWorld(frame.up);
      goal.current = { pos, quat: look(pos, at, up), target: at, up, mode: "site", size: s * KM };
    } else if (view === "globe" && mode.current === "site") {
      const pos = selected ? toWorld(latLonToVec3(selected.lat, selected.lon, 1.09)) : camera.position.clone().normalize().multiplyScalar(1.6);
      const at = new THREE.Vector3();
      goal.current = { pos, quat: look(pos, at, WORLD_UP), target: at, up: WORLD_UP.clone(), mode: "globe", size: 1 };
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, frame]);

  const limits = (m: "globe" | "site", size: number) => {
    const c = controls.current;
    if (!c) return;
    if (m === "site") {
      c.minDistance = size * 0.06;
      c.maxDistance = size * 4;
      c.maxPolarAngle = Math.PI / 2.05;
      c.rotateSpeed = 0.6;
      c.zoomSpeed = 0.8;
    } else {
      c.minDistance = 1.03;
      c.maxDistance = 8;
      c.maxPolarAngle = Math.PI;
    }
  };

  useFrame((_, dt) => {
    const c = controls.current;
    const g = goal.current;
    if (g) {
      if (c) {
        c.enabled = false;
        c.minDistance = 0;
        c.maxDistance = 100;
        c.maxPolarAngle = Math.PI;
      }
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4.5);
      // move around the Moon's centre (never through it), then ease the look and up direction
      const d0 = camera.position.length();
      const d1 = g.pos.length();
      const dir = camera.position.clone().normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(dir, g.pos.clone().normalize());
      dir.applyQuaternion(new THREE.Quaternion().slerp(q, k));
      camera.position.copy(dir.multiplyScalar(d0 + (d1 - d0) * k));
      camera.quaternion.slerp(g.quat, k);
      if (camera.position.distanceTo(g.pos) < g.size * 0.004 && camera.quaternion.angleTo(g.quat) < 0.002) {
        camera.position.copy(g.pos);
        camera.up.copy(g.up);
        mode.current = g.mode;
        goal.current = null;
        if (c) {
          c.target.copy(g.target);
          limits(g.mode, g.size);
          c.enabled = true;
          c.update();
        } else camera.quaternion.copy(g.quat);
      }
      invalidate();
      return;
    }
    if (mode.current === "site") return;
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
      regress
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
  const site = useStore((s) => s.view === "site");
  return (
    <>
      <color attach="background" args={["#02030a"]} />
      <Stars radius={120} depth={60} count={3000} factor={4} saturation={0} fade speed={0} />
      {site ? <SiteSun /> : <SunLight />}
      {/* the Moon is drawn rotated so the south pole faces the camera (see lib/moonFrame.ts) */}
      <group quaternion={MOON_Q}>
        <Moon onFlyTo={setFlyTo} />
        <Earth />
        {site ? <SiteLayer /> : (
          <>
            <RegionLayer />
            <SiteMarkers />
            <GlobeLander />
          </>
        )}
      </group>
      <CameraRig flyTo={flyTo} />
    </>
  );
}
