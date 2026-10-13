#!/usr/bin/env python
"""gen_nature.py  -  procedural Voxel-PSX nature set (trees, bushes, rocks, tufts ...).  system Python + numpy + Pillow, run with -I.

  python -I gen_nature.py OUT_DIR [id ...]        -> OUT_DIR/<id>.glb + OUT_DIR/manifest.json

All statics share ONE master palette image (ROWS ramps x 8 shades, NEAREST, RGB555-snapped).  A season / biome swap is therefore a texture swap.
UV of a voxel face = centre of one palette texel (u = (shade + .5) / 8, v = (ramp + .5) / len(ROWS)).  Origin = trunk base (x = z = 0, y = 0 on the ground).
"""
import sys, os, io, json, math, colorsys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxelize_glb import flood_exterior, shifted, DIRS, write_glb, q555

# ------------------------------------------------------------------------------------------------ master palette
def ramp(h, s0, s1, v0, v1, n=8):
    out = []
    for k in range(n):
        t = k / (n - 1)
        r, g, b = colorsys.hsv_to_rgb(((h + 12 * (t - 0.5)) % 360) / 360, s0 + (s1 - s0) * t, v0 + (v1 - v0) * t)
        out.append(tuple(int(x) for x in q555([r * 255, g * 255, b * 255])))
    return out
RAMPS = {
    'bark': ramp(28, .55, .40, .22, .58), 'birch': ramp(45, .10, .04, .45, .95), 'leaf': ramp(112, .70, .55, .18, .78), 'leaf_olive': ramp(78, .65, .50, .20, .72),
    'leaf_pine': ramp(150, .62, .40, .14, .58), 'leaf_spruce': ramp(165, .55, .35, .10, .45), 'leaf_autumn': ramp(24, .85, .65, .35, .95), 'leaf_gold': ramp(46, .80, .60, .40, .98),
    'leaf_frost': ramp(185, .35, .08, .38, .98), 'leaf_dead': ramp(34, .45, .30, .20, .52), 'rock': ramp(30, .10, .04, .20, .82), 'moss': ramp(95, .55, .42, .18, .62),
    'rock_red': ramp(14, .45, .30, .22, .72), 'sand': ramp(40, .40, .22, .45, .92), 'flower_r': ramp(355, .8, .6, .45, 1.0), 'flower_y': ramp(52, .8, .5, .55, 1.0),
    'flower_p': ramp(285, .6, .4, .45, 1.0), 'grass': ramp(100, .62, .45, .25, .85), 'cactus': ramp(135, .55, .40, .22, .66), 'cap_red': ramp(2, .85, .6, .30, .95), 'cap_tan': ramp(35, .45, .3, .45, .9),
}
ROWS = list(RAMPS)
def palette_png(over=None):
    """Master palette PNG (embedded in every nature GLB). `over` replaces single ramps, e.g. WINTER for the season palette."""
    R = RAMPS if not over else {**RAMPS, **over}
    img = np.zeros((len(ROWS), 8, 4), np.uint8); img[..., 3] = 255
    for r, name in enumerate(ROWS):
        for k, c in enumerate(R[name]): img[r, k, :3] = c
    buf = io.BytesIO(); Image.fromarray(img, 'RGBA').save(buf, 'PNG', optimize=True); return buf.getvalue()

# ------------------------------------------------------------------------------------------------ voxel canvas
class Canvas:
    def __init__(self, n=56):
        self.n = n; self.occ = np.zeros((n, n, n), bool); self.ramp = np.zeros((n, n, n), np.int8); self.shade = np.zeros((n, n, n), np.int8)
    def put(self, x, y, z, ramp, shade):
        c = self.n // 2; i, j, k = int(round(x)) + c, int(round(y)), int(round(z)) + c
        if 0 <= i < self.n and 0 <= j < self.n and 0 <= k < self.n:
            self.occ[i, j, k] = True; self.ramp[i, j, k] = ROWS.index(ramp); self.shade[i, j, k] = max(0, min(7, int(shade)))
    def blob(self, cx, cy, cz, rx, ry, rz, ramp, shade_fn, rng, ragged=0.0):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            for y in range(int(cy - ry - 1), int(cy + ry + 2)):
                for z in range(int(cz - rz - 1), int(cz + rz + 2)):
                    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
                    if d <= 1.0 and not (ragged and d > 0.62 and rng.random() < ragged): self.put(x, y, z, ramp, shade_fn(x, y, z, d))
    def line(self, p0, p1, thick, ramp, shade, rng):
        n = int(max(abs(np.subtract(p1, p0)))) * 2 + 1
        for t in np.linspace(0, 1, n):
            p = np.add(p0, np.subtract(p1, p0) * t)
            for dx in range(thick):
                for dz in range(thick): self.put(p[0] + dx, p[1], p[2] + dz, ramp, shade + int(rng.integers(-1, 2)))
    def finish(self):                                     # crown tops one shade lighter
        above = np.zeros_like(self.occ); above[:, :-1] = self.occ[:, 1:]
        top = self.occ & ~above & (self.ramp >= ROWS.index('leaf')) & (self.ramp != ROWS.index('rock'))
        self.shade = np.where(top, np.clip(self.shade + 1, 0, 7), self.shade).astype(np.int8); return self

