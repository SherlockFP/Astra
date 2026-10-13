# Kadim Yarıklar (procedural dungeons) — status

Spec: `docs/GDD_PROCGEN.md` (+ CORE_MECHANICS §6, §13, §14, §16). Code: `src/world/procgen/*`. Check: `dev/combat-sim/procgen.mjs`.

## Plan and gap list (written first, updated at the end)

| GDD_PROCGEN asks | Exists before this work | Built now | Deferred |
|---|---|---|---|
| Pure seeded generator `generateFissure(spec) -> DungeonDef` (§4) | nothing (DungeonDef + builder + NavGrid + DungeonScene run any def) | `src/world/procgen/` (ids, themes, arenas, archetypes, generate, populate, tiers, index) | grotto theme (no boss pool), daily seed |
| Self-describing `dungeonId` so `getDungeon(id)` regenerates (D2) | `getDungeon` only knows static tables | id `fis.<theme>.<tier>.<lvl>.<seed8>.<v>`, `getDungeon` hook + LRU(3), optional `DungeonParams.fissure` | runtime defHash exchange (Q5) |
| 8-14 rooms, height tiers (floorY / ceiling / stair strips, step <= 0.45), corridors, connectivity, start, 2 guardians + final (§4.1, §5.1, CORE §13) | heightfield engine (`DungeonDef.vertical`) | spine + branches layout, tier random walk, stair corridors, boss rooms cloned from the classic dungeons' arenas | lifts, chasms, balconies |
| Packs from a theme pool scaled by tier and level, dormant / stealth / patrol / linked (§4.2, §5.3) | enemy ids + pack kit | 4 themes x 5 roles of pack templates, tier + level scaling, behaviours | `ow_*` grotto roster |
| Guardians + final from existing bosses (user decision; GDD §6 wanted 35 new BossDefs) | 12 classic BossDefs with scripts | 2 guardians + final per theme, arena = the boss's own baked arena (rect, props, zones, door anchors) | the 30 generic Elden-Ring guardians (GDD §6) |
| Difficulties Normal / Kahramanlık / Mitik, light modifiers, no keys/timer (§7, §8, D5) | `DIFFICULTY_MULT`, keystone flow | `FISSURE_TIERS`, 4 modifiers, fissure branch in `MythicPlus.enemyScaling`, completion guards (no keystone, no M0 flag, no per-seed clear flags) | `fm_cevik`, affix mods (`fm_ofke/guc/kan`) |
| Run ends when the final boss dies; exit portal + chest; guaranteed rare+ per boss (§9) | boss ChestRoll (Loot v3), `spawnReward`, portal | works through the same machinery (each boss rolls its chest, final flagged by highest `order`); fissure end-chest = gold/mats only | Yarık Kristali, named uniques table, daily bonus |
| Entry stone + small Turkish UI (§2, §11) | finder tabs, `PanelProp` stones | "Kadim Yarık Taşı" in town (`obj_yarik_tasi`) opens the finder on a new "Kadim Yarıklar" tab (theme, difficulty, level, preview map, reroll) | stones in open-world zones, daily tab |
| Headless check (§13 V1-V13) | `tools/content-check.mjs` | `dev/combat-sim/procgen.mjs` | `tools/fissure-check.mjs` full V1-V13 table |

## What was built

**Generator** (`src/world/procgen/`, pure, core RNG mulberry32, integer geometry, no trig / clock / Math.random; < 50 ms, p50 0.7 ms, p99 13 ms over 30 000 fuzzed maps, 0 failures):
- `ids.ts` id codec `fis.<theme>.<tier>.<level>.<seed8>.<v>` (self-describing: `getDungeon(id)` regenerates the same def on every peer; other `v` fails closed);
  `tiers.ts` FISSURE_TIERS (rooms, mods, HP/damage, unlocks), `fissureScaling`, item level, end rewards; `themes.ts` 4 themes (crypt, forge, frost, shadow: pack templates from
  GDD §5.3, props, Turkish room names); `arenas.ts` boss rooms cloned from the levelling dungeons; `archetypes.ts` generic rooms; `layout.ts` growth; `populate.ts`
  packs / props / chests; `generate.ts` orchestration; `index.ts` API + LRU cache.
- Plan: 8-10 / 10-12 / 12-14 rooms (+ connectors) = spine start -> fillers -> guardian 1 -> fillers -> guardian 2 -> fillers -> final, plus dead-end branches (treasure, shrine, chambers).
  A tree, so connectivity is by construction. Straight 2 tile wide connectors; room placement is a depth-first search (budgeted, retried with new RNG streams, reduced plan as the last resort).
- Height tiers (CORE §13): 2 m per tier (max 1 / 2), random walk with steps of at most one tier, every map uses all its levels, the final arena is on the highest spine tier.
  A connector between tiers is a stair strip (2 tiles per tier, starts at room a) + flat run; flat joins have |dy| = 0, so the 0.45 m rule only matters on stairs. `vertical: true`, `floorY`, `ceiling`, `slopes`.
