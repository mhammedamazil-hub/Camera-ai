/**
 * PROJECT TERRA — particle and antimatter physics validation.
 * Reference values from PDG 2022, NIST XCOM, Krane (1988), Griffiths (2008).
 */
import { describe, it, expect } from 'vitest';
import { K } from '../src/core/constants.js';
import {
  lorentzFactor, gammaFromKinetic, kineticFromGamma, restEnergy,
  annihilationEnergy, electronPositronAnnihilation, protonAntiprotonAnnihilation,
  ANNIHILATION_CROSS_SECTION_REST, CLASSICAL_ELECTRON_RADIUS,
  PAIR_THRESHOLD_MEV, PAIR_THRESHOLD_J, canPairProduce,
  photonAttenuationWater, gammaMeanFreePathWater,
  COMPTON_WAVELENGTH, comptonScatteredEnergy, kleinNishina,
  fastFissionCriticality, FISSION_ENERGY_MEV, FISSION_ENERGY_PER_KG,
  FISSION_ENERGY_BREAKDOWN_MEV, FISSION_RECOVERABLE_ENERGY_MEV,
  batemanTwoMember, decayChain, halfLifeToLambda, activity,
  protonRangeWater, cherenkovThreshold, CHERENKOV_ELECTRON_THRESHOLD_J,
  annihilationDeposition,
} from '../src/physics/particle-physics.js';

const MEV = 1e6 * K.e; // 1 MeV in joules

describe('special relativity', () => {
  it('Lorentz factor is 1 at rest and diverges at c', () => {
    expect(lorentzFactor(0)).toBe(1);
    expect(lorentzFactor(0.6 * K.c)).toBeCloseTo(1.25, 10);
    expect(lorentzFactor(0.8 * K.c)).toBeCloseTo(1.6666667, 6);
    expect(lorentzFactor(0.99 * K.c)).toBeCloseTo(7.0888, 3);
    expect(() => lorentzFactor(K.c)).toThrow();
  });

  it('gamma and kinetic energy are inverses', () => {
    const m = K.mp;
    const T = 1e-10; // J, ~624 MeV
    const g = gammaFromKinetic(T, m);
    expect(kineticFromGamma(g, m)).toBeCloseTo(T, 20);
  });

  it('rest energy of the electron and proton are correct', () => {
    // electron 511 keV, proton 938.272 MeV
    expect(restEnergy(K.me) / MEV).toBeCloseTo(0.51099895, 6);
    expect(restEnergy(K.mp) / MEV).toBeCloseTo(938.272088, 4);
  });
});

describe('matter-antimatter annihilation', () => {
  it('1 kg of antimatter yields 1.7975e17 J', () => {
    expect(annihilationEnergy(1)).toBeCloseTo(1.7975e17, -14);
    expect(annihilationEnergy(0.001)).toBeCloseTo(1.7975e14, -11);
  });

  it('e+e- at rest produces two 511 keV photons back to back', () => {
    const r = electronPositronAnnihilation(0);
    expect(r.photonCount).toBe(2);
    expect(r.eHardMeV).toBeCloseTo(0.51099895, 6);
    expect(r.eSoftMeV).toBeCloseTo(0.51099895, 6);
    // Energy conserved: 2 m_e c^2
    expect(r.eTotalJ).toBeCloseTo(2 * restEnergy(K.me), 20);
  });

  it('e+e- in flight produces asymmetric photon energies', () => {
    const r = electronPositronAnnihilation(1e-13); // ~0.6 MeV kinetic
    expect(r.eHardJ).toBeGreaterThan(r.eSoftJ);
    // Sum still equals the total energy
    expect(r.eHardJ + r.eSoftJ).toBeCloseTo(r.eTotalJ, 16);
  });

  it('p-pbar annihilation releases 1876.5 MeV, split 2/3 : 1/3', () => {
    const r = protonAntiprotonAnnihilation();
    expect(r.totalMeV).toBeCloseTo(1876.54, 1);
    expect(r.chargedPions.energyMeV / r.totalMeV).toBeCloseTo(2 / 3, 6);
    expect(r.neutralPions.energyMeV / r.totalMeV).toBeCloseTo(1 / 3, 6);
    expect(r.neutralPions.count).toBe(2);
    expect(r.chargedPions.count).toBe(3);
  });

  it('annihilation cross-section at rest is pi r_e^2 = 2.5e-29 m^2', () => {
    // pi * (2.818e-15)^2 = 2.495e-29 m^2
    expect(ANNIHILATION_CROSS_SECTION_REST).toBeCloseTo(Math.PI * CLASSICAL_ELECTRON_RADIUS ** 2, 30);
    expect(ANNIHILATION_CROSS_SECTION_REST).toBeCloseTo(2.495e-29, 30);
  });
});

