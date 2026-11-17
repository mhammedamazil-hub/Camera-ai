# Liberty Ave — a street-level New York block at last light

A 6-second cinematic shot of a Manhattan avenue at dusk, built entirely in code
with three.js + Remotion. **No imported models, no downloaded textures**: every
surface is a canvas texture drawn at runtime, every object is procedural geometry.

| | |
|---|---|
| Composition | `liberty-ave-16x9` |
| Format | 1920 × 1080, 24 fps, 144 frames (6 s) |
| Lens | 35 mm, camera at 2.5 m (car height), 58° vFOV |
| Move | one dolly, 13 m down the avenue |
| Master | `out/liberty-ave-16x9.mp4` |
| Seed | `11` (deterministic) |

## What is in the frame

The camera stands in the left lane of an 18.4 m avenue, 13.8 m from each building
line, and drifts 13 m north while the last light dies at the far end of the street.

- **Ground floor** — every lot has a lit storefront: a canvas-drawn interior
  (grocery shelves, bar back-bar, laundromat drums, café counter, roll-down gate),
  bevelled glass with street reflections, a mullion grid, a bulkhead, an
  illuminated fascia sign, an awning, and a hanging blade sign perpendicular to
  the wall. Five interior types, randomised brightness, ~20 % of shops shuttered.
- **Upper floors** — 2048² facade textures (142 px/m) over 4 window bays × 4
  floors: brick courses with per-brick tone variation, ashlar stone joints,
  curtain-wall spandrels, deep window reveals, sash bars, sills with drip stains,
  window AC units, soot under the cornice, rain streaks. A second texture derived
  from the same canvas is used as a **bump map**, so sills and lintels catch the
  raking light.
- **Facade relief** — floor ledges on every storey, party-wall pilasters, a
  projecting storefront cornice, parapets, rooftop bulkheads, water towers, and
  wrought fire escapes with ladders.
- **Street** — asphalt with aggregate, tar seams, patches, tyre-polished lanes and
  oil stains; a derived roughness map gives it wet/dry variation; concrete
  sidewalk slabs with joints, gum and stains; kerbs, faded lane paint, crosswalks,
  stop lines, manholes.
- **Life** — parked cars, a taxi and a van at the kerbs, moving traffic in both
  lanes, headlights and tail-lights, pedestrians on the sidewalks, hydrants,
  bins and garbage bags, street trees in pits, a sidewalk shed, traffic signals,
  and street lamps with warm glass.
- **Light** — 2750 K sun raking from the west, 14 500 K sky fill for the blue
  shadow side, warm ground bounce, a studio environment for wet-asphalt and
  car-paint reflections, four practical sodium lamps, and emissive storefronts
  and neon that the bloom pass turns into glow.
- **Atmosphere** — exponential-ish distance fog, a sunset glow at the vanishing
  point, soft cloud decks, additive reflection smears on the wet road under every
  light source, and halation + grain + vignette + ACES in the film pass.

## Files

```
liberty-ave/
├── src/shot/Shot.tsx      the whole shot: textures, geometry, light, camera
├── src/Root.tsx           Remotion composition registration
├── tools/probe.mjs        single-frame look development
└── review/                stills, contact sheet, stats (git-ignored)
```

`Shot.tsx` is organised in six sections: config → texture factory → geometry
banks → city generation → scene → shot. The textures are the interesting part:
`facadeTex`, `shopTex`, `signTex`, `bladeTex`, `asphaltTex`, `sidewalkTex`,
`roughnessTex`, `streakTex`, `glowTex`, `cloudTex`, `sunsetTex`, `skyTex`.

## Rendering

```bash
../tools/setup-toolchain.sh          # ffmpeg + headless chromium, once
export CINE_BROWSER=~/cine-browser/chrome-wrap CINE_GL=swangle
export LD_LIBRARY_PATH=~/cine-browser/lib

SKILL=~/.claude/skills/cinematic-3d
node $SKILL/scripts/stills.mjs       # 5-frame gate + review/contact.png
node $SKILL/scripts/render.mjs --final
```

## Performance notes

Everything that repeats — window ledges, fire escapes, signs, hydrants, cars,
pedestrians, scaffolding — is baked into three merged vertex-coloured meshes
(opaque, glass, emissive) so the whole street is ~250 draw calls instead of
~4000. On this 2-vCPU box with SwiftShader the shot renders at roughly
8–10 s/frame at 1080p.
