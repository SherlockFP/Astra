# UI art direction: retail WoW + ElvUI (correction of the "AI look")

Owner feedback (2026-10-13):
1. "UI elementler çok AI gibi, orijinal WoW'daki gibi yap."
2. "WoW classic değil, ElvUI UI'si gibi olacak demiştik, WoW güncel olarak."

So the target is **a current (retail, The War Within / Midnight era) WoW screen running the ElvUI addon**. `docs/UI_REDESIGN.md`
stays the layout/contract authority. This file says why the current execution looks AI-made and what real ElvUI looks
like, so the skin can be corrected. (The file name is historical; there is no Classic direction.)

Constraints: no Blizzard or ElvUI textures/fonts/logos copied or downloaded. CSS only, installed fonts only.

## 1. Why it looks AI-generated today (remove)

- Fantasy decoration on HUD chrome: gold hairlines, diamond corner ornaments, Cinzel serif headings, parchment/brown tints.
  ElvUI has none of this. Fantasy fonts belong only to the logo, zone-entry banner and boss emote text.
- Letter-spaced ALL-CAPS section headings (`KAHRAMANLAR (0/6)`, `İLK GÖREVİN`). ElvUI uses normal case.
- Soft glows, blur (`backdrop-filter`), gradient text, drop shadows under boxes, rounded corners, generous padding,
  floating detached widgets. ElvUI is **flat, square, tight and dense**.
- Every element in its own separate decorative card. ElvUI groups elements on shared dark backdrops with 1 px borders.
- Brown/amber tinted backgrounds. ElvUI backdrops are neutral grey/black.

## 2. Real ElvUI look (do this)

| Token | Value | Note |
|---|---|---|
| `--elv-backdrop` | `rgba(26, 26, 26, 0.8)` | default panel backdrop (`0.1, 0.1, 0.1`) |
| `--elv-backdrop-solid` | `#1a1a1a` | unit frames, bars |
| `--elv-border` | `#000000` 1 px | **every** frame: 1 px black border, often with a 1 px inner `#000` gap ("thin border" style) |
| `--elv-value` | class colour or `#ffffff` | ElvUI "value colour" accents (default class colour) |
| text | `#ffffff`, outline `1px` black (`text-shadow` 4 directions or `-webkit-text-stroke` .5 px) | |
| font | condensed sans: `Roboto Condensed` / `PT Sans Narrow`, 11–12 px, weight 500–700, **normal case, letter-spacing 0** | ElvUI's Expressway/PT Sans Narrow role |
| health bar | **class colour** for players (WoW RAID_CLASS_COLORS), reaction colour for NPCs (hostile `#c73b3b`, neutral `#d9c045`, friendly `#4fc94f`), dark backdrop behind the missing part | flat texture, optional very subtle top-to-bottom 6% gradient, no gloss |
| power | mana `#0070de`, rage `#c41f3b`, energy `#fff569`, focus `#ff7d0a`, runic `#00d1ff` | retail PowerBarColor |
| quality | poor `#9d9d9d` common `#fff` uncommon `#1eff00` rare `#0070dd` epic `#a335ee` legendary `#ff8000` | existing tokens |
| tooltip | ElvUI backdrop + 1 px border coloured by item quality / unit reaction; health bar under unit tooltips | |

Class colours (retail): Warrior/Şövalye `#c69b6d`, Paladin `#f48cba`, Rogue/Haydut `#fff468`, Mage/Büyücü `#3fc7eb`,
Warlock `#8788ee`, Death Knight/Nekromant `#c41e3a`, Hunter `#aad372`, Priest `#ffffff`, Shaman `#0070dd`,
Druid `#ff7c0a`, Monk `#00ff98`, Demon Hunter `#a330c9`, Evoker `#33937f`, Barbar: use a distinct one not taken (e.g.
`#b5562f`). Map our class ids in `ui/widgets/classColors.ts`.

Icons: square, **zoomed/cropped 8 %** (`object-fit: cover; transform: scale(1.08)` or background-size 116 %) so the
icon's own border disappears, 1 px black border, no rounded corners. Cooldown = dark radial sweep + white condensed
number centred (red under 3 s). Keybind top-right 10 px white outlined, out-of-range = whole icon tinted red,
OOM = tinted blue, unusable = desaturated. Proc = retail-style yellow glow/ants (keep current).

## 3. Default ElvUI layout (retail, 16:9)

