/**
 * PROJECT TERRA — terrain: digital elevation model, hypsometry, isostasy.
 *
 * This module is the bridge between measured geography (the ETOPO1-derived
 * grid) and the physics the simulation needs (crustal buoyancy, rock pressure,
 * geothermal gradient, erosion). Everything here is either a measured dataset
 * or an equation with published coefficients; nothing is invented.
 *
 * WHY THE ROW ORDER MATTERS
 * The source DEM is north-up despite its header claiming YLLCENTER = -90.
 * The build script flips it once and the manifest records that. Consumers of
 * this module always speak "latitude, longitude" with latitude increasing
 * northward, and the module owns the flip.
 *
 * REFERENCES
 *  - Amante & Eakins (2009), ETOPO1 Global Relief Model, NOAA NESDIS NGDC-24.
 *  - Airy (1855), isostatic compensation of the crust.
 *  - Turcotte & Schubert (2014), *Geodynamics* 3rd ed., ch. 2-4.
 *  - Dziewonski & Anderson (1981), Preliminary Reference Earth Model.
 *  - Jaupart & Mareschal (2011), *Heat Generation and Transport in the Earth*.
 *  - CRUST1.0 (Laske et al. 2013) for crustal thickness averages.
 */

import { K, EARTH } from '../core/constants.js';

// ---------------------------------------------------------------------------
// Gravitational and geothermal constants specific to the solid Earth
// ---------------------------------------------------------------------------

export const SOLID_EARTH = Object.freeze({
  /** Mean crustal density, kg/m^3 (upper continental crust ~2670). */
  RHO_CONTINENTAL_CRUST: 2700,
  /** Oceanic crust (basalt/gabbro), kg/m^3. */
  RHO_OCEANIC_CRUST: 2900,
  /** Mantle density above the transition zone, kg/m^3 (PREM). */
  RHO_MANTLE: 3380,
  /** Asthenosphere density used in flexure, kg/m^3. */
  RHO_ASTHENOSPHERE: 3300,
  /** Water density at 4 degC, kg/m^3. */
  RHO_WATER: 1000,
  /** Mean continental crustal thickness, m (CRUST1.0: 39 km). */
  H_CONTINENTAL: 39000,
  /** Mean oceanic crustal thickness, m (CRUST1.0: 7 km). */
  H_OCEANIC: 7000,
  /** Mean surface heat flow, mW/m^2 (95 mW/m^2 global mean). */
  MEAN_HEAT_FLOW: 0.095,
  /** Thermal conductivity of crust, W/(m K). */
  K_CRUST: 2.5,
  /** Mantle potential temperature, K. */
  T_POTENTIAL: 1585,
  /** Radioactive heat production of average granite, uW/m^3. */
  HEAT_PRODUCTION_GRANITE: 2.5,
  /** Reference sea level used for the hypsometric baseline, m. */
  SLA_REFERENCE: 0,
});

// ---------------------------------------------------------------------------
// The elevation grid
// ---------------------------------------------------------------------------

/**
 * A latitude/longitude elevation field backed by Int16Array.
 * Immutable after construction.
 */
export class ElevationGrid {
  /**
   * @param {Int16Array} z south-up, row-major: row 0 = -90 deg
   * @param {number} nx number of columns
   * @param {number} ny number of rows
   * @param {number} cellSizeDeg angular size of a cell, degrees
   */
  constructor(z, nx, ny, cellSizeDeg) {
    this.z = z;
    this.nx = nx;
    this.ny = ny;
    this.cellSizeDeg = cellSizeDeg;
    this.dLon = cellSizeDeg;
    this.dLat = cellSizeDeg;
    this._buildLandMask();
  }

  _buildLandMask() {
    const n = this.z.length;
    let land = 0;
    for (let i = 0; i < n; i++) if (this.z[i] > 0) land++;
    this.landCells = land;
    this.landFractionCells = land / n;
  }

  /** True if the grid cell at (lat, lon) is land (>= 0 m). */
  isLand(lat, lon) { return this.valueAt(lat, lon) >= 0; }

