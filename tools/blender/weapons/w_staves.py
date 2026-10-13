"""Staves (x5) and wands (x2)."""
import math
import numpy as np
from wlib import (asset, PAL, H, cyl, orb, gem, box, sweep, spike, slab, paint_decal, paint_metal,
                  paint_wrap, paint_gem, paint_glow, paint_bone, paint_cloth, quant, grid, vnoise,
                  fill_poly, draw_line, dot, draw_glyph, mirror_x, circle_pts, T, Rx, Ry, Rz)
from wparts import (mk_slab, wrap_tile, metal_tile, gem_tile, grip, collar, pommel_ball, pommel_lathe,
                    handle, wood_tile)

ATT_STAFF = 'main-hand grip at origin (~0.8 above the foot); head +Y; length 2.2'
ATT_WAND = 'grip at origin; tip +Y'

HORN = H('1a1410', '3e3228', '66584a', '948470', 'c2b49c')


def glow_decal(A, rect, info, rmp, k=1.0):
    """Copy the painted decal into the emission map (inside the silhouette)."""
    m = info['ins']
    A.eview(rect)[m] = np.clip(A.view(rect)[m] * k, 0, 1)


@asset('staff_wood', 'Ağaç Asa', 'Gnarled druid / novice staff with curled head and leaves (lvl 1-15)', ATT_STAFF,
       kind='staff', fit=2.2)
def staff_wood(A, mb):
    wt = wood_tile(A, PAL['wood'], h=48)
    handle(mb, A, wt, -0.86, 1.12, 0.03, 0.026, n=6, rings=9, jitter=0.007, rjit=0.12, seed=3)
    sweep(mb, A, wt, [(0, 0, 1.1), (0.012, 0, 1.2), (0.05, 0, 1.29), (0.105, 0, 1.325), (0.155, 0, 1.3),
                      (0.172, 0, 1.235), (0.148, 0, 1.18), (0.108, 0, 1.18), (0.094, 0, 1.225)],
          [0.027, 0.026, 0.024, 0.022, 0.02, 0.018, 0.016, 0.014, 0.011], n=6, up=(0, 1, 0))
    tw = wrap_tile(A, H('2a2014', '5a4a30', '8a7650', 'b4a070'), key='twine', period=3)
    grip(mb, A, tw, -0.09, 0.14, 0.034, bulge=1.04)
    cyl(mb, A, tw, [(1.04, 0.031), (1.1, 0.032)], n=6)
    it = metal_tile(A, PAL['iron'], key='iron')
    cyl(mb, A, it, [(-0.89, 0.022), (-0.87, 0.031), (-0.82, 0.032), (-0.81, 0.029)], n=6)
    leaf = [(0, 0), (0.03, 0.02), (0.065, 0.016), (0.095, 0), (0.065, -0.016), (0.03, -0.02)]
    r = None
    for i, (yaw, tilt, z) in enumerate(((20, 35, 1.08), (150, 50, 1.06), (260, 30, 1.09))):
        res = mk_slab(mb, A, leaf, PAL['green'], (16, 10), t=0.004, inner=None,
                      M=T(0, 0, z) @ Rz(yaw) @ Ry(-tilt) @ T(0.025, 0, 0), rect=r,
                      paint=dict(ridge=None, gx=0.2))
        if r is None:
            P = res['proj']
            draw_line(A, res['rect'], [P(0.0, 0), P(0.09, 0)], PAL['green'][3], width=0.5)
        r = res['rect']


@asset('staff_crystal', 'Kristal Asa', 'Arcane mage staff, silver claws holding a glowing crystal (lvl 15-35)',
       ATT_STAFF, kind='staff', fit=2.2, emissive='crystal (cyan)')
