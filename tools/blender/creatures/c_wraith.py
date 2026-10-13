"""Wraith: floating hooded ghost, semi-transparent tattered robe (alpha blend), glowing eyes, bony claws."""
import math
from clib import Creature, Act, lathe, sphere, limb, cone, box, wchain, sym
import ptex as T

CLOTH = T.R('#06080e', '#101826', '#1c2a3c', '#2c4252', '#426066', '#64887e')
FACE = T.R('#000000', '#04060a', '#0a0e16')
EYE = T.R('#0a8a6a', '#30ffc0', '#a0fff0', '#ffffff')
BONE = T.R('#3a3a30', '#706a58', '#a8a088', '#d8d4bc', '#f4f2e4')


def build():
    A = T.Atlas(64, 16, seed=51)
    A.paint('robe', T.pat_cloth, 2, 2, ramp=CLOTH, folds=4, alpha_lo=0.35, alpha_hi=0.92, tatter=0.28)
    A.paint('hood', T.pat_cloth, ramp=CLOTH, folds=2, alpha_lo=0.92, alpha_hi=0.97, lo=0.3, hi=0.85)
    A.paint('sleeve', T.pat_cloth, ramp=CLOTH, folds=2, alpha_lo=0.6, alpha_hi=0.95, tatter=0.25)
    A.paint('face', T.pat_solid, ramp=FACE, t=0.4)
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.4)
    A.paint('bone', T.pat_base, ramp=BONE, lo=0.2, hi=0.95, outline='lr')

    robe_w = wchain([('hem', 0.35), ('body', 0.95), ('chest', 1.5)], 2)

    def robe_v(ri, si, p):
        x, y, z = p.x, p.y, p.z
        k = 1.0 + 0.3 * max(0.0, min(1.0, (z - 1.4) / 0.35))    # broad shoulders
        x *= k
        if ri == 0:                                            # tattered zig-zag hem
            z += (-0.13 if si % 2 else 0.07)
            y += 0.1
            x *= 1.0 + (0.1 if si % 3 == 0 else -0.05)
        if ri == 1:
            y += 0.05
        return (x, y, z)
    robe = lathe([(0.26, 0.18), (0.37, 0.5), (0.39, 0.9), (0.36, 1.3), (0.44, 1.6), (0.48, 1.76), (0.3, 1.9), (0.15, 1.96)],
                 12, vfn=robe_v, cap0=False, cap1=False)
    parts = [robe.set(tile='robe', mat='alpha', uv='cyl', wfn=robe_w, ao=(0.55, 1.0))]

    def hood_v(ri, si, p):
        x, y, z = p.x, p.y, p.z
        if ri == 4:
            y += 0.16
            z -= 0.04
        if ri == 3:
            y += 0.06
        if ri in (1, 2) and y < -0.1:    # hood brim sticks out over the face
            y -= 0.07
        return (x, y, z)
    hood = lathe([(0.2, 1.8), (0.31, 1.95), (0.31, 2.15), (0.24, 2.3), (0.0, 2.42)], 10, center=(0, 0.04, 0), vfn=hood_v)
    parts.append(hood.set(tile='hood', mat='alpha', uv='cyl', bone='head', ao=(0.7, 1.0)))
    parts.append(sphere(0.17, 8, 4, center=(0, -0.26, 2.08), sx=1.0, sy=0.38, sz=1.15).set(tile='face', bone='head', uv='py', ao=(1, 1)))
    for p in sym(box(0.065, 0.02, 0.035, center=(0.065, -0.335, 2.1)).rot(0, -12, 0, pivot=(0.065, -0.335, 2.1))
                 .set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)

    def sleeve_v(ri, si, p):
        return p
    for p in sym(limb((0.5, 0.0, 1.72), (0.62, -0.08, 1.32), 0.12, 0.11, 6).set(tile='sleeve', mat='alpha', bone='arm_l', ao=(0.8, 1))):
        parts.append(p)
    for p in sym(limb((0.62, -0.08, 1.32), (0.66, -0.32, 1.12), 0.11, 0.17, 6).set(tile='sleeve', mat='alpha', bone='fore_l', ao=(0.8, 1))):
        parts.append(p)
    # bony hands: palm + 3 long fingers + thumb
    for p in sym(box(0.1, 0.1, 0.05, center=(0.67, -0.36, 1.08)).rot(-35, 0, 0, pivot=(0.67, -0.36, 1.08)).set(tile='bone', bone='fore_l')):
        parts.append(p)
    for dx in (-0.035, 0.0, 0.035):
        for p in sym(cone((0.67 + dx, -0.4, 1.06), (0.67 + dx * 1.6, -0.6, 0.93), 0.02, 3).set(tile='bone', bone='fore_l')):
            parts.append(p)
    for p in sym(cone((0.62, -0.38, 1.07), (0.58, -0.52, 1.0), 0.018, 3).set(tile='bone', bone='fore_l')):
        parts.append(p)

    bones = [('root', (0, 0, 0), None), ('body', (0, 0, 1.0), 'root'), ('hem', (0, 0, 0.55), 'body'),
             ('chest', (0, 0, 1.45), 'body'), ('head', (0, 0, 1.9), 'chest'),
             ('arm_l', (0.5, 0, 1.72), 'chest'), ('fore_l', (0.62, -0.08, 1.32), 'arm_l'),
             ('arm_r', (-0.5, 0, 1.72), 'chest'), ('fore_r', (-0.62, -0.08, 1.32), 'arm_r')]
    return Creature('wraith', bones, parts, A, make_anims(), emit=2.5,
                    meta={'bone_len': 0.1, 'doc': {'name_tr': 'Hortlak', 'emissive': 'eyes (spectral green); robe uses alpha-blend material',
                                                    'use': 'floating caster / melee elite in crypts; ignore ground snapping (hem floats ~0.05-0.2)'}})


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    arms_idle = dict(arm_l=(-25, -10, 0), arm_r=(-25, 10, 0), fore_l=(-35, 0, 0), fore_r=(-35, 0, 0))

    a = Act('Idle', 60)
    a.wave('body', lambda t: dict(loc=(0, 0, 0.08 * S(tau * t)), rot=(2 * S(tau * t + 1), 0, 0)), 3)
    a.wave('hem', lambda t: dict(rot=(6 + 5 * S(tau * t + 1.5), 4 * S(tau * t), 0)), 3)
    a.wave('chest', lambda t: dict(rot=(3 * S(tau * t), 0, 3 * S(tau * t * 0.5 * 2 + 2))), 3)
    a.wave('head', lambda t: dict(rot=(4 - 3 * S(tau * t), 6 * S(tau * t), 0)), 3)
    for b, r in arms_idle.items():
        ph = 0 if b.endswith('_l') else 1.4
        a.wave(b, lambda t, r=r, ph=ph: dict(rot=(r[0] + 6 * S(tau * t + ph), r[1], r[2])), 3)
    acts.append(a)

    def glide(name, n, lean, trail, bob):
        a = Act(name, n)
        a.wave('body', lambda t: dict(loc=(0, 0, bob * S(tau * t)), rot=(lean, 0, 3 * S(tau * t))), 2)
        a.wave('hem', lambda t: dict(rot=(trail + 6 * S(tau * t * 2), 6 * S(tau * t), 0)), 2)
        a.wave('chest', lambda t: dict(rot=(lean * 0.3, 0, -4 * S(tau * t))), 2)
        a.wave('head', lambda t: dict(rot=(-lean * 0.8, 0, 0)), 4)
        for s, sfx in ((1, '_l'), (-1, '_r')):
            a.wave('arm' + sfx, lambda t, s=s: dict(rot=(trail * 0.8 + 6 * S(tau * t + s), -12 * s, 0)), 2)
            a.wave('fore' + sfx, lambda t: dict(rot=(-20, 0, 0)), 4)
        return a
    acts.append(glide('Walk', 40, 10, 16, 0.06))
    acts.append(glide('Run', 24, 22, 30, 0.05))

    a = Act('Attack', 30, loop=False)
    up = dict(arm_l=(-135, -25, 0), arm_r=(-135, 25, 0), fore_l=(-20, 0, 0), fore_r=(-20, 0, 0),
              chest=(-16, 0, 0), head=(-10, 0, 0), body=dict(loc=(0, 0.08, 0.1)), hem=(10, 0, 0))
    slash = dict(arm_l=(-35, 25, -10), arm_r=(-35, -25, 10), fore_l=(-10, 0, 0), fore_r=(-10, 0, 0),
                 chest=(22, 0, 0), head=(5, 0, 0), body=dict(loc=(0, -0.35, -0.05)), hem=(25, 0, 0))
    a.at(10, **up).at(15, **slash).at(20, **slash)
    a.rest(30, *up.keys())
    acts.append(a)

    a = Act('Cast', 42, loop=False)
    spread = dict(arm_l=(-45, -70, 0), arm_r=(-45, 70, 0), fore_l=(-30, 0, 0), fore_r=(-30, 0, 0),
                  chest=(-14, 0, 0), head=(-16, 0, 0), body=dict(loc=(0, 0, 0.22)), hem=(-6, 0, 0))
    a.at(14, **spread).at(20, **dict(spread, chest=(-18, 0, 4)))
    push = dict(arm_l=(-88, -6, 0), arm_r=(-88, 6, 0), fore_l=(0, 0, 0), fore_r=(0, 0, 0),
                chest=(16, 0, 0), head=(4, 0, 0), body=dict(loc=(0, -0.12, 0.12)), hem=(18, 0, 0))
    a.at(27, **push).at(32, **push)
    a.rest(42, *spread.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(body=dict(loc=(0, 0.18, 0.03)), chest=(-18, 0, 6), head=(-16, 0, 0), hem=(-10, 0, 0),
               arm_l=(-10, -30, 0), arm_r=(-10, 30, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 45, loop=False)
    a.at(10, body=dict(loc=(0, 0, 0.2)), chest=(-25, 0, 0), head=(-25, 0, 0), arm_l=(-120, -40, 0), arm_r=(-120, 40, 0))
    a.at(30, body=dict(loc=(0, 0.05, -0.85), scl=(1.2, 1.2, 0.35)), chest=(30, 0, 0), head=(30, 0, 0),
         arm_l=(-30, -60, 0), arm_r=(-30, 60, 0), hem=(0, 0, 0))
    a.at(45, body=dict(loc=(0, 0.05, -0.93), scl=(1.35, 1.35, 0.12)), chest=(35, 0, 0), head=(40, 0, 0),
         arm_l=(-20, -80, 0), arm_r=(-20, 80, 0))
    acts.append(a)
    return acts
