# EFSUN ONLINE — Kadim Zindanlar · Architecture

Browser third-person action RPG. three.js r186 + TypeScript (strict) + Vite 8. PSX-era MMORPG look, ARPG combat juice,
WoW Mythic+ dungeons, Metin2/Knight Online upgrade systems, P2P co-op (party of 5) over WebRTC (trystero).
**All player-facing text is Turkish.** Code, ids and comments are English.

Design docs: `docs/GDD_SYSTEMS.md` (stats, classes, skills, talents, items, upgrades, progression, loot, feel),
`docs/GDD_CONTENT.md` (town, dungeons, enemies, bosses, Mythic+), `docs/NETCODE.md`, asset docs in `docs/assets/`
(`characters.md`, `environment.md`, `vfx_ui.md`, `audio.md`, `generated-*.md`, previews in `docs/assets/previews/`).

## Golden rules for every module owner

1. **Own your files.** Only edit files listed for your module (table below). If you need something from another module,
   use its documented public API (the stub signatures). Do **not** change public signatures of files you don't own.
   You MAY add new public methods/fields to your own classes. If a contract is truly missing, add the smallest
   possible addition in YOUR file and note it in your final report.
2. **Shared type files** (`src/types/*`, `src/core/events.ts`) are append-only for everyone: you may ADD optional
   fields, new union members (VFX ids, SFX ids, events, statuses) — never rename/remove/change existing ones.
   `types/vfx.ts` additions must be implemented by the vfx owner; `types/audio.ts` additions by the audio owner
   (unknown ids must fail silently at runtime, never throw).
