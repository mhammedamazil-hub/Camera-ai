/**
 * PROJECT TERRA — scientific field layer validation.
 *
 * These tests exist to protect the central claim of the project: that the
 * number shown on the globe is the number the physics module computed. They
 * check (a) the physics of each layer against independently known values,
 * (b) that every declared colormap range really contains the data (so
 * nothing is silently clipped), and (c) that the 16-bit bake used to send
 * the field to the GPU round-trips the value.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LAYERS, LAYER_BY_ID, probePoint, cmapCSS, cmapRGB, cmapShaderId,
  solarDeclination, solarElevation, sunDirection, kelvinToCelsius,
} from '../src/app/fields.js';
import { elevationGridFromBuffer } from '../src/earth/terrain.js';
import { formatDuration, formatSI, formatDMS } from '../src/app/format.js';

let grid;

beforeAll(() => {
  const buf = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation.bin'));
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation-meta.json'), 'utf8'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  grid = elevationGridFromBuffer(ab, meta);
});

describe('layer catalogue', () => {
  it('every layer has the required metadata', () => {
    for (const l of LAYERS) {
      expect(l.id, 'id').toBeTruthy();
      expect(l.label, `${l.id} label`).toBeTruthy();
      expect(l.note, `${l.id} must document its approximation`).toBeTruthy();
      expect(l.note.length, `${l.id} note is too short to be meaningful`).toBeGreaterThan(20);
    }
  });

  it('every drawable layer declares a range and colormap', () => {
    for (const l of LAYERS.filter((x) => x.sample)) {
      expect(Array.isArray(l.range), `${l.id}`).toBe(true);
      expect(l.range[0], `${l.id} min<max`).toBeLessThan(l.range[1]);
      expect(typeof l.cmap, `${l.id} cmap`).toBe('string');
      expect(cmapShaderId(l.cmap), `${l.id} cmap must exist in the shader`).toBeGreaterThan(0);
    }
  });

  it('has unique ids and a working id lookup', () => {
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(LAYER_BY_ID.get(id)).toBeTruthy();
  });

  it('the surface layer is texture-backed, not field-backed', () => {
    expect(LAYER_BY_ID.get('surface').sample).toBeNull();
  });
});

describe('no layer clips its data', () => {
  it('every sampled value lies inside its declared range', () => {
    // Scan a coarse but planet-wide lattice: 600 x 300 points.
    const failures = [];
    for (const l of LAYERS.filter((x) => x.sample)) {
      let lo = Infinity, hi = -Infinity;
      for (let r = 0; r < grid.ny; r += 4) {
        const lat = -90 + (r + 0.5) * grid.dLat;
        for (let c = 0; c < grid.nx; c += 6) {
          const lon = -180 + (c + 0.5) * grid.dLon;
          const v = l.sample(lat, lon, grid.z[r * grid.nx + c]);
          if (!Number.isFinite(v)) failures.push(`${l.id} produced ${v} at ${lat},${lon}`);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      if (lo < l.range[0] - 1e-9 || hi > l.range[1] + 1e-9) {
        failures.push(
          `${l.id}: data [${lo.toFixed(3)}, ${hi.toFixed(3)}] escapes range ` +
          `[${l.range[0]}, ${l.range[1]}] — the map would saturate`,
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('temperature layer', () => {
  it('is colder at the poles than at the equator', () => {
    const eq = LAYER_BY_ID.get('temperature').sample(0, 0, 0);
    const pole = LAYER_BY_ID.get('temperature').sample(85, 0, 0);
    expect(eq - pole).toBeGreaterThan(25);
  });

  it('applies the ISA lapse rate of 6.5 K/km on land', () => {
    const l = LAYER_BY_ID.get('temperature');
    const sea = l.sample(28, 87, 0);
    const high = l.sample(28, 87, 4000);
    expect(sea - high).toBeCloseTo(0.0065 * 4000, 6);
  });

  it('gives a plausible equatorial sea-surface temperature', () => {
    const t = LAYER_BY_ID.get('temperature').sample(0, -150, -4300);
    expect(t).toBeCloseTo(300, 0);
  });

  it('gives a plausible polar sea-surface temperature', () => {
    const t = LAYER_BY_ID.get('temperature').sample(85, 0, -4000);
    expect(t).toBeGreaterThan(268);
    expect(t).toBeLessThan(273);
  });

  it('does not warm the deep ocean with bathymetry', () => {
    // A second place the bathymetry-as-altitude bug would have shown up.
    const abyss = LAYER_BY_ID.get('temperature').sample(0, -150, -9000);
    const shelf = LAYER_BY_ID.get('temperature').sample(0, -150, -50);
    expect(abyss).toBeCloseTo(shelf, 9);
  });
});

describe('pressure layer', () => {
  const P = () => LAYER_BY_ID.get('pressure');

  it('is 101.325 kPa at sea level in the ISA', () => {
    expect(P().sample(0, 0, 0) / 1000).toBeCloseTo(101.325, 3);
  });

  it('halves around 5.5 km, the classical scale-height result', () => {
    const p0 = P().sample(0, 0, 0);
    const p55 = P().sample(0, 0, 5500);
    expect(p55 / p0).toBeGreaterThan(0.45);
    expect(p55 / p0).toBeLessThan(0.58);
  });

  it('reproduces the pressure at the Everest cell (6033 m) to 1%', () => {
    // ISA at 6033 m: 101325 * (1 - 6.5e-3*6033/288.15)^5.2559 = 47.0 kPa
    expect(P().sample(28, 87, 6033) / 1000).toBeCloseTo(47.0, 0);
  });

  it('puts the ocean surface at sea-level pressure regardless of depth', () => {
    // The DEM value over the ocean is BATHYMETRY. Treating it as altitude
    // would put the sea surface at 107 kPa over the abyssal plain, which is
    // physically meaningless for a map of the surface.
    for (const depth of [-100, -4000, -9878]) {
      expect(P().sample(0, -150, depth) / 1000).toBeCloseTo(101.325, 6);
    }
  });

  it('increases monotonically as elevation falls to sea level', () => {
    let prev = 0;
    for (const h of [8848, 6000, 4000, 2000, 500, 0]) {
      const p = P().sample(0, 0, h);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
});

describe('density layer', () => {
  it('follows the ideal gas law from the pressure and temperature layers', () => {
    const rho = LAYER_BY_ID.get('density').sample(10.9, 75.9, 10);
    const t = LAYER_BY_ID.get('temperature').sample(10.9, 75.9, 10);
    const p = LAYER_BY_ID.get('pressure').sample(10.9, 75.9, 10);
    const expected = p / (287.052874 * t);
    expect(rho).toBeCloseTo(expected, 9);
  });

  it('gives 1.18-1.25 kg/m3 at the surface, as the atmosphere module does', () => {
    const rho = LAYER_BY_ID.get('density').sample(10.9, 75.9, 10);
    expect(rho).toBeGreaterThan(1.1);
    expect(rho).toBeLessThan(1.3);
  });

  it('is about half sea level at the Everest cell', () => {
    const rho = LAYER_BY_ID.get('density').sample(28, 87, 6033);
    expect(rho).toBeGreaterThan(0.55);
    expect(rho).toBeLessThan(0.75);
  });
});

describe('gravity layer', () => {
  const G = () => LAYER_BY_ID.get('gravity');

  it('matches WGS84 normal gravity at the equator and pole', () => {
    // Somigliana: 9.7803253359 at the equator, 9.8321849378 at the pole.
    expect(G().sample(0, 0, 0)).toBeCloseTo(9.7803253359, 6);
    expect(G().sample(90, 0, 0)).toBeCloseTo(9.8321849378, 5);
  });

  it('decreases with elevation at the free-air rate', () => {
    const g0 = G().sample(0, 0, 0);
    const g1 = G().sample(0, 0, 1000);
    // -0.3086 mGal/m = -3.086e-6 m/s^2 per metre
    expect((g0 - g1) / 1000).toBeCloseTo(3.086e-6, 8);
  });

  it('is greater at the poles than the equator by ~0.5%', () => {
    const eq = G().sample(0, 0, 0);
    const po = G().sample(90, 0, 0);
    expect((po - eq) / eq).toBeCloseTo(0.0053, 3);
  });
});

describe('oxygen layer', () => {
  it('is 21.2 kPa at sea level (0.2095 of 101.325)', () => {
    expect(LAYER_BY_ID.get('oxygen').sample(0, 0, 0)).toBeCloseTo(21.23, 1);
  });

  it('is roughly half at the Everest cell, which is why it needs bottled O2', () => {
    const o = LAYER_BY_ID.get('oxygen').sample(28, 87, 6033);
    expect(o).toBeGreaterThan(9);
    expect(o).toBeLessThan(11);
  });
});

describe('crust layer', () => {
  it('is 7 km over the ocean', () => {
    expect(LAYER_BY_ID.get('crust').sample(0, -150, -4300)).toBeCloseTo(7, 6);
  });

  it('is ~39 km for sea-level land (the CRUST1.0 continental mean)', () => {
    expect(LAYER_BY_ID.get('crust').sample(50, 10, 0)).toBeCloseTo(39, 6);
  });

  it('reaches 60+ km under Tibet', () => {
    const c = LAYER_BY_ID.get('crust').sample(33, 88, 5102);
    expect(c).toBeGreaterThan(58);
    expect(c).toBeLessThan(66);
  });
});

describe('16-bit bake round-trip', () => {
  /** Replicates src/app/bake.js without needing a WebGL context. */
  function bakeDecode(layerId, lat, lon) {
    const l = LAYER_BY_ID.get(layerId);
    const r = Math.min(grid.ny - 1, Math.max(0, Math.round((lat + 90) / grid.dLat)));
    const c = ((Math.round((lon + 180) / grid.dLon) % grid.nx) + grid.nx) % grid.nx;
    const elev = grid.z[r * grid.nx + c];
    const realLat = -90 + (r + 0.5) * grid.dLat;
    const realLon = -180 + (c + 0.5) * grid.dLon;
    const v = l.sample(realLat, realLon, elev);
    const [lo, hi] = l.range;
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const v16 = Math.round(t * 65535);
    // Decode exactly as the shader does.
    const tBack = ((v16 >> 8) * 256 + (v16 & 0xff)) / 65535;
    return { direct: v, viaTexture: lo + tBack * (hi - lo), lsb: (hi - lo) / 65535, elev };
  }

  const POINTS = [
    [10.9, 75.9], [28, 87], [23, 13], [0, -150], [-80, 0], [72, -40], [33, 88], [-3, -60],
  ];

  it('never loses more than one quantisation step', () => {
    for (const l of LAYERS.filter((x) => x.sample)) {
      for (const [lat, lon] of POINTS) {
        const { direct, viaTexture, lsb } = bakeDecode(l.id, lat, lon);
        expect(
          Math.abs(viaTexture - direct),
          `${l.id} at ${lat},${lon}`,
        ).toBeLessThanOrEqual(lsb * 1.0001);
      }
    }
  });

  it('the 16-bit encoding is at least 1000x finer than the data range', () => {
    for (const l of LAYERS.filter((x) => x.sample)) {
      const lsb = (l.range[1] - l.range[0]) / 65535;
      const relative = lsb / Math.abs(l.range[1] - l.range[0]);
      expect(relative, l.id).toBeCloseTo(1 / 65535, 8);
    }
  });
});

