# ATMOSPHERE

**Module:** `src/physics/atmosphere.js`, `src/physics/thermodynamics.js` ·
**Tests:** `tests/atmosphere.test.js` (80) · **Status:** validated (static)

---

## 1. Principle

Two things are modelled:

1. **The vertical structure** — how temperature, pressure and density vary
   with height. Provided by the 1976 US Standard Atmosphere, which is a
   piecewise-linear temperature profile integrated hydrostatically.
2. **The energy balance** — the planetary radiation budget that sets the
   surface temperature.

There is **no dynamics**: no wind, no advection, no weather. The atmosphere
is a static function of position. This is stated everywhere it matters.

## 2. Equations

### 2.1 Hydrostatic balance and the barometric formula

```
dp/dz = −ρ g

For a layer with constant lapse rate L:
p(z) = p_b · (T_b/T(z))^(g₀M/(R*L))
T(z) = T_b + L(z − z_b)
```

For an isothermal layer (L = 0):

```
p(z) = p_b exp(−g₀M(z−z_b)/(R*T))
```

### 2.2 Geopotential height — the subtlety that matters

The 1976 tables are defined on **geopotential** height:

```
H = R_eff · z / (R_eff + z),  R_eff = 6 356 766 m
```

Using geometric z directly gives:

| Altitude | T error | p error |
|---|---|---|
| 11 km | 0.03% | 0.4% |
| 32 km | 0.2% | 2.6% |
| 47 km | 0.36% | 4.4% |

This was a real bug caught by the layer-boundary tests.

### 2.3 Saturation vapour pressure (Buck / Alduchov–Eskridge)

```
Over water:  e_s = 6.1121 exp(17.625 T/(T + 243.04))   [hPa, T in °C]
Over ice:    e_s = 6.1115 exp(22.452 T/(T + 272.55))
```

The Magnus form was chosen over Clausius–Clapeyron because the latter needs
a temperature-dependent latent heat to be accurate to better than 1%.

### 2.4 Inversion to dew point and frost point

Inverting the Magnus form exactly:

```
T_d = 243.04 · ln(e/6.1121) / (17.625 − ln(e/6.1121))
```

**Critical:** the inverse must use *its own* forward coefficients. Using
Buck's coefficients to invert the 17.625 form produced a 0.5 K round-trip
error. The current implementation round-trips to ≤ 0.027 K (dew) and
≤ 0.013 K (frost).

At a fixed vapour pressure below 0 °C, **T_frost > T_dew** — the frost point
is the higher temperature. (An earlier version had this backwards.)

### 2.5 Composition and molar mass

```
M_dry = Σ x_i M_i
```

IUPAC mole fractions sum to 1.0000887. The module normalises and exposes
the residual via `compositionClosureError()`, yielding
M_dry = 28.9661 g/mol (accepted: 28.9647).

### 2.6 Rayleigh scattering

```
β(λ) = (8π³(n²−1)² / (3 N_s² λ⁴)) · (6 + 3δ)/(6 − 7δ)
τ(z) = ∫ β dz
```

**The trap:** the cross-section needs **N_s²**, not N_s. With N_s,
τ(550 nm) = 1.1e−5 instead of 0.0976 — three orders of magnitude — and the
sky is black.

### 2.7 Energy balance

```
σ(T_s − Γ)⁴ = (1 − α) S/4 + F
```

with Γ = 33 K the effective greenhouse offset and F any additional forcing.
Linearising for the climate sensitivity:

```
ΔT = ΔF / (4σT³ − λ_feedback)
```

### 2.8 Grey-band OLR

```
OLR = ε_eff σ T_s⁴
```

with ε_eff calibrated so the clear-sky OLR matches CERES.

## 3. Units and constants

| Quantity | Value | Unit |
|---|---|---|
| p₀ (ISA sea level) | 101 325 | Pa |
| T₀ | 288.15 | K |
| Lapse rate (troposphere) | 0.0065 | K/m |
| g₀ | 9.80665 | m/s² |
| R* | 8.314462618 | J mol⁻¹ K⁻¹ |
| R_d (specific, dry) | 287.052874 | J kg⁻¹ K⁻¹ |
| γ (dry air) | 1.4 | — |
| M_dry | 0.0289661 | kg/mol |
| σ_SB | 5.670374419e−8 | W m⁻² K⁻⁴ |
| TSI | 1361 | W/m² |
| Bond albedo | 0.293 | — |
| T_eff | 255.21 | K |

### On the two atmosphere-mass constants

`ATMOSPHERE_MASS_SEA_LEVEL` is the mass of a uniform 1013.25 hPa column over
the whole ellipsoid: p₀·4πR²/g₀ = 5.2701e18 kg. **This is an upper bound**,
because Earth is not covered by a sea-level-pressure shell — continents
stand above it.

