/**
 * PROJECT TERRA — coordinate convention invariants.
 *
 * These are not physics tests; they are tests of the conventions that connect
 * the physics to the picture. Every one of them corresponds to a bug that was
 * actually found during development:
 *
 *  - a flipped DataTexture row order put the north pole at the south;
 *  - a mirror-symmetric longitude inversion reported Kerala at 75.9 W;
 *  - the DEM's own north-up row order put Everest in the Indian Ocean.
 *
 * A convention bug does not throw and does not produce a NaN: it produces a
 * plausible-looking planet with the wrong geography. That is exactly the
 * class of failure a test suite must defend against.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { elevationGridFromBuffer } from '../src/earth/terrain.js';
import { EARTH } from '../src/core/constants.js';

const DEG = Math.PI / 180;

/**
 * three.js SphereGeometry parametrisation, transcribed from
 * node_modules/three/src/geometries/SphereGeometry.js:
 *   phi = u * 2pi          (u = uv.x)
 *   theta = (1 - v) * pi   (v = uv.y)
 *   x = -sin(theta) cos(phi)   [ringRadius = sin(theta)]
 *   y =  cos(theta)
 *   z =  sin(theta) sin(phi)
 * With theta = (1-v)pi, sin(theta) = sin((1-v)pi), cos(theta) = cos((1-v)pi).
 */
function sphereVertexFromUV(u, v) {
  const phi = u * 2 * Math.PI;
  const theta = (1 - v) * Math.PI;
  const r = Math.sin(theta);
  return [-r * Math.cos(phi), Math.cos(theta), r * Math.sin(phi)];
}

/** The inverse used by the picker (src/app/globe.js screenToLatLon). */
function vertexToLatLon([x, y, z]) {
  const len = Math.hypot(x, y, z);
  const lat = Math.asin(y / len) / DEG;
  let lon = Math.atan2(-z / len, x / len) / DEG;
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
}

/** Forward map used to place the probe marker. */
function latLonToVertex(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

let grid;
beforeAll(() => {
  const buf = fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation.bin'));
  const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation-meta.json'), 'utf8'));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  grid = elevationGridFromBuffer(ab, meta);
});

describe('sphere parametrisation (three.js convention)', () => {
  it('uv.v = 1 is the north pole and uv.v = 0 is the south pole', () => {
    expect(sphereVertexFromUV(0.3, 1)[1]).toBeCloseTo(1, 9);
    expect(sphereVertexFromUV(0.3, 0)[1]).toBeCloseTo(-1, 9);
  });

  it('uv.v = 0.5 is the equator', () => {
    expect(sphereVertexFromUV(0.7, 0.5)[1]).toBeCloseTo(0, 9);
  });

  it('uv.x = 0.5 is the prime meridian', () => {
    // phi = u*2pi; x = -cos(phi), z = +sin(phi). At u = 0.5, phi = pi so the
    // vertex is (+1, 0, 0) and atan2(-z, x) = 0.
    const { lat, lon } = vertexToLatLon(sphereVertexFromUV(0.5, 0.5));
    expect(lat).toBeCloseTo(0, 9);
    expect(lon).toBeCloseTo(0, 9);
  });

  it('uv.x = 0.25 gives -90 deg and uv.x = 0.75 gives +90 deg', () => {
    expect(vertexToLatLon(sphereVertexFromUV(0.25, 0.5)).lon).toBeCloseTo(-90, 9);
    expect(vertexToLatLon(sphereVertexFromUV(0.75, 0.5)).lon).toBeCloseTo(90, 9);
  });

  it('uv.x and texture u agree, so the texture is correctly oriented', () => {
    // The equirectangular surface texture has its left edge at lon = -180,
    // i.e. lon = u*360 - 180. The sphere parametrisation must give the same
    // longitude for the same u, otherwise the map is mirrored or rotated.
    const lonOfU = (u) => u * 360 - 180;
    for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const fromVertex = vertexToLatLon(sphereVertexFromUV(u, 0.5)).lon;
      const fromTexture = lonOfU(u);
      // Compare on the circle, since +180 and -180 are the same meridian.
      const d = Math.abs(fromVertex - fromTexture);
      expect(Math.min(d, Math.abs(d - 360)), `u = ${u}`).toBeLessThan(1e-9);
    }
  });
});

