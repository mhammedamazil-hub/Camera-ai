// NYC · Manhattan — a real-scale procedural New York City, built only from code.
//
// Everything is in METRES and placed at real coordinates:
//   origin (0, 0) = 5th Avenue & 34th Street (the Empire State Building block)
//   +x = east, -x = west (Hudson), +z = south (downtown / Battery), -z = north (Central Park)
//   y  = up, water level y = 0
//
// Real numbers used here: 5th→6th Ave = 250 m, avenue→avenue = 250 m, street→street = 80 m,
// Empire State Building 443 m (381 m roof), Chrysler 319 m, One Vanderbilt 427 m,
// 30 Rock 259 m, Central Park Tower 472 m, 432 Park 426 m, One WTC 541 m,
// Central Park 4.07 km × 800 m between 59th and 110th, Brooklyn Bridge 486 m main span.
// Window walls, streets, parks, rivers, bridges and 8 000+ buildings are generated procedurally.

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Stage, Fog, useTimeline } from "../kit/stage";
import { shot, useShot, type Vec3 } from "../kit/camera";
import { Bounce, KeyLight, SkyFill } from "../kit/lights";
import { Caption } from "../kit/overlay";
import { ease, noise3D, progress, rng } from "../kit/motion";
import { shotConfig } from "../shot.config";

/* ==================================================================== */
/* 1 · CONFIG — the editable block                                       */
/* ==================================================================== */

export const NYC = {
  /* light */
  sunTemp: 3400, // low western sun
  sunIntensity: 6.6,
  skyTemp: 10800, // cool sky fill = the cold half of the contrast
  sunAzimuth: 288, // compass degrees (0 = north, 90 = east, 180 = south, 270 = west) → WNW
  sunElevation: 6.5, // degrees; a June sunset in New York, long shadows

  /* atmosphere */
  fogNear: 550,
  fogFar: 8600,
  exposure: 0.92,

  /* film */
  bloom: 0.17,
  halation: 0.26,
  grain: 0.3,
  vignette: 0.26,

  /* frame */
  caption: "MANHATTAN · 40.7484° N 73.9857° W",
  captionFrom: 14,
  captionTo: 9999,

  /* camera — the one move is a slow aerial push south over Central Park */
  camPos: [-300, 400, -2000] as Vec3,
  camTarget: [300, 190, 100] as Vec3,
  camEnd: [-270, 380, -1800] as Vec3,
  driftPx: 2.4,
};

const W = NYC;
const SEED = shotConfig.seed;
/** the colour the whole world dissolves into: sky haze + city smog */
const HORIZON = "#c7c2ba";

/* ==================================================================== */
/* 2 · THE MAP                                                          */
/* ==================================================================== */

const EXTENT = 16000; // ground texture covers 16 km × 16 km
const CX = 0;
const CZ = -1000;
const STREET_PITCH = 80;
const STREET_W = 18;
const AVE_W = 30;
/** 34th Street sits at z = 0, north is negative */
const streetZ = (n: number) => -(n - 34) * STREET_PITCH;

/** [x centre, width] — 5th Avenue is x = 0 */
const AVENUES: [number, number][] = [
  [-1950, 46], // West Side Highway / 12th Ave
  [-1750, 30], // 11th Ave
  [-1500, 30], // 10th Ave
  [-1250, 30], // 9th Ave
  [-1000, 30], // 8th Ave
  [-750, 30], // 7th Ave
  [-500, 30], // 6th Ave
  [0, 30], // 5th Ave
  [200, 24], // Madison Ave
  [420, 43], // Park Ave
  [640, 30], // Lexington Ave
  [860, 30], // 3rd Ave
  [1080, 30], // 2nd Ave
  [1300, 30], // 1st Ave
  [1520, 24], // York Ave
  [1690, 40], // FDR Drive
];

/** Manhattan shoreline (simplified but to scale: 3.7 km wide at 34th St, 21.6 km long) */
const MANHATTAN: [number, number][] = [
  [-300, 2950],
  [350, 2830],
  [780, 2200],
  [1050, 1700],
  [1350, 1200],
  [1550, 500],
  [1680, -300],
  [1750, -1200],
  [1780, -2000],
  [1740, -3000],
  [1650, -4000],
  [1450, -5000],
  [1200, -5600],
  [560, -6060],
  [100, -6300],
  [-350, -6400],
  [-800, -6300],
  [-1200, -6100],
  [-1600, -5800],
  [-1900, -5200],
  [-2000, -4000],
  [-2050, -2500],
  [-2100, -1200],
  [-2150, -200],
  [-2050, 900],
  [-1900, 1800],
  [-1500, 2400],
  [-900, 2700],
];

const ROOSEVELT: [number, number][] = [
  [1830, -2200],
  [1920, -2400],
  [1940, -3400],
  [1880, -4200],
  [1810, -4100],
  [1790, -3000],
];

const JERSEY: [number, number][] = [
  [-2640, 2600],
  [-2680, 400],
  [-2700, -1800],
  [-2500, -4200],
  [-2200, -6600],
  [-8000, -8600],
  [-8000, 7000],
  [-2500, 7000],
  [-2560, 4400],
];

const BROOKLYN_QUEENS: [number, number][] = [
  [2120, 3000],
  [2320, 2500],
  [2700, 2100],
  [2820, 1200],
  [2800, 400],
  [2900, -500],
  [3020, -1600],
  [3200, -3000],
  [3500, -4300],
  [3900, -5400],
  [8000, -5600],
  [8000, 7000],
  [2000, 7000],
];

const BRONX: [number, number][] = [
  [-1400, -6300],
  [600, -6250],
  [1600, -5600],
  [4600, -5700],
  [8000, -6200],
  [8000, -9000],
  [-8000, -9000],
  [-8000, -6800],
];

type Rect = [number, number, number, number]; // x0, z0, x1, z1

const PARKS: { r: Rect; name: string }[] = [
  { r: [-800, -6080, 0, -2000], name: "Central Park" },
  { r: [-2170, -6600, -2010, 1400], name: "Riverside Park" },
  { r: [-580, -940, -430, -860], name: "Bryant Park" },
  { r: [-110, 730, 70, 850], name: "Madison Square Park" },
  { r: [-40, 1230, 140, 1400], name: "Union Square" },
  { r: [-250, 1850, -90, 2030], name: "Washington Square" },
  { r: [-320, 2760, 80, 2920], name: "Battery Park" },
  { r: [-660, -1550, -520, -1430], name: "Rockefeller Plaza" },
  { r: [3260, 5600, 4400, 6500], name: "Prospect Park" },
  { r: [2380, 4700, 2700, 5000], name: "Fort Greene Park" },
  { r: [-3100, 2600, -2900, 3300], name: "Liberty State Park" },
];

/** Broadway — the diagonal that cuts across the grid */
const BROADWAY: [number, number][] = [
  [900, 3450],
  [260, 1700],
  [-40, 500],
  [-300, -700],
  [-720, -1600],
  [-1000, -2000],
  [-1420, -3200],
  [-1750, -5200],
];

const TIMES_SQUARE: Rect = [-640, -1230, -240, -680];

type Landmark = {
  name: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tiers: [number, number][]; // [width scale, height fraction]
  buf: "stone" | "glass" | "chrome" | "glow";
  crown?: "mast" | "spire" | "pyramid" | "none";
  tint: [number, number, number];
};

