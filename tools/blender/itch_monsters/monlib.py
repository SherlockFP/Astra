"""monlib.py - Blender 5.2 helpers shared by the monster converters (rigged meshes + animation clips).

Runs inside headless Blender. Untrusted source files are only imported (read), never executed.
Scale contract (ARCHITECTURE.md rule 7): 1 unit = 1 m, KayKit hero ~2.4 m, +Y up, models face +Z
(in Blender terms: Z up, the front of a model faces -Y).
"""
import bpy, os, sys, json, math
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'itch_kits'))
import kitlib as K  # noqa: E402  (reuse: psx_material, args, tri_count, join, reset ...)

FPS = 30
DEBUG_STRIPS = False


def args():
    return K.args()


def reset():
    K.reset()
    K._matcache.clear()   # cached materials die with the factory reset
    for coll in (bpy.data.actions, bpy.data.armatures):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.render.fps_base = 1.0


# ---------------------------------------------------------------------------------------------------
# import
# ---------------------------------------------------------------------------------------------------
def import_gltf(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, disable_bone_shape=True)
    return [o for o in bpy.data.objects if o not in before]


def import_fbx(path, forward='Z'):
    """Unity-style FBX (Y up, character faces +Z in the file). forward='Z' makes it face -Y in Blender = +Z in glTF."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, axis_forward=forward, axis_up='Y', anim_offset=0.0)
    return [o for o in bpy.data.objects if o not in before]


def delete_objects(objs):
    for o in list(objs):
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass


# ---------------------------------------------------------------------------------------------------
# layered-action helpers (Blender 4.4+/5.x)
# ---------------------------------------------------------------------------------------------------
def fcurves(act):
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out


def channelbag(act):
    return act.layers[0].strips[0].channelbags[0]


def bone_of(fc):
    dp = fc.data_path
    if dp.startswith('pose.bones["'):
        return dp[len('pose.bones["'):dp.index('"]')]
    return None


def scale_location_curves(act, f):
    """Multiply every pose-bone `location` channel by f (rest-relative translation deltas follow the model scale)."""
    if abs(f - 1.0) < 1e-9:
        return
    for fc in fcurves(act):
        if fc.data_path.endswith('.location'):
            n = len(fc.keyframe_points)
            co = np.empty(2 * n, np.float32)
            fc.keyframe_points.foreach_get('co', co)
            co[1::2] *= f
            fc.keyframe_points.foreach_set('co', co)
            for kp in fc.keyframe_points:
                kp.handle_left[1] *= f
                kp.handle_right[1] *= f
            fc.update()


def keep_bones(act, names):
    """Delete the channels of bones that do not exist on the target rig."""
    cb = channelbag(act)
    for fc in list(cb.fcurves):
        b = bone_of(fc)
        if b is not None and b not in names:
            cb.fcurves.remove(fc)


def reverse_action(act):
    """Time-reverse every channel (keyframe x -> start+end-x)."""
    lo, hi = act.frame_range
    for fc in fcurves(act):
        n = len(fc.keyframe_points)
        co = np.empty(2 * n, np.float32)
        fc.keyframe_points.foreach_get('co', co)
        co[0::2] = lo + hi - co[0::2]
        order = np.argsort(co[0::2])
        xs, ys = co[0::2][order], co[1::2][order]
        co2 = np.empty(2 * n, np.float32)
        co2[0::2], co2[1::2] = xs, ys
        fc.keyframe_points.foreach_set('co', co2)
        for kp in fc.keyframe_points:  # reset handles; fc.update() recalculates auto-clamped ones
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'
        fc.update()


def bind_slot(act, arm):
    """Make the action's single slot belong to `arm` so the exporter / NLA see it as that armature's."""
    if len(act.slots):
        s = act.slots[0]
        try:
            s.name_display = arm.name
        except Exception:
            pass


def clear_nla(arm):
    """The glTF importer stashes every imported animation as an NLA track; drop them so only our clips are exported."""
    ad = arm.animation_data
    if ad:
        ad.action = None
        for t in list(ad.nla_tracks):
            ad.nla_tracks.remove(t)


def add_clip(arm, name, act, start=None):
    """Push `act` as an NLA track called `name` on the armature (the glTF exporter writes one animation per track)."""
    ad = arm.animation_data_create()
    ad.action = None
    act.name = name
    bind_slot(act, arm)
    tr = ad.nla_tracks.new()
    tr.name = name
    f0 = int(round(act.frame_range[0])) if start is None else start
    st = tr.strips.new(name, f0, act)
    st.name = name
    try:
        if len(act.slots) and st.action_slot is None:
            st.action_slot = act.slots[0]
    except Exception:
        pass
    st.extrapolation = 'NOTHING'
    # the strip must span exactly the action range (a longer strip adds a held frame at the end of every exported clip)
    lo, hi = act.frame_range
    try:
        st.frame_end = st.frame_start + math.ceil(hi - lo - 1e-3)   # float fuzz (62.9999) would lose the last key in the exporter's int()
    except Exception as e:
        print('strip end problem', e)
    if DEBUG_STRIPS:
        print('STRIP', name, 'action', (lo, hi), 'strip', (st.frame_start, st.frame_end), 'action_frames', (st.action_frame_start, st.action_frame_end))
    return tr


# ---------------------------------------------------------------------------------------------------
# scaling a skinned model (meshes + armature + translation channels) about the world origin
# ---------------------------------------------------------------------------------------------------
def scale_rig(arm, meshes, s):
    if abs(s - 1.0) < 1e-9:
        return
    S = Matrix.Scale(s, 4)
    for m in meshes:
        m.data.transform(S)
        m.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in arm.data.edit_bones:
        eb.head = eb.head * s
        eb.tail = eb.tail * s
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.update()


def mesh_bounds(meshes, depsgraph=True):
    """World-space AABB of the (optionally evaluated/posed) meshes."""
    dg = bpy.context.evaluated_depsgraph_get() if depsgraph else None
    mn = Vector((1e18,) * 3)
    mx = Vector((-1e18,) * 3)
    for o in meshes:
        ob = o.evaluated_get(dg) if dg else o
        me = ob.to_mesh() if dg else o.data
        mw = o.matrix_world
        for v in me.vertices:
            w = mw @ v.co
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
        if dg:
            ob.to_mesh_clear()
    return mn, mx


def gltf_bounds(mn, mx):
    """Blender (x, y, z) AABB -> glTF axes (x, z, -y): returns (size_xyz, min_xyz, max_xyz)."""
    return ([round(mx.x - mn.x, 3), round(mx.z - mn.z, 3), round(mx.y - mn.y, 3)],
            [round(mn.x, 3), round(mn.z, 3), round(-mx.y, 3)],
            [round(mx.x, 3), round(mx.z, 3), round(-mn.y, 3)])


def set_pose_frame(arm, act, frame):
    ad = arm.animation_data_create()
    ad.action = act
    try:
        if len(act.slots):
            ad.action_slot = act.slots[0]
    except Exception:
        pass
    bpy.context.scene.frame_set(int(frame))
    bpy.context.view_layer.update()


# ---------------------------------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------------------------------
def export_rigged(path, objs, nla=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_vertex_color='NONE', export_image_format='AUTO', export_cameras=False, export_lights=False,
              export_extras=False, export_skins=True, export_animations=True,
              export_animation_mode='NLA_TRACKS' if nla else 'ACTIONS',
              export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True,
              export_anim_single_armature=True, export_rest_position_armature=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print('export kw problem', e)
        for k in ('export_vertex_color', 'export_anim_single_armature', 'export_rest_position_armature'):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    return os.path.getsize(path)


def strip_uvs_except_first(objs):
    for o in objs:
        if o.type == 'MESH' and len(o.data.uv_layers) > 1:
            names = [u.name for u in o.data.uv_layers]
            for n in names[1:]:
                o.data.uv_layers.remove(o.data.uv_layers[n])
        if o.type == 'MESH':
            # drop colour attributes: the pack's masks are not vertex lighting
            for ca in list(o.data.color_attributes):
                try:
                    o.data.color_attributes.remove(ca)
                except Exception:
                    pass
