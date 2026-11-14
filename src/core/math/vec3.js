/**
 * PROJECT TERRA — 3-vector algebra (immutable, plain objects).
 *
 * A single, dependency-free Vec3 used by every simulation module so that
 * orbital mechanics, gravity, atmosphere sampling and rendering all share
 * identical arithmetic. Immutability is deliberate: it makes the physics core
 * safe to unit-test and prevents accidental aliasing bugs in coupled systems.
 *
 * @typedef {{x:number, y:number, z:number}} Vec3
 */

export const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });

export const ZERO = Object.freeze(vec(0, 0, 0));
export const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => vec(a.x * s, a.y * s, a.z * s);
export const neg = (a) => vec(-a.x, -a.y, -a.z);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => vec(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const len2 = (a) => a.x * a.x + a.y * a.y + a.z * a.z;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const normalize = (a) => {
  const l = len(a);
  return l > 0 ? scale(a, 1 / l) : vec(0, 0, 0);
};
export const lerp = (a, b, t) => vec(
  a.x + (b.x - a.x) * t,
  a.y + (b.y - a.y) * t,
  a.z + (b.z - a.z) * t,
);
export const equals = (a, b, eps = 1e-12) =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps;

/** Component-wise min/max (used by bounding volumes). */
export const minC = (a, b) => vec(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z));
export const maxC = (a, b) => vec(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z));
export const absC = (a) => vec(Math.abs(a.x), Math.abs(a.y), Math.abs(a.z));

/** Angle between two vectors in radians (numerically safe near 0 and pi). */
export function angle(a, b) {
  const d = dot(a, b) / (len(a) * len(b));
  return Math.acos(Math.min(1, Math.max(-1, d)));
}

export const toArray = (a) => [a.x, a.y, a.z];
export const fromArray = (arr) => vec(arr[0], arr[1], arr[2]);
export const isFiniteVec = (a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z);
