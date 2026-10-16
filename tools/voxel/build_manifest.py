#!/usr/bin/env python
"""build_manifest.py - one record per source model under public/assets/models (ART_VOXEL_PSX.md sections 1.3, 2, 4.3 WP0).

    python -I tools/voxel/build_manifest.py [--out tools/voxel/manifest.json]

Every .glb / .gltf under public/assets/models (except the voxel output folder) gets one record with:
  decision  voxel   converted by run_all.py to public/assets/models/voxel/<same path>, .gltf -> .glb
            replace nature family (trees, bushes, rocks, tufts, flowers, ...): remapped to the generated set (WP5)
            keep    dungeon shell, ground / terrain tiles, animation library: never converted
  class     hero | medium | small | large | boss | weapon | shield | prop | building | castle | massif | crop | nature | keep
  game_cell voxel edge in metres as the player sees it; native_cell = game_cell / scale = the --cell value
  scale     in-game scale. Skinned: median of the enemy defs using the file (src/data/enemies.ts), players 1.0.
            Static: pack scale (hex town x6, Kenney fantasy / castle / nature x4, Kenney graveyard / survival x3, else x1).
  budget    visible-triangle budget (run_all.py retries with a larger cell above budget * 1.12)
  hidden_nodes  default-hidden hero accessories (CharacterModel.ts loadout); excluded from visible tris

Source of the class / cell values: ART_VOXEL_PSX.md Appendix A (skinned, "game cell" column) and section 1.3 (classes).
User decisions of 2026-10-13 are applied: all families voxelised, hero head proportion 1.0 (no --scale-bone),
hero voxel edge 0.09 m, dungeon shell and terrain stay smooth.
"""
import sys, os, re, json, struct, statistics, argparse, datetime

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC_ROOT = os.path.join(REPO, 'public', 'assets', 'models')
VOX_DIR_NAME = 'voxel'
ENEMY_TS = os.path.join(REPO, 'src', 'data', 'enemies.ts')
DEFAULT_OUT = os.path.join(HERE, 'manifest.json')

HERO_CELL = 0.09                    # user decision: hero voxel edge 0.09 m (doc default)
GAME_CELL_MIN = 0.06                # never below 0.06 m (section 1.3)
CELL_CAP_FACTOR = 1.25              # auto-budget may coarsen a file up to x1.25 of its base cell (-36 % tris)

BUDGET = {'hero': 7600, 'medium': 6000, 'small': 3200, 'large': 8500, 'boss': 9500, 'weapon': 1500,
          'shield': 3000, 'prop': 3500, 'building': 6000, 'castle': 11000, 'massif': 1500, 'crop': 1500, 'nature': 3000}

HERO_OVERLAY = r'(Helmet|Hat|Hood)$'
SKELETON_OVERLAY = r'(Helmet|Hat|Hood|Cloak)$'
STATIC_KEEP = 'flame|fire_fx|grass|flowers|vine|leaf'      # alpha cards / particles pass through (section 3.3)

