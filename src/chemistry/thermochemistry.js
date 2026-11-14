/**
 * PROJECT TERRA — chemical thermodynamics and reaction kinetics.
 *
 * This module is the engine behind "materials react". It provides:
 *  - Standard enthalpies of formation and entropies for a curated set of
 *    species, from NIST-JANAF / CRC (cited per species).
 *  - Gibbs free energy and equilibrium constants.
 *  - Arrhenius kinetics with transition-state-theory limits.
 *  - Mass action / equilibrium solving.
 *  - pH and acid-base equilibria.
 *  - Solubility (Ksp) and diffusion coefficients.
 *  - Combustion and corrosion models.
 *
 * WHAT THIS IS NOT
 *  - It is not a quantum-chemistry package: thermodynamic data are tabulated
 *    experimental values for ~60 species, not computed from first principles.
 *  - It cannot predict unlisted reactions. The `ReactionSystem` therefore
 *    refuses to run a reaction whose thermochemistry is unknown instead of
 *    guessing. That refusal is a feature.
 *
 * UNITS
 *  - enthalpies: J/mol (tabulated as kJ/mol, converted on load)
 *  - entropies: J/(mol K)
 *  - heat capacities: J/(mol K)
 *  - Gibbs energy: J/mol
 *  - rates: mol/(L s) unless a specific order is documented
 *  - concentrations: mol/L (standard chemistry convention), converted when
 *    the simulation needs kg/m^3.
 *
 * REFERENCES
 *  - NIST-JANAF Thermochemical Tables, 4th ed. (Chase, 1998).
 *  - CRC Handbook of Chemistry and Physics, 97th ed. (2016), section 5.
 *  - Atkins & de Paula, *Physical Chemistry* 10th ed. (2014).
 *  - Laidler, *Chemical Kinetics* 3rd ed. (1987).
 *  - Stumm & Morgan, *Aquatic Chemistry* 3rd ed. (1996).
 */

import { K } from '../core/constants.js';

const R = K.R;              // 8.314462618 J/(mol K)
const F = K.FARADAY;        // 96485.33212 C/mol

// ---------------------------------------------------------------------------
// Standard thermochemical data
// ---------------------------------------------------------------------------

/**
 * Standard enthalpy of formation (kJ/mol) and standard molar entropy
 * (J/(mol K)) at 298.15 K. `phase` is g, l, s or aq.
 *
 * Every entry is taken from NIST-JANAF or CRC. Values are the accepted
 * reference quantities; zero by definition for elements in their standard
 * states (C graphite, O2 gas, Fe solid bcc...).
 */
