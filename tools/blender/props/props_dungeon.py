"""Dungeon props: graves, bones, chains, cage, altar, sarcophagus, pillar, statue, crystals, chests, loot."""
from common import *

# ====================================================================== chests

CHEST = dict(
    wood=dict(w=1.1, d=0.72, bh=0.5, lh=0.3, name='Ahşap Sandık'),
    iron=dict(w=1.15, d=0.75, bh=0.52, lh=0.3),
    gold=dict(w=1.2, d=0.78, bh=0.55, lh=0.32),
    epic=dict(w=1.35, d=0.86, bh=0.6, lh=0.36),
)


def _chest(ctx, kind):
    cfg = CHEST[kind]
    w, d, bh, lh = cfg['w'], cfg['d'], cfg['bh'], cfg['lh']
    if kind == 'wood':
        wood = R('wood', 5)
        ctx.mat('body', t_planks(wood, 32, planks=3, seed=4, horizontal=True, ends=False, knots=1))
        ctx.mat('lidwood', t_planks(wood, 32, planks=4, seed=5, horizontal=False, ends=False, knots=1))
        band = R('iron_d', 4)
        ctx.mat('band', t_metal(band, 16, seed=1, border=True, rivets=False, scratches=2))
        ctx.mat('lock', t_lock(band, 16))
        ctx.mat('inside', t_chest_inside(R('wood_d', 4), 16))
        bands_x = [-w * 0.32, w * 0.32]
        corner = False
    elif kind == 'iron':
        met = R('iron', 5)
        ctx.mat('body', t_metal(met, 32, seed=3, border=True, rivets=True, scratches=6))
        ctx.mat('lidwood', t_metal(met, 32, seed=4, border=True, rivets=True, scratches=6))
        band = R('steel', 4)
        ctx.mat('band', t_metal(band, 16, seed=1, border=True, rivets=False, scratches=2))
        ctx.mat('lock', t_lock(R('bronze', 4), 16, dark=met[0]))
        ctx.mat('inside', t_chest_inside(R('wood_d', 4), 16))
        bands_x = [-w * 0.36, 0.0, w * 0.36]
        corner = True
    elif kind == 'gold':
        lac = R('wood_red', 5)
        ctx.mat('body', t_planks(lac, 32, planks=3, seed=6, horizontal=True, ends=False, knots=0))
        ctx.mat('lidwood', t_planks(lac, 32, planks=4, seed=7, ends=False, knots=0))
        band = R('gold', 5)
        ctx.mat('band', t_metal(band, 16, seed=1, border=True, rivets=False, scratches=1, sparkle=2))
        ctx.mat('lock', t_lock(band, 16, dark=lac[0]))
        ctx.mat('inside', t_chest_inside(R('wood_d', 3), 16, coins=R('gold', 4)))
        ctx.mat('gem', color=(0.2, 0.75, 1.0), emit=(0.2, 0.7, 1.0), emit_strength=1.5)
        bands_x = [-w * 0.38, -w * 0.13, w * 0.13, w * 0.38]
        corner = True
    else:  # epic
        obs = ramp('#3a2a52', 5, lo=0.35, hi=1.3)
        glow = ramp(C['arcane'], 4, lo=0.55, hi=1.35)
        base = t_metal(obs, 32, seed=8, border=True, rivets=False, scratches=3)
        rgb, em = carve(base, rune_mask(32, 32, seed=21, gw=5, gh=7, padx=1, pady=1, rows=1), glow, obs[0])
        ctx.mat('body', rgb, emit=em, emit_strength=2.0)
        base2 = t_metal(obs, 32, seed=9, border=True, rivets=False, scratches=3)
        rgb2, em2 = carve(base2, rune_mask(32, 32, seed=22, gw=5, gh=7, padx=1, pady=1, rows=1), glow, obs[0])
        ctx.mat('lidwood', rgb2, emit=em2, emit_strength=2.0)
        band = ramp('#b9a5d9', 4, lo=0.4, hi=1.2)
        ctx.mat('band', t_metal(band, 16, seed=1, border=True, rivets=False, scratches=1, sparkle=1))
        ctx.mat('lock', t_lock(R('gold', 4), 16, dark=glow[-1]))
        ctx.mat('inside', t_crystal(glow, 16, seed=3), emit='same', emit_strength=3.0)
        ctx.mat('gem', t_crystal(glow, 16, seed=4), emit='same', emit_strength=2.5)
        bands_x = [-w * 0.4, w * 0.4]
        corner = True

    parts = []
    body = P_box(w, d, bh, 'body', uv=('face', 1, 1))
    body.f = [f for i, f in enumerate(body.f) if i != 1]  # drop top -> 'inside' quad
    parts.append(body)
    x, y = w / 2 - 0.03, d / 2 - 0.03
    parts.append(Part([(-x, -y, bh - 0.04), (x, -y, bh - 0.04), (x, y, bh - 0.04), (-x, y, bh - 0.04)],
                      [(0, 1, 2, 3)], 'inside', uv=('face', 2, 1), closed=False))
    # rim of body (thin frame so the inside reads as hollow)
    for (sx, sy, px, py) in ((w, 0.04, 0, -d / 2 + 0.02), (w, 0.04, 0, d / 2 - 0.02),
                             (0.04, d, -w / 2 + 0.02, 0), (0.04, d, w / 2 - 0.02, 0)):
        parts.append(P_box(sx, sy, 0.04, 'body', uv=('box', 2.0), z0=bh - 0.04).T(loc=(px, py, 0)))
    for bx in bands_x:  # straps wrap front, back and bottom only (open top stays clear)
        for sy in (-1, 1):
            parts.append(P_box(0.08, 0.03, bh, 'band', uv=('face', 1, 1), z0=0.0).T(loc=(bx, sy * (d / 2 + 0.005), 0)))
    if corner:
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append(P_box(0.12, 0.12, bh * 0.98, 'band', uv=('face', 1, 1), z0=0.0)
                             .T(loc=(sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), 0)))
    # feet
    if kind in ('gold', 'epic'):
        for sx in (-1, 1):
            for sy in (-1, 1):
                parts.append(P_fbox(0.16, 0.16, 0.1, 0.1, 0.08, 'band', uv=('face', 1, 1), z0=-0.08)
                             .T(loc=(sx * (w / 2 - 0.06), sy * (d / 2 - 0.06), 0)))
    # lock plate on front
    parts.append(P_box(0.2, 0.05, 0.24, 'lock', uv=('face', 1, 1), z0=bh - 0.2).T(loc=(0, -d / 2 - 0.02, 0)))
    zoff = 0.08 if kind in ('gold', 'epic') else 0.0
    for p in parts:
        p.T(loc=(0, 0, zoff))
    ctx.obj(f'chest_{kind}', parts, ao_h=0.4)

    # ---- lid (pivot at back hinge)
    lp = []
    lid = arch_lid_part(w, d, lh, 6, 'lidwood', z0=bh + zoff)
    lp.append(lid)
    for bx in bands_x:
        b = arch_lid_part(0.085, d + 0.03, lh + 0.015, 6, 'band', z0=bh + zoff)
        b.T(loc=(bx, 0, 0))
        lp.append(b)
    # lock hasp on lid front
    lp.append(P_box(0.12, 0.04, 0.12, 'lock', uv=('face', 1, 1), z0=bh + zoff - 0.02).T(loc=(0, -d / 2 - 0.03, 0)))
    if kind == 'gold':
        lp.append(P_ico(0.06, 1, 'gem', uv=('box', 4.0)).T(loc=(0, -d / 2 + 0.06, bh + zoff + lh * 0.8)))
    if kind == 'epic':
        lp.append(P_lathe([(0.0, 0.0), (0.07, 0.07), (0.0, 0.24)], 4, 'gem', uv=('cylfit', 1))
                  .T(loc=(0, 0, bh + zoff + lh - 0.01)))
        for sx in (-1, 1):
            lp.append(P_lathe([(0.0, 0.0), (0.05, 0.05), (0.0, 0.18)], 4, 'gem', uv=('cylfit', 1))
                      .T(loc=(sx * (w / 2 - 0.06), -d / 2 + 0.06, bh + zoff), rot=(-25, sx * 20, 0)))
    hinge = (0, d / 2, bh + zoff)
    lid_ob = ctx.obj('lid', lp, origin=hinge, ao=False)
    add_open_anim(lid_ob)
    ctx.anim = True
    ctx.empty('loot_fx', (0, 0, bh + zoff + 0.1))


