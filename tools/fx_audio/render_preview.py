"""Contact sheet for the itch fx-audio group (no 3D models in this group: VFX sheets, particles, icons).

Usage: python -I tools/fx_audio/render_preview.py <public/assets dir> <out png>
For each sprite sheet the "peak" frame (largest alpha coverage) is shown, plus a 4-frame strip.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ASSETS, OUT = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(ASSETS)  # .../public
W = 2048
BG = (24, 24, 32)
idx = json.load(open(os.path.join(ASSETS, "vfx", "itch", "index.json"), encoding="utf-8"))
icons = json.load(open(os.path.join(ASSETS, "icons", "itch", "wenrexa-skill-icons-4", "icons.json"), encoding="utf-8"))


def load(url):
    return Image.open(os.path.join(ROOT, url.lstrip("/"))).convert("RGBA")


def frames_of(s):
    im = load(s["path"])
    out = []
    for i in range(s["frames"]):
        c, r = i % s["cols"], i // s["cols"]
        out.append(im.crop((c * s["frameWidth"], r * s["frameHeight"], (c + 1) * s["frameWidth"], (r + 1) * s["frameHeight"])))
    return out


def fit(im, box):
    sc = min(box / im.width, box / im.height)
    rs = Image.NEAREST if sc >= 1 else Image.LANCZOS
    return im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), rs)


tiles = []
CELL = 120
for s in idx["sheets"]:
    fr = frames_of(s)
    cover = [float((np.asarray(f)[..., 3] > 16).mean()) for f in fr]
    peak = int(np.argmax(cover))
    picks = sorted(set([0, len(fr) // 3, peak, (2 * len(fr)) // 3, len(fr) - 1]))[:5]
    t = Image.new("RGBA", (CELL * 2, CELL + 30), BG + (255,))
    big = fit(fr[peak], CELL - 8)
    t.alpha_composite(big, ((CELL - big.width) // 2, (CELL - big.height) // 2))
    for k, p in enumerate(picks[:4]):
        sm = fit(fr[p], CELL // 2 - 6)
        x = CELL + (k % 2) * (CELL // 2) + (CELL // 2 - sm.width) // 2
        y = (k // 2) * (CELL // 2) + (CELL // 2 - sm.height) // 2
        t.alpha_composite(sm, (x, y))
    d = ImageDraw.Draw(t)
    d.text((3, CELL + 2), s["id"].replace("brackeys-", "bk-")[:38], fill=(255, 230, 120, 255))
    d.text((3, CELL + 15), f"{s['cols']}x{s['rows']} n={s['frames']} {s['frameWidth']}x{s['frameHeight']}", fill=(170, 170, 190, 255))
    tiles.append(t)

part_tiles = []
for p in idx["particles"]:
    im = load(p["path"])
    t = Image.new("RGBA", (96, 110), BG + (255,))
    t.alpha_composite(fit(im, 88), (4, 2))
    ImageDraw.Draw(t).text((3, 94), p["id"].replace("brackeys-", "")[:15], fill=(200, 200, 220, 255))
    part_tiles.append(t)

icon_tiles = []
for e in icons:
    im = load(e["path"])
    t = Image.new("RGBA", (72, 86), BG + (255,))
    t.alpha_composite(fit(im, 64), (4, 2))
    ImageDraw.Draw(t).text((2, 70), e["name"][:11], fill=(200, 200, 220, 255))
    icon_tiles.append(t)


def grid_height(tl):
    per = W // tl[0].width
    return ((len(tl) + per - 1) // per) * tl[0].height


H = 40 + grid_height(tiles) + 40 + grid_height(part_tiles) + 40 + grid_height(icon_tiles) + 10
sheet = Image.new("RGBA", (W, H), (12, 12, 16, 255))
d = ImageDraw.Draw(sheet)
y = 10


def place(title, tl):
    global y
    d.text((10, y), title, fill=(255, 255, 255, 255))
    y += 30
    per = W // tl[0].width
    for i, t in enumerate(tl):
        sheet.alpha_composite(t, ((i % per) * tl[0].width, y + (i // per) * tl[0].height))
    y += grid_height(tl) + 10


place(f"VFX sprite sheets ({len(tiles)}): peak frame + 4 sample frames  [bk = Brackeys VFX Bundle, spx = Super Pixel Effects]", tiles)
place(f"Brackeys extra particle textures ({len(part_tiles)}), white+alpha 256 px", part_tiles)
place(f"Wenrexa Skill Icons 4.0 ({len(icon_tiles)}), 128 px (+ -gray variants)", icon_tiles)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.convert("RGB").save(OUT, optimize=True)
print(OUT, sheet.size)