/** Landmarks at their true coordinates, true heights, true setbacks. */
const LANDMARKS: Landmark[] = [
  {
    name: "Empire State Building",
    x: 0,
    z: 0,
    w: 130,
    d: 60,
    h: 381,
    tiers: [
      [1, 0.07],
      [0.86, 0.16],
      [0.64, 0.1],
      [0.47, 0.3],
      [0.37, 0.15],
      [0.26, 0.22],
    ],
    buf: "stone",
    crown: "mast",
    tint: [1.06, 1.0, 0.92],
  },
  {
    name: "Chrysler Building",
    x: 640,
    z: -720,
    w: 62,
    d: 62,
    h: 240,
    tiers: [
      [1, 0.28],
      [0.9, 0.3],
      [0.76, 0.26],
      [0.6, 0.16],
    ],
    buf: "stone",
    crown: "spire",
    tint: [1.1, 1.04, 0.96],
  },
  {
    name: "One Vanderbilt",
    x: 250,
    z: -720,
    w: 74,
    d: 74,
    h: 427,
    tiers: [
      [1, 0.18],
      [0.88, 0.22],
      [0.7, 0.3],
      [0.52, 0.3],
    ],
    buf: "glass",
    crown: "spire",
    tint: [0.98, 1.02, 1.08],
  },
  {
    name: "30 Rockefeller Plaza",
    x: -560,
    z: -1200,
    w: 140,
    d: 62,
    h: 259,
    tiers: [
      [1, 0.62],
      [0.88, 0.22],
      [0.74, 0.16],
    ],
    buf: "stone",
    crown: "none",
    tint: [1.04, 1.0, 0.94],
  },
  {
    name: "Central Park Tower",
    x: -980,
    z: -2050,
    w: 62,
    d: 52,
    h: 472,
    tiers: [
      [1, 0.42],
      [0.9, 0.3],
      [0.78, 0.28],
    ],
    buf: "stone",
    crown: "mast",
    tint: [1.08, 1.05, 1.0],
  },
  {
    name: "111 West 57th",
    x: -1060,
    z: -1960,
    w: 44,
    d: 34,
    h: 435,
    tiers: [
      [1, 0.5],
      [0.92, 0.26],
      [0.84, 0.24],
    ],
    buf: "stone",
    crown: "spire",
    tint: [1.02, 0.99, 0.94],
  },
  {
    name: "432 Park Avenue",
    x: 440,
    z: -1980,
    w: 30,
    d: 30,
    h: 426,
    tiers: [
      [1, 0.72],
      [0.94, 0.28],
    ],
    buf: "stone",
    crown: "none",
    tint: [1.14, 1.12, 1.08],
  },
  {
    name: "53 West 53rd",
    x: -320,
    z: -1600,
    w: 52,
    d: 46,
    h: 320,
    tiers: [
      [1, 0.3],
      [0.86, 0.34],
      [0.62, 0.22],
      [0.4, 0.14],
    ],
    buf: "glass",
    crown: "spire",
    tint: [0.96, 1.0, 1.06],
  },
  {
    name: "One57",
    x: -900,
    z: -1880,
    w: 52,
    d: 42,
    h: 306,
    tiers: [
      [1, 0.35],
      [0.9, 0.35],
      [0.78, 0.3],
    ],
    buf: "glass",
    crown: "none",
    tint: [0.94, 1.0, 1.1],
  },
  {
    name: "Helmsley Building",
    x: 420,
    z: -950,
    w: 90,
    d: 62,
    h: 166,
    tiers: [
      [1, 0.5],
      [0.9, 0.3],
      [0.78, 0.2],
    ],
    buf: "stone",
    crown: "pyramid",
    tint: [1.08, 1.0, 0.86],
  },
  {
    name: "MetLife Building",
    x: 420,
    z: -830,
    w: 100,
    d: 62,
    h: 246,
    tiers: [
      [1, 0.86],
      [0.9, 0.14],
    ],
    buf: "stone",
    crown: "none",
    tint: [1.0, 0.98, 0.94],
  },
  {
    name: "United Nations Secretariat",
    x: 1330,
    z: -1050,
    w: 90,
    d: 26,
    h: 154,
    tiers: [[1, 1]],
    buf: "glass",
    crown: "none",
    tint: [0.9, 0.98, 1.06],
  },
  {
    name: "Flatiron Building",
    x: 0,
    z: 990,
    w: 22,
    d: 60,
    h: 87,
    tiers: [[1, 1]],
    buf: "stone",
    crown: "none",
    tint: [1.12, 1.04, 0.9],
  },
  {
    name: "Woolworth Building",
    x: -560,
    z: 3050,
    w: 60,
    d: 60,
    h: 241,
    tiers: [
      [1, 0.6],
      [0.7, 0.24],
      [0.44, 0.16],
    ],
    buf: "stone",
    crown: "spire",
    tint: [1.02, 1.06, 0.96],
  },
  {
    name: "8 Spruce Street",
    x: -820,
    z: 3050,
    w: 52,
    d: 52,
    h: 265,
    tiers: [
      [1, 0.7],
      [0.86, 0.3],
    ],
    buf: "chrome",
    crown: "none",
    tint: [0.96, 1.0, 1.05],
  },
  {
    name: "One World Trade Center",
    x: 260,
    z: 5600,
    w: 62,
    d: 62,
    h: 417,
    tiers: [
      [1, 0.2],
      [0.86, 0.25],
      [0.68, 0.3],
      [0.5, 0.25],
    ],
    buf: "glass",
    crown: "mast",
    tint: [0.9, 0.99, 1.1],
  },
  {
    name: "3 World Trade Center",
    x: 520,
    z: 5480,
    w: 60,
    d: 60,
    h: 329,
    tiers: [
      [1, 0.55],
      [0.86, 0.28],
      [0.7, 0.17],
    ],
    buf: "glass",
    crown: "none",
    tint: [0.92, 1.0, 1.08],
  },
  {
    name: "4 World Trade Center",
    x: 0,
    z: 5720,
    w: 58,
    d: 58,
    h: 298,
    tiers: [
      [1, 0.8],
      [0.9, 0.2],
    ],
    buf: "glass",
    crown: "none",
    tint: [0.94, 1.0, 1.06],
  },
  {
    name: "30 Hudson Yards",
    x: -1880,
    z: -40,
    w: 66,
    d: 66,
    h: 387,
    tiers: [
      [1, 0.5],
      [0.9, 0.3],
      [0.76, 0.2],
    ],
    buf: "glass",
    crown: "spire",
    tint: [0.92, 1.0, 1.1],
  },
  {
    name: "35 Hudson Yards",
    x: -1990,
    z: -260,
    w: 54,
    d: 54,
    h: 308,
    tiers: [
      [1, 0.6],
      [0.88, 0.25],
      [0.72, 0.15],
    ],
    buf: "stone",
    crown: "none",
    tint: [1.06, 1.03, 0.98],
  },
  {
    name: "15 Hudson Yards",
    x: -1760,
    z: -320,
    w: 50,
    d: 50,
    h: 279,
    tiers: [
      [1, 0.55],
      [0.9, 0.28],
      [0.78, 0.17],
    ],
    buf: "glass",
    crown: "none",
    tint: [0.94, 1.0, 1.06],
  },
  {
    name: "One Times Square",
    x: -400,
    z: -730,
    w: 34,
    d: 30,
    h: 111,
    tiers: [[1, 1]],
    buf: "glow",
    crown: "none",
    tint: [1, 1, 1],
  },
  {
    name: "Plaza Hotel",
    x: -40,
    z: -2010,
    w: 90,
    d: 60,
    h: 76,
    tiers: [
      [1, 0.7],
      [0.8, 0.3],
    ],
    buf: "stone",
    crown: "pyramid",
    tint: [1.12, 1.06, 0.96],
  },
  {
    name: "St Patrick's Cathedral",
    x: 60,
    z: -1270,
    w: 60,
    d: 100,
    h: 100,
    tiers: [[1, 1]],
    buf: "stone",
    crown: "spire",
    tint: [1.14, 1.1, 1.02],
  },
  {
    name: "Grand Central Terminal",
    x: 420,
    z: -690,
    w: 180,
    d: 90,
    h: 38,
    tiers: [[1, 1]],
    buf: "stone",
    crown: "none",
    tint: [1.1, 1.04, 0.94],
  },
  {
    name: "9 DeKalb Avenue",
    x: 3020,
    z: 5050,
    w: 46,
    d: 46,
    h: 325,
    tiers: [
      [1, 0.6],
      [0.9, 0.22],
      [0.8, 0.18],
    ],
    buf: "stone",
    crown: "spire",
    tint: [0.98, 0.96, 0.94],
  },
  {
    name: "99 Hudson",
    x: -2760,
    z: 4560,
    w: 50,
    d: 46,
    h: 274,
    tiers: [
      [1, 0.6],
      [0.86, 0.24],
      [0.7, 0.16],
    ],
    buf: "stone",
    crown: "none",
    tint: [1.04, 1.02, 1.0],
  },
  {
    name: "Skyline Tower LIC",
    x: 3420,
    z: -2050,
    w: 46,
    d: 46,
    h: 237,
    tiers: [
      [1, 0.65],
      [0.88, 0.25],
      [0.74, 0.1],
    ],
    buf: "glass",
    crown: "none",
    tint: [0.94, 1.0, 1.06],
  },
];

/** Height multipliers around the city's towers. */
const HOTSPOTS: { x: number; z: number; r: number; amp: number }[] = [
  { x: -430, z: -950, r: 780, amp: 1.0 }, // Times Square / west Midtown
  { x: 380, z: -800, r: 700, amp: 0.95 }, // Grand Central / Park Ave
  { x: -120, z: -60, r: 700, amp: 0.85 }, // Empire State / Herald Square
  { x: -1880, z: -200, r: 520, amp: 1.0 }, // Hudson Yards
  { x: -980, z: -1950, r: 420, amp: 1.0 }, // Billionaires' Row
  { x: 0, z: 400, r: 620, amp: 0.45 }, // 23rd–28th
  { x: -300, z: 5100, r: 900, amp: 0.9 }, // Financial District
  { x: -2700, z: 4500, r: 800, amp: 0.85 }, // Jersey City waterfront
  { x: 3400, z: -1900, r: 700, amp: 0.75 }, // Long Island City
  { x: 3000, z: 5100, r: 800, amp: 0.6 }, // Downtown Brooklyn
  { x: -1200, z: 2400, r: 600, amp: 0.3 }, // Tribeca / Soho
];

/* ==================================================================== */
/* 3 · SMALL MATH HELPERS                                               */
/* ==================================================================== */

type V3 = [number, number, number];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function inRect(r: Rect, x: number, z: number, pad = 0) {
  return x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;
}

function pointInPoly(poly: [number, number][], x: number, z: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolyline(line: [number, number][], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    best = Math.min(best, Math.hypot(x - px, z - pz));
  }
  return best;
}

