"""Generate docs/assets/itch-fx-audio.md from the produced files (sizes are measured, not typed).

Usage: python -I tools/fx_audio/write_doc.py <public/assets dir> <out md>
"""
import json
import os
import re
import sys
from collections import OrderedDict

ASSETS, OUT = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(ASSETS)


def size_of(url):
    return os.path.getsize(os.path.join(ROOT, url.lstrip("/")))


def kb(n):
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1048576:.2f} MB"


def tree_bytes(*parts):
    tot = 0
    for dp, _, fs in os.walk(os.path.join(ASSETS, *parts)):
        tot += sum(os.path.getsize(os.path.join(dp, f)) for f in fs)
    return tot


vfx = json.load(open(os.path.join(ASSETS, "vfx", "itch", "index.json"), encoding="utf-8"))
icons = json.load(open(os.path.join(ASSETS, "icons", "itch", "wenrexa-skill-icons-4", "icons.json"), encoding="utf-8"))
audio = json.load(open(os.path.join(ASSETS, "audio", "itch", "fx-audio.json"), encoding="utf-8"))

BK_USE = {
    "cloud-01": "Soft smoke cloud: death puff, smoke bomb, dust cloud behind a charge",
    "cloud-02": "Lighter cloud variant: fog patches, teleport puff",
    "explosion-01": "Fire explosion (64 frames): fireball impact, Explosive orb death, Bursting affix",
    "explosion-02": "Bigger explosion variant: meteor impact, boss slam",
    "explosion-smoke-01": "Explosion that ends in smoke: barrel/trap blast, Volcanic affix eruption",
    "fire-01": "Fire burst (additive): burning ground tick, fire-nova blobs",
    "fire-02": "Fire burst variant (additive)",
    "fire-03": "Fire burst variant (additive)",
    "fire-04": "Fire burst variant (additive)",
    "flame-01": "Tall looping flame (additive): torches, braziers, firewall columns, burn DoT on enemies",
    "flame-02": "Tall looping flame variant (60 frames)",
    "wispy-smoke-01": "Thin rising smoke: candles, extinguished torches, poison wisps (tint green)",
    "wispy-smoke-02": "Thin rising smoke variant: ghost/necrotic trail (tint)",
    "wispy-smoke-03": "Thin rising smoke variant",
    "big-hit": "Bright star-burst hit: crits, hit-stop flash",
    "blood-impact": "Directional blood spray: flesh hits (rotate to hit direction)",
    "charge-a": "Blue swirl charge-up ending in a ring: spell wind-up, Blink start",
    "charge-b": "Second charge-up variant: lightning cast, Chain Lightning start",
    "dithered-fire": "Wide dithered flame strip (loop): firewall, burning floor edge, lava rims",
    "electric-ring": "Electric ring (loop): Shock debuff, Thunderclap, Storming affix",
    "explosion": "Pixel-art explosion: Explosive orb, trap blast",
    "fire-point": "Small fire (loop): torch tip, burning debuff on a target",
    "fire-ring": "Fire ring (loop): Fire Nova, Volcanic telegraph, consecration in red",
    "impact-white": "White tintable impact: generic melee hit, parry spark (tint per element)",
    "lightstreaks": "Horizontal light streaks (loop): dash/charge speed lines, beams",
    "star-explosion": "Orange star burst: stun stars, loot pop, level-up sparkle",
    "vortex": "Purple-to-cyan vortex: portal open, summon, Frozen Orb core",
    "wavy-blue": "Blue spirit flames (loop): frost aura, Ice Block, spirit-healer glow",
    "wavy-purple": "Pink/purple flames (loop): arcane/shadow aura, curse on target",
}
SPX_USE = [
    (r"epic-explosion|stylized-explosion|symmetrical-explosion", "Pixel explosion: fireball impact, Bursting / Explosive affixes, trap blasts"),
    (r"spell-absorb", "Absorb shield gained (buff-absorb), mana drain"),
    (r"spell-attack-up", "Attack buff applied (buff-strength, Battle Shout)"),
    (r"spell-death", "Skull curse/death mark: Necrotic affix, execute, curse"),
    (r"spell-defense-up", "Defense buff applied (Iron Skin, Shield Wall)"),
    (r"spell-haste", "Haste buff applied (clock face)"),
    (r"spell-heal", "Heal received (heart rise): potions, Renew, Heal"),
    (r"spell-poison", "Poison applied (green cloud burst)"),
    (r"status-poison", "Looping poison status over a target's head"),
    (r"status-sparkling", "Looping sparkle status: blessing, invulnerable, loot glow"),
    (r"fire-looping", "Looping pixel fire: torches, braziers, burning status"),
    (r"directional-impact", "Directional hit spark: melee hits, arrows (rotate to hit direction)"),
    (r"symmetrical-impact", "Round hit spark: generic hit, block, projectile impact"),
    (r"lightning-burst", "Purple lightning burst: Shock, Thunderclap, Storming affix"),
    (r"lightning-strike", "Lightning bolt from above: Lightning Bolt, Thunderstorm"),
    (r"bubble-burst", "Bubble stream: water/poison, Sanguine pool"),
    (r"coin-burst", "Gold coins burst: gold pickup, chest open, vendor sale"),
    (r"music-burst", "Music notes: town bard / emote"),
    (r"firework-burst", "Firework: M+ timed completion, achievement"),
    (r"heart-burst", "Hearts: heal crit, party emote"),
    (r"light-burst", "Wide light flash: holy nova, level-up flash, portal pop"),
    (r"sparkle-burst", "Sparkle burst: loot drop, buff refresh, crit"),
    (r"scifi-charge-up", "Charge-up ring: spell wind-up, boss cast telegraph"),
    (r"scifi-spark-burst", "Spark burst: metal hit, anvil/upgrade success"),
    (r"scifi-warp", "Warp / teleport ring: Blink, Teleport, portal enter"),
    (r"directional-smoke-burst", "Smoke trail burst: dash dust, dodge roll"),
    (r"looping-smoke", "Looping smoke: smoldering corpse, chimney, stealth haze"),
    (r"skull-smoke", "Skull smoke burst: enemy death, curse, fear"),
    (r"symmetrical-smoke-burst", "Brown dust burst: landing, ground slam dust"),
    (r"splatter", "Blood/goo splatter: hits on flesh (red) or slimes (green)"),
    (r"symbol-alert", "Alert '!': enemy aggro above head, quest available"),
    (r"symbol-attack-up", "Floating sword+ icon: attack buff over head"),
    (r"symbol-crown", "Crown: party leader, M+ record"),
    (r"symbol-defense-up", "Floating shield+ icon: defense buff over head"),
    (r"symbol-failure", "Red X: upgrade fail, invalid target"),
    (r"symbol-lightbulb", "Lightbulb: hint / tutorial"),
    (r"symbol-magic-up", "Floating magic+ icon: spell power buff"),
    (r"symbol-place", "Placement badge: M+ leaderboard rank 1-8"),
    (r"symbol-question", "Question mark: quest turn-in, confused enemy"),
    (r"symbol-rank", "Letter rank S/A/B/C/D/F: M+ run grade"),
    (r"symbol-success", "Green check: upgrade success, quest complete"),
    (r"symbol-thumbs", "Thumbs up/down: party emote, ready check"),
    (r"symbol-warning", "Warning triangle: boss mechanic warning, low HP"),
]


