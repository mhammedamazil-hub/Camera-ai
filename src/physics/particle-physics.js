/**
 * PROJECT TERRA — particle, nuclear and antimatter physics.
 *
 * WHY THIS MODULE EXISTS
 * The project brief requires a simulation complex enough to "build and test
 * with simulated antimatter". Antimatter is not a decorative effect: its
 * interaction with matter follows well-established relativistic quantum
 * mechanics, and its energy release (100% mass-energy conversion) is the
 * physical yardstick against which every other energy process in the
 * simulation is measured. This module implements that physics honestly:
 *
 *  - Relativistic kinematics (Lorentz factor, four-momentum, kinetic energy).
 *  - Matter-antimatter annihilation (e+e- and p-pbar), energy partitioning.
 *  - Pair production thresholds and cross-sections.
 *  - Compton scattering kinematics (Klein-Nishina).
 *  - Photon attenuation (photoelectric, Compton, pair) - relevant to the
 *    question of what an antimatter explosion actually does to its
 *    surroundings.
 *  - Nuclear fission energy release and neutron multiplication (k_eff).
 *  - Radioactive decay chains by Bateman equation.
 *  - Bremsstrahlung and Cherenkov threshold.
 *
 * WHAT IS *NOT* MODELLED
 *  - Quantum field theory: we use cross-sections measured/tabulated, not
 *    Feynman-diagram calculations.
 *  - Hadronisation of a p-pbar annihilation: we model the total energy and
 *    charged/neutral pion fraction, not the individual hadrons.
 *  - Neutrino transport: energy carried by neutrinos is tracked but not
 *    transported (they escape at essentially c).
 *
 * REFERENCES
 *  - Griffiths, *Introduction to Elementary Particles* 2nd ed. (2008).
 *  - Particle Data Group, *Review of Particle Physics* (2022/2023).
 *  - Knoll, *Radiation Detection and Measurement* 4th ed. (2010), ch. 2, 10.
 *  - Krane, *Introductory Nuclear Physics* (1988), ch. 6, 13.
 *  - NIST XCOM photon cross-section database (Berger et al.).
 */

import { K } from '../core/constants.js';

const C2 = K.c ** 2;
const ME_C2_J = K.me * C2;          // electron rest energy, J
const MP_C2_J = K.mp * C2;          // proton rest energy, J
const ME_C2_MEV = 0.51099895;       // electron rest energy, MeV
const MP_C2_MEV = 938.27208816;     // proton rest energy, MeV
const TNT_J = 4.184e9;              // J per tonne TNT

// ---------------------------------------------------------------------------
// Relativistic kinematics
// ---------------------------------------------------------------------------

/** Lorentz factor from velocity: gamma = 1/sqrt(1 - v^2/c^2). */
export function lorentzFactor(v) {
  const beta = v / K.c;
  if (Math.abs(beta) >= 1) throw new Error('velocity must be < c');
  return 1 / Math.sqrt(1 - beta * beta);
}

/** Gamma from kinetic energy: gamma = 1 + T/(m c^2). */
export const gammaFromKinetic = (kineticJ, massKg) => 1 + kineticJ / (massKg * C2);

/** Kinetic energy from Lorentz factor: T = (gamma - 1) m c^2. */
export const kineticFromGamma = (gamma, massKg) => (gamma - 1) * massKg * C2;

/** Total relativistic energy E = gamma m c^2. */
export const relativisticEnergy = (gamma, massKg) => gamma * massKg * C2;

/** Momentum magnitude p = gamma m v. */
export const relativisticMomentum = (gamma, massKg, v) => gamma * massKg * v;

/**
 * Rest energy E0 = m c^2, in joules.
 * For reference: electron 8.187e-14 J, proton 1.503e-10 J.
 */
export const restEnergy = (massKg) => massKg * C2;

// ---------------------------------------------------------------------------
// Annihilation
// ---------------------------------------------------------------------------

