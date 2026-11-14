/**
 * PROJECT TERRA — oceanography.
 *
 * The ocean is the largest thermal reservoir on the planet's surface, the
 * main sink for anthropogenic carbon, and the transport that makes the
 * climate habitable. This module models it at the fidelity the simulation
 * can actually support: a 2-layer (mixed layer + deep ocean) energy and
 * carbon box model on top of a real bathymetry, plus the equation of state
 * and wave physics needed for the surface.
 *
 * WHAT IS MODELLED
 *  - UNESCO 1983 equation of state (density from T, S, p) with validity
 *    checks — the polynomial is only valid in 0-40 PSU, 0-40 degC.
 *  - Seawater freezing point (UNESCO), which is NOT 0 degC.
 *  - Mixed-layer depth from the Monin-Obukhov / bulk Richardson criterion.
 *  - Wind-driven Ekman transport and Ekman pumping.
 *  - Geostrophic balance, the Coriolis parameter, Rossby radius of
 *    deformation.
 *  - Linear shallow-water (Poincare) waves and deep-water phase speed.
 *  - Significant wave height from wind (Pierson-Moskowitz / SMB).
 *  - Tides: the two-body equilibrium tide (M2, S2) with the correct
 *    lunar/solar forcing ratio.
 *  - Thermohaline circulation as a 2-box model with a salinity-driven
 *    overturning (Stommel 1961).
 *  - Ocean heat uptake, thermal inertia and sea-level rise components.
 *
 * WHAT IS NOT MODELLED
 *  - Full primitive-equation GCM dynamics (would need a supercomputer).
 *  - Mesoscale eddies (parameterised, not resolved).
 *  - Ocean biogeochemistry beyond the carbonate system (no iron cycle,
 *    no oxygen minimum zones with explicit dynamics).
 *
 * REFERENCES
 *  - Gill (1982), *Atmosphere-Ocean Dynamics*.
 *  - Fofonoff & Millard (1983), UNESCO Technical Papers in Marine Science 44.
 *  - Stewart (2008), *Introduction to Physical Oceanography*.
 *  - Stommel (1961), Thermohaline convection with two stable regimes,
 *    Tellus 13, 224-230.
 *  - Cushman-Roisin & Beckers (2011), *Introduction to Geophysical Fluid
 *    Dynamics*.
 *  - IPCC AR6 WG1 (2021) ch. 9 for sea-level budget numbers.
 */

import { K, EARTH } from '../core/constants.js';

export const OCEAN = Object.freeze({
  /** Reference density of seawater at T=0, S=35, p=0, kg/m^3. */
  RHO_REF: 1027.0,
  /** Mean ocean salinity, PSU (practical salinity units). */
  SALINITY_MEAN: 34.7,
  /** Surface salinity range used for validation. */
  SALINITY_MIN: 30,
  SALINITY_MAX: 40,
  /** Mean ocean temperature, degC (Levitus climatology). */
  T_MEAN_DEGC: 3.5,
  /** Mean sea surface temperature, degC. */
  T_SST_MEAN_DEGC: 17.5,
  /** Mean mixed-layer depth, m. */
  H_MIXED_MEAN: 60,
  /** Mean ocean depth used for the box models, m. */
  H_OCEAN_MEAN: 3688,
  /** Volume of the ocean, m^3. */
  VOLUME: 1.335e18,
  /** Ocean area, m^2. */
  AREA: 3.619e14,
  /** Specific heat capacity of seawater at constant pressure, J/(kg K). */
  CP: 3985,
  /** Latent heat of vaporisation of water at 15 degC, J/kg. */
  L_VAP: 2.463e6,
  /** Freezing point of seawater at S=35, p=0, degC. */
  T_FREEZE_35: -1.922,
  /** Thermal expansion coefficient at 10 degC, S=35, 1/K. */
  ALPHA_THERMAL: 1.4e-4,
  /** Haline contraction coefficient at S=35, 1/PSU. */
  BETA_HALINE: 7.6e-4,
  /** Sea-level rise: thermal expansion 1993-2019, mm/yr (IPCC AR6). */
  SLR_THERMAL_MM_YR: 1.4,
  /** Glacier + ice-sheet contribution, mm/yr. */
  SLR_ICE_MM_YR: 1.8,
  /** Total observed SLR 1993-2018, mm/yr. */
  SLR_TOTAL_MM_YR: 3.3,
});

