# LIMITATIONS

> A model that does not state where it fails is not a scientific model.
> This file lists every known limitation, with the size of the resulting
> error wherever it has been measured.

Each entry says: **what** is limited, **how big** the error is, and **what
you should do instead** if the error matters for your use.

---

## 1. Structural limitations (the simulation cannot do these at all)

| Not modelled | Consequence | Workaround |
|---|---|---|
| Atmospheric **dynamics** (wind, advection, storms) | All atmospheric fields are *static* functions of position. There is no weather and no time-evolution of the atmosphere. | Use `src/physics/atmosphere.js` for the static state; there is no dynamic alternative yet. |
| **Navier–Stokes** anywhere (ocean or air) | Ocean currents are not computed from momentum balance. | Ekman and geostrophic *diagnostics* exist; they are not integrated in time. |
| **Cloud physics** and radiative transfer | Clouds are a UI slider with no physical effect. The cloud radiative effect (~−25 W/m² net) is absent from the energy balance. | Treat the EBM as a clear-sky model. |
| **Plate motion** | Isostasy and crustal thickness are modelled as an equilibrium; plates do not move and continents do not drift. | — |
| **Biology** | No ecology, no photosynthesis as a dynamic flux, no biosphere feedback. | — |
| **Hydrological cycle** | No evaporation–precipitation loop, no river routing, no groundwater. | — |
| **Magnetic field** | No geodynamo, no magnetosphere, no aurora. | — |
| **Atmospheric chemistry** | No ozone chemistry, no photolysis, no aerosol microphysics. | — |

---

## 2. Measured errors, with numbers

### 2.1 Gravity
- **WGS84 vs IERS GM mismatch.** The Somigliana constants use WGS84's GM
  while `EARTH.GM` is the IERS 2010 value. The two differ at the 1e−9 level,
  producing a residual of a few milligal in normal gravity. **This is a
  definitional difference, not a numerical error.** Tests are intentionally
  not tightened past it.
- **No terrain correction.** The Bouguer anomaly ignores the attraction of
  local topography; for a mountain the size of Everest that is tens of
  milligal.
- **Spherical harmonic truncation** at degree `nmax` (default 4). Higher
  degrees matter at the few-mGal level for precise orbits.

### 2.2 Atmosphere
- **ISA is a standard atmosphere, not the real one.** It has no seasonal
  or latitudinal variation, no weather, and is only defined 0–86 km
  (extension above that is flagged).
- **Rayleigh optical depth is −0.8% at 550 nm** (0.09680 vs 0.0976). The
  residual is in the King-factor treatment.
- **Grey-band OLR is −1.0%** (234.4 vs 236.7 W/m²).
- **Energy balance gives 0.98 K per CO₂ doubling, not 3 K.** This is
  *correct for a Planck-only model*. The 3 K figure requires water-vapour,
  ice-albedo and lapse-rate feedbacks; `equilibriumWarming` adds a lumped
  −1.2 W m⁻² K⁻¹ and gives 3.09 K, but that number is *prescribed*, not
  derived. Do not cite it as an independent result.
- **Composition closure residual 8.87e−5.** IUPAC's published mole
  fractions do not sum to exactly 1. This is normalised, not hidden.
- **No greenhouse gas optics.** CO₂ is a scalar in a grey-band model, not a
  spectral line-by-line calculation.

### 2.3 Chemistry
- **SEMF binding energy is good to ~0.6% for ⁵⁶Fe but much worse
  elsewhere.** B(⁵⁶Fe) = 495.4 MeV vs 492.25 measured; B(⁴He) = 22.84 vs
  28.296, a 19% error caused by doubly-magic shell closure.
- **Alpha decay Q-values are only trustworthy for A ≥ 232.**
  - A ≥ 232: error < 0.4 MeV
  - Rn/Ra: up to 2.6 MeV
  - Po daughters: up to 4.8 MeV (²¹⁴Po: 3.05 vs 7.833 measured)
  Below A = 232 use `ALPHA_Q_EXPERIMENTAL_MEV`.
- **The valley of stability is offset by ~0.8 nucleons.** `stableZForA(56)`
  returns 25.15 vs the true 26. This is the known SEMF pairing/asymmetry
  tension. It is documented and was **not** tuned away.
- **Thermochemistry assumes ideal gases and neglects heat capacity in some
  paths.** The Gibbs–Helmholtz correction uses a constant ΔCp.
- **Adiabatic flame temperatures ignore dissociation.** CH₄/air gives
  2000–3200 K in the model against a real 2223 K, because endothermic
  dissociation of CO₂ and H₂O above ~2000 K is not modelled.
- **Ocean pH uses a simplified carbonate system**: no borate alkalinity, no
  explicit DIC equilibration with the atmosphere, no riverine input.
  Absolute pH is good to ~0.05; *changes* are more reliable than absolutes.

### 2.4 Particles and antimatter
- **One-group diffusion criticality over-predicts the bare critical mass
  by ~4×.** This is the documented failure of one-group theory for small,
  high-leakage assemblies. The function returns a `calibrationNote`.
  A quantitative criticality calculation requires multigroup or Monte Carlo.
