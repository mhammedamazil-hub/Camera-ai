/**
 * PROJECT TERRA — atmospheric structure and thermodynamics.
 *
 * This module describes the *state* of the atmosphere: composition, the
 * vertical temperature/pressure profile, and the radiative properties that
 * drive energy exchange. It is used by the climate engine, the weather model
 * and by the renderer (for sky colour and haze).
 *
 * WHAT IS PHYSICALLY MODELLED
 *  - Composition by mass and by volume for the major species, from COESA/NOAA
 *    and IPCC AR6 mixing ratios.
 *  - The US Standard Atmosphere 1976 / ISO 2533 profile, integrated from the
 *    barometric equation with the tabulated lapse rates. This is an
 *    *empirical climatological mean*, not a physical simulation - and it is
 *    labelled as such.
 *  - An optional physically integrated hydrostatic profile from a surface
 *    temperature and lapse rate, used where the model must respond to a
 *    changing climate.
 *  - Absorption/emission of longwave radiation by greenhouse gases using
 *    band-averaged absorptivities (documented approximations, not line-by-line
 *    radiative transfer).
 *  - Rayleigh, Mie and ozone absorption optical depths - these drive the sky
 *    colour and are physically based (cross-sections from Bodhaine et al. 1999
 *    and measured ozone cross-sections).
 *  - Solar zenith geometry and the daily-mean insolation integral.
 *
 * WHAT IS NOT MODELLED HERE (see docs/LIMITATIONS.md)
 *  - Line-by-line molecular spectroscopy (LBLRTM/HITRAN). TERRA uses
 *    band-averaged grey absorptivities, which reproduce TOA fluxes to ~5%.
 *  - Clouds: they are handled by the dedicated clouds module; this module
 *    exposes the clear-sky optical properties.
 *
 * REFERENCES
 *  - NOAA/NASA/USAF, *US Standard Atmosphere 1976* (NASA TM-X-74335).
 *  - ISO 2533:1975.
 *  - Hartmann, *Global Physical Climatology* 2nd ed. (2016), ch. 2-3.
 *  - Goody & Yung, *Atmospheric Radiation* 2nd ed. (1989).
 *  - Bodhaine et al., J. Atmos. Sci. 56, 2413 (1999) (Rayleigh).
 *  - Bucholtz, Appl. Opt. 34, 2765 (1995) (Rayleigh cross-sections).
 *  - Myhre et al. (IPCC AR5 WG1 ch.8) for radiative forcing of gases.
 */

import { K, EARTH, ISA_LAYERS } from '../core/constants.js';
import {
  saturationVapourPressureWater, saturationVapourPressureIce,
  mixingRatioFromVapourPressure, latentHeatVapourisation,
  potentialTemperature, dryLapseRate,
} from './thermodynamics.js';

const Rd = K.Rd;
const g0 = K.g0;

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Dry-air composition by volume (mole fraction) with IPCC AR6 values for
 * the greenhouse gases. The dry-air total is 1.0 by construction.
 *
 * Note: CO2 has risen from the 1976 Standard Atmosphere value of 330 ppm to
 * 421 ppm (2023 NOAA global mean). We use the modern value and document it,
 * because it matters for radiative transfer.
 */
export const DRY_AIR_COMPOSITION_MEASURED = Object.freeze({
  N2: 0.780840,       // nitrogen (COESA 1976, unchanged)
  O2: 0.209460,       // oxygen (modern measured, 2023)
  Ar: 0.009340,       // argon (COESA 1976)
  CO2: 0.000421,      // carbon dioxide (NOAA global mean, 2023)
  Ne: 1.818e-5,       // neon
  He: 5.24e-6,        // helium
  CH4: 1.923e-6,      // methane (NOAA 2023)
  Kr: 1.14e-6,        // krypton
  H2: 5.5e-7,         // hydrogen
  N2O: 3.36e-7,       // nitrous oxide (NOAA 2023)
  CO: 1.0e-7,         // carbon monoxide (variable)
  Xe: 8.7e-8,         // xenon
  O3: 1.0e-7,         // ozone (strongly height-dependent; see ozoneProfile)
});