# Skinned models: path without extension -> (class, game cell m). Game cells are the "game cell" column of
# ART_VOXEL_PSX.md Appendix A (heroes 0.09, medium 0.09-0.11, small 0.06-0.075, large 0.14, bosses 0.14-0.18).
SKINNED = {
    'characters/Barbarian': ('hero', 0.09), 'characters/Knight': ('hero', 0.09), 'characters/Mage': ('hero', 0.09),
    'characters/Rogue': ('hero', 0.09), 'characters/Rogue_Hooded': ('hero', 0.09),
    'enemies/Skeleton_Mage': ('medium', 0.09), 'enemies/Skeleton_Minion': ('medium', 0.09),
    'enemies/Skeleton_Rogue': ('medium', 0.09), 'enemies/Skeleton_Warrior': ('medium', 0.09),
    'gen/bosses/buzul_devi': ('boss', 0.158), 'gen/bosses/golge_rahibesi': ('boss', 0.140),
    'gen/bosses/kemik_lordu': ('boss', 0.142), 'gen/bosses/kizil_ejder': ('boss', 0.180),
    'gen/bosses/lav_golemi': ('boss', 0.145), 'gen/bosses/mantar_kral': ('boss', 0.156),
    'gen/creatures/bat_cave': ('small', 0.060), 'gen/creatures/elemental_fire': ('large', 0.140),
    'gen/creatures/elemental_ice': ('medium', 0.095), 'gen/creatures/golem_stone': ('large', 0.140),
    'gen/creatures/imp_fire': ('medium', 0.090), 'gen/creatures/mushroom_brute': ('medium', 0.090),
    'gen/creatures/slime_frost': ('medium', 0.090), 'gen/creatures/slime_green': ('small', 0.072),
    'gen/creatures/slime_lava': ('small', 0.089), 'gen/creatures/spider_giant': ('medium', 0.090),
    'gen/creatures/wolf_dire': ('small', 0.075), 'gen/creatures/wraith': ('medium', 0.090),
    'itch/bestiary/imp': ('large', 0.140), 'itch/bestiary/puglin': ('medium', 0.090),
    'itch/creatures/bear': ('medium', 0.090), 'itch/creatures/centipede': ('medium', 0.090),
    'itch/creatures/deer': ('medium', 0.093), 'itch/creatures/ooze': ('small', 0.081),
    'itch/creatures/rhino': ('medium', 0.111), 'itch/creatures/spider': ('small', 0.105),
    'itch/creatures/warg': ('medium', 0.090), 'itch/creatures/wasp': ('small', 0.060),
    'itch/creatures/wolf': ('small', 0.060),
    'monsters/Bat': ('medium', 0.090), 'monsters/Blue_Demon': ('boss', 0.140), 'monsters/Demon': ('large', 0.140),
    'monsters/Demon_Lord': ('boss', 0.140), 'monsters/Dragon_Evolved': ('boss', 0.140), 'monsters/Ghost': ('medium', 0.092),
    'monsters/Giant': ('boss', 0.140), 'monsters/Goblin': ('medium', 0.090), 'monsters/Imp': ('medium', 0.090),
    'monsters/Mushnub': ('small', 0.060), 'monsters/Mushroom_King': ('boss', 0.140), 'monsters/Orc': ('large', 0.140),
    'monsters/Rat': ('small', 0.060), 'monsters/Skull': ('small', 0.060), 'monsters/Slime': ('small', 0.072),
    'monsters/Spider': ('medium', 0.090), 'monsters/Yeti': ('boss', 0.140), 'monsters/Zombie': ('medium', 0.093),
    'npcs/King': ('medium', 0.090), 'npcs/Worker': ('medium', 0.090),
    # KayKit Adventurers 2.0 bodies (characters/v2/, Rig_Medium): the same hero class / cell / overlay as the 1.0 bodies
    'characters/v2/Barbarian': ('hero', 0.09), 'characters/v2/Knight': ('hero', 0.09), 'characters/v2/Mage': ('hero', 0.09),
    'characters/v2/Ranger': ('hero', 0.09), 'characters/v2/Rogue': ('hero', 0.09), 'characters/v2/Rogue_Hooded': ('hero', 0.09),
}
# Appendix A in-game scale (measured) where the enemy defs of a file mix variants of very different size (swarm /
# elite); the median of such a mix matches none of them. Each value reproduces the Appendix A native cell.
SCALE_PIN = {'gen/creatures/elemental_fire': 1.4, 'gen/creatures/slime_green': 1.07, 'gen/creatures/slime_lava': 1.33,
             'itch/bestiary/puglin': 1.4, 'itch/creatures/ooze': 0.55, 'itch/creatures/rhino': 0.95, 'monsters/Yeti': 1.0}
# in-game scale used when no enemy def names the file (NPC.ts base scale; Appendix A where code has none)
SCALE_FALLBACK = {'npcs/King': 1.15, 'npcs/Worker': 1.15, 'itch/bestiary/imp': 1.2, 'gen/creatures/bat_cave': 1.0}
BLEND_RE = re.compile(r'(^monsters/(Ghost|Slime)$)|(^gen/creatures/(slime_\w+|wraith)$)|(^itch/creatures/ooze$)')
# KayKit hero accessories the game toggles (CharacterModel.ts WEAPON_NODES / HELM_NODES)
TOGGLE_NODES = {'1H_Sword', '2H_Sword', '1H_Axe', '2H_Axe', 'Mug', '2H_Staff', '1H_Wand', 'Knife', '1H_Crossbow', '2H_Crossbow',
                'Throwable', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', '1H_Axe_Offhand',
                'Barbarian_Round_Shield', 'Spellbook', 'Spellbook_open', 'Knife_Offhand', 'Knight_Helmet', 'Barbarian_Hat', 'Mage_Hat'}
