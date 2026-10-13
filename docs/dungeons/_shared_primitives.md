# Season 1 shared primitives: one canonical id and one API per primitive

Status: design v1, 2026-10-13. Docs only, no code touched. Scope: the 8 Season 1 Mythic+ dungeon docs in this folder (`buyucu_terasi`, `kefaret_salonlari`, `les_uyanisi`, `peri_sisleri`, `taskasa`, `yanki_agi`, `yigitler_sarayi`, `yildiz_divani`).

## 0. Why this file exists

Every dungeon doc listed its own "NEW shared primitives" with local numbering (`NP-01`, `P1`, `SP-01`, `S1`, `YSP-01`, `SP-1` ...). The same engine feature appeared under different names with slightly different APIs (season pool registry: 8 times; enemy kit export: 6 times; entrance look: 8 times; fixate, soak, beams, intermission: 3-4 times each), and the same number meant different things in different docs (`SP-13` is the season pool in Yıldız Divanı, the content check in Leş Uyanışı; `SP-3` is the device system in Leş, the boss kit in Yiğitler Sarayı). If each doc were implemented literally, shared work would be built several times.

Rules from now on:
* **Canonical ids are `SPX-nn`** (S = season, P = primitive, X = canonical). Dungeon docs keep their local numbers in a short mapping (section 2) but implementation packages depend on `SPX-nn` only. One primitive = one owner module = one API.
* **Build once, as package `SPX-WAVE-n`** (section 3), before any per-dungeon data package. A dungeon package may not re-implement a primitive; if it needs a variation it extends the canonical API with an optional field.
* **Append-only types**: every addition to `StatusId`, `VFX_IDS`, `MusicId`, `DoorDef.gate`, `PackDef.dormant.kind`, `EntranceDef.look`, `EquipSlot` is append-only and registered once in the owning primitive, so no two packages touch the same union line.
* **Fallbacks**: each primitive lists what a dungeon can do if the primitive is late (the dungeon stays buildable, in a reduced form).
* Conflicts that were resolved by choosing one side are listed in section 4; items that need a human decision are in section 5.

## 1. Canonical primitives

Owner modules use the project's agent areas: `world`, `scenes`, `enemies` (`src/data/enemies*`, `src/ai/**`), `combat`, `mythic` (`src/systems/MythicPlus.ts`, affixes), `items`, `vfx-audio`, `hud`, `tools`, `content` (data/dungeons).

### 1.1 Data and content kit

