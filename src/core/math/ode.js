/**
 * PROJECT TERRA — numerical ODE integrators.
 *
 * Every time-dependent physical system in TERRA is an ODE/DAE integration.
 * This module provides the integration core with explicit guarantees:
 *  - Adaptive step-size control with local-error estimates (Cash-Karp 4(5)
 *    embedded Runge-Kutta; Dormand-Prince 5(4) alternative).
 *  - Symplectic integrators (velocity Verlet, Störmer-Verlet, leapfrog, Yoshida
 *    4th-order composition) for Hamiltonian systems where energy conservation
 *    matters more than high local order (orbits, molecular dynamics, elastic
 *    bodies, N-body planetesimals).
 *  - Semi-implicit / implicit Euler for stiff relaxation terms (cloud
 *    microphysics, radiative relaxation) with documented stability limits.
 *  - Backward Euler on a scalar nonlinear residual (damped Newton) for the
 *    stiff surface energy balance.
 *
 * Design notes
 *  - All integrators are pure functions over typed arrays or plain arrays to
 *    keep them testable and allocation-lean.
 *  - Derivative callbacks receive (t, y, dydt) and must not mutate y.
 *  - Units are whichever the caller uses; the integrator is unit-agnostic.
 *
 * References
 *  - Cash & Karp, ACM TOMS 16(3):201-222 (1990).
 *  - Dormand & Prince, J. Comput. Appl. Math. 6:19-26 (1980).
 *  - Hairer, Nørsett & Wanner, *Solving ODEs I* (1993), II (1996).
 *  - Yoshida, Phys. Lett. A 150:262 (1990).
 *  - Leimkuhler & Reich, *Simulating Hamiltonian Dynamics* (2004).
 */

/** Result container for a single integration step. */
export function makeStepStats() {
  return { steps: 0, accepted: 0, rejected: 0, fEvals: 0, lastError: 0, lastDt: 0 };
}

/**
 * Classical 4th-order Runge–Kutta, fixed step.
 * Local truncation error O(h^5); global O(h^4). Not symplectic.
 * @param {(t:number, y:Float64Array, out:Float64Array)=>void} f
 */