# default-visible loadout per hero file (CharacterModel.ts CLASS_VISUALS main / off / helm)
HERO_VISIBLE = {'Knight': {'1H_Sword', 'Round_Shield', 'Knight_Helmet'}, 'Barbarian': {'2H_Axe', 'Barbarian_Hat'},
                'Mage': {'2H_Staff', 'Mage_Hat'}, 'Rogue': {'Knife', 'Knife_Offhand'}, 'Rogue_Hooded': {'Knife', 'Knife_Offhand'}}

# static families
SHELL_RE = re.compile(r'^(floor|wall|stairs|pillar|barrier|rubble|arch)', re.I)          # dungeon shell folders only
GROUND_RE = re.compile(r'^(ground|path|floor|road|planks|patch|dirt|sand|tile)', re.I)
CROP_RE = re.compile(r'^crops?(_|-|$)', re.I)
MASSIF_RE = re.compile(r'^(hills?|mountain|cloud)', re.I)
NATURE_RE = re.compile(r'^(tree|trees|pine|spruce|oak|birch|palm|bush|rock|rocks|grass|flower|flowers|plant|plants|'
                       r'mushroom|cactus|log|stump|lily|waterlily|waterplant|reeds?|tuft|cliff|trunk)', re.I)
NATURE_FOLDERS = ('kenney/nature-kit', 'kenney/survival-kit', 'kenney/castle-kit', 'kenney/fantasy-town-kit',
                  'kenney/graveyard-kit', 'gen/props', 'halloween', 'town/decoration/nature', 'itch/retro-psx-nature-pack',
                  'itch/retro-psx-tree-pack', 'itch/nocturnal-watch')
WEAPON_FOLDERS = ('weapons', 'gen/weapons', 'itch/fantasy-weapons-bits')
BUILD_RE = re.compile(r'^(wall|fence|gate|tower|roof|house|building|castle|church|windmill|watermill|tavern|barracks|'
                      r'chimney|bridge|siege|crypt|structure|arch|overhang|brick|iron-fence|stone-wall|hedge|stairs)', re.I)
PACK_SCALE = [('town/', 6.0), ('kenney/fantasy-town-kit', 4.0), ('kenney/castle-kit', 4.0), ('kenney/nature-kit', 4.0),
              ('kenney/graveyard-kit', 3.0), ('kenney/survival-kit', 3.0)]
ENEMY_PREFIX = {'MON': 'monsters/%s', 'CHAR': 'characters/%s', 'SKEL': 'enemies/%s', 'GEN': 'gen/creatures/%s',
                'GENB': 'gen/bosses/%s', 'ITCH': 'itch/creatures/%s', 'GRAVE': 'kenney/graveyard-kit/%s', 'WPN': 'weapons/skeleton/%s'}
DEF_RE = re.compile(r"model:\s*(?:(?P<fn>MON|CHAR|SKEL|GEN|GENB|ITCH|GRAVE|WPN)\('(?P<name>[^']+)'\)|(?P<pug>PUG)\b"
                    r"|'/assets/models/(?P<lit>[^']+)')[^\n]*?\bscale:\s*(?P<scale>\d*\.?\d+)")


def rel_noext(rel):
    return os.path.splitext(rel)[0]


def read_header(path):
    """glTF JSON chunk only (cheap): returns the parsed JSON document."""
    if path.lower().endswith('.gltf'):
        with open(path, 'rb') as f:
            return json.loads(f.read().decode('utf-8'))
    with open(path, 'rb') as f:
        head = f.read(20)
        if len(head) < 20 or head[:4] != b'glTF':
            raise ValueError('not a GLB: %s' % path)
        clen, ctype = struct.unpack('<II', head[12:20])
        if ctype != 0x4E4F534A:
            raise ValueError('first GLB chunk is not JSON: %s' % path)
        return json.loads(f.read(clen).decode('utf-8'))


def trs(n):
    if 'matrix' in n:
        return np.array(n['matrix'], float).reshape(4, 4).T
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    s = np.array(n.get('scale', [1, 1, 1]), float)
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * s[None, :]
    M[:3, 3] = n.get('translation', [0, 0, 0])
    return M


