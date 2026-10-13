"""Swords: 6 one-handed + 3 two-handed (PSX / Metin2 / Knight Online flavour)."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, slab, paint_decal, paint_metal,
                  paint_wrap, paint_gem, paint_scales, paint_cloth, paint_bone, quant, grid, vnoise,
                  fill_poly, draw_line, dot, draw_glyph, mirror_x, T, Rx, Ry, Rz, poly_inside)
from wparts import (mk_blade, mk_slab, wrap_tile, metal_tile, gem_tile, grip, collar, pommel_ball,
                    pommel_disc, pommel_lathe, bar_guard, std_stations)

ATT_1H = 'grip centre at origin (hand bone); blade +Y; blade flats face +/-Z'
ATT_2H = 'upper-hand grip at origin; blade +Y; second hand ~0.25 lower on the grip'


def edge_stations(lpts, rpts, t, ridge=0.5, tip_t=0.0):
    """Blade stations from separate left/right edge polylines [(z, x)...]."""
    zs = sorted(set([p[0] for p in lpts] + [p[0] for p in rpts]))

    def interp(pts, z):
        for (z1, x1), (z2, x2) in zip(pts, pts[1:]):
            if z1 <= z <= z2:
                f = 0 if z2 == z1 else (z - z1) / (z2 - z1)
                return x1 + (x2 - x1) * f
        return pts[0][1] if z < pts[0][0] else pts[-1][1]
    st = []
    ztop = zs[-1]
    for z in zs:
        xl, xr = interp(lpts, z), interp(rpts, z)
        if z == ztop:
            xm = (xl + xr) / 2
            st.append((z, xm, xm, xm, tip_t))
            continue
        xc = xl + (xr - xl) * (ridge(z) if callable(ridge) else ridge)
        st.append((z, xl, xr, xc, t))
    return st


def paint_wire_wrap(A, rect, rmp, wire, period=4):
    paint_wrap(A, rect, rmp, period=period)
    x0, y0, w, h = rect
    ys, xs = grid(h, w)
    m = ((xs + ys) % (period * 2)) == 0
    m[0, :] = False
    m[-1, :] = False
    A.view(rect)[m] = wire[-2]


# ---------------------------------------------------------------- 1H swords

@asset('sword_1h_rusty', 'Paslı Kısa Kılıç', 'Starter / trash loot one-handed sword (lvl 1-5)', ATT_1H)
def sword_1h_rusty(A, mb):
    st = [(0.09, -0.046, 0.046, 0, 0.011), (0.30, -0.045, 0.046, 0, 0.011), (0.43, -0.044, 0.045, 0, 0.011),
          (0.45, -0.044, 0.033, 0, 0.010), (0.47, -0.043, 0.044, 0, 0.010), (0.60, -0.042, 0.043, 0, 0.010),
          (0.62, -0.031, 0.043, 0, 0.010), (0.64, -0.041, 0.042, 0, 0.010), (0.76, -0.036, 0.035, 0, 0.009),
          (0.83, -0.021, 0.02, 0, 0.006), (0.88, 0, 0, 0, 0)]
    mk_blade(mb, A, st, PAL['iron'], px=(14, 64), rust=0.5, glints=1, base=0.45)
    g = bar_guard(mb, A, PAL['iron'], 0.24, 0.078, 0.03, t=0.019, px=(28, 8))
    r = g['rect']
    v = A.view(r)
    nz = vnoise(r[3], r[2], 2, A.rng)
    m = g['info']['ins'] & (g['info']['d'] > 1.0) & (nz > 0.55)
    v[m] = PAL['rust'][2]
    wr = wrap_tile(A, H('1c140e', '3a2c1e', '5a4632', '7a634a'), period=4)
    grip(mb, A, wr, -0.13, 0.064, 0.021)
    mt = metal_tile(A, PAL['iron'], key='iron', w=8, h=8)
    pommel_ball(mb, A, mt, -0.158, 0.034)


@asset('sword_1h_iron', 'Demir Kılıç', 'Common one-handed arming sword (lvl 5-15)', ATT_1H)
def sword_1h_iron(A, mb):
    st = std_stations(0.09, 0.98, 0.050, 0.043, 0.13, t=0.012)
    mk_blade(mb, A, st, PAL['steel'], px=(14, 64), fuller=(0.12, 0.70), glints=3)
    half = [(0, 0.055), (0.06, 0.058), (0.12, 0.062), (0.145, 0.074), (0.152, 0.1), (0.13, 0.09),
            (0.06, 0.088), (0, 0.094)]
    mk_slab(mb, A, mirror_x(half), PAL['steel'], (32, 10), t=0.02, inner=('offset', 0.007))
    wr = wrap_tile(A, PAL['leather'], period=4)
    grip(mb, A, wr, -0.13, 0.056, 0.021)
    mt = metal_tile(A, PAL['steel'], key='steel', w=8, h=8)
    pommel_disc(mb, A, mt, -0.165, 0.042, 0.032)
    collar(mb, A, mt, -0.13, 0.024, 0.016)


@asset('sword_1h_scimitar', 'Pala', 'Curved Turkish kilij-style sabre with yelman tip (lvl 10-25)', ATT_1H)
def sword_1h_scimitar(A, mb):
    pts = [(0.09, -0.038, 0.040), (0.30, -0.030, 0.048), (0.50, -0.017, 0.062), (0.70, 0.006, 0.082),
           (0.72, -0.008, 0.084), (0.84, 0.030, 0.104), (0.92, 0.072, 0.112)]
    st = [(z, xl, xr, xl + 0.35 * (xr - xl), 0.011) for z, xl, xr in pts] + [(0.975, 0.11, 0.11, 0.11, 0)]
    mk_blade(mb, A, st, PAL['steel'], px=(22, 64), edges='right', glints=3, fuller=(0.12, 0.62),
             fuller_col=PAL['steel'][1])
    br = PAL['brass']
    mk_slab(mb, A, [(-0.1, 0.063), (0.1, 0.063), (0.1, 0.088), (-0.1, 0.088)], br, (24, 8), t=0.018,
            inner=('offset', 0.006))
    # langets over the blade root
    mk_slab(mb, A, [(-0.02, 0.085), (0.024, 0.085), (0.016, 0.135), (-0.012, 0.135)], br, (8, 8), t=0.016,
            inner=None)
    mt = metal_tile(A, br, key='brass', w=8, h=8)
    orb(mb, A, mt, (0.11, 0, 0.0755), 0.02, n=6, rings=4)
    orb(mb, A, mt, (-0.11, 0, 0.0755), 0.02, n=6, rings=4)
    wr = wrap_tile(A, PAL['red'], period=3)
    grip(mb, A, wr, -0.12, 0.063, 0.02)
    box(mb, A, mt, (-0.012, 0, -0.14), (0.052, 0.042, 0.05), top=(0.8, 0.9), rotm=Ry(-22))


@asset('sword_1h_knight', 'Şövalye Kılıcı', 'Ornate knight sword, gold guard + sapphire (lvl 20-35)', ATT_1H)
def sword_1h_knight(A, mb):
    st = std_stations(0.10, 1.02, 0.055, 0.044, 0.15, t=0.013, mids=[(0.5, 0.05)])
    mk_blade(mb, A, st, PAL['steel'], px=(16, 64), fuller=(0.13, 0.78), glints=4)
    half = [(0, 0.035), (0.03, 0.06), (0.07, 0.066), (0.12, 0.058), (0.16, 0.034), (0.178, 0.05),
            (0.168, 0.082), (0.13, 0.099), (0.08, 0.106), (0.04, 0.111), (0.02, 0.132), (0, 0.142)]
    g = mk_slab(mb, A, mirror_x(half), PAL['gold'], (36, 14), t=0.022, inner=('offset', 0.009),
                paint=dict(glints=3, glint_col=PAL['gold'][-1]))
    gt = gem_tile(A, PAL['sapph'], key='sapph')
    gem(mb, A, gt, (0, 0, 0.09), 0.022, 0.034, 0.034, n=6, rotm=Rx(90))
    wr = A.tile('wire', 8, 16, paint_wire_wrap, PAL['blue'], PAL['gold'])
    grip(mb, A, wr, -0.11, 0.07, 0.021)
    mt = metal_tile(A, PAL['gold'], key='gold', w=8, h=8)
    pommel_lathe(mb, A, mt, -0.11, [(0.0, 0.016), (-0.025, 0.03), (-0.05, 0.036), (-0.075, 0.022),
                                     (-0.092, 0.0)], n=8)


@asset('sword_1h_jade', 'Yeşim Kılıcı', 'Eastern (Metin2 style) broad sword, jade tsuba, glowing glyphs (lvl 30-45)',
       ATT_1H, emissive='jade glyphs on blade root')
def sword_1h_jade(A, mb):
    st = [(0.10, -0.05, 0.05, 0, 0.012), (0.86, -0.052, 0.052, 0, 0.011), (0.93, -0.052, 0.045, -0.004, 0.009),
          (1.03, 0.03, 0.03, 0.03, 0)]
    jade = PAL['jade']
    mk_blade(mb, A, st, PAL['steel'], px=(16, 64), glints=3, ridge_shade=0.8,
             runes=dict(z=(0.17, 0.36), col=jade[-1], ecol=jade[3], emit=1.0, step=7, seed=2,
                        channel=PAL['steel'][0]))
    jt = metal_tile(A, jade, key='jade', w=16, h=8, hl=0.4)
    cyl(mb, A, jt, [(0.072, 0.066, 0.05), (0.078, 0.086, 0.064), (0.094, 0.086, 0.064), (0.1, 0.066, 0.05)],
        n=8, rot=math.pi / 8)
    gt = metal_tile(A, PAL['gold'], key='gold', w=8, h=8)
    box(mb, A, gt, (0, 0, 0.117), (0.112, 0.034, 0.034), top=(0.95, 0.9))
    wr = wrap_tile(A, PAL['cloth_w'], key='ito', period=4, cross=True)
    grip(mb, A, wr, -0.165, 0.072, 0.022, bulge=1.06)
    cyl(mb, A, gt, [(-0.165, 0.024), (-0.18, 0.022), (-0.19, 0.012)], n=6)
    ct = A.tile('tassel', 8, 8, paint_cloth, PAL['red'], folds=2)
    cyl(mb, A, ct, [(-0.188, 0.007, None, 0.004, 0), (-0.215, 0.009, None, 0.016, 0),
                    (-0.265, 0.026, None, 0.03, 0), (-0.3, 0.03, None, 0.035, 0), (-0.305, 0.0, None, 0.035, 0)],
        n=5)


@asset('sword_1h_dragon', 'Ejder Kılıcı', 'Legendary dragon blade, serrated spine, burning runes + ruby (lvl 50+)',
       ATT_1H, emissive='rune channel along blade (orange), ruby in guard')
def sword_1h_dragon(A, mb):
    left = [(0.12, -0.05)]
    for zb in (0.30, 0.45, 0.60, 0.75):
        left += [(zb, -0.05), (zb + 0.055, -0.09), (zb + 0.06, -0.05)]
    left += [(0.93, -0.045), (1.02, -0.025), (1.10, 0.004)]
    right = [(0.12, 0.052), (0.3, 0.062), (0.5, 0.068), (0.7, 0.066), (0.83, 0.058), (0.93, 0.046),
             (1.02, 0.022), (1.10, 0.004)]
    st = edge_stations(left, right, 0.014, ridge=0.5)
    st = [(z, xl, xr, 0.004 if xr - xl > 1e-6 else xc, t) for z, xl, xr, xc, t in st]
    fire = PAL['fire']
    mk_blade(mb, A, st, PAL['steel'], px=(22, 64), glints=3,
             runes=dict(z=(0.2, 0.86), col=fire[-1], ecol=fire[3], emit=1.0, step=7, seed=1,
                        channel=H('2a0a06')[0]))
    half = [(0, 0.03), (0.03, 0.06), (0.06, 0.07), (0.085, 0.052), (0.10, 0.085), (0.13, 0.08), (0.145, 0.115),
            (0.175, 0.118), (0.19, 0.16), (0.24, 0.26), (0.2, 0.215), (0.16, 0.178), (0.12, 0.148), (0.08, 0.128),
            (0.05, 0.122), (0.03, 0.142), (0, 0.17)]
    g = mk_slab(mb, A, mirror_x(half), PAL['gold'], (40, 22), t=0.022, inner=('offset', 0.008),
                paint=dict(bevel_shade=0.85, glints=2, glint_col=PAL['gold'][-1]))
    r = g['rect']
    ys, xs = grid(r[3], r[2])
    sc_r = PAL['crimson']

    def scales(xs_, ys_):
        size = 3.0
        row = np.floor(ys_ / size)
        off = (row % 2) * size / 2
        cx = (np.floor((xs_ + off) / size) + 0.5) * size - off
        dd = np.hypot(xs_ - cx, ys_ - (row + 1) * size) / size
        return quant(0.9 - 0.7 * dd, sc_r)
    fill_poly(A, r, g['inner'], scales, outline=PAL['gold'][1])
    gt = gem_tile(A, PAL['ruby'], key='ruby', emit=1.0)
    gem(mb, A, gt, (0, 0, 0.095), 0.026, 0.03, 0.03, n=6, rotm=Rx(90))
    st_ = A.tile('scales', 8, 16, paint_scales, sc_r, size=3)
    grip(mb, A, st_, -0.14, 0.05, 0.022)
    mt = metal_tile(A, PAL['gold'], key='gold', w=8, h=8)
    collar(mb, A, mt, -0.14, 0.026, 0.02)
    pommel_lathe(mb, A, mt, -0.15, [(0.0, 0.024), (-0.02, 0.034), (-0.045, 0.026), (-0.08, 0.0)], n=6)


# ---------------------------------------------------------------- 2H swords

@asset('sword_2h_claymore', 'Büyük Kılıç (Klaymor)', 'Two-handed claymore, iron guard with lobed arms (lvl 15-30)',
       ATT_2H, kind='2h')
def sword_2h_claymore(A, mb):
    st = std_stations(0.14, 1.50, 0.062, 0.052, 0.18, t=0.014, mids=[(0.5, 0.058)])
    mk_blade(mb, A, st, PAL['steel'], px=(16, 64), fuller=(0.17, 1.0), glints=4)
    half = [(0, 0.07), (0.05, 0.08), (0.2, 0.135), (0.235, 0.128), (0.268, 0.16), (0.258, 0.198),
            (0.222, 0.192), (0.19, 0.166), (0.05, 0.115), (0.026, 0.15), (0, 0.162)]
    g = mk_slab(mb, A, mirror_x(half), PAL['iron'], (48, 14), t=0.025, inner=('offset', 0.009))
    r = g['rect']
    for sx in (-1, 1):
        px, py = g['proj'](sx * 0.238, 0.163)
        dot(A, r, px - 0.5, py - 0.5, PAL['iron'][0], 2, hl=PAL['iron'][-1])
    wr = wrap_tile(A, PAL['leather'], key='wrap', w=8, h=32, period=4)
    grip(mb, A, wr, -0.40, 0.07, 0.024, bulge=1.05)
    mt = metal_tile(A, PAL['iron'], key='iron', w=8, h=8)
    collar(mb, A, mt, -0.16, 0.028, 0.03)
    pommel_ball(mb, A, mt, -0.44, 0.046, n=8, rings=4)


@asset('sword_2h_flamberge', 'Dalgalı Büyük Kılıç (Flamberg)', 'Wavy-bladed two-hander with parrying hooks (lvl 30-45)',
       ATT_2H, kind='2h')
def sword_2h_flamberge(A, mb):
    st = [(0.12, -0.034, 0.034, 0, 0.013), (0.30, -0.035, 0.035, 0, 0.013), (0.315, -0.08, 0.08, 0, 0.013),
          (0.335, -0.05, 0.05, 0, 0.013)]
    z = 0.335
    k = 0
    while z < 1.40:
        z += 0.0425
        k += 1
        xc = 0.016 * math.sin(k * math.pi / 2)
        hw = 0.05 - 0.008 * (z - 0.335)
        st.append((z, xc - hw, xc + hw, xc, 0.012))
    st += [(1.50, -0.026, 0.026, 0, 0.008), (1.62, 0, 0, 0, 0)]
    mk_blade(mb, A, st, PAL["steel"], px=(16, 64), glints=4, fuller=(0.13, 0.30))
    half = [(0, 0.075), (0.2, 0.08), (0.24, 0.06), (0.262, 0.03), (0.276, 0.046), (0.266, 0.082), (0.24, 0.106),
            (0.2, 0.112), (0.04, 0.112), (0.02, 0.132), (0, 0.136)]
    mk_slab(mb, A, mirror_x(half), PAL['dsteel'], (48, 12), t=0.022, inner=('offset', 0.008),
            paint=dict(glints=2))
    wr = wrap_tile(A, PAL['red'], key='wrap', w=8, h=32, period=4)
    grip(mb, A, wr, -0.42, 0.075, 0.024, bulge=1.05)
    gt = metal_tile(A, PAL['gold'], key='gold', w=8, h=8)
    collar(mb, A, gt, -0.17, 0.028, 0.026)
    mt = metal_tile(A, PAL['dsteel'], key='dsteel', w=8, h=8)
    pommel_lathe(mb, A, mt, -0.42, [(0.0, 0.022), (-0.02, 0.036), (-0.05, 0.043), (-0.08, 0.03), (-0.096, 0.0)],
                 n=8)


@asset('sword_2h_demon', 'İblis Kılıcı', 'Cursed demonic greatsword, barbed black blade, violet runes (raid/boss loot)',
       ATT_2H, kind='2h', emissive='violet rune channel, demon eyes + forehead gem')
def sword_2h_demon(A, mb):
    right = [(0.18, 0.07)]
    for zb in (0.42, 0.72, 1.02):
        right += [(zb - 0.02, 0.07), (zb, 0.118), (zb + 0.08, 0.072)]
    right += [(1.30, 0.068), (1.45, 0.05), (1.62, -0.02)]
    left = [(0.18, -0.065)]
    for zb in (0.30, 0.58, 0.88, 1.18):
        left += [(zb, -0.065), (zb + 0.07, -0.108), (zb + 0.076, -0.065)]
    left += [(1.40, -0.06), (1.52, -0.05), (1.62, -0.02)]
    st = edge_stations(left, right, 0.016, ridge=0.5)
    st = [(z, xl, xr, (0.0 if z < 1.4 else (xl + xr) / 2) if xr - xl > 1e-6 else xc, t) for z, xl, xr, xc, t in st]
    bl = H('08060c', '1e1426', '3a2842', '5e4868', '9a86a8')
    am = PAL['amet']
    mk_blade(mb, A, st, bl, px=(24, 64), glints=2, edge_shade=0.9,
             runes=dict(z=(0.26, 1.34), col=am[-1], ecol=am[3], emit=1.0, step=6, seed=4, channel=bl[0]))
    # demon face guard
    half = [(0, 0.05), (0.045, 0.065), (0.08, 0.1), (0.095, 0.145), (0.08, 0.19), (0.045, 0.215), (0, 0.208)]
    blk = PAL['dsteel']
    g = mk_slab(mb, A, mirror_x(half), blk, (24, 24), t=0.03, inner=('offset', 0.012),
                paint=dict(bevel_shade=0.7))
    r, pj = g['rect'], g['proj']
    red = PAL['ruby']
    for sx in (-1, 1):
        ex, ey = pj(sx * 0.035, 0.15)
        eye = [(ex - 2 * sx, ey + 1), (ex + 2 * sx, ey + 2), (ex + 2 * sx, ey - 1), (ex - 1 * sx, ey - 1)]
        fill_poly(A, r, eye, red[3], ecol=red[3], emit=1.0)
    mx, my = pj(0, 0.09)
    for i in range(-3, 4):
        dot(A, r, mx + i, my, blk[0])
        if i % 2 == 0:
            dot(A, r, mx + i, my - 1, PAL['bone'][3])
    gt = gem_tile(A, am, key='amet', emit=1.0)
    gem(mb, A, gt, (0, 0, 0.19), 0.016, 0.022, 0.022, n=5, rotm=Rx(90))
    bt = A.tile('bone', 8, 16, paint_bone, PAL['bone'])
    for sx in (-1, 1):
        sweep(mb, A, bt, [(sx * 0.07, 0, 0.13), (sx * 0.15, 0, 0.15), (sx * 0.22, 0, 0.22), (sx * 0.25, 0, 0.32)],
              [0.032, 0.026, 0.014, 0.0], n=6, up=(0, 1, 0))
    wr = wrap_tile(A, PAL['black'], key='wrap', w=8, h=32, period=3)
    grip(mb, A, wr, -0.44, 0.06, 0.025, bulge=1.05)
    mt = metal_tile(A, blk, key='dsteel', w=8, h=8)
    collar(mb, A, mt, -0.19, 0.03, 0.03)
    pommel_lathe(mb, A, mt, -0.44, [(0.0, 0.03), (-0.03, 0.046), (-0.06, 0.032), (-0.12, 0.0)], n=6)
    for sx in (-1, 1):
        spike(mb, A, mt, (sx * 0.035, 0, -0.47), (sx * 0.085, 0, -0.43), 0.012, n=4)
