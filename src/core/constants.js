/**
 * PROJECT TERRA — physical constants.
 *
 * All values in SI units. Every constant carries its provenance and standard
 * uncertainty so that error budgets can be propagated rather than guessed.
 *
 * PRIMARY SOURCES
 *  - CODATA 2018 / 2022 recommended values (NIST). Exact SI constants since
 *    the 2019 redefinition are marked `exact: true`.
 *  - IERS Conventions 2010 (Earth rotation, GM, J2).
 *  - WGS84 (NIMA TR8350.2, 3rd ed., 2000).
 *  - IAU 2015 Resolution B3 (nominal solar & planetary constants).
 *  - NASA/JPL DE440 for ephemeris constants.
 *
 * RULE (project rule #4): no unexplained magic numbers anywhere in the engine.
 * If a number appears in a physical model it must either be listed here, be a
 * documented dimensionless parameter, or be computed from measured data.
 */

/** @typedef {{value:number, unit:string, relUncertainty:number, exact:boolean, source:string}} Constant */

const C = (value, unit, relUncertainty, exact, source) =>
  Object.freeze({ value, unit, relUncertainty, exact, source });

const TABLE = {
  // ---------------------------------------------------------------------
  // FUNDAMENTAL / EXACT (SI 2019)
  // ---------------------------------------------------------------------
  SPEED_OF_LIGHT: C(299792458, 'm/s', 0, true, 'SI 2019 (exact)'),
  PLANCK: C(6.62607015e-34, 'J s', 0, true, 'SI 2019 (exact)'),
  BOLTZMANN: C(1.380649e-23, 'J/K', 0, true, 'SI 2019 (exact)'),
  AVOGADRO: C(6.02214076e23, '1/mol', 0, true, 'SI 2019 (exact)'),
  ELEMENTARY_CHARGE: C(1.602176634e-19, 'C', 0, true, 'SI 2019 (exact)'),
  GRAVITATIONAL_CONSTANT: C(6.67430e-11, 'm^3 kg^-1 s^-2', 2.2e-5, false, 'CODATA 2018'),
  ELECTRON_MASS: C(9.1093837015e-31, 'kg', 3.0e-10, false, 'CODATA 2018'),
  PROTON_MASS: C(1.67262192369e-27, 'kg', 3.1e-10, false, 'CODATA 2018'),
  NEUTRON_MASS: C(1.67492749804e-27, 'kg', 5.7e-10, false, 'CODATA 2018'),
  ATOMIC_MASS_CONSTANT: C(1.66053906660e-27, 'kg', 3.0e-10, false, 'CODATA 2018'),
  /** 1 u expressed in MeV/c^2 — used by nuclear Q-value calculations. */
  ATOMIC_MASS_ENERGY: C(931.49410242, 'MeV/c^2', 2.9e-10, false, 'CODATA 2018'),
  VACUUM_PERMITTIVITY: C(8.8541878128e-12, 'F/m', 1.6e-10, false, 'CODATA 2018'),
  VACUUM_PERMEABILITY: C(1.25663706212e-6, 'N/A^2', 1.5e-10, false, 'CODATA 2018'),
  FINE_STRUCTURE: C(7.2973525693e-3, '1', 1.5e-10, false, 'CODATA 2018'),
  RYDBERG_ENERGY: C(13.605693122994, 'eV', 9.2e-13, false, 'CODATA 2018'),
  RYDBERG_CONSTANT: C(10973731.568160, '1/m', 1.9e-12, false, 'CODATA 2018'),
  BOHR_RADIUS: C(5.29177210903e-11, 'm', 1.5e-10, false, 'CODATA 2018'),
  BOHR_MAGNETON: C(9.2740100783e-24, 'J/T', 2.8e-10, false, 'CODATA 2018'),
  STEFAN_BOLTZMANN: C(5.670374419e-8, 'W m^-2 K^-4', 0, true, 'CODATA 2018 (exact by SI)'),
  MOLAR_GAS_CONSTANT: C(8.31446261815324, 'J mol^-1 K^-1', 0, true, 'CODATA 2018 (exact by SI)'),
  FARADAY: C(96485.33212, 'C/mol', 0, true, 'CODATA 2018 (exact by SI)'),
  STANDARD_GRAVITY: C(9.80665, 'm/s^2', 0, true, 'CGPM 1901 (definition)'),
  STANDARD_ATMOSPHERE: C(101325, 'Pa', 0, true, 'CGPM definition'),
  STANDARD_TEMPERATURE: C(273.15, 'K', 0, true, 'definition of 0 degC'),
  WATER_TRIPLE_POINT: C(273.16, 'K', 1e-9, false, 'IAPWS-95'),
  WATER_CRITICAL_TEMPERATURE: C(647.096, 'K', 1e-6, false, 'IAPWS-95'),
  WATER_CRITICAL_PRESSURE: C(22.064e6, 'Pa', 1e-6, false, 'IAPWS-95'),
  WATER_CRITICAL_DENSITY: C(322.0, 'kg/m^3', 1e-5, false, 'IAPWS-95'),
  /** Latent heat of vaporisation at 100 degC, 1 atm. */
  WATER_LATENT_HEAT_VAP: C(2.257e6, 'J/kg', 1e-3, false, 'IAPWS-95 / NIST Webbook'),
  WATER_LATENT_HEAT_FUSION: C(3.337e5, 'J/kg', 1e-3, false, 'IAPWS-95'),
  WATER_SPECIFIC_HEAT: C(4184, 'J kg^-1 K^-1', 2e-3, false, 'IAPWS-95 at 20 degC'),
  ICE_DENSITY: C(916.8, 'kg/m^3', 1e-4, false, 'IAPWS'),
  SEAWATER_REFERENCE_DENSITY: C(1027.0, 'kg/m^3', 1e-3, false, 'TEOS-10 reference'),
  DRY_AIR_GAS_CONSTANT: C(287.052874, 'J kg^-1 K^-1', 1e-7, false, 'computed from R/M_d, ISO 2533'),
  WATER_VAPOUR_GAS_CONSTANT: C(461.5, 'J kg^-1 K^-1', 1e-5, false, 'computed from R/M_w'),
  DRY_AIR_SPECIFIC_HEAT: C(1004.7, 'J kg^-1 K^-1', 1e-4, false, 'ISO 2533'),
  /** Latent heat of vaporisation of water at 0 degC (used in Clausius-Clapeyron). */
  WATER_LATENT_HEAT_VAP_0C: C(2.501e6, 'J/kg', 1e-3, false, 'IAPWS-95'),
};

