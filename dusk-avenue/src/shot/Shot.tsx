// LIBERTY AVE — a street-level New York block at last light, built entirely from code.
//
// Nothing here is imported: every surface is a canvas texture drawn at runtime
// (brickwork, shop interiors, neon signs, asphalt, puddles) and every object is
// procedural geometry. Metres, real street dimensions:
//
//   roadway 18.4 m wide, kerb 0.16 m, 4.6 m sidewalks, building line ±13.8 m.
//   +z is south (camera side), -z is north (down the avenue), y is up.
//
// The frame is a GTA-style car-height look down the avenue: canyon of facades,
// wet asphalt, neon in the shopfronts, traffic in the distance.

import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { AbsoluteFill } from "remotion";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Stage, Fog } from "../kit/stage";
import { shot, useShot, type Vec3 } from "../kit/camera";
import { Bounce, KeyLight, SkyFill, StudioEnv } from "../kit/lights";
import { Caption } from "../kit/overlay";
import { rng } from "../kit/motion";
import { shotConfig } from "../shot.config";

/* ==================================================================== */
/* 1 · CONFIG — the editable block                                       */
/* ==================================================================== */

export const LA = {
  /* grade — last light, blue sky overhead, sodium and neon at street level */
  exposure: 1.18,
  bloom: 0.3,
  halation: 0.26,
  grain: 0.26,
  vignette: 0.24,
  dof: true,

  sunTemp: 3100, // the sun has just dropped: amber, weak, raking
  sunIntensity: 0.22,
  skyTemp: 16000, // cold skylight = the other half of the contrast
  skyIntensity: 1.15,

  fogNear: 150,
  fogFar: 1250,

  /* camera — one move: a slow dolly down the avenue at car height */
  lens: 35 as const,
  /** camera hangs ~5.5 m over the roadway: the reference is a low drone / car-roof view */
  camPos: [0.4, 5.6, 46] as Vec3,
  camTarget: [0.2, 2.6, -40] as Vec3,
  dolly: 15,
  driftPx: 2.2,

  caption: "7TH AVE · 40.7484° N 73.9857° W",
  captionFrom: 10,
  captionTo: 9999,
};

const W = LA;
const SEED = shotConfig.seed;
const r0 = rng(SEED * 7919 + 13);

/* street plan ------------------------------------------------------- */
const ROAD_HALF = 9.2;
const WALK = 7.2;
const CURB = 0.16;
const BL = ROAD_HALF + WALK; // 13.8 — the building line
const Z_SOUTH = 96; // behind the camera
const Z_NORTH = -360; // down the avenue
const CROSS = [-64, -152, -240]; // cross streets (centres)
const CROSS_HALF = 8.4;

const FOG = "#78747c";

/* ==================================================================== */
/* 2 · TEXTURE FACTORY — every surface is drawn on a canvas              */
/* ==================================================================== */

const texCache = new Map<string, THREE.Texture>();

function tex(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d", { willReadFrequently: true })!;
  draw(c, w, h);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

const px = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};

/* ---------------------------------- facade --------------------------------- */

type Style = "brick" | "brownstone" | "limestone" | "white" | "concrete" | "glass";

type Pal = {
  base: string;
  brickLo: string;
  brickHi: string;
  mortar: string;
  frame: string;
  trim: string;
  glassTop: string;
  glassBot: string;
  lit: string;
  ac: string;
  style: Style;
};

const PALETTES: Pal[] = [
  { style: "brick", base: "#6a4433", brickLo: "#573729", brickHi: "#7b5341", mortar: "#8e7f6f", frame: "#2a2723", trim: "#b3a495", glassTop: "#5e7486", glassBot: "#12161a", lit: "#ffc184", ac: "#8b8c89" },
  { style: "brick", base: "#5e3d31", brickLo: "#4e3228", brickHi: "#6e4a3b", mortar: "#877a6e", frame: "#232120", trim: "#ada08f", glassTop: "#54697a", glassBot: "#0f1317", lit: "#ffb877", ac: "#87888a" },
  { style: "brownstone", base: "#63493c", brickLo: "#533c32", brickHi: "#74594a", mortar: "#807266", frame: "#241f1a", trim: "#b0a08c", glassTop: "#61748a", glassBot: "#12161a", lit: "#ffc389", ac: "#8a8b8c" },
  { style: "limestone", base: "#948c7a", brickLo: "#867f6e", brickHi: "#a2998a", mortar: "#7d7666", frame: "#2b2823", trim: "#c8bfaa", glassTop: "#6d8296", glassBot: "#191d21", lit: "#ffd09a", ac: "#9a9b98" },
  { style: "white", base: "#a8a294", brickLo: "#989285", brickHi: "#b8b1a2", mortar: "#8f8779", frame: "#312d27", trim: "#d8d0c0", glassTop: "#7c93a5", glassBot: "#1c2024", lit: "#ffd4a0", ac: "#a5a5a1" },
  { style: "concrete", base: "#77766f", brickLo: "#6a6963", brickHi: "#85837c", mortar: "#5f5d58", frame: "#22252a", trim: "#a8a69e", glassTop: "#66798c", glassBot: "#181c21", lit: "#ffc890", ac: "#96979a" },
  { style: "glass", base: "#33454f", brickLo: "#2b3a44", brickHi: "#3e5060", mortar: "#20303a", frame: "#2a3439", trim: "#55636a", glassTop: "#7f9cb0", glassBot: "#1a2530", lit: "#ffd7a0", ac: "#5b6a70" },
];

/**
 * One facade tile = 4 window bays × 4 floors (14.4 m × 13.2 m) at 2048 px →
 * 142 px per metre. Each window carries its own reveal shadow, frame, sash,
 * sill highlight and a scatter of lit rooms, so the wall reads as architecture
 * rather than a pattern.
 */
function facadeTex(seed: number, pal: Pal, variant: number) {
  const S = 2048;
  const BAYS = 8;
  const FLOORS = 7;
  return tex(`fac:${pal.style}:${seed}:${variant}`, S, S, (c, s) => {
    const r = rng(seed * 31 + variant * 7 + 3);
    const bw = s / BAYS;
    const fh = s / FLOORS;

    /* ---- wall ---- */
    px(c, 0, 0, s, s, pal.base);
    if (pal.style === "glass") {
      for (let f = 0; f < FLOORS; f++) {
        const y = s - (f + 1) * fh;
        px(c, 0, y + fh * 0.6, s, fh * 0.4, pal.brickLo);
        px(c, 0, y + fh * 0.6, s, 5, "rgba(0,0,0,0.45)");
        px(c, 0, y + fh * 0.98, s, 4, "rgba(255,255,255,0.08)");
      }
    } else if (pal.style === "brick" || pal.style === "white") {
      const course = Math.round(s / 205);
      for (let y = 0; y < s; y += course) {
        px(c, 0, y, s, 1.6, pal.mortar);
        c.globalAlpha = 0.55;
        for (let x = ((y / course) % 2) * 13; x < s; x += 26) px(c, x, y, 1.6, course, pal.mortar);
        c.globalAlpha = 1;
      }
      c.globalAlpha = 0.42;
      for (let i = 0; i < 12000; i++) {
        px(c, r() * s, r() * s, 10 + r() * 14, course - 2, r() > 0.5 ? pal.brickLo : pal.brickHi);
      }
      c.globalAlpha = 1;
    } else {
      const bh = Math.round(s / 30);
      const bwid = Math.round(s / 16);
      for (let y = 0; y < s; y += bh) {
        px(c, 0, y, s, 2.4, pal.mortar);
        for (let x = ((y / bh) % 2) * (bwid / 2); x < s; x += bwid) px(c, x, y, 2.4, bh, pal.mortar);
      }
      c.globalAlpha = 0.3;
      for (let i = 0; i < 5000; i++) px(c, r() * s, r() * s, 8 + r() * 34, 6 + r() * 26, r() > 0.5 ? pal.brickLo : pal.brickHi);
      c.globalAlpha = 1;
    }

    /* ---- grime ---- */
    for (let i = 0; i < 120; i++) {
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "rgba(22,18,14,0.2)");
      g.addColorStop(0.5, "rgba(22,18,14,0.07)");
      g.addColorStop(1, "rgba(22,18,14,0)");
      c.fillStyle = g;
      c.fillRect(r() * s, r() * s * 0.35, 5 + r() * 22, s);
    }
    const soot = c.createLinearGradient(0, 0, 0, s * 0.22);
    soot.addColorStop(0, "rgba(16,14,12,0.45)");
    soot.addColorStop(1, "rgba(16,14,12,0)");
    c.fillStyle = soot;
    c.fillRect(0, 0, s, s * 0.22);

    /* ---- windows ---- */
    for (let f = 0; f < FLOORS; f++) {
      for (let b = 0; b < BAYS; b++) {
        const cx = b * bw + bw * 0.5;
        const baseY = s - (f + 1) * fh;
        const ww = bw * (0.42 + r() * 0.06);
        const wh = fh * (0.46 + r() * 0.07);
        const x0 = cx - ww / 2 + (r() - 0.5) * 8;
        const y0 = baseY + fh * (0.24 + r() * 0.05);

        // deep reveal: soft shadow all round, hardest at the top
        c.fillStyle = "rgba(10,9,8,0.9)";
        c.fillRect(x0 - 5, y0 - 5, ww + 10, wh + 10);
        const rev = c.createLinearGradient(0, y0 - 5, 0, y0 + wh * 0.5);
        rev.addColorStop(0, "rgba(0,0,0,0.75)");
        rev.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = rev;
        c.fillRect(x0, y0, ww, wh * 0.5);

        // lintel + sill
        px(c, x0 - 8, y0 - 12, ww + 16, 8, pal.trim);
        c.globalAlpha = 0.45;
        px(c, x0 - 8, y0 - 4, ww + 16, 3, "#000");
        c.globalAlpha = 1;

        const lit = r() < 0.26;
        const g = c.createLinearGradient(0, y0, 0, y0 + wh);
        if (lit) {
          const warm = r() > 0.28;
          g.addColorStop(0, warm ? "#ffe0b4" : "#dfeaff");
          g.addColorStop(0.5, warm ? pal.lit : "#b9cde4");
          g.addColorStop(1, warm ? "#8d4c1d" : "#5e738a");
        } else {
          g.addColorStop(0, pal.glassTop);
          g.addColorStop(0.28, "#2a3540");
          g.addColorStop(0.7, pal.glassBot);
          g.addColorStop(1, "#07090b");
        }
        c.fillStyle = g;
        c.fillRect(x0, y0, ww, wh);

        if (lit) {
          c.globalAlpha = 0.45;
          for (let k = 0; k < 5; k++) px(c, x0, y0 + wh * (0.12 + k * 0.15), ww, wh * 0.045, "#6d4a29");
          c.globalAlpha = 0.4;
          px(c, x0 + ww * (0.1 + r() * 0.3), y0 + wh * 0.5, ww * 0.18, wh * 0.5, "#3a2a1e");
          c.globalAlpha = 1;
        } else {
          c.globalAlpha = 0.2;
          c.beginPath();
          c.moveTo(x0, y0 + wh * 0.62);
          c.lineTo(x0 + ww, y0 + wh * 0.24);
          c.lineTo(x0 + ww, y0 + wh * 0.5);
          c.lineTo(x0, y0 + wh * 0.88);
          c.closePath();
          c.fillStyle = "#cfe0ee";
          c.fill();
          c.globalAlpha = 1;
        }

        // frame + sash
        c.strokeStyle = pal.frame;
        c.lineWidth = 4;
        c.strokeRect(x0, y0, ww, wh);
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x0 + ww / 2, y0);
        c.lineTo(x0 + ww / 2, y0 + wh);
        c.moveTo(x0, y0 + wh * 0.48);
        c.lineTo(x0 + ww, y0 + wh * 0.48);
        c.stroke();

        // sill highlight + drip shadow
        px(c, x0 - 9, y0 + wh + 2, ww + 18, 6, pal.trim);
        px(c, x0 - 9, y0 + wh + 2, ww + 18, 2, "rgba(255,255,255,0.35)");
        const drip = c.createLinearGradient(0, y0 + wh + 8, 0, y0 + wh + 32);
        drip.addColorStop(0, "rgba(12,10,8,0.5)");
        drip.addColorStop(1, "rgba(12,10,8,0)");
        c.fillStyle = drip;
        c.fillRect(x0 - 9, y0 + wh + 8, ww + 18, 24);

        if (r() < 0.12) {
          const aw = ww * 0.44;
          const ah = wh * 0.28;
          const ax = x0 + ww * 0.5 - aw / 2;
          const ay = y0 + wh - ah - 5;
          px(c, ax, ay, aw, ah, pal.ac);
          c.globalAlpha = 0.45;
          for (let k = 1; k < 4; k++) px(c, ax + 2, ay + (ah / 4) * k, aw - 4, 2, "#565753");
          c.globalAlpha = 1;
          px(c, ax, ay, aw, 3, "#6f706d");
        }
      }
    }

    // belt course
    px(c, 0, s * 0.5 - 5, s, 6, pal.trim);
    px(c, 0, s * 0.5 + 1, s, 4, "rgba(0,0,0,0.3)");
  });
}

