"""Hub town props: stalls, tents, well, wagon, crates, barrels, sacks, lights, fires, banners, signs,
smithing, alchemy, training dummy."""
from common import *

EMB_SWORD = ascii_mask([
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '.....##.....',
    '..########..',
    '..########..',
    '.....##.....',
    '.....##.....',
    '....####....',
    '.....##.....'])
EMB_CROWN = ascii_mask([
    '............',
    '.#...##...#.',
    '.##.####.##.',
    '.##########.',
    '.##########.',
    '.##.#..#.##.',
    '.##########.',
    '.##########.',
    '............',
    '..########..',
    '...######...',
    '............'])
EMB_TREE = ascii_mask([
    '.....##.....',
    '....####....',
    '...######...',
    '..########..',
    '...######...',
    '..########..',
    '.##########.',
    '..########..',
    '.....##.....',
    '.....##.....',
    '...######...',
    '............'])


# ====================================================================== storage

@asset('crate_a', 'Tahta Kasa', 'Kasaba/zindan dolgu objesi, üst üste dizilebilir (1x1x1 m)', 'town')
def crate_a(ctx):
    ctx.mat('crate', t_crate(R('wood', 5), 32, seed=3))
    ctx.obj('crate_a', crate_parts(1.0, 1.0, 1.0, 'crate'), ao_h=0.5)


