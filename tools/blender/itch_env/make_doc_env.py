"""Generate docs/assets/itch-psx-env.md from the conversion reports + indexes.
python -I tools/blender/itch_env/make_doc_env.py <repo root>"""
import sys, os, json, re, collections

root = sys.argv[1]
REP = os.path.join(root, 'tools/blender/itch_env/_reports')
PUB = os.path.join(root, 'public')


def rep(pack):
    return json.load(open(os.path.join(REP, pack + '.json')))


def url_of(r):
    return '/' + r['file'].split('/public/', 1)[1] if '/public/' in r['file'] else r['file']


def kb(n):
    return '%d' % max(1, round(n / 1024))


def dims(r):
    # width x height above y=0 x depth (buried trunk is reported separately)
    w, d = r['size'][0], r['size'][2]
    return '%.2f × %.2f × %.2f' % (w, r['max'][1], d)


trees, nature, walls = rep('retro-psx-tree-pack'), rep('retro-psx-nature-pack'), rep('psx-walls-fences')
tex_idx = json.load(open(os.path.join(PUB, 'assets/textures/itch/index.json'), encoding='utf-8'))
sky_idx = json.load(open(os.path.join(PUB, 'assets/sky/itch/index.json'), encoding='utf-8'))


def dir_mb(sub):
    t = 0
    for dp, _, fs in os.walk(os.path.join(PUB, sub)):
        t += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
    return t / 1048576


tt = [e for e in tex_idx if e['pack'].startswith('tiny-texture-pack')]
mt = [e for e in tex_idx if e['pack'] in ('retro-psx-tree-pack', 'retro-psx-nature-pack', 'psx-walls-fences')]
L = []
w = L.append

w('# itch.io PSX environment packs: textures, skies, trees, fences (converted)')
w('')
w('Group `psx-env`: 8 itch.io archives converted for EFSUN ONLINE. **%d tileable textures + %d model textures, %d skies, %d GLBs** '
  '(models %.1f MB, textures %.1f MB, skies %.1f MB). All models are static (no armatures, no animation clips). Credits and licences: '
  '`docs/assets/credits-itch.md` (**PSX Skyboxes Free is CC BY 4.0, attribution required**; everything else is CC0). '
  'Preview contact sheet: `docs/assets/previews/itch-psx-env.png`.' % (
      len(tt), len(mt), len(sky_idx), len(trees) + len(nature) + len(walls), dir_mb('assets/models/itch/retro-psx-tree-pack') +
      dir_mb('assets/models/itch/retro-psx-nature-pack') + dir_mb('assets/models/itch/psx-walls-fences'),
      sum(dir_mb('assets/textures/itch/' + p) for p in ('tiny-texture-pack-1', 'tiny-texture-pack-2', 'tiny-texture-pack-3',
                                                         'retro-psx-tree-pack', 'retro-psx-nature-pack', 'psx-walls-fences')),
      dir_mb('assets/sky/itch')))
w('')
w('![contact sheet](previews/itch-psx-env.png)')
w('')
w('> Contact sheet: true-scale line-up next to the 2.4 m KayKit Knight (red line = 2.4 m, blue = 4 m), then every sky, then a sample of the tileable '
  'textures. Blender Workbench ignores glTF alpha MASK, so foliage and chain-link are drawn with **dark boxes behind them in the line-up only**; '
  'the embedded PNGs have hard 1-bit alpha and the materials are `alphaMode: MASK`, so in three.js the holes are cut out (checked in the GLB JSON).')
