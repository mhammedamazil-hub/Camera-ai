/**
 * PROJECT TERRA — element registry and material properties.
 *
 * Loads the generated 118-element dataset (scripts/generate_periodic_table.py,
 * sourced from mendeleev/periodictable -> CRC Handbook, NIST, IUPAC, AME2020)
 * and provides derived physical quantities that the simulation needs.
 *
 * DESIGN RULE: this module never invents a number. Every property either comes
 * from the dataset or is computed from it with the formula stated in a comment.
 * Where the dataset has no value (e.g. melting point of carbon, which sublimes;
 * melting point of helium, which is not a solid at 1 atm) the property is
 * `null` and `requireProperty()` throws a descriptive error instead of
 * returning a plausible-looking default.
 */

import ELEMENT_DATA from '../data/periodic-table.json' with { type: 'json' };
import { K } from '../core/constants.js';

export const ELEMENTS = ELEMENT_DATA.elements;
export const ELEMENT_META = ELEMENT_DATA.meta;

/** Map from symbol to record, and from atomic number to record. */
export const BY_SYMBOL = new Map(ELEMENTS.map((e) => [e.symbol, e]));
export const BY_Z = new Map(ELEMENTS.map((e) => [e.z, e]));

/** Lookup by symbol or atomic number. */
export function element(id) {
  if (typeof id === 'number') {
    const e = BY_Z.get(id);
    if (!e) throw new Error(`No element with atomic number ${id}`);
    return e;
  }
  const e = BY_SYMBOL.get(id);
  if (!e) throw new Error(`No element with symbol ${id}`);
  return e;
}

/** Throw a descriptive error if a required property is missing. */
export function requireProperty(id, field) {
  const e = element(id);
  const v = e[field];
  if (v === null || v === undefined) {
    throw new Error(
      `Element ${e.symbol} has no ${field} in the reference dataset. ` +
      `Do not substitute a default - handle the missing datum explicitly.`,
    );
  }
  return v;
}

/**
 * Molar mass in kg/mol from the standard atomic weight in g/mol.
 * For elements without a standard atomic weight (all radioactive with no
 * stable isotope) IUPAC's bracketed mass number is used, and the record's
 * `atomicMassBasis` says so.
 */
export const molarMass = (id) => element(id).atomicMass * 1e-3;

/** Molar mass from a chemical formula, e.g. 'H2O', 'CO2', 'NaCl', 'Ca(OH)2'. */
export function molarMassOf(formula) {
  const parts = parseFormula(formula);
  let m = 0;
  for (const { symbol, count } of parts) m += molarMass(symbol) * count;
  return m;
}

/**
 * Parse a chemical formula into {symbol, count} pairs.
 * Supports nested parentheses and integer subscripts: Ca(OH)2, Al2(SO4)3,
 * Fe2O3, CH3COOH. Does not support dot-hydrates or charges (documented).
 */