def spx_use(name):
    for pat, use in SPX_USE:
        if re.search(pat, name):
            return use
    return ""


AUDIO_USE = OrderedDict([
    ("spells", "Elemental spell impacts: fire_impact, frost_impact (ice), lightning_impact, water/frost or Sanguine pools (water)"),
    ("heals", "heal / buff / potion_drink layer / resurrect; holy impacts"),
    ("attack", "Attack barks; play on ~25-35% of swings / casts (crit-* on crits)"),
    ("effort", "Short grunts: jump (hup), dodge roll (hut), block (defend)"),
    ("hurt", "player_hurt / enemy hurt grunt (rate-limit to ~1 per 0.6 s)"),
    ("status", "DoT reactions: bleeding / on-fire / poisoned / tummy-hurt when the debuff lands"),
    ("death", "player_death (warrior/mage) or orc enemy_death"),
    ("dialog", "NPC / party barks: hello, welcome, bye, yes, no, here, thankful (vendors, quest givers, party ping)"),
    ("emote", "Emotes and idle chatter: laugh, angry, amused, surprised, sleepy, tired..."),
    ("spell", "Mage spell call-outs: casting, blizzard, fire, freeze, thunder, haste, shield, summon..."),
])

L = []
A = L.append
A("# Itch pack group: VFX + icons + SFX / voices")
A("")
A("Generated by `tools/fx_audio/write_doc.py`. Every path is a public URL served from Vite `public/` (`/assets/...`).")
A("Credits and licences are in [credits-itch.md](credits-itch.md). Contact sheet: [previews/itch-fx-audio.png](previews/itch-fx-audio.png).")
A("")
A("**This group contains no 3D models.** No GLB was produced, so `glb-inspect` was not needed. The preview contact sheet shows the VFX sheets, particles and icons instead.")
A("")
A("## Totals")
A("")
A("| folder | files | size |")
A("|---|---|---|")
for parts, label in (((("vfx", "itch", "brackeys-vfx-bundle")), "/assets/vfx/itch/brackeys-vfx-bundle/"),
                     ((("vfx", "itch", "super-pixel-effects")), "/assets/vfx/itch/super-pixel-effects/"),
                     ((("icons", "itch", "wenrexa-skill-icons-4")), "/assets/icons/itch/wenrexa-skill-icons-4/"),
                     ((("audio", "itch")), "/assets/audio/itch/")):
    n = sum(len(fs) for _, _, fs in os.walk(os.path.join(ASSETS, *parts)))
    A(f"| `{label}` | {n} | {kb(tree_bytes(*parts))} |")