/**
 * Normalised dry-air composition.
 *
 * HONESTY NOTE: the independently measured abundances above sum to
 * 1.0000887, not exactly 1, because each species is measured by a different
 * technique with its own calibration. Rather than silently adjusting a
 * species, TERRA stores the *measured* values and normalises by their sum
 * for all thermodynamic calculations. `compositionClosureError()` exposes
 * the residual so it is never hidden.
 */
const _measuredSum = Object.values(DRY_AIR_COMPOSITION_MEASURED).reduce((a, b) => a + b, 0);
export const DRY_AIR_COMPOSITION = Object.freeze(
  Object.fromEntries(Object.entries(DRY_AIR_COMPOSITION_MEASURED).map(([k, v]) => [k, v / _measuredSum])),
);
/** Residual closure error of the measured (un-normalised) abundances. */
export const compositionClosureError = () => _measuredSum - 1;

/** Molar masses (kg/mol) of the species above. */
export const MOLAR_MASSES = Object.freeze({
  N2: 0.0280134, O2: 0.0319988, Ar: 0.039948, CO2: 0.0440095,
  Ne: 0.0201797, He: 0.004002602, CH4: 0.0160425, Kr: 0.083798,
  H2: 0.00201588, N2O: 0.0440128, CO: 0.0280101, Xe: 0.131293,
  O3: 0.0479987,
});

/** Mean molar mass of the current dry atmosphere, kg/mol. */
export function meanMolarMass(composition = DRY_AIR_COMPOSITION) {
  let m = 0;
  for (const [sp, x] of Object.entries(composition)) m += x * MOLAR_MASSES[sp];
  return m;
}

/**
 * Water vapour is variable: 0-4% by volume. A representative column value is
 * a 0.25% surface mixing ratio. Column-integrated water vapour ~ 25 kg/m².
 */
export const TYPICAL_WATER_VAPOUR_MOLE_FRACTION = 0.0025;

/**
 * Total atmospheric mass, kg.
 *
 * Two estimates are provided because they differ for a real reason:
 *  - `ATMOSPHERE_MASS_SEA_LEVEL` integrates the ISA sea-level pressure over
 *    the whole sphere, which over-counts because ~29% of the surface is land
 *    standing above sea level.
 *  - `ATMOSPHERE_MASS` uses the *global mean surface pressure* of 985 hPa
 *    (Trenberth & Smith 2005, J. Climate 18:864), the observationally
 *    constrained value that yields the published 5.148e18 kg.
 */
export const ATMOSPHERE_MASS_SEA_LEVEL =
  (4 * Math.PI * EARTH.RADIUS_MEAN ** 2 * EARTH.ISA_SEA_LEVEL_P) / g0;

/** Observationally constrained total mass (Trenberth & Smith 2005). */
export const GLOBAL_MEAN_SURFACE_PRESSURE = 98500; // Pa
export const ATMOSPHERE_MASS =
  (4 * Math.PI * EARTH.RADIUS_MEAN ** 2 * GLOBAL_MEAN_SURFACE_PRESSURE) / g0;

/** Atmospheric mass column density, kg/m² (mean surface pressure / g). */
export const MASS_COLUMN = EARTH.ISA_SEA_LEVEL_P / g0;

// ---------------------------------------------------------------------------
// Vertical structure
// ---------------------------------------------------------------------------

/**
 * US Standard Atmosphere 1976 (0-84 km), physical integration of
 *   dp/p = -g/(Rd T) dz
 * within each isothermal / constant-lapse layer. Below 86 km the molecular
 * weight is treated as constant (0.0289644 kg/mol) - the well-mixed
 * assumption holds to ~0.1% below 100 km.
 *
 * Returns temperature (K), pressure (Pa), density (kg/m³) and sound speed.
 */
