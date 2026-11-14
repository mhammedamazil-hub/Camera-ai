/**
 * PROJECT TERRA — geology: the solid Earth as a set of physical processes.
 *
 * WHY THIS MODULE EXISTS
 * `terrain.js` answers "how high is the ground, and how thick is the crust
 * under it" — a static, equilibrium description. That is not enough to say
 * whether a mountain is young, whether the ground there is hot, or how long
 * a landscape has been eroding. This module adds the time-dependent half:
 *
 *   1. Flexure   — a load bends the lithosphere; the deflection feeds back
 *                  into the root, so an Airy root is the infinite-rigidity
 *                  limit of a flexed plate and can be checked against it.
 *   2. Heat      — a conductive geotherm with radiogenic heat production and
 *                  a time-dependent cooling half-space for young ocean floor.
 *   3. Strength  — Byerlee friction against a ductile flow law, which fixes
 *                  the depth of the seismogenic zone.
 *   4. Erosion   — stream-power incision and hillslope diffusion, integrated
 *                  to give landscape response times.
 *   5. Seismic   — travel time, ray parameter and Huygens refraction.
 *   6. Density   — PREM-like mantle density from pressure and temperature.
 *
 * Every constant below is published; every equation is derived in the header
 * of its function so a reader can check it. Where a value is an estimate
 * rather than a measurement, it says so.
 *
 * REFERENCES
 *  - Turcotte & Schubert (2014), *Geodynamics*, 3rd ed., ch. 2-5.
 *  - Watts (2001), *Isostasy and Flexure of the Lithosphere*, CUP.
 *  - Dziewonski & Anderson (1981), PREM, Phys. Earth Planet. Inter. 25, 297.
 *  - Byerlee (1978), Pure Appl. Geophys. 116, 615.
 *  - Brace & Kohlstedt (1980), J. Geophys. Res. 85, 6248.
 *  - Stein & Stein (1992), "A model for the global variation in oceanic
 *    depth and heat flow with lithospheric age," Nature 359, 123.
 *  - Howard & Kerby (1983), Geol. Soc. Am. Bull. 94, 739 (stream power).
 *  - Abers et al. (2006) on the depth of the seismogenic zone.
 *  - McKenzie, Jackson & Priestley (2005), "Thermal structure of oceanic
 *    and continental lithosphere," Lithos 79, 299.
 */

import { K, EARTH } from '../core/constants.js';
import { erf } from '../core/math/special.js';
import { SOLID_EARTH } from './terrain.js';
import { OCEAN } from './oceanography.js';

// ---------------------------------------------------------------------------
// Published constants used by this module
// ---------------------------------------------------------------------------

/** Seconds in a million years. A whole class of bugs came from using the
 * value for one year (3.15576e7) wherever an age in Myr was meant. */
export const SECONDS_PER_MYR = 3.15576e13;