/** Patchy cloud shadow drifting over the city: keeps the light from looking like a flat wash. */
const cloudShade = (x: number, z: number) => {
  const n = noise3D(x / 1250, 0.37, z / 1250, 41) * 0.65 + noise3D(x / 380, 2.1, z / 380, 43) * 0.35;
  return clamp(1 + n * 0.3, 0.62, 1.22);
};

const inPark = (x: number, z: number) => PARKS.some((p) => inRect(p.r, x, z, 6));
const nearLandmark = (x: number, z: number) =>
  LANDMARKS.some((l) => Math.abs(l.x - x) < l.w * 0.6 + Math.max(l.w, l.d) * 0.25 && Math.abs(l.z - z) < l.d * 0.6 + Math.max(l.w, l.d) * 0.25);

/* ==================================================================== */
/* 4 · CITY GENERATION                                                  */
/* ==================================================================== */

type Building = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  style: number; // 0 glass 1 masonry 2 deco-stone 3 pale residential
  variant: number; // 0 / 1 → texture variant
  tint: V3;
  cloud: number; // baked cloud shadow
  roofDetail: 0 | 1 | 2; // 0 none, 1 water tower, 2 mechanical box
};

type CityData = {
  buildings: Building[];
  trees: { x: number; z: number; r: number; tint: V3 }[];
  billboards: { x: number; y: number; z: number; w: number; h: number; rot: number; col: V3 }[];
};

/** 0 = low-rise fabric, 1 = full skyscraper district */
function heatAt(x: number, z: number) {
  let heat = 0;
  for (const s of HOTSPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r * 2.2) heat = Math.max(heat, s.amp * Math.exp(-(d * d) / (s.r * s.r * 0.42)));
  }
  return clamp(heat, 0, 1);
}

function heightAt(x: number, z: number, r: () => number) {
  let h = 19 + r() * 24;
  for (const s of HOTSPOTS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r * 2.2) h += s.amp * 118 * Math.exp(-(d * d) / (s.r * s.r * 0.42));
  }
  // a real skyline is hierarchical: a few towers, plenty of 5–15 storey blocks
  const p = r();
  if (p < 0.02) h *= 2.2 + 1.3 * r();
  else if (p < 0.07) h *= 1.5 + 0.45 * r();
  else if (p < 0.2) h *= 1.15 + 0.2 * r();
  // residential Upper East/West Side is lower and uniform
  if (z < -2300 && (x > 20 || x < -820)) h = clamp(h * 0.62 + 8, 22, 120);
  return clamp(h, 12, 296);
}

function generateCity(seed: number): CityData {
  const r = rng(seed * 7919 + 13);
  const buildings: Building[] = [];
  const trees: CityData["trees"] = [];
  const billboards: CityData["billboards"] = [];

  const push = (x: number, z: number, w: number, d: number, h: number) => {
    const q = r();
    const style = h > 150 ? (q < 0.62 ? 0 : 2) : q < 0.42 ? 0 : q < 0.66 ? 1 : q < 0.9 ? 2 : 3;
    const t = 0.9 + r() * 0.16;
    const tint: V3 = [clamp(t * (0.97 + r() * 0.07), 0.7, 1.15), t, clamp(t * (0.95 + r() * 0.08), 0.7, 1.15)];
    const roofDetail: 0 | 1 | 2 = h < 90 && r() < 0.3 ? 1 : r() < 0.5 ? 2 : 0;
    buildings.push({ x, z, w, d, h, style, variant: r() < 0.5 ? 0 : 1, tint, roofDetail, cloud: cloudShade(x, z) });
  };

  /* ---------- Manhattan: the grid ---------- */
  // Real Manhattan is a continuous street wall of 5–15 storey buildings with towers
  // punching through it. So: one height per block, plus a tower probability per block.
  const zTop = 2900;
  const zBottom = -8300;
  for (let a = 0; a < AVENUES.length - 1; a++) {
    const [xa, wa] = AVENUES[a];
    const [xb, wb] = AVENUES[a + 1];
    const x0 = xa + wa / 2 + 7;
    const x1 = xb - wb / 2 - 7;
    if (x1 - x0 < 26) continue;
    for (let z = zTop; z > zBottom; z -= STREET_PITCH) {
      const zn = z - STREET_W / 2 - 6; // north edge of the block
      const zs = z - STREET_PITCH + STREET_W / 2 + 6; // south edge
      const zc = (zn + zs) / 2;
      const depth = zn - zs;
      if (depth < 20) continue;

      const bx = (x0 + x1) / 2;
      const heat = heatAt(bx, zc);
      const wallH = 16 + heat * 34 + r() * 26; // the street wall: 4–20 storeys
      const towerChance = 0.035 + heat * 0.16;

      const span = x1 - x0;
      const lots = clamp(Math.round(span / (34 + r() * 40)), 2, 6);
      let cur = x0;
      for (let i = 0; i < lots; i++) {
        const remaining = x1 - cur;
        const wLot = i === lots - 1 ? remaining : clamp((span / lots) * (0.72 + r() * 0.62), 18, remaining);
        const cx = cur + wLot / 2;
        cur += wLot;
        if (wLot < 16) continue;

        const twoRows = depth > 46 && r() < 0.4;
        const rows = twoRows ? 2 : 1;
        for (let k = 0; k < rows; k++) {
          const dLot = twoRows ? depth / 2 - 6 : depth;
          const zl = twoRows ? (k === 0 ? zn - dLot / 2 : zs + dLot / 2) : zc;
          if (!pointInPoly(MANHATTAN, cx, zl)) continue;
          if (inPark(cx, zl)) continue;
          if (distToPolyline(BROADWAY, cx, zl) < 26) continue;
          if (nearLandmark(cx, zl)) continue;

          let h = wallH * (0.82 + r() * 0.36);
          if (r() < towerChance) h = wallH * (2.2 + r() * 3.2);
          else if (r() < 0.1) h *= 1.5 + r() * 0.5;
          if (heat < 0.15 && r() < 0.05) h *= 1.8;
          h = clamp(h, 11, heat > 0.45 ? 232 : 132);
          push(cx, zl, wLot - 2, dLot - 2, h);
        }
      }
    }
  }

  /* ---------- Roosevelt Island ---------- */
  for (let z = -2300; z > -4100; z -= 90) {
    if (!pointInPoly(ROOSEVELT, 1870, z)) continue;
    if (r() < 0.45) push(1870, z, 60 + r() * 40, 55, 40 + r() * 90);
  }

  /* ---------- outer boroughs: coarser grids ---------- */
  const borough = (x0: number, x1: number, z0: number, z1: number, ax: number, az: number, poly: [number, number][], hMul: number) => {
    for (let x = x0; x < x1; x += ax) {
      for (let z = z0; z < z1; z += az) {
        const cx = x + (r() - 0.5) * ax * 0.35;
        const cz = z + (r() - 0.5) * az * 0.35;
        if (!pointInPoly(poly, cx, cz)) continue;
        if (inPark(cx, cz)) continue;
        if (nearLandmark(cx, cz)) continue;
        const heat = heatAt(cx, cz);
        let h = (12 + heat * 30 + r() * 22) * hMul;
        if (r() < 0.04 + heat * 0.14) h *= 2.5 + r() * 3.5;
        push(cx, cz, ax * (0.4 + r() * 0.35), az * (0.4 + r() * 0.35), clamp(h, 8, 280));
      }
    }
  };
  borough(-4200, -2650, -1400, 5800, 190, 120, JERSEY, 0.75); // Jersey City / Hoboken
  borough(2450, 5600, 1200, 6900, 200, 120, BROOKLYN_QUEENS, 0.6); // Brooklyn
  borough(2500, 4600, -3600, 1200, 210, 130, BROOKLYN_QUEENS, 0.7); // Queens / LIC
  borough(-1300, 3600, -7900, -6500, 220, 140, BRONX, 0.55); // the Bronx
  borough(-3400, -2300, -6800, -1600, 220, 140, JERSEY, 0.45); // North Bergen

  /* ---------- Central Park trees ---------- */
  const CP = PARKS[0].r;
  const reservoir = { x: -420, z: -4450, rx: 260, rz: 300 };
  const lawn = { x: -520, z: -3300, rx: 210, rz: 260 };
  for (let x = CP[0] + 20; x < CP[2] - 15; x += 52) {
    for (let z = CP[1] + 20; z < CP[3] - 15; z += 52) {
      const jx = x + (r() - 0.5) * 44;
      const jz = z + (r() - 0.5) * 44;
      if (((jx - reservoir.x) / reservoir.rx) ** 2 + ((jz - reservoir.z) / reservoir.rz) ** 2 < 1.05) continue;
      if (((jx - lawn.x) / lawn.rx) ** 2 + ((jz - lawn.z) / lawn.rz) ** 2 < 1.0) continue;
      if (Math.abs(jx - -120) < 26) continue; // the drive
      if (r() < 0.22) continue;
      const g = 0.68 + r() * 0.5;
      trees.push({ x: jx, z: jz, r: 5 + r() * 5.5, tint: [g * 0.62, g, g * 0.42] });
    }
  }
  // Riverside + Battery + Prospect Park trees
  for (const P of [PARKS[1].r, PARKS[6].r, PARKS[8].r, PARKS[9].r]) {
    for (let x = P[0]; x < P[2]; x += 46) {
      for (let z = P[1]; z < P[3]; z += 46) {
        if (r() < 0.55) continue;
        const g = 0.62 + r() * 0.5;
        trees.push({ x: x + (r() - 0.5) * 40, z: z + (r() - 0.5) * 40, r: 5 + r() * 5, tint: [g * 0.62, g, g * 0.42] });
      }
    }
  }

  /* ---------- Times Square billboards ---------- */
  const neon: V3[] = [
    [0.62, 0.16, 0.2],
    [0.7, 0.5, 0.12],
    [0.14, 0.44, 0.62],
    [0.55, 0.2, 0.5],
    [0.22, 0.55, 0.32],
    [0.72, 0.66, 0.58],
  ];
  for (const b of buildings) {
    if (!inRect(TIMES_SQUARE, b.x, b.z, 10)) continue;
    if (b.h < 45) continue;
    const count = 1 + Math.floor(r() * 3);
    for (let i = 0; i < count; i++) {
      const w = 9 + r() * 17;
      const h = 6 + r() * 13;
      const y = 12 + r() * (b.h - 20);
      const face = r();
      const col = neon[Math.floor(r() * neon.length)];
      if (face < 0.62) {
        billboards.push({ x: b.x + (r() - 0.5) * (b.w - w), y, z: b.z - b.d / 2 - 0.6, w, h, rot: 0, col });
      } else {
        billboards.push({ x: b.x - b.w / 2 - 0.6, y, z: b.z + (r() - 0.5) * (b.d - w), w, h, rot: Math.PI / 2, col });
      }
    }
  }
  // the tower at One Times Square is a stack of screens
  for (let i = 0; i < 7; i++) {
    billboards.push({
      x: -400,
      y: 20 + i * 13,
      z: -730 - 15.4,
      w: 30,
      h: 11,
      rot: 0,
      col: neon[i % neon.length],
    });
  }

  return { buildings, trees, billboards };
}

