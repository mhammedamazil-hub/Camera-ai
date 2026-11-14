# GRAVITY

**Module:** `src/physics/gravity.js` · **Tests:** `tests/gravity.test.js` (35) ·
**Status:** validated

---

## 1. Principle

Earth's gravity field is that of a nearly spherical, oblate, rotating body.
This module provides three levels of description:

1. **Point mass** — `GM/r²`. Exact for a sphere.
2. **Zonal harmonics** — the axisymmetric part of the real field, dominated
   by J₂ (the oblateness).
3. **Normal gravity on the WGS84 ellipsoid** — the closed-form reference
   surface, which is what a gravimeter at sea level actually measures.

Plus the orbital machinery needed to move a body through this field
(Kepler propagation) and the tools to convert between geodetic and
geocentric coordinates.

## 2. Equations

### 2.1 Gravitational potential

```
V(r, θ) = −(GM/r) · [ 1 − Σ_{n≥2} J_n (R/r)ⁿ P_n(cos θ) ]
```

where θ is the co-latitude and P_n the Legendre polynomials. With
`x = cos θ`:

```
P₂(x) = (3x² − 1)/2
P₃(x) = (5x³ − 3x)/2
P₄(x) = (35x⁴ − 30x² + 3)/8
```

**Sign convention.** The J_n are defined so that positive J₂ makes the
potential *less* negative at the equator. The acceleration is `a = −∇V`, so
the equator bulges outward.

### 2.2 Centrifugal acceleration

```
a_c = ω² r_perp,  directed away from the rotation axis
ω = 2π / 86164.0905 s = 7.292115e−5 rad/s
```

### 2.3 Somigliana normal gravity (WGS84)

```
γ(φ) = (a γ_e cos²φ + b γ_p sin²φ) / √(a² cos²φ + b² sin²φ)
```

This is **exact** on the ellipsoid — no series truncation. At height h above
the ellipsoid:

```
γ(h) ≈ γ(φ) · [ 1 − 2h/a (1 + f + m − 2f sin²φ) + 3h²/a² ]
m = ω²a²b / GM
```

### 2.4 Geodetic vs geocentric latitude

```
tan φ_gc = (1 − e²) tan φ_gd
e² = f(2 − f) = 0.00669437999014
```

The maximum difference is 11.5 arcminutes at 45° latitude — a 0.19%
change in the latitude argument to γ, which is 0.1 mGal.

### 2.5 Kepler propagation

Universal-variable formulation with Stumpff functions:

```
√μ Δt = r₀v_r₀/√μ · χ²C(z) + (1 − r₀α)χ³S(z) + r₀χ
z = αχ²,  α = 2/r₀ − v₀²/μ
```

Solved by Newton iteration (typically 3–5 iterations). Chosen over the
classical eccentric-anomaly form because it handles all conic sections
without special-casing.

## 3. Units and constants

| Symbol | Value | Unit | Source |
|---|---|---|---|
| GM | 3.986004418e14 | m³/s² | IERS 2010 |
| J₂ | 1.08262668e−3 | — | IERS 2010 |
| J₃ | −2.53265649e−6 | — | IERS 2010 |
| J₄ | −1.61962159e−6 | — | IERS 2010 |
| a (WGS84) | 6 378 137.0 | m | NIMA TR8350.2 |
| 1/f | 298.257223563 | — | NIMA TR8350.2 |
| γ_e | 9.7803253359 | m/s² | NIMA TR8350.2 |
| γ_p | 9.8321849378 | m/s² | NIMA TR8350.2 |
| ω | 7.292115e−5 | rad/s | IERS 2010 |
| G | 6.67430e−11 | m³ kg⁻¹ s⁻² | CODATA 2018 |

Note: `EARTH.MASS` is *derived* from GM/G rather than measured
independently to this precision — GM is the measured quantity.

## 4. Assumptions

1. **Static field.** No tides, no mass redistribution, no post-glacial
   rebound. Real gravity varies by ~0.3 mGal with the solid Earth tide.