| ID | Primitive | Canonical API / spec | Owner | Fallback |
|---|---|---|---|---|
| **SPX-01** | Enemy kit export | New `src/data/enemies/builders.ts` re-exporting what `data/enemies.ts` keeps private: `add def derive boss bp custom MECH cone proj aoe line heal buff charge summonAb passive onDeath NOOP bleed poison burn chill`, anim sets `A_*`, resist tables `R_*`, hide lists (`KNIGHT_HIDE`, `ROGUE_HIDE`, `mageHide` ...) and model helpers (`CHAR MON GEN ITCH`). `data/enemies.ts` imports from it (no behaviour change). Per-dungeon enemy files live in `src/data/enemies/<dungeon>.ts` and are imported by `data/enemies.ts` | enemies | edit `data/enemies.ts` directly (merge-conflict prone) |
| **SPX-02** | Pack helper and pack flags | `kit.packN(id, roomId, cx, cz, members: [enemyId, count][], extra?)` expands counts into the shared sunflower formation (first members in front, elites first); `PackDef` flags used everywhere: `patrol`, `big`, `linkedTo`, `optional`, `dormant`, `note`. Same helper for all 8 dungeons | content | each doc writes its own `pack()` |
| **SPX-03** | Season pool registry and gating | `src/data/dungeons/index.ts` exports `MPLUS_POOL: string[]` (the 8 ids, in rotation order) and `LEVELLING_DUNGEON_IDS` (the 4 old ones); `DungeonDef.season?: number`, `DungeonDef.endgame?: boolean` (no Normal); `dungeonDifficulties(id)` returns Kahramanlık / Mitik / Mitik+ for pool dungeons; `MythicPlus.pickKeyDungeon`, `grantKeystone`, keystone UI, Group Finder M+ tab, leaderboards and the rating sum read `MPLUS_POOL`, never `DUNGEON_IDS` | mythic + content | empty pool falls back to `DUNGEON_IDS` |
| **SPX-04** | Audio, music and VFX ids | `MusicId += 'dungeon_<name>'` per dungeon (alias to an existing track in the audio manifest until composed), `VFX_IDS +=` the union of every dungeon's new ids (`ambient_stardust`, `arcane_orb`, `void_torrent`, `dome_suppress`, `web_burst`, `egg_burst`, `swarm_cloud`, `black_blood`, `static_field`, `storm_flash`, `ambient_leaves`, `rune_pad_glow` ...) each with an alias in `vfx/aliases.ts`; SFX ids (`water_lap`, `crowd_murmur`, `chandelier_creak`, `lift_hum`, `waltz_loop`, `bell_toll`, `flies_loop`, `saw_loop`, `wind_loop`, `ice_creak`) aliased in `audio/aliases.ts`. Unknown ids stay silent | vfx-audio | existing ids only |
| **SPX-05** | Dungeon sky, moon and open-air mode | `DungeonTheme.sky?: { image?: string; stars?: boolean; fallback?: SkyOptions }`, `RoomDef.sky?: string` override, `DungeonTheme.moon?: { color, intensity, dir? }`, `DungeonTheme.cloudSea?: { y, color, speed }`, `RoomDef.open?: boolean` (no ceiling, sky visible). `setupTheme` builds a `NearestFilter` equirect background; the fog colour is kept | world | flat fog-colour background |
| **SPX-06** | Art kit v2 | `WallStyle` and `FloorStyle` additions registered once (`marble`, `arcane`, `library`, `grove`, `gorm`, `moss`, `earthen`, `earthen_dark`, `nerub`, `web_stone` ...) in `WALL_STYLES`, `FLOORS`, `DECOR`, `dungeonAssetUrls`; `RoomDef.style?: { floorTint?, wallTint? }`; `RoomDef.wallScale?: number` (Y scale of walls and banners; collision unchanged); `RoomDef.atmosphere?` with `DungeonDef.atmospheres`; `RoomDef.dress?` (extra prop lists) | world | reuse `tiles`, `temple`, `brick`, tints |
| **SPX-07** | Verticality (CORE_MECHANICS §13) | `RoomDef.floorY?: number`, `RoomDef.ceiling?: number` (m, halls 12-30); `ZoneDef kind 'ramp'` with `rampZone(x, z, w, h, dir, y0, y1)`: tile-centre sampling, heights at tile `i` of `n` = `y0 + (i + 0.5) / n x (y1 - y0)`; `dais` zone `y` is an offset from the room floor; NavGrid stores heights, refuses neighbour steps above 0.45 m except inside a ramp strip; `World.groundY` samples the heightfield for players, enemies, loot, projectiles; melee and hit shapes ignore height differences up to 2.5 m and miss beyond; `extras.lifts?: { id, rect, from, to, speed, idleReturn, call: Pt[] }[]` (host-authoritative moving platform, riders carried, replicated `lift` state); void tiles and bridges as walkable decks over a fall plane. `tools/content-check.mjs` verifies every door tile pair and every strip end | world + scenes | flat dungeon (no floorY), lifts replaced by a plain corridor |
| **SPX-08** | Dungeon events and conditional doors | `DungeonDef.events?: Record<string, boolean>` initial flags; host-authoritative store `G.dungeonEvents.get/set/on`, replicated by a `dungeon_event` net message, cleared on `scene:leaving`; `DoorDef.gate +=` `'event_lock'` (`DoorDef.event: string`, open when the flag is true), `'kill_lock'` (`DoorDef.opensOn: { pack?, enemyId?, boss? }`), pack-clear doors via `DoorDef.requires?: string[]` (open when every listed pack is dead), `device_lock` (`DoorDef.device`); `DungeonScene.gateShouldBeOpen` resolves all of them. Boss scripts read flags | scenes | boss-order doors only |
| **SPX-09** | Gate styles | `DoorDef.gateStyle?: 'portcullis' (default) \| 'arcane' \| 'fel' \| 'wood' \| 'thorn' \| 'bone' \| 'web' \| 'stone'`; `makeGate` picks the mesh and material; `arcane` / `fel` generalise `StartBarrier` (texture and colour) | world | portcullis |
| **SPX-10** | Interactables | `InteractableProp` family in `entities/interactables/`: `DungeonNpc` (`{ id, name, model, lines?, requires?: { classes?, professions? } (any-of), holdSeconds?, onInteract(ctx) }`, data in `extras.npcs`, greyed prompt "Gereken: ..." when unmet, requests go to the host with the `CursedChest` `sendRequest` pattern); `ReqInteract`; `ChannelGate` (hold F near the prop, damage cancels, plays `Open`, calls `EnemyDirector.alertNear`); devices (`PropPlacement.tag 'device'`, `device`, `DeviceDef`); `extras.boons?: { id, pos, status, duration, magnitude?, oncePerPlayer?, persistOnDeath? }[]` (applied locally to the user's player); `extras.stations?` (BuffStation); `extras.transits?` (TransitCart); `extras.dropProps?: { id, pos, ring, dmgPctMax, eliteCap, stun, playerCoef, winch: Pt }[]` (hold-interact winch drops a hanging prop on a ring: damage and stun to everything inside, replicated `drop` event); per-dungeon registry `registerDungeonEvents(id, handlers)`; static or looping-clip NPC decor | scenes + world | plain `CursedChest` interactions |
| **SPX-11** | Forces grant | `MythicPlus.grantForces(n, reason)`: host only, adds to `state.forces` (capped at `forcesRequired`), calls `fx.onForces`, `commit()`, a toast. Dynamic ids give 0 forces, so every event that rewards forces uses this | mythic | event gives no forces (keep `forcesRequired` low) |
| **SPX-12** | Dormant pack kinds and wake triggers | `PackDef.dormant.kind +=` `'egg'` (swap the `wake` prop for a broken shell, `egg_burst`, camera shake 0.3), `'statue'` (stone tint, frozen frame 0, `death_bones` burst tinted grey on wake), `'ceiling'` (jumps down, `leap_land`); `PackDef.wakeWhen?: { cleared: string[]; delay? }` | scenes + world | `egg` only (exists in Kemik) |

### 1.2 Boss kit

All helpers live in `src/ai/bosses/kit.ts` (or a sibling file re-exported from it); each wraps a pattern that already exists in `golge.ts`, `dokumhane.ts`, `buzul.ts`, `kemik.ts`, so the risk is low. Each ships with a one-boss smoke script.

| ID | Primitive | Canonical API | Owner | Fallback |
|---|---|---|---|---|
| **SPX-13** | Boss orchestration | `BossPlacement.awaken?: { enemyId, count }` + `BossScript.onAwaken`; `BossPlacement.pull?: 'aggro' \| 'interact'` + `pullProp`; `BossPlacement.group?: string` (paired bosses engage, reset and die together, one loot roll, M+ `bossesTotal` counts groups); `BossScript.lockLimit?: number` (phase-lock safety net, default 150 s); `encounterAdd(c, defId, pos, { hpMult, tag })` and `addDash`; `rank 'miniboss'` and `tag 'encounter_boss'` adds take Tyrannical and not Fortified; `c.prop(id)` boss-script prop control (`setOpen`, `setGlow`, `setVisible`, `swing`, replicated with `bossMsg('prop', ...)`) | enemies + mythic | scripts spawn adds by hand |
| **SPX-14** | Intermission | `intermission(c, { dur, teleportTo?, onStart?, onTick?(dt, t), onEnd?, maxSeconds? })`: setImmune + freeze + timer + safety net + `endMechanicPhase` (generalises the Zakhar ritual, Ignaroth gates, `beginPhylactery` / `endPhylactery`); options for add waves and a survivor penalty | enemies | copy the Zakhar pattern |
| **SPX-15** | Beams, bands and sweeps | `rotatingBeams(c, { origins: Pt[] \| { x, z, n }, speedDeg, dirs?, length, width, coef, dur, reverseAt?, step?, type?, name, scaleTo?, spin? })` + `updateRotatingBeams` (aliases `spinBeams`, `sweepBeam`, `beamPair`); `trackBeam(c, from, target, { lockAt, delay, length, width, coef, ... })`; `movingBand(c, { from, to, width, speed, coef, stun?, name })`; `breathBand(c, from, dir, len, width, delay, coef, { cover, coverRadius, ... })`; `HitShapeSpec.persist.scaleTo?` and `HitShapeSpec.spin?` | enemies | `beam` / `band` segments by hand |
| **SPX-16** | Soak, mark, spread, cleanse | `soakCircle` / `soakSlots` / `soakPad` (one function, `soak(c, { slots: [{ x, z, r, at }], need, coef, onFail, onPass })`, yellow display-only telegraph cancelled before landing, host `playersIn` check); `markPlayers(c, players, { delay, r, coef, type, name, toast, beamTo?, onExpire? })` (aliases `spreadMarks`); `cleanseSpot(c, { x, z, rMin, rMax, hold, cooldown, status })` + `removeStatusPlayer` | enemies | Zakhar seal pattern |
| **SPX-17** | Orbs, fixate and zones | `spawnOrb` / `updateOrbs` / `clearOrbs` (`roamingOrb`, seeker orbs, `mech proc_energy_orb`); `fixate(c, target, { seconds, speed, catchR, onCatch })` and `EnemyDef.ai.fixate` + `spawnAdds(..., { fixate })`; `watchZone` / `roamZone` + `updateWatchZones` / `clearWatchZones`; rooted players ignore `pull` forces (`ForceSystem`) | enemies | simple moveOverride chase |
| **SPX-18** | Images, adds and group helpers | `imageSpawn(c, defId, p, { tag, max, hpMult })` + `imageEach(c, tag, fn)`; `statusAll(c, status, duration, o?)`; `raidPulse(c, coef, type, name)`; `corpseBlast`; `clearStatusPlayer`; `allyAura` passive factory lives in SPX-28 | enemies | inline loops |
| **SPX-19** | Boss energy | `BossDef.energy?: { max, start?, regen, onFull?, costs? }`; `bossEnergy(c, ...)` with `set/add/pause`; `bossMsg('boss_energy', { v })` every 0.25 s drives a thin cyan second bar in the boss frame | enemies + hud | script counters |
| **SPX-20** | Health link and tether | `linkHealth(c, bodies, { absorb? })` (shared HP, any death kills the group); `tether(c, player, entity, { dur, onBreak, onExpire, touchR })` | enemies | none |
| **SPX-21** | Boss shields and player links | `bossShield(c, pct)` + `shieldUp(c)`; `linkPlayers(c, pids, { r, coefBase, tick, dur, release })` | enemies | none |

### 1.3 Enemy mechanics

| ID | Primitive | Canonical API | Owner | Fallback |
|---|---|---|---|---|
| **SPX-22** | **Posture, strings and recovery windows** (new, CORE_MECHANICS §16) | `EnemyDef.posture?` and `BossDef.posture?: { max, regenDelay, regen, stagger, lockout }`. Player hits add `postureDmg` (basic 2, heavy skills 4-6, crit x1.5, successful interrupt +25, stun +15 on enemies that cannot be stunned); hits inside a `recovery` window count x2; a break cancels the current attack / cast / channel, staggers for `stagger` s with +25% damage taken, and locks the bar for `lockout` s. `EnemyAbility.params`: `string: n` (hits), `gap` (s between hits), `hold` (s extra before the last hit), `recovery` (s). HUD: a thin gold second bar under the nameplate / boss frame; white flash plus `stun_stars` on break. Windup rule `clamp(0.45 + 0.25 x coef, 0.45, 1.2)` is enforced by the content check | enemies + combat + hud | no posture (elites keep their normal HP); strings as separate abilities |
| **SPX-23** | Ability parameters and must-answer UI | `EnemyAbility.params`: `targets` (N ground circles on N random players), `count`, `chain` / `chainRange` / `chainMul` (projectile jumps), `ramp` / `rampMax`, `interruptsCast` (silence-school lockout), `suicide`, `leech` / `leechCapPct`, `los` (line-of-sight hit: `HitShapeSpec.requireLoS`, each peer checks `nav.lineOfSight`), `aggroRadius` + `summon` (call for help: `EnemyAI.callForHelp(radius)`); `EnemyAbility.kick` wired into the cast bar and nameplate (priority icon) and `EnemyAbility.dispel?: StatusId` (green mark on the debuff); `contentCheck` warns when `interruptible` has no `kick` | enemies + hud | by-hand custom handlers |
| **SPX-24** | Statuses and AI hooks | One append-only batch for `StatusId`, `STATUSES`, `STATUS_RULES` (all dungeon-specific ids, Turkish names); hooks: `StatusDef.onDodge?: { removeStacks }`, `STATUS_RULES[id].onExpire?: { shape, radius, coef, type }` (not on dispel), `takenMorePerStack`, `healMult`; verified remote reads of `Player.statuses` and persisted statuses on `HitShapeSpec.persist`; `EnemyDef.ai.disguiseBlind` (aggro filter for a `disguise` status) | combat + enemies | statuses as plain `slow` / `dot` |
| **SPX-25** | Hazards and zone looks | `HazardDef.kind += 'debris_fall' \| 'plague_vent' \| 'lightning'`; `ZoneDef.look?: 'cloud' \| 'abyss'`; `RoomDef.storm?: { every, color, strength }`; `extras.affixSafe?: { x, z, r }[]` (volcanic / storming / explosive / spiteful skip them) | world + mythic | none |
| **SPX-26** | PROC bodies and MECH defs | `src/ai/procModels.ts` builders (flat-shaded, PSX patch) and `MECH()` registrations for every procedural unit (`eye_orb`, `proc_beacon`, `proc_volatile_spike`, `proc_crystal_shard`, `sinstone_statue`, `parishioner`, `energy_orb` ...) | enemies | stock models |
| **SPX-27** | Animated props and light shafts | `PropPlacement.spin?`, `spinNode?`, `bob?: [amp, hz]`; `PropPlacement.tag: 'lightshaft'` (additive cone / box 3 x 8 x 3 m default, tint, opacity 0.12-0.25, drifting motes, no real light) | world | static props |
| **SPX-28** | Trash script registry and ally auras | `src/ai/trash/index.ts` merges per-dungeon tables (`TRASH_CUSTOM`, `TRASH_PASSIVES`) into `CUSTOM` and the passive registry; `allyAura({ radius, interval, status, seconds })` passive factory | enemies | edit `ai/abilities.ts` directly |

### 1.4 Systems, tools and world

| ID | Primitive | Canonical API | Owner | Fallback |
|---|---|---|---|---|
| **SPX-29** | M+ checkpoints | `extras.checkpoints?: [number, number][]`: in M+ a death releases at the latest checkpoint whose boss is dead (the +15 s penalty is unchanged) | scenes + mythic | release at the start |
| **SPX-30** | Content check and pace tools | `tools/content-check.mjs` rules: pack `forces` = sum of member forces; `forcesRequired` is 100-103.5% of the mandatory route total; `bosses.length >= 3` and group-aware; all pack, boss, loot, device ids resolve; every `boss_lock` / `event_lock` pair resolves; reachability; **door tile height pair `|dy| <= 0.45` and ramp strip end step `<= 0.45`**; **trash windup rule**; registries derived from `BOSSES` / `ENEMIES`; `tools/mplus-pace.mjs <dungeon>` prints the pull table, cumulative forces % and the timer estimate | tools | by hand |
| **SPX-31** | Kibirli seasonal affix | `kibirli` affix def and handler: at 20 / 40 / 60 / 80% forces spawn `kibir_tecessumu` (elite, 4 x trash HP, 0 forces, CC-immune) at the nearest `extras.riftSpots` entry >= 15 m away outside boss arenas; kill within 60 s of rising grants +10% damage and +10% move speed for 60 s | mythic | CORE_MECHANICS CM7 |
| **SPX-32** | Loot, uniques and trinket slots | `LOOT_TABLES` rows per boss, `UniqueDef` entries with `special` ids (`leg_<dungeon>_*`) implemented through `G.character.hasSpecial` in combat procs, optional set per season; optional `EquipSlot += 'trinket1' \| 'trinket2'` with UI, StatCalc and item bases | items + combat | amulets, rings, belts, weapons |
| **SPX-33** | Entrance looks and recipes | `EntranceDef.look` widened to a string union that gains one value per dungeon (`'palace'`, `'arcane'`, `'grove'`, `'web'`, `'valor'`, `'temple'` ...); `ENTRANCE_RECIPES[look]` in `src/data/world/entrances.ts` (a prop-list builder, like the existing `crypt` / `forge`); `PORTAL_TINTS`; map icon colour | world + content | the Kadim Kapılar Salonu portal |
| **SPX-34** | Single-dungeon systems (owned by one dungeon, listed here for conflicts only) | Gaze patrol (`extras.gaze`, Büyücü Terası), sigil puzzle and choice doorways (`MazeDef`, Peri Sisleri), door-less exile rooms (`RoomDef.exile`, Leş Uyanışı) | the named dungeon | n/a |

## 2. Mapping from each dungeon doc's local numbers

Mapped from the primitive table titles and specs of each doc. "-" = the doc has no equivalent. `(part)` = the local row bundles several canonical primitives.

| Canonical | buyucu_terasi (`NP-`) | kefaret_salonlari (`P`) | les_uyanisi (`SP-`) | peri_sisleri (`S`) | taskasa (`SP-`) | yanki_agi (`YSP-`) | yigitler_sarayi (`SP-`) | yildiz_divani (v1 `SP-`) |
|---|---|---|---|---|---|---|---|---|
| SPX-01 enemy kit | 16 | 7 (part) | 01 | S1 | 01 | 01 | - | - |
| SPX-02 pack helper | - | - | 07 | - | - | 02 | - | `pack()` in YD-1 |
| SPX-03 season pool | 18 | P1 | 14 | S10 | 18 | (Pool row, `endgame`) | 7 | 13 |
| SPX-04 audio / vfx ids | 15, 14 (music) | P16 | 11 | S11 | - | 11, 12 | 9 | 10 |
| SPX-05 sky / moon / open air | 14 (sky) | P12 | - | - | - | - | 1 | 05 |
| SPX-06 art kit | 14 (styles) | P11 | 02 | S2 | 12 | 13 | - | - |
| SPX-07 verticality | - | P11 (tall walls) | 09 | - | - | - | - | new in v2 |
| SPX-08 events / conditional doors | 01 | P4 (pull) | 03 (device_lock) | - | - | 03 | - | 02 |
| SPX-09 gate styles | - | - | - | - | - | 03 (gate prop theme) | - | 06 |
| SPX-10 interactables | 03 (gaze: SPX-34), 04 (boons) | - | 03 | S7 | 13, 14 | 09 | - | 03 |
| SPX-11 grantForces | - | - | - | - | - | - | - | 04 |
| SPX-12 dormant kinds | 02 | P2 | - | S13 | - | 15 | - | - |
| SPX-13 boss orchestration | - | P3, P4, P15 | - | - | 07 | - | 4, 5 | - |
| SPX-14 intermission | 12 (reserved) | P5 (part) | - | - | 05 | - | - | 01 (part) |
| SPX-15 beams / bands | 09 | P5 (part) | - | - | 04, 06 | - | 3a | 01 (part) |
| SPX-16 soak / mark / cleanse | 08 | P5 (part) | - | S5 (part) | 08 | - | 3c, 3d | 01 (part) |
| SPX-17 orbs / fixate / zones | 07 | P5 (part) | - | - | - | 04, 05, 10 | 3b, 3e | - |
| SPX-18 images / group helpers | - | P5 (part) | 04 | - | - | - | 4 (encounterAdd) | 01 (part) |
| SPX-19 boss energy | 06 | - | - | - | 02 | - | - | - |
| SPX-20 health link / tether | 10, 11 | - | - | - | - | - | - | - |
| SPX-21 boss shields / links | - | - | - | S5 (part) | - | - | - | - |
| SPX-22 posture / strings | - | - | - | - | - | - | - | new in v2 (this doc defines it) |
| SPX-23 ability params / must-answer | 05 | - | - | S4 | 10, 17 | 07, 08 | - | 07 |
| SPX-24 statuses and hooks | 13 | P6 | 05, 10 | S3 | 09, 21 | 06 | - | 08 |
| SPX-25 hazards / zone looks | - | - | 06 | - | 19 | - | 2 | - |
| SPX-26 PROC bodies | - | P8 | - | - | 15 | - | - | 12 |
| SPX-27 animated props / shafts | - | P9 | - | - | 16 | - | - | - |
| SPX-28 trash registry / auras | - | P7 (part) | - | S8 | - | - | 6 | - |
| SPX-29 M+ checkpoints | - | - | - | S9 | - | - | - | - |
| SPX-30 content check / pace | - | - | 13 | - | 11, 20 | - | - | YD-10 |
| SPX-31 Kibirli | - | P14 | - | - | - | - | - | (CM7) |
| SPX-32 loot / trinkets | - | P13 | - | - | - | - | - | 11 |
| SPX-33 entrance looks | 17 | P10 | 12 | S12 | 18 (part) | 14 | 8 | 09 |
| SPX-34 single-dungeon systems | 03 (gaze) | - | 08 (exile) | S6 (sigils) | - | - | - | - |

## 3. Build order (waves, at most 5 agents at once, Sonnet reviews each diff, no per-agent browser tests, one Haiku QA pass at the end)

| Package | Primitives | Depends on | Acceptance |
|---|---|---|---|
| **SPX-WAVE-1** (data and ids, parallel) | SPX-01, SPX-02, SPX-03, SPX-04, SPX-09, SPX-12, SPX-26 | - | `tsc` clean; `data/enemies.ts` unchanged behaviour; content-check passes on the 4 old dungeons |
| **SPX-WAVE-2** (world and rules) | SPX-05, SPX-06, SPX-07, SPX-08, SPX-10, SPX-11, SPX-27 | WAVE-1 | a test dungeon with 3 floor levels and a lift loads; door tile height pairs validated; event flags replicate |
| **SPX-WAVE-3** (combat) | SPX-22, SPX-23, SPX-24, SPX-25, SPX-28 | WAVE-1 | posture bar, string runner and a status batch visible on the dev enemy page; windup rule check |
| **SPX-WAVE-4** (boss kit) | SPX-13 to SPX-21 | WAVE-3 | one smoke script per helper |
| **SPX-WAVE-5** (systems) | SPX-29, SPX-30, SPX-31, SPX-32, SPX-33 | WAVE-1 | content-check rules, pace tool, Kibirli thresholds on the old dungeons |
| per dungeon | `<ID>-1 ...` data, enemies, boss scripts, decor, assets, loot, entrance, audio, QA | the waves it uses | per its own doc |

Each dungeon doc's package table must show a real row for the waves it consumes (Yıldız Divanı: row `YD-S`).

## 4. Conflicts resolved here

* **Name clashes.** `SP-13` (season pool in Yıldız Divanı, content check in Leş Uyanışı), `SP-3` (devices in Leş, boss kit in Yiğitler), `SP-14` (season pool in Leş, BuffStation in Taşkasa), `SP-18` (season pool in Taşkasa, `grantForces` ids elsewhere): all retired in favour of `SPX-nn`.
* **Pool registry name.** `MPLUS_POOL` (Kefaret, Peri, Taşkasa, Yiğitler) wins over `SEASON_POOL` (Büyücü) and `MYTHIC_POOL` (Leş).
* **Soak helper.** Three names (`soakCircle`, `soakSlots`, `soakPad`) collapse into `soak(c, { slots })`; the old names stay as aliases for one release.
* **Rotating beams.** `spinBeams`, `rotatingBeams`, `sweepBeam`, `beamPair` collapse into `rotatingBeams` (+ aliases).
* **Dormant kinds.** `egg` is specified once (SPX-12) for Peri, Yanki and Yıldız.
* **Entrance look.** One recipe registry; each dungeon adds its own key.
* **Door gates.** `kill_lock`, `event_lock`, `device_lock` and pack-clear `requires` are one resolver (SPX-08), not four.
* **Trash script registry.** One merge point (SPX-28); per-dungeon tables never write to `ai/abilities.ts` directly.

## 5. Open questions (need a human decision)

1. Whether the Yıldız Divanı posture bar (SPX-22) should also apply to the other seven dungeons' elites in this season, or only to the new creature types of `GDD_CREATURES.md` (that file is referenced by CORE_MECHANICS §16 but does not exist yet).
2. Trinket slots (SPX-32): promote some signature items to trinkets in Season 1, or keep the current slots.
3. Whether `rank 'miniboss'` encounter adds take Tyrannical only (Yiğitler SP-5) for all seven docs that have emissary or add bosses (Taliksa's Zümrüt Alev Üçlüsü included).
4. The row mapping above was made from the primitive table titles and the specs visible in each doc; the owner of each dungeon doc should confirm the API merge when the wave package is written.
