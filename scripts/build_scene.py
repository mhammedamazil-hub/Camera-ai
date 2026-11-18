"""Build shot-01/scene.json from measurements of shot-01/reference.png.

Framing is derived, not guessed. From the plate (3200x1344, 2.381:1):
  horizon            0.734 of frame height   -> camera pitched 4.05 deg up
  stone silhouette   cx 0.484, top 0.106, base 0.799, w 0.141-0.171 -> 2:1 slab
  moon               (0.253, 0.169), disc ~0.011 of width
  lantern            (0.566, 0.709), warm core + vertical water streak
With a 50 mm lens on a 36 mm sensor (horizontal fit), tan(half_x) = 0.36 and
tan(half_y) = 0.1512, so at 60 m a 1 m object spans 60 * 0.36 * 2 / 60... i.e.
world_width = 0.1406 * 2 * 0.36 * 60 = 6.07 m and the slab stands 12.7 m tall.
"""
import json, math

LENS, SENSOR_W, SENSOR_H = 50.0, 36.0, 36.0 / 2.381
TAN_X = (SENSOR_W / 2) / LENS
TAN_Y = (SENSOR_H / 2) / LENS
RES = [1600, 672]
EYE = [0.0, 1.20, 0.0]
DIST = 60.0                      # camera to stone
PITCH = math.atan((0.734 - 0.5) * 2 * TAN_Y)          # 4.05 deg up

def aim(eye, pitch, dist=10.0):
    return [eye[0], eye[1] + math.tan(pitch) * dist, eye[2] - dist]

MIST = '''// Marine layer: exponential-height world fog (stage-1 path transport).
// Extinction = coefficient * exp(-falloff * (y - base_height)); dense below
// base_height, thinning above. Zero channels stay zero where it would overflow.
import vork;
struct Inputs {
    float3 scattering = float3(0.02);
    float3 absorption = float3(0.0);
    float base_height = 0.45;
    float falloff = 0.55;
    float anisotropy = 0.7;
};
float sc1(float c, float s) { return c == 0.0 ? 0.0 : c * s; }
float3 sc3(float3 c, float s) { return float3(sc1(c.x, s), sc1(c.y, s), sc1(c.z, s)); }
MediumCoefficients medium(MediumContext ctx, Inputs i) {
    float s = exp(-i.falloff * (ctx.world_position.y - i.base_height));
    MediumCoefficients m;
    m.scattering = sc3(i.scattering, s);
    m.absorption = sc3(i.absorption, s);
    m.emission = float3(0.0);
    m.anisotropy = i.anisotropy;
    return m;
}
'''

# ---- slab profile, rebuilt from the plate's measured silhouette.
# u -> world x at 60 m: (u - 0.5) * 2 * tan(half_x) * 60 = (u - 0.5) * 43.2 m
# y_img -> world y: (0.799 - y_img) / 0.693 * 12.7 m
# Node sits at x = -0.70, so local x = world x + 0.70. Plate edges give:
#   left  -4.27 m at the base, ~-4.1 m rising, stepping in above 8.4 m
#   right +3.74 m at the base, +2.8 m at mid, +2.1 m at 10.8 m, -1.0 m at the crest
# so the stone is a wedge whose crest ridge lies on the LEFT flank.
SLAB = [[-4.27, 0.00], [-4.14, 1.20], [-4.20, 2.60], [-4.14, 4.00], [-4.10, 5.20],
        [-4.16, 6.40], [-4.06, 7.60], [-4.00, 8.40], [-3.66, 9.00], [-3.72, 9.80],
        [-3.71, 10.60], [-3.52, 11.10], [-3.50, 11.70], [-3.30, 12.10], [-3.27, 12.56],
        [-2.96, 12.74], [-2.30, 12.60], [-1.90, 12.70], [-1.35, 12.40], [-0.98, 12.20],
        [0.57, 12.02], [1.82, 11.44], [2.13, 10.84], [2.40, 10.10], [2.72, 9.20],
        [2.82, 7.80], [2.90, 6.60], [3.22, 6.10], [3.34, 5.20], [3.38, 4.20],
        [3.55, 3.60], [3.68, 2.20], [3.72, 1.00], [3.74, 0.00]]

def buttress(x0, x1, top, lean):
    """A vertical face that stands proud of the slab, so it carries its own
    normal and breaks the silhouette instead of shading flat inside it."""
    return [[x0, 0.0], [x0 + lean * 0.3, top * 0.25], [x0 + lean * 0.6, top * 0.55],
            [x0 + lean * 0.85, top * 0.80], [x0 + lean, top],
            [x0 + (x1 - x0) * 0.55, top * 0.97], [x1 + lean, top * 0.86],
            [x1, top * 0.45], [x1, 0.0]]

