"""convert_creatures.py - "Fantasy Creatures" (algumacoisaqq, CC0): 11 rigged creatures, one FBX per clip
-> ONE skinned GLB per creature with every clip as a named animation, in place (the pack's `Motion` root-motion
bone translation is removed and written to the metadata instead), PSX texture (256 px palette), game scale.

blender --background --factory-startup --python convert_creatures.py -- <Creatures dir> <textures dir> <out dir> <report.json> [Name ...]
"""
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monlib as M

cdir, texdir, outdir, rep_path = M.args()[:4]
only = M.args()[4:]

# name: (pack folder, model scale, front/back bone check, materials, texture variants)
# scales: x4/3 is the KayKit hero ratio (1.8 m human -> 2.4 m); a few are tuned to the sizes of the brief
CREATURES = {
    'Wolf':      ('Beasts',     4 / 3, ('Head', 'Hips'),     ['wolf', 'wolf_black', 'wolf_white']),
    'Warg':      ('Beasts',     4 / 3, ('Head', 'Hips'),     ['warg', 'warg_ash', 'warg_black']),
    'Rat':       ('Beasts',     1.05,  ('Head', 'Hips'),     ['rat', 'rat_black', 'rat_plague']),
    'Bear':      ('Beasts',     4 / 3, ('Head', 'Hips'),     ['bear', 'bear_old']),
    'Rhino':     ('Beasts',     4 / 3, ('Head', 'Hips'),     ['rhino']),
    'Mammoth':   ('Beasts',     1.25,  ('Head', 'Hips'),     ['mammoth', 'mammoth_dark']),
    'Deer':      ('Beasts',     4 / 3, ('Head', 'Hips'),     ['deer']),
    'Ooze':      ('Beasts',     1.08,  None,                 ['ooze_green', 'ooze_grey', 'ooze_black', 'ooze_ochre', 'ooze_crimson']),
    'Spider':    ('Insectoids', 1.35,  ('Body', 'Abdomen'),  ['spider', 'spider_pale']),
    'Centipede': ('Insectoids', 0.8,   ('Head', 'Tail'),     ['centipede']),
    'Wasp':      ('Insectoids', 1.0,   ('Head', 'Gaster1'),  ['wasp']),
}


def tex(name):
    return os.path.join(texdir, name + '.png').replace('\\', '/')


def material_for(cname, matname, variants):
    """Replace the pack's material by a PSX one: (name, texture, alpha mode, double sided)."""
    base = variants[0]
    n = matname
    if n.endswith('_Wing'):
        return M.K.psx_material(cname.lower() + '_wing', tex('wasp_wing'), alpha='CLIP', double_sided=True)
    if n == 'M_WargTack':
        return M.K.psx_material('warg_tack', tex('warg_tack'))
    if n == 'M_Ooze':
        return M.K.psx_material('ooze_body', tex('ooze_green'), alpha='BLEND')
    if n == 'M_OozeContents':
        return M.K.psx_material('ooze_contents', tex('ooze_contents'))
    return M.K.psx_material(cname.lower() + '_main', tex(base))


def facing_ok(arm, pair):
    if not pair:
        return None
    b = arm.data.bones
    if pair[0] not in b or pair[1] not in b:
        return None
    return b[pair[0]].head_local.y < b[pair[1]].head_local.y     # front toward -Y (= glTF +Z)