w('')
w('| Pack | Author | Public folder | Files | Scale applied | Licence |')
w('|---|---|---|---:|---|---|')
w('| **Tiny Texture Pack 1** (128 px) | Screaming Brain Studios | `/assets/textures/itch/tiny-texture-pack-1/` | %d | none (128 px tileables) | CC0 |' % sum(1 for e in tt if e['pack'].endswith('-1')))
w('| **Tiny Texture Pack 2** (128 px) | Screaming Brain Studios | `/assets/textures/itch/tiny-texture-pack-2/` | %d | none | CC0 |' % sum(1 for e in tt if e['pack'].endswith('-2')))
w('| **Tiny Texture Pack 3** (Small) | Screaming Brain Studios | `/assets/textures/itch/tiny-texture-pack-3/` | %d | none | CC0 |' % sum(1 for e in tt if e['pack'].endswith('-3')))
w('| **PSX Skyboxes Free** | heyheythere | `/assets/sky/itch/psx-skyboxes-free/` | 4 panoramas + 24 cube faces | none (as is) | **CC BY 4.0** |')
w('| **Cloudy Skyboxes Panorama** | Screaming Brain Studios | `/assets/sky/itch/cloudy-skyboxes-panorama/` | 25 | 2048×1024 → 1024×512 JPG | CC0 |')
w('| **Retro PSX tree pack** (tree_pack_1.1) | not stated in the archive | `/assets/models/itch/retro-psx-tree-pack/{trees,bushes}/` | %d | trees → 6–10 m (×0.64, clamped), bushes → 1.2 m | CC0 |' % len(trees))
w('| **Retro PSX Nature Pack** | Elegant Crow | `/assets/models/itch/retro-psx-nature-pack/{trees,bushes,grass}/` | %d | trees ×2.0 (≤10 m), bushes ×1.5, grass ×0.8 | CC0 |' % len(nature))
w('| **PSX style walls & fences** | valsekamerplant | `/assets/models/itch/psx-walls-fences/<family>/` | %d | ×1.25 (same module scale as PSX Going Medieval) | CC0 |' % len(walls))
w('')

# ------------------------------------------------------------------ conventions
w('## 0. Conventions (read first)')
w('')
w('* **Scale contract** (ARCHITECTURE rule 7): 1 unit = 1 m, +Y up, KayKit hero ≈ 2.4 m, dungeon tile 4 × 4. Sizes below are game units after conversion; '
  '`W × H × D` is the AABB with **H = top height above y = 0**.')
w('* **PSX materials:** every texture is a 256-colour palette PNG (≤ 256 px, hard 1-bit alpha), samplers are NEAREST, `metallic 0 / roughness 1`, no '
  'extensions. Alpha is **MASK** (cutoff 0.5) where the texture has holes (foliage, chain-link, bars), all materials are `doubleSided`. '
  '`Assets.onModelLoaded` still applies the usual PSX patch on load.')
w('* **One mesh + one material per file** (walls keep one primitive per source material: brick + concrete cap, stucco + roof tile, …). '
  'Files of one pack share their texture images, so you can swap in one shared material (textures in `/assets/textures/itch/<pack>/`, section 2) and '
  '`InstancedMesh` them.')
w('* **Seasons = separate files** in the nature pack: `<model>_<season>.glb` with `spring | summer | fall | winter` (bushes 2–6 additionally have '
  '`spring1 … spring6` flower-colour variants). Winter files use the pack\'s bare-branch mesh where one exists (110 vs 360 tris on `tree01`), '
  'otherwise the summer mesh with the snowy texture.')
w('* **Trees: pivot = trunk base at y = 0.** The source meshes bury a short trunk stub below the ground plane (0.1–0.5 m in the source, up to 1 m '
  'after scaling on `tree07`); sink them into the terrain, do not shift them up. Foliage is crossed cut-out planes, so keep `side: DoubleSide` and alphaTest 0.5.')
w('* **Walls and fences:** pieces lie along **X**, front = +Z, origin at the **bottom centre** unless the pivot column says otherwise. Gate leaves have '
  'their origin on the hinge edge at ground level (set `rotation.y` to swing). The source origins were not consistent (some pieces ran from 0 to +X, '
  'others from −X to 0), so everything was re-centred; adjacent segments tile at their own width (the author overlaps posts slightly).')
w('* **Skies** are equirectangular, **horizon at the vertical middle**. The cloudy panoramas mirror the sky into a dark reflection below the horizon '
  '(use them above the horizon only, or hide the lower half behind terrain/fog). three.js: `tex.mapping = THREE.EquirectangularReflectionMapping; '
  'tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter` for the crunchy PSX look, then `scene.background = tex`. '
  '`fog` / `light` in section 1 are the author\'s horizon fog colour and sky light colour, ready for `scene.fog`.')
