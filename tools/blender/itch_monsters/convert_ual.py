"""convert_ual.py - Quaternius Universal Animation Library 1 + 2 (Standard, no root motion) -> ONE GLB:
the male mannequin + all clips of both libraries (original clip names), scaled x4/3 to the KayKit hero scale.

blender --background --factory-startup --python convert_ual.py -- <UAL1_Standard.glb> <UAL2_Standard.glb> <out.glb> <report.json>
"""
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monlib as M

SCALE = 4.0 / 3.0   # UAL mannequin 1.83 m -> 2.44 m (KayKit hero 2.4 m)

ual1, ual2, out, rep_path = M.args()
M.reset()

objs1 = M.import_gltf(ual1)
acts1 = list(bpy.data.actions)
arm = next(o for o in objs1 if o.type == 'ARMATURE')
body = [o for o in objs1 if o.type == 'MESH']
objs2 = M.import_gltf(ual2)
acts2 = [a for a in bpy.data.actions if a not in acts1]
M.delete_objects(objs2)          # second mannequin is not needed, only its actions
keep2 = []
for a in acts2:
    if a.name.startswith('A_TPose'):
        bpy.data.actions.remove(a)
    else:
        keep2.append(a)
acts2 = keep2
print('UAL1 clips', len(acts1), 'UAL2 clips', len(acts2))

# --- model: PSX materials (no texture, flat colours), single UV set, scale to hero size
for o in body:
    for slot in o.material_slots:
        m = slot.material
        p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Metallic'].default_value = 0.0
        p.inputs['Roughness'].default_value = 1.0
        try:
            p.inputs['Specular IOR Level'].default_value = 0.5
        except Exception:
            pass
        m.use_backface_culling = True
M.strip_uvs_except_first(body)
M.scale_rig(arm, body, SCALE)
for o in body:
    o.data.update()

tris = sum(len(p.vertices) - 2 for o in body for p in o.data.polygons)
mn, mx = M.mesh_bounds(body, depsgraph=False)
size, bmin, bmax = M.gltf_bounds(mn, mx)
pelvis_z = arm.data.bones['pelvis'].head_local.z

# --- clips
M.clear_nla(arm)
clips = []
names1 = {a.name for a in acts1}
for a0 in acts1 + acts2:
    nm = a0.name
    src_lib = 'UAL1' if nm in names1 else 'UAL2'
    a0.use_fake_user = True
    a = a0.copy()            # a copy exports with exact frame ranges (the importer's own actions lose a frame in the NLA export)
    M.scale_location_curves(a, SCALE)
    f0, f1 = a.frame_range
    n = max(len(fc.keyframe_points) for fc in M.fcurves(a))
    M.add_clip(arm, nm, a)
    clips.append({'name': nm, 'source': src_lib, 'frames': int(round(f1 - f0)), 'seconds': round((f1 - f0) / M.FPS, 3),
                  'channels': len(M.fcurves(a)), 'keys': n})
print('clips', len(clips))

nbytes = M.export_rigged(out, [arm] + body)
rep = {'file': out.replace('\\', '/'), 'bytes': nbytes, 'tris': tris, 'size': size, 'min': bmin, 'max': bmax, 'scale': SCALE,
       'pelvis_height': round(pelvis_z, 4), 'bones': len(arm.data.bones), 'clips': clips,
       'materials': sorted({s.material.name for o in body for s in o.material_slots if s.material})}
json.dump(rep, open(rep_path, 'w'), indent=1)
print('UALREPORT', json.dumps({k: rep[k] for k in ('bytes', 'tris', 'size', 'pelvis_height', 'bones')}), 'clips', len(clips))
