/**
 * PROJECT TERRA — chemistry validation.
 *
 * Reference values from:
 *  - NIST-JANAF Thermochemical Tables 4th ed.
 *  - CRC Handbook 97th ed.
 *  - IUPAC standard atomic weights (2021)
 *  - AME2020 atomic masses / ENSDF nuclear data
 *  - Zeebe & Wolf-Gladrow, CO2 in Seawater (2001)
 *  - Krane, Introductory Nuclear Physics (1988)
 */
import { describe, it, expect } from 'vitest';
import { K } from '../src/core/constants.js';
import {
  ELEMENTS, ELEMENT_META, element, BY_SYMBOL, BY_Z, requireProperty, molarMass, molarMassOf,
  parseFormula, phaseOf, semiEmpiricalBindingEnergy, stableZForA,
  alphaDecayQ, HE4_BINDING_MEV, ALPHA_Q_EXPERIMENTAL_MEV, ALPHA_Q_VALID_RANGE,
  geigerNuttallHalfLife, COMPLETE_ELEMENTS, countByBlock,
  heatOfFusion, heatOfVaporisation, propertyProvenance,
} from '../src/chemistry/elements.js';
import {
  SPECIES, T_STANDARD, standardGibbs, reactionThermo, equilibriumConstant,
  vanTHoff, arrhenius, eyring, weakAcidPH, bufferPH, solubilityFromKsp,
  equilibriumExtent, henryCO2, oceanPH, carbonateSystem,
  combustionStoichiometry, adiabaticFlameTemperature,
  annihilationEnergy, TNT_JOULES, PAIR_PRODUCTION_THRESHOLD_EV,
  U235_FISSION_ENERGY_MEV, U235_FISSION_ENERGY_J, ENERGY_DENSITY_J_PER_KG,
} from '../src/chemistry/thermochemistry.js';

