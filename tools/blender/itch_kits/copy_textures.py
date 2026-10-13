"""Copy the tileable textures / shared atlases of the PSX kits to public/assets/textures/itch/<pack>/ (kebab-case PNG)
and merge them into public/assets/textures/itch/index.json  ({name, path, category, tags, pack, size}).
Usage: python -I tools/blender/itch_kits/copy_textures.py <repo root>
Entries of other packs already in index.json are preserved (only paths under this script's pack folders are replaced).
"""
import sys, os, json, re, shutil
from PIL import Image

root = sys.argv[1]
K = os.path.join(root, '.asset-cache/itch/kits')
T = os.path.join(root, 'public/assets/textures/itch')

def kebab(s):
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', s)
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return re.sub(r'-+', '-', s)

entries = []

def put(pack, src, name, category, tags, keep_bytes=False):
    dst_dir = os.path.join(T, pack)
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, name + '.png')
    im = Image.open(src)
    if keep_bytes and src.lower().endswith('.png'):
        shutil.copyfile(src, dst)
    else:
        im.load()
        im = im.convert('RGBA') if 'A' in im.getbands() or im.mode == 'P' else im.convert('RGB')
        im.save(dst, optimize=True)
    entries.append({'name': name, 'path': '/assets/textures/itch/%s/%s.png' % (pack, name), 'category': category,
                    'tags': tags, 'pack': pack, 'size': '%dx%d' % Image.open(dst).size})

# goblinatron PSX Dungeon (CC BY 4.0): 64 px tiles + the 3 atlases its models use
dsrc = os.path.join(K, 'psx-dungeon/x/PSX_Dungeon/Textures')
DUNG_TAGS = {'arch': ['stone', 'arch', 'wall'], 'barrel': ['wood', 'barrel'], 'candle': ['wax', 'candle'],
             'chain': ['metal', 'chain', 'alpha'], 'crate': ['wood', 'crate'], 'decor': ['stone', 'ornament', 'floor'],
             'door': ['door', 'wood', 'metal'], 'ground': ['stone', 'floor', 'tiles'], 'lock': ['metal', 'lock', 'alpha'],
             'metal': ['metal', 'plate'], 'pillar': ['stone', 'pillar', 'fluted'], 'planks': ['wood', 'planks', 'floor'],
             'rusty': ['metal', 'rust'], 'skull': ['bone', 'skulls', 'wall', 'catacomb'], 'stair': ['stone', 'stairs'],
             'wall': ['stone', 'bricks', 'wall'], 'water': ['water', 'liquid', 'green']}
for f in sorted(os.listdir(dsrc)):
    stem = os.path.splitext(f)[0]
    if stem.startswith('TEX_'):
        name = kebab(stem[4:])
        key = name.split('-')[0]
        put('psx-dungeon', os.path.join(dsrc, f), name, 'dungeon', ['psx', 'tile'] + DUNG_TAGS.get(key, []), keep_bytes=True)
    else:
        # the PSX-ified copy (palette PNG, hard alpha) is byte-identical to the image embedded in the GLBs
        psx = os.path.join(K, 'psx-dungeon/psx_tex', re.sub(r'-', '_', kebab(stem)) + '.png')
        put('psx-dungeon', psx, kebab(stem), 'atlas', ['psx', 'atlas', 'dungeon'], keep_bytes=True)

# valsekamerplant Going Medieval (CC0): tileable 64-128 px textures + PSX-ified atlases (same pixels as in the GLBs)
msrc = os.path.join(K, 'psx-style-going-medieval/x/Textures')
for f, cat, tags in [('generic_wood.png', 'wood', ['wood', 'grain', 'dark']), ('wood_planks.jpg', 'wood', ['wood', 'planks', 'floor']),
                     ('hay.jpg', 'nature', ['hay', 'straw', 'ground']), ('hay_dried.png', 'nature', ['hay', 'straw', 'dry']),
                     ('jute.jpg', 'fabric', ['jute', 'cloth', 'sack']), ('terracotta.png', 'ceramic', ['terracotta', 'clay', 'pottery'])]:
    put('psx-medieval', os.path.join(msrc, f), kebab(os.path.splitext(f)[0]), cat, ['psx', 'tile'] + tags)
mtex = os.path.join(K, 'psx-style-going-medieval/psx_tex')
for f, tags in [('bauerhaus.png', ['timber-frame', 'plaster', 'roof', 'windows', 'flowers']), ('market.png', ['market', 'produce', 'awning']),
                ('market_misc.png', ['food', 'meat', 'bread'])]:
    put('psx-medieval', os.path.join(mtex, f), kebab(os.path.splitext(f)[0]), 'atlas', ['psx', 'atlas', 'medieval'] + tags, keep_bytes=True)

# KayKit Fantasy Weapons Bits (CC0): the gradient palette used by every weapon GLB (256 px PSX version)
put('fantasy-weapons-bits', os.path.join(K, 'fantasy-weapons-bits/psx_tex/weapons_bits_texture.png'), 'weapons-bits-texture', 'atlas',
    ['psx', 'atlas', 'palette', 'kaykit', 'weapons'], keep_bytes=True)

# merge into index.json
idx_path = os.path.join(T, 'index.json')
mine = ('/assets/textures/itch/psx-dungeon/', '/assets/textures/itch/psx-medieval/', '/assets/textures/itch/fantasy-weapons-bits/')
data = []
if os.path.exists(idx_path):
    try:
        data = json.load(open(idx_path, encoding='utf-8'))
    except Exception:
        data = []
lst = data['textures'] if isinstance(data, dict) and 'textures' in data else (data if isinstance(data, list) else [])
lst = [e for e in lst if not str(e.get('path', '')).startswith(mine)] + entries
if isinstance(data, dict) and 'textures' in data:
    data['textures'] = lst
else:
    data = lst
with open(idx_path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=1)
print('TEXTURES', len(entries), 'index entries', len(lst))
