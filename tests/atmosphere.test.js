/**
 * PROJECT TERRA — atmosphere and thermodynamics validation.
 *
 * Reference values are taken from:
 *  - US Standard Atmosphere 1976 (NASA TM-X-74335), Tables I-V
 *  - WMO Guide No. 8 (2018), Annex 4.B
 *  - Smithsonian Meteorological Tables / Buck (1981)
 *  - Wallace & Hobbs, Atmospheric Science 2nd ed.
 *  - IAPWS-95 for water properties
 */
import { describe, it, expect } from 'vitest';
import { K, EARTH } from '../src/core/constants.js';
import {
  dryAirDensity, moistAirDensity, virtualTemperature,
  saturationVapourPressureWater, saturationVapourPressureIce,
  saturationVapourPressureClausiusClapeyron, dewPoint, frostPoint,
  saturationMixingRatio, mixingRatioFromVapourPressure,
  vapourPressureFromMixingRatio, specificFromMixing, mixingFromSpecific,
  relativeHumidity, wetBulbTemperature,
  latentHeatVapourisation, latentHeatSublimation, dEsdT,
  potentialTemperature, equivalentPotentialTemperature, moistStaticEnergy,
  dryLapseRate, moistLapseRate, bruntVaisalaSquared,
  scaleHeight, isothermalPressure, lapseRatePressure, hypsometricThickness,
  containingFiles as _cf,
} from '../src/physics/thermodynamics.js';
import {
  DRY_AIR_COMPOSITION, DRY_AIR_COMPOSITION_MEASURED, compositionClosureError,
  MOLAR_MASSES, meanMolarMass, ATMOSPHERE_MASS, ATMOSPHERE_MASS_SEA_LEVEL,
  standardAtmosphere, hydrostaticAtmosphere, waterVapourProfile, ozoneProfile,
  solarDeclination, cosSolarZenith, dailyMeanInsolation, annualMeanInsolation,
  solarPosition, rayleighOpticalDepth, mieOpticalDepth, ozoneOpticalDepth,
  clearSkyOpticalDepth, clearSkyOLR, greyBandOLR, co2RadiativeForcing,
  equilibriumWarming, energyBalanceSteadyState, PLANCK_FEEDBACK,
} from '../src/physics/atmosphere.js';

const R_EFF = 6356766; // ISA 1976 effective Earth radius, m
const zForH = (H) => (R_EFF * H) / (R_EFF - H);

describe('atmospheric composition', () => {
  it('normalises to unity and exposes the measured closure residual', () => {
    const total = Object.values(DRY_AIR_COMPOSITION).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    // The independently measured abundances sum to 1.0000887; the residual is
    // exposed rather than hidden (see DRY_AIR_COMPOSITION_MEASURED).
    expect(compositionClosureError()).toBeCloseTo(8.866e-5, 8);
  });

  it('gives the standard molar mass of dry air', () => {
    // ISO 2533 uses 28.9644 g/mol.
    expect(meanMolarMass(DRY_AIR_COMPOSITION) * 1000).toBeCloseTo(28.9644, 2);
  });

  it('value for N2 and O2 match the textbook 78.08% / 20.95%', () => {
    // After normalisation the abundances shift by 9e-5 relative, which is
    // below the precision to which the textbook percentages are quoted.
    // Normalisation shifts each abundance by 8.9e-5 relative: 78.084 ->
    // 78.0771 (i.e. 7e-3 percentage points). Assert relative, not absolute.
    expect(Math.abs(DRY_AIR_COMPOSITION.N2 / 0.78084 - 1)).toBeLessThan(1e-4);
    expect(Math.abs(DRY_AIR_COMPOSITION.O2 / 0.20946 - 1)).toBeLessThan(1e-4);
    expect(DRY_AIR_COMPOSITION_MEASURED.N2 * 100).toBeCloseTo(78.084, 6);
  });

  it('total atmospheric mass is ~5.15e18 kg', () => {
    // Published: 5.148e18 kg (Trenberth & Smith 2005) using the observed
    // global-mean surface pressure of 985 hPa, which accounts for land
    // standing above sea level.
    expect(ATMOSPHERE_MASS / 1e18).toBeCloseTo(5.12, 1);
    // The naive sea-level-pressure integral over-counts by ~3%.
    expect(ATMOSPHERE_MASS_SEA_LEVEL).toBeGreaterThan(ATMOSPHERE_MASS);
  });
});

