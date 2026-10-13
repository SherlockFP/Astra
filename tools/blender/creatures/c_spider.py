"""Giant cave spider: 8 legs (2 bones each), fangs, glowing eye cluster."""
import math
from clib import Creature, Act, sphere, limb, cone, box, sym
import ptex as T

CHITIN = T.R('#0e080c', '#22121c', '#3a2030', '#583248', '#7e4c62', '#a87488')
MARK = T.R('#5a0a0a', '#a01c14', '#e04420', '#ff8a40')
EYE = T.R('#7a0808', '#ff2a1a', '#ff8a60', '#fff0e0')
FANG = T.R('#1a0c08', '#4a2a1a', '#8a6a4a', '#d8c8a0')

LEG_ROOT_Y = [-0.52, -0.38, -0.24, -0.1]
LEG_ANG = [-58, -24, 16, 48]        # top view, degrees from +X (negative = forward)


def pat_abdomen(ctx):
    rgb = T.pat_base(ctx, CHITIN, lo=0.15, hi=0.65, noise=0.15, low=0.3)
    u, v = ctx['u'], ctx['v']
    # chevrons down the centre line (u = x, v = front->back flipped)
    for k in range(3):
        y0 = 0.25 + k * 0.2
        m = (abs(abs(u - 0.5) * 1.3 - (v - y0)) < 0.045) & (abs(u - 0.5) < 0.28)
        rgb[m] = T.quant(0.5 + (T.white(ctx) - 0.5) * 0.6, MARK, ctx)[m]
    dot = (abs(u - 0.5) < 0.07) & (v > 0.12) & (v < 0.2)
    rgb[dot] = MARK[2]
    return rgb


def build():
    A = T.Atlas(64, 16, seed=11)
    A.paint('body', T.pat_base, ramp=CHITIN, lo=0.2, hi=0.8, outline='b', hilite=True)
    A.paint('abd', pat_abdomen, 2, 2)
    A.paint('leg', T.pat_bands, ramp=CHITIN[1:], bands=3, lo=0.15, hi=0.85)
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.3)
    A.paint('fang', T.pat_base, ramp=FANG, lo=0.1, hi=0.95, outline='lr')

    parts = []
    parts.append(sphere(1.0, 8, 5, center=(0, -0.32, 0.62), sx=0.36, sy=0.42, sz=0.26).set(tile='body', bone='body', uv='box'))
    ab = sphere(1.0, 10, 6, center=(0, 0.5, 0.76), sx=0.56, sy=0.68, sz=0.42)
    ab.rot(-12, 0, 0, pivot=(0, 0.1, 0.7))
    parts.append(ab.set(tile='abd', bone='abdomen', uv='pz', ao=(0.6, 1.0)))
    parts.append(limb((0, -0.05, 0.62), (0, 0.18, 0.7), 0.1, 0.12, 6).set(tile='body', bone='body'))
    # head / eyes
    eyes = [(0.075, -0.71, 0.72, 0.06), (0.17, -0.65, 0.74, 0.045), (0.05, -0.66, 0.81, 0.04), (0.14, -0.6, 0.83, 0.035)]
    for x, y, z, s in eyes:
        e = box(s, s * 0.7, s).rot(0, 45, 0).move(x, y, z)
        parts += sym(e.set(tile='eye', mat='glow', bone='body', uv='face', ao=(1, 1)))
    # chelicerae + fangs
    for p in sym(limb((0.1, -0.64, 0.58), (0.09, -0.76, 0.42), 0.07, 0.05, 5).set(tile='body', bone='fang_l')):
        parts.append(p)
    for p in sym(cone((0.09, -0.76, 0.43), (0.06, -0.8, 0.27), 0.035, 4).set(tile='fang', bone='fang_l', uv='box')):
        parts.append(p)
    # pedipalps
    for p in sym(limb((0.18, -0.6, 0.55), (0.27, -0.82, 0.48), 0.035, 0.03, 4).set(tile='leg', bone='body')):
        parts.append(p)
    for p in sym(limb((0.27, -0.82, 0.48), (0.25, -0.9, 0.25), 0.03, 0.02, 4).set(tile='leg', bone='body')):
        parts.append(p)
    # legs
    bones = [('root', (0, 0, 0), None), ('body', (0, -0.1, 0.62), 'root'),
             ('abdomen', (0, 0.12, 0.72), 'body'),
             ('fang_l', (0.1, -0.64, 0.58), 'body'), ('fang_r', (-0.1, -0.64, 0.58), 'body')]
    for i, (ry, ang) in enumerate(zip(LEG_ROOT_Y, LEG_ANG), 1):
        a = math.radians(ang)
        d = (math.cos(a), math.sin(a))
        root = (0.26, ry, 0.62)
        knee = (0.26 + 0.72 * d[0], ry + 0.72 * d[1], 1.06)
        tip = (0.26 + 1.24 * d[0], ry + 1.24 * d[1], 0.0)
        femur = limb(root, knee, 0.065, 0.05, 4).set(tile='leg', bone='leg%d_l' % i)
        tibia = limb(knee, tip, 0.05, 0.012, 4, mid=[(0.15, 0.055)]).set(tile='leg', bone='knee%d_l' % i)
        parts += sym(femur) + sym(tibia)
        for s, sfx in ((1, '_l'), (-1, '_r')):
            bones.append(('leg%d%s' % (i, sfx), (root[0] * s, root[1], root[2]), 'body'))
            bones.append(('knee%d%s' % (i, sfx), (knee[0] * s, knee[1], knee[2]), 'leg%d%s' % (i, sfx)))
    acts = make_anims()
    return Creature('spider_giant', bones, parts, A, acts, emit=2.5,
                    meta={'bone_len': 0.1, 'doc': {'name_tr': 'Dev Örümcek', 'emissive': 'eye cluster (8 red eyes)',
                                                    'use': 'fast melee trash / elite in caves & webbed crypts'}})


