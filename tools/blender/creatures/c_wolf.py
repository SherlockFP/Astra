"""Dire wolf: quadruped with lofted torso, hackle spikes, 2-bone legs, bushy tail, biting jaw."""
import math
from clib import Creature, Act, loft, limb, cone, box, sphere, wgrad, sym
import ptex as T

FUR = T.R('#0e0e12', '#1e1e26', '#32323c', '#4a4a54', '#686870', '#8c8c90')
FUR2 = T.R('#2a2a30', '#4a4a50', '#6e6e70', '#94948e', '#bcb8ac')
DARK = T.R('#08080a', '#16161c', '#26262e', '#383842')
EYE = T.R('#904000', '#ff9a10', '#ffe060', '#ffffff')
NOSE = T.R('#050506', '#14141a', '#2a2a34')
MOUTH = T.R('#100406', '#3a0c10', '#6a1a1e')


def build():
    A = T.Atlas(64, 16, seed=71)
    A.paint('body', T.pat_fur, 2, 1, ramp=FUR, lo=0.95, hi=0.2, streaks=40)
    A.paint('fur', T.pat_fur, ramp=FUR, lo=0.25, hi=0.8)
    A.paint('light', T.pat_fur, ramp=FUR2, lo=0.25, hi=0.85, streaks=18)
    A.paint('dark', T.pat_fur, ramp=DARK, lo=0.2, hi=0.9, streaks=14)
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.4)
    A.paint('nose', T.pat_solid, ramp=NOSE, t=0.5)
    A.paint('mouth', T.pat_mouth, inner=MOUTH, n=4, rows='t', teeth='#ece6d0')

    parts = []
    torso = loft([(-0.84, 0, 0.95, 0, 0), (-0.74, 0, 0.95, 0.22, 0.27), (-0.48, 0, 0.93, 0.29, 0.33),
                  (-0.12, 0, 0.9, 0.24, 0.27), (0.3, 0, 0.88, 0.21, 0.22), (0.6, 0, 0.9, 0.23, 0.23), (0.8, 0, 0.93, 0, 0)], 8)
    parts.append(torso.set(tile='body', uv='cyly', wfn=wgrad('chest', 'body', 1, -0.4, 0.05), ao=(0.7, 1.0)))
    # hackles / ruff
    for a, b, r in [((0, -0.62, 1.12), (0, -0.48, 1.34), 0.1), ((0, -0.4, 1.14), (0, -0.24, 1.3), 0.09),
                    ((0, -0.16, 1.08), (0, 0.0, 1.2), 0.08)]:
        parts.append(cone(a, b, r, 4).set(tile='dark', bone='chest' if a[1] < -0.3 else 'body'))
    for p in sym(cone((0.2, -0.66, 0.98), (0.34, -0.56, 1.1), 0.09, 4).set(tile='dark', bone='chest')):
        parts.append(p)
    for p in sym(cone((0.18, -0.74, 0.82), (0.26, -0.7, 0.66), 0.08, 4).set(tile='light', bone='chest')):
        parts.append(p)
    # neck + head
    parts.append(limb((0, -0.66, 0.98), (0, -0.95, 1.1), 0.17, 0.14, 6).set(tile='fur', bone='neck', uv='box'))
    parts.append(box(0.32, 0.32, 0.27, center=(0, -1.02, 1.14), taper=(0.82, 0.85)).set(tile='fur', bone='head', uv='box'))
    parts.append(box(0.17, 0.32, 0.13, center=(0, -1.29, 1.115), taper=(0.75, 1.0)).set(tile='light', bone='head', uv='box'))
    parts.append(box(0.07, 0.06, 0.05, center=(0, -1.45, 1.165)).set(tile='nose', bone='head', uv='box'))
    parts.append(box(0.15, 0.26, 0.05, center=(0, -1.27, 1.03), taper=(0.8, 1.0)).set(tile='mouth', tile_top='mouth', bone='jaw', uv='pz'))
    for p in sym(cone((0.1, -0.98, 1.24), (0.13, -0.93, 1.4), 0.065, 3, phase=0.4).set(tile='dark', bone='head')):
        parts.append(p)
    for p in sym(box(0.06, 0.03, 0.03, center=(0.095, -1.18, 1.2)).rot(0, -15, 20, pivot=(0.095, -1.18, 1.2))
                 .set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    # legs
    for p in sym(limb((0.18, -0.55, 0.92), (0.19, -0.5, 0.48), 0.12, 0.085, 5).set(tile='fur', bone='fl_l')):
        parts.append(p)
    for p in sym(limb((0.19, -0.5, 0.48), (0.19, -0.56, 0.08), 0.075, 0.06, 4).set(tile='fur', bone='fl2_l')):
        parts.append(p)
    for p in sym(box(0.13, 0.19, 0.08, center=(0.19, -0.6, 0.04), taper=(0.8, 0.7)).set(tile='dark', bone='fl2_l')):
        parts.append(p)
    for p in sym(limb((0.18, 0.52, 0.94), (0.19, 0.4, 0.52), 0.14, 0.08, 5).set(tile='fur', bone='hl_l')):
        parts.append(p)
    for p in sym(limb((0.19, 0.4, 0.52), (0.19, 0.62, 0.24), 0.08, 0.06, 4).set(tile='fur', bone='hl2_l')):
        parts.append(p)
    for p in sym(limb((0.19, 0.62, 0.24), (0.19, 0.58, 0.06), 0.06, 0.055, 4).set(tile='fur', bone='hl2_l')):
        parts.append(p)
    for p in sym(box(0.13, 0.19, 0.08, center=(0.19, 0.52, 0.04), taper=(0.8, 0.7)).set(tile='dark', bone='hl2_l')):
        parts.append(p)
    # tail
    parts.append(limb((0, 0.74, 0.97), (0, 1.0, 0.88), 0.08, 0.12, 5).set(tile='fur', bone='tail_a'))
    parts.append(limb((0, 1.0, 0.88), (0, 1.3, 0.68), 0.12, 0.02, 5, mid=[(0.4, 0.1)]).set(tile='dark', bone='tail_b'))

    bones = [('root', (0, 0, 0), None), ('body', (0, 0.1, 0.9), 'root'), ('chest', (0, -0.45, 0.95), 'body'),
             ('neck', (0, -0.72, 1.0), 'chest'), ('head', (0, -0.95, 1.12), 'neck'), ('jaw', (0, -1.12, 1.07), 'head'),
             ('tail_a', (0, 0.76, 0.97), 'body'), ('tail_b', (0, 1.0, 0.88), 'tail_a')]
    for s, sfx in ((1, '_l'), (-1, '_r')):
        bones += [('fl' + sfx, (0.18 * s, -0.55, 0.9), 'chest'), ('fl2' + sfx, (0.19 * s, -0.5, 0.48), 'fl' + sfx),
                  ('hl' + sfx, (0.18 * s, 0.52, 0.92), 'body'), ('hl2' + sfx, (0.19 * s, 0.4, 0.52), 'hl' + sfx)]
    return Creature('wolf_dire', bones, parts, A, make_anims(), emit=2.5,
                    meta={'bone_len': 0.1, 'doc': {'name_tr': 'Dehşet Kurdu', 'emissive': 'eyes (amber)',
                                                    'use': 'fast pack melee trash (outdoor / cave approach floors)'}})


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []

    a = Act('Idle', 60)
    a.wave('chest', lambda t: dict(rot=(1.5 * S(tau * t), 0, 0), scl=(1 + 0.02 * S(tau * t), 1, 1 + 0.02 * S(tau * t))), 3)
    a.wave('head', lambda t: dict(rot=(4 * S(tau * t), 0, 12 * S(tau * t * 0.5 * 2 + 0.5) * 0.8)), 3)
    a.wave('jaw', lambda t: dict(rot=(6 + 5 * S(4 * tau * t), 0, 0)), 2)
    a.wave('tail_a', lambda t: dict(rot=(-5, 0, 10 * S(2 * tau * t))), 2)
    a.wave('tail_b', lambda t: dict(rot=(5, 0, 14 * S(2 * tau * t - 1))), 2)
    acts.append(a)

    def gait(name, n, amp, phases, bob, flex, lean=0.0):
        a = Act(name, n)
        st = 1 if n < 24 else 2
        for leg, ph in phases.items():
            up, low = leg, leg.replace('fl', 'fl2').replace('hl', 'hl2')
            front = leg.startswith('fl')
            a.wave(up, lambda t, ph=ph: dict(rot=(-amp * S(tau * (t + ph)), 0, 0)), st)
            k = 1.6 if front else 1.1
            a.wave(low, lambda t, ph=ph, k=k: dict(rot=(amp * k * max(0, Cc(tau * (t + ph))), 0, 0)), st)
        a.wave('body', lambda t: dict(loc=(0, 0, bob * S(2 * tau * t)), rot=(-flex * S(tau * t), 0, 0)), st)
        a.wave('chest', lambda t: dict(rot=(flex * S(tau * t) + lean, 0, 0)), st)
        a.wave('neck', lambda t: dict(rot=(-flex * 0.8 * S(tau * t) - lean, 0, 0)), st)
        a.wave('head', lambda t: dict(rot=(-3 * S(2 * tau * t), 0, 0)), st)
        a.wave('jaw', lambda t: dict(rot=(8 if n < 24 else 3, 0, 0)), 4)
        a.wave('tail_a', lambda t: dict(rot=(-10 - flex * S(tau * t), 0, 8 * S(tau * t))), st)
        a.wave('tail_b', lambda t: dict(rot=(8, 0, 10 * S(tau * t - 1))), st)
        return a
    acts.append(gait('Walk', 32, 22, {'hl_l': 0.0, 'fl_l': 0.25, 'hl_r': 0.5, 'fl_r': 0.75}, 0.025, 1.5))
    acts.append(gait('Run', 18, 38, {'fl_l': 0.0, 'fl_r': 0.1, 'hl_l': 0.5, 'hl_r': 0.6}, 0.07, 8, lean=2))

    a = Act('Attack', 27, loop=False)
    crouch = dict(body=dict(loc=(0, 0.1, -0.12), rot=(0, 0, 0)), chest=(8, 0, 0), neck=(-6, 0, 0), head=(-12, 0, 0),
                  jaw=(28, 0, 0), hl_l=(-25, 0, 0), hl_r=(-25, 0, 0), hl2_l=(25, 0, 0), hl2_r=(25, 0, 0),
                  fl_l=(10, 0, 0), fl_r=(10, 0, 0), fl2_l=(0, 0, 0), fl2_r=(0, 0, 0), tail_a=(-20, 0, 0))
    lunge = dict(body=dict(loc=(0, -0.6, 0.1), rot=(-8, 0, 0)), chest=(-4, 0, 0), neck=(-10, 0, 0), head=(-12, 0, 0),
                 jaw=(38, 0, 0), hl_l=(40, 0, 0), hl_r=(40, 0, 0), hl2_l=(0, 0, 0), hl2_r=(0, 0, 0),
                 fl_l=(-55, 0, 0), fl_r=(-50, 0, 0), fl2_l=(20, 0, 0), fl2_r=(25, 0, 0), tail_a=(10, 0, 0))
    bite = dict(lunge, jaw=(0, 0, 0), head=(14, 0, 0), body=dict(loc=(0, -0.62, 0.0), rot=(0, 0, 0)))
    a.at(7, **crouch).at(12, **lunge).at(15, **bite).at(19, **dict(bite, body=dict(loc=(0, -0.42, 0), rot=(0, 0, 0))))
    a.rest(27, *crouch.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(body=dict(loc=(0, 0.12, 0.02)), chest=(-10, 0, 0), head=(-20, 0, 10), jaw=(20, 0, 0), tail_a=(-25, 0, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 40, loop=False)
    a.at(8, head=(-30, 0, 0), chest=(-10, 0, 0), jaw=(30, 0, 0), body=dict(loc=(0, 0.05, 0.05)))
    flop = dict(body=dict(loc=(0, 0.0, -0.58), rot=(0, 86, 0)), chest=(0, 4, 0), neck=(10, 0, 0),
                head=(10, 25, 0), jaw=(18, 0, 0),
                fl_l=(-20, 0, 0), fl_r=(-35, 0, 0), fl2_l=(25, 0, 0), fl2_r=(15, 0, 0),
                hl_l=(15, 0, 0), hl_r=(-5, 0, 0), hl2_l=(10, 0, 0), hl2_r=(20, 0, 0), tail_a=(0, 0, 0), tail_b=(0, 0, 0))
    a.at(22, **flop)
    a.at(27, body=dict(loc=(0, 0.0, -0.53), rot=(0, 84, 0)))
    a.at(40, **flop)
    acts.append(a)
    return acts