| Element | Position | Look |
|---|---|---|
| Action bars | bottom centre, 2–3 rows of 12 square buttons (32–36 px), 1–2 px spacing, no frame art, one shared backdrop per bar | |
| Player frame | left of screen centre, just above the bars (≈ x 35 %, y 70 %) | wide flat bar ~240×40: class-coloured health with `cur | %` text, power bar 8 px under it, name/level text inside, **no portrait** (optional 3D portrait overlay toggle later) |
| Target frame | mirrored, right of centre | reaction/class colour, name + level + classification (`Elit`, `Nadir`, `Boss`) as text; debuffs above it (player's own only by default), buffs; target-of-target small bar beside it |
| Focus, party, raid | party left-middle (vertical small bars), raid grid when > 5 | |
| Cast bar | under player frame (player), under target frame (target) — attached, same width | class colour fill, icon left, name left, time right; interruptible = class colour, not-interruptible = grey |
| Minimap | **square**, top-right, 1 px border, zone text on top inside, clock and coords as data text under | |
| Buffs/debuffs (player) | left of minimap, rows of 30 px square icons, duration under each in white condensed | |
| Objective tracker | right side under minimap, no backdrop, retail colours (quest title yellow `#ffd200`, objectives white, done grey) | |
| Chat | bottom-left panel with backdrop and tab strip on top; optional right panel (loot/combat log) bottom-right | |
| Data texts | thin bars under the left and right chat panels: durability, gold, FPS/ping, time, bags | |
| Micro menu / bags | hidden by default (ElvUI), reachable on data text click / keybinds; if shown: small square buttons | |
| XP / reputation | thin bars (10 px) at the top edge of the chat panels or under the minimap | |
| Nameplates | flat class/reaction coloured bars ~120×10, 1 px black border, name above white, level coloured by difficulty, cast bar under, debuff icons above | |
| Tooltip | anchored bottom-right above the right data text bar | |

## 4. Windows (character, bags, spellbook, talents, quest log, finder)

ElvUI skins every Blizzard window flat: backdrop + 1 px border, title in white condensed centred at the top, plain
close "X" top-right (no red button art), tabs as flat buttons (active tab = lighter backdrop + value-colour bottom
line), scrollbars thin and flat. Bags are one **combined bag** grid with 1 px-bordered slots coloured by item quality,
search box and sort button on top, gold at the bottom. Buttons: flat `#1a1a1a` with 1 px border, hover = value-colour
border. No parchment, no gold, no ornaments.

## 5. Rollout

- W1 HUD: tokens, unit frames, cast bars, action bars, minimap, buffs, tracker, nameplates, tooltip, data texts.
- W2 windows: `ui/kit/chrome.ts` shell, buttons, tabs, combined bag, character, spellbook, talents, quest log, chat.
- W3 menu screens in the same language (the logo keeps its fantasy font).
Every wave keeps element ids, classes queried by TS and event contracts: skin + default positions only.

## 6. 2026-10-14 owner revision: translucent + rounded

Owner playtest, verbatim: "UI çok siyah — şeffaf iyi, round olsun" (the UI is too black; the translucency is good, make it round).
This revision overrides §2 and §4 where they say flat, square, black or no blur. Layout, ids and event contracts do not change.

- Glass, not black: `--ui-glass-hud` `rgba(16, 20, 28, 0.55)` for HUD frames, `--ui-glass-win` `rgba(18, 22, 30, 0.72)` for windows, panels and tooltips, `--ui-well` for wells inside a frame. No `#000`, `#111` or `#1a1a1a` fills are left in the skin.
- Border: `--ui-border` `rgba(255, 255, 255, 0.10)`, 1 px light hairline everywhere (was `#000`).
- Blur: `backdrop-filter: blur(6px)` on windows and tooltips only, never on per-frame HUD parts. Without backdrop-filter support the glass is more opaque (`@supports` fallback in `kit.css`).
- Shadow: windows get `0 4px 14px rgba(0, 0, 0, 0.35)`. Hard black offset shadows are softened.
- Corners: windows, panels, tooltips and modals 8 px; unit frames, cast bars, minimap frame and tracker chips 6 px; buttons, action-bar slots and keycaps 4 px; bars inside frames 3 px; badges, count chips and portraits round.
- Text: white with a soft shadow `0 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.55)` (replaces the 1 px black outline). Headers and quest titles are warm light gold `#f5d68a` (`--ui-head`), not dark brown.
- Where it lives: every value is a `--ui-*` token in `ui/styles/tokens.css`. Change the look there. `hud-elvui.css`, `kit.css`, `widgets.css` and the `panels-*` sheets read those tokens.
- Not covered yet: the boot loading screen keeps its own art, and the gold-brown bevels of the older HUD sheets (`hud-bottom`, `hud-frames`, `hud-extras`, `hud-metin2`) still show where `hud-elvui.css` does not override them.
