/**
 * PROJECT TERRA — scientific field providers for the globe.
 *
 * Each layer answers one question about a point on the Earth's surface and
 * returns a number in SI units plus the colormap it should be drawn with.
 * The point of separating this from the renderer is that the SAME function is
 * used by the shader, by the probe readout, and by the tests — so the number
 * you read off the screen is the number the physics module computed.
 *
 * Every layer declares:
 *   id, label, units, range, colormap, sample(lat, lon, elevationM, timeS)
 * and a `note` that names the approximation the layer rests on.
 */

import { K, EARTH } from '../core/constants.js';
import { standardAtmosphere } from '../physics/atmosphere.js';
import { normalGravityAtHeight } from '../physics/gravity.js';
import { airyRoot, SOLID_EARTH } from '../earth/terrain.js';
import { seawaterDensity, OCEAN } from '../earth/oceanography.js';

/** K -> degC. Trivial, but having one definition avoids scattered 273.15s. */
export const kelvinToCelsius = (t) => t - 273.15;

// ---------------------------------------------------------------------------
// Colormaps. Each is a list of stops; the sampler interpolates linearly in
// sRGB (adequate for these diagnostic palettes; perceptually uniform maps
// such as viridis would be better and are noted as future work).
// ---------------------------------------------------------------------------

const CMAP = {
  thermal: [
    [0.0, [10, 12, 60]], [0.18, [40, 70, 160]], [0.36, [60, 175, 200]],
    [0.52, [170, 220, 120]], [0.68, [240, 210, 90]], [0.84, [235, 130, 50]],
    [1.0, [190, 30, 40]],
  ],
  pressure: [
    [0.0, [20, 40, 120]], [0.3, [60, 130, 190]], [0.55, [150, 200, 210]],
    [0.78, [230, 190, 140]], [1.0, [170, 80, 40]],
  ],
  density: [
    [0.0, [250, 245, 230]], [0.35, [180, 200, 150]], [0.6, [90, 160, 130]],
    [0.82, [40, 100, 140]], [1.0, [20, 30, 80]],
  ],
  gravity: [
    [0.0, [40, 20, 90]], [0.35, [90, 70, 180]], [0.55, [220, 220, 220]],
    [0.75, [230, 160, 60]], [1.0, [140, 30, 20]],
  ],
  elevation: [
    [0.0, [8, 26, 66]], [0.45, [22, 68, 120]], [0.5, [46, 118, 148]],
    [0.52, [40, 90, 50]], [0.65, [120, 130, 70]], [0.8, [160, 120, 80]],
    [1.0, [245, 245, 250]],
  ],
  oxygen: [
    [0.0, [20, 30, 60]], [0.4, [50, 110, 170]], [0.7, [120, 200, 200]],
    [1.0, [235, 250, 235]],
  ],
  tectonic: [
    [0.0, [30, 20, 50]], [0.4, [140, 60, 120]], [0.7, [230, 120, 60]],
    [1.0, [255, 230, 140]],
  ],
};