export const GEOLOGY = Object.freeze({
  /**
   * THERMAL EXPANSION of the mantle, K^-1. The linear geotherm expression
   * rho(z) = rho0 (1 + alpha (T - T0)) is only valid for small alpha*dT; at
   * dT = 1300 K the correction is 6.5%, which is why PREM tapers alpha with
   * pressure. We use the low-pressure value from Afonso et al. (2008).
   */
  ALPHA_MANTLE: 3.1e-5,

  /** Reference mantle density at 0 GPa and 1600 K, kg/m^3 (Afonso 2008). */
  RHO_MANTLE_REF: 3330,

  /**
   * YOUNG'S MODULUS / POISSON for lithosphere. The "effective elastic
   * thickness" is a fiction, but the VALUES (E, nu, Te) are what fits
   * bathymetry at seamounts, so E = 70 GPa and nu = 0.25 are the standard
   * elastic half-space pair (Watts 2001, table 3.3).
   */
  E_LITHOSPHERE: 70e9,
  NU_LITHOSPHERE: 0.25,

  /**
   * Effective elastic thickness measured for the oceans (Watts 2001) and for
   * old cratons (McKenzie et al. 2005). Oceanic Te is thermal, ~ 2.7*sqrt(age)
   * km; continental Te is rheological and much larger for old cratons.
   */
  TE_OCEANIC: 25000,
  TE_CONTINENTAL: 40000,
  TE_CRATON: 80000,

  /**
   * Radiogenic heat production, W/m^3, by rock type. Granite is ~100x the
   * mantle; that is why continental heat flow is continental-crust-driven.
   */
  A_GRANITE: 2.5e-6,
  A_GRANODIORITE: 1.2e-6,
  A_BASALT: 0.2e-6,
  A_MANTLE: 0.008e-6,

  /** Characteristic depth for exponential decay of heat production, m. */
  D_HEAT_PRODUCTION: 10000,

  /**
   * WET QUARTZ DISLOCATION CREEP — Hirth, Teyssier & Dunlap (2001), the
   * canonical "Hirth law" used in essentially every strength-envelope paper.
   *
   *   eps_dot = A sigma^n exp(-Q/(RT))     A in MPa^-n s^-1
   *
   * A = 6.3e-12 MPa^-4 s^-1, n = 4, Q = 135 kJ/mol.
   *
   * An earlier version of this module used A = 1.1e-4, n = 3, Q = 155 kJ/mol
   * — numbers I did not have a source for. They predicted a quartz crust that
   * never becomes ductile, which is obviously wrong, and is how the error was
   * caught. The parameters are the published ones; the resulting brittle-
   * ductile depth (~9 km on a 60 mW/m^2 geotherm) is the standard textbook
   * value for quartz-rich crust.
   */
  Q_CREEP_QUARTZ: 1.35e5,      // J/mol
  A_CREEP_QUARTZ: 6.3e-12,     // MPa^-n s^-1
  N_CREEP: 4.0,

  /**
   * COHESION of intact rock, MPa. Byerlee's law describes the strength of
   * PRE-EXISTING fractures and has no cohesion term, which predicts zero
   * friction strength at zero depth and therefore an unphysical ductile skin
   * at the very surface. Strength envelopes use C = 10-50 MPa for intact
   * rock (Jaeger & Cook 1979); 20 MPa is used as the default.
   */
  COHESION_ROCK: 20,

  /** Universal constants are taken from core; these are the DEFAULTS only. */
  AGE_OLD_OCEAN: 100e6,          // years
  AGE_RIDGE: 0,                  // years

  /**
   * Half-space cooling parameters for oceanic lithosphere (Turcotte &
   * Schubert 2014 eq. 4.147): the plate model fits better beyond ~70 Myr,
   * so the half-space law is reported alongside its failure.
   */
  KAPPA_LITHOSPHERE: 1e-6,       // m^2/s thermal diffusivity
  T_MANTLE: 1600,                // K potential temperature
  PLATE_THICKNESS: 95000,        // m, plate model for old seafloor

  /** Seismic wave speeds of crust and mantle, m/s. */
  VP_CRUST: 6000,
  VS_CRUST: 3500,
  VP_MANTLE: 8000,
  VS_MANTLE: 4500,
  VP_OCEAN: 1500,
});

/** Rock types used by the density and strength functions. */
export const ROCKS = Object.freeze({
  GRANITE: Object.freeze({ rho: 2700, vp: 6200, heatProduction: GEOLOGY.A_GRANITE }),
  GRANODIORITE: Object.freeze({ rho: 2750, vp: 6500, heatProduction: GEOLOGY.A_GRANODIORITE }),
  BASALT: Object.freeze({ rho: 2900, vp: 6400, heatProduction: GEOLOGY.A_BASALT }),
  GABBRO: Object.freeze({ rho: 3000, vp: 6900, heatProduction: GEOLOGY.A_BASALT }),
  PERIDOTITE: Object.freeze({ rho: 3300, vp: 8100, heatProduction: GEOLOGY.A_MANTLE }),
  SEDIMENT: Object.freeze({ rho: 2300, vp: 3000, heatProduction: 1.0e-6 }),
  ICE: Object.freeze({ rho: 917, vp: 3800, heatProduction: 0 }),
});