3. **Never throw at runtime from a frame loop.** Missing asset/def → warn once and degrade gracefully.
4. `npx tsc --noEmit` must pass with zero errors in your files. Run it often. Other owners' files may be mid-change;
   only fix errors in your own files (if another module's stub blocks you, report it).
5. Use `G` (src/game/G.ts) to reach services. Use `G.events` for decoupled notifications (src/core/events.ts).
6. Deterministic where peers must agree (dungeon build, enemy ids, affix rotation): use `RNG` from core/utils with a seed.
   `Math.random()` only for cosmetics.
7. Units: 1 unit = 1 metre-ish. KayKit characters ≈ 2.4 tall at NATIVE scale 1 (ignore the 0.75 suggestion in docs/assets/characters.md; Quaternius monsters = characters.md suggestion × 4/3, as in GDD_CONTENT §0.1). Data file paths in ARCHITECTURE win over GDD suggestions (bosses live in data/enemies.ts BOSSES; M+ affixes in data/mythicAffixes.ts). Dungeon tile = 4×4 (`TILE_SIZE`). Y is up.
   Models face +Z at yaw 0 (`yawFromDir(dx,dz) = atan2(dx,dz)`). The world is flat (y = 0) except jumps/visual stairs.
8. PSX look: every loaded GLB is auto-patched (vertex snap/affine, nearest textures) via `Assets.onModelLoaded`
   (installed in game/graphics.ts). For procedurally created meshes call `patchPSX(material)` from `render/psx`.
   Prefer emissive colours for magic/fire so bloom catches them. Keep draw calls low (InstancedMesh / merge static geometry).
9. Turkish UI strings, WoW-like rarity colours (`RARITY_COLORS`), Cinzel fonts for headings (`var(--font-head)`).

## Runtime structure

```
main.ts → game/Game.ts bootGame() → services into G → scenes: loading → menu → town ⇄ dungeon
Frame order (Engine.onUpdate):  -100 net.update | 0 scenes.update (controller → world.update → camera)
                                10 skills, combat, hitShapes, mplus, loot (only when G.world) | 50 vfx, audio | 100 ui | 1000 input.endFrame
Engine renders G.scenes.current.scene/camera through EffectComposer: RenderPass → Bloom → OutputPass → PSXPostPass.
```

Scene-scoped globals: `G.world` (World), `G.player` (local Player), `G.camera` (ThirdPersonCamera) are set by
TownScene/DungeonScene on enter and nulled on exit. `G.character` (CharacterState) is set when a character is
selected in the menu.

## Module ownership

| Module | Owns (create/edit freely) | Key public API used by others |
|---|---|---|
| **core** (orchestrator) | `src/core/*`, `src/game/G.ts`, `src/game/Game.ts`, `src/game/graphics.ts`, `src/main.ts`, `src/types/*` (append-only for others), `src/entities/{Entity,Actor,AnimController,Interpolator}.ts`, `src/world/{World,NavGrid}.ts`, `index.html` | Engine, EventBus, Input, Assets, SceneManager, Settings, Save, World queries, NavGrid, AnimController |
| **world** | `src/world/DungeonBuilder.ts`, `src/world/TownBuilder.ts`, `src/world/ProceduralAssets.ts`, `src/world/*` new files (sky, lighting, decor, PSX textures) | `buildDungeon(def, scene)`, `buildTown(def, scene)`, `dungeonAssetUrls`, `townAssetUrls`, procedural PSX textures/meshes |
| **content** | `src/data/dungeons/*`, `src/data/town.ts` | `DUNGEONS`, `getDungeon`, `TOWN` (4 detailed dungeons + town layout from GDD_CONTENT) |
| **player** | `src/entities/Player.ts`, `src/entities/CharacterModel.ts`, `src/game/PlayerController.ts`, `src/camera/*` | `Player`, `PlayerController`, `ThirdPersonCamera`, `loadCharacterModel(classId, opts)` |
| **combat** | `src/combat/*` (Combat, SkillSystem, HitShapes, StatusEffects, skills/, Projectile), `src/entities/Projectile.ts`, `src/data/{classes,skills,statuses}.ts` | `G.combat`, `G.skills`, `G.hitShapes`, `CLASSES`, `SKILLS`, `STATUSES` |
| **enemies** | `src/entities/Enemy.ts`, `src/entities/EnemyFactory.ts`, `src/ai/*`, `src/data/enemies.ts` | `spawnEnemy`, `enemyAssetUrls`, `ENEMIES`, `BOSSES`, `getEnemyDef` |
| **mythic** | `src/systems/MythicPlus.ts`, `src/systems/Affixes.ts`, `src/data/mythicAffixes.ts` | `G.mplus` |
| **items** | `src/systems/{CharacterState,ItemGen,LootSystem,Progression,StatCalc,Upgrade,Vendor,Bounties}.ts`, `src/entities/LootDrop.ts`, `src/data/{items,materials,talents}.ts` + new data files for items | `G.character`, `G.loot`, `G.progression`, `CharacterState.create`, item tooltips data, `upgradeItem`, `efsun` |
| **vfx-audio** | `src/vfx/*`, `src/audio/*`, `src/types/vfx.ts` & `src/types/audio.ts` (implementing ids) | `G.vfx`, `G.audio` |
| **hud** | `src/ui/UI.ts`, `src/ui/hud/*`, `src/ui/widgets/*`, `src/ui/styles/*` (except panels-*.css and base.css tokens are append-only) | `G.ui` (panels registry, tooltips, toasts, confirm, loading), HUD |
| **panels-items** | `src/ui/panels/items/*`, `src/ui/styles/panels-items.css` | `registerItemPanels(ui)` — inventory, character (3D preview), stash, vendor/alchemist, blacksmith (+N upgrade, efsun, sockets), skill book |
| **panels-game** | `src/ui/panels/game/*`, `src/ui/styles/panels-game.css` | `registerGamePanels(ui)` — talents tree, keystone, run summary, M+ info/vault, settings, party/server browser, map, death, game menu, bounty, trainer, credits |
| **ui-kit** | `src/ui/kit/*` (`chrome.ts` window shell, `controls.ts` key caps / chips / badges / icons, `index.ts`), `src/ui/styles/tokens.css`, `src/ui/styles/kit.css` | `buildChrome`, `buildTabs`, `hintBar`, `emptyState` (every window: `k-win` / `pg-win` / `pi-win` adapters; sizes S/M/L, docks left/right/center, footer key hints) |
| **scenes** | `src/scenes/*`, `src/entities/NPC.ts`, concrete interactables in `src/entities/interactables/*` (implementing `entities/Interactable.ts`), `src/ui/menu/*` | Loading, 3D Menu (character select/create), Town, Dungeon scenes; NPC/interactables |
| **net** | `src/net/*` | `G.net` (NetSession), `net/Replication.ts`, room browser data |

## Gameplay flows

**Character**: Menu → create (name + class + colour variant) via `CharacterState.create` → `G.character` →
`G.scenes.go('town')`. Saves: `G.character.persist()` (debounced) → `G.save.write`.

**Local player**: TownScene/DungeonScene create `new Player({id: 1 + G.net.localSlot, isLocal: true, character: G.character})`,
`await player.loadModel()`, `world.add(player)`, `world.localPlayer = G.player = player`, camera + `PlayerController`.
Max HP/resource and stats come from `G.character.recomputeStats()` (StatCalc) + status mods.

**Skills**: PlayerController → `G.skills.tryCastSlot(player, slot, aim)` → SkillSystem plays anim, at the hit frame
resolves targets (World queries), calls `G.combat.playerHitEnemy` per target, spawns projectiles (combat/Projectile entities
with `G.vfx.createProjectileVisual`), vfx/sfx, broadcasts `cast` so remote peers call `G.skills.playRemoteCast`.

**Enemies**: DungeonScene spawns every PackDef member with deterministic ids (`DUNGEON_ENEMY_ID_BASE + index` in
pack/member order) via `spawnEnemy`. On the host, `Enemy.ai` (ai/EnemyAI.ts) runs: idle/patrol → aggro (pack links) →
chase (NavGrid.findPath) → abilities. Abilities create HitShapes via `G.hitShapes.spawn` (host) — telegraphs + damage.
Bosses use ai/BossController.ts with phases/mechanics from BossDef. Clients only interpolate (`applySyncState`).

**Damage authority** (keep it consistent!):
- Player → enemy: damage computed on the attacker's machine (`Combat.rollOutgoing` + `mitigate`). Host applies directly;
  a client predicts (damage number + flash) and sends `hit` to the host, which calls `Combat.applyDamageToEnemy`.
- Enemy → player: HitShapes are replicated; every peer resolves them only for ITS local player → `Combat.hitLocalPlayer`.
- Enemy HP/death, M+ forces/timer/deaths are host-authoritative and replicated. Each peer, on an enemy `death`, rolls
  its OWN personal loot (`G.loot.onEnemyKilled`) and XP (`G.progression.addXp`) if it was in range/participating.
- Player HP lives on the owning peer and is broadcast in player sync state. Heals to remote players are sent to the owner.

**Mythic+**: Keystone pedestal in town (or dungeon entrance) → panels: keystone UI → host `G.net.requestScene('dungeon',
DungeonParams)` (offline: `G.scenes.go('dungeon', params)`). DungeonScene builds, spawns, calls `G.mplus.begin(params)`
(10 s countdown, then timer). Enemy deaths → `G.mplus.onEnemyKilled` (forces). Final boss dead + forces 100% → completed →
rewards chest, keystone upgrade +1..+3 (or depleted), score/rating, `run:completed` event → summary panel → portal to town.

**Kadim Yarıklar (procedural dungeons, docs/GDD_PROCGEN.md, docs/kits/procgen_status.md)**: `src/world/procgen/*` (world module; pure, core `RNG`, no trig/clock) turns
`(theme, tier n/h/m, level, seed, version)` into an ordinary `DungeonDef` (`vertical: true`, `def.fissure` = FissureInfo). The `dungeonId` is self-describing
(`fis.<theme>.<tier>.<level>.<seed8>.<v>`): `getDungeon(id)` regenerates the identical def on every peer (LRU cache), so nothing else travels over the net;
an id of another generator version fails closed ("Bilinmeyen zindan"). Bump `FISSURE_VERSION` on any change that alters output. Guardians and the final
are EXISTING bosses (BossDef + script untouched): the boss room is cloned from the boss's own hand-made arena (same rect, props, zones, door anchors) because
BossController derives its arena from the baked rect + spawn offset (shift must stay < 400 m). Run flow: Kadim Yarık Taşı (town) -> Zindan Bulucu tab
"Kadim Yarıklar" -> `buildFissureParams` -> `startRun` (same path as every dungeon); difficulty normal/heroic/mythic (never mythicplus, never a key);
scaling = `fissureScaling` (replaces DIFFICULTY_MULT in `MythicPlus.enemyScaling`); the run completes when all 3 bosses are dead (gates force the order, so
this equals "final boss dead"); boss kills roll the normal Loot v3 boss chest (ctx normal/heroic/mythic0, fissure item level), the end chest pays gold/dust/coins
(`LootSystem.endOfRunRewards` fissure branch). Guards for `isFissureId`: MythicPlus.handleCompleted (no clearedM0 / keystone), Bounties (scalar `fis.clear.<tier>`, no per-seed flags),
Ladder. Check: `dev/combat-sim/procgen.mjs`.

**Loot**: LootDrop entities (local only) with rarity beam (`G.vfx.lootBeam`); gold auto-pickup; items by walking over (auto-loot
setting + filter) or pressing F; bag full → toast.

**Blacksmith / efsun / vendor / stash**: NPC interact → `G.events.emit('ui:openPanel', {panel: 'blacksmith'})` → panels use
`systems/Upgrade.ts` + `CharacterState` APIs.

## Net channels (NetSession generic messaging)

Wire format/details are owned by the net module (`src/net/messages.ts`, `docs/NETCODE.md`). Gameplay code uses logical
channels through `G.net.broadcast / sendToHost / sendTo / on(channel, (payload, fromPeerId) => ...)`.
**The module listed as owner both SENDS and REGISTERS THE RECEIVER** for its channel (register in your module's
constructor or init; offline the sends are no-ops and the local path is called directly).
When offline (or host and the target is local) call the local logic directly instead of sending.

| channel | direction | owner (send + receive) | payload (logical) |
|---|---|---|---|
| `pstate` | every peer → all, 15 Hz | net (Replication) | `PlayerSyncState` of its local player; remote `Player` entities are created/removed by Replication |
| `gear` | owner → all, on change | net (Replication) | visible weapon/offhand/helm items for remote models (`Player.visibleGear` + `refreshEquipmentVisuals`) |
| `snap` | host → all, 15 Hz | net (Replication) | `EnemySyncState[]` (changed/nearby) → `Enemy.applySyncState` |
| `spawn` | host → all | enemies (EnemyFactory) | dynamic enemy/add spawn `{ id, defId, x, z, level, packId }` → clients `spawnEnemy` with that id |
| `hit` | client → host | combat | `{ targetId, amount, crit, type, skillId, statuses, knockback, dir }` client-computed damage to an enemy |
| `dmg` | host → all | combat | `{ targetId, amount, crit, type, sourceId, hp }` authoritative enemy HP change (others see numbers) |
| `death` | host → all | combat | `{ entityId, killerId, pos }` — every peer then runs loot/xp for its own player |
| `estatus` | host → all | combat | statuses applied to enemies `{ targetId, status, duration, stacks }` |
| `heal` | any → owner | combat | `{ targetId, amount, sourceId }` |
| `pdeath` | owner → all | combat | local player died / revived `{ entityId, dead }` |
| `cast` | owner → all | combat (SkillSystem) | `{ casterId, skillId, aim }` → `playRemoteCast` |
| `ecast` | host → all | enemies (AI) | `{ enemyId, abilityId, name, castTime, interruptible }` / end — cast bars on clients |
| `hitshape` / `hitshape_x` | host → all | combat (HitShapes) | `HitShapeSpec` / cancel `{ id }` |
| `run` | host → all, on change + 1 Hz | mythic | `RunState` → `applyRemoteState` |
| `affix` | host → all | mythic | affix events (bursting stacks on players, etc.) |
| `gate` | host → all | scenes (DungeonScene) | boss gate open/close `{ key, open }`, boss engaged/defeated |
| `scene` | host → all | net (NetSession.requestScene) | `{ scene, params }` party scene change → `G.scenes.go` |
| `chat` | any → all | net | `{ text }` → `net:chat` event |
| `minion` | owner → all, 10 Hz | net (Replication) | `{ t, minions: MinionSync[] }` owned minions / pets / summons; remote `Minion`s are created or removed from it (GDD_CLASSES_V2 §1.5) |

## Default feedback subscriptions (decoupling)

Combat/AI/systems emit events; feedback modules subscribe so every hit "feels" right without coupling:
- **vfx**: `damage` → damage number + hit spark/blood by type + model flash; `heal` → green number; `death` → death puff/bones;
  `player:levelup` → level_up pillar; `status:applied` → looping status vfx (burn/freeze/stun stars) when the def has `vfx`.
- **audio**: `damage` (hit sounds by type/crit), `death`, `player:levelup`, `loot:pickedUp`, `run:*`, `boss:engaged` (boss music),
  `scene:changed` (music). UI code plays `ui_*` sounds directly.
- **camera** (player module): `camera:shake` → `ThirdPersonCamera.shake`. Engine: `hitstop` → `Engine.hitStop`.
- Skill-specific visuals (fireball projectile, frost nova ring...) are spawned directly by SkillSystem via `G.vfx.spawn`.

## Panels (ids for `G.ui.openPanel(id, data)`)

panels-items: `inventory`, `character`, `stash`, `vendor` (data: `{ kind: 'merchant' | 'alchemist' }`), `blacksmith`, `skills`.
panels-game: `talents`, `keystone` (Font of Power / dungeon selection, data: `{ dungeonId? }`), `runSummary` (data: run:completed payload),
`mplusInfo`, `settings`, `party` (server browser + party), `map`, `death`, `gameMenu`, `bounty`, `trainer`, `credits`.
Hotkeys (Input actions) are handled by the hud module's UI.update(): inventory, character, talents, skills, map, party, mplus, menu (Esc → closes
top panel or opens gameMenu), chat.

