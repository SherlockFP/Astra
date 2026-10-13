"""Nature props: trees, bushes, grass, flowers, rocks, fences."""
from common import *
from psx_lib import _newell


def split_top(part, top_mat, thresh=0.55):
    """split faces by world normal: faces pointing up get top_mat (grass/moss caps)."""
    W = part.world()
    top, rest = [], []
    for f in part.f:
        n = _newell(W[list(f)])
        (top if n[2] > thresh else rest).append(f)
    a = part.copy(); a.f = rest; a.closed = False
    b = part.copy(); b.f = top; b.mat = top_mat; b.closed = False
    return [a, b]



# ====================================================================== trees

def pine_tier(mat, r, z0, h, n=12, seed=0, droop=0.28, star=(1.0, 0.62)):
    prof = [(0.0, z0 + h * 0.14), (r, z0), (r * 0.42, z0 + h * 0.48), (0.0, z0 + h)]
    p = P_lathe(prof, n, mat, uv=('cyl', 1.1), cap0=False, cap1=False, star=list(star), jitter=0.07, seed=seed,
                phase=seed * 0.37)
    for i in range(n):
        if i % 2 == 0:
            p.v[1 + i, 2] -= droop
    return p


def trunk(mat, h, r0, r1, n=6, flare=1.5, seed=0, bend=(0, 0)):
    prof = [(r0 * flare, 0.0), (r0, h * 0.12), (r0 * 0.85 + r1 * 0.15, h * 0.5, bend[0] * 0.4, bend[1] * 0.4),
            (r1, h, bend[0], bend[1])]
    return P_lathe(prof, n, mat, uv=('cyl', 1.3), cap0=False, cap1=True, jitter=0.05, seed=seed)


def _pine(ctx, col, tiers, trunk_h, seed):
    ctx.mat('needles', t_needles(ramp(col, 5, lo=0.42, hi=1.3), 32, seed=seed))
    ctx.mat('bark', t_bark(R('bark', 4), 32, seed=seed + 1))
    parts = [trunk('bark', trunk_h, 0.2, 0.07, n=6, seed=seed)]
    for i, (r, z0, h) in enumerate(tiers):
        parts.append(pine_tier('needles', r, z0, h, seed=seed + i))
    ctx.obj(ctx.aid, parts, ao_h=1.6, ao_min=0.55, down=0.7)


@asset('tree_pine_a', 'Çam Ağacı', 'Açık dünya ormanı, kasaba çevresi (uzun çam)', 'nature')
def tree_pine_a(ctx):
    _pine(ctx, C['pine'], [(1.9, 1.0, 2.3), (1.55, 2.15, 2.1), (1.2, 3.15, 1.9), (0.85, 4.05, 1.7), (0.5, 4.85, 1.6)],
          3.5, seed=11)


@asset('tree_pine_b', 'Kara Çam', 'Açık dünya ormanı (gür, kısa koyu çam)', 'nature')
def tree_pine_b(ctx):
    _pine(ctx, '#2a5a52', [(2.25, 0.75, 2.5), (1.75, 1.95, 2.3), (1.2, 3.0, 2.1), (0.6, 3.9, 1.3)], 2.6, seed=23)


def _canopy(ctx, blobs, mat_cycle):
    parts = []
    for i, (r, x, y, z, sub, sq) in enumerate(blobs):
        m = mat_cycle[i % len(mat_cycle)]
        p = P_ico(r, sub, m, uv=('box', 1.1), jitter=0.13, seed=i * 13 + 5, squash=sq)
        p.T(loc=(x, y, z))
        p.tint = 0.86 if i % 3 == 2 else 1.0
        parts.append(p)
    return parts


def _branches(mat, base, ends, r0=0.15, r1=0.06):
    return [P_limb(base, e, r0, r1, 5, mat, uv=('cyl', 1.5)) for e in ends]


