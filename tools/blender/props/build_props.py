"""Build EFSUN ONLINE PSX props -> GLB.

Usage (headless):
  blender --background --factory-startup --python tools/blender/props/build_props.py -- \
      --out public/assets/models/gen/props [--only id1,id2] [--cat nature,town,dungeon,special] [--list]
"""
import os, sys, argparse, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import psx_lib
for m in ('common', 'props_nature', 'props_town', 'props_dungeon', 'props_special'):
    if m in sys.modules:
        importlib.reload(sys.modules[m])
    else:
        importlib.import_module(m)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--out', default=os.path.normpath(os.path.join(HERE, '../../../public/assets/models/gen/props')))
ap.add_argument('--only', default='')
ap.add_argument('--cat', default='')
ap.add_argument('--list', action='store_true')
ap.add_argument('--manifest', default=os.path.join(HERE, 'manifest.json'))
a = ap.parse_args(argv)

ids = list(psx_lib.REGISTRY.keys())
if a.cat:
    cats = a.cat.split(',')
    ids = [i for i in ids if psx_lib.REGISTRY[i]['category'] in cats]
if a.only:
    want = a.only.split(',')
    ids = [i for i in want if i in psx_lib.REGISTRY]
    missing = [i for i in want if i not in psx_lib.REGISTRY]
    if missing:
        print('UNKNOWN ids:', missing)
if a.list:
    for i in ids:
        print('ID', i, psx_lib.REGISTRY[i]['category'])
else:
    psx_lib.run(ids, a.out, a.manifest)
    print('DONE', len(ids))