## Scenes

- **LoadingScene**: preload shared assets (class models, common vfx textures, UI icons), progress bar → menu.
- **MenuScene (full 3D)**: diegetic camp scene (campfire, characters on display, torches, particles, PSX fog), animated camera,
  character select (3D models of saved characters), create (class picker with live model + animations, colour variant, name),
  settings, server browser entry, credits. DOM overlay buttons styled like WoW/Metin2.
- **TownScene**: hub with NPCs (blacksmith, merchant, alchemist, stash, keystone master + portals, trainer, bounty board,
  party/lobby obelisk), training dummies, ambient life; remote party members visible.
- **DungeonScene**: build → spawn → run; boss gates; death/release/run back; end chest + exit portal.

## Precedence (read this first)

`ARCHITECTURE.md` > `src/types/*` + stub signatures > `docs/NETCODE.md` / `docs/GDD_*.md`. The GDDs give design intent and
numbers; their Appendix type sketches are illustrative only (map: GDD `mini_boss` → rank `'miniboss'`; `swarm` → role `'swarm'`
with rank `'trash'`; GDD rarity names → `Rarity` ids; slot `head` → `helm`, `main_hand` → `weapon`; stat names → `StatId`).
The **client-computed damage model below is normative**. These net/messages.ts items from the research draft are NOT used:
`CastCmd`, `CastCancelCmd`, `HitReportCmd` (victim report), `PickupCmd`, `InteractCmd`, `DiedCmd`, `LootDropEvent`, `LootPickedEvent`,
`LootGoneEvent`, `XpEvent`, `EnemyAttackEvent`, `ProjectileEvent`, `KeyResultEvent`, host lag compensation. Gameplay uses the typed
channels in `src/types/net.ts` carried in a generic envelope.

## Binding contracts (from the architecture review)

**Ids & params.** Local Player id = `PARTY_ID_BASE + G.net.localSlot`; construct with
`new Player({ id, slot: G.net.localSlot, classId: G.character.classId, name: G.character.save.name, level: G.character.level, isLocal: true, peerId: G.net.selfId, character: G.character })`.
Dungeon enemy ids = `DUNGEON_ENEMY_ID_BASE + i` iterating `def.packs` in order, members in order (optional packs included),
then `def.bosses` in order. Clients NEVER call `spawnEnemy` without an explicit id. `DungeonParams` carries `affixes`, `enemyLevel`,
`partySize` and a real `keyOwner` peer id, decided once by the host. DungeonScene calls `G.mplus.prepare(params)` on every peer
BEFORE spawning; the host calls `G.mplus.begin()` after `await G.net.waitForPartyLoaded('dungeon')`. Every scene calls
`G.net.sceneReady(id)` at the end of `enter()`.

**Death hooks — single caller.** `Combat.killEnemy` (host) and Combat's `death` receiver (clients) are the ONLY callers of:
host-only `G.mplus.onEnemyKilled(e)` (+ `onBossKilled(def.id)` if boss); every peer `G.loot.onEnemyKilled(e)` (LootSystem drops loot if the
local player is within 60 units and grants XP via `G.progression.addXp` if the local player is in the same world). Host-only
`G.mplus.onPlayerDeath(p)` is called by Combat (local death + `pdeath` receiver). Mythic/loot must NOT use the `death`/`player:died`
G.events for game logic (those are for feedback only).

**Stats.** `CharacterState.stats` are final derived values (vit→maxHp, maxHpPct applied, set bonuses...). `Player.refreshStats()`
copies them into `player.stats`, sets maxHp/maxResource/resourceType and clamps; called on `player:stats` and `onStatusesChanged()`.
Combat/AI read stats via `actor.getStat(id)` (stats + status modifiers). Enemy stats are set by EnemyFactory.

**Forced movement.** Dashes/leaps/knockbacks use `actor.forcedMove` / `actor.applyKnockback()`; PlayerController and EnemyAI skip
steering while `forcedMove` is set; Actor.update integrates it with nav collision. Enemy knockback from a client hit is applied by
the host in `applyDamageToEnemy(..., knockback, dir)` (bosses/ccImmune ignore it).

**DoTs.** The attacker fills `StatusApply.dps` (from its own stats); the host's StatusEffects ticks dots on enemies with that dps.

**Scene lifecycle.** `scene:leaving` fires before `exit()`: vfx.clear, loot.clear, hitShapes.clear, skills.reset, mplus.end (when leaving
the dungeon) are done by their owners subscribing to it. Scenes call `G.vfx.attach(this.scene, this.camera)` first in `enter()`, set
`G.world/G.player/G.camera` last, and call `G.audio.music(theme music)` themselves (audio only swaps to boss music on
`boss:engaged` and restores on `boss:defeated`/`boss:wipe`). `PlayerController`/`ThirdPersonCamera` have `dispose()`.

**Remote state.** Interpolation time base = `G.engine.time` (push and sample). `Player.update`/`Enemy.update` sample `interp` when
`!authority` and replay one-shots when `shotSeq` changes (`anim.shotSeq`). Clear the buffer on teleport. Replication spawns remote
Players on `scene:changed` and `net:peerJoined`.

**Player↔player effects.** Heals (`heal`), buffs/shields/taunt (`pstatus`) and revives (`revive`) are sent to the owner peer
(`G.net.peerOfEntity(id)`); `PlayerSyncState.statuses` shows them remotely.

**Death & release.** Local death → Combat.killLocalPlayer → `player:died` → panels-game opens `death`. "Ruhunu Serbest Bırak"
emits `player:releaseRequested` → the active scene teleports the player to the start/graveyard, `G.combat.reviveLocalPlayer(0.3)` +
2 s `invulnerable`. Party revive: hold `revive` (Z) near a dead ally for 3 s (out of boss combat) → `revive` channel.

**Boss & gates.** The host's BossController emits `boss:engaged/phase/yell/defeated/wipe`; host DungeonScene closes/opens gates and
broadcasts `gate { key, open, bossEvent }`; clients' DungeonScene applies it and emits the boss events locally. Clients' AI never emits.

**Nameplates.** The hud module auto-manages nameplates by scanning `G.world.enemies` / remote players each frame (no other module calls
`addNameplate` except for special cases).

**Keystone.** Lives only in `G.character.save.mythic.keystone` (mythic owns it; not a bag item). `PeerInfo.keystone` shows party keys;
net re-announces on `keystone:changed`. A client keystone owner starts a run with `G.net.requestSceneFromHost('dungeon', params)`.

**Pointer lock.** PlayerController handles `pointerlockchange`: unlocked while `!G.ui.wantsCursor()` → open `gameMenu`. Swallow the
Mouse0 press that re-acquires the lock. Classic camera mode orbits with RMB-drag; a quick RMB click (no drag) still casts `skill_rmb`.

**Imports.** `StatusEffects.ts` may only runtime-import `data/*`, `core/utils`, `game/G` (Actor runtime-imports it).

## Combat feel standard (USER PRIORITY: combos, effects, hit feel)

The user explicitly said combos, effects and impact feel are the most important thing. Every combat-touching module must meet:
- **Combos**: LMB basic attacks are 3–4 hit chains per class (different clips/arcs/damage, last hit = heavy finisher with bigger
  shake/knockback); input buffering (queue next press during the last 40% of a swing), cancel windows (dodge/skill can cancel the
  recovery of an attack), attack-move (upper-body attacks while running for light hits, root for heavy finishers), skill combos
  (e.g. Charge → Shield Bash stun → Whirlwind; Frost Nova freeze → Ice Lance shatter bonus; Backstab from stealth crit) per GDD.
  A HUD combo counter (hits within 2 s) with escalating style (like Hero Siege/DMC) and a small damage bonus per tier.
- **Impact**: hit-stop 40–90 ms (crits/finishers longer, scaled by hits that frame), camera shake scaled by weight, enemy hit-flash
  (white emissive 80 ms) + hit reaction anim (Hit_A/Hit_B) + small knockback/stagger, spark/blood/magic particles oriented along the
  swing, weapon trails on every swing, crit = bigger numbers + `crit_burst` + `hit_crit` sound + slight slow-mo, kill = death
  puff/bone scatter + extra shake. Enemy deaths can be flung by the killing blow (forcedMove + Death clip).
- **Sound layering**: swing whoosh + impact by material (flesh/bone/metal) + crit layer + voice barks on heavy attacks/hurt.
- **Readability**: telegraphs with fill progress, cast bars, enemy windup glow (`enemy_cast_glow`), damage numbers that pop & arc.
- **Responsiveness**: <100 ms from input to visible motion, movement never "sticky", dodge always available unless stunned.

