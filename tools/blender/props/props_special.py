"""Special gameplay objects: Mythic+ portal, Font of Power, keystone, lobby obelisk, waypoint stone."""
from common import *

ARCANE = '#9a5cff'
TEAL = '#3fe8d2'


def t_rune_band(stone, glow, w=64, h=16, seed=0, gw=5, gh=7):
    """horizontal band of glowing glyphs on dark stone (for rings / strips)."""
    base = t_stone(stone, max(w, h), seed=seed, cracks=1)[:h, :w]
    m = rune_mask(h, w, seed=seed + 1, gw=gw, gh=gh, padx=1, pady=(h - gh) // 2, rows=1)
    y, x = grid(h, w)
    m |= (y == 1) | (y == h - 2)
    return carve(base, m, glow, stone[0], grad=False)


def t_rune_column(stone, glow, w=32, h=64, seed=0):
    """vertical column of glyphs framed by a glowing border (obelisk faces / pillar strips)."""
    base = t_bricks(stone, max(w, h), rows=8, cols=2, seed=seed, rough=0.15)[:h, :w]
    m = np.zeros((h, w), bool)
    inner = rune_mask(h - 8, 7, seed=seed + 3, gw=5, gh=7, padx=1, pady=1)
    cx = (w - 7) // 2
    m[4:h - 4, cx:cx + 7] = inner
    y, x = grid(h, w)
    m |= ((x == cx - 3) | (x == cx + 9)) & (y > 2) & (y < h - 3)
    return carve(base, m, glow, stone[0])


def voussoir(r_in, r_out, a0, a1, depth, zc, mat):
    """wedge-shaped arch block between angles a0..a1 (degrees) around (0, zc) in the XZ plane."""
    pts = []
    for (r, a) in ((r_in, a0), (r_out, a0), (r_out, a1), (r_in, a1)):
        pts.append((r * math.cos(math.radians(a)), zc + r * math.sin(math.radians(a))))
    # CCW as seen from -Y
    poly = [pts[0], pts[1], pts[2], pts[3]]
    e1 = np.array(poly[1]) - poly[0]; e2 = np.array(poly[2]) - poly[0]
    if e1[0] * e2[1] - e1[1] * e2[0] < 0:
        poly = poly[::-1]
    return P_prism(poly, depth, mat, uv=('face', 1, 1))


# ====================================================================== Mythic+ portal

@asset('mplus_portal', 'Kadim Zindan Geçidi (Mythic+)', 'Mythic+ zindan giriş kapısı; anahtar taşı aktifken portal yüzeyi parlar', 'special',
       emissive="'portal_surface' (mor girdap), sütun rün şeritleri, kilit taşı mücevheri",
       attach="'portal_surface' ayrı mesh: girdap UV merkezli (texture.center=0.5,0.5 ile döndür); 'enter_trigger' (giriş noktası), 'light_0' (portal merkezi)")
def mplus_portal(ctx):
    stone = ramp('#5d5a6e', 5, lo=0.38, hi=1.25)
    glow = ramp(ARCANE, 4, lo=0.55, hi=1.3)
    ctx.mat('stone', t_bricks(stone, 32, rows=4, cols=2, seed=201, rough=0.25))
    ctx.mat('block', t_stone(stone, 32, seed=202, cracks=3))
    vb = t_stone(stone, 32, seed=203, cracks=1)
    y, x = grid(32, 32)
    vb[(x == 0) | (y == 0) | (x == 31) | (y == 31)] = stone[0]
    vb[(x == 1) | (y == 1)] = stone[-1]
    ctx.mat('vous', vb)
    rgb, em = t_rune_column(stone, glow, 16, 64, seed=7)
    ctx.mat('runes', rgb, emit=em, emit_strength=2.4)
    ctx.mat('gem', t_crystal(glow, 16, seed=3), emit='same', emit_strength=2.5)
    swirl = ramp(ARCANE, 6, lo=0.25, hi=1.35, hue=0.18)
    ctx.mat('portal', t_swirl(swirl, 64, seed=5, arms=3, twist=3.4), emit='same', emit_strength=2.6, double=True)
    parts = []
    # platform with front steps
    parts.append(P_box(7.0, 3.0, 0.25, 'stone', uv=('box', 0.8)))
    parts.append(P_box(6.2, 2.3, 0.22, 'stone', uv=('box', 0.8), z0=0.25))
    parts.append(P_box(3.6, 0.6, 0.12, 'stone', uv=('box', 1.0), z0=0.0).T(loc=(0, -1.75, 0)))
    zb = 0.47
    px = 2.35
    for sx in (-1, 1):
        parts.append(P_box(1.35, 1.35, 0.5, 'block', uv=('face', 1, 1), z0=zb).T(loc=(sx * px, 0, 0)))
        parts.append(P_fbox(1.0, 1.0, 0.88, 0.88, 2.9, 'stone', uv=('box', 0.9), z0=zb + 0.5).T(loc=(sx * px, 0, 0)))
        # glowing rune strip on the front of each shaft
        parts.append(P_box(0.34, 0.06, 2.5, 'runes', uv=('face', 1, 1), z0=zb + 0.7).T(loc=(sx * px, -0.5, 0)))
        parts.append(P_box(1.3, 1.3, 0.35, 'block', uv=('face', 1, 1), z0=zb + 3.4).T(loc=(sx * px, 0, 0)))
        # horn / spike on the outer capital corner
        parts.append(P_lathe([(0.2, 0.0), (0.12, 0.5), (0.0, 1.0)], 4, 'block', uv=('cylfit', 1), phase=math.pi / 4)
                     .T(rot=(0, sx * 25, 0)).T(loc=(sx * (px + 0.35), 0, zb + 3.75)))
    zc = zb + 3.75
    r_in, r_out = px - 0.5, px + 0.42
    n = 7
    for i in range(n):
        a0, a1 = 180 * i / n, 180 * (i + 1) / n
        if i == n // 2:
            continue
        parts.append(voussoir(r_in, r_out, a0, a1, 1.0, zc, 'vous'))
    # keystone block (taller, protruding) with a gem
    a0, a1 = 180 * (n // 2) / n, 180 * (n // 2 + 1) / n
    ks = voussoir(r_in - 0.12, r_out + 0.3, a0, a1, 1.2, zc, 'block')
    parts.append(ks)
    parts.append(P_lathe([(0.0, -0.22), (0.18, 0.0), (0.0, 0.22)], 6, 'gem', uv=('cylfit', 1)).T(rot=(90, 0, 0))
                 .T(loc=(0, -0.62, zc + r_out - 0.1)))
    ctx.obj('mplus_portal', parts, ao_h=1.2)
    # portal surface: arch-shaped fan, UVs centred so the swirl spins around (0.5, 0.5)
    zbot, zmid = zb, (zb + zc + r_in) / 2
    Rv = (zc + r_in - zb) / 2
    outline = [(-r_in, zbot), (r_in, zbot), (r_in, zc)]
    outline += [(r_in * math.cos(math.radians(a)), zc + r_in * math.sin(math.radians(a))) for a in range(15, 180, 15)]
    outline += [(-r_in, zc)]
    verts = [(0.0, 0.0, zmid)] + [(x, 0.0, z) for (x, z) in outline]
    faces, uvs = [], []
    m = len(outline)
    uv_of = lambda v: (0.5 + v[0] / (2 * Rv), 0.5 + (v[2] - zmid) / (2 * Rv))
    for i in range(m):
        f = (0, 1 + i, 1 + (i + 1) % m)
        faces.append(f)
        uvs.append([uv_of(verts[k]) for k in f])
    ctx.obj('portal_surface', [Part(verts, faces, 'portal', uvs=uvs, closed=False)], origin=(0, 0, zmid), ao=False)
    ctx.empty('light_0', (0, -0.6, zmid))
    ctx.empty('enter_trigger', (0, -0.3, zb))


# ====================================================================== Font of Power

@asset('font_of_power', 'Güç Kaynağı', 'Mythic+ anahtar taşı kaidesi; anahtar taşı buraya yerleştirilince zindan başlar', 'special',
       emissive="'rune_ring' (dönen rün halkası), kaide rünleri, kase parıltısı, yüzen kristaller ('shards')",
       attach="'keystone_socket' boş node (anahtar taşının oturduğu nokta, y≈1.42); 'rune_ring' ve 'shards' ayrı mesh (döndür/salla); 'light_0'")
def font_of_power(ctx):
    stone = ramp('#5f5a72', 5, lo=0.38, hi=1.25)
    glow = ramp(TEAL, 4, lo=0.5, hi=1.3)
    ctx.mat('stone', t_bricks(stone, 32, rows=2, cols=2, seed=211, rough=0.2))
    base = t_stone(stone, 32, seed=212, cracks=2)
    m = rune_mask(32, 32, seed=17, gw=5, gh=7, padx=1, pady=12, rows=1)
    rgb, em = carve(base, m, glow, stone[0])
    ctx.mat('column', rgb, emit=em, emit_strength=2.0)
    rb, re = t_rune_band(stone, glow, 64, 16, seed=9)
    ctx.mat('ring', rb, emit=re, emit_strength=2.6, double=True)
    ctx.mat('glow', t_crystal(glow, 16, seed=4), emit='same', emit_strength=2.4)
    ctx.mat('gold', t_metal(R('gold', 4), 16, seed=3, border=False, rivets=False, scratches=1, sparkle=2))
    parts = []
    parts.append(P_lathe([(1.05, 0.0), (1.05, 0.14), (0.85, 0.14), (0.85, 0.28)], 8, 'stone', uv=('cyl', 1.2),
                         phase=math.pi / 8))
    parts.append(P_lathe([(0.48, 0.28), (0.36, 0.48), (0.3, 0.95), (0.4, 1.12)], 8, 'column', uv=('cylfit', 2),
                         cap0=False, cap1=False, phase=math.pi / 8))
    parts.append(P_lathe([(0.4, 1.12), (0.58, 1.3), (0.62, 1.42), (0.54, 1.44), (0.36, 1.36)], 8, 'stone', uv=('cyl', 2.0),
                         cap0=False, cap1=True, phase=math.pi / 8))
    parts.append(P_disc(0.36, 8, 'glow', uv=('disc',), z=1.37, phase=math.pi / 8))
    parts.append(P_torus(0.6, 0.03, 8, 3, 'gold', uv=('box', 4.0), phase_u=math.pi / 8).T(loc=(0, 0, 1.4)))
    # four claws holding the bowl
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        parts.append(P_limb((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.95), (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.48),
                            0.05, 0.02, 4, 'gold', uv=('cyl', 4.0)))
    ctx.obj('font_of_power', parts, ao_h=0.5)
    ring = P_disc(0.86, 24, 'ring', uv=('polar', 6), z=0.85, r_in=0.66)
    ring.uvs = None
    ctx.obj('rune_ring', [ring], origin=(0, 0, 0.85), ao=False)
    sh = []
    for k in range(4):
        a = TAU * k / 4
        s = P_lathe([(0.0, -0.14), (0.07, 0.0), (0.0, 0.18)], 4, 'glow', uv=('cylfit', 1))
        s.T(rot=(0, 15, 0)).T(rot=(0, 0, math.degrees(a)), loc=(math.cos(a) * 1.05, math.sin(a) * 1.05, 1.15))
        sh.append(s)
    ctx.obj('shards', sh, origin=(0, 0, 1.15), ao=False)
    ctx.empty('keystone_socket', (0, 0, 1.42))
    ctx.empty('light_0', (0, 0, 1.7))


# ====================================================================== keystone

@asset('keystone', 'Kadim Anahtar Taşı', 'Mythic+ anahtar taşı eşyası (envanter/yerde/Güç Kaynağı üstünde)', 'special',
       emissive='rün oyukları ve uç kristalleri (mor)', attach="orijin alt merkez; Güç Kaynağı 'keystone_socket' noktasına oturur")
def keystone(ctx):
    stone = ramp('#3e3550', 4, lo=0.4, hi=1.3)
    glow = ramp(ARCANE, 4, lo=0.55, hi=1.35)
    base = t_stone(stone, 32, seed=221, cracks=0, amt=0.2)
    m = rune_mask(32, 32, seed=23, gw=5, gh=7, padx=1, pady=12, rows=1)
    rgb, em = carve(base, m, glow, stone[0])
    ctx.mat('stone', rgb, emit=em, emit_strength=2.2)
    ctx.mat('gold', t_metal(R('gold', 3), 8, seed=2, border=False, rivets=False, scratches=0, sparkle=1))
    ctx.mat('tip', t_crystal(glow, 8, seed=2), emit='same', emit_strength=2.5)
    parts = [P_lathe([(0.0, 0.0), (0.09, 0.03), (0.13, 0.11), (0.13, 0.19), (0.09, 0.27), (0.0, 0.3)], 6, 'stone',
                     uv=('cylfit', 2), phase=math.pi / 6)]
    parts.append(P_lathe([(0.138, 0.135), (0.138, 0.165)], 6, 'gold', uv=('cyl', 8.0), cap0=False, cap1=False,
                         phase=math.pi / 6))
    parts.append(P_lathe([(0.0, 0.26), (0.035, 0.29), (0.0, 0.36)], 4, 'tip', uv=('cylfit', 1)))
    ctx.obj('keystone', parts, ao=False)


# ====================================================================== lobby obelisk

@asset('lobby_obelisk', 'Toplanma Dikilitaşı', 'Grup/lobi buluşma noktası; 5 yuva her katılan oyuncu için yanar', 'special',
       emissive="gövde rün sütunları, tepe kristali ('obelisk_crystal'), 5 yuva taşı ('slot_1'..'slot_5')",
       attach="'slot_1'..'slot_5' ayrı mesh (parti üyesi katıldıkça emissive yak); 'obelisk_crystal' ayrı (döndür); 'light_0'")
def lobby_obelisk(ctx):
    stone = ramp('#625d70', 5, lo=0.38, hi=1.25)
    glow = ramp(TEAL, 4, lo=0.5, hi=1.3)
    ctx.mat('stone', t_bricks(stone, 32, rows=4, cols=2, seed=231))
    rgb, em = t_rune_column(stone, glow, 32, 64, seed=11)
    ctx.mat('runes', rgb, emit=em, emit_strength=2.2)
    ctx.mat('cap', t_stone(stone, 16, seed=232))
    ctx.mat('crystal', t_crystal(glow, 16, seed=5), emit='same', emit_strength=2.6)
    parts = [P_box(2.2, 2.2, 0.22, 'stone', uv=('box', 1.0)), P_box(1.7, 1.7, 0.22, 'stone', uv=('box', 1.0), z0=0.22)]
    parts.append(P_box(1.2, 1.2, 0.28, 'cap', uv=('face', 1, 1), z0=0.44))
    parts.append(P_fbox(0.9, 0.9, 0.55, 0.55, 2.75, 'runes', uv=('face', 1, 1), z0=0.72))
    parts.append(P_fbox(0.62, 0.62, 0.0, 0.0, 0.42, 'cap', uv=('face', 1, 1), z0=3.47))
    ctx.obj('lobby_obelisk', parts, ao_h=0.8)
    cr = P_lathe([(0.0, 3.95), (0.13, 4.1), (0.0, 4.35)], 4, 'crystal', uv=('cylfit', 1))
    ctx.obj('obelisk_crystal', [cr], origin=(0, 0, 4.12), ao=False)
    for k in range(5):
        a = -math.pi / 2 + TAU * k / 5
        x, y = math.cos(a) * 1.75, math.sin(a) * 1.75
        sp = [P_fbox(0.34, 0.34, 0.26, 0.26, 0.35, 'cap', uv=('face', 1, 1)),
              P_lathe([(0.0, 0.35), (0.09, 0.42), (0.0, 0.58)], 4, 'crystal', uv=('cylfit', 1))]
        for p in sp:
            p.T(rot=(0, 0, math.degrees(a) + 45), loc=(x, y, 0))
        ctx.obj(f'slot_{k + 1}', sp, origin=(x, y, 0), ao_h=0.3)
    ctx.empty('light_0', (0, 0, 3.0))


# ====================================================================== waypoint stone

@asset('waypoint_stone', 'Işınlanma Taşı', 'Waypoint / hızlı seyahat noktası; etkileşimle harita açılır', 'special',
       emissive="taş üstü rünler, zemin rün halkası ('teleport_ring'), yüzen kristal ('waypoint_crystal')",
       attach="'waypoint_crystal' ayrı mesh (süzülme+dönme), 'teleport_ring' ayrı mesh (dönme), 'arrive_point' boş node, 'light_0'")
def waypoint_stone(ctx):
    stone = ramp('#7c7a84', 5, lo=0.38, hi=1.25)
    glow = ramp('#5ab8ff', 4, lo=0.5, hi=1.3)
    ctx.mat('plat', t_bricks(stone, 32, rows=4, cols=2, seed=241))
    base = t_rock(stone, 32, cells=5, seed=242, crack=0.5, light=0.25)
    m = rune_mask(32, 32, seed=29, gw=5, gh=7, padx=1, pady=1, rows=2, fill=0.8)
    rgb, em = carve(base, m, glow, stone[0])
    ctx.mat('menhir', rgb, emit=em, emit_strength=2.0)
    rb, re = t_rune_band(stone, glow, 64, 16, seed=13)
    ctx.mat('ring', rb, emit=re, emit_strength=2.4, double=True)
    ctx.mat('crystal', t_crystal(glow, 16, seed=6), emit='same', emit_strength=2.6)
    parts = [P_lathe([(1.55, 0.0), (1.55, 0.12), (1.45, 0.18)], 12, 'plat', uv=('cyl', 1.0), cap1=True)]
    mh = P_lathe([(0.48, 0.1), (0.52, 0.7), (0.4, 1.6), (0.24, 2.25), (0.0, 2.45, 0.05, 0.0)], 6, 'menhir',
                 uv=('cylfit', 2), jitter=0.07, seed=4)
    mh.T(scale=(1.0, 0.72, 1.0)).T(loc=(0, 0.35, 0))
    parts.append(mh)
    ctx.obj('waypoint_stone', parts, ao_h=0.5)
    ctx.obj('teleport_ring', [P_disc(1.35, 24, 'ring', uv=('polar', 8), z=0.185, r_in=1.08)], origin=(0, 0, 0.185), ao=False)
    cr = P_lathe([(0.0, 2.75), (0.18, 3.0), (0.0, 3.35)], 4, 'crystal', uv=('cylfit', 1))
    ctx.obj('waypoint_crystal', [cr.T(loc=(0, 0.35, 0))], origin=(0, 0.35, 3.02), ao=False)
    ctx.empty('arrive_point', (0, -0.6, 0.18))
    ctx.empty('light_0', (0, 0.35, 3.0))
