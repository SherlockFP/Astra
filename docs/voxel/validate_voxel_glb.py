#!/usr/bin/env python
"""validate_voxel_glb.py ORIGINAL.glb VOXEL.glb [--max-tris N] [--static]   (system python + numpy; run with -I)
Exit code 0 = pass.  Checks that the voxel file is a drop-in replacement: same node names, same skins, same clips, valid attributes, small palette."""
import sys, os, io, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import voxelize_glb as vg

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('orig'); ap.add_argument('vox'); ap.add_argument('--max-tris', type=int, default=0); ap.add_argument('--max-kb', type=int, default=0)
    a = ap.parse_args(); errs = []; info = {}
    jo, bo = vg.read_any(a.orig); jv, bv = vg.read_glb(a.vox)
    names = lambda j: [n.get('name') for n in j['nodes']]
    if names(jo) != names(jv): errs.append('node names/order differ')
    if [n.get('children') for n in jo['nodes']] != [n.get('children') for n in jv['nodes']]: errs.append('node hierarchy differs')
    for k in ('translation', 'rotation', 'scale', 'matrix'):
        if [n.get(k) for n in jo['nodes']] != [n.get(k) for n in jv['nodes']]: errs.append('node %s differs' % k)
    jn = lambda j: [[j['nodes'][x].get('name') for x in s['joints']] for s in j.get('skins', [])]
    if jn(jo) != jn(jv): errs.append('skin joint lists differ')
    ao = [(x['name'], round(max((vg.read_acc(jo, bo, s['input']).max() for s in x['samplers']), default=0), 4)) for x in jo.get('animations', [])]
    av = [(x['name'], round(max((vg.read_acc(jv, bv, s['input']).max() for s in x['samplers']), default=0), 4)) for x in jv.get('animations', [])]
    if ao != av: errs.append('animation names/durations differ (%d vs %d)' % (len(ao), len(av)))
    tris = 0; vis = {}
    for i, n in enumerate(jv['nodes']):
        if 'mesh' not in n: continue
        for p in jv['meshes'][n['mesh']]['primitives']:
            at = p['attributes']; P = vg.read_acc(jv, bv, at['POSITION'])
            if not np.isfinite(P).all(): errs.append('NaN/inf positions in node %s' % n.get('name'))
            idx = vg.read_acc(jv, bv, p['indices']).reshape(-1)
            if idx.max() >= len(P): errs.append('index out of range in %s' % n.get('name'))
            tris += len(idx) // 3; vis[n.get('name')] = vis.get(n.get('name'), 0) + len(idx) // 3
            if 'skin' in n:
                if 'JOINTS_0' not in at or 'WEIGHTS_0' not in at: errs.append('skinned node %s lacks JOINTS_0/WEIGHTS_0' % n.get('name'))
                else:
                    J = vg.read_acc(jv, bv, at['JOINTS_0']); W = vg.read_acc(jv, bv, at['WEIGHTS_0'])
                    if J.max() >= len(jv['skins'][n['skin']]['joints']): errs.append('joint index out of range in %s' % n.get('name'))
                    if not np.allclose(W.sum(1), 1.0, atol=1e-3): errs.append('weights do not sum to 1 in %s' % n.get('name'))
            if 'TEXCOORD_0' in at:
                uv = vg.read_acc(jv, bv, at['TEXCOORD_0'])
                if uv.min() < 0 or uv.max() > 1: errs.append('uv outside 0..1 in %s' % n.get('name'))
    for im in jv.get('images', []):
        bvw = jv['bufferViews'][im['bufferView']]; img = Image.open(io.BytesIO(bv[bvw.get('byteOffset', 0): bvw.get('byteOffset', 0) + bvw['byteLength']]))
        if max(img.size) > 128: errs.append('palette image larger than 128 px: %s' % (img.size,))
    import re
    must = [m.get('name') for m in jo.get('materials', []) if m.get('name') and (re.search(r'eye|glow|tongue|teeth', m['name'], re.I) or any(m.get('emissiveFactor', [0, 0, 0])) or m.get('alphaMode') == 'BLEND')]
    have = {m.get('name') for m in jv.get('materials', [])}
    for nm in must:
        if nm not in have: errs.append('semantic material name lost: %s (code addresses eye/glow/glass/runes/crystal materials by name)' % nm)
    info.update(tris=tris, kb=round(os.path.getsize(a.vox) / 1024), clips=len(av), orig_kb=round(os.path.getsize(a.orig) / 1024))
    if a.max_tris and tris > a.max_tris: errs.append('triangle budget exceeded: %d > %d' % (tris, a.max_tris))
    if a.max_kb and info['kb'] > a.max_kb: errs.append('file too big: %d KB > %d' % (info['kb'], a.max_kb))
    print(('PASS' if not errs else 'FAIL'), json.dumps(info), *errs, sep='\n  ' if errs else ' ')
    sys.exit(1 if errs else 0)
main()
