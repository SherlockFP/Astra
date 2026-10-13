# Integration TODO (collected from module reports)

## From wave 2 (content, enemies, mythic)

### world (DungeonBuilder / TownBuilder)
- Coordinate mismatch: DungeonBuilder maps props/start/exit with `pos × TILE_SIZE`; the contract (types/dungeons.ts) and DungeonScene/map/Affixes use `(pos + 0.5) × TILE_SIZE`. Fix the builder to the contract, then set `GRID_SHIFT = 0` in `src/data/dungeons/kit.ts`.
- Honour PropPlacement `tint`, `emissive`, `pose`, `show`; RoomDef `zones`, `hazards`, `explicitDecor`, per-room `fog`.
- Gölge statue `mon('Demon_Lord')` with `pose: 'Idle'` + collide uses a T-pose box (~7 m) — compute collider from the posed bounds.
- TownBuilder: default hall items at y 0 get buried by TOWN's +2 m terrace — dedupe against TOWN props; don't re-raise props with explicit y via groundY.

### scenes (DungeonScene / TownScene)
- Pass PackDef data to spawnEnemy: `patrol` (convert with `(c + 0.5) × TILE_SIZE`), `dormant`, `stealth`, `linkedTo`; outdoor zones: `respawnSec`, `levelRange`, `radius`.
- Spawn Gölge Tapınağı anchors from prop `tag`/`id` (`seal_socket_1..4`, `priest_platform_1..4`, `rift_spot_1..3`) — Zakhar/Kevvas mechanics need them (positions used in ai/bosses/golge.ts).
- In Normal / Kahramanlık / Mitik 0 runs call `assignChampions(world, params.seed)` (ai/champion.ts) on EVERY peer after deterministic spawns (never in Mythic+).
- Sisli Koru (open world, `getDungeon('sisli_koru')`): needs a scene path + town south-gate exit trigger (`TOWN.exits` `guney_kapisi`).
- Keep `G.mplus.prepare()` on every peer before spawning, `begin()` host-only.

### enemies
- Add `wb_curukkok` (Çürükkök world boss) to BOSSES.
- Call `G.mplus.onEnemySpawned(e)` on clients too (mythic has a 0.4 s scan fallback).
- Optional: PROC model `explosive_orb` in ai/procModels.ts; guardian defs (ccImmune, dmg 2.0, melee coef 1.5).

### combat
- `Combat.applyDamageToEnemy`: call `G.mplus.canDamageEnemy(target, { dot, tick })` and skip when false (explosive orbs ignore DoTs/ground ticks).
- `hitLocalPlayer`: don't roll dodge / show DODGE for zero-damage status-only hits; support negative knockback (pull toward source).
- Confirm grievous healMult 0.5 (GDD_SYSTEMS) vs damage-only (GDD_CONTENT 5.5).
- Revived champion dying again skips loot/XP (private deadEnemies set).

### items
- `LootSystem.onEnemyKilled`: skip `isAffixUnit(enemy)` (systems/Affixes) — affix_* and efsun_guardian_* give no drops/XP/kills.

### hud
- Blue nameplate for `Enemy.champion`; hide or show HP for `proc_*` mechanic entities (cages/tombs/phylacteries are breakable).

### mythic / panels-game
- Dungeon selection must iterate `DUNGEON_IDS` only (not open zones).

### core
- Optional: weekly reset at 01:00 UTC instead of 00:00 (weekIndex offset +1 h).

### QA entry points
- `node tools/content-check.mjs` (headless content validation; Node ≥ 22.18).
- dev/enemies.html keys: G aggro all, P pack, H 40-rattler horde, K kill nearest, L hit nearest, I invulnerable, B next boss, `?boss=<bossId>`.
- dev/content.html (top-down plans, key 3 = 3D view).

## From wave 1
(to be filled when wave 1 finishes)

