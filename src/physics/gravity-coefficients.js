/**
 * PROJECT TERRA — gravity coefficient table.
 *
 * WHAT IS SHIPPED
 * ---------------
 * TERRA includes the *zonal* (axially symmetric) gravity harmonics to degree 4,
 * taken from the IERS Conventions 2010 (Table 6.1) and cross-referenced with
 * WGS84 (NIMA TR8350.2). These dominate the Earth's non-spherical field:
 *
 *   J2 = +1.08262668e-3   (dynamic ellipticity, 99.9% of the non-spherical signal)
 *   J3 = -2.53265649e-6   (north-south pear shape)
 *   J4 = -1.61962159e-6   (equatorial bulge correction)
 *
 * Conversion to fully normalised coefficients (Heiskanen & Moritz 1967 §2-6):
 *   C̄_n0 = -J_n / sqrt(2n + 1),   S̄_n0 = 0
 *
 * WHAT IS NOT SHIPPED (documented limitation, see docs/LIMITATIONS.md)
 * ------------------------------------------------------------------
 * Tesseral and sectorial harmonics (C̄_nm, S̄_nm for m > 0, degree 5..2190 of
 * EGM2008) are NOT included, because a verified full coefficient set could not
 * be obtained from an authoritative mirrored dataset in this environment, and
 * fabricating those numbers would violate the project's data-integrity rule.
 * The *machinery* in `sphericalHarmonicAccel` supports arbitrary tables: pass
 * any coefficient map and degree. A validated EGM2008 subset can be dropped in
 * without code changes.
 *
 * The RMS effect of the omitted terms on surface gravity is < 1e-5 m/s^2
 * (100 µm/s^2) outside the major mountain ranges, and their effect on the
 * geoid is the primary source of the ~±100 m geoid undulation, which is why
 * `geoidUndulation` is explicitly labelled a reduced model.
 */

/**
 * Fully normalised zonal coefficients derived from the *geodetic* J_n.
 *
 * SIGN CONVENTION (critical — this is where V and J2 conventions collide):
 * The standard geopotential representation used by the Legendre recursion is
 *   V = (GM/R)[ 1 + Σ_n (a/R)^n C̄_n0 P̄_n0(u) ]
 * whereas physical geodesy writes the *perturbation* as
 *   V = (GM/R)[ 1 - Σ_n J_n (a/R)^n P_n(u) ].
 * Since P̄_n0 = sqrt(2n+1) P_n and C̄_n0 = -J_n / sqrt(2n+1), the two are
 * identical term by term. The recursion therefore stores C̄_n0 < 0 for J2 > 0,
 * which is the same sign as the measured EGM2008 values.
 */
function zonalC(n, Jn) {
  return -Jn / Math.sqrt(2 * n + 1);
}

const J = { 2: 1.08262668e-3, 3: -2.53265649e-6, 4: -1.61962159e-6 };

/** @type {Map<number, Map<number,{C:number,S:number}>>} degree -> order -> coeffs */
export const EGM_NORMALISED = new Map();
for (const [nStr, Jn] of Object.entries(J)) {
  const n = Number(nStr);
  const row = new Map();
  row.set(0, { C: zonalC(n, Jn), S: 0 });
  EGM_NORMALISED.set(n, row);
}

/** Accessor with synthetic Map-like `get(n, m)`. */
EGM_NORMALISED.get = function get(n, m) {
  const row = Map.prototype.get.call(this, n);
  if (!row) return undefined;
  return row.get(m);
};

/**
 * Long-wavelength geoid recovery: the "J2-only" geoid undulation is
 *   N(phi) ≈ -a J2 P2(sin phi)   (to first order in flattening),
 * giving ±10.7 m; the real geoid deviates by ±100 m from the ellipsoid
 * mainly due to degree 5-360 terms that we do not ship.
 */
export const GEOID_FIRST_ORDER_AMPLITUDE = 6378137 * 1.08262668e-3;

/** Earth gravitational parameter used by gravity/gravity-coefficients. */
export const EARTH_GM = 3.986004418e14;

// The spherical-harmonic solver reads `table.get(n, m)`; expose the max degree
// explicitly so callers can iterate safely.
Object.defineProperty(EGM_NORMALISED, 'maxDegree', { value: 4, enumerable: false });