describe('solar geometry', () => {
  it('declination is near zero at the equinoxes', () => {
    expect(Math.abs(solarDeclination(80))).toBeLessThan(1.5);   // ~21 March
    expect(Math.abs(solarDeclination(264))).toBeLessThan(1.5);  // ~21 September
  });

  it('declination reaches +/-23.45 deg at the solstices', () => {
    expect(solarDeclination(172)).toBeCloseTo(23.45, 0);   // ~21 June
    expect(solarDeclination(355)).toBeCloseTo(-23.45, 0);  // ~21 December
  });

  it('the sun is directly overhead at the subsolar point at local noon', () => {
    // At the June solstice, noon at 23.45 N should put the sun at ~90 deg.
    const elev = solarElevation(23.45, 0, 12, 172);
    expect(elev).toBeGreaterThan(85);
  });

  it('the sun is below the horizon at local midnight', () => {
    expect(solarElevation(23.45, 0, 0, 172)).toBeLessThan(-40);
  });

  it('solar elevation is bounded by +/-90 deg everywhere', () => {
    for (let lat = -90; lat <= 90; lat += 15) {
      for (let ut = 0; ut < 24; ut += 3) {
        const e = solarElevation(lat, 0, ut);
        expect(e).toBeGreaterThanOrEqual(-90.001);
        expect(e).toBeLessThanOrEqual(90.001);
      }
    }
  });

  it('the sun direction is a unit vector', () => {
    for (const ut of [0, 6, 12, 18]) {
      const d = sunDirection(ut);
      const len = Math.hypot(d[0], d[1], d[2]);
      expect(len).toBeCloseTo(1, 9);
    }
  });
});