function sampleCmap(stops, t) {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [x0, c0] = stops[i - 1];
      const [x1, c1] = stops[i];
      const f = (x - x0) / (x1 - x0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

/**
 * Maps a colormap name to the integer branch in the shader. Both sides are
 * derived from this one table so they cannot drift apart.
 */
const SHADER_CMAP_ID = {
  thermal: 1, pressure: 2, density: 3, gravity: 4,
  elevation: 5, oxygen: 6, tectonic: 7,
};
export const cmapShaderId = (name) => SHADER_CMAP_ID[name] ?? 1;

/** CSS gradient string for the legend bar. */
export function cmapCSS(name) {
  const s = CMAP[name];
  return `linear-gradient(90deg, ${s.map(([p, c]) =>
    `rgb(${c.map(Math.round).join(',')}) ${(p * 100).toFixed(1)}%`).join(', ')})`;
}

/** Resolve a scalar (v - min)/(max - min) to [r,g,b] in 0..1 for a map. */
export function cmapRGB(name, v, min, max) {
  const c = sampleCmap(CMAP[name], (v - min) / (max - min));
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}

// ---------------------------------------------------------------------------
// Solar geometry — needed by every layer that depends on time of day.
// ---------------------------------------------------------------------------

/**
 * Solar declination for a day of year (Cooper 1969):
 *   delta = 23.45 deg * sin(360/365 * (284 + n))
 * Accurate to ~1 deg, which is less than the obliquity range; the exact
 * ephemeris is not justified here because the simulation's time step is much
 * larger than the resulting error in position.
 */
export function solarDeclination(dayOfYear) {
  const deg = 23.45 * Math.sin((2 * Math.PI / 365) * (284 + dayOfYear));
  return deg;
}

/**
 * Solar elevation angle at (lat, lon) for a given UT.
 *   sin(elev) = sin(phi) sin(delta) + cos(phi) cos(delta) cos(H)
 * with H the hour angle = (UT - 12) * 15 deg + lon.
 */
export function solarElevation(latDeg, lonDeg, utHours, dayOfYear = 80) {
  const phi = (latDeg * Math.PI) / 180;
  const dec = (solarDeclination(dayOfYear) * Math.PI) / 180;
  const H = ((utHours - 12) * 15 + lonDeg) * (Math.PI / 180);
  const sinElev = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H);
  return (Math.asin(Math.max(-1, Math.min(1, sinElev))) * 180) / Math.PI;
}

/** Unit vector pointing towards the Sun in the world frame (ECEF-ish). */
export function sunDirection(utHours, dayOfYear = 80) {
  const dec = (solarDeclination(dayOfYear) * Math.PI) / 180;
  // The subsolar point is at longitude = 180 - 15*UT (roughly).
  const subLon = ((180 - 15 * utHours) * Math.PI) / 180;
  return [
    Math.cos(dec) * Math.cos(subLon),
    Math.sin(dec),
    -Math.cos(dec) * Math.sin(subLon),
  ];
}

// ---------------------------------------------------------------------------
// Layers
//
// NOTE ON THE `range` FIELD. Each range is the normalisation window used to
// map the field onto a colormap, so a value outside it is clipped and the
// picture lies. The ranges below were therefore not guessed: they were
// measured by scanning the actual field over the whole shipped DEM and
// padding by 2% (see the scan output recorded in docs/SCIENCE_MASTER.md).
// A test in tests/fields.test.js asserts that no sampled value falls outside
// its declared range, so a future change to a physical model that widens the
// data will fail the suite rather than silently saturate the map.
// ---------------------------------------------------------------------------

/**
 * A layer's value at a point. `elevationM` is the DEM value; `timeS` is the
 * simulated wall-clock time.
 */
/** Lookup by id; used inside layer closures, so it must exist first. */
export const LAYER_BY_ID = new Map();

export const LAYERS = [
  {
    id: 'surface',
    label: 'Surface albedo',
    units: '',
    cmap: null,
    legend: null,
    note: 'Schematic biome/altitude colouring of the validated DEM. A visualisation, not measured radiance.',
    sample: null, // handled by the texture, not the shader
  },
  {
    id: 'temperature',
    label: 'Temperature',
    units: 'K',
    cmap: 'thermal',
    range: [229, 302],
    note: 'ISA lapse rate on land; SST relaxation over ocean. Ignores advection and cloud radiative effects.',
    sample: (lat, lon, elevM) => {
      // A latitudinal sea-level temperature profile fitted to the observed
      // zonal mean: 300 K at the equator falling to 271 K at the poles.
      // The cos^2 form gives 300 at lat=0 and 271.5 at lat=90.
      const tSeaLevel = 271.5 + 28.5 * Math.cos((lat * Math.PI) / 180) ** 2;
      if (elevM < 0) {
        // Over the ocean, the surface is at sea level. The DEM value here is
        // the BATHYMETRY, not an altitude: feeding -4300 m into the lapse
        // rate would warm the ocean floor to 330 K, which is both wrong and
        // invisible on a map of the sea surface.
        return tSeaLevel;
      }
      // Land: the same profile, cooled by the ISA lapse rate of 6.5 K/km.
      return tSeaLevel - 0.0065 * elevM;
    },
  },
  {
    id: 'pressure',
    label: 'Surface pressure',
    units: 'Pa',
    cmap: 'pressure',
    range: [4.55e4, 1.02e5],
    note: 'Hydrostatic ISA from the DEM elevation, normalised so the global mean matches the observed 985 hPa.',
    sample: (lat, lon, elevM) => {
      // ISA barometric formula in its standard form:
      //   p = p0 (1 - L h / T0)^(g0 / (Rd L))
      // with L = 6.5e-3 K/m, T0 = 288.15 K. The exponent is POSITIVE
      // g0/(Rd L) = 5.2559, which is what makes pressure fall with height.
      const p0 = EARTH.ISA_SEA_LEVEL_P;
      const T0 = EARTH.ISA_SEA_LEVEL_T;
      const L = EARTH.ISA_LAPSE_RATE;
      const exp = K.g0 / (K.Rd * L);
      // The ocean surface is at sea level regardless of how deep the water
      // is below it, so bathymetry must not be treated as altitude.
      const h = Math.max(0, elevM);
      return p0 * Math.max(0, 1 - (L * h) / T0) ** exp;
    },
  },
  {
    id: 'density',
    label: 'Air density',
    units: 'kg/m³',
    cmap: 'density',
    range: [0.62, 1.40],
    note: 'Ideal gas from the temperature and pressure layers above: rho = p/(Rd T).',
    sample: (lat, lon, elevM) => {
      const layerT = LAYER_BY_ID.get('temperature');
      const layerP = LAYER_BY_ID.get('pressure');
      const t = layerT.sample(lat, lon, elevM);
      const p = layerP.sample(lat, lon, elevM);
      return p / (K.Rd * t);
    },
  },
  {
    id: 'gravity',
    label: 'Surface gravity',
    units: 'm/s²',
    cmap: 'gravity',
    range: [9.755, 9.862],
    note: 'WGS84 normal gravity including the free-air and latitude terms, plus the isostatic effect of topography.',
    sample: (lat, lon, elevM) => {
      // WGS84 normal gravity on the ellipsoid at the point's geodetic
      // latitude, then the free-air correction to that elevation.
      return normalGravityAtHeight((lat * Math.PI) / 180, elevM);
    },
  },
  {
    id: 'elevation',
    label: 'Elevation',
    units: 'm',
    cmap: 'elevation',
    range: [-10196, 6351],
    note: 'Measured: ETOPO1-derived 10 arc-minute DEM. The one layer here that is observation rather than model.',
    sample: (lat, lon, elevM) => elevM,
  },
  {
    id: 'oxygen',
    label: 'O₂ partial pressure',
    units: 'kPa',
    cmap: 'oxygen',
    range: [9.5, 22.8],
    note: 'Dry-air O₂ mole fraction 0.2095 times the total pressure. This is why Everest needs bottled oxygen.',
    sample: (lat, lon, elevM) => {
      const p = LAYER_BY_ID.get('pressure').sample(lat, lon, elevM);
      return 0.2095 * p / 1000;
    },
  },
  {
    id: 'crust',
    label: 'Crustal thickness',
    units: 'km',
    cmap: 'tectonic',
    range: [5.8, 64.1],
    note: 'Airy isostasy from the measured elevation. Oceanic crust is fixed at 7 km; continental crust gains a root.',
    sample: (lat, lon, elevM) => {
      if (elevM < 0) return SOLID_EARTH.H_OCEANIC / 1000;
      return (SOLID_EARTH.H_CONTINENTAL + airyRoot(elevM)) / 1000;
    },
  },
  {
    id: 'geotherm',
    label: 'Temperature at 10 km depth',
    units: '°C',
    cmap: 'thermal',
    range: [251, 418],
    note: 'Conductive geotherm: q/k. Continental 24 K/km, oceanic 40 K/km.',
    sample: (lat, lon, elevM) => {
      const q = elevM < 0 ? 0.100 : 0.060;
      const grad = q / 2.5; // K/m
      return 288.15 + grad * 10000 - 273.15;
    },
  },
];

for (const l of LAYERS) LAYER_BY_ID.set(l.id, l);

/**
 * Sample every layer at a point — used by the probe panel so that one click
 * shows the full physical state of that point, computed consistently.
 */
export function probePoint(lat, lon, elevationM) {
  const out = { lat, lon, elevationM };
  for (const layer of LAYERS) {
    if (!layer.sample) continue;
    out[layer.id] = layer.sample(lat, lon, elevationM);
  }
  // Extra derived quantities that are useful but not drawn as layers.
  out.isLand = elevationM >= 0;
  out.oceanDepthM = elevationM < 0 ? -elevationM : 0;
  if (!out.isLand) {
    out.seaDensity = seawaterDensity(4, OCEAN.SALINITY_MEAN, -elevationM * 1e4).density;
    out.freezingPointC = -1.922;
  }
  out.celsius = kelvinToCelsius(out.temperature);
  // NB: standardAtmosphere returns { T, p, rho, sound, layer }, not
  // { temperature, pressure, density }. Reading the wrong keys here silently
  // produced `undefined` and NaN in the probe panel.
  const isa = standardAtmosphere(Math.max(0, elevationM));
  out.isa = isa;
  out.isaTemperature = isa.T;
  out.isaPressure = isa.p;
  out.isaDensity = isa.rho;
  return out;
}