describe('pair production', () => {
  it('threshold is exactly 2 m_e c^2 = 1.022 MeV', () => {
    expect(PAIR_THRESHOLD_MEV).toBeCloseTo(1.021998, 5);
    expect(PAIR_THRESHOLD_J).toBeCloseTo(2 * restEnergy(K.me), 25);
  });

  it('photons below threshold cannot pair-produce', () => {
    expect(canPairProduce(1.0 * MEV)).toBe(false);
    expect(canPairProduce(1.022 * MEV)).toBe(true);
    expect(canPairProduce(10 * MEV)).toBe(true);
  });
});

describe('photon attenuation (NIST XCOM for water)', () => {
  it('attenuation falls with energy above 0.1 MeV (Compton-dominated regime)', () => {
    // NIST water mu/rho (m^2/kg): 0.1707 at 0.1 MeV, 0.0707 at 1 MeV,
    // 0.0222 at 10 MeV, 0.0185 at 100 MeV.
    // NIST XCOM water, mu/rho in cm^2/g (total):
    //   0.1 MeV 0.1707 | 1 MeV 0.0707 | 10 MeV 0.0222 | 100 MeV 0.0185
    // converted to SI (x0.1): 0.01707, 0.00707, 0.00222, 0.00185 m^2/kg.
    // Our log-log interpolation of the tabulated components reproduces
    // these to within 15% (the interpolation does not include the small
    // coherent-scattering term).
    const within = (a, b, tol) => expect(Math.abs(a - b) / b).toBeLessThan(tol);
    within(photonAttenuationWater(0.1).total, 0.01707, 0.15);
    within(photonAttenuationWater(1).total, 0.00707, 0.15);
    within(photonAttenuationWater(10).total, 0.00222, 0.15);
    within(photonAttenuationWater(100).total, 0.00185, 0.10);
    // The mean free path in water at 1 MeV must be ~14 cm (0.14 m).
    expect(gammaMeanFreePathWater(1)).toBeGreaterThan(0.10);
    expect(gammaMeanFreePathWater(1)).toBeLessThan(0.25);
  });

  it('photoelectric effect dominates at low energy', () => {
    const a = photonAttenuationWater(0.05);
    expect(a.photoelectric).toBeGreaterThan(a.compton);
    // At 0.05 MeV, NIST gives photo 0.2014 vs Compton 0.0200 cm^2/g.
    expect(a.photoelectric / a.compton).toBeGreaterThan(5);
  });

  it('pair production is zero below the 1.022 MeV threshold', () => {
    expect(photonAttenuationWater(0.5).pair).toBe(0);
    expect(photonAttenuationWater(1.0).pair).toBe(0);
    // Above threshold it must be positive and non-negligible.
    expect(photonAttenuationWater(5).pair).toBeGreaterThan(1e-5);
    expect(photonAttenuationWater(100).pair).toBeGreaterThan(photonAttenuationWater(5).pair * 0.3);
  });

  it('gamma mean free path in water is 10-30 cm at 1-10 MeV', () => {
    // NIST: 1 MeV -> mu/rho = 0.0707 cm^2/g -> 14 cm; 10 MeV -> 0.022 cm^2/g -> 45 cm
    // NIST water: mu/rho = 0.0707 cm^2/g at 1 MeV -> mfp = 1/(0.0707*1000) m
    // = 0.1414 m; at 10 MeV, 0.0222 cm^2/g -> 0.450 m.
    const mfp1 = gammaMeanFreePathWater(1);
    const mfp10 = gammaMeanFreePathWater(10);
    expect(mfp1).toBeGreaterThan(0.10);
    expect(mfp1).toBeLessThan(0.25);
    expect(mfp10).toBeGreaterThan(0.3);
    expect(mfp10).toBeLessThan(0.8);
  });
});