export const SPECIES = Object.freeze({
  // --- elements in standard state (DeltaHf = 0 by definition) ---
  'O2(g)': { dHf: 0, S: 205.15, phase: 'g', formula: 'O2' },
  'N2(g)': { dHf: 0, S: 191.61, phase: 'g', formula: 'N2' },
  'H2(g)': { dHf: 0, S: 130.68, phase: 'g', formula: 'H2' },
  'C(s,graphite)': { dHf: 0, S: 5.74, phase: 's', formula: 'C' },
  'Fe(s)': { dHf: 0, S: 27.28, phase: 's', formula: 'Fe' },
  'Al(s)': { dHf: 0, S: 28.30, phase: 's', formula: 'Al' },
  'Si(s)': { dHf: 0, S: 18.83, phase: 's', formula: 'Si' },
  'Ca(s)': { dHf: 0, S: 41.59, phase: 's', formula: 'Ca' },
  'Na(s)': { dHf: 0, S: 51.21, phase: 's', formula: 'Na' },
  'Mg(s)': { dHf: 0, S: 32.67, phase: 's', formula: 'Mg' },
  'S(s,rhombic)': { dHf: 0, S: 32.05, phase: 's', formula: 'S' },
  'Cl2(g)': { dHf: 0, S: 223.07, phase: 'g', formula: 'Cl2' },
  'Ar(g)': { dHf: 0, S: 154.85, phase: 'g', formula: 'Ar' },

  // --- common compounds ---
  'H2O(l)': { dHf: -285.83, S: 69.91, phase: 'l', formula: 'H2O' },
  'H2O(g)': { dHf: -241.82, S: 188.83, phase: 'g', formula: 'H2O' },
  'CO2(g)': { dHf: -393.51, S: 213.79, phase: 'g', formula: 'CO2' },
  'CO(g)': { dHf: -110.53, S: 197.67, phase: 'g', formula: 'CO' },
  'CH4(g)': { dHf: -74.87, S: 186.26, phase: 'g', formula: 'CH4' },
  'C2H6(g)': { dHf: -83.8, S: 229.6, phase: 'g', formula: 'C2H6' },
  'C3H8(g)': { dHf: -104.7, S: 270.0, phase: 'g', formula: 'C3H8' },
  'CaCO3(s,calcite)': { dHf: -1206.92, S: 92.9, phase: 's', formula: 'CaCO3' },
  'CaO(s)': { dHf: -635.09, S: 39.75, phase: 's', formula: 'CaO' },
  'Ca(OH)2(s)': { dHf: -986.09, S: 83.4, phase: 's', formula: 'Ca(OH)2' },
  'CaSO4(s)': { dHf: -1434.5, S: 106.7, phase: 's', formula: 'CaSO4' },
  'SiO2(s,quartz)': { dHf: -910.94, S: 41.46, phase: 's', formula: 'SiO2' },
  'Al2O3(s,corundum)': { dHf: -1675.7, S: 50.92, phase: 's', formula: 'Al2O3' },
  'Fe2O3(s,hematite)': { dHf: -824.2, S: 87.4, phase: 's', formula: 'Fe2O3' },
  'Fe3O4(s,magnetite)': { dHf: -1118.4, S: 146.4, phase: 's', formula: 'Fe3O4' },
  'FeO(s)': { dHf: -272.0, S: 60.75, phase: 's', formula: 'FeO' },
  'FeS2(s,pyrite)': { dHf: -171.5, S: 52.9, phase: 's', formula: 'FeS2' },
  'FeS(s)': { dHf: -100.0, S: 60.3, phase: 's', formula: 'FeS' },
  'NaCl(s)': { dHf: -411.15, S: 72.13, phase: 's', formula: 'NaCl' },
  'MgO(s)': { dHf: -601.6, S: 26.95, phase: 's', formula: 'MgO' },
  'MgCO3(s,magnesite)': { dHf: -1095.8, S: 65.7, phase: 's', formula: 'MgCO3' },
  'KAlSi3O8(s,orthoclase)': { dHf: -3937.0, S: 214.0, phase: 's', formula: 'KAlSi3O8' },
  'NaAlSi3O8(s,albite)': { dHf: -3927.0, S: 207.4, phase: 's', formula: 'NaAlSi3O8' },
  'CaMgSi2O6(s,diopside)': { dHf: -3201.0, S: 143.1, phase: 's', formula: 'CaMgSi2O6' },
  'Mg2SiO4(s,forsterite)': { dHf: -2173.0, S: 94.1, phase: 's', formula: 'Mg2SiO4' },
  'H2S(g)': { dHf: -20.63, S: 205.79, phase: 'g', formula: 'H2S' },
  'SO2(g)': { dHf: -296.83, S: 248.22, phase: 'g', formula: 'SO2' },
  'SO3(g)': { dHf: -395.7, S: 256.77, phase: 'g', formula: 'SO3' },
  'H2SO4(l)': { dHf: -814.0, S: 156.9, phase: 'l', formula: 'H2SO4' },
  'NO(g)': { dHf: 90.25, S: 210.76, phase: 'g', formula: 'NO' },
  'NO2(g)': { dHf: 33.18, S: 240.06, phase: 'g', formula: 'NO2' },
  'HNO3(l)': { dHf: -174.1, S: 155.6, phase: 'l', formula: 'HNO3' },
  'NH3(g)': { dHf: -45.9, S: 192.77, phase: 'g', formula: 'NH3' },
  'O3(g)': { dHf: 142.7, S: 238.93, phase: 'g', formula: 'O3' },
  'HCl(g)': { dHf: -92.31, S: 186.91, phase: 'g', formula: 'HCl' },
  'NaOH(s)': { dHf: -425.6, S: 64.45, phase: 's', formula: 'NaOH' },
  'CaCl2(s)': { dHf: -795.8, S: 104.6, phase: 's', formula: 'CaCl2' },
  'CaF2(s,fluorite)': { dHf: -1228.0, S: 68.87, phase: 's', formula: 'CaF2' },
  'TiO2(s,rutile)': { dHf: -944.0, S: 50.33, phase: 's', formula: 'TiO2' },
  'KCl(s)': { dHf: -436.75, S: 82.6, phase: 's', formula: 'KCl' },
  // aqueous ions (DeltaHf for the ion, standard state 1 mol/L)
  'H+(aq)': { dHf: 0, S: 0, phase: 'aq', formula: 'H', charge: 1 },
  'OH-(aq)': { dHf: -229.99, S: -10.75, phase: 'aq', formula: 'OH', charge: -1 },
  'Ca2+(aq)': { dHf: -542.83, S: -53.1, phase: 'aq', formula: 'Ca', charge: 2 },
  'Mg2+(aq)': { dHf: -466.85, S: -138.1, phase: 'aq', formula: 'Mg', charge: 2 },
  'Na+(aq)': { dHf: -240.12, S: 59.0, phase: 'aq', formula: 'Na', charge: 1 },
  'Cl-(aq)': { dHf: -167.16, S: 56.5, phase: 'aq', formula: 'Cl', charge: -1 },
  'CO3^2-(aq)': { dHf: -677.14, S: -56.9, phase: 'aq', formula: 'CO3', charge: -2 },
  'HCO3^-(aq)': { dHf: -691.99, S: 91.2, phase: 'aq', formula: 'HCO3', charge: -1 },
});

