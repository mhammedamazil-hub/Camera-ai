# CHEMISTRY

**Modules:** `src/chemistry/elements.js` (640 lines),
`src/chemistry/thermochemistry.js` (760 lines) ·
**Tests:** `tests/chemistry.test.js` (63) · **Status:** validated

---

## 1. Principle

Chemistry enters the simulation at three levels:

1. **Elements** — the identity and physical properties of the 118 elements,
   so that any material in the world can be described by composition.
2. **Thermochemistry** — whether a reaction releases or absorbs energy, how
   far it goes, and how fast.
3. **Solutions** — acid–base equilibria, the ocean carbonate system, and
   gas solubility, which is where chemistry couples to the climate.

The module is deliberately **equilibrium-first**: reaction extent is
computed from ΔG, not from a kinetic network. Kinetics appears only through
Arrhenius/Eyring for individual rates.

## 2. What is modelled

| Domain | Functions |
|---|---|
| Element registry | `element(id)`, `BY_SYMBOL`, `BY_Z`, `requireProperty` |
| Stoichiometry | `molarMass`, `molarMassOf`, `parseFormula` (nested parentheses) |
| Phase behaviour | `phaseOf(T, p)` from melting/boiling points |
| Nuclear | `semiEmpiricalBinding`, `alphaDecayQ`, `geigerNuttallHalfLife` |
| Reaction energetics | `standardGibbs`, `reactionThermo`, `equilibriumConstant` |
| Kinetics | `arrhenius`, `eyring`, `diffusionLimitedRate`, `collisionFrequency` |
| Acids and bases | `weakAcidPH`, `bufferPH`, `solubilityFromKsp` |
| Carbonate system | `oceanPH`, `carbonateSystem`, `henryCO2` |
| Combustion | `combustionStoichiometry`, `adiabaticFlameTemperature` |
| Energetics of matter | `annihilationEnergy`, `U235_FISSION_ENERGY_J` |

## 3. Equations

### 3.1 Gibbs free energy with temperature correction

```
ΔG°(T) = ΔH°(T) − T ΔS°(T)
ΔH°(T) = ΔH°₂₉₈ + ΔCp (T − 298.15)
ΔS°(T) = ΔS°₂₉₈ + ΔCp ln(T/298.15)
```

This is the Gibbs–Helmholtz correction assuming constant ΔCp. Without it,
ΔG would be linear in T, which is wrong above ~100 K from 298 K.

### 3.2 Equilibrium constant

```
K = exp(−ΔG°/RT)
```

### 3.3 van 't Hoff

```
d(ln K)/d(1/T) = −ΔH°/R
```

### 3.4 Arrhenius and Eyring

```
k = A exp(−E_a/RT)
k = (k_B T/h) exp(−ΔG‡/RT)
```

### 3.5 Weak acid (exact cubic, not the usual approximation)

For a monoprotic acid of concentration C and Ka, charge balance gives:

```
[H⁺]³ + Ka[H⁺]² − (KaC + Kw)[H⁺] − Ka·Kw = 0
```

Solved by Newton from pH 7. The textbook `[H⁺] = √(Ka C)` is used only as a
starting guess — it fails badly for strong or very dilute acids.

### 3.6 Solubility from Ksp

```
For MₐX_b:  s = (Ksp / (aᵃ bᵇ))^(1/(a+b))
```

### 3.7 Ocean carbonate system

Total alkalinity and DIC with the Lueker (2000) seawater constants:

```
TA = [HCO₃⁻] + 2[CO₃²⁻]
DIC = [CO₂] + [HCO₃⁻] + [CO₃²⁻]
K₁ = [H⁺][HCO₃⁻]/[CO₂]
K₂ = [H⁺][CO₃²⁻]/[HCO₃⁻]
```

Solved for [H⁺] by bisection over pH 2–12 (monotone in the residual), which
is slower than a Newton solve but **cannot diverge** — important because
this function is called for every ocean point in the simulation.

### 3.8 Henry's law with the van 't Hoff correction