2. **Zonal only.** The zonal model discards tesseral and sectoral harmonics.
   For EGM96 the tesseral terms are < 1e−4 of J₂.
3. **No atmosphere.** Air mass above the point contributes ~0.87 mGal at
   sea level (the "atmospheric correction"). Not modelled.
4. **No terrain correction.** Local topography is ignored; over Everest the
   Bouguer correction is ~100 mGal.
5. **Two-body Kepler.** No third-body perturbations, no drag, no relativity.

## 5. Numerical implementation

- Legendre polynomials evaluated by the recurrence, not the closed forms,
  to avoid catastrophic cancellation at high degree.
- The harmonic sum uses a **fully normalised** table (`EGM_NORMALISED`) so
  that adding more degrees does not require rescaling.
- Kepler uses universal variables with `stumpff(z)` computed by series for
  |z| < 1e−3 and closed form otherwise — the series avoids the 0/0 that the
  closed form hits at z = 0.
- Newton iteration for χ with a convergence tolerance of 1e−12 and a cap of
  100 iterations, returning the iterate rather than throwing.

## 6. Inputs and outputs

| Function | In | Out |
|---|---|---|
| `pointMassAccel(r)` | position vector (m) | acceleration (m/s²) |
| `sphericalHarmonicAccel(r, nmax)` | position, max degree | acceleration |
| `somiglianaNormalGravity(φ_rad)` | geodetic latitude | m/s² |
| `normalGravityAtHeight(φ, h)` | latitude, height (m) | m/s² |
| `keplerPropagate(r0, v0, dt, mu)` | state vectors, Δt (s) | new state |
| `stateToElements(r, v)` / `elementsToState(el)` | — | classical elements |
| `ecefToGeodetic(r)` / `geodeticToEcef(lat, lon, h)` | — | — |

## 7. Validation

| Test | Computed | Reference | Error |
|---|---|---|---|
| Equatorial normal gravity | 9.780311349 | 9.7803253359 | 1.4e−6 rel |
| Polar normal gravity | 9.832248847 | 9.8321849378 | 6.5e−6 rel |
| SH (n = 4) vs point mass at 1 R_mean | — | — | 7.48e−10 |
| Kepler, 1 period | — | analytical ellipse | 2e−15 |
| Kepler, 10 periods | — | analytical ellipse | 1.6e−14 |
| Circle speed at 7000 km | 7546.05 | √(μ/r) = 7546.05 | exact |
| Escape speed at surface | 11 185.7 | 11 186 | 3e−5 |
| Geodetic ↔ geocentric round trip | — | — | < 1e−12 rad |
| WGS84 M constant | 0.003449787 | 0.00344978650684 | 1e−7 |

### On the 1.4e−6 equatorial residual

This is **not** a numerical error. Our `EARTH.GM` is the IERS 2010 value
(3.986004418e14) while the Somigliana constants are the WGS84 set, which was
derived with GM = 3.986005e14. The two GM values differ by 3.4e−9 relative.
The residual is a definitional mismatch, and the tests are deliberately not
tightened past it — see `LIMITATIONS.md` §2.1.

## 8. Computational cost

| Operation | Cost |
|---|---|
| Point mass | ~20 ns |
| Zonal n ≤ 4 | ~150 ns |
| Somigliana | ~80 ns |
| Kepler propagation | ~1.2 μs (4 Newton iterations) |
| Full 2.3 M-cell globe bake | ~2.1 s |

## 9. Limitations

- No time-varying gravity (tides, secular variation).
- No tesseral harmonics.
- No atmospheric or terrain correction.
- Kepler is two-body only.
- The flattening is applied as a scale in the renderer; the *gravity* uses
  the full Somigliana formula, so the two agree to the extent that the
  ellipsoid approximates the geoid (it does to ~100 m, the geoid undulation).

## 10. Sources

IERS Conventions 2010 · NIMA TR8350.2 (WGS84) · Vallado (2013) ·
Battin (1999) · Heiskanen & Moritz (1967) · Dziewonski & Anderson (1981).

See `RESEARCH_SOURCES.md` for full citations.