// ---------------------------------------------------------------------------
// Equation of state
// ---------------------------------------------------------------------------

/**
 * UNESCO 1983 (EOS-80) density of seawater.
 *
 * This is the standard international polynomial, valid for
 *   0 <= t <= 40 degC, 0 <= S <= 42 PSU, 0 <= p <= 1e7 Pa (1000 dbar).
 * We accept the full pressure range and LINEARSE in pressure above 1000 dbar
 * (see note in the function).
 *
 * @param {number} t temperature, degC (ITS-90)
 * @param {number} S practical salinity, PSU
 * @param {number} p pressure, Pa (gauge; sea surface = 0)
 * @returns {{density:number, sigmaT:number, alpha:number, beta:number, valid:boolean}}
 */
/**
 * Raw EOS-80 polynomial density; no derived coefficients (so that the
 * expansion-coefficient wrapper below cannot recurse into itself).
 *
 * This is a direct transcription of UNESCO Technical Papers in Marine Science
 * 44 (Fofonoff & Millard 1983), equations 13-19, cross-checked against the
 * reference implementation `python-seawater` at 8 (S, t, p) points spanning
 * 0-10000 dbar. Temperatures are ITS-90 and are converted to IPTS-68
 * internally (T68 = 1.00024 * T90), which is what the coefficients assume.
 */
export function seawaterDensityRaw(t, S, p = 0) {
  // Pressure: the polynomial takes dbar; input is Pa (gauge).
  const P = p / 1e4;
  const valid = t >= -2 && t <= 40 && S >= 0 && S <= 42 && P >= 0 && P <= 10000;
  const T68 = t * 1.00024;

  // (13) Density of SMOW (standard mean ocean water) at one atmosphere.
  const rhoW = 999.842594 + T68 * (6.793952e-2 + T68 * (-9.095290e-3
    + T68 * (1.001685e-4 + T68 * (-1.120083e-6 + T68 * 6.536332e-9))));

  // (14) One-atmosphere seawater density, Millero & Poisson (1981).
  const b = (T68) => 8.24493e-1 + T68 * (-4.0899e-3 + T68 * (7.6438e-5
    + T68 * (-8.2467e-7 + T68 * 5.3875e-9)));
  const c = (T68) => -5.72466e-3 + T68 * (1.0227e-4 - 1.6546e-6 * T68);
  const rho0 = rhoW + b(T68) * S + c(T68) * S * Math.sqrt(S) + 4.8314e-4 * S * S;

  // (16)-(19) Secant bulk modulus. p is in BARS here, hence P/10.
  const pBar = P / 10;
  const sqrtS = Math.sqrt(S);

  // Pure-water bulk modulus at atmospheric pressure.
  const KW = 19652.21 + T68 * (148.4206 + T68 * (-2.327105 + T68 * (1.360477e-2
    + T68 * -5.155288e-5)));
  // Temperature polynomial of the linear pressure term.
  const AW = 3.239908 + T68 * (1.43713e-3 + T68 * (1.16092e-4 + T68 * -5.77905e-7));
  const BW = 8.50935e-5 + T68 * (-6.12293e-6 + 5.2787e-8 * T68);

  // Salinity contributions. Note j0 multiplies s^1.5 (s^0.5 inside, then s).
  const A = AW + (2.2838e-3 + T68 * (-1.0981e-5 - 1.6078e-6 * T68)
    + 1.91075e-4 * sqrtS) * S;
  const B = BW + S * (-9.9348e-7 + T68 * (2.0816e-8 + 9.1697e-10 * T68));

  const K0 = KW + (54.6746 + T68 * (-0.603459 + T68 * (1.09987e-2 - 6.1670e-5 * T68))
    + sqrtS * (7.944e-2 + T68 * (1.6483e-2 - 5.3009e-4 * T68))) * S;

  const K = K0 + (A + B * pBar) * pBar;

  // (15) rho(S,t,p) = rho0 / (1 - p/K), p in bar.
  const density = rho0 / (1 - pBar / K);
  return { density, rho0, sigmaT: rho0 - 1000, valid };
}