A("")
A("Index files for code:")
A("")
A("- `/assets/vfx/itch/index.json`: grid layout of every sprite sheet (`cols`, `rows`, `frames`, `frameWidth`, `frameHeight`, `fps`, `loop`, `blending`, `tags`) and the particle list.")
A("- `/assets/icons/itch/wenrexa-skill-icons-4/icons.json`: icon name, path, gray path, tags.")
A("- `/assets/audio/itch/fx-audio.json`: `groups` (category, and `category:kind`, mapped to URL lists) and `files` (duration, bytes, rmsDb, suggested `volume`).")
A("")
A("## 1. VFX sprite sheets")
A("")
A("All sheets were re-packed into a clean grid. Frames have an integer size, run row-major from the **top-left** cell, and have no empty leading or trailing cells. To play a sheet in three.js (default `flipY = true`), for frame `i`:")
A("")
A("```ts")
A("const col = i % cols, row = Math.floor(i / cols);")
A("tex.repeat.set(1 / cols, 1 / rows);")
A("tex.offset.set(col / cols, 1 - (row + 1) / rows);")
A("tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; // PSX look")
A("```")
A("")
A("Use `transparent: true, depthWrite: false` on the sprite material. `blending`: `additive` means the sheet was designed for additive blending; it has also been converted to RGBA, so Normal blending works too. `additive-ok` means it looks good either way. `normal` means use NormalBlending. The `fps` values are suggestions: Super Pixel Effects are authored for 15 fps, while Brackeys flipbooks and predrawn sheets were not timed by their authors.")
A("")
A("### 1a. Brackeys VFX Bundle: flipbooks (Thomas Iché, painted) and predrawn sheets (CodeManu)")
A("")
A("The 1024 px TGA flipbooks were converted to PNG and halved to 64 px frames to fit the PSX texture budget. The fire 01-04 sources were RGB on black and were converted to RGBA (alpha = max channel). The predrawn sheets were cut on their float cell grid, trimmed of empty cells, and scaled so their largest frame side is at most 128 px. `charge_7x6` held two separate animations and was split into `charge-a` and `charge-b`.")
A("")
A("| URL | size | grid (cols x rows) | frames | frame px | fps | loop | blending | intended use |")
A("|---|---|---|---|---|---|---|---|---|")
for s in vfx["sheets"]:
    if s["pack"] != "brackeys-vfx-bundle":
        continue
    nm = s["id"].replace("brackeys-", "")
    A(f"| `{s['path']}` | {kb(size_of(s['path']))} | {s['cols']} x {s['rows']} | {s['frames']} | {s['frameWidth']}x{s['frameHeight']} | {s['fps']} | {'yes' if s['loop'] else 'no'} | {s['blending']} | {BK_USE.get(nm, '')} |")