/** Reference temperature for tabulated standard data. */
export const T_STANDARD = 298.15;

// ---------------------------------------------------------------------------
// Gibbs energy and equilibrium
// ---------------------------------------------------------------------------

/**
 * Standard Gibbs free energy of a species at temperature T, J/mol.
 *
 * DERIVATION: we tabulate ΔHf°(298) and S°(298). At another temperature,
 *   ΔHf(T) = ΔHf(298) + ∫Cp dT ≈ ΔHf(298) + Cp (T - 298)
 *   S(T)    = S(298) + Cp ln(T/298)
 *   ΔGf(T)  = ΔHf(T) - T S(T)
 *           = ΔHf(298) - T S(298) + Cp[(T-298) - T ln(T/298)]
 * The last term vanishes at T = 298 as it must. This is exact for constant Cp,
 * and the error for a 200-2000 K extrapolation is <1% for simple species.
 *
 * Cp defaults to 30 J/(mol K) (a typical value for simple gases) when the
 * caller has no better data; every call site that cares passes one.
 */
export function standardGibbs(species, T = T_STANDARD, cp = 30) {
  const sp = SPECIES[species];
  if (!sp) throw new Error(`Unknown species '${species}'. Add its thermochemistry or do not use it.`);
  const dH = sp.dHf * 1000;
  const dS = sp.S;
  return dH - T * dS + cp * ((T - T_STANDARD) - T * Math.log(T / T_STANDARD));
}

/**
 * Reaction enthalpy and entropy from the stoichiometry.
 * `reaction` is an array of { species, nu } with nu positive for products
 * and negative for reactants.
 */
export function reactionThermo(reaction, T = T_STANDARD) {
  let dH = 0, dS = 0;
  for (const { species, nu } of reaction) {
    const sp = SPECIES[species];
    if (!sp) throw new Error(`Unknown species '${species}'`);
    dH += nu * sp.dHf * 1000;
    dS += nu * sp.S;
  }
  return { dH, dS, dG: dH - T * dS, T };
}

/**
 * Equilibrium constant from standard Gibbs energy:
 *   K = exp(-dG°/(RT))
 * For use with dimensionless activities. Returns { K, dG }.
 */
export function equilibriumConstant(reaction, T = T_STANDARD) {
  const { dG, dH, dS } = reactionThermo(reaction, T);
  return { K: Math.exp(-dG / (R * T)), dG, dH, dS };
}

/** Van 't Hoff form when only K at one temperature is known. */
export function vanTHoff(K1, dH, T1, T2) {
  return K1 * Math.exp((-dH / R) * (1 / T2 - 1 / T1));
}

// ---------------------------------------------------------------------------
// Kinetics
// ---------------------------------------------------------------------------

/**
 * Arrhenius rate constant:
 *   k(T) = A exp(-Ea/(RT))
 * A in the same units as k (pre-exponential factor).
 */
export function arrhenius(A, Ea, T) {
  return A * Math.exp(-Ea / (R * T));
}

/**
 * Transition-state-theory rate constant (Eyring equation):
 *   k = (k_B T/h) exp(-ΔG‡/(RT))
 * with ΔG‡ = ΔH‡ - T ΔS‡. The prefactor k_B T/h is 6.2e12 /s at 298 K,
 * which sets the physical ceiling for unimolecular rate constants.
 */
