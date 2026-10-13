"""Daggers x4 - shared proportions (~0.6 long, same grip length) so any two look like a pair."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, paint_bone, fill_poly, draw_line, dot,
                  mirror_x, T, Rx, Ry, Rz)
from wparts import (mk_blade, mk_slab, wrap_tile, metal_tile, gem_tile, grip, collar, pommel_ball,
                    pommel_lathe, bar_guard, std_stations, ridge_seg)
from w_swords import edge_stations

ATT = 'grip centre at origin; blade +Y; dual-wield: mirror the off-hand copy on X if needed'


@asset('dagger_iron', 'Demir Hançer', 'Plain iron dagger, rogue starter / off-hand (lvl 1-12)', ATT, kind='dagger')
def dagger_iron(A, mb):
    st = std_stations(0.045, 0.46, 0.03, 0.026, 0.09, t=0.009)
    mk_blade(mb, A, st, PAL['steel'], px=(12, 56), fuller=(0.06, 0.3), glints=2)
    bar_guard(mb, A, PAL['iron'], 0.12, 0.035, 0.022, t=0.016, px=(24, 8))
    wr = wrap_tile(A, PAL['leather'], period=3)
    grip(mb, A, wr, -0.075, 0.026, 0.016, bulge=1.08)
    mt = metal_tile(A, PAL['iron'], key='iron')
    pommel_ball(mb, A, mt, -0.094, 0.022)


@asset('dagger_curved', 'Kıvrık Hançer', 'Ottoman-style curved khanjar, ivory grip and gold fittings (lvl 15-30)', ATT,
       kind='dagger')
def dagger_curved(A, mb):
    st = []
    zs = [0.05, 0.15, 0.25, 0.33, 0.40]
    for z in zs:
        f = (z - 0.05) / 0.42
        xc = 0.075 * f * f
        hw = 0.03 - 0.012 * f
        st.append((z, xc - hw, xc + hw, xc, 0.009))
    st.append((0.47, 0.085, 0.085, 0.085, 0.0))
    mk_blade(mb, A, st, PAL['steel'], px=(16, 56), glints=2, fuller=(0.07, 0.32))
    half = [(0, 0.018), (0.04, 0.022), (0.057, 0.036), (0.05, 0.054), (0.03, 0.048), (0, 0.06)]
    mk_slab(mb, A, mirror_x(half), PAL['gold'], (20, 12), t=0.016, inner=('offset', 0.006))
    rt = gem_tile(A, PAL['ruby'], key='ruby')
    gem(mb, A, rt, (0, 0, 0.038), 0.01, 0.022, 0.022, n=4, rotm=Rx(90))
    bt = A.tile('ivory', 8, 16, paint_bone, PAL['bone'], cracks=1)
    cyl(mb, A, bt, [(-0.1, 0.026, 0.017), (-0.085, 0.019, 0.014), (-0.03, 0.014, 0.012), (0.0, 0.016, 0.013),
                    (0.018, 0.019, 0.015)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    box(mb, A, gt, (0, 0, -0.112), (0.075, 0.036, 0.024), top=(0.9, 0.95))
    collar(mb, A, gt, 0.018, 0.02, 0.012)


@asset('dagger_assassin', 'Suikastçı Hançeri', 'Black sawback assassin dagger with glowing poison groove (lvl 25-45)',
       ATT, kind='dagger', emissive='poison groove (green)')
def dagger_assassin(A, mb):
    left = [(0.05, -0.022)]
    for zb in (0.12, 0.17, 0.22):
        left += [(zb, -0.022), (zb + 0.022, -0.032), (zb + 0.026, -0.022)]
    left += [(0.38, -0.016), (0.49, 0.01)]
    right = [(0.05, 0.024), (0.3, 0.026), (0.4, 0.019), (0.49, 0.01)]
    st = edge_stations(left, right, 0.009, ridge=0.45)
    bl = H('08080c', '1c1c26', '343444', '585a6e', '9a9cb0')
    r, ol, rg, pj = mk_blade(mb, A, st, bl, px=(14, 56), glints=1, edges='right')
    po = PAL['poison']
    ya, yb = pj(0, 0.07)[1], pj(0, 0.36)[1]
    seg = ridge_seg(rg, ya, yb)
    draw_line(A, r, seg, bl[0], width=2.2)
    draw_line(A, r, seg, po[3], width=0.6, ecol=po[3], emit=1.0)
    bar_guard(mb, A, PAL['dsteel'], 0.095, 0.035, 0.02, t=0.015, px=(20, 8), flare=0.012)
    wr = A.tile('wrapg', 8, 16, lambda A_, r_: _wrap_accent(A_, r_, PAL['black'], po))
    grip(mb, A, wr, -0.08, 0.026, 0.016, bulge=1.08)
    mt = metal_tile(A, PAL['dsteel'], key='dsteel')
    ring = [(0.026 * math.cos(2 * math.pi * k / 10), 0, -0.112 + 0.026 * math.sin(2 * math.pi * k / 10))
            for k in range(10)]
    sweep(mb, A, mt, ring, [0.0075] * 10, n=4, up=(0, 1, 0), closed=True, rot=math.pi / 4)
    collar(mb, A, mt, -0.083, 0.019, 0.014)


def _wrap_accent(A, r, rmp, acc):
    from wlib import paint_wrap
    paint_wrap(A, r, rmp, period=3)
    v = A.view(r)
    v[r[3] // 2, :] = acc[2]


@asset('dagger_ritual', 'Kurban Hançeri', 'Wavy kris ritual dagger, bone grip, glowing ruby pommel (lvl 30-50)', ATT,
       kind='dagger', emissive='ruby pommel + guard stone')
def dagger_ritual(A, mb):
    st = [(0.05, -0.03, 0.03, 0, 0.009)]
    z, k = 0.05, 0
    while z < 0.36:
        z += 0.05
        k += 1
        xc = 0.011 * math.sin(k * math.pi / 2)
        hw = 0.029 - 0.02 * (z - 0.05)
        st.append((z, xc - hw, xc + hw, xc, 0.009))
    st += [(0.47, 0.0, 0.0, 0.0, 0.0)]
    mk_blade(mb, A, st, PAL['steel'], px=(14, 56), glints=2, fuller=(0.06, 0.2), fuller_col=PAL['gold'][2])
    ol = [(-0.045, 0.028), (0.062, 0.028), (0.072, 0.05), (0.035, 0.062), (-0.03, 0.062), (-0.052, 0.045)]
    mk_slab(mb, A, ol, PAL['gold'], (20, 10), t=0.016, inner=('offset', 0.006))
    rt = gem_tile(A, PAL['ruby'], key='ruby', emit=1.0)
    gem(mb, A, rt, (0.01, 0, 0.045), 0.011, 0.02, 0.02, n=4, rotm=Rx(90))
    bt = A.tile('bone', 8, 16, paint_bone, PAL['bone'])
    cyl(mb, A, bt, [(-0.075, 0.017), (-0.06, 0.02), (-0.045, 0.015), (-0.02, 0.018), (0.0, 0.015), (0.015, 0.018),
                    (0.028, 0.016)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    pommel_lathe(mb, A, gt, -0.075, [(0.0, 0.018), (-0.012, 0.024), (-0.02, 0.02)], n=6)
    gem(mb, A, rt, (0, 0, -0.112), 0.022, 0.016, 0.03, n=6)