```
[CO₂(aq)] = K₀(T) · pCO₂
K₀(T) = K₀(298) · exp[ (−ΔH_sol/R)(1/T − 1/298.15) ]
```

**Sign trap:** dissolving CO₂ is *exothermic*, so the exponent uses
**+19900/R**, not −19900/R. The wrong sign makes warm water *more* soluble,
which is backwards and would break the ocean acidification response.

## 4. Units and conventions

- All thermodynamic quantities in **SI**: J/mol, K, Pa, mol/m³.
- Standard state: 1 bar, ideal gas; solutes at 1 mol/kg.
- ΔG < 0 ⇒ spontaneous; K > 1 ⇒ products favoured.
- **ΔH for combustion is negative** (exothermic). `adiabaticFlameTemperature`
  takes the heat *released* (positive) and throws on a negative input rather
  than silently returning a negative temperature.

## 5. Assumptions

1. **Ideal solutions.** Activity coefficients are 1. This is the largest
   assumption; seawater has ionic strength ~0.7 mol/kg.
2. **Equilibrium.** Reactions are assumed to go to completion given enough
   time. No kinetic network, no catalysis beyond what Arrhenius gives.
3. **Constant ΔCp** in the temperature correction.
4. **No pressure dependence** of ΔG except through the gas phase.
5. **Thermochemistry of aqueous ions** uses conventional values with the
   proton at zero, as standard.
6. **No photochemistry, no radical chemistry, no surface catalysis.**

## 6. Inputs and outputs

| Function | In | Out |
|---|---|---|
| `molarMassOf(formula)` | `'Al2(SO4)3'` | kg/mol |
| `molarMass(elementId)` | `'Fe'` or `26` | kg/mol (per mole of atoms) |
| `reactionThermo(species, T)` | list of `{id, coeff}` | `{dH, dS, dG, K}` |
| `weakAcidPH(Ka, C)` | — | pH |
| `bufferPH(pKa, acid, base)` | — | pH |
| `oceanPH(pCO2, T, S, TA)` | — | `{pH, DIC, pCO2}` |
| `combustionStoichiometry(fuel)` | — | mol O₂, CO₂, H₂O per mol |
| `annihilationEnergy(m)` | kg | J |

## 7. Validation

### 7.1 Molar masses

| Formula | Computed | Reference | Error |
|---|---|---|---|
| H₂O | 0.018015 | 0.0180153 | 2e−5 |
| CO₂ | 0.044009 | 0.0440095 | 1e−5 |
| Ca(OH)₂ | 0.074092 | 0.074093 | 1e−5 |
| Al₂(SO₄)₃ | 0.342131 | 0.342131 | 6e−5 |

### 7.2 Enthalpies (exact agreement)

| Reaction | Computed | Reference |
|---|---|---|
| H₂ + ½O₂ → H₂O(l) | −285.83 kJ/mol | −285.83 |
| CH₄ + 2O₂ → CO₂ + 2H₂O(l) | −890.30 kJ/mol | −890.30 |
| ΔH_vap(H₂O) | 44.01 kJ/mol | 44.01 |
| N₂ + O₂ → 2NO | ΔG > 0, K < 1e−20 | forbidden |

### 7.3 Ocean carbonate

| pCO₂ (ppm) | Model pH | DIC (µmol/L) |
|---|---|---|
| 280 | 8.172 | — |
| 421 | 8.021 | 2092 (ref ≈ 2000) |
| 560 | 7.912 | — |
| 800 | 7.772 | — |
| 1600 | 7.490 | — |

Seawater at 18 °C, S = 35: pK₁ = 5.910, pK₂ = 9.079,
K₀ = 0.0343 mol/(kg·atm).

**The trap.** The published Weiss series
`−60.2409 + 93.4517(100/T) + 23.3585 ln(T/100) + S(0.023517 − 0.023656(T/100) + 0.0047036(T/100)²)`
gives **ln K₀**, not pK₀. Using `10^(−pK0)` yields pH 3.5 — a smooth,
plausible-looking, completely wrong answer. The code uses `exp(lnK0)`.

