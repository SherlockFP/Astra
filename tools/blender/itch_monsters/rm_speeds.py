"""rm_speeds.py - travel distance / speed of every UAL clip from the root-motion (_RM) GLBs (read-only, system Python).
python -I rm_speeds.py <UAL1_Standard_RM.glb> <UAL2_Standard_RM.glb> <out.json>"""
import sys, json
import numpy as np
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbopt as G
out = {}
for path in sys.argv[1:3]:
    js, b = G.read_glb(path)
    names = {n.get('name'): i for i, n in enumerate(js['nodes'])}
    for an in js['animations']:
        best = None
        for ch in an['channels']:
            if ch['target']['node'] == names['root'] and ch['target']['path'] == 'translation':
                s = an['samplers'][ch['sampler']]
                t = G.read_acc(js, b, s['input'])[:, 0]
                v = G.read_acc(js, b, s['output'])
                best = (t, v)
        if best is None:
            out[an['name']] = {'seconds': None, 'travel': 0.0, 'speed': 0.0}
            continue
        t, v = best
        d = v[-1] - v[0]
        horiz = float(np.hypot(d[0], d[2]))   # glTF x/z = ground plane
        path_len = float(np.sum(np.hypot(np.diff(v[:, 0]), np.diff(v[:, 2]))))
        sec = float(t[-1] - t[0])
        out[an['name']] = {'seconds': round(sec, 3), 'travel': round(horiz, 3), 'path': round(path_len, 3), 'speed': round(path_len / sec, 3) if sec else 0.0}
json.dump(out, open(sys.argv[3], 'w'), indent=1)
for k in ('Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop', 'Zombie_Walk_Fwd_Loop', 'Walk_Carry_Loop', 'Roll', 'Sword_Dash', 'Shield_Dash'):
    print(k, out.get(k))
