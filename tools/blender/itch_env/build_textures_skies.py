"""Tiny Texture Packs 1/2/3 + PSX Skyboxes Free + Cloudy Skyboxes Panorama  ->  public/assets/{textures,sky}/itch/
Runs with the system Python + Pillow (no Blender):  python -I tools/blender/itch_env/build_textures_skies.py <repo root>

* textures: 128 px tileables, flattened to <pack>/<ttN>-<category>-<nn>.png (kebab-case, 256-colour palette PNG, alpha dropped
  when fully opaque), merged into public/assets/textures/itch/index.json  ({name, path, category, tags, pack, size}).
* skies: PSX skies copied as-is (1024x512 panoramas + 256 px cubemap faces); cloudy panoramas downscaled 2048x1024 -> 1024x512 JPG.
  public/assets/sky/itch/index.json lists every sky with mood / fog colour.
"""
import sys, os, re, json, glob, shutil, colorsys
from PIL import Image

root = sys.argv[1]
CACHE = os.path.join(root, '.asset-cache/itch/psx-env')
TEX = os.path.join(root, 'public/assets/textures/itch')
SKY = os.path.join(root, 'public/assets/sky/itch')


def kebab(s):
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', s)
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return re.sub(r'-+', '-', s)


def colour_tags(im):
    """name the average colour of an image: grey/white/black or a hue name, plus dark/light."""
    px = im.convert('RGB').resize((1, 1), Image.BOX).getpixel((0, 0))
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in px])
    tags = []
    if v < 0.22:
        tags.append('black')
    elif s < 0.14:
        tags.append('white' if v > 0.8 else 'grey')
    else:
        deg = h * 360
        if deg < 15 or deg >= 345:
            name = 'red'
        elif deg < 40:
            name = 'brown' if v < 0.62 else 'orange'
        elif deg < 65:
            name = 'yellow' if s > 0.35 else 'beige'
        elif deg < 165:
            name = 'green'
        elif deg < 200:
            name = 'cyan'
        elif deg < 255:
            name = 'blue'
        elif deg < 300:
            name = 'purple'
        else:
            name = 'pink'
        tags.append(name)
    if v < 0.35 and 'black' not in tags:
        tags.append('dark')
    elif v > 0.72 and 'white' not in tags:
        tags.append('light')
    return tags


# ----------------------------------------------------------------------------- textures
CAT = {  # source folder -> (index category, descriptive tags)
    'bricks': ('brick', ['brick', 'wall']), 'brick': ('brick', ['brick', 'wall']),
    'grass': ('grass', ['grass', 'ground', 'nature']), 'roofs': ('roof', ['roof', 'shingles']),
    'tile': ('tile', ['tile', 'floor']), 'wood': ('wood', ['wood', 'planks']),
    'dirt': ('dirt', ['dirt', 'ground', 'earth']), 'elements': ('elements', ['elemental', 'magic', 'fx']),
    'metal': ('metal', ['metal', 'plate']), 'plaster': ('plaster', ['plaster', 'stucco', 'wall']),
    'stone': ('stone', ['stone', 'rock']), 'animal': ('animal', ['animal', 'hide', 'pattern']),
    'box': ('box', ['box', 'crate', 'cardboard']), 'cloth': ('cloth', ['cloth', 'fabric', 'pattern']),
    'gem': ('gem', ['gem', 'crystal', 'magic']), 'grating': ('grating', ['grating', 'grate', 'mesh', 'metal']),
    'terrain': ('terrain', ['terrain', 'ground', 'camouflage']), 'weave': ('weave', ['weave', 'wicker', 'pattern']),
}
PACKS = [('tiny-texture-pack', 'tiny-texture-pack-1', 'tt1'), ('tiny-texture-pack-2', 'tiny-texture-pack-2', 'tt2'),
         ('tiny-texture-pack-3', 'tiny-texture-pack-3', 'tt3')]

