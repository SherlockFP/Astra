"""Golge Rahibesi - floating shadow priestess (~4.6 units): pointed hood with a void face, flared mantle,
tentacle-like cloth strips instead of legs, glowing purple orbs (hands + 3 orbiting) and a crescent halo."""
import math
from bosslib import (Atlas, Builder, ramp, make_material, build_armature, add_actions, export_glb, bake_report,
                     T, P, sym)

ID = 'golge_rahibesi'
NAME_TR = 'Gölge Rahibesi'
PREVIEW = [('Idle', 0), ('Walk', 10), ('Attack', 14), ('Attack', 20), ('Attack2', 18), ('Cast', 24), ('Enrage', 24),
           ('Death', 60)]
NT = 6                     # tentacle strips
TENT_ANG = [math.radians(30 + 60 * k) for k in range(NT)]


def textures():
    A = Atlas(128, 32)
    A.add('robe', 'cloth', ramp('#08050d', '#1a1029', '#2c1a45', '#45296a', '#66449c'), 2, 2, seed=41, folds=4, outline='tb')
    A.add('tent', 'runes', ramp('#05030a', '#120a20', '#231338', '#3a2258'), seed=42, emit='#c060ff', outline='',
          column=True, row=0.15, rune_color='#e0a0ff')
    A.add('mantle', 'trim', ramp('#08050c', '#2a1840', '#56347c', '#9068c0', '#d8b8ff'), seed=43, zig=5, outline='')
    A.add('skin', 'skin', ramp('#1c1626', '#3e3352', '#675a80', '#9a8cb4', '#cfc2e6'), seed=44, outline='tb')
    A.add('void', 'void', ramp('#000000', '#06030a', '#100818', '#1c0f2c'), seed=45, outline='', grad=0.0)
    A.add('orb', 'glow', ramp('#7a1ee0', '#b45cff', '#e4b6ff', '#ffffff'), seed=46, emit='base', outline='')
    A.add('eye', 'glow', ramp('#c040ff', '#f080ff', '#ffd0ff', '#ffffff'), seed=47, emit='base', outline='')
    A.add('silver', 'metal', ramp('#0b0a12', '#2a2838', '#4e4c66', '#8a88a8', '#e2e0f4'), seed=48, outline='tb')
    A.add('halo', 'crystal', ramp('#2a0a50', '#6a24b0', '#a45cf0', '#d8a8ff', '#ffffff'), seed=49, emit='base', outline='')
    return A


BONES = [
    ('root', (0, 0, 0), None),
    ('hips', (0, 0, 1.75), 'root'),
    ('spine', (0, 0, 2.2), 'hips'),
    ('chest', (0, 0, 2.7), 'spine'),
    ('neck', (0, 0, 3.25), 'chest'),
    ('head', (0, 0, 3.45), 'neck'),
    ('orbit', (0, 0, 2.9), 'root'),
]
for s, sd in ((1, 'L'), (-1, 'R')):
    BONES += [
        (f'upperarm_{sd}', (s * 0.44, 0, 3.12), 'chest'),
        (f'forearm_{sd}', (s * 0.62, -0.06, 2.55), f'upperarm_{sd}'),
        (f'hand_{sd}', (s * 0.74, -0.16, 2.02), f'forearm_{sd}'),
        (f'fx_orb_{sd}', (s * 0.78, -0.3, 1.82), f'hand_{sd}'),
    ]


def tent_pts(k):
    a = TENT_ANG[k]
    dx, dy = math.sin(a), -math.cos(a)
    prof = ((0.36, 1.78), (0.62, 1.2), (0.8, 0.66), (0.86, 0.14))
    return [(dx * r, dy * r, z) for r, z in prof]


for k in range(NT):
    p = tent_pts(k)
    BONES.append((f'tent{k}_1', p[0], 'hips'))
    BONES.append((f'tent{k}_2', p[1], f'tent{k}_1'))
    BONES.append((f'tent{k}_3', p[2], f'tent{k}_2'))


