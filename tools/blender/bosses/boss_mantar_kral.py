"""Mantar Kral - giant mushroom king (~5.2 units): huge spotted cap with glowing spots and a tiny gold crown,
grumpy face on the stalk with a moss beard, royal ruff + velvet cape, glowing mushroom scepter."""
import math
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, export_glb, bake_report,
                     T, P, sym, biped_walk)

ID = 'mantar_kral'
NAME_TR = 'Mantar Kral'
PREVIEW = [('Idle', 0), ('Walk', 10), ('Attack', 14), ('Attack', 22), ('Attack2', 21), ('Cast', 22), ('Enrage', 20),
           ('Death', 64)]


def textures():
    A = Atlas(128, 32)
    A.add('cap', 'spots', ramp('#1c0404', '#540d0a', '#8c1a12', '#c42f1c', '#ec6436'), 2, 2, seed=61, spots=16,
          rmin=2.6, rmax=5.2, emit='#e6ff98', spot_color='#f6eed2', outline='b')
    A.add('stalk', 'wood', ramp('#3a3024', '#7a6a52', '#b4a486', '#dccfb4', '#f6eedc'), seed=62, dither=0.45, outline='tb')
    A.add('gills', 'gills', ramp('#21170f', '#4e3c2a', '#806a50', '#b29c7c'), seed=63, lines=12, outline='')
    A.add('ruff', 'cloth', ramp('#5a5048', '#9a9080', '#cfc6b4', '#f2ecdc', '#ffffff'), seed=64, folds=8, outline='tb')
    A.add('velvet', 'cloth', ramp('#0c0512', '#28113e', '#46206a', '#6a389a', '#9460c4'), seed=65, folds=4, outline='b')
    A.add('moss', 'fur', ramp('#0a1607', '#1c3611', '#335c1c', '#56882e', '#8aba4e'), seed=66, outline='')
    A.add('gold', 'gold', ramp('#2a1a05', '#6b4a12', '#b07f24', '#e0b84a', '#fff0a0'), seed=67, outline='tb')
    A.add('gem', 'gem', ramp('#3a0010', '#a0102a', '#ff3050', '#ff9aa8', '#ffffff'), seed=68, emit='base', outline='')
    A.add('eye', 'glow', ramp('#d0a000', '#ffe040', '#fff8b0', '#ffffff'), seed=69, emit='base', outline='')
    A.add('glowcap', 'spots', ramp('#063a36', '#0c7a6e', '#18c0a8', '#5af0d8', '#c0fff4'), seed=70, spots=5,
          spot_color='#f0fff8', emit='base', outline='')
    A.add('bark', 'wood', ramp('#120c07', '#2e2014', '#4c3722', '#6e5234'), seed=71, outline='tb')
    A.add('void', 'void', ramp('#000000', '#0a0404', '#180a08', '#2a120e'), seed=72, outline='', grad=0.0)
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0, 1.15), 'root'),
    ('spine', (0, 0, 1.8), 'hips'),
    ('chest', (0, 0, 2.5), 'spine'),
    ('cap', (0, 0, 3.3), 'chest'),
    ('fx_cap', (0, 0, 4.9), 'cap'),
    ('jaw', (0, -0.62, 2.0), 'spine'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperarm_{sd}', (s * 0.8, 0, 2.6), 'chest'),
        (f'forearm_{sd}', (s * 1.15, -0.08, 1.98), f'upperarm_{sd}'),
        (f'hand_{sd}', (s * 1.3, -0.18, 1.42), f'forearm_{sd}'),
        (f'thigh_{sd}', (s * 0.42, 0, 1.05), 'hips'),
        (f'shin_{sd}', (s * 0.46, -0.04, 0.62), f'thigh_{sd}'),
        (f'foot_{sd}', (s * 0.48, -0.06, 0.24), f'shin_{sd}'),
    ]
BONES.append(('fx_scepter', (-1.33, -0.27, 2.98), 'hand_R'))


def mini_mushroom(B, base, up, h, r, bone):
    """Small glowing mushroom: stalk from base along `up`, cap at the top."""
    n = math.sqrt(sum(c * c for c in up))
    u = [c / n for c in up]
    top = tuple(base[i] + u[i] * h for i in range(3))
    B.limb('stalk', base, top, r * 0.28, r * 0.22, 5, bone=bone)
    B.lathe_between('glowcap', tuple(top[i] - u[i] * r * 0.15 for i in range(3)), tuple(top[i] + u[i] * r * 0.75 for i in range(3)),
                    [(r, 0), (r * 0.9, 0.35), (r * 0.5, 0.75), (0.0, 1.0)], 7, bone=bone)


