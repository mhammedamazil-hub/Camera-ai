# NUMERICAL METHODS

**Modules:** `src/core/math/ode.js`, `src/core/math/pde.js` ·
**Tests:** `tests/math.test.js` (28)

---

## 1. Principle

Choose the simplest method that meets the accuracy requirement, and state
what the method cannot do. For a simulation that must run at interactive
speed, that means low-order schemes with limiters rather than
high-order schemes that need small steps.

---

## 2. Method selection

| Problem | Method | Why |
|---|---|---|
| General ODE | `rk4` | 4th order, cheap, no error estimate needed |
| ODE with varying stiffness | `integrateAdaptiveRK45` | embedded error estimate, adapts |
| Conservative mechanics | `velocityVerlet` / `YOSHIDA` | symplectic: bounded energy error |
| Stiff scalar relaxation | `backwardEulerScalar` | unconditionally stable |
| Exact relaxation | `relaxExponential` | no step error at all |
| Scalar root | Brent | guaranteed convergence, superlinear |
| Minimum | golden section | derivative-free, robust |
| Poisson | SOR Gauss–Seidel | simple, no library needed |
| Advection | upwind / MUSCL | monotone, TVD |
| Diffusion | explicit / tridiagonal implicit | implicit removes the dt limit |
| Decay chains | exact exponential per step | conserves atoms to machine precision |

---

## 3. Time integration

### 3.1 RK4

```
k₁ = f(t, y)
k₂ = f(t + h/2, y + h k₁/2)
k₃ = f(t + h/2, y + h k₂/2)
k₄ = f(t + h,   y + h k₃)
y(t+h) = y + h(k₁ + 2k₂ + 2k₃ + k₄)/6
```

Local error O(h⁵), global O(h⁴). Not symplectic — energy drifts
secularly on conservative systems.

### 3.2 Adaptive RK45 (Cash–Karp)

Uses an embedded pair of 4th- and 5th-order estimates; the difference gives
a step error which drives an adaptive step size. `integrateAdaptiveRK45`
exposes tolerance, min/max step, and returns step statistics via
`makeStepStats()`.

### 3.3 Verlet / symplectic Euler

```
v(t+h/2) = v(t) + (h/2) a(q(t))
q(t+h)   = q(t) + h v(t+h/2)
v(t+h)   = v(t+h/2) + (h/2) a(q(t+h))
```

**Measured** relative energy error for a harmonic oscillator over 1 000
periods at dt = 0.01: **2.1e−8**, and it does not grow. This is the reason
symplectic integrators exist; RK4's error over the same run is orders of
magnitude larger and secular.

### 3.4 Exact relaxation

For `dy/dt = (y_eq − y)/τ` the exact solution over a step h is

```
y(t+h) = y_eq + (y(t) − y_eq) exp(−h/τ)
```

No truncation error, stable for any h. Used wherever a field relaxes
toward an equilibrium (sea-surface temperature, radiative equilibrium).

---

## 4. Spatial discretisation

### 4.1 Stencils

| Operator | Order | Function |
|---|---|---|
| Central difference | 2 | `ddxCentral`, `ddyCentral` |
| Central difference | 4 | `ddxCentral4` |
| One-sided | 2 | `ddxOneSided` |

### 4.2 Advection and limiters

First-order upwind is stable but diffusive: it smears a front over many
cells. Lax–Wendroff is sharper but oscillates. The TVD approach reconstructs
cell-face values with a limiter so that no new extrema are created:

```
van Leer:  ψ(r) = (r + |r|)/(1 + |r|)
minmod:    ψ(r) = max(0, min(1, r))
```

`advectSemiLagrangian2D` is available for large CFL but is **not
conservative** — it should not be used for a tracer with a budget.

### 4.3 Diffusion

Explicit diffusion has a hard stability limit:

```
Δt ≤ h²/(2α·d)     (d = number of dimensions)
```

`diffusionStableDt(h, alpha, dims)` returns it. When the limit is
prohibitive, `diffuseTridiagonalX` solves the implicit system with the
Thomas algorithm (`solveTridiagonal`, `solveTridiagonalPeriodic`), which is
unconditionally stable for any Δt.

### 4.4 CFL

```
Δt ≤ CFL · min(Δx/|u|)
```

`cfl2D(g, u, v, dt)` reports the achieved CFL number so a run can be
audited rather than trusted.

---

## 5. Consistency and conservation checks

| Property | How it is checked |
|---|---|
| Advection conserves mass | upwind and MUSCL conserve to machine precision with periodic BCs |
| Diffusion conserves mass | same |
| Limiter is total-variation diminishing | a step function never gains new extrema |
| Poisson residual decreases monotonically | asserted |
| Symplectic integrator has bounded energy | 2.1e−8 over 1 000 periods |
| Decay chain conserves atoms | ≤ 1e−6 over 200 steps |

---

## 6. Error budget

| Source | Magnitude | Controllable? |
|---|---|---|
| Float64 round-off | 1e−16 per op | no |
| RK4 truncation | O(h⁴) | yes, by h |
| Advection numerical diffusion | O(Δx) at first order | only by refining the grid |
| 16-bit layer encoding | 1.5e−5 relative | yes, by widening the range |
| DEM quantisation | 100 m histogram bins | no (fixed data) |

---

## 7. What is not implemented

- **No multigrid.** The Poisson solver is SOR only.
- **No spectral methods.** No FFT anywhere.
- **No finite elements.** Only finite differences and finite volumes.
- **No event detection.** A discontinuity (phase change, collision) is
  stepped over, not landed on.
- **No automatic differentiation.** Derivatives are analytic or
  finite-difference.
- **No substepping within the land/ocean boundary** — the surface is
  treated as a single-value boundary.

## 8. Sources

Press et al. (2007) · Cash & Karp (1990) · Yoshida (1990) ·
van Leer (1979) · Leonard (1991) · Courant, Friedrichs & Lewy (1928) ·
Harten (1983).
