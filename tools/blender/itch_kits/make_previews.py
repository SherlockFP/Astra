"""Build docs/assets/previews/itch-kits.png: two true-scale line-ups + a labelled thumbnail grid per pack.
Usage (system Python with Pillow):  python -I tools/blender/itch_kits/make_previews.py <repo root> [blender.exe]
Renders with headless Blender (Workbench) via render_thumbs.py / render_lineup.py, composes with Pillow.
"""
import sys, os, json, subprocess, glob, tempfile
from PIL import Image, ImageDraw, ImageFont

root = sys.argv[1]
blender = sys.argv[2] if len(sys.argv) > 2 else r'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
here = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(root, 'public/assets/models/itch')
tmp = os.path.join(root, '.asset-cache/itch/kits/_preview_tmp')
os.makedirs(tmp, exist_ok=True)
PACKS = [('psx-dungeon', 'goblinatron PSX Dungeon (CC BY 4.0)  x0.2: 1 module = 4 m tile'),
         ('psx-medieval', 'valsekamerplant PSX Going Medieval (CC0)  x1.25: 5 m module, 2.72 m door'),
         ('nocturnal-watch', 'toboas PSX Nocturnal Watch (CC0)  x4/3 (props sized individually)'),
         ('fantasy-weapons-bits', 'KayKit Fantasy Weapons Bits (CC0)  x1 (KayKit weapon scale)')]


def bl(script, *args):
    cmd = [blender, '--background', '--factory-startup', '--python', os.path.join(here, script), '--'] + list(args)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stdout[-2000:], r.stderr[-2000:])


K = os.path.join(root, 'public/assets/models/characters/Knight.glb') + '|KayKit Knight (2.4 m)#'
L1 = [K] + [os.path.join(M, p) + '|' + l for p, l in [
    ('psx-dungeon/wall_01.glb', 'dungeon wall_01'), ('psx-dungeon/door_frame_01.glb', 'door_frame_01'),
    ('psx-dungeon/door_01.glb', 'door_01'), ('psx-dungeon/pillar.glb', 'pillar'), ('psx-dungeon/chest.glb', 'chest'),
    ('psx-dungeon/barrel.glb', 'barrel'), ('psx-medieval/building/plaster_wall_stone_base_half.glb', 'medieval half block'),
    ('psx-medieval/decoration/door_wood.glb', 'door_wood'), ('psx-medieval/decoration/window_rectangle.glb', 'window'),
    ('psx-medieval/market/barrel.glb', 'barrel'), ('psx-medieval/market/crate_apples.glb', 'crate'),
    ('psx-medieval/market/market_stall_red.glb', 'market_stall_red')]]
L2 = [K] + [os.path.join(M, p) + '|' + l for p, l in [
    ('nocturnal-watch/npc_peasant.glb', 'npc_peasant'), ('nocturnal-watch/npc_inquisitor.glb', 'npc_inquisitor'),
    ('nocturnal-watch/witch.glb', 'witch'), ('nocturnal-watch/tavern_wall_base_door.glb', 'tavern wall door'),
    ('nocturnal-watch/tavern_bar.glb', 'tavern_bar'), ('nocturnal-watch/well.glb', 'well'),
    ('nocturnal-watch/barrel.glb', 'barrel'), ('nocturnal-watch/crate.glb', 'crate'),
    ('nocturnal-watch/signpost.glb', 'signpost'), ('nocturnal-watch/church_bench.glb', 'church_bench'),
    ('fantasy-weapons-bits/sword_a.glb', 'sword_a'), ('fantasy-weapons-bits/sword_e.glb', 'sword_e'),
    ('fantasy-weapons-bits/shield_b.glb', 'shield_b'), ('fantasy-weapons-bits/halberd.glb', 'halberd')]]
bl('render_lineup.py', os.path.join(tmp, 'lineup1.png'), '2400', '640', *L1)
bl('render_lineup.py', os.path.join(tmp, 'lineup2.png'), '2400', '640', *L2)

files = []
for p, _ in PACKS:
    files += sorted(glob.glob(os.path.join(M, p, '**/*.glb'), recursive=True))
lst = os.path.join(tmp, 'all.txt')
open(lst, 'w').write('\n'.join(files))
thumbs = os.path.join(tmp, 'thumbs')
bl('render_thumbs.py', thumbs, '120', lst)

# heights from the conversion reports
info = {}
for rp in glob.glob(os.path.join(here, '_reports/*.json')):
    for r in json.load(open(rp)):
        info[os.path.normcase(os.path.abspath(r['file']))] = r

try:
    font = ImageFont.truetype('arial.ttf', 11)
    hfont = ImageFont.truetype('arialbd.ttf', 22)
except Exception:
    font = hfont = ImageFont.load_default()

W, cell, cols = 2400, 120, 20
lab_h = 26
blocks = []
from PIL import ImageChops
for f in ('lineup1.png', 'lineup2.png'):
    im = Image.open(os.path.join(tmp, f)).convert('RGB')
    bg = Image.new('RGB', im.size, im.getpixel((2, 2)))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 12 else 0)
    bb = diff.getbbox()
    if bb:  # trim empty sky / floor rows
        im = im.crop((0, max(0, bb[1] - 16), im.width, min(im.height, bb[3] + 16)))
    blocks.append(('img', im))
for p, title in PACKS:
    pf = [f for f in files if os.sep + p + os.sep in os.path.normpath(f) or '/' + p + '/' in f.replace('\\', '/')]
    blocks.append(('title', '%s  -  %d GLBs  -  %s' % (p, len(pf), title)))
    rows = (len(pf) + cols - 1) // cols
    sheet = Image.new('RGB', (W, rows * (cell + lab_h)), (34, 36, 42))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(pf):
        name = os.path.basename(os.path.dirname(f)) + '__' + os.path.splitext(os.path.basename(f))[0]
        tp = os.path.join(thumbs, name + '.png')
        x, y = (i % cols) * cell, (i // cols) * (cell + lab_h)
        if os.path.exists(tp):
            sheet.paste(Image.open(tp).convert('RGB'), (x, y))
        r = info.get(os.path.normcase(os.path.abspath(f)))
        rel = os.path.relpath(f, os.path.join(M, p)).replace('\\', '/')[:-4]
        if '/' in rel:
            rel = rel.split('/')[-1]
        d.text((x + 2, y + cell), rel[:22], fill=(255, 230, 120), font=font)
        if r:
            d.text((x + 2, y + cell + 12), 'h %.2f  %d tri' % (r['size'][1], r['tris']), fill=(190, 200, 210), font=font)
    blocks.append(('img', sheet))

H = sum(b[1].height if b[0] == 'img' else 40 for b in blocks) + 50
out = Image.new('RGB', (W, H), (24, 25, 30))
d = ImageDraw.Draw(out)
d.text((10, 10), 'EFSUN ONLINE - itch.io PSX town/dungeon kits (converted GLBs). Line-ups at true scale: red = 2.4 m hero, blue = 4 m tile.',
       fill=(255, 255, 255), font=hfont)
y = 50
for kind, b in blocks:
    if kind == 'img':
        out.paste(b, (0, y)); y += b.height
    else:
        d.text((10, y + 8), b, fill=(140, 220, 255), font=hfont); y += 40
dst = os.path.join(root, 'docs/assets/previews/itch-kits.png')
out.quantize(256, method=Image.Quantize.MEDIANCUT).save(dst, optimize=True)
print('PREVIEW', dst, out.size, os.path.getsize(dst))