  /**
   * Nearest-cell elevation in metres. This is a NEAREST-NEIGHBOUR lookup, not
   * interpolation: at 10 arc-minutes the cells are 18.6 km wide, so
   * interpolating between them would invent地势 detail that the data does not
   * contain. Callers that need smooth fields must smooth explicitly.
   */
  valueAt(lat, lon) {
    const i = Math.round((lat + 90) / this.dLat);
    const j = Math.round((lon + 180) / this.dLon);
    const ii = i < 0 ? 0 : i >= this.ny ? this.ny - 1 : i;
    let jj = j % this.nx;
    if (jj < 0) jj += this.nx;
    return this.z[ii * this.nx + jj];
  }

  /** Bytes required by the raw grid. */
  get bytes() { return this.z.byteLength; }

  /** Number of cells. */
  get cellCount() { return this.z.length; }

  /** Area of one cell at latitude `lat`, m^2, on the WGS84 ellipsoid. */
  cellArea(lat) {
    const dLam = (this.dLon * Math.PI) / 180;
    const dPhi = (this.dLat * Math.PI) / 180;
    const a = EARTH.RADIUS_EQ;
    const e2 = EARTH.FLATTENING * (2 - EARTH.FLATTENING);
    const e = Math.sqrt(e2);
    // Exact ellipsoid area element integrated over the cell:
    //   A = a^2 dLam/2 * [ (1-e^2) sin phi / (1 - e^2 sin^2 phi)
    //                      + atanh(e sin phi)/e ] evaluated at both edges
    // F(phi) = a^2/2 * [ (1-e2) sin phi/(1 - e2 sin^2 phi) + atanh(e sin phi)/e ]
    // whose derivative is the standard ellipsoid area element
    //   dA = a^2 (1-e2) cos phi / (1 - e2 sin^2 phi)^2 dphi dlambda.
    const F = (phiDeg) => {
      const sp = Math.sin((phiDeg * Math.PI) / 180);
      const x = Math.min(0.999999, Math.abs(e * sp));
      return a * a * 0.5 * (
        ((1 - e2) * sp) / (1 - e2 * sp * sp) +
        (Math.atanh(x) / e) * Math.sign(sp || 1)
      );
    };
    return dLam * (F(lat + this.dLat / 2) - F(lat - this.dLat / 2));
  }
}

/**
 * Read the shipped elevation grid. Works in Node (fs) and in the browser
 * (fetch) — the caller passes the ArrayBuffer.
 */
export function elevationGridFromBuffer(buffer, meta) {
  const z = new Int16Array(buffer);
  const { nx, ny, cellSizeDeg } = meta.grid;
  if (z.length !== nx * ny) {
    throw new Error(`Elevation buffer has ${z.length} values, expected ${nx * ny}`);
  }
  return new ElevationGrid(z, nx, ny, cellSizeDeg);
}

// ---------------------------------------------------------------------------
// Hypsometry and the ocean volume
// ---------------------------------------------------------------------------

/**
 * Area-weighted hypsometric statistics of an elevation grid.
 * Returns the quantities that matter for the planet's water budget:
 *  - total ocean area and volume (over the grid)
 *  - the hypsometric curves: area above and below a given elevation
 */
export function hypsometry(grid) {
  const { nx, ny } = grid;
  let oceanArea = 0, landArea = 0, oceanVolume = 0;
  let maxDepth = 0, maxHeight = -Infinity;
  // Histogram is far cheaper than sorting 2.3 million values and is exact
  // for integer elevations.
  const HIST_MIN = -11000, HIST_MAX = 9000, BIN = 100;
  const bins = new Float64Array(Math.ceil((HIST_MAX - HIST_MIN) / BIN) + 1);
  const counts = new Uint32Array(bins.length);
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    const a = grid.cellArea(lat);
    for (let c = 0; c < nx; c++) {
      const z = grid.z[r * nx + c];
      if (z > maxHeight) maxHeight = z;
      if (-z > maxDepth) maxDepth = -z;
      let bi = Math.floor((z - HIST_MIN) / BIN);
      if (bi < 0) bi = 0;
      else if (bi >= bins.length) bi = bins.length - 1;
      bins[bi] += a;
      counts[bi]++;
      if (z < 0) {
        oceanArea += a;
        oceanVolume += a * -z;
      } else {
        landArea += a;
      }
    }
  }
  const totalArea = oceanArea + landArea;
  return {
    totalAreaM2: totalArea,
    oceanAreaM2: oceanArea,
    landAreaM2: landArea,
    landFraction: landArea / totalArea,
    oceanVolumeM3: oceanVolume,
    meanOceanDepthM: oceanVolume / oceanArea,
    maxDepthM: maxDepth,
    maxHeightM: maxHeight,
    /** Area above elevation z (m): the hypsometric curve. */
    areaAbove(z) {
      let sum = 0;
      for (let i = 0; i < bins.length; i++) {
        const binCentre = HIST_MIN + (i + 0.5) * BIN;
        if (binCentre > z) sum += bins[i];
      }
      return sum;
    },
    /** Area below elevation z (m). */
    areaBelow(z) {
      let sum = 0;
      for (let i = 0; i < bins.length; i++) {
        const binCentre = HIST_MIN + (i + 0.5) * BIN;
        if (binCentre < z) sum += bins[i];
      }
      return sum;
    },
    histogram: { bins, counts, min: HIST_MIN, max: HIST_MAX, size: BIN },
  };
}