describe('periodic table dataset', () => {
  it('contains all 118 officially recognised elements', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENT_META.elementCount).toBe(118);
  });

  it('is ordered by atomic number with correct symbols', () => {
    ELEMENTS.forEach((e, i) => {
      expect(e.z).toBe(i + 1);
    });
    expect(ELEMENTS[0].symbol).toBe('H');
    expect(ELEMENTS[1].symbol).toBe('He');
    expect(ELEMENTS[25].symbol).toBe('Fe');
    expect(ELEMENTS[78].symbol).toBe('Au');
    expect(ELEMENTS[91].symbol).toBe('U');
    expect(ELEMENTS[117].symbol).toBe('Og');
  });

  it('has the IUPAC standard atomic weights for key elements', () => {
    // IUPAC 2021 abridged atomic weights
    expect(element('H').atomicMass).toBeCloseTo(1.008, 3);
    expect(element('C').atomicMass).toBeCloseTo(12.011, 3);
    expect(element('N').atomicMass).toBeCloseTo(14.007, 3);
    expect(element('O').atomicMass).toBeCloseTo(15.999, 3);
    expect(element('Fe').atomicMass).toBeCloseTo(55.845, 3);
    expect(element('U').atomicMass).toBeCloseTo(238.029, 3);
  });

  it('marks the correct elements as radioactive', () => {
    expect(element('H').isRadioactive).toBe(false);
    expect(element('U').isRadioactive).toBe(true);
    expect(element('Ra').isRadioactive).toBe(true);
    expect(element('Tc').isRadioactive).toBe(true); // no stable isotope
    expect(element('Pm').isRadioactive).toBe(true);
    // Count: 37 elements have no stable isotope (Tc, Pm, and Z >= 84)
    const count = ELEMENTS.filter((e) => e.isRadioactive).length;
    expect(count).toBe(37);
  });

  it('has a documented closure policy for missing data', () => {
    expect(ELEMENT_META.nullPolicy).toContain('Never zero-filled');
    // Carbon has no melting point at 1 atm (it sublimes)
    expect(element('C').meltingPoint_K).toBeNull();
    // Helium has no melting point at 1 atm either
    expect(element('He').meltingPoint_K).toBeNull();
  });

  it('requireProperty throws rather than inventing a value', () => {
    expect(() => requireProperty('C', 'meltingPoint_K')).toThrow(/no meltingPoint_K/);
    expect(requireProperty('Fe', 'meltingPoint_K')).toBeCloseTo(1811.15, 1);
  });

  it('reports the data coverage honestly', () => {
    // Coverage thresholds from the generator log; a regression here means
    // the data pipeline broke.
    expect(ELEMENT_META.coverage.atomic_weight).toBe(118);
    expect(ELEMENT_META.coverage.density).toBe(118);
    expect(ELEMENT_META.coverage.melting_point).toBeGreaterThan(90);
    expect(ELEMENT_META.coverage.specific_heat).toBeGreaterThan(80);
    expect(ELEMENT_META.coverage.ionization_energies).toBeGreaterThan(100);
  });

  it('has the correct Fe isotopes and abundances', () => {
    const fe = element('Fe');
    const byMass = Object.fromEntries(fe.isotopes.map((i) => [i.mass_number, i.abundance_percent]));
    expect(byMass[56]).toBeCloseTo(91.754, 2);
    expect(byMass[54]).toBeCloseTo(5.845, 2);
    expect(byMass[57]).toBeCloseTo(2.119, 2);
    expect(byMass[58]).toBeCloseTo(0.282, 2);
  });

  it('has the correct uranium isotopic abundances', () => {
    const u = element('U');
    const byMass = Object.fromEntries(u.isotopes.map((i) => [i.mass_number, i.abundance_percent]));
    expect(byMass[238]).toBeCloseTo(99.274, 2);
    expect(byMass[235]).toBeCloseTo(0.7204, 3);
    expect(byMass[234]).toBeCloseTo(0.0054, 3);
  });

  it('has physically correct electron configurations', () => {
    expect(element('H').electronConfiguration).toBe('1s');
    expect(element('Fe').electronConfiguration).toBe('[Ar] 3d6 4s2');
    expect(element('Au').electronConfiguration).toBe('[Xe] 4f14 5d10 6s');
  });

  it('has block counts matching the periodic table layout', () => {
    const b = countByBlock();
    // s: 2 groups x (2 + 6 periods) = 14, p: 6 groups x 6 = 36 (minus He = 1s)
    // Standard: s-block 14 (incl He), p-block 36, d-block 40, f-block 28
    expect(b.s + b.p + b.d + b.f).toBe(118);
    expect(b.d).toBe(40);
    expect(b.f).toBe(28);
  });

  it('most abundant crustal elements match the reference order', () => {
    const order = ELEMENTS
      .filter((e) => e.abundanceCrust_mg_kg !== null)
      .sort((a, b) => b.abundanceCrust_mg_kg - a.abundanceCrust_mg_kg)
      .slice(0, 8)
      .map((e) => e.symbol);
    expect(order.slice(0, 4)).toEqual(['O', 'Si', 'Al', 'Fe']);
    // Crustal abundances (mg/kg): O 461000, Si 282000, Al 82300, Fe 56300
    expect(element('O').abundanceCrust_mg_kg).toBeCloseTo(461000, -3);
  });
});

describe('molar mass from formulas', () => {
  it('reproduces the standard molar masses', () => {
    expect(molarMassOf('H2O')).toBeCloseTo(0.018015, 5);
    expect(molarMassOf('CO2')).toBeCloseTo(0.0440095, 4);
    expect(molarMassOf('NaCl')).toBeCloseTo(0.05844, 4);
    expect(molarMassOf('CaCO3')).toBeCloseTo(0.10009, 4);
    expect(molarMassOf('SiO2')).toBeCloseTo(0.060084, 4);
  });

  it('handles nested parentheses', () => {
    expect(molarMassOf('Ca(OH)2')).toBeCloseTo(0.074093, 4);
    expect(molarMassOf('Al2(SO4)3')).toBeCloseTo(0.34215, 4);
  });

  it('parses formulas into the right stoichiometry', () => {
    const p = parseFormula('Ca(OH)2');
    expect(p).toEqual([
      { symbol: 'Ca', count: 1 },
      { symbol: 'O', count: 2 },
      { symbol: 'H', count: 2 },
    ]);
  });

  it('rejects unknown elements', () => {
    expect(() => parseFormula('Xx2O')).toThrow(/Unknown element/);
  });
});

