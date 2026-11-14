# OCEANOGRAPHY

**Module:** `src/earth/oceanography.js` (588 lines) ·
**Tests:** `tests/oceanography.test.js` (60) · **Status:** validated

---

## 1. Principle

The ocean is modelled at three levels: an accurate **equation of state**
(pure thermodynamics), **diagnostic dynamics** (geostrophy, Ekman, waves,
tides — relationships you can evaluate at a point but that are not
integrated in time), and **box models** for the slow global circulation and
carbon uptake.

This is a deliberate boundary. A full primitive-equation GCM would be the
right tool for a *forecast*; it is the wrong tool for a simulation that must
run at interactive speed on two CPU cores. The diagnostics capture the
scales that matter for a globe (western boundary currents, upwelling,
thermohaline structure) without pretending to resolve eddies.

## 2. What is *not* modelled

Stated up front because it bounds every claim below:

- No velocity field is integrated in time. There is no prognostic current.
- No mesoscale eddies (the Rossby radius is 10–100 km; we cannot resolve it).
- No sea ice thermodynamics.
- No biogeochemistry beyond inorganic carbon.
- No coastal or estuarine dynamics.

## 3. Equations

### 3.1 UNESCO 1983 equation of state (EOS-80)

```
ρ(S,t,p) = ρ₀(S,t) / (1 − p/K(S,t,p))
```

with `ρ₀` the Millero–Poisson one-atmosphere density and `K` the secant bulk
modulus. Both are large polynomials; they are transcribed in full in the
module with equation numbers. The two things people get wrong:

- **Temperature scale.** The coefficients assume IPTS-68. Input is ITS-90, so
  `T68 = 1.00024 · T90` must be applied first. A 0.24 K discrepancy is
  ~0.04 kg/m³.
- **Pressure units.** `p` in the density equation is in **bar**, while the
  oceanographic convention is dbar. `p_bar = dbar/10`.

### 3.2 Secant bulk modulus

```
K = K₀ + (A + B·p)·p
K₀ = K_W + (54.6746 + … + (7.944e−2 + …)·√S)·S
A  = A_W + (2.2838e−3 + … + 1.91075e−4·√S)·S
B  = B_W + (−9.9348e−7 + …)·S
```

**The `B` series was entirely missing in the first implementation**, which
made 10 000 dbar read 1033 kg/m³ instead of 1071.

### 3.3 Freezing point (UNESCO)

```
T_f = −0.0575 S + 1.710523e−3 S^1.5 − 2.154996e−4 S² − 7.53e−4 p
```

At S = 35, p = 0: **−1.922 °C**. This is why polar oceans stay liquid below
0 °C and why sea ice is fresher than the water it froze from.

### 3.4 Coriolis, geostrophy, Ekman

```
f = 2Ω sin φ
u_g = −(g/f) ∂η/∂y,   v_g = (g/f) ∂η/∂x
M_E = τ/(ρf),  90° right of the wind in the NH, left in the SH
w_E = curl(τ/(ρf))
L_R = c/f,  c = √(g′H)
```

### 3.5 Waves

```
Deep water:    c = √(gλ/2π)
Finite depth:  c = √((g/k)·tanh(kh))
Pierson–Moskowitz:  H_s = 0.21 U²/g,  T_p = 2πU/(0.877 g)
SMB (fetch F):      H_s = 0.283 (U²/g) tanh[0.0125 (gF/U²)^0.42]
```

### 3.6 Tides

Equilibrium tide amplitude for a perturber of mass M at distance r:

```
ζ = (3/4) a (M/M⊕) (a/r)³
```

Lunar/solar forcing ratio:

```
(M_moon/M_sun)(r_sun/r_moon)³ = 2.17
```

### 3.7 Stommel two-box overturning

```
q = k·[ρ₀(α ΔT − β ΔS)]
```

Two stable equilibria exist depending on the freshwater forcing: a thermal
mode (poleward surface flow, the present AMOC) and a haline mode (reversed).

### 3.8 Air–sea fluxes and sea level

```
H_sensible = ρ_a c_p C_H U (T_s − T_a)
C_mixed = ρ c_p h
Δζ_steric = α ΔT h
```

## 4. Units and constants

| Quantity | Value | Unit |
|---|---|---|
| Mean salinity | 34.7 | PSU |
| Reference density (0 °C, S=35, p=0) | 1028.106 | kg/m³ |
| Specific heat c_p | 3985 | J kg⁻¹ K⁻¹ |
| Mean mixed-layer depth | 60 | m |
| Mean ocean depth | 3688 | m |
| Ocean volume | 1.335e18 | m³ |
| Ocean area | 3.619e14 | m² |
| Thermal expansion α (10 °C) | 1.67e−4 | K⁻¹ |
| Haline contraction β | 7.6e−4 | PSU⁻¹ |
| M₂ period | 12.4206 | h |
| S₂ period | 12.0 | h |
| AMOC transport (RAPID) | 17.2 | Sv |

## 5. Assumptions

1. **EOS-80, not TEOS-10.** EOS-80 differs from TEOS-10 by up to
   0.03 kg/m³ in the deep ocean. Chosen because its reference implementation
   is freely verifiable and it is self-consistent with the UNESCO freezing
   point.
2. **Diagnostics are instantaneous.** Geostrophic velocity computed from a
   surface slope is a snapshot, not a prognostic field.
3. **Tides are equilibrium tides.** No basin resonance, no co-oscillation
   with shelves, no amphidromic systems.
4. **No sea ice.**
5. **The Stommel model is illustrative.** It is a bistability demonstration,
   not a prediction.

## 6. Numerical implementation