// ---------------------------------------------------------------------------
// Isostasy — why the continents float
// ---------------------------------------------------------------------------

/**
 * AIRY ISOSTASY: a crustal column of density rho_c floating on a mantle of
 * density rho_m. A mountain of height h above the reference has a crustal
 * ROOT of depth r below it:
 *
 *   r = h * rho_c / (rho_m - rho_c)
 *
 * For rho_c = 2670, rho_m = 3300: r = 4.24 h. A 6 km plateau therefore sits on
 * a ~25 km root; this is the standard explanation for why the Himalayas have
 * a thick crust and why gravity over Tibet is close to normal despite the
 * elevation.
 */
export function airyRoot(elevationM, rhoCrust = SOLID_EARTH.RHO_CONTINENTAL_CRUST, rhoMantle = SOLID_EARTH.RHO_MANTLE) {
  return (elevationM * rhoCrust) / (rhoMantle - rhoCrust);
}

/**
 * Inverse: given a measured crustal thickness H (m) under a continental
 * column of reference thickness H0, the elevation is
 *   h = (H - H0) * (rho_m - rho_c)/rho_c   (for a simple two-layer model).
 */
export function elevationFromThickness(crustalThicknessM, H0 = SOLID_EARTH.H_CONTINENTAL,
  rhoCrust = SOLID_EARTH.RHO_CONTINENTAL_CRUST, rhoMantle = SOLID_EARTH.RHO_MANTLE) {
  return ((crustalThicknessM - H0) * (rhoMantle - rhoCrust)) / rhoCrust;
}

/**
 * Pratt isostasy: lateral density variations at a constant compensation
 * depth D. A column of height h+D with mean density rho has
 *   rho = rho0 * D / (D + h).
 * Under Tibet (h = 5 km, D = 30 km) this predicts rho = 2.55e3 vs the
 * standard 2.67e3, i.e. a crustal density deficit, which is what is measured
 * (Tibet is underlain by warm, low-density crust).
 */
export function prattDensity(elevationM, compensationDepthM = 30000, rho0 = SOLID_EARTH.RHO_CONTINENTAL_CRUST) {
  return (rho0 * compensationDepthM) / (compensationDepthM + elevationM);
}

/**
 * Isostatic gravity anomaly: the free-air anomaly is approximately zero over
 * compensated topography. If isostasy were perfect, a plateau would show a
 * Bouguer anomaly proportional to -2 pi G rho h but no free-air anomaly.
 * We return the Bouguer attraction of the topography and the root, in mGal,
 * so callers can compare with gravity observations.
 */
export function bouguerAnomaly(elevationM, rhoCrust = SOLID_EARTH.RHO_CONTINENTAL_CRUST) {
  const rhoMantle = SOLID_EARTH.RHO_MANTLE;
  const root = airyRoot(elevationM, rhoCrust, rhoMantle);
  // Bouguer slab: 2 pi G rho h. 1 mGal = 1e-5 m/s^2.
  const terrain = 2 * Math.PI * K.G * rhoCrust * elevationM;
  // The root replaces mantle of density rho_m with crust of rho_c over depth
  // `root`, giving a negative contribution.
  const rootEffect = 2 * Math.PI * K.G * (rhoMantle - rhoCrust) * root;
  return (terrain - rootEffect) / 1e-5;
}

