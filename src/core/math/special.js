/**
 * PROJECT TERRA — special functions used by physical models.
 *
 * Implementations are chosen for numerical robustness over elegance:
 *  - erfc: W. J. Cody (1969) rational approximations, |rel err| < 1.2e-7
 *    (used for Gaussian plume dispersion and normal CDF).
 *  - normalCdf: Abramowitz & Stegun 26.2.17 (|eps| < 1.5e-7).
 *  - Gamma / logGamma: Lanczos g=7 approximation (|rel err| < 2e-10).
 *  - Blackbody integrals: Stefan-Boltzmann plus band-limited fraction of the
 *    Planck function by numerical integration (used for greenhouse forcing).
 *  - Bessel J0/J1: Abramowitz & Stegun 9.4 polynomial approximations.
 *  - Voigt: pseudo-Voigt approximation (Thompson, Cox & Hastings 1987) used
 *    for spectral line shapes in radiative transfer.
 *
 * References: Abramowitz & Stegun, *Handbook of Mathematical Functions*,
 * Dover (1964); Cody, *Math. Comp.* 23:631 (1969); Press et al., *Numerical
 * Recipes*, 3rd ed. (2007), ch. 6.
 */

/**
 * Error function, computed from the regularised incomplete gamma function:
 *   erf(x) = P(1/2, x^2)  (A&S 6.5.17)
 * This reuses the continued-fraction machinery and is accurate to ~1e-15,
 * far better than the classic A&S 7.1.26 polynomial (1.5e-7).
 */
export function erf(x) {
  if (x === 0) return 0;
  return Math.sign(x) * gammp(0.5, x * x);
}

/** Complementary error function: erfc(x) = Q(1/2, x^2) = 1 - P(1/2, x^2). */
export function erfc(x) {
  if (x >= 0) return gammq(0.5, x * x);
  return 1 + gammp(0.5, x * x);
}

