"""probe.py - read-only look at imported FBX/GLB files: objects, bones, actions, motion channels.
blender --background --factory-startup --python probe.py -- <file> [<file> ...]
"""
import bpy, sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'itch_kits'))
import kitlib as K

def fcurves_of(act):
    out = []
    try:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    out.extend(cb.fcurves)
    except Exception as e:
        out = list(getattr(act, 'fcurves', []))
    return out

for path in K.args():
    K.reset()
    objs = K.import_any(path)
    print('=== ', os.path.basename(path))
    for o in objs:
        extra = ''
        if o.type == 'MESH':
            mw = o.matrix_world
            ws = [mw @ v.co for v in o.data.vertices]
            mn = [min(w[i] for w in ws) for i in range(3)]; mx = [max(w[i] for w in ws) for i in range(3)]
            extra = 'tris=%d verts=%d bbox=%s..%s mats=%s uv=%s vgroups=%d' % (
                sum(len(p.vertices) - 2 for p in o.data.polygons), len(o.data.vertices),
                [round(x, 3) for x in mn], [round(x, 3) for x in mx], [m.name if m else None for m in o.data.materials],
                [u.name for u in o.data.uv_layers], len(o.vertex_groups))
        elif o.type == 'ARMATURE':
            extra = 'bones=%d scale=%s rot=%s' % (len(o.data.bones), tuple(round(x, 3) for x in o.scale), tuple(round(math.degrees(x), 1) for x in o.rotation_euler))
        print('  obj', o.type, repr(o.name), 'parent=', o.parent.name if o.parent else None, extra)
    for a in bpy.data.actions:
        fcs = fcurves_of(a)
        print('  action', repr(a.name), 'range', tuple(a.frame_range), 'fcurves', len(fcs), 'fps', bpy.context.scene.render.fps)
        mot = [f for f in fcs if 'Motion' in f.data_path or 'root' in f.data_path.lower()]
        for f in mot[:12]:
            vals = [k.co[1] for k in f.keyframe_points]
            print('     ', f.data_path, f.array_index, 'n=%d min=%.3f max=%.3f first=%.3f last=%.3f' % (len(vals), min(vals), max(vals), vals[0], vals[-1]))
    for o in objs:
        if o.type == 'ARMATURE':
            print('  bones:', ', '.join(b.name + '(' + (b.parent.name if b.parent else '-') + ')' for b in o.data.bones))
            bb = o.data.bones
            for n in ('Motion', 'root', 'pelvis', 'Hips'):
                if n in bb:
                    print('   bone', n, 'head', tuple(round(x, 3) for x in bb[n].head_local), 'tail', tuple(round(x, 3) for x in bb[n].tail_local))
