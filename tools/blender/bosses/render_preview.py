"""Contact sheet of the exported boss GLBs (re-imported, so it checks the real export).

  blender --background --factory-startup --python tools/blender/bosses/render_preview.py -- \
      <glb_dir> <out.png> [boss_id ...]

One row per boss, one column per pose (each boss module may define PREVIEW = [(action, frame30), ...]).
"""
import importlib
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bosslib  # noqa: E402

DEFAULT = [('Idle', 0), ('Walk', 9), ('Attack', 12), ('Attack', 19), ('Attack2', 19), ('Cast', 22), ('Enrage', 22),
           ('Death', 60)]
CELL = int(os.environ.get("BOSS_CELL", "256"))


def setup_scene():
    bosslib.reset_scene()
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    try:
        sc.eevee.taa_render_samples = 8
    except Exception:
        pass
    sc.render.resolution_x = sc.render.resolution_y = CELL
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    w = bpy.data.worlds.new('W')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.075, 0.085, 0.11, 1)
    bg.inputs['Strength'].default_value = 1.6
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), math.radians(-10), math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    sc.collection.objects.link(cam)
    sc.camera = cam
    # ground disc for contact reading
    bpy.ops.mesh.primitive_circle_add(vertices=24, radius=1.0, fill_type='NGON')
    g = bpy.context.active_object
    g.name = 'Ground'
    gm = bpy.data.materials.new('G')
    try:
        gm.use_nodes = True
    except Exception:
        pass
    b = next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0.03, 0.035, 0.045, 1)
    b.inputs['Roughness'].default_value = 1
    g.data.materials.append(gm)
    return sc, cam, g


def label(cam, text, scale):
    cu = bpy.data.curves.new('lbl', 'FONT')
    cu.body = text
    cu.size = 0.055 * scale
    ob = bpy.data.objects.new('lbl', cu)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.new('lblm')
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (0, 0, 0, 1)
    b.inputs['Emission Color'].default_value = (1, 0.85, 0.5, 1)
    b.inputs['Emission Strength'].default_value = 1.0
    cu.materials.append(m)
    ob.parent = cam
    ob.location = (-0.47 * scale, -0.47 * scale, -1.0)
    return ob


def main():
    args = bosslib.script_args()
    glb_dir, out_png = os.path.abspath(args[0]), os.path.abspath(args[1])
    ids = args[2:] or ['kemik_lordu', 'lav_golemi', 'buzul_devi', 'golge_rahibesi', 'kizil_ejder', 'mantar_kral']
    ids = [i for i in ids if os.path.exists(os.path.join(glb_dir, i + '.glb'))]
    rows = []
    tmp = os.path.join(os.path.dirname(os.path.abspath(out_png)), '_tmp_preview.png')
    ncols = 0
    for bid in ids:
        try:
            mod = importlib.import_module('boss_' + bid)
            cols = getattr(mod, 'PREVIEW', DEFAULT)
            if os.environ.get('BOSS_COLS'):
                cols = [(c.split(':')[0], int(c.split(':')[1])) for c in os.environ['BOSS_COLS'].split(',')]
        except Exception:
            cols = DEFAULT
        ncols = max(ncols, len(cols))
        sc, cam, ground = setup_scene()
        bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, bid + '.glb'))
        arm = next(o for o in sc.objects if o.type == 'ARMATURE')
        meshes = [o for o in sc.objects if o.type == 'MESH' and o.name != 'Ground']
        # bounds in rest
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        size = mx - mn
        ext = max(size.x, size.y, size.z) * float(os.environ.get('BOSS_PAD', '1.3'))
        ctr = (mn + mx) / 2
        ground.scale = (ext * 0.55, ext * 0.55, 1)
        ground.location = (ctr.x, ctr.y, -0.002)
        az, el = math.radians(float(os.environ.get('BOSS_AZ', '-35'))), math.radians(float(os.environ.get('BOSS_EL', '20')))
        d = Vector((math.sin(-az) * math.cos(el) * -1, -math.cos(az) * math.cos(el), math.sin(el)))
        cam.location = ctr + d * 40
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        cam.data.ortho_scale = ext
        cam.data.clip_end = 200
        lbl = label(cam, '', ext)
        ad = arm.animation_data
        if ad:
            for t in ad.nla_tracks:
                t.mute = True
        row = []
        for act_name, f30 in cols:
            act = bpy.data.actions.get(act_name)
            lbl.data.body = f'{bid}  {act_name} {f30}'
            if act and ad:
                ad.action = act
                try:
                    if act.slots and ad.action_slot is None:
                        ad.action_slot = act.slots[0]
                except Exception:
                    pass
                f0 = act.frame_range[0]
                sc.frame_set(int(round(f0 + f30 * sc.render.fps / 30.0)))
            else:
                lbl.data.body += ' (missing)'
                sc.frame_set(0)
            sc.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp, check_existing=False)
            a = np.array(img.pixels[:], dtype=np.float32).reshape(CELL, CELL, 4)
            bpy.data.images.remove(img)
            row.append(a)
        rows.append(row)
        print('PREVIEW', bid, 'ok')
    H, W = len(rows) * CELL, ncols * CELL
    sheet = np.zeros((H, W, 4), np.float32)
    sheet[..., :3] = (0.36, 0.38, 0.43)
    sheet[..., 3] = 1
    for r, row in enumerate(rows):
        for c, a in enumerate(row):
            y0 = H - (r + 1) * CELL
            sheet[y0:y0 + CELL, c * CELL:(c + 1) * CELL] = a
    img = bpy.data.images.new('sheet', W, H, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = out_png
    img.file_format = 'PNG'
    img.save()
    if os.path.exists(tmp):
        os.remove(tmp)
    print('SHEET', out_png, W, H)


main()