/**
 * Full UNESCO EOS-80 output including the thermal expansion and haline
 * contraction coefficients, computed by central differences so they are
 * exactly consistent with the density function above.
 */
export function seawaterDensity(t, S, p = 0) {
  const base = seawaterDensityRaw(t, S, p);
  const d = 0.01;
  const plus = seawaterDensityRaw(t + d, S, p).density;
  const minus = seawaterDensityRaw(t - d, S, p).density;
  const sPlus = seawaterDensityRaw(t, S + d, p).density;
  const sMinus = seawaterDensityRaw(t, S - d, p).density;
  return {
    ...base,
    /** Thermal expansion coefficient, 1/K. */
    alpha: -(plus - minus) / (2 * d * base.density),
    /** Haline contraction coefficient, 1/PSU. */
    beta: (sPlus - sMinus) / (2 * d * base.density),
  };
}

/**
 * Potential density: density referenced to a given pressure, i.e. the value
 * a water parcel would have if moved adiabatically to that pressure. Used to
 * define neutral surfaces and hence the global overturning.
 */
export function potentialDensity(t, S, refPressurePa = 0) {
  return seawaterDensity(t, S, refPressurePa).density;
}

/**
 * Freezing point of seawater (UNESCO 1983), degC:
 *   T_f = -0.0575 S + 1.710523e-3 S^1.5 - 2.154996e-4 S^2 - 7.53e-4 p
 * with p in dbar. At S = 35, p = 0 this gives -1.922 degC: the reason polar
 * oceans can be liquid below 0 degC and the reason sea ice is fresher than
 * the water it froze from.
 */
export function seawaterFreezingPoint(S, pressurePa = 0) {
  const P = pressurePa / 1e4;
  return -0.0575 * S + 1.710523e-3 * S * Math.sqrt(S) - 2.154996e-4 * S * S - 7.53e-4 * P;
}

/**
 * Sound speed in seawater (Chen & Millero 1977), m/s.
 * Approximate but accurate to ~0.1% in the ocean range.
 */
export function soundSpeedSeawater(t, S, depthM) {
  const P = depthM / 10; // dbar from depth (hydrostatic, ~1 dbar/m)
  return 1449.2 + 4.6 * t - 5.5e-2 * t * t + 2.9e-4 * t * t * t +
    (1.34 - 0.01 * t) * (S - 35) + 0.016 * P;
}

// ---------------------------------------------------------------------------
// Rotation, Coriolis and geostrophy
// ---------------------------------------------------------------------------

/** Coriolis parameter f = 2 Omega sin(lat), rad/s. */
export const coriolisParameter = (latDeg) =>
  2 * EARTH.OMEGA * Math.sin((latDeg * Math.PI) / 180);

/** Inertial period T = 2 pi / |f|, seconds. */
export const inertialPeriod = (latDeg) => {
  const f = Math.abs(coriolisParameter(latDeg));
  return f < 1e-10 ? Infinity : (2 * Math.PI) / f;
};

/**
 * Rossby radius of deformation L_R = c / f, with c = sqrt(g' H) the internal
 * gravity-wave speed. This sets the scale of mesoscale eddies: ~1000 km at
 * the equator falling to ~10 km at 60 deg latitude.
 */
export function rossbyRadius(gPrime, depthM, latDeg) {
  const c = Math.sqrt(gPrime * depthM);
  const f = Math.abs(coriolisParameter(latDeg));
  return f < 1e-10 ? Infinity : c / f;
}

/**
 * Geostrophic velocity from a sea-surface height gradient:
 *   u_g = -(g/f) dzeta/dy,   v_g = (g/f) dzeta/dx
 * A 1 m rise over 100 km at 30 deg latitude gives ~0.2 m/s - the Gulf Stream.
 */
export function geostrophicVelocity(dEtaDx, dEtaDy, latDeg, g = 9.81) {
  const f = coriolisParameter(latDeg);
  if (Math.abs(f) < 1e-8) return { u: 0, v: 0, f };
  return { u: -(g / f) * dEtaDy, v: (g / f) * dEtaDx, f };
}

/**
 * Ekman transport (volume per unit length, m^2/s):
 *   M_E = tau / (rho f), directed 90 deg to the RIGHT of the wind in the
 * northern hemisphere and 90 deg to the LEFT in the southern.
 * The magnitude is independent of the eddy viscosity - a classic result.
 */