@asset('tree_oak_a', 'Meşe Ağacı', 'Kasaba meydanı, açık dünya (yuvarlak taçlı meşe)', 'nature')
def tree_oak_a(ctx):
    ctx.mat('leaves', t_leaves(ramp(C['oak'], 5, lo=0.4, hi=1.3), 32, seed=3))
    ctx.mat('bark', t_bark(R('bark', 4), 32, seed=4))
    parts = [trunk('bark', 2.6, 0.28, 0.2, n=7, seed=1)]
    parts += _branches('bark', (0, 0, 2.0), [(1.0, 0.3, 3.0), (-0.9, -0.4, 3.1), (0.1, -0.9, 2.9), (-0.2, 0.8, 3.2)])
    parts += _canopy(ctx, [(1.75, 0, 0, 3.75, 2, (1.1, 1.05, 0.82)), (1.05, 1.35, 0.3, 3.2, 1, (1, 1, 0.85)),
                           (1.0, -1.3, -0.4, 3.3, 1, (1, 1, 0.85)), (0.95, 0.2, -1.25, 3.05, 1, (1, 1, 0.85)),
                           (1.0, -0.3, 1.2, 3.35, 1, (1, 1, 0.85)), (0.85, 0.3, 0.2, 4.85, 1, (1, 1, 0.8))],
                     ['leaves'])
    ctx.obj(ctx.aid, parts, ao_h=2.5, ao_min=0.55, down=0.7)


@asset('tree_oak_b', 'Yaşlı Meşe', 'Geniş taçlı yaşlı meşe, kasaba odak noktası / gölge alanı', 'nature')
def tree_oak_b(ctx):
    ctx.mat('leaves', t_leaves(ramp('#4a7a34', 5, lo=0.38, hi=1.25), 32, seed=8))
    ctx.mat('bark', t_bark(R('bark_d', 4, hue=0.05), 32, seed=9))
    parts = [trunk('bark', 1.9, 0.42, 0.32, n=8, flare=1.6, seed=2)]
    parts.append(P_limb((0.1, 0, 1.6), (1.2, 0.3, 3.4), 0.3, 0.16, 6, 'bark', uv=('cyl', 1.3)))
    parts.append(P_limb((-0.1, 0, 1.6), (-1.1, -0.2, 3.6), 0.3, 0.16, 6, 'bark', uv=('cyl', 1.3)))
    parts += _branches('bark', (1.0, 0.25, 3.0), [(2.2, 0.8, 3.6), (1.5, -0.9, 3.8)], 0.12, 0.05)
    parts += _branches('bark', (-0.9, -0.2, 3.1), [(-2.1, 0.6, 3.7), (-1.4, -1.1, 4.0)], 0.12, 0.05)
    parts += _canopy(ctx, [(1.7, 1.3, 0.2, 4.2, 2, (1.15, 1.1, 0.7)), (1.7, -1.2, -0.2, 4.4, 2, (1.15, 1.1, 0.7)),
                           (1.1, 2.4, 0.9, 3.7, 1, (1, 1, 0.75)), (1.1, -2.3, 0.7, 3.9, 1, (1, 1, 0.75)),
                           (1.1, 0.2, -1.5, 3.9, 1, (1, 1, 0.75)), (1.15, 0.0, 1.4, 4.0, 1, (1, 1, 0.75)),
                           (1.0, 0.1, 0.0, 5.3, 1, (1.2, 1.2, 0.6))], ['leaves'])
    ctx.obj(ctx.aid, parts, ao_h=2.0, ao_min=0.55, down=0.7)


@asset('tree_dead', 'Kuru Ağaç', 'Mezarlık, lanetli bölgeler, zindan girişi', 'nature')
def tree_dead(ctx):
    ctx.mat('bark', t_bark(ramp(C['dead'], 4, hue=0.04), 32, seed=12))
    rng = np.random.default_rng(5)
    parts = [trunk('bark', 3.2, 0.26, 0.09, n=6, flare=1.7, seed=3, bend=(0.25, -0.1))]
    mains = [((0.1, 0, 1.8), (1.3, 0.2, 3.0)), ((0.05, 0, 2.3), (-1.1, 0.5, 3.4)),
             ((0.2, -0.05, 2.8), (0.5, -1.0, 3.9)), ((0.25, -0.1, 3.1), (0.1, 0.4, 4.4)),
             ((0.0, 0, 1.2), (-0.9, -0.6, 1.9))]
    for (a, b) in mains:
        parts.append(P_limb(a, b, 0.11, 0.035, 5, 'bark', uv=('cyl', 1.5)))
        a3, b3 = np.array(a), np.array(b)
        for k in range(2):
            t = rng.uniform(0.55, 0.85)
            s = a3 + (b3 - a3) * t
            e = s + np.array([rng.uniform(-0.7, 0.7), rng.uniform(-0.7, 0.7), rng.uniform(0.2, 0.7)])
            parts.append(P_limb(tuple(s), tuple(e), 0.045, 0.015, 4, 'bark', uv=('cyl', 1.5)))
    ctx.obj(ctx.aid, parts, ao_h=1.5, ao_min=0.55)