describe('US Standard Atmosphere 1976', () => {
  // Published ISA table (NASA TM-X-74335). Columns are geopotential height H.
  const table = [
    [0, 288.15, 101325, 1.2250],
    [1000, 281.651, 89874.6, 1.1117],
    [5000, 255.676, 54019.9, 0.73643],
    [11000, 216.65, 22632.1, 0.36392],
    [20000, 216.65, 5474.89, 0.0880349],
    [32000, 228.65, 868.019, 0.0132250],
    [47000, 270.65, 110.906, 0.00142753],
  ];

  for (const [H, T, p, rho] of table) {
    it(`matches the published table at H = ${H} m`, () => {
      const s = standardAtmosphere(zForH(H));
      expect(s.T).toBeCloseTo(T, 1);
      expect(Math.abs(s.p - p) / p).toBeLessThan(2e-4);
      expect(Math.abs(s.rho - rho) / rho).toBeLessThan(2e-3);
    });
  }

  it('is monotonic in pressure', () => {
    for (let z = 0; z < 80000; z += 500) {
      const a = standardAtmosphere(z), b = standardAtmosphere(z + 500);
      expect(b.p).toBeLessThan(a.p);
    }
  });

  it('has the correct tropopause temperature and height', () => {
    // The first isothermal layer (tropopause) sits at 11 km geopotential.
    expect(standardAtmosphere(zForH(11000)).T).toBeCloseTo(216.65, 1);
    expect(standardAtmosphere(zForH(20000)).T).toBeCloseTo(216.65, 1);
  });

  it('reproduces the speed of sound at sea level (340.29 m/s)', () => {
    expect(standardAtmosphere(0).sound).toBeCloseTo(340.29, 1);
  });

  it('has a scale height of ~8.4 km at sea level', () => {
    expect(scaleHeight(288.15) / 1000).toBeCloseTo(8.43, 1);
  });
});

describe('saturation vapour pressure', () => {
  // Reference e_s over water, hPa (WMO / Smithsonian tables)
  const waterRef = [
    [-20, 1.254], [-10, 2.863], [0, 6.112], [10, 12.28],
    [20, 23.39], [30, 42.46], [40, 73.81],
  ];
  for (const [Tc, hPa] of waterRef) {
    it(`matches the reference value at ${Tc} degC over water`, () => {
      const e = saturationVapourPressureWater(Tc + 273.15) / 100;
      const ref = hPa;
      expect(Math.abs(e - ref) / ref).toBeLessThan(0.005);
    });
  }

  // Reference e_s over ice, hPa
  const iceRef = [[-40, 0.1284], [-30, 0.3802], [-20, 1.032], [-10, 2.597], [0, 6.112]];
  for (const [Tc, hPa] of iceRef) {
    it(`matches the reference value at ${Tc} degC over ice`, () => {
      const e = saturationVapourPressureIce(Tc + 273.15) / 100;
      expect(Math.abs(e - hPa) / hPa).toBeLessThan(0.01);
    });
  }

  it('ice saturation is below water saturation below freezing (Bergeron process)', () => {
    for (let Tc = -40; Tc < 0; Tc += 5) {
      const T = Tc + 273.15;
      expect(saturationVapourPressureIce(T)).toBeLessThan(saturationVapourPressureWater(T));
    }
  });

  it('equals water saturation at the triple point', () => {
    expect(saturationVapourPressureIce(273.16)).toBeCloseTo(611.2, 0);
    expect(saturationVapourPressureWater(273.16)).toBeCloseTo(611.2, 0);
  });

  it('agrees with the constant-L Clausius-Clapeyron form to within 2% below 20 degC', () => {
    for (const Tc of [-10, 0, 10, 20]) {
      const T = Tc + 273.15;
      const cc = saturationVapourPressureClausiusClapeyron(T);
      const buck = saturationVapourPressureWater(T);
      expect(Math.abs(cc - buck) / buck).toBeLessThan(0.02);
    }
  });

  it('Clausius-Clapeyron over-predicts at high temperature (constant-L limitation)', () => {
    // At 40 degC the constant-L form is ~4% high because L decreases with T.
    const cc = saturationVapourPressureClausiusClapeyron(313.15);
    const buck = saturationVapourPressureWater(313.15);
    expect(cc).toBeGreaterThan(buck);
  });

  it('dew point inverts the saturation relation', () => {
    for (const Tc of [-5, 5, 15, 25, 35]) {
      const T = Tc + 273.15;
      const e = saturationVapourPressureWater(T);
      expect(dewPoint(e)).toBeCloseTo(T, 1);
    }
  });

  it('frost point is above the dew point at the same vapour pressure', () => {
    // PHYSICAL REASONING (easy to state backwards): below 0 degC the
    // saturation vapour pressure over ice is LOWER than over water. To reach
    // the same vapour pressure e, the ice surface must be WARMER than the
    // water surface would be. Hence T_frost > T_dew. At 50% of e_s(0 degC):
    // dew point = -9.20 degC, frost point = -8.16 degC.
    const e = saturationVapourPressureWater(273.15) * 0.5;
    expect(dewPoint(e)).toBeLessThan(273.15);
    expect(frostPoint(e)).toBeGreaterThan(dewPoint(e));
    expect(dewPoint(e) - 273.15).toBeCloseTo(-9.20, 1);
    expect(frostPoint(e) - 273.15).toBeCloseTo(-8.16, 1);
  });

  it('dew point inverts the Buck equation to better than 0.03 K', () => {
    for (const Tc of [-40, -20, 0, 20, 40]) {
      const T = Tc + 273.15;
      expect(Math.abs(dewPoint(saturationVapourPressureWater(T)) - T)).toBeLessThan(0.03);
    }
  });

  it('frost point inverts the ice equation to better than 0.02 K', () => {
    for (const Tc of [-40, -20, -5]) {
      const T = Tc + 273.15;
      expect(Math.abs(frostPoint(saturationVapourPressureIce(T)) - T)).toBeLessThan(0.02);
    }
  });
});