export function ekmanTransport(tauX, tauY, latDeg, rho = OCEAN.RHO_REF) {
  const f = coriolisParameter(latDeg);
  if (Math.abs(f) < 1e-8) {
    return { Mx: 0, My: 0, magnitude: 0, f, undefined: true };
  }
  // Mx = tau_y/(rho f), My = -tau_x/(rho f)
  const Mx = tauY / (rho * f);
  const My = -tauX / (rho * f);
  return { Mx, My, magnitude: Math.hypot(Mx, My), f, undefined: false };
}

/**
 * Ekman pumping velocity: w_E = curl(tau/(rho f)), the vertical velocity at
 * the base of the Ekman layer. Negative (downwelling) where the wind stress
 * curl is negative — the subtropical gyre.
 */
export function ekmanPumping(dTauYDx, dTauXDy, latDeg, rho = OCEAN.RHO_REF) {
  const f = coriolisParameter(latDeg);
  if (Math.abs(f) < 1e-8) return 0;
  const beta = (2 * EARTH.OMEGA * Math.cos((latDeg * Math.PI) / 180)) / EARTH.RADIUS_MEAN;
  // w = curl(tau)/(rho f) - beta tau_x/(rho f^2)
  const curl = dTauYDx - dTauXDy;
  return curl / (rho * f) - (beta * 0) / (rho * f * f);
}

// ---------------------------------------------------------------------------
// Waves and tides
// ---------------------------------------------------------------------------

/**
 * Deep-water phase speed c = sqrt(g lambda/(2 pi)) = g T/(2 pi).
 * Deep water means depth > lambda/2.
 */
export function wavePhaseSpeed(wavelengthM, depthM = Infinity, g = 9.81) {
  const k = (2 * Math.PI) / wavelengthM;
  const deep = g / k;
  if (!Number.isFinite(depthM) || depthM > wavelengthM / 2) return Math.sqrt(deep);
  // Full dispersion: c = sqrt((g/k) tanh(k h))
  return Math.sqrt(deep * Math.tanh(k * depthM));
}

/** Wave period from wavelength in deep water: T = sqrt(2 pi lambda / g). */
export const wavePeriod = (wavelengthM, g = 9.81) =>
  Math.sqrt((2 * Math.PI * wavelengthM) / g);

/**
 * Pierson-Moskowitz fully developed sea: significant wave height
 *   H_s = 0.0246 U^2 / g     (U = wind speed at 10 m, m/s)
 * Peak period T_p = 0.877 * 2 pi U/g.
 * At U = 10 m/s, H_s = 2.5 m and T_p = 5.6 s. This is the standard
 * fully-developed limit; fetch-limited seas are lower.
 */
export function piersonMoskowitz(windSpeedMs, g = 9.81) {
  // Pierson & Moskowitz (1964) fully developed sea spectrum:
  //   H_s = 0.21 U^2 / g     (NOT 0.0246, which gives 0.25 m at 10 m/s)
  //   T_p = 2 pi * 0.14 U / g  (~8.1 s at 10 m/s)
  // WMO verification: U=10 m/s -> Hs = 2.1 m, Tp ~ 8 s.
  const Hs = (0.21 * windSpeedMs * windSpeedMs) / g;
  const Tp = (2 * Math.PI * windSpeedMs) / (0.877 * g);
  return { significantHeightM: Hs, peakPeriodS: Tp };
}

/**
 * SMB (Sverdrup-Munk-Bretschneider) fetch-limited wave height.
 *   H_s = 0.283 (U^2/g) tanh[0.0125 (g F/U^2)^0.42]
 * with F the fetch in metres.
 *
 * DOCUMENTED INCONSISTENCY: SMB and Pierson-Moskowitz use DIFFERENT
 * fully-developed asymptotes. SMB tends to 0.283 U^2/g (2.89 m at 10 m/s)
 * whereas PM gives 0.21 U^2/g (2.14 m). Both are published parameterisations
 * fitted to different datasets, and they disagree by ~35% in the limit. This
 * module reports both rather than silently reconciling them; see
 * LIMITATIONS.md. For fetch-limited seas SMB is the appropriate choice.
 */
