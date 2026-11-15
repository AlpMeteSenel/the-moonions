"use client";

import { AdaptiveDpr, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { latLonToVec3 } from "@/lib/geo";
import { toWorld } from "@/lib/moonFrame";
import Globe from "./Globe";

/** Open looking down on the south pole (the Artemis region); the rig then turns it to the sunlit side. */
const START_CAMERA = toWorld(latLonToVec3(-89, 0, 1.45)).toArray() as [number, number, number];

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
  return (
    <>
    <Canvas
      shadows
      frameloop="demand"
      dpr={[1, 1.5]}
      performance={{ min: 0.5, debounce: 250 }}
      // log depth: the same camera goes from a whole-Moon view down to a few km above the site
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, logarithmicDepthBuffer: true }}
      camera={{ position: START_CAMERA, fov: 42, near: 0.00001, far: 1000 }}
    >
      {/* render at lower resolution while the camera moves, full resolution when it stops */}
      <AdaptiveDpr pixelated={false} />
      <RedrawOnResolutionChange />
      <Suspense fallback={null}>
        <Globe />
      </Suspense>
    </Canvas>
    <Loading />
    </>
  );
}
