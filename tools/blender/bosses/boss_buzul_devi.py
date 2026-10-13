"""Buzul Devi - frost giant (~6 units): pale blue skin, white beard, fur kilt, ice armour shards, huge iced club."""
import math
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, export_glb, bake_report,
                     T, P, sym, biped_walk, mix)

ID = 'buzul_devi'
NAME_TR = 'Buzul Devi'
PREVIEW = [('Idle', 0), ('Walk', 11), ('Attack', 16), ('Attack', 23), ('Attack2', 22), ('Cast', 22), ('Enrage', 36),
           ('Death', 64)]


def textures():
    A = Atlas(128, 32)
    A.add('skin', 'skin', ramp('#1b222c', '#384454', '#5b6b7c', '#8796a4', '#bac7d0'), 2, 1, seed=31, veins=3, outline='tb')
    A.add('fur', 'fur', ramp('#140d08', '#33251a', '#56402d', '#7e6447', '#ad9272'), 2, 1, seed=32, outline='b')
    A.add('beard', 'fur', ramp('#2e4152', '#6f8ba2', '#a9c2d6', '#ddeef8', '#ffffff'), seed=33, outline='')
    A.add('ice', 'crystal', ramp('#0d3048', '#2a6f93', '#56aed0', '#9fe0f4', '#effcff'), seed=34, emit='#58c8ff', outline='')
    A.add('ice2', 'ice', ramp('#123a55', '#2f7aa0', '#64b8d8', '#b0ecfa', '#ffffff'), seed=35, outline='tb')
    A.add('wood', 'wood', ramp('#140d07', '#332314', '#523a22', '#755634', '#9a7a52'), seed=36, outline='tb')
    A.add('leather', 'metal', ramp('#0e0906', '#25190f', '#3f2b1a', '#5c4128', '#8a6a48'), seed=37, outline='tb', rivets=True)
    A.add('eye', 'glow', ramp('#1aa0ff', '#6fd8ff', '#c8f4ff', '#ffffff'), seed=38, emit='base', outline='')
    A.add('face', 'skin', ramp('#1f252e', '#404b59', '#657482', '#93a1ac', '#c6d0d6'), seed=39, outline='')
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0, 2.7), 'root'),
    ('spine', (0, 0, 3.3), 'hips'),
    ('chest', (0, 0, 4.0), 'spine'),
    ('neck', (0, -0.1, 4.75), 'chest'),
    ('head', (0, -0.15, 5.0), 'neck'),
    ('jaw', (0, -0.42, 5.08), 'head'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperarm_{sd}', (s * 1.1, 0, 4.55), 'chest'),
        (f'forearm_{sd}', (s * 1.4, -0.05, 3.5), f'upperarm_{sd}'),
        (f'hand_{sd}', (s * 1.55, -0.15, 2.55), f'forearm_{sd}'),
        (f'thigh_{sd}', (s * 0.5, 0, 2.55), 'hips'),
        (f'shin_{sd}', (s * 0.58, -0.05, 1.4), f'thigh_{sd}'),
        (f'foot_{sd}', (s * 0.62, 0.05, 0.32), f'shin_{sd}'),
    ]
BONES.append(('fx_club', (-1.76, -1.42, 0.62), 'hand_R'))