const BUMP_CACHE = new Map<string, THREE.Texture>();

/** Bump/normal relief derived from the facade canvas: glass sinks, sills and lintels stand proud. */
function facadeBump(key: string): THREE.Texture {
  const hit = BUMP_CACHE.get(key);
  if (hit) return hit;
  const src = texCache.get(key)!;
  const img = src.image as HTMLCanvasElement;
  const el = document.createElement("canvas");
  el.width = el.height = 1024;
  const c = el.getContext("2d", { willReadFrequently: true })!;
  c.filter = "grayscale(1) contrast(2.1) blur(1.2px)";
  c.drawImage(img, 0, 0, 1024, 1024);
  c.filter = "none";
  const t = new THREE.CanvasTexture(el);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  BUMP_CACHE.set(key, t);
  return t;
}

const FACADE_STYLES = [
  { pal: PALETTES[0], h: 13.2, w: 14.4 },
  { pal: PALETTES[1], h: 13.2, w: 14.4 },
  { pal: PALETTES[2], h: 13.2, w: 14.4 },
  { pal: PALETTES[3], h: 13.2, w: 14.4 },
  { pal: PALETTES[4], h: 13.2, w: 14.4 },
  { pal: PALETTES[5], h: 13.2, w: 14.4 },
  { pal: PALETTES[6], h: 13.2, w: 14.4 },
];

/* ---------------------------------- shopfront ------------------------------ */

const SHOP_NAMES = [
  "DELI & GROCERY", "PIZZA", "BAR", "LIQUOR", "HOTEL", "COFFEE", "BODEGA",
  "PHARMACY", "NAILS", "BAGELS", "TATTOO", "THEATRE", "LAUNDRY", "RAMEN", "GYRO",
];

type ShopKind = "grocery" | "bar" | "laundry" | "cafe" | "closed" | "deli";

/** Interior of a storefront seen through its glass. Each kind has its own light. */
function shopTex(seed: number, kind: ShopKind) {
  return tex(`shop:${seed}:${kind}`, 1024, 384, (c, w, h) => {
    const r = rng(seed * 13 + 5);
    if (kind === "closed") {
      px(c, 0, 0, w, h, "#43454a");
      for (let y = 0; y < h; y += 10) {
        px(c, 0, y, w, 5, "#52545a");
        px(c, 0, y + 6, w, 2, "#2c2e32");
      }
      c.globalAlpha = 0.45;
      for (let i = 0; i < 80; i++) px(c, r() * w, r() * h, 2 + r() * 50, 1 + r() * 3, "#64666c");
      c.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const pw = 70 + r() * 60;
        px(c, r() * w * 0.85, h * (0.2 + r() * 0.45), pw, pw * 1.3, ["#cfc9b8", "#c2b184", "#b0bfc8"][Math.floor(r() * 3)]);
      }
      return;
    }
    const scheme = {
      grocery: { wall: "#c08d52", floor: "#8a6136", lamp: "rgba(255,214,158,0.9)", hue: 1, shelves: 5 },
      deli: { wall: "#b5854e", floor: "#7c5730", lamp: "rgba(255,206,140,0.9)", hue: 1, shelves: 5 },
      bar: { wall: "#4a2a26", floor: "#2c1a18", lamp: "rgba(255,150,110,0.85)", hue: 0.9, shelves: 2 },
      laundry: { wall: "#9fb0b6", floor: "#7d8f96", lamp: "rgba(214,238,255,0.95)", hue: 0.2, shelves: 2 },
      cafe: { wall: "#8a6236", floor: "#5c4022", lamp: "rgba(255,222,170,0.95)", hue: 1, shelves: 4 },
    }[kind];

    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, scheme.wall);
    g.addColorStop(0.55, scheme.floor);
    g.addColorStop(1, "#1b120c");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);

    for (let sh = 0; sh < scheme.shelves; sh++) {
      const y = h * (0.14 + sh * (0.66 / scheme.shelves));
      px(c, w * 0.03, y + h * 0.1, w * 0.94, h * 0.02, "#c99a63");
      for (let x = w * 0.04; x < w * 0.94; x += 10 + r() * 9) {
        const accent = r() < 0.18;
        const hue = accent ? 10 + r() * 340 : kind === "laundry" ? 195 + r() * 20 : 22 + r() * 24;
        const sat = accent ? 45 + r() * 30 : 14 + r() * 20;
        px(c, x, y, 7 + r() * 8, h * 0.1, `hsl(${hue},${sat}%,${26 + r() * 22}%)`);
      }
    }
    if (kind === "bar") {
      // back bar with bottles and a warm glow
      const bg = c.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, w * 0.42);
      bg.addColorStop(0, "rgba(255,170,90,0.55)");
      bg.addColorStop(1, "rgba(255,120,60,0)");
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) px(c, w * (0.12 + i * 0.055), h * 0.2, 12, 60, `hsl(${20 + r() * 40},${50 + r() * 30}%,${30 + r() * 25}%)`);
    }
    if (kind === "laundry") {
      for (let i = 0; i < 4; i++) {
        const dx = w * (0.12 + i * 0.22);
        px(c, dx, h * 0.42, w * 0.12, h * 0.4, "#b9c3c7");
        c.fillStyle = "#39464c";
        c.beginPath();
        c.arc(dx + w * 0.06, h * 0.62, w * 0.045, 0, Math.PI * 2);
        c.fill();
      }
    }
    // counter
    px(c, w * 0.5, h * 0.68, w * 0.47, h * 0.32, "#a0743f");
    px(c, w * 0.5, h * 0.66, w * 0.47, h * 0.03, "#c99a63");
    if (kind !== "laundry" && r() > 0.4) {
      c.fillStyle = "#241a12";
      const fx = w * (0.56 + r() * 0.26);
      c.fillRect(fx, h * 0.38, w * 0.055, h * 0.34);
      c.beginPath();
      c.arc(fx + w * 0.027, h * 0.33, w * 0.026, 0, Math.PI * 2);
      c.fill();
    }
    // ceiling light
    const strip = c.createLinearGradient(0, 0, 0, h * 0.12);
    strip.addColorStop(0, "rgba(255,250,236,0.95)");
    strip.addColorStop(1, "rgba(255,220,170,0)");
    c.fillStyle = strip;
    c.fillRect(0, 0, w, h * 0.12);
    for (let i = 0; i < 4; i++) {
      const lx = w * (0.12 + i * 0.26) + r() * 14;
      const lg = c.createRadialGradient(lx, h * 0.1, 3, lx, h * 0.1, 110);
      lg.addColorStop(0, "rgba(255,252,240,0.95)");
      lg.addColorStop(0.25, scheme.lamp);
      lg.addColorStop(1, "rgba(255,190,130,0)");
      c.fillStyle = lg;
      c.beginPath();
      c.arc(lx, h * 0.1, 110, 0, Math.PI * 2);
      c.fill();
    }
    // glass reflections
    c.globalAlpha = 0.3;
    c.fillStyle = "#cfdde8";
    c.beginPath();
    c.moveTo(w * 0.08, h);
    c.lineTo(w * 0.34, 0);
    c.lineTo(w * 0.46, 0);
    c.lineTo(w * 0.2, h);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
    // bulkhead at the base, mullions, transom
    px(c, 0, h * 0.9, w, h * 0.1, "#191b1e");
    px(c, 0, 0, w, 10, "#171719");
    px(c, 0, 0, 10, h, "#171719");
    px(c, w - 10, 0, 10, h, "#171719");
    for (let i = 1; i < 3; i++) px(c, (w / 3) * i - 3, 0, 7, h, "#1b1b1d");
  });
}

