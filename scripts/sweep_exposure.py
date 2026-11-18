"""Render one scene at several AgX exposure values and lay them out for choosing.

Built for CI: a single GPU-less run produces a contact sheet, so exposure can be
picked from measurements instead of guessed one render at a time.

  VORK_GPU=cpu python3 scripts/sweep_exposure.py -0.9 -0.6 -0.3 0.0
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

EXPOSURES = [float(a) for a in sys.argv[1:]] or [-0.9, -0.6, -0.3, 0.0]
SCENE = 'shot-01/scene.json'
REF = 'shot-01/reference.png'
TILE = (760, 319)          # 2.381:1, small enough to render fast on llvmpipe
PLATE_MEAN = 0.261         # mean luma of the reference plate

def luma(img):
    a = np.asarray(img.convert('RGB')).astype(np.float64) / 255.0
    return (a @ np.array([.2126, .7152, .0722])).mean()

plate = Image.open(REF).resize(TILE, Image.LANCZOS)
plate_mean = luma(plate)
base = json.load(open(SCENE))
os.makedirs('out/sweep', exist_ok=True)

rows = []
for e in EXPOSURES:
    s = json.loads(json.dumps(base))
    s['composition']['view']['inputs']['exposure'] = e
    s['render']['resolution'] = list(TILE)
    path = f'out/sweep/e{e:+.2f}.json'
    out = f'out/sweep/e{e:+.2f}.png'
    json.dump(s, open(path, 'w'))
    cmd = ['vork', 'render', path, '--out', out, '--profile', 'std/final']
    print('+', ' '.join(cmd), flush=True)
    subprocess.run(cmd, check=True)
    im = Image.open(out).convert('RGB').resize(TILE, Image.LANCZOS)
    m = luma(im)
    meta = f'{out}.meta.json'
    nb = clip = float('nan')
    if os.path.exists(meta):
        ex = json.load(open(meta)).get('exposure', {})
        nb, clip = ex.get('near_black', float('nan')), ex.get('clipped', float('nan'))
    rows.append((e, im, m, nb, clip))
    print(f'exposure {e:+.2f}: mean luma {m:.3f}  near_black {nb:.3f}  clipped {clip:.4f}'
          f'  (plate {plate_mean:.3f})', flush=True)

lab = 20
sheet = Image.new('RGB', (TILE[0], (len(rows) + 1) * (TILE[1] + lab) + 10), (12, 12, 14))
from PIL import ImageDraw
d = ImageDraw.Draw(sheet)
d.text((6, 4), f'PLATE (reference) — mean luma {plate_mean:.3f}', fill=(210, 220, 230))
sheet.paste(plate, (0, lab))
y = TILE[1] + lab + 8
for e, im, m, nb, clip in rows:
    d.text((6, y + 3),
           f'exposure {e:+.2f} — mean {m:.3f} ({m - plate_mean:+.3f})  '
           f'near-black {nb:.2f}  clipped {clip:.4f}',
           fill=(230, 230, 235) if abs(m - plate_mean) < 0.03 else (200, 170, 150))
    sheet.paste(im, (0, y + lab))
    y += TILE[1] + lab
sheet.save('shot-01/exposure_sweep.png')
print('wrote shot-01/exposure_sweep.png')