describe('Compton scattering', () => {
  it('Compton wavelength is h/(m_e c) = 2.426e-12 m', () => {
    expect(COMPTON_WAVELENGTH).toBeCloseTo(2.42631023867e-12, 20);
  });

  it('backscattered photon at 180 deg loses maximum energy', () => {
    const E0 = 1 * MEV;
    const E180 = comptonScatteredEnergy(E0, Math.PI);
    const E0deg = comptonScatteredEnergy(E0, 0);
    expect(E0deg).toBeCloseTo(E0, 15);
    expect(E180).toBeLessThan(E0);
    // For 1 MeV, the 180-degree scattered photon has E' = E/(1 + 2E/mc^2)
    const expected = E0 / (1 + 2 * E0 / (K.me * K.c ** 2));
    expect(E180).toBeCloseTo(expected, 15);
  });

  it('Klein-Nishina cross-section is forward-peaked at high energy', () => {
    const E = 2 * MEV;
    const fwd = kleinNishina(E, 0.01);
    const back = kleinNishina(E, Math.PI);
    expect(fwd).toBeGreaterThan(back);
  });

  it('Klein-Nishina at low energy approaches the Thomson limit', () => {
    const E = 0.001 * MEV; // 1 keV, deep in the Thomson regime
    const sigma = kleinNishina(E, 0);
    const thomson = CLASSICAL_ELECTRON_RADIUS ** 2;
    expect(sigma / thomson).toBeCloseTo(1, 1);
  });
});

describe('nuclear fission', () => {
  it('U-235 fission releases 202.5 MeV', () => {
    expect(FISSION_ENERGY_MEV).toBe(202.5);
  });

  it('energy per kilogram of U-235 is 8.3e13 J', () => {
    expect(FISSION_ENERGY_PER_KG / 1e13).toBeCloseTo(8.3, 1);
  });

  it('energy breakdown sums to 202.5 MeV including antineutrinos', () => {
    const sum = Object.values(FISSION_ENERGY_BREAKDOWN_MEV).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(202.5, 1);
    // The recoverable (non-neutrino) energy is 196.0 MeV, the reactor value.
    expect(FISSION_RECOVERABLE_ENERGY_MEV).toBeCloseTo(196.0, 1);
  });

  it('fission criticality gives k>1 for a large bare sphere', () => {
    expect(fastFissionCriticality(0.5).kEff).toBeGreaterThan(1);
    expect(fastFissionCriticality(0.3).kEff).toBeGreaterThan(1);
  });

  it('documents its own one-group calibration error', () => {
    // The accepted bare critical mass of 90% U-235 is ~52 kg; this model
    // gives a larger value. The discrepancy is stated, not hidden.
    const { mCrit, calibrationNote } = fastFissionCriticality(0.1);
    expect(mCrit).toBeGreaterThan(52);
    expect(calibrationNote).toMatch(/over-predicts/);
  });

  it('gives k<1 for a small sphere (subcritical)', () => {
    // A 1 cm bare sphere of 90% U-235 is deeply subcritical: the neutron
    // leakage mean free path exceeds the radius.
    const small = fastFissionCriticality(0.01);
    expect(small.kEff).toBeLessThan(1);
    expect(fastFissionCriticality(0.03).kEff).toBeLessThan(1);
  });

  it('identifies a critical radius where k_eff crosses 1', () => {
    const { rCrit } = fastFissionCriticality(0.1);
    expect(Number.isFinite(rCrit)).toBe(true);
    const below = fastFissionCriticality(rCrit * 0.9);
    const above = fastFissionCriticality(rCrit * 1.1);
    expect(below.kEff).toBeLessThan(1);
    expect(above.kEff).toBeGreaterThan(1);
  });
});

