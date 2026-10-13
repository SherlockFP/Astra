# EFSUN ONLINE – Kadim Zindanlar · UI / UX YENİDEN TASARIM (`docs/UI_REDESIGN.md`)

> **Audience:** Haiku coding agents, one work package (§8) at a time. Every package names exact files, class names, numbers and acceptance checks. Prose is English, every **player-facing string is Turkish** (the game is Turkish-only).
> **Status:** DESIGN v2.1 (2026-10-13; v2 + the 22 fixes of critic round 1) — **ElvUI re-skin**: §2.2–§2.8, §2.10, §2.12 and §3 were rewritten after the orchestrator override below (flat ElvUI action bars, centre unit frames, Details!-style meter, flat design system); every other section keeps its flows and is re-skinned to the flat language. Nothing in this document is implemented yet.
> **Reads / overrides:** GDD_V2 §0.4 + §2.4 + §9.7, GDD_TALENTS §5, GDD_LIFE §3, GDD_OPENWORLD §6–7, ROADMAP batch 6. Conflicts are listed in §0.4 — **this document wins for everything under `src/ui/**`**; `ARCHITECTURE.md` still wins for module ownership.
> **Code facts below were read from the repository on 2026-10-13** (file names and line-level claims are real; numbers like "1,970 hex literals" were counted by script).

> **ORCHESTRATOR OVERRIDE (2026-10-13, binding — wins over everything below):**
> 1. **Visual language = ElvUI / modern WoW, not "Taş & Altın".** The user's latest UI request ("UI çok kötü… skill bar ve
>    UI de böyle olsun, DPS bar da böyle") came with the ElvUI + Details! references in `docs/ref/ui/README.md` #1, #2,
>    #4, #5, #6. So: flat dark semi-transparent panels, 1 px dark borders, compact; player frame just left of centre and
>    target frame just right of centre (slightly below the middle) with flat bars and aura rows; action bars = a tight
>    grid of crisp square icons with tiny keybind labels top-right, charge counts bottom-right, cooldown sweep, proc
>    glow; Details!-style DPS/HPS meters (spec icon + class-colour bar + value); quest tracker on the right; minimap
>    top-right; chat bottom-left. §2.6 ("Alt Tahta") is now "Action bars (ElvUI)" and §3 ("Taş & Altın") is now the
>    ElvUI design system — **both applied in this revision** (§2 layout ideas — progressive slot reveal, density, one
>    context tracker, visibility matrix — stay). Gold is an ACCENT only (rarity, highlights), not the frame material.
>    A "Metin2 Klasik" HUD skin (board + gauges) may follow later as an option (backlog UX-70; the old files are parked, §3.11).
> 2. **Bar = CORE_MECHANICS §10.1:** LMB chain + rmb, q, e, r, 1, 2, 3, G (new s4) + X/V/T majors + potions/flasks.
> 3. **Hotkeys:** Group Finder = **I** (inventory = B only), per GDD_PVP_FINDER / MAP_UI and the user's explicit ask
>    ("WoW'daki gibi I'ya basınca queue'lar"); guide panel = `.`. (Applied: every `,` finder key of the earlier draft is now
>    `I`; Input action `groupFinder`, panel id `finder`.)
> 4. Action-bar states, proc glow, cast bars and target auras follow docs/COMBAT_WOW.md §2.12–2.15.
> 5. **G key:** `skill_s4` = KeyG; `guard` moves to Mouse3 + CapsLock (CORE_MECHANICS §10.1 key resolution). UX-10 depends on the CM12/CW-01 contract that adds `skill_s4` / SkillSlotKey `'s4'`.

## Table of contents

