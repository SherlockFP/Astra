"""Crossbows x2 and bows x2."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, slab, paint_metal, paint_wrap, paint_wood,
                  paint_bone, paint_flat, quant, grid, vnoise, fill_poly, draw_line, dot, T, Rx, Ry, Rz)
from wparts import mk_slab, wrap_tile, metal_tile, gem_tile, grip, collar, wood_tile

ATT_XBOW = 'trigger grip at origin; points forward +Z like KayKit crossbow_1handed; prod across X; up +Y'
ATT_BOW = 'bow grip at origin; limbs along +/-Y; string on the archer side (-Z); arrow flies +Z'


def lacquer_tile(A, r, base_rmp, deco_rmp):
    """Red lacquer limb with small gold diamonds (Ottoman bow decoration)."""
    paint_metal(A, r, base_rmp, hl=0.25, rows=False)
    x0, y0, w, h = r
    ys, xs = grid(h, w)
    v = A.view(r)
    m = ((np.abs((xs % 8) - 4) + np.abs((ys % 8) - 4)) == 2)
    v[m] = deco_rmp[3]
    m2 = ((xs % 8) == 4) & ((ys % 8) == 4)
    v[m2] = deco_rmp[4]


def stock(mb, A, wt, rings, n=4):
    """Crossbow stock lofted along -Y.  rings: (y_back_to_front as distance d, half_w, half_h, z_centre)."""
    k = math.sqrt(2)
    cyl(mb, A, wt, [(d, hw * k, hh * k, 0.0, zc) for d, hw, hh, zc in rings], n=n, M=Rx(90), rot=math.pi / 4)


def bolt(mb, A, wt, mt, y0, y1, z, r=0.0065, fletch_rect=None):
    sweep(mb, A, wt, [(0, y0, z), (0, y1, z)], [r, r], n=4, rot=math.pi / 4)
    sweep(mb, A, mt, [(0, y1, z), (0, y1 - 0.06, z)], [r * 2.2, 0.0], n=4, rot=math.pi / 4)


# ---------------------------------------------------------------- crossbows

@asset('crossbow_light', 'Hafif Arbalet', 'Light hunting crossbow, wood stock with steel prod (lvl 5-25)', ATT_XBOW,
       kind='crossbow')
def crossbow_light(A, mb):
    wt = wood_tile(A, PAL['wood'], h=32)
    stock(mb, A, wt, [(-0.26, 0.022, 0.05, 0.0), (-0.12, 0.02, 0.034, 0.025), (0.0, 0.02, 0.028, 0.045),
                      (0.32, 0.018, 0.02, 0.055), (0.6, 0.019, 0.022, 0.055)])
    mt = metal_tile(A, PAL['steel'], key='steel')
    it = metal_tile(A, PAL['iron'], key='iron')
    box(mb, A, it, (0, 0.03, -0.0), (0.012, 0.02, 0.05), rotm=Rx(-20))
    box(mb, A, it, (0, -0.07, 0.083), (0.03, 0.035, 0.022))
    arc = [(-0.4, -0.44), (-0.28, -0.5), (-0.14, -0.535), (0.0, -0.545), (0.14, -0.535), (0.28, -0.5), (0.4, -0.44)]
    radii = [(0.009, 0.012), (0.01, 0.015), (0.011, 0.017), (0.012, 0.019), (0.011, 0.017), (0.01, 0.015),
             (0.009, 0.012)]
    sweep(mb, A, mt, [(x, y, 0.06) for x, y in arc], radii, n=4, up=(0, 0, 1), rot=math.pi / 4)
    box(mb, A, it, (0, -0.545, 0.06), (0.06, 0.04, 0.05))
    st = A.tile('string', 4, 8, paint_flat, PAL['cloth_w'], rows=False)
    for sx in (-1, 1):
        sweep(mb, A, st, [(sx * 0.395, -0.44, 0.06), (0, -0.075, 0.072)], [0.0035, 0.0035], n=3)
    sweep(mb, A, it, [(-0.04, -0.6, 0.05), (-0.055, -0.65, 0.05), (0, -0.685, 0.05), (0.055, -0.65, 0.05),
                      (0.04, -0.6, 0.05)], [0.007] * 5, n=4, up=(0, 0, 1))
    bolt(mb, A, wt, mt, -0.08, -0.6, 0.082)
    mk_slab(mb, A, [(0, 0), (0.06, 0.0), (0.0, 0.024)], PAL['red'], (12, 8), t=0.002, inner=None,
            M=T(0, -0.08, 0.087) @ Rz(-90))


@asset('crossbow_heavy', 'Ağır Arbalet', 'Heavy siege-style crossbow with windlass and iron fittings (lvl 25-45)',
       ATT_XBOW, kind='crossbow')
def crossbow_heavy(A, mb):
    wt = wood_tile(A, PAL['dwood'], h=32)
    stock(mb, A, wt, [(-0.34, 0.028, 0.06, 0.0), (-0.16, 0.025, 0.042, 0.03), (0.0, 0.025, 0.034, 0.05),
                      (0.4, 0.024, 0.026, 0.062), (0.74, 0.026, 0.03, 0.062)])
    it = metal_tile(A, PAL['iron'], key='iron')
    dt = metal_tile(A, PAL['dsteel'], key='dsteel', w=8, h=8)
    k = math.sqrt(2)
    for d, hw, hh, zc in ((-0.3, 0.03, 0.058, 0.004), (0.2, 0.027, 0.031, 0.058), (0.55, 0.028, 0.032, 0.062)):
        cyl(mb, A, it, [(d - 0.02, (hw + 0.004) * k, (hh + 0.004) * k, 0, zc),
                        (d + 0.02, (hw + 0.004) * k, (hh + 0.004) * k, 0, zc)], n=4, M=Rx(90), rot=math.pi / 4)
    box(mb, A, it, (0, 0.035, -0.005), (0.014, 0.024, 0.06), rotm=Rx(-20))
    box(mb, A, it, (0, -0.1, 0.1), (0.04, 0.045, 0.028))
    arc = [(-0.5, -0.56), (-0.36, -0.64), (-0.18, -0.685), (0.0, -0.7), (0.18, -0.685), (0.36, -0.64), (0.5, -0.56)]
    radii = [(0.012, 0.016), (0.014, 0.02), (0.016, 0.024), (0.018, 0.026), (0.016, 0.024), (0.014, 0.02),
             (0.012, 0.016)]
    sweep(mb, A, dt, [(x, y, 0.07) for x, y in arc], radii, n=4, up=(0, 0, 1), rot=math.pi / 4)
    arc2 = [(-0.3, -0.69), (-0.15, -0.715), (0.0, -0.722), (0.15, -0.715), (0.3, -0.69)]
    sweep(mb, A, dt, [(x, y, 0.07) for x, y in arc2], [(0.008, 0.014)] * 5, n=4, up=(0, 0, 1), rot=math.pi / 4)
    box(mb, A, it, (0, -0.71, 0.066), (0.08, 0.06, 0.07))
    st = A.tile('string', 4, 8, paint_flat, PAL['cloth_w'], rows=False)
    for sx in (-1, 1):
        sweep(mb, A, st, [(sx * 0.495, -0.56, 0.07), (0, -0.11, 0.09)], [0.0045, 0.0045], n=3)
    sweep(mb, A, it, [(-0.05, -0.78, 0.06), (-0.075, -0.84, 0.06), (0, -0.885, 0.06), (0.075, -0.84, 0.06),
                      (0.05, -0.78, 0.06)], [0.009] * 5, n=4, up=(0, 0, 1))
    # windlass drum + cranks at the butt
    cyl(mb, A, it, [(-0.07, 0.03), (0.07, 0.03)], n=6, M=T(0, 0.36, 0.05) @ Ry(90))
    for sx in (-1, 1):
        box(mb, A, it, (sx * 0.085, 0.36, 0.09), (0.012, 0.016, 0.1))
        cyl(mb, A, wt, [(0.0, 0.011), (0.06, 0.011)], n=6, M=T(sx * 0.09, 0.36, 0.135) @ Ry(90 * sx))
    mt = metal_tile(A, PAL['steel'], key='steel')
    bolt(mb, A, wt, mt, -0.12, -0.78, 0.103, r=0.008)
    mk_slab(mb, A, [(0, 0), (0.07, 0.0), (0.0, 0.028)], PAL['black'], (12, 8), t=0.002, inner=None,
            M=T(0, -0.12, 0.109) @ Rz(-90))


# ---------------------------------------------------------------- bows

def limb_path(pts_up):
    """Mirror an upper-limb path [(y, z)...] (starting near z=0) into a full bow path bottom->top."""
    low = [(y, -z) for y, z in reversed(pts_up) if z > 1e-6]
    return [(0.0, y, z) for y, z in low + list(pts_up)]


@asset('bow_short', 'Kısa Yay', 'Simple wooden self bow for hunters / novice archers (lvl 1-20)', ATT_BOW, kind='bow')
def bow_short(A, mb):
    up = [(-0.004, 0.0), (0.0, 0.06), (0.012, 0.18), (0.045, 0.33), (0.095, 0.46), (0.15, 0.575)]
    path = limb_path(up)
    n = len(path)
    radii = []
    for (_, y, z) in path:
        f = abs(z) / 0.575
        radii.append((0.019 - 0.008 * f, 0.03 - 0.017 * f))
    wt = wood_tile(A, PAL['pwood'], h=32)
    sweep(mb, A, wt, path, radii, n=6, up=(1, 0, 0))
    wr = wrap_tile(A, PAL['leather'], period=3)
    cyl(mb, A, wr, [(-0.075, 0.021, 0.024, -0.0, -0.004), (0.075, 0.021, 0.024, 0.0, -0.004)], n=6,
        rot=math.pi / 2)
    ht = A.tile('horn', 8, 8, paint_bone, PAL['bone'], cracks=0)
    for sz in (-1, 1):
        sweep(mb, A, ht, [(0, 0.148, sz * 0.565), (0, 0.165, sz * 0.6)], [(0.012, 0.016), (0.0, 0.0)], n=4,
              up=(1, 0, 0))
    st = A.tile('string', 4, 8, paint_flat, PAL['cloth_w'], rows=False)
    sweep(mb, A, st, [(0, 0.158, -0.585), (0, 0.158, 0.585)], [0.003, 0.003], n=3)


@asset('bow_composite', 'Türk Yayı', 'Turkish composite recurve bow, red lacquer with gold, horn siyahs (lvl 25-50)',
       ATT_BOW, kind='bow')
def bow_composite(A, mb):
    up = [(-0.006, 0.0), (0.0, 0.07), (0.03, 0.17), (0.075, 0.29), (0.112, 0.4), (0.124, 0.465)]
    path = limb_path(up)
    radii = []
    for (_, y, z) in path:
        f = abs(z) / 0.465
        radii.append((0.019 - 0.004 * f, 0.033 - 0.012 * f))
    lt = A.tile('lacquer', 16, 32, lacquer_tile, PAL['red'], PAL['gold'])
    sweep(mb, A, lt, path, radii, n=6, up=(1, 0, 0))
    ht = A.tile('horn', 8, 16, paint_bone, PAL['bone'], cracks=1)
    for sz in (-1, 1):
        sip = [(0, 0.118, sz * 0.455), (0, 0.124, sz * 0.47), (0, 0.095, sz * 0.54), (0, 0.045, sz * 0.6),
               (0, 0.008, sz * 0.635)]
        sweep(mb, A, ht, sip, [(0.016, 0.022), (0.016, 0.022), (0.013, 0.018), (0.01, 0.014), (0.0, 0.0)], n=6,
              up=(1, 0, 0))
    wr = wrap_tile(A, PAL['leather'], period=3)
    cyl(mb, A, wr, [(-0.08, 0.023, 0.026, 0, -0.006), (0.08, 0.023, 0.026, 0, -0.006)], n=6, rot=math.pi / 2)
    gt = metal_tile(A, PAL['gold'], key='gold')
    for z in (-0.085, 0.085):
        cyl(mb, A, gt, [(z - 0.008, 0.024, 0.027, 0, -0.006), (z + 0.008, 0.024, 0.027, 0, -0.006)], n=6,
            rot=math.pi / 2)
    st = A.tile('string', 4, 8, paint_flat, PAL['cloth_w'], rows=False)
    sweep(mb, A, st, [(0, 0.022, -0.628), (0, 0.06, -0.59), (0, 0.112, -0.53), (0, 0.142, -0.47), (0, 0.142, 0.47),
                      (0, 0.112, 0.53), (0, 0.06, 0.59), (0, 0.022, 0.628)], [0.003] * 8, n=3)
