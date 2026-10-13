"""Contact sheet: Blender line-up (render_env_sheet.py) + sky strip + texture sample -> docs/assets/previews/itch-psx-env.png
python -I make_sheet.py <repo root> <lineup.png>"""
import sys, os, json
from PIL import Image, ImageDraw
root, lineup = sys.argv[1], sys.argv[2]
W = 2400
L = Image.open(lineup).convert('RGB')
L = L.crop((0, 40, W, 400))                     # trim empty sky above / below
skies = json.load(open(os.path.join(root, 'public/assets/sky/itch/index.json')))
tw, th = 160, 80
cols = W // tw
rows = (len(skies) + cols - 1) // cols
S = Image.new('RGB', (W, rows * th), (20, 20, 24))
d = ImageDraw.Draw(S)
for i, s in enumerate(skies):
    im = Image.open(os.path.join(root, 'public' + s['path'])).convert('RGB').resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * th
    S.paste(im, (x, y))
    d.text((x + 3, y + 3), s['name'].replace('cloudy-sky-', 'c').replace('-', '_') + ' ' + s['mood'][:5], fill=(255, 255, 255))
idx = json.load(open(os.path.join(root, 'public/assets/textures/itch/index.json')))
tex = [e for e in idx if e['pack'].startswith('tiny-texture-pack')]
step = max(1, len(tex) // (W // 48))
sample = tex[::step][: W // 48]
T = Image.new('RGB', (W, 48), (20, 20, 24))
for i, e in enumerate(sample):
    T.paste(Image.open(os.path.join(root, 'public' + e['path'])).convert('RGB').resize((48, 48), Image.NEAREST), (i * 48, 0))
sheet = Image.new('RGB', (W, L.height + S.height + T.height + 4), (20, 20, 24))
sheet.paste(L, (0, 0)); sheet.paste(S, (0, L.height + 2)); sheet.paste(T, (0, L.height + S.height + 4))
sheet = sheet.resize((1800, round(sheet.height * 1800 / W)), Image.LANCZOS)
out = os.path.join(root, 'docs/assets/previews/itch-psx-env.png')
sheet.save(out, optimize=True)
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