entries = []
for src_slug, out_pack, pre in PACKS:
    base = os.path.join(CACHE, src_slug, 'x/128x128')
    outdir = os.path.join(TEX, out_pack)
    os.makedirs(outdir, exist_ok=True)
    for cat_dir in sorted(os.listdir(base)):
        ckey = kebab(cat_dir)
        category, ctags = CAT[ckey]
        for f in sorted(os.listdir(os.path.join(base, cat_dir))):
            m = re.match(r'([A-Za-z]+)_(\d+)-128x128\.png$', f, re.I)
            if not m:
                print('SKIP', f)
                continue
            name = '%s-%s-%s' % (pre, ckey, m.group(2))
            im = Image.open(os.path.join(base, cat_dir, f))
            im.load()
            im = im.convert('RGBA')
            a = im.getchannel('A')
            has_alpha = sum(a.histogram()[:128]) > 0.002 * im.width * im.height  # a stray texel is not a cut-out
            if has_alpha:
                a1 = a.point(lambda v: 255 if v >= 128 else 0)
                im.putalpha(a1)
                q = im.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            else:
                q = im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            dst = os.path.join(outdir, name + '.png')
            q.save(dst, optimize=True)
            tags = ['psx', 'tileable'] + ctags + colour_tags(im) + ([] if not has_alpha else ['alpha'])
            entries.append({'name': name, 'path': '/assets/textures/itch/%s/%s.png' % (out_pack, name),
                            'category': category, 'tags': tags, 'pack': out_pack,
                            'size': '%dx%d' % q.size})
print('TEXTURES', len(entries))

idx_path = os.path.join(TEX, 'index.json')
data = []
if os.path.exists(idx_path):
    try:
        data = json.load(open(idx_path, encoding='utf-8'))
    except Exception:
        data = []
lst = data['textures'] if isinstance(data, dict) and 'textures' in data else (data if isinstance(data, list) else [])
mine = tuple('/assets/textures/itch/%s/' % p for _, p, _ in PACKS)
lst = [e for e in lst if not str(e.get('path', '')).startswith(mine)] + entries
if isinstance(data, dict) and 'textures' in data:
    data['textures'] = lst
else:
    data = lst
with open(idx_path, 'w', encoding='utf-8') as fh:
    json.dump(data, fh, indent=1)
print('INDEX', len(lst))

# ----------------------------------------------------------------------------- skies
sky_index = []


def hexcol(rgb):
    return '%02x%02x%02x' % tuple(int(round(c)) for c in rgb)


def avg_rows(im, y0, y1):
    strip = im.convert('RGB').crop((0, y0, im.width, y1)).resize((1, 1), Image.BOX)
    return strip.getpixel((0, 0))


# --- PSX Skyboxes Free (heyheythere, CC BY 4.0) : copied byte for byte
P = os.path.join(CACHE, 'psx-skyboxes-free/x/psx-skyboxes-free')
sk_meta = {s['name']: s for s in json.load(open(os.path.join(P, 'addons/psx_skyboxes/skies.json')))['skies']}
MOOD = {'night_moon': 'night', 'sunset_clouds': 'sunset', 'fog_grey': 'overcast', 'space_nebula': 'night'}
NOTE = {'night_moon': 'full moon, dithered night sky', 'sunset_clouds': 'warm sunset with clouds',
        'fog_grey': 'flat grey fog / overcast', 'space_nebula': 'purple nebula (space / void, no horizon)'}
out_psx = os.path.join(SKY, 'psx-skyboxes-free')
os.makedirs(out_psx, exist_ok=True)
for name, meta in sk_meta.items():
    cat = meta['category']
    kn = kebab(name)
    shutil.copyfile(os.path.join(P, 'panoramas/1024', cat, name + '.png'), os.path.join(out_psx, kn + '.png'))
    for face in ('px', 'nx', 'py', 'ny', 'pz', 'nz'):
        d = os.path.join(out_psx, 'cubemap', kn)
        os.makedirs(d, exist_ok=True)
        shutil.copyfile(os.path.join(P, 'cubemaps/256', cat, name, '%s_%s.png' % (name, face)),
                        os.path.join(d, face + '.png'))
    im = Image.open(os.path.join(out_psx, kn + '.png'))
    sky_index.append({'name': kn, 'path': '/assets/sky/itch/psx-skyboxes-free/%s.png' % kn, 'pack': 'psx-skyboxes-free',
                      'mood': MOOD[name], 'size': '%dx%d' % im.size, 'format': 'png',
                      'cubemap': '/assets/sky/itch/psx-skyboxes-free/cubemap/%s/{px,nx,py,ny,pz,nz}.png' % kn,
                      'fog': meta['fog'], 'light': meta['light'], 'light_energy': meta['light_energy'],
                      'note': NOTE[name], 'license': 'CC BY 4.0'})