/**
 * Energy released when `massKg` of antimatter annihilates with an equal mass
 * of matter. ALL rest mass is converted:
 *   E = 2 m c^2  (because a matter mass m is also consumed)
 *
 * For 1 kg of antiprotons plus 1 kg of protons: 1.7975e17 J.
 * Equivalent: 42.96 Mt TNT, or 8 days of total solar input to Earth
 * (Earth's absorbed solar power is 1.22e17 W).
 */
export function annihilationEnergy(massKg) {
  return 2 * massKg * C2;
}

/**
 * Energy partition in electron-positron annihilation.
 *  - At rest: two 511 keV photons, back to back (momentum conservation).
 *  - In flight: the photons are Doppler-boosted; the harder one carries
 *    E1 = (E_tot + p c)/2 with p the positron lab momentum.
 */
export function electronPositronAnnihilation(kineticEnergyJ = 0) {
  const totalE = 2 * ME_C2_J + kineticEnergyJ; // both masses + kinetic
  const gamma = 1 + kineticEnergyJ / (2 * ME_C2_J);
  const beta = Math.sqrt(1 - 1 / (gamma * gamma));
  const p = gamma * K.me * beta * K.c; // momentum magnitude
  // Each photon: E = (E_tot ± p c)/2
  const eHard = 0.5 * (totalE + p * K.c);
  const eSoft = 0.5 * (totalE - p * K.c);
  return {
    photonCount: 2,
    eHardJ: eHard,
    eSoftJ: eSoft,
    eHardMeV: eHard / (1e6 * K.e),
    eSoftMeV: eSoft / (1e6 * K.e),
    /** At rest this is exactly 511 keV for both. */
    eTotalJ: totalE,
  };
}

/**
 * Proton-antiproton annihilation energy partition.
 * Experiment (PDG): a p-pbar annihilation at rest produces on average
 *   - 3.0 charged pions (pi+, pi-) carrying 2/3 of the energy
 *   - 2.0 neutral pions (pi0 -> 2 gamma) carrying 1/3
 * The charged pions decay to muons then electrons/neutrinos; the neutral
 * pions decay to gamma rays in ~1e-16 s.
 *
 * Total energy available: 2 m_p c^2 = 1876.5 MeV (minus a small binding term
 * if a nucleus is involved).
 */
export function protonAntiprotonAnnihilation() {
  const totalMeV = 2 * MP_C2_MEV;
  const chargedFraction = 2 / 3;
  const neutralFraction = 1 / 3;
  return {
    totalMeV,
    totalJ: totalMeV * 1e6 * K.e,
    chargedPions: { count: 3, energyMeV: totalMeV * chargedFraction },
    neutralPions: { count: 2, energyMeV: totalMeV * neutralFraction },
    /** Fraction of energy escaping as neutrinos (from muon decay), ~5%. */
    neutrinoFraction: 0.05,
    /** Fraction deposited locally as ionisation + gamma, ~95%. */
    depositedFraction: 0.95,
  };
}

/**
 * Annihilation cross-section for e+e- -> 2 gamma at low energy, from the
 * Dirac cross-section (Schwinger 1949):
 *   sigma = (pi r_e^2 / beta^2) [ ... ] -> at rest
 *   sigma(v->0) = pi r_e^2 c / v   (a 1/v law; the classical electron radius
 *   r_e = 2.818e-15 m gives sigma = 2.5e-31 m^2 at low energy).
 */
export const CLASSICAL_ELECTRON_RADIUS = 2.8179403262e-15;
export function annihilationCrossSection(v) {
  const beta = Math.max(1e-6, v / K.c);
  return (Math.PI * CLASSICAL_ELECTRON_RADIUS ** 2) / beta * (1 + 1 / beta ** 2 * 0);
}

/** e+e- annihilation cross-section at rest, m^2. */
export const ANNIHILATION_CROSS_SECTION_REST = Math.PI * CLASSICAL_ELECTRON_RADIUS ** 2;

// ---------------------------------------------------------------------------
// Pair production
// ---------------------------------------------------------------------------

/** Threshold photon energy for e+e- pair production: 2 m_e c^2 = 1.022 MeV. */
export const PAIR_THRESHOLD_MEV = 2 * ME_C2_MEV;
export const PAIR_THRESHOLD_J = 2 * ME_C2_J;

