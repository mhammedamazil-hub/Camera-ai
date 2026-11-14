/**
 * PROJECT TERRA — application entry point.
 *
 * Responsibilities, in order:
 *   1. Load the validated datasets (elevation grid + surface texture).
 *   2. Construct the globe renderer.
 *   3. Drive a simulation clock, a layer selector, and a probe.
 *   4. Report honestly what is measured and what is modelled.
 */

import * as THREE from 'three';
import { createGlobe } from './globe.js';
import { bakeLayer } from './bake.js';
import {
  LAYERS, LAYER_BY_ID, probePoint, cmapCSS, cmapShaderId, solarDeclination,
} from './fields.js';
import { elevationGridFromBuffer, hypsometry, landAreaCheck, coastlineLength } from '../earth/terrain.js';
import { EARTH } from '../core/constants.js';
import { formatDuration } from './format.js';

const $ = (id) => document.getElementById(id);

const state = {
  layer: 'surface',
  layerOpacity: 0,
  targetOpacity: 0,
  utHours: 12,
  dayOfYear: 80,
  simSeconds: 0,
  rateExponent: 3,
  paused: false,
  exposure: 1,
  atmosphere: 1,
  probe: null,
  grid: null,
  meta: null,
  hyp: null,
  fps: 0,
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  const status = $('status');
  try {
    status.textContent = 'loading elevation grid…';
    const [binRes, metaRes] = await Promise.all([
      fetch('/src/data/elevation.bin'),
      fetch('/src/data/elevation-meta.json'),
    ]);
    if (!binRes.ok) throw new Error(`elevation.bin: HTTP ${binRes.status}`);
    const meta = await metaRes.json();
    const buf = await binRes.arrayBuffer();
    state.meta = meta;
    state.grid = elevationGridFromBuffer(buf, meta);
    status.textContent = `grid ${state.grid.nx}×${state.grid.ny} loaded · computing hypsometry…`;

    // Hypsometry is ~40 ms; run it after the first paint.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    state.hyp = hypsometry(state.grid);

    status.textContent = 'building textures…';
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    // --- day-side surface texture (already validated by its build script) ---
    const texLoader = new THREE.TextureLoader();
    const dayTexture = await texLoader.loadAsync('/src/data/textures/earth-day.png');
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 4;

    status.textContent = 'starting renderer…';
    const canvas = $('globe');
    const globe = createGlobe(canvas);
    globe.setTextures(dayTexture);
    state.globe = globe;

    buildLayerList();
    buildFacts();
    wireControls(globe);
    globe.onPick(onPick);

    let last = performance.now();
    let acc = 0, frames = 0;
    function frame(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      // Smoothly cross-fade layer opacity so switching does not flash.
      state.layerOpacity += (state.targetOpacity - state.layerOpacity) * (1 - Math.exp(-dt * 10));
      globe.setLayerOpacity(state.layerOpacity);

      if (!state.paused) {
        // rate = 10^exponent seconds of sim time per second of wall time.
        const rate = 10 ** state.rateExponent;
        state.simSeconds += dt * rate;
        state.utHours = (state.simSeconds / 3600) % 24;
      }
      globe.setSun(state.utHours, state.dayOfYear);

      globe.tick(dt);
      globe.render();

      acc += dt; frames++;
      if (acc > 0.5) {
        state.fps = frames / acc;
        acc = 0; frames = 0;
        const st = globe.stats();
        $('badge-fps').textContent = `${state.fps.toFixed(0)} fps`;
        $('badge-tris').textContent = `${(st.triangles / 1000).toFixed(0)}k tris`;
      }

      updateClock();
      if (state.probe) updateProbeMarker();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    status.textContent = 'ready';
    status.className = '';
    setTimeout(() => { status.textContent = ''; }, 2600);
  } catch (err) {
    console.error(err);
    status.textContent = `ERROR: ${err.message}`;
    status.className = 'error';
  }
}

/**
 * Bake a layer once, cache it, and hand it to the renderer. Baking is the
 * expensive step (see src/app/bake.js) so it happens only on first use.
 */
async function ensureLayerTexture(id) {
  if (layerTextureCache.has(id)) {
    const { texture, cmap } = layerTextureCache.get(id);
    state.globe.setLayerTexture(texture, cmap);
    return;
  }
  const layer = LAYER_BY_ID.get(id);
  const status = $('status');
  status.textContent = `baking ${layer.label.toLowerCase()}…`;
  status.className = '';

  // Yield to the render loop before the (synchronous, ~100 ms-2 s) bake so
  // the "baking" message paints first.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  const t0 = performance.now();
  const texture = bakeLayer(state.grid, id);
  const ms = performance.now() - t0;
  const cmap = cmapShaderId(layer.cmap);
  layerTextureCache.set(id, { texture, cmap });
  state.globe.setLayerTexture(texture, cmap);
  console.info(`[terra] baked ${id} in ${ms.toFixed(0)} ms`);
  status.textContent = '';
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function buildLayerList() {
  const host = $('layers');
  host.innerHTML = '';
  LAYERS.forEach((layer, i) => {
    const el = document.createElement('div');
    el.className = 'layer' + (layer.id === state.layer ? ' active' : '');
    el.dataset.id = layer.id;
    el.innerHTML = `<span class="dot"></span><span>${layer.label}</span>` +
      (i < 9 ? `<span class="kbd">${i + 1}</span>` : '');
    el.addEventListener('click', () => selectLayer(layer.id));
    host.appendChild(el);
  });
  selectLayer(state.layer, true);
}

const layerTextureCache = new Map();

function selectLayer(id, immediate = false) {
  state.layer = id;
  const layer = LAYER_BY_ID.get(id);
  const isSurface = id === 'surface';
  state.targetOpacity = isSurface ? 0 : 1;
  void immediate;

  if (!isSurface && state.globe) ensureLayerTexture(id);

  for (const el of document.querySelectorAll('.layer')) {
    el.classList.toggle('active', el.dataset.id === id);
  }

  const legend = $('legend');
  if (isSurface) {
    legend.innerHTML = `
      <div class="units">Surface albedo — schematic</div>
      <div class="note">Generated from the validated ETOPO1 10′ DEM with a
        documented biome/altitude colour model and Lambertian hill-shading.
        It is a visualisation, not measured radiance.</div>`;
  } else {
    const [lo, hi] = layer.range;
    const fmt = (v) => Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
      : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
    legend.innerHTML = `
      <div class="bar" style="background:${cmapCSS(layer.cmap)}"></div>
      <div class="ticks"><span>${fmt(lo)}</span><span>${fmt((lo + hi) / 2)}</span><span>${fmt(hi)}</span></div>
      <div class="units">${layer.units}</div>
      <div class="note">${layer.note}</div>`;
  }

  // Refresh the probe readout for the new layer.
  if (state.probe) renderProbe(state.probe);
}

function buildFacts() {
  const hyp = state.hyp;
  const la = landAreaCheck(state.grid);
  const coast = coastlineLength(state.grid);
  const rows = [
    ['Mean radius', `${(EARTH.RADIUS_MEAN / 1000).toFixed(1)} km`],
    ['Equatorial radius', `${(EARTH.RADIUS_EQ / 1000).toFixed(3)} km`],
    ['Polar radius', `${(EARTH.RADIUS_POL / 1000).toFixed(3)} km`],
    ['Flattening', `1/${(1 / EARTH.FLATTENING).toFixed(3)}`],
    ['Mass (from GM)', `${(EARTH.MASS / 1e24).toFixed(4)} ×10²⁴ kg`],
    ['Sidereal day', `${(EARTH.SIDEREAL_DAY / 3600).toFixed(4)} h`],
    ['Obliquity', `${EARTH.OBLIQUITY_J2000_DEG.toFixed(4)}°`],
    ['Land area', `${(la.landAreaM2 / 1e12).toFixed(2)} ×10¹² m²`],
    ['Land fraction', `${(hyp.landFraction * 100).toFixed(2)} %`],
    ['Ocean volume', `${(hyp.oceanVolumeM3 / 1e18).toFixed(4)} ×10¹⁸ m³`],
    ['Mean ocean depth', `${hyp.meanOceanDepthM.toFixed(0)} m`],
    ['Max depth', `${hyp.maxDepthM.toFixed(0)} m`],
    ['Coastline (lower bound)', `${(coast.lengthM / 1e6).toFixed(0)} ×10⁶ m`],
    ['Effective temp', `${EARTH.T_EFF.toFixed(2)} K`],
  ];
  $('facts').innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');
}

function wireControls(globe) {
  const rateLabel = $('rate-label');
  const updateRate = () => {
    const r = 10 ** state.rateExponent;
    rateLabel.textContent = r < 60 ? `${r.toFixed(1)} s/s`
      : r < 3600 ? `${(r / 60).toFixed(1)} min/s`
        : r < 86400 ? `${(r / 3600).toFixed(1)} h/s`
          : `${(r / 86400).toFixed(1)} d/s`;
  };
  $('rate').addEventListener('input', (e) => {
    state.rateExponent = parseFloat(e.target.value);
    updateRate();
  });
  updateRate();

  $('exposure').addEventListener('input', (e) => {
    state.exposure = parseFloat(e.target.value);
    globe.setExposure(state.exposure);
  });

  $('sun').addEventListener('input', (e) => {
    state.utHours = parseFloat(e.target.value);
    // Moving the sun slider should not fight the clock; pause while dragging.
    state.paused = true;
  });

  $('clouds').addEventListener('input', () => { /* reserved for the cloud layer */ });

  $('atmo').addEventListener('input', (e) => {
    state.atmosphere = parseFloat(e.target.value);
    globe.setAtmosphere(state.atmosphere);
  });

  $('inspect').addEventListener('click', (e) => {
    const on = !globe.inspectMode;
    globe.setInspect(on);
    e.target.classList.toggle('active', on);
  });

  // Keyboard: 1-9 select layers, space pauses.
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      state.paused = !state.paused;
      return;
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) selectLayer(LAYERS[n - 1].id);
  });

  globe.focus(12, 78, 3.05);
}