@asset('tree_autumn', 'Sonbahar Ağacı', 'Açık dünya renk çeşitliliği (turuncu/sarı yapraklı)', 'nature')
def tree_autumn(ctx):
    ctx.mat('leaves', t_leaves(ramp(C['autumn'], 5, lo=0.42, hi=1.3), 32, seed=14))
    ctx.mat('leaves2', t_leaves(ramp(C['autumn2'], 4, lo=0.5, hi=1.25), 32, seed=15))
    ctx.mat('bark', t_bark(R('bark', 4), 32, seed=16))
    parts = [trunk('bark', 2.9, 0.24, 0.16, n=6, seed=4, bend=(-0.15, 0.1))]
    parts += _branches('bark', (-0.1, 0.05, 2.2), [(0.8, 0.4, 3.2), (-1.0, 0.0, 3.3), (0.0, -0.8, 3.4)])
    parts += _canopy(ctx, [(1.45, -0.1, 0.0, 4.0, 2, (1.0, 1.0, 0.95)), (0.95, 0.95, 0.4, 3.5, 1, (1, 1, 0.9)),
                           (0.95, -1.1, 0.1, 3.6, 1, (1, 1, 0.9)), (0.9, 0.0, -0.9, 3.4, 1, (1, 1, 0.9)),
                           (0.75, -0.1, 0.15, 5.1, 1, (1, 1, 0.9))], ['leaves', 'leaves2'])
    ctx.obj(ctx.aid, parts, ao_h=2.5, ao_min=0.55, down=0.7)


# ====================================================================== bushes / ground cover

@asset('bush_a', 'Çalı', 'Yol kenarı / kasaba bahçesi yeşil çalı', 'nature')
def bush_a(ctx):
    ctx.mat('leaves', t_leaves(ramp('#4f8a35', 5, lo=0.4, hi=1.3), 32, seed=21))
    parts = _canopy(ctx, [(0.62, 0, 0, 0.5, 2, (1.2, 1.1, 0.85)), (0.45, 0.55, 0.15, 0.35, 1, (1, 1, 0.8)),
                          (0.42, -0.5, -0.15, 0.33, 1, (1, 1, 0.8)), (0.4, 0.05, 0.5, 0.32, 1, (1, 1, 0.8))],
                    ['leaves'])
    for p in parts:
        p.v[:, 2] = np.maximum(p.v[:, 2], -p.M[2, 3] / max(p.M[2, 2], 1e-6))
    ctx.obj(ctx.aid, parts, ao_h=0.8, ao_min=0.5, down=0.7)


@asset('bush_b', 'Böğürtlen Çalısı', 'Orman kenarı meyveli çalı (kırmızı meyveler)', 'nature')
def bush_b(ctx):
    pal = ramp('#3d6b3a', 5, lo=0.4, hi=1.25)
    rgb = t_leaves(pal, 32, seed=22)
    rng = np.random.default_rng(3)
    berry = ramp('#b8203a', 3, lo=0.5, hi=1.3)
    for k in range(14):
        y, x = int(rng.integers(0, 31)), int(rng.integers(0, 31))
        rgb[y, x] = berry[2]; rgb[y, x + 1] = berry[1]; rgb[y + 1, x] = berry[1]; rgb[y + 1, x + 1] = berry[0]
    ctx.mat('leaves', rgb)
    ctx.mat('bark', t_bark(R('bark', 3), 16, seed=2))
    parts = [P_limb((0, 0, 0), (0.1, 0.05, 0.5), 0.07, 0.04, 4, 'bark', uv=('cyl', 2))]
    parts += _canopy(ctx, [(0.55, 0, 0, 0.75, 2, (1.0, 1.0, 1.05)), (0.42, 0.42, 0.1, 0.45, 1, (1, 1, 0.9)),
                           (0.4, -0.38, 0.2, 0.5, 1, (1, 1, 0.9)), (0.38, 0.0, -0.4, 0.42, 1, (1, 1, 0.9)),
                           (0.3, 0.05, 0.05, 1.2, 1, (1, 1, 1))], ['leaves'])
    for p in parts[1:]:
        p.v[:, 2] = np.maximum(p.v[:, 2], -p.M[2, 3] / max(p.M[2, 2], 1e-6))
    ctx.obj(ctx.aid, parts, ao_h=0.8, ao_min=0.5, down=0.7)


