"""Slime (green / lava / frost): bouncy blob, squash & stretch via bone scale."""
import math
from clib import Part, Creature, Act, lathe, sphere, box, crystal, wgrad
import ptex as T

PALETTES = {
    'green': dict(body=T.R('#0c2a12', '#1b5a1e', '#2f8a26', '#55b830', '#93e04a', '#d8ffa0'),
                  eye='#f4f4dc', pupil='#101810', mouth=T.R('#14060a', '#3a0f14', '#6a1c22')),
    'lava': dict(rock=T.R('#140806', '#2a120c', '#43201a', '#5e3226'),
                 glow=T.R('#c02a08', '#ff6a10', '#ffb030', '#fff0a0'),
                 eye='#ffc838', mouth=T.R('#ff6a10', '#ffb030', '#fff0a0')),
    'frost': dict(body=T.R('#14284a', '#24508a', '#3a84c0', '#6cbce0', '#a8e4f4', '#f0ffff'),
                  eye='#e8f8ff', pupil='#0a1a40', mouth=T.R('#06102a', '#0e2450', '#1a3a70'),
                  ice=T.R('#1a3e7a', '#3c8ad0', '#86d4f4', '#d8f8ff', '#ffffff')),
}


def build(variant='green'):
    P = PALETTES[variant]
    A = T.Atlas(64, 16, seed={'green': 3, 'lava': 5, 'frost': 9}[variant])
    if variant == 'lava':
        A.paint('body', T.pat_molten, 2, 2, rock=P['rock'], glow=P['glow'], width=0.03, cells=4)
        A.paint('eye', T.pat_eye, col=P['eye'], rim='#1a0602', pupil='#3a0800', pupil_r=0.13, pupil_aspect=3.2)
        A.paint('mouth', T.pat_glow, ramp=P['mouth'], radial=False)
    else:
        A.paint('body', T.pat_slime, 2, 2, ramp=P['body'])
        A.paint('eye', T.pat_eye, col=P['eye'], rim='#000000', pupil=P['pupil'])
        A.paint('mouth', T.pat_mouth, inner=P['mouth'], n=5)
    if variant == 'frost':
        A.paint('ice', T.pat_crystal, ramp=P['ice'])

    w = wgrad('body', 'top', 2, 0.2, 0.85)

    def wob(ri, si, p):
        a = math.atan2(p.y, p.x)
        k = 1.0 + (0.07 * math.sin(3 * a + 0.5) if ri in (1, 2) else 0.0)
        return (p.x * k, p.y * k, p.z)

    prof = [(0.0, 0.0), (0.5, 0.0), (0.62, 0.1), (0.64, 0.28), (0.58, 0.52), (0.46, 0.74), (0.27, 0.92), (0.0, 1.0)]
    body_mat = 'glow' if variant == 'lava' else 'main'
    body = lathe(prof, 12, vfn=wob).set(tile='body', uv='cyl', mat=body_mat, wfn=w, ao=(0.7, 1.0), smooth=True)
    parts = [body]
    eye_mat = 'glow' if variant == 'lava' else 'main'
    for sx in (1, -1):
        e = sphere(0.12, 6, 4, center=(0.2 * sx, -0.5, 0.6), sx=1.0, sy=0.55, sz=1.25)
        parts.append(e.set(tile='eye', uv='py', mat=eye_mat, wfn=w, ao=(1, 1)))
    mouth = box(0.34, 0.08, 0.1, center=(0, -0.6, 0.36), taper=(1.15, 1.0))
    parts.append(mouth.set(tile='mouth', uv='py', mat=eye_mat, wfn=w, ao=(1, 1)))
    if variant == 'frost':
        for a, b, r in [((0, 0.05, 0.9), (0.02, 0.18, 1.32), 0.1),
                        ((0.22, 0.12, 0.8), (0.42, 0.22, 1.1), 0.07),
                        ((-0.22, 0.12, 0.8), (-0.4, 0.28, 1.08), 0.07),
                        ((0.08, 0.32, 0.75), (0.12, 0.55, 1.0), 0.06)]:
            parts.append(crystal(a, b, r, 5).set(tile='ice', uv='face', bone='top', ao=(0.85, 1.0)))

    bones = [('root', (0, 0, 0), None), ('body', (0, 0, 0), 'root'), ('top', (0, 0, 0.55), 'body')]
    acts = make_anims()
    names = {'green': 'Yeşil Balçık', 'lava': 'Lav Balçığı', 'frost': 'Ayaz Balçığı'}
    emissive = {'green': '-', 'lava': 'whole body cracks, eyes, mouth (glow mat)', 'frost': '-'}
    return Creature('slime_' + variant, bones, parts, A, acts, emit=1.6 if variant == 'lava' else 2.0,
                    meta={'bone_len': 0.1, 'doc': {'name_tr': names[variant], 'emissive': emissive[variant],
                                                    'use': 'trash mob, spawns in packs; lava/frost for themed floors'}})