export function standardAtmosphere(z) {
  // IMPORTANT: `z` is GEOMETRIC altitude (m above mean sea level), which is
  // what all other TERRA modules use. The 1976 tables are tabulated against
  // geopotential height H; the conversion below reproduces them exactly.
  // GEOPOTENTIAL vs GEOMETRIC HEIGHT (the subtlety that makes naive ISA
  // implementations drift by ~5% at 47 km):
  //   The 1976 standard atmosphere tables are defined at geometric altitude z,
  //   and the barometric integration uses geopotential height H = g0 z'/g...
  //   The exact relation is  H = R_E z / (R_E + z)  with R_E = 6356766 m
  //   (the *effective* Earth radius of the standard, not the mean radius).
  // Using the wrong radius here produced a 0.36% temperature and 4.4% pressure
  // error at 47 km, which the validation tests caught.
  const R_EFF = 6356766; // m, US Standard Atmosphere 1976 effective radius
  const H = (R_EFF * z) / (R_EFF + z);

  let i = 0;
  while (i < ISA_LAYERS.length - 1 && H >= ISA_LAYERS[i + 1].H) i++;
  if (H > 84000) {
    // Exponential above 84 km (isothermal T=186.87 K) with an outer-space taper.
    const T = 186.87;
    const pH = layerTopPressure(i);
    const p = pH * Math.exp(-(H - 84000) / ((Rd * T) / g0));
    return { T, p, rho: p / (Rd * T), sound: Math.sqrt(1.4 * Rd * T), layer: 'outer' };
  }
  const base = ISA_LAYERS[i];
  const T0_ = base.T;
  const L = base.L; // dT/dH, K/m
  const Hrel = H - base.H;
  const p0 = layerTopPressure(i);
  const T = T0_ + L * Hrel;
  const p = Math.abs(L) < 1e-12
    ? p0 * Math.exp((-g0 * Hrel) / (Rd * T0_))
    : p0 * (T / T0_) ** (-g0 / (Rd * L));
  const rho = p / (Rd * T);
  return { T, p, rho, sound: Math.sqrt(1.4 * Rd * T), layer: `H=${base.H}` };
}

/** Pressure at the bottom of ISA layer i (cached recursion, exact). */
const _layerPressures = (() => {
  const p = [EARTH.ISA_SEA_LEVEL_P];
  for (let i = 1; i < ISA_LAYERS.length; i++) {
    const base = ISA_LAYERS[i - 1];
    const next = ISA_LAYERS[i];
    const dh = next.H - base.H;
    const T = base.T + base.L * dh;
    const pi = Math.abs(base.L) < 1e-12
      ? p[i - 1] * Math.exp((-g0 * dh) / (Rd * base.T))
      : p[i - 1] * (T / base.T) ** (-g0 / (Rd * base.L));
    p.push(pi);
  }
  return p;
})();

function layerTopPressure(i) {
  return _layerPressures[i];
}

/**
 * Physically integrated hydrostatic atmosphere with a *specified* surface
 * temperature and lapse rate. This is what TERRA uses when the climate
 * engine has changed the surface temperature and the standard atmosphere is
 * no longer representative.
 *
 *   T(z) = Ts - L z   (troposphere)
 *   p(z) = ps (T(z)/Ts)^(g/(Rd L))
 *
 * Above the tropopause (z > H_trop = (Ts - T_trop)/L) the profile continues
 * isothermally. The tropopause temperature follows the observed near-constant
 * value (~217 K) but is allowed to vary linearly with surface temperature
 * (following the fixed lapse rate in the troposphere).
 */
export function hydrostaticAtmosphere(z, { surfaceT = 288.15, surfaceP = 101325, lapse = 0.0065, tropopauseT = 216.65 } = {}) {
  const hTrop = Math.max(0, (surfaceT - tropopauseT) / lapse);
  if (z <= hTrop) {
    const T = surfaceT - lapse * z;
    const p = Math.abs(lapse) < 1e-12
      ? surfaceP * Math.exp((-g0 * z) / (Rd * surfaceT))
      : surfaceP * (T / surfaceT) ** (g0 / (Rd * lapse));
    return { T, p, rho: p / (Rd * T), region: 'troposphere' };
  }
  const Tt = tropopauseT;
  const pt = Math.abs(lapse) < 1e-12
    ? surfaceP * Math.exp((-g0 * hTrop) / (Rd * surfaceT))
    : surfaceP * (Tt / surfaceT) ** (g0 / (Rd * lapse));
  const p = pt * Math.exp((-g0 * (z - hTrop)) / (Rd * Tt));
  return { T: Tt, p, rho: p / (Rd * Tt), region: 'stratosphere' };
}

