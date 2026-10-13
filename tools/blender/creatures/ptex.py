"""Tiny procedural pixel textures (PSX look) built with numpy.

An Atlas is a small square texture (64x64 by default) split into 16px tiles.
Each creature paints a handful of named tiles (skin, belly, eye, glow...) and
the mesh builder maps every part's UVs into one tile, so one texture serves a
whole creature.  Pixel arrays use row 0 = bottom (Blender / UV convention) and
store sRGB values directly (8-bit images are written as-is).
"""
import numpy as np

BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) + 0.5) / 16.0 - 0.5


def C(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float) / 255.0


def R(*hexes):
    """Colour ramp dark -> light from hex strings."""
    return np.array([C(h) for h in hexes])


class Atlas:
    def __init__(self, size=64, tile=16, seed=7, bg='#101010'):
        self.size, self.tile = size, tile
        self.n = size // tile
        self.img = np.zeros((size, size, 4))
        self.img[..., :3] = C(bg)
        self.img[..., 3] = 1.0
        self.occ = np.zeros((self.n, self.n), bool)
        self.rects = {}
        self.rng = np.random.default_rng(seed)

    def alloc(self, name, w=1, h=1):
        for ty in range(self.n - h + 1):
            for tx in range(self.n - w + 1):
                if not self.occ[ty:ty + h, tx:tx + w].any():
                    self.occ[ty:ty + h, tx:tx + w] = True
                    self.rects[name] = (tx * self.tile, ty * self.tile, w * self.tile, h * self.tile)
                    return self.rects[name]
        raise RuntimeError('atlas full: ' + name)

    def uv_rect(self, name):
        x, y, w, h = self.rects[name]
        s = float(self.size)
        return ((x + 0.5) / s, (y + 0.5) / s, (x + w - 0.5) / s, (y + h - 0.5) / s)

    def paint(self, name, fn, w=1, h=1, **kw):
        x, y, W, H = self.alloc(name, w, h)
        iy, ix = np.mgrid[0:H, 0:W]
        ctx = dict(W=W, H=H, ix=ix, iy=iy, u=(ix + 0.5) / W, v=(iy + 0.5) / H, rng=self.rng)
        out = np.asarray(fn(ctx, **kw), float)
        if out.shape[-1] == 3:
            out = np.concatenate([out, np.ones(out.shape[:2] + (1,))], -1)
        self.img[y:y + H, x:x + W] = out
        return name

    def recolor(self, mapping):
        """Return a copy whose pixels are remapped colour-by-colour (palette swap)."""
        a = Atlas(self.size, self.tile)
        a.rects = dict(self.rects)
        a.occ = self.occ.copy()
        a.img = self.img.copy()
        for src, dst in mapping:
            m = np.all(np.abs(self.img[..., :3] - C(src)) < 1.5 / 255, -1)
            a.img[m, :3] = C(dst)
        return a


# ------------------------------------------------------------------ helpers
def quant(t, ramp, ctx, dither=1.0):
    n = len(ramp)
    x = np.clip(t, 0, 1) * (n - 1) + BAYER4[ctx['iy'] % 4, ctx['ix'] % 4] * dither
    return ramp[np.clip(np.rint(x), 0, n - 1).astype(int)]


def white(ctx):
    return ctx['rng'].random(ctx['u'].shape)


def lownoise(ctx, cells=3):
    rng = ctx['rng']
    g = rng.random((cells + 1, cells + 1))
    u, v = ctx['u'] * cells, ctx['v'] * cells
    i0 = np.clip(np.floor(u).astype(int), 0, cells - 1)
    j0 = np.clip(np.floor(v).astype(int), 0, cells - 1)
    fu, fv = u - i0, v - j0
    fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
    a, b = g[j0, i0], g[j0, i0 + 1]
    c, d = g[j0 + 1, i0], g[j0 + 1, i0 + 1]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def border(rgb, col, sides='lrtb', width=1):
    out = rgb.copy()
    w = width
    if 'l' in sides: out[:, :w] = col
    if 'r' in sides: out[:, -w:] = col
    if 'b' in sides: out[:w, :] = col
    if 't' in sides: out[-w:, :] = col
    return out


def field(ctx, lo=0.2, hi=0.85, noise=0.18, low=0.25, cells=3, axis='v'):
    g = ctx['v'] if axis == 'v' else ctx['u']
    return lo + (hi - lo) * g + (white(ctx) - 0.5) * noise + (lownoise(ctx, cells) - 0.5) * low