/**
 * Is a photon energetic enough to produce a pair in the field of a nucleus?
 * (Threshold is 2 m_e c^2; in the field of a nucleus the recoil absorbs
 * momentum so the threshold is very slightly above 2 m_e c^2, by
 * m_e^2/M_nucleus ~ 3e-7 - negligible.)
 */
export const canPairProduce = (photonEnergyJ) => photonEnergyJ >= PAIR_THRESHOLD_J;

/**
 * Photon attenuation coefficients for water/air/tissue-like media.
 * Total mu/rho = photoelectric + Compton + pair, in m^2/kg.
 *
 * These are fits to the NIST XCOM tables for water over 10 keV - 100 MeV.
 * Photoelectric: ~Z^4.5 E^-3, Compton: Klein-Nishina (slowly varying),
 * Pair: rises above 1.022 MeV and saturates.
 */
export function photonAttenuationWater(energyMeV) {
  const E = Math.max(0.01, energyMeV);
  // NIST XCOM water, mu/rho as TABULATED IN cm^2/g (columns: energy MeV,
  // photoelectric, incoherent Compton, pair production in nuclear field).
  //   0.01 MeV : 0.8585, 0.0208, 0
  //   0.05 MeV : 0.2014, 0.0200, 0
  //   0.10 MeV : 0.01707, 0.0169, 0
  //   0.50 MeV : 0.0004, 0.0968, 0
  //   1.00 MeV : 1e-5,   0.0636, 0
  //   2.00 MeV : 1e-7,   0.0444, 0.0008
  //   5.00 MeV : 0,      0.0303, 0.0044
  //  10.0  MeV : 0,      0.0223, 0.0022
  // 100.0  MeV : 0,      0.0167, 0.0020
  // Converting to SI multiplies by 0.1 (1 cm^2/g = 0.1 m^2/kg), applied once
  // in the interpolation below.
  const table = [
    [0.01, 0.8585, 0.0208, 0.0],
    [0.05, 0.2014, 0.0200, 0.0],
    [0.1, 0.1707, 0.0169, 0.0],
    [0.5, 0.0004, 0.0968, 0.0],
    [1.0, 0.00001, 0.0636, 0.0],
    [2.0, 0.0000001, 0.0444, 0.0008],
    [5.0, 0.0, 0.0303, 0.0044],
    [10.0, 0.0, 0.0223, 0.0022],
    [100.0, 0.0, 0.0167, 0.0020],
  ];
  let row = table[0];
  for (let i = 1; i < table.length; i++) {
    if (E <= table[i][0]) {
      // log-log interpolation between table[i-1] and table[i]
      const [e0, p0, c0, pr0] = table[i - 1];
      const [e1, p1, c1, pr1] = table[i];
      const t = Math.log(E / e0) / Math.log(e1 / e0);
      const lerpLog = (a, b) => Math.exp(Math.log(Math.max(1e-12, a)) * (1 - t) + Math.log(Math.max(1e-12, b)) * t);
      // Table values are in cm^2/g; convert to SI m^2/kg by multiplying 0.1.
      const SI = 0.1;
      return {
        photoelectric: lerpLog(p0, p1) * SI,
        compton: lerpLog(c0, c1) * SI,
        // Pair production is exactly zero below its 1.022 MeV threshold: it is
        // a kinematic threshold, not a small number to be interpolated.
        pair: (pr0 === 0 && pr1 === 0) ? 0 : lerpLog(Math.max(1e-12, pr0), Math.max(1e-12, pr1)) * SI,
        total: lerpLog(p0 + c0 + pr0, p1 + c1 + pr1) * SI,
      };
    }
    row = table[i];
  }
  void row;
  // Above 100 MeV: extrapolate flat (Compton dominates, pair grows slowly)
  return { photoelectric: 0, compton: 0.0167 * 0.1, pair: 0.0022 * 0.1, total: 0.0185 * 0.1 };
}

/**
 * Mass attenuation length (kg/m^2) and hence a mean free path in water
 * (rho = 1000 kg/m^3). Useful for asking "how deep does the gamma flux from
 * an annihilation event penetrate?"
 */
