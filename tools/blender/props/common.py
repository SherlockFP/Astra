"""Shared palettes, textures and reusable component builders for the props area."""
from psx_lib import *

# ------------------------------------------------------------------ base colours
C = dict(
    wood='#8a5a34', wood_d='#5f3d24', wood_l='#a9804f', wood_red='#7a2f24',
    bark='#5d4630', bark_d='#463a33',
    iron='#5d636c', iron_d='#40444b', steel='#8a9099', gold='#d6a53c', bronze='#a8743a',
    stone='#8d8b84', stone_d='#6b6875', stone_w='#a59f8e', sand='#b39c74', moss='#55753a',
    pine='#2f5f3c', oak='#4c7e30', autumn='#c4632a', autumn2='#d8a33a', dead='#6b5a4a',
    red='#a8322c', blue='#2f4f9c', green='#3d7a39', white='#d9d1bd', purple='#5a2f86',
    straw='#c8a64e', burlap='#a38a5b', bone='#d6cdb0', parch='#e0cf9d', ink='#2b211c',
    fire='#ff8a2a', coal='#2d2826', cyan='#46e6d2', arcane='#b06bff', blue_glow='#4fb8ff',
    soil='#6e5238', water='#2c4a5e', black='#1d1a20',
)

EMBER4 = np.array([[0.6, 0.14, 0.04], [0.95, 0.38, 0.06], [1.0, 0.66, 0.18], [1.0, 0.9, 0.5]])
FIRE5 = np.concatenate([EMBER4, [[1.0, 0.97, 0.78]]], 0)


def R(key, n=5, **kw):
    return ramp(C.get(key, key), n, **kw)


# ------------------------------------------------------------------ textures
def t_crate(wood, size=32, frame=4, seed=3, brace=True):
    n = len(wood)
    rgb = t_planks(wood, size, planks=4, seed=seed, horizontal=True, ends=False, knots=1)
    y, x = grid(size, size)
    fr = (x < frame) | (x >= size - frame) | (y < frame) | (y >= size - frame)
    v = 0.62 + (vnoise(size, size, 2, 6, seed + 4, 2) - 0.5) * 0.4
    fi = dq(v, n)
    if brace:
        d = np.abs((size - 1 - y) - x)
        bm = (d <= 2) & ~fr
        rgb[bm] = wood[fi][bm]
        rgb[(d == 3) & ~fr & (x > y - size)] = wood[0]
        edge = (d == 2) & ~fr
        rgb[edge] = wood[min(n - 1, 3)]
    rgb[fr] = wood[fi][fr]
    inner = ((x == frame) | (y == frame) | (x == size - frame - 1) | (y == size - frame - 1)) & ~fr
    rgb[inner] = wood[0]
    rgb[((x == 1) | (y == 1)) & fr] = wood[n - 1]
    rgb[(x == 0) | (y == 0) | (x == size - 1) | (y == size - 1)] = wood[0]
    for (cy, cx) in ((2, 2), (2, size - 3), (size - 3, 2), (size - 3, size - 3)):
        rgb[cy, cx] = wood[n - 1]
        rgb[cy + 1, cx] = wood[0]
    return rgb


def t_chest_inside(pal, size=16, coins=None, seed=2):
    rgb = t_planks(pal, size, planks=2, seed=seed, ends=False, knots=0)
    if coins is not None:
        rng = np.random.default_rng(seed)
        n = len(coins)
        for k in range(40):
            cy, cx = int(rng.integers(0, size)), int(rng.integers(0, size))
            rgb[cy, cx] = coins[n - 1]
            rgb[cy, (cx + 1) % size] = coins[n - 2]
            rgb[(cy + 1) % size, cx] = coins[1]
    return rgb


# ------------------------------------------------------------------ materials
def mat_planks(ctx, key='wood', col='wood', n=5, seed=1, planks=4, horizontal=False, nails=False, size=32):
    return ctx.mat(key, t_planks(R(col, n), size, planks=planks, seed=seed, horizontal=horizontal, nails=nails))