def geometry(B):
    B.lathe('stalk', [(0.72, 0.72), (0.86, 1.3), (0.84, 2.0), (0.72, 2.7), (0.6, 3.36)], 10, sy=0.9, cap1=False,
            ring_w=[{'hips': 1}, {'hips': 0.6, 'spine': 0.4}, {'spine': 1}, {'chest': 1}, {'chest': 1}])
    B.lathe('ruff', [(1.02, 2.6), (0.86, 2.86), (0.62, 3.1)], 12, sy=0.95, cap0=False, cap1=False, zig=(0, 0.16),
            bone='chest', closed=False)
    # cap with gills underneath, crown on top, little glowing mushrooms
    B.lathe('cap', [(1.8, 3.26), (1.92, 3.5), (1.72, 4.0), (1.16, 4.5), (0.5, 4.8), (0.0, 4.88)], 12, cap0=False,
            bone='cap')
    B.lathe('gills', [(0.56, 3.44), (1.8, 3.26)], 12, cap0=False, cap1=False, bone='cap', closed=False)
    B.cyl('gold', 0.5, 0.56, 0.26, 8, T((0, 0, 4.7)), cap0=False, cap1=False, bone='cap', closed=False)
    for k in range(6):
        a = math.radians(60 * k)
        dx, dy = math.sin(a), -math.cos(a)
        p0 = (dx * 0.54, dy * 0.54, 4.94)
        B.spike('gold', p0, (dx * 0.66, dy * 0.66, 5.3), 0.1, 4, bone='cap')
    B.octa('gem', 0.09, T((0, -0.58, 4.85)), stretch=1.3, bone='cap')
    for ang, r, z, hh, rr in ((55, 1.3, 4.36, 0.32, 0.22), (200, 1.0, 4.56, 0.26, 0.17), (-70, 1.56, 4.0, 0.36, 0.25),
                              (130, 1.62, 3.9, 0.22, 0.15)):
        a = math.radians(ang)
        dx, dy = math.sin(a), -math.cos(a)
        mini_mushroom(B, (dx * r, dy * r, z - 0.05), (dx * 0.5, dy * 0.5, 1.0), hh, rr, 'cap')
    # face
    for s in (1, -1):
        B.sphere('eye', 0.11, 6, 4, T((s * 0.25, -0.73, 2.3)), scale=(1, 0.7, 1), bone='chest')
        B.slab('bark', (s * 0.08, -0.82, 2.48), (s * 0.42, -0.74, 2.44), 0.12, 0.1, bone='chest')
        B.slab('moss', (s * 0.05, -0.86, 1.98), (s * 0.36, -0.8, 1.76), 0.14, 0.09, bone='jaw')
    B.sphere('stalk', 0.15, 6, 4, T((0, -0.84, 2.1)), scale=(1, 1, 1.1), bone='chest')
    B.box('void', (0.42, 0.08, 0.1), T((0, -0.8, 1.9)), bone='jaw')
    B.slab('moss', (0, -0.77, 1.9), (0, -0.88, 1.1), 0.62, 0.22, top=(0.35, 0.6), bone='jaw')
    # royal cape
    rows = []
    for z, y, hw in ((2.68, 0.7, 0.74), (1.6, 0.88, 0.96), (0.36, 1.02, 1.12)):
        rows.append([(-hw + 2 * hw * c / 6, y + 0.08 * abs(-hw + 2 * hw * c / 6), z) for c in range(7)])
    B.sheet('velvet', rows, ring_w=[{'chest': 1}, {'spine': 1}, {'hips': 1}])
    # arms with mushroom pauldrons, root fingers
    for s, sd in ((1, 'L'), (-1, 'R')):
        sh, el, wr = (s * 0.8, 0, 2.6), (s * 1.15, -0.08, 1.98), (s * 1.3, -0.18, 1.42)
        B.lathe('cap', [(0.46, 0), (0.44, 0.14), (0.28, 0.3), (0.0, 0.36)], 8, T((s * 0.86, 0.0, 2.68)),
                bone=f'upperarm_{sd}')
        B.limb('stalk', sh, el, 0.17, 0.14, 6, bone=f'upperarm_{sd}')
        B.limb('stalk', el, wr, 0.14, 0.12, 6, bone=f'forearm_{sd}')
        B.sphere('stalk', 0.18, 6, 4, T((s * 1.32, -0.2, 1.32)), bone=f'hand_{sd}')
        for dx in (-0.08, 0.0, 0.08):
            B.spike('bark', (s * 1.32 + dx, -0.26, 1.24), (s * 1.34 + dx * 1.8, -0.36, 1.0), 0.05, 3, bone=f'hand_{sd}')
        B.limb('stalk', (s * 0.42, 0, 1.12), (s * 0.46, -0.04, 0.6), 0.3, 0.27, 6, bone=f'thigh_{sd}')
        B.limb('stalk', (s * 0.46, -0.04, 0.64), (s * 0.48, -0.06, 0.22), 0.27, 0.25, 6, bone=f'shin_{sd}')
        B.sphere('stalk', 0.36, 6, 4, T((s * 0.5, -0.16, 0.17)), scale=(1, 1.3, 0.5), bone=f'foot_{sd}')
        for dx in (-0.16, 0.0, 0.16):
            B.spike('bark', (s * 0.5 + dx, -0.5, 0.12), (s * 0.5 + dx * 1.3, -0.78, 0.02), 0.07, 3, bone=f'foot_{sd}')
    # scepter: bark staff with a glowing mushroom on top
    B.limb('bark', (-1.33, -0.27, 0.32), (-1.33, -0.27, 2.76), 0.065, 0.06, 6, bone='hand_R')
    B.lathe('gills', [(0.06, 0), (0.3, 0.06)], 7, T((-1.33, -0.27, 2.74)), cap0=False, cap1=False, bone='fx_scepter',
            closed=False)
    B.lathe('glowcap', [(0.34, 0), (0.32, 0.12), (0.2, 0.26), (0.0, 0.32)], 8, T((-1.33, -0.27, 2.78)), bone='fx_scepter')