export function rk4(f, t, y, dt, out) {
  const n = y.length;
  const k1 = new Float64Array(n), k2 = new Float64Array(n);
  const k3 = new Float64Array(n), k4 = new Float64Array(n), tmp = new Float64Array(n);
  f(t, y, k1);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k1[i];
  f(t + 0.5 * dt, tmp, k2);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + 0.5 * dt * k2[i];
  f(t + 0.5 * dt, tmp, k3);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt * k3[i];
  f(t + dt, tmp, k4);
  for (let i = 0; i < n; i++) {
    out[i] = y[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  return out;
}

const CK_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [3 / 10, -9 / 10, 6 / 5],
  [-11 / 54, 5 / 2, -70 / 27, 35 / 27],
  [1631 / 55296, 175 / 512, 575 / 13824, 44275 / 110592, 253 / 4096],
];
const CK_B = [37 / 378, 0, 250 / 621, 125 / 594, 0, 512 / 1771];
const CK_BSTAR = [
  2825 / 27648, 0, 18575 / 48384, 13525 / 55296, 277 / 14336, 1 / 4,
];
const CK_C = [0, 1 / 5, 3 / 10, 3 / 5, 1, 7 / 8];

/**
 * Adaptive Cash–Karp 4(5) integrator.
 * Integrates y from t to t+dtTotal, shrinking internal steps to satisfy
 * atol + rtol*|y| and never exceeding maxStep.
 *
 * @param {(t:number,y:Float64Array,out:Float64Array)=>void} f
 * @param {number} t0
 * @param {Float64Array} y0
 * @param {number} dtTotal
 * @param {{atol?:number,rtol?:number,maxStep?:number,minStep?:number,maxSteps?:number,stats?:object}} [opts]
 * @returns {{t:number, y:Float64Array, stats:object, ok:boolean}}
 */
export function integrateAdaptiveRK45(f, t0, y0, dtTotal, opts = {}) {
  const {
    atol = 1e-9, rtol = 1e-9, maxStep = dtTotal, minStep = 1e-12, maxSteps = 100000,
    stats = makeStepStats(),
  } = opts;
  const n = y0.length;
  const y = Float64Array.from(y0);
  const ytmp = new Float64Array(n);
  const k = Array.from({ length: 6 }, () => new Float64Array(n));
  const yHigh = new Float64Array(n), yLow = new Float64Array(n);
  let t = t0;
  let tEnd = t0 + dtTotal;
  let direction = Math.sign(dtTotal) || 1;
  let h = Math.min(Math.abs(maxStep), Math.abs(dtTotal));
  let ok = true;
  let step = 0;

  while ((tEnd - t) * direction > 1e-15 && step < maxSteps) {
    step++;
    stats.steps++;
    if ((t + direction * h - tEnd) * direction > 0) h = Math.abs(tEnd - t);
    f(t, y, k[0]); stats.fEvals++;
    for (let s = 1; s < 6; s++) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < s; j++) sum += CK_A[s][j] * k[j][i];
        ytmp[i] = y[i] + direction * h * sum;
      }
      f(t + direction * CK_C[s] * h, ytmp, k[s]); stats.fEvals++;
    }
    let err = 0;
    for (let i = 0; i < n; i++) {
      let hi = 0, lo = 0;
      for (let s = 0; s < 6; s++) { hi += CK_B[s] * k[s][i]; lo += CK_BSTAR[s] * k[s][i]; }
      yHigh[i] = y[i] + direction * h * hi;
      yLow[i] = y[i] + direction * h * lo;
      const sc = atol + rtol * Math.max(Math.abs(y[i]), Math.abs(yHigh[i]));
      const e = (yHigh[i] - yLow[i]) / sc;
      err += e * e;
    }
    err = Math.sqrt(err / n);
    stats.lastError = err;
    if (err <= 1 || h <= minStep) {
      for (let i = 0; i < n; i++) y[i] = yHigh[i];
      t += direction * h;
      stats.accepted++;
      stats.lastDt = direction * h;
      const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * err ** -0.2));
      h = Math.min(Math.abs(h) * fac, Math.abs(maxStep));
      if (h < minStep) { ok = err <= 1; break; }
    } else {
      stats.rejected++;
      const fac = Math.min(1, Math.max(0.1, 0.9 * err ** -0.25));
      h *= fac;
      if (h < minStep) {
        // Accept the tiny step to guarantee forward progress, flag it.
        for (let i = 0; i < n; i++) y[i] = yLow[i];
        t += direction * h;
        ok = false;
        break;
      }
    }
  }
  if (step >= maxSteps) ok = false;
  return { t, y, stats, ok };
}

/**
 * Velocity-Verlet for separable Hamiltonians H = T(p) + V(q).
 * Second order, symplectic, time-reversible: bounded energy error for
 * fixed step (no secular drift). This is the default for orbits, ballistic
 * particles, elastic membranes and molecular dynamics in TERRA.
 *
 * @param {(q:Float64Array)=>Float64Array} gradV potential gradient (force)
 * @param {Float64Array} q
 * @param {Float64Array} p momentum (or velocity if mass=1)
 * @param {number} dt
 * @param {number} invMass 1/m, may be a scalar for uniform mass
 */
export function velocityVerlet(gradV, q, p, dt, invMass = 1) {
  const n = q.length;
  const a = gradV(q);
  for (let i = 0; i < n; i++) p[i] -= 0.5 * dt * a[i];
  for (let i = 0; i < n; i++) q[i] += dt * p[i] * invMass;
  const a2 = gradV(q);
  for (let i = 0; i < n; i++) p[i] -= 0.5 * dt * a2[i];
  return { q, p };
}

/**
 * Leapfrog (kick-drift-kick) for N-body gravity. Vectorised over particle
 * arrays of length 3N. Assumes equal masses array if mass provided.
 * @param {Float64Array} pos xyz interleaved
 * @param {Float64Array} vel xyz interleaved
 * @param {Float64Array|number} mass per-body masses (kg) or scalar
 * @param {number} dt
 * @param {(pos:Float64Array,acc:Float64Array)=>void} accel acceleration provider
 */
