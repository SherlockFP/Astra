"""Render preview sheets of exported creature GLBs (re-imports the GLBs, Workbench, headless).

  blender --background --factory-startup --python render_preview.py -- <glb_dir> <contact.png> [poses.png] [id,id,...]

contact.png : one 3/4 view per creature (Idle frame 0) with id + size label.
poses.png   : one row per creature: Idle / Walk / Run / Attack / Cast / Hit / Death(end).
"""
import math
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
GLB_DIR, CONTACT = argv[0], argv[1]
POSES = argv[2] if len(argv) > 2 and argv[2].endswith('.png') else None
IDS = None
COLS = None
for a in argv[2:]:
    if a.startswith('cols='):
        COLS = a[5:].split(',')
    elif not a.endswith('.png'):
        IDS = a.split(',')
TMP = tempfile.mkdtemp(prefix='crprev_')
BG = (0.11, 0.12, 0.15)
VIEW = Vector((0.85, -1.0, 0.55)).normalized()


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'TEXTURE'
    sh.show_shadows = True
    sh.shadow_intensity = 0.35
    sh.show_specular_highlight = False
    w = bpy.data.worlds.new('w')
    w.color = BG
    sc.world = w
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.clip_start = 0.05
    cam.data.clip_end = 200
    sc.collection.objects.link(cam)
    sc.camera = cam
    # ground
    me = bpy.data.meshes.new('ground')
    s = 30
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    g = bpy.data.objects.new('ground', me)
    m = bpy.data.materials.new('ground')
    m.diffuse_color = (0.2, 0.21, 0.24, 1)
    me.materials.append(m)
    sc.collection.objects.link(g)
    # label (parented to camera)
    cu = bpy.data.curves.new('label', 'FONT')
    lab = bpy.data.objects.new('label', cu)
    lm = bpy.data.materials.new('label')
    lm.diffuse_color = (1, 0.92, 0.6, 1)
    cu.materials.append(lm)
    sc.collection.objects.link(lab)
    lab.parent = cam
    return sc, cam, lab


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    meshes = [o for o in objs if o.type == 'MESH' and o.name in bpy.context.scene.objects and o.parent is not None]
    return arm, meshes


def find_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + '_') or a.name.startswith(name + '.'):
            return a
    return None


def pose(arm, name, frac):
    act = find_action(name)
    if act is None or arm is None:
        return False
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    ad.action = act
    try:
        if len(act.slots):
            ad.action_slot = act.slots[0]
    except AttributeError:
        pass
    f0, f1 = act.frame_range
    bpy.context.scene.frame_set(int(round(f0 + (f1 - f0) * frac)))
    return True


def world_points(meshes):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        M = eo.matrix_world
        pts += [M @ v.co for v in me.vertices]
        eo.to_mesh_clear()
    return pts


def frame_camera(cam, pts, pad=1.18):
    rot = (-VIEW).to_track_quat('-Z', 'Y')
    R = rot.to_matrix()
    right, up = R.col[0], R.col[1]
    us = [p.dot(right) for p in pts]
    vs = [p.dot(up) for p in pts]
    cu, cv = (min(us) + max(us)) / 2, (min(vs) + max(vs)) / 2
    size = max(max(us) - min(us), max(vs) - min(vs)) * pad
    c = sum(pts, Vector()) / len(pts)
    depth = c.dot(VIEW)
    cam.location = right * cu + up * cv + VIEW * (depth + 30)
    cam.rotation_euler = rot.to_euler()
    cam.data.ortho_scale = size
    return size


def set_label(lab, text, size, frac=0.06):
    lab.data.body = text
    lab.data.size = size * frac
    lab.location = (-size / 2 + size * 0.03, -size / 2 + size * 0.03, -1.0)
    lab.rotation_euler = (0, 0, 0)


def render(path, res):
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    a = np.array(img.pixels[:], np.float32).reshape(res, res, 4)
    bpy.data.images.remove(img)
    return a


def save_sheet(arr, path):
    h, w = arr.shape[:2]
    img = bpy.data.images.new('sheet', w, h, alpha=False)
    img.pixels.foreach_set(arr.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save()


files = sorted(f for f in os.listdir(GLB_DIR) if f.endswith('.glb'))
if IDS:
    files = [f for f in files if f[:-4] in IDS]

# -------- contact sheet
CELL = 420
cols = 4
rows = math.ceil(len(files) / cols)
sheet = np.zeros((rows * CELL, cols * CELL, 4), np.float32)
sheet[..., :3] = BG
sheet[..., 3] = 1
for i, f in enumerate(files):
    sc, cam, lab = setup_scene()
    arm, meshes = import_glb(os.path.join(GLB_DIR, f))
    pose(arm, 'Idle', 0.0)
    pts = world_points(meshes)
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    pts.append(Vector((mn.x, mn.y, 0)))  # keep the ground contact in frame
    size = frame_camera(cam, pts)
    d = mx - mn
    set_label(lab, '%s  %.2fx%.2fx%.2f' % (f[:-4], d.x, d.z, d.y), size, 0.055)
    img = render(os.path.join(TMP, 'c%02d.png' % i), CELL)
    r, c = rows - 1 - i // cols, i % cols
    sheet[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = img
    print('contact', f, 'size(WxHxD)=%.2fx%.2fx%.2f' % (d.x, d.z, d.y))
save_sheet(sheet, CONTACT)

# -------- pose sheet
if POSES:
    PC = 240
    cols_p = COLS or ['Idle:0', 'Walk:0.25', 'Run:0.25', 'Attack:0.5', 'Cast:0.6', 'Hit:0.3', 'Death:1']
    sheet = np.zeros((len(files) * PC, len(cols_p) * PC, 4), np.float32)
    sheet[..., :3] = BG
    sheet[..., 3] = 1
    for i, f in enumerate(files):
        sc, cam, lab = setup_scene()
        arm, meshes = import_glb(os.path.join(GLB_DIR, f))
        allpts = []
        ok = []
        for spec in cols_p:
            n, fr = spec.split(':')
            if pose(arm, n, float(fr)):
                allpts += world_points(meshes)
                ok.append(spec)
        mn = Vector((min(p.x for p in allpts), min(p.y for p in allpts), 0))
        allpts.append(mn)
        size = frame_camera(cam, allpts, 1.08)
        for j, spec in enumerate(cols_p):
            if spec not in ok:
                continue
            n, fr = spec.split(':')
            pose(arm, n, float(fr))
            set_label(lab, (f[:-4] + ' ' if j == 0 else '') + (spec if COLS else n), size, 0.08)
            img = render(os.path.join(TMP, 'p%02d_%d.png' % (i, j)), PC)
            r = len(files) - 1 - i
            sheet[r * PC:(r + 1) * PC, j * PC:(j + 1) * PC] = img
        print('poses', f, ok)
    save_sheet(sheet, POSES)
print('actions sample:', [a.name for a in bpy.data.actions][:8])
