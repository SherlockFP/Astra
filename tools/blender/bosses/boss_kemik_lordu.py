"""Kemik Lordu - tall skeletal lich king (~5.1 units), floating robe, crown, staff with green gem."""
import math
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, pose,
                     export_glb, bake_report, wlerp, T)

ID = 'kemik_lordu'
NAME_TR = 'Kemik Lordu'


def textures():
    A = Atlas(128, 32)
    A.add('robe', 'cloth', ramp('#0b0710', '#1d1229', '#2e1d45', '#45306a', '#654a92'), 2, 2, seed=1, folds=4, outline='tb')
    A.add('bone', 'bone', ramp('#2a2218', '#6d5f47', '#a99877', '#d6c9a8', '#f3ebd3'), seed=2, outline='tb')
    A.add('skull', 'skull', ramp('#1a140e', '#5f523c', '#a39271', '#d4c6a3', '#f5eedb'), seed=3, outline='', eye=(0.2, 0.55, 0.13))
    A.add('ribs', 'ribs', ramp('#07050a', '#5f523c', '#b4a483', '#efe6cc'), seed=4, outline='')
    A.add('metal', 'metal', ramp('#07080c', '#1c212b', '#343c4b', '#56627a', '#9fb0c8'), seed=5, outline='tb', rivets=True)
    A.add('crown', 'metal', ramp('#0a0d0f', '#25333a', '#3f5a66', '#6f97a3', '#c8f0f0'), seed=6, outline='tb', hi=0.6)
    A.add('trim', 'trim', ramp('#120b04', '#5a3d10', '#9c7022', '#d7ae4c', '#fff0a6'), seed=7, outline='')
    A.add('runes', 'runes', ramp('#07050a', '#1a1024', '#2b1c3d', '#3e2b57'), seed=8, emit='#7dff6a', outline='lr', column=True, rune_color='#b8ff9e')
    A.add('cape', 'cloth', ramp('#050307', '#120b1a', '#21142f', '#352448'), seed=9, folds=5, rags=True, outline='t')
    A.add('wood', 'wood', ramp('#120c08', '#2e2016', '#4d3826', '#71553b'), seed=10, outline='tb')
    A.add('gem', 'gem', ramp('#06200b', '#167a26', '#33d046', '#93ff83', '#eaffdc'), seed=11, emit='base', outline='')
    A.add('eye', 'glow', ramp('#1d8a2a', '#51ff5a', '#c4ffb4', '#ffffff'), seed=12, emit='base', outline='')
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0, 2.05), 'root'),
    ('skirt', (0, 0, 1.5), 'hips'),
    ('spine', (0, 0, 2.55), 'hips'),
    ('chest', (0, 0, 3.1), 'spine'),
    ('neck', (0, 0, 3.72), 'chest'),
    ('head', (0, 0, 3.98), 'neck'),
    ('jaw', (0, -0.1, 4.08), 'head'),
    ('cape1', (0, 0.64, 3.45), 'chest'),
    ('cape2', (0, 0.84, 1.9), 'cape1'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'shoulder_{sd}', (s * 0.42, 0, 3.55), 'chest'),
        (f'upperarm_{sd}', (s * 0.74, 0, 3.5), f'shoulder_{sd}'),
        (f'forearm_{sd}', (s * 0.92, -0.04, 2.82), f'upperarm_{sd}'),
        (f'hand_{sd}', (s * 1.02, -0.1, 2.2), f'forearm_{sd}'),
    ]
BONES.append(('fx_staff', (-1.04, -0.16, 4.48), 'hand_R'))