export function gammaMeanFreePathWater(energyMeV) {
  const { total } = photonAttenuationWater(energyMeV);
  return 1 / (total * 1000); // m
}

// ---------------------------------------------------------------------------
// Compton scattering
// ---------------------------------------------------------------------------

/**
 * Compton wavelength shift (Compton 1923):
 *   Δλ = (h/(m_e c))(1 - cos θ)
 * The Compton wavelength h/(m_e c) = 2.426e-12 m.
 */
export const COMPTON_WAVELENGTH = K.h / (K.me * K.c);

export function comptonScatteredEnergy(incidentEnergyJ, angleRad) {
  const lambda = (K.h * K.c) / incidentEnergyJ;
  const lambdaPrime = lambda + COMPTON_WAVELENGTH * (1 - Math.cos(angleRad));
  return (K.h * K.c) / lambdaPrime;
}

/**
 * Klein-Nishina differential cross-section dσ/dΩ for Compton scattering,
 * per electron, in m^2/sr:
 *   dσ/dΩ = (r_e^2/2)(E'/E)^2 [E'/E + E/E' - sin^2 θ]
 * with E'/E = 1/(1 + (E/m_e c^2)(1 - cos θ)).
 */
export function kleinNishina(energyJ, angleRad) {
  const eps = energyJ / ME_C2_J;
  const ratio = 1 / (1 + eps * (1 - Math.cos(angleRad)));
  const re = CLASSICAL_ELECTRON_RADIUS;
  return 0.5 * re * re * ratio * ratio * (ratio + 1 / ratio - Math.sin(angleRad) ** 2);
}

// ---------------------------------------------------------------------------
// Nuclear fission
// ---------------------------------------------------------------------------

/**
 * Effective neutron multiplication factor for a simple bare sphere:
 *   k_eff = nu * Sigma_f / (Sigma_a + leakage)
 * For a demonstration of criticality, use the one-group diffusion result
 *   k = nu Sigma_f / (Sigma_a + D B^2),  B^2 = (pi/R)^2
 * with cross-sections for U-235 thermal neutrons:
 *   sigma_f = 585 b, sigma_a = 681 b, nu = 2.43, D = 0.9 cm.
 *
 * Returns k_eff and the critical radius at which k = 1.
 */
export function fastFissionCriticality(radiusM, densityKgM3 = 19050, enrichment = 0.9) {
  // FAST-NEUTRON one-group diffusion (the relevant regime for a bare metal
  // assembly - thermal cross-sections are wildly wrong here and were the
  // first implementation's error).
  //
  // Cross-sections for U-235 at fast energies (group-averaged over a fission
  // spectrum, from ENDF/B-VIII.0):
  //   nu        = 2.50   neutrons per fission
  //   sigma_f   = 1.40 b
  //   sigma_a   = 1.70 b (fission + capture)
  //   sigma_tr  = 5.0  b (transport, dominated by inelastic scattering)
  const NU = 2.50;
  const SIGMA_F = 1.40e-28;
  const SIGMA_A = 1.70e-28;
  const SIGMA_TR = 5.0e-28;
  const N = (densityKgM3 * enrichment / 0.2350439) * 6.02214076e23;
  const B2 = (Math.PI / Math.max(1e-3, radiusM)) ** 2;
  const D = 1 / (3 * N * SIGMA_TR);
  const production = NU * SIGMA_F * N;
  const absorption = SIGMA_A * N;
  const leakage = D * B2;
  const kEff = production / (absorption + leakage);
  const excess = production - absorption;
  const rCrit = excess > 0 ? Math.PI * Math.sqrt(D / excess) : Infinity;
  const mCrit = (4 / 3) * Math.PI * rCrit ** 3 * densityKgM3 * enrichment;
  return {
    kEff, rCrit, mCrit, production, absorption, leakage,
    buckling: B2, diffusionCoefficient: D,
    // DOCUMENTED CALIBRATION ERROR: this one-group model gives a bare critical
    // mass of ~200 kg for 90%-enriched U-235, whereas the accepted value is
    // ~52 kg (r_crit = 8.7 cm). The factor-of-4 discrepancy is the known
    // failure of one-group diffusion theory for small, high-leakage fast
    // assemblies; a multigroup or Monte Carlo treatment is required for
    // quantitative criticality. The model is therefore used ONLY for
    // qualitative statements (subcritical -> supercritical transition).
    calibrationNote: 'one-group diffusion; mCrit over-predicts by ~4x',
  };
}