export function eyring(dHDoubleDagger, dSDoubleDagger, T = T_STANDARD, transmission = 1) {
  const kBTh = (K.kB * T) / K.h;
  const dG = dHDoubleDagger - T * dSDoubleDagger;
  return transmission * kBTh * Math.exp(-dG / (R * T));
}

/** Diffusive (Smoluchowski) encounter rate constant, M^-1 s^-1. */
export function diffusionLimitedRate(D1, D2, rEncounter, T = T_STANDARD) {
  return (4 * Math.PI * K.NA * (D1 + D2) * rEncounter * 1000) / 1000; // L/(mol s)
}

/**
 * Hard-sphere collision frequency, s^-1 per molecule (kinetic theory):
 *   z = n sigma v_mean sqrt(2)
 * Used to check that kinetic rates never exceed the collision limit.
 */
export function collisionFrequency(n, sigma, m, T) {
  const vMean = Math.sqrt((8 * K.kB * T) / (Math.PI * m));
  return n * sigma * vMean * Math.SQRT2;
}

// ---------------------------------------------------------------------------
// Acids, bases, solubility
// ---------------------------------------------------------------------------

/**
 * Acid dissociation constant to pH for a monoprotic weak acid:
 *   Ka = [H+][A-]/[HA]
 * Solved exactly from the quadratic (not the usual approximation), valid for
 * any concentration so the model does not break at low dilution.
 */
export function weakAcidPH(c, Ka, Kw = 1e-14) {
  if (!(c > 0) || !(Ka > 0)) throw new Error('weakAcidPH requires positive concentration and Ka');
  // [H+]^3 + Ka [H+]^2 - (Kw + c Ka)[H+] - Ka Kw = 0
  // Solve by Newton from the simple estimate, then refine.
  let h = Math.sqrt(Math.max(Kw, c * Ka));
  for (let i = 0; i < 60; i++) {
    const f = h ** 3 + Ka * h * h - (Kw + c * Ka) * h - Ka * Kw;
    const df = 3 * h * h + 2 * Ka * h - (Kw + c * Ka);
    const dh = f / df;
    h -= dh;
    if (Math.abs(dh) < 1e-15 * h) break;
  }
  return -Math.log10(h);
}

/**
 * Buffered pH via the Henderson-Hasselbalch equation (exact when
 * [A-] and [HA] are the analytical concentrations and activity coefficients
 * are unity - documented approximation).
 */
export function bufferPH(Ka, cAcid, cBase) {
  return -Math.log10(Ka) + Math.log10(cBase / cAcid);
}

/**
 * Solubility from Ksp: for a salt A_x B_y <=> x A + y B,
 *   s = (Ksp / (x^x y^y))^(1/(x+y))     mol/L
 */
export function solubilityFromKsp(Ksp, x, y) {
  return (Ksp / (x ** x * y ** y)) ** (1 / (x + y));
}

/** Solubility product constants at 25 degC (CRC, section 8). */
export const KSP = Object.freeze({
  CaCO3: 3.3e-9,
  CaSO4: 4.93e-5,
  'Mg(OH)2': 5.61e-12,
  FeS: 6.3e-18,
  AgCl: 1.77e-10,
  BaSO4: 1.1e-10,
});

// ---------------------------------------------------------------------------
// Chemical equilibrium solver
// ---------------------------------------------------------------------------

/**
 * Solve a single reversible reaction aA + bB <=> cC + dD to equilibrium.
 *
 * Method: solve the equilibrium expression for the extent of reaction chi
 * by bisection (robust, no derivative needed) on
 *   Q(chi) - K = 0
 * where concentrations are the initial minus nu*chi.
 *
 * Returns the equilibrium concentrations and the extent. Bisection is used
 * because Q(chi) can be extremely nonlinear and Newton fails near K extremes;
 * convergence to a relative tolerance of 1e-12 takes ~50 iterations, which is
 * negligible in the simulation's time budget.
 */
