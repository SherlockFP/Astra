"""Generate docs/assets/itch-kits.md from the conversion reports (tools/blender/itch_kits/_reports/*.json).
Usage: python -I tools/blender/itch_kits/make_doc.py <repo root>
"""
import sys, os, json, re

root = sys.argv[1]
R = os.path.join(root, 'tools/blender/itch_kits/_reports')


def load(p):
    return json.load(open(os.path.join(R, p + '.json')))


def url(r):
    f = r['file'].replace('\\', '/')
    return f[f.index('/assets/'):]


def kb(r):
    return '%.0f' % (r['bytes'] / 1024)


def dims(r):
    return '%.2f × %.2f × %.2f' % tuple(r['size'])


def pivot(r):
    mn, mx = r['min'], r['max']
    e = 0.03
    def ax(i, lo, hi):
        if abs(mn[i]) < e and mx[i] > e:
            return lo
        if abs(mx[i]) < e and mn[i] < -e:
            return hi
        if abs(mn[i] + mx[i]) < 0.06:
            return 'c'
        return '%.2f..%.2f' % (mn[i], mx[i])
    x = ax(0, '0→+X', '−X←0')
    z = ax(2, '0→+Z', '−Z←0')
    if abs(mn[1]) < e:
        y = 'base'
    elif abs(mx[1]) < e:
        y = 'top (hangs)'
    else:
        y = 'y %.2f..%.2f' % (mn[1], mx[1])
    if x == 'c' and z == 'c':
        return 'centre, ' + y
    if x == 'c':
        x = 'cx'
    if z == 'c':
        z = 'cz'
    return '%s, %s, %s' % (x, z, y)


def table(rows, uses, with_pivot=True):
    out = ['| URL | KB | tris | W × H × D (m) | pivot | intended use |', '|---|---:|---:|---|---|---|']
    for r in rows:
        name = os.path.splitext(os.path.basename(r['file']))[0]
        out.append('| `%s` | %s | %d | %s | %s | %s |' % (url(r), kb(r), r['tris'], dims(r), pivot(r), uses(name, r)))
    return '\n'.join(out)


# ---------------------------------------------------------------- uses
DUNG = {
    'wall_01': 'plain stone wall, the default dungeon wall (same 4×4×1 footprint as KayKit `wall.glb`)',
    'wall_02': 'wall with buttress pilasters (1.8 deep), breaks long corridors',
    'wall_half': 'half-width wall (2 m) for odd gaps / corners',
    'wall_border_01': 'low 2 m wall / parapet with carved trim (balconies, pits, altars)',
    'wall_border_02': 'low 2 m wall, second trim pattern',
    'wall_expanding': 'tapering wall 1→2 m thick (transition to thick walls)',
    'wall_narrowing': 'tapering wall 2→1 m thick (mirror of expanding)',
    'wall_ruin': 'broken wall with slanted top (ruined rooms, boss arena edges)',
    'skull_wall': 'catacomb wall of skulls (crypt / necromancer floors)',
    'skull_wall_half': 'half-width skull wall',
    'windowed_wall_01': 'wall with small barred window',
    'windowed_wall_02': 'wall with arched barred window and trim',
    'door_frame_01': 'wall with 2 × 3 m doorway (fits door_01/02/03)',
    'door_frame_02': 'wall with arched, trimmed 2 × 3 m doorway',
    'door_01': 'iron-studded door panel 2 × 3 (animate: pivot is bottom centre, offset ±1 m on X for a hinge)',
    'door_02': 'wooden door panel 2 × 3',
    'door_03': 'portcullis / barred gate 2 × 3 (raise along +Y to open)',
    'block': 'solid 4 m cube (fill, pillars of rock, raised floor)',
    'block_arch': '4 m cube with a passage arch through it',
    'block_half': '4 × 2 × 4 half block (steps, raised dais, ledges)',
    'floor_tiles': '4 × 4 floor quad at y = 0 (KayKit floor top is y = 0.05)',
    'stairs': 'ramp-style stairs, rises 2 m toward local +X over 4 m (rotation.y = −π/2 to climb toward +Z)',
    'stairs_wide': 'same stairs, 8 m wide (2 tiles)',
    'stairs_ultrawide': 'same stairs, 12 m wide (3 tiles)',
    'pillar': '6.04 m fluted pillar with capital (arches sit on top)',
    'pillar_collapsed_01': 'broken pillar stump',
    'pillar_collapsed_02': 'fallen pillar segment lying on the floor',
    'arch': 'arch span between two pillars 4 m apart; keeps its height (y 5.76..8.16), place at the same origin as the pillar pair midpoint',
    'arch_fence': 'iron fence spanning between pillars (y 5.77..7.91, decorative upper grille)',
    'arch_roof': 'cross-vault ceiling piece over a 4 × 4 tile, sits on the pillars (y 5.90..8.00)',
    'hexagon': 'hexagonal dais / platform 1.6 high (altar base, boss pedestal)',
    'barrel': 'barrel prop (breakable)', 'box': 'wooden crate 1.6 m (breakable)', 'chest': 'treasure chest (loot)',
    'candle_01': 'single candle', 'candle_02': 'candle cluster', 'candle_03': 'short candle',
    'chain': 'hanging chain 2 m, pivot at the top (attach to ceiling)',
    'chandelier': 'iron chandelier with candles, hangs 2.9 m from its top pivot (add point light + emissive)',
    'debris': 'rubble pile', 'spikes': 'floor spike trap (animate +Y)',
    'wall_decor_01': 'iron ring for a wall face; pivot on the wall surface (back), keeps its 1.1–2.25 m height, sticks out toward +Z',
    'wall_table': 'shelf/table hung on chains from a wall; back pivot, 1.0 m above the floor, sticks out toward +Z',
}