STONE_Z = -DIST
Y_UNIT = 2.0 / 6.0   # mm of image per metre at 60 m, kept for the notes

nodes = []
# --- environment: twilight sky + world fog on the single environment light
nodes.append({"type": "light", "name": "sky", "shape": "environment", "energy": 5.0,
              "color": [1, 1, 1], "medium": "mist",
              "material": {"program": "std/sky", "inputs": {
                  "sun_elevation": -0.125, "sun_rotation": 6.40, "altitude": 60.0,
                  "air_density": 1.0, "aerosol_density": 0.35, "ozone_density": 1.0}}})
# --- weak cool key from the left: shapes the slab, rims its left edge
nodes.append({"type": "light", "name": "moonlight", "shape": "sun", "energy": 0.55,
              "color": [0.55, 0.72, 1.0], "angle": 0.009,
              "translation": [-52.0, 34.0, -18.0], "target": [-0.7, 6.0, STONE_Z]})
# --- mirror-flat tidal water
nodes.append({"type": "mesh", "name": "water", "geometry": {"std": "grid", "size": [6000, 6000]},
              "materials": ["water"]})

YAW = 0.10
def stone_node(name, outline, depth, mat, dz=0.0, dz_yaw=YAW, extra=None):
    n = {"type": "mesh", "name": name, "materials": [mat],
         "translation": [-0.70, 0.0, STONE_Z + dz], "rotation": {"euler": [0, dz_yaw, 0]},
         "geometry": {"std": "extrude", "outline": outline, "depth": depth,
                      "bevel_depth": 0.04, "bevel_resolution": 2}}
    return n

nodes.append(stone_node("monolith", SLAB, 2.9, "basalt"))
# proud buttresses on the camera-facing face: distinct normals -> striation
for i, (x0, x1, top, lean, proud) in enumerate([
        (-3.95, -3.30, 11.9, 0.24, 0.30),
        (-2.95, -2.25, 12.2, -0.14, 0.24),
        (-1.80, -1.10, 12.1, 0.10, 0.34),
        (-0.65, 0.05, 11.6, 0.16, 0.26),
        (0.60, 1.45, 9.6, -0.12, 0.30),
        (1.85, 2.70, 6.4, 0.10, 0.22)]):
    nodes.append(stone_node(f"buttress_{i}", buttress(x0, x1, top, lean), 2.9 + 2 * proud,
                            "basalt_rib", dz=proud))
# chipped crest
nodes.append(stone_node("crest_a", [[-3.36, 12.2], [-2.98, 12.86], [-2.10, 12.70],
                                   [-1.45, 12.34], [-2.35, 12.10]], 2.7, "basalt",
                        dz=0.06, dz_yaw=YAW - 0.05))
nodes.append(stone_node("crest_b", [[-0.20, 11.9], [0.60, 11.72], [1.05, 11.10],
                                   [0.20, 11.30]], 2.7, "basalt", dz=0.04, dz_yaw=YAW + 0.05))
# crack lines: thin near-black slabs laid proud of the face
for i, (cx, y0, y1, w) in enumerate([(-2.55, 1.1, 10.4, 0.06), (-1.20, 2.2, 12.2, 0.05),
                                     (0.35, 0.9, 9.0, 0.055), (1.70, 0.6, 6.2, 0.05)]):
    nodes.append(stone_node(f"crack_{i}", [[cx, y0], [cx + 0.10, (y0 + y1) / 2], [cx, y1],
                                          [cx - w, y1], [cx - w - 0.08, (y0 + y1) / 2],
                                          [cx - w, y0]],
                            3.2, "crack", dz=0.62))

# --- lone figure with a lantern, right of the base (as in the plate)
FIG_X, FIG_Z = 1.95, STONE_Z + 2.2
nodes += [
  {"type": "mesh", "name": "figure", "materials": ["figure"],
   "translation": [FIG_X, 0.86, FIG_Z],
   "geometry": {"std": "capsule", "radius": 0.19, "height": 1.72}},
  {"type": "mesh", "name": "head", "materials": ["figure"],
   "translation": [FIG_X, 1.85, FIG_Z],
   "geometry": {"std": "sphere", "radius": 0.115, "segments": 24, "rings": 16}},
  {"type": "mesh", "name": "lantern_glass", "materials": ["lantern"],
   "translation": [FIG_X + 0.23, 1.22, FIG_Z + 0.15],
   "geometry": {"std": "sphere", "radius": 0.075, "segments": 24, "rings": 16}},
  {"type": "light", "name": "lantern_light", "shape": "point", "energy": 6.0,
   "color": [1.0, 0.55, 0.21], "radius": 0.06,
   "translation": [FIG_X + 0.23, 1.22, FIG_Z + 0.15]},
]