@asset('chest_wood', 'Ahşap Sandık', 'Sıradan ganimet sandığı (gri/beyaz nadirlik)', 'dungeon',
       attach="'lid' node menteşede (arka üst kenar); yerel X ekseninde -105° döndürünce açılır, 'Open' animasyonu; 'loot_fx' boş node",
       anims='Open')
def chest_wood(ctx):
    _chest(ctx, 'wood')


@asset('chest_iron', 'Demir Sandık', 'Nadir ganimet sandığı (mavi nadirlik)', 'dungeon',
       attach="'lid' menteşe pivotlu, 'Open' animasyonu; 'loot_fx'", anims='Open')
def chest_iron(ctx):
    _chest(ctx, 'iron')


@asset('chest_gold', 'Altın Sandık', 'Destansı öncesi ödül sandığı (sarı nadirlik), Mythic+ bitiş sandığı', 'dungeon',
       emissive='kapak üstü mavi mücevher',
       attach="'lid' menteşe pivotlu, 'Open' animasyonu; 'loot_fx'", anims='Open')
def chest_gold(ctx):
    _chest(ctx, 'gold')


@asset('chest_epic', 'Destansı Sandık', 'Efsanevi/destansı mor ödül sandığı (Mythic+ +10 ve üstü)', 'dungeon',
       emissive='mor rünler (gövde+kapak), iç parıltı, kristal sivri uçlar',
       attach="'lid' menteşe pivotlu, 'Open' animasyonu; 'loot_fx'", anims='Open')
def chest_epic(ctx):
    _chest(ctx, 'epic')


# ====================================================================== crystals