describe('probe readout', () => {
  it('reports the full physical state at a point', () => {
    const p = probePoint(10.9, 75.9, 10);
    for (const k of ['temperature', 'pressure', 'density', 'gravity', 'oxygen', 'crust', 'celsius']) {
      expect(Number.isFinite(p[k]), k).toBe(true);
    }
  });

  it('marks ocean points and supplies seawater density', () => {
    const p = probePoint(0, -150, -4300);
    expect(p.isLand).toBe(false);
    expect(p.oceanDepthM).toBe(4300);
    expect(p.seaDensity).toBeGreaterThan(1040);
    expect(p.seaDensity).toBeLessThan(1060);
  });

  it('agrees with the ISA module for a sea-level point', () => {
    const p = probePoint(0, 0, 0);
    expect(Number.isFinite(p.isaPressure)).toBe(true);
    expect(p.isaPressure / 1000).toBeCloseTo(101.325, 2);
    expect(p.isaTemperature).toBeCloseTo(288.15, 2);
  });

  it('kelvinToCelsius is exact', () => {
    expect(kelvinToCelsius(273.15)).toBeCloseTo(0, 12);
    expect(kelvinToCelsius(373.15)).toBeCloseTo(100, 12);
  });
});

describe('colormaps', () => {
  it('produces a CSS gradient for every map', () => {
    for (const name of ['thermal', 'pressure', 'density', 'gravity', 'elevation', 'oxygen', 'tectonic']) {
      const css = cmapCSS(name);
      expect(css).toMatch(/^linear-gradient\(90deg/);
      expect(css).toContain('rgb(');
    }
  });

  it('maps the low and high ends of a range onto different colours', () => {
    const lo = cmapRGB('thermal', 0, 0, 1);
    const hi = cmapRGB('thermal', 1, 0, 1);
    const mid = cmapRGB('thermal', 0.5, 0, 1);
    expect(lo).not.toEqual(hi);
    expect(mid).not.toEqual(lo);
    expect(mid).not.toEqual(hi);
  });

  it('clamps out-of-range input instead of producing NaN', () => {
    for (const v of [-5, 0, 0.5, 1, 99]) {
      for (const c of cmapRGB('density', v, 0, 1)) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('formatters', () => {
  it('formats durations with at most two units', () => {
    expect(formatDuration(0.5)).toBe('0.50 s');
    expect(formatDuration(90)).toBe('1 min 30 s');
    expect(formatDuration(90000)).toBe('1 d 1 h');
    expect(formatDuration(31557600)).toBe('1 yr');
  });

  it('handles non-finite input without printing garbage', () => {
    expect(formatDuration(NaN)).toBe('—');
    expect(formatDuration(Infinity)).toBe('—');
    expect(formatSI(NaN)).toBe('—');
  });

  it('applies SI prefixes', () => {
    expect(formatSI(1500)).toBe('1.50 k');
    expect(formatSI(0.0025)).toBe('2.50 m');
    expect(formatSI(0)).toBe('0');
  });

  it('formats coordinates as degrees-minutes-seconds', () => {
    expect(formatDMS(10.9, true)).toMatch(/^10° 54′ .*″ N$/);
    expect(formatDMS(-75.9, false)).toMatch(/W$/);
  });
});
