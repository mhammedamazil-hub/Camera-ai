/**
 * PROJECT TERRA — display formatting helpers.
 *
 * Kept in its own module (rather than inline in main.js) so that it can be
 * unit-tested: a duration formatter that silently prints "NaNs" would be
 * embarrassing on the HUD.
 */

const UNITS = [
  { s: 31557600, name: 'yr' },
  { s: 2629800, name: 'mo' },
  { s: 604800, name: 'wk' },
  { s: 86400, name: 'd' },
  { s: 3600, name: 'h' },
  { s: 60, name: 'min' },
  { s: 1, name: 's' },
];

/**
 * Human-readable duration, at most two units, e.g. "3 d 4 h".
 * Negative input is formatted with a leading minus rather than producing
 * nonsense.
 */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const sign = seconds < 0 ? '-' : '';
  let x = Math.abs(seconds);
  if (x < 1) return `${sign}${x.toFixed(2)} s`;
  const parts = [];
  for (const u of UNITS) {
    if (x >= u.s && parts.length < 2) {
      const n = Math.floor(x / u.s);
      x -= n * u.s;
      parts.push(`${n} ${u.name}`);
    }
  }
  return sign + parts.join(' ');
}

/**
 * A number with an appropriate number of significant figures and a unit
 * prefix, e.g. 1234 -> "1.23 k". Used for the HUD badges.
 */
export function formatSI(v, digits = 3) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const prefixes = [
    [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
  ];
  for (const [scale, p] of prefixes) {
    if (abs >= scale || scale === 1e-12) {
      const n = v / scale;
      return `${n.toPrecision(digits)} ${p}`.trim();
    }
  }
  return `${v}`;
}

/** Coordinates in conventional degrees/minutes/seconds. */
export function formatDMS(deg, isLat) {
  const hemi = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  let x = Math.abs(deg);
  const d = Math.floor(x);
  x = (x - d) * 60;
  const m = Math.floor(x);
  const s = (x - m) * 60;
  return `${d}° ${String(m).padStart(2, '0')}′ ${s.toFixed(1).padStart(4, '0')}″ ${hemi}`;
}
