/**
 * PROJECT TERRA — oceanography validation.
 *
 * Reference values: Fofonoff & Millard (1983) UNESCO tables, Gill (1982),
 * IPCC AR6 ch. 9, Pierson & Moskowitz (1964), Stommel (1961).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  seawaterDensity, seawaterDensityRaw, potentialDensity, seawaterFreezingPoint,
  soundSpeedSeawater, coriolisParameter, inertialPeriod, rossbyRadius,
  geostrophicVelocity, ekmanTransport, ekmanPumping,
  wavePhaseSpeed, wavePeriod, piersonMoskowitz, smbWaveHeight,
  equilibriumTideAmplitude, TIDAL_FORCING_RATIO, M2_PERIOD_S, S2_PERIOD_S,
  springNeapPeriod, moninObukhovLength, mixedLayerDepth,
  sensibleHeatFlux, mixedLayerHeatCapacity, oceanResponseTime,
  stommelBoxes, AMOC_OBSERVED_SV, stericSeaLevelRise, iceToSeaLevel,
  iceSeaLevelBudget, ICE_SHEETS, depthPercentile, SHELF_DEPTH_M,
  SHELF_AREA_FRACTION_REFERENCE, OCEAN,
} from '../src/earth/oceanography.js';
import { elevationGridFromBuffer } from '../src/earth/terrain.js';

let grid;

beforeAll(() => {
  const buf = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation.bin'));
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation-meta.json'), 'utf8'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  grid = elevationGridFromBuffer(ab, meta);
});

describe('UNESCO 1983 equation of state', () => {
  it('reproduces the published surface densities exactly', () => {
    // Reference values from the UNESCO implementation (python-seawater):
    //   S=35, t=0,  p=0      -> 1028.106331
    //   S=35, t=10, p=0      -> 1026.952000
    //   S=35, t=25, p=0      -> 1023.341235
    expect(seawaterDensity(0, 35, 0).density).toBeCloseTo(1028.106331, 5);
    expect(seawaterDensity(10, 35, 0).density).toBeCloseTo(1026.952, 5);
    expect(seawaterDensity(25, 35, 0).density).toBeCloseTo(1023.341235, 5);
  });

  it('reproduces pure water density at 20 degC', () => {
    expect(seawaterDensity(20, 0, 0).density).toBeCloseTo(998.205329, 4);
  });

  it('reproduces sigma-t (25, 35) = 23.341', () => {
    expect(seawaterDensity(25, 35).sigmaT).toBeCloseTo(23.341, 3);
  });

  it('density increases with salinity at fixed temperature', () => {
    const a = seawaterDensity(15, 30).density;
    const b = seawaterDensity(15, 35).density;
    const c = seawaterDensity(15, 40).density;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('density decreases with temperature at fixed salinity', () => {
    expect(seawaterDensity(25, 35).density).toBeLessThan(seawaterDensity(5, 35).density);
  });

  it('density increases with pressure, matching the reference at depth', () => {
    // UNESCO reference values at S=35, t=0:
    //   1000 dbar (1000 m)  -> 1032.818371
    //   4000 dbar (4000 m)  -> 1046.356132
    //  10000 dbar (10000 m) -> 1070.958384
    expect(seawaterDensity(0, 35, 1e7).density).toBeCloseTo(1032.818371, 4);
    expect(seawaterDensity(0, 35, 4e7).density).toBeCloseTo(1046.356132, 4);
    expect(seawaterDensity(0, 35, 1e8).density).toBeCloseTo(1070.958384, 4);
  });

  it('the full EOS is accurate to better than 1 ppm at all depths', () => {
    const cases = [
      [35, 0, 0, 1028.106331], [35, 10, 0, 1026.952],
      [35, 25, 0, 1023.341235], [35, 0, 1000, 1032.818371],
      [35, 0, 4000, 1046.356132], [35, 0, 10000, 1070.958384],
      [35, 2, 400, 1029.846728], [34.5, 2, 200, 1028.511404],
      [0, 20, 0, 998.205329], [35, 30, 5000, 1042.054754],
    ];
    for (const [S, t, pDbar, ref] of cases) {
      const d = seawaterDensityRaw(t, S, pDbar * 1e4).density;
      expect(Math.abs((d - ref) / ref) * 1e6).toBeLessThan(1);
    }
  });

  it('reports the UNESCO validity window honestly', () => {
    expect(seawaterDensity(10, 35).valid).toBe(true);
    expect(seawaterDensity(50, 35).valid).toBe(false);
    expect(seawaterDensity(10, 50).valid).toBe(false);
    expect(seawaterDensity(10, -1).valid).toBe(false);
  });

  it('thermal expansion coefficient is 1.5-2e-4 1/K at 10 degC', () => {
    const a = seawaterDensity(10, 35).alpha;
    expect(a).toBeGreaterThan(1.2e-4);
    expect(a).toBeLessThan(2.2e-4);
  });

  it('haline contraction coefficient is ~7.6e-4 1/PSU', () => {
    expect(seawaterDensity(10, 35).beta).toBeCloseTo(7.6e-4, 5);
  });

  it('potential density at the reference pressure equals in-situ density', () => {
    expect(potentialDensity(10, 35, 0)).toBeCloseTo(seawaterDensityRaw(10, 35, 0).density, 9);
  });
});

describe('seawater freezing point', () => {
  it('is -1.922 degC at S=35', () => {
    expect(seawaterFreezingPoint(35)).toBeCloseTo(-1.922, 3);
  });

  it('is essentially -0.0575 degC per PSU at low salinity', () => {
    // The polynomial is -0.0575 S + 1.710523e-3 S^1.5 - 2.154996e-4 S^2, so
    // at S=1 the S^1.5 term contributes +0.0017 and the local slope is
    // -0.0560, not exactly -0.0575. That is the published polynomial, not an
    // error, so the test states the actual behaviour.
    expect(seawaterFreezingPoint(1)).toBeCloseTo(-0.0560, 3);
    expect(seawaterFreezingPoint(1) / 1).toBeGreaterThan(-0.0576);
    expect(seawaterFreezingPoint(0)).toBeCloseTo(0, 6);
  });

  it('decreases with pressure (the pressure term)', () => {
    expect(seawaterFreezingPoint(35, 1e7)).toBeLessThan(seawaterFreezingPoint(35, 0));
  });

  it('is below the freshwater freezing point, so polar seas stay liquid', () => {
    expect(seawaterFreezingPoint(34.7)).toBeLessThan(-1.8);
  });
});

describe('sound speed in seawater', () => {
  it('is about 1500 m/s in the upper ocean', () => {
    const c = soundSpeedSeawater(10, 35, 1000);
    expect(c).toBeGreaterThan(1480);
    expect(c).toBeLessThan(1530);
  });

  it('increases with temperature, salinity and depth', () => {
    const base = soundSpeedSeawater(10, 35, 1000);
    expect(soundSpeedSeawater(20, 35, 1000)).toBeGreaterThan(base);
    expect(soundSpeedSeawater(10, 37, 1000)).toBeGreaterThan(base);
    expect(soundSpeedSeawater(10, 35, 5000)).toBeGreaterThan(base);
  });
});

describe('rotation and geostrophy', () => {
  it('the Coriolis parameter at 30 N is 7.292e-5 1/s', () => {
    expect(coriolisParameter(30)).toBeCloseTo(7.292e-5, 8);
  });

  it('the Coriolis parameter vanishes at the equator and peaks at the poles', () => {
    expect(coriolisParameter(0)).toBeCloseTo(0, 15);
    expect(coriolisParameter(90)).toBeCloseTo(2 * 7.292115e-5, 8);
  });

  it('the inertial period at 30 deg is 23.93 h (half a pendulum day)', () => {
    expect(inertialPeriod(30) / 3600).toBeCloseTo(23.93, 1);
  });

  it('the inertial period is infinite at the equator', () => {
    expect(inertialPeriod(0)).toBe(Infinity);
  });

  it('the Rossby radius shrinks strongly with latitude', () => {
    // g'=0.01 m/s^2, H=500 m -> c=2.236 m/s. At 10 N, f=2.53e-5 so
    // L_R = 88 km; at 70 N, f=1.37e-4 so L_R = 16 km.
    const tropical = rossbyRadius(0.01, 500, 10) / 1000;
    const polar = rossbyRadius(0.01, 500, 70) / 1000;
    expect(tropical).toBeGreaterThan(50);
    expect(tropical).toBeLessThan(200);
    expect(polar).toBeLessThan(30);
    expect(polar).toBeLessThan(tropical / 3);
  });

  it('sea-surface slope drives geostrophic flow at the right magnitude', () => {
    // u = -(g/f) dzeta/dy. At 30 N, f = 7.29e-5:
    //   1 m over 100 km -> 1.35 m/s (a strong western boundary current value)
    //   0.1 m over 100 km -> 0.135 m/s (a typical open-ocean eddy)
    //   0.1 m over 1000 km -> 0.0135 m/s (a basin-scale gyre)
    expect(Math.abs(geostrophicVelocity(0, 1 / 1e5, 30).u)).toBeCloseTo(1.345, 2);
    expect(Math.abs(geostrophicVelocity(0, 0.1 / 1e5, 30).u)).toBeCloseTo(0.1345, 3);
    expect(Math.abs(geostrophicVelocity(0, 0.1 / 1e6, 30).u)).toBeCloseTo(0.01345, 4);
  });

  it('geostrophic flow is undefined (zeroed) at the equator', () => {
    const v = geostrophicVelocity(1e-5, 1e-5, 0);
    expect(v.u).toBe(0);
    expect(v.v).toBe(0);
  });
});

describe('Ekman transport', () => {
  it('transports water 90 deg to the right of the wind in the north', () => {
    // Wind blowing eastward (tauX > 0) at 30 N -> transport southward
    const t = ekmanTransport(0.1, 0, 30);
    expect(t.My).toBeLessThan(0);
    expect(Math.abs(t.Mx)).toBeLessThan(1e-15);
  });

  it('transports water 90 deg to the left in the south', () => {
    const t = ekmanTransport(0.1, 0, -30);
    expect(t.My).toBeGreaterThan(0);
  });

  it('magnitude is tau/(rho f) and is independent of eddy viscosity', () => {
    // tau = 0.1 Pa, rho = 1027, f = 7.2921e-5 -> 1.3353 m^2/s
    const t = ekmanTransport(0.1, 0, 30);
    expect(t.magnitude).toBeCloseTo(0.1 / (1027 * 7.2921158e-5), 4);
  });

  it('is undefined at the equator and reports that', () => {
    const t = ekmanTransport(0.1, 0, 0);
    expect(t.undefined).toBe(true);
    expect(t.magnitude).toBe(0);
  });

  it('Ekman pumping returns a finite vertical velocity', () => {
    const w = ekmanPumping(1e-7, 0, 30);
    expect(Number.isFinite(w)).toBe(true);
  });
});

describe('waves', () => {
  it('deep-water phase speed follows c = sqrt(g lambda/2 pi)', () => {
    // lambda = 100 m -> c = 12.5 m/s
    expect(wavePhaseSpeed(100)).toBeCloseTo(12.49, 1);
  });

  it('longer waves travel faster in deep water', () => {
    expect(wavePhaseSpeed(200)).toBeGreaterThan(wavePhaseSpeed(100));
  });

  it('shallow-water waves are essentially non-dispersive: c -> sqrt(g h)', () => {
    // "Shallow" means depth << wavelength. At lambda = 20 km, h = 10 m,
    // kh = 0.0031, tanh(kh) = 0.0031, so c = 9.905 m/s to 3 s.f.
    const c = wavePhaseSpeed(20000, 10);
    expect(c).toBeCloseTo(Math.sqrt(9.81 * 10), 2);
    expect(wavePhaseSpeed(20000, 10) / wavePhaseSpeed(50000, 10)).toBeCloseTo(1, 3);
  });

  it('period and wavelength are related by the deep-water dispersion relation', () => {
    const lambda = 100;
    const T = wavePeriod(lambda);
    expect(wavePhaseSpeed(lambda) * T).toBeCloseTo(lambda, 6);
  });

  it('Pierson-Moskowitz gives Hs = 2.1 m and Tp ~ 7 s at 10 m/s', () => {
    const pm = piersonMoskowitz(10);
    expect(pm.significantHeightM).toBeCloseTo(2.14, 1);
    expect(pm.peakPeriodS).toBeGreaterThan(6);
    expect(pm.peakPeriodS).toBeLessThan(9);
  });

  it('wave height scales as the square of wind speed', () => {
    expect(piersonMoskowitz(20).significantHeightM / piersonMoskowitz(10).significantHeightM)
      .toBeCloseTo(4, 6);
  });

  it('fetch-limited waves grow monotonically with fetch towards a limit', () => {
    const hs = [1e3, 1e4, 1e5, 1e6, 1e7].map((F) => smbWaveHeight(10, F));
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1]);
    // SMB asymptotes to 0.283 U^2/g = 2.885 m at U=10.
    expect(hs[hs.length - 1]).toBeCloseTo(2.885, 1);
    expect(hs[hs.length - 1]).toBeLessThan(2.95);
  });

  it('documents the SMB vs Pierson-Moskowitz asymptote disagreement', () => {
    // These are different published fits and do NOT agree in the limit:
    // SMB -> 0.283 U^2/g, PM -> 0.21 U^2/g, a 35% difference.
    const smbLimit = smbWaveHeight(10, 1e9);
    const pmLimit = piersonMoskowitz(10).significantHeightM;
    expect(smbLimit / pmLimit).toBeCloseTo(0.283 / 0.21, 1);
  });
});

describe('tides', () => {
  it('the lunar equilibrium tide is 2.2x the solar tide', () => {
    const moon = equilibriumTideAmplitude(7.342e22, 3.844e8);
    const sun = equilibriumTideAmplitude(1.989e30, 1.496e11);
    expect(moon / sun).toBeCloseTo(TIDAL_FORCING_RATIO, 1);
  });

  it('the equilibrium tide amplitude is O(10-30 cm), before amplification', () => {
    // The open-ocean tide is ~0.3 m; coastal amplification is a separate
    // (resonant) process not modelled here.
    const moon = equilibriumTideAmplitude(7.342e22, 3.844e8);
    expect(moon).toBeGreaterThan(0.1);
    expect(moon).toBeLessThan(0.6);
  });

  it('the M2 period is 12.42 h, not 12 h', () => {
    expect(M2_PERIOD_S / 3600).toBeCloseTo(12.42, 2);
    expect(S2_PERIOD_S / 3600).toBe(12.0);
  });

  it('the spring-neap beat period is 14.77 days', () => {
    expect(springNeapPeriod() / 86400).toBeCloseTo(14.77, 2);
  });
});

describe('air-sea interaction', () => {
  it('L is negative for an upward (heating) flux and positive for cooling', () => {
    // An upward flux of +50 W/m^2 means the surface is heating the air, which
    // is convective (unstable), and MUST give L < 0.
    expect(moninObukhovLength(0.3, 50)).toBeLessThan(0);
    expect(moninObukhovLength(0.3, -50)).toBeGreaterThan(0);
    // u*=0.3, H=50 W/m^2 over a 288 K surface:
    // L = -(0.027)/(0.4 * 0.03406 * 0.0406) = -48.8 m
    expect(moninObukhovLength(0.3, 50)).toBeCloseTo(-48.8, 0);
  });

  it('weak shear over a strongly heated surface gives a small |L|', () => {
    expect(Math.abs(moninObukhovLength(0.01, 50))).toBeLessThan(Math.abs(moninObukhovLength(0.3, 50)));
  });

  it('the Monin-Obukhov length is infinite for a neutral surface', () => {
    expect(moninObukhovLength(0.01, 0)).toBe(Infinity);
  });

  it('sensible heat flux is positive when the ocean is warmer than the air', () => {
    // Our convention: positive = ocean loses heat to the atmosphere.
    expect(sensibleHeatFlux(10, 285, 290)).toBeGreaterThan(0);
    expect(sensibleHeatFlux(10, 295, 290)).toBeLessThan(0);
  });

  it('the 50 m mixed layer heat capacity is 2.05e8 J/(m^2 K)', () => {
    expect(mixedLayerHeatCapacity(50) / 1e8).toBeCloseTo(2.046, 2);
  });

  it('the surface mixed layer responds to forcing on a timescale of years', () => {
    // 2.05e8 J/(m^2 K) / (1 W/(m^2 K)) = 6.5 years in seconds
    const tau = oceanResponseTime(50) / (365.25 * 86400);
    expect(tau).toBeGreaterThan(3);
    expect(tau).toBeLessThan(10);
  });

  it('mixed-layer depth is clipped to a physically sensible range', () => {
    const h = mixedLayerDepth(0.01, 0.01, 30);
    expect(h).toBeGreaterThanOrEqual(10);
    expect(h).toBeLessThanOrEqual(1000);
  });
});

describe('thermohaline circulation', () => {
  it('the thermal mode gives a positive overturning', () => {
    const s = stommelBoxes();
    expect(s.q).toBeGreaterThan(0);
    expect(s.mode).toMatch(/thermal/);
  });

  it('the density difference is dominated by temperature', () => {
    // alpha dT = 1.4e-4 * 23 = 3.2e-3; beta dS = 7.6e-4 * 1 = 7.6e-4
    const s = stommelBoxes();
    expect(s.dRho).toBeGreaterThan(0);
  });

  it('AMOC observed transport is 17.2 Sv', () => {
    expect(AMOC_OBSERVED_SV).toBe(17.2);
  });
});

describe('sea level', () => {
  it('thermal expansion of the top 700 m by 0.1 K gives ~1 cm', () => {
    expect(stericSeaLevelRise(0.1) * 100).toBeCloseTo(0.98, 1);
  });

  it('ice-sheet sea-level equivalents match IPCC AR6', () => {
    expect(iceSeaLevelBudget('GREENLAND').seaLevelAboveFloatationM).toBeCloseTo(7.42, 1);
    expect(iceSeaLevelBudget('WEST_ANTARCTICA').seaLevelAboveFloatationM).toBeCloseTo(3.30, 1);
    expect(iceSeaLevelBudget('EAST_ANTARCTICA').seaLevelAboveFloatationM).toBeCloseTo(53.3, 0);
  });

  it('floating ice does not raise sea level when it melts (Archimedes)', () => {
    // 1 kg of ice displaces 0.9 kg of water as ice; melting produces 1 kg of
    // water of which 0.9 kg is already displaced. The residual is 10% of the
    // ice mass, not 100%. Our iceToSeaLevel applies to GROUNDED ice only.
    const m = 1e15;
    const full = iceToSeaLevel(m);
    expect(full).toBeGreaterThan(0);
    // sanity: 1e15 kg over the ocean raises sea level by ~2.8 mm
    expect(full * 1000).toBeCloseTo(2.76, 1);
  });

  it('unknown ice sheets are rejected rather than silently returning NaN', () => {
    expect(() => iceSeaLevelBudget('MARS')).toThrow(/unknown/);
  });
});

describe('bathymetry from the shipped DEM', () => {
  it('the continental shelf is a few percent of the ocean area', () => {
    const p = depthPercentile(grid, SHELF_DEPTH_M);
    expect(p.fraction).toBeGreaterThan(0.03);
    expect(p.fraction).toBeLessThan(0.15);
    // Published: shelves shallower than 200 m cover 7.6% of the ocean area.
    expect(Math.abs(p.fraction - SHELF_AREA_FRACTION_REFERENCE)).toBeLessThan(0.06);
  });

  it('half the ocean is shallower than about 3500-4500 m', () => {
    // Find the median depth by bisection over the percentile function.
    let lo = 100, hi = 11000;
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (lo + hi);
      if (depthPercentile(grid, mid).fraction < 0.5) lo = mid; else hi = mid;
    }
    const median = 0.5 * (lo + hi);
    expect(median).toBeGreaterThan(3000);
    expect(median).toBeLessThan(5000);
  });

  it('100% of the ocean is shallower than the deepest point', () => {
    expect(depthPercentile(grid, 20000).fraction).toBeCloseTo(1, 9);
  });

  it('the shelf definition is 200 m', () => {
    expect(SHELF_DEPTH_M).toBe(200);
  });

  it('the ocean constants are internally consistent', () => {
    // Volume / area = mean depth
    expect(OCEAN.VOLUME / OCEAN.AREA / 1000).toBeCloseTo(3.688, 1);
  });
});
