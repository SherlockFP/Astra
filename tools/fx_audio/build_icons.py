"""Copy the Wenrexa "Skill Icon Pack 4.0" (70 fire-themed spell icons) with kebab-case names.

Usage: python -I tools/fx_audio/build_icons.py <spells-4 extracted dir (…/spells-4/x)> <public/assets dir>

Writes 128 px Normal icons as <name>.png and the matching desaturated set as <name>-gray.png
(cooldown / locked / not-enough-mana state) to /assets/icons/itch/wenrexa-skill-icons-4/,
plus icons.json there.  Names were assigned by looking at a numbered contact sheet.
"""
import json
import os
import shutil
import sys

from PIL import Image

SRC, ASSETS = sys.argv[1], sys.argv[2]
OUT = os.path.join(ASSETS, "icons", "itch", "wenrexa-skill-icons-4")

# number -> (name, tags)
NAMES = {
    1: ("meteor", "fire meteor impact aoe"),
    2: ("magma-burst", "fire lava splash"),
    3: ("rune-stone", "rune earth ward"),
    4: ("holy-cross", "holy heal light"),
    5: ("fire-feather", "feather haste phoenix"),
    6: ("burning-eye", "eye reveal curse"),
    7: ("fire-bolt", "lightning bolt strike"),
    8: ("ember-clouds", "smoke cloud fire"),
    9: ("sun-spiral", "sun spiral fire"),
    10: ("burning-heart", "heart heal life"),
    11: ("flame-sword", "sword melee strike"),
    12: ("sword-strike", "sword melee slash"),
    13: ("enchanted-sword", "sword buff weapon"),
    14: ("crossed-swords", "sword duel parry"),
    15: ("twin-swords", "sword double-strike"),
    16: ("triple-swords", "sword blade-storm"),
    17: ("sword-rain", "sword summon aoe"),
    18: ("fire-wing", "wing phoenix flame"),
    19: ("burning-sword", "sword fire weapon-buff"),
    20: ("flame-essence", "drop potion essence"),
    21: ("vortex", "spiral whirl"),
    22: ("spear-thrust", "spear thrust pierce"),
    23: ("piercing-spear", "spear pierce slash"),
    24: ("twin-spears", "spear multishot"),
    25: ("fireball", "fire projectile"),
    26: ("fire-nova", "nova explosion aoe"),
    27: ("fire-orbs", "orb projectile multishot"),
    28: ("flame-orb", "orb swirl"),
    29: ("flame-tendrils", "flame burst claw"),
    30: ("fire-arrow", "arrow bow projectile"),
    31: ("burning-branch", "branch chain spread"),
    32: ("smoke-wisps", "smoke cloud poison"),
    33: ("fire-trident", "trident arrow volley"),
    34: ("flame-hand", "hand grasp cast"),
    35: ("fire-triangle", "rune triangle ward"),
    36: ("fire-ring", "ring aura"),
    37: ("demon-mask-01", "demon mask horned rage"),
    38: ("demon-mask-02", "demon mask horned"),
    39: ("demon-mask-03", "demon mask horned"),
    40: ("demon-mask-04", "demon mask horned"),
    41: ("horned-shield", "shield defense block"),
    42: ("flame-crest", "flame crest buff"),
    43: ("rising-flame", "flame rise buff"),
    44: ("flame-pillar", "pillar column fire"),
    45: ("rune-diamond", "rune diamond ward"),
    46: ("solar-flare", "sun burst"),
    47: ("sun-burst", "sun burst swirl"),
    48: ("whirlwind", "whirl spin"),
    49: ("tri-blades", "blades spin"),
    50: ("fire-mandala", "mandala aura"),
    51: ("fire-lotus", "lotus ornament"),
    52: ("arrow-strike", "arrow charge"),
    53: ("star-burst", "star burst"),
    54: ("blazing-sun", "sun whirl bright"),
    55: ("radiance", "light holy burst"),
    56: ("inferno-vortex", "vortex inferno"),
    57: ("cross-star", "star focus crit"),
    58: ("eye-of-flame", "eye star"),
    59: ("flame-leaf", "leaf blade"),
    60: ("heart", "heart heal life"),
    61: ("fire-axe", "axe melee"),
    62: ("double-axe", "axe melee cleave"),
    63: ("lance-dash", "spear dash charge"),
    64: ("fire-swirl", "swirl wave"),
    65: ("flame-wave", "wave swirl"),
    66: ("blinding-flare", "flare blind light"),
    67: ("spiral-orb", "orb vortex"),
    68: ("magma-rock", "rock earth lava"),
    69: ("comet", "comet meteor"),
    70: ("ember-stone", "stone rock gem"),
}

os.makedirs(OUT, exist_ok=True)
entries = []
for n, (name, tags) in sorted(NAMES.items()):
    for variant, suffix in (("Normal", ""), ("Gray", "-gray")):
        src = os.path.join(SRC, "128x128px", variant, f"{n} Icon.png")
        im = Image.open(src)
        assert im.size == (128, 128), (src, im.size)
        dst = os.path.join(OUT, name + suffix + ".png")
        shutil.copyfile(src, dst)
    entries.append({
        "name": name,
        "path": f"/assets/icons/itch/wenrexa-skill-icons-4/{name}.png",
        "gray": f"/assets/icons/itch/wenrexa-skill-icons-4/{name}-gray.png",
        "size": 128,
        "category": "skill",
        "tags": tags.split(),
        "source": f"Skill Icon Pack Wenrexa 4.0/128x128px/Normal/{n} Icon.png",
    })
with open(os.path.join(OUT, "icons.json"), "w", encoding="utf-8") as fh:
    json.dump(entries, fh, indent=1)
print(len(entries), "icons")