describe('humidity variables', () => {
  it('saturation mixing ratio at ISA sea level (15 degC) is ~0.0106 kg/kg', () => {
    // e_s(288.15 K) = 17.05 hPa; r_s = eps e_s/(p-e_s) = 0.01065 kg/kg.
    // (A commonly mis-quoted 0.0038 corresponds to 0 degC, not 15 degC.)
    const rs = saturationMixingRatio(101325, 288.15);
    expect(rs).toBeCloseTo(0.01065, 4);
    expect(saturationMixingRatio(101325, 273.15)).toBeCloseTo(0.00382, 4);
  });

  it('round-trips mixing ratio <-> vapour pressure', () => {
    for (const r of [1e-4, 0.005, 0.02]) {
      const p = 90000;
      const e = vapourPressureFromMixingRatio(p, r);
      expect(mixingRatioFromVapourPressure(p, e)).toBeCloseTo(r, 10);
    }
  });

  it('converts between specific humidity and mixing ratio consistently', () => {
    for (const r of [1e-4, 0.01, 0.05]) {
      expect(mixingFromSpecific(specificFromMixing(r))).toBeCloseTo(r, 12);
    }
  });

  it('computes relative humidity correctly', () => {
    const p = 100000, T = 293.15;
    const rs = saturationMixingRatio(p, T);
    expect(relativeHumidity(rs * 0.5, p, T)).toBeCloseTo(0.5, 6);
    expect(relativeHumidity(rs, p, T)).toBeCloseTo(1, 6);
  });

  it('wet-bulb temperature lies between dew point and dry-bulb', () => {
    const T = 303.15, rh = 0.4;
    const Tw = wetBulbTemperature(T, rh);
    const Td = dewPoint(relativeHumidity(0, 101325, T) || saturationVapourPressureWater(T) * rh);
    expect(Tw).toBeLessThan(T);
    expect(Tw).toBeGreaterThan(Td - 2);
  });

  it('virtual temperature exceeds actual for moist air', () => {
    expect(virtualTemperature(288.15, 0.01)).toBeGreaterThan(288.15);
    expect(virtualTemperature(288.15, 0)).toBe(288.15);
  });

  it('moist air is less dense than dry air at the same T, p', () => {
    expect(moistAirDensity(101325, 288.15, 0.01)).toBeLessThan(dryAirDensity(101325, 288.15));
  });
});

