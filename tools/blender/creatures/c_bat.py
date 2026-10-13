"""Cave bat: hovering flyer (body at ~1.5 above the origin), 2-bone wings, membrane wings."""
import math
from clib import Creature, Act, Part, sphere, limb, cone, box, poly, sym
import ptex as T

FUR = T.R('#140c10', '#2a1a1e', '#46302e', '#664a40', '#8a6a56')
SKIN = T.R('#1c0e14', '#3a1c26', '#5e2e3a', '#844654', '#a8667a')
EYE = T.R('#806000', '#ffd020', '#fff080', '#ffffff')
TOOTH = T.R('#6a6050', '#c8c0a8', '#f4f0e0')

S0 = (0.11, -0.02, 1.6)      # shoulder
E0 = (0.46, -0.01, 1.68)     # wrist / hand bone pivot


def build():
    A = T.Atlas(64, 16, seed=21)
    A.paint('fur', T.pat_fur, ramp=FUR, lo=0.2, hi=0.85)
    A.paint('wing', T.pat_membrane, 2, 2, ramp=SKIN, veins=4, vein_col='#120810')
    A.paint('skin', T.pat_base, ramp=SKIN, lo=0.25, hi=0.85, outline='lr')
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.4)
    A.paint('tooth', T.pat_base, ramp=TOOTH, lo=0.2, hi=1.0)
    A.paint('ear', T.pat_base, ramp=SKIN, lo=0.1, hi=0.9, outline='lr', hilite=True)

    parts = []
    parts.append(sphere(0.2, 8, 5, center=(0, 0.03, 1.48), sx=0.85, sy=0.95, sz=1.25).set(tile='fur', bone='body', uv='cyl'))
    parts.append(sphere(0.16, 8, 5, center=(0, -0.13, 1.72), sx=1.05, sy=0.95, sz=0.92).set(tile='fur', bone='head', uv='cyl'))
    parts.append(box(0.12, 0.1, 0.09, center=(0, -0.28, 1.68), taper=(0.8, 0.7)).set(tile='skin', bone='head', uv='box'))
    for p in sym(cone((0.085, -0.1, 1.8), (0.21, -0.06, 2.06), 0.065, 3, phase=0.3).set(tile='ear', bone='head', uv='box')):
        parts.append(p)
    for p in sym(box(0.055, 0.03, 0.04, center=(0.068, -0.27, 1.76)).set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    for p in sym(cone((0.035, -0.3, 1.64), (0.03, -0.31, 1.55), 0.02, 3).set(tile='tooth', bone='head', uv='box', ao=(1, 1))):
        parts.append(p)
    # feet
    for p in sym(limb((0.06, 0.06, 1.3), (0.08, 0.09, 1.13), 0.025, 0.02, 3).set(tile='skin', bone='body')):
        parts.append(p)
    for p in sym(cone((0.08, 0.09, 1.14), (0.08, 0.02, 1.1), 0.025, 3).set(tile='tooth', bone='body')):
        parts.append(p)
    # wings
    T1, T2, T3 = (1.0, -0.06, 1.72), (0.93, 0.2, 1.46), (0.66, 0.34, 1.3)
    SC1, SC2, SC3 = (0.84, 0.1, 1.57), (0.73, 0.25, 1.42), (0.4, 0.3, 1.34)
    B0 = (0.1, 0.16, 1.42)
    wpts = [E0, T1, SC1, T2, SC2, T3, SC3, B0, S0]
    faces = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6), (0, 6, 7), (0, 7, 8)]

    def wfn(v):
        if v.x < 0.3:
            return {'wing_l': 1.0}
        if v.x < 0.45:
            return {'wing_l': 0.5, 'hand_l': 0.5}
        return {'hand_l': 1.0}
    mem = Part(wpts, faces).set(tile='wing', mat='main2s', uv='pz', wfn=wfn, ao=(0.75, 1.0))
    parts += sym(mem)
    parts += sym(limb(S0, E0, 0.04, 0.03, 4).set(tile='skin', bone='wing_l'))
    for tip in (T1, T2, T3):
        parts += sym(limb(E0, tip, 0.022, 0.01, 3).set(tile='skin', bone='hand_l'))
    parts += sym(cone(E0, (0.47, -0.1, 1.73), 0.025, 3).set(tile='tooth', bone='hand_l'))

    bones = [('root', (0, 0, 0), None), ('body', (0, 0, 1.5), 'root'), ('head', (0, -0.1, 1.64), 'body'),
             ('wing_l', S0, 'body'), ('hand_l', E0, 'wing_l'),
             ('wing_r', (-S0[0], S0[1], S0[2]), 'body'), ('hand_r', (-E0[0], E0[1], E0[2]), 'wing_r')]
    return Creature('bat_cave', bones, parts, A, make_anims(), emit=2.5,
                    meta={'bone_len': 0.06, 'doc': {'name_tr': 'Mağara Yarasası', 'emissive': 'eyes (yellow)',
                                                     'use': 'flying swarm trash; place origin on the floor, it hovers at ~1.5'}})