def geometry(B):
    # robe skirt (tattered hem) + rune tabard + belt
    B.lathe('robe', [(1.12, 0.04), (0.98, 0.75), (0.74, 1.55), (0.56, 2.35)], 10, sy=0.86, cap0=False, cap1=False,
            ring_w=[{'skirt': 1}, {'skirt': 0.75, 'hips': 0.25}, {'hips': 1}, {'hips': 1}], zig=(0, 0.3))
    B.box('runes', (0.5, 0.06, 1.8), T((0, -0.93, 1.4)), top=(0.84, 1), top_off=(0, 0.4),
          wfun=lambda p: wlerp('skirt', 'hips', (p.z - 0.3) / 1.4))
    B.cyl('trim', 0.6, 0.6, 0.2, 10, T((0, 0, 2.22)), sy=0.86, bone='hips')
    B.lathe('trim', [(1.085, 0.36), (1.05, 0.54)], 10, sy=0.87, cap0=False, cap1=False, closed=False,
            ring_w=[{'skirt': 0.92, 'hips': 0.08}, {'skirt': 0.88, 'hips': 0.12}])
    B.sphere('skull', 0.15, 6, 4, T((0, -0.56, 2.33)), scale=(1, 0.8, 1), bone='hips')
    # torso, ribs, neck
    B.lathe('robe', [(0.56, 2.3), (0.7, 2.85), (0.86, 3.4), (0.5, 3.72)], 8, sy=0.68, cap0=False,
            ring_w=[{'spine': 1}, {'spine': 1}, {'chest': 1}, {'chest': 1}])
    B.box('ribs', (0.6, 0.1, 0.78), T((0, -0.53, 3.05)), top=(1.15, 1), bottom=(0.7, 1), bone='chest')
    B.limb('bone', (0, 0, 3.6), (0, 0, 4.04), 0.09, 0.08, 5, bone='neck')
    # skull, jaw, eyes, crown
    B.sphere('skull', 0.3, 8, 5, T((0, -0.04, 4.28)), scale=(0.88, 1.0, 1.05), bone='head')
    B.box('bone', (0.36, 0.3, 0.12), T((0, -0.17, 4.04)), bottom=(0.75, 0.8), bone='jaw')
    for s in (1, -1):
        B.octa('eye', 0.06, T((s * 0.13, -0.3, 4.33)), stretch=0.8, bone='head')
    B.cyl('crown', 0.27, 0.3, 0.14, 8, T((0, -0.04, 4.45)), cap0=False, cap1=False, bone='head', closed=False)
    for ang, h in ((0, 0.6), (45, 0.4), (-45, 0.4), (100, 0.32), (-100, 0.32), (155, 0.26), (-155, 0.26)):
        a = math.radians(ang)
        dx, dy = math.sin(a), -math.cos(a)
        p0 = (dx * 0.27, -0.04 + dy * 0.27, 4.56)
        p1 = (p0[0] + dx * 0.1 * h, p0[1] + dy * 0.1 * h, 4.56 + h)
        B.spike('crown', p0, p1, 0.065, 4, bone='head')
    B.octa('gem', 0.065, T((0, -0.33, 4.53)), bone='head')
    # high collar fins behind the head
    for ang in (-62, -31, 0, 31, 62):
        a = math.radians(ang)
        r = (math.sin(a), math.cos(a), 0)
        tng = (math.cos(a), -math.sin(a), 0)
        p0 = (r[0] * 0.3, 0.06 + r[1] * 0.3, 3.62)
        p1 = (p0[0] + r[0] * 0.42, p0[1] + r[1] * 0.42, 4.55 - abs(ang) / 400)
        B.slab('metal', p0, p1, 0.28, 0.05, side=tng, top=(0.3, 1), bone='chest')
    # pauldrons with bone spikes, arms, sleeves, claws
    for s, sd in ((1, 'L'), (-1, 'R')):
        B.sphere('metal', 0.4, 6, 4, T((s * 0.72, 0.0, 3.64)), scale=(1.15, 1.0, 0.8), bone=f'shoulder_{sd}')
        for dx, dy, L in ((-0.08, -0.16, 0.55), (0.12, 0.0, 0.72), (-0.04, 0.17, 0.5)):
            a = (s * (0.74 + dx), dy, 3.86)
            d = (s * 0.5, dy * 0.7, 0.8)
            n = math.sqrt(sum(c * c for c in d))
            B.spike('bone', a, tuple(a[i] + d[i] / n * L for i in range(3)), 0.08, 4, bone=f'shoulder_{sd}')
        sh, el, wr = (s * 0.74, 0, 3.5), (s * 0.92, -0.04, 2.82), (s * 1.02, -0.1, 2.22)
        B.limb('bone', sh, el, 0.085, 0.07, 5, bone=f'upperarm_{sd}')
        B.lathe_between('robe', (s * 0.96, -0.06, 2.72), (s * 0.76, 0, 3.45), [(0.44, 0), (0.32, 0.5), (0.2, 1.0)], 8,
                        cap0=False, zig=(0, 0.12), bone=f'upperarm_{sd}')
        B.limb('bone', el, wr, 0.07, 0.06, 5, bone=f'forearm_{sd}')
        B.box('bone', (0.17, 0.09, 0.17), T((s * 1.03, -0.11, 2.13)), bone=f'hand_{sd}')
        for dx in (-0.06, 0.0, 0.06):
            a = (s * 1.03 + dx, -0.14, 2.06)
            B.spike('bone', a, (s * 1.03 + dx * 1.6, -0.24, 1.8), 0.035, 3, bone=f'hand_{sd}')
    # staff (right hand) with skull head, claw prongs and the glowing gem
    sx, sy = -1.04, -0.16
    B.limb('wood', (sx, sy, 0.28), (sx, sy, 4.2), 0.055, 0.055, 6, bone='hand_R')
    B.spike('metal', (sx, sy, 0.32), (sx, sy, 0.02), 0.065, 4, bone='hand_R')
    B.sphere('skull', 0.13, 6, 4, T((sx, sy - 0.02, 4.1)), scale=(0.9, 1, 1), bone='hand_R')
    for k in range(3):
        a = math.radians(60 + 120 * k)
        c, sn = math.sin(a), -math.cos(a)
        pts = [(sx + c * r, sy + sn * r, z) for r, z in ((0.07, 4.2), (0.22, 4.44), (0.16, 4.68), (0.03, 4.82))]
        B.tube('crown', pts, [0.04, 0.035, 0.025, 0.0], 4, bone='hand_R')
    B.octa('gem', 0.13, T((sx, sy, 4.48)), stretch=1.5, bone='fx_staff')
    # cape
    rows = []
    for z, y, hw in ((3.55, 0.64, 0.62), (1.9, 0.82, 0.85), (0.12, 1.06, 1.0)):
        row = []
        for c in range(7):
            x = -hw + 2 * hw * c / 6
            zz = z + (0.38 if (z < 1 and c % 2 == 1) else 0)
            row.append((x, y + 0.06 * abs(x), zz))
        rows.append(row)
    B.sheet('cape', rows, ring_w=[{'chest': 1}, {'cape1': 1}, {'cape2': 1}])


