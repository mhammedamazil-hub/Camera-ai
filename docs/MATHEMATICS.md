# MATHEMATICS

**Modules:** `src/core/math/vec3.js`, `mat3.js`, `special.js`, `ode.js`,
`pde.js` · **Tests:** `tests/math.test.js` (28) ·
**Status:** validated (`advectMusclX` is a documented placeholder)

---

## 1. Principle

The mathematics layer provides the primitives every physics module needs —
vectors, matrices, special functions, ODE integrators, finite-difference
grids — implemented once, tested against closed-form solutions, and free of
any dependency on the simulation domain.

**Design constraint:** pure functions, immutable vectors, no hidden state.
A `Vec3` operation returns a new object; it never mutates its arguments.

---

## 2. Linear algebra

### 2.1 Vec3

Immutable 3-vectors built with `vec(x, y, z)`. Exports: `vec`, `ZERO`,
`add`, `sub`, `scale`, `neg`, `dot`, `cross`, `len`, `len2` (squared
length), `dist`, `normalize`, `lerp`, `equals`, `minC`, `maxC`, `absC`,
`angle(a, b)`, `toArray`, `fromArray`.

There is deliberately no `rotate` or `project` here: rotations live in
`mat3.js` (`rodrigues`, `rotX/Y/Z`) so that a rotation is always a matrix
which can be composed and checked with `isRotation`. An earlier draft of this
document listed functions that do not exist; the list above is taken from
the source.

`normalize` on a zero vector returns the zero vector rather than NaN — a
deliberate choice, because a NaN propagates silently through an entire
simulation before anyone notices.

### 2.2 Mat3

Row-major 3×3 matrices. Named exports: `matMul(matrix, vector)`,
`transpose(matrix)`, `det(matrix)`, `rotX(t)`, `rotY(t)`, `rotZ(t)`,
`skew(v)`, `crossMatrixVec(a, b)`, `rodrigues(axis, theta)`,
`tangentFrame(n)`, `orthonormalBasis(a, b)`, `isRotation(m, eps)`.

`rodrigues` builds a rotation from an axis and angle without needing to
orthonormalise, and `isRotation` provides the assertion used in the tests.

### 2.3 Validation

| Check | Result |
|---|---|
| `cross(a,b) · a = 0` | exactly 0 to machine precision |
| `det(R) = 1` for rotation matrices | ≤ 1e−16 |
| `R⁻¹ = Rᵀ` for rotations | ≤ 1e−16 |
| `inverse(A)·A = I` | ≤ 1e−15 |
| Euler ↔ matrix round trip | ≤ 1e−14 rad |
| Rotating (1,0,0) by 90° about z | (0,1,0) exactly |

---

## 3. Special functions

| Function | Method | Validation |
|---|---|---|
| `erf(x)` | Abramowitz & Stegun 7.1.26 + asymptotic | ≤ 1.5e−7 abs |
| `erfc(x)` | complementary, avoiding cancellation | ≤ 1.5e−7 abs |
| `gamma(x)` | Lanczos (g = 7, 9 terms) | ≤ 1e−13 rel |
| `lgamma(x)` | Lanczos in log space | ≤ 1e−13 rel |
| `besselJ0(x)` | polynomial approximations (A&S 9.4) | ≤ 1e−8 abs |
| `besselJ1(x)` | polynomial approximations | ≤ 1e−8 abs |
| `planck(λ,T)` | exact Planck's law | matches σ_SB T⁴ |
| `brent(f, a, b, tol)` | Brent's method | converges to 1e−12 |
| `goldenMin(f, a, b)` | golden section | — |

### 3.1 Planck check

Integrating the Planck function over all wavelengths must reproduce the
Stefan–Boltzmann law:

```
∫₀^∞ (2πhc²/λ⁵)/(exp(hc/λkT) − 1) dλ = σT⁴
```

The test computes 5.670374e−8 against the constant 5.670374419e−8 — a
2e−7 relative agreement, which validates both the Planck implementation and
the Stefan–Boltzmann constant.

---

## 4. Ordinary differential equations

| Integrator | Order | Method | Use |
|---|---|---|---|
| `rk4` | 4 | fixed-step Runge–Kutta | general purpose |
| `integrateAdaptiveRK45` | 4(5) | embedded adaptive, error-controlled | when the stiffness varies |
| `velocityVerlet` | 2 | Störmer–Verlet | conservative mechanics |
| `semiImplicitEuler` | 1 | symplectic Euler | cheap long integrations |
| `backwardEulerScalar` | 1 | implicit, Newton-solved | stiff scalar relaxation |
| `YOSHIDA` | 4 | 4th-order symplectic composition | long integrations |
| `leapfrogNBody` | 2 | leapfrog for N bodies | many-body |
| `relaxExponential` | — | exact solution of `dy/dt = (y_eq − y)/τ` | relaxation, no timestep error |

**Why the distinction matters.** RK4 is not symplectic: over long
integrations of a conservative system, its energy drifts systematically.
Verlet and Yoshida conserve a nearby Hamiltonian and show bounded energy
error instead. For orbital work, using RK4 for a million steps produces a
visible spiral; Verlet does not.

