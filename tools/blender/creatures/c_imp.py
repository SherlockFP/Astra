"""Fire imp (small winged demon caster) with a fire orb on the right palm (grows + is thrown in Cast)."""
import math
from clib import Creature, Act, Part, sphere, limb, cone, box, poly, crystal, sym
import ptex as T

SKIN = T.R('#2a0606', '#561010', '#8a1c14', '#b8341c', '#e05a2a', '#ff9050')
BELLY = T.R('#5a1a0a', '#8a3416', '#b85a26', '#e08a40')
HORN = T.R('#120c0a', '#2e2420', '#5a4a3e', '#9a8a70', '#d8ccb0')
WING = T.R('#1a0404', '#3a0a08', '#5e1610', '#86261a')
EYE = T.R('#a06000', '#ffd030', '#fff8a0', '#ffffff')
FIRE = T.R('#801000', '#e03808', '#ff8a10', '#ffd040', '#fff8c0')
MOUTH = T.R('#100204', '#3a0a0c', '#6a1414')


def build():
    A = T.Atlas(64, 16, seed=41)
    A.paint('skin', T.pat_base, ramp=SKIN, lo=0.2, hi=0.85)
    A.paint('belly', T.pat_bands, ramp=BELLY, bands=3, lo=0.35, hi=0.9, line_dark=False)
    A.paint('horn', T.pat_bands, ramp=HORN, bands=3, lo=0.2, hi=0.95)
    A.paint('wing', T.pat_membrane, 2, 2, ramp=WING, veins=3, vein_col='#0c0202')
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.4)
    A.paint('fire', T.pat_glow, ramp=FIRE, core=0.2, noise=0.4)
    A.paint('mouth', T.pat_mouth, inner=MOUTH, n=3, rows='tb')

    parts = []
    # torso
    parts.append(sphere(0.26, 8, 5, center=(0, -0.03, 0.69), sx=1.05, sy=0.95, sz=0.85).set(tile='belly', bone='hips', uv='py'))
    parts.append(sphere(0.22, 8, 5, center=(0, 0.0, 0.96), sx=1.25, sy=0.85, sz=0.9).set(tile='skin', bone='spine', uv='cyl'))
    # head
    parts.append(sphere(0.2, 8, 5, center=(0, -0.04, 1.28), sx=1.05, sy=1.0, sz=0.95).set(tile='skin', bone='head', uv='cyl'))
    parts.append(box(0.19, 0.1, 0.075, center=(0, -0.19, 1.155), taper=(1.1, 1.0)).set(tile='mouth', bone='head', uv='py'))
    parts.append(cone((0, -0.2, 1.27), (0, -0.3, 1.24), 0.04, 3).set(tile='skin', bone='head'))
    for p in sym(box(0.075, 0.03, 0.04, center=(0.075, -0.215, 1.3)).rot(0, -14, 0, pivot=(0.075, -0.215, 1.3))
                 .set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    for p in sym(box(0.15, 0.06, 0.04, center=(0.07, -0.2, 1.355)).rot(0, -20, 0, pivot=(0.07, -0.2, 1.355))
                 .set(tile='skin', bone='head')):
        parts.append(p)
    for p in sym(limb((0.1, -0.02, 1.42), (0.19, 0.02, 1.52), 0.045, 0.032, 4).set(tile='horn', bone='head')):
        parts.append(p)
    for p in sym(cone((0.19, 0.02, 1.52), (0.25, 0.12, 1.6), 0.032, 4).set(tile='horn', bone='head')):
        parts.append(p)
    for p in sym(cone((0.17, 0.0, 1.29), (0.34, 0.06, 1.36), 0.045, 3).set(tile='skin', bone='head')):
        parts.append(p)
    # arms
    for p in sym(limb((0.27, 0, 1.05), (0.36, 0.02, 0.82), 0.055, 0.042, 5).set(tile='skin', bone='arm_l')):
        parts.append(p)
    for p in sym(limb((0.36, 0.02, 0.82), (0.38, -0.1, 0.63), 0.042, 0.036, 5).set(tile='skin', bone='fore_l')):
        parts.append(p)
    for p in sym(sphere(0.06, 5, 3, center=(0.385, -0.12, 0.6)).set(tile='skin', bone='fore_l')):
        parts.append(p)
    for dx in (-0.03, 0.0, 0.03):
        for p in sym(cone((0.385 + dx, -0.15, 0.58), (0.385 + dx * 1.5, -0.24, 0.53), 0.018, 3).set(tile='horn', bone='fore_l')):
            parts.append(p)
    # legs (digitigrade)
    for p in sym(limb((0.15, 0, 0.6), (0.17, -0.1, 0.36), 0.07, 0.05, 5).set(tile='skin', bone='leg_l')):
        parts.append(p)
    for p in sym(limb((0.17, -0.1, 0.36), (0.17, 0.05, 0.1), 0.05, 0.035, 4).set(tile='skin', bone='shin_l')):
        parts.append(p)
    for p in sym(box(0.11, 0.2, 0.07, center=(0.17, -0.02, 0.035), taper=(0.8, 0.7)).set(tile='skin', bone='shin_l')):
        parts.append(p)
    for dx in (-0.03, 0.03):
        for p in sym(cone((0.17 + dx, -0.11, 0.03), (0.17 + dx, -0.17, 0.0), 0.02, 3).set(tile='horn', bone='shin_l')):
            parts.append(p)
    # wings
    R0, E = (0.1, 0.16, 1.05), (0.48, 0.3, 1.4)
    T1, T2 = (0.76, 0.36, 1.24), (0.6, 0.42, 1.0)
    SC1, SC2 = (0.58, 0.36, 1.18), (0.38, 0.32, 0.97)
    mem = Part([E, T1, SC1, T2, SC2, R0], [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5)])
    parts += sym(mem.set(tile='wing', mat='main2s', uv='px', bone='wing_l', ao=(0.75, 1.0)))
    parts += sym(limb(R0, E, 0.025, 0.02, 3).set(tile='horn', bone='wing_l'))
    parts += sym(limb(E, T1, 0.018, 0.008, 3).set(tile='horn', bone='wing_l'))
    parts += sym(limb(E, T2, 0.018, 0.008, 3).set(tile='horn', bone='wing_l'))
    parts += sym(cone(E, (0.5, 0.28, 1.5), 0.02, 3).set(tile='horn', bone='wing_l'))
    # tail
    parts.append(limb((0, 0.2, 0.62), (0, 0.42, 0.48), 0.04, 0.03, 4).set(tile='skin', bone='tail_a'))
    parts.append(limb((0, 0.42, 0.48), (0, 0.62, 0.45), 0.03, 0.02, 4).set(tile='skin', bone='tail_b'))
    parts.append(crystal((0, 0.6, 0.45), (0, 0.8, 0.52), 0.07, 4, tip=0.6, base=0.25).scale(0.5, 1, 1, pivot=(0, 0.7, 0.48))
                 .set(tile='horn', bone='tail_b', uv='face'))
    # fire orb in the right palm
    orb = sphere(0.085, 6, 4, center=(-0.39, -0.16, 0.71)).set(tile='fire', mat='glow', bone='orb', uv='py', ao=(1, 1))
    parts.append(orb)
    parts.append(cone((-0.39, -0.16, 0.74), (-0.38, -0.15, 0.88), 0.06, 4).set(tile='fire', mat='glow', bone='orb', ao=(1, 1)))

    bones = [('root', (0, 0, 0), None), ('hips', (0, 0, 0.6), 'root'), ('spine', (0, 0, 0.85), 'hips'),
             ('head', (0, -0.02, 1.12), 'spine')]
    for s, sfx in ((1, '_l'), (-1, '_r')):
        bones += [('arm' + sfx, (0.27 * s, 0, 1.05), 'spine'), ('fore' + sfx, (0.36 * s, 0.02, 0.82), 'arm' + sfx),
                  ('leg' + sfx, (0.15 * s, 0, 0.6), 'hips'), ('shin' + sfx, (0.17 * s, -0.1, 0.36), 'leg' + sfx),
                  ('wing' + sfx, (0.1 * s, 0.16, 1.05), 'spine')]
    bones += [('tail_a', (0, 0.2, 0.62), 'hips'), ('tail_b', (0, 0.42, 0.48), 'tail_a'),
              ('orb', (-0.39, -0.16, 0.71), 'fore_r')]
    return Creature('imp_fire', bones, parts, A, make_anims(), emit=2.5,
                    meta={'bone_len': 0.06, 'doc': {'name_tr': 'Ateş Şeytancığı', 'emissive': 'eyes, fire orb in right palm (bone "orb")',
                                                     'use': 'ranged caster trash; spawn the fireball projectile at bone "orb" on Cast frame ~0.7'}})


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    base_arm = dict(arm_l=(-10, -12, 0), arm_r=(-10, 12, 0), fore_l=(-30, 0, 0), fore_r=(-45, 0, 0))

    a = Act('Idle', 40)
    a.wave('hips', lambda t: dict(loc=(0, 0, 0.02 * S(tau * t))), 2)
    a.wave('spine', lambda t: dict(rot=(4 + 2 * S(tau * t), 0, 0)), 2)
    a.wave('head', lambda t: dict(rot=(-4 - 2 * S(tau * t), 0, 8 * S(tau * t * 0.5 * 2 + 1)), ), 2)
    a.wave('wing_l', lambda t: dict(rot=(0, -12 * S(2 * tau * t), -8 * Cc(2 * tau * t))), 2)
    a.wave('wing_r', lambda t: dict(rot=(0, 12 * S(2 * tau * t), 8 * Cc(2 * tau * t))), 2)
    a.wave('tail_a', lambda t: dict(rot=(0, 0, 14 * S(tau * t))), 2)
    a.wave('tail_b', lambda t: dict(rot=(-10, 0, 18 * S(tau * t - 1))), 2)
    a.wave('orb', lambda t: dict(scl=1 + 0.15 * S(2 * tau * t)), 2)
    for b, r in base_arm.items():
        a.wave(b, lambda t, r=r: dict(rot=(r[0] + 3 * S(tau * t), r[1], r[2])), 4)
    acts.append(a)

    def walk(name, n, amp, lean, flap):
        a = Act(name, n)
        st = 1 if n < 20 else 2
        for s, sfx, ph in ((1, '_l', 0.0), (-1, '_r', 0.5)):
            a.wave('leg' + sfx, lambda t, ph=ph: dict(rot=(-amp * S(tau * (t + ph)), 0, 0)), st)
            a.wave('shin' + sfx, lambda t, ph=ph: dict(rot=(amp * 1.1 * max(0, Cc(tau * (t + ph))), 0, 0)), st)
            a.wave('arm' + sfx, lambda t, ph=ph, s=s: dict(rot=(amp * 0.8 * S(tau * (t + ph)), -12 * s, 0)), st)
            a.wave('fore' + sfx, lambda t: dict(rot=(-40, 0, 0)), 4)
            a.wave('wing' + sfx, lambda t, s=s: dict(rot=(0, -flap * S(2 * tau * t) * s, -10 * s)), st)
        a.wave('hips', lambda t: dict(loc=(0, 0, -0.03 * abs(S(tau * t))), rot=(0, 3 * S(tau * t), 0)), st)
        a.wave('spine', lambda t: dict(rot=(lean, 0, 5 * S(tau * t))), st)
        a.wave('head', lambda t: dict(rot=(-lean * 0.7, 0, -4 * S(tau * t))), st)
        a.wave('tail_a', lambda t: dict(rot=(lean * 0.5, 0, 12 * S(tau * t))), st)
        a.wave('tail_b', lambda t: dict(rot=(0, 0, 14 * S(tau * t - 1))), st)
        a.wave('orb', lambda t: dict(scl=1 + 0.12 * S(2 * tau * t)), st)
        return a
    acts.append(walk('Walk', 24, 26, 8, 14))
    acts.append(walk('Run', 16, 38, 20, 35))

    a = Act('Attack', 24, loop=False)
    wind = dict(spine=(-5, 0, 28), arm_l=(-115, -35, 0), fore_l=(-40, 0, 0), head=(0, 0, -10),
                arm_r=(-10, 12, 0), fore_r=(-45, 0, 0), wing_l=(0, -25, 0), wing_r=(0, 25, 0))
    swipe = dict(spine=(15, 0, -30), arm_l=(-70, 25, -30), fore_l=(-5, 0, 0), head=(5, 0, 12),
                 arm_r=(10, 12, 0), fore_r=(-45, 0, 0), wing_l=(0, -10, 0), wing_r=(0, 10, 0))
    a.at(8, **wind).at(12, **swipe).at(16, **swipe)
    a.rest(24, *wind.keys())
    acts.append(a)

    a = Act('Cast', 36, loop=False)
    gather = dict(arm_r=(-160, -10, 0), fore_r=(-20, 0, 0), arm_l=(-60, -40, 0), fore_l=(-50, 0, 0),
                  spine=(-12, 0, 8), head=(-15, 0, 0), wing_l=(0, -30, 0), wing_r=(0, 30, 0),
                  orb=dict(scl=2.2), hips=dict(loc=(0, 0, 0.04)))
    throw = dict(arm_r=(-70, 8, 0), fore_r=(-5, 0, 0), arm_l=(10, -20, 0), fore_l=(-40, 0, 0),
                 spine=(18, 0, -10), head=(5, 0, 0), wing_l=(0, -5, 10), wing_r=(0, 5, -10),
                 orb=dict(scl=2.6), hips=dict(loc=(0, -0.06, 0)))
    a.at(12, **gather).at(19, **dict(gather, orb=dict(scl=2.6)))
    a.at(24, **throw).at(26, orb=dict(scl=0.01)).at(30, orb=dict(scl=0.01))
    a.rest(36, *gather.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(spine=(-18, 0, 6), head=(-22, 0, 0), hips=dict(loc=(0, 0.1, 0)), wing_l=(0, -30, 0), wing_r=(0, 30, 0),
               arm_l=(10, -30, 0), arm_r=(10, 30, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 36, loop=False)
    a.at(8, spine=(-20, 0, 0), head=(-25, 0, 0), hips=dict(loc=(0, 0.05, 0.06)), arm_l=(-30, -50, 0), arm_r=(-30, 50, 0),
         wing_l=(0, -40, 0), wing_r=(0, 40, 0))
    down = dict(hips=dict(loc=(0, 0.42, -0.42), rot=(-82, 0, 0)), spine=(-5, 0, 0), head=(-15, 0, 20),
                arm_l=(-20, -60, 0), arm_r=(-20, 60, 0), fore_l=(-20, 0, 0), fore_r=(-20, 0, 0),
                leg_l=(-30, 0, 0), leg_r=(-50, 0, 0), shin_l=(-40, 0, 0), shin_r=(-20, 0, 0),
                wing_l=(0, 30, 0), wing_r=(0, -30, 0), tail_a=(0, 0, 30), orb=dict(scl=0.01))
    a.at(20, **down)
    a.at(25, hips=dict(loc=(0, 0.42, -0.36), rot=(-80, 0, 0)))
    a.at(36, **down)
    acts.append(a)
    return acts
