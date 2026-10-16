# HANDOFF — EFSUN ONLINE · Kadim Zindanlar

Last update: 2026-10-13. Written for the next AI/developer who continues the project from where it stopped.

## 1. What the project is
A three.js (r186) + Vite 8 + TypeScript 7 (strict) PSX/voxel-look, WoW-like action MMORPG with P2P co-op (trystero).
UI text is **Turkish**. The owner is a Turkish speaker; talk to them casually in Turkish.
Remote: `https://github.com/SherlockFP/Astra.git` (branch `master`), deployed as a Render static site (`render.yaml`: `npm ci && npx vite build`, publish `./dist`).

## 2. Sources of truth (read before coding)
1. `ARCHITECTURE.md` — modules, owners, service locator `G`, EventBus, append-only contracts. Highest authority.
2. `docs/CORE_MECHANICS.md` — normative core rules.
3. Other GDDs: `docs/COMBAT_WOW.md`, `docs/CONTROLS_WOW.md`, `docs/ENGINE_VERTICALITY.md`, `docs/GDD_CLASSES_V2.md` (NC packages, table ~line 1455), `docs/kits/*.md` (per-class WoW-style kits), `docs/dungeons/*.md` (8 M+ dungeons + `_shared_primitives.md`), `docs/UI_REDESIGN.md` (ElvUI), `docs/GDD_LOOT_V3.md`, `docs/GDD_PROCGEN.md`, `docs/GDD_CREATURES.md`, `docs/GDD_PVP_FINDER.md`, `docs/ROADMAP.md`.

## 3. Verification gates (run before every commit)
```bash
npx tsc --noEmit                         # must be 0
node tools/content-check.mjs             # TOTAL ERRORS 0
node tools/talents-check.mjs             # only 2 known pre-existing "bench" errors (knight_protector / knight_blademaster)
node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/<sim>.mjs
#   sims that must PASS: kit_plate kit_knight kit_barbarian kit_rogue kit_warlock kit_paladin wow_core wow_queue minions minions_net nc48 nc51 pips procgen shapes loot_v3
```
Pre-push (Render safety): export HEAD with `git archive` into a temp dir, junction `node_modules`, run `npx vite build` there — catches files that were never `git add`ed.
Known non-blocking failures: `tools/smoke/procs_data.mjs` has 6 pre-existing **mage** failures (`freezing_rain`, `comet_ready`, `pyroclasm` lack ProcDef rows; `glowSkillsOf(hot_streak)` misses `mage_flame_wave`, `mage_meteor`, `mage_phoenix_flames`).
Watch line endings: some files are CRLF — agents sometimes rewrite them as LF (huge fake diffs). Check `git diff --ignore-cr-at-eol --stat`.