### wave1 report: Player module is complete and compiles clean. The last tsc run shows no errors in my files; the only errors left are in other modules' files...
GAPS:
- No visual or runtime testing was done (per the CPU rules); the QA agent should check weapon orientation first. If Blender axes, maces or curved blades hang backwards, set rotY to Math.PI on ATTACH.genBlade in CharacterModel.ts; the off-hand equivalent is ATTACH.genOffBlade.
- Off-hand Blender weapons are attached under a hand-mirror assumption that is unverified. A KayKit off-hand dagger still uses the old scale.x = -1 mirror.
- The aim ray comes from the previous frame's camera pose, so there is a one-frame lag during very fast mouse flicks.
- Camera wall collision uses only the nav-grid raycast, so low blocked props such as fences and barrels can pull the camera in even when it is above them.
- Classic mode has RMB-drag orbit only. There is no LMB-drag orbit and A/D do not turn the character.
- The dev page hotkeys (1-4, C, G, ...) are captured before game input, so they conflict with in-game bindings only on dev/player.html.
REQUESTS:
- combat (SkillSystem.updateLocal, around line 755): `G.input.pressed('dodge') && (st.cur || st.aiming)` cancels the current action even when PlayerController refuses the dodge (no charge, stunned, protected ultimate). Key the cancel off the dodge actually starting instead: the rising edge of `player.dodging`, or `player.dodgeStartedAt === world.time`. PlayerController already calls `G.skills.interrupt(p)` itself right before it starts a roll.
- scenes: SceneManager.current is null during enter(), so use the 'scene:changed' event to learn the scene. PlayerController now sets `player.footstepSfx` this way (town gives dirt, everything else gives stone); a dungeon theme can override the field after scene start.
- scenes: `G.camera.collide = false` disables the nav wall pull-in if a town area has low blocked props that pull the camera in too much. Dungeons should keep it on.

### wave1 report: The items module was already largely complete from the earlier attempt, so I reviewed all of it against the GDD and the other modules' contr...
GAPS:
- Nothing was exercised in a browser (by instruction); QA should run dev/items.html and use SMOKE TEST, 'Eşya halkası' and PATRON for the drop presentation.
- Mühürdar and Gizemli Tüccar have no NPC or panel yet; only the Vendor functions exist.
- The weekly decree (Haftalık Ferman) has no panel button; the Görev Panosu panel must call weeklyDecree() and claimWeeklyDecree().
- Champion packs (Şampiyon) are not implemented anywhere; LootSystem reads an optional `champion` flag on Enemy defensively.
- Dönüş Parşömeni only works in normal dungeons and leaves the run via G.scenes.go('town'); party members do not follow.
- Blacksmith feature unlock levels (BLACKSMITH_GATES.enforce) are off by default so testers can use every feature at any level.
- Bounty template 'kill 60 monsters of a family' was simplified to a generic kill count.
REQUESTS:
- panels-game (bounty panel): add Haftalık Ferman progress/claim via weeklyDecree()/claimWeeklyDecree() and a 'Günlük Sandık' button via dailyChestReady()/claimDailyChest() if not already there.
- scenes/content: add Mühürdar and Gizemli Tüccar NPCs opening a vendor panel mode that calls Vendor.sealOffers()/buySealOffer() and Vendor.gambleOptions()/gamble(). The first Hazine Goblini spawn can use def.lootTable = 'treasure_goblin' (now defined).
- hud: show LootSystem.townScrollProgress as a small channel bar while a Dönüş Parşömeni is read (optional).
- death panel owner: 'Burada Diril' can use G.progression.reviveHereCost() and open-world death XP loss G.progression.applyDeathPenalty().
- combat: nothing blocking; keep reading G.character.moreDamage and G.character.specials[id].params as now.