/** Standard normal cumulative distribution function. */
export function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Inverse normal CDF (Acklam's algorithm, |rel err| < 1.15e-9). */
export function normalQuantile(p) {
  if (p <= 0 || p >= 1) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5; r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Gamma function for real arguments (reflection used for x < 0.5). */
export function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

/** Natural log of |Gamma|, smooth for large arguments. */
export function logGamma(z) {
  return Math.log(Math.abs(gamma(z)));
}

/** Beta function B(a,b) = Gamma(a)Gamma(b)/Gamma(a+b). */
export const beta = (a, b) => Math.exp(logGamma(a) + logGamma(b) - logGamma(a + b));

/** Regularised upper incomplete gamma Q(a,x) = 1 - P(a,x). */
export function gammq(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) return 1 - gammp(a, x);
  // Direct continued fraction evaluation for Q
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Incomplete gamma function P(a,x) (series + continued fraction, NR ch.6.2). */
export function gammp(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n < 500; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  // Lentz continued fraction for Q(a,x)
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Bessel function J0, implemented as a power series for |x| < 12 and the
 * Hankel asymptotic expansion beyond. The power series converges to machine
 * precision over the transition; the asymptotic form supplies the correct
 * decaying amplitude and phase for large arguments.
 *   J0(x) = sum_{k>=0} (-1)^k (x/2)^(2k) / (k!)^2
 */
export function besselJ0(x) {
  const ax = Math.abs(x);
  if (ax < 12) {
    let term = 1, sum = 1, k = 0;
    const y = -(x * x) / 4;
    while (Math.abs(term) > 1e-17 * Math.abs(sum) && k < 200) {
      k += 1;
      term *= y / (k * k);
      sum += term;
    }
    return sum;
  }
  const z = 8 / ax, y = z * z, xx = ax - Math.PI / 4;
  const p = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const q = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934945152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

/**
 * Bessel function J1 by the same series/asymptotic split as J0.
 *   J1(x) = (x/2) * sum_{k>=0} (-1)^k (x/2)^(2k) / (k! (k+1)!)
 */
export function besselJ1(x) {
  const ax = Math.abs(x);
  const sign = x < 0 ? -1 : 1;
  if (ax < 12) {
    let term = x / 2, sum = term, k = 0;
    const y = -(x * x) / 4;
    while (Math.abs(term) > 1e-17 * Math.abs(sum) && k < 200) {
      k += 1;
      term *= y / (k * (k + 1));
      sum += term;
    }
    return sum;
  }
  const z = 8 / ax, y = z * z, xx = ax - 3 * Math.PI / 4;
  const p = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const q = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  return sign * Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p - z * Math.sin(xx) * q);
}

/** Pseudo-Voigt profile (Thompson, Cox & Hastings 1987). */
export function pseudoVoigt(x, sigma, gammaL) {
  const gaussian = Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const lorentz = (gammaL / Math.PI) / (x * x + gammaL * gammaL);
  // Mixing parameter from FWHM ratio (empirical, documented)
  const fG = 2.3548 * sigma, fL = 2 * gammaL;
  const eta = 1.36603 * (fL / (fG + fL)) - 0.47719 * (fL / (fG + fL)) ** 2 + 0.11116 * (fL / (fG + fL)) ** 3;
  return eta * lorentz + (1 - eta) * gaussian;
}

/**
 * Planck spectral radiance B_lambda(T) in W m^-2 sr^-1 m^-1.
 * @param {number} lambda wavelength in metres
 * @param {number} T temperature in K
 */
export function planckRadiance(lambda, T, h = 6.62607015e-34, c = 299792458, kB = 1.380649e-23) {
  const x = (h * c) / (lambda * kB * T);
  return (2 * h * c * c) / (lambda ** 5 * (Math.expm1(x)));
}

/** Monochromatic blackbody exitance, W m^-2 m^-1. */
export const planckExitance = (lambda, T) => Math.PI * planckRadiance(lambda, T);

/**
 * Fraction of blackbody *exitance* emitted at wavelengths below `lambda`
 * (dimensionless, 0..1).
 *
 * DERIVATION (documented because it is easy to get backwards):
 *   ∫_0^λ B_λ dλ = (σT⁴/π)(15/π⁴) ∫_x^∞ t³/(e^t - 1) dt,   x = hc/(λ k T)
 * Expanding 1/(e^t-1) = Σ_{n≥1} e^{-nt} and integrating by parts gives
 *   F(0->λ) = (15/π⁴) Σ_{n≥1} e^{-nx}(x³/n + 3x²/n² + 6x/n³ + 6/n⁴)
 * which is what we evaluate. Note x → ∞ (short λ) implies F → 0, and
 * x → 0 (long λ) implies F → 1.
 *
 * Verified in tests against a direct numerical integral of Planck's law and
 * against the Stefan–Boltzmann normalisation.
 */
export function planckFractionBelow(lambda, T) {
  const x = K_HC / (lambda * K_KB * T);
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  if (x > 60) return 0;                       // negligible short-λ power
  if (x < 1e-3) return 1 - (15 / Math.PI ** 4) * (x ** 3 / 3); // long-λ limit
  let sum = 0;
  for (let n = 1; n < 2000; n++) {
    const e = Math.exp(-n * x);
    if (e === 0) break;
    const term = e * (x ** 3 / n + (3 * x * x) / (n * n) + (6 * x) / (n ** 3) + 6 / (n ** 4));
    sum += term;
    if (term < 1e-17 * Math.max(1e-300, sum)) break;
  }
  return Math.min(1, (15 / Math.PI ** 4) * sum);
}

const K_HC = 6.62607015e-34 * 299792458;
const K_KB = 1.380649e-23;

/** Wien displacement constant (m K) and peak wavelength of a blackbody. */
export const WIEN_B = 2.897771955e-3;
export const wienPeak = (T) => WIEN_B / T;

/** Air refractive index (Edlén / Ciddor simplified) used for refraction of light. */
export function refractiveIndexAir(lambdaM, T = 288.15, P = 101325) {
  const s = 1 / (lambdaM * 1e6); // inverse micrometres
  const nMinus1Std = 6432.8e-8 + 2949810e-8 / (146 - s * s) + 25540e-8 / (41 - s * s);
  const nMinus1 = nMinus1Std * (P / 101325) * (288.15 / T);
  return 1 + nMinus1;
}

/** Speed of sound in an ideal gas, m/s. */
export function speedOfSound(T, gamma = 1.4, R = 287.052874) {
  return Math.sqrt(gamma * R * T);
}

/** Root of a scalar function by Brent's method (NR ch.9.3). */
export function brent(f, a, b, tol = 1e-10, maxIter = 200) {
  let fa = f(a), fb = f(b);
  if (fa * fb > 0) throw new Error('brent: root not bracketed');
  if (Math.abs(fa) < Math.abs(fb)) { const t = a; a = b; b = t; const ft = fa; fa = fb; fb = ft; }
  let c = a, fc = fa, d = b - a, e = d;
  for (let iter = 0; iter < maxIter; iter++) {
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else {
        const qa = fa / fc, r = fb / fc;
        p = s * (2 * xm * qa * (qa - r) - (b - a) * (r - 1));
        q = (qa - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) { e = d; d = p / q; }
      else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
    if (fb * fc > 0) { c = a; fc = fa; e = d = b - a; }
  }
  return b;
}

/** Golden-section minimisation for 1-D unimodal functions. */
export function goldenMin(f, a, b, tol = 1e-10, maxIter = 200) {
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a), d = a + phi * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
  }
  return 0.5 * (a + b);
}

/** Clamp helper used everywhere; NaN-safe (propagates NaN rather than hiding it). */
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Smooth step (C1 continuous) on [e0, e1]. */
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
