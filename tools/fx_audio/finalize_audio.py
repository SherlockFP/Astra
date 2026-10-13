"""Write the public audio index for the itch fx-audio packs.

Usage: python -I tools/fx_audio/finalize_audio.py <encoded.json from encode_audio.py> <public/assets dir>
Output: /assets/audio/itch/fx-audio.json  -> {groups: {category: [url...]}, files: [...]}
"""
import json
import os
import sys
from collections import OrderedDict

ENC, ASSETS = sys.argv[1], sys.argv[2]
data = json.load(open(ENC, encoding="utf-8"))
if data["errors"]:
    raise SystemExit(f"encode errors: {data['errors']}")
files = sorted(data["files"], key=lambda f: (f["pack"], f["category"], f["name"]))
groups = OrderedDict()
for f in files:
    groups.setdefault(f["category"], []).append(f["url"])
    # finer groups, e.g. voice-warrior-attack:light-attack
    groups.setdefault(f["category"] + ":" + f["kind"], []).append(f["url"])
out = {
    "about": "Itch fx-audio packs (Lentikula spell/heal impacts, John Carroll warrior/mage/orc voices). "
             "Mono Ogg Vorbis 48 kHz, silence-trimmed, peak-normalised to -1 dBFS. "
             "'volume' is a GainNode value that brings each file to about -18 dB active RMS. "
             "Group keys: '<category>' or '<category>:<kind>' (e.g. 'voice-orc-attack:heavy-attack').",
    "totalBytes": sum(f["bytes"] for f in files),
    "groups": groups,
    "files": files,
}
dst = os.path.join(ASSETS, "audio", "itch", "fx-audio.json")
with open(dst, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)
print(len(files), "files", round(out["totalBytes"] / 1e6, 2), "MB ->", dst)
