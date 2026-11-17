# Camera-ai

Cinematic 3D shots built in code (three.js + Remotion) with the
[cinematic-3d](https://github.com/Asbeel24/cinematic3d) skill.

## Shots

### [`liberty-ave/`](liberty-ave/) — street-level Manhattan at last light
1920×1080 · 24 fps · 6 s · 35 mm · one 13 m dolly down an avenue at car height.
Every surface is a canvas texture drawn at runtime: 2048² facades with bump-mapped
sills and lintels, five kinds of lit storefront interior, neon fascia and blade
signs, wet asphalt with tyre-polished lanes, fire escapes, water towers, cars,
pedestrians, traffic signals and street lamps.

Master: `liberty-ave/out/liberty-ave-16x9.mp4`
Detail: [`liberty-ave/README.md`](liberty-ave/README.md)

### [`nyc-manhattan/`](nyc-manhattan/) — procedural Manhattan at golden hour
1920×1080 · 24 fps · 6 s · 50 mm · single eased 200 m push-in over the West Side,
Empire State hero mid-right, Chrysler crown on the far right, Hudson and Jersey shore
hazing out to the left. Real 25-landmark table, 29° rotated street grid, four
procedural facade styles, exponential haze band, 3400 K sun.

Master: `nyc-manhattan/out/nyc-manhattan-16x9.mp4`
Detail and credits: [`nyc-manhattan/README.md`](nyc-manhattan/README.md)

## Toolchain

`tools/setup-toolchain.sh` installs the two things the pipeline needs on a bare
Linux box: a static **ffmpeg** (from the `imageio-ffmpeg` wheel) and a headless
**Chromium** with SwiftShader (from `@sparticuz/chromium`, since Remotion's own
browser CDN is unreachable here). It writes a `chrome-wrap` launcher and prints the
three environment variables to export.
