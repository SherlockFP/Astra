"""Reusable weapon parts (blades, guards, grips, pommels) built on wlib."""
import math
import numpy as np
from wlib import (PAL, H, blade, slab, cyl, orb, gem, box, sweep, spike, paint_decal, paint_metal,
                  paint_wrap, paint_gem, paint_glow, paint_wood, paint_bone, quant, vnoise,
                  draw_runes, draw_line, polyline_at, grid, T, Rx, Ry, Rz, dot, fill_poly)


def ridge_seg(rg, y0, y1, n=12):
    return [(polyline_at(rg, y0 + (y1 - y0) * k / (n - 1)), y0 + (y1 - y0) * k / (n - 1)) for k in range(n)]


def paint_blade(A, rect, ol, rg, proj, rmp, edges='both', fuller=None, rust=0.0, runes=None,
                glints=3, base=0.5, edge_shade=0.97, ridge_shade=0.74, gy=0.1, noise=0.045, gx=0.1,
                fuller_col=None, edge_rmp=None, edge_emit=None):
    """Paint a blade decal.  edges: 'both' | 'right' | 'left'.  fuller: (z0, z1).
    runes: dict(z=(z0,z1), col=rgb, ecol=rgb|None, step=int, emit=float)."""
    n = len(ol)
    k = n // 2
    if edges == 'both':
        E = list(range(0, n - 1))
    elif edges == 'right':
        E = list(range(k - 1, n - 1))
    else:
        E = list(range(0, k))
    info = paint_decal(A, rect, ol, rmp, base=base, gx=gx, gy=gy, noise=noise, ncell=4.0, edges=E,
                       edge_w=1.25, edge_shade=edge_shade, ridge=rg, ridge_shade=ridge_shade,
                       ridge_w=0.55, glints=glints)
    x0, y0, w, h = rect
    v = A.view(rect)
    ins, d = info['ins'], info['d']
    if rust > 0:
        nz = vnoise(h, w, 2.2, A.rng)
        m = ins & (d > 1.4) & (nz > 1.0 - rust)
        rc = quant(np.clip((nz - (1.0 - rust)) / max(rust, 1e-3) * 1.2, 0, 1), PAL['rust'])
        v[m] = rc[m]
        m2 = ins & (d < 0.9)
        v[m2] = PAL['rust'][0]
    if fuller is not None:
        ya, yb = proj(0, fuller[0])[1], proj(0, fuller[1])[1]
        seg = ridge_seg(rg, ya, yb)
        fc = fuller_col if fuller_col is not None else rmp[1]
        draw_line(A, rect, seg, fc, width=1.6, mask=ins & (d > 1.5))
        draw_line(A, rect, [(x + 1.2, y) for x, y in seg], rmp[-2], width=0.6, mask=ins & (d > 1.5))
    if edge_emit is not None:
        de = info['d']
        m = ins & (de < 2.3) & (de >= 0.9)
        A.eview(rect)[m] = edge_emit
        v[m] = np.clip(np.asarray(edge_emit) * 1.1, 0, 1)
    if runes is not None:
        ya, yb = proj(0, runes['z'][0])[1], proj(0, runes['z'][1])[1]
        draw_runes(A, rect, rg, ya, yb, runes['col'], runes.get('ecol'), runes.get('emit', 1.0),
                   step=runes.get('step', 7), seed=runes.get('seed', 0), channel=runes.get('channel'))
    return info


def mk_blade(mb, A, st, rmp, px=(16, 64), **paint):
    r = A.alloc(*px)
    ol, rg, pj = blade(mb, A, r, st)
    paint_blade(A, r, ol, rg, pj, rmp, **paint)
    return r, ol, rg, pj


def mk_slab(mb, A, outline, rmp, px, t=0.02, te=None, inner=('offset', 0.008), M=None,
            side=None, paint=None, deform=None, fan=None, y0=0.0, bb=None, cut=None, rect=None,
            do_paint=True):
    """Allocate a decal region, build a slab and paint it.  cut(x, z) -> bool
    marks outline edges (by midpoint) that get the bright cutting-edge band.
    rect: reuse an existing region (then nothing is painted)."""
    r = rect if rect is not None else A.alloc(*px)
    res = slab(mb, A, r, outline, t=t, te=te, inner=inner, M=M, side_rect=side, deform=deform,
               fan=fan, y0=y0, bb=bb)
    res['rect'] = r
    if rect is not None or not do_paint:
        return res
    kw = dict(base=0.5, gy=0.15, noise=0.06, ncell=3.0, bevel_shade=0.8)
    if cut is not None:
        P = res['pts']
        n = len(P)
        kw['edges'] = [i for i in range(n)
                       if cut((P[i][0] + P[(i + 1) % n][0]) / 2, (P[i][1] + P[(i + 1) % n][1]) / 2)]
    kw.update(paint or {})
    info = paint_decal(A, r, res['outline'], rmp, inner=res['inner'], **kw)
    res['info'] = info
    return res


