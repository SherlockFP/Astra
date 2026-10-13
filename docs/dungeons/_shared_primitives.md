# Season 1 shared primitives: canonical ids P-nn, one owner and one API each

Status: design v2, 2026-10-13. Docs only. Scope: the 8 Season 1 Mythic+ dungeon docs in this folder (`buyucu_terasi`, `kefaret_salonlari`, `les_uyanisi`, `peri_sisleri`, `taskasa`, `yanki_agi`, `yigitler_sarayi`, `yildiz_divani`). This file replaces the v1 draft (which used `SPX-nn`); section 2 keeps the old `SPX-nn` ids as aliases because `les_uyanisi.md` and `yildiz_divani.md` already cite them.

Facts were checked against the code on 2026-10-13 (`src/ai/bosses/kit.ts`, `src/types/dungeons.ts`, `src/types/enemies.ts`, `src/types/skills.ts`, `src/scenes/DungeonScene.ts`, `src/systems/MythicPlus.ts`, `src/systems/Affixes.ts`, `src/data/statuses.ts`, `src/data/dungeons/index.ts`, `src/data/dungeons/kit.ts`, `src/world/DungeonBuilder.ts`, `src/combat/poise.ts`, `src/ai/abilities.ts`, `src/ai/bosses/index.ts`, `src/types/audio.ts`, `src/types/vfx.ts`, `src/types/items.ts`). "Exists" below means the name is in the code today; anything else is new.

## 0. Rules and external plans

* **One id, one owner.** Every shared primitive is `P-nn`. Dungeon docs keep their local numbers (`NP-`, `P`, `SP-`, `S`, `YSP-`, `YS-`, `SPX-`, `YD-`); section 2 maps each local id to one or more `P-nn`. Implementation packages cite `P-nn` only.
* **Append-only types.** Additions to `StatusId`, `VFX_IDS`, `MUSIC_IDS`, `SFX_IDS`, `DoorDef.gate`, `PackDef.dormant.kind`, `HazardDef.kind`, `EntranceDef.look`, `PropPlacement.tag` are made once, in the package that owns the type (wave 1 for most), so later packages add data only.
* **Separate plans own some primitives.** This file does not restate them, it only references them:
  * `docs/ENGINE_VERTICALITY.md` (packages V1 to V13) owns the heightfield data shapes and geometry: P-09, and the shared parts of P-17 and P-19.
  * `docs/GDD_CREATURES.md` (packages CR1 to CR12) owns the move-set primitives (`MoveSpec`, section 3), the poise break spec (`EnemyDef.onBreak`, section 5) and the creature builders: P-39, P-40, P-41.
  * `docs/CORE_MECHANICS.md` section 13 (verticality), section 15 (loot), section 16 (creatures) are the rules these primitives implement. `GDD_CREATURES.md` exists (710 lines); the v1 draft's note that it did not exist is wrong.
* **Fallbacks.** Each primitive says what a dungeon does if it is late, so a dungeon stays buildable in reduced form.

## 1. Canonical primitives

Columns: the canonical API (data shape or function signature), the owner files (NEW = to create), and what the code has today.

### 1.1 Data, content and registries

