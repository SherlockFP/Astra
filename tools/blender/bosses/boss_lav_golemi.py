"""Lav Golemi - hulking magma golem (~6 units), basalt chunks with glowing lava cracks and a molten core."""
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, export_glb, bake_report,
                     T, P, sym, biped_walk)

ID = 'lav_golemi'
NAME_TR = 'Lav Golemi'
PREVIEW = [('Idle', 0), ('Walk', 11), ('Attack', 16), ('Attack', 23), ('Attack2', 21), ('Cast', 22), ('Enrage', 36),
           ('Death', 70)]

ROCK = ramp('#0a0605', '#1d1310', '#33241e', '#4c382d', '#6b5141')


def textures():
    A = Atlas(128, 32)
    A.add('rockbig', 'lava', ROCK, 2, 2, seed=21, emit='#ff6a10', cells=11, crack=0.9, glow=0.6, outline='')
    A.add('rock', 'lava', ROCK, seed=22, emit='#ff6a10', cells=6, crack=0.85, glow=0.5, outline='tb')
    A.add('rock2', 'lava', ramp('#080505', '#191110', '#2c201b', '#433128', '#5f493b'), seed=23, emit='#ff8a1a',
          cells=5, crack=0.95, glow=0.45, outline='tb')
    A.add('obsidian', 'crystal', ramp('#040306', '#0f0a16', '#1f1630', '#3a2c55', '#8270b0'), seed=24, outline='')
    A.add('core', 'glow', ramp('#ff4a00', '#ff9a10', '#ffd860', '#fff8d0'), seed=25, emit='base', outline='')
    A.add('eye', 'glow', ramp('#ff7a00', '#ffc040', '#fff2a0', '#ffffff'), seed=26, emit='base', outline='')
    A.add('magma', 'lava', ramp('#2a0a02', '#5a1a04', '#8a2c06', '#b04a10'), seed=27, emit='#ffb030', cells=5,
          crack=3.0, outline='')
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0, 2.0), 'root'),
    ('spine', (0, 0, 2.6), 'hips'),
    ('chest', (0, 0, 3.3), 'spine'),
    ('head', (0, -0.6, 4.55), 'chest'),
    ('jaw', (0, -0.85, 4.45), 'head'),
    ('fx_core', (0, -1.15, 3.65), 'chest'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperarm_{sd}', (s * 1.5, 0, 4.55), 'chest'),
        (f'forearm_{sd}', (s * 1.95, -0.25, 3.2), f'upperarm_{sd}'),
        (f'hand_{sd}', (s * 2.05, -0.55, 1.85), f'forearm_{sd}'),
        (f'thigh_{sd}', (s * 0.65, 0, 1.85), 'hips'),
        (f'shin_{sd}', (s * 0.75, -0.15, 1.0), f'thigh_{sd}'),
        (f'foot_{sd}', (s * 0.8, 0, 0.32), f'shin_{sd}'),
    ]