def world_size(js):
    """Bounding-box size (metres in file units) of all mesh primitives, from accessor min / max. None if unknown."""
    nodes = js.get('nodes', [])
    accs = js.get('accessors', [])
    local = [trs(nd) for nd in nodes]
    parent = [-1] * len(nodes)
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []):
            parent[c] = i
    world = [None] * len(nodes)

    def W(i):
        if world[i] is None:
            world[i] = local[i] if parent[i] < 0 else W(parent[i]) @ local[i]
        return world[i]
    lo = np.full(3, np.inf)
    hi = np.full(3, -np.inf)
    found = False
    for i, nd in enumerate(nodes):
        if 'mesh' not in nd:
            continue
        for prim in js['meshes'][nd['mesh']].get('primitives', []):
            pos = prim.get('attributes', {}).get('POSITION')
            if pos is None or 'min' not in accs[pos] or 'max' not in accs[pos]:
                continue
            mn, mx = np.array(accs[pos]['min'], float), np.array(accs[pos]['max'], float)
            M = W(i)
            for c in range(8):
                p = np.array([mx[0] if c & 1 else mn[0], mx[1] if c & 2 else mn[1], mx[2] if c & 4 else mn[2], 1.0])
                q = (M @ p)[:3]
                lo = np.minimum(lo, q)
                hi = np.maximum(hi, q)
            found = True
    return (hi - lo).tolist() if found else None


def enemy_scales():
    """rel path (no extension) -> (scales of non-boss defs, scales of boss defs) that use it, from src/data/enemies.ts.
    Boss / world-boss defs (id boss_*, wb_*, rank boss / miniboss) reuse the same GLB at a bigger scale; they are kept
    apart so the trash / elite size stays the reference (matches Appendix A), and only used when nothing else exists."""
    plain, boss = {}, {}
    if not os.path.exists(ENEMY_TS):
        return plain, boss
    text = open(ENEMY_TS, encoding='utf-8').read()
    for m in DEF_RE.finditer(text):
        if m.group('fn'):
            key = ENEMY_PREFIX[m.group('fn')] % m.group('name')
        elif m.group('pug'):
            key = 'itch/bestiary/puglin'
        else:
            key = rel_noext(m.group('lit'))
        ls = text.rfind('\n', 0, m.start()) + 1
        le = text.find('\n', m.end())
        line = text[ls:le if le >= 0 else len(text)]
        is_boss = re.search(r"id:\s*'(boss_|wb_)", line) is not None or re.search(r"rank:\s*'(boss|miniboss)'", line) is not None
        (boss if is_boss else plain).setdefault(key, []).append(float(m.group('scale')))
    return plain, boss


def pack_scale(rel):
    for prefix, s in PACK_SCALE:
        if rel.startswith(prefix):
            return s
    return 1.0


def static_game_cell(kind, size, pscale, rel):
    if size is None:
        longest = 0.0
    else:
        longest = max(size) * pscale
    if kind == 'building':
        lo, hi = (0.25, 0.5)
        if rel.startswith('itch/psx-walls-fences'):
            return 0.25
        return min(hi, max(lo, longest / 14.0)) if longest > 0 else 0.25
    return min(0.40, max(GAME_CELL_MIN, longest / 14.0)) if longest > 0 else 0.12


def base_record(rel, decision, cls, reason):
    return {'src': rel, 'out': rel_noext(rel) + '.glb', 'decision': decision, 'class': cls, 'reason': reason,
            'skinned': False, 'static': False, 'scale': None, 'scale_src': None, 'game_cell': None, 'native_cell': None,
            'cell_cap': None, 'budget': None, 'weights': 'rigid', 'blur': 0, 'overlay': None, 'keep': None,
            'no_variation': False, 'hidden_nodes': [], 'bbox_m': None, 'src_kb': None, 'family': family_of(rel)}


def family_of(rel):
    parts = rel.split('/')[:-1]
    return '/'.join(parts[:2]) if parts else '.'