def staff_crystal(A, mb):
    wt = wood_tile(A, PAL['dwood'], h=48)
    cyl(mb, A, wt, [(-0.84, 0.022), (0.2, 0.026), (1.06, 0.025)], n=6)
    wr = wrap_tile(A, PAL['purple'], period=4)
    grip(mb, A, wr, -0.08, 0.15, 0.03, bulge=1.04)
    st = metal_tile(A, PAL['steel'], key='steel')
    for z in (-0.6, -0.1, 0.16, 0.6, 0.98):
        collar(mb, A, st, z, 0.03, 0.025)
    pommel_lathe(mb, A, st, -0.84, [(0.0, 0.026), (-0.03, 0.02), (-0.08, 0.0)], n=6)
    pommel_lathe(mb, A, st, 1.03, [(0.0, 0.026), (0.04, 0.042), (0.08, 0.05), (0.095, 0.04)], n=6)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        ca, sa = math.cos(a), math.sin(a)
        path = [(0.04 * ca, 0.04 * sa, 1.1), (0.085 * ca, 0.085 * sa, 1.17), (0.09 * ca, 0.09 * sa, 1.28),
                (0.05 * ca, 0.05 * sa, 1.37)]
        sweep(mb, A, st, path, [0.017, 0.015, 0.012, 0.0], n=4)
    gt = gem_tile(A, PAL['cyan'], key='cyan', emit=1.0, w=12, h=16)
    gem(mb, A, gt, (0, 0, 1.25), 0.056, 0.15, 0.1, n=6)
    for k in range(3):
        a = math.radians(30 + 120 * k)
        gem(mb, A, gt, (0.035 * math.cos(a), 0.035 * math.sin(a), 1.13), 0.016, 0.04, 0.02, n=4,
            rotm=Rz(math.degrees(a)) @ Ry(25))


@asset('staff_fire', 'Ateş Asası', 'Fire mage staff, gold ring with burning orb and flame prongs (lvl 25-45)',
       ATT_STAFF, kind='staff', fit=2.2, emissive='orb + flame prongs (orange/yellow)')