## 4. Done (committed)
- **Combat engine (WoW style):** GCD profiles, 400 ms spell queue, procs (PRD), proc mods/glow, cast bar, school colours, `replaces` button transforms, targeted skills, haste channels.
- **Controls:** WoW scheme default (RMB mouselook, click-target, auto-attack, 1–5/Q/E/R, majors X/V/T, potions G/H, Panzehir `\`).
- **Verticality:** heightfield, vertical navgrid, lifts, falls, height-gated combat.
- **Mythic+ Season 1:** 8 handcrafted dungeons in `MPLUS_POOL` (`src/data/dungeons/index.ts`), bosses in `src/ai/bosses/`, enemies in `src/data/enemies_<id>.ts`.
- **Class kits (WoW Midnight-like):** Mage (Arcane/Fire/Frost — homing Arcane Missiles), Rogue (Shadowstep behind + Backstab, Subtlety/Assassination), Warlock (Affliction/Destruction), **Şövalye** (Arms/Prot Warrior) and **Barbar** (Kasap = Fury, Savaş Lordu = tank) incl. gap fixes.
- **Plate groundwork PM-00a/b/c:** rune pip + regen, 30 plate statuses, rider fields, plate engine behaviours in `src/combat/skills/plateKit.ts`.
- **NC systems:** Minions (`src/entities/Minion.ts`, `src/ai/MinionAI.ts`, `src/combat/Minions.ts`, `src/data/minions*`), Auras (`src/combat/Auras.ts`), shared behaviours (`src/combat/skills/sharedBehaviors.ts`) + per-class behaviour stubs `behaviors_<class>.ts`.
- **Pips + PipBar (NC35/NC36):** generic pips API in SkillSystem (`pipDef/pipMax/activePips/pipRegenFrac/consumePips/resetPips`, combo routed through it), `src/ui/hud/PipBar.ts` in the player frame.
- **Paladin (PM-PA, NC51):** behaviours in `behaviors_paladin.ts` (map: `docs/kits/paladin_behaviors.md`); Koruma/Kutsal/Ceza rows in `skillsets/paladin*.ts`, `specs_paladin.ts`, `procs_kit_paladin.ts`, `rotations_kit_paladin.ts`, talent patch `docs/kits/talents_paladin.json` (applied by PM-TAL). **Paladin is playable** (in `PLAYABLE_CLASSES` + menu `CLASS_ORDER`; Knight rig with the golden "Altın" variant as default, mace item base `mace_t1..t5`, sword/shield bases also allow the paladin; level-1 bar = chain + Yargı rmb + Haçlı Darbesi q + Işığın Sözü e). Net `CLASS_IDS` includes paladin, warlock, necromancer.
- **Minion infra (NC42/43/44):** enemies target/damage minions (owner-authoritative minion HP, see ARCHITECTURE Class contracts), `minion` channel replication, `src/ui/hud/MinionFrames.ts`.
- **ElvUI redesign W1–W5:** action bar, unit frames, tracker, meter, minimap, chat tabs + bubbles + emotes, Zindan Bulucu (finder) + LFG net contract, docked panels.

## 4b. Sprint 1 (branch `director/sprint1`, 2026-10-13) — game-director pass
Evaluation docs: `docs/MMO_PILLARS.md` (scorecard + WP-01..14), `docs/UI_WOW_CLASSIC.md` (UI direction = **retail WoW + ElvUI**, not Classic), `docs/ENGINE_BIGMAPS.md`.
- **Controls (WoW scheme):** walk toggle + autorun (NumLock), browser Ctrl-combo guard, backpedal 0.643, committed air momentum, targetPrev/focus, Esc clears target, drag-only cursor hide, blur hardening, full keybind list with conflict confirm, click-cast action bar, hard-target range tint, clickable nameplates / ToT (`target:select`), scheme-aware welcome/tips. Mount on **F9** (`src/game/Mount.ts`, lvl 10, +60 %).
- **Classes:** 7 playable (knight, barbarian, mage, rogue, paladin, warlock, necromancer).
- **UI:** ElvUI skin W1 (HUD, `hud-elvui.css` imported last) + W2 (windows) + polish; saved-layout migration for moved frames; `barGhostSlots` default on (+ migration).
- **World:** chunk streaming for zones > 800 m (`WorldStream.ts`, layout `zone` block); **Karakır Bozkırı** 1600×1200 m, lvl 30–45, regions r7–r12 (East Gate); **Kızıl Sınır** PvP 1200 m, regions r13–r15 (West Gate, lvl 35). Region ids are global across maps — never reuse one. **Kuzgunkale** grown to 320 m with 41 ambient NPCs.
- **Perf:** voxel LOD tiers (`VoxelLod.ts`, `Instancing.ts`), "Görüntü Kalitesi" setting; `dev/combat-sim/tribudget.mjs` is the triangle/call budget sim (Karakır spawn ≈123k tris headless). Live measurement before the pass: 18 FPS / 1.89 M tris / 512 calls — **re-measure in browser**; ~400 of those calls were not explained by the sim.
- **MMO systems:** Social (global/trade chat, whispers, presence, /kim), Lonca (signed rosters, encrypted chat), nations + PvP (Onur, capture points), world event calendar (30-min UTC rotation, /etkinlik), achievements + titles, gathering professions (Madencilik, Bitki Toplama), daily loop (streak, rested XP, world quests, Günün Zindanı), economy sinks + chat item links (+10 fail on bound items now breaks → Demirci repair, not delete), pets + Koleksiyon.
- **Sims added:** social guild pvp events achievements gather daily economy pets bigmap tribudget (all must PASS). Pre-existing non-blocking: `effects` wall-slam stun, `speed` attackSpeed 0 hits, `skills` rogue_vanish, `status` net-guard warn, talents-check 1 bench error, `tools/smoke/ability_params.mjs` 1 FAIL.
- **Not yet seen in a browser:** almost all of sprint 1. Dev shortcut: `/dev/scenes.html?scene=dungeon&dungeon=karakir_bozkiri&lvl=35&class=knight` (also `sisli_vadi`, `kizil_sinir`). The browser pane must be visible or rAF stops.
- **Worktree gotcha:** agent worktrees start from `master`; every agent prompt must begin with `git reset --hard director/sprint1`.

## 4c. Sprint 2 (same branch, 2026-10-14)
- **Zones (all streamed, relief):** Sisli Vadi 1600×1600 (lvl 1-30, 1095 camps, 16 waypoints), Karakır 1600×1200 (30-45), **Ayaz Dağları** 1600×1600 (45-60, r16-r21, Kartal Geçidi pass from Karakır r12, world boss Zemheri), Kızıl Sınır PvP. Used region ids r1-r21 (global). pace-check passes 1-60.
- **Dungeon doors in the world:** Gölge Tapınağı in Karakır, 8 season dungeons in Ayaz (sign shows recommended level; minLevel not enforced; door `look` recipes not rendered).
- **Public channels:** `src/net/Channels.ts` + `NetSession.enterScene`: auto-join `zone:<id>:ch<N>` (cap 12, PvP 8), host election/migration (host loss keeps the fight: members hand their enemy records to the new host, `net/Carryover.ts`, sim `hostloss.mjs`), interest mgmt (150 m full / 400 m 2 Hz), /kanal. Host upload ≈260 KB/s at 12 players.
- **Dev server:** `vite.config.ts` ignores .claude/docs/sims; never leave agent worktrees around (they were pegging the PC).

- **Real-browser QA without the app pane:** headless Chrome via `playwright-core` (installed outside the repo; Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, args `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`). Load `/dev/scenes.html?scene=dungeon&dungeon=<zone>&lvl=N&class=X`, wait ~14 s, read `G.engine.renderer.info` + fps, screenshot. Measured (owner GPU): town ~270 fps / 380 calls, Sisli 155, Karakır 120-345, Ayaz 359, Kızıl Sınır 360.
- **Two-client smoke:** `tools/qa/mp-smoke.mjs` (dev server on 5181, `MP_PW=<dir with node_modules/playwright-core>`; `?net=local&name=..&nation=..` per tab) — channels, chat/whisper, party room, full 1v1 ranked arena: 39/39.
- **Arena polish open:** the proposer gets no "found" toast; no season names ("Sezon N"); presence carries no ratings; no re-queue button.

## 5. Next steps (priority order)
0. **Sprint-1 QA in the browser** (visible pane): FPS/calls in Karakır + town, ElvUI HUD/windows at 800×450 and 1920×1080, mount, pets, PvP gate, guild panel, achievements spam on first load (5 lines at once — batch them), streaming pop-in. Then WP-14 castle siege (`docs/MMO_PILLARS.md`), terrain heights for open world (ground is y=0), minimap presence list, camp id space > 2079 per zone (`HOST_DYNAMIC_ID_BASE`).
1. **Nekromant** is playable (Mage rig); kit leftovers: `necro_ghoul` `taunt` row, `necro_lichborne` SkillDef.
2. **Paladin leftovers:** Cleanse on remote allies (no net op to remove a status on the owner), `src/dev/wow/pmPaladin.ts`, İlahi Fırtına target cap is done, overheal ward only on heal_target / heal_aoe / heal_bolt (not Divine Toll). Done in the playable pass: Bulwark reflect (Combat), Kutsal Zemin ally armour aura (`consecrated`), `overheal_ward` (Kutsal), Kutsal Hüküm +25 % (`SkillDef.route` `@status:` form read in `SkillSystem.strike`); talents-check warns `paladin_protection` tree BP 918 vs doc 1199 (pre-existing bench constant, not caused by the re-pointing).
3. **PM-TAL done** (plate talent re-pointing): patches `docs/kits/talents_{knight,barbarian,paladin,necromancer}.json` applied with `node tools/apply-talent-patch.mjs` (reusable for later class packages, then `node tools/gen-talent-data.mjs`). Open: `necro_lichborne` has no SkillDef, so `class:necromancer / s05B` still grants `necro_spirit_walk`; bench `spec:knight_protector` tree BP 958 vs doc 1391.
4. **Agile / Evoker kits** (`docs/kits/agile-evoker.md`: AE-0 → AE-ENG/AE-V → AE-1..4 → AE-5/6).
5. **Loot v3 engine** — 87 named uniques have no special-effect hooks (`docs/GDD_LOOT_V3.md`).
6. **Procedural dungeons** are built (`src/world/procgen/*`, status + deferred list in `docs/kits/procgen_status.md`; QA pass pending: entry stone, finder tab "Kadim Yarıklar", a full Normal run, party hash compare). Still open: grotto theme, the 30 generic guardians of GDD_PROCGEN §6, FissureTracker HUD, open-world stones, daily seed. **Creatures** (`docs/GDD_CREATURES.md`, Elden-Ring-ish mechanics) are not started.
7. **Pazar** is done (AFK shops); search + price history exist.
8. Endgame zones for season dungeon entrances, PvP/Finder (`docs/GDD_PVP_FINDER.md`), balance/SimBench.
9. **One in-browser QA pass** (UI W3–W5 never seen visually; emote clips unverified; minions unseen in game). Dev server: `.claude/launch.json` → `npx vite --port 5173`.

Known kit simplifications still open: Ani Ölüm rolls 8–10 % (engine multiplies by `params.proc`), remote clients don't send `threatMult`, Barbar blood shield heals instantly (no HoT consumer), Avatar/Kalkan details per `plate-melee.md`; rogue garrote silence, kingsbane scaling, prismatic bolt etc.

## 6. Working rules the owner set
- Agents: cheap model (Haiku) by default; stronger models only when needed. Sub-agents **never commit/push**; the lead agent reviews and commits.
- Push to GitHub only when the owner asks; always do the clean-export build check first.
- Low CPU machine: ≤5 concurrent agents, no per-agent browser tests, one QA pass at the end.
- Never `git stash` files another agent is editing.
- Downloads of external assets need the owner's explicit OK.

## Sprint 2 loop (2026-10-14, director): first-hour quality

- Low-level pull cap (3 engaged at L<=5, unprompted aggro only; attacked mobs always answer), mobs evade/reset when their target dies, Sisli L1-3 density <= 6 per 25 m.
- Quests: generic first-hour QA (tools/qa/first-hour.mjs follows the chain from data), content-check now verifies every objective source, in-band kill camps >= 40 m from camps 2+ levels higher, graveyard within 250 m of every quest area.
- Opening kit (src/data/openingKit.ts): 4 abilities at L1 + one WoW ability at each of L2-L5 for all 14 classes; loot pity (green by 15 kills at L1-5); 1-of-3 quest reward choice; rare elite marker.
- Death: revive 50% HP at the nearest graveyard (24 in Sisli Vadi), death cause in chat.
- Balance: sim honours status max-HP; Brewmaster Sarsma (Stagger) wired; Ward of Oath 40% DR; failing bands L10 20 / L30 14 / L60 9.
- UI: windows never block movement/skills (src/core/inputGate.ts), ElvUI frame positions (player 36% / target 64%), one toast lane, clarity defaults (native 2x render).
- New sims: solo_lowlevel.mjs; QA: tools/qa/dungeon-pack.mjs, tools/qa/classes.mjs.

- Gate added (2026-10-15): node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/chain_e2e.mjs (Sisli first chain end-to-end, ~8 s). Run it on every quest/layout/NPC change; also tools/xp-ledger.mjs (via pace-check), tools/icon-check.mjs, dev/combat-sim/solo_lowlevel.mjs, camp_respawn.mjs, heights.mjs.

## 2026-10-16 (director session, all merged to director/sprint1 and master)
- World: 4 zones densified (tools/world-density.mjs --zone, world-fill.mjs), Kizil Sinir decor mirrored; GrassField.ts (chunky tufts, night-lit, Cimen yogunlugu); Trove grade/rim; HouseKit/MagitechKit towns; DayCycle.ts 48-min shared clock + minimap clock; world map atlas (src/ui/map/).
- Combat: WoW targeting (targetSelect.ts), 5 m melee + auto-turn, stale-target retarget, red error line naming the ability, Chunks.ts voxel impact bursts, synth.ts layered hit audio + combat bus, newPlayerEase L1-9 (lowLevelScaling.ts), per-spec L1-9 damage curve.
- Content/systems: Sisli Magara starter dungeon (1-10) + Magaradaki Sis quest + finder queue card + cave gate; dungeon end card with re-queue; consumables (Sisli Matara flask, food); 6 mounts (mounts.ts, Binekler tab, stable vendor); player popup menu (duel/trade/invite/inspect/follow/whisper); chat bubbles; enemy net sync fixes (netsync.mjs); loading screen hold; onboarding guide fixes; F interact priority; camp danger warning; patrols; rare Gumus Ejder Yavrusu.
- New sims: netsync, social, consumables, mounts, class_ttk (L1/L5 asserted, L10+ reported vs 3-10 s), dungeon_run, run_summary, onboarding, channels, bar_layout. Merge helper pattern: worktree commit -> merge -> tsc -> clean export vite build -> push sprint + master.
- Open: L10-30 trash TTK too fast for paladin/monk/evoker/necro/demonhunter (needs mob HP lever or accept); Kemik corridors 8 m in one tunnel; meadow draw calls +36%; hit audio not heard by a human yet.
- Later 2026-10-16: L10-20 content (Lanetin Yolu chain L13-21, Bataklik Konak hub, hub signposts); mounts usable in open world (scene id 'dungeon' covers the open world: use isInstanceScene()/inOpenWorld(), not scene id); open world no longer resets majors / blocks hosting / blocks talent adds; far-rim cull (no shells on blob shadows/tiny parts); camera collides with HouseKit/MagitechKit (cameraSolid); stable vendor stock, requeue after a finished run; first-quest tracker points to the giver, spawn faces Muhtar; onboarding steps complete out of order; F interact priority; camp danger warning; low-HP potion pulse; L1-5 survival (damage cut, halved poison, mage Ice Barrier, camp moved off Sisli Magara entrance); duplicate quest title renamed (Bugday Tarlasindaki Domuzlar).
- QA: tools/qa/first-hour.mjs is the real-input first-hour driver (knight L5 at 22.4 min, 0 deaths; rogue 2 deaths). Bot fixes: boss objectives pulled at any level, exact quest-title matching, healer self-heal order, retreat below 60% HP. Run it after any first-hour change.
- Open: priest first hour (28 deaths pre-fix, rerun pending), mage 10 deaths pre-fix; duplicate quest title 'Corak Kristalleri' (Karakir r8); L10-30 trash TTK too fast for some specs (class_ttk reports, 3-10 s info band); hit audio unheard by a human; questtypes sim rare timing flake.
