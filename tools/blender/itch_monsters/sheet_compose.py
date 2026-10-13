"""sheet_compose.py - glue the 256x192 cells into one labelled contact sheet (system Python + Pillow).
python -I sheet_compose.py <cells dir> <out.png> [columns=6]"""
import sys, os
from PIL import Image, ImageDraw
cells, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
labels = open(os.path.join(cells, 'labels.txt')).read().split('\n')
W, H = 256, 192
rows = (len(labels) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W, rows * H), (20, 20, 24))
d = ImageDraw.Draw(sheet)
for i, lab in enumerate(labels):
    im = Image.open(os.path.join(cells, '%02d.png' % i)).convert('RGB')
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im, (x, y))
    d.rectangle([x, y, x + W - 1, y + 13], fill=(0, 0, 0))
    d.text((x + 3, y + 1), lab, fill=(255, 255, 255))
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out, optimize=True)
print('sheet', sheet.size, os.path.getsize(out))
