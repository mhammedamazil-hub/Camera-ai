# GEOLOGY

**Module:** `src/earth/terrain.js` (475 lines) ·
**Tests:** `tests/terrain.test.js` (47) · **Status:** validated (equilibrium only)

---

## 1. Principle

The solid Earth enters the simulation as **topography and its supporting
structure**. Three things are modelled:

1. **The measured surface** — a validated 10 arc-minute DEM.
2. **Isostasy** — why the continents float, and how thick the crust under a
   mountain must be.
3. **Pressure, temperature and strength** in the crust — the quantities that
   make the subsurface a physical place rather than a number.

Plate motion is **not** modelled. The continents do not drift. What is
modelled is the equilibrium state that a given topography implies.

## 2. Equations

### 2.1 Airy isostasy

A crustal column of density ρ_c floating on mantle of density ρ_m:

```
r = h · ρ_c/(ρ_m − ρ_c)
```

With ρ_c = 2700, ρ_m = 3380: **r = 3.97 h**. A 5 km plateau sits on a
19.85 km root.

### 2.2 Pratt isostasy

Lateral density variation at a compensation depth D:

```
ρ = ρ₀ D/(D + h)
```

Under Tibet (h = 5 km, D = 30 km, ρ₀ = 2700) this predicts
**ρ = 2314 kg/m³** against the standard 2700 — a density deficit of ~390
kg/m³, which is what is observed (Tibet is underlain by warm, anomalously
low-density crust).

### 2.3 Recovering elevation from crustal thickness

```
h = (H − H₀)(ρ_m − ρ_c)/ρ_c
```

with H₀ = 39 km (CRUST1.0 continental mean).

### 2.4 Bouguer and free-air corrections

```
Bouguer slab:    Δg = 2πGρh
Root term:       Δg = −2πG(ρ_m − ρ_c)r
Free air:        Δg = −2g h/R    ≈ −0.3086 mGal/m
```

Perfect Airy compensation makes the two Bouguer terms cancel **exactly**,
which is a strong internal consistency check (see §7).

### 2.5 Lithostatic pressure

```
p(z) = Σ ρ_i g Δz_i
```

over a layered crust: sediment 2300, upper crust 2700, lower crust 3000,
mantle lithosphere 3350 kg/m³.

### 2.6 Conductive geotherm

```
dT/dz = q/k
```

with q = 60 mW/m² (continental) or 100 mW/m² (oceanic) and k = 2.5 W/(m·K):

- Continental: **24 K/km** (the textbook value)
- Oceanic: **40 K/km**

The 1300 °C isotherm (base of the mechanical lithosphere) sits at **53.5 km**
for continental heat flow.

### 2.7 Rock strength

Byerlee's law:

```
τ = 0.85 σ_n            σ_n < 200 MPa
τ = 50 + 0.6 σ_n        σ_n ≥ 200 MPa
```

Brittle–ductile transition depth:

```
z = σ_y/(ρg)
```

For a 300 MPa yield strength and ρ = 2700: **11.3 km**, matching the observed
12–15 km for quartz-rich crust.

### 2.8 Erosion

Stream-power incision (Howard & Kerby):

```
E = K A^m S^n,   m ≈ 0.5, n ≈ 1
```

Hillslope diffusion:

```
∂z/∂t = D ∇²z,   D ≈ 5e−3 m²/yr (soil-mantled)
```

## 3. The dataset

| Property | Value |
|---|---|
| Source | NOAA ETOPO1 derivative (10 arc-min, ice surface) |
| Grid | 2161 × 1081 int16 |
| Cell size | 1/6° = 18.6 km at the equator |
| Encoding | int16 little-endian, metres |
| Size | 4.5 MB |
| Row order | south-up (canonicalised by the pipeline) |

### Validation of the whole-planet integrals

| Quantity | From the grid | Known value | Error |
|---|---|---|---|
| Total surface area | 5.1202e8 km² | 5.1007e8 (WGS84) | +0.38% |
| Ocean volume | 1.3411e18 m³ | 1.335e18 | **+0.46%** |
| Mean ocean depth | 3691 m | 3688 | **+0.08%** |
| Land area | 148.67e6 km² | 148.94e6 | **−0.18%** |
| Area-weighted land fraction | 28.97% | 29.2% | −0.23 pp |
| Max cell-mean elevation | 6033 m | (Everest cell) | — |
| Min elevation | −10 192 m | ETOPO1 min −10 698 | — |

## 3b. Units and constants

| Quantity | Value | Unit |
|---|---|---|
| ρ continental crust | 2700 | kg/m³ |
| ρ oceanic crust | 2900 | kg/m³ |
| ρ mantle | 3380 | kg/m³ |
| ρ water | 1000 | kg/m³ |
| Continental crust thickness (mean) | 39 000 | m |
| Oceanic crust thickness (mean) | 7 000 | m |
| Mean surface heat flow | 0.095 | W/m² |
| Continental heat flow | 0.060 | W/m² |
| Oceanic heat flow | 0.100 | W/m² |
| Crustal thermal conductivity | 2.5 | W m⁻¹ K⁻¹ |
| Mantle potential temperature | 1 585 | K |
| Cell size | 1/6° = 18.6 km | — |

## 3c. Assumptions

1. **Static equilibrium.** Isostasy holds instantaneously; no flexure, no
   viscoelastic relaxation.
2. **Two-layer Airy.** Crust of uniform density over a uniform mantle. Real
   crust is layered and laterally variable.
3. **No flexural rigidity.** Matters within ~100 km of a load; a seamount's
   Bouguer anomaly is therefore not zero even when compensated.
4. **1-D conductive geotherm.** No advection, no hydrothermal circulation, no
   radiogenic heat production gradient.