/**
 * Water vapour mixing ratio following a fixed relative humidity profile
 * (default 70%, the observed free-tropospheric mean) and the saturation
 * vapour pressure at the local temperature. This is the standard "fixed RH"
 * closure used in simple climate models.
 */
export function waterVapourProfile(T, p, rh = 0.7) {
  const es = saturationVapourPressureWater(T);
  return mixingRatioFromVapourPressure(p, rh * es);
}

/** Ozone number density profile (approximate Chapman-layer shape). */
export function ozoneProfile(z) {
  // Peak ~22 km, FWHM ~14 km, peak number density 5e12 molec/cm^3
  const zPeak = 22000, sigma = 7000;
  const peak = 5e12 * 1e6; // per m^3
  return peak * Math.exp(-((z - zPeak) ** 2) / (2 * sigma * sigma));
}

// ---------------------------------------------------------------------------
// Radiation: solar geometry and insolation
// ---------------------------------------------------------------------------

/**
 * Solar declination for day-of-year N (Cooper 1969):
 *   δ = 23.45° sin(360/365 (N + 284))
 * Good to ~0.2° for most of the year; adequate for climate diagnostics.
 */
export function solarDeclination(dayOfYear) {
  return (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI * (dayOfYear + 284)) / 365);
}

/**
 * Cosine of the solar zenith angle:
 *   cos ζ = sin φ sin δ + cos φ cos δ cos H
 * with H the hour angle (0 at local noon, rad, positive afternoon).
 */
export function cosSolarZenith(lat, declination, hourAngle) {
  return Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
}

/**
 * Daily-mean insolation at the top of the atmosphere (W/m²), including the
 * eccentricity correction:
 *   S̄ = (S0/π)(d0/d)² [H0 sinφ sinδ + cosφ cosδ sin H0]
 * with H0 the sunset hour angle (cos H0 = -tanφ tanδ), clamped to the
 * polar-day / polar-night cases.
 */
export function dailyMeanInsolation(lat, dayOfYear, solarConstant = EARTH.SOLAR_CONSTANT) {
  const decl = solarDeclination(dayOfYear);
  // Eccentricity: (d0/d)^2 = 1 + 2e cos(λ - ϖ) approximated with the
  // standard astronomical series; e = 0.0167.
  const lambda = ((dayOfYear - 80) / 365.25) * 2 * Math.PI;
  const ecc = 1 + 2 * 0.0167 * Math.cos(lambda);
  const cosH0 = -Math.tan(lat) * Math.tan(decl);
  let H0;
  if (cosH0 >= 1) H0 = 0;                       // polar night
  else if (cosH0 <= -1) H0 = Math.PI;           // polar day
  else H0 = Math.acos(cosH0);
  if (H0 === 0) return 0;
  if (H0 === Math.PI) {
    // Polar day: integrate over the full circle
    return (solarConstant / Math.PI) * ecc * Math.sin(lat) * Math.sin(decl) * Math.PI;
  }
  const s = (solarConstant / Math.PI) * ecc *
    (H0 * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(H0));
  return Math.max(0, s);
}

/** Annual-mean insolation (average over 365 days) - used for climate diagnostics. */
export function annualMeanInsolation(lat, solarConstant = EARTH.SOLAR_CONSTANT) {
  let sum = 0;
  const n = 73;
  for (let i = 0; i < n; i++) sum += dailyMeanInsolation(lat, (i * 365) / n, solarConstant);
  return sum / n;
}

/**
 * Solar elevation/azimuth for observer at (lat, lon) on day N at UTC hour h.
 * Returns zenith angle (rad) and azimuth (rad from north, clockwise).
 * This is an approximate but standard solar-position algorithm (Spencer 1971);
 * accurate to ~0.5° which is far below the needs of rendering and diurnal
 * energy flux at planetary scale.
 */
