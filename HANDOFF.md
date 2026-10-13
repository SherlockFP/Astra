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
#   sims that must PASS: kit_plate kit_knight kit_barbarian kit_rogue kit_warlock wow_core wow_queue minions nc48
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
- **ElvUI redesign W1–W5:** action bar, unit frames, tracker, meter, minimap, chat tabs + bubbles + emotes, Zindan Bulucu (finder) + LFG net contract, docked panels.

## 5. Next steps (priority order)
1. **PM-PA Paladin** (Koruma/Kutsal/Ceza) — `docs/kits/plate-melee.md` "### PM-PA". Gate: NC48 ✓, NC46 ✓; still needs **NC51** (fill `src/combat/skills/behaviors_paladin.ts`), NC35/NC36 (pip HUD). Paladin skill stubs: `src/data/skillsets/paladin*.ts` are empty; class list in `src/data/classes.ts` must be switched to the 8-id list only once `paladin_divine_steed` / `paladin_word_of_glory` exist.
2. **PM-NE Nekromant** (Blood DK / Unholy DK) — needs NC52 (`behaviors_necromancer.ts`), NC45 Corpses, NC42 minion damage hooks (enemies target minions), NC43 minion net replication, NC44 MinionFrames HUD. Add the `'rune'` PipDef row.
3. **PM-TAL** talent re-pointing for plate (`docs/kits/talents_knight.json` not written yet).
4. **Agile / Evoker kits** (`docs/kits/agile-evoker.md`: AE-0 → AE-ENG/AE-V → AE-1..4 → AE-5/6).
5. **Loot v3 engine** — 87 named uniques have no special-effect hooks (`docs/GDD_LOOT_V3.md`).
6. **Procedural dungeons** (`docs/GDD_PROCGEN.md`: ~3 bosses, run ends on final boss), **creatures** (`docs/GDD_CREATURES.md`, Elden-Ring-ish mechanics).
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