def staff_fire(A, mb):
    lt = metal_tile(A, PAL['red'], key='lacquer', w=8, h=32, hl=0.35)
    cyl(mb, A, lt, [(-0.82, 0.022), (0.2, 0.026), (1.02, 0.025)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    for z in (-0.55, -0.1, 0.18, 0.55, 0.96):
        collar(mb, A, gt, z, 0.03, 0.025)
    wr = wrap_tile(A, PAL['black'], period=4)
    grip(mb, A, wr, -0.08, 0.16, 0.03, bulge=1.04)
    pommel_lathe(mb, A, gt, -0.82, [(0.0, 0.026), (-0.03, 0.03), (-0.06, 0.0)], n=6)
    pommel_lathe(mb, A, gt, 1.0, [(0.0, 0.026), (0.03, 0.04), (0.06, 0.03)], n=6)
    zc, R = 1.16, 0.11
    ring = [(R * math.cos(2 * math.pi * k / 14), 0, zc + R * math.sin(2 * math.pi * k / 14)) for k in range(14)]
    sweep(mb, A, gt, ring, [0.017] * 14, n=4, up=(0, 1, 0), closed=True, rot=math.pi / 4)
    ft = A.tile('fireorb', 8, 8, paint_glow, PAL['fire'], emit=1.0, base=0.7, gy=0.1, noise=0.22, cell=1.5)
    orb(mb, A, ft, (0, 0, zc), 0.066, n=8, rings=5)
    flame = [(-0.03, 0), (-0.042, 0.05), (-0.022, 0.09), (-0.03, 0.13), (0.0, 0.2), (0.008, 0.14), (0.03, 0.115),
             (0.024, 0.065), (0.04, 0.035), (0.03, 0)]
    r = None
    for ang, sc in ((0, 1.0), (40, 0.75), (-40, 0.75)):
        a = math.radians(ang)
        base = (R * math.sin(a), 0, zc + R * math.cos(a) - 0.01)
        res = mk_slab(mb, A, flame, PAL['fire'], (16, 24), t=0.008, inner=None,
                      M=T(*base) @ Ry(ang) @ Matrix_scale(sc), rect=r,
                      paint=dict(base=0.62, gy=-0.3, noise=0.12, ncell=2.0))
        if r is None:
            glow_decal(A, res['rect'], res['info'], PAL['fire'])
        r = res['rect']


def Matrix_scale(s):
    from mathutils import Matrix
    return Matrix.Diagonal((s, s, s, 1.0))


@asset('staff_frost', 'Buz Asası', 'Frost mage staff, silver cradle with a cluster of glowing ice shards (lvl 25-45)',
       ATT_STAFF, kind='staff', fit=2.2, emissive='ice crystal cluster (pale blue)')
def staff_frost(A, mb):
    st = metal_tile(A, H('1c2430', '4a5a6e', '8a9cb0', 'c6d4e2', 'f2f8ff'), key='silver', w=8, h=32, hl=0.3)
    cyl(mb, A, st, [(-0.84, 0.021), (0.2, 0.025), (1.04, 0.024)], n=6)
    wr = wrap_tile(A, PAL['navy'], period=4)
    grip(mb, A, wr, -0.08, 0.15, 0.029, bulge=1.04)
    nt = metal_tile(A, PAL['navy'], key='navy_m')
    for z in (-0.5, 0.5):
        collar(mb, A, nt, z, 0.03, 0.04)
    pommel_lathe(mb, A, st, 1.02, [(0.0, 0.025), (0.05, 0.05), (0.09, 0.065), (0.1, 0.05)], n=6)
    it = gem_tile(A, PAL['ice'], key='ice', emit=1.0, w=12, h=16)

    def shard(base, d, r, h):
        from mathutils import Vector
        M = T(*base) @ __import__('wlib').align_z(d)
        cyl(mb, A, it, [(0, r * 0.7), (h * 0.15, r), (h * 0.7, r), (h, 0.0)], n=6, M=M)
    shard((0, 0, 1.08), (0, 0, 1), 0.036, 0.3)
    for k, (tilt, h) in enumerate(((32, 0.18), (28, 0.15), (35, 0.2), (30, 0.14), (26, 0.16))):
        a = math.radians(72 * k + 15)
        d = (math.sin(math.radians(tilt)) * math.cos(a), math.sin(math.radians(tilt)) * math.sin(a),
             math.cos(math.radians(tilt)))
        shard((0.03 * math.cos(a), 0.03 * math.sin(a), 1.09), d, 0.022, h)
    cyl(mb, A, it, [(-0.84, 0.02), (-0.88, 0.022), (-0.96, 0.0)], n=6)


@asset('staff_skull', 'Kafatası Asası', 'Necromancer staff, horned skull with glowing soul eyes (lvl 30-50)',
       ATT_STAFF, kind='staff', fit=2.2, emissive='skull eyes (soul green)')
def staff_skull(A, mb):
    wt = wood_tile(A, PAL['dwood'], h=48)
    handle(mb, A, wt, -0.86, 1.18, 0.028, 0.024, n=6, rings=9, jitter=0.008, rjit=0.15, seed=7)
    bt = A.tile('bone', 8, 16, paint_bone, PAL['bone'])
    for z in (-0.4, 0.22, 0.95):
        collar(mb, A, bt, z, 0.032, 0.035)
    wr = wrap_tile(A, PAL['black'], period=3)
    grip(mb, A, wr, -0.08, 0.15, 0.031, bulge=1.04)
    cyl(mb, A, bt, [(-0.86, 0.026), (-0.9, 0.02), (-0.95, 0.0)], n=5)
    zs = 1.27
    orb(mb, A, bt, (0, 0.005, zs + 0.02), 0.085, n=8, rings=5, squash=0.95)
    face = [(-0.07, zs - 0.03), (-0.077, zs + 0.03), (-0.05, zs + 0.075), (0, zs + 0.085), (0.05, zs + 0.075),
            (0.077, zs + 0.03), (0.07, zs - 0.03), (0.045, zs - 0.07), (0.04, zs - 0.1), (-0.04, zs - 0.1),
            (-0.045, zs - 0.07)]
    g = mk_slab(mb, A, face, PAL['bone'], (24, 28), t=0.018, inner=('offset', 0.008), y0=-0.058,
                paint=dict(base=0.62, bevel_shade=0.75))
    r, pj = g['rect'], g['proj']
    bone = PAL['bone']
    soul = PAL['soul']
    for sx in (-1, 1):
        sock = [pj(sx * 0.012, zs + 0.0), pj(sx * 0.058, zs + 0.0), pj(sx * 0.055, zs + 0.035), pj(sx * 0.02, zs + 0.038)]
        fill_poly(A, r, sock, bone[0])
        ex, ey = pj(sx * 0.036, zs + 0.018)
        fill_poly(A, r, [(ex - 1.2, ey - 1.2), (ex + 1.2, ey - 1.2), (ex + 1.2, ey + 1.2), (ex - 1.2, ey + 1.2)],
                  soul[3], ecol=soul[3], emit=1.0)
        dot(A, r, ex, ey, soul[4])
        A.eview(r)[int(ey), int(ex)] = soul[4]
    fill_poly(A, r, [pj(-0.012, zs - 0.035), pj(0.012, zs - 0.035), pj(0, zs - 0.008)], bone[0])
    tx0, ty = pj(-0.035, zs - 0.072)
    tx1, _ = pj(0.035, zs - 0.072)
    for x in range(int(tx0), int(tx1) + 1):
        dot(A, r, x, ty, bone[0] if (x % 2) else bone[4])
        dot(A, r, x, ty + 1, bone[1])
    ht = A.tile('horn', 8, 16, paint_bone, HORN, cracks=0)
    for sx in (-1, 1):
        sweep(mb, A, ht, [(sx * 0.06, 0.0, zs + 0.05), (sx * 0.12, 0.0, zs + 0.1), (sx * 0.175, -0.02, zs + 0.06),
                          (sx * 0.17, -0.04, zs - 0.01), (sx * 0.13, -0.045, zs - 0.03), (sx * 0.11, -0.03, zs + 0.0)],
              [0.03, 0.026, 0.02, 0.014, 0.009, 0.0], n=6)


# ---------------------------------------------------------------- wands

@asset('wand_bone', 'Kemik Değnek', 'Necromancer wand, bone shaft with a violet soul orb (lvl 10-30)', ATT_WAND,
       kind='wand', emissive='violet orb')
def wand_bone(A, mb):
    bt = A.tile('bone', 8, 16, paint_bone, PAL['bone'])
    cyl(mb, A, bt, [(-0.15, 0.016), (-0.13, 0.021), (-0.11, 0.014), (0.1, 0.013), (0.12, 0.019), (0.14, 0.013),
                    (0.36, 0.012), (0.38, 0.018), (0.4, 0.015)], n=6)
    for k in range(3):
        a = math.radians(90 + 120 * k)
        ca, sa = math.cos(a), math.sin(a)
        sweep(mb, A, bt, [(0.012 * ca, 0.012 * sa, 0.39), (0.04 * ca, 0.04 * sa, 0.43), (0.04 * ca, 0.04 * sa, 0.48),
                          (0.018 * ca, 0.018 * sa, 0.51)], [0.009, 0.008, 0.006, 0.0], n=4)
    ot = A.tile('orb', 8, 8, paint_glow, PAL['amet'], emit=1.0, base=0.62, gy=0.12, noise=0.2, cell=1.5)
    orb(mb, A, ot, (0, 0, 0.46), 0.033, n=8, rings=5)


@asset('wand_arcane', 'Yıldız Değneği', 'Arcane wand, dark wood with a golden star and glowing sapphire (lvl 15-35)',
       ATT_WAND, kind='wand', emissive='sapphire in the star')
def wand_arcane(A, mb):
    wt = wood_tile(A, PAL['dwood'], h=16)
    cyl(mb, A, wt, [(-0.14, 0.014), (0.1, 0.014), (0.42, 0.011)], n=6)
    gt = metal_tile(A, PAL['gold'], key='gold')
    for z in (-0.14, 0.1, 0.25):
        collar(mb, A, gt, z, 0.017, 0.016)
    pommel_lathe(mb, A, gt, -0.14, [(0.0, 0.016), (-0.015, 0.02), (-0.03, 0.0)], n=6)
    pommel_lathe(mb, A, gt, 0.4, [(0.0, 0.012), (0.03, 0.022), (0.04, 0.016)], n=6)
    zc = 0.49
    star = []
    for k in range(10):
        a = math.radians(90 + 36 * k)
        rr = 0.075 if k % 2 == 0 else 0.032
        star.append((rr * math.cos(a), zc + rr * math.sin(a)))
    mk_slab(mb, A, star, PAL['gold'], (24, 24), t=0.013, inner=('offset', 0.009),
            paint=dict(bevel_shade=0.85, glints=2, glint_col=PAL['gold'][4]))
    st = gem_tile(A, PAL['sapph'], key='sapph', emit=1.0)
    gem(mb, A, st, (0, 0, zc), 0.026, 0.03, 0.03, n=6, rotm=Rx(90))
