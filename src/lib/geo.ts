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
