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
- **Paladin (PM-PA, NC51):** behaviours in `behaviors_paladin.ts` (map: `docs/kits/paladin_behaviors.md`); Koruma/Kutsal/Ceza rows in `skillsets/paladin*.ts`, `specs_paladin.ts`, `procs_kit_paladin.ts`, `rotations_kit_paladin.ts`, talent patch `docs/kits/talents_paladin.json` (applied by PM-TAL). Paladin is still not in `PLAYABLE_CLASSES`.
- **Minion infra (NC42/43/44):** enemies target/damage minions (owner-authoritative minion HP, see ARCHITECTURE Class contracts), `minion` channel replication, `src/ui/hud/MinionFrames.ts`.
- **ElvUI redesign W1–W5:** action bar, unit frames, tracker, meter, minimap, chat tabs + bubbles + emotes, Zindan Bulucu (finder) + LFG net contract, docked panels.

## 5. Next steps (priority order)
1. **PM-NE Nekromant** (Blood DK / Unholy DK) — NC42/43/44 done; still needs NC52 (`behaviors_necromancer.ts`), NC45 Corpses, then the kit data. `necro_ghoul` needs a `taunt` attack row. Rune pip comes from `TALENT_PIPS.rune` (no class `secondary` row — don't add a duplicate).
2. **Paladin leftovers:** Cleanse on remote allies (no net op to remove a status on the owner), Bulwark reflect, Consecration ally armour aura, `overheal_ward`, Kutsal Hüküm +25 % on judged target (`SkillDef.route` unread), `src/dev/wow/pmPaladin.ts`; talents-check warns `paladin_protection` tree BP 918 vs doc 1199 (pre-existing bench constant, not caused by the re-pointing).
3. **PM-TAL done** (plate talent re-pointing): patches `docs/kits/talents_{knight,barbarian,paladin,necromancer}.json` applied with `node tools/apply-talent-patch.mjs` (reusable for later class packages, then `node tools/gen-talent-data.mjs`). Open: `necro_lichborne` has no SkillDef, so `class:necromancer / s05B` still grants `necro_spirit_walk`; bench `spec:knight_protector` tree BP 958 vs doc 1391.
4. **Agile / Evoker kits** (`docs/kits/agile-evoker.md`: AE-0 → AE-ENG/AE-V → AE-1..4 → AE-5/6).
5. **Loot v3 engine** — 87 named uniques have no special-effect hooks (`docs/GDD_LOOT_V3.md`).
6. **Procedural dungeons** are built (`src/world/procgen/*`, status + deferred list in `docs/kits/procgen_status.md`; QA pass pending: entry stone, finder tab "Kadim Yarıklar", a full Normal run, party hash compare). Still open: grotto theme, the 30 generic guardians of GDD_PROCGEN §6, FissureTracker HUD, open-world stones, daily seed. **Creatures** (`docs/GDD_CREATURES.md`, Elden-Ring-ish mechanics) are not started.
7. **Pazar** (Metin2-style AFK player shops in a market square; gold goes to seller).
8. Endgame zones for season dungeon entrances, PvP/Finder (`docs/GDD_PVP_FINDER.md`), balance/SimBench.
9. **One in-browser QA pass** (UI W3–W5 never seen visually; emote clips unverified; minions unseen in game). Dev server: `.claude/launch.json` → `npx vite --port 5173`.

Known kit simplifications still open: Ani Ölüm rolls 8–10 % (engine multiplies by `params.proc`), remote clients don't send `threatMult`, Barbar blood shield heals instantly (no HoT consumer), Avatar/Kalkan details per `plate-melee.md`; rogue garrote silence, kingsbane scaling, prismatic bolt etc.

## 6. Working rules the owner set
- Agents: cheap model (Haiku) by default; stronger models only when needed. Sub-agents **never commit/push**; the lead agent reviews and commits.
- Push to GitHub only when the owner asks; always do the clean-export build check first.
- Low CPU machine: ≤5 concurrent agents, no per-agent browser tests, one QA pass at the end.
- Never `git stash` files another agent is editing.
- Downloads of external assets need the owner's explicit OK.