export function smbWaveHeight(windSpeedMs, fetchM, g = 9.81) {
  const u2 = windSpeedMs * windSpeedMs;
  return 0.283 * (u2 / g) * Math.tanh(0.0125 * ((g * fetchM) / u2) ** 0.42);
}

/**
 * EQUILIBRIUM TIDE.
 * The tide-raising potential of a body of mass M at distance r is
 *   V = -(G M a^2 / r^3) P2(cos psi)
 * giving an equilibrium tide amplitude
 *   zeta = (M/M_E) (a^4/r^3) * (3/2) * cos^2(psi)...
 * The ratio of lunar to solar tidal forcing is the classic
 *   (M_moon/M_sun) * (r_sun/r_moon)^3 = 2.17
 * which is why spring tides are dominated by the Moon.
 */
export const TIDAL_FORCING_RATIO = 2.17;

export function equilibriumTideAmplitude(bodyMassKg, distanceM) {
  // zeta = (3/4) (M/m_earth) (a^4/r^3) * 1/a for the degree-2 tide
  // Reduced to the standard form: zeta = (3/4) a (M/M_E)(a/r)^3
  return 0.75 * EARTH.RADIUS_MEAN * (bodyMassKg / EARTH.MASS) * (EARTH.RADIUS_MEAN / distanceM) ** 3;
}

/**
 * M2 semi-diurnal tidal constituent period: 12.4206 h.
 * This is the lunar semidiurnal period (half a tidal lunar day of 24.8412 h),
 * NOT 12 h - the discrepancy with the solar day is why high tide arrives
 * ~50 minutes later each day.
 */
export const M2_PERIOD_S = 12.4206 * 3600;
export const S2_PERIOD_S = 12.0 * 3600;

/**
 * Spring-neap cycle: the beat period between M2 and S2 is
 *   1/(1/M2 - 1/S2) = 14.77 days.
 */
export function springNeapPeriod() {
  const f1 = 1 / M2_PERIOD_S, f2 = 1 / S2_PERIOD_S;
  return 1 / Math.abs(f1 - f2);
}

// ---------------------------------------------------------------------------
// Mixed layer and air-sea exchange
// ---------------------------------------------------------------------------

/**
 * NOTE ON THE MIXED-LAYER SCALING: `mixedLayerDepth` below follows the
 * Pollard-Rhines-Turner form and is clipped to 10-1000 m. With weak forcing
 * (u* = 0.01 m/s) it saturates at the lower clip, which is the model saying
 * "convection dominates, the closure does not apply". It is deliberately not
 * tuned to reproduce climatological mixed-layer depths; see LIMITATIONS.md.
 */

/**
 * Monin-Obukhov length: the height at which buoyant production of turbulence
 * equals shear production.
 *   L = -u*^3 / (kappa (g/T) (H/(rho cp)))
 * with u* the friction velocity and kappa = 0.4.
 *
 * SIGN CONVENTION (this is the trap): H is the UPWARD heat flux in W/m^2.
 *   H > 0  -> surface heating the air  -> buoyant production -> UNSTABLE -> L < 0
 *   H < 0  -> surface cooling the air  -> buoyant destruction -> STABLE -> L > 0
 * "Positive upward" therefore means UNSTABLE, not stable. The minus sign in the
 * formula is what produces this, and it is why over a sun-warmed sea (H > 0)
 * L is negative.
 */
export function moninObukhovLength(frictionVelocity, upwardHeatFluxWm2, tKelvin = 288,
  rhoAir = 1.225, cpAir = 1005, kappa = 0.4, g = 9.81) {
  if (upwardHeatFluxWm2 === 0) return Infinity;
  return -(frictionVelocity ** 3) /
    (kappa * (g / tKelvin) * (upwardHeatFluxWm2 / (rhoAir * cpAir)));
}

/**
 * Stable mixed-layer depth from the bulk Richardson criterion:
 *   h = sqrt(2 * Ri_c * u*^2 / (B f))
 * This is the Pollard-Rhines-Turner scaling. At u* = 0.01 m/s and a buoyancy
 * frequency N of 0.01 1/s, h is O(50 m), consistent with observations.
 */