### wave1 report: World module finished and verified headless. I did no visual testing, per the CPU rules; instead I ran the builders in Node with fake canvas...
GAPS:
- No browser or GPU testing was done (CPU rules). The new lava/liquid ShaderMaterial and the other new GLSL were only desk-checked, so a GPU compile error would only show in the browser. The QA agent should check lava lakes, banks and bridges (kizil_dokumhane), pits (kemik_mahzeni), ice and fog override (buzul_tahti), the terrace and stairs in town, and the outdoor zone.
- Zone hazards are data only: damage over time from `ZoneDef.hazard` and the periodic `RoomDef.hazards` (lava_burst, icicle_drop) are not applied by the builder; the scene must use `hazardAt`/`zones`.
- Zones are not drawn in outdoor mode (nav effect only).
- A blocked ice zone is drawn as a sunken water-like surface.
- Terrace edges are sealed in nav (1 m band, stairs excepted) so nobody walks onto a terrace from the side and pops up 2 m.
- The PSX timber-frame cottages are placed at only 5 hand-picked spots, and only where nothing else is near. In the real content town that is 2 cottages. The gable roof pieces (`roof_*`, `roof_*_end`) are unused because their orientation in the doc is ambiguous; hip roofs are used.
- In `kizil_dokumhane`, pack d2_p18 (flying imps) is centred over lava, so its centre is blocked on nav. That looks intentional, and DungeonScene already snaps to the nearest walkable cell.
- Large dungeons produce about 700-900 instanced groups (chunked, 24 m). Frustum culling keeps visible draw calls to a few hundred, but it has not been profiled in a browser. Outdoor mode uses 40 m chunks.
REQUESTS:
- scenes (DungeonScene): apply zone damage each frame with `built.hazardAt(player.x, player.z)` (`hazard.coef` and `interval`), and run the periodic `RoomDef.hazards` against `built.zones` and nav. Use `built.props` (tag 'breakable' or 'chest', id) to attach gameplay and call `prop.hide()` when something is smashed or opened (it also re-opens nav).
- scenes: Sisli Koru can go through `buildDungeon` with `outdoor: true`. Set `theme.fogColor`, `fogNear`, `fogFar`, `hemiSky`, `hemiGround`, `ambient` and `tint` for the look; the builder uses them for fog, lighting, sky colours and ground tint.
- scenes (TownScene): `built.groundY` now returns real terrace and stairs heights. Sample it for the player and NPCs, which the scene already does via `world.groundY`.
- content: for new town props, use `tint`, `emissive` + `light` + `vfx`, `box` or `radius` colliders as the builder now honours them. Keep avoiding model paths containing `wall_` or `fence_stone`, because they switch off the default town walls.
- vfx-audio: ids the world module spawns: ambient_shadow_wisps, volcanic_plume, ambient_embers, ambient_dust, ambient_snow, poison_cloud, waypoint_glow (all already in VFX_IDS), plus sfx `door_open` for the gates.

