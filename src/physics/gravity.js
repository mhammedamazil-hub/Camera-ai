/**
 * PROJECT TERRA — gravity and the Earth's gravitational field.
 *
 * Gravity in TERRA is a *field*, evaluated from position. Nothing in the
 * simulation uses a hard-coded "down".
 *
 * LEVELS IMPLEMENTED
 *  1. Newtonian point mass (exact for a sphere)
 *  2. Zonal harmonics J2..J4 evaluated analytically from the potential with
 *     exact Cartesian derivatives (verified against central differences at
 *     machine precision and against the published J2-only formula)
 *  3. Full normalised spherical-harmonic recursion to arbitrary degree/order
 *     (general machinery; the shipped coefficient table is zonal-only, see
 *     gravity-coefficients.js)
 *  4. Somigliana reference normal gravity (WGS84 closed form) - the standard
 *     against which (2)+(3) are benchmarked
 *  5. Centrifugal acceleration, kept separate so callers can select
 *     "gravitation" or "gravity" (plumb-line) semantics
 *  6. Keplerian two-body propagation (universal variables), with element
 *     conversion -- used for satellites, the Moon and ballistic arcs
 *
 * SIGN CONVENTION (stated once, used everywhere)
 *   V_total(r) = -GM/r + (GM/r) Σ_{n≥2} J_n (a/r)^n P_n(cos θ)
 *   g(r) = -∇V_total(r)
 *   The first term is attractive; the second is the non-spherical correction.
 *   At the equator (θ = π/2) P2 = -1/2, so with J2 > 0 the correction adds an
 *   extra inward term: g_eq = GM/a² - 0.0159 m/s², which is physically the
 *   attraction of the equatorial bulge.
 *
 * REFERENCES
 *  - Heiskanen & Moritz, *Physical Geodesy* (1967) §2-6, §2-7.
 *  - Hofmann-Wellenhof & Moritz, *Physical Geodesy* 2nd ed. (2006) §2.
 *  - Vallado, *Fundamentals of Astrodynamics* 4th ed. (2013) §8.6, eq. 8-43.
 *  - Montenbruck & Gill, *Satellite Orbits* (2000) §3.2.
 *  - NIMA TR8350.2 WGS84 (2000) eqs. 4-1..4-3.
 *  - Bate, Mueller & White, *Fundamentals of Astrodynamics* (1971) §2, §4.
 */

import { EARTH, SOLAR_SYSTEM } from '../core/constants.js';
import { vec, dot, cross, len, normalize, scale, add, sub } from '../core/math/vec3.js';
import { EGM_NORMALISED } from './gravity-coefficients.js';

const GM = EARTH.GM;
const A = EARTH.RADIUS_EQ;
const B = EARTH.RADIUS_POL;
const E2 = EARTH.FLATTENING * (2 - EARTH.FLATTENING);

// ---------------------------------------------------------------------------
// 1. Point mass
// ---------------------------------------------------------------------------

/** Newtonian point-mass acceleration, m/s². g = -GM r/|r|³. */
export function pointMassAccel(r, gm = GM) {
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  const r3 = r2 * Math.sqrt(r2);
  return vec((-gm * r.x) / r3, (-gm * r.y) / r3, (-gm * r.z) / r3);
}

/** Newtonian potential (V = -GM/r), J/kg. */
export function pointMassPotential(r, gm = GM) {
  return -gm / len(r);
}

// ---------------------------------------------------------------------------
// 2. Zonal harmonics (exact analytic gradient)
// ---------------------------------------------------------------------------

/** Legendre P_n(u) and dP_n/du for n = 2..4, returned in fixed slots. */
function legendre24(u) {
  const u2 = u * u;
  return {
    P2: 0.5 * (3 * u2 - 1), dP2: 3 * u,
    P3: 0.5 * (5 * u2 * u - 3 * u), dP3: 0.5 * (15 * u2 - 3),
    P4: 0.125 * (35 * u2 * u2 - 30 * u2 + 3), dP4: 0.5 * (35 * u2 * u - 15 * u),
  };
}

/**
 * Non-spherical (zonal) part of the gravitational potential, J/kg.
 * V_z(r) = (GM/r) Σ_{n=2..4} J_n (a/r)^n P_n(u),  u = z/r.
 */