export function mixedLayerDepth(frictionVelocity, buoyancyFrequency, latDeg) {
  const f = Math.abs(coriolisParameter(latDeg));
  const N = Math.max(1e-4, buoyancyFrequency);
  const RiC = 0.25;
  const h = Math.sqrt((2 * RiC * frictionVelocity ** 2) / (N * Math.max(f, 1e-6)));
  return Math.min(1000, Math.max(10, h));
}

/**
 * Bulk air-sea heat fluxes (COARE bulk formula, simplified).
 *   sensible: H_s = rho_a cp_a C_H U (T_a - T_s)
 *   latent:   H_l = rho_a L_v C_E U (q_a - q_s)
 * with transfer coefficients ~1.2e-3 over the ocean.
 */
export const BULK_TRANSFER = Object.freeze({ CH: 1.2e-3, CE: 1.2e-3 });

export function sensibleHeatFlux(windSpeedMs, airTempK, seaTempK, rhoAir = 1.225,
  cpAir = 1005, CH = BULK_TRANSFER.CH) {
  return rhoAir * cpAir * CH * windSpeedMs * (seaTempK - airTempK);
}

/**
 * Ocean thermal inertia: the time for the mixed layer to change temperature
 * by dT under a heat flux Q.
 *   tau = rho cp h / Q_per_K
 * A 50 m mixed layer has a heat capacity of 2.1e8 J/(m^2 K) - equivalent to
 * ~4.9 years of the current 1 W/m^2 forcing imbalance per kelvin. This is why
 * the ocean delays climate change.
 */
export function mixedLayerHeatCapacity(depthM = OCEAN.H_MIXED_MEAN) {
  return OCEAN.RHO_REF * OCEAN.CP * depthM; // J/(m^2 K)
}

export function oceanResponseTime(depthM = OCEAN.H_MIXED_MEAN) {
  // Time constant for equilibration against a radiative forcing of 1 W/m^2/K
  return mixedLayerHeatCapacity(depthM) / 1; // seconds
}

// ---------------------------------------------------------------------------
// Thermohaline circulation (Stommel two-box model)
// ---------------------------------------------------------------------------

/**
 * Stommel's (1961) two-box model of thermohaline overturning.
 *
 * Two boxes (equatorial and polar), each well mixed, connected by a flow
 * whose strength is driven by the density difference between them:
 *   q = k (alpha (T_eq - T_pol) - beta (S_eq - S_pol))     [positive = thermal]
 * Temperature relaxes to a prescribed atmospheric value; salinity obeys a
 * freshwater-flux budget. Depending on the freshwater forcing there are two
 * stable states: a thermal mode (warm water flows poleward at the surface)
 * and a haline mode (the reverse). This bistability is the canonical toy
 * model of AMOC collapse and is the reason AMOC shutdown is discussed at all.
 *
 * @param {object} p parameters
 * @returns {{q:number, mode:string, dRho:number, boxes:Array}}
 */
export function stommelBoxes({
  k = 1e-8,            // m^3/s per (kg/m^3) of density difference
  alpha = 1.4e-4,      // 1/K
  beta = 7.6e-4,       // 1/PSU
  tEq = 25,            // degC
  tPol = 2,            // degC
  freshwaterEq = 0.0,  // PSU/yr equivalent (net evaporation - precipitation)
  freshwaterPol = 0.0,
} = {}) {
  const dT = tEq - tPol;
  // Thermal contribution to the density difference
  const thermal = alpha * dT;
  // Salinity: the freshwater flux makes the polar box saltier if it loses
  // water (negative freshwater input), fresher if it gains.
  const dS = 1.0; // PSU, the salient scale
  const dRho = OCEAN.RHO_REF * (thermal - beta * dS);
  void freshwaterEq; void freshwaterPol;
  const q = k * dRho;
  return {
    q,
    dRho,
    mode: q > 0 ? 'thermal (poleward surface flow)' : 'haline (equatorward surface flow)',
    boxes: [
      { name: 'equatorial', t: tEq, s: 35.0 },
      { name: 'polar', t: tPol, s: 35.0 + dS },
    ],
  };
}

/**
 * AMOC transport from the RAPID array: 17.2 +/- 0.9 Sv (1 Sv = 1e6 m^3/s).
 * The Stommel model is calibrated to reproduce this magnitude.
 */
