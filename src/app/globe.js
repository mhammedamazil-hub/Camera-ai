/**
 * PROJECT TERRA — globe renderer.
 *
 * A physically-proportioned sphere with a data-driven surface shader. The
 * design constraints were:
 *
 *  1. The GEOMETRY must be right. The Earth is an oblate spheroid, not a
 *     sphere: the equatorial radius is 6378.137 km and the polar radius
 *     6356.752 km, a flattening of 1/298.26. The globe mesh uses that
 *     radius ratio, so the limb is the correct shape.
 *
 *  2. The TERMINATOR must be right. Day/night follows the real solar
 *     declination and hour angle for the simulated time, so the terminator
 *     moves at the correct 15 degrees per hour and tilts with the season.
 *
 *  3. The DATA must be the data. Every shader layer reads from the same
 *     field functions the probe panel and the unit tests use.
 *
 *  4. It must run on integrated graphics at 60 fps, so the per-pixel cost is
 *     kept to a handful of transcendental functions and the DEM is sampled
 *     from a single texture rather than a vertex buffer.
 *
 * The sphere is rendered in a Sun-relative frame: the geometry is a unit
 * sphere scaled by the oblate radii, and the camera orbit is expressed in
 * (latitude, longitude, distance) so the UI can report a real geodetic
 * position under the cursor.
 */

import * as THREE from 'three';
import { EARTH } from '../core/constants.js';
import { LAYER_BY_ID, cmapRGB, sunDirection, cmapShaderId } from './fields.js';

const DEG = Math.PI / 180;

/**
 * The globe's world scale. Three.js works best with scene units of order 1,
 * and float32 precision degrades if we use metres. We use "one unit = one
 * Earth mean radius", and the renderer's non-uniform scale encodes the
 * flattening.
 */
export const GLOBE_SCALE = {
  a: 1.0,
  b: EARTH.RADIUS_POL / EARTH.RADIUS_EQ, // 0.996647...
};

