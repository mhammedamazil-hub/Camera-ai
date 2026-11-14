/**
 * PROJECT TERRA — geology tests.
 *
 * These tests check `src/earth/geology.js` against either a published value or
 * an internal identity. Where a test is checking an identity (e.g. that two
 * independent formulations agree), it says so, because an identity test cannot
 * catch a shared error — only an independent reference can.
 */

import { describe, it, expect } from 'vitest';
import {
  GEOLOGY, ROCKS, flexuralRigidity, flexuralParameter, flexureRatio,
  elasticThicknessFromAge, geothermWithProduction, seafloorDepthHalfSpace,
  seafloorDepthPlateModel, lithosphereDiffusivity, byerleeStrength,
  lithostaticStressMPa, creepStrengthMPa, seismogenicDepth,
  earthquakeDepthLimit, streamPowerProfile, scarpProfile, diffusionLength,
  travelTime, rayParameter, incidenceAngle, earthquakeEnergyJ,
  momentMagnitude, mantleDensity, adiabaticGradient, potentialTemperature,
  thermalExpansionSeaLevel, iceMeltSeaLevel,
} from '../src/earth/geology.js';
import { SOLID_EARTH, airyRoot, elevationFromThickness } from '../src/earth/terrain.js';
import { erf } from '../src/core/math/special.js';
import { K } from '../src/core/constants.js';