/* ==================================================================== */
/* 5 · GEOMETRY                                                         */
/* ==================================================================== */

type GeoBuf = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] };
const newBuf = (): GeoBuf => ({ pos: [], nor: [], uv: [], col: [], idx: [] });

function addQuad(
  g: GeoBuf,
  a: V3,
  b: V3,
  c: V3,
  d: V3,
  outward: V3,
  uv: [number, number][],
  col: V3,
  colTop?: V3,
) {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-6) return; // degenerate quad: a zero normal becomes NaN in the shader
  n = [n[0] / len, n[1] / len, n[2] / len];
  const flip = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
  if (flip) n = [-n[0], -n[1], -n[2]];
  const pts = [a, b, c, d];
  const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
  const base = g.pos.length / 3;
  const top = colTop ?? col;
  // in the unflipped order the last two corners are the top of the wall
  const cols = flip ? [col, top, top, col] : [col, col, top, top];
  order.forEach((k, i) => {
    g.pos.push(pts[k][0], pts[k][1], pts[k][2]);
    g.nor.push(n[0], n[1], n[2]);
    g.uv.push(uv[k][0], uv[k][1]);
    g.col.push(cols[i][0], cols[i][1], cols[i][2]);
  });
  g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const TILE = 26; // metres per facade texture tile

/** Axis-aligned box: 4 window walls (facade buffer) + top (roof buffer). */
function addBox(g: GeoBuf, roof: GeoBuf, x: number, z: number, w: number, d: number, y0: number, y1: number, col: V3) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const hh = Math.max(0.35, (y1 - y0) / TILE);
  const uw = w / TILE;
  const ud = d / TILE;
  // darker towards the street: cheap ambient occlusion, grounds every building
  const grd = y1 > 34 ? 0.74 : 0.86;
  const low: V3 = [col[0] * grd, col[1] * grd, col[2] * grd];
  // +x
  addQuad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[0, 0], [ud, 0], [ud, hh], [0, hh]], low, col);
  // -x
  addQuad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[0, 0], [ud, 0], [ud, hh], [0, hh]], low, col);
  // +z
  addQuad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[0, 0], [uw, 0], [uw, hh], [0, hh]], low, col);
  // -z
  addQuad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[0, 0], [uw, 0], [uw, hh], [0, hh]], low, col);
  // roof
  const rt = 40;
  addQuad(roof, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / rt, z1 / rt], [x1 / rt, z1 / rt], [x1 / rt, z0 / rt], [x0 / rt, z0 / rt]], col);
}

/** Four-sided pyramid roof (water towers, hotel crowns). */
function addPyramid(g: GeoBuf, x: number, z: number, w: number, d: number, y0: number, h: number, col: V3) {
  const x0 = x - w / 2;
  const x1 = x + w / 2;
  const z0 = z - d / 2;
  const z1 = z + d / 2;
  const apex: V3 = [x, y0 + h, z];
  addTri(g, [x0, y0, z1], [x1, y0, z1], apex, col);
  addTri(g, [x1, y0, z0], [x0, y0, z0], apex, col);
  addTri(g, [x1, y0, z1], [x1, y0, z0], apex, col);
  addTri(g, [x0, y0, z0], [x0, y0, z1], apex, col);
}

/** A beam between two points with a rectangular section (bridge cables, masts). */
function addBeam(g: GeoBuf, p0: V3, p1: V3, w: number, h: number, col: V3) {
  const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const len = dir.length();
  if (len < 1e-3) return;
  dir.normalize();
  const upRef = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, upRef).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const c: V3[] = [];
  for (const p of [p0, p1]) {
    const v = new THREE.Vector3(...p);
    const pts = [
      v.clone().addScaledVector(right, -w / 2).addScaledVector(up, -h / 2),
      v.clone().addScaledVector(right, w / 2).addScaledVector(up, -h / 2),
      v.clone().addScaledVector(right, w / 2).addScaledVector(up, h / 2),
      v.clone().addScaledVector(right, -w / 2).addScaledVector(up, h / 2),
    ];
    for (const q of pts) c.push([q.x, q.y, q.z]);
  }
  const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const out = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
  // sides
  addQuad(g, c[0], c[1], c[5], c[4], out(right.clone().multiplyScalar(-1)), uv, col);
  addQuad(g, c[1], c[2], c[6], c[5], out(right), uv, col);
  addQuad(g, c[2], c[3], c[7], c[6], out(up), uv, col);
  addQuad(g, c[3], c[0], c[4], c[7], out(up.clone().multiplyScalar(-1)), uv, col);
  // caps
  addQuad(g, c[4], c[5], c[6], c[7], out(dir.clone().multiplyScalar(-1)), uv, col);
  addQuad(g, c[0], c[1], c[2], c[3], out(dir), uv, col);
}

/** Tapered cylinder with a cap (landmark crowns, masts). */
function addCylinder(g: GeoBuf, x: number, z: number, r0: number, r1: number, y0: number, y1: number, seg: number, col: V3) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0: V3 = [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0];
    const p1: V3 = [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0];
    const q0: V3 = [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1];
    const q1: V3 = [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1];
    const mid = (a0 + a1) / 2;
    addQuad(g, p0, p1, q1, q0, [Math.cos(mid), 0, Math.sin(mid)], [[0, 0], [1, 0], [1, 1], [0, 1]], col);
  }
}

/** Low-poly tree blob (8 triangles). */
function addBlob(g: GeoBuf, x: number, y: number, z: number, rad: number, col: V3) {
  const top: V3 = [x, y + rad, z];
  const bot: V3 = [x, y - rad * 0.6, z];
  const ring: V3[] = [
    [x + rad, y, z],
    [x, y, z + rad],
    [x - rad, y, z],
    [x, y, z - rad],
  ];
  for (let i = 0; i < 4; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 4];
    addTri(g, a, b, top, col);
    addTri(g, b, a, bot, col);
  }
}

function addTri(g: GeoBuf, a: V3, b: V3, c: V3, col: V3) {
  const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-6) return;
  n = [n[0] / len, n[1] / len, n[2] / len];
  const base = g.pos.length / 3;
  for (const p of [a, b, c]) {
    g.pos.push(p[0], p[1], p[2]);
    g.nor.push(n[0], n[1], n[2]);
    g.uv.push(0, 0);
    g.col.push(col[0], col[1], col[2]);
  }
  g.idx.push(base, base + 1, base + 2);
}

function bufToGeometry(g: GeoBuf) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(g.col, 3));
  geo.setIndex(g.idx);
  geo.computeBoundingSphere();
  return geo;
}

/* ---------- buildings ---------- */