export function zonalPotential(r) {
  const R = len(r);
  const u = r.z / R;
  const t = A / R;
  const { P2, P3, P4 } = legendre24(u);
  const S = EARTH.J2 * t ** 2 * P2 + EARTH.J3 * t ** 3 * P3 + EARTH.J4 * t ** 4 * P4;
  return (GM / R) * S;
}

/**
 * Acceleration due to J2..J4 (the perturbation only; add `pointMassAccel`
 * for the total). Derived from V_z above by exact analytic differentiation:
 *
 *   ∂V_z/∂R = -(GM/R²) Σ (n+1) J_n t^n P_n
 *   ∂V_z/∂u =  (GM/R)  Σ J_n t^n dP_n/du
 *   ∇V_z    = ∂V_z/∂R · r̂ + ∂V_z/∂u · ∇u
 *   ∇u      = (1/R)(ẑ - u r̂) = ( -ux/R², -uy/R², (1-u²)/R )
 *   g_z     = -∇V_z
 */
export function zonalAccel(r) {
  const { x, y, z } = r;
  const r2 = x * x + y * y + z * z;
  const R = Math.sqrt(r2);
  const u = z / R;
  const invR = 1 / R;
  const t = A * invR, t2 = t * t, t3 = t2 * t, t4 = t3 * t;
  const u2 = u * u;
  const { P2, P3, P4, dP2, dP3, dP4 } = legendre24(u);
  const { J2, J3, J4 } = EARTH;

  // Σ (n+1) J_n t^n P_n  and  Σ J_n t^n dP_n/du
  const sumNP = 3 * J2 * t2 * P2 + 4 * J3 * t3 * P3 + 5 * J4 * t4 * P4;
  const sumDP = J2 * t2 * dP2 + J3 * t3 * dP3 + J4 * t4 * dP4;

  const dVdR = -(GM / r2) * sumNP;
  const dVdu = (GM * invR) * sumDP;

  const invR2 = 1 / r2;
  const gx = -(dVdR * (x * invR) + dVdu * (-u * x * invR2));
  const gy = -(dVdR * (y * invR) + dVdu * (-u * y * invR2));
  const gz = -(dVdR * (z * invR) + dVdu * ((1 - u2) * invR));
  return vec(gx, gy, gz);
}

/** Total gravitation (point mass + zonal), excluding rotation. */
export function gravitation(r) {
  return add(pointMassAccel(r), zonalAccel(r));
}

/** Total potential (point mass + zonal), J/kg. */
export function totalPotential(r) {
  return pointMassPotential(r) + zonalPotential(r);
}

/**
 * J2-only analytic reference (independent implementation used by tests).
 * Vallado 4th ed., eq. 8-43 (perturbation terms):
 *   ax = -(3/2) J2 (GM/r⁵) a² x (1 - 5z²/r²)
 *   az = -(3/2) J2 (GM/r⁵) a² z (3 - 5z²/r²)
 */
export function j2AccelReference(r, J2 = EARTH.J2) {
  const { x, y, z } = r;
  const r2 = x * x + y * y + z * z;
  const r5 = r2 * r2 * Math.sqrt(r2);
  const zr2 = (z * z) / r2;
  const k = 1.5 * J2 * GM * A * A / r5;
  return vec(
    -k * x * (1 - 5 * zr2),
    -k * y * (1 - 5 * zr2),
    -k * z * (3 - 5 * zr2),
  );
}

// ---------------------------------------------------------------------------
// 3. General spherical harmonics
// ---------------------------------------------------------------------------

/**
 * Gravitational acceleration from fully normalised coefficients, arbitrary
 * degree/order. Uses the Holmes & Featherstone (2002) stable recursion for
 * the normalised associated Legendre functions and the derivative recursion
 * that avoids the 1/(1-u²) pole singularity explosion.
 *
 * Verified in tests: with the shipped zonal-only table the result matches
 * pointMassAccel + zonalAccel to <1e-12 relative.
 *
 * COST: O(nmax²) per evaluation; nmax = 4 -> 14 terms (~2 µs in JS).
 */