0. [Brief, goals, scope, overrides](#0-brief-goals-scope-overrides)
1. [Diagnosis — why the UI feels bad](#1-diagnosis--why-the-ui-feels-bad)
2. [New HUD layout (1920×1080 and 1280×720)](#2-new-hud-layout)
3. [Visual design system ("ElvUI")](#3-visual-design-system-elvui)
4. [Onboarding UX ("ne yapacağımı bilmiyorum")](#4-onboarding-ux)
5. [Chat window and speech bubbles](#5-chat-window-and-speech-bubbles)
6. [Zindan Bulucu / Raid Bulucu (Dungeon & Raid Finder)](#6-zindan-bulucu--raid-bulucu)
7. [Panel consistency pass](#7-panel-consistency-pass)
8. [IMPLEMENTATION PLAN (Haiku packages, waves of ≤ 3)](#8-implementation-plan)
- Appendix A — contracts (Input, Settings, events, flags, files)
- Appendix B — Turkish terminology
- Appendix C — QA checklist per wave
- Appendix D — content hooks for the orchestrator (quests, maps, "X yaratık kes" tasks)

---

## 0. Brief, goals, scope, overrides

### 0.1 What the player said (and what it means)

| User (Turkish) | Meaning for this document |
|---|---|
| "UI'ı iyileştir, çok kötü gibi" | Whole-UI art direction pass: layout, style, consistency, readability. |
| "skiller ve skill barı çok fazla" | The action bar shows too much at once and the skill book lists too much → **progressive reveal**, one main bar, extras opt-in (§2.6, §7.4). |
| "map çok, içerik çok ama dolu olsun, boş boş olmasın; görevler de olsun; şu kadar yaratık kes gibi, MMORPG'lerdeki gibi" | The world is large, so the UI must (a) never show empty frames / dead panels, (b) surface quests and **kill-count tasks** everywhere (tracker, feed, log, map) (§4.9). Content authoring itself is out of this doc → Appendix D. |
| "oyun başlıyor, ne yapacağımı bilmiyorum, nerede kasacağım" | Onboarding: welcome card, guide NPC highlight, objective arrow, "Ne yapmalıyım?" panel, one-time tips (§4). |
| "chat mesajları kafanın üstünde balon" | Speech bubbles (§5.2). |
| "WoW gibi dungeon finder / raid finder, zorluk seçimli" | New `finder` panel (§6). |
| "Metin2 gauge (var) + WoW hissi" | **Superseded by the user's ElvUI references:** health and resource are flat bars in the centre player frame (§2.7), XP is a thin strip (§2.6.7); a Metin2-style board may return as an optional skin (backlog UX-70). WoW feel = frames, tracker, tooltips, LFG. |
| "skill bar ve UI de böyle olsun, DPS bar da böyle" (with the ElvUI + Details! screenshots) | ElvUI action grid + centre unit frames (§2.6–§2.8), flat design system (§3), Details!-style DPS \| HPS meter (§2.10.1). |

### 0.2 Measurable goals

| Metric | Today | Target |
|---|---|---|
| Visible controls on a **level-1** character idle in town (slots, micro buttons, edit button, DPS pill, minimap zoom buttons) | **22** (10 slots + 8 micro + edit + pill + 2 zoom) | **≤ 10** (4 slots + 5 micro + 1 minimap) |
| Always-on HUD regions (solo, idle, town) | 10 | **7** (player frame, minimap, action bars, XP strip, chat, gold/micro corner, tracker) |
| Action-bar width at 1920 | 1060 px (55 %) | **95 px at level 1 → 545 px (28 %)** with all 12 slots, grows with unlocks |
| Skill/slot inputs shown at once at L60 | 10 + (flasks, majors have **no** UI) | ≤ 9 skill + 3 majors (the 12-slot grid) + 2 potions (+ ≤ 5 flasks only when equipped) |
| HUD information text smaller than 13 css px | 79 of 201 font declarations (hud\*.css) | **0** (12 px only on key labels, stack counts, aura timers, `YENİ` chips) |
| Distinct font sizes in `src/ui/styles/*.css` | 38 | **10 tokens + 3 named display exceptions** (§3.4) |
| Hex colour literals / unique | 1,970 / 599 (10 different "golds") | all colours from **≤ 75 tokens** (§3.2; 73 defined, 11 of them class colours); components use `var()` / `color-mix()` |
| Window dialects (frame, header, close button, tab, button) | 2 (`pg-*`, `pi-*`) + HUD plates | **1** shell (§7.1) |
| Time until a new player sees "what to do next" | never (no onboarding code exists) | **≤ 3 s** after control starts (welcome card → objective arrow) |
| Class resource bars with no fill colour (old Metin2 board) | 3 of 9 classes (focus, faith, essence) | 0 (all 11 classes have a power-strip colour, §3.7) |

### 0.3 Scope

**In scope:** everything under `src/ui/**` (HUD widgets, widgets, styles, panels, menu CSS), three new panels (`finder`, `guide`, `welcome`), new HUD widgets, the NPC quest-marker look, the world-label bubble layer, and the *contracts* they need in `core/Input.ts`, `core/Settings.ts`, `core/events.ts`, `net/messages.ts` (append-only).

**Out of scope:** combat, items, talent data, dungeon/world data, audio, 3D art. New copy lives in the files named per package. **No existing id is renamed** (panel ids, event names, settings keys stay; new ones are appended) — the single exception is the HUD edit-frame id `mplus`, which becomes `tracker` with a migration (§2.13).

### 0.4 Overrides (this document changes rules of other documents)

| Document / rule | Change |
|---|---|
| GDD_V2 §2.4 HUD layout (major cluster, flask bar "right of the potions") | Replaced by §2.6: the majors are the last three cells of the 12-slot grid (`X V T`); potions and flasks form the consumable strip under the player frame (flasks exist only when equipped). |
| GDD_V2 §9.7 / §11.3 "Raid Bulucu = tab on the `party` panel" | Raid Bulucu is the **Raid tab of the new `finder` panel** (§6.7). The `party` panel (O) stays the room browser/party manager and gets a "Zindan Bulucu" button. |
| GDD_TALENTS §5.9 "N badge next to the action bar" | Kept, relocated to the grid's top-left corner (§2.6.1). Window size 1180×720 (§5.1 there) is kept and becomes the standard **L** size (§7.1). |
| GDD_LIFE §3.2 chat default 380×190, §3.2 bubble "5 s, max 2 stacked" | 400×176 (lg) with the tab strip counted inside; bubble duration is length-based (3.5–8 s), stacking rule refined (§5.2). Channel table / commands / net protocol of GDD_LIFE §3 are unchanged. |
| `hud/index.ts computeScale`: `clamp(0.75, 2.2, …)` | Minimum **0.8** and a new `data-density` attribute (`lg` / `md` / `sm`, §2.2). |
| ROADMAP "UI Edit Mode" button on the HUD | The permanent "Arayüzü Düzenle" button leaves the HUD; entry points are Esc menu, Settings › Arayüz, `/arayuz` (§2.10). |
| Default HUD state of the DPS meter | Details!-style window, shown automatically for a party ≥ 2, in dungeons and for 15 s after combat; no pill (`meterVisibility: 'auto'`, §2.10.1). |
| `hudStyle` setting (`metin2` / `orbs`) | New default and only mounted skin `elvui`; the old skins' files are parked, not deleted (§3.11). |
| Inventory / group-finder keys | Inventory = `B` only; Group Finder = `I` (action `groupFinder`) — GDD_PVP_FINDER, MAP_UI P00. |

### 0.5 Conventions for every package

1. Turkish UI strings; code identifiers English; CSS classes for new shared components use the `k-` prefix (kit), widget classes keep their current prefixes.
2. Use `G` services and `G.events`; **never throw from a frame loop** (wrap in try/catch, warn once). All `localStorage` access in try/catch.
3. Design numbers are **CSS px at the 1920×1080 design size** (`lg` density). The HUD root is zoomed (`--hud-zoom`), do not multiply by the scale in code.
4. Every package ends with `npx tsc --noEmit` = 0 errors in its files, and lists a dev page check (`dev/hud.html`, `dev/panels-game.html`, `dev/panels-items.html`).
5. A package touches **only** the files it lists. Shared files are changed only by the package that owns them in §8.3.
6. `image-rendering: pixelated` for bitmaps/canvases, integer pixel positions (`translate3d` with whole px), no blur-based `backdrop-filter` / `filter: blur()` on the HUD (perf), glows are `box-shadow` only (≤ 8 px, §3.12) — no `drop-shadow`.

---

## 1. Diagnosis — why the UI feels bad

### 1.1 What is already good (keep it)

Metin2 gauge trail + hit flash + low-HP pulse (`Metin2Bar.ts` — the logic lives on in the flat unit-frame bars, §3.7), the 4 EXP beads and their level-up flash (now the XP strip's behaviour, §2.6.7), cooldown conic sweeps / GCD sweep / ready ring (`ActionBar.ts`), nameplates and cast bars, the round minimap with fog of war, WoW-style item/skill tooltips with comparison, the layout editor with snap + guides (`EditMode.ts`), the quest log grouping (`quests.ts`), the ladder gating rules (`ladder.ts`), the keystone "Zindan Seç" cards. The redesign **re-skins and re-arranges** these; it does not rewrite their logic.

### 1.2 Concrete problems (evidence → fix)

| # | Problem | Evidence in the repo | Fix |
|---|---|---|---|
| D1 | **The bottom board is a 1060 px slab** (55 % of a 1920 screen) holding three wells (stat 270 + beads 172 + slots ≈ 570). `M2_WIDTH = 1060` in `Metin2Bar.ts`; `Metin2Bar.fit()` shrinks it to a minimum of 0.45 on narrow windows, which makes the slots unreadable. | `hud-metin2.css .m2 { width: 1060px }` | §2.6: no board — a 545 px grid of buttons 1 px apart; bars live in the player frame, XP is a strip. |
| D2 | **Ten slots are always visible although six are locked at level 1** (Q L3, E L6, 1 L10, 2 L15, 3 L20, R L30). They render as dark sockets with unexplained key letters. This is the "skill bar çok fazla" feeling. | `ActionBar.ts SPECS` has 10 fixed entries; `.slot.noskill` only darkens | §2.6 progressive reveal: a slot exists only once learned. |
| D3 | **The input surface exploded but the HUD has no place for it**: GDD_V2 added X/V/T majors, 6–0 flasks, G guard, F1–F5, U; `Input.ts` has them, `ActionBar.ts` has **no** slot for majors or flasks (`PlayerController` maps `m45/m90/m180` but nothing draws them). | `core/Input.ts` lines 60–69, `data/flasks.ts` is an empty stub | §2.6 X / V / T in the 12-slot grid + flask buttons in the consumable strip (hidden until owned). |
| D4 | **HP/SP are drawn twice**: the top-left `PlayerFrame` (name, level, HP, resource) *and* the board's stat well (name, level, class, HP, SP). | `hud/index.ts` adds both | §2.7: one ElvUI player frame at the centre owns health + resource; the top-left chip and the board gauges are gone. |
| D5 | **Bottom-right is six unrelated things in one 330 px column**: loot feed, "Arayüzü Düzenle" button, gold, 8 micro buttons (4×2 grid), the FPS counter (only with `showFps`, and then it duplicates the top-left `PerfOverlay`), and the DPS pill 232 px above the corner. | `hud/index.ts` `br` block, `Overlays.ts FpsCounter`, `hud-meter.css .dm { bottom: 232px }` | §2.10: loot, gold chip, one micro row; edit button, FPS duplicate and the meter pill leave; the meter becomes the Details!-style window (§2.10.1). |
| D6 | **Top-right stacks three trackers**: minimap (236) + `MythicTracker` (≈ 340 px tall: head, affixes, timer + thresholds, forces, bosses, deaths) + `QuestTracker`. In a run with an active quest that is > 600 px = 56 % of the screen height. | `hud-tr` column in `hud.css`, `MythicTracker.ts` | §2.9: **one** context tracker (boss > run > quest). |
| D7 | **Three visual dialects**: HUD plates (2 px black + gold hairlines, `#2f2216` gradients), `pg-*` windows (radial brown, 4 rivets, uppercase gold-gradient title, 30 px close), `pi-*` windows (leather, draggable header bar, 24 px red-hover close). Two different tab strips (`pg-tab` / `pi-tab`), two button systems (`pg-btn` / `pi-btn`), two open animations, two scale mechanisms (`zoom: var(--pg-zoom)` vs `transform: scale(fit)`). | `panels-game.css` L46–340, `panels-items.css` L19–188 | §3 + §7.1 shared shell. |
| D8 | **Token chaos**: 1,970 hex literals / 599 unique in `src/ui/styles` + `menu.css`; 10 gold variants (`#e8c46a`, `#e8c25a`, `#c9a24a`, `#d9b05a`, `#b8923c`, `#9b7b36`, `#8a6b2e`, `#a98a45`, `#6b5530`, `#ffe7a3`); `--metal-0..3` defined in `hud.css` but unused; `--pg-*`, `--pi-*`, `--hud-*`, base tokens all define "gold" again. | counted by script | §3.2 one token file + legacy aliases. |
| D9 | **Typography is unreadable at 720p**: 38 distinct font sizes; 79 of 201 HUD font declarations are < 13 px, 57 of 93 in item panels, 56 of 79 in talents. A 10 px key cap at the 0.75 HUD scale of a 1280×720 window renders at **7.5 px**. | counted by script | §3.4 scale (min 13 px info text; 12 px only for key labels, counts, aura timers), scale clamp 0.8. |
| D10 | **Bug: SP gauge has no fill colour for focus (Okçu), faith (Paladin), essence (Nekromant)** on the Metin2 board — `hud-metin2.css` styles only `hp / mana / rage / energy`; `.m2-fill` has no default background, only the pale trail shows. | `hud-metin2.css` L85–91 | §3.7 flat bars with resource tokens for every kind (incl. `fury`). |
| D11 | **No wayfinding**: first quest `mq_01_kuzgunun_cagrisi` is offered by Muhtar Cemal ≈ 13 m from the spawn (0, 26 → 10, 18) but nothing points at him; the tracker is hidden until a quest is active; quest rings exist only in the open-world map (`questTargetMarks()` returns `[]` outside `inWorldMap()`); `NPC.setQuestMark` is a bare glyph with inline CSS, no frame, no bob — and it sits inside the generic dark `.wl` label box because the class it passes (`efs-wl-wrap`) has **no CSS anywhere**. | `questMarks.ts`, `NPC.ts L417-445`, grep `efs-wl-wrap` | §4. |
| D12 | **There is no tutorial code**: `CharacterSave.flags` has a comment "tutorial…" but nothing reads or writes it; the only guidance is loading-screen tips. | grep | §4.7 tips + §4.2 welcome. |
| D13 | **Chat is one "Grup" channel** with text-shadow text over a bloomed PSX scene, no tabs, no bubbles; NPC barks use a different cream parchment bubble (`.efs-bark` in `menu.css`), drawn inside that same unintended `.wl` dark box (double frame). | `Chat.ts`, `menu.css L268` | §5. |
| D14 | **Panel sizes are inconsistent and dim the whole game**: talents 1560×940 (80 % of 1080p), party 1240×780, map 1180×800, keystone 1120×720, quest log 900×640 — all with a 55–82 % black backdrop — versus draggable 436–780 px item windows. | `panels-game.css` | §7.1: three sizes S/M/L, dock positions, backdrop only for modal. |
| D15 | **Skill book shows everything**: class kit + spec skills + talent-granted skills in one list, locked ones included. | `SkillsPanel.ts` | §7.4 grouping + collapsed "Kilitli". |
| D16 | **No single place to answer "what can I run, with whom, on which difficulty?"**: entry is split between four portal NPCs, the Kehanet Taşı panel (3 tabs), M+ info (J) and the party panel; no roles, no LFG. | `town.ts` PORTALS, `keystone.ts` | §6. |
| D17 | **Empty states are dead ends**: `pg-empty` plain text ("Anahtarın yok…"), tracker hidden when no quest, sockets that look broken. This is the "boş boş" feeling. | `keystone.ts`, `QuestTracker.ts` | §7.5 empty-state pattern with a call to action; tracker never fully empty (§2.9). |
| D18 | **Five message layers inside 20 % of the screen height** with no priority: zone banner (12 %), world announce (21 %), toasts (26 %), level-up (30 %), ready check (17 %). | `overlays.css`, `widgets.css`, `hud-quests.css` | §2.11 message hierarchy + big-banner queue. |
| D19 | **Combo counter floats at `left: 44px; top: 47%`**, 300 px wide, unrelated to anything. | `overlays.css .cb` | §2.11 tier-gated, smaller, stable anchor. |
| D20 | **"Arayüzü Düzenle" sits on screen permanently** though it is used once. | `hud/index.ts editBtn` | §2.10. |
| D21 | **Quest/kill feedback is invisible**: the tracker shows text rows, but a kill that advances `3/8` produces no feedback, so "şu kadar yaratık kes" feels like nothing happens. | `QuestTracker.ts` | §2.9 (feed + bars), §4.9. |

### 1.3 Design verdict in one sentence

> *The UI shows everything the game can do, all the time, in three different styles, at sizes nobody can read. The redesign shows only what the player can use **now**, in one flat ElvUI language, at sizes that survive 720p, and always tells the player what to do next.*

---

## 2. New HUD layout

> **ElvUI layout (this revision):** centre cluster (player frame left, target frame right of the reticle, 57 % down) · a 12-slot action grid at the bottom centre with a thin XP strip beneath · minimap + one tracker top-right · chat bottom-left · Details!-style DPS | HPS meter bottom-right. References: `docs/ref/ui/README.md` #1, #2, #4.

### 2.1 Principles

1. **Quiet by default.** The HUD shows what the player can use *now*. Locked things are **absent** (never greyed out); the skill book (K) is where locked things are listed.
2. **Three tiers.** **T0 always:** player frame (health + resource), action grid, XP strip, crosshair, minimap. **T1 contextual:** target, boss, tracker, buffs, cast bar, prompts, tips, party. **T2 on demand:** chat history, damage meter, extra bars, edit mode, micro-menu tooltips.
3. **One owner per screen zone** (§2.5). Nothing unrelated is stacked in a corner.
4. **One source of truth per number.** Health, resource, level and name appear in the player frame only; XP only in the strip; cooldowns only on the buttons.
5. **Reveal, don't grey out.** A slot, micro button or tracker row appears when the player earns it, with a short fade-in (300 ms) and a gold border pulse.
6. **Reading distance.** Information text ≥ 13 css px (12 px only on key labels, counts and aura timers); bar numbers condensed sans 700 ≥ 13 px with a 1 px black outline; contrast ≥ 4.5 : 1 on the dark surfaces.
7. **ElvUI clustering.** What the player watches in combat — own health and resource, target health / auras / cast, the cooldown grid — sits within ~600 px of the reticle (§2.2 fit checks).

### 2.2 Scale and density

`hud/index.ts computeScale()` changes:

```ts
scale = Math.max(0.8, Math.min(2.2, Math.min(w / 1920, h / 1080))) * user;   // was 0.75
const hudW = w / scale;                                                       // HUD width in css px
const density = hudW >= 1800 ? 'lg' : hudW >= 1500 ? 'md' : 'sm';
root.dataset.density = density;                                               // <div class="hud" data-density="lg">
setStyle(root, '--hud-w', hudW.toFixed(0));
```

Examples: 1920×1080 → scale 1.0, hudW 1920 (`lg`). 1600×900 → 0.833, hudW 1920 (`lg`). 1280×720 → 0.8 (clamped from 0.667), hudW 1600 (`md`). 1366×768 → 0.8, hudW 1707 (`md`). 1024×768 → 0.8, hudW 1280 (`sm`). The user's UI-size slider (0.7–1.5) multiplies `scale`, so density follows automatically.

All density-dependent sizes are CSS custom properties on `.hud[data-density]` (defined in `hud.css` by UX-01, consumed by every HUD stylesheet — never hard-code these numbers elsewhere). **Every value is an integer css px** (PSX rule: whole-pixel geometry), the grid gap is always **1 px**:

| Variable | `lg` | `md` | `sm` | Used by |
|---|---:|---:|---:|---|
| `--ab-btn` (square action button) | 44 | 40 | 36 | main grid + Çubuk 2/3 (§2.6) |
| `--ab-gap` | 1 | 1 | 1 | gap between buttons, both axes |
| `--cons-btn` (potion / flask button) | 32 | 30 | 28 | consumable strip under the player frame |
| `--uf-w` (player and target frame width) | 320 | 292 | 260 | unit frames (§2.7, §2.8) |
| `--uf-gap` (clear zone: screen centre → inner edge of a frame) | 132 | 120 | 100 | keeps the reticle and the character visible |
| `--uf-top` (top of the health bars, share of the HUD height) | 57 % | 57 % | 57 % | "slightly below the middle" |
| `--uf-hp-p` / `--uf-hp-t` (health bar height, player / target) | 30 / 24 | 28 / 22 | 26 / 20 | |
| `--uf-strip` (power / cast / threat strip) | 16 | 16 | 16 | |
| `--au-lg` / `--au-sm` (aura icons: own & buffs / others) | 28 / 20 | 26 / 18 | 24 / 16 | auras |
| `--party-w` | 220 | 204 | 188 | party frames |
| `--boss-w` | 560 | 520 | 480 | boss frame |
| `--trk-w` (tracker) | 264 | 244 | 220 | top-right |
| `--trk-h` (tracker pane max height) | 320 | 240 | 200 | top-right; part of the right-edge budget of §2.10 |
| `--chat-w` × `--chat-h` | 400 × 176 | 360 × 152 | 320 × 120 | chat |
| `--dm-col` / `--dm-row` (meter column width / row height) | 196 / 18 | 176 / 18 | 172 / 16 | Details!-style meter (§2.10.1); 176 at `md` keeps the meter 18 px clear of the target frame |
| `--xp-h` (XP strip) | 6 | 5 | 4 | bottom edge |
| `--micro` (micro-menu button) | 32 | 30 | 28 | corner |
| `--gut` (screen gutter) | 16 | 14 | 12 | all zones |
| `--tip-w` | 320 | 300 | 280 | tip card (bottom-left, above the chat) |

`sm` additionally: tracker starts collapsed to its header, chat shows 3 lines, the meter opens in single-column view. **Fit checks** (CSS px, these are the numbers the QA agent verifies at 1920×1080 / 1280×720 / 1024×768): the full 12-slot row is `12 × --ab-btn + 11 + 6` = **545 / 497 / 449** px (28 % / 31 % / 35 % of the HUD width). Clearance between the chat's right edge and the grid's left edge: 271 / 177 / 83 px; between the grid's right edge and the meter's left edge (`2 × --dm-col + 4`, split view: 396 / 356 px wide): 275 / 181 px, and at `sm`, where the meter is one 172 px column, 232 px; **between the meter's left edge (1508 / 1230 / 1096) and the target frame's right edge (1412 / 1212 / 1000): 96 / 18 / 96 px** — the `md` pair is the tightest horizontal pair on the screen, which is why `--dm-col` is 176 and not 184 there (vertically the target stack ends at ≈ y 602 at `md` while the meter starts at 644, 42 px lower); the player frame (right edge `50 % − --uf-gap`) and the target frame (left edge `50 % + --uf-gap`) leave **264 / 240 / 200 px** free in the screen centre; the right column (`--trk-w`) clears the target frame's right edge by **228 / 130 / 48** px; the two right-hand stacks (minimap + tracker above, loot + meter + gold + micro row below) keep **66 / 19 / 153 px** between them in the worst case (§2.10 budget).

### 2.3 Mockup — 1920×1080 (scale 1.0, density `lg`)

*The diagram is proportional (1 character = 16 × 24 css px; cell labels are abbreviated — the tables in §2.5–§2.10 are authoritative for exact numbers and strings).*

```
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                                          ┌───────────┐
 ┆GRUP         ┆                           ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                            │MİNİ HARİTA│
 ┆Ahmet  ████▌ ┆                           ┆ BEKÇİ KALDUR   Faz 2 / 3        ┆                            │(disk 192) │
 ┆Zeynep ███░░ ┆                           ┆ █████████▌░░░░░ 41%  [brez ●●○] ┆                            │           │
 ┆Mert   █████ ┆                           └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                            │           │
 ┆Selin  ██▌░░ ┆                                                                                          │           │
 ┆Can    ████░ ┆                                                                                          │           │
 └┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                                          │           │
                                                                                                          │Altın Tarla│
                                                                                                          │Sv. 5-10   │
                                                                                                          └───────────┘
                                                                                                       ┌──────────────┐
                                                                                                       │TAKİPÇİ Görev │
                                                                                                       │Fare Yuvası   │
                                                                                                       │▸ Sıçan 3/10  │
                                                                                                       │▸ Muhtar 0/1  │
                                                                                                       │+1 görev [L]  │
                                                                                                       │[.] Ne yapmalı│
   ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                                   │              │
   ┆KOMBO ×12      ┆                                                                                   └──────────────┘
   ┆HARİKA!        ┆
   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                                                            +

                                ▪▪▪▪▪▪▪▪        ●●○
                                ┌──────────────────┐                ┌──────────────────┐
                                │24 Gölge 805K|100%│                │       100%       │
 ◀◆ Muhtar Cemal 14 m           │Hiddet          82│                │7 Kurt ▸Ahmet 2,4K│
                                └──────────────────┘                └──────────────────┘
                                [4][5] [6][7][8]                    ▪▪▪▪▪▪
                                ▪▪                                  ▫▫▫▫                          ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                 ┌┄┄┄┄┄┄┄┄┄┄┐                                ┆EŞYA AKIŞI         ┆
 ┆İPUCU · Kaçış     ┆                                 ┆ [F] Konuş┆                                ┆+120 Altın         ┆
 ┆[Shift] yuvarlan  ┆                                 └┄┄┄┄┄┄┄┄┄┄┘                                ┆▲ Çelik Kılıç      ┆
 ┆           [✓]    ┆                                                                             └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                         ┌───────────────────────┐
                                                                                              │Hasar İyileştirme Ölüm…│
 ┌───────────────────────┐                                                                    │▣████ 226,9K ▣██ 189,0K│
 │SOHBET                 │                                                                    │▣███▌ 217,2K ▣█▌ 147,3K│
 │[Genel][Grup][Sistem]  │                                                                    │▣███  196,3K ▣▌   15,2K│
 │Ahmet: selam!          │                                                                    │▣██   138,7K ▣▌   10,1K│
 │Zeynep: grup?          │                           Menzil dışında                           └───────────────────────┘
 │                       │                [N 3]                                                         [altın 48.213]
 └───────────────────────┘                [L][R][Q][E][R][1][2][3][G][X][V][T]                        [▪▪▪▪▪▪▪▪▪] mikro
██████████████████████████████┃██████████████░░░░░░░░░░░░░░░┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

Legend: solid boxes = always-on (T0); dashed boxes = contextual (T1), absent when they have nothing to say; `+` = crosshair; `◀◆` = objective arrow clamped to the screen edge (§4.4); `▪` = aura icons (buffs above the player frame, own debuffs below the target frame), `●●○` = combo pips (only while > 0); `[4][5] [6][7][8]` = consumable strip (potions, then equipped flasks); the grid cells `[L][R][Q][E][R][1][2][3][G][X][V][T]` are LMB RMB Q E R 1 2 3 G X V T (12 slots, 1 px apart; `[N 3]` = unspent-talent badge); the bottom line is the **XP strip** with its 25 % notches; the player frame shows `24 Gölge … 805K|100%` (level, name, health) over the power strip (`Hiddet 82`), the target frame is the centred `100%` bar of reference #1 over a strip with `7 Kurt` (level, name), `▸Ahmet` (target of target) and `2,4K` (health). The tip card (dashed, bottom-left) sits directly above the chat; the tracker header shows only its lit text tab (`Görev`; the tabs are `Görev · Koşu · Boss`, §2.9). The boss frame (top centre) and the party frames (top left) exist only in fights / groups. The meter (bottom right) is the **Details!-style** DPS | HPS window of §2.10.1.

### 2.4 Mockup — 1280×720 (scale 0.8, density `md`, HUD space 1600 × 900 css px)

*Proportional to the HUD space (1 character = 13.3 × 20 css px = 10.7 × 16 physical px). Sizes in the tables are CSS px; multiply by 0.8 for physical pixels.*

```
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                                       ┌──────────────┐
 ┆GRUP         ┆                         ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                       │MİNİ HARİTA   │
 ┆Ahmet  ████▌ ┆                         ┆ BEKÇİ KALDUR   Faz 2 / 3            ┆                       │(disk 192)    │
 ┆Zeynep ███░░ ┆                         ┆ █████████▌░░░░░ 41%  [brez ●●○]     ┆                       │              │
 ┆Mert   █████ ┆                         └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                       │              │
 ┆Selin  ██▌░░ ┆                                                                                       │              │
 ┆Can    ████░ ┆                                                                                       │              │
 └┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                                       │              │
                                                                                                       │Altın Tarla   │
                                                                                                       │Sv. 5-10      │
                                                                                                       │              │
                                                                                                       │              │
                                                                                                       └──────────────┘
                                                                                                     ┌────────────────┐
                                                                                                     │TAKİPÇİ Görev   │
                                                                                                     │Fare Yuvası     │
                                                                                                     │▸ Sıçan 3/10    │
                                                                                                     │▸ Muhtar 0/1    │
   ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                                 │+1 görev [L]    │
   ┆KOMBO ×12      ┆                                                                                 │[.] Ne yapmalı  │
   ┆HARİKA!        ┆                                                                                 │                │
   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                                 └────────────────┘
                                                            +

                             ▪▪▪▪▪▪▪▪          ●●○
                             ┌────────────────────┐                  ┌────────────────────┐
                             │24 Gölge   805K|100%│                  │        100%        │
 ◀◆ Muhtar Cemal 14 m        │Hiddet            82│                  │7 Kurt   ▸Ahmet 2,4K│
                             └────────────────────┘                  └────────────────────┘
                             [4][5] [6][7][8]                        ▪▪▪▪▪▪                     ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                             ▪▪                                      ▫▫▫▫                       ┆EŞYA AKIŞI           ┆
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                               ┌┄┄┄┄┄┄┄┄┄┄┐                              ┆+120 Altın           ┆
 ┆İPUCU · Kaçış       ┆                               ┆ [F] Konuş┆                              ┆▲ Çelik Kılıç        ┆
 ┆[Shift] yuvarlan    ┆                               └┄┄┄┄┄┄┄┄┄┄┘                              └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
 ┆             [✓]    ┆                                                                     ┌─────────────────────────┐
 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                     │Hasar İyileştirme Ölüm…  │
 ┌─────────────────────────┐                                                                │▣█████ 226,9K ▣███ 189,0K│
 │SOHBET                   │                                                                │▣████▌ 217,2K ▣██▌ 147,3K│
 │[Genel][Grup][Sistem]    │                                                                │▣████  196,3K ▣▌    15,2K│
 │Ahmet: selam!            │                                                                │▣███   138,7K ▣▌    10,1K│
 │Zeynep: grup?            │                                                                └─────────────────────────┘
 │                         │                         Menzil dışında                                     [altın 48.213]
 │                         │              [N 3]
 └─────────────────────────┘              [L][R][Q][E][R][1][2][3][G][X][V][T]                        [▪▪▪▪▪▪▪▪▪] mikro
██████████████████████████████┃██████████████░░░░░░░░░░░░░░░┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░┃░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

At 720p the chat (right edge 14 + 360 = 374) and the grid (left edge (1600 − 497) / 2 = 551) clear each other by 177 css px; the meter (split view 2 × 176 + 4 = 356 px, left edge 1600 − 14 − 356 = 1230) clears the grid's right edge (1049) by 181 px **and the target frame (right edge 800 + 120 + 292 = 1212) by 18 px** — the tightest horizontal pair on the screen, hence a fit check (§2.2); vertically the target stack (health-bar top at 57 % = 513, auras end ≈ 602) stays 42 px above the meter's top (644); the tracker column (left edge 1600 − 14 − 244 = 1342) clears the target frame by 130 px, and the two right-hand stacks keep 19 px between them in the worst case (loot 4 lines + a meter with 2 deaths below, a 240 px tracker above — §2.10 budget). At `sm` (1024×768, HUD 1280 × 960) a split meter would leave only 55 px to the grid's right edge (865), which is why `sm` offers single-column views only (172 px wide, left edge 1096, 232 px clear).

### 2.5 Zone anchors (exact)

| Zone class | Anchor | Owner widget(s) | Notes |
|---|---|---|---|
| `.hud-tl` | `left: var(--gut); top: var(--gut)`, width `--party-w` | `PartyFrames`, `PerfOverlay` | column, gap 6; nothing else lives here any more (the player has no top-left chip) |
| `.hud-uf` **(new)** | `position: absolute; inset: 0; pointer-events: none` | `PlayerFrame` stack (`.uf-player`: `right: calc(50% + var(--uf-gap)); top: var(--uf-top)` — a `right` offset is measured from the right edge of `.hud-uf`, so the frame's right edge lands at `50 % − --uf-gap`, left of centre), `TargetFrame` stack (`.uf-target`: `left: calc(50% + var(--uf-gap)); top: var(--uf-top)`), later `FocusFrame` / `TargetOfTarget` | the ElvUI centre cluster; each stack is `width: var(--uf-w)`, its health bar's top edge sits at `--uf-top` and everything else (aura rows, consumables, strips) hangs below or above it |
| `.hud-tc` | centre-x, `top: 14px` | `BossFrame` (boss fights only) | the target frame no longer stacks under it |
| `.hud-tr` | `right: var(--gut); top: var(--gut)`, width `--trk-w` | `Minimap` (208 × 236), `ContextTracker` | column, gap 12, right aligned; the tracker pane is capped at `--trk-h` (320 / 240 / 200) so this column never reaches the `.hud-br` column (§2.10 budget) |
| `.hud-ml` **(new)** | `left: 48px; top: 40%` | `ComboCounter` | anchor of the `combo` edit frame |
| `.hud-tip` **(new, was `.hud-mr`)** | `left: var(--gut); bottom: calc(var(--gut) + var(--chat-h) + var(--stats-h, 0px) + 8px)`, width `--tip-w` | `TipCards` (one card at a time) | directly above the chat (and its optional stats line); a card is ≤ 140 px high (padding 10 × 12, title 20, body ≤ 3 lines, key-cap row 26). It lives on the **left** on purpose: the right edge already stacks minimap, tracker, loot, meter, gold and micro row (budget in §2.10), while the left between the combo anchor (40 %) and the chat is empty at every density (card top at y 740 / 586 / 680 against the combo counter's bottom at ≈ 560 / 490 / 514) |
| `.hud-bl` | `left: var(--gut); bottom: var(--gut)` | `Chat` (+ its optional stats line above the log, §5.1) | `--chat-w × --chat-h`; the optional stats line adds `--stats-h` = 20 px above it |
| `.hud-bc` | centre-x, `bottom: calc(var(--xp-h) + 8px)` | `.ab-error` line, talent badge, the action-bar rows (§2.6) | column-reverse: row 1 at the bottom, optional Çubuk 2 / 3 above it |
| `.hud-xp` **(new)** | `left: 0; right: 0; bottom: 0; height: var(--xp-h)` | `XpStrip` | full width, not movable |
| `.hud-br` | `right: var(--gut); bottom: var(--gut)`, width 330 / 300 / 280 (the meter may overflow to the left) | `LootFeed` (≤ 5 / 4 / 3 lines), `DamageMeter`, gold chip, micro row | column (top → bottom): loot, meter (absent when hidden), gold, micro; right aligned, gap 8; the tip card is **not** here (see `.hud-tip`) |
| centre layer | `position: absolute; inset: 0` | crosshair, interaction prompt (bottom 31 %), banners, `QuestFeed`, `ObjectiveArrow`, combat cues | pointer-transparent |

Everything keeps its current frame id for the layout editor (§2.13).

### 2.6 Action bars (ElvUI)

Reference: `docs/ref/ui/wow-elvui-hud-actionbars.png` (`README.md` #1). The ElvUI idea: **a tight grid of crisp square icons, no ornament** — 1 px apart, a tiny keybind label top-right, a charge / stack count bottom-right, a cooldown sweep, a dark empty cell where nothing is bound. The slots are exactly the bar of `CORE_MECHANICS.md` §10.1; the **progressive reveal** of this document's §2.1 stays (unlearned slots are absent, not greyed). The old stone board ("Alt Tahta": gauges + beads + rack in one 540–740 px slab) is gone: the resource bars live in the **player frame** (§2.7), the XP is a thin strip at the screen's bottom edge (§2.6.7), the potions / flasks sit under the player frame (§2.6.5).

#### 2.6.1 The grid

```
.hud-bc                      centre-x; bottom: calc(var(--xp-h) + 8px); display: flex; flex-direction: column; align-items: center
├─ .ab-error                 absolute; bottom: calc(100% + 6px); one line, 16 px 700 var(--bad), --sh-text ("Menzil dışında", "Henüz hazır değil 1,4 sn")
├─ .ab-n                     the existing TalentBadge ("N 3"); absolute; left: 0; bottom: calc(100% + 3px); 20 px high chip
└─ .ab-bars                  display: flex; flex-direction: column-reverse; gap: var(--ab-gap)         (row 1 at the bottom)
   ├─ .ab-row.r1             MAIN ROW — 12 slots (§2.6.2), centred; display: flex; gap: 1px; padding: 2px;
   │                         background: rgba(0,0,0,.35); border: 1px solid #000
   ├─ .ab-row.r2             optional "Çubuk 2" (Shift+1…8), 12 cells (8 keyed + 4 mouse-only), centred over the main row — extra bars, §2.6.6
   └─ .ab-row.r3             optional "Çubuk 3" (Ctrl+1…8), 12 cells, centred
```

| Property | `lg` | `md` | `sm` |
|---|---:|---:|---:|
| Button (square) `--ab-btn` | 44 × 44 | 40 × 40 | 36 × 36 |
| Spacing | **1 px** both axes | 1 px | 1 px |
| Row padding / border | 2 px / 1 px | same | same |
| Main row, all 12 slots | 12 × 44 + 11 + 6 = **545** × 50 | 497 × 46 | 449 × 42 |
| Main row at level 1 (LMB, RMB) | 2 × 44 + 1 + 6 = 95 | 87 | 79 |
| Each extra row (12 cells: 8 keyed + 4 mouse-only) | 12 × 44 + 11 + 6 = **545** × 50 | 497 × 46 | 449 × 42 |
| Stack of all three rows (the 3 × 12 block of ref #1) | 545 × 152 (50 + 1 + 50 + 1 + 50) | 497 × 140 | 449 × 128 |

Row 1 is centred with `justify-content: center`. When a slot is revealed the row simply becomes one button + 1 px wider on the frame of the reveal: there is **no width transition** (`width` cannot be animated on an auto-width flex row, and a JS-driven pixel width would only add a moving edge to a crisp grid) — the new button fades in instead (opacity only, §2.6.4). Rows 2 and 3 are always the full 12 cells, whatever the main row shows. Buttons are `flex: none`, **never scaled** (no `transform: scale` on buttons — crisp art).

#### 2.6.2 Slot order — the main row (CORE_MECHANICS §10.1, left → right)

| # | Slot id | Key label | Role in the kit | Visible when (progressive reveal) | Fallback unlock |
|---:|---|---|---|---|---:|
| 1 | `lmb` | `SolT` | weapon chain, off-GCD builder | always | – |
| 2 | `rmb` | `SağT` | filler / builder (on GCD) | always (a class skill exists at level 1) | – |
| 3 | `q` | `Q` | main spender / proc button | a skill is bound and level ≥ 3 | 3 |
| 4 | `e` | `E` | rotational cooldown | level ≥ 6 | 6 |
| 5 | `r` | `R` | rotational cooldown | level ≥ 30 | 30 |
| 6 | `s1` | `1` | AoE button | level ≥ 10 | 10 |
| 7 | `s2` | `2` | mobility | level ≥ 15 | 15 |
| 8 | `s3` | `3` | personal defensive | level ≥ 20 | 20 |
| 9 | `s4` | `G` | interrupt / utility (new, CM12) | a skill is bound and level ≥ 8 (the skill's own `unlockLevel` wins) | 8 |
| 10 | `m45` | `X` | major, 45 s | a spec is chosen and level ≥ 10 | 10 |
| 11 | `m90` | `V` | major, 90 s | level ≥ 20 | 20 |
| 12 | `m180` | `T` | hero major, 3 min ("Grup Kahramanlığı") | the spec has `majors.m180` and level ≥ 30 | 30 |

Rules: **no gaps between groups** — the three groups (weapon + skills, utility, majors) are told apart by the frame tone (majors carry a 1 px inner `--tone` line, §2.6.4) and by the order, not by spacing, exactly like the ElvUI reference. Key labels come from `G.input.bindingLabel(action)` (`skill_lmb`, `skill_rmb`, `skill_q`, `skill_e`, `skill_r`, `skill_s1`…`skill_s4`, `skill_m45/m90/m180`, `potionHp`/`potionMp`, `flask1`…`flask5`) — never hard-coded letters, so rebinding updates the bar; `guard` moves off `G` when CM12 lands (the HUD only reads the binding labels). The ready-made potions and flasks (keys 4–5, 6–0) are **not** in this row (§2.6.5). **`G` / `s4` is a CM12 contract that is not in `src/` yet** (grep 2026-10-13: no `skill_s4` in `InputAction`, no `'s4'` in `SkillSlotKey`): UX-10 widens the types locally and falls back to the label `G` until CM12 lands (§8.2 UX-10).

#### 2.6.3 Button anatomy (label and count positions)

```
┌──────────────┐  1 px #000 border; art inset 1 px, zoom-cropped 8 % (the ElvUI "zoom icons" look); image-rendering: pixelated
│        [SağT]│  KEY LABEL  top-right, 2 px from the edges · 12 px 700 · white · 4-way 1 px black outline (--sh-text)
│              │
│    (icon)    │  COOLDOWN   dark sweep over the icon + remaining time centred · 16 px (lg) / 14 px (md, sm) · 700
│              │              colour by threshold: < 5 s #ff6a5a · < 60 s #ffe27a · ≥ 60 s #ffffff · one decimal under 3 s
│          ×3  │  COUNT      bottom-right, 2 px from the edges · 14 px 700 · white · outline · shown when > 1,
└──────────────┘             or when a charge-based skill sits at 0 charges (then `0` in --bad, `.is-zero`);
                             examples: charges of Gölge Adımı, spender stacks, "Işık Mührü ×3"; exactly 1 → no count
```

- Top-left and bottom-left stay empty (no macro names, no extra pips) — the icon art must be readable.
- Modifier bars use the ElvUI short forms in the key label: `S1`…`S8` (Shift+1…8), `C1`…`C8` (Ctrl+1…8) as in the reference (`S2`, `C4`).
- The slot background is `var(--bg-1)` (empty = dark cell, `.is-socket` shows a dashed outline, §2.6.4); the tooltip is the standard `skillTooltipHTML` (120 ms delay, 0 while another is visible).
- Information text rule (§3.4): the key label (12 px) and the stack count are the only information below 13 px on a button; the cooldown number is 16 / 14 px.

#### 2.6.4 Progressive reveal (kept) and the ghost option

`ActionBar.ts` computes a per-slot `reveal` state every frame:

```ts
type Reveal = 'hidden' | 'socket' | 'ready';
function reveal(ch: CharacterState, slot: SkillSlotKey): Reveal {
  if (slot === 'lmb') return 'ready';
  const id = ch.save.skillBar[slot];
  const def = id ? G.skills.getDef(id) : undefined;
  if (def && learned(ch, def)) return 'ready';        // learned and assigned
  if (ch.level >= slotUnlockLevel(ch, slot)) return 'socket';   // unlocked but empty -> dashed "+" socket
  return 'hidden';                                    // not earned yet: absent
}
// learned(): level >= (spec?.unlock[id] ?? def.unlockLevel); unlockLevel >= 99 (tree-granted) -> id in G.talents.grantedSkills()
// slotUnlockLevel(): q/e/s1/s2/s3/r -> unlockLevel of the class skill whose defaultSlot === slot (fallback 3/6/10/15/20/30);
//   s4 -> the unlockLevel of the skill whose defaultSlot === 's4' (fallback 8);
//   m45/m90/m180 -> hidden until a spec is chosen, then spec.unlock[spec.majors.mXX] (fallback 10/20/30); m180 only if spec.majors.m180.
```

| State | Class | Look |
|---|---|---|
| ready | `.ab-btn` | normal button (§3.6) |
| socket | `.is-socket` | empty dark cell, 1 px dashed `rgba(255,255,255,.28)` inside the border, centred "+" (body font 22, `--text-4`), key label dim. Click opens the skill book (`G.ui.openPanel('skills')`) |
| hidden | `.is-hidden` | `display: none` (progressive mode) — or, with the **ghost option**, an empty dark non-interactive cell at 40 % opacity so the grid keeps its full 12-column ElvUI silhouette |

New setting **`Settings.barGhostSlots: boolean = false`** (Settings › Arayüz › "Boş yuvaları göster", Appendix A): `false` = the quiet progressive bar (default, answers "skill bar çok fazla"), `true` = the permanent 12-cell ElvUI grid for players who want fixed positions.

**Accepted: a reveal shifts its neighbours.** The unlock order is Q 3 → E 6 → G 8 → 1 @10 → 2 @15 → 3 @20 → R @30 (and X @10 / V @20 / T @30 once a spec exists), but the row order is `LMB RMB Q E R 1 2 3 G │ X V T`. Each reveal therefore inserts a cell in the *middle* of the row and, because the row is centred, moves the buttons on both sides by half a cell (22–23 px): R at level 30 pushes `1 2 3 G` and `X V T` half a cell to the right (and `LMB RMB Q E` half a cell to the left) of where the player's fingers learned them. ElvUI keeps positions fixed; the progressive bar knowingly trades that for the quiet level-1 HUD (shifts happen only at level-ups, always with the 300 ms fade-in and the `YENİ` chip drawing the eye). Players who want muscle-memory positions switch on `barGhostSlots` — its Settings row says so (`Boş yuvaları göster — düğmeler yerinden oynamaz`); the permanent 12-cell grid never shifts.

- **Reveal animation:** `.ab-btn.is-new` — opacity 0 → 1 over 300 ms (no scaling), the border pulses gold twice (`@keyframes ab-new`, 1.2 s, `steps(6)`), and a 12 px gold **"YENİ"** chip (black 80 % background, `--gold-1` text, 12 px 700 — one of the two places 12 px text is allowed on buttons) sits above the button until it is hovered, used, or 30 s pass. The existing toast `Yeni beceri öğrendin: …` (Progression.autoAssignSkills) is kept.
- **Tone** (majors only, `--tone` = the inner 1 px line): `def.tags` has `defensive` → `--info` blue; `def.heal` or tag `heal` → `--ok` green; else `--gold-2`; the `m180` hero slot is always gold. Rotational cooldowns (E, R, 1–3, G) have no tone — R is **not** an "ultimate".
- **Hero slot** `T` shows `Yorgun m:ss` (13 px, `--bad`, outline) over the icon while the local player has the `sated` status (even if the 180 s cooldown is ready). Tooltip = `skillTooltipHTML` plus a line `Büyük Yetenek · Bekleme 45 sn` (GDD_V2 §2.4). A major that becomes ready plays the `ready` flash (§2.6.8); `sfx_cd_ready` stays with the audio owner (unknown ids stay silent).

#### 2.6.5 Consumable strip: potions and flasks (under the player frame)

As in the reference, the consumables are **small square buttons directly under the player's bars** (`.uf-cons`, §2.7) — not part of the 12-slot grid. They are real action buttons (same `.ab-btn` component, `--cons-btn` = 32 / 30 / 28 px, 1 px apart, key label top-right 12 px, count bottom-right 14 px):

| Button | Key | Visible | Count / fill |
|---|---|---|---|
| Can iksiri (`potHp`) | `4` | always (best tier owned; none owned → dark empty cell) | stack count of the best tier; `0` in `--bad` and the icon dimmed; `potion_cd` sweep |
| Mana / kaynak iksiri (`potMp`) | `5` | always | same |
| Şişe 1–5 (`flask1…5`) | `6 7 8 9 0` | **only while a flask is equipped in that belt slot** (`G.character.save.flasks[i]`) | liquid fill from the bottom (`--flask-color`, 55 % alpha) = charges / max (`getFlaskBase(item.baseId)?.max[tier]`); greyed while charges < `use`; count = charges; flash ring on `flask:used` |

Order: `[4][5]` · 6 px gap · `[6][7][8][9][0]` (only the equipped ones). Total width at `lg`: 7 × 32 + 6 + 6 = 236 ≤ `--uf-w`. The strip is never empty (the two potion buttons always exist). `hud/FlaskRow.ts` (`FlaskRow implements HudWidget`) is mounted into `PlayerFrame.consHost` next to the potion buttons; with `getFlaskBase` still a stub today no flask exists and the strip shows just the two potions. Click = use (same call as the key; until WP3 exposes it the click only flashes).

#### 2.6.6 Extra bars (Çubuk 2 / Çubuk 3)

`ExtraBars.ts` keeps its logic (two bars, Shift+1…8 / Ctrl+1…8, drag from the skill book, right-click to bind consumables, per-character `efsun.bars.*`, visibility + lock in `layoutStore`). Two changes. **The skin:** the cells are `.ab-btn` (`--ab-btn`, 1 px apart, key labels `S1…S8` / `C1…C8`), each row is a `.ab-row` (§2.6.1) centred directly **above** the main row, rows are movable frames `bar2` / `bar3` (edit mode) and off by default. **The width:** reference #1 is a 3 × 12 block, so each extra bar grows from 8 to **12 cells**; cells 1–8 keep their Shift / Ctrl bindings, **cells 9–12 are mouse-only** (no key label, no input action: they accept drops and clicks, nothing else — ElvUI's `S9…S12` / `C9…C12` simply stay unbound). Storage: `efsun.bars.*` arrays are padded with `null` to 12 on read (an 8-length v1 save loads unchanged and is rewritten at 12). The three rows share one 545 / 497 / 449 px silhouette (§2.6.1).

#### 2.6.7 XP strip (`hud/XpStrip.ts`, new)

A thin full-width bar on the **very bottom edge** of the screen (the ElvUI "experience bar"; reference #4 puts it top-centre, but the top centre belongs to the boss frame here): `.hud-xp` — `height: var(--xp-h)` (6 / 5 / 4 px), `background: rgba(0,0,0,.6)`, `border-top: 1px solid #000`, fill `--res-xp` (flat), three 1 px notches at 25 / 50 / 75 % (`rgba(0,0,0,.55)` — the 4 × 25 % structure of the old beads survives as notches). Behaviour carried over from `Metin2Bar.updateExp` / `PlayerFrame.XpBar`: exact fill, level-up hold 800 ms + white flash then reset with `steps(6)`, **"+N XP" floaters** that rise 24 px from the bar's centre and fade over 1 s (13 px 700 `--res-xp` light, outline). Hover (the whole strip is `pointer-events: auto`, 14 px hit area): tooltip `Tecrübe: 12,3% (1.234 / 10.000)` above the strip; at max level the strip is hidden (nothing left to show) and the tooltip is unavailable. The level number itself lives in the player frame (§2.7). **Accepted deviations from reference #4:** the strip sits on the bottom edge (not top-centre) and carries no level badge — the top centre belongs to the boss frame, and the level is shown in the player frame.

#### 2.6.8 States of a button

CSS for every state is in §3.6 (ready to paste); the single definition:

| State | Class | Look |
|---|---|---|
| normal | `.ab-btn` | `--bg-1` cell, 1 px #000 border, art inset, key label + count |
| hover | `:hover` | 1 px inner white 70 % outline, tooltip after 120 ms |
| pressed | `.press` (100 ms) | `filter: brightness(1.3)` + 1 px inner white outline — no scaling |
| cooldown | `.oncd` | clockwise dark sweep (`--p` = remaining fraction) over the icon, bright 1 px leading edge, number centred (threshold colours, one decimal under 3 s), icon `brightness(.6) saturate(.6)` |
| GCD | `.slot-gcd` | the same sweep at 45 % black, no number |
| ready flash | `.ready` | 600 ms: inner 2 px `--gold-1` outline fading out with `steps(6)` (ElvUI "bling"), only for majors and skills with cooldown ≥ 8 s |
| out of range | `.oor` | red overlay (`rgba(210,40,30,.5)` over the icon) while the target is farther than `range` (+1.5 m melee assist) — COMBAT_WOW §2.12 |
| no resource | `.nores` | blue overlay (`rgba(60,90,230,.55)`), icon desaturated |
| proc / usable glow | `.glow` | gold **marching-ants** ring: 2 px dashes (6 on / 4 off), one revolution per 1.4 s, `#ffe58a` + 8 px outer glow `rgba(255,214,90,.7)`; the button "pops" once on gain (brightness flash 120 ms — no scale) |
| spender hint | `.spend` | soft ants (50 % alpha) when the resource ≥ 90 % |
| queued | `.queued` | 2 px inner white outline ("checked") while the spell queue holds this button |
| casting | `.casting` | 2 px inner `--gold-2` outline |
| failing | `.failing` / `.fail` | 1 px inner `--bad` outline + 2 px horizontal shake (`steps(4)`, 240 ms) |
| school-locked | `.locked` | grey icon + school glyph + remaining seconds centred |
| disabled (stunned / silenced) | `.is-disabled` | grey icon + 45° hatch overlay, no hover |
| socket / new | `.is-socket` / `.is-new` | §2.6.4 |

Every state is a class on the button, set by `ActionBar.update()`; two classes may combine (`.oncd.oor` — the cooldown dominates).

### 2.7 Player frame (ElvUI), buffs, consumables, party

Reference: `wow-elvui-hud-actionbars.png` — *"just left of screen centre, slightly below the middle: a single wide flat health bar with right-aligned text `805K | 100%`, a row of small buff icons above it, consumable icons below it"*. This is the **only** place the player's health and resource appear; the old top-left chip and the board's gauges are gone. The default frame follows the reference literally (one wide bar, no icon block); the 47 px spec icon is an **option** (`Settings.ufIcon`, default off) — the single addition to the reference — and the power strip under the bar is the integrated resource bar the brief asks for (the reference shows none).

**Placement.** `.uf-player` (child of `.hud-uf`, §2.5): `width: var(--uf-w)`; its right edge is `--uf-gap` (132 / 120 / 100 px) left of the screen centre — in CSS `right: calc(50% + var(--uf-gap))`, because a `right` offset is measured from the *right* edge of `.hud-uf`; the top edge of the health bar is at `--uf-top` = 57 % of the HUD height (y = 616 px at 1080p). The centre stays free for the reticle and the character.

```
                                                   ●●●○○      .uf-pips    own line, right-aligned, only while relevant
  [▪][▪][▪][▪][▪][▪][▪][▪] +2                                 .uf-auras   buffs: full frame width, max 8 + "+N" (254 px of 320 at lg)
┌───────────────────────────────────────────────────────┐
│ 24 Gölge Avcısı                           805K | 100% │     .uf-hp      30 px · class-colour fill · name left · value right
├───────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░               82 │     .uf-strip   16 px · power bar · CAST BAR while casting
└───────────────────────────────────────────────────────┘
 [4][5] [6][7][8]                                             .uf-cons    consumables, 32 px squares (§2.6.5)
 [▪][▪]                                                       .uf-debuffs typed 1 px frames, only while debuffed
```

*Optional icon block (`Settings.ufIcon`, default **off**, not drawn): a 47 px spec-icon square at the left of `.uf-main`; the bars shrink by 47 px. Everything else matches the reference.*

```
.uf-player            position: absolute; right: calc(50% + var(--uf-gap)); top: var(--uf-top); width: var(--uf-w)
├─ .uf-top            position: absolute; bottom: calc(100% + 3px); left: 0; right: 0; display: flex; flex-direction: column-reverse; gap: 3px   — the rows above the bar
│  ├─ .uf-auras       display: flex; gap: 1px — buffs, the FULL frame width (8 icons + "+N" need 254 / 238 / 222 px of 320 / 292 / 260, see Buffs below)
│  └─ .uf-pips        display: flex; flex-direction: column; align-items: flex-end; gap: 2px — combo pips / dodge segments; own line above the buff row, no height while idle
├─ .uf-main           display: flex; border: 1px solid #000; background: var(--bg-plate); box-shadow: inset 0 1px 0 var(--hi); click (cursor free) opens the character panel (C)
│  ├─ .uf-icon        OPTIONAL — rendered only while `Settings.ufIcon` (`.uf-player[data-icon="on"]`): square = calc(var(--uf-hp-p) + var(--uf-strip) + 1px) (47 px at lg);
│  │                  spec icon (class icon until a spec is chosen); 1 px #000 right border
│  └─ .uf-bars        flex: 1; display: flex; flex-direction: column; gap: 1px; background: #000 (the gap reads as a 1 px black divider; the bars inside drop their own border)
│     ├─ .uf-hp       .k-bar · height var(--uf-hp-p) · fill = class colour · .k-ghost trail · absorb overlay · text row (below)
│     └─ .uf-strip    .k-bar · height var(--uf-strip) · power bar; replaced by the cast bar while a cast / channel runs
├─ .uf-cons           margin-top: 3px — potion + flask buttons (ActionBar / FlaskRow mount here via PlayerFrame.consHost)
└─ .uf-debuffs        margin-top: 3px — player debuffs, max 8 + "+N"; no height while empty
```

**Health bar (`.uf-hp`).** Flat solid fill in the **class colour** (`--cls-*`, §3.8) on a `rgba(0,0,0,.55)` track, no gloss, no gradient. Text row (`.k-text`, 14 px 700, white, 4-way outline): **left** `{level} {name}` (level `--text-2`, name white, ellipsis; a crown `♛` after the name for the party leader), **right** `{hp} | {pct}%` — `805K | 100%` exactly as in the reference. Number format = **`fmtHealth`** (next paragraph); percent is `ceil` so a living player never shows `0%`. States: **ghost trail** (a lighter underlay `rgba(255,255,255,.28)` holds 400 ms then catches up, λ = 6 — the existing `Bar`/`M2Gauge` logic), **hit pulse** (100 ms `brightness(1.25)`), **absorb** (a translucent white band from the current fill to `hp + shield`, clipped at max), **low** (< 30 %: the 1 px frame border pulses `--bad`, `steps(6)` 1 s loop), **dead** (`grayscale(.9) brightness(.7)`, text `Öldü` centred, strip empty).

**Two number formatters (`ui/widgets/numFormat.ts`, UX-00).** *Health* — `fmtHealth(n)` for unit frames, party rows and absorb text: the value is rounded to the displayed precision first, then the unit is chosen; `< 1000` → integer (`950`); `K` for thousands, `M` from 1 000 000 (a value that rounds to `1000K` is shown as `1,0M`); **one decimal while the number in front of the unit is under 100, none from 100**: `15,2K`, `99,9K`, `805K`, `1,2M`, `120M`. *Meter* — `fmtMeter(n)` for the Details!-style meter (§2.10.1), where rows must be comparable at a glance: `< 1000` → integer, from 1 000 **always exactly one decimal**: `226,9K`, `189,0K`, `5,0K`, `1,2M`, `640,0K`. Both use the tr-TR decimal comma (plain integers use a dot for thousands, `1.234`). The same figure therefore reads `805K` in the player frame and `805,3K` in the meter — on purpose: a unit frame needs a glanceable number, a meter needs comparable ones.

**Power strip (`.uf-strip`).** The class resource, **integrated in the frame** (not a separate board): flat bar in the resource colour (`data-kind` = `rage`, `mana`, `energy`, `focus`, `faith`, `essence`, `fury`, fallback `mana`; tokens §3.2), height `--uf-strip` (16), right-aligned current value (13 px 700, outline; mana as a number, others 0–100). The `ResourceType → kind` map is unchanged: knight / barbarian `rage`, mage / warlock `mana`, rogue / monk `energy`, archer `focus`, paladin `faith`, necromancer `essence`, demonhunter `fury`, evoker `essence`. Pip resources (faith, essence, combo points) additionally show **pips** in `.uf-pips`.

**Cast bar (player).** While the player casts or channels, `.uf-strip` is **replaced** by the cast bar (same box, so nothing moves): fill `--gold-2` (channel: fills backwards; hard-cast / heavy charge: forward), left the skill name (13 px 700), right the remaining time (`1,2`), 1 px white spark at the leading edge; pushback flashes the bar red for 120 ms; uninterruptible / locked casts are grey. The standalone 340 × 26 cast bar above the old board is removed (`PlayerCastBar` keeps its class and API, restyled as this strip).

**Pips (`.uf-pips`).** Right-aligned on **their own line above the buff row** (inside `.uf-top`, so they never compete with the buff icons for width), two sub-lines, each shown **only while relevant**: combo / holy-power / essence pips (12 px round dots, filled `--gold-2` / resource colour, hollow `rgba(255,255,255,.25)`; visible while pips > 0) and the **dodge charges** (2–3 segments of 18 × 6 px, key cap "Shift"; visible while a charge recharges or within 4 s of a roll). Both fade in/out over 300 ms; idle = `display: none`.

**Buffs (`.uf-auras`).** Aura icons (§3.6 `.k-aura`): `--au-lg` squares (28 / 26 / 24), 1 px apart, 1 px #000 border, stack count bottom-right (12 px 700), remaining time centred (12 px 700) **only under 60 s** with the cooldown colour thresholds (< 5 s red, < 60 s yellow), blink under 3 s (existing `stblink`). **Max 8 visible** + a `+N` chip (22 px wide, tooltip lists the rest) — the row spans the full frame width, so 8 icons + the chip need 8 × 28 + 7 + 1 + 22 = **254 px** at `lg` (frame 320), 8 × 26 + 7 + 23 = **238** at `md` (292) and 8 × 24 + 7 + 23 = **222** at `sm` (260): it always fits; order: procs first (they carry the `.glow` marching ants, §2.6.8), then by remaining time ascending, then permanent buffs. Proc buffs show their *specific* icon (COMBAT_WOW §2.7).

**Debuffs (`.uf-debuffs`).** Same icons with a **typed 1 px frame** (`--deb-magic` blue, `--deb-curse` purple, `--deb-disease` brown, `--deb-poison` green, `--deb-none` red); max 8 + `+N` (same widths as the buff row, so it fits). The row has no height when empty.

**Consumables (`.uf-cons`).** See §2.6.5: `[4][5]` potions + equipped flasks, 32 px squares directly under the frame.

**Party frames** (`PartyFrames.ts`, only when ≥ 2 members): ElvUI-style compact list at `.hud-tl`, `--party-w` × 34 per member, **1 px apart**, each = 1 px #000 frame · 26 px **class-colour health bar** (name left 13 px 700 with the role icon — tank shield `--role-tank` / healer cross `--role-heal` / dps sword `--role-dps` — before it, health value or `Öldü` right) · 5 px power strip below · leader crown, targeted outline (1 px `--gold-2`), dispellable-debuff frame (GDD_V2 §1.6). Debuff icons (max 4 × 18 px) sit to the right of the row. Ready-check and cooldown-tracker details are unchanged from GDD_V2 §2.4 / §1.6.

### 2.8 Target, focus and boss frames

Reference: *"just right of centre: thin flat bar with centred `100%`, a row of larger debuff icons under it, plus a second row of smaller icons (stack counts)"*. Followed literally: the bar carries **only the centred percentage**; name, level, target-of-target and the absolute health move into the strip beneath it.

**Placement.** `.uf-target`: `left: calc(50% + var(--uf-gap))`, `top: var(--uf-top)`, `width: var(--uf-w)` — the mirror image of the player stack, so the two frames flank the reticle with `2 × --uf-gap` (264 px at 1080p) between them.

```
┌────────────────────────────────────────────────────────┐
│                          100%                          │    .uf-hp    24 px · fill = reaction colour · centred {pct}% (ref #1)
├────────────────────────────────────────────────────────┤
│ 7 Orman Kurdu                           ▸ Ahmet · 2,4K │    .uf-strip 16 px · name left · target-of-target + health right · 3 px threat bar · CAST BAR while casting
└────────────────────────────────────────────────────────┘
 [▪][▪][▪][▪][▪][▪]                                           own / bright debuffs — 28 px   (.uf-auras-own)
 [▫][▫][▫][▫]                                                 others' debuffs, enemy buffs — 20 px, dimmed   (.uf-auras-oth)
```

- **Health bar.** `.k-bar` 24 px (`--uf-hp-t`), fill = **reaction colour** (`--react-hostile`, `--react-neutral`, `--react-friendly`), same track and ghost trail as the player. Text: **only the percentage, centred** — `100%` (14 px 700, `ceil`), exactly the reference; name, level and absolute health live in the strip below. Rank trim as a 1 px **inner** outline on `.uf-main`: elite `--gold-2`, rare silver `#c0c0d0`, boss `--bad` (with a skull before the level in the strip). Soft target (under the reticle, not locked): opacity 0.78; hard target: 1 px `--gold-2` inner highlight.
- **Strip (`.uf-strip`, 16 px).** Idle: left `{level} {name}` (13 px 700; the level in the **relative-level colour** — grey ≤ −8, green −7…−3, yellow −2…+2, orange +3…+4, red ≥ +5, skull glyph ≥ +10; helper `ui/widgets/levelColor.ts` from GDD_LIFE, create it if missing — the name white, ellipsis), right `▸ {target-of-target name} · {hp}` (13 px 700; the name in class or reaction colour, `{hp}` = `fmtHealth` of the target's absolute health; the `▸ …` part is omitted when the target has no target), a threat-coloured dot before the `▸` (grey → yellow → orange → red, GDD_V2 threat) and, along the bottom edge, a **3 px threat bar**. While the target **casts**: the strip becomes the **target cast bar** — fill `--gold-2` when interruptible, grey `#8a8a92` with a `ui-shield` glyph when not; left spell name, right remaining time; a successful interrupt flashes the bar yellow with the word `Kesildi` for 600 ms. (Same replace-in-place rule as the player: nothing moves; the name returns when the cast ends and stays on the world nameplate meanwhile.)
- **Own debuffs (`.uf-auras-own`).** COMBAT_WOW §2.15: `sourceId === me` first, `--au-lg` (28 / 26 / 24), bright typed frame, stack count bottom-right, timer centred under 60 s with the threshold colours; max 8 + `+N`. **Refresh window:** when `remaining < 30 %` of the duration the frame pulses `--gold-2` (`steps(6)`, 0.9 s) — "refresh now".
- **Others (`.uf-auras-oth`).** Other players' debuffs and enemy buffs (enrage, shield) at `--au-sm` (20 / 18 / 16), 55 % opacity, max 8 + `+N`.
- **Target-of-target (later, CW-19):** `.uf-tot`, 120 × 20 flat bar right of the target frame (`left: calc(100% + 4px)`), name + class / reaction colour.
- **Focus (later, CW-19):** `.uf-focus` under the target stack (`margin-top: 10px`), 220 px wide: 18 px health bar (name left, `%` right), 12 px interruptible cast strip, `focusTarget` binding; absent until a focus exists. The anchor is reserved now so the layout does not move when it ships.

**Boss frame** (`BossFrame.ts`, `.hud-tc`, boss fights only): flat `--boss-w` plate at the top centre: boss name (body font 18 px 700), title 13 px caps, phase chip, **22 px health bar** with 1 px black phase notches at the phase thresholds, enrage chip, battle-revive pips (`RunState.brez`), 18 px cast strip. It no longer sits above the target frame — the target frame stays in the centre cluster during boss fights.

### 2.9 Top-right: minimap + ONE context tracker

**Minimap** (`Minimap.ts`): disc 192 / box 208 × 236 kept. Changes: zoom `+ −` buttons appear only on hover (`.mm:hover .mm-zoom`); the ribbon's second line shows the **zone level band** `Sv. 5–10` coloured relative to the player (green = 3+ above the band top, grey = trivial, yellow = in band, red = band starts 3+ above the player); quest-giver `!`/`?` icons and the objective ring work in **town and world** (§4.5); a small ice-blue **LFG eye** (`ui-compass.svg` tinted) sits at 7 o'clock on the ring while the finder is searching/listing (tooltip `Zindan Bulucu: aranıyor 0:42`). An optional one-line **info text** (`Settings.showMapInfo`, default off — reference #4's clock and `43 FPS | 46 MS`) overlays the bottom-right of the disc and takes no layout height: the local time `14:32` and, while `showFps` is on, ` · 60 FPS | 16 MS` (frame time; the counting code of the removed `FpsCounter` is reused) — 13 px 700 with the outline.

**ContextTracker** (`hud/Tracker.ts`, replaces the stacked `MythicTracker` + `QuestTracker` elements in the column; their inner renderers become its three panes):

| Mode | Auto-selected when | Pane content (max height `--trk-h`: 320 / 240 / 200) |
|---|---|---|
| `boss` | `BossFrame.visible` | boss name, `Faz 2 / 3`, enrage timer, battle-revive pips, up to 2 mechanic hints from `abilityTip(id)` of the boss's recent abilities (line hidden while the table is empty) |
| `run` | `G.mplus.state` exists (dungeon run, M+ or not) and no boss frame | key medallion `+7` (or "N"/"K"/"M" for non-key difficulties), dungeon name, difficulty, affix icons 24 px, timer with +3/+2/+1 thresholds, forces bar 12 px, boss list (done / pending), deaths and penalty |
| `quest` | else, when any quest is active | pinned quest (`getPinnedQuest()` or first active) title + level, ≤ 3 open objective rows, `+N görev daha`, `[L] Görev Defteri` footer |
| `hint` | else (no quest, not in a run) | one card: **"Ne yapmalıyım?"** + the recommended next action text from `recommend()` (§4.6) + `[.]` key cap. The tracker is never empty (fixes D17). |

Layout of a pane (all use `.k-plate`, `--trk-w`, padding 10 × 12, row gap 6):

```
┌ TAKİPÇİ  Görev · Koşu · Boss ───────────── [?] [▾] ┐  header 28 px: title (body 700 13 caps, text-2) · text mode tabs (13 px 700, the meter-tab style) · help · collapse
│ ◆ Fare Yuvası                                 Sv.1 │  title 15 body 700 gold-1; level in relative-level colour
│ ▸ Orman Sıçanı öldür                        3 / 10 │  row: 14 px text · count right (body 700 14)
│   ███████░░░░░░░░░░░░░░░░░                         │  6 px bar under every kill / collect objective
│ ✓ Muhtar Ferhat ile konuş                          │  done row: green, struck, folds away 6 s after completion
│ +2 görev daha                    [L] Görev Defteri │  footer 13 px (illustrative rows)
└────────────────────────────────────────────────────┘
```

Rules: the mode tabs `Görev` · `Koşu` · `Boss` are **text tabs** in the same 13 px 700 style as the meter's tabs (lit = `--text-1` + 2 px `--gold-2` underline, unlit = `--text-3`) — deliberately **not** key caps, because `G` is the `s4` skill, `K` the skill book and `B` the inventory. They show only the modes that currently have content; clicking one **pins** it for 60 s, then auto-selection resumes. If the header does not fit (`--trk-w` 244 / 220 px with three tabs) the title `TAKİPÇİ` is dropped first; at `sm` the tabs become icons (`ui-quest`, `ui-dungeon`, `ui-boss`; tooltip = the name), the same rule as the meter. `[▾]` collapses to the 28 px header; collapsed state is stored per mode in `localStorage['efsun.tracker.v1']`; `sm` density starts collapsed. Clicking the pane opens the matching panel (quest → `questlog`, run → `mplusInfo`, hint → `guide`). The pane never exceeds `--trk-h` (320 / 240 / 200 px); overflow rows are summarised (`+N`), and at `md` / `sm` the `run` pane uses its compact form (boss list → `Boss 2 / 3`, thresholds row hidden) so it fits.

**Kill/quest feedback (fixes D21):** the tracker diffs `QuestSystem.progressRows()` against the previous frame; when a row's `have` rises it (a) flashes the row for 600 ms, (b) animates the bar fill (200 ms, `steps(6)` for the PSX feel), and (c) pushes a line into `QuestFeed` (centre, §2.11): `Orman Kurdu: 3 / 8`. When a row completes the line turns green with a ✓ and plays `ui_confirm` at 0.4. `quest:updated` with `state: 'ready'` shows `Görev tamamlandı — teslim et: Muhtar Cemal` once.

### 2.10 Bottom-right corner and the Details!-style meter

`.hud-br` is a right-aligned column. Top → bottom: **loot feed**, **damage meter** (absent from the flow while hidden), **gold chip**, **micro row**. The old DPS pill is gone. The tip card is not part of this column (it sits above the chat, §2.5), and the column has a fixed vertical budget (below).

- **Loot feed** (`LootFeed`, `Corner.ts`): max **5 / 4 / 3** lines (`lg` / `md` / `sm`; was 7), lifetime 4 s (rare+ 7 s), identical items merge into `×N`, gold lines merge (existing), an item that is an upgrade for its equipped slot (higher `itemLevel`) shows a green `▲`. Flat look: line height 28, body font 15, a `rgba(10,10,12,.7)` strip with a 2 px **rarity-coloured left stripe** and the item name in the rarity text colour (`--rar-*-text`).
- **Gold chip:** `.k-chip` 24 px, coin icon + amount (body font 14 700, `--gold-1`), right aligned; floating `+N` / `−N` deltas unchanged.
- **Micro menu** (`MicroMenu`): **one row** of `--micro` px flat square buttons (`.k-btn` family, 1 px #000 border, `--bg-3`, glyph icon; hover = 1 px `--gold-2` border), 2 px apart, 70 % opacity until hovered, 100 % when it carries a badge; revealed progressively:

| Button | Icon | Key | Shown when | Badge |
|---|---|---|---|---|
| Çanta | `ui-bag` | **B** | always | yellow dot when the bag is ≥ 90 % full |
| Karakter | `ui-character` | C | always | – |
| Harita | `ui-map` | M | always | – |
| Grup | `ui-party` | O | always | invite / ready-check dot |
| Yetenekler | `ui-passive-tree` | N | level ≥ 2 | unspent-point count (reuses `TalentBadge`) |
| Yetenek Kitabı | `ui-spellbook` | K | level ≥ 3 | `!` when a learned skill is not on the bar |
| Görevler | `ui-quest` | L | first quest accepted | `?` when a quest is ready |
| Zindan Bulucu | `ui-dungeon` | **I** | level ≥ 8 | ice-blue eye while queued |
| Menü | `ui-gears` | Esc | always | – |

Level-1 character: Çanta, Karakter, Harita, Grup, Menü = **5 buttons**. At 9 buttons the row is `9 × 32 + 8 × 2 = 304` px (fits 330). The M+ info button (J) is not in the row (reachable from the finder and the game menu); it appears only at level ≥ 50.

- **"Arayüzü Düzenle" button:** removed from the HUD. Entry points: Esc menu button, Settings › Arayüz, chat command `/arayuz` (GDD_LIFE command table gets it), and `HudApi.startEdit()` stays. (Package UX-13 removes the button; UX-52a adds the menu / settings entries; UX-31 handles the local `/arayuz` and `/zindan` commands next to `/temizle` until GDD_LIFE's `ChatCommands.ts` exists.)
- **FPS counter:** the bottom-right `FpsCounter` is removed; `PerfOverlay` (F3 / `showFps`) stays the detailed readout, and the optional one-line `60 FPS | 16 MS` of the minimap (§2.9, `Settings.showMapInfo`) reuses the removed counter's logic.

#### Right-edge vertical budget (what keeps the two right-hand stacks apart)

The right edge holds two stacks that must never meet: the **top** stack (`.hud-tr`: gut + minimap 236 + 12 + the tracker pane, capped at `--trk-h`) and the **bottom** stack (`.hud-br`: loot + meter + gold chip + micro row + gut). Every element has a cap that depends on the density; the worst case — everything at its cap at once — is verified below (HUD heights 1080 / 900 / 960 are those of a 1920×1080, 1280×720 and 1024×768 window):

| | `lg` | `md` | `sm` |
|---|---:|---:|---:|
| Tracker pane cap `--trk-h` | 320 | 240 | 200 |
| **Top stack bottom** = gut + 236 + 12 + `--trk-h` | 16 + 236 + 12 + 320 = **584** | 14 + 236 + 12 + 240 = **502** | 12 + 236 + 12 + 200 = **460** |
| Loot lines (28 px, 1 px apart) | 5 → 144 | 4 → 115 | 3 → 86 |
| Meter = head 20 + title 16 + rows + borders 2 (+ death strip n × 18 + 4) | 20 + 16 + 94 + 2 + 58 (3 deaths) = 190 | 20 + 16 + 94 + 2 + 40 (2 deaths) = 172 | single column: 20 + 16 + (8 × 16 + 7) + 2 = 173, no strip |
| Gold chip · micro button (`--micro`) | 24 · 32 | 24 · 30 | 24 · 28 |
| **Bottom stack height** = micro + 8 + gold + 8 + meter + 8 + loot + gut | 32 + 8 + 24 + 8 + 190 + 8 + 144 + 16 = 430 | 30 + 8 + 24 + 8 + 172 + 8 + 115 + 14 = 379 | 28 + 8 + 24 + 8 + 173 + 8 + 86 + 12 = 347 |
| Bottom stack top = HUD height − height | 1080 − 430 = **650** | 900 − 379 = **521** | 960 − 347 = **613** |
| **Clearance** (bottom top − top bottom) | **66** | **19** | **153** |

Consequences: `LootFeed` reads its line cap from `HudApi.density` (5 / 4 / 3), the meter's death strip is 3 / 2 / 0 rows, the tracker pane honours `--trk-h` (compact `run` pane, §2.9), and the optional minimap info text (§2.9) is an overlay that adds no height. A 1366×768 window (HUD 1707 × 960) and anything taller than 900 css px only add clearance.

#### 2.10.1 Damage / healing meter (Details!-style, `DamageMeter.ts`)

Reference: `docs/ref/ui/wow-details-dps-hps-meter.png` — two side-by-side lists "DPS" and "HPS", five rows each: **spec icon at the left, a full-width bar in the class colour, the value right-aligned in white (`226,9K`), rows ~18 px**, a plain small header, a *Deaths* mini-list below. The data layer of `DamageMeter.ts` (segments `Mevcut Dövüş` / per boss / `Tüm Koşu`, per-player `dealt / healed / taken / deaths`, event-driven, 4 Hz repaint) is **kept**; only the presentation is replaced.

```
┌──────────────────────────────────────────────────────────┐
│ Hasar  İyileştirme  Ölümler         Mevcut Dövüş 02:14 ▾ │   .dm-head  20 px · tabs left · segment right
├────────────────────────────┬─────────────────────────────┤
│ DPS                 Σ 1,2M │ HPS                Σ 640,0K │   .dm-title 16 px · plain text · fight total right
│[ic]█████████████████ 226,9K│[ic]█████████████████  189,0K│   rows: icon 18×18 + bar (class colour) · name left · value right
│[ic]███████████████   217,2K│[ic]████████████       147,3K│
│[ic]███████████       196,3K│[ic]███                 15,2K│
│[ic]████████          138,7K│[ic]██                  10,1K│
│[ic]███                50,5K│[ic]█                    5,0K│
├────────────────────────────┴─────────────────────────────┤
│ ☠ Ahmet   02:03   Kurt Reisi                             │   .dm-deaths  3 rows (lg) / 2 (md), only while the segment has deaths
└──────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Window | `.dm`, width `2 × --dm-col + 4` (396 / 356) on `lg` / `md` and `--dm-col` (172) on `sm` (single views only there), columns 4 px apart, `background: rgba(10,10,12,.35)` per column (80 % on hover), 1 px #000 frames. A layout-editor frame (`meter`), `Shift+D` toggles it (as today). |
| Header (`.dm-head`) | 20 px, `rgba(10,10,12,.8)`. Three **tabs** `Hasar` · `İyileştirme` · `Ölümler` (13 px 700; unlit `--text-3`, lit `--text-1` + 2 px `--gold-2` underline) and, right-aligned, the segment label `Mevcut Dövüş 02:14 ▾` (13 px, `--text-3`; opens the existing segment dropdown, which also holds the `Alınan Hasar` mode). Below 220 px of window width (`sm`, 172 px) the tabs show their icons only (`skill-sword-slash`, `skill-heal`, `ui-skull`, tooltip = the name) and the segment label is hidden. |
| Views | `split` (default; **Hasar** and **İyileştirme** lit — left column DPS, right column HPS, exactly the reference), `damage`, `healing` (one column across the full window width, 8 rows), `deaths` (full list). Clicking an unlit tab opens that single view; clicking the lit tab of a single view returns to `split`; `Ölümler` always opens the full death list. `sm` offers the single views only and opens in `damage`. Stored in `efsun.dpsMeter.v3` (`{ view, segment }`); the v2 key (pill / window position) is ignored on purpose. |
| Row (`.dm-row`) | height `--dm-row` (18 / 18 / 16), 1 px apart. **Icon** `--dm-row` square at the left (spec icon from `vfx/specIcons.ts`, class icon when the spec is unknown). **Bar** fills the rest: track `rgba(0,0,0,.45)`, fill = **class colour** (`--cls-*`, 90 % mixed with black — the reference's flat saturated bars), width = value / top value (the leader is 100 %). Text over the bar, 13 px 700, white, 4-way outline: **name** left (ellipsis), **value** right-aligned via **`fmtMeter`** (§2.7: always exactly one decimal from 1 000 — `226,9K`, `189,0K`, `1,2M`; decimal comma — not the health formatter, which would print `805K`). The local player's row has a 1 px inner white outline. Fill animation 250 ms `steps(5)` (PSX stepped); rows re-sort instantly. |
| Rows shown | top 5 per column in `split` (8 in a single view). The local player is **always visible**: when outside the shown ranks the last row is replaced by the player's own row prefixed with the rank (`7. Sen`). |
| Value | **per second** over the segment duration (DPS / HPS), the column title shows the total (`Σ 1,2M`); the row tooltip (existing `st-kind`) keeps the long form `Hasar 1,2M · 226,9K/sn · %31`. |
| Death list | `☠ {name}  mm:ss  {killer / skill}`, 13 px, `--bad` skull, newest first, max 3 (`lg`) / 2 (`md`) in the split view and 8 in the `deaths` view; `sm` has no strip (single views only). |
| Colours | `classColor(classId)` → `--cls-*`; unknown class `#8a8a8a`. The meter's private `CLASS_COLOR` table is deleted. |

**Visibility (`Settings.meterVisibility`, default `auto`).** `auto` — shown while the local player is in a party of ≥ 2, **or** inside a dungeon scene, **or** has been in combat in the last 15 s (so a solo player sees their DPS against a target dummy / pack, and it fades out 400 ms after 15 s without combat); never in town while idle. `always` — always shown. `never` — hidden, `Shift+D` still opens the window. A hidden meter takes no space in `.hud-br`. The window is click-through for the bar list unless the cursor is free (existing behaviour).

### 2.11 Centre layer, combo counter and the message hierarchy

**Message hierarchy (one big banner at a time, small ones in parallel):**

| Rank | Message | Y position | Duration | Widget |
|---|---|---|---|---|
| 1 | Boss intro / yell | 29 % | 5.5 s | `BossFrame.yellEl` (unchanged) |
| 2 | Level-up | 30 % | 4.2 s | `LevelUpBanner` |
| 3 | Quest accepted / completed (**new**) | 17 % | 2.4 s | `QuestBanner` (medallion `!` / ✓ + `Görev Alındı: Fare Yuvası`) |
| 4 | Zone title | 12 % | 4.3 s | `ZoneBanner` |
| 5 | World announce (metin / rare / boss) | 21 % | stack | `WorldAnnounce` — held back while rank 1–4 is on screen |
| small | Toast (`ui:toast`) | 26 % | 2.4 s, max 2 visible, de-duplicated | `Toasts` |
| small | Quest progress feed (**new**) | 36 % | 2.2 s, max 3 lines | `QuestFeed` |
| small | Interaction prompt | bottom 31 % | while in range | `InteractPrompt` |
| small | Combat cues (parry, riposte, finisher) | around the reticle | as today | `CombatCues` |

A tiny `BannerQueue` in `Banners.ts` serialises ranks 2–5 (a lower-rank banner waits until the higher one ends, max queue length 3, oldest low-rank dropped). Ready check (17 %) is modal-like and bypasses the queue.

**Combo counter** (`ComboCounter.ts`): anchor `.hud-ml` (`left: 48; top: 40%`), width 280. Appears from **3 hits**, fades 2.5 s after the last hit. Sizes: number 40 px (tier 1) → 56 px (tier 3+), rank word 20 px; the `label`, `bonus` and `total` lines are shown only from tier 2; the timer bar is 4 px × 160. All colours via tokens, numbers in the body font 700 (not Cinzel); the existing slam/pop/rainbow animations are kept.

### 2.12 Visibility matrix

| Element | Default | Shown when | Hidden / removed when |
|---|---|---|---|
| Player frame (health, power strip, cast bar) | on | in game | edit mode keeps it |
| Player-frame spec icon block | **off** | Settings › Arayüz › `Oyuncu simgesi` (`ufIcon`) | – |
| Buff row (above the player frame) | on (empty = no height) | any buff | none |
| Debuff row (below the consumables) | on (empty = no height) | any debuff | none |
| Consumable strip `[4][5] [6][7]…` | on (potions always) | potions always; a flask button only while that belt slot is equipped | – |
| Pips / dodge segments (`.uf-pips`) | off | pips > 0 / a dodge charge recharging or ≤ 4 s after a roll | idle |
| Party frames | off | ≥ 2 party members | solo |
| Action grid row 1 | on | in game | – |
| Slots Q E R 1 2 3 G | **off** | learned (§2.6.4) | – |
| Majors X V T | **off** | spec + level (§2.6.4) | – |
| Ghost cells (empty dark slots) | **off** (`barGhostSlots`) | Settings › Arayüz › "Boş yuvaları göster" | – |
| XP strip | on | below max level | max level |
| Talent badge `N` | off | unspent points | none |
| Target frame | off | soft / hard target | no target |
| Focus frame | off (later, CW-19) | a focus is set | – |
| Boss frame | off | boss fight | – |
| Minimap | on | in game | – |
| Context tracker | on | always (4 modes, never empty) | player collapsed it |
| Combo counter | off | ≥ 3 hits | 2.5 s idle |
| Tip card | off | a tip fires (§4.7) | dismissed / timed out |
| Objective arrow | on | pinned objective has a position | arrived, no objective, panel open |
| Chat | on (transparent) | always | – |
| Chat stats line (`Kritik · Hız · Soğuma · Kaçınma`) | **off** | Settings › Arayüz › `İstatistik satırı` (`showStats`) | – |
| Minimap clock / FPS text | **off** | Settings › Arayüz › `Minimap saati` (`showMapInfo`) | – |
| Loot feed | off | pickups | 4–7 s |
| **Damage / healing meter** | **auto** | party ≥ 2, **or** a dungeon scene, **or** combat within the last 15 s (§2.10.1) | solo idle, town idle; `never` |
| Gold chip | on | always | – |
| Micro menu | on (progressive) | §2.10 | – |
| Extra bars Çubuk 2/3 | **off** (already default) | Settings › Arayüz toggle / edit mode | – |
| "Arayüzü Düzenle" | **removed** | – | – |
| FPS | off | F3 / `showFps` | – |

### 2.13 Layout editor and `layoutStore` changes

- **Frame ids** stay: `player` (the player-frame stack: bars, consumables, debuffs), `buffs` (the buff row, default attached above `player`), `party`, `target` (the target stack), `boss`, `minimap`, `combo`, `chat`, `meter` (the Details!-style window), `bottom` (the main action grid), `loot`, `corner`, `bar2`, `bar3`. `mplus` is **renamed `tracker`**. New: none (the objective arrow, tip card, quest feed and XP strip are not movable).
- `layoutStore.ts` key becomes `efsun.uiLayout.v2` and `UiLayout.v = 2`. On first read it loads `efsun.uiLayout.v1` once and migrates: keep `grid`, `locked`, `bars`; keep frame offsets for `boss`, `minimap`, `combo`, `chat`, `loot`, `party`, `bar2`, `bar3`; map `mplus → tracker`; **drop** `bottom`, `player`, `buffs`, `target`, `meter`, `corner` (their position or anatomy changed: centre cluster, 12-slot grid, meter window). The v1 key is left untouched.
- Because zones now position everything with `var(--gut)` anchors, offsets stay fractions of the window (unchanged semantics).
- Edit mode toolbar (`EditMode.ts`) gets: a **"Varsayılana Dön"** button per frame (existing global reset stays), a density read-out (`Yoğunluk: Orta`), and the extra-bar visibility toggles (already there). The editor is entered from the Esc menu / Settings, not from a HUD button.

---

## 3. Visual design system ("ElvUI")

### 3.1 Language in one paragraph

**One material: flat, dark, translucent glass — the ElvUI / modern-WoW look.** Surfaces are neutral near-black at **75–92 % opacity** (`rgba(10,10,12,.75–.92)`), edged by a **1 px `#000` border** and lifted by a **subtle 1 px inner top highlight** (`inset 0 1px 0 rgba(255,255,255,.06)`); corners are square (radius 0 on the HUD, 2 px on windows and buttons); there is no bevel, no gradient on bars (flat fills), no carved or ornamental frame. Colour carries **information, not decoration**: bars use the **class colour** (health of players, meter bars) or the **resource / reaction colour**, item frames use the **rarity colour**, numbers use the **damage-school colour**; **gold is an accent only** (selected-tab underline, legendary, quest titles, focus and "new" rings, proc glow), never the frame material. Text is a **clean condensed sans-serif** (Roboto Condensed, fallback PT Sans Narrow) with a crisp 1 px black outline; **Cinzel / Cinzel Decorative appear only in big titles** (zone banner, level-up, boss yell, welcome card, finder dungeon banner, countdown). **PSX rule:** the 3D scene keeps its PSX look; the UI on top is rendered **crisp** — whole-pixel geometry, nearest-neighbour bitmaps, 1 px lines, stepped animations, no blur (§3.12). Interactive things brighten (border → accent, background +1 step), inactive things dim.

### 3.2 `src/ui/styles/tokens.css` (new — copy as written)

Imported **first** by `ui/UI.ts` (after `main.ts` has imported `base.css`, so the legacy aliases below win). No component hard-codes a colour that exists here. **Fonts:** `npm i @fontsource/roboto-condensed @fontsource/pt-sans-narrow` and, next to the existing `@fontsource/cinzel*` imports in `src/main.ts`, `import '@fontsource/roboto-condensed/400.css'; import '@fontsource/roboto-condensed/700.css'; import '@fontsource/pt-sans-narrow/400.css'; import '@fontsource/pt-sans-narrow/700.css';` (each file bundles the `latin-ext` subset by `unicode-range`, which carries the Turkish `ğ ş ı İ ç ö ü`). The Google Fonts equivalent for a plain HTML dev page is `<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&family=PT+Sans+Narrow:wght@400;700&subset=latin,latin-ext&display=swap" rel="stylesheet">`.

```css
:root {
  /* ---- surfaces: flat, dark, translucent, neutral ---- */
  --bg-0: #050507;                        /* void (solid): behind translucent fills, bar tracks on opaque pages */
  --bg-1: rgba(8, 8, 10, 0.88);           /* wells: slots, inputs, gauge tracks */
  --bg-2: rgba(10, 10, 12, 0.90);         /* window / panel base */
  --bg-3: rgba(18, 18, 22, 0.88);         /* cards, buttons, raised rows */
  --bg-4: rgba(30, 30, 36, 0.92);         /* hover, active tab */
  --bg-5: rgba(46, 46, 54, 0.95);         /* highlight, key-cap face */
  --bg-plate: rgba(10, 10, 12, 0.80);     /* HUD plates, unit-frame backs (more see-through than windows) */
  --bg-scrim: rgba(0, 0, 0, 0.35);        /* behind action-bar rows, meter columns, chat on hover */
  --ink: #000000;                         /* THE border colour: 1 px, everywhere */
  --hi: rgba(255, 255, 255, 0.06);        /* the 1 px inner top highlight */
  --line: rgba(255, 255, 255, 0.10);      /* hairline dividers inside panels */

  /* ---- accent: gold, used sparingly (selection, legendary, quest titles, focus / new / proc rings) ---- */
  --gold-1: #ffe7a3;   /* bright text on dark, hover line */
  --gold-2: #e8c46a;   /* primary accent */
  --gold-3: #c9a24a;   /* accent shade, hover border */
  --gold-4: #9b7b36;   /* primary-button line */
  --gold-5: #5a4522;   /* deep accent (legacy alias target) */

  /* ---- text ---- */
  --text-1: #f2f2f4;   /* primary (17 : 1 on bg-2) */
  --text-2: #cfcfd6;   /* secondary (12 : 1) */
  --text-3: #9e9ea8;   /* dim (7 : 1) */
  --text-4: #70707a;   /* disabled only (4 : 1) */

  /* ---- status / role ---- */
  --ok: #4fe06a;  --warn: #ffa83a;  --bad: #ff4c3c;  --info: #4da3ff;
  --role-tank: #4da3ff;  --role-heal: #4fe08c;  --role-dps: #e8574a;

  /* ---- class colours (WoW-style, one per class; mirrored in ui/widgets/classColors.ts) ---- */
  --cls-knight: #c79c6e;       /* Warrior tan        */  --cls-barbarian: #ff7c0a;   /* Druid orange      */
  --cls-mage: #3fc7eb;         /* Mage light blue    */  --cls-rogue: #fff569;       /* Rogue yellow      */
  --cls-monk: #00ff98;         /* Monk spring green  */  --cls-archer: #abd473;      /* Hunter green      */
  --cls-paladin: #f58cba;      /* Paladin pink       */  --cls-necromancer: #c41e3a; /* Death Knight red  */
  --cls-warlock: #8788ee;      /* Warlock violet     */  --cls-demonhunter: #a330c9; /* Demon Hunter      */
  --cls-evoker: #33937f;       /* Evoker teal        */

  /* ---- resources (WoW power colours) ---- */
  --res-hp: #d23a3a;  --res-mana: #2f7bff;  --res-rage: #e03a2a;  --res-energy: #f0e04a;
  --res-focus: #ff8a3c;  --res-faith: #f5e6a0;  --res-essence: #4fd6c0;  --res-fury: #c842fc;  --res-xp: #8a4fe0;

  /* ---- unit reaction, debuff types ---- */
  --react-hostile: #c84040;  --react-neutral: #d9c45c;  --react-friendly: #4ab04d;
  --deb-magic: #3c9bed;  --deb-curse: #a64bd0;  --deb-disease: #b07a2a;  --deb-poison: #3fbf3f;  --deb-none: #cc3333;

  /* ---- rarity (WoW, = RARITY_COLORS) + readable text variants for dark UI ---- */
  --rar-poor: #9d9d9d;  --rar-common: #ffffff;  --rar-uncommon: #1eff00;  --rar-rare: #0070dd;
  --rar-epic: #a335ee;  --rar-legendary: #ff8000;  --rar-set: #00d5a0;
  --rar-rare-text: #4da3ff;  --rar-epic-text: #c27bff;     /* TEXT on dark; borders / glows use the base colours */

  /* ---- damage schools (= COMBAT_WOW §2.11 combat-text colours) ---- */
  --dmg-physical: #fff1d0; --dmg-fire: #ffa040; --dmg-frost: #8fe3ff; --dmg-lightning: #fff05a; --dmg-shadow: #c58cff;
  --dmg-poison: #8cff70;   --dmg-holy: #fff3a8; --dmg-arcane: #ff8fee; --dmg-true: #ff5a5a;

  /* ---- type ---- */
  --font-title: 'Cinzel Decorative', 'Cinzel', serif;      /* BIG TITLES ONLY (>= 32 px): zone, level-up, boss yell, welcome, finder banner, countdown */
  --font-body: 'Roboto Condensed', 'PT Sans Narrow', 'Arial Narrow', 'Segoe UI', sans-serif;   /* everything else */
  --font-head: var(--font-body);                            /* legacy name: headings, numbers, buttons, key caps are body 700 now */
  --fs-12: 12px; --fs-13: 13px; --fs-14: 14px; --fs-15: 15px; --fs-17: 17px;
  --fs-20: 20px; --fs-24: 24px; --fs-32: 32px; --fs-48: 48px; --fs-64: 64px;

  /* ---- space / radius ---- */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-0: 0; --r-1: 2px; --r-pill: 999px;                    /* HUD = 0, windows / buttons = 2 px, pills only for count chips */

  /* ---- shadows ---- */
  --sh-text: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000;   /* crisp 4-way 1 px outline (ElvUI "OUTLINE" font flag) */
  --sh-pop: 0 8px 24px rgba(0, 0, 0, 0.6);                               /* windows only */
  --glow-gold: 0 0 8px rgba(255, 214, 90, 0.55);

  /* ---- motion ---- */
  --t-fast: 90ms; --t-base: 140ms; --t-slow: 280ms;
  --ease-std: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-out: cubic-bezier(0.2, 0.9, 0.3, 1);  --ease-pop: var(--ease-out);

  /* ---- LEGACY ALIASES (do not delete; old CSS keeps working and follows the new palette) ---- */
  --gold: var(--gold-2);  --gold-dim: var(--gold-4);  --gold-bright: var(--gold-1);
  --hud-gold: var(--gold-2); --hud-gold-d: var(--gold-4); --hud-gold-dd: var(--gold-5); --hud-gold-l: var(--gold-1);
  --text: var(--text-1);  --text-dim: var(--text-3);
  --metal-0: var(--bg-0); --metal-1: var(--bg-1); --metal-2: var(--bg-2); --metal-3: var(--bg-4);
  --shade: var(--sh-text);
  --panel-bg: var(--bg-2);  --panel-bg-2: var(--bg-3);  --panel-border: #000;     /* menu.css: login / character select */
  --hp: var(--res-hp); --hp-dark: #4a1010; --mana: var(--res-mana); --rage: var(--res-rage); --energy: var(--res-energy); --xp: var(--res-xp);
  --danger: var(--bad);
  --poor: var(--rar-poor); --common: var(--rar-common);
  --uncommon: var(--rar-uncommon); --rare: var(--rar-rare); --epic: var(--rar-epic); --legendary: var(--rar-legendary); --set: var(--rar-set);
  --font-ui: var(--font-body);
}
```

Token count: **73** colour tokens (8 surface, 3 line / border, 5 gold, 4 text, 7 status / role, 11 class, 9 resource, 3 reaction, 5 debuff, 9 rarity, 9 damage) — the "≤ 75" budget of §0.2. Components may derive tints with `color-mix(in srgb, var(--x) N%, …)`; they may **not** introduce new hex literals except inside the snippets of this document (`#fff`, `#000`, the ants / overlay / threshold colours below) and the chat-channel colours `--ch-*` of §5.1 (ten channels, nine distinct values — `boss` = `yell`; defined once on `:root` in `hud-chat.css`; the speech bubbles reuse them instead of inventing their own).

TypeScript mirror (one table, replaces `CLASS_META` colours in `PlayerFrame.ts`, `CLASS_COLOR` in `DamageMeter.ts` and the `color` fields read by `classColor()`): `ui/widgets/classColors.ts` exports `CLASS_COLORS: Record<string, string>` with exactly the eleven `--cls-*` values and `classColor(id)`, falling back to `--gold-2`. A dev assert compares each entry with `getComputedStyle(document.documentElement).getPropertyValue('--cls-' + id)` once at boot.

### 3.3 Frames — `src/ui/styles/kit.css` (new): `.k-frame`, `.k-plate`, `.k-card`, `.k-well`, `.k-bar`

| Class | Use | Recipe |
|---|---|---|
| `.k-frame` | windows (panels), dialogs | `--bg-2` (90 %), 1 px `--ink`, radius 2, inner top highlight, pop shadow |
| `.k-plate` | HUD widgets (tracker, tip card, boss, party rows, unit-frame backs) | `--bg-plate` (80 %), 1 px `--ink`, radius 0, inner top highlight |
| `.k-card` | inset content blocks inside windows | `--bg-3`, 1 px `--ink`, inner top highlight, padding 12 |
| `.k-well` | holes: slots, inputs, bar tracks | `--bg-1`, 1 px `--ink`, faint inner 1 px |
| `.k-bar` | every gauge (§3.7) | flat fill on a dark track |

```css
.k-frame {
  position: relative; background: var(--bg-2); border: 1px solid var(--ink); border-radius: var(--r-1);
  box-shadow: inset 0 1px 0 var(--hi), inset 0 0 0 1px rgba(255, 255, 255, 0.03), var(--sh-pop);
  color: var(--text-1); font-family: var(--font-body);
}
.k-plate {
  background: var(--bg-plate); border: 1px solid var(--ink); border-radius: var(--r-0);
  box-shadow: inset 0 1px 0 var(--hi); color: var(--text-1);
}
.k-card { background: var(--bg-3); border: 1px solid var(--ink); border-radius: var(--r-0); box-shadow: inset 0 1px 0 var(--hi); padding: var(--sp-3); }
.k-well { background: var(--bg-1); border: 1px solid var(--ink); border-radius: var(--r-0); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03); }
```

Rules: a plate never nests another plate (use `.k-card`); window bodies use cards and wells; **no** dither, rivets, gradients or ornaments on any frame; translucency is the only depth cue — there is **no `backdrop-filter`** (perf and the PSX rule), so text on translucent plates always carries `--sh-text` where the scene can shine through.

### 3.4 Typography

| Role | Token / size | Font | Where |
|---|---|---|---|
| Display | `--fs-64` (+ 3 named exceptions: `.cd-num` 190, `.lvlup-num` 96, `.zone-title` 56) | `--font-title` 700 | countdown, level-up, zone banner |
| Title | `--fs-32` (welcome title, finder dungeon banner) / `--fs-48` (boss yell) | `--font-title` 700 | welcome card, boss yell, finder banner |
| H1 | `--fs-24` | body 700, `letter-spacing: .04em` | run-summary heading, big numbers (timer 30 → `--fs-32`) |
| H2 / boss name | `--fs-20` | body 700 | boss frame name 18, card headings |
| Window title | `--fs-15` | body 700, uppercase, `.08em`, `--text-1` | `.k-title` (§7.1) |
| Subhead / names | `--fs-17` | body 700 | card titles, dialog names |
| Body (panels, chat, tooltips) | `--fs-15` | body 400 / 700, `line-height 1.35` | all running text |
| HUD text | `--fs-14` | body 700 | unit-frame name + value, tracker rows, buttons, chips |
| Secondary | `--fs-13` | body 400 / 700 | hints, footers, strip values, meter rows, sub-labels |
| Micro labels | `--fs-12` | body 700, outline | **only** key labels on buttons, aura stack counts / timers, `YENİ` chips, `.k-key--dim` |

Rules: nothing carrying information is below `--fs-13` except the micro labels above; the condensed face runs ~8 % smaller than Alegreya at equal size, so the HUD scale is one step up (HUD 14, body 15); `font-variant-numeric: tabular-nums` on every counter, timer, bar value and meter value; `font-synthesis: none`; letter-spacing only on uppercase (`.04–.08em`); `Cinzel Decorative` is never used below 32 px and **no other text uses a serif**; Turkish dotted/dotless `İ ı` must stay (never `text-transform: uppercase` on strings without `lang="tr"` — set `lang="tr"` on `#ui-root` and use `toLocaleUpperCase('tr-TR')` in code). Numbers use the tr-TR decimal comma (`2,4K`, `12,3%`), thousands with a dot (`1.234`).

Classes (kit.css): `.k-display .k-title .k-h1 .k-h2 .k-h3 .k-sub .k-body .k-hud .k-small .k-num` set family + size + weight + colour; `.k-dim` = `--text-3`; `.k-good/.k-bad/.k-warn` = status colours.

### 3.5 Buttons, tabs, chips, key caps

```css
.k-btn { height: 28px; padding: 0 14px; font: 700 var(--fs-14)/1 var(--font-body); letter-spacing: .03em; color: var(--text-1); text-shadow: var(--sh-text);
  background: var(--bg-3); border: 1px solid var(--ink); border-radius: var(--r-1); box-shadow: inset 0 1px 0 var(--hi); cursor: pointer;
  transition: background var(--t-fast), box-shadow var(--t-fast), color var(--t-fast); }
.k-btn:hover { background: var(--bg-4); color: #fff; box-shadow: inset 0 0 0 1px var(--gold-3); }
.k-btn:active { background: var(--bg-2); transform: translateY(1px); }
.k-btn:focus-visible { outline: 1px solid var(--gold-2); outline-offset: 1px; }
.k-btn[disabled] { opacity: .45; cursor: not-allowed; }
.k-btn--primary { background: color-mix(in srgb, var(--gold-2) 18%, var(--bg-3)); color: var(--gold-1); box-shadow: inset 0 0 0 1px var(--gold-4); }
.k-btn--primary:hover { background: color-mix(in srgb, var(--gold-2) 30%, var(--bg-3)); box-shadow: inset 0 0 0 1px var(--gold-2); }
.k-btn--danger  { background: color-mix(in srgb, var(--bad) 22%, var(--bg-3)); color: #ffd9d4; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bad) 60%, #000); }
.k-btn--ghost   { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
.k-btn--lg { height: 36px; padding: 0 20px; font-size: var(--fs-17); }  .k-btn--sm { height: 22px; padding: 0 10px; font-size: var(--fs-13); }

.k-tabs { display: flex; gap: 1px; border-bottom: 1px solid var(--ink); }
.k-tab { height: 30px; padding: 0 14px; font: 700 var(--fs-13)/1 var(--font-body); letter-spacing: .06em; text-transform: uppercase; color: var(--text-3);
  background: var(--bg-2); border: 1px solid var(--ink); border-bottom: 0; cursor: pointer; }
.k-tab:hover { color: var(--text-1); background: var(--bg-3); }
.k-tab.is-active { color: var(--text-1); background: var(--bg-4); box-shadow: inset 0 -2px 0 var(--gold-2); }
.k-tab .k-badge { margin-left: 8px; }                       /* unread / count dot */

.k-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; font: 700 var(--fs-13)/1 var(--font-body);
  color: var(--text-1); background: var(--bg-1); border: 1px solid var(--chip-c, var(--ink)); border-radius: var(--r-1); }
.k-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-1); font: 700 var(--fs-13)/18px var(--font-body); text-align: center; color: #15110a; background: var(--gold-2); }
.k-key { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 7px; font: 700 var(--fs-14)/1 var(--font-body); color: var(--text-1);
  background: var(--bg-5); border: 1px solid var(--ink); border-bottom-width: 3px; border-radius: var(--r-1); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14); }
.k-key--dim { min-width: 0; height: 16px; padding: 0 4px; font: 700 var(--fs-12)/14px var(--font-body); color: var(--gold-1); background: rgba(0, 0, 0, .6); border: 1px solid var(--ink); border-radius: 0; box-shadow: none; }
.k-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: #4a4a54 transparent; }
.k-sep { height: 1px; background: var(--line); }
```

### 3.6 Icon, slot and aura frames — and every slot state (ready to paste)

- **Glyph icons:** the white game-icons SVG is a **mask** over a **flat** fill (`.ico` in `hud.css` stays): `background: var(--tint)` — no gradient (§3.12 rule 4); sizes 16 / 20 / 24 / 32 / 48 (`.k-ico-16 … .k-ico-48`). `--tint` is the damage-school, role or rarity colour.
- **Slot** (`.k-slot`: action buttons `.ab-btn`, consumables, the skill-book bar editor, finder role pips, item slots): a square cell, 1 px `--ink` border, `--bg-1` fill, art inset with an 8 % zoom crop (`background-size: 108%`), **never scaled**. Item slots set `data-rarity="…"` → border colour `--rar-*` (epic and above add a 6 px glow).
- **Aura** (`.k-aura`: buffs, debuffs): same cell at `--au-lg` / `--au-sm`; debuff types set `data-deb` → border colour `--deb-*`.

```css
.k-slot { --sz: var(--ab-btn, 44px); position: relative; flex: none; width: var(--sz); height: var(--sz); background: var(--bg-1);
  border: 1px solid var(--ink); border-radius: var(--r-0); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .04); image-rendering: pixelated; }
.k-slot > .k-art { position: absolute; inset: 0; background: center / 108% 108% no-repeat; image-rendering: pixelated; }     /* or an .ico mask (mask-size: 108%) */
.k-slot > .k-key-lbl { position: absolute; top: 2px; right: 3px; font: 700 var(--fs-12)/1 var(--font-body); color: #fff; text-shadow: var(--sh-text); pointer-events: none; }
.k-slot > .k-count   { position: absolute; right: 3px; bottom: 2px; font: 700 var(--fs-14)/1 var(--font-body); color: #fff; text-shadow: var(--sh-text); font-variant-numeric: tabular-nums; pointer-events: none; }
.k-slot > .k-count.is-zero { color: var(--bad); }
.k-slot[data-rarity='uncommon'] { border-color: var(--rar-uncommon); }  .k-slot[data-rarity='rare'] { border-color: var(--rar-rare); }
.k-slot[data-rarity='epic'] { border-color: var(--rar-epic); box-shadow: 0 0 6px color-mix(in srgb, var(--rar-epic) 60%, transparent); }
.k-slot[data-rarity='legendary'] { border-color: var(--rar-legendary); box-shadow: 0 0 6px color-mix(in srgb, var(--rar-legendary) 60%, transparent); }
.k-slot[data-rarity='set'] { border-color: var(--rar-set); }
.k-slot--cons { --sz: var(--cons-btn, 32px); }
.k-slot:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .7); }

/* --- cooldown sweep: --p = remaining fraction (1 -> 0), clockwise, ends at 12 o'clock; number centred --- */
.k-slot > .k-sweep { position: absolute; inset: 0; display: none; pointer-events: none;
  background: conic-gradient(from calc((1 - var(--p, 0)) * 1turn), rgba(0, 0, 0, .62) calc(var(--p, 0) * 1turn), transparent 0); }
.k-slot > .k-edge  { position: absolute; left: 50%; top: 0; width: 1px; height: 50%; margin-left: -.5px; display: none; pointer-events: none;
  background: rgba(255, 255, 255, .85); transform-origin: 50% 100%; transform: rotate(calc((1 - var(--p, 0)) * 360deg)); }   /* bright leading edge */
.k-slot > .k-cdnum { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font: 700 16px/1 var(--font-body);
  color: var(--cd-c, #fff); text-shadow: var(--sh-text); font-variant-numeric: tabular-nums; pointer-events: none; }
.k-slot.oncd > .k-art { filter: brightness(.6) saturate(.6); }
.k-slot.oncd > .k-sweep, .k-slot.oncd > .k-cdnum { display: block; }  .k-slot.oncd > .k-cdnum { display: flex; }
.k-slot.oncd.has-edge > .k-edge { display: block; }                                   /* only for cooldowns > 2 s */
.k-slot.slot-gcd > .k-sweep { display: block; background: conic-gradient(from calc((1 - var(--p, 0)) * 1turn), rgba(0, 0, 0, .45) calc(var(--p, 0) * 1turn), transparent 0); }
.k-slot .cd-low { --cd-c: #ff6a5a; }  .k-slot .cd-mid { --cd-c: #ffe27a; }          /* < 5 s / < 60 s; >= 60 s stays white */

/* --- range / resource tints (overlay, alpha-blended — no filters on the art) --- */
.k-slot.nores::after, .k-slot.oor::after { content: ''; position: absolute; inset: 0; pointer-events: none; }
.k-slot.nores::after { background: rgba(60, 90, 230, .55); }      /* no resource: blue  */
.k-slot.oor::after   { background: rgba(210, 40, 30, .50); }      /* out of range: red (declared last, wins) */
.k-slot.nores > .k-art { filter: saturate(.3); }

/* --- queued / casting / failing / locked / disabled / socket / pressed --- */
.k-slot.queued  { box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .85); }
.k-slot.casting { box-shadow: inset 0 0 0 2px var(--gold-2); }
.k-slot.failing, .k-slot.fail { box-shadow: inset 0 0 0 1px var(--bad); animation: k-shake 240ms steps(4); }
@keyframes k-shake { 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
.k-slot.locked > .k-art, .k-slot.is-disabled > .k-art { filter: grayscale(1) brightness(.7); }
.k-slot.is-disabled::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(0, 0, 0, .45) 0 3px, transparent 3px 6px); pointer-events: none; }
.k-slot.is-socket { outline: 1px dashed rgba(255, 255, 255, .28); outline-offset: -4px; }                  /* unlocked but empty: dark cell + "+" */
.k-slot.press > .k-art { filter: brightness(1.3); }                                                         /* 100 ms; no scaling */
.k-slot.ready { animation: k-ready 600ms steps(6) 1; }                                                      /* ElvUI "bling" */
@keyframes k-ready { 0% { box-shadow: inset 0 0 0 2px var(--gold-1); } 100% { box-shadow: inset 0 0 0 2px transparent; } }
.k-slot.is-new { animation: k-new-in 300ms steps(5) 1, k-new 1.2s steps(6) 2; }
@keyframes k-new-in { from { opacity: 0; } }
@keyframes k-new { 50% { border-color: var(--gold-2); } }

/* --- proc / usable glow: gold MARCHING ANTS (2 px dashes, 6 on / 4 off, one lap per 1.4 s) --- */
.k-slot.glow { box-shadow: 0 0 8px rgba(255, 214, 90, .7); }
.k-slot.glow::before, .k-slot.spend::before { content: ''; position: absolute; inset: -1px; z-index: 3; pointer-events: none; --a: #ffe58a;
  background:
    linear-gradient(90deg, var(--a) 0 6px, transparent 6px 10px) 0 0 / 10px 2px repeat-x,
    linear-gradient(90deg, var(--a) 0 6px, transparent 6px 10px) 0 100% / 10px 2px repeat-x,
    linear-gradient(0deg,  var(--a) 0 6px, transparent 6px 10px) 0 0 / 2px 10px repeat-y,
    linear-gradient(0deg,  var(--a) 0 6px, transparent 6px 10px) 100% 0 / 2px 10px repeat-y;
  animation: k-ants 1.4s steps(10) infinite; }
@keyframes k-ants { to { background-position: 10px 0, -10px 100%, 0 -10px, 100% 10px; } }
.k-slot.spend:not(.glow)::before { opacity: .5; }      /* resource >= 90 % on a spender: the same ants at 50 %, no outer glow */

/* --- aura icons --- */
.k-aura { --sz: var(--au-lg, 28px); position: relative; flex: none; width: var(--sz); height: var(--sz); background: var(--bg-1); border: 1px solid var(--bc, var(--ink)); }
.k-aura[data-deb='magic'] { --bc: var(--deb-magic); }  .k-aura[data-deb='curse'] { --bc: var(--deb-curse); }  .k-aura[data-deb='disease'] { --bc: var(--deb-disease); }
.k-aura[data-deb='poison'] { --bc: var(--deb-poison); } .k-aura[data-deb='none'] { --bc: var(--deb-none); }
.k-aura--sm { --sz: var(--au-sm, 20px); opacity: .55; }
.k-aura > .k-time  { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 700 var(--fs-12)/1 var(--font-body); color: var(--t-c, #fff); text-shadow: var(--sh-text); }
.k-aura > .k-stack { position: absolute; right: 1px; bottom: 0; font: 700 var(--fs-12)/1 var(--font-body); color: #fff; text-shadow: var(--sh-text); }
.k-aura .t-low { --t-c: #ff6a5a; }  .k-aura .t-mid { --t-c: #ffe27a; }
.k-aura.refresh { animation: k-refresh .9s steps(6) infinite; }                        /* own debuff < 30 % left: "refresh now" */
@keyframes k-refresh { 50% { border-color: var(--gold-2); } }
```

The class names (`oncd`, `nores`, `oor`, `glow`, `queued`, `casting`, `failing`, `locked`, `is-disabled`, `is-socket`, `is-new`, `press`, `ready`) are the single definition of §2.6.8; panels reuse them unchanged. `ActionBar.ts` writes `--p` (remaining fraction) and toggles the classes; it never animates `transform: scale` on a button.

### 3.7 Gauges and bars (flat)

One recipe for every bar — unit-frame health, power strips, cast bars, XP, boss health, aura-less meters. A fill is a **solid colour**; the only depth cue is the 1 px inner highlight:

```css
.k-bar { --c: var(--res-mana); --bh: 20px; position: relative; height: var(--bh); background: rgba(0, 0, 0, .55); border: 1px solid var(--ink); overflow: hidden;
  box-shadow: inset 0 1px 0 var(--hi); }
.k-bar > .k-ghost { position: absolute; left: 0; top: 0; bottom: 0; width: var(--gw, 0); background: rgba(255, 255, 255, .28); }   /* damage-lag trail, behind the fill */
.k-bar > .k-fill  { position: absolute; left: 0; top: 0; bottom: 0; width: var(--w, 0); background: var(--c); }                    /* --w / --gw = whole px, set by JS */
.k-bar > .k-abs   { position: absolute; top: 0; bottom: 0; background: rgba(255, 255, 255, .35); }                    /* absorb band: left / width in % */
.k-bar > .k-text  { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 6px;
  font: 700 var(--fs-14)/1 var(--font-body); color: #fff; text-shadow: var(--sh-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.k-bar > .k-text > :first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.k-bar--strip { --bh: var(--uf-strip, 16px); }  .k-bar--strip > .k-text { font-size: var(--fs-13); }
.k-bar[data-kind='hp']      { --c: var(--res-hp); }      .k-bar[data-kind='mana']    { --c: var(--res-mana); }
.k-bar[data-kind='rage']    { --c: var(--res-rage); }    .k-bar[data-kind='energy']  { --c: var(--res-energy); }
.k-bar[data-kind='focus']   { --c: var(--res-focus); }   .k-bar[data-kind='faith']   { --c: var(--res-faith); }
.k-bar[data-kind='essence'] { --c: var(--res-essence); } .k-bar[data-kind='fury']    { --c: var(--res-fury); }
.k-bar[data-kind='xp']      { --c: var(--res-xp); }
.k-bar[data-kind='class']   { --c: var(--cls, var(--res-hp)); }                 /* player frame, meter rows: --cls set inline from classColor() */
.k-bar[data-kind='hostile'] { --c: var(--react-hostile); }  .k-bar[data-kind='neutral'] { --c: var(--react-neutral); }  .k-bar[data-kind='friendly'] { --c: var(--react-friendly); }
.k-bar.is-cast   { --c: var(--gold-2); }  .k-bar.is-cast.is-locked { --c: #8a8a92; }                    /* interruptible = gold, not = grey + shield */
.k-bar.is-low  { animation: k-low 1s steps(6) infinite; }  @keyframes k-low { 50% { border-color: var(--bad); } }  /* < 30 % */
.k-bar.is-dead { filter: grayscale(.9) brightness(.7); }
```

Fill width is set in **whole css pixels** of the (known) track width (`el.style.setProperty('--w', Math.round(frac * trackW) + 'px')`, same for the ghost's `--gw`), so the leading edge never lands on a half pixel; the ghost catches up after a 400 ms hold (λ = 6, the existing `M2Gauge` / `Bar` logic).

Resource → bar kind (from `data/classes.ts`): knight `rage`, barbarian `rage`, mage `mana`, rogue `energy`, monk `energy`, archer `focus`, paladin `faith`, necromancer `essence`, warlock `mana`, demonhunter `fury`, evoker `essence`; unknown kind → the neutral `mana` fallback so a future `ResourceType` is never invisible (`.k-bar` default `--c`). **`hud-frames.css` (`.bar.res[data-kind]`, moved there from `hud.css` by UX-01) switches to these tokens in UX-11.** The Metin2 board's `hud-metin2.css` is **not touched** (parked skin, §8.2 UX-10).

### 3.8 Class, rarity, school, reaction and state colours

- **Class colours** (`--cls-*`, WoW-style; the player's health bar, the meter bars, party frames, nameplate class text, chat sender names): knight `#c79c6e` · barbarian `#ff7c0a` · mage `#3fc7eb` · rogue `#fff569` · monk `#00ff98` · archer `#abd473` · paladin `#f58cba` · necromancer `#c41e3a` · warlock `#8788ee` · demonhunter `#a330c9` · evoker `#33937f`. White bar text always carries the 4-way outline so it stays legible on the light classes (rogue, paladin, mage, archer).
- **Rarity** names/colours are `RARITY_COLORS` (`types/common.ts`) — unchanged values, exposed as `--rar-*`. Use the **base** colour for borders, glows and icons, the **`-text`** variant (rare, epic) for text on dark (contrast ≥ 4.5 : 1). Legendary/set keep a 2 px outer glow in the tooltip frame.
- **Damage schools** (`--dmg-*`, the combat-text colours of COMBAT_WOW §2.11; `DAMAGE_COLORS` in `widgets/dom.ts` must hold the same values — owned by CW-05, UX-00 only adds the dev assert): physical `#fff1d0`, fire `#ffa040`, frost `#8fe3ff`, lightning `#fff05a`, shadow `#c58cff`, poison `#8cff70`, holy `#fff3a8`, arcane `#ff8fee`, true `#ff5a5a`. Healing = `--ok`, damage taken = `--bad`, XP = `--res-xp`, gold = `--gold-1`.
- **Reaction** (target health fill): hostile `--react-hostile`, neutral `--react-neutral`, friendly `--react-friendly`.
- **Relative level** (target frame, quest level, zone band): grey `--text-4`, green `--ok`, yellow `--gold-2`, orange `--warn`, red `--bad`, skull glyph ≥ +10.
- **Debuff types** (aura border): magic `--deb-magic`, curse `--deb-curse`, disease `--deb-disease`, poison `--deb-poison`, untyped `--deb-none`.
- **Cooldown / timer thresholds** (buttons and auras): < 5 s `#ff6a5a`, < 60 s `#ffe27a`, ≥ 60 s `#ffffff`.

### 3.9 Spacing, radius, layering

- 4 px base grid: only `--sp-1..7` (4, 8, 12, 16, 24, 32, 48) for panel layout. **HUD micro-spacing is 1 px** (action-bar buttons, aura icons, meter rows, party rows) and 3 px between a unit frame and its aura rows; HUD gutters `--gut` 16/14/12; window padding 16; card gap 12.
- Radii: `--r-0` (0: every HUD element, bars, slots), `--r-1` (2: windows, buttons, chips, key caps), `--r-pill` (count chips only). The current 23 distinct `border-radius` declarations collapse to these three (+ `50%` for round icons such as the minimap disc and class pips).
- Z layers stay as in `hud.css` (`world 5 < hud 10 < menu 20 < panels 100 < top 300 < modal 400 < tooltip 500 < loading 800`). World-label bubbles live in the world layer; tips/arrow live in the HUD layer.

### 3.10 Motion

| Name | Duration · easing | Used by |
|---|---|---|
| hover | 90 ms `ease-out` | buttons, slots, micro buttons (colour / border only) |
| press | `translateY(1px)` for buttons, `brightness(1.3)` for slots, 100 ms | buttons, slots (**no scale**) |
| window open | 140 ms `--ease-out` (`translateY(6px)` + opacity 0 → none) | all panels |
| window close | 100 ms fade | all panels |
| tooltip | show delay 120 ms (0 while another is visible), hide 0 | `TooltipLayer` |
| slot reveal | opacity 300 ms `steps(5)` + 2 gold border pulses | action bars |
| tip card | 240 ms slide-in from the left (the card sits bottom-left), 9 s life, 200 ms fade | `TipCards` |
| big banner | 700 ms in (pop), hold, 400 ms out | zone / level-up / quest |
| toast | 200 ms in, 300 ms out | `Toasts` |
| bubble | 120 ms pop-in (opacity + 6 px rise, `steps(4)`; never a scale), 400 ms fade-out | chat / NPC bubbles |
| cooldown ready | 600 ms inner outline fade, `steps(6)` | slots |
| bar fill / meter fill | 250 ms `steps(5)` | meter rows, XP, cast |
| gauge trail | hold 400 ms then catch up (λ = 6) | unit-frame bars (unchanged logic) |
| pulses (low HP, badges, new, refresh) | 0.9–1.2 s loop, always `steps(6)` | bars, `N` badge, aura refresh |
| marching ants | 1.4 s per lap, `steps(10)` | proc glow |

`@media (prefers-reduced-motion: reduce)`: drop loops (ants become a static 2 px gold ring), keep 90 ms fades. Settings has no motion toggle yet (not needed).

### 3.11 Migration rules for the old CSS

1. `tokens.css` and `kit.css` are additive; nothing is deleted in Wave 0. The legacy aliases keep every old stylesheet working and **re-colour it to the flat palette** (including `--panel-bg*` for `menu.css`, so the login / character-select screens match).
2. When a package restyles a widget it **replaces literals with tokens in the rules it touches** and removes only rules it supersedes. The final cleanup (UX-60) deletes dead selectors found by the grep list in that package.
3. `hud.css`' `:root` block (`--hud-gold*`, `--metal-*`, `--shade`, `--font-ui`) is replaced by the aliases in §3.2.
4. New components use the `k-` classes directly; existing class names (`pf`, `slot`, `qt`, `mt`, `pg-*`, `pi-*`) are kept and gain `k-*` classes **additively** in the DOM when they should inherit kit rules.
5. **Parked skins.** `Metin2Bar.ts`, `hud-metin2.css`, the orbs cluster and `hudStyle: 'metin2' | 'orbs'` are left **untouched and unmounted** (still compiled) — the ElvUI skin is the only HUD from UX-10 on. A "Metin2 Klasik" skin (stone board + gauges around the same `.ab-btn` buttons) is a backlog item (UX-70), not part of this redesign.

### 3.12 The PSX rule (what "flat ElvUI" must still respect)

1. **Whole-pixel geometry.** Every design number is an integer css px; positions use whole-pixel `translate3d`; **no `transform: scale()` on buttons, icons, bars or frames** (scaling is for banners only); bar fills are rounded to whole track pixels; the grid gap is exactly 1 px.
2. **Nearest-neighbour bitmaps.** `image-rendering: pixelated` for every icon, spec icon, canvas (minimap) and bitmap; glyph icons are SVG masks and stay sharp at any zoom.
3. **1 px lines.** Borders are 1 css px `#000`; Chromium snaps border widths to whole device pixels, so they stay crisp under the HUD zoom (QA spot-checks at 1280×720 where the zoom is 0.8). Corners are square on the HUD.
4. **No blur.** No `backdrop-filter`, no `filter: blur()`, no `drop-shadow()`, no soft shadows on the HUD (the only shadows are glows — `box-shadow` ≤ 8 px — and the window pop `--sh-pop`, which belongs to panels, not to the HUD); no gradients on bars or glyphs (flat fills). The gradients that **are** allowed: the conic cooldown sweep, translucent scrims (the chat scrim), and **hard-stop pattern gradients** — the marching ants (§3.6) and the disabled-button hatch — whose colour stops are all hard, so they draw crisp 1–2 px lines instead of a blend.
5. **Stepped animation.** Pulses, ants, fills and reveals use `steps()` — a low-frame-rate shimmer that matches the PSX scene.
6. **No ornate frames.** No stone, no gold trim, no rivets, no filigree, no dither overlay on UI surfaces. Gold only as an accent colour on a flat shape.
7. **The 3D scene keeps its PSX look** (vertex snapping, dither, fog, bloom); the UI sits crisp on top of it, which is exactly the ElvUI-over-a-game-world contrast of the references.

---

## 4. Onboarding UX

Goal: a brand-new player always knows **(1) what to do next, (2) where it is, (3) which key does it** — without reading anything. Six layers, each cheap and independent: welcome card → guide NPC highlight → objective arrow → map/minimap pins → "Ne yapmalıyım?" panel → one-time contextual tips. All state is per character in `CharacterSave.flags` (`onb.*`, `tip.*`) and two settings (`showTips`, `questArrow`, Appendix A).

### 4.1 First 30 minutes (timeline)

| When | Player sees | Mechanism (package) |
|---|---|---|
| T+0 s | Town loads; zone banner `Kuzgunkale · Kadim Zindanların Kapısı` | existing `ZoneBanner` |
| T+1 s | **Welcome card** (cursor freed): controls cheat-sheet + "İlk görevin: Muhtar Cemal ile konuş" | `panels/game/welcome.ts` (UX-21). Shown once when `character.level ≤ 2` and flag `onb.welcome` is unset |
| on `Başla` | card closes, **objective arrow** appears pointing at Muhtar Cemal (≈ 13 m from the spawn), the NPC shows the big gold `!` and a `Buraya konuş` tag; tracker shows the `hint` card | `ObjectiveArrow` (UX-20), `NPC.setQuestMark` (UX-21), `ContextTracker` (UX-12) |
| T+5 s | tip **Hareket** if the player has not moved for 3 s | `TipCards` (UX-20) |
| ≈ T+20 s | `[F] Konuş` prompt (existing) + tip **Etkileşim** | `InteractPrompt`, tips |
| quest accepted | big banner `Görev Alındı: Kuzgun'un Çağrısı`; tracker → `quest` mode; arrow now points at the **Güney Kapısı** (the target village is in another scene, §4.4) | `QuestBanner` (UX-13), arrow |
| leaving the gate | zone banner `Sisli Koru` / region level band on the minimap; arrow → Gümüşdere Köyü / Muhtar Ferhat | arrow, minimap |
| first enemy ≤ 18 m | tip **Saldırı**; first damage taken → tip **Kaçış**; first drop → tip **Ganimet** → tip **Çanta** | tips |
| quest 2 (`kill` 10 Orman Sıçanı) | tracker row with count + bar; `QuestFeed` lines `Orman Sıçanı: 3 / 10`; green ✓ on completion | tracker + feed (UX-12) |
| L2 | micro button **Yetenekler (N)** appears; tip **Yetenek Ağacı** | micro menu (UX-13), tips |
| L3 | slot **Q** reveals (`YENİ`), toast `Yeni beceri öğrendin: Hücum`; micro button **Yetenek Kitabı** appears | action grid (UX-10) |
| L5 | tip **Demirci**; "Ne yapmalıyım?" starts recommending Altın Tarlalar | tips, `recommend()` |
| L8 | micro button **Zindan Bulucu**; tip **Zindan Bulucu**; guide recommends Kemik Mahzeni | finder (UX-40) |
| L10 | tip **Uzmanlık**; after the choice **X** reveals; talent badge pulses | tips, action grid |
| L20 / L30 | **V** / **R** (and **T**) reveal; tip **Büyük Yetenek** at first major | action grid, tips |

### 4.2 Welcome card (`welcome` panel)

A modal panel (`GamePanel`, id `welcome`, size **640 × auto**, `k-frame`, backdrop dim 55 %, no close button — Enter/Space/Esc = `Başla`), because it needs the cursor (`UI.wantsCursor()` already handles open panels).

```
┌─────────────────────────────────────────────────────────────────┐
│                   ───────────────                               │  divider (kit .k-sep)
│       KUZGUNKALE'YE HOŞ GELDİN, GÖLGE AVCISI                    │  Cinzel Decorative 32 (big title), --gold-1
│   Kadim Mühür çatlıyor. Vadiyi ve zindanları kurtaracak         │  body 17, text-2, centred, max 2 lines
│   kişi sen olabilirsin.                                         │
│ ┌ Hareket ─────────┐ ┌ Savaş ────────────┐ ┌ Etkileşim ───────┐ │  3 .k-card columns, 3 lines each
│ │ [W][A][S][D] yürü│ │ [SolT] saldır     │ │ [F] konuş / al   │ │  key caps are .k-key, text 15
│ │ [Boşluk] zıpla   │ │ [SağT] yetenek    │ │ [B] çanta        │ │  labels from G.input.bindingLabel()
│ │ [Shift] yuvarlan │ │ [Q][E][1][2][3]   │ │ [M] harita [L]   │ │
│ └──────────────────┘ └───────────────────┘ └──────────────────┘ │
│ ┌ İLK GÖREVİN ────────────────────────────────────────────────┐ │
│ │ ◆ Muhtar Cemal ile konuş                             ≈ 13 m │ │  title from recommend().quest; distance is live
│ └─────────────────────────────────────────────────────────────┘ │
│ [x] Başlangıç ipuçlarını göster                     [ BAŞLA ▸ ] │  checkbox = Settings.showTips; primary button
└─────────────────────────────────────────────────────────────────┘
```

- `Başla` sets `flags['onb.welcome'] = 1`, closes the card, calls `HudApi.setGuideTarget('npc_muhtar')` (arrow target when no quest is active) and fires the first tip timer.
- The card is re-openable from the Esc menu (`Başlangıç Rehberi`, UX-52a) and from the guide panel footer.
- Level-2+ characters created before this feature (no flag) do **not** see it automatically; they get the `hint` tracker card instead.

### 4.3 Guide NPC highlight

Until `mq_01_kuzgunun_cagrisi` leaves the `available` state (flag `onb.metCemal` is written by `welcome.ts` when it sees `G.events 'quest:updated'` for that quest with `state !== 'available'`) or 180 s pass: Muhtar Cemal wears the **main-quest marker** (`.qm--main`, §4.8) and a world label under his name: `▼ Buraya konuş` (body 700 14, `--gold-1`, bobbing 4 px, 1.2 s). The label is a normal `addWorldLabel` with class `guide-tag`, `maxDistance 60`. The same highlight is used generically for **any** quest giver the `recommend()` quest points at (so it keeps helping after the tutorial).

### 4.4 Objective arrow (`hud/ObjectiveArrow.ts`)

One marker at a time, on the HUD layer (full-screen, pointer-transparent). **Target source, in priority order:** (1) the pinned active quest's first open objective with a position, (2) any `ready` quest's turn-in NPC, (3) the recommended quest's giver (`recommend().quest`, includes the welcome target `npc_muhtar`), (4) none → hidden.

**Scene-aware position** (`hud/questMarks.ts` gets `guideTargetPos(obj)`; the existing `objectivePos` is only valid inside the open-world map, because `worldExtras()` falls back to Sisli Vadi even in town):

| Current scene | Objective | Position |
|---|---|---|
| town | NPC / portal that exists in `TOWN.npcs` (`pos` x,z) | that NPC |
| town | anything located in Sisli Vadi (`talk npc_g_*`, `explore r*`, `kill ow_*`, `metin`) | `guney_kapisi` exit centre (0, 60) with label `Güney Kapısı` |
| town | `dungeon` objective | `portal_<dungeonId>` NPC pos on the terrace |
| town | Karakır objectives | `dogu_kapisi` exit centre (60, 0) |
| world map | `talk` / `explore` / `dungeon` / `kill` / `boss` / `metin` | `objectivePos(o)` (existing) |
| dungeon run | quest with no position | none |

**Visuals:** a 36 px **diamond medallion** (flat dark diamond, 1 px #000 border, 2 px accent ring; quest-kind icon inside: `!`/`?` for talk/turn-in, crossed swords for kill, flag for explore, portal for dungeon; colour ring gold = talk/turn-in, blue = kill/explore, violet = dungeon) with the **distance** under it (body 700 14; rounded to 1 m below 100 m and to 5 m from 100 m up, e.g. `142 m` → `140 m`) and the target name (13 px, `--text-2`).
- **On screen** (inside an 56 px inset of the viewport): the medallion floats at the projected point + 2.8 m, bobbing 4 px, with a small downward chevron.
- **Off screen / behind the camera:** the medallion is clamped to an ellipse inset 64 px from the edges and an arrow chevron around it rotates to point at the target (screen-space angle from the viewport centre).
- **Arrival:** within 10 m (3 m for NPCs the player can talk to) it plays a 600 ms `Vardın` flash and hides; it reappears if the player walks > 25 m away. While any panel is open or the HUD is in edit mode it hides. Fade 250 ms.
- Setting `questArrow` (default true) disables it (Settings › Arayüz › `Görev oku`).

```ts
// per frame (≤ 10 Hz for the target, every frame for the projection)
const t = guideTarget();                         // {x,z,label,kind} | null  (priority list above)
if (!t || !G.settings.data.questArrow || G.ui.wantsCursor()) return hide();
ui.projectWorld(t.x, groundY + 2.8, t.z, out)    // returns false behind camera / outside depth
const onScreen = ok && out.x > 56 && out.x < W - 56 && out.y > 56 && out.y < H - 56;
const pos = onScreen ? out : clampToEllipse(angleFromCenter(t, camera), W, H, 64);
dist = hypot(player.x - t.x, player.z - t.z)
```

### 4.5 Map and minimap pins

All pins reuse the existing icons in `public/assets/icons/map-*.svg` (white glyph + CSS tint). One legend for the world map, the minimap and the town:

| Pin | Icon / look | Where |
|---|---|---|
| Quest giver — offer | `map-quest` gold `!` | minimap + map, **town and world** (extend `questGiverMarks()` to the town NPCs with `quests`) |
| Quest giver — turn-in | `map-quest-ready` gold `?` | same |
| Quest giver — locked (level) | grey `!` 60 % | same |
| Objective area | 2 px blue ring, radius = camp radius (`PackDef.radius`), 1.2 s pulse | map + minimap (existing blue ring, now also drawn for `talk`/`explore`) |
| **Pinned objective** | the arrow's diamond medallion, larger (14 px on the minimap), distance label on the world map | map + minimap rim: when off-disc the diamond sticks to the minimap ring (like the screen arrow) |
| Dungeon entrance / portal | `map-dungeon` with the level range, red tint when `level < min` | map + minimap |
| Waypoint (discovered / undiscovered) | `map-waypoint` gold / grey | map + minimap |
| Village / camp / metin / rare / boss | `map-village` / `map-camp` / `map-metin` / `map-rare` / `map-boss` | map |
| **Önerilen bölge** | dashed gold outline around the recommended region on the world map + label `Önerilen · Sv. 5–10` | map only |

World-map side card (new, under the legend, `k-card`): region name, level band (relative colour), `Görevler 3 / 9` with a progress bar (count of this region's quests in state `done` ÷ all defs with `region` = id) and the kill-task shortcut `Av Görevlerini Göster`. Region counters come from `G.quests.all()` / `state()`.

### 4.6 "Ne yapmalıyım?" panel (`guide`, key `.`)

Panel id `guide`, `GamePanel`, **S size 560 × auto** (the mock below uses illustrative data for a level-4 knight). Opened by: tracker `?` button and the `hint` card, the welcome card, the Esc menu, the key `Period` (`.`), micro menu via the finder's footer link. It is **advice, never a gate**.

```
┌ NE YAPMALIYIM? ───────────────────────────────── [.] ✕ ┐
│ Sv. 4 Şövalye · Eşya Seviyesi 5                        │  header line (class colour)
│ ┌ ÖNERİLEN GÖREV ────────────────────────────────────┐ │
│ │ ◆ Yağmacı Başı                    Sv. 4   Ana      │ │  title; Ana = main quest chip
│ │ ▸ Gırtlak'ı öldür 0/1    [Takip Et] [Haritada]     │ │  objective + 2 buttons
│ └────────────────────────────────────────────────────┘ │
│ ┌ NEREDE KASMALI? ───────────────────────────────────┐ │
│ │ Sisli Koru      Sv. 1–5        ★ Önerilen          │ │  region + band + fit chip
│ │ Orman Sıçanı · Yeşil Balçık · Goblin Şamanı        │ │  sample mobs (3 names)
│ │ Keder Metini (Sv. 5) · Yağmacı Başı (mini boss)    │ │  spots (camp / metin / rare / mini boss) nearest to the level
│ │                       [Işınlan] [Haritada Göster]  │ │  Işınlan only when the region waypoint is discovered
│ └────────────────────────────────────────────────────┘ │
│ ┌ ÖNERİLEN ZİNDAN ───────────────────────────────────┐ │
│ │ Kemik Mahzeni  Sv. 8–18  Normal · Sv. 8'de açılır  │ │  locked text from ladder.cardText when locked
│ │                              [Zindan Bulucu]       │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌ YAPILACAKLAR ──────────────────────────────────────┐ │
│ │ [ ] Yeni beceriyi çubuğa yerleştir (K)             │ │
│ │ [ ] 3 Orman Sıçanı öldür  1/3                      │ │
│ │ [x] Muhtar ile konuş                               │ │
│ │ [ ] Günlük görevler: İlan Tahtası                  │ │
│ └────────────────────────────────────────────────────┘ │
│ [ ] Başlangıç ipuçlarını göster                [Kapat] │
└────────────────────────────────────────────────────────┘
```

**`recommend(ch)` — pure function in `panels/game/guideEngine.ts`** (no DOM; unit-checkable from a dev page; reads only `CharacterState`, `G.quests`, `worldExtras()`, `dungeonList()`, `difficultyState()`):

```ts
interface GuideAdvice {
  quest:   { id: string; name: string; state: 'ready' | 'active' | 'available'; level: number; main: boolean; giverNpcId?: string; rows: QuestObjectiveRow[] } | null;
  zone:    { id: string; name: string; levels: [number, number]; fit: 'low' | 'fit' | 'high'; mobs: string[]; spots: { label: string; levels: [number, number] }[]; waypointId?: string; built: boolean } | null;
  dungeon: { id: string; name: string; levels: [number, number]; diff: 'normal' | 'heroic' | 'mythic' | 'mythicplus'; note: string; locked: boolean } | null;
  todo:    { id: string; text: string; done: boolean; action?: { panel: string; data?: unknown } }[];
}
```

- **quest:** (1) any `ready` quest; (2) the pinned active quest; (3) the active quest with the lowest level; (4) the lowest-level `available` **main** quest whose `level ≤ L + 2` (prereqs met, `G.quests.state() === 'available'`); (5) the lowest-level available side quest of the recommended region; else `null`.
- **zone:** regions are `worldExtras().regions` (r1 `Sisli Koru` 1–5, r2 `Altın Tarlalar` 5–10, r3 `Haydut Tepeleri` 10–15, r4 `Ağıt Bataklığı` 15–20, r5 `Ork Kanyonu` 20–25, r6 `Lanetli Harabeler` 25–30). Pick the first region with `L < levels[1]` (so level 5 → Altın Tarlalar), else the last one. Above 30: `Karakır Bozkırı` (30–37) then `Ayaz Eteği` (38–45) with `built = false` until `getDungeon('karakir_bozkiri')` exists (card then says `Yakında`). Above 45: no zone, dungeon/finder only. `fit` = `low` (L < lo − 2), `fit`, `high` (L > hi + 3). `mobs` = first 3 distinct names of the region's pack members (`worldDef().packs` filtered by the region's room); `spots` = camps / metin tiers / rares whose level range is nearest to L (max 2).
- **dungeon:** first `dungeonList()` entry with `levelRange[0] − 2 ≤ L ≤ levelRange[1] + 4`, preferring the one whose band midpoint is closest to L; `diff` = `normal`; if L ≥ 50 and Normal cleared → `heroic`; if L = 60 and Heroic cleared → `mythic`; Mythic cleared and a keystone owned → `mythicplus`. Below level 6 the card reads `Seviye 8'de açılır` (`locked: true`).
- **todo:** open objectives of the chosen quest (≤ 3) + `Yeni beceriyi çubuğa yerleştir (K)` (a learned skill is not on the bar) + `Uzmanlık seç (N)` (L ≥ 10, no spec) + `Harcanmamış puanların var (N)` + `Demirci'de eşyalarını yükselt` (L ≥ 5, flag `onb.smith` unset) + `Günlük görevler: İlan Tahtası` (bounties claimable / new day) + `Zindan Bulucu'yu dene` (L ≥ 8, flag `onb.finder` unset) + `Av Defteri: Avcı Yıldız ile konuş` (L ≥ 5, bio not started). Done items sink to the bottom (struck, green), at most 6 rows shown.

The one-line summary of `recommend()` (`Yağmacı Başı: Gırtlak'ı öldür` / `Seviye 8'de zindanlar açılır`) feeds the tracker `hint` card and the welcome card.

### 4.7 Contextual tips (`hud/TipCards.ts`, data in `data/tips.ts`)

One small card at a time, never during combat except where marked, 9 s life, each tip shown **once per character** (`flags['tip.<id>'] = 1` written when it appears).

**Scheduler:** every 0.5 s pick the highest-priority tip whose `when(ctx)` is true and whose flag is unset; show it if ≥ 25 s passed since the previous tip (≥ 4 s after the welcome card), no panel is open, chat is not focused, the player is alive, the scene is not loading, `Settings.showTips` is true, and (`!ctx.inCombat || tip.allowInCombat`). Hover pauses the 9 s timer; `✓ Anladım` dismisses; a `Bir daha gösterme` link sets `showTips = false`.

**Card visuals** (`.k-plate`, `--tip-w`, anchored `.hud-tip` — bottom-left, directly above the chat, §2.5): 4 px gold left stripe, 36 px icon medallion, title (body 700 15, `--gold-1`) `İpucu · Kaçış`, body 15 px `--text-1`, key caps row (`.k-key`), a 2 px progress hairline along the bottom (9 s), bottom-right `✓ Anladım` (14 px). Slide in from the left 240 ms, fade out 200 ms, soft `ui_open` at 0.3.

| id | When (precondition) | Title | Text (TR) | Keys | Prio | In combat |
|---|---|---|---|---|---:|:-:|
| `move` | town, 3 s after control starts, no movement input yet | Hareket | Yürümek için W A S D, kamerayı çevirmek için fareyi oynat. Boşluk zıplar. | W A S D | 100 | – |
| `interact` | within 4 m of an NPC/interactable for 1 s | Etkileşim | Konuşmak, eşya almak ve kapıları açmak için F tuşuna bas. | F | 90 | – |
| `attack` | first enemy ≤ 18 m | Saldırı | Sol tık saldırır, sağ tık yeteneğini kullanır. Sol tuşu basılı tutarsan ağır vuruş yaparsın. | SolT SağT | 95 | ✓ |
| `dodge` | first time ≥ 10 % max HP lost to an enemy | Kaçış | Shift ile yuvarlan. Saldırı sana değmeden hemen önce yuvarlanırsan kusursuz kaçış yaparsın. | Shift | 92 | ✓ |
| `loot` | first drop on the ground ≤ 8 m | Ganimet | Yerdeki eşyaları F ile al. Parıltının rengi eşyanın nadirliğini gösterir. | F | 85 | – |
| `bag` | first item enters the bag | Çanta | B ile çantanı aç. Eşyaya sağ tıklayarak kuşanabilirsin. | B | 80 | – |
| `potion` | HP < 40 % first time and a potion is owned | İksir | 4 tuşu can iksiri, 5 tuşu kaynak iksiri içer. | 4 5 | 99 | ✓ |
| `quest` | first quest accepted | Görevler | L ile görev defterini aç. Sağ üstteki takipçi aktif görevini gösterir. | L | 75 | – |
| `map` | first region change, or level 2 | Harita | M ile haritayı aç. Mavi halkalar görev hedeflerini gösterir. | M | 70 | – |
| `waypoint` | first waypoint stone discovered | Işınlayıcı | Keşfettiğin taşlar arasında hızlı yolculuk yapabilirsin. Taşa yaklaşıp F'ye bas. | F | 65 | – |
| `talents` | level ≥ 2 with unspent points | Yetenek Ağacı | N ile yetenek ağacını aç. Harcayabileceğin {n} puanın var. | N | 82 | – |
| `skill_new` | a slot was just revealed | Yeni Yetenek | {key}: {skill}. Yetenekler açıldıkça çubuğa kendiliğinden eklenir. | slot key | 88 | – |
| `smith` | level ≥ 5, in town | Demirci | Demirci'de eşyalarını yükseltebilirsin. Her seviye daha güçlü eşya demek. | – | 60 | – |
| `finder` | level ≥ 8, in town | Zindan Bulucu | I ile Zindan Bulucu'yu aç: Kemik Mahzeni artık açık. | I | 78 | – |
| `spec` | level ≥ 10, no spec | Uzmanlık | Uzmanlık seçme zamanı! N tuşuyla uzmanlığını seç. | N | 94 | – |
| `major` | first major slot revealed | Büyük Yetenek | X, V ve T büyük bekleme süreli yeteneklerdir. Zor savaşlar için sakla. | X V T | 86 | – |
| `chat` | another player appears in the scene | Sohbet | Enter ile yaz. Mesajlar karakterin başında balon olarak görünür. | Enter | 55 | – |

Item/skill placeholders (`{n}`, `{key}`, `{skill}`) are filled by the scheduler. Priority only orders simultaneous candidates.

### 4.8 Quest-giver markers (`.qm`, replaces the inline-styled glyph in `NPC.setQuestMark`)

`NPC.setQuestMark(kind)` builds `<div class="qm qm--offer"><i class="qm-glow"></i><b class="qm-glyph">!</b></div>` (class set per kind) inside the existing world label (`className: 'efs-wl-wrap'`, `maxDistance 40`). CSS lives in `styles/world-markers.css` (new, UX-21):

| Kind | Class | Look |
|---|---|---|
| offer | `qm--offer` | 30 px flat dark diamond (45° rotated square, counter-rotated glyph), 1 px #000 + 1 px `--gold-2` line, glyph `!` body 900 22 px `#ffe14d` |
| turn-in | `qm--turnin` | same, glyph `?` `#f5b82e`, stronger glow + a 4-spark twinkle every 1.6 s |
| locked | `qm--locked` | glyph `!` `#8d939c`, 60 % opacity, no glow |
| repeatable / daily | `qm--daily` | glyph `!` `--info` (blue) |
| main story | `+ qm--main` | 38 px, extra outer ring, tiny crown pip on top; used for the `Kadim Mühür` chain and for the guide highlight |

Common: bob 4 px / 1.2 s (`translateY`, `steps(8)` for the PSX feel), glow pulse 1.6 s, no `text-shadow` fuzz (the diamond itself is the backing). The map/minimap use the matching `map-quest*.svg` icons (§4.5).

### 4.9 Kill-task surfaces ("şu kadar yaratık kes")

The data already exists (`QuestObjective.kind` `kill` / `boss` / `metin` with `count`, `bounty_kill*` templates, Av Defteri). This section is where it becomes **visible**:

| Surface | Behaviour |
|---|---|
| Tracker row | `Orman Kurdu öldür   3 / 8` + 6 px `.k-bar` bar (`--info` blue for kill / boss / metin, `--gold-2` for collect); completed row = green ✓, folds away after 6 s |
| `QuestFeed` (centre, 36 %) | `Orman Kurdu: 3 / 8` on every increment (2.2 s, max 3 lines, gold); completion line green with ✓ and `ui_confirm` 0.4; quest completion line `Görev tamamlandı — teslim et: Muhtar Cemal` |
| Quest log (L) rows | kill rows get a progress bar and `Haritada göster` (opens the map focused on the nearest live target via `objectivePos`) |
| Quest banner | `Görev Alındı` / `Görev Tamamlandı` banners (rank 3, §2.11) with the quest name and reward line (`rewardLine()` from `quests.ts`) |
| Map | blue area ring per unfinished kill objective with the remaining count as a small badge (`5 kaldı`) |
| Daily bounties (İlan Tahtası) | bounty panel rows get the same bar; the micro `Görevler` button badge counts claimable bounties |
| Av Defteri | tracker shows a second pinned line `Av Defteri 7 / 15 Kurt Dişi` when a step is active (optional, P2) |

Content volume ("dolu olsun") is an authoring task: see Appendix D for the exact data hooks the orchestrator can fill (hunt-quest templates per region, quest density rule, map list).

### 4.10 Persistence, settings, skip

- Flags (`CharacterSave.flags`, values `1`): `onb.welcome`, `onb.metCemal`, `onb.smith`, `onb.finder`, `tip.<id>`.
- Settings (append-only, Appendix A): `showTips: boolean = true`, `questArrow: boolean = true`.
- Everything is skippable: welcome `Başla`, tips `Bir daha gösterme`, arrow toggle, and the guide panel never blocks anything.
- `Reset`: Settings › Arayüz gets `İpuçlarını Sıfırla` (clears all `tip.*` and `onb.*` flags of the current character after a confirm).

---

## 5. Chat window and speech bubbles

Logic (channels, slash commands, net protocol, filter, item links) stays as specified in **GDD_LIFE §3** (packages L-30 … L-37). This section is the **visual and behavioural spec** of the window and of the bubbles, and the one **new shared widget** (`widgets/Bubbles.ts`) that replaces the separate `ChatBubbles` idea of L-36 and the NPC `.efs-bark` code path.

### 5.1 Chat window

**Anchor / size:** `.hud-bl`, `--chat-w × --chat-h` = 400 × 176 (`lg`), 360 × 152 (`md`), 320 × 120 (`sm`). Frame id `chat` (edit mode compatible).

```
 ┌ tab strip 24 px ──────────────────────────────────────┐
 │ [Genel●][Grup][Fısıltı][Sistem][Savaş]                │  body 700 13 caps, chips 22 px, unread dot 6 px gold
 ├───────────────────────────────────────────────────────┤
 │ Ahmet: selam, zindana giren var mı?                   │  log: 15 px / 20 px line, left→right scrim, newest at the bottom
 │ Zeynep: ben geliyorum                                 │
 │ Sistem: Seviye 8 oldun! Tebrikler.                    │
 │                            [Yeni mesajlar ↓]          │  chip only when scrolled up
 ├───────────────────────────────────────────────────────┤
 │ [Grup] Mesaj yaz…                                     │  input row 28 px, only while typing (Enter)
 └───────────────────────────────────────────────────────┘
```

| Property | Spec |
|---|---|
| Idle look | **no frame**; a horizontal scrim `linear-gradient(90deg, rgba(10,10,12,.55), rgba(10,10,12,0))` behind the log (the neutral tone of `--bg-plate`, never a warm brown-black; the layer's opacity = `chatOpacity ÷ .35`, so the default .35 gives .55 at the left edge) so text stays readable over the bloomed scene |
| Stats line (optional) | `Settings.showStats` (default **off**; reference #4's *Crit / Haste / Mastery / Vers* readout). One text line **above** the chat (`.chat-stats`, rendered by `Chat`, outside `--chat-h`, height `--stats-h` = 20 px): `Kritik 26,2% · Hız 22,3% · Soğuma 28,2% · Kaçınma 16,2%` (`critChance`, `attackSpeed`, `cdr`, `dodgeChance`; `Hız` = `castSpeed` for the four caster classes mage / warlock / necromancer / evoker), 13 px 700, labels `--text-3`, values white, `--sh-text`, no frame; entries that do not fit `--chat-w` are dropped from the right (four entries ≈ 336 px: they fit `lg` and `md`, `sm` shows three); refresh 2 Hz. The tip card moves up by `--stats-h` while it is on |
| Hover / typing | scrim alpha → .78, 1 px `--line` hairline, tab strip fully opaque, log gets `pointer-events: auto` (wheel scroll, text select) |
| Text | body font (Roboto Condensed) 15 px / 20 px, `--sh-text`; `chatFontSize` range **13–17** (GDD_LIFE's 11–16 is raised: no information text below 13 px), default 15 |
| Line | `[HH:MM] ` optional (`chatTimestamps`), sender name in the **class colour** when the sender's class is known (peers: `summary.classId`), else the channel colour; body in `--text-1`; system/loot/boss lines in their channel colour |
| Channel colours | say `#f1e6cf` · yell `#ff6a52` · party `#6fb1ff` · whisper `#ff7fe6` · global `#ffd36a` · trade `#c8a070` · system `#ffe27a` · loot `#8ae08a` · emote `#ffb0ff` italic · boss `#ff6a52` bold (GDD_LIFE §3.1; one `--ch-*` custom property per channel, defined once on `:root` in `hud-chat.css` — the only literal colours outside `tokens.css`; the speech bubbles reuse them, §5.2) |
| Tabs | Genel (say, yell, party, whisper, global, trade, emote, system) · Grup · Fısıltı · Sistem (system, loot, boss) · Savaş (combat). Tabs for channels that do not exist yet in the net layer are **hidden**, not disabled (today only Genel + Grup + Sistem render; the DOM already supports the rest) |
| Fade | idle lines get `.old` after 12 s (opacity 0 over 0.8 s) except in Fısıltı / Sistem tabs; typing or hover shows all |
| Unread | gold dot on a tab for a new line while another tab is shown; whispers also pulse the tab |
| Input | `Enter` opens (releases the pointer lock, as today), `/` opens prefilled; channel chip (`[Grup]`, coloured) left of the field; `Tab` cycles the send channel; typing `/` shows a hint card of ≤ 6 matching commands above the row (`.k-card`, 14 px) |
| `sm` | log height 3 lines, tab strip shows only the active tab + `…` |
| Events | `Chat.addLine()` emits `chat:line { from, text, channel, local }` for **every** displayed line (net echo, offline local echo, system) — the bubble layer subscribes to this one event |

### 5.2 Speech bubbles (above heads)

**Anatomy**

```
              ┌────────────────────────────────┐
              │ Ahmet                          │  ← name line: body 700 13, channel colour (newest bubble of a stack only)
              │ Selam! Zindana giren var mı?   │  ← text: body font 700 15/20, --text-1, max 3 lines
              └──────────────▼─────────────────┘  ← tail: 8 px triangle, border colour
                      (nameplate / head)
```

| Kind | Source | Look | Notes |
|---|---|---|---|
| `say` | `chat:line` channel `say`, solo `party`/default | flat `--bg-2` at 92 %, 1 px `--ink`, inner 1 px highlight (`--hi`), text `--text-1` | default for the local player when playing alone |
| `party` | channel `party` | same, inner line `--info` | |
| `yell` | channel `yell` | background `color-mix(in srgb, var(--ch-yell) 16%, var(--bg-2))`, inner line `--ch-yell`, text +2 px (17), name caps | 1 per 5 s per sender (GDD_LIFE) |
| `npc` | `NPC.say()` barks and greetings | the same flat family as the player bubbles — `--bg-2` at 92 %, 1 px `--ink`, inner 1 px line `--gold-3`, with a **gold name line** (`--gold-1`, the NPC's name) above the text (`--text-1`); that line is what says "this is from the world". **No parchment and no literal colours** — every bubble kind is built from tokens | max 120 chars, same stacking/animation as player bubbles |
| `typing` | local chat input focused with ≥ 1 character | 3 dots `…` bubble, dots advance with `steps(3)` every 0.35 s | local only (remote typing indicators need a net message — out of scope) |
| emote / whisper | – | **no bubble** (emote shows only as a coloured chat line; whisper never leaves the window) | |

**Numbers**

| Parameter | Value |
|---|---|
| Width | content width, **max 260 css px**, padding 6 × 10, radius `--r-1` |
| Characters | player text truncated to **80** (…), NPC to **120**; wrapped at 260 px, **max 3 lines** (CSS line-clamp), HTML always escaped (`esc()`), item links rendered as `[Eşya Adı]` plain |
| Lifetime | `seconds = clamp(2.2 + 0.05 × chars, 3.5, 8)` (20 chars → 3.5 s, 80 chars → 6.2 s); NPC barks use the `seconds` argument they already pass (4.5 s default) |
| Animation | pop-in 120 ms (opacity 0 → 1 and `translateY 6px → 0`, `steps(4)`), fade-out 400 ms — **no scale** (§3.10, §3.12 rule 1) |
| Stacking | per speaker **max 2 visible**; a new bubble goes at the bottom (nearest the head), the older one is pushed up by `newHeight + 4 px` and drops to 75 % opacity (no scaling); a third is removed with a 150 ms fade. The name line is shown on the newest bubble only |
| Anchor | local player: `object3d` + `height + 0.5 m`; remote players: above the nameplate (`height + 1.1 m`); NPCs: `height × scale + 1.35 m` (as today). Handled by `WorldLabels` (screen-space declutter): bubbles get a **placement priority above nameplates and loot labels** (class `wl-bubble` is placed first) |
| Distance | `say`/`yell`/`npc`: visible ≤ 35 m (opaque to 24 m, fade to 0 at 35 m); `party`: ≤ 45 m **and** the sender must exist in the scene (a party member in another scene only appears in the chat log) |
| Own bubble | 90 % opacity, 14 px text, so it does not hide the reticle; auto-hidden while the chat input is focused |
| Budget | at most **6 live bubbles** on screen (nearest first); the rest queue silently |
| Setting | `Settings.chatBubbles` (exists, default true) disables player bubbles; NPC barks always show |
| Ignore / filter | lines from `chatIgnore` names and text passed through `filterChat()` (GDD_LIFE L-33) never reach the bubble layer |

**Code surface**

```ts
// ui/widgets/Bubbles.ts  (hud module)
export type BubbleKind = 'say' | 'party' | 'yell' | 'npc' | 'typing';
export interface BubbleOpts { kind: BubbleKind; text: string; name?: string; color?: string; seconds?: number; offsetY?: number; maxDistance?: number; own?: boolean }
export interface BubbleHandle { remove(): void }
export class BubbleLayer {                       // owned by UI, uses WorldLabels.add(...) with className 'wl-bubble wl-bare'
  constructor(ui: UI, labels: WorldLabels);
  say(anchor: THREE.Object3D, o: BubbleOpts): BubbleHandle;   // stack manager keyed by the anchor object
  clearFor(anchor: THREE.Object3D): void;
  update(now: number, dt: number): void;         // expiry, stacking offsets, cap of 6, own-bubble hiding
}
// ui/UI.ts:           say(anchor, o) { return this.bubbles.say(anchor, o); }      // + this.bubbles.update(...) in update()
// ui/hud/ChatBubbles.ts: G.events.on('chat:line', ...) resolves the sender -> THREE.Object3D (local player, or a Player in G.world by name) and calls G.ui.say(...)
// entities/NPC.ts:    say(text, seconds) -> G.ui.say(this.object3d, { kind: 'npc', text, seconds, offsetY: ... })   // the old .efs-bark DOM is deleted
```

CSS (`styles/hud-bubbles.css`, new): `.wl.wl-bare { background: none; border: 0; padding: 0; border-radius: 0; font: inherit; }` and `.wl.efs-wl-wrap { … same … }` (that class is used by every NPC / portal / marker label but **has no CSS today**, so those labels currently sit inside the generic `.wl` dark box — see D13); `.bb` base (`position: relative; max-width: 260px; padding: 6px 10px; border: 1px solid var(--ink); border-radius: var(--r-1); animation: bb-in 120ms steps(4) both; box-shadow: inset 0 0 0 1px var(--bb-line); /* no outer shadow, §3.12 rule 4 */`) with `.bb--say/--party/--yell/--npc/--typing` setting `--bb-bg`, `--bb-line`, `--bb-fg` from tokens only (say `--bg-2` / `--hi`, party `--info`, yell `--ch-yell`, npc `--gold-3`, typing `--bg-2` / `--text-4`); `.bb::after` is the 8 px tail; `@keyframes bb-in { from { opacity: 0; transform: translateY(6px); } }` (opacity + rise only, no scale); `.bb-name` and `.bb-text` (`display: -webkit-box; -webkit-line-clamp: 3; overflow: hidden`). The existing `.efs-bark` rules in `menu.css` are removed by UX-30 once `NPC.say` is migrated.

---

## 6. Zindan Bulucu / Raid Bulucu

A WoW "Group Finder" for a serverless P2P game. It is the **front door** to every instance: it answers *what can I run now, on which difficulty, with whom* in one window, and replaces the four-portal / three-tab / party-panel scatter (D16). The **Kehanet Taşı** panel (`keystone`) keeps what is truly keystone business (insert the key, Anahtar Ustası services); the finder reuses its rules (`ladder.ts`) and its start logic.

### 6.1 Identity, key, entry points

- Panel id **`finder`** (`GamePanel`, size **L = 1180 × 720**), title `Zindan Bulucu`, icon `ui-dungeon.svg`.
- Input action **`groupFinder`**, default **`KeyI`** (the GDD_PVP_FINDER / MAP_UI P00 contract: inventory becomes `B` only; keybinding label `Grup Bulucu`), opening the panel id `finder`, titled `Zindan Bulucu`. The `guide` panel (§4.6) takes `Period` (`.`). The same panel later gains the PvP tab of GDD_PVP_FINDER (`Oyuncu'a Karşı`) and a Mitik+ tab as in reference #6; this document specifies Zindan · Raid · Gruplar.
- **Entry points:** micro-menu button (level ≥ 8), the hotkey, `Zindan Bulucu` buttons in the `party` panel and the `guide` panel, the tracker `hint` card, the four dungeon portals in the Kadim Kapılar Salonu (`DungeonPortal.interact()` in `entities/interactables/Portal.ts` and `panelForNpc()` case `'portal'` in `entities/NPC.ts` switch from `keystone` to `finder` with `data: { dungeonId }`; the prompt text becomes `{name}: Zindan Bulucu`), and chat `/zindan`. Open-world dungeon entrances keep opening the keystone pick tab (they carry `returnTo`) in v1.
- The finder may be opened anywhere except inside a dungeon run (then it shows the state `Zindandasın` and the leave button).
- **Deviations from reference #6 (deliberate):** (1) the three bottom tabs (*Dungeons & Raids / Player vs. Player / Mythic+*) become the top tabs `Zindan · Raid · Gruplar` of the shared shell (§7.1; the PvP and Mitik+ tabs come later); (2) the three big round icons on the left (*Dungeon Finder / Raid Finder / Premade Groups*) are replaced by those tabs plus the dungeon list; (3) the *Type* dropdown is the four difficulty buttons; (4) *Random Dungeon* has no equivalent — the player picks a dungeon, there is no random-queue bonus; (5) the Raider.IO-style right panel is the collapsed `Mitik+ Puanı` card (§6.2) without per-bracket run counts. Everything else follows the reference: role row with check marks and the leader flag on top, reward icon row, and *Find Group* as the primary button at the bottom.

### 6.2 Layout — tab "Zindan"

Header: `.k-tabs` `Zindan · Raid · Gruplar (n)`. Body = two columns (list 380, detail 752, gap 16) over a footer strip. The detail pane follows reference #6 from top to bottom: **role row** (tank / healer / DPS / leader flag with check marks) → banner → difficulty → **reward icon row** → the folded **`Mitik+ Puanı`** card (the Raider.IO-style panel of the reference).

```
┌ ZİNDAN BULUCU ───────────────────────────────────────────────────────────────────────────────────── [I] ✕ ┐
│ [ Zindan ]  [ Raid ]  [ Gruplar 3 ]                                                                       │
├──────────────────────────────┬────────────────────────────────────────────────────────────────────────────┤
│ Sv. 12 · EŞ 14 · Hasarcı     │ [ T ✓ ] [ Ş   ] [ H ✓ ] [ ⚑ Lider ]       Rolün: Tank · Hasarcı            │
│ ┌ ★ ÖNERİLEN ──────────────┐ │ ┌ banner 752 × 144 (art) ────────────────────────────────────────────────┐ │
│ │[art]Kemik Mahzeni    8–18│ │ │ [ art ]   KEMİK MAHZENİ                                                │ │
│ │     ◆N ◇K ◇M ◇M+  EŞ 6   │ │ │ Sv. 8–18 · 3 boss · 13 dk · Düşman Gücü 250                            │ │
│ ├──────────────────────────┤ │ └────────────────────────────────────────────────────────────────────────┘ │
│ │[art]Kızıl Dökümhane 18–28│ │ Kuzgunkale'nin altında, unutulmuş kralların kemikleri yatar… (lore)        │
│ │     ◇N ◇K ◇M ◇M+ EŞ 16 # │ │ ZORLUK                                                                     │
│ ├──────────────────────────┤ │ ┌ Normal ──────┐┌ Kahramanlık ─────┐┌ Mitik 0 ───────┐┌ Mitik+ +7 ─────┐   │
│ │[art]Buzul Tahtı     30–40│ │ │Düşman Sv. 12 ││Düşman Sv. 50–60  ││Düşman Sv. 60   ││Anahtar yok     │   │
│ │     ◇N ◇K ◇M ◇M+ EŞ 28 # │ │ │Açık          ││# Sv. 50 gerekli  ││# Sv. 60 gerekli││# Anahtar yok   │   │
│ ├──────────────────────────┤ │ └──────────────┘└──────────────────┘└────────────────┘└────────────────┘   │
│ │[art]Gölge Tapınağı  42–52│ │ Önerilen eşya seviyesi 6 · Sen: 14  (kırmızı: düşükse)                     │
│ │     ◇N ◇K ◇M ◇M+ EŞ 40 # │ │ BOSSLAR  [Bekçi Kaldur] [Ölüçağıran Morkan] [Kemik Lordu Azrakel]          │
│ │                          │ │ EKLENTİLER (Mitik+)  [Tahkimli] [Kin Dolu]                                 │
│ │                          │ │ ÖDÜL  [▣ eşya] [▣ deneyim XP] [▣ 120 altın]                                │
│ └──────────────────────────┘ │ ▸ MİTİK+ PUANI   3910,5 · En iyi +21 Kemik Mahzeni              [▾]        │
├──────────────────────────────┴────────────────────────────────────────────────────────────────────────────┤
│ Mod  (•) Tek Başına   ( ) Grubumla   ( ) Grup Ara                                                         │
│ [ben T H][ ? ][ ? ][ ? ][ ? ]      Durum: Hazır                  [ ZİNDANA GİR ] [Kapat]                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Dungeon list** (`.k-scroll`, cards 380 × 88): `★ ÖNERİLEN` pinned first (= `recommend().dungeon`), then `dungeonList()` order (level 8 → 52). Card: 88 px square **art** (the dungeon's `loadingImage` cropped, else `icon` on a rune-circle background; art tinted by `theme.fogColor`), name (body 700 17), `Sv. 8–18 · EŞ 6 · 13 dk` (14 px; EŞ = `recommendedIlvl(def, 'normal')`, time = `timerSec`, 780 s for Kemik Mahzeni), and a row of four 14 px **difficulty diamonds** `N K M M+`: lit gold = open, gold with ✓ = cleared, grey with lock = locked, absent = not applicable. Locked cards (`#` and hollow ◇ pips in the diagram; the mock shows a level-12 character with example data) are dimmed 55 % with a lock icon and the reason line (`Gereken seviye: 18`). Selected card: 1 px `--gold-2` inner line + `--bg-4` fill. Keyboard: ↑/↓ select, ←/→ difficulty, Enter = primary button.

**Detail pane**
- **Role row** (top of the detail pane, 48 px — reference #6): three toggle buttons 44 × 44 — tank shield `T` (`--role-tank`), healer cross `Ş` (`--role-heal`), DPS sword `H` (`--role-dps`) — each a `.k-slot`-style cell with a 28 px glyph, the role name as tooltip and a 14 px **check mark** (`--ok`) in its corner while selected (unselected = 45 % opacity); then the **leader flag** `⚑ Lider` (a lit indicator, not a toggle: lit while the player leads — solo, or host of the room; tooltip `Grup lideri başlatır`), and right-aligned the text `Rolün: Tank · Hasarcı`. Default selection = role of the active spec (`getSpec(save.spec)?.role`, `dps` below level 10); a class may select only roles one of its specs can fill (`SPECS` filtered by `classId`); several roles are allowed (LFG matches the best fit). Roles are advertised to the lobby (§6.5) and drawn in the party strip.
- **Banner** (752 × 144 — reduced from 180 so the detail pane fits 720 px without scrolling): art, dungeon name (Cinzel Decorative 32 — a big title —, `--gold-1`), stats row with icons `ui-timer` (süre), `ui-enemy-forces` (Düşman Gücü), `ui-boss` (boss sayısı).
- **Lore:** `def.lore`, 2 lines, `--text-2`.
- **Difficulty selector:** four buttons 176 × 72 (`.k-btn` family, selected = 1 px `--gold-2` inner line):

| Button | `LadderDiff` | Line 2 | Line 3 (state, from `difficultyState`) |
|---|---|---|---|
| Normal | `normal` | `Düşman Sv. {enemyLevel}` | `Açık` / `✓ Temizlendi` / `Gereken seviye: {n}` / quest gate text (`cardText`) |
| Kahramanlık | `heroic` | `Düşman Sv. 50–60` | `Sv. 50 + Normal temizliği gerekli` (`locked_level` / `locked_clear`) |
| Mitik 0 | `mythic` | `Düşman Sv. 60` | `Sv. 60 + Kahramanlık temizliği gerekli` |
| Mitik+ | `mythicplus` | `Anahtar +{level}` or `Anahtar yok` | `Açık` / `Tükenmiş` / `Anahtarın {başka zindan} için` (key_other) / `Anahtar yok` |

Lock states: `LOCKED_KINDS` from `keystone.ts` (`locked_level`, `locked_quest`, `locked_clear`, `locked_key`) dim the button (55 %) and show a lock icon; clicking a locked button shows `gateToast()` (existing text) and keeps the selection. `key_other` and `depleted` are selectable (leader can pick any member's key, `holders()` logic of `keystone.ts` is reused). The recommended difficulty gets a `★` chip (closest enemy level to the character, as `difficultyCards` does today).
- **Recommended item level:** `recommendedIlvl(def, diff, keyLevel)`; shown as `Önerilen eşya seviyesi 6 · Sen: 31`, red `—eşyaların zayıf` when `isUnderGeared` (never a hard gate).
- **Bosses:** one chip per `def.bosses[]` (`BOSSES[bossId].name`, icon `ui-boss`), done-ticks for the character's cleared bosses of this difficulty when known (else none).
- **Affixes** (Mitik+ only): `affixChips(affixesForLevel(keyLevel))` with tooltips (existing helper).
- **Ödül** (icon row — reference #6 *Rewards*): `.k-slot` 36 px item icons with the rarity frame plus `.k-chip` currency chips (XP, altın) for the selected difficulty, taken from the existing keystone card copy — Normal = dungeon item + XP + gold; Kahramanlık = + a set item (`--rar-set` frame); Mitik 0 = + the first Mitik+ key (`item-keystone` icon); Mitik+ = an item at the key's item level + the key upgrade. Hover = the standard item tooltip; the best Mitik 0 time (`bestM0Sec`) sits right-aligned as plain text. If the data ever carries a daily first-run bonus, one more line under the icons reads `Bu ödülü bugün 1 kez daha alabilirsin` (the reference's *"1 more time today"*); no such rule exists today, so the line stays hidden.
- **`Mitik+ Puanı` card** (the Raider.IO-style right panel of reference #6, folded into the pane because 380 + 752 leaves no room for a third column at 1180 px): a `.k-card` at the bottom of the detail pane, **collapsed by default** — one 36 px row, `▸ MİTİK+ PUANI  3910,5 · En iyi +21 Kemik Mahzeni  [▾]`, the score in the tier colour of `ratingTier(rating)` (`data/mythicAffixes.ts`; the same number and colour as the rating card of `mplusInfo`). Expanded (the pane then scrolls, `.k-scroll`):

```
┌ MİTİK+ PUANI ───────────────────────────────────────────────────── [▴] ┐
│ 3910,5   {kademe}                  En iyi: +21 Kemik Mahzeni  ★★       │   score 32 px 700 in the tier colour · best run right
│ Bu hafta: 6 koşu · 5 süresinde                                         │
│ En iyi koşular   KM +21 ★★ ✓   KD +18 ★ ✓   BT +16 ★ ✓   GT +12 ✗      │   one chip per dungeon: abbreviation + key level + stars + timed ✓ / ✗
│ Raid ilerleme    Efsun Kalesi 0 / 5 · yakında                  [Aç]    │   placeholder until the raid exists (§6.7)
└────────────────────────────────────────────────────────────────────────┘
```

  Data: `save.mythic.rating` (score and tier name), `save.mythic.best[dungeonId].fortified | tyrannical` (`keyLevel`, `inTime`, `upgrade` → ★ count) for *En iyi koşular*, `save.mythic.weekly.runs` for *Bu hafta*. Reference #6's run counts by key bracket (`15+ / 12–14 / 10–11 …`) would need a run history the game does not store, so they are left out. `Aç` opens `mplusInfo`; the full-size version of this card is the planned **Mitik+ tab** (§6.1).

**Footer**
- **Roles** are not in the footer any more: they are the **role row** at the top of the detail pane (above). The footer keeps mode, party strip and the primary button.
- **Mode** (segmented, 3 options): **Tek Başına** (default offline or with no peers), **Grubumla** (default when the player is in a room with peers; leader starts, members see `Lider başlatabilir` and a `Hazırım` button), **Grup Ara** (online LFG, §6.5; shows `Çevrimiçi ol: O → Oda Kur` when offline).
- **Party strip:** five slots — the player first (class icon + role pip), then `G.net.peers` members; empty slots dashed with the role pips still needed.
- **Primary button** (`k-btn--primary k-btn--lg`) label by mode/state: `Zindana Gir` / `Hazır Kontrolünü Başlat` (leader) / `Hazırım` (member) / `Grup Ara` → `Aramayı Durdur`. Disabled with a tooltip reason (level gate, not leader, difficulty locked, member level too low `Ahmet için seviye yetersiz (50 gerekli)`).

### 6.3 Queue / listing state machine

The panel and the minimap eye both follow `FinderState` (emitted as `finder:queue`, Appendix A):

| State | Meaning | UI | Next |
|---|---|---|---|
| `idle` | nothing pending | primary = `Zindana Gir` / `Grup Ara` | `listing`, `proposal`, `entering` |
| `listing` | the player's room is announced as an LFG listing (v1 "searching") | button → `Aramayı Durdur`; status `Grubun listelendi · 2 / 5 · aranıyor 0:42`; role slots animate; minimap eye on | `proposal` when somebody joins and the room is ≥ 2; `idle` on stop |
| `proposal` | a ready check is running (`party:readyCheck.active`) | existing `ReadyCheck` HUD card (30 s) **plus** the finder strip showing ✓ / … per member; `Hazırım` / `Reddet` | `entering` when everyone is ready; back to `listing` (or `idle`) on timeout / decline with a toast `Biri hazır değildi` |
| `entering` | `G.net.requestScene('dungeon', params)` sent | button disabled, `Giriliyor…`, loading screen follows | `inrun` after `scene:changed` |
| `inrun` | the local player is inside the instance | panel shows `Zindandasın: {name} · {difficulty}` and `Zindandan Çık` (existing exit/portal logic) | `idle` after the run (`run:completed` / scene change to town) |
| `failed` | start refused (level, party, net) | red status line + toast with the reason | `idle` |

v1 covers `idle → listing → proposal → entering → inrun`. Automatic matching (§6.5 v2) only changes how `listing` finds people.

### 6.4 Start flows (reuse, don't re-implement)

`keystone.ts` builds `DungeonParams` privately (`baseParams`, `enemyLevelFor`, `go`). UX-40 moves that into **`panels/game/runStart.ts`** (new, pure + `G`), re-exported to both panels:

```ts
// runStart.ts
export function buildParams(def: DungeonDef, diff: LadderDiff, opts: { keyLevel?: number; keyOwner?: string; returnTo?: DungeonParams['returnTo'] }): DungeonParams;
export function enemyLevelFor(def: DungeonDef | undefined, diff: LadderDiff, partyAvgLevel: number): number;   // Normal clamp(avg, min, min+10), Heroic clamp(avg, 50, 60), Mythic/M+ 60
export function startRun(params: DungeonParams): void;      // G.net.isAuthority ? requestScene('dungeon', p) : requestSceneFromHost('dungeon', p); toasts on failure
```

| Mode | Steps |
|---|---|
| **Tek Başına** | gate check (`difficultyState` startable, character level ≥ `requiredLevel`) → `startRun(buildParams(def, diff, …))`. Works offline (`isAuthority` is true offline). Party size 1: solo scaling exists in the dungeon rules. |
| **Grubumla** | leader: gates for **every** peer (`peer.summary.level ≥ requiredLevel`) → `G.net.startReadyCheck(\`${def.name} · ${DIFFICULTY_NAMES[diff]}\`)`; when `party:readyCheck` ends with `result.ok` → `startRun`. Member: only `Hazırım` (`G.net.setReady(true)`). Mythic+: the key holder rules of `keystone.ts` (`holders()`, leader may use any member's key). |
| **Grup Ara** | see §6.5. |

### 6.5 Online LFG through the lobby (no server)

The game already announces rooms on the lobby (`ann` / `unann`, `RoomAnnouncement`, `NetSession.announceInput()`), and the `party` panel lists them (`G.net.listRooms()`, `net:rooms`). LFG is an **optional field on that announcement** plus a UI that reads it.

```ts
// net/messages.ts — RoomAnnouncement (append-only, optional; sanitizeAnnouncement validates every field)
lfg?: {
  dungeon: string;                         // dungeon id, '' = "any"
  diff: 'normal' | 'heroic' | 'mythic' | 'mythicplus';
  key?: number;                            // keystone level (mythicplus)
  need: { tank: number; healer: number; dps: number };   // open slots by role (0..5), sum = maxPlayers − players
  ilvl?: number;                           // minimum item level the leader asks for (also maps to the existing minIlvl)
  note?: string;                           // ≤ 40 chars, sanitizeText
};
// RoomInfo (NetSession) gets the same optional `lfg` through the listing; types/character.ts CharacterSummary gets `role?: 'tank' | 'healer' | 'dps'`
// NetSession: setLfg(listing | null)  → stores it and re-announces (rev++);  announceInput() includes it.
```

**v1 (ships first):**
1. `Grup Ara`: if the player is not in a room, the finder calls `G.net.hostRoom({ name: 'Zindan: Kemik Mahzeni (Normal)', maxPlayers: 5 })` (same call as the party panel, local transport off) and `G.net.setLfg({ dungeon, diff, need })` where `need` = (5 − 1) distributed as the standard composition **1 tank, 1 healer, 3 dps minus the roles the host declared** (host `Hasarcı` → need 1/1/2; host selects several roles → the first matching). If already in a room, the leader just sets the listing.
2. The **Gruplar** tab (§6.6) of other players shows the listing; `Katıl` = `G.net.joinRoom(roomId)`. The host's slot strip fills as peers arrive (`party:changed`); each joiner announces `role` in its `CharacterSummary`; `need` is recomputed and re-announced.
3. When the room is full or the leader presses the primary button (`Hazır Kontrolünü Başlat`), the ready check + start of §6.4 runs. Leaving the finder with an open listing keeps it (minimap eye stays; `Aramayı Durdur` clears `lfg` via `setLfg(null)`).

**v2 (optional, UX-41b):** a *queue ticket* `lfgq { name, classId, level, ilvl, roles[], dungeon|'any', diff }` broadcast on the lobby channel by solo players pressing `Grup Ara` without a room; the lobby peer with the lowest `peerId` hash among tickets for the same dungeon+diff forms the group (1 T, 1 H, 3 D, fallback "any role" after 60 s), sends invites, and the invited peers join the formed room automatically after `Kabul` (40 s proposal card). Same `FinderState` machine, no new UI.

### 6.6 Tab "Gruplar" (LFG listings)

Table of listings, `G.net.startBrowsing()` while the tab is visible (as the `party` panel does), refreshed on `net:rooms`:

| Column | Content |
|---|---|
| Zindan | art 28 px + name |
| Zorluk | chip (`Normal`, `Kahramanlık`, `Mitik 0`, `Mitik+ +7`) coloured as the selector |
| Lider | class icon (class colour) + name + `Sv. 24` |
| Roller | five 14 px role pips: filled = member present (shield blue / cross green / sword red), hollow = open slot |
| EŞ | `ilvl` requirement; red when above the player's item level |
| Ping | coloured dot (existing `pingColor`) |
| – | `Katıl` (`k-btn--sm`), disabled with reason (full, in progress, version, level, item level, password) |

Filters row: dungeon dropdown, difficulty, `Rolüme uygun` (open slot for a chosen role), `Şifresiz`. Rooms **without** `lfg` appear under a collapsed `Diğer odalar (n)` group using the existing `activityText`. Empty state: `Şu an listelenmiş grup yok.` + buttons `Kendi Grubunu Listele` (switches to mode Grup Ara) and `Tek Başına Gir`. Tab badge = number of matching listings.

### 6.7 Tab "Raid" (Efsun Kalesi — coming soon until the data exists)

Same two-column layout with one card: **Efsun Kalesi** (GDD_V2 §9) — banner art (violet citadel; use the loading-screen image if the dungeon def exists, else a rune-circle plate), 5 boss silhouettes (`???`), difficulties **Normal / Kahramanlık / Mitik** with the unlock rules of GDD_V2 §9.2 (`Seviye 60 + bir Mitik 0 temizliği` / `Normal'de Yıldızkanat` / `Kahramanlık'ta Yıldızkanat + Mitik+ puanı ≥ 800`), recommended item levels **62 / 70 / 76**, weekly lockout ticks (5 boxes, disabled) and a `Hazırım`/`Raid'e Gir` footer. **Feature flag:** `DUNGEONS['efsun_kalesi']` (or `getDungeon`) absent → the whole tab content is dimmed under a gold ribbon `YAKINDA`, the primary button disabled with the tooltip `Efsun Kalesi henüz açılmadı.`; present → the tab behaves like the Zindan tab with `DungeonDef.raid` data (boss order, brez counts, lockout) and `buildParams` carrying `enemyLevel` 62/64/66 and `partySize`.

### 6.8 Minimap / HUD hooks

While `FinderState` is `listing` / `proposal` / `entering` the minimap shows the **LFG eye** (§2.9); clicking it opens the finder. A small chat system line announces `Zindan Bulucu: Grup aranıyor — Kemik Mahzeni (Normal)`. The ready-check card (`ReadyCheck`) is unchanged and already global.

### 6.9 Files and data

New: `src/ui/panels/game/finder.ts` (panel), `finderModel.ts` (pure: list rows, difficulty button states, role defaults, need-by-role, listing filters — unit-checkable from `dev/panels-game.html`), `runStart.ts`, `src/ui/styles/panels-finder.css`. Modified by UX-40: `party.ts` (a `Zindan Bulucu` button), `entities/interactables/Portal.ts` and `entities/NPC.ts` (`panelForNpc` portal case) → open `finder` (two one-line changes; `NPC.ts` is otherwise untouched by UX-40). `ladder.ts` is **not** edited (its helpers are imported as they are). `keystone.ts` is migrated to `runStart` later (UX-52a). **Contracts owned elsewhere:** `core/Input.ts` (`finder`) and `core/events.ts` (`finder:queue`) = UX-00; `net/messages.ts`, `NetSession.ts`, `types/character.ts` (`role?`) = UX-41 (§8.2).

---

## 7. Panel consistency pass

Today there are **two window systems** (`GamePanel`/`windowFrame` in `panels/game/base.ts` with `pg-*` CSS, `ItemPanel` in `panels/items/PanelBase.ts` with `pi-*` CSS), a third tooltip frame (`pg-tip`) next to `TooltipLayer` (`.tt`), and per-panel sizes from 436 to 1560 px. The pass makes **one shell** with the same header, close button, tabs, footer, sizes, docks and keyboard hints; panel *content* keeps its own classes.

### 7.1 The shared shell

Built by `src/ui/kit/chrome.ts` (UX-00), adopted by `windowFrame()` (UX-50) and `ItemPanel` (UX-51) as thin adapters — **their public APIs do not change**.

```
.k-win.k-frame  (position: absolute; zoom: max(0.9, var(--ui-scale)); max-width/height: calc(100% / zoom − 24px))
 ├ .k-head        height 36; flex; gap 10; padding 0 8px 0 12px; flat bar: background var(--bg-4), solid; inner top highlight;
 │                border-bottom 1px #000; draggable (non-modal windows)
 │  ├ .k-head-ico   20 px glyph, --text-2 (white SVG mask, no gradient)
 │  ├ .k-title      body font 15 / 700 uppercase, letter-spacing .08em, --text-1, `toLocaleUpperCase('tr-TR')` (no serif, no gold gradient)
 │  ├ .k-title-key  `.k-key--dim` chip with the panel hotkey, e.g. [N]  (omitted when the panel has none)
 │  ├ (spacer)
 │  └ .k-x          24 × 24 close; flat --bg-3 + 1 px #000; hover: --bad 40 % fill + white ✕; Esc closes the top window
 ├ .k-tabs        optional, 30 px (`.k-tab`, §3.5); badge dot for news
 ├ .k-body.k-scroll   padding 16; flex 1; sections use .k-card / .k-well / .k-sep
 └ .k-foot        min-height 36; border-top 1px #000; padding 6 16;  left: .k-hints (13 px, key caps)   right: buttons (.k-btn)
```

| Size class | Width × height (css px, before zoom) | Typical panels |
|---|---|---|
| **S** | 480 × auto (max 620) | inventory, stash, vendor, guide (560), trainer, dialog, game menu (360) |
| **M** | 780 × 600 | skills, blacksmith, quest log, settings, bounty, run summary, credits, waypoints, keystone (900) |
| **L** | 1180 × 720 | talents (N), map (M), finder (`I`), party (O), M+ info (J), character (C, §7.7) |

All windows clamp to the viewport (`max-width: calc(100% / var(--pg-zoom) − 24px)` as `pg-win` does now). **XL is gone** (talents 1560 × 940 → L).

**Backdrop:** only **modal** windows (welcome, confirm, death card, game menu) get the dim radial backdrop; every other window leaves the world visible and takes clicks through `.ui-capture`. This stops the 55–82 % black wash that hides the open world while a panel is open (D14).

**Docks and dragging:** `dock: 'left' | 'right' | 'center'` decides the default position (`left: 24`, `right: 24`, centred; top 56). Defaults: inventory → right, character → left, trade windows (vendor / stash / blacksmith) → left with the bag docked right (the existing `openCompanionBag` behaviour), everything L → center (except the character sheet, which docks left), quest log → left, skills → center. A window opening on an occupied dock cascades 28 px (existing clash logic). Non-modal windows drag by `.k-head`; the position is saved per id as **fractions of the viewport** in `localStorage['efsun.win.v1.<id>']` (px values of `pi.pos.<id>` are ignored — resolution-safe). Dragging divides pointer deltas by the CSS `zoom`. Click brings a window to the front (existing). 

**Tooltips:** one frame — `.tt` (`TooltipLayer`). `base.ts`'s `Tip`/`bindTip` delegate to `G.ui.showTooltipFor(owner, html, x, y)`; the `pg-ttip-*` content classes stay but sit inside `.tt`. The item tooltip (`itemTooltipHTML`) is unchanged.

**Open/close:** 160 ms pop (`k-win-in`), 100 ms fade out (§3.10). Panels keep their own sounds (`ui_open` / `ui_close` come from `UI.syncPanel`).

**Component adoption (replace, don't duplicate):**

| Concern | Today | Becomes |
|---|---|---|
| Window frame, header, close | `pg-win/pg-head/pg-x`, `pi-win/pi-head/pi-x` | `k-win/k-head/k-x` |
| Tabs | `pg-tab`, `pi-tab` (+ badge `em`) | `k-tab` (+ `.k-badge`) via `buildTabs()` |
| Buttons | `pg-btn` (+variants), `pi-btn` | `k-btn` (+ `--primary --danger --ghost --lg --sm`); `button()` in `base.ts` returns a `k-btn` |
| Toggle / slider / segmented | `pg-toggle`, `pg-range`, `pg-seg` | same behaviour, restyled with tokens; classes kept |
| Scrollbars | per-panel | `.k-scroll` |
| Confirm dialog | `askConfirm` (`pg-confirm`) | same API, `k-frame` box, `k-btn` buttons |
| Empty text | `pg-empty` | `emptyState()` (§7.5) |
| Font sizes | 9–22 px mixed | `--fs-*` tokens, nothing information-bearing < 13 px |

### 7.2 Kit surface (`src/ui/kit/*`, created in UX-00)

```ts
// chrome.ts
export type PanelSize = 'S' | 'M' | 'L';
export interface ChromeOpts { title: string; icon?: string; keyAction?: InputAction; size?: PanelSize; modal?: boolean; closable?: boolean; hints?: string[]; onClose(): void }
export interface Chrome { root: HTMLElement; head: HTMLElement; titleEl: HTMLElement; tabsHost: HTMLElement; body: HTMLElement; foot: HTMLElement; hintsEl: HTMLElement; btnsEl: HTMLElement; setTitle(t: string): void; setHints(list: string[]): void }
export function buildChrome(o: ChromeOpts): Chrome;
export function buildTabs(items: { id: string; label: string; icon?: string }[], onChange: (id: string) => void, initial?: string): { el: HTMLElement; select(id: string, silent?: boolean): void; badge(id: string, text: string): void; current(): string };
export function hintBar(items: string[]): HTMLElement;      // "Sağ Tık: kuşan · Esc: kapat" with each key rendered as .k-key--dim; the last item is always "Esc: kapat"
export function emptyState(o: { icon: string; title: string; text: string; action?: { label: string; onClick(): void } }): HTMLElement;
// controls.ts
export const keyCap = (label: string, dim = true): HTMLElement;
export const chip = (text: string, color?: string): HTMLElement;
export const badge = (n: number | string): HTMLElement;
```

### 7.3 Per-panel table

| Panel (id) | Key | Size · dock | Tabs | Footer hints | Specific changes in the pass |
|---|---|---|---|---|---|
| Çanta (`inventory`) | B | S 480 · right | as today | `Sağ Tık: kuşan · Ctrl+Tık: kilitle · Shift+Sağ Tık: sat` (the `context()` strings that exist) | rarity frames from `.k-slot[data-rarity]`; bag-fullness chip in the header (`23 / 48`); empty state |
| Karakter (`character`) | C | **L** 1180 × 720 · left | Karakter · Unvanlar · Ekipman | `Sağ Tık: çıkar · Sürükle: eşyayı yuvaya bırak` | the full sheet of §7.7: header `Sv. N Sınıf`, item level equipped / overall, Mitik+ score, gear columns with item level / `+N` / sockets, model, collapsible stat groups |
| Yetenek Kitabı (`skills`) | K | M · center | Beceriler · Uzmanlık | `Sürükle: beceriyi yuvaya bırak` | §7.4 grouping |
| Yetenekler (`talents`) | N | **L** 1180 × 720 · center | 3 (existing) | `1 2 3 sekme · [ ] uzmanlık · / ara · Enter uygula · Ctrl+Z geri al` (GDD_TALENTS §5.8) | only shell + size; canvases refit |
| Görev Defteri (`questlog`) | L | M 780 × 600 · left | Aktif · Alınabilir · Tamamlanan | `Takip et: takipçi ve ok bu göreve bakar` | kill rows with bars + `Haritada göster`, empty states, region groups kept |
| Harita (`map`) | M | **L** · center | – (legend filters) | `Sürükle: haritayı kaydır` | giver pins in town, recommended-region outline, zone-progress card (§4.5) |
| Grup (`party`) | O | **L** 1180 × 720 · center | – | – | `Zindan Bulucu` button; empty-state copy (§7.5) |
| Kehanet Taşı (`keystone`) | – | M 900 × 600 · center | Anahtar · Zindan Seç · Usta | – | `Zindan Seç` tab keeps working for world entrances and shows a `Zindan Bulucu'yu kullan` banner; start logic via `runStart.ts` |
| **Zindan Bulucu** (`finder`) | I | **L** · center | Zindan · Raid · Gruplar | `↑↓ zindan · ←→ zorluk · Enter başla` | §6 |
| **Ne Yapmalıyım?** (`guide`) | `.` | S 560 · center | – | – | §4.6 |
| **Hoş Geldin** (`welcome`) | – | modal 640 | – | `Enter: başla` | §4.2 |
| Ayarlar (`settings`) | Esc → Ayarlar | M · center | existing Grafik · Ses · Kontroller · Oyun + one new tab **Arayüz** | – | new **Arayüz** tab: UI size slider (0.7–1.5), `Yoğunluk: Orta` read-out, `Yardım ipuçları`, `Görev oku`, `Hasar ölçer: Otomatik / Hep / Hiç`, `Çubuk 2`, `Çubuk 3`, `Boş yuvaları göster`, `Oyuncu simgesi`, `İstatistik satırı`, `Minimap saati` (the HUD-style row stays hidden: ElvUI is the only skin), buttons `Arayüzü Düzenle` and `İpuçlarını Sıfırla` |
| Oyun Menüsü (`gameMenu`) | Esc | S 360 · modal (light backdrop) | – | – | + `Başlangıç Rehberi` (reopens welcome), + `Arayüzü Düzenle`, + `Zindan Bulucu` |
| Tüccar / Simyacı (`vendor`) | NPC | S 500 · left (bag right) | as today | `Shift+Sağ Tık: sat` | shell only |
| Depo (`stash`) | NPC | S 480 · left | – | `Sağ Tık: depoya koy` | shell only |
| Demirci (`blacksmith`) | NPC | M 780 · left | as today | – | shell only (716 → 780) |
| Mitik+ Bilgisi (`mplusInfo`) | J | **L** · center | as today | – | shell + size; key J hidden from the micro row until level 50 |
| İlan Tahtası (`bounty`) | NPC | M 780 × 600 · center | – | – | kill/target rows with bars; empty state `Bugünün görevleri tamamlandı` |
| Eğitmen (`trainer`) | NPC | S · center | – | – | shell only |
| Koşu Özeti (`runSummary`) | auto | M · center (modal-like, light backdrop) | – | – | shell only |
| Ölüm (`death`) | auto | card (pass-through) | – | – | unchanged layout; tokens |
| Işınlayıcı (`waypoints`) | NPC | M · center | – | – | shell + empty state |
| Görev Verici (`dialog`) | NPC | S 560 · center | – | – | portrait slot + `.k-card` text + reward line |
| Yapımcılar (`credits`) | menu | M · center | – | – | shell only |

Future panels (crafting, home, professions, paragon, bestiary) use `buildChrome()` from day one.

### 7.4 Skill book (K): fewer things at once

Layout (M 780 × 560): a **bar editor** strip on top — the 12-slot bar of CORE_MECHANICS §10.1 in the HUD's own order (9 skills `LMB RMB Q E R 1 2 3 G` + 3 majors `X V T`) — learned skills below, locked ones collapsed.

```
┌ YETENEK KİTABI ───────────────────────────────────────────── [K] ✕ ┐
│ [ Beceriler ] [ Uzmanlık ]                              [ara…]     │
│ ÇUBUK  [SolT][SağT][Q][E][R][1][2][3][G] │ [X][V][T]               │  drop targets (12 slots, same order as the HUD grid); locked slots appear as grey "Sv.N" chips here only
│ ▾ ÇUBUKTA (6)                                                      │
│   [ikon] Kalkan Darbesi  SağT · 6 sn     [ikon] Hücum  Q · 10 sn   │  2-column skill cards (56 px icon, name 17, tags 13)
│ ▾ ÖĞRENİLDİ — ÇUBUKTA DEĞİL (1)  !                                 │  gold "!" + hint "Sürükleyip yuvaya bırak"
│   [ikon] Savaş Sancağı  Sv. 25                                     │
│ ▸ AÇILACAK (2)   Sv.10 Meydan Okuma · Sv.15 Kalkan Duvarı          │  collapsed by default; icons dimmed
│ ▾ UZMANLIK: KORUYUCU (3)                                           │  spec skills, only the active spec
└────────────────────────────────────────────────────────────────────┘
```
Rules: (1) skills of **other** specs are hidden (toggle `Diğer uzmanlıkları göster`); (2) locked skills are listed only inside the collapsed **Açılacak** group, sorted by unlock level, showing `Sv. N`; (3) the detail pane (right) is replaced by the standard tooltip on hover/selection to give the cards room; (4) a skill learned but not on the bar is the only thing that raises the `K` micro badge; (5) search matches name and tags (diacritic-insensitive); (6) group open/closed state persists per character in `localStorage` (`efsun.skillbook.v1`).

### 7.5 Empty states (never a bare "boş")

`emptyState()` = 64 px dim icon, title (body 700 17), one sentence (15 px, `--text-2`), optional primary button. Copy table (Turkish):

| Where | Title | Text | Button |
|---|---|---|---|
| Quest log › Aktif | Aktif görevin yok | Kuzgunkale ve köylerdeki ünlem işaretli kişilerle konuş. | `Ne Yapmalıyım?` |
| Quest log › Alınabilir | Şu an alabileceğin görev yok | Yeni görevler seviye atladıkça açılır. | – |
| Çanta | Çantan boş | Yaratıklardan ve zindanlardan eşya düşer. | – |
| Keystone › Anahtar | Anahtarın yok | Bir zindanı Mitik 0'da bitirince Kadim Anahtar Taşı kazanırsın. | `Zindan Bulucu` |
| Party › odalar | Şu an açık oda yok | Kendi odanı kur ve kodu arkadaşlarınla paylaş. | `Oda Kur` |
| Finder › Gruplar | Şu an listelenmiş grup yok | Kendi grubunu listele ya da tek başına gir. | `Kendi Grubunu Listele` |
| Bounty | Bugünün görevleri tamamlandı | Yeni görevler her sabah 04:00'te gelir. | – |
| Skill book › Açılacak | Yeni beceri yok | Seviye atladıkça yeni yetenekler açılır. | – |
| Waypoints | Henüz taş keşfetmedin | Açık dünyada ışınlayıcı taşlara F ile dokun. | `Haritayı Aç` |
| Tracker (`hint` mode) | Ne yapmalıyım? | {recommend().quest / dungeon summary} | `Aç [.]` |

### 7.6 Keyboard hints standard

Every panel declares `hints: string[]` in its chrome options (strings of the form `Tuş: açıklama`); `hintBar()` renders keys as `.k-key--dim` and **always appends `Esc: kapat`**. Hints must describe behaviour that exists (the table above lists only real ones). The header `.k-title-key` chip shows the panel's hotkey from `G.input.bindingLabel(action)` so rebinding updates it.

---

### 7.7 Karakter sayfası (`character`, key `C` — reference #5)

The character sheet follows reference #5 (name + level + class on top, the model in the middle, gear columns with item levels, the big item level, M+ score, durability, tabs and collapsible stat groups). It keeps today's logic in `panels/items/CharacterPanel.ts` — `CharacterPreview`, `LEFT` / `RIGHT` slot arrays, `makeSlot()` with its drag / drop / right-click-unequip / tooltips, the `CATS` stat sections with their collapse state and the green / red change flash — and adds the structure below. Size **L** (1180 × 720), dock left; tabs `Karakter · Unvanlar · Ekipman`. Body columns: gear 272 · model 250 · gear 272 · stats 1fr (330), 8 px apart.

```
┌ KARAKTER ──────────────────────────────────────────────────────────────────────────────────────────────────── [C] ✕ ┐
│ [ Karakter ]  [ Unvanlar ]  [ Ekipman ]                                                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Sv. 60 Gölge Avcısı                             EŞ 326,9 / 327,8                                Mitik+ Puanı 3910,5 │
│ Ahmet                                           (kuşanılan / toplam)                                                │
│ ┌ SOL ────────────────────┐ ┌ MODEL ────────────────┐ ┌ SAĞ ────────────────────┐ ┌ İSTATİSTİKLER ────────────────┐ │
│ │[▣] Çelik Miğfer         │ │                       │ │          Kemik Kolye [▣]│ │▾ NİTELİKLER                   │ │
│ │    334 · +12 ◆◆         │ │                       │ │            321 · +9  ◆◇ │ │  Zeka                    3.305│ │
│ │[▣] Omuz Plakası         │ │                       │ │                Kuşak [▣]│ │  Dayanıklılık           40.264│ │
│ │    321 · +9  ◆◇         │ │                       │ │                316 · +6 │ │  Maks. Can             805.280│ │
│ │[▣] Zırh Göğüslük        │ │   (3B model, döner)   │ │         Mühür Yüzüğü [▣]│ │▾ İKİNCİL                      │ │
│ │    330 · +10 ◆          │ │                       │ │             324 · +10 ◆ │ │  Kritik Şansı           26,15%│ │
│ │[▣] Savaş Eldiveni       │ │                       │ │          Yüzük · boş [▣]│ │  Kritik Hasarı          16,22%│ │
│ │    318 · +7             │ │                       │ │                       — │ │  Saldırı Hızı           22,29%│ │
│ │[▣] Pantolon             │ │                       │ │        Gölge Hançeri [▣]│ │  Bekleme Süresi Azaltma 28,15%│ │
│ │    325 · +8  ◇          │ │                       │ │            336 · +14 ◆◆ │ │▾ ÜÇÜNCÜL                      │ │
│ │[▣] Demir Çizme          │ │ Dayanıklılık: Sağlam  │ │         Yan El · boş [▣]│ │  Can Çalma               1,20%│ │
│ │    329 · +11 ◆          │ │ [ ] Kaskı gizle       │ │                       — │ │  Kaçınma Şansı           1,82%│ │
│ │                         │ │ TEC ▓▓▓▓░░░░░░  %41   │ │                         │ │  Hareket Hızı            0,00%│ │
│ │                         │ │                       │ │                         │ │▸ SALDIRI · SAVUNMA · FAYDA    │ │
│ └─────────────────────────┘ └───────────────────────┘ └─────────────────────────┘ └───────────────────────────────┘ │
│ Sağ Tık: çıkar · Sürükle: eşyayı yuvaya bırak · Esc: kapat                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

*(illustrative rows; 1 character ≈ 10 px)*

| Part | Spec |
|---|---|
| **Header strip** (52 px) | Left: `Sv. {level} {className}` (24 px 700 in the **class colour** — reference: *Level 90 Arcane Mage*) and under it the character name (15 px, `--text-2`). Centre: the **big item level** `EŞ 326,9 / 327,8` — *equipped / overall* (24 px 700, `--rar-epic-text`; caption `kuşanılan / toplam`). Equipped = `CharacterState.itemLevel()` (today's `pi-ilvl`); overall = the average of the best item per slot found in equipment **and** bag, so the gap says "an upgrade is sitting in your bag" (tooltip explains both). One decimal, decimal comma. Right: `Mitik+ Puanı 3910,5` (20 px 700 in `ratingTier(rating).color`, the value of `save.mythic.rating`; click opens `mplusInfo`; `–` while 0). |
| **Gear columns** | 272 px each, 6 rows of 56 px, 6 px apart, slot order = today's `LEFT` (Kask … Çizme) and `RIGHT` (Kolye, Kemer, Yüzük, Yüzük, Silah, Yan El) arrays; the right column is the mirror image (text right-aligned, icon on the outer edge). Row = `.k-slot` 48 px (`data-rarity` border, empty = dark cell with the dim slot glyph) + two text lines: **line 1** item name (15 px 700, `--rar-*-text`, ellipsis), **line 2** the **item level** (15 px 700 in the rarity text colour; `—` when empty), the **upgrade track** chip `+12` (13 px 700, `--gold-1`; the game's `+N` upgrade, 0–15, plays the role of the reference's `(6/6)`) and the **socket icons** (14 px: a gem icon per filled `sockets[]` entry, a hollow ◇ per empty one, plus one rune pip for `tilsim`). A broken item (`broken`) gets a `--bad` inner outline and `Kırık` instead of its item level (click → `blacksmith`). Tooltips, drag & drop, right-click / double-click quick actions are unchanged. |
| **Model column** | `CharacterPreview(250, 340)` as today. Under it: the `Kaskı gizle` checkbox (exists), the thin XP bar (exists, 6 px, tooltip `Tecrübe`) and the **durability chip**. The game has no wear percentage (reference: *Durability: 89%*), only the **Kırık** state (GDD_ITEMS_V2 §2.6), so the chip reads `Dayanıklılık: Sağlam` (green) while nothing equipped is broken and `Dayanıklılık: Kırık 2` (red, click → `blacksmith`) otherwise. |
| **Stat groups** | Right column, `.k-scroll`, **collapsible** (state in `localStorage['efsun.charsheet.v1']`, group header = icon + `.k-sub` + ▾ / ▸). **Nitelikler** (open): Güç, Çeviklik, Zeka, Dayanıklılık (the existing "always" rows) + Maks. Can. **İkincil** (open): Kritik Şansı, Kritik Hasarı, Saldırı Hızı, Büyü Hızı, Bekleme Süresi Azaltma. **Üçüncül** (open): Can Çalma, Kaçınma Şansı, Hareket Hızı, Hasar Azaltma. **Saldırı · Savunma · Fayda** (collapsed): today's `CATS` sections `off`, `def`, `util` unchanged. Rows: label left (15 px, `--text-2`), value right (15 px 700, `--text-1`; tr-TR `3.305`, `26,15%`); a changed value flashes green / red for 600 ms (existing `prevStats`). Rows with a zero value in a secondary / tertiary group are shown (the reference lists `0.00%` too). |
| **Tabs** | `.k-tabs`: `Karakter` (this sheet) · `Unvanlar` (titles) · `Ekipman` (equipment sets). The last two are **stubs in this pass** with `emptyState()` bodies — `Henüz unvanın yok` / *Zindan ilk temizlikleri ve başarımlar unvan kazandırır.* (button `Görev Defteri`) and `Ekipman setleri yakında` / *Kuşandığın eşyaları kaydedip tek tıkla değiştireceksin.* (button `Çantayı Aç`) — present so the reference structure is in place, never a bare "boş" (§7.5). |
| **Deviations from reference #5** | *Durability %* → `Sağlam / Kırık n` (no wear system); *`(6/6)` upgrade track* → `+N`; the four gem / rune icons at the bottom right are omitted (gems sit on the items); the M+ score has its tier colour instead of a fixed orange. |

Footer hints: `Sağ Tık: çıkar · Sürükle: eşyayı yuvaya bırak` (both exist today); header chip `[C]`. The panel fits a 1280 × 720 window (the shell clamps to the viewport, §7.1).

---

## 8. IMPLEMENTATION PLAN

Small Haiku packages, **waves of ≤ 3, file-disjoint inside a wave**, each ending with `npx tsc --noEmit` = 0 errors in its files. After every wave a Haiku QA agent runs Appendix C and scores the UI rubric (ROADMAP #6, #11). Order: **CSS tokens / kit → HUD skeleton → HUD widgets → onboarding → chat bubbles → finder → panel pass.** "Contracts first" is the repo's own pattern: Wave 0 creates every shared file edit and compile-only stub so later waves never touch the same file.

### 8.1 Wave schedule

| Wave | Packages (parallel) | What the player gets after the wave |
|---|---|---|
| **W0** foundations | **UX-00** tokens + kit + contracts · **UX-01** HUD skeleton · **UX-02** panel skeleton | the old UI turns flat dark and condensed (palette + font aliases), nothing moves; every later wave is conflict-free |
| **W1** HUD core | **UX-10** action bars + XP strip + composition flip · **UX-11** unit frames · **UX-12** right column + meter | the ElvUI action grid with progressive reveal, the centre player / target frames with integrated resource bars, the XP strip, one context tracker, quest feed, the Details!-style meter |
| **W2** corner + onboarding | **UX-13** corner / banners / edit mode · **UX-20** objective arrow + tips · **UX-21** welcome + guide + markers | micro menu, loot, banners; welcome card, arrow, tips, "Ne yapmalıyım?", quest markers |
| **W3** chat + net | **UX-30** speech bubbles · **UX-31** chat window · **UX-41** LFG net contract | bubbles above heads, tabbed chat |
| **W4** finder + shells | **UX-40** Zindan/Raid Bulucu · **UX-50** `pg` shell · **UX-51** `pi` shell | the finder; every window in one style |
| **W5** content pass | **UX-52a** game panels · **UX-52b** item panels · **UX-60** cleanup + docs | panel sizes, hints, empty states, skill book grouping, the full character sheet, dead CSS gone |

Backlog (not scheduled): **UX-41b** auto-matching queue tickets (§6.5 v2); **UX-70** optional "Metin2 Klasik" skin (stone board + gauges around the same `.ab-btn` buttons; revives the parked `Metin2Bar.ts` / orbs files).

### 8.2 Packages

Conventions: **Own** = files the package may edit; **New** = files it creates; everything else is read-only. Every package may also add its own dev buttons as `src/dev/hud-ext/<package>.ts` (loaded by the glob added in UX-00). "Done when" is checked by the author with the named dev page and by the wave QA.

#### UX-00 — Tokens, kit and contracts · owner: hud (+ one-line core appends) · W0 · depends: –
- **New:** `src/ui/styles/tokens.css`, `src/ui/styles/kit.css`, `src/ui/kit/chrome.ts`, `src/ui/kit/controls.ts`, `src/ui/kit/index.ts`, `src/ui/widgets/classColors.ts`, `src/ui/widgets/numFormat.ts`.
- **Own:** `src/ui/UI.ts`, `src/core/Input.ts`, `src/core/Settings.ts`, `src/core/events.ts`, `src/dev/hud.ts`, `src/main.ts` (font imports only), `package.json` (two dependencies only).
- **Do:**
  1. `tokens.css` = §3.2 verbatim. `npm i @fontsource/roboto-condensed @fontsource/pt-sans-narrow`; add the four weight imports (§3.2) next to the existing `@fontsource/cinzel*` lines in `src/main.ts`; **keep** the Cinzel imports (big titles still use them).
  2. `kit.css` = §3.3 frames, §3.4 type classes, §3.5 buttons / tabs / chips / badges / key caps / scroll / sep, **§3.6 `.k-slot`, `.k-aura` and every state rule (copy the CSS block as written)**, §3.7 `.k-bar`, §7.1 shell (`.k-win .k-head .k-head-ico .k-title .k-title-key .k-x .k-body .k-foot .k-hints .k-win--S/M/L .k-win--modal`, `@keyframes k-win-in`), `.k-empty`. Add rules only; edit no existing selector.
  3. `kit/*.ts` = §7.2 (DOM only; `keyAction` hotkey label read through `G.input?.bindingLabel` inside try/catch).
  4. `widgets/classColors.ts` = §3.2 TypeScript mirror (`CLASS_COLORS`, `classColor(id)`; eleven entries, fallback `#e8c46a`) + the one-time dev assert against the `--cls-*` tokens. (`PlayerFrame.ts` / `DamageMeter.ts` adopt it in UX-11 / UX-12.) `widgets/numFormat.ts` = the two formatters of §2.7 — `fmtHealth(n)` (`805K`, `15,2K`, `1,2M`) and `fmtMeter(n)` (always one decimal from 1 000: `226,9K`, `189,0K`) — both tr-TR, pure, with a one-time dev assert (`fmtHealth(805000) === '805K'`, `fmtHealth(15200) === '15,2K'`, `fmtHealth(1240000) === '1,2M'`, `fmtMeter(226900) === '226,9K'`, `fmtMeter(189000) === '189,0K'`).
  5. `UI.ts`: import `./styles/tokens.css` and `./styles/kit.css` **first**; `HOTKEYS` gains `groupFinder → 'finder'` and `guide → 'guide'` (extend the action union type); set `lang="tr"` on `#ui-root`.
  6. `Input.ts`: **Group Finder = `I`, inventory = `B` only.** If the MAP_UI P00 / GDD_PVP_FINDER PV-00 contract already landed (`groupFinder: ['KeyI']`, `inventory: ['KeyB']`, `Settings.bindingsRev` migration), reuse it; otherwise add exactly that contract (it is identical in both documents): action `groupFinder` (label `Grup Bulucu`), `inventory: ['KeyB']`, and the one-time `Settings` migration that rewrites a saved `inventory` binding containing `KeyI` to `['KeyB']` and sets `groupFinder = ['KeyI']` (`bindingsRev = 1`). New: action `guide` (`['Period']`, label `Ne Yapmalıyım?`), `codeLabel` entry `Period: '.'`. (`skill_s4` / `G` belongs to the CM12 kit package, not to this one.)
  7. `Settings.ts` (append-only): `showTips: true`, `questArrow: true`, `meterVisibility: 'auto'`, `barGhostSlots: false`, `ufIcon: false` (spec icon in the player frame), `showStats: false` (chat stats line), `showMapInfo: false` (minimap clock / FPS text); `chatFontSize` default 15 and every reader clamps to 13–17; `hudStyle` type becomes `'elvui' | 'metin2' | 'orbs'`, **default `'elvui'`**, plus a one-time `uiRev` migration (`uiRev < 2` → `hudStyle = 'elvui'`, `uiRev = 2`) so existing saves land on the new HUD.
  8. `events.ts` (append-only): `'chat:line'`, `'finder:queue'`, `'quest:pinned'` (Appendix A).
  9. `dev/hud.ts`: move the dev hotkey `.` to `Numpad8` (the guide panel takes `Period`; `,` stays — nothing is bound to `Comma` any more) and fix the header comment; add `import.meta.glob('./hud-ext/*.ts', { eager: true })` and call each module's optional `install(h, dev)` after `window.dev` exists (later packages add their dev buttons in their own `hud-ext/*.ts` files).
- **Done when:** tsc 0; game + `dev/hud.html` boot; `getComputedStyle(document.documentElement).getPropertyValue('--gold-2').trim() === '#e8c46a'` and `--ink` is `#000000`; `document.fonts.check('700 14px "Roboto Condensed"')` is true (Turkish `ğşıİ` render in it); legacy tokens still resolve (the old HUD turns flat dark and the body font changes — expected, nothing moves); `I` and `B` are separate bindings; the `numFormat` dev assert passes (`805K`, `15,2K`, `1,2M` for health vs `226,9K`, `189,0K` for the meter).

#### UX-01 — HUD skeleton · owner: hud · W0 · depends: –
- **New:** `styles/hud-bottom.css`, `hud-frames.css`, `hud-right.css`, `hud-chat.css`, `hud-corner.css`; compile-only stubs `hud/Tracker.ts` (`ContextTracker`), `hud/ObjectiveArrow.ts`, `hud/TipCards.ts`, `hud/QuestFeed.ts`, `hud/FlaskRow.ts`, `hud/XpStrip.ts`.
- **Own:** `styles/hud.css`, `hud/index.ts`, `hud/layoutStore.ts`, `hud/types.ts`, `hud/PlayerFrame.ts` (**only** two new fields: `readonly consHost = div('uf-cons')` and `readonly pipsHost = div('uf-pips')`, not attached anywhere yet).
- **Do:**
  1. Split `hud.css` along its banner comments: *Bottom cluster … player cast bar* → `hud-bottom.css`; *Generic bars* + *Left column* + *Top centre* → `hud-frames.css`; *Right column* → `hud-right.css`; *Bottom-left chat* → `hud-chat.css`; *Bottom-right* → `hud-corner.css`. `hud.css` keeps the header, layers, `.panel-host`, `.ico`, `.hud` root. **Pure move, no value changes.** Import the five files in `hud/index.ts` after `hud-edit.css`.
  2. `hud.css :root`: delete `--hud-gold*`, `--metal-*`, `--shade` (aliased in `tokens.css`), keep `--font-ui: var(--font-body)`; add the three `.hud[data-density]` variable blocks from §2.2 (every row of the table, integers only).
  3. `computeScale()` per §2.2 (min 0.8, `data-density`, `--hud-w`); `HudApi.density`.
  4. Zones (§2.5): add **`.hud-uf`** (pass-through, `inset: 0`, children positioned by `--uf-gap` / `--uf-top`), **`.hud-xp`** (`left: 0; right: 0; bottom: 0; height: var(--xp-h)`), `.hud-ml` (combo + route banner moved in) and `.hud-tip` (tip card slot: bottom-left, directly above the chat, §2.5; `--stats-h` defaults to 0); replace hard-coded 16 px anchors with `var(--gut)`. The new zones are created **empty / unused** and `.hud-bc` / `.hud-br` keep their current anchors: the legacy widgets keep their old parents until UX-10 flips the composition (and UX-10 / UX-13 re-anchor `.hud-bc` / `.hud-br`), so W0 changes nothing visible.
  5. Stubs (constructor signatures are **final**): `new ContextTracker(ui, mythic, quests)` temporarily re-parents `mythic.el` + `quests.el` into one `.trk`; `ObjectiveArrow` and `QuestFeed` hidden on the root, `TipCards` in `.hud-tip`, `FlaskRow` and `XpStrip` hidden placeholders. `ActionBar`'s final constructor is `new ActionBar(ui, { grid: HTMLElement, cons: HTMLElement })` (second argument optional until UX-10). `HudApi` gains `zones`, `tracker`, `tips`, `guideTarget` + `setGuideTarget(npcId | null)` and an optional `adviceLine?: () => string` slot (assigned later by the guide module; the tracker `hint` pane calls it).
  6. `layoutStore.ts` v2 + one-time v1 migration, frame id `tracker` (§2.13); register it in `index.ts`.
- **Done when:** tsc 0; HUD identical at 1920×1080 apart from the palette / font aliases of UX-00 (differences otherwise only from the 0.8 clamp on small windows and the combo counter's new anchor, 48 px / 40 %); edit mode opens/saves; a stored `efsun.uiLayout.v1` is migrated; resizing flips `data-density` and the `--ab-btn` / `--uf-w` variables are visible in devtools; `dev/hud.html` hotkeys unchanged.

#### UX-02 — Panel skeleton · owner: panels-game (+ panels-items CSS split) · W0 · depends: –
- **New:** `styles/panels-shell-pg.css`, `styles/panels-shell-pi.css`; stub panels `panels/game/finder.ts` (`FinderPanel`, id `finder`), `guide.ts` (`GuidePanel`, id `guide`), `welcome.ts` (`WelcomePanel`, id `welcome`).
- **Own:** `styles/panels-game.css`, `styles/panels-items.css`, `panels/index.ts`, `panels/game/index.ts`.
- **Do:**
  1. Split `panels-game.css`: lines 1–340 (header comment through the `/* misc */` block: root, window, typography, buttons, tabs, toggle/slider/rows, cards/bars, item tile, tooltip, confirm, misc) → `panels-shell-pg.css`; the per-panel sections (from line 341) stay. Split `panels-items.css`: the `window` and `tabs` sections (lines 1–188) → `panels-shell-pi.css`; the rest stays. **Pure move.**
  2. `panels/index.ts`: import the two shell files **first** (before `./items` and `./game`, so they precede the per-panel CSS in the cascade).
  3. The three stub panels: `GamePanel` subclass + `windowFrame({ title, icon })` + a `pg-empty` body `Yakında` (finder, guide) / a `Başla` button that closes (welcome); register them in `registerGamePanels`.
- **Done when:** tsc 0; every existing panel is identical apart from the UX-00 palette / font aliases (`dev/panels-game.html`, `dev/panels-items.html`); the stub panels open from the console / dev page (`G.ui.openPanel('finder' | 'guide' | 'welcome')`); Esc closes them. The `I` / `.` hotkeys that open them come from UX-00's `HOTKEYS` entries, so **that check lives in the W0 QA** (Appendix C) — UX-02 stays free of any dependency on UX-00.

#### UX-10 — Action bars, XP strip and composition flip · owner: hud · W1 · depends: UX-00, UX-01
- **Own:** `hud/ActionBar.ts`, `hud/ExtraBars.ts`, `hud/FlaskRow.ts`, `hud/XpStrip.ts`, `hud/index.ts` (**composition flip only**, below), `styles/hud-bottom.css`, `styles/hud-extras.css`. **Not touched:** `Metin2Bar.ts`, `hud-metin2.css`, the orbs files (parked, §3.11).
- **Do (§2.6):**
  1. `ActionBar`: rebuild as the **12-slot grid** — `.ab-bars` → `.ab-row.r1` of `.k-slot.ab-btn` buttons (`--ab-btn`, 1 px apart, DOM `.k-art`, `.k-key-lbl`, `.k-count`, `.k-sweep`, `.k-edge`, `.k-cdnum`); slot order `lmb rmb q e r s1 s2 s3 s4 m45 m90 m180` (§2.6.2; **`s4` / `G` is a CM12 contract that does not exist yet — see step 8**); `reveal()` + `slotUnlockLevel()` (incl. `s4` fallback 8) + `learned()` per §2.6.4; `.is-new` + `YENİ` chip, `.is-socket` ("+" → `G.ui.openPanel('skills')`), majors tone + hero `Yorgun m:ss`, `Settings.barGhostSlots`; key labels via `G.input.bindingLabel` (`SolT`, `SağT`, letters, digits); counts bottom-right when > 1, or when a charge-based skill sits at 0 charges (`.is-zero`, §2.6.3); `--p` written every frame and the §2.6.8 classes toggled (`oncd`, `slot-gcd`, `oor`, `nores`, `glow`, `spend`, `queued`, `casting`, `failing`, `locked`, `is-disabled`, `ready`, `press`) — **no `transform: scale` anywhere on a button**; cooldown number colours by threshold, one decimal under 3 s; `TalentBadge` re-anchored as `.ab-n`; `.ab-error` line (Menzil dışında / Henüz hazır değil + remaining time). Potions (`potHp` / `potMp`, keys 4 / 5) are built here but mounted into `hosts.cons` (= `PlayerFrame.consHost`).
  2. `FlaskRow`: the flask buttons of §2.6.5, mounted next to the potions (absent when nothing equipped).
  3. `ExtraBars`: **skin + width** — cells become `.ab-btn`, rows `.ab-row.r2` / `.r3` centred above the main row, each row **12 cells** (§2.6.6: cells 1–8 keep the labels `S1…S8` / `C1…C8` and their bindings, cells 9–12 are mouse-only with no label; `efsun.bars.*` arrays are padded to 12 on read); all other logic, storage and the edit-mode frames (`bar2`, `bar3`) unchanged.
  4. `XpStrip` per §2.6.7 (reuse the XP logic of `Metin2Bar.updateExp` / `PlayerFrame.XpBar`: level-up hold + flash, floaters), mounted in `.hud-xp`, hidden at max level.
  5. `hud/index.ts` **composition flip** (the only `index.ts` edit of W1): stop mounting `Metin2Bar` / orbs (keep the imports' files compiled; `HudApi.hudStyle` returns `'elvui'`, `setHudStyle` stays as a no-op), mount `ActionBar` into `.hud-bc` with `{ grid, cons: playerFrame.consHost }`, `XpStrip` into `.hud-xp`, move `playerFrame.el` / `targetFrame.el` into `.hud-uf` (their own roots position themselves, §2.7 / §2.8 — UX-11 supplies the CSS; until it lands they stack unstyled, which is expected inside the wave) and `partyFrames.el` into `.hud-tl`.
  6. `hud-bottom.css` = the grid / rows / `.ab-error` / `.ab-n` / XP strip rules (tokens only, §2.6.1 numbers) and the new `.hud-bc { bottom: calc(var(--xp-h) + 8px) }` anchor; `hud-extras.css` re-anchors the badge. The old `.m2-*` rules stay in `hud-metin2.css` (dead but intact).
  7. Dev hook `src/dev/hud-ext/actionbar.ts`: buttons `G becerisi ata`, `Seviye ±1`, `Büyük yetenek aç`, `Şişe ekle/çıkar`, `Menzil dışı` (`.oor` on RMB), `Kaynak yok` (`.nores`), `Proc parlat` (`.glow` on Q), `Kuyruk` (`.queued`), `Bekleme 8 sn`, `Çubuk 2/3`, `Boş yuvalar`.
  8. **CM12 not landed — compile either way.** Verified by grep on 2026-10-13: `'skill_s4'` is not in `InputAction` and `'s4'` is not in `SkillSlotKey`; UX-00 leaves `G` to the CM12 kit package and UX-10 does **not** depend on CM12. So `ActionBar.ts` widens locally and tags every cast with a `// CM12:` comment: `type BarSlot = SkillSlotKey | 's4'`; `skillBar` is read through `(ch.save.skillBar as Partial<Record<BarSlot, string>>)[slot]`; the key label comes from `slotLabel(slot)` = `G.input.bindingLabel(action as InputAction)` inside try/catch with the literal **`G`** as the fallback for `s4`; `slotUnlockLevel('s4')` falls back to 8, and `reveal()` returns `hidden` for `s4` while no skill is bound to it (before CM12 nothing can be bound, so the cell simply does not exist yet). The dev button **`G becerisi ata`** writes a learned skill id into `skillBar.s4` at runtime so the cell, its label, count, cooldown and every state can be exercised now. The G acceptance check below is therefore marked **[after CM12]**; once CM12 lands the casts and the dev button are deleted.
- **Done when:** tsc 0; at level 1 the grid holds exactly LMB and RMB (95 px wide at `lg`) and the potion buttons sit under the player frame; raising the level in `dev/hud.html` reveals Q (3), E (6), **G (8) [after CM12; until then via the dev button `G becerisi ata`]**, 1 (10), 2 (15), 3 (20), R (30) with the opacity grow-in + `YENİ`; spec + level reveals X / V / T; the full row measures **545 / 497 / 449 px** (`lg` / `md` / `sm`, devtools) with 44 / 40 / 36 px buttons and 1 px gaps, and the optional Çubuk 2 / 3 rows are the same 12 cells wide (the 3 × 12 block); every dev button shows its state correctly (cooldown sweep clockwise with the leading edge, red out-of-range, blue no-resource, **gold marching ants**, white queued outline); key labels top-right 12 px, counts bottom-right 14 px; the XP strip sits on the bottom edge with three notches; grid and chat do not overlap at 1280×720; no `transform: scale` on `.ab-btn` (grep).

#### UX-11 — Unit frames · owner: hud · W1 · depends: UX-00, UX-01
- **New:** `ui/widgets/levelColor.ts` (`levelColor(playerLevel, targetLevel): string` per §2.8).
- **Own:** `hud/PlayerFrame.ts`, `hud/PartyFrames.ts`, `hud/TargetFrame.ts`, `hud/BossFrame.ts`, `hud/ComboCounter.ts`, `widgets/StatusRow.ts`, `styles/hud-frames.css`, `styles/overlays.css` (combo part only), `styles/widgets.css` (status icons `.st-*` only).
- **Do (§2.7, §2.8, §2.11):**
  1. `PlayerFrame` → the **ElvUI player frame**: `.uf-player` tree of §2.7 (`.uf-top` holding `.uf-auras` and `.uf-pips` = `pipsHost`, `.uf-main` with the optional `.uf-icon` — off unless `Settings.ufIcon` — plus `.uf-hp` + `.uf-strip`, `.uf-cons` = `consHost`, `.uf-debuffs`); health bar = `.k-bar[data-kind=class]` with `--cls` from `classColor()`, text `{level} {name}` / `{hp} | {pct}%` (`fmtHealth` from `numFormat.ts`, §2.7), ghost trail, absorb band, hit pulse, low / dead states; power strip with `data-kind` for all eleven classes' resources; **cast bar replaces the strip while casting** (`PlayerCastBar` keeps its exported class / API); dodge segments + combo / holy / essence pips in `.uf-pips` (visibility rules §2.7); click on `.uf-main` (cursor free) opens `character`. Keep the exported `Bar`, `XpBar`, `PlayerCastBar`, `classColor`, `classNameTr`, `CLASS_META` (colours now read from `classColors.ts`) — other files import them. Fill widths in whole px (`--w` / `--gw`).
  2. `StatusRow` → `.k-aura` icons (§3.6): `--au-lg` / `--au-sm`, max 8 + `+N`, stack count, centred timer under 60 s with the threshold colours, blink under 3 s, typed debuff frames, proc `.glow`, own-debuff `refresh` pulse under 30 %, sort per §2.7 / §2.8.
  3. `TargetFrame` → §2.8: `.uf-target` stack, reaction-colour health bar with the **centred `{pct}%` only**, strip = `{level} {name}` left (`levelColor`) + `▸ target-of-target · hp` right + threat bar / **target cast bar**, rank trim (interruptible gold, locked grey + shield, `Kesildi` flash), own / others aura rows, soft-target opacity .78, hard-target accent line. `BossFrame` per §2.8 (flat plate, 22 px bar, phase notches, `--boss-w`, **no longer stacked with the target frame**). `PartyFrames` per §2.7 (class-colour bars, role icons, crown, outline, `--party-w`).
  4. `ComboCounter`: anchor `.hud-ml`, appears from 3 hits, tier-gated lines, numbers in the **body font** 700 (not Cinzel), all colours via tokens.
  5. `.bar.res[data-kind]` in `hud-frames.css` gets all kinds + fallback via the `.k-bar` tokens.
- **Done when:** tsc 0; `dev/hud.html` (hurt / heal / party / boss / combo hotkeys): the **player frame's right edge is at `50 % − --uf-gap`** and its health bar's top at 57 % of the HUD height, the target frame is its mirror, 264 px (`lg`) of free centre between them; the player's health text reads `805K | 100%` while the target's bar shows a centred `100%` with name / level / `▸ ToT · hp` in the strip below it, and the optional spec icon is off by default; every resource kind colours the strip; a cast replaces the strip without moving anything; the top-left shows **no** HP / resource bars (party rows only in a group); own debuffs come first and are larger; the buff row caps at 8 + `+N` with > 8 statuses and fits the frame width at every density (254 / 238 / 222 px of 320 / 292 / 260); no information text < 13 px except the micro labels of §3.4.

#### UX-12 — Right column and meter · owner: hud · W1 · depends: UX-00, UX-01
- **New:** `src/dev/hud-ext/meter.ts` (dev only).
- **Own:** `hud/Minimap.ts`, `hud/Tracker.ts`, `hud/QuestTracker.ts`, `hud/MythicTracker.ts`, `hud/QuestFeed.ts`, `hud/DamageMeter.ts`, `styles/hud-right.css`, `styles/hud-quests.css`, `styles/hud-meter.css`.
- **Do (§2.9, §2.10.1, §4.9):**
  1. `ContextTracker`: header (title, **text** mode tabs `Görev · Koşu · Boss` — never key caps —, `?`, `▾`; pane capped at `--trk-h`, compact `run` pane at `md` / `sm`), four panes (`boss`, `run`, `quest`, `hint`), auto mode priority boss > run > quest > hint, 60 s manual pin, collapse persistence `efsun.tracker.v1`, `sm` starts collapsed, click-through targets (`questlog`, `mplusInfo`, `guide`); flat `.k-plate` skin, body font. `QuestTracker` / `MythicTracker` keep their data logic but render into the panes (compact: affixes 24 px, thresholds row, forces bar 12 px). The `hint` pane shows `G.ui.hud.adviceLine?.()` (slot from UX-01) with the static fallback `Ne yapmalıyım? [.]`. Boss mode = `G.ui.hud.bossEntityId !== null`; run mode = `G.mplus?.state` active.
  2. `QuestFeed`: diff `progressRows()` per frame (≤ 4 Hz), centre lines at 36 %, max 3, 2.2 s; completion line green + `ui_confirm` 0.4; `quest:updated` `ready` one-shot line; tracker row flash + 200 ms `steps(6)` bar fill.
  3. `Minimap`: zoom buttons on hover only; level-band line with relative colour; objective / quest rings keep working; subscribe to `finder:queue` and draw the LFG eye (click → open `finder`; guarded while the panel is a stub); optional `.mm-info` overlay (`Settings.showMapInfo`: local time, plus `{fps} FPS | {ms} MS` while `showFps` is on — reuse the counting code of `FpsCounter`).
  4. **`DamageMeter` → the Details!-style meter of §2.10.1**: `.dm` tree (head with tabs + segment label, two `.dm-col` columns with titles, 18 px rows = spec icon + class-colour bar + name left / value right), views `split` / `damage` / `healing` / `deaths`, death mini-list (3 / 2 rows at `lg` / `md`), local-player row always visible, per-second values via `fmtMeter` (always one decimal, §2.7), `Settings.meterVisibility` (`auto` = party ≥ 2 **or** dungeon **or** combat within 15 s, 400 ms fade; `always`; `never`), the DPS pill removed, storage key `efsun.dpsMeter.v3` (v2 ignored), class colours from `classColors.ts` (delete the private `CLASS_COLOR`). Event handling, segments, stats and the 4 Hz repaint are **not** rewritten; `Shift+D` still toggles. Until UX-13 wires the final column, `.dm` is placed by `hud-meter.css` itself (`position: absolute; right: var(--gut); bottom: calc(var(--gut) + 72px)`, above the gold chip and micro row).
  5. Dev hooks `hud-ext/tracker.ts` (force each mode, advance a kill objective, reuses `Numpad4`) and `hud-ext/meter.ts` (fills the meter with five fake players of five classes — DPS 226,9K … 50,5K, HPS 189,0K … 5,0K — and adds a death).
- **Done when:** tsc 0; in `dev/hud.html` the column shows minimap + **one** tracker pane; `P` (boss) switches to the boss pane, the run countdown (`V`) to the run pane, quest hotkeys (Numpad3/4) to the quest pane with the bar and feed lines; with nothing active the `hint` pane shows; the meter dev hook produces **two columns of five class-coloured rows, icon left / value right, 18 px high**, a death row, working tabs (`Hasar` / `İyileştirme` / `Ölümler`); meter absent when solo and idle; no overlap between meter, grid, chat and target frame at 1280×720 (meter left edge 1230 vs target-frame right edge 1212), and none between a 240 px tracker pane and the loot / meter stack with 4 loot lines + a 2-death meter (19 px clear, §2.10).

#### UX-13 — Corner, banners, edit mode · owner: hud · W2 · depends: UX-01
- **Own:** `hud/Corner.ts`, `hud/EditMode.ts`, `hud/Banners.ts`, `hud/Overlays.ts`, `hud/Extras.ts` (only a new exported `unspentTalentPoints()` helper), `widgets/Toasts.ts`, `hud/index.ts`, `styles/hud-corner.css`, `styles/hud-edit.css`, `styles/hud-meter.css` (the `.dm` placement rule only), `styles/overlays.css` (banner/zone/prompt parts), `styles/widgets.css` (toast part only).
- **Do (§2.10, §2.11, §2.13):** `.hud-br` becomes the right-aligned column loot → meter → gold → micro (the meter element is mounted into it and loses its temporary absolute placement; hidden = out of the flow); `LootFeed` (5 / 4 / 3 lines by density, 4 s / 7 s, merge, rarity stripe, `▲` upgrade arrow via `describeItem` / `itemLevel` compare), gold chip, `MicroMenu` single row of flat 32 px buttons with the reveal table (**Çanta = `B`, Zindan Bulucu = `I`**) and badges (reuse `TalentBadge`'s unspent count through a small exported helper; `K` badge when a learned skill is off the bar; `L` badge when a quest is `ready`), 70 % idle opacity; remove `editBtn` and `FpsCounter` mounting from `hud/index.ts` (`HudApi.startEdit()` stays); `EditMode`: per-frame `Varsayılana Dön`, density read-out; `BannerQueue` (ranks 2–5, max 3 queued) and `QuestBanner` (`quest:updated` `active` → `Görev Alındı: …`, `done` → `Görev Tamamlandı: …`); `Toasts`: max 2 visible, 2.4 s, de-duplicate identical text within 1.5 s (existing `count` bump); banners keep `--font-title` (Cinzel Decorative), everything else the body font.
- **Done when:** tsc 0; the meter dev hook shows the meter between the loot feed and the gold chip (hidden = no gap; at `md` with 4 loot lines and 2 death rows the column stays 19 px below a full tracker, §2.10 budget); level-1 character shows 5 micro buttons; raising the level adds N (L2), K (L3), finder (L8); no "Arayüzü Düzenle" button on screen; accepting a quest in `dev/hud.html` (Numpad3) shows the banner once; edit mode still reachable via `window.dev` / `G.ui.hud.startEdit()`.

#### UX-20 — Objective arrow + tips · owner: hud · W2 · depends: UX-01, UX-12
- **New:** `data/tips.ts`, `styles/hud-onboard.css`.
- **Own:** `hud/ObjectiveArrow.ts`, `hud/TipCards.ts`, `hud/questMarks.ts`.
- **Do (§4.4, §4.7):** `questMarks.ts`: `guideTargetPos(obj)` (scene-aware table in §4.4), `guideTarget()` (priority list incl. `HudApi.guideTarget`), `setPinnedQuest` additionally emits `quest:pinned`; `ObjectiveArrow` (projection, clamp-to-ellipse, arrival, `questArrow` setting, hides under panels / edit mode); `data/tips.ts` = the table of §4.7 as `TipDef[]`; `TipCards` scheduler + card (anchored in `.hud-tip`, slides in from the left; flags `tip.<id>`, `Settings.showTips`, hover pause, `Bir daha gösterme`); `hud-onboard.css`.
- **Done when:** tsc 0; in `dev/hud.html` with a mock quest the diamond follows the target on screen and clamps to the edge off screen; tips fire once each (check `character.save.flags`), never during a panel, ≥ 25 s apart.

#### UX-21 — Welcome, guide, quest markers · owner: panels-game (+ scenes: `NPC.ts` one method) · W2 · depends: UX-02, UX-12, UX-20
- **New:** `panels/game/guideEngine.ts`, `styles/panels-guide.css`, `styles/world-markers.css`.
- **Own:** `panels/game/welcome.ts`, `panels/game/guide.ts`, `entities/NPC.ts` (`setQuestMark` only), `hud/Minimap.ts` (giver icons only).
- **Do (§4.2, §4.3, §4.6, §4.8):** `recommend()` exactly as §4.6; `GuidePanel` UI + buttons (`Takip Et` → `setPinnedQuest` + arrow, `Haritada Göster` → `openPanel('map', { focus })`, `Işınlan` → `openPanel('waypoints')` when `waypointKnown`, `Zindan Bulucu`); `WelcomePanel` (first-login condition, `Başla`, flags, `HudApi.setGuideTarget('npc_muhtar')`); `NPC.setQuestMark` builds `.qm` markup (kinds offer / turnin / locked / daily / main); `world-markers.css`: `.qm*` styles **and** the missing `.wl.efs-wl-wrap` / `.wl.wl-bare` reset (background none, border 0, padding 0) so NPC labels, portal names and markers stop sitting in the generic `.wl` box; guide-tag label for the highlighted giver; minimap giver `!` / `?` icons in town (`TOWN.npcs` with `quests`).
- **Done when:** tsc 0; a fresh level-1 character in town gets the welcome card once; after `Başla` the arrow points to Muhtar Cemal and he wears the large marker; `.` opens the guide with a quest, a zone (`Sisli Koru` at level 1–4, `Altın Tarlalar` at 5), a dungeon line (`Seviye 8'de açılır` below 6); `recommend()` checked for levels 1, 5, 8, 20, 30, 50, 60 from the console.

#### UX-30 — Speech bubbles · owner: hud (+ scenes: `NPC.say`) · W3 · depends: UX-00, UX-21
- **New:** `widgets/Bubbles.ts`, `hud/ChatBubbles.ts`, `styles/hud-bubbles.css`.
- **Own:** `ui/UI.ts` (bubble layer + `say()`), `entities/NPC.ts` (`say()` only), `ui/menu/menu.css` (delete `.efs-bark` rules after migration).
- **Do (§5.2):** `BubbleLayer`, `UI.say`, `ChatBubbles` (`chat:line` → sender object → `G.ui.say`), typing indicator from `Chat.isFocused` + input length (read via `G.ui.hud.chat`), NPC barks migrated, `npc` bubbles use the flat token style with the gold name line (§5.2 — no parchment).
- **Done when:** tsc 0; `0` hotkey in `dev/hud.html` (chat line) and a typed message show a bubble over the player; two quick messages stack; an NPC greeting shows a flat bubble with a gold name line; > 6 bubbles caps; bubbles hide with `chatBubbles = false`.

#### UX-31 — Chat window · owner: hud · W3 · depends: UX-00
- **Own:** `hud/Chat.ts`, `styles/hud-chat.css`.
- **Do (§5.1):** tab strip + per-tab buffers (200), scrim look, hover/typing states, channel colours, class-colour names, `Yeni mesajlar ↓`, `/` hint list, emit `chat:line` from `addLine`, keep `consumedAt` / Enter / Esc semantics and `/temizle`; add the local-only commands `/arayuz` (`G.ui.hud.startEdit()`) and `/zindan` (`G.ui.openPanel('finder')`) beside `/temizle`; render only tabs that have channels; `chatFontSize` 13–17; the optional stats line (`Settings.showStats`, `.chat-stats`, §5.1) is rendered inside `Chat`, (it sets `--stats-h: 20px` on the HUD root while the line is visible, so the tip card moves up), and `hud/index.ts` is not touched.
- **Done when:** tsc 0; Enter-to-type, Esc, `/temizle` behave as before; tabs filter lines; `dev/hud.html` `0` hotkey fills Genel/Sistem.

#### UX-41 — LFG net contract · owner: net · W3 · depends: UX-00
- **Own:** `net/messages.ts`, `net/NetSession.ts`, `types/character.ts` (`CharacterSummary.role?`), `systems/CharacterState.ts` (`summary()` adds `role`).
- **Do (§6.5):** `RoomAnnouncement.lfg?` + `sanitizeAnnouncement` validation (ids via `ident`, counts `int(…, 0, 5)`, `note` via `text(…, 40)`), `RoomInfo.lfg`, `NetSession.setLfg(listing | null)` → stores and re-announces, `announceInput()` includes it, `listRooms()` maps it; `summary().role` from `getSpec(save.spec)?.role ?? 'dps'`, re-announced on `spec:changed`.
- **Done when:** tsc 0; `dev/net.html` two tabs: tab A `G.net.setLfg({dungeon:'kemik_mahzeni',diff:'normal',need:{tank:1,healer:1,dps:2}})` → tab B `G.net.listRooms()[0].lfg` matches; a malformed announcement is rejected/clamped.

#### UX-40 — Zindan / Raid Bulucu · owner: panels-game · W4 · depends: UX-02, UX-41, UX-12 (eye)
- **New:** `panels/game/finderModel.ts`, `panels/game/runStart.ts`, `styles/panels-finder.css`.
- **Own:** `panels/game/finder.ts`, `panels/game/party.ts` (`Zindan Bulucu` button only), `entities/interactables/Portal.ts` (`DungeonPortal.interact` + prompt), `entities/NPC.ts` (`panelForNpc` portal case only).
- **Do (§6):** `runStart.ts` (`buildParams`, `enemyLevelFor`, `startRun`, ported from `keystone.ts`; **`keystone.ts` is not edited here**); `finderModel.ts` (pure: card rows, difficulty button states from `difficultyState`, role defaults, need-by-role, listing filter/sort); `FinderPanel` three tabs, **role row** (top of the detail pane, check marks + leader flag), difficulty selector, **reward icon row**, collapsed **`Mitik+ Puanı` card** (§6.2: `save.mythic` rating / best runs), footer, modes Tek Başına / Grubumla / Grup Ara, state machine + `finder:queue` emits, Gruplar table, Raid tab with the `DUNGEONS['efsun_kalesi']` feature flag, keyboard (↑↓ ←→ Enter); `setLfg` calls are made through `G.net.setLfg?.(…)` so the panel still loads on a build without UX-41.
- **Done when:** tsc 0; `I` opens the finder (and `B` the inventory); at level 8 Kemik Mahzeni is selectable on Normal and starts a run offline; the role row (T / Ş / H toggles with check marks, leader flag) sits above the banner and the footer has no role chips; the reward row shows icons, the `Mitik+ Puanı` card expands / collapses; Heroic/Mitik show lock reasons and toasts; Raid tab shows `YAKINDA`; in `dev/net.html` two tabs: A `Grup Ara` → B sees the listing in Gruplar and joins; portals in town open the finder.

#### UX-50 — `pg` shell · owner: panels-game · W4 · depends: UX-00, UX-02
- **Own:** `panels/game/base.ts`, `styles/panels-shell-pg.css`.
- **Do (§7.1):** `windowFrame()` builds on `buildChrome()` (same return shape: `win`, `head`, `titleEl`, `body`, `foot`), size class from a new optional `size` in `WinOpts` (default `M`), `modal` backdrop only for `modal`; `button()`, `tabs()`, `toggle`, `slider`, `selectBox`, `askConfirm`, `row`, `divider` restyled with kit classes (API unchanged); `Tip` / `bindTip` delegate to `G.ui.showTooltipFor`; remove superseded shell rules from `panels-shell-pg.css` (keep `pg-*` content classes other panels use).
- **Done when:** tsc 0; all `pg` panels in `dev/panels-game.html` open with the new header/close/tabs/buttons and no layout break.

#### UX-51 — `pi` shell · owner: panels-items · W4 · depends: UX-00, UX-02
- **Own:** `panels/items/PanelBase.ts`, `styles/panels-shell-pi.css`.
- **Do (§7.1):** `ItemPanel` header/close/tabs from `buildChrome()` / `buildTabs()` (`makeTabs()` keeps its signature), `zoom`-aware drag + fractional position persistence (`efsun.win.v1.<id>`), docks via `PanelOpts.dock` (new optional field, defaults per §7.1 table), window fit uses the shared `max-width/height` rule instead of `transform: scale`.
- **Done when:** tsc 0; inventory, character, stash, vendor, blacksmith, skills open in the same style as the `pg` panels, drag, remember their place, and fit a 1280×720 window.

#### UX-52a — Game panels pass · owner: panels-game · W5 · depends: UX-40, UX-50
- **Own:** `panels/game/quests.ts`, `settings.ts`, `gameMenu.ts`, `keystone.ts`, `map.ts`, `talents.ts`, `bounty.ts`, `mplusInfo.ts`, `waypoints.ts`, `styles/panels-game.css`, `styles/panels-talents-*.css`.
- **Do (§7.3–7.6, §4.5, §4.9):** sizes / docks / hints per the §7.3 table; empty states per §7.5; quest log kill rows with bars + `Haritada göster`; settings `Arayüz` tab (§7.3, incl. `Oyuncu simgesi` = `ufIcon`, `İstatistik satırı` = `showStats`, `Minimap saati` = `showMapInfo`; the `hudStyle` row stays hidden — ElvUI is the only skin until UX-70); game menu entries (`Başlangıç Rehberi`, `Arayüzü Düzenle`, `Zindan Bulucu`); map town giver pins, recommended-region outline, zone-progress card; keystone uses `runStart.ts` and shows the finder banner; talents CSS size 1180 × 720; delete dead selectors in the CSS files it owns.
- **Done when:** tsc 0; `dev/panels-game.html` shows every panel at its standard size with hints and empty states; Settings › Arayüz toggles work (`showTips`, `questArrow`, `meterVisibility`, bars, `ufIcon`, `showStats`, `showMapInfo`, `Arayüzü Düzenle`, `İpuçlarını Sıfırla`).

#### UX-52b — Item panels pass · owner: panels-items · W5 · depends: UX-51
- **Own:** `panels/items/SkillsPanel.ts`, `InventoryPanel.ts`, `CharacterPanel.ts`, `VendorPanel.ts`, `StashPanel.ts`, `BlacksmithPanel.ts`, `styles/panels-items.css`.
- **Do (§7.3, §7.4, §7.7):** skill book grouping (12-slot bar editor strip — 9 skills + 3 majors —, Çubukta / Öğrenildi / Açılacak collapsed / spec group, other-spec toggle, search, `efsun.skillbook.v1`); inventory bag-fullness chip + hints + empty state; the **character sheet of §7.7** (`CharacterPanel.ts`: size L 1180 × 720, dock left; header strip `Sv. N Sınıf`, equipped / overall item level, Mitik+ score from `save.mythic.rating` + `ratingTier`, gear rows with item level / `+N` / sockets / `Kırık`, model column with the durability chip, tabs `Karakter · Unvanlar · Ekipman` — the last two as empty-state stubs —, collapsible Nitelikler / İkincil / Üçüncül groups with today's sections collapsed below; `makeSlot()` logic untouched); vendor/stash/blacksmith sizes; rarity frames via `.k-slot[data-rarity]`; font floor 13 px; delete dead selectors in `panels-items.css`.
- **Done when:** tsc 0; `dev/panels-items.html`: the skill book's bar editor shows the **12-slot bar** (9 skills `LMB RMB Q E R 1 2 3 G` + 3 majors `X V T`), learned skills grouped, locked skills collapsed; the character sheet shows `Sv. N Sınıf`, `EŞ equipped / overall`, `Mitik+ Puanı`, gear rows with item level / `+N` / sockets, the three tabs and collapsible Nitelikler / İkincil / Üçüncül groups, and fits a 1280×720 window; no text < 13 px in the touched CSS.

#### UX-60 — Cleanup, docs, dev pages · owner: hud (+ docs) · W5 · depends: all earlier
- **Own:** `styles/hud*.css`, `styles/widgets.css`, `styles/overlays.css`, `ui/menu/menu.css`, `src/dev/hud.ts` (header comment + hotkey list), `ARCHITECTURE.md` (HUD / panels / new files sections), `docs/ROADMAP.md` (mark UI redesign done, record the new score).
- **Do:** grep-based dead-CSS removal (selectors with no match in `src/**/*.ts`: `.efs-bark`, `.fps` if unused, old `.qt`/`.mt` wrappers once the tracker owns them, `.hud-edit-btn`, the superseded `.pf` bar rules, the DPS-pill rules in `hud-meter.css`; **`hud-metin2.css`, `Metin2Bar.ts` and the orbs files are parked for UX-70 and stay**), replace remaining hex literals in touched rules by tokens, scan every file for `font-size` < 13 px on information text (12 px is allowed only for the micro labels of §3.4), `grep -c` report of hex literals / font sizes in the PR note (targets §0.2), final `npx tsc --noEmit` and `vite build`.
- **Done when:** tsc 0 and `vite build` green; the §0.2 table is re-measured and pasted into `ROADMAP.md`.

### 8.3 File ownership matrix (conflict check)

| File / group | W0 | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|---|
| `ui/UI.ts` | UX-00 | | | UX-30 | | |
| `widgets/classColors.ts`, `widgets/numFormat.ts`, `main.ts` (fonts), `package.json` | UX-00 | (read by UX-11, UX-12) | | | | |
| `core/Input.ts`, `Settings.ts`, `events.ts` | UX-00 | | | | | |
| `ui/kit/*`, `tokens.css`, `kit.css` | UX-00 | | | | | |
| `hud.css`, `layoutStore.ts`, `hud/types.ts` | UX-01 | | | | | |
| `hud/index.ts` | UX-01 | UX-10 (composition flip) | UX-13 | | | |
| `hud-bottom.css`, `hud-extras.css`, `ActionBar.ts`, `ExtraBars.ts`, `FlaskRow.ts`, `XpStrip.ts` | UX-01 (stubs) | UX-10 | | | | |
| `Metin2Bar.ts`, `hud-metin2.css`, orbs files | parked, untouched in every wave (UX-70 backlog) | | | | | |
| `PlayerFrame/PartyFrames/TargetFrame/BossFrame/ComboCounter/StatusRow`, `hud-frames.css`, `levelColor.ts` | UX-01 (`PlayerFrame.ts`: two host fields) | UX-11 | | | | |
| `Minimap.ts`, `Tracker.ts`, `QuestTracker/MythicTracker/QuestFeed/DamageMeter`, `hud-right/quests/meter.css` | UX-01 (stubs) | UX-12 | UX-21 (`Minimap.ts`), UX-13 (`hud-meter.css` placement rule) | | | |
| `Corner.ts`, `EditMode.ts`, `Banners.ts`, `Overlays.ts`, `Extras.ts`, `Toasts.ts`, `hud-corner/edit.css` | | | UX-13 | | | |
| `overlays.css`, `widgets.css` | | UX-11 | UX-13 | | | UX-60 |
| `ObjectiveArrow.ts`, `TipCards.ts`, `questMarks.ts`, `data/tips.ts`, `hud-onboard.css` | UX-01 (stubs) | | UX-20 | | | |
| `welcome/guide/guideEngine`, `panels-guide.css`, `world-markers.css` | UX-02 (stubs) | | UX-21 | | | |
| `entities/NPC.ts` | | | UX-21 (`setQuestMark`) | UX-30 (`say`) | UX-40 (`panelForNpc`) | |
| `Bubbles.ts`, `ChatBubbles.ts`, `hud-bubbles.css`, `menu.css` | | | | UX-30 | | UX-60 |
| `Chat.ts`, `hud-chat.css` | UX-01 (css move) | | | UX-31 | | |
| `net/*`, `types/character.ts`, `CharacterState.ts` | | | | UX-41 | | |
| `finder.ts`, `finderModel.ts`, `runStart.ts`, `panels-finder.css`, `party.ts`, `Portal.ts` | UX-02 (stub) | | | | UX-40 | |
| `panels/game/base.ts`, `panels-shell-pg.css` | UX-02 (css move) | | | | UX-50 | |
| `panels/items/PanelBase.ts`, `panels-shell-pi.css` | UX-02 (css move) | | | | UX-51 | |
| other `panels/game/*.ts`, `panels-game.css`, `panels-talents-*.css` | UX-02 (css move) | | | | | UX-52a |
| other `panels/items/*.ts`, `panels-items.css` | UX-02 (css move) | | | | | UX-52b |
| `ARCHITECTURE.md`, `ROADMAP.md`, `dev/hud.ts` | UX-00 (`dev/hud.ts`) | | | | | UX-60 |

Within every wave the files above are disjoint (checked column by column). `hud/index.ts` is the only HUD composition root and is touched only by UX-01 (W0), UX-10 (W1, composition flip) and UX-13 (W2).

### 8.4 Dependencies in one line

`UX-00` ∥ `UX-01` ∥ `UX-02` → (`UX-10` ∥ `UX-11` ∥ `UX-12`) → (`UX-13` ∥ `UX-20` ∥ `UX-21`) → (`UX-30` ∥ `UX-31` ∥ `UX-41`) → (`UX-40` ∥ `UX-50` ∥ `UX-51`) → (`UX-52a` ∥ `UX-52b` ∥ `UX-60`). UX-12's `hint` pane and UX-12's minimap eye degrade gracefully (static text / hidden) until UX-21 / UX-40 land; UX-40 degrades gracefully without UX-41 (`G.net.setLfg?.()`); UX-30 needs UX-31's `chat:line` event **only through the contract added in UX-00**, so W3 packages are independent.

---

## Appendix A — Contracts (exact additions)

| Where | Addition |
|---|---|
| `core/Input.ts` | `InputAction`: `'groupFinder' \| 'guide'` (`groupFinder` per MAP_UI P00 / GDD_PVP_FINDER — reuse if present); `DEFAULT_BINDINGS`: `groupFinder: ['KeyI']`, `inventory: ['KeyB']`, `guide: ['Period']`; `ACTION_NAMES_TR`: `groupFinder: 'Grup Bulucu'`, `guide: 'Ne Yapmalıyım?'`; `codeLabel`: `Period: '.'`. The HUD also reads `skill_s4` (`['KeyG']`, added by the CM12 kit package — **not in `src/` yet**: UX-10 falls back to the label `G` and a locally widened slot type until it lands) |
| `core/Settings.ts` | `showTips: boolean = true`; `questArrow: boolean = true`; `meterVisibility: 'auto' \| 'always' \| 'never' = 'auto'`; `barGhostSlots: boolean = false`; `ufIcon: boolean = false` (spec icon in the player frame); `showStats: boolean = false` (chat stats line); `showMapInfo: boolean = false` (minimap clock / FPS text); `hudStyle: 'elvui' \| 'metin2' \| 'orbs' = 'elvui'` with a one-time `uiRev` migration (`< 2` → `'elvui'`); `bindingsRev` (MAP_UI P00); `chatFontSize` default 15, range 13–17 |
| `core/events.ts` | `'chat:line': { from: string; text: string; channel: ChatChannel; local: boolean }` · `'finder:queue': { state: 'idle' \| 'listing' \| 'proposal' \| 'entering' \| 'inrun' \| 'failed'; dungeonId?: string; since?: number }` · `'quest:pinned': { questId: string \| null }` |
| `net/messages.ts` | `RoomAnnouncement.lfg?: { dungeon: string; diff: 'normal' \| 'heroic' \| 'mythic' \| 'mythicplus'; key?: number; need: { tank: number; healer: number; dps: number }; ilvl?: number; note?: string }` |
| `types/character.ts` | `CharacterSummary.role?: 'tank' \| 'healer' \| 'dps'` |
| `NetSession` | `RoomInfo.lfg?`, `setLfg(listing: RoomAnnouncement['lfg'] \| null): void` |
| `HudApi` | `density: 'lg' \| 'md' \| 'sm'`, `zones`, `tracker`, `tips`, `guideTarget: string \| null`, `setGuideTarget(npcId: string \| null): void`, `adviceLine?: () => string`; `hudStyle` always reads `'elvui'` |
| `PlayerFrame` / `ActionBar` | `PlayerFrame.consHost: HTMLElement`, `PlayerFrame.pipsHost: HTMLElement` (UX-01); `new ActionBar(ui, { grid, cons })` |
| `CharacterSave.flags` (values `1`) | `onb.welcome`, `onb.metCemal`, `onb.smith`, `onb.finder`, `tip.<id>` |
| `localStorage` | `efsun.uiLayout.v2` (v1 read once), `efsun.tracker.v1`, `efsun.win.v1.<id>`, `efsun.skillbook.v1`, `efsun.charsheet.v1`; existing `efsun.quest.pin`, `efsun.uiScale` unchanged; `efsun.dpsMeter.v3` (the v2 pill / position is ignored) |
| Panel ids (new) | `finder`, `guide`, `welcome` |
| CSS files (new) | `tokens.css`, `kit.css`, `hud-bottom.css`, `hud-frames.css`, `hud-right.css`, `hud-chat.css`, `hud-corner.css`, `hud-onboard.css`, `hud-bubbles.css`, `world-markers.css`, `panels-shell-pg.css`, `panels-shell-pi.css`, `panels-guide.css`, `panels-finder.css` |
| TS files (new) | `ui/kit/{chrome,controls,index}.ts`, `ui/hud/{Tracker,ObjectiveArrow,TipCards,QuestFeed,FlaskRow,XpStrip,ChatBubbles}.ts`, `ui/widgets/{Bubbles,levelColor,classColors,numFormat}.ts`, `ui/panels/game/{finder,finderModel,runStart,guide,guideEngine,welcome}.ts`, `data/tips.ts`, `dev/hud-ext/*.ts` |

## Appendix B — Terminology (keep the Turkish consistent)

| Term | Use |
|---|---|
| Eylem Çubuğu | the main action-bar grid (12 slots); extra bars are `Çubuk 2` / `Çubuk 3` |
| Oyuncu Çerçevesi · Hedef Çerçevesi | the centre unit frames (health + resource strip / health + threat or cast strip) |
| Tüketim Şeridi | the potion / flask strip under the player frame |
| Tecrübe Çubuğu | the XP strip on the bottom edge |
| Dövüş Ölçer | the Details!-style meter; tabs `Hasar` · `İyileştirme` · `Ölümler` |
| Takipçi | the context tracker (modes Görev / Koşu / Boss / İpucu) |
| Ne Yapmalıyım? | the guide panel and the tracker hint card |
| Zindan Bulucu / Raid Bulucu | the finder panel / its Raid tab |
| Grup Ara · Grup Kur · Gruplar | LFG search action · host a listing · the listings tab |
| Rol: Tank · Şifacı · Hasarcı | roles (GDD_V2 `ROLE_TR`) |
| Hazır Kontrolü · Hazırım | ready check · "I'm ready" |
| Büyük Yetenek · Grup Kahramanlığı | majors X / V · T |
| Şişe · Şişe Kemeri | flask · flask belt |
| Av Görevi · Av Defteri | kill-hunt quest · the collection log (Avcı Yıldız / Karaca) |
| Görev Alındı · Görev Tamamlandı · Teslim et | quest banners / action |
| Kahramanlık · Mitik 0 · Mitik+ | difficulty names (`DIFFICULTY_NAMES`) |
| Eşya Seviyesi (EŞ) | item level; the character sheet shows `kuşanılan / toplam` (equipped / overall) |
| Mitik+ Puanı | the M+ rating (character-sheet header, finder card, `mplusInfo`) |
| Karakter sayfası | the character panel (`C`, §7.7); tabs `Karakter` · `Unvanlar` · `Ekipman` |
| Yoğunluk: Büyük · Orta · Küçük | HUD density read-out (`lg` / `md` / `sm`) |

## Appendix C — QA checklist per wave (Haiku QA, one browser tab, low CPU)

Common: 0 console errors; `npx tsc --noEmit` = 0; test at **1920×1080** and **1280×720**; one agent may take scale-0.4 screenshots.

- **W0:** game boots; every panel looks as before apart from the flat palette and the condensed font; `data-density` flips when resizing; `localStorage['efsun.uiLayout.v2']` appears after a drag in edit mode; `I` and `.` open the stub panels (**this is where UX-02's hotkey check lives**: the `HOTKEYS` entries come from UX-00), `B` the inventory (`I` no longer opens it).
- **W1:** level-1 character: no HP / resource bars in the top-left; the **player frame sits left of centre and the target frame right of centre (57 % down)** with `805K | 100%` text on the player and a centred `100%` on the target (name / `▸ ToT · hp` in its strip), the power strip, buffs above and the potion strip below; the grid shows LMB RMB only (95 px wide at 1080p); raise the level via the dev page: Q (3), E (6), G (8) [only after CM12; before it use the dev button `G becerisi ata`], 1 (10) appear with the fade-in + `YENİ`; the full row measures 545 / 497 / 449 px; every dev state button looks right (clockwise cooldown sweep with leading edge, red out-of-range, blue no-resource, gold marching ants, white queued outline); every resource kind colours the strip; XP strip on the bottom edge; meter dev hook: two columns of five class-colour rows, spec icon left / value right; right column shows minimap + one tracker; boss / run / quest modes switch (text tabs `Görev · Koşu · Boss`, not key caps); kill count rows animate; chat, grid, meter and target frame do not overlap at 720p (meter left edge 1230 vs target-frame right edge 1212), and the tracker keeps ≥ 19 px above the loot + meter stack; compare a 1280×720 screenshot with `docs/ref/ui/wow-elvui-hud-actionbars.png`; no text < 13 px on screen except the 12 px micro labels (devtools computed-size spot check); `grep -n "scale(" src/ui/hud/ActionBar.ts` finds no button scaling.
- **W2:** 5 micro buttons at L1, +N at 2, +K at 3, +finder at 8; no edit button; loot lines ≤ 5; quest banner once per accept; welcome card on a fresh character, once; arrow follows / clamps; tips fire once, never during panels (card bottom-left above the chat, sliding in from the left); `.` guide panel recommends per level (1, 5, 8, 20, 30, 50, 60); NPC markers framed, bobbing, no dark box.
- **W3:** typed message → bubble over the head; two messages stack; > 6 bubbles capped; NPC bark = flat bubble with a gold name line; chat tabs filter; unread dot; `chatBubbles` off hides player bubbles; two-tab net: LFG field round-trips.
- **W4:** `I` finder: list, role row on top (T / Ş / H with check marks, leader flag), difficulty states (locks + reasons), reward icon row, collapsed `Mitik+ Puanı` card, Normal solo start offline works; Raid tab `YAKINDA`; two-tab LFG: list → join → ready check → start; every window shares header/close/tabs/button style; windows fit 1280×720; drag + remembered position.
- **W5:** every panel at its size class with hints and empty states; skill book grouping (12-slot bar editor); character sheet (§7.7: `Sv. N Sınıf` header, `EŞ` equipped / overall, `Mitik+ Puanı`, gear rows with item level / `+N` / sockets, three tabs, collapsible stat groups); Settings › Arayüz toggles persist; §0.2 table re-measured (visible controls at L1 ≤ 10, always-on regions 7, hex/font counts); `vite build` green.

Score deltas to record in `ROADMAP.md`: **UI / HUD (#6)** and **Onboarding & content depth (#11)**.

## Appendix D — Content hooks for the orchestrator (outside this document's scope)

The player also asked for **more maps, more content, "dolu olsun, boş boş olmasın", and MMORPG-style "N yaratık kes" tasks**. The UI above makes whatever exists visible (§2.9, §4.9, §7.5); filling the world is authoring work with these exact hooks:

1. **Hunt (Av) quest pool.** `data/world/quests.ts` already supports `kill(target, count, text)` and `QuestDef` rewards. Add `HUNT_*` templates: per region (`r1`…`r6`, later Karakır / Ayaz Eteği) **≥ 4 repeatable kill quests** (8–15 of one mob id or family, XP % + gold per level, 1 generic reward on the 4th), offered by each village's notice-board NPC or the village headman; repeatable daily like `bounty_*`. Aim: **≥ 6 side quests per region, ≥ 1 quest giver within ~60 m of any road route**, so a `!` is almost always on screen.
2. **Quest density rule for content checks.** Extend `tools/content-check.mjs` to fail when a region has < 6 side quests or a village NPC list has no quest giver; the UI's `recommend()` and zone-progress card (`Görevler 3 / 9`) read these counts directly.
3. **Maps.** Karakır Bozkırı (30–37) and Ayaz Eteği (38–45) exist only as `data/world/karakir.ts` constants; the guide panel already shows them as `Yakında` and will switch to live as soon as `getDungeon('karakir_bozkiri')` resolves. Further "gezegen" maps need only a `DungeonDef` with `world: WorldExtras` (regions, villages, entrances) — the minimap, map pins, arrow and guide pick them up with no UI change.
4. **Av Defteri** (`data/avDefteri.ts`, six steps to level 30): add steps 7–12 for Karakır (levels 30–45); the tracker shows the active step as a second pinned line (§4.9, P2).
5. **Feedback hooks the data must keep emitting:** `quest:updated`, `world:regionEntered`, `waypoint:discovered`, `loot:pickedUp`, `skillbar:changed` (all exist today).