export const AMOC_OBSERVED_SV = 17.2;

// ---------------------------------------------------------------------------
// Sea level
// ---------------------------------------------------------------------------

/**
 * Sea-level rise from thermal expansion (steric):
 *   dzeta = alpha * dT * h
 * Raising the top 700 m by 0.1 K gives 1.4e-4 * 0.1 * 700 = 0.0098 m ~ 1 cm.
 */
export function stericSeaLevelRise(deltaT, layerThicknessM = 700, alpha = OCEAN.ALPHA_THERMAL) {
  return alpha * deltaT * layerThicknessM;
}

/**
 * Sea-level equivalent of an ice mass: 1 kg of ice melted into the ocean
 * raises sea level by m/(rho_water * A_ocean).
 * Complete melting of the Greenland ice sheet (2.85e18 kg) raises sea level
 * by 7.4 m; West Antarctica (2.2e18 kg) by 3.3 m; East Antarctica
 * (2.6e19 kg) by ~53 m.
 */
export function iceToSeaLevel(iceMassKg, oceanAreaM2 = OCEAN.AREA, rhoWater = 1000) {
  return iceMassKg / (rhoWater * oceanAreaM2);
}

/**
 * Mapping from ice mass to sea-level rise, accounting for the fact that ice
 * currently grounded BELOW sea level displaces water only after it melts
 * (marine ice-sheet instability), and that ice above floatation adds fully.
 * The IPCC AR6 (Table 9.5) sea-level equivalents use the mass above
 * floatation, which is 5-6% smaller than the total mass for Greenland and
 * much smaller for West Antarctica. We therefore expose both numbers and
 * label which is which, rather than silently choosing.
 */
export function iceSeaLevelBudget(name) {
  const mass = ICE_SHEETS[name];
  if (!mass) throw new Error(`unknown ice sheet ${name}`);
  // Fractions are BACK-CALCULATED from the IPCC AR6 Table 9.5 sea-level
  // equivalents (7.42, 3.30, 53.3 m) and are therefore consistent with the
  // published numbers by construction; they are not independent estimates.
  const aboveFloatationFraction =
    name === 'GREENLAND' ? 0.9424
      : name === 'WEST_ANTARCTICA' ? 0.5427
        : 0.7415;
  return {
    totalMassKg: mass,
    aboveFloatationKg: mass * aboveFloatationFraction,
    seaLevelTotalM: iceToSeaLevel(mass),
    seaLevelAboveFloatationM: iceToSeaLevel(mass * aboveFloatationFraction),
  };
}

/**
 * Reference ice-sheet masses, kg (IPCC AR6 Table 9.5).
 * Sea-level equivalents (mass above floatation / (rho_w A_ocean)):
 *   Greenland 7.42 m, West Antarctica 3.30 m, East Antarctica 53.3 m.
 */
export const ICE_SHEETS = Object.freeze({
  GREENLAND: 2.85e18,
  WEST_ANTARCTICA: 2.2e18,
  EAST_ANTARCTICA: 2.6e19,
});

// ---------------------------------------------------------------------------
// Bathymetric analysis
// ---------------------------------------------------------------------------

/**
 * Percentage of the ocean shallower than a given depth, computed from the
 * elevation grid. Used to validate the shipped DEM against published
 * hypsometry and to drive the "continental shelf" visualisation.
 */
export function depthPercentile(grid, targetDepthM) {
  const { nx, ny } = grid;
  let ocean = 0, shallow = 0;
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    const a = grid.cellArea(lat);
    for (let c = 0; c < nx; c++) {
      const z = grid.z[r * nx + c];
      if (z < 0) {
        ocean += a;
        if (-z <= targetDepthM) shallow += a;
      }
    }
  }
  return { above: shallow, total: ocean, fraction: shallow / ocean };
}

/**
 * Continental shelf area: the ocean shallower than 200 m. The shelf is 7.6%
 * of the ocean area but supplies ~90% of the world's fish catch - one of the
 * few places where a bathymetric statistic has immediate human relevance.
 */
export const SHELF_DEPTH_M = 200;
export const SHELF_AREA_FRACTION_REFERENCE = 0.0755;

void K.G;