/** Vertical blade sign: letters stacked down a narrow box, hung off the wall. */
function bladeTex(seed: number, text: string, fg: string, bg: string) {
  return tex(`blade:${seed}:${text}:${fg}`, 256, 512, (c, w, h) => {
    px(c, 0, 0, w, h, bg);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0.16)");
    g.addColorStop(0.5, "rgba(255,255,255,0.02)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    px(c, 8, 8, w - 16, 5, fg);
    px(c, 8, h - 13, w - 16, 5, fg);
    c.font = "700 64px Inter, 'DejaVu Sans', system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = fg;
    c.shadowBlur = 22;
    c.fillStyle = fg;
    const letters = text.slice(0, 7).split("");
    const step = (h - 60) / letters.length;
    letters.forEach((ch, i) => c.fillText(ch, w / 2, 40 + step * (i + 0.5)));
    c.shadowBlur = 0;
  });
}

/** Illuminated fascia sign. */
function signTex(seed: number, text: string, bg: string, fg: string, border: string) {
  return tex(`sign:${seed}:${text}:${bg}:${fg}`, 1024, 192, (c, w, h) => {
    const r = rng(seed + text.length);
    px(c, 0, 0, w, h, bg);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    px(c, 6, 6, w - 12, 4, border);
    px(c, 6, h - 10, w - 12, 4, border);
    c.font = "700 92px Inter, 'DejaVu Sans', system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = fg;
    c.shadowBlur = 26;
    c.fillStyle = fg;
    c.fillText(text, w / 2, h / 2 + 4);
    c.shadowBlur = 0;
    c.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) px(c, r() * w, r() * h, 2 + r() * 6, 2 + r() * 3, "rgba(0,0,0,0.4)");
    c.globalAlpha = 1;
  });
}

/* ---------------------------------- ground --------------------------------- */