def classify(rel, js, skinned, size, uses):
    """Return one manifest record for a source file (rel is relative to public/assets/models, with extension)."""
    key = rel_noext(rel)
    folder = os.path.dirname(rel).replace('\\', '/')
    fname = os.path.basename(rel)
    lb = rel_noext(fname).lower()

    if rel.startswith('itch/ual/') or lb == 'ual_clips':
        return base_record(rel, 'keep', 'keep', 'animation library, not rendered')

    if rel.startswith('characters/v2/anims/'):
        return base_record(rel, 'keep', 'keep', 'Rig_Medium clip file (read for the 2.0 bodies, never rendered)')

    if skinned or key in SKINNED or key.startswith('kenney/graveyard-kit/character-'):
        r = base_record(rel, 'voxel', 'medium', 'skinned model')
        r['skinned'] = True
        if key in SKINNED:
            cls, game = SKINNED[key]
        elif key.startswith('kenney/graveyard-kit/character-'):
            cls, game = 'medium', 0.10
            r['reason'] = 'graveyard kit character (WP2 / section 2.1 row 7: cell 0.1)'
        else:
            cls, game = 'medium', HERO_CELL
            r['reason'] = 'skinned model not in Appendix A (fallback class medium, cell 0.09)'
        r['class'] = cls
        if rel.startswith('characters/'):
            scale, src = 1.0, 'players scale 1'
            r['hidden_nodes'] = []
        elif key in SCALE_PIN:
            scale, src = SCALE_PIN[key], 'Appendix A in-game scale (pinned, enemy defs vary)'
        elif key in uses[0] and uses[0][key]:
            scale, src = statistics.median(uses[0][key]), 'median of %d non-boss enemy def(s), src/data/enemies.ts' % len(uses[0][key])
        elif key in uses[1] and uses[1][key]:
            scale, src = statistics.median(uses[1][key]), 'median of %d boss def(s) only, src/data/enemies.ts' % len(uses[1][key])
        elif key in SCALE_FALLBACK:
            scale, src = SCALE_FALLBACK[key], 'fallback table (NPC.ts / Appendix A)'
        elif key.startswith('kenney/graveyard-kit/character-'):
            scale, src = 3.0, 'pack scale x3 (graveyard kit)'
        else:
            scale, src = 1.0, 'no enemy def found, default 1.0'
        r['scale'], r['scale_src'] = round(float(scale), 4), src
        r['game_cell'] = game
        r['native_cell'] = round(game / scale, 4)
        r['cell_cap'] = round(r['native_cell'] * CELL_CAP_FACTOR, 4)
        r['budget'] = BUDGET[cls]
        r['weights'] = 'blend' if BLEND_RE.search(key) else 'rigid'
        r['blur'] = 1 if key.startswith(('itch/', 'gen/')) else 0
        if key.startswith('characters/'):
            r['overlay'] = HERO_OVERLAY
            hero = fname.split('.')[0]
            visible = HERO_VISIBLE.get(hero, set())
            names = {n.get('name') for n in js.get('nodes', [])}
            r['hidden_nodes'] = sorted((names & TOGGLE_NODES) - visible)
        elif key.startswith('enemies/Skeleton_'):
            r['overlay'] = SKELETON_OVERLAY
        r['src_kb'] = None
        return r

    if re.match(r'^(dungeon|itch/psx-dungeon)/', rel) and SHELL_RE.match(lb):
        return base_record(rel, 'keep', 'keep', 'dungeon shell stays smooth (section 1.7, WP10 optional)')
    if GROUND_RE.match(lb) or folder.startswith('town/tiles'):
        return base_record(rel, 'keep', 'keep', 'ground / terrain tile stays smooth (section 1.7)')

    if CROP_RE.match(lb) and folder.startswith('kenney/nature-kit'):
        r = base_record(rel, 'voxel', 'crop', 'farm crop (WP5: cell 0.15)')
        r.update(static=True, budget=BUDGET['crop'], game_cell=0.15, scale=pack_scale(rel), scale_src='pack scale')
        r['native_cell'] = round(0.15 / r['scale'], 4)
        r['cell_cap'] = round(r['native_cell'] * CELL_CAP_FACTOR, 4)
        r['keep'] = STATIC_KEEP
        r['blur'] = 0
        return r

    if folder.startswith('town/') and MASSIF_RE.match(lb):
        r = base_record(rel, 'voxel', 'massif', 'hex massif / cloud (WP5: game cell 0.9-1.2)')
        r.update(static=True, budget=BUDGET['massif'], game_cell=1.0, scale=pack_scale(rel), scale_src='pack scale')
        r['native_cell'] = round(1.0 / r['scale'], 4)
        r['cell_cap'] = round(r['native_cell'] * CELL_CAP_FACTOR, 4)
        return r

    if (NATURE_RE.match(lb) or (folder == 'kenney/nature-kit' and lb.startswith('stone'))) and any(folder == p or folder.startswith(p + '/') for p in NATURE_FOLDERS):
        r = base_record(rel, 'replace', 'nature', 'tree / bush / rock / tuft family: remapped to the generated set (section 2.2)')
        r['budget'] = BUDGET['nature']
        return r

    if any(folder == p or folder.startswith(p + '/') for p in WEAPON_FOLDERS):
        shield = 'shield' in lb
        cls = 'shield' if shield else 'weapon'
        game = 0.06                                   # WP2 brief: ALL weapons and shields at 0.06 (section 1.3 had 0.04 for daggers / wands)
        r = base_record(rel, 'voxel', cls, 'held item, local grid at 0.06 (all weapons and shields, WP2 brief)')
        r.update(static=True, budget=BUDGET[cls], game_cell=game, scale=1.0, scale_src='held item scale 1',
                 native_cell=game, keep=None)
        r['cell_cap'] = round(game * CELL_CAP_FACTOR, 4)
        r['blur'] = 1 if key.startswith(('gen/', 'itch/')) else 0
        return r

    building = (folder.startswith(('town/buildings', 'itch/psx-medieval/building', 'itch/psx-medieval/roofs', 'itch/psx-walls-fences'))
                or (folder.startswith('itch/nocturnal-watch') and re.match(r'^(tavern|church)', lb) is not None)
                or BUILD_RE.match(lb) is not None)
    pscale = pack_scale(rel)
    if building:
        cls = 'castle' if 'castle' in lb else 'building'
        game = static_game_cell('building', size, pscale, rel)
        r = base_record(rel, 'voxel', cls, 'building / kit wall or roof (section 1.3, WP7)')
        r.update(static=True, budget=BUDGET[cls], game_cell=round(game, 4), scale=pscale, scale_src='pack scale',
                 no_variation=True, keep=STATIC_KEEP, blur=1 if key.startswith(('itch/', 'gen/')) else 0)
    else:
        game = static_game_cell('prop', size, pscale, rel)
        r = base_record(rel, 'voxel', 'prop', 'static prop: clamp(longest / 14, 0.06, 0.40) (section 1.3, WP6)')
        r.update(static=True, budget=BUDGET['prop'], game_cell=round(game, 4), scale=pscale, scale_src='pack scale',
                 keep=STATIC_KEEP, blur=1 if key.startswith(('itch/', 'gen/')) else 0)
    r['native_cell'] = round(r['game_cell'] / pscale, 4)
    r['cell_cap'] = round(r['native_cell'] * CELL_CAP_FACTOR, 4)
    return r


