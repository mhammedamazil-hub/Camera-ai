/**
 * PROJECT TERRA — rotations and 3x3 matrices.
 *
 * Earth orientation, the Coriolis force, atmospheric wind frames and the
 * gravity-gradient tensor all need rotation algebra. Matrices are stored as
 * flat row-major arrays of 9 numbers: m[3*r + c].
 *
 * Conventions
 *  - Active rotations (rotating a vector), right-handed.
 *  - Angles in radians.
 *  - ECI (Earth-Centred Inertial) -> ECEF uses R_z(gmst) then optionally the
 *    obliquity rotation to the ecliptic frame (see frame.js).
 */

import { vec, dot } from './vec3.js';

export const MAT3_IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function matMul(a, b) {
  const out = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c];
    }
  }
  return out;
}

export function matVec(m, v) {
  return vec(
    m[0] * v.x + m[1] * v.y + m[2] * v.z,
    m[3] * v.x + m[4] * v.y + m[5] * v.z,
    m[6] * v.x + m[7] * v.y + m[8] * v.z,
  );
}

export function transpose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export const det = (m) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) -
  m[1] * (m[3] * m[8] - m[5] * m[6]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);

/** Rotation about X by angle theta. */
export const rotX = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};

/** Rotation about Y by angle theta. */
export const rotY = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};

/** Rotation about Z by angle theta. */
export const rotZ = (t) => {
  const c = Math.cos(t), s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/**
 * Skew-symmetric (cross-product) matrix: skew(a) * b = a x b.
 * Used for the Coriolis term: a_cor = -2 omega x v.
 */
export const skew = (a) => [0, -a.z, a.y, a.z, 0, -a.x, -a.y, a.x, 0];

/** Apply the cross product through a skew matrix (kept for symmetry). */
export const crossMatrixVec = (a, b) => {
  const S = skew(a);
  return matVec(S, b);
};

/**
 * Rodrigues rotation matrix about a unit axis by angle theta.
 * Used for planetary precession and node/inclination evolution.
 */
export function rodrigues(axis, theta) {
  const u = axis; // assumed unit; normalise defensively
  const l = Math.hypot(u.x, u.y, u.z) || 1;
  const x = u.x / l, y = u.y / l, z = u.z / l;
  const c = Math.cos(theta), s = Math.sin(theta), t = 1 - c;
  return [
    t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

/**
 * Build an orthonormal frame (tangent basis) on a sphere.
 * Returns { east, north, up } for a unit surface normal `n` where `up` = n.
 * The east direction is computed from the global Z axis, so the frame is
 * singular at the poles only (where longitude is undefined by definition).
 */
export function tangentFrame(n) {
  const up = n;
  // East = normalize(k x up); at the geographic pole fall back to +x.
  let east = vec(-up.y, up.x, 0);
  const l = Math.hypot(east.x, east.y);
  east = l > 1e-12 ? vec(east.x / l, east.y / l, 0) : vec(1, 0, 0);
  // North = up x east (right-handed: east, north, up).
  const north = vec(
    up.y * east.z - up.z * east.y,
    up.z * east.x - up.x * east.z,
    up.x * east.y - up.y * east.x,
  );
  return { east, north, up };
}

/**
 * Gram–Schmidt orthonormalisation of three vectors, returning a rotation
 * matrix whose columns are the resulting basis. Used to build local ENU
 * frames from heading/pitch, and to re-orthonormalise integrated attitude.
 */
export function orthonormalBasis(a, b) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  const e1 = vec(a.x / l, a.y / l, a.z / l);
  const proj = dot(b, e1);
  const e2n = vec(b.x - proj * e1.x, b.y - proj * e1.y, b.z - proj * e1.z);
  const l2 = Math.hypot(e2n.x, e2n.y, e2n.z) || 1;
  const e2 = vec(e2n.x / l2, e2n.y / l2, e2n.z / l2);
  const e3 = vec(
    e1.y * e2.z - e1.z * e2.y,
    e1.z * e2.x - e1.x * e2.z,
    e1.x * e2.y - e1.y * e2.x,
  );
  return [e1.x, e2.x, e3.x, e1.y, e2.y, e3.y, e1.z, e2.z, e3.z];
}

export function isRotation(m, eps = 1e-9) {
  // R^T R == I  and  det(R) == +1
  const p = matMul(transpose(m), m);
  for (let i = 0; i < 9; i++) {
    const expect = i % 4 === 0 ? 1 : 0;
    if (Math.abs(p[i] - expect) > eps) return false;
  }
  return Math.abs(det(m) - 1) < eps;
}