function asphaltTex() {
  // fine aggregate + hairline cracks only: no large features, so the tiling never lattices
  return tex("asphalt", 1024, 1024, (c, s) => {
    const r = rng(77);
    px(c, 0, 0, s, s, "#55575d");
    for (let i = 0; i < 90000; i++) {
      const v = 62 + r() * 54;
      c.fillStyle = `rgba(${v},${v},${v + 2},${0.2 + r() * 0.45})`;
      c.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 26000; i++) {
      const v = 36 + r() * 20;
      c.fillStyle = `rgba(${v},${v},${v + 3},${0.25 + r() * 0.4})`;
      c.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 2);
    }
    // mid-scale mottling: patch repairs and worn aggregate, the scale the eye reads as asphalt
    for (let i = 0; i < 70; i++) {
      const cx = r() * s;
      const cy = r() * s;
      const rad = 30 + r() * 120;
      const lighter = r() > 0.5;
      const g3 = c.createRadialGradient(0, 0, 0, 0, 0, rad);
      g3.addColorStop(0, lighter ? "rgba(126,129,135,0.34)" : "rgba(58,59,64,0.36)");
      g3.addColorStop(0.7, lighter ? "rgba(118,121,127,0.14)" : "rgba(54,55,60,0.18)");
      g3.addColorStop(1, "rgba(60,60,64,0)");
      c.save();
      c.translate(cx, cy);
      c.scale(1 + r() * 1.8, 0.5 + r() * 0.9);
      c.fillStyle = g3;
      c.beginPath();
      c.arc(0, 0, rad, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    // longitudinal paving seams
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.5) * (s / 5) + (r() - 0.5) * 20;
      c.strokeStyle = `rgba(30,31,35,${0.25 + r() * 0.2})`;
      c.lineWidth = 2 + r() * 2;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + (r() - 0.5) * 8, s);
      c.stroke();
    }
    // hairline cracks
    c.strokeStyle = "rgba(22,22,25,0.55)";
    for (let i = 0; i < 18; i++) {
      c.lineWidth = 0.8 + r() * 1.6;
      c.beginPath();
      let x = r() * s;
      let y = r() * s;
      c.moveTo(x, y);
      for (let k = 0; k < 10; k++) {
        x += (r() - 0.5) * 90;
        y += (r() - 0.5) * 90;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // very low-frequency wear, kept subtle so it reads as road, not blotches
    c.globalAlpha = 0.16;
    for (let i = 0; i < 26; i++) {
      const g2 = c.createRadialGradient(0, 0, 0, 0, 0, 120 + r() * 200);
      g2.addColorStop(0, "rgba(70,72,76,0.5)");
      g2.addColorStop(1, "rgba(70,72,76,0)");
      c.save();
      c.translate(r() * s, r() * s);
      c.fillStyle = g2;
      c.beginPath();
      c.arc(0, 0, 340, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  });
}

function sidewalkTex() {
  return tex("walk", 1024, 1024, (c, s) => {
    const r = rng(31);
    px(c, 0, 0, s, s, "#8c8880");
    for (let i = 0; i < 26000; i++) {
      const v = 110 + r() * 70;
      c.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.2 + r() * 0.3})`;
      c.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
    }
    // 1.5 m slabs → 8 across the 12 m tile
    const n = 8;
    const cell = s / n;
    c.strokeStyle = "rgba(55,52,48,0.8)";
    c.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      c.beginPath();
      c.moveTo(i * cell, 0);
      c.lineTo(i * cell, s);
      c.moveTo(0, i * cell);
      c.lineTo(s, i * cell);
      c.stroke();
    }
    // stains, gum, repairs
    for (let i = 0; i < 420; i++) {
      c.fillStyle = `rgba(${40 + r() * 40},${38 + r() * 40},${34 + r() * 40},${0.1 + r() * 0.3})`;
      c.beginPath();
      c.arc(r() * s, r() * s, 2 + r() * 16, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = "rgba(120,118,110,0.35)";
      c.fillRect(r() * s, r() * s, 40 + r() * 120, 30 + r() * 90);
    }
  });
}

function roughnessTex() {
  // subtle dry-asphalt roughness variation — never mirror-smooth
  return tex("rough", 512, 512, (c, s) => {
    const r = rng(9);
    px(c, 0, 0, s, s, "#d2d2d2");
    for (let i = 0; i < 90; i++) {
      const grd = c.createRadialGradient(0, 0, 0, 0, 0, 20 + r() * 90);
      grd.addColorStop(0, "rgba(150,150,150,0.55)");
      grd.addColorStop(0.6, "rgba(190,190,190,0.35)");
      grd.addColorStop(1, "rgba(210,210,210,0)");
      c.save();
      c.translate(r() * s, r() * s);
      c.scale(1 + r() * 1.6, 0.5 + r() * 0.7);
      c.fillStyle = grd;
      c.beginPath();
      c.arc(0, 0, 120, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  });
}

/* ---------------------------------- light fx -------------------------------- */

function glowTex() {
  return tex("glow", 256, 256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,244,220,1)");
    g.addColorStop(0.25, "rgba(255,214,150,0.55)");
    g.addColorStop(0.6, "rgba(255,180,110,0.16)");
    g.addColorStop(1, "rgba(255,170,100,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** Vertical smear used for neon / headlight reflections on the wet asphalt. */
function streakTex() {
  return tex("streak", 128, 512, (c, w, h) => {
    const r = rng(5);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.85)");
    g.addColorStop(0.18, "rgba(255,255,255,0.38)");
    g.addColorStop(0.55, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // broken ripples across the smear
    c.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.55})`;
      c.fillRect(0, r() * h, w, 1 + r() * 4);
    }
    for (let i = 0; i < 60; i++) {
      c.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.4})`;
      c.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 30);
    }
    // soft left/right edges
    const side = c.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, "rgba(0,0,0,1)");
    side.addColorStop(0.3, "rgba(0,0,0,0)");
    side.addColorStop(0.7, "rgba(0,0,0,0)");
    side.addColorStop(1, "rgba(0,0,0,1)");
    c.fillStyle = side;
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "source-over";
  });
}

function sunsetTex() {
  return tex("sunset", 512, 512, (c, s) => {
    const g = c.createRadialGradient(s / 2, s * 0.62, 2, s / 2, s * 0.62, s * 0.52);
    g.addColorStop(0, "rgba(255,206,148,0.8)");
    g.addColorStop(0.12, "rgba(252,172,106,0.62)");
    g.addColorStop(0.32, "rgba(238,140,92,0.3)");
    g.addColorStop(0.62, "rgba(190,120,110,0.12)");
    g.addColorStop(1, "rgba(120,90,110,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    // thin cloud bands catching the last light
    const r = rng(21);
    for (let i = 0; i < 16; i++) {
      const y = s * (0.3 + r() * 0.38);
      const hh = 2 + r() * 9;
      const cg = c.createLinearGradient(0, y - hh, 0, y + hh);
      cg.addColorStop(0, "rgba(255,190,150,0)");
      cg.addColorStop(0.5, `rgba(255,${170 + r() * 50},${140 + r() * 40},${0.05 + r() * 0.1})`);
      cg.addColorStop(1, "rgba(255,190,150,0)");
      c.fillStyle = cg;
      c.fillRect(s * (0.05 + r() * 0.2), y - hh, s * (0.4 + r() * 0.5), hh * 2);
    }
  });
}

/* ==================================================================== */
/* 3 · GEOMETRY BANKS — thousands of props into a handful of draws       */
/* ==================================================================== */

type V3 = [number, number, number];
type Part = { g: THREE.BufferGeometry; m: THREE.Matrix4; c: THREE.Color };

class Bank {
  parts: Part[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();

  add(g: THREE.BufferGeometry, c: THREE.ColorRepresentation, pos: V3, rot?: V3, scale?: V3) {
    this.e.set(...(rot ?? [0, 0, 0]));
    this.q.setFromEuler(this.e);
    this.sc.set(...(scale ?? [1, 1, 1]));
    this.m.compose(this.v.set(...pos), this.q, this.sc);
    this.parts.push({ g, m: this.m.clone(), c: new THREE.Color(c) });
    return this;
  }
  box(w: number, h: number, d: number, c: THREE.ColorRepresentation, pos: V3, rot?: V3) {
    return this.add(new THREE.BoxGeometry(w, h, d), c, pos, rot);
  }
  cyl(rt: number, rb: number, h: number, seg: number, c: THREE.ColorRepresentation, pos: V3, rot?: V3) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, pos, rot);
  }
  sphere(r: number, c: THREE.ColorRepresentation, pos: V3, scale?: V3, seg = 8) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2)), c, pos, undefined, scale);
  }
  build() {
    const geos = this.parts.map(({ g, m, c }) => {
      const n = g.index ? g.toNonIndexed() : g.clone();
      n.applyMatrix4(m);
      for (const k of ["uv", "uv1", "tangent"]) if (n.attributes[k]) n.deleteAttribute(k);
      const count = n.attributes.position.count;
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      n.setAttribute("color", new THREE.BufferAttribute(col, 3));
      return n;
    });
    const merged = mergeGeometries(geos, false)!;
    merged.computeBoundingSphere();
    return merged;
  }
}

/* ==================================================================== */
/* 4 · CITY — lots, buildings, street furniture                          */
/* ==================================================================== */

type Building = {
  side: -1 | 1;
  z0: number; // south edge
  z1: number; // north edge
  width: number; // along z
  depth: number; // into the block
  ground: number; // storefront height
  height: number; // top
  styleIdx: number;
  seed: number;
  cornice: boolean;
  fireEscape: boolean;
  scaffold: boolean;
  waterTower: boolean;
};

const inCross = (z: number, pad = 0) => CROSS.some((cz) => z < cz + CROSS_HALF + pad && z > cz - CROSS_HALF - pad);

function makeLots(): Building[] {
  const out: Building[] = [];
  for (const side of [-1, 1] as const) {
    let z = Z_SOUTH;
    let guard = 0;
    while (z > Z_NORTH && guard++ < 200) {
      // stop at cross streets
      const nextCross = CROSS.filter((cz) => cz + CROSS_HALF < z).sort((a, b) => b - a)[0];
      const limit = nextCross === undefined ? Z_NORTH : nextCross + CROSS_HALF;
      const width = 9 + r0() * 15;
      const z1 = Math.max(limit, z - width);
      const w = z - z1;
      if (w < 6) {
        z = z1 - 0.2;
        continue;
      }
      const r = rng(Math.round(z * 13 + side * 7 + SEED));
      const tall = r() < 0.22;
      const floors = tall ? 14 + Math.floor(r() * 14) : 4 + Math.floor(r() * 8);
      out.push({
        side,
        z0: z,
        z1,
        width: w,
        depth: 22 + r() * 16,
        ground: 4.4 + r() * 0.9,
        height: floors * 3.3 + 0.6,
        styleIdx: Math.floor(r() * FACADE_STYLES.length),
        seed: Math.round(z * 7 + side * 101 + SEED * 3),
        cornice: r() < 0.7,
        fireEscape: r() < 0.42,
        scaffold: r() < 0.14,
        waterTower: r() < 0.35,
      });
      z = z1 - 0.3;
    }
  }
  return out;
}

/* ---------------------------------- props ---------------------------------- */

function addLamp(detail: Bank, emis: Bank, side: number, z: number) {
  const x = side * (ROAD_HALF + 1.1);
  detail.cyl(0.11, 0.15, 8.6, 8, "#2d2f31", [x, 4.3, z]);
  detail.cyl(0.22, 0.24, 0.5, 8, "#33363a", [x, 0.25, z]);
  // arm reaching over the roadway
  detail.box(2.9, 0.13, 0.13, "#2d2f31", [x - side * 1.45, 8.45, z], [0, 0, side * 0.08]);
  detail.box(1.05, 0.22, 0.42, "#3a3d40", [x - side * 2.85, 8.34, z]);
  emis.box(0.8, 0.09, 0.32, "#ffd7a1", [x - side * 2.85, 8.2, z]);
}

function addTrafficLight(detail: Bank, emis: Bank, side: number, z: number, north: boolean) {
  const x = side * (ROAD_HALF + 0.9);
  detail.cyl(0.1, 0.13, 7.2, 8, "#31363a", [x, 3.6, z]);
  const armLen = 4.2;
  detail.box(armLen, 0.12, 0.12, "#31363a", [x - side * armLen / 2, 7.05, z]);
  const hx = x - side * armLen;
  detail.box(0.44, 1.15, 0.34, "#20241f", [hx, 6.45, z]);
  emis.box(0.28, 0.28, 0.06, "#ff3b2f", [hx, 6.78, z + 0.2]);
  emis.box(0.28, 0.28, 0.06, "#3a2a12", [hx, 6.45, z + 0.2]);
  emis.box(0.28, 0.28, 0.06, "#123a24", [hx, 6.12, z + 0.2]);
  // pedestrian signal
  detail.box(0.4, 0.46, 0.26, "#20241f", [x + side * 0.34, 3.4, z]);
  emis.box(0.24, 0.24, 0.05, "#ff8b3d", [x + side * 0.34, 3.4, z + 0.15]);
}

function addHydrant(detail: Bank, side: number, z: number) {
  const x = side * (ROAD_HALF + 1.7);
  detail.cyl(0.16, 0.19, 0.72, 8, "#b33a2b", [x, 0.52, z]);
  detail.cyl(0.2, 0.2, 0.1, 8, "#c9c2b4", [x, 0.9, z]);
  detail.sphere(0.16, "#b33a2b", [x, 0.96, z], [1, 0.7, 1], 8);
  detail.cyl(0.07, 0.07, 0.34, 6, "#c9c2b4", [x, 0.7, z], [0, 0, Math.PI / 2]);
}

function addBin(detail: Bank, side: number, z: number) {
  const x = side * (ROAD_HALF + 1.3);
  detail.cyl(0.34, 0.3, 0.95, 10, "#2f3b33", [x, 0.63, z]);
  detail.cyl(0.36, 0.36, 0.06, 10, "#243029", [x, 1.12, z]);
  // garbage bags
  const r = rng(Math.round(z * 3));
  for (let i = 0; i < 3; i++) {
    detail.sphere(0.3 + r() * 0.12, "#1e1f22", [x + side * (0.5 + r() * 0.6), 0.3, z + (r() - 0.5) * 1.4], [1.2, 0.85, 1], 7);
  }
}

function addTree(detail: Bank, side: number, z: number) {
  const x = side * (ROAD_HALF + 2.1);
  detail.box(1.5, 0.06, 1.5, "#2c2b28", [x, CURB + 0.02, z]);
  detail.cyl(0.13, 0.19, 2.6, 7, "#4a3b2c", [x, CURB + 1.3, z]);
  const r = rng(Math.round(z * 11));
  for (let i = 0; i < 5; i++) {
    detail.sphere(0.75 + r() * 0.6, i % 2 ? "#26362a" : "#2e4232", [
      x + (r() - 0.5) * 1.5,
      CURB + 3.1 + r() * 1.5,
      z + (r() - 0.5) * 1.5,
    ], [1, 0.8, 1], 7);
  }
}

function addScaffold(detail: Bank, emis: Bank, side: number, z0: number, z1: number) {
  const x = side * (BL - 0.9);
  const len = Math.abs(z0 - z1);
  const mid = (z0 + z1) / 2;
  // deck
  detail.box(2.2, 0.16, len, "#5a5145", [x, 3.5, mid]);
  detail.box(2.2, 0.5, 0.12, "#c9c3b2", [x, 3.26, mid - len / 2]); // fascia
  // posts and rails
  for (let z = z0; z > z1; z -= 2.4) {
    detail.cyl(0.06, 0.06, 3.5, 6, "#8b8f92", [x + side * 0.9, 1.75, z]);
    detail.cyl(0.06, 0.06, 3.5, 6, "#8b8f92", [x - side * 0.9, 1.75, z]);
    detail.cyl(0.05, 0.05, 1.8, 6, "#8b8f92", [x, 1.75, z], [Math.PI / 2, 0, 0]);
  }
  // the bare bulb under the shed — the light that makes a wet sidewalk glow
  for (let z = z0 - 1.5; z > z1; z -= 6) {
    emis.box(0.12, 0.12, 0.22, "#ffd9a6", [x, 3.3, z]);
  }
}

/** Lower body of a car (bonnet, flanks, boot) — no cabin, extruded across the width. */
function carBodyGeo(kind: "sedan" | "taxi" | "van" | "suv", L: number, Wd: number): THREE.BufferGeometry {
  const h = L / 2;
  const belt = kind === "van" ? 1.35 : kind === "suv" ? 1.24 : 1.06;
  const floor = 0.44;
  const pts: [number, number][] =
    kind === "van"
      ? [[-h, floor], [-h, 1.3], [-h + 0.12, 1.38], [h - 0.1, 1.36], [h, 1.2], [h, floor]]
      : kind === "suv"
        ? [[-h, floor], [-h, 1.1], [-h + 0.16, 1.22], [-0.58 * h, 1.25], [0.46 * h, 1.25], [0.66 * h, 1.16], [h - 0.1, 1.1], [h, 1.0], [h, floor]]
        : [[-h, floor], [-h, 0.9], [-h + 0.18, 1.02], [-0.6 * h, belt], [0.34 * h, belt], [0.52 * h, 1.0], [h - 0.12, 0.94], [h, 0.84], [h, floor]];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.lineTo(pts[0][0], pts[0][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Wd, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -Wd / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** The greenhouse: narrower than the body, sitting on the beltline, all glass. */
function carGreenhouse(kind: "sedan" | "taxi" | "van" | "suv", L: number, Wd: number) {
  const h = L / 2;
  const belt = kind === "van" ? 1.3 : kind === "suv" ? 1.22 : 1.04;
  const roof = kind === "van" ? 1.95 : kind === "suv" ? 1.72 : 1.47;
  const pts: [number, number][] =
    kind === "van"
      ? [[-h + 0.3, belt], [-h + 0.42, roof], [h - 0.55, roof], [h - 0.3, belt]]
      : kind === "suv"
        ? [[-0.56 * h, belt], [-0.44 * h, roof], [0.34 * h, roof], [0.44 * h, belt]]
        : [[-0.58 * h, belt], [-0.46 * h, roof], [0.16 * h, roof], [0.32 * h, belt]];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.lineTo(pts[0][0], pts[0][1]);
  const gw = Wd * 0.86;
  const g = new THREE.ExtrudeGeometry(shape, { depth: gw, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -gw / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function addCar(
  detail: Bank,
  glass: Bank,
  emis: Bank,
  x: number,
  z: number,
  dir: 1 | -1,
  kind: "sedan" | "taxi" | "van" | "suv",
  color: string,
  headlights = true,
) {
  const L = kind === "van" ? 5.4 : kind === "suv" ? 4.9 : 4.5;
  const Wd = kind === "van" ? 2.0 : 1.82;
  const wheelR = kind === "sedan" || kind === "taxi" ? 0.34 : 0.37;
  const ry: V3 = [0, dir > 0 ? 0 : Math.PI, 0];

  detail.add(carBodyGeo(kind, L, Wd), color, [x, 0, z], ry);
  glass.add(carGreenhouse(kind, L, Wd), "#0e161c", [x, 0, z], ry);

  // roof panel on top of the glass
  const roofY = kind === "van" ? 1.95 : kind === "suv" ? 1.72 : 1.47;
  const roofL = kind === "van" ? 3.2 : kind === "suv" ? 2.6 : 1.95;
  const roofZ = kind === "van" ? -0.1 : kind === "suv" ? -0.12 : -0.14;
  detail.box(Wd * 0.8, 0.07, roofL, color, [x, roofY + 0.02, z + dir * roofZ]);
  // pillars, so the glass reads as windows between them
  for (const pz of kind === "van" ? [-1.35, 1.25] : kind === "suv" ? [-1.2, 0.85] : [-1.15, 0.55]) {
    detail.box(Wd * 0.87, 0.1, 0.09, color, [x, (kind === "van" ? 1.62 : 1.4), z + pz], ry);
  }

  // wheels
  for (const [wx, wz] of [
    [-Wd / 2 + 0.02, L / 2 - 1.02],
    [Wd / 2 - 0.02, L / 2 - 1.02],
    [-Wd / 2 + 0.02, -L / 2 + 0.98],
    [Wd / 2 - 0.02, -L / 2 + 0.98],
  ]) {
    detail.cyl(wheelR, wheelR, 0.2, 12, "#0d0d0f", [x + wx, wheelR, z + wz], [0, 0, Math.PI / 2]);
    detail.cyl(wheelR * 0.5, wheelR * 0.5, 0.22, 10, "#42474d", [x + wx, wheelR, z + wz], [0, 0, Math.PI / 2]);
  }
  // dark underbody
  detail.box(Wd * 0.98, 0.12, L * 0.94, "#0a0a0c", [x, 0.36, z]);
  // wheel arches + bumpers + mirrors
  for (const wzr of [L / 2 - 1.02, -L / 2 + 0.98]) {
    detail.box(Wd + 0.03, 0.34, 1.02, "#0b0b0d", [x, 0.44, z + wzr]);
  }
  detail.box(Wd + 0.04, 0.2, 0.2, "#191b1e", [x, 0.52, z + dir * (L / 2 - 0.06)]);
  detail.box(Wd + 0.04, 0.2, 0.2, "#191b1e", [x, 0.52, z - dir * (L / 2 - 0.06)]);
  for (const sx of [-1, 1]) {
    detail.box(0.16, 0.1, 0.09, color, [x + sx * (Wd / 2 + 0.05), 1.02, z + dir * (L / 2 - 1.35)]);
  }

  // lamps at the nose (dir = travel direction)
  const nose = z + dir * (L / 2);
  const tail = z - dir * (L / 2);
  for (const sx of [-1, 1]) {
    emis.box(0.32, 0.12, 0.05, headlights ? "#fff6e2" : "#2b2822", [x + sx * (Wd / 2 - 0.32), 0.8, nose + dir * 0.01]);
    emis.box(0.29, 0.1, 0.05, "#ff2a14", [x + sx * (Wd / 2 - 0.3), 0.82, tail - dir * 0.01]);
  }
  detail.box(Wd * 0.4, 0.13, 0.04, "#17191c", [x, 0.74, nose + dir * 0.02]);
  if (kind === "taxi") {
    emis.box(0.7, 0.17, 0.24, "#ffe9ae", [x, 1.66, z + dir * 0.1]);
    detail.box(Wd * 0.99, 0.08, L * 0.5, "#171717", [x, 0.66, z]);
  }
}

function addPerson(detail: Bank, x: number, z: number, rotY: number, scaleY = 1) {
  const r = rng(Math.round(x * 71 + z * 13));
  const coat = ["#2b2f3a", "#3a2f2a", "#1f242b", "#4a3b3a", "#2e3b33", "#6b5a4a", "#8d3b3b"][Math.floor(r() * 7)];
  const leg = r() > 0.5 ? "#232529" : "#3a3d44";
  const skin = ["#c99b7a", "#8d6247", "#5e4130", "#d9b294"][Math.floor(r() * 4)];
  const h = scaleY;
  detail.cyl(0.09, 0.11, 0.86 * h, 6, leg, [x - 0.11, 0.45 * h, z], [0, rotY, 0]);
  detail.cyl(0.09, 0.11, 0.86 * h, 6, leg, [x + 0.11, 0.45 * h, z], [0, rotY, 0]);
  detail.box(0.42, 0.62 * h, 0.24, coat, [x, 1.16 * h, z], [0, rotY, 0]);
  detail.sphere(0.115, skin, [x, 1.6 * h, z], [1, 1.15, 1], 7);
  detail.cyl(0.06, 0.07, 0.56, 5, coat, [x - 0.26, 1.18 * h, z], [0, rotY, 0.14]);
  detail.cyl(0.06, 0.07, 0.56, 5, coat, [x + 0.26, 1.18 * h, z], [0, rotY, -0.14]);
}

function addWaterTower(detail: Bank, x: number, y: number, z: number) {
  for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
    detail.cyl(0.07, 0.07, 2.6, 5, "#4a4038", [x + dx, y + 1.3, z + dz]);
  }
  detail.cyl(1.35, 1.35, 2.5, 12, "#6b5540", [x, y + 3.4, z]);
  detail.add(new THREE.ConeGeometry(1.45, 0.9, 12), "#544231", [x, y + 5.1, z]);
  detail.cyl(1.38, 1.38, 0.14, 12, "#3d342c", [x, y + 2.2, z]);
}

function addFireEscape(detail: Bank, side: number, z: number, y0: number, floors: number) {
  const x = side * (BL - 0.62);
  const steel = "#3a3d41";
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * 3.3 + 1.0;
    // platform: grated deck + toe board
    detail.box(1.15, 0.05, 2.5, steel, [x, y, z]);
    detail.box(0.04, 0.16, 2.5, steel, [x + side * 0.57, y + 0.1, z]);
    // top rail + posts
    detail.box(0.04, 0.04, 2.5, steel, [x + side * 0.55, y + 1.0, z]);
    for (let k = -1; k <= 1; k++) {
      detail.box(0.04, 1.0, 0.04, steel, [x + side * 0.55, y + 0.5, z + k * 1.2]);
    }
    // ladder to the floor below, hugging the wall
    if (f > 0) {
      for (const dz of [-0.35, 0.35]) detail.box(0.05, 3.3, 0.05, steel, [x + side * 0.45, y - 1.65, z + dz]);
      for (let k = 0; k < 8; k++) detail.box(0.05, 0.04, 0.7, steel, [x + side * 0.45, y - 3.1 + k * 0.42, z]);
    }
  }
  // drop ladder at street level
  for (const dz of [-0.28, 0.28]) detail.box(0.05, 2.6, 0.05, steel, [x + side * 0.3, y0 + 1.3, z + dz]);
  for (let k = 0; k < 7; k++) detail.box(0.05, 0.04, 0.56, steel, [x + side * 0.3, y0 + 0.2 + k * 0.4, z]);
}

/* ==================================================================== */
/* 5 · SCENE                                                             */
/* ==================================================================== */

const FACADE_MATS = new Map<string, THREE.MeshStandardMaterial>();
const BASE_MATS = new Map<string, THREE.MeshStandardMaterial>();

function facadeMaterial(styleIdx: number, key: string, ru: number, rv: number) {
  const id = `${styleIdx}:${key}:${ru.toFixed(2)}:${rv.toFixed(2)}`;
  const hit = FACADE_MATS.get(id);
  if (hit) return hit;
  const st = FACADE_STYLES[styleIdx];
  const base = facadeTex(styleIdx * 977 + 41, st.pal, styleIdx % 3);
  const tex2 = base.clone();
  tex2.wrapS = tex2.wrapT = THREE.RepeatWrapping;
  tex2.repeat.set(ru, rv);
  tex2.needsUpdate = true;
  const v = 0.82 + ((styleIdx * 37 + key.length * 11) % 7) / 7 * 0.34;
  const m = new THREE.MeshStandardMaterial({
    map: tex2,
    roughness: 0.82,
    metalness: styleIdx === 6 ? 0.35 : 0.06,
    color: new THREE.Color(v * 0.5, v * 0.5, v * 0.52),
    vertexColors: true,
  });
  FACADE_MATS.set(id, m);
  return m;
}

const ROOF_MAT = new THREE.MeshStandardMaterial({ color: "#4a4844", roughness: 0.95 });

/** Grounds a wall: dark near the pavement, full value up top. */
function shadeByHeight(g: THREE.BufferGeometry, y0: number, y1: number) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const lo = 0.5;
  const hi = 1.0;
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / Math.max(1, y1 - y0), 0, 1);
    const v = lo + (hi - lo) * Math.pow(t, 0.55);
    col[i * 3] = v;
    col[i * 3 + 1] = v * 0.995;
    col[i * 3 + 2] = v * 0.99;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function baseMaterial(seed: number) {
  const id = `base:${seed}`;
  const hit = BASE_MATS.get(id);
  if (hit) return hit;
  const m = new THREE.MeshStandardMaterial({
    map: tex(id, 512, 512, (c, s) => {
      const r = rng(seed);
      const cols = ["#2f3730", "#3b2a2a", "#23282e", "#3a3327", "#4a4038"];
      px(c, 0, 0, s, s, cols[Math.floor(r() * cols.length)]);
      for (let i = 0; i < 9000; i++) {
        c.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.07})`;
        c.fillRect(r() * s, r() * s, 1 + r() * 5, 1 + r() * 5);
      }
      for (let i = 0; i < 30; i++) {
        const g = c.createLinearGradient(0, 0, 0, s);
        g.addColorStop(0, "rgba(0,0,0,0.18)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = g;
        c.fillRect(r() * s, 0, 8 + r() * 24, s);
      }
    }),
    roughness: 0.88,
    metalness: 0.02,
  });
  BASE_MATS.set(id, m);
  return m;
}