with open(os.path.join(out_psx, 'CREDITS.txt'), 'w', encoding='utf-8') as fh:
    fh.write('PSX Skyboxes Free by heyheythere - https://heyheythere.itch.io/psx-skyboxes-free - CC BY 4.0\n'
             'Licence: https://creativecommons.org/licenses/by/4.0/ (attribution required; the line above is the credit line\n'
             'given by the author in LICENSE.txt). Files are unmodified apart from renaming (snake_case -> kebab-case).\n'
             'Panoramas: equirectangular 1024x512, 32 colours, ordered-dithered. Cubemaps: 256 px faces (OpenGL order).\n')

# --- Cloudy Skyboxes Panorama (Screaming Brain Studios, CC0): 2048x1024 -> 1024x512 JPG
MOODS = {  # hand-classified from the contact sheet (number -> (mood, note))
    1: ('overcast', 'stormy grey, low pale sun'), 2: ('sunset', 'hazy golden sun behind clouds'),
    3: ('sunset', 'dusty orange sun on the horizon'), 4: ('day', 'clear blue, bright sun and cumulus'),
    5: ('day', 'clear blue, wispy clouds'), 6: ('day', 'deep blue, very few clouds, glaring sun'),
    7: ('sunset', 'pastel pink and lilac clouds'), 8: ('day', 'pale blue, hazy overcast'),
    9: ('overcast', 'storm front, yellow horizon band'), 10: ('overcast', 'grey-green murk'),
    11: ('night', 'violet twilight, clouds lit from the sun'), 12: ('night', 'dark purple dusk, small moon'),
    13: ('sunset', 'sepia dust haze'), 14: ('night', 'green aurora, fantasy'),
    15: ('night', 'near black, tiny orange sun'), 16: ('day', 'periwinkle blue, big white cloud'),
    17: ('sunset', 'magenta dusk, yellow sun'), 18: ('sunset', 'cool slate blue, bright low sun'),
    19: ('sunset', 'blood red sky, crimson clouds'), 20: ('overcast', 'white-grey fog, bright sun disc'),
    21: ('sunset', 'golden orange sunset'), 22: ('sunset', 'dark orange sunset'),
    23: ('sunset', 'pink cloud mass, pastel'), 24: ('overcast', 'pale beige haze'),
    25: ('overcast', 'grey-lilac dusk haze'),
}
out_cl = os.path.join(SKY, 'cloudy-skyboxes-panorama')
os.makedirs(out_cl, exist_ok=True)
for f in sorted(glob.glob(os.path.join(CACHE, 'cloudy-skyboxes-pack/x/Panorama/Panorama_Sky_*-512x512.png'))):
    n = int(re.search(r'Sky_(\d+)', f).group(1))
    im = Image.open(f).convert('RGB')
    small = im.resize((1024, 512), Image.LANCZOS)
    name = 'cloudy-sky-%02d' % n
    dst = os.path.join(out_cl, name + '.jpg')
    small.save(dst, quality=88, subsampling=0, optimize=True)
    mood, note = MOODS[n]
    sky_index.append({'name': name, 'path': '/assets/sky/itch/cloudy-skyboxes-panorama/%s.jpg' % name,
                      'pack': 'cloudy-skyboxes-panorama', 'mood': mood, 'size': '1024x512', 'format': 'jpg',
                      'fog': hexcol(avg_rows(small, 236, 250)), 'zenith': hexcol(avg_rows(small, 0, 24)),
                      'note': note, 'license': 'CC0 1.0'})
    print('SKY', name, os.path.getsize(dst) // 1024, 'KB')
with open(os.path.join(SKY, 'index.json'), 'w', encoding='utf-8') as fh:
    json.dump(sky_index, fh, indent=1)
print('SKIES', len(sky_index))
