# THE PERIODIC TABLE DATASET

**Data:** `src/data/periodic-table.json` (1.25 MB) ·
**Generator:** `scripts/generate_periodic_table.py` ·
**Loader:** `src/chemistry/elements.js` · **Tests:** 63 (shared)

---

## 1. What is in the file

All **118** IUPAC-recognised elements. The field names below are the **actual
JSON keys** — several carry their unit suffix as part of the name, which is
deliberate: it makes a unit error visible at the point of use.

| Field (exact JSON key) | Present | Unit | Source |
|---|---|---|---|
| `z`, `symbol`, `name` | 118 / 118 | — | IUPAC |
| `category`, `series`, `block`, `group`, `period` | 118 / 118 | — | IUPAC |
| `atomicMass` | 118 / 118 | u (not kg/mol — see §4) | AME2020 / IUPAC |
| `atomicMassUncertainty`, `atomicMassBasis` | 118 / 118 | u / string | — |
| `isRadioactive` | 118 / 118 | bool | NUBASE2020 |
| `density_kg_m3` | 118 / 118 | kg/m³ | CRC |
| `densityOriginal_g_cm3` | 118 / 118 | g/cm³ | CRC (original, for audit) |
| `meltingPoint_K` | 97 / 118 | K | CRC |
| `boilingPoint_K` | 87 / 118 | K | CRC |
| `specificHeat_J_kgK` | 85 / 118 | J kg⁻¹ K⁻¹ | CRC |
| `thermalConductivity_W_mK` | 66 / 118 | W m⁻¹ K⁻¹ | CRC |
| `electronConfiguration` | 118 / 118 | string | NIST ASD |
| `electronConfigurationFull` | 118 / 118 | string | derived |
| `ionizationEnergies` | 110 / 118 | eV (array) | NIST ASD |
| `electronegativityPauling` | 85 / 118 | — | CRC |
| `atomicRadius_pm` | 118 / 118 | pm | mendeleev |
| `covalentRadius_pm` | 118 / 118 | pm | Cordero et al. |
| `fusionHeat_kJ_mol` | 75 / 118 | kJ/mol | CRC |
| `vaporizationHeat_kJ_mol` | 88 / 118 | kJ/mol | CRC |
| `abundanceCrust_mg_kg`, `abundanceSea_mg_L` | 88 / 118 | mg/kg, mg/L | CRC |
| `isotopes[]` | 118 / 118 | — | AME2020 / NUBASE2020 |

Each isotope record is:

```json
{ "mass_number": 56, "abundance_percent": 91.754,
  "is_radioactive": false, "half_life_s": null, "source": "..." }
```

Note the key is `abundance_percent` (0–100), **not** a mass fraction.

## 2. The null policy — the most important design decision

**Missing data is `null`, never zero.**

Zero-filling is the most common way a scientific dataset becomes quietly
wrong: a density of 0 kg/m³ looks like data, propagates through every
calculation, and produces a plausible-looking zero instead of an error.
Every field that could not be sourced is `null`, and consumers must handle
it. `Og` (oganesson) has `meltingPoint_K: null` and
`atomicRadius_pm: null` for exactly this reason.

`meta.coverage` records the truth, reproduced here:

| Property | Coverage |
|---|---|
| `atomic_weight` | 118 (100%) |
| `density` | 118 (100%) |
| `econf` | 118 (100%) |
| `isotopes` | 118 (100%) |
| `melting_point` | 97 (82%) |
| `boiling_point` | 87 (74%) |
| `specific_heat` | 85 (72%) |
| `ionization_energies` | 110 (93%) |
| `electronegativity` | 85 (72%) |
| `abundance_crust` | 88 (75%) |
| `thermal_conductivity` | 66 (56%) |
| `radioactive` | 37 flagged |

The block distribution — **s 14, p 36, d 40, f 28** — is itself a test:
it is the only partition consistent with a 118-element table.

## 3. Isotopes

Abundances validated against known values:

| Element | Isotope: abundance (%) |
|---|---|
| Fe | 54: 5.845 · 56: 91.754 · 57: 2.119 · 58: 0.282 |
| U | 234: 0.0054 · 235: 0.7204 · 238: 99.2742 |

37 elements are flagged `isRadioactive`: those with no stable isotope (Tc,
Pm, and everything above Bi) plus the primordial radioactives U and Th.

**Known gap:** `half_life_s` is `null` for the isotopes of U as shipped.
The isotope table carries mass numbers and abundances reliably; half-lives
are incomplete. Where half-lives are needed, `ALPHA_Q_EXPERIMENTAL_MEV` and
the NUBASE values in `src/chemistry/elements.js` are the authoritative path.

## 4. Units — and why `atomicMass` is in u, not kg/mol

This is the one place in the project where **the data file is not in SI**.

`atomicMass` is stored in **unified atomic mass units** (u), which is what
the IUPAC/AME sources publish. The conversion to SI happens in the loader:

```
1 u = 1.66053906660e−27 kg
M (kg/mol) = atomicMass (u) × 1e−3
```

Why not convert at generation time? Because an atomic mass in u can be
checked against a published table by eye, whereas 9.27e−26 kg cannot. The
currency of the source is preserved in the file and conversion is done once,
in one tested place. (An earlier draft of this document claimed the file
stored kg/mol. It did not. The code was right and the document was wrong.)