const BuildingMesh: React.FC<{ b: Building }> = ({ b }) => {
  const st = FACADE_STYLES[b.styleIdx];
  const upperH = b.height - b.ground;
  const cx = b.side * (BL + b.depth / 2);
  const cz = (b.z0 + b.z1) / 2;

  const { upper, base, mats } = useMemo(() => {
    const front = facadeMaterial(b.styleIdx, `w${b.seed}`, b.width / st.w, upperH / st.h);
    const end = facadeMaterial(b.styleIdx, `d${b.seed}`, b.depth / st.w, upperH / st.h);
    const upper = shadeByHeight(new THREE.BoxGeometry(b.depth, upperH, b.width), -upperH / 2, upperH / 2);
    return {
      upper,
      base: new THREE.BoxGeometry(b.depth, b.ground, b.width),
      mats: [front, front, ROOF_MAT, ROOF_MAT, end, end] as THREE.Material[],
    };
  }, [b, st, upperH]);

  return (
    <group>
      <mesh position={[cx, b.ground + upperH / 2, cz]} geometry={upper} material={mats} castShadow receiveShadow />
      <mesh position={[cx, b.ground / 2, cz]} geometry={base} material={baseMaterial(b.seed)} castShadow receiveShadow />
    </group>
  );
};

type Shop = {
  x: number;
  z: number;
  side: -1 | 1;
  w: number;
  h: number;
  glass: THREE.Texture;
  bright: number;
  sign: { tex: THREE.Texture; w: number; h: number; y: number; bright: number };
  awning?: { color: string; y: number };
};

