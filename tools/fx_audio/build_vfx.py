"""Build web-ready VFX sprite sheets from the itch "fx-audio" downloads.

Usage (run with python -I, never from inside the untrusted archive folder):
    python -I tools/fx_audio/build_vfx.py <fx-audio cache dir> <public/assets dir> <existing vfx doc>

Inputs (already extracted, untrusted data):
    <cache>/brackeys-vfx-bundle/x/brackeys_vfx_bundle/{particles/alpha,flipbooks,predrawn}
    <cache>/super-pixel-effects-gigapack/x/Super Pixel Effects Gigapack (Free Version)/PNG/<Category>/<anim>/<anim>_large_<colour>/frameNNNN.png

Outputs:
    <assets>/vfx/itch/brackeys-vfx-bundle/{particles,flipbooks,predrawn}/*.png
    <assets>/vfx/itch/super-pixel-effects/<category>/*.png
    <assets>/vfx/itch/index.json   (grid layout of every sheet, for the VFX code)

Every sheet is re-packed into a clean grid: integer frame size, frames row-major
starting top-left, no empty leading/trailing cells.  Only PIL + numpy are used.
"""
import glob
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image

CACHE, ASSETS, VFX_DOC = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = os.path.join(ASSETS, "vfx", "itch")
BK_SRC = os.path.join(CACHE, "brackeys-vfx-bundle", "x", "brackeys_vfx_bundle")
SPX_SRC = os.path.join(CACHE, "super-pixel-effects-gigapack", "x",
                       "Super Pixel Effects Gigapack (Free Version)", "PNG")


def kebab(s):
    s = re.sub(r"([a-z])([A-Z])", r"\1-\2", s)
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return s


def resize_premul(im, size, resample=Image.LANCZOS):
    """Resize RGBA with premultiplied alpha so edges do not get dark fringes."""
    if im.size == tuple(size):
        return im
    return im.convert("RGBa").resize(size, resample).convert("RGBA")


def cell_has_content(cell):
    a = np.asarray(cell)[..., 3]
    return a.max() > 8 and int(a.astype(np.int64).sum()) > 400


def grid_for(n, fw, fh):
    cols = max(1, math.ceil(math.sqrt(n * fh / fw)))
    cols = min(cols, n)
    rows = math.ceil(n / cols)
    return cols, rows


