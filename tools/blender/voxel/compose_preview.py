#!/usr/bin/env python
"""compose_preview.py  -  stacks the transparent Blender passes from render_preview.py on one background and adds labels.

  python -I tools/blender/voxel/compose_preview.py --layout <dir>/layout.json --out docs/assets/previews/voxel-proto.png

System Python + Pillow only (no Blender). Reads the pass PNGs and the pixel anchors written by render_preview.py.
"""
import os
import sys
import json
import argparse

from PIL import Image, ImageDraw, ImageFont

BG = (28, 31, 38)
INK = (236, 236, 228)
DIM = (170, 176, 186)
ACCENT = (240, 190, 90)
HEADER_H = 92


def font(size, bold=False):
    cands = (["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if bold
             else ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
    for p in cands:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--layout", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    lay = json.load(open(a.layout, encoding="utf8"))
    base_dir = os.path.dirname(os.path.abspath(a.layout))
    W, H = int(lay["width"]), int(lay["height"])

    canvas = Image.new("RGBA", (W, H + HEADER_H), BG + (255,))
    for name in lay["passes"]:
        p = Image.open(os.path.join(base_dir, name)).convert("RGBA")
        canvas.alpha_composite(p, (0, HEADER_H))

    d = ImageDraw.Draw(canvas)
    d.text((34, 22), lay.get("title", ""), font=font(34, bold=True), fill=INK)
    d.text((34, 62), "3/4 view, Workbench + studio light, PSX post pass not applied. Left = ORIGINAL, right = VOXEL (same frame).",
           font=font(22), fill=DIM)

    for lab in lay["labels"]:
        if lab.get("px") is None:
            continue
        x, y = lab["px"]
        y += HEADER_H
        kind = lab.get("kind")
        if kind == "pose":
            d.text((x, y), lab["text"], font=font(28, bold=True), fill=ACCENT, anchor="mm")
        elif kind == "tree":
            d.text((x, y), lab["text"], font=font(24), fill=INK, anchor="md")
        else:
            d.text((x, y), lab["text"], font=font(24, bold=True), fill=INK, anchor="md")

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    canvas.convert("RGB").save(a.out, optimize=True)
    print("WROTE", os.path.abspath(a.out), canvas.size)


if __name__ == "__main__":
    main()