function addBuilding(facade: GeoBuf[], roof: GeoBuf, detail: GeoBuf, b: Building) {
  const g = facade[b.style * 2 + b.variant];
  const nTiers = b.h > 150 ? 3 : b.h > 72 ? 2 : 1;
  const frac = nTiers === 3 ? [0.5, 0.3, 0.2] : nTiers === 2 ? [0.65, 0.35] : [1];
  let y = 0;
  let w = b.w;
  let d = b.d;
  for (let i = 0; i < nTiers; i++) {
    const y1 = y + b.h * frac[i];
    const shade = (0.8 + 0.2 * (i / Math.max(1, nTiers - 1))) * b.cloud;
    const tint: V3 = [b.tint[0] * shade, b.tint[1] * shade, b.tint[2] * shade];
    addBox(g, roof, b.x, b.z, w, d, y, y1, tint);
    if (i < nTiers - 1) {
      w *= 0.76;
      d *= 0.82;
    }
    y = y1;
  }
  // cornice / parapet — catches the low sun and gives every roof a line
  if (b.h < 110 && w > 12) {
    const c = 0.62 + 0.07 * (b.tint[0] + b.tint[2]);
    addBox(detail, roof, b.x, b.z, w * 1.05 + 0.8, d * 1.05 + 0.8, b.h - 1.8, b.h, [c, c * 0.97, c * 0.9]);
  }
  // crown / antenna
  if (b.h > 120) {
    const cw = Math.max(2.5, w * 0.22);
    addBox(detail, roof, b.x, b.z, cw, cw, b.h, b.h + 6 + (b.h % 9), [0.55, 0.55, 0.58]);
  }
  if (b.roofDetail === 1 && b.h < 130 && b.w > 22) {
    // wooden water tower — the signature NYC rooftop object
    const wx = b.x + (b.w > 40 ? b.w * 0.22 : 0);
    const wz = b.z + (b.d > 30 ? b.d * 0.16 : 0);
    const rw = 4.4;
    addBox(detail, roof, wx, wz, rw * 1.7, rw * 1.7, b.h, b.h + 7, [0.34, 0.26, 0.2]);
    addPyramid(detail, wx, wz, rw * 2, rw * 2, b.h + 7, 3.4, [0.26, 0.2, 0.16]);
  } else if (b.roofDetail === 2) {
    const mw = Math.max(4, w * 0.3);
    addBox(detail, roof, b.x - w * 0.14, b.z, mw, mw * 0.8, b.h, b.h + 3.5, [0.62, 0.63, 0.66]);
  }
}

/* ---------- landmarks ---------- */

function addLandmark(
  targets: Record<"stone" | "glass" | "chrome" | "glow", GeoBuf>,
  roof: GeoBuf,
  detail: GeoBuf,
  glow: GeoBuf,
  l: Landmark,
) {
  const g = targets[l.buf];
  let y = 0;
  let w = l.w;
  let d = l.d;
  for (let i = 0; i < l.tiers.length; i++) {
    const [scale, frac] = l.tiers[i];
    const tw = w * scale;
    const td = d * scale;
    const y1 = i === l.tiers.length - 1 ? l.h : y + l.h * frac;
    addBox(g, roof, l.x, l.z, tw, td, y, y1, l.tint);
    y = y1;
  }
  const topW = w * l.tiers[l.tiers.length - 1][0];

  if (l.name === "Chrysler Building") {
    // seven terraced arches + a needle spire
    const crownY = l.h * 0.75;
    let rad = topW * 0.72;
    for (let i = 0; i < 7; i++) {
      const y1 = crownY + i * 5.4;
      addCylinder(targets.chrome, l.x, l.z, rad * 0.86, rad, y1, y1 + 5.6, 12, [0.6, 0.62, 0.66]);
      rad *= 0.85;
    }
    addCylinder(targets.chrome, l.x, l.z, 0.6, rad * 1.15, l.h * 0.75 + 7 * 5.4, l.h + 34, 12, [0.66, 0.68, 0.72]);
  } else if (l.crown === "mast") {
    const mw = Math.max(3, topW * 0.22);
    addBox(detail, roof, l.x, l.z, mw, mw, l.h, l.h + 18, [0.42, 0.43, 0.46]);
    addBeam(detail, [l.x, l.h + 18, l.z], [l.x, l.h + 62, l.z], 1.6, 1.6, [0.5, 0.52, 0.56]);
    addBeam(glow, [l.x, l.h + 61, l.z], [l.x, l.h + 63.5, l.z], 2.2, 2.2, [1.0, 0.25, 0.2]);
  } else if (l.crown === "spire") {
    const sh = Math.min(46, l.h * 0.12);
    for (let i = 0; i < 3; i++) {
      const k = i / 3;
      addBox(detail, roof, l.x, l.z, topW * (0.46 - k * 0.12), topW * (0.46 - k * 0.12), l.h + k * sh, l.h + (k + 1) * sh, [0.44, 0.46, 0.5]);
    }
    addBeam(detail, [l.x, l.h + sh, l.z], [l.x, l.h + sh + 20, l.z], 1.4, 1.4, [0.55, 0.55, 0.58]);
  } else if (l.crown === "pyramid") {
    addPyramid(detail, l.x, l.z, topW * 1.15, topW * 1.15, l.h, Math.max(8, topW * 0.55), [0.5, 0.42, 0.3]);
  }
}

/* ---------- bridges ---------- */

type BridgeSpec = {
  z: number;
  x0: number;
  x1: number;
  deckY: number;
  towerH: number;
  towers: number[];
  deckW: number;
  towers2?: boolean;
  color: V3;
  cableColor: V3;
};

function addBridge(g: GeoBuf, cable: GeoBuf, s: BridgeSpec) {
  const span = s.x1 - s.x0;
  // deck
  addBeam(g, [s.x0, s.deckY, s.z], [s.x1, s.deckY, s.z], span, 3.2, s.color);
  // towers
  for (const tx of s.towers) {
    for (const dz of [-s.deckW / 2, s.deckW / 2]) {
      addBox(g, cable, tx, s.z + dz, 9, 12, 0, s.towerH, s.color);
    }
    // cross beams
    for (const y of [s.deckY + 8, s.towerH * 0.72, s.towerH - 6]) {
      addBeam(g, [tx, y, s.z - s.deckW / 2], [tx, y, s.z + s.deckW / 2], 8, 5, s.color);
    }
  }
  // main cables (catenary) + hangers
  const t0 = s.towers[0];
  const t1 = s.towers[s.towers.length - 1];
  const yTop = s.towerH - 2;
  const sag = s.deckY + 6;
  const cablePts: V3[] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const x = s.x0 + (s.x1 - s.x0) * k;
    // only sag between the towers
    let y = yTop;
    if (x > t0 && x < t1) {
      const u = (x - t0) / (t1 - t0);
      y = yTop - (yTop - sag) * Math.sin(Math.PI * u) * 0.85 - (yTop - sag) * 0.15 * u;
    } else if (x < t0) {
      const u = clamp((x - s.x0) / (t0 - s.x0), 0, 1);
      y = yTop + (1 - u) * 4;
    } else {
      const u = clamp((x - t1) / (s.x1 - t1), 0, 1);
      y = yTop + u * 4;
    }
    cablePts.push([x, y, s.z]);
  }
  for (const dz of [-s.deckW / 2, s.deckW / 2]) {
    for (let i = 0; i < cablePts.length - 1; i++) {
      const a = cablePts[i];
      const b = cablePts[i + 1];
      addBeam(cable, [a[0], a[1], s.z + dz], [b[0], b[1], s.z + dz], 1.5, 1.5, s.cableColor);
    }
    // hangers
    for (let i = 1; i < cablePts.length - 1; i += 1) {
      const p = cablePts[i];
      if (p[1] > s.deckY + 3) addBeam(cable, [p[0], p[1], s.z + dz], [p[0], s.deckY, s.z + dz], 0.7, 0.7, s.cableColor);
    }
  }
}

const BRIDGES: BridgeSpec[] = [
  { z: -1990, x0: 1300, x1: 3300, deckY: 32, towerH: 96, towers: [1980, 2560], deckW: 26, color: [0.52, 0.5, 0.47], cableColor: [0.3, 0.3, 0.32] }, // Queensboro
  { z: 1520, x0: 1250, x1: 2920, deckY: 40, towerH: 102, towers: [1760, 2400], deckW: 30, color: [0.45, 0.44, 0.43], cableColor: [0.32, 0.3, 0.3] }, // Williamsburg
  { z: 3120, x0: 1100, x1: 2700, deckY: 40, towerH: 102, towers: [1620, 2180], deckW: 30, color: [0.32, 0.38, 0.46], cableColor: [0.28, 0.32, 0.4] }, // Manhattan Bridge
  { z: 3720, x0: 900, x1: 2340, deckY: 41, towerH: 84, towers: [1400, 1900], deckW: 26, color: [0.66, 0.62, 0.54], cableColor: [0.35, 0.33, 0.3] }, // Brooklyn Bridge
];

/* ==================================================================== */
/* 6 · TEXTURES (all procedural, no downloads)                          */
/* ==================================================================== */

function makeCanvas(size: number) {
  const el = document.createElement("canvas");
  el.width = el.height = size;
  return { el, c: el.getContext("2d", { willReadFrequently: true })! };
}