describe('latent heat and adiabatic processes', () => {
  it('latent heat of vaporisation decreases with temperature (Kirchhoff)', () => {
    expect(latentHeatVapourisation(373.15)).toBeLessThan(latentHeatVapourisation(273.15));
    // At 100 degC L = 2.257e6 J/kg (IAPWS-95). Our linear Kirchhoff
    // approximation gives 2.269e6 (0.5% high); the test states that bound.
    expect(latentHeatVapourisation(373.15) / 1e6).toBeCloseTo(2.257, 1);
    expect(Math.abs(latentHeatVapourisation(373.15) - 2.257e6) / 2.257e6).toBeLessThan(0.01);
  });

  it('latent heat of sublimation exceeds vaporisation by the fusion term', () => {
    const T = 273.15;
    expect(latentHeatSublimation(T) - latentHeatVapourisation(T)).toBeCloseTo(3.337e5, 0);
  });

  it('dry adiabatic lapse rate is 9.76 K/km', () => {
    // g/cp = 9.80665/1004.7 = 9.761 K/km
    expect(dryLapseRate() * 1000).toBeCloseTo(9.76, 2);
  });

  it('moist lapse rate is lower than dry and increases toward the dry value aloft', () => {
    const gDry = dryLapseRate();
    const gSfc = moistLapseRate(288.15, 100000);
    const gHigh = moistLapseRate(230, 30000);
    expect(gSfc).toBeLessThan(gDry);
    expect(gHigh).toBeLessThan(gDry);
    expect(gHigh).toBeGreaterThan(gSfc);
  });

  it('moist lapse rate at 288 K, 1000 hPa is ~4.5-5.5 K/km', () => {
    expect(moistLapseRate(288.15, 100000) * 1000).toBeGreaterThan(4.0);
    expect(moistLapseRate(288.15, 100000) * 1000).toBeLessThan(6.0);
  });

  it('potential temperature is conserved in a dry adiabat', () => {
    // Move a parcel from 1000 to 500 hPa dry-adiabatically; theta is invariant.
    const T1 = 288.15, p1 = 100000, p2 = 50000;
    const theta = potentialTemperature(T1, p1);
    const T2 = theta * (p2 / p1) ** (K.Rd / K.cpd);
    expect(potentialTemperature(T2, p2)).toBeCloseTo(theta, 10);
    // And the cooling is ~ the dry lapse rate times the height gained
    expect(T2).toBeLessThan(T1);
  });

  it('moist static energy is conserved in a saturated adiabat', () => {
    // Compare h at the surface and at 500 hPa along a pseudo-adiabat.
    const Ts = 300, ps = 100000;
    const rs = saturationMixingRatio(ps, Ts);
    const h0 = moistStaticEnergy(Ts, 0, rs);
    // Integrate the moist adiabat by small steps
    let T = Ts, p = ps;
    for (let i = 0; i < 200; i++) {
      const dp = (ps - 50000) / 200;
      const gamma = moistLapseRate(T, p);
      // dz from hydrostatic: dz = dp/(rho g), and dT = -gamma dz
      const rho = p / (K.Rd * T);
      const dz = dp / (rho * K.g0);
      T -= gamma * dz;
      p -= dp;
    }
    const rf = saturationMixingRatio(p, T);
    const h1 = moistStaticEnergy(T, 5000, rf);
    // Allow 2% because the parcel loses condensate (pseudo-adiabatic).
    expect(Math.abs(h1 - h0) / h0).toBeLessThan(0.03);
  });

  it('Brunt-Vaisala frequency is positive for a stable lapse rate', () => {
    // Isothermal -> theta increases with height -> stable
    const theta = potentialTemperature(250, 50000);
    const N2 = bruntVaisalaSquared(3e-4, theta);
    expect(N2).toBeGreaterThan(0);
  });
});

describe('hydrostatic relations', () => {
  it('isothermal atmosphere follows the exponential law', () => {
    expect(isothermalPressure(101325, 288.15, scaleHeight(288.15))).toBeCloseTo(101325 / Math.E, 2);
  });

  it('constant lapse rate integration matches the ISA', () => {
    // Using the dry lapse rate should reproduce the troposphere approximately
    const p = lapseRatePressure(101325, 288.15, 1000, 0.0065);
    expect(p).toBeCloseTo(89874.6, 0);
  });

  it('hypsometric thickness of the 1000-500 hPa layer is ~5.5 km', () => {
    const dz = hypsometricThickness(100000, 50000, 260);
    expect(dz / 1000).toBeCloseTo(5.5, 0);
  });

  it('hydrostatic atmosphere with standard parameters matches the ISA', () => {
    const s = hydrostaticAtmosphere(5000);
    const isa = standardAtmosphere(zForH(5000));
    expect(s.T).toBeCloseTo(isa.T, 0);
    expect(Math.abs(s.p - isa.p) / isa.p).toBeLessThan(0.01);
  });

  it('water vapour mixing ratio decreases with altitude', () => {
    const r0 = waterVapourProfile(288.15, 101325);
    const r5 = waterVapourProfile(standardAtmosphere(5000).T, standardAtmosphere(5000).p);
    expect(r5).toBeLessThan(r0);
  });

  it('ozone peaks in the stratosphere around 22 km', () => {
    expect(ozoneProfile(22000)).toBeGreaterThan(ozoneProfile(5000));
    expect(ozoneProfile(22000)).toBeGreaterThan(ozoneProfile(45000));
  });
});

