import * as THREE from "three";

/**
 * The Moon is drawn rotated so its SOUTH POLE faces the default camera direction (+z).
 * OrbitControls orbit around the world y axis and flip at its ends; with this rotation those
 * singular points sit on the equator (lon ±90°), far from the polar regions the app is about,
 * so rotating around and over the south pole is smooth.
 * Rx(−90°): (x, y, z) → (x, z, −y); south pole (0, −1, 0) → (0, 0, 1).
 */
export const MOON_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
export const MOON_Q_INV = MOON_Q.clone().invert();

/** Moon-local (selenographic frame) → world. */
export const toWorld = (v: THREE.Vector3) => v.clone().applyQuaternion(MOON_Q);
/** World → Moon-local. */
export const toLocal = (v: THREE.Vector3) => v.clone().applyQuaternion(MOON_Q_INV);