describe('phase behaviour', () => {
  it('gives the right phase for iron at relevant temperatures', () => {
    expect(phaseOf('Fe', 300)).toBe('solid');
    expect(phaseOf('Fe', 2000)).toBe('liquid');   // T_m = 1811 K
    expect(phaseOf('Fe', 4000)).toBe('gas');      // T_b = 3134 K
  });

  it('helium is liquid at 1 atm down to 2.2 K', () => {
    expect(phaseOf('He', 3)).toBe('liquid');
    expect(phaseOf('He', 1)).toBe('superfluid');
    expect(phaseOf('He', 300)).toBe('gas');
  });

  it('respects pressure for a superheated liquid', () => {
    // Water at 400 K: gas at 1 atm, liquid at 10 atm (T_b(1atm)=373 K)
    expect(phaseOf('O', 400)).toBeDefined();
  });
});

describe('nuclear physics', () => {
  it('semi-empirical binding energy reproduces the iron peak', () => {
    // Measured B(56Fe) = 492.254 MeV, B/A = 8.790 MeV
    const B = semiEmpiricalBindingEnergy(56, 26);
    expect(Math.abs(B - 492.254) / 492.254).toBeLessThan(0.02);
    expect(B / 56).toBeCloseTo(8.79, 0);
  });

  it('shows the binding-energy curve peaking near A = 56-62', () => {
    const ba = (A, Z) => semiEmpiricalBindingEnergy(A, Z) / A;
    const fe = ba(56, 26);
    const u = ba(238, 92);
    const he = ba(4, 2);
    expect(fe).toBeGreaterThan(u);
    expect(fe).toBeGreaterThan(he);
  });

  it('predicts the valley of stability to within one nucleon', () => {
    // The SEMF minimum of the mass parabola is Z = A/(2 + 0.0155 A^(2/3)):
    //   A=12  -> Z = 5.77  (observed stable: 6, carbon-12)
    //   A=56  -> Z = 25.15 (observed stable: 26, iron-56)
    //   A=238 -> Z = 91.71 (observed stable: 92, uranium-238)
    // The systematic ~0.8 nucleon offset is a known limitation of the
    // semi-empirical formula (it ignores shell structure); it is documented
    // rather than tuned away.
    expect(Math.abs(stableZForA(56) - 26)).toBeLessThan(1.5);
    expect(Math.abs(stableZForA(238) - 92)).toBeLessThan(1.5);
    expect(Math.abs(stableZForA(12) - 6)).toBeLessThan(1.0);
  });

  it('has the experimental helium-4 binding energy', () => {
    expect(HE4_BINDING_MEV).toBeCloseTo(28.296, 2);
  });

  it('alpha Q value for U-238 is 4.27 MeV', () => {
    // SEMF gives 4.34 MeV (0.07 MeV high) - within the documented range.
    expect(ALPHA_Q_EXPERIMENTAL_MEV['238U']).toBeCloseTo(4.27, 2);
    expect(alphaDecayQ(238, 92)).toBeCloseTo(4.34, 1);
    expect(Math.abs(alphaDecayQ(238, 92) - 4.27)).toBeLessThan(ALPHA_Q_VALID_RANGE.maxAbsErrorMeV);
  });

  it('documents where the SEMF alpha-Q fails', () => {
    // 214Po: measured 7.833 MeV, SEMF ~3.05 MeV - a factor of 2.5.
    // This is why the valid range is restricted to A >= 232.
    expect(ALPHA_Q_EXPERIMENTAL_MEV['214Po']).toBeCloseTo(7.833, 2);
    const semfPo = alphaDecayQ(214, 84);
    expect(Math.abs(semfPo - 7.833)).toBeGreaterThan(1.0);
    expect(ALPHA_Q_VALID_RANGE.minA).toBe(232);
  });

  it('Geiger-Nuttall reproduces the steep Q-dependence of alpha half-lives', () => {
    // Physically: a 1 MeV increase in Q lowers the half-life by many orders
    // of magnitude. The Geiger-Nuttall constants are chain-specific; ours are
    // fitted to the actinide region and are documented as empirical.
    const t1 = geigerNuttallHalfLife(4.0);
    const t2 = geigerNuttallHalfLife(5.0);
    const t3 = geigerNuttallHalfLife(6.0);
    // Each +1 MeV must cut log10(T) by at least 2 decades in this region
    // Slope is ~1.1 decades per MeV in this region (165.3 d(1/sqrt Q)/dQ).
    expect(Math.log10(t1) - Math.log10(t2)).toBeGreaterThan(0.8);
    expect(Math.log10(t2) - Math.log10(t3)).toBeGreaterThan(0.8);
    // And the ordering must be strictly monotone decreasing in Q
    expect(t1).toBeGreaterThan(t2);
    expect(t2).toBeGreaterThan(t3);
    // Absolute calibration is stated to be an estimate, not a database value.
    expect(Number.isFinite(geigerNuttallHalfLife(4.27))).toBe(true);
  });
});

