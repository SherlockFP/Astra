"""KayKit Fantasy Weapons Bits 1.0 (CC0) -> /assets/models/itch/fantasy-weapons-bits/*.glb
Usage: blender --background --factory-startup --python convert_weapons_bits.py -- <extracted pack dir> <repo root>

Already at KayKit scale (sword_A 1.77 long, same as the Adventurers' sword_1handed 1.78) with the grip at the
origin and the blade along +Y, so geometry is untouched (scale 1, source pivot). Only the 1024 gradient
palette is reduced to 256 px (exact 4:1, palette PNG, nearest) and the material made PSX friendly.
"""
import bpy, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

src, root = K.args()[:2]
GLTF = os.path.join(src, 'Assets', 'gltf')
OUT = os.path.join(root, 'public/assets/models/itch/fantasy-weapons-bits')
TEXOUT = os.path.join(root, '.asset-cache/itch/kits/fantasy-weapons-bits/psx_tex')
ti = K.psx_tex(os.path.join(src, 'Textures', 'weapons_bits_texture.png'), os.path.join(TEXOUT, 'weapons_bits_texture.png'), 256)

report = []
for f in sorted(x for x in os.listdir(GLTF) if x.endswith('.gltf')):
    name = K.snake(os.path.splitext(f)[0])
    K.reset()
    K._matcache.clear()
    objs = K.import_any(os.path.join(GLTF, f))
    meshes = K.bake_and_clean(objs)
    mat = K.psx_material('weapons_bits', ti['out'], 'CLIP' if ti['alpha'] else 'OPAQUE')
    for o in meshes:
        K.set_material([o], mat)
    o = K.join(meshes, name)
    K.cleanup_mesh(o, merge=0.00005)
    r = K.export_glb(os.path.join(OUT, name + '.glb'), [o])
    r['source'] = 'Assets/gltf/' + f
    report.append(r)
    print('OK', name, r['tris'], r['size'])

K.save_report(os.path.join(root, 'tools/blender/itch_kits/_reports/fantasy-weapons-bits.json'), report)
print('DONE', len(report))
