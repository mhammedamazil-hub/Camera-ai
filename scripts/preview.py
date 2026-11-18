"""CPU proxy render for the vork scene.

vork's own renderer needs a Vulkan ray-tracing adapter; this sandbox has none.
So that the framing/lighting review loop is still real, this script:
  1. renders the triangles `vork export` produced from the authored scene.json,
     using the scene's own camera (lens, sensor, translation, target);
  2. stands in for vork's std/sky, std/openpbr shading and height fog with a
     simple analytic model.
It is a PREVIZ, not vork's output. Use it to check composition, scale, framing
and gross exposure; judge materials and final lighting with a real vork render.
"""
import json, math, struct, sys, argparse
import numpy as np
from PIL import Image

# ---------------------------------------------------------------- glTF reading
def parse_glb(path):
    b = open(path, 'rb').read()
    magic, ver, ln = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, 'not a glb'
    off, gltf, bin_chunk = 12, None, None
    while off < len(b):
        clen, ctype = struct.unpack('<II', b[off:off + 8]); off += 8
        data = b[off:off + clen]; off += clen
        if ctype == 0x4E4F534A: gltf = json.loads(data)
        elif ctype == 0x004E4942: bin_chunk = data
    return gltf, bin_chunk

_CT = {5120: 'i1', 5121: 'u1', 5122: 'i2', 5123: 'u2', 5125: 'u4', 5126: 'f4'}
_NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_accessor(g, buf, idx):
    a = g['accessors'][idx]
    n, nc = a['count'], _NC[a['type']]
    dt = np.dtype('<' + _CT[a['componentType']])
    if 'bufferView' not in a:
        return np.zeros((n, nc), dt)
    bv = g['bufferViews'][a['bufferView']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or nc * dt.itemsize
    raw = np.frombuffer(buf, dtype=np.uint8, count=bv['byteLength'], offset=bv.get('byteOffset', 0))
    if stride == nc * dt.itemsize:
        out = np.frombuffer(buf, dtype=dt, count=n * nc, offset=base).reshape(n, nc)
    else:
        out = np.empty((n, nc), dt)
        for i in range(n):
            out[i] = np.frombuffer(buf, dtype=dt, count=nc, offset=base + i * stride)
    return out.astype(np.float64)

def trs(node):
    if 'matrix' in node:
        return np.array(node['matrix'], float).reshape(4, 4).T
    t = np.array(node.get('translation', [0, 0, 0]), float)
    r = node.get('rotation', [0, 0, 0, 1]); x, y, z, w = r
    s = np.array(node.get('scale', [1, 1, 1]), float)
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
                  [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]])
    M = np.eye(4); M[:3, :3] = R * s[None, :]; M[:3, 3] = t
    return M

def gather(g, buf):
    """-> dict of arrays: tri (n,3,3) world, nrm (n,3,3), albedo (n,3), rough (n,), emis (n,3),
       plus mesh-name -> triangle mask, and per-mesh AABBs"""
    mats = g.get('materials', [])
    matinfo = []
    for m in mats:
        pbr = m.get('pbrMetallicRoughness', {})
        base = np.array(pbr.get('baseColorFactor', [0.8, 0.8, 0.8, 1])[:3], float)
        rough = float(pbr.get('roughnessFactor', 0.5))
        emis = np.array(m.get('emissiveFactor', [0, 0, 0]), float)
        strength = float(m.get('extensions', {}).get('KHR_materials_emissive_strength', {})
                         .get('emissiveStrength', 1.0))
        # emission_luminance is cd/m^2; the previz needs scene radiance
        matinfo.append((base, rough, emis * strength / 3000.0))

    tris, nrms, alb, rgh, emi, owner = [], [], [], [], [], []
    names = []
    scene = g['scenes'][g.get('scene', 0)]
    def walk(ni, parent):
        node = g['nodes'][ni]
        M = parent @ trs(node)
        N = np.linalg.inv(M[:3, :3]).T
        if 'mesh' in node:
            name = node.get('name', f'node{ni}')
            names.append(name)
            for prim in g['meshes'][node['mesh']]['primitives']:
                P = read_accessor(g, buf, prim['attributes']['POSITION'])
                Pw = (P @ M[:3, :3].T) + M[:3, 3]
                if 'NORMAL' in prim['attributes']:
                    Nn = read_accessor(g, buf, prim['attributes']['NORMAL']) @ N.T
                    Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-9)
                else:
                    Nn = np.zeros_like(Pw)
                if 'indices' in prim:
                    idx = read_accessor(g, buf, prim['indices']).ravel().astype(np.int64)
                else:
                    idx = np.arange(len(Pw))
                mi = prim.get('material', 0)
                base, rough, emis = matinfo[mi] if mi < len(matinfo) else (np.array([.8,.8,.8]), .5, np.zeros(3))
                t = idx.reshape(-1, 3)
                tris.append(Pw[t]); nrms.append(Nn[t])
                alb.append(np.repeat(base[None], len(t), 0))
                rgh.append(np.full(len(t), rough)); emi.append(np.repeat(emis[None], len(t), 0))
                owner.append(np.full(len(t), names[-1]))
            names.pop()
        for c in node.get('children', []):
            walk(c, M)
    for ni in scene['nodes']:
        walk(ni, np.eye(4))
    cat = lambda v: np.concatenate(v, 0) if v else np.zeros((0,), )
    return dict(tri=cat(tris), nrm=cat(nrms), alb=cat(alb), rough=cat(rgh),
                emis=cat(emi), owner=cat(owner))

