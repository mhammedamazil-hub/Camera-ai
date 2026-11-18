"""Measure a render against the reference plate and write a side-by-side."""
import sys, json
import numpy as np
from PIL import Image

REF, CAND = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else 'out/compare.png'

def load(p):
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float64) / 255.0
    return a

ref, cand = load(REF), load(CAND)
h, w, _ = ref.shape
cand = np.asarray(Image.fromarray((cand * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float64) / 255.0
lum_r = ref @ np.array([.2126, .7152, .0722])
lum_c = cand @ np.array([.2126, .7152, .0722])

def horizon(lum):
    step = np.abs(np.diff(lum[:, :int(w*0.30)].mean(1)))
    lo, hi = int(h*0.60), int(h*0.90)
    return (lo + int(np.argmax(step[lo:hi]))) / h

def silhouette(a):
    lum = a @ np.array([.2126, .7152, .0722])
    band = lum[:int(h*0.80), int(w*0.30):int(w*0.65)]
    m = band < 0.15
    cc = m.sum(0); cols = np.where(cc > band.shape[0]*0.35)[0]
    if not len(cols): return None
    rc = m[:, cols.min():cols.max()+1].sum(1); rows = np.where(rc > (cols.max()-cols.min())*0.30)[0]
    x0, x1 = int(w*0.30)+cols.min(), int(w*0.30)+cols.max()
    return dict(x0=x0/w, x1=x1/w, y0=rows.min()/h, y1=rows.max()/h,
                wpx=(x1-x0)/w, hpx=(rows.max()-rows.min())/h)

def sky_metric(a):
    lum = a @ np.array([.2126, .7152, .0722])
    return np.median(lum[:int(h*0.30), :int(w*0.20)])

rows = []
def put(label, r, c, fmt='{:.3f}'):
    rows.append((label, fmt.format(r), fmt.format(c), fmt.format(c-r)))

put('horizon y', horizon(lum_r), horizon(lum_c))
sr, sc = silhouette(ref), silhouette(cand)
if sr and sc:
    for k in ('x0','x1','y0','y1','wpx','hpx'):
        put(f'stone {k}', sr[k], sc[k])
# tonal landmarks
pts = {'sky top-left': (.10,.06), 'sky mid-left': (.10,.42), 'sky near-horizon': (.10,.66),
       'sky top-right': (.90,.06), 'stone upper': (.47,.25), 'stone mid': (.48,.50),
       'stone lower': (.50,.70), 'water near-left': (.20,.90), 'water mid': (.30,.84),
       'water right': (.75,.88), 'moon area': (.2526,.1686)}
for name, (fx, fy) in pts.items():
    x, y = int(fx*w), int(fy*h)
    rr = ref[max(0,y-3):y+4, max(0,x-3):x+4].reshape(-1,3).mean(0)
    cc = cand[max(0,y-3):y+4, max(0,x-3):x+4].reshape(-1,3).mean(0)
    rows.append((f'lum {name}', f'{rr@np.array([.2126,.7152,.0722]):.3f}',
                 f'{cc@np.array([.2126,.7152,.0722]):.3f}',
                 f'{(cc-rr)@np.array([.2126,.7152,.0722]):+.3f}'))
def patch_max(a, fx, fy, r=22):
    x, y = int(fx*w), int(fy*h)
    L = a @ np.array([.2126,.7152,.0722])
    return L[max(0,y-r):y+r, max(0,x-r):x+r].max()
rows.append(('moon peak lum', f'{patch_max(ref,.2526,.1686):.3f}', f'{patch_max(cand,.2526,.1686):.3f}', ''))
rows.append(('mean lum', f'{lum_r.mean():.3f}', f'{lum_c.mean():.3f}', f'{lum_c.mean()-lum_r.mean():+.3f}'))
rows.append(('p99 lum', f'{np.percentile(lum_r,99):.3f}', f'{np.percentile(lum_c,99):.3f}', ''))
print(f'{"landmark":22s} {"reference":>10s} {"candidate":>10s} {"delta":>8s}')
for a,b,c,d in rows: print(f'{a:22s} {b:>10s} {c:>10s} {d:>8s}')

# side-by-side with a labelled gutter
gap = np.zeros((8, w, 3))
sbs = np.concatenate([ref, gap, cand], 0)
Image.fromarray((sbs*255).clip(0,255).astype(np.uint8)).save(OUT)
print('wrote', OUT, '(reference on top, candidate below)')
