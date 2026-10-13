# Probe FBX/OBJ/GLB files: objects, bounds, materials, textures, armatures, actions.
# Usage: blender --background --factory-startup --python probe.py -- <out.json> <file>...
import bpy, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out_path, files = argv[0], argv[1:]

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(f):
    ext = os.path.splitext(f)[1].lower()
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=f)
    elif ext == '.obj':
        bpy.ops.wm.obj_import(filepath=f)
    elif ext in ('.glb', '.gltf'):
        bpy.ops.import_scene.gltf(filepath=f)

res = []
for f in files:
    reset()
    try:
        imp(f)
    except Exception as e:
        res.append({'file': f, 'error': str(e)}); continue
    dg = bpy.context.evaluated_depsgraph_get()
    mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
    objs = []
    tris = 0
    for o in bpy.context.scene.objects:
        info = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
                'loc': [round(v, 3) for v in o.location], 'rot': [round(v, 3) for v in o.rotation_euler],
                'scale': [round(v, 4) for v in o.scale]}
        if o.type == 'MESH':
            oe = o.evaluated_get(dg)
            me = oe.to_mesh()
            for v in me.vertices:
                w = oe.matrix_world @ v.co
                mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
            me.calc_loop_triangles()
            info['tris'] = len(me.loop_triangles)
            tris += info['tris']
            info['mats'] = [m.name if m else None for m in o.data.materials]
            info['modifiers'] = [m.type for m in o.modifiers]
            info['vgroups'] = len(o.vertex_groups)
            info['uv'] = len(o.data.uv_layers)
            info['vcol'] = len(o.data.color_attributes)
            oe.to_mesh_clear()
        if o.type == 'ARMATURE':
            info['bones'] = len(o.data.bones)
            info['bone_names'] = [b.name for b in o.data.bones][:80]
        if o.animation_data and o.animation_data.action:
            info['action'] = o.animation_data.action.name
        objs.append(info)
    mats = {}
    for m in bpy.data.materials:
        imgs = []
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    imgs.append({'img': n.image.name, 'path': n.image.filepath, 'size': list(n.image.size)})
        mats[m.name] = imgs
    acts = [{'name': a.name, 'range': list(a.frame_range)} for a in bpy.data.actions]
    res.append({'file': f, 'bounds_min': [round(v, 3) for v in mn], 'bounds_max': [round(v, 3) for v in mx],
                'size': [round(b - a, 3) for a, b in zip(mn, mx)], 'tris': tris, 'objects': objs, 'materials': mats,
                'actions': acts, 'fps': bpy.context.scene.render.fps})
with open(out_path, 'w') as fh:
    json.dump(res, fh, indent=1)
print('PROBED', len(res))