def leg_names(i, s):
    sfx = '_l' if s > 0 else '_r'
    return 'leg%d%s' % (i, sfx), 'knee%d%s' % (i, sfx)


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    groupA = {(1, 1), (2, -1), (3, 1), (4, -1)}

    def gait(name, n, amp, lift, bob, lean=0.0, drop=0.0):
        a = Act(name, n)
        for i in range(1, 5):
            for s in (1, -1):
                off = 0.0 if (i, s) in groupA else 0.5
                fem, kn = leg_names(i, s)

                def ffem(t, off=off, s=s):
                    # p in [0, .5): swing forward with lift, [.5, 1): stance pushing back
                    p = (t + off) % 1.0
                    lf = max(0.0, S(tau * p)) * lift
                    return dict(rot=(0, -lf * s, s * amp * Cc(tau * p)))

                def fkn(t, off=off, s=s):
                    p = (t + off) % 1.0
                    lf = max(0.0, S(tau * p)) * lift
                    return dict(rot=(0, lf * 0.7 * s, 0))
                a.wave(fem, ffem, 1 if n < 20 else 2)
                a.wave(kn, fkn, 1 if n < 20 else 2)
        a.wave('body', lambda t: dict(loc=(0, 0, bob * S(2 * tau * t) - drop), rot=(lean, 0, 2 * S(tau * t))), 1 if n < 20 else 2)
        a.wave('abdomen', lambda t: dict(rot=(3 * S(2 * tau * t + 1), 0, -4 * S(tau * t))), 2)
        return a

    a = Act('Idle', 60)
    a.wave('body', lambda t: dict(loc=(0, 0, 0.02 * S(tau * t)), rot=(1.5 * S(tau * t), 0, 0)), 3)
    a.wave('abdomen', lambda t: dict(scl=(1 + 0.03 * S(tau * t), 1 + 0.03 * S(tau * t), 1 + 0.04 * S(tau * t)),
                                     rot=(-2 * S(tau * t), 0, 2 * S(tau * t * 2))), 3)
    a.wave('fang_l', lambda t: dict(rot=(0, 6 * max(0, S(tau * t * 3)), 0)), 2)
    a.wave('fang_r', lambda t: dict(rot=(0, -6 * max(0, S(tau * t * 3)), 0)), 2)
    # front legs tap
    a.wave('leg1_l', lambda t: dict(rot=(0, -12 * max(0, S(tau * t * 2)) ** 3, 0)), 2)
    a.wave('leg1_r', lambda t: dict(rot=(0, 12 * max(0, S(tau * t * 2 + 2.2)) ** 3, 0)), 2)
    acts.append(a)
    acts.append(gait('Walk', 30, 16, 26, 0.03))
    acts.append(gait('Run', 16, 22, 32, 0.05, lean=6, drop=0.06))

    a = Act('Attack', 30, loop=False)
    up = dict(body=dict(rot=(-24, 0, 0), loc=(0, 0.05, 0.16)),
              leg1_l=(0, -55, 25), leg1_r=(0, 55, -25), knee1_l=(0, -20, 0), knee1_r=(0, 20, 0),
              leg2_l=(0, -30, 10), leg2_r=(0, 30, -10),
              fang_l=(0, 28, 0), fang_r=(0, -28, 0), abdomen=(14, 0, 0))
    strike = dict(body=dict(rot=(18, 0, 0), loc=(0, -0.32, -0.06)),
                  leg1_l=(0, 8, -20), leg1_r=(0, -8, 20), knee1_l=(0, 10, 0), knee1_r=(0, -10, 0),
                  leg2_l=(0, 0, -8), leg2_r=(0, 0, 8),
                  fang_l=(0, -12, 0), fang_r=(0, 12, 0), abdomen=(-8, 0, 0))
    a.at(10, **up).at(15, **strike).at(19, **strike)
    a.rest(30, *up.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(body=dict(rot=(-12, 0, 6), loc=(0, 0.12, 0.04)), abdomen=(8, 0, 0),
               leg1_l=(0, -15, 0), leg1_r=(0, 15, 0), fang_l=(0, 15, 0), fang_r=(0, -15, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 40, loop=False)
    a.at(7, body=dict(rot=(-14, 0, 0), loc=(0, 0, 0.16)), abdomen=(10, 0, 0))
    curl = {}
    for i in range(1, 5):
        for s in (1, -1):
            fem, kn = leg_names(i, s)
            curl[fem] = (0, -38 * s, 0)
            curl[kn] = (0, 105 * s, 0)
    a.at(7, **{k: (v[0], v[1] * 0.3, v[2]) for k, v in curl.items()})
    a.at(20, body=dict(rot=(6, 0, 8), loc=(0, 0, -0.34)), abdomen=(-6, 0, 0), fang_l=(0, 20, 0), fang_r=(0, -20, 0), **curl)
    a.at(26, body=dict(rot=(4, 0, 8), loc=(0, 0, -0.3)))
    a.at(40, body=dict(rot=(6, 0, 8), loc=(0, 0, -0.34)), abdomen=(-6, 0, 0), fang_l=(0, 20, 0), fang_r=(0, -20, 0), **curl)
    acts.append(a)
    return acts
