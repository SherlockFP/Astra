"""goblinatron PSX Dungeon (CC BY 4.0) -> /assets/models/itch/psx-dungeon/*.glb
Usage: blender --background --factory-startup --python convert_psx_dungeon.py -- <extracted PSX_Dungeon dir> <repo root>
Source is a 20-unit modular kit (wall 20 W x 20 H x 5 D, door 10 x 15). Scale 0.2 makes one module exactly
one 4 m dungeon tile (TILE_SIZE) and a wall 4 x 4 x 1, identical to the KayKit dungeon wall.
"""
import bpy, os, sys, json
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

src, root = K.args()[:2]
OUT = os.path.join(root, 'public/assets/models/itch/psx-dungeon')
TEXOUT = os.path.join(root, '.asset-cache/itch/kits/psx-dungeon/psx_tex')
TEX = os.path.join(src, 'Textures')
SCALE = 0.2

# material name in the FBX -> (texture, alpha mode)
MATS = {
    'N64': ('Dungeon_Map.png', 'CLIP'),
    'Material': ('Dungeon_Map.png', 'CLIP'),
    'Chain': ('Dungeon_Map.png', 'CLIP'),
    'CratesAndBarrels': ('CratesAndBarrels_Map.png', 'OPAQUE'),
    'DoorsMap': ('Doors_Map.png', 'OPAQUE'),
}
# pivot rules (source units, Blender Z-up). default: bottom centre
PIVOT = {
    'Chain': dict(mode='top'),
    'Chandelier': dict(mode='top'),
    'Wall_Decor_01': dict(mode='back', keep_z=True),
    'Wall_Table': dict(mode='back', keep_z=True),
    'Arch': dict(mode='bottom', keep_z=True),
    'Arch_Fence': dict(mode='bottom', keep_z=True),
    'Arch_Roof': dict(mode='bottom', keep_z=True),
}
DOUBLE = {'Chain', 'Chandelier', 'Arch_Fence', 'Spikes', 'Windowed_Wall_02', 'Door_Frame_02', 'Door_03'}

texinfo = {}
for t in sorted(set(v[0] for v in MATS.values())):
    texinfo[t] = K.psx_tex(os.path.join(TEX, t), os.path.join(TEXOUT, K.snake(os.path.splitext(t)[0]) + '.png'), 256)

report = []
models = sorted(f for f in os.listdir(os.path.join(src, 'Models')) if f.lower().endswith('.fbx'))
for f in models:
    name = os.path.splitext(f)[0]
    K.reset()
    K._matcache.clear()
    objs = K.import_any(os.path.join(src, 'Models', f))
    meshes = K.bake_and_clean(objs)
    # remember original origin of the (first) object for keep_z pieces is not needed: pivots derive from bbox
    rule = PIVOT.get(name, dict(mode='bottom'))
    K.repivot(meshes, scale=SCALE, **rule)
    for o in meshes:
        for i, slot in enumerate(o.material_slots):
            mn = slot.material.name.split('.')[0] if slot.material else 'N64'
            tex, alpha = MATS.get(mn, MATS['N64'])
            ti = texinfo[tex]
            if alpha == 'CLIP' and not ti['alpha']:
                alpha = 'OPAQUE'
            mat = K.psx_material('psx_dungeon_' + K.snake(os.path.splitext(tex)[0]) + ('_2s' if name in DOUBLE else ''),
                                 ti['out'], alpha, double_sided=name in DOUBLE)
            slot.material = mat
    o = K.join(meshes, K.snake(name))
    K.cleanup_mesh(o, merge=0.0005)
    out = os.path.join(OUT, K.snake(name) + '.glb')
    r = K.export_glb(out, [o])
    r['source'] = 'Models/' + f
    r['pivot'] = rule
    report.append(r)
    print('OK', out, r['tris'], r['size'])

K.save_report(os.path.join(root, 'tools/blender/itch_kits/_reports/psx-dungeon.json'), report)
print('DONE', len(report))
