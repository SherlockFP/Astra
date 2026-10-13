# EFSUN ONLINE: MMO Pillars, Scorecard and Roadmap

Date 2026-10-13. Goal: WoW-like MMORPG with big maps like Metin2 / Knight Online. Compares the reference games, scores the project, orders 14 work packages (WP).

## 1. Pillars: what the reference games do

| Pillar | WoW (retail) | Metin2 | Knight Online |
|---|---|---|---|
| World scale | Zones of ~1-2 km (Elwynn is ~2x4 map tiles, about 1 x 2 km); flight paths, mounts at lvl 10-20 | Several hunting maps per empire reached by portals; huge, dense grind fields (est. 1-3 km/side, unsourced) | Neutral hub Moradon plus two nation lands and a big PvP land, Ronark Land (est. 1.5-2 km, unsourced) |
| First hour | Quest hubs, a level every few minutes, class tutorial, first dungeon by lvl 15 | Pick one of 3 empires, kill mobs next to the village, first mount/pet quickly | Slow, party grind in Moradon fields; war events from the clock |
| Open-world events | Rares, world bosses, world quests (daily timer) | Metin stones (wave spawns), timed bosses, Orc Valley | Fixed-clock wars: Border Defense, Chaos, Bifrost, Castle Siege, Lunar War |
| Economy | AH, vendor sinks, repair, profession crafting | Failed +upgrades, potions and the Yang/Won spread are the main sinks; player shops | Magic Anvil upgrades, merchant kiosks that sell while the owner is AFK |
| Upgrades | Ilvl tracks, crafting, sockets | +0 to +9 chance table, failure can downgrade or break; Blessing/Dragon scrolls protect | Upgrade scrolls with failure; class-scroll workarounds |
| Social | Guilds, LFG, dungeon finder, achievements, friends | Guilds, empire chat, parties | Clans, parties of 8 (XP split), nation chat |
| PvP | Honor, arenas, battlegrounds, flagged world PvP | Empire wars, duels | Nation vs nation: National Points, kill counters, Ronark Land, Castle Siege |
| Mounts / pets | Mount at 20-ish, huge collection hobby | Mount and pet systems, costumes | Mounts, transformation scrolls |
| Daily / weekly | Dailies, world quests, M+ keys, Great Vault, resets | Event calendar, daily dungeons | Scheduled war events on the server clock |
| Collection | Achievements, titles, mounts, pets (a retention driver) | Biologist quests, costumes | NP rank, clan grade |
| Professions | Gathering and crafting tied to gear | Light (mining, fishing) | Light |

Key lessons: (1) WoW keeps players with *layered goals*: levelling, then dungeons, then weekly resets, then collections. (2) Metin2 and KO are *grind plus gamble plus rivalry*: long loops, risky upgrades, a rival nation. (3) Scheduled events give a shared "now" for the whole server.
## 2. EFSUN scorecard (0-10)

| Pillar | Score | Evidence |
|---|---|---|
| World scale and density | 5 | Sisli Vadi is 640 x 640 m with 70 camps, 473 mobs, 24 metin spots (`docs/GDD_OPENWORLD.md` §0, `src/data/world/camps.ts`). That is roughly a third of a WoW zone. Karakır is only a constants file (`src/data/world/karakir.ts`). The town is 120 m (`src/data/town.ts`). |
| Levelling and first hour | 6 | 19 main quests, objective arrow, "Ne Yapmalıyım?" (`src/data/world/quests.ts`, HANDOFF §4). The 1-30 pacing is about 4.5 h. There is a cliff at 30+. |
| Classes and combat | 7 | Seven WoW-style kits with sims, but only knight, barbarian, mage and rogue are selectable (`PLAYABLE_CLASSES`, `src/data/classes.ts:535`). |
| Open-world events | 5 | Metin stones, two timed bosses (`WORLD_BOSSES`, `src/data/world/pois.ts`). No calendar, no server-wide announcements, no rotating events. |
| Economy and upgrades | 7 | +15 table with downgrade and destroy tiers, protection scroll and failstacks (`src/data/upgrades.ts`, `src/systems/Upgrade.ts`). Pazar AFK shops (`src/systems/Market.ts`, `src/world/MarketStalls.ts`). Daily bounties (`Bounties.ts`). Few gold sinks. |
| Social and guilds | 3 | Global/trade chat, whispers, presence (`src/systems/Social.ts`). Party of 5 with the +5 %/member XP bonus (`LootSystem.ts:214`). Zindan Bulucu finder. No guilds. |
| PvP and faction identity | 1 | Only a message contract (`src/types/net.ts` PvpMsg, event `pvp:flag`). No flagging, duel, kill counter or nation. |
| Mounts, pets, collections | 1 | No mounts. "Pets" are class minions only. |
| Daily / weekly hooks | 6 | Three dailies, a daily chest and a weekly decree (`Bounties.ts`). M+ weekly keys. The Great Vault is designed only. |
| Achievements and titles | 1 | No system (the grep only finds audio and run-summary text). |
| Professions and gathering | 2 | `src/systems/Professions.ts` is a 6-line stub. Node positions exist in `pois.ts` (GATHER). |
| Endgame dungeons | 8 | 8 M+ dungeons plus procedural Kadim Yarıklar (`src/data/dungeons/`, `src/world/procgen/`). |
| Multiplayer scale | 4 | Serverless P2P (trystero), parties of at most 5, host cap of 240 mobs. |

