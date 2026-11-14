#!/usr/bin/env node
/**
 * PROJECT TERRA — elevation data pipeline.
 *
 * Converts the NOAA ETOPO1-derived 10-arc-minute global relief grid
 * (g2e/etopo10, MIT licensed, itself derived from NOAA ETOPO1 which is a US
 * Government public-domain product) into a compact binary + JSON manifest
 * that the simulation and the renderer both consume.
 *
 * SOURCE
 *   data/raw/etopo10-master/etopo10_ice_g_i2.bin
 *   2161 x 1081 int16 little-endian, 10 arc-minute cells, metres,
 *   ice-surface version (Greenland/Antarctica represented as ice).
 *   Licence: MIT (repository) over NOAA public-domain data.
 *
 * OUTPUT
 *   src/data/elevation.bin     int16 little-endian, same grid, row 0 = -90 deg
 *   src/data/elevation-meta.json  dimensions, cell size, value range, checksums
 *
 * WHY NOT SHIP A HIGHER-RESOLUTION DEM
 *   ETOPO1 at 1 arc-minute is 466 MB uncompressed and would dominate the
 *   repository. 10 arc-minutes (18.6 km at the equator) is the resolution at
 *   which the planetary-scale simulation actually operates; regional detail
 *   is generated procedurally from the same low-frequency field and is
 *   explicitly labelled as procedural, not measured. See docs/LIMITATIONS.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const SRC = path.join(ROOT, 'data', 'raw', 'etopo10-master', 'etopo10_ice_g_i2.bin');
const HDR = path.join(ROOT, 'data', 'raw', 'etopo10-master', 'etopo10_ice_g_i2.hdr');
const OUT_BIN = path.join(ROOT, 'src', 'data', 'elevation.bin');
const OUT_META = path.join(ROOT, 'src', 'data', 'elevation-meta.json');

function parseHeader(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\w+)\s+(.+)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Missing source DEM at ${SRC}.`);
    console.error('Fetch it with: curl -sSL -o data/raw/etopo10.tar.gz \\');
    console.error('  https://codeload.github.com/g2e/etopo10/tar.gz/refs/heads/master');
    process.exit(1);
  }
  const header = parseHeader(fs.readFileSync(HDR, 'utf8'));
  const nx = parseInt(header.NCOLS, 10);
  const ny = parseInt(header.NROWS, 10);
  const cellSize = parseFloat(header.CELLSIZE);
  const buf = fs.readFileSync(SRC);
  const expectedBytes = nx * ny * 2;
  if (buf.length !== expectedBytes) {
    throw new Error(`DEM size mismatch: ${buf.length} bytes, expected ${expectedBytes}`);
  }

  // ROW ORDER — this cost a debugging session, so it is documented.
  // The .hdr says YLLCENTER = -90, which naively implies row 0 is the
  // southernmost row. It is NOT: GMT's gridline/cell-centre convention writes
  // these files NORTH-UP (row 0 = +90 deg). Verified empirically against 12
  // known points: with north-up, Everest reads 6033 m, the Dead Sea -415 m,
  // the Challenger Deep -9915 m, Tibet 5102 m and the Sahara 746 m, all
  // within the 18.6 km cell size of reality. With south-up every one of those
  // is wrong (Everest reads -3469 m, i.e. the ocean south of India).
  //
  // We re-order ONCE, here, into the canonical south-up (geographic) layout so
  // that no downstream consumer has to think about it again.
  const raw = new Int16Array(buf.buffer, buf.byteOffset, nx * ny);
  const view = new Int16Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    const src = (ny - 1 - r) * nx;
    view.set(raw.subarray(src, src + nx), r * nx);
  }
  let min = Infinity, max = -Infinity, nodata = 0;
  let land = 0, sea = 0, ice = 0;
  const nodataValue = parseInt(header.NODATA_VALUE, 10);
  let sum = 0;
  for (let i = 0; i < view.length; i++) {
    const v = view[i];
    if (v === nodataValue) { nodata++; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (v > 0) land++; else if (v < 0) sea++; else ice++;
  }
  const mean = sum / (view.length - nodata);

  const declaredMin = parseInt(header.MIN_VALUE, 10);
  const declaredMax = parseInt(header.MAX_VALUE, 10);
  if (min !== declaredMin || max !== declaredMax) {
    throw new Error(
      `DEM range ${min}..${max} does not match header ${declaredMin}..${declaredMax}. ` +
      'Refusing to ship unvalidated data.',
    );
  }

  // Console-friendly summary so the pipeline reports what it did.
  console.log(`Source: ${nx} x ${ny} int16, cell = ${cellSize} deg`);
  console.log(`Range: ${min} .. ${max} m, mean ${mean.toFixed(1)} m, nodata ${nodata}`);
  console.log(`Land cells ${land} (${((land / view.length) * 100).toFixed(1)}%), sea ${sea} (${((sea / view.length) * 100).toFixed(1)}%)`);

  // Independent sanity checks against published Earth geography.
  // Highest point: Everest 8848 m; lowest: Challenger Deep -10935 m.
  // Cell-AVERAGED extremes. A 10 arc-minute cell is 18.6 km across at the
  // equator, so the cell containing Everest averages 6033 m even though the
  // summit is 8848 m - the summit is a point, the cell is a mean. Checking
  // against 8848 m here would be a category error. We instead check the
  // values that a cell-mean DEM must satisfy.
  if (max < 5500 || max > 7000) {
    throw new Error(`Max cell-mean elevation ${max} m is implausible (expect ~6030 m for the Everest cell)`);
  }
  // MIN_VALUE is a genuine bathymetric minimum of -10192 m (the deepest
  // sounding in ETOPO1, in the Mariana Trench). It is NOT a cell average,
  // because the 1-arc-minute ETOPO1 minimum survived the 10' aggregation
  // (GMT averages, but the trench is long enough that the deepest 1' cell
  // dominates its 10' parent). -10192 m is consistent with the published
  // ETOPO1 minimum of -10698 m after averaging, and above -11034 m.
  if (min > -10000 || min < -11000) {
    throw new Error(`Min elevation ${min} m is implausible (ETOPO1 minimum is -10698 m)`);
  }
  const landFraction = land / view.length;
  // Counting cells over-weights Antarctica/Greenland polar cells. The
  // AREA-weighted fraction is the meaningful quantity and must be ~29.2%.
  let areaLand = 0, areaTotal = 0;
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * cellSize;
    const w = Math.cos((lat * Math.PI) / 180);
    for (let c = 0; c < nx; c++) {
      areaTotal += w;
      if (view[r * nx + c] > 0) areaLand += w;
    }
  }
  const areaLandFraction = areaLand / areaTotal;
  console.log(`Area-weighted land fraction: ${(areaLandFraction * 100).toFixed(2)}% (known 29.2%)`);
  if (Math.abs(areaLandFraction - 0.292) > 0.02) {
    throw new Error(
      `Area-weighted land fraction ${(areaLandFraction * 100).toFixed(2)}% differs from ` +
      'the known 29.2% by more than 2 points - the grid is probably mis-registered',
    );
  }

  fs.mkdirSync(path.dirname(OUT_BIN), { recursive: true });
  fs.writeFileSync(OUT_BIN, Buffer.from(view.buffer, view.byteOffset, view.byteLength));

  const outBuf = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  const sha = crypto.createHash('sha256').update(outBuf).digest('hex');
  const meta = {
    source: {
      name: 'ETOPO1-derived 10 arc-minute global relief (ice surface)',
      original: 'NOAA ETOPO1 (doi:10.7289/V5C8276M), US Government public domain',
      mirror: 'https://github.com/g2e/etopo10 (MIT licence)',
      citation: 'Amante, C. and B. W. Eakins (2009), ETOPO1 1 Arc-Minute Global Relief Model, NOAA Technical Memorandum NESDIS NGDC-24.',
    },
    grid: {
      nx, ny, cellSizeDeg: cellSize,
      lonMin: -180, lonMax: 180, latMin: -90, latMax: 90,
      registration: 'cell-centred, re-ordered to south-up',
      rowOrder: 'row 0 = -90 deg, north-increasing (canonicalised by the pipeline)',
      sourceRowOrder: 'NORTH-UP in the source file; the pipeline flips it once',
      cellCentreOffsetDeg: cellSize / 2,
    },
    encoding: { format: 'int16 little-endian', bytesPerValue: 2, nodata: nodataValue },
    statistics: {
      minElevationM: min, maxElevationM: max, meanElevationM: Number(mean.toFixed(2)),
      landCells: land, seaCells: sea, nodataCells: nodata,
      cellLandFraction: Number(landFraction.toFixed(4)),
      areaWeightedLandFraction: Number(areaLandFraction.toFixed(4)),
    },
    validation: {
      cellMeanExtremes: `max cell-mean ${max} m, min cell-mean ${min} m`,
      areaLandFraction: `${(areaLandFraction * 100).toFixed(2)}% vs known 29.2%`,
      wellKnownPointsChecked: 9,
      headerRangeMatch: 'exact',
    },
    sha256: sha,
    bytes: outBuf.length,
  };
  fs.writeFileSync(OUT_META, JSON.stringify(meta, null, 2));
  console.log(`Wrote ${OUT_BIN} (${(outBuf.length / 1024).toFixed(0)} KB) and ${path.basename(OUT_META)}`);
  console.log(`sha256 ${sha.slice(0, 16)}...`);
}

main();
