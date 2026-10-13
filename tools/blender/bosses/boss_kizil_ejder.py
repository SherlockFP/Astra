"""Kizil Ejder - small red dragon (~5.1 tall, ~9.2 long): four legs, bat wings, horns, spade tail,
glowing eyes and a molten throat for the fire-breath Cast. Extra action: Fly (hover loop)."""
import math
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, export_glb, bake_report,
                     T, P, sym)

ID = 'kizil_ejder'
NAME_TR = 'Kızıl Ejder'
PREVIEW = [('Idle', 0), ('Walk', 10), ('Fly', 0), ('Attack', 12), ('Attack', 20), ('Attack2', 22), ('Cast', 30),
           ('Enrage', 22), ('Death', 64)]

RED = ramp('#160403', '#420b07', '#741a0e', '#a82d15', '#de5a25')
GOLD = ramp('#2e1405', '#6e3a0e', '#ae6a1c', '#e2a63c', '#fde59a')


def textures():
    A = Atlas(128, 32)
    A.add('body', 'scales', RED, 2, 2, seed=51, rows=7, edge=0.24, dither=0.6, belly_ramp=GOLD, plates=8, outline='')
    A.add('limb', 'scales', RED, seed=52, rows=4, edge=0.24, dither=0.6, outline='tb')
    A.add('membrane', 'membrane', ramp('#1a0405', '#3e0a0b', '#6a1612', '#93281a', '#c04a26'), 2, 1, seed=53, veins=5,
          outline='')
    A.add('horn', 'horn', ramp('#1a120a', '#4a3a26', '#857055', '#c2ad88', '#f0e4c8'), seed=54, rings=5, outline='')
    A.add('teeth', 'teeth', ramp('#3a3020', '#b0a080', '#f4ecd6'), seed=55, outline='')
    A.add('mouth', 'flesh', ramp('#2a0602', '#6a1404', '#c03a08', '#ff8a1a', '#ffd25a'), seed=56, emit='#ff7a10',
          outline='')
    A.add('eye', 'glow', ramp('#ff8a00', '#ffc830', '#fff4a0', '#ffffff'), seed=57, emit='base', outline='')
    A.add('head', 'scales', RED, seed=58, rows=4, edge=0.28, dither=0.6, outline='tb')
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0.9, 2.1), 'root'),
    ('chest', (0, -0.6, 2.35), 'hips'),
    ('neck1', (0, -1.15, 2.65), 'chest'),
    ('neck2', (0, -1.6, 3.15), 'neck1'),
    ('neck3', (0, -2.0, 3.65), 'neck2'),
    ('head', (0, -2.35, 4.1), 'neck3'),
    ('jaw', (0, -2.6, 4.0), 'head'),
    ('fx_mouth', (0, -4.0, 4.08), 'head'),
    ('tail1', (0, 1.5, 2.08), 'hips'),
    ('tail2', (0, 2.25, 1.88), 'tail1'),
    ('tail3', (0, 3.0, 1.5), 'tail2'),
    ('tail4', (0, 3.75, 1.05), 'tail3'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperleg_F_{sd}', (s * 0.62, -0.75, 2.12), 'chest'),
        (f'lowerleg_F_{sd}', (s * 0.82, -0.9, 1.16), f'upperleg_F_{sd}'),
        (f'foot_F_{sd}', (s * 0.84, -0.98, 0.3), f'lowerleg_F_{sd}'),
        (f'upperleg_B_{sd}', (s * 0.7, 1.0, 1.95), 'hips'),
        (f'lowerleg_B_{sd}', (s * 0.86, 0.8, 1.2), f'upperleg_B_{sd}'),
        (f'foot_B_{sd}', (s * 0.88, 1.25, 0.42), f'lowerleg_B_{sd}'),
        (f'wing1_{sd}', (s * 0.5, -0.45, 3.0), 'chest'),
        (f'wing2_{sd}', (s * 2.0, -0.15, 3.95), f'wing1_{sd}'),
        (f'wing3_{sd}', (s * 3.25, 0.25, 3.65), f'wing2_{sd}'),
    ]

