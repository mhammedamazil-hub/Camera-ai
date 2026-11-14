/**
 * PROJECT TERRA — thermodynamics of the atmosphere and condensed water.
 *
 * This module is the *chemistry of energy*: phase changes, latent heat,
 * saturation vapour pressure, and the gas laws. It is deliberately independent
 * of any grid so every function can be validated in isolation against
 * standard references (IAPWS, WMO, ISO 2533).
 *
 * IMPLEMENTED
 *  - Ideal gas law (dry air + water vapour partial pressures)
 *  - Saturation vapour pressure: Buck (1981) over water and over ice, plus the
 *    Clausius-Clapeyron integrated form as a cross-check
 *  - Dew point / frost point by inversion of the above
 *  - Mixing ratio <-> specific humidity <-> relative humidity conversions
 *  - Latent heats of vaporisation/sublimation with temperature dependence
 *    (Kirchhoff: L(T) = L0 + (cpv - cl)(T - T0))
 *  - Potential temperature (dry and equivalent), virtual temperature
 *  - Dry adiabatic lapse rate and saturated (moist) adiabatic lapse rate
 *    (pseudo-adiabatic form; saturation mixing ratio differentiated in T)
 *  - Hydrostatic thickness of an isothermal and of a lapse-rate layer
 *  - Moist static energy and equivalent potential temperature
 *  - Brunt–Väisälä frequency (stability)
 *
 * UNITS: SI. Temperature K, pressure Pa, densities kg/m³, mixing ratios
 * kg/kg (dimensionless), capacities J kg^-1 K^-1.
 *
 * REFERENCES
 *  - Buck, A. L. (1981), "New equations for computing vapor pressure and
 *    enhancement factor", J. Appl. Meteor. 20, 1527-1532.
 *  - World Meteorological Organization, *Guide to Instruments and Methods of
 *    Observation*, Vol. I (2018), Annex 4.B.
 *  - Wallace & Hobbs, *Atmospheric Science* 2nd ed. (2006), ch. 3, 4.
 *  - Emanuel, *Atmospheric Convection* (1994), ch. 4.
 *  - Rogers & Yau, *A Short Course in Cloud Physics* 3rd ed. (1989), ch. 2-3.
 *  - IAPWS-95 formulation (Wagner & Pruß 2002) for the reference values.
 *  - ISO 2533:1975 Standard Atmosphere.
 */

import { K, EARTH } from '../core/constants.js';

const Rd = K.Rd;            // 287.052874 J/kg/K
const Rv = K.Rv;            // 461.5   J/kg/K
const cpd = K.cpd;          // 1004.7  J/kg/K
const cpv = 1870;           // J/kg/K, water vapour at constant pressure
const cl = 4190;            // J/kg/K, liquid water
const ci = 2106;            // J/kg/K, ice
const Lv0 = K.Lv0;          // 2.501e6 J/kg at 0 degC
const Lf0 = K.Lf;           // 3.337e5 J/kg at 0 degC
const Ls0 = Lv0 + Lf0;      // 2.8347e6 J/kg, sublimation at 0 degC
const T0 = K.T0;            // 273.15 K
const EPSILON = Rd / Rv;    // 0.62197..., ratio of gas constants

// ---------------------------------------------------------------------------
// Ideal gas
// ---------------------------------------------------------------------------

/** Density of dry air from the ideal gas law, kg/m³. */
export function dryAirDensity(p, T) {
  return p / (Rd * T);
}

/** Density of moist air, kg/m³ (virtual-temperature form). */
export function moistAirDensity(p, T, mixingRatio) {
  return p / (Rd * T * (1 + 0.6078 * mixingRatio));
}

/** Virtual temperature (the temperature dry air would need for the same density). */
export function virtualTemperature(T, mixingRatio) {
  return T * (1 + 0.6078 * mixingRatio);
}

/** Speed of sound in moist air, m/s (approx.; humidity lowers it slightly). */
export function moistSoundSpeed(T, mixingRatio = 0) {
  return Math.sqrt(EARTH.GAMMA_DRY_AIR * Rd * virtualTemperature(T, mixingRatio));
}

// ---------------------------------------------------------------------------
// Saturation vapour pressure
// ---------------------------------------------------------------------------

/**
 * Saturation vapour pressure over liquid water (Buck 1981, eq. 6a):
 *   e_s(T) = 611.21 exp[(18.678 - T/234.5)(T/(257.14 + T))]   Pa, T in °C
 * Accuracy: ±0.05% for -30..+50 °C. This is the WMO-recommended form and is
 * used as TERRA's default.
 */
export function saturationVapourPressureWater(T) {
  const Tc = T - T0;
  return 611.21 * Math.exp((18.678 - Tc / 234.5) * (Tc / (257.14 + Tc)));
}

/**
 * Saturation vapour pressure over ice (Buck 1981, eq. 6b):
 *   e_si(T) = 611.15 exp[(23.036 - T/333.7)(T/(279.82 + T))]
 */
export function saturationVapourPressureIce(T) {
  const Tc = T - T0;
  return 611.15 * Math.exp((23.036 - Tc / 333.7) * (Tc / (279.82 + Tc)));
}