### wave1 report: The combat module is finished and type-checks clean: `tsc --noEmit` gives zero errors across the project. It follows GDD_SYSTEMS 1, 2 and 8 ...
GAPS:
- Nothing visual was verified (no browser allowed): the headless sim checks logic only, so VFX sizes, trail placement and combo rhythm still need a QA pass in dev/combat.html.
- Basic-attack cadence is about 2.3-2.7 hits/s for the knight, roughly twice the GDD's APS-based pacing. `FEEL.basicTempo` slows or speeds all LMB chains (try 0.85 if it feels too fast, or lower coefs).
- Threat (Muhafız trait x2.5), the monster level-difference damage rule and enemy Blind miss chance are not implemented. The enemies module should read `statuses.blinded` for the 50% miss.
- Specials that spawn extra visuals or damage (echo, extra meteors, fissure fans, dragonfang wave) only show on the owner's machine. Remote peers see the base cast only.
- A remote peer's channel replay lasts the skill's full length unless the owner's `cast` end message arrives; `playRemoteCast` is visuals only.
- AoEs and melee ignore walls and line of sight on purpose: a blocker around a static enemy could otherwise make it unhittable.
- The Player module does not itself implement the keystone/legendary dodge-roll effects. Combat overwrites `p.dodgeMaxCharges` and `p.dodgeRecharge` each frame for ks_shadow_dance and leg_windrunner, so the player module must not set them from specials too.
- Set bonuses expose only `{count}` params through StatCalc, so set effect numbers are hard-coded in specials.ts and the skill hooks.
- The M+ affix statuses are registered at runtime by Affixes.ts and are untouched.
REQUESTS:
- vfx: if the base radii of the area presets change (shockwave 5.5, ground_slam 4.4, frost_nova 5, blizzard 6, fire_ground 2.2, holy_burst 3.2, fire_burst 3.4, arcane_burst 3.6, poison_burst 2.8, spin_slash 3.4, war_cry 6.5), update VFX_R0 in src/combat/feel.ts, or expose a per-preset radius so skill visuals keep matching their hit radius.
- vfx: stealth_smoke only lingers around one body-sized point, so Duman Bombası spawns 7 puffs across the zone; a zone-sized smoke preset would be better.
- vfx: Kurt Kanı's blood tornado reuses storm_tornado at scale 0.55 with a red colour override.
- hud: new buff statuses 'balance', 'windrunner', 'veil' and 'dancer' use STATUSES icons. Subscribe to 'combo:changed' (tier flourish is already played by combat).
- enemies (EnemyAI): honour `e.cast = null` set by Combat.onHardCC (strong hits now interrupt interruptible windups), apply the 0.5 s stun from wall slams, and read `statuses.blinded` / `statuses.has('taunt')` / `fear`.
- net: carry the optional `end` flag on the 'cast' channel and the optional `dot` flag on the 'dmg' channel (both appended to NetChannels).
- items: StatCalc already folds `moreDamage` and the keystone flags; combat now applies `G.character.moreDamage` itself. Do not apply it again in damage code.
- player: PlayerController should keep calling G.skills.interrupt(p) when a dodge really starts (it already does); the skill system no longer cancels on the raw dodge key.

### wave1 report: The audio manager is now fully implemented (it was an empty stub), and the VFX module gained pixel-art sprite-sheet effects on top of its ex...
GAPS:
- Nothing was run in a browser (CPU rule). The audio manager and the sprite-sheet layers have never been exercised. The sprite-sheet UV and frame math, the sRGB sheet texture, and audio autoplay and unlock behaviour were reasoned about, not observed.
- Audio is silent until the first user gesture (browser policy). Menu music starts on the first click or key press.
- Music is streamed through HTMLAudioElement, so the first track may start a fraction of a second after the gesture while the file buffers.
- There are no jump or dodge events, so the voice barks 'hup' and 'hut' only play if the player controller calls G.audio.voice().
- Sprite-sheet overlays use random rotation rather than hit direction, because the art orientation of the directional sheets is unknown. Torches and braziers do not use the pixel fire loop sheet.
- src/audio/manifest.ts is generated content and the generator script lives only in the scratchpad.
- Enemy attack barks (orc voices) exist as sfx ids, but only death and cast-related barks are wired automatically. There is no 'enemy attack started' event.
REQUESTS:
- player (PlayerController): call G.audio.voice('hup') on jump and G.audio.voice('hut', { chance: 0.6 }) on dodge. Also consider G.audio.voice('defend') when blocking.
- combat/scenes: you do not need to play enemy_death, hit_*, level_up, loot pickup, boss music, run stingers, or upgrade_* sounds. Audio already handles them from events. Duplicates within the per-id rate-limit window are dropped automatically.
- scenes: keep calling G.audio.music(theme) on enter. Calling it again with the same id is a no-op, and unknown ids fail silently.
- hud/panels: ui_* sounds are still played by UI code. Equip/unequip, buy/sell, passive_allocate and similar ids exist in the manifest, so play them directly.
- enemies: for orc/goblin/brute attack barks, call G.audio.voice('attack', { pack: 'orc', pos, other: true, chance: 0.3 }) at attack start (pitch 1.35 for goblins).
- world: optional. G.audio.ambience(id) can override the automatic ambience beds, and G.vfx.spawn('torch_fire') etc. are unchanged.

