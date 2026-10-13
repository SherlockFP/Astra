"""probe2.py - per-creature summary: base model facts + Motion-bone channel ranges of every clip.
blender --background --factory-startup --python probe2.py -- <Creatures dir> <Name> [<Name> ...]"""
import bpy, sys, os, math, glob, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'itch_kits'))
import kitlib as K

def fcs(act):
    out = []
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                out.extend(cb.fcurves)
    return out

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, axis_forward='Z', axis_up='Y')
    return [o for o in bpy.data.objects if o not in before]

a = K.args()
root = a[0]
for name in a[1:]:
    K.reset()
    grp = 'Beasts' if os.path.exists(os.path.join(root, 'Beasts', 'Models', name + '.fbx')) else 'Insectoids'
    mdir = os.path.join(root, grp, 'Models')
    objs = imp(os.path.join(mdir, name + '.fbx'))
    print('=====', name, grp)
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    print(' bones', len(arm.data.bones), ' '.join(b.name for b in arm.data.bones))
    tot = 0
    for o in objs:
        if o.type == 'MESH':
            ws = [o.matrix_world @ v.co for v in o.data.vertices]
            mn = [min(w[i] for w in ws) for i in range(3)]; mx = [max(w[i] for w in ws) for i in range(3)]
            t = sum(len(p.vertices) - 2 for p in o.data.polygons); tot += t
            print('  mesh', o.name, 'tris', t, 'bbox', [round(x, 2) for x in mn], [round(x, 2) for x in mx], 'mats', [m.name for m in o.data.materials],
                  'shape_keys', bool(o.data.shape_keys), 'vgroups', len(o.vertex_groups))
    print(' total tris', tot)
    meta = json.load(open(os.path.join(mdir, 'Anims', name.lower() + '_clips.json')))
    for c in meta['clips']:
        before = set(bpy.data.actions)
        ob = imp(os.path.join(mdir, 'Anims', '%s@%s.fbx' % (name, c['name'])))
        acts = [x for x in bpy.data.actions if x not in before]
        act = acts[0]
        m = {}
        for f in fcs(act):
            if f.data_path.startswith('pose.bones["Motion"]'):
                vals = [k.co[1] for k in f.keyframe_points]
                m[f.data_path.split('.')[-1] + str(f.array_index)] = (round(min(vals), 3), round(max(vals), 3), round(vals[-1] - vals[0], 3))
        nf = int(act.frame_range[1] - act.frame_range[0]) + 1
        print('  %-10s json frames=%s loop=%s rm=%s ev=%s | action %s keys=%d | Motion %s' % (c['name'], c['frames'], c['loop'], c['rootMotion'],
              [(e['name'], e['time']) for e in c.get('events', [])], act.name, nf,
              {k: v for k, v in m.items() if v[0] != v[1]}))
        for o in ob:
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.actions.remove(act)