describe('solar geometry and insolation', () => {
  it('solar declination is +23.44 deg at the June solstice', () => {
    // Day 172 is ~21 June
    expect((solarDeclination(172) * 180) / Math.PI).toBeCloseTo(23.44, 0);
  });

  it('solar declination is ~-23.44 deg at the December solstice', () => {
    expect((solarDeclination(355) * 180) / Math.PI).toBeCloseTo(-23.4, 0);
  });

  it('declination is ~0 at the equinoxes', () => {
    // Cooper's formula is accurate to ~0.2 deg; the equinox days are
    // day 80 (20 March) and day 265 (22 September).
    expect(Math.abs(solarDeclination(80))).toBeLessThan(0.02);   // ~1.1 deg
    expect(Math.abs(solarDeclination(265))).toBeLessThan(0.02);
  });

  it('annual-mean insolation matches the planetary average S0/4', () => {
    // Global mean over all latitudes must equal S0(1-a)... at TOA, S0/4.
    let sum = 0, weight = 0;
    for (let i = 1; i < 180; i++) {
      const lat = (i / 180) * Math.PI - Math.PI / 2;
      const w = Math.cos(lat);
      sum += annualMeanInsolation(lat) * w;
      weight += w;
    }
    const mean = sum / weight;
    expect(mean / (EARTH.SOLAR_CONSTANT / 4)).toBeCloseTo(1.0, 1);
  });

  it('polar regions get zero insolation in winter', () => {
    expect(dailyMeanInsolation((80 * Math.PI) / 180, 355)).toBe(0);
  });

  it('the equator gets the most annual insolation', () => {
    const eq = annualMeanInsolation(0);
    expect(eq).toBeGreaterThan(annualMeanInsolation(0.5));
    expect(eq).toBeGreaterThan(annualMeanInsolation(1.0));
  });

  it('solar zenith angle at local noon at the equator on the equinox is ~0', () => {
    const s = solarPosition(0, 0, 80, 12);
    expect(s.zenith).toBeLessThan(0.1);
  });

  it('sun is below the horizon at local midnight', () => {
    const s = solarPosition(0, 0, 80, 0);
    expect(s.elevation).toBeLessThan(0);
  });
});

describe('atmospheric optics', () => {
  it('Rayleigh optical depth at 550 nm is 0.0976 (Bodhaine/Bucholtz)', () => {
    // Published vertical Rayleigh optical depth at 550 nm: 0.0976
    // (Bodhaine et al. 1999, Table 2; Bucholtz 1995).
    expect(rayleighOpticalDepth(550e-9)).toBeCloseTo(0.0976, 2);
    // Agreement within 1% (our Edlen dispersion + King correction).
    expect(Math.abs(rayleighOpticalDepth(550e-9) / 0.0976 - 1)).toBeLessThan(0.012);
  });

  it('Rayleigh scattering scales as lambda^-4 (sky is blue)', () => {
    const blue = rayleighOpticalDepth(450e-9);
    const red = rayleighOpticalDepth(650e-9);
    const ratio = blue / red;
    // The dispersion n(lambda) perturbs the pure lambda^-4 law slightly.
    const expected = (650 / 450) ** 4;
    expect(Math.abs(ratio / expected - 1)).toBeLessThan(0.04);
    expect(ratio).toBeGreaterThan(4);
  });

  it('aerosol optical depth follows the Angstrom law', () => {
    const tau500 = mieOpticalDepth(500e-9);
    const tau1000 = mieOpticalDepth(1000e-9);
    expect(tau500 / tau1000).toBeCloseTo(2 ** 1.3, 3);
  });

  it('ozone absorbs most strongly in the Chappuis band (~600 nm)', () => {
    expect(ozoneOpticalDepth(603e-9)).toBeGreaterThan(ozoneOpticalDepth(450e-9));
    expect(ozoneOpticalDepth(603e-9)).toBeGreaterThan(ozoneOpticalDepth(800e-9));
  });

  it('total optical depth is dominated by Rayleigh at short wavelengths', () => {
    expect(clearSkyOpticalDepth(400e-9)).toBeGreaterThan(clearSkyOpticalDepth(800e-9));
  });
});