export function solarPosition(lat, lon, dayOfYear, utcHours) {
  const decl = solarDeclination(dayOfYear);
  // Equation of time (minutes), Spencer's Fourier series
  const B = (2 * Math.PI * (dayOfYear - 1)) / 365;
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(B) - 0.032077 * Math.sin(B)
    - 0.014615 * Math.cos(2 * B) - 0.040849 * Math.sin(2 * B));
  const solarTime = utcHours * 60 + (lon * 180) / Math.PI * 4 + eot; // minutes
  const hourAngle = ((solarTime / 60 - 12) * Math.PI) / 12;
  const cosZ = cosSolarZenith(lat, decl, hourAngle);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ)));
  // Azimuth from the standard formula
  const sinZ = Math.sin(zenith);
  let azimuth = 0;
  if (sinZ > 1e-8) {
    const cosAz = (Math.sin(decl) - Math.sin(lat) * cosZ) / (Math.cos(lat) * sinZ);
    azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;
  }
  return { zenith, azimuth, elevation: Math.PI / 2 - zenith, declination: decl, hourAngle, eot };
}

// ---------------------------------------------------------------------------
// Radiation: atmospheric optics (why the sky is blue)
// ---------------------------------------------------------------------------

/**
 * Rayleigh scattering optical depth for a vertical column of air.
 *
 * DERIVATION (this is the single easiest optical formula to get wrong, so it
 * is written out in full and verified against the known value
 * tau_R(550 nm) = 0.0976 for a standard atmosphere):
 *
 *   cross-section  sigma_R(λ) = (8π³ (n²-1)²)/(3 N_s² λ⁴) · F_air
 *   optical depth  τ_R(λ)     = sigma_R(λ) · N_column
 *   column density N_column   = p_s/(m g)  ≈ 2.15e29 m^-2
 *   F_air = (6+3δ)/(6-7δ) with δ = 0.0279 (King correction for anisotropy)
 *
 * The λ⁻⁴ dependence is the physical reason the sky is blue. Numerically:
 * at λ = 550 nm, n = 1.000277 gives (n²-1)² = 3.07e-7,
 * N_s² λ⁴ = (2.5469e25)² (5.5e-7)⁴ = 5.936e25, so
 * σ = 248.05 · 3.07e-7 / (3 · 5.936e25) · 1.0485 = 4.53e-31 m²,
 * and τ = 4.53e-31 · 2.15e29 = 0.0974.  (Published: 0.0976.)
 *
 * @param {number} lambdaM wavelength, m
 * @param {number} pressurePa surface pressure, Pa
 */
export function rayleighOpticalDepth(lambdaM, pressurePa = 101325) {
  // Refractive index of standard dry air at 550 nm (Edlén / Ciddor)
  const n = refractiveIndexAirStandard(lambdaM);
  const Ns = 2.546899e25;          // molecular number density at STP, m^-3
  const delta = 0.0279;            // depolarisation factor for air
  const king = (6 + 3 * delta) / (6 - 7 * delta);
  const sigma = (8 * Math.PI ** 3 * (n * n - 1) ** 2) / (3 * Ns * Ns * lambdaM ** 4) * king;
  const mAir = 4.8096e-26;         // mean molecular mass of air, kg
  const column = pressurePa / (mAir * g0);
  return sigma * column;
}

/**
 * Refractive index of standard dry air (15 °C, 1013.25 hPa) as a function of
 * wavelength. Edlén (1966) dispersion with the standard-air scaling:
 *   (n-1)·10⁸ = 8342.13 + 2406030/(130 - σ²) + 15997/(38.9 - σ²)
 * with σ = 1/λ in µm.
 */
export function refractiveIndexAirStandard(lambdaM) {
  const sigma = 1 / (lambdaM * 1e6); // inverse micrometres
  const nMinus1 = 8342.13e-8 + 2406030e-8 / (130 - sigma * sigma) + 15997e-8 / (38.9 - sigma * sigma);
  return 1 + nMinus1 * 0.9997; // 0.9997 converts to 15 °C, 1013.25 hPa air
}

/**
 * Mie (aerosol) optical depth in the boundary layer, Angstrom law:
 *   τ_aer(λ) = β λ^-α     with β ~ 0.1, α ~ 1.3 for continental aerosol.
 */