- **Cross-sections are interpolated tables, not derived from QFT.**
- **Hadronisation is not modelled.** p+p̄ annihilation yields a pion count
  and energy split from PDG averages; individual hadrons are not generated.
- **Neutrino transport is absent.** Neutrino energy is tracked as a loss
  term and escapes at c.
- **Klein–Nishina is for a free electron in the ultra-relativistic limit**
  and ignores atomic binding (relevant below ~10 keV).

### 2.5 Terrain
- **10 arc-minute resolution.** A cell is 18.6 km at the equator. Everest's
  cell averages 6033 m; the summit is 8848 m. **Feature smaller than ~20 km
  does not exist in this dataset.**
- **No regional detail.** Any detail below 10′ presented in the UI is
  procedural and labelled as such.
- **Ice-surface, not bed.** The `_ice_` variant represents Greenland and
  Antarctica as ice surfaces. Subglacial topography is not present.
- **Coastline length is a resolution-limited lower bound.** The reported
  value (~700 × 10⁶ m) is raster-dependent; real coastlines are fractal with
  a Richardson exponent of ~1.25.
- **Isostasy is a two-layer equilibrium.** It ignores flexural rigidity,
  which matters within ~100 km of a load.

### 2.6 Oceanography
- **UNESCO EOS-80, not TEOS-10.** TEOS-10 is the current standard and
  differs from EOS-80 by up to 0.03 kg/m³ in the deep ocean. EOS-80 was
  chosen because its reference implementation is freely verifiable.
- **Mixed-layer depth is a scaling, not a model.** With weak forcing the
  Pollard–Rhines–Turner form saturates against the 10 m clip. That is the
  closure saying it does not apply, and it is not tuned.
- **SMB and Pierson–Moskowitz disagree by 35% in the fully-developed
  limit.** Both are published; both are returned.
- **Equilibrium tides are ~0.27 m.** Real open-ocean tides are amplified by
  basin resonance to ~0.5–1 m; coastal tides to 10 m+ (Bay of Fundy). None
  of that amplification is modelled.
- **Stommel's two-box model** is a qualitative bistability demonstration,
  not a prediction of AMOC behaviour.
- **Sea-level ice-sheet fractions are back-calculated from IPCC AR6
  equivalents**, so they agree with IPCC by construction and are not
  independent estimates.

### 2.7 Visualisation
- **Surface colour is schematic.** It is a biome/altitude model applied to
  the DEM, not measured radiance or a satellite photograph.
- **Hill-shading uses a fixed light** (azimuth 315°, elevation 45°) that
  does not follow the real sun.
- **Ocean colour encodes depth**, which is a deliberate analytic choice;
  real water-leaving radiance depends on chlorophyll, sediment and viewing
  geometry.
- **Colormaps interpolate in sRGB**, which is not perceptually uniform.
  Viridis or a similar map would be better and is noted as future work.
- **Layer opacity is 86%** so terrain remains visible underneath, which
  means the displayed colour is a blend and not the pure colormap value.
  Read the numeric value from the probe, not from the colour.
- **No atmospheric refraction, no limb darkening, no sun glint.**
- **Point light source.** The real Sun subtends 0.53°, softening the
  terminator by about ±16 km of ground distance; we approximate with a
  smoothstep.

---

## 3. Numerical limitations

- **Grid resolution** is capped by the environment (2 vCPU, 3 GB) at
  2°–5° global for anything time-stepped. The 10′ DEM is display data, not
  simulation resolution.
- **Hypsometry integrates a 100 m elevation histogram**, so the reported
  ocean volume has a quantisation error of ~0.02%.
- **16-bit layer encoding**: one quantisation step per layer, measured at
  ≤ 0.016% (see `SCIENCE_MASTER.md` §8).
- **Baking is synchronous** and costs 90 ms – 2.1 s. The UI yields one
  frame before starting so it does not appear frozen, but it is not
  off-thread.
- **Integrators**: RK4 and Cash–Karp for ODEs, Verlet/Yoshida for
  conservative systems. None is symplectic across a discontinuity (there is
  no event handling).

---

## 4. Data limitations

- **ETOPO1 provenance.** The shipped grid is a 10′ derivative mirrored from
  `g2e/etopo10` (MIT). The upstream data is NOAA ETOPO1, US public domain.
  The mirror's processing script was not audited; our pipeline independently
  validates the result against known geography and the 29.2% land fraction.
- **`mendeleev` and `periodictable` are third-party.** Their values trace to
  CRC/IUPAC/AME2020, but we did not re-derive them from primary sources.
- **Coverage gaps in the element dataset are real, not filled.** 21 elements
  lack a melting point, 52 lack thermal conductivity. Those fields are
  `null` and rendering code must handle them.

---

## 5. What would change these answers

Ordered by how much a fix would improve fidelity per unit of effort:

1. **Atmospheric dynamics** — the single biggest gap. Everything else in the
   atmosphere module is a static snapshot.
2. **Multigroup criticality** if the nuclear results are to be used
   quantitatively.
3. **TEOS-10** instead of EOS-80 for the ocean.
4. **Spectrally-resolved radiation** instead of a grey band, which would let
   the CO₂ response be derived rather than prescribed.
5. **Symplectic integrators with event detection** for long orbital
   integrations.
6. **Perceptually-uniform colormaps** and off-thread baking.
