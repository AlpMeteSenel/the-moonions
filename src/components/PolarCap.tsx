"use client";

import { useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { texture } from "@/lib/api";
import { HeaderTextureLoader, blobUrl } from "@/lib/net";
import { latLonToVec3 } from "@/lib/geo";
import { holeMaterial } from "@/lib/siteFrame";
import { CAP_GRID } from "@/lib/heights";

export const CAP_EDGE_LAT = 80; // caps cover |lat| >= 80, the base sphere stops just past it
const MOON_R_M = 1737400;

export interface CapMeta {
  height_min_m: number;
  height_max_m: number;
  half_size_m: number;
}

function useHeightPixels(url: string) {
  const [px, setPx] = useState<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      setPx({ data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height });
    };
    let live = true;
    blobUrl(url)
      .then((b) => live && (img.src = b))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return px;
}

/** A polar-stereographic cap built from the LOLA 80 m polar DEM (no pole pinching). */
function useOverlay(url: string | null | undefined) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!url) {
      setTex(null);
      return;
    }
    let live = true;
    new HeaderTextureLoader().load(
      url,
      (t) => {
        if (!live) return;
        t.colorSpace = THREE.SRGBColorSpace;
        setTex((old) => {
          old?.dispose();
          return t;
        });
        invalidate();
      },
      undefined,
      () => live && setTex(null),
    );
    return () => {
      live = false;
    };
  }, [url, invalidate]);
  return tex;
}

export default function PolarCap({ pole, meta, exaggeration, overlayUrl }: { pole: "s" | "n"; meta: CapMeta; exaggeration: number; overlayUrl?: string | null }) {
  const overlay = useOverlay(overlayUrl);
  const [color, normal] = useLoader(HeaderTextureLoader, [texture(`cap_${pole}_color.jpg`), texture(`cap_${pole}_normal.jpg`)]);
  const px = useHeightPixels(texture(`cap_${pole}_height.png`));
  useMemo(() => {
    color.colorSpace = THREE.SRGBColorSpace;
    color.anisotropy = 4;
  }, [color]);

  const geom = useMemo(() => {
    if (!px) return null;
    // Uniform grid in the stereographic plane: evenly sized triangles everywhere, no pole
    // singularity (a ring/fan mesh produces radial "starburst" shading at the pole).
    const N = CAP_GRID;
    const sign = pole === "s" ? -1 : 1;
    const half = meta.half_size_m;
    const rhoOf = (absLat: number) => 2 * MOON_R_M * Math.tan(((90 - absLat) * Math.PI) / 360);
    const rhoKeep = rhoOf(CAP_EDGE_LAT - 0.15); // a hair past the band edge so there is no gap
    const ext = rhoOf(CAP_EDGE_LAT - 0.3);
    const sampleH = (u: number, v: number) => {
      const fx = Math.min(px.w - 1.001, Math.max(0, u * (px.w - 1)));
      const fy = Math.min(px.h - 1.001, Math.max(0, (1 - v) * (px.h - 1)));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const ax = fx - x0;
      const ay = fy - y0;
      const at = (xx: number, yy: number) => px.data[(yy * px.w + xx) * 4];
      const g = ((at(x0, y0) * (1 - ax) + at(x0 + 1, y0) * ax) * (1 - ay) + (at(x0, y0 + 1) * (1 - ax) + at(x0 + 1, y0 + 1) * ax) * ay) / 255;
      return meta.height_min_m + g * (meta.height_max_m - meta.height_min_m);
    };
    const pos = new Float32Array((N + 1) * (N + 1) * 3);
    const uv = new Float32Array((N + 1) * (N + 1) * 2);
    const rhoArr = new Float32Array((N + 1) * (N + 1));
    for (let i = 0; i <= N; i++) {
      const y = ext - (2 * ext * i) / N;
      for (let j = 0; j <= N; j++) {
        const x = -ext + (2 * ext * j) / N;
        const k = i * (N + 1) + j;
        const rho = Math.hypot(x, y);
        const colat = (2 * Math.atan(rho / (2 * MOON_R_M)) * 180) / Math.PI;
        const lat = sign * (90 - colat);
        const lon = (Math.atan2(x, pole === "s" ? y : -y) * 180) / Math.PI;
        const u = 0.5 + x / (2 * half);
        const v = 0.5 + y / (2 * half);
        const p = latLonToVec3(lat, lon, 1 + (sampleH(u, v) / MOON_R_M) * exaggeration);
        pos.set([p.x, p.y, p.z], k * 3);
        uv.set([u, v], k * 2);
        rhoArr[k] = rho;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const a = i * (N + 1) + j;
        const b = a + N + 1;
        if (Math.min(rhoArr[a], rhoArr[a + 1], rhoArr[b], rhoArr[b + 1]) > rhoKeep) continue;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure normals point away from the Moon's centre (winding depends on the pole)
    const n = g.attributes.normal as THREE.BufferAttribute;
    const c = Math.floor(((N + 1) * (N + 1)) / 2);
    if (n.getX(c) * pos[c * 3] + n.getY(c) * pos[c * 3 + 1] + n.getZ(c) * pos[c * 3 + 2] < 0) {
      for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
      g.setIndex(idx);
      g.computeVertexNormals();
    }
    return g;
  }, [px, pole, meta, exaggeration]);

  if (!geom) return null;
  return (
    <group>
      <mesh geometry={geom} raycast={() => null}>
        <meshStandardMaterial ref={holeMaterial} map={color} normalMap={normal} normalScale={new THREE.Vector2(0.9, 0.9)} roughness={0.96} metalness={0} side={THREE.DoubleSide} />
      </mesh>
      {overlay && (
        <mesh geometry={geom} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial ref={holeMaterial} map={overlay} transparent opacity={0.8} depthWrite={false} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