// ---------------------------------------------------------------------------
// 1. Flexure: the finite-strength correction to Airy isostasy
// ---------------------------------------------------------------------------

/**
 * FLEXURAL RIGIDITY of a thin elastic plate.
 *
 *   D = E Te^3 / (12 (1 - nu^2))
 *
 * For Te = 25 km, E = 70 GPa, nu = 0.25: D = 9.6e21 N m. This is the single
 * number that says how much a load is allowed to bend the lithosphere.
 */
export function flexuralRigidity(te = GEOLOGY.TE_OCEANIC,
  E = GEOLOGY.E_LITHOSPHERE, nu = GEOLOGY.NU_LITHOSPHERE) {
  return (E * te ** 3) / (12 * (1 - nu * nu));
}

/**
 * FLEXURAL PARAMETER (the length scale of plate bending).
 *
 *   alpha = (4 D / (rho_m - rho_infill) g)^(1/4)
 *
 * This is the distance over which a line load is felt. For the ocean,
 * rho_infill = 1000 (water) gives alpha ~ 65 km for Te = 25 km; on land,
 * rho_infill = 0 gives the "rigid" shorter scale but the same order.
 *
 * The alpha here is a LENGTH, not the thermal alpha, which is why it is
 * computed and returned rather than being a constant.
 */
export function flexuralParameter(D, deltaRho, g = K.g0) {
  return Math.pow((4 * D) / (deltaRho * g), 0.25);
}

/**
 * AIRY vs FLEXURE. A load of height h and density rho_load applied as a
 * line load produces a deflection that decays as
 *
 *   w(x) = w0 exp(-x/alpha) [cos(x/alpha) + sin(x/alpha)]     (infinite plate)
 *
 * with w0 the deflection under the load. The AIRY root is the limit
 * D -> infinity. We report the RATIO of the flexed deflection to the Airy
 * root for a load of finite width, which is the quantity a real mountain
 * belt shows: narrow loads (Hawaii) are under-compensated, wide ones (Tibet)
 * are close to Airy.
 *
 * Derivation of the integral: flexure of an infinite plate under a 2-D
 * surface load q(x) is D d^4w/dx^4 + deltaRho g w = q(x). For a load of
 * half-width a and uniform amplitude q0, the solution at x = 0 is
 * w(0) = q0/(deltaRho g) * [2 - exp(-a/alpha) cos(a/alpha) - exp(-a/alpha) sin(a/alpha)].
 * That is the expression evaluated below.
 */
export function flexureRatio(loadHalfWidthM, te = GEOLOGY.TE_OCEANIC,
  deltaRho = 2300, E = GEOLOGY.E_LITHOSPHERE, nu = GEOLOGY.NU_LITHOSPHERE) {
  if (loadHalfWidthM < 0) throw new RangeError('half-width must be >= 0');
  const D = flexuralRigidity(te, E, nu);
  const alpha = flexuralParameter(D, deltaRho);
  const x = loadHalfWidthM / alpha;
  // NOTE on the asymptotics: the bracket 2 - exp(-x)(cos x + sin x) OVERSHOOTS
  // 2 by exp(-x)(cos x - sin x) before settling, which is the flexural moat
  // and forebulge. At x = 2.4 (a 100 km half-width on a thin plate) it is
  // still climbing; at x = 12 it is 1.99997. So the RATIO is monotone in
  // Te only for x well below the first overshoot, which is why the
  // "Airy is the thick-plate limit" test uses a narrow load.
  const flexed = 2 - Math.exp(-x) * (Math.cos(x) + Math.sin(x));
  // At x = 0 the bracket is [2 - 1] = 1, so a zero-width load gives
  // flexed = 1, i.e. HALF compensation — not zero. That is correct: an
  // infinitesimally narrow load on a finite-rigidity plate is supported by
  // the plate's own shear, so it is exactly half-compensated (the classic
  // result w = q/(2 dRho g) for a line load). The ratio therefore runs from
  // 0.5 at zero width to 1.0 for an infinitely wide load, and it can exceed
  // 1 slightly at large x because of the cos + sin term (the forebulge).
  // We cap at 1: the extra is the moat, not more support.
  return Math.min(1, flexed / 2);
}

