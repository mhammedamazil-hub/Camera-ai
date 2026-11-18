"""Fit the previz sky to the plate's twilight gradient.

The previz has no access to vork's std/sky (that needs the GPU), so this fits an
analytic stand-in to the reference plate so composition/exposure comparison is
meaningful. The scene keeps its own std/sky parameters; those must be confirmed
on a GPU render.
"""
import json, math
import numpy as np
from PIL import Image

TAN_X = 18.0 / 50.0
TAN_Y = (36.0 / 2.381 / 2) / 50.0
PITCH = math.atan((0.734 - 0.5) * 2 * TAN_Y)

a = np.asarray(Image.open('shot-01/reference.png').convert('RGB')).astype(np.float64)/255.
h, w, _ = a.shape
# inverse of the previz tone curve: y = (x/(1+x))^(1/2.2)
lin = (a ** 2.2); lin = np.clip(lin, 0, 0.999); lin = lin/(1-lin)

us = np.linspace(0.02, 0.98, 49); vs = np.linspace(0.02, 0.55, 34)
pts = []
for fy in vs:
    for fx in us:
        if 0.34 < fx < 0.63 and fy > 0.07:          # stone
            continue
        if math.hypot(fx-0.2526, fy-0.1686) < 0.035:  # moon
            continue
        c = a[int(fy*h), int(fx*w)]
        if c @ np.array([.2126,.7152,.0722]) > 0.42:   # blown / moon halo
            continue
        pts.append((fx, fy))
pts = np.array(pts)
X = (pts[:,0]-0.5)*2*TAN_X
Y = (0.5-pts[:,1])*2*TAN_Y + math.tan(PITCH)
az = np.arctan(X)
el = np.arctan(Y/np.sqrt(1+X**2))
rgb = np.array([lin[int(fy*h), int(fx*w)] for fx, fy in pts])

G = lambda e, c, s: np.exp(-((e-c)/s)**2)
B = np.stack([
    np.ones_like(el),
    np.exp(-el/0.05), np.exp(-el/0.20), np.exp(-el/0.60),
    G(el,.07,.09)*np.exp(-((az+0.50)/1.1)**2),
    G(el,.07,.09)*np.exp(-((az-0.50)/1.1)**2),
    G(el,.07,.09),
    np.exp(-np.clip(el,0,None)/0.03)*np.exp(-((az+0.46)/0.35)**2),
], 1)
coef, *_ = np.linalg.lstsq(B, rgb, rcond=None)
pred = B @ coef
ss = 1 - ((pred-rgb)**2).sum(0)/((rgb-rgb.mean(0))**2).sum(0)
print('R^2 per channel (R,G,B):', np.round(ss, 3))
json.dump({'coef': coef.tolist()}, open('out/sky_fit.json','w'), indent=1)
print('wrote out/sky_fit.json')