def actions():
    BASE = {'root@loc': (0, 0, 0.16),
            'upperarm_L': (-8, -14, 0), 'forearm_L': (-28, 0, 0), 'hand_L': (10, 0, 0),
            'upperarm_R': (-12, 12, 0), 'forearm_R': (-24, 0, 0), 'hand_R': (36, -12, 0)}
    P = lambda **k: pose(BASE, **k)
    idle = [(0, BASE),
            (30, P(root__loc=(0, 0, 0.12), chest=(3, 0, 0), head=(-4, 0, 2), upperarm_L=(0, -5, 0), forearm_L=(-6, 0, 0),
                   cape1=(-5, 0, 0), cape2=(4, 0, 0), skirt=(3, 0, 0), fx_staff__loc=(0, 0, 0.06))),
            (60, BASE)]
    W0 = P(chest=(10, 0, 0), spine=(4, 0, 0), skirt=(10, 0, 0), cape1=(16, 0, 0), cape2=(8, 0, 0),
           upperarm_L=(16, 0, 0), upperarm_R=(-6, 0, 0))
    walk = [(0, W0),
            (9, pose(W0, root__loc=(0, 0, 0.1), skirt=(4, 0, 0), cape2=(6, 0, 0))),
            (18, pose(W0, upperarm_L=(-30, 0, 0), upperarm_R=(8, 0, 0), skirt=(6, 0, 0), chest=(0, 0, 4))),
            (27, pose(W0, root__loc=(0, 0, 0.1), skirt=(2, 0, 0), cape2=(6, 0, 0))),
            (36, W0)]
    R0 = P(chest=(20, 0, 0), spine=(8, 0, 0), head=(-14, 0, 0), skirt=(22, 0, 0), cape1=(22, 0, 0), cape2=(10, 0, 0),
           upperarm_L=(30, -10, 0), forearm_L=(-30, 0, 0), upperarm_R=(-10, 0, 0))
    run = [(0, R0), (6, pose(R0, root__loc=(0, 0, 0.14), cape2=(10, 0, 0))),
           (12, pose(R0, upperarm_L=(-45, 0, 0), skirt=(8, 0, 0))), (18, pose(R0, root__loc=(0, 0, 0.14), cape2=(10, 0, 0))),
           (24, R0)]
    wind = P(upperarm_R=(-153, -2, 0), forearm_R=(9, 0, 0), hand_R=(44, 2, 0), chest=(-14, 0, 12), spine=(-6, 0, 0),
             head=(-10, 0, 0), root__loc=(0, 0.1, 0.22), upperarm_L=(-50, -30, 0), cape1=(-12, 0, 0), skirt=(-6, 0, 0))
    strike = P(upperarm_R=(-80, -7, 0), forearm_R=(14, 0, 0), hand_R=(155, 12, 0), chest=(26, 0, -10), spine=(10, 0, 0),
               head=(8, 0, 0), root__loc=(0, -0.25, -0.1), upperarm_L=(-22, -25, 0), cape1=(14, 0, 0), skirt=(-10, 0, 0))
    attack = [(0, BASE), (12, wind), (15, pose(wind, chest=(-4, 0, 0))), (19, strike),
              (26, pose(strike, chest=(4, 0, 0))), (42, BASE)]
    sw0 = P(chest=(-4, 0, 42), spine=(0, 0, 14), upperarm_L=(-12, -72, 0), forearm_L=(0, 0, 0), hand_L=(-10, 0, 0),
            head=(0, 0, -20), skirt=(0, 0, 8), root__loc=(0, 0.1, 0.0))
    sw1 = P(chest=(12, 0, -52), spine=(4, 0, -16), upperarm_L=(-72, -18, 0), forearm_L=(-6, 0, 0), hand_L=(10, 0, 0),
            head=(0, 0, 22), skirt=(0, 0, -10), root__loc=(0, -0.3, 0.0), cape1=(0, 0, 10))
    attack2 = [(0, BASE), (13, sw0), (19, sw1), (26, pose(sw1, chest=(0, 0, -6))), (42, BASE)]
    raise_ = P(upperarm_L=(-12, -140, 0), forearm_L=(0, -22, 0), upperarm_R=(-12, 140, 0), forearm_R=(24, 0, 0),
               hand_R=(-36, -128, 0), chest=(-14, 0, 0), head=(-22, 0, 0), root__loc=(0, 0, 0.5), cape1=(-10, 0, 0),
               jaw=(18, 0, 0), fx_staff__loc=(0, 0, 0.12))
    thrust = P(upperarm_L=(-82, -16, 0), forearm_L=(0, 0, 0), upperarm_R=(-82, 12, 0), forearm_R=(24, 0, 0),
               hand_R=(22, -12, 0), chest=(14, 0, 0), head=(4, 0, 0), root__loc=(0, -0.2, 0.25), jaw=(26, 0, 0))
    cast = [(0, BASE), (18, raise_), (30, pose(raise_, chest=(-4, 0, 3), root__loc=(0, 0, 0.06))),
            (40, pose(raise_, chest=(-2, 0, -3), root__loc=(0, 0, 0.1))), (47, thrust), (54, thrust), (66, BASE)]
    gather = P(chest=(26, 0, 0), spine=(8, 0, 0), head=(22, 0, 0), upperarm_L=(-26, -6, 0), forearm_L=(-70, 0, 0),
               upperarm_R=(-20, 6, 0), forearm_R=(-50, 0, 0), hand_R=(64, -6, 0), root__loc=(0, 0, -0.04))
    roar = P(chest=(-20, 0, 0), spine=(-6, 0, 0), head=(-26, 0, 0), jaw=(38, 0, 0), upperarm_L=(-6, -72, 0),
             forearm_L=(0, -24, 0), upperarm_R=(-6, 66, 0), forearm_R=(20, 0, 0), hand_R=(-6, -66, 0),
             root__loc=(0, 0, 0.45), cape1=(-22, 0, 0), skirt=(-10, 0, 0))
    enrage = [(0, BASE), (10, gather), (20, roar)]
    for i, f in enumerate((26, 32, 38, 44)):
        enrage.append((f, pose(roar, chest=(0, 0, 6 if i % 2 else -6), jaw=(-6 if i % 2 else 4, 0, 0))))
    enrage += [(52, roar), (64, BASE)]
    hit = [(0, BASE), (4, P(chest=(-18, 0, 8), head=(-16, 0, 0), root__loc=(0, 0.28, 0.1), upperarm_L=(-22, -30, 0),
                            skirt=(-8, 0, 0), cape1=(-6, 0, 0))), (16, BASE)]
    rec = P(chest=(-26, 0, 0), head=(-30, 0, 0), upperarm_L=(-40, -60, 0), upperarm_R=(-40, 60, 0), hand_R=(0, -50, 0),
            root__loc=(0, 0.1, 0.38), jaw=(30, 0, 0))
    fall = P(root=(38, 0, 0), root__loc=(0, 0, 0.3), chest=(20, 0, 0), head=(18, 0, 0), upperarm_L=(-30, -16, 0),
             upperarm_R=(-30, 16, 0), jaw=(20, 0, 0), skirt=(-10, 0, 0))
    down = {'root': (88, 0, 0), 'root@loc': (0, 0, 1.0), 'chest': (6, 0, 0), 'head': (-10, 0, 38), 'jaw': (26, 0, 0),
            'upperarm_L': (-150, -24, 0), 'forearm_L': (-10, 0, 0), 'upperarm_R': (-120, 30, 0), 'forearm_R': (-10, 0, 0),
            'hand_R': (-48, 25, 0), 'skirt': (0, 0, 0), 'cape1': (-16, 0, 0), 'cape2': (-8, 0, 0)}
    death = [(0, BASE), (12, rec), (28, fall), (40, pose(down, root=(5, 0, 0), root__loc=(0, 0, -0.04))),
             (48, pose(down, root=(-3, 0, 0), root__loc=(0, 0, 0.06))), (60, down)]
    return [('Idle', idle), ('Walk', walk), ('Run', run), ('Attack', attack), ('Attack2', attack2), ('Cast', cast),
            ('Enrage', enrage), ('Hit', hit), ('Death', death)]


def build(out_dir):
    A = textures()
    base_img, emit_img = A.images(ID)
    mat = make_material(ID, base_img, emit_img, emit_strength=2.0)
    arm = build_armature('Rig', BONES)
    B = Builder(A)
    geometry(B)
    ob, bad = B.build(ID, mat, arm)
    add_actions(arm, actions())
    path = f'{out_dir}/{ID}.glb'
    export_glb(path)
    return bake_report(ID, B, arm, path, dict(emissive=sorted(A.emissive), name=NAME_TR, invalid=bool(bad)))
