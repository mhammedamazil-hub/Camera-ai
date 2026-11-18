"""Render the scene under several settings in one run and lay them out to choose.

Exposure alone was the wrong dial: sweeping it showed the frame dark at every
value, so the levers are the sky and the environment light's strength. Each
variant is a comma-separated set of overrides:

    e=   composition.view exposure (AgX stops)
    sun= std/sky sun_elevation (radians)
    aer= std/sky aerosol_density
    E=   environment light energy multiplier

  SWEEP_VARIANTS="e=-0.5,sun=-0.10,aer=0.8,E=1  e=-0.5,sun=-0.10,aer=0.8,E=4" \
    VORK_GPU=cpu python3 scripts/sweep_exposure.py
"""
import json, os, subprocess
import numpy as np
from PIL import Image, ImageDraw

SCENE = 'shot-01/scene.json'
REF = 'shot-01/reference.png'
TILE = (760, 319)                       # 2.381:1, small enough for llvmpipe
DEFAULT = ("e=-0.50,sun=-0.10,aer=0.80,E=1.0 "
           "e=-0.50,sun=-0.10,aer=0.80,E=2.0 "
           "e=-0.50,sun=-0.10,aer=0.80,E=4.0 "
           "e=-0.90,sun=-0.10,aer=0.80,E=4.0")
VARIANTS = [v for v in os.environ.get('SWEEP_VARIANTS', DEFAULT).split() if v]

def luma(img):
    a = np.asarray(img.convert('RGB')).astype(np.float64) / 255.0
    return (a @ np.array([.2126, .7152, .0722])).mean()

plate = Image.open(REF).resize(TILE, Image.LANCZOS)
plate_mean = luma(plate)
base = json.load(open(SCENE))
os.makedirs('out/sweep', exist_ok=True)

rows = []
for i, spec in enumerate(VARIANTS):
    opts = dict(kv.split('=', 1) for kv in spec.split(','))
    s = json.loads(json.dumps(base))
    s['composition']['view']['inputs']['exposure'] = float(opts.get('e', 0))
    for node in s['nodes']:
        if node.get('name') == 'sky':
            node['material']['inputs']['sun_elevation'] = float(opts.get('sun', -0.10))
            node['material']['inputs']['aerosol_density'] = float(opts.get('aer', 0.8))
            node['energy'] = float(opts.get('E', 1.0))
    s['render']['resolution'] = list(TILE)
    path, out = f'out/sweep/v{i}.json', f'out/sweep/v{i}.png'
    json.dump(s, open(path, 'w'))
    cmd = ['vork', 'render', path, '--out', out, '--profile', 'std/final']
    print('+', spec, flush=True)
    subprocess.run(cmd, check=True)
    im = Image.open(out).convert('RGB').resize(TILE, Image.LANCZOS)
    m = luma(im)
    ex = {}
    if os.path.exists(out + '.meta.json'):
        ex = json.load(open(out + '.meta.json')).get('exposure', {})
    rows.append((spec, im, m, ex.get('near_black', 0.0), ex.get('clipped', 0.0)))
    print(f"  mean luma {m:.3f} (plate {plate_mean:.3f}, delta {m - plate_mean:+.3f})"
          f"  near_black {rows[-1][3]:.2f}  clipped {rows[-1][4]:.4f}", flush=True)

lab = 20
sheet = Image.new('RGB', (TILE[0], (len(rows) + 1) * (TILE[1] + lab) + 10), (12, 12, 14))
d = ImageDraw.Draw(sheet)
d.text((6, 4), f'PLATE (reference) - mean luma {plate_mean:.3f}', fill=(210, 220, 230))
sheet.paste(plate, (0, lab))
y = TILE[1] + lab + 8
for spec, im, m, nb, clip in rows:
    good = abs(m - plate_mean) < 0.03
    d.text((6, y + 3), f'{spec}  ->  mean {m:.3f} ({m - plate_mean:+.3f})  '
                       f'near-black {nb:.2f}  clipped {clip:.4f}',
           fill=(230, 230, 235) if good else (205, 172, 150))
    sheet.paste(im, (0, y + lab))
    y += TILE[1] + lab
sheet.save('shot-01/exposure_sweep.png')
print('wrote shot-01/exposure_sweep.png')
