"""Probe materials/images of GLB files (read only).  blender --background --factory-startup --python probe_mats.py -- <out.json> <glb>...
Prints per material: node types, base colour default, image name/size/alpha, blend method, backface culling, uv count."""
import bpy, sys, json, os

argv = sys.argv[sys.argv.index('--') + 1:]
out, files = argv[0], argv[1:]
res = {}
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for d in list(coll):
            coll.remove(d)
    bpy.ops.import_scene.gltf(filepath=f)
    info = {'objs': [], 'mats': {}}
    for o in bpy.context.scene.objects:
        e = {'name': o.name, 'type': o.type, 'parent': o.parent.name if o.parent else None,
             'loc': [round(v, 3) for v in o.location], 'rot': [round(v, 3) for v in o.rotation_euler],
             'scale': [round(v, 3) for v in o.scale]}
        if o.type == 'MESH':
            e['uv'] = len(o.data.uv_layers)
            e['tris'] = sum(len(p.vertices) - 2 for p in o.data.polygons)
            e['mats'] = [m.name if m else None for m in o.data.materials]
            e['vcol'] = len(o.data.color_attributes)
        info['objs'].append(e)
    for m in bpy.data.materials:
        d = {'nodes': [n.type for n in m.node_tree.nodes] if m.use_nodes else None,
             'blend': getattr(m, 'blend_method', None), 'cull': m.use_backface_culling}
        if m.use_nodes:
            p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if p:
                d['base'] = [round(v, 3) for v in p.inputs['Base Color'].default_value]
                d['linked'] = {i.name: [l.from_node.type for l in i.links] for i in p.inputs if i.links}
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image:
                    d['img'] = {'name': n.image.name, 'size': list(n.image.size), 'interp': n.interpolation,
                                'ext': n.extension, 'alpha_mode': n.image.alpha_mode, 'packed': bool(n.image.packed_file)}
        info['mats'][m.name] = d
    res[os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f)] = info
with open(out, 'w') as fh:
    json.dump(res, fh, indent=1)
print('PROBED', len(res))
