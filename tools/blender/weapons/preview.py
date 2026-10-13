"""Render a contact sheet of generated weapon GLBs (EEVEE, orthographic 3/4).

Usage:
  blender --background --factory-startup --python preview.py -- <glb_dir> <out.png>
          [--only prefix1,prefix2] [--width 2400] [--rows "a,b|c,d"] [--labels 0|1] [--yaw 25]
          [--back 0|1]
"""
import bpy
import sys
import os
import math
import json
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
glb_dir, out_png = os.path.abspath(argv[0]), os.path.abspath(argv[1])  # Blender would resolve relative paths oddly
opts = {}
i = 2
while i < len(argv):
    opts[argv[i].lstrip('-')] = argv[i + 1]
    i += 2
only = [p for p in opts.get('only', '').split(',') if p]
width = int(opts.get('width', 2400))
labels = opts.get('labels', '1') == '1'
yaw = float(opts.get('yaw', 25))
back = opts.get('back', '0') == '1'
rows_spec = opts.get('rows', 'sword_1h,sword_2h|axe_1h,axe_2h,mace,hammer|staff,wand,bow|dagger,crossbow|shield')
ROWS = [r.split(',') for r in rows_spec.split('|')]

HERE = os.path.dirname(os.path.abspath(__file__))
order = []
op = os.path.join(HERE, '_meta', '_order.json')
if os.path.exists(op):
    order = json.load(open(op, encoding='utf-8'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

files = sorted(f[:-4] for f in os.listdir(glb_dir) if f.endswith('.glb'))
if only:
    files = [f for f in files if any(f.startswith(p) for p in only)]


def row_of(aid):
    for ri, r in enumerate(ROWS):
        for pi, p in enumerate(r):
            if aid.startswith(p):
                return ri, pi
    return len(ROWS), 0


def sort_key(aid):
    ri, pi = row_of(aid)
    return (ri, pi, order.index(aid) if aid in order else 999, aid)


files.sort(key=sort_key)
rows = {}
for aid in files:
    rows.setdefault(row_of(aid)[0], []).append(aid)

txt_mat = bpy.data.materials.new('label')
txt_mat.use_nodes = True
nt = txt_mat.node_tree
bs = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
bs.inputs['Base Color'].default_value = (0.9, 0.85, 0.7, 1)
bs.inputs['Emission Color'].default_value = (0.9, 0.85, 0.7, 1)
bs.inputs['Emission Strength'].default_value = 0.6

gap = 0.16
row_gap = 0.42
z_cursor = 0.0
total_w = 0.0
placed = []
for ri in sorted(rows.keys()):
    items = []
    for aid in rows[ri]:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(glb_dir, aid + '.glb'))
        new = [o for o in bpy.data.objects if o not in before]
        root = bpy.data.objects.new('root_' + aid, None)
        scene.collection.objects.link(root)
        for o in new:
            if o.parent is None:
                o.parent = root
        y = yaw
        if aid.startswith('bow'):
            y = 70
        rx = 0.0
        if aid.startswith('crossbow'):
            y, rx = 35, 55
        if back:
            y += 180
        root.rotation_euler = (math.radians(rx), 0, math.radians(y))
        bpy.context.view_layer.update()
        mn = Vector((1e9, 1e9, 1e9))
        mx = Vector((-1e9, -1e9, -1e9))
        for o in new:
            if o.type != 'MESH':
                continue
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                mn = Vector(map(min, mn, w))
                mx = Vector(map(max, mx, w))
        items.append((aid, root, mn, mx))
    row_h = max(it[3].z - it[2].z for it in items)
    x = 0.0
    for li, (aid, root, mn, mx) in enumerate(items):
        root.location.x += x - mn.x
        root.location.z += z_cursor - row_h - mn.z
        cx = x + (mx.x - mn.x) / 2
        if labels:
            bpy.ops.object.text_add(location=(cx, 0.0, z_cursor - row_h - 0.13 - 0.085 * (li % 2)), rotation=(math.radians(90), 0, 0))
            t = bpy.context.active_object
            t.data.body = aid
            t.data.size = float(opts.get('label', 0.055))
            t.data.align_x = 'CENTER'
            t.data.materials.append(txt_mat)
        x += (mx.x - mn.x) + gap
    total_w = max(total_w, x - gap)
    z_cursor -= row_h + row_gap
total_h = -z_cursor
bpy.context.view_layer.update()

# camera
cam_d = bpy.data.cameras.new('cam')
cam_d.type = 'ORTHO'
margin = 0.25
W = total_w + margin * 2
Hh = total_h + margin * 2 - row_gap * 0.5
cam_d.ortho_scale = max(W, Hh)
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
pitch = 8.0
cam.rotation_euler = (math.radians(90 - pitch), 0, 0)
cz = -total_h / 2 + row_gap * 0.25 - 0.02
cam.location = (total_w / 2, -30, cz + 30 * math.tan(math.radians(pitch)))
scene.camera = cam
scene.render.resolution_x = width
scene.render.resolution_y = int(width * Hh / W)
scene.render.resolution_percentage = 100
if W < Hh:
    scene.render.resolution_y = width
    scene.render.resolution_x = int(width * W / Hh)

sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 3.2
sun = bpy.data.objects.new('sun', sun_d)
sun.rotation_euler = (math.radians(55), math.radians(-25), math.radians(-30))
scene.collection.objects.link(sun)
fill_d = bpy.data.lights.new('fill', 'SUN')
fill_d.energy = 1.0
fill = bpy.data.objects.new('fill', fill_d)
fill.rotation_euler = (math.radians(70), math.radians(30), math.radians(150))
scene.collection.objects.link(fill)

world = bpy.data.worlds.new('w')
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs['Color'].default_value = (0.055, 0.06, 0.075, 1)
bg.inputs['Strength'].default_value = 3.0

try:
    scene.render.engine = 'BLENDER_EEVEE'
except TypeError as e:
    print('engine error', e)
try:
    scene.eevee.taa_render_samples = 16
except Exception:
    pass
try:
    scene.eevee.use_bloom = True
except Exception:
    pass
scene.view_settings.view_transform = 'Standard'
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = out_png
bpy.ops.render.render(write_still=True)
print('RENDERED', out_png, scene.render.resolution_x, scene.render.resolution_y)