UP = (0, 0, 1)


def geometry(B):
    B.tube('body', [(0, -1.3, 2.5), (0, -0.7, 2.56), (0, 0.1, 2.46), (0, 0.9, 2.26), (0, 1.5, 2.1)],
           [0.62, 0.86, 0.92, 0.78, 0.56], 8, sx=0.95, ref=UP,
           ring_w=[{'chest': 1}, {'chest': 1}, {'chest': 0.5, 'hips': 0.5}, {'hips': 1}, {'hips': 1}])
    B.tube('body', [(0, -1.1, 2.62), (0, -1.6, 3.12), (0, -2.0, 3.62), (0, -2.3, 4.02), (0, -2.45, 4.22)],
           [0.56, 0.46, 0.38, 0.33, 0.3], 8, ref=UP,
           ring_w=[{'chest': 1}, {'neck1': 1}, {'neck2': 1}, {'neck3': 1}, {'head': 1}])
    B.tube('body', [(0, 1.4, 2.15), (0, 2.2, 1.9), (0, 3.0, 1.5), (0, 3.75, 1.05), (0, 4.4, 0.72), (0, 4.78, 0.62)],
           [0.55, 0.45, 0.34, 0.23, 0.13, 0.0], 7, ref=UP,
           ring_w=[{'hips': 1}, {'tail1': 1}, {'tail2': 1}, {'tail3': 1}, {'tail4': 1}, {'tail4': 1}])
    B.poly('membrane', [(0, 4.42, 0.73), (0.44, 4.8, 0.66), (0, 5.26, 0.56), (-0.44, 4.8, 0.66)],
           weights=[{'tail4': 1}] * 4, axes=(0, 1))
    # head
    B.box('head', (0.8, 0.78, 0.62), T((0, -2.56, 4.36)), top=(0.85, 0.8), bone='head')
    B.slab('head', (0, -2.85, 4.36), (0, -4.0, 4.24), 0.64, 0.46, top=(0.6, 0.66), bone='head')
    B.slab('head', (0, -2.7, 4.0), (0, -3.92, 3.97), 0.58, 0.2, top=(0.6, 0.8), bone='jaw')
    B.slab('mouth', (0, -2.78, 4.1), (0, -3.78, 4.08), 0.46, 0.04, top=(0.7, 1), bone='jaw')
    for s in (1, -1):
        for y in (-3.05, -3.4, -3.72):
            B.spike('teeth', (s * 0.21, y, 4.12), (s * 0.2, y - 0.02, 3.96), 0.035, 3, bone='head')
        for y in (-3.2, -3.58):
            B.spike('teeth', (s * 0.19, y, 4.05), (s * 0.18, y - 0.02, 4.2), 0.03, 3, bone='jaw')
        B.octa('eye', 0.075, T((s * 0.3, -2.96, 4.49)), stretch=0.7, bone='head')
        B.slab('horn', (s * 0.18, -2.8, 4.6), (s * 0.36, -3.2, 4.56), 0.16, 0.08, bone='head')
        B.tube('horn', [(s * 0.24, -2.45, 4.6), (s * 0.4, -2.05, 4.95), (s * 0.52, -1.55, 5.1)], [0.13, 0.08, 0.0], 5,
               bone='head')
        B.spike('horn', (s * 0.38, -2.5, 4.25), (s * 0.78, -2.12, 4.32), 0.08, 4, bone='head')
        B.spike('horn', (s * 0.36, -2.75, 4.12), (s * 0.66, -2.5, 3.98), 0.06, 3, bone='jaw')
    B.spike('horn', (0, -3.65, 4.44), (0, -3.82, 4.66), 0.06, 4, bone='head')
    # back spikes
    for y, z, sz, bn in ((-1.55, 3.48, 0.24, 'neck1'), (-1.95, 3.92, 0.2, 'neck2'), (-0.7, 3.38, 0.4, 'chest'),
                         (0.1, 3.34, 0.44, 'chest'), (0.9, 3.0, 0.38, 'hips'), (2.2, 2.32, 0.3, 'tail1'),
                         (3.0, 1.82, 0.24, 'tail2'), (3.75, 1.26, 0.17, 'tail3')):
        B.spike('horn', (0, y - 0.05, z - 0.06), (0, y + 0.28 * sz, z + sz), sz * 0.38, 4, bone=bn)
    # legs
    for s, sd in ((1, 'L'), (-1, 'R')):
        B.sphere('limb', 0.42, 6, 4, T((s * 0.64, -0.72, 2.12)), scale=(0.8, 1.0, 1.1), bone=f'upperleg_F_{sd}')
        B.limb('limb', (s * 0.62, -0.75, 2.12), (s * 0.82, -0.9, 1.14), 0.36, 0.27, 6, bone=f'upperleg_F_{sd}')
        B.limb('limb', (s * 0.82, -0.9, 1.18), (s * 0.84, -0.98, 0.28), 0.26, 0.19, 6, bone=f'lowerleg_F_{sd}')
        B.box('limb', (0.5, 0.7, 0.24), T((s * 0.84, -1.14, 0.12)), top=(0.8, 0.8), bone=f'foot_F_{sd}')
        for dx in (-0.13, 0.0, 0.13):
            B.spike('horn', (s * 0.84 + dx, -1.4, 0.12), (s * 0.84 + dx * 1.2, -1.64, 0.02), 0.05, 3, bone=f'foot_F_{sd}')
        B.sphere('body', 0.56, 6, 4, T((s * 0.74, 0.96, 1.78)), scale=(0.72, 1.1, 1.2), bone=f'upperleg_B_{sd}')
        B.limb('limb', (s * 0.7, 1.0, 1.95), (s * 0.86, 0.8, 1.18), 0.38, 0.3, 6, bone=f'upperleg_B_{sd}')
        B.limb('limb', (s * 0.86, 0.8, 1.22), (s * 0.88, 1.25, 0.4), 0.27, 0.2, 6, bone=f'lowerleg_B_{sd}')
        B.box('limb', (0.52, 0.8, 0.24), T((s * 0.88, 1.04, 0.12)), top=(0.8, 0.8), bone=f'foot_B_{sd}')
        for dx in (-0.14, 0.0, 0.14):
            B.spike('horn', (s * 0.88 + dx, 0.7, 0.12), (s * 0.88 + dx * 1.2, 0.46, 0.02), 0.05, 3, bone=f'foot_B_{sd}')
        # wing: spars + scalloped membrane
        S, E, W = (s * 0.5, -0.45, 3.0), (s * 2.0, -0.15, 3.95), (s * 3.25, 0.25, 3.65)
        F1, F2, F3 = (s * 4.6, 0.65, 3.3), (s * 4.15, 1.55, 2.55), (s * 3.05, 2.05, 2.3)
        A1, A2 = (s * 0.55, 0.45, 2.98), (s * 0.45, 1.45, 2.42)
        w1, w2, w3 = f'wing1_{sd}', f'wing2_{sd}', f'wing3_{sd}'
        B.limb('horn', S, E, 0.12, 0.08, 5, bone=w1)
        B.limb('horn', E, W, 0.08, 0.06, 5, bone=w2)
        for F in (F1, F2, F3):
            B.spike('horn', W, F, 0.06, 4, bone=w3)
        B.spike('horn', W, (s * 3.38, 0.02, 3.98), 0.06, 3, bone=w3)

        def lerp(a, b, t, pull=0.0):
            return tuple(a[i] + (b[i] - a[i]) * t + (W[i] - (a[i] + b[i]) / 2) * pull for i in range(3))
        M1, M2 = lerp(F1, F2, 0.5, 0.25), lerp(F2, F3, 0.5, 0.25)
        M3 = tuple((F3[i] + A2[i]) / 2 + (E[i] - (F3[i] + A2[i]) / 2) * 0.22 for i in range(3))
        V = [S, E, W, F1, F2, F3, A1, A2, M1, M2, M3]
        Wt = [{'chest': 1}, {w2: 1}, {w3: 1}, {w3: 1}, {w3: 1}, {w3: 1}, {'chest': 1}, {'hips': 1}, {w3: 1}, {w3: 1},
              {w2: 0.5, 'hips': 0.5}]
        faces = [(2, 3, 8), (2, 8, 4), (2, 4, 9), (2, 9, 5), (1, 2, 5), (1, 5, 10), (1, 10, 7), (1, 7, 6), (0, 1, 6)]
        xs = [abs(v[0]) for v in V]
        ys = [v[1] for v in V]
        uv = [((abs(v[0]) - min(xs)) / (max(xs) - min(xs)), 1 - (v[1] - min(ys)) / (max(ys) - min(ys))) for v in V]
        B.add(V, faces, [[uv[i] for i in f] for f in faces], 'membrane', None, weights=Wt, closed=False)