def wrap_tile(A, rmp, key='wrap', w=8, h=16, **k):
    return A.tile(key, w, h, paint_wrap, rmp, **k)


def metal_tile(A, rmp, key=None, w=8, h=8, **k):
    return A.tile(key or ('metal_%d' % id(rmp)), w, h, paint_metal, rmp, **k)


def gem_tile(A, rmp, key=None, emit=0.0, w=8, h=8):
    return A.tile(key or ('gem_%d' % id(rmp)), w, h, paint_gem, rmp, emit=emit)


def grip(mb, A, rect, z0, z1, r, n=6, bulge=1.12, rot=0.0):
    zm = (z0 + z1) / 2
    cyl(mb, A, rect, [(z0, r), (zm, r * bulge), (z1, r)], n=n, rot=rot)


def collar(mb, A, rect, z, r, h, n=6, rot=0.0):
    cyl(mb, A, rect, [(z - h / 2, r * 0.85), (z - h / 4, r), (z + h / 4, r), (z + h / 2, r * 0.85)], n=n, rot=rot)


def pommel_ball(mb, A, rect, z, r, n=6, rings=4):
    orb(mb, A, rect, (0, 0, z), r, n=n, rings=rings)


def pommel_disc(mb, A, rect, z, r, th, n=8):
    cyl(mb, A, rect, [(-th / 2, r * 0.7), (-th * 0.3, r), (th * 0.3, r), (th / 2, r * 0.7)], n=n,
        M=T(0, 0, z) @ Rx(90), rot=math.pi / n)


def pommel_lathe(mb, A, rect, z0, prof, n=8, rot=None):
    """prof: [(dz, r)...] relative to z0 (dz may be negative)."""
    cyl(mb, A, rect, [(z0 + dz, r) for dz, r in prof], n=n, rot=(math.pi / n if rot is None else rot))


def bar_guard(mb, A, rmp, w, z, h, t=0.02, px=(32, 8), flare=0.006, paint=None):
    ol = [(-w / 2, z - h / 2), (w / 2, z - h / 2), (w / 2 + flare, z + h / 2), (-w / 2 - flare, z + h / 2)]
    return mk_slab(mb, A, ol, rmp, px, t=t, inner=('offset', min(h * 0.25, 0.008)), paint=paint)


def std_stations(z0, z1, hw0, hw1, tip, t=0.012, xc=0.0, mids=()):
    """Straight symmetric blade: base half width hw0 -> hw1 at the start of the tip."""
    zt = z1 - tip
    st = [(z0, xc - hw0, xc + hw0, xc, t)]
    for f, hw in mids:
        z = z0 + (zt - z0) * f
        st.append((z, xc - hw, xc + hw, xc, t * (1 - 0.2 * f)))
    st.append((zt, xc - hw1, xc + hw1, xc, t * 0.8))
    st.append((zt + tip * 0.6, xc - hw1 * 0.5, xc + hw1 * 0.5, xc, t * 0.55))
    st.append((z1, xc, xc, xc, 0.0))
    return st


def handle(mb, A, rect, z0, z1, r0, r1=None, n=6, rings=4, jitter=0.0, seed=0, rot=0.0, rjit=0.0):
    """Shaft along Z (optionally gnarled with per-ring offsets)."""
    import random
    r1 = r0 if r1 is None else r1
    rng = random.Random(seed)
    rr = []
    for k in range(rings + 1):
        f = k / rings
        z = z0 + (z1 - z0) * f
        r = (r0 + (r1 - r0) * f) * (1 + (rng.uniform(-rjit, rjit) if 0 < k < rings else 0))
        jx = rng.uniform(-jitter, jitter) if 0 < k < rings else 0.0
        jy = rng.uniform(-jitter, jitter) if 0 < k < rings else 0.0
        rr.append((z, r, None, jx, jy))
    cyl(mb, A, rect, rr, n=n, rot=rot)


def wood_tile(A, rmp, key='wood', w=8, h=32, **k):
    return A.tile(key, w, h, paint_wood, rmp, **k)


def circle_through(p1, p2, p3):
    (ax, ay), (bx, by), (cx, cy) = p1, p2, p3
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    return (ux, uy), math.hypot(ax - ux, ay - uy)


def arc3(p1, p2, p3, n):
    """n points on the circular arc from p1 through p2 to p3."""
    (ux, uy), r = circle_through(p1, p2, p3)
    a1 = math.atan2(p1[1] - uy, p1[0] - ux)
    a2 = math.atan2(p2[1] - uy, p2[0] - ux)
    a3 = math.atan2(p3[1] - uy, p3[0] - ux)

    def norm(a, ref):
        while a - ref > math.pi:
            a -= 2 * math.pi
        while a - ref < -math.pi:
            a += 2 * math.pi
        return a
    a2 = norm(a2, a1)
    a3 = norm(a3, a2)
    pts = []
    for k in range(n):
        f = k / (n - 1)
        a = a1 + (a3 - a1) * f
        pts.append((ux + r * math.cos(a), uy + r * math.sin(a)))
    return pts