def geometry(B):
    B.box('rock', (1.6, 1.15, 0.8), T((0, 0.05, 2.0)), jitter=0.07, seed=1, bone='hips')
    B.box('rock2', (1.75, 1.3, 0.85), T((0, 0.0, 2.62)), top=(1.15, 1.1), jitter=0.07, seed=2, bone='spine')
    B.sphere('rockbig', 1.0, 8, 5, T((0, 0.1, 3.8)), scale=(1.55, 1.1, 1.0), jitter=0.09, seed=3, bone='chest')
    B.sphere('rock', 0.7, 6, 4, T((0, 0.65, 4.35)), scale=(1.4, 0.9, 0.9), jitter=0.08, seed=4, bone='chest')
    # molten core in the chest, framed by obsidian shards
    B.sphere('magma', 0.48, 6, 4, T((0, -0.82, 3.65)), scale=(1, 0.6, 1.1), bone='chest')
    B.octa('core', 0.34, T((0, -1.08, 3.65)), stretch=1.25, bone='fx_core')
    for dx, L in ((-0.18, 0.42), (0.05, 0.6), (0.24, 0.34)):       # molten drips under the core
        B.spike('core', (dx, -1.0, 3.36), (dx * 1.15, -1.06, 3.36 - L), 0.07, 4, bone='chest')
    for dx, dz in ((0.42, 0.25), (-0.42, 0.25), (0.36, -0.32), (-0.36, -0.32)):
        B.spike('obsidian', (dx * 0.8, -0.95, 3.65 + dz * 0.8), (dx * 1.6, -1.3, 3.65 + dz * 1.7), 0.09, 4, bone='chest')
    # back spikes
    for x, h, lean in ((-0.75, 0.85, 0.3), (-0.38, 1.15, 0.35), (0.0, 1.35, 0.4), (0.38, 1.1, 0.35), (0.75, 0.8, 0.3)):
        a = (x, 0.62, 4.62 + (0.3 - abs(x) * 0.3))
        B.spike('obsidian', a, (x * 1.25, a[1] + lean, a[2] + h), 0.16, 4, bone='chest')
    # head
    B.box('rock', (0.86, 0.86, 0.66), T((0, -0.94, 4.74)), top=(0.85, 0.8), jitter=0.05, seed=5, bone='head')
    B.box('rock2', (1.0, 0.28, 0.2), T((0, -1.32, 4.97), (16, 0, 0)), top=(0.8, 1), bone='head')
    for s in (1, -1):
        B.octa('eye', 0.1, T((s * 0.22, -1.39, 4.83)), stretch=0.6, bone='head')
        B.spike('obsidian', (s * 0.36, -1.1, 5.0), (s * 0.62, -0.95, 5.42), 0.1, 4, bone='head')
    B.box('rock', (0.78, 0.72, 0.3), T((0, -1.06, 4.36)), bottom=(0.8, 0.8), jitter=0.03, seed=6, bone='jaw')
    B.box('core', (0.52, 0.08, 0.08), T((0, -1.43, 4.5)), bone='jaw')
    for s, sd in ((1, 'L'), (-1, 'R')):
        ua = f'upperarm_{sd}'
        B.sphere('rock', 0.72, 6, 4, T((s * 1.55, 0.05, 4.68)), scale=(1.05, 1.0, 0.9), jitter=0.1, seed=7 + s, bone=ua)
        for dx, dy, L in ((0.0, -0.15, 0.95), (0.3, 0.25, 0.7)):
            a = (s * (1.55 + dx), dy, 5.1)
            B.spike('obsidian', a, (s * (1.75 + dx * 1.6), dy * 1.5, 5.1 + L), 0.15, 4, bone=ua)
        B.slab('rock2', (s * 1.55, 0, 4.4), (s * 1.95, -0.25, 3.15), 0.7, 0.7, top=(0.85, 0.85), jitter=0.06,
               seed=9 + s, bone=ua)
        B.slab('rock', (s * 1.95, -0.25, 3.3), (s * 2.05, -0.55, 1.92), 0.85, 0.85, top=(1.3, 1.3), jitter=0.07,
               seed=11 + s, bone=f'forearm_{sd}')
        B.box('rock', (1.05, 1.05, 1.0), T((s * 2.08, -0.6, 1.35)), jitter=0.08, seed=13 + s, bone=f'hand_{sd}')
        for dx in (-0.3, 0.0, 0.3):
            a = (s * 2.08 + dx, -1.08, 1.5)
            B.spike('obsidian', a, (s * 2.08 + dx * 1.1, -1.42, 1.62), 0.1, 4, bone=f'hand_{sd}')
        B.slab('rock2', (s * 0.65, 0, 1.95), (s * 0.75, -0.15, 0.98), 0.78, 0.82, jitter=0.05, seed=15 + s,
               bone=f'thigh_{sd}')
        B.slab('rock', (s * 0.75, -0.15, 1.05), (s * 0.8, 0, 0.36), 0.7, 0.75, top=(1.25, 1.2), jitter=0.05,
               seed=17 + s, bone=f'shin_{sd}')
        B.box('rock2', (0.95, 1.3, 0.42), T((s * 0.82, -0.2, 0.21)), top=(0.9, 0.85), jitter=0.04, seed=19 + s,
              bone=f'foot_{sd}')