@asset('grass_tuft', 'Çimen Öbeği', 'Açık dünya zemin süsü (instancing ile çok sayıda)', 'nature',
       attach='alfa-kesik (MASK) çift yüzlü kartlar')
def grass_tuft(ctx):
    rgb, a = t_grass_card(ramp('#5a9a3a', 5, lo=0.45, hi=1.3), 32, seed=4, blades=20)
    ctx.mat('grass', rgb, alpha=a, double=True)
    parts = []
    for (w, h, rz, ox) in ((0.85, 0.5, 0, 0), (0.8, 0.45, 60, 0.05), (0.75, 0.55, 120, -0.05), (0.5, 0.35, 30, 0.2)):
        parts.append(P_grid(w, h, 1, 1, 'grass', uv=('fit', 'xz')).T(rot=(0, 0, rz), loc=(ox, ox * 0.5, 0)))
    ctx.obj('grass_tuft', parts, ao_h=0.4, ao_min=0.6)


@asset('flowers', 'Kır Çiçekleri', 'Çayır, kasaba bahçeleri, mezarlık süsü', 'nature',
       attach='alfa-kesik (MASK) çift yüzlü kartlar')
def flowers(ctx):
    fl = [ramp('#d8343a', 3, lo=0.55, hi=1.25), ramp('#e8c23a', 3, lo=0.6, hi=1.2),
          ramp('#8a4ad8', 3, lo=0.55, hi=1.25), ramp('#e8e4dc', 3, lo=0.7, hi=1.05)]
    rgb, a = t_grass_card(ramp('#4f8f36', 4, lo=0.45, hi=1.2), 32, seed=9, blades=14, flowers=fl,
                          flower_chance=0.85, center=np.array([1.0, 0.9, 0.3]))
    ctx.mat('flowers', rgb, alpha=a, double=True)
    parts = []
    for (w, h, rz, ox, oy) in ((0.7, 0.45, 0, 0, 0), (0.65, 0.5, 60, 0.05, 0.02), (0.6, 0.42, 120, -0.04, 0.03),
                               (0.45, 0.32, 90, 0.35, -0.2), (0.45, 0.34, 20, -0.3, 0.25)):
        parts.append(P_grid(w, h, 1, 1, 'flowers', uv=('fit', 'xz')).T(rot=(0, 0, rz), loc=(ox, oy, 0)))
    ctx.obj('flowers', parts, ao_h=0.3, ao_min=0.65)


# ====================================================================== rocks

def _rockmats(ctx, col='stone', moss=True, seed=0, size=32):
    ctx.mat('rock', t_boulder(R(col, 5), size, seed=seed))
    if moss:
        ctx.mat('moss', t_leaves(ramp('#5f8a3a', 4, lo=0.45, hi=1.2), 16, seed=seed + 3, count=20))


@asset('rock_small', 'Küçük Taş', 'Zemin dolgusu, yol kenarı', 'nature')
def rock_small(ctx):
    _rockmats(ctx, moss=False, seed=1)
    p = rock_part('rock', 0.32, 7, sub=2, squash=(1.25, 1.0, 0.75), jitter=0.18, uv=('box', 1.4))
    ctx.obj(ctx.aid, [p], ao_h=0.3)


@asset('rock_medium', 'Kaya', 'Açık dünya engeli, zindan kenarı', 'nature')
def rock_medium(ctx):
    _rockmats(ctx, seed=2)
    p = rock_part('rock', 0.85, 3, sub=2, squash=(1.3, 1.0, 0.85), jitter=0.2, uv=('box', 1.2))
    ctx.obj(ctx.aid, split_top(p, 'moss', 0.62), ao_h=0.7)


@asset('rock_large', 'Büyük Kaya', 'Açık dünya engeli / yer işareti', 'nature')
def rock_large(ctx):
    ctx.recenter = True
    _rockmats(ctx, seed=3)
    parts = []
    for (r, s, loc, sq) in ((1.35, 11, (0, 0, 0), (1.2, 1.0, 1.0)), (0.85, 12, (1.35, 0.35, 0), (1.1, 1.0, 0.9)),
                            (0.5, 13, (-1.1, -0.6, 0), (1.2, 1.0, 0.8))):
        parts += split_top(rock_part('rock', r, s, sub=2, squash=sq, jitter=0.2, loc=loc, uv=('box', 0.9)),
                           'moss', 0.6)
    ctx.obj(ctx.aid, parts, ao_h=1.0)


