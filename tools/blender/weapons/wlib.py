"""Shared helpers for the PSX-style weapon generator of EFSUN ONLINE.

Everything here runs inside Blender (background mode) and is imported by
gen_weapons.py.  Conventions (Blender space, exported with +Y up):
  * 1 unit = 1 game unit, Z up, models face -Y.
  * Hand-held weapons: origin = grip point, blade/head points +Z.
  * Width of blades along X, thickness along Y.

The texture of each asset is one tiny atlas (64x64 by default) painted with
numpy: limited ramps, Bayer ordered dither, dark 1px outlines and painted
bevel highlights.  Parts of the mesh get UVs that land exactly on the region
that was painted for them, so painted outlines line up with the silhouette.
"""
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix

# --------------------------------------------------------------------------
# palettes (sRGB, dark -> light; index 0 doubles as the outline colour)
# --------------------------------------------------------------------------

def H(*hexes):
    out = []
    for h in hexes:
        h = h.lstrip('#')
        out.append([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])
    return np.array(out, dtype=float)


PAL = dict(
    steel=H('161820', '3c4252', '687082', 'a2aab8', 'dce2ea'),
    steel_hi=H('f6f8fb'),
    iron=H('1a181a', '403c3c', '666260', '8e8a84', 'b8b2a8'),
    rust=H('3a1c10', '74381a', 'a85a26', 'cc8a44'),
    dsteel=H('0e0c12', '242230', '3c3a4a', '5e5c70', '8a88a0'),
    gold=H('2e1c08', '7a5014', 'ba862a', 'e8c050', 'fff0a6'),
    brass=H('2c1c0c', '6e4820', 'a87236', 'd8aa5c'),
    bronze=H('24140a', '5e3618', '94582a', 'c48848'),
    leather=H('20120a', '482a16', '6e4424', '966440'),
    red=H('240808', '601412', '962620', 'c84a34'),
    crimson=H('1a0406', '4a0a10', '7e1620', 'b02c30'),
    blue=H('0c1028', '1c2a60', '324c94', '5e7ec8'),
    navy=H('080a18', '141c3c', '22305e', '34488a'),
    wood=H('28180e', '54341c', '7c522c', 'a07242', 'c09862'),
    dwood=H('180e0a', '382216', '563824', '76523a'),
    pwood=H('2a2014', '5a4428', '86683e', 'b0925e', 'd2b886'),
    bone=H('3a3226', '7e7260', 'b6aa8e', 'e0d8be', 'f6f2e2'),
    jade=H('08261c', '165a40', '2e9466', '6cce94', 'c0f2c8'),
    black=H('08060a', '18141c', '2c2632', '463e4c'),
    cloth_w=H('2a2a30', '6a6a74', 'a8a8b0', 'e2e2e6'),
    green=H('0c1a0a', '1e4216', '3a7224', '68a83a'),
    ruby=H('2a0006', '7a0a1a', 'cc1e2c', 'ff6a5a', 'ffd8d0'),
    sapph=H('020a2a', '0a2a7a', '1e5ad0', '6aa8ff', 'd8ecff'),
    emer=H('021a0a', '0a5a24', '1eb04a', '7af08a', 'dcffe0'),
    amet=H('14041e', '44106a', '8030c0', 'c07aff', 'f0dcff'),
    cyan=H('021a22', '0a5a70', '1eb0d0', '7aeaff', 'e0fcff'),
    ice=H('101c2c', '2a5070', '5ea0c8', 'a8e0f8', 'f0fcff'),
    fire=H('2a0600', '8a1c00', 'e05200', 'ffa020', 'fff0a0'),
    lava=H('1a0400', '701000', 'd03a00', 'ff8a10', 'ffe070'),
    poison=H('041a06', '0e5a14', '28b030', '8cff6a', 'e8ffd0'),
    soul=H('06180e', '0e5030', '20a060', '70ffb0', 'e0fff0'),
    purple=H('10061a', '2e1046', '52207a', '8a44b8'),
)

BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) + 0.5) / 16.0


QUANT_CONTRAST = 2.4


def quant(shade, rmp, ox=0, oy=0, dither=1.0, contrast=None):
    """Map a 0..1 shade field onto a colour ramp with 4x4 Bayer dithering.
    contrast > 1 flattens each level into a plateau so the dither only shows
    in narrow transition bands (hand-dithered look instead of noise)."""
    h, w = shade.shape
    n = len(rmp)
    k = QUANT_CONTRAST if contrast is None else contrast
    b = BAYER[(np.arange(h)[:, None] + oy) % 4, (np.arange(w)[None, :] + ox) % 4]
    v = np.clip(shade, 0, 1) * (n - 1)
    fl = np.floor(v)
    fr = np.clip((v - fl - 0.5) * k + 0.5, 0, 1)
    v = fl + fr + (b - 0.5) * dither + 0.5
    idx = np.clip(np.floor(v), 0, n - 1).astype(int)
    return rmp[idx]


def grid(h, w):
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    return ys, xs