### wave1 report: The hud module is finished. The earlier attempt had already built the UI shell and every requested widget; I reviewed all of it, fixed the i...
GAPS:
- Nothing was tested in a browser or at runtime; no visual verification of layout at 1280x720 or 1920x1080 (the HUD scale is min(w/1920, h/1080) clamped to 0.75..2.2).
- CSS `zoom` is used for HUD scaling, so it needs a browser that supports it (Chrome 128+, Firefox 126+).
- World labels have no occlusion test (optional in the brief); nameplates are distance-sorted and capped at 40.
- No damage-direction indicator or aggro warning yet.
- Pressing a slot flashes it even when the click only re-acquires pointer lock.
- ReadyCheck keeps its Y hotkey in the HUD; the party panel's own ready banner is separate and unchanged.
REQUESTS:
- panels-game (settings panel): expose a 'UI Boyutu' slider calling G.ui.setUserScale(0.7..1.5); SettingsData has no uiScale field. The HUD also honours an optional settings.data.uiScale if core adds one.
- combat: keep G.combat.combo public (count, windowFrac, bonus). The HUD combo counter drain bar and damage bonus read them, and the combo module's window extensions emit no event.
- player: Player.dodgeCharges, dodgeMaxCharges and dodging are read every frame by the dodge-charge bar.
- enemies/AI: keep emitting 'enemy:castStart' and 'enemy:castEnd' (plus Actor.cast for players). 'boss:engaged', 'boss:phase', 'boss:yell', 'boss:defeated' and 'boss:wipe' drive the boss frame. Enemy.bossDef must carry title, phases and enrageTimer.
- net: the ready-check card reads G.net.readyCheck, G.net.members(), G.net.self and calls G.net.setReady(true); the readyCheck.deadline field must stay in performance.now() units.
- scenes: def.loadingImage should be an existing URL or undefined; in UI mode 'loading' the overlay is a transparent frame over the LoadingScene's 3D seal. Keep emitting 'ui:zoneName' and 'interact:prompt'.
- mythic: G.mplus.state (RunState) is read directly by the M+ tracker, and G.mplus.getAffix(id) for affix tooltips.

### wave1 report: panels-items is complete and compiles clean. Nothing was run or tested visually, as instructed. The whole-project `npx tsc --noEmit` shows n...
GAPS:
- Nothing was run or visually checked (no browser, as instructed); layout and animations are verified only by code review, so the QA agent should open dev/panels-items.html first
- The 3D character preview uses its own small WebGLRenderer, so a second GL context lives while the Karakter panel has been opened; it is not disposed on close, only paused
- Skill descriptions in data/skills.ts are shown as written. {placeholder} filling is supported, but no skill uses placeholders yet
- STAT_DOCS contains Turkish stat explanations with numbers copied from StatCalc / GDD. If the formulas change they have to be updated by hand
- A Mühürdar or Gizemli Tüccar NPC whose vendor kind is not passed shows the normal merchant shop (see request)
- Salvage of stash or equipped items is not offered; only bag items, with confirmation for Rare and above
REQUESTS:
- scenes (src/entities/NPC.ts, panelForNpc): the merchant role always returns { kind: 'merchant' }. npc_gizemli_tuccar needs { kind: 'gamble' } and npc_muhurdar needs { kind: 'seal_vendor' } (data/town.ts already has ui.kind on both). Without this the two new vendor screens are never reachable in the town.
- scenes: src/entities/NPC.ts currently has tsc errors in the patrol code (properties period, cx, r, cz do not exist on the patrol type) - not my module, reported only
- hud: G.ui.itemTooltipHTML(item, compare) is used for every item tooltip, with a built-in fallback if it returns an empty string; keep the signature stable
- player: Player.refreshEquipmentVisuals must keep reading save.flags.hideHelm on 'equipment:changed' (it does today); the Karakter panel relies on it for the helmet toggle
- items/loot owners: the vendor panels call G.loot.vendorStock via systems/Vendor.vendorEntries('merchant'); the Gizemli Tüccar uses Vendor.gamble / gambleCost (L25+) and the Mühürdar uses sealOffers / buySealOffer, so keep those signatures

