"""make_doc.py - writes docs/assets/itch-monsters.md and the runtime sidecar JSONs from the build reports (system Python).

python -I tools/blender/itch_monsters/make_doc.py        (run from the project root)
Outputs: docs/assets/itch-monsters.md
         public/assets/models/itch/creatures/creatures.json
         public/assets/models/itch/bestiary/bestiary.json
         public/assets/models/itch/ual/UAL_clips.json
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import clipmap

ROOT = os.getcwd()
REP = os.path.join(ROOT, 'tools/blender/itch_monsters/_reports')
PUB = os.path.join(ROOT, 'public/assets')
ual = json.load(open(os.path.join(REP, 'ual.json')))
bes = json.load(open(os.path.join(REP, 'bestiary.json')))
cre = json.load(open(os.path.join(REP, 'creatures.json')))
rm = json.load(open(os.path.join(REP, 'ual_rm_speeds.json')))
UAL_SCALE = 4 / 3
LOCO = re.compile(r'Walk|Jog|Sprint|_Fwd|Roll|Dash|Slide_Loop')   # clips whose root motion is a real travel speed


def kb(path):
    return round(os.path.getsize(os.path.join(ROOT, path)) / 1024)


def url(path):
    return '/' + path.replace('\\', '/').split('public/')[-1]


ROLES = {
    'puglin': ('Goblin-class grunt (1.6 m): melee trash in packs of 4-8 with the stick (Attack_1H_*), a thrower with `Throw`, an ambusher with '
               '`Crouch_Idle` -> `Charge`. Scale x1.4 (2.3 m) gives a chieftain / mini-boss. Hunched silhouette reads well in goblin camps, '
               'mines and the early dungeon floors.'),
    'imp': ('Brute-class elite (2.9 m) with spiked mace and chains: slow heavy hitter (`Attack_2H`, `Attack_2H_Combo`, `Charge`), '
            'chain-gang mini-boss at x1.3 (3.8 m). `Walk_Zombie` / `Idle_Zombie` give a shambling hell-thrall variant; `Cast_*` + `Spellcast` '
            'turn it into a fire caster. Fits demonic / infernal floors and boss-room guards.'),
    'wolf': 'Fast pack melee trash on forest, cave and graveyard floors. `Howl` (3.5 s, event at 0.8 s) can summon 1-2 more wolves, `Lunge` is a leap attack (2.1 m of travel, bite at 0.87 s). White / black variants for frost / night packs.',
    'warg': ('Elite wolf and goblin mount: three meshes on one rig, `WargBody` always, `WargTack` (saddle, straps, bridle) and `WargMask` (bone war-mask) for the '
             'war-pack version; a rider sits on bone `Socket_Saddle`. Pair with the Puglin for "goblin rider" packs, or use alone as a pack leader / mini-boss at x1.3.'),
    'rat': 'Swarm trash for sewers, crypts and cellars (0.5 m tall, 1.7 m with tail). `Rear` is the threat display, `Lunge` a short pounce. The plague variant is the poison / disease DoT version, black the cheaper reskin.',
    'bear': ('Heavy melee elite for caves and forests. `Sleep` -> `Wake` makes an ambush or a sleeping mini-boss, `Rear` + `Roar` (event at 0.9 s / 0.3 s) is the aggro buff, '
             '`Slam` a ground-pound AoE (impact 0.77 s), `Hug` a grab (0.73 s), `Swipe` / `Bite` the basic hits. Old variant is a scarred boss version.'),
    'rhino': ('Charging brute: `Charge` (4.0 m per 0.33 s cycle) in a line, `Daze` as the stun window after it hits a wall, `Gore` and `Stamp` (AoE at 1.0 s) as melee. '
              'The snapped spear in its shoulder is the separate mesh node `Spear` (hide it for an unhurt rhino). Arena / steppe elite.'),
    'mammoth': ('Boss-size (4.0 m) beast for ice caves and steppe: `Stomp` AoE (impact 1.03 s), `TuskSwipe` (0.5 s), `Trumpet` (buff / summon, event 0.6 s), `Charge` (5.3 m per cycle). '
                'Also a good mount-sized neutral or an "ancient beast" world boss at x1.5. Dark variant for the frozen / undead version.'),
    'deer': 'Neutral wildlife and ambience (3.2 m with antlers): `Graze`, `Alert`, `Trot` and a fast `Run` flee (10.9 m/s). `Attack` (antler butt, 0.5 s) turns it into a cornered-stag elite or a hunting-quest target.',
    'ooze': ('Acid / slime mob with five colour ramps (green acid, grey, black pudding = more opaque tank, ochre, crimson). `Lash` and `Grab` melee, `Spit` ranged (0.7 s), '
             '`Engulf` (grab at 0.73 s, swallow at 1.53 s) as a heavy hit, `Puddle` = disguised ambusher, `Rise` to reveal. `Split` (event at 1.93 s) is the moment to swap in two '
             'half-size oozes playing `Reform`. The jelly body is the only alpha-BLEND material in the pack; `OozeContents` (skull, bones, helm, coins, sword) is a second mesh node.'),
    'spider': ('Horse-sized ambush hunter for caves, webbed crypts and the deep floors (3.0 m across the legs, 1.2 m high): `Strike` leap (0.73 s), `Bite` (poison, 0.5 s), '
               '`WebSpit` (ranged root / slow, release 0.67 s). The pale variant is the deep-cave version. Bone `Socket_Saddle` allows a rider / boss-mount.'),
    'centipede': ('Long, low burrower (3.6 m long, 0.3 m high): `Burrow` / `Emerge` (2.3 / 1.9 m of travel) for tunnel ambushes, `Bite` (poison, 0.55 s), `Threat` display. '
                  'Use an elongated hit capsule and let it dive into the floor with a dust VFX at the `Burrow` event (0.57 s).'),
    'wasp': ('Flying trash and swarm enemy: **hover is baked in** (body y 0.95-2.05, put the origin on the floor). `Fly` is 4 m/s, `Sting` (0.6 s) in place, `Dive` (sting at 0.9 s) as a '
             'swoop you drive with code, `Death` falls to the floor. Wings are 42 triangles of ordered-dither MASK (stippled membrane + solid veins).'),
}

NOTES = {
    'ooze': 'Textures: `ooze_green` (embedded), `ooze_grey`, `ooze_black`, `ooze_ochre`, `ooze_crimson` swap on `OozeBody` (RGBA, alpha = jelly opacity); `ooze_contents` on `OozeContents`.',
}

lines = []
w = lines.append

ual_clips = {c['name']: c for c in ual['clips']}


def fmt_s(x):
    return ('%.2f' % x).rstrip('0').rstrip('.')


# ----------------------------------------------------------------------------------------------------------------------
w('# itch.io monsters: Bestiary, Universal Animation Libraries, Fantasy Creatures (converted)\n')
tot = sum(kb('public/assets/models/itch/' + p) for p in
          ['ual/UAL_clips.glb', 'bestiary/imp.glb', 'bestiary/puglin.glb'] + ['creatures/%s.glb' % c['id'] for c in cre])
ntex = sum(len([f for f in fs if f.endswith('.png')]) for _, _, fs in
           [x for d in ('bestiary', 'creatures') for x in os.walk(os.path.join(PUB, 'textures/itch', d))])
w('Four itch.io packs converted to skinned, animated, PSX-ready GLBs for EFSUN ONLINE: **%d GLBs, %.1f MB** plus %d loose variant / FX textures (<= 256 px). '
  'Every model is one skinned mesh set on one armature, all clips are **in place** (no root motion) and the sizes follow the scale contract. '
  'Licences and credits: `docs/assets/credits-itch.md` (group *monsters*). Contact sheet (posed from the real clips): `docs/assets/previews/itch-monsters.png`. '
  'Verify everything with `node tools/verify-monsters.mjs`.\n' % (3 + len(cre), tot / 1024, ntex))
w('| Pack | Public folder | GLBs | Licence |')
w('|---|---|---:|---|')
w('| Quaternius **Universal Animation Library 1 + 2** (Standard) | `/assets/models/itch/ual/` | 1 (mannequin + 85 clips) | CC0 |')
w('| Quaternius **Bestiary - Dungeon Monsters Kit** (Standard, 2 of 7 monsters) | `/assets/models/itch/bestiary/` | 2 (37 clips each) | Quaternius Asset License v1.0 (free, commercial use, no credit; **no redistribution of the assets as assets**) |')
w('| algumacoisaqq **Fantasy Creatures** (Beasts + Insectoids) | `/assets/models/itch/creatures/` | 11 | CC0 |')
w('')
w('## 0. Conventions (read first)\n')
w('* **Scale contract** (ARCHITECTURE rule 7): 1 unit = 1 m, KayKit hero 2.4 m (= 1.8 m human x 4/3), +Y up, **models face +Z**, origin on the ground at the body centre '
  '(the wasp hovers: its origin is the floor under it). `rotation.y = Math.atan2(dx, dz)` aims them.')
w('* **Rigs**: one `Armature` / `Rig` node with the skinned mesh node(s) as siblings, no extensions, no morph targets. Bestiary + mannequin use the 65-bone Unreal-mannequin '
  'skeleton (the Bestiary has 55 of them); the creatures use plain bone hierarchies (`Root`, `Hips`, ..., `Socket_*` attachment bones, an unused `Motion` root bone).')
w('* **Clips are in place.** The creature pack drives travel with its `Motion` bone; that translation is removed from the clips and recorded as `travel` (metres per play) and `speed` (m/s) in the sidecar JSON, '
  'so you move the body in code and set `timeScale = actualSpeed / clip.speed` to stop foot sliding. The UAL clips come from the non-root-motion library files.')
w('* **Clip names are clean** (`Idle`, `Walk`, `Run`, `Attack_1H_1`, `Bite`, `Death`, ...), no suffixes. Loop / once information lives in the sidecar JSONs and in the tables below '
  '(**loop** clips end on their first pose, **once** clips start and end near the rest pose; play `Death*` with `LoopOnce` + `clampWhenFinished = true`). '
  'Clips start at t = 0 and last exactly the source length (30 fps source, keys thinned by `glbopt.py`: rotation error <= 0.05 deg, translation <= 0.4 mm).')
w('* **Materials**: one palette texture (256 colours, <= 256 px), NEAREST sampler, metallic 0 / roughness 1, no normal / ORM / emissive maps (the Bestiary glow is baked into the colour), no extensions. '
  'Alpha: `wasp_wing` is MASK (membrane ordered-dithered to 0/255), `ooze_body` is the single BLEND material (translucent jelly), everything else is opaque. '
  'Back-face culling is on except `imp_main`, `puglin_main` and `wasp_wing` (thin cloth / collar / wings are double-sided). `Assets.onModelLoaded` still applies the usual PSX patch.')
w('* **Colour variants** are separate 256 px PNGs on the same UVs in `/assets/textures/itch/<bestiary|creatures>/`; the GLB embeds variant 1. Swap at runtime:')
w('')
w('```ts')
w('const tex = new THREE.TextureLoader().load("/assets/textures/itch/creatures/wolf_black.png");')
w('tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter;')
w('mesh.material = mesh.material.clone(); mesh.material.map = tex;   // mesh = the skinned mesh (SkinnedMesh) of the loaded scene')
w('```')
w('')
w('* Per-clip sidecars for game code: `/assets/models/itch/creatures/creatures.json`, `/assets/models/itch/bestiary/bestiary.json`, `/assets/models/itch/ual/UAL_clips.json` '
  '(duration, loop, travel, speed, event times such as the frame a bite lands).')
w('')

# ----------------------------------------------------------------------------------------------------------------------
w('## 1. Bestiary - Dungeon Monsters Kit (Quaternius) - `/assets/models/itch/bestiary/`\n')
w('The free *Standard* download contains **2 of the 7 monsters**: Puglin (goblin-pig) and Imp. '
  'Both share the Unreal-mannequin bone **names** of the Universal Animation Library: the Bestiary rig has 55 bones and is an exact subset of the UAL rig '
  '(65 bones; missing: `pinky_01..04_l/r`, `ball_leaf_l/r`), same hierarchy. The rest poses differ (hunched spine, other arm angles), so the clips are retargeted '
  '**by bone name as rest-relative local rotations** (each bone plays the same delta from its own rest pose, verified numerically: <= 0.04 deg difference to the UAL deltas), '
  'channels of missing bones are dropped and translation (pelvis / root) is scaled by the rig\'s leg-length ratio. '
  'Both monsters use the same model scale **x1.75** so the pack\'s relative sizes are kept: Puglin 0.93 m -> 1.6 m (goblin class), Imp 1.68 m -> 2.9 m (brute class). '
  'Meshes are joined into one skinned mesh per monster (the Imp mace, chains, collar and shorts, the Puglin stick and tusks are part of it; the original 2048 px PBR set is reduced to one 256 px colour map, UV set 0 only).\n')
w('| URL | KB | tris | W x H x D (m) | bones | variants (texture files) |')
w('|---|---:|---:|---|---:|---|')
for m in bes['monsters']:
    s = m['size']
    w('| `/assets/models/itch/bestiary/%s.glb` | %d | %d | %.2f x %.2f x %.2f (T-pose, arms out) | %d | %s |' % (
        m['id'], kb('public/assets/models/itch/bestiary/%s.glb' % m['id']), m['tris'], s[0], s[1], s[2], m['bones'],
        ', '.join('`%s`' % v for v in m['variants'])))
w('')
w('Native size -> exported: Puglin %.3f m -> %.2f m (scale 1.75, pelvis %.2f m, translation factor %.3f), Imp %.3f m -> %.2f m (scale 1.75, pelvis %.2f m, translation factor %.3f). '
  'Tri counts are the pack\'s own (Imp 15.2k, Puglin 7.5k, no decimation): fine for a few dozen on screen, make an LOD or decimate if you need crowds. '
  'Variants: `*_1` red imp / green puglin (embedded), `*_2` green imp / red puglin, `*_3` blue for both.\n' % (
      bes['monsters'][0]['native_height'], bes['monsters'][0]['size'][1], bes['monsters'][0]['native_pelvis'] * 1.75, bes['monsters'][0]['loc_factor'],
      bes['monsters'][1]['native_height'], bes['monsters'][1]['size'][1], bes['monsters'][1]['native_pelvis'] * 1.75, bes['monsters'][1]['loc_factor']))
w('**Suggested enemy roles**\n')
for m in bes['monsters']:
    w('* **%s**: %s' % (m['id'], ROLES[m['id']]))
w('')
w('### 1.1 Clip list (identical for both monsters, 37 clips)\n')
w('`S` = seconds, **loop** clips repeat, **once** clips are one-shots. "Foot-lock speed" is the move speed at which the legs do not slide (UAL root-motion distance x leg-length ratio: '
  'Imp x%.2f, Puglin x%.2f); use it as `timeScale = speed / footLock`.\n' % (bes['monsters'][1]['loc_factor'], bes['monsters'][0]['loc_factor']))
w('| clip | S | mode | foot-lock m/s Imp / Puglin | source UAL clip | note |')
w('|---|---:|---|---|---|---|')
fi, fp = bes['monsters'][1]['loc_factor'], bes['monsters'][0]['loc_factor']
for name, srcname, loop, note in clipmap.CURATED:
    sname = srcname.rstrip('!')
    sec = ual_clips[sname]['seconds']
    r = rm.get(sname, {})
    sp = r.get('speed', 0) or 0
    if name in ('Charge', 'Dash', 'Dodge') or (loop and sp):
        spd = '%.2f / %.2f' % (sp * fi, sp * fp) if sp else '-'
    else:
        spd = '-'
    w('| `%s` | %s | %s | %s | `%s`%s | %s |' % (name, fmt_s(sec), 'loop' if loop else 'once', spd, sname, ' (reversed, derived)' if srcname.endswith('!') else '', note))
w('')
w('Not in the libraries, so **not invented**: `Kick`, `Roar`, `Strafe_L` / `Strafe_R`, `Hit_Back` (use `Taunt` as the shout, `Hit_Front` / `Hit_Head` / `Hit_Knockback` for reactions, `Walk` with a fixed facing for strafing). '
  '`Death_B` is derived (the `LayToIdle` clip played backwards: the monster sinks down and lies on the floor); `GetUp` doubles as the spawn / wake-up animation. '
  'All 85 other UAL clips (sitting, farming, swimming, pistol, ...) are in `UAL_clips.glb` and can be retargeted onto the monsters with the same recipe if you need them.\n')

# ----------------------------------------------------------------------------------------------------------------------
w('## 2. Universal Animation Library 1 + 2 (Quaternius, CC0) - `/assets/models/itch/ual/UAL_clips.glb`\n')
mn = ual['size']
w('One GLB with the **male mannequin and all 85 clips of both libraries** (UAL 1: 43 clips, UAL 2: 42 clips, one duplicate `A_TPose` removed), original clip names, '
  'for runtime retargeting onto any rig that has the same bone names, or as a stand-in dummy. Source files: the *Standard* (no root motion) GLBs. '
  'Scaled **x4/3** to the hero scale: mannequin %.2f m tall (T-pose %.2f m wide), %d tris, %d bones, `M_Main` / `M_Joints` flat colours, %d KB.\n' % (
      mn[1], mn[0], ual['tris'], ual['bones'], kb('public/assets/models/itch/ual/UAL_clips.glb')))
w('Retarget recipe (what the Bestiary monsters got): same bone name -> same **rest-relative** local rotation; scale the pelvis / root translation by `targetPelvisHeight / %.4f` '
  '(this file\'s pelvis rest height in metres); skip bones the target does not have. With three.js: `SkeletonUtils.retargetClip(targetMesh, sourceMesh, clip, { hip: "pelvis" })`, '
  'or copy the quaternions by name after multiplying with `inverse(sourceRest) * targetRest` in the node\'s parent space.\n' % ual['pelvis_height'])
w('Move speeds are the root-motion distances of the `_RM` library files (x4/3 for this scale).\n')
w('| clip | S | lib | m/s | clip | S | lib | m/s |')
w('|---|---:|---|---:|---|---:|---|---:|')
cl = ual['clips']
half = (len(cl) + 1) // 2
for i in range(half):
    row = []
    for c in (cl[i], cl[i + half] if i + half < len(cl) else None):
        if c is None:
            row += ['', '', '', '']
            continue
        sp = (rm.get(c['name'], {}).get('speed', 0) or 0) if LOCO.search(c['name']) else 0
        row += ['`%s`' % c['name'], fmt_s(c['seconds']), c['source'], ('%.2f' % (sp * UAL_SCALE)) if sp else '']
    w('| ' + ' | '.join(row) + ' |')
w('')

# ----------------------------------------------------------------------------------------------------------------------
w('## 3. Fantasy Creatures (algumacoisaqq, CC0) - `/assets/models/itch/creatures/`\n')
w('Eleven rigged creatures (the archive\'s own README says they are AI-generated with scripted Blender models; licence CC0). Each creature\'s per-clip FBX files (`Wolf@Bite.fbx`, ...) '
  'are merged into **one GLB** with every clip as an animation named like the file (`Bite`). The pack\'s `*_clips.json` loop flags and event times are kept in `creatures.json`; '
  'textures are 1024 px RGB + smoothness alpha in the source: reduced to **256 px, 256-colour RGB** (smoothness dropped). '
  'Model scale = pack metres x the factor below (x4/3 is the hero ratio; the rat, mammoth, spider, ooze and centipede follow the brief sizes).\n')
w('| URL | scale | W x H x D (m) | tris | KB | bones | nodes | variants |')
w('|---|---:|---|---:|---:|---:|---|---|')
for c in cre:
    s = c['size']
    w('| `/assets/models/itch/creatures/%s.glb` | x%.2f | %.2f x %.2f x %.2f | %d | %d | %d | %s | %s |' % (
        c['id'], c['scale'], s[0], s[1], s[2], c['tris'], kb('public/assets/models/itch/creatures/%s.glb' % c['id']), c['bones'],
        ', '.join('`%s`' % n for n in c['nodes']), ', '.join('`%s`' % v for v in c['variants'])))
w('')
w('Heights are the bind-pose AABB (the Idle clip starts on it; the wasp spans y 0.95-2.04 because it hovers; the deer height includes the raised head and antlers; the ooze is 3.3 m across with its pseudopods out). '
  'Extra FX textures (256 px or smaller, RGBA): `/assets/textures/itch/creatures/fx/` (`ooze_drop`, `ooze_splat`, `ooze_flat`, `spider_web`, `centipede_hole`).\n')
w('### 3.1 Per creature: roles and full clip lists\n')
w('Clip format: `Name seconds` + `loop` (else once) + `m/s` (speed that the in-place clip represents) + `@t` (event times in seconds: bite lands, howl, split, ...).\n')
for c in cre:
    s = c['size']
    w('#### %s - `/assets/models/itch/creatures/%s.glb`\n' % (c['name'], c['id']))
    w('%.2f m tall, %.2f x %.2f footprint, %d tris, %d KB, %d bones. Nodes: %s. **Roles**: %s' % (
        s[1], s[0], s[2], c['tris'], kb('public/assets/models/itch/creatures/%s.glb' % c['id']), c['bones'], ', '.join('`%s`' % n for n in c['nodes']), ROLES[c['id']]))
    if c['id'] in NOTES:
        w('\n' + NOTES[c['id']])
    w('')
    parts = []
    for k in c['clips']:
        t = '`%s` %s' % (k['name'], fmt_s(k['seconds']))
        if k['loop']:
            t += ' loop'
        if k.get('speed'):
            t += ' %.2f m/s' % k['speed']
            if not k['loop']:
                t += ' (%.2f m travel)' % k['travel']
        if k['events']:
            t += ' ' + ' '.join('@%s=%s' % (e['name'], fmt_s(e['time'])) for e in k['events'])
        parts.append(t)
    w('Clips (%d): %s\n' % (len(c['clips']), ' / '.join(parts)))

# ----------------------------------------------------------------------------------------------------------------------
w('## 4. Rebuilding\n')
w('```bash')
w('B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"      # one Blender process at a time')
w('python -I tools/blender/itch_monsters/texkit.py .asset-cache/itch/monsters public                    # textures (Pillow + numpy)')
w('"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_ual.py -- <UAL1_Standard.glb> <UAL2_Standard.glb> public/assets/models/itch/ual/UAL_clips.glb tools/blender/itch_monsters/_reports/ual.json')
w('"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_bestiary.py -- <UAL1.glb> <UAL2.glb> <Bestiary GLB dir> public/assets/textures/itch/bestiary public/assets/models/itch/bestiary tools/blender/itch_monsters/_reports/bestiary.json')
w('"$B" --background --factory-startup --python tools/blender/itch_monsters/convert_creatures.py -- <Creatures dir> public/assets/textures/itch/creatures public/assets/models/itch/creatures tools/blender/itch_monsters/_reports/creatures.json [Name ...]')
w('for f in public/assets/models/itch/{ual,bestiary,creatures}/*.glb; do python -I tools/blender/itch_monsters/glbopt.py $f; done   # time shift, key thinning')
w('python -I tools/blender/itch_monsters/rm_speeds.py <UAL1_Standard_RM.glb> <UAL2_Standard_RM.glb> tools/blender/itch_monsters/_reports/ual_rm_speeds.json')
w('python -I tools/blender/itch_monsters/make_doc.py                                                       # this file + the sidecar JSONs')
w('node tools/verify-monsters.mjs && node tools/glb-inspect.mjs public/assets/models/itch/creatures --short')
w('```')
w('')
w('Notes for whoever extends this: the glTF importer stashes every imported animation as an NLA track (`monlib.clear_nla` removes them before export); the exporter loses the last key of a clip when the strip end is '
  '62.9999 instead of 63 (`monlib.add_clip` rounds up); `glbopt.py` must run after every export (clips start one frame late and every bone has constant scale / translation channels otherwise).')

open(os.path.join(ROOT, 'docs/assets/itch-monsters.md'), 'w', encoding='utf8').write('\n'.join(lines) + '\n')

# ----------------------------------------------------------------------------------------------------------------------
# sidecar JSONs
def clip_json(k):
    d = {'seconds': k['seconds'], 'loop': k['loop']}
    if k.get('root_motion') is not None:
        d['rootMotion'] = k['root_motion']
    if k.get('travel'):
        d['travel'] = k['travel']
        d['speed'] = k['speed']
    if k.get('events'):
        d['events'] = {e['name']: e['time'] for e in k['events']}
    return d


out = {}
for c in cre:
    out[c['id']] = {'url': '/assets/models/itch/creatures/%s.glb' % c['id'], 'scale': c['scale'], 'size': c['size'], 'tris': c['tris'], 'nodes': c['nodes'],
                    'textures': {v: '/assets/textures/itch/creatures/%s.png' % v for v in c['variants']},
                    'clips': {k['name']: clip_json(k) for k in c['clips']}}
json.dump(out, open(os.path.join(PUB, 'models/itch/creatures/creatures.json'), 'w'), indent=1)

out = {}
for m in bes['monsters']:
    f = m['loc_factor']
    clips = {}
    for name, srcname, loop, note in clipmap.CURATED:
        sname = srcname.rstrip('!')
        d = {'seconds': ual_clips[sname]['seconds'], 'loop': loop, 'source': srcname.rstrip('!') + ('(reversed)' if srcname.endswith('!') else '')}
        sp = rm.get(sname, {}).get('speed', 0) or 0
        if sp and (loop or name in ('Charge', 'Dash', 'Dodge')):
            d['footLockSpeed'] = round(sp * f, 3)
        clips[name] = d
    out[m['id']] = {'url': '/assets/models/itch/bestiary/%s.glb' % m['id'], 'scale': m['scale'], 'size': m['size'], 'tris': m['tris'],
                    'textures': {v: '/assets/textures/itch/bestiary/%s.png' % v for v in m['variants']}, 'clips': clips}
json.dump(out, open(os.path.join(PUB, 'models/itch/bestiary/bestiary.json'), 'w'), indent=1)

out = {'url': '/assets/models/itch/ual/UAL_clips.glb', 'scale': UAL_SCALE, 'pelvisRestHeight': ual['pelvis_height'], 'size': ual['size'], 'tris': ual['tris'], 'clips': {}}
for c in ual['clips']:
    sp = (rm.get(c['name'], {}).get('speed', 0) or 0) if LOCO.search(c['name']) else 0
    d = {'seconds': c['seconds'], 'library': c['source']}
    if sp:
        d['speed'] = round(sp * UAL_SCALE, 3)
    out['clips'][c['name']] = d
json.dump(out, open(os.path.join(PUB, 'models/itch/ual/UAL_clips.json'), 'w'), indent=1)
print('doc written:', len(lines), 'lines')