def mat_iron(ctx, key='iron', col='iron', n=4, seed=2, border=False, rivets=False, size=16, sparkle=0):
    return ctx.mat(key, t_metal(R(col, n), size, seed=seed, border=border, rivets=rivets, scratches=3,
                                sparkle=sparkle))


def mat_flame(ctx, key='flame', seed=1, strength=3.0):
    rgb, a = t_flame_card(FIRE5, 32, seed=seed)
    return ctx.mat(key, rgb, alpha=a, emit='same', emit_strength=strength, double=True)


# ------------------------------------------------------------------ components
def flame_cards(mat, center, h, w, count=2, rot0=0.0):
    parts = []
    for i in range(count):
        p = P_grid(w, h, 1, 1, mat, uv=('fit', 'xz'))
        p.T(loc=center, rot=(0, 0, rot0 + 180.0 * i / count))
        parts.append(p)
    return parts


def crate_parts(sx, sy, sz, mat, z0=0.0, rot=0.0, loc=(0, 0)):
    p = P_box(sx, sy, sz, mat, uv=('face', 1, 1), z0=z0)
    p.T(loc=(loc[0], loc[1], 0), rot=(0, 0, rot))
    return [p]


def barrel_parts(mat_staves, mat_band, mat_top, r=0.36, h=1.05, n=10, loc=(0, 0, 0), rot=(0, 0, 0)):
    prof = [(r * 0.84, 0.0), (r * 0.95, h * 0.18), (r, h * 0.5), (r * 0.95, h * 0.82), (r * 0.84, h)]
    body = P_lathe(prof, n, mat_staves, uv=('cyl', 1.6), cap0=True, cap1=False)
    parts = [body]
    for zf, rf in ((0.1, 0.9), (0.3, 0.985), (0.7, 0.985), (0.9, 0.9)):
        z = h * zf
        rr = r * rf + 0.012
        parts.append(P_lathe([(rr, z - 0.035), (rr, z + 0.035)], n, mat_band, uv=('cyl', 2.0),
                             cap0=False, cap1=False))
    parts.append(P_disc(r * 0.82, n, mat_top, uv=('disc',), z=h - 0.03))
    for p in parts:
        p.T(loc=loc, rot=rot)
    return parts


def sack_part(mat, r=0.3, h=0.55, seed=0, loc=(0, 0, 0), rot=(0, 0, 0), tied=True):
    prof = [(r * 0.75, 0.0), (r, h * 0.2), (r * 1.02, h * 0.5), (r * 0.8, h * 0.8)]
    if tied:
        prof += [(r * 0.25, h * 0.93), (r * 0.35, h), (0.0, h * 1.02)]
    else:
        prof += [(r * 0.55, h * 0.95), (0.0, h * 0.98)]
    p = P_lathe(prof, 8, mat, uv=('cyl', 1.6), cap0=True, cap1=False, jitter=0.025, seed=seed)
    return p.T(loc=loc, rot=rot)


def rock_part(mat, r, seed, sub=1, squash=(1, 1, 0.7), jitter=0.22, loc=(0, 0, 0), rot=(0, 0, 0), sink=0.15,
              uv=('box', 1.0)):
    p = P_ico(r, sub, mat, uv=uv, jitter=jitter, seed=seed, squash=squash, flat_bottom=-r * squash[2] * (1 - sink))
    p.v[:, 2] -= p.v[:, 2].min()
    return p.T(loc=loc, rot=rot)


def log_part(mat_bark, r, length, n=6, loc=(0, 0, 0), rot=(0, 0, 0), mat_end=None):
    """log lying along X; caps get mat_end (endgrain) as separate discs."""
    p = P_lathe([(r, -length / 2), (r * 0.95, length / 2)], n, mat_bark, uv=('cyl', 1.5), cap0=mat_end is None,
                cap1=mat_end is None, jitter=0.06, seed=int(length * 100))
    parts = [p]
    if mat_end:
        for zz, flip in ((-length / 2, True), (length / 2, False)):
            d = P_disc(r * (1.0 if flip else 0.95), n, mat_end, uv=('disc',), z=zz)
            if flip:
                d.f = [tuple(reversed(f)) for f in d.f]
            parts.append(d)
    for q in parts:
        q.T(rot=(0, 90, 0)).T(loc=loc, rot=rot)
    return parts


