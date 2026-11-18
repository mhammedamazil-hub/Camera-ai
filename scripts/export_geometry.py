"""Derive a geometry-only scene for `vork export`, then export it to glTF.

The authored scene.json stays the source of truth. glTF 2.0 core cannot carry
vork's world medium or light extents, so those are stripped/acknowledged here
for the sole purpose of getting vork's evaluated triangles out for a CPU preview.
"""
import json, subprocess, sys, os

src = sys.argv[1] if len(sys.argv) > 1 else 'shot-01/scene.json'
out = sys.argv[2] if len(sys.argv) > 2 else 'shot-01/scene.glb'
scene = json.load(open(src))
for node in scene['nodes']:
    node.pop('medium', None)          # world fog has no glTF representation
scene['programs'] = {}
for name in [k for k in scene['materials'] if scene['materials'][k]['program'] not in ('std/openpbr', 'std/camera', 'std/agx', 'std/standard')]:
    del scene['materials'][name]      # medium-only materials have no glTF form
json.dump(scene, open('shot-01/scene.export.json', 'w'), indent=1)

cmd = ['vork', 'export', 'shot-01/scene.export.json', '--out', out,
       '--allow-loss', 'environment_lighting', '--allow-loss', 'light_representation',
       '--allow-loss', 'clearcoat_ior', '--allow-loss', 'light_extent']
print('+', ' '.join(cmd))
r = subprocess.run(cmd, capture_output=True, text=True)
print(r.stdout.strip())
if r.returncode:
    print(r.stderr.strip()); sys.exit(r.returncode)
print('exported', out, os.path.getsize(out), 'bytes')