type Blade = { x: number; y: number; z: number; w: number; h: number; tex: THREE.Texture };

function buildShops(lots: Building[]): Shop[] {
  const out: Shop[] = [];
  for (const b of lots) {
    const r = rng(b.seed * 3 + 11);
    const units = Math.max(1, Math.round(b.width / (6 + r() * 3)));
    const uw = b.width / units;
    for (let i = 0; i < units; i++) {
      const zc = b.z0 - uw * (i + 0.5);
      const name = SHOP_NAMES[Math.floor(r() * SHOP_NAMES.length)];
      const kind: ShopKind = (["grocery", "deli", "bar", "laundry", "cafe", "closed"] as ShopKind[])[Math.floor(r() * 6)];
      const closed = kind === "closed";
      const neon = r() < 0.55;
      const pal = neon
        ? [
            { bg: "#141014", fg: "#ff4d78", bd: "#7d2740" },
            { bg: "#0e1418", fg: "#4fe3ff", bd: "#1f5c6b" },
            { bg: "#151009", fg: "#ffc447", bd: "#6b5220" },
            { bg: "#0f1512", fg: "#7dff9b", bd: "#245c34" },
          ][Math.floor(r() * 4)]
        : { bg: "#2a2622", fg: "#e8dfc8", bd: "#4a443a" };
      out.push({
        x: b.side * (BL - 0.05),
        z: zc,
        side: b.side,
        w: uw * 0.92,
        glass: shopTex(b.seed * 17 + i * 5, kind),
        bright: closed ? 0.4 : kind === "bar" ? 0.4 + r() * 0.4 : 0.55 + r() * 0.95,
        h: closed ? 2.9 : 2.4 + r() * 0.5,
        sign: {
          tex: signTex(b.seed + i * 31, name, pal.bg, pal.fg, pal.bd),
          w: uw * 0.9,
          h: 0.9,
          y: b.ground - 0.62,
          bright: 0.9 + r() * 0.8,
        },
        awning: r() < 0.45 ? { color: ["#7b2b2b", "#274a35", "#2b3a5c", "#5c4a22", "#3b3b3b"][Math.floor(r() * 5)], y: 3.42 } : undefined,
      });
    }
  }
  return out;
}

/** Hanging blade signs, one every few doors. */
function buildBlades(lots: Building[]): Blade[] {
  const out: Blade[] = [];
  for (const b of lots) {
    const r = rng(b.seed * 5 + 3);
    if (r() > 0.55) continue;
    const fg = ["#ff5a6e", "#54e0ff", "#ffcf5a", "#79ff9d", "#ff8ad4"][Math.floor(r() * 5)];
    const text = ["HOTEL", "BAR", "DELI", "PIZZA", "RAMEN", "TATTOO", "LIQUOR", "CAFE", "GRILL"][Math.floor(r() * 9)];
    out.push({
      x: b.side * (BL - 1.05),
      y: b.ground + 1.7 + r() * 1.6,
      z: b.z0 - b.width * (0.2 + r() * 0.6),
      w: 0.95,
      h: 2.0,
      tex: bladeTex(b.seed, text, fg, "#121014"),
    });
  }
  return out;
}

/* reflections: emissive smears on the wet asphalt -------------------- */
type Streak = { x: number; z: number; w: number; len: number; color: string; y?: number };

