# EFSUN ONLINE – Kadim Zindanlar · UI / UX YENİDEN TASARIM (`docs/UI_REDESIGN.md`)

> **Audience:** Haiku coding agents, one work package (§8) at a time. Every package names exact files, class names, numbers and acceptance checks. Prose is English, every **player-facing string is Turkish** (the game is Turkish-only).
> **Status:** DESIGN v1 (2026-10-13), written by the UI/UX art director. Nothing in this document is implemented yet.
> **Reads / overrides:** GDD_V2 §0.4 + §2.4 + §9.7, GDD_TALENTS §5, GDD_LIFE §3, GDD_OPENWORLD §6–7, ROADMAP batch 6. Conflicts are listed in §0.4 — **this document wins for everything under `src/ui/**`**; `ARCHITECTURE.md` still wins for module ownership.
> **Code facts below were read from the repository on 2026-10-13** (file names and line-level claims are real; numbers like "1,970 hex literals" were counted by script).

> **ORCHESTRATOR OVERRIDE (2026-10-13, binding — wins over everything below):**
> 1. **Visual language = ElvUI / modern WoW, not "Taş & Altın".** The user's latest UI request ("UI çok kötü… skill bar ve
>    UI de böyle olsun, DPS bar da böyle") came with the ElvUI + Details! references in `docs/ref/ui/README.md` #1, #2,
>    #4, #5, #6. So: flat dark semi-transparent panels, 1 px dark borders, compact; player frame just left of centre and
>    target frame just right of centre (slightly below the middle) with flat bars and aura rows; action bars = a tight
>    grid of crisp square icons with tiny keybind labels top-right, charge counts bottom-right, cooldown sweep, proc
>    glow; Details!-style DPS/HPS meters (spec icon + class-colour bar + value); quest tracker on the right; minimap
>    top-right; chat bottom-left. §2.6 "Alt Tahta" and §3 "Taş & Altın" are rewritten accordingly (§2 layout ideas —
>    progressive slot reveal, density, one context tracker, visibility matrix — stay). Gold is an ACCENT only (rarity,
>    highlights), not the frame material. A "Metin2 Klasik" HUD skin (board + gauges) may follow later as an option.
> 2. **Bar = CORE_MECHANICS §10.1:** LMB chain + rmb, q, e, r, 1, 2, 3, G (new s4) + X/V/T majors + potions/flasks.
> 3. **Hotkeys:** Group Finder = **I** (inventory = B only), per GDD_PVP_FINDER / MAP_UI and the user's explicit ask
>    ("WoW'daki gibi I'ya basınca queue'lar"); guide panel = `.`. The `,` finder key in this doc is void.
> 4. Action-bar states, proc glow, cast bars and target auras follow docs/COMBAT_WOW.md §2.12–2.15.

## Table of contents