def geometry(B):
    for s, sd in ((1, 'L'), (-1, 'R')):
        B.box('fur', (0.6, 1.0, 0.34), T((s * 0.62, -0.2, 0.17)), top=(0.9, 0.8), bone=f'foot_{sd}')
        B.box('ice2', (0.5, 0.22, 0.18), T((s * 0.62, -0.72, 0.1)), top=(0.7, 0.6), bone=f'foot_{sd}')
        B.limb('skin', (s * 0.58, -0.05, 1.45), (s * 0.62, 0.05, 0.35), 0.27, 0.22, 6, bone=f'shin_{sd}')
        B.lathe_between('fur', (s * 0.62, 0.03, 0.22), (s * 0.59, -0.03, 1.08), [(0.42, 0), (0.36, 0.55), (0.4, 1.0)], 7,
                        cap0=False, cap1=False, zig=(2, 0.14), bone=f'shin_{sd}', closed=False)
        B.limb('skin', (s * 0.5, 0, 2.7), (s * 0.58, -0.05, 1.38), 0.38, 0.3, 6, bone=f'thigh_{sd}')
        B.octa('ice', 0.22, T((s * 0.6, -0.33, 1.42)), stretch=1.3, bone=f'shin_{sd}')
    B.lathe('fur', [(1.02, 1.72), (0.96, 2.3), (0.86, 2.98)], 10, sy=0.8, cap0=False, cap1=False, zig=(0, 0.32),
            bone='hips', closed=False)
    B.cyl('leather', 0.9, 0.9, 0.26, 10, T((0, 0, 2.84)), sy=0.8, bone='hips')
    B.box('ice', (0.38, 0.12, 0.32), T((0, -0.74, 2.97)), top=(0.7, 1), bone='hips')
    B.lathe('skin', [(0.86, 2.8), (1.03, 3.35), (1.18, 4.05), (1.02, 4.55), (0.5, 4.88)], 8, sy=0.72, cap0=False,
            ring_w=[{'hips': 1}, {'spine': 1}, {'chest': 1}, {'chest': 1}, {'chest': 1}])
    B.lathe('fur', [(1.32, 4.18), (1.06, 4.6), (0.56, 4.96)], 8, sy=0.8, cap0=False, cap1=False, zig=(0, -0.26),
            bone='chest', closed=False)
    # chest strap with an ice medallion
    B.box('leather', (0.28, 0.1, 1.9), T((0.1, -0.84, 3.6), (0, -38, 0)), bone='chest')
    B.octa('ice', 0.2, T((0.0, -0.95, 3.75)), stretch=1.2, bone='chest')
    for s, sd in ((1, 'L'), (-1, 'R')):
        ua = f'upperarm_{sd}'
        B.sphere('ice2', 0.5, 6, 3, T((s * 1.18, 0.0, 4.72)), scale=(1.1, 1.0, 0.62), bone=ua)
        for dx, dy, L, r in ((0.0, -0.12, 0.95, 0.15), (0.28, 0.2, 0.7, 0.13), (-0.2, 0.18, 0.62, 0.11), (0.3, -0.25, 0.55, 0.1)):
            a = (s * (1.18 + dx), dy, 4.9)
            d = (s * (0.35 + dx), dy * 0.8, 1.0)
            n = math.sqrt(sum(c * c for c in d))
            B.spike('ice', a, tuple(a[i] + d[i] / n * L for i in range(3)), r, 4, bone=ua)
        B.limb('skin', (s * 1.1, 0, 4.6), (s * 1.4, -0.05, 3.48), 0.34, 0.28, 6, bone=ua)
        B.limb('skin', (s * 1.4, -0.05, 3.52), (s * 1.55, -0.15, 2.6), 0.3, 0.26, 6, bone=f'forearm_{sd}')
        B.lathe_between('ice2', (s * 1.53, -0.14, 2.68), (s * 1.43, -0.06, 3.3), [(0.37, 0), (0.33, 0.55), (0.37, 1.0)], 6,
                        bone=f'forearm_{sd}')
        B.box('skin', (0.46, 0.42, 0.5), T((s * 1.58, -0.2, 2.34)), top=(0.9, 0.85), bone=f'hand_{sd}')
    # head
    B.sphere('face', 0.4, 6, 4, T((0, -0.2, 5.3)), scale=(0.95, 1.0, 1.1), bone='head')
    B.box('face', (0.15, 0.2, 0.24), T((0, -0.6, 5.26)), top=(0.6, 0.5), bone='head')
    for s in (1, -1):
        B.octa('eye', 0.06, T((s * 0.15, -0.56, 5.38)), stretch=0.7, bone='head')
        B.box('beard', (0.27, 0.13, 0.1), T((s * 0.15, -0.57, 5.48), (0, s * 14, 0)), bone='head')
        B.slab('beard', (s * 0.06, -0.62, 5.16), (s * 0.34, -0.55, 4.88), 0.14, 0.08, bone='jaw')
    B.slab('beard', (0, -0.46, 5.16), (0, -0.7, 4.0), 0.72, 0.32, top=(0.32, 0.6), bone='jaw')
    B.sphere('beard', 0.44, 6, 4, T((0, 0.02, 5.32)), scale=(1.0, 0.85, 1.12), bone='head')
    B.slab('beard', (0, 0.3, 5.3), (0, 0.55, 4.45), 0.4, 0.15, top=(0.4, 1), bone='head')
    for ang, h in ((0, 0.5), (50, 0.38), (-50, 0.38), (110, 0.3), (-110, 0.3)):
        a = math.radians(ang)
        dx, dy = math.sin(a), -math.cos(a)
        p0 = (dx * 0.3, -0.12 + dy * 0.3, 5.62)
        B.spike('ice', p0, (p0[0] + dx * 0.12, p0[1] + dy * 0.12, 5.62 + h), 0.09, 4, bone='head')
    # the club: gnarled log with ice shards, held in the right hand, head toward the ground in front
    grip = (-1.58, -0.2, 2.35)
    tip = (-1.8, -1.6, 0.32)
    pts, rad = [], []
    for t, r in ((-0.12, 0.13), (0.0, 0.12), (0.35, 0.16), (0.62, 0.3), (0.84, 0.42), (1.0, 0.3)):
        pts.append(tuple(grip[i] + (tip[i] - grip[i]) * t for i in range(3)))
        rad.append(r)
    B.tube('wood', pts, rad, 7, bone='hand_R', jitter=0.03, seed=5)
    for t, ox, oy, oz, L in ((0.8, 0.4, 0.1, 0.25, 0.6), (0.72, -0.35, 0.05, 0.3, 0.55), (0.92, 0.1, -0.35, 0.1, 0.5),
                             (0.86, -0.15, 0.3, 0.45, 0.65)):
        a = tuple(grip[i] + (tip[i] - grip[i]) * t for i in range(3))
        n = math.sqrt(ox * ox + oy * oy + oz * oz)
        B.spike('ice', a, (a[0] + ox / n * L, a[1] + oy / n * L, a[2] + oz / n * L), 0.11, 4, bone='hand_R')