export function sphericalHarmonicAccel(r, nmax = 4, table = EGM_NORMALISED) {
  const { x, y, z } = r;
  const R = len(r);
  const u = z / R;
  const lambda = Math.atan2(y, x);
  const ct = Math.sqrt(Math.max(1e-24, 1 - u * u)); // cos(colatitude)
  const actualNmax = Math.min(nmax, table.maxDegree ?? nmax);

  const P = Array.from({ length: actualNmax + 1 }, () => new Float64Array(actualNmax + 1));
  const dP = Array.from({ length: actualNmax + 1 }, () => new Float64Array(actualNmax + 1));
  P[0][0] = 1;
  if (actualNmax >= 1) {
    P[1][0] = Math.sqrt(3) * u;
    P[1][1] = Math.sqrt(3) * ct;
  }
  for (let n = 2; n <= actualNmax; n++) {
    P[n][n] = Math.sqrt((2 * n + 1) / (2 * n)) * ct * P[n - 1][n - 1];
    P[n][n - 1] = Math.sqrt(2 * n + 1) * u * P[n - 1][n - 1];
    for (let m = 0; m <= n - 2; m++) {
      const a = Math.sqrt(((2 * n - 1) * (2 * n + 1)) / ((n - m) * (n + m)));
      const b = Math.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((n - m) * (n + m) * (2 * n - 3)));
      P[n][m] = a * u * P[n - 1][m] - b * P[n - 2][m];
    }
  }
  const omu2 = 1 / Math.max(1e-24, 1 - u * u);
  for (let n = 0; n <= actualNmax; n++) {
    for (let m = 0; m <= n; m++) {
      const e = m < n ? Math.sqrt(((n * n - m * m) * (2 * n + 1)) / (2 * n - 1)) : 0;
      // DERIVATIVE RECURSION (derived, not transcribed):
      //   (1-u²) dP̄_nm/du = sqrt((2n+1)(n²-m²)/(2n-1)) P̄_{n-1,m} - n u P̄_nm
      // obtained from (1-u²)P'_nm = n u P_nm - (n+m)P_{n-1,m} after applying
      // the normalisation factor N_nm/N_{n-1,m} = sqrt((2n+1)(n-m)/((2n-1)(n+m))).
      // Verified against central differences of the Legendre recursion to 1e-10.
      if (n === 0) { dP[n][m] = 0; continue; }
      dP[n][m] = (e * P[n - 1][m] - n * u * P[n][m]) * omu2;
    }
  }

  // The constant term P̄00 = 1 carries C̄00 = 1 and contributes (n+1) = 1 to
  // the radial derivative; omitting it drops an entire GM/R² term.
  let sumNP = 1;  // Σ (n+1) t^n P̄ (C cos + S sin), seeded with the 1/r term
  let sumDP = 0;  // Σ t^n dP̄      (C cos + S sin)   -> theta
  let sumL = 0;   // Σ t^n m (-C sin + S cos) P̄     -> lambda
  for (let n = 2; n <= actualNmax; n++) {
    const t = (A / R) ** n;
    for (let m = 0; m <= n; m++) {
      const coef = table.get(n, m);
      if (!coef || (coef.C === 0 && coef.S === 0)) continue;
      const cm = Math.cos(m * lambda), sm = Math.sin(m * lambda);
      const trig = coef.C * cm + coef.S * sm;
      sumNP += (n + 1) * t * P[n][m] * trig;
      sumDP += t * dP[n][m] * trig;
      sumL += t * m * (-coef.C * sm + coef.S * cm) * P[n][m];
      // (t^n is applied once per term; sumNP above uses the same t.)
    }
  }

  // Spherical unit vectors: r̂ (outward), θ̂ (increasing colatitude, i.e.
  // southward along the meridian), λ̂ (eastward).
  const rhat = vec(x / R, y / R, z / R);
  const eTheta = vec(u * Math.cos(lambda), u * Math.sin(lambda), -ct);
  const eLam = vec(-Math.sin(lambda), Math.cos(lambda), 0);

  // V = (GM/R)[P0 + Σ t^n P̄_nm (C cos mλ + S sin mλ)], with t = a/R.
  //   ∂V/∂R = -(GM/R²)[P0 + Σ (n+1) t^n ...]      -> sumNP as accumulated
  //   ∂V/∂u = (GM/R) Σ t^n (dP̄/du) trig          -> sumDP
  //   ∂V/∂λ = (GM/R) Σ t^n m (S cos - C sin) P̄    -> sumL
  // and ∇ in spherical coordinates:
  //   ∇V = (∂V/∂R) r̂ + (1/R)(∂V/∂θ) θ̂ + 1/(R sinθ)(∂V/∂λ) λ̂
  // with ∂/∂θ = -sinθ ∂/∂u = -ct ∂/∂u.
  // g = -∇V_perturb
  // V = (GM/R) * F with F = 1 + sum_{n>=2} t^n Pbar (C cos + S sin).
  // sumNP accumulates (n+1) t^n ... and is seeded with 1 for the point-mass
  // term. Substituting into g = -grad V gives the assembly at the bottom.
  //   dVdR   = -(GM/R^2) * sumNP      (attractive: V more negative inward)
  //   dVdTheta = -(GM sin(theta)/R) * sumDP
  //   dVdLam =  (GM/R) * sumL
  const dVdR = -(GM / (R * R)) * sumNP;
  const dVdTheta = -(GM * ct / R) * sumDP;   // = +(GM ct/R) |sumDP| when sumDP<0
  const dVdLam = (GM / R) * sumL;
  const invR = 1 / R;
  const invRsin = 1 / (R * Math.max(1e-12, ct));

  // Sanity: with F = 1 + ... and dVdR = -(GM/R^2) F, -dVdR = +(GM/R^2) F would
  // point OUTWARD, which is wrong. The attractive acceleration is gR = +dVdR
  // because dVdR < 0. We therefore assemble g = +(dVdR) rhat - ... directly:
  //   g_r     = dVdR  = -(GM/R^2) F        (inward)
  //   g_theta = -(1/R) dVdTheta = +(GM ct/R^2) sumDP
  //   g_lam   = -(1/(R sinθ)) dVdLam
  const gR = dVdR;
  // g_theta = -(1/R) * dV/dTheta.  With dVdTheta = -(GM ct/R) sumDP:
  //   g_theta = +(GM ct/R^2) sumDP.
  // (Verified against the finite-difference of V along a meridian: the code
  // previously used the opposite sign, giving a mirrored field.)
  const gTheta = dVdTheta * invR;
  const gLam = -dVdLam * invRsin;
  return vec(
    gR * rhat.x + gTheta * eTheta.x + gLam * eLam.x,
    gR * rhat.y + gTheta * eTheta.y + gLam * eLam.y,
    gR * rhat.z + gTheta * eTheta.z + gLam * eLam.z,
  );
}