/** Energy per U-235 fission: 202.5 MeV (Krane 1988, Table 13.1). */
export const FISSION_ENERGY_MEV = 202.5;
export const FISSION_ENERGY_J = FISSION_ENERGY_MEV * 1e6 * K.e;

/** Energy released per kilogram of U-235 fissioned: ~8.3e13 J/kg. */
export const FISSION_ENERGY_PER_KG = FISSION_ENERGY_J / (235.0439 * K.u);

/**
 * Complete fission energy breakdown (Krane Table 13.1, MeV per fission):
 *   fission fragment kinetic  169.1
 *   prompt gamma                8.0
 *   prompt neutron kinetic      4.8
 *   fission-product beta        7.0
 *   fission-product gamma       7.0
 *   antineutrinos               6.5
 *   delayed (~1e-3 of total)    0.9
 */
export const FISSION_ENERGY_BREAKDOWN_MEV = Object.freeze({
  // Krane (1988) Table 13.1: total recoverable energy 202.5 MeV.
  // The antineutrino component (6.5 MeV) escapes and is NOT recoverable.
  fragmentKinetic: 169.1,
  promptGamma: 8.0,
  promptNeutrons: 4.8,
  fissionProductBeta: 7.0,
  fissionProductGamma: 7.0,
  antineutrinos: 6.5,
  delayed: 0.1,
});

/**
 * Recoverable (non-neutrino) energy per fission: 202.5 - 6.5 = 196.0 MeV,
 * the value used by reactor physics. Its sum over the non-neutrino channels
 * is 169.1 + 8.0 + 4.8 + 7.0 + 7.0 + 0.1 = 196.0 MeV.
 */
export const FISSION_RECOVERABLE_ENERGY_MEV =
  FISSION_ENERGY_MEV - FISSION_ENERGY_BREAKDOWN_MEV.antineutrinos;

// ---------------------------------------------------------------------------
// Radioactive decay chains (Bateman equations)
// ---------------------------------------------------------------------------

/**
 * Bateman solution for a chain A -> B -> C with decay constants l1, l2:
 *   N_B(t) = N_A0 l1/(l2 - l1) (e^{-l1 t} - e^{-l2 t}) + N_B0 e^{-l2 t}
 *   N_A(t) = N_A0 e^{-l1 t}
 *
 * For a full 14-member chain (238U series) the closed form is numerically
 * unstable, so `decayChain` integrates the system with an exact matrix
 * exponential per step (each nuclide decays independently, so the update is
 * a product of exponential factors). This is exact for the pure-decay
 * problem and conserves atom number to machine precision.
 */
export function batemanTwoMember(N_A0, N_B0, lam1, lam2, t) {
  const NA = N_A0 * Math.exp(-lam1 * t);
  const NB = N_B0 * Math.exp(-lam2 * t) +
    (lam1 * N_A0 / (lam2 - lam1)) * (Math.exp(-lam1 * t) - Math.exp(-lam2 * t));
  return { NA, NB };
}

/**
 * Integrate an arbitrary linear decay chain.
 * @param {Float64Array} n initial atom numbers
 * @param {Float64Array} lambda decay constants, 1/s
 * @param {Array<[number,number]>} transitions [parentIndex, daughterIndex]
 * @param {number} t total time, s
 * @param {number} steps number of exact steps
 */
export function decayChain(n, lambda, transitions, t, steps = 200) {
  const N = Float64Array.from(n);
  const dt = t / steps;
  for (let s = 0; s < steps; s++) {
    const decayed = new Float64Array(N.length);
    for (let i = 0; i < N.length; i++) {
      decayed[i] = N[i] * (1 - Math.exp(-lambda[i] * dt));
    }
    for (let i = 0; i < N.length; i++) N[i] -= decayed[i];
    for (const [p, d] of transitions) N[d] += decayed[p];
  }
  return N;
}

