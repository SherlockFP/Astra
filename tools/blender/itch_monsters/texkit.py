"""texkit.py - PSX-ify the monster textures (system Python + Pillow + numpy, run with -I).

    python -I tools/blender/itch_monsters/texkit.py <cache_itch_monsters_dir> <public_dir>

Reads the extracted archives under <cache>/<pack>/x/ (read-only) and writes 256 px, 256-colour palette PNGs:

  <public>/assets/textures/itch/bestiary/<monster>_<1|2|3>.png   base colour + emissive baked in (max), RGB
  <public>/assets/textures/itch/creatures/<name>[_<variant>].png  alpha (= smoothness in this pack) dropped, RGB
  <public>/assets/textures/itch/creatures/ooze_<colour>.png       jelly mask -> colour ramp, RGBA (alpha = opacity)
  <public>/assets/textures/itch/creatures/wasp_wing.png           membrane alpha ordered-dithered to 0/255 (MASK)
  <public>/assets/textures/itch/creatures/fx/*.png                small FX textures (RGBA, alpha kept)

Prints one JSON report line (TEXREPORT {...}) listing every file written.
"""
import sys, os, json
import numpy as np
from PIL import Image

SIZE = 256


def box(im, size=SIZE):
    """Area-average downscale (exact for power-of-two ratios)."""
    if max(im.size) <= size:
        return im
    return im.resize((size, size), Image.BOX)


def save_rgb(arr_or_im, out):
    im = arr_or_im if isinstance(arr_or_im, Image.Image) else Image.fromarray(arr_or_im.astype(np.uint8))
    q = im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    q.save(out, optimize=True)
    return {'file': out.replace('\\', '/'), 'w': q.size[0], 'h': q.size[1], 'alpha': False, 'bytes': os.path.getsize(out)}


def save_rgba(arr, out, hard_alpha=False):
    im = Image.fromarray(arr.astype(np.uint8), 'RGBA')
    if hard_alpha:
        a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
        im.putalpha(a)
    q = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    q.save(out, optimize=True)
    return {'file': out.replace('\\', '/'), 'w': q.size[0], 'h': q.size[1], 'alpha': True, 'bytes': os.path.getsize(out)}


def load(path):
    im = Image.open(path)
    im.load()
    return im


# ---------------------------------------------------------------------------------------------------
def bestiary(cache, pub, rep):
    root = os.path.join(cache, 'bestiary-dungeon-monsters-kit', 'x', 'Bestiary - Dungeon Monsters Kit[Standard]', 'Textures')
    for mon in ('Imp', 'Puglin'):
        em = np.asarray(box(load(os.path.join(root, 'T_%s_Emissive.png' % mon)).convert('RGB'))).astype(np.int16)
        for i in (1, 2, 3):
            base = np.asarray(box(load(os.path.join(root, 'T_%s_BaseColor_%d.png' % (mon, i))).convert('RGB'))).astype(np.int16)
            comp = np.maximum(base, em)  # glow baked in: emissive texels become bright
            rep.append(save_rgb(comp, os.path.join(pub, 'assets', 'textures', 'itch', 'bestiary', '%s_%d.png' % (mon.lower(), i))))


# ---------------------------------------------------------------------------------------------------
OOZE_RAMPS = {  # thin, mid, core, crease (README of the pack)
    'green':   ('#a6d455', '#4f8c1c', '#2c5a12', '#173208', 1.0),
    'grey':    ('#c4c8bf', '#868c84', '#4c524c', '#22261f', 1.0),
    'black':   ('#5c4e62', '#2a2231', '#130f17', '#060408', 1.5),   # black pudding: more opaque
    'ochre':   ('#f2d173', '#c88f2e', '#7e4f19', '#3a2208', 1.0),
    'crimson': ('#e58272', '#a42c26', '#5a0f11', '#260405', 1.0),
}


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def ooze(src, pub, rep):
    m = np.asarray(box(load(src).convert('RGBA'))).astype(np.float32)
    R, G, B, A = m[..., 0] / 255, m[..., 1] / 255, m[..., 2] / 255, m[..., 3] / 255
    t = np.clip(R / 0.88, 0, 1)  # R tops out near 0.88
    for name, (thin, mid, core, crease, op) in OOZE_RAMPS.items():
        th, mi, co, cr = hexrgb(thin), hexrgb(mid), hexrgb(core), hexrgb(crease)
        t2 = t[..., None]
        col = np.where(t2 < 0.5, th + (mi - th) * (t2 / 0.5), mi + (co - mi) * ((t2 - 0.5) / 0.5))
        c = np.clip((1.0 - G) * 1.4, 0, 1)[..., None]            # creases darken toward the crease colour
        col = col + (cr - col) * c
        col = col * (1.0 + (B[..., None] - 0.48) * 0.5)           # detail channel: +-12 % brightness
        alpha = np.clip(A * 1.8 * op, 0, 1)                       # source alpha is only 18-50 %, too ghostly for a mob
        out = np.dstack([np.clip(col, 0, 255), alpha * 255])
        rep.append(save_rgba(out, os.path.join(pub, 'assets', 'textures', 'itch', 'creatures', 'ooze_%s.png' % name)))


