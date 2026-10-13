# EFSUN ONLINE — Continuous improvement loop

User goal (Turkish, /loop): develop the game non-stop — find what's missing / could be better, add what needs adding,
otherwise polish; score it; test with Haiku; implement with Sonnet; fetch assets when needed.

## Loop protocol (each iteration)
1. **QA + score (Haiku, 1 agent, 1 browser tab, low CPU)** after every build/fix wave: run game + key dev pages, report
   bugs (with console errors) and score the rubric below (0–10 each, with one-line justification), list top 5 opportunities.
2. **Plan (orchestrator)**: bugs first (blocker/major), then the highest-impact backlog items. Group by module ownership
   (ARCHITECTURE.md) so agents never edit the same files.
3. **Build (Sonnet, pool ≤ 3, no browser)**: one agent per owner group. Visual-feel tasks may allow ONE agent a few
   scale-0.4 screenshots. Must end with `npx tsc --noEmit` = 0 errors.
4. **Assets when needed**: Blender headless generation (tools/blender/*) or plain-GET CC0 sources (Kenney, GitHub mirrors,
   OpenGameArt, Poly Pizza). itch.io browser downloads need the user's explicit approval in chat (file name + size) first.
5. **Record**: append scores + done items below. Keep CPU low (≤ 5 agents total, close stray tabs/servers).

## Scoring rubric (0–10)
| # | Category | What "10" means |
|---|---|---|
| 1 | Stability | 0 console errors, no soft-locks, every scene/panel works |
| 2 | Combat feel | snappy input, juicy hits (hit-stop, shake, flashes, sparks, sounds), satisfying combos for all 4 classes |
| 3 | Visuals / PSX look | cohesive PSX MMO style, good lighting/fog, effects read well, no broken models/orientations |
| 4 | Dungeons & M+ | detailed rooms, readable boss mechanics, working timer/forces/affixes/keystone loop |
| 5 | Progression & loot | rewarding drops, upgrades/efsun/talents meaningful, smooth level curve |
| 6 | UI / HUD | clear, premium WoW/Metin2 look, Turkish, responsive, no overlaps |
| 7 | World & town | lively hub, open world zone, NPCs, ambient life |
| 8 | Audio | music per scene, impactful sfx, voice barks, good mix |
| 9 | Multiplayer | rooms/browser, join, sync of players/enemies/damage, run together |
| 10 | Performance | ≥ 60 fps on a mid PC in dungeons, fast loads |
| 11 | Onboarding & content depth | tutorial, quests/story, goals for hours of play |

## Backlog (prioritized; move to Done when shipped)
**P0 — correctness**
- Finish integration TODOs (docs/INTEGRATION_TODO.md) — in progress.
- Real multiplayer test with two tabs (LocalTransport) + fix sync bugs.
- Performance pass: draw calls/instancing in dungeons, light pool, PSX pass cost; target 60 fps.

**P1a — USER REQUEST 2026-10-13 ("Sistemler 2.0"; design in docs/GDD_V2.md, then implement in waves)**
- Roles & specializations: WoW trinity (Tank / Healer / DPS) — 2 specs per class + a healer option; threat/aggro system,
  taunt, tank "rotation" (active mitigation, threat skills), healer kit (party-frame targeting, smart heals, HoTs).
- WoW-style major cooldowns per spec: a 45 s cooldown and a 1.5 min (90 s) cooldown (burst / defensive / utility),
  plus a party-wide "Kahramanlık/Bloodlust" style buff; cooldown UI on the action bar.
- Elden Ring-style extra combos: charged heavy attacks, running/jump attacks, guard + parry → riposte, backstab,
  POISE / stance meter on enemies → stance break → critical "kritik vuruş" animation, weapon arts per weapon type.
- Path of Exile systems: skill gems + support gems linked in item sockets (or skill rune supports), flasks with charges
  refilled by kills, currency crafting orbs (reroll/upgrade/add affix), deeper passive tree, map-like key modifiers.
- Diablo systems: legendary aspects/powers that transform skills, elite monster affixes, 2/4/6-piece class sets,
  paragon-like endgame board, loot goblins.
- WoW set logic: class/spec tier sets with 2-piece and 4-piece bonuses that change rotations.
- Creature weaknesses: damage-type weaknesses/resistances per enemy family (shown on nameplate/tooltip), exploit bonus,
  status vulnerabilities (e.g. undead weak to holy/fire, frost creatures weak to fire).
- Mythic+ depth: enemy-forces % on nameplates, route planner on the map ("tank route"), interrupt/kick rotation helpers,
  pull/patrol markers, affix interactions, seasonal affix, death recap.
- Raids: a 5-player raid "Kadim Kale" (5 bosses, multi-phase mechanics, raid-only loot/tier), raid difficulty modes.
- Boss mechanics library expansion (soaks, spreads, adds, intermissions, enrage, positional mechanics).
- **USER REQUEST (hud module, next HUD wave first):**
  - DPS meter like WoW "Details!": per party member damage done / DPS, healing / HPS, damage taken, interrupts, deaths,
    segments (current fight, per boss, overall run), bar view with class colours, report-to-chat; party totals via a
    1 Hz `meter` net channel (each peer broadcasts its own totals).
  - UI Edit Mode (WoW Edit Mode): toggle, drag/move/scale every HUD frame (player/target/boss/party frames, action bars,
    orbs, minimap, M+ tracker, buffs, chat, DPS meter, combo counter), snap grid + alignment guides, per-frame options,
    save/load layouts in settings, reset to default.
  - Action bars: customizable skill bars (main bar + 1–2 extra bars, show/hide, rows/size), drag skills, potions, flasks,
    consumables and major cooldowns onto any slot, per-slot keybinds, lock bars.

- **USER REQUEST 2026-10-13: Metin2 flavour** — Metin2-style HUD gauges (HP/SP bars + 4-bead EXP) [in progress];
  candidates to confirm/add: Metin taşları (world Metin stones that spawn monster waves when hit), at/binek (mount),
  evcil hayvan (pet), beceri kitapları (skill books M1→G→P ranks), simya/ejderha taşları, kostüm/kuşak, biyolog görevleri.

- **USER REQUEST 2026-10-13 (batch 3)** — design: docs/GDD_CLASSES_V2.md + docs/GDD_LIFE.md (Sonnet), then implement (Haiku):
  - New classes inspired by WoW/Diablo: Keşiş (Monk), Okçu (Archer/Hunter), Paladin (tank/healer), Nekromant
    (Necromancer, skeleton minions), Warlock (demon pet, curses/DoTs) — on KayKit variants + existing animations.
  - Gathering & professions: ağaç kesme (woodcutting), madencilik (mining), herbalism/skinning/fishing, crafting
    (demircilik, simya, deri, terzilik, kuyumculuk) with skill levels, tools, recipes, tiered nodes per region.
  - Region identity: kurt bölgesi, ayı bölgesi, etc. with creature levels; open world level bands (also in GDD_OPENWORLD).
  - Hit feel ↑, camera control ↑, chat (zone/party/whisper/system, commands), ilvl/stat/combo tuning pass.
  - Later: open-world PvP (flagging, duels, PvP zones, rewards).

- **USER REQUEST 2026-10-13 (batch 4)** — design docs/GDD_ITEMS_V2.md (Sonnet) when a design slot frees, then Haiku:
  - Upgrade visuals for ARMOR too ("bastıkça itemlerin parlaması, çelik zırh"): polished-steel sheen at +4, blue shimmer
    +7, purple +9, red-gold flame +12, rainbow +15 on the character's armor (fresnel/sheen layer + particles), not only weapons.
  - More efsun/basma depth borrowed from other MMO ARPGs: Metin2 6th/7th bonus + rare efsun, Knight Online upgrade
    scrolls, BDO failstacks (each failure raises the next chance), Silkroad Seal-of-X glow sets, Aion manastones,
    Lost Ark engravings/quality, Diablo 4 masterworking, PoE crafting bench.
  - Later (P3): camping system (çadır kur, kamp ateşi buff'ı, açık dünyada dinlenme) and housing (ev satın alma,
    dekorasyon, depo, zanaat istasyonları).
  - Standing order: keep "stealing" good ideas from other MMO/action RPGs (Lost Ark, BDO, Diablo 4, PoE, Metin2,
    Knight Online, Silkroad, Aion, GW2, New World) when planning each iteration.

- **USER REQUEST 2026-10-13 (batch 5): WoW-style specs + talents on N** — after GDD_V2 + GDD_CLASSES_V2 land, a Sonnet
  reconciliation doc docs/GDD_TALENTS.md: every class (9) gets WoW-like specs (e.g. Büyücü: Ateş / Buz / Gizem; Paladin:
  Koruma / Kutsal / Ceza; …), spec choice at level 10 (switchable in town), Dragonflight-style class tree + spec tree
  with node choices every level (choice nodes, ranks, capstones), loadouts, opened with **N**.
  **User clarified: it must be WoW + Path of Exile combined** → N opens ONE window with tabs/layers: (1) WoW layer = spec
  choice + class tree + spec tree; (2) PoE layer = the big passive web (keep and expand the existing ~120-node tree:
  keystones, notables, class starts, masteries); separate point pools (talent points from level 10, passive points every
  level + quests); consider Last Epoch-style per-skill mini trees (skill specialisation) as the bridge between the two.
  Then Haiku implements.

- **USER REQUEST 2026-10-13 (batch 6)** — HIGH PRIORITY:
  - Art: everything consistent PSX; characters in PSX square/VOXEL style (rig-preserving Blender voxelization of KayKit
    etc., docs/ART_VOXEL_PSX.md); one canonical tree/rock/bush set; generate models/textures where needed. Prototype
    (Knight + 2 trees) → user approval → batch conversion.
  - Onboarding ("oyun başlıyor, ne yapacağımı bilmiyorum, nerede kasacağım"): first-login guidance, quest objective
    arrow + map markers, "Ne yapmalıyım?" panel recommending the level-appropriate zone/dungeon, contextual tutorial tips.
  - Chat messages as speech bubbles above the speaker's head.
  - WoW-style emotes via chat commands (TR + EN aliases): /dans /dance, /selam /wave, /otur /sit, /alkış /cheer,
    /gül /laugh, /uyu /sleep, /eğil /bow, /kızgın /angry … — KayKit clips (Cheer, Sit_Floor_*, Lie_*, Interact, Use_Item),
    missing ones (dance, wave, bow) generated in headless Blender on the shared KayKit rig; emote replicates via pstate
    one-shot/base anim; small emote text bubble; emote wheel/menu in chat (same package as chat bubbles).
  - WoW-style Dungeon Finder + Raid Finder with difficulty selection (+ role queue; solo/party start; online LFG via lobby).
  - Bigger maps, more maps/realms ("gezegenler"), extra regions and level zones (Karakır Bozkırı 30–45 and beyond).
  - Fast continuous content production (Haiku can do data/content packages).
- **USER REQUEST 2026-10-13 (batch 7, WoW references in docs/ref/ui/README.md)**:
  - UI like modern WoW/ElvUI: flat compact unit frames near centre, grid action bars with tiny keybinds, quest tracker
    on the right, chat bottom-left, minimap with FPS/MS, stats readout; Details!-style DPS + HPS meters with spec icons.
  - Character sheet like WoW: equipped/overall item level, M+ score, Attributes / Secondary (Kritik, Hız (Haste),
    Ustalık (Mastery), Çok Yönlülük (Versatility)) / Tertiary (Can Çalma, Kaçınma, Hız) stats, per-slot ilvl + upgrade
    track + sockets — may require a WoW-like secondary stat model (design addendum).
  - Dungeons spread across the maps with WoW-like grand entrances (ornate gate, stairs, braziers, meeting stone) instead
    of all portals in one hub; Dungeon Finder queues discovered ones.
  - Maps like WoW: grand dense capital (Silvermoon-like Kuzgunkale), richer zones, nothing empty.
  - Group Finder on **I** like WoW (inventory stays on B): tabs Dungeons & Raids (Dungeon Finder, Raid Finder, Premade
    Groups) | Player vs. Player | Mythic+; role selection, Random Heroic etc., daily bonus rewards, Find Group; Raider.IO-like
    M+ profile panel (ref #6 in docs/ref/ui/README.md).
  - PvP: arenas (2v2/3v3, small arena maps) and queues; PvP gear separate from PvE gear, bought from PvP vendors with
    Onur (honor) / Fetih (conquest) currencies; ratings; P2P constraints (design: docs/GDD_PVP_FINDER.md).
  - Combat feel weak → steal WoW combat mechanics (docs/COMBAT_WOW.md, in progress).
- **USER REQUEST 2026-10-13 (batch 8): Mythic+ like WoW** — NEXT after the town plaza fix (Haiku):
  - In-dungeon Font of Power: enter the dungeon on Mitik difficulty (no timer) → keystone pedestal (Kehanet Taşı,
    DungeonDef.extras.fontOfPower) at the start → interact F → keystone panel (key level, affixes, scaling) → insert →
    10 s countdown + start barrier → timer. Any party member's key; host validates. Normal/Kahramanlık/Mitik 0 ignore it.
  - Scaling tuned: compounding HP/damage per level (~+8 %/level, Fortified trash / Tyrannical boss weeks), party-size
    scaling, reward ilvl curve per key level, depletion/upgrade (+1/+2/+3) — verify numbers in a headless sim table.
  - Affixes: add a Prideful-like seasonal affix "Kibirli" (every 20 % enemy forces spawns a "Kibir Tecessümü" that
    grants a party buff when killed); enemy forces % on nameplates + tracker; route planner with route SHARING (export
    string, paste in chat, net share to party), tank route presets.
  - Great Vault like WoW (ref #8, docs/ref/ui/wow-great-vault.webp): 3 rows × 3 slots — Raid (2/4/6 bosses),
    Dungeons (1/4/8 Heroic/Mythic/M+ runs; slot ilvl from the n-th best key), World (2/4/8 world activities: Metin
    stones, world bosses, rares, daily quests) — weekly reset, pick ONE reward or a currency, locked slots show progress.

**P0 — Foundation sprint (from the 5-lens game audit, 2026-10-13; runs before/alongside batch 9)**
Audit verdict: scope is outrunning verification; the biggest risks are lost saves, a dead-ended main story, a level
30–60 content cliff, an unvalidated multiplayer base and swallowed errors. Order (S = small, M = medium):
  - DONE 2026-10-13: F1, F2, F3, F4, F5, F6 (commits 99d32f2, 09a8abf, a0d2b92 + follow-ups); perf wave 2 (326e5b5).
  - F1 [S/M core] Save safety: navigator.storage.persist(), rolling `.bak` before every migration + every 5 min,
    corrupt-save recovery from `.bak`, write-failure toast, "Kayıtları Dışa/İçe Aktar" (JSON) in Ayarlar.
  - F2 [S content] Unblock the main chain: author missing hub NPCs (npc_c_riza at Altın Ambar, npc_c_deniz at Kanyon
    Girişi, 4–6 NPC camps with waypoint + safe zone) so mq_07…mq_19 and 8 side quests work; content-check gains a
    quest-reachability bot (giver/turn-in NPC exist, targets spawn in that region) as a hard error.
  - F3 [S content+systems] First 10 minutes: swarm XP 0.6 for L1–10, early quests 3–4× XP (level 2 ≤ 90 s, level 3
    ≈ 4 min), guaranteed uncommon at L2, auto-pinned mq_01 with a path arrow, mq_01–06 as tutorial beats (move,
    attack, roll, guard/parry, loot, blacksmith), auto-salvage toggle for poor/common loot.
  - F4 [S combat] Hold-to-attack default (holding LMB chains the combo); heavy charge moves to Shift+LMB (and Mouse4).
  - F5 [S combat] Solo-aware roles (CORE_MECHANICS §1.5 "Yalnız Kurt").
  - F6 [S net] Host validation: onNetHit requires sender alive, in range (+slack) of the target, per-peer token bucket
    (~40 hits/s), amount cap vs the sender's level/ilvl; pdeath/forced-fail only from the dead player themself.
  - F7 [M core] One error reporter: `guard(tag, fn)` / `reportOnce`, window.onerror + unhandledrejection, top offenders
    in the F3 overlay; replace empty catches in combat/ai first.
  - F8 [S core] Input conflicts (F3 overlay vs partySel3) + a bindings-unique check; gate window.G / dev keys behind ?dev.
  - F9 [M combat+net] Network-aware telegraphs/parry windows (host timestamp; guests keep ≥ 70 % of the window).
  - F10 [M ai] Enemy tell rules: windup = clamp(0.45 + 0.25 × coef, 0.45, 1.2), colour pulse + wind-up sound on every
    melee windup, max 3 simultaneous melee swings on the player.
  - F11 [M vfx-audio] Wire the unconnected hit feedback (weight-layered impact audio, HitFeel.sparks/chips).
  - F12 [S docs] NETCODE.md rewritten "as built (protocol 2)" + "target" section.
  - Later (L): Karakır Bozkırı map 2 for levels 30–60 with mq_20–30 (content cliff); M+ wings → 8 keys from 4 dungeons
    + must-answer trash (kick/dispel flags); +N transfer service (Basma Aktarma); TURN + connection diagnostics +
    reconnect into a running key; econ/pace sim (fold into SimBench); HUD viewport matrix; ART_BIBLE.md; perf budgets
    (town ≤ 400 calls / 250k tris, dungeon ≤ 500 / 350k, open world ≤ 600 / 400k, ≤ 10 lights).
  - Process: version history (git, local only) needs the user's OK; until then scratchpad snapshots before each block.

**Batch 10 (user) — Mythic+ Season 1 pool: 8 WoW-style dungeons ("M+ çok önemli")** — designs in docs/dungeons/*.md
  - Yıldız Divanı (Court of Stars), Yiğitler Sarayı (Halls of Valor), Leş Uyanışı (Necrotic Wake), Peri Sisleri (Mists
    of Tirna Scithe), Kefaret Salonları (Halls of Atonement), Yankı Ağı (Ara-Kara), Taşkasa (Stonevault), Büyücüler
    Terası (Magisters' Terrace, Midnight). Art, layout, set pieces and bosses very close to WoW; level-60 season pool,
    the existing 4 dungeons stay as levelling dungeons. Entrances spread across the endgame zones with grand gates.
  - Order: designs → shared NEW primitives once (boss kit: intermission, soak, spread, tank-swap, beams, add waves;
    trash kick/dispel flags; set-piece mechanics) → per-dungeon Haiku packages (data, bosses, enemies, theme/props,
    Blender assets) → QA per dungeon.

**Batch 9 (user, 2026-10-13 late) — WoW kits, balance, Pazar** — normative spec: docs/CORE_MECHANICS.md
  - Opus-designed core mechanics (§1–§8): 11 classes / 27 specs (+İblis Avcısı, +Ejderhasoy, +Haydut Gölge), every class
    a tank or healer option where WoW has one, party buffs, WoW stat model, DPS within ±3 % at BiS (SimBench + auto-tuner
    + check gate), Raidbots-like sim panel, Raider.IO-like leaderboard with rosters (P2P gossip), M+ scaling.
  - ALL classes rebuilt on their WoW Midnight (S2) spec kits + rotations (§10): Mage Arkan Füzeler homing onto the
    target, Rogue Gölge Adımı teleport-behind + Sırttan Bıçak positional, proc glow / spell alerts, target casting.
    Research: docs/ref/wow/*.md (Haiku). Packages CM12/CM13.
  - Metin2-style Pazar (§11, ref #9): stalls in Pazar Meydanı, AFK Pazarcı Modu, buyers buy from your shop while you are
    AFK, gold comes to you, Pazar Arama. Package CM14.

**P1 — user priorities (combos / effects / hit feel)**
- Combat feel polish per class with screenshots: attack cadence (FEEL.basicTempo), finisher weight, enemy stagger/knockback,
  crit slow-mo, layered sfx, weapon trails, kill flings, combo counter juice.
- Skill VFX quality pass (each class's 8 skills visibly distinct and spectacular, PSX-style).

**P2 — content depth**
- Onboarding: first-login tutorial (movement, combat, loot, blacksmith, keystone), quest tracker on HUD.
- Story/quest chain: Kuzgunkale NPC dialogue + main quest leading through Sisli Koru → 4 dungeons → Mythic+.
- Open world Sisli Koru polish: camps respawn, world boss Çürükkök event, gathering nodes. Now planned as the Sisli Vadi open world: see `docs/GDD_OPENWORLD.md` §10 (implementation plan, WP1-WP8).
- Achievements + titles (Metin2/WoW flavour), character sheet showing them.
- Pets / mounts (Metin2): summonable pet following the player; a mount for town/open world speed.
- Aion-style gliding wings in the open world (cosmetic movement mechanic).

**P3 — polish & meta**
- Graphics presets (Düşük/Orta/Yüksek/PSX Otantik), FPS cap, UI scale.
- Save export/import (JSON backup), multiple characters' shared stash.
- Loading screen art per dungeon, dungeon intro cinematics (camera fly-through + title card).
- Leaderboard of M+ rating in the lobby (P2P announcements).
- PvP duel arena (Knight Online flavour) — optional, late.

## Score history
| Date | Iter | Stab | Feel | Vis | Dung | Prog | UI | World | Audio | MP | Perf | Depth | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | 7 | 6 | 7 | 6 | 5 | 7 | 7 | 6 | 3 | 3 | 5 | Haiku QA; avg 5.6. Perf ~10 fps (maybe throttled tab) w/ 133 enemies; damage meter records 0; bloom/haze hurts readability |
| 2026-10-13 | 3 | 7 | 5 | 7 | 5 | 5 | 6 | 7 | 5 | 3 | 2 | 5 | after open world: quests/villages work; perf 1,4k draw calls, 600k tris, 1,1k textures, 37 lights; DPS meter swallows clicks; tree trunk occludes camera in world |
| 2026-10-13 | 7 | 8 | 5 | 6 | 5 | 5 | 6 | 7 | 4 | 3 | 3 | 5 | after Elden Ring layer: heavy/parry/poise/finisher work; missing parry/riposte/stance VFX+SFX; draw calls 1.4k→800, textures 1.1k→350; tris still 600k |

## Done
- Core architecture, 13 modules, assets (KayKit, Kenney, itch packs, Blender-generated), 4 dungeons + town + open zone data, M+ system, P2P netcode (2026-10-13).
- Haiku smoke test: 0 console errors across game + 13 dev pages (2026-10-13).

## Implementation queue (orchestrator notes, 2026-10-13)
Design docs done: GDD_V2 (8 WPs), GDD_OPENWORLD (WP1–WP8, 4 waves), GDD_CLASSES_V2 (NC01–NC62), GDD_LIFE (own plan).
Design docs ALL DONE: + GDD_TALENTS (T0–T21, waves W0–W8; .trees.json + .web.json) + GDD_ITEMS_V2. Open world implemented (openworld-implement) + follow-up running (openworld-followup, incl. QA iter3).
Next, in order (Haiku coders, ≤3 parallel, file-disjoint; Haiku QA + score after each block):
1. Open world (running) → QA/score.
2. Contracts block: GDD_V2 WP1 + CLASSES NC01–NC04 + LIFE types + TALENTS/ITEMS_V2 types (one Haiku, careful, append-only).
3. Combat feel / Elden Ring layer (V2 WP2) + camera improvements (LIFE) — user priority #1.
4. Talents (WoW + PoE on N) + specs (incl. Mage Ateş/Buz/Gizem).
5. New classes (CLASSES NC05+ in dependency order).
6. Items 2.0 (V2 WP3 + ITEMS_V2: armor glow, failstacks, efsun 6/7, runes, flasks, orbs, aspects, tier sets).
7. Professions/gathering + chat (LIFE), M+ depth + raid (V2 WP7), then open-world PvP, camping/housing.