def make_anims():
    S, tau = math.sin, 2 * math.pi
    acts = []

    def flap(name, n, amp, hamp, pitch, bob, sweep=8):
        a = Act(name, n)
        a.wave('wing_l', lambda t: dict(rot=(0, -amp * S(tau * t), -sweep * math.cos(tau * t))), 1)
        a.wave('wing_r', lambda t: dict(rot=(0, amp * S(tau * t), sweep * math.cos(tau * t))), 1)
        a.wave('hand_l', lambda t: dict(rot=(0, -hamp * S(tau * t - 0.9), 0)), 1)
        a.wave('hand_r', lambda t: dict(rot=(0, hamp * S(tau * t - 0.9), 0)), 1)
        a.wave('body', lambda t: dict(loc=(0, 0, -bob * S(tau * t + 0.6)), rot=(pitch + 4 * S(tau * t), 0, 0)), 1)
        a.wave('head', lambda t: dict(rot=(-pitch * 0.6 - 3 * S(tau * t), 0, 0)), 2)
        return a

    acts.append(flap('Idle', 20, 48, 30, 0, 0.06))
    acts.append(flap('Walk', 18, 52, 32, 14, 0.05))
    acts.append(flap('Run', 12, 58, 36, 26, 0.04, sweep=12))

    a = Act('Attack', 24, loop=False)
    a.at(8, body=dict(loc=(0, 0.2, 0.12), rot=(-20, 0, 0)), head=(-15, 0, 0),
         wing_l=(0, -70, 0), wing_r=(0, 70, 0), hand_l=(0, -20, 0), hand_r=(0, 20, 0))
    a.at(13, body=dict(loc=(0, -0.6, -0.3), rot=(35, 0, 0)), head=(28, 0, 0),
         wing_l=(0, 25, 40), wing_r=(0, -25, -40), hand_l=(0, 30, 20), hand_r=(0, -30, -20))
    a.at(18, body=dict(loc=(0, -0.3, -0.1), rot=(10, 0, 0)), head=(0, 0, 0),
         wing_l=(0, -40, 0), wing_r=(0, 40, 0), hand_l=(0, -10, 0), hand_r=(0, 10, 0))
    a.rest(24, 'body', 'head', 'wing_l', 'wing_r', 'hand_l', 'hand_r')
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    a.at(3, body=dict(loc=(0, 0.16, 0.05), rot=(-18, 18, 0)), head=(-20, 0, 0),
         wing_l=(0, 35, 0), wing_r=(0, -35, 0), hand_l=(0, 40, 0), hand_r=(0, -40, 0))
    a.rest(12, 'body', 'head', 'wing_l', 'wing_r', 'hand_l', 'hand_r')
    acts.append(a)

    a = Act('Death', 30, loop=False)
    a.at(5, body=dict(loc=(0, 0, 0.1), rot=(-15, 0, 0)), wing_l=(0, -60, 0), wing_r=(0, 60, 0), head=(-25, 0, 0))
    a.at(14, body=dict(loc=(0, 0.1, -0.6), rot=(40, 50, 0)), wing_l=(0, 50, 30), wing_r=(0, -50, -30),
         hand_l=(0, 70, 0), hand_r=(0, -70, 0), head=(20, 0, 0))
    fall = dict(body=dict(loc=(0, 0.15, -1.3), rot=(10, 90, 0)), wing_l=(0, 20, 30), wing_r=(0, -70, -30),
                hand_l=(0, 60, 0), hand_r=(0, -40, 0), head=(25, 0, 10))
    a.at(22, **fall)
    a.at(26, body=dict(loc=(0, 0.15, -1.22), rot=(10, 90, 0)))
    a.at(30, **fall)
    acts.append(a)
    return acts