w('')

# ------------------------------------------------------------------ skies
w('## 1. Skies: `/assets/sky/itch/` (index: `/assets/sky/itch/index.json`)')
w('')
w('Moods: **day** (blue sky), **sunset** (low sun, warm/pink), **night**, **overcast** (grey / fog / storm). Classified by eye from the contact sheet. '
  '`fog` = average colour of the 14 pixel rows just above the horizon (cloudy skies) or the author\'s fog colour (PSX skies); `zenith` = top rows.')
w('')
w('| URL | KB | size | mood | fog | zenith / light | note |')
w('|---|---:|---|---|---|---|---|')
for s in sky_idx:
    f = os.path.join(PUB, s['path'].lstrip('/'))
    extra = ('zenith #%s' % s['zenith']) if 'zenith' in s else ('light #%s ×%s' % (s['light'], s['light_energy']))
    w('| `%s` | %s | %s | %s | #%s | %s | %s%s |' % (s['path'], kb(os.path.getsize(f)), s['size'], s['mood'], s['fog'], extra, s['note'],
                                                     '; cube faces `' + s['cubemap'] + '` (256 px)' if s.get('cubemap') else ''))
w('')
w('PSX Skyboxes Free: 32 colours, ordered-dither, kept byte for byte (renamed to kebab-case). `CREDITS.txt` sits next to the files. Only the 1024 × 512 '
  'panoramas and the 256 px cubemaps were kept (the 512/128 px half-resolution copies are not needed).')
w('')

# ------------------------------------------------------------------ textures
w('## 2. Loose textures: `/assets/textures/itch/<pack>/` (indexed in `/assets/textures/itch/index.json`)')
w('')
w('`index.json` entries: `{name, path, category, tags, pack, size}` (merged with the existing dungeon / medieval / weapons entries). Tags always start with '
  '`psx, tileable` for the Tiny Texture Packs, followed by material tags and an average-colour tag (`green`, `brown`, `grey`, … plus `dark` / `light`).')
w('')
w('### 2.1 Tiny Texture Packs (128 × 128 tileable, 256-colour PNG)')
w('')
w('File name = `tt<pack>-<source category>-<nn>.png` (kebab-case of the source `Category_NN-128x128.png`). Category = index `category` field.')
w('')
w('| pack | folder | category | files | names | look |')
w('|---|---|---|---:|---|---|')
for pack in ('tiny-texture-pack-1', 'tiny-texture-pack-2', 'tiny-texture-pack-3'):
    cats = collections.OrderedDict()
    for e in tt:
        if e['pack'] == pack:
            cats.setdefault(e['category'] + '|' + re.match(r'tt\d-(.+)-\d+$', e['name']).group(1), []).append(e)
    for key, es in cats.items():
        cat, src = key.split('|')
        cols = collections.Counter(t for e in es for t in e['tags'] if t in
                                   ('grey', 'brown', 'green', 'red', 'orange', 'yellow', 'beige', 'blue', 'cyan', 'purple', 'pink', 'white', 'black'))
        look = ', '.join('%s %d' % (c, n) for c, n in cols.most_common(4))
        w('| %s | `/assets/textures/itch/%s/` | %s | %d | `%s` … `%s` | %s |' % (pack[-1], pack, cat, len(es), es[0]['name'], es[-1]['name'], look))
w('')
w('Typical use: `brick / stone / plaster / tile / wood / metal / grating` for walls, floors and props; `grass / dirt / terrain` for the ground '
  'splat; `roof` for roofs; `elements` (lava, ice, water, sky, magic) for hazards and FX planes; `gem` for crystals and loot; `cloth / weave / animal / box` for tents, '
  'banners, rugs, hides and crates. Nearest filtering and `RepeatWrapping`.')
w('')
w('### 2.2 Textures embedded in the tree / nature / wall GLBs (same pixels as inside the GLBs)')
w('')
w('Published for shared materials / instancing. Foliage entries have alpha (use `alphaTest: 0.5`).')
w('')
w('| path | size | category | tags |')
w('|---|---|---|---|')
for e in mt:
    w('| `%s` | %s | %s | %s |' % (e['path'], e['size'], e['category'], ', '.join(e['tags'])))
