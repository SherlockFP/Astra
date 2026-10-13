"""measure_idle.py - posed AABB (glTF axes) of a finished GLB at several frames of one clip.
blender --background --factory-startup --python measure_idle.py -- <clip> <glb> [<glb> ...]"""
import bpy, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import monlib as M
a = M.args()
clip = a[0]
for path in a[1:]:
    M.reset()
    objs = M.import_gltf(path)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    meshes = [o for o in objs if o.type == 'MESH']
    act = bpy.data.actions[clip]
    lo, hi = act.frame_range
    out = []
    for f in [lo + (hi - lo) * k / 6 for k in range(6)]:
        M.set_pose_frame(arm, act, f)
        mn, mx = M.mesh_bounds(meshes, depsgraph=True)
        size, bmin, bmax = M.gltf_bounds(mn, mx)
        out.append((round(f), size, bmin[1], bmax[1]))
    print('MEASURE', os.path.basename(path), clip, 'frames', (lo, hi))
    for o in out:
        print('   frame %3d size %s  y %.3f..%.3f' % o)
