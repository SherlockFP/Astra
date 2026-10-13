"""psx_lib.py - shared helpers for EFSUN ONLINE PSX-style prop generation.

Runs inside headless Blender 5.2 (bpy + numpy). Provides:
  * tiny procedural pixel textures (numpy, limited palettes, ordered dither, outlines)
  * low-poly mesh primitives ("Parts") with per-part material + UV projection mode
  * material / object / empty builders, vertex-colour AO (COLOR_0)
  * GLB export + manifest bookkeeping

Conventions (scale contract): 1 BU = 1 game unit, Blender Z-up (exported +Y up),
models face -Y in Blender (= +Z forward in three.js), origin at bottom centre.
"""
import bpy, bmesh, math, colorsys, json, os, sys
import numpy as np
from mathutils import Vector, Matrix, Euler

TAU = math.tau

# =====================================================================
# colour / palette
# =====================================================================

def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def _hue_toward(h, target, amt):
    d = ((target - h + 0.5) % 1.0) - 0.5
    return (h + d * amt) % 1.0


def ramp(col, n=5, lo=0.38, hi=1.25, hue=0.10, sat_dark=1.12, sat_light=0.78):
    """Pixel-art colour ramp dark->light with hue shifting (cool shadows, warm highlights)."""
    r, g, b = hexrgb(col) if isinstance(col, str) else col
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    out = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.5
        vv = v * (lo + (hi - lo) * t)
        ss = s * (sat_dark + (sat_light - sat_dark) * t)
        if t < 0.5:
            hh = _hue_toward(h, 0.70, hue * (0.5 - t) * 2)
        else:
            hh = _hue_toward(h, 0.13, hue * (t - 0.5) * 2)
        if vv > 1.0:
            ss *= max(0.0, 1.0 - (vv - 1.0) * 1.6)
            vv = 1.0
        out.append(colorsys.hsv_to_rgb(hh, min(1, max(0, ss)), min(1, max(0, vv))))
    return np.round(np.array(out) * 255) / 255


def pal_join(*pals):
    return np.concatenate(pals, 0)


# =====================================================================
# noise / dither helpers (all tileable)
# =====================================================================
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16.0


def vnoise(h, w, cy, cx, seed=0, octaves=3, pers=0.5):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        cyo, cxo = max(1, int(cy * 2 ** o)), max(1, int(cx * 2 ** o))
        if cyo > h or cxo > w:
            break
        g = rng.random((cyo, cxo))
        ys = np.arange(h) * cyo / h
        xs = np.arange(w) * cxo / w
        y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
        fy = ys - y0; fx = xs - x0
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % cyo; x1 = (x0 + 1) % cxo
        a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x1)]
        c = g[np.ix_(y1, x0)]; d = g[np.ix_(y1, x1)]
        fy = fy[:, None]; fx = fx[None, :]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= pers
    return out / max(tot, 1e-9)


def norm01(a):
    lo, hi = a.min(), a.max()
    return (a - lo) / (hi - lo + 1e-9)


def voronoi(h, w, npts, seed=0):
    """Tileable voronoi. Returns d1, d2, cell index, dy, dx (offset from nearest centre)."""
    rng = np.random.default_rng(seed)
    pts = rng.random((npts, 2)) * [h, w]
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    d1 = np.full((h, w), 1e9); d2 = np.full((h, w), 1e9)
    ci = np.zeros((h, w), int); ry = np.zeros((h, w)); rx = np.zeros((h, w))
    for i, (py, px) in enumerate(pts):
        dy = yy - py; dy = (dy + h / 2) % h - h / 2
        dx = xx - px; dx = (dx + w / 2) % w - w / 2
        d = np.sqrt(dy * dy + dx * dx)
        closer = d < d1
        d2 = np.where(closer, d1, np.minimum(d2, d))
        ci = np.where(closer, i, ci)
        ry = np.where(closer, dy, ry); rx = np.where(closer, dx, rx)
        d1 = np.where(closer, d, d1)
    return d1, d2, ci, ry, rx


