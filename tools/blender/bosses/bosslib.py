"""Shared helpers for the EFSUN ONLINE boss generators (headless Blender 5.2).

Run a generator like:
  blender --background --factory-startup --python tools/blender/bosses/gen_bosses.py -- <out_dir> [boss_id ...]

Pieces
  * Atlas / paint(): tiny numpy pixel-art painters (dithered colour ramps, dark edge
    outlines, painted highlights) packed into one 128x128 base atlas + one emission atlas.
  * Builder: low-poly primitive builder (box, lathe, sphere, tube, cone, custom mesh).
    Every primitive writes its own UVs into its atlas tile and carries skin weights
    (rigid per part or per ring). Closed parts are auto-oriented (outward normals).
  * Rig: every bone points +Z with roll 0, so all rest rotations are identity and pose
    rotations can be authored in WORLD axes:  (X, Y, Z) degrees where
      +X = pitch, top tips forward (-Y) / hanging limb swings backward,
      +Y = roll, top tips to the character's LEFT (+X); hanging limb swings to -X,
      +Z = yaw, face turns to the character's left.
    Model faces -Y (= +Z forward in glTF), character's left is +X.
  * Actions: quaternion Bezier keys on every bone in every action -> exported as glTF
    CUBICSPLINE samplers (all actions as separate animations, tiny files).
"""
import bpy
import math
import os
import sys
import json
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

TAU = math.tau


def script_args():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []


def reset_scene(fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = fps
    sc.render.fps_base = 1.0
    return sc


# ----------------------------------------------------------------------------
# Pixel-art texture painting
# ----------------------------------------------------------------------------
_BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) + 0.5) / 16.0 - 0.5


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def ramp(*stops, n=None):
    cols = [hexrgb(s) if isinstance(s, str) else np.array(s, float) for s in stops]
    if n is None or n == len(cols):
        return np.array(cols)
    out = []
    for i in range(n):
        t = i / (n - 1) * (len(cols) - 1)
        k = min(int(t), len(cols) - 2)
        f = t - k
        out.append(cols[k] * (1 - f) + cols[k + 1] * f)
    return np.array(out)


def _bayer(h, w):
    return np.tile(_BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]


def quantize(val, rmp, dither=0.9):
    n = len(rmp)
    h, w = val.shape
    t = np.clip(val, 0, 1) * (n - 1) + _bayer(h, w) * dither
    idx = np.clip(np.round(t), 0, n - 1).astype(int)
    return rmp[idx], idx