let markerEl = null;
function updateProbeMarker() {
  const p = state.probe;
  const s = state.globe.latLonToScreen(p.lat, p.lon);
  if (!markerEl) {
    markerEl = document.createElement('div');
    markerEl.style.cssText = `
      position:absolute;width:13px;height:13px;border-radius:50%;
      border:2px solid #4fc3f7;box-shadow:0 0 12px rgba(79,195,247,0.85);
      pointer-events:none;transform:translate(-50%,-50%);transition:opacity .15s;z-index:5;`;
    document.getElementById('app').appendChild(markerEl);
  }
  if (!s || !s.visible) {
    markerEl.style.opacity = '0';
  } else {
    markerEl.style.opacity = '1';
    markerEl.style.left = `${s.x}px`;
    markerEl.style.top = `${s.y}px`;
  }
}

function onPick(e) {
  const ll = state.globe.screenToLatLon(e.clientX, e.clientY);
  if (!ll) return;
  const elevation = state.grid.valueAt(ll.lat, ll.lon);
  state.probe = probePoint(ll.lat, ll.lon, elevation);
  renderProbe(state.probe);
}

/** A very small place-name table for orientation. Not a gazetteer. */
const LANDMARKS = [
  [27.99, 86.93, 'Everest region'], [31.5, 35.5, 'Dead Sea'],
  [11.35, 142.2, 'Mariana Trench'], [10.9, 75.9, 'Kerala, India'],
  [23, 13, 'Sahara'], [-3, -60, 'Amazon basin'], [72, -40, 'Greenland ice sheet'],
  [-80, 0, 'Antarctica'], [0, -150, 'Central Pacific'], [30, -40, 'North Atlantic'],
  [64, -21, 'Iceland'], [-25, 134, 'Australian outback'], [48, 2, 'Paris'],
  [40, -100, 'Great Plains'], [60, 90, 'Siberia'], [-10, 25, 'Congo basin'],
];