function streakGeometry(items: Streak[]) {
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  items.forEach((it, i) => {
    const c = new THREE.Color(it.color);
    const x0 = it.x - it.w / 2;
    const x1 = it.x + it.w / 2;
    const z0 = it.z;
    const z1 = it.z + it.len;
    const base = i * 4;
    const y = it.y ?? 0;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) col.push(c.r, c.g, c.b);
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ==================================================================== */
/* 6 · THE WORLD                                                         */
/* ==================================================================== */

const World: React.FC = () => {
  const rnd = (seed: number) => rng(seed);

  const { lots, detailGeo, glassGeo, emitGeo, shops, blades, streakGeo, glows, pools } = useMemo(() => {
    const detail = new Bank();
    const glass = new Bank();
    const emis = new Bank();
    const lots = makeLots();
    const glows: { x: number; y: number; z: number; s: number; color: string }[] = [];
    const streaks: Streak[] = [];
    const pools: { x: number; z: number; w: number; l: number; color: string; o: number; y?: number }[] = [];

    /* ---- buildings ---- */
    for (const b of lots) {
      const cx = b.side * (BL + b.depth / 2);
      const cz = (b.z0 + b.z1) / 2;
      const xFace = b.side * BL;

      // cornice + parapet
      if (b.cornice) {
        detail.box(b.depth + 0.5, 0.5, b.width + 0.5, "#6d6459", [cx, b.height - 0.25, cz]);
        detail.box(b.depth + 0.2, 0.35, b.width + 0.2, "#5b544c", [cx, b.height + 0.1, cz]);
      }
      // belt courses every 4 floors
      for (let f = 4; f * 3.3 + b.ground < b.height - 2; f += 4) {
        detail.box(b.depth + 0.16, 0.18, b.width + 0.16, "#7a7268", [cx, b.ground + f * 3.3, cz]);
      }
      // floor lines: a shallow ledge on the street face, so the wall has relief and shadow
      const floorsAbove = Math.floor((b.height - b.ground) / 3.3);
      for (let f = 1; f <= floorsAbove; f++) {
        detail.box(0.16, 0.1, b.width * 0.995, "#6f665c", [b.side * (BL - 0.07), b.ground + f * 3.3 - 0.06, cz]);
      }
      // pilasters at the party walls
      detail.box(0.2, b.height - b.ground, 0.42, "#6a6157", [b.side * (BL - 0.09), b.ground + (b.height - b.ground) / 2, b.z1 + 0.12]);
      detail.box(0.2, b.height - b.ground, 0.42, "#6a6157", [b.side * (BL - 0.09), b.ground + (b.height - b.ground) / 2, b.z0 - 0.12]);
      // storefront cornice: the hard horizontal line above the shops
      detail.box(0.5, 0.34, b.width + 0.1, "#5d554c", [b.side * (BL - 0.24), b.ground + 0.16, cz]);
      detail.box(0.34, 0.12, b.width + 0.1, "#7d7468", [b.side * (BL - 0.16), b.ground + 0.38, cz]);
      // rooftop bulkhead
      const r = rnd(b.seed);
      detail.box(b.depth * 0.3, 2.6, b.width * 0.26, "#55504a", [cx + (r() - 0.5) * 4, b.height + 1.3, cz + (r() - 0.5) * 4]);
      for (let i = 0; i < 3; i++) {
        detail.box(1.2, 0.7, 1.1, "#6a6a66", [cx + (r() - 0.5) * 8, b.height + 0.35, cz + (r() - 0.5) * 8]);
      }
      if (b.waterTower) addWaterTower(detail, cx + (r() - 0.5) * 6, b.height, cz + (r() - 0.5) * 6);
      if (b.fireEscape) addFireEscape(detail, b.side, cz, b.ground, Math.min(4, Math.floor((b.height - b.ground) / 3.3)));
      if (b.scaffold) addScaffold(detail, emis, b.side, b.z0 - 0.4, b.z1 + 0.4);

      // dark plinth where wall meets pavement
      detail.box(0.1, 0.55, b.width, "#16130f", [b.side * (BL - 0.02), 0.28, cz]);
      // facade-mounted lamps and small vents break the flat wall
      for (let k = 0; k < 2; k++) {
        detail.box(0.5, 0.34, 0.4, "#54534f", [xFace - b.side * 0.16, b.ground + 1.5 + r() * 8, cz + (r() - 0.5) * b.width * 0.7]);
      }
    }

    /* ---- shops ---- */
    const shops = buildShops(lots);
    const blades = buildBlades(lots);
    for (const s of shops) {
      const rotY = s.side < 0 ? Math.PI / 2 : -Math.PI / 2;
      // awning
      if (s.awning) {
        // slopes out over the sidewalk, away from the wall
        detail.box(1.35, 0.06, s.w, s.awning.color, [s.x - s.side * 0.7, s.awning.y - 0.12, s.z], [0, 0, s.side * 0.3]);
        detail.box(0.06, 0.24, s.w, s.awning.color, [s.x - s.side * 1.35, s.awning.y - 0.34, s.z]);
        detail.box(0.05, 0.05, s.w, "#2a2622", [s.x - s.side * 1.35, s.awning.y - 0.46, s.z]);
      }
      // pilaster between units
      detail.box(0.3, 4.2, 0.42, "#26221d", [s.x + s.side * 0.06, 2.1, s.z + s.w / 2 + 0.05]);
      // light spilling out of the glass onto the pavement
      streaks.push({ x: s.x - s.side * 1.4, z: s.z - s.w / 2, w: s.w * 0.9, len: 3.2, color: "#ffc488", y: CURB + 0.006 });
      if (s.bright > 0.75) {
        pools.push({ x: s.x - s.side * 2.2, z: s.z, w: s.w * 1.5, l: 7.5, color: "#ffc48f", o: 0.3, y: CURB + 0.008 });
      }
      // door frame
      detail.box(0.14, 3.1, 0.16, "#1b1b1d", [s.x, 1.55, s.z - s.w / 2 + 0.2]);
    }

    /* ---- street furniture ---- */
    for (let z = Z_SOUTH - 6; z > Z_NORTH; z -= 27) {
      if (!inCross(z, 4)) {
        addLamp(detail, emis, -1, z);
        glows.push({ x: -(ROAD_HALF + 1.1) + 2.85, y: 8.15, z, s: 2.2, color: "#ffc98c" });
        pools.push({ x: -(ROAD_HALF - 2.6), z, w: 5.4, l: 7.5, color: "#ffcf9e", o: 0.26 });
        // (no long warm band on the asphalt)
      }
      const z2 = z - 13.5;
      if (!inCross(z2, 4)) {
        addLamp(detail, emis, 1, z2);
        glows.push({ x: ROAD_HALF + 1.1 - 2.85, y: 8.15, z: z2, s: 2.2, color: "#ffc98c" });
        pools.push({ x: ROAD_HALF - 2.6, z: z2, w: 5.4, l: 7.5, color: "#ffcf9e", o: 0.26 });

      }
    }

    for (const cz of CROSS) {
      addTrafficLight(detail, emis, -1, cz + CROSS_HALF + 0.6, false);
      addTrafficLight(detail, emis, 1, cz - CROSS_HALF - 0.6, true);
      streaks.push({ x: -ROAD_HALF + 3.4, z: cz - 2, w: 1.4, len: 9, color: "#ff4a33" });
      streaks.push({ x: ROAD_HALF - 3.4, z: cz - 2, w: 1.4, len: 9, color: "#ff4a33" });
    }

    for (let z = Z_SOUTH - 12; z > Z_NORTH; z -= 34) {
      if (inCross(z, 3)) continue;
      addHydrant(detail, -1, z);
      addHydrant(detail, -1, Z_SOUTH - 15);
      addBin(detail, 1, z - 8);
      if ((Math.round(z) / 34) % 2 === 0) addTree(detail, -1, z - 16);
    }

    /* ---- traffic: kerb parking + two moving lanes, headlights on ---- */
    addCar(detail, glass, emis, -7.6, 26, -1, "sedan", "#dfe2e4", false);
    addCar(detail, glass, emis, -7.6, 4, -1, "sedan", "#2b3138", false);
    addCar(detail, glass, emis, -7.6, -22, -1, "van", "#cfcabe", false);
    addCar(detail, glass, emis, -7.6, -58, -1, "sedan", "#5c2b2a", false);
    addCar(detail, glass, emis, 7.6, 14, 1, "suv", "#31363c", false);
    addCar(detail, glass, emis, 7.6, -30, 1, "taxi", "#e8b01f", false);
    addCar(detail, glass, emis, 7.6, -78, 1, "sedan", "#22282e", false);
    addCar(detail, glass, emis, -3.5, 8, -1, "sedan", "#e6e8ea");        // moving away, near
    addCar(detail, glass, emis, -3.5, -26, -1, "taxi", "#e8b01f");       // taxi ahead
    addCar(detail, glass, emis, 3.4, -12, 1, "sedan", "#dfe2e4");        // oncoming, headlights at us
    addCar(detail, glass, emis, 3.4, -64, 1, "sedan", "#c9ccd0");
    addCar(detail, glass, emis, -3.4, -96, -1, "sedan", "#3a3f45");

    for (const [px, pz, pdir] of [[-3.5, 8, -1], [-3.5, -26, -1], [3.4, -12, 1], [3.4, -64, 1]]) {
      for (const sx of [-0.6, 0.6]) glows.push({ x: px + sx, y: 0.82, z: pz + pdir * 2.25, s: 0.75, color: "#ffe9c0" });
    }
    // headlight pools on the asphalt
    for (const [px, pz, pdir] of [[-3.5, 8, -1], [-3.5, -26, -1], [3.4, -12, 1], [3.4, -64, 1]]) {
      pools.push({ x: px, z: pz + pdir * 5.2, w: 4.2, l: 8.5, color: "#ffe7c2", o: 0.2 });
    }

    /* ---- people ---- */
    const people: [number, number, number][] = [
      [-12.4, 2, 0.6], [12.2, -12, -0.4],
      [-11.2, -26, 0.1], [11.4, -38, Math.PI * 0.9], [-12.0, -55, 0.3], [12.6, -68, -0.2],
      [-11.8, -88, 0.5], [11.9, -104, Math.PI], [-10.8, -120, 0.2], [12.1, -140, 0.1],
    ];
    for (const [x, z, rot] of people) addPerson(detail, x, z, rot, 0.95 + rnd(Math.round(z * 31))() * 0.12);

    /* ---- neon glow accents in the shopfronts ---- */
    for (const s of shops) {
      if (rnd(s.z * 7 + 1)() < 0.3) {
        glows.push({ x: s.x - s.side * 0.5, y: s.sign.y, z: s.z, s: 1.9, color: "#ffcf9a" });
      }
      if (rnd(s.z * 3 + 2)() < 0.5) {
        streaks.push({ x: s.x - s.side * 1.6, z: s.z + 1.5, w: 2.2, len: 8 + rnd(s.z)() * 7, color: "#ffb066" });
      }
    }

    return {
      lots,
      detailGeo: detail.build(),
      glassGeo: glass.build(),
      emitGeo: emis.build(),
      shops,
      blades,
      pools,
      streakGeo: streakGeometry(streaks),
      glows,
    };
  }, []);

  const detailMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12 }),
    [],
  );
  const glassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.95, envMapIntensity: 1.6 }),
    [],
  );
  const emitMat = useMemo(() => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), []);

  /* surfaces */
  const roadMat = useMemo(() => {
    const map = asphaltTex().clone();
    map.repeat.set(4, 96);
    map.anisotropy = 8;
    map.needsUpdate = true;
    const rough = roughnessTex().clone();
    rough.repeat.set(4, 96);
    rough.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap: rough,
      roughness: 0.93,
      metalness: 0.08,
      color: "#8a8e97",
      envMapIntensity: 0.3,
    });
  }, []);

  const walkMat = useMemo(() => {
    const map = sidewalkTex().clone();
    map.repeat.set(WALK / 3.3, 520 / 13);
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map, roughness: 0.88, metalness: 0.1, color: "#d6d2c6" });
  }, []);

  const skyTex = useMemo(
    () =>
      tex("sky", 16, 512, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#0b2445");
        g.addColorStop(0.3, "#1d4270");
        g.addColorStop(0.5, "#37628f");
        g.addColorStop(0.62, "#5d84a4");
        g.addColorStop(0.72, "#93a6ab");
        g.addColorStop(0.8, "#c2baa7");
        g.addColorStop(0.87, "#e0bb98");
        g.addColorStop(0.94, "#f0cba6");
        g.addColorStop(1, "#f8dfbe");
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      }),
    [],
  );

  return (
    <>
      {/* ---------------- sky + fog ---------------- */}
      <Fog color={FOG} near={W.fogNear} far={W.fogFar} />
      <mesh position={[0, 0, -120]}>
        <sphereGeometry args={[1700, 32, 20]} />
        <meshBasicMaterial map={skyTex} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>
      {/* the sun has just gone: a soft glow at the end of the avenue, no hard edges */}
      <mesh position={[0, 30, -400]}>
        <planeGeometry args={[700, 380]} />
        <meshBasicMaterial map={sunsetTex()} transparent opacity={0.2} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ---------------- ground ---------------- */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -130]} receiveShadow material={roadMat}>
        <planeGeometry args={[ROAD_HALF * 2, 520, 1, 1]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[s * (ROAD_HALF + WALK / 2), CURB, -130]} receiveShadow material={walkMat}>
          <planeGeometry args={[WALK, 520]} />
        </mesh>
      ))}
      {/* kerbs */}
      {[-1, 1].map((s) => (
        <mesh key={`k${s}`} position={[s * (ROAD_HALF + 0.11), CURB / 2, -130]} receiveShadow>
          <boxGeometry args={[0.22, CURB, 520]} />
          <meshStandardMaterial color="#b6b2a8" roughness={0.85} />
        </mesh>
      ))}

      {/* ---------------- road markings ---------------- */}
      <RoadPaint />



      {/* ---------------- buildings ---------------- */}
      {lots.map((b, i) => (
        <BuildingMesh key={i} b={b} />
      ))}

      {/* ---------------- storefronts ---------------- */}
      {shops.map((s, i) => (
        <group key={i}>
          <mesh position={[s.x, 0.28 + s.h / 2, s.z]} rotation={[0, s.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[s.w, s.h]} />
            <meshBasicMaterial map={s.glass} color={[s.bright * 0.95, s.bright * 0.9, s.bright * 0.84]} toneMapped={false} />
          </mesh>
          <mesh position={[s.x + s.side * -0.04, s.sign.y, s.z]} rotation={[0, s.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
            <planeGeometry args={[s.sign.w, s.sign.h]} />
            <meshBasicMaterial map={s.sign.tex} color={[s.sign.bright * 0.78, s.sign.bright * 0.78, s.sign.bright * 0.78]} toneMapped={false} transparent opacity={0.98} />
          </mesh>
        </group>
      ))}

      {/* ---------------- hanging blade signs ---------------- */}
      {blades.map((b, i) => (
        <group key={`bl${i}`}>
          {[0, Math.PI].map((ry) => (
            <mesh key={ry} position={[b.x, b.y, b.z]} rotation={[0, ry, 0]}>
              <planeGeometry args={[b.w, b.h]} />
              <meshBasicMaterial map={b.tex} color={[1.25, 1.25, 1.25]} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
          {/* bracket back to the wall */}
        </group>
      ))}

      {/* ---------------- geometry banks ---------------- */}
      <mesh geometry={detailGeo} material={detailMat} castShadow receiveShadow />
      <mesh geometry={glassGeo} material={glassMat} />
      <mesh geometry={emitGeo} material={emitMat} />

      {/* ---------------- wet-street reflections ---------------- */}
      <mesh geometry={streakGeo} position={[0, 0.012, 0]} renderOrder={2}>
        <meshBasicMaterial
          map={streakTex()}
          vertexColors
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          fog={false}
        />
      </mesh>

      {/* ---------------- light pools on the asphalt ---------------- */}
      {pools.map((p, i) => (
        <mesh key={`pool${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[p.x, (p.y ?? 0.028) + (i % 9) * 0.0005, p.z]}>
          <planeGeometry args={[p.w, p.l]} />
          <meshBasicMaterial
            map={glowTex()}
            color={p.color}
            transparent
            opacity={p.o}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </mesh>
      ))}

      {/* ---------------- glow sprites ---------------- */}
      {glows.map((g, i) => (
        <sprite key={i} position={[g.x, g.y, g.z]} scale={[g.s, g.s, 1]}>
          <spriteMaterial
            map={glowTex()}
            color={g.color}
            transparent
            opacity={0.42}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            fog={false}
          />
        </sprite>
      ))}

      {/* ---------------- practicals ---------------- */}
      {[
        [-10.4, 7.9, 34],
        [10.4, 7.9, 20],
        [-10.4, 7.9, 7],
        [10.4, 7.9, -20],
      ].map(([x, y, z], i) => (
        <pointLight key={i} position={[x, y, z]} color="#ffd3ac" intensity={8} distance={21} decay={2} />
      ))}
    </>
  );
};

/* --------------------------- road paint ----------------------------- */

const RoadPaint: React.FC = () => {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const yparts: THREE.BufferGeometry[] = [];
    const push = (w: number, l: number, x: number, z: number, y = false) => {
      const g = new THREE.PlaneGeometry(w, l);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.014, z);
      (y ? yparts : parts).push(g);
    };
    // lane dashes
    for (let z = Z_SOUTH; z > Z_NORTH; z -= 7) {
      if (inCross(z, 6)) continue;
      push(0.14, 2.6, -3.1, z);
      push(0.14, 2.6, 3.1, z);
      push(0.14, 2.6, 0, z - 3.4);
    }
    // centre double yellow
    for (let z = Z_SOUTH; z > Z_NORTH; z -= 1.2) {
      if (inCross(z, 5)) continue;
      push(0.09, 1.2, -0.14, z, true);
      push(0.09, 1.2, 0.14, z, true);
    }
    // crosswalks + stop lines at each intersection
    for (const cz of CROSS) {
      for (let x = -ROAD_HALF + 0.7; x < ROAD_HALF; x += 1.15) {
        push(0.62, 3.4, x, cz + CROSS_HALF + 2.2);
        push(0.62, 3.4, x, cz - CROSS_HALF - 2.2);
      }
      push(ROAD_HALF * 2, 0.34, 0, cz + CROSS_HALF + 4.6);
      push(ROAD_HALF * 2, 0.34, 0, cz - CROSS_HALF - 4.6);
      // the cross street asphalt itself
      const g = new THREE.PlaneGeometry(220, CROSS_HALF * 2);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.002, cz);
      parts.push(g);
    }
    return { white: mergeGeometries(parts, false)!, yellow: mergeGeometries(yparts, false)! };
  }, []);

  const mat = useMemo(() => {
    const map = tex("paint", 128, 128, (c, s) => {
      const r = rng(4);
      px(c, 0, 0, s, s, "#cfc9b6");
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(60,60,58,${0.05 + r() * 0.35})`;
        c.fillRect(r() * s, r() * s, 2 + r() * 12, 2 + r() * 6);
      }
    });
    map.repeat.set(1, 3);
    return new THREE.MeshStandardMaterial({ map, color: "#d8d2c0", roughness: 0.72, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  }, []);

  const yellow = useMemo(() => {
    const map = tex("paint2", 128, 128, (c, s) => {
      const r = rng(5);
      px(c, 0, 0, s, s, "#e0b449");
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(70,55,28,${0.05 + r() * 0.3})`;
        c.fillRect(r() * s, r() * s, 2 + r() * 12, 2 + r() * 6);
      }
    });
    map.repeat.set(1, 3);
    return new THREE.MeshStandardMaterial({ map, color: "#e2c265", roughness: 0.72, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
  }, []);

  return (
    <group>
      <mesh geometry={geo.white} material={mat} receiveShadow />
      <mesh geometry={geo.yellow} material={yellow} receiveShadow />
    </group>
  );
};

/** The kit closes the camera at 200 m; this street needs the sky dome and the far towers. */
const CameraRange: React.FC = () => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useLayoutEffect(() => {
    camera.near = 0.15;
    camera.far = 6000;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
};

/* ==================================================================== */
/* 7 · SHOT                                                              */
/* ==================================================================== */

/** Camera rig — must live inside <Stage>, which owns the three.js context. */
const Rig: React.FC = () => {
  useShot({
    lens: W.lens,
    position: W.camPos,
    target: W.camTarget,
    move: shot.dolly(W.dolly),
    drift: { px: W.driftPx, seed: SEED },
    focus: { distance: 60, aperture: 11 },
  });
  return null;
};

const Shot: React.FC<{ dbg?: string; durationInFrames?: number }> = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0f16" }}>
      <Stage
        samples={1}
        background="#0b0f16"
        film={{
          dof: W.dof,
          bloom: W.bloom,
          halation: W.halation,
          grain: W.grain,
          vignette: W.vignette,
          exposure: W.exposure,
          aces: true,
        }}
      >
        <KeyLight kind="sun" temp={W.sunTemp} intensity={W.sunIntensity} position={[-12, 16, 8]} target={[4, 0, -12]} angle={64} penumbra={0.85} shadowRadius={14} shadowMapSize={2048} />

        <SkyFill temp={W.skyTemp} groundTemp={3600} intensity={W.skyIntensity} />
        <Bounce from="floor" temp={4200} intensity={0.28} />
        <StudioEnv intensity={0.26} rotationY={0.6} />
        <CameraRange />
        <Rig />
        <World />
      </Stage>
      <Caption text={W.caption} from={W.captionFrom} to={W.captionTo} size={17} />
    </AbsoluteFill>
  );
};

export default Shot;