@asset('rock_cliff', 'Kayalık Uçurum Parçası', 'Bölge sınırı, dağ yamacı, zindan mağara duvarı', 'nature')
def rock_cliff(ctx):
    _rockmats(ctx, col='#837d74', seed=4)
    rng = np.random.default_rng(9)
    parts = []
    layers = [(2.9, 0.0, 1.4, (0, 0)), (2.6, 1.3, 1.3, (0.2, 0.15)), (2.2, 2.5, 1.2, (-0.1, 0.3)),
              (1.6, 3.6, 1.1, (0.25, 0.2)), (0.9, 4.6, 0.6, (0.1, 0.1))]
    for i, (r, z0, h, (ox, oy)) in enumerate(layers):
        p = P_lathe([(r, z0), (r * 1.06, z0 + h * 0.5), (r * 0.9, z0 + h)], 7, 'rock', uv=('box', 0.6),
                    jitter=0.16, seed=40 + i, phase=rng.uniform(0, 1))
        p.T(loc=(ox, oy, 0), scale=(1.15, 0.8, 1.0))
        parts += split_top(p, 'moss', 0.72)
    for k in range(3):
        a = rng.uniform(0, TAU)
        parts.append(rock_part('rock', rng.uniform(0.4, 0.7), 60 + k, sub=1, loc=(math.cos(a) * 3.0, math.sin(a) * 2.2, 0),
                               uv=('box', 1.0)))
    ctx.obj(ctx.aid, parts, ao_h=2.0)


# ====================================================================== fences

@asset('fence_wood', 'Ahşap Çit', 'Kasaba/çiftlik sınırı; 4 m segment X ekseninde, uç uca dizilir', 'nature',
       attach='segment X ekseni boyunca -2..+2; direkler uçlarda')
def fence_wood(ctx):
    ctx.mat('wood', t_planks(R('wood', 5), 32, planks=2, seed=31, ends=False, knots=1))
    ctx.mat('post', t_bark(R('wood_d', 4), 16, seed=3))
    parts = []
    for i, x in enumerate((-1.92, 0.0, 1.92)):
        prof = [(0.09, 0.0), (0.09, 1.05), (0.0, 1.22)]
        parts.append(P_lathe(prof, 5, 'post', uv=('cyl', 2.0), cap0=False, jitter=0.04, seed=i)
                     .T(loc=(x, 0, 0), rot=(0, (i - 1) * 2.5, 0)))
    for (z, tilt) in ((0.42, 1.2), (0.82, -0.8)):
        parts.append(P_box(4.0, 0.06, 0.16, 'wood', uv=('box', 1.0), z0=-0.08).T(rot=(0, tilt, 0), loc=(0, -0.1, z)))
    ctx.obj(ctx.aid, parts, ao_h=0.5)


@asset('fence_stone', 'Taş Duvar', 'Alçak taş duvar; kasaba/mezarlık sınırı, 4 m segment', 'nature',
       attach='segment X ekseni boyunca -2..+2')
def fence_stone(ctx):
    ctx.mat('wall', t_bricks(R('stone', 5), 32, rows=4, cols=2, seed=5, rough=0.25))
    ctx.mat('cap', t_rock(R('stone_w', 4), 16, cells=4, seed=6))
    ctx.mat('moss', t_leaves(ramp('#5f8a3a', 4, lo=0.45, hi=1.2), 16, seed=8, count=20))
    rng = np.random.default_rng(4)
    parts = [P_box(4.0, 0.55, 0.75, 'wall', uv=('box', 1.0))]
    x = -2.0
    while x < 1.95:
        w = min(rng.uniform(0.45, 0.75), 2.0 - x)
        b = P_fbox(w - 0.02, 0.66, w - 0.08, 0.6, rng.uniform(0.14, 0.22), 'cap', uv=('box', 2.0), z0=0.75)
        b.v += rng.uniform(-0.02, 0.02, b.v.shape)
        b.T(loc=(x + w / 2, rng.uniform(-0.03, 0.03), 0), rot=(0, 0, rng.uniform(-3, 3)))
        parts.append(b)
        x += w
    for k in range(2):
        mx_ = rng.uniform(-1.6, 1.6)
        parts.append(P_box(0.5, 0.58, 0.04, 'moss', uv=('box', 2.0), z0=0.93).T(loc=(mx_, 0, 0)))
    ctx.obj(ctx.aid, parts, ao_h=0.5)