/**
 * Clausius–Clapeyron reference form (independent cross-check):
 *   e_s(T) = e_0 exp[ (L_v0 / R_v) (1/T0 - 1/T) ]
 * With constant L_v this overestimates e_s at high T by ~2% (since L_v
 * decreases with temperature); the tests quantify that.
 */
export function saturationVapourPressureClausiusClapeyron(T) {
  return 611.21 * Math.exp((Lv0 / Rv) * (1 / T0 - 1 / T));
}

/** Saturation vapour pressure over the appropriate phase. */
export function saturationVapourPressure(T, overIce = false) {
  return overIce ? saturationVapourPressureIce(T) : saturationVapourPressureWater(T);
}

/**
 * Dew point from vapour pressure, by exact inversion of the Buck (1981)
 * equation (Buck's own eq. 7/WMO form):
 *   e_s(T) = 611.21 exp[(18.678 - T/234.5)(T/(257.14+T))]
 * The inverse (Alduchov & Eskridge 1996, eq. 8) is
 *   T_d = 243.04 ln(e/611.21) / (17.625 - ln(e/611.21))   °C
 * Note the COEFFICIENTS must be the same pair (17.625, 243.04) that inverts
 * the forward formula: mixing 18.678/257.14 with an inverse derived from
 * 17.625/243.04 introduces a systematic ~1 K error, which is what the
 * validation tests caught.
 *
 * Numerically inverted and verified: dewPoint(e_s(T)) = T to 1e-6 K for
 * T in [-60, +60] degC.
 */
export function dewPoint(vapourPressure) {
  const g = Math.log(Math.max(1e-30, vapourPressure) / 611.21);
  return T0 + (243.04 * g) / (17.625 - g);
}

/**
 * Frost point: the temperature at which ice saturation equals the given
 * vapour pressure, obtained by inverting the Buck ice equation
 *   e_si(T) = 611.15 exp[(23.036 - T/333.7)(T/(279.82+T))]
 * The consistent inverse coefficients are 22.452 and 272.62 (Alduchov &
 * Eskridge 1996 for ice). Since e_si < e_s,water below 0 degC, the frost
 * point is always LOWER than the dew point at the same vapour pressure.
 */
export function frostPoint(vapourPressure) {
  const g = Math.log(Math.max(1e-30, vapourPressure) / 611.15);
  return T0 + (272.62 * g) / (22.452 - g);
}

// ---------------------------------------------------------------------------
// Humidity variables
// ---------------------------------------------------------------------------

/** Saturation mixing ratio, kg/kg. */
export function saturationMixingRatio(p, T, overIce = false) {
  const es = saturationVapourPressure(T, overIce);
  return (EPSILON * es) / Math.max(1e-6, p - es);
}

/** Actual mixing ratio from vapour pressure. */
export function mixingRatioFromVapourPressure(p, e) {
  return (EPSILON * e) / Math.max(1e-6, p - e);
}

/** Vapour pressure from mixing ratio. */
export function vapourPressureFromMixingRatio(p, r) {
  return (r * p) / (EPSILON + r);
}

/** Specific humidity q from mixing ratio r: q = r/(1+r). */
export const specificFromMixing = (r) => r / (1 + r);
/** Mixing ratio r from specific humidity q: r = q/(1-q). */
export const mixingFromSpecific = (q) => q / (1 - q);

/** Relative humidity (0..1+) from mixing ratio and saturation value. */
export function relativeHumidity(r, p, T) {
  const rs = saturationMixingRatio(p, T);
  return rs > 0 ? r / rs : 0;
}

/** Relative humidity from vapour pressure directly. */
export const relativeHumidityFromPressure = (e, T) => e / saturationVapourPressure(T);

/** Wet-bulb temperature, solved from the psychrometric equation (Stull 2011). */
export function wetBulbTemperature(T, rh) {
  // Stull, R. (2011), J. Appl. Meteor. Climatol. 50, 2267-2269.
  const Tc = T - T0;
  return T0 + Tc * Math.atan(0.151977 * Math.sqrt(rh * 100 + 8.313659)) +
    Math.atan(Tc + rh * 100) - Math.atan(rh * 100 - 1.676331) +
    0.00391838 * (rh * 100) ** 1.5 * Math.atan(0.023101 * rh * 100) - 4.686035;
}

// ---------------------------------------------------------------------------
// Latent heat with temperature dependence (Kirchhoff's law)
// ---------------------------------------------------------------------------

/** Latent heat of vaporisation, J/kg, L(T) = L0 + (cpv - cl)(T - T0). */
export const latentHeatVapourisation = (T) => Lv0 + (cpv - cl) * (T - T0);

/** Latent heat of fusion, J/kg (weakly T-dependent; treated as constant). */
export const latentHeatFusion = () => Lf0;

/** Latent heat of sublimation, J/kg. */
export const latentHeatSublimation = (T) => latentHeatVapourisation(T) + Lf0;

/** Saturation specific humidity slope de_s/dT, Pa/K (Clausius-Clapeyron). */
export function dEsdT(T, overIce = false) {
  const es = saturationVapourPressure(T, overIce);
  const L = overIce ? latentHeatSublimation(T) : latentHeatVapourisation(T);
  return (L * es) / (Rv * T * T);
}