def build(src_root=SRC_ROOT):
    uses = enemy_scales()
    entries = []
    skipped = []
    for root, dirs, files in os.walk(src_root):
        vox_abs = os.path.normcase(os.path.abspath(os.path.join(src_root, VOX_DIR_NAME)))
        dirs[:] = sorted(d for d in dirs if os.path.normcase(os.path.abspath(os.path.join(root, d))) != vox_abs)
        for fn in sorted(files):
            if not fn.lower().endswith(('.glb', '.gltf')):
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, src_root).replace('\\', '/')
            try:
                js = read_header(full)
            except Exception as e:                      # unreadable file: keep it smooth, report it
                skipped.append({'src': rel, 'error': str(e)[:200]})
                continue
            skinned = any('skin' in n for n in js.get('nodes', []))
            size = None if skinned else world_size(js)
            r = classify(rel, js, skinned, size, uses)
            r['bbox_m'] = [round(v, 3) for v in size] if size else None
            r['src_kb'] = round(os.path.getsize(full) / 1024)
            if r['skinned'] and r['decision'] == 'voxel':
                r['bbox_m'] = None
            entries.append(r)
    entries.sort(key=lambda r: r['src'])
    counts = {}
    for r in entries:
        k = '%s/%s' % (r['decision'], r['class'])
        counts[k] = counts.get(k, 0) + 1
    return {'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            'rules': {'hero_cell': HERO_CELL, 'game_cell_min': GAME_CELL_MIN, 'cell_cap_factor': CELL_CAP_FACTOR,
                      'tolerance': 1.12, 'budget': BUDGET, 'enemy_defs_matched': sum(len(v) for d in uses for v in d.values())},
            'counts': counts, 'unreadable': skipped, 'entries': entries}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--src-root', default=SRC_ROOT)
    a = ap.parse_args()
    man = build(a.src_root)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    tot = {}
    for r in man['entries']:
        tot[r['decision']] = tot.get(r['decision'], 0) + 1
    print('manifest: %d entries -> %s' % (len(man['entries']), a.out))
    print('decisions: %s' % json.dumps(tot))
    for k in sorted(man['counts']):
        print('  %-22s %5d' % (k, man['counts'][k]))
    if man['unreadable']:
        print('unreadable: %d' % len(man['unreadable']))


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(errors='replace')
    except Exception:
        pass
    main()