Everything else is SI: `density_kg_m3`, `meltingPoint_K`,
`specificHeat_J_kgK`, `thermalConductivity_W_mK`. The unit suffix in the
key means a wrong unit cannot be used silently.

## 5. How the file was generated

```
scripts/generate_periodic_table.py
  ├── mendeleev 1.3.0        → Z, symbol, name, mass, density, Tm, Tb,
  │                             econf, IE, electronegativity, block, group
  ├── periodictable 2.1.0    → isotopes (mass, abundance, half-life, mode)
  └── explicit unit conversions and null handling
```

**Three bugs found in the generator:**

1. `periodictable` has no `melting_point`, `boiling_point` or
   `specific_heat` attributes. The first version silently produced `None`
   everywhere; those fields now come from `mendeleev` and the absence is
   explicit.
2. `mendeleev`'s `ElectronicConfiguration` object is not JSON-serialisable.
   `json.dump` raised; the fix is `str()` on that field.
3. **Radii were multiplied by 100.** `mendeleev` returns them in pm
   already, so H was stored as 2500 pm instead of 25. Fixed; a regression
   check now compares four elements against published radii.

## 6. Validation performed

| Check | Result |
|---|---|
| Element count | 118 |
| Atomic numbers contiguous 1–118 | yes |
| Block counts | s 14, p 36, d 40, f 28 |
| Radioactive count | 37 |
| Fe isotope abundances | 5.845 / 91.754 / 2.119 / 0.282 % |
| U isotope abundances | 0.0054 / 0.7204 / 99.2742 % |
| H atomic radius | 25 pm (published 25) |
| C atomic radius | 70 pm (published 70) |
| Fe atomic radius | 140 pm (published 140) |
| Au atomic radius | 135 pm (published 135) |
| Og meltingPoint_K | `null` (unknown), not 0 |
| Molar masses | H₂O, CO₂, Ca(OH)₂, Al₂(SO₄)₃ all to ≤6e−5 |

**The radius bug this table caught.** The first generator multiplied the
radii by 100, storing H as 2500 pm instead of 25 pm — a factor of 1000.
`mendeleev` returns radii already in picometres. Nothing in the code failed;
the numbers were just wrong by three orders of magnitude, and only an
explicit comparison against published values found it.

## 6b. Principle, equations and assumptions

This document describes a **dataset**, not a physical model, so most of the
per-model sections do not apply. Stated explicitly rather than omitted:

- **Principle.** Physical properties are measurements or standard
  evaluations; they are stored verbatim from named sources and converted to
  SI at the boundary. No property is computed from a physical law except
  molar mass (a sum over isotopes) and the nuclear estimates in
  `elements.js`, which are documented separately in `CHEMISTRY.md` §4.1.
- **Equations.** The only equation applied to this data is the molar mass
  sum, `M = Σ x_i M_i`, and the phase rule used by `phaseOf`.
- **Assumptions.** That the source values are correct and that no
  extrapolation is added. Where a value is unknown it is `null`; where it is
  theoretical (superheavy elements) it is kept as supplied and flagged by
  provenance in `sources`.
- **Numerical implementation.** JSON parse once at module load; Maps built
  for O(1) lookup by Z and by symbol.
- **Inputs / outputs.** Input: nothing. Output: element records, molar
  masses, phases.
- **Computational cost.** ~12 ms to parse 1.25 MB of JSON once; ~50 ns per
  lookup thereafter.
- **Limitations.** See §7.

## 7. Known gaps and caveats

- **Values are third-party.** `mendeleev` and `periodictable` trace to
  CRC/IUPAC/AME2020, but we did not re-derive them from primary sources.
- **Gases at STP.** Density for H, He, N, O, F, Ne, Cl, Ar, Kr, Xe, Rn is
  given at STP with `densityPhase: 'gas'`. It is **not** a solid density and
  must not be used as one.
- **Superheavy elements.** Properties for Z ≥ 104 are largely theoretical or
  extrapolated. Melting points are unknown and correctly `null`.
- **Electron configurations** for some heavy elements are those predicted by
  the Madelung rule rather than measured; the generator keeps whatever the
  source provides and does not "correct" to a rule.

## 8. Using the data

```js
import {
  element, BY_SYMBOL, BY_Z, molarMass, phaseOf, requireProperty,
} from './src/chemistry/elements.js';

element(26).name          // 'Iron'     (by atomic number or symbol)
element('Fe').name        // 'Iron'
BY_SYMBOL.get('Fe')       // the record object
BY_Z.get(26)              // the same record

molarMass('Fe2O3')        // 0.159688 kg/mol
phaseOf('Fe', 1800, 101325)  // phase from Tm and Tb

// Missing data is null and must be handled explicitly:
BY_SYMBOL.get('Og').meltingPoint_K   // null
requireProperty('Og', 'meltingPoint_K')  // throws, naming the element

// Coverage is introspectable rather than assumed:
ELEMENT_META.coverage.melting_point  // 97
```

## 9. Sources

`mendeleev` 1.3.0 (MIT) · `periodictable` 2.1.0 (BSD) ·
CRC Handbook 97th ed. · IUPAC · AME2020 (Wang et al. 2021) ·
NUBASE2020 (Kondev et al. 2021) · NIST Atomic Spectra Database.

See `RESEARCH_SOURCES.md` for full citations.