## Definition of done (every module)

- Compiles (`npx tsc --noEmit`), no runtime exceptions in the console during normal play.
- Turkish text, PSX-friendly visuals, responsive to window size.
- Report: what you built, public APIs added, known gaps, anything another module must do.

## V2 contracts (WP1)

Design source: `docs/GDD_V2.md` (§0 ids/bindings, §12 packages, Appendix A types). WP1 added **types, ids, events, bindings,
settings, save migration and compile-only stubs**. Behaviour belongs to the owners in waves 1-3. The only runtime wiring is listed below.

**New files** (all compile-only; empty registries unless noted)
- `types/v2.ts` (core): Appendix A types verbatim (`RoleId`, `SpecId`, `SpecDef`, `FamilyId`, `FamilyDef`, `RuneDef`, `FlaskBaseDef`, `OrbDef`, `AspectDef`, `SealDef`, `TierSetDef`, `ParagonBoardDef`, `RaidInfo`, `WeaponArtDef`, `ComboRouteDef`, `TankRoute`).
- `data/specs.ts` (combat): `SPECS`, `getSpec(id)`. `data/weaponArts.ts` (combat): `WEAPON_ARTS`, `getWeaponArt`. `data/comboRoutes.ts` (combat): `COMBO_ROUTES`.
- `data/runes.ts`, `data/flasks.ts` (`FLASK_SLOT_COUNT = 5`), `data/orbs.ts`, `data/aspects.ts`, `data/tierSets.ts`, `data/paragon.ts` (items). `data/seals.ts` (mythic). `data/routes.ts` (panels-game): `TANK_ROUTES`. `data/abilityTips.ts` (enemies): `ABILITY_TIPS`, `abilityTip(id)`.
- `data/families.ts` (existing file, append-only): `FAMILIES` (empty), `weaknessOf(def, type) -> { resist, weak, resisted, immune }` (GDD_V2 §7.3: Zayıf <= -0.20, Dirençli >= 0.50, Bağışık >= 0.95; `def.resist` wins over the family default; arcane = lowest of fire/frost/lightning). `familyOf` gained an overload `familyOf(def: EnemyDef): FamilyId | undefined`; the string overload used by LootSystem is unchanged.

**Extended shared types (append-only)**
- `types/stats.ts`: 12 StatIds (`healingPct threatPct poiseDamagePct guardGauge weaponArtPct finisherPct flaskGainPct flaskEffectPct weakDamagePct majorCdrPct runeEffectPct parryWindow`) with STAT_INFO.
- `types/skills.ts`: `SkillSlotKey` += `m45 m90 m180` (also in `SKILL_SLOT_KEYS`), `SkillDef.spec?`, `AimInfo.allyId?`, 32 StatusIds. Each new StatusId still needs a `StatusDef` and `STATUS_RULES` entry in `data/statuses.ts` (WP5).
- `types/items.ts`: `ItemCategory` += `flask`; `ItemInstance` += `aspectId aspectRoll exalted corrupted flaskTier`.
- `types/enemies.ts`: `EnemyDef` += `poise poiseRegen poiseDelay hyperArmor stanceBreakable backstabbable family profile`; `EnemyAbility` += `parryable perilous kick tankBuster`.
- `types/mythic.ts`: AffixId += `seasonal_kizil_ay seasonal_sis`; `RunState` += `raid wipes brez seals deathLog partySize`; `RunRecord.seals`; `MythicProfile.seasons`.
- `types/dungeons.ts`: `DungeonDef.raid?: RaidInfo`; `TownNpcRole` += `codex tierset crafting`.
- `types/vfx.ts` (39 ids) and `types/audio.ts` (26 ids) from GDD_V2 §3.11, §2.2 and §7.3. vfx-audio implements them in WP6; unknown ids fail silently.
- `combat/HitShapes.ts`: `HitShapeSpec` += optional `parryable perilous low poise`.

**CharacterSave v2** (`core/Save.ts`, `SAVE_VERSION = 2`). `normaliseCharacterSave()` runs on every `Save.load()` and fills defaults, so v1 saves still load. New fields: `spec` (undefined until chosen), `specBars`, `skillRunes`, `flasks` (5), `flaskCharges` (5), `codex`, `bestiary`, `paragon`, `routes`, `raid`, `titles`, `title` (undefined), `cosmetics`, `majorCd { m45, m90, m180 }`.
- Deviation: `majorCd` is top-level, not in `flags`, because `flags` is `Record<string, number | boolean | string>`. Scalar markers (catalyst, key-swap week, tutorial flags) go in `flags` by convention.
- `CharacterState.create` still writes `version: 1` (items owner: switch to `SAVE_VERSION`). The migration upgrades it on load anyway.

**Net channels** (`types/net.ts`): `threat { e, v, t }` (4 Hz), `kick { id, ready, order? }`, `spec { id, spec }`; `hit.poise?`; `pdeath.by?/av?`; `pstate.mcd?` (typed as an intersection, since `PlayerSyncState` lives in `entities/Player.ts`).
- **Blocker for net owner:** `KNOWN_CHANNELS` in `net/messages.ts` does not list `threat`, `kick` or `spec`. `NetSession` drops unknown channels, so they must be added before wave 1 networking.

**Events** (`core/events.ts`): `parry`, `riposte`, `poise:break`, `crit:finisher`, `guard:broke`, `threat:update`, `kick:request`, `major:used`, `hero:cast`, `flask:used`, `spec:changed`, `weakness:hit`, `run:recap`, `camera:punch { fov, in, out }`. `damage` += `weak?`, `resisted?`. Payload shapes are in the file.

**Input** (`core/Input.ts`): every §0.4 action is appended with its default and TR name: `guard` (G, Mouse3), `skill_m45` X, `skill_m90` V, `skill_m180` T, `flask1..5` = 6..0, `targetAlly` U, `partySel1..5` F1..F5, `paragon` P, `townPortal` Y.
- **Conflict for the orchestrator:** the doc puts `bestiary` on L, but L is already `quests` (existing binding, unchanged). `bestiary` stays unbound (`[]`) until someone decides.
- F2 to F5 are `preventDefault`ed only while `Input.gameScene` is true. `Game.ts` sets it on `scene:changed` (town or dungeon). Mouse3/4 browser navigation is swallowed only while bound.

**Settings** (`core/Settings.ts`): `healTargeting: 'smart'`, `autoCombo: false`, `showForces: true`, `kickTracker: true`, `showTankRoute: true`.

**Minimal wiring in files owned by later packages** (typing only, no behaviour change):
- `game/PlayerController.ts`: `m45 m90 m180` added to `SLOT_ACTION` and `repeat`; the slot loop skips them until WP5 wires majors.
- `ui/panels/items/common.ts` and `SkillsPanel.ts`: labels for `flask` and the major slots.
- `entities/NPC.ts`: default presets for `codex`, `tierset`, `crafting`.

**Open items for the orchestrator**
- `IncomingHit` (`combat/Combat.ts`, WP2) still needs optional `parryable? perilous? melee?`.
- `sfx_cd_ready` (§2.1 Ready ping) is outside the WP1 id sources (§3.11, §2.2, §7.3). Add it with the vfx-audio owner if wanted.
- Every new StatusId needs a `StatusDef` (WP5). Majors need their `SkillDef`s (WP5).

## Class contracts (GDD_CLASSES_V2 NC01–NC04)

Design source: `docs/GDD_CLASSES_V2.md` (§0.2 ids, §1.1 type additions, §11 vfx/sfx, §14 packages). This block adds **types, ids,
aliases, events, the net channel type and compile-only stubs** for the five new classes. Behaviour belongs to the owners named below.
**The five new classes are NOT selectable**: `PLAYABLE_CLASSES` (data/classes.ts) still lists the four KayKit classes, and
the menu (`CLASS_ORDER`, ui/menu/classInfo.ts) is unchanged until NC60. Old saves need no migration: no new persisted fields.

**Types (append-only)**
- `types/common.ts` (core): `ClassId` += 5 ids; `ResourceType` += `focus faith essence`; `PipId`; `EntityKind` += `minion`;
  `MINION_ID_BASE = 900_000` (minion ids, networked, below `LOCAL_ID_BASE`).
- `types/stats.ts` (core): `minionDamagePct minionHpPct trapDamagePct` (STAT_IDS + STAT_INFO).
- `types/skills.ts` (core): `SkillDef` += `pip route minion aura allyTarget animCycle holdAnim`; `StatusId` += 33 ids (each still needs
  a `StatusDef` + `STATUS_RULES` entry: NC21 / NC22); `ClassDef.resource` is `ResourceType`.
