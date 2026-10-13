"""Mushroom brute: stubby fungal bruiser with a huge spotted cap; Cast = spore burst."""
import math
from clib import Creature, Act, lathe, sphere, limb, cone, box, sym
import ptex as T

CAP = T.R('#3a0808', '#6a1010', '#9a1c16', '#c83a22', '#e86a3a')
SPOT = T.R('#b8a888', '#e8dcc0', '#fff8e8')
STALK = T.R('#4a3a2a', '#7a644a', '#a88e6a', '#cdb48a', '#ead6ae')
GILL = T.R('#3a2418', '#6a4a32', '#9a7650', '#c0a070')
EYE = T.R('#507000', '#b0f020', '#f0ff90', '#ffffff')
MOUTH = T.R('#0c0604', '#2a140a', '#4a2414')
MOSS = T.R('#1a2a10', '#2e4a18', '#4a6e22', '#6e9230')


def pat_stalk(ctx):
    t = T.field(ctx, 0.25, 0.85, 0.1, 0.2, 2) + 0.18 * ((ctx['ix'] % 3) == 0) * -1
    rgb = T.quant(t, STALK, ctx, 0.7)
    return T.border(rgb, STALK[0], 'b')


def build():
    A = T.Atlas(64, 16, seed=61)
    A.paint('cap', T.pat_spots, 2, 2, ramp=CAP, spot_ramp=SPOT, n=9, rmin=2.0, rmax=4.0)
    A.paint('stalk', pat_stalk)
    A.paint('gill', T.pat_gills, ramp=GILL, lines=8)
    A.paint('eye', T.pat_glow, ramp=EYE, core=0.4)
    A.paint('mouth', T.pat_mouth, inner=MOUTH, n=5, rows='tb', teeth='#e8e0b0')
    A.paint('moss', T.pat_fur, ramp=MOSS, streaks=20)

    parts = []
    stalk = lathe([(0.0, 0.34), (0.4, 0.34), (0.48, 0.6), (0.5, 0.85), (0.45, 1.15), (0.4, 1.38), (0.0, 1.4)], 10)
    parts.append(stalk.set(tile='stalk', bone='body', uv='cyl', ao=(0.65, 1.0)))

    def capv(ri, si, p):
        a = math.atan2(p.y, p.x)
        if ri in (2, 3):
            k = 1 + 0.05 * math.sin(5 * a + 0.4)
            return (p.x * k, p.y * k, p.z + 0.03 * math.sin(3 * a))
        return p
    cap = lathe([(0.0, 1.27), (0.38, 1.28), (0.92, 1.32), (0.97, 1.45), (0.88, 1.68), (0.66, 1.9), (0.34, 2.04), (0.0, 2.08)], 12, vfn=capv)
    parts.append(cap.set(tile='cap', tile_bottom='gill', uv='pz', uv_bottom='cyl', bone='cap', ao=(0.75, 1.0)))
    # little mushrooms sprouting on the cap
    for (x, y, z, s) in [(0.42, 0.22, 1.8, 1.0), (-0.3, 0.38, 1.82, 0.75), (0.1, 0.5, 1.84, 0.6)]:
        parts.append(limb((x, y, z), (x * 1.05, y * 1.05, z + 0.16 * s), 0.035 * s, 0.03 * s, 4).set(tile='stalk', bone='cap'))
        parts.append(lathe([(0.0, 0.0), (0.1 * s, 0.0), (0.09 * s, 0.05 * s), (0.0, 0.09 * s)], 6,
                           center=(x * 1.05, y * 1.05, z + 0.15 * s)).set(tile='cap', uv='pz', bone='cap'))
    # face
    for p in sym(box(0.16, 0.06, 0.09, center=(0.18, -0.475, 1.02)).rot(0, -18, 0, pivot=(0.18, -0.475, 1.02))
                 .set(tile='eye', mat='glow', bone='body', uv='face', ao=(1, 1))):
        parts.append(p)
    for p in sym(box(0.22, 0.08, 0.06, center=(0.17, -0.47, 1.12)).rot(0, -22, 0, pivot=(0.17, -0.47, 1.12)).set(tile='stalk', bone='body')):
        parts.append(p)
    parts.append(box(0.4, 0.08, 0.14, center=(0, -0.495, 0.8), taper=(1.1, 1.0)).set(tile='mouth', bone='body', uv='py', ao=(1, 1)))
    # arms
    for p in sym(limb((0.44, 0, 1.12), (0.62, 0.02, 0.8), 0.12, 0.1, 6).set(tile='stalk', bone='arm_l')):
        parts.append(p)
    for p in sym(limb((0.62, 0.02, 0.8), (0.67, -0.08, 0.52), 0.1, 0.12, 6).set(tile='stalk', bone='fore_l')):
        parts.append(p)
    for p in sym(sphere(0.16, 6, 4, center=(0.68, -0.1, 0.44), sz=0.9).set(tile='moss', bone='fore_l', uv='box')):
        parts.append(p)
    # legs
    for p in sym(limb((0.26, 0, 0.44), (0.28, -0.02, 0.1), 0.14, 0.16, 6).set(tile='stalk', bone='leg_l')):
        parts.append(p)
    for p in sym(sphere(0.19, 6, 3, center=(0.28, -0.07, 0.07), sx=1.0, sy=1.25, sz=0.45).set(tile='moss', bone='leg_l', uv='box')):
        parts.append(p)

    bones = [('root', (0, 0, 0), None), ('hips', (0, 0, 0.42), 'root'), ('body', (0, 0, 0.8), 'hips'),
             ('cap', (0, 0, 1.3), 'body')]
    for s, sfx in ((1, '_l'), (-1, '_r')):
        bones += [('arm' + sfx, (0.44 * s, 0, 1.12), 'body'), ('fore' + sfx, (0.62 * s, 0.02, 0.8), 'arm' + sfx),
                  ('leg' + sfx, (0.26 * s, 0, 0.44), 'hips')]
    return Creature('mushroom_brute', bones, parts, A, make_anims(), emit=2.0,
                    meta={'bone_len': 0.12, 'doc': {'name_tr': 'Mantar Zorbası', 'emissive': 'eyes (acid green)',
                                                     'use': 'tanky melee trash; Cast = poison spore cloud (spawn AoE at cap)'}})