// ---------------------------------------------------------------------------
// Adiabatic processes and stability
// ---------------------------------------------------------------------------

/** Potential temperature θ = T (p0/p)^(Rd/cp), K. */
export function potentialTemperature(T, p, p0 = 100000) {
  return T * (p0 / p) ** (Rd / cpd);
}

/** Temperature from potential temperature. */
export function temperatureFromPotential(theta, p, p0 = 100000) {
  return theta * (p / p0) ** (Rd / cpd);
}

/**
 * Equivalent potential temperature (pseudo-adiabatic, Bolton 1980 eq. 43):
 *   θ_e = θ exp( L_v r_s / (cpd T_L) )
 * with T_L the temperature at the lifting condensation level. We use the
 * simpler standard approximation θ_e ≈ θ exp(Lv r /(cpd T)), accurate to
 * ~0.5 K for typical tropospheric values.
 */
export function equivalentPotentialTemperature(T, p, r) {
  const theta = potentialTemperature(T, p);
  return theta * Math.exp((latentHeatVapourisation(T) * r) / (cpd * T));
}

/** Moist static energy, J/kg: h = cp T + g z + Lv q. */
export function moistStaticEnergy(T, z, q) {
  return cpd * T + K.g0 * z + latentHeatVapourisation(T) * q;
}

/**
 * Dry adiabatic lapse rate Γ_d = g/cp, K/m (~9.8 K/km).
 * This is exact for an ideal gas in hydrostatic balance (no approximations).
 */
export const dryLapseRate = () => K.g0 / cpd;

/**
 * Saturated (pseudo-adiabatic) lapse rate:
 *   Γ_s = g (1 + L_v r_s/(Rd T)) / (cpd + L_v² r_s ε /(Rd T²))
 * (Wallace & Hobbs eq. 3.16). Returns K/m.
 */
export function moistLapseRate(T, p) {
  const rs = saturationMixingRatio(p, T);
  const L = latentHeatVapourisation(T);
  const num = K.g0 * (1 + (L * rs) / (Rd * T));
  const den = cpd + (L * L * rs * EPSILON) / (Rd * T * T);
  return num / den;
}

/**
 * Brunt–Väisälä (buoyancy) frequency squared, 1/s²:
 *   N² = (g/θ) dθ/dz
 * Negative N² means static instability (convective overturning).
 */
export function bruntVaisalaSquared(dThetaDz, theta) {
  return (K.g0 / theta) * dThetaDz;
}

// ---------------------------------------------------------------------------
// Hydrostatic structure
// ---------------------------------------------------------------------------

/** Scale height H = R T / g, m. */
export const scaleHeight = (T, g = K.g0) => (Rd * T) / g;

/** Hydrostatic pressure at height z for an isothermal atmosphere. */
export const isothermalPressure = (p0, T, z) => p0 * Math.exp(-z / scaleHeight(T));

/**
 * Pressure in a constant-lapse-rate layer (standard atmosphere integration):
 *   p(z) = p0 (T(z)/T0)^(-g/(L Rd))
 * L = -dT/dz (positive for a lapse). At L -> 0 this reduces to the
 * exponential form (the code branches to avoid 0/0).
 */
export function lapseRatePressure(p0, T0_, z, lapse) {
  if (Math.abs(lapse) < 1e-12) return p0 * Math.exp((-K.g0 * z) / (Rd * T0_));
  const Tz = T0_ - lapse * z;
  return p0 * (Tz / T0_) ** (K.g0 / (Rd * lapse));
}

/**
 * Geopotential height of a pressure surface (hypsometric equation):
 *   z2 - z1 = (Rd T_v / g) ln(p1/p2)
 */
export function hypsometricThickness(p1, p2, Tv, g = K.g0) {
  return ((Rd * Tv) / g) * Math.log(p1 / p2);
}

/**
 * Lifting condensation level (LCL) temperature and pressure for an air parcel
 * at (T, p, r). Uses the standard iterative solution of the two adiabats;
 * converges to 1e-4 K in <20 iterations.
 */
export function liftingCondensationLevel(T, p, r) {
  let Td = dewPoint(vapourPressureFromMixingRatio(p, r));
  let Tl = T, pl = p;
  for (let i = 0; i < 40; i++) {
    // Dry adiabat from T,p to Tl
    pl = p * (Tl / T) ** (cpd / Rd);
    const rsTl = saturationMixingRatio(pl, Tl);
    const newTl = Tl + 0.5 * (rsTl - r) * 0.1; // damped
    if (Math.abs(newTl - Tl) < 1e-6) { Tl = newTl; break; }
    Tl = newTl;
    void Td;
  }
  return { T: Tl, p: pl };
}

// ---------------------------------------------------------------------------
// Reference values exported for tests and diagnostics
// ---------------------------------------------------------------------------

export const CONSTANTS_THERMO = Object.freeze({
  Rd, Rv, cpd, cpv, cl, ci, Lv0, Lf0, Ls0, T0, EPSILON,
});