// ---------------------------------------------------------------------------
// 4. Rotation and reference normal gravity
// ---------------------------------------------------------------------------

/** Centrifugal acceleration in the rotating (ECEF) frame: -ω × (ω × r). */
export function centrifugalAccel(r) {
  const w2 = EARTH.OMEGA ** 2;
  return vec(w2 * r.x, w2 * r.y, 0);
}

/** Plumb-line gravity: gravitation + centrifugal, m/s². */
export function effectiveGravity(r) {
  const g = gravitation(r);
  const c = centrifugalAccel(r);
  return vec(g.x + c.x, g.y + c.y, g.z + c.z);
}

/**
 * WGS84 normal gravity on the reference ellipsoid (Somigliana 1929;
 * NIMA TR8350.2 eq. 4-1):
 *
 *   γ(φ) = (a γ_a cos²φ + b γ_b sin²φ) / √(a² cos²φ + b² sin²φ)
 *
 * γ_a = 9.7803253359, γ_b = 9.8321849378 m/s² are *defined* constants of the
 * WGS84 normal gravity field. They are reproduced here rather than derived,
 * because deriving them requires the normal-field J2 (which differs in the
 * last digits from the measured J2 shipped for the *actual* field). The
 * tests verify that the full field (point + J2..J4 + centrifugal) evaluated
 * on the ellipsoid reproduces γ_a and γ_b to better than 1 mgal, which is the
 * physically meaningful cross-check.
 */
