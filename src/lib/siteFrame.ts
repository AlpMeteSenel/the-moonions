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

/** Per-pixel ground slope (deg, true scale: the drawn relief is x2) and the patch's slope ramp, in GLSL. */
const SLOPE_GLSL = `
float trueSlopeDeg(vec3 p) {
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  float c = clamp(abs(dot(n, normalize(p))), 0.0, 1.0);
  float t = sqrt(max(1.0 - c * c, 0.0)) / max(c, 1e-4);
  return degrees(atan(t / 2.0));
}
vec3 slopeColor(float s) {
  // safe -> marginal -> unsafe, as in the old site patch (8 / 15 deg lander limits); linear RGB
  vec3 c0 = vec3(0.216, 0.258, 0.262); vec3 c1 = vec3(0.319, 0.376, 0.381); vec3 c2 = vec3(0.672, 0.456, 0.102);
  vec3 c3 = vec3(0.745, 0.198, 0.041); vec3 c4 = vec3(0.527, 0.039, 0.025);
  if (s < 4.0) return mix(c0, c1, s / 4.0);
  if (s < 8.0) return mix(c1, c2, (s - 4.0) / 4.0);
  if (s < 12.0) return mix(c2, c3, (s - 8.0) / 4.0);
  return mix(c3, c4, clamp((s - 12.0) / 6.0, 0.0, 1.0));
}
`;

/** AI landing-success map draped on the tiled terrain inside the site region (3D site view). */
export const DRAPE = {
  uDrapeOn: { value: 0 },
  uDrapeTex: { value: null as THREE.Texture | null },
  uDrapeC: { value: new THREE.Vector3() },
  uDrapeE: { value: new THREE.Vector3(1, 0, 0) },
  uDrapeN: { value: new THREE.Vector3(0, 0, 1) },
  uDrapeHalf: { value: 1 },
  /** Slope-tinted surround out to this many region half-sizes (the old patch extent). */
  uDrapeOuter: { value: 1.12 },
  /** 1 when an AI map is draped inside the region; 0 = slope colours there too. */
  uDrapeAi: { value: 0 },
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
          (drape ? "\nuniform float uDrapeOn;\nuniform sampler2D uDrapeTex;\nuniform vec3 uDrapeC;\nuniform vec3 uDrapeE;\nuniform vec3 uDrapeN;\nuniform float uDrapeHalf;\nuniform float uDrapeOuter;\nuniform float uDrapeAi;\n" + SLOPE_GLSL : ""),
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (uHoleOn > 0.5) { vec3 hd = vHolePos - uHoleC; if (abs(dot(hd, uHoleE)) < uHoleHalf && abs(dot(hd, uHoleN)) < uHoleHalf && dot(vHolePos, uHoleC) > 0.0) discard; }",
      );
    if (drape)
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n" +
          "if (uDrapeOn > 0.5) { vec3 dd = vHolePos - uDrapeC; vec2 q = vec2(dot(dd, uDrapeE), dot(dd, uDrapeN)) / uDrapeHalf; float m = max(abs(q.x), abs(q.y));" +
          " if (m < uDrapeOuter && dot(vHolePos, uDrapeC) > 0.0) {" +
          "  vec3 slopeTint = slopeColor(trueSlopeDeg(vHolePos));" +
          "  if (m < 1.0 && uDrapeAi < 0.5) diffuseColor.rgb = slopeTint;" +
          "  else if (m < 1.0) { vec4 dc = texture2D(uDrapeTex, q * 0.5 + 0.5); diffuseColor.rgb = mix(vec3(0.254, 0.266, 0.282), dc.rgb, dc.a); }" + // grey #8a8d91 (linear) under the AI colours
          "  else diffuseColor.rgb = slopeTint * (uDrapeAi > 0.5 ? 0.55 : 1.0);" + // slope context around the region (dimmed under an AI map)
          " } }",
      );
  };
}