def dq(v, n, amt=0.6):
    """Quantise 0..1 field to n palette indices with 4x4 Bayer ordered dither."""
    h, w = v.shape
    b = np.tile(BAYER4, (h // 4 + 1, w // 4 + 1))[:h, :w] - 0.5
    return np.clip(np.floor(np.clip(v, 0, 1) * (n - 1) + 0.5 + b * amt), 0, n - 1).astype(int)


def grid(h, w):
    y, x = np.mgrid[0:h, 0:w]
    return y, x


def line_pts(x0, y0, x1, y1):
    pts = []
    dx = abs(x1 - x0); dy = -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1; sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        pts.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x0 += sx
        if e2 <= dx:
            err += dx; y0 += sy
    return pts


def dilate(m):
    o = m.copy()
    o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]
    return o


def ascii_mask(rows):
    return np.array([[c == '#' for c in r] for r in rows], bool)


def upscale(m, k):
    return np.kron(m, np.ones((k, k), m.dtype)).astype(m.dtype)

# =====================================================================
# pixel textures (return float RGB (h,w,3); some also alpha / emission)
# =====================================================================

def t_flat(pal, size=16, seed=0, amt=0.35):
    v = 0.5 + (vnoise(size, size, 4, 4, seed, 3) - 0.5) * amt * 2
    return pal[dq(v, len(pal))]


def t_planks(pal, size=32, planks=4, seed=0, horizontal=False, nails=False, ends=True,
             knots=2, gap=True, var=0.13):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    pw = w // planks
    y, x = grid(h, w)
    gr = vnoise(h, w, 1, w // 2, seed, 2)
    v = 0.52 + (gr - 0.5) * 0.6 + rng.uniform(-var, var, planks + 1)[x // pw]
    idx = dq(v, n)
    for k in range(knots):
        ky, kx = rng.integers(0, h), rng.integers(0, w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    idx[ky, kx] = 0
                elif abs(dy) + abs(dx) == 1:
                    idx[(ky + dy) % h, (kx + dx) % w] = max(1, idx[(ky + dy) % h, (kx + dx) % w] - 1)
    lx = x % pw
    if ends:
        for p in range(planks):
            ye = int(rng.integers(0, h))
            cols = slice(p * pw, (p + 1) * pw)
            idx[ye, cols] = 0
            idx[(ye + 1) % h, cols] = np.minimum(idx[(ye + 1) % h, cols] + 1, n - 1)
            if nails:
                cx = p * pw + pw // 2
                for yy in ((ye + 3) % h, (ye - 2) % h):
                    idx[yy, cx] = n - 1
                    idx[(yy + 1) % h, cx] = 0
    if gap:
        idx[lx == 0] = 0
        idx[lx == 1] = np.minimum(idx[lx == 1] + 1, n - 1)
    rgb = pal[idx]
    return rgb.transpose(1, 0, 2).copy() if horizontal else rgb


def t_bark(pal, size=32, seed=0):
    n = len(pal); h = w = size
    v = vnoise(h, w, 2, 10, seed, 3)
    v2 = vnoise(h, w, 1, 6, seed + 1, 2)
    v = 0.25 + norm01(v) * 0.7 + (v2 - 0.5) * 0.2
    idx = dq(v, n)
    idx[norm01(v) < 0.22] = 0
    return pal[idx]


def t_endgrain(pal, size=16, seed=0):
    n = len(pal); h = w = size
    y, x = grid(h, w)
    c = (size - 1) / 2
    r = np.sqrt((x - c) ** 2 + (y - c) ** 2) / (size / 2)
    nz = vnoise(h, w, 3, 3, seed, 2)
    ring = (np.sin((r + nz * 0.15) * 22) * 0.5 + 0.5)
    v = 0.55 + ring * 0.3 - r * 0.2
    idx = dq(v, n)
    idx[r > 0.86] = 0
    idx[(r > 0.76) & (r <= 0.86)] = 1
    return pal[idx]


def t_bricks(pal, size=32, rows=4, cols=2, seed=0, rough=0.22, var=0.12, chips=6):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    rh = h // rows; cw = w // cols
    y, x = grid(h, w)
    row = y // rh
    xs = (x + (row % 2) * (cw // 2)) % w
    col = xs // cw
    lx = xs % cw; ly = y % rh
    shade = rng.uniform(-var, var, (rows + 1, cols + 1))[row, col]
    v = 0.55 + (vnoise(h, w, 4, 4, seed, 3) - 0.5) * rough * 2 + shade
    idx = dq(v, n)
    hi = (ly == 1) | (lx == 1)
    sh = (ly == rh - 1) | (lx == cw - 1)
    idx[hi] = np.minimum(idx[hi] + 1, n - 1)
    idx[sh] = np.maximum(idx[sh] - 1, 1)
    for k in range(chips):
        cy, cx = rng.integers(0, h), rng.integers(0, w)
        idx[cy, cx] = 1
    idx[(ly == 0) | (lx == 0)] = 0
    return pal[idx]


def t_rock(pal, size=32, cells=7, seed=0, crack=0.9, light=0.35, moss=None, moss_amt=0.0):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    d1, d2, ci, ry, rx = voronoi(h, w, cells, seed)
    nz = vnoise(h, w, 6, 6, seed + 7, 3)
    cs = size / math.sqrt(cells)
    v = 0.52 + (nz - 0.5) * 0.45 + rng.uniform(-0.12, 0.12, cells)[ci] - (ry + rx) / cs * light
    e = d2 - d1
    idx = dq(v, n)
    idx[e < crack + 1.1] = np.maximum(idx[e < crack + 1.1] - 1, 0)
    idx[e < crack] = 0
    rgb = pal[idx]
    if moss is not None and moss_amt > 0:
        m = vnoise(h, w, 3, 3, seed + 3, 3)
        mask = (m + (-ry / cs) * 0.25) > (1 - moss_amt)
        mv = dq(0.3 + vnoise(h, w, 8, 8, seed + 9, 2) * 0.7, len(moss))
        rgb[mask] = moss[mv][mask]
    return rgb


def t_stone(pal, size=32, seed=0, cracks=3, amt=0.3):
    """smooth sculpted stone (statues, sarcophagi, pillars)"""
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    v = 0.55 + (vnoise(h, w, 3, 3, seed, 4) - 0.5) * amt * 2
    idx = dq(v, n)
    for k in range(cracks):
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        for s in range(int(rng.integers(4, 9))):
            idx[y % h, x % w] = 0
            if (y + 1) < h:
                idx[(y + 1) % h, x % w] = max(1, idx[(y + 1) % h, x % w])
            x += int(rng.integers(-1, 2)); y += 1
    for k in range(5):
        y, x = rng.integers(0, h), rng.integers(0, w)
        idx[y, x] = n - 1
    return pal[idx]


def t_metal(pal, size=32, seed=0, border=True, rivets=True, scratches=5, sparkle=0, grad=0.12):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    y, x = grid(h, w)
    v = 0.48 + (vnoise(h, w, 1, 8, seed, 2) - 0.5) * 0.35 + (0.5 - y / h) * grad * 2
    idx = dq(v, n)
    for k in range(scratches):
        x0, y0 = int(rng.integers(2, w - 2)), int(rng.integers(2, h - 2))
        L = int(rng.integers(2, 6)); d = int(rng.choice([-1, 1]))
        for i in range(L):
            idx[(y0 + i) % h, (x0 + d * i) % w] = n - 1 if i == 0 else max(n - 2, 1)
    for k in range(sparkle):
        sy, sx = int(rng.integers(1, h - 1)), int(rng.integers(1, w - 1))
        idx[sy, sx] = n - 1
        idx[sy - 1, sx] = max(idx[sy - 1, sx], n - 2); idx[sy + 1, sx] = max(idx[sy + 1, sx], n - 2)
        idx[sy, sx - 1] = max(idx[sy, sx - 1], n - 2); idx[sy, sx + 1] = max(idx[sy, sx + 1], n - 2)
    if border:
        idx[1, 1:-1] = n - 1; idx[1:-1, 1] = n - 1
        idx[-2, 1:-1] = 1; idx[1:-1, -2] = 1
        idx[0, :] = 0; idx[-1, :] = 0; idx[:, 0] = 0; idx[:, -1] = 0
    if rivets:
        for (ry_, rx_) in ((3, 3), (3, w - 4), (h - 4, 3), (h - 4, w - 4)):
            idx[ry_, rx_] = n - 1
            idx[ry_ + 1, rx_] = 0; idx[ry_, rx_ + 1] = 1
    return pal[idx]


def t_cloth(pal, size=32, seed=0, folds=2, stripes=0, pal2=None, trim=None, weave=True,
            vertical=True, h=None):
    n = len(pal); w = size; h = h or size
    y, x = grid(h, w)
    nz = vnoise(h, w, 2, 2, seed, 2)
    fold = np.sin((x / w) * TAU * folds + nz * 2.0) * 0.17
    v = 0.56 + fold + (vnoise(h, w, 4, 4, seed + 1, 2) - 0.5) * 0.18
    if weave:
        v = v + ((x + y) % 2) * 0.05 - 0.025
    idx = dq(v, n)
    rgb = pal[idx]
    if stripes and pal2 is not None:
        sw = max(1, w // (stripes * 2))
        m = (x // sw) % 2 == 1
        rgb[m] = pal2[np.clip(idx, 0, len(pal2) - 1)][m]
    if trim is not None:
        t = len(trim)
        tm = y >= h - 3
        tidx = np.clip(dq(0.6 + (vnoise(h, w, 2, 8, seed + 5, 1) - 0.5) * 0.4, t), 1, t - 1)
        tidx[y == h - 3] = t - 1
        tidx[y == h - 1] = 0
        rgb[tm] = trim[tidx][tm]
    return rgb if vertical else rgb.transpose(1, 0, 2).copy()


def t_leaves(pal, size=32, seed=0, count=70):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    idx = dq(0.1 + vnoise(h, w, 4, 4, seed, 2) * 0.35, n)
    shape = [(0, 0), (0, 1), (1, -1), (1, 0), (1, 1), (1, 2), (2, 0), (2, 1)]
    order = sorted([(int(rng.integers(0, h)), int(rng.integers(0, w))) for _ in range(count)])
    for (cy, cx) in order:
        lvl = int(np.clip(round(rng.normal((n - 1) * 0.62, 0.9)), 1, n - 1))
        for (dy, dx) in shape:
            idx[(cy + dy) % h, (cx + dx) % w] = lvl
        idx[cy % h, cx % w] = min(lvl + 1, n - 1)
        idx[(cy + 3) % h, (cx + 1) % w] = 0
        idx[(cy + 2) % h, (cx + 2) % w] = max(0, lvl - 2)
    return pal[idx]


def t_needles(pal, size=32, seed=0, count=46):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    idx = dq(0.1 + vnoise(h, w, 4, 4, seed, 2) * 0.3, n)
    for k in range(count):
        cy, cx = int(rng.integers(0, h)), int(rng.integers(0, w))
        lvl = int(np.clip(round(rng.normal((n - 1) * 0.6, 0.9)), 1, n - 1))
        for i in range(4):
            idx[(cy + i) % h, (cx - i) % w] = lvl if i else min(lvl + 1, n - 1)
            idx[(cy + i) % h, (cx + i) % w] = lvl if i else min(lvl + 1, n - 1)
        idx[(cy + 4) % h, cx % w] = 0
    return pal[idx]


def t_grass_card(pal, size=32, seed=0, blades=13, flowers=None, flower_chance=0.6, center=None):
    """RGBA alpha-cutout grass/flower card. flowers: list of 3-colour petal palettes."""
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    idx = -np.ones((h, w), int)
    fl = []
    for b in range(blades):
        x0 = int(rng.integers(3, w - 3))
        hgt = int(rng.integers(int(h * 0.45), h - 3))
        lean = rng.uniform(-0.45, 0.45) * hgt / h * 8
        for t in range(hgt):
            yy = h - 1 - t
            xx = int(round(x0 + lean * (t / hgt) ** 2))
            if 0 <= xx < w:
                lvl = 1 + int((n - 2) * t / hgt)
                idx[yy, xx] = lvl
                if t < hgt * 0.35 and xx + 1 < w:
                    idx[yy, xx + 1] = max(lvl - 1, 0)
        if flowers and rng.random() < flower_chance:
            fl.append((h - hgt, int(round(x0 + lean)), flowers[int(rng.integers(0, len(flowers)))]))
    rgb = np.zeros((h, w, 3)); a = (idx >= 0).astype(float)
    rgb[idx >= 0] = pal[idx[idx >= 0]]
    for (fy, fx, fp) in fl:
        for (dy, dx, k) in ((0, 0, 1), (-1, 0, 2), (1, 0, 0), (0, -1, 1), (0, 1, 1), (-1, -1, 2), (-1, 1, 1)):
            yy, xx = fy + dy, fx + dx
            if 0 <= yy < h and 0 <= xx < w:
                rgb[yy, xx] = fp[k]; a[yy, xx] = 1
        if center is not None and 0 <= fy < h and 0 <= fx < w:
            rgb[fy, fx] = center
    return rgb, a


def t_dirt(pal, size=32, seed=0, pebbles=7):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    idx = dq(0.45 + (vnoise(h, w, 5, 5, seed, 3) - 0.5) * 0.7, n)
    for k in range(pebbles):
        py, px = int(rng.integers(0, h)), int(rng.integers(0, w))
        idx[py, px] = n - 1; idx[py, (px + 1) % w] = n - 2
        idx[(py + 1) % h, px] = n - 2; idx[(py + 1) % h, (px + 1) % w] = 0
    return pal[idx]


def t_bone(pal, size=32, seed=0):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    v = 0.62 + (vnoise(h, w, 3, 3, seed, 3) - 0.5) * 0.5
    idx = dq(v, n)
    for k in range(4):
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        for s in range(int(rng.integers(3, 7))):
            idx[y % h, x % w] = 0
            x += int(rng.integers(-1, 2)); y += 1
    for k in range(10):
        idx[rng.integers(0, h), rng.integers(0, w)] = 1
    return pal[idx]


def t_crystal(pal, size=32, seed=0, streaks=True):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    y, x = grid(h, w)
    nz = vnoise(h, w, 2, 2, seed, 2)
    v = 0.18 + 0.82 * (1 - y / h) ** 0.8 + (nz - 0.5) * 0.2
    if streaks:
        s = ((x + y * 0.5 + nz * 7) % 9) < 1.3
        v = v + s * 0.28
    idx = dq(v, n)
    for k in range(6):
        sy, sx = int(rng.integers(0, h // 2)), int(rng.integers(0, w))
        idx[sy, sx] = n - 1
    idx[:, 0] = np.maximum(idx[:, 0] - 1, 0)
    return pal[idx]


def glyph_strokes(rng, gw=5, gh=7):
    nodes = [(0, 0), (gw - 1, 0), (0, gh // 2), (gw - 1, gh // 2), (0, gh - 1), (gw - 1, gh - 1),
             (gw // 2, 0), (gw // 2, gh - 1), (gw // 2, gh // 2)]
    sx = int(rng.integers(1, gw - 1))
    strokes = [((sx, 0), (sx, gh - 1))]
    for k in range(int(rng.integers(1, 4))):
        a = nodes[int(rng.integers(0, len(nodes)))]
        b = nodes[int(rng.integers(0, len(nodes)))]
        if abs(a[0] - b[0]) + abs(a[1] - b[1]) >= 3:
            strokes.append((a, b))
    return strokes


def rune_mask(h, w, seed=0, gw=5, gh=7, padx=1, pady=1, fill=1.0, rows=None):
    rng = np.random.default_rng(seed)
    m = np.zeros((h, w), bool)
    cw, chh = gw + padx * 2, gh + pady * 2
    ny = rows if rows else max(1, h // chh)
    nx = max(1, w // cw)
    oy = (h - ny * chh) // 2; ox = (w - nx * cw) // 2
    for j in range(ny):
        for i in range(nx):
            if rng.random() > fill:
                continue
            bx, by = ox + i * cw + padx, oy + j * chh + pady
            for (a, b) in glyph_strokes(rng, gw, gh):
                for (px, py) in line_pts(a[0], a[1], b[0], b[1]):
                    yy, xx = by + py, bx + px
                    if 0 <= yy < h and 0 <= xx < w:
                        m[yy, xx] = True
    return m


def carve(base_rgb, mask, glow, shadow, emit_scale=1.0, grad=True):
    """Carve glowing glyphs into base. glow: palette (dark->light) used for the glyph pixels."""
    h, w = mask.shape
    rgb = base_rgb.copy()
    sh = np.zeros_like(mask); sh[1:, 1:] = mask[:-1, :-1]
    sh &= ~mask
    rgb[sh] = shadow
    y, x = grid(h, w)
    gl = len(glow)
    if grad:
        gi = np.clip(dq(0.55 + 0.45 * (1 - y / h) + (vnoise(h, w, 2, 2, 3, 1) - 0.5) * 0.3, gl), 1, gl - 1)
    else:
        gi = np.full((h, w), gl - 1)
    rgb[mask] = glow[gi][mask]
    emit = np.zeros_like(rgb)
    emit[mask] = glow[gi][mask] * emit_scale
    return rgb, emit


def t_swirl(pal, size=64, seed=0, arms=3, twist=3.2, edge_dark=True):
    n = len(pal); h = w = size
    y, x = grid(h, w)
    c = (size - 1) / 2
    dx = (x - c) / (size / 2); dy = (y - c) / (size / 2)
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx)
    nz = vnoise(h, w, 4, 4, seed, 3)
    s = (a / TAU * arms + r * twist + nz * 0.5) % 1.0
    band = 0.5 + 0.5 * np.cos(s * TAU)
    v = band * 0.55 + (1 - np.clip(r, 0, 1)) ** 1.4 * 0.75 - 0.1
    if edge_dark:
        v = v - np.clip(r - 0.85, 0, 1) * 1.5
    idx = dq(v, n)
    return pal[idx]


def t_coals(dark, glow, size=32, seed=0, cells=11, hot=0.25):
    h = w = size
    rng = np.random.default_rng(seed)
    d1, d2, ci, ry, rx = voronoi(h, w, cells, seed)
    cs = size / math.sqrt(cells)
    nz = vnoise(h, w, 6, 6, seed + 1, 2)
    v = 0.35 + (nz - 0.5) * 0.4 - (ry + rx) / cs * 0.25
    rgb = dark[dq(v, len(dark))]
    e = d2 - d1
    gl = len(glow)
    gidx = np.full((h, w), -1)
    gidx[e < 1.9] = 0
    gidx[e < 1.2] = min(1, gl - 1)
    gidx[e < 0.6] = gl - 1
    hotcells = rng.random(cells) < hot
    hc = hotcells[ci] & (d1 < cs * 0.45)
    gidx[hc] = np.maximum(gidx[hc], dq(1 - d1 / (cs * 0.45), gl)[hc])
    emit = np.zeros_like(rgb)
    m = gidx >= 0
    rgb[m] = glow[gidx[m]]
    emit[m] = glow[gidx[m]]
    return rgb, emit


def t_flame_card(pal, size=32, seed=0, tongues=3):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    y, x = grid(h, w)
    inten = np.zeros((h, w))
    for k in range(tongues):
        cx = w / 2 + rng.uniform(-w * 0.22, w * 0.22)
        th = h * rng.uniform(0.55, 0.95)
        tw = w * rng.uniform(0.18, 0.3)
        t = (h - 1 - y) / th
        sway = np.sin(t * 3.5 + k * 2) * w * 0.05 * t
        width = tw * np.clip(np.sin(np.clip(t, 0, 1) * math.pi) ** 0.6 * (1 - t * 0.5), 0, None)
        d = np.abs(x - cx - sway) / np.maximum(width, 1e-3)
        f = np.clip(1 - d, 0, 1) * (t <= 1) * (t >= 0)
        inten = np.maximum(inten, f * (1.15 - t * 0.6))
    nz = vnoise(h, w, 4, 4, seed + 2, 2)
    inten = inten * (0.85 + nz * 0.3)
    a = (inten > 0.08).astype(float)
    idx = dq(np.clip(inten, 0, 1), n)
    idx = np.maximum(idx, 0)
    rgb = pal[idx]
    rgb[a == 0] = 0
    return rgb, a


def t_paper(pal, ink, size=32, seed=0, kind='notes', seal=None):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    y, x = grid(h, w)
    idx = dq(0.62 + (vnoise(h, w, 3, 3, seed, 2) - 0.5) * 0.5, n)
    idx[0, :] = 0; idx[-1, :] = 0; idx[:, 0] = 0; idx[:, -1] = 0
    rgb = pal[idx]
    if kind == 'wanted':
        skull = upscale(ascii_mask([
            '..####..',
            '.######.',
            '##.##.##',
            '########',
            '.######.',
            '..#.##..',
            '..####..']), 2)
        sh, sw = skull.shape
        oy, ox = 3, (w - sw) // 2
        sub = rgb[oy:oy + sh, ox:ox + sw]
        sub[skull] = ink[0]
        top_rows = range(oy + sh + 2, h - 3, 3)
    else:
        top_rows = range(3, h - 3, 3)
    for yy in top_rows:
        xx = 3
        while xx < w - 4:
            L = int(rng.integers(2, 7))
            for i in range(L):
                if xx + i < w - 3:
                    rgb[yy, xx + i] = ink[min(1, len(ink) - 1)]
            xx += L + int(rng.integers(1, 3))
    if seal is not None:
        cy, cx = h - 6, w - 7
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if dy * dy + dx * dx <= 5:
                    rgb[cy + dy, cx + dx] = seal[1] if dy * dy + dx * dx < 3 else seal[0]
    return rgb


def t_wheel(wood, iron, size=32, spokes=8):
    h = w = size
    y, x = grid(h, w)
    c = (size - 1) / 2
    dx, dy = (x - c) / (size / 2), (y - c) / (size / 2)
    r = np.sqrt(dx * dx + dy * dy)
    a = np.arctan2(dy, dx)
    nw, ni = len(wood), len(iron)
    nz = vnoise(h, w, 4, 4, 1, 2)
    rgb = np.zeros((h, w, 3)); rgb[:] = wood[0]
    seg = TAU / spokes
    sd = np.abs(((a / seg) + 0.5) % 1.0 - 0.5) * seg * r * size / 2
    sp = (sd < 1.3) & (r < 0.72)
    rgb[sp] = wood[dq(0.55 + (nz - 0.5) * 0.5, nw)][sp]
    fel = (r >= 0.66) & (r < 0.84)
    rgb[fel] = wood[dq(0.5 + (nz - 0.5) * 0.6, nw)][fel]
    rim = (r >= 0.84) & (r <= 1.02)
    lit = np.clip(0.5 - dy * 0.35, 0, 1)
    rgb[rim] = iron[dq(lit, ni)][rim]
    hub = r < 0.22
    rgb[hub] = iron[dq(0.55 - dy * 0.3, ni)][hub]
    rgb[r < 0.08] = iron[0]
    rgb[(r > 0.64) & (r < 0.68)] = wood[0]
    return rgb


def t_shingles(pal, size=32, rows=4, seed=0, tw=8, var=0.12):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    rh = h // rows
    y, x = grid(h, w)
    row = y // rh
    xs = (x + (row % 2) * (tw // 2)) % w
    lx = xs % tw; ly = y % rh
    tile = xs // tw
    shade = rng.uniform(-var, var, (rows + 1, w // tw + 1))[row, tile]
    v = 0.3 + (ly / rh) * 0.45 + shade + (vnoise(h, w, 4, 4, seed, 2) - 0.5) * 0.2
    idx = dq(v, n)
    idx[ly == rh - 1] = 0
    idx[lx == 0] = np.minimum(idx[lx == 0], 1)
    idx[(ly == rh - 2) & ((lx == 1) | (lx == tw - 1))] = 0
    idx[(ly == rh - 3) & (lx == tw // 2)] = n - 1
    return pal[idx]


def t_burlap(pal, size=32, seed=0, seam=False):
    n = len(pal); h = w = size
    y, x = grid(h, w)
    v = 0.52 + (vnoise(h, w, 3, 3, seed, 3) - 0.5) * 0.4
    v = v + ((x % 2) ^ (y % 2)) * 0.08 - 0.04
    v = v + ((y % 4) == 0) * -0.06
    idx = dq(v, n)
    if seam:
        idx[:, w // 2] = 0
        idx[::3, w // 2 + 1] = n - 1
    return pal[idx]


def t_straw(pal, size=32, seed=0, count=60):
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    idx = dq(0.3 + vnoise(h, w, 4, 4, seed, 2) * 0.3, n)
    for k in range(count):
        x0, y0 = int(rng.integers(0, w)), int(rng.integers(0, h))
        L = int(rng.integers(3, 9)); d = rng.uniform(-0.4, 0.4)
        lvl = int(rng.integers(1, n))
        for i in range(L):
            idx[(y0 + i) % h, int(x0 + d * i) % w] = lvl if i else min(lvl + 1, n - 1)
    return pal[idx]


def t_potion(glass, liquid, size=16, level=0.65):
    h = w = size
    y, x = grid(h, w)
    ng, nl = len(glass), len(liquid)
    rgb = glass[dq(0.4 + (1 - y / h) * 0.3, ng)]
    liq = y > h * (1 - level)
    rgb[liq] = liquid[dq(0.35 + (1 - (y / h)) * 0.6, nl)][liq]
    rgb[(y > h * (1 - level)) & (y <= h * (1 - level) + 1)] = liquid[-1]
    rgb[:, w // 4] = glass[-1]
    rgb[2:5, w // 4 + 1] = glass[-1]
    return rgb


def t_rope(pal, size=16):
    n = len(pal)
    y, x = grid(size, size)
    v = (((x + y) // 2) % 3) / 2.0
    idx = np.clip((v * (n - 1)).astype(int), 0, n - 1)
    return pal[idx]


def t_lock(pal, size=16, keyhole=True, dark=None):
    n = len(pal)
    rgb = t_metal(pal, size, seed=5, border=True, rivets=False, scratches=1)
    if keyhole:
        c = size // 2
        k = dark if dark is not None else pal[0]
        for (yy, xx) in ((c - 2, c), (c - 1, c), (c - 1, c - 1), (c - 2, c - 1), (c, c), (c, c - 1),
                         (c + 1, c), (c + 1, c - 1), (c + 2, c), (c + 2, c - 1)):
            rgb[yy, xx] = k
    return rgb


def t_banner(cloth, trim, emblem, emblem_col, h=64, w=32, seed=0):
    """Banner cloth with gold side/bottom trim and a pixel emblem (ascii mask) scaled x2."""
    rgb = t_cloth(cloth, w, seed, folds=2, weave=True, h=h)
    y, x = grid(h, w)
    nt = len(trim)
    side = (x < 2) | (x >= w - 2)
    rgb[side] = trim[np.where(x < 1, 0, nt - 1) if True else 0][side]
    rgb[x == 1] = trim[nt - 1]; rgb[x == w - 2] = trim[max(0, nt - 2)]
    rgb[x == 0] = trim[0]; rgb[x == w - 1] = trim[0]
    bot = y >= h - 4
    rgb[bot] = trim[np.clip(dq(np.full((h, w), 0.6), nt), 1, nt - 1)][bot]
    rgb[y == h - 4] = trim[nt - 1]; rgb[y == h - 1] = trim[0]
    top = y < 3
    rgb[top] = trim[1]; rgb[y == 2] = trim[0]
    m = upscale(emblem, 2)
    eh, ew = m.shape
    oy, ox = int(h * 0.38 - eh / 2), (w - ew) // 2
    full = np.zeros((h, w), bool); full[oy:oy + eh, ox:ox + ew] = m
    ol = dilate(full) & ~full
    rgb[ol] = trim[0]
    ne = len(emblem_col)
    ei = np.clip(dq(0.75 - (y - oy) / max(eh, 1) * 0.5, ne), 1, ne - 1)
    rgb[full] = emblem_col[ei][full]
    return rgb


def t_sign(wood, size=32, seed=0, rows=1, ink=None):
    rgb = t_planks(wood, size, planks=2, seed=seed, horizontal=True, ends=False, knots=1)
    m = rune_mask(size, size - 6, seed=seed + 11, gw=3, gh=5, padx=1, pady=1, rows=rows)
    full = np.zeros((size, size), bool); full[:, 3:size - 3] = m
    rgb[full] = ink if ink is not None else wood[0]
    rgb[0, :] = wood[0]; rgb[-1, :] = wood[0]; rgb[:, 0] = wood[0]; rgb[:, -1] = wood[0]
    return rgb


# =====================================================================
# mesh parts
# =====================================================================

def _rotm(rot):
    m = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix()
    return np.array(m)


class Part:
    """A piece of geometry in local coordinates with a 4x4 transform, a material key and a UV mode.

    uv modes: ('box', density[, (ou,ov)])  local box projection (scaled by part scale)
              ('wbox', density)            world box projection
              ('face', ru, rv)             each face fitted 0..1 (crate panels / outlines)
              ('cyl', density)             cylindrical around local Z (caps planar)
              ('polar', repeats)           discs / rings: u=angle, v=radius
              ('fit', 'xz'|'xy'|'yz')      whole part fitted 0..1 on two local axes
    """

    def __init__(self, verts, faces, mat, uv=('box', 1.0), closed=True, tint=1.0, uvs=None):
        self.v = np.asarray(verts, float).reshape(-1, 3)
        self.f = [tuple(int(i) for i in f) for f in faces]
        self.mat = mat
        self.uv = uv
        self.closed = closed
        self.tint = tint
        self.uvs = uvs
        self.M = np.eye(4)

    def T(self, loc=(0, 0, 0), rot=(0, 0, 0), scale=None):
        M = np.eye(4)
        S = np.eye(3)
        if scale is not None:
            if np.isscalar(scale):
                scale = (scale, scale, scale)
            S = np.diag(scale)
        M[:3, :3] = _rotm(rot) @ S
        M[:3, 3] = loc
        self.M = M @ self.M
        return self

    def Mx(self, m4):
        self.M = np.asarray(m4) @ self.M
        return self

    def copy(self):
        p = Part(self.v.copy(), list(self.f), self.mat, self.uv, self.closed, self.tint, self.uvs)
        p.M = self.M.copy()
        return p

    def world(self):
        return (self.M[:3, :3] @ self.v.T).T + self.M[:3, 3]

    def scale_factor(self):
        return abs(np.linalg.det(self.M[:3, :3])) ** (1 / 3)

    def ntris(self):
        return sum(len(f) - 2 for f in self.f)


def P_box(sx, sy, sz, mat, uv=('box', 1.0), z0=0.0, **kw):
    x, y = sx / 2, sy / 2
    v = [(-x, -y, z0), (x, -y, z0), (x, y, z0), (-x, y, z0),
         (-x, -y, z0 + sz), (x, -y, z0 + sz), (x, y, z0 + sz), (-x, y, z0 + sz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return Part(v, f, mat, uv, **kw)


def P_fbox(bx, by, tx, ty, h, mat, uv=('box', 1.0), z0=0.0, shift=(0, 0), bottom=True, **kw):
    """frustum box: bottom bx*by, top tx*ty (shifted)."""
    a, b = bx / 2, by / 2
    c, d = tx / 2, ty / 2
    sx, sy = shift
    v = [(-a, -b, z0), (a, -b, z0), (a, b, z0), (-a, b, z0),
         (-c + sx, -d + sy, z0 + h), (c + sx, -d + sy, z0 + h), (c + sx, d + sy, z0 + h), (-c + sx, d + sy, z0 + h)]
    f = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    if bottom:
        f.insert(0, (0, 3, 2, 1))
    return Part(v, f, mat, uv, **kw)


def P_lathe(profile, n, mat, uv=('cyl', 1.0), cap0=True, cap1=True, phase=0.0, jitter=0.0, seed=0,
            star=None, **kw):
    """profile: list of (r, z) or (r, z, ox, oy) bottom->top. r=0 -> pole vertex."""
    rng = np.random.default_rng(seed)
    verts, rings = [], []
    for p in profile:
        r, z = p[0], p[1]
        ox, oy = (p[2], p[3]) if len(p) > 2 else (0.0, 0.0)
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((ox, oy, z))
        else:
            ring = []
            for i in range(n):
                a = phase + TAU * i / n
                rr = r * (star[i % len(star)] if star else 1.0)
                if jitter:
                    rr *= 1 + rng.uniform(-jitter, jitter)
                jz = rng.uniform(-jitter, jitter) * r * 0.5 if jitter else 0.0
                ring.append(len(verts))
                verts.append((ox + rr * math.cos(a), oy + rr * math.sin(a), z + jz))
            rings.append(ring)
    faces = []
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) > 1 and len(B) > 1:
            for i in range(n):
                faces.append((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
        elif len(A) == 1 and len(B) > 1:
            for i in range(n):
                faces.append((A[0], B[(i + 1) % n], B[i]))
        elif len(B) == 1 and len(A) > 1:
            for i in range(n):
                faces.append((A[i], A[(i + 1) % n], B[0]))
    if cap0 and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
    if cap1 and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
    return Part(verts, faces, mat, uv, **kw)


def P_cyl(r, h, n, mat, uv=('cyl', 1.0), r2=None, z0=0.0, **kw):
    return P_lathe([(r, z0), (r if r2 is None else r2, z0 + h)], n, mat, uv, **kw)


def P_sphere(r, nu, nv, mat, uv=('cyl', 1.0), z0=None, **kw):
    zc = r if z0 is None else z0
    prof = [(0.0, zc - r)]
    for j in range(1, nv):
        th = math.pi * j / nv
        prof.append((r * math.sin(th), zc - r * math.cos(th)))
    prof.append((0.0, zc + r))
    return P_lathe(prof, nu, mat, uv, **kw)


def P_ico(r, sub, mat, uv=('box', 1.0), jitter=0.0, seed=0, squash=(1, 1, 1), flat_bottom=None, **kw):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    idx = {v: i for i, v in enumerate(bm.verts)}
    verts = np.array([v.co[:] for v in bm.verts])
    faces = [tuple(idx[v] for v in f.verts) for f in bm.faces]
    bm.free()
    rng = np.random.default_rng(seed)
    if jitter:
        verts = verts * (1 + rng.uniform(-jitter, jitter, (len(verts), 1)))
        verts = verts + rng.uniform(-jitter, jitter, verts.shape) * r * 0.3
    verts = verts * np.array(squash)
    if flat_bottom is not None:
        verts[:, 2] = np.maximum(verts[:, 2], flat_bottom)
    return Part(verts, faces, mat, uv, **kw)


def P_torus(R, r, nu, nv, mat, uv=('box', 1.0), phase_v=0.0, phase_u=0.0, **kw):
    verts, faces = [], []
    for i in range(nu):
        a = TAU * i / nu + phase_u
        for j in range(nv):
            b = TAU * j / nv + phase_v
            verts.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(nu):
        for j in range(nv):
            a0 = i * nv + j; a1 = ((i + 1) % nu) * nv + j
            b0 = i * nv + (j + 1) % nv; b1 = ((i + 1) % nu) * nv + (j + 1) % nv
            faces.append((a0, a1, b1, b0))
    return Part(verts, faces, mat, uv, **kw)


def P_grid(w, h, nx, ny, mat, uv=('fit', 'xz'), fn=None, closed=False, **kw):
    """vertical plane in XZ (facing -Y), bottom centre at origin. fn(u,v,x,z)->(dx,dy,dz)."""
    verts = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, z = -w / 2 + w * u, h * v
            d = fn(u, v, x, z) if fn else (0, 0, 0)
            verts.append((x + d[0], d[1], z + d[2]))
    faces = []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    return Part(verts, faces, mat, uv, closed=closed, **kw)


def P_disc(r, n, mat, uv=('polar', 1), z=0.0, r_in=0.0, phase=0.0, closed=False, **kw):
    """horizontal disc (r_in=0) or annulus, facing +Z."""
    verts, faces = [], []
    if r_in <= 0:
        verts = [(r * math.cos(phase + TAU * i / n), r * math.sin(phase + TAU * i / n), z) for i in range(n)]
        faces = [tuple(range(n))]
    else:
        for i in range(n):
            a = phase + TAU * i / n
            verts.append((r_in * math.cos(a), r_in * math.sin(a), z))
            verts.append((r * math.cos(a), r * math.sin(a), z))
        for i in range(n):
            a0, b0 = 2 * i, 2 * i + 1
            a1, b1 = 2 * ((i + 1) % n), 2 * ((i + 1) % n) + 1
            faces.append((a0, b0, b1, a1))
    return Part(verts, faces, mat, uv, closed=closed, **kw)


def P_prism(poly, t, mat, uv=('face', 1, 1), **kw):
    """extrude CCW polygon (x,z) (as seen from -Y) along Y with thickness t (centred)."""
    n = len(poly)
    verts = [(x, -t / 2, z) for (x, z) in poly] + [(x, t / 2, z) for (x, z) in poly]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, i + n, j + n, j))
    return Part(verts, faces, mat, uv, **kw)


def P_ring_band(r_out, r_in, h, n, mat, uv=('cyl', 1.0), z0=0.0, phase=0.0, **kw):
    """thick ring / tube wall (well wall, rims): outer wall, inner wall, top and bottom."""
    verts, faces = [], []
    for i in range(n):
        a = phase + TAU * i / n
        c, s = math.cos(a), math.sin(a)
        verts += [(r_out * c, r_out * s, z0), (r_out * c, r_out * s, z0 + h),
                  (r_in * c, r_in * s, z0), (r_in * c, r_in * s, z0 + h)]
    for i in range(n):
        j = (i + 1) % n
        o0, o1, i0, i1 = 4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3
        p0, p1, q0, q1 = 4 * j, 4 * j + 1, 4 * j + 2, 4 * j + 3
        faces.append((o0, p0, p1, o1))      # outer
        faces.append((q0, i0, i1, q1))      # inner
        faces.append((o1, p1, q1, i1))      # top
        faces.append((i0, q0, p0, o0))      # bottom
    return Part(verts, faces, mat, uv, **kw)


def align_m4(p0, p1):
    p0 = Vector(p0); p1 = Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    M = np.eye(4)
    M[:3, :3] = np.array(q.to_matrix())
    M[:3, 3] = p0[:]
    return M, d.length


def P_limb(p0, p1, r0, r1, n, mat, uv=('cyl', 1.0), cap0=False, cap1=True, jitter=0.0, seed=0, **kw):
    M, L = align_m4(p0, p1)
    p = P_lathe([(r0, 0.0), (r1, L)], n, mat, uv, cap0=cap0, cap1=cap1, jitter=jitter, seed=seed, **kw)
    p.M = M
    return p


def arc(cx, cz, r, a0, a1, steps):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
             cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


# =====================================================================
# Blender object / material building
# =====================================================================

def _newell(pts):
    n = np.zeros(3)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        n += [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]
    l = np.linalg.norm(n)
    return n / l if l > 1e-12 else np.array([0, 0, 1.0])


class UVCtx:
    def __init__(self, part):
        self.p = part
        self.L = part.v
        self.W = part.world()
        self.s = part.scale_factor()
        self.lo = self.L.min(0); self.hi = self.L.max(0)
        r = np.sqrt(self.L[:, 0] ** 2 + self.L[:, 1] ** 2)
        self.rmin, self.rmax = r.min(), r.max()


def face_uv(ctx, face):
    p = ctx.p
    mode = p.uv[0]
    L = ctx.L[list(face)]
    if mode in ('box', 'wbox'):
        d = p.uv[1]
        off = p.uv[2] if len(p.uv) > 2 else (0.0, 0.0)
        P = ctx.W[list(face)] if mode == 'wbox' else L * ctx.s
        n = _newell(P)
        ax = int(np.argmax(np.abs(n)))
        sg = 1.0 if n[ax] >= 0 else -1.0
        if ax == 2:
            u, v = P[:, 0] * sg, P[:, 1]
        elif ax == 0:
            u, v = P[:, 1] * sg, P[:, 2]
        else:
            u, v = -P[:, 0] * sg, P[:, 2]
        return np.stack([u * d + off[0], v * d + off[1]], 1)
    if mode == 'face':
        ru = p.uv[1] if len(p.uv) > 1 else 1
        rv = p.uv[2] if len(p.uv) > 2 else 1
        n = _newell(L)
        if abs(n[2]) > 0.7:
            U = np.array([1.0, 0, 0]) * (1 if n[2] > 0 else -1)
            V = np.array([0, 1.0, 0])
        else:
            U = np.cross([0, 0, 1.0], n); U /= np.linalg.norm(U)
            V = np.cross(n, U)
        u, v = L @ U, L @ V
        u = (u - u.min()) / max(u.max() - u.min(), 1e-9)
        v = (v - v.min()) / max(v.max() - v.min(), 1e-9)
        return np.stack([u * ru, v * rv], 1)
    if mode == 'cyl':
        d = p.uv[1]
        s = ctx.s
        n = _newell(L)
        if abs(n[2]) > 0.75:
            return np.stack([L[:, 0] * s * d * (1 if n[2] > 0 else -1), L[:, 1] * s * d], 1)
        ru = max(1, round(TAU * ctx.rmax * s * d))
        r = np.sqrt(L[:, 0] ** 2 + L[:, 1] ** 2)
        u = (np.arctan2(L[:, 1], L[:, 0]) / TAU + 0.5) * ru
        pole = r < 1e-6
        if pole.any() and (~pole).any():
            u[pole] = u[~pole].mean()
        if u.max() - u.min() > ru * 0.5:
            u[u < ru * 0.5] += ru
        return np.stack([u, L[:, 2] * s * d], 1)
    if mode == 'cylfit':  # u around local Z, v fitted over the part's local Z extent
        ru = p.uv[1] if len(p.uv) > 1 else 1
        r = np.sqrt(L[:, 0] ** 2 + L[:, 1] ** 2)
        u = (np.arctan2(L[:, 1], L[:, 0]) / TAU + 0.5) * ru
        pole = r < 1e-6
        if pole.any() and (~pole).any():
            u[pole] = u[~pole].mean()
        if u.max() - u.min() > ru * 0.5:
            u[u < ru * 0.5] += ru
        v = (L[:, 2] - ctx.lo[2]) / max(ctx.hi[2] - ctx.lo[2], 1e-9)
        return np.stack([u, v], 1)
    if mode == 'polar':
        ru = p.uv[1]
        r = np.sqrt(L[:, 0] ** 2 + L[:, 1] ** 2)
        u = (np.arctan2(L[:, 1], L[:, 0]) / TAU + 0.5) * ru
        if u.max() - u.min() > ru * 0.5:
            u[u < ru * 0.5] += ru
        v = (r - ctx.rmin) / max(ctx.rmax - ctx.rmin, 1e-9)
        return np.stack([u, v], 1)
    if mode == 'disc':  # planar fit of a disc onto 0..1 (round textures)
        rr = ctx.rmax
        return np.stack([L[:, 0] / rr * 0.5 + 0.5, L[:, 1] / rr * 0.5 + 0.5], 1)
    if mode == 'fit':
        axes = {'x': 0, 'y': 1, 'z': 2}
        a, b = axes[p.uv[1][0]], axes[p.uv[1][1]]
        u = (L[:, a] - ctx.lo[a]) / max(ctx.hi[a] - ctx.lo[a], 1e-9)
        v = (L[:, b] - ctx.lo[b]) / max(ctx.hi[b] - ctx.lo[b], 1e-9)
        if len(p.uv) > 2:
            ru, rv = p.uv[2]
            u, v = u * ru, v * rv
        return np.stack([u, v], 1)
    raise ValueError(mode)


def make_image(name, rgb, alpha=None):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha is not None)
    a = alpha if alpha is not None else np.ones((h, w))
    rgba = np.dstack([np.clip(rgb, 0, 1), a])[::-1]
    q = np.round(rgba * 255) / 255.0
    img.pixels.foreach_set(q.astype(np.float32).ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def _bsdf(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


class Ctx:
    """Collects materials / objects for one asset."""

    def __init__(self, aid):
        self.aid = aid
        self.mats = {}
        self.images = []
        self.objects = []
        self.anim = False
        self.alpha_imgs = []

    # ---------------- materials
    def mat(self, key, rgb=None, alpha=None, color=None, emit=None, emit_strength=2.0, double=False,
            rough=0.9):
        """rgb: texture array; emit: 'same' | array | colour tuple; alpha: mask array (cutout)."""
        m = bpy.data.materials.new(key)
        nt = m.node_tree
        b = _bsdf(m)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = 0.0
        tex = None
        if rgb is not None:
            img = make_image(f'{self.aid}_{key}', rgb, alpha)
            self.images.append((img, rgb, alpha))
            tex = nt.nodes.new('ShaderNodeTexImage')
            tex.image = img
            tex.interpolation = 'Closest'
            tex.location = (-500, 200)
            nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
            if alpha is not None:
                mth = nt.nodes.new('ShaderNodeMath')
                mth.operation = 'ROUND'
                mth.location = (-250, 0)
                nt.links.new(tex.outputs['Alpha'], mth.inputs[0])
                nt.links.new(mth.outputs[0], b.inputs['Alpha'])
                try:
                    m.surface_render_method = 'DITHERED'
                except Exception:
                    pass
        elif color is not None:
            b.inputs['Base Color'].default_value = (*srgb_to_lin(color), 1)
        if emit is not None:
            if isinstance(emit, str) and emit == 'same' and tex is not None:
                nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
            elif isinstance(emit, np.ndarray):
                eimg = make_image(f'{self.aid}_{key}_emit', emit)
                self.images.append((eimg, emit, None))
                et = nt.nodes.new('ShaderNodeTexImage')
                et.image = eimg
                et.interpolation = 'Closest'
                et.location = (-500, -200)
                nt.links.new(et.outputs['Color'], b.inputs['Emission Color'])
            else:
                b.inputs['Emission Color'].default_value = (*srgb_to_lin(emit), 1)
            b.inputs['Emission Strength'].default_value = emit_strength
        m.use_backface_culling = not double
        self.mats[key] = m
        return m

    # ---------------- objects
    def obj(self, name, parts, origin=(0, 0, 0), ao_h=0.8, ao_min=0.6, down=0.82, jit=0.05, seed=0,
            parent=None, ao=True):
        rng = np.random.default_rng(seed + len(self.objects) * 7)
        origin = np.asarray(origin, float)
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new('UVMap')
        keys = []
        faces_info = []
        for p in parts:
            if p.mat not in self.mats:
                raise KeyError(f'{self.aid}: material {p.mat} not defined')
            if p.mat not in keys:
                keys.append(p.mat)
            mi = keys.index(p.mat)
            uc = UVCtx(p)
            W = uc.W - origin
            bv = [bm.verts.new(co) for co in W]
            pf = []
            for fi, f in enumerate(p.f):
                if len(set(f)) < 3:
                    continue
                try:
                    face = bm.faces.new([bv[i] for i in f])
                except ValueError:
                    continue
                face.material_index = mi
                uv = p.uvs[fi] if p.uvs is not None else face_uv(uc, f)
                for loop, (u, v) in zip(face.loops, uv):
                    loop[uvl].uv = (float(u), float(v))
                pf.append(face)
            if p.closed and pf:
                vmap = {v: i for i, v in enumerate(bv)}
                before = [tuple(vmap[l.vert] for l in fc.loops) for fc in pf]
                bmesh.ops.recalc_face_normals(bm, faces=pf)
                for fc, b4 in zip(pf, before):
                    after = tuple(vmap[l.vert] for l in fc.loops)
                    if after != b4:  # flipped: recompute UVs in new loop order
                        uv = face_uv(uc, after)
                        for loop, (u, v) in zip(fc.loops, uv):
                            loop[uvl].uv = (float(u), float(v))
            faces_info.append((pf, p.tint))
        bm.normal_update()
        # vertex colour AO (corner domain); faces iterate in creation order
        tints = [t for pf, t in faces_info for _ in pf]
        order = []
        for fc, tint in zip(bm.faces, tints):
            j = 1.0 + rng.uniform(-jit, jit)
            dn = down if fc.normal.z < -0.4 else 1.0
            for l in fc.loops:
                z = l.vert.co.z + origin[2]
                g = min(1.0, max(0.0, z / ao_h)) if ao else 1.0
                a = (ao_min + (1 - ao_min) * g ** 0.7) if ao else 1.0
                order.append(min(1.0, a * dn * j * tint))
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for k in keys:
            mesh.materials.append(self.mats[k])
        ca = mesh.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        arr = np.repeat(np.array(order, np.float32), 4).reshape(-1, 4)
        arr[:, 3] = 1.0
        try:
            ca.data.foreach_set('color_srgb', arr.ravel())
        except Exception:
            ca.data.foreach_set('color', (arr ** 2.2).ravel())
        mesh.color_attributes.active_color = ca
        try:
            mesh.color_attributes.render_color_index = 0
        except Exception:
            pass
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = origin.tolist()
        if parent is not None:
            ob.parent = parent
            ob.location = (origin - np.array(parent.location)).tolist()
        self.objects.append(ob)
        return ob

    def empty(self, name, loc, parent=None):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'PLAIN_AXES'
        e.empty_display_size = 0.2
        bpy.context.scene.collection.objects.link(e)
        e.location = loc
        if parent is not None:
            e.parent = parent
            e.location = (np.array(loc) - np.array(parent.location)).tolist()
        self.objects.append(e)
        return e


def srgb_to_lin(c):
    c = np.asarray(c, float)
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


# =====================================================================
# scene / export
# =====================================================================

def clean_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions,
                 bpy.data.curves, bpy.data.cameras, bpy.data.lights, bpy.data.node_groups):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass


def export_glb(path, objs, anim=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_vertex_color='ACTIVE', export_animations=anim, export_image_format='AUTO',
              export_cameras=False, export_lights=False, export_extras=False)
    if anim:
        kw.update(export_animation_mode='ACTIONS', export_force_sampling=False)
    bpy.ops.export_scene.gltf(**kw)


def asset_stats(ctx):
    tris = 0
    mn = np.array([1e9] * 3); mx = -mn
    for ob in ctx.objects:
        if ob.type != 'MESH':
            continue
        me = ob.data
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        mw = np.array(ob.matrix_world)
        co = np.array([v.co[:] for v in me.vertices])
        if len(co):
            wco = (mw[:3, :3] @ co.T).T + mw[:3, 3]
            mn = np.minimum(mn, wco.min(0)); mx = np.maximum(mx, wco.max(0))
    cols = set()
    for img, rgb, a in ctx.images:
        if img.name.endswith('_emit'):
            continue
        q = np.round(np.clip(rgb, 0, 1) * 255).astype(int).reshape(-1, 3)
        if a is not None:
            q = q[a.ravel() > 0.5]
        cols |= set(map(tuple, q))
    size = (mx - mn)
    # glTF axes: W = X, H = Z(blender), D = Y(blender)
    return dict(tris=int(tris), size=[round(float(size[0]), 3), round(float(size[2]), 3), round(float(size[1]), 3)],
                min=[round(float(v), 3) for v in mn], max=[round(float(v), 3) for v in mx], colors=len(cols))


def finalize(ctx):
    """ctx.recenter: move all top-level objects so the mesh AABB is centred on X/Y.
    Unless ctx.hanging, clamp any vertex below the ground plane to z=0 (origin = ground contact)."""
    meshes = [o for o in ctx.objects if o.type == 'MESH']
    bpy.context.view_layer.update()  # objects were placed via .location: refresh matrix_world first
    if getattr(ctx, 'recenter', False) and meshes:
        pts = np.array([(o.matrix_world @ v.co)[:] for o in meshes for v in o.data.vertices])
        cx = (pts[:, 0].min() + pts[:, 0].max()) / 2
        cy = (pts[:, 1].min() + pts[:, 1].max()) / 2
        for o in ctx.objects:
            if o.parent is None:
                o.location.x -= cx
                o.location.y -= cy
        bpy.context.view_layer.update()
    if not getattr(ctx, 'hanging', False):
        for o in meshes:
            mw = o.matrix_world
            inv = mw.inverted()
            for v in o.data.vertices:
                w = mw @ v.co
                if w.z < 0.0:
                    w.z = 0.0
                    v.co = inv @ w
            o.data.update()


REGISTRY = {}


def asset(aid, name_tr, use, category, emissive='', attach='', anims=''):
    def deco(fn):
        REGISTRY[aid] = dict(fn=fn, id=aid, name_tr=name_tr, use=use, category=category, emissive=emissive,
                             attach=attach, anims=anims)
        return fn
    return deco


def run(ids, outdir, manifest_path):
    man = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r', encoding='utf-8') as fh:
            man = json.load(fh)
    for aid in ids:
        info = REGISTRY[aid]
        clean_scene()
        ctx = Ctx(aid)
        info['fn'](ctx)
        finalize(ctx)
        path = os.path.join(outdir, aid + '.glb')
        export_glb(path, ctx.objects, anim=ctx.anim)
        st = asset_stats(ctx)
        st['bytes'] = os.path.getsize(path)
        entry = {k: v for k, v in info.items() if k != 'fn'}
        entry.update(st)
        entry['objects'] = [o.name for o in ctx.objects]
        man[aid] = entry
        print(f'ASSET {aid:22s} tris={st["tris"]:5d} size={st["size"]} colors={st["colors"]} kb={st["bytes"]/1024:.1f}')
    with open(manifest_path, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, indent=1, ensure_ascii=False)
