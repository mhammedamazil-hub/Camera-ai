# PHYSICS

**Modules:** `src/physics/gravity.js`, `atmosphere.js`, `thermodynamics.js`,
`particle-physics.js` · **Tests:** 153 (35 + 80 + 38) · **Status:** validated

This document is the physics overview. Each sub-domain has its own document
(`GRAVITY.md`, `ATMOSPHERE.md`); particle and nuclear physics live in
`CHEMISTRY.md` §4.3.

---

## 1. Scope

| Domain | Modelled | Document |
|---|---|---|
| Newtonian gravity, harmonics, orbits | Yes | `GRAVITY.md` |
| Hydrostatics and the standard atmosphere | Yes | `ATMOSPHERE.md` |
| Thermodynamics of moist air | Yes | `ATMOSPHERE.md` §3 |
| Radiative transfer (grey band) | Approximate | `ATMOSPHERE.md` §3.8 |
| Relativistic kinematics, annihilation | Yes | `CHEMISTRY.md` §4.3 |
| Nuclear decay, fission | Yes | `CHEMISTRY.md` §4.3 |
| Electromagnetism | **No** — no geodynamo, no magnetosphere | — |
| Fluid dynamics (NS) | **No** | `LIMITATIONS.md` §1 |
| Quantum mechanics | Only where tabulated (cross-sections) | — |

The absence of fluid dynamics is the single biggest gap and is stated at the
top of every document that depends on it.

---

## 1b. Principle

Physics is modelled as a set of **independent, locally-evaluable
relationships**. Every quantity the simulation needs can be computed from a
position, a time and the element's composition — no field is integrated in
time. This is what makes the whole planet evaluable in a few seconds and
testable against closed-form references.

