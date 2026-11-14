"use client";

import { useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
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

export default function MoonScene() {
  const view = useStore((s) => s.view);
  return (
    <>
    <Canvas
      key={view}
      shadows={view === "site"}
      frameloop="demand"
      dpr={[1, 1.5]}
      performance={{ min: 0.6 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={view === "globe" ? { position: [1.2, -2.2, 2.4], fov: 40, near: 0.001, far: 1000 } : { position: [3.5, 3.2, 5.5], fov: 45, near: 0.01, far: 500 }}
    >
      <Suspense fallback={null}>{view === "globe" ? <Globe /> : <SiteView />}</Suspense>
    </Canvas>
    <Loading />
    </>
  );
}