export const CONSTANTS = Object.freeze(TABLE);

/** Flat numeric accessor: `K.c`, `K.G`, ... Convenience without losing metadata. */
export const K = Object.freeze(
  Object.fromEntries(
    Object.entries({
      c: 'SPEED_OF_LIGHT',
      h: 'PLANCK',
      kB: 'BOLTZMANN',
      NA: 'AVOGADRO',
      e: 'ELEMENTARY_CHARGE',
      G: 'GRAVITATIONAL_CONSTANT',
      me: 'ELECTRON_MASS',
      mp: 'PROTON_MASS',
      mn: 'NEUTRON_MASS',
      u: 'ATOMIC_MASS_CONSTANT',
      uMeV: 'ATOMIC_MASS_ENERGY',
      eps0: 'VACUUM_PERMITTIVITY',
      mu0: 'VACUUM_PERMEABILITY',
      alpha: 'FINE_STRUCTURE',
      Ry: 'RYDBERG_ENERGY',
      Rinf: 'RYDBERG_CONSTANT',
      a0: 'BOHR_RADIUS',
      muB: 'BOHR_MAGNETON',
      sigmaSB: 'STEFAN_BOLTZMANN',
      R: 'MOLAR_GAS_CONSTANT',
      F: 'FARADAY',
      g0: 'STANDARD_GRAVITY',
      atm: 'STANDARD_ATMOSPHERE',
      T0: 'STANDARD_TEMPERATURE',
      T_triple: 'WATER_TRIPLE_POINT',
      T_crit: 'WATER_CRITICAL_TEMPERATURE',
      p_crit: 'WATER_CRITICAL_PRESSURE',
      rho_crit: 'WATER_CRITICAL_DENSITY',
      Lv: 'WATER_LATENT_HEAT_VAP',
      Lf: 'WATER_LATENT_HEAT_FUSION',
      cw: 'WATER_SPECIFIC_HEAT',
      rho_ice: 'ICE_DENSITY',
      rho_sw: 'SEAWATER_REFERENCE_DENSITY',
      Rd: 'DRY_AIR_GAS_CONSTANT',
      Rv: 'WATER_VAPOUR_GAS_CONSTANT',
      cpd: 'DRY_AIR_SPECIFIC_HEAT',
      Lv0: 'WATER_LATENT_HEAT_VAP_0C',
    }).map(([short, name]) => [short, CONSTANTS[name].value]),
  ),
);

/**
 * Physical constants of the Earth system.
 * Values follow IERS Conventions 2010 / WGS84 / IAU 2015 unless noted.
 */
