"""Publish the PSX-ified textures that the tree / nature / walls GLBs embed as loose PNGs (same pixels as inside the GLBs) so that one
shared material / InstancedMesh can be built per pack, and merge them into public/assets/textures/itch/index.json.
Usage: python -I tools/blender/itch_env/publish_model_textures.py <repo root>   (run after convert_env.py)
"""
import sys, os, re, json, shutil
from PIL import Image

root = sys.argv[1]
SRC = os.path.join(root, '.asset-cache/itch/psx-env/_psx_tex')
TEX = os.path.join(root, 'public/assets/textures/itch')

WALL_CAT = {'brick-wall': ('brick', ['brick', 'wall']), 'concrete-bare': ('stone', ['concrete', 'cap']),
            'metal-bare': ('metal', ['metal', 'bare']), 'stone-wall': ('stone', ['stone', 'drystone', 'wall']),
            'roof-tiles': ('roof', ['roof', 'tiles']), 'low-wooden-wall': ('wood', ['wood', 'fence']),
            'plackard-wall': ('wood', ['wood', 'planks', 'wall']), 'stucco': ('plaster', ['plaster', 'stucco', 'wall']),
            'plastic-gate': ('grating', ['gate', 'bars', 'alpha']), 'white-picket-fence': ('wood', ['wood', 'white', 'picket']),
            'fence-mesh': ('grating', ['chain-link', 'mesh', 'alpha']), 'rusted-pipe': ('metal', ['metal', 'rust', 'pipe'])}
PACKS = [('retro-psx-tree-pack', 'rtp'), ('retro-psx-nature-pack', 'rnp'), ('psx-walls-fences', 'wf')]

entries = []
for pack, pre in PACKS:
    d = os.path.join(SRC, pack)
    out = os.path.join(TEX, pack)
    os.makedirs(out, exist_ok=True)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png'):
            continue
        stem = f[:-4]
        name = '%s-%s' % (pre, stem)
        shutil.copyfile(os.path.join(d, f), os.path.join(out, name + '.png'))
        im = Image.open(os.path.join(out, name + '.png'))
        alpha = 'A' in im.getbands() or im.mode == 'P' and 'transparency' in im.info
        if pack == 'psx-walls-fences':
            cat, tags = WALL_CAT[stem]
            tags = ['psx', 'model-texture'] + tags
        else:
            m = re.match(r'(tree|bush|grass)(.*)', stem)
            kind = {'tree': 'tree', 'bush': 'bush', 'grass': 'grass'}[m.group(1)]
            season = next((s for s in ('spring', 'summer', 'fall', 'winter') if s in stem), None)
            cat = 'foliage'
            tags = ['psx', 'atlas', 'foliage', kind] + ([season] if season else []) + ['alpha']
        entries.append({'name': name, 'path': '/assets/textures/itch/%s/%s.png' % (pack, name), 'category': cat,
                        'tags': tags + (['alpha'] if alpha and 'alpha' not in tags else []), 'pack': pack,
                        'size': '%dx%d' % im.size})
print('MODEL TEXTURES', len(entries))

idx = os.path.join(TEX, 'index.json')
data = json.load(open(idx, encoding='utf-8'))
lst = data['textures'] if isinstance(data, dict) and 'textures' in data else data
mine = tuple('/assets/textures/itch/%s/' % p for p, _ in PACKS)
lst = [e for e in lst if not str(e.get('path', '')).startswith(mine)] + entries
if isinstance(data, dict) and 'textures' in data:
    data['textures'] = lst
else:
    data = lst
with open(idx, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=1)
print('INDEX', len(lst))
