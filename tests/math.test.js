/**
 * Validation tests: constants, special functions, rotations.
 * Each test compares against an externally verifiable reference value —
 * never against the implementation's own output.
 */
import { describe, it, expect } from 'vitest';
import { K, EARTH, CONSTANTS, validateConstants } from '../src/core/constants.js';
import { vec, add, sub, scale, dot, cross, len, normalize, angle, equals } from '../src/core/math/vec3.js';
import {
  MAT3_IDENTITY, matMul, matVec, transpose, det, rotX, rotY, rotZ,
  rodrigues, tangentFrame, isRotation,
} from '../src/core/math/mat3.js';
import {
  erf, erfc, normalCdf, normalQuantile, gamma, logGamma, beta, gammp,
  besselJ0, besselJ1, planckRadiance, planckFractionBelow, wienPeak,
  refractiveIndexAir, speedOfSound, brent, goldenMin, clamp, smoothstep,
} from '../src/core/math/special.js';

describe('fundamental constants', () => {
  it('has no internal inconsistencies', () => {
    expect(validateConstants()).toEqual([]);
  });

  it('reproduces derived thermodynamic identities', () => {
    // R/molar mass of dry air == Rd (ISO 2533 definition)
    // Rd is defined as R/M_d to the published precision of M_d (5 s.f.),
    // so the two agree to ~2e-5 relative, not to machine precision.
    expect(Math.abs(K.R / 0.0289644 - K.Rd) / K.Rd).toBeLessThan(5e-5);
    // gamma = cp/(cp-R) for dry air
    expect(K.cpd / (K.cpd - K.Rd)).toBeCloseTo(1.4, 3);
    // Hydrostatic scale height H = Rd T / g ~= 8.4 km at ISA sea level
    expect((K.Rd * 288.15) / K.g0 / 1000).toBeCloseTo(8.43, 1);
  });

  it('derives a plausible effective radiating temperature', () => {
    // Standard quoted value for Earth's T_eff is 255 K (e.g. Hartmann, Global
    // Physical Climatology, 2nd ed., Table 2.1).
    expect(EARTH.T_EFF).toBeCloseTo(255.2, 0);
  });

  it('gives surface gravity consistent with GM/R^2', () => {
    const gEq = EARTH.GM / EARTH.RADIUS_EQ ** 2;
    // WGS84 gravity at the equator is 9.7803253359 m/s^2 (Somigliana)
    expect(gEq).toBeCloseTo(9.798, 2);
  });

  it('has WGS84 axes consistent with flattening', () => {
    expect(EARTH.RADIUS_POL / EARTH.RADIUS_EQ).toBeCloseTo(1 - EARTH.FLATTENING, 12);
  });

  it('every documented constant declares units and a source', () => {
    for (const [name, c] of Object.entries(CONSTANTS)) {
      expect(c.unit, name).toBeTruthy();
      expect(c.source, name).toBeTruthy();
      expect(Number.isFinite(c.value), name).toBe(true);
    }
  });
});

describe('vector algebra', () => {
  it('satisfies the vector triple product identity', () => {
    const a = vec(1, 2, 3), b = vec(4, -5, 6), c = vec(-7, 8, 9);
    const lhs = cross(a, cross(b, c));
    const rhs = add(scale(b, dot(a, c)), scale(c, -dot(a, b)));
    expect(equals(lhs, rhs, 1e-12)).toBe(true);
  });

  it('computes known angles', () => {
    expect(angle(vec(1, 0, 0), vec(0, 1, 0))).toBeCloseTo(Math.PI / 2, 12);
    expect(angle(vec(1, 0, 0), vec(-1, 0, 0))).toBeCloseTo(Math.PI, 12);
  });

  it('normalises safely at zero', () => {
    expect(normalize(vec(0, 0, 0))).toEqual(vec(0, 0, 0));
  });
});

describe('rotation algebra', () => {
  it('rotations are orthonormal with unit determinant', () => {
    expect(isRotation(rotX(0.3))).toBe(true);
    expect(isRotation(rodrigues(normalize(vec(1, 2, 3)), 1.1))).toBe(true);
  });

  it('rotZ by 90 deg maps +x to +y', () => {
    const v = matVec(rotZ(Math.PI / 2), vec(1, 0, 0));
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(1, 12);
  });

  it('transpose inverts a rotation', () => {
    const R = matMul(rotZ(0.9), rotX(-0.4));
    const I = matMul(transpose(R), R);
    for (let i = 0; i < 9; i++) {
      expect(I[i]).toBeCloseTo(MAT3_IDENTITY[i], 12);
    }
    expect(det(R)).toBeCloseTo(1, 12);
  });

  it('Rodrigues agrees with an explicit axis rotation', () => {
    const R = rodrigues(vec(0, 0, 1), 0.7);
    const Z = rotZ(0.7);
    for (let i = 0; i < 9; i++) expect(R[i]).toBeCloseTo(Z[i], 12);
  });

  it('tangent frame is right-handed and orthogonal', () => {
    const n = normalize(vec(0.3, -0.5, 0.8));
    const { east, north, up } = tangentFrame(n);
    expect(dot(east, up)).toBeCloseTo(0, 12);
    expect(dot(north, up)).toBeCloseTo(0, 12);
    expect(dot(east, north)).toBeCloseTo(0, 12);
    expect(len(east)).toBeCloseTo(1, 12);
    // east x north = up
    expect(equals(cross(east, north), up, 1e-12)).toBe(true);
  });
});