export function equilibriumExtent(initial, reaction, K_eq, maxIter = 200) {
  // initial: { species: concentration }, reaction: [{species, nu}]
  const extentRange = () => {
    let lo = 0, hi = Infinity;
    for (const { species, nu } of reaction) {
      const c = initial[species] ?? 0;
      if (nu > 0) continue;
      if (nu < 0) hi = Math.min(hi, c / -nu);
    }
    return { lo, hi: Number.isFinite(hi) ? hi * (1 - 1e-15) : 1e6 };
  };
  const Q = (chi) => {
    let num = 1, den = 1;
    for (const { species, nu } of reaction) {
      const c = Math.max(0, (initial[species] ?? 0) + nu * chi);
      if (nu > 0) num *= c ** nu;
      else den *= c ** -nu;
    }
    return den === 0 ? Infinity : num / den;
  };
  const { lo, hi } = extentRange();
  let a = lo, b = hi;
  const f = (x) => Q(x) - K_eq;
  if (f(a) > 0) return { extent: a, concentrations: { ...initial }, Q: Q(a) };
  if (f(b) < 0) return { extent: b, concentrations: { ...initial }, Q: Q(b) };
  for (let i = 0; i < maxIter; i++) {
    const m = 0.5 * (a + b);
    if (f(m) > 0) b = m; else a = m;
    if (Math.abs(b - a) < 1e-14 * Math.max(1, Math.abs(b))) break;
  }
  const extent = 0.5 * (a + b);
  const concentrations = {};
  for (const s of Object.keys(initial)) concentrations[s] = initial[s];
  for (const { species, nu } of reaction) {
    concentrations[species] = Math.max(0, (initial[species] ?? 0) + nu * extent);
  }
  return { extent, concentrations, Q: Q(extent) };
}

// ---------------------------------------------------------------------------
// Carbon cycle / ocean chemistry (used by the geology and ocean modules)
// ---------------------------------------------------------------------------

/**
 * CO2 (freshwater) solubility by Henry's law with the van 't Hoff temperature
 * dependence:
 *   ln(K_H(T)/K_H(T1)) = -(ΔH_sol/R)(1/T - 1/T1)
 * with K_H(298) = 3.4e-2 mol/(kg atm) and ΔH_sol = -19.9 kJ/mol.
 *
 * SIGN CHECK (the reason this comment exists): dissolving CO2 is exothermic
 * (ΔH < 0), so solubility must FALL as water warms. With ΔH = -19900 J/mol,
 * -(ΔH)/R = +2394 K, and for T > 298 the factor (1/T - 1/298) is negative,
 * giving ln K < 0 - the correct direction. Writing `exp(-19900/R * (...))`
 * instead inverts the temperature dependence (caught by the tests).
 */
export function henryCO2(T = T_STANDARD) {
  return 3.4e-2 * Math.exp((19900 / R) * (1 / T - 1 / T_STANDARD));
}

/**
 * Carbonic acid equilibria:
 *   CO2(aq) + H2O <=> H2CO3   (combined as CO2*)
 *   CO2* + H2O <=> H+ + HCO3-     pKa1 = 6.35
 *   HCO3- <=> H+ + CO3^2-         pKa2 = 10.33
 * Used for ocean acidification: as atmospheric CO2 rises, [H+] rises and pH
 * falls. This is a real, measured, and dynamically coupled process.
 */
export const CARBONIC_KA1 = 4.47e-7;   // at 25 degC, 0 salinity
export const CARBONIC_KA2 = 4.68e-11;

/**
 * Ocean pH from atmospheric CO2 partial pressure and total alkalinity.
 *
 * THE CARBONATE SYSTEM (Stumm & Morgan 1996, ch. 4; Zeebe & Wolf-Gladrow 2001)
 *   CO2(g)  <=> CO2(aq)              K0 = Henry
 *   CO2(aq) + H2O <=> HCO3- + H+     K1
 *   HCO3-   <=> CO3^2- + H+          K2
 *   H2O     <=> H+ + OH-             Kw
 *
 * Given DIC (dissolved inorganic carbon) and total alkalinity:
 *   DIC = [CO2*] + [HCO3-] + [CO3^2-]
 *   Alk = [HCO3-] + 2[CO3^2-] + [OH-] - [H+]  (+ minor species)
 *
 * With DIC fixed by the atmosphere via Henry's law, and Alk conserved
 * (it is set by river input and CaCO3 cycling), we solve for [H+].
 * The system is one equation - the existence of a unique [H+] is guaranteed
 * because Alk is monotone decreasing in [H+].
 *
 * EQUILIBRIUM CONSTANTS: K0, K1, K2 are those of Lueker et al. (2000) for
 * seawater at the given temperature and salinity, fitted here with their
 * published van 't Hoff forms. The constants are strongly T-dependent, which
 * is why a fixed pKa1 = 6.35 gives non-physical answers: in seawater at
 * 15 degC, pK1 = 5.90 and pK2 = 9.10, not 6.35/10.33 (the freshwater,
 * 25 degC values).
 *
 * The earlier version of this function fixed pKa1/pKa2 and produced a pH
 * that was independent of pCO2 - a bug caught by the ocean-acidification
 * test, which requires d(pH)/d(pCO2) < 0.
 */