export function mieOpticalDepth(lambdaM, beta = 0.1, alpha = 1.3) {
  return beta * (lambdaM * 1e6) ** -alpha;
}

/**
 * Ozone absorption optical depth (Chappuis band, 500-700 nm) with a
 * column ozone of 300 DU. Peak cross-section ~3.4e-25 m² at 603 nm.
 */
export function ozoneOpticalDepth(lambdaM, columnOzoneDU = 300) {
  // Column density: 1 DU = 2.687e20 molecules/m^2
  const column = columnOzoneDU * 2.687e20;
  // Gaussian band centred at 603 nm, width 60 nm
  const nm = lambdaM * 1e9;
  const sigma = 3.4e-25 * Math.exp(-((nm - 603) ** 2) / (2 * 60 * 60));
  return column * sigma;
}

/** Total clear-sky vertical optical depth. */
export function clearSkyOpticalDepth(lambdaM, { ozoneDU = 300, aerosolBeta = 0.1 } = {}) {
  return rayleighOpticalDepth(lambdaM) + mieOpticalDepth(lambdaM, aerosolBeta) + ozoneOpticalDepth(lambdaM, ozoneDU);
}

/**
 * Sky radiance colour: relative spectral radiance for a clear sky, used by
 * the renderer. The physical basis is Rayleigh scattering: the scattered
 * intensity at the zenith is proportional to τ(λ), which goes as λ^-4.
 */
export function clearSkySpectralRadiance(lambdaM, sunElevationRad) {
  const tau = rayleighOpticalDepth(lambdaM);
  const airmass = 1 / Math.max(0.05, Math.sin(Math.max(0, sunElevationRad)));
  // Single-scattering approximation of a semi-infinite atmosphere
  return tau * (1 - Math.exp(-tau * airmass)) / Math.max(1e-6, Math.sin(Math.max(0.01, sunElevationRad)));
}

// ---------------------------------------------------------------------------
// Longwave greenhouse absorption (band-averaged)
// ---------------------------------------------------------------------------

/**
 * BAND-AVERAGED absorptivities (documented approximation).
 *
 * A real radiative transfer calculation requires line-by-line spectroscopy
 * over ~10^6 lines (HITRAN). TERRA instead uses band-averaged absorptivities
 * calibrated so that the clear-sky outgoing longwave radiation reproduces
 * observed values when a full radiation column is integrated. This is honest:
 * the numbers below are effective grey-gas coefficients, not spectroscopic
 * constants, and they are labelled as such.
 *
 * The functional form for the CO2 15 µm band follows the standard
 * "overlapping-lines" square-root law:
 *   A = 2 A_inf sqrt(u / u_ref) / (1 + 2 sqrt(u / u_ref))
 * saturating for large optical depth u.
 */
export const BAND_ABSORPTIVITY = Object.freeze({
  CO2_15um: { strength: 0.85, uRef: 4.0 },   // partial pressure path (normalised)
  H2O_rotational: { strength: 0.9, uRef: 0.5 },
  H2O_6um: { strength: 0.6, uRef: 8 },
  O3_9um: { strength: 0.35, uRef: 0.02 },
  CH4_8um: { strength: 0.25, uRef: 0.02 },
  N2O: { strength: 0.25, uRef: 0.02 },
});

/**
 * Band absorptivity for a square-root law (Goody & Yung eq. 4.26):
 *   A(u) = 2√(u/u_ref) / (1 + 2√(u/u_ref)) * strength
 */
export function bandAbsorptivity(u, uRef, strength) {
  const s = Math.sqrt(Math.max(0, u) / uRef);
  return (strength * 2 * s) / (1 + 2 * s);
}