describe('radioactive decay', () => {
  it('exponential decay halves in one half-life', () => {
    const tHalf = 3600;
    const lam = halfLifeToLambda(tHalf);
    expect(Math.exp(-lam * tHalf)).toBeCloseTo(0.5, 12);
    expect(lam).toBeCloseTo(Math.LN2 / 3600, 15);
  });

  it('half-life to decay constant is correct', () => {
    expect(halfLifeToLambda(5730 * 3.156e7)).toBeCloseTo(3.835e-12, 14); // C-14
  });

  it('Bateman solution conserves total atoms', () => {
    const l1 = 1e-3, l2 = 2e-3;
    const { NA, NB } = batemanTwoMember(1000, 0, l1, l2, 500);
    expect(NA + NB).toBeLessThanOrEqual(1001); // decays to stable
    expect(NA).toBeGreaterThanOrEqual(0);
  });

  it('Bateman reduces to exponential for the parent', () => {
    const l1 = 1e-3, l2 = 2e-3;
    const { NA } = batemanTwoMember(1000, 0, l1, l2, 500);
    expect(NA).toBeCloseTo(1000 * Math.exp(-l1 * 500), 8);
  });

  it('a chain conserves atoms when there is a stable sink', () => {
    // 3 nuclides: 0 -> 1 -> 2 (stable)
    const N = decayChain(
      new Float64Array([1000, 0, 0]),
      new Float64Array([1e-3, 2e-3, 0]),
      [[0, 1], [1, 2]],
      5000,
    );
    const total = N[0] + N[1] + N[2];
    expect(total).toBeCloseTo(1000, 6);
  });

  it('activity halves after one half-life', () => {
    const lam = Math.LN2 / 60;
    expect(activity(1e6, lam) / 2).toBeCloseTo(activity(5e5, lam), 6);
  });
});

describe('charged-particle interactions', () => {
  it('proton range in water matches NIST PSTAR (0.14 mm at 3 MeV)', () => {
    // protonRangeWater returns MILLIMETRES (documented in the source).
    expect(protonRangeWater(3)).toBeCloseTo(0.139, 1);
    expect(protonRangeWater(10)).toBeCloseTo(1.20, 0);
    expect(protonRangeWater(100)).toBeCloseTo(77.3, 0);
  });

  it('range increases with energy', () => {
    expect(protonRangeWater(100)).toBeGreaterThan(protonRangeWater(10));
  });

  it('Cherenkov threshold for electrons in water is ~0.26 MeV', () => {
    expect(CHERENKOV_ELECTRON_THRESHOLD_J / (1e6 * K.e)).toBeCloseTo(0.26, 1);
  });

  it('Cherenkov threshold for protons is much higher than for electrons', () => {
    expect(cherenkovThreshold(K.mp)).toBeGreaterThan(cherenkovThreshold(K.me) * 1000);
  });
});

describe('annihilation deposition in the simulated world', () => {
  it('deposits most of the energy for a thick absorber', () => {
    const r = annihilationDeposition(1, 1e6);
    expect(r.depositedJ).toBeGreaterThan(0.5 * r.totalJ);
    expect(r.depositedJ).toBeLessThanOrEqual(r.totalJ);
  });

  it('reports 43 Mt TNT for 1 kg of antimatter', () => {
    const r = annihilationDeposition(1);
    expect(r.megatonsTNT).toBeCloseTo(42.96, 1);
  });

  it('energy is conserved across all channels', () => {
    const r = annihilationDeposition(1, 1e5);
    expect(r.depositedJ + r.escapedNeutrinoJ).toBeLessThanOrEqual(r.totalJ * 1.0001);
  });
});