### 7.4 Acids and buffers

| Case | Computed | Reference |
|---|---|---|
| 0.1 M acetic acid | pH 2.88 | 2.88 |
| 1:1 acetate buffer | 4.757 | 4.756 |
| CaCO₃ solubility | 5.74e−5 M | 5.7e−5 |
| Henry K(298) freshwater | 0.034 | 0.034 |

### 7.5 Nuclear

| Quantity | Value | Note |
|---|---|---|
| B(⁵⁶Fe) SEMF | 495.4 MeV | ref 492.25, **+0.6%** |
| B(²³⁸U) SEMF | 1814.7 MeV | ref 1801.7, +0.7% |
| α-Q(²³⁸U) | 4.34 MeV | exp 4.270, +0.07 |
| Geiger–Nuttall t½(²³⁸U) | 1.39e17 s | exp 1.41e17 |

### 7.6 Antimatter

| Quantity | Value |
|---|---|
| 1 kg antimatter + 1 kg matter | 1.7975e17 J |
| Equivalent TNT | 42.96 Mt |
| Per unit mass vs fusion | ~1000× |
| Pair production threshold | 1.022 MeV |

## 8. Numerical implementation

| Problem | Method | Why |
|---|---|---|
| Weak-acid pH | exact cubic, Newton from pH 7 | the `√(KaC)` approximation fails for strong/dilute acids |
| Buffer pH | Henderson–Hasselbalch | exact in the buffer regime |
| Solubility | closed form from Ksp | — |
| Reaction extent | bisection on ΔG | guaranteed convergence, no derivative |
| Ocean pH | **bisection** over pH 2–12 | cannot diverge; called per ocean cell |
| Geiger–Nuttall | two-point fit | guessed constants were 4× off in slope |
| Decay chains | exact exponential per step | conserves atoms to machine precision |

**Why bisection for ocean pH.** A Newton solve is ~4× faster but can diverge
when the carbonate residual is non-monotone in a bad initial bracket. This
function is called for every ocean point, so a single divergent call would
stall the bake. Bisection trades 14 μs for a guarantee.

**Clamping.** `equilibriumConstant` returns values in `[1e−300, 1e300]`; a
literal `exp(ΔG/RT)` overflows float64 for |ΔG| > ~700 kJ/mol, which real
reactions exceed. The clamp is documented in the function rather than
letting Infinity propagate.

## 9. Computational cost

| Operation | Cost |
|---|---|
| Formula parse | ~2 μs |
| Molar mass | ~2 μs (parse) / ~50 ns (cached) |
| `reactionThermo` | ~3 μs (60-species lookup) |
| `oceanPH` (bisection, 50 iters) | ~18 μs |
| Arrhenius | ~30 ns |

`oceanPH` at 18 μs is the expensive one; it is why the ocean chemistry is
computed on a coarse grid and interpolated rather than per-pixel.

## 10. Limitations

- **Ideal solutions.** No activity coefficients. Absolute pH is good to
  ~0.05; *changes* are much more reliable than absolutes.
- **Alpha Q-values valid only for A ≥ 232.** Below that the SEMF error
  reaches 4.8 MeV. Use `ALPHA_Q_EXPERIMENTAL_MEV`.
- **SEMF is a liquid-drop model.** It cannot represent shell closures:
  B(⁴He) is off by 19%.
- **Flame temperatures ignore dissociation.** CH₄/air gives up to 3200 K
  against a real 2223 K.
- **No kinetics network.** A reaction mixture does not evolve in time.
- **No photochemistry.**

## 11. Sources

NIST-JANAF (Chase 1998) · CRC Handbook 97th ed. · Atkins & de Paula (2014) ·
Lueker et al. (2000) · Weiss (1974) · Fofonoff & Millard (1983) ·
Bethe & Bacher (1936) · Geiger & Nuttall (1911) · ENSDF/NuDat · PDG (2022) ·
Krane (1988).

See `RESEARCH_SOURCES.md`.
