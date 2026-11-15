import * as THREE from "three";
import { latLonToVec3 } from "./geo";
import { useSurface } from "./heights";
import { halfSizeOf } from "./store";
import { useMemo } from "react";

/**
 * The 3D site close-up lives on the globe itself: the detailed terrain patch (km units, x = east,
 * y = up, z = −north) is placed in the Moon-local frame at the site, scaled to sphere units, and a
 * matching square hole is cut in the globe surface so the coarse globe never pokes through it.
 */

export const MOON_R_KM = 1737.4;
/** km → sphere units (Moon radius = 1). */
export const KM = 1 / MOON_R_KM;

export interface SiteFrame {
  /** Moon-local position of the region centre on the rendered surface. */
  center: THREE.Vector3;
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** Site scene (km, x east / y up / z −north) → Moon-local sphere units. */
  matrix: THREE.Matrix4;
}

export function siteFrame(lat: number, lon: number, r = 1): SiteFrame {
  const up = latLonToVec3(lat, lon, 1).normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(up);
  if (east.lengthSq() < 1e-12) east.set(0, 0, -1);
  east.normalize();
  const north = up.clone().cross(east).normalize();
  const center = up.clone().multiplyScalar(r);
  const matrix = new THREE.Matrix4().makeBasis(east, up, north.clone().negate()).scale(new THREE.Vector3(KM, KM, KM)).setPosition(center);
  return { center, up, east, north, matrix };
}

/** Half-size (m) of the terrain patch fetched for a site: the region plus a margin of context. */
export const patchHalfM = (site: { half_size_m?: number }) => Math.max(2000, halfSizeOf(site) * 1.12);

export function useSiteFrame(site: { lat: number; lon: number } | null | undefined): SiteFrame | null {
  const surface = useSurface();
  const lat = site?.lat;
  const lon = site?.lon;
  return useMemo(() => (lat === undefined || lon === undefined ? null : siteFrame(lat, lon, surface?.rendered(lat, lon) ?? 1)), [lat, lon, surface]);
}

/** Uniforms shared by every globe surface material: a square hole where the site patch sits. */
export const HOLE = {
  uHoleOn: { value: 0 },
  uHoleC: { value: new THREE.Vector3() },
  uHoleE: { value: new THREE.Vector3(1, 0, 0) },
  uHoleN: { value: new THREE.Vector3(0, 0, 1) },
  uHoleHalf: { value: 0 },
};

/** AI landing-success map draped on the tiled terrain inside the site region (3D site view). */
export const DRAPE = {
  uDrapeOn: { value: 0 },
  uDrapeTex: { value: null as THREE.Texture | null },
  uDrapeC: { value: new THREE.Vector3() },
  uDrapeE: { value: new THREE.Vector3(1, 0, 0) },
  uDrapeN: { value: new THREE.Vector3(0, 0, 1) },
  uDrapeHalf: { value: 1 },
};

/**
 * Material ref callback: discard globe fragments inside the site patch (Moon-local object space);
 * with `drape`, also paint the site's AI map over the surface colour (tiled terrain).
 */
export function holeMaterial(m: THREE.Material | null, drape = false) {
  if (!m || m.userData.hole) return;
  m.userData.hole = true;
  m.customProgramCacheKey = () => (drape ? "site-hole-drape" : "site-hole");
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, HOLE, drape ? DRAPE : {});
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vHolePos;")
      .replace("#include <project_vertex>", "vHolePos = transformed;\n#include <project_vertex>");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vHolePos;\nuniform float uHoleOn;\nuniform vec3 uHoleC;\nuniform vec3 uHoleE;\nuniform vec3 uHoleN;\nuniform float uHoleHalf;" +
          (drape ? "\nuniform float uDrapeOn;\nuniform sampler2D uDrapeTex;\nuniform vec3 uDrapeC;\nuniform vec3 uDrapeE;\nuniform vec3 uDrapeN;\nuniform float uDrapeHalf;" : ""),
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (uHoleOn > 0.5) { vec3 hd = vHolePos - uHoleC; if (abs(dot(hd, uHoleE)) < uHoleHalf && abs(dot(hd, uHoleN)) < uHoleHalf && dot(vHolePos, uHoleC) > 0.0) discard; }",
      );
    if (drape)
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\nif (uDrapeOn > 0.5) { vec3 dd = vHolePos - uDrapeC; vec2 q = vec2(dot(dd, uDrapeE), dot(dd, uDrapeN)) / uDrapeHalf; if (abs(q.x) < 1.0 && abs(q.y) < 1.0 && dot(vHolePos, uDrapeC) > 0.0) { vec4 dc = texture2D(uDrapeTex, q * 0.5 + 0.5); diffuseColor.rgb = mix(diffuseColor.rgb, dc.rgb, dc.a); } }",
      );
  };
}
