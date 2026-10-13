"""render_sheet.py - ONE small contact sheet of the finished GLBs (Workbench, 256x192 cells, posed from the real clips).
blender --background --factory-startup --python render_sheet.py -- <public/assets/models/itch> <cells dir>
Then: python -I sheet_compose.py <cells dir> <out.png>   (system Python + Pillow)"""
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monlib as M
from mathutils import Vector

root, cells = M.args()
os.makedirs(cells, exist_ok=True)
# (label, glb, clip, fraction of the clip, view yaw)
CELLS = [
    ('wolf Walk', 'creatures/wolf.glb', 'Walk', 0.25), ('warg Run', 'creatures/warg.glb', 'Run', 0.25),
    ('rat Bite', 'creatures/rat.glb', 'Bite', 0.45), ('bear Swipe', 'creatures/bear.glb', 'Swipe', 0.45),
    ('rhino Charge', 'creatures/rhino.glb', 'Charge', 0.25), ('mammoth Walk', 'creatures/mammoth.glb', 'Walk', 0.3),
    ('deer Trot', 'creatures/deer.glb', 'Trot', 0.25), ('ooze Idle', 'creatures/ooze.glb', 'Idle', 0.4),
    ('spider Strike', 'creatures/spider.glb', 'Strike', 0.7), ('centipede Walk', 'creatures/centipede.glb', 'Walk', 0.3),
    ('wasp Sting', 'creatures/wasp.glb', 'Sting', 0.6), ('UAL mannequin Sword_Attack', 'ual/UAL_clips.glb', 'Sword_Attack', 0.45),
    ('imp Idle_Combat', 'bestiary/imp.glb', 'Idle_Combat', 0.3), ('imp Attack_2H', 'bestiary/imp.glb', 'Attack_2H', 0.45),
    ('imp Death_A end', 'bestiary/imp.glb', 'Death_A', 1.0), ('puglin Run', 'bestiary/puglin.glb', 'Run', 0.3),
    ('puglin Attack_1H_1', 'bestiary/puglin.glb', 'Attack_1H_1', 0.5), ('puglin Death_B end', 'bestiary/puglin.glb', 'Death_B', 1.0),
]

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y = 256, 192
sc.render.film_transparent = False
sh = sc.display.shading
sh.light = 'STUDIO'
sh.color_type = 'TEXTURE'
sh.show_object_outline = False
sh.background_type = 'VIEWPORT'
sh.background_color = (0.30, 0.33, 0.38)
try:
    sc.display.render_aa = 'OFF'
except Exception:
    pass

for i, (label, rel, clip, frac) in enumerate(CELLS):
    M.reset()
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 256, 192
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_object_outline = False
    sh.background_type = 'VIEWPORT'; sh.background_color = (0.30, 0.33, 0.38)
    objs = M.import_gltf(os.path.join(root, rel))
    arm = next(o for o in objs if o.type == 'ARMATURE')
    meshes = [o for o in objs if o.type == 'MESH']
    act = bpy.data.actions[clip]
    lo, hi = act.frame_range
    M.set_pose_frame(arm, act, round(lo + (hi - lo) * frac))
    mn, mx = M.mesh_bounds(meshes, depsgraph=True)
    c = (mn + mx) / 2
    ext = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ext * 1.25
    d = Vector((0.75, -1.0, 0.55)).normalized()      # front (-Y in Blender = +Z glTF), a bit to the right, from above
    cam.location = c + d * (ext * 3)
    cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = os.path.join(cells, '%02d.png' % i)
    bpy.ops.render.render(write_still=True)
    print('CELL', i, label)
with open(os.path.join(cells, 'labels.txt'), 'w') as fh:
    fh.write('\n'.join(c[0] for c in CELLS))