def dung_use(n, r):
    return DUNG.get(n, '')


def med_use(n, r):
    cat = r.get('category')
    rules = [
        (r'^plaster_wall_stone_base', 'timber-frame storey on a stone plinth; one 5 × 3.75 × 5 room block (4 walls)'),
        (r'^plaster_wall', 'timber-frame (Fachwerk) storey block, 4 walls of a 5 × 5 room; stack 3.75 m per storey'),
        (r'^stone_square_half', 'stone room block, 2.5 m module'),
        (r'^stone_square', 'stone storey / foundation block (5 m module)'),
        (r'^stone_archway_top', 'top part of the archway (y 2.5..3.75), lintel over a gap'),
        (r'^stone_archway', 'stone gateway / passage arch, 5 m module'),
        (r'^stone_floor', 'stone floor plate'), (r'^wooden_floor', 'wooden floor plate (upper storeys)'),
        (r'^wood_support', 'timber beam / post (frame details, scaffolds, market frames)'),
        (r'^chimney', 'brick chimney stack'), (r'^door_.*double', 'double door overlay for a wall face (centred)'),
        (r'^door_', 'door overlay for a wall face (centred, half sunk into the wall)'),
        (r'^flower_box', 'window flower box (alpha-cut flowers)'), (r'^flower_', 'flower clump (alpha-cut)'),
        (r'^overhang', 'roof overhang / porch canopy strip'), (r'stairs', 'stairs, climb toward −Z (top edge at the back)'),
        (r'windowsill', 'window sill'), (r'^vine', 'ivy / vine decal (alpha-cut, double sided)'),
        (r'^window', 'window overlay for a wall face'),
        (r'^roof_.*_corner', 'roof corner piece (occupies the +Z neighbour cell)'),
        (r'^roof_.*dormer', 'dormer window for a roof slope'), (r'^roof_.*_end', 'gable end cap of a roof row'),
        (r'^roof_.*_half', 'half-width roof (2.5 m)'), (r'^roof_.*_square_fancy', 'pyramid roof with lantern top (towers)'),
        (r'^roof_.*_square', 'pyramid / hip roof over one block'), (r'^roof_.*_stickout_triangle', 'gabled bay that sticks out of a facade'),
        (r'^roof_.*_stickout_large', 'large projecting upper storey bay with roof'), (r'^roof_.*_stickout', 'projecting bay window with roof'),
        (r'^roof_.*_T$', 'T-junction roof'), (r'^roof_', 'straight gable roof section over one 5 m block'),
        (r'^market_stall_round', 'round market tent (merchant / vendor NPC)'), (r'^market_stall', 'market stall with striped awning (vendor NPC)'),
        (r'^barrel_filler', 'produce filling that sits inside an open barrel (keeps its height)'),
        (r'^barrel_lid', 'barrel lid (stack on barrels)'), (r'^barrel', 'market barrel (breakable)'),
        (r'^basket', 'woven basket'), (r'^crate', 'market crate / produce crate'), (r'^hay', 'hay pile / bale (farms, stables)'),
        (r'^jutesack', 'jute sack'), (r'^meat|^pork|^sausage', 'butcher goods (hang from stalls; centre pivot)'),
        (r'^table_prebuild', 'market table already dressed with goods'), (r'^table', 'long market table (top at 1.10 m)'),
        (r'terracotta|vase', 'terracotta jar / lid'), (r'bread|baguette', 'bread (food / consumable pickup)'),
        (r'pumpkin', 'pumpkin'),
    ]
    for pat, txt in rules:
        if re.search(pat, n):
            return txt
    return cat or ''