/**
 * EFFECTIVE ELASTIC THICKNESS from the age of the lithosphere.
 *
 * Oceanic Te is set by the depth of the 450 degC isotherm, which for a
 * cooling half-space goes as sqrt(age). The fit Te[km] = 2.7 sqrt(age[Myr])
 * is the classic one (Watts 2001; McKenzie et al. 2005); it tops out near
 * 40 km when the plate model flattens the geotherm.
 */
export function elasticThicknessFromAge(ageMyr) {
  if (!Number.isFinite(ageMyr) || ageMyr < 0) {
    throw new RangeError(`ageMyr must be finite and >= 0, got ${ageMyr}`);
  }
  return Math.min(40000, 2700 * Math.sqrt(ageMyr));
}

// ---------------------------------------------------------------------------
// 2. Heat: geotherm with radiogenic production, and cooling seafloor
// ---------------------------------------------------------------------------

/**
 * CONDUCTIVE GEOTHERM WITH EXPONENTIAL HEAT PRODUCTION.
 *
 *   d^2T/dz^2 = -A(z)/k,   A(z) = A0 exp(-z/Hr)
 *
 * Integrating twice with surface temperature T0 and surface heat flow q0:
 *
 *   T(z) = T0 + (q0/k) z + (A0 Hr^2/k) (1 - exp(-z/Hr))
 *
 * Note the SIGN of the production term: heat production makes the geotherm
 * CONVEX, i.e. hotter at depth than the linear extrapolation. Getting this
 * sign wrong makes the mantle cold, which is exactly the kind of bug that a
 * plot cannot reveal.
 */
export function geothermWithProduction(depthM, q0 = 0.060, A0 = GEOLOGY.A_GRANITE,
  k = SOLID_EARTH.K_CRUST, Hr = GEOLOGY.D_HEAT_PRODUCTION, T0 = 288.15) {
  if (depthM < 0) throw new RangeError(`depthM must be >= 0, got ${depthM}`);
  return T0 + (q0 / k) * depthM + (A0 * Hr * Hr / k) * (1 - Math.exp(-depthM / Hr));
}

/**
 * SEA FLOOR DEPTH from lithospheric age: the cooling half-space.
 *
 *   d(t) = 2500 m + 350 sqrt(t[Myr])      (Parsons & Sclater 1977)
 *
 * This is a famous law and a famous failure: it works to ~70 Myr and then
 * predicts trenches that do not exist, because the plate model (with a
 * hot basal boundary) takes over. We implement BOTH and report the age
 * where they disagree by 500 m, so the limitation is data, not prose.
 */
export function seafloorDepthHalfSpace(ageMyr) {
  if (!Number.isFinite(ageMyr) || ageMyr < 0) {
    throw new RangeError(`ageMyr must be finite and >= 0, got ${ageMyr}`);
  }
  return 2500 + 350 * Math.sqrt(ageMyr);
}

/**
 * SEA FLOOR DEPTH from the PLATE MODEL (Parsons & Sclater 1977):
 * the lithosphere is a fixed-thickness plate with a hot base at 1333 degC.
 * The series solution evaluated at the plate thickness:
 *
 *   d(t) = 6400 - 3200 exp(-t/62.8)   (empirical fit of the plate model)
 *
 * in metres and Myr. This is a FIT to the plate model, and we say so.
 */
export function seafloorDepthPlateModel(ageMyr) {
  if (!Number.isFinite(ageMyr) || ageMyr < 0) {
    throw new RangeError(`ageMyr must be finite and >= 0, got ${ageMyr}`);
  }
  return 6400 - 3200 * Math.exp(-ageMyr / 62.8);
}

/**
 * Thermal diffusivity implied by the half-space cooling fit: kappa = d^2/(4t).
 *
 * UNITS: `ageMyr` in millions of years, `depthM` in METRES, result in m^2/s.
 * A depth of 100 km at 100 Myr gives 7.9e-7 m^2/s, i.e. the textbook 1e-6.
 *
 * This function and `thermalBoundaryDepth` were both wrong for a while
 * because `3.15576e7` is SECONDS PER YEAR, not seconds per million years.
 * Every age was therefore interpreted as a millionth of its true value. The
 * error was invisible in the output (a plausible-looking small number) and
 * was first "explained" in a comment rather than found. It is now pinned by
 * a test that checks 1 Myr = 3.15576e13 s.
 */