# ------------------------------------------------------------------------------------------------ species (H = height in voxels)
def oak(rng, H=20, leaf='leaf', trunk='bark'):
    cv = Canvas(); th = int(H * 0.42)
    for y in range(th):
        w = 2 if y < th - 3 else 1
        for dx in range(w + (y < 2)):
            for dz in range(w + (y < 2)): cv.put(-1 + dx, y, -1 + dz, trunk, 2 + ((dx + dz + y) % 3 == 0) + int(rng.integers(0, 2)))
    cy = H * 0.64; R = H * 0.30; sf = lambda x, y, z, d: 3 + int(2.2 * (y - (cy - R)) / (2 * R) + rng.integers(-1, 2) - d)
    cv.blob(0, cy, 0, R, R * .85, R, leaf, sf, rng, .35)
    for _ in range(4):
        a = rng.random() * 6.283; r = R * .62; cv.blob(math.cos(a) * r, cy + rng.uniform(-R * .3, R * .3), math.sin(a) * r, R * .6, R * .5, R * .6, leaf, sf, rng, .35)
    cv.line((0, th - 3, 0), (int(R * .5), int(cy), int(R * .3)), 1, trunk, 2, rng); return cv.finish()

def pine(rng, H=26, leaf='leaf_pine', tiers=7, wide=1.0):
    cv = Canvas(); th = int(H * 0.28)
    for y in range(int(H * .9)):
        for dx in range(2):
            for dz in range(2): cv.put(-1 + dx, y, -1 + dz, 'bark', 1 + (y % 2) + int(rng.integers(0, 2)))
    Rmax = H * 0.27 * wide
    for t in range(tiers):
        y0 = th + t * (H * .9 - th) / tiers; fr = t / (tiers - 1); r = Rmax * (1 - fr) ** .85 + .9
        for y in (0, 1):
            rr = r * (1 - .35 * y)
            for x in range(int(-rr - 1), int(rr + 2)):
                for z in range(int(-rr - 1), int(rr + 2)):
                    d = math.hypot(x + .5, z + .5)
                    if d <= rr and not (d > rr * .7 and rng.random() < .3): cv.put(x, y0 + y + (1 if d < rr * .5 else 0), z, leaf, 2 + int(3 * fr) + y + int(rng.integers(-1, 2)))
    cv.put(0, int(H * .9), 0, leaf, 5); cv.put(-1, int(H * .9), -1, leaf, 4); return cv.finish()

def birch(rng, H=22, leaf='leaf_olive'):
    cv = Canvas(); th = int(H * .55)
    for y in range(th):
        for dx in range(1 + (y < 3)):
            for dz in range(1 + (y < 3)): cv.put(dx, y, dz, 'birch', 5 if rng.random() > .2 else 1)
    cy = H * .72; sf = lambda x, y, z, d: 3 + int(2 * (y - (cy - 5)) / 10 + rng.integers(-1, 2))
    cv.blob(.5, cy, .5, 4.6, 6.2, 4.6, leaf, sf, rng, .38); cv.blob(2.5, cy - 3, 1.5, 3, 3.5, 3, leaf, sf, rng, .38); cv.blob(-2.5, cy - 2, -1.5, 3, 3.5, 3, leaf, sf, rng, .38); return cv.finish()

