"""Render a contact sheet of GLBs (re-imported, so this also validates the exports).

blender --background --factory-startup --python render_preview.py -- <glb_dir> <out.png> [--cols 8] [--cell 256] [--only a,b]
"""
import bpy, sys, os, math, argparse, tempfile
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('dir')
ap.add_argument('out')
ap.add_argument('--cols', type=int, default=8)
ap.add_argument('--cell', type=int, default=256)
ap.add_argument('--only', default='')
ap.add_argument('--yaw', type=float, default=35.0)
ap.add_argument('--elev', type=float, default=24.0)
ap.add_argument('--title', default='')
ap.add_argument('--frame', type=int, default=0, help='evaluate imported animations at this frame (e.g. chest Open)')
a = ap.parse_args(argv)

files = sorted(f for f in os.listdir(a.dir) if f.lower().endswith('.glb'))
if a.only:
    want = a.only.split(',')
    files = [f for f in files if f[:-4] in want]

scn = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
try:
    scn.render.engine = 'BLENDER_EEVEE'
except TypeError as e:
    print('engine', e)
scn.render.resolution_x = scn.render.resolution_y = a.cell
scn.render.resolution_percentage = 100
scn.render.film_transparent = False
scn.view_settings.view_transform = 'Standard'
scn.view_settings.look = 'None'
scn.render.image_settings.file_format = 'PNG'
try:
    scn.eevee.taa_render_samples = 8
except Exception:
    pass
world = bpy.data.worlds.new('W')
scn.world = world
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (0.13, 0.135, 0.16, 1)
bg.inputs[1].default_value = 1.0

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam_data.clip_end = 500
cam = bpy.data.objects.new('cam', cam_data)
scn.collection.objects.link(cam)
scn.camera = cam
sun_d = bpy.data.lights.new('sun', 'SUN')
sun_d.energy = 3.0
sun_d.angle = 0.2
sun = bpy.data.objects.new('sun', sun_d)
scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
fill_d = bpy.data.lights.new('fill', 'SUN')
fill_d.energy = 0.9
fill = bpy.data.objects.new('fill', fill_d)
scn.collection.objects.link(fill)
fill.rotation_euler = (math.radians(60), 0, math.radians(150))
keep = {cam, sun, fill}

txt_mat = bpy.data.materials.new('txt')
nt = txt_mat.node_tree
for n in list(nt.nodes):
    if n.type == 'BSDF_PRINCIPLED':
        nt.nodes.remove(n)
em = nt.nodes.new('ShaderNodeEmission')
em.inputs[1].default_value = 1.0
em.inputs[0].default_value = (0.9, 0.85, 0.7, 1)
outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
nt.links.new(em.outputs[0], outn.inputs[0])

yaw, el = math.radians(a.yaw), math.radians(a.elev)
d = Vector((math.sin(yaw) * math.cos(el), -math.cos(yaw) * math.cos(el), math.sin(el)))


def add_vcol(mat):
    """multiply imported base colour by COLOR_0 so the preview matches three.js vertexColors"""
    if not mat or not mat.node_tree:
        return
    nt = mat.node_tree
    if any(n.type == 'VERTEX_COLOR' for n in nt.nodes):
        return
    b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if b is None:
        return
    vc = nt.nodes.new('ShaderNodeVertexColor')
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].is_linked else None
    if src is not None:
        nt.links.new(src, mix.inputs[6])
    else:
        mix.inputs[6].default_value = b.inputs['Base Color'].default_value
    nt.links.new(vc.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], b.inputs['Base Color'])


cells = []
tmp = tempfile.mkdtemp()
printed = False
for f in files:
    for ob in list(scn.objects):
        if ob not in keep:
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(a.dir, f))
    if a.frame:
        scn.frame_set(a.frame)
    meshes = [o for o in scn.objects if o.type == 'MESH']
    for o in meshes:
        for m in o.data.materials:
            if not printed:
                print('IMPORTED NODES', [n.type for n in m.node_tree.nodes])
                printed = True
            add_vcol(m)
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (mn + mx) / 2
    rot = (-d).to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot.to_euler()
    right = rot @ Vector((1, 0, 0))
    up = rot @ Vector((0, 1, 0))
    rr = [p.dot(right) for p in pts]
    uu = [p.dot(up) for p in pts]
    span = max(max(rr) - min(rr), max(uu) - min(uu))
    os_ = span * 1.25
    cam_data.ortho_scale = os_
    cam.location = ctr + d * 60 - up * (os_ * 0.05)
    cu = bpy.data.curves.new('lbl', 'FONT')
    cu.body = f[:-4]
    cu.align_x = 'CENTER'
    cu.size = os_ * 0.075
    t = bpy.data.objects.new('lbl', cu)
    scn.collection.objects.link(t)
    t.data.materials.append(txt_mat)
    t.parent = cam
    t.location = (0, -os_ * 0.465, -5)
    sz = mx - mn
    cu2 = bpy.data.curves.new('dim', 'FONT')
    cu2.body = f'{sz.x:.1f}x{sz.z:.1f}x{sz.y:.1f}'
    cu2.align_x = 'RIGHT'
    cu2.size = os_ * 0.055
    t2 = bpy.data.objects.new('dim', cu2)
    scn.collection.objects.link(t2)
    t2.data.materials.append(txt_mat)
    t2.parent = cam
    t2.location = (os_ * 0.48, os_ * 0.44, -5)
    p = os.path.join(tmp, f[:-4] + '.png')
    scn.render.filepath = p
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(p)
    arr = np.array(img.pixels[:], np.float32).reshape(a.cell, a.cell, 4)[::-1]
    bpy.data.images.remove(img)
    cells.append(arr)
    print('RENDERED', f)

cols = min(a.cols, max(1, len(cells)))
rows = (len(cells) + cols - 1) // cols
sheet = np.zeros((rows * a.cell, cols * a.cell, 4), np.float32)
sheet[..., 3] = 1
sheet[..., :3] = 0.06
for i, c in enumerate(cells):
    r, k = divmod(i, cols)
    sheet[r * a.cell:(r + 1) * a.cell, k * a.cell:(k + 1) * a.cell] = c
    sheet[r * a.cell:(r + 1) * a.cell, k * a.cell] = (0.03, 0.03, 0.04, 1)
    sheet[r * a.cell, k * a.cell:(k + 1) * a.cell] = (0.03, 0.03, 0.04, 1)
H, W = sheet.shape[:2]
im = bpy.data.images.new('sheet', W, H)
im.pixels.foreach_set(sheet[::-1].ravel())
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
im.filepath_raw = os.path.abspath(a.out)
im.file_format = 'PNG'
im.save()
print('SHEET', a.out, W, H)