A("")
A("### 1b. Super Pixel Effects Gigapack (free version, unTied Games): pixel art, 15 fps")
A("")
A("These are the large variants of the 102 free animations at their native pixel size, packed from the PNG frame folders. Fourteen were left out: the English text banners (`*_text_*`), which do not fit the Turkish UI, and the sci-fi heartbeat and muzzle-flash effects. The free version ships only one colour per effect; its colour is listed in `index.json` (`colour`). Recolour in a shader or with `material.color` if needed.")
A("")
A("| URL | size | grid (cols x rows) | frames | frame px | loop | blending | intended use |")
A("|---|---|---|---|---|---|---|---|")
for s in vfx["sheets"]:
    if s["pack"] != "super-pixel-effects":
        continue
    nm = s["id"].replace("spx-", "")
    A(f"| `{s['path']}` | {kb(size_of(s['path']))} | {s['cols']} x {s['rows']} | {s['frames']} | {s['frameWidth']}x{s['frameHeight']} | {'yes' if s['loop'] else 'no'} | {s['blending']} | {spx_use(nm)} |")
A("")
A("### 1c. Brackeys extra particle textures (single images)")
A("")
A("The format matches `/assets/textures/vfx/`: 256x256 gray+alpha PNG (white RGB, alpha = shape), tinted with `material.color`. Only the shapes that are **not** already in `/assets/textures/vfx/` are included. The other 48 Brackeys particles are the same Kenney images already shipped there; see [vfx_ui.md](vfx_ui.md).")
A("")
A("| URL | size | source | intended use |")
A("|---|---|---|---|")
P_USE = {
    "dirt": "Debris and dirt chunks: ground slam, digging, Quaking affix",
    "effect": "Radial light rays: holy burst, level-up rays, shrine glow",
    "flame": "Flame wisp", "light": "Soft light disc: aura floor glow", "magic": "Magic sparkle flare",
    "muzzle": "Upward jet / muzzle burst: geysers, ground eruptions", "scorch": "Scorch star: burn decal, explosion flash",
    "smoke": "Smoke puff variants", "spark": "Electric spark cloud: shock, storm",
    "spotlight": "Light cone / god ray: shrine beams, loot beams, boss spotlight",
    "star": "Star glints: crit flash, loot sparkle", "symbol": "Heart / star symbol particles: charm, favour",
    "trace": "Thin streaks: rain, speed lines, arrow trails", "twirl": "Swirl: vortex, whirlwind trail",
    "window": "Window light shapes: stained-glass projection, cell-shaped decals",
}
for p in vfx["particles"]:
    nm = p["id"].replace("brackeys-", "")
    A(f"| `{p['path']}` | {kb(size_of(p['path']))} | {os.path.basename(p['source'])} | {P_USE.get(nm.split('-')[0], '')} |")
A("")
A("## 2. Icons: Wenrexa Skill Icon Pack 4.0 (70 fire-themed spell icons)")
A("")
A("The icons are 128x128 PNGs, red/orange painted. Each `<name>.png` has a matching `<name>-gray.png` (the pack's desaturated set), which suits the cooldown, locked or not-enough-mana state. The names were assigned by looking at the icons, because the pack only numbers them. They fit Mage fire skills, Barbarian rage skills and fire-themed items or affixes.")
A("")
A("| URL (+ `-gray` twin) | size | tags | source # |")
A("|---|---|---|---|")
for e in icons:
    n = re.search(r"/(\d+) Icon\.png$", e["source"]).group(1)
    A(f"| `{e['path']}` | {kb(size_of(e['path']))} + {kb(size_of(e['gray']))} | {', '.join(e['tags'])} | {n} |")