def dead(rng, H=20, ramp_='leaf_dead'):
    cv = Canvas(); th = int(H * .62)
    for y in range(th):
        w = 2 if y < th * .55 else 1
        for dx in range(w):
            for dz in range(w): cv.put(-1 + dx, y, -1 + dz, ramp_, 1 + int(rng.integers(0, 3)))
    for k in range(6):
        y0 = int(H * (.3 + .1 * k)); a = rng.random() * 6.283; L = int(H * .28 * (1.2 - k * .12))
        p0 = (0, y0, 0); p1 = (math.cos(a) * L, y0 + L * .55, math.sin(a) * L); cv.line(p0, p1, 1, ramp_, 2, rng)
        if L > 4:
            q = np.add(p0, np.subtract(p1, p0) * .6); b = a + rng.uniform(-1, 1); cv.line(q, (q[0] + math.cos(b) * L * .4, q[1] + L * .3, q[2] + math.sin(b) * L * .4), 1, ramp_, 1, rng)
    return cv.finish()

def bush(rng, leaf='leaf', berries=None):
    cv = Canvas(32); sf = lambda x, y, z, d: 2 + int(3 * y / 5 + rng.integers(-1, 2))
    cv.blob(0, 2, 0, 3.6, 2.6, 3.4, leaf, sf, rng, .25); cv.blob(2.6, 1.6, 1.2, 2.4, 1.9, 2.4, leaf, sf, rng, .25); cv.blob(-2, 1.5, -1.6, 2.2, 1.8, 2.2, leaf, sf, rng, .25)
    if berries:
        idx = np.argwhere(cv.occ); sel = idx[rng.random(len(idx)) < .06]
        for i, j, k in sel: cv.ramp[i, j, k] = ROWS.index(berries); cv.shade[i, j, k] = 5
    return cv.finish()

def rock(rng, S=8, ramp_='rock', mossy=True):
    cv = Canvas(40)
    for _ in range(3):
        cx, cz = rng.uniform(-S * .25, S * .25, 2); cy = rng.uniform(S * .15, S * .3); r = rng.uniform(S * .28, S * .45)
        cv.blob(cx, cy, cz, r * 1.2, r * .85, r, ramp_, lambda x, y, z, d: 2 + int(2 * y / S + rng.integers(-1, 3)), rng, 0)
    if mossy:
        top = cv.occ & ~np.pad(cv.occ[:, 1:], ((0, 0), (0, 1), (0, 0))); m = top & (rng.random(cv.occ.shape) < .55)
        cv.ramp[m] = ROWS.index('moss'); cv.shade[m] = rng.integers(2, 6, size=int(m.sum()))
    return cv

def rock_tall(rng, H=14, ramp_='rock_red'):
    cv = Canvas(32)
    for y in range(H):
        r = 2.4 - 1.2 * y / H + rng.uniform(-.3, .3)
        for x in range(-3, 4):
            for z in range(-3, 4):
                if math.hypot(x, z) <= r: cv.put(x, y, z, ramp_, 2 + int(3 * y / H) + int(rng.integers(-1, 2)))
    return cv

def tuft(rng):
    cv = Canvas(16)
    for _ in range(7):
        x, z = int(rng.integers(-2, 3)), int(rng.integers(-2, 3)); h = int(rng.integers(3, 7))
        for y in range(h): cv.put(x, y, z, 'grass', 2 + int(3 * y / h) + int(rng.integers(0, 2)))
    return cv

def flowers(rng, ramp_='flower_r'):
    cv = Canvas(16)
    for _ in range(5):
        x, z = int(rng.integers(-2, 3)), int(rng.integers(-2, 3)); h = int(rng.integers(3, 6))
        for y in range(h): cv.put(x, y, z, 'grass', 3)
        cv.put(x, h, z, ramp_, 5)
    return cv

def mushroom(rng, cap='cap_red'):
    cv = Canvas(16)
    for (x, z, h, r) in [(0, 0, 4, 3), (3, 2, 3, 2), (-3, 1, 2, 2)]:
        for y in range(h): cv.put(x, y, z, 'birch', 4)
        for dx in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if math.hypot(dx, dz) <= r + .3: cv.put(x + dx, h, z + dz, cap, 4 + int(rng.integers(-1, 2)))
        cv.put(x, h + 1, z, cap, 5)
    return cv