def disc(ctx, cx, cy, r, aspect=1.0):
    """Boolean mask of a disc in pixel coords (cx, cy, r in pixels)."""
    return ((ctx['ix'] - cx) ** 2 + ((ctx['iy'] - cy) / aspect) ** 2) <= r * r


# ------------------------------------------------------------------ patterns
def pat_base(ctx, ramp, lo=0.2, hi=0.85, noise=0.18, low=0.25, cells=3, outline='', hilite=False, axis='v'):
    rgb = quant(field(ctx, lo, hi, noise, low, cells, axis), ramp, ctx)
    if hilite:
        rgb[-2, :] = ramp[-1]
    if outline:
        rgb = border(rgb, ramp[0], outline)
    return rgb


def pat_solid(ctx, ramp, t=0.5, noise=0.2):
    return quant(t + (white(ctx) - 0.5) * noise, ramp, ctx)


def pat_fur(ctx, ramp, lo=0.25, hi=0.8, streaks=26, outline='', axis='v'):
    t = field(ctx, lo, hi, 0.12, 0.3, 3, axis)
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    for _ in range(streaks):
        x, y = rng.integers(0, W), rng.integers(0, H)
        L = rng.integers(2, 5)
        dark = rng.random() < 0.6
        for k in range(L):
            yy = (y - k) % H
            t[yy, x] += -0.32 if dark else 0.25
    rgb = quant(t, ramp, ctx, 0.6)
    if outline:
        rgb = border(rgb, ramp[0], outline)
    return rgb


def pat_stone(ctx, ramp, cracks=3, lo=0.25, hi=0.75, outline='lrtb', moss=None, moss_amt=0.55, crack_ramp=None):
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    t = field(ctx, lo, hi, 0.22, 0.45, 2)
    crack = np.zeros((H, W), bool)
    for _ in range(cracks):
        x, y = rng.integers(2, W - 2), rng.integers(2, H - 2)
        for _ in range(rng.integers(4, 9)):
            crack[y % H, x % W] = True
            x += rng.integers(-1, 2)
            y += rng.choice([-1, 1])
    lite = np.roll(crack, 1, axis=0) & ~crack
    t[lite] += 0.3
    rgb = quant(t, ramp, ctx)
    if crack_ramp is not None:      # glowing cracks (magma / runes)
        g = quant(0.55 + (white(ctx) - 0.5) * 0.8, crack_ramp, ctx)
        rgb[crack] = g[crack]
    else:
        rgb[crack] = ramp[0]
    if moss is not None:
        m = lownoise(ctx, 3) + moss_amt + 0.25 * (ctx['v'] - 0.5) > 1.0
        rgb[m] = quant(field(ctx, 0.3, 0.8, 0.3, 0.2), moss, ctx)[m]
    if outline:
        rgb = border(rgb, ramp[0], outline)
        rgb[-2, 1:-1] = np.where(rng.random((ctx['W'] - 2, 1)) < 0.7, ramp[-1], rgb[-2, 1:-1])
    return rgb


def pat_slime(ctx, ramp, spec='#ffffff', bubbles=4, lo=0.15, hi=0.95):
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    t = field(ctx, lo, hi, 0.1, 0.2, 2)
    rgb = quant(t, ramp, ctx, 0.8)
    for _ in range(bubbles):
        cx, cy, r = rng.integers(2, W - 2), rng.integers(1, int(H * 0.7)), rng.integers(1, 3)
        ring = disc(ctx, cx, cy, r + 0.5) & ~disc(ctx, cx, cy, r - 0.5)
        rgb[ring] = ramp[min(len(ramp) - 1, 3)]
        rgb[disc(ctx, cx - 0.5, cy + 0.5, 0.6)] = ramp[-1]
    hl = disc(ctx, W * 0.3, H * 0.78, W * 0.16, 0.6)
    rgb[hl] = ramp[-1]
    rgb[disc(ctx, W * 0.26, H * 0.82, 1.0)] = C(spec)
    return rgb