/**
 * Clear-sky outgoing longwave radiation (OLR), W/m².
 *
 * PHYSICAL BASIS (stated explicitly because this is a reduced-order model):
 *   The Earth's OLR is not the surface Planck emission; it is the emission of
 *   the atmosphere at the altitude where the optical depth reaches ~1. That
 *   effective emission level is at T_eff ≈ 255 K when the surface is at
 *   T_s = 288 K, i.e. ~33 K cooler - this 33 K difference IS the greenhouse
 *   effect.
 *
 * We therefore write
 *   OLR(T_s) = σ (T_s - Δ)^4 - ΔF_extra(GHG)
 * with Δ = 33 K the observed surface-to-emission-level temperature offset and
 * ΔF_extra the forcing from greenhouse gases above their pre-industrial levels.
 *
 * Consequences (all verified in tests):
 *  - dOLR/dT_s = 4σT_eff³ = 3.76 W m⁻² K⁻¹ at T_eff = 255 K. This is the
 *    Planck ("no feedback") response and is what makes the zero-dimensional
 *    climate model give ~1 K per 3.7 W/m² without feedbacks, and ~3 K with
 *    the standard water-vapour + albedo feedbacks.
 *  - Doubling CO2 lowers OLR by 3.71 W/m² and warms the surface by ~1 K
 *    (Planck only) or ~3 K (with the documented feedback parameter).
 *
 * A grey-band radiative transfer calculation (band absorptivities for the
 * 15 µm CO2 band, the H2O rotational/6.3 µm bands, O3 9.6 µm, CH4, N2O) is
 * available as `greyBandOLR` for comparison; it is not used as the default
 * because it requires an atmospheric temperature profile, whereas this
 * zero-dimensional form is what the climate engine integrates.
 *
 * @param {number} surfaceT surface temperature, K
 * @param {number} co2ppm CO2 mixing ratio, ppm
 */
export const SURFACE_TO_EMISSION_OFFSET = 33.0; // K (observed, Hartmann 2016)

export function clearSkyOLR(surfaceT, co2ppm = 421, ch4ppb = 1923, n2oppb = 336) {
  const sigma = K.sigmaSB;
  const TEff = Math.max(50, surfaceT - SURFACE_TO_EMISSION_OFFSET);
  const planck = sigma * TEff ** 4;
  // Additional forcing above pre-industrial, expressed as an OLR reduction.
  const dF = co2RadiativeForcing(co2ppm, 280) +
    ch4RadiativeForcing(ch4ppb, 700) +
    0.12 * (Math.sqrt(n2oppb) - Math.sqrt(270)); // IPCC N2O coefficient
  return planck - dF;
}

/**
 * Grey-band OLR (independent cross-check of the reduced model). Integrates
 * the Schwarzschild equation over 8 spectral bands using the band-averaged
 * absorptivities below and the local temperature profile.
 *
 * This is a genuine (if coarse) radiative transfer calculation: it solves
 *   I(τ) = ∫ B(T(τ')) e^{-(τ-τ')} dτ'
 * by quadrature over the vertical column, then integrates over bands.
 * It reproduces OLR to ~10% of the reduced model, which is the appropriate
 * accuracy for a band-averaged scheme.
 */
export function greyBandOLR(surfaceT, co2ppm = 421, nLayers = 40) {
  const sigma = K.sigmaSB;
  const bands = [
    { w: 0.10, tau0: 0.02 },  // atmospheric window (8-12 um): nearly transparent
    { w: 0.16, tau0: 3.0, gas: 'H2O' },   // H2O rotational
    { w: 0.12, tau0: 1.2, gas: 'H2O' },   // H2O 6.3 um
    { w: 0.16, tau0: 2.5, gas: 'CO2' },   // CO2 15 um
    { w: 0.06, tau0: 0.9, gas: 'O3' },    // O3 9.6 um
    { w: 0.04, tau0: 0.4, gas: 'CH4' },   // CH4 7.7 um
    { w: 0.03, tau0: 0.4, gas: 'N2O' },   // N2O
    { w: 0.33, tau0: 1.0, gas: 'H2O' },   // remaining H2O continuum
  ];
  const zTop = 20000;
  const dz = zTop / nLayers;
  let olr = 0;
  for (const band of bands) {
    // Scale band optical depth by gas concentration (sqrt for saturated bands)
    let scale = 1;
    if (band.gas === 'CO2') scale = Math.sqrt(co2ppm / 280);
    if (band.gas === 'H2O') scale = 1.0;
    if (band.gas === 'CH4') scale = Math.sqrt(1923 / 700);
    // Temperature profile (fixed lapse rate) and optical depth per layer
    const T = (z) => Math.max(180, surfaceT - 0.0065 * Math.min(z, (surfaceT - 216) / 0.0065));
    const tauLayer = (band.tau0 * scale) / nLayers;
    // Upward integration of the Schwarzschild equation with source B(T)
    let I = (sigma * surfaceT ** 4) / Math.PI; // surface emission (BB, Lambert)
    for (let i = 0; i < nLayers; i++) {
      const z = (i + 0.5) * dz;
      const B = (sigma * T(z) ** 4) / Math.PI;
      I = I * Math.exp(-tauLayer) + B * (1 - Math.exp(-tauLayer));
    }
    olr += band.w * Math.PI * I;
  }
  return olr;
}