def make_anims():
    S = math.sin
    tau = 2 * math.pi
    acts = []
    a = Act('Idle', 48)
    a.wave('body', lambda t: dict(scl=(1 + 0.05 * S(tau * t), 1 + 0.05 * S(tau * t), 1 - 0.08 * S(tau * t))))
    a.wave('top', lambda t: dict(rot=(3 * S(tau * t + 1.2), 4 * S(tau * t), 0)), step=4)
    acts.append(a)

    def hop(name, n, h, lean):
        a = Act(name, n)
        k = n / 30.0
        a.keys('root', 'loc', [(0, (0, 0, 0)), (5 * k, (0, 0, 0.05)), (12 * k, (0, 0, h)),
                               (19 * k, (0, 0, h * 0.3)), (22 * k, (0, 0, 0)), (n, (0, 0, 0))])
        a.keys('body', 'scl', [(0, (1.15, 1.15, 0.8)), (5 * k, (0.88, 0.88, 1.18)), (12 * k, (0.95, 0.95, 1.06)),
                               (19 * k, (0.92, 0.92, 1.1)), (22 * k, (1.2, 1.2, 0.75)), (26 * k, (1.06, 1.06, 0.92)),
                               (n, (1.15, 1.15, 0.8))])
        a.keys('body', 'rot', [(0, (lean, 0, 0)), (12 * k, (lean * 0.6, 0, 0)), (n, (lean, 0, 0))])
        a.keys('top', 'rot', [(0, (0, 0, 0)), (5 * k, (-7, 0, 0)), (12 * k, (4, 0, 0)), (22 * k, (9, 0, 0)), (n, (0, 0, 0))])
        return a

    acts.append(hop('Walk', 30, 0.22, 0))
    acts.append(hop('Run', 18, 0.3, 10))

    a = Act('Attack', 27, loop=False)
    a.pose(0, {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=1, rot=(0, 0, 0)), 'top': dict(rot=(0, 0, 0))})
    a.pose(8, {'root': dict(loc=(0, 0.15, 0)), 'body': dict(scl=(1.2, 1.2, 0.75), rot=(-12, 0, 0)), 'top': dict(rot=(-8, 0, 0))})
    a.pose(13, {'root': dict(loc=(0, -0.55, 0.25)), 'body': dict(scl=(0.85, 0.85, 1.25), rot=(25, 0, 0)), 'top': dict(rot=(10, 0, 0))})
    a.pose(17, {'root': dict(loc=(0, -0.6, 0.0)), 'body': dict(scl=(1.25, 1.25, 0.7), rot=(10, 0, 0)), 'top': dict(rot=(14, 0, 0))})
    a.pose(27, {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=1, rot=(0, 0, 0)), 'top': dict(rot=(0, 0, 0))})
    acts.append(a)

    a = Act('Hit', 12, loop=False)
    a.pose(0, {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=1), 'top': dict(rot=(0, 0, 0))})
    a.pose(3, {'root': dict(loc=(0, 0.14, 0)), 'body': dict(scl=(1.2, 1.2, 0.78)), 'top': dict(rot=(-16, 5, 0))})
    a.pose(7, {'root': dict(loc=(0, 0.08, 0)), 'body': dict(scl=(0.92, 0.92, 1.08)), 'top': dict(rot=(8, -3, 0))})
    a.pose(12, {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=1), 'top': dict(rot=(0, 0, 0))})
    acts.append(a)

    a = Act('Death', 36, loop=False)
    a.pose(0, {'body': dict(scl=1), 'top': dict(rot=(0, 0, 0), scl=1)})
    a.pose(6, {'body': dict(scl=(0.9, 0.9, 1.2)), 'top': dict(rot=(-10, 0, 0), scl=1)})
    a.pose(14, {'body': dict(scl=(1.4, 1.4, 0.45)), 'top': dict(rot=(6, 0, 0), scl=(1.1, 1.1, 0.8))})
    a.pose(24, {'body': dict(scl=(1.65, 1.65, 0.12)), 'top': dict(rot=(0, 0, 0), scl=(1.2, 1.2, 0.6))})
    a.pose(36, {'body': dict(scl=(1.75, 1.75, 0.06)), 'top': dict(rot=(0, 0, 0), scl=(1.2, 1.2, 0.5))})
    acts.append(a)
    return acts