NW = {
    'bridge': 'stone arch bridge, 26.7 m long, path along Z (river crossings in the hub town)',
    'npc_bartender': 'tavern keeper NPC (static T-pose, unrigged)', 'npc_inquisitor': 'armoured inquisitor NPC / quest giver (static T-pose; helmet is part of the mesh)',
    'npc_maid': 'tavern maid NPC (static T-pose)', 'npc_nun': 'nun / priestess NPC (static T-pose)',
    'npc_peasant': 'villager NPC (static T-pose)', 'npc_peasant_blonde': 'villager NPC, blonde texture variant (same mesh)',
    'witch': 'tall witch figure (4.2 m), static: statue, boss spawn decor or future rig',
    'church': 'village church (13.6 m), front door faces +Z; `church_door` node has its origin on the hinge (rotate .rotation.y to open)',
    'church_altar': 'altar with cross (church interior, shrines)', 'church_bench': 'church pew', 'church_fence': 'stone balustrade / altar rail segment 1.5 m',
    'ritual_dagger': 'wavy ritual dagger (witch hut decor or loot)', 'crow': 'crow (decor, perched)', 'fish': 'fish (market / hut decor)',
    'cauldron': 'witch cauldron (alchemy station)', 'severed_leg': 'severed leg (horror / witch hut decor)', 'rat': 'rat (decor)',
    'pine_tree': 'pine tree 15 m (alpha-cut needles)', 'banner': 'hanging red banner 3.5 m, pivot at the rod (top)',
    'barrel': 'barrel (breakable)', 'crate': 'crate (breakable)',
    'torch': 'wall torch; pivot at the wall plate (back), flame end up, sticks out toward +Z (add point light)',
    'signpost': 'crossroads signpost', 'steel_sword': 'steel longsword, grip at origin, blade +Y (same convention as KayKit weapons; 1.62 m)',
    'tower': 'round watch tower 30 m (landmark); door faces +X, `tower_door` node hinged',
    'well': 'village well 3 m',
    'tavern_wall_base': 'tavern kit: plain wall 3.0 × 4.09 (walls are 2.2 units in the source → exactly 3 m here)',
    'tavern_wall_half': 'tavern kit: lower half wall (timber)', 'tavern_wall_half_window': 'tavern kit: upper half wall with window, keeps y 2.05..4.09 (stack on wall_half)',
    'tavern_wall_base_door': 'tavern kit: wall with doorway', 'tavern_wall_base_window': 'tavern kit: wall with window',
    'tavern_wall_pillar': 'tavern kit: corner post between wall segments', 'tavern_triangular_wall': 'tavern kit: gable triangle',
    'tavern_top_ridge': 'tavern kit: wall plate / eave beam, keeps y 3.23..4.09', 'tavern_roof': 'tavern kit: roof slab segment',
    'tavern_foundation': 'tavern kit: stone foundation strip', 'tavern_door': 'tavern kit: door leaf for the doorway', 'tavern_chimney': 'tavern kit: chimney top',
    'tavern_bar': 'bar counter', 'tavern_bar_stool': 'bar stool', 'tavern_beer_mug': 'beer mug', 'tavern_bowl': 'bowl', 'tavern_jug': 'clay jug',
    'tavern_cheese': 'cheese wheel', 'tavern_bread': 'bread loaf', 'tavern_wooden_spoon': 'wooden spoon',
    'tavern_shelf': 'wall shelf, back pivot (y 0 = shelf bottom)', 'tavern_wine_bottle': 'wine bottle', 'tavern_wine_bottle_02': 'round wine bottle',
    'tavern_lantern': 'lantern (table / hand)', 'tavern_wall_lantern': 'lantern on a wall bracket, back pivot',
    'tavern_chandelier': 'wooden ring chandelier, pivot at top', 'tavern_chain': 'hanging chain 2.7 m, pivot at top',
    'tavern_painting': 'framed painting (texture is mostly dark in the source), back pivot',
}


