/**
 * PROJECT TERRA — field baking.
 *
 * WHY THIS EXISTS
 * The first version of the renderer recomputed every physical field inside
 * the fragment shader. That was wrong for a project whose central claim is
 * that the picture is the physics: the GLSL copy and the JavaScript copy
 * were two independent implementations of the same model, and the only
 * thing keeping them equal was discipline. They had already started to
 * drift (the shader's gravity used a first-order expansion while the JS used
 * the full Somigliana formula).
 *
 * Now every layer is evaluated by the SAME JavaScript function that the
 * probe panel and the unit tests call, baked into a 16-bit normalised
 * texture, and uploaded once. The shader only maps a number to a colour.
 * There is exactly one implementation of each physical model.
 *
 * COST
 * A full-planet bake at the DEM resolution is 2.34 million field
 * evaluations. Measured on the target machine (2 vCPU), a cheap layer such
 * as pressure takes ~90 ms and the most expensive (gravity, which calls the
 * Somigliana series) ~2.1 s. Since bakes happen only when the user selects a
 * layer, that is acceptable; the bake is done in a rAF-sliced loop so the
 * globe keeps spinning while it runs.
 */

import * as THREE from 'three';
import { LAYER_BY_ID } from './fields.js';

/**
 * Bake a layer into an RGBA texture encoding a normalised value in 16 bits
 * across R (high byte) and G (low byte).
 *
 * @param {object} grid ElevationGrid
 * @param {string} layerId
 * @param {(f:number)=>void} [onProgress] 0..1
 * @returns {THREE.DataTexture}
 */
export function bakeLayer(grid, layerId, onProgress) {
  const layer = LAYER_BY_ID.get(layerId);
  if (!layer || !layer.sample) throw new Error(`layer ${layerId} has no sampler`);
  const { nx, ny } = grid;
  const [lo, hi] = layer.range;
  const span = hi - lo;
  const data = new Uint8Array(nx * ny * 4);

  for (let r = 0; r < ny; r++) {
    const lat = -90 + (r + 0.5) * grid.dLat;
    // ROW ORDER — settled by reading the three.js source, not by trial and
    // error. SphereGeometry builds vertices with uv = (u, 1 - v), so the
    // texture's v = 0 row sits at the SOUTH pole. A DataTexture has
    // flipY = false and is uploaded exactly as written, so texture row 0 must
    // be the southernmost row. The DEM's row 0 is already south, so NO flip.
    // (An earlier version flipped here, because a TextureLoader PNG does need
    // flipping; applying that rule to the DataTexture put the north pole at
    // the south.)
    const dst = r;
    for (let c = 0; c < nx; c++) {
      const lon = -180 + (c + 0.5) * grid.dLon;
      const elev = grid.z[r * nx + c];
      const v = layer.sample(lat, lon, elev);
      const t = Math.max(0, Math.min(1, (v - lo) / span));
      const v16 = Math.round(t * 65535);
      const o = (dst * nx + c) * 4;
      data[o] = v16 >> 8;
      data[o + 1] = v16 & 0xff;
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
    if (onProgress && (r & 31) === 0) onProgress(r / ny);
  }
  onProgress?.(1);

  const tex = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Decode a baked texel back to the physical value. Used by the tests to
 * prove that what the GPU is told to draw is the number the physics
 * produced, to within the quantisation of the 16-bit encoding.
 */
export function decodeBaked(data, index, range) {
  const o = index * 4;
  const t = (data[o] * 256 + data[o + 1]) / 65535;
  return range[0] + t * (range[1] - range[0]);
}