def pack(frames, fw, fh, path):
    n = len(frames)
    cols, rows = grid_for(n, fw, fh)
    sheet = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * fw, (i // cols) * fh))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path, optimize=True)
    return cols, rows, sheet.size


def rel_url(path):
    return "/" + os.path.relpath(path, os.path.dirname(ASSETS)).replace("\\", "/")


def black_to_alpha(im):
    """RGB on black (additive) -> RGBA usable with both Normal and Additive blending."""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    alpha = a.max(axis=2)
    safe = np.maximum(alpha, 1.0)[..., None]
    rgb = np.clip(a / safe * 255.0, 0, 255)
    out = np.dstack([rgb, alpha]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def cut_cells(im, cols, rows):
    W, H = im.size
    cells = []
    for j in range(rows):
        for i in range(cols):
            box = (round(i * W / cols), round(j * H / rows), round((i + 1) * W / cols), round((j + 1) * H / rows))
            cells.append(im.crop(box))
    return cells, W / cols, H / rows


def split_runs(cells, min_gap):
    """Trim empty cells; split into separate animations at runs of >= min_gap empty cells."""
    flags = [cell_has_content(c) for c in cells]
    anims, cur, gap = [], [], 0
    for c, f in zip(cells, flags):
        if f:
            if cur and gap >= min_gap:
                anims.append(cur)
                cur = []
            elif cur and gap:
                cur.extend([None] * gap)  # keep short internal pauses
            cur.append(c)
            gap = 0
        else:
            gap += 1
    if cur:
        anims.append(cur)
    return anims


index = {
    "about": "Sprite-sheet layout for /assets/vfx/itch. Frames are row-major from the TOP-LEFT cell; "
             "frame i is at col = i % cols, row = floor(i / cols). With three.js (flipY = true): "
             "texture.repeat.set(1/cols, 1/rows); texture.offset.set(col/cols, 1 - (row+1)/rows). "
             "Use NearestFilter + generateMipmaps=false for the PSX look.",
    "sheets": [],
    "particles": [],
}

# ---------------------------------------------------------------- Brackeys particles (extras only)
existing = set(re.findall(r"\| ([a-z]+_\d+)\.png \|", open(VFX_DOC, encoding="utf-8").read()))
pdir = os.path.join(OUT, "brackeys-vfx-bundle", "particles")
os.makedirs(pdir, exist_ok=True)
for f in sorted(glob.glob(os.path.join(BK_SRC, "particles", "alpha", "*_a.png"))):
    base = os.path.basename(f)[:-6]  # strip _a.png
    if base in existing:
        continue  # already shipped as /assets/textures/vfx/* (Kenney, same source image)
    im = Image.open(f).convert("RGBA")
    im = resize_premul(im, (256, 256))
    a = np.asarray(im)[..., 3]
    la = Image.fromarray(np.dstack([np.full_like(a, 255), a]), "LA")
    name = kebab(base) + ".png"
    dst = os.path.join(pdir, name)
    la.save(dst, optimize=True)
    index["particles"].append({
        "id": "brackeys-" + kebab(base), "path": rel_url(dst), "size": 256,
        "format": "gray+alpha (white RGB, alpha = shape); tint with material.color",
        "source": "brackeys_vfx_bundle/particles/alpha/" + os.path.basename(f),
    })

# ---------------------------------------------------------------- Brackeys flipbooks (Thomas Iche, TGA)
FLIP_META = {
    "cloud": ("smoke", 24, True, "normal", ["cloud", "smoke", "fog", "dust"]),
    "explosion": ("explosion", 30, False, "normal", ["explosion", "fire", "boom"]),
    "explosion_smoke": ("explosion", 30, False, "normal", ["explosion", "smoke"]),
    "fire": ("fire", 30, True, "additive", ["fire", "flame", "burn", "loop"]),
    "flame": ("fire", 24, True, "additive", ["flame", "torch", "fire", "loop"]),
    "wispy_smoke": ("smoke", 24, False, "normal", ["smoke", "wisp", "poison", "ghost"]),
}
for f in sorted(glob.glob(os.path.join(BK_SRC, "flipbooks", "*.tga"))):
    stem = os.path.basename(f)[:-4]
    m = re.match(r"(.+?)_(\d+)_(\d+)x(\d+)$", stem)
    kind, num, cols, rows = m.group(1), m.group(2), int(m.group(3)), int(m.group(4))
    src = Image.open(f)
    rgb_only = src.mode == "RGB"
    im = black_to_alpha(src) if rgb_only else src.convert("RGBA")
    cells, cw, ch = cut_cells(im, cols, rows)
    fw, fh = round(cw * 0.5), round(ch * 0.5)  # 128 px cells -> 64 px (PSX budget)
    frames = [c for c in cells]
    while frames and not cell_has_content(frames[-1]):
        frames.pop()
    frames = [resize_premul(c, (fw, fh)) for c in frames]
    name = f"{kebab(kind)}-{num}"
    dst = os.path.join(OUT, "brackeys-vfx-bundle", "flipbooks", name + ".png")
    gc, gr, size = pack(frames, fw, fh, dst)
    cat, fps, loop, blend, tags = FLIP_META[kind]
    index["sheets"].append({
        "id": "brackeys-" + name, "path": rel_url(dst), "pack": "brackeys-vfx-bundle", "category": cat,
        "cols": gc, "rows": gr, "frames": len(frames), "frameWidth": fw, "frameHeight": fh,
        "width": size[0], "height": size[1], "fps": fps, "loop": loop, "blending": blend,
        "style": "painted", "tags": tags,
        "note": ("source was RGB on black; converted to RGBA (alpha = max channel)" if rgb_only else "")
                + (f"; source grid {cols}x{rows} with non-integer cells" if (im.size[0] % cols or im.size[1] % rows) else ""),
        "source": "brackeys_vfx_bundle/flipbooks/" + os.path.basename(f),
    })

# ---------------------------------------------------------------- Brackeys predrawn (CodeManu)
PRE_META = {
    "big_hit": ("impact", ["hit", "impact", "crit", "spark"]),
    "blood_impact": ("impact", ["blood", "hit", "gore"]),
    "charge": ("magic", ["charge", "cast", "wind-up", "lightning"]),
    "dithered_fire": ("fire", ["fire", "ground-fire", "wall", "loop", "pixel"]),
    "electric_ring": ("lightning", ["lightning", "ring", "shock", "aura", "loop"]),
    "explosion": ("explosion", ["explosion", "fire", "boom"]),
    "fire_point": ("fire", ["fire", "torch", "burn", "loop"]),
    "fire_ring": ("fire", ["fire", "ring", "nova", "aura", "loop"]),
    "impact_white": ("impact", ["hit", "impact", "white", "tintable"]),
    "lightstreaks": ("magic", ["beam", "speed-lines", "teleport", "loop"]),
    "star_explosion": ("impact", ["stars", "stun", "crit", "burst"]),
    "vortex": ("magic", ["vortex", "portal", "black-hole", "summon"]),
    "wavy_blue": ("magic", ["frost", "aura", "flame", "spirit", "loop"]),
    "wavy_purple": ("magic", ["arcane", "aura", "flame", "shadow", "loop"]),
}
LOOPING = {"dithered_fire", "electric_ring", "fire_point", "fire_ring", "lightstreaks", "wavy_blue", "wavy_purple"}
for f in sorted(glob.glob(os.path.join(BK_SRC, "predrawn", "*.png"))):
    stem = os.path.basename(f)[:-4]
    m = re.match(r"(.+?)_(\d+)x(\d+)$", stem)
    kind, cols, rows = m.group(1), int(m.group(2)), int(m.group(3))
    im = Image.open(f).convert("RGBA")
    cells, cw, ch = cut_cells(im, cols, rows)
    s = min(1.0, 128.0 / max(cw, ch))
    fw, fh = max(1, round(cw * s)), max(1, round(ch * s))
    anims = split_runs(cells, min_gap=3)
    for k, frames in enumerate(anims):
        frames = [resize_premul(c, (fw, fh)) if c is not None else Image.new("RGBA", (fw, fh)) for c in frames]
        name = kebab(kind) + ("" if len(anims) == 1 else "-" + "abcdefgh"[k])
        dst = os.path.join(OUT, "brackeys-vfx-bundle", "predrawn", name + ".png")
        gc, gr, size = pack(frames, fw, fh, dst)
        cat, tags = PRE_META[kind]
        index["sheets"].append({
            "id": "brackeys-" + name, "path": rel_url(dst), "pack": "brackeys-vfx-bundle", "category": cat,
            "cols": gc, "rows": gr, "frames": len(frames), "frameWidth": fw, "frameHeight": fh,
            "width": size[0], "height": size[1], "fps": 20, "loop": kind in LOOPING, "blending": "normal",
            "style": "hand-drawn", "tags": tags,
            "note": f"source grid {cols}x{rows} ({cw:.1f}x{ch:.1f} px cells), empty cells trimmed"
                    + (f", split into {len(anims)} animations" if len(anims) > 1 else ""),
            "source": "brackeys_vfx_bundle/predrawn/" + os.path.basename(f),
        })

# ---------------------------------------------------------------- Super Pixel Effects (unTied Games)
SKIP = re.compile(r"_text_|heartbeat|muzzle_flash")  # English text banners / sci-fi UI that do not fit
SPX_BLEND_ADD = re.compile(r"lightning|light_burst|sparkle|warp|charge|spark|fire_looping|firework")
SPX_LOOP = re.compile(r"looping|status_|heartbeat")
for d in sorted(glob.glob(os.path.join(SPX_SRC, "*", "*", "*_large_*"))):
    anim = os.path.basename(d)
    cat_dir = os.path.basename(os.path.dirname(os.path.dirname(d)))
    base, colour = re.match(r"(.+)_large_(\w+)$", anim).groups()
    if SKIP.search(base):
        continue
    files = sorted(glob.glob(os.path.join(d, "frame*.png")))
    frames = [Image.open(x).convert("RGBA") for x in files]
    fw, fh = frames[0].size
    name = kebab(base)
    cat = kebab(cat_dir)
    dst = os.path.join(OUT, "super-pixel-effects", cat, name + ".png")
    gc, gr, size = pack(frames, fw, fh, dst)
    tags = [t for t in name.split("-") if not t.isdigit()] + [colour]
    index["sheets"].append({
        "id": "spx-" + name, "path": rel_url(dst), "pack": "super-pixel-effects", "category": cat,
        "cols": gc, "rows": gr, "frames": len(frames), "frameWidth": fw, "frameHeight": fh,
        "width": size[0], "height": size[1], "fps": 15, "loop": bool(SPX_LOOP.search(base)),
        "blending": "additive-ok" if SPX_BLEND_ADD.search(base) else "normal",
        "style": "pixel-art", "colour": colour, "tags": tags,
        "source": f"PNG/{cat_dir}/{os.path.basename(os.path.dirname(d))}/{anim}",
    })

with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
    json.dump(index, fh, indent=1)
print("sheets", len(index["sheets"]), "particles", len(index["particles"]))