def nw_use(n, r):
    return NW.get(n, '')


def wb_use(n, r):
    rules = [(r'^arrow', 'arrow (projectile mesh, shaft along Z, tip toward +Z)'), (r'^axe', '1H/2H axe'),
             (r'^bow.*string', 'bow with string (shoot pose)'), (r'^bow', 'bow without string'), (r'^dagger', 'dagger'),
             (r'^fistweapon.*stacked', 'claws / knuckles, stacked variant'), (r'^fistweapon', 'claws / knuckles (fist weapon)'),
             (r'^halberd', 'halberd (polearm)'), (r'^hammer', 'war hammer / mace'), (r'^shield', 'shield (handslot.l)'),
             (r'^spear', 'spear (polearm)'), (r'^staff', 'staff (mage)'), (r'^sword_e', 'greatsword (2H)'), (r'^sword', 'sword'),
             (r'^wand', 'wand (mage)')]
    for p, t in rules:
        if re.search(p, n):
            return t
    return ''


dung, med, nw, wb = load('psx-dungeon'), load('psx-medieval'), load('nocturnal-watch'), load('fantasy-weapons-bits')
allr = dung + med + nw + wb
tot_mb = sum(r['bytes'] for r in allr) / 1048576
med_by = {}
for r in med:
    med_by.setdefault(r['category'], []).append(r)

md = []
md.append('''# itch.io PSX town / dungeon kits (converted)

Four itch.io packs converted to self-contained, PSX-ready GLBs for EFSUN ONLINE. **%d GLBs, %.1f MB** in total, plus
31 loose textures. All models are static (no armatures, no animation clips). Credits and licences:
`docs/assets/credits-itch.md` (the goblinatron dungeon is **CC BY 4.0, attribution required**; everything else is CC0).
Preview contact sheet with true-scale line-ups: `docs/assets/previews/itch-kits.png`.

| Pack | Public folder | Files | Scale applied | Licence |
|---|---|---:|---|---|
| goblinatron **PSX Dungeon** | `/assets/models/itch/psx-dungeon/` | %d | ×0.2 (20-unit module → 4 m tile) | CC BY 4.0 |
| valsekamerplant **PSX Style: Going Medieval** | `/assets/models/itch/psx-medieval/{building,decoration,market,roofs}/` | %d | ×1.25 (4 m → 5 m module) | CC0 |
| toboas **PSX Fantasy Pack: Nocturnal Watch** | `/assets/models/itch/nocturnal-watch/` | %d | ×4/3 base, props sized individually | CC0 |
| Kay Lousberg **KayKit Fantasy Weapons Bits 1.0** | `/assets/models/itch/fantasy-weapons-bits/` | %d | ×1 (already KayKit scale) | CC0 |

## 0. Conventions (read first)

* **Scale contract** (ARCHITECTURE rule 7): KayKit hero ≈ 2.4 tall, dungeon tile 4 × 4, +Y up, models face **+Z**. Every
  size in this file is in game units after conversion. The line-ups in the preview put each pack next to the KayKit Knight.
* **Front = +Z.** Doors, windows, wall decor, torches and NPCs face +Z (`rotation.y = Math.atan2(dx, dz)` aims them).
* **PSX materials:** every texture was reduced to a 256-colour palette PNG (≤256 px; 352 px for the medieval building atlas,
  512 px for the Nocturnal buildings and the witch), samplers are NEAREST, `metallic 0 / roughness 1`, no extensions.
  Alpha is **MASK** (cutoff 0.5) where the texture has holes (flowers, vines, grates, pine needles), never BLEND.
  `Assets.onModelLoaded` still applies the usual PSX patch on load.
* **One mesh per file** (joined per material), except buildings with an openable door (`church`, `tower`: the door is a
  second node whose origin sits on the hinge, so `door.rotation.y = ±1.5` opens it).
* **Draw calls / instancing:** files of one pack share the same texture image, so you can swap in one shared material
  (textures in `/assets/textures/itch/<pack>/`, see section 5) and use `InstancedMesh` / merge static geometry.
* Pivot column below: `centre, base` = bottom centre (default); `0→+X, −Z←0` = pivot on the module corner, piece extends to +X and −Z;
  `top (hangs)` = pivot at the top attachment point; `back` pieces have z from 0 (wall surface) to +Z.

''' % (len(allr), tot_mb, len(dung), len(med), len(nw), len(wb)))

