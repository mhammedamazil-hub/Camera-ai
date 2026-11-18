"""Row-wise stone silhouette extent + mask IoU, so shape can be matched by number."""
import sys
import numpy as np
from PIL import Image

def mask_of(path, frac=0.78):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float64)/255.
    h, w, _ = a.shape
    lum = a @ np.array([.2126,.7152,.0722])
    m = np.zeros((h, w), bool)
    for y in range(h):
        row = lum[y]
        bg = np.median(np.concatenate([row[:int(w*0.26)], row[int(w*0.74):]]))
        m[y] = row < bg*frac
    return m, w, h

def extents(m, w, h, rows):
    out=[]
    for y in rows:
        yi = int(y*h)
        xs = np.where(m[yi, int(w*0.33):int(w*0.66)])[0]
        out.append((y, None, None) if not len(xs) else
                   (y, (xs.min()+int(w*0.33))/w, (xs.max()+int(w*0.33))/w))
    return out

ref_p, cand_p = sys.argv[1], sys.argv[2]
mr, w, h = mask_of(ref_p); mc, wc, hc = mask_of(cand_p, 0.80)
mc = np.asarray(Image.fromarray(mc.astype(np.uint8)*255).resize((w, h), Image.NEAREST)) > 127
rows = np.linspace(0.11, 0.60, 16)
er, ec = extents(mr, w, h, rows), extents(mc, w, h, rows)
print(f'{"row":>5} | {"ref L":>6} {"ref R":>6} {"ref W":>6} | {"cand L":>6} {"cand R":>6} {"cand W":>6} | {"dL":>6} {"dR":>6}')
for (y,l0,r0),(_,l1,r1) in zip(er,ec):
    g=lambda v:'  -  ' if v is None else f'{v:.3f}'
    dl = '  -  ' if (l0 is None or l1 is None) else f'{l1-l0:+.3f}'
    dr = '  -  ' if (r0 is None or r1 is None) else f'{r1-r0:+.3f}'
    print(f'{y:5.3f} | {g(l0):>6} {g(r0):>6} {g(None if l0 is None else r0-l0):>6} | '
          f'{g(l1):>6} {g(r1):>6} {g(None if l1 is None else r1-l1):>6} | {dl:>6} {dr:>6}')
def fill(m):
    f = np.zeros_like(m)
    for y in range(m.shape[0]):
        xs = np.where(m[y, int(w*0.33):int(w*0.66)])[0]
        if len(xs): f[y, xs.min()+int(w*0.33):xs.max()+int(w*0.33)+1] = True
    return f
band = slice(int(0.11*h), int(0.60*h)), slice(int(w*0.33), int(w*0.66))
Fr, Fc = fill(mr)[band], fill(mc)[band]
print(f'shape IoU (row-filled silhouette): {(Fr&Fc).sum()/max((Fr|Fc).sum(),1):.4f}')
A, B = mr[band], mc[band]
print(f'\nmask IoU (rows 0.11-0.60, x 0.33-0.66): {(A&B).sum()/max((A|B).sum(),1):.4f}'
      f'   ref area {A.mean():.4f}  cand area {B.mean():.4f}')