- The EOS is a straight polynomial evaluation: no iteration, no branch
  except the validity check.
- The expansion coefficients α and β are computed by **central differences**
  of the density function, so they are exactly consistent with it by
  construction. (The first attempt computed them by calling the density
  function that computed them — infinite recursion.)
- Tidal periods and the spring–neap beat are exact differences of
  frequencies, not fitted.
- `depthPercentile` integrates a bathymetry scan; the median depth is found
  by bisection (40 iterations, ~2 ms).

## 7. Inputs and outputs

| Function | In | Out |
|---|---|---|
| `seawaterDensity(t, S, p)` | °C, PSU, Pa | `{density, sigmaT, alpha, beta, valid}` |
| `seawaterDensityRaw(t, S, p)` | same | density only (no recursion) |
| `seawaterFreezingPoint(S, p)` | PSU, Pa | °C |
| `soundSpeedSeawater(t, S, z)` | — | m/s |
| `geostrophicVelocity(dηdx, dηdy, lat)` | — | `{u, v, f}` |
| `ekmanTransport(τx, τy, lat)` | N/m² | `{Mx, My, magnitude, undefined}` |
| `piersonMoskowitz(U)` / `smbWaveHeight(U, F)` | m/s, m | `{Hs, Tp}` / m |
| `equilibriumTideAmplitude(M, r)` | kg, m | m |
| `stommelBoxes(params)` | — | `{q, mode, dRho}` |
| `oceanPH(pCO₂)` | ppm | pH (via thermochemistry) |

## 8. Validation

### 8.1 Equation of state — verified against the reference implementation

Ten (S, t, p) points matched **bit-for-bit** (< 1 ppm) against
`python-seawater`, the reference UNESCO implementation:

| S | t (°C) | p (dbar) | Model | Reference |
|---|---|---|---|---|
| 35 | 0 | 0 | 1028.106331 | 1028.106331 |
| 35 | 10 | 0 | 1026.952000 | 1026.952000 |
| 35 | 25 | 0 | 1023.341235 | 1023.341235 |
| 35 | 0 | 1000 | 1032.818371 | 1032.818371 |
| 35 | 0 | 4000 | 1046.356132 | 1046.356132 |
| 35 | 0 | 10000 | 1070.958384 | 1070.958384 |
| 35 | 2 | 400 | 1029.846728 | 1029.846728 |
| 34.5 | 2 | 200 | 1028.511404 | 1028.511404 |
| 0 | 20 | 0 | 998.205329 | 998.205329 |
| 35 | 30 | 5000 | 1042.054754 | 1042.054754 |

### 8.2 Other quantities

| Quantity | Model | Reference | Error |
|---|---|---|---|
| Freezing point, S=35 | −1.922 °C | −1.922 | exact |
| Sound speed, 10 °C, 1000 m | 1491.6 m/s | ≈1500 | −0.6% |
| Coriolis at 30° | 7.2921e−5 s⁻¹ | 7.2921e−5 | exact |
| Inertial period at 30° | 23.93 h | 23.93 | exact |
| Rossby radius, 10°N, c=2.24 m/s | 88 km | 50–150 km | in range |
| Ekman magnitude, τ=0.1 Pa at 30° | 1.3353 m²/s | τ/(ρf) | exact |
| H_s at U=10 m/s | 2.14 m | ≈2.1 | +2% |
| Lunar/solar tidal ratio | 2.18 | 2.17 | +0.5% |
| Spring–neap period | 14.77 d | 14.77 | exact |
| Greenland SLR equivalent | 7.42 m | 7.42 | exact |
| W Antarctica | 3.30 m | 3.30 | exact |
| E Antarctica | 53.27 m | 53.3 | −0.06% |
| Shelf fraction of ocean area | 3–15% | 7.55% | in range |
| Median ocean depth | 3000–5000 m | ≈3700 m | in range |

### 8.3 Two documented disagreements

- **SMB vs Pierson–Moskowitz.** Their fully-developed asymptotes are
  0.283 U²/g and 0.21 U²/g — a genuine 35% disagreement between published
  parameterisations. Both are returned; neither is adjusted to match.
- **Ice-sheet sea-level fractions are back-calculated** from the IPCC AR6
  equivalents, so they agree with IPCC *by construction*. They are not
  independent estimates and the code says so.

## 9. Computational cost

| Operation | Cost |
|---|---|
| `seawaterDensity` (with α, β) | ~900 ns (4 polynomial evaluations) |
| `seawaterDensityRaw` | ~220 ns |
| `depthPercentile` over the full grid | ~25 ms |
| `stommelBoxes` | ~1 μs |
| Median depth by bisection | ~1 s (40 × 25 ms) |

## 10. Limitations

- EOS-80 rather than TEOS-10 (≤0.03 kg/m³ difference in the deep ocean).
- No prognostic circulation.
- No eddies, no sea ice, no biogeochemistry.
- Equilibrium tides only; real coastal tides are amplified 10× or more by
  resonance, which is not modelled.
- Mixed-layer depth is a scaling that saturates against its clip under weak
  forcing; it is documented, not tuned.

## 11. Sources

Fofonoff & Millard (1983) UNESCO TPMS 44 · Millero & Poisson (1981) ·
Chen & Millero (1977) · Lueker et al. (2000) · Weiss (1974) · Gill (1982) ·
Stewart (2008) · Stommel (1961) · Pierson & Moskowitz (1964) ·
Sverdrup & Munk (1947) · Cushman-Roisin & Beckers (2011) · IPCC AR6 WG1
ch. 9 · RAPID array (Srokosz & Bryden 2015).

See `RESEARCH_SOURCES.md`.