The two exceptions are where time evolution is unavoidable and has a closed
form: **radioactive decay** (exact exponential) and **orbital propagation**
(Kepler's equation).

## 1c. Equations

The complete set is given in the sub-documents. The core identities that tie
them together:

```
Newtonian gravity:      g = GM/r²  (+ J₂, J₃, J₄)
Hydrostatic balance:    dp/dz = −ρg
Ideal gas:              p = ρ R_d T
Stefan–Boltzmann:       F = σT⁴
Planck:                 B(λ,T) = 2hc²/λ⁵ / (e^{hc/λkT} − 1)
Mass–energy:            E = mc²
Lorentz factor:         γ = 1/√(1 − v²/c²)
Kepler's third law:     T² = 4π²a³/(GM)
```

## 1d. Numerical implementation

| Domain | Approach |
|---|---|
| Gravity | closed-form Somigliana; harmonic series for the zonal model |
| Atmosphere | piecewise analytic integration, no ODE solver |
| Thermodynamics | closed-form Magnus inverses |
| Energy balance | Newton iteration with an analytic derivative |
| Particles | closed-form kinematics; tabulated cross-sections interpolated in log-log |
| Decay | exact exponential per step |

No module in `physics/` uses a generic ODE integrator for a steady-state
problem. That is deliberate: a closed form has no step-size error to
document.

## 1e. Computational cost

| Module | Typical call | Full-planet bake |
|---|---|---|
| gravity | 80 ns | 2.1 s |
| atmosphere | 120 ns | 90 ms |
| thermodynamics | 60 ns | n/a |
| particle-physics | 200 ns – 20 μs | n/a |

## 2. The system of units

Everything is **SI**. The one deliberate exception is pressure in hPa at the
presentation layer, because meteorology uses hPa and converting on display
is less error-prone than converting on input.

| Quantity | Unit | Note |
|---|---|---|
| Length | m | km only in prose |
| Mass | kg | |
| Time | s | |
| Temperature | K | °C only for display |
| Pressure | Pa | hPa in UI |
| Energy | J | eV only for particle physics |
| Density | kg/m³ | |
| Molar mass | kg/mol | |
| Angle | rad internally, degrees at interfaces | |

Every constant in `src/core/constants.js` carries
`{ value, unit, relUncertainty, exact, source }`, and `validateConstants()`
asserts the internal identities (R = N_A k_B, σ_SB from h and k_B, etc.) at
import time. A mistyped constant cannot survive `import`.

---

## 3. Conservation laws — what is actually conserved

| Law | Status | How it is checked |
|---|---|---|
| Energy | Conserved in annihilation, fission and reaction energetics | tests assert the sums |
| Momentum | Conserved in relativistic kinematics | e⁺e⁻ in-flight photon energies sum to E_total |
| Mass-energy | Conserved (E = mc²) | 1 kg → 1.7975e17 J |
| Atom number | Conserved in decay chains | `decayChain` test asserts total ≤ N₀ to 1e−6 |
| Charge | Conserved (implicit in stoichiometry) | — |
| Entropy | **Not tracked globally** | no entropy budget |

`decayChain` conserves atoms to machine precision because each step applies
an exact exponential to every nuclide independently and then redistributes
the decayed fraction. No Euler stepping, no drift.

---

## 4. Cross-cutting assumptions

These apply to every physics module and are not repeated in each document.

1. **Newtonian gravity.** Relativistic corrections are ≤ 1e−9 at Earth's
   surface and are ignored except where particles are concerned.
2. **Non-relativistic bulk motion.** The atmosphere and ocean are
   non-relativistic by ~11 orders of magnitude.
3. **Local thermodynamic equilibrium** for anything at the surface.
4. **Continuum mechanics** — the smallest resolved scale (18.6 km) is many
   orders of magnitude above the molecular mean free path (~70 nm in air),
   so Knudsen effects are irrelevant.
5. **No magnetic field.**
6. **Time is treated as universal.** No relativistic time dilation between
   the surface and orbit (which would be ~38 μs/day for GPS).

---

## 5. Dimensional analysis as a check

Every derived quantity is checked for dimension. Three examples where this
caught something:

| Quantity | Wrong version | Why it failed |
|---|---|---|
| Mixed-layer depth | `sqrt(2 Ri u*²/(B f))` mixed B (1/s) with f (1/s) | returned a length either way; only a magnitude check exposed it |
| Ekman transport | `τ/(ρf)` in m²/s | correct dimension, but the sign convention was 90° off |
| Friction velocity | `sqrt(τ/ρ)` | m/s, correct; the bug was in the Monin–Obukhov *sign* |

Dimensional analysis catches units, not signs or factors of 1000. Both of
those classes of bug were found by comparing against published values — see
`DEVLOG.md`.

---

## 6. Validation philosophy

Every module is validated against **one of three** independent kinds of
reference, in this order of preference:

1. **An analytical solution** — e.g. Kepler propagation compared against an
   exact ellipse, energy balance solved to a closed form.
2. **A published table** — e.g. the 1976 Standard Atmosphere at every layer
   boundary, the UNESCO EOS-80 reference points.
3. **A known physical landmark with a stated tolerance** — e.g. Everest's
   cell is high, the Dead Sea is below sea level, the ocean volume is
   1.335e18 m³.

What is *not* acceptable is validating a model against itself, or against a
number that was tuned to make it pass. Where a value was prescribed (the
climate feedback parameter), the document says so explicitly.

---

## 7. Where physics ends and art begins

The renderer is allowed to be approximate; the physics is not. The boundary
is enforced by making every visual layer declare a `note` describing what it
approximates, and by baking all layers from the physics functions rather
than re-deriving them in the shader.

| Element | Physics | Art |
|---|---|---|
| Terminator position | exact solar geometry | softened over 18° of cos(elevation) |
| Earth's shape | WGS84 flattening | — |
| Surface colour | — | biome model |
| Hill-shading | — | fixed light az 315°, el 45° |
| Ocean colour | — | depth-dependent blend |
| Atmosphere limb | — | Fresnel, additive blend |

See `SCIENCE_MASTER.md` §7.