Average about 4.3: strong combat and dungeon core, thin MMO shell (scale, rivalry, guilds, collection).

## 3. Good / weak / bad / missing

**Good:** combat and class depth; M+ and procgen dungeons; the Metin2-style upgrade table, Pazar and metin stones are already built; Turkish-first UI; the lobby social layer is clean and rate-limited.

**Weak:** the world is a third of WoW's zone size and the town is only 120 m; only two timed bosses; the level 30-60 content cliff; no pull toward logging in daily beyond bounties; Pazar and upgrades lack gold sinks.

**Bad:** three finished kits are locked out of the game; nothing makes players care about other players (no guild, no rivalry); the PvP contract is dead code.

**Missing:** mounts, pets, guilds, nations, PvP zone, siege, achievements and titles, professions, a world event calendar, rested XP, item links in chat, a reason to cross the map (waypoint fees, world quests).

## 4. Roadmap (12-15 WP, 1-3 agent-days each)

Ordered by impact on the "big living MMO" feel. D = agent-days.

**WP-01 Unlock Paladin, Warlock, Nekromant (1 D).** AC: all seven classes appear in character creation, each reaches level 10 with its bars, `tools/talents-check.mjs` and the kit sims stay green. Files: `src/data/classes.ts`, `src/ui/menu/*`, character-create model map. Dep: Paladin finish (in progress).

**WP-02 Karakır Bozkırı at real scale (3 D).** Target 1,600 x 1,200 m (WoW-zone size; 2 km is about 5 min of running), two halves (30-37, 38-45), 3 sub-regions, about 110 camps, 3 villages, 2 waypoints, 8 metin spots, 1 world boss, 3 dungeon gates. AC: playable seamless, no load between halves, 55+ fps on the reference PC, `content-check` quest reachability passes for mq_20..30. Files: `src/data/world/karakir.ts`, `regions.ts`, `camps.ts`, `pois.ts`, `villages.ts`, `src/world/Terrain.ts`. Dep: terrain streaming (in progress).

**WP-03 Mounts / "Binek" (2 D).** Quest at level 20 plus a Pazar vendor sale. Speed x1.6, 1.5 s summon cast, dismount on damage, blocked in dungeons. AC: the mount replicates to peers, the speed value is host-validated, 3 skins. Files: new `src/data/mounts.ts`, `src/game/PlayerController.ts`, `src/entities/Player.ts`, `src/net` pstate. Dep: WP-02 (pays off in big zones).

**WP-04 World events calendar (2 D).** A host-driven rotation every 30 min: Metin Fırtınası (5 stones at once), world boss, village invasion, goblin parade. AC: announcement banner and countdown on the tracker, a minimap icon, a Great Vault "World" credit, unit sim for the scheduler. Files: new `src/systems/WorldEvents.ts` and `src/data/world/events.ts`, `src/ai/metin.ts`, `src/ui/hud/Banners.ts`, `Minimap.ts`. Dep: none.

**WP-05 Guilds / "Lonca" (3 D).** Create for gold, roster, 3 ranks, guild chat channel, tag on nameplates, a small XP perk. Trust model "friends' rooms" like the existing PvP note. AC: guild survives re-login (saved plus lobby gossip), chat is rate-limited like `SOCIAL`. Files: new `src/systems/Guild.ts`, `src/net/lobby.ts`, `Social.ts`, `src/ui/panels/game/Guild.ts`. Dep: none.

**WP-06 Nations (2 D).** Two nations chosen at creation (for example Kuzgun Birliği vs Karakır Hanlığı), colours on nameplates, nation chat, a small nation buff. AC: the choice is saved and replicated, a nation-only chat channel. Files: `src/types/*`, `CharacterState.ts`, `Social.ts`, nameplates. Dep: WP-05 optional.