`ATMOSPHERE_MASS` uses the actual global mean surface pressure of 985 hPa,
yielding 5.1232e18 kg. The measured total atmospheric mass is 5.1480e18 kg,
so the 985-hPa figure is 0.5% low and the 1013.25-hPa figure is 2.4% high.
Both are exposed rather than one being chosen silently.

## 4. Assumptions

1. **Standard, not actual, atmosphere.** No seasonal or latitudinal
   variation, no weather.
2. **Dry air for the gas law** (moist corrections available separately).
3. **Plane-parallel, single-scattering Rayleigh.** No multiple scattering,
   no Mie, no absorption bands.
4. **Grey-band radiation.** CO₂ enters as a scalar, not a spectrum.
5. **No clouds.** Cloud radiative effect (~−25 W/m² net) is absent.
6. **No dynamics.** This is the largest assumption in the module.

## 5. Numerical implementation

- Layer lookup is a linear scan over 7 ISA layers; a binary search would be
  premature for n = 7.
- The geopotential conversion is applied *before* the layer lookup.
- Above 84 km an exponential isothermal extension is used and flagged in
  the returned `layer` string.
- `energyBalanceSteadyState` is solved by Newton iteration on T with an
  analytic derivative (dOLR/dT), converging in ~5 iterations to 1e−8 K.
- Inverses (dew/frost) are closed-form, not iterative.

## 6. Inputs and outputs

| Function | In | Out |
|---|---|---|
| `standardAtmosphere(z)` | geometric altitude m | `{T, p, rho, sound, layer}` |
| `saturationVapourPressure(T, overIce)` | K | Pa |
| `dewPoint(e)` / `frostPoint(e)` | Pa | K |
| `rayleighOpticalDepth(λ, z)` | m, m | dimensionless |
| `refractiveIndexAir(λ)` | m | dimensionless |
| `energyBalanceSteadyState(F)` | W/m² | `{T, OLR, tau}` |
| `equilibriumWarming(doubling, feedback)` | — | K |
| `meanMolarMass(composition)` | fractions | kg/mol |

## 7. Validation

| Quantity | Computed | Reference | Error |
|---|---|---|---|
| T, 0–47 km | — | ISA table | ≤ 0.012% |
| p, 0–47 km | — | ISA table | ≤ 0.0004% |
| ρ, 0–47 km | — | ISA table | ≤ 0.043% |
| M_dry | 28.9661 | 28.9647 | 5e−5 |
| e_s(0 °C) | 6.112 | 6.112 | hPa |
| e_s(20 °C) | 23.383 | 23.39 | hPa |
| e_s(40 °C) | 73.824 | 73.85 | hPa |
| τ(400 nm) | 0.3584 | 0.358 | — |
| τ(550 nm) | 0.09680 | 0.0976 | −0.8% |
| τ(700 nm) | 0.0364 | 0.036 | — |
| r_s at 15 °C | 0.01065 | 0.0106 | kg/kg |
| Equilibrium T_s | 289.01 | ~288 | +0.35% |
| Grey-band OLR | 234.4 | 236.7 | −1.0% |
| dOLR/dT | 3.806 | 3.2–4.2 | in range |
| ATMOSPHERE_MASS (985 hPa mean) | 5.1232e18 | 5.1480e18 | −0.5% |
| ATMOSPHERE_MASS_SEA_LEVEL (1013.25 hPa) | 5.2701e18 | 5.2701e18 | 0% (by construction) |

### On the climate sensitivity numbers

| Model | CO₂ doubling response |
|---|---|
| Planck only | 0.98 K |
| + lumped −1.2 W m⁻² K⁻¹ feedback | 3.09 K |

The first is a *derived* result. The second depends on a **prescribed**
feedback parameter and must not be presented as an independent prediction.
See `LIMITATIONS.md` §2.2.

## 8. Computational cost

| Operation | Cost |
|---|---|
| `standardAtmosphere` | ~120 ns |
| Full globe bake (pressure) | ~90 ms |
| Full globe bake (density, 2 layers) | ~180 ms |
| Energy balance solve | ~2 μs |

## 9. Limitations

- Static. No wind, no weather, no time evolution.
- No clouds, no aerosol, no ozone chemistry.
- Grey-band radiation.
- Rayleigh only; no Mie scattering.
- ISA is a standard atmosphere, valid 0–86 km.

## 10. Sources

U.S. Standard Atmosphere 1976 (NASA-TM-X-74335) · ISO 2533 · IUPAC (2013) ·
Bucholtz (1995) · Bodhaine et al. (1999) · Edlén (1966) · Buck (1981) ·
Alduchov & Eskridge (1996) · Myhre et al. (1998).
