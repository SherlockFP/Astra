"""Plan the WAV -> OGG conversion of the itch "fx-audio" sound packs (names + categories).

Usage: python -I tools/fx_audio/plan_audio.py <fx-audio cache dir> <public/assets dir> <jobs.json out>

The jobs file is consumed by tools/blender/fx_audio/encode_audio.py (Blender's bundled
Audaspace/ffmpeg does the Vorbis encoding because no system ffmpeg is installed).
"""
import glob
import json
import os
import re
import sys
from collections import defaultdict

CACHE, ASSETS, JOBS = sys.argv[1], sys.argv[2], sys.argv[3]
AUDIO = os.path.join(ASSETS, "audio", "itch")

# raw stem (digits stripped) -> clean kebab name
RENAME = {
    "lightattack": "light-attack", "heavyattack": "heavy-attack", "magicattack": "magic-attack",
    "yesconfirm": "yes-confirm", "yescommand": "yes-command", "yeahquestion": "yeah-question",
    "onfire": "on-fire", "tummyhurt": "tummy-hurt", "tumhurty": "tummy-hurt",
    "isummon": "i-summon", "mysteryline": "mystery-line",
}
# raw stem -> category suffix (voice-<char>-<suffix>)
CATEGORY = {}
for k in ("attack", "lightattack", "heavyattack", "crit", "magicattack"):
    CATEGORY[k] = "attack"
for k in ("hup", "hut", "defend"):
    CATEGORY[k] = "effort"
CATEGORY["hit"] = "hurt"
for k in ("bleeding", "onfire", "poisoned", "tummyhurt", "tumhurty"):
    CATEGORY[k] = "status"
CATEGORY["death"] = "death"
for k in ("hello", "welcome", "bye", "goodbye", "here", "yes", "yesconfirm", "yescommand", "no",
          "thankful", "sorry", "yeah", "yeahquestion"):
    CATEGORY[k] = "dialog"
for k in ("amused", "angry", "excited", "joyous", "laugh", "irritated", "satisfied", "sceptical",
          "surprised", "whoa", "inquisitive", "sleepy", "tired", "mysteryline", "burp", "nooo", "nooooo"):
    CATEGORY[k] = "emote"
MAGE_SPELLS = ("casting", "blizzard", "fire", "freeze", "thunder", "haste", "shield", "protect",
               "charm", "confusion", "blind", "sleep", "isummon", "summoning")

jobs = []


def add(src, pack, category, name, kind, bitrate):
    dst = os.path.join(AUDIO, pack, category, name + ".ogg")
    jobs.append({"src": src.replace("\\", "/"), "dst": dst.replace("\\", "/"),
                 "url": "/assets/audio/itch/" + "/".join([pack, category, name + ".ogg"]),
                 "pack": pack, "category": category, "name": name, "kind": kind, "bitrate": bitrate,
                 "source": "/".join(src.replace("\\", "/").split("/")[-2:])})


# --- Lentikula: Basic Spell Impacts (fire / ice / lightning / water)
for f in sorted(glob.glob(os.path.join(CACHE, "freecc0-basic-spell-impacts-sfx", "x", "*", "*.wav"))):
    m = re.match(r"(\w+) Spell Impact (\d+)\.wav$", os.path.basename(f), re.I)
    elem, n = m.group(1).lower(), int(m.group(2))
    add(f, "basic-spell-impacts", "spells", f"{elem}-impact-{n:02d}", f"{elem}-impact", 96000)

# --- Lentikula: Healing Spell Impacts
for f in sorted(glob.glob(os.path.join(CACHE, "healing-spell-impacts", "x", "*", "*.wav"))):
    n = int(re.search(r"(\d+)\.wav$", f).group(1))
    add(f, "healing-spell-impacts", "heals", f"heal-impact-{n:02d}", "heal-impact", 96000)

# --- John Carroll voice packs
for pack, who in (("warrior-voice-pack", "warrior"), ("mage-voice-pack", "mage"), ("orc-voice-pack", "orc")):
    files = sorted(glob.glob(os.path.join(CACHE, pack, "x", "*", "*.wav")))
    groups = defaultdict(list)
    for f in files:
        stem = os.path.basename(f)[:-4].lower()
        m = re.match(r"([a-z]+?)(\d*)$", stem)
        groups[m.group(1)].append((int(m.group(2) or 0), f))
    for raw, items in sorted(groups.items()):
        if who == "mage" and raw in MAGE_SPELLS:
            cat = "spell"
        elif who == "orc" and raw == "sleep":
            cat = "emote"  # snoring, not a spell call-out
        else:
            cat = CATEGORY.get(raw)
        if cat is None:
            raise SystemExit(f"uncategorised voice line: {pack}/{raw}")
        name = RENAME.get(raw, raw)
        items.sort()
        for i, (num, f) in enumerate(items, 1):
            nm = name if len(items) == 1 else f"{name}-{i:02d}"
            add(f, pack, f"voice-{who}-{cat}", nm, name, 80000)

# duplicates check
seen = set()
for j in jobs:
    assert j["dst"] not in seen, j["dst"]
    seen.add(j["dst"])
os.makedirs(os.path.dirname(JOBS), exist_ok=True)
with open(JOBS, "w", encoding="utf-8") as fh:
    json.dump(jobs, fh, indent=1)
cats = defaultdict(int)
for j in jobs:
    cats[j["pack"] + "/" + j["category"]] += 1
for k, v in sorted(cats.items()):
    print(f"{v:4d}  {k}")
print(len(jobs), "jobs")