**WP-07 PvP zone "Kızıl Sınır" (3 D).** A flagged zone in Karakır: opposite nations can fight, kill counter and a kill-streak banner, Onur currency, weekly NP ranking, anti-farm rule (same victim diminishing honor). Implements the existing PvpMsg contract. AC: host-validated hits, the dead respawn at their nation camp, a 2-client sim passes. Files: `src/types/net.ts`, `src/net/*`, new `src/systems/Pvp.ts`, HUD frames. Dep: WP-06, WP-02.

**WP-08 Achievements and titles (2 D).** About 60 achievements (region exploration, metin kills, +9 upgrade, first M+ clear, kill counts), points, titles shown beside the name. AC: panel under the Character sheet, EventBus hooks, saved and migration-safe. Files: new `src/systems/Achievements.ts`, `src/data/achievements.ts`, `CharacterState.ts`, `CharacterPanel.ts`. Dep: none.

**WP-09 Professions MVP (3 D).** Mining, herbalism and woodcutting nodes (positions from `pois.ts` GATHER), skill 1-100, plus crafting Demircilik (ore to Kara Demir for upgrades) and Simya (potions). AC: nodes respawn, gathered materials feed `Upgrade.ts`, a recipe UI. Files: `src/systems/Professions.ts`, `src/data/materials.ts`, `src/data/benchRecipes.ts`, `src/entities/interactables/*`. Dep: none.

**WP-10 Daily loop (2 D).** Daily login streak, rested XP in villages (kills x2 up to 1.5 levels, quest XP unaffected), 6 rotating world quests per zone, random "daily dungeon" x2 reward. AC: reset at a fixed day key like `bountyDayKey`; the chore count stays at most 5 minutes per day. Files: `Bounties.ts`, `Progression.ts`, `Quests.ts`, HUD tracker. Dep: WP-04.

**WP-11 Capital and population feel (3 D).** Grow Kuzgunkale from 120 m to about 320 m with districts (Pazar, Forge, Gate), more ambient NPCs and shouting vendors, a lobby presence list on the minimap. AC: town stays within perf budget (≤ 400 draw calls), 40+ ambient NPCs. Files: `src/data/town.ts`, `src/world/TownBuilder.ts`, `Minimap.ts`. Dep: none.

**WP-12 Pets and collection panel (1.5 D).** A cosmetic follower with 12 pets from drops, achievements and events, and a collection tab for mounts, pets and titles. AC: one active pet, replicated, no combat effect. Files: new `src/data/pets.ts`, `Player.ts`, `Social` replication. Dep: WP-03, WP-08.

**WP-13 Economy sinks and item links (2 D).** Waypoint fee, repair cost, guild creation fee, Shift-click item links in chat, Pazar search and price history, plus the planned Basma Aktarma (+N transfer). AC: a gold-flow sim shows sinks at least 60 % of faucets at level 30; links render in chat. Files: `Vendor.ts`, `Market.ts`, `Chat.ts`, `Upgrade.ts`. Dep: none.

**WP-14 Castle siege and Bifrost reward (3 D).** A weekly 30-min "Kale Kuşatması" at a Karakır fortress: guilds fight over a banner, the holder gets a tax cut and a weapon skin, and the winning nation gets a timed boss zone. AC: scheduled by the WP-04 calendar, scored on the host. Files: `WorldEvents.ts`, `Pvp.ts`, `Guild.ts`, a new arena in `pois.ts`. Dep: WP-04, WP-05, WP-06, WP-07.

Not scheduled (too large): map 3 "Kadim Diyar" (levels 45-60); an authoritative server economy.

## 5. Sources

- Metin2 economy: https://tech4gamers.com/metin2-yang-guide/
- Metin2 upgrade guide: https://gamemarket.gg/news/metin2/metin2-item-upgrading-bonus-switching-guide-build-endgame-gear-without-going-broke
- Metin2 +9 anecdotes: https://steamcommunity.com/app/550900/discussions/0/3071999401487662090
- Knight Online maps and events: https://earlyguides.com/knight-online/maps
- Knight Online overview: https://en.wikipedia.org/wiki/Knight_Online
- Knight Online party/NP threads: https://steamcommunity.com/app/389430/discussions/0/357287935549835373
- WoW zone tiles: https://elijahketchersid.com/forums/thread-2062.html
- WoW retention research: https://www.artifex.org/~bonnie/WoW_retention_04_24_11.pdf
- WoW rested XP: https://www.warcrafttavern.com/guides/wow-classic-guide-to-rested-experience/
- WoW honor system history: https://massivelyop.com/2023/11/29/world-of-warcrafts-classic-servers-are-removing-honor-decay-altogether-with-the-next-weekly-maintenance/

Note: no web source gave exact Metin2 or Knight Online map sizes or +N percentages. Those figures are estimates; the in-game upgrade table is our own (`src/data/upgrades.ts`).