@asset('crate_b', 'Demir Köşeli Erzak Sandığı', 'Liman/depo/kervan yükü, uzun erzak kasası', 'town')
def crate_b(ctx):
    ctx.mat('crate', t_crate(R('wood_l', 5), 32, seed=7, frame=3, brace=False))
    mat_iron(ctx, 'iron', 'iron_d', border=True)
    ctx.mat('rope', t_rope(R('straw', 3)))
    w, d, h = 1.3, 0.8, 0.72
    parts = [P_box(w, d, h, 'crate', uv=('face', 1, 1))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (0.0, h - 0.14):
                parts.append(P_box(0.16, 0.16, 0.14, 'iron', uv=('face', 1, 1), z0=z)
                             .T(loc=(sx * (w / 2 - 0.07), sy * (d / 2 - 0.07), 0)))
    for x in (-0.3, 0.3):
        parts.append(P_box(0.07, d + 0.02, h + 0.02, 'iron', uv=('face', 1, 1), z0=-0.01).T(loc=(x, 0, 0)))
    for sx in (-1, 1):
        t = P_torus(0.09, 0.022, 6, 3, 'rope', uv=('box', 4.0))
        t.T(rot=(0, 90, 0), loc=(sx * (w / 2 + 0.02), 0, h * 0.62))
        parts.append(t)
    ctx.obj('crate_b', parts, ao_h=0.4)


@asset('barrel', 'Fıçı', 'Kasaba/meyhane/zindan dolgu objesi', 'town')
def barrel(ctx):
    ctx.mat('staves', t_planks(R('wood', 5), 32, planks=4, seed=8, ends=False, knots=1))
    mat_iron(ctx, 'band', 'iron_d', border=True)
    ctx.mat('top', t_planks(R('wood_l', 4), 16, planks=3, seed=9, ends=False, knots=0))
    ctx.obj('barrel', barrel_parts('staves', 'band', 'top'), ao_h=0.4)


@asset('sacks', 'Çuval Yığını', 'Pazar, değirmen, kervan yükü (3 çuval)', 'town')
def sacks(ctx):
    ctx.mat('burlap', t_burlap(R('burlap', 5), 32, seed=4, seam=True))
    ctx.mat('grain', t_straw(R('straw', 4), 16, seed=5))
    ctx.mat('rope', t_rope(R('wood_d', 3)))
    parts = []
    for (r, h, x, y, sd) in ((0.3, 0.8, 0.24, 0.22, 1), (0.27, 0.68, -0.3, 0.28, 4)):
        parts.append(sack_part('burlap', r, h, seed=sd, loc=(x, y, 0)))
        parts.append(P_lathe([(r * 0.3, h * 0.88), (r * 0.3, h * 0.93)], 8, 'rope', uv=('cyl', 4.0), cap0=False,
                             cap1=False).T(loc=(x, y, 0)))
    r = 0.27
    lying = P_lathe([(0.0, 0.0), (r * 0.75, 0.05), (r, 0.22), (r * 1.02, 0.48), (r * 0.8, 0.68), (0.0, 0.74)], 8, 'burlap',
                    uv=('cyl', 1.6), jitter=0.02, seed=7)
    lying.T(loc=(0, 0, -0.37)).T(scale=(0.62, 1.0, 1.0)).T(rot=(0, 90, 0)).T(rot=(0, 0, 12), loc=(0.0, -0.3, r * 0.62))
    parts.append(lying)
    parts.append(P_ico(0.22, 1, 'grain', uv=('box', 3.0), squash=(1.4, 1.2, 0.3), flat_bottom=0, jitter=0.2,
                       seed=6).T(loc=(0.45, -0.55, 0)))
    ctx.obj('sacks', parts, ao_h=0.4)


# ====================================================================== market / camp

@asset('market_stall', 'Pazar Tezgahı', 'Kasaba pazarı satıcı tezgahı (NPC satıcı arkasında durur)', 'town',
       attach="'vendor_spot' boş node: satıcı NPC'nin durduğu yer (tezgah arkası); 'roof_cloth' ayrı mesh")
def market_stall(ctx):
    wood = R('wood', 5)
    red, white = R('red', 4), R('white', 4)
    ctx.mat('wood', t_planks(wood, 32, planks=4, seed=41, horizontal=True, ends=False, knots=1))
    ctx.mat('beam', t_planks(wood, 16, planks=2, seed=42, ends=False, knots=0))
    ctx.mat('cloth', t_cloth(red, 32, seed=43, folds=0, stripes=4, pal2=white, weave=True), double=True)
    ctx.mat('apples', t_leaves(R('red', 4, lo=0.45, hi=1.3), 16, seed=44, count=18))
    ctx.mat('rollw', t_cloth(white, 16, seed=45, folds=1))
    ctx.mat('rollr', t_cloth(red, 16, seed=46, folds=1))
    parts = []
    # posts
    for sx in (-1, 1):
        parts.append(P_box(0.14, 0.14, 2.42, 'beam', uv=('box', 1.5)).T(loc=(sx * 1.55, -1.0, 0)))
        parts.append(P_box(0.14, 0.14, 2.92, 'beam', uv=('box', 1.5)).T(loc=(sx * 1.55, 1.0, 0)))
        parts.append(P_limb((sx * 1.55, -1.12, 2.36), (sx * 1.55, 1.08, 2.88), 0.055, 0.055, 4, 'beam', uv=('cyl', 2.0)))
    # counter + top + back table
    parts.append(P_box(3.0, 0.8, 0.95, 'wood', uv=('box', 1.0)).T(loc=(0, -0.62, 0)))
    parts.append(P_box(3.3, 1.0, 0.08, 'beam', uv=('box', 1.5), z0=0.95).T(loc=(0, -0.62, 0)))
    parts.append(P_box(3.0, 0.6, 0.75, 'wood', uv=('box', 1.0)).T(loc=(0, 0.7, 0)))
    # goods
    basket = P_lathe([(0.16, 1.03), (0.24, 1.2), (0.25, 1.22)], 7, 'beam', uv=('cyl', 3.0), cap0=True, cap1=False)
    parts.append(basket.T(loc=(-1.0, -0.6, 0)))
    parts.append(P_ico(0.22, 1, 'apples', uv=('box', 3.0), squash=(1, 1, 0.55), jitter=0.12, seed=3)
                 .T(loc=(-1.0, -0.6, 1.2)))
    basket2 = P_lathe([(0.14, 1.03), (0.2, 1.17), (0.21, 1.19)], 7, 'beam', uv=('cyl', 3.0), cap0=True, cap1=False)
    parts.append(basket2.T(loc=(-0.45, -0.75, 0)))
    parts.append(P_ico(0.18, 1, 'apples', uv=('box', 3.0), squash=(1, 1, 0.5), jitter=0.12, seed=4)
                 .T(loc=(-0.45, -0.75, 1.16)))
    for i, (x, m) in enumerate(((0.25, 'rollw'), (0.55, 'rollr'), (0.85, 'rollw'))):
        parts.append(P_cyl(0.1, 0.8, 6, m, uv=('cyl', 2.0), z0=-0.4).T(rot=(90, 0, 8 * i)).T(loc=(x, -0.6, 1.13)))
    parts.append(P_cyl(0.1, 0.7, 6, 'rollr', uv=('cyl', 2.0), z0=-0.35).T(rot=(90, 0, 0)).T(loc=(0.55, -0.6, 1.3)))
    parts += crate_parts(0.45, 0.45, 0.4, 'wood', z0=1.03, rot=12, loc=(1.2, -0.6))
    parts += crate_parts(0.6, 0.6, 0.55, 'wood', z0=0.75, rot=-6, loc=(-0.9, 0.7))
    ctx.obj('market_stall', parts, ao_h=0.8)
    # roof + valance (separate so the game can flap it)
    rp = [sheet((-1.75, -1.3, 2.38), (1.75, -1.3, 2.38), (-1.75, 1.15, 2.98), (1.75, 1.15, 2.98), 4, 3, 'cloth',
                sag=0.12, uvscale=(3.0, 2.0))]
    segs = 8
    top, x0, W = 2.38, -1.75, 3.5
    for i in range(segs):
        xa, xb = x0 + W * i / segs, x0 + W * (i + 1) / segs
        xm = (xa + xb) / 2
        pts = [(xa, -1.3, top - 0.22), (xm, -1.3, top - 0.38), (xb, -1.3, top - 0.22), (xb, -1.3, top), (xa, -1.3, top)]
        uv = [((p[0] - x0) / W * 3.0, (p[2] - (top - 0.38)) / 0.38 * 0.25) for p in pts]
        rp.append(Part(pts, [(0, 1, 2, 3, 4)], 'cloth', uvs=[uv], closed=False))
    ctx.obj('roof_cloth', rp, ao=False)
    ctx.empty('vendor_spot', (0, 0.05, 0))


@asset('tent', 'Çadır', 'Kamp alanı, kervan durağı, açık dünya kampı', 'town',
       attach="'entrance' boş node: çadır girişi (-Y)")
def tent(ctx):
    canvas = ramp('#cdbb94', 5, lo=0.45, hi=1.2)
    rgb = t_cloth(canvas, 32, seed=51, folds=1, trim=R('red', 3))
    rng = np.random.default_rng(2)
    for k in range(2):
        py, px = int(rng.integers(4, 22)), int(rng.integers(4, 22))
        rgb[py:py + 6, px:px + 6] = ramp('#a89468', 3)[1]
        rgb[py, px:px + 6] = canvas[0]; rgb[py + 5, px:px + 6] = canvas[0]
        rgb[py:py + 6, px] = canvas[0]; rgb[py:py + 6, px + 5] = canvas[0]
    ctx.mat('canvas', rgb, double=True)
    ctx.mat('pole', t_bark(R('wood_d', 4), 16, seed=3))
    ctx.mat('rope', t_rope(R('straw', 3)))
    ctx.mat('rug', t_cloth(R('red', 3), 16, seed=5, folds=0, stripes=2, pal2=R('wood_d', 3)))
    L, Wd, H = 3.2, 2.7, 2.3
    parts = []
    for y in (-L / 2, L / 2):
        parts.append(P_cyl(0.05, H + 0.15, 5, 'pole', uv=('cyl', 2.0)).T(loc=(0, y, 0)))
    parts.append(P_cyl(0.045, L + 0.3, 5, 'pole', uv=('cyl', 2.0), z0=-(L + 0.3) / 2).T(rot=(90, 0, 0)).T(loc=(0, 0, H)))
    for y, sy in ((-L / 2 - 0.15, -1), (L / 2 + 0.15, 1)):
        parts.append(stake_rope('rope', (0, y, H + 0.05), (0, y + sy * 1.2, 0.0)))
        parts.append(P_box(0.06, 0.06, 0.2, 'pole', uv=('box', 3.0)).T(loc=(0, y + sy * 1.2, 0)))
    for sx in (-1, 1):
        for y in (-1.0, 0.0, 1.0):
            parts.append(P_box(0.05, 0.05, 0.16, 'pole', uv=('box', 3.0)).T(loc=(sx * (Wd / 2 + 0.25), y, 0)))
            parts.append(stake_rope('rope', (sx * Wd / 2, y, 0.08), (sx * (Wd / 2 + 0.25), y, 0.1)))
    parts.append(P_box(1.2, 1.9, 0.02, 'rug', uv=('face', 1, 1)).T(loc=(0, 0.2, 0.0)))
    ctx.obj('tent_frame', parts, ao_h=0.6)
    cp = []
    # two roof sheets, slight sag
    cp.append(sheet((-Wd / 2, -L / 2, 0.05), (-Wd / 2, L / 2, 0.05), (0, -L / 2, H), (0, L / 2, H), 3, 2, 'canvas',
                    sag=0.0, wave=0.04, uvscale=(2.0, 1.0)))
    cp.append(sheet((Wd / 2, L / 2, 0.05), (Wd / 2, -L / 2, 0.05), (0, L / 2, H), (0, -L / 2, H), 3, 2, 'canvas',
                    sag=0.0, wave=0.04, uvscale=(2.0, 1.0)))
    # back wall
    cp.append(Part([(Wd / 2, L / 2, 0.05), (-Wd / 2, L / 2, 0.05), (0, L / 2, H)], [(0, 1, 2)], 'canvas',
                   uvs=[[(1, 0), (0, 0), (0.5, 1)]], closed=False))
    # open front flaps folded outwards
    for sx in (-1, 1):
        a = (sx * Wd / 2, -L / 2, 0.05)
        b = (0, -L / 2, H)
        c = (sx * (Wd / 2 + 0.35), -L / 2 - 0.55, 0.25)
        pts = [a, c, b] if sx < 0 else [c, a, b]
        cp.append(Part(pts, [(0, 1, 2)], 'canvas', uvs=[[(0, 0), (1, 0), (0.5, 1)]], closed=False))
    ctx.obj('tent', cp, ao_h=0.8)
    ctx.empty('entrance', (0, -L / 2 - 0.2, 0))


@asset('well', 'Kuyu', 'Kasaba meydanı merkezi, görev etkileşim noktası', 'town',
       attach="'bucket' ayrı node (ip ucu, yukarı/aşağı animasyon için); 'interact' boş node")
def well(ctx):
    ctx.mat('stone', t_bricks(R('stone', 5), 32, rows=4, cols=2, seed=61))
    ctx.mat('wood', t_planks(R('wood', 5), 16, planks=2, seed=62, ends=False, knots=0))
    ctx.mat('roof', t_shingles(R('wood_d', 4), 32, rows=4, seed=63))
    ctx.mat('water', t_water(ramp(C['water'], 4, lo=0.5, hi=1.4), 16, seed=2))
    ctx.mat('rope', t_rope(R('wood_l', 3)))
    mat_iron(ctx, 'iron', 'iron_d', n=3)
    parts = [P_ring_band(1.0, 0.74, 0.85, 10, 'stone', uv=('cyl', 1.0))]
    parts.append(P_ring_band(1.08, 0.7, 0.12, 10, 'stone', uv=('cyl', 2.0), z0=0.85))
    parts.append(P_disc(0.76, 10, 'water', uv=('disc',), z=0.45))
    for sx in (-1, 1):
        parts.append(P_box(0.16, 0.16, 2.35, 'wood', uv=('box', 1.5)).T(loc=(sx * 0.9, 0, 0)))
        parts.append(P_box(0.12, 0.9, 0.1, 'wood', uv=('box', 1.5), z0=2.25).T(rot=(32, 0, 0), loc=(sx * 0.9, -0.22, 0.04)))
        parts.append(P_box(0.12, 0.9, 0.1, 'wood', uv=('box', 1.5), z0=2.25).T(rot=(-32, 0, 0), loc=(sx * 0.9, 0.22, 0.04)))
    parts.append(P_cyl(0.07, 2.05, 6, 'wood', uv=('cyl', 2.0), z0=-1.02).T(rot=(0, 90, 0)).T(loc=(0, 0, 1.6)))
    parts.append(P_cyl(0.13, 0.5, 8, 'rope', uv=('cyl', 3.0), z0=-0.25).T(rot=(0, 90, 0)).T(loc=(0, 0, 1.6)))
    parts.append(P_box(0.05, 0.05, 0.35, 'iron', uv=('box', 3.0)).T(loc=(1.05, 0, 1.45)))
    parts.append(P_box(0.25, 0.05, 0.05, 'iron', uv=('box', 3.0)).T(loc=(1.17, 0, 1.43)))
    parts.append(P_box(0.04, 0.04, 0.6, 'rope', uv=('box', 3.0), z0=1.0).T(loc=(0.0, -0.13, 0)))
    # roof
    for sy in (-1, 1):
        r = P_box(2.5, 1.05, 0.06, 'roof', uv=('face', 2, 1))
        r.T(rot=(sy * -34, 0, 0), loc=(0, sy * 0.43, 2.37))
        parts.append(r)
    parts.append(P_box(2.55, 0.1, 0.12, 'wood', uv=('box', 1.5), z0=2.66))
    ctx.obj('well', parts, ao_h=0.6)
    bp = [P_lathe([(0.13, 0.7), (0.17, 0.98), (0.175, 1.0)], 7, 'wood', uv=('cyl', 3.0), cap0=True, cap1=False),
          P_torus(0.17, 0.015, 7, 3, 'iron', uv=('box', 4)).T(loc=(0, 0, 0.9)),
          P_disc(0.15, 7, 'water', uv=('disc',), z=0.92)]
    for p in bp:
        p.T(loc=(0, -0.13, 0))
    ctx.obj('bucket', bp, origin=(0, -0.13, 1.0), ao=False)
    ctx.empty('interact', (0, -1.3, 0))


@asset('wagon', 'Yük Arabası', 'Kervan, çiftlik, kasaba girişi süsü (yüklü)', 'town',
       attach="tekerlek node'ları 'wheel_fl','wheel_fr','wheel_bl','wheel_br' (yerel X ekseninde döner)")
def wagon(ctx):
    ctx.recenter = True
    wood = R('wood', 5)
    ctx.mat('wood', t_planks(wood, 32, planks=4, seed=71, horizontal=True, ends=True, nails=True))
    ctx.mat('beam', t_planks(R('wood_d', 4), 16, planks=2, seed=72, ends=False, knots=0))
    ctx.mat('wheel', t_wheel(R('wood_d', 4), R('iron', 3), 32, spokes=8))
    ctx.mat('rim', t_metal(R('iron', 3), 16, seed=3, border=False, rivets=False, scratches=2))
    ctx.mat('burlap', t_burlap(R('burlap', 4), 32, seed=5, seam=True))
    ctx.mat('hay', t_straw(R('straw', 4), 32, seed=6))
    parts = []
    bw, bl, bz = 1.5, 2.8, 0.75
    parts.append(P_box(bw, bl, 0.12, 'wood', uv=('box', 1.0), z0=bz))
    for sx in (-1, 1):
        parts.append(P_box(0.07, bl, 0.42, 'wood', uv=('box', 1.0), z0=bz + 0.12).T(loc=(sx * (bw / 2 - 0.035), 0, 0)))
        for y in (-1.2, 0.0, 1.2):
            parts.append(P_box(0.09, 0.09, 0.55, 'beam', uv=('box', 2.0), z0=bz).T(loc=(sx * (bw / 2 + 0.01), y, 0)))
    for sy in (-1, 1):
        parts.append(P_box(bw, 0.07, 0.42, 'wood', uv=('box', 1.0), z0=bz + 0.12).T(loc=(0, sy * (bl / 2 - 0.035), 0)))
    # undercarriage + axles
    for y in (-0.95, 0.95):
        parts.append(P_cyl(0.06, bw + 0.5, 6, 'beam', uv=('cyl', 2.0), z0=-(bw + 0.5) / 2).T(rot=(0, 90, 0))
                     .T(loc=(0, y, 0.5)))
        parts.append(P_box(0.2, 0.2, 0.26, 'beam', uv=('box', 2.0), z0=0.5).T(loc=(0, y, 0)))
    # shafts
    for sx in (-1, 1):
        parts.append(P_limb((sx * 0.35, -bl / 2 + 0.2, bz - 0.05), (sx * 0.45, -bl / 2 - 1.5, 0.55), 0.05, 0.04, 5, 'beam',
                            uv=('cyl', 2.0)))
    parts.append(P_cyl(0.035, 1.0, 5, 'beam', uv=('cyl', 2.0), z0=-0.5).T(rot=(0, 90, 0)).T(loc=(0, -bl / 2 - 1.2, 0.6)))
    # cargo
    parts.append(P_ico(0.75, 2, 'hay', uv=('box', 1.5), squash=(0.9, 1.3, 0.45), jitter=0.12, seed=4,
                       flat_bottom=0).T(loc=(0.0, 0.5, bz + 0.12)))
    parts.append(sack_part('burlap', 0.25, 0.6, seed=8, loc=(0.35, -0.75, bz + 0.12)))
    parts += crate_parts(0.5, 0.5, 0.45, 'wood', z0=bz + 0.12, rot=15, loc=(-0.4, -0.35))
    ctx.obj('wagon', parts, ao_h=0.7)
    # wheels as separate objects (spin)
    for nm, (x, y) in (('wheel_fl', (-0.88, -0.95)), ('wheel_fr', (0.88, -0.95)), ('wheel_bl', (-0.88, 0.95)),
                       ('wheel_br', (0.88, 0.95))):
        sx = 1 if x > 0 else -1
        r = 0.5
        wp = [P_lathe([(r, -0.06), (r, 0.06)], 9, 'rim', uv=('cyl', 1.0), cap0=False, cap1=False)]
        d1 = P_disc(r, 9, 'wheel', uv=('disc',), z=0.06)
        d2 = P_disc(r, 9, 'wheel', uv=('disc',), z=-0.06)
        d2.f = [tuple(reversed(f)) for f in d2.f]
        hub = P_cyl(0.09, 0.26, 5, 'rim', uv=('cyl', 3.0), z0=-0.13)
        wp += [d1, d2, hub]
        for p in wp:
            p.T(rot=(0, 90, 0)).T(loc=(x, y, r))
        ctx.obj(nm, wp, origin=(x, y, r), ao=False)


# ====================================================================== lights & fires

@asset('lamp_post', 'Sokak Feneri', 'Kasaba sokak aydınlatması (gece)', 'town',
       emissive='fener camları (sıcak sarı)', attach="'light_0' boş node: fener merkezi, PointLight için")
def lamp_post(ctx):
    ctx.mat('stone', t_bricks(R('stone', 4), 16, rows=2, cols=1, seed=81))
    mat_iron(ctx, 'iron', 'iron_d', n=4, border=False)
    glow = ramp('#ffb347', 4, lo=0.6, hi=1.25)
    rgb, em = t_lantern(glow, R('iron_d', 3))
    ctx.mat('glass', rgb, emit=em, emit_strength=2.5)
    parts = [P_fbox(0.5, 0.5, 0.36, 0.36, 0.45, 'stone', uv=('face', 1, 1))]
    parts.append(P_fbox(0.36, 0.36, 0.3, 0.3, 0.08, 'stone', uv=('face', 1, 1), z0=0.45))
    parts.append(P_cyl(0.075, 2.9, 6, 'iron', uv=('cyl', 2.0), r2=0.055, z0=0.5))
    parts.append(P_lathe([(0.1, 3.35), (0.13, 3.42), (0.0, 3.55)], 6, 'iron', uv=('cyl', 2.0), cap0=True))
    # arm toward -Y with a curl
    parts.append(P_box(0.05, 0.75, 0.06, 'iron', uv=('box', 3.0), z0=3.15).T(loc=(0, -0.37, 0)))
    parts.append(P_limb((0, -0.05, 2.75), (0, -0.45, 3.15), 0.025, 0.025, 4, 'iron', uv=('cyl', 3.0)))
    parts.append(P_box(0.02, 0.02, 0.15, 'iron', uv=('box', 3.0), z0=3.0).T(loc=(0, -0.7, 0)))
    # lantern
    lz = 2.55
    parts.append(P_fbox(0.18, 0.18, 0.3, 0.3, 0.06, 'iron', uv=('face', 1, 1), z0=lz))
    parts.append(P_fbox(0.28, 0.28, 0.24, 0.24, 0.36, 'glass', uv=('face', 1, 1), z0=lz + 0.06))
    parts.append(P_fbox(0.34, 0.34, 0.0, 0.0, 0.2, 'iron', uv=('face', 1, 1), z0=lz + 0.42))
    for p in parts[-3:]:
        p.T(loc=(0, -0.7, 0))
    ctx.obj('lamp_post', parts, ao_h=0.5)
    ctx.empty('light_0', (0, -0.7, lz + 0.24))


@asset('brazier', 'Mangal', 'Zindan/kasaba ateş kaynağı, boss odası aydınlatması', 'town',
       emissive="kömürler + 'flame' kartları", attach="'flame' ayrı mesh (titreşim/ölçek animasyonu); 'light_0', 'fire_fx' boş node")
def brazier(ctx):
    mat_iron(ctx, 'iron', 'iron_d', n=4, border=False)
    rgb, em = t_coals(R('coal', 4), EMBER4, 32, seed=3, hot=0.35)
    ctx.mat('coals', rgb, emit=em, emit_strength=2.5)
    mat_flame(ctx, 'flame', seed=2)
    parts = []
    prof = [(0.14, 0.72), (0.42, 0.82), (0.55, 1.02), (0.58, 1.08), (0.52, 1.08), (0.44, 0.98)]
    parts.append(P_lathe(prof, 8, 'iron', uv=('cyl', 2.0), cap0=True, cap1=False))
    parts.append(P_disc(0.45, 8, 'coals', uv=('disc',), z=0.97))
    for k in range(5):
        a = TAU * k / 5 + 0.3
        parts.append(P_ico(0.1, 1, 'coals', uv=('box', 4.0), jitter=0.2, seed=k, squash=(1, 1, 0.6))
                     .T(loc=(math.cos(a) * 0.2, math.sin(a) * 0.2, 0.98)))
    for k in range(3):
        a = TAU * k / 3
        parts.append(P_limb((math.cos(a) * 0.22, math.sin(a) * 0.22, 0.8), (math.cos(a) * 0.48, math.sin(a) * 0.48, 0.0),
                            0.04, 0.035, 4, 'iron', uv=('cyl', 3.0)))
        parts.append(P_box(0.12, 0.12, 0.04, 'iron', uv=('box', 4.0)).T(rot=(0, 0, math.degrees(a)),
                                                                          loc=(math.cos(a) * 0.49, math.sin(a) * 0.49, 0)))
    parts.append(P_torus(0.36, 0.022, 9, 3, 'iron', uv=('box', 4.0)).T(loc=(0, 0, 0.32)))
    ctx.obj('brazier', parts, ao_h=0.6)
    ctx.obj('flame', flame_cards('flame', (0, 0, 0.98), 0.75, 0.7, count=3), ao=False)
    ctx.empty('light_0', (0, 0, 1.45))
    ctx.empty('fire_fx', (0, 0, 1.0))


@asset('campfire', 'Kamp Ateşi', 'Açık dünya kampı, dinlenme noktası (taş çember + odunlar)', 'town',
       emissive="köz + 'flame' kartları", attach="'flame' ayrı mesh; 'light_0', 'fire_fx' boş node")
def campfire(ctx):
    ctx.mat('stone', t_boulder(R('stone', 4), 16, seed=3, cracks=2, speck=6))
    ctx.mat('bark', t_bark(R('bark', 4), 16, seed=4))
    ctx.mat('end', t_endgrain(R('wood_l', 4), 16))
    rgb, em = t_coals(R('coal', 3), EMBER4, 32, seed=5, hot=0.3)
    ctx.mat('embers', rgb, emit=em, emit_strength=2.2)
    mat_flame(ctx, 'flame', seed=7)
    parts = []
    for k in range(9):
        a = TAU * k / 9
        parts.append(rock_part('stone', 0.17, 10 + k, sub=1, squash=(1.2, 1, 0.8), loc=(math.cos(a) * 0.68, math.sin(a) * 0.68, 0),
                               rot=(0, 0, math.degrees(a)), uv=('box', 3.0)))
    parts.append(P_disc(0.55, 9, 'embers', uv=('disc',), z=0.02))
    for k in range(5):
        a = TAU * k / 5 + 0.4
        parts.append(P_limb((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.02), (math.cos(a) * 0.05, math.sin(a) * 0.05, 0.55),
                            0.07, 0.05, 5, 'bark', uv=('cyl', 2.0), cap0=True))
    for i, (x, rz) in enumerate(((0.95, 20), (-0.9, -30))):
        parts += log_part('bark', 0.1, 0.8, n=6, loc=(x, 0.6 * (1 if i else -1), 0.1), rot=(0, 0, rz), mat_end='end')
    ctx.obj('campfire', parts, ao_h=0.3)
    ctx.obj('flame', flame_cards('flame', (0, 0, 0.05), 0.95, 0.75, count=3, rot0=15), ao=False)
    ctx.empty('light_0', (0, 0, 0.7))
    ctx.empty('fire_fx', (0, 0, 0.15))


# ====================================================================== banners & signs

def _banner(ctx, col, emblem, emblem_col):
    cloth = ramp(col, 5, lo=0.4, hi=1.2)
    trim = R('gold', 4)
    ctx.mat('cloth', t_banner(cloth, trim, emblem, ramp(emblem_col, 4, lo=0.55, hi=1.2), 64, 32, seed=3), double=True)
    ctx.mat('pole', t_bark(R('wood_d', 4), 16, seed=2))
    ctx.mat('gold', t_metal(trim, 16, seed=4, border=False, rivets=False, scratches=1, sparkle=2))
    ctx.mat('stone', t_bricks(R('stone', 4), 16, rows=2, cols=1, seed=6))
    parts = [P_fbox(0.7, 0.7, 0.55, 0.55, 0.3, 'stone', uv=('face', 1, 1))]
    parts.append(P_cyl(0.065, 4.0, 6, 'pole', uv=('cyl', 2.0), z0=0.3))
    parts.append(P_lathe([(0.07, 4.3), (0.11, 4.36), (0.03, 4.42), (0.08, 4.5), (0.0, 4.75)], 4, 'gold', uv=('cylfit', 1)))
    parts.append(P_cyl(0.04, 1.5, 5, 'pole', uv=('cyl', 2.0), z0=-0.75).T(rot=(0, 90, 0)).T(loc=(0, -0.09, 4.05)))
    for sx in (-1, 1):
        parts.append(P_lathe([(0.05, 0.0), (0.0, 0.12)], 4, 'gold', uv=('cylfit', 1)).T(rot=(0, sx * 90, 0))
                     .T(loc=(sx * 0.75, -0.09, 4.05)))
    ctx.obj(ctx.aid, parts, ao_h=0.6)
    # cloth: 1.3 wide x 2.5 high, pointed bottom, gentle wave
    nx, ny = 4, 6
    W, H, top = 1.3, 2.5, 4.0
    verts, uvp = [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x = -W / 2 + W * u
            z = top - H * (1 - v)
            if j == 0:
                z -= 0.32 * (1 - abs(u - 0.5) * 2)
            y = -0.09 + 0.07 * math.sin(u * TAU * 1.0 + v * 2.5) * (1 - v)
            verts.append((x, y, z))
            uvp.append((u, v))
    faces, uvs = [], []
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            f = (a, a + 1, a + nx + 2, a + nx + 1)
            faces.append(f)
            uvs.append([uvp[k] for k in f])
    ctx.obj('cloth', [Part(verts, faces, 'cloth', uvs=uvs, closed=False)], ao=False)


@asset('banner_red', 'Kızıl Sancak', 'Kasaba/lonca sancağı, PvP kızıl takım işareti (kılıç arması)', 'town',
       attach="'cloth' ayrı mesh (rüzgar dalgası için)")
def banner_red(ctx):
    _banner(ctx, C['red'], EMB_SWORD, '#e8e0c8')


@asset('banner_blue', 'Mavi Sancak', 'Kraliyet/kasaba sancağı, mavi takım işareti (taç arması)', 'town',
       attach="'cloth' ayrı mesh")
def banner_blue(ctx):
    _banner(ctx, C['blue'], EMB_CROWN, '#e8c45a')


@asset('banner_green', 'Yeşil Sancak', 'Orman/elf bölgesi sancağı, yeşil takım işareti (ağaç arması)', 'town',
       attach="'cloth' ayrı mesh")
def banner_green(ctx):
    _banner(ctx, C['green'], EMB_TREE, '#e8e0c8')


@asset('signpost', 'Yön Tabelası', 'Kavşak yön levhası (kasaba / zindan / orman)', 'town')
def signpost(ctx):
    wood = R('wood', 5)
    ctx.mat('post', t_planks(R('wood_d', 4), 16, planks=2, seed=91, ends=False, knots=1))
    ctx.mat('sign', t_sign(wood, 32, seed=92, rows=1))
    ctx.mat('sign2', t_sign(wood, 32, seed=93, rows=1))
    ctx.mat('stone', t_boulder(R('stone', 3), 16, seed=2, cracks=2, speck=6))
    parts = [P_box(0.14, 0.14, 2.45, 'post', uv=('box', 1.5)), P_fbox(0.18, 0.18, 0.0, 0.0, 0.15, 'post', uv=('face', 1, 1), z0=2.45)]
    arrow = [(-0.45, -0.11), (0.33, -0.11), (0.47, 0.0), (0.33, 0.11), (-0.45, 0.11)]
    for i, (z, yaw, m) in enumerate(((2.15, 25, 'sign'), (1.85, 155, 'sign2'), (1.55, -65, 'sign'))):
        p = P_prism(arrow, 0.05, m, uv=('face', 1, 1))
        p.T(loc=(0.4, -0.1, 0)).T(rot=(0, 0, yaw)).T(loc=(0, 0, z))
        parts.append(p)
    for k in range(5):
        a = TAU * k / 5
        parts.append(rock_part('stone', 0.12, 20 + k, sub=1, loc=(math.cos(a) * 0.2, math.sin(a) * 0.2, 0), uv=('box', 3.0)))
    ctx.obj('signpost', parts, ao_h=0.5)


@asset('notice_board', 'İlan / Ödül Panosu', 'Görev ve ödül (bounty) panosu; etkileşim noktası', 'town',
       attach="'interact' boş node (panonun önü, -Y)")
def notice_board(ctx):
    wood = R('wood', 5)
    ctx.mat('board', t_planks(wood, 32, planks=4, seed=101, horizontal=True, ends=False, knots=2))
    ctx.mat('beam', t_planks(R('wood_d', 4), 16, planks=2, seed=102, ends=False, knots=0))
    ctx.mat('roof', t_shingles(ramp('#6e4a3a', 4), 32, rows=4, seed=103))
    paper, ink = R('parch', 4, lo=0.6, hi=1.1), R('ink', 2, lo=0.8, hi=1.6)
    ctx.mat('notes', t_paper(paper, ink, 16, seed=4))
    ctx.mat('wanted', t_paper(paper, ink, 32, seed=5, kind='wanted', seal=R('red', 2)))
    parts = []
    for sx in (-1, 1):
        parts.append(P_box(0.14, 0.14, 2.7, 'beam', uv=('box', 1.5)).T(loc=(sx * 1.0, 0, 0)))
    parts.append(P_box(1.86, 0.06, 1.3, 'board', uv=('face', 1, 1), z0=0.95))
    for (sx, sz, x, z) in ((2.0, 0.09, 0, 0.9), (2.0, 0.09, 0, 2.25), (0.09, 1.4, -0.93, 0.9), (0.09, 1.4, 0.93, 0.9)):
        parts.append(P_box(sx, 0.1, sz, 'beam', uv=('box', 2.0), z0=z).T(loc=(x, 0, 0)))
    for sy in (-1, 1):
        r = P_box(2.5, 0.6, 0.05, 'roof', uv=('face', 2, 1))
        r.T(rot=(sy * -30, 0, 0), loc=(0, sy * 0.25, 2.72))
        parts.append(r)
    y = -0.035
    papers = [(-0.6, 1.45, 0.42, 0.55, 'wanted', 3), (0.05, 1.6, 0.38, 0.5, 'wanted', -4), (0.6, 1.5, 0.34, 0.44, 'notes', 6),
              (-0.15, 1.12, 0.3, 0.3, 'notes', -8), (0.5, 1.08, 0.3, 0.32, 'notes', 2)]
    for (x, z, w, h, m, rot) in papers:
        q = quad((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2), m)
        q.T(rot=(0, rot, 0)).T(loc=(x, y, z))
        parts.append(q)
    ctx.obj('notice_board', parts, ao_h=0.6)
    ctx.empty('interact', (0, -1.0, 0))


# ====================================================================== smithing / alchemy

@asset('anvil', 'Örs', 'Demirci, eşya yükseltme NPC noktası', 'town')
def anvil(ctx):
    ctx.mat('steel', t_metal(R('iron', 5), 32, seed=111, border=False, rivets=False, scratches=8, grad=0.25))
    ctx.mat('bark', t_bark(R('bark', 4), 16, seed=112))
    ctx.mat('end', t_endgrain(R('wood_l', 4), 16))
    ctx.mat('handle', t_planks(R('wood', 4), 16, planks=1, seed=3, gap=False, ends=False, knots=0))
    z0 = 0.5
    prof = [(-0.24, 0.0), (0.24, 0.0), (0.16, 0.07), (0.09, 0.1), (0.09, 0.2), (0.2, 0.26), (0.4, 0.29), (0.62, 0.34),
            (0.4, 0.375), (0.22, 0.385), (-0.3, 0.385), (-0.34, 0.3), (-0.12, 0.24), (-0.09, 0.2), (-0.09, 0.1),
            (-0.16, 0.07)]
    body = P_prism(prof, 0.22, 'steel', uv=('box', 2.0))
    body.T(loc=(-0.08, 0, z0))
    base = P_fbox(0.5, 0.36, 0.3, 0.22, 0.08, 'steel', uv=('box', 2.0), z0=z0)
    base.T(loc=(-0.08, 0, 0))
    stump = P_lathe([(0.36, 0.0), (0.32, 0.1), (0.3, z0)], 8, 'bark', uv=('cyl', 1.5), cap0=False, cap1=False, jitter=0.04)
    top = P_disc(0.3, 8, 'end', uv=('disc',), z=z0)
    # hammer lying on the stump top, beside the anvil foot
    hammer = [P_box(0.36, 0.045, 0.045, 'handle', uv=('box', 3.0), z0=z0).T(rot=(0, 0, -35), loc=(0.02, -0.2, 0.0)),
              P_box(0.07, 0.15, 0.07, 'steel', uv=('box', 3.0), z0=z0).T(rot=(0, 0, -35), loc=(0.17, -0.31, 0.0))]
    ctx.obj('anvil', [body, base, stump, top] + hammer, ao_h=0.4)


@asset('forge', 'Demirci Ocağı', 'Demirci NPC işyeri; craft/yükseltme istasyonu', 'town',
       emissive="ocak közleri, kül çukuru, 'flame' kartları", attach="'flame' ayrı mesh; 'light_0', 'fire_fx' boş node")
def forge(ctx):
    ctx.mat('brick', t_bricks(ramp('#8a6a5a', 5), 32, rows=4, cols=2, seed=121))
    ctx.mat('stone', t_bricks(ramp('#8a6a5a', 5, lo=0.32, hi=1.0), 32, rows=2, cols=1, seed=122))
    rgb, em = t_coals(R('coal', 3), EMBER4, 32, seed=6, hot=0.45)
    ctx.mat('coals', rgb, emit=em, emit_strength=2.6)
    ctx.mat('wood', t_planks(R('wood_d', 4), 16, planks=2, seed=4, ends=False, knots=0))
    ctx.mat('leather', t_cloth(R('wood_d', 4), 16, seed=3, folds=2))
    mat_flame(ctx, 'flame', seed=9)
    parts = []
    # hearth block with ash-pit opening at the front
    parts.append(P_box(2.2, 1.6, 0.95, 'stone', uv=('box', 1.0)).T(loc=(0, 0.0, 0)))
    parts.append(quad((-0.45, -0.81, 0.12), (0.45, -0.81, 0.12), (0.45, -0.81, 0.62), (-0.45, -0.81, 0.62), 'coals'))
    parts.append(P_box(1.1, 0.12, 0.08, 'brick', uv=('box', 2.0), z0=0.62).T(loc=(0, -0.83, 0)))
    for sx in (-1, 1):
        parts.append(P_box(0.12, 0.12, 0.58, 'brick', uv=('box', 2.0), z0=0.05).T(loc=(sx * 0.53, -0.83, 0)))
    # rim + coal bed
    for (sx, sy, x, y) in ((2.3, 0.15, 0, -0.78), (2.3, 0.15, 0, 0.78), (0.15, 1.6, -1.08, 0), (0.15, 1.6, 1.08, 0)):
        parts.append(P_box(sx, sy, 0.15, 'brick', uv=('box', 2.0), z0=0.95).T(loc=(x, y, 0)))
    parts.append(quad((-1.0, -0.7, 1.0), (1.0, -0.7, 1.0), (1.0, 0.7, 1.0), (-1.0, 0.7, 1.0), 'coals',
                      uv=((0, 0), (2, 0), (2, 1.4), (0, 1.4))))
    # pillars + hood + chimney
    for sx in (-1, 1):
        parts.append(P_box(0.2, 0.2, 1.0, 'brick', uv=('box', 1.5), z0=1.0).T(loc=(sx * 1.0, -0.65, 0)))
        parts.append(P_box(0.2, 0.2, 1.0, 'brick', uv=('box', 1.5), z0=1.0).T(loc=(sx * 1.0, 0.65, 0)))
    parts.append(P_box(2.3, 1.7, 0.25, 'brick', uv=('box', 1.0), z0=2.0))
    parts.append(P_fbox(2.1, 1.5, 0.75, 0.75, 0.9, 'brick', uv=('box', 1.0), z0=2.25))
    parts.append(P_box(0.7, 0.7, 1.0, 'brick', uv=('box', 1.0), z0=3.15))
    parts.append(P_box(0.85, 0.85, 0.12, 'stone', uv=('box', 2.0), z0=4.15))
    # bellows on the +X side
    bel = P_prism([(-0.45, 0.0), (0.45, 0.05), (0.45, 0.25), (-0.45, 0.4)], 0.5, 'leather', uv=('box', 2.0))
    bel.T(rot=(0, 0, 90), loc=(1.45, 0.1, 0.55))
    parts.append(bel)
    parts.append(P_box(0.55, 1.0, 0.05, 'wood', uv=('box', 2.0), z0=0.55).T(loc=(1.45, 0.1, 0)))
    parts.append(P_box(0.55, 1.0, 0.05, 'wood', uv=('box', 2.0), z0=0.9).T(rot=(-10, 0, 0), loc=(1.45, 0.1, 0.05)))
    parts.append(P_box(0.12, 0.12, 0.55, 'wood', uv=('box', 2.0)).T(loc=(1.45, 0.4, 0)))
    ctx.obj('forge', parts, ao_h=0.7)
    ctx.obj('flame', flame_cards('flame', (0, 0, 1.0), 0.55, 1.2, count=2) +
            flame_cards('flame', (0.5, 0.2, 1.0), 0.4, 0.6, count=2, rot0=45), ao=False)
    ctx.empty('light_0', (0, -0.3, 1.5))
    ctx.empty('fire_fx', (0, 0, 1.05))


@asset('alchemy_table', 'Simya Masası', 'İksir satıcısı / simya craft istasyonu', 'town',
       emissive='iksir sıvıları (yeşil/mor/mavi), mum alevi', attach="'interact' boş node (masanın önü)")
def alchemy_table(ctx):
    ctx.mat('wood', t_planks(R('wood_d', 5), 32, planks=4, seed=131, horizontal=True, ends=False, knots=1))
    glass = ramp('#9ab0b8', 3, lo=0.55, hi=1.25)
    for key, col in (('pot_g', '#5fe04a'), ('pot_p', '#b05ae8'), ('pot_b', '#4ab0f0')):
        rgb, em = t_potion2(glass, ramp(col, 3, lo=0.5, hi=1.2), 16, level=0.6)
        ctx.mat(key, rgb, emit=em, emit_strength=1.8)
    ctx.mat('paper', t_paper(R('bone', 3, lo=0.65, hi=1.1), R('ink', 2), 16, seed=3))
    ctx.mat('book', t_cloth(R('wood_d', 5)[:3], 16, seed=4, folds=0))
    ctx.mat('wax', t_flat(R('bone', 3, lo=0.65, hi=1.1), 8, seed=1))
    mat_flame(ctx, 'flame', seed=3)
    ctx.mat('bone', t_bone(R('bone', 3), 16, seed=2))
    parts = []
    parts.append(P_box(1.9, 0.9, 0.08, 'wood', uv=('box', 1.0), z0=0.85))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(P_box(0.09, 0.09, 0.85, 'wood', uv=('box', 2.0)).T(loc=(sx * 0.85, sy * 0.36, 0)))
        parts.append(P_box(0.06, 0.72, 0.06, 'wood', uv=('box', 2.0), z0=0.18).T(loc=(sx * 0.85, 0, 0)))
    parts.append(P_box(1.7, 0.06, 0.06, 'wood', uv=('box', 2.0), z0=0.18))
    zt = 0.93
    # round flask
    parts.append(P_sphere(0.13, 7, 4, 'pot_g', uv=('cylfit', 1), z0=zt + 0.13).T(loc=(-0.55, -0.1, 0)))
    parts.append(P_cyl(0.04, 0.16, 5, 'pot_g', uv=('cylfit', 1), z0=zt + 0.24).T(loc=(-0.55, -0.1, 0)))
    # tall bottles
    for (x, y, key, h) in ((-0.25, 0.15, 'pot_p', 0.34), (-0.12, 0.25, 'pot_b', 0.26), (0.62, 0.2, 'pot_p', 0.22),
                           (0.75, 0.05, 'pot_g', 0.3)):
        prof = [(0.07, zt), (0.08, zt + h * 0.6), (0.03, zt + h * 0.8), (0.03, zt + h), (0.045, zt + h + 0.02)]
        parts.append(P_lathe(prof, 6, key, uv=('cylfit', 1)).T(loc=(x, y, 0)))
    # open book
    for sx in (-1, 1):
        cover = P_box(0.3, 0.38, 0.02, 'book', uv=('face', 1, 1), z0=zt)
        cover.T(rot=(0, sx * -8, 0), loc=(sx * 0.15, 0, 0))
        page = P_box(0.27, 0.34, 0.025, 'paper', uv=('face', 1, 1), z0=zt + 0.02)
        page.T(rot=(0, sx * -8, 0), loc=(sx * 0.14, 0, 0))
        for p in (cover, page):
            p.T(loc=(0.2, -0.15, 0))
        parts += [cover, page]
    # mortar & pestle
    parts.append(P_lathe([(0.07, zt), (0.1, zt + 0.06), (0.11, zt + 0.1), (0.08, zt + 0.1), (0.06, zt + 0.05)], 6, 'bone',
                         uv=('cyl', 4.0)).T(loc=(0.45, -0.25, 0)))
    parts.append(P_limb((0.45, -0.25, zt + 0.05), (0.52, -0.2, zt + 0.22), 0.02, 0.015, 4, 'bone', uv=('cyl', 4.0)))
    # skull
    parts.append(P_sphere(0.09, 6, 4, 'bone', uv=('box', 4.0), z0=zt + 0.09).T(loc=(0.8, -0.25, 0), scale=(1, 1.15, 0.95)))
    parts.append(P_box(0.1, 0.06, 0.05, 'bone', uv=('box', 4.0), z0=zt).T(loc=(0.8, -0.34, 0)))
    parts += candle_parts('wax', 'flame', (-0.8, 0.25, zt), h=0.2)
    parts += candle_parts('wax', 'flame', (-0.72, 0.32, zt), h=0.14)
    ctx.obj('alchemy_table', parts, ao_h=0.5)
    ctx.empty('interact', (0, -1.0, 0))


@asset('cauldron', 'Kazan', 'Cadı/simyacı kazanı, kamp aşçısı; zindan tuzak süsü', 'town',
       emissive="yeşil kaynayan sıvı ('liquid'), alttaki köz", attach="'liquid' ayrı mesh (UV kaydırma/kabarcık için); 'light_0'")
def cauldron(ctx):
    ctx.mat('iron', t_metal(R('iron_d', 5), 32, seed=141, border=False, rivets=False, scratches=6, grad=0.3))
    liq = ramp('#6ef04a', 4, lo=0.45, hi=1.2)
    rgb = t_swirl(liq, 32, seed=3, arms=2, twist=2.0, edge_dark=False)
    rng = np.random.default_rng(1)
    for k in range(8):
        y, x = int(rng.integers(1, 30)), int(rng.integers(1, 30))
        rgb[y, x] = liq[-1]; rgb[y - 1, x] = liq[-2]; rgb[y, x - 1] = liq[-2]
    ctx.mat('liquid', rgb, emit='same', emit_strength=1.8)
    ctx.mat('bark', t_bark(R('bark', 3), 16, seed=4))
    rgb2, em2 = t_coals(R('coal', 3), EMBER4, 16, seed=8, cells=5, hot=0.4)
    ctx.mat('embers', rgb2, emit=em2, emit_strength=2.0)
    parts = []
    prof = [(0.0, 0.28), (0.35, 0.3), (0.58, 0.45), (0.66, 0.68), (0.6, 0.92), (0.56, 0.98), (0.64, 1.02), (0.62, 1.07),
            (0.52, 1.04), (0.5, 0.95)]
    parts.append(P_lathe(prof, 10, 'iron', uv=('cyl', 1.5), cap0=False, cap1=False))
    for k in range(3):
        a = TAU * k / 3 + 0.5
        parts.append(P_limb((math.cos(a) * 0.38, math.sin(a) * 0.38, 0.42), (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.0),
                            0.07, 0.05, 4, 'iron', uv=('cyl', 3.0), cap0=True))
    for sx in (-1, 1):
        parts.append(P_torus(0.1, 0.022, 6, 3, 'iron', uv=('box', 4.0)).T(rot=(90, 0, 0)).T(loc=(sx * 0.68, 0, 0.95)))
    for k in range(4):
        a = TAU * k / 4 + 0.3
        parts.append(P_limb((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.03), (-math.cos(a) * 0.1, -math.sin(a) * 0.1, 0.1),
                            0.05, 0.045, 5, 'bark', uv=('cyl', 2.0), cap0=True))
    parts.append(P_disc(0.4, 7, 'embers', uv=('disc',), z=0.01))
    ctx.obj('cauldron', parts, ao_h=0.5)
    ctx.obj('liquid', [P_disc(0.53, 10, 'liquid', uv=('disc',), z=0.9)], origin=(0, 0, 0.9), ao=False)
    ctx.empty('light_0', (0, 0, 1.3))


@asset('training_dummy', 'Antrenman Kuklası', 'Kasaba eğitim alanı; hasar testi hedefi', 'town',
       attach="hit animasyonu için gövde tek mesh; 'hit_point' boş node (göğüs)")
def training_dummy(ctx):
    ctx.mat('wood', t_planks(R('wood', 4), 16, planks=2, seed=151, ends=False, knots=1))
    ctx.mat('burlap', t_burlap(R('burlap', 5), 32, seed=3, seam=True))
    ctx.mat('straw', t_straw(R('straw', 4), 16, seed=4))
    ctx.mat('rope', t_rope(R('wood_d', 3)))
    tgt = np.zeros((16, 16, 3))
    y, x = grid(16, 16)
    r = np.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2)
    red, wh = R('red', 3), R('white', 3)
    tgt[:] = wh[1]
    tgt[(r < 7.5) & (r >= 5.5)] = red[1]
    tgt[(r < 3.5) & (r >= 1.5)] = red[1]
    tgt[r < 1.5] = red[2]
    tgt[(r >= 7.5)] = wh[0]
    ctx.mat('target', tgt)
    parts = []
    parts.append(P_box(1.2, 0.14, 0.14, 'wood', uv=('box', 2.0)))
    parts.append(P_box(0.14, 1.2, 0.14, 'wood', uv=('box', 2.0)))
    parts.append(P_cyl(0.08, 1.85, 6, 'wood', uv=('cyl', 2.0)))
    parts.append(P_lathe([(0.2, 0.75), (0.32, 0.9), (0.34, 1.2), (0.3, 1.45), (0.18, 1.55)], 7, 'burlap', uv=('cyl', 1.5),
                         jitter=0.04, seed=2))
    for z in (0.85, 1.48):
        parts.append(P_lathe([(0.3 if z < 1 else 0.24, z - 0.03), (0.3 if z < 1 else 0.24, z + 0.03)], 7, 'rope',
                             uv=('cyl', 3.0), cap0=False, cap1=False))
    parts.append(P_cyl(0.05, 1.3, 5, 'wood', uv=('cyl', 2.0), z0=-0.65).T(rot=(0, 90, 0)).T(loc=(0, 0, 1.35)))
    for sx in (-1, 1):
        parts.append(P_lathe([(0.09, 0.0), (0.11, 0.18), (0.0, 0.3)], 5, 'straw', uv=('cylfit', 1), jitter=0.15, seed=3)
                     .T(rot=(0, sx * 90, 0)).T(loc=(sx * 0.62, 0, 1.35)))
    parts.append(P_sphere(0.21, 7, 4, 'burlap', uv=('cyl', 2.0), z0=1.78, jitter=0.05))
    parts.append(P_lathe([(0.06, 0.0), (0.08, 0.12), (0.0, 0.2)], 5, 'straw', uv=('cylfit', 1), jitter=0.2, seed=5).T(loc=(0, 0, 1.96)))
    parts.append(P_disc(0.19, 8, 'target', uv=('disc',), z=0.0).T(rot=(90, 0, 0)).T(loc=(0, -0.345, 1.15)))
    ctx.obj('training_dummy', parts, ao_h=0.6)
    ctx.empty('hit_point', (0, -0.3, 1.2))