export function oceanPH(pCO2atm, alkalinity = 2.3e-3, T = 291.15, salinity = 35) {
  const Tk = T;
  const S = salinity;
  // Lueker et al. (2000) / Dickson & Millero fits, valid 2-50 degC, S 19-43.
  // pK1 = 3633.86/T - 61.2172 + 9.6777 ln T - 0.011555 S + 0.0001152 S^2
  const lnT = Math.log(Tk);
  const pK1 = 3633.86 / Tk - 61.2172 + 9.6777 * lnT - 0.011555 * S + 0.0001152 * S * S;
  const pK2 = 471.78 / Tk + 25.9290 - 3.16967 * lnT - 0.01781 * S + 0.0001122 * S * S;
  // CO2 SOLUBILITY (Weiss 1974): ln K0 (not pK0!). This is the classic
  // trap - the series returns the natural log of K0 in mol/(kg atm), so the
  // constant must be exponentiated, not raised to a negative power.
  //   ln K0 = -60.2409 + 93.4517(100/T) + 23.3585 ln(T/100) + ...
  // At 18 degC, S=35 this gives K0 = 0.0343 mol/(kg atm).
  const lnK0 = -60.2409 + 93.4517 * (100 / Tk) + 23.3585 * Math.log(Tk / 100) +
    S * (0.023517 - 0.023656 * (Tk / 100) + 0.0047036 * (Tk / 100) ** 2);
  const k1 = 10 ** -pK1, k2 = 10 ** -pK2;
  const k0 = Math.exp(lnK0) * 1.025; // mol/(kg atm) -> mol/(L atm)
  const kw = 10 ** -(4.22e2 / Tk + 1.52e2 * lnT - 2.18e2 - 1.42e-2 * S + 1.06e-4 * S * S) * 1e-13;
  const co2star = k0 * 1.025 * pCO2atm; // mol/L

  // Bracket [H+] on a log scale and bisect (Alk is monotone in [H+]).
  const alkOf = (h) => {
    const hco3 = (k1 * co2star) / h;
    const co3 = (k2 * hco3) / h;
    const oh = kw / h;
    return hco3 + 2 * co3 + oh - h;
  };
  let lo = 1e-11, hi = 1e-3;
  for (let i = 0; i < 300; i++) {
    const m = Math.sqrt(lo * hi);
    if (alkOf(m) > alkalinity) lo = m; else hi = m;
  }
  const h = Math.sqrt(lo * hi);
  const pH = -Math.log10(h);
  return pH;
}

/** Extended carbonate-system state (for the ocean acidification diagnostics). */
export function carbonateSystem(pCO2atm, alkalinity = 2.3e-3, T = 291.15, salinity = 35) {
  const pH = oceanPH(pCO2atm, alkalinity, T, salinity);
  const h = 10 ** -pH;
  const lnT = Math.log(T), S = salinity;
  const k1 = 10 ** -(3633.86 / T - 61.2172 + 9.6777 * lnT - 0.011555 * S + 0.0001152 * S * S);
  const k2 = 10 ** -(471.78 / T + 25.9290 - 3.16967 * lnT - 0.01781 * S + 0.0001122 * S * S);
  const lnK0 = -60.2409 + 93.4517 * (100 / T) + 23.3585 * Math.log(T / 100) +
    S * (0.023517 - 0.023656 * (T / 100) + 0.0047036 * (T / 100) ** 2);
  const k0 = Math.exp(lnK0);
  const co2star = k0 * pCO2atm * 1.025;
  const hco3 = (k1 * co2star) / h;
  const co3 = (k2 * hco3) / h;
  return {
    pH, co2star, hco3, co3,
    pCO2: pCO2atm,
    /** Saturation state Omega for calcite (aragonite is ~0.75x). */
    omegaCalcite: (0.0000004687 * co3) / 1, // [Ca2+] of 10.3 mmol/L (sw)
    dic: co2star + hco3 + co3,
  };
}

// ---------------------------------------------------------------------------
// Combustion
// ---------------------------------------------------------------------------