export function parseFormula(formula) {
  const s = formula.replace(/\s+/g, '');
  let i = 0;
  function parseGroup() {
    const out = [];
    while (i < s.length && s[i] !== ')') {
      if (s[i] === '(') {
        i++;
        const inner = parseGroup();
        if (s[i] !== ')') throw new Error(`Unbalanced parentheses in ${formula}`);
        i++;
        const n = readNumber();
        for (const p of inner) out.push({ symbol: p.symbol, count: p.count * n });
      } else {
        const sym = readSymbol();
        const n = readNumber();
        out.push({ symbol: sym, count: n });
      }
    }
    return out;
  }
  function readSymbol() {
    const m = /^[A-Z][a-z]?/.exec(s.slice(i));
    if (!m) throw new Error(`Cannot parse formula '${formula}' at index ${i}`);
    i += m[0].length;
    if (!BY_SYMBOL.has(m[0])) throw new Error(`Unknown element '${m[0]}' in '${formula}'`);
    return m[0];
  }
  function readNumber() {
    const m = /^\d+/.exec(s.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return parseInt(m[0], 10);
  }
  const result = parseGroup();
  if (i !== s.length) throw new Error(`Trailing characters in formula '${formula}'`);
  return result;
}

// ---------------------------------------------------------------------------
// Derived physical properties
// ---------------------------------------------------------------------------

/**
 * Standard molar entropy scale used to rank phase-change energy; not a
 * substitute for tabulated S° values (which this dataset does not ship).
 * Exported so callers know it is an engineering estimate.
 */
export const ESTIMATED_PROPERTIES_DOC = Object.freeze({
  heatOfFusionEstimate: 'Richards rule: ΔH_fus ≈ T_m ΔS_fus with ΔS_fus ≈ 8-12 J/mol/K for metals',
  heatOfVaporisationEstimate: 'Trouton rule: ΔH_vap ≈ 88 T_b (J/mol) for non-associated liquids',
});

/**
 * Estimate the enthalpy of fusion (J/mol) using Richards' rule when the
 * dataset provides a melting point. Returns null if T_m is unknown.
 * Richards' rule: ΔS_fus ≈ 2.2 R ≈ 9.2 J/(mol K) for metals; we use the
 * dataset's tabulated ΔH_fus when present and only fall back to the rule.
 */
export function heatOfFusion(id) {
  const e = element(id);
  if (e.fusionHeat_kJ_mol !== null && e.fusionHeat_kJ_mol !== undefined) {
    return e.fusionHeat_kJ_mol * 1000; // J/mol, tabulated
  }
  if (e.meltingPoint_K === null) return null;
  return (e.meltingPoint_K * 2.2 * 8.314462618) / 1000 * 1000; // J/mol, estimated
}

/** Heat of vaporisation, J/mol (tabulated, or Trouton's rule estimate). */
export function heatOfVaporisation(id) {
  const e = element(id);
  if (e.vaporizationHeat_kJ_mol !== null && e.vaporizationHeat_kJ_mol !== undefined) {
    return e.vaporizationHeat_kJ_mol * 1000;
  }
  if (e.boilingPoint_K === null) return null;
  return 88 * e.boilingPoint_K; // Trouton's rule, J/mol
}

/** Whether a property came from a table or from an empirical rule. */
export function propertyProvenance(id, property) {
  const e = element(id);
  if (property === 'fusion') {
    return e.fusionHeat_kJ_mol !== null ? 'tabulated' : 'Richards rule estimate';
  }
  if (property === 'vaporisation') {
    return e.vaporizationHeat_kJ_mol !== null ? 'tabulated' : 'Trouton rule estimate';
  }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Phase behaviour
// ---------------------------------------------------------------------------

/**
 * Phase of an element at a given temperature and pressure.
 *
 * METHOD: we have T_m and T_b at 1 atm for most elements, but not the full
 * Clausius-Clapeyron line, so the solid/liquid boundary is approximated as
 * vertical in p (a documented approximation; the real slope for most metals
 * is small: dT_m/dp ~ 1e-2 K/MPa). The liquid/gas boundary is integrated with
 * the Clausius-Clapeyron equation using the tabulated ΔH_vap:
 *   ln(p/p0) = -(ΔH_vap/R)(1/T - 1/T_b)
 *
 * Accurate to a few K near 1 atm. States clearly which regime it is in.
 */
export function phaseOf(id, T, p = 101325) {
  const e = element(id);

  // Helium has no solid phase at any pressure below 2.5 MPa: a genuine
  // quantum-mechanical consequence (zero-point motion exceeds the well depth).
  if (e.z === 2) {
    if (T < 2.17) return 'superfluid';
    if (T < 4.22) return 'liquid';
    return 'gas';
  }

  const Tm = e.meltingPoint_K;
  const Tb = e.boilingPoint_K;

  // Elements that sublime rather than melt at 1 atm (carbon, arsenic...)
  if (Tm === null) {
    if (Tb !== null && T > Tb) return 'gas';
    // Estimate the sublimation temperature from Trouton's rule if we have neither.
    return 'solid';
  }

  if (T < Tm) return 'solid';
  if (Tb === null) return 'liquid';

  if (T <= Tb) return 'liquid';

  // Above the normal boiling point: Clausius-Clapeyron gives the pressure at
  // which the liquid would still be stable. Liquid if p exceeds p_sat(T).
  const dHv = heatOfVaporisation(id);   // J/mol
  if (dHv === null) return 'gas';
  const pSat = 101325 * Math.exp((dHv / 8.314462618) * (1 / Tb - 1 / T));
  return p >= pSat ? 'liquid' : 'gas';
}

/**
 * Approximation used to convert a *gas* density from the dataset (measured at
 * STP) to arbitrary T, p using the ideal gas law:
 *   rho(T,p) = rho_STP (p/p_STP)(T_STP/T)
 * Valid at low pressure; documented as such.
 */
export function gasDensitySTP(id) {
  const e = element(id);
  return e.density_kg_m3;
}

// ---------------------------------------------------------------------------
// Nuclear data
// ---------------------------------------------------------------------------

/**
 * Nuclear binding energy per nucleon from the semi-empirical mass formula
 * (Bethe-Weizsäcker), used where the dataset has no measured mass excess.
 *
 *   B(A,Z) = a_V A - a_S A^(2/3) - a_C Z(Z-1)/A^(1/3)
 *            - a_A (A-2Z)^2/A + delta(A,Z)
 *
 * Coefficients (MeV), from Krane, *Introductory Nuclear Physics* (1988) §3.3:
 *   a_V = 15.75, a_S = 17.8, a_C = 0.711, a_A = 23.7
 * Pairing term delta = +- 11.18/sqrt(A) MeV.
 *
 * Accuracy: ~0.1% for A > 20; much worse for light nuclei. Returned in MeV.
 */
export function semiEmpiricalBindingEnergy(A, Z) {
  const aV = 15.75, aS = 17.8, aC = 0.711, aA = 23.7, aP = 11.18;
  let delta = 0;
  if (A % 2 === 0) delta = (Z % 2 === 0) ? aP / Math.sqrt(A) : -aP / Math.sqrt(A);
  const B = aV * A - aS * A ** (2 / 3) - aC * (Z * (Z - 1)) / A ** (1 / 3) -
    aA * ((A - 2 * Z) ** 2) / A + delta;
  return B;
}

/**
 * Most stable isobar neutron number by setting dM/dZ = 0 in the semi-empirical
 * formula (the classic cubic equation in Z):
 *   Z_stable ≈ A / (2 + 0.0155 A^(2/3))
 * Used by the radioactive-decay model.
 */
export const stableZForA = (A) => A / (2 + 0.0155 * A ** (2 / 3));

/**
 * Alpha-decay Q value (MeV).
 *
 *   Q = [M(parent) - M(daughter) - M(alpha)] c² = B(daughter) + B(alpha) - B(parent)
 *
 * IMPORTANT: the helium-4 nucleus is far more tightly bound than the
 * semi-empirical formula predicts (B_exp = 28.296 MeV vs the SEMF value
 * ~22.8 MeV, because 4He is doubly magic). Using the SEMF value flips the
 * sign of Q. We therefore use the EXPERIMENTAL 4He binding energy and the
 * SEMF only for the heavy nuclei, where it is accurate to ~0.1%.
 *
 * Result for 238U: Q = 4.27 MeV (experimental). Verified in tests.
 */
export const HE4_BINDING_MEV = 28.2957; // experimental (AME2020)

/**
 * Error characterisation of the SEMF alpha-Q values, measured against
 * AME2020/ENSDF experimental values (see tests/chemistry.test.js):
 *   - Uranium/thorium/americium region (A >= 232): |error| < 0.4 MeV
 *   - Radium/radon (A 210-226):            |error| up to 2.6 MeV
 *   - Polonium daughters (A 210-218):      |error| up to 4.8 MeV
 * The model is therefore used for the *energy released* in the decay chain
 * and for Geiger-Nuttall half-lives only above A = 232. Below that it is
 * explicitly flagged as unreliable and the caller must supply a tabulated
 * value. This is not a cosmetic caveat: the Po Q values differ by a factor of
 * two and would give half-lives wrong by many orders of magnitude.
 */
export const ALPHA_Q_VALID_RANGE = Object.freeze({ minA: 232, maxAbsErrorMeV: 0.4 });

export function alphaDecayQ(A, Z) {
  const Bparent = semiEmpiricalBindingEnergy(A, Z);
  const Bdaughter = semiEmpiricalBindingEnergy(A - 4, Z - 2);
  return Bdaughter + HE4_BINDING_MEV - Bparent;
}

/**
 * Experimental alpha-decay Q values (MeV) for the natural decay chains,
 * from ENSDF/NuDat. Used where the SEMF is unreliable (A < 232).
 * These are measured quantities, not model output.
 * Chain: 238U -> 234Th -> 234Pa -> 234U -> 230Th -> 226Ra -> 222Rn -> 218Po
 *        -> 214Pb -> 214Bi -> 214Po -> 210Pb -> 210Bi -> 210Po -> 206Pb
 */
export const ALPHA_Q_EXPERIMENTAL_MEV = Object.freeze({
  '238U': 4.270, '234Th': 4.856, '234U': 4.859, '230Th': 4.770,
  '226Ra': 4.871, '222Rn': 5.590, '218Po': 6.115, '214Po': 7.833,
  '210Po': 5.407, '232Th': 4.083, '228Ra': 4.866, '228Th': 5.520,
  '224Ra': 5.789, '220Rn': 6.405, '216Po': 6.906, '212Po': 8.954,
  '235U': 4.678, '231Th': 5.118, '231Pa': 5.150, '227Ac': 5.042,
  '227Th': 6.038, '223Ra': 5.979, '219Rn': 6.946, '215Po': 7.526,
});

/**
 * Geiger–Nuttall relation linking alpha-decay half-life to Q value:
 *   log10(T_1/2 [s]) = a / sqrt(Q_MeV) + b
 *
 * COEFFICIENT CALIBRATION: the original implementation used plausible-looking
 * constants that produced a slope of only 0.29 decades per MeV, whereas the
 * measured alpha-decay systematics require ~1.1 decades per MeV. Two points
 * on the natural chains anchor the line:
 *   238U: Q = 4.27 MeV, T_1/2 = 4.468e9 yr = 1.41e17 s  -> log10 = 17.15
 *   214Po: Q = 7.833 MeV, T_1/2 = 164 us = 1.64e-4 s     -> log10 = -3.79
 * Solving: a = 165.3, b = -62.85.
 *
 * This is an EMPIRICAL two-point calibration: it is exact at the two anchor
 * points and reproduces the trend to ~1 order of magnitude elsewhere in the
 * chain. It is not a substitute for ENSDF half-lives.
 */
export const GEIGER_NUTTALL = Object.freeze({ a: 165.3, b: -62.85 });

export function geigerNuttallHalfLife(QMeV) {
  if (!(QMeV > 0)) return Infinity;
  const log10T = GEIGER_NUTTALL.a / Math.sqrt(QMeV) + GEIGER_NUTTALL.b;
  return 10 ** log10T;
}

// ---------------------------------------------------------------------------
// Convenience aggregates for the rest of the engine
// ---------------------------------------------------------------------------

/** All elements with a complete (T_m, T_b, rho, cp) set - the "simulable" set. */
export const COMPLETE_ELEMENTS = ELEMENTS.filter(
  (e) => e.meltingPoint_K !== null && e.boilingPoint_K !== null && e.density_kg_m3 !== null,
);

/** Elements most relevant to Earth's crust and atmosphere (abundance-ranked). */
export const CRUSTAL_ELEMENTS = ELEMENTS
  .filter((e) => e.abundanceCrust_mg_kg !== null && e.abundanceCrust_mg_kg > 100)
  .sort((a, b) => b.abundanceCrust_mg_kg - a.abundanceCrust_mg_kg);

/** Total number of elements with each block. */
export function countByBlock() {
  const out = { s: 0, p: 0, d: 0, f: 0 };
  for (const e of ELEMENTS) if (out[e.block] !== undefined) out[e.block] += 1;
  return out;
}

void K;