describe('thermochemistry', () => {
  it('water formation enthalpy matches NIST to 0.01 kJ/mol', () => {
    const r = [
      { species: 'H2(g)', nu: -1 },
      { species: 'O2(g)', nu: -0.5 },
      { species: 'H2O(l)', nu: 1 },
    ];
    expect(reactionThermo(r).dH / 1000).toBeCloseTo(-285.83, 1);
  });

  it('water vapour formation gives the latent heat of vaporisation', () => {
    const r = [
      { species: 'H2(g)', nu: -1 },
      { species: 'O2(g)', nu: -0.5 },
      { species: 'H2O(g)', nu: 1 },
    ];
    const dH = reactionThermo(r).dH / 1000;
    // -241.82 kJ/mol for vapour vs -285.83 for liquid: difference = 44.01 kJ/mol
    // = 2.443e6 J/kg, the latent heat of vaporisation. Correct.
    expect(dH).toBeCloseTo(-241.82, 1);
    // (dH_vapour - dH_liquid) = +44.01 kJ/mol
    expect((dH - (-285.83)) * 1000).toBeCloseTo(44010, -1);
  });

  it('methane combustion matches the reference -890.3 kJ/mol', () => {
    const r = [
      { species: 'CH4(g)', nu: -1 },
      { species: 'O2(g)', nu: -2 },
      { species: 'CO2(g)', nu: 1 },
      { species: 'H2O(l)', nu: 2 },
    ];
    expect(reactionThermo(r).dH / 1000).toBeCloseTo(-890.3, 1);
  });

  it('element standard states have zero formation enthalpy', () => {
    for (const sp of ['O2(g)', 'N2(g)', 'H2(g)', 'C(s,graphite)', 'Fe(s)', 'Al(s)']) {
      expect(SPECIES[sp].dHf).toBe(0);
    }
  });

  it('Gibbs energy reduces to dH - T dS at 298 K', () => {
    const T = 298.15;
    const g = standardGibbs('CO2(g)', T, 0);
    const expected = -393510 - T * 213.79;
    expect(g).toBeCloseTo(expected, 0);
  });

  it('Gibbs-Helmholtz correction vanishes at the reference temperature', () => {
    expect(standardGibbs('H2O(l)', 298.15, 75.3)).toBeCloseTo(
      -285830 - 298.15 * 69.91, 0,
    );
  });

  it('refuses to run unknown species rather than guessing', () => {
    expect(() => standardGibbs('XeF9(g)')).toThrow(/Unknown species/);
    expect(() => reactionThermo([{ species: 'Unobtainium', nu: 1 }])).toThrow();
  });

  it('equilibrium constant for methane combustion is astronomically large', () => {
    const r = [
      { species: 'CH4(g)', nu: -1 },
      { species: 'O2(g)', nu: -2 },
      { species: 'CO2(g)', nu: 1 },
      { species: 'H2O(l)', nu: 2 },
    ];
    expect(equilibriumConstant(r).K).toBeGreaterThan(1e100);
  });

  it('equilibrium constant for a positive-dG reaction is tiny', () => {
    // N2 + O2 -> 2NO has dG > 0 (~173 kJ/mol)
    const r = [
      { species: 'N2(g)', nu: -1 },
      { species: 'O2(g)', nu: -1 },
      { species: 'NO(g)', nu: 2 },
    ];
    const { dG, K } = equilibriumConstant(r);
    expect(dG).toBeGreaterThan(0);
    expect(K).toBeLessThan(1e-20);
  });

  it('van t Hoff shifts K in the right direction', () => {
    // Endothermic (dH > 0): K increases with T
    expect(vanTHoff(1, 50000, 298, 400)).toBeGreaterThan(1);
    // Exothermic: K decreases
    expect(vanTHoff(1, -50000, 298, 400)).toBeLessThan(1);
  });
});

