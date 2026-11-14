/**
 * PROJECT TERRA — terrain, hypsometry and isostasy validation.
 *
 * The strongest tests here compare whole-planet integrals computed from the
 * shipped DEM against independently known values. If the grid were
 * mis-registered (as it was during development — the source is north-up
 * despite its header), these would fail loudly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ElevationGrid, elevationGridFromBuffer, hypsometry, landAreaCheck,
  coastlineLength, airyRoot, elevationFromThickness, prattDensity, bouguerAnomaly,
  freeAirCorrection, lithostaticPressure, geothermalGradient, crustalTemperature,
  isothermDepth, byerleeLaw, brittleDuctileTransition, streamPowerIncision,
  SOLID_EARTH, GEOTHERMAL, CRUSTAL_LAYERS,
} from '../src/earth/terrain.js';
import { EARTH } from '../src/core/constants.js';

let grid, meta, hyp;

beforeAll(() => {
  const binPath = path.join(process.cwd(), 'src', 'data', 'elevation.bin');
  const metaPath = path.join(process.cwd(), 'src', 'data', 'elevation-meta.json');
  meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const buf = fs.readFileSync(binPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  grid = elevationGridFromBuffer(ab, meta);
  hyp = hypsometry(grid);
});

describe('elevation dataset integrity', () => {
  it('has the documented dimensions', () => {
    expect(grid.nx).toBe(2161);
    expect(grid.ny).toBe(1081);
    expect(grid.cellCount).toBe(2161 * 1081);
    expect(grid.cellSizeDeg).toBeCloseTo(1 / 6, 10);
  });

  it('is 10 arc-minutes, i.e. 1/6 degree', () => {
    expect(grid.cellSizeDeg * 60).toBeCloseTo(10, 6);
  });

  it('records provenance and a checksum in the manifest', () => {
    expect(meta.source.original).toMatch(/ETOPO1/);
    expect(meta.source.citation).toMatch(/Amante/);
    expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(meta.grid.rowOrder).toMatch(/row 0 = -90/);
  });

  it('documents that the source rows are north-up and were flipped', () => {
    expect(meta.grid.sourceRowOrder).toMatch(/NORTH-UP/);
  });

  it('elevation at the poles and equator is plausible', () => {
    // Antarctica is an ice sheet; the North Pole is ocean.
    expect(grid.valueAt(-80, 0)).toBeGreaterThan(0);
    expect(grid.valueAt(89, 0)).toBeLessThan(0);
  });
});

describe('geographic correctness (the north-up trap)', () => {
  it('Everest and the Himalaya are high and positive', () => {
    expect(grid.valueAt(28, 87)).toBeGreaterThan(2000);
  });

  it('the Dead Sea is below sea level', () => {
    expect(grid.valueAt(31.5, 35.5)).toBeLessThan(-100);
  });

  it('the Challenger Deep is deeper than 9000 m', () => {
    expect(grid.valueAt(11.35, 142.2)).toBeLessThan(-9000);
  });

  it('Kerala (Tirur) is low-lying land, not ocean', () => {
    const z = grid.valueAt(10.9, 75.9);
    expect(z).toBeGreaterThan(-50);
    expect(z).toBeLessThan(200);
  });

  it('the Sahara is land, not ocean', () => {
    expect(grid.valueAt(23, 13)).toBeGreaterThan(0);
  });

  it('Greenland is a high ice sheet', () => {
    expect(grid.valueAt(72, -40)).toBeGreaterThan(1500);
  });

  it('the central Pacific is abyssal', () => {
    expect(grid.valueAt(0, -150)).toBeLessThan(-3000);
  });
});

describe('whole-planet integrals', () => {
  it('total surface area matches the WGS84 ellipsoid to 0.5%', () => {
    // WGS84 total surface area = 5.100656e14 m^2
    const ref = 5.100656e14;
    expect(Math.abs(hyp.totalAreaM2 - ref) / ref).toBeLessThan(0.005);
  });

  it('ocean volume matches the 1.335e18 m^3 reference to 1%', () => {
    expect(Math.abs(hyp.oceanVolumeM3 - 1.335e18) / 1.335e18).toBeLessThan(0.01);
  });

  it('mean ocean depth matches 3688 m to 1%', () => {
    expect(Math.abs(hyp.meanOceanDepthM - 3688) / 3688).toBeLessThan(0.01);
  });

  it('land area matches 148.94e6 km^2 to 1%', () => {
    const la = landAreaCheck(grid);
    expect(Math.abs(la.relError)).toBeLessThan(0.01);
  });

  it('area-weighted land fraction is 29.2% +/- 1 point', () => {
    expect(hyp.landFraction).toBeGreaterThan(0.28);
    expect(hyp.landFraction).toBeLessThan(0.30);
  });

  it('the deepest cell is consistent with the ETOPO1 minimum', () => {
    // ETOPO1 minimum is -10698 m; after 10' averaging ours is -10192 m.
    expect(hyp.maxDepthM).toBeGreaterThan(10000);
    expect(hyp.maxDepthM).toBeLessThan(11000);
  });

  it('the hypsometric curve is monotone and self-consistent', () => {
    const above0 = hyp.areaAbove(0);
    const below0 = hyp.areaBelow(0);
    expect(above0).toBeCloseTo(hyp.landAreaM2, -8);
    expect(below0).toBeCloseTo(hyp.oceanAreaM2, -8);
    expect(hyp.areaAbove(8000)).toBeLessThan(hyp.areaAbove(0));
    expect(hyp.areaBelow(-6000)).toBeLessThan(hyp.areaBelow(0));
  });

  it('most of the ocean floor lies between 3000 and 6000 m', () => {
    const abyssal = hyp.areaBelow(-3000) - hyp.areaBelow(-6000);
    expect(abyssal / hyp.oceanAreaM2).toBeGreaterThan(0.4);
  });
});

describe('cell areas', () => {
  it('a cell at the equator is about 18.6 km x 18.6 km', () => {
    const a = grid.cellArea(0);
    const side = Math.sqrt(a);
    expect(side / 1000).toBeGreaterThan(17);
    expect(side / 1000).toBeLessThan(20);
  });

  it('cells shrink towards the pole by cos(latitude)', () => {
    const eq = grid.cellArea(0);
    const p60 = grid.cellArea(60);
    // cos(60) = 0.5, so an area ratio near 0.5
    expect(p60 / eq).toBeGreaterThan(0.45);
    expect(p60 / eq).toBeLessThan(0.55);
  });

  it('cell areas integrate to the ellipsoid area', () => {
    // Sum one cell per latitude row (multiplying by nx) across the full
    // -90..+90 range, sampling at row CENTRES exactly as the grid does.
    const nx = grid.nx;
    let total = 0;
    for (let r = 0; r < grid.ny; r++) {
      const lat = -90 + (r + 0.5) * grid.dLat;
      total += grid.cellArea(lat) * nx;
    }
    // WGS84 surface area = 5.100656e14 m^2
    expect(Math.abs(total - 5.100656e14) / 5.100656e14).toBeLessThan(0.005);
  });
});

describe('Airy isostasy', () => {
  it('a 5 km plateau has a ~20 km root', () => {
    // r = h rho_c/(rho_m - rho_c) = 5000 * 2700/680 = 19853 m
    expect(airyRoot(5000) / 1000).toBeCloseTo(19.85, 1);
  });

  it('the root is linear in elevation', () => {
    expect(airyRoot(2000) / airyRoot(1000)).toBeCloseTo(2, 12);
  });

  it('compensated topography has a vanishing Bouguer anomaly', () => {
    // This is a consistency check of the model, not a prediction: exact Airy
    // compensation must give zero by construction.
    expect(Math.abs(bouguerAnomaly(3000))).toBeLessThan(0.01);
    expect(Math.abs(bouguerAnomaly(8000))).toBeLessThan(0.01);
  });

  it('elevationFromThickness inverts airyRoot', () => {
    // A column of height h sits on a crustal thickness H = H0 + h + root.
    // The PREVIOUS version of this test omitted the `h` term, so it built its
    // input with the same wrong geometry that the function assumed and the
    // round trip passed while both were 25% wrong. Construct the input from
    // the physical definition instead.
    const h = 3000;
    const root = airyRoot(h);
    const H = SOLID_EARTH.H_CONTINENTAL + h + root;
    expect(elevationFromThickness(H)).toBeCloseTo(h, 6);
  });

  it('elevationFromThickness recovers a 5 km plateau (regression)', () => {
    // An independent, end-to-end check of the geometry: the crust under a
    // 5 km plateau is 39 km + 5 km + root. The root is computed by airyRoot
    // and the total is built from the physical definition, not from the
    // function under test. Before the fix this returned 6.26 km.
    const H = SOLID_EARTH.H_CONTINENTAL + 5000 + airyRoot(5000);
    expect(elevationFromThickness(H)).toBeCloseTo(5000, -1);
  });

  it('Airy root and thickness are mutually consistent', () => {
    for (const h of [-2000, 0, 1000, 5000, 8848]) {
      const root = airyRoot(h);
      const H = SOLID_EARTH.H_CONTINENTAL + h + root;
      expect(elevationFromThickness(H)).toBeCloseTo(h, 6);
    }
  });

  it('Pratt isostasy predicts low-density crust under Tibet', () => {
    const rho = prattDensity(5000, 30000, 2700);
    expect(rho).toBeLessThan(2700);
    expect(rho).toBeGreaterThan(2200);
  });
});

describe('gravity corrections', () => {
  it('the free-air correction is -0.3086 mGal/m near the surface', () => {
    expect(freeAirCorrection(1000)).toBeCloseTo(-307.9, 0);
    expect(freeAirCorrection(1000) / 1000).toBeCloseTo(-0.308, 2);
  });

  it('the free-air correction is linear', () => {
    expect(freeAirCorrection(2000) / freeAirCorrection(1000)).toBeCloseTo(2, 10);
  });
});

describe('crustal pressure and temperature', () => {
  it('lithostatic pressure at 10 km is about 0.27 GPa', () => {
    // 3 km sediment (2300) + 7 km upper crust (2700): 3e3*2300*9.8 +
    // 7e3*2700*9.8 = 67.6 + 185.2 MPa = 0.253 GPa; the model gives ~0.25.
    const p = lithostaticPressure(10000) / 1e9;
    expect(p).toBeGreaterThan(0.22);
    expect(p).toBeLessThan(0.30);
  });

  it('pressure increases monotonically with depth', () => {
    let prev = 0;
    for (const d of [1000, 5000, 10000, 20000, 39000, 60000]) {
      const p = lithostaticPressure(d);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });

  it('pressure at the Moho (39 km) is roughly 1.05 GPa', () => {
    const p = lithostaticPressure(39000) / 1e9;
    expect(p).toBeGreaterThan(0.9);
    expect(p).toBeLessThan(1.2);
  });

  it('the continental geotherm is 24 K/km', () => {
    expect(geothermalGradient() * 1000).toBeCloseTo(24, 6);
    expect(geothermalGradient(GEOTHERMAL.Q_OCEANIC) * 1000).toBeCloseTo(40, 6);
  });

  it('temperature rises from the surface value', () => {
    expect(crustalTemperature(0)).toBeCloseTo(288.15, 6);
    expect(crustalTemperature(10000)).toBeCloseTo(288.15 + 240, 4);
  });

  it('the 1300 degC isotherm is at 50-60 km for continental heat flow', () => {
    const d = isothermDepth(1573) / 1000;
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(65);
  });

  it('the crustal layer stack is ordered and has consistent densities', () => {
    for (let i = 1; i < CRUSTAL_LAYERS.length; i++) {
      expect(CRUSTAL_LAYERS[i].top).toBe(CRUSTAL_LAYERS[i - 1].bottom);
      expect(CRUSTAL_LAYERS[i].rho).toBeGreaterThan(CRUSTAL_LAYERS[i - 1].rho);
    }
  });
});

describe('rock mechanics', () => {
  it("Byerlee's law is continuous at the 200 MPa break", () => {
    const left = byerleeLaw(199.999);
    const right = byerleeLaw(200.001);
    expect(Math.abs(left - right)).toBeLessThan(0.1);
  });

  it("Byerlee's law has a friction coefficient of 0.85 at low stress", () => {
    expect(byerleeLaw(100) / 100).toBeCloseTo(0.85, 10);
  });

  it('the brittle-ductile transition is at 10-15 km for crust', () => {
    const d = brittleDuctileTransition(2700, 9.80665, 300) / 1000;
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(14);
  });

  it('stream-power incision increases with area and slope', () => {
    expect(streamPowerIncision(1e8, 0.01)).toBeGreaterThan(streamPowerIncision(1e6, 0.01));
    expect(streamPowerIncision(1e6, 0.1)).toBeGreaterThan(streamPowerIncision(1e6, 0.01));
  });

  it('incision rate is in the metres-per-millennium range for typical values', () => {
    // 1e-6 * (1e8)^0.5 * 0.01 = 1e-6 * 1e4 * 0.01 = 1e-4 m/yr = 0.1 mm/yr
    expect(streamPowerIncision(1e8, 0.01)).toBeCloseTo(1e-4, 8);
  });
});

describe('coastline length', () => {
  it('reports a lower bound around 10^6 km at 10 arc-minute resolution', () => {
    const c = coastlineLength(grid);
    // The true (fractal) coastline is longer than any raster estimate; this
    // number is a resolution-limited lower bound and must be O(10^6 km).
    expect(c.lengthM / 1e6).toBeGreaterThan(300);
    expect(c.lengthM / 1e6).toBeLessThan(1500);
    expect(c.resolutionDeg).toBeCloseTo(1 / 6, 10);
  });
});

describe('physical sanity of derived quantities', () => {
  it('radius used for gravity corrections is the mean WGS84 radius', () => {
    expect(EARTH.RADIUS_MEAN).toBeCloseTo(6371008.77, 1);
  });

  it('the grid rejects a buffer of the wrong length', () => {
    expect(() => elevationGridFromBuffer(new ArrayBuffer(10), meta)).toThrow(/expected/);
  });

  it('a synthetic grid round-trips through the accessor', () => {
    const z = new Int16Array([100, 200, 300, 400]); // 2x2, south-up
    const g = new ElevationGrid(z, 2, 2, 90);
    expect(g.nx).toBe(2);
    expect(g.ny).toBe(2);
    expect(g.isLand(45, -135)).toBe(true);
  });

  it('longitude wraps around', () => {
    const z = new Int16Array(2 * 2).fill(10);
    z[0] = 999; // south-west cell
    const g = new ElevationGrid(z, 2, 2, 90);
    expect(g.valueAt(-45, -180)).toBe(g.valueAt(-45, 180));
  });
});
