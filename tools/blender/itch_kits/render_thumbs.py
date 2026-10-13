"""Render one Workbench thumbnail per GLB (orthographic 3/4 view from the model's front-right).
Usage: blender --background --factory-startup --python render_thumbs.py -- <out_dir> <px> <list.txt|file.glb>...
A .txt argument is read as a list of GLB paths (one per line). Output: <out_dir>/<parent>__<name>.png
"""
import bpy, os, sys, math
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

a = K.args()
out_dir, px = a[0], int(a[1])
files = []
for f in a[2:]:
    if f.endswith('.txt'):
        files += [l.strip() for l in open(f) if l.strip()]
    else:
        files.append(f)
os.makedirs(out_dir, exist_ok=True)

K.reset()
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x = sc.render.resolution_y = px
sc.render.film_transparent = False
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'TEXTURE'
sh.show_backface_culling = False
try:
    sh.show_cavity = False
except Exception:
    pass
sc.display.render_aa = 'OFF'
w = bpy.data.worlds.new('w')
sc.world = w
w.color = (0.16, 0.17, 0.2)
sc.view_settings.view_transform = 'Standard'

cam_data = bpy.data.cameras.new('cam')
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
d = Vector((0.75, -1.0, 0.62)).normalized()   # from front (-Y) right (+X) above

for f in files:
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=f)
    except Exception as e:
        print('FAIL', f, e)
        continue
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    mn, mx = K.bounds(meshes)
    c = (mn + mx) / 2
    rad = max((mx - mn).length / 2, 1e-3)
    cam.location = c + d * rad * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    # fit ortho scale to the projected bbox
    R = cam.rotation_euler.to_matrix()
    right, up = R.col[0], R.col[1]
    xs, ys = [], []
    for i in range(8):
        p = Vector((mn.x if i & 1 else mx.x, mn.y if i & 2 else mx.y, mn.z if i & 4 else mx.z)) - c
        xs.append(p.dot(right)); ys.append(p.dot(up))
    cam_data.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.08
    cam_data.clip_end = rad * 10
    name = os.path.basename(os.path.dirname(f)) + '__' + os.path.splitext(os.path.basename(f))[0]
    sc.render.filepath = os.path.join(out_dir, name + '.png')
    bpy.ops.render.render(write_still=True)
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for dd in list(coll):
            if dd.users == 0:
                coll.remove(dd)
print('THUMBS DONE', len(files))