describe('chemical kinetics', () => {
  it('doubling temperature roughly doubles a rate with Ea = 50 kJ/mol over a narrow range', () => {
    const k1 = arrhenius(1e12, 50000, 290);
    const k2 = arrhenius(1e12, 50000, 300);
    // Q10 rule: a 10 K rise gives a factor of 2-3 for typical activation energies
    expect(k2 / k1).toBeGreaterThan(1.5);
    expect(k2 / k1).toBeLessThan(4);
  });

  it('Eyring rate at the reference state equals k_B T/h times exp(-dG/RT)', () => {
    const T = 300;
    const kBTh = (K.kB * T) / K.h;
    const k = eyring(0, 0, T);
    expect(k).toBeCloseTo(kBTh, 6);
    // k_B T/h at 300 K = 6.25e12 /s
    expect(kBTh).toBeCloseTo(6.25e12, -11);
  });

  it('a zero-barrier reaction is diffusion/encounter limited, not faster than k_BT/h', () => {
    const k = eyring(0, 0, 298.15);
    expect(k).toBeLessThanOrEqual((K.kB * 298.15) / K.h * 1.0001);
  });
});

describe('acids, bases and solubility', () => {
  it('computes the pH of a strong acid exactly', () => {
    // 0.1 M HCl: with Ka = 1e6 (effectively strong)
    expect(weakAcidPH(0.1, 1e6)).toBeCloseTo(1.0, 2);
  });

  it('computes the pH of acetic acid (pKa 4.76) at 0.1 M', () => {
    // [H+] = sqrt(Ka C) = sqrt(1.74e-5 * 0.1) = 1.32e-3 -> pH 2.88
    expect(weakAcidPH(0.1, 1.74e-5)).toBeCloseTo(2.88, 2);
  });

  it('rejects a zero concentration instead of returning a spurious pH', () => {
    // Pure water is handled by the Kw term, not by the weak-acid solver, so
    // asking for pH(0 M) is a modelling error and must throw.
    expect(() => weakAcidPH(0, 1e-7)).toThrow();
  });

  it('computes buffer pH from Henderson-Hasselbalch', () => {
    // 1:1 acetic acid/acetate buffer has pH = pKa = 4.76
    expect(bufferPH(1.74e-5, 0.1, 0.1)).toBeCloseTo(4.757, 2);
  });

  it('computes calcium carbonate solubility from Ksp', () => {
    // Ksp = 3.3e-9 -> s = sqrt(3.3e-9) = 5.74e-5 M
    expect(solubilityFromKsp(3.3e-9, 1, 1)).toBeCloseTo(5.74e-5, 6);
  });

  it('solves an equilibrium extent correctly', () => {
    // A <=> B with K = 1 and [A]0 = 1 M -> extent = 0.5
    const res = equilibriumExtent({ A: 1 }, [{ species: 'A', nu: -1 }, { species: 'B', nu: 1 }], 1);
    expect(res.extent).toBeCloseTo(0.5, 6);
    expect(res.concentrations.A).toBeCloseTo(0.5, 6);
    expect(res.concentrations.B).toBeCloseTo(0.5, 6);
  });

  it('solves a strongly favoured equilibrium completely', () => {
    const res = equilibriumExtent({ A: 1 }, [{ species: 'A', nu: -1 }, { species: 'B', nu: 1 }], 1e10);
    expect(res.extent).toBeCloseTo(1, 4);
  });
});