def candle_parts(mat_wax, mat_flame, loc, h=0.22, r=0.04):
    x, y, z = loc
    c = P_cyl(r, h, 5, mat_wax, uv=('cyl', 4.0), z0=z)
    c.T(loc=(x, y, 0))
    fl = P_lathe([(0.0, 0.0), (0.028, 0.04), (0.0, 0.11)], 4, mat_flame, uv=('cylfit', 1), cap0=False, cap1=False)
    fl.T(loc=(x, y, z + h))
    return [c, fl]


def arch_lid_part(w, d, h, segs, mat, z0=0.0, y0=0.0):
    """chest lid: curved top running along X. Explicit UVs: u along X, v along arc."""
    prof = []
    for i in range(segs + 1):
        t = math.pi * i / segs
        prof.append((-d / 2 * math.cos(t), z0 + h * math.sin(t)))   # (y, z) front->back
    m = len(prof)
    verts = [(-w / 2, y + y0, z) for (y, z) in prof] + [(w / 2, y + y0, z) for (y, z) in prof]
    faces, uvs = [], []
    seglen = [0.0]
    for i in range(1, m):
        seglen.append(seglen[-1] + math.dist(prof[i], prof[i - 1]))
    tot = seglen[-1]
    for i in range(m - 1):
        faces.append((i, m + i, m + i + 1, i + 1))
        uvs.append([(0, seglen[i] / tot), (1, seglen[i] / tot), (1, seglen[i + 1] / tot), (0, seglen[i + 1] / tot)])
    # end caps (fit)
    left = tuple(range(m - 1, -1, -1)); right = tuple(range(m, 2 * m))
    for cap in (left, right):
        faces.append(cap)
        uvs.append([((verts[k][1] - y0) / d + 0.5, (verts[k][2] - z0) / h) for k in cap])
    # bottom
    faces.append((0, m - 1, 2 * m - 1, m))
    uvs.append([(0, 0), (0, 1), (1, 1), (1, 0)])
    return Part(verts, faces, mat, uv=('face', 1, 1), uvs=uvs)


def add_open_anim(lid, angle=-105.0, frames=(1, 8, 12, 15)):
    """'Open' action: lid rotates around its local X (hinge)."""
    scn = bpy.context.scene
    scn.render.fps = 24
    lid.rotation_mode = 'XYZ'
    act = bpy.data.actions.new('Open')
    lid.animation_data_create()
    lid.animation_data.action = act
    keys = [(frames[0], 0.0), (frames[1], angle * 1.06), (frames[2], angle * 0.97), (frames[3], angle)]
    for f, a in keys:
        lid.rotation_euler = (math.radians(a), 0, 0)
        lid.keyframe_insert('rotation_euler', index=0, frame=f)
    lid.rotation_euler = (0, 0, 0)
    try:
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
    except Exception:
        pass
    return act


