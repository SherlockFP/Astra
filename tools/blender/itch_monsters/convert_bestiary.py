"""convert_bestiary.py - Quaternius Bestiary (Standard: Imp, Puglin) -> one skinned GLB per monster with ~37 curated
UAL clips retargeted by bone name (the Bestiary rig is the UAL rig minus pinky_*/ball_leaf_*), PSX texture, scaled.

blender --background --factory-startup --python convert_bestiary.py -- <UAL1.glb> <UAL2.glb> <Exports/GLB dir> <textures dir (256 px PNGs)> <out dir> <report.json>
"""
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monlib as M
import clipmap

ual1, ual2, bdir, texdir, outdir, rep_path = M.args()

MONSTERS = [  # id, glb, model scale (see docs/assets/itch-monsters.md)
    ('puglin', 'Puglin.glb', 1.75),   # 0.93 m native -> goblin class, ~1.6 m
    ('imp',    'Imp.glb',    1.75),   # 1.68 m native -> brute class, ~2.9 m (same scale keeps the pack's relative sizes)
]

M.reset()
objs1 = M.import_gltf(ual1)
acts1 = list(bpy.data.actions)
ual_arm = next(o for o in objs1 if o.type == 'ARMATURE')
ual_pelvis = ual_arm.data.bones['pelvis'].head_local.z
ual_bones = {b.name for b in ual_arm.data.bones}
objs2 = M.import_gltf(ual2)
acts2 = [a for a in bpy.data.actions if a not in acts1]
M.delete_objects(objs1 + objs2)
src = {}
for a in acts1 + acts2:
    if a.name.startswith('A_TPose') and a.name in src:
        continue
    src[a.name] = a
    a.use_fake_user = True
print('UAL source clips', len(src), 'pelvis', round(ual_pelvis, 4))

report = []
for mid, fname, scale in MONSTERS:
    objs = M.import_gltf(os.path.join(bdir, fname))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    meshes = [o for o in objs if o.type == 'MESH' and o.parent == arm]
    M.delete_objects([o for o in objs if o not in meshes and o != arm])
    bones = {b.name for b in arm.data.bones}
    missing = sorted(ual_bones - bones)
    extra = sorted(bones - ual_bones)
    assert not extra, extra
    for o in meshes:  # bake any object transform into the vertices (skinned meshes must sit at identity)
        mw = o.matrix_world.copy()
        if any(abs(mw[i][j] - (1 if i == j else 0)) > 1e-6 for i in range(4) for j in range(4)):
            print('  baking object matrix of', o.name)
            o.data.transform(mw)
            o.matrix_world = M.Matrix.Identity(4)
    native_pelvis = arm.data.bones['pelvis'].head_local.z
    nmn, nmx = M.mesh_bounds(meshes, depsgraph=False)
    native_h = nmx.z - nmn.z
    tris_native = sum(len(p.vertices) - 2 for o in meshes for p in o.data.polygons)

    # material: one palette texture, nearest sampler, metallic 0 / roughness 1; double-sided (thin cloth and collar meshes)
    M.strip_uvs_except_first(meshes)
    mat = M.K.psx_material('%s_main' % mid, img_path=os.path.join(texdir, '%s_1.png' % mid).replace('\\', '/'), alpha='OPAQUE', double_sided=True)
    for o in meshes:
        M.K.set_material([o], mat)
    body = M.K.join(meshes, mid)
    body.data.name = mid
    M.K.cleanup_mesh(body)
    arm.name = 'Armature'
    M.scale_rig(arm, [body], scale)
    f_loc = native_pelvis * scale / ual_pelvis   # UAL translation deltas -> this rig's scaled proportions

    clips = []
    for final, srcname, loop, note in clipmap.CURATED:
        rev = srcname.endswith('!')
        sname = srcname.rstrip('!')
        a = src[sname].copy()
        if rev:
            M.reverse_action(a)
        M.keep_bones(a, bones)
        M.scale_location_curves(a, f_loc)
        lo, hi = a.frame_range
        M.add_clip(arm, final, a)
        clips.append({'name': final, 'source': srcname, 'frames': int(round(hi - lo)), 'seconds': round((hi - lo) / M.FPS, 3), 'loop': loop, 'note': note})

    mn, mx = M.mesh_bounds([body], depsgraph=False)
    size, bmin, bmax = M.gltf_bounds(mn, mx)
    out = os.path.join(outdir, mid + '.glb')
    nbytes = M.export_rigged(out, [arm, body])
    report.append({'id': mid, 'file': out.replace('\\', '/'), 'bytes': nbytes, 'scale': scale, 'native_height': round(native_h, 3),
                   'native_pelvis': round(native_pelvis, 4), 'loc_factor': round(f_loc, 4), 'tris': M.K.tri_count([body]), 'tris_native': tris_native,
                   'size': size, 'min': bmin, 'max': bmax, 'bones': len(bones), 'missing_vs_ual': missing,
                   'variants': ['%s_%d' % (mid, i) for i in (1, 2, 3)], 'clips': clips})
    print('BESTIARY', mid, json.dumps({k: report[-1][k] for k in ('bytes', 'tris', 'size', 'scale', 'loc_factor')}))
    # clean up for the next monster
    for c in list(arm.animation_data.nla_tracks) if arm.animation_data else []:
        for s in c.strips:
            if s.action:
                bpy.data.actions.remove(s.action)
    M.delete_objects([body, arm])

json.dump({'ual_pelvis': ual_pelvis, 'monsters': report}, open(rep_path, 'w'), indent=1)
