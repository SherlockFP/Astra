"""EFSUN ONLINE - PSX weapon generator (Blender, background mode).

Usage:
  blender --background --factory-startup --python gen_weapons.py -- <out_dir> [meta_dir] [id_filter ...]

Builds every registered asset (or the ones whose id contains one of the
filters), exports <out_dir>/<id>.glb and writes <meta_dir>/<id>.json with
tris / bbox / palette info used by make_doc.py.
"""
import os
import sys
import json
import importlib
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import wlib  # noqa: E402

MODULES = ['w_swords', 'w_axes', 'w_staves', 'w_daggers', 'w_ranged', 'w_shields']


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out_dir = argv[0] if argv else os.path.join(HERE, '..', '..', '..', 'public', 'assets', 'models', 'gen', 'weapons')
    meta_dir = argv[1] if len(argv) > 1 else os.path.join(HERE, '_meta')
    filters = argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(meta_dir, exist_ok=True)
    for m in MODULES:
        try:
            importlib.import_module(m)
        except ModuleNotFoundError as e:
            if e.name != m:
                raise
            print('skip missing module', m)
    with open(os.path.join(meta_dir, '_order.json'), 'w', encoding='utf-8') as f:
        json.dump(list(wlib.REG.keys()), f)
    ok, failed = 0, []
    for aid, spec in wlib.REG.items():
        if filters and not any(f in aid for f in filters):
            continue
        try:
            wlib.reset_scene()
            aw, ah = spec['atlas']
            A = wlib.Atlas(aw, ah, seed=sum(map(ord, aid)))  # deterministic per id
            mb = wlib.MB()
            extra = spec['fn'](A, mb) or {}
            if spec.get('fit'):
                extra['fit_scale'] = round(mb.fit_z(spec['fit']), 4)
            wlib.build_object(aid, mb, A)
            path = os.path.join(out_dir, aid + '.glb')
            wlib.export_glb(path)
            lo, hi = mb.bbox()
            meta = dict(id=aid, name=spec['name'], use=spec['use'], attach=spec['attach'],
                        kind=spec['kind'], emissive=spec['emissive'], tris=mb.tris(),
                        parts=mb.parts, atlas=[aw, ah], colours=wlib.palette_count(A),
                        has_emit=A.has_emit(),
                        bbox_min=[round(float(v), 3) for v in lo], bbox_max=[round(float(v), 3) for v in hi],
                        bytes=os.path.getsize(path))
            meta.update(extra)
            with open(os.path.join(meta_dir, aid + '.json'), 'w', encoding='utf-8') as f:
                json.dump(meta, f, ensure_ascii=False, indent=1)
            print('OK  %-24s tris=%4d size=%6dB colours=%d' % (aid, meta['tris'], meta['bytes'], meta['colours']))
            ok += 1
        except Exception:
            traceback.print_exc()
            failed.append(aid)
    print('DONE ok=%d failed=%s' % (ok, failed))


main()