report = []
for cname, (grp, scale, facing, variants) in CREATURES.items():
    if only and cname not in only:
        continue
    M.reset()
    mdir = os.path.join(cdir, grp, 'Models')
    objs = M.import_fbx(os.path.join(mdir, cname + '.fbx'))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    meshes = [o for o in objs if o.type == 'MESH']
    M.delete_objects([o for o in objs if o not in meshes and o != arm])
    front = facing_ok(arm, facing)
    if front is False:
        print('WARNING', cname, 'seems to face +Y; check orientation')
    bone_names = [b.name for b in arm.data.bones]
    tris = M.K.tri_count(meshes)

    # ---- materials / UVs
    M.strip_uvs_except_first(meshes)
    for o in meshes:
        for i, slot in enumerate(o.material_slots):
            slot.material = material_for(cname, slot.material.name if slot.material else 'M_' + cname, variants)
        o.name = o.name  # keep node names (WargBody / WargTack / WargMask / Spear / OozeContents ...)
    for o in meshes:
        M.K.cleanup_mesh(o)

    # ---- bind-pose bounds (before scaling), then scale
    nmn, nmx = M.mesh_bounds(meshes, depsgraph=False)
    native = [round(nmx.x - nmn.x, 3), round(nmx.z - nmn.z, 3), round(nmx.y - nmn.y, 3)]
    meta = json.load(open(os.path.join(mdir, 'Anims', cname.lower() + '_clips.json')))['clips']
    arm.name = 'Rig'
    M.scale_rig(arm, meshes, scale)

    # ---- clips: import every per-clip FBX, keep its action, flatten the Motion bone
    clips = []
    acts = {}
    for c in meta:
        before_acts = set(bpy.data.actions)
        oo = M.import_fbx(os.path.join(mdir, 'Anims', '%s@%s.fbx' % (cname, c['name'])))
        new = [a for a in bpy.data.actions if a not in before_acts]
        assert len(new) == 1, (cname, c['name'], [a.name for a in new])
        a = new[0]
        a.use_fake_user = True
        M.delete_objects(oo)
        for x in list(bpy.data.armatures):
            if x.users == 0:
                bpy.data.armatures.remove(x)
        travel = 0.0
        cb = M.channelbag(a)
        for fc in list(cb.fcurves):
            if fc.data_path == 'pose.bones["Motion"].location':
                vals = [k.co[1] for k in fc.keyframe_points]
                if fc.array_index == 2:                       # forward axis of the Motion bone
                    travel = vals[-1] - vals[0]
                cb.fcurves.remove(fc)
        M.scale_location_curves(a, scale)
        acts[c['name']] = a
        n_keys = int(round(a.frame_range[1] - a.frame_range[0]))
        clips.append({'name': c['name'], 'frames': c['frames'], 'keys': n_keys, 'seconds': round(c['frames'] / c['fps'], 3), 'fps': c['fps'],
                      'loop': bool(c['loop']), 'root_motion': bool(c['rootMotion']), 'travel': round(travel * scale, 3),
                      'events': [{'name': e['name'], 'time': round(e['time'], 3)} for e in c.get('events', [])]})
        assert n_keys == c['frames'], (cname, c['name'], n_keys, c['frames'])

    # ---- idle-pose bounds at the first Idle frame (after scaling)
    idle = acts['Idle']
    M.set_pose_frame(arm, idle, int(round(idle.frame_range[0])))
    imn, imx = M.mesh_bounds(meshes, depsgraph=True)
    arm.animation_data.action = None
    isz, imin, imax = M.gltf_bounds(imn, imx)

    for c in meta:
        M.add_clip(arm, c['name'], acts[c['name']])

    mn, mx = M.mesh_bounds(meshes, depsgraph=False)
    size, bmin, bmax = M.gltf_bounds(mn, mx)
    out = os.path.join(outdir, cname.lower() + '.glb')
    nbytes = M.export_rigged(out, [arm] + meshes)
    for cl in clips:
        if cl['travel']:
            cl['speed'] = round(cl['travel'] / cl['seconds'], 3)
    report.append({'id': cname.lower(), 'name': cname, 'group': grp, 'file': out.replace('\\', '/'), 'bytes': nbytes, 'scale': round(scale, 4),
                   'native_size': native, 'size': size, 'min': bmin, 'max': bmax, 'idle_size': isz, 'idle_min': imin, 'idle_max': imax,
                   'tris': tris, 'bones': len(bone_names), 'nodes': [o.name for o in meshes], 'variants': variants,
                   'front_ok': front, 'clips': clips,
                   'materials': sorted({s.material.name for o in meshes for s in o.material_slots if s.material})})
    print('CREATURE', cname, json.dumps({k: report[-1][k] for k in ('bytes', 'tris', 'size', 'scale', 'front_ok')}), 'clips', len(clips))

    merged = {}
    if os.path.exists(rep_path):
        try:
            merged = {r['id']: r for r in json.load(open(rep_path))}
        except Exception:
            merged = {}
    for r in report:
        merged[r['id']] = r
    order = [n.lower() for n in CREATURES]
    json.dump([merged[k] for k in order if k in merged], open(rep_path, 'w'), indent=1)
