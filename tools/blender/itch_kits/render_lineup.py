"""True-scale line-up render (Workbench, orthographic, front view) to check the scale contract.
Usage: blender --background --factory-startup --python render_lineup.py -- <out.png> <px_w> <px_h> <glb[:label]>...
Models stand side by side on y=0 facing the camera (+Z glTF = front). Reference lines: 2.4 m (KayKit hero)
in red, 4 m (dungeon tile / wall height) in blue; ticks every 1 m on the ground.
"""
import bpy, os, sys, math
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kitlib as K

a = K.args()
out, pw, ph = a[0], int(a[1]), int(a[2])
items = a[3:]
K.reset()
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = pw, ph
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'TEXTURE'
sc.display.render_aa = 'FXAA'
w = bpy.data.worlds.new('w'); sc.world = w; w.color = (0.16, 0.17, 0.2)
sc.view_settings.view_transform = 'Standard'


def colmat(name, rgba):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    try:
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        p.inputs['Base Color'].default_value = rgba
    except Exception:
        pass
    return m


def box(name, loc, dims, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = dims
    o.data.materials.append(mat)
    return o


def label(txt, x, z, size=0.32, mat=None):
    cu = bpy.data.curves.new('t', 'FONT')
    cu.body = txt
    cu.size = size
    cu.align_x = 'CENTER'
    o = bpy.data.objects.new('lbl', cu)
    sc.collection.objects.link(o)
    o.location = (x, -2.0, z)
    o.rotation_euler = (math.pi / 2, 0, 0)
    if mat:
        cu.materials.append(mat)
    return o


x = 0.0
gap = 0.7
white = colmat('white', (0.95, 0.95, 0.9, 1))
for it in items:
    f, _, lab = it.partition('|')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    mn, mx = K.bounds(meshes)
    roots = [o for o in new if o.parent is None]
    dx = x - mn.x
    for r in roots:
        r.location.x += dx
    h = mx.z - mn.z
    cx = x + (mx.x - mn.x) / 2
    txt = lab or os.path.splitext(os.path.basename(f))[0]
    if txt.endswith('#'):          # '#' = do not print the AABB height (e.g. KayKit hero: AABB includes props)
        txt = txt[:-1]
    else:
        txt += '\n%.2f m' % h
    label(txt, cx, -0.75, 0.26, white)
    x += (mx.x - mn.x) + gap
total = x
red = colmat('red', (0.9, 0.15, 0.1, 1))
blue = colmat('blue', (0.15, 0.4, 0.95, 1))
grey = colmat('grey', (0.5, 0.5, 0.5, 1))
box('hero', (total / 2 - 0.5, 1.5, 2.4), (total + 1, 0.02, 0.025), red)
box('tile', (total / 2 - 0.5, 1.5, 4.0), (total + 1, 0.02, 0.025), blue)
box('ground', (total / 2 - 0.5, 0, -0.02), (total + 1, 3, 0.04), grey)
for i in range(int(total) + 1):
    box('tick', (i, -1.4, 0.03), (0.04, 0.3, 0.06), white if i % 4 else blue)
label('2.4 m hero', -1.2, 2.3, 0.22, red)
label('4 m tile', -1.2, 3.9, 0.22, blue)

cam_d = bpy.data.cameras.new('c'); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new('c', cam_d); sc.collection.objects.link(cam); sc.camera = cam
top = 0
for o in sc.objects:
    if o.type == 'MESH':
        for v in o.bound_box:
            top = max(top, (o.matrix_world @ Vector(v)).z)
cx, cz = total / 2 - 1.0, (top - 1.5) / 2
cam.location = (cx, -60, cz)
cam.rotation_euler = (math.radians(90), 0, 0)
span_w = total + 3.0
span_h = top + 2.0
cam_d.ortho_scale = max(span_w, span_h * pw / ph)
cam_d.clip_end = 200
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('LINEUP', out, 'width', round(total, 2), 'top', round(top, 2))