def vnoise(h, w, cell, rng, cell_y=None):
    """Smooth value noise in 0..1 (cell_y for anisotropic, e.g. wood grain)."""
    cell = max(cell, 1e-3)
    cy_ = max(cell_y if cell_y else cell, 1e-3)
    gh = int(math.ceil(h / cy_)) + 2
    gw = int(math.ceil(w / cell)) + 2
    g = rng.random((gh, gw))
    y = np.arange(h) / cy_
    x = np.arange(w) / cell
    y0 = np.floor(y).astype(int)
    x0 = np.floor(x).astype(int)
    fy = y - y0
    fx = x - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    a = g[y0][:, x0]
    b = g[y0][:, x0 + 1]
    c = g[y0 + 1][:, x0]
    d = g[y0 + 1][:, x0 + 1]
    top = a + (b - a) * fx[None, :]
    bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def seg_dist(xs, ys, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    L2 = dx * dx + dy * dy + 1e-12
    t = np.clip(((xs - x1) * dx + (ys - y1) * dy) / L2, 0, 1)
    return np.hypot(xs - (x1 + t * dx), ys - (y1 + t * dy))


def poly_inside(poly, xs, ys):
    inside = np.zeros(xs.shape, bool)
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if abs(y2 - y1) < 1e-12:
            continue
        cond = (y1 > ys) != (y2 > ys)
        xint = (x2 - x1) * (ys - y1) / (y2 - y1) + x1
        inside ^= cond & (xs < xint)
    return inside


def poly_dist(poly, xs, ys, closed=True, edges=None):
    d = np.full(xs.shape, 1e9)
    n = len(poly)
    rng_ = range(n if closed else n - 1)
    for i in rng_:
        if edges is not None and i not in edges:
            continue
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        d = np.minimum(d, seg_dist(xs, ys, x1, y1, x2, y2))
    return d


# --------------------------------------------------------------------------
# atlas
# --------------------------------------------------------------------------

class Atlas:
    def __init__(self, w=64, h=64, seed=1, bg='141016'):
        self.W, self.H = w, h
        self.col = np.zeros((h, w, 3))
        self.col[:] = H(bg)[0]
        self.emit = np.zeros((h, w, 3))
        self.rng = np.random.default_rng(seed)
        self.sky = np.zeros(w, int)
        self.tiles = {}

    # skyline bottom-left packer
    def alloc(self, w, h):
        w = min(w, self.W)
        best = None
        for x in range(0, self.W - w + 1):
            y = int(self.sky[x:x + w].max())
            if y + h <= self.H and (best is None or y < best[1]):
                best = (x, y)
        if best is None:
            raise RuntimeError('atlas full (%dx%d) for %dx%d' % (self.W, self.H, w, h))
        x, y = best
        self.sky[x:x + w] = y + h
        return (x, y, w, h)

    def view(self, r):
        x, y, w, h = r
        return self.col[y:y + h, x:x + w]

    def eview(self, r):
        x, y, w, h = r
        return self.emit[y:y + h, x:x + w]

    def uv(self, r, px, py):
        x, y, w, h = r
        return ((x + 0.5 + px) / self.W, (y + 0.5 + py) / self.H)

    def uvn(self, r, s, t):
        x, y, w, h = r
        return self.uv(r, s * (w - 1), t * (h - 1))

    def tile(self, key, w, h, fn, *a, **k):
        if key not in self.tiles:
            r = self.alloc(w, h)
            fn(self, r, *a, **k)
            self.tiles[key] = r
        return self.tiles[key]

    def has_emit(self):
        return float(self.emit.max()) > 0.02


def make_proj(rect, bb, pad=0.5):
    x, y, w, h = rect
    xmin, xmax, zmin, zmax = bb
    sx = (w - 1 - 2 * pad) / max(xmax - xmin, 1e-6)
    sz = (h - 1 - 2 * pad) / max(zmax - zmin, 1e-6)

    def proj(px, pz):
        return (pad + (px - xmin) * sx, pad + (pz - zmin) * sz)
    return proj


# --------------------------------------------------------------------------
# painters
# --------------------------------------------------------------------------

def paint_decal(A, rect, poly, rmp, base=0.5, gx=0.0, gy=0.18, noise=0.12, ncell=3.0,
                inner=None, bevel_shade=0.82, edges=None, edge_w=1.4, edge_shade=1.0,
                outline=True, glints=0, glint_col=None, ridge=None, ridge_shade=0.9,
                ridge_w=0.7):
    """Paint a silhouette (polygon in region pixel coords) with shading, a dark
    1px outline, an optional bevel band (between poly and inner poly), bright
    cutting-edge bands and a ridge line.  Returns masks for further detail."""
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    poly = np.asarray(poly, float)
    ins = poly_inside(poly, xs, ys)
    d = poly_dist(poly, xs, ys)
    sx = xs / max(w - 1, 1) * 2 - 1
    sy = ys / max(h - 1, 1) * 2 - 1
    nz = vnoise(h, w, ncell, A.rng) * 2 - 1
    shade = base + gx * sx + gy * sy + noise * nz
    bev = np.zeros_like(ins)
    if inner is not None:
        inner = np.asarray(inner, float)
        inn = poly_inside(inner, xs, ys)
        bev = ins & ~inn
        di = poly_dist(inner, xs, ys)
        shade = np.where(bev, bevel_shade + 0.08 * sy + 0.5 * noise * nz, shade)
        shade = np.where(bev & (di < 0.75), bevel_shade + 0.16, shade)
    if ridge is not None:
        dr = poly_dist(np.asarray(ridge, float), xs, ys, closed=False)
        shade = np.where(ins & (dr < ridge_w), ridge_shade, shade)
    if edges is not None:
        de = poly_dist(poly, xs, ys, edges=set(edges))
        band = ins & (de < 1.0 + edge_w)
        shade = np.where(band, edge_shade - 0.08 * (de - 1.0).clip(0), shade)
    c = quant(shade, rmp)
    if glints:
        cand = np.argwhere(ins & (d > 1.2) & (d < 2.6))
        if len(cand):
            pick = cand[A.rng.choice(len(cand), size=min(glints, len(cand)), replace=False)]
            gc = glint_col if glint_col is not None else PAL['steel_hi'][0]
            for (py, px) in pick:
                c[py, px] = gc
    if outline:
        c[(~ins) | (d < 0.9)] = rmp[0]
    A.view(rect)[:] = c
    return dict(ins=ins, d=d, xs=xs, ys=ys, bev=bev)


def paint_flat(A, rect, rmp, base=0.5, gy=0.2, noise=0.1, rows=True, cell=2.0):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    t = ys / max(h - 1, 1)
    shade = base + gy * (t * 2 - 1) + noise * (vnoise(h, w, cell, A.rng) * 2 - 1)
    c = quant(shade, rmp)
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_metal(A, rect, rmp, base=0.48, hl=0.32, hl_s=0.28, gy=0.18, noise=0.08, rows=True,
                engrave=False, bands=0):
    """Tile for round metal parts: vertical highlight strip around the azimuth,
    lighter towards the top, dark seam rows at both ends."""
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    s = xs / max(w - 1, 1)
    t = ys / max(h - 1, 1)
    shade = base + gy * (t * 2 - 1) + hl * np.exp(-((s - hl_s) / 0.13) ** 2)
    shade -= 0.18 * np.exp(-((s - hl_s - 0.5) / 0.16) ** 2)
    shade += noise * (vnoise(h, w, 2, A.rng) * 2 - 1)
    if bands:
        ph = (t * bands) % 1.0
        shade = np.where(ph < 0.18, shade - 0.3, shade)
    c = quant(shade, rmp)
    if engrave:
        m = ((xs + 2 * ys) % 5 == 0) & ((ys % 4) == 1)
        c[m] = rmp[1]
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_wrap(A, rect, rmp, period=4, slope=1, cross=False, rows=True, hi=0.95):
    """Leather/cloth wrap with diagonal bands (and optional crossing ito pattern)."""
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    p = ((xs * slope + ys) % period) / period
    shade = 0.2 + (hi - 0.2) * p
    seam = p < (1.0 / period)
    if cross:
        q = ((-xs * slope + ys) % period) / period
        shade = np.minimum(shade, 0.2 + (hi - 0.2) * q)
        seam |= q < (1.0 / period)
    c = quant(shade, rmp)
    c[seam] = rmp[0]
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_wood(A, rect, rmp, freq=1.4, knots=1, rows=False, base=0.5, gy=0.0, dark_lines=True):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    t = ys / max(h - 1, 1)
    warp = vnoise(h, w, 3, A.rng, cell_y=12) * 2.2
    g = np.sin(xs * freq + warp)
    shade = base + 0.17 * g + 0.07 * (vnoise(h, w, 2, A.rng, cell_y=6) * 2 - 1) + gy * (t * 2 - 1)
    if dark_lines:
        shade = np.where(g > 0.9, shade - 0.3, shade)
    for _ in range(knots):
        kx, ky = A.rng.random() * w, A.rng.random() * h
        dd = np.hypot((xs - kx) * 1.6, (ys - ky) * 0.8)
        shade = np.where(dd < 1.3, 0.05, np.where(dd < 2.4, shade - 0.25, shade))
    c = quant(shade, rmp)
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_gem(A, rect, rmp, emit=0.0, sparkle=True, facets=True):
    """Tile for gems / crystals mapped cylindrically (u around, v along)."""
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    t = ys / max(h - 1, 1)
    s = xs / max(w - 1, 1)
    shade = 0.22 + 0.62 * t
    if facets:
        shade += 0.14 * np.sign(np.sin(s * math.pi * 6))
    shade += 0.1 * (vnoise(h, w, 2, A.rng) * 2 - 1)
    c = quant(shade, rmp)
    if sparkle:
        c[int(h * 0.7), int(w * 0.25)] = rmp[-1]
        c[int(h * 0.7), max(int(w * 0.75), 0)] = rmp[-1]
    A.view(rect)[:] = c
    if emit > 0:
        A.eview(rect)[:] = np.clip(c * emit, 0, 1)


def paint_glow(A, rect, rmp, emit=1.0, noise=0.15, gy=0.3, cell=2.0, base=0.6):
    """Emissive tile (flames, magic orbs, lava)."""
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    t = ys / max(h - 1, 1)
    shade = base + gy * (t * 2 - 1) + noise * (vnoise(h, w, cell, A.rng) * 2 - 1)
    c = quant(shade, rmp)
    A.view(rect)[:] = c
    A.eview(rect)[:] = np.clip(c * emit, 0, 1)


def paint_bone(A, rect, rmp, rows=True, cracks=2, base=0.6):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    t = ys / max(h - 1, 1)
    shade = base + 0.15 * (t * 2 - 1) + 0.12 * (vnoise(h, w, 3, A.rng) * 2 - 1)
    c = quant(shade, rmp)
    for _ in range(cracks):
        x = A.rng.integers(0, w)
        y = A.rng.integers(0, h)
        for k in range(int(A.rng.integers(3, 6))):
            if 0 <= y < h:
                c[y, x % w] = rmp[1]
            y += 1
            x += int(A.rng.integers(-1, 2))
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_scales(A, rect, rmp, size=4, rows=True):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    row = np.floor(ys / size)
    off = (row % 2) * (size / 2)
    cx = (np.floor((xs + off) / size) + 0.5) * size - off
    cy = (row + 1.0) * size
    dd = np.hypot(xs - cx, (ys - cy) * 1.0) / size
    shade = 0.85 - 0.6 * dd
    c = quant(shade, rmp)
    c[(dd > 0.78) & (dd < 1.05)] = rmp[0]
    if rows:
        c[0, :] = rmp[0]
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


def paint_cloth(A, rect, rmp, folds=3, rows=True):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    s = xs / max(w, 1)
    shade = 0.5 + 0.3 * np.sin(s * math.pi * 2 * folds) + 0.08 * (vnoise(h, w, 2, A.rng) * 2 - 1)
    shade -= 0.25 * (1 - ys / max(h - 1, 1))
    c = quant(shade, rmp)
    if rows:
        c[-1, :] = rmp[0]
    A.view(rect)[:] = c


GLYPHS = [
    ['.X.', 'XXX', '.X.', '.X.', '.X.'],
    ['X..', 'XX.', 'X.X', 'XX.', 'X..'],
    ['XXX', 'X..', 'XXX', '..X', 'XXX'],
    ['X.X', '.X.', 'X.X', '.X.', 'X.X'],
    ['.X.', 'X.X', '.X.', 'X.X', '.X.'],
    ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
    ['X.X', 'XXX', 'X.X', '..X', '..X'],
    ['XXX', '.X.', 'XXX', '.X.', 'XXX'],
    ['X..', 'X.X', 'XXX', 'X.X', '..X'],
    ['.XX', 'X..', '.X.', '..X', 'XX.'],
]


def draw_glyph(A, rect, gx, gy, gi, col, ecol=None, emit=1.0):
    """Draw a 3x5 glyph whose centre is at region pixel (gx, gy)."""
    x0, y0, w, h = rect
    g = GLYPHS[gi % len(GLYPHS)]
    v = A.view(rect)
    e = A.eview(rect)
    for r, line in enumerate(g):
        for c_, ch in enumerate(line):
            if ch != 'X':
                continue
            px = int(round(gx)) - 1 + c_
            py = int(round(gy)) + 2 - r
            if 0 <= px < w and 0 <= py < h:
                v[py, px] = col
                if ecol is not None:
                    e[py, px] = np.clip(np.asarray(ecol) * emit, 0, 1)


def polyline_at(poly, y):
    """x of a polyline (list of (x,y) sorted by y) at height y."""
    pts = sorted(poly, key=lambda p: p[1])
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if y1 <= y <= y2:
            t = 0 if y2 == y1 else (y - y1) / (y2 - y1)
            return x1 + (x2 - x1) * t
    return pts[0][0] if y < pts[0][1] else pts[-1][0]


def draw_runes(A, rect, ridge, y_from, y_to, col, ecol=None, emit=1.0, step=7, seed=0, channel=None):
    """Glyph column along a blade ridge (region pixel coords).  channel = colour
    of a dark groove painted behind the glyphs."""
    v = A.view(rect)
    x0, y0, w, h = rect
    if channel is not None:
        for y in range(int(y_from) - 3, int(y_to) + 4):
            if 0 <= y < h:
                xc = int(round(polyline_at(ridge, y)))
                for dx in (-2, -1, 0, 1, 2):
                    if 0 <= xc + dx < w:
                        v[y, xc + dx] = channel
    i = seed
    y = y_from
    while y <= y_to:
        draw_glyph(A, rect, polyline_at(ridge, y), y, i, col, ecol, emit)
        i += 3
        y += step


def draw_line(A, rect, pts, col, width=1.0, closed=False, ecol=None, emit=1.0, mask=None):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    d = poly_dist(np.asarray(pts, float), xs, ys, closed=closed)
    m = d < width * 0.5 + 0.25
    if mask is not None:
        m &= mask
    A.view(rect)[m] = col
    if ecol is not None:
        A.eview(rect)[m] = np.clip(np.asarray(ecol) * emit, 0, 1)
    return m


def fill_poly(A, rect, pts, col, ecol=None, emit=1.0, outline=None, mask=None):
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    pts = np.asarray(pts, float)
    m = poly_inside(pts, xs, ys)
    if mask is not None:
        m &= mask
    v = A.view(rect)
    if callable(col):
        v[m] = col(xs, ys)[m]
    else:
        v[m] = col
    if ecol is not None:
        A.eview(rect)[m] = np.clip(np.asarray(ecol) * emit, 0, 1)
    if outline is not None:
        d = poly_dist(pts, xs, ys)
        om = m & (d < 0.9)
        v[om] = outline
        if ecol is not None:
            A.eview(rect)[om] = 0
    return m


def dot(A, rect, px, py, col, size=1, hl=None):
    v = A.view(rect)
    x0, y0, w, h = rect
    for dy in range(size):
        for dx in range(size):
            X, Y = int(px) + dx, int(py) + dy
            if 0 <= X < w and 0 <= Y < h:
                v[Y, X] = col
    if hl is not None:
        X, Y = int(px), int(py) + size - 1
        if 0 <= X < w and 0 <= Y < h:
            v[Y, X] = hl


# --------------------------------------------------------------------------
# mesh building
# --------------------------------------------------------------------------

def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def Rx(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'X')


def Ry(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Y')


def Rz(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Z')


def S(x, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    return Matrix.Diagonal((x, y, z, 1.0))


def align_z(d):
    """Rotation matrix taking +Z onto direction d."""
    d = Vector(d).normalized()
    z = Vector((0, 0, 1))
    if (d - z).length < 1e-6:
        return Matrix.Identity(4)
    if (d + z).length < 1e-6:
        return Rx(180)
    return z.rotation_difference(d).to_matrix().to_4x4()


class MB:
    """Accumulates parts. Each part is its own closed island so normals can be
    recalculated reliably."""

    def __init__(self):
        self.V = []
        self.F = []
        self.UV = []
        self.parts = 0

    def add(self, verts, faces, uvs, M=None):
        base = len(self.V)
        if M is not None:
            verts = [tuple(M @ Vector(v)) for v in verts]
        self.V.extend(tuple(float(c) for c in v) for v in verts)
        for f, uv in zip(faces, uvs):
            self.F.append(tuple(base + i for i in f))
            self.UV.append([tuple(u) for u in uv])
        self.parts += 1

    def tris(self):
        return sum(len(f) - 2 for f in self.F)

    def fit_z(self, length):
        zs = [v[2] for v in self.V]
        k = length / (max(zs) - min(zs))
        self.V = [(x * k, y * k, z * k) for x, y, z in self.V]
        return k

    def bbox(self):
        a = np.array(self.V)
        return a.min(0), a.max(0)


def _stitch(A, rect, R, n, ts, caps, rot, V, s_scale=1.0):
    F, U = [], []

    def uv(s, t):
        return A.uvn(rect, min(s * s_scale, 1.0), t)
    for i in range(len(R) - 1):
        a, b = R[i], R[i + 1]
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(n):
            k2 = (k + 1) % n
            s0, s1 = k / n, (k + 1) / n
            if len(a) == 1:
                F.append((a[0], b[k2], b[k]))
                U.append([uv((s0 + s1) / 2, ts[i]), uv(s1, ts[i + 1]), uv(s0, ts[i + 1])])
            elif len(b) == 1:
                F.append((a[k], a[k2], b[0]))
                U.append([uv(s0, ts[i]), uv(s1, ts[i]), uv((s0 + s1) / 2, ts[i + 1])])
            else:
                F.append((a[k], a[k2], b[k2], b[k]))
                U.append([uv(s0, ts[i]), uv(s1, ts[i]), uv(s1, ts[i + 1]), uv(s0, ts[i + 1])])
    for which, ri in ((0, 0), (1, len(R) - 1)):
        if caps[which] and len(R[ri]) > 2:
            idx = R[ri]
            order = list(reversed(idx)) if which == 0 else list(idx)
            F.append(tuple(order))
            uvs = []
            for v in order:
                k = idx.index(v)
                a_ = rot + 2 * math.pi * k / n
                uvs.append(A.uvn(rect, 0.5 + 0.45 * math.cos(a_), 0.5 + 0.45 * math.sin(a_)))
            U.append(uvs)
    return F, U


def cyl(mb, A, rect, rings, n=6, M=None, rot=0.0, caps=(True, True), ts=None, s_scale=1.0):
    """Lathe/loft along local Z. rings: (z, rx[, ry[, cx[, cy]]]); radius 0 -> point."""
    V, R, pts = [], [], []
    for ring in rings:
        z, rx = ring[0], ring[1]
        ry = ring[2] if len(ring) > 2 and ring[2] is not None else rx
        cx = ring[3] if len(ring) > 3 else 0.0
        cy = ring[4] if len(ring) > 4 else 0.0
        pts.append((cx, cy, z))
        if rx < 1e-7 and ry < 1e-7:
            R.append([len(V)])
            V.append((cx, cy, z))
        else:
            idx = []
            for k in range(n):
                a = rot + 2 * math.pi * k / n
                idx.append(len(V))
                V.append((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
            R.append(idx)
    if ts is None:
        L = [0.0]
        for i in range(1, len(pts)):
            L.append(L[-1] + math.dist(pts[i], pts[i - 1]))
        ts = [l / (L[-1] or 1.0) for l in L]
    F, U = _stitch(A, rect, R, n, ts, caps, rot, V, s_scale)
    mb.add(V, F, U, M)


def sweep(mb, A, rect, path, radii, n=6, M=None, up=None, caps=(True, True), rot=0.0, ts=None,
          closed=False):
    """Sweep an n-gon (rx along normal, ry along binormal) along a 3D polyline.
    closed=True joins the last ring to the first (torus-like loops)."""
    P = [Vector(p) for p in path]
    m = len(P)
    Tn = []
    for i in range(m):
        if closed:
            t = (P[(i + 1) % m] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        elif i == 0:
            t = P[1] - P[0]
        elif i == m - 1:
            t = P[-1] - P[-2]
        else:
            t = (P[i + 1] - P[i]).normalized() + (P[i] - P[i - 1]).normalized()
        Tn.append(t.normalized())
    frames = []
    if up is not None:
        up = Vector(up).normalized()
        for t in Tn:
            nrm = t.cross(up)
            if nrm.length < 1e-6:
                nrm = t.orthogonal()
            nrm.normalize()
            frames.append((nrm, t.cross(nrm).normalized()))
    else:
        nrm = Tn[0].orthogonal().normalized()
        for i, t in enumerate(Tn):
            if i > 0:
                q = Tn[i - 1].rotation_difference(t)
                nrm = (q @ nrm)
                nrm = (nrm - t * nrm.dot(t)).normalized()
            frames.append((nrm, t.cross(nrm).normalized()))
    V, R = [], []
    for i in range(m):
        r = radii[i]
        rx, ry = (r, r) if not isinstance(r, (tuple, list)) else r
        if rx < 1e-7 and ry < 1e-7:
            R.append([len(V)])
            V.append(tuple(P[i]))
            continue
        nrm, bn = frames[i]
        idx = []
        for k in range(n):
            a = rot + 2 * math.pi * k / n
            p = P[i] + nrm * (rx * math.cos(a)) + bn * (ry * math.sin(a))
            idx.append(len(V))
            V.append(tuple(p))
        R.append(idx)
    if ts is None:
        L = [0.0]
        for i in range(1, m):
            L.append(L[-1] + (P[i] - P[i - 1]).length)
        if closed:
            L.append(L[-1] + (P[0] - P[-1]).length)
        ts = [l / (L[-1] or 1.0) for l in L]
    if closed:
        R = R + [R[0]]
        caps = (False, False)
    F, U = _stitch(A, rect, R, n, ts, caps, rot, V)
    mb.add(V, F, U, M)


def _mm(c, rotm, M):
    MM = T(*c)
    if rotm is not None:
        MM = MM @ rotm
    if M is not None:
        MM = M @ MM
    return MM


def box(mb, A, rect, c, s, M=None, top=(1.0, 1.0), top_off=(0.0, 0.0), rotm=None):
    """Box (optionally tapered) centred at c with full size s, built along Z."""
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    k = math.sqrt(2)
    rings = [(-hz, hx * k, hy * k), (hz, hx * k * top[0], hy * k * top[1], top_off[0], top_off[1])]
    MM = _mm(c, rotm, None)
    if M is not None:
        MM = M @ MM
    cyl(mb, A, rect, rings, n=4, M=MM, rot=math.pi / 4)


def gem(mb, A, rect, c, r, ht, hb, n=6, M=None, rot=0.0, ry=None, rotm=None):
    MM = _mm(c, rotm, M)
    cyl(mb, A, rect, [(-hb, 0), (0, r, ry if ry else r), (ht, 0)], n=n, M=MM, rot=rot)


def orb(mb, A, rect, c, r, n=8, rings=5, M=None, squash=1.0, rotm=None):
    rr = []
    for i in range(rings + 1):
        th = math.pi * i / rings
        rr.append((-r * math.cos(th) * squash, r * math.sin(th) if 0 < i < rings else 0.0))
    MM = _mm(c, rotm, M)
    cyl(mb, A, rect, rr, n=n, M=MM, rot=math.pi / n)


def spike(mb, A, rect, base, tip, r, n=4, rot=0.0):
    sweep(mb, A, rect, [base, tip], [r, 0.0], n=n, rot=rot)


def blade(mb, A, rect, st, M=None, pad=0.5, bb=None):
    """Diamond-section blade. st: list of (z, xl, xr, xc, t) bottom->top;
    xl==xr makes a single tip vertex.  Planar (x,z) UVs onto rect.
    Returns (outline_px, ridge_px, proj)."""
    xs_ = [s[1] for s in st] + [s[2] for s in st]
    zs = [s[0] for s in st]
    if bb is None:
        bb = (min(xs_), max(xs_), min(zs), max(zs))
    proj = make_proj(rect, bb, pad)
    V, R = [], []
    for (z, xl, xr, xc, t) in st:
        if xr - xl < 1e-6:
            R.append([len(V)])
            V.append((xc, 0.0, z))
        else:
            b = len(V)
            V += [(xl, 0.0, z), (xc, -t, z), (xr, 0.0, z), (xc, t, z)]
            R.append([b, b + 1, b + 2, b + 3])
    F = []
    for i in range(len(R) - 1):
        a, b = R[i], R[i + 1]
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(4):
            k2 = (k + 1) % 4
            if len(b) == 1:
                F.append((a[k], a[k2], b[0]))
            elif len(a) == 1:
                F.append((a[0], b[k2], b[k]))
            else:
                F.append((a[k], a[k2], b[k2], b[k]))
    if len(R[0]) == 4:
        F.append(tuple(reversed(R[0])))
    if len(R[-1]) == 4:
        F.append(tuple(R[-1]))
    U = [[A.uv(rect, *proj(V[i][0], V[i][2])) for i in f] for f in F]
    mb.add(V, F, U, M)
    outline = [proj(s[1], s[0]) for s in st] + [proj(s[2], s[0]) for s in reversed(st)]
    ridge = [proj(s[3], s[0]) for s in st]
    return outline, ridge, proj


def _signed_area(pts):
    a = 0.0
    for i in range(len(pts)):
        x1, z1 = pts[i]
        x2, z2 = pts[(i + 1) % len(pts)]
        a += x1 * z2 - x2 * z1
    return a / 2


def inset_poly(pts, d, clamp=2.5):
    """Miter offset of a CCW polygon towards its inside.  d: scalar, list or
    callable(x, z) giving a per-vertex inset distance."""
    n = len(pts)
    out = []
    dl = [d(*p) for p in pts] if callable(d) else (list(d) if isinstance(d, (list, tuple)) else [d] * n)
    for i in range(n):
        d = dl[i]
        p0 = Vector(pts[i - 1])
        p1 = Vector(pts[i])
        p2 = Vector(pts[(i + 1) % n])
        e1 = (p1 - p0).normalized()
        e2 = (p2 - p1).normalized()
        n1 = Vector((-e1.y, e1.x))
        n2 = Vector((-e2.y, e2.x))
        bis = (n1 + n2)
        if bis.length < 1e-6:
            bis = n1
        bis.normalize()
        cosv = max(bis.dot(n1), 1.0 / clamp)
        out.append(tuple(p1 + bis * (d / cosv)))
    return out


def slab(mb, A, rect, outline, t=0.03, te=None, inner=None, M=None, side_rect=None, pad=0.5,
         bb=None, y0=0.0, deform=None, fan=None, back_rect=None):
    """Flat plate in the XZ plane (thickness along Y), faceted bevel optional.
      outline: [(x,z)...] simple polygon.
      t: half thickness of the inner face; te: half thickness at the outline
         (scalar, list or callable(x,z)); inner: None | ('scale', cx, cz, k) |
         ('offset', d) | explicit list.  fan: (cx, cz, t_center) -> inner face
         replaced by a triangle fan to a raised centre (domes, shields).
    Returns dict(outline=px, inner=px or None, proj)."""
    pts = [tuple(p) for p in outline]
    n = len(pts)
    if callable(te):
        tel = [te(x, z) for x, z in pts]
    elif isinstance(te, (list, tuple)):
        tel = list(te)
    elif te is None:
        tel = [t] * n
    else:
        tel = [te] * n
    if _signed_area(pts) < 0:
        pts = pts[::-1]
        tel = tel[::-1]
    if inner is None:
        inn = None
    elif isinstance(inner, tuple) and inner and inner[0] == 'scale':
        _, cx, cz, k = inner
        inn = [(cx + (x - cx) * k, cz + (z - cz) * k) for x, z in pts]
    elif isinstance(inner, tuple) and inner and inner[0] == 'offset':
        inn = inset_poly(pts, inner[1])
    else:
        inn = [tuple(p) for p in inner]
        if _signed_area(inn) < 0:
            inn = inn[::-1]
        if len(inn) != n:
            raise ValueError('inner polygon must match outline vertex count')
    if bb is None:
        xs_ = [p[0] for p in pts]
        zs_ = [p[1] for p in pts]
        bb = (min(xs_), max(xs_), min(zs_), max(zs_))
    proj = make_proj(rect, bb, pad)
    bproj = make_proj(back_rect, bb, pad) if back_rect is not None else None
    V, F, U = [], [], []
    uvs_of = {}

    def addv(x, y, z, uvkey):
        V.append((x, y, z))
        uvs_of[len(V) - 1] = uvkey
        return len(V) - 1
    of, ob = [], []
    for (x, z), e in zip(pts, tel):
        i = addv(x, y0 - e, z, ('p', x, z))
        of.append(i)
        ob.append(i if e < 1e-5 else addv(x, y0 + e, z, ('b', x, z)))
    if inn is not None:
        inf_ = [addv(x, y0 - t, z, ('p', x, z)) for x, z in inn]
        inb_ = [addv(x, y0 + t, z, ('b', x, z)) for x, z in inn]
        for i in range(n):
            j = (i + 1) % n
            F.append((of[i], of[j], inf_[j], inf_[i]))
            F.append((ob[j], ob[i], inb_[i], inb_[j]))
        front_ring, back_ring = inf_, inb_
    else:
        front_ring, back_ring = of, ob
    if fan is not None:
        cx, cz, tc = fan
        cf = addv(cx, y0 - tc, cz, ('p', cx, cz))
        cb = addv(cx, y0 + tc * 0.4, cz, ('b', cx, cz))
        for i in range(n):
            j = (i + 1) % n
            F.append((front_ring[j], front_ring[i], cf))
            F.append((back_ring[i], back_ring[j], cb))
    else:
        F.append(tuple(reversed(front_ring)))
        F.append(tuple(back_ring))
    # sides
    per = [0.0]
    for i in range(n):
        per.append(per[-1] + math.dist(pts[i], pts[(i + 1) % n]))
    side_faces = []
    for i in range(n):
        j = (i + 1) % n
        a, b, c, d = of[i], of[j], ob[j], ob[i]
        if a == d and b == c:
            continue
        if a == d:
            side_faces.append(((a, b, c), (0, 1, 1), (0, 0, 1), i))
        elif b == c:
            side_faces.append(((a, b, d), (0, 1, 0), (0, 0, 1), i))
        else:
            side_faces.append(((a, b, c, d), (0, 1, 1, 0), (0, 0, 1, 1), i))
    def fuv(v):
        k, x, z = uvs_of[v]
        if k == 'b' and bproj is not None:
            return A.uv(back_rect, *bproj(x, z))
        return A.uv(rect, *proj(x, z))
    for f in F:
        U.append([fuv(v) for v in f])
    for f, send, tside, i in side_faces:
        F.append(f)
        if side_rect is not None:
            s0, s1 = per[i] / per[-1], per[i + 1] / per[-1]
            U.append([A.uvn(side_rect, s1 if e else s0, float(tt)) for e, tt in zip(send, tside)])
        else:
            U.append([fuv(v) for v in f])
    if deform is not None:
        V = [deform(*v) for v in V]
    mb.add(V, F, U, M)
    res = dict(outline=[proj(x, z) for x, z in pts], proj=proj, pts=pts,
               inner=[proj(x, z) for x, z in inn] if inn is not None else None)
    if bproj is not None:
        res['back'] = dict(outline=[bproj(x, z) for x, z in pts],
                           inner=[bproj(x, z) for x, z in inn] if inn is not None else None)
    return res


def mirror_x(half, center_first=True):
    """Build a symmetric outline from the right half given bottom->top
    (x>=0 points); returns CCW polygon."""
    right = list(half)
    left = [(-x, z) for x, z in reversed(right) if abs(x) > 1e-9]
    if abs(right[0][0]) < 1e-9 and abs(right[-1][0]) < 1e-9:
        left = [(-x, z) for x, z in reversed(right[1:-1])]
    return right + left


def circle_pts(cx, cz, r, n, a0=0.0, rz=None):
    rz = r if rz is None else rz
    return [(cx + r * math.cos(a0 + 2 * math.pi * k / n), cz + rz * math.sin(a0 + 2 * math.pi * k / n))
            for k in range(n)]


def arc_pts(cx, cz, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / (n - 1))),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * k / (n - 1)))) for k in range(n)]


# --------------------------------------------------------------------------
# registry / export
# --------------------------------------------------------------------------

REG = {}


def asset(aid, name, use, attach='grip at origin, head/blade +Z (glTF +Y)', atlas=(64, 64),
          kind='1h', emissive='', fit=None):
    """fit: uniformly scale the finished mesh about the origin so its Z extent equals fit."""
    def deco(fn):
        REG[aid] = dict(fn=fn, id=aid, name=name, use=use, attach=attach, atlas=atlas, kind=kind,
                        emissive=emissive, fit=fit)
        return fn
    return deco


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _make_image(name, arr):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'PNG'
    try:
        img.pack()
    except Exception:
        pass
    return img


def build_object(aid, mb, A, emit_strength=2.0, max_colours=16):
    if max_colours:
        reduce_palette(A, max_colours)
    me = bpy.data.meshes.new(aid)
    me.from_pydata(mb.V, [], mb.F)
    uvl = me.uv_layers.new(name='UVMap')
    flat = np.array([c for f in mb.UV for uv in f for c in uv], np.float32)
    uvl.data.foreach_set('uv', flat)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    obj = bpy.data.objects.new(aid, me)
    bpy.context.scene.collection.objects.link(obj)

    mat = bpy.data.materials.new(aid + '_mat')
    try:
        mat.use_nodes = True
    except Exception:
        pass
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    img = _make_image(aid + '_col', A.col)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Closest'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Metallic'].default_value = 0.0
    if A.has_emit():
        eimg = _make_image(aid + '_emit', A.emit)
        et = nt.nodes.new('ShaderNodeTexImage')
        et.image = eimg
        et.interpolation = 'Closest'
        et.location = (-300, -300)
        nt.links.new(et.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    mat.use_backface_culling = True
    me.materials.append(mat)
    return obj


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_materials='EXPORT', export_image_format='AUTO', export_animations=False,
        export_cameras=False, export_lights=False, export_extras=False,
        export_texcoords=True, export_normals=True, use_selection=False)


def reduce_palette(A, n=16):
    """Merge the closest colours until the atlas uses at most n colours
    (PSX 4-bit CLUT spirit).  Surviving colours stay exact (no averaging)."""
    flat = np.round(A.col.reshape(-1, 3) * 255).astype(int)
    cols, inv, counts = np.unique(flat, axis=0, return_inverse=True, return_counts=True)
    inv = inv.reshape(-1)
    m = len(cols)
    if m <= n:
        return m
    c = cols.astype(float)
    cnt = counts.astype(float)
    wt = np.array([2.0, 4.0, 3.0])
    alive = list(range(m))
    target = np.arange(m)
    while len(alive) > n:
        ca = c[alive]
        d = (((ca[:, None, :] - ca[None, :, :]) ** 2) * wt).sum(-1)
        np.fill_diagonal(d, 1e18)
        i, j = np.unravel_index(np.argmin(d), d.shape)
        a, b = alive[i], alive[j]
        keep, drop = (a, b) if cnt[a] >= cnt[b] else (b, a)
        cnt[keep] += cnt[drop]
        target[target == drop] = keep
        alive.remove(drop)
    A.col = (c[target[inv]] / 255.0).reshape(A.col.shape)
    return n


def palette_count(A):
    c = np.round(np.concatenate([A.col.reshape(-1, 3)]) * 255).astype(int)
    return len(np.unique(c, axis=0))