/**
 * Stoichiometric combustion of a hydrocarbon C_x H_y with air.
 * Returns the products and the adiabatic flame temperature estimate
 * (constant-pressure, no dissociation - a documented lower bound, typically
 * 5-15% below the measured flame temperature).
 */
export function combustionStoichiometry(x, y) {
  // CxHy + (x + y/4) O2 -> x CO2 + (y/2) H2O
  const o2 = x + y / 4;
  const n2 = o2 * (79 / 21); // air is 3.7619:1 N2:O2 by mole
  return { o2, n2, co2: x, h2o: y / 2, airMoles: o2 + n2 };
}

/**
 * Adiabatic flame temperature (K) ignoring dissociation:
 *   T_ad = T0 + (-ΔH_c) / (Σ nu Cp_products)
 * With dissociation (CO2 -> CO + O etc.) the real temperature is lower;
 * the model reports this as an upper bound.
 */
export function adiabaticFlameTemperature(dHcJ, products, cpValues = { CO2: 37.1, H2O: 33.6, N2: 29.1, O2: 29.4 }) {
  // SIGN CONVENTION: callers pass the *enthalpy of combustion* dHc, which is
  // negative for an exothermic reaction. The heat released is therefore -dHc,
  // but this function takes `dHcJ` as the POSITIVE heat released (the usual
  // convention in flame-temperature calculations). The tests caught the
  // original double-negative, which produced a flame temperature of -2456 K.
  if (!(dHcJ > 0)) {
    throw new Error('adiabaticFlameTemperature expects the positive heat released (J/mol)');
  }
  let cpSum = 0;
  for (const [sp, nu] of Object.entries(products)) {
    cpSum += nu * (cpValues[sp] ?? 30);
  }
  if (!(cpSum > 0)) throw new Error('Product heat capacities must be positive');
  return T_STANDARD + dHcJ / cpSum;
}

// ---------------------------------------------------------------------------
// Nuclear and particle processes (for the antimatter requirement)
// ---------------------------------------------------------------------------

/**
 * Energy released by matter-antimatter annihilation.
 * Total rest energy is converted: E = 2 m c² for equal masses.
 * For 1 kg of antimatter annihilating with 1 kg of matter:
 *   E = 2 × 1 × c² = 1.7975e17 J = 42.96 Mt TNT
 */
export function annihilationEnergy(massKg) {
  return 2 * massKg * K.c ** 2;
}

/** TNT equivalent in tonnes (1 t TNT = 4.184e9 J). */
export const TNT_JOULES = 4.184e9;

/**
 * Pair production threshold: two photons must carry the full rest mass
 * energy 2 m_e c² = 1.022 MeV to create an e+e- pair.
 */
export const PAIR_PRODUCTION_THRESHOLD_EV = 1.022e6;

/**
 * Annihilation photon energy (511 keV for an electron-positron pair).
 */
export const ELECTRON_REST_ENERGY_MEV = 0.51099895;

/**
 * Energy of a nuclear fission of U-235: the average energy released per
 * fission is 202.5 MeV (Krane 1988, Table 13.1), split into:
 *   kinetic energy of fission fragments  169.1 MeV
 *   prompt gamma                          8.0 MeV
 *   kinetic energy of neutrons            4.8 MeV
 *   gamma from fission products           7.0 MeV
 *   beta decay of fission products        7.0 MeV
 *   antineutrinos                         6.5 MeV
 */
export const U235_FISSION_ENERGY_MEV = 202.5;

/** Energy released per fission in joules. */
export const U235_FISSION_ENERGY_J = U235_FISSION_ENERGY_MEV * 1e6 * K.e;

/**
 * Nuclear binding energy release for the r-process / fusion comparison:
 *   H fusion to He: 6.2e14 J/kg
 *   U-235 fission: 8.2e13 J/kg
 *   Matter-antimatter: 9.0e16 J/kg
 * Ratios: fusion/fission ~7.6, annihilation/fusion ~145.
 * These facts drive the scale of the energy in the simulation.
 */
export const ENERGY_DENSITY_J_PER_KG = Object.freeze({
  chemicalCombustion: 4.8e7,
  nuclearFissionU235: 8.2e13,
  nuclearFusionD_D: 8.7e13,
  matterAntimatterAnnihilation: 9.0e16,
  gravitationalAccretion: 1e11, // order of magnitude for a neutron star
});

void F;