def _crystal(ctx, glowcol, rockcol, seed, scale=1.0, count=6):
    glow = ramp(glowcol, 5, lo=0.3, hi=1.12, sat_light=0.95)
    ctx.mat('crystal', t_crystal(glow, 32, seed=seed), emit='same', emit_strength=1.6)
    ctx.mat('rock', t_boulder(R(rockcol, 5), 32, seed=seed + 1))
    rng = np.random.default_rng(seed)
    parts = [rock_part('rock', 0.75 * scale, seed, sub=1, squash=(1.2, 1.0, 0.45), loc=(0, 0, 0))]
    spec = [(0, 0, 1.5, 0.22, 0, 0)]
    for i in range(count - 1):
        a = TAU * i / (count - 1) + rng.uniform(-0.3, 0.3)
        dist = rng.uniform(0.25, 0.5)
        spec.append((math.cos(a) * dist, math.sin(a) * dist, rng.uniform(0.5, 1.05), rng.uniform(0.1, 0.17),
                     math.degrees(a), rng.uniform(22, 42)))
    for (x, y, h, r, az, tilt) in spec:
        p = P_lathe([(r, -0.15), (r * 1.05, h * 0.72), (0.0, h)], 6, 'crystal', uv=('cylfit', 1),
                    cap0=True, cap1=False, phase=rng.uniform(0, 1))
        p.T(rot=(0, tilt, 0)).T(rot=(0, 0, az)).T(loc=(x * scale, y * scale, 0.15 * scale), scale=scale)
        parts.append(p)
    ctx.obj(ctx.aid, parts, ao_h=0.5)
    ctx.empty('light_0', (0, 0, 0.9 * scale))


@asset('crystal_blue', 'Mavi Kristal Kümesi', 'Zindan/mağara aydınlatması, maden süsü', 'dungeon',
       emissive='kristaller (mavi)', attach="'light_0' boş node: mavi PointLight için")
def crystal_blue(ctx):
    _crystal(ctx, C['blue_glow'], 'stone_d', seed=31, scale=1.0)


@asset('crystal_purple', 'Mor Kristal Kümesi', 'Büyülü zindan bölgeleri, boss odası süsü', 'dungeon',
       emissive='kristaller (mor)', attach="'light_0' boş node: mor PointLight için")
def crystal_purple(ctx):
    _crystal(ctx, C['arcane'], 'stone_d', seed=47, scale=1.3, count=7)


# ====================================================================== graves

def t_tomb(stone, size=32, seed=0, rows=2, cross=True, moss=None):
    """weathered stone with carved (dark) glyph lines and a cross emblem at the top."""
    n = len(stone)
    rgb = t_stone(stone, size, seed=seed, cracks=2)
    m = np.zeros((size, size), bool)
    if cross:
        c = size // 2
        m[4:13, c - 1:c + 1] = True
        m[7:9, c - 4:c + 4] = True
    if rows:
        gl = rune_mask(size - 18, size - 8, seed=seed + 5, gw=3, gh=5, padx=1, pady=1, rows=rows)
        m[16:size - 2, 4:size - 4] |= gl
    hl = np.zeros_like(m); hl[1:, 1:] = m[:-1, :-1]; hl &= ~m
    rgb[hl] = stone[n - 1]
    rgb[m] = stone[0]
    if moss is not None:
        y, x = grid(size, size)
        mm = (vnoise(size, size, 4, 4, seed + 9, 2) + (y / size) * 0.9) > 1.05
        rgb[mm] = moss[dq(vnoise(size, size, 8, 8, seed + 3, 1), len(moss))][mm]
    rgb[0, :] = stone[0]; rgb[-1, :] = stone[0]; rgb[:, 0] = stone[0]; rgb[:, -1] = stone[0]
    return rgb


def _grave_mound(ctx, y=-0.75, seed=1):
    ctx.mat('dirt', t_dirt(R('soil', 4), 32, seed=seed))
    p = P_ico(0.62, 2, 'dirt', uv=('box', 1.5), squash=(0.72, 1.25, 0.26), jitter=0.12, seed=seed, flat_bottom=0.0)
    return p.T(loc=(0, y, 0))


@asset('gravestone_a', 'Mezar Taşı (Kemerli)', 'Mezarlık, zindan girişi; toprak höyüklü', 'dungeon')
def gravestone_a(ctx):
    ctx.recenter = True
    stone = R('stone', 5)
    ctx.mat('tomb', t_tomb(stone, 32, seed=3, moss=ramp('#5f8a3a', 3, lo=0.5, hi=1.1)))
    ctx.mat('stone', t_stone(stone, 16, seed=4))
    poly = [(-0.36, 0.0), (0.36, 0.0), (0.36, 0.82)] + arc(0, 0.82, 0.36, 0, 180, 6)[1:-1] + [(-0.36, 0.82)]
    slab = P_prism(poly, 0.16, 'tomb', uv=('face', 1, 1))
    slab.T(rot=(-4, 0, 3), loc=(0, 0, 0.1))
    base = P_box(0.9, 0.36, 0.12, 'stone', uv=('box', 2.0))
    ctx.obj(ctx.aid, [base, slab, _grave_mound(ctx, -0.92, 2)], ao_h=0.5)


@asset('gravestone_b', 'Mezar Taşı (Haç)', 'Mezarlık; halkalı taş haç', 'dungeon')
def gravestone_b(ctx):
    ctx.recenter = True
    stone = R('stone_w', 5)
    ctx.mat('tomb', t_tomb(stone, 16, seed=6, rows=0, cross=False))
    ctx.mat('stone', t_stone(stone, 16, seed=7))
    parts = [P_fbox(0.7, 0.45, 0.55, 0.32, 0.2, 'stone', uv=('box', 2.0))]
    parts.append(P_box(0.2, 0.15, 1.3, 'tomb', uv=('box', 2.0), z0=0.2))
    parts.append(P_box(0.78, 0.15, 0.2, 'tomb', uv=('box', 2.0), z0=1.0))
    parts.append(P_torus(0.28, 0.045, 10, 3, 'tomb', uv=('box', 3.0)).T(rot=(90, 0, 0), loc=(0, 0, 1.1)))
    for p in parts[1:]:
        p.T(rot=(0, 5, 0), loc=(0.02, 0, 0))
    ctx.obj(ctx.aid, parts + [_grave_mound(ctx, -0.95, 4)], ao_h=0.5)