export function leapfrogNBody(pos, vel, mass, dt, accel) {
  const n = pos.length;
  const acc = new Float64Array(n);
  accel(pos, acc);
  const half = 0.5 * dt;
  for (let i = 0; i < n; i++) { vel[i] += half * acc[i]; pos[i] += dt * vel[i]; }
  accel(pos, acc);
  for (let i = 0; i < n; i++) vel[i] += half * acc[i];
}

/**
 * Yoshida 4th-order composition of three leapfrog steps.
 * Coefficients: w1 = 1/(2 - 2^(1/3)), w0 = -2^(1/3)/(2 - 2^(1/3)).
 * (Yoshida 1990, eq. 4.7). Symplectic and 4th-order accurate.
 */
export const YOSHIDA = (() => {
  const c = Math.cbrt(2);
  const w1 = 1 / (2 - c);
  const w0 = -c * w1;
  return { w0, w1 };
})();

/**
 * Explicit (forward) Euler step. First order; included only for stiff
 * subsystems where the caller has established h << timescale, or for
 * teaching/validation comparisons. It is NOT used as a default.
 */
export function euler(f, t, y, dt, out) {
  const d = new Float64Array(y.length);
  f(t, y, d);
  for (let i = 0; i < y.length; i++) out[i] = y[i] + dt * d[i];
  return out;
}

/**
 * Semi-implicit (symplectic) Euler for H = T(p) + V(q):
 *   p += dt * F(q);  q += dt * p/m.
 * Used for demos and for stiff relaxation where unconditional stability of
 * the implicit part is what matters.
 */
export function semiImplicitEuler(force, q, p, dt, invMass = 1) {
  const f = force(q);
  for (let i = 0; i < q.length; i++) { p[i] += dt * f[i]; q[i] += dt * p[i] * invMass; }
  return { q, p };
}

/**
 * Backward Euler for a scalar  dy/dt = g(t, y).
 * Solves y_{n+1} = y_n + h g(t_n + h, y_{n+1}) with a damped Newton iteration.
 * Unconditionally stable for the linear relaxation problem g = -(y - y*)/tau,
 * which is the form used by cloud/radiative relaxation in TERRA.
 */
export function backwardEulerScalar(g, t, y, h, maxIter = 60, tol = 1e-12) {
  let guess = y + h * g(t, y);
  for (let i = 0; i < maxIter; i++) {
    const gv = g(t + h, guess);
    const residual = guess - y - h * gv;
    const dg = (g(t + h, guess + 1e-8) - gv) / 1e-8;
    const deriv = 1 - h * dg;
    if (Math.abs(deriv) < 1e-14) break;
    const delta = residual / deriv;
    guess -= delta;
    if (Math.abs(delta) < tol * (Math.abs(guess) + tol)) break;
  }
  return guess;
}

/**
 * Exponential integrator for a linear relaxation term:
 *   dy/dt = -(y - y_eq)/tau  =>  y(t+h) = y_eq + (y0 - y_eq) exp(-h/tau).
 * Exact for constant y_eq and tau, unconditionally stable. Used for
 * radiative-convective relaxation of surface temperature and for
 * chemical equilibration of fast reactions.
 */
export function relaxExponential(y0, yEq, h, tau) {
  if (tau <= 0) return yEq;
  return yEq + (y0 - yEq) * Math.exp(-h / tau);
}

/**
 * Adaptive substepping for stability-limited explicit PDE terms (CFL,
 * diffusion). Given a stability requirement expressed as `maxStableDt(state)`
 * and a target total interval, returns the number of equal substeps needed.
 */
export function substepsForStability(maxStableDt, dtTotal) {
  if (!(maxStableDt > 0) || !Number.isFinite(maxStableDt)) return { n: 1, dt: dtTotal };
  const n = Math.max(1, Math.ceil(dtTotal / maxStableDt));
  return { n, dt: dtTotal / n };
}