def actions():
    BASE = P({'hips@loc': (0, 0, -0.08), 'chest': (10, 0, 0), 'head': (-10, 0, 0)},
             sym(thigh=(-15, 0, 0), shin=(28, 0, 0), foot=(-13, 0, 0), upperarm=(-8, -6, 0), forearm=(-12, 0, 0),
                 hand=(8, 0, 0)))
    idle = [(0, BASE),
            (36, P(BASE, sym(upperarm=(0, -3, 0), forearm=(-4, 0, 0)), chest=(3, 0, 0), spine=(2, 0, 0), head=(-3, 0, 4),
                   hips__loc=(0, 0, -0.05))),
            (72, BASE)]
    walk = biped_walk(BASE, 44, stride=20, knee=34, arm=14, bob=0.1, sway=6, roll=4,
                      extra=lambda ph: {'chest': (0, 0, (-4, 0, 4, 0)[ph]), 'head': (0, 0, (3, 0, -3, 0)[ph])})
    RB = P(BASE, chest=(14, 0, 0), spine=(6, 0, 0), head=(-12, 0, 0))
    run = biped_walk(RB, 30, stride=30, knee=52, arm=26, bob=0.16, sway=8, roll=5)
    up = P(BASE, sym(upperarm=(-165, -14, 0), forearm=(-30, 0, 0), thigh=(9, 0, 0), shin=(-18, 0, 0)),
           chest=(-26, 0, 0), spine=(-6, 0, 0), head=(-4, 0, 0), hips__loc=(0, 0.15, 0.18))
    smash = P(BASE, sym(upperarm=(-62, -10, 0), forearm=(-8, 0, 0), hand=(14, 0, 0), thigh=(-28, 0, 0), shin=(40, 0, 0),
                        foot=(-12, 0, 0)),
              chest=(30, 0, 0), spine=(14, 0, 0), head=(-26, 0, 0), jaw=(16, 0, 0), hips__loc=(0, -0.3, -0.42))
    attack = [(0, BASE), (16, up), (19, P(up, chest=(4, 0, 0))), (23, smash), (31, P(smash, chest=(3, 0, 0))), (48, BASE)]
    wind = P(BASE, chest=(-4, 0, -40), spine=(0, 0, -12), upperarm_R=(-12, 72, 0), forearm_R=(-14, 0, 0),
             upperarm_L=(-30, -10, 0), head=(0, 0, 18), hips__loc=(0, 0, -0.12))
    sweep = P(BASE, chest=(12, 0, 50), spine=(2, 0, 15), upperarm_R=(-80, 12, 0), forearm_R=(-4, 0, 0),
              upperarm_L=(14, -22, 0), head=(0, 0, -18), hips__loc=(0, -0.2, -0.12))
    attack2 = [(0, BASE), (14, wind), (21, sweep), (28, P(sweep, chest=(0, 0, 10))), (44, BASE)]
    raise_ = P(BASE, sym(upperarm=(-16, -146, 0), forearm=(-22, 0, 0)), chest=(-26, 0, 0), head=(-26, 0, 0),
               jaw=(28, 0, 0), hips__loc=(0, 0, 0.12))
    slam = P(BASE, sym(upperarm=(-50, -18, 0), forearm=(-10, 0, 0), thigh=(-30, 0, 0), shin=(44, 0, 0), foot=(-14, 0, 0)),
             chest=(34, 0, 0), spine=(10, 0, 0), head=(-24, 0, 0), jaw=(20, 0, 0), hips__loc=(0, -0.2, -0.45))
    cast = [(0, BASE), (20, raise_), (28, P(raise_, chest=(0, 0, 3))), (36, P(raise_, chest=(0, 0, -3))),
            (44, P(raise_, chest=(-2, 0, 0), hips__loc=(0, 0, 0.05))), (50, slam), (58, P(slam, chest=(2, 0, 0))), (68, BASE)]
    beatL = P(BASE, upperarm_L=(-62, 34, 0), forearm_L=(-92, 0, 0), upperarm_R=(-30, 30, 0), chest=(-8, 0, -6),
              head=(-14, 0, 0), jaw=(14, 0, 0))
    beatR = P(BASE, upperarm_R=(-62, -34, 0), forearm_R=(-92, 0, 0), upperarm_L=(-30, -30, 0), chest=(-8, 0, 6),
              head=(-14, 0, 0), jaw=(14, 0, 0))
    roar = P(BASE, sym(upperarm=(-8, -58, 0), forearm=(-24, 0, 0)), chest=(-24, 0, 0), spine=(-6, 0, 0), head=(-26, 0, 0),
             jaw=(42, 0, 0), hips__loc=(0, 0, 0.05))
    enrage = [(0, BASE), (8, beatL), (14, beatR), (20, beatL), (26, beatR), (36, roar), (42, P(roar, chest=(0, 0, 4))),
              (48, P(roar, chest=(0, 0, -4))), (54, roar), (66, BASE)]
    hit = [(0, BASE), (5, P(BASE, chest=(-16, 0, 10), head=(-14, 0, 0), hips__loc=(0, 0.25, 0.02),
                            upperarm_L=(-10, -14, 0), upperarm_R=(-6, 20, 0))), (18, BASE)]
    stag = P(BASE, sym(upperarm=(-30, -40, 0)), chest=(-24, 0, 0), head=(-22, 0, 0), jaw=(30, 0, 0), hips__loc=(0, 0.3, 0))
    kneel = P(BASE, sym(thigh=(-62, 0, 0), shin=(98, 0, 0), foot=(-30, 0, 0), upperarm=(-6, -8, 0)),
              chest=(18, 0, 0), head=(4, 0, 0), jaw=(24, 0, 0), hips__loc=(0, 0.25, -0.78))
    topple = P(kneel, root=(42, 0, 0), root__loc=(0, 0, 0.3), chest=(10, 0, 0))
    down = P(kneel, root=(80, 0, 0), root__loc=(0, 0.3, 1.1), chest=(-6, 0, 0), head=(-46, 0, 26), jaw=(-10, 0, 0),
             upperarm_L=(14, -30, 0), upperarm_R=(14, 26, 0))
    death = [(0, BASE), (14, stag), (30, kneel), (44, topple), (56, P(down, root=(6, 0, 0), root__loc=(0, 0, -0.06))),
             (63, P(down, root=(-2, 0, 0), root__loc=(0, 0, 0.04))), (70, down)]
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