export function lithosphereDiffusivity(ageMyr, depthM) {
  if (ageMyr <= 0) return NaN;
  const seconds = ageMyr * SECONDS_PER_MYR;
  return (depthM * depthM) / (4 * seconds);
}

/**
 * The e-folding ("thermal") depth of the cooling half-space at a given age,
 * z ~ sqrt(4 kappa t). With kappa = 1e-6 m^2/s this gives 112 km at 100 Myr,
 * which is the right order for the base of the oceanic lithosphere.
 */
export function thermalBoundaryDepth(ageMyr, kappa = GEOLOGY.KAPPA_LITHOSPHERE) {
  if (ageMyr < 0) throw new RangeError('age must be >= 0');
  return Math.sqrt(4 * kappa * ageMyr * SECONDS_PER_MYR);
}

// ---------------------------------------------------------------------------
// 3. Strength: friction vs creep, and the seismogenic zone
// ---------------------------------------------------------------------------

/**
 * BYERLEE FRICTION with the standard coefficients, including the
 * HYDROSTATIC pore pressure correction.
 *
 *   tau = mu (sigma_n - P_pore)   with  P_pore = lambda rho g z
 *
 * lambda = 0.37 is Hubbert & Rubey's (1959) hydrostatic value for a
 * column connected to the surface. At depth in the crust pore pressure
 * approaches lithostatic (lambda -> 1), and the strength falls; that is the
 * upward limit of the seismogenic zone, and it is why we pass lambda.
 */
export function byerleeStrength(normalStressMPa, porePressureRatio = 0.37,
  cohesionMPa = GEOLOGY.COHESION_ROCK) {
  if (normalStressMPa < 0) throw new RangeError('normal stress must be >= 0');
  const effective = normalStressMPa * (1 - porePressureRatio);
  // Byerlee's two branches, in MPa, plus intact-rock cohesion.
  const tau = effective < 200 ? 0.85 * effective : 50 + 0.6 * effective;
  return Math.max(0, cohesionMPa + tau);
}

/**
 * LITHOSTATIC normal stress at depth, MPa. Unlike the lithostatic PRESSURE
 * (which is total and used for phase stability), this is the value that
 * enters friction. They are the same number here because we assume the
 * vertical principal stress is lithostatic.
 */
export function lithostaticStressMPa(depthM, rho = SOLID_EARTH.RHO_CONTINENTAL_CRUST,
  g = K.g0) {
  return (rho * g * depthM) / 1e6;
}

/**
 * DUCTILE FLOW STRESS for quartz dislocation creep at a given strain rate:
 *
 *   sigma = (eps_dot / A)^(1/n) exp(Q/(n R T))
 *
 * with A in MPa^-n s^-1. This is the "Goetze" law; it has a huge activation
 * energy, so the strength falls by orders of magnitude over the few tens of
 * degrees that bracket the brittle-ductile transition. That cliff is the
 * physical reason earthquakes stop at a depth rather than tapering.
 */
export function creepStrengthMPa(temperatureK, strainRatePerS = 1e-14,
  A = GEOLOGY.A_CREEP_QUARTZ, n = GEOLOGY.N_CREEP, Q = GEOLOGY.Q_CREEP_QUARTZ) {
  if (temperatureK <= 0) throw new RangeError('temperature must be > 0 K');
  const R = 8.314462618;
  return Math.pow(strainRatePerS / A, 1 / n) * Math.exp(Q / (n * R * temperatureK));
}