A("")
A("## 3. Audio: spell and heal impacts (Lentikula) and voices (John Carroll)")
A("")
A("No system ffmpeg is installed, so the WAVs were encoded with **Blender's bundled Audaspace/ffmpeg** (`tools/blender/fx_audio/encode_audio.py`). Each file is mono Ogg Vorbis at 48 kHz: 96 kbps for spells and heals, 80 kbps for voices. Leading and trailing silence below -50 dB (relative to peak) was trimmed, keeping a 10 ms pre-roll and a 60 ms tail with short fades, and each file is peak-normalised to -1 dBFS. All 373 files were decoded with `OfflineAudioContext.decodeAudioData` in Chromium without errors; durations match within 3 ms.")
A("")
A(f"Total: **{len(audio['files'])} files, {audio['totalBytes'] / 1e6:.2f} MB**, down from about 113 MB of source WAV.")
A("")
A("- `volume` is a GainNode value that brings a file to about -18 dB active RMS, matching the convention in [audio.md](audio.md).")
A("- The orc pack was recorded quietly, so normalisation raised it by +5 to +22 dB. Its noise floor is therefore a little higher; keep orc voices at the suggested volume or lower.")
A("- These files fill the gaps listed in audio.md: human grunts, death cries and the war cry (`voice-warrior-attack:heavy-attack`, `voice-warrior-emote:angry`).")
A("- Mapping suggestions for existing SfxIds: `player_hurt` -> `voice-<class>-hurt`; `player_death` -> `voice-<class>-death`; `war_cry` -> `voice-warrior-attack:heavy-attack`; `fire_impact` / `frost_impact` / `lightning_impact` -> layer `spells:fire-impact`, `spells:ice-impact`, `spells:lightning-impact`; `heal` -> `heals`; orc and goblin `enemy_aggro` -> `voice-orc-emote:angry`; orc `enemy_death` -> `voice-orc-death`.")
A("- Warrior voice goes with Knight and Barbarian. Mage voice goes with Mage (and Cleric if no other voice exists). Orc voice goes with orc, goblin and brute enemies and gruff town NPCs.")
A("")
A("### Categories")
A("")
A("| category folder | files | use |")
A("|---|---|---|")
cats = OrderedDict()
for f in audio["files"]:
    cats.setdefault((f["pack"], f["category"]), []).append(f)
for (pack, cat), fs in cats.items():
    key = cat.split("-")[-1] if cat.startswith("voice-") else cat
    A(f"| `/assets/audio/itch/{pack}/{cat}/` | {len(fs)} | {AUDIO_USE.get(key, '')} |")
A("")
A("### Every audio file")
A("")
for (pack, cat), fs in cats.items():
    A(f"#### `{pack}/{cat}`")
    A("")
    A("| URL | size | duration | volume | source |")
    A("|---|---|---|---|---|")
    for f in fs:
        A(f"| `{f['url']}` | {kb(f['bytes'])} | {f['durationSec']:.2f} s | {f['volume']} | {f['source']} |")
    A("")
A("## 4. Tools (re-run order)")
A("")
A("Archives are extracted to `.asset-cache/itch/fx-audio/<pack>/x/` (untrusted data; nothing in them is executed).")
A("")
A("```sh")
A("python -I tools/fx_audio/build_vfx.py   .asset-cache/itch/fx-audio public/assets docs/assets/vfx_ui.md")
A("python -I tools/fx_audio/build_icons.py .asset-cache/itch/fx-audio/spells-4/x public/assets")
A("python -I tools/fx_audio/plan_audio.py  .asset-cache/itch/fx-audio public/assets <tmp>/audio_jobs.json")
A('"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \\')
A("    --python tools/blender/fx_audio/encode_audio.py -- <tmp>/audio_jobs.json <tmp>/audio_encoded.json")
A("python -I tools/fx_audio/finalize_audio.py <tmp>/audio_encoded.json public/assets")
A("python -I tools/fx_audio/render_preview.py public/assets docs/assets/previews/itch-fx-audio.png")
A("python -I tools/fx_audio/write_doc.py public/assets docs/assets/itch-fx-audio.md")
A("```")
A("")
with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(L))
print(OUT, len(L), "lines")