# ------------------------------------------------------------------ scene bits
def camera_from_scene(path):
    s = json.load(open(path))
    cam = next(n for n in s['nodes'] if n['type'] == 'camera')
    mat = cam.get('material')
    if isinstance(mat, str):
        mat = s['materials'][mat]
    inp = mat.get('inputs', {})
    eye = np.array(cam['translation'], float)
    tgt = np.array(cam['target'], float) if isinstance(cam.get('target'), list) else None
    fwd = tgt - eye; fwd /= np.linalg.norm(fwd)
    return dict(eye=eye, fwd=fwd, lens=inp.get('lens', 50.0),
                sw=inp.get('sensor_width', 36.0), sh=inp.get('sensor_height'),
                res=s['render']['resolution'],
                exposure=s['composition']['view']['inputs'].get('exposure', 0.0))

_SKY = None
def _sky_coef():
    global _SKY
    if _SKY is None:
        try:
            _SKY = np.array(json.load(open('out/sky_fit.json'))['coef'])
        except Exception:
            _SKY = np.array([[0.004, 0.045, 0.094], [0, 0, 0], [0.02, 0.09, 0.11],
                             [0, 0, 0], [0, 0, 0], [0, 0, 0], [0.04, 0.11, 0.10], [0, 0, 0]])
    return _SKY


def sky(d, sun_az=0.0, sun_el=0.0):
    """Twilight stand-in for vork std/sky: an 8-term basis fitted to the plate."""
    az = np.arctan2(d[:, 0], -d[:, 2])
    el = np.arcsin(np.clip(d[:, 1], -1, 1))
    G = lambda e, c, s: np.exp(-((e - c) / s) ** 2)
    B = np.stack([
        np.ones_like(el),
        np.exp(-el / 0.05), np.exp(-el / 0.20), np.exp(-el / 0.60),
        G(el, .07, .09) * np.exp(-((az + 0.50) / 1.1) ** 2),
        G(el, .07, .09) * np.exp(-((az - 0.50) / 1.1) ** 2),
        G(el, .07, .09),
        np.exp(-np.clip(el, 0, None) / 0.03) * np.exp(-((az + 0.46) / 0.35) ** 2),
    ], 1)
    return np.clip(B @ _sky_coef(), 0, None)


def tonemap(x, exposure=0.0):
    x = x * (2.0 ** exposure)
    y = x / (1.0 + x)                       # simple filmic shoulder
    return np.clip(y, 0, 1) ** (1 / 2.2)

