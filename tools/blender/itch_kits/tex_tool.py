"""PSX-ify a texture: optional crop (normalized UV box), downscale to <= max px, 256-colour palette PNG.
Run with system Python + Pillow:
    python -I tex_tool.py <src> <out.png> <max_px> [u0 v0 u1 v1] [--opaque]
UV box uses glTF/Blender UV convention: v=0 is the bottom of the image.
Transparent texels are filled with nearby colours (bleed) before scaling, so nearest sampling at UV island
borders never shows black seams. --opaque drops the alpha channel entirely.
Prints one JSON line: TEXJSON {"out":..., "w":..., "h":..., "alpha": bool}
"""
import sys, json, os
from PIL import Image, ImageChops

flags = [a for a in sys.argv[1:] if a.startswith('--')]
pos = [a for a in sys.argv[1:] if not a.startswith('--')]
src, out, max_px = pos[0], pos[1], int(pos[2])
box = [float(x) for x in pos[3:7]] if len(pos) >= 7 else None
force_opaque = '--opaque' in flags


def bleed(im):
    """Fill fully transparent texels with the average colour of nearby opaque ones (multi-scale)."""
    a = im.getchannel('A')
    if a.getextrema()[0] >= 250:
        return im
    w, h = im.size
    mask = a.point(lambda v: 255 if v >= 128 else 0)
    base = im.convert('RGBa')  # premultiplied
    out = im.convert('RGB')
    filled = mask.copy()
    s = 2
    while s < max(w, h) * 2:
        sw, sh = max(1, w // s), max(1, h // s)
        small = base.resize((sw, sh), Image.BOX).resize((w, h), Image.NEAREST)
        sa = small.getchannel('a')
        col = small.convert('RGBA').convert('RGB')  # un-premultiply
        take = ImageChops.subtract(sa.point(lambda v: 255 if v >= 8 else 0), filled)
        out.paste(col, (0, 0), take)
        filled = ImageChops.lighter(filled, take)
        if filled.getextrema()[0] == 255:
            break
        s *= 2
    res = out.convert('RGBA')
    res.putalpha(a)
    return res


im = Image.open(src)
im.load()
im = im.convert('RGBA')
W, H = im.size
im = bleed(im)
if box:
    u0, v0, u1, v1 = box
    x0 = max(0, int(u0 * W) - 1)
    x1 = min(W, int(-(-u1 * W // 1)) + 1)
    y0 = max(0, int((1 - v1) * H) - 1)
    y1 = min(H, int(-(-(1 - v0) * H // 1)) + 1)
    im = im.crop((x0, y0, x1, y1))
w, h = im.size
s = min(1.0, max_px / max(w, h))
if s < 1.0:
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    exact = (w % nw == 0) and (h % nh == 0)
    flt = Image.BOX if exact else Image.LANCZOS
    # scale colour and alpha separately: Pillow premultiplies RGBA, which would blacken the bled texels
    rgb = im.convert('RGB').resize((nw, nh), flt)
    rgb.putalpha(im.getchannel('A').resize((nw, nh), flt))
    im = rgb
alpha_ch = im.getchannel('A')
has_alpha = (not force_opaque) and alpha_ch.getextrema()[0] < 128
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
if has_alpha:
    im.putalpha(alpha_ch.point(lambda v: 255 if v >= 128 else 0))
    q = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
else:
    q = im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q.save(out, optimize=True)
res = {'out': out.replace('\\', '/'), 'w': q.size[0], 'h': q.size[1], 'alpha': bool(has_alpha)}
if box:
    res['crop_px'] = [x0, y0, x1, y1]
    res['src_wh'] = [W, H]
print('TEXJSON ' + json.dumps(res))