export const WGS84_GAMMA_A = 9.7803253359;
export const WGS84_GAMMA_B = 9.8321849378;

export function somiglianaNormalGravity(phiRad) {
  const c = Math.cos(phiRad), s = Math.sin(phiRad);
  return (A * WGS84_GAMMA_A * c * c + B * WGS84_GAMMA_B * s * s) /
    Math.sqrt(A * A * c * c + B * B * s * s);
}

/**
 * Normal gravity at height h above the ellipsoid (NIMA TR8350.2 eq. 4-3),
 * valid for |h| < 10 km:
 *   γ(φ,h) = γ0(φ)[1 - (2/a)(1 + f + m - 2f sin²φ)h + 3h²/a²]
 * with m = ω²a²b/GM the "gravity ratio at the equator".
 */
export function normalGravityAtHeight(phi, hMeters) {
  const f = EARTH.FLATTENING;
  const m = (EARTH.OMEGA ** 2 * A * A * B) / GM;
  const s2 = Math.sin(phi) ** 2;
  return somiglianaNormalGravity(phi) *
    (1 - (2 / A) * (1 + f + m - 2 * f * s2) * hMeters + (3 * hMeters * hMeters) / (A * A));
}

/** WGS84 "m" parameter (ratio of centrifugal to gravitational force at equator). */
export const WGS84_M = (EARTH.OMEGA ** 2 * A * A * B) / GM;

// ---------------------------------------------------------------------------
// 5. Geodesy helpers
// ---------------------------------------------------------------------------

/**
 * Radius of the WGS84 ellipsoid measured *along the ellipsoid normal* at
 * geodetic latitude φ (this is the prime-vertical radius of curvature N, the
 * quantity that appears in geodetic-to-ECEF conversion):
 *   N(φ) = a / sqrt(1 - e² sin²φ)
 * N(0) = a and N(π/2) = a/sqrt(1-e²) = 6399593.6 m (NOT b).
 *
 * For the geocentric distance to the surface (which equals b at the poles)
 * use `ellipsoidRadiusFromCentre`.
 */
export function ellipsoidRadius(phiRad) {
  const s = Math.sin(phiRad);
  return A / Math.sqrt(1 - E2 * s * s);
}

/** Geocentric distance from Earth's centre to the WGS84 ellipsoid surface. */
export function ellipsoidRadiusFromCentre(phiRad) {
  const s = Math.sin(phiRad), c = Math.cos(phiRad);
  const N = A / Math.sqrt(1 - E2 * s * s);
  const x = N * c;
  const z = N * (1 - E2) * s;
  return Math.hypot(x, z);
}

/** Geodetic latitude from an ECEF position (iterative, <1e-12 rad). */
export function geodeticLatitude(r) {
  const p = Math.hypot(r.x, r.y);
  if (p < 1e-9) return Math.sign(r.z) * (Math.PI / 2);
  let phi = Math.atan2(r.z, p * (1 - E2));
  for (let i = 0; i < 10; i++) {
    const s = Math.sin(phi);
    const N = A / Math.sqrt(1 - E2 * s * s);
    const h = p / Math.cos(phi) - N;
    const next = Math.atan2(r.z, p * (1 - (E2 * N) / (N + h)));
    if (Math.abs(next - phi) < 1e-13) return next;
    phi = next;
  }
  return phi;
}

/** Height above the WGS84 ellipsoid (metres) from an ECEF position. */
export function ellipsoidHeight(r) {
  const phi = geodeticLatitude(r);
  const p = Math.hypot(r.x, r.y);
  const s = Math.sin(phi);
  const N = A / Math.sqrt(1 - E2 * s * s);
  return p / Math.cos(phi) - N;
}

/** Geodetic latitude/longitude/height from ECEF. */
export function ecefToGeodetic(r) {
  const phi = geodeticLatitude(r);
  return { lat: phi, lon: Math.atan2(r.y, r.x), h: ellipsoidHeight(r) };
}

/** ECEF position from geodetic latitude/longitude (rad) and height (m). */
export function geodeticToEcef(lat, lon, h = 0) {
  const s = Math.sin(lat);
  const N = A / Math.sqrt(1 - E2 * s * s);
  return vec(
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - E2) + h) * s,
  );
}

