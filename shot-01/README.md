# shot-01 — "Monolith at blue hour"

A cinematic still, then a 3D copy of it authored in **vork**, then a measured
compare-and-fix loop.

| file | what it is |
|---|---|
| `reference.png` | the plate to copy (3200×1344, 2.381:1) |
| `scene.json` | the vork scene (single source of truth, `vork check` clean) |
| `scene.glb` | vork's own evaluated geometry, exported from that scene |
| `preview_cpu.png` | CPU previz of the scene — **not** a vork render (see caveat) |
| `compare.png` | plate above, previz below |
| `iteration_log.png` | the six iterations that got there |

## The one thing you need to know

**vork's renderer never ran here.** `vork` 0.6.0 installs and works — authoring,
`vork check`, `vork export`, `vork help` — but rendering needs a Vulkan adapter
with hardware ray queries:

```
$ vork setup
GPU: No supported ray-tracing GPU ... Vulkan loader unavailable (libvulkan.so.1)
```

This sandbox has no GPU, no `/dev/dri`, and no Vulkan loader; `apt-get install
libvulkan1 mesa-vulkan-drivers` is firewalled (only GitHub, npm and PyPI are
reachable), so not even the `--gpu cpu` lavapipe path can be installed.

So the compare-and-fix loop was closed with a **CPU previz** (`scripts/preview.py`)
that rasterises the triangles `vork export` produced from `scene.json`, using the
scene's own camera. That makes framing, scale, silhouette, horizon, moon and
lantern placement objectively checkable. It does **not** reproduce vork's
std/openpbr shading, `std/sky`, AgX view transform or path-traced water — those
are unverified until a real render.

### Installing vork here

The documented `install.sh` pulls its payload from
`release-assets.githubusercontent.com`, which is blocked in this sandbox. The npm
package ships the same 0.6.0 native runtime from `registry.npmjs.org`:

```sh
npm install -g @voyager-so/vork     # scripts/setup-vork.sh
vork --version                      # vork 0.6.0 (commit d26cc65…; API v2)
```

## How the framing was derived (not guessed)

From the plate, measured rather than eyeballed:

| measurement | plate |
|---|---|
| horizon | 0.734 of frame height |
| stone silhouette | left 0.388–0.408, right 0.461→0.566, top 0.106, base 0.799 |
| moon | centre (0.2526, 0.1686), disc ≈ 0.011 of width |
| lantern core | (0.566, 0.709), warm `rgb(0.98, 0.59, 0.15)` |
| exposure | mean luma 0.261, p99 0.475 |

With a 50 mm lens on a 36 mm sensor (`tan half_x = 0.36`, `tan half_y = 0.1512`):

* horizon at 0.734 ⇒ camera pitched **4.05° up**, eye 1.20 m over the water;
* stone base at 0.799 ⇒ **60 m** away; top at 0.106 ⇒ **12.7 m** tall;
* width 0.1406 of frame at 60 m ⇒ **7.4 m** across the base, tapering to a 2.3 m
  crest ridge on the left flank and a right shoulder 0.7 m lower.

`scripts/build_scene.py` turns those numbers into the scene, so the geometry is
reproducible rather than hand-tweaked.

## Scene structure

* `std/sky` on the environment light: `sun_elevation -0.062` (sun just below the
  horizon), `aerosol_density 1.7`, and a warm `sun_rotation` azimuth.
* A custom Slang **medium** (`mist`) on the same light: exponential-height world
  fog, `scattering 0.0125`, `base_height 0.25 m`, `falloff 0.80`, anisotropy 0.7.
* The monolith is one `std/extrude` slab plus six proud buttresses, two crest
  chips and four crack slabs — geometry carries the striation so no texture is
  needed at 60 m.
* Mirror-flat tidal water: `std/openpbr`, `specular_roughness 0.22` (wet sand, not
  a perfect mirror), near-black base colour.
* Crescent moon: `std/extrude` of a two-arc SVG path at 500 m, emissive, plus a
  faint earthshine disc behind it.
* Figure (capsule + head) with an emissive lantern sphere and a 6 W point light.

## The loop, measured

Each step below was a real defect found by comparing, then fixed:

| # | defect | fix | result |
|---|---|---|---|
| 01 | horizon at 0.27 — camera pitch sign inverted | aim 4.05° up | horizon 0.734 |
| 02 | stone swallowed by the sea below the horizon | perspective-correct depth/normal interpolation | base reaches 0.799 |
| 03 | flat pillar, wrong proportions | outline rebuilt from measured L/R edges | edges within ±0.005 |
| 04 | sky washed grey-green | twilight sky fitted to the plate (R² 0.91–0.92) | sky Δ ≤ 0.05 |
| 05 | stone washed out by fog, moon blown | mist retuned, earthshine disc, cd/m² scale | mean luma Δ +0.004 |
| 06 | fine balance pass | — | shape IoU **0.949** |

Final comparison (`scripts/compare.py`, `scripts/silhouette.py`):

```
shape IoU (row-filled silhouette, rows 0.11-0.60)   0.949
silhouette edges                                    within ±0.005 frame width
mean luma       plate 0.261   previz 0.265          +0.004
sky top-left         0.237         0.215            -0.022
sky mid-left         0.385         0.337            -0.048
sky near horizon     0.264         0.311            +0.047
stone upper/mid/lower 0.111/0.135/0.167  0.126/0.169/0.202   +0.015/+0.034/+0.036
water mid            0.327         0.344            +0.017
water right          0.198         0.297            +0.099   ← still too bright
moon peak            0.909         0.967
```

## What is verified, and what is not

**Verified here:** `vork check` passes; geometry exports cleanly (16 meshes); the
camera, horizon, stone silhouette, moon and lantern land where the plate has them;
gross exposure is within 0.004 mean luma.

**Not verified:** anything that needs vork's renderer — std/openpbr response,
AgX tone curve, `std/sky` colours (its `sun_rotation` azimuth convention was
chosen blind), the fog integration, and the path-traced mirror water. The previz
is a stand-in for all of these.

**Known deviations from the plate:** the stone reads flatter than the plate's
weathered basalt (no albedo/normal texture); the mist is a smooth layer, not the
plate's streaky banks; the water has no pebbles or ripple detail and its right
side is ~0.1 luma too bright; the crescent is thinner than the plate's.

## Finishing it on a GPU machine

```sh
sudo apt-get install -y ca-certificates curl tar libvulkan1 libgomp1 ffmpeg
npm install -g @voyager-so/vork
cd shot-01
vork setup                                  # should list your RT-capable adapter
vork check scene.json
vork render scene.json --out render.png --profile std/final
vork render scene.json --out render_path.png --profile std/path   # true water mirror + GI
```

Then re-measure against the plate:

```sh
python3 scripts/compare.py shot-01/reference.png shot-01/render.png
python3 scripts/silhouette.py shot-01/reference.png shot-01/render.png
```

Next fixes, in order of visible payoff:

1. render with `std/path` — the water mirror and stone GI are the plate's signature;
2. tune `composition.view.agx.exposure` and `std/sky.sun_rotation` against the
   render's own exposure summary (vork prints clipped/near-black counts);
3. give the basalt a real albedo + normal texture (`std/openpbr` image inputs)
   to recover the plate's relief;
4. add sand/pebbles and broken water detail, and streak the mist;
5. then animate: slow camera drift and creeping mist, rendered as `.mp4`.