def pat_bands(ctx, ramp, bands=4, lo=0.25, hi=0.8, axis='v', line_dark=True):
    g = ctx['v'] if axis == 'v' else ctx['u']
    f = (g * bands) % 1.0
    t = lo + (hi - lo) * f + (white(ctx) - 0.5) * 0.15
    rgb = quant(t, ramp, ctx, 0.7)
    if line_dark:
        n = ctx['H'] if axis == 'v' else ctx['W']
        idx = (np.arange(n) * bands // n)
        edge = np.r_[False, idx[1:] != idx[:-1]]
        if axis == 'v':
            rgb[edge, :] = ramp[0]
        else:
            rgb[:, edge] = ramp[0]
    return rgb


def pat_cloth(ctx, ramp, folds=3, alpha_lo=1.0, alpha_hi=1.0, tatter=0.0, lo=0.2, hi=0.75):
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    t = field(ctx, lo, hi, 0.12, 0.2, 2) + 0.22 * np.sin(ctx['u'] * np.pi * 2 * folds)
    rgb = quant(t, ramp, ctx, 0.8)
    a = alpha_lo + (alpha_hi - alpha_lo) * ctx['v'] + (white(ctx) - 0.5) * 0.08
    a = np.clip(np.round(a * 8) / 8, 0, 1)
    if tatter > 0:
        cut = (rng.random(W) * tatter * H).astype(int)
        for x in range(W):
            a[:cut[x], x] = 0.0
            rgb[cut[x]:cut[x] + 1, x] = ramp[0]
    return np.concatenate([rgb, a[..., None]], -1)


def pat_spots(ctx, ramp, spot_ramp, n=5, rmin=1.5, rmax=3.2, lo=0.3, hi=0.9):
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    rgb = quant(field(ctx, lo, hi, 0.15, 0.25, 2), ramp, ctx)
    for _ in range(n):
        cx, cy = rng.uniform(1, W - 1), rng.uniform(2, H - 2)
        r = rng.uniform(rmin, rmax)
        rgb[disc(ctx, cx, cy, r + 0.7)] = ramp[0]
        m = disc(ctx, cx, cy, r)
        rgb[m] = quant(0.4 + (ctx['iy'] - cy) / (2 * r) * 0.6 + 0.3, spot_ramp, ctx)[m]
    return rgb


def pat_crystal(ctx, ramp, stripes=3, outline='lrtb'):
    rng = ctx['rng']
    u, v = ctx['u'], ctx['v']
    d = (u * 0.6 + v) * stripes
    t = 0.25 + 0.55 * v + 0.35 * (np.abs((d % 1.0) - 0.5) < 0.12) + (white(ctx) - 0.5) * 0.12
    rgb = quant(t, ramp, ctx, 0.6)
    sp = rng.random(u.shape) < 0.03
    rgb[sp] = ramp[-1]
    if outline:
        rgb = border(rgb, ramp[0], outline)
    return rgb


def pat_fire(ctx, ramp, tongues=5, invert=False):
    rng = ctx['rng']
    W, H = ctx['W'], ctx['H']
    u, v = ctx['u'], ctx['v']
    vv = 1 - v if invert else v
    flick = np.sin(u * np.pi * 2 * tongues + rng.uniform(0, 6)) * 0.12 + (lownoise(ctx, 4) - 0.5) * 0.35
    t = 1.05 - vv * 1.1 + flick + (white(ctx) - 0.5) * 0.15
    return quant(t, ramp, ctx, 1.0)


def pat_lava_rock(ctx, rock, glow, width=0.07, cells=4):
    n1 = lownoise(ctx, cells)
    n2 = lownoise(ctx, cells + 1)
    crack = (np.abs(n1 - 0.5) < width) | (np.abs(n2 - 0.5) < width * 0.7)
    rgb = quant(field(ctx, 0.15, 0.6, 0.25, 0.3, 2), rock, ctx)
    g = quant(0.5 + (white(ctx) - 0.5) * 0.8 + 0.25 * ctx['v'], glow, ctx)
    rgb[crack] = g[crack]
    return rgb


def pat_molten(ctx, rock, glow, width=0.03, pool=0.22, cells=4):
    """Dark crust with glowing cracks that widen toward the bottom (v=0) and a molten rim."""
    v = ctx['v']
    n1, n2 = lownoise(ctx, cells), lownoise(ctx, cells + 1)
    w = width + 0.1 * np.clip(1 - v / 0.6, 0, 1) ** 2
    crack = (np.abs(n1 - 0.5) < w) | (np.abs(n2 - 0.5) < w * 0.7)
    rgb = quant(field(ctx, 0.15, 0.7, 0.25, 0.3, 2), rock, ctx)
    g = quant(0.35 + 0.55 * (1 - v) + (white(ctx) - 0.5) * 0.5, glow, ctx)
    m = crack | (v < pool * (0.7 + 0.6 * lownoise(ctx, 5)))
    rgb[m] = g[m]
    return rgb


def pat_eye(ctx, col, rim='#000000', glint=True, pupil=None, pupil_r=0.22, pupil_aspect=1.6):
    W, H = ctx['W'], ctx['H']
    rgb = np.zeros((H, W, 3)) + C(col)
    rgb = quant(0.55 + 0.35 * ctx['v'] + (white(ctx) - 0.5) * 0.1,
                np.array([C(col) * 0.65, C(col), np.minimum(C(col) * 1.25 + 0.1, 1)]), ctx)
    if pupil:
        rgb[disc(ctx, W / 2 - 0.5, H / 2 - 0.5, W * pupil_r, pupil_aspect)] = C(pupil)
    rgb = border(rgb, C(rim), 'lrtb')
    if glint:
        rgb[int(H * 0.7), int(W * 0.3)] = 1.0
    return rgb


def pat_mouth(ctx, inner, teeth='#e8e0c8', rows='t', n=4):
    W, H = ctx['W'], ctx['H']
    rgb = quant(0.3 + 0.4 * ctx['v'] + (white(ctx) - 0.5) * 0.2, inner, ctx)
    tooth = C(teeth)
    for k in range(n):
        x0 = int(k * W / n)
        x1 = int((k + 1) * W / n)
        cx = (x0 + x1 - 1) / 2
        for y in range(H // 3):
            half = (x1 - x0) / 2 * (1 - y / (H / 3))
            xs = [x for x in range(x0, x1) if abs(x - cx) <= half]
            for x in xs:
                if 't' in rows: rgb[H - 1 - y, x] = tooth
                if 'b' in rows: rgb[y, x] = tooth
    return rgb


def pat_membrane(ctx, ramp, veins=4, vein_col=None):
    u, v = ctx['u'], ctx['v']
    t = 0.3 + 0.35 * v + (white(ctx) - 0.5) * 0.12 + (lownoise(ctx, 3) - 0.5) * 0.2
    rgb = quant(t, ramp, ctx, 0.7)
    ang = np.arctan2(v, u + 1e-6)
    vc = ramp[0] if vein_col is None else C(vein_col)
    for k in range(veins):
        a = (k + 0.5) / veins * (np.pi / 2)
        m = np.abs(ang - a) < 0.045 + 0.02 / (np.hypot(u, v) + 0.2)
        rgb[m] = vc
    return rgb


def pat_glow(ctx, ramp, core=0.5, noise=0.25, radial=True):
    u, v = ctx['u'], ctx['v']
    if radial:
        d = np.hypot(u - 0.5, v - 0.5) * 2
        t = 1.0 - d * (1 - core) + (white(ctx) - 0.5) * noise
    else:
        t = 0.4 + 0.6 * v + (white(ctx) - 0.5) * noise
    return quant(t, ramp, ctx)


def pat_gills(ctx, ramp, lines=6):
    u = ctx['u']
    t = 0.35 + 0.3 * ctx['v'] + 0.3 * (((u * lines) % 1.0) < 0.35) + (white(ctx) - 0.5) * 0.15
    return quant(t, ramp, ctx, 0.5)


def pat_rune(ctx, stone, glow, outline='lrtb'):
    """Stone tile with a glowing rune glyph (vertical bar + chevrons)."""
    W, H = ctx['W'], ctx['H']
    rgb = pat_stone(ctx, stone, cracks=1, outline=outline)
    ix, iy = ctx['ix'], ctx['iy']
    cx = W // 2
    m = (np.abs(ix - cx + 0.5) < 1) & (iy > 2) & (iy < H - 3)
    m |= (np.abs(np.abs(ix - cx + 0.5) - (iy - H * 0.55)) < 0.8) & (iy > H * 0.55) & (iy < H - 3)
    m |= (np.abs(np.abs(ix - cx + 0.5) - (H * 0.45 - iy)) < 0.8) & (iy < H * 0.45) & (iy > 2)
    g = quant(0.6 + (white(ctx) - 0.5) * 0.5, glow, ctx)
    rgb[m] = g[m]
    return rgb