/**
 * Free-air correction (the "free-air anomaly" of a point measurement at
 * height h above the reference ellipsoid):
 *   dg = -2 g0 h / R  ~ -0.3086 mGal per metre.
 * The exact expression uses the ellipsoid normal gravity gradient.
 */
export function freeAirCorrection(elevationM, g0 = EARTH.RADIUS_MEAN) {
  void g0;
  const dg = -2 * 9.80665 * elevationM / EARTH.RADIUS_MEAN;
  return dg / 1e-5; // mGal
}

// ---------------------------------------------------------------------------
// Pressure and temperature in the crust
// ---------------------------------------------------------------------------

/**
 * Lithostatic pressure at depth z below the surface, integrating a layered
 * density profile (sediment -> upper crust -> lower crust -> mantle).
 *   p(z) = integral rho(z') g(z') dz'
 * With g essentially constant over the crust (it varies by <1% to 35 km).
 */
export const CRUSTAL_LAYERS = Object.freeze([
  { name: 'sediment', top: 0, bottom: 3000, rho: 2300 },
  { name: 'upper crust', top: 3000, bottom: 15000, rho: 2700 },
  { name: 'lower crust', top: 15000, bottom: 39000, rho: 3000 },
  { name: 'mantle lithosphere', top: 39000, bottom: 100000, rho: 3350 },
]);

export function lithostaticPressure(depthM, layers = CRUSTAL_LAYERS, g = 9.80665) {
  let p = 0;
  let remaining = depthM;
  let prev = 0;
  for (const layer of layers) {
    const thickness = Math.min(layer.bottom, depthM) - Math.max(layer.top, prev);
    if (thickness > 0) p += layer.rho * g * thickness;
    prev = layer.bottom;
    if (depthM <= layer.bottom) break;
    void remaining;
  }
  return p;
}

/**
 * Geothermal gradient: heat flow q = k dT/dz, so dT/dz = q/k.
 * With q = 60 mW/m^2 (continental average) and k = 2.5 W/(m K), the gradient
 * is 24 K/km - the textbook continental value. Oceanic crust, with thin
 * sediment and high heat flow (100 mW/m^2), gives 40 K/km.
 */
export const GEOTHERMAL = Object.freeze({
  /** Continental heat flow, W/m^2. */
  Q_CONTINENTAL: 0.060,
  /** Oceanic heat flow, W/m^2. */
  Q_OCEANIC: 0.100,
  /** Crustal thermal conductivity, W/(m K). */
  K_CRUST: 2.5,
  /** Surface temperature used as the top boundary condition, K. */
  T_SURFACE: 288.15,
});

export function geothermalGradient(heatFlowWm2 = GEOTHERMAL.Q_CONTINENTAL, k = GEOTHERMAL.K_CRUST) {
  return heatFlowWm2 / k; // K/m
}

export function crustalTemperature(depthM, heatFlowWm2 = GEOTHERMAL.Q_CONTINENTAL,
  k = GEOTHERMAL.K_CRUST, tSurface = GEOTHERMAL.T_SURFACE) {
  return tSurface + geothermalGradient(heatFlowWm2, k) * depthM;
}

/**
 * Depth to a given isotherm, assuming a conductive geotherm.
 * The 1300 degC (1573 K) isotherm is the base of the mechanical lithosphere.
 */
export function isothermDepth(targetK, heatFlowWm2 = GEOTHERMAL.Q_CONTINENTAL, k = GEOTHERMAL.K_CRUST,
  tSurface = GEOTHERMAL.T_SURFACE) {
  return (targetK - tSurface) / geothermalGradient(heatFlowWm2, k);
}

// ---------------------------------------------------------------------------
// Rock mechanics and erosion (first-order)
// ---------------------------------------------------------------------------

/**
 * Byerlee's law: the shear stress required to slide on a pre-existing fault,
 *   tau = 0.85 sigma_n            for sigma_n < 200 MPa
 *   tau = 50 MPa + 0.6 sigma_n    above
 * with sigma_n the effective normal stress (MPa).
 */