def actions():
    BASE = P({'hips@loc': (0, 0, -0.06), 'chest': (4, 0, 0), 'head': (-4, 0, 0)},
             sym(thigh=(-10, -2, 0), shin=(18, 0, 0), foot=(-8, 0, 0), upperarm=(-6, -10, 0), forearm=(-14, 0, 0)),
             upperarm_R=(-4, 0, 0), forearm_R=(-6, 0, 0))
    idle = [(0, BASE),
            (32, P(BASE, sym(upperarm=(0, -3, 0)), chest=(-3, 0, 0), spine=(1, 0, 0), head=(-2, 0, 6),
                   hips__loc=(0, 0, -0.04), forearm_R=(-6, 0, 0))),
            (64, BASE)]
    walk = biped_walk(BASE, 44, stride=22, knee=40, arm=12, bob=0.1, sway=6, roll=3,
                      extra=lambda ph: {'chest': (0, 0, (-5, 0, 5, 0)[ph])})
    run = biped_walk(P(BASE, chest=(14, 0, 0), head=(-12, 0, 0)), 30, stride=32, knee=58, arm=24, bob=0.16, sway=8, roll=4)
    wind = P(BASE, upperarm_R=(-170, 6, 0), forearm_R=(-24, 0, 0), hand_R=(-20, 0, 0), upperarm_L=(-40, -24, 0),
             chest=(-14, 0, 16), spine=(-6, 0, 0), head=(-6, 0, -8), hips__loc=(0, 0.15, 0.06),
             thigh_R=(8, 0, 0), thigh_L=(-14, 0, 0))
    strike = P(BASE, upperarm_R=(-70, 6, 0), forearm_R=(-6, 0, 0), hand_R=(-10, 0, 0), upperarm_L=(-30, -30, 0),
               chest=(28, 0, -10), spine=(12, 0, 0), head=(-20, 0, 0), jaw=(12, 0, 0), hips__loc=(0, -0.3, -0.35),
               thigh_L=(-36, 0, 0), shin_L=(36, 0, 0), thigh_R=(22, 0, 0), shin_R=(46, 0, 0), foot_R=(-18, 0, 0))
    attack = [(0, BASE), (16, wind), (19, P(wind, chest=(6, 0, 0))), (23, strike), (31, P(strike, chest=(3, 0, 0))),
              (40, P(mix(strike, BASE, 0.62), hips__loc=(0, 0, 0.12))), (48, BASE)]
    sw0 = P(BASE, chest=(-6, 0, -48), spine=(0, 0, -14), upperarm_R=(-26, 80, 0), forearm_R=(-8, 0, 0),
            hand_R=(-60, 0, 0), upperarm_L=(-30, -16, 0), head=(0, 0, 20), hips__loc=(0, 0, -0.1))
    sw1 = P(BASE, chest=(12, 0, 56), spine=(2, 0, 16), upperarm_R=(-84, 12, 0), forearm_R=(-4, 0, 0),
            hand_R=(-60, 0, 0), upperarm_L=(10, -30, 0), head=(0, 0, -20), hips__loc=(0, -0.25, -0.12))
    attack2 = [(0, BASE), (15, sw0), (22, sw1), (29, P(sw1, chest=(0, 0, 8))), (46, BASE)]
    raise_ = P(BASE, sym(upperarm=(-14, -142, 0), forearm=(-18, 0, 0)), hand_R=(-40, 0, 0), chest=(-18, 0, 0),
               head=(-24, 0, 0), jaw=(24, 0, 0), hips__loc=(0, 0, 0.06))
    lift = P(raise_, thigh_L=(-70, 0, 0), shin_L=(74, 0, 0), foot_L=(10, 0, 0), hips__loc=(0, 0, 0.1), chest=(-6, 0, 0))
    stomp = P(BASE, sym(upperarm=(-30, -50, 0), forearm=(-10, 0, 0)), hand_R=(-30, 0, 0), thigh_L=(-30, 0, 0),
              shin_L=(26, 0, 0), thigh_R=(-16, 0, 0), shin_R=(30, 0, 0), foot_R=(-14, 0, 0), chest=(22, 0, 0),
              head=(-18, 0, 0), jaw=(30, 0, 0), hips__loc=(0, -0.1, -0.3))
    cast = [(0, BASE), (20, raise_), (30, P(raise_, chest=(0, 0, 3))), (40, P(raise_, chest=(0, 0, -3))), (46, lift),
            (52, stomp), (60, P(stomp, chest=(3, 0, 0))), (72, BASE)]
    beat = P(BASE, upperarm_L=(-60, 38, 0), forearm_L=(-96, 0, 0), chest=(-6, 0, -8), head=(-10, 0, 0))
    beat2 = P(BASE, upperarm_L=(-36, 10, 0), forearm_L=(-70, 0, 0), chest=(2, 0, -4))
    roar = P(BASE, sym(upperarm=(-10, -66, 0), forearm=(-26, 0, 0)), hand_R=(-40, 0, 0), chest=(-22, 0, 0),
             spine=(-6, 0, 0), head=(-26, 0, 0), jaw=(40, 0, 0), hips__loc=(0, 0.05, 0))
    enrage = [(0, BASE), (8, beat), (13, beat2), (18, beat), (23, beat2), (28, beat), (38, roar),
              (44, P(roar, chest=(0, 0, 4))), (50, P(roar, chest=(0, 0, -4))), (56, roar), (68, BASE)]
    hit = [(0, BASE), (5, P(BASE, chest=(-16, 0, 8), head=(-16, 0, 0), hips__loc=(0, 0.25, 0),
                            upperarm_L=(-10, -20, 0))), (18, BASE)]
    stag = P(BASE, sym(upperarm=(-30, -40, 0)), chest=(-20, 0, 0), head=(-24, 0, 0), jaw=(28, 0, 0),
             hips__loc=(0, 0.3, 0))
    fall = P(BASE, sym(upperarm=(-60, -50, 0), thigh=(-30, 0, 0), shin=(30, 0, 0)), root=(-40, 0, 0),
             root__loc=(0, 0.3, 0.1), chest=(-10, 0, 0), head=(-10, 0, 0), jaw=(20, 0, 0))
    down = P(BASE, sym(upperarm=(-150, -40, 0), forearm=(-10, 0, 0), thigh=(-24, -6, 0), shin=(20, 0, 0)),
             root=(-86, 0, 0), root__loc=(0, 0.2, 0.72), head=(4, 0, 30), jaw=(18, 0, 0), hand_R=(40, 0, 0))
    death = [(0, BASE), (14, stag), (30, fall), (44, P(down, root=(-6, 0, 0), root__loc=(0, 0, -0.06))),
             (52, P(down, root=(3, 0, 0), root__loc=(0, 0, 0.05))), (64, down)]
    return [('Idle', idle), ('Walk', walk), ('Run', run), ('Attack', attack), ('Attack2', attack2), ('Cast', cast),
            ('Enrage', enrage), ('Hit', hit), ('Death', death)]


def build(out_dir):
    A = textures()
    base_img, emit_img = A.images(ID)
    mat = make_material(ID, base_img, emit_img, emit_strength=1.4)
    arm = build_armature('Rig', BONES)
    B = Builder(A)
    geometry(B)
    ob, bad = B.build(ID, mat, arm)
    add_actions(arm, actions())
    path = f'{out_dir}/{ID}.glb'
    export_glb(path)
    return bake_report(ID, B, arm, path, dict(emissive=sorted(A.emissive), name=NAME_TR, invalid=bool(bad)))