# ------------------------------------------------------------------- rendering
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--scene', default='shot-01/scene.json')
    ap.add_argument('--glb', default='shot-01/scene.glb')
    ap.add_argument('--out', default='out/preview.png')
    ap.add_argument('--width', type=int, default=0)
    ap.add_argument('--exposure', type=float, default=None)
    ap.add_argument('--ss', type=int, default=1, help='supersample factor')
    A = ap.parse_args()

    g, buf = parse_glb(A.glb)
    geo = gather(g, buf)
    cam = camera_from_scene(A.scene)
    W, H = (A.width or cam['res'][0]), (A.width or cam['res'][0]) * cam['res'][1] // cam['res'][0]
    W, H = W * A.ss, H * A.ss
    exposure = cam['exposure'] if A.exposure is None else A.exposure

    # sun/moon and lantern, read back from the authored scene
    s = json.load(open(A.scene))
    lights = [n for n in s['nodes'] if n.get('type') == 'light']
    key = next((n for n in lights if n.get('name') == 'moonlight'), None)
    lant = next((n for n in lights if n.get('shape') == 'point'), None)
    Ldir = np.array(key['target'], float) - np.array(key['translation'], float)
    Ldir /= np.linalg.norm(Ldir)
    Lcol = np.array(key['color'], float) * float(key['energy'])   # W/m^2
    lpos = np.array(lant['translation'], float); lpow = float(lant['energy'])

    # fog params (mirror of the authored medium)
    fog = s['materials']['mist']['inputs']
    fs, fbase, ffall = np.array(fog['scattering'], float), float(fog['base_height']), float(fog['falloff'])

    # camera basis
    fwd = cam['fwd']; right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    tx = (cam['sw'] / 2) / cam['lens']; ty = tx * H / W
    u = ((np.arange(W) + 0.5) / W * 2 - 1)[None, :]
    v = (1 - (np.arange(H) + 0.5) / H * 2)[:, None]
    D = fwd[None, None, :] + right[None, None, :] * (u * tx)[..., None] + up[None, None, :] * (v * ty)[..., None]
    D /= np.linalg.norm(D, axis=2, keepdims=True)
    Df = D.reshape(-1, 3)
    eye = cam['eye']
    sun_az = -0.46          # just-set sun, left of frame axis (plate: brightest sky x~0.2)
    sun_el = -0.062

    # ---------------- rasterize opaque geometry (skip the water plane)
    is_water = geo['owner'] == 'water'
    tri, nrm, alb = geo['tri'][~is_water], geo['nrm'][~is_water], geo['alb'][~is_water]
    rgh, emi, own = geo['rough'][~is_water], geo['emis'][~is_water], geo['owner'][~is_water]
    Nv = tri.reshape(-1, 3)
    rel = Nv - eye
    zc = rel @ fwd
    safe = np.maximum(zc, 1e-4)
    sxp = ((rel @ right) / safe / tx * 0.5 + 0.5) * W
    syp = (0.5 - (rel @ up) / safe / ty * 0.5) * H
    sxp = sxp.reshape(-1, 3); syp = syp.reshape(-1, 3); zc = zc.reshape(-1, 3)

    colour = np.zeros((H * W, 3)); zbuf = np.full(H * W, np.inf)
    vis = (zc > 0.2).all(axis=1)
    order = np.argsort(-((zc.max(axis=1)) ))
    for t in order:
        if not vis[t]:
            continue
        x0, x1 = int(np.floor(sxp[t].min())), int(np.ceil(sxp[t].max()))
        y0, y1 = int(np.floor(syp[t].min())), int(np.ceil(syp[t].max()))
        x0, x1 = max(x0, 0), min(x1, W - 1); y0, y1 = max(y0, 0), min(y1, H - 1)
        if x0 > x1 or y0 > y1:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        ax, ay = sxp[t, 0], syp[t, 0]; bx, by = sxp[t, 1], syp[t, 1]; cx, cy = sxp[t, 2], syp[t, 2]
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        l3 = 1 - l1 - l2
        m = (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
        if not m.any(): continue
        w0, w1_, w2 = 1.0 / zc[t, 0], 1.0 / zc[t, 1], 1.0 / zc[t, 2]
        wsum = l1 * w0 + l2 * w1_ + l3 * w2
        z = 1.0 / np.maximum(wsum, 1e-12)          # perspective-correct depth
        pix = (np.arange(y0, y1 + 1)[:, None] * W + np.arange(x0, x1 + 1)[None, :])
        mm = m & (z < zbuf[pix])
        if not mm.any(): continue
        nn = (l1[..., None] * nrm[t, 0] * w0 + l2[..., None] * nrm[t, 1] * w1_
              + l3[..., None] * nrm[t, 2] * w2) / np.maximum(wsum, 1e-12)[..., None]
        nn /= np.maximum(np.linalg.norm(nn, axis=2, keepdims=True), 1e-9)
        npos = eye + (xs[..., None] * 0 + 1) * 0   # placeholder, filled per hit below
        # hit positions for shading
        dr = Df[pix[mm]]
        P = eye + dr * (z[mm] / np.maximum(Df[pix[mm]] @ fwd, 1e-6))[:, None]
        Nn = nn[mm]
        V = -dr
        alb_t = alb[t]; rg = max(rgh[t], 0.03)
        diff = np.clip(Nn @ Ldir, 0, 1)[:, None] * Lcol[None]
        # sky dome ambient (approximation of the environment integral)
        amb = np.clip(Nn[:, 1] * 0.5 + 0.5, 0, 1)[:, None] * np.array([0.16, 0.25, 0.30]) * 0.85
        Hh = Ldir[None, :] + V; Hh /= np.maximum(np.linalg.norm(Hh, axis=1, keepdims=True), 1e-9)
        spec = np.clip((Nn * Hh).sum(1), 0, 1)[:, None] ** (2 / rg ** 2 - 2) * Lcol[None] * 0.5
        # lantern point light + its in-scatter halo
        dvec = lpos[None, :] - P; d2 = np.maximum((dvec ** 2).sum(1), 1e-6)
        ln = dvec / np.sqrt(d2)[:, None]
        El = lpow / (4 * math.pi * d2)
        ldiff = np.clip((Nn * ln).sum(1), 0, 1)[:, None] * El[:, None] * np.array([1.0, 0.55, 0.21])
        c = alb_t[None] * (diff + amb + ldiff) + spec + emi[t][None]
        colour[pix[mm]] = c
        zbuf[pix[mm]] = z[mm]

    # ---------------- surface resolution: opaque mesh vs water plane vs sky
    hit = np.isfinite(zbuf)
    tt = zbuf / np.maximum(Df @ fwd, 1e-9)            # ray distance for mesh hits
    with np.errstate(divide='ignore', invalid='ignore'):
        tw = np.where(Df[:, 1] < -1e-6, -eye[1] / Df[:, 1], np.inf)
    water = np.isfinite(tw) & (tw < 5000) & ((~hit) | (tw < tt))
    sky_mask = ~hit & ~water

    # geometry stand-ins the mirror sees, as world AABBs
    stone_names = ('monolith', 'buttress_0', 'buttress_1', 'buttress_2', 'buttress_3',
                   'buttress_4', 'crest_a', 'crest_b', 'figure', 'head')
    boxes = []
    for name in stone_names:
        m = geo['owner'] == name
        if m.any():
            boxes.append((geo['tri'][m].reshape(-1, 3).min(0), geo['tri'][m].reshape(-1, 3).max(0)))

    def aabb_hit(o, r, boxes):
        inside = np.zeros(len(r), bool)
        for lo, hi in boxes:
            t0 = np.full(len(r), -np.inf); t1 = np.full(len(r), np.inf)
            for a in range(3):
                with np.errstate(divide='ignore', invalid='ignore'):
                    ta = (lo[a] - o[a]) / r[:, a]; tb = (hi[a] - o[a]) / r[:, a]
                t0 = np.maximum(t0, np.minimum(ta, tb)); t1 = np.minimum(t1, np.maximum(ta, tb))
            inside |= (t1 > np.maximum(t0, 0))
        return inside

    out = np.zeros((H * W, 3))
    hitcol = colour
    t_end = np.full(H * W, np.inf)

    # ---- water: mirror of sky, stone and lantern, plus the stretched streak
    if water.any():
        idx = np.where(water)[0]
        d = Df[idx]
        r = d.copy(); r[:, 1] *= -1.0
        col = sky(r, sun_az, sun_el)
        P = eye[None, :] + d * tw[idx][:, None]
        stone = aabb_hit(eye, r, boxes)
        if stone.any():
            shade = np.array([0.014, 0.016, 0.019])[None] * (0.7 + 0.6 * np.clip(-r[stone][:, 2], 0, 1)[:, None])
            col[stone] = shade
        # lantern reflection: mirror image below the water line
        L = lpos - np.array([0, 2 * lpos[1], 0])
        tgt = L[None, :] - P
        tgt /= np.maximum(np.linalg.norm(tgt, axis=1, keepdims=True), 1e-9)
        az_r = np.arctan2(r[:, 0], -r[:, 2]); el_r = np.arcsin(np.clip(r[:, 1], -1, 1))
        az_t = np.arctan2(tgt[:, 0], -tgt[:, 2]); el_t = np.arcsin(np.clip(tgt[:, 1], -1, 1))
        daz = np.angle(np.exp(1j * (az_r - az_t))).real
        streak = np.exp(-(daz / 0.0030) ** 2) * np.exp(-np.abs(el_r - el_t) / 0.045)
        col += streak[:, None] * np.array([2.6, 1.05, 0.22])
        col += np.exp(-(np.hypot(daz, el_r - el_t) / 0.014) ** 2)[:, None] * np.array([0.16, 0.055, 0.010])
        # roughness blurs the mirror toward the horizon-averaged sky
        rough = 0.22
        blur = sky(np.stack([r[:, 0], np.full(len(r), 0.02), r[:, 2]], 1), sun_az, sun_el)
        col = col * (1 - min(1.0, rough / 0.5)) + blur * min(1.0, rough / 0.5) * 0.85
        F = 0.02 + 0.98 * (1 - np.abs(d[:, 1])) ** 5
        # wet sand keeps a little diffuse so the near field does not go pure black
        diffuse = np.array([0.006, 0.008, 0.009])
        out[idx] = F[:, None] * col + (1 - F[:, None]) * diffuse
        t_end[idx] = np.minimum(tw[idx], 4000)

    # ---- opaque meshes
    if (hit & ~water).any():
        idx = np.where(hit & ~water)[0]
        out[idx] = hitcol[idx]
        t_end[idx] = tt[idx]

    # ---- sky
    if sky_mask.any():
        idx = np.where(sky_mask)[0]
        out[idx] = sky(Df[idx], sun_az, sun_el)
        # a sky ray still crosses the whole marine layer: give it a notional depth
        with np.errstate(divide='ignore', invalid='ignore'):
            tp = np.where(Df[idx, 1] < -1e-6, -eye[1] / Df[idx, 1], 4000.0)
        t_end[idx] = np.clip(tp, 60, 4000)

    # ---- exponential-height fog / mist on every ray
    sel = np.isfinite(t_end) & (t_end > 0)
    idx = np.where(sel)[0]
    if len(idx):
        seg = t_end[idx]
        nmix = 10
        ts = np.linspace(0, 1, nmix)[None, :] * seg[:, None]
        ys = eye[1] + Df[idx][:, None, 1] * ts
        dens = fs[None, None, :] * np.exp(-ffall * (ys[..., None] - fbase))
        tau = dens.sum(1) / nmix * seg[:, None]
        T = np.exp(-tau)
        up = Df[idx].copy(); up[:, 1] = np.maximum(up[:, 1], 0.035)
        up /= np.linalg.norm(up, axis=1, keepdims=True)
        fogc = sky(up, sun_az, sun_el)
        out[idx] = out[idx] * T + fogc * (1 - T) * 0.78   # single-scatter weight

    # ---- lantern: aerial halo (what the fog does to a 6 W point source)
    lm = lpos[None, :] - eye[None, :]
    ang = np.linalg.norm(np.cross(lm, Df), axis=1) / np.linalg.norm(lm)
    out += np.exp(-(ang / 0.0042) ** 2)[:, None] * np.array([1.5, 0.62, 0.16])

    img = tonemap(out.reshape(H, W, 3), exposure)
    if A.ss > 1:
        img = img.reshape(H // A.ss, A.ss, W // A.ss, A.ss, 3).mean((1, 3))
    im = Image.fromarray((np.clip(img, 0, 1) * 255).round().astype(np.uint8))
    im.save(A.out)
    print(f'wrote {A.out}  {im.size[0]}x{im.size[1]}  (CPU proxy, not vork renderer)')

if __name__ == '__main__':
    main()