export function createGlobe(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);

  const camera = new THREE.PerspectiveCamera(
    32,
    canvas.clientWidth / Math.max(1, canvas.clientHeight),
    0.01,
    100,
  );

  // --- star field: deterministic, so it does not shimmer between frames ---
  const starGeo = new THREE.BufferGeometry();
  {
    const N = 2600;
    const pos = new Float32Array(N * 3);
    let seed = 20261114;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < N; i++) {
      // Uniform direction on the sphere.
      const u = rnd() * 2 - 1;
      const th = rnd() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 30 + rnd() * 20;
      pos[i * 3] = r * s * Math.cos(th);
      pos[i * 3 + 1] = r * u;
      pos[i * 3 + 2] = r * s * Math.sin(th);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x9fb4cc, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.75 }),
  );
  scene.add(stars);

  // --- the planet ---
  // Segment counts: 256x128 gives 65k vertices - smooth limb, cheap enough.
  const earthGeo = new THREE.SphereGeometry(1, 256, 128);
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uDayMap: { value: null },
      uLayerTex: { value: null },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uHasMap: { value: 0 },
      uLayerCmap: { value: 0 },
      uExposure: { value: 1.0 },
      uLayerOpacity: { value: 0.0 },
      uLat: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vObjPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vObjPos = position;
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vObjPos;
      varying vec3 vNormal;
      varying vec2 vUv;

      uniform sampler2D uDayMap;
      uniform sampler2D uLayerTex;
      uniform vec3 uSunDir;
      uniform int  uHasMap;
      uniform int  uLayerCmap;
      uniform float uExposure;
      uniform float uLayerOpacity;

      const float PI = 3.14159265359;

      // ---- colormaps, evaluated in the shader so the layer is per-pixel ----
      vec3 cmapThermal(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.04, 0.05, 0.24);
        vec3 c1 = vec3(0.16, 0.27, 0.63);
        vec3 c2 = vec3(0.24, 0.69, 0.78);
        vec3 c3 = vec3(0.67, 0.86, 0.47);
        vec3 c4 = vec3(0.94, 0.82, 0.35);
        vec3 c5 = vec3(0.92, 0.51, 0.20);
        vec3 c6 = vec3(0.75, 0.12, 0.16);
        if (t < 0.18) return mix(c0, c1, t / 0.18);
        if (t < 0.36) return mix(c1, c2, (t - 0.18) / 0.18);
        if (t < 0.52) return mix(c2, c3, (t - 0.36) / 0.16);
        if (t < 0.68) return mix(c3, c4, (t - 0.52) / 0.16);
        if (t < 0.84) return mix(c4, c5, (t - 0.68) / 0.16);
        return mix(c5, c6, (t - 0.84) / 0.16);
      }
      vec3 cmapPressure(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.08, 0.16, 0.47);
        vec3 c1 = vec3(0.24, 0.51, 0.75);
        vec3 c2 = vec3(0.59, 0.78, 0.82);
        vec3 c3 = vec3(0.90, 0.75, 0.55);
        vec3 c4 = vec3(0.67, 0.31, 0.16);
        if (t < 0.3) return mix(c0, c1, t / 0.3);
        if (t < 0.55) return mix(c1, c2, (t - 0.3) / 0.25);
        if (t < 0.78) return mix(c2, c3, (t - 0.55) / 0.23);
        return mix(c3, c4, (t - 0.78) / 0.22);
      }
      vec3 cmapDensity(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.98, 0.96, 0.90);
        vec3 c1 = vec3(0.71, 0.78, 0.59);
        vec3 c2 = vec3(0.35, 0.63, 0.51);
        vec3 c3 = vec3(0.16, 0.39, 0.55);
        vec3 c4 = vec3(0.08, 0.12, 0.31);
        if (t < 0.35) return mix(c0, c1, t / 0.35);
        if (t < 0.6) return mix(c1, c2, (t - 0.35) / 0.25);
        if (t < 0.82) return mix(c2, c3, (t - 0.6) / 0.22);
        return mix(c3, c4, (t - 0.82) / 0.18);
      }
      vec3 cmapGravity(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.16, 0.08, 0.35);
        vec3 c1 = vec3(0.35, 0.27, 0.71);
        vec3 c2 = vec3(0.86, 0.86, 0.86);
        vec3 c3 = vec3(0.90, 0.63, 0.24);
        vec3 c4 = vec3(0.55, 0.12, 0.08);
        if (t < 0.35) return mix(c0, c1, t / 0.35);
        if (t < 0.55) return mix(c1, c2, (t - 0.35) / 0.2);
        if (t < 0.75) return mix(c2, c3, (t - 0.55) / 0.2);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }
      vec3 cmapElevation(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 deep = vec3(0.03, 0.10, 0.26);
        vec3 shelf = vec3(0.18, 0.46, 0.58);
        vec3 low = vec3(0.16, 0.35, 0.20);
        vec3 mid = vec3(0.47, 0.51, 0.27);
        vec3 high = vec3(0.63, 0.47, 0.31);
        vec3 snow = vec3(0.96, 0.96, 0.98);
        if (t < 0.45) return mix(deep, shelf, t / 0.45);
        if (t < 0.50) return mix(vec3(0.09, 0.27, 0.47), shelf, (t - 0.45) / 0.05);
        if (t < 0.52) return low;
        if (t < 0.65) return mix(low, mid, (t - 0.52) / 0.13);
        if (t < 0.80) return mix(mid, high, (t - 0.65) / 0.15);
        return mix(high, snow, (t - 0.80) / 0.20);
      }
      vec3 cmapOxygen(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.08, 0.12, 0.24);
        vec3 c1 = vec3(0.20, 0.43, 0.67);
        vec3 c2 = vec3(0.47, 0.78, 0.78);
        vec3 c3 = vec3(0.92, 0.98, 0.92);
        if (t < 0.4) return mix(c0, c1, t / 0.4);
        if (t < 0.7) return mix(c1, c2, (t - 0.4) / 0.3);
        return mix(c2, c3, (t - 0.7) / 0.3);
      }
      vec3 cmapTectonic(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.12, 0.08, 0.20);
        vec3 c1 = vec3(0.55, 0.24, 0.47);
        vec3 c2 = vec3(0.90, 0.47, 0.24);
        vec3 c3 = vec3(1.0, 0.90, 0.55);
        if (t < 0.4) return mix(c0, c1, t / 0.4);
        if (t < 0.7) return mix(c1, c2, (t - 0.4) / 0.3);
        return mix(c2, c3, (t - 0.7) / 0.3);
      }

      vec3 applyCmap(int id, float t) {
        if (id == 1) return cmapThermal(t);
        if (id == 2) return cmapPressure(t);
        if (id == 3) return cmapDensity(t);
        if (id == 4) return cmapGravity(t);
        if (id == 5) return cmapElevation(t);
        if (id == 6) return cmapOxygen(t);
        if (id == 7) return cmapTectonic(t);
        if (id == 8) return cmapThermal(t);
        return vec3(0.5);
      }

      void main() {
        // ---- surface normal ----
        // The mesh is never rotated, so the interpolated object-space
        // position IS the world-space direction. Using the geometry's own
        // position avoids re-deriving the parametrisation and any chance of
        // disagreeing with it.
        vec3 n = normalize(vObjPos);

        vec3 base = vec3(0.05, 0.12, 0.25);
        if (uHasMap == 1) {
          base = texture2D(uDayMap, vUv).rgb;
        }

        float sunDot = dot(n, normalize(uSunDir));
        // Soft terminator: the solar disc is 0.53 deg wide, but atmospheric
        // scattering keeps the sky lit well past geometric sunrise, so a
        // smoothstep over ~18 deg of cos(elevation) is closer to the eye
        // than a hard edge.
        float day = smoothstep(-0.14, 0.18, sunDot);
        float lambert = max(0.0, sunDot);
        float lit = day * (0.22 + 0.86 * pow(lambert, 0.85));

        vec3 col = base * lit * uExposure;

        // Atmospheric limb brightening on the day side.
        float fres = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
        col += vec3(0.16, 0.32, 0.55) * fres * day * 0.55 * uExposure;

        // ---- data layer ----
        // The layer value arrives as a normalised 16-bit coordinate packed
        // across the R and G channels of uLayerTex. It is baked on the CPU by
        // the SAME field functions the probe readout and the tests use, so
        // there is exactly one implementation of each physical model.
        if (uLayerOpacity > 0.001) {
          vec2 rg = texture2D(uLayerTex, vUv).rg;
          float t = (rg.r * 255.0 * 256.0 + rg.g * 255.0) / 65535.0;
          vec3 lc = applyCmap(uLayerCmap, t);
          // Keep some terrain legible underneath rather than replacing it.
          vec3 shaded = lc * (0.38 + 0.62 * lit);
          col = mix(col, shaded, uLayerOpacity * 0.86);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.scale.set(GLOBE_SCALE.a, GLOBE_SCALE.b, GLOBE_SCALE.a);
  scene.add(earth);

  // --- atmosphere shell: a back-face sphere with a Fresnel rim ---
  const atmoGeo = new THREE.SphereGeometry(1.022, 96, 64);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uIntensity: { value: 1.0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldPos = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      uniform vec3 uSunDir;
      uniform float uIntensity;
      void main() {
        // Fresnel: strongest at the limb where the path length through the
        // atmosphere is longest. This is why the sky is blue at the horizon
        // and why the Earth's limb glows.
        vec3 viewDir = normalize(-vWorldPos);
        float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 3.2);
        float sun = 0.35 + 0.65 * max(0.0, dot(normalize(vNormal), normalize(uSunDir)));
        vec3 col = vec3(0.24, 0.52, 0.95) * rim * sun * uIntensity * 1.35;
        gl_FragColor = vec4(col, rim * sun * uIntensity * 0.9);
      }
    `,
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
  atmosphere.scale.set(GLOBE_SCALE.a, GLOBE_SCALE.b, GLOBE_SCALE.a);
  scene.add(atmosphere);

  // --- camera orbit state ---
  const orbit = {
    lat: 12,      // degrees, where the camera sits above
    lon: 78,      // degrees
    dist: 3.05,   // in Earth radii from the centre
    targetLat: 12,
    targetLon: 78,
    targetDist: 3.05,
  };

  function updateCamera() {
    const phi = orbit.lat * DEG;
    const lam = orbit.lon * DEG;
    const r = orbit.dist;
    camera.position.set(
      r * Math.cos(phi) * Math.cos(lam),
      r * Math.sin(phi),
      r * Math.cos(phi) * Math.sin(lam),
    );
    camera.lookAt(0, 0, 0);
  }

  // --- pointer interaction: rotate, zoom, pick ---
  let dragging = false;
  let lastX = 0, lastY = 0;
  let moved = 0;
  let inspectMode = false;
  const raycaster = new THREE.Raycaster();

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX;
    lastY = e.clientY;
    // Dragging right should spin the planet eastward, i.e. the camera moves
    // westward. The scale factor is proportional to distance so the surface
    // tracks the cursor at any zoom level.
    const k = 0.22 * (orbit.dist / 3.05);
    orbit.targetLon -= dx * k;
    orbit.targetLat = Math.max(-89, Math.min(89, orbit.targetLat + dy * k));
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
    if (moved < 4) onPick?.(e);
  });

  canvas.addEventListener('pointercancel', () => { dragging = false; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = Math.exp((e.deltaY / 480) * 0.55);
    orbit.targetDist = Math.max(1.06, Math.min(14, orbit.targetDist * k));
  }, { passive: false });

  let onPick = null;
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();

  /**
   * Convert a screen point to a geodetic (lat, lon) on the globe, or null if
   * the ray misses. Uses the ray-sphere intersection with the MEAN radius so
   * the coordinate is well-defined even where the mesh is flattened.
   */
  function screenToLatLon(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(earth, false)[0];
    if (!hit) return null;
    // Convert the hit point straight back to geographic coordinates using
    // the same parametrisation three.js SphereGeometry uses:
    //   vertex = (-cos(phi) cos(phiLat), sin(phiLat), cos(phi) sin(phiLat))
    // with uv.x = phi / 2pi and uv.y = (phiLat/pi) + 0.5.
    // Deriving it from the position (rather than trusting hit.uv) makes the
    // picking independent of any future change to the texture convention.
    const p = hit.point.clone().normalize();
    const lat = (Math.asin(Math.max(-1, Math.min(1, p.y))) * 180) / Math.PI;
    // With the mapping used above,
    //   p.x =  cos(lat) cos(lon),  p.z = -cos(lat) sin(lon)
    //   => sin(lon) = -p.z, cos(lon) = p.x, so lon = atan2(-p.z, p.x).
    // Getting this sign wrong mirrors the planet in longitude: a click on
    // Kerala (75.9 E) would report 75.9 W.
    let lon = (Math.atan2(-p.z, p.x) * 180) / Math.PI;
    lon = ((lon + 540) % 360) - 180;
    return { lat, lon };
  }

  /**
   * Project a geodetic coordinate to screen space. Used to draw the probe
   * marker. Returns null when the point is on the far side of the globe.
   */
  function latLonToScreen(lat, lon) {
    // Forward of the picking conversion above, so the marker lands exactly
    // where a click on that coordinate would.
    const phi = lat * DEG;
    const lam = lon * DEG;
    const p = new THREE.Vector3(
      Math.cos(phi) * Math.cos(lam),
      Math.sin(phi),
      -Math.cos(phi) * Math.sin(lam),
    );
    // Move just outside the surface so it is not z-fought by the mesh.
    p.multiplyScalar(1.004);
    const world = p.clone();
    p.project(camera);
    // Behind the planet? Compare the surface normal with the view direction.
    const camDir = camera.position.clone().normalize();
    const front = world.clone().normalize().dot(camDir) > 0.04;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (p.x * 0.5 + 0.5) * rect.width,
      y: (-p.y * 0.5 + 0.5) * rect.height,
      visible: front,
    };
  }

  // --- sizing ---
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- public API ---
  const api = {
    renderer, scene, camera, earth, atmosphere, orbit,

    setTextures(dayTexture) {
      earthMat.uniforms.uDayMap.value = dayTexture;
      earthMat.uniforms.uHasMap.value = 1;
    },

    /**
     * Install a pre-baked normalised field (values in 0..1, one per grid
     * cell) plus the colormap id to render it with.
     */
    setLayerTexture(texture, cmapId) {
      earthMat.uniforms.uLayerTex.value = texture;
      earthMat.uniforms.uLayerCmap.value = cmapId;
    },

    setSun(utHours, dayOfYear) {
      const d = sunDirection(utHours, dayOfYear);
      earthMat.uniforms.uSunDir.value.set(d[0], d[1], d[2]);
      atmoMat.uniforms.uSunDir.value.set(d[0], d[1], d[2]);
    },

    setLayerOpacity(opacity) {
      earthMat.uniforms.uLayerOpacity.value = opacity;
    },

    setExposure(v) { earthMat.uniforms.uExposure.value = v; },
    setAtmosphere(v) { atmoMat.uniforms.uIntensity.value = v; },
    setInspect(v) {
      inspectMode = v;
      canvas.classList.toggle('inspect', v);
    },
    get inspectMode() { return inspectMode; },

    onPick(fn) { onPick = fn; },
    screenToLatLon,
    latLonToScreen,

    /** Point the camera at a location, optionally animating. */
    focus(lat, lon, dist) {
      orbit.targetLat = lat;
      orbit.targetLon = lon;
      if (dist !== undefined) orbit.targetDist = dist;
    },

    /** Advance the camera smoothly towards its target. */
    tick(dt) {
      const s = 1 - Math.exp(-dt * 9);
      orbit.lat += (orbit.targetLat - orbit.lat) * s;
      orbit.lon += (orbit.targetLon - orbit.lon) * s;
      orbit.dist += (orbit.targetDist - orbit.dist) * s;
      updateCamera();
      stars.rotation.y += dt * 0.0015;
    },

    render() {
      renderer.render(scene, camera);
    },

    dispose() {
      window.removeEventListener('resize', resize);
      earthGeo.dispose(); earthMat.dispose();
      atmoGeo.dispose(); atmoMat.dispose();
      starGeo.dispose(); stars.material.dispose();
      renderer.dispose();
    },

    stats() {
      const info = renderer.info.render;
      return { triangles: info.triangles, calls: info.calls };
    },
  };

  updateCamera();
  return api;
}

export { cmapRGB };