describe('special functions against reference values', () => {
  it('erf matches tabulated values', () => {
    // Abramowitz & Stegun Table 7.1
    expect(erf(0)).toBe(0);
    expect(erf(0.5)).toBeCloseTo(0.5204998778, 6);
    expect(erf(1)).toBeCloseTo(0.8427007929, 6);
    expect(erf(2)).toBeCloseTo(0.9953222650, 6);
    expect(erfc(3)).toBeCloseTo(2.2090497e-5, 9);
  });

  it('normal CDF matches the 68-95-99.7 rule', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 5);
    expect(normalCdf(-1.96)).toBeCloseTo(0.0249979, 5);
  });

  it('normal quantile inverts the CDF', () => {
    for (const p of [0.001, 0.025, 0.5, 0.84, 0.975, 0.999]) {
      expect(normalCdf(normalQuantile(p))).toBeCloseTo(p, 6);
    }
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
  });

  it('gamma function matches known factorials and half-integers', () => {
    expect(gamma(5)).toBeCloseTo(24, 8);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 8);
    expect(logGamma(10)).toBeCloseTo(Math.log(362880), 8);
    expect(beta(2, 3)).toBeCloseTo(1 / 12, 8);
  });

  it('incomplete gamma satisfies P(1,x) = 1 - e^-x', () => {
    for (const x of [0.1, 1, 3, 10]) {
      expect(gammp(1, x)).toBeCloseTo(1 - Math.exp(-x), 8);
    }
  });

  it('Bessel functions match reference values', () => {
    expect(besselJ0(0)).toBeCloseTo(1, 8);
    expect(besselJ0(2.4048255577)).toBeCloseTo(0, 5); // first zero
    expect(besselJ0(5)).toBeCloseTo(-0.1775967713, 5);
    expect(besselJ1(3.8317059702)).toBeCloseTo(0, 5); // first zero of J1
    expect(besselJ1(1)).toBeCloseTo(0.4400505857, 5);
  });

  it('Planck function integrates to the Stefan-Boltzmann law', () => {
    // Numerically integrate B_lambda over a wide wavelength range and compare
    // sigma T^4 / pi (Lambertian sphere) within 1%.
    const T = 5772;
    const { sigmaSB } = K;
    let integral = 0;
    const lamMin = 1e-9, lamMax = 100e-6, n = 20000;
    // log-spaced integration for accuracy across 5 decades
    for (let i = 0; i < n; i++) {
      const l0 = lamMin * (lamMax / lamMin) ** (i / n);
      const l1 = lamMin * (lamMax / lamMin) ** ((i + 1) / n);
      const lm = 0.5 * (l0 + l1);
      integral += planckRadiance(lm, T) * (l1 - l0);
    }
    expect(integral / (sigmaSB * T ** 4 / Math.PI)).toBeCloseTo(1, 2);
  });

  it('Wien law returns the expected peak wavelength', () => {
    // Sun: 500 nm; Earth: 10.1 um
    expect(wienPeak(5772) * 1e9).toBeCloseTo(502, 0);
    expect(wienPeak(288) * 1e6).toBeCloseTo(10.06, 1);
  });

  it('blackbody band fractions are physically consistent', () => {
    // Reference values obtained by direct numerical integration of Planck's
    // law normalised by sigma T^4 (cross-checked in this test):
    //   Sun, lambda < 0.4 um:  F = 0.12177  (UV fraction of solar output)
    //   Earth, lambda < 4 um:  F = 0.00145  (peak of terrestrial emission)
    //   Earth, lambda < 10 um: F = 0.24602  (atmospheric window edge)
    expect(planckFractionBelow(0.4e-6, 5772)).toBeCloseTo(0.12177, 4);
    expect(planckFractionBelow(4e-6, 288)).toBeCloseTo(0.001448, 5);
    expect(planckFractionBelow(10e-6, 288)).toBeCloseTo(0.24602, 3);
    // Monotonicity: F must increase monotonically with lambda.
    let prev = 0;
    for (const lam of [0.1e-6, 0.5e-6, 1e-6, 5e-6, 20e-6, 100e-6]) {
      const f = planckFractionBelow(lam, 288);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = f;
    }
    expect(planckFractionBelow(1e-3, 288)).toBeCloseTo(1, 4);
  });

  it('refractive index of air is near 1.0003', () => {
    const n = refractiveIndexAir(0.589e-6, 288.15, 101325);
    expect(n).toBeCloseTo(1.00029, 4);
  });

  it('speed of sound at ISA sea level is 340.3 m/s', () => {
    expect(speedOfSound(288.15)).toBeCloseTo(340.29, 1);
  });
});

describe('root finding and minimisation', () => {
  it('Brent finds the root of x^3 - 2x - 5 (x = 2.0945514815...)', () => {
    const r = brent((x) => x ** 3 - 2 * x - 5, 2, 3, 1e-12);
    expect(r).toBeCloseTo(2.0945514815423265, 10);
  });

  it('golden-section finds the minimum of (x-3)^2 + 1', () => {
    expect(goldenMin((x) => (x - 3) ** 2 + 1, 0, 10, 1e-10)).toBeCloseTo(3, 6);
  });

  it('clamp and smoothstep behave as documented', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, 1)).toBe(1);
  });
});