### wave1 report: panels-game is complete and `npx tsc --noEmit` exits 0 for the whole project. Nothing was run in a browser, per the CPU rules. All 12 panels...
GAPS:
- Nothing was tested in a browser or in game, only compiled.
- Kahramanlık and Mitik 0 are gated by character level only. Nothing records 'cleared this dungeon on this difficulty'; the only flags are clear.<dungeonId> (one per dungeon, any non-key difficulty) and clearedM0.
- GDD 5.13 key-selection confirm ('Oyuncu anahtarını seçti, kabul ediyor musun?') is not implemented. It needs a net protocol, so the leader's 'Bu anahtarla git' moves the party immediately.
- Burada Diril only shows in town, the only open-world scene wired today. The open-world XP death penalty (Progression.applyDeathPenalty) has no caller and the death card does not trigger it.
- The map shows no enemies, by design. The M+ run state is drawn from the map header only (dungeon name and key level); forces and timer are the HUD's job.
- The talents tree has no keyboard navigation. Search is the only shortcut (Enter cycles matches, Shift+Enter goes back).
- On a client the run summary can only tell whether the local player owned the key while G.mplus.params is still set. After the town transition it falls back to a neutral key-result text.
REQUESTS:
- core: Settings.reset() should call every listener, or emit a bulk 'settings:changed' (key '*'). It only notifies 'psx' today; the settings panel works around it by re-setting every key.
- core or items: record per-difficulty dungeon clears (for example save.flags['clear.<dungeonId>.<difficulty>']) if the GDD gating (Normal clear for Kahramanlık, Kahramanlık clear for Mitik 0) should be enforced. The keystone panel can read them once they exist.
- scenes: DungeonScene opening 'runSummary' on chest open is fine because the panel dedupes the same run. TownScene passing `runSummary` in its params also works. No change needed.
- mythic: keep G.mplus.params readable until the run summary is dismissed if you want the owner-specific key result text everywhere, or expose a `lastKeyOwner` boolean.
- net: optionally add a 'keystone choice' message so the leader's selection triggers the GDD confirm dialog on every member; the party and keystone panels can call it from the 'Bu Anahtarla Git' button.
- hud: no changes needed. The Esc handling in UI.handleHotkeys keeps working because DeathPanel.close() redirects to gameMenu while the player is dead.

### wave1 report: Scenes module finished. I did not run it in a browser, as instructed, so none of it has been tested at runtime. `npx tsc --noEmit` is clean ...
GAPS:
- Nothing was run or screenshotted, per the CPU-budget instruction. Only a clean tsc pass backs this up, so the menu look, the town layout and the open-world flow are untested.
- Guests in a party cannot start the Lanetli Sandık. The 'gate' channel is host-only and there is no client-to-host event channel, so guests get a toast. Guests still fight and loot normally once the host starts it.
- Leaving Sisli Koru through the Esc game menu spawns the player in the portal hall (gameMenu always sends spawnAt:'portal'). Only the in-world return portal uses 'south'.
- wb_curukkok (the world boss) is not in BOSSES yet. The spawn is skipped with a warning, and the camps, chests and portal still work.
- The treasure-goblin cue is a toast and a sound; there is no minimap ping because no such event exists.
- The menu camp uses about 7 point lights (campfire, 2 lamps, 2 braziers, 2 pedestal lights), which is fine on desktop but could be heavy on weak GPUs.
- Gölge Tapınağı seal/platform/rift anchors are not spawned as entities, because golge.ts hard-codes its own positions.
REQUESTS:
- enemies: add wb_curukkok to BOSSES, and confirm treasure_goblin escapes after a timer. The scene only spawns it with tag 'treasure'.
- panels-game (gameMenu): when leaving from the open world (Sisli Koru) pass spawnAt:'south' to town instead of 'portal'.
- net: optional channel or relay so a client can send a small event request to the host. That would let guests open the Lanetli Sandık.
- hud: optional minimap ping event for the treasure goblin spawn.
- QA: test menu to create to town (NPC interactions, dummies, portals) to dungeon to Sisli Koru via the south gate, with a Mythic+ run if possible.

