"""Stone golem (elite): chunky chamfered rock blocks, mossy tops, glowing rune + back crystals."""
import math
from clib import Creature, Act, rock, crystal, box, sym
import ptex as T

STONE = T.R('#1e1c22', '#36343a', '#4e4b4e', '#6a6662', '#8a847a', '#aaa496')
MOSS = T.R('#1a2a10', '#2e4a18', '#4a6e22', '#6e9230')
GLOW = T.R('#0a5a70', '#20b0d0', '#70f0ff', '#e0ffff')


def build():
    A = T.Atlas(64, 16, seed=31)
    A.paint('stone', T.pat_stone, ramp=STONE, cracks=3)
    A.paint('stone2', T.pat_stone, ramp=STONE, cracks=2, lo=0.15, hi=0.6)
    A.paint('moss', T.pat_stone, ramp=STONE, cracks=1, moss=MOSS, outline='lr')
    A.paint('rune', T.pat_rune, stone=STONE[:4], glow=GLOW)
    A.paint('eye', T.pat_glow, ramp=GLOW, core=0.5)
    A.paint('crys', T.pat_crystal, ramp=GLOW, outline='lr')

    def R(sx, sy, sz, c, bone, seed, tile='stone', top='moss', **kw):
        return rock(sx, sy, sz, center=c, seed=seed, **kw).set(tile=tile, tile_top=top, bone=bone, uv='face')

    parts = []
    for s, sfx in ((1, '_l'), (-1, '_r')):
        sd = 1 if s > 0 else 2
        parts.append(R(0.62, 0.82, 0.32, (0.42 * s, -0.06, 0.16), 'shin' + sfx, 10 + sd, tile='stone2', top='stone'))
        parts.append(R(0.52, 0.56, 0.6, (0.42 * s, 0.02, 0.6), 'shin' + sfx, 20 + sd, top='stone', taper=(0.9, 0.9)))
        parts.append(R(0.54, 0.58, 0.55, (0.42 * s, 0.0, 1.05), 'leg' + sfx, 30 + sd, top='stone'))
        # arms
        parts.append(R(0.58, 0.58, 0.85, (1.26 * s, 0.05, 2.2), 'arm' + sfx, 40 + sd, top='stone'))
        parts.append(R(0.64, 0.64, 0.75, (1.3 * s, 0.0, 1.45), 'fore' + sfx, 50 + sd, top='stone', taper=(0.85, 0.85)))
        parts.append(R(0.86, 0.82, 0.7, (1.32 * s, -0.05, 0.76), 'fore' + sfx, 60 + sd, tile='stone2', top='stone'))
        sh = R(0.9, 0.9, 0.78, (1.17 * s, 0.05, 2.76), 'spine', 70 + sd)
        parts.append(sh.rot(0, -12 * s, 0, pivot=(1.17 * s, 0.05, 2.76)))
    parts.append(R(1.15, 0.75, 0.45, (0, 0, 1.3), 'hips', 80, tile='stone2', top='stone'))
    parts.append(R(1.25, 0.85, 0.62, (0, 0, 1.76), 'spine', 81, taper=(1.15, 1.05)))
    parts.append(R(2.0, 1.15, 0.95, (0, 0.05, 2.46), 'spine', 82, taper=(1.0, 0.9)))
    parts.append(box(0.46, 0.08, 0.46, center=(0, -0.56, 2.38)).rot(0, 45, 0, pivot=(0, -0.56, 2.38))
                 .set(tile='rune', mat='glow', bone='spine', uv='py', ao=(1, 1)))
    # head
    parts.append(R(0.62, 0.62, 0.54, (0, -0.46, 3.1), 'head', 90))
    parts.append(R(0.7, 0.22, 0.15, (0, -0.76, 3.25), 'head', 91, bevel=0.3))
    parts.append(R(0.5, 0.3, 0.2, (0, -0.66, 2.86), 'head', 92, tile='stone2', top='stone'))
    for p in sym(box(0.13, 0.05, 0.07, center=(0.15, -0.785, 3.12)).set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    # glowing back / shoulder crystals (silhouette up to 3.5)
    for a, b, r in [((0, 0.4, 2.75), (0, 0.74, 3.5), 0.16), ((0.42, 0.42, 2.75), (0.62, 0.8, 3.3), 0.12),
                    ((-0.42, 0.42, 2.75), (-0.6, 0.78, 3.25), 0.12), ((1.25, 0.15, 3.0), (1.4, 0.3, 3.38), 0.09),
                    ((-1.25, 0.15, 3.0), (-1.38, 0.32, 3.34), 0.09)]:
        parts.append(crystal(a, b, r, 5).set(tile='crys', mat='glow', bone='spine', uv='face', ao=(0.9, 1)))

    bones = [('root', (0, 0, 0), None), ('hips', (0, 0, 1.25), 'root'), ('spine', (0, 0, 1.6), 'hips'),
             ('head', (0, -0.3, 2.85), 'spine')]
    for s, sfx in ((1, '_l'), (-1, '_r')):
        bones += [('arm' + sfx, (1.2 * s, 0.05, 2.65), 'spine'), ('fore' + sfx, (1.28 * s, 0.0, 1.82), 'arm' + sfx),
                  ('leg' + sfx, (0.42 * s, 0, 1.2), 'hips'), ('shin' + sfx, (0.42 * s, 0, 0.8), 'leg' + sfx)]
    return Creature('golem_stone', bones, parts, A, make_anims(), emit=2.0,
                    meta={'bone_len': 0.25, 'doc': {'name_tr': 'Taş Golem', 'emissive': 'chest rune, eyes, back/shoulder crystals (cyan)',
                                                     'use': 'elite / mini-boss bruiser, slow heavy hitter'}})


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    a = Act('Idle', 60)
    a.wave('spine', lambda t: dict(rot=(2 * S(tau * t), 0, 0)), 3)
    a.wave('hips', lambda t: dict(loc=(0, 0, -0.02 + 0.02 * S(tau * t))), 3)
    a.wave('head', lambda t: dict(rot=(-2 * S(tau * t), 0, 6 * S(tau * t * 0.5 * 2))), 3)
    a.wave('arm_l', lambda t: dict(rot=(3 * S(tau * t + 0.5), 0, 0)), 3)
    a.wave('arm_r', lambda t: dict(rot=(3 * S(tau * t + 1.5), 0, 0)), 3)
    a.wave('fore_l', lambda t: dict(rot=(-8 - 2 * S(tau * t), 0, 0)), 3)
    a.wave('fore_r', lambda t: dict(rot=(-8 - 2 * S(tau * t + 1), 0, 0)), 3)
    acts.append(a)

    def walk(name, n, amp, lean, bob, arm):
        a = Act(name, n)
        for s, sfx, ph in ((1, '_l', 0.0), (-1, '_r', 0.5)):
            a.wave('leg' + sfx, lambda t, ph=ph: dict(rot=(-amp * S(tau * (t + ph)), 0, 0)), 2)
            a.wave('shin' + sfx, lambda t, ph=ph: dict(rot=(amp * 1.5 * max(0, Cc(tau * (t + ph))) ** 1.5, 0, 0)), 2)
            a.wave('arm' + sfx, lambda t, ph=ph: dict(rot=(arm * S(tau * (t + ph)), 0, 0)), 2)
            a.wave('fore' + sfx, lambda t, ph=ph: dict(rot=(-12 - 6 * S(tau * (t + ph)), 0, 0)), 2)
        a.wave('hips', lambda t: dict(loc=(0, 0, -bob * abs(S(tau * t + 0.3))), rot=(0, 4 * S(tau * t), 0)), 2)
        a.wave('spine', lambda t: dict(rot=(lean, -3 * S(tau * t), 6 * S(tau * t))), 2)
        a.wave('head', lambda t: dict(rot=(-lean * 0.6, 2 * S(tau * t), -4 * S(tau * t))), 2)
        return a
    acts.append(walk('Walk', 42, 20, 4, 0.08, 16))
    acts.append(walk('Run', 26, 30, 12, 0.14, 28))

    a = Act('Attack', 39, loop=False)
    raise_ = dict(arm_l=(-165, -12, 0), arm_r=(-165, 12, 0), fore_l=(-25, 0, 0), fore_r=(-25, 0, 0),
                  spine=(-14, 0, 0), head=(-12, 0, 0), hips=dict(loc=(0, 0.05, 0.04)),
                  leg_l=(0, 0, 0), leg_r=(0, 0, 0), shin_l=(0, 0, 0), shin_r=(0, 0, 0))
    smash = dict(arm_l=(-45, 6, 0), arm_r=(-45, -6, 0), fore_l=(-15, 0, 0), fore_r=(-15, 0, 0),
                 spine=(32, 0, 0), head=(-8, 0, 0), hips=dict(loc=(0, -0.1, -0.25)),
                 leg_l=(-22, 0, 0), leg_r=(-22, 0, 0), shin_l=(38, 0, 0), shin_r=(38, 0, 0))
    a.at(14, **raise_).at(20, **smash).at(27, **smash)
    a.rest(39, *raise_.keys())
    acts.append(a)

    a = Act('Attack2', 33, loop=False)
    wind = dict(spine=(-4, 0, -38), arm_r=(-40, 50, -30), fore_r=(-40, 0, 0), arm_l=(10, -10, 0),
                head=(0, 0, 20), hips=dict(rot=(0, 0, -10)))
    swing = dict(spine=(8, 0, 42), arm_r=(-85, -10, 20), fore_r=(-10, 0, 0), arm_l=(20, -15, 0),
                 head=(0, 0, -20), hips=dict(rot=(0, 0, 12)))
    a.at(11, **wind).at(17, **swing).at(23, **swing)
    a.rest(33, *wind.keys())
    acts.append(a)

    a = Act('Hit', 15, loop=False)
    hit = dict(spine=(-12, 0, 5), head=(-16, 0, 0), hips=dict(loc=(0, 0.16, 0)), arm_l=(10, -12, 0), arm_r=(10, 12, 0))
    a.at(4, **hit)
    a.rest(15, *hit.keys())
    acts.append(a)

    a = Act('Death', 54, loop=False)
    a.at(10, spine=(-16, 0, 0), head=(-20, 0, 0), hips=dict(loc=(0, 0.12, 0)), arm_l=(10, -15, 0), arm_r=(10, 15, 0))
    kneel = dict(hips=dict(loc=(0, -0.15, -0.5), rot=(0, 0, 0)), leg_l=(-70, 0, 0), leg_r=(-70, 0, 0),
                 shin_l=(105, 0, 0), shin_r=(105, 0, 0), spine=(18, 0, 0), head=(20, 0, 0),
                 arm_l=(-10, -5, 0), arm_r=(-10, 5, 0), fore_l=(0, 0, 0), fore_r=(0, 0, 0))
    a.at(24, **kneel)
    down = dict(hips=dict(loc=(0, -0.55, -0.82), rot=(78, 0, 0)), leg_l=(-150, 0, 0), leg_r=(-150, 0, 0),
                shin_l=(70, 0, 0), shin_r=(70, 0, 0), spine=(8, 0, 0), head=(-20, 0, 15),
                arm_l=(-30, -25, 0), arm_r=(-30, 25, 0), fore_l=(0, 0, 0), fore_r=(0, 0, 0))
    a.at(40, **down)
    a.at(45, hips=dict(loc=(0, -0.55, -0.76), rot=(76, 0, 0)))
    a.at(54, **down)
    acts.append(a)
    return acts