export function byerleeLaw(sigmaNMPa) {
  return sigmaNMPa < 200 ? 0.85 * sigmaNMPa : 50 + 0.6 * sigmaNMPa;
}

/**
 * Depth of the brittle-ductile transition: where the lithostatic stress
 * equals the rock's yield strength. For quartz-rich crust at a strain rate of
 * 1e-14 1/s, this is ~12-15 km; for dry olivine mantle, ~40 km.
 */
export function brittleDuctileTransition(rho = 2700, g = 9.80665, yieldStrengthMPa = 300) {
  return (yieldStrengthMPa * 1e6) / (rho * g);
}

/**
 * Stream-power incision law (Howard & Kerby 1983):
 *   E = K A^m S^n     with m ~ 0.5, n ~ 1.
 * A is upstream drainage area (m^2), S is channel slope (m/m).
 * K depends on climate and lithology: 1e-6 to 1e-4 yr^-1 for m=0.5, n=1.
 */
export function streamPowerIncision(areaM2, slope, K_ = 1e-6, m = 0.5, n = 1) {
  return K_ * areaM2 ** m * Math.abs(slope) ** n; // m/yr
}

/**
 * Hillslope diffusion (erosional):
 *   dz/dt = D grad^2 z
 * D ~ 1e-3 to 1e-2 m^2/yr for soil-mantled uplands.
 */
export const HILLSLOPE_DIFFUSIVITY = Object.freeze({
  SOIL_MANTLED: 0.005,
  BARE_ROCK: 0.0005,
  /** units m^2/yr */
});

// ---------------------------------------------------------------------------
// Continental area and coastline
// ---------------------------------------------------------------------------

/**
 * Estimate the length of the coastline in a grid by counting land/sea
 * transitions and multiplying by the cell edge length. This systematically
 * UNDER-estimates the true coastline (a fractal at all scales); the
 * Richardson exponent for coastlines is ~1.25, so the measured length grows
 * as the resolution is refined. The result is reported as a lower bound.
 */
export function coastlineLength(grid) {
  const { nx, ny } = grid;
  let transitions = 0;
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    const dLatM = (grid.dLat * Math.PI / 180) * EARTH.RADIUS_MEAN;
    const dLonM = (grid.dLon * Math.PI / 180) * EARTH.RADIUS_MEAN * Math.cos((lat * Math.PI) / 180);
    for (let c = 0; c < nx; c++) {
      const here = grid.z[r * nx + c] >= 0;
      // east neighbour
      const east = grid.z[r * nx + ((c + 1) % nx)] >= 0;
      if (here !== east) transitions++;
      // north neighbour
      if (r + 1 < ny) {
        const north = grid.z[(r + 1) * nx + c] >= 0;
        if (here !== north) transitions++;
      }
    }
    void dLatM;
  }
  // Each transition corresponds to one cell edge of length max(dLat, dLon).
  // Take the mean edge length weighted by cell area.
  let edgeSum = 0, w = 0;
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    const dLatM = (grid.dLat * Math.PI / 180) * EARTH.RADIUS_MEAN;
    const dLonM = (grid.dLon * Math.PI / 180) * EARTH.RADIUS_MEAN * Math.cos((lat * Math.PI) / 180);
    const cw = Math.cos((lat * Math.PI) / 180);
    edgeSum += 0.5 * (dLatM + dLonM) * cw;
    w += cw;
  }
  return { lengthM: transitions * (edgeSum / w), transitions, resolutionDeg: grid.dLat };
}

/**
 * Estimate Earth's total land area from the grid, and compare to the
 * 148.94 million km^2 that is usually quoted for land above sea level.
 */
export function landAreaCheck(grid) {
  let land = 0, total = 0;
  const { nx, ny } = grid;
  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    const a = grid.cellArea(lat);
    for (let c = 0; c < nx; c++) {
      total += a;
      if (grid.z[r * nx + c] >= 0) land += a;
    }
  }
  return {
    landAreaM2: land,
    totalAreaM2: total,
    landFraction: land / total,
    /** Reference values (WGS84 ellipsoid, sea level). */
    referenceLandAreaM2: 1.4894e14,
    relError: (land - 1.4894e14) / 1.4894e14,
  };
}

void SOLID_EARTH.SLA_REFERENCE;