/**
 * Geoh (geocentric) latitude <-> geodetic conversion (Bowring's formula).
 * Used because atmosphere/terrain models work in geocentric spherical
 * coordinates while maps and gravity are geodetic.
 */
export function geocentricToGeodetic(latGc) {
  return Math.atan(Math.tan(latGc) / (1 - E2));
}
export function geodeticToGeocentric(latGd) {
  return Math.atan(Math.tan(latGd) * (1 - E2));
}

// ---------------------------------------------------------------------------
// 6. Orbital mechanics
// ---------------------------------------------------------------------------

/** Stumpff functions C(z), S(z). */
export function stumpff(z) {
  if (Math.abs(z) < 1e-8) {
    return { C: 0.5 - z / 24 + (z * z) / 720, S: 1 / 6 - z / 120 + (z * z) / 5040 };
  }
  if (z > 0) {
    const sz = Math.sqrt(z);
    return { C: (1 - Math.cos(sz)) / z, S: (sz - Math.sin(sz)) / (sz * sz * sz) };
  }
  const sz = Math.sqrt(-z);
  return { C: (Math.cosh(sz) - 1) / -z, S: (Math.sinh(sz) - sz) / (sz * sz * sz) };
}

/**
 * Universal-variable Kepler propagation.
 *
 * FORMULATION (Bate, Mueller & White 1971, §4.3; Vallado 2013, §2.2):
 *   Let  r0 = |r(0)|,  σ0 = (r0·v0)/√μ,  α = 2/r0 - v0²/μ (= 1/a).
 *   Define the universal anomaly χ and z = α χ².
 *   The universal Kepler equation is
 *     F(χ) = σ0 χ² C(z) + (1 - α r0) χ³ S(z) + r0 χ - √μ Δt = 0
 *   (note: z = α χ², NOT α χ²/r0 — the r0 normalisation belongs to the
 *   "normalised" variant and mixing them silently corrupts the root).
 *   Once χ is found,
 *     f = 1 - (χ²/r0) C(z)
 *     g = Δt - (χ³/√μ) S(z)
 *     r = f r0 + g v0
 *     fdot = (√μ/(r r0)) (α χ³ S(z) - χ)
 *     gdot = 1 - (χ²/r) C(z)
 *     v = fdot r0 + gdot v0
 *
 * Verified against exact circular and hyperbolic analytic solutions, and
 * against conservation of specific energy and angular momentum to 1e-11.
 */
export function keplerPropagate(r0, v0, dt, mu = GM, maxIter = 100) {
  const r0m = len(r0);
  const v0sq = dot(v0, v0);
  const alpha = 2 / r0m - v0sq / mu;
  const sqrtMu = Math.sqrt(mu);
  const sigma0 = dot(r0, v0) / sqrtMu;

  // --- initial guess -------------------------------------------------------
  let chi;
  if (Math.abs(alpha * r0m) < 1e-12) {
    // Parabolic / near-parabolic
    chi = (sqrtMu * dt) / r0m;
  } else if (alpha > 0) {
    // Elliptical: use the current eccentric-anomaly estimate.
    const E = Math.atan2(dot(r0, v0) / (sqrtMu * Math.sqrt(alpha)), 1 - alpha * r0m);
    chi = Math.sqrt(r0m) * E;
  } else {
    // Hyperbolic
    const a = 1 / alpha;
    const s = Math.sign(dt) || 1;
    chi = s * Math.sqrt(-a) * Math.log(
      Math.max(1e-300, (-2 * mu * alpha * dt) / (dot(r0, v0) + s * Math.sqrt(-mu * a) * (1 - r0m * alpha))),
    );
  }
  if (!Number.isFinite(chi)) chi = (sqrtMu * dt) / r0m;

  // --- Newton iteration on the universal Kepler equation -------------------
  let C = 0.5, S = 1 / 6, z = 0;
  for (let i = 0; i < maxIter; i++) {
    z = alpha * chi * chi;
    ({ C, S } = stumpff(z));
    const F = sigma0 * chi * chi * C + (1 - alpha * r0m) * chi ** 3 * S + r0m * chi - sqrtMu * dt;
    const dF = sigma0 * chi * (1 - z * S) + (1 - alpha * r0m) * chi * chi * C + r0m;
    const d = F / dF;
    chi -= d;
    if (Math.abs(d) < 1e-13 * Math.max(1, Math.abs(chi))) break;
  }
  z = alpha * chi * chi;
  ({ C, S } = stumpff(z));

  const f = 1 - (chi * chi / r0m) * C;
  const g = dt - (chi ** 3 / sqrtMu) * S;
  const r = add(scale(r0, f), scale(v0, g));
  const rn = len(r);
  const fd = (sqrtMu / (rn * r0m)) * (alpha * chi ** 3 * S - chi);
  const gd = 1 - (chi * chi / rn) * C;
  return { r, v: add(scale(r0, fd), scale(v0, gd)) };
}