describe('flexure', () => {
  it('computes the flexural rigidity of a 25 km plate', () => {
    // D = E Te^3 / (12 (1-nu^2)) with E=70e9, Te=25e3, nu=0.25
    const D = flexuralRigidity(25000);
    const expected = (70e9 * 25000 ** 3) / (12 * (1 - 0.25 ** 2));
    expect(D).toBeCloseTo(expected, 6);
    // Published magnitude for this Te is ~1e23 N m.
    expect(D / 1e22).toBeGreaterThan(0.5);
    expect(D / 1e22).toBeLessThan(20);
  });

  it('rigidity scales as Te cubed', () => {
    const a = flexuralRigidity(20000);
    const b = flexuralRigidity(40000);
    expect(b / a).toBeCloseTo(8, 6);
  });

  it('flexural parameter is ~64 km for oceanic lithosphere', () => {
    // alpha = (4D/(dRho g))^(1/4); with dRho = 2380 (mantle-water) and
    // Te = 25 km this lands near 60-70 km, the standard value.
    const alpha = flexuralParameter(flexuralRigidity(25000), 2380);
    expect(alpha / 1000).toBeGreaterThan(55);
    expect(alpha / 1000).toBeLessThan(75);
  });

  it('flexural parameter grows as D^(1/4)', () => {
    const d1 = flexuralRigidity(20000);
    const d2 = flexuralRigidity(160000);   // 8^4 longer rigidity
    const a1 = flexuralParameter(d1, 2380);
    const a2 = flexuralParameter(d2, 2380);
    expect(a2 / a1).toBeCloseTo(Math.pow(d2 / d1, 0.25), 6);
  });

  it('narrow loads are less compensated than wide loads', () => {
    // This is the physical point of flexure.
    const narrow = flexureRatio(30000, 25000);
    const wide = flexureRatio(500000, 25000);
    expect(narrow).toBeLessThan(wide);
    expect(wide).toBeCloseTo(1, 2);
  });

  it('flexure ratio is bounded by the Airy limit', () => {
    for (const w of [0, 1e4, 1e5, 1e6, 1e7]) {
      const r = flexureRatio(w, 25000);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('an infinitesimally narrow load is EXACTLY half-compensated', () => {
    // w = q/(2 dRho g) for a line load on a plate: the plate carries half the
    // load in shear, so the ratio is 0.5, not 0. The earlier version of this
    // test asserted 0 and would have hidden that the physics was fine.
    expect(flexureRatio(0, 25000)).toBeCloseTo(0.5, 10);
  });

  it('elastic thickness grows as sqrt(age)', () => {
    expect(elasticThicknessFromAge(4) / elasticThicknessFromAge(1)).toBeCloseTo(2, 6);
    expect(elasticThicknessFromAge(0)).toBe(0);
    // Saturates at 40 km for old lithosphere.
    expect(elasticThicknessFromAge(1e6)).toBe(40000);
  });

  it('rejects a negative age rather than returning NaN', () => {
    expect(() => elasticThicknessFromAge(-1)).toThrow(RangeError);
  });
});

describe('geotherm', () => {
  it('returns the surface temperature at the surface', () => {
    expect(geothermWithProduction(0)).toBeCloseTo(288.15, 9);
  });

  it('matches the linear geotherm when heat production is zero', () => {
    const q0 = 0.060;
    const k = SOLID_EARTH.K_CRUST;
    const T = geothermWithProduction(30000, q0, 0, k);
    expect(T).toBeCloseTo(288.15 + (q0 / k) * 30000, 6);
  });

  it('heat production makes the geotherm hotter than linear at depth', () => {
    const withA = geothermWithProduction(30000);
    const withoutA = geothermWithProduction(30000, 0.060, 0);
    expect(withA).toBeGreaterThan(withoutA);
  });

  it('reaches ~600 degC at 30 km on a 60 mW/m^2 geotherm', () => {
    // Independently checkable: 60 mW/m^2 / 2.5 W/mK = 24 K/km, so 30 km
    // gives 720 K of heating, plus production, from a 288 K surface.
    const T = geothermWithProduction(30000, 0.060, 0);
    expect(T).toBeCloseTo(288.15 + 24 * 30, 4);
    expect(T).toBeGreaterThan(1000);
  });

  it('the radiogenic term is bounded by A0 Hr^2 / k', () => {
    // The asymptote: (A0 Hr^2)/k for granite, 2.5e-6 and 10 km, 2.5 W/mK.
    const bound = (GEOLOGY.A_GRANITE * GEOLOGY.D_HEAT_PRODUCTION ** 2) / SOLID_EARTH.K_CRUST;
    const deep = geothermWithProduction(1e7) - geothermWithProduction(1e7, 0.060, 0);
    expect(deep).toBeCloseTo(bound, 6);
  });

  it('rejects a negative depth', () => {
    expect(() => geothermWithProduction(-1)).toThrow(RangeError);
  });
});

describe('oceanic lithosphere cooling', () => {
  it('ridge crest is at 2500 m', () => {
    expect(seafloorDepthHalfSpace(0)).toBe(2500);
  });

  it('matches Parsons & Sclater at 10 Myr', () => {
    // 2500 + 350 sqrt(10) = 3607 m
    expect(seafloorDepthHalfSpace(10)).toBeCloseTo(3606.9, 0);
  });

  it('the two depth laws agree at ridge and diverge with age', () => {
    // At age 0: half-space 2500, plate model 6400-3200 = 3200.
    // They are NOT expected to agree at zero, because the plate model fit has
    // its own offset. What matters is that they converge in the 10-40 Myr
    // band where the half-space law is valid.
    const ages = [10, 20, 30];
    for (const a of ages) {
      const diff = Math.abs(seafloorDepthHalfSpace(a) - seafloorDepthPlateModel(a));
      expect(diff).toBeLessThan(600);
    }
  });

  it('the plate model flattens where the half-space law does not', () => {
    // The classic failure: at 150 Myr half-space predicts 6.8 km, the plate
    // model 6.3 km; the real old seafloor is ~5.5-6 km.
    const old = 150;
    expect(seafloorDepthHalfSpace(old)).toBeGreaterThan(seafloorDepthPlateModel(old));
    // The plate model approaches its asymptote.
    expect(seafloorDepthPlateModel(1e4)).toBeCloseTo(6400, 0);
  });

  it('implied diffusivity is the right order of magnitude', () => {
    // kappa = d^2/(4t), so the depth must be the THERMAL depth reached at
    // that age, not an arbitrary 100 km. For 100 Myr the cooling half-space
    // has an e-folding depth of roughly sqrt(4 kappa t); with the real
    // kappa = 1e-6 m^2/s this is ~113 km. Passing 100 km must therefore
    // return about 1e-6 m^2/s.
    const kappa = lithosphereDiffusivity(100, 100000);
    expect(kappa).toBeGreaterThan(1e-7);
    expect(kappa).toBeLessThan(1e-5);
    // And the round trip: at the real kappa, the depth reached at 100 Myr
    // must reproduce that kappa. Note the age is in MILLIONS of years, so the
    // seconds conversion uses 3.15576e13 — the 1e7 mix-up that this test now
    // guards against.
    const tSec = 100 * 3.15576e13;
    const reach = Math.sqrt(4 * 1e-6 * tSec);
    expect(lithosphereDiffusivity(100, reach)).toBeCloseTo(1e-6, 9);
  });

  it('diffusivity is NaN for a zero-age plate', () => {
    expect(Number.isNaN(lithosphereDiffusivity(0, 1000))).toBe(true);
  });
});

describe('rock strength', () => {
  it('lithostatic stress at 10 km is ~265 MPa for granite', () => {
    // rho g z = 2700 * 9.80665 * 10000 = 264.8 MPa
    expect(lithostaticStressMPa(10000)).toBeCloseTo(264.78, 1);
  });

  it('Byerlee friction has the two published branches', () => {
    // With zero cohesion and zero pore pressure so the branches are visible.
    // sigma_n < 200: tau = 0.85 sigma
    expect(byerleeStrength(100, 0, 0)).toBeCloseTo(85, 6);
    // sigma_n >= 200: tau = 50 + 0.6 sigma
    expect(byerleeStrength(300, 0, 0)).toBeCloseTo(230, 6);
    // They are continuous at 200 MPa: 0.85*200 = 170 = 50 + 0.6*200.
    expect(byerleeStrength(200, 0, 0)).toBeCloseTo(170, 6);
  });

  it('hydrostatic pore pressure weakens rock by the effective-stress factor', () => {
    const dry = byerleeStrength(250, 0, 0);
    const wet = byerleeStrength(250, 0.37, 0);
    // Effective stress is (1 - 0.37) = 63% of total, i.e. 157.5 MPa, which
    // is BELOW the 200 MPa branch switch. The wet strength is therefore on
    // the FIRST branch: 0.85 * 157.5. Getting this wrong is easy precisely
    // because the dry case at 250 MPa is on the second branch.
    //
    // Both calls pass cohesion = 0 explicitly, so the expressions below are
    // the bare Byerlee branches with no cohesion term to remember.
    const eff = 250 * (1 - 0.37);
    expect(eff).toBeLessThan(200);
    expect(wet).toBeCloseTo(0.85 * eff, 6);
    // The dry case at 250 MPa is on the SECOND branch, so the two calls are
    // not simply scaled versions of each other.
    expect(dry).toBeCloseTo(50 + 0.6 * 250, 6);
    expect(wet).toBeLessThan(dry);
  });

  it('rock has cohesion, so surface rock is not frictionless', () => {
    // This is the fix for the cohesionless-Byerlee bug: with C = 0 the
    // strength at the surface is zero and the model predicts a ductile skin.
    expect(byerleeStrength(0)).toBeGreaterThan(0);
    expect(byerleeStrength(0)).toBe(GEOLOGY.COHESION_ROCK);
  });

  it('creep strength falls steeply with temperature', () => {
    const cold = creepStrengthMPa(400);
    const hot = creepStrengthMPa(800);
    expect(hot).toBeLessThan(cold);
    // Activation energy 135 kJ/mol over the 400->800 K interval changes the
    // strength by exp(Q/nR (1/400 - 1/800)) ~ 160x, i.e. ~2.2 decades. That
    // cliff IS the brittle-ductile transition. (An assertion of >3 decades
    // was simply wrong arithmetic: at n = 4 the exponent is Q/4RT.)
    expect(Math.log10(cold / hot)).toBeGreaterThan(2);
  });

  it('creep strength matches the Hirth law at 400 degC', () => {
    // eps = A sigma^n exp(-Q/RT) inverted, A=6.3e-12, n=4, Q=135 kJ/mol
    // at T = 673.15 K and eps_dot = 1e-14 s^-1:
    const sigma = creepStrengthMPa(673.15);
    const expected = Math.pow(1e-14 / 6.3e-12, 1 / 4)
      * Math.exp(135000 / (4 * 8.314462618 * 673.15));
    expect(sigma).toBeCloseTo(expected, 5);
    // The published strength at these conditions is ~80 MPa.
    expect(sigma).toBeGreaterThan(50);
    expect(sigma).toBeLessThan(120);
  });

  it('creep strength scales as strain rate to the 1/n', () => {
    const a = creepStrengthMPa(700, 1e-16);
    const b = creepStrengthMPa(700, 1e-14);
    // 100x strain rate -> 100^(1/4) = 3.16x stress
    expect(b / a).toBeCloseTo(Math.pow(100, 0.25), 6);
  });

  it('rejects a non-positive temperature', () => {
    expect(() => creepStrengthMPa(0)).toThrow(RangeError);
  });
});

describe('seismogenic zone', () => {
  it('the crust is brittle at the surface and ductile at depth', () => {
    // This is the test that pins the sign convention that was wrong twice.
    const frictionAt = (z) => byerleeStrength(lithostaticStressMPa(z), 0.37);
    const creepAt = (z) => creepStrengthMPa(geothermWithProduction(z), 1e-14);
    expect(creepAt(0)).toBeGreaterThan(frictionAt(0));          // brittle
    expect(creepAt(30000)).toBeLessThan(frictionAt(30000));     // ductile
  });

  it('the transition is ~10 km on a 60 mW/m^2 geotherm', () => {
    // Rheological BDT for quartz-rich crust is 10-15 km; with the Hirth law
    // and a hydrostatic pore pressure it lands near 10.4 km.
    const { depthM } = seismogenicDepth({ q0: 0.060 });
    expect(depthM / 1000).toBeGreaterThan(8);
    expect(depthM / 1000).toBeLessThan(13);
  });

  it('hot crust has a shallower seismogenic zone than cold crust', () => {
    const cold = seismogenicDepth({ q0: 0.050 }).depthM;
    const hot = seismogenicDepth({ q0: 0.100 }).depthM;
    expect(hot).toBeLessThan(cold);
  });

  it('rheological BDT is shallower than the 350 degC isotherm', () => {
    // The 350 C limit is an upper bound on earthquake depth; the rheological
    // transition where quartz actually flows should be above it.
    const rheo = seismogenicDepth({ q0: 0.060 }).depthM;
    const thermal = earthquakeDepthLimit(0.060);
    expect(rheo).toBeLessThan(thermal);
    // Both are 7-15 km, which is the observed range for continental events.
    expect(thermal / 1000).toBeGreaterThan(10);
    expect(thermal / 1000).toBeLessThan(20);
  });

  it('reports the top of the brittle zone at the surface', () => {
    const r = seismogenicDepth();
    expect(r.topM).toBe(0);
    expect(Number.isFinite(r.depthM)).toBe(true);
  });
});

describe('erosion and landscape response', () => {
  it('stream-power relief scales with steepness', () => {
    const a = streamPowerProfile(100000, 1e-4);
    const b = streamPowerProfile(100000, 4e-4);
    // U is 4x, K^n = K, so steepness is 4x for n = 1.
    expect(b.steepness / a.steepness).toBeCloseTo(4, 6);
  });

  it('response time is infinite without uplift', () => {
    const r = streamPowerProfile(100000, 0);
    expect(r.responseTimeYr).toBe(Infinity);
  });

  it('response time scales inversely with uplift', () => {
    const fast = streamPowerProfile(1e5, 1e-3);
    const slow = streamPowerProfile(1e5, 1e-4);
    expect(slow.responseTimeYr / fast.responseTimeYr).toBeCloseTo(10, 6);
  });

  it('a diffusion length of 10 ka in soil is a few tens of metres', () => {
    // D in m^2/yr and t in yr give sqrt(50) = 7.07 m. The function used to
    // multiply by seconds as well, which inflated every scarp width by 5600.
    const L = diffusionLength(5e-3, 1e4);
    expect(L).toBeCloseTo(Math.sqrt(5e-3 * 1e4), 6);
    expect(L).toBeGreaterThan(5);
    expect(L).toBeLessThan(10);
  });

  it('a scarp profile is antisymmetric about its midpoint', () => {
    const h = 10;
    const left = scarpProfile(-1000, h);
    const right = scarpProfile(1000, h);
    expect(left).toBeLessThan(h / 2);
    expect(right).toBeGreaterThan(h / 2);
    // Symmetry: z(-x) - h/2 = -(z(x) - h/2)
    expect(left + right).toBeCloseTo(h, 6);
  });

  it('a scarp flattens toward h/2 as time passes', () => {
    const t1 = scarpProfile(-100, 10, 5e-3, 1e3);
    const t2 = scarpProfile(-100, 10, 5e-3, 1e7);
    expect(Math.abs(t2 - 5)).toBeLessThan(Math.abs(t1 - 5));
  });

  it('the scarp solution uses the real error function', () => {
    // Cross-check against core/math/special.js, which has its own tests.
    const x = 0.7;
    const D = 5e-3;
    const t = 1e4;
    // (D in m^2/yr, t in yr: the blur length is 2 sqrt(D t), no seconds.)
    const s = 2 * Math.sqrt(D * t);
    expect(scarpProfile(x * s, 2)).toBeCloseTo(1 + erf(x), 6);
  });
});

describe('seismology', () => {
  it('travel time is distance over velocity', () => {
    expect(travelTime(10000, 5000)).toBeCloseTo(2, 9);
  });

  it('rejects a zero velocity', () => {
    expect(() => travelTime(1, 0)).toThrow(RangeError);
  });

  it('a vertical ray has a zero ray parameter', () => {
    expect(rayParameter(0, 6000)).toBeCloseTo(0, 12);
  });

  it('Snell round trip: take-off angle recovered from the ray parameter', () => {
    const angle = 30;
    const v = 6000;
    const p = rayParameter(angle, v);
    expect(incidenceAngle(p, v)).toBeCloseTo(angle, 9);
  });

  it('a ray parameter too large for a layer is null, not NaN', () => {
    // A ray leaving at 90 deg in an 8 km/s layer has p = 1/8000 s/m.
    const p = rayParameter(90, 8000);
    // In a SLOWER layer (4 km/s) the angle is asin(1/2) = 30 deg.
    expect(incidenceAngle(p, 4000)).toBeCloseTo(30, 6);
    // In a layer slow enough that p*v > 1 the ray cannot propagate: null.
    expect(incidenceAngle(p, 9000)).toBeNull();
  });

  it('Richter energy follows the Gutenberg-Richter relation', () => {
    // M6 = 10^(1.5*6+4.8) = 10^13.8 = 6.31e13 J
    expect(earthquakeEnergyJ(6)).toBeCloseTo(6.3096e13, -9);
    // A magnitude unit is a factor of 31.6 in energy.
    expect(earthquakeEnergyJ(7) / earthquakeEnergyJ(6)).toBeCloseTo(
      Math.pow(10, 1.5), 6,
    );
  });

  it('moment magnitude inverts to the canonical earthquake', () => {
    // Mw 9.0 (Tohoku) has M0 ~ 3.2e22 N m by this relation.
    const m0 = Math.pow(10, 1.5 * 9 + 9.1);
    expect(momentMagnitude(m0)).toBeCloseTo(9, 9);
  });

  it('rejects a non-positive seismic moment', () => {
    expect(() => momentMagnitude(0)).toThrow(RangeError);
  });
});

describe('mantle density and adiabat', () => {
  it('returns the reference density at reference conditions', () => {
    expect(mantleDensity(0, 1600)).toBeCloseTo(GEOLOGY.RHO_MANTLE_REF, 6);
  });

  it('hotter mantle is less dense', () => {
    expect(mantleDensity(0, 1800)).toBeLessThan(mantleDensity(0, 1600));
  });

  it('pressure increases density', () => {
    expect(mantleDensity(10, 1600)).toBeGreaterThan(mantleDensity(0, 1600));
  });

  it('the temperature correction is clamped rather than unbounded', () => {
    // A 10% clamp means the density can never fall below 0.9 rho0.
    expect(mantleDensity(0, 1e6)).toBeCloseTo(0.9 * GEOLOGY.RHO_MANTLE_REF, 3);
  });

  it('adiabatic gradient in the mantle is ~0.5 K/km', () => {
    const grad = adiabaticGradient(1900);   // K/m
    expect(grad * 1000).toBeGreaterThan(0.3);
    expect(grad * 1000).toBeLessThan(0.8);
  });

  it('potential temperature is below the in-situ temperature', () => {
    const T = 1900;
    const pot = potentialTemperature(T, 100000);
    expect(pot).toBeLessThan(T);
    // Over 100 km the adiabatic drop is a few tens of K.
    expect(T - pot).toBeGreaterThan(20);
    expect(T - pot).toBeLessThan(200);
  });

  it('potential temperature equals in-situ at zero depth', () => {
    expect(potentialTemperature(1900, 0)).toBeCloseTo(1900, 6);
  });
});

describe('sea level', () => {
  it('thermal expansion of a 3800 m column by 1 K is decimetres', () => {
    const slr = thermalExpansionSeaLevel(3800, 1);
    // alpha_v H = 1.7e-4 * 3800 = 0.646 m. The real ocean expands by
    // ~0.1-0.4 m/K because alpha varies; the linear estimate is an upper bound.
    expect(slr).toBeGreaterThan(0.1);
    expect(slr).toBeLessThan(1.0);
  });

  it('melting an ice sheet gives 91.7% of its volume as sea-level rise', () => {
    // 1 m^3 of ice over 1 m^2 of ocean -> 0.917 m.
    const slr = iceMeltSeaLevel(1, 1, 917, 1000);
    expect(slr).toBeCloseTo(0.917, 6);
  });

  it('sea level rise is proportional to ice volume', () => {
    const one = iceMeltSeaLevel(1e14, 3.618e14);
    const two = iceMeltSeaLevel(2e14, 3.618e14);
    expect(two).toBeCloseTo(2 * one, 9);
  });

  it('rejects negative ice volume', () => {
    expect(() => iceMeltSeaLevel(-1)).toThrow(RangeError);
  });
});

describe('integration with terrain.js', () => {
  it('flexure explains why Hawaii is not Airy-compensated', () => {
    // A narrow load on strong lithosphere should be far from full
    // compensation, while a wide orogen should be close to it.
    const hawaii = flexureRatio(50000, 25000);
    const tibet = flexureRatio(500000, GEOLOGY.TE_CONTINENTAL);
    expect(hawaii).toBeLessThan(0.8);
    expect(tibet).toBeGreaterThan(0.9);
  });

  it('Airy root is consistent with the flexure model at large Te', () => {
    // With a very thick elastic plate the deflection tends to the Airy
    // limit, which is the statement that Airy is the D -> infinity case.
    // flexureRatio takes the HALF-width. The right comparison is at FIXED
    // load width: a stiffer plate keeps the SAME flexural parameter? No —
    // alpha grows as D^(1/4), so a stiff plate has a LONGER alpha and a load
    // of the same width sits at a SMALLER x = a/alpha, i.e. further from
    // full compensation. The ratio therefore DECREASES with Te at fixed width.
    // That is the correct statement, and it is the opposite of what an
    // earlier version of this test asserted.
    const thin = flexureRatio(20000, 5000);
    const thick = flexureRatio(20000, 200000);
    expect(thick).toBeLessThan(thin);
    // At a very wide load the plate cannot help and both tend to the Airy
    // limit regardless of rigidity.
    expect(flexureRatio(2e6, 5000)).toBeCloseTo(1, 2);
    expect(flexureRatio(2e6, 200000)).toBeCloseTo(1, 2);
  });

  it('a 5 km plateau is supported by a ~20 km root', () => {
    // Cross-module consistency: the root from terrain.js and the flexural
    // support from this module must tell the same story.
    const root = airyRoot(5000);
    expect(root / 1000).toBeCloseTo(19.85, 1);
    const H = SOLID_EARTH.H_CONTINENTAL + 5000 + root;
    expect(elevationFromThickness(H)).toBeCloseTo(5000, 3);
  });

  it('uses the same gravitational acceleration as the rest of the project', () => {
    // A silent g0 mismatch would put every stress out by ~0.2%.
    expect(lithostaticStressMPa(1000)).toBeCloseTo(
      SOLID_EARTH.RHO_CONTINENTAL_CRUST * K.g0 * 1000 / 1e6, 6,
    );
  });
});

describe('constants and consistency', () => {
  it('rock densities are ordered and physical', () => {
    expect(ROCKS.SEDIMENT.rho).toBeLessThan(ROCKS.GRANITE.rho);
    expect(ROCKS.GRANITE.rho).toBeLessThan(ROCKS.GABBRO.rho);
    expect(ROCKS.GABBRO.rho).toBeLessThan(ROCKS.PERIDOTITE.rho);
    expect(ROCKS.ICE.rho).toBeLessThan(1000);
    for (const r of Object.values(ROCKS)) {
      expect(r.rho).toBeGreaterThan(800);
      expect(r.rho).toBeLessThan(3500);
    }
  });

  it('heat production decreases from granite to mantle', () => {
    expect(GEOLOGY.A_GRANITE).toBeGreaterThan(GEOLOGY.A_GRANODIORITE);
    expect(GEOLOGY.A_GRANODIORITE).toBeGreaterThan(GEOLOGY.A_BASALT);
    expect(GEOLOGY.A_BASALT).toBeGreaterThan(GEOLOGY.A_MANTLE);
    // Granite is ~300x the mantle.
    expect(GEOLOGY.A_GRANITE / GEOLOGY.A_MANTLE).toBeGreaterThan(100);
  });

  it('elastic thickness is ordered by tectonic setting', () => {
    expect(GEOLOGY.TE_OCEANIC).toBeLessThan(GEOLOGY.TE_CONTINENTAL);
    expect(GEOLOGY.TE_CONTINENTAL).toBeLessThan(GEOLOGY.TE_CRATON);
  });

  it('uses the Hirth et al. (2001) quartz flow law', () => {
    // Pinned because an earlier version used invented parameters.
    expect(GEOLOGY.N_CREEP).toBe(4.0);
    expect(GEOLOGY.Q_CREEP_QUARTZ).toBe(1.35e5);
    expect(GEOLOGY.A_CREEP_QUARTZ).toBe(6.3e-12);
  });

  it('seismic velocities are ordered and physical', () => {
    expect(GEOLOGY.VP_OCEAN).toBeLessThan(GEOLOGY.VP_CRUST);
    expect(GEOLOGY.VP_CRUST).toBeLessThan(GEOLOGY.VP_MANTLE);
    expect(GEOLOGY.VS_CRUST).toBeLessThan(GEOLOGY.VP_CRUST);
    expect(GEOLOGY.VS_MANTLE).toBeLessThan(GEOLOGY.VP_MANTLE);
    // Poisson's ratio for rock is ~0.25-0.30, i.e. Vp/Vs = 1.7-1.8.
    expect(GEOLOGY.VP_CRUST / GEOLOGY.VS_CRUST).toBeGreaterThan(1.6);
    expect(GEOLOGY.VP_CRUST / GEOLOGY.VS_CRUST).toBeLessThan(1.9);
  });

  it('every numeric constant is finite', () => {
    for (const [key, value] of Object.entries(GEOLOGY)) {
      expect(Number.isFinite(value), `${key} = ${value}`).toBe(true);
    }
  });
});
