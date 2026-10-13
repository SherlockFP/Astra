"""Fire / ice elementals: floating legless brutes sharing one rig + animation set (Cast included)."""
import math
from clib import Creature, Act, lathe, sphere, limb, cone, box, rock, crystal, sym
import ptex as T

FIRE = T.R('#6a0800', '#c02008', '#ff5a10', '#ffa020', '#ffe060', '#fffad0')
ROCK = T.R('#0c0605', '#1e100c', '#321c16', '#4a2c22')
LAVA = T.R('#c02a08', '#ff7010', '#ffc040', '#fff4b0')
EYE_F = T.R('#ffb000', '#ffe060', '#fffbe0', '#ffffff')
ICE = T.R('#16306a', '#2a5ea8', '#4c96d4', '#86ccec', '#c4f0fa', '#ffffff')
ICE_D = T.R('#0c1c44', '#1a3a74', '#2c62a2', '#4c8cc8')
CORE = T.R('#1060c0', '#30b0ff', '#90f0ff', '#f0ffff')
FROST = T.R('#5a7a9a', '#8ab0c8', '#c0dcea', '#f0fbff')


def build(kind='fire'):
    A = T.Atlas(64, 16, seed=81 if kind == 'fire' else 91)
    parts = []
    if kind == 'fire':
        A.paint('fire', T.pat_fire, 2, 1, ramp=FIRE, tongues=4, invert=False)
        A.paint('tail', T.pat_fire, ramp=FIRE, tongues=3, invert=True)
        A.paint('rock', T.pat_stone, ramp=ROCK, cracks=3, crack_ramp=LAVA, lo=0.2, hi=0.8)
        A.paint('eye', T.pat_glow, ramp=EYE_F, core=0.6)
        A.paint('core', T.pat_glow, ramp=FIRE[2:], core=0.3)
        parts += fire_parts()
        name, emis = 'Ateş Elementali', 'nearly everything: flame body/tail/arms/crest, lava-crack rock armour, eyes'
        use = 'elite caster-brute for fire floors; Cast = fireball/flame wave, spawn VFX at hands'
    else:
        A.paint('ice', T.pat_crystal, ramp=ICE, stripes=3)
        A.paint('ice2', T.pat_crystal, ramp=ICE_D, stripes=2)
        A.paint('frost', T.pat_stone, ramp=FROST, cracks=2, outline='lrtb')
        A.paint('core', T.pat_glow, ramp=CORE, core=0.35)
        A.paint('eye', T.pat_glow, ramp=CORE, core=0.6)
        parts += ice_parts()
        name, emis = 'Buz Elementali', 'chest core gem, eyes, tail core (cyan)'
        use = 'elite caster-brute for frost floors; Cast = ice shard volley / frost nova'
    bones = [('root', (0, 0, 0), None), ('body', (0, 0, 1.1), 'root'), ('tail', (0, 0, 0.95), 'body'), ('spin', (0, 0, 0.95), 'tail'),
             ('chest', (0, 0, 1.5), 'body'), ('head', (0, -0.05, 1.98), 'chest'), ('crest', (0, 0, 2.25), 'head')]
    for s, sfx in ((1, '_l'), (-1, '_r')):
        bones += [('arm' + sfx, (0.62 * s, 0, 1.86), 'chest'), ('fore' + sfx, (0.82 * s, 0, 1.36), 'arm' + sfx)]
    return Creature('elemental_' + kind, bones, parts, A, make_anims(kind == 'fire'), emit=1.6 if kind == 'fire' else 2.5,
                    meta={'bone_len': 0.15, 'doc': {'name_tr': name, 'emissive': emis, 'use': use}})