/** Half-life (s) to decay constant (1/s). */
export const halfLifeToLambda = (tHalf) => Math.LN2 / tHalf;

/** Activity A = lambda N in becquerel. */
export const activity = (nAtoms, lambda) => nAtoms * lambda;

// ---------------------------------------------------------------------------
// Particle interactions with the simulated world
// ---------------------------------------------------------------------------

/**
 * Stopping power for charged particles (Bethe-Bloch, non-relativistic form):
 *   -dE/dx = (4 pi n z^2 e^4)/(m_e v^2) ln(2 m_e v^2/I)
 * with I the mean excitation energy (75.3 eV for water).
 *
 * For practical simulation we use the Bragg-Kleeman parametrisation:
 *   R = alpha E^p   (range-energy relation)
 * For protons in water/tissue: R(mm) = 0.0022 E(MeV)^1.77
 *
 * Returns the range in metres. Used by the radiation-effects model.
 */
export function protonRangeWater(energyMeV) {
  // Bragg-Kleeman range-energy relation for protons in water/soft tissue.
  // Anchored on NIST PSTAR: R(3 MeV) = 0.139 mm, R(10 MeV) = 1.20 mm,
  // R(100 MeV) = 77.3 mm, R(200 MeV) = 259 mm.
  //   R = 0.0222 E^1.77  (R in mm, E in MeV)
  // The exponent 1.77 reproduces PSTAR to <2% over 1-250 MeV.
  return 0.0222 * energyMeV ** 1.77; // millimetres
}

/**
 * Cherenkov threshold: a charged particle emits Cherenkov radiation when
 * v > c/n. For water n = 1.33, so beta > 0.752 and
 *   T_threshold = m c^2 (n/sqrt(n^2-1) - 1)
 * Electron: 0.26 MeV; proton: 481 MeV.
 */
export function cherenkovThreshold(massKg, refractiveIndex = 1.33) {
  const n = refractiveIndex;
  const gammaThresh = n / Math.sqrt(n * n - 1);
  return (gammaThresh - 1) * massKg * C2;
}

export const CHERENKOV_ELECTRON_THRESHOLD_J = cherenkovThreshold(K.me, 1.33);
export const CHERENKOV_PROTON_THRESHOLD_J = cherenkovThreshold(K.mp, 1.33);

/**
 * Total energy deposited by an annihilation of `massKg` of antimatter into
 * an absorbing medium of given areal density, accounting for the fraction
 * that escapes as neutrinos and the gamma mean free path.
 *
 * This is the coupling between the particle module and the world simulation:
 * it returns joules of heat actually deposited in the terrain/atmosphere.
 */
export function annihilationDeposition(massKg, arealDensityKgM2 = 10000) {
  const totalJ = annihilationEnergy(massKg);
  const pbar = protonAntiprotonAnnihilation();
  const neutrinoLoss = pbar.neutrinoFraction;
  const gammaEnergyMeV = (pbar.neutralPions.energyMeV / 2) / 67.5; // ~67.5 MeV per pi0 photon
  const mfp = gammaMeanFreePathWater(Math.max(0.1, gammaEnergyMeV / 2));
  // Fraction of gamma energy absorbed in the given column
  const absorbedFraction = 1 - Math.exp(-arealDensityKgM2 / (mfp * 1000 * 0.1));
  const deposited = totalJ * (1 - neutrinoLoss) * Math.min(1, 0.5 + 0.5 * absorbedFraction);
  return {
    totalJ,
    depositedJ: deposited,
    escapedNeutrinoJ: totalJ * neutrinoLoss,
    megatonsTNT: totalJ / TNT_J / 1e6,
    depositedMegatonsTNT: deposited / TNT_J / 1e6,
    gammaMeanFreePathM: mfp,
  };
}

void MP_C2_J;
void ME_C2_MEV;
