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

## First real vork render (CI, iteration 07)

The workflow below produced the first frame from **vork's own renderer**
(`std/final`, 1600×672, lavapipe CPU, 1m24s). Geometry survived the handover:
the silhouette still matched at **shape IoU 0.942** with edges within ±0.005 —
the CPU previz was telling the truth about framing.

Lighting did **not** survive, and the previz could not have caught it:

| what the render showed | measurement | cause | fix |
|---|---|---|---|
| whole frame pink/orange, not blue hour | sky +0.218 … +0.282 | `sun_elevation -0.062` rad with `aerosol_density 1.7` still renders the afterglow of a *sunset* | sun to `-0.145` rad, aerosol `1.7 → 0.45` |
| everything ~1.8× too bright | mean luma 0.454 vs 0.261 | exposure was tuned in the previz's tone curve, not AgX | `exposure -0.15 → -1.55` |
| white haze across the foreground | water +0.387, stone lower +0.320 | height fog scattering ~4× too high near the eye | `scattering 0.0125 → 0.0045` |
| moon a solid white blob | peak clipped at 1.000 | crescent *and* earthshine both clipped, hiding the crescent | moon `11000 → 2400`, earthshine `900 → 70` cd/m² |
| lantern bloom spilling over the stone | — | emissive core `26000` cd/m² | `→ 9000` |

That is the loop finally closing on the renderer that matters: **compare the real
frame, name the largest defect, change the parameter responsible, re-render.**

## Calibrating against the renderer (CI, iterations 08-10)

One blind correction over-shot badly (mean 0.041, 58% near-black), so exposure
sweeps replaced guesswork: one CI run renders several variants at 800 px and
commits a labelled contact sheet with mean luma, near-black and clipped fractions
per tile.

**Sweep 1 — is exposure even the dial?** At `e = -0.90 … 0.00` the mean ran
0.059 … 0.092 against the plate's 0.261. No: the scene was under-lit at the
source, so the sky and the environment light's energy are the levers.

**Sweep 2 — environment energy** (fixed `e=-0.50, sun=-0.10, aer=0.80`):

| E | mean luma | vs plate |
|---|---|---|
| 1.0 | 0.169 | −0.092 |
| **2.0** | **0.236** | **−0.026** |
| 4.0 | 0.328 | +0.067 |

**Sweep 3 — sun azimuth** (`std/sky.sun_rotation`, the one field with no
documented convention; fixed `e=-0.50, sun=-0.10, aer=0.80, E=2.0`):

| sun_rotation | mean luma | what the sky did |
|---|---|---|
| 4.60 | 0.073 | sun behind the camera, frame nearly black |
| 5.20 | 0.141 | warm afterglow low in frame |
| **6.40** | **0.271** | **anti-solar blue above, afterglow band on the left** |
| 7.00 | 0.206 | glow swinging out of frame, dimming |

**Sweep 4 — aerosol vs energy** (`sun_rotation 6.40`, `e=-0.50`):

| variant | mean luma | note |
|---|---|---|
| sun −0.100, aer 0.80, E 2.0 | 0.279 | baseline; warm band |
| sun −0.100, aer 0.25, E 2.0 | 0.284 | less aerosol barely cools it |
| sun −0.100, aer 0.25, E 3.2 | 0.348 | over-bright |
| **sun −0.125, aer 0.35, E 5.0** | **0.261** | **exact tone match, coolest upper sky** |

Adopted the last row. Two lessons worth keeping:

- **`std/sky` keeps a warm afterglow band at any sun elevation that still looks
  bright enough.** Dropping the sun from −0.10 to −0.155 rad costs ~5x the sky
  radiance (the environment energy has to go from 2 to ~5 to compensate), and even
  then the horizon stays orange. The plate's teal is a different sky: it needs
  either a sun near −0.20 rad with `energy ~10`, or a custom sky program (the same
  `program` mechanism already used for the `mist` medium).
- **The tone is now matched exactly** (mean 0.261 vs 0.261), so from here exposure
  is a fixed reference and only *hue* is left to chase.

Also fixed on the way: vork 0.6.0 rendered the moon's two-arc SVG `d` path as a
full disc, so the crescent is now sampled into a 56-point polygon (verified from
vork's own exported triangles: lit limb left, 72 vs 8 px).

## Iteration 12 — current state

Committed render: `shot-01/render.png` (1600x672, `std/final`, 32 samples,
lavapipe on a GitHub-hosted CPU runner). Side-by-side: `compare_ci.png`,
per-landmark numbers: `compare.txt`.

| measure | plate | render | delta |
|---|---|---|---|
| mean luma | 0.261 | 0.261 | 0.000 |
| horizon y | 0.734 | 0.720 | −0.013 |
| stone x0 / x1 | 0.413 / 0.554 | 0.391 / 0.542 | −0.023 / −0.012 |
| stone y0 | 0.106 | 0.105 | −0.001 |
| sky top-right | 0.181 | 0.185 | +0.005 |
| sky near-horizon | 0.264 | 0.329 | +0.065 |
| stone mid | 0.135 | 0.110 | −0.025 |
| water mid | 0.327 | 0.318 | −0.009 |
| water right | 0.198 | 0.303 | +0.105 |
| **shape IoU** | — | **0.9494** | worst-case landmark |

Known gaps, in the order they should be attacked:

1. **Sky hue.** The render is orange/purple where the plate is teal. This is a
   sky-model limit, not a dial: every `std/sky` setting bright enough to hold the
   exposure keeps a warm afterglow. Fix: a custom sky `program` (the mechanism the
   `mist` medium already uses) or sun ≈ −0.20 rad with `energy ~10`.
2. **Moon reads as a disc.** The crescent outline is right (verified from vork's
   own export), but 2400 nit emission plus bloom fills it in. Drop to ~400 and
   re-measure `moon peak lum` (currently clipped at 1.000 vs the plate's 0.909).
3. **No stone reflection.** The water is near-mirror at roughness 0.06 yet shows
   only the lantern streak; the bright near-horizon haze washes it out. Lower the
   fog's brightness near the surface before adding ripples.
4. **Stone surface is too smooth** relative to the plate's fractured basalt —
   needs more displacement octaves in `build_scene.py`, not more lighting work.
5. **Mist banks.** The plate's layer crosses the whole frame in banks with a hard
   top edge; the render's is a soft gradient. Vary `base_height` with noise.

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

## Rendering it in CI (no GPU)

`.github/workflows/vork-render.yml` does the whole workload on GitHub Actions:
validate → export → smoke frame → render → compare → artifact/commit.

Dispatch it from **Actions → vork render → Run workflow**. Defaults are
`std/final` at `1600x672` on a hosted runner using vork's `--gpu cpu` software
Vulkan path (Mesa lavapipe), because hosted runners have no GPU and the hosted T4
GPU runners have no ray-tracing cores. A `self-hosted-gpu` option takes the
hardware path if you ever register an RTX-class runner.

Each run posts the comparison table into the job summary, so the same
compare-and-fix loop that produced `iteration_log.png` can be run against real
vork output without touching a local machine.

## Finishing it on a GPU machine (alternative)

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