md.append('''## 1. PSX Dungeon (goblinatron, CC BY 4.0) — `/assets/models/itch/psx-dungeon/`

The source is a 20-unit modular kit; ×0.2 makes it **exactly the KayKit dungeon grid**: a wall is 4 W × 4 H × 1 D with the
pivot at the bottom centre and the centre line on local X (±0.5 on Z), so these pieces can replace or mix with
`/assets/models/dungeon/` walls on the same `TILE_SIZE` grid. Doorways are 2 × 3 m, door panels fit them.
Three atlases (`dungeon_map` 256², `crates_and_barrels_map` 128², `doors_map` 128²), 2–368 tris per piece; very PSX.
Arch, arch_fence and arch_roof keep their height so they land on top of `pillar` (6.04 m) when given the same origin
as the pillar pair midpoint / tile centre.

''')
md.append(table(dung, dung_use))
md.append('''

## 2. PSX Style: Going Medieval (valsekamerplant, CC0) — `/assets/models/itch/psx-medieval/`

A modular Fachwerk town kit plus a big market set. Real-world source (4 m module, 3 m storey, 2.17 m door) scaled ×1.25:
**module 5 m, storey 3.75 m, door 2.72 m** (the KayKit dungeon door is 2.75 m, so the 2.4 m hero fits the same way).
**The author's pivots are kept** so every piece snaps to every other piece as designed:

* building blocks, floors, beams, roofs, overhangs and stairs pivot on the **module corner** and extend toward **+X and −Z**
  (a full block covers x 0..5, z −5..0; a half block x 0..2.5, z −2.5..0). Place them at multiples of 5 m (2.5 m for halves),
  stack storeys every 3.75 m, put a roof on top of the last storey at the same x/z. Rotating about Y turns a piece around its
  corner, so add the cell offset when you rotate (or wrap it in a Group offset by (−2.5, 0, 2.5)).
* `plaster_wall*` / `stone_square*` are whole room blocks (four walls of one cell, no floor/ceiling); `_cornered` has one cut corner,
  `_alt` uses diagonal bracing.
* doors and windows are **overlays** (centred pivot, about half their depth sinks into the wall): place them on a block face.
* roofs overhang 0.48 m on each slope side; `roof_*_corner` occupies the neighbour cell toward +Z.
* the three barrel fillers keep their height (they sit inside `barrel_open`); hanging meat/sausages keep a centre pivot;
  `table`, `table_prebuild` and `pumpkin` were moved onto the ground (source pivot was the table top).
* Renamed from the source: `strairs_*` → `stairs_*`, `market_stall_yelow` → `market_stall_yellow`, `backet` → `basket`,
  `bread_smol` → `bread_small`, `*_windowsil` → `*_windowsill`, `*_barrel_fillter` → `barrel_filler_*`.
* Textures: one 352² building atlas (`bauerhaus`), `market` 200², `market_misc` 256², plus small tiling textures
  (hay, jute, terracotta, wood). Colour variants: roofs come in blue / red / straw, stalls in blue / red / yellow.

''')
for cat, title in [('building', 'building blocks'), ('decoration', 'decorations'), ('market', 'market'), ('roofs', 'roofs')]:
    md.append('### 2.%d %s (`/assets/models/itch/psx-medieval/%s/`, %d files)\n\n' %
              (['building', 'decoration', 'market', 'roofs'].index(cat) + 1, title, cat, len(med_by[cat])))
    md.append(table(med_by[cat], med_use))
    md.append('\n\n')