def fire_parts():
    parts = []

    def twist(k, jag):
        def fn(ri, si, p):
            a = (p.z - 0.1) * k
            c, s = math.cos(a), math.sin(a)
            x, y = p.x * c - p.y * s, p.x * s + p.y * c
            j = 1.0 + (jag if si % 2 else -jag * 0.5)
            return (x * j, y * j, p.z + (0.04 if si % 2 else 0.0))
        return fn
    tail = lathe([(0.0, 0.1), (0.1, 0.22), (0.22, 0.45), (0.34, 0.72), (0.44, 1.0), (0.48, 1.15), (0.0, 1.25)], 8, vfn=twist(1.6, 0.12))
    parts.append(tail.set(tile='tail', mat='glow', bone='spin', uv='cyl', ao=(0.8, 1)))
    torso = lathe([(0.0, 1.0), (0.42, 1.05), (0.5, 1.3), (0.6, 1.6), (0.62, 1.8), (0.4, 1.98), (0.0, 2.02)], 8, sx=1.15,
                  vfn=twist(0.9, 0.06))
    parts.append(torso.set(tile='fire', mat='glow', bone='chest', uv='cyl', ao=(0.85, 1)))
    # flame spikes rising from the back & shoulders
    for a, b, r in [((0, 0.3, 1.7), (0, 0.55, 2.25), 0.16), ((0.3, 0.3, 1.75), (0.42, 0.5, 2.15), 0.12),
                    ((-0.3, 0.3, 1.75), (-0.42, 0.5, 2.15), 0.12)]:
        parts.append(cone(a, b, r, 4).set(tile='fire', mat='glow', bone='chest', uv='box'))
    # rock armour (lava cracks glow)
    R = lambda sx, sy, sz, c, bone, seed, **kw: rock(sx, sy, sz, center=c, seed=seed, **kw).set(tile='rock', mat='glow', bone=bone, uv='face')
    parts.append(R(0.8, 0.32, 0.52, (0, -0.44, 1.64), 'chest', 1, taper=(1.1, 1.0)))
    parts.append(R(0.5, 0.26, 0.3, (0, -0.42, 1.24), 'chest', 2))
    for s, sfx in ((1, '_l'), (-1, '_r')):
        parts.append(R(0.55, 0.55, 0.42, (0.66 * s, 0.0, 1.98), 'arm' + sfx, 3 + (s > 0)).rot(0, -15 * s, 0, pivot=(0.66 * s, 0, 1.98)))
        parts.append(cone((0.7 * s, 0.05, 2.1), (0.86 * s, 0.12, 2.5), 0.12, 4).set(tile='fire', mat='glow', bone='arm' + sfx))
        parts.append(limb((0.62 * s, 0, 1.86), (0.82 * s, 0, 1.36), 0.17, 0.13, 6).set(tile='fire', mat='glow', bone='arm' + sfx, uv='cyl'))
        parts.append(R(0.36, 0.36, 0.5, (0.86 * s, -0.04, 1.12), 'fore' + sfx, 5 + (s > 0), taper=(0.85, 0.85)))
        parts.append(R(0.4, 0.42, 0.34, (0.88 * s, -0.08, 0.8), 'fore' + sfx, 7 + (s > 0)))
        parts.append(cone((0.9 * s, 0.12, 1.2), (1.02 * s, 0.32, 1.45), 0.1, 4).set(tile='fire', mat='glow', bone='fore' + sfx))
        parts.append(R(0.22, 0.22, 0.2, (0.36 * s, 0.12, 0.62), 'spin', 9 + (s > 0)))
    # head: flame skull with rock mask
    head = lathe([(0.0, 1.94), (0.22, 1.98), (0.26, 2.14), (0.2, 2.3), (0.0, 2.38)], 8, center=(0, -0.02, 0))
    parts.append(head.set(tile='fire', mat='glow', bone='head', uv='cyl'))
    parts.append(R(0.38, 0.14, 0.28, (0, -0.22, 2.1), 'head', 11))
    for p in sym(box(0.1, 0.04, 0.05, center=(0.085, -0.3, 2.13)).rot(0, -12, 0, pivot=(0.085, -0.3, 2.13))
                 .set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    for a, b, r in [((0, 0.02, 2.25), (0, 0.12, 2.62), 0.13), ((0.13, 0.0, 2.2), (0.22, 0.08, 2.48), 0.08),
                    ((-0.13, 0.0, 2.2), (-0.22, 0.08, 2.48), 0.08)]:
        parts.append(cone(a, b, r, 5).set(tile='fire', mat='glow', bone='crest', uv='box'))
    return parts


def ice_parts():
    parts = []
    I = lambda a, b, r, bone, segs=5, tile='ice', **kw: crystal(a, b, r, segs, **kw).set(tile=tile, bone=bone, uv='face')
    # lower body: hanging shard cluster around a glowing core
    parts.append(I((0, 0, 1.12), (0, 0.02, 0.12), 0.24, 'spin', 6))
    parts.append(I((0.2, 0.05, 1.05), (0.3, 0.12, 0.42), 0.13, 'spin', tile='ice2'))
    parts.append(I((-0.2, 0.05, 1.05), (-0.3, 0.12, 0.45), 0.13, 'spin', tile='ice2'))
    parts.append(I((0.0, 0.22, 1.05), (0.02, 0.32, 0.5), 0.12, 'spin'))
    parts.append(I((0.05, -0.2, 1.05), (0.08, -0.26, 0.6), 0.1, 'spin', tile='ice2'))
    parts.append(sphere(0.2, 6, 4, center=(0, 0, 1.02)).set(tile='core', mat='glow', bone='tail', uv='py', ao=(1, 1)))
    # torso: frosted rock block + crystals
    parts.append(rock(1.0, 0.72, 0.7, center=(0, 0.05, 1.55), seed=3, taper=(1.3, 1.05), jitter=0.05)
                 .set(tile='frost', tile_top='ice', bone='chest', uv='face'))
    parts.append(rock(0.6, 0.5, 0.36, center=(0, 0.02, 1.16), seed=4).set(tile='ice2', bone='chest', uv='face'))
    parts.append(sphere(0.19, 6, 4, center=(0, -0.33, 1.52), sy=0.7).set(tile='core', mat='glow', bone='chest', uv='py', ao=(1, 1)))
    for a, b, r in [((0, 0.3, 1.7), (0, 0.62, 2.35), 0.13), ((0.28, 0.3, 1.72), (0.44, 0.58, 2.2), 0.1),
                    ((-0.28, 0.3, 1.72), (-0.44, 0.58, 2.2), 0.1)]:
        parts.append(I(a, b, r, 'chest'))
    for s, sfx in ((1, '_l'), (-1, '_r')):
        parts.append(rock(0.5, 0.52, 0.42, center=(0.66 * s, 0.0, 1.97), seed=5 + (s > 0)).set(tile='frost', tile_top='ice', bone='arm' + sfx, uv='face'))
        parts.append(I((0.66 * s, 0.05, 2.05), (0.92 * s, 0.15, 2.55), 0.14, 'arm' + sfx))
        parts.append(I((0.6 * s, 0.12, 2.0), (0.68 * s, 0.32, 2.36), 0.08, 'arm' + sfx, tile='ice2'))
        parts.append(I((0.62 * s, 0, 1.86), (0.82 * s, 0, 1.36), 0.15, 'arm' + sfx, 5, tile='ice2', tip=0.15, base=0.15))
        parts.append(rock(0.38, 0.38, 0.52, center=(0.85 * s, -0.03, 1.15), seed=7 + (s > 0), taper=(0.8, 0.8)).set(tile='ice', bone='fore' + sfx, uv='face'))
        for dx, dy in ((-0.08, 0.0), (0.0, -0.06), (0.08, 0.0)):
            parts.append(I((0.85 * s + dx, -0.08 + dy, 0.95), (0.85 * s + dx * 1.8, -0.24 + dy, 0.56), 0.06, 'fore' + sfx, 4))
    # head: crystal helm
    parts.append(rock(0.38, 0.38, 0.36, center=(0, -0.05, 2.1), seed=11, taper=(0.8, 0.9)).set(tile='ice', bone='head', uv='face'))
    parts.append(rock(0.44, 0.12, 0.1, center=(0, -0.24, 2.2), seed=12).set(tile='ice2', bone='head', uv='face'))
    for p in sym(box(0.08, 0.04, 0.045, center=(0.08, -0.25, 2.11)).rot(0, -12, 0, pivot=(0.08, -0.25, 2.11))
                 .set(tile='eye', mat='glow', bone='head', uv='face', ao=(1, 1))):
        parts.append(p)
    parts.append(I((0, 0, 2.22), (0, 0.06, 2.62), 0.08, 'crest'))
    parts.append(I((0.12, 0, 2.2), (0.22, 0.06, 2.46), 0.06, 'crest', 4))
    parts.append(I((-0.12, 0, 2.2), (-0.22, 0.06, 2.46), 0.06, 'crest', 4))
    return parts


def make_anims(fire):
    S, Cc, tau = math.sin, math.cos, 2 * math.pi
    acts = []
    arms = dict(arm_l=(-10, -14, 0), arm_r=(-10, 14, 0), fore_l=(-25, 0, 0), fore_r=(-25, 0, 0))

    def base(a, bob, lean, trail, step):
        a.wave('body', lambda t: dict(loc=(0, 0, bob * S(tau * t)), rot=(lean, 0, 0)), step)
        if fire:
            a.wave('tail', lambda t: dict(rot=(trail, 0, 0), scl=(1 + 0.06 * S(3 * tau * t), 1 + 0.06 * S(3 * tau * t), 1 + 0.1 * S(2 * tau * t))), step)
            a.wave('spin', lambda t: dict(rot=(0, 0, 360 * t)), 1)
            a.wave('crest', lambda t: dict(scl=(1 - 0.08 * S(3 * tau * t), 1 - 0.08 * S(3 * tau * t), 1 + 0.18 * S(3 * tau * t)),
                                           rot=(6 * S(2 * tau * t), 5 * S(tau * t), 0)), step)
        else:
            a.wave('tail', lambda t: dict(rot=(trail + 3 * S(tau * t), 0, 0)), step)
            a.wave('spin', lambda t: dict(rot=(0, 0, 14 * S(tau * t))), step)
            a.wave('crest', lambda t: dict(rot=(0, 0, 0)), 6)
        return a

    a = base(Act('Idle', 60), 0.08, 0, 0, 2)
    a.wave('chest', lambda t: dict(rot=(2 * S(tau * t), 0, 3 * S(tau * t * 0.5 * 2)), scl=(1 + 0.02 * S(tau * t), 1, 1 + 0.02 * S(tau * t))), 3)
    a.wave('head', lambda t: dict(rot=(-2 * S(tau * t), 0, 6 * S(tau * t))), 3)
    for b, r in arms.items():
        ph = 0 if b.endswith('_l') else 1.3
        a.wave(b, lambda t, r=r, ph=ph: dict(rot=(r[0] + 5 * S(tau * t + ph), r[1], r[2])), 3)
    acts.append(a)

    def move(name, n, lean, trail, swing):
        a = base(Act(name, n), 0.05, lean, trail, 2 if n >= 24 else 1)
        a.wave('chest', lambda t: dict(rot=(lean * 0.3, 0, 6 * S(tau * t))), 2)
        a.wave('head', lambda t: dict(rot=(-lean * 0.8, 0, -4 * S(tau * t))), 2)
        for s, sfx, ph in ((1, '_l', 0), (-1, '_r', 0.5)):
            a.wave('arm' + sfx, lambda t, s=s, ph=ph: dict(rot=(trail * 0.5 + swing * S(tau * (t + ph)), -14 * s, 0)), 2)
            a.wave('fore' + sfx, lambda t: dict(rot=(-30, 0, 0)), 4)
        return a
    acts.append(move('Walk', 40, 10, 18, 14))
    acts.append(move('Run', 24, 20, 32, 24))

    a = Act('Attack', 30, loop=False)
    wind = dict(chest=(-6, 0, -30), arm_r=(25, 30, 0), fore_r=(-70, 0, 0), arm_l=(-30, -20, 0), fore_l=(-30, 0, 0),
                head=(0, 0, 15), body=dict(loc=(0, 0.1, 0.05)))
    punch = dict(chest=(12, 0, 28), arm_r=(-88, -10, 0), fore_r=(-5, 0, 0), arm_l=(15, -20, 0), fore_l=(-40, 0, 0),
                 head=(0, 0, -12), body=dict(loc=(0, -0.35, 0)))
    a.at(10, **wind).at(15, **punch).at(20, **punch)
    a.rest(30, *wind.keys())
    acts.append(a)

    a = Act('Cast', 45, loop=False)
    gather = dict(arm_l=(-70, -55, 0), arm_r=(-70, 55, 0), fore_l=(-70, 0, 0), fore_r=(-70, 0, 0),
                  chest=(-15, 0, 0), head=(-14, 0, 0), body=dict(loc=(0, 0, 0.22)), crest=dict(scl=(1, 1, 1.4)))
    thrust = dict(arm_l=(-90, -8, 0), arm_r=(-90, 8, 0), fore_l=(0, 0, 0), fore_r=(0, 0, 0),
                  chest=(16, 0, 0), head=(4, 0, 0), body=dict(loc=(0, -0.15, 0.1)), crest=dict(scl=(1, 1, 1.2)))
    a.at(15, **gather).at(22, **dict(gather, chest=(-18, 0, 3))).at(27, **thrust).at(33, **thrust)
    a.rest(45, *gather.keys())
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    hit = dict(chest=(-16, 0, 6), head=(-14, 0, 0), body=dict(loc=(0, 0.16, 0.02)), arm_l=(5, -30, 0), arm_r=(5, 30, 0))
    a.at(3, **hit)
    a.rest(12, *hit.keys())
    acts.append(a)

    a = Act('Death', 48, loop=False)
    a.at(10, chest=(-25, 0, 0), head=(-20, 0, 0), body=dict(loc=(0, 0, 0.2)), arm_l=(-60, -60, 0), arm_r=(-60, 60, 0))
    a.at(30, body=dict(loc=(0, 0, -0.7), scl=(0.75, 0.75, 0.45)), chest=(30, 0, 0), head=(25, 0, 0),
         arm_l=(-10, -50, 0), arm_r=(-10, 50, 0), tail=dict(scl=(0.6, 0.6, 0.3)), crest=dict(scl=(0.6, 0.6, 0.5)))
    a.at(48, body=dict(loc=(0, 0, -1.0), scl=(0.5, 0.5, 0.15)), chest=(35, 0, 0), head=(30, 0, 0),
         arm_l=(0, -70, 0), arm_r=(0, 70, 0), tail=dict(scl=(0.4, 0.4, 0.2)), crest=dict(scl=(0.3, 0.3, 0.3)))
    acts.append(a)
    return acts