def make_anims():
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    a = Act('Idle', 48)
    a.wave('body', lambda t: dict(rot=(2 * S(tau * t), 0, 0), scl=(1 + 0.02 * S(tau * t), 1 + 0.02 * S(tau * t), 1 - 0.015 * S(tau * t))), 3)
    a.wave('cap', lambda t: dict(rot=(3 * S(tau * t + 1), 4 * S(tau * t + 0.3), 0)), 3)
    a.wave('hips', lambda t: dict(loc=(0, 0, 0.015 * S(tau * t))), 3)
    a.wave('arm_l', lambda t: dict(rot=(4 * S(tau * t), -6, 0)), 3)
    a.wave('arm_r', lambda t: dict(rot=(4 * S(tau * t + 1), 6, 0)), 3)
    a.wave('fore_l', lambda t: dict(rot=(-12, 0, 0)), 6)
    a.wave('fore_r', lambda t: dict(rot=(-12, 0, 0)), 6)
    acts.append(a)

    def waddle(name, n, amp, sway, lean, bob):
        a = Act(name, n)
        st = 1 if n < 24 else 2
        for s, sfx, ph in ((1, '_l', 0.0), (-1, '_r', 0.5)):
            a.wave('leg' + sfx, lambda t, ph=ph: dict(rot=(-amp * S(tau * (t + ph)), 0, 0)), st)
            a.wave('arm' + sfx, lambda t, ph=ph, s=s: dict(rot=(amp * 0.9 * S(tau * (t + ph)), -8 * s, 0)), st)
            a.wave('fore' + sfx, lambda t: dict(rot=(-25, 0, 0)), 4)
        a.wave('hips', lambda t: dict(loc=(0, 0, -bob * abs(S(tau * t))), rot=(0, sway * S(tau * t), 0)), st)
        a.wave('body', lambda t: dict(rot=(lean, -sway * 0.5 * S(tau * t), 4 * S(tau * t))), st)
        a.wave('cap', lambda t: dict(rot=(-lean * 0.4 + 4 * S(2 * tau * t - 1), -sway * 0.6 * S(tau * t - 0.8), 0)), st)
        return a
    acts.append(waddle('Walk', 32, 24, 8, 3, 0.04))
    acts.append(waddle('Run', 20, 34, 10, 14, 0.07))

    a = Act('Attack', 30, loop=False)
    back = dict(body=(-25, 0, 0), cap=(-10, 0, 0), arm_l=(40, -15, 0), arm_r=(40, 15, 0), hips=dict(loc=(0, 0.06, 0)))
    slam = dict(body=(48, 0, 0), cap=(15, 0, 0), arm_l=(-40, -20, 0), arm_r=(-40, 20, 0), hips=dict(loc=(0, -0.15, -0.1)))
    a.at(10, **back).at(15, **slam).at(20, **slam)
    a.rest(30, *back.keys())
    acts.append(a)

    a = Act('Cast', 36, loop=False)
    crouch = dict(hips=dict(loc=(0, 0, -0.16)), body=(10, 0, 0), cap=dict(rot=(5, 0, 0), scl=(0.9, 0.9, 1.1)),
                  arm_l=(-20, -10, 0), arm_r=(-20, 10, 0), leg_l=(-10, 0, 0), leg_r=(-10, 0, 0))
    burst = dict(hips=dict(loc=(0, 0, 0.06)), body=(-12, 0, 0), cap=dict(rot=(-8, 0, 0), scl=(1.32, 1.32, 0.85)),
                 arm_l=(-30, -65, 0), arm_r=(-30, 65, 0), leg_l=(0, 0, 0), leg_r=(0, 0, 0))
    a.at(12, **crouch).at(18, **burst).at(22, cap=dict(rot=(-4, 3, 0), scl=(1.15, 1.15, 0.95)))
    a.at(25, cap=dict(rot=(-6, -3, 0), scl=(1.22, 1.22, 0.9)))
    a.rest(36, *crouch.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(body=(-15, 0, 5), cap=dict(rot=(-12, 8, 0)), hips=dict(loc=(0, 0.1, 0)), arm_l=(15, -20, 0), arm_r=(15, 20, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 45, loop=False)
    a.at(10, body=(-12, 0, 6), cap=(-10, 0, 0), hips=dict(loc=(0, 0.06, 0)))
    down = dict(hips=dict(loc=(0, 0.3, -0.06), rot=(-80, 0, 0)), body=(-5, 0, 0),
                cap=dict(rot=(-20, 0, 25), loc=(0.15, 0.1, 0.2)),
                arm_l=(-30, -50, 0), arm_r=(-30, 50, 0), leg_l=(-35, 0, 0), leg_r=(-60, 0, 0))
    a.at(26, **down)
    a.at(31, hips=dict(loc=(0, 0.3, 0.02), rot=(-78, 0, 0)))
    a.at(45, **down)
    acts.append(a)
    return acts