w('')

# ------------------------------------------------------------------ trees: tree pack
TP = {1: 'dark olive spruce', 2: 'broadleaf, deep green, pale bark', 3: 'dark spruce', 4: 'olive pine', 5: 'dark fir', 6: 'frosted fir (white-green)',
      7: 'green fir', 8: 'dark broad fir', 9: 'mid-green fir', 10: 'bright fir, light needles', 11: 'olive fir', 12: 'very dark fir',
      13: 'yellow-green broadleaf', 14: 'wide dark teal pine, drooping', 15: 'bright green round broadleaf', 16: 'lime broadleaf, pale trunk',
      17: 'dark green broadleaf', 18: 'olive broadleaf', 19: 'light olive broadleaf', 20: 'yellow-green broadleaf', 21: 'very dark green broadleaf',
      22: 'wide olive broadleaf', 23: 'lime broadleaf', 24: 'green broadleaf', 25: 'pale green round broadleaf', 26: 'dark scraggly broadleaf (tall source)',
      27: 'small dark scraggly broadleaf (shortest source)', 28: 'autumn maple, red-orange', 29: 'late autumn, dry tan leaves',
      30: 'orange maple, pale trunk', 31: 'bright orange maple, pale trunk', 32: 'amber autumn', 33: 'dead brown leaves',
      34: 'wide round orange autumn', 35: 'slim yellow birch', 36: 'sparse orange birch'}
BP = {1: 'brown-gold low bush', 2: 'dark green', 3: 'yellow flowering', 4: 'green', 5: 'orange autumn', 6: 'dark green', 7: 'red autumn', 8: 'very dark teal'}

w('## 3. Retro PSX tree pack (tree_pack_1.1): `/assets/models/itch/retro-psx-tree-pack/`')
w('')
w('44 FBX in centimetres (object scale 0.01; trees 12.5 m × 6 m, bushes 7.5 m after import, which is not usable at 1 unit = 1 m). The FBX have no '
  'texture links, so each model got `textures/<name>.png` (128 px: trunk strip on the left, canopy on the right). Scaled so **trees are 6–10 m '
  '(×0.64 of the source height, clamped; almost all end at 8.00 m) and bushes exactly 1.2 m**; widths follow the source (canopy 3.8–9.2 m). '
  'Pivot = trunk base at y = 0 (centre of the trunk). 52 tris per tree, 16 per bush. The description column is read from the texture, not from the author.')
w('')
w('| URL | KB | tris | W × H × D (m) | description / use |')
w('|---|---:|---:|---|---|')
for r in sorted(trees, key=lambda r: (r['kind'], r['model'])):
    n = int(re.search(r'\d+', r['model']).group())
    desc = (TP if r['kind'] == 'trees' else BP)[n]
    if r['kind'] == 'trees':
        use = ('conifer' if (n <= 12 and n != 2) or n == 14 else 'deciduous') + ', ' + desc + '; forest filler / landmark tree'
    else:
        use = 'bush, ' + desc + '; undergrowth, hedges'
    w('| `%s` | %s | %d | %s | %s |' % (url_of(r), kb(r['bytes']), r['tris'], dims(r), use))
w('')

# ------------------------------------------------------------------ nature pack
w('## 4. Retro PSX Nature Pack (Elegant Crow): `/assets/models/itch/retro-psx-nature-pack/`')
w('')
w('Source = the pack\'s glTF geometry (no materials) + 101 per-season PNGs (128 / 256 px); materials rebuilt here. **Seasons are separate files** '
  '(`<model>_<season>.glb`). Scales: **trees ×2.0 (tree07 ×1.92 so it does not pass 10 m) = 7.4–10 m above ground, bushes ×1.5 = 1.05–1.5 m '
  'high, grass ×0.8 = 0.2–0.4 m**. Source quirk: `trees/tree02_winter.glb` is a broken 132-byte file, so `tree02_winter` uses the summer mesh with the '
  'winter texture; `tree07`/`tree08`/`bush07`/`bush08` have no winter mesh either (same fallback).')
