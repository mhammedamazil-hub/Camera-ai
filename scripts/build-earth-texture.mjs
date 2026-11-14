#!/usr/bin/env node
/**
 * PROJECT TERRA — physically-derived Earth surface texture.
 *
 * Rather than shipping a stock satellite image (whose provenance and
 * colour-correctness we could not verify), we render the day-side surface
 * from the DEM we validated, using a documented, testable colour model.
 *
 * The colour at a point is a function of
 *   - elevation (bathymetry for the ocean, biome for land)
 *   - latitude (ice, boreal, temperate, tropical, arid belts)
 *   - the fact that land and ocean albedo differ strongly
 *
 * This is a VISUALISATION, not a measurement. The spectral radiance a real
 * satellite would see depends on atmosphere, sun angle, vegetation state and
 * sensor response. We therefore label this "schematic albedo" in the manifest
 * and in the UI, and keep the physically accurate layers (temperature,
 * pressure, gravity, ...) entirely separate from it.
 *
 * OUTPUT: src/data/textures/earth-day.png  (2161 x 1081, RGB)
 *         with a JSON manifest recording the colour model parameters.
 *
 * WHY NO CANVAS LIBRARY: one would add a heavyweight dependency (and a
 * native build) for 2.3 million pixels. PNG encoding is simple enough to do
 * with zlib, which ships with Node.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEM = path.join(ROOT, 'src', 'data', 'elevation.bin');
const META = path.join(ROOT, 'src', 'data', 'elevation-meta.json');
const OUT_DIR = path.join(ROOT, 'src', 'data', 'textures');
const OUT_PNG = path.join(OUT_DIR, 'earth-day.png');
const OUT_META = path.join(OUT_DIR, 'earth-day-meta.json');

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const { nx, ny } = meta.grid;
const z = new Int16Array(fs.readFileSync(DEM).buffer.slice(0));

// ---------------------------------------------------------------------------
// Colour model
// ---------------------------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/**
 * Ocean colour: depth-dependent absorption. Real open water radiance falls
 * off roughly exponentially with depth, but the perceived colour shifts from
 * turquoise over shelves (high suspended sediment + shallow bottom
 * reflection) to deep navy in the abyss. We use a two-term blend:
 *   shallow (0 to -200 m): turquoise -> mid blue
 *   deep (-200 to -11000 m): mid blue -> navy
 */
const SHALLOW = [46, 118, 148];
const MID = [22, 68, 120];
const DEEP = [8, 26, 66];

function oceanColour(depth) {
  const d = -depth; // positive metres below sea level
  if (d <= 200) return mixRGB(SHALLOW, MID, clamp01(d / 200));
  return mixRGB(MID, DEEP, clamp01(Math.log(d / 200) / Math.log(11000 / 200)));
}

/**
 * Land colour: a Whittaker-style biome approximation driven by
 *   - elevation above sea level
 *   - absolute latitude
 *   - a deterministic pseudo-random "climate noise" so that the map does not
 *     look like flat bands (it is explicitly noise, not data)
 *
 * The bands are:
 *   0-15 deg   tropical rainforest (dark green) -> savanna (olive)
 *   15-30 deg  desert belt (sand) where it is dry
 *   30-50 deg  temperate forest / grassland (green-brown)
 *   50-66 deg  boreal forest (dark green-grey)
 *   >66 deg    tundra (brown-grey) -> ice (white)
 *   high altitude adds rock and then snow.
 */
const TROPICAL = [26, 74, 38];
const SAVANNA = [122, 118, 62];
const DESERT = [186, 158, 104];
const TEMPERATE = [72, 104, 54];
const GRASSLAND = [124, 128, 76];
const BOREAL = [42, 66, 46];
const TUNDRA = [116, 110, 96];
const ROCK = [104, 96, 88];
const SNOW = [242, 244, 248];

/**
 * Deterministic value noise. This exists ONLY to break up the latitudinal
 * banding so the map reads as a planet; it is NOT a climate dataset and the
 * manifest says so. Two octaves of a hash-based lattice.
 */
function hash2(ix, iy) {
  let h = ix * 374761393 + iy * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}
