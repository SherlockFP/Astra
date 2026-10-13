# UI_WOW_CLASSIC — art direction: Blizzard default UI instead of ElvUI

Owner feedback (2026-10-13): "UI elementler çok AI gibi, orijinal WoW'daki gibi yap."
This replaces the ElvUI flat look of `docs/UI_REDESIGN.md` §visual style. Layout contracts, element ids, events and
behaviour from UI_REDESIGN stay valid; only the **look and the default positions** change.

Constraints: no Blizzard textures, fonts or logos are copied or downloaded. Everything is drawn with CSS
(gradients, borders, box-shadow, inline SVG data URIs) or our own existing assets. "In the spirit of" the default
WoW UI, not a rip. No external asset downloads without the owner's OK.

## 1. What makes the current UI look "AI-generated" (remove all of this)

- Letter-spaced ALL-CAPS headings everywhere (`KAHRAMANLAR (0/6)`, `İLK GÖREVİN`). WoW uses title case.
- Thin 1 px gold hairlines and diamond corner ornaments on every box.
- Uniform dark translucent "glass" boxes with the same border for every element; blur, soft glows, gradient text.
- Rounded pills and large radii. Floating, detached mini-widgets with lots of empty padding.
- Emoji / generic glyph icons for menus.

## 2. Visual language

| Token | Value | Use |
|---|---|---|
| `--wow-yellow` | `#ffd100` | GameFontNormal: titles, labels, quest titles, button text |
| `--wow-white` | `#ffffff` | values, body text, objectives |
| `--wow-grey` | `#808080` | disabled, completed objectives |
| `--wow-green` | `#1eff00` | "Kullan:" / equip lines, uncommon |
| `--wow-hp` | `#00cc00` (player/party/friendly), hostile target bar keeps green too (WoW), name plate tinted by reaction |
| `--wow-mana` | `#0080ff`, rage `#ff0000`, energy `#ffff00`, focus `#ff8040`, runic `#00d1ff` |
| `--wow-xp` | `#8a3fd1` (normal) / `#2a6bd8` (rested) with 20 tick dividers |
| `--wow-metal` | bevel stack `#5c5c5c → #2b2b2b → #0e0e0e` | frame borders |
| `--wow-gold-trim` | `#c9a54a` / `#7d6326` | portrait rings, elite borders, window corners |
| `--wow-tooltip-bg` | `rgba(4, 4, 20, 0.92)` with border `#9a9a9a` radius 4 px | tooltips |
| `--wow-panel` | dark stone `#1b1712` with subtle noise (SVG feTurbulence data URI), parchment `#e9d8a8` for quest/book pages |

Fonts (already installed): headings `Alegreya Sans` bold, **title case, letter-spacing 0**, yellow with `1px 1px 0 #000`
shadow. Numbers / small labels `Roboto Condensed` or `PT Sans Narrow` (WoW's Arial Narrow role). `Cinzel` only for the
logo and big zone-entry banners.

Bevels, not glows: borders are 2–3 px metal with an inner highlight (`inset 0 1px 0 rgba(255,255,255,.15)`) and an outer
dark line. Radius ≤ 3 px except round things (portraits, minimap, level badge). No `backdrop-filter`.

Buttons: WoW red panel button — `linear-gradient(#8b1a10, #4a0b06)`, 1 px `#000` + inner gold `#c9a54a` border,
yellow text, pressed state darkens and shifts text 1 px. Close button: small square red X at window top-right.

## 3. Default HUD layout (Classic/Wrath default, 16:9)

| Element | Position | Look |
|---|---|---|
| Player frame | top-left | 64 px **round portrait** (class icon / 3D bust) in a gold ring on the left, level in a small round badge at the portrait's bottom-left, name (white) on a dark plate, HP bar (green, `cur / max` text), resource bar under it, combat state = red glow on the ring |
| Target frame | right of player frame, mirrored (portrait right) | name plate tinted by reaction (red hostile, yellow neutral, green friendly); **elite = gold dragon-wing border**, rare = silver, boss = skull level badge; target-of-target small frame under it; debuffs row under the bars, player's own debuffs larger |
| Party frames | left edge under player frame | smaller copies (40 px portraits), vertical |
| Main action bar | bottom centre | **12 square slots** (36 px) in one long stone strip with ornamental **end caps** (our own winged-stone silhouette, SVG); keybind text top-right (white/grey, turns **red when out of range**), charges bottom-right, dark radial cooldown, icon desaturated + blue tint when OOM |
| Extra bars | stacked directly above the main bar, same style without end caps | |
| XP bar | full strip directly under/over the main bar | purple, rested blue, 20 ticks, text `Seviye X — a / b (%)` on hover |
| Micro menu + bags | bottom-right, row of small square buttons + 4 bag slots + backpack | |
| Cast bar | centre, above the action bars | yellow fill (green on success, red on interrupt), metal frame, spark, spell name centred |
| Minimap | top-right, round, thick metal ring | zone name in yellow on a dark banner above, clock, +/- zoom and tracking buttons on the ring |
| Buffs | left of minimap, right-aligned rows | 30 px icons, duration under the icon in yellow (`5 dk`, `12 sn`) |
| Quest tracker | right edge under minimap | **no box**: yellow quest title, white `- 3/8 Kurt Postu` lines, grey when done |
| Chat | bottom-left | no background until hovered; tabs ("Genel", "Savaş Kaydı", "Grup") with small tab chrome |
| Tooltips | anchored bottom-right above micro menu (or at cursor for world units) | navy bg, grey border, white name / yellow labels / green "Kullan:" lines |
| Nameplates | over units | thin red (hostile) / yellow / green bar, name above in white, cast bar under |

## 4. Windows (character, bags, spellbook, quest log, talents, finder)

Blizzard window chrome: dark stone frame with a gold trim, title text centred in yellow in the top bar, optional round
portrait in the top-left corner overlapping the frame, red square close button top-right, tabs as **bottom tabs**
(character / reputation / skills) with raised active tab. Quest log and books use a parchment page area. Bags: grey
metal bag frame per bag, 37 px slots, item quality border colours (WoW colours from `tokens.css`).

## 5. Rollout

- W1 (HUD): tokens, player/target/party frames, action bar + XP + micro menu, cast bar, minimap, tracker, chat, tooltip.
- W2 (windows): `ui/kit/chrome.ts` window shell, buttons, tabs, bags, character, spellbook, quest log.
- W3: menu screens (character select / create) panels in the same language.
Each wave keeps every element id, class used by TS code and event contract; it is a skin + default-position change.