| ID | Primitive | Canonical API / data shape | Owner files | In code today |
|---|---|---|---|---|
| **P-01** | Enemy kit module | `src/data/enemyKit.ts` (NEW) exports `def, add, boss, derive, bp, custom, MECH, cone, proj, aoe, line, heal, buff, charge, summonAb, passive, onDeath, NOOP, bleed, poison, burn, chill`, the `A_*` anim sets, the `R_*` resist tables, hide lists (`KNIGHT_HIDE`, `ROGUE_HIDE`, `mageHide`) and model helpers. `enemies.ts` imports them (no behaviour change). Per-dungeon defs live in flat files `src/data/enemies_<dungeonId>.ts` and are registered by `enemies.ts`. | `src/data/enemyKit.ts` (NEW), `src/data/enemies.ts` | The builders are private inside `enemies.ts` (1469 lines). No `enemyKit.ts`. |
| **P-02** | Model and prop fallback table | `src/data/enemyModels.ts` (NEW): `MODEL[key] = { fallback, final }`, `USE_FINAL_MODELS`, `M(key)`. Props: a `gen_props` entry may carry `fallback: { model, scale, tint, emissive? }` and placement uses it while the final GLB is missing. Content check: every model key resolves. | `src/data/enemyModels.ts` (NEW), `src/data/enemyKit.ts` | None. |
| **P-03** | Pack helper | Extend the existing `pack()` in `src/data/dungeons/kit.ts` (line 68, `MemberTuple` form): optional `forces` (sum of member `EnemyDef.forces`, auto when absent), `front` / `back` rank arrays laid out on the sunflower table. `pk()` (Leş), `packN()` (Yanki) and the v1 `pack()` (Yıldız) become aliases. | `src/data/dungeons/kit.ts` | `pack()` exists (no forces, no ranks). |
| **P-04** | Decor kit helpers | In `src/data/dungeons/kit.ts` (same package as P-03): `balcony(rectTiles, y, n, opts)` (non-walkable `choir_balcony` / `gothic_balustrade` modules), `chandelier(...)`, `banner(...)`, and the per-room dressing recipe. ENGINE V3 adds `tall / plateau / stairs / ramp / lift` to the same file (see G-ENG-V3). | `src/data/dungeons/kit.ts` | None of these. |
| **P-05** | Season pool and difficulties | `src/data/dungeons/index.ts`: `MPLUS_POOL: string[]` (the 8 season ids, rotation order); `DUNGEON_IDS` stays the levelling list (4 ids). `DungeonDef.season?: number`, `DungeonDef.endgame?: boolean` (no Normal). `dungeonDifficulties(id)`: pool dungeons get Kahramanlık / Mitik / Mitik+. `MythicPlus.dungeonPool()` reads `MPLUS_POOL` (fallback `DUNGEON_IDS` while empty). Keystone draw, portal list, Group Finder M+ tab, leaderboards and rating sum read the pool. | `src/data/dungeons/index.ts`, `src/systems/MythicPlus.ts`, `src/types/dungeons.ts` | `dungeonPool()` filters `DUNGEON_IDS` (MythicPlus.ts line 543). No pool registry. |
| **P-06** | Music, VFX and SFX ids | `MUSIC_IDS` (`src/types/audio.ts`, closed `as const` list) gains `dungeon_<id>` entries that alias an existing track until one is composed; `VFX_IDS` (`src/types/vfx.ts`) gains the union of new visuals; `SFX_IDS` gains new sounds; every new id has an alias in `src/vfx/aliases.ts` / `src/audio/aliases.ts`. Audio file names are not ids (Yiğitler section 2.9). Unknown ids stay silent. | `src/types/audio.ts`, `src/types/vfx.ts`, `src/vfx/aliases.ts`, `src/audio/aliases.ts` | `MUSIC_IDS` has 16 ids, no season dungeon ids. The planned VFX names (`ambient_stardust`, `arcane_orb`, `void_torrent`, `web_burst`, `egg_burst`, `swarm_cloud`, `black_blood`, `static_field`, `storm_flash`, `ambient_leaves`, `rune_pad_glow`) are not in `VFX_IDS`. |
| **P-07** | Positional ambience emitters | `RoomDef.ambience?: { id: SfxId; pos?: [number, number]; radius: number; volume: number; loop?: boolean; every?: [number, number] }[]`; shorthand `PropPlacement.sfx?` on one prop. The builder creates them; the scene ticks them by distance. | `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts`, audio player | None. |
| **P-08** | Sky, moon, cloud sea, open air | `DungeonTheme.sky?: { image?: string; stars?: boolean; fallback?: SkyOptions }`; `RoomDef.sky?` (per-room, blends like fog); `DungeonTheme.moon?: { color; intensity; dir? }`; `DungeonTheme.cloudSea?: { y; color; speed }`; `RoomDef.openAir` is ENGINE V1's name (no ceiling cap, sky backdrop). The `Sky` class draws a dome that follows the camera; flat fog colour is the fallback. | `src/types/dungeons.ts`, `src/world/Sky.ts`, `src/world/DungeonBuilder.ts` | `Sky` class exists. `DungeonTheme` has no sky, moon or cloud sea. `RoomDef.openAir` comes from V1. |
| **P-09** | Verticality (heightfield) | **Owner: `ENGINE_VERTICALITY.md` V1 to V13; its section 3 shapes are canonical.** `DungeonDef.vertical`, `DungeonDef.lifts: LiftDef[]`, `RoomDef.floorY`, `RoomDef.ceiling`, `RoomDef.heightAreas`, `RoomDef.slopes: SlopeDef[]` (kind `stairs` or `ramp`), `RoomDef.tiers: DecorTier[]`, `RoomDef.openAir`, `ZoneDef.fall: 'open' \| 'kill'`, `ZoneDef.depth`. Dungeon docs' `stairs`, `ramp`, `rampZone`, `terraces`, `galleries`, `strips`, `wallScale` are aliases of these (section 4). Flat fallback: leave `vertical` unset. | ENGINE files (V1 `src/types/dungeons.ts`, `src/world/Heightfield.ts`; V2 to V13 as listed there) | No `floorY`, `slopes`, `tiers`, `LiftDef` in code. The camera already calls `G.world.groundY(x, z)`; the heightfield behind it is not built. |
| **P-10** | Entrance looks and recipes | `EntranceDef.look` widens from the current 5-value union (`crypt \| forge \| cave \| ice \| temple`) to a string union that gains one value per dungeon (`palace`, `arcane`, `grove`, `web`, `valor`, `temple` large variant as used by the docs). `ENTRANCE_RECIPES: Record<string, (e: EntranceDef) => TownProp[]>` in NEW `src/data/world/entrances.ts`, moving the existing crypt/forge recipe builder there (locate it with `grep -rn "'forge'" src`). `PORTAL_TINTS` and the map icon colour per look. | `src/types/dungeons.ts`, `src/data/world/entrances.ts` (NEW), the current recipe file | `EntranceDef.look` union has 5 values (types/dungeons.ts line 256). `src/data/world/entrances.ts` does not exist. |
| **P-11** | Art kit v2 | `WallStyle` and `FloorStyle` gain the doc styles (`grove`, `gorm`, `moss`, `marble`, `arcane`, `library`, `earthen`, `earthen_dark`, `nerub`, `web_stone`, `parapet`, ...) registered in `WALL_STYLES`, `FLOORS`, `DECOR`, `dungeonAssetUrls`. `RoomDef.style?: { floorTint?; wallTint? }`; `RoomDef.atmosphere?: string` with `DungeonDef.atmospheres` (fog blend between rooms). `wallScale` is retired: height is `ceiling` (P-09). | `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts` | `WallStyle`: stone, brick, cave, temple, ice, forge. `FloorStyle`: 8 values (types/dungeons.ts lines 14 and 15). |
| **P-12** | Dungeon events and conditional doors | `DungeonDef.events?: Record<string, boolean>` (initial flags). Host store `G.dungeonEvents` with `get / set / on`, replicated by a `dungeon_event` net message, cleared on `scene:leaving`. `DoorDef.gate` gains `'event_lock'` (`event: string`), `'kill_lock'` (`opensOn?: { pack?; enemyId?; boss? }`), `'device_lock'` (`device: string`); `DoorDef.requires?: string[]` (open when every listed pack is dead). One resolver: `DungeonScene.gateShouldBeOpen` (DungeonScene.ts line 706) reads all of them. | `src/scenes/DungeonScene.ts`, `src/systems/DungeonEvents.ts` (NEW), `src/types/dungeons.ts`, `src/types/net.ts` (after CR1) | `DoorDef.gate` is `none \| open \| boss_lock \| boss_exit \| forces_lock` (types/dungeons.ts line 109). No event store. |
| **P-13** | Gate styles | `DoorDef.gateStyle?: 'portcullis' (default) \| 'arcane' \| 'fel' \| 'wood' \| 'thorn' \| 'bone' \| 'web' \| 'stone'`. The gate builder picks mesh and material; `arcane` and `fel` generalise the `StartBarrier` look. | `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts` | `src/scenes/StartBarrier.ts` exists. The gate mesh builder is in the builder (locate `makeGate`). |
| **P-14** | Interactable framework | NEW files in `src/entities/interactables/`: `DungeonNpc.ts` (`{ id, name, model, lines?, requires?: { classes?, professions? } (any-of), holdSeconds?, onInteract(ctx) }`, data in `extras.npcs`, greyed prompt "Gereken: ..." when unmet, request to host with the `CursedChest` `sendRequest` pattern), `ChannelGate.ts` (hold F within 3.5 m, damage cancels, plays the `Open` clip, calls `EnemyDirector.alertNear`). Devices: `PropPlacement.tag: 'device'`, `device?: string` into NEW `src/data/devices.ts`. | `src/entities/interactables/*` (NEW files, `index.ts`), `src/data/devices.ts` (NEW) | `CursedChest`, `Shrine`, `FontOfPower`, `PanelProp`, `Portal` exist. No `DungeonNpc`, `ChannelGate`, `src/data/devices.ts`. |
| **P-15** | Boons, stations, transits, winches | `extras.boons?: { id, pos, status, duration, magnitude?, oncePerPlayer?, persistOnDeath?, cooldownSec? }[]` (applied locally to the user's player). `extras.stations?` (BuffStation, one use per run per player). `extras.transits?` (TransitCart: two stops, rides on the host). `extras.dropProps?: { id, pos, ring, dmgPctMax, eliteCap, stun, playerCoef, winch: Pt }[]` (hold-interact winch drops a prop: damage and stun inside the ring, replicated `drop` event). | `src/entities/interactables/BoonPad.ts`, `BuffStation.ts`, `TransitCart.ts`, `DropWinch.ts` (NEW), `src/types/dungeons.ts` (`DungeonDef.extras`) | `DungeonDef.extras` has `fontOfPower`, `shrines`, `riftSpots`, `chests` only. |
| **P-16** | Dormant pack kinds and wake | `PackDef.dormant.kind` (types/dungeons.ts line 125 already has `'bones' \| 'coffin' \| 'egg' \| 'ceiling'`) gains `'statue'` (stone tint `0x8a8898`, frozen on frame 0 until wake, grey `death_bones` burst). `PackDef.wakeWhen?: { cleared: string[]; delay? }`. `ceiling`: the pack drops from a ledge (scripted `forcedMove`, `leap_land`, 0.2 shake) and joins the region from the landing point. `egg`: the wake prop is swapped for a broken shell with `egg_burst` and 0.3 camera shake. The wake itself is the generic `EnemyAI` dormant mode. | `src/types/dungeons.ts`, `src/scenes/PackWatch.ts`, `src/world/DungeonBuilder.ts` | `egg` and `ceiling` are in the type. Generic dormant wake exists (`EnemyAI.ts` lines 382 and 483). `statue` and `wakeWhen` do not. Egg visuals do not. |
| **P-17** | Hazards, storms, grounding, zone looks | `HazardDef.kind` gains `'debris_fall' \| 'plague_vent' \| 'lightning_strike'`. `HazardDef.groundedBy?: { pos: [number, number][]; radius; status? }` (a strike within `radius` of a rod is cancelled and players near the rod gain `status`). `RoomDef.storm?: { every: [number, number]; color; strength }` (0.12 s hemisphere and background flash, delayed `lightning_impact`). `ZoneDef.look?: 'cloud' \| 'abyss'`. Zone `fall` and depth come from P-09. | `src/scenes/Hazards.ts`, `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts` (storm light) | `HazardDef.kind` is `lava_burst \| icicle_drop` (`DungeonHazards` in `src/scenes/Hazards.ts`). |
| **P-18** | Set-piece breakables | `PropPlacement.onBreak?: { zone: { radius; duration; status: StatusId; ignitesOnFire? } }` on `tag: 'breakable'` (a spill puddle). Statuses `mead_sticky` and `rod_charged` are P-21 rows. | `src/scenes/PropGameplay.ts` (breakable path), `src/types/dungeons.ts` | Breakables exist (PropGameplay.ts line 72). No spill zone. |
| **P-19** | Animated props and light shafts | `PropPlacement.spin?: number` (deg/s about Y), `spinNode?: string`, `bob?: [amp, hz]`, `tag: 'lightshaft'` (additive cone or box, default 3 x 8 x 3 m, `tint`, `opacity` 0.12 to 0.25, drifting motes, no real light). Placement `hang`, `nocollide`, `absY` come from ENGINE V2 (not duplicated). The builder registers updaters; the scene ticks them. | `src/types/dungeons.ts`, `src/world/DungeonBuilder.ts`, `src/scenes/DungeonScene.ts` (ticker) | `PropPlacement` has `y`, `tint`, `opacity`, `light`. No spin, bob or lightshaft. |
| **P-20** | PROC bodies and MECH defs | Procedural builders in `src/ai/procModels.ts` (flat-shaded, PSX patch, few segments, tween-animated) and `MECH(...)` registrations in NEW `src/data/enemies_mech.ts`: `eye_orb`, `proc_beacon`, `proc_volatile_spike`, `proc_crystal_shard`, `proc_energy_orb`, `sinstone_shard`, `sinstone_statue`, `parishioner`, `energy_orb` (each dungeon doc names its own subset). | `src/ai/procModels.ts`, `src/data/enemies_mech.ts` (NEW) | `src/ai/procModels.ts` exists. Verify each id against it before a package starts. |
| **P-21** | Statuses batch and hooks | One append-only batch: `StatusId` (`src/types/skills.ts` line 107), `STATUSES` and `STATUS_RULES` (`src/data/statuses.ts`), using the Turkish names of the docs. Existing rule fields: `stack`, `perMag`, `takenMore`, `healMult` (number or function). New fields: `takenMorePerStack`, `onExpire?: { shape, radius, coef, type }` (not on dispel), `onDodge?: { removeStacks }`. Remote reads of `Player.statuses` and persisted statuses on `HitShapeSpec.persist` (verify, Leş SP-10). | `src/types/skills.ts`, `src/data/statuses.ts`, `src/combat/statusesFeel.ts` (icons and feel), `src/combat/Combat.ts` (hooks, after CR5) | `StatusId` is a closed union. `takenMore` and `healMult` exist. None of the planned ids exist (checked: `petrify`, `mortal_wound`, `disguise`, `bewitch`, `exposed`, `kin_laneti`, `asit_yarasi`, `arcane_lockdown`, `withering_soul`, `deep_wound`, `ys_intensity`, `ay_cesmesi`). |
| **P-22** | Numeric ability params | `EnemyAbility.params` (`Record<string, number>`, types/enemies.ts line 20 onward) gets these keys, no new type: `targets` (N ground circles on N random players), `count`, `chain`, `chainRange`, `chainMul` (projectile jumps), `ramp`, `rampMax` (per-use coefficient growth, reset on leaving combat), `los` (`HitShapeSpec.requireLoS`, each peer checks `nav.lineOfSight`), `leech`, `leechCapPct`, `suicide`, `ranged` (skips the melee-slot gate in `EnemyAI.usable`), `interruptsCast` (silence lockout), `fuse` (delayed ground detonation), `stunOnBlock`, `minTargets`. Tank helpers: `tankOf(enemy)` and `pickPlayers(c, n, avoid)` (`isTank` and `pickPlayers(avoidTank)` exist in `src/ai/bosses/kit.ts`). `followUps` and all string-like params are aliases of P-40. | `src/ai/EnemyAI.ts`, `src/ai/abilities.ts`, `src/ai/bosses/kit.ts`, `src/dev/contentCheck.ts` (after V3) | `params` exists. None of the keys above is read anywhere yet (grep before each package). |
| **P-23** | Must-answer metadata and icons | `EnemyAbility.kick` (exists, `0 \| 1 \| 2`) gets a nameplate and cast-bar priority icon. NEW `EnemyAbility.dispel?: StatusId` (the debuff that must be cleansed; green mark on nameplate and tooltip). `contentCheck` warns when an `interruptible` ability has no `kick`, or when `dispel` names an unknown status. | `src/types/enemies.ts`, the cast-bar and nameplate UI (locate with `grep -rn "castTime"`), `src/dev/contentCheck.ts` | `kick` exists. `dispel` does not. |
| **P-24** | Call for help | Ability param `callRadius` (metres). When `> 0`, casting the ability calls for help: `EnemyAI.callForHelp(radius, sameRoom?)` pulls every idle enemy and pack within the radius onto the target through `EnemyDirector.pullPack`. | `src/ai/EnemyAI.ts`, `src/ai/EnemyDirector.ts` | None. |
| **P-25** | Trash script registry and ally aura | NEW `src/ai/trash/index.ts` merges per-dungeon tables `TRASH_CUSTOM` and `TRASH_PASSIVES` into `CUSTOM` and `PASSIVES`. Passive factory `allyAura({ radius, interval, status, seconds })`. Shared-passive aliases (Peri S8) are registered here. | `src/ai/trash/index.ts` (NEW), `src/ai/abilities.ts` | `CUSTOM` (line 75) and `PASSIVES` (line 212) are plain records. No merge point. |
| **P-26** | Mythic+ rules | `MythicPlus.grantForces(n, reason)`: host only, adds to forces, capped at `forcesRequired`, calls `fx.onForces`, toast. Dynamic events use only this. `extras.affixSafe?: { x, z, r }[]` (volcanic, storming, explosive and spiteful spawn points skip them). Encounter adds with `rank 'miniboss'` or `tag 'encounter_boss'` take Tyrannical and not Fortified. | `src/systems/MythicPlus.ts`, `src/systems/Affixes.ts` (after V12), `src/types/dungeons.ts` | `forces` state exists (MythicPlus.ts line 33). No `grantForces`, no `affixSafe`. Tyrannical and Fortified scale by `isBoss` only (`scalingFor`, lines 300 to 307). |
| **P-27** | Seasonal Kibirli | Extend the existing seasonal affix `seasonal_efsun` (Efsunlu Yarık, `src/data/mythicAffixes.ts`; handler in `src/systems/Affixes.ts`). Its thresholds `t1..t4` are already 0.2 / 0.4 / 0.6 / 0.8. The Kibirli spawn: an elite `kibir_tecessumu` (4 x trash HP, 0 forces, CC-immune) at `extras.riftSpots` at least 15 m away. Kill within 60 s: +10 % damage and +10 % move speed for 60 s. See section 5, decision 1, on the name. | `src/data/mythicAffixes.ts`, `src/systems/Affixes.ts` | `seasonal_efsun` exists with rift guardians, `killWindow: 45`, `buffDuration: 60`. The Kibirli spawn does not exist. |
| **P-28** | M+ checkpoints | `extras.checkpoints?: [number, number][]` (tile coordinates). In M+ a death releases at the latest checkpoint whose boss is dead. The +15 s penalty is unchanged. Hook: the `player:releaseRequested` handler in `DungeonScene`. | `src/scenes/DungeonScene.ts`, `src/types/dungeons.ts` | M+ always releases at the dungeon start (DungeonScene.ts lines 817 to 825). `checkpoint` there is the Diriliş Taşı stone, which is a different thing. |
| **P-29** | Content check and pace tools | `tools/content-check.mjs` rules: pack `forces` equals the sum of its members; `forcesRequired` is 100 to 103.5 % of the mandatory route; `bosses.length >= 3`, group-aware; every pack, boss, loot, device and model id resolves; every `boss_lock`, `event_lock`, `device_lock` pair resolves; door tile height pairs and slope ends per ENGINE V3; trash windup rule per GDD_CREATURES section 1.2; registries derived from `ENEMIES` and `BOSSES`. NEW `tools/mplus-pace.mjs <id>`: pull table, cumulative forces %, timer estimate. | `tools/content-check.mjs`, `src/dev/contentCheck.ts` (ENGINE V3 owns E1 to E10), `tools/mplus-pace.mjs` (NEW) | `tools/content-check.mjs` exists (headless, needs Node 22.18+). The pace tool does not. |
| **P-30** | Loot, uniques, consumables | `LOOT_TABLES` rows per boss with `named?: string[]` and `namedChance?`; `UniqueDef` entries with `special` ids `leg_<dungeon>_*` read through `G.character.hasSpecial` in combat procs; consumables such as `potion_panzehir` (cleanses one debuff, shares the 60 s potion cooldown). Trinket slots are not in this plan (section 5, decision 2). | `src/data/loot.ts`, `src/data/uniques.ts`, `src/data/items.ts` | Loot tables and uniques exist. Verify `hasSpecial` before use. |

### 1.2 Boss kit (`src/ai/bosses/*`)

Existing helpers in `src/ai/bosses/kit.ts`: `circle`, `ring`, `beam`, `band`, `wedge`, `zone`, `dashLine`, `statusPlayer`, `pickPlayers`, `farthestPlayer`, `playersIn`, `every`, `floatOver`, `spawnMech`, `makeInvulnerable`, `busyTarget`, `trapPlayer` / `updatePrisons` / `clearPrisons`. `BossController` is `src/ai/BossController.ts` (557 lines). `BossScript` is `src/ai/bosses/types.ts`. Boss scripts are registered in `src/ai/bosses/index.ts` (`BOSS_SCRIPTS`, `BOSS_SPAWNS`).

| ID | Primitive | Canonical API | Owner files | In code today |
|---|---|---|---|---|
| **P-31** | Boss orchestration | `BossPlacement.awaken?: { enemyId; count }` with `BossScript.onAwaken` (boss starts dormant: invulnerable, untargetable, shows `dormantModel`). `BossPlacement.pull?: 'aggro' \| 'interact'` with `pullProp`. `BossPlacement.group?: string` (paired bosses engage, reset and die together, one loot roll, M+ `bossesTotal` counts groups). `BossScript.lockLimit?: number` (default 150 s). `encounterAdd(c, defId, pos, { hpMult, tag })`, `addDash`. `c.prop(id)`: `setOpen`, `setGlow`, `setVisible`, `swing`, replicated with `bossMsg('prop', ...)`. Helpers from Leş SP-04: `lineHit`, `banish`, `teleportTo`, `setHover`, `cancelBusy`. | `src/ai/BossController.ts`, `src/ai/bosses/types.ts`, `src/ai/bosses/kit.ts`, pairing in `src/scenes/DungeonScene.ts` | None of `awaken`, `group`, `lockLimit`, `encounterAdd`, `c.prop` exist (grep). |
| **P-32** | Intermission | `intermission(c, { dur, teleportTo?, onStart?, onTick?(dt, t), onEnd?, maxSeconds?, addWaves?, survivorPenalty? })`: immune, frozen, timer, safety net and `endMechanicPhase`. Generalises the Zakhar ritual and `beginPhylactery` / `endPhylactery`. | `src/ai/bosses/patterns.ts` (NEW), re-export from `src/ai/bosses/kit.ts` | The pattern exists inside `golge.ts` and `kemik.ts`. No generic helper. |
| **P-33** | Beams, bands, tracked lines | `rotatingBeams(c, { origins: Pt[] \| { x, z, n }, speedDeg, dirs?, length, width, coef, dur, reverseAt?, step?, type?, name, scaleTo?, spin? })` with `updateRotatingBeams`; `trackBeam(c, from, target, { lockAt, delay, length, width, coef })`; `movingBand(c, { from, to, width, speed, coef, stun?, name })`; `breathBand(c, from, dir, len, width, delay, coef, { cover, coverRadius, cap?, ... })` (moves the buzul breath out of `startBreath`). `HitShapeSpec.persist.scaleTo?` and `HitShapeSpec.spin?`. | `src/ai/bosses/patterns.ts`, `src/combat/HitShapes.ts` (after CR2 and ENGINE V10) | `beam`, `band`, `dashLine` exist (single shot). No rotating, tracked or moving variants. `startBreath` is local to `buzul.ts`. |
| **P-34** | Soak, mark, cleanse | `soak(c, { slots: [{ x, z, r, at }], need, coef, onFail, onPass })` replaces `soakCircle`, `soakSlots`, `soakPad` (aliases kept one release): yellow display telegraph cancelled before landing, host `playersIn` check at expiry. `markPlayers(c, players, { delay, r, coef, type, name, toast, beamTo?, onExpire? })`. `cleanseSpot(c, { x, z, rMin, rMax, hold, cooldown, status })` with `removeStatusPlayer(p, status)` (alias `clearStatusPlayer`). | `src/ai/bosses/patterns.ts` | `playersIn` exists. The rest does not. The zakhar seals in `golge.ts` are the pattern. |
| **P-35** | Orbs, fixate, watch zones, pull vs root | `spawnOrb` (Affixes has a local function of the same name: import the boss version as `bossOrb`), `roamingOrb(c, { x, z, dir \| 'seek', speed, life, r, coef, type, once? })`, `updateOrbs(c, dt, { touchR, onTouch, onArrive })`, `clearOrbs(c)`; `fixate(c, target, { seconds, speed, catchR, onCatch })` with `EnemyDef.ai.fixate` and `spawnAdds(..., { fixate })`; `watchZone(c, { x, z, r, duration, once, tag, onEnter(p) })` with `updateWatchZones`, `clearWatchZones` (`roamZone` is the moving variant); `ForceSystem` skips `pull` forces for players with `root`. | `src/ai/bosses/orbs.ts` (NEW), `src/ai/bossNet.ts` | No fixate, watch zone or boss orb in kit. `EnemyAiHints` exists (`ai?` on EnemyDef). |
| **P-36** | Boss shields, health links, tethers, player links | `bossShield(c, pct)` and `shieldUp(c)` (the existing `shield` status, magnitude = max HP x pct); `linkHealth(c, bodies, { absorb? })` (shared HP, one death kills the group); `tether(c, player, entity, { dur, onBreak, onExpire, touchR })`; `linkPlayers(c, pids, { r, coefBase, tick, dur, release })`. | `src/ai/bosses/links.ts` (NEW) | `shield` is a StatusId. Nothing else exists. |
| **P-37** | Images, group status, raid pulses, corpse blasts | `imageSpawn(c, defId, p, { tag, max, hpMult })` with `imageEach(c, tag, fn)`; `statusAll(c, status, duration, o?)`; `raidPulse(c, coef, type, name)`; `corpseBlast(c, { r, coef, delay, name?, type? })` (claims corpses on resolve). | `src/ai/bosses/patterns.ts` | None (`corpseNear` exists for trash, in `abilities.ts`). |
| **P-38** | Boss energy | `BossDef.energy?: { max; start?; regen (negative = drain); onFull?: string; onEmpty?: string; costs?: Record<string, number> }`; `BossController.energy` with `set / add / pause`; `bossMsg('boss_energy', { v })` every 0.25 s drives a cyan second bar in the boss frame. | `src/ai/BossController.ts`, `src/types/enemies.ts` (BossDef), boss frame UI | None. |

### 1.3 Enemy mechanics (trash and bosses)

| ID | Primitive | Canonical API | Owner files | In code today |
|---|---|---|---|---|
| **P-39** | Poise breaks for elites and bosses | **No new posture system.** The bar is the engine's existing poise: `src/combat/poise.ts` (`poiseMax`, `breakLock`, `breakSeconds`, `finisherPctMaxHp`) and `EnemyDef.poise`, `poiseRegen`, `poiseDelay`, `hyperArmor`, `stanceBreakable`. GDD_CREATURES section 5 adds `EnemyDef.onBreak?: BreakSpec` (cancels windups, disables abilities for `disableSec`, `cdAdd`, `spawn`); dungeon defs set it per creature. Boss side: `BossScript.onBreak?(c)`, called by the same break event. Scripted phases and immune states cannot break. Parry and heavy values: GDD_CREATURES section 5.1. | `src/combat/poise.ts`, `src/combat/Combat.ts` (CR5), `src/ai/bosses/types.ts` (hook) | Poise exists (`EnemyDef` fields in types/enemies.ts). `onBreak` is not in types yet. |
| **P-40** | Move-set strings, holds, leaps (trash and bosses) | `EnemyAbility.move?: MoveSpec` (GDD_CREATURES section 3 and Appendix A): `string?: StrikeStep[]`, `hold?: [min, max]`, `leap?`, `rush?`, `grab?`, `marks?`, `tokens?`, `sync?`. Builders `string()`, `delayed()`, `jumpSlam()`, `rush()`, `grab()`, `marks()` in `src/data/creatures/moves.ts`. Every dungeon string form is an alias: `params.hits` and `c2/w2/hold2` (Kefaret P18), `params.chain/t2/c2/t3/c3` (Taşkasa SP-24), `followUps` (Yiğitler SP-12), `chain()` and `leap()` (Yanki YSP-17). None of them is a separate field. | `src/ai/moves.ts` (CR4), `src/data/creatures/moves.ts` (CR6), `src/types/enemies.ts` (Appendix A) | Not in code (GDD_CREATURES waves 2 and 3). |
| **P-41** | Boss-side move bridge | `bossString(c, steps, { target, hold?, cancelOnBreak? })`, `bossHold`, `bossLeap`: thin wrappers that run the P-40 `MoveRunner` from `BossController` through an adapter to the `Busy` object. One interpreter, not a second one. Boss abilities keep the same `EnemyAbility` shape. | `src/ai/bosses/moveBridge.ts` (NEW) | None. |

### 1.4 Single-dungeon systems (owned by one doc, listed to avoid id clashes)

| ID | Primitive | Canonical API | Owner | Files |
|---|---|---|---|---|
| **P-42** | Gaze patrol | `extras.gaze?: GazeDef[]` (`{ id, pos, facing, sweep?, cone: { radius, angle }, returnTo, grace }`) | Büyücü Terası only | `src/systems/GazePatrol.ts` (NEW), `src/scenes/DungeonScene.ts` |
| **P-43** | Sigil puzzle and choice doorways | `MazeDef`, `rollSigils(rng, keyLevel)` | Peri Sisleri only | `src/systems/SigilPuzzle.ts` (NEW), `src/types/dungeons.ts` |
| **P-44** | Door-less exile rooms | `RoomDef.exile?: true`: builder and scene accept a room with no doors (hidden from the map, excluded from route forces, its nav grid isolated) | Leş Uyanışı only | `src/world/DungeonBuilder.ts`, `src/types/dungeons.ts` |

## 2. Mapping: each dungeon's local ids to canonical P-nn

Read the cell as "local id (what it is)" and check the owner doc for detail. `-` means the doc has no equivalent. A name in parentheses without an id means the doc describes it in a section, not in a table. Where a local row bundles several primitives, every P-nn is listed. The Yıldız column shows the canonical `SPX-nn` it already uses, and the v1 local id in parentheses.

| P | Büyücü (`NP-`) | Kefaret (`P`) | Leş (`SP-`) | Peri (`S`) | Taşkasa (`SP-`) | Yanki (`YSP-`) | Yiğitler (`SP-`) | Yıldız (`SPX-`, v1) |
|---|---|---|---|---|---|---|---|---|
| P-01 enemy kit | NP-16 | P7 (part) | SP-01 | S1 | SP-01 | YSP-01 | - | SPX-01 |
| P-02 model fallback | - | - | SP-F1 | - | - | - | - | - |
| P-03 pack helper | - | - | SP-07 | - | - | YSP-02 | - | SPX-02 (`pack()`) |
| P-04 decor kit | - | P19 | - | - | - | - | - | - |
| P-05 season pool | NP-18 | P1 | SP-14 | S10 | SP-18 | (pool row, 6.x) | SP-7 | SPX-03 (SP-13) |
| P-06 music, VFX, SFX | NP-14 (music), NP-15 | P16 | SP-11 | S11 | (2.8, no id) | YSP-11, YSP-12 | SP-9 | SPX-04 (SP-10) |
| P-07 ambience emitters | - | P20 | SP-11, SP-V2 | - | - | - | - | - |
| P-08 sky, moon, cloud sea | NP-14 (sky) | P12, 2.6 | 2.4 (sky) | 2.4 (sky) | 2.4 (sky) | 2.4 (sky) | SP-1 | SPX-05 (SP-05) |
| P-09 verticality | 3.2b | P11, P17 | SP-V1, SP-V3 (no 8.1 row for SP-09) | S14 | SP-22, SP-23 | YSP-16 | SP-10 | SPX-07 (new in v2) |
| P-10 entrance | NP-17 | P10 | SP-12 | S12 | (section 7, no id) | YSP-14 | SP-8 | SPX-33 (SP-09) |
| P-11 art kit v2 | NP-14 (styles) | - | SP-02 | S2 | SP-12 | YSP-13 | - | - |
| P-12 events, conditional doors | NP-01 | - | SP-03 (`device_lock`) | - | - | YSP-03 | - | SPX-08 (SP-02) |
| P-13 gate styles | - | - | - | - | - | YSP-03 (gate theme) | - | SPX-09 (SP-06) |
| P-14 interactable framework | - | - | SP-03 (devices) | S7 | - | YSP-09 | - | SPX-10 (SP-03) |
| P-15 boons, stations, transits, winches | NP-04 | - | - | - | SP-13, SP-14 | - | - | SPX-10 (boons, winches) |
| P-16 dormant kinds | NP-02 | P2 | - | S13 | - | YSP-15 | - | SPX-12 |
| P-17 hazards, storms, rods | - | - | SP-06, SP-V3 (zone looks) | - | - | - | SP-2, SET-15 | - |
| P-18 set-piece breakables | - | - | - | - | - | - | SP-13, SET-16 | - |
| P-19 spin, bob, light shafts | - | P9 | SP-V2 | - | SP-16 | - | - | SPX-27 |
| P-20 PROC bodies | NP-07 (PROC part) | P8 | - | - | SP-15 | YSP-11 (part) | - | SPX-26 (SP-12) |
| P-21 statuses and hooks | NP-13, NP-20 | P6 | SP-05, SP-10 | S3 | SP-09 (stacking), SP-21 | YSP-06 | - | SPX-24 (SP-08) |
| P-22 numeric ability params | NP-05 | - | - | - | SP-09 (tank), SP-17 | YSP-08 | SP-12 (fuse, stunOnBlock, minTargets) | SPX-23 (SP-07) |
| P-23 must-answer UI | - | - | - | S4 | SP-10 | - | 4.4 (no id) | SPX-23 (kick icons) |
| P-24 call for help | - | - | - | - | - | YSP-07 | - | - |
| P-25 trash registry, ally aura | - | P7 (part) | - | S8 | - | - | SP-6 | SPX-28 |
| P-26 M+ rules (forces, affixSafe, Tyrannical adds) | - | - | - | - | SP-19 (affixSafe) | - | SP-5 (Tyrannical) | SPX-11 (SP-04, `grantForces`) |
| P-27 seasonal Kibirli | - | P14 | - | - | - | - | - | SPX-31 (CM7) |
| P-28 M+ checkpoints | - | - | - | S9 | - | - | - | - |
| P-29 content check, pace | - | P21 | SP-13 | - | SP-11, SP-20 | - | - | SPX-30 (YD-10) |
| P-30 loot, uniques, consumables | NP-23 | P13 | 5.6 (SP-L1) | S17, 5.4 | - | - | 5.5 (no id) | SPX-32 (SP-11) |
| P-31 boss orchestration | - | P3, P4, P15 | SP-04 (part) | - | SP-07 | - | SP-4 | - |
| P-32 intermission | NP-12 (reserved) | P5 (part) | - | - | SP-05 | - | - | SPX-14 (SP-01 part) |
| P-33 beams, bands | NP-09 | P5 (part) | - | - | SP-04, SP-06 | - | SP-3a | SPX-15 (part) |
| P-34 soak, mark, cleanse | NP-08, NP-19 | P5 (part) | - | - | SP-08 | - | SP-3c, SP-3d | SPX-16 (part) |
| P-35 orbs, fixate, watch zones | NP-07 | P5 (part) | - | - | - | YSP-04, YSP-05, YSP-10 | SP-3b, SP-3e | - |
| P-36 shields, links, tethers | NP-10, NP-11 | - | - | S5 (part) | - | - | - | - |
| P-37 images, group status, corpse blast | - | P5 (part) | SP-04 (part) | - | - | - | - | SPX-18 (part) |
| P-38 boss energy | NP-06 | - | - | - | SP-02 | - | - | - |
| P-39 poise breaks | NP-21 | - | SP-P1 to SP-P3 | - | SP-24 (`onPoiseBreak`) | - | SP-11 | SPX-22 (posture) |
| P-40 move-set strings and leaps | - | P18 | - | S15 | SP-24 | YSP-17 | SP-12 | SPX-22 (strings) |
| P-41 boss move bridge | NP-22 (boss side) | - | - | S16 | - | - | - | - |
| P-42 gaze patrol | NP-03 | - | - | - | - | - | - | - |
| P-43 sigils, choice doors | - | - | - | S6 | - | - | - | - |
| P-44 exile rooms | - | - | SP-08 | - | - | - | - | - |

Coverage check: every local id listed in the eight docs' primitive tables appears above. Taşkasa SP-03 is intentionally unused (no soak). Leş SP-09 has no table row; its verticality content is the section 3.6 block and maps to P-09.

### 2.1 Old `SPX-nn` ids (v1 draft, cited by Leş and Yıldız) to P-nn

| Old | P-nn | Old | P-nn |
|---|---|---|---|
| SPX-01 | P-01 | SPX-18 | P-37 |
| SPX-02 | P-03 (+P-04) | SPX-19 | P-38 |
| SPX-03 | P-05 | SPX-20 | P-36 |
| SPX-04 | P-06 | SPX-21 | P-36 |
| SPX-05 | P-08 | SPX-22 | P-39, P-40 |
| SPX-06 | P-11 | SPX-23 | P-22, P-23 |
| SPX-07 | P-09 | SPX-24 | P-21 |
| SPX-08 | P-12 | SPX-25 | P-17 |
| SPX-09 | P-13 | SPX-26 | P-20 |
| SPX-10 | P-14, P-15 | SPX-27 | P-19 |
| SPX-11 | P-26 | SPX-28 | P-25 |
| SPX-12 | P-16 | SPX-29 | P-28 |
| SPX-13 | P-31 | SPX-30 | P-29 |
| SPX-14 | P-32 | SPX-31 | P-27 |
| SPX-15 | P-33 | SPX-32 | P-30 |
| SPX-16 | P-34 | SPX-33 | P-10 |
| SPX-17 | P-35 | SPX-34 | P-42, P-43, P-44 |

## 3. Implementation packages, file-disjoint waves

Process (same as the other plans): at most 3 packages per wave, files are exclusive inside a wave, Sonnet reviews each wave's diff, the orchestrator spot-checks, Haiku fixes. `npx tsc --noEmit` must pass at each wave end. No browser and no dev server per agent (low-CPU rule). One Haiku QA pass at the very end (section 3.4). New modules must avoid TypeScript enums and parameter properties, so Node 22.18+ type stripping can load them in the smoke scripts.

### 3.1 External gates (other plans; merged before the package that touches the same file)

| Gate | Plan item | Needed by |
|---|---|---|
| G-CR1 | GDD_CREATURES CR1 (`src/types/enemies.ts` Appendix A, `src/types/net.ts`) | K1, K8 |
| G-ENG-V1 | ENGINE V1 (`src/types/dungeons.ts` section 3, `src/world/Heightfield.ts`) | K1 |
| G-ENG-V3 | ENGINE V3 (`src/data/dungeons/kit.ts` helpers, `src/dev/contentCheck.ts`) | K5, K20 |
| G-CR4 | GDD_CREATURES CR4 (`src/ai/moves.ts`, `src/ai/EnemyAI.ts`, `src/ai/abilities.ts`) | K5, K6, K12 |
| G-CR5 | GDD_CREATURES CR5 (`src/combat/Combat.ts`, `src/combat/poise.ts`) | K12, K14 |
| G-CR6 | GDD_CREATURES CR6 (`src/data/creatures/moves.ts`) | K12 |
| G-CR2 | GDD_CREATURES CR2 (`src/combat/HitShapes.ts`) | K10 |
| G-ENG-V4 | ENGINE V4 (`src/world/DungeonBuilder.ts`) | K7 |
| G-ENG-V6 | ENGINE V6 (`src/scenes/DungeonScene.ts`) | K8 |
| G-ENG-V10 | ENGINE V10 (`src/combat/HitShapes.ts`) | K10 |
| G-ENG-V12 | ENGINE V12 (`src/systems/Affixes.ts`) | K17 |

### 3.2 Waves

**Wave 1: contracts and registries** (after G-CR1 and G-ENG-V1)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K1 types contract** | P-05 (`DungeonDef.season`, `endgame`), P-07, P-08, P-10, P-11, P-12, P-13, P-14, P-15, P-16, P-17, P-18, P-19, P-21 (id names only), P-23 (`dispel`), P-27 (no change, reads), P-38 (`BossDef.energy`), P-28, P-30 (`extras` only) | `src/types/dungeons.ts` (non-verticality fields only), `src/types/enemies.ts` (`dispel`, `BossDef.energy`), `src/types/skills.ts` (every planned StatusId name) | tsc; no runtime change; `node tools/content-check.mjs kemik_mahzeni kizil_dokumhane buzul_tahti golge_tapinagi` unchanged. |
| **K2 enemy kit** | P-01, P-02 | `src/data/enemyKit.ts` (NEW), `src/data/enemies.ts`, `src/data/enemyModels.ts` (NEW) | tsc; a JSON snapshot of `ENEMIES` and `BOSSES` (keys and every def's fields) is identical before and after. |
| **K3 registries** | P-05 (pool, difficulties), P-06 (ids and aliases) | `src/data/dungeons/index.ts`, `src/systems/MythicPlus.ts` (`dungeonPool`, `dungeonDifficulties`), `src/types/vfx.ts`, `src/types/audio.ts`, `src/vfx/aliases.ts`, `src/audio/aliases.ts` | tsc; with `MPLUS_POOL` empty the pool equals `DUNGEON_IDS`; every new VFX / SFX / music id has an alias entry (a `node` check script run once). |

**Wave 2: content kit and rules** (after wave 1, G-CR4, G-ENG-V3)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K4 status data** | P-21 (rows only: `STATUSES`, `STATUS_RULES`, icons) | `src/data/statuses.ts`, `src/combat/statusesFeel.ts` | tsc; every `STATUS_RULES` key is a `StatusId`; smoke `tools/smoke/status_data.mjs` exit 0. |
| **K5 pack, decor, trash registry** | P-03, P-04, P-25 | `src/data/dungeons/kit.ts`, `src/ai/trash/index.ts` (NEW), `src/ai/abilities.ts` | tsc; smoke `tools/smoke/pack_registry.mjs` (pack forces equal member sum; a fixture `TRASH_CUSTOM` key resolves through `CUSTOM`; `allyAura` factory returns a passive). |
| **K6 ability params, must-answer, call for help** | P-22, P-23, P-24 | `src/ai/EnemyAI.ts`, `src/ai/EnemyDirector.ts`, the cast-bar and nameplate UI files (locate by grep) | tsc; smoke `tools/smoke/ability_params.mjs` (`ranged` skips the melee slot gate; `callRadius` pulls fixture enemies; contentCheck warns on `interruptible` without `kick`). |

Dungeon data packages (section 3.5) may start when wave 2 is merged.

**Wave 3: world, scenes, interactables** (after wave 2, G-ENG-V4, G-ENG-V6)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K7 builder** | P-07, P-08, P-11, P-13, P-16, P-19 (builder side) | `src/world/DungeonBuilder.ts`, `src/world/Sky.ts`, `src/scenes/PackWatch.ts` | tsc; `node tools/content-check.mjs` on the legacy 4 unchanged; visual check deferred to the final QA (builder imports three.js, so no headless smoke). |
| **K8 events, gates, checkpoints, ticker** | P-12, P-19 (scene ticker), P-28 | `src/scenes/DungeonScene.ts`, `src/systems/DungeonEvents.ts` (NEW), `src/types/net.ts` (after G-CR1) | tsc; smoke `tools/smoke/gate_resolver.mjs`: the pure gate function (extracted into `DungeonEvents.ts`) gives the truth table for `event_lock`, `kill_lock`, `device_lock`, `requires`, `boss_lock`, `boss_exit`, `forces_lock`. |
| **K9 interactables** | P-14, P-15 | `src/entities/interactables/DungeonNpc.ts`, `ChannelGate.ts`, `BoonPad.ts`, `BuffStation.ts`, `TransitCart.ts`, `DropWinch.ts` (all NEW), `src/entities/interactables/index.ts`, `src/data/devices.ts` (NEW) | tsc; each class constructs from a fixture props list (smoke only if no three.js import; otherwise final QA). |

**Wave 4: boss kit** (after wave 3, G-CR2, G-ENG-V10, G-CR5, G-CR6)

| Pkg | Primitives | Exclusive files | Acceptance and one-boss smoke |
|---|---|---|---|
| **K10 boss patterns** | P-32, P-33, P-34, P-37 | `src/ai/bosses/patterns.ts` (NEW), `src/ai/bosses/kit.ts` (re-exports), `src/combat/HitShapes.ts` (`persist.scaleTo`, `spin`) | tsc; smoke `tools/smoke/boss_patterns.mjs`: a fixture boss runs soak, mark, rotating beams and an intermission for 60 simulated seconds; expects marks and damage events and the intermission to end by `maxSeconds`. |
| **K11 boss controller: orbs, links, energy, pairing** | P-31, P-35, P-36, P-38 | `src/ai/BossController.ts`, `src/ai/bossNet.ts`, `src/ai/bosses/orbs.ts` (NEW), `src/ai/bosses/links.ts` (NEW), `src/scenes/DungeonScene.ts` (pairing and pull hooks only; K8 ran earlier in wave 3) | tsc; smoke `tools/smoke/boss_orbs_links.mjs`: `lockLimit` fires at 150 s; energy regen and `onFull`; a `root` player ignores a pull; `linkHealth` shares damage. |
| **K12 boss moves and break hooks** | P-39 (boss side), P-40 (boss side), P-41 | `src/ai/bosses/types.ts`, `src/ai/bosses/moveBridge.ts` (NEW) | tsc; smoke `tools/smoke/boss_moves.mjs`: a 3-step `bossString` produces 3 shapes at the stated times; a break cancels the rest; `onBreak` runs once. |

**Wave 5: mechanics and hooks** (after wave 4)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K13 PROC bodies and MECH** | P-20 | `src/ai/procModels.ts`, `src/data/enemies_mech.ts` (NEW) | tsc; `node tools/content-check.mjs` resolves every MECH id; smoke `tools/smoke/procs.mjs` (ids resolve, model builders return objects without throwing, if the module imports headless). |
| **K14 status hooks** | P-21 (hooks: `onDodge`, `onExpire`, `takenMorePerStack`, persisted reads) | `src/combat/Combat.ts` (after G-CR5), `src/data/statuses.ts` (pure rule helpers only) | tsc; smoke `tools/smoke/status_hooks.mjs`: the multiplier helpers return `1 + v x stacks` and do not fire `onExpire` on dispel. |
| **K15 hazards and breakables** | P-17, P-18 | `src/scenes/Hazards.ts`, `src/scenes/PropGameplay.ts` | tsc; smoke `tools/smoke/grounding.mjs` (a pure `groundedBy` function cancels the strike within radius, passes outside). |

**Wave 6: M+ rules, loot, instances** (after wave 5)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K16 M+ rules** | P-26 (`grantForces`, Tyrannical for encounter adds) | `src/systems/MythicPlus.ts` | tsc; smoke `tools/smoke/mplus_rules.mjs`: `grantForces` respects `forcesRequired`; encounter adds take the Tyrannical multiplier and not Fortified. |
| **K17 affixes and Kibirli** | P-26 (`affixSafe`), P-27 | `src/systems/Affixes.ts` (after G-ENG-V12), `src/data/mythicAffixes.ts` | tsc; smoke `tools/smoke/kibirli.mjs`: spawn thresholds at 20, 40, 60, 80 %; no spawn within 15 m of a player-chosen point; `affixSafe` points are skipped. |
| **K18 loot and consumables** | P-30 (no trinkets) | `src/data/loot.ts`, `src/data/uniques.ts`, `src/data/items.ts` | tsc; every `special` id has a combat hook (grep); `potion_panzehir` in items. |

**Wave 7: data tools and entrances** (after wave 6)

| Pkg | Primitives | Exclusive files | Acceptance |
|---|---|---|---|
| **K19 entrances** | P-10 | `src/data/world/entrances.ts` (NEW), the crypt and forge recipe file (moved), `src/types/dungeons.ts` (`EntranceDef.look` union, after K1) | tsc; every `EntranceDef.look` has a recipe (content check). |
| **K20 content check v2 and pace tool** | P-29 | `tools/content-check.mjs`, `src/dev/contentCheck.ts` (after G-ENG-V3), `tools/mplus-pace.mjs` (NEW) | `node tools/content-check.mjs` passes all 4 legacy dungeons; `node tools/mplus-pace.mjs kemik_mahzeni` prints a table. |

Wave 7 has 2 packages: the third slot is free for a late fix.

### 3.3 Smoke tests by primitive group

One headless smoke per group, run by the package that owns it (table above). They are Node scripts under `tools/smoke/`, exit 0 on success, no browser and no dev server. Groups:

| Group | Packages | Smoke |
|---|---|---|
| Data and registries | K1 to K3 | snapshot of `ENEMIES`, pool fallback, content check of 4 legacy dungeons |
| Content rules | K4 to K6 | `status_data`, `pack_registry`, `ability_params` |
| Events and gates | K8 | `gate_resolver` (truth table) |
| Boss patterns (one boss) | K10 | `boss_patterns` |
| Boss orbs, links, energy (one boss) | K11 | `boss_orbs_links` |
| Boss moves and breaks (one boss) | K12 | `boss_moves` |
| PROC and MECH | K13 | `procs` |
| Status hooks | K14 | `status_hooks` |
| Hazards | K15 | `grounding` |
| M+ rules | K16, K17 | `mplus_rules`, `kibirli` |
| World, scene and interactables | K7, K9, K19 | no headless test (three.js); covered by the final QA pass |

### 3.4 Final QA (one Haiku pass, after wave 7)

`npx tsc --noEmit`; every smoke under `tools/smoke/`; `node tools/content-check.mjs` on all 8 season dungeons; `node tools/mplus-pace.mjs` on each; one browser pass on the dev pages for the world-side primitives (sky, storm, lightshaft, gates, NPC prompt). Report as a table, fixes as small Haiku diffs.

### 3.5 Dungeon data packages

A dungeon's data package (its `src/data/dungeons/<id>.ts`, `src/data/enemies_<id>.ts`, pack and route data, theme, `MPLUS_POOL` registration) may start when **wave 2 is merged**: K1 to K6 give types, ids, the pack helper, the statuses and the ability params. Its runtime parts wait for the packages named below:

| Dungeon | Data starts after | Runtime needs (wave) | Other external gate |
|---|---|---|---|
| `buyucu_terasi` | wave 2 | boss kit (W4), status hooks (W5), M+ rules (W6) | ENGINE V1 to V6 (3.2b), gaze patrol P-42 owned by the dungeon |
| `kefaret_salonlari` | wave 2 | statue wake and PROC (W4 to W5), Kibirli (W6) | ENGINE (P-09, P-17 floors), P-04 decor |
| `les_uyanisi` | wave 2 | devices and ChannelGate (W3), boss kit (W4), exile rooms P-44 owned by the dungeon | ENGINE (SP-V1 to SP-V3) |
| `peri_sisleri` | wave 2 | channel gate (W3), boss kit (W4), egg wake (W3) | ENGINE S14; sigils P-43 owned by the dungeon |
| `taskasa` | wave 2 | transits and stations (W3), boss kit (W4) | ENGINE (SP-22 and SP-23, heavy: falls and chasms) |
| `yanki_agi` | wave 2 | NPC and devices (W3), orbs and watch zones (W4), storm and cloud sea (W3) | ENGINE V3 strips (YSP-16) |
| `yigitler_sarayi` | wave 2 | storms, rods and breakables (W5), boss kit (W4), intermission and beams (W4) | ENGINE (SP-10 heightfield) |
| `yildiz_divani` | wave 2 | events and winches (W3), boss kit (W4), posture and moves (W4 to W5), Kibirli (W6) | ENGINE V1 to V6 (lifts and daises) |

Each dungeon's own package table must reference these P-nn rows. Boss scripts start after wave 4.

## 4. Conflicts found between the docs and the code, and how they were resolved

1. **Id schemes.** Eight local schemes (`NP-`, `P`, `SP-`, `S`, `YSP-`, `YS-`, `SPX-`, `YD-`) with clashing numbers: `SP-13` is the season pool in Yıldız and the content check in Leş, `SP-3` is devices in Leş and the boss kit in Yiğitler, `SP-14` is the pool in Leş and the BuffStation in Taşkasa. **Resolved:** canonical `P-nn` (section 2 and 2.1 map every old id).
2. **Pool registry name and source.** `MPLUS_POOL` (Kefaret, Peri, Taşkasa, Yiğitler) vs `SEASON_POOL` (Büyücü) vs `MYTHIC_POOL` (Leş). The code's `dungeonPool()` reads `DUNGEON_IDS`. **Resolved:** `MPLUS_POOL`, with `DUNGEON_IDS` kept as the levelling list (P-05).
3. **Enemy kit path.** `src/data/enemies/builders.ts` (Yanki), `src/data/enemies/kit.ts` (Taşkasa draft), `src/data/enemyKit.ts` (Kefaret, Peri, Taşkasa final), per-dungeon `src/data/enemies/<id>.ts` (Taşkasa, Yanki) vs `src/data/enemies_<id>.ts` (Kefaret). **Resolved:** `src/data/enemyKit.ts` and flat `src/data/enemies_<id>.ts`. A directory `src/data/enemies/` next to the existing file `src/data/enemies.ts` would make the import path ambiguous, so it is not used.
4. **Pack helper.** `pk()` (Leş), `kit.packN()` (Yanki), `pack()` (Yıldız), and the existing `pack()` in `src/data/dungeons/kit.ts`. **Resolved:** extend the existing `pack()` (P-03). The other names are aliases.
5. **Verticality field names.** The dungeon docs use `floorY`, `ceiling`, `stairs`, `ramp`, `rampZone`, `terraces`, `galleries`, `strips`, `wallScale`, `open`, `sky`. ENGINE_VERTICALITY uses `floorY`, `ceiling`, `heightAreas`, `slopes`, `tiers`, `openAir`, `LiftDef`. **Resolved:** ENGINE names win (section 3 of that file). `RoomDef.stairs` and `strips` become `slopes` of kind `stairs`, `rampZone` becomes `slopes` of kind `ramp`, `terraces` and `galleries` become `heightAreas` and `tiers`, `wallScale` is dropped (height is `ceiling`).
6. **`ZoneDef.fall`.** Taşkasa uses `fall?: boolean`; ENGINE uses `fall?: 'open' \| 'kill'` with `depth`. **Resolved:** ENGINE's type. Taşkasa's falling chasm is `'open'`, the scripted pit is `'kill'`.
7. **Dormant kinds.** The v1 draft said to add `'ceiling'` and `'egg'`. Both are already in `PackDef.dormant.kind`. **Resolved:** only `'statue'` is new (P-16).
8. **Posture bar.** Yıldız (SPX-22), Leş (SP-P1 to P3), Yiğitler (SP-11), Taşkasa (SP-24 `onPoiseBreak`), Büyücü (NP-21) each describe a posture bar. The code already has poise (`src/combat/poise.ts`, `EnemyDef.poise*`, `hyperArmor`, `stanceBreakable`), and GDD_CREATURES section 5 defines `EnemyDef.onBreak`. **Resolved:** one system, the existing poise plus `onBreak` (P-39). Dungeons set per-def values. This answers the v1 open question about whether the posture bar applies to all elites: it does, through poise, which already covers every elite and miniboss.
9. **Strings and holds.** Dungeon forms: `params.string / gap / hold` (Yıldız), `params.hits` with `c2 / w2 / hold2` (Kefaret), `params.chain / t2 / c2 / t3 / c3` (Taşkasa), `EnemyAbility.string = { hits, gap, coefMul?, anims? }` (Leş), `followUps` (Yiğitler), `chain()` and `leap()` builders (Yanki). GDD_CREATURES has `move.string`, `move.hold`, `move.leap` (`MoveSpec`). **Resolved:** GDD_CREATURES's `MoveSpec` (P-40). Dungeon forms are aliases; the boss side uses a bridge to the same runner (P-41), not a second interpreter.
10. **Boss-side strike kit.** Büyücü NP-22 and Peri S16 each describe a boss copy of the move interpreter. **Resolved:** one runner (`src/ai/moves.ts`, CR4) plus the bridge in P-41.
11. **Soak and beams.** `soakCircle`, `soakSlots`, `soakPad` collapse into `soak` (P-34); `spinBeams`, `sweepBeam`, `beamPair` collapse into `rotatingBeams` (P-33). Old names stay as aliases for one release.
12. **Gate kinds.** Büyücü `kill_lock`, Leş `device_lock`, Yanki pack-clear `requires`, Yıldız `event_lock`, plus the existing `boss_lock`, `boss_exit`, `forces_lock`. **Resolved:** one resolver (`DungeonScene.gateShouldBeOpen`, P-12).
13. **Music ids.** Leş says music is an alias problem, not an id problem; Yiğitler notes that `dungeon_cold_sanctuary` is a file name. `MUSIC_IDS` is a closed list. **Resolved:** new music ids are aliases of existing tracks until composed (P-06).
14. **Entrance registry.** The v1 draft said `src/data/world/entrances.ts` already existed. It does not. **Resolved:** NEW file (P-10). `EntranceDef.look` is a closed union today.
15. **Kibirli vs `seasonal_efsun`.** CORE_MECHANICS and the four docs call the seasonal threshold affix "Kibirli" (spawn at 20 / 40 / 60 / 80 %). The code has `seasonal_efsun` ("Efsunlu Yarık") with the same four thresholds but a different mechanic (rift guardians with `killWindow: 45`). **Resolved:** extend the existing affix (P-27), keep the thresholds, change `killWindow` to 60 to match the docs. The name is open (section 5, decision 1).
16. **Verification of paths.** The v1 draft named `src/ai/trash/index.ts`, `src/data/devices.ts`, `src/data/world/entrances.ts`, `src/combat/Forces.ts`, `tools/mplus-pace.mjs`. Only the first and the last are new (`src/ai/trash/` does not exist yet). `src/combat/Forces.ts` does not exist and is not used. **Resolved:** paths in section 1 are checked; NEW files are labelled.
17. **Shared files between plans.** `DungeonBuilder.ts`, `DungeonScene.ts`, `src/data/dungeons/kit.ts`, `src/dev/contentCheck.ts`, `src/types/enemies.ts`, `src/ai/EnemyAI.ts`, `src/ai/abilities.ts`, `src/combat/Combat.ts`, `src/combat/HitShapes.ts`, `src/systems/Affixes.ts` are also edited by ENGINE and CREATURES packages. **Resolved:** section 3.1 gates. No package here starts before the owning package is merged.
18. **Single-dungeon systems.** Gaze patrol, sigil puzzle and exile rooms appeared in the v1 table as shared. **Resolved:** listed as P-42 to P-44 with a single owner, so they cannot clash with shared ids.

## 5. Open decisions for the owner

1. **Kibirli name and mechanic.** Keep the design name "Kibirli" with the new `kibir_tecessumu` spawn, or treat it as the existing "Efsunlu Yarık" (rift guardians) with its current mechanic and only the four threshold docs updated. Packages K17 assume the first (extend `seasonal_efsun`, new elite).
2. **Trinket slots (P-30).** Promote signature items to trinkets in Season 1, or keep the current slots. This plan assumes the current slots (no `EquipSlot` change).
3. **Encounter adds and Tyrannical.** Do `rank 'miniboss'` and `tag 'encounter_boss'` adds take Tyrannical only, for every doc that has emissaries or add bosses (Yiğitler SP-5, Taşkasa add bosses, Yıldız Gerdan and Taliksa's helpers)? This plan assumes yes (P-26).
4. **Verticality timing.** If ENGINE V1 to V6 slip, the dungeons that use `vertical` (all eight have a verticality section) need the flat fallback. Each dungeon doc must say which of its rooms fall back to flat if the heightfield is late. Not decided here.
5. **Dungeon data start.** This plan starts the 8 data packages at wave 2. If the owner wants data to wait for the boss kit (wave 4), the start moves four waves later with no change to any package.

## 6. Orchestrator decisions (binding)
1. Kibirli: extend the existing seasonal affix mechanic, player-facing name "Kibirli" (CORE_MECHANICS §6), thresholds 20/40/60/80 %, killWindow 60 s.
2. No trinket slots now (EquipSlot unchanged); signature items use amulet/ring/weapon.
3. Encounter adds take the Tyrannical multiplier (boss encounter), not Fortified — as planned in K16.
4. Heightfield fallback: if ENGINE V1–V6 slip, a dungeon may ship with rooms flagged flat; each data package lists its flat-fallback rooms.
5. Data packages start after wave 2 as planned.