@asset('gravestone_c', 'Kırık Mezar Taşı', 'Eski/terk edilmiş mezarlık, lanetli bölge', 'dungeon')
def gravestone_c(ctx):
    ctx.recenter = True
    stone = ramp('#7d7a70', 5)
    ctx.mat('tomb', t_tomb(stone, 32, seed=9, rows=1, cross=False, moss=ramp('#55753a', 3, lo=0.5, hi=1.1)))
    poly = [(-0.38, 0.0), (0.38, 0.0), (0.38, 0.62), (0.2, 0.72), (0.08, 0.6), (-0.1, 0.78), (-0.25, 0.66), (-0.38, 0.7)]
    slab = P_prism(poly, 0.17, 'tomb', uv=('face', 1, 1))
    slab.T(rot=(14, 0, -6), loc=(0, 0.0, 0.0))
    chunk = P_prism([(-0.3, 0.0), (0.3, 0.0), (0.28, 0.18), (0.1, 0.3), (-0.05, 0.18), (-0.3, 0.25)], 0.16, 'tomb',
                    uv=('face', 1, 1))
    chunk.T(rot=(-90, 0, 0)).T(rot=(0, 0, 25), loc=(0.45, -0.45, 0.08))
    rock = rock_part('tomb', 0.12, 3, sub=1, loc=(-0.4, -0.35, 0), uv=('box', 3.0))
    ctx.obj(ctx.aid, [slab, chunk, rock, _grave_mound(ctx, -0.9, 6)], ao_h=0.5)


# ====================================================================== bones

def bone_part(mat, p0, p1, r=0.035, knob=0.06):
    parts = [P_limb(p0, p1, r, r * 0.9, 4, mat, uv=('cyl', 4.0), cap0=True)]
    for p in (p0, p1):
        parts.append(P_box(knob, knob * 1.6, knob, mat, uv=('box', 6.0), z0=-knob / 2).T(rot=(0, 45, 30), loc=p))
    return parts


def skull_parts(mat_bone, mat_dark, loc=(0, 0, 0), rz=0.0, s=1.0):
    parts = [P_sphere(0.15, 7, 4, mat_bone, uv=('box', 4.0), z0=0.16).T(scale=(0.9, 1.1, 0.95)),
             P_box(0.17, 0.12, 0.08, mat_bone, uv=('box', 5.0), z0=0.0).T(loc=(0, -0.08, 0.02))]
    for sx in (-1, 1):
        parts.append(quad((-0.035, 0, -0.03), (0.035, 0, -0.03), (0.035, 0, 0.03), (-0.035, 0, 0.03), mat_dark)
                     .T(rot=(0, 0, sx * 12)).T(loc=(sx * 0.055, -0.158, 0.17)))
    parts.append(Part([(-0.02, 0, -0.025), (0.02, 0, -0.025), (0.0, 0, 0.02)], [(0, 1, 2)], mat_dark,
                      uvs=[[(0, 0), (1, 0), (0.5, 1)]], closed=False).T(loc=(0, -0.165, 0.1)))
    for p in parts:
        p.T(scale=s).T(rot=(0, 0, rz), loc=loc)
    return parts


@asset('bone_pile', 'Kemik Yığını', 'Zindan köşesi, canavar ini, mezar odası', 'dungeon')
def bone_pile(ctx):
    bone = R('bone', 5)
    ctx.mat('bone', t_bone(bone, 32, seed=3))
    ctx.mat('dark', color=(0.06, 0.05, 0.05))
    ctx.mat('dirt', t_dirt(R('soil', 4), 16, seed=2))
    rng = np.random.default_rng(7)
    parts = [P_ico(0.6, 1, 'dirt', uv=('box', 2.0), squash=(1.2, 1.0, 0.22), jitter=0.15, seed=2, flat_bottom=0.0)]
    parts += skull_parts('bone', 'dark', loc=(0.05, -0.15, 0.08), rz=-15)
    parts += skull_parts('bone', 'dark', loc=(-0.45, 0.25, 0.0), rz=40, s=0.85)
    for k in range(9):
        a = rng.uniform(0, TAU); L = rng.uniform(0.35, 0.6)
        cx, cy = rng.uniform(-0.45, 0.45), rng.uniform(-0.35, 0.35)
        z = rng.uniform(0.05, 0.16)
        p0 = (cx - math.cos(a) * L / 2, cy - math.sin(a) * L / 2, z + rng.uniform(-0.04, 0.06))
        p1 = (cx + math.cos(a) * L / 2, cy + math.sin(a) * L / 2, z + rng.uniform(-0.04, 0.08))
        parts += bone_part('bone', p0, p1, r=rng.uniform(0.025, 0.04))
    for k in range(3):
        t = P_torus(0.2, 0.02, 7, 3, 'bone', uv=('box', 4.0))
        t.f = t.f[:9]
        t.closed = False
        t.T(rot=(90, 0, 0)).T(rot=(0, 0, 70), loc=(0.4, 0.15 + k * 0.08, 0.05))
        parts.append(t)
    ctx.obj(ctx.aid, parts, ao_h=0.25)