function fbm(x, y) {
  return 0.6 * valueNoise(x, y) + 0.3 * valueNoise(x * 2.7 + 11, y * 2.7 + 7) +
    0.1 * valueNoise(x * 6.1 + 41, y * 6.1 + 29);
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function landColour(elevation, latDeg, lonDeg) {
  const alat = Math.abs(latDeg);

  // Two noise fields at different scales.
  //  - `warp` perturbs the EFFECTIVE LATITUDE so that biome boundaries are
  //    wavy rather than straight parallels (this is the whole reason real
  //    biome maps do not look like a flag). Depth ~12 deg.
  //  - `m` modulates moisture within a belt.
  const warp = (fbm((lonDeg + 180) * 0.028 + 3.1, (latDeg + 90) * 0.028 + 8.7) - 0.5) * 26;
  const m = fbm((lonDeg + 180) * 0.055 + 17.3, (latDeg + 90) * 0.055 + 2.9);
  const m2 = fbm((lonDeg + 180) * 0.013 + 41.7, (latDeg + 90) * 0.013 + 23.1);
  const alatEff = Math.max(0, alat + warp + (m2 - 0.5) * 10);

  // Blend the biome belts CONTINUOUSLY. Each belt has a centre and the
  // colour is a weighted average of neighbouring belts, so there are no
  // hard edges left to see.
  const belts = [
    { lat: 0, col: TROPICAL },
    { lat: 13, col: SAVANNA },
    { lat: 24, col: DESERT },
    { lat: 38, col: GRASSLAND },
    { lat: 46, col: TEMPERATE },
    { lat: 58, col: BOREAL },
    { lat: 68, col: TUNDRA },
    { lat: 80, col: SNOW },
  ];
  // Gaussian-in-latitude weights, sigma chosen so neighbouring belts overlap.
  const SIGMA = 11;
  let wr = 0, wg = 0, wb = 0, wsum = 0;
  for (const b of belts) {
    const d = (alatEff - b.lat) / SIGMA;
    const w = Math.exp(-d * d);
    wr += b.col[0] * w; wg += b.col[1] * w; wb += b.col[2] * w; wsum += w;
  }
  let c = [wr / wsum, wg / wsum, wb / wsum];

  // Moisture modulation: dry subtropical belts get sandier, wet tropics
  // get darker, temperate land varies between grass and forest.
  const dry = smoothstep(0.30, 0.72, (1 - m) * smoothstep(14, 26, alatEff) * (1 - smoothstep(34, 46, alatEff)));
  c = mixRGB(c, DESERT, dry * 0.55);
  const wet = smoothstep(0.45, 0.8, m) * (1 - smoothstep(30, 50, alatEff));
  c = mixRGB(c, TROPICAL, wet * 0.28);

  // ---------------------------------------------------------------------
  // Elevation: bare rock above the tree line, snow above the snow line.
  // Both lines descend with latitude.
  // ---------------------------------------------------------------------
  const treeLine = 4300 - Math.max(0, alat - 10) * 46;
  const snowLine = 5400 - Math.max(0, alat - 5) * 68;
  if (elevation > treeLine) {
    c = mixRGB(c, ROCK, clamp01((elevation - treeLine) / 800));
  }
  if (elevation > snowLine) {
    c = mixRGB(c, SNOW, clamp01((elevation - snowLine) / 600));
  }
  if (alat > 72) c = mixRGB(c, SNOW, clamp01((alat - 72) / 16));

  return c;
}

/**
 * Lambertian hill-shading. This is a real (if simplified) illumination
 * model: the surface is treated as a diffuse reflector lit by a sun
 * positioned to match the mean insolation geometry, so slopes facing the
 * light are brighter and slopes facing away are darker. It makes the
 * relief legible, which a flat albedo map cannot do.
 *
 * The light vector is fixed at (azimuth 315 deg, elevation 45 deg), the
 * standard cartographic convention, and is documented in the manifest
 * rather than pretending it is a real sun position for a given date.
 */
function hillshade(z, r, c, nx, ny, lat) {
  const i0 = r, i1 = Math.min(ny - 1, r + 1);
  const j0 = c, j1 = Math.min(nx - 1, c + 1);
  const dzdx = (z[i0 * nx + j1] - z[i0 * nx + j0]);
  const dzdy = (z[i1 * nx + j0] - z[i0 * nx + j0]);
  // Convert per-cell differences to a slope in metres per metre.
  const cell = 18532; // 10 arc-minutes at the equator, metres
  const cosLat = Math.max(0.08, Math.cos((lat * Math.PI) / 180));
  const gx = dzdx / cell;
  const gy = dzdy / (cell * cosLat);
  // Light direction (unit vector), azimuth 315 from north, elevation 45.
  const az = (315 * Math.PI) / 180;
  const el = (45 * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(el);
  const ly = Math.cos(az) * Math.cos(el);
  const lz = Math.sin(el);
  const nrm = Math.sqrt(gx * gx + gy * gy + 1);
  const shade = (-gx * lx - gy * ly + lz) / nrm;
  // Map to a multiplier centred on 1 with a modest range so it reads as
  // relief, not as fake lighting.
  return clamp01(0.72 + 0.42 * shade);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const rgb = new Uint8Array(nx * ny * 3);
for (let r = 0; r < ny; r++) {
  const lat = -90 + (r + 0.5) * (180 / ny);
  for (let c = 0; c < nx; c++) {
    const lon = -180 + (c + 0.5) * (360 / nx);
    const e = z[r * nx + c];
    let col;
    if (e < 0) col = oceanColour(e);
    else {
      col = landColour(e, lat, lon);
      // Hill-shading only on land: the ocean surface is flat, and shading
      // the bathymetry would misrepresent it as relief the water does not have.
      const k = hillshade(z, r, c, nx, ny, lat);
      col = [col[0] * k, col[1] * k, col[2] * k];
    }
    const o = (r * nx + c) * 3;
    // The DEM is stored south-up; PNG rows are written top-down, so flip.
    const row = ny - 1 - r;
    const oo = (row * nx + c) * 3;
    void o;
    rgb[oo] = Math.round(clamp01(col[0] / 255) * 255);
    rgb[oo + 1] = Math.round(clamp01(col[1] / 255) * 255);
    rgb[oo + 2] = Math.round(clamp01(col[2] / 255) * 255);
  }
}

// --- Minimal PNG encoder (RGB8, filter 0 per row) ---
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(nx, 0);
ihdr.writeUInt32BE(ny, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // colour type: truecolour
ihdr[10] = 0;  // deflate
ihdr[11] = 0;  // adaptive filtering
ihdr[12] = 0;  // no interlace

const raw = Buffer.alloc(ny * (1 + nx * 3));
for (let r = 0; r < ny; r++) {
  raw[r * (1 + nx * 3)] = 0; // filter type none
  rgb.subarray(r * nx * 3, (r + 1) * nx * 3).forEach((v, i) => {
    raw[r * (1 + nx * 3) + 1 + i] = v;
  });
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PNG, png);

// Validate the render by sampling known regions and asserting the colour is
// in the right family. A silently-broken texture is worse than none.
function sample(lat, lon) {
  const r = Math.floor((lat + 90) / (180 / ny));
  const c = Math.floor((lon + 180) / (360 / nx));
  const row = ny - 1 - r;
  const o = (row * nx + c) * 3;
  return [rgb[o], rgb[o + 1], rgb[o + 2]];
}
const checks = [
  { name: 'Sahara', lat: 23, lon: 13, test: (c) => c[0] > c[2] + 40, why: 'warm land: R >> B' },
  { name: 'Amazon', lat: -3, lon: -60, test: (c) => c[1] > c[0] && c[1] > c[2], why: 'vegetated: G dominant' },
  { name: 'Central Pacific', lat: 0, lon: -150, test: (c) => c[2] > c[0] && c[2] > 40, why: 'deep ocean: blue' },
  { name: 'Antarctica', lat: -80, lon: 0, test: (c) => c[0] > 190 && c[1] > 190 && c[2] > 190, why: 'ice: near-white' },
  { name: 'Continental shelf', lat: 54, lon: 3, test: (c) => c[2] > c[1] && c[2] > 110, why: 'shelf: bright blue' },
];
const report = [];
let failed = false;
for (const k of checks) {
  const c = sample(k.lat, k.lon);
  const ok = k.test(c);
  if (!ok) failed = true;
  report.push({ ...k, rgb: c, pass: ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${k.name.padEnd(18)} rgb(${c.join(',')}) - ${k.why}`);
}
if (failed) {
  throw new Error('Texture colour model failed its own sanity checks');
}

fs.writeFileSync(OUT_META, JSON.stringify({
  kind: 'schematic surface albedo rendering (NOT a satellite photograph)',
  honesty: 'The colours are generated from a documented biome/altitude colour model applied to the validated DEM. They are a visualisation, not measured radiance.',
  source: meta.source,
  resolution: { nx, ny },
  png: { bitDepth: 8, colourType: 'RGB', compression: 'deflate level 9' },
  colourModel: {
    ocean: { shallow: SHALLOW, mid: MID, deep: DEEP, shelfBreakM: 200 },
    land: { tropical: TROPICAL, savanna: SAVANNA, desert: DESERT, temperate: TEMPERATE,
      grassland: GRASSLAND, boreal: BOREAL, tundra: TUNDRA, rock: ROCK, snow: SNOW },
    noise: 'deterministic value-noise fbm, 2 octaves - declared as decoration, not data',
  },
  validation: report,
  bytes: png.length,
}, null, 2));

console.log(`\nWrote ${OUT_PNG} (${(png.length / 1024).toFixed(0)} KB)`);