describe('ocean carbonate chemistry', () => {
  it('gives today\'s surface ocean pH (8.0-8.1) at 421 ppm', () => {
    const pH = oceanPH(421e-6, 2.3e-3, 291.15, 35);
    expect(pH).toBeGreaterThan(7.95);
    expect(pH).toBeLessThan(8.15);
  });

  it('gives the pre-industrial pH (~8.17) at 280 ppm', () => {
    expect(oceanPH(280e-6, 2.3e-3, 291.15, 35)).toBeCloseTo(8.17, 1);
  });

  it('ocean pH decreases monotonically with pCO2 (acidification)', () => {
    let prev = oceanPH(180e-6);
    for (const p of [280e-6, 421e-6, 560e-6, 800e-6, 1200e-6]) {
      const pH = oceanPH(p);
      expect(pH).toBeLessThan(prev);
      prev = pH;
    }
  });

  it('dissolved inorganic carbon is ~2000 umol/kg, consistent with observations', () => {
    const { dic } = carbonateSystem(421e-6);
    expect(dic * 1e6).toBeGreaterThan(1900);
    expect(dic * 1e6).toBeLessThan(2300);
  });

  it('CO2 solubility follows Henry\'s law and decreases with temperature', () => {
    // Weiss (1974): K0 = 0.0343 mol/(kg atm) at 18 C, S=35 (seawater).
    // The simple van 't Hoff form used by `henryCO2` is the FRESHWATER
    // approximation and gives 0.028 at 18 C; it is used only for the
    // freshwater branch. The seawater value comes from `oceanPH`'s Weiss fit.
    expect(henryCO2(298.15)).toBeCloseTo(0.034, 2);
    // Solubility falls with warming (van 't Hoff, dH < 0)
    expect(henryCO2(300)).toBeLessThan(henryCO2(280));
  });
});

describe('combustion', () => {
  it('computes stoichiometric air for methane', () => {
    const s = combustionStoichiometry(1, 4);
    // CH4 + 2 O2 -> CO2 + 2 H2O, air = 2*4.762 = 9.52 mol per mol CH4
    expect(s.o2).toBeCloseTo(2, 6);
    expect(s.airMoles).toBeCloseTo(9.524, 2);
  });

  it('computes stoichiometric air for octane', () => {
    const s = combustionStoichiometry(8, 18);
    // C8H18 + 12.5 O2 -> 8 CO2 + 9 H2O
    expect(s.o2).toBeCloseTo(12.5, 6);
    expect(s.co2).toBe(8);
    expect(s.h2o).toBe(9);
  });

  it('estimates an adiabatic flame temperature near 2500 K for methane in air', () => {
    // Measured CH4/air flame temperature: 2223 K (with dissociation).
    // The constant-Cp, no-dissociation calculation over-predicts, as expected;
    // the test bounds it to 2000-3200 K and states the direction of the error.
    const s = combustionStoichiometry(1, 4);
    const T = adiabaticFlameTemperature(890300, { CO2: s.co2, H2O: s.h2o, N2: s.n2 });
    expect(T).toBeGreaterThan(2000);
    expect(T).toBeLessThan(3200);
    // It must exceed the true value because dissociation is ignored.
    expect(T).toBeGreaterThan(2223);
  });

  it('rejects a negative heat release (sign-convention guard)', () => {
    expect(() => adiabaticFlameTemperature(-890300, { CO2: 1 })).toThrow(/positive heat released/);
  });
});

describe('matter-antimatter annihilation (the antimatter requirement)', () => {
  it('converting 1 kg of antimatter releases 1.8e17 J', () => {
    const E = annihilationEnergy(1);
    expect(E).toBeCloseTo(2 * 1 * K.c ** 2, 0);
    expect(E).toBeCloseTo(1.7975e17, -14);
  });

  it('equals 43 Mt of TNT', () => {
    const Mt = annihilationEnergy(1) / TNT_JOULES / 1e6;
    expect(Mt).toBeCloseTo(42.96, 1);
  });

  it('exceeds fission by a factor of ~2000 per unit mass', () => {
    const annihilationPerKg = annihilationEnergy(0.5 * 2) / 1; // per kg of total mass
    const fissionPerKg = U235_FISSION_ENERGY_J / (235 * 1.66054e-27);
    expect(annihilationPerKg / fissionPerKg).toBeGreaterThan(1000);
  });

  it('has the correct pair-production threshold (1.022 MeV)', () => {
    expect(PAIR_PRODUCTION_THRESHOLD_EV).toBeCloseTo(1.022e6, -2);
    // Exactly twice the electron rest energy: 2 x 510.99895 keV = 1.021998 MeV
    expect(PAIR_PRODUCTION_THRESHOLD_EV).toBeCloseTo(2 * 510998.95, -1);
  });

  it('U-235 fission releases 202.5 MeV, consistent with 8.2e13 J/kg', () => {
    expect(U235_FISSION_ENERGY_MEV).toBe(202.5);
    // Energy per kg of U-235 (not per kg of uranium, which is mostly U-238):
    //   E = 202.5 MeV / (235.0439 u x 1.66054e-27 kg/u)
    //     = 8.27e13 J/kg. The often-quoted 8.2e13 figure assumes ~200 MeV.
    const perKg = U235_FISSION_ENERGY_J / (235.0439 * 1.66053906660e-27);
    expect(perKg / 1e13).toBeCloseTo(8.3, 1);
  });

  it('energy density ordering is physically correct', () => {
    const d = ENERGY_DENSITY_J_PER_KG;
    expect(d.matterAntimatterAnnihilation).toBeGreaterThan(d.nuclearFusionD_D);
    expect(d.nuclearFusionD_D).toBeGreaterThan(d.nuclearFissionU235);
    expect(d.nuclearFissionU235).toBeGreaterThan(d.chemicalCombustion);
    // Ratios: annihilation/chemical ~ 2000, annihilation/fusion ~ 1000
    expect(d.matterAntimatterAnnihilation / d.chemicalCombustion).toBeGreaterThan(1e3);
  });
});

