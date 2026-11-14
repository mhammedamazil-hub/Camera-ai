# DEVELOPMENT LOG

A record of what was built, what broke, and what the breakage taught.
Every entry that says "bug" is a real defect that was found by validation,
not a hypothetical.

Newest entries at the bottom.

---

## Phase 1 — Research

- Established the constant set: CODATA 2018, IAU 2015, IERS 2010, WGS84.
  Each entry in `src/core/constants.js` carries `{ value, unit,
  relUncertainty, exact, source }`, and `validateConstants()` runs checks
  (e.g. R = N_A k_B) at import time so a typo cannot survive module load.
- Decision: **pure ES modules, no bundler magic in the physics.** The whole
  of `src/` outside `src/app/` must run under plain Node so it can be
  unit-tested without a browser.
- Decision: **Float64Array in hot loops**, plain arrays and objects
  everywhere else. Premature typed-array use makes code unreadable and
  gains nothing outside the grids.
- Environment constraint discovered: 2 vCPU, ~3 GB RAM. This caps global
  grids at 2°–5°. It is the single biggest driver of the architecture.

## Phase 2 — Feasibility

- Confirmed three.js 0.187.0 renders a 256×128 sphere with per-pixel
  shader at 60 fps on integrated graphics, so a data-driven surface shader
  is affordable.
- Confirmed the ETOPO1-derived 10′ grid is 4.5 MB as int16 — small enough
  to ship. 1′ would be 466 MB and is not.
- Decided against a WMS/tile server: no network at runtime, and a
  reproducible build matters more than a live feed.

## Phase 3–4 — Architecture and prototypes

- Modular layout fixed: `core/` (constants, math), `physics/`, `chemistry/`,
  `earth/`, `app/`, `data/`, plus `scripts/` for data derivation.
- Prototyped the globe with a stock texture, then discarded the texture (see
  the honesty note in `SCIENCE_MASTER.md` §7).

## Phase 5 — Core planet

### 5.1 Atmosphere

**Bug — geopotential vs geometric height.** The 1976 Standard Atmosphere
tables are parametrised by *geopotential* height
`H = R_eff z / (R_eff + z)` with `R_eff = 6 356 766 m`, not by geometric
altitude. Feeding geometric altitude straight into the layer table gave a
0.36% temperature and **4.4% pressure** error at 47 km. The validation test
compares against the published table at every layer boundary and caught it.
**Lesson:** "geometric" and "geopotential" differ by 11 m at 8.8 km and by
250 m at 47 km; never assume they are interchangeable.

**Bug — Rayleigh cross-section used N_s instead of N_s².** The King factor
and the depolarisation term enter through the square of the
refractive-index structure. Using N_s gave τ(550 nm) = 1.1e−5 instead of
0.0976 — three orders of magnitude — and a sky that would be black.
**Lesson:** a dimensionally-valid formula can still have the wrong
power. Sanity-check against a known optical depth.

**Bug — energy balance fitted εσT⁴.** Fitting an effective emissivity gave
a 306 K surface temperature and a 26 K response to CO₂ doubling. The
physically-defensible form is `σ(T_s − 33 K)⁴` minus the absorbed solar
flux, which lands at 289.01 K and 0.98 K/doubling for the Planck response
alone. **Lesson:** a model that can be tuned to the right answer for the
wrong reason will be.

**Not a bug, documented.** `energyBalanceSteadyState` returns ~1 K per
doubling. That is correct for Planck-only. The 3 K figure requires
feedbacks, which live in `equilibriumWarming`. A future maintainer
"fixing" this would break the physics.

**Bug — dew/frost point inverses used different coefficients from their own
forward equations.** The round-trip error exceeded 0.5 K, and the
assumption that `T_frost > T_dew` at fixed vapour pressure was backwards.
Both fixed; the round trip is now ≤ 0.027 K (dew) and ≤ 0.013 K (frost).

**Bug — composition closure.** IUPAC dry-air mole fractions sum to
1.0000887. Rather than silently rescaling, the module normalises and
*exposes* the residual via `compositionClosureError()`. Molar mass then
comes out at 28.9661 g/mol vs the accepted 28.9647.

### 5.2 Chemistry

**Bug — SEMF alpha Q-value had the wrong sign.** `alphaDecayQ` used the
SEMF binding energy of ⁴He, which is 22.84 MeV, against the experimental
28.2957 MeV. Because ⁴He is doubly magic, the SEMF badly underestimates it,
and the resulting Q was *negative* for real alpha emitters. Fixed by using
the experimental ⁴He mass in the Q-value while keeping the SEMF for heavy
nuclides. Then, on measuring the residual:

| Region | Error |
|---|---|
| A ≥ 232 (U, Th, Am, Cm) | < 0.4 MeV |
| Rn, Ra | up to 2.6 MeV |
| Po daughters | up to 4.8 MeV |

So the function now declares `ALPHA_Q_VALID_RANGE` and refuses to be
trusted below A = 232, providing a 26-nuclide experimental table instead.
**Lesson:** a semi-empirical formula with a known structural blind spot must
carry that blind spot in its API, not in a comment.

**Bug — Weiss K₀ series is ln K₀, not pK₀.** Using `10^(−pK0)` gave ocean
pH 3.5 (a plausible-looking number!) instead of 8.0. Warm water was also
made *more* soluble because the Henry van 't Hoff exponent had the wrong
sign. Both fixed; pH is now 8.02 at 421 ppm, 8.17 at 280 ppm.

**Bug — Geiger–Nuttall constants were guessed.** A guessed pair produced a
slope of 0.29 decades/MeV against a measured ~1.1. Fixed by fitting through
two real chain points (²³⁸U, ²¹⁴Po), giving `a = 165.3, b = −62.85` and
reproducing both half-lives to 1.5%.