# ====================================================================== chains / cage

def chain(mat, top, length, spacing=0.28, R_=0.105, r=0.024, phase=0):
    parts = []
    n = max(2, int(length / spacing))
    for i in range(n):
        t = P_torus(R_, r, 4, 3, mat, uv=('box', 5.0), phase_u=math.pi / 4)
        t.T(scale=(0.7, 1.4, 1.0)).T(rot=(90, 0, 0)).T(rot=(0, 0, 90 * ((i + phase) % 2)))
        t.T(loc=(top[0], top[1], top[2] - i * spacing - R_ * 1.4))
        parts.append(t)
    return parts, top[2] - (n - 1) * spacing - 2.8 * R_


@asset('chains_hanging', 'Asılı Zincirler', 'Zindan tavanından sarkan zincirler (zindan duvar yüksekliği 4 m)', 'dungeon',
       attach='İSTİSNA: orijin ÜSTTE (tavan bağlantı noktası); geometri y=0..-3.3 aşağı uzanır, tavana (y=4) yerleştir')
def chains_hanging(ctx):
    ctx.hanging = True
    ctx.mat('iron', t_metal(R('iron', 4), 16, seed=3, border=False, rivets=False, scratches=3, grad=0.3))
    ctx.mat('plate', t_metal(R('iron_d', 4), 16, seed=4, border=True, rivets=True, scratches=1))
    parts = [P_box(0.7, 0.35, 0.06, 'plate', uv=('face', 1, 1), z0=-0.06)]
    ends = []
    for (x, y, L, ph) in ((-0.25, 0.0, 2.9, 0), (0.05, 0.05, 2.0, 1), (0.28, -0.04, 1.2, 0)):
        ch, zend = chain('iron', (x, y, -0.04), L, phase=ph)
        parts += ch
        ends.append((x, y, zend))
    x, y, z = ends[0]
    parts.append(P_torus(0.13, 0.03, 6, 3, 'iron', uv=('box', 4.0)).T(rot=(90, 0, 0), loc=(x, y, z - 0.11)))
    x, y, z = ends[1]
    parts.append(P_limb((x, y, z + 0.02), (x, y, z - 0.22), 0.025, 0.025, 4, 'iron', uv=('cyl', 4.0)))
    parts.append(P_limb((x, y, z - 0.22), (x + 0.12, y, z - 0.12), 0.025, 0.012, 4, 'iron', uv=('cyl', 4.0)))
    x, y, z = ends[2]
    parts.append(P_torus(0.09, 0.03, 6, 3, 'iron', uv=('box', 4.0)).T(rot=(90, 0, 90), loc=(x, y, z - 0.07)))
    ctx.obj(ctx.aid, parts, ao=False)


@asset('iron_cage', 'Demir Kafes', 'Esir kafesi, zindan hapishane odası, görev (kurtarma) objesi', 'dungeon',
       attach="'door' ayrı mesh (menteşe kapı sol kenarında, dikey eksende döner); 'prisoner_spot' boş node")
def iron_cage(ctx):
    ctx.mat('iron', t_metal(R('iron_d', 4), 16, seed=5, border=False, rivets=False, scratches=3, grad=0.3))
    ctx.mat('plate', t_metal(R('iron_d', 4), 32, seed=6, border=True, rivets=True, scratches=4))
    ctx.mat('straw', t_straw(R('straw', 4), 16, seed=3))
    Rr, H, nb = 0.95, 2.3, 12
    parts = [P_cyl(Rr + 0.05, 0.15, 12, 'plate', uv=('cyl', 1.5))]
    parts.append(P_ico(0.6, 1, 'straw', uv=('box', 2.0), squash=(1.2, 1.0, 0.18), jitter=0.2, seed=3, flat_bottom=0.0)
                 .T(loc=(0.1, 0.2, 0.15)))
    for z in (0.15, 1.15, H):
        parts.append(P_torus(Rr, 0.03, 12, 3, 'iron', uv=('box', 4.0)).T(loc=(0, 0, z)))
    door_bars = []
    for i in range(nb):
        a = TAU * i / nb + TAU / nb / 2
        bar = P_box(0.045, 0.045, H - 0.15, 'iron', uv=('box', 4.0), z0=0.15).T(loc=(math.cos(a) * Rr, math.sin(a) * Rr, 0))
        if abs(((a - TAU * 0.75 + math.pi) % TAU) - math.pi) < TAU * 0.09:
            door_bars.append((a, bar))
        else:
            parts.append(bar)
    for k in range(6):
        a = TAU * k / 6
        parts.append(P_limb((math.cos(a) * Rr, math.sin(a) * Rr, H), (math.cos(a) * 0.08, math.sin(a) * 0.08, H + 0.55),
                            0.025, 0.025, 4, 'iron', uv=('cyl', 4.0)))
    parts.append(P_torus(0.12, 0.03, 8, 3, 'iron', uv=('box', 4.0)).T(rot=(90, 0, 0), loc=(0, 0, H + 0.68)))
    ctx.obj(ctx.aid, parts, ao_h=0.5)
    dp = [b for a, b in door_bars]
    angs = [a for a, b in door_bars]
    a0, a1 = min(angs), max(angs)
    p0 = (math.cos(a0) * Rr, math.sin(a0) * Rr); p1 = (math.cos(a1) * Rr, math.sin(a1) * Rr)
    for z in (0.5, 1.75):
        dp.append(P_limb((p0[0], p0[1], z), (p1[0], p1[1], z), 0.025, 0.025, 4, 'iron', uv=('cyl', 4.0), cap0=True))
    dp.append(P_box(0.1, 0.06, 0.14, 'plate', uv=('face', 1, 1), z0=1.05).T(loc=(p1[0], p1[1] - 0.03, 0)))
    ctx.obj('door', dp, origin=(p0[0], p0[1], 0), ao=False)
    ctx.empty('prisoner_spot', (0, 0.1, 0.15))