FOLD = P({}, sym(wing1=(0, -18, 58), wing2=(0, 30, -112), wing3=(0, -8, 96)))
SPREAD = P({}, sym(wing1=(0, -24, -6), wing2=(0, 4, 6), wing3=(0, 2, 4)))


def body(**kw):
    return P({}, **kw)


def actions():
    STAND = P({'neck1': (-4, 0, 0), 'head': (4, 0, 0)}, sym(upperleg_F=(-2, 0, 0), upperleg_B=(4, 0, 0)))
    BASE = P(STAND, FOLD)
    tw = lambda a, ph: {f'tail{i}': (0, 0, a * math.sin(ph - i * 0.7)) for i in range(1, 5)}
    idle = []
    for i, f in enumerate((0, 15, 30, 45, 60)):
        ph = i * math.pi / 2
        idle.append((f, P(BASE, tw(7, ph), {'chest': (2 * math.sin(ph), 0, 0), 'neck1': (3 * math.sin(ph), 0, 4 * math.sin(ph * 0.5)),
                                           'head': (-3 * math.sin(ph), 0, 6 * math.sin(ph * 0.5)),
                                           'hips@loc': (0, 0, 0.03 * math.sin(ph))},
                          sym(wing1=(0, -3 * math.sin(ph), 0)))))

    def quad(n, stride, lift, bob, lean=0.0, extra=None):
        keys = []
        for i in range(5):
            ph = i * math.pi / 2
            f = round(n * i / 4)
            sA = math.cos(ph)              # FL & BR phase
            liftA = max(0.0, math.sin(ph))  # swing lift of the pair moving forward
            liftB = max(0.0, -math.sin(ph))
            d = {
                'upperleg_F_L': (-stride * sA, 0, 0), 'lowerleg_F_L': (lift * liftB, 0, 0),
                'upperleg_B_R': (-stride * sA, 0, 0), 'lowerleg_B_R': (lift * 0.6 * liftB, 0, 0),
                'upperleg_F_R': (stride * sA, 0, 0), 'lowerleg_F_R': (lift * liftA, 0, 0),
                'upperleg_B_L': (stride * sA, 0, 0), 'lowerleg_B_L': (lift * 0.6 * liftA, 0, 0),
                'foot_F_L': (stride * 1.0 * sA - lift * liftB, 0, 0), 'foot_F_R': (-stride * 1.0 * sA - lift * liftA, 0, 0),
                'foot_B_R': (-lift * 0.6 * liftB, 0, 0), 'foot_B_L': (-lift * 0.6 * liftA, 0, 0),
                'hips@loc': (0, 0, -bob * abs(math.cos(ph))), 'hips': (lean, 0, 4 * math.sin(ph)),
                'chest': (0, 0, -5 * math.sin(ph)), 'neck1': (2 * math.cos(2 * ph), 0, 4 * math.sin(ph)),
                'head': (0, 0, -4 * math.sin(ph)),
            }
            d.update({k: v for k, v in tw(9, ph).items()})
            if extra:
                d = P(d, extra(ph))
            keys.append((f, P(BASE, d)))
        return keys
    walk = quad(40, 22, 30, 0.0)
    run = quad(24, 34, 46, -0.06, lean=4, extra=lambda ph: {'neck1': (8, 0, 0), 'head': (-6, 0, 0)})
    FLYB = P(STAND, sym(upperleg_F=(42, 0, 0), lowerleg_F=(-60, 0, 0), upperleg_B=(52, 0, 0), lowerleg_B=(30, 0, 0),
                        foot_B=(30, 0, 0)), {f'tail{i}': (-4, 0, 0) for i in range(1, 5)}, hips=(-6, 0, 0))
    fly = []
    for i, f in enumerate((0, 10, 20, 30, 40)):
        up_ = (1, 0, -1, 0, 1)[i]
        fly.append((f, P(FLYB, sym(wing1=(0, -24 - 32 * up_, -6 + 8 * up_), wing2=(0, 4 + 16 * (up_ < 0) - 10 * up_, 6),
                                   wing3=(0, 2 - 14 * up_, 4)),
                         tw(5, i * math.pi / 2), {'root@loc': (0, 0, 1.5 - 0.22 * up_), 'neck1': (-3 * up_, 0, 0)})))
    rear = P(BASE, sym(upperleg_B=(20, 0, 0), lowerleg_B=(4, 0, 0)), hips=(-22, 0, 0), chest=(-8, 0, 0),
             neck1=(-6, 0, 0), head=(16, 0, 0), upperleg_F_R=(-74, 0, 0), lowerleg_F_R=(52, 0, 0),
             upperleg_F_L=(-26, 0, 0), lowerleg_F_L=(20, 0, 0), jaw=(10, 0, 0), wing1_L=(0, -10, 0), wing1_R=(0, 10, 0),
             tail1=(18, 0, 0), tail2=(8, 0, 0), tail3=(4, 0, 0))
    slam = P(BASE, sym(upperleg_B=(-2, 0, 0)), hips=(2, 0, 0), chest=(3, 0, 0), neck1=(26, 0, 0), neck2=(12, 0, 0),
             head=(6, 0, 0), jaw=(32, 0, 0), upperleg_F_R=(-28, 0, 0), lowerleg_F_R=(10, 0, 0), hips__loc=(0, -0.2, 0.0))
    attack = [(0, BASE), (12, rear), (16, P(rear, hips=(-3, 0, 0))), (20, slam), (24, P(slam, jaw=(-30, 0, 0))),
              (40, BASE)]
    tz = lambda a: {f'tail{i}': (0, 0, a) for i in range(1, 5)}
    wind = P(BASE, tz(22), hips=(0, 0, -16), chest=(0, 0, 8), neck1=(0, 0, 14), head=(0, 0, 10))
    whip = P(BASE, tz(-34), hips=(0, 0, 18), chest=(0, 0, -8), neck1=(0, 0, -12), head=(0, 0, -8), jaw=(14, 0, 0))
    attack2 = [(0, BASE), (14, wind), (22, whip), (28, P(whip, tz(-6))), (44, BASE)]
    inhale = P(BASE, neck1=(-20, 0, 0), neck2=(-14, 0, 0), head=(-12, 0, 0), chest=(-6, 0, 0), jaw=(6, 0, 0),
               wing1_L=(0, -14, -20), wing1_R=(0, 14, 20))
    breath = P(BASE, neck1=(18, 0, 0), neck2=(12, 0, 0), neck3=(4, 0, 0), head=(10, 0, 0), chest=(4, 0, 0),
               jaw=(38, 0, 0), wing1_L=(0, -14, -24), wing1_R=(0, 14, 24))
    cast = [(0, BASE), (16, inhale), (22, P(inhale, chest=(-2, 0, 0))), (28, breath), (36, P(breath, neck1=(0, 0, 14))),
            (44, P(breath, neck1=(0, 0, -14))), (50, breath), (62, BASE)]
    roarp = P(STAND, SPREAD, sym(upperleg_B=(32, 0, 0), lowerleg_B=(4, 0, 0), upperleg_F=(-44, 0, 0), lowerleg_F=(56, 0, 0),
                                 wing1=(0, -18, 0)),
              hips=(-34, 0, 0), chest=(-6, 0, 0), neck1=(-22, 0, 0), neck2=(-12, 0, 0), head=(-18, 0, 0), jaw=(42, 0, 0),
              hips__loc=(0, 0, 0.1), tail1=(26, 0, 0), tail2=(12, 0, 0), tail3=(6, 0, 0))
    enrage = [(0, BASE), (10, P(BASE, neck1=(14, 0, 0), head=(10, 0, 0), chest=(4, 0, 0))), (22, roarp)]
    for i, f in enumerate((28, 34, 40, 46)):
        enrage.append((f, P(roarp, neck1=(0, 0, 6 if i % 2 else -6), jaw=(-6 if i % 2 else 2, 0, 0),
                            wing2_L=(0, 6 if i % 2 else -6, 0), wing2_R=(0, -6 if i % 2 else 6, 0))))
    enrage += [(54, roarp), (66, BASE)]
    hit = [(0, BASE), (4, P(BASE, neck1=(-16, 0, 12), head=(-12, 0, 0), chest=(-5, 0, 0), hips__loc=(0, 0.15, 0.04),
                            jaw=(16, 0, 0))), (16, BASE)]
    rec = P(BASE, sym(upperleg_B=(18, 0, 0)), hips=(-20, 0, 0), neck1=(-24, 0, 0), head=(-16, 0, 0), jaw=(36, 0, 0))
    roll = P(STAND, FOLD, sym(upperleg_F=(-10, 0, 0), upperleg_B=(-10, 0, 0)), root=(0, 40, 0), root__loc=(0, 0, 0.3),
             neck1=(10, 0, -10), head=(10, 0, 0), jaw=(20, 0, 0))
    fold_r = {k: v for k, v in FOLD.items() if k.endswith('_R')}
    down = P(STAND, fold_r, sym(upperleg_F=(-24, 0, 0), lowerleg_F=(30, 0, 0), upperleg_B=(-30, 0, 0), lowerleg_B=(20, 0, 0)),
             {f'tail{i}': (0, 0, 5) for i in range(1, 5)}, root=(0, 84, 0), root__loc=(0, 0, 1.06),
             wing1_L=(0, -84, 10), wing2_L=(0, 8, 0), wing3_L=(0, 4, 0),
             neck1=(16, 0, -14), neck2=(10, 0, -8), head=(12, 0, -10), jaw=(24, 0, 0),
             wing1_R=(0, 40, -50), wing2_R=(0, -20, 90), wing3_R=(0, 0, -80))
    death = [(0, BASE), (12, rec), (30, roll), (44, P(down, root=(0, 5, 0), root__loc=(0, 0, -0.06))),
             (52, P(down, root=(0, -2, 0), root__loc=(0, 0, 0.04))), (64, down)]
    return [('Idle', idle), ('Walk', walk), ('Run', run), ('Fly', fly), ('Attack', attack), ('Attack2', attack2),
            ('Cast', cast), ('Enrage', enrage), ('Hit', hit), ('Death', death)]


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