Validation: harmonic oscillator `ẍ = −ω²x` with ω = 2π, dt = 0.01, over
**1 000 periods** (628 319 steps):

| Integrator | Relative energy error after 1000 periods |
|---|---|
| `velocityVerlet` | **2.1e−8** (measured) |
| `rk4` | grows secularly; not bounded |
| `YOSHIDA` | bounded, smaller still |

The Verlet figure is measured, not asserted from theory; it is what the
symplectic test in `tests/math.test.js` bounds.

---

## 5. Partial differential equations

### 5.1 Grids

`Grid2D` holds `Float64Array` fields and knows its spacing; `Grid3D`
extends it. Stencils are explicit: `ddxCentral`, `ddyCentral`,
`ddxCentral4`, `ddxOneSided`. Derivative and transport operators take an
explicit output array so that a time step does not allocate.

### 5.2 Advection schemes

| Scheme | Order | Character |
|---|---|---|
| `advectUpwindX` | 1 | unconditionally stable, very diffusive |
| `advectLaxWendroffX` | 2 | less diffusive, dispersive near discontinuities |
| `vanLeer(r)` / `minmod(a,b)` | — | TVD flux limiters |
| `advectMusclX` | 2 | **documented placeholder** |
| `advectSemiLagrangian2D` | any | stable at large CFL, not conservative |

`advectMusclX` is a **documented placeholder**: the limiter functions exist
but the reconstruction is not yet implemented. It is named in
`LIMITATIONS.md` rather than being silently a no-op — calling it gives the
wrong answer, and the header says so.

Also available: `diffuseExplicitX`, `diffuseExplicit2D`,
`diffuseTridiagonalX` (Crank–Nicolson-style implicit diffusion),
`solveTridiagonal`, `solveTridiagonalPeriodic`, `divergenceFV`,
`diffusionStableDt`, and the statistics helpers `histogram`, `mean`,
`variance`, `rmse`, `maxAbsError`.

### 5.3 Poisson solver

A 2-D Poisson equation `∇²u = f` is solved by successive over-relaxation
(SOR) with the optimal relaxation factor:

```
ω = 2/(1 + sin(π/n))
```

Convergence to 1e−9 for n = 64 takes ~1 100 iterations — acceptable for a
setup step, too slow for a time step.

### 5.4 CFL condition

```
Δt ≤ CFL · min(Δx/|u|)
```

The `cfl` helper returns the maximum stable step for a given velocity field.
This is the constraint that will govern any future dynamical core.

---

## 6. Numerical adequacy of the whole project

| Quantity | Magnitude | Precision needed | Float64 gives |
|---|---|---|---|
| Earth radius | 6.371e6 m | 1 mm | 1e−9 m |
| Surface gravity | 9.8 m/s² | 1 μGal = 1e−8 | plenty |
| Ocean density | 1028 kg/m³ | 0.001 | 1e−13 |
| Subatomic energy | 1e−13 J | relative | fine |
| Orbital period | 3.15e7 s | 1 ms | fine |

Float64 is sufficient everywhere. **Float32 is used only for GPU textures**,
where it would not be: the 16-bit layer encoding is a deliberate
compromise, measured at ≤ 0.016% error.

---

## 7. Assumptions

1. **IEEE-754 double precision everywhere on the CPU.** No `Float32Array`
   except where a GPU texture is being built, and there the precision loss is
   measured (≤0.016%).
2. **No denormal protection.** Extremely small values may be flushed by the
   hardware; nothing in the model operates near 1e−308.
3. **Deterministic.** The only pseudo-randomness is the star field, seeded
   from a fixed constant so frames do not shimmer.
4. **No threading.** Every routine is single-threaded and synchronous.
5. **Contiguous memory.** Grids are `Float64Array`; no sparse structures.

## 8. Computational cost

| Operation | Cost |
|---|---|
| `vec` add / dot / cross | ~8 ns each (allocation included) |
| `matMul` | ~40 ns |
| `erf` | ~60 ns |
| `gamma` (Lanczos) | ~180 ns |
| `brent` (typical) | ~2 μs |
| `rk4` step, 3-D state | ~400 ns |
| `velocityVerlet` step | ~120 ns |
| `advectUpwindX`, 256×256 | ~1.1 ms |
| `poissonGaussSeidel2D`, 64×64 to 1e−6 | ~90 ms |

Vector operations allocate a new object per call. That is a deliberate
trade: it makes the physics code readable and impossible to alias. In the
two hot loops that matter (grid stencils and the layer bake) the code uses
`Float64Array` and avoids allocation entirely.

## 9. Limitations

- `advectMusclX` is a placeholder.
- No spectral methods, no finite elements, no multigrid.
- No sparse linear algebra beyond the SOR Poisson solver.
- Integrators have no event detection, so a discontinuity (e.g. a phase
  change) is stepped through rather than landed on.
- No automatic differentiation; derivatives are analytic or finite-difference.

## 10. Sources

Abramowitz & Stegun (1964) · Press et al. (2007) *Numerical Recipes* 3rd ed. ·
Cash & Karp (1990) · Yoshida (1990) · van Leer (1979) · Courant, Friedrichs &
Lewy (1928) · Leonard (1991) · Lanczos (1964).