md.append('''## 3. PSX Fantasy Pack: Nocturnal Watch (toboas, CC0) — `/assets/models/itch/nocturnal-watch/`

Hand-painted PSX horror-village assets. The FBX files point at texture files that are not in the archive, so every material
was rebuilt from the PNG/JPG next to each model. Characters are 1.8 m in the source → **×4/3 = 2.4 m**, matching the hero.
The environment pieces were not modelled at one consistent scale, so they were sized individually:

* ×4/3: characters, `church`, `bridge`, `pine_tree`, `banner`, `signpost`, `steel_sword`, `church_fence`.
* ×15/11 (= ×1.36): the tavern kit and tavern props — the 2.2-unit wall pieces become **exactly 3.0 m** wide (4.09 m tall),
  so they tile on a 3 m grid. Pieces are split from one FBX into one GLB each; `tavern_wall_half_window` and
  `tavern_top_ridge` keep their height so they stack on the lower pieces.
* ×1.0: `church_altar`, `church_bench` (a ×4/3 pew would be 1.8 m tall).
* explicit sizes (source 2–4× too big): `tower` 30 m (door 3 m), `well` 3 m, `barrel` 1.4, `crate` 1.2, `torch` 1.2,
  hut props (`cauldron` 1.3, `crow` 0.6, `ritual_dagger` 1.2, `fish`/`rat` 0.8–0.9, `severed_leg` 0.6).
* The six NPCs are **unrigged static meshes in T-pose** (no armature in the source). Use them as idle townsfolk / statues
  or rig them later; arms span 2.15 m, so give them a slightly larger interaction radius.
* Textures were cropped to the UV footprint of each split prop before reducing to ≤256 px, so small props keep detail.

''')
md.append(table(nw, nw_use))
md.append('''

## 4. KayKit Fantasy Weapons Bits 1.0 (Kay Lousberg, CC0) — `/assets/models/itch/fantasy-weapons-bits/`

Same scale and convention as the Adventurers weapons in `/assets/models/weapons/` (see `characters.md` 1.1):
**grip at the origin, blade along +Y**, `sword_a` 1.77 long vs. `sword_1handed` 1.78. Attach to `handslot.r` with
position (0, 0.0333, 0) and `rotation.y = π`; shields to `handslot.l` at (0, 0.017, 0.156). Bows lie along X, arrows along Z.
Every file embeds the same 256² gradient palette (`/assets/textures/itch/fantasy-weapons-bits/weapons-bits-texture.png`);
for loot drops / transmog share one material. Good fit for item drops and the +N upgrade glow.

''')
md.append(table(wb, wb_use))

# textures
idx = json.load(open(os.path.join(root, 'public/assets/textures/itch/index.json'), encoding='utf-8'))
idx = idx['textures'] if isinstance(idx, dict) else idx
mine = [e for e in idx if e.get('pack') in ('psx-dungeon', 'psx-medieval', 'fantasy-weapons-bits')]
md.append('''

## 5. Loose textures — `/assets/textures/itch/<pack>/` (indexed in `/assets/textures/itch/index.json`)

Tileable PSX textures for procedural floors/walls/props, and the exact atlases embedded in the GLBs (to build one shared
`MeshLambertMaterial`/PSX material per pack with `NearestFilter`). The dungeon tiles are 64 px (CC BY 4.0, credit goblinatron).

| path | size | category | tags |
|---|---|---|---|
''')
for e in mine:
    md.append('| `%s` | %s | %s | %s |\n' % (e['path'], e.get('size', ''), e['category'], ', '.join(e['tags'])))

md.append('''
## 6. Not in this group / notes

* No audio, VFX sheets, icons or skyboxes are in these four archives (nothing written to `audio|vfx|icons|sky/itch/`).
  `ffmpeg` is not installed on this machine (relevant for the audio groups).
* No Quaternius Bestiary / UAL files in this group, so no retargeting was done here.
* Rebuild: the scripts are in `tools/blender/itch_kits/` (`convert_psx_dungeon.py`, `convert_medieval.py`,
  `convert_nocturnal.py`, `convert_weapons_bits.py`; shared code in `kitlib.py`, texture reduction in `tex_tool.py`,
  previews `make_previews.py`, this page `make_doc.py`). Each takes `-- <extracted pack dir> <repo root>`; the archives were
  extracted under `.asset-cache/itch/kits/<pack>/x/`.
''')

open(os.path.join(root, 'docs/assets/itch-kits.md'), 'w', encoding='utf-8').write(''.join(x if x.endswith('\n') else x + '\n' for x in md))
print('DOC written', len(allr))