# ------------------------------------------------------------------ more helpers
def sheet(p00, p10, p01, p11, nx, ny, mat, sag=0.0, wave=0.0, wave_f=2.0, uvscale=(1.0, 1.0), offs=None):
    """bilinear cloth patch. p00 bottom-left, p10 bottom-right, p01 top-left, p11 top-right as seen
    from the front side. sag lowers the middle along -Z; wave pushes along the patch normal.
    offs(i, j) -> (dx, dy, dz) extra per-vertex offset."""
    P = [np.array(p, float) for p in (p00, p10, p01, p11)]
    nrm = np.cross(P[1] - P[0], P[2] - P[0])
    nrm = nrm / (np.linalg.norm(nrm) + 1e-9)
    verts, uvp = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            p = (1 - u) * (1 - v) * P[0] + u * (1 - v) * P[1] + (1 - u) * v * P[2] + u * v * P[3]
            p[2] -= sag * math.sin(math.pi * u) * math.sin(math.pi * v)
            if wave:
                p = p + nrm * wave * math.sin(u * TAU * wave_f + v * 2.0) * (0.3 + 0.7 * (1 - v))
            if offs:
                p = p + np.array(offs(i, j))
            verts.append(p)
            uvp.append((u * uvscale[0], v * uvscale[1]))
    faces, uvs = [], []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            f = (a, a + 1, a + nx + 2, a + nx + 1)
            faces.append(f)
            uvs.append([uvp[k] for k in f])
    return Part(verts, faces, mat, uvs=uvs, closed=False)


def quad(p0, p1, p2, p3, mat, uv=((0, 0), (1, 0), (1, 1), (0, 1)), closed=False):
    """single quad p0..p3 CCW as seen from the visible side, explicit UVs."""
    return Part([p0, p1, p2, p3], [(0, 1, 2, 3)], mat, uvs=[list(uv)], closed=closed)


def t_potion2(glass, liquid, size=16, level=0.65):
    rgb = t_potion(glass, liquid, size, level)
    y, x = grid(size, size)
    emit = np.zeros_like(rgb)
    liq = y > size * (1 - level)
    emit[liq] = rgb[liq]
    return rgb, emit


def t_lantern(glow, iron, size=16):
    y, x = grid(size, size)
    rgb = glow[dq(0.95 - y / size * 0.55 + (vnoise(size, size, 2, 2, 4, 2) - 0.5) * 0.2, len(glow))]
    emit = rgb.copy()
    fr = (x < 2) | (x >= size - 2) | (y < 2) | (y >= size - 2) | (x == size // 2)
    rgb[fr] = iron[1]
    rgb[(x == 0) | (y == 0) | (x == size - 1) | (y == size - 1)] = iron[0]
    rgb[(y == 1) & fr] = iron[-1]
    emit[fr] = 0
    return rgb, emit


def t_water(pal, size=16, seed=0):
    rgb = t_flat(pal, size, seed, amt=0.25)
    rng = np.random.default_rng(seed)
    for k in range(5):
        y, x = int(rng.integers(0, size)), int(rng.integers(0, size - 3))
        rgb[y, x:x + 3] = pal[-1]
    return rgb


def stake_rope(mat_rope, a, b, r=0.012):
    return P_limb(a, b, r, r, 3, mat_rope, uv=('cyl', 4.0), cap1=False)


def t_boulder(pal, size=32, seed=0, strata=3, cracks=4, speck=14):
    """natural rock: low-frequency noise + soft strata bands + a few random-walk cracks (no cobble cells)."""
    n = len(pal); h = w = size
    rng = np.random.default_rng(seed)
    y, x = grid(h, w)
    nz = vnoise(h, w, 3, 3, seed, 4, 0.55)
    st = np.sin((y / h) * TAU * strata + vnoise(h, w, 2, 2, seed + 1, 2) * 5.0) * 0.12
    v = 0.48 + (nz - 0.5) * 0.85 + st
    idx = dq(v, n)
    for k in range(cracks):
        cx, cy = int(rng.integers(0, w)), int(rng.integers(0, h))
        dx = int(rng.choice([-1, 1]))
        for s in range(int(rng.integers(5, 11))):
            idx[cy % h, cx % w] = 0
            idx[(cy + 1) % h, cx % w] = min(n - 1, idx[(cy + 1) % h, cx % w] + 1)
            cx += dx if rng.random() < 0.7 else 0
            cy += int(rng.integers(0, 2)) if rng.random() < 0.6 else 0
    for k in range(speck):
        yy, xx = int(rng.integers(0, h)), int(rng.integers(0, w))
        idx[yy, xx] = n - 1 if k % 2 else max(0, idx[yy, xx] - 2)
    return pal[idx]