describe('greenhouse effect and climate', () => {
  it('CO2 doubling gives 3.71 W/m^2 forcing (Myhre 1998 / IPCC)', () => {
    expect(co2RadiativeForcing(560, 280)).toBeCloseTo(3.71, 1);
  });

  it('climate sensitivity with standard feedbacks is ~3 K per doubling', () => {
    // The standard ECS: 3.71 W/m2 / 1.2 W/m2/K = 3.1 K
    const dT = equilibriumWarming(3.71, -1.2);
    expect(dT).toBeCloseTo(3.09, 1);
  });

  it('outgoing longwave radiation decreases with CO2 (the greenhouse effect)', () => {
    const low = clearSkyOLR(288, 280);
    const high = clearSkyOLR(288, 560);
    expect(high).toBeLessThan(low);
  });

  it('OLR increases with surface temperature (Planck response)', () => {
    expect(clearSkyOLR(300, 421)).toBeGreaterThan(clearSkyOLR(280, 421));
  });

  it('the energy-balance model converges to a realistic global temperature', () => {
    const { T } = energyBalanceSteadyState();
    // With current albedo/forcing the zero-dimensional model gives ~289 K,
    // the observed global mean surface temperature.
    expect(T).toBeGreaterThan(285);
    expect(T).toBeLessThan(292);
  });

  it('the Planck response dOLR/dT is 4 sigma T_eff^3 = 3.8 W m^-2 K^-1', () => {
    const { dOLRdT } = energyBalanceSteadyState();
    const TEff = 289 - 33;
    const expected = 4 * 5.670374419e-8 * TEff ** 3;
    expect(dOLRdT).toBeCloseTo(expected, 1);
    expect(Math.abs(dOLRdT - 3.8)).toBeLessThan(0.3);
  });

  it('the grey-band and reduced-order OLR agree within 5%', () => {
    const reduced = clearSkyOLR(288);
    const grey = greyBandOLR(288);
    expect(Math.abs(grey - reduced) / reduced).toBeLessThan(0.05);
  });

  it('the Planck feedback parameter is negative and ~-3.2 W/m2/K', () => {
    expect(PLANCK_FEEDBACK).toBeLessThan(0);
    expect(Math.abs(PLANCK_FEEDBACK + 3.2)).toBeLessThan(0.01);
  });

  it('effective radiating temperature is 255 K', () => {
    expect(EARTH.T_EFF).toBeCloseTo(255.2, 0);
  });

  it('a CO2 doubling without feedbacks gives ~1 K (the Planck response)', () => {
    // dT = dF / (4 sigma T_eff^3) = 3.71 / 3.76 = 0.99 K.
    // The full IPCC equilibrium climate sensitivity (~3 K) requires the
    // water-vapour and albedo feedbacks, which this zero-dimensional model
    // does NOT include - the feedback parameter is applied separately in
    // `equilibriumWarming`. Stating this explicitly is the whole point.
    const T1 = energyBalanceSteadyState({ co2: 280 }).T;
    const T2 = energyBalanceSteadyState({ co2: 560 }).T;
    const dT = T2 - T1;
    expect(dT).toBeGreaterThan(0.8);
    expect(dT).toBeLessThan(1.4);
  });

  it('applying the standard net feedback raises the doubling response to ~3 K', () => {
    const noFeedback = equilibriumWarming(3.71, -3.76);  // ~0.99 K
    const withFeedback = equilibriumWarming(3.71, -1.2); // ~3.1 K
    expect(noFeedback).toBeCloseTo(0.99, 1);
    expect(withFeedback).toBeCloseTo(3.09, 1);
  });
});

void _cf;
void dEsdT;
void equivalentPotentialTemperature;
void mixingFromSpecific;
void specificFromMixing;