function nearestLandmark(lat, lon) {
  let best = null, bestD = Infinity;
  for (const [la, lo, name] of LANDMARKS) {
    // Chord distance on the unit sphere is good enough for this.
    const p1 = lat * Math.PI / 180, p2 = la * Math.PI / 180;
    const dl = (lon - lo) * Math.PI / 180;
    const d = Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) +
      Math.cos(p1) * Math.cos(p2) * Math.cos(dl))) * 180 / Math.PI;
    if (d < bestD) { bestD = d; best = name; }
  }
  return bestD < 900 ? best : null;
}

function renderProbe(p) {
  const layer = LAYER_BY_ID.get(state.layer);
  const fmtLat = `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? 'N' : 'S'}`;
  const fmtLon = `${Math.abs(p.lon).toFixed(2)}°${p.lon >= 0 ? 'E' : 'W'}`;
  const place = nearestLandmark(p.lat, p.lon);

  const rows = [];
  rows.push(['Elevation', p.isLand ? `${p.elevationM.toFixed(0)} m` : `${p.oceanDepthM.toFixed(0)} m deep`]);
  rows.push(['Temperature', `${p.celsius.toFixed(1)} °C`]);
  rows.push(['Pressure', `${(p.pressure / 1000).toFixed(2)} kPa`]);
  rows.push(['Air density', `${p.density.toFixed(4)} kg/m³`]);
  rows.push(['Gravity', `${p.gravity.toFixed(5)} m/s²`]);
  rows.push(['O₂ partial p.', `${p.oxygen.toFixed(2)} kPa`]);
  rows.push(['Crust thickness', `${p.crust.toFixed(1)} km`]);
  if (!p.isLand) rows.push(['Seawater ρ', `${p.seaDensity.toFixed(2)} kg/m³`]);

  // Highlight the row matching the active layer.
  const activeKey = {
    temperature: 1, pressure: 2, density: 3, gravity: 4, elevation: 0, oxygen: 5, crust: 6,
  }[layer?.id];

  $('probe').innerHTML = `
    <div class="place">${place ?? (p.isLand ? 'Land' : 'Open ocean')}</div>
    <div class="coords">${fmtLat} ${fmtLon}</div>
    <dl>${rows.map(([k, v], i) =>
    `<dt${i === activeKey ? ' style="color:#4fc3f7"' : ''}>${k}</dt>` +
    `<dd${i === activeKey ? ' style="color:#4fc3f7"' : ''}>${v}</dd>`).join('')}
    </dl>`;
}

let lastClock = '';
function updateClock() {
  const d = new Date(Date.UTC(2026, 0, 1) + state.simSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  const day = d.toISOString().slice(0, 10);
  const dec = solarDeclination(state.dayOfYear);
  const txt = `${day} ${hh}:${mm}:${ss} UT<br>` +
    `declination ${dec >= 0 ? '+' : ''}${dec.toFixed(1)}° · ` +
    `${state.paused ? 'paused' : 'running'}`;
  if (txt !== lastClock) {
    $('clock').innerHTML = txt;
    lastClock = txt;
  }
  const st = $('sim-time');
  const s = `elapsed ${formatDuration(state.simSeconds)}`;
  if (st.textContent !== s) st.textContent = s;
}

boot();