w('')
NT = {'tree01': 'round broadleaf (oak-like); fall yellow', 'tree02': 'broadleaf with pale bark; fall orange, winter snow-covered',
      'tree03': 'dense broadleaf; summer carries orange fruit, fall red-orange', 'tree04': 'broadleaf; fall bright orange (maple)',
      'tree05': 'light broadleaf; fall yellow', 'tree06': 'round bushy tree; spring blossoms, fall yellow',
      'tree07': 'tall fir (conifer), muted green; winter frosted', 'tree08': 'narrow dark spruce; winter frosted'}
NB = {'bush01': 'small round bush; fall orange', 'bush02': 'low wide bush; spring1-6 = flower colours (pink, red, none…)',
      'bush03': 'medium bush; fall yellow, spring flowers', 'bush04': 'tree-like shrub (visible stem); fall gold, spring flowers',
      'bush05': 'tall thin shrub; fall bright yellow', 'bush06': 'wide hedge-like bush (3 m); fall orange, spring flowers',
      'bush07': 'grey-green shrub; winter frosted', 'bush08': 'dark spiky shrub'}
NG = {'grass_bush': 'grass clump 0.8 m (48 tris)', 'grass_patch': 'ground patch 1.7 × 1.7 m of tall grass (rim blades)',
      'grass_patch_corner': 'patch with a cut corner: tiles with grass_patch around edges'}
w('| URL | KB | tris | W × H × D (m) | pivot | use |')
w('|---|---:|---:|---|---|---|')
for kind in ('trees', 'bushes', 'grass'):
    for r in [r for r in nature if r['kind'] == kind]:
        if kind == 'trees':
            use = NT[r['model']].split(';')[0]
        elif kind == 'bushes':
            use = NB[r['model']].split(';')[0]
        else:
            use = NG.get(r['model'], 'grass tuft (8 tris, two crossed quads)')
        use += ' - ' + r['variant']
        piv = r['pivot'] + ('; trunk stub %.2f m below y=0' % -r['min'][1] if r['min'][1] < -0.01 else '')
        w('| `%s` | %s | %d | %s | %s | %s |' % (url_of(r), kb(r['bytes']), r['tris'], dims(r), piv, use))
w('')
w('Per-model notes: ' + '; '.join('`%s` %s' % (k, v) for k, v in list(NT.items()) + list(NB.items())) + '.')
w('')

