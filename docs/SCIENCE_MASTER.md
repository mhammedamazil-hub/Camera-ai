# PROJECT TERRA — SCIENCE MASTER

> A progressively expandable, physically simulated Earth.
> **The science is the engine. The planet is only the visualisation.**

This document is the map of the project: what every module claims, how it is
validated, and — just as importantly — what it does **not** claim. Every
number quoted here is produced by code in this repository and is pinned by a
test. Nothing here is aspirational.

- Status: **Phase 6 complete** (solid Earth as a process). 491 automated tests passing.
- Last validated: 2026-11-14.
- Validation command: `npm test` — which runs the suite **and**
  `scripts/validate-docs.mjs`, so a document that quotes a function which
  does not exist, or a test count that is no longer true, fails the build.

---

## 0. Non-negotiable rules this project follows

These were set by the brief and are enforced by the repository structure, not
just by good intentions.

| Rule | How it is enforced |
|---|---|
| Research before coding | Every module header cites its sources; `docs/RESEARCH_SOURCES.md` lists them |
| Never invent physical laws, data or references | Constants live in `src/core/constants.js` with units, uncertainty and a source field |
| Distinguish visual realism from physical accuracy | Every visual layer carries an explicit `note` saying what it approximates; see §7 |
| Document every approximation and constant | `docs/LIMITATIONS.md`, and an in-code comment at each approximation |
| Modular architecture, no single-file build | 15 modules under `src/`; the renderer imports the same physics the tests do |
| SI units throughout | One documented exception: pressure in hPa at the UI layer only |
| Validation against analytical solutions, with reported error | Every module has a `tests/*.test.js` quoting the reference value and the achieved error |
| Preserve working implementations | Tests must pass before a commit; a failing test is never deleted to make a build go green |
| Development log | `docs/DEVLOG.md` records every bug found and what it taught |

---

## 1. What is built

| Module | File | Lines | Tests | Status |
|---|---|---|---|---|
| Constants | `src/core/constants.js` | ~300 | — | validated at import |
| Mathematics | `src/core/math/*.js` | ~1 900 | 28 | complete |
| Gravity | `src/physics/gravity.js` | ~570 | 35 | complete |
| Thermodynamics | `src/physics/thermodynamics.js` | ~230 | (with atmosphere) | complete |
| Atmosphere | `src/physics/atmosphere.js` | ~620 | 80 | complete |
| Particles & antimatter | `src/physics/particle-physics.js` | 485 | 38 | complete |
| Elements | `src/chemistry/elements.js` | ~640 | 63 (shared) | complete |
| Thermochemistry | `src/chemistry/thermochemistry.js` | ~760 | (shared) | complete |
| Terrain | `src/earth/terrain.js` | 475 | 49 | complete |
| Geology (dynamic) | `src/earth/geology.js` | ~600 | 70 | complete |
| Oceanography | `src/earth/oceanography.js` | 588 | 60 | complete |
| Field layers | `src/app/fields.js` | 324 | 45 | complete |
| Globe renderer | `src/app/globe.js` | 550 | — | manual |
| App shell | `src/app/main.js`, `bake.js`, `format.js` | ~700 | (format is tested) | complete |
| Geometry invariants | `tests/geometry-conventions.test.js` | — | 18 | complete |

**Total: ~7 500 lines of module code, 491 tests.**

---

## 2. Gravity — `src/physics/gravity.js`

**Principle.** A static, axisymmetric potential. The gravitational potential
is expanded in Legendre polynomials; the J₂ term dominates the oblateness.

**Equations.**

```
V(r,θ) = −(GM/r) [1 − Σ J_n (R/r)ⁿ P_n(cos θ)]
J₂ = 1.08262668e-3,  J₃ = −2.53265649e-6,  J₄ = −1.61962159e-6
g = −∇V + centrifugal
```

Normal gravity on the WGS84 ellipsoid uses the closed-form Somigliana
equation, which is *exact* for the ellipsoid rather than a series:

```
γ(φ) = a γ_e cos²φ + b γ_p sin²φ
       ─────────────────────────────
       √(a² cos²φ + b² sin²φ)
γ_e = 9.7803253359 m/s²,  γ_p = 9.8321849378 m/s²
```

**Validation.**

| Quantity | Computed | Reference | Error |
|---|---|---|---|
| Equatorial normal gravity | 9.780311349 | 9.7803253359 | 1.4e−6 (relative) |
| Polar normal gravity | 9.832248847 | 9.8321849378 | 6.5e−6 (relative) |
| Spherical harmonic vs point mass at 1 R⊕ | — | — | 7.48e−10 |
| Kepler propagation, 1 period | — | analytical ellipse | 2e−15 |
| Kepler propagation, 10 periods | — | analytical ellipse | 1.6e−14 |