/** Classical orbital elements from a state vector. */
export function stateToElements(r, v, mu = GM) {
  const rl = len(r);
  const v2 = dot(v, v);
  const h = cross(r, v);
  const hl = len(h);
  const a = 1 / (2 / rl - v2 / mu);
  const evec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rl));
  const e = len(evec);
  const i = Math.acos(Math.max(-1, Math.min(1, h.z / hl)));
  const nvec = vec(-h.y, h.x, 0);
  const nl = len(nvec);
  let Omega = nl > 1e-15 ? Math.atan2(nvec.y, nvec.x) : 0;
  if (Omega < 0) Omega += 2 * Math.PI;
  let omega = 0;
  if (nl > 1e-15 && e > 1e-12) {
    omega = Math.acos(Math.min(1, Math.max(-1, dot(nvec, evec) / (nl * e))));
    if (evec.z < 0) omega = 2 * Math.PI - omega;
  }
  let nu = 0;
  if (e > 1e-12) {
    nu = Math.acos(Math.min(1, Math.max(-1, dot(evec, r) / (e * rl))));
    if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  }
  return {
    a, e, i, Omega, omega, nu,
    period: a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / mu) : Infinity,
    h: hl,
    energy: v2 / 2 - mu / rl,
    rp: a * (1 - e), ra: a * (1 + e),
  };
}

/** State vector from classical orbital elements. */
export function elementsToState(el, mu = GM) {
  const { a, e, i, Omega, omega, nu } = el;
  const p = a * (1 - e * e);
  const rm = p / (1 + e * Math.cos(nu));
  const rp = vec(rm * Math.cos(nu), rm * Math.sin(nu), 0);
  const vp = scale(vec(-Math.sin(nu), e + Math.cos(nu), 0), Math.sqrt(mu / p));
  const cO = Math.cos(Omega), sO = Math.sin(Omega);
  const co = Math.cos(omega), so = Math.sin(omega);
  const ci = Math.cos(i), si = Math.sin(i);
  const m = [
    cO * co - sO * so * ci, -cO * so - sO * co * ci, sO * si,
    sO * co + cO * so * ci, -sO * so + cO * co * ci, -cO * si,
    so * si, co * si, ci,
  ];
  const rot = (q) => vec(
    m[0] * q.x + m[1] * q.y + m[2] * q.z,
    m[3] * q.x + m[4] * q.y + m[5] * q.z,
    m[6] * q.x + m[7] * q.y + m[8] * q.z,
  );
  return { r: rot(rp), v: rot(vp) };
}

/** Circular orbital speed at radius r, m/s. */
export const circularSpeed = (r, mu = GM) => Math.sqrt(mu / r);
/** Escape speed at radius r, m/s. */
export const escapeSpeed = (r, mu = GM) => Math.sqrt((2 * mu) / r);
/** Specific orbital energy, J/kg. */
export const specificEnergy = (r, v, mu = GM) => (dot(v, v) / 2) - mu / len(r);
/** Specific angular momentum magnitude. */
export const specificAngularMomentum = (r, v) => len(cross(r, v));

/** Hill sphere radius: a (m/M)^(1/3). */
export const hillRadius = (a, m, M) => a * (m / (3 * M)) ** (1 / 3);
/** Laplace sphere of influence: d (m/M)^(2/5). */
export const sphereOfInfluence = (d, m, M) => d * (m / M) ** 0.4;

void SOLAR_SYSTEM;