# ------------------------------------------------------------------ walls
USE = {
    'brick_wall': 'straight brick wall, 5 m module, concrete coping', 'brick_wall_small': 'half-length brick wall (2.5 m)',
    'brick_wall_one_overhang': 'brick wall whose one end overhangs past the post', 'brick_wall_one_overhang_small': 'same, short (2.5 m)',
    'brick_wall_pole': 'brick pillar 0.6 × 2.75 m (joint / gate post)', 'brick_wall_corner': '90° corner: post + two 1.25 m arms',
    'brick_wall_gate': 'iron gate leaf 2 m (hinge at the post). Re-based to y = 0; in the source it hung 0.31 m above ground',
    'drystone_column': 'dry-stone post 1.1 m', 'drystone_column_capped': 'dry-stone post with concrete cap',
    'drystone_column_tiles': 'dry-stone post with roof-tile cap', 'drystone_wall': '2.5 m dry-stone field wall',
    'drystone_wall_capped': 'dry-stone wall with concrete cap', 'drystone_wall_tiles': 'dry-stone wall with roof-tile coping',
    'drystone_wall_half': '1.25 m dry-stone wall', 'drystone_wall_half_capped': '1.25 m, concrete cap', 'drystone_wall_half_tiles': '1.25 m, roof-tile coping',
    'wooden_fence_beam': 'loose rail lying on the ground (debris)', 'wooden_fence_beam_alt': 'loose rail, variant', 'wooden_fence_beam_alt_2': 'loose rail, variant 2',
    'wooden_fence_broken': 'damaged fence segment', 'wooden_fence_broken_alt': 'damaged fence segment, variant',
    'wooden_fence_broken_alt2': 'collapsed fence segment (leaning, 1 m deep)', 'wooden_fence_closed': 'fence segment "closed" (rails + boards, 144 tris)',
    'wooden_fence_open': 'fence segment "open" (two rails)', 'wooden_fence_open_alt': 'fence segment "open", variant',
    'wooden_fence_open_crossed': 'fence segment "open", crossed rails (source name `oen_crossed`)', 'wooden_fence_pile': 'pile of loose planks (debris)',
    'wooden_fence_pole': 'fence post 1.5 m', 'wooden_fence_pole_alt': 'fence post, variant', 'wooden_fence_pole_alt_2': 'fence post, variant 2',
    'wooden_fence_pole_broken_large': 'broken post (1.2 m)', 'wooden_fence_pole_broken_small': 'broken post stub (0.57 m)',
    'metalfence_one_side_topbar': 'chain-link panel, mesh on one side, top rail', 'metalfence_one_side_no_topbar': 'chain-link panel, mesh on one side, no top rail',
    'metalfence_both_sides_topbar': 'chain-link panel, mesh on both sides, top rail', 'metalfence_both_sides_no_topbar': 'chain-link panel, mesh on both sides, no top rail',
    'metalfence_gate_only_sides': 'gate frame: two posts, empty opening (1.49 m)', 'metal_fence_gate_with_gate': 'gate frame with the closed leaf',
    'gate': 'metal gate leaf alone (1.29 m, hinge at the post)',
    'plackard_closed': 'plank hoarding segment, solid boards', 'plackard_closed_full': 'hoarding segment incl. both end posts (4 m)',
    'plackard_open': 'hoarding segment with gaps', 'plackard_open_alt': 'hoarding, gaps variant', 'plackard_open_alt2': 'hoarding, gaps variant 2',
    'plackard_open_patched': 'hoarding with gaps and patch boards', 'plackard_broken': 'hoarding with missing boards',
    'plackard_broken_alt': 'broken hoarding, variant', 'plackard_broken_slanted': 'broken hoarding, slanted / leaning',
    'plackard_corner': 'hoarding segment ending in a corner post', 'plackard_corner_closed': 'corner post only (closed)',
    'plackard_corner_closed_alt': 'corner post (closed, variant)', 'plackard_corner_open': 'corner post (open)',
    'plackard_corner_open_90': 'corner post (open, 90° layout)', 'plackard_corner_open_90_alt': 'corner post (open, 90°, variant)',
    'plackard_corner_open_alt': 'corner post (open, variant)', 'plackard_slab_full': 'single board slab, full height 3 m',
    'plackard_slab_half': 'single board slab, 2 m', 'plackard_slab_single': 'single board slab, 1 m', 'plackard_slab_chipped': 'board slab 1 m, chipped',
    'plackard_slab_chipped_alt': 'board slab 1 m, chipped variant', 'plackard_slab_broken': 'board slab 1 m, broken (source name `boken`)',
    'plackard_slab_broken_alt': 'board slab 1 m, broken variant', 'plackard_slab_wood_patched': 'board slab 1 m, wood patch',
    'plaster_wall': '2.5 m low stucco wall with roof-tile coping', 'plaster_wall_half': '1.25 m low stucco wall',
    'plaster_wall_fenced': 'stucco wall with iron railing on top (1.85 m)', 'plaster_wall_half_fenced': '1.25 m stucco wall with railing',
    'plaster_wall_column': 'stucco pillar 2.7 m', 'plaster_wall_column_fancy': 'stucco pillar, ornamented cap',
    'plastic_gate_left': 'gate leaf 2.5 m, left (extends −X from the hinge)', 'plastic_gate_right': 'gate leaf 2.5 m, right (extends +X from the hinge)',
    'gate_handle': 'gate handle hardware, 0.14 m', 'white_picket_fence_closed_left': 'picket segment with end posts, "closed", left',
    'white_picket_fence_closed_right': 'picket segment with end posts, "closed", right (mirror)', 'white_picket_fence_open_left': 'picket panel only, no posts, left',
    'white_picket_fence_open_right': 'picket panel only, no posts, right (mirror)', 'white_picket_fence_gate': 'picket gate leaf 1.35 m (hinge at the post)',
    'white_picket_fence_gate_poles': 'two gate posts', 'white_picket_fence_pole': 'single picket post',
}
FAM = collections.OrderedDict()
for r in walls:
    FAM.setdefault(r['kind'], []).append(r)