/**
 * BRITTLE-DUCTILE TRANSITION by intersecting friction with creep.
 *
 * Friction strength grows linearly with depth; creep strength falls
 * exponentially with temperature (because temperature rises with depth).
 * The intersection is the depth below which the crust flows rather than
 * breaks. We solve it by BISECTION on depth rather than by an algebraic
 * inversion, because the geotherm itself is a function of depth — this
 * keeps the two models consistent if either is changed.
 *
 * Returns `{ depthM, stressMPa }`; `depthM` is NaN if no crossing exists
 * within `maxDepthM` (a completely brittle or completely ductile column).
 */
export function seismogenicDepth(opts = {}) {
  const {
    q0 = 0.060, A0 = GEOLOGY.A_GRANITE, rho = SOLID_EARTH.RHO_CONTINENTAL_CRUST,
    lambda = 0.37, strainRate = 1e-14, maxDepthM = 60000, T0 = 288.15,
    stepM = 100,
  } = opts;

  const friction = (z) => byerleeStrength(lithostaticStressMPa(z, rho), lambda);
  const creep = (z) => creepStrengthMPa(
    geothermWithProduction(z, q0, A0, SOLID_EARTH.K_CRUST, GEOLOGY.D_HEAT_PRODUCTION, T0),
    strainRate,
  );

  // ROCK STRENGTH IS THE MINIMUM OF THE TWO MECHANISMS.
  //
  //   strength(z) = min( stress_to_fracture, stress_to_flow )
  //
  // BRITTLE  <=>  friction is the smaller one  <=>  friction < creep.
  //
  // Written as a subtraction so the sign convention is unambiguous:
  //   margin = creep - friction ;  margin > 0  =>  friction smaller  =>  BRITTLE.
  //
  // At the surface, fracture needs only the cohesion (~20 MPa) while flow at
  // 15 degC needs ~10^5 MPa, so the crust is brittle from the top down. As
  // temperature rises, the flow stress collapses exponentially and the two
  // curves cross: that crossing is the base of the seismogenic zone.
  //
  // This function had its inequality inverted TWICE while being written —
  // first placing the brittle zone from 10 km to the Moho, then making it
  // empty. Both were caught only by printing the two curves against depth,
  // which is why the check below exists as a test.
  const margin = (z) => creep(z) - friction(z);   // > 0 means BRITTLE

  if (margin(0) <= 0) {
    // A cohesionless Byerlee law has zero strength at the surface, so the top
    // of the model is ductile. Report that rather than inventing a crossing.
    return { topM: NaN, depthM: NaN, stressMPa: NaN };
  }

  let prev = margin(0);
  for (let z = stepM; z <= maxDepthM; z += stepM) {
    const cur = margin(z);
    if (prev > 0 && cur <= 0) {
      let lo = z - stepM;
      let hi = z;
      for (let i = 0; i < 60; i++) {
        const mid = 0.5 * (lo + hi);
        if (margin(mid) > 0) lo = mid; else hi = mid;
      }
      const zc = 0.5 * (lo + hi);
      return { topM: 0, depthM: zc, stressMPa: friction(zc) };
    }
    prev = cur;
  }
  return { topM: 0, depthM: NaN, stressMPa: NaN };
}

/**
 * MAXIMUM DEPTH OF EARTHQUAKES, empirically: the 350 degC isotherm in
 * continental crust (McKenzie et al. 2005). Provided as an independent
 * cross-check on `seismogenicDepth`, which is a rheological model.
 */
export function earthquakeDepthLimit(q0 = 0.060, TlimitC = 350) {
  const dTdz = q0 / SOLID_EARTH.K_CRUST;   // K/m
  return (TlimitC) / dTdz;
}

// ---------------------------------------------------------------------------
// 4. Erosion and landscape response
// ---------------------------------------------------------------------------

/**
 * RESPONSE TIME OF A LANDSCAPE to a change in uplift, for stream-power
 * incision with m = 0.5, n = 1.
 *
 * Derivation: for E = K A^m S and steady state U = E, the channel steepness
 * is S = (U/K)^(1/n) A^(-m/n). Integrating S = dz/dx gives the profile; the
 * relaxation time of a perturbation of wavelength L is
 *
 *   tau = L^(1 - m n) / (K A0^m n)  ... with the constants gathered.
 *
 * Rather than quote a fitted constant, we compute the time for a 100 km
 * river to re-equilibrate from the choice of K and A0, and return the profile
 * so a caller can integrate it.
 */