def cactus(rng, H=14):
    cv = Canvas(24)
    for y in range(H):
        for dx in range(2):
            for dz in range(2): cv.put(dx, y, dz, 'cactus', 3 + (y % 3 == 0))
    for side, y0 in ((-1, int(H * .45)), (1, int(H * .6))):
        for k in range(3): cv.put(side * (2 + k) + (0 if side > 0 else 0), y0, 0, 'cactus', 3)
        for y in range(y0, y0 + 4 + int(rng.integers(0, 3))): cv.put(side * 4, y, 0, 'cactus', 4)
    return cv

def log(rng, L=14):
    cv = Canvas(24)
    for x in range(-L // 2, L // 2):
        for (y, z) in [(0, 0), (0, 1), (1, 0), (1, 1), (0, -1), (1, -1)]: cv.put(x, y, z, 'bark', 2 + int(rng.integers(0, 2)))
    return cv

# ------------------------------------------------------------------------------------------------ WP5 builders (appended; ids after 'log' keep their seeds)
def tree_at(cv, rng, H, ox, oz, leaf='leaf', trunk='bark', blobs=4):
    """One broadleaf tree drawn into an existing canvas at (ox, oz): used by groves and the swamp tree. Returns (crown centre y, crown radius)."""
    th = int(H * 0.42)
    for y in range(th):
        w = 2 if y < th - 3 else 1
        for dx in range(w + (y < 2)):
            for dz in range(w + (y < 2)): cv.put(ox - 1 + dx, y, oz - 1 + dz, trunk, 2 + ((dx + dz + y) % 3 == 0) + int(rng.integers(0, 2)))
    cy = H * 0.64; R = H * 0.30; sf = lambda x, y, z, d: 3 + int(2.2 * (y - (cy - R)) / (2 * R) + rng.integers(-1, 2) - d)
    cv.blob(ox, cy, oz, R, R * .85, R, leaf, sf, rng, .35)
    for _ in range(blobs):
        a = rng.random() * 6.283; r = R * .62
        cv.blob(ox + math.cos(a) * r, cy + rng.uniform(-R * .3, R * .3), oz + math.sin(a) * r, R * .6, R * .5, R * .6, leaf, sf, rng, .35)
    return cy, R

def grove(rng, H=10, n=5, spread=3.0, leaf='leaf'):
    """n broadleaf trees on one footprint (replaces the hex trees_A / trees_B clusters; overlapping crowns share faces)."""
    cv = Canvas(64)
    for _ in range(n):
        a = rng.random() * 6.283; r = spread * math.sqrt(rng.random())
        tree_at(cv, rng, H * rng.uniform(.7, 1.0), r * math.cos(a), r * math.sin(a), leaf, blobs=3)
    return cv.finish()

def swamp(rng, H=21, leaf='leaf_pine'):
    """Tall dark conifer-green crown with moss strands hanging from the rim."""
    cv = Canvas(56); cy, R = tree_at(cv, rng, H, 0, 0, leaf, blobs=3)
    for _ in range(9):
        a = rng.random() * 6.283; r = R * rng.uniform(.6, 1.0); x, z = math.cos(a) * r, math.sin(a) * r
        top = cy - R * .4 + rng.uniform(-1, 1); L = int(H * rng.uniform(.25, .4))
        for y in range(L): cv.put(x, top - y, z, 'moss', 2 + int(rng.integers(0, 3)))
    return cv.finish()

def stump(rng, H=5, R=2.4):
    """Cut trunk: bark sides, light ring top."""
    cv = Canvas(24)
    for y in range(H):
        for x in range(-3, 4):
            for z in range(-3, 4):
                d = math.hypot(x, z)
                if d <= R + .3 * (rng.random() - .5) and (y < H - 1 or d <= R - 1):
                    top = y == H - 1
                    cv.put(x, y, z, 'birch' if top else 'bark', 5 if top else 2 + int(rng.integers(0, 2)))
    return cv

def reeds(rng, n=7):
    """Swamp reed cluster: olive stalks with brown seed heads."""
    cv = Canvas(24)
    for _ in range(n):
        x, z = int(rng.integers(-2, 3)), int(rng.integers(-2, 3)); h = int(rng.integers(9, 15))
        for y in range(h): cv.put(x, y, z, 'leaf_olive', 2 + int(3 * y / h) + int(rng.integers(0, 2)))
        cv.put(x, h, z, 'sand', 3); cv.put(x, h + 1, z, 'sand', 3)
    return cv.finish()

def lily(rng, R=3):
    """Water-lily pad: a flat disc with a notched rim and one bloom."""
    cv = Canvas(16)
    for x in range(-R, R + 1):
        for z in range(-R, R + 1):
            d = math.hypot(x, z)
            if d <= R and not (d > R - .8 and rng.random() < .35): cv.put(x, 0, z, 'leaf', 3 + int(rng.integers(0, 3)))
    cv.put(0, 1, 0, 'flower_p', 5)
    return cv

def cliff(rng, W=10, H=9, D=10, kind='block', ramp_='rock'):
    """Kenney-style cliff block (kind block / corner / slope): ragged top edge, moss on the exposed top."""
    cv = Canvas(40)
    for x in range(-(W // 2), W - W // 2):
        for z in range(-(D // 2), D - D // 2):
            if kind == 'corner' and x > 0 and z > 0: continue
            hh = H * (x + W / 2 + 1) / (W + 1) if kind == 'slope' else H
            top = int(round(hh - (rng.random() < .3)))
            for y in range(max(top, 1)): cv.put(x, y, z, ramp_, 2 + int(3 * y / H) + int(rng.integers(-1, 2)))
    top = cv.occ & ~np.pad(cv.occ[:, 1:], ((0, 0), (0, 1), (0, 0)))
    m = top & (rng.random(cv.occ.shape) < .5)
    cv.ramp[m] = ROWS.index('moss'); cv.shade[m] = rng.integers(2, 6, size=int(m.sum()))
    return cv

def massif(rng, H=30, R=14, steps=3, ramp_='rock'):
    """Stepped hill / mountain (30-60 m at cell 1 m): concentric terraces that shrink with height, conifer-clad summit."""
    cv = Canvas(72)
    for y in range(H):
        lvl = int(steps * y / H) / steps
        r = R * (1 - .85 * lvl ** 1.3) * (1 + .06 * math.sin(.9 * y))
        for x in range(-int(r) - 2, int(r) + 3):
            for z in range(-int(r) - 2, int(r) + 3):
                d = math.hypot(x, z) / max(r, 1)
                if d <= 1 and not (d > .8 and rng.random() < .3): cv.put(x, y, z, ramp_, 2 + int(3 * y / H) + int(rng.integers(-1, 2)))
    top = cv.occ & ~np.pad(cv.occ[:, 1:], ((0, 0), (0, 1), (0, 0)))
    m = top & (rng.random(cv.occ.shape) < .45)
    cv.ramp[m] = ROWS.index('leaf_pine'); cv.shade[m] = rng.integers(2, 5, size=int(m.sum()))
    return cv

# ------------------------------------------------------------------------------------------------ canonical set: id -> (builder, kwargs, cell metres)
def S(fn, cell, **kw): return (fn, kw, cell)
SET = {
    # broadleaf  (M = 5.5-6.5 m for the old gen/props trees, L = 7.5-9.5 m for the retro tree packs)
    'tree_oak_m1': S(oak, .35, H=17), 'tree_oak_m2': S(oak, .35, H=18), 'tree_oak_l1': S(oak, .40, H=19), 'tree_oak_l2': S(oak, .40, H=21), 'tree_oak_l3': S(oak, .40, H=23),
    'tree_birch_m1': S(birch, .35, H=18), 'tree_birch_l1': S(birch, .40, H=21),
    'tree_olive_l1': S(oak, .40, H=20, leaf='leaf_olive'),
    # conifers
    'tree_pine_m1': S(pine, .32, H=19), 'tree_pine_m2': S(pine, .32, H=17, tiers=6), 'tree_pine_l1': S(pine, .35, H=24), 'tree_pine_l2': S(pine, .35, H=26, tiers=8), 'tree_pine_l3': S(pine, .35, H=22, wide=1.25),
    'tree_spruce_l1': S(pine, .35, H=25, leaf='leaf_spruce'), 'tree_spruce_l2': S(pine, .35, H=23, leaf='leaf_spruce', tiers=8, wide=.85),
    # seasons / biomes
    'tree_autumn_m1': S(oak, .35, H=17, leaf='leaf_autumn'), 'tree_autumn_l1': S(oak, .40, H=20, leaf='leaf_autumn'), 'tree_autumn_l2': S(oak, .40, H=22, leaf='leaf_gold'),
    'tree_frost_l1': S(pine, .35, H=24, leaf='leaf_frost'), 'tree_frost_l2': S(pine, .35, H=22, leaf='leaf_frost', wide=1.15),
    'tree_dead_m1': S(dead, .35, H=16), 'tree_dead_l1': S(dead, .40, H=20), 'tree_dead_l2': S(dead, .40, H=22), 'tree_dead_frost_l1': S(dead, .40, H=20, ramp_='leaf_frost'),
    # undergrowth / rocks / small things
    'bush_1': S(bush, .16), 'bush_2': S(bush, .16, leaf='leaf_olive'), 'bush_berry': S(bush, .16, berries='flower_r'), 'bush_autumn': S(bush, .16, leaf='leaf_autumn'), 'bush_frost': S(bush, .16, leaf='leaf_frost'),
    'cactus_tall': S(cactus, .22, H=14), 'cactus_short': S(cactus, .2, H=8),
    'rock_s1': S(rock, .10, S=7), 'rock_s2': S(rock, .10, S=8, mossy=False), 'rock_m1': S(rock, .18, S=8), 'rock_m2': S(rock, .18, S=9, mossy=False), 'rock_l1': S(rock, .28, S=12), 'rock_l2': S(rock, .28, S=14, mossy=False),
    'rock_xl1': S(rock, .45, S=14), 'rock_tall_1': S(rock_tall, .30, H=12), 'rock_tall_2': S(rock_tall, .30, H=15), 'rock_tall_3': S(rock_tall, .30, H=10, ramp_='rock'),
    'tuft': S(tuft, .09), 'flowers_r': S(flowers, .1, ramp_='flower_r'), 'flowers_y': S(flowers, .1, ramp_='flower_y'), 'flowers_p': S(flowers, .1, ramp_='flower_p'),
    'mushroom_red': S(mushroom, .1), 'mushroom_tan': S(mushroom, .1, cap='cap_tan'), 'log': S(log, .12, L=14),
    # ---- WP5 (ART_VOXEL_PSX.md 2.2, appended so the ids above keep their seeds) ----
    'stump': S(stump, .12, H=5), 'reeds': S(reeds, .08), 'lily': S(lily, .1),
    'tree_swamp_l1': S(swamp, .40, H=21),
    'grove_a_s': S(grove, .45, n=3, H=9, spread=2.5), 'grove_a_m': S(grove, .45, n=5, H=10, spread=3.0), 'grove_a_l': S(grove, .45, n=8, H=11, spread=3.8),
    'grove_b_s': S(grove, .45, n=3, H=9, spread=2.5, leaf='leaf_olive'), 'grove_b_m': S(grove, .45, n=5, H=10, spread=3.0, leaf='leaf_olive'), 'grove_b_l': S(grove, .45, n=8, H=11, spread=3.8, leaf='leaf_olive'),
    'cliff_block': S(cliff, .45, W=10, H=9, D=10, kind='block'), 'cliff_half': S(cliff, .45, W=10, H=5, D=10, kind='block'),
    'cliff_corner': S(cliff, .45, W=10, H=9, D=10, kind='corner'), 'cliff_slope': S(cliff, .45, W=12, H=9, D=10, kind='slope'),
    'massif_1': S(massif, 2.5, H=12, R=6, steps=3), 'massif_2': S(massif, 2.5, H=15, R=7, steps=4),
    'massif_3': S(massif, 3.0, H=16, R=7, steps=4), 'massif_4': S(massif, 3.0, H=19, R=7, steps=5),
}

# Winter master palette: same layout (8 shades x 24 rows), foliage and grass pushed toward snow. Season swap = this PNG.
WINTER = {'leaf': ramp(200, .20, .05, .55, .98), 'leaf_olive': ramp(200, .18, .04, .50, .95), 'leaf_pine': ramp(150, .30, .18, .25, .62),
          'leaf_spruce': ramp(170, .28, .15, .22, .55), 'grass': ramp(90, .25, .14, .45, .90), 'moss': ramp(100, .30, .18, .40, .80)}

def export(cv, cell, path, name):
    occ = cv.occ; n = cv.n
    solid = ~flood_exterior(np.pad(occ, 1))[1:-1, 1:-1, 1:-1]
    pos = []; uv = []; idx = []; nq = 0
    for d in DIRS:
        a = [k for k in range(3) if d[k]][0]; s = d[a]; u_ax, v_ax = (a + 1) % 3, (a + 2) % 3
        order = [(-1, -1), (1, -1), (1, 1), (-1, 1)] if s > 0 else [(-1, -1), (-1, 1), (1, 1), (1, -1)]
        for ijk in np.argwhere(solid & ~shifted(solid, d)):
            if not occ[tuple(ijk)]: continue
            ctr = (ijk - np.array([n // 2, 0, n // 2]) + .5) * cell
            for su, sv in order:
                q = ctr.copy(); q[a] += s * cell / 2; q[u_ax] += su * cell / 2; q[v_ax] += sv * cell / 2; pos.append(q)
            uv += [((cv.shade[tuple(ijk)] + .5) / 8, (cv.ramp[tuple(ijk)] + .5) / len(ROWS))] * 4
            idx += [nq * 4, nq * 4 + 1, nq * 4 + 2, nq * 4, nq * 4 + 2, nq * 4 + 3]; nq += 1
    pos = np.array(pos, np.float32); uv = np.array(uv, np.float32); idx = np.array(idx, np.uint16 if len(pos) < 65535 else np.uint32)
    buf = bytearray(); bvs = []; accs = []
    def blob(data, target=None):
        while len(buf) % 4: buf.append(0)
        bvs.append(dict(buffer=0, byteOffset=len(buf), byteLength=len(data), **({'target': target} if target else {}))); buf.extend(data); return len(bvs) - 1
    def acc(a, ct, typ, target, mm=False):
        d = dict(bufferView=blob(np.ascontiguousarray(a).tobytes(), target), componentType=ct, count=int(a.shape[0]), type=typ)
        if mm: d['min'] = a.min(0).astype(float).tolist(); d['max'] = a.max(0).astype(float).tolist()
        accs.append(d); return len(accs) - 1
    ap = acc(pos, 5126, 'VEC3', 34962, True); au = acc(uv, 5126, 'VEC2', 34962); ai = acc(idx.reshape(-1, 1), 5123 if idx.dtype == np.uint16 else 5125, 'SCALAR', 34963); img = blob(palette_png())
    js = dict(asset=dict(version='2.0', generator='gen_nature'), scene=0, scenes=[dict(nodes=[0])], nodes=[dict(name=name, mesh=0)],
              meshes=[dict(name=name, primitives=[dict(attributes=dict(POSITION=ap, TEXCOORD_0=au), indices=ai, material=0, mode=4)])],
              materials=[dict(name='voxel_master', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0.0, roughnessFactor=1.0))],
              textures=[dict(sampler=0, source=0)], samplers=[dict(magFilter=9728, minFilter=9728, wrapS=33071, wrapT=33071)], images=[dict(bufferView=img, mimeType='image/png')],
              accessors=accs, bufferViews=bvs, buffers=[dict(byteLength=len(buf))])
    write_glb(path, js, bytes(buf))
    return nq * 2, (pos.min(0) * 1).tolist(), pos.max(0).tolist()

def generate(out, ids=None, scale=1.0, write_manifest=True, quiet=False):
    """Writes OUT/<id>.glb for each id (default: the whole SET). `scale` multiplies every voxel edge: same grid, same
    triangles, a uniformly bigger or smaller model (build_replace.py uses it for pack-native variants). Returns {id: info}."""
    os.makedirs(out, exist_ok=True); man = {}
    for name in ids or list(SET):
        fn, kw, cell = SET[name]; rng = np.random.default_rng(1000 + list(SET).index(name) * 7919 + sum(map(ord, name)))   # position in SET, not in argv: single-id runs equal full runs
        cell = cell * scale
        cv = fn(rng, **kw); tris, mn, mx = export(cv, cell, os.path.join(out, name + '.glb'), name)
        man[name] = dict(tris=tris, size=[round(mx[0] - mn[0], 2), round(mx[1], 2), round(mx[2] - mn[2], 2)], cell=round(cell, 5))
        if not quiet: print(name, man[name])
    if write_manifest: json.dump(man, open(os.path.join(out, 'manifest.json'), 'w'), indent=1)
    return man

if __name__ == '__main__':
    out = sys.argv[1]; ids = sys.argv[2:] or None
    generate(out, ids)
    if ids is None:                                       # full run also writes the two master palettes (season swap = texture swap)
        open(os.path.join(out, 'voxel_master.png'), 'wb').write(palette_png())
        open(os.path.join(out, 'voxel_master_winter.png'), 'wb').write(palette_png(WINTER))