function facadeTexture(style: number, variant: number) {
  // Designed to be read from 300 m – 4 km: large-scale structure (piers, floor bands,
  // spandrels) carries the look, individual windows only add a faint rhythm.
  const S = 512;
  const { el, c } = makeCanvas(S);
  const r = rng(style * 31 + variant * 7 + 3);
  const rows = 8; // storeys per 26 m tile
  const ch = S / rows;

  if (style === 0) {
    // curtain wall
    c.fillStyle = ["#77858f", "#7e8c96", "#71808a"][variant];
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < rows; y++) {
      const v = 0.94 + r() * 0.12;
      c.fillStyle = `rgba(${Math.round(96 * v)},${Math.round(108 * v)},${Math.round(120 * v)},0.55)`;
      c.fillRect(0, y * ch + ch * 0.1, S, ch * 0.55);
      c.fillStyle = "rgba(214,222,228,0.20)";
      c.fillRect(0, y * ch + ch * 0.09, S, 2);
      c.fillStyle = "rgba(58,66,74,0.35)";
      c.fillRect(0, y * ch + ch * 0.72, S, ch * 0.18);
    }
    // mullions
    for (let x = 0; x < 8; x++) {
      c.fillStyle = `rgba(206,214,220,${0.1 + r() * 0.08})`;
      c.fillRect(x * (S / 8), 0, 2, S);
    }
  } else if (style === 1) {
    // masonry: brick / brownstone
    c.fillStyle = variant === 0 ? "#7d6b61" : "#88756a";
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = `rgba(${170 + r() * 50},${150 + r() * 40},${136 + r() * 36},${0.04 + r() * 0.06})`;
      c.fillRect(r() * S, r() * S, 6 + r() * 16, 3 + r() * 4);
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < 6; x++) {
        c.fillStyle = `rgba(${70 + r() * 18},${74 + r() * 18},${78 + r() * 18},0.75)`;
        c.fillRect(x * (S / 6) + 14, y * ch + ch * 0.24, S / 6 - 28, ch * 0.44);
      }
      c.fillStyle = "rgba(196,182,166,0.28)";
      c.fillRect(0, y * ch + ch * 0.2, S, 3);
      c.fillStyle = "rgba(48,40,36,0.25)";
      c.fillRect(0, y * ch + ch - 3, S, 3);
    }
  } else if (style === 2) {
    // limestone / art deco: vertical piers, punched windows
    c.fillStyle = variant === 0 ? "#b0a89a" : "#bab2a4";
    c.fillRect(0, 0, S, S);
    for (let x = 0; x < 10; x++) {
      const w = S / 10;
      c.fillStyle = `rgba(96,98,100,${0.34 + r() * 0.12})`;
      c.fillRect(x * w + w * 0.26, 0, w * 0.44, S);
      c.fillStyle = "rgba(240,232,214,0.20)";
      c.fillRect(x * w + w * 0.2, 0, w * 0.06, S);
    }
    for (let y = 0; y < rows; y++) {
      c.fillStyle = "rgba(70,66,58,0.22)";
      c.fillRect(0, y * ch + ch - 3, S, 3);
      c.fillStyle = "rgba(228,220,204,0.14)";
      c.fillRect(0, y * ch + ch * 0.14, S, 3);
    }
  } else {
    // post-war residential: horizontal balcony bands
    c.fillStyle = variant === 0 ? "#a9a8a2" : "#b2b0a8";
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < rows; y++) {
      c.fillStyle = `rgba(${84 + r() * 14},${88 + r() * 14},${92 + r() * 14},0.6)`;
      c.fillRect(0, y * ch + ch * 0.26, S, ch * 0.4);
      c.fillStyle = "rgba(232,228,220,0.5)";
      c.fillRect(0, y * ch + ch * 0.7, S, 5);
      c.fillStyle = "rgba(60,58,54,0.16)";
      c.fillRect(0, y * ch + ch * 0.2, S, 2);
    }
    for (let x = 0; x < 6; x++) {
      c.fillStyle = "rgba(120,118,112,0.12)";
      c.fillRect(x * (S / 6), 0, 2, S);
    }
  }
  // a few lit windows, low key
  for (let i = 0; i < 45; i++) {
    c.fillStyle = `rgba(255,206,150,${0.25 + r() * 0.3})`;
    c.fillRect(Math.floor(r() * 8) * (S / 8) + 4, Math.floor(r() * rows) * ch + ch * 0.3, S / 8 - 10, ch * 0.34);
  }
  // grime towards the street
  const gr = c.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(26,22,18,0.12)");
  c.fillStyle = gr;
  c.fillRect(0, 0, S, S);

  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function roofTexture() {
  const S = 256;
  const { el, c } = makeCanvas(S);
  const r = rng(99);
  c.fillStyle = "#5e5b56";
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 5000; i++) {
    const v = 58 + r() * 60;
    c.fillStyle = `rgba(${v},${v},${v * 0.98},${0.1 + r() * 0.35})`;
    c.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(30,30,32,${0.1 + r() * 0.2})`;
    c.fillRect(r() * S, r() * S, 12 + r() * 60, 8 + r() * 26);
  }
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const w2px = (x: number, S: number) => ((x - CX + EXTENT / 2) / EXTENT) * S;
const py = (z: number, S: number) => ((z - CZ + EXTENT / 2) / EXTENT) * S;
const w2len = (m: number, S: number) => (m / EXTENT) * S;

function pathFromPoly(c: CanvasRenderingContext2D, poly: [number, number][], S: number) {
  c.beginPath();
  poly.forEach(([x, z], i) => {
    const px = w2px(x, S);
    const pz = py(z, S);
    if (i === 0) c.moveTo(px, pz);
    else c.lineTo(px, pz);
  });
  c.closePath();
}

/** The 16 km × 16 km map: water, land, blocks, streets, parks, Broadway and the long shadows. */
function groundTexture(city: CityData) {
  const S = 4096;
  const { el, c } = makeCanvas(S);
  const r = rng(SEED * 977 + 5);

  /* --- water --- */
  const wg = c.createLinearGradient(0, 0, S * 0.35, S);
  wg.addColorStop(0, "#2b3f4e");
  wg.addColorStop(0.45, "#243543");
  wg.addColorStop(1, "#1d2c38");
  c.fillStyle = wg;
  c.fillRect(0, 0, S, S);
  // ripple marks
  for (let i = 0; i < 9000; i++) {
    const x = r() * S;
    const y = r() * S;
    const w = 6 + r() * 46;
    c.strokeStyle = `rgba(${120 + r() * 90},${150 + r() * 70},${170 + r() * 60},${0.015 + r() * 0.04})`;
    c.lineWidth = 0.8 + r() * 1.6;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w, y + (r() - 0.5) * 3);
    c.stroke();
  }

  /* --- land --- */
  const land = (poly: [number, number][], fill: string) => {
    pathFromPoly(c, poly, S);
    c.fillStyle = fill;
    c.fill();
  };
  land(JERSEY, "#3f3a33");
  land(BROOKLYN_QUEENS, "#3f3a33");
  land(BRONX, "#3c3731");
  land(MANHATTAN, "#443f38");
  land(ROOSEVELT, "#443f38");
  // Governors Island + piers
  c.fillStyle = "#44543c";
  c.beginPath();
  c.ellipse(w2px(1350, S), py(5150, S), w2len(330, S), w2len(260, S), 0.3, 0, Math.PI * 2);
  c.fill();
  for (let z = 380; z > -900; z -= 150) {
    c.fillStyle = "#4a463f";
    c.fillRect(w2px(-2380, S), py(z, S), w2len(240, S), w2len(46, S));
  }

  /* --- city blocks --- */
  const blockPalette = ["#4d4841", "#544e46", "#474139", "#5a544b", "#484239", "#514a41"];
  const drawBlocks = (x0: number, x1: number, z0: number, z1: number, ax: number, az: number, poly?: [number, number][]) => {
    if (poly) {
      c.save();
      pathFromPoly(c, poly, S);
      c.clip();
    }
    for (let x = x0; x < x1; x += ax) {
      for (let z = z0; z < z1; z += az) {
        if (r() < 0.12) continue;
        const bw = ax - w2len(24, S);
        const bz = az - w2len(20, S);
        c.fillStyle = blockPalette[Math.floor(r() * blockPalette.length)];
        c.fillRect(w2px(x, S), py(z, S), Math.max(1, bw), Math.max(1, bz));
      }
    }
    if (poly) c.restore();
  };
  // Manhattan blocks first
  c.save();
  pathFromPoly(c, MANHATTAN, S);
  c.clip();
  drawBlocks(-2000, 1700, -8300, 2900, 250, 80);
  c.restore();
  drawBlocks(-4200, -2700, -6600, 5800, 200, 120, JERSEY);
  drawBlocks(2450, 5600, 1200, 6900, 210, 120, BROOKLYN_QUEENS);
  drawBlocks(2500, 4600, -3600, 1200, 220, 130, BROOKLYN_QUEENS);
  drawBlocks(-1300, 3600, -7900, -6500, 230, 140, BRONX);

  /* --- streets --- */
  const street = (x0: number, z0: number, x1: number, z1: number, width: number, col: string) => {
    c.strokeStyle = col;
    c.lineWidth = Math.max(1.2, w2len(width, S));
    c.beginPath();
    c.moveTo(w2px(x0, S), py(z0, S));
    c.lineTo(w2px(x1, S), py(z1, S));
    c.stroke();
  };
  c.save();
  pathFromPoly(c, MANHATTAN, S);
  c.clip();
  for (const [ax, aw] of AVENUES) street(ax, 3000, ax, -8400, aw, "#79726a");
  for (let n = -3; n <= 155; n++) {
    const z = streetZ(n);
    street(-2200, z, 1800, z, STREET_W, "#736c63");
    // centre line
    if (n % 5 === 0) street(-2200, z, 1800, z, 2, "rgba(196,178,120,0.25)");
  }
  // Broadway, the diagonal
  c.strokeStyle = "#7c7468";
  c.lineWidth = Math.max(2, w2len(34, S));
  c.beginPath();
  BROADWAY.forEach(([x, z], i) => (i === 0 ? c.moveTo(w2px(x, S), py(z, S)) : c.lineTo(w2px(x, S), py(z, S))));
  c.stroke();
  // the plazas where Broadway crosses the avenues
  c.fillStyle = "#8b8375";
  c.fillRect(w2px(-640, S), py(-1230, S), w2len(400, S), w2len(550, S));
  c.restore();

  drawBlocks2(); // outer borough streets on top of their blocks
  function drawBlocks2() {
    const grid = (poly: [number, number][], x0: number, x1: number, z0: number, z1: number, ax: number, az: number) => {
      c.save();
      pathFromPoly(c, poly, S);
      c.clip();
      for (let x = x0; x < x1; x += ax) street(x, z0, x, z1, 22, "#5f584f");
      for (let z = z0; z < z1; z += az) street(x0, z, x1, z, 18, "#5b544b");
      c.restore();
    };
    grid(JERSEY, -4200, -2700, -6600, 5800, 200, 120);
    grid(BROOKLYN_QUEENS, 2450, 5600, 1200, 6900, 210, 120);
    grid(BROOKLYN_QUEENS, 2500, 4600, -3600, 1200, 220, 130);
    grid(BRONX, -1300, 3600, -7900, -6500, 230, 140);
  }

  /* --- parks --- */
  const park = (rc: Rect, fill: string) => {
    c.fillStyle = fill;
    c.fillRect(w2px(rc[0], S), py(rc[1], S), w2len(rc[2] - rc[0], S), w2len(rc[3] - rc[1], S));
  };
  for (const p of PARKS) park(p.r, p.name === "Central Park" ? "#3b5233" : "#3f5636");
  // Central Park: lawns, the Reservoir, the Lake, the Mall, the Drive
  const cp = PARKS[0].r;
  c.save();
  c.beginPath();
  c.rect(w2px(cp[0], S), py(cp[1], S), w2len(cp[2] - cp[0], S), w2len(cp[3] - cp[1], S));
  c.clip();
  const lawn = (x: number, z: number, rx: number, rz: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(w2px(x, S), py(z, S), w2len(rx, S), w2len(rz, S), 0, 0, Math.PI * 2);
    c.fill();
    return null;
  };
  lawn(-520, -3300, 210, 260, "#5d7a45"); // Great Lawn
  lawn(-250, -2700, 120, 90, "#61804a"); // Sheep Meadow
  lawn(-420, -4450, 260, 300, "#2c3f4a"); // Reservoir
  lawn(-300, -3400, 150, 120, "#2c3f4a"); // the Lake
  lawn(-120, -2100, 90, 70, "#2c3f4a"); // the Pond
  lawn(-250, -5200, 180, 240, "#2c3f4a"); // Harlem Meer
  // the Mall (a straight tree-lined path) and the loop drive
  c.strokeStyle = "#8a8168";
  c.lineWidth = w2len(18, S);
  c.beginPath();
  c.moveTo(w2px(-180, S), py(-2050, S));
  c.lineTo(w2px(-180, S), py(-3900, S));
  c.stroke();
  c.strokeStyle = "rgba(150,142,120,0.5)";
  c.lineWidth = w2len(11, S);
  c.beginPath();
  c.ellipse(w2px(-400, S), py(-4040, S), w2len(370, S), w2len(1950, S), 0, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  // Riverside Park greenery
  park([-2170, -6600, -2010, 1400], "#3f5636");

  /* --- the long golden-hour shadows --- */
  const sunAz = THREE.MathUtils.degToRad(W.sunAzimuth);
  const sx = Math.sin(sunAz) * Math.cos(THREE.MathUtils.degToRad(W.sunElevation));
  const sz = -Math.cos(sunAz) * Math.cos(THREE.MathUtils.degToRad(W.sunElevation));
  const shadowLen = 1 / Math.tan(THREE.MathUtils.degToRad(W.sunElevation));
  const shadow = new Path2D();
  for (const b of city.buildings) {
    if (Math.abs(b.x) > 3600 || b.z > 5200 || b.z < -5000) continue;
    const dx = -sx * b.h * shadowLen;
    const dz = -sz * b.h * shadowLen;
    const x0 = w2px(b.x - b.w / 2, S);
    const x1 = w2px(b.x + b.w / 2, S);
    const z0 = py(b.z - b.d / 2, S);
    const z1 = py(b.z + b.d / 2, S);
    shadow.moveTo(x0, z0);
    shadow.lineTo(x1, z0);
    shadow.lineTo(x1 + w2len(dx, S), z1 + w2len(dz, S));
    shadow.lineTo(x0 + w2len(dx, S), z1 + w2len(dz, S));
    shadow.closePath();
  }
  c.save();
  pathFromPoly(c, MANHATTAN, S);
  c.clip();
  c.fillStyle = "rgba(20,22,38,0.16)";
  c.fill(shadow);
  c.restore();

  /* --- warm sun glitter on the water --- */
  const gl = c.createLinearGradient(w2px(-2600, S), py(-3000, S), w2px(-600, S), py(4500, S));
  gl.addColorStop(0, "rgba(255,196,140,0.20)");
  gl.addColorStop(0.5, "rgba(255,180,120,0.07)");
  gl.addColorStop(1, "rgba(255,190,140,0.14)");
  c.save();
  c.globalCompositeOperation = "screen";
  c.fillStyle = gl;
  c.fillRect(0, 0, S, S);
  c.restore();

  // cloud shadows on the ground, matching the building shading
  {
    const N = 128;
    const cell = S / N;
    const off = document.createElement("canvas");
    off.width = off.height = S;
    const o = off.getContext("2d")!;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const wx = CX - EXTENT / 2 + ((x + 0.5) / N) * EXTENT;
        const wz = CZ - EXTENT / 2 + ((y + 0.5) / N) * EXTENT;
        const sh = cloudShade(wx, wz);
        if (sh >= 0.995) continue;
        o.fillStyle = `rgba(16,20,34,${clamp((1 - sh) * 0.55, 0, 0.4)})`;
        o.fillRect(x * cell, y * cell, cell + 1, cell + 1);
      }
    }
    c.save();
    c.filter = "blur(10px)";
    c.drawImage(off, 0, 0);
    c.restore();
  }

  // grime over everything
  for (let i = 0; i < 9000; i++) {
    const v = 10 + r() * 40;
    c.fillStyle = `rgba(${v},${v},${v},${0.02 + r() * 0.05})`;
    c.fillRect(r() * S, r() * S, 2 + r() * 26, 2 + r() * 26);
  }

  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

/* ==================================================================== */
/* 7 · SCENE COMPONENTS                                                 */
/* ==================================================================== */

const sunDir = (() => {
  const az = THREE.MathUtils.degToRad(W.sunAzimuth);
  const el = THREE.MathUtils.degToRad(W.sunElevation);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
})();

/** Sky dome: warm haze at the horizon, cold zenith, sun glow, thin cirrus. */
const Sky: React.FC = () => {
  const material = useMemo(() => {
    const zenith = new THREE.Color("#3f74ad");
    const horizon = new THREE.Color("#c6cfd6");
    const haze = new THREE.Color("#eec5a4");
    const sun = new THREE.Color("#ffd0a0");
    return new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: zenith },
        uHorizon: { value: horizon },
        uHaze: { value: haze },
        uSunColor: { value: sun },
        uSunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uHaze;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
          // below the horizon: the ground half of the dome, in haze, never a bright plate
          col = mix(col, uHaze * 0.97, smoothstep(0.004, -0.02, h));
          float hazeBand = exp(-max(h, 0.0) * 26.0);
          vec2 dh = normalize(d.xz + vec2(1e-5));
          vec2 sh = normalize(uSunDir.xz);
          float toward = clamp(dot(dh, sh) * 0.5 + 0.5, 0.0, 1.0);
          col = mix(col, uHaze, hazeBand * (0.1 + 0.9 * toward) * 0.92);
          col += uSunColor * pow(toward, 5.0) * hazeBand * 0.16;
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 1500.0) * 1.6 + pow(sd, 55.0) * 0.26 + pow(sd, 6.0) * 0.08);
          if (h > 0.015) {
            vec2 uv = d.xz / (h + 0.12);
            float n = vnoise(uv * 0.55) * 0.62 + vnoise(uv * 1.7) * 0.38;
            float cl = smoothstep(0.5, 0.82, n) * smoothstep(0.015, 0.2, h) * 0.6;
            col = mix(col, uHaze * 0.92 + vec3(0.02), cl);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  }, []);
  return <mesh geometry={useMemo(() => new THREE.SphereGeometry(36000, 32, 20), [])} material={material} frustumCulled={false} />;
};


/** The city: one draw call per facade style, plus roofs, details, trees, billboards. */
const City: React.FC<{ city: CityData }> = ({ city }) => {
  const geoms = useMemo(() => {
    const facadeBufs = Array.from({ length: 8 }, newBuf);
    const roofBuf = newBuf();
    const detailBuf = newBuf();
    for (const b of city.buildings) addBuilding(facadeBufs, roofBuf, detailBuf, b);
    return { facadeBufs, roofBuf, detailBuf };
  }, [city]);

  const facadeMats = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const style = Math.floor(i / 2);
        const variant = i % 2;
        return new THREE.MeshLambertMaterial({ map: facadeTexture(style, variant), vertexColors: true, color: "#cfcdc8" });
      }),
    [],
  );
  const roofMat = useMemo(() => new THREE.MeshLambertMaterial({ map: roofTexture(), vertexColors: true }), []);
  const detailMat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);

  return (
    <group>
      {geoms.facadeBufs.map((g, i) =>
        g.idx.length ? <mesh key={i} geometry={bufToGeometry(g)} material={facadeMats[i]} /> : null,
      )}
      <mesh geometry={bufToGeometry(geoms.roofBuf)} material={roofMat} />
      <mesh geometry={bufToGeometry(geoms.detailBuf)} material={detailMat} />
    </group>
  );
};

const Landmarks: React.FC = () => {
  const geoms = useMemo(() => {
    const bufs = {
      stone: newBuf(),
      glass: newBuf(),
      chrome: newBuf(),
      glow: newBuf(),
      roof: newBuf(),
      detail: newBuf(),
      lights: newBuf(),
    };
    for (const l of LANDMARKS) addLandmark(bufs, bufs.roof, bufs.detail, bufs.lights, l);
    return bufs;
  }, []);

  const mats = useMemo(() => {
    const stone = new THREE.MeshLambertMaterial({ map: facadeTexture(2, 0), vertexColors: true });
    const glass = new THREE.MeshLambertMaterial({ map: facadeTexture(0, 1), vertexColors: true });
    const chrome = new THREE.MeshPhongMaterial({ color: "#8f9296", shininess: 60, specular: "#c9cdd2", vertexColors: true });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const roof = new THREE.MeshLambertMaterial({ map: roofTexture(), vertexColors: true });
    const detail = new THREE.MeshLambertMaterial({ vertexColors: true });
    return { stone, glass, chrome, glow, roof, detail };
  }, []);

  return (
    <group>
      <mesh geometry={bufToGeometry(geoms.stone)} material={mats.stone} />
      <mesh geometry={bufToGeometry(geoms.glass)} material={mats.glass} />
      <mesh geometry={bufToGeometry(geoms.chrome)} material={mats.chrome} />
      <mesh geometry={bufToGeometry(geoms.glow)} material={mats.glow} />
      <mesh geometry={bufToGeometry(geoms.roof)} material={mats.roof} />
      <mesh geometry={bufToGeometry(geoms.detail)} material={mats.detail} />
      <mesh geometry={bufToGeometry(geoms.lights)} material={mats.glow} />
    </group>
  );
};

const Bridges: React.FC = () => {
  const geoms = useMemo(() => {
    const steel = newBuf();
    const cable = newBuf();
    for (const b of BRIDGES) addBridge(steel, cable, b);
    return { steel, cable };
  }, []);
  const mats = useMemo(
    () => ({
      steel: new THREE.MeshLambertMaterial({ vertexColors: true }),
      cable: new THREE.MeshLambertMaterial({ vertexColors: true }),
    }),
    [],
  );
  return (
    <group>
      <mesh geometry={bufToGeometry(geoms.steel)} material={mats.steel} />
      <mesh geometry={bufToGeometry(geoms.cable)} material={mats.cable} />
    </group>
  );
};

const Trees: React.FC<{ city: CityData }> = ({ city }) => {
  const g = useMemo(() => {
    const buf = newBuf();
    for (const t of city.trees) addBlob(buf, t.x, 4 + t.r * 0.55, t.z, t.r, t.tint);
    return bufToGeometry(buf);
  }, [city]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true }), []);
  return <mesh geometry={g} material={mat} />;
};

const Billboards: React.FC<{ city: CityData }> = ({ city }) => {
  const g = useMemo(() => {
    const buf = newBuf();
    for (const b of city.billboards) {
      const hw = b.w / 2;
      const hh = b.h / 2;
      const facingNorth = b.rot === 0;
      // the quad lies on the facade plane: u runs along the wall, v is vertical
      const pt = (u: number, v: number): V3 =>
        facingNorth ? [b.x + u * hw, b.y + v * hh, b.z] : [b.x, b.y + v * hh, b.z + u * hw];
      addQuad(
        buf,
        pt(-1, -1),
        pt(1, -1),
        pt(1, 1),
        pt(-1, 1),
        facingNorth ? [0, 0, -1] : [-1, 0, 0],
        [[0, 0], [1, 0], [1, 1], [0, 1]],
        b.col,
      );
    }
    return bufToGeometry(buf);
  }, [city]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);
  return <mesh geometry={g} material={mat} />;
};

/** Ground plane: the whole map, in one textured quad. */
const Ground: React.FC<{ city: CityData }> = ({ city }) => {
  const tex = useMemo(() => groundTexture(city), [city]);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: tex }), [tex]);
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0, CZ]}>
      <planeGeometry args={[EXTENT, EXTENT]} />
    </mesh>
  );
};

/** A few ferries and tugs, moving on a pure function of t. */
const Boats: React.FC = () => {
  const boats = useMemo(
    () => [
      { z: 900, x0: 1900, x1: 2500, y: 1, s: 1, col: "#e8e2d6" },
      { z: -2600, x0: 2300, x1: 1750, y: 1, s: 0.8, col: "#dcd6c8" },
      { z: 3400, x0: -2350, x1: -2900, y: 1, s: 1.2, col: "#c8452f" },
      { z: 4700, x0: 800, x1: 1600, y: 1, s: 0.9, col: "#e6e0d2" },
    ],
    [],
  );
  const refs = useRef<(THREE.Group | null)[]>([]);
  useTimeline((t) => {
    const total = 143;
    const k = progress(t, 0, total, ease.linear);
    boats.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const x = b.x0 + (b.x1 - b.x0) * k;
      g.position.set(x, b.y, b.z);
      g.rotation.y = b.x1 > b.x0 ? 0 : Math.PI;
    });
  });
  return (
    <group>
      {boats.map((b, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} scale={b.s}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[26, 4, 8]} />
            <meshLambertMaterial color={b.col} />
          </mesh>
          <mesh position={[-3, 5.5, 0]}>
            <boxGeometry args={[10, 5, 6]} />
            <meshLambertMaterial color="#efeee8" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Fixed camera clamps for a 16 km world (the kit's default is a tabletop 200 m far plane). */
const CameraSetup: React.FC = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  React.useLayoutEffect(() => {
    camera.near = 6;
    camera.far = 80000;
    camera.updateProjectionMatrix();
    gl.shadowMap.enabled = false;
  }, [camera, gl]);
  return null;
};

/* ==================================================================== */
/* 8 · THE SHOT                                                         */
/* ==================================================================== */

const CameraRig: React.FC = () => {
  useShot({
    lens: 50,
    position: W.camPos,
    target: W.camTarget,
    move: shot.push(W.camEnd, { ease: ease.cine }),
    drift: { px: W.driftPx, seed: 11 },
    focus: false,
  });
  return null;
};

const CityScene: React.FC = () => {
  const city = useMemo(() => generateCity(SEED), []);

  return (
    <>
      <CameraSetup />
      <CameraRig />
      <Sky />
      <Fog color={HORIZON} near={W.fogNear} far={W.fogFar} />

      <KeyLight
        kind="sun"
        temp={W.sunTemp}
        intensity={W.sunIntensity}
        position={[sunDir.x * 14000, sunDir.y * 14000, sunDir.z * 14000]}
        target={[0, 120, 600]}
        angle={62}
        penumbra={0.92}
        shadowMapSize={512}
      />
      <Bounce from="floor" temp={4300} intensity={0.7} />
      <SkyFill temp={W.skyTemp} groundTemp={3500} intensity={1.35} />

      <Ground city={city} />
      <City city={city} />
      <Landmarks />
      <Bridges />
      <Trees city={city} />
      <Billboards city={city} />
      <Boats />
    </>
  );
};

const Shot: React.FC<{ durationInFrames: number }> = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Stage
        background={HORIZON}
        film={{
          dof: false,
          bloom: W.bloom,
          halation: W.halation,
          grain: W.grain,
          vignette: W.vignette,
          exposure: W.exposure,
          aces: true,
        }}
      >
        <CityScene />
      </Stage>
      {W.caption ? (
        <Caption
          text={W.caption}
          from={W.captionFrom}
          to={Math.min(W.captionTo, durationInFrames - 6)}
          fade={16}
          size={17}
          color="#f6e9d8"
          tracking={0.24}
          weight={500}
          place="bottom"
        />
      ) : null}
    </AbsoluteFill>
  );
};

export default Shot;