**Known limitation.** Our GM comes from IERS 2010 while the Somigliana
constants come from WGS84; the two do not share a GM. This produces a
residual of a few milligal that is a *definition* difference, not an error,
and the tests are not tightened past it. See `docs/GRAVITY.md` §7.

**Sources.** IERS Conventions 2010; NIMA TR8350.2 (WGS84); Vallado (2013).

---

## 3. Atmosphere — `src/physics/atmosphere.js`

**Principle.** The 1976 US Standard Atmosphere for the vertical structure,
plus a composition model, Rayleigh scattering, and a grey-band energy
balance for climate.

**Equations.** Hydrostatic balance with a piecewise-linear lapse rate:

```
dp/dz = −ρ g
p = p_b (T_b / T)^(g M / (R* L_b))
```

**Crucial subtlety (cost one debugging session).** The 1976 tables are
defined on **geopotential** height H, not geometric height z:

```
H = R_eff z / (R_eff + z),   R_eff = 6 356 766 m
```

Using z directly gives a 0.36% temperature and a 4.4% pressure error at
47 km. This is now handled explicitly and tested.

**Validation.**

| Quantity | Computed | Reference | Error |
|---|---|---|---|
| ISA temperature, 0–47 km | — | table | ≤ 0.012% |
| ISA pressure, 0–47 km | — | table | ≤ 0.0004% |
| ISA density, 0–47 km | — | table | ≤ 0.043% |
| Molar mass of dry air | 28.9661 g/mol | 28.9647 | 5e−5 |
| Rayleigh τ at 550 nm | 0.09680 | 0.0976 | −0.8% |
| Rayleigh τ at 400 nm | 0.3584 | — | — |
| Grey-band OLR | 234.4 W/m² | 236.7 | −1.0% |
| Equilibrium surface temperature | 289.01 K | ~288 | +0.35% |
| dOLR/dT (Planck feedback) | 3.806 W m⁻² K⁻¹ | 3.2–4.2 | in range |
| CO₂ doubling, Planck only | 0.98 K | ~1.0–1.2 | — |
| CO₂ doubling, with −1.2 W m⁻² K⁻¹ feedback | 3.09 K | 2.5–4.0 | in range |

**Composition closure.** The IUPAC dry-air mole fractions sum to
1.0000887, not 1. Rather than hide this, the module normalises and exposes
the residual as `compositionClosureError()`. The normalised dry-air molar
mass is 28.9661 g/mol.

**Documented limitation.** `energyBalanceSteadyState` intentionally returns
~1 K per CO₂ doubling because it includes **only** the Planck response.
Feedbacks are a separate function (`equilibriumWarming`). Do not "fix" the
first to give 3 K.

---

## 4. Chemistry — `src/chemistry/`

### 4.1 Elements (`elements.js`)

All **118** IUPAC-recognised elements, generated by
`scripts/generate_periodic_table.py` from `mendeleev` 1.3.0 (CRC/NIST) and
`periodictable` 2.1.0 (AME2020 masses, NUBASE half-lives).

**Null policy.** Missing data is `null`, never zero-filled. Coverage is
reported honestly in `meta.coverage`:

| Property | Coverage |
|---|---|
| Atomic mass | 118 / 118 |
| Density | 118 / 118 (gases at STP marked as such) |
| Electron configuration | 118 / 118 |
| Melting point | 97 / 118 (82%) |
| Thermal conductivity | 66 / 118 (56%) |

**Nuclear model.** The semi-empirical mass formula (Bethe–Weizsäcker) gives
nuclear binding energies. It is validated and it has a *documented failure
region*:

| Nuclide | SEMF B/A | Experimental | Note |
|---|---|---|---|
| ⁵⁶Fe | 8.85 | 8.790 | +0.6% in B |
| ²³⁸U | 7.626 | 7.570 | — |
| ⁴He | 5.71 | 7.074 | doubly magic; SEMF badly underestimates |

**Alpha decay Q-values.** `alphaDecayQ` uses the experimental ⁴He binding
energy (28.2957 MeV) rather than the SEMF value (22.84 MeV), because using
the SEMF value flips the sign of Q. Even corrected, the SEMF Q-values are
only trustworthy for **A ≥ 232**:

| Nuclide | SEMF Q (MeV) | Experimental | Error |
|---|---|---|---|
| ²³⁸U | 4.34 | 4.270 | +0.07 |
| ²³⁵U | 4.88 | 4.678 | +0.20 |
| ²³²Th | 4.01 | 4.083 | −0.07 |
| ²⁴⁴Cm | 6.06 | 5.90 | +0.16 |
| ²⁴¹Am | 5.89 | 5.49 | +0.40 |
| ²²²Rn | — | 5.590 | **not reliable** |
| ²¹⁴Po | 3.05 | 7.833 | **−4.8, do not use** |

Below A = 232 the caller **must** use `ALPHA_Q_EXPERIMENTAL_MEV`, a
26-nuclide table from ENSDF/NuDat.

**Geiger–Nuttall.** Recalibrated by a two-point fit through ²³⁸U and ²¹⁴Po:

```
log₁₀ t½(s) = 165.3 − 62.85 · Q_α(MeV)   →  8.7 decades per MeV
```

| Nuclide | Predicted t½ | Measured |
|---|---|---|
| ²³⁸U | 1.39e17 s | 1.41e17 s |
| ²¹⁴Po | 1.63e−4 s | 1.64e−4 s |

### 4.2 Thermochemistry (`thermochemistry.js`)

~60 species with NIST-JANAF / CRC ΔHf°, S° and phase.

**Validation (exact).**

| Reaction | Computed ΔH° | Reference |
|---|---|---|
| H₂ + ½O₂ → H₂O(l) | −285.83 kJ/mol | −285.83 |
| CH₄ + 2O₂ → CO₂ + 2H₂O | −890.30 kJ/mol | −890.30 |
| N₂ + O₂ → 2NO | ΔG > 0, K < 1e−20 | thermodynamically forbidden |

**Ocean carbonate system.** Uses Lueker (2000) seawater pK₁/pK₂ and Weiss
(1974) K₀, *not* freshwater constants.

| pCO₂ (ppm) | pH | Note |
|---|---|---|
| 280 (pre-industrial) | 8.172 | — |
| 421 (present) | 8.021 | DIC = 2092 µmol/L (ref ≈ 2000) |
| 560 | 7.912 | ΔpH = −0.260 from 280 |
| 800 | 7.772 | — |
| 1600 | 7.490 | — |

**The trap that cost an hour.** The Weiss series
`−60.2409 + 93.4517(100/T) + …` yields **ln K₀**, not pK₀. Using
`10^-pK0` produces a smoothly varying but completely wrong pH (3.5 instead
of 8.0). The code now uses `exp(lnK0)` and says so in a comment.

### 4.3 Particle and antimatter physics (`particle-physics.js`)

This exists because the brief requires the simulation to be extensible
enough to "test with simulated antimatter", and because annihilation is the
physical yardstick for every other energy process.

| Quantity | Value | Reference |
|---|---|---|
| e⁺e⁻ at rest | two 511.0 keV photons | 510.999 keV |
| p+p̄ at rest | 1876.5 MeV, 2/3 charged pions : 1/3 neutral | PDG |
| Pair production threshold | 1.022 MeV | 2mₑc² |
| 1 kg antimatter + 1 kg matter | 1.7975e17 J = **42.96 Mt TNT** | — |
| U-235 fission | 202.5 MeV/fission = 8.3e13 J/kg | Krane |
| Photon mfp in water, 1 MeV | 0.157 m | NIST 0.141 m |
| Proton range in water, 3 MeV | 0.155 mm | NIST PSTAR 0.139 mm |
| Cherenkov threshold, e⁻ in water | 0.26 MeV | — |

**Documented calibration failure.** The one-group fast-neutron criticality
model over-predicts the bare critical mass of 90%-enriched U-235 by about
4×. This is the known failure of one-group diffusion for small, high-leakage
assemblies. The function returns a `calibrationNote` saying so, and the test
asserts the over-prediction rather than hiding it.

---

## 5. Terrain and the solid Earth — `src/earth/terrain.js`

**Data.** NOAA ETOPO1-derived 10 arc-minute global relief (ice surface),
2161 × 1081 int16, MIT-licensed mirror of a US Government public-domain
product. See `docs/RESEARCH_SOURCES.md`.

**Why 10 arc-minutes.** 1 arc-minute ETOPO1 is 466 MB uncompressed. At the
scale the planetary simulation operates on (2°–5° grids on 2 vCPU), 10′ is
already finer than any dynamics we can afford. It is labelled measured at
10′ and procedural below that.

**The grid is validated, not trusted.** The pipeline refuses to ship data
that fails its own checks:

| Check | Result |
|---|---|
| Area-weighted land fraction | 28.97% (known 29.2%) |
| Ocean volume | 1.3411e18 m³ (known 1.335e18, **+0.46%**) |
| Mean ocean depth | 3691 m (known 3688, **+0.08%**) |
| Land area | 148.67e6 km² (known 148.94, **−0.18%**) |
| Total surface area | 5.1202e8 km² (WGS84 5.1007e8, +0.38%) |
| Max cell-mean elevation | 6033 m (Everest cell — a cell *mean*, not the summit) |
| Min elevation | −10 192 m (ETOPO1 minimum −10 698 m) |

**The row-order trap.** The source `.hdr` declares `YLLCENTER = -90`,
which naively implies row 0 is the southernmost. It is **not**: the rows are
written north-up. With south-up every landmark check is wrong — Everest
reads −3469 m, i.e. the ocean south of India. This was caught only by
checking nine known points. The pipeline now flips once and records the fact
in the manifest.

**Isostasy.** Airy: `r = h ρ_c / (ρ_m − ρ_c)`, giving a 19.85 km root for a
5 km plateau. The Bouguer anomaly of perfectly compensated topography must
be zero by construction, and the test asserts it is (< 0.01 mGal).

**Geotherm.** `dT/dz = q/k`; with q = 60 mW/m² and k = 2.5 W/(m·K) this
gives the textbook 24 K/km. The 1300 °C isotherm sits at 53.5 km.

---

## 6. Oceanography — `src/earth/oceanography.js`

**Equation of state.** The full UNESCO 1983 / Fofonoff & Millard (1983)
polynomial, including the IPTS-68 conversion and the complete salinity
pressure term.

**Validation is bit-exact** against the reference `python-seawater`
implementation at ten (S, t, p) points spanning 0–10 000 dbar:

| S | t (°C) | p (dbar) | Computed | Reference |
|---|---|---|---|---|
| 35 | 0 | 0 | 1028.106331 | 1028.106331 |
| 35 | 25 | 0 | 1023.341235 | 1023.341235 |
| 35 | 0 | 4000 | 1046.356132 | 1046.356132 |
| 35 | 0 | 10000 | 1070.958384 | 1070.958384 |
| 0 | 20 | 0 | 998.205329 | 998.205329 |

Error < 1 ppm at every point. **The first implementation was missing the
entire `B` salinity-pressure coefficient series** and returned 1033 instead
of 1071 kg/m³ at 10 000 dbar.

**Other validated quantities.**

| Quantity | Computed | Reference |
|---|---|---|
| Freezing point, S = 35 | −1.922 °C | −1.922 |
| Sound speed, 10 °C, 1000 m | 1491.6 m/s | ≈1500 |
| Coriolis parameter at 30° | 7.2921e−5 s⁻¹ | 7.2921e−5 |
| Inertial period at 30° | 23.93 h | 23.93 |
| Lunar : solar tidal forcing | 2.18 | 2.17 |
| Spring–neap beat period | 14.77 d | 14.77 |
| Significant wave height, U = 10 m/s | 2.14 m | ≈2.1 |
| Greenland sea-level equivalent | 7.42 m | 7.42 |
| West Antarctic | 3.30 m | 3.30 |
| East Antarctic | 53.3 m | 53.3 |

**Documented inconsistency.** The SMB and Pierson–Moskowitz wave
parameterisations have *different* fully-developed asymptotes (0.283 U²/g vs
0.21 U²/g, a 35% difference). Both are published fits to different datasets.
The module returns both and names the disagreement rather than silently
picking one.

---

## 7. Visual vs physical — the honesty boundary

This is the single most important distinction in the project.

### Physically computed and validated

- Gravity, atmosphere, thermodynamics, ocean EOS, terrain statistics
- Day/night terminator: true solar declination and hour angle
- The Earth's oblateness (WGS84 flattening, 1/298.257)
- All data layers on the globe — baked from the same functions the tests call

### Deliberately schematic (labelled in the UI)

| Element | What it is | What it is not |
|---|---|---|
| Surface colours | Biome/altitude model on the DEM | A satellite photograph |
| Hill-shading | Lambertian, fixed light at az 315°, el 45° | The actual sun position |
| Ocean colour | Depth-dependent blend | Measured water-leaving radiance |
| Cloud slider | Reserved; no cloud physics yet | Clouds |
| Night side | Dimmed, not black | Moonlight or airglow |