0. [Brief, goals, scope, overrides](#0-brief-goals-scope-overrides)
1. [Diagnosis — why the UI feels bad](#1-diagnosis--why-the-ui-feels-bad)
2. [New HUD layout (1920×1080 and 1280×720)](#2-new-hud-layout)
3. [Visual design system ("Taş & Altın")](#3-visual-design-system-taş--altın)
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
| "Metin2 gauge (var) + WoW hissi" | Keep the Metin2 HP/SP gauges and 4 EXP beads, make them cleaner (§2.6); WoW feel = frames, tracker, tooltips, LFG. |

### 0.2 Measurable goals

| Metric | Today | Target |
|---|---|---|
| Visible controls on a **level-1** character idle in town (slots, micro buttons, edit button, DPS pill, minimap zoom buttons) | **22** (10 slots + 8 micro + edit + pill + 2 zoom) | **≤ 10** (4 slots + 5 micro + 1 minimap) |
| Always-on HUD regions (solo, idle, town) | 10 | **6** (chip, minimap, board, chat, loot/gold/micro corner, tracker-when-quest) |
| Action-bar width at 1920 | 1060 px (55 %) | **540–740 px** (28–38 %), grows with unlocks |
| Skill/slot inputs shown at once at L60 | 10 + (flasks, majors have **no** UI) | ≤ 8 skill + 3 majors + 2 potions (+ ≤ 5 flasks only when equipped) |
| HUD information text smaller than 13 css px | 79 of 201 font declarations (hud\*.css) | **0** (12 px only on key caps) |
| Distinct font sizes in `src/ui/styles/*.css` | 38 | **10 tokens + 3 named display exceptions** (§3.4) |
| Hex colour literals / unique | 1,970 / 599 (10 different "golds") | all colours from **≤ 50 tokens** (§3.2; 49 defined); components use `var()` / `color-mix()` |
| Window dialects (frame, header, close button, tab, button) | 2 (`pg-*`, `pi-*`) + HUD plates | **1** shell (§7.1) |
| Time until a new player sees "what to do next" | never (no onboarding code exists) | **≤ 3 s** after control starts (welcome card → objective arrow) |
| Class SP gauges with no fill colour on the Metin2 board | 3 of 9 classes (focus, faith, essence) | 0 |

### 0.3 Scope

**In scope:** everything under `src/ui/**` (HUD widgets, widgets, styles, panels, menu CSS), three new panels (`finder`, `guide`, `welcome`), new HUD widgets, the NPC quest-marker look, the world-label bubble layer, and the *contracts* they need in `core/Input.ts`, `core/Settings.ts`, `core/events.ts`, `net/messages.ts` (append-only).

**Out of scope:** combat, items, talent data, dungeon/world data, audio, 3D art. New copy lives in the files named per package. **No existing id is renamed** (panel ids, event names, settings keys stay; new ones are appended) — the single exception is the HUD edit-frame id `mplus`, which becomes `tracker` with a migration (§2.13).

### 0.4 Overrides (this document changes rules of other documents)

| Document / rule | Change |
|---|---|
| GDD_V2 §2.4 HUD layout (major cluster, flask bar "right of the potions") | Replaced by §2.6: majors `[T][X][V]` stay left of LMB, but flasks fold into a compact row **above the potions** and exist only when equipped. |
| GDD_V2 §9.7 / §11.3 "Raid Bulucu = tab on the `party` panel" | Raid Bulucu is the **Raid tab of the new `finder` panel** (§6.7). The `party` panel (O) stays the room browser/party manager and gets a "Zindan Bulucu" button. |
| GDD_TALENTS §5.9 "N badge next to the action bar" | Kept, relocated to the board's top-left rim (§2.6). Window size 1180×720 (§5.1 there) is kept and becomes the standard **L** size (§7.1). |
| GDD_LIFE §3.2 chat default 380×190, §3.2 bubble "5 s, max 2 stacked" | 400×176 (lg) with the tab strip counted inside; bubble duration is length-based (3.5–8 s), stacking rule refined (§5.2). Channel table / commands / net protocol of GDD_LIFE §3 are unchanged. |
| `hud/index.ts computeScale`: `clamp(0.75, 2.2, …)` | Minimum **0.8** and a new `data-density` attribute (`lg` / `md` / `sm`, §2.2). |
| ROADMAP "UI Edit Mode" button on the HUD | The permanent "Arayüzü Düzenle" button leaves the HUD; entry points are Esc menu, Settings › Arayüz, `/arayuz` (§2.10). |
| Default HUD state of the DPS meter | Hidden unless in a party in a run (`meterVisibility: 'auto'`, §2.10). |

### 0.5 Conventions for every package

1. Turkish UI strings; code identifiers English; CSS classes for new shared components use the `k-` prefix (kit), widget classes keep their current prefixes.
2. Use `G` services and `G.events`; **never throw from a frame loop** (wrap in try/catch, warn once). All `localStorage` access in try/catch.
3. Design numbers are **CSS px at the 1920×1080 design size** (`lg` density). The HUD root is zoomed (`--hud-zoom`), do not multiply by the scale in code.
4. Every package ends with `npx tsc --noEmit` = 0 errors in its files, and lists a dev page check (`dev/hud.html`, `dev/panels-game.html`, `dev/panels-items.html`).
5. A package touches **only** the files it lists. Shared files are changed only by the package that owns them in §8.3.
6. `image-rendering: pixelated` for bitmaps/canvases, integer pixel positions (`translate3d` with whole px), no blur-based `backdrop-filter` on the HUD (perf), glows are `box-shadow`/`drop-shadow` only.

---

## 1. Diagnosis — why the UI feels bad

### 1.1 What is already good (keep it)

Metin2 gauge trail + hit flash + low-HP pulse (`Metin2Bar.ts`), the 4 EXP beads and their level-up flash, cooldown conic sweeps / GCD sweep / ready ring (`ActionBar.ts`), nameplates and cast bars, the round minimap with fog of war, WoW-style item/skill tooltips with comparison, the layout editor with snap + guides (`EditMode.ts`), the quest log grouping (`quests.ts`), the ladder gating rules (`ladder.ts`), the keystone "Zindan Seç" cards. The redesign **re-skins and re-arranges** these; it does not rewrite their logic.

### 1.2 Concrete problems (evidence → fix)

| # | Problem | Evidence in the repo | Fix |
|---|---|---|---|
| D1 | **The bottom board is a 1060 px slab** (55 % of a 1920 screen) holding three wells (stat 270 + beads 172 + slots ≈ 570). `M2_WIDTH = 1060` in `Metin2Bar.ts`; `Metin2Bar.fit()` shrinks it to a minimum of 0.45 on narrow windows, which makes the slots unreadable. | `hud-metin2.css .m2 { width: 1060px }` | §2.6: 540–740 px board, gauges on top, rack below. |
| D2 | **Ten slots are always visible although six are locked at level 1** (Q L3, E L6, 1 L10, 2 L15, 3 L20, R L30). They render as dark sockets with unexplained key letters. This is the "skill bar çok fazla" feeling. | `ActionBar.ts SPECS` has 10 fixed entries; `.slot.noskill` only darkens | §2.6 progressive reveal: a slot exists only once learned. |
| D3 | **The input surface exploded but the HUD has no place for it**: GDD_V2 added X/V/T majors, 6–0 flasks, G guard, F1–F5, U; `Input.ts` has them, `ActionBar.ts` has **no** slot for majors or flasks (`PlayerController` maps `m45/m90/m180` but nothing draws them). | `core/Input.ts` lines 60–69, `data/flasks.ts` is an empty stub | §2.6 majors group + flask row (hidden until owned). |
| D4 | **HP/SP are drawn twice**: the top-left `PlayerFrame` (name, level, HP, resource) *and* the board's stat well (name, level, class, HP, SP). | `hud/index.ts` adds both | §2.7: top-left becomes a bar-less chip; gauges live only on the board. |
| D5 | **Bottom-right is six unrelated things in one 330 px column**: loot feed, "Arayüzü Düzenle" button, gold, 8 micro buttons (4×2 grid), the FPS counter (only with `showFps`, and then it duplicates the top-left `PerfOverlay`), and the DPS pill 232 px above the corner. | `hud/index.ts` `br` block, `Overlays.ts FpsCounter`, `hud-meter.css .dm { bottom: 232px }` | §2.10: loot, gold chip, one micro row; edit button, FPS duplicate and meter pill leave the default state. |
| D6 | **Top-right stacks three trackers**: minimap (236) + `MythicTracker` (≈ 340 px tall: head, affixes, timer + thresholds, forces, bosses, deaths) + `QuestTracker`. In a run with an active quest that is > 600 px = 56 % of the screen height. | `hud-tr` column in `hud.css`, `MythicTracker.ts` | §2.9: **one** context tracker (boss > run > quest). |
| D7 | **Three visual dialects**: HUD plates (2 px black + gold hairlines, `#2f2216` gradients), `pg-*` windows (radial brown, 4 rivets, uppercase gold-gradient title, 30 px close), `pi-*` windows (leather, draggable header bar, 24 px red-hover close). Two different tab strips (`pg-tab` / `pi-tab`), two button systems (`pg-btn` / `pi-btn`), two open animations, two scale mechanisms (`zoom: var(--pg-zoom)` vs `transform: scale(fit)`). | `panels-game.css` L46–340, `panels-items.css` L19–188 | §3 + §7.1 shared shell. |
| D8 | **Token chaos**: 1,970 hex literals / 599 unique in `src/ui/styles` + `menu.css`; 10 gold variants (`#e8c46a`, `#e8c25a`, `#c9a24a`, `#d9b05a`, `#b8923c`, `#9b7b36`, `#8a6b2e`, `#a98a45`, `#6b5530`, `#ffe7a3`); `--metal-0..3` defined in `hud.css` but unused; `--pg-*`, `--pi-*`, `--hud-*`, base tokens all define "gold" again. | counted by script | §3.2 one token file + legacy aliases. |
| D9 | **Typography is unreadable at 720p**: 38 distinct font sizes; 79 of 201 HUD font declarations are < 13 px, 57 of 93 in item panels, 56 of 79 in talents. A 10 px key cap at the 0.75 HUD scale of a 1280×720 window renders at **7.5 px**. | counted by script | §3.4 scale (min 13 px info text, 12 px key caps only), scale clamp 0.8. |
| D10 | **Bug: SP gauge has no fill colour for focus (Okçu), faith (Paladin), essence (Nekromant)** on the Metin2 board — `hud-metin2.css` styles only `hp / mana / rage / energy`; `.m2-fill` has no default background, only the pale trail shows. | `hud-metin2.css` L85–91 | §3.7 resource tokens for all six kinds. |
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

> *The UI shows everything the game can do, all the time, in three different styles, at sizes nobody can read. The redesign shows only what the player can use **now**, in one stone-and-gold language, at sizes that survive 720p, and always tells the player what to do next.*

---

## 2. New HUD layout

### 2.1 Principles

1. **Quiet by default.** The HUD shows what the player can use *now*. Locked things are **absent** (never greyed out); the skill book (K) is where locked things are listed.
2. **Three tiers.** **T0 always:** HP/SP/EXP gauges, action rack, crosshair, minimap. **T1 contextual:** target, boss, tracker, buffs, cast bar, prompts, tips, party. **T2 on demand:** chat history, damage meter, extra bars, edit mode, micro-menu tooltips.
3. **One owner per screen zone** (§2.5). Nothing unrelated is stacked in a corner.
4. **One source of truth per number.** HP/SP appear on the board only; level appears on the board medallion; the chip shows name, class and spec.
5. **Reveal, don't grey out.** A slot, micro button or tracker row appears when the player earns it, with a short grow-in (400 ms) and a gold ring pulse.
6. **Reading distance.** Information text ≥ 13 css px (12 px only inside key caps); gauge numbers Cinzel bold ≥ 13 px; contrast ≥ 4.5 : 1 on stone.

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

All density-dependent sizes are CSS custom properties on `.hud[data-density]` (defined in `hud.css` by UX-01, consumed by every HUD stylesheet — never hard-code these numbers elsewhere):

| Variable | `lg` | `md` | `sm` | Used by |
|---|---:|---:|---:|---|
| `--sl-lg` (LMB, RMB, X, V) | 54 | 50 | 44 | rack |
| `--sl-md` (Q E 1 2 3 R) | 46 | 42 | 38 | rack |
| `--sl-sm` (T, potions) | 38 | 34 | 30 | rack |
| `--sl-xs` (flasks) | 28 | 26 | 24 | flask row |
| `--bd-min` / `--bd-max` (board width) | 540 / 740 | 500 / 668 | 460 / 600 | board |
| `--chip-w` (player chip, buff rows) | 300 | 280 | 260 | top-left |
| `--party-w` | 232 | 216 | 200 | party frames |
| `--tgt-w` / `--boss-w` | 380 / 560 | 360 / 520 | 320 / 480 | top-centre |
| `--trk-w` (tracker) | 264 | 244 | 220 | top-right |
| `--chat-w` × `--chat-h` | 400 × 176 | 360 × 152 | 320 × 120 | chat |
| `--micro` (micro-menu button) | 32 | 30 | 28 | corner |
| `--gut` (screen gutter) | 16 | 14 | 12 | all zones |
| `--tip-w` | 320 | 300 | 280 | tip card |

`sm` additionally: tracker starts collapsed to its header, flask row hidden, chat shows 3 lines. Full-rack widths (`rack + 28` padding): `lg` 718 ≤ 740, `md` 666 ≤ 668, `sm` 598 ≤ 600 — the slot sizes above were chosen so the L60 rack always fits `--bd-max`.

### 2.3 Mockup — 1920×1080 (scale 1.0, density `lg`)

*The diagram is proportional (1 character = 16 × 24 css px). The tables in §2.5–§2.10 are authoritative for exact numbers.*

```
 ┌─────────────────┐                            ┌──────────────────────┐                               ┌──────────────┐
 │(o) Gölge Avcısı │                            │Orman Kurdu       Sv.7│                               │ MİNİ HARİTA  │
 │Sv.24 Şövalye    │                            │████████░░░░░░  2,4K  │                               │ (disk 192px) │
 └─────────────────┘                            └──────────────────────┘                               │              │
 [◆][◆][◆][◆] +2                                                                                       │              │
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                                      │              │
 ┆GRUP (grupta) ┆                                                                                      │              │
 ┆Ahmet  ████▌  ┆                                                                                      │              │
 ┆Zeynep ███░░  ┆                                                                                      │Altın Tarlalar│
 ┆Mert   █████  ┆                                                                                      │Sv. 5-10      │
 ┆              ┆                                                                                      └──────────────┘
 └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                                   ┌─────────────────┐
                                                                                                    │TAKİPÇİ [G][K][B]│
                                                                                                    │Fare Yuvası      │
                                                                                                    │▸ Sıçan 3/10 ██░░│
                                                                                                    │▸ Muhtara dön 0/1│
                                                                                                    │? Ne yapmalıyım  │
                                                                                                    │                 │
   ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                               └─────────────────┘
   ┆KOMBO ×12       ┆
   ┆HARİKA!         ┆
   ┆▬▬▬▬▬▬▬░░       ┆
   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                       +
 ◀◆ Muhtar Cemal 14 m
                                                                                                   ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                                                                                                   ┆İPUCU (bir kez)   ┆
                                                                                                   ┆[Shift] Yuvarlan  ┆
                                                                                                   ┆vuruştan kaçınır  ┆
                                                                                                   ┆             [✓]  ┆
                                                                                                   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
                                                     ┌┄┄┄┄┄┄┄┄┄┄┄┄┐
                                                     ┆[F] Konuş   ┆
                                                     └┄┄┄┄┄┄┄┄┄┄┄┄┘                               ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐
                                                                                                  ┆EŞYA AKIŞI         ┆
                                                                                                  ┆+120 Altın         ┆
                                                 ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                           ┆Kurt Postu ×3      ┆
                                                 ┆Şimşek ████░░ 1,2   ┆                           ┆▲ Çelik Kılıç      ┆
 ┌───────────────────────┐                       └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘ ┌┄┄┄┄┄┄┄┄┄┐               ┆                   ┆
 │SOHBET  400×176        │                                              ┆şişeler  ┆               ┆                   ┆
 │[Genel][Grup][Fısıltı] │                                              └┄┄┄┄┄┄┄┄┄┘               └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
 │Ahmet: selam!          │           ┌────────────────────────────────────────────┐                 ┌─────────────────┐
 │Zeynep: grup?          │           │ALT TAHTA  ≤740×104   ◆◆◆◆ EXP boncukları   │                 │altın 48.213     │
 │                       │           │[30] HP ████████████  SP ██████████         │                 │[▪▪▪▪▪▪▪▪] mikro │
 │                       │           │[T][X][V] │ [LMB][RMB][Q][E][1][2] │ [4][5] │                 │                 │
 └───────────────────────┘           └────────────────────────────────────────────┘                 └─────────────────┘
```

Legend: solid boxes = always-on (T0); dashed boxes = contextual (T1), absent when they have nothing to say; `+` = crosshair; `◀◆` = objective arrow clamped to the screen edge (§4.4); `[◆][◆]` = buff icons. Boss fights replace the target position with the boss frame (target moves under it).

### 2.4 Mockup — 1280×720 (scale 0.8, density `md`, HUD space 1600 × 900 css px)

*Proportional to the physical window (1 character = 12.8 × 18 physical px). Sizes in the tables are CSS px; multiply by 0.8 for physical pixels. At 720p the board is ≤ 668 css px = ≤ 534 physical px.*

```
 ┌────────────────┐                      ┌──────────────────────┐                    ┌────────────┐
 │(o) Gölge Avcısı│                      │Orman Kurdu     Sv.7  │                    │MİNİ HARİTA │
 │Sv.24 Şövalye   │                      │███████░░░░░  2,4K    │                    │(disk 192px)│
 └────────────────┘                      └──────────────────────┘                    │            │
 [◆][◆][◆] +2                                                                        │            │
 ┌┄┄┄┄┄┄┄┄┄┄┄┄┐                                                                      │            │
 ┆GRUP        ┆                                                                      │            │
 ┆Ahmet ████▌ ┆                                                                      │            │
 ┆Zeynep ███░ ┆                                                                      │            │
 ┆Mert  █████ ┆                                                                      │A.Tarlalar  │
 └┄┄┄┄┄┄┄┄┄┄┄┄┘                                                                      │Sv. 5-10    │
                                                                                     └────────────┘
                                                                                   ┌──────────────┐
                                                                                   │TAKİPÇİ       │
                                                                                   │Fare Yuvası   │
                                                                                   │▸ Sıçan 3/10 █│
                                                                                   │▸ Muhtara dön │
                                                                                   │              │
                                                                                   └──────────────┘

                                                  +










 ┌─────────────────────┐                                                        ┌─────────────────┐
 │SOHBET 360×152       │                                                        │EŞYA AKIŞI       │
 │[Genel][Grup][Fısıl] │                                                        │+120 Altın       │
 │Ahmet: selam!        │     ┌────────────────────────────────────────┐         │Kurt Postu ×3    │
 │                     │     │ALT TAHTA  ≤668×100  ◆◆◆◆               │         │                 │
 │                     │     │[30] HP ███████████  SP █████████       │         │altın 48.213     │
 └─────────────────────┘     │[X][V]│[LMB][RMB][Q][E][1]│[4][5]       │         │[▪▪▪▪▪▪▪▪] mikro │
                             │                                        │         └─────────────────┘
                             └────────────────────────────────────────┘
```

At 720p the chat (right edge 14 + 360 = 374) and the board (left edge (1600 − 668) / 2 = 466) clear each other by 92 css px; the right column (left edge 1600 − 14 − 300 = 1286) clears the board's right edge (466 + 668 = 1134) by 152 css px. If the board is at `--bd-max` and the window narrower than 1500 css px (`sm`), `--bd-max` is 600 so the chat (320 + 12) and the board (left (1280 − 600) / 2 = 340) still clear by 8 px — the minimum safe case.

### 2.5 Zone anchors (exact)

| Zone class | Anchor | Owner widget(s) | Notes |
|---|---|---|---|
| `.hud-tl` | `left: var(--gut); top: var(--gut)`, width `--chip-w` | `PlayerChip`, `StatusRow` (buffs / debuffs), `PartyFrames`, `PerfOverlay` | column, gap 8 |
| `.hud-tc` | centre-x, `top: 14px` | `BossFrame` (when a boss fights) above `TargetFrame` | column, gap 10 |
| `.hud-tr` | `right: var(--gut); top: var(--gut)`, width `--trk-w` | `Minimap` (208 × 236), `ContextTracker` | column, gap 12, right aligned |
| `.hud-ml` **(new)** | `left: 48px; top: 40%` | `ComboCounter` | anchor of the `combo` edit frame |
| `.hud-mr` **(new)** | `right: var(--gut); top: 56%`, width `--tip-w` | `TipCards` (one card at a time) | below the tracker column, above the loot feed |
| `.hud-bl` | `left: var(--gut); bottom: var(--gut)` | `Chat` | `--chat-w × --chat-h` |
| `.hud-bc` | centre-x, `bottom: 6px` | `ab-error` line, `PlayerCastBar`, board | column, items centred |
| `.hud-br` | `right: var(--gut); bottom: var(--gut)`, width 330 / 300 / 280 | `LootFeed` (≤ 5 lines), gold chip, micro row | column, gap 8, right aligned |
| centre layer | `position: absolute; inset: 0` | crosshair, interaction prompt (bottom 31 %), banners, `QuestFeed`, `ObjectiveArrow`, combat cues | pointer-transparent |

Everything keeps its current frame id for the layout editor (§2.13).

### 2.6 The bottom board ("Alt Tahta")

#### 2.6.1 Structure

The Metin2 stone board stays (stone, gold rivets, diamond caps) but is rebuilt **vertically**: a gauge row on top, one action rack below, EXP beads on the top rim. Class names `m2*` are kept (less churn); `Metin2Bar.ts` owns the board, `ActionBar.ts` owns the rack and is still mountable in the orbs style.

```
.m2                       position: relative; width: max-content; min-width: var(--bd-min); max-width: var(--bd-max);
                          padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; height: auto (104 at lg, 100 at md)
├─ .m2-beads              position: absolute; top: -12px; left: 50%; translateX(-50%); 4 beads × 22 px, gap 4 → 100 × 22
│  └─ .m2-cradle          120 × 26 gold-trimmed trapezoid plate behind the beads (clip-path), z -1
├─ .tb-badge              absolute; left: 14px; top: -13px — "N 3" talent badge (existing TalentBadge, re-anchored)
├─ .m2-top                display: flex; align-items: center; gap: 8px; height: 24px
│  ├─ .m2-lvl             30 × 30 medallion (level number, Cinzel 15, gold ring)
│  ├─ .m2-gauge.m2-hp     flex: 1.4; height: 22px
│  └─ .m2-gauge.m2-sp     flex: 1;   height: 22px   (was 17)
├─ .m2-rack               (ActionBar element) display: flex; align-items: center; justify-content: center; gap: 12px;
│                         height: var(--sl-lg)
│  ├─ .ab-group.major     T · X · V
│  ├─ .ab-sep             2 × 40 px gold-5 line (shown only between two visible groups)
│  ├─ .ab-group.skills    LMB · RMB · Q · E · 1 · 2 · 3 · R
│  ├─ .ab-sep
│  └─ .ab-group.potions   4 · 5
├─ .m2-extras             absolute; left: 14px; bottom: calc(100% + 6px) — dodge charges + combo pips (§2.6.6)
└─ .m2-flasks             absolute; right: 14px; bottom: calc(100% + 6px) — FlaskRow (§2.6.5)
```

Above the board, bottom → top inside `.hud-bc`: board · (rim items: talent badge, extras, flasks) · `PlayerCastBar` (340 × 26, margin-bottom 4) · `.ab-error` line (Cinzel 16 red). Remove the old three-well layout (`.m2-well`, `.m2-stat`, `.m2-beads` as a 172 px well, `.m2-slotswrap`).

**Width rule:** `width = max(--bd-min, rackWidth + 28)`; the board animates its width with `transition: width 300ms var(--ease-std)` when a slot is revealed. At level 1 (2 skills + 2 potions) the rack is ≈ 200 px and the board stays at the 540 px minimum, so the gauges keep a comfortable length.

**Board anatomy** (not to scale, `lg`):

```
 level 1  (board = 540 wide, 104 high)

                          (o)(o)(o)(o)          ← EXP beads on the top rim (22 px)
 ┌──────────────────────────────────────────────────────────┐
 │ (1) ┃██████████ 120 / 120 ┃  ┃█████████ 60 / 60 ┃        │  ← 24 px gauge row
 │                                                          │
 │           [ LMB ][ RMB ]    │    [ 4 ][ 5 ]              │  ← 54 px rack: skills │ potions
 └──────────────────────────────────────────────────────────┘

 level 60 knight with spec (board ≈ 720 wide)

 [N 3]                     (o)(o)(o)(o)                     (6)(7)(8)   ← talent badge · flasks (only if equipped)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ (60) ┃███████████ 15.2K / 15.2K ┃  ┃██████████ 82 / 100 ┃                │
 │ (T)[ X ][ V ] │ [ LMB ][ RMB ](Q)(E)(1)(2)(3)(R) │ (4)(5)                │
 └──────────────────────────────────────────────────────────────────────────┘
   sm  lg  lg      lg    lg     md ...              sm sm
```

#### 2.6.2 Gauges

- `.m2-gauge` keeps `M2Gauge` logic (exact fill + lighter trail, `hit` pulse, `low` pulse below 30 %). New: height 22, 2 px `--ink` border + inset 1 px `--gold-4`; the label is `1.234 / 1.500` (no "Can"/"Mana" prefix) in Cinzel 700 13 px, white, `--sh-text`, tabular figures; a 14 px resource icon (`stat-life.svg`, `stat-mana.svg`; rage/energy/focus/faith/essence reuse `stat-*` icons or none) sits at the left inside the gauge at 60 % opacity.
- Fill colours come from the **banded resource tokens** (§3.7) for **all six** resource kinds (fixes D10). `Metin2Bar.setKind(p.resourceType)` is unchanged; CSS covers `hp`, `mana`, `rage`, `energy`, `focus`, `faith`, `essence`, plus a neutral fallback so a future kind is never invisible.
- Dead state: whole `.m2-top` gets `grayscale(0.9) brightness(0.7)` (as today).
- Notches every 10 % stay (`repeating-linear-gradient`, 32 % black).

#### 2.6.3 EXP beads

`Bead` / `Metin2Bar.updateExp` logic unchanged (4 beads = 4 × 25 % of the level; level-up hold + flash; "+N XP" floaters). New: 22 px beads on the top rim, on a 120 × 26 cradle; tooltip text `Tecrübe: 12,3% (1.234 / 10.000)` appears **above** the cradle on hover; at max level the beads are full gold and the tooltip says `Azami seviye`.

#### 2.6.4 Rack: progressive reveal (the answer to "skill bar çok fazla")

`ActionBar.ts` gets three groups and a per-slot `reveal` state computed every frame:

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
//   m45/m90/m180 -> hidden until a spec is chosen, then spec.unlock[spec.majors.mXX] (fallback 10/20/30); m180 only if spec.majors.m180.
```

| Slot | Key | Size | Visible when | If unlocked but empty |
|---|---|---|---|---|
| `lmb` | SolT | lg (square) | always (basic attack, never empty) | – |
| `rmb` | SağT | lg | always (a class skill exists at level 1) | dashed socket |
| `q` | Q | md | skill bound and level ≥ 3 | dashed socket |
| `e` | E | md | level ≥ 6 | dashed socket |
| `s1` | 1 | md | level ≥ 10 | dashed socket |
| `s2` | 2 | md | level ≥ 15 | dashed socket |
| `s3` | 3 | md | level ≥ 20 | dashed socket |
| `r` | R | md, gold "ultimate" frame | level ≥ 30 | dashed socket |
| `m45` | X | lg **round** | spec chosen and level ≥ 10 | – (fixed per spec) |
| `m90` | V | lg round | level ≥ 20 | – |
| `m180` | T | sm round, gold frame | spec has `majors.m180` and level ≥ 30 | – |
| `potHp` / `potMp` | 4 / 5 | sm | always (count 0 shown dim red) | – |
| flasks | 6–0 | xs round | a flask is equipped in that belt slot | – |

What this does at the milestones: **L1** `LMB RMB │ 4 5` (4 slots) · **L3** +Q · **L6** +E · **L10** +1 and, after choosing a spec, `[X]` · **L15** +2 · **L20** +3 and `[V]` · **L30** +R (and `[T]` for the four hero specs). At L60 the rack holds at most 8 skill slots + 3 majors + 2 potions.

- **Reveal animation:** `.slot.is-new` — scale 0.6 → 1.0 and opacity 0 → 1 over 400 ms (`--ease-pop`), one gold ring pulse (`slotready` keyframe, 550 ms), and a 12 px gold **"YENİ"** tag under the slot (Cinzel 12 px — with key caps the only place where 12 px is allowed) until the slot is hovered, used, or 30 s pass. The existing toast `Yeni beceri öğrendin: …` (Progression.autoAssignSkills) is kept.
- **Dashed socket:** `.slot.is-socket` — 2 px dashed `--gold-5` border, centred "+" (Cinzel 22, `--text-4`), key cap dim. Click opens the skill book (`G.ui.openPanel('skills')`). Drop targets still work through the K panel's own bar editor.
- **Majors:** frame tone by skill (`def.tags` has `defensive` → `blue`, `def.heal` or tag `heal` → `green`, else `gold`; the m180 hero slot is always `gold`). The hero slot shows `Yorgun m:ss` in red over the icon while the local player has the `sated` status (even if the 180 s cooldown is ready). Tooltip = `skillTooltipHTML` plus a line `Büyük Yetenek · Bekleme 45 sn` (GDD_V2 §2.4). A major that becomes ready plays the existing `slotready` pulse and `sfx_cd_ready` is left to the audio owner (unknown ids stay silent).
- **Potions:** unchanged logic (best tier owned, `potion_cd` sweep, count badge bottom-right Cinzel 14, red when 0).
- Key caps are read from `G.input.bindingLabel(action)`; no hard-coded letters.

#### 2.6.5 Flask row (hidden until owned)

`hud/FlaskRow.ts` (`FlaskRow implements HudWidget`, mounted into `.m2-flasks`): reads `G.character.save.flasks[0..4]` (`ItemInstance | null`) and `save.flaskCharges[0..4]`; max charges from `getFlaskBase(item.baseId)?.max[tier]` (stub today, so the row is simply absent). Each equipped flask is a 28 px **round** slot: liquid fill (bottom-up, `--flask-color` from the base `effect`/icon tone) = charges / max, greyed while charges < `use`, flash ring on `flask:used`, count text only on hover. Key caps (6 7 8 9 0 via `flask1..flask5` bindings) are shown on hover only. No flask equipped → the element has `display: none` (no frame, no label, no empty circles). Click = drink (same call the key uses, through `G.combat` / whatever WP3 exposes; until then the click only flashes).

#### 2.6.6 Extras ribbon (dodge charges, combo points)

`.m2-extras` sits on the board's top-left rim above the talent badge. `DodgeCharges` (2–3 segments of 30 × 8 px, key cap "Shift") is **shown only while a charge is recharging or within 4 s of a roll**, fading in/out over 300 ms; rogue/monk/paladin pip counters (`ComboPoints` etc.) show only while pips > 0. When both are idle the ribbon is `display: none`.

#### 2.6.7 States of a slot

| State | Class | Look |
|---|---|---|
| normal | `.slot` | stone-3 well, icon tinted by damage type (`--ac`), 2 px ink border + 1 px gold-4 inner line |
| hover | `:hover` | inner line → `--gold-1`, 8 px gold glow, tooltip after 120 ms |
| pressed | `.press` (200 ms) | scale 0.86 → 1.07 → 1.0 |
| cooldown | `.oncd` | icon dim (brightness .5, saturate .5), conic sweep (`--e`), remaining time centred (Cinzel 20 lg / 16 sm; **one decimal under 3 s**) |
| gcd | `.slot-gcd` | thin 20 % white sweep |
| ready flash | `.ready` | 16 px gold ring expanding, 550 ms |
| no resource | `.nores` | 62 % blue tint, icon greyscale |
| casting | `.casting` | 2 px `--gold-1` ring + `--ac` glow |
| failing | `.failing` / `.fail` | red ring + 3 px shake (260 ms) |
| disabled (stunned / silenced) | `.is-disabled` | grey icon + 45° hatch overlay, no hover glow |
| socket | `.is-socket` | dashed, "+" |
| new | `.is-new` | grow-in + "YENİ" tag |

### 2.7 Player chip, buffs, party

**Player chip** (`PlayerFrame.ts` → class `pf` kept, bars removed): `.k-plate`, `--chip-w × 64`, one row: 52 px circular portrait (class icon on a dark disc, class-colour ring 2 px, dead = greyscale) · text column: **name** (Cinzel 17, `--gold-1`, ellipsis) over `Sv. 24 Şövalye` (14 px, class colour) with the **spec chip** (13 px, role colour border, only when a spec is chosen) right-aligned on the same line. Click opens the character panel (C). No HP/SP bars, no level badge on the portrait (level lives on the board medallion and in the sub line). The party-leader crown shows right of the name while grouped.

**Buff row** (`StatusRow`, `.pf-auras`): icons 28 px (was 32), gap 3, **max 10 visible + a `+N` chip** (tooltip lists the rest); buffs first, debuffs on a second row with red 2 px frames; instead of always-on time text a **conic sweep** shows the remaining fraction and a Cinzel 12 px bold number appears only under 10 s; icons under 3 s blink (existing `stblink`).

**Party frames** (`PartyFrames.ts`, only when ≥ 2 members): `--party-w × 46` each, gap 6: 34 px portrait, name (Cinzel 14) + role icon (tank blue shield / healer green cross / dps red sword, from `SpecDef.role`), HP bar 12 px with number on hover, resource bar 5 px, leader crown, dead state ("Öldü"), targeted ring (gold), dispellable debuff border (GDD_V2 §1.6). Debuff icons max 4 at 18 px. Ready-check and cooldown-tracker details are unchanged from GDD_V2 §2.4/§1.6.

### 2.8 Target and boss frames

- **Target** (`TargetFrame.ts`): `.k-plate`, `--tgt-w × 62`, name (Cinzel 17, colour by rank as today) + level in the **relative-level colour** (grey ≤ −8, green −7…−3, yellow −2…+2, orange +3…+4, red ≥ +5, skull glyph ≥ +10; helper `ui/widgets/levelColor.ts` from GDD_LIFE, create it if missing), HP bar 20 px with `%` at the right, cast bar 16 px below, debuffs ≤ 8 × 24 px, threat strip (GDD_V2) 4 px under the HP bar, rank trim (elite gold, boss red) as a 1 px extra inner line (not the current 34 px capsule radius). Soft target opacity 0.78.
- **Boss** (`BossFrame.ts`): `--boss-w × auto` plate, name Cinzel 24, title 13 px caps, phase chip, HP bar 24 px with phase notches, enrage chip, battle-revive pips (`RunState.brez`), cast bar 20 px. When a boss frame is visible the target frame sits 10 px under it.

### 2.9 Top-right: minimap + ONE context tracker

**Minimap** (`Minimap.ts`): disc 192 / box 208 × 236 kept. Changes: zoom `+ −` buttons appear only on hover (`.mm:hover .mm-zoom`); the ribbon's second line shows the **zone level band** `Sv. 5–10` coloured relative to the player (green = 3+ above the band top, grey = trivial, yellow = in band, red = band starts 3+ above the player); quest-giver `!`/`?` icons and the objective ring work in **town and world** (§4.5); a small ice-blue **LFG eye** (`ui-compass.svg` tinted) sits at 7 o'clock on the ring while the finder is searching/listing (tooltip `Zindan Bulucu: aranıyor 0:42`).

**ContextTracker** (`hud/Tracker.ts`, replaces the stacked `MythicTracker` + `QuestTracker` elements in the column; their inner renderers become its three panes):

| Mode | Auto-selected when | Pane content (max height 320 lg) |
|---|---|---|
| `boss` | `BossFrame.visible` | boss name, `Faz 2 / 3`, enrage timer, battle-revive pips, up to 2 mechanic hints from `abilityTip(id)` of the boss's recent abilities (line hidden while the table is empty) |
| `run` | `G.mplus.state` exists (dungeon run, M+ or not) and no boss frame | key medallion `+7` (or "N"/"K"/"M" for non-key difficulties), dungeon name, difficulty, affix icons 24 px, timer with +3/+2/+1 thresholds, forces bar 12 px, boss list (done / pending), deaths and penalty |
| `quest` | else, when any quest is active | pinned quest (`getPinnedQuest()` or first active) title + level, ≤ 3 open objective rows, `+N görev daha`, `[L] Görev Defteri` footer |
| `hint` | else (no quest, not in a run) | one card: **"Ne yapmalıyım?"** + the recommended next action text from `recommend()` (§4.6) + `[.]` key cap. The tracker is never empty (fixes D17). |

Layout of a pane (all use `.k-plate`, `--trk-w`, padding 10 × 12, row gap 6):

```
┌ TAKİPÇİ ──────────────────────── [G][K][B] [?] [▾] ┐  header 28 px: title (Cinzel 14, text-2) · mode tabs · help · collapse
│ ◆ Fare Yuvası                                 Sv.1 │  title 15 Cinzel gold-1; level in relative-level colour
│ ▸ Orman Sıçanı öldür                        3 / 10 │  row: 14 px text · count right (Cinzel 14)
│   ███████░░░░░░░░░░░░░░░░░                         │  6 px bar under every kill / collect objective
│ ✓ Muhtar Ferhat ile konuş                          │  done row: green, struck, folds away 6 s after completion
│ +2 görev daha                    [L] Görev Defteri │  footer 13 px (illustrative rows)
└────────────────────────────────────────────────────┘
```

Rules: tabs `[G]`=görev, `[K]`=koşu, `[B]`=boss show only the modes that currently have content; clicking one **pins** it for 60 s, then auto-selection resumes. `[▾]` collapses to the 28 px header; collapsed state is stored per mode in `localStorage['efsun.tracker.v1']`; `sm` density starts collapsed. Clicking the pane opens the matching panel (quest → `questlog`, run → `mplusInfo`, hint → `guide`). The pane never exceeds 320 px; overflow rows are summarised (`+N`).

**Kill/quest feedback (fixes D21):** the tracker diffs `QuestSystem.progressRows()` against the previous frame; when a row's `have` rises it (a) flashes the row for 600 ms, (b) animates the bar fill (200 ms, `steps(6)` for the PSX feel), and (c) pushes a line into `QuestFeed` (centre, §2.11): `Orman Kurdu: 3 / 8`. When a row completes the line turns green with a ✓ and plays `ui_confirm` at 0.4. `quest:updated` with `state: 'ready'` shows `Görev tamamlandı — teslim et: Muhtar Cemal` once.

### 2.10 Bottom-right corner

Bottom → top: **micro row**, **gold chip**, **loot feed**; the damage-meter pill is absent by default.

- **Loot feed** (`LootFeed`, `Corner.ts`): max **5** lines (was 7), lifetime 4 s (rare+ 7 s), identical items merge into `×N`, gold lines merge (existing), an item that is an upgrade for its equipped slot (higher `itemLevel`) shows a green `▲`. Line height 28, font 15.
- **Gold chip:** `.k-chip` 28 px, coin icon + amount (Cinzel 15, `--gold-1`), right aligned; floating `+N` / `−N` deltas unchanged.
- **Micro menu** (`MicroMenu`): **one row** of `--micro` px square buttons, 70 % opacity until hovered, 100 % when it carries a badge; revealed progressively:

| Button | Icon | Key | Shown when | Badge |
|---|---|---|---|---|
| Çanta | `ui-bag` | I | always | yellow dot when the bag is ≥ 90 % full |
| Karakter | `ui-character` | C | always | – |
| Harita | `ui-map` | M | always | – |
| Grup | `ui-party` | O | always | invite / ready-check dot |
| Yetenekler | `ui-passive-tree` | N | level ≥ 2 | unspent-point count (reuses `TalentBadge`) |
| Yetenek Kitabı | `ui-spellbook` | K | level ≥ 3 | `!` when a learned skill is not on the bar |
| Görevler | `ui-quest` | L | first quest accepted | `?` when a quest is ready |
| Zindan Bulucu | `ui-dungeon` | `,` | level ≥ 8 | ice-blue eye while queued |
| Menü | `ui-gears` | Esc | always | – |

Level-1 character: Çanta, Karakter, Harita, Grup, Menü = **5 buttons**. At 9 buttons the row is `9 × 32 + 8 × 4 = 320` px (fits 330). The M+ info button (J) is not in the row (reachable from the finder and the game menu); it appears only at level ≥ 50.

- **"Arayüzü Düzenle" button:** removed from the HUD. Entry points: Esc menu button, Settings › Arayüz, chat command `/arayuz` (GDD_LIFE command table gets it), and `HudApi.startEdit()` stays. (Package UX-13 removes the button; UX-52a adds the menu / settings entries; UX-31 handles the local `/arayuz` and `/zindan` commands next to `/temizle` until GDD_LIFE's `ChatCommands.ts` exists.)
- **FPS counter:** the bottom-right `FpsCounter` is removed; `PerfOverlay` (F3 / `showFps`) is the only readout.
- **Damage meter** (`DamageMeter.ts`): new `Settings.meterVisibility: 'auto' | 'always' | 'never'` (default `auto`). `auto` = the DPS pill is visible only when the local player is in a party of ≥ 2 **and** inside a dungeon scene; solo players see nothing. `always` = pill like today. `never` = no pill, Shift+D still toggles the window. The window's position/persistence code is untouched.

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

**Combo counter** (`ComboCounter.ts`): anchor `.hud-ml` (`left: 48; top: 40%`), width 280. Appears from **3 hits**, fades 2.5 s after the last hit. Sizes: number 40 px (tier 1) → 56 px (tier 3+), rank word 20 px; the `label`, `bonus` and `total` lines are shown only from tier 2; the timer bar is 4 px × 160. All colours via tokens; the existing slam/pop/rainbow animations are kept.

### 2.12 Visibility matrix

| Element | Default | Shown when | Hidden / removed when |
|---|---|---|---|
| Player chip | on | in game | edit mode keeps it |
| Buff row | on (empty = no height) | any status | none |
| Party frames | off | ≥ 2 party members | solo |
| Board (gauges, rack, beads) | on | in game | – |
| Skill slots Q E 1 2 3 R | **off** | learned (§2.6.4) | – |
| Majors X V T | **off** | spec + level (§2.6.4) | – |
| Flask row | **off** | a flask equipped | none equipped |
| Extras ribbon (dodge, pips) | off | recharging / pips > 0 | idle |
| Talent badge `N` | off | unspent points | none |
| Target frame | off | soft/hard target | no target |
| Boss frame | off | boss fight | – |
| Minimap | on | in game | – |
| Context tracker | on | always (4 modes, never empty) | player collapsed it |
| Combo counter | off | ≥ 3 hits | 2.5 s idle |
| Tip card | off | a tip fires (§4.7) | dismissed / timed out |
| Objective arrow | on | pinned objective has a position | arrived, no objective, panel open |
| Chat | on (transparent) | always | – |
| Loot feed | off | pickups | 4–7 s |
| Gold chip | on | always | – |
| Micro menu | on (progressive) | §2.10 | – |
| Damage meter | **off** | party of ≥ 2 in a dungeon (`auto`) | solo |
| Extra bars Çubuk 2/3 | **off** (already default) | Settings › Arayüz toggle / edit mode | – |
| "Arayüzü Düzenle" | **removed** | – | – |
| FPS | off | F3 / `showFps` | – |

### 2.13 Layout editor and `layoutStore` changes

- **Frame ids** stay: `player`, `buffs`, `party`, `target`, `boss`, `minimap`, `combo`, `chat`, `meter`, `bottom`, `loot`, `corner`, `bar2`, `bar3`. `mplus` is **renamed `tracker`**. New: none (the objective arrow, tip card and quest feed are not movable).
- `layoutStore.ts` key becomes `efsun.uiLayout.v2` and `UiLayout.v = 2`. On first read it loads `efsun.uiLayout.v1` once and migrates: keep `grid`, `locked`, `bars`; keep frame offsets for `target`, `boss`, `minimap`, `combo`, `chat`, `meter`, `loot`, `buffs`, `party`, `bar2`, `bar3`; map `mplus → tracker`; **drop** `bottom`, `player`, `corner` (their anatomy changed). The v1 key is left untouched.
- Because zones now position everything with `var(--gut)` anchors, offsets stay fractions of the window (unchanged semantics).
- Edit mode toolbar (`EditMode.ts`) gets: a **"Varsayılana Dön"** button per frame (existing global reset stays), a density read-out (`Yoğunluk: Orta`), and the extra-bar visibility toggles (already there). The editor is entered from the Esc menu / Settings, not from a HUD button.

---

## 3. Visual design system ("Taş & Altın")

### 3.1 Language in one paragraph

**One material, one metal:** dark carved **stone** surfaces (warm brown-black, never pure black or grey) trimmed with **gold** (a 5-step ramp). Every frame is built from the same recipe — a **2 px ink outline**, a **1 px gold line**, a **2 px stone gap**, an optional second gold hairline — so a HUD plate, a window, a button and a slot read as the same family. Interactive things lift (gold line brightens, 8–10 px gold glow), inactive things sink (inset shadow). PSX crispness: three-band stepped gradients instead of smooth ones, whole-pixel positions, nearest-neighbour bitmaps, glows made of `box-shadow`/`drop-shadow` (no blur filters), pulses animated with `steps()` where a low-frame-rate shimmer is wanted.

### 3.2 `src/ui/styles/tokens.css` (new — copy as written)

Imported **first** by `ui/UI.ts` (after `main.ts` has imported `base.css`, so the legacy aliases below win). No component hard-codes a colour that exists here.

```css
:root {
  /* ---- stone (surfaces) ---- */
  --stone-0: #070504;  /* void */
  --stone-1: #0f0a07;  /* wells, inputs, gauge backs */
  --stone-2: #181009;  /* panel base */
  --stone-3: #231811;  /* cards, raised */
  --stone-4: #33241a;  /* hover surface, active tab */
  --stone-5: #4a3622;  /* highlight, button top */
  --ink:     #050302;  /* the 2 px outline */

  /* ---- gold (trim, accents) ---- */
  --gold-1: #ffe7a3;   /* bright text on stone, hover line */
  --gold-2: #e8c46a;   /* primary gold */
  --gold-3: #c9a24a;   /* trim */
  --gold-4: #9b7b36;   /* trim shade, inner line */
  --gold-5: #5a4522;   /* deep trim, dividers */

  /* ---- text ---- */
  --text-1: #f6ecd2;   /* primary (contrast 13:1 on stone-2) */
  --text-2: #d9cba8;   /* secondary (10:1) */
  --text-3: #b3a284;   /* dim (7:1) */
  --text-4: #8a7c62;   /* disabled only (4:1) */

  /* ---- status / role ---- */
  --ok: #6fe07a;  --warn: #ffa83a;  --bad: #ff5a4a;  --info: #6fb1ff;
  --role-tank: #5aa8ff;  --role-heal: #6fdc8c;  --role-dps: #e0604e;

  /* ---- resource / gauge base colours (banded in kit.css) ---- */
  --res-hp: #e8383c;  --res-mana: #4a88f0;  --res-rage: #e0482a;  --res-energy: #f0d23a;
  --res-focus: #3cc8b4;  --res-faith: #e8d8a0;  --res-essence: #6cc83a;  --res-xp: #9a4ee0;

  /* ---- rarity (WoW, = RARITY_COLORS) + readable text variants for the dark UI ---- */
  --rar-poor: #9d9d9d;  --rar-common: #ffffff;  --rar-uncommon: #1eff00;  --rar-rare: #0070dd;
  --rar-epic: #a335ee;  --rar-legendary: #ff8000;  --rar-set: #00d5a0;
  --rar-rare-text: #4da3ff;  --rar-epic-text: #c27bff;      /* use for TEXT on stone; borders/glows use the base colours */

  /* ---- damage types (= DAMAGE_COLORS) ---- */
  --dmg-physical: #d8d8e0; --dmg-fire: #ff7a2a; --dmg-frost: #6fd8ff; --dmg-lightning: #ffe84a; --dmg-shadow: #b060ff;
  --dmg-poison: #7cd23a;   --dmg-holy: #ffe08a; --dmg-arcane: #ff6ad8; --dmg-true: #ffffff;

  /* ---- type ---- */
  --font-title: 'Cinzel Decorative', 'Cinzel', serif;   /* banners only: zone, level-up, boss, welcome, countdown */
  --font-head:  'Cinzel', serif;                        /* headings, numbers, buttons, key caps */
  --font-body:  'Alegreya Sans', 'Segoe UI', sans-serif;
  --fs-12: 12px; --fs-13: 13px; --fs-14: 14px; --fs-15: 15px; --fs-17: 17px;
  --fs-20: 20px; --fs-24: 24px; --fs-32: 32px; --fs-48: 48px; --fs-64: 64px;

  /* ---- space / radius / z ---- */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px; --sp-6: 32px; --sp-7: 48px;
  --r-1: 2px; --r-2: 4px; --r-3: 6px; --r-pill: 999px;

  /* ---- shadows ---- */
  --sh-text: 0 1px 0 #000, 0 0 3px #000, 0 0 6px rgba(0, 0, 0, 0.8);
  --sh-pop:  0 20px 60px rgba(0, 0, 0, 0.75);
  --glow-gold: 0 0 10px color-mix(in srgb, var(--gold-2) 45%, transparent);

  /* ---- motion ---- */
  --t-fast: 90ms; --t-base: 160ms; --t-slow: 320ms;
  --ease-std: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-pop: cubic-bezier(0.2, 0.9, 0.3, 1.2);

  /* ---- PSX dither: 4 x 4 checker at 10 % black, laid over large stone surfaces ---- */
  --dither: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect width='2' height='2' fill='black' fill-opacity='.10'/><rect x='2' y='2' width='2' height='2' fill='black' fill-opacity='.10'/></svg>");
  --rivet: radial-gradient(circle, var(--gold-1) 0 1.5px, var(--gold-3) 1.5px 3.5px, var(--stone-0) 3.5px 5px, transparent 5px);

  /* ---- LEGACY ALIASES (do not delete; old CSS keeps working and follows the new palette) ---- */
  --gold: var(--gold-2);  --gold-dim: var(--gold-4);  --gold-bright: var(--gold-1);
  --hud-gold: var(--gold-2); --hud-gold-d: var(--gold-4); --hud-gold-dd: var(--gold-5); --hud-gold-l: var(--gold-1);
  --text: var(--text-1);  --text-dim: var(--text-3);
  --metal-0: var(--stone-0); --metal-1: var(--stone-1); --metal-2: var(--stone-2); --metal-3: var(--stone-4);
  --shade: var(--sh-text);
  --hp: var(--res-hp); --mana: var(--res-mana); --rage: var(--res-rage); --energy: var(--res-energy); --xp: var(--res-xp);
  --danger: var(--bad);
  --uncommon: var(--rar-uncommon); --rare: var(--rar-rare); --epic: var(--rar-epic); --legendary: var(--rar-legendary); --set: var(--rar-set);
}
```

Token count: 49 colour tokens (23 base + 8 resource + 9 rarity incl. 2 text variants + 9 damage) — the "≤ 50" budget. Components may derive tints with `color-mix(in srgb, var(--x) N%, …)`; they may **not** introduce new hex literals except inside gradients that are copied from this document.

Legacy token map (informational): `--panel-bg` / `--panel-bg-2` / `--panel-border` stay as defined in `base.css` and are used only by `menu.css`; panels switch to `--stone-*` in §7.

### 3.3 Frames — `src/ui/styles/kit.css` (new): `.k-frame`, `.k-plate`, `.k-card`, `.k-well`

| Class | Use | Recipe |
|---|---|---|
| `.k-frame` | windows (panels) | 4 gold rivets, dithered radial stone, `2px ink` border, `0 0 0 1px gold-4`, `0 0 0 3px ink`, inset gold-5 hairline, inner shadow, pop shadow |
| `.k-plate` | HUD widgets (chip, tracker, target, boss, tip card) | stone gradient 94 %, `2px ink`, inset `gold-4` 1 px + `stone-1` 2 px gap + `gold-5` 1 px, `0 3px 0 #000` drop |
| `.k-card` | inset content blocks inside windows | `stone-3`, 1 px `color-mix(gold-3 28 %)` line, radius 3 |
| `.k-well` | carved holes (slots, gauges, inputs) | `stone-1`, inset `0 3px 6px #000`, 1 px `gold-3` 30 % rim |

```css
.k-frame {
  position: relative;
  background:
    var(--rivet) top 6px left 6px / 14px 14px no-repeat, var(--rivet) top 6px right 6px / 14px 14px no-repeat,
    var(--rivet) bottom 6px left 6px / 14px 14px no-repeat, var(--rivet) bottom 6px right 6px / 14px 14px no-repeat,
    linear-gradient(180deg, rgba(255, 226, 150, 0.06), transparent 90px),
    var(--dither),
    radial-gradient(120% 80% at 50% 0%, var(--stone-3) 0%, var(--stone-2) 55%, var(--stone-1) 100%);
  border: 2px solid var(--ink);
  border-radius: var(--r-2);
  box-shadow: 0 0 0 1px var(--gold-4), 0 0 0 3px var(--ink), inset 0 0 0 1px var(--gold-5), inset 0 0 36px rgba(0, 0, 0, 0.5), var(--sh-pop);
  color: var(--text-1);
  font-family: var(--font-body);
}
.k-plate {
  background: linear-gradient(180deg, rgba(35, 24, 17, 0.94), rgba(15, 10, 7, 0.92));
  border: 2px solid var(--ink);
  border-radius: var(--r-3);
  box-shadow: inset 0 0 0 1px var(--gold-4), inset 0 0 0 3px var(--stone-1), inset 0 0 0 4px color-mix(in srgb, var(--gold-5) 90%, transparent), 0 3px 0 #000, 0 8px 18px rgba(0, 0, 0, 0.55);
  color: var(--text-1);
}
.k-card { background: var(--stone-3); border: 1px solid color-mix(in srgb, var(--gold-3) 28%, transparent); border-radius: 3px; padding: var(--sp-3); }
.k-well { background: linear-gradient(180deg, var(--stone-0), var(--stone-1)); border: 2px solid var(--ink); border-radius: var(--r-2);
  box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.9), inset 0 0 0 1px color-mix(in srgb, var(--gold-3) 30%, transparent), 0 1px 0 rgba(255, 231, 163, 0.12); }
```

Rules: a plate never nests another plate (use `.k-card`); window bodies use cards and wells; the dither overlay is on `.k-frame` only (large flat areas), never on plates (small, crisp).

### 3.4 Typography

| Role | Token / size | Font | Where |
|---|---|---|---|
| Display | `--fs-64` (+ 3 named exceptions: `.cd-num` 190, `.lvlup-num` 96, `.zone-title` 56) | Cinzel Decorative 700 | countdown, level-up, zone banner |
| Title | `--fs-32` (welcome title, finder dungeon banner) / `--fs-48` (boss yell) | Cinzel Decorative 700 | welcome card, boss yell, finder dungeon name banner |
| H1 | `--fs-32` | Cinzel 700, `letter-spacing: .08em` | rare (run summary heading) |
| H2 | `--fs-24` | Cinzel 700 | boss name, big numbers (timer 30 → `--fs-32`) |
| H3 / panel title | `--fs-20` | Cinzel 700, uppercase, `.12em`, gold gradient | window titles |
| Subhead / names | `--fs-17` | Cinzel 700 | unit-frame names, card titles |
| Body (panels, chat, tooltips) | `--fs-15` | Alegreya Sans 400/700, `line-height 1.35` | all running text |
| HUD text | `--fs-14` | Alegreya Sans 700 / Cinzel 700 | tracker rows, small buttons, chips |
| Secondary | `--fs-13` | Alegreya Sans | hints, footers, gauge numbers (Cinzel 700), sub-labels |
| Key cap | `--fs-12` | Cinzel 700 | **only** inside `.k-key--dim` and slot "YENİ" tags |

Rules: nothing carrying information is below `--fs-13`; use `font-variant-numeric: tabular-nums` for every counter/timer/gauge; letter-spacing only on uppercase (`.04–.14em`); do not use `Cinzel Decorative` below 32 px; Turkish dotted/dotless `İ ı` must stay (never `text-transform: uppercase` on strings without `lang="tr"` — set `lang="tr"` on `#ui-root` and use `toLocaleUpperCase('tr-TR')` in code).

Classes (kit.css): `.k-display .k-title .k-h1 .k-h2 .k-h3 .k-sub .k-body .k-hud .k-small .k-num` set family + size + weight + colour; `.k-dim` = `--text-3`; `.k-good/.k-bad/.k-warn` = status colours.

### 3.5 Buttons, tabs, chips, key caps

```css
.k-btn { height: 36px; padding: 0 18px; font: 700 var(--fs-14)/1 var(--font-head); letter-spacing: .06em; color: var(--text-1); text-shadow: var(--sh-text);
  background: linear-gradient(var(--stone-5), var(--stone-3)); border: 2px solid var(--ink); border-radius: var(--r-2);
  box-shadow: inset 0 0 0 1px var(--gold-4), 0 3px 0 #000; cursor: pointer; transition: filter var(--t-fast), transform var(--t-fast); }
.k-btn:hover { filter: brightness(1.18); box-shadow: inset 0 0 0 1px var(--gold-1), var(--glow-gold), 0 3px 0 #000; }
.k-btn:active { transform: translateY(2px); box-shadow: inset 0 0 0 1px var(--gold-1), 0 1px 0 #000; }
.k-btn:focus-visible { outline: 2px solid var(--gold-1); outline-offset: 2px; }
.k-btn[disabled] { opacity: .5; filter: grayscale(.6); cursor: not-allowed; }
.k-btn--primary { background: linear-gradient(#7a5a26, #2e200c); }
.k-btn--danger  { background: linear-gradient(#7a2a20, #2e0e0a); color: #ffd9d0; }
.k-btn--ghost   { background: transparent; box-shadow: inset 0 0 0 1px var(--gold-5); }
.k-btn--lg { height: 44px; font-size: var(--fs-17); }  .k-btn--sm { height: 28px; padding: 0 12px; font-size: var(--fs-13); }

.k-tabs { display: flex; gap: 2px; border-bottom: 2px solid var(--ink); }
.k-tab { height: 36px; padding: 0 16px; font: 700 var(--fs-14)/1 var(--font-head); letter-spacing: .1em; text-transform: uppercase; color: var(--text-3);
  background: var(--stone-2); border: 2px solid var(--ink); border-bottom: 0; border-radius: var(--r-2) var(--r-2) 0 0; cursor: pointer; }
.k-tab:hover { color: var(--text-1); background: var(--stone-3); }
.k-tab.is-active { color: var(--gold-1); background: var(--stone-4); box-shadow: inset 0 -3px 0 var(--gold-2); }
.k-tab .k-badge { margin-left: 8px; }                       /* unread / count dot */

.k-chip { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; font: 700 var(--fs-13)/1 var(--font-body);
  color: var(--text-1); background: var(--stone-1); border: 1px solid var(--chip-c, var(--gold-4)); border-radius: var(--r-pill); }
.k-badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; font: 700 var(--fs-13)/18px var(--font-head); text-align: center; color: #1a0f04; background: var(--gold-2); }
.k-key { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 8px; font: 700 16px var(--font-head); color: #1a0f04;
  background: linear-gradient(#fff0c0, var(--gold-2) 55%, var(--gold-4)); border: 2px solid var(--ink); border-radius: 5px; box-shadow: 0 3px 0 #000, inset 0 0 0 1px rgba(255,255,255,.5); }
.k-key--dim { min-width: 0; height: 16px; padding: 0 4px; font: 700 var(--fs-12)/16px var(--font-head); color: var(--gold-1); background: rgba(0,0,0,.72); border: 0; border-radius: 2px; box-shadow: none; }
.k-scroll { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--gold-4) transparent; }
.k-sep { height: 9px; background: linear-gradient(90deg, transparent, var(--gold-4) 20%, var(--gold-2) 50%, var(--gold-4) 80%, transparent) center / 100% 1px no-repeat; }
```

### 3.6 Icon and slot frames

- **Glyph icons:** the white game-icons SVG is a **mask** over a gradient (`.ico` in `hud.css` stays): `background: linear-gradient(#fff, var(--tint))` + `filter: drop-shadow(0 1px 0 #000)`; sizes 16 / 20 / 24 / 32 / 48 (`.k-ico-16 … .k-ico-48`). `--tint` is the damage colour, role colour or rarity colour.
- **Slot frame** (`.k-slot`, used by HUD slots, the skill-book bar editor, finder role pips, flask row): `border: 2px solid var(--ink)`, `box-shadow: inset 0 0 0 1px var(--gold-4), inset 0 0 0 2px var(--stone-3), 0 1px 0 rgba(255,231,163,.22)`; background `radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--ac, var(--gold-2)) 34%, var(--stone-2)), var(--stone-0) 80%)`. Shapes: `.k-slot` square radius 4 (skills), `.k-slot--round` radius 50 % (majors, potions, flasks, hero), `.k-slot--sm/--md/--lg/--xs` set `--sz`.
- **Tones:** `data-tone="gold|blue|green|red|violet"` recolours the inner gold line and the glow (`gold` offensive majors / ultimate, `blue` defensive, `green` heal, `red` danger/debuff, `violet` shadow/arcane).
- **Item slots:** `data-rarity="…"` sets the border colour from `--rar-*` plus a 6 px outer glow for epic+; text uses the `*-text` variants.
- **Hover / press / cooldown / ready / disabled** states: the table in §2.6.7 is the single definition; panels reuse the same class names (`.oncd`, `.nores`, `.is-disabled`).

### 3.7 Gauges and bars (banded, PSX)

One recipe for every bar; the three bands are derived from the base token, so adding a resource is one token:

```css
.k-band { --c: var(--res-hp);
  background: linear-gradient(color-mix(in srgb, var(--c) 58%, #fff) 0 24%, var(--c) 24% 58%, color-mix(in srgb, var(--c) 66%, #000) 58%); }
.k-gauge { position: relative; height: var(--gh, 22px); overflow: hidden; background: var(--stone-1); border: 2px solid var(--ink); border-radius: var(--r-1);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold-4) 60%, transparent), 0 1px 0 rgba(255,231,163,.12); }
.k-gauge[data-kind='hp']      { --c: var(--res-hp); }      .k-gauge[data-kind='mana']    { --c: var(--res-mana); }
.k-gauge[data-kind='rage']    { --c: var(--res-rage); }    .k-gauge[data-kind='energy']  { --c: var(--res-energy); }
.k-gauge[data-kind='focus']   { --c: var(--res-focus); }   .k-gauge[data-kind='faith']   { --c: var(--res-faith); }
.k-gauge[data-kind='essence'] { --c: var(--res-essence); } .k-gauge[data-kind='xp']      { --c: var(--res-xp); }
.k-gauge { --c: var(--res-mana); }  /* neutral fallback: a future ResourceType is never invisible */
.k-gauge > .k-fill { position: absolute; inset: 0; transform-origin: 0 50%; }   /* the .k-band is applied to .k-fill */
```

Resource → gauge kind mapping (all nine classes, from `data/classes.ts`): knight `rage`, barbarian `rage`, mage `mana`, rogue `energy`, monk `energy`, archer `focus`, paladin `faith`, necromancer `essence`, warlock `mana`. **`hud-metin2.css` (`.m2-gauge[data-kind]`) and `hud.css` (`.bar.res[data-kind]`) switch to these tokens in UX-10 / UX-11.**

### 3.8 Rarity, damage and state colours

- Rarity names/colours are `RARITY_COLORS` (`types/common.ts`) — unchanged values, now exposed as `--rar-*`. Use the **base** colour for borders, glows and icons, the **`-text`** variant (rare, epic) for text on stone (contrast ≥ 4.5 : 1). Legendary/set keep a 2 px outer glow in the tooltip frame.
- Level-difficulty colours (target frame, quest level, zone band): grey `--text-4`, green `--ok`, yellow `--gold-2`, orange `--warn`, red `--bad`, skull glyph for ≥ +10.
- Healing = `--ok`, damage taken = `--bad`, XP = `--res-xp`, gold = `--gold-1` on `#ffd24a` coin, mana/energy as §3.7.

### 3.9 Spacing, radius, layering

- 4 px base grid: only `--sp-1..7` (4, 8, 12, 16, 24, 32, 48). HUD gutters `--gut` 16/14/12; window padding 16; card gap 12; slot gap 4 inside a group, 10 + 2 px separator + 10 between groups.
- Radii `--r-1` (2, gauges, slots in the board), `--r-2` (4, buttons, windows), `--r-3` (6, plates), `--r-pill`. The current 23 distinct `border-radius` declarations collapse to these four (+ `50%` for circles).
- Z layers stay as in `hud.css` (`world 5 < hud 10 < menu 20 < panels 100 < top 300 < modal 400 < tooltip 500 < loading 800`). World-label bubbles live in the world layer; tips/arrow live in the HUD layer.

### 3.10 Motion

| Name | Duration · easing | Used by |
|---|---|---|
| hover | 90 ms `ease-out` | buttons, slots, micro buttons |
| press | 60 ms down / 120 ms up | buttons (`translateY(2px)`), slots (scale .86→1.07→1) |
| window open | 160 ms `--ease-pop` (`translateY(10px) scale(.965)` → none) | all panels |
| window close | 100 ms fade | all panels |
| tooltip | show delay 120 ms (0 while another is visible), hide 0 | `TooltipLayer` |
| slot reveal | 400 ms `--ease-pop` + 550 ms ring | rack |
| tip card | 240 ms slide-in from the right, 9 s life, 200 ms fade | `TipCards` |
| big banner | 700 ms in (pop), hold, 400 ms out | zone / level-up / quest |
| toast | 320 ms in, 350 ms out | `Toasts` |
| bubble | 120 ms pop-in (scale .9→1), 400 ms fade-out | chat / NPC bubbles |
| cooldown ready | 550 ms ring | slots |
| gauge trail | hold 400 ms then catch up (λ = 6) | M2Gauge (unchanged) |
| pulses (low HP, badges, new) | 0.9–1.2 s loop; use `steps(6, end)` for glow pulses to keep the stepped PSX shimmer | gauges, `N` badge, tip key |

`@media (prefers-reduced-motion: reduce)`: drop loops, keep 90 ms fades. Settings has no motion toggle yet (not needed).

### 3.11 Migration rules for the old CSS

1. `tokens.css` and `kit.css` are additive; nothing is deleted in Wave 0.
2. When a package restyles a widget it **replaces literals with tokens in the rules it touches** and removes only rules it supersedes. The final cleanup (UX-60) deletes dead selectors found by the grep list in that package.
3. `hud.css`' `:root` block (`--hud-gold*`, `--metal-*`, `--shade`, `--font-ui`) is replaced by the aliases in §3.2; `--font-ui` is added there as `--font-ui: var(--font-body)`.
4. New components use the `k-` classes directly; existing class names (`pf`, `m2`, `slot`, `qt`, `mt`, `pg-*`, `pi-*`) are kept and gain `k-*` classes **additively** in the DOM when they should inherit kit rules.

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
| L3 | slot **Q** reveals (`YENİ`), toast `Yeni beceri öğrendin: Hücum`; micro button **Yetenek Kitabı** appears | rack (UX-10) |
| L5 | tip **Demirci**; "Ne yapmalıyım?" starts recommending Altın Tarlalar | tips, `recommend()` |
| L8 | micro button **Zindan Bulucu**; tip **Zindan Bulucu**; guide recommends Kemik Mahzeni | finder (UX-40) |
| L10 | tip **Uzmanlık**; after the choice **X** reveals; talent badge pulses | tips, rack |
| L20 / L30 | **V** / **R** (and **T**) reveal; tip **Büyük Yetenek** at first major | rack, tips |

### 4.2 Welcome card (`welcome` panel)

A modal panel (`GamePanel`, id `welcome`, size **640 × auto**, `k-frame`, backdrop dim 55 %, no close button — Enter/Space/Esc = `Başla`), because it needs the cursor (`UI.wantsCursor()` already handles open panels).

```
┌─────────────────────────────────────────────────────────────────┐
│                   ◆──────◆──────◆                               │  ornament (kit .k-sep)
│       KUZGUNKALE'YE HOŞ GELDİN, GÖLGE AVCISI                    │  Cinzel Decorative 32, gold gradient
│   Kadim Mühür çatlıyor. Vadiyi ve zindanları kurtaracak         │  body 17, text-2, centred, max 2 lines
│   kişi sen olabilirsin.                                         │
│ ┌ Hareket ─────────┐ ┌ Savaş ────────────┐ ┌ Etkileşim ───────┐ │  3 .k-card columns, 3 lines each
│ │ [W][A][S][D] yürü│ │ [SolT] saldır     │ │ [F] konuş / al   │ │  key caps are .k-key, text 15
│ │ [Boşluk] zıpla   │ │ [SağT] yetenek    │ │ [I] çanta        │ │  labels from G.input.bindingLabel()
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

Until `mq_01_kuzgunun_cagrisi` leaves the `available` state (flag `onb.metCemal` is written by `welcome.ts` when it sees `G.events 'quest:updated'` for that quest with `state !== 'available'`) or 180 s pass: Muhtar Cemal wears the **main-quest marker** (`.qm--main`, §4.8) and a world label under his name: `▼ Buraya konuş` (Cinzel 14, `--gold-1`, bobbing 4 px, 1.2 s). The label is a normal `addWorldLabel` with class `guide-tag`, `maxDistance 60`. The same highlight is used generically for **any** quest giver the `recommend()` quest points at (so it keeps helping after the tutorial).

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

**Visuals:** a 36 px **diamond medallion** (stone, 2 px ink, gold-2 ring; quest-kind icon inside: `!`/`?` for talk/turn-in, crossed swords for kill, flag for explore, portal for dungeon; colour ring gold = talk/turn-in, blue = kill/explore, violet = dungeon) with the **distance** under it (Cinzel 14; rounded to 1 m below 100 m and to 5 m from 100 m up, e.g. `142 m` → `140 m`) and the target name (13 px, `--text-2`).
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

**Card visuals** (`.k-plate`, `--tip-w`, anchored `.hud-mr`): 4 px gold left stripe, 36 px icon medallion, title (Cinzel 15, `--gold-1`) `İpucu · Kaçış`, body 15 px `--text-1`, key caps row (`.k-key`), a 2 px progress hairline along the bottom (9 s), bottom-right `✓ Anladım` (14 px). Slide in from the right 240 ms, fade out 200 ms, soft `ui_open` at 0.3.

| id | When (precondition) | Title | Text (TR) | Keys | Prio | In combat |
|---|---|---|---|---|---:|:-:|
| `move` | town, 3 s after control starts, no movement input yet | Hareket | Yürümek için W A S D, kamerayı çevirmek için fareyi oynat. Boşluk zıplar. | W A S D | 100 | – |
| `interact` | within 4 m of an NPC/interactable for 1 s | Etkileşim | Konuşmak, eşya almak ve kapıları açmak için F tuşuna bas. | F | 90 | – |
| `attack` | first enemy ≤ 18 m | Saldırı | Sol tık saldırır, sağ tık yeteneğini kullanır. Sol tuşu basılı tutarsan ağır vuruş yaparsın. | SolT SağT | 95 | ✓ |
| `dodge` | first time ≥ 10 % max HP lost to an enemy | Kaçış | Shift ile yuvarlan. Saldırı sana değmeden hemen önce yuvarlanırsan kusursuz kaçış yaparsın. | Shift | 92 | ✓ |
| `loot` | first drop on the ground ≤ 8 m | Ganimet | Yerdeki eşyaları F ile al. Parıltının rengi eşyanın nadirliğini gösterir. | F | 85 | – |
| `bag` | first item enters the bag | Çanta | I ile çantanı aç. Eşyaya sağ tıklayarak kuşanabilirsin. | I | 80 | – |
| `potion` | HP < 40 % first time and a potion is owned | İksir | 4 tuşu can iksiri, 5 tuşu kaynak iksiri içer. | 4 5 | 99 | ✓ |
| `quest` | first quest accepted | Görevler | L ile görev defterini aç. Sağ üstteki takipçi aktif görevini gösterir. | L | 75 | – |
| `map` | first region change, or level 2 | Harita | M ile haritayı aç. Mavi halkalar görev hedeflerini gösterir. | M | 70 | – |
| `waypoint` | first waypoint stone discovered | Işınlayıcı | Keşfettiğin taşlar arasında hızlı yolculuk yapabilirsin. Taşa yaklaşıp F'ye bas. | F | 65 | – |
| `talents` | level ≥ 2 with unspent points | Yetenek Ağacı | N ile yetenek ağacını aç. Harcayabileceğin {n} puanın var. | N | 82 | – |
| `skill_new` | a slot was just revealed | Yeni Yetenek | {key}: {skill}. Yetenekler açıldıkça çubuğa kendiliğinden eklenir. | slot key | 88 | – |
| `smith` | level ≥ 5, in town | Demirci | Demirci'de eşyalarını yükseltebilirsin. Her seviye daha güçlü eşya demek. | – | 60 | – |
| `finder` | level ≥ 8, in town | Zindan Bulucu | `,` ile Zindan Bulucu'yu aç: Kemik Mahzeni artık açık. | , | 78 | – |
| `spec` | level ≥ 10, no spec | Uzmanlık | Uzmanlık seçme zamanı! N tuşuyla uzmanlığını seç. | N | 94 | – |
| `major` | first major slot revealed | Büyük Yetenek | X ve V büyük bekleme süreli yeteneklerdir. Zor savaşlar için sakla. | X V | 86 | – |
| `chat` | another player appears in the scene | Sohbet | Enter ile yaz. Mesajlar karakterin başında balon olarak görünür. | Enter | 55 | – |

Item/skill placeholders (`{n}`, `{key}`, `{skill}`) are filled by the scheduler. Priority only orders simultaneous candidates.

### 4.8 Quest-giver markers (`.qm`, replaces the inline-styled glyph in `NPC.setQuestMark`)

`NPC.setQuestMark(kind)` builds `<div class="qm qm--offer"><i class="qm-glow"></i><b class="qm-glyph">!</b></div>` (class set per kind) inside the existing world label (`className: 'efs-wl-wrap'`, `maxDistance 40`). CSS lives in `styles/world-markers.css` (new, UX-21):

| Kind | Class | Look |
|---|---|---|
| offer | `qm--offer` | 30 px stone diamond (45° rotated square, counter-rotated glyph), 2 px ink + 1 px `--gold-2` line, glyph `!` Cinzel 900 22 px `#ffe14d` |
| turn-in | `qm--turnin` | same, glyph `?` `#f5b82e`, stronger glow + a 4-spark twinkle every 1.6 s |
| locked | `qm--locked` | glyph `!` `#8d939c`, 60 % opacity, no glow |
| repeatable / daily | `qm--daily` | glyph `!` `--info` (blue) |
| main story | `+ qm--main` | 38 px, extra outer ring, tiny crown pip on top; used for the `Kadim Mühür` chain and for the guide highlight |

Common: bob 4 px / 1.2 s (`translateY`, `steps(8)` for the PSX feel), glow pulse 1.6 s, no `text-shadow` fuzz (the diamond itself is the backing). The map/minimap use the matching `map-quest*.svg` icons (§4.5).

### 4.9 Kill-task surfaces ("şu kadar yaratık kes")

The data already exists (`QuestObjective.kind` `kill` / `boss` / `metin` with `count`, `bounty_kill*` templates, Av Defteri). This section is where it becomes **visible**:

| Surface | Behaviour |
|---|---|
| Tracker row | `Orman Kurdu öldür   3 / 8` + 6 px `.k-band` bar (`--info` blue for kill / boss / metin, `--gold-2` for collect); completed row = green ✓, folds away after 6 s |
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
 │ [Genel●][Grup][Fısıltı][Sistem][Savaş]                │  Cinzel 13 caps, chips 22 px, unread dot 6 px gold
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
| Idle look | **no frame**; a horizontal scrim `linear-gradient(90deg, rgba(10,7,5,.55), rgba(10,7,5,0))` behind the log (alpha = `chatOpacity`, default .35 → .55 at the left edge) so text stays readable over the bloomed scene |
| Hover / typing | scrim alpha → .78, 1 px `--gold-5` hairline, tab strip fully opaque, log gets `pointer-events: auto` (wheel scroll, text select) |
| Text | Alegreya Sans 15 px / 20 px, `--sh-text`; `chatFontSize` range **13–17** (GDD_LIFE's 11–16 is raised: no information text below 13 px), default 15 |
| Line | `[HH:MM] ` optional (`chatTimestamps`), sender name in the **class colour** when the sender's class is known (peers: `summary.classId`), else the channel colour; body in `--text-1`; system/loot/boss lines in their channel colour |
| Channel colours | say `#f1e6cf` · yell `#ff6a52` · party `#6fb1ff` · whisper `#ff7fe6` · global `#ffd36a` · trade `#c8a070` · system `#ffe27a` · loot `#8ae08a` · emote `#ffb0ff` italic · boss `#ff6a52` bold (GDD_LIFE §3.1; one `--ch-*` var per channel in `hud-chat.css`) |
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
              │ Ahmet                          │  ← name line: Cinzel 13, channel colour (newest bubble of a stack only)
              │ Selam! Zindana giren var mı?   │  ← text: Alegreya Sans 700 15/20, --text-1, max 3 lines
              └──────────────▼─────────────────┘  ← tail: 8 px triangle, border colour
                      (nameplate / head)
```

| Kind | Source | Look | Notes |
|---|---|---|---|
| `say` | `chat:line` channel `say`, solo `party`/default | stone `#181009` at 92 %, 2 px `--ink`, inner 1 px `--gold-4`, text `--text-1` | default for the local player when playing alone |
| `party` | channel `party` | same, inner line `--info` | |
| `yell` | channel `yell` | background `#2a0f0c`, inner line `#ff6a52`, text +2 px (17), name caps | 1 per 5 s per sender (GDD_LIFE) |
| `npc` | `NPC.say()` barks and greetings | **parchment**: `#f2e4bd`, border `#5a4020`, text `#2a1c0e` (the existing look, kept so NPC speech reads as "from the world") | max 120 chars, same stacking/animation as player bubbles |
| `typing` | local chat input focused with ≥ 1 character | 3 dots `…` bubble, dots advance with `steps(3)` every 0.35 s | local only (remote typing indicators need a net message — out of scope) |
| emote / whisper | – | **no bubble** (emote shows only as a coloured chat line; whisper never leaves the window) | |

**Numbers**

| Parameter | Value |
|---|---|
| Width | content width, **max 260 css px**, padding 6 × 10, radius `--r-2` |
| Characters | player text truncated to **80** (…), NPC to **120**; wrapped at 260 px, **max 3 lines** (CSS line-clamp), HTML always escaped (`esc()`), item links rendered as `[Eşya Adı]` plain |
| Lifetime | `seconds = clamp(2.2 + 0.05 × chars, 3.5, 8)` (20 chars → 3.5 s, 80 chars → 6.2 s); NPC barks use the `seconds` argument they already pass (4.5 s default) |
| Animation | pop-in 120 ms (`scale .9 → 1`, `translateY 6px → 0`), fade-out 400 ms |
| Stacking | per speaker **max 2 visible**; a new bubble goes at the bottom (nearest the head), the older one is pushed up by `newHeight + 4 px`, drops to 75 % opacity and scale .96; a third is removed with a 150 ms fade. The name line is shown on the newest bubble only |
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

CSS (`styles/hud-bubbles.css`, new): `.wl.wl-bare { background: none; border: 0; padding: 0; border-radius: 0; font: inherit; }` and `.wl.efs-wl-wrap { … same … }` (that class is used by every NPC / portal / marker label but **has no CSS today**, so those labels currently sit inside the generic `.wl` dark box — see D13); `.bb` base (`position: relative; max-width: 260px; padding: 6px 10px; border: 2px solid var(--ink); border-radius: var(--r-2); animation: bb-in 120ms var(--ease-pop) both; box-shadow: inset 0 0 0 1px var(--bb-line), 0 3px 8px rgba(0,0,0,.6);`) with `.bb--say/--party/--yell/--npc/--typing` setting `--bb-bg`, `--bb-line`, `--bb-fg`; `.bb::after` is the 8 px tail; `.bb-name` and `.bb-text` (`display: -webkit-box; -webkit-line-clamp: 3; overflow: hidden`). The existing `.efs-bark` rules in `menu.css` are removed by UX-30 once `NPC.say` is migrated.

---

## 6. Zindan Bulucu / Raid Bulucu

A WoW "Group Finder" for a serverless P2P game. It is the **front door** to every instance: it answers *what can I run now, on which difficulty, with whom* in one window, and replaces the four-portal / three-tab / party-panel scatter (D16). The **Kehanet Taşı** panel (`keystone`) keeps what is truly keystone business (insert the key, Anahtar Ustası services); the finder reuses its rules (`ladder.ts`) and its start logic.

### 6.1 Identity, key, entry points

- Panel id **`finder`** (`GamePanel`, size **L = 1180 × 720**), title `Zindan Bulucu`, icon `ui-dungeon.svg`.
- New Input action **`finder`**, default **`Comma` (`,`)**, label `Zindan Bulucu`. All 26 letter keys are already bound, so a punctuation key is used (add `Comma: ','` and `Period: '.'` to `codeLabel`; the dev HUD page's own `,` `.` test hotkeys move to Numpad7/8 in UX-00). `guide` (§4.6) takes `Period`.
- **Entry points:** micro-menu button (level ≥ 8), the hotkey, `Zindan Bulucu` buttons in the `party` panel and the `guide` panel, the tracker `hint` card, the four dungeon portals in the Kadim Kapılar Salonu (`DungeonPortal.interact()` in `entities/interactables/Portal.ts` and `panelForNpc()` case `'portal'` in `entities/NPC.ts` switch from `keystone` to `finder` with `data: { dungeonId }`; the prompt text becomes `{name}: Zindan Bulucu`), and chat `/zindan`. Open-world dungeon entrances keep opening the keystone pick tab (they carry `returnTo`) in v1.
- The finder may be opened anywhere except inside a dungeon run (then it shows the state `Zindandasın` and the leave button).

### 6.2 Layout — tab "Zindan"

Header: `.k-tabs` `Zindan · Raid · Gruplar (n)`. Body = two columns (list 380, detail 752, gap 16) over a footer strip.

```
┌ ZİNDAN BULUCU ───────────────────────────────────────────────────────────────────────────────────── [,] ✕ ┐
│ [ Zindan ]  [ Raid ]  [ Gruplar 3 ]                                                                       │
├──────────────────────────────┬────────────────────────────────────────────────────────────────────────────┤
│ Sv. 12 · EŞ 14 · Hasarcı     │ ┌ banner 752 × 180 (art) ────────────────────────────────────────────────┐ │
│ ┌ ★ ÖNERİLEN ──────────────┐ │ │ [ art ]   KEMİK MAHZENİ                                                │ │
│ │[art]Kemik Mahzeni    8–18│ │ │ Sv. 8–18 · 3 boss · 13 dk · Düşman Gücü 250                            │ │
│ │     ◆N ◇K ◇M ◇M+  EŞ 6   │ │ └────────────────────────────────────────────────────────────────────────┘ │
│ ├──────────────────────────┤ │ Kuzgunkale'nin altında, unutulmuş kralların kemikleri yatar… (lore)        │
│ │[art]Kızıl Dökümhane 18–28│ │ ZORLUK                                                                     │
│ │     ◇N ◇K ◇M ◇M+ EŞ 16 # │ │ ┌ Normal ──────┐┌ Kahramanlık ─────┐┌ Mitik 0 ───────┐┌ Mitik+ +7 ─────┐   │
│ ├──────────────────────────┤ │ │Düşman Sv. 12 ││Düşman Sv. 50–60  ││Düşman Sv. 60   ││Anahtar yok     │   │
│ │[art]Buzul Tahtı     30–40│ │ │Açık          ││# Sv. 50 gerekli  ││# Sv. 60 gerekli││# Anahtar yok   │   │
│ │     ◇N ◇K ◇M ◇M+ EŞ 28 # │ │ └──────────────┘└──────────────────┘└────────────────┘└────────────────┘   │
│ ├──────────────────────────┤ │ Önerilen eşya seviyesi 6 · Sen: 14  (kırmızı: düşükse)                     │
│ │[art]Gölge Tapınağı  42–52│ │ BOSSLAR  [Bekçi Kaldur] [Ölüçağıran Morkan] [Kemik Lordu Azrakel]          │
│ │     ◇N ◇K ◇M ◇M+ EŞ 40 # │ │ EKLENTİLER (Mitik+)  [Tahkimli] [Kin Dolu]                                 │
│ └──────────────────────────┘ │ ÖDÜL  Normal: eşya + deneyim · Mitik 0: ilk Mitik+ anahtarı                │
├──────────────────────────────┴────────────────────────────────────────────────────────────────────────────┤
│ Rol  [T Tank] [Ş Şifacı] [H Hasarcı]       Mod  (•) Tek Başına  ( ) Grubumla  ( ) Grup Ara                │
│ [ben T H][ ? ][ ? ][ ? ][ ? ]      Durum: Hazır                  [ ZİNDANA GİR ] [Kapat]                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Dungeon list** (`.k-scroll`, cards 380 × 88): `★ ÖNERİLEN` pinned first (= `recommend().dungeon`), then `dungeonList()` order (level 8 → 52). Card: 88 px square **art** (the dungeon's `loadingImage` cropped, else `icon` on a rune-circle background; art tinted by `theme.fogColor`), name (Cinzel 17), `Sv. 8–18 · EŞ 6 · 13 dk` (14 px; EŞ = `recommendedIlvl(def, 'normal')`, time = `timerSec`, 780 s for Kemik Mahzeni), and a row of four 14 px **difficulty diamonds** `N K M M+`: lit gold = open, gold with ✓ = cleared, grey with lock = locked, absent = not applicable. Locked cards (`#` and hollow ◇ pips in the diagram; the mock shows a level-12 character with example data) are dimmed 55 % with a lock icon and the reason line (`Gereken seviye: 18`). Selected card: gold frame + glow. Keyboard: ↑/↓ select, ←/→ difficulty, Enter = primary button.

**Detail pane**
- **Banner** (752 × 180): art, dungeon name (Cinzel Decorative 32, gold gradient), stats row with icons `ui-timer` (süre), `ui-enemy-forces` (Düşman Gücü), `ui-boss` (boss sayısı).
- **Lore:** `def.lore`, 2 lines, `--text-2`.
- **Difficulty selector:** four buttons 176 × 72 (`.k-btn`-family, selected = gold frame):

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
- **Ödül:** one static line per difficulty taken from the existing keystone card copy (`Kahramanlık: daha çok şampiyon sürüsü, set eşyaları` etc.), plus best Mitik 0 time (`bestM0Sec`).

**Footer**
- **Role checkboxes** (3 toggle chips with a check mark and role icons `T` blue shield / `Ş` green cross / `H` red sword, colours `--role-*`): default = role of the active spec (`getSpec(save.spec)?.role`, `dps` below level 10); a class may select only roles one of its specs can fill (`SPECS` filtered by `classId`); multiple allowed (LFG matches the best fit). Roles are advertised to the lobby (§6.5) and drawn in the party strip.
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
 ├ .k-head        height 44; flex; gap 10; padding 0 12px 0 16px; leather bar: linear-gradient(180deg, #5a3f25, #3a2616 55%, #2a1a0f);
 │                border-bottom 2px ink; inset 0 -1px gold-3 35 %; draggable (non-modal windows)
 │  ├ .k-head-ico   24 px glyph, gold gradient + drop-shadow
 │  ├ .k-title      Cinzel 20 uppercase, letter-spacing .12em, gold gradient text (gold-1 → gold-3), 2 px ink shadow, `toLocaleUpperCase('tr-TR')`
 │  ├ .k-title-key  `.k-key--dim` chip with the panel hotkey, e.g. [N]  (omitted when the panel has none)
 │  ├ (spacer)
 │  └ .k-x          28 × 28 close; stone-4 gradient + 1 px gold-4; hover: red gradient (#8a2a20 → #4a1510) + white ✕; Esc closes the top window
 ├ .k-tabs        optional, 36 px (`.k-tab`, §3.5); badge dot for news
 ├ .k-body.k-scroll   padding 16; flex 1; sections use .k-card / .k-well / .k-sep
 └ .k-foot        min-height 40; border-top 2px ink; padding 6 16;  left: .k-hints (13 px, key caps)   right: buttons (.k-btn)
```

| Size class | Width × height (css px, before zoom) | Typical panels |
|---|---|---|
| **S** | 480 × auto (max 620) | inventory, stash, vendor, guide (560), trainer, dialog, game menu (360) |
| **M** | 780 × 600 | character, skills, blacksmith, quest log, settings, bounty, run summary, credits, waypoints, keystone (900) |
| **L** | 1180 × 720 | talents (N), map (M), finder (`,`), party (O), M+ info (J) |

All windows clamp to the viewport (`max-width: calc(100% / var(--pg-zoom) − 24px)` as `pg-win` does now). **XL is gone** (talents 1560 × 940 → L).

**Backdrop:** only **modal** windows (welcome, confirm, death card, game menu) get the dim radial backdrop; every other window leaves the world visible and takes clicks through `.ui-capture`. This stops the 55–82 % black wash that hides the open world while a panel is open (D14).

**Docks and dragging:** `dock: 'left' | 'right' | 'center'` decides the default position (`left: 24`, `right: 24`, centred; top 56). Defaults: inventory → right, character → left, trade windows (vendor / stash / blacksmith) → left with the bag docked right (the existing `openCompanionBag` behaviour), everything L → center, quest log → left, skills → center. A window opening on an occupied dock cascades 28 px (existing clash logic). Non-modal windows drag by `.k-head`; the position is saved per id as **fractions of the viewport** in `localStorage['efsun.win.v1.<id>']` (px values of `pi.pos.<id>` are ignored — resolution-safe). Dragging divides pointer deltas by the CSS `zoom`. Click brings a window to the front (existing). 

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
| Çanta (`inventory`) | I / B | S 480 · right | as today | `Sağ Tık: kuşan · Ctrl+Tık: kilitle · Shift+Sağ Tık: sat` (the `context()` strings that exist) | rarity frames from `.k-slot[data-rarity]`; bag-fullness chip in the header (`23 / 48`); empty state |
| Karakter (`character`) | C | M · left | as today | – | stat sections (Nitelikler / Saldırı / Savunma / Fayda) as `.k-card` with `.k-sep`; font ≥ 13 |
| Yetenek Kitabı (`skills`) | K | M · center | Beceriler · Uzmanlık | `Sürükle: beceriyi yuvaya bırak` | §7.4 grouping |
| Yetenekler (`talents`) | N | **L** 1180 × 720 · center | 3 (existing) | `1 2 3 sekme · [ ] uzmanlık · / ara · Enter uygula · Ctrl+Z geri al` (GDD_TALENTS §5.8) | only shell + size; canvases refit |
| Görev Defteri (`questlog`) | L | M 780 × 600 · left | Aktif · Alınabilir · Tamamlanan | `Takip et: takipçi ve ok bu göreve bakar` | kill rows with bars + `Haritada göster`, empty states, region groups kept |
| Harita (`map`) | M | **L** · center | – (legend filters) | `Sürükle: haritayı kaydır` | giver pins in town, recommended-region outline, zone-progress card (§4.5) |
| Grup (`party`) | O | **L** 1180 × 720 · center | – | – | `Zindan Bulucu` button; empty-state copy (§7.5) |
| Kehanet Taşı (`keystone`) | – | M 900 × 600 · center | Anahtar · Zindan Seç · Usta | – | `Zindan Seç` tab keeps working for world entrances and shows a `Zindan Bulucu'yu kullan` banner; start logic via `runStart.ts` |
| **Zindan Bulucu** (`finder`) | `,` | **L** · center | Zindan · Raid · Gruplar | `↑↓ zindan · ←→ zorluk · Enter başla` | §6 |
| **Ne Yapmalıyım?** (`guide`) | `.` | S 560 · center | – | – | §4.6 |
| **Hoş Geldin** (`welcome`) | – | modal 640 | – | `Enter: başla` | §4.2 |
| Ayarlar (`settings`) | Esc → Ayarlar | M · center | existing Grafik · Ses · Kontroller · Oyun + one new tab **Arayüz** | – | new **Arayüz** tab: UI size slider (0.7–1.5), `Yoğunluk: Orta` read-out, `Yardım ipuçları`, `Görev oku`, `Hasar ölçer: Otomatik / Hep / Hiç`, `Çubuk 2`, `Çubuk 3`, HUD stili (Metin2 / Küre), buttons `Arayüzü Düzenle` and `İpuçlarını Sıfırla` |
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

Layout (M 780 × 560): a **bar editor** strip on top, learned skills below, locked ones collapsed.

```
┌ YETENEK KİTABI ───────────────────────────────────────────── [K] ✕ ┐
│ [ Beceriler ] [ Uzmanlık ]                              [ara…]     │
│ ÇUBUK  [SolT][SağT][Q][E][1][2][3][R] │ [X][V][T]                  │  drop targets; locked slots appear as grey "Sv.N" chips here only
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

`emptyState()` = 64 px dim icon, title (Cinzel 17), one sentence (15 px, `--text-2`), optional primary button. Copy table (Turkish):

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

## 8. IMPLEMENTATION PLAN

Small Haiku packages, **waves of ≤ 3, file-disjoint inside a wave**, each ending with `npx tsc --noEmit` = 0 errors in its files. After every wave a Haiku QA agent runs Appendix C and scores the UI rubric (ROADMAP #6, #11). Order: **CSS tokens / kit → HUD skeleton → HUD widgets → onboarding → chat bubbles → finder → panel pass.** "Contracts first" is the repo's own pattern: Wave 0 creates every shared file edit and compile-only stub so later waves never touch the same file.

### 8.1 Wave schedule

| Wave | Packages (parallel) | What the player gets after the wave |
|---|---|---|
| **W0** foundations | **UX-00** tokens + kit + contracts · **UX-01** HUD skeleton · **UX-02** panel skeleton | nothing visible (palette aliases only); every later wave is conflict-free |
| **W1** HUD core | **UX-10** bottom board · **UX-11** frames · **UX-12** right column | the new action board with progressive reveal, bar-less player chip, one context tracker, quest feed |
| **W2** corner + onboarding | **UX-13** corner / banners / edit mode · **UX-20** objective arrow + tips · **UX-21** welcome + guide + markers | micro menu, loot, banners; welcome card, arrow, tips, "Ne yapmalıyım?", quest markers |
| **W3** chat + net | **UX-30** speech bubbles · **UX-31** chat window · **UX-41** LFG net contract | bubbles above heads, tabbed chat |
| **W4** finder + shells | **UX-40** Zindan/Raid Bulucu · **UX-50** `pg` shell · **UX-51** `pi` shell | the finder; every window in one style |
| **W5** content pass | **UX-52a** game panels · **UX-52b** item panels · **UX-60** cleanup + docs | panel sizes, hints, empty states, skill book grouping, dead CSS gone |

Backlog (not scheduled): **UX-41b** auto-matching queue tickets (§6.5 v2).

### 8.2 Packages

Conventions: **Own** = files the package may edit; **New** = files it creates; everything else is read-only. Every package may also add its own dev buttons as `src/dev/hud-ext/<package>.ts` (loaded by the glob added in UX-00). "Done when" is checked by the author with the named dev page and by the wave QA.

#### UX-00 — Tokens, kit and contracts · owner: hud (+ one-line core appends) · W0 · depends: –
- **New:** `src/ui/styles/tokens.css`, `src/ui/styles/kit.css`, `src/ui/kit/chrome.ts`, `src/ui/kit/controls.ts`, `src/ui/kit/index.ts`.
- **Own:** `src/ui/UI.ts`, `src/core/Input.ts`, `src/core/Settings.ts`, `src/core/events.ts`, `src/dev/hud.ts`.
- **Do:**
  1. `tokens.css` = §3.2 verbatim.
  2. `kit.css` = §3.3 frames, §3.4 type classes, §3.5 buttons / tabs / chips / badges / key caps / scroll / sep, §3.6 `.k-slot*` + `.k-ico-16…48`, §3.7 `.k-band` / `.k-gauge`, §7.1 shell (`.k-win .k-head .k-head-ico .k-title .k-title-key .k-x .k-body .k-foot .k-hints .k-win--S/M/L .k-win--modal`, `@keyframes k-win-in`), `.k-empty`. Add rules only; edit no existing selector.
  3. `kit/*.ts` = §7.2 (DOM only; `keyAction` hotkey label read through `G.input?.bindingLabel` inside try/catch).
  4. `UI.ts`: import `./styles/tokens.css` and `./styles/kit.css` **first**; `HOTKEYS` gains `finder → 'finder'` and `guide → 'guide'` (extend the action union type).
  5. `Input.ts`: actions `finder` (`['Comma']`) and `guide` (`['Period']`); Turkish names `Zindan Bulucu`, `Ne Yapmalıyım?`; `codeLabel` entries `Comma: ','`, `Period: '.'` (append-only, no existing binding changes).
  6. `Settings.ts` (append-only): `showTips: true`, `questArrow: true`, `meterVisibility: 'auto'`; `chatFontSize` default 15 and every reader clamps to 13–17.
  7. `events.ts` (append-only): `'chat:line'`, `'finder:queue'`, `'quest:pinned'` (Appendix A).
  8. `dev/hud.ts`: move the dev hotkeys `,` and `.` to `Numpad7` / `Numpad8` and fix the header comment; add `import.meta.glob('./hud-ext/*.ts', { eager: true })` and call each module's optional `install(h, dev)` after `window.dev` exists (later packages add their dev buttons in their own `hud-ext/*.ts` files).
- **Done when:** tsc 0; game + `dev/hud.html` boot; `getComputedStyle(document.documentElement).getPropertyValue('--gold-2').trim() === '#e8c46a'`; legacy tokens still resolve; no layout change.

#### UX-01 — HUD skeleton · owner: hud · W0 · depends: –
- **New:** `styles/hud-bottom.css`, `hud-frames.css`, `hud-right.css`, `hud-chat.css`, `hud-corner.css`; compile-only stubs `hud/Tracker.ts` (`ContextTracker`), `hud/ObjectiveArrow.ts`, `hud/TipCards.ts`, `hud/QuestFeed.ts`, `hud/FlaskRow.ts`.
- **Own:** `styles/hud.css`, `hud/index.ts`, `hud/layoutStore.ts`, `hud/types.ts`, `hud/Metin2Bar.ts` (**only** a new `readonly flaskHost = div('m2-flasks', this.el)`).
- **Do:**
  1. Split `hud.css` along its banner comments: *Bottom cluster … player cast bar* → `hud-bottom.css`; *Generic bars* + *Left column* + *Top centre* → `hud-frames.css`; *Right column* → `hud-right.css`; *Bottom-left chat* → `hud-chat.css`; *Bottom-right* → `hud-corner.css`. `hud.css` keeps the header, layers, `.panel-host`, `.ico`, `.hud` root. **Pure move, no value changes.** Import the five files in `hud/index.ts` after `hud-edit.css`.
  2. `hud.css :root`: delete `--hud-gold*`, `--metal-*`, `--shade` (aliased in `tokens.css`), keep `--font-ui: var(--font-body)`; add the three `.hud[data-density]` variable blocks from §2.2.
  3. `computeScale()` per §2.2 (min 0.8, `data-density`, `--hud-w`); `HudApi.density`.
  4. Zones: add `.hud-ml` (combo + route banner moved in) and `.hud-mr` (tip card slot); replace hard-coded 16 px anchors with `var(--gut)`.
  5. Stubs (constructor signatures are **final**, so `hud/index.ts` is not edited again for them except by UX-13): `new ContextTracker(ui, mythic, quests)` temporarily re-parents `mythic.el` + `quests.el` into one `.trk`; the others are hidden placeholders mounted at their final parents (`ObjectiveArrow` and `QuestFeed` on the root, `TipCards` in `.hud-mr`, `FlaskRow` in `m2.flaskHost`). `HudApi` gains `zones`, `tracker`, `tips`, `guideTarget` + `setGuideTarget(npcId | null)` and an optional `adviceLine?: () => string` slot (assigned later by the guide module; the tracker `hint` pane calls it).
  6. `layoutStore.ts` v2 + one-time v1 migration, frame id `tracker` (§2.13); register it in `index.ts`.
- **Done when:** tsc 0; HUD identical at 1920×1080 (differences only from the 0.8 clamp on small windows and the combo counter's new anchor, 48 px / 40 %); edit mode opens/saves; a stored `efsun.uiLayout.v1` is migrated; resizing flips `data-density`; `dev/hud.html` hotkeys unchanged.

#### UX-02 — Panel skeleton · owner: panels-game (+ panels-items CSS split) · W0 · depends: –
- **New:** `styles/panels-shell-pg.css`, `styles/panels-shell-pi.css`; stub panels `panels/game/finder.ts` (`FinderPanel`, id `finder`), `guide.ts` (`GuidePanel`, id `guide`), `welcome.ts` (`WelcomePanel`, id `welcome`).
- **Own:** `styles/panels-game.css`, `styles/panels-items.css`, `panels/index.ts`, `panels/game/index.ts`.
- **Do:**
  1. Split `panels-game.css`: lines 1–340 (header comment through the `/* misc */` block: root, window, typography, buttons, tabs, toggle/slider/rows, cards/bars, item tile, tooltip, confirm, misc) → `panels-shell-pg.css`; the per-panel sections (from line 341) stay. Split `panels-items.css`: the `window` and `tabs` sections (lines 1–188) → `panels-shell-pi.css`; the rest stays. **Pure move.**
  2. `panels/index.ts`: import the two shell files **first** (before `./items` and `./game`, so they precede the per-panel CSS in the cascade).
  3. The three stub panels: `GamePanel` subclass + `windowFrame({ title, icon })` + a `pg-empty` body `Yakında` (finder, guide) / a `Başla` button that closes (welcome); register them in `registerGamePanels`.
- **Done when:** tsc 0; every existing panel is pixel-identical (`dev/panels-game.html`, `dev/panels-items.html`); `,` and `.` open the stub panels; Esc closes them.

#### UX-10 — Bottom board · owner: hud · W1 · depends: UX-00, UX-01
- **Own:** `hud/ActionBar.ts`, `hud/Metin2Bar.ts`, `hud/FlaskRow.ts`, `styles/hud-bottom.css`, `styles/hud-metin2.css`, `styles/hud-extras.css`.
- **Do (§2.6):**
  1. `Metin2Bar`: rebuild the DOM as `.m2` → `.m2-beads`(+`.m2-cradle`) / `.m2-top` (`.m2-lvl`, `.m2-hp`, `.m2-sp`) / `.m2-rack` host / `.m2-extras` / `.m2-flasks`; delete the stat well, bead well, `.m2-slotswrap`, `M2_WIDTH` and the `fit()` transform (density replaces it); keep `M2Gauge`, `Bead`, XP logic, floaters; gauge label `cur / max` + icon; `setKind` for all six kinds; **keep the public fields `slotsHost` (now the rack host), `extrasHost`, `flaskHost` and `reset()`** so `hud/index.ts` needs no change.
  2. `hud-metin2.css`: new sizes from §2.6.1 (`min-width: var(--bd-min); max-width: var(--bd-max)`, `transition: width 300ms`), beads on the rim, gauges with `.k-band` colours for **hp, mana, rage, energy, focus, faith, essence** + neutral fallback; remove the three-well rules; tokens instead of literals.
  3. `ActionBar`: three groups (`major`, `skills`, `potions`), `SPECS` gains `m45` / `m90` / `m180` (round), `reveal()` + `slotUnlockLevel()` + `learned()` per §2.6.4, `.is-new` grow-in + `YENİ` tag, `.is-socket` dashed "+" (click → `G.ui.openPanel('skills')`), separators shown only between visible groups, tone by skill tags, hero slot `Yorgun m:ss` from the `sated` status, major tooltip line, key caps via `G.input.bindingLabel`. Keep `TalentBadge` as a child; `hud-extras.css` re-anchors `.tb-badge` to the board's top-left rim (`.m2 > .tb-badge` / `.actionbar > .tb-badge` for the orbs style).
  4. `FlaskRow` per §2.6.5 (absent when no flask is equipped); extras ribbon visibility rule §2.6.6 (`DodgeCharges` / `ComboPoints` containers shown only when relevant — logic in the existing widgets is untouched, visibility is a CSS class set by `ActionBar.update`).
  5. Orbs style (`hudStyle: 'orbs'`) keeps working: the rack element still mounts in `hb-mid`; give it only the token re-skin.
  6. Dev hook `src/dev/hud-ext/board.ts`: buttons `Seviye ±1`, `Büyük yetenek aç`, `Şişe ekle/çıkar`, `Kaynak türü` (cycles all six).
- **Done when:** tsc 0; at level 1 the rack shows exactly LMB, RMB, 4, 5; raising the level in `dev/hud.html` reveals Q/E/1/2/3/R with the grow-in; spec + level reveals X/V/T; all six resource kinds show a coloured SP gauge; board width 540 at L1 and ≤ 740 at L60 (`lg`), ≤ 668 (`md`); at 1280×720 the board and chat do not overlap; no information text < 13 px in the files touched.

#### UX-11 — Frames · owner: hud · W1 · depends: UX-00, UX-01
- **New:** `ui/widgets/levelColor.ts` (`levelColor(playerLevel, targetLevel): string` per §2.8).
- **Own:** `hud/PlayerFrame.ts`, `hud/PartyFrames.ts`, `hud/TargetFrame.ts`, `hud/BossFrame.ts`, `hud/ComboCounter.ts`, `widgets/StatusRow.ts`, `styles/hud-frames.css`, `styles/overlays.css` (combo part only), `styles/widgets.css` (status icons `.st-*` only).
- **Do (§2.7, §2.8, §2.11):** `PlayerFrame` becomes the bar-less chip (keep the exported `Bar`, `XpBar`, `PlayerCastBar`, `classColor`, `classNameTr`, `CLASS_META` — other files import them); click opens `character`; spec chip text 13 px; `StatusRow` sweep + 28 px icons + `+N` overflow chip; `PartyFrames` sizes/role icons/leader crown/ring; `TargetFrame` with `levelColor`, threat strip slot, `.k-plate` trim instead of capsule radii; `BossFrame` width `--boss-w`; `ComboCounter` anchor `.hud-ml`, appears from 3 hits, tier-gated lines; all colours/sizes via tokens, min 13 px; `.bar.res[data-kind]` gets the seven resource kinds + fallback.
- **Done when:** tsc 0; `dev/hud.html` (hurt/heal/party/boss/combo hotkeys) shows chip, 3 party rows, target + boss stacking; the top-left shows **no** HP/SP bars; buff overflow chip works with > 10 statuses.

#### UX-12 — Right column · owner: hud · W1 · depends: UX-00, UX-01
- **Own:** `hud/Minimap.ts`, `hud/Tracker.ts`, `hud/QuestTracker.ts`, `hud/MythicTracker.ts`, `hud/QuestFeed.ts`, `hud/DamageMeter.ts`, `styles/hud-right.css`, `styles/hud-quests.css`, `styles/hud-meter.css`.
- **Do (§2.9, §2.10 meter, §4.9):**
  1. `ContextTracker`: header (title, mode tabs `[G][K][B]`, `?`, `▾`), four panes (`boss`, `run`, `quest`, `hint`), auto mode priority boss > run > quest > hint, 60 s manual pin, collapse persistence `efsun.tracker.v1`, `sm` starts collapsed, click-through targets (`questlog`, `mplusInfo`, `guide`). `QuestTracker` / `MythicTracker` keep their data logic but render into the panes (compact: affixes 24 px, thresholds row, forces bar 12 px). The `hint` pane shows `G.ui.hud.adviceLine?.()` (the slot UX-01 added; UX-21's guide module assigns it from `recommend()`), falling back to the static text `Ne yapmalıyım? [.]` — so the file compiles and works before UX-21. Boss mode = `G.ui.hud.bossEntityId !== null`; run mode = `G.mplus?.state` active.
  2. `QuestFeed`: diff `progressRows()` per frame (≤ 4 Hz), centre lines at 36 %, max 3, 2.2 s; completion line green + `ui_confirm` 0.4; `quest:updated` `ready` one-shot line; tracker row flash + 200 ms `steps(6)` bar fill.
  3. `Minimap`: zoom buttons on hover only; level-band line with relative colour; objective/quest rings keep working; subscribe to `finder:queue` and draw the LFG eye (click → open `finder`; guarded if the panel is still a stub).
  4. `DamageMeter`: honour `Settings.meterVisibility` (`auto` = pill only when party ≥ 2 and scene is a dungeon, `always`, `never`); Shift+D still toggles the window.
  5. Dev hook `hud-ext/tracker.ts`: buttons to force each mode and to advance a kill objective (reuses `Numpad4`).
- **Done when:** tsc 0; in `dev/hud.html` the column shows minimap + **one** pane; `P` (boss) switches to the boss pane, run countdown (`V`) to the run pane, quest hotkeys (Numpad3/4) to the quest pane with the bar and feed lines; with nothing active the `hint` pane shows; meter pill absent when solo.

#### UX-13 — Corner, banners, edit mode · owner: hud · W2 · depends: UX-01
- **Own:** `hud/Corner.ts`, `hud/EditMode.ts`, `hud/Banners.ts`, `hud/Overlays.ts`, `hud/Extras.ts` (only a new exported `unspentTalentPoints()` helper), `widgets/Toasts.ts`, `hud/index.ts`, `styles/hud-corner.css`, `styles/hud-edit.css`, `styles/overlays.css` (banner/zone/prompt parts), `styles/widgets.css` (toast part only).
- **Do (§2.10, §2.11, §2.13):** `LootFeed` (5 lines, 4 s / 7 s, merge, `▲` upgrade arrow via `describeItem` / `itemLevel` compare), gold chip, `MicroMenu` single row with the reveal table and badges (reuse `TalentBadge`'s unspent count through a small exported helper; `K` badge when a learned skill is off the bar; `L` badge when a quest is `ready`), 70 % idle opacity; remove `editBtn` and `FpsCounter` mounting from `hud/index.ts` (`HudApi.startEdit()` stays); `EditMode`: per-frame `Varsayılana Dön`, density read-out; `BannerQueue` (ranks 2–5, max 3 queued) and `QuestBanner` (`quest:updated` `active` → `Görev Alındı: …`, `done` → `Görev Tamamlandı: …`); `Toasts`: max 2 visible, 2.4 s, de-duplicate identical text within 1.5 s (existing `count` bump).
- **Done when:** tsc 0; level-1 character shows 5 micro buttons; raising the level adds N (L2), K (L3), finder (L8); no "Arayüzü Düzenle" button on screen; accepting a quest in `dev/hud.html` (Numpad3) shows the banner once; edit mode still reachable via `window.dev` / `G.ui.hud.startEdit()`.

#### UX-20 — Objective arrow + tips · owner: hud · W2 · depends: UX-01, UX-12
- **New:** `data/tips.ts`, `styles/hud-onboard.css`.
- **Own:** `hud/ObjectiveArrow.ts`, `hud/TipCards.ts`, `hud/questMarks.ts`.
- **Do (§4.4, §4.7):** `questMarks.ts`: `guideTargetPos(obj)` (scene-aware table in §4.4), `guideTarget()` (priority list incl. `HudApi.guideTarget`), `setPinnedQuest` additionally emits `quest:pinned`; `ObjectiveArrow` (projection, clamp-to-ellipse, arrival, `questArrow` setting, hides under panels / edit mode); `data/tips.ts` = the table of §4.7 as `TipDef[]`; `TipCards` scheduler + card (flags `tip.<id>`, `Settings.showTips`, hover pause, `Bir daha gösterme`); `hud-onboard.css`.
- **Done when:** tsc 0; in `dev/hud.html` with a mock quest the diamond follows the target on screen and clamps to the edge off screen; tips fire once each (check `character.save.flags`), never during a panel, ≥ 25 s apart.

#### UX-21 — Welcome, guide, quest markers · owner: panels-game (+ scenes: `NPC.ts` one method) · W2 · depends: UX-02, UX-12, UX-20
- **New:** `panels/game/guideEngine.ts`, `styles/panels-guide.css`, `styles/world-markers.css`.
- **Own:** `panels/game/welcome.ts`, `panels/game/guide.ts`, `entities/NPC.ts` (`setQuestMark` only), `hud/Minimap.ts` (giver icons only).
- **Do (§4.2, §4.3, §4.6, §4.8):** `recommend()` exactly as §4.6; `GuidePanel` UI + buttons (`Takip Et` → `setPinnedQuest` + arrow, `Haritada Göster` → `openPanel('map', { focus })`, `Işınlan` → `openPanel('waypoints')` when `waypointKnown`, `Zindan Bulucu`); `WelcomePanel` (first-login condition, `Başla`, flags, `HudApi.setGuideTarget('npc_muhtar')`); `NPC.setQuestMark` builds `.qm` markup (kinds offer / turnin / locked / daily / main); `world-markers.css`: `.qm*` styles **and** the missing `.wl.efs-wl-wrap` / `.wl.wl-bare` reset (background none, border 0, padding 0) so NPC labels, portal names and markers stop sitting in the generic `.wl` box; guide-tag label for the highlighted giver; minimap giver `!` / `?` icons in town (`TOWN.npcs` with `quests`).
- **Done when:** tsc 0; a fresh level-1 character in town gets the welcome card once; after `Başla` the arrow points to Muhtar Cemal and he wears the large marker; `.` opens the guide with a quest, a zone (`Sisli Koru` at level 1–4, `Altın Tarlalar` at 5), a dungeon line (`Seviye 8'de açılır` below 6); `recommend()` checked for levels 1, 5, 8, 20, 30, 50, 60 from the console.

#### UX-30 — Speech bubbles · owner: hud (+ scenes: `NPC.say`) · W3 · depends: UX-00, UX-21
- **New:** `widgets/Bubbles.ts`, `hud/ChatBubbles.ts`, `styles/hud-bubbles.css`.
- **Own:** `ui/UI.ts` (bubble layer + `say()`), `entities/NPC.ts` (`say()` only), `ui/menu/menu.css` (delete `.efs-bark` rules after migration).
- **Do (§5.2):** `BubbleLayer`, `UI.say`, `ChatBubbles` (`chat:line` → sender object → `G.ui.say`), typing indicator from `Chat.isFocused` + input length (read via `G.ui.hud.chat`), NPC barks migrated, parchment style kept for `npc`.
- **Done when:** tsc 0; `0` hotkey in `dev/hud.html` (chat line) and a typed message show a bubble over the player; two quick messages stack; an NPC greeting shows a parchment bubble; > 6 bubbles caps; bubbles hide with `chatBubbles = false`.

#### UX-31 — Chat window · owner: hud · W3 · depends: UX-00
- **Own:** `hud/Chat.ts`, `styles/hud-chat.css`.
- **Do (§5.1):** tab strip + per-tab buffers (200), scrim look, hover/typing states, channel colours, class-colour names, `Yeni mesajlar ↓`, `/` hint list, emit `chat:line` from `addLine`, keep `consumedAt` / Enter / Esc semantics and `/temizle`; add the local-only commands `/arayuz` (`G.ui.hud.startEdit()`) and `/zindan` (`G.ui.openPanel('finder')`) beside `/temizle`; render only tabs that have channels; `chatFontSize` 13–17.
- **Done when:** tsc 0; Enter-to-type, Esc, `/temizle` behave as before; tabs filter lines; `dev/hud.html` `0` hotkey fills Genel/Sistem.

#### UX-41 — LFG net contract · owner: net · W3 · depends: UX-00
- **Own:** `net/messages.ts`, `net/NetSession.ts`, `types/character.ts` (`CharacterSummary.role?`), `systems/CharacterState.ts` (`summary()` adds `role`).
- **Do (§6.5):** `RoomAnnouncement.lfg?` + `sanitizeAnnouncement` validation (ids via `ident`, counts `int(…, 0, 5)`, `note` via `text(…, 40)`), `RoomInfo.lfg`, `NetSession.setLfg(listing | null)` → stores and re-announces, `announceInput()` includes it, `listRooms()` maps it; `summary().role` from `getSpec(save.spec)?.role ?? 'dps'`, re-announced on `spec:changed`.
- **Done when:** tsc 0; `dev/net.html` two tabs: tab A `G.net.setLfg({dungeon:'kemik_mahzeni',diff:'normal',need:{tank:1,healer:1,dps:2}})` → tab B `G.net.listRooms()[0].lfg` matches; a malformed announcement is rejected/clamped.

#### UX-40 — Zindan / Raid Bulucu · owner: panels-game · W4 · depends: UX-02, UX-41, UX-12 (eye)
- **New:** `panels/game/finderModel.ts`, `panels/game/runStart.ts`, `styles/panels-finder.css`.
- **Own:** `panels/game/finder.ts`, `panels/game/party.ts` (`Zindan Bulucu` button only), `entities/interactables/Portal.ts` (`DungeonPortal.interact` + prompt), `entities/NPC.ts` (`panelForNpc` portal case only).
- **Do (§6):** `runStart.ts` (`buildParams`, `enemyLevelFor`, `startRun`, ported from `keystone.ts`; **`keystone.ts` is not edited here**); `finderModel.ts` (pure: card rows, difficulty button states from `difficultyState`, role defaults, need-by-role, listing filter/sort); `FinderPanel` three tabs, selector, footer, modes Tek Başına / Grubumla / Grup Ara, state machine + `finder:queue` emits, Gruplar table, Raid tab with the `DUNGEONS['efsun_kalesi']` feature flag, keyboard (↑↓ ←→ Enter); `setLfg` calls are made through `G.net.setLfg?.(…)` so the panel still loads on a build without UX-41.
- **Done when:** tsc 0; `,` opens the finder; at level 8 Kemik Mahzeni is selectable on Normal and starts a run offline; Heroic/Mitik show lock reasons and toasts; Raid tab shows `YAKINDA`; in `dev/net.html` two tabs: A `Grup Ara` → B sees the listing in Gruplar and joins; portals in town open the finder.

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
- **Do (§7.3–7.6, §4.5, §4.9):** sizes / docks / hints per the §7.3 table; empty states per §7.5; quest log kill rows with bars + `Haritada göster`; settings `Arayüz` tab (§7.3; `hudStyle` row moves into it); game menu entries (`Başlangıç Rehberi`, `Arayüzü Düzenle`, `Zindan Bulucu`); map town giver pins, recommended-region outline, zone-progress card; keystone uses `runStart.ts` and shows the finder banner; talents CSS size 1180 × 720; delete dead selectors in the CSS files it owns.
- **Done when:** tsc 0; `dev/panels-game.html` shows every panel at its standard size with hints and empty states; Settings › Arayüz toggles work (`showTips`, `questArrow`, `meterVisibility`, bars, `Arayüzü Düzenle`, `İpuçlarını Sıfırla`).

#### UX-52b — Item panels pass · owner: panels-items · W5 · depends: UX-51
- **Own:** `panels/items/SkillsPanel.ts`, `InventoryPanel.ts`, `CharacterPanel.ts`, `VendorPanel.ts`, `StashPanel.ts`, `BlacksmithPanel.ts`, `styles/panels-items.css`.
- **Do (§7.3, §7.4):** skill book grouping (bar editor strip, Çubukta / Öğrenildi / Açılacak collapsed / spec group, other-spec toggle, search, `efsun.skillbook.v1`); inventory bag-fullness chip + hints + empty state; character section cards; vendor/stash/blacksmith sizes; rarity frames via `.k-slot[data-rarity]`; font floor 13 px; delete dead selectors in `panels-items.css`.
- **Done when:** tsc 0; `dev/panels-items.html`: skill book shows ≤ 8 bar slots, learned skills grouped, locked skills collapsed; no text < 13 px in the touched CSS.

#### UX-60 — Cleanup, docs, dev pages · owner: hud (+ docs) · W5 · depends: all earlier
- **Own:** `styles/hud*.css`, `styles/widgets.css`, `styles/overlays.css`, `ui/menu/menu.css`, `src/dev/hud.ts` (header comment + hotkey list), `ARCHITECTURE.md` (HUD / panels / new files sections), `docs/ROADMAP.md` (mark UI redesign done, record the new score).
- **Do:** grep-based dead-CSS removal (selectors with no match in `src/**/*.ts`: `.m2-well`, `.m2-stat`, `.m2-slotswrap`, `.efs-bark`, `.fps` if unused, old `.qt`/`.mt` wrappers once the tracker owns them, `.hud-edit-btn`), replace remaining hex literals in touched rules by tokens, scan every file for `font-size` < 13 px on information text, `grep -c` report of hex literals / font sizes in the PR note (targets §0.2), final `npx tsc --noEmit` and `vite build`.
- **Done when:** tsc 0 and `vite build` green; the §0.2 table is re-measured and pasted into `ROADMAP.md`.

### 8.3 File ownership matrix (conflict check)

| File / group | W0 | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|---|
| `ui/UI.ts` | UX-00 | | | UX-30 | | |
| `core/Input.ts`, `Settings.ts`, `events.ts` | UX-00 | | | | | |
| `ui/kit/*`, `tokens.css`, `kit.css` | UX-00 | | | | | |
| `hud.css`, `hud/index.ts`, `layoutStore.ts`, `hud/types.ts` | UX-01 | | UX-13 (`index.ts`) | | | |
| `hud-bottom/metin2/extras.css`, `ActionBar.ts`, `Metin2Bar.ts`, `FlaskRow.ts` | UX-01 (stub lines) | UX-10 | | | | |
| `PlayerFrame/PartyFrames/TargetFrame/BossFrame/ComboCounter/StatusRow`, `hud-frames.css` | | UX-11 | | | | |
| `Minimap.ts`, `Tracker.ts`, `QuestTracker/MythicTracker/QuestFeed/DamageMeter`, `hud-right/quests/meter.css` | UX-01 (stubs) | UX-12 | UX-21 (`Minimap.ts`) | | | |
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

Within every wave the files above are disjoint (checked column by column). `hud/index.ts` is the only HUD composition root and is touched only by UX-01 (W0) and UX-13 (W2).

### 8.4 Dependencies in one line

`UX-00` ∥ `UX-01` ∥ `UX-02` → (`UX-10` ∥ `UX-11` ∥ `UX-12`) → (`UX-13` ∥ `UX-20` ∥ `UX-21`) → (`UX-30` ∥ `UX-31` ∥ `UX-41`) → (`UX-40` ∥ `UX-50` ∥ `UX-51`) → (`UX-52a` ∥ `UX-52b` ∥ `UX-60`). UX-12's `hint` pane and UX-12's minimap eye degrade gracefully (static text / hidden) until UX-21 / UX-40 land; UX-40 degrades gracefully without UX-41 (`G.net.setLfg?.()`); UX-30 needs UX-31's `chat:line` event **only through the contract added in UX-00**, so W3 packages are independent.

---

## Appendix A — Contracts (exact additions)

| Where | Addition |
|---|---|
| `core/Input.ts` | `InputAction`: `'finder' \| 'guide'`; `DEFAULT_BINDINGS`: `finder: ['Comma']`, `guide: ['Period']`; `ACTION_NAMES_TR`: `finder: 'Zindan Bulucu'`, `guide: 'Ne Yapmalıyım?'`; `codeLabel`: `Comma: ','`, `Period: '.'` |
| `core/Settings.ts` | `showTips: boolean = true`; `questArrow: boolean = true`; `meterVisibility: 'auto' \| 'always' \| 'never' = 'auto'`; `chatFontSize` default 15, range 13–17 |
| `core/events.ts` | `'chat:line': { from: string; text: string; channel: ChatChannel; local: boolean }` · `'finder:queue': { state: 'idle' \| 'listing' \| 'proposal' \| 'entering' \| 'inrun' \| 'failed'; dungeonId?: string; since?: number }` · `'quest:pinned': { questId: string \| null }` |
| `net/messages.ts` | `RoomAnnouncement.lfg?: { dungeon: string; diff: 'normal' \| 'heroic' \| 'mythic' \| 'mythicplus'; key?: number; need: { tank: number; healer: number; dps: number }; ilvl?: number; note?: string }` |
| `types/character.ts` | `CharacterSummary.role?: 'tank' \| 'healer' \| 'dps'` |
| `NetSession` | `RoomInfo.lfg?`, `setLfg(listing: RoomAnnouncement['lfg'] \| null): void` |
| `HudApi` | `density: 'lg' \| 'md' \| 'sm'`, `zones`, `tracker`, `tips`, `guideTarget: string \| null`, `setGuideTarget(npcId: string \| null): void`, `adviceLine?: () => string` |
| `CharacterSave.flags` (values `1`) | `onb.welcome`, `onb.metCemal`, `onb.smith`, `onb.finder`, `tip.<id>` |
| `localStorage` | `efsun.uiLayout.v2` (v1 read once), `efsun.tracker.v1`, `efsun.win.v1.<id>`, `efsun.skillbook.v1`; existing `efsun.quest.pin`, `efsun.dpsMeter.v2`, `efsun.uiScale` unchanged |
| Panel ids (new) | `finder`, `guide`, `welcome` |
| CSS files (new) | `tokens.css`, `kit.css`, `hud-bottom.css`, `hud-frames.css`, `hud-right.css`, `hud-chat.css`, `hud-corner.css`, `hud-onboard.css`, `hud-bubbles.css`, `world-markers.css`, `panels-shell-pg.css`, `panels-shell-pi.css`, `panels-guide.css`, `panels-finder.css` |
| TS files (new) | `ui/kit/{chrome,controls,index}.ts`, `ui/hud/{Tracker,ObjectiveArrow,TipCards,QuestFeed,FlaskRow,ChatBubbles}.ts`, `ui/widgets/{Bubbles,levelColor}.ts`, `ui/panels/game/{finder,finderModel,runStart,guide,guideEngine,welcome}.ts`, `data/tips.ts`, `dev/hud-ext/*.ts` |

## Appendix B — Terminology (keep the Turkish consistent)

| Term | Use |
|---|---|
| Alt Tahta | the bottom board (gauges + rack) |
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
| Yoğunluk: Büyük · Orta · Küçük | HUD density read-out (`lg` / `md` / `sm`) |

## Appendix C — QA checklist per wave (Haiku QA, one browser tab, low CPU)

Common: 0 console errors; `npx tsc --noEmit` = 0; test at **1920×1080** and **1280×720**; one agent may take scale-0.4 screenshots.

- **W0:** game boots; every panel looks as before; `data-density` flips when resizing; `localStorage['efsun.uiLayout.v2']` appears after a drag in edit mode; `,` / `.` open stub panels.
- **W1:** level-1 character: top-left has chip + buffs only (no bars); bottom board shows LMB RMB 4 5; raise level via the dev page: Q (3), E (6), 1 (10) appear with the grow-in + `YENİ`; board width 540 → ≤ 740; all six resource kinds colour the SP gauge; right column shows minimap + one tracker; boss / run / quest modes switch; kill count rows animate; chat and board do not overlap at 720p; no text < 13 px on screen (devtools computed-size spot check).
- **W2:** 5 micro buttons at L1, +N at 2, +K at 3, +finder at 8; no edit button; loot lines ≤ 5; quest banner once per accept; welcome card on a fresh character, once; arrow follows / clamps; tips fire once, never during panels; `.` guide panel recommends per level (1, 5, 8, 20, 30, 50, 60); NPC markers framed, bobbing, no dark box.
- **W3:** typed message → bubble over the head; two messages stack; > 6 bubbles capped; NPC bark parchment; chat tabs filter; unread dot; `chatBubbles` off hides player bubbles; two-tab net: LFG field round-trips.
- **W4:** `,` finder: list, difficulty states (locks + reasons), Normal solo start offline works; Raid tab `YAKINDA`; two-tab LFG: list → join → ready check → start; every window shares header/close/tabs/button style; windows fit 1280×720; drag + remembered position.
- **W5:** every panel at its size class with hints and empty states; skill book grouping; Settings › Arayüz toggles persist; §0.2 table re-measured (visible controls at L1 ≤ 10, regions 6, hex/font counts); `vite build` green.

Score deltas to record in `ROADMAP.md`: **UI / HUD (#6)** and **Onboarding & content depth (#11)**.

## Appendix D — Content hooks for the orchestrator (outside this document's scope)

The player also asked for **more maps, more content, "dolu olsun, boş boş olmasın", and MMORPG-style "N yaratık kes" tasks**. The UI above makes whatever exists visible (§2.9, §4.9, §7.5); filling the world is authoring work with these exact hooks:

1. **Hunt (Av) quest pool.** `data/world/quests.ts` already supports `kill(target, count, text)` and `QuestDef` rewards. Add `HUNT_*` templates: per region (`r1`…`r6`, later Karakır / Ayaz Eteği) **≥ 4 repeatable kill quests** (8–15 of one mob id or family, XP % + gold per level, 1 generic reward on the 4th), offered by each village's notice-board NPC or the village headman; repeatable daily like `bounty_*`. Aim: **≥ 6 side quests per region, ≥ 1 quest giver within ~60 m of any road route**, so a `!` is almost always on screen.
2. **Quest density rule for content checks.** Extend `tools/content-check.mjs` to fail when a region has < 6 side quests or a village NPC list has no quest giver; the UI's `recommend()` and zone-progress card (`Görevler 3 / 9`) read these counts directly.
3. **Maps.** Karakır Bozkırı (30–37) and Ayaz Eteği (38–45) exist only as `data/world/karakir.ts` constants; the guide panel already shows them as `Yakında` and will switch to live as soon as `getDungeon('karakir_bozkiri')` resolves. Further "gezegen" maps need only a `DungeonDef` with `world: WorldExtras` (regions, villages, entrances) — the minimap, map pins, arrow and guide pick them up with no UI change.
4. **Av Defteri** (`data/avDefteri.ts`, six steps to level 30): add steps 7–12 for Karakır (levels 30–45); the tracker shows the active step as a second pinned line (§4.9, P2).
5. **Feedback hooks the data must keep emitting:** `quest:updated`, `world:regionEntered`, `waypoint:discovered`, `loot:pickedUp`, `skillbar:changed` (all exist today).