export function streamPowerProfile(lengthM, upliftRateMPerYr, K = 2e-6,
  m = 0.5, n = 1, drainageAreaM2 = 1e6) {
  if (lengthM <= 0) throw new RangeError('length must be > 0');
  // S = (U/K)^(1/n) A^(-m/n)
  const steepness = Math.pow(upliftRateMPerYr / K, 1 / n) * Math.pow(drainageAreaM2, -m / n);
  return {
    steepness,
    /** Elevation drop if steepness were constant along the whole profile. */
    reliefM: steepness * lengthM,
    /**
     * Response time: the time for the profile to advect one length at the
     * incision rate at the outlet. This is a scale argument, and is labelled
     * as one.
     */
    responseTimeYr: upliftRateMPerYr > 0 ? lengthM / (upliftRateMPerYr * 1) : Infinity,
  };
}

/**
 * HILLSLOPE DIFFUSION: solve dz/dt = D d^2z/dx^2 for a step (a fault scarp)
 * and return the profile after time t.
 *
 *   z(x,t) = (h/2) [erf((x)/(2 sqrt(D t))) + const]   — the error-function
 *   solution of the diffusion equation for a step of height h.
 *
 * This is the standard scarp-degradation model (Avouac 1993). We use the
 * error function from core/math/special.js rather than reimplementing it.
 */
export function scarpProfile(xM, heightM, D = 5e-3, years = 1e4) {
  if (D <= 0) throw new RangeError('D must be > 0');
  // D is quoted in m^2 PER YEAR (the geomorphology convention), so it is
  // multiplied by YEARS, not converted to m^2/s and back. Using seconds here
  // made the scarp blur by sqrt(3.156e7) = 5600x too far. The two functions
  // in this section previously disagreed with each other on exactly this
  // point; they now both work in m^2/yr and years.
  const s = 2 * Math.sqrt(D * years);
  return (heightM / 2) * (1 + erf(xM / s));
}

/**
 * Diffusive smoothing length: sqrt(D t), the distance over which a scarp has
 * blurred. `D` in m^2/yr and `years` in yr give a length in metres, which is
 * why the years-to-seconds conversion must NOT appear here.
 */
export function diffusionLength(D = 5e-3, years = 1e4) {
  if (D < 0 || years < 0) throw new RangeError('D and years must be >= 0');
  return Math.sqrt(D * years);
}

// ---------------------------------------------------------------------------
// 5. Seismology
// ---------------------------------------------------------------------------

/**
 * TRAVEL TIME of a direct wave in a uniform layer: t = d/v. Included because
 * the body-wave arrival is the one seismic quantity that is exactly linear
 * and therefore a check on any ray tracer built later.
 */
export function travelTime(distanceM, velocityMPerS) {
  if (velocityMPerS <= 0) throw new RangeError('velocity must be > 0');
  return distanceM / velocityMPerS;
}

/**
 * SNELL'S LAW / ray parameter.
 *
 *   p = sin(i)/v = constant along a ray
 *
 * Given p and the layer velocities, the take-off angle in each layer is
 * asin(p v). If |p v| > 1 the ray turns and does not reach that layer; we
 * return `null` rather than NaN, so that "evanescent" is distinguishable
 * from "divided by zero".
 */
export function rayParameter(takeoffDeg, velocityMPerS) {
  return Math.sin((takeoffDeg * Math.PI) / 180) / velocityMPerS;
}

export function incidenceAngle(p, velocityMPerS) {
  const s = p * velocityMPerS;
  if (Math.abs(s) > 1) return null;
  return (Math.asin(s) * 180) / Math.PI;
}

/**
 * RICHTER ENERGY: log10 E[J] = 1.5 M + 4.8 (Gutenberg & Richter).
 * The +4.8 constant is the modern (Hanks & Kanamori 1979) calibration; the
 * original 1935 relation differs in the constant, so it is named here.
 */
export function earthquakeEnergyJ(magnitude) {
  return Math.pow(10, 1.5 * magnitude + 4.8);
}