The surface texture generated by `scripts/build-earth-texture.mjs` carries
`"kind": "schematic surface albedo rendering (NOT a satellite photograph)"`
in its manifest, and a `honesty` field spelling out the difference.

### Why we did not ship a stock Earth photo

We could not verify the provenance or colour-correctness of an arbitrary
image, and an unverifiable photograph in a project whose premise is that the
picture *is* the physics would undermine the whole thing. Generating the
surface from the validated DEM keeps every pixel accountable.

---

## 8. The one-implementation rule

An early version of the renderer recomputed every physical field inside the
fragment shader. That created a second implementation of each model, and the
only thing keeping the two equal was discipline — they had already drifted
(the shader's gravity used a first-order expansion while the JavaScript used
the full Somigliana formula).

**Current design.** Every layer is evaluated by the same JavaScript function
that the probe panel and the unit tests call, baked into a 16-bit texture,
and uploaded once (`src/app/bake.js`). The shader only maps a number to a
colour.

Round-trip error, measured at eight real points on the planet:

| Layer | Worst relative error | Cause |
|---|---|---|
| Temperature | 0.015% | 1 quantisation step |
| Pressure | 0.0007% | 1 quantisation step |
| Density | 0.015% | 1 quantisation step |
| Gravity | 0.0007% | 1 quantisation step |
| Oxygen | 0.0005% | 1 quantisation step |
| Crustal thickness | 0.001% | 1 quantisation step |

There is no residual beyond quantisation, because there is no second model.

---

## 9. Layer ranges are measured, not guessed

Each field layer's normalisation window was derived by scanning the actual
field over the whole DEM. This matters: the first set of ranges was guessed
and silently **clipped** real data — the Everest cell (47.0 kPa) and the
abyssal ocean both fell outside the declared pressure window, so the map
saturated and lied by 15%.

A test now scans 600 × 300 points and asserts no value escapes its range:

```
temperature   [232.29, 300.00]   declared [229,    302]   ok
pressure      [46967.9, 101325]  declared [45500,  102000] ok
density       [0.63, 1.30]       declared [0.62,   1.40]   ok
gravity       [9.76, 9.86]       declared [9.755,  9.862]  ok
elevation     [-10192, 6033]     declared [-10196, 6351]   ok
oxygen        [9.84, 21.23]      declared [9.5,    22.8]   ok
crust         [7.00, 62.95]      declared [5.8,    64.1]   ok
```

(Reproduce with the scan in `tests/fields.test.js` → *no layer clips its
data*.)

---

## 10. What is deliberately *not* built yet

Stated plainly so that absence is never mistaken for completeness.

| Not built | Why | Where it is recorded |
|---|---|---|
| Atmospheric dynamics / wind | Needs a shallow-water or primitive-equation solver; the module currently gives the *static* state | `docs/ATMOSPHERE.md` |
| Cloud physics | Would need a radiative transfer model to justify | `docs/ATMOSPHERE.md` |
| Plate tectonics as a *dynamic* process | Isostasy and crustal thickness are modelled; motion is not | `docs/GEOLOGY.md` |
| **Biology** | Blocked on a precipitation field, which does not exist; the document fixes the interface instead of inventing numbers | **`docs/BIOLOGY.md`** |
| **Ephemerides / lunar theory** | Solar geometry only; tides use a time-averaged equilibrium amplitude | **`docs/ASTRONOMY.md`** |
| Ocean circulation as a GCM | Only the Stommel two-box model and Ekman theory | `docs/OCEANOGRAPHY.md` |
| Quantum treatment of antimatter | Cross-sections are tabulated, not derived from QFT | `docs/CHEMISTRY.md` |
| Mesoscale ocean eddies | Parameterised, not resolved | `docs/OCEANOGRAPHY.md` |
| Multigrid / spectral PDE solvers | SOR and finite differences only | `docs/NUMERICAL_METHODS.md` |
| Web Worker offloading of the bake | The bake blocks the main thread for up to 2.1 s | `docs/SIMULATION_ARCHITECTURE.md` |

The two entries in bold came out of writing their documents: `BIOLOGY.md`
exists and says it is empty, which is more useful than the previous `—`, and
`ASTRONOMY.md` pins exactly where the solar model stops being adequate.

---

## 11. How to verify any claim in this document

```bash
npm test                        # 491 tests
npm run data:elevation          # re-derive the DEM, with its own checks
node scripts/build-earth-texture.mjs
python3 scripts/generate_periodic_table.py
```

Each of those scripts **refuses to write output** that fails its internal
plausibility checks. If a number in this document and a number from the code
ever disagree, the code is authoritative and this document is the bug.
