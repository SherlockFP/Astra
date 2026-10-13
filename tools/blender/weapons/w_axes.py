"""Axes (3x 1H, 3x 2H), maces x2 and a two-handed war hammer."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, slab, paint_decal, paint_metal,
                  paint_wrap, paint_gem, paint_glow, quant, grid, vnoise, fill_poly, draw_line, dot,
                  draw_glyph, mirror_x, T, Rx, Ry, Rz, poly_inside)
from wparts import (mk_slab, wrap_tile, metal_tile, gem_tile, grip, collar, pommel_ball, pommel_lathe,
                    handle, wood_tile, arc3)

ATT_1H = 'grip at origin near the handle end; head +Y; cutting edge toward +X'
ATT_MACE = 'grip at origin near the handle end; head +Y'
ATT_2H = 'upper-hand grip at origin; head +Y; lower hand ~0.3-0.4 below on the haft'

BLUESTEEL = H('0c1020', '25304a', '46587a', '7890b4', 'c8d8f0')


def blood(A, rect, info, amount=0.35, near=4.0):
    """Dark red stains near the outline (executioner style)."""
    x0, y0, w, h = rect
    nz = vnoise(h, w, 2.0, A.rng)
    m = info['ins'] & (info['d'] > 0.9) & (info['d'] < near) & (nz > 1 - amount)
    A.view(rect)[m] = PAL['crimson'][1]
    m2 = m & (nz > 1 - amount * 0.5)
    A.view(rect)[m2] = PAL['crimson'][2]


# ---------------------------------------------------------------- 1H axes

@asset('axe_1h_hatchet', 'El Baltası', 'Basic woodsman hatchet, starter one-handed axe (lvl 1-8)', ATT_1H)
def axe_1h_hatchet(A, mb):
    wt = wood_tile(A, PAL['pwood'])
    cyl(mb, A, wt, [(-0.2, 0.026), (-0.17, 0.028), (-0.12, 0.023), (0.3, 0.022), (0.72, 0.02), (0.75, 0.018)], n=6)
    ol = [(-0.045, 0.585), (-0.045, 0.715), (0.02, 0.725), (0.10, 0.705), (0.19, 0.775), (0.218, 0.70),
          (0.222, 0.62), (0.208, 0.545), (0.19, 0.505), (0.10, 0.585), (0.02, 0.575)]
    mk_slab(mb, A, ol, PAL['iron'], (28, 28), t=0.03, te=lambda x, z: 0.004 if x > 0.18 else 0.028,
            inner=('offset', lambda x, z: 0.04 if x > 0.18 else 0.01), cut=lambda x, z: x > 0.185,
            paint=dict(glints=2))
    mt = metal_tile(A, PAL['iron'], key='iron')
    box(mb, A, mt, (0.0, 0, 0.755), (0.03, 0.035, 0.02))


@asset('axe_1h_bearded', 'Sakallı Balta', 'Northern bearded axe with bronze collars (lvl 10-25)', ATT_1H)
def axe_1h_bearded(A, mb):
    wt = wood_tile(A, PAL['wood'])
    cyl(mb, A, wt, [(-0.22, 0.02), (0.0, 0.024), (0.4, 0.022), (0.82, 0.021)], n=6)
    wr = wrap_tile(A, PAL['leather'], period=4)
    grip(mb, A, wr, -0.17, 0.11, 0.026, bulge=1.05)
    bt = metal_tile(A, PAL['bronze'], key='bronze', bands=0)
    collar(mb, A, bt, -0.21, 0.026, 0.03)
    collar(mb, A, bt, 0.575, 0.028, 0.035)
    collar(mb, A, bt, 0.835, 0.027, 0.03)
    ol = [(-0.04, 0.62), (-0.04, 0.78), (0.05, 0.79), (0.16, 0.815), (0.215, 0.795), (0.222, 0.70),
          (0.212, 0.60), (0.19, 0.50), (0.16, 0.43), (0.13, 0.425), (0.115, 0.47), (0.09, 0.56),
          (0.05, 0.61), (0.02, 0.62)]
    g = mk_slab(mb, A, ol, PAL['steel'], (28, 40), t=0.028,
                te=lambda x, z: 0.004 if (x > 0.17 or (z < 0.45 and x > 0.12)) else 0.026,
                inner=('offset', lambda x, z: 0.035 if x > 0.17 else 0.01),
                cut=lambda x, z: x > 0.172, paint=dict(glints=2))
    r, pj = g['rect'], g['proj']
    # engraved knot-work band near the socket
    pts = [pj(0.04, 0.64), pj(0.07, 0.70), pj(0.04, 0.76), pj(0.10, 0.74), pj(0.10, 0.66)]
    draw_line(A, r, pts, PAL['steel'][1], width=0.8, closed=True)


@asset('axe_1h_crescent', 'Hilal Balta', 'Ornate crescent-moon axe, blued steel and gold (lvl 25-40)', ATT_1H)
def axe_1h_crescent(A, mb):
    wt = wood_tile(A, PAL['dwood'])
    cyl(mb, A, wt, [(-0.2, 0.021), (0.4, 0.022), (0.85, 0.021)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    collar(mb, A, gt, -0.2, 0.025, 0.03)
    collar(mb, A, gt, 0.56, 0.026, 0.03)
    collar(mb, A, gt, 0.81, 0.026, 0.03)
    pommel_lathe(mb, A, gt, 0.83, [(0.0, 0.024), (0.04, 0.02), (0.13, 0.0)], n=4, rot=0.0)
    T1, M_, T2 = (0.07, 0.915), (0.265, 0.68), (0.07, 0.445)
    outer = arc3(T2, M_, T1, 9)
    inner_mid = (0.17, 0.68)
    inner_up = arc3(T1, (0.155, 0.80), inner_mid, 5)
    inner_dn = arc3(inner_mid, (0.155, 0.56), T2, 5)
    # neck attaches to the inner arc at z 0.65..0.71
    up_pts = [p for p in inner_up[1:] if p[1] > 0.715] + [(0.168, 0.715)]
    dn_pts = [(0.168, 0.645)] + [p for p in inner_dn[:-1] if p[1] < 0.645]
    ol = ([(-0.035, 0.62), (0.035, 0.62), (0.035, 0.645)] + dn_pts + outer + up_pts +
          [(0.035, 0.715), (0.035, 0.74), (-0.035, 0.74), (-0.035, 0.715), (-0.17, 0.68), (-0.035, 0.645)])
    (cx, cz) = (0.07, 0.68)
    g = mk_slab(mb, A, ol, BLUESTEEL, (40, 40), t=0.022,
                te=lambda x, z: 0.004 if (math.hypot(x - 0.0, z - 0.68) > 0.2 and x > 0.12) or x < -0.12 else 0.02,
                inner=('offset', lambda x, z: 0.02 if (x > 0.2) else 0.007),
                cut=lambda x, z: (x > 0.12 and math.hypot(x - 0.0, z - 0.68) > 0.19) or x < -0.1,
                paint=dict(glints=3))
    r, pj = g['rect'], g['proj']
    for z in (0.66, 0.70):
        dot(A, r, *pj(0.0, z), PAL['gold'][3])


# ---------------------------------------------------------------- 2H axes

@asset('axe_2h_battle', 'Çift Ağızlı Savaş Baltası', 'Double-bitted two-handed battle axe (lvl 15-35)', ATT_2H, kind='2h')
def axe_2h_battle(A, mb):
    z0 = 1.06
    wt = wood_tile(A, PAL['pwood'], h=32)
    cyl(mb, A, wt, [(-0.55, 0.024), (0.3, 0.026), (1.2, 0.025)], n=6)
    wr = wrap_tile(A, PAL['leather'], period=4, h=24)
    grip(mb, A, wr, -0.45, 0.1, 0.029, bulge=1.03)
    mt = metal_tile(A, PAL['steel'], key='steel')
    pommel_lathe(mb, A, mt, -0.55, [(0.0, 0.028), (-0.03, 0.024), (-0.1, 0.0)], n=4)
    pommel_lathe(mb, A, mt, z0 + 0.08, [(0.0, 0.026), (0.05, 0.02), (0.22, 0.0)], n=4)
    rw = [(0.035, -0.075), (0.13, -0.10), (0.28, -0.23), (0.33, -0.08), (0.325, 0.08), (0.28, 0.23),
          (0.13, 0.10), (0.035, 0.075)]
    ol = [(x, z0 + z) for x, z in rw] + [(-x, z0 + z) for x, z in reversed(rw)]
    g = mk_slab(mb, A, ol, PAL['steel'], (48, 32), t=0.03, te=lambda x, z: 0.004 if abs(x) > 0.27 else 0.028,
                inner=('offset', lambda x, z: 0.045 if abs(x) > 0.27 else 0.012),
                cut=lambda x, z: abs(x) > 0.27, paint=dict(glints=3))
    r, pj = g['rect'], g['proj']
    for sx in (-1, 1):
        dot(A, r, *pj(sx * 0.09, z0 + 0.03), PAL['gold'][3], hl=PAL['gold'][4])
        dot(A, r, *pj(sx * 0.09, z0 - 0.03), PAL['gold'][3], hl=PAL['gold'][4])
    box(mb, A, mt, (0, 0, z0), (0.085, 0.075, 0.17))


@asset('axe_2h_executioner', 'Cellat Baltası', 'Huge executioner axe, blood-stained edge (lvl 30-45 / elite drop)',
       ATT_2H, kind='2h')
def axe_2h_executioner(A, mb):
    wt = wood_tile(A, PAL['dwood'], h=32)
    cyl(mb, A, wt, [(-0.52, 0.026), (0.4, 0.028), (1.5, 0.026)], n=6)
    wr = wrap_tile(A, PAL['red'], period=3, h=24)
    grip(mb, A, wr, -0.45, 0.12, 0.031, bulge=1.03)
    it = metal_tile(A, PAL['iron'], key='iron')
    for z in (-0.5, 0.18, 0.95):
        collar(mb, A, it, z, 0.031, 0.03)
    ol = [(-0.09, 1.25), (-0.09, 1.42), (0.06, 1.46), (0.22, 1.56), (0.30, 1.63), (0.40, 1.56), (0.455, 1.40),
          (0.45, 1.20), (0.40, 1.06), (0.33, 0.97), (0.24, 1.03), (0.10, 1.17), (-0.05, 1.21)]
    g = mk_slab(mb, A, ol, PAL['iron'], (44, 52), t=0.032, te=lambda x, z: 0.004 if x > 0.38 else 0.03,
                inner=('offset', lambda x, z: 0.06 if x > 0.38 else 0.014),
                cut=lambda x, z: x > 0.39, paint=dict(glints=2, base=0.42))
    r, pj = g['rect'], g['proj']
    blood(A, r, g['info'], amount=0.4, near=6.0)
    hx, hy = pj(0.22, 1.30)
    ys, xs = grid(r[3], r[2])
    dd = np.hypot(xs - hx, ys - hy)
    v = A.view(r)
    v[dd < 3.6] = PAL['iron'][-1]
    v[dd < 2.6] = PAL['iron'][0]
    box(mb, A, it, (0, 0, 1.33), (0.085, 0.08, 0.24))
    pommel_lathe(mb, A, it, 1.45, [(0.0, 0.03), (0.04, 0.03), (0.06, 0.0)], n=6)


@asset('axe_2h_infernal', 'Cehennem Baltası', 'Infernal great axe, jagged black blades with molten edges (boss loot)',
       ATT_2H, kind='2h', emissive='molten blade edges + cracks, lava gem in socket')
def axe_2h_infernal(A, mb):
    blk = PAL['dsteel']
    mt = metal_tile(A, blk, key='dsteel', w=8, h=32, bands=6)
    cyl(mb, A, mt, [(-0.5, 0.026), (0.4, 0.027), (1.28, 0.026)], n=6)
    wr = wrap_tile(A, PAL['black'], period=3, h=16)
    grip(mb, A, wr, -0.42, 0.1, 0.03, bulge=1.03)
    st = metal_tile(A, blk, key='dsteel_s')
    pommel_lathe(mb, A, st, -0.5, [(0.0, 0.03), (-0.04, 0.03), (-0.14, 0.0)], n=4)
    for z, a in ((-0.2, 0), (0.25, 45)):
        for k in range(4):
            ang = math.radians(a + 90 * k)
            spike(mb, A, st, (0.02 * math.cos(ang), 0.02 * math.sin(ang), z),
                  (0.065 * math.cos(ang), 0.065 * math.sin(ang), z + 0.04), 0.012, n=4)
    ol = [(0.035, 0.98), (0.12, 0.98), (0.20, 0.90), (0.29, 0.82), (0.31, 0.92), (0.37, 0.95), (0.33, 1.03),
          (0.36, 1.12), (0.30, 1.18), (0.31, 1.28), (0.20, 1.32), (0.12, 1.20), (0.035, 1.15),
          (-0.035, 1.15), (-0.10, 1.17), (-0.22, 1.22), (-0.14, 1.12), (-0.19, 1.06), (-0.17, 0.98),
          (-0.20, 0.88), (-0.10, 0.96), (-0.035, 0.98)]
    sharp = lambda x, z: x > 0.26 or x < -0.135
    g = mk_slab(mb, A, ol, blk, (48, 44), t=0.03, te=lambda x, z: 0.004 if sharp(x, z) else 0.028,
                inner=('offset', lambda x, z: 0.03 if sharp(x, z) else 0.01),
                cut=lambda x, z: x > 0.25 or x < -0.12, paint=dict(glints=0, base=0.4, edge_shade=0.6))
    r, pj, info = g['rect'], g['proj'], g['info']
    lava = PAL['lava']
    v, e = A.view(r), A.eview(r)
    # molten bevel band on the cutting edges
    ys, xs = grid(r[3], r[2])
    m = info['ins'] & info['bev'] & (info['d'] >= 0.9)
    edge_side = (xs > pj(0.22, 0)[0]) | (xs < pj(-0.11, 0)[0])
    m &= edge_side
    v[m] = lava[3]
    e[m] = lava[3]
    m2 = m & (info['d'] < 1.9)
    v[m2] = lava[4]
    e[m2] = lava[4]
    # cracks
    rng = A.rng
    for sx, zs in ((1, (1.02, 1.13, 1.24)), (-1, (1.06,))):
        for z in zs:
            x = sx * 0.05
            pts = [pj(x, z)]
            for s in range(3):
                x += sx * (0.045 + rng.random() * 0.02)
                z += (rng.random() - 0.5) * 0.05
                pts.append(pj(x, z))
            draw_line(A, r, pts, lava[2], width=0.35, ecol=lava[2], emit=1.0,
                      mask=info['ins'] & ~info['bev'] & (info['d'] > 1.5))
    box(mb, A, st, (0, 0, 1.065), (0.085, 0.08, 0.2))
    gt = gem_tile(A, lava, key='lava', emit=1.0)
    gem(mb, A, gt, (0, 0, 1.065), 0.026, 0.05, 0.05, n=6, rotm=Rx(90))
    pommel_lathe(mb, A, st, 1.165, [(0.0, 0.03), (0.03, 0.02), (0.15, 0.0)], n=4)


# ---------------------------------------------------------------- maces / hammer

@asset('mace_flanged', 'Dişli Topuz', 'One-handed flanged mace (cleric / warrior, lvl 10-25)', ATT_MACE)
def mace_flanged(A, mb):
    stl = metal_tile(A, PAL['steel'], key='steel', w=8, h=16)
    cyl(mb, A, stl, [(-0.16, 0.018), (0.55, 0.018)], n=6)
    wr = wrap_tile(A, PAL['leather'], period=4)
    grip(mb, A, wr, -0.14, 0.1, 0.023, bulge=1.06)
    bt = metal_tile(A, PAL['brass'], key='brass')
    pommel_ball(mb, A, bt, -0.175, 0.03)
    collar(mb, A, bt, 0.52, 0.026, 0.03)
    collar(mb, A, bt, 0.105, 0.025, 0.02)
    cyl(mb, A, stl, [(0.53, 0.034), (0.80, 0.034), (0.83, 0.02), (0.86, 0.0)], n=6)
    ol = [(0.02, 0.53), (0.06, 0.555), (0.108, 0.62), (0.112, 0.74), (0.075, 0.81), (0.02, 0.83)]
    r = None
    for k in range(6):
        res = mk_slab(mb, A, ol, PAL['iron'], (14, 22), t=0.011, inner=('offset', 0.006), M=Rz(k * 60 + 30),
                      rect=r, cut=lambda x, z: x > 0.07, paint=dict(glints=1))
        r = res['rect']


@asset('mace_morningstar', 'Çivili Gürz', 'Spiked morning-star mace, iron-banded wooden haft (lvl 15-30)', ATT_MACE)
def mace_morningstar(A, mb):
    wt = wood_tile(A, PAL['wood'], h=24)
    cyl(mb, A, wt, [(-0.18, 0.022), (0.3, 0.023), (0.66, 0.026)], n=6)
    wr = wrap_tile(A, PAL['leather'], period=4)
    grip(mb, A, wr, -0.15, 0.1, 0.026, bulge=1.05)
    it = metal_tile(A, PAL['iron'], key='iron')
    pommel_ball(mb, A, it, -0.19, 0.03)
    for z in (0.3, 0.6):
        collar(mb, A, it, z, 0.03, 0.03)
    ht = metal_tile(A, PAL['iron'], key='iron_head', w=16, h=8, hl=0.4)
    c = (0, 0, 0.74)
    orb(mb, A, ht, c, 0.1, n=8, rings=6)
    st = metal_tile(A, PAL['steel'], key='steel')
    dirs = [(0, 0, 1)]
    for k in range(8):
        a = math.radians(45 * k + 22.5)
        dirs.append((math.cos(a), math.sin(a), 0.0))
    for k in range(4):
        a = math.radians(90 * k)
        dirs.append((math.cos(a) * 0.7, math.sin(a) * 0.7, 0.7))
        dirs.append((math.cos(a + 0.785) * 0.7, math.sin(a + 0.785) * 0.7, -0.7))
    for d in dirs:
        L = math.sqrt(sum(v * v for v in d))
        d = [v / L for v in d]
        b = [c[i] + d[i] * 0.088 for i in range(3)]
        t_ = [c[i] + d[i] * 0.175 for i in range(3)]
        spike(mb, A, st, b, t_, 0.02, n=4)


@asset('hammer_2h_thunder', 'Gök Gürültüsü Çekici', 'Two-handed war hammer with storm runes (lvl 35-50)', ATT_2H,
       kind='2h', emissive='cyan lightning runes on both head faces')
def hammer_2h_thunder(A, mb):
    wr = wrap_tile(A, PAL['navy'], period=4, h=32)
    cyl(mb, A, wr, [(-0.45, 0.026), (0.2, 0.027), (0.95, 0.026)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    for z in (-0.12, 0.25, 0.92):
        collar(mb, A, gt, z, 0.03, 0.03)
    pommel_lathe(mb, A, gt, -0.45, [(0.0, 0.03), (-0.03, 0.04), (-0.06, 0.025), (-0.08, 0.0)], n=6)
    zc = 1.05
    st = metal_tile(A, PAL['steel'], key='steel_head', w=16, h=16, hl=0.25)
    cyl(mb, A, st, [(-0.25, 0.1), (-0.23, 0.125), (0.23, 0.125), (0.25, 0.1)], n=8, M=T(0, 0, zc) @ Ry(90),
        rot=math.pi / 8)
    for sx in (-1, 1):
        cyl(mb, A, gt, [(0.245, 0.095), (0.262, 0.105), (0.285, 0.085)], n=8,
            M=T(0, 0, zc) @ Ry(90 * sx), rot=math.pi / 8)
    spike(mb, A, gt, (0, 0, zc + 0.11), (0, 0, zc + 0.2), 0.03, n=4, rot=math.pi / 4)
    ol = [(-0.17, zc - 0.05), (-0.13, zc - 0.075), (0.13, zc - 0.075), (0.17, zc - 0.05), (0.17, zc + 0.05),
          (0.13, zc + 0.075), (-0.13, zc + 0.075), (-0.17, zc + 0.05)]
    dk = PAL['dsteel']
    cy = PAL['cyan']
    g = mk_slab(mb, A, ol, dk, (40, 20), t=0.006, inner=('offset', 0.01), y0=-0.118,
                paint=dict(base=0.35, bevel_shade=0.75))
    r, pj = g['rect'], g['proj']
    bolt = [pj(-0.03, zc + 0.065), pj(0.035, zc + 0.065), pj(0.0, zc + 0.012), pj(0.04, zc + 0.012),
            pj(-0.035, zc - 0.068), pj(-0.008, zc - 0.008), pj(-0.045, zc - 0.008)]
    fill_poly(A, r, bolt, cy[3], ecol=cy[3], emit=1.0)
    draw_line(A, r, bolt, cy[4], width=0.5, closed=True, ecol=cy[4])
    for i, x in enumerate((-0.12, -0.085, 0.085, 0.12)):
        draw_glyph(A, r, *pj(x, zc), i + 2, cy[3], cy[3], 1.0)
    mk_slab(mb, A, ol, dk, (40, 20), t=0.006, inner=('offset', 0.01), y0=0.118, rect=r)
