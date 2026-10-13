"""Shields x4.  Origin = arm grip (handle bar) behind the plate, face toward -Y (glTF +Z)."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, slab, quant, grid, vnoise, poly_inside,
                  poly_dist, fill_poly, draw_line, dot, mirror_x, circle_pts, T, Rx, Ry, Rz)
from wparts import metal_tile, gem_tile, wood_tile

ATT = 'hand grip bar at origin behind the plate (off-hand bone); painted face +Z; up +Y'


def handle(mb, A, rect, y_back, zh=0.11):
    box(mb, A, rect, (0, 0.0, 0), (0.032, 0.032, 2 * zh + 0.03))
    for sz in (-1, 1):
        box(mb, A, rect, (0, y_back / 2, sz * zh), (0.032, abs(y_back) + 0.02, 0.032))


def rim_shade(xs, ys, cx, cy, base=0.5):
    ang = np.arctan2(ys - cy, xs - cx)
    return base + 0.32 * np.cos(ang - math.radians(125))


def rivets(A, r, info, cx, cy, dist_px, n, col, hl, size=2, phase=0.0, poly=None):
    """Place n rivets along the rim, dist_px inside the outline (by sampling)."""
    x0, y0, w, h = r
    d = info['d']
    ins = info['ins']
    for k in range(n):
        a = phase + 2 * math.pi * k / n
        best = None
        for t in np.linspace(0, max(w, h), 400):
            px, py = cx + math.cos(a) * t, cy + math.sin(a) * t
            ix, iy = int(round(px)), int(round(py))
            if not (0 <= ix < w and 0 <= iy < h) or not ins[iy, ix]:
                break
            if abs(d[iy, ix] - dist_px) < 0.8:
                best = (ix, iy)
        if best:
            dot(A, r, best[0] - size // 2, best[1] - size // 2, col, size, hl=hl)


def face_paint(A, r, res, field_fn, rim_rmp, rim_base=0.5, outline_col=None):
    """Generic shield face: field inside the inner polygon, metal rim in the
    bevel band, dark 1px outline.  field_fn(xs, ys, ins) -> rgb array."""
    x0, y0, w, h = r
    ys, xs = grid(h, w)
    poly = np.asarray(res['outline'])
    ins = poly_inside(poly, xs, ys)
    d = poly_dist(poly, xs, ys)
    inner = np.asarray(res['inner'])
    inn = poly_inside(inner, xs, ys)
    di = poly_dist(inner, xs, ys)
    cx, cy = poly[:, 0].mean(), poly[:, 1].mean()
    col = field_fn(xs, ys, inn)
    rim = ins & ~inn
    rs = rim_shade(xs, ys, cx, cy, rim_base) + 0.06 * (vnoise(h, w, 2, A.rng) * 2 - 1)
    rs = np.where(di < 0.8, rs + 0.15, rs)
    rc = quant(rs, rim_rmp)
    col = np.where(rim[..., None], rc, col)
    col = np.where((inn & (di < 0.9))[..., None], rim_rmp[0], col)
    oc = rim_rmp[0] if outline_col is None else outline_col
    col[(~ins) | (d < 0.9)] = oc
    A.view(r)[:] = col
    return dict(ins=ins, d=d, inn=inn, di=di, xs=xs, ys=ys, cx=cx, cy=cy)


def paint_back(A, br, res, field_rmp, rim_rmp, planks=8):
    """Plain shield back: dark planks / leather inside, same metal rim."""
    rng = A.rng
    w, h = br[2], br[3]

    def field(xs, ys, inn):
        g = np.sin(xs * 0.9 + vnoise(h, w, 3, rng, cell_y=10) * 2.0)
        c = quant(0.42 + 0.1 * g + 0.04 * (vnoise(h, w, 2, rng) * 2 - 1), field_rmp)
        if planks:
            c[(xs % planks) == 0] = field_rmp[0]
        return c
    face_paint(A, br, res['back'], field, rim_rmp, rim_base=0.4)


@asset('shield_round_wood', 'Yuvarlak Tahta Kalkan', 'Round plank shield with iron rim and boss (lvl 1-15)', ATT,
       atlas=(128, 128), kind='shield')
def shield_round_wood(A, mb):
    R, y0 = 0.5, -0.1
    ol = circle_pts(0, 0, R, 16, a0=math.pi / 16)
    r = A.alloc(96, 96)
    br = A.alloc(32, 32)
    side = A.alloc(32, 4)
    it = PAL['iron']
    res = slab(mb, A, r, ol, t=0.035, te=0.022, inner=('scale', 0, 0, 0.86), y0=y0, side_rect=side,
               fan=(0, 0, 0.065), back_rect=br)
    paint_back(A, br, res, PAL['dwood'], it, planks=4)
    A.view(side)[:] = quant(np.full((4, 32), 0.45), it)
    A.view(side)[0, :] = it[0]
    wood = PAL['wood']
    rng = A.rng

    def field(xs, ys, inn):
        pw = 12
        plank = np.floor(xs / pw)
        off = (np.sin(plank * 12.9898) * 43758.5453) % 1.0
        g = np.sin(ys * 0.5 + xs * 0.3 + vnoise(96, 96, 3, rng, cell_y=10) * 3)
        shade = 0.45 + 0.18 * (off - 0.5) + 0.12 * g + 0.05 * (vnoise(96, 96, 2, rng) * 2 - 1)
        c = quant(shade, wood)
        c[(xs % pw) == 0] = wood[0]
        cx = cy = 47.5
        rr = np.hypot(xs - cx, ys - cy)
        band = (rr > 20) & (rr < 27) & (vnoise(96, 96, 2.5, rng) > 0.25)
        rc = quant(0.55 + 0.15 * np.sin(ys * 0.4) + 0.0 * xs, PAL['red'])
        c[band] = rc[band]
        return c
    info = face_paint(A, r, res, field, it, rim_base=0.48)
    rivets(A, r, info, info['cx'], info['cy'], 3.0, 16, it[0], it[4], phase=math.pi / 16)
    mt = metal_tile(A, it, key='iron_boss', w=16, h=8, hl=0.45)
    cyl(mb, A, mt, [(0.0, 0.125), (0.025, 0.12), (0.05, 0.095), (0.075, 0.05), (0.083, 0.0)], n=8,
        M=T(0, y0 - 0.055, 0) @ Rx(90), rot=math.pi / 8)
    wt = metal_tile(A, PAL['leather'], key='grip', w=8, h=8, hl=0.2)
    handle(mb, A, wt, y0 + 0.035)


EAGLE_BODY = [(0, 0.1), (0.055, 0.06), (0.065, -0.06), (0.035, -0.16), (0, -0.19)]
EAGLE_WING = [(0.045, 0.05), (0.11, 0.1), (0.17, 0.15), (0.215, 0.215), (0.27, 0.235), (0.255, 0.17), (0.29, 0.13),
              (0.25, 0.09), (0.28, 0.04), (0.23, 0.01), (0.25, -0.045), (0.19, -0.04), (0.06, -0.01)]
EAGLE_NECK = [(0.0, 0.05), (0.045, 0.12), (0.055, 0.175), (0.07, 0.225), (0.105, 0.248), (0.168, 0.226),
              (0.125, 0.204), (0.108, 0.17), (0.095, 0.115), (0.04, 0.035)]
EAGLE_TAIL = [(-0.055, -0.16), (0.055, -0.16), (0.1, -0.3), (0.04, -0.265), (0, -0.315), (-0.04, -0.265), (-0.1, -0.3)]
EAGLE_LEG = [(0.035, -0.11), (0.115, -0.17), (0.13, -0.215), (0.1, -0.195), (0.085, -0.21), (0.08, -0.175),
             (0.035, -0.145)]


@asset('shield_kite_crest', 'Arma Kalkanı', 'Knightly kite shield, blue field with a golden double-headed eagle crest '
       '(lvl 15-35)', ATT, atlas=(128, 128), kind='shield')
def shield_kite_crest(A, mb):
    y0 = -0.09
    half = [(0, -0.78), (0.16, -0.55), (0.28, -0.3), (0.36, 0.0), (0.4, 0.25), (0.38, 0.4), (0.2, 0.45), (0, 0.47)]
    ol = mirror_x(half)
    r = A.alloc(80, 112)
    br = A.alloc(24, 36)
    side = A.alloc(32, 4)
    stl = PAL['steel']
    bend = lambda x, y, z: (x, y + 0.32 * x * x, z)
    res = slab(mb, A, r, ol, t=0.032, te=0.022, inner=('offset', 0.042), y0=y0, side_rect=side,
               fan=(0, 0.0, 0.05), deform=bend, back_rect=br)
    paint_back(A, br, res, PAL['leather'], stl, planks=0)
    A.view(side)[:] = quant(np.full((4, 32), 0.5), stl)
    A.view(side)[0, :] = stl[0]
    blue = PAL['blue']
    rng = A.rng
    pj = res['proj']

    def field(xs, ys, inn):
        t = ys / 111.0
        shade = 0.42 + 0.22 * (t - 0.5) + 0.05 * (vnoise(112, 80, 3, rng) * 2 - 1)
        c = quant(shade, blue)
        return c
    info = face_paint(A, r, res, field, stl, rim_base=0.55)
    gold = PAL['gold']
    gys, gxs = info['ys'], info['xs']

    def gold_fill(xs, ys):
        return quant(0.55 + 0.25 * (ys / 111.0 - 0.5) * 2 + 0.08 * np.sin(xs * 0.9), gold)
    cz = 0.0
    for poly in (EAGLE_WING, EAGLE_NECK, EAGLE_LEG):
        for sx in (-1, 1):
            pts = [pj(sx * x, cz + z) for x, z in poly]
            fill_poly(A, r, pts, gold_fill, outline=gold[0])
    fill_poly(A, r, [pj(-x, cz + z) for x, z in reversed(EAGLE_TAIL)], gold_fill, outline=gold[0])
    fill_poly(A, r, [pj(x, cz + z) for x, z in mirror_x(EAGLE_BODY)], gold_fill, outline=gold[0])
    for sx in (-1, 1):
        ex, ey = pj(sx * 0.1, cz + 0.228)
        dot(A, r, ex, ey, gold[0])
        bx, by = pj(sx * 0.15, cz + 0.222)
        dot(A, r, bx, by, PAL['red'][3])
        for zz in (0.0, -0.05):
            a, b = pj(sx * 0.03, cz + zz), pj(sx * 0.2, cz + zz + 0.08)
            draw_line(A, r, [a, b], gold[1], width=0.5, mask=poly_inside(
                np.asarray([pj(sx * x, cz + z) for x, z in EAGLE_WING]), gxs, gys))
    rivets(A, r, info, info['cx'], info['cy'] + 10, 2.6, 18, stl[0], stl[4])
    wt = metal_tile(A, PAL['leather'], key='grip', w=8, h=8, hl=0.2)
    handle(mb, A, wt, y0 + 0.032)


@asset('shield_tower', 'Kule Kalkanı', 'Tall curved tower shield, iron-banded with a sun boss (tank, lvl 20-45)', ATT,
       atlas=(128, 128), kind='shield')
def shield_tower(A, mb):
    y0 = -0.1
    half = [(0, -0.66), (0.4, -0.66), (0.42, 0.48), (0.3, 0.6), (0, 0.64)]
    ol = mirror_x(half)
    r = A.alloc(72, 112)
    br = A.alloc(24, 36)
    side = A.alloc(32, 4)
    it = PAL['iron']
    bend = lambda x, y, z: (x, y + 0.5 * x * x, z)
    res = slab(mb, A, r, ol, t=0.036, te=0.026, inner=('offset', 0.04), y0=y0, side_rect=side,
               fan=(0, 0.0, 0.045), deform=bend, back_rect=br)
    paint_back(A, br, res, PAL['dwood'], it, planks=4)
    A.view(side)[:] = quant(np.full((4, 32), 0.45), it)
    A.view(side)[0, :] = it[0]
    cr = PAL['crimson']
    rng = A.rng
    pj = res['proj']

    def field(xs, ys, inn):
        pw = 9
        g = np.sin(xs * 0.9 + vnoise(112, 72, 3, rng, cell_y=12) * 2.5)
        shade = 0.5 + 0.1 * g + 0.04 * (vnoise(112, 72, 2, rng) * 2 - 1)
        c = quant(shade, cr)
        c[(xs % pw) == 4] = cr[0]
        return c
    info = face_paint(A, r, res, field, it, rim_base=0.5)
    ys, xs = info['ys'], info['xs']
    v = A.view(r)
    for zb in (0.32, -0.36):
        y_lo, y_hi = pj(0, zb - 0.035)[1], pj(0, zb + 0.035)[1]
        m = info['inn'] & (ys >= y_lo) & (ys <= y_hi)
        bandc = quant(0.45 + 0.35 * ((ys - y_lo) / max(y_hi - y_lo, 1)) + 0 * xs, it)
        v[m] = bandc[m]
        v[info['inn'] & ((ys == int(round(y_lo))) | (ys == int(round(y_hi))))] = it[0]
        for xx in np.linspace(-0.3, 0.3, 6):
            px, py = pj(xx, zb)
            dot(A, r, px - 1, py - 1, it[0], 2, hl=it[4])
    gold = PAL['gold']
    cx, cy = pj(0, 0.0)
    dd = np.hypot(xs - cx, ys - cy)
    ang = np.arctan2(ys - cy, xs - cx)
    rays = (dd < 15) & (np.cos(ang * 12) > 0.55) & info['inn']
    v[rays] = gold[2]
    rivets(A, r, info, info['cx'], info['cy'], 2.5, 20, it[0], it[4])
    mt = metal_tile(A, it, key='iron_boss', w=16, h=8, hl=0.45)
    gt = metal_tile(A, gold, key='gold_boss', w=16, h=8, hl=0.45)
    cyl(mb, A, mt, [(0.0, 0.12), (0.02, 0.115)], n=8, M=T(0, y0 - 0.04, 0) @ Rx(90), rot=math.pi / 8)
    cyl(mb, A, gt, [(0.02, 0.085), (0.045, 0.075), (0.065, 0.04), (0.072, 0.0)], n=8,
        M=T(0, y0 - 0.04, 0) @ Rx(90), rot=math.pi / 8)
    wt = metal_tile(A, PAL['leather'], key='grip', w=8, h=8, hl=0.2)
    handle(mb, A, wt, y0 + 0.036)


@asset('shield_demon_spiked', 'İblis Kalkanı', 'Spiked demon-face shield with horns and glowing eyes (raid / boss loot)',
       ATT, atlas=(128, 128), kind='shield', emissive='demon eyes (orange-red)')
def shield_demon_spiked(A, mb):
    y0 = -0.1
    ol = []
    for k in range(16):
        a = math.pi / 2 + 2 * math.pi * k / 16
        rr = 0.5 if k % 2 == 0 else 0.56
        ol.append((rr * math.cos(a), rr * math.sin(a)))
    r = A.alloc(96, 96)
    br = A.alloc(32, 32)
    side = A.alloc(32, 4)
    blk = PAL['dsteel']
    res = slab(mb, A, r, ol, t=0.035, te=0.024, inner=('scale', 0, 0, 0.84), y0=y0, side_rect=side,
               fan=(0, 0, 0.07), back_rect=br)
    paint_back(A, br, res, PAL['black'], blk, planks=0)
    A.view(side)[:] = quant(np.full((4, 32), 0.45), blk)
    A.view(side)[0, :] = blk[0]
    cr = PAL['crimson']
    rng = A.rng
    pj = res['proj']

    def field(xs, ys, inn):
        shade = 0.5 + 0.06 * (vnoise(96, 96, 3, rng) * 2 - 1) + 0.12 * (ys / 95.0 - 0.5)
        return quant(shade, cr)
    info = face_paint(A, r, res, field, blk, rim_base=0.48)
    bone = PAL['bone']
    lava = PAL['lava']
    # brows
    for sx in (-1, 1):
        brow = [pj(sx * 0.03, 0.12), pj(sx * 0.3, 0.2), pj(sx * 0.31, 0.15), pj(sx * 0.05, 0.07)]
        fill_poly(A, r, brow, blk[1], outline=blk[0])
        eye = [pj(sx * 0.08, 0.05), pj(sx * 0.27, 0.11), pj(sx * 0.25, 0.03), pj(sx * 0.12, 0.0)]
        fill_poly(A, r, eye, lava[3], ecol=lava[3], emit=1.0, outline=blk[0])
        ex, ey = pj(sx * 0.17, 0.05)
        dot(A, r, ex - 1, ey - 1, lava[4], 2)
        A.eview(r)[int(ey) - 1:int(ey) + 1, int(ex) - 1:int(ex) + 1] = lava[4]
    mouth = [pj(-0.28, -0.12), pj(0.28, -0.12), pj(0.2, -0.3), pj(0, -0.34), pj(-0.2, -0.3)]
    fill_poly(A, r, mouth, H('0a0204')[0], outline=blk[0])
    for i in range(7):
        x = -0.21 + i * 0.07
        fill_poly(A, r, [pj(x - 0.025, -0.125), pj(x + 0.025, -0.125), pj(x, -0.19)], bone[3], outline=bone[1])
    for x in (-0.12, 0.12):
        fill_poly(A, r, [pj(x - 0.03, -0.32), pj(x + 0.03, -0.32), pj(x, -0.22)], bone[3], outline=bone[1])
    mt = metal_tile(A, blk, key='dsteel', w=8, h=8)
    for k in range(16):
        if k % 2 == 1 and k not in (1, 15):
            a = math.pi / 2 + 2 * math.pi * k / 16
            ca, sa = math.cos(a), math.sin(a)
            spike(mb, A, mt, (0.5 * ca, y0, 0.5 * sa), (0.68 * ca, y0, 0.68 * sa), 0.035, n=4, rot=math.pi / 4)
    spike(mb, A, mt, (0, y0 - 0.08, -0.02), (0, y0 - 0.25, -0.02), 0.05, n=4, rot=math.pi / 4)
    ht = A.tile('horn', 8, 16, lambda A_, r_: __import__('wlib').paint_bone(A_, r_, bone, cracks=1))
    for sx in (-1, 1):
        sweep(mb, A, ht, [(sx * 0.2, y0 - 0.02, 0.4), (sx * 0.3, y0 - 0.03, 0.52), (sx * 0.42, y0 - 0.02, 0.6),
                          (sx * 0.52, y0, 0.7), (sx * 0.56, y0 + 0.01, 0.82)],
              [0.06, 0.05, 0.036, 0.02, 0.0], n=6)
    wt = metal_tile(A, PAL['leather'], key='grip', w=8, h=8, hl=0.2)
    handle(mb, A, wt, y0 + 0.035)