- `types/v2.ts` (core): `SpecId` += the 11 wave-1 specs (`monk_brewmaster … warlock_destruction`).
- `types/items.ts` (core): `ItemCategory` += `fist` (Keşiş's weapon category; the fist bases come with NC06 / NC09).
- `types/classes.ts` (NEW, core): `PipDef`, `ClassVisualDef`. `types/minions.ts` (NEW, core): `MinionRole`, `MinionAttack`, `MinionDef`
  (verbatim §1.5), `MinionSync` (the net snapshot). `types/net.ts`: channel `minion: { t, minions: MinionSync[] }`.
- `core/events.ts` (core): `pips:changed {id, points, max}`, `minion:spawned`, `minion:died`, `minion:despawned {reason}`,
  `minion:command`, `corpse:added`, `corpse:removed {reason}`.
- `types/vfx.ts` / `types/audio.ts` (vfx-audio): the §11.1 / §11.2 ids appended (38 VFX, 24 SFX; `wolf_howl` was already in WP1).

**Data**
- `data/classes.ts` (combat): `ClassDefX` optional fields (`resourceColor tagline icon armorWeight weapons offhands secondary specs
  visual voice anims cameraProfile trait regenRule manaScaling`); five registry entries `monk archer paladin necromancer warlock` with
  the §0.2 / §2.1–§6.1 numbers; `PLAYABLE_CLASSES` + `isPlayableClass()`. `CLASS_IDS` stays the four old ids (dev pages).
- Presentation and item maps (`itemBases.ts`, `CharacterState.ts`, `CharacterModel.ts`, `classInfo.ts`, `ui/hud/*`, `ui/panels/*`,
  `systems/StatCalc.ts`, `ItemGen.ts`, `talents.ts`, `dev/*`) got literal rows for the five classes so they compile. They mirror the
  registry; NC06–NC09 and NC60 replace them with registry-derived data. Old four rows are unchanged.
- `data/skillsets/` (combat, NEW): `types.ts` (`SkillInput`, `SkillAdd`) and 13 compile-only stubs exporting `register<Name>(add)`:
  `monk archer paladin necromancer warlock` (combo + 8 core, NC10–NC20), `monkSpecs archerSpecs paladinSpecs paladinHoly
  necromancerSpecs warlockSpecs` (spec skills + majors), `layerMonkArcher layerPaladinCasters` (Elden Ring rows, NC31–NC32).
  `data/skills.ts` calls each one once. A package fills only its own file and never edits `data/skills.ts`.

**Aliases (vfx-audio)**
- `vfx/aliases.ts`: `VFX_ALIASES` (§11.1 table) and `resolveVfxAlias(id)`. `VFX.spawn` resolves: registered preset → alias
  (existing presets at the same spot; caller `color` wins, caller `scale` multiplies, `yOffset` and `extra` layers) → silently nothing.
- `audio/aliases.ts`: `SFX_ALIASES` (§11.2 table) and `resolveSfxAlias(id)`. `Audio.playInternal` plays the alias target when
  `SFX_MANIFEST[id]` is missing (pitch and volume multiply the caller's). Unknown ids still warn once and stay silent.

**Net**: `minion` is listed in `KNOWN_CHANNELS` (net/messages.ts). Sent by the owning peer at 10 Hz; net owner = NC43.
Still open for the net owner: V2's `threat`, `kick` and `spec` are missing from `KNOWN_CHANNELS` (V2 WP1 blocker, not changed here).

**Minion damage authority (NC42 / NC43 / NC44).** A minion's HP lives on its OWNER's peer, like a player's. *Enemy → minion*: the host AI scores
minions in the same threat table as players (`World.getActor` now returns `kind 'minion'`; a hit made through a minion carries `viaId` and
splits the threat 0.6 owner / 0.4 minion; a `taunt` minion attack applies the `taunt` status with the MINION as source and puts it at
`max(own, top × 1.10) + 100`). Damage comes only from HitShapes and hostile Projectiles, which every peer already holds: each peer resolves
them for its local player AND for its own minions (`Minion.ownerId` = local player, `authority` true) with `Combat.hitMinion` (mitigation =
`armorFrac`, no dodge / block / parry, no statuses or knockback yet; 'safe', 'soak' and 'friendly' shapes never hurt minions). A remote copy
is never hurt locally; its hp only mirrors the owner's snapshot. Death (`Minions.die`) is decided by the owner and reaches everyone as
`hp ≤ 0` in the next `minion` snapshot. *Minion → enemy*: `Minions.strike` → `playerHitEnemy` with the owner's stats (half crit chance); a
client forwards it as the normal `hit` with `via` (the host honours `via` only for a live minion of the sender, and uses it for the threat
split and for a minion taunt). *Replication*: `minion { t, minions: MinionSync[] }` is the owner's FULL list at 10 Hz (unchanged lists repeat
every 0.3 s, an empty list is sent once). Receivers keep non-authoritative `Minion` copies in `World.minions` only (not in `G.minions.list`):
ids must lie in the sender's slot range (`MINION_ID_BASE + slot × 1000 + n`), the owner is forced to the sender, unknown defs are ignored,
a copy is dropped when the owner's list no longer holds it, 1.5 s after its last snapshot, on peer leave and on scene change. The local
player's minions are shown by `ui/hud/MinionFrames` (one row each, groups of more than 4 of a def collapse into a "×N" row).

## Talents contracts (GDD_TALENTS T0)

Design source: `docs/GDD_TALENTS.md` (§0.3 overrides OT1–OT9, §0.4 ids, Appendix A types, Appendix B events, Appendix C save).
This block adds **types, ids, events, settings, the save migration, the net field and compile-only stubs** for the talent system
(WoW trees, spec choice, loadouts, passive web, procs, skill mastery). Behaviour belongs to the owners in waves 1–8. `SAVE_VERSION`
stays 2 (V2 WP1 bumped it); the talent fields are optional and filled by `migrateTalents` once per save.

**New ownership rows** (these paths are owned by the module named; the module table above is unchanged)

| Module | Owns (talents) |
|---|---|
| **panels-game** | `src/ui/panels/game/talents/*` (the new N window tabs, dialogs, shared views), `src/ui/styles/panels-talents-*.css`. Panel ids unchanged (`talents`, `trainer`, `keystone`). |
| **items** | `src/data/talentTrees/*` (tree framework, raw generated data), `src/data/{passiveWeb,passiveExtra,skillSpecs,jewels}.ts`, `src/systems/{Talents,talentStrings,SkillMastery}.ts`, `tools/gen-talent-data.mjs`, `tools/apply-talent-patch.mjs` (applies class-package patches `docs/kits/talents_<class>.json` to `docs/GDD_TALENTS.trees.json`; run gen-talent-data after), `tools/talents-check.mjs`. |
| **combat** | `src/combat/{skillMods,Procs,procActions,procConds}.ts`, `src/combat/specs/mage.ts`, `src/combat/skills/utilities.ts`, `src/data/skills_mage_specs.ts`, `src/data/skills_class_utils.ts`, `src/data/statuses_talents.ts`, `src/data/specs_talents.ts`. |
| **core** | `src/types/talents.ts`, `migrateTalents` / `remapBars` in `src/core/Save.ts`, `G.talents` / `G.procs` wiring in `src/game/Game.ts`. |

**Types (append-only)**
- `types/talents.ts` (core, NEW): Appendix A verbatim: `TreeKind`, `NodeType`, `SlotId` (`s01`–`s30`), `FxText`, `TreeNodeDef`, `TreeDef`,
  `TalentLoadout`, `TalentBuild` (`v: 1`), `SkillSpecRow`, the parsed effect DSL (`Cond`, `FxItem`), `ModEntry`, `ProcEntry`, `ActiveFx`.
- `types/common.ts`: `PipId` += `arcane` (Gizem Yükü). `types/stats.ts`: `StatId` += `skillMasteryPct` (Ustalık Kazancı, `pct`).
- `types/skills.ts`: `StatusId` += 13 ids (`hot_streak … ice_block`); each needs a `StatusDef` (merged from `data/statuses_talents.ts`).
- `types/v2.ts`: `SpecId` += `mage_fire`, `mage_frost`, `mage_arcane`, `monk_mistweaver` (the 21-spec list, OT1). `mage_elementalist` and
  `mage_lightbringer` stay in the union (the migration reads them). `SpecDef` += `treeSkills?: Record<string, SlotId>`, `fx?: string`.
- `types/character.ts`: `CharacterSave` += `tb?: TalentBuild`, `skillMastery?: Record<string, number>` (XP per skill id),
  `passiveExtra?: { picks; jewels }`. (`spec?` already exists from V2 WP1.)
- `types/net.ts`: `cast` += `sf?: number` (skill-specialisation picks of the cast skill: 3 tiers × 2 bits). No new channel.
- `types/vfx.ts`: `shape_split shape_orbit shape_return shape_echo shape_pull blazing_barrier`. `types/audio.ts`: `talent_take
  talent_untake talent_apply talent_capstone spec_choose`. Both are implemented by vfx-audio (T19); unknown ids fail silently.
- `data/talents.ts` (`TalentNode`, items): `kind` += `mastery`, `socket` (OT9); optional `fx`, `choices`. Existing `Record<kind, …>` maps
  in `ui/panels/game/talents.ts` got the two new keys (display-only, no node uses them yet).
- `core/events.ts`: `talents:committed { kind: 'wow' | 'web' }`, `loadout:changed { specId }`, `skillmastery:changed { skillId, rank }`,
  `passives:changed`. **Not added:** Appendix B's `spec:changed { specId, prev }`. The GDD_V2 event `spec:changed { entityId, spec }` already
  exists and its payload must not change; TalentSystem.setSpec emits that payload.
- `core/Settings.ts`: `autoApplyPassives: boolean` (default `true`; web view pure additions auto-apply after 1.5 s, §5.5).

**Save migration** (`core/Save.ts`, runs from `normaliseCharacterSave`, once per save via `flags['tb.migrated']`)
- `migrateTalents(save)` (pure, Appendix C): fills `tb`, `skillMastery`, `passiveExtra`. `mage_elementalist` becomes `mage_fire` or
  `mage_frost` (frost family web nodes > fire family → frost), `mage_lightbringer` becomes `mage_arcane`. Both set `flags['tb.freeWebReset'] = 1`.
- `remapBars` copies `specBars[old]` to the new spec, sets `m45`/`m90` as given, and drops a slot only when its skill is neither in `SKILLS`
  nor listed by the new spec. While the new spec is not registered (stub), nothing is dropped.
- The migration is idempotent and never touches `talents` (the web keeps its shape and meaning). Old saves load with `spec` as it was.

**Events and flags** (Appendix B): flags `pp.dun.<dungeonId>.<n|h>`, `pp.reg.<regionId>`, `pp.raid.<bossId>` (passive milestones, value 1),
`tb.migrated`, `tb.freeWebReset`, `tb.pulse` (HUD pulse until the window opens).

**Services**: `G.talents?: TalentSystem` (`systems/Talents.ts`, stub until T5) and `G.procs?: ProcEngine` (`combat/Procs.ts`, stub until T4),
both created in `game/Game.ts` after `G.progression`.

**Data merges** (stubs fill the registries; the merge lines are already in place)
- `data/skills.ts` ends with `Object.assign(SKILLS, MAGE_SPEC_SKILLS, CLASS_UTIL_SKILLS)`. `data/statuses.ts` has `Object.assign(STATUSES, TALENT_STATUSES)`.
  `data/specs.ts` has `Object.assign(SPECS, TALENT_SPECS)`. `combat/skills/behaviors.ts` imports `./utilities` and `../specs/mage` at its end.
- `TALENT_PIPS.arcane` (`data/specs_talents.ts`) holds the Gizem Yükü pip definition. No class uses it yet (T8 decides how `mage_arcane` gets it).

## Items V2 and Life contracts (GDD_ITEMS_V2 IT-00, GDD_LIFE L-00)

Design sources: `docs/GDD_ITEMS_V2.md` (§0 ids and overrides, §7.2 IT-00, Appendix A) and `docs/GDD_LIFE.md` (§0.2 assumptions A1–A12,
§1.2 professions, §3.8 chat net, §7.5 PvP net, §8.1 L-00). This block adds **types, ids, events, settings, the save defaults,
the net channel types, the data and system stubs**. Behaviour belongs to the owners in the waves of each plan. Both packages are
append-only: nothing existing was renamed or removed, and an old save loads unchanged (`normaliseCharacterSave` fills `upg` and `professions`).

**New ownership rows** (the module table above is unchanged; these paths belong to the module named)

| Module | Owns (items v2 / life) |
|---|---|
| **core** (IT-00, L-00) | `src/types/{itemsV2,professions}.ts`, `src/data/itemVisuals.ts` (complete in IT-00; read by vfx, player and panels) |
| **items** | `src/data/{upgradesV2,currencies,efsunSpecial,benchRecipes,engravings,tilsim,dragonStones,camp,homeProps,professions,gatherMaterials,nodes,recipes,statWeights}.ts`, `src/systems/{Stacks,Masterwork,Crafting,Quality,Tilsim,Housing,Professions,ItemLevel}.ts` |
| **content** | `src/data/{regions,gatherNodes}.ts` (life) |
| **world** | `src/world/NodeVisuals.ts` (life) |
| **panels-items** | blacksmith split (`ui/panels/items/*`), `src/ui/panels/items/CraftingPanel.ts` (registered as `crafting`, life) |
| **vfx-audio** | `src/vfx/{ArmorGlow,ArmorShader}.ts`, the `vfx/aliases.ts` and `audio/aliases.ts` entries for the new ids |
| **player** | `src/entities/armorLook.ts` (`computeArmorLook`), `src/entities/CharacterModel.ts`, `src/entities/Player.ts` (`VISIBLE_SLOTS`) |
| **scenes** | `src/scenes/{Camping,RegionTracker,Stations}.ts`, `src/entities/interactables/{GatherNode,Carcass,CampSite,HouseDoor}.ts`, the `camp` / `home` senders (IT-57) |
| **net** | `pvp` channel (L-71), `lchat` lobby channel (L-32), the `KNOWN_CHANNELS` entries of `camp`, `home`, `pvp` (see open items) |
| **panels-game** | `src/ui/panels/game/home.ts` (panel `home`, P3), `src/ui/panels/game/professions.ts` (life) |

**Types (append-only)**
- `types/itemsV2.ts` (core, NEW): Appendix A verbatim (`ArmorLevels`, `ArmorLook`, `UpgLogEntry`, `UpgState`, `QualityInfo`, `PlusStyle`,
  `ChatAnn`, `CampState`, `HomeSave`, `HomeSnapshot`, `CampMsg`, `HomeMsg`) plus `OpResult` (the stub result shape).
- `types/professions.ts` (core, NEW): GDD_LIFE §1.2 verbatim (`ProfessionId`, `StationId`, `ToolKind`, `ProfessionDef`, `ProfessionSave`,
  `NodeTypeDef`, `ToolDef`, `RecipeDef`, `SkinDef`).
- `types/items.ts`: `RolledAffix.s?`; `ItemInstance` += `bench? special? mw? tilsim? eng? broken? upgradeBroken? craftedBy?`. `failStacks` is DEPRECATED (O-IT4).
- `types/character.ts`: `CharacterSave` += `upg?`, `home?`, `camp?`, `professions?`.
- `types/enemies.ts`: `HitMaterial`, `EnemyDef.skin? hitMaterial?`, `EnemyVisual.texture?`, `BossDef.introCam?`.
- `types/dungeons.ts`: `NodeSpawnDef`, `DungeonDef` += `home? nodes? regions?`, `TownNpcRole` += `home`.
- `types/stats.ts`: `pvpPower`, `pvpResilience` (STAT_IDS and STAT_INFO: "PvP Gücü" / "PvP Direnci").
- `types/net.ts`: `ChatChannel`, `ChatLink`, `ItemSnapshot`, `PvpMsg`; `chat` widened (`ann?`, `ch?`, `to?`, `links?`, `emote?`, `roll?`);
  `NetChannels` += `camp: CampMsg`, `home: HomeMsg`, `pvp: PvpMsg`.
- `net/messages.ts` (types only): `MAX_ROOM_SIZE = 8`, `LobbyChatMsg` and `LobbyChannels.lchat`, `RoomAnnouncement.minIlvl? mode?`.
- `types/vfx.ts`: `set_aura forge_announce forge_announce_rainbow camp_light camp_smoke` (ITEMS) and `wood_chips rock_chips leaf_burst gather_sparkle` (LIFE L-00b).
- `types/audio.ts`: `forge_strike forge_heartbeat forge_ding forge_crack forge_shatter camp_crackle ann_chime` (ITEMS) and
  `chop_wood mine_rock pick_herb skin_cut tree_fall craft_done chat_whisper` (LIFE L-00b). Unknown ids stay silent until they are mapped.
- `scenes/scenes.ts`: `DungeonParams.homeOwner?` (entity id of the house owner).

**Events** (`core/events.ts`, payloads in the file). ITEMS: `upgrade:attempt upgrade:announce efsun:changed camp:placed camp:expired home:entered home:left`,
and `item:upgraded` += `outcome? stacksBefore? stacksAfter?`. LIFE: `gather:progress gather:done profession:skillUp craft:done region:entered
region:left camera:kick camera:fov chat:insertLink pvp:flag pvp:duel pvp:honor`; `net:chat` is widened to `ChatChannel`.
`pvp:duel` `state` is `invited | accepted | declined | started | ended` (the doc gives no states; the §7.5 `op` names are the wire form).

**Settings** (`core/Settings.ts`). ITEMS: `armorGlow` (`'high'`), `fastForge` (`false`). LIFE chat: `chatFilter`, `chatFontSize`, `chatOpacity`,
`chatTimestamps`, `chatBubbles`, `chatTradeMuted`, `chatIgnore`. LIFE camera: `cameraAutoFollow`, `cameraAutoShoulder`, `cameraCombatZoom`,
`cameraLookAhead`, `cameraSensYRatio`, `cameraAccel`, `cameraSmoothing`, `occluderFade`, `bossIntroCam`, `bossAutoLock`, `lockOnMode`, `rumble`.
**Deliberate behaviour change:** `screenShake` default is now `0.7` (was `1`; GDD_LIFE §4.11 and Appendix A.2 #2). Stored values still win.

**Input** (`core/Input.ts`): `professions` (Meslekler) and `camShoulder` (Omuz Değiştir) are appended and **unbound** (`[]`). The doc's
`KeyP` is `paragon` and `KeyV` is `skill_m90`. `KeyH` is the only letter key not in `DEFAULT_BINDINGS`; the orchestrator picks the binding.

**Entities and services** (type contracts, default-off behaviour): `Interactable` hold fields (`holdSeconds`, `holdStart`, `holdTick`,
`holdCancel`, `holdInfo`); `AnimController.freezeUntil` (clip time × 0.04 while `performance.now() < freezeUntil`); `Actor.hitFreezeUntil`
(forced movement × 0.04). Both fields are `0` by default, so nothing changes until a package sets them. `G.professions?: Professions`
(`systems/Professions.ts`, a stub until L-05).

**Data** (`src/data/`). `itemVisuals.ts` is COMPLETE: `UPGRADE_TIERS`, `tierOfLevel`, `ARMOR_SLOT_ORDER`, `ARMOR_WEIGHTS`, `bodyLevel`,
`ARMOR_LOOK`, `ARMOR_PARTICLES`, `ARMOR_ANCHORS`, `ARMOR_EMIT`, `SET_AURA_COLORS`, `setAuraColor`, `SET_AURA`, `QUALITY_BANDS`,
`SEAL_THRESHOLDS`, `SEAL_STYLE`, `plusStyle(up, mw)`. The other files hold their final constants and neutral registries (`{}` / `[]`):
`upgradesV2` (`STACK_MAX`, `CHANCE_CAP`, `STACK_RULES`, `SCROLLS`, `STONE_*`, `MASTERWORK`), `efsunSpecial` (`S_TIER_*`), `benchRecipes`
(`BENCH_COST`, `BENCH_SLOTS`, `SPECIAL_SLOTS`), `tilsim` (`TILSIM_TYPES`, `TILSIM_GRADES`), `dragonStones` (`DRAGON_COLORS`, `DRAGON_GRADES`),
`camp` (`KAMP`), `homeProps` (`HOME_TIERS`, `TROPHY_BITS`). The enable flags `TILSIM_ENABLED`, `ENGRAVING_ENABLED`, `DRAGON_ENABLED`,
`CAMP_ENABLED` and `HOME_ENABLED` are all `false` until their phase ships.

**Systems** (stubs that return `{ ok: false, reason: 'Henüz yok.' }` or `null`): `Stacks` (`stackState makeStone loadStone buyStone sellStone`),
`Masterwork` (`masterworkCost masterwork`), `Crafting` (`previewCurrency applyCurrency canUseCurrency rollSpecial benchLine`), `Quality`
(`itemQuality`), `Tilsim` (`tilsimSpecial`), `Professions` (class).

**Save** (`core/Save.ts`, `normaliseCharacterSave`). `upg` defaults to `{ stacks: 0, fails: 0, wins: 0, destroyStreak: 0, best: 0, log: [] }`;
`professions` defaults to `{}`. `camp` and `home` stay undefined until used. `SAVE_VERSION` stays 2.

**Items V2 flows (contracts)**
- *Armor glow:* the six armor slots carry their own `+N` (`ArmorLook.lv`); the body level is `bodyLevel(lv)` (chest counts double); the set aura
  comes from the `item.setId` counts. The shader is a patch on the skinned materials (GDD_ITEMS_V2 §1.3); the particles use `ARMOR_PARTICLES`.
  Remote players get the six slots through the `gear` channel (`VISIBLE_SLOTS` grows in Player and Replication; `broken` is kept by `compactItem`).
- *Upgrade v2:* the per-character `upg.stacks` (Talih Birikimi) feeds `chanceOf`; scrolls (`SCROLLS`) add their pp and soften failures; bound items
  become `broken` instead of destroyed; the Demirci Acıması streak uses `upg.destroyStreak`; Ustalık (`item.mw`) applies at +15 only.
- *Efsun layers:* one engine (`Crafting.applyCurrency`) serves layer A (`efsun_nesnesi`, `takviye_nesnesi`, `kadim_efsun`, `efsun_kilidi`) and
  layer B (`orb_*`). Slot 6 is `item.bench`, slot 7 is `item.special` (`RolledAffix.s` holds the S-tier). `efsun:changed` announces every change.

**Life flows (contracts)**
- *Gathering and crafting:* `CharacterSave.professions` holds skill and tier per profession; `gather:progress` and `gather:done` drive the hold bar;
  `profession:skillUp` and `craft:done` are the feedback events. Node data is `NodeTypeDef`; `DungeonDef.nodes` places the nodes.
- *Regions:* `DungeonDef.regions` lists the region ids of a map; `region:entered` and `region:left` come from `scenes/RegionTracker`.
- *Chat:* `chat` carries channel, whisper target, `links` (at most 2 `ChatLink`), emote and roll. Global and trade text rides `lchat` (town only).
- *PvP:* the `pvp` channel (flag, duel, hit, ack, kill, score) is relayed by the host to the victim only (§7.5). The `pvp:*` events are local feedback.

**Open items for the orchestrator (decided by the doc owners, not here)**
1. **Net whitelist:** `KNOWN_CHANNELS` (net/messages.ts) does not list `camp`, `home` or `pvp`, nor V2's `threat`, `kick` and `spec`. The net owner adds each
   one together with its sender (the V2 precedent). `lchat` is typed but not in `LOBBY_CHANNELS`; L-32 adds it.
2. **`DungeonParams.returnTo`:** IT-00 asks for `returnTo?: { scene, x, z, yaw? }`, but the existing field (used by world entrances) has another shape and
   cannot change. Not added. The house visit needs a new name (for example `homeReturn`), to be chosen in IT-57.
3. **`DungeonParams` location:** it lives in `scenes/scenes.ts`, not `types/dungeons.ts`. `homeOwner?` was added there.
4. **Input bindings:** `professions` and `camShoulder` stay unbound (see Input above).
5. **`screenShake` default 0.7:** a deliberate behaviour change from the GDD (see Settings above).
6. **Stubs:** `benchValue` returns 0. `BENCH_COST_CLASS`, `ENGRAVINGS`, `TILSIMS`, `DRAGON_STONES`, `CURRENCIES` and `SPECIAL_AFFIXES` are empty until their packages land.

## CM14 Pazar contracts (CORE_MECHANICS §11)

Metin2-style AFK player shops. Owner of the whole package: items module (logic) + panels-game (UI) + scenes (world presence).

| Path | What |
|---|---|
| `src/data/market.ts` | rules (`MARKET`: fee 1 %, tax 3 %, 12 / 24 slots, title 32, announce 30 s, buy timeout 10 s, range 6 m, 40 text boards), spot grid (`marketSpots`, plaza 10x6 = 60, village 4x3 = 12, 2.5 m apart), `assignSpot` / `spotPriority`, licence rows (`BOHCA_DEFS`), `TEZGAH_USTASI_PRESET` + `tezgahUstasiDef` |
| `src/systems/Market.ts` | `Market` / `getMarket()`: own stall (open / close / setPrice / delist), announce, seller-side sale, buyer-side buy, search, price history, pin. Injectable `MarketCtx` (headless check) |
| `src/systems/MarketWire.ts` | compact snapshots + sanitisers of `shop` / `shopBuy` / `shopSold` (all input is untrusted) |
| `src/world/MarketStalls.ts` | `mountMarket(scene, origin, { world, npc })` / `unmountMarket()`: instanced procedural stalls, seated sellers, goods, canvas-text boards (LOD 40), beam for "Göster" |
| `src/entities/interactables/MarketStall.ts` | the F target of one stall (range 6 m) |
| `src/ui/panels/game/market/*` | panels `marketOpen` (Tezgâh kur / yönet / Bohça Al), `marketStall` (alıcı), `marketSearch` (Pazar Arama); `pazarci.ts` = Pazarcı Modu; CSS `ui/styles/panels-market.css` |

- **Net:** channels `shop` (announce, broadcast), `shopBuy` (buyer -> seller), `shopSold` (seller -> buyer) ride the global **lobby** room (`LOBBY_CHANNELS`, `LobbyChannels`), not the party room, so buyer and seller need not share an instance. The sender is `MessageMeta.from` (the lobby peer id), never a payload field. Payload types are in `types/net.ts` (`ShopAnnounce`, `ShopBuyMsg`, `ShopSoldMsg`, also in `NetChannels`, deliberately NOT in `KNOWN_CHANNELS`). `Market` leases the shared lobby transport through `G.net.leaseLobby()` (`LobbyManager.lease`, reference counted). Offline (`?net=offline`) there is no lobby; everything works locally.
- **Trust model:** seller authoritative over the item (removes it, credits price minus tax, answers `shopSold`), buyer authoritative over the gold (reserves it, refunds on reject / 10 s timeout). txId dedup on both sides (the seller replays its cached answer to a duplicate request); a reply that arrives after the timeout is still honoured for 120 s (the gold is charged again).
- **Spots:** `hash(sellerId) mod spots` + linear probing over the occupied set; the announcement carries the pick, a race is settled on every client by `spotPriority` (shorter probe distance, then lower id) and the loser re-picks and re-announces.
- **Item lock:** `ItemInstance.listed?` (set on the bag items of an open stall; cleared on close and on load). Respected by `CharacterState` (sell / equip / move to stash or equipment / stack merge), `Upgrade` (`locate` -> every blacksmith, salvage and socket operation), `Vendor.sell`, `AutoSalvage.isProtected`, `panels-items/actions.sellItem`. Bound items cannot be listed (`MARKET_ALLOW_BOUND`).
- **Save:** optional `CharacterSave.market` (`MarketSaveData`): sales log (60) + unseen count / gold (next-login summary) + lifetime totals. Licences are pouch materials `pazar_bohcasi` / `buyuk_bohca` (`MaterialDef.market`); using one from the pouch opens `marketOpen`; opening a stall consumes one.
- **Events:** `market:changed { what }`, `market:sale`, `market:pin`, `market:mode`.
- **Pazarcı Modu:** `ui/panels/game/market/pazarci.ts` wraps `Engine.renderFrame` on the instance (2 fps) while on, mutes `Audio.master`, shows the sales overlay; no change in `core/Engine.ts`.

## Karakır Bozkırı (open-world map 2, levels 30-40; content module, append-only)
Registered in `OPEN_ZONES` (`data/dungeons/index.ts`) like Sisli Vadi: a `DungeonDef` with `outdoor` + `world` (`WorldExtras`), no new engine system. Entered from the town East Gate (`dogu_kapisi`; `TownScene.exitLock`: level 30 or quest `mq_19`), 200 x 200 tiles (800 m), start tile (3,100) facing +x, exit portal (3,103). `scenes/flow.ts sceneFlow.leftWorldId` (set by `DungeonScene.exit`) puts the player back at the East Gate.
- **Data** (`src/data/world/`): `karakir_world.ts` (rooms, regions r7 Karakır Otlakları 30-33 / r8 Kızıl Çorak 33-36 / r9 Rüzgâr Yaylası 36-38 / r10 Ayaz Eteği 38-40, roads, water, landmarks, 6 waypoints, Buzul Tahtı gate, 36 camps + 8 patrols as `PackDef`s, 2 rares, mini-boss, world boss schedule, POIs), `karakir_villages.ts` (Karakır Karakolu, Kervansaray; `npc_kk_*`, `npc_kv_*`), `karakir_quests.ts` (12 quests, appended to `QUESTS`), `karakir.ts` (assembly). Region ids continue the Sisli numbering on purpose: `regionOfPack` (`/^(r\d+)_/`) reads pack ids `r7_c01`..`r10_p02`, so open-world loot, quest `region` filters and `world.region.<id>` flags work unchanged.
- **Enemies** (`data/enemies_karakir.ts`, `registerKarakirEnemies()` runs at the end of `data/enemies.ts`): `kb_*` retinted copies of `ow_*` / `skel_*` defs (same `hpMult` x `monsterHP(level)` scaling, level from the pack `levelRange`), `rare_kb_*`, `mb_kb_horgan`, world boss `wb_ulu_boz` (mammoth body, generic ability rows, no script; level in `BossSchedule.WORLD_BOSS_LEVEL`).
- **Tables touched by region id** (append-only): `world/WorldScenery.ts` `PALETTES` / `SPRINKLES` / `PATCHES` r7..r10; `data/loot.ts` `gather_*_r7..r10`, `loot_rare_kb_*`, `loot_mb_kb_horgan`, `loot_wb_ulu_boz`; `data/families.ts` `kb_*`; `data/materials.ts` three quest items. Map size limit: the ground mesh is `half: 480` m (`world/WorldDecor.ts` terrain call), so a 240-tile map would have no skirt; Karakır stays at 200 tiles (80 m skirt).
- **Checks:** `tools/content-check.mjs` merges every open-world map (quests, NPC ids, spawn index) instead of reading only `sisli_vadi`.

## Shapeshift forms (KIT Druid; `combat/Forms.ts`, `combat/FormBody.ts`; append-only)
A form is a long status on the player (`form_moonkin | form_cat | form_bear | form_travel`, `data/statuses_kit_druid.ts`, duration `FORM_DURATION` = 1 day). Everything else derives from that status, so the system is small and reusable by other kits (add a `FormId`, a `FORMS` row, a StatusDef, tag the skills).
- **Stats / armour / speed:** the StatusDef `stats` (Ayı `armorPct +1.0`, `maxHpPct +0.25`; Kedi `moveSpeedPct +0.12`, crit, dodge; Yolcu `moveSpeedPct +0.4`; Ay Baykuşu armour + cast speed). They fold like any status modifier.
- **Resource swap:** `Forms.syncFormResources(player)` is called from `Player.refreshStats` right after `maxResource` is derived from the class (so it runs on every status change, any cause: shift, expiry, death/scene `statuses.clear()`). On a form change it stashes the bar value of the resource kind it leaves (`WeakMap<Player, {active, stash}>`) and loads the one it enters: Kedi = Energy (max 100, start 50, 10/s), Ayı = Rage (max 100, start 0, decays after 4 s out of combat), the others keep Mana. The mana returns on exit. `Forms.formRegen` replaces the class regen in `Combat.updateLocal`.
- **Button transform / bar:** `SkillDef.replaces { skill, whileStatus: 'form_cat' }` (existing, `SkillSystem.replacementFor`) swaps the rmb / q / e buttons; the LMB chain is swapped by `Forms.formBasic` in `SkillSystem.skillIdForSlot` (`druid_cat_basic`, `druid_bear_basic`).
- **Cancel / auto-shift:** `Forms.beforeCast(player, def)` runs in `SkillSystem.tryCast` before costs. Skill tags: `f_cat` / `f_bear` / `f_moon` auto-shift into that form first (free, no GCD), `f_any` and `f_shift` never change the form, every other druid skill that is not Moonkin-compatible drops Kedi / Ayı / Yolcu (casting a caster spell cancels the form; Moonkin keeps casting). Yolcu also drops when the player is hit. Bear rage from damage taken: a lazy `damage` listener installed on the first form change.
- **Model:** no animal rig exists in `public/assets/models`, so each form is a voxel box rig (like `game/Mount.ts`): `FormBody.updateFormBody(player, dt)` (called from `Player.update`) hides `charModel.root`, parents the beast to `player.object3d`, swings legs from speed, breathes, and drops it with the status. Disposed with the player (`disposeFormBody`).
- **Replication (free):** the status list already travels in the player-state snapshot (`Player.getSyncState` / `applySyncState` mirror it), so a peer sees the form status, `FormBody` builds the beast for that remote player too, and the energy / rage value rides the existing `res` / `maxRes` fields; `applySyncState` picks the bar kind with `Forms.formResourceOf`. No new net message.
- **Pips:** Vahşi counts combo points through the existing rogue counter (`SkillSystem.addCombo` accepts druids; `activePips` shows `combo` for Vahşi / no spec and `astral_power` for Denge only). Finisher: the rogue's `kit_finisher`.
- **Data / checks:** `data/skillsets/druid.ts`, `druidSpecs.ts`, `specs_kit_druid.ts`, `statuses_kit_druid.ts`, `rotations_kit_druid.ts`, `combat/skills/behaviors_druid.ts` (`kit_druid_*`); sim `dev/combat-sim/kit_druid.mjs`. Not done: a passive-web sector for the druid (`CLASS_START_NODE.druid = dr_start` has no node; `tools/talents-check.mjs` skips the web round trip / benchmark for such classes) and skill specialisations (`SIGNATURE_SKILLS.druid` is empty).
