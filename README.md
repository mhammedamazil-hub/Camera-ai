# Camera-ai

## vork shot — "Monolith at blue hour"

A cinematic reference still was generated, then rebuilt as an exact-scale 3D scene
in [vork](https://github.com/voyager-so/vork) and iterated against the plate with
measured comparison.

See [`shot-01/README.md`](shot-01/README.md) for the measurements, the scene, the
iteration log and the caveat: vork's renderer needs a Vulkan ray-tracing GPU, which
this environment does not have, so the loop was closed with a CPU previz of vork's
own exported geometry.

```sh
npm install -g @voyager-so/vork          # the curl installer's CDN is unreachable here
python3 scripts/build_scene.py           # regenerate shot-01/scene.json from the measurements
vork check shot-01/scene.json
vork export shot-01/scene.json --out shot-01/scene.glb
python3 scripts/preview.py --out shot-01/preview_cpu.png
python3 scripts/compare.py shot-01/reference.png shot-01/preview_cpu.png
```