def geometry(B):
    # torso + sash
    B.lathe('robe', [(0.34, 1.62), (0.44, 2.2), (0.5, 2.7), (0.4, 3.2)], 8, sy=0.72, cap0=True,
            ring_w=[{'hips': 1}, {'spine': 1}, {'chest': 1}, {'chest': 1}])
    B.cyl('silver', 0.42, 0.4, 0.16, 8, T((0, 0, 1.82)), sy=0.75, bone='hips')
    B.box('mantle', (0.2, 0.05, 0.84), T((0, -0.335, 2.32)), top=(1.4, 1),
          wfun=lambda p: {'spine': 1} if p.z < 2.4 else {'chest': 1})
    B.octa('orb', 0.1, T((0, -0.34, 1.9)), stretch=1.5, bone='hips')
    # tentacle cloth strips (flat ribbons that taper to a point)
    for k in range(NT):
        p = tent_pts(k)
        mid = [((p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2, (p[i][2] + p[i + 1][2]) / 2) for i in range(3)]
        pts = [p[0], mid[0], p[1], mid[1], p[2], mid[2], p[3]]
        rad = [0.24, 0.24, 0.22, 0.19, 0.15, 0.09, 0.0]
        rw = [{'hips': 1}, {f'tent{k}_1': 1}, {f'tent{k}_1': 0.5, f'tent{k}_2': 0.5}, {f'tent{k}_2': 1},
              {f'tent{k}_2': 0.5, f'tent{k}_3': 0.5}, {f'tent{k}_3': 1}, {f'tent{k}_3': 1}]
        B.tube('tent', pts, rad, 4, ring_w=rw, sx=0.32)
    # chest jewel + flared spiky mantle
    B.octa('orb', 0.13, T((0, -0.4, 2.78)), stretch=1.3, bone='chest')
    B.lathe('mantle', [(0.98, 2.72), (0.72, 3.02), (0.36, 3.3)], 8, sy=0.72, cap0=False, cap1=False, zig=(0, 0.26),
            bone='chest', closed=False)
    # hood with void face, glowing eyes, drooping tip
    B.lathe('robe', [(0.36, 3.2), (0.4, 3.5), (0.33, 3.85), (0.16, 4.12), (0.0, 4.25)], 8, sy=1.06,
            bone='head')
    B.box('void', (0.4, 0.06, 0.48), T((0, -0.405, 3.6)), top=(0.75, 1), bone='head')
    for s in (1, -1):
        B.octa('eye', 0.05, T((s * 0.09, -0.45, 3.66)), stretch=0.6, bone='head')
    B.tube('robe', [(0, 0.06, 4.05), (0, 0.36, 4.38), (0, 0.66, 4.5), (0, 0.9, 4.4)], [0.2, 0.13, 0.07, 0.0], 5,
           bone='head')
    # crescent halo behind the head (open at the bottom)
    rows = [[], []]
    for i in range(11):
        a = math.radians(-150 + 300 * i / 10)
        for r, row in ((0.84, rows[0]), (0.66, rows[1])):
            row.append((math.sin(a) * r, 0.5, 3.62 + math.cos(a) * r))
    B.sheet('halo', rows, ring_w=[{'chest': 1}, {'chest': 1}])
    for i in range(5):
        a = math.radians(-120 + 60 * i)
        p0 = (math.sin(a) * 0.84, 0.5, 3.62 + math.cos(a) * 0.84)
        p1 = (math.sin(a) * 1.18, 0.52, 3.62 + math.cos(a) * 1.18)
        B.spike('halo', p0, p1, 0.06, 3, bone='chest')
    # arms with bell sleeves, clawed hands and palm orbs
    for s, sd in ((1, 'L'), (-1, 'R')):
        sh, el, wr = (s * 0.44, 0, 3.12), (s * 0.62, -0.06, 2.55), (s * 0.74, -0.16, 2.02)
        B.limb('skin', sh, el, 0.065, 0.055, 5, bone=f'upperarm_{sd}')
        B.limb('skin', el, wr, 0.055, 0.045, 5, bone=f'forearm_{sd}')
        B.lathe_between('robe', (s * 0.72, -0.14, 2.2), (s * 0.5, -0.02, 3.05), [(0.34, 0), (0.2, 0.45), (0.13, 1.0)], 7,
                        cap0=False, zig=(0, 0.14), wfun=lambda p, sd=sd: ({f'forearm_{sd}': 1} if p.z < 2.5 else {f'upperarm_{sd}': 1}))
        B.box('skin', (0.11, 0.07, 0.13), T((s * 0.75, -0.17, 1.96)), bone=f'hand_{sd}')
        for dx in (-0.04, 0.0, 0.04):
            B.spike('skin', (s * 0.75 + dx, -0.2, 1.9), (s * 0.76 + dx * 1.8, -0.3, 1.66), 0.022, 3, bone=f'hand_{sd}')
        B.sphere('orb', 0.15, 6, 4, T((s * 0.78, -0.3, 1.82)), bone=f'fx_orb_{sd}')
    # three orbiting orbs
    for i in range(3):
        a = math.radians(120 * i + 60)
        B.sphere('orb', 0.19, 6, 4, T((math.sin(a) * 1.25, -math.cos(a) * 1.25, 2.9)), bone='orbit')
        B.octa('halo', 0.09, T((math.sin(a) * 1.25, -math.cos(a) * 1.25, 3.18)), stretch=1.6, bone='orbit')


def tents(alpha1, alpha2, alpha3, phase=None, amp=0.0, base_phase=0.0):
    """Radial outward swing per tentacle (+ = flare outward), optional travelling wave."""
    out = {}
    for k in range(NT):
        th = TENT_ANG[k]
        w = 0.0 if phase is None else amp * math.sin(phase + base_phase + k * 1.05)
        for j, al in ((1, alpha1 + w * 0.6), (2, alpha2 + w), (3, alpha3 + w * 1.2)):
            out[f'tent{k}_{j}'] = (-al * math.cos(th), -al * math.sin(th), 0.0)
    return out


def trail(a1, a2, a3):
    """Tentacles swept backward (moving forward)."""
    out = {}
    for k in range(NT):
        for j, al in ((1, a1), (2, a2), (3, a3)):
            out[f'tent{k}_{j}'] = (al, 0, 0)
    return out


def actions():
    BASE = P({'root@loc': (0, 0, 0.32), 'head': (4, 0, 0)},
             sym(upperarm=(-12, -16, 0), forearm=(-38, 6, 0), hand=(-20, 0, 0)), tents(6, 8, 8))
    idle = []
    for i, f in enumerate((0, 15, 30, 45, 60)):
        ph = i * math.pi / 2
        idle.append((f, P(BASE, tents(0, 0, 0, ph, 7), {'root@loc': (0, 0, 0.08 * math.sin(ph)),
                                                        'chest': (2 * math.sin(ph), 0, 0),
                                                        'orbit': (0, 0, 30 * i),
                                                        'head': (0, 0, 5 * math.sin(ph * 0.5))},
                          sym(upperarm=(0, -3 * math.sin(ph), 0), forearm=(-4 * math.sin(ph), 0, 0)))))
    W = P(BASE, trail(18, 14, 12), chest=(10, 0, 0), spine=(4, 0, 0), head=(-8, 0, 0),
          upperarm_L=(14, 0, 0), upperarm_R=(14, 0, 0))
    walk = []
    for i, f in enumerate((0, 10, 20, 30, 40)):
        ph = i * math.pi / 2
        walk.append((f, P(W, tents(0, 0, 0, ph, 9), {'root@loc': (0, 0, 0.06 * math.cos(ph * 2)), 'orbit': (0, 0, 30 * i)})))
    R = P(BASE, trail(34, 26, 22), chest=(18, 0, 0), spine=(6, 0, 0), head=(-14, 0, 0),
          upperarm_L=(36, 0, 0), upperarm_R=(36, 0, 0), forearm_L=(20, 0, 0), forearm_R=(20, 0, 0))
    run = []
    for i, f in enumerate((0, 7, 14, 21, 28)):
        ph = i * math.pi / 2
        run.append((f, P(R, tents(0, 0, 0, ph, 12), {'root@loc': (0, 0, 0.08 * math.cos(ph * 2)), 'orbit': (0, 0, 30 * i)})))
    rise = P(BASE, sym(upperarm=(-150, -20, 0), forearm=(-20, 0, 0), hand=(10, 0, 0)), tents(-4, -6, -8),
             chest=(-14, 0, 0), head=(-12, 0, 0), root__loc=(0, 0.1, 0.35), orbit=(0, 0, 40))
    slam = P(BASE, sym(upperarm=(-48, -8, 0), forearm=(-6, 0, 0), hand=(30, 0, 0)), trail(-30, -36, -40),
             chest=(30, 0, 0), spine=(10, 0, 0), head=(4, 0, 0), root__loc=(0, -0.45, -0.18), orbit=(0, 0, 80))
    attack = [(0, BASE), (14, rise), (17, P(rise, chest=(-4, 0, 0))), (20, slam), (27, P(slam, chest=(3, 0, 0))),
              (42, P(BASE, orbit=(0, 0, 120)))]
    attack2 = [(0, BASE)]
    for i, (f, yaw) in enumerate(((8, -30), (14, 60), (18, 150), (22, 240), (26, 330), (32, 360))):
        fl = (10, 40, 55, 55, 45, 20)[i]
        attack2.append((f, P(BASE, tents(fl * 0.6, fl, fl * 1.1), sym(upperarm=(-10, -70 * min(1, fl / 40), 0)),
                             root=(0, 0, yaw), root__loc=(0, 0, 0.1 if 0 < i < 5 else 0), orbit=(0, 0, yaw * 0.5))))
    attack2.append((44, P(BASE, root=(0, 0, 360), orbit=(0, 0, 180))))
    up = P(BASE, sym(upperarm=(-20, -150, 0), forearm=(0, -16, 0), hand=(20, 0, 0)), tents(24, 30, 34),
           chest=(-16, 0, 0), head=(-26, 0, 0), root__loc=(0, 0, 0.55), orbit=(0, 0, 60))
    push = P(BASE, sym(upperarm=(-84, -14, 0), forearm=(-4, 0, 0), hand=(-30, 0, 0)), trail(14, 18, 20),
             chest=(14, 0, 0), head=(2, 0, 0), root__loc=(0, -0.2, 0.35), orbit=(0, 0, 150))
    cast = [(0, BASE), (16, P(up, orbit=(0, 0, -40))), (24, up), (32, P(up, tents(0, 0, 0, 0, 10), orbit=(0, 0, 40))),
            (40, P(up, tents(0, 0, 0, 2, 10), orbit=(0, 0, 80), root__loc=(0, 0, 0.08))), (48, push),
            (56, P(push, orbit=(0, 0, 20))), (68, P(BASE, orbit=(0, 0, 240)))]
    scream = P(BASE, sym(upperarm=(-12, -82, 0), forearm=(0, -10, 0), hand=(0, 0, 0)), tents(50, 54, 50),
               chest=(-24, 0, 0), spine=(-8, 0, 0), head=(-30, 0, 0), root__loc=(0, 0, 0.45))
    curl = P(BASE, sym(upperarm=(-40, 10, 0), forearm=(-110, 0, 0)), tents(-14, -16, -14), chest=(26, 0, 0),
             head=(26, 0, 0), root__loc=(0, 0, 0.0))
    enrage = [(0, BASE), (12, P(curl, orbit=(0, 0, 60))), (24, P(scream, orbit=(0, 0, 150)))]
    for i, f in enumerate((30, 36, 42, 48)):
        enrage.append((f, P(scream, tents(0, 0, 0, i * 1.6, 12), chest=(0, 0, 5 if i % 2 else -5),
                            orbit=(0, 0, 150 + 30 * (i + 1)))))
    enrage.append((62, P(BASE, orbit=(0, 0, 360))))
    hit = [(0, BASE), (4, P(BASE, trail(-16, -10, -6), chest=(-18, 0, 10), head=(-20, 0, 0), root__loc=(0, 0.3, 0.1),
                            upperarm_L=(-20, -30, 0))), (16, BASE)]
    rec = P(BASE, sym(upperarm=(-30, -70, 0)), tents(30, 30, 30), chest=(-26, 0, 0), head=(-34, 0, 0),
            root__loc=(0, 0.15, 0.6))
    sink = P(BASE, sym(upperarm=(-10, -30, 0), forearm=(-20, 0, 0)), tents(48, 56, 40), chest=(30, 0, 0),
             head=(30, 0, 0), root__loc=(0, 0, -0.62))
    down = P(BASE, sym(upperarm=(-60, -46, 0), forearm=(-10, 0, 0)), tents(78, 30, 10), root=(76, 0, 0),
             root__loc=(0, 0.55, 0.62), chest=(10, 0, 0), head=(-14, 0, 30), orbit=(0, 0, 0))
    death = [(0, BASE), (12, rec), (30, sink), (44, P(down, root=(4, 0, 0))), (52, P(down, root=(-2, 0, 0))), (60, down)]
    for name, keys in (('Death', death),):
        for _, p in keys:
            p['orbit@loc'] = (0, 0, 0)
    death[-1][1]['orbit@loc'] = (0, 0, -2.75)
    death[-2][1]['orbit@loc'] = (0, 0, -2.7)
    death[-3][1]['orbit@loc'] = (0, 0, -2.4)
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
