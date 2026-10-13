"""valsekamerplant "PSX Style: Going Medieval" (modular medieval kit) -> /assets/models/itch/psx-medieval/<cat>/*.glb
Usage: blender --background --factory-startup --python convert_medieval.py -- <extracted dir> <repo root>

Source GLBs (the archive ships FBX + GLB of every piece) are re-exported with:
  * scale x1.25: the kit is real-world (4 m module, 3 m storey, 2.17 m door); x1.25 gives a 5 m module,
    3.75 m storey and a 2.72 m door, which matches the KayKit dungeon door (2.75) for the 2.4 m hero.
  * the author's pivots kept (module corner for blocks/roofs/stairs/overhangs, centred for doors,
    windows, props) so every piece still snaps to every other piece exactly as designed.
  * textures PSX-ified (palette PNG, nearest), alpha BLEND replaced by MASK, metallic 0 / roughness 1.
"""
import bpy, os, sys, json
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

src, root = K.args()[:2]
OUT = os.path.join(root, 'public/assets/models/itch/psx-medieval')
TEXOUT = os.path.join(root, '.asset-cache/itch/kits/psx-style-going-medieval/psx_tex')
SCALE = 1.25
CATS = {'Building blocks': 'building', 'Decorations': 'decoration', 'Market': 'market', 'Roofs': 'roofs'}
RENAME = {'strairs_stone': 'stairs_stone', 'strairs_wood_wood': 'stairs_wood_wood', 'market_stall_yelow': 'market_stall_yellow',
          'backet': 'basket', 'bread_smol': 'bread_small', 'stone_windowsil': 'stone_windowsill',
          'wood_windowsil': 'wood_windowsill', 'apple_barrel_fillter': 'barrel_filler_apples',
          'beans_barrel_fillter': 'barrel_filler_beans', 'eggplant_barrel_fillter': 'barrel_filler_eggplant',
          'potato_barrel_fillter': 'barrel_filler_potatoes'}
# source image name (inside the GLBs) -> texture file in Textures/ and max px
TEXMAP = {'bauerhaus': ('bauerhaus.png', 352), 'market': ('market.jpg', 256), 'market_misc': ('market_misc.png', 256),
          'generic_wood': ('generic_wood.png', 128), 'wood_planks': ('wood_planks.jpg', 128), 'hay': ('hay.jpg', 128),
          'hay_dried': ('hay_dried.png', 128), 'jute': ('jute.jpg', 64), 'terracotta': ('terracotta.png', 128)}

GROUND = {'table', 'table_prebuild', 'pumpkin'}
tex = {}
for k, (f, mx) in TEXMAP.items():
    tex[k] = K.psx_tex(os.path.join(src, 'Textures', f), os.path.join(TEXOUT, k + '.png'), mx)

report = []
for folder, cat in CATS.items():
    files = sorted(f for f in os.listdir(os.path.join(src, folder)) if f.lower().endswith('.glb'))
    for f in files:
        base = os.path.splitext(f)[0]
        name = RENAME.get(base, base)
        K.reset()
        K._matcache.clear()
        objs = K.import_any(os.path.join(src, folder, f))
        meshes = K.bake_and_clean(objs)
        if base in GROUND:
            # pivot at the table top / centre in the source: put these on the ground instead
            K.repivot(meshes, mode='bottom', scale=SCALE)
        elif 'fillter' in base:
            # barrel fillers: recentre x/y (some sit 60 units away), keep their height inside the barrel
            K.repivot(meshes, mode='bottom', keep_z=True, scale=SCALE)
        else:
            K.repivot(meshes, mode='origin', scale=SCALE)
        for o in meshes:
            for slot in o.material_slots:
                m = slot.material
                img = None
                if m and m.node_tree:
                    for n in m.node_tree.nodes:
                        if n.type == 'TEX_IMAGE' and n.image:
                            img = n.image.name.split('.')[0]
                            break
                key = img if img in tex else {'Bauerhaus': 'bauerhaus', 'generic_planks': 'wood_planks',
                                               'generic_wood_1': 'generic_wood', 'teracotta': 'terracotta'}.get(
                    (m.name.split('.')[0] if m else ''), 'bauerhaus')
                ti = tex[key]
                slot.material = K.psx_material('med_' + key, ti['out'], 'CLIP' if ti['alpha'] else 'OPAQUE',
                                               double_sided=True)
        o = K.join(meshes, name)
        K.cleanup_mesh(o, merge=0.0001)
        out = os.path.join(OUT, cat, name + '.glb')
        r = K.export_glb(out, [o])
        r['source'] = folder + '/' + f
        r['category'] = cat
        report.append(r)
        print('OK', cat, name, r['tris'], r['size'])

K.save_report(os.path.join(root, 'tools/blender/itch_kits/_reports/psx-medieval.json'), report)
print('DONE', len(report))
