"use client";

import { AdaptiveDpr, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import Globe from "./Globe";
import SiteView from "./SiteView";

function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-lg bg-black/50 px-4 py-2 text-sm text-white/70">Loading NASA lunar maps… {Math.round(progress)}%</div>
    </div>
  );
}

/**
 * With on-demand rendering, a resolution change from AdaptiveDpr resizes (and clears) the canvas
 * without scheduling a frame, which can leave the view blank after the camera stops. Redraw on change.
 */
function RedrawOnResolutionChange() {
  const level = useThree((s) => s.performance.current);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const t = setTimeout(() => invalidate(), 50);
    return () => clearTimeout(t);
  }, [level, dpr, invalidate]);
  return null;
}

export default function MoonScene() {
  const current = useStore((s) => s.view);
  // Mission control covers the map: keep the last 3D view mounted underneath and stop rendering it
  const last = useRef<"globe" | "site">("globe");
  if (current !== "crew") last.current = current;
  const view = last.current;
  return (
    <>
    <Canvas
      key={view}
      shadows={view === "site"}
      frameloop={current === "crew" ? "never" : "demand"}
      dpr={[1, 1.5]}
      performance={{ min: 0.5, debounce: 250 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={view === "globe" ? { position: [1.2, -2.2, 2.4], fov: 40, near: 0.001, far: 1000 } : { position: [3.5, 3.2, 5.5], fov: 45, near: 0.01, far: 500 }}
    >
      {/* render at lower resolution while the camera moves, full resolution when it stops */}
      <AdaptiveDpr pixelated={false} />
      <RedrawOnResolutionChange />
      <Suspense fallback={null}>{view === "globe" ? <Globe /> : <SiteView />}</Suspense>
    </Canvas>
    <Loading />
    </>
  );
}