- Bosses: pools per theme (crypt Kaldur / Morkan / Nefris -> Azrakel, forge Gürz / Ateşyürek -> Ignaroth, frost Ak Pençe / Ayaz Ana -> Tuğrul, shadow Nefris / Kevvas / Morkan -> Zakhar):
  two distinct guardians (random order) + the theme final. The arena is the boss's own room (BossController derives its arena from the baked rect + spawn offset, so the room has the same size, props, zones
  and the original door anchors; unused anchors stay walls). Orders 1, 2, 3; `boss_lock` into and `boss_exit` out of the guardians, `boss_lock` into the final (dead end).
- Population: 2-5 packs per chamber / hall (slots pushed out of door lanes), elite + chest in treasure rooms, a mixed pack + shrine in shrine rooms, 60 % small swarm in long flat corridors;
  tier and level scale pack sizes (n +2, h +3, m +3 on the melee rank, swarms +0/+2/+4, level >= 45 +1, <= 9 -1); crypt dormant bones, shadow stealth, hall patrols and linked pulls.
  Enemy count per run: n ~75 (45-117), h ~127 (79-196), m ~183 (134-257).
- Modifiers: 0 / 1 / 2 of Kalabalık Sürü, Zırhlı Sürü, Zalim Muhafızlar, Yarık Bereketi.

**Run flow**: Kadim Yarık Taşı (`obj_yarik_tasi`, terrace of the portal hall) -> Zindan Bulucu opens on tab "Kadim Yarıklar" (`ui/panels/game/finderFissure.ts`: theme cards + Rastgele,
Normal / Kahramanlık / Mitik cards with lock reasons, enemy level from the party level, preview map, modifiers, Yeniden Çevir) -> `buildFissureParams` -> `startRun` (host / offline;
`G.net.requestScene`) -> DungeonScene (unchanged apart from a log line and a toast) -> `MythicPlus` (non-M+: clock starts at once; fissure scaling; completion when all 3 bosses are dead,
which the gates force in order = "final boss dead") -> exit portal + chest as before. Each boss rolls the Loot v3 boss chest (ChestRoll: guaranteed rare+, pity, named, Yiğitlik Taşı; ctx
normal / heroic / mythic0, item level `fissureItemLevel`); the end chest pays gold, Büyülü Toz and Ejderha Pulu. Guards: no Mitik 0 flag / keystone, no `clear.<id>` or ladder flags
(one id per seed), `fis.clear.<tier>` / `fis.best.<tier>` counters instead (they unlock Kahramanlık and Mitik).

## Files
New: `src/world/procgen/{ids,tiers,themes,arenas,archetypes,layout,populate,generate,index}.ts`, `src/ui/panels/game/finderFissure.ts`, `dev/combat-sim/procgen.mjs`, this file.
Edited: `src/types/dungeons.ts` (FissureInfo, DungeonDef.fissure, ids; append-only), `src/scenes/scenes.ts` (DungeonParams.fissure?), `src/data/dungeons/index.ts` (getDungeon hook), `src/data/town.ts` (stone),
`src/scenes/TownScene.ts` (PanelProp data / prompt), `src/scenes/DungeonScene.ts` (hash log, toast), `src/systems/MythicPlus.ts`, `Bounties.ts`, `LootSystem.ts`, `src/scenes/world/Ladder.ts`,
`src/ui/panels/game/{finder,runStart,base,runSummary}.ts`, `ARCHITECTURE.md`, `HANDOFF.md`, `docs/GDD_PROCGEN.md` (implementation note).

## Checks
`node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/procgen.mjs [seeds=50]` (~11 s): id codec, determinism (byte-identical JSON, other seed / tier / level differs, independent of
Math.random / Date.now, no trig tokens), 50 seeds x 4 themes x 3 tiers (room counts, 3 bosses with the final last and a dead end, door graph tree, rect overlap, door geometry, heightfield steps
<= 0.45 m except stairs, floor levels, every enemy id and model, boss arena shift < 400 m, gates), the shared content validator `checkDungeon` + `checkVerticalDungeon` (0 errors), A* on the real
vertical NavGrid (start reaches every pack / boss / chest / exit; negative control without stairs fails), the real DungeonBuilder headless with stubbed assets (no errors, 5 gates, nav), the finder tab on
a fake DOM, getFissureDef cache / fail closed, scaling / unlock / reward rules.

## Deferred / open
- Grotto theme (`ow_*` roster has no boss pool), the 30 generic Elden-Ring guardians and 5 finals of GDD §6, daily seed, Yarık Kristali + named uniques tables, `fm_cevik` (needs `SpawnEnemyOpts.speedMult`)
  and the affix modifiers, FissureTracker HUD (the MythicTracker already shows the map name), stones in the open-world zones, `RoomAnnouncement.fv`, runtime hash exchange (the
  `[dungeon] fissure ... hash` console line is there for QA).
- Not verified visually (no browser pass yet): stone placement at (14, -37) on the terrace, the finder tab layout (reuses `fd-*` classes, no new CSS), stair strips and tall ceilings of the generated
  rooms, boss fights inside relocated arenas (scripts use arena-relative coordinates, checked on paper), party hash compare between two clients.
- Open: a client cannot start a Yarık (host only, like the other runs); no ready check for the party (the host moves everyone, as the keystone panel does for Normal).