w('## 5. PSX style walls & fences (valsekamerplant): `/assets/models/itch/psx-walls-fences/<family>/`')
w('')
w('79 GLB in 7 families, geometry kept, textures re-built (embedded images extracted, reduced to ≤ 256 px palette PNGs, material names `wf_*`), '
  '**scaled ×1.25** (the same module scale as the author\'s PSX Going Medieval pack, so the 4 m brick wall becomes a 5 m module; widths 1.25–5 m). '
  'Fixed source typos: `wooden_fence_oen_crossed → wooden_fence_open_crossed`, `plackard_slab_boken → plackard_slab_broken`, '
  '`brick_Wall_corner → brick_wall_corner`. Source vertex colours (picket fence only, mean white) were dropped. Use descriptions come from the author\'s file '
  'names and the geometry; `open`/`closed` etc. are the author\'s words.')
w('')
for fam, rs in FAM.items():
    w('### 5.%d %s (`/assets/models/itch/psx-walls-fences/%s/`, %d files)' % (list(FAM).index(fam) + 1, fam, fam, len(rs)))
    w('')
    w('| URL | KB | tris | W × H × D (m) | pivot | use |')
    w('|---|---:|---:|---|---|---|')
    for r in rs:
        w('| `%s` | %s | %d | %s | %s | %s |' % (url_of(r), kb(r['bytes']), r['tris'], dims(r), r['pivot'], USE[r['model']]))
    w('')

# ------------------------------------------------------------------ appendix: textures
w('## 6. Appendix: every Tiny Texture file')
w('')
w('| path | KB | category | tags |')
w('|---|---:|---|---|')
for e in tt:
    w('| `%s` | %s | %s | %s |' % (e['path'], kb(os.path.getsize(os.path.join(PUB, e['path'].lstrip('/')))), e['category'], ', '.join(e['tags'][2:])))
w('')

# ------------------------------------------------------------------ notes
w('## 7. Notes, quirks, rebuild')
w('')
w('* **Archives:** all 8 were extracted under `.asset-cache/itch/psx-env/<pack>/x/` (never executed). The Cloudy Skyboxes archive is a RAR5: Git Bash\'s '
  'GNU `tar` cannot read it, **Windows `C:\\Windows\\System32\\tar.exe` (bsdtar) can**.')
w('* The PSX Skyboxes Free pack also contains Godot resources (`.tres`, `.gd`, shaders); only the panoramas, the 256 px cubemaps and the colour data '
  'from `skies.json` were used.')
w('* The tree-pack and nature-pack archives carry no licence file (the nature pack has a donation `READ ME` only); CC0 is taken from the project brief and the '
  'itch.io pages. `LICENSE.txt` / `CREDITS.txt` files sit next to the converted files.')
w('* Not done: no LODs, no collision shapes (use cylinders for trunks / boxes for fences), no wind animation (do it in the vertex shader on `position.y` of the foliage planes).')
w('* Rebuild (scripts in `tools/blender/itch_env/`, system Python + Pillow, one headless Blender process): '
  '`python -I build_textures_skies.py <root>` → `blender --background --factory-startup --python convert_env.py -- <.asset-cache/itch/psx-env> <root>` '
  '→ `python -I publish_model_textures.py <root>` → `python -I make_doc_env.py <root>`; contact sheet = `render_env_sheet.py` + `make_sheet.py`. '
  'Reports per pack: `tools/blender/itch_env/_reports/*.json`. Texture reduction and material helpers are shared with `tools/blender/itch_kits/` (`kitlib.py`, `tex_tool.py`).')
w('')

out = os.path.join(root, 'docs/assets/itch-psx-env.md')
open(out, 'w', encoding='utf-8').write('\n'.join(L))
print(out, len(L), 'lines')