def vnoise(h, w, cy, cx, rng):
    gh, gw = int(math.ceil(h / cy)) + 2, int(math.ceil(w / cx)) + 2
    g = rng.random((gh, gw))
    ys, xs = np.arange(h) / cy, np.arange(w) / cx
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = (fy * fy * (3 - 2 * fy))[:, None], (fx * fx * (3 - 2 * fx))[None, :]
    a, b = g[y0][:, x0], g[y0][:, x0 + 1]
    c, d = g[y0 + 1][:, x0], g[y0 + 1][:, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(h, w, rng, cells=(8, 4, 2), amps=(0.5, 0.3, 0.2), stretch=(1, 1)):
    return sum(a * vnoise(h, w, c * stretch[0], c * stretch[1], rng) for c, a in zip(cells, amps)) / sum(amps)


def voronoi(h, w, n, rng, sy=1.0, full=False):
    pts = rng.random((n, 2)) * [h, w]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    ds = []
    for py, px in pts:
        dy, dx = np.abs(yy - py), np.abs(xx - px)
        dy, dx = np.minimum(dy, h - dy) / sy, np.minimum(dx, w - dx)
        ds.append(np.sqrt(dy * dy + dx * dx))
    ds = np.array(ds)
    order = np.argsort(ds, axis=0)
    d1 = np.take_along_axis(ds, order[0:1], 0)[0]
    d2 = np.take_along_axis(ds, order[1:2], 0)[0]
    if full:
        return d1, d2, order[0], order[1]
    return d1, d2, order[0]


def _walk_lines(val, rng, count, length, value, down=0.7):
    h, w = val.shape
    for _ in range(count):
        y, x = int(rng.integers(0, h)), int(rng.integers(0, w))
        for _ in range(int(rng.integers(length // 2, length + 1))):
            val[y % h, x % w] = value
            if rng.random() < down:
                y -= 1
            x += int(rng.integers(-1, 2))


def paint(kind, w, h, rmp, seed=0, emit=None, outline='tb', dither=0.9, grad=0.2, **o):
    """Return (base_rgb[h,w,3], emit_rgb[h,w,3]); row 0 = bottom (= UV v 0).
    emit: None | 'base' (whole tile glows with its own colours) | '#hex' (masked glow colour)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    Y, X = (yy + 0.5) / h, (xx + 0.5) / w
    n = fbm(h, w, rng)
    E = np.zeros((h, w))            # emission mask
    over = {}                       # forced ramp index per pixel (painted details)
    val = 0.5 + 0.25 * (n - 0.5)
    if kind == 'flat':
        val = o.get('level', 0.55) + 0.18 * (n - 0.5)
    elif kind == 'cloth':
        folds = o.get('folds', 3)
        val = 0.52 + 0.2 * np.sin(TAU * (X * folds + 0.3 * n)) + 0.22 * (n - 0.5)
        if o.get('rags'):
            jag = (np.sin(X * TAU * 7 + rng.random() * 6) * 0.5 + 0.5) * 0.12 + 0.03
            val = np.where(Y < jag, 0.0, val)
    elif kind == 'bone':
        val = 0.66 + 0.3 * (n - 0.5)
        _walk_lines(val, rng, o.get('cracks', 3), h // 2, 0.12)
    elif kind == 'skull':
        val = 0.68 + 0.25 * (n - 0.5)
        ex, ey, er = o.get('eye', (0.19, 0.55, 0.13))
        d = np.sqrt(((X - ex) / er) ** 2 + ((Y - ey) / (er * 0.85)) ** 2)
        val = np.where(d < 1.0, 0.0, np.where(d < 1.35, val - 0.25, val))
        nose = (X < 0.07) & (Y > 0.33) & (Y < 0.45) & (X < (0.45 - Y) * 0.8 + 0.02)
        val = np.where(nose, 0.0, val)
        teeth = (Y > 0.16) & (Y < 0.28) & (X < 0.32)
        val = np.where(teeth & ((xx % 3) == 0), 0.15, np.where(teeth, 0.95, val))
    elif kind == 'ribs':
        nr = o.get('ribs', 5)
        rib = np.sin(TAU * (Y * nr + 0.25)) > -0.1 + 0.6 * np.abs(X - 0.5)
        val = np.where(rib, 0.72 + 0.25 * (n - 0.5) + 0.15 * np.sin(TAU * Y * nr), 0.04)
        val = np.where(np.abs(X - 0.5) < 0.09, 0.8 + 0.15 * (n - 0.5), val)
    elif kind in ('metal', 'gold'):
        val = 0.42 + 0.18 * (n - 0.5) + 0.42 * np.exp(-((Y - o.get('hi', 0.72)) / 0.09) ** 2)
        val += 0.1 * np.exp(-((Y - 0.3) / 0.05) ** 2)
        _walk_lines(val, rng, o.get('scratches', 2), h // 3, 0.95, down=0.3)
        if o.get('rivets'):
            for ry in (int(h * 0.15), int(h * 0.85)):
                for rx in range(3, w, max(6, w // 5)):
                    val[ry, rx] = 1.0
                    val[max(ry - 1, 0), min(rx + 1, w - 1)] = 0.0
    elif kind == 'trim':
        band = np.abs(Y - 0.5) < 0.32
        zig = np.abs(((X * o.get('zig', 6)) % 1.0) - 0.5) * 0.5 + 0.25
        diamond = np.abs(Y - 0.5) < (zig - 0.25) * 1.2
        val = np.where(band, 0.62 + 0.2 * (n - 0.5) + 0.3 * np.exp(-((Y - 0.7) / 0.08) ** 2), 0.08)
        val = np.where(diamond & band, 0.25, val)
    elif kind in ('rock', 'lava'):
        d1, d2, idx, idx2 = voronoi(h, w, o.get('cells', 9), rng, sy=o.get('sy', 1.0), full=True)
        cell = (np.sin(idx * 12.9898) * 43758.5453) % 1.0
        val = 0.32 + 0.36 * cell + 0.2 * (n - 0.5)
        c = o.get('crack', 1.6)
        crack = (d2 - d1) < c
        hl = ((d2 - d1) >= c) & ((d2 - d1) < c + 1.2)
        val = np.where(hl, val + 0.2, val)
        val = np.where(crack, 0.0, val)
        if kind == 'lava':
            # only some cell borders carry lava (pair hash), the rest are dark cracks
            pair = (np.minimum(idx, idx2) * 31 + np.maximum(idx, idx2)).astype(float)
            live = ((np.sin(pair * 7.13) * 43758.5453) % 1.0) < o.get('glow', 1.0)
            E = np.where(crack & live, 0.55, 0.0)
            E = np.where(((d2 - d1) < c * 0.5) & live, 1.0, E)
    elif kind == 'ice':
        d1, d2, idx = voronoi(h, w, o.get('cells', 7), rng)
        cell = (np.sin(idx * 78.233) * 43758.5453) % 1.0
        streak = ((X + Y * 0.6) * 5 + 0.4 * n) % 1.0
        val = 0.45 + 0.3 * cell + 0.12 * (streak < 0.12)
        val = np.where((d2 - d1) < 1.1, 0.95, val)
        sp = rng.random((h, w)) > 0.985
        val = np.where(sp, 1.0, val)
    elif kind == 'scales':
        rows = o.get('rows', 6)
        sh = h / rows
        r = np.floor(yy / sh)
        sw = sh * 1.3
        off = (r % 2) * sw * 0.5
        cx = ((xx + off) % sw) / sw - 0.5
        cy = (yy % sh) / sh
        dist = np.sqrt((cx * 1.2) ** 2 + (1.0 - cy) ** 2 * 0.9)
        val = 0.72 - 0.45 * dist + 0.15 * (n - 0.5)
        val = np.where(dist > 0.62, o.get('edge', 0.05), val)
        val = np.where((dist < 0.22) & (cy > 0.6), 0.92, val)
        if o.get('belly_ramp') is not None:
            # wrap-mapped tubes: u -> 1 is the underside; paint belly plates there with a second ramp
            pl = o.get('plates', 7)
            f = (Y * pl) % 1.0
            bv = 0.45 + 0.42 * f + 0.12 * (n - 0.5)
            bv = np.where(f < 0.16, 0.05, bv)
            bcol, _ = quantize(bv + grad * (Y - 0.5), o['belly_ramp'], dither)
            over['belly'] = (X > o.get('belly_from', 0.68), bcol)
    elif kind == 'belly':
        pl = o.get('plates', 6)
        f = (Y * pl) % 1.0
        val = 0.45 + 0.4 * f + 0.15 * (n - 0.5) - 0.2 * np.abs(X - 0.5)
        val = np.where(f < 0.14, 0.04, val)
    elif kind == 'skin':
        val = 0.55 + 0.4 * (n - 0.5)
        if o.get('veins'):
            _walk_lines(val, rng, o['veins'], h // 2, 0.15)
    elif kind == 'fur':
        sn = vnoise(h, w, 9, 1.5, rng)
        val = 0.3 + 0.6 * sn + 0.15 * (n - 0.5)
        val = np.where((sn > 0.72) & (rng.random((h, w)) > 0.5), 0.98, val)
    elif kind == 'wood':
        sn = vnoise(h, w, 16, 3, rng)
        val = 0.5 + 0.22 * np.sin(TAU * (X * 4 + 1.8 * sn)) + 0.12 * (n - 0.5)
        _walk_lines(val, rng, 2, h, 0.05, down=1.0)
    elif kind == 'gem':
        ang = np.arctan2(Y - 0.5, X - 0.5)
        sector = np.floor((ang + math.pi) / (TAU / 6))
        rad = np.sqrt((X - 0.5) ** 2 + (Y - 0.5) ** 2)
        val = 0.4 + 0.12 * (sector % 3) + 0.5 * np.clip(0.5 - rad, 0, 1) * 1.6
        val = np.where((X - 0.3) ** 2 + (Y - 0.72) ** 2 < 0.012, 1.0, val)
        E = np.ones((h, w))
    elif kind == 'glow':
        rad = np.sqrt((X - 0.5) ** 2 + (Y - 0.5) ** 2)
        val = 1.0 - rad * 1.3 + 0.1 * (n - 0.5)
        E = np.ones((h, w))
    elif kind == 'spots':
        val = 0.5 + 0.2 * (n - 0.5) + 0.25 * (Y - 0.5)
        S = np.zeros((h, w), bool)
        rings = np.zeros((h, w), bool)
        for _ in range(o.get('spots', 9)):
            cy, cx = rng.random() * h, rng.random() * w
            rr = rng.uniform(o.get('rmin', 2.0), o.get('rmax', 4.2))
            dy = np.abs(yy - cy)
            dx = np.minimum(np.abs(xx - cx), w - np.abs(xx - cx))
            d = np.sqrt(dx * dx + dy * dy)
            S |= d < rr
            rings |= (d >= rr) & (d < rr + 1.0)
        val = np.where(rings & ~S, 0.12, val)
        over['spot'] = S
        if emit is not None and emit != 'base':
            E = np.where(S, 1.0, 0.0)
    elif kind == 'gills':
        val = 0.55 + 0.35 * (np.sin(TAU * X * o.get('lines', 10)) > 0.3) - 0.25 * (1 - Y) + 0.1 * (n - 0.5)
    elif kind == 'void':
        val = 0.08 + 0.12 * n
    elif kind == 'runes':
        val = 0.42 + 0.2 * np.sin(TAU * (X * 2 + 0.3 * n)) + 0.2 * (n - 0.5)
        R = np.zeros((h, w), bool)
        gy0 = o.get('row', 0.5)
        for gx in np.arange(0.1, 0.95, 0.22):
            px, py = int(gx * w), int(gy0 * h)
            gl = rng.integers(0, 2, (5, 3)).astype(bool)
            gl[:, 1] |= rng.random() > 0.4
            for j in range(5):
                for i in range(3):
                    if gl[j, i]:
                        R[min(max(py + 2 - j, 0), h - 1), min(px + i, w - 1)] = True
        if o.get('column'):
            R |= (np.abs(X - 0.5) < 0.04) & (((yy // 2) % 3) != 0)
        over['rune'] = R
        E = np.where(R, 1.0, 0.0)
    elif kind == 'flesh':
        val = 0.25 + 0.5 * Y + 0.15 * (n - 0.5)
        if emit is not None:
            E = np.clip((Y - 0.15) * 1.4, 0, 1)
    elif kind == 'teeth':
        val = np.where((xx % 4) == 0, 0.2, 0.85 + 0.1 * (n - 0.5))
    elif kind == 'membrane':
        val = 0.45 + 0.15 * (n - 0.5) + 0.25 * Y
        for k in range(o.get('veins', 4)):
            vx = (k + 0.5) / o.get('veins', 4)
            val = np.where(np.abs(X - (vx + (1 - Y) * 0.15 * (vx - 0.5))) < 0.035, 0.12, val)
    elif kind == 'horn':
        val = 0.25 + 0.6 * Y + 0.12 * np.sin(TAU * Y * o.get('rings', 6)) + 0.1 * (n - 0.5)
    elif kind == 'crystal':
        d1, d2, idx = voronoi(h, w, o.get('cells', 5), rng)
        cell = (np.sin(idx * 45.1) * 43758.5453) % 1.0
        val = 0.35 + 0.45 * cell + 0.25 * Y
        val = np.where((d2 - d1) < 1.0, 1.0, val)
        if emit is not None:
            E = np.clip(0.35 + 0.65 * (val - 0.3), 0, 1)
    else:
        raise ValueError('unknown paint kind ' + kind)

    val = val + grad * (Y - 0.5)
    base, idx = quantize(val, rmp, dither)
    if 'spot' in over:
        spot_col = hexrgb(o.get('spot_color', '#f2ead8'))
        base = np.where(over['spot'][..., None], spot_col, base)
        base = np.where((over['spot'] & (np.roll(over['spot'], -1, 0) == False))[..., None], spot_col * 0.82, base)
    if 'belly' in over:
        m, bcol = over['belly']
        base = np.where(m[..., None], bcol, base)
        edge = m & ~np.roll(m, 1, 1)
        base = np.where(edge[..., None], rmp[0], base)
    if 'rune' in over:
        base = np.where(over['rune'][..., None], hexrgb(o.get('rune_color', '#9dff8a')), base)
    dark = rmp[0]
    if outline:
        if 't' in outline:
            base[h - 1, :] = dark
        if 'b' in outline:
            base[0, :] = dark
        if 'l' in outline:
            base[:, 0] = dark
        if 'r' in outline:
            base[:, w - 1] = dark
    if emit is None:
        em = np.zeros((h, w, 3))
    elif emit == 'base':
        em = base * np.clip(E, 0, 1.0)[..., None] if E.any() else base.copy()
    else:
        col = hexrgb(emit)
        em = np.clip(col[None, None, :] * E[..., None], 0, 1)
        base = np.where((E > 0)[..., None], np.clip(col * 0.7 + 0.3 * np.clip(E, 0, 1.25)[..., None] - 0.05, 0, 1), base)
    return np.clip(base, 0, 1), np.clip(em, 0, 1)


class Atlas:
    """Shelf-packed atlas of tiles (tile unit = `tile` px)."""

    def __init__(self, size=128, tile=32):
        self.size, self.tile = size, tile
        self.base = np.zeros((size, size, 3))
        self.emit = np.zeros((size, size, 3))
        self.rects = {}
        self.grid = np.zeros((size // tile, size // tile), bool)   # [row from top, col]
        self.emissive = set()

    def _alloc(self, tw, th):
        G = self.grid
        rows, cols = G.shape
        for r in range(rows - th + 1):
            for c in range(cols - tw + 1):
                if not G[r:r + th, c:c + tw].any():
                    G[r:r + th, c:c + tw] = True
                    return r, c
        raise RuntimeError('atlas full')

    def add(self, name, kind, rmp, tw=1, th=1, **kw):
        r, c = self._alloc(tw, th)
        T = self.tile
        w, h = tw * T, th * T
        x0 = c * T
        y0 = self.size - (r + th) * T        # numpy rows: 0 = bottom of image
        base, emit = paint(kind, w, h, rmp, **kw)
        self.base[y0:y0 + h, x0:x0 + w] = base
        self.emit[y0:y0 + h, x0:x0 + w] = emit
        self.rects[name] = (x0, y0, w, h)
        if emit.max() > 0.01:
            self.emissive.add(name)
        return name

    def uv(self, name, u, v):
        x0, y0, w, h = self.rects[name]
        S = self.size
        return ((x0 + 0.5 + u * (w - 1.0)) / S, (y0 + 0.5 + v * (h - 1.0)) / S)

    def images(self, prefix):
        out = []
        for tag, arr in (('base', self.base), ('emit', self.emit)):
            S = self.size
            img = bpy.data.images.new(f'{prefix}_{tag}', S, S, alpha=False)
            px = np.concatenate([arr, np.ones((S, S, 1))], axis=2).astype(np.float32)
            img.pixels.foreach_set(px.ravel())
            img.file_format = 'PNG'
            img.pack()
            out.append(img)
        return out


def make_material(name, base_img, emit_img, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tb = nt.nodes.new('ShaderNodeTexImage')
    tb.image = base_img
    tb.interpolation = 'Closest'
    tb.location = (-500, 300)
    nt.links.new(tb.outputs['Color'], bsdf.inputs['Base Color'])
    te = nt.nodes.new('ShaderNodeTexImage')
    te.image = emit_img
    te.interpolation = 'Closest'
    te.location = (-500, -100)
    nt.links.new(te.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = emit_strength
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Metallic'].default_value = 0.0
    m.use_backface_culling = False
    return m


# ----------------------------------------------------------------------------
# Geometry builder
# ----------------------------------------------------------------------------
def T(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), Euler([math.radians(a) for a in rot], 'XYZ'), Vector(scale))


def aim(a, b, side=None):
    """Matrix placing local +Z along a->b starting at a; local +X is `side` projected
    (default world X, or world Y when the axis is parallel to X). Returns (matrix, length)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    z = d.normalized()
    s = Vector(side) if side is not None else Vector((1, 0, 0))
    if abs(s.normalized().dot(z)) > 0.95:
        s = Vector((0, 1, 0)) if side is None else Vector((0, 0, 1))
    x = (s - z * s.dot(z)).normalized()
    y = z.cross(x)
    R = Matrix((x, y, z)).transposed().to_4x4()
    return Matrix.Translation(a) @ R, L


def _ang_u(x, y):
    """Mirrored wrap coordinate: 0 at front (-Y), 1 at back (+Y)."""
    return abs(math.atan2(x, -y)) / math.pi


class Builder:
    def __init__(self, atlas):
        self.atlas = atlas
        self.V, self.F, self.UV, self.W = [], [], [], []
        self.parts = 0

    @property
    def tris(self):
        return sum(len(f) - 2 for f in self.F)

    # -- core ------------------------------------------------------------
    def add(self, verts, faces, uvs, mat, xform=None, bone=None, weights=None, wfun=None,
            closed=True, jitter=0.0, seed=0):
        M = xform or Matrix.Identity(4)
        wv = [M @ Vector(v) for v in verts]
        if jitter:
            rng = np.random.default_rng(seed + 7 * self.parts)
            for v in wv:
                v += Vector(rng.uniform(-jitter, jitter, 3))
        faces = [list(f) for f in faces]
        uvs = [list(u) for u in uvs]
        flip = M.to_3x3().determinant() < 0
        if closed:
            vol = 0.0
            for f in faces:
                p0 = wv[f[0]]
                for i in range(1, len(f) - 1):
                    vol += p0.dot(wv[f[i]].cross(wv[f[i + 1]]))
            flip = vol < 0
        if flip:
            faces = [f[::-1] for f in faces]
            uvs = [u[::-1] for u in uvs]
        base = len(self.V)
        for i, v in enumerate(wv):
            self.V.append(v)
            if weights is not None:
                self.W.append(weights[i])
            elif wfun is not None:
                self.W.append(wfun(v))
            else:
                self.W.append({bone: 1.0})
        for f, u in zip(faces, uvs):
            self.F.append([base + i for i in f])
            self.UV.append([self.atlas.uv(mat, a, b) for a, b in u])
        self.parts += 1
        return list(range(base, base + len(wv)))

    # -- primitives (local space) -----------------------------------------
    def box(self, mat, size=(1, 1, 1), xform=None, top=(1, 1), top_off=(0, 0), bottom=(1, 1), **kw):
        sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
        b0, b1 = bottom
        t0, t1 = top
        ox, oy = top_off
        v = [(-sx * b0, -sy * b1, -sz), (sx * b0, -sy * b1, -sz), (sx * b0, sy * b1, -sz), (-sx * b0, sy * b1, -sz),
             (-sx * t0 + ox, -sy * t1 + oy, sz), (sx * t0 + ox, -sy * t1 + oy, sz),
             (sx * t0 + ox, sy * t1 + oy, sz), (-sx * t0 + ox, sy * t1 + oy, sz)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        return self.add(v, f, self._boxuv(v, f), mat, xform, **kw)

    @staticmethod
    def _boxuv(v, f):
        V = [Vector(p) for p in v]
        mn = Vector((min(p.x for p in V), min(p.y for p in V), min(p.z for p in V)))
        mx = Vector((max(p.x for p in V), max(p.y for p in V), max(p.z for p in V)))
        d = mx - mn
        d = Vector((max(d.x, 1e-6), max(d.y, 1e-6), max(d.z, 1e-6)))
        out = []
        for face in f:
            p0, p1, p2 = V[face[0]], V[face[1]], V[face[2]]
            nrm = (p1 - p0).cross(p2 - p0)
            ax = max(range(3), key=lambda k: abs(nrm[k]))
            uv = []
            for i in face:
                p = (V[i] - mn)
                if ax == 2:
                    uv.append((p.x / d.x, p.y / d.y))
                elif ax == 0:
                    uv.append((p.y / d.y, p.z / d.z))
                else:
                    uv.append((p.x / d.x, p.z / d.z))
            out.append(uv)
        return out

    def lathe(self, mat, profile, sides=8, xform=None, sx=1.0, sy=1.0, a0=0.0, cap0=True, cap1=True,
              ring_w=None, zig=None, **kw):
        """profile: [(r, z), ...] bottom->top. r == 0 gives an apex. ring_w: per-ring weight dicts.
        zig: (ring_index, dz) offsets every odd vertex of that ring by dz (tattered hems / crowns)."""
        verts, faces, uvs, W = [], [], [], []
        rings = []
        lens = [0.0]
        for i in range(1, len(profile)):
            lens.append(lens[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
        tot = lens[-1] or 1.0
        for ri, (r, z) in enumerate(profile):
            vv = lens[ri] / tot
            if r <= 1e-6:
                rings.append(('apex', len(verts), vv))
                verts.append((0, 0, z))
                if ring_w:
                    W.append(ring_w[ri])
            else:
                idxs = []
                for i in range(sides):
                    a = a0 + TAU * i / sides
                    zz = z
                    if zig and zig[0] == ri and i % 2 == 1:
                        zz += zig[1]
                    idxs.append(len(verts))
                    verts.append((math.sin(a) * r * sx, -math.cos(a) * r * sy, zz))
                    if ring_w:
                        W.append(ring_w[ri])
                rings.append(('ring', idxs, vv))

        def u_of(i):
            x, y, _ = verts[i]
            return _ang_u(x, y)

        for k in range(len(rings) - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(sides):
                j = (i + 1) % sides
                if A[0] == 'ring' and B[0] == 'ring':
                    f = (A[1][i], A[1][j], B[1][j], B[1][i])
                    uvs.append([(u_of(A[1][i]), A[2]), (u_of(A[1][j]), A[2]), (u_of(B[1][j]), B[2]), (u_of(B[1][i]), B[2])])
                elif A[0] == 'apex' and B[0] == 'ring':
                    f = (A[1], B[1][j], B[1][i])
                    uu = (u_of(B[1][j]) + u_of(B[1][i])) / 2
                    uvs.append([(uu, A[2]), (u_of(B[1][j]), B[2]), (u_of(B[1][i]), B[2])])
                elif A[0] == 'ring' and B[0] == 'apex':
                    f = (A[1][i], A[1][j], B[1])
                    uu = (u_of(A[1][i]) + u_of(A[1][j])) / 2
                    uvs.append([(u_of(A[1][i]), A[2]), (u_of(A[1][j]), A[2]), (uu, B[2])])
                else:
                    continue
                faces.append(f)
        rr = max(p[0] for p in profile) or 1.0

        def capuv(idxs):
            return [(0.5 + 0.5 * verts[i][0] / (rr * sx), 0.5 + 0.5 * verts[i][1] / (rr * sy)) for i in idxs]
        closed = True
        if rings[0][0] == 'ring':
            if cap0:
                f = rings[0][1][::-1]
                faces.append(f)
                uvs.append(capuv(f))
            else:
                closed = False
        if rings[-1][0] == 'ring':
            if cap1:
                f = rings[-1][1]
                faces.append(f)
                uvs.append(capuv(f))
            else:
                closed = False
        if ring_w:
            kw['weights'] = W
        want_closed = kw.pop('closed', True)
        return self.add(verts, faces, uvs, mat, xform, closed=closed and want_closed, **kw)

    def cyl(self, mat, r0, r1, h, sides=6, xform=None, **kw):
        return self.lathe(mat, [(r0, 0), (r1, h)], sides, xform, **kw)

    def cone(self, mat, r, h, sides=4, xform=None, **kw):
        return self.lathe(mat, [(r, 0), (0, h)], sides, xform, **kw)

    def sphere(self, mat, r=1.0, seg=8, rings=5, xform=None, scale=(1, 1, 1), **kw):
        prof = []
        for i in range(rings + 1):
            phi = math.pi * i / rings
            prof.append((r * math.sin(phi) if 0 < i < rings else 0.0, -r * math.cos(phi)))
        M = (xform or Matrix.Identity(4)) @ T(scale=scale)
        return self.lathe(mat, prof, seg, M, **kw)

    def octa(self, mat, r=0.1, xform=None, stretch=1.4, **kw):
        return self.sphere(mat, r, 4, 2, xform, scale=(1, 1, stretch), **kw)

    def limb(self, mat, a, b, r0, r1=None, sides=6, side=None, **kw):
        M, L = aim(a, b, side)
        return self.cyl(mat, r0, r0 if r1 is None else r1, L, sides, M, **kw)

    def spike(self, mat, a, b, r, sides=4, side=None, **kw):
        M, L = aim(a, b, side)
        return self.cone(mat, r, L, sides, M, **kw)

    def slab(self, mat, a, b, w, t, side=None, top=(1, 1), **kw):
        """Box from a to b (length axis), width w along `side`, thickness t."""
        M, L = aim(a, b, side)
        return self.box(mat, (w, t, L), M @ T((0, 0, L / 2)), top=top, **kw)

    def lathe_between(self, mat, a, b, profile01, sides=8, side=None, **kw):
        """Lathe whose profile z is given as 0..1 fraction of the a->b distance."""
        M, L = aim(a, b, side)
        return self.lathe(mat, [(r, z * L) for r, z in profile01], sides, M, **kw)

    def tube(self, mat, pts, radii, sides=6, ring_w=None, cap0=True, cap1=True, sx=1.0, ref=None, **kw):
        """Tube through points (parallel transport frames). radii may end in 0 (pointed tip)."""
        P = [Vector(p) for p in pts]
        n = len(P)
        Ts = []
        for i in range(n):
            if i == 0:
                t = P[1] - P[0]
            elif i == n - 1:
                t = P[-1] - P[-2]
            else:
                t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
            Ts.append(t.normalized())
        ref = Vector(ref) if ref is not None else Vector((0, -1, 0))
        if abs(Ts[0].dot(ref.normalized())) > 0.9:
            ref = Vector((0, 0, 1)) if abs(Ts[0].z) < 0.9 else Vector((0, -1, 0))
        F = (ref - Ts[0] * ref.dot(Ts[0])).normalized()
        frames = []
        for i in range(n):
            if i > 0:
                q = Ts[i - 1].rotation_difference(Ts[i])
                F = (q @ F)
                F = (F - Ts[i] * F.dot(Ts[i])).normalized()
            frames.append((F.copy(), Ts[i].cross(F).normalized()))
        lens = [0.0]
        for i in range(1, n):
            lens.append(lens[-1] + (P[i] - P[i - 1]).length)
        tot = lens[-1] or 1
        verts, faces, uvs, W = [], [], [], []
        rings = []
        for i in range(n):
            r = radii[i]
            Fr, Sd = frames[i]
            if r <= 1e-6:
                rings.append(('apex', len(verts), lens[i] / tot))
                verts.append(P[i].copy())
                W.append(ring_w[i] if ring_w else None)
                continue
            idxs = []
            for k in range(sides):
                a = TAU * k / sides
                idxs.append(len(verts))
                verts.append(P[i] + (Fr * math.cos(a) + Sd * math.sin(a) * sx) * r)
                W.append(ring_w[i] if ring_w else None)
            rings.append(('ring', idxs, lens[i] / tot))

        def u_of(k):
            a = TAU * (k % sides) / sides
            return abs(math.atan2(math.sin(a), math.cos(a))) / math.pi
        for k in range(n - 1):
            A, B = rings[k], rings[k + 1]
            for i in range(sides):
                j = (i + 1) % sides
                if A[0] == 'ring' and B[0] == 'ring':
                    faces.append((A[1][i], A[1][j], B[1][j], B[1][i]))
                    uvs.append([(u_of(i), A[2]), (u_of(j), A[2]), (u_of(j), B[2]), (u_of(i), B[2])])
                elif A[0] == 'ring' and B[0] == 'apex':
                    faces.append((A[1][i], A[1][j], B[1]))
                    uvs.append([(u_of(i), A[2]), (u_of(j), A[2]), ((u_of(i) + u_of(j)) / 2, B[2])])
                elif A[0] == 'apex' and B[0] == 'ring':
                    faces.append((A[1], B[1][j], B[1][i]))
                    uvs.append([((u_of(i) + u_of(j)) / 2, A[2]), (u_of(j), B[2]), (u_of(i), B[2])])
        closed = True
        for end, cap, rev in ((rings[0], cap0, True), (rings[-1], cap1, False)):
            if end[0] == 'ring':
                if cap:
                    f = end[1][::-1] if rev else end[1]
                    faces.append(f)
                    uvs.append([(0.5 + 0.45 * math.cos(TAU * (q % sides) / sides), 0.5 + 0.45 * math.sin(TAU * (q % sides) / sides)) for q in range(len(f))])
                else:
                    closed = False
        if ring_w:
            kw['weights'] = W
        return self.add(verts, faces, uvs, mat, None, closed=closed, **kw)

    def sheet(self, mat, rows, ring_w=None, **kw):
        """Grid surface from rows of points (list of lists, same length). Open, double-sided material.
        UV: u across a row, v along rows (row 0 = v 1 top)."""
        R, C = len(rows), len(rows[0])
        verts, W = [], []
        for r in range(R):
            for c in range(C):
                verts.append(tuple(rows[r][c]))
                W.append(ring_w[r] if ring_w else None)
        faces, uvs = [], []
        for r in range(R - 1):
            for c in range(C - 1):
                a, b = r * C + c, r * C + c + 1
                d, e = (r + 1) * C + c, (r + 1) * C + c + 1
                faces.append((a, d, e, b))
                uvs.append([(c / (C - 1), 1 - r / (R - 1)), (c / (C - 1), 1 - (r + 1) / (R - 1)),
                            ((c + 1) / (C - 1), 1 - (r + 1) / (R - 1)), ((c + 1) / (C - 1), 1 - r / (R - 1))])
        if ring_w:
            kw['weights'] = W
        return self.add(verts, faces, uvs, mat, None, closed=False, **kw)

    def poly(self, mat, pts, weights=None, axes=(0, 2), **kw):
        """Single flat n-gon (convex or fan-safe) with planar UVs on the given axes."""
        P = [Vector(p) for p in pts]
        mn = [min(p[a] for p in P) for a in axes]
        mx = [max(p[a] for p in P) for a in axes]
        uv = [((p[axes[0]] - mn[0]) / max(mx[0] - mn[0], 1e-6), (p[axes[1]] - mn[1]) / max(mx[1] - mn[1], 1e-6)) for p in P]
        return self.add(P, [list(range(len(P)))], [uv], mat, None, weights=weights, closed=False, **kw)

    # -- finalize ----------------------------------------------------------
    def build(self, name, material, armature=None, floor=0.0):
        if floor is not None:
            for v in self.V:          # nothing below the ground plane (jitter safety)
                if v.z < floor:
                    v.z = floor
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.V], [], self.F)
        uvl = me.uv_layers.new(name='UVMap')
        flat = [c for face in self.UV for uv in face for c in uv]
        uvl.data.foreach_set('uv', flat)
        me.materials.append(material)
        for p in me.polygons:
            p.use_smooth = False
        bad = me.validate(verbose=False)
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if armature is not None:
            groups = {}
            for i, wd in enumerate(self.W):
                tot = sum(wd.values())
                for bn, wt in wd.items():
                    if wt <= 0:
                        continue
                    if bn not in groups:
                        if bn not in armature.data.bones:
                            raise KeyError(f'no bone {bn}')
                        groups[bn] = ob.vertex_groups.new(name=bn)
                    groups[bn].add([i], wt / tot, 'REPLACE')
            ob.parent = armature
            mod = ob.modifiers.new('Armature', 'ARMATURE')
            mod.object = armature
        return ob, bad


def wlerp(a, b, t):
    """Blend two bones: weight dict at parameter t (0 -> a, 1 -> b)."""
    t = min(max(t, 0.0), 1.0)
    if t <= 0.001:
        return {a: 1.0}
    if t >= 0.999:
        return {b: 1.0}
    return {a: 1.0 - t, b: t}


# ----------------------------------------------------------------------------
# Rig + actions
# ----------------------------------------------------------------------------
def build_armature(name, bones, length=0.22):
    """bones: [(name, (x,y,z) head, parent_or_None), ...] - every bone points +Z, roll 0."""
    sc = bpy.context.scene
    ad = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, ad)
    sc.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for bn, h, par in bones:
        eb = ad.edit_bones.new(bn)
        eb.head = Vector(h)
        eb.tail = Vector(h) + Vector((0, 0, length))
        eb.roll = 0.0
        eb.use_deform = True
        ebs[bn] = eb
    for bn, h, par in bones:
        if par:
            ebs[bn].parent = ebs[par]
            ebs[bn].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm


def world_quat(rx, ry, rz):
    """World-axis degrees -> pose quaternion for a +Z pointing, roll-0 bone (local X=wX, Y=wZ, Z=-wY)."""
    return Euler((math.radians(rx), math.radians(rz), -math.radians(ry)), 'XYZ').to_quaternion()


def pose(base=None, **delta):
    """Compose a pose dict. base + delta (rotations add; '@loc' keys add). Use '__' for '@'
    in kwargs: hips__loc=(0,0,-.2)."""
    out = dict(base or {})
    for k, v in delta.items():
        k = k.replace('__', '@')
        if k in out:
            out[k] = tuple(a + b for a, b in zip(out[k], v))
        else:
            out[k] = tuple(v)
    return out


def mix(a, b, t):
    keys = set(a) | set(b)
    return {k: tuple(x * (1 - t) + y * t for x, y in zip(a.get(k, (0, 0, 0)), b.get(k, (0, 0, 0)))) for k in keys}


def add_actions(arm, actions):
    """actions: [(name, [(frame, pose_dict), ...]), ...].
    A bone is keyed in EVERY action as soon as it moves in ANY action (so switching clips always resets it);
    channels that are constant inside one action get just two keys; bones that never move are not keyed."""
    def nz(v):
        return any(abs(c) > 1e-9 for c in v)
    rot_bones, loc_bones = set(), set()
    for _, keys in actions:
        for _, p in keys:
            for k, v in p.items():
                if k.endswith('@loc'):
                    if nz(v):
                        loc_bones.add(k[:-4])
                elif nz(v):
                    rot_bones.add(k)
    arm.animation_data_create()
    ad = arm.animation_data
    for name, keys in actions:
        act = bpy.data.actions.new(name)
        ad.action = act
        f0, f1 = keys[0][0], keys[-1][0]
        for pb in arm.pose.bones:
            for chan, bones in (('rot', rot_bones), ('loc', loc_bones)):
                if pb.name not in bones:
                    continue
                key = pb.name if chan == 'rot' else pb.name + '@loc'
                vals = [tuple(p.get(key, (0.0, 0.0, 0.0))) for _, p in keys]
                if all(v == vals[0] for v in vals):
                    seq = [(f0, vals[0]), (f1, vals[0])]
                else:
                    seq = [(f, v) for (f, _), v in zip(keys, vals)]
                prev = None
                for frame, v in seq:
                    if chan == 'rot':
                        q = world_quat(*v)
                        if prev is not None:
                            q.make_compatible(prev)
                        prev = q.copy()
                        pb.rotation_quaternion = q
                        pb.keyframe_insert('rotation_quaternion', frame=frame, group=pb.name)
                    else:
                        pb.location = (v[0], v[2], -v[1])
                        pb.keyframe_insert('location', frame=frame, group=pb.name)
        act.use_fake_user = True
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        ad.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)


def export_glb(path, arm=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = dict(filepath=path, export_format='GLB', export_yup=True, use_selection=False,
              export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=False,
              export_optimize_animation_size=True, export_materials='EXPORT', export_image_format='AUTO',
              export_skins=True, export_morph=False, export_lights=False, export_cameras=False,
              export_texcoords=True, export_normals=True, export_tangents=False)
    bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def bake_report(name, builder, arm, path, extra=None):
    info = dict(id=name, tris=builder.tris, verts=len(builder.V), bones=len(arm.data.bones) if arm else 0,
                bytes=os.path.getsize(path))
    if extra:
        info.update(extra)
    print('BOSSREPORT ' + json.dumps(info))
    return info


def biped_walk(base, n, stride=24, knee=36, arm=16, bob=0.08, sway=4, roll=3, hips='hips', loc_bone='hips',
               arms=True, extra=None):
    """4-phase biped cycle (contact L, passing, contact R, passing, back to contact L) added on `base`."""
    def leg_contact(side, fwd):
        if fwd:
            return {f'thigh_{side}': (-stride, 0, 0), f'shin_{side}': (6, 0, 0), f'foot_{side}': (stride * 0.7, 0, 0)}
        return {f'thigh_{side}': (stride * 0.75, 0, 0), f'shin_{side}': (knee * 0.5, 0, 0),
                f'foot_{side}': (-(stride * 0.75 + knee * 0.5) + 8, 0, 0)}

    def leg_pass(side, swing):
        if swing:
            return {f'thigh_{side}': (-stride * 0.45, 0, 0), f'shin_{side}': (knee, 0, 0), f'foot_{side}': (-6, 0, 0)}
        return {f'thigh_{side}': (2, 0, 0), f'shin_{side}': (4, 0, 0), f'foot_{side}': (-4, 0, 0)}

    def compose(parts, phase):
        p = dict(base)
        for d in parts:
            for k, v in d.items():
                p[k] = tuple(a + b for a, b in zip(p.get(k, (0, 0, 0)), v))
        add = {}
        if phase in (0, 2):
            s = 1 if phase == 0 else -1
            add[loc_bone + '@loc'] = (0, 0, -bob * 0.3)
            add[hips] = (0, 0, sway * s)
            if arms:
                add['upperarm_L'] = (arm * s, 0, 0)
                add['upperarm_R'] = (-arm * s, 0, 0)
                add['forearm_L'] = (-abs(arm) * 0.6 * (s < 0), 0, 0)
                add['forearm_R'] = (-abs(arm) * 0.6 * (s > 0), 0, 0)
        else:
            s = 1 if phase == 1 else -1
            add[loc_bone + '@loc'] = (0, 0, bob)
            add[hips] = (0, roll * s, 0)
        for k, v in add.items():
            p[k] = tuple(a + b for a, b in zip(p.get(k, (0, 0, 0)), v))
        if extra:
            for k, v in extra(phase).items():
                p[k] = tuple(a + b for a, b in zip(p.get(k, (0, 0, 0)), v))
        return p
    k0 = compose([leg_contact('L', True), leg_contact('R', False)], 0)
    k1 = compose([leg_pass('L', False), leg_pass('R', True)], 1)
    k2 = compose([leg_contact('R', True), leg_contact('L', False)], 2)
    k3 = compose([leg_pass('R', False), leg_pass('L', True)], 3)
    q = n / 4
    return [(0, k0), (round(q), k1), (round(2 * q), k2), (round(3 * q), k3), (n, k0)]


def shake(keys_pose, frames, bone, amp, axis=2):
    """Alternating small rotations on `bone` around keys_pose for the given frames."""
    out = []
    for i, f in enumerate(frames):
        v = [0, 0, 0]
        v[axis] = amp if i % 2 == 0 else -amp
        out.append((f, pose(keys_pose, **{bone: tuple(v)})))
    return out


def sym(**kw):
    """sym(upperarm=(x,y,z)) -> {'upperarm_L': (x,y,z), 'upperarm_R': (x,-y,-z)} (mirror across X)."""
    out = {}
    for k, v in kw.items():
        loc = k.endswith('__loc')
        name = k[:-5] if loc else k
        if loc:
            out[name + '_L@loc'] = tuple(v)
            out[name + '_R@loc'] = (-v[0], v[1], v[2])
        else:
            out[name + '_L'] = tuple(v)
            out[name + '_R'] = (v[0], -v[1], -v[2])
    return out


def P(base, *dicts, **kw):
    """pose() that also accepts dicts (e.g. from sym())."""
    out = dict(base or {})
    for d in list(dicts) + [{k.replace('__', '@'): v for k, v in kw.items()}]:
        for k, v in d.items():
            out[k] = tuple(a + b for a, b in zip(out.get(k, (0, 0, 0)), v))
    return out
