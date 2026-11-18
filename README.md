# Camera-ai

## vork shot — "Monolith at blue hour"

A cinematic reference still was generated, then rebuilt as an exact-scale 3D scene
in [vork](https://github.com/voyager-so/vork) and iterated against the plate with
measured comparison.

See [`shot-01/README.md`](shot-01/README.md) for the measurements, the scene and
the iteration log.

## Rendering — no GPU required

`.github/workflows/vork-render.yml` renders the shot on GitHub Actions.

**Why CPU:** GitHub-hosted runners have no GPU, and the hosted GPU runners (T4)
have no ray-tracing cores, which vork requires for hardware rendering. So the
default job installs Mesa's **lavapipe** software Vulkan driver and renders with
vork's supported `--gpu cpu` path. It is slow, but it needs nothing but a runner.
`vork setup` in CI reports the adapter it picked, every run.

**Run it:** Actions → *vork render* → *Run workflow*. Inputs: `profile`
(`std/draft|std/final|std/path`), `resolution`, optional `samples` override, and
`runner` (`github-cpu` or `self-hosted-gpu`). With `commit_render` on, the PNG is
committed back to the branch so it is viewable in the repo; otherwise it is an
artifact.

**Have an RTX-class machine?** Register it as a self-hosted runner labelled
`self-hosted,gpu` and dispatch with `runner: self-hosted-gpu` — that takes the
hardware path instead.

Every run also:
* fails if `shot-01/scene.json` has drifted from `scripts/build_scene.py`;
* runs `vork check` (CPU-only validation) and `vork export`;
* renders a 400×168 smoke frame first, then the requested frame;
* compares the render against `shot-01/reference.png` and posts the table
  (silhouette IoU, landmark luminance deltas) into the job summary.

If the CI render diverges from your local branch, `git pull --rebase` — CI commits
the render with `[skip ci]`.

```sh
npm install -g @voyager-so/vork          # the curl installer's CDN may be unreachable
python3 scripts/build_scene.py           # regenerate shot-01/scene.json from the measurements
vork check shot-01/scene.json
vork export shot-01/scene.json --out shot-01/scene.glb
python3 scripts/preview.py --out shot-01/preview_cpu.png
python3 scripts/compare.py shot-01/reference.png shot-01/preview_cpu.png
```