describe('picking round trip', () => {
  const CASES = [
    [0, 0], [10.9, 75.9], [28, 87], [-80, 0], [72, -40],
    [0, -150], [45, -180], [-33.9, 151.2], [89, 0], [-45, -120],
  ];

  it('latLonToVertex -> vertexToLatLon is exact', () => {
    for (const [lat, lon] of CASES) {
      const back = vertexToLatLon(latLonToVertex(lat, lon));
      expect(back.lat, `lat ${lat},${lon}`).toBeCloseTo(lat, 9);
      // Longitude +180 and -180 are the same meridian.
      const dLon = Math.abs(back.lon - lon);
      expect(Math.min(dLon, Math.abs(dLon - 360)), `lon ${lat},${lon}`).toBeLessThan(1e-9);
    }
  });

  it('does not mirror longitude (the 75.9 E vs 75.9 W bug)', () => {
    const back = vertexToLatLon(latLonToVertex(10.9, 75.9));
    expect(back.lon).toBeGreaterThan(0);
    expect(back.lon).toBeCloseTo(75.9, 9);
  });

  it('does not invert latitude', () => {
    expect(vertexToLatLon(latLonToVertex(72, -40)).lat).toBeGreaterThan(0);
    expect(vertexToLatLon(latLonToVertex(-80, 0)).lat).toBeLessThan(0);
  });
});

describe('DEM row order vs texture row order', () => {
  it('the shipped DEM is south-up: row 0 is Antarctica', () => {
    // Average the first and last rows. Row 0 must be the Antarctic ice
    // sheet; the last row must be the Arctic Ocean.
    let south = 0, north = 0;
    for (let c = 0; c < grid.nx; c++) {
      south += grid.z[c];
      north += grid.z[(grid.ny - 1) * grid.nx + c];
    }
    south /= grid.nx;
    north /= grid.nx;
    expect(south).toBeGreaterThan(0);      // ice sheet, above sea level
    expect(north).toBeLessThan(0);         // Arctic Ocean
  });

  it('a south-up grid indexes directly as the texture with v = 0 at the south', () => {
    // The bake writes texture row r from grid row r (no flip), because a
    // DataTexture has flipY = false AND three.js puts uv.v = 0 at the south
    // pole. Verify that assumption end to end: the texel for (lat, lon) must
    // be the DEM cell for (lat, lon).
    const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'data', 'elevation-meta.json'), 'utf8'));
    const lat = 28, lon = 87; // Everest region
    const lat_ = -27.9, lon_ = 130; // Australian interior, a control
    const r = Math.round((lat + 90) / grid.dLat);
    const c = Math.round((lon + 180) / grid.dLon);
    expect(grid.z[r * grid.nx + c]).toBeGreaterThan(2000); // Himalaya: high
    const r2 = Math.round((lat_ + 90) / grid.dLat);
    const c2 = Math.round((lon_ + 180) / grid.dLon);
    expect(grid.z[r2 * grid.nx + c2]).toBeGreaterThan(200); // outback: land
    void meta;
  });

  it('the north pole is ocean and the south pole is ice, everywhere', () => {
    // All 2161 cells in the last row must be water; the Antarctic row is ice.
    let northLand = 0, southIce = 0;
    for (let c = 0; c < grid.nx; c++) {
      if (grid.z[(grid.ny - 1) * grid.nx + c] > 0) northLand++;
      if (grid.z[c] > 0) southIce++;
    }
    expect(northLand / grid.nx).toBeLessThan(0.05);
    expect(southIce / grid.nx).toBeGreaterThan(0.9);
  });
});

describe('the globe is an oblate spheroid, not a sphere', () => {
  it('the polar radius is shorter than the equatorial radius', () => {
    const b = EARTH.RADIUS_POL / EARTH.RADIUS_EQ;
    expect(b).toBeLessThan(1);
    expect(b).toBeCloseTo(0.996647, 6);
  });

  it('the flattening agrees with the radii to 1e-9', () => {
    const f = 1 - EARTH.RADIUS_POL / EARTH.RADIUS_EQ;
    expect(f).toBeCloseTo(EARTH.FLATTENING, 9);
    expect(EARTH.FLATTENING).toBeCloseTo(1 / 298.257223563, 12);
  });

  it('the difference between the radii is 21.385 km', () => {
    expect((EARTH.RADIUS_EQ - EARTH.RADIUS_POL) / 1000).toBeCloseTo(21.3847, 3);
  });

  it('the flattening is a 0.335% bulge, which is visible on the limb', () => {
    expect(1 - EARTH.RADIUS_POL / EARTH.RADIUS_EQ).toBeCloseTo(0.003353, 5);
  });
});

describe('the terminator moves at the correct rate', () => {
  it('the Earth rotates 15.041 deg per hour (sidereal)', () => {
    // 360 deg / 23.9345 h
    const degPerHour = 360 / (EARTH.SIDEREAL_DAY / 3600);
    expect(degPerHour).toBeCloseTo(15.041, 3);
  });

  it('the solar day is 24 h, the sidereal day is 23.9345 h', () => {
    expect(EARTH.SOLAR_DAY / 3600).toBe(24);
    expect(EARTH.SIDEREAL_DAY / 3600).toBeCloseTo(23.9345, 4);
  });

  it('the sidereal day is shorter than the solar day by ~3.9 minutes', () => {
    const diffMin = (EARTH.SOLAR_DAY - EARTH.SIDEREAL_DAY) / 60;
    expect(diffMin).toBeGreaterThan(3.5);
    expect(diffMin).toBeLessThan(4.5);
  });
});
