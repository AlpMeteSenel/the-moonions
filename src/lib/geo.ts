import * as THREE from "three";

const D2R = Math.PI / 180;

/** Matches three.js SphereGeometry UVs with an equirectangular map whose left edge is lon -180. */
export function latLonToVec3(lat: number, lon: number, r = 1): THREE.Vector3 {
  const la = lat * D2R;
  const lo = lon * D2R;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

export function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize();
  return { lat: Math.asin(n.y) / D2R, lon: Math.atan2(-n.z, n.x) / D2R };
}

/** Local site frame: x = east, y = up, z = -north (three.js forward). Units: km. */
export function enuToScene(eastM: number, northM: number, upM: number): [number, number, number] {
  return [eastM / 1000, upM / 1000, -northM / 1000];
}

export function bearingToEN(distM: number, bearingDeg: number): [number, number] {
  return [distM * Math.sin(bearingDeg * D2R), distM * Math.cos(bearingDeg * D2R)];
}

export function sunVectorLocal(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export function fmtLat(lat: number) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
}
export function fmtLon(lon: number) {
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}
export function fmtDist(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

const MOON_R_M = 1737400;

/** Great-circle destination: from (lat, lon) go `dist` metres on `bearing` degrees. */
export function destination(lat: number, lon: number, bearingDeg: number, distM: number): { lat: number; lon: number } {
  const p1 = lat * D2R;
  const l1 = lon * D2R;
  const th = bearingDeg * D2R;
  const d = distM / MOON_R_M;
  const sp2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sp2)));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * sp2);
  return { lat: p2 / D2R, lon: ((((l2 / D2R) + 180) % 360) + 360) % 360 - 180 };
}

/** Local east/north offset (m) → lat/lon (azimuthal equidistant, matches the backend). */
export function offsetLatLon(lat: number, lon: number, eastM: number, northM: number) {
  const dist = Math.hypot(eastM, northM);
  if (dist === 0) return { lat, lon };
  return destination(lat, lon, Math.atan2(eastM, northM) / D2R, dist);
}

/** Outline of a square region (half-size in metres) as points on the sphere. */
export function regionOutline(lat: number, lon: number, halfM: number, r = 1.003, perSide = 16): THREE.Vector3[] {
  const corners: [number, number][] = [
    [-halfM, halfM],
    [halfM, halfM],
    [halfM, -halfM],
    [-halfM, -halfM],
    [-halfM, halfM],
  ];
  const pts: THREE.Vector3[] = [];
  for (let c = 0; c < 4; c++) {
    for (let k = 0; k <= perSide; k++) {
      const e = corners[c][0] + ((corners[c + 1][0] - corners[c][0]) * k) / perSide;
      const n = corners[c][1] + ((corners[c + 1][1] - corners[c][1]) * k) / perSide;
      const ll = offsetLatLon(lat, lon, e, n);
      pts.push(latLonToVec3(ll.lat, ll.lon, r));
    }
  }
  return pts;
}
