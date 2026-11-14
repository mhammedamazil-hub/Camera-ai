# SIMULATION ARCHITECTURE

---

## 1. The constraint that shapes everything

The target is a **2 vCPU, ~3 GB RAM** machine serving a browser at 60 fps.
That means:

- The physics must run in tens of milliseconds per frame, or be cached.
- A global simulation grid can be 1°–5°, not 0.01°.
- The display DEM (10′) is finer than any dynamics we can afford — it is
  *display data*, and must not be confused with simulation resolution.

Every architectural decision below follows from that.

---

## 2. Layering

```
src/
├── core/            physics-free primitives
│   ├── constants.js     all constants with units + provenance
│   └── math/            vec3, mat3, special, ode, pde
├── physics/         domain-free physics
│   ├── gravity.js
│   ├── thermodynamics.js
│   ├── atmosphere.js
│   └── particle-physics.js
├── chemistry/
│   ├── elements.js
│   └── thermochemistry.js
├── earth/           planet-specific
│   ├── terrain.js       DEM, hypsometry, isostasy
│   └── oceanography.js  EOS, dynamics diagnostics
├── app/             browser-only
│   ├── fields.js        layer definitions (the bridge)
│   ├── bake.js          field -> texture
│   ├── globe.js         three.js renderer
│   ├── format.js        display helpers
│   └── main.js          wiring, UI, clock
└── data/            validated datasets
```

**The dependency rule:** `core` imports nothing; `physics` imports only
`core`; `chemistry` and `earth` import `core` (+ each other where needed);
`app` may import anything. **`core`, `physics`, `chemistry` and `earth` must
never import `three` or touch `window`** — that is what makes them testable
under plain Node with no browser and no DOM shim.

`src/app/fields.js` is the only place that bridges the two worlds, and it
imports only from the physics layer.

---

## 3. The one-implementation rule

The most important architectural decision in the project.

**Rejected:** compute fields in the fragment shader.

**Why rejected:** it creates a second implementation of every physical
model. The shader's gravity used a first-order expansion while the
JavaScript used Somigliana — they had already drifted, and the only thing
enforcing equality was discipline, which is not a mechanism.

**Adopted:**

```
fields.js  ──sample(lat, lon, elev)──►  bake.js ──► RGBA texture ──► shader
     │                                                                  │
     └──────────────► probe panel                    colour only ◄──────┘
     │
     └──────────────► tests
```

One function, three consumers. The shader only maps a number to a colour.

**Cost:** a bake is 90 ms (pressure) to 2.1 s (gravity), done once per layer
and cached. Acceptable because it happens on user action, not per frame.
**Benefit:** it is impossible for the picture to disagree with the physics.

---

## 4. Data flow at runtime

```
boot()
 ├── fetch elevation.bin + elevation-meta.json        (~4.5 MB)
 ├── elevationGridFromBuffer()                        validates dimensions
 ├── hypsometry(grid)                                 41 ms, once
 ├── load earth-day.png                               (already validated)
 ├── createGlobe(canvas)                              WebGL2 context
 ├── buildLayerList / buildFacts / wireControls
 └── requestAnimationFrame(frame)

frame(dt)
 ├── cross-fade layer opacity
 ├── advance the simulation clock (10^rate seconds per wall second)
 ├── globe.setSun(utHours, dayOfYear)                 real solar geometry
 ├── globe.tick(dt)                                   camera easing
 ├── globe.render()
 └── update HUD

selectLayer(id)
 └── ensureLayerTexture(id)
      ├── cached? -> upload
      └── bakeLayer(grid, id)  ~90 ms - 2.1 s
```

---

## 5. Why layers are textures, not vertex data

A 2.34 M-cell field as a vertex attribute would be 75 MB of float32 and
would need a new geometry per layer. As a 16-bit RGBA texture it is
10 MB — but more importantly, it can be sampled *per pixel*, so the
resolution of the field is independent of the mesh resolution.

The 16-bit encoding (R = high byte, G = low byte) is chosen over float
textures to avoid `OES_texture_float` availability questions and because
16 bits is already 1000× finer than the data range requires.

---

## 6. The simulation clock

Time is advanced as `simSeconds += dt · 10^rateExponent`, with
`rateExponent ∈ [−8, 8]`, i.e. from 10 ns/s to 3 years/s. The clock is
decoupled from the frame time so a slow frame does not slow the simulation
and a paused sim still renders.

Solar position is derived from `simSeconds`, not from the wall clock, so
scrubbing time moves the terminator correctly.

---

## 7. Extension points

The brief requires the system to be extensible far enough to model
something like antimatter. Concretely, the seams are:

| To add… | Do this |
|---|---|
| A new field layer | add an entry to `LAYERS` in `fields.js` with `sample()` and a `note`; add its colormap branch |
| A new physical model | new module under `physics/` or `earth/`, imported by `fields.js` |
| Dynamics (wind, currents) | a new `earth/dynamics.js` producing a velocity field; `pde.js` already has the advection operators |
| A new time-varying quantity | extend the clock/prognostic state in `main.js` |
| Antimatter effects | `particle-physics.js` already returns deposited energy; wire it into a terrain/atmosphere response |

None of these require changing the renderer.

---

## 8. Testing strategy

| Layer | How it is tested |
|---|---|
| `core`, `physics`, `chemistry`, `earth` | unit tests against analytical or published values |
| `app/fields.js` | unit tests + a range scan asserting no clipping |
| `app/bake.js` | round-trip test proving the 16-bit encoding is lossless to 1 LSB |
| `app/format.js` | unit tests (no `NaN`/garbage output) |
| `app/globe.js` | **not unit-testable**; geometry conventions are tested separately in `tests/geometry-conventions.test.js` |
| Shader | GLSL uniform/varying cross-check script (see `DEVLOG.md`) |

The renderer itself is the one untested component. That gap is acknowledged
rather than hidden: the geometry *conventions* that would silently produce a
wrong planet are extracted into pure functions and tested.

---

## 9. Build and deployment

- `vite dev` for development, `vite build` for production.
- No runtime network access: all data is bundled.
- Total payload: elevation 4.5 MB, texture 1.1 MB, three.js ~600 KB
  minified, application code ~80 KB.

## 10. Sources and prior art

The architecture borrows from:

- **three.js renderer and `DataTexture` semantics** — the `flipY = false`
  behaviour and the `SphereGeometry` uv convention are documented in the
  library source and were read rather than guessed.
- **Vite** for the dev server and production build.
- **Vitest** for the suite.
- The **one-implementation principle** is the standard argument against
  duplicated computation in visualisation pipelines (c.f. the "single source
  of truth" pattern); here it is enforced structurally by the bake step
  rather than by convention.

## 11. What this architecture deliberately does not do

- **No server.** The simulation runs entirely in the browser.
- **No Web Workers.** Baking blocks the main thread for up to 2.1 s; a
  worker would fix it, and is the obvious next improvement.
- **No WASM.** The physics is not hot enough to justify it.
- **No GPU compute.** WebGL2 fragment shaders are used for colour mapping
  only.