def actions():
    BASE = P({'hips@loc': (0, 0, -0.04)},
             sym(thigh=(-8, 0, 0), shin=(14, 0, 0), foot=(-6, 0, 0), upperarm=(-6, -16, 0), forearm=(-22, 0, 0)),
             forearm_R=(-10, 0, 0), hand_R=(38, -16, 0))
    idle = [(0, BASE), (15, P(BASE, cap=(3, 0, 2), chest=(-2, 0, 0))),
            (30, P(BASE, sym(upperarm=(0, -4, 0)), cap=(0, 0, -3), hips__loc=(0, 0, -0.04))),
            (45, P(BASE, cap=(-3, 0, 1), chest=(2, 0, 0))), (60, BASE)]
    walk = biped_walk(BASE, 40, stride=22, knee=30, arm=14, bob=0.1, sway=8, roll=6,
                      extra=lambda ph: {'cap': ((-3, 4, -3, 4)[ph], (4, 0, -4, 0)[ph], 0), 'chest': (0, (0, -4, 0, 4)[ph], 0)})
    run = biped_walk(P(BASE, chest=(12, 0, 0), cap=(-6, 0, 0)), 26, stride=32, knee=50, arm=26, bob=0.16, sway=10, roll=8,
                     extra=lambda ph: {'cap': ((-6, 6, -6, 6)[ph], 0, 0)})
    back = P(BASE, sym(upperarm=(34, -24, 0)), chest=(-22, 0, 0), spine=(-6, 0, 0), cap=(-12, 0, 0),
             hips__loc=(0, 0.2, 0.06), thigh_L=(-14, 0, 0), thigh_R=(8, 0, 0))
    butt = P(BASE, sym(upperarm=(-40, -30, 0), forearm=(-6, 0, 0), thigh=(-40, 0, 0), shin=(58, 0, 0), foot=(-18, 0, 0)),
             chest=(40, 0, 0), spine=(16, 0, 0), cap=(16, 0, 0), jaw=(18, 0, 0), hips__loc=(0, -0.3, -0.2),
             hand_R=(30, 0, 0))
    attack = [(0, BASE), (14, back), (18, P(back, chest=(6, 0, 0))), (22, butt), (26, P(butt, cap=(-10, 0, 0))),
              (31, P(butt, cap=(4, 0, 0))), (44, BASE)]
    sw0 = P(BASE, chest=(-4, 0, -42), spine=(0, 0, -12), upperarm_R=(-22, 74, 0), forearm_R=(0, 0, 0),
            hand_R=(-40, -74, 0), upperarm_L=(-26, -14, 0), cap=(0, 0, 10), hips__loc=(0, 0, -0.06))
    sw1 = P(BASE, chest=(12, 0, 50), spine=(2, 0, 14), upperarm_R=(-84, 14, 0), forearm_R=(0, 0, 0),
            hand_R=(-30, -10, 0), upperarm_L=(12, -24, 0), cap=(4, 0, -14), hips__loc=(0, -0.2, -0.08))
    attack2 = [(0, BASE), (14, sw0), (21, sw1), (28, P(sw1, chest=(0, 0, 8), cap=(0, 0, 8))), (44, BASE)]
    up = P(BASE, sym(upperarm=(-18, -138, 0), forearm=(0, -14, 0)), hand_R=(-38, -110, 0), chest=(-14, 0, 0),
           cap=(-12, 0, 0), jaw=(16, 0, 0), hips__loc=(0, 0, 0.06))
    burst = P(BASE, sym(upperarm=(-12, -84, 0), forearm=(0, -10, 0)), hand_R=(-30, -70, 0), chest=(12, 0, 0),
              cap=(12, 0, 0), jaw=(26, 0, 0), hips__loc=(0, 0, -0.16), thigh_L=(-28, 0, 0), thigh_R=(-28, 0, 0),
              shin_L=(48, 0, 0), shin_R=(48, 0, 0), foot_L=(-20, 0, 0), foot_R=(-20, 0, 0))
    cast = [(0, BASE), (20, up), (27, P(up, cap=(4, 0, 4))), (34, P(up, cap=(-2, 0, -4))), (41, P(up, cap=(3, 0, 2))),
            (46, burst), (54, P(burst, cap=(-8, 0, 0))), (66, BASE)]
    crouch = P(BASE, sym(thigh=(-40, 0, 0), shin=(70, 0, 0), foot=(-30, 0, 0), upperarm=(30, -20, 0)), chest=(14, 0, 0),
               hips__loc=(0, 0, -0.32), cap=(-6, 0, 0))
    air = P(BASE, sym(thigh=(-30, 0, 0), shin=(44, 0, 0), upperarm=(-30, -140, 0)), hand_R=(-30, -110, 0),
            chest=(-10, 0, 0), cap=(-14, 0, 0), root__loc=(0, 0, 0.95))
    land = P(BASE, sym(thigh=(-50, 0, 0), shin=(86, 0, 0), foot=(-36, 0, 0), upperarm=(-10, -60, 0)), chest=(20, 0, 0),
             cap=(18, 0, 0), hips__loc=(0, 0, -0.34))
    roar = P(BASE, sym(upperarm=(-14, -70, 0), forearm=(-10, 0, 0)), chest=(-18, 0, 0), cap=(-8, 0, 0), jaw=(34, 0, 0))
    enrage = [(0, BASE), (10, crouch), (20, air), (27, land), (32, P(land, cap=(-26, 0, 0))), (37, P(land, cap=(-6, 0, 0))),
              (46, roar), (52, P(roar, chest=(0, 0, 5))), (58, P(roar, chest=(0, 0, -5))), (70, BASE)]
    hit = [(0, BASE), (4, P(BASE, chest=(-15, 0, 8), cap=(-12, 0, 6), hips__loc=(0, 0.22, 0))),
           (10, P(BASE, cap=(6, 0, -3))), (18, BASE)]
    stag = P(BASE, sym(upperarm=(-30, -50, 0)), chest=(-20, 0, 0), cap=(-16, 0, 0), jaw=(28, 0, 0), hips__loc=(0, 0.22, 0))
    fall = P(BASE, sym(upperarm=(-80, -60, 0), thigh=(-30, 0, 0)), root=(-44, 0, 0), root__loc=(0, 0.2, 0.2),
             chest=(-6, 0, 0), cap=(20, 0, 0), jaw=(24, 0, 0))
    down = P(BASE, sym(upperarm=(-130, -50, 0), thigh=(-40, 0, 0), shin=(20, 0, 0)), root=(-82, 0, 0),
             root__loc=(0, 0.1, 1.02), cap=(46, 0, 12), jaw=(20, 0, 0), hand_R=(-30, 0, 0))
    death = [(0, BASE), (12, stag), (28, fall), (42, P(down, root=(-6, 0, 0), root__loc=(0, 0, -0.06), cap=(10, 0, 0))),
             (50, P(down, root=(3, 0, 0), cap=(-6, 0, 0))), (64, down)]
    return [('Idle', idle), ('Walk', walk), ('Run', run), ('Attack', attack), ('Attack2', attack2), ('Cast', cast),
            ('Enrage', enrage), ('Hit', hit), ('Death', death)]


def build(out_dir):
    A = textures()
    base_img, emit_img = A.images(ID)
    mat = make_material(ID, base_img, emit_img, emit_strength=1.6)
    arm = build_armature('Rig', BONES)
    B = Builder(A)
    geometry(B)
    ob, bad = B.build(ID, mat, arm)
    add_actions(arm, actions())
    path = f'{out_dir}/{ID}.glb'
    export_glb(path)
    return bake_report(ID, B, arm, path, dict(emissive=sorted(A.emissive), name=NAME_TR, invalid=bool(bad)))