### 5.3 Particles and antimatter

**Bug — NIST XCOM units.** The tables are in cm²/g; SI needs m²/kg, a
factor of 0.1. The first implementation also stored one row already in SI,
so the interpolation was inconsistent. Fixed and now verified against four
published points.

**Bug — thermal cross-sections used for a fast assembly.** The criticality
model used σ_f = 585 b (thermal) for a bare metal sphere, which made a 1 cm
sphere look supercritical (k = 1.71). Corrected to fast-group cross-sections;
still over-predicts the critical mass by ~4×, which is the known failure of
one-group diffusion and is now stated in the return value.

**Bug — Bragg–Kleeman coefficient off by 10×.** Proton range at 3 MeV came
out at 0.015 mm instead of 0.14 mm.

**Bug — fission energy breakdown did not sum to 202.5 MeV.** It summed to
203.3. Corrected the delayed component from 0.9 to 0.1 MeV.

### 5.4 Terrain

**Bug — the source DEM is north-up despite its header.** `YLLCENTER = -90`
implies row 0 is southernmost. The rows are actually written north-up.
With the naive reading, Everest reads −3469 m — the Indian Ocean — and the
whole planet is upside down. Caught by checking nine landmarks before
shipping. The pipeline flips once and records `sourceRowOrder` in the
manifest.

**Bug — validating a cell-mean against a point value.** The pipeline
initially asserted `max ≥ 8000 m` to "check Everest". At 10 arc-minutes the
cell containing Everest averages **6033 m**, because the summit is a point
and the cell is a mean. The check was a category error, not a data error.
Replaced with checks appropriate to a cell-mean DEM plus an area-weighted
land-fraction check against the known 29.2%.

**Result.** The shipped grid reproduces ocean volume to +0.46%, mean ocean
depth to +0.08% and land area to −0.18%.

### 5.5 Oceanography

**Bug — infinite recursion in the EOS.** `seawaterDensity` computed the
thermal expansion coefficient by calling `seawaterDensity`, which computed
the coefficient by calling itself. Split into a raw polynomial and a
coefficient wrapper.

**Bug — the secant bulk modulus was missing an entire coefficient series.**
The UNESCO polynomial's `B` term (the `−9.9348e−7, 2.0816e−8, 9.1697e−10`
series) was absent, and the salinity pressure term was misplaced. At
10 000 dbar the model returned 1033 kg/m³ instead of 1071. Fixed by
transcribing equations 13–19 directly and verifying bit-for-bit against the
`python-seawater` reference at ten points.

**Bug — Pierson–Moskowitz coefficient off by 10×** (0.0246 instead of
0.21), giving 0.25 m waves at 10 m/s instead of 2.1 m.

**Not a bug — SMB and PM disagree.** Their fully-developed asymptotes are
0.283 U²/g and 0.21 U²/g, a genuine 35% disagreement between published
parameterisations. Documented, and both are exposed.

### 5.6 The globe

**Architectural bug — two implementations of every physical model.** The
first shader recomputed fields in GLSL, duplicating the JavaScript. They
had already drifted (the shader used a first-order gravity expansion, the
JS used Somigliana). Fixed by baking every layer on the CPU with the *same*
function the tests call, so there is one implementation. Round-trip error is
exactly one quantisation step.

**Bug — DataTexture row order.** A loaded PNG texture needs flipping;
a `DataTexture` has `flipY = false` and must not be. Applying the PNG rule
put the north pole at the south. Settled by reading
`node_modules/three/src/geometries/SphereGeometry.js` rather than guessing:
`uv = (u, 1 − v)` puts the texture's v = 0 row at the south pole.

**Bug — mirror-symmetric longitude inversion.** `atan2(-p.z, -p.x)` instead
of `atan2(-p.z, p.x)` reports Kerala at 75.9° W. A sign error in a
convention does not throw and does not produce a NaN — it produces a
plausible planet with the wrong geography. Three such tests now exist in
`tests/geometry-conventions.test.js`.

**Bug — bathymetry fed to the atmosphere as altitude.** The ocean's DEM
value is a depth, not an elevation. Using it in the barometric formula put
the sea surface at 107 kPa over the abyssal plain and warmed the deep ocean
to 330 K.

**Bug — guessed colormap ranges clipped real data.** The pressure window
excluded the Everest cell (47.0 kPa), so the map saturated and lied by 15%
at exactly the place a user is most likely to look. Ranges are now measured
by scanning the real field, and a test asserts nothing escapes.

**Bug — property-name mismatch.** `standardAtmosphere` returns
`{ T, p, rho }`, but the probe panel read `{ temperature, pressure,
density }`, silently producing `undefined` and `NaN` in the HUD.

---

## Phase 6 — where the project stands

Complete and validated: constants, mathematics, gravity, thermodynamics,
atmosphere, particles/antimatter, elements, thermochemistry, terrain,
oceanography, field layers, globe renderer.

**419 tests passing.**

Next, in priority order:

1. Atmospheric dynamics (shallow-water or primitive equations on a
   spherical grid) — this is what turns a static field into a simulation.
2. `CHEMISTRY.md`, `GEOLOGY.md`, `BIOLOGY.md`, `ASTRONOMY.md`,
   `MATHEMATICS.md`, `NUMERICAL_METHODS.md`, `SIMULATION_ARCHITECTURE.md`,
   `LIMITATIONS.md`, `RESEARCH_SOURCES.md`, `PERIODIC_TABLE.md`.
3. A time-stepped climate model wired to the existing energy balance.
4. Geomorphology: erosion and uplift, so the terrain can *evolve*.