# ---------------------------------------------------------------------------------------------------
BAYER4 = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) + 0.5) / 16


def wing(src, pub, rep):
    m = np.asarray(box(load(src).convert('RGBA'))).astype(np.float32)
    a = m[..., 3] / 255
    rgb = m[..., :3].copy()
    memb = (a > 0.15) & (a < 0.5)
    mean = rgb[memb].mean(axis=0) if memb.any() else np.array([120, 90, 40], np.float32)
    rgb[a <= 0.15] = mean                                         # no black fringes outside the UV islands
    th = np.tile(BAYER4, (SIZE // 4, SIZE // 4))
    solid = (a >= 0.5) | ((a > 0.15) & (a > th))                  # veins solid, membrane stippled (30 % coverage)
    out = np.dstack([rgb, np.where(solid, 255, 0)])
    rep.append(save_rgba(out, os.path.join(pub, 'assets', 'textures', 'itch', 'creatures', 'wasp_wing.png'), hard_alpha=True))


# ---------------------------------------------------------------------------------------------------
CREATURE_TEX = [  # (source relpath under Creatures/, output name)
    ('Beasts/Textures/T_Wolf.png', 'wolf'), ('Beasts/Textures/T_Wolf_Black.png', 'wolf_black'), ('Beasts/Textures/T_Wolf_White.png', 'wolf_white'),
    ('Beasts/Textures/T_Rat.png', 'rat'), ('Beasts/Textures/T_Rat_Black.png', 'rat_black'), ('Beasts/Textures/T_Rat_Plague.png', 'rat_plague'),
    ('Beasts/Textures/T_Bear.png', 'bear'), ('Beasts/Textures/T_Bear_Old.png', 'bear_old'),
    ('Beasts/Textures/T_Mammoth.png', 'mammoth'), ('Beasts/Textures/T_Mammoth_Dark.png', 'mammoth_dark'),
    ('Beasts/Textures/T_Deer.png', 'deer'), ('Beasts/Textures/T_Rhino.png', 'rhino'),
    ('Beasts/Textures/T_Warg.png', 'warg'), ('Beasts/Textures/T_Warg_Ash.png', 'warg_ash'), ('Beasts/Textures/T_Warg_Black.png', 'warg_black'),
    ('Beasts/Textures/T_WargTack.png', 'warg_tack'), ('Beasts/Textures/T_OozeContents.png', 'ooze_contents'),
    ('Insectoids/Textures/T_Spider.png', 'spider'), ('Insectoids/Textures/T_Spider_Pale.png', 'spider_pale'),
    ('Insectoids/Textures/T_Centipede.png', 'centipede'), ('Insectoids/Textures/T_Wasp.png', 'wasp'),
]
FX_TEX = [
    ('Beasts/Textures/FX/T_OozeDrop.png', 'ooze_drop'), ('Beasts/Textures/FX/T_OozeSplat.png', 'ooze_splat'),
    ('Beasts/Textures/FX/T_OozeFlat.png', 'ooze_flat'), ('Insectoids/Textures/T_Spider_Web.png', 'spider_web'),
    ('Insectoids/Textures/T_Centipede_Hole.png', 'centipede_hole'),
]


def creatures(cache, pub, rep):
    cdir = os.path.join(cache, 'fantasy-creatures-wolf-giant-rat-spider-wasp-centipede', 'x', 'Creatures')
    for rel, name in CREATURE_TEX:
        im = box(load(os.path.join(cdir, rel)).convert('RGB'))   # alpha = smoothness, dropped (roughness is 1 for PSX)
        rep.append(save_rgb(im, os.path.join(pub, 'assets', 'textures', 'itch', 'creatures', name + '.png')))
    ooze(os.path.join(cdir, 'Beasts/Textures/T_Ooze.png'), pub, rep)
    wing(os.path.join(cdir, 'Insectoids/Textures/T_Wasp_Wing.png'), pub, rep)
    for rel, name in FX_TEX:
        im = load(os.path.join(cdir, rel)).convert('RGBA')
        arr = np.asarray(box(im, 128 if name != 'spider_web' else 256))
        rep.append(save_rgba(arr, os.path.join(pub, 'assets', 'textures', 'itch', 'creatures', 'fx', name + '.png')))


if __name__ == '__main__':
    cache, pub = sys.argv[1], sys.argv[2]
    rep = []
    bestiary(cache, pub, rep)
    creatures(cache, pub, rep)
    print('TEXREPORT ' + json.dumps(rep))