# ====================================================================== altar / sarcophagus / pillar / statue

@asset('altar', 'Kurban Sunağı', 'Zindan ritüel odası, boss arenası merkezi, görev etkileşimi', 'dungeon',
       emissive='kızıl rünler, mum alevleri, kan kasesi', attach="'offering' boş node (sunak üstü), 'light_0'")
def altar(ctx):
    stone = R('stone_d', 5)
    glow = ramp('#ff3a2a', 4, lo=0.5, hi=1.2)
    base = t_bricks(stone, 32, rows=2, cols=1, seed=7)
    rgb, em = carve(base, rune_mask(32, 32, seed=31, gw=5, gh=7, rows=1), glow, stone[0])
    ctx.mat('runes', rgb, emit=em, emit_strength=1.8)
    ctx.mat('stone', t_stone(stone, 32, seed=8))
    ctx.mat('cloth', t_cloth(R('red', 4), 32, seed=4, folds=3, trim=R('gold', 3)), double=True)
    ctx.mat('wax', t_flat(R('bone', 3, lo=0.65, hi=1.1), 8))
    mat_flame(ctx, 'flame', seed=5)
    ctx.mat('blood', t_flat(ramp('#8a0e12', 3), 8), emit=(0.35, 0.02, 0.02), emit_strength=1.0)
    mat_iron(ctx, 'iron', 'iron', n=3)
    parts = [P_box(2.6, 1.8, 0.22, 'stone', uv=('box', 1.0)), P_box(2.2, 1.4, 0.22, 'stone', uv=('box', 1.0), z0=0.22),
             P_box(1.7, 0.95, 0.65, 'runes', uv=('face', 1, 1), z0=0.44),
             P_box(1.95, 1.15, 0.13, 'stone', uv=('box', 1.5), z0=1.09)]
    parts.append(sheet((-0.6, -0.6, 0.62), (0.6, -0.6, 0.62), (-0.6, -0.6, 1.23), (0.6, -0.6, 1.23), 3, 2, 'cloth',
                       wave=0.03, offs=lambda i, j: (0, -0.02 * (2 - j), 0)))
    parts.append(quad((-0.6, -0.6, 1.23), (0.6, -0.6, 1.23), (0.6, 0.1, 1.23), (-0.6, 0.1, 1.23), 'cloth',
                      uv=((0, 1), (1, 1), (1, 1.6), (0, 1.6))))
    zt = 1.22
    for (x, y, h) in ((-0.82, -0.42, 0.3), (-0.7, -0.45, 0.2), (0.82, -0.42, 0.26), (0.75, 0.4, 0.34), (-0.8, 0.4, 0.22)):
        parts += candle_parts('wax', 'flame', (x, y, zt), h=h, r=0.045)
    parts.append(P_lathe([(0.08, zt), (0.17, zt + 0.08), (0.18, zt + 0.1), (0.14, zt + 0.08)], 7, 'iron', uv=('cyl', 4.0)))
    parts.append(P_disc(0.14, 7, 'blood', uv=('disc',), z=zt + 0.075))
    parts.append(P_box(0.04, 0.32, 0.02, 'iron', uv=('box', 5.0), z0=zt).T(rot=(0, 0, 30), loc=(0.35, 0.05, 0)))
    ctx.obj(ctx.aid, parts, ao_h=0.5)
    ctx.empty('offering', (0, 0, zt + 0.05))
    ctx.empty('light_0', (0, -0.3, 1.8))


@asset('sarcophagus', 'Lahit', 'Kraliyet mezarı, boss ortaya çıkış noktası, gizli hazine', 'dungeon',
       attach="'lid' ayrı mesh (pivot kapak alt merkezi; kaydırma/dönme animasyonu için)")