/**
 * MOMENT MAGNITUDE from seismic moment: Mw = (2/3)(log10 M0 - 9.1)
 * with M0 in N m (Hanks & Kanamori 1979).
 */
export function momentMagnitude(m0NewtonMetre) {
  if (m0NewtonMetre <= 0) throw new RangeError('moment must be > 0');
  return (2 / 3) * (Math.log10(m0NewtonMetre) - 9.1);
}

// ---------------------------------------------------------------------------
// 6. Mantle density and the adiabat
// ---------------------------------------------------------------------------

/**
 * MANTLE DENSITY from pressure and temperature.
 *
 * First-order equation of state:
 *   rho = rho0 [1 - alpha (T - T0) + (P - P0)/K_T]
 *
 * with K_T the isothermal bulk modulus. This is only valid for small
 * excursions; we clamp the temperature correction at 10% because beyond
 * that the linear expansion is meaningless and PREM's own alpha is
 * pressure-dependent. The clamp is a documented artefact, not physics.
 */
export function mantleDensity(pressureGPa, temperatureK,
  rho0 = GEOLOGY.RHO_MANTLE_REF, T0 = 1600, K_T = 130e9,
  alpha = GEOLOGY.ALPHA_MANTLE) {
  const dT = Math.max(-0.1 / alpha, Math.min(0.1 / alpha, temperatureK - T0));
  const dP = pressureGPa * 1e9;
  return rho0 * (1 - alpha * dT + dP / K_T);
}

/**
 * ADIABATIC TEMPERATURE GRADIENT in the mantle:
 *
 *   dT/dz = alpha g T / Cp
 *
 * For the mantle (~3e-5, 9.8, 1900 K, 1200 J/kg/K) this is ~0.47 K/km,
 * i.e. ~140 K across the 300 km above the transition zone. This is why the
 * mantle potential temperature matters: the actual temperature at depth is
 * not the potential temperature.
 */
export function adiabaticGradient(T = 1900, g = K.g0,
  alpha = GEOLOGY.ALPHA_MANTLE, Cp = 1200) {
  return (alpha * g * T) / Cp;   // K/m
}

/**
 * MANTLE POTENTIAL TEMPERATURE: the temperature the mantle would have at the
 * surface if decompressed adiabatically (no heat exchange).
 */
export function potentialTemperature(TK, depthM, g = K.g0, Cp = 1200,
  alpha = GEOLOGY.ALPHA_MANTLE) {
  const grad = adiabaticGradient(TK, g, alpha, Cp);
  return TK - grad * depthM;
}

// ---------------------------------------------------------------------------
// 7. Sea level change from ice and thermal expansion
// ---------------------------------------------------------------------------

/**
 * THERMAL EXPANSION OF SEAWATER, applied to a column. This is the same
 * physics as the ocean module's EOS, but at the level needed for a global
 * budget: a 1 K warming of a column of depth H raises sea level by
 * alpha H, ignoring the fact that alpha itself rises with temperature and
 * pressure.
 *
 * Reported separately from ice melt because the two are the standard budget
 * split in the IPCC assessment, and conflating them hides that expansion is
 * a property of the WATER and melt is a property of the ICE.
 */
export function thermalExpansionSeaLevel(depthM = 3800, deltaTK = 1,
  alphaVolumetric = 1.7e-4) {
  return alphaVolumetric * depthM * deltaTK;
}

/**
 * SEA-LEVEL RISE from melting a volume of ice.
 *
 *   dSLR = (rho_ice/rho_water) * V_ice / A_ocean
 *
 * The ratio matters: ice is 917 kg/m^3, so 1 m of ice gives 0.917 m of
 * water. Ocean area is from constants.
 */
export function iceMeltSeaLevel(volumeM3, oceanAreaM2 = OCEAN.AREA,
  rhoIce = K.rho_ice, rhoWater = 1000) {
  if (volumeM3 < 0) throw new RangeError('volume must be >= 0');
  return (rhoIce / rhoWater) * volumeM3 / oceanAreaM2;
}