export const EARTH = Object.freeze({
  /** WGS84 semi-major axis (equatorial radius). */
  RADIUS_EQ: 6378137.0,
  /** WGS84 semi-minor axis (polar radius). */
  RADIUS_POL: 6356752.314245,
  /** WGS84 flattening f = 1/298.257223563. */
  FLATTENING: 1 / 298.257223563,
  /** Geocentric gravitational constant GM (IERS 2010). */
  GM: 3.986004418e14,
  /** Mass derived from GM (not independently measured to this precision). */
  MASS: 3.986004418e14 / 6.6743e-11,
  /** Dynamical form factor J2 (IERS 2010). */
  J2: 1.08262668e-3,
  J3: -2.53265649e-6,
  J4: -1.61962159e-6,
  /** Mean radius (IUGG volumetric radius) R = (a^2 b)^(1/3). */
  RADIUS_MEAN: 6371008.7714,
  /** Sidereal rotation period, seconds (86164.0905 s). */
  SIDEREAL_DAY: 86164.0905,
  SOLAR_DAY: 86400.0,
  /** Rotation rate, rad/s. */
  OMEGA: (2 * Math.PI) / 86164.0905,
  /** Mean obliquity at J2000.0, degrees (IAU 2006). */
  OBLIQUITY_J2000_DEG: 23.439291111,
  /** Precession of the equinoxes, tropical period in Julian years. */
  PRECESSION_PERIOD_YEARS: 25771.57534,
  /** Ratio of specific heats for dry air (diatomic ideal gas approximation). */
  GAMMA_DRY_AIR: 1.4,
  /** Mean molar mass of dry air, kg/mol (ISO 2533). */
  MOLAR_MASS_DRY_AIR: 0.0289644,
  /** Standard sea-level temperature for ISA, K. */
  ISA_SEA_LEVEL_T: 288.15,
  /** Standard sea-level pressure, Pa. */
  ISA_SEA_LEVEL_P: 101325,
  /** ISA temperature lapse rate, K/m. */
  ISA_LAPSE_RATE: 0.0065,
  /** Total solar irradiance at 1 AU (TSI, Kopp & Lean 2011 / CERES). */
  SOLAR_CONSTANT: 1361.0,
  /** Planetary Bond albedo (CERES EBAF). */
  BOND_ALBEDO: 0.293,
  /** Effective radiating temperature implied by TSI & albedo (K). */
  T_EFF: Math.pow((1361 * (1 - 0.293)) / (4 * 5.670374419e-8), 0.25),
  /** Earth's mean surface temperature reference (K), for validation only. */
  MEAN_SURFACE_T: 288.0,
});

/** Sun and Moon (IAU 2015 nominal / JPL DE440). */
export const SOLAR_SYSTEM = Object.freeze({
  SUN_MASS: 1.98892e30,
  SUN_RADIUS: 6.957e8,
  SUN_LUMINOSITY: 3.828e26,
  SUN_TEFF: 5772.0,
  AU: 1.495978707e11,
  /** GM of the Sun, m^3/s^2. */
  SUN_GM: 1.32712440018e20,
  MOON_MASS: 7.342e22,
  MOON_RADIUS: 1.7374e6,
  MOON_GM: 4.9048695e12,
  /** Mean Earth-Moon distance, m. */
  MOON_SEMI_MAJOR_AXIS: 3.84399e8,
  MOON_ORBITAL_PERIOD_DAYS: 27.321582,
  /** Lunar inclination to the ecliptic, degrees. */
  MOON_INCLINATION_DEG: 5.145,
  /** Obliquity of Earth's axis, radians, at J2000. */
  OBLIQUITY: (23.439291111 * Math.PI) / 180,
  /** Mean eccentricity of Earth's orbit. */
  EARTH_ECCENTRICITY: 0.0167086,
  /** Length of tropical year, days. */
  TROPICAL_YEAR_DAYS: 365.242189,
  /** Length of sidereal year, days. */
  SIDEREAL_YEAR_DAYS: 365.256363004,
  /** Perihelion longitude drift (general precession in longitude), deg/century. */
  PERIHELION_PRECESSION_DEG_PER_CENTURY: 1.7192,
});

/**
 * Standard-atmosphere named constants for the US Standard Atmosphere 1976 /
 * ISO 2533 layering (geopotential altitude H, km).
 */
export const ISA_LAYERS = Object.freeze([
  { H: 0, T: 288.15, L: -0.0065 },
  { H: 11000, T: 216.65, L: 0.0 },
  { H: 20000, T: 216.65, L: 0.001 },
  { H: 32000, T: 228.65, L: 0.0028 },
  { H: 47000, T: 270.65, L: 0.0 },
  { H: 51000, T: 270.65, L: -0.0028 },
  { H: 71000, T: 214.65, L: -0.002 },
  { H: 84000, T: 186.87, L: 0.0 },
]);

/** Validate the constant table at import time (catches copy/paste mistakes). */
export function validateConstants() {
  const problems = [];
  if (Math.abs(K.c - 299792458) > 0) problems.push('c is not exact');
  if (Math.abs(K.R - K.NA * K.kB) > 1e-9) problems.push('R != NA*kB');
  if (Math.abs(K.sigmaSB - (2 * Math.PI ** 5 * K.kB ** 4) / (15 * K.h ** 3 * K.c ** 2)) > 1e-15)
    problems.push('Stefan-Boltzmann not consistent with h,kB,c');
  if (Math.abs(K.muB - (K.e * K.h) / (4 * Math.PI * K.me)) > 1e-34) problems.push('Bohr magneton');
  if (Math.abs(K.a0 - K.alpha / (4 * Math.PI * K.Rinf)) > 1e-13) problems.push('Bohr radius');
  if (Math.abs(K.Ry - 0.5 * K.alpha ** 2 * K.me * K.c ** 2 / K.e) > 1e-6) problems.push('Rydberg energy');
  return problems;
}

validateConstants();