# --- crescent moon: explicit arc polygon (an SVG "A" path rendered as a disc
#     in vork 0.6.0, so the outline is sampled here instead)
def arc(cx, r, t0, t1, n=28):
    return [[round(cx + r * math.cos(t0 + (t1 - t0) * i / (n - 1)), 4),
             round(r * math.sin(t0 + (t1 - t0) * i / (n - 1)), 4)] for i in range(n)]

MOON_R = 2.4
INNER = 1.35 * MOON_R                       # bigger radius -> thinner crescent
XC = -math.sqrt(INNER * INNER - MOON_R * MOON_R)
TH0 = math.acos(-XC / INNER)
CRESCENT = [[-x, y] for x, y in
            arc(0.0, MOON_R, math.pi / 2, -math.pi / 2) + arc(XC, INNER, -TH0, TH0)]
mx = (0.2526 - 0.5) * 2 * TAN_X * 500
my = EYE[1] + (0.5 - 0.1686) * 2 * TAN_Y * 500 + math.tan(PITCH) * 500
nodes.append({"type": "mesh", "name": "moon_disc", "materials": ["earthshine"],
              "translation": [round(mx, 2), round(my, 2), -500.6],
              "geometry": {"std": "extrude", "depth": 0.02,
                           "outline": arc(0.0, MOON_R, 0.0, 2 * math.pi, 48)}})
nodes.append({"type": "mesh", "name": "moon", "materials": ["moon"],
              "translation": [round(mx, 2), round(my, 2), -500.0],
              "geometry": {"std": "extrude", "depth": 0.02, "outline": CRESCENT}})

nodes.append({"type": "camera", "name": "cam", "material": "cam",
              "translation": EYE, "target": aim(EYE, PITCH)})

scene = {
 "$schema": "https://raw.githubusercontent.com/voyager-so/vork/v0.6.0/packages/ts/scene.schema.json",
 "version": 2,
 "composition": {"space": "3d", "color_space": "Linear Rec.709",
                 "view": {"program": "std/agx", "inputs": {"exposure": -0.50, "look": "none"}}},
 "programs": {"mist": {"source": MIST}},
 "materials": {
   "cam": {"program": "std/camera", "inputs": {
      "lens": LENS, "sensor_width": SENSOR_W, "sensor_height": round(SENSOR_H, 3),
      "fit": "horizontal", "clip_start": 0.5, "clip_end": 4000.0}},
   "water": {"program": "std/openpbr", "inputs": {
      "base_color": [0.0045, 0.0075, 0.0105], "specular_roughness": 0.06,
      "base_metalness": 0.0, "specular_weight": 1.0}},
   "basalt": {"program": "std/openpbr", "inputs": {
      "base_color": [0.048, 0.047, 0.046], "specular_roughness": 0.63, "base_metalness": 0.0}},
   "basalt_rib": {"program": "std/openpbr", "inputs": {
      "base_color": [0.031, 0.030, 0.030], "specular_roughness": 0.72, "base_metalness": 0.0}},
   "crack": {"program": "std/openpbr", "inputs": {
      "base_color": [0.006, 0.006, 0.007], "specular_roughness": 0.85}},
   "figure": {"program": "std/openpbr", "inputs": {
      "base_color": [0.017, 0.018, 0.020], "specular_roughness": 0.78}},
   "lantern": {"program": "std/openpbr", "inputs": {
      "base_color": [0.0, 0.0, 0.0], "specular_roughness": 0.4,
      "emission_luminance": 9000.0, "emission_color": [1.0, 0.52, 0.15]}},
   "earthshine": {"program": "std/openpbr", "inputs": {
      "base_color": [0.0, 0.0, 0.0],
      "emission_luminance": 3.0, "emission_color": [0.62, 0.68, 0.80]}},
   "moon": {"program": "std/openpbr", "inputs": {
      "base_color": [0.0, 0.0, 0.0],
      "emission_luminance": 2400.0, "emission_color": [1.0, 0.965, 0.92]}},
   "mist": {"program": "mist", "inputs": {
      "scattering": [0.0080, 0.0088, 0.0100], "absorption": [0.0, 0.0, 0.0],
      "base_height": 0.45, "falloff": 0.55, "anisotropy": 0.7}}
 },
 "nodes": nodes,
 "render": {"resolution": RES, "duration": 1, "camera": "cam", "background": "environment"}
}
json.dump(scene, open('shot-01/scene.json', 'w'), indent=1)
open('shot-01/scene.json', 'a').write('\n')
print('shot-01/scene.json:', len(nodes), 'nodes; pitch %.2f deg; moon at (%.1f, %.1f)'
      % (math.degrees(PITCH), mx, my))