def sarcophagus(ctx):
    stone = R('stone_w', 5)
    st = t_stone(stone, 32, seed=11)
    y, x = grid(32, 32)
    b = (x == 2) | (x == 29) | (y == 2) | (y == 29)
    st[b] = stone[0]
    st[((x == 3) | (y == 3)) & ~((x < 2) | (y < 2) | (x > 29) | (y > 29))] = stone[-1]
    ctx.mat('carved', st)
    ctx.mat('stone', t_stone(stone, 16, seed=12))
    ctx.mat('bronze', t_metal(R('bronze', 4), 16, seed=3, border=False, rivets=False, scratches=1, sparkle=1))
    w, d, h = 1.15, 2.5, 0.8
    parts = [P_box(w + 0.2, d + 0.2, 0.14, 'stone', uv=('box', 1.5)), P_box(w, d, h, 'carved', uv=('face', 1, 2), z0=0.14)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(P_box(0.16, 0.16, h + 0.06, 'stone', uv=('box', 3.0), z0=0.12).T(loc=(sx * w / 2, sy * d / 2, 0)))
    ctx.obj(ctx.aid, parts, ao_h=0.4)
    zt = 0.14 + h
    lp = [P_fbox(w + 0.12, d + 0.12, w - 0.05, d - 0.05, 0.16, 'carved', uv=('face', 1, 2), z0=zt)]
    z2 = zt + 0.16
    lp.append(P_sphere(0.17, 7, 4, 'stone', uv=('box', 3.0), z0=0.12).T(scale=(1, 1, 0.75)).T(loc=(0, 0.85, z2)))
    lp.append(P_fbox(0.55, 1.3, 0.4, 1.1, 0.16, 'stone', uv=('box', 2.0), z0=z2).T(loc=(0, -0.05, 0)))
    lp.append(P_fbox(0.3, 0.45, 0.22, 0.4, 0.1, 'stone', uv=('box', 2.0), z0=z2).T(loc=(0, -0.85, 0)))
    lp.append(P_box(0.08, 1.25, 0.04, 'bronze', uv=('box', 4.0), z0=z2 + 0.16).T(loc=(0, -0.25, 0)))
    lp.append(P_box(0.34, 0.07, 0.05, 'bronze', uv=('box', 4.0), z0=z2 + 0.16).T(loc=(0, 0.35, 0)))
    lp.append(P_box(0.07, 0.18, 0.06, 'bronze', uv=('box', 4.0), z0=z2 + 0.16).T(loc=(0, 0.45, 0)))
    ctx.obj('lid', lp, origin=(0, 0, zt), ao=False)


@asset('pillar_broken', 'Kırık Sütun', 'Antik harabe, zindan salonu, açık dünya kalıntıları', 'dungeon')
def pillar_broken(ctx):
    ctx.recenter = True
    stone = R('sand', 5)
    n = len(stone)
    fl = t_stone(stone, 32, seed=21, cracks=3)
    y, x = grid(32, 32)
    fl[(x % 8) == 0] = stone[1]
    fl[(x % 8) == 1] = stone[n - 1]
    fl[(x % 8) == 7] = stone[1]
    ctx.mat('shaft', fl)
    ctx.mat('stone', t_stone(stone, 32, seed=22, cracks=2))
    ctx.mat('rock', t_rock(stone, 16, cells=4, seed=3, crack=0.6))
    rng = np.random.default_rng(3)
    parts = [P_box(1.3, 1.3, 0.3, 'stone', uv=('box', 1.0))]
    parts.append(P_lathe([(0.58, 0.3), (0.6, 0.38), (0.5, 0.48), (0.45, 0.55)], 8, 'stone', uv=('cyl', 1.5), cap0=False))
    sh = P_lathe([(0.45, 0.55), (0.42, 1.6), (0.4, 2.5)], 8, 'shaft', uv=('cyl', 0.8), cap0=False, cap1=True)
    for i in range(8):
        sh.v[16 + i, 2] = 2.5 + rng.uniform(-0.55, 0.15) * (1 if i % 2 else 0.6)
    parts.append(sh)
    fallen = P_lathe([(0.4, -0.55), (0.39, 0.5)], 8, 'shaft', uv=('cyl', 0.8))
    for i in range(8):
        fallen.v[8 + i, 2] += rng.uniform(-0.2, 0.15)
    fallen.T(rot=(0, 90, 0)).T(rot=(0, 0, 30), loc=(1.25, -0.75, 0.38))
    parts.append(fallen)
    for k in range(5):
        a = rng.uniform(0, TAU)
        parts.append(rock_part('rock', rng.uniform(0.1, 0.22), 30 + k, sub=1, loc=(math.cos(a) * 1.0, math.sin(a) * 1.0, 0),
                               uv=('box', 2.0)))
    ctx.obj(ctx.aid, parts, ao_h=0.6)


@asset('statue_hooded', 'Kukuletalı Savaşçı Heykeli', 'Kasaba meydanı anıtı, zindan girişi muhafızı', 'dungeon')
def statue_hooded(ctx):
    stone = R('stone', 5)
    ctx.mat('stone', t_stone(stone, 32, seed=31, cracks=4))
    ctx.mat('base', t_bricks(R('stone_d', 4), 32, rows=2, cols=1, seed=32))
    ctx.mat('shadow', color=(0.05, 0.05, 0.07))
    ctx.mat('moss', t_leaves(ramp('#5f8a3a', 3, lo=0.5, hi=1.1), 16, seed=3, count=18))
    parts = [P_box(1.7, 1.7, 0.22, 'base', uv=('box', 1.0)), P_box(1.35, 1.35, 0.6, 'base', uv=('face', 1, 1), z0=0.22),
             P_box(1.5, 1.5, 0.1, 'base', uv=('box', 1.5), z0=0.82)]
    z = 0.92
    robe = P_lathe([(0.55, z), (0.5, z + 0.5), (0.4, z + 1.05), (0.42, z + 1.35), (0.56, z + 1.7), (0.3, z + 1.85)], 8,
                   'stone', uv=('cyl', 1.2), jitter=0.04, seed=3, phase=math.pi / 8)
    robe.T(scale=(1.0, 0.72, 1.0))
    parts.append(robe)
    for sx in (-1, 1):
        parts.append(P_ico(0.24, 1, 'stone', uv=('box', 2.0), squash=(1.1, 1.0, 0.75)).T(loc=(sx * 0.5, 0, z + 1.68)))
    hood = P_lathe([(0.3, z + 1.78), (0.34, z + 1.98), (0.3, z + 2.2), (0.16, z + 2.36, 0, 0.06), (0.0, z + 2.46, 0, 0.12)], 8,
                   'stone', uv=('cyl', 1.5), phase=math.pi / 8)
    hood.T(scale=(1.0, 1.05, 1.0))
    parts.append(hood)
    parts.append(quad((-0.15, 0, -0.17), (0.15, 0, -0.17), (0.12, 0, 0.15), (-0.12, 0, 0.15), 'shadow')
                 .T(rot=(-6, 0, 0), loc=(0, -0.335, z + 2.02)))
    parts.append(sheet((0.5, 0.36, z + 0.05), (-0.5, 0.36, z + 0.05), (0.42, 0.27, z + 1.75), (-0.42, 0.27, z + 1.75), 2, 3,
                       'stone', wave=0.04))
    gy, gz = -0.5, z + 1.15
    for sx in (-1, 1):
        parts.append(P_limb((sx * 0.5, 0.0, z + 1.6), (sx * 0.38, -0.25, z + 1.2), 0.13, 0.11, 6, 'stone', uv=('cyl', 2.0),
                            cap0=True))
        parts.append(P_limb((sx * 0.38, -0.25, z + 1.2), (sx * 0.08, gy, gz + 0.05), 0.1, 0.08, 6, 'stone', uv=('cyl', 2.0),
                            cap0=True))
        parts.append(P_box(0.13, 0.15, 0.13, 'stone', uv=('box', 3.0), z0=gz - 0.05 + sx * 0.06).T(loc=(0, gy, 0)))
    parts.append(P_fbox(0.16, 0.05, 0.13, 0.05, 1.05, 'stone', uv=('box', 2.0), z0=z + 0.12).T(loc=(0, gy, 0)))
    parts.append(P_lathe([(0.0, z), (0.08, z + 0.12)], 4, 'stone', uv=('cyl', 2.0), cap0=False).T(scale=(1, 0.35, 1)).T(loc=(0, gy, 0)))
    parts.append(P_box(0.6, 0.08, 0.08, 'stone', uv=('box', 3.0), z0=z + 1.0).T(loc=(0, gy, 0)))
    parts.append(P_cyl(0.035, 0.32, 5, 'stone', uv=('cyl', 3.0), z0=z + 1.08).T(loc=(0, gy, 0)))
    parts.append(P_ico(0.06, 1, 'stone', uv=('box', 4.0)).T(loc=(0, gy, z + 1.43)))
    parts.append(P_ico(0.3, 1, 'moss', uv=('box', 2.0), squash=(1.6, 1.0, 0.25), flat_bottom=0.0).T(loc=(0.45, 0.4, 0.92)))
    ctx.obj(ctx.aid, parts, ao_h=1.2)


# ====================================================================== loot bag

@asset('loot_bag', 'Ganimet Kesesi', 'Düşen ganimet torbası (canavar öldürünce yere düşer)', 'dungeon',
       emissive='altın paralar (hafif parıltı, yerde fark edilsin diye)', attach="'loot_fx' boş node (ışın/parıltı efekti)")
def loot_bag(ctx):
    ctx.mat('leather', t_burlap(ramp('#8a6a44', 5), 16, seed=3))
    ctx.mat('rope', t_rope(R('straw', 3)))
    gold = R('gold', 4)
    ctx.mat('coins', t_metal(gold, 16, seed=4, border=False, rivets=False, scratches=0, sparkle=3), emit='same',
            emit_strength=0.6)
    parts = [P_lathe([(0.15, 0.0), (0.21, 0.08), (0.23, 0.18), (0.17, 0.3), (0.07, 0.36), (0.1, 0.42), (0.13, 0.46), (0.0, 0.47)],
                     8, 'leather', uv=('cyl', 2.0), jitter=0.06, seed=3)]
    parts.append(P_lathe([(0.085, 0.34), (0.085, 0.38)], 8, 'rope', uv=('cyl', 4.0), cap0=False, cap1=False))
    parts.append(P_limb((0.08, -0.03, 0.36), (0.14, -0.12, 0.2), 0.012, 0.012, 3, 'rope', uv=('cyl', 4.0)))
    rng = np.random.default_rng(5)
    for k in range(7):
        a = rng.uniform(-1.2, 1.2) - math.pi / 2
        dist = rng.uniform(0.22, 0.38)
        parts.append(P_cyl(0.045, 0.015, 6, 'coins', uv=('disc',), z0=0.0).T(rot=(rng.uniform(-15, 15), rng.uniform(-15, 15), 0))
                     .T(loc=(math.cos(a) * dist, math.sin(a) * dist, 0.008 + 0.012 * (k % 2))))
    ctx.obj(ctx.aid, parts, ao_h=0.25)
    ctx.empty('loot_fx', (0, 0, 0.3))
