"""Build + export all procedural creatures (run headless).

  blender --background --factory-startup --python build_creatures.py -- <out_dir> [id ...]

Writes <out_dir>/<id>.glb and appends stats to build_stats.json next to this script.
"""
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import clib  # noqa: E402

REGISTRY = {
    'slime_green': ('c_slime', 'green'),
    'slime_lava': ('c_slime', 'lava'),
    'slime_frost': ('c_slime', 'frost'),
    'spider_giant': ('c_spider', None),
    'bat_cave': ('c_bat', None),
    'golem_stone': ('c_golem', None),
    'imp_fire': ('c_imp', None),
    'wraith': ('c_wraith', None),
    'mushroom_brute': ('c_mushroom', None),
    'wolf_dire': ('c_wolf', None),
    'elemental_fire': ('c_elemental', 'fire'),
    'elemental_ice': ('c_elemental', 'ice'),
}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: build_creatures.py -- <out_dir> [id ...]')
    out_dir = argv[0]
    ids = argv[1:] or list(REGISTRY)
    stats_path = os.path.join(HERE, 'build_stats.json')
    try:
        with open(stats_path) as fh:
            stats = json.load(fh)
    except Exception:
        stats = {}
    for cid in ids:
        modname, variant = REGISTRY[cid]
        t0 = time.time()
        mod = importlib.import_module(modname)
        cr = mod.build(variant) if variant else mod.build()
        st = clib.realize(cr, os.path.join(out_dir, cid + '.glb'))
        st.update(cr.meta.get('doc', {}))
        stats[cid] = st
        print('BUILT %-16s tris=%5d bones=%2d acts=%s (%.1fs)' % (cid, st['tris'], st['bones'], ','.join(st['actions']), time.time() - t0))
    with open(stats_path, 'w') as fh:
        json.dump(stats, fh, indent=1)


main()
