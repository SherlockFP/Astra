"""Generate the EFSUN ONLINE dungeon bosses (headless).

  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
      --python tools/blender/bosses/gen_bosses.py -- public/assets/models/gen/bosses [boss_id ...]

Each boss lives in boss_<id>.py and exposes build(out_dir) -> report dict.
A JSON report (tris, bones, bytes, emissive tiles) is written next to this script.
"""
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bosslib  # noqa: E402

ALL = ['kemik_lordu', 'lav_golemi', 'buzul_devi', 'golge_rahibesi', 'kizil_ejder', 'mantar_kral']


def main():
    args = bosslib.script_args()
    out_dir = os.path.abspath(args[0] if args else os.path.join(HERE, '../../../public/assets/models/gen/bosses'))
    ids = args[1:] or ALL
    os.makedirs(out_dir, exist_ok=True)
    rep_path = os.path.join(HERE, 'boss_report.json')
    report = {}
    if os.path.exists(rep_path):
        try:
            report = json.load(open(rep_path))
        except Exception:
            report = {}
    for bid in ids:
        bosslib.reset_scene()
        mod = importlib.import_module('boss_' + bid)
        importlib.reload(mod)
        report[bid] = mod.build(out_dir)
    json.dump(report, open(rep_path, 'w'), indent=1)


main()