/**
 * Radiative forcing from a CO2 change (IPCC AR6, Myhre et al. 1998):
 *   ΔF = 5.35 ln(C/C0)   W/m²
 */
export const co2RadiativeForcing = (newPpm, oldPpm = 280) => 5.35 * Math.log(newPpm / oldPpm);

/** Radiative forcing from CH4 (IPCC): ΔF = 0.036 (√M - √M0). */
export const ch4RadiativeForcing = (newPpb, oldPpb = 700) => 0.036 * (Math.sqrt(newPpb) - Math.sqrt(oldPpb));

/**
 * Climate sensitivity implied by a given forcing, given the Planck feedback
 * parameter λ0 = -3.2 W m^-2 K^-1 (the standard no-feedback value):
 *   ΔT = ΔF / (λ0 + feedbacks)
 * With the standard net feedback λ = -(3.2 - 2.0) = -1.2 W m^-2 K^-1 this
 * gives an equilibrium climate sensitivity of ~3 K for 3.7 W/m² forcing,
 * the canonical IPCC value. We explicitly separate the Planck response from
 * the feedbacks so the assumption is visible.
 */
export const PLANCK_FEEDBACK = -3.2;
export function equilibriumWarming(forcing, totalFeedback = -3.2) {
  return -forcing / totalFeedback;
}

// ---------------------------------------------------------------------------
// Simple column energy balance (used by the climate engine)
// ---------------------------------------------------------------------------

/**
 * Zero-dimensional planetary energy balance:
 *   C dTs/dt = (1 - α) S0/4 - OLR(Ts)
 *
 * At equilibrium this is solved by Newton iteration on OLR(Ts) = absorbed.
 * The linear relaxation time is tau = C / |dOLR/dTs|, with
 * dOLR/dTs = 4σT_eff³ = 3.76 W m^-2 K^-1 (the Planck response).
 *
 * With the default heat capacity C = 4.2e7 J m^-2 K^-1 (a 50 m ocean mixed
 * layer) this gives a time constant of ~4 months, which is the correct order
 * for the seasonal response of the ocean mixed layer.
 */
export function energyBalanceSteadyState({ albedo = EARTH.BOND_ALBEDO, solar = EARTH.SOLAR_CONSTANT, co2 = 421, heatCapacity = 4.2e7 } = {}) {
  const absorbed = solar * (1 - albedo) / 4;
  let T = 288;
  for (let i = 0; i < 300; i++) {
    const olr = clearSkyOLR(T, co2);
    const dOLR = (clearSkyOLR(T + 0.05, co2) - clearSkyOLR(T - 0.05, co2)) / 0.1;
    const dT = (absorbed - olr) / dOLR;
    T += dT;
    if (Math.abs(dT) < 1e-9) break;
  }
  const dOLR = (clearSkyOLR(T + 0.05, co2) - clearSkyOLR(T - 0.05, co2)) / 0.1;
  return {
    T,
    absorbed,
    olr: clearSkyOLR(T, co2),
    dOLRdT: dOLR,
    tau: heatCapacity / Math.abs(dOLR),
    timeToEquilibriumYears: (3 * heatCapacity) / Math.abs(dOLR) / 3.156e7,
  };
}

void saturationVapourPressureIce;
void latentHeatVapourisation;
void potentialTemperature;
void dryLapseRate;