5. **Constant density with depth** within each crustal layer.
6. **No erosion in time.** Stream-power and hillslope laws are exposed as
   functions but are not integrated.

## 3d. Numerical implementation

- `ElevationGrid` is a thin wrapper over an `Int16Array`; lookups are
  nearest-cell (`valueAt`) because interpolating between 18.6 km cells would
  invent detail the data does not contain.
- `hypsometry` builds a 100 m elevation histogram (exact for integer
  elevations) rather than sorting 2.3 M values — 41 ms instead of ~1 s.
- Cell areas are computed from the **exact** WGS84 ellipsoid area element,
  integrated analytically over the cell's latitude edges.
- `landAreaCheck` and `coastlineLength` integrate over the grid with
  cos(latitude) area weighting.
- The pipeline (`scripts/build-elevation-mips.mjs`) **refuses to write
  output** that fails its own plausibility checks.

## 4. The three row-order bugs, and why they matter

This is the most instructive episode in the project, because **three
independent convention errors each produced a plausible-looking planet with
the wrong geography.** None threw an exception.

1. **The source DEM is north-up despite `YLLCENTER = -90`.** With the naive
   reading, Everest reads −3469 m — the Indian Ocean. Caught by checking
   nine landmarks. The pipeline now flips once and records
   `sourceRowOrder: 'NORTH-UP'` in the manifest.
2. **A `DataTexture` must not be flipped like a loaded PNG.** `flipY` is
   `false` for `DataTexture`, and three.js puts `uv.v = 0` at the south
   pole. Applying the PNG rule put the north pole at the south.
3. **A mirror-symmetric longitude inversion** reported Kerala at 75.9° W.

All three now have regression tests in
`tests/geometry-conventions.test.js`.

## 5. A category error worth recording

The pipeline originally asserted `max ≥ 8000 m` to "validate Everest". At
10 arc-minutes the cell containing Everest **averages 6033 m**, because the
summit is a point and the cell is a mean. The check was wrong, not the data.
It was replaced with checks appropriate to a cell-mean DEM plus an
area-weighted land-fraction test against the known 29.2%.

**Lesson:** always compare a quantity against a reference of the *same kind*.
A cell mean and a point sample are different measurements.

## 6. Inputs and outputs

| Function | In | Out |
|---|---|---|
| `elevationGridFromBuffer(buf, meta)` | ArrayBuffer | `ElevationGrid` |
| `grid.valueAt(lat, lon)` | degrees | metres (nearest cell) |
| `hypsometry(grid)` | — | areas, volume, hypsometric curve |
| `airyRoot(h)` / `elevationFromThickness(H)` | m | m |
| `bouguerAnomaly(h)` | m | mGal |
| `lithostaticPressure(z)` | m | Pa |
| `crustalTemperature(z, q)` | m, W/m² | K |
| `byerleeLaw(σ_n)` | MPa | MPa |
| `streamPowerIncision(A, S)` | m², — | m/yr |

## 7. Validation

| Test | Result |
|---|---|
| Airy root of a 5 km plateau | 19.85 km |
| Bouguer anomaly of compensated topography | `< 0.01 mGal` (exactly zero by construction) |
| `elevationFromThickness(airyRoot(h) + H₀)` | returns h to 1e−6 |
| Free-air correction | −307.9 mGal/km (expected −308.6) |
| Lithostatic pressure at 10 km | **0.253 GPa** (3 km sediment + 7 km upper crust) |
| Pressure at the Moho (39 km) | **1.091 GPa** |
| Continental geotherm | 24.0 K/km |
| Oceanic geotherm | 40.0 K/km |
| 1300 °C isotherm | 53.5 km (45–65 expected) |
| Byerlee continuity at 200 MPa | jump < 0.1 MPa |
| Brittle–ductile transition | 11.3 km |
| Stream-power incision (A=1e8, S=0.01) | 1e−4 m/yr |
| Coastline lower bound | 701e6 m at 10′ |
| Grid rejects a wrong-length buffer | throws |

### On the coastline number

701 × 10⁶ m is a **resolution-limited lower bound**, not the coastline
length. Coastlines are fractal with a Richardson exponent of ~1.25, so the
measured length grows without bound as resolution increases. The module
reports `resolutionDeg` alongside it so the number cannot be quoted as
absolute.

## 8. Computational cost

| Operation | Cost |
|---|---|
| Grid load (2161×1081 int16) | ~15 ms |
| `hypsometry` (full grid, area-weighted) | **41 ms** |
| `coastlineLength` | 19 ms |
| `landAreaCheck` | 28 ms |
| `valueAt` | ~40 ns |

The hypsometry is fast because it uses a 100 m histogram over the integer
elevations rather than sorting 2.3 million values.

## 9. Limitations

- **10′ resolution.** Features below ~20 km do not exist.
- **Ice surface, not bedrock.** Subglacial topography is absent.
- **Isostasy is static equilibrium.** No flexure, no viscoelastic
  relaxation, no erosion–uplift feedback in time.
- **No plate motion, no mantle convection, no geodynamo.**
- **Geotherm is conductive and 1-D.** No advection, no hydrothermal
  circulation.
- **Isostasy ignores flexural rigidity**, which matters within ~100 km of a
  load (the "Bouguer anomaly" of a seamount is not zero).

## 10. Sources

Amante & Eakins (2009) ETOPO1 · Airy (1855) · Turcotte & Schubert (2014) ·
Byerlee (1978) · Jaupart & Mareschal (2011) · Laske et al. (2013) CRUST1.0 ·
Howard & Kerby (1983) · Davies & von Blanckenburg (1995).

See `RESEARCH_SOURCES.md`.
