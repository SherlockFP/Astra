"""Write docs/assets/generated-weapons.md from _meta/*.json + the exported GLBs.

Plain Python 3 (no Blender needed):
  python tools/blender/weapons/make_doc.py
"""
import json
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
GLB_DIR = os.path.join(ROOT, 'public', 'assets', 'models', 'gen', 'weapons')
META = os.path.join(HERE, '_meta')
OUT = os.path.join(ROOT, 'docs', 'assets', 'generated-weapons.md')

GROUPS = [('sword_1h', 'Tek el kılıçlar'), ('sword_2h', 'Çift el kılıçlar'), ('axe_1h', 'Tek el baltalar'),
          ('axe_2h', 'Çift el baltalar'), ('mace', 'Topuzlar / çekiç'), ('hammer', 'Topuzlar / çekiç'),
          ('staff', 'Asalar'), ('wand', 'Değnekler'), ('dagger', 'Hançerler'), ('crossbow', 'Arbaletler'),
          ('bow', 'Yaylar'), ('shield', 'Kalkanlar')]


def glb_info(path):
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    g = json.loads(data[20:20 + jlen])
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for m in g['meshes']:
        for p in m['primitives']:
            a = g['accessors'][p['attributes']['POSITION']]
            mn = [min(x, y) for x, y in zip(mn, a['min'])]
            mx = [max(x, y) for x, y in zip(mx, a['max'])]
    imgs = [im.get('name', '') for im in g.get('images', [])]
    return dict(size=[mx[i] - mn[i] for i in range(3)], min=mn, max=mx, anims=len(g.get('animations', [])),
                images=imgs, bytes=len(data))


def group_of(aid):
    for p, name in GROUPS:
        if aid.startswith(p):
            return name
    return 'Diğer'


def main():
    order = json.load(open(os.path.join(META, '_order.json'), encoding='utf-8'))
    rows = []
    for aid in order:
        mp = os.path.join(META, aid + '.json')
        gp = os.path.join(GLB_DIR, aid + '.glb')
        if not (os.path.exists(mp) and os.path.exists(gp)):
            continue
        m = json.load(open(mp, encoding='utf-8'))
        rows.append((m, glb_info(gp)))
    total = sum(g['bytes'] for _, g in rows)
    L = []
    L.append('# Generated weapons (PSX MMO style)\n')
    L.append('Area: `weapons` - %d loot / equippable weapons and off-hands, generated headless with Blender 5.2 '
             '(`tools/blender/weapons/`). Look: Metin2 / Knight Online / early-WoW low poly, faceted flat shading, '
             'one tiny nearest-filtered pixel atlas per asset (procedural numpy painting, max 16 colours = PSX 4-bit '
             'CLUT spirit, Bayer dither, dark 1px outlines, painted bevel highlights). Total size %.0f KB.\n'
             % (len(rows), total / 1024))
    L.append('Preview: `docs/assets/previews/weapons.png`\n')
    L.append('## Conventions\n')
    L.append('- glTF is +Y up, 1 unit = 1 m = 1 game unit (KayKit scale). Sizes below are glTF **X x Y x Z** '
             '(W x H x D) in metres; the attach column also uses glTF axes.')
    L.append('- **Hand-held weapons**: origin = grip point (attach to the hand bone / KayKit `handslot`), blade or '
             'head points +Y (Blender +Z); flat of the blade faces glTF +Z/-Z, axe/mace cutting edge toward +X. '
             'Two-handers: origin = upper hand, the second hand sits ~0.25-0.4 lower on the grip/haft.')
    L.append('- **Staves**: origin = main-hand grip ~0.8 above the foot, total length 2.2.')
    L.append('- **Crossbows**: like KayKit `crossbow_1handed` they point forward along glTF +Z (Blender -Y); origin '
             '= trigger grip under the stock, prod spans X.')
    L.append('- **Bows**: origin = bow grip, limbs along glTF Y, string on the archer side (glTF -Z), arrow flies '
             'glTF +Z.')
    L.append('- **Shields**: origin = hand grip bar behind the plate, painted face toward glTF +Z (Blender -Y); '
             'plain wood/leather/iron back.')
    L.append('- Materials: one `MeshStandardMaterial`-compatible PBR material per file, baseColor texture (embedded '
             'PNG, sampler NEAREST / NEAREST_MIPMAP_NEAREST, GLTFLoader applies it), roughness 0.9, metallic 0, single-sided. Emissive parts use an emissive '
             'texture + `KHR_materials_emissive_strength` = 2 so bloom picks them up. No animations (static props).')
    L.append('- Textures are 64x64 (shields 128x128: painted face + plain back + rim strip).\n')
    L.append('```ts')
    L.append("// three.js example")
    L.append("const gltf = await loader.loadAsync('/assets/models/gen/weapons/sword_1h_dragon.glb');")
    L.append("const weapon = gltf.scene; handBone.add(weapon); // already oriented: blade along +Y, grip at origin")
    L.append('```\n')
    cur = None
    for m, g in rows:
        grp = group_of(m['id'])
        if grp != cur:
            cur = grp
            L.append('\n## %s\n' % grp)
            L.append('| id | URL | Türkçe ad | size W x H x D (m) | tris | anims | KB | intended use | emissive | attach |')
            L.append('|---|---|---|---|---|---|---|---|---|---|')
        s = g['size']
        L.append('| `%s` | `/assets/models/gen/weapons/%s.glb` | %s | %.2f x %.2f x %.2f | %d | - | %.1f | %s | %s | %s |'
                 % (m['id'], m['id'], m['name'], s[0], s[1], s[2], m['tris'], g['bytes'] / 1024, m['use'],
                    m['emissive'] or '-', m['attach']))
    L.append('\n## Regenerate\n')
    L.append('```bash')
    L.append('B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"')
    L.append('"$B" --background --factory-startup --python tools/blender/weapons/gen_weapons.py -- '
             'public/assets/models/gen/weapons tools/blender/weapons/_meta            # all (or add id filters, e.g. sword staff_fire)')
    L.append('"$B" --background --factory-startup --python tools/blender/weapons/preview.py -- '
             'public/assets/models/gen/weapons docs/assets/previews/weapons.png --width 2400 --label 0.06')
    L.append('python tools/blender/weapons/make_doc.py')
    L.append('node tools/glb-inspect.mjs public/assets/models/gen/weapons --short')
    L.append('```\n')
    L.append('Files: `wlib.py` (mesh builder, pixel painters, palette reduction, export), `wparts.py` (blades, '
             'guards, grips, pommels), `w_swords.py`, `w_axes.py` (axes, maces, hammer), `w_staves.py` (staves, '
             'wands), `w_daggers.py`, `w_ranged.py` (crossbows, bows), `w_shields.py`, `gen_weapons.py` (driver), '
             '`preview.py` (EEVEE contact sheet), `make_doc.py` (this file).')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L) + '\n')
    print('wrote', OUT, len(rows), 'assets', total, 'bytes')


main()