### wave1 report: The net module is finished and the whole project type-checks with zero errors, but none of it has been run. The earlier wave had already bui...
GAPS:
- Not run: dev/net.html two-tab test and a real trystero hostRoom/joinRoom were not exercised, per the no-browser rule. The QA agent should open dev/net.html twice (tab A 'Oda kur (local)', tab B types the code and joins) and watch the panel counters.
- Remote players hold their last sample when packets stall; they are not extrapolated, because Interpolator belongs to core.
- A remote player's colour tint is not replicated, only its variant. Hide-helm is handled by not sending the helmet.
- Only the host runs in the background when the tab is hidden; a hidden client tab freezes its own character for the others.
- Real P2P rooms rely on public Nostr relays and STUN only. Players behind strict NATs may fail to connect without a TURN server (TrysteroTransport accepts turnServers but none is configured).
- The lobby room is a full mesh of everyone browsing; it is fine for a small player count but will not scale to a large public lobby.
REQUESTS:
- scenes (Shrine.ts / DungeonScene): `G.net.on(...)` returns an unsubscribe and handlers survive scene changes. DungeonScene already keeps its unsubscribes in `netOff`; make sure Town/Dungeon call them on exit.
- scenes: call `G.net.sceneReady(id)` at the very end of `enter()`, after `G.world` is set, as TownScene and DungeonScene already do. Replication relies on this order.
- player: if a hide-helm switch for remote models is wanted later, add it to the 'gear' payload (append an optional field to NetChannels['gear'] in types/net.ts). Net currently just omits the helm.
- core: `Engine.time` is capped at 0.1 s per frame, so long hitches shift the clocks between peers. Net compensates, but do not use `Engine.time` as an absolute cross-peer clock.
- audio/hud/panels: use the `net:status`, `net:peerJoined`, `net:peerLeft`, `net:chat`, `net:rooms` and `party:*` events; the party panel should show `G.net.lastError` after a failed join (it already does).

## From Haiku QA smoke test (runtime)
All 13 dev pages + game load with 0 console errors; 4 dungeons load (105–137 enemies); town movement/attack/panels OK.
- [scenes/ui menu] Main menu roster shows two identical cards ("Selvi / Sv. 19 Büyücü / 680") — check roster de-dup / list rendering.
- [hud UI.update] Pressing Esc to close a panel (M+ info) also opened the gameMenu in the same press — Esc must close the top panel OR open the menu, never both.
- [scenes/mythic] In a +4 key run started via G.scenes.go, `G.mplus.state.started` stayed false and elapsed 0 (frames were throttled in the hidden test pane, so unconfirmed). Verify DungeonScene calls `waitForPartyLoaded` → `G.mplus.begin()` offline, the 10 s countdown ticks on world time, and the timer starts; consider WoW behaviour (countdown after key insertion, timer starts at 0 then runs).
- [balance] enemyLevel for M+ should not make a level-1 test character unable to kill anything — fine for real play, but dev shortcuts / keystone UI should pass the GDD enemy level (normal: party avg level).

## From HUD wave (DPS meter)
- [combat] Damage meter: `Combat.hitLocalPlayer` emits 'damage' only on the owner, so "Alınan Hasar" for remote party members is 0 on other peers — broadcast a light per-hit summary (or 1 Hz totals on a new `meter` channel).
- [combat] `Combat.healPlayer` routes remote heals without a local 'heal' emit on the healer's machine — emit locally so the healer's own meter counts outgoing heals.
- [combat/enemies] 'enemy:castEnd' has no sourceId → meter can't count interrupts; add `interruptedBy` to the event payload.
- [panels-items] Inventory pouch rows are not drag sources for the extra action bars (potions added via right-click picker for now).