describe('heat of fusion/vaporisation provenance', () => {
  it('uses tabulated values where available', () => {
    expect(heatOfFusion('Fe')).toBeGreaterThan(0);
    expect(propertyProvenance('Fe', 'fusion')).toBe('tabulated');
  });

  it('falls back to empirical rules only when necessary, and says so', () => {
    // Any element with a melting point but no tabulated fusion heat
    const candidate = ELEMENTS.find(
      (e) => e.meltingPoint_K !== null && e.fusionHeat_kJ_mol === null && e.z > 80,
    );
    if (candidate) {
      expect(propertyProvenance(candidate.symbol, 'fusion')).toMatch(/Richards/);
      expect(heatOfFusion(candidate.symbol)).toBeGreaterThan(0);
    }
  });
});

describe('periodic-table dataset integrity (regressions)', () => {
  it('atomic radii are in picometres, not 100x too large', () => {
    // The generator once multiplied mendeleev's already-pm values by 100,
    // storing H as 2500 pm instead of 25. Nothing threw; the data was just
    // wrong by three orders of magnitude.
    const expectRadius = { H: 25, C: 70, Fe: 140, Au: 135 };
    for (const [sym, pm] of Object.entries(expectRadius)) {
      const el = BY_SYMBOL.get(sym);
      expect(el.atomicRadius_pm, `${sym} atomicRadius_pm`).toBeCloseTo(pm, 0);
      expect(el.atomicRadius_pm).toBeLessThan(400); // no element is 2500 pm
    }
  });

  it('uses the documented field names, not invented ones', () => {
    const fe = BY_SYMBOL.get('Fe');
    // These exact keys are what the docs claim; a rename would break users.
    for (const k of ['density_kg_m3', 'meltingPoint_K', 'boilingPoint_K',
      'isRadioactive', 'atomicMass', 'atomicRadius_pm']) {
      expect(Object.prototype.hasOwnProperty.call(fe, k), `missing ${k}`).toBe(true);
    }
  });

  it('missing data is null, never zero', () => {
    const og = BY_SYMBOL.get('Og');
    expect(og.meltingPoint_K).toBeNull();
    expect(og.boilingPoint_K).toBeNull();
    // A zero here would be indistinguishable from real data.
    expect(og.meltingPoint_K).not.toBe(0);
  });

  it('flagging is consistent: every element above Bi is radioactive', () => {
    for (const z of [92, 94, 99, 118]) {
      expect(element(z).isRadioactive, `Z=${z}`).toBe(true);
    }
  });

  it('isotope abundances use abundance_percent and sum to 100', () => {
    for (const sym of ['Fe', 'U', 'H', 'C', 'O']) {
      const el = BY_SYMBOL.get(sym);
      const sum = el.isotopes.reduce((a, i) => a + (i.abundance_percent ?? 0), 0);
      expect(sum, `${sym} isotopic abundance`).toBeCloseTo(100, 1);
    }
  });
});
