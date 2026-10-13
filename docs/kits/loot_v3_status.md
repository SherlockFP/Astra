# Loot V3 — status (2026-10-13)

Design: `docs/GDD_LOOT_V3.md`. Checker: `node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/loot_v3.mjs [uniqueIdFilter]` (PASS/FAIL, exit 1 on failure; `V=1` prints every PASS).
Owner of everything below: items module. Combat files touched are listed in section 4 (append-only, tiny).

## 1. Gap list: what GDD_LOOT_V3 asked for vs the code

State = **existed** (before this work) · **added** (this work) · **partial** · **missing** (why).

| GDD § | Piece | State |
|---|---|---|
| 0.1 F1 | Personal loot rolled on every peer, anti-leech 60 u, local `LootDrop` entities | existed |
| 0.1 F2 | Legendary pity (boss only, integer, cap 40) | existed -> **extended** (float 0..60, fed by boss chest, end chest, mini-boss, elite, named rare; hard pity at 30) |
| 0.1 F3 / §1 | Item-level ladder `LADDER` (`chestIlvl = 68 + 2·min(L,12)`, vault +3, `ILVL_MAX`) | **missing** by decision: `MPLUS.chestIlvl/vaultIlvl` and `mythicAffixes.vaultItemLevel` (mythic owner) must change together with CORE §4.4 (CM11); only `ILVL_MAX = 100` was added (ItemGen clamp was 95) |
| 0.1 F4 / §10.2 | `endOfRunRewards` M+ end chest | existed -> **extended** (Yiğitlik Taşı `4+L` timed / half depleted, legendary pity multiplier + pity feed, track stamp, `src`) |
| 0.1 F5 | `generateUnique` fixed lines unscaled by ilvl (O-L3 asks for scaling) | **missing** (changes drop power of all 87+16 uniques; needs a balance decision). `rescaleItem` exists and is used by the track |
| 0.1 F6 / §4 | Smart-loot bug (armour `classes` only knew 4 classes) | **added**: `WEIGHT_CLASSES` derived from `CLASS_ARMOR_WEIGHT`, `CLASS_AFFINITY` for all 11 classes |
| 0.1 F7 | Missing bases (`mace`, `bow`, `fist`, `sword2h`, `axe1h`, `crossbow`, `quiver`) | missing (item-base wave; the monk/archer smart pool therefore has no weapon/off-hand bases) |
| 0.1 F8 | Legacy `leg_*` hooks in combat (16 uniques) | existed (untouched: `LEGACY_WIRED_UNIQUES`) |
| 0.1 F9 / §3.2 / §10.3 | Effect DSL + proc engine fed by gear | **added** (section 2) |
| 0.1 F10 / §6 | Auto-salvage | **added** (`systems/AutoSalvage.ts`, `Settings.autoSalvage`, inventory toggle) |
| 0.1 F11 / §5 | Beams per rarity existed; named beam variant, fanfare sfx, banner, music duck, party announcement | missing (vfx-audio + hud: `lootBeam(obj, rarity, {named})`, `ui/hud/lootBanner.ts`, sfx/vfx ids) |
| 0.1 F12 / §2.4 | `BossChest` interactable | missing (scenes) |
| 0.1 F13 / §3.7 | Trinket slots | missing (P2, decision D13 keeps amulets) |
| 0.1 F15 / §10.4 | Great Vault: smart 100 %, named 30 %, "Efsane Taşı" option | missing (mythic owner: `MythicPlus.claimVault`) |
| §2.1 | Boss kill -> personal chest roll | **partial**: the roll is real (`systems/ChestRoll.ts`) but the items fall as the boss's personal ground drops (beams exist); no chest entity, no `PendingChest` persistence / pouch conversion / reveal panel |
| §2.2 | Chest rules per context (`CHEST_RULES`, `chestRuleFor`): 1 guaranteed + chance of a second (2 + 50 % levelling, 2 + 25 % world), final boss x2 second chance, per-context rarity weights, first item Nadir+ | **added** (`data/loot.ts`, `systems/ChestRoll.ts`, `LootSystem.rollKillDrops` boss branch). Old model (4 ground rolls + 50 % + 25 %, M+ 1 item) is gone for bosses |
| §2.2 | Boss materials / gem / gold / globes / `ruh_tasi` + `ejderha_pulu` | existed on the ground (O-L9 asks to move them into the chest: panel work) |
| §3.1 | `NamedDef`, `src/data/namedLoot/*`, `BOSS_LOOT` rows, `UniqueDef.fx/fxVars/effect/...` | **not needed in this form**: the dungeon docs' roster (87 uniques in `uniques.ts`, tables `loot_*_bN` with `uniqueIds`) is the live roster; its fx live in `data/uniqueFx.ts` (a map, because `types/*` is not editable here). The GDD's own 34-item roster (`NamedDef`) was not authored: it overlaps the 87 only partly and its effects are expressed here instead |
| §3.2 | DSL extensions DX-1 `zone`, DX-2 `burst`, DX-3 `foes(r)`, DX-4 `break`/`kick` | **added** (+ `roll` trigger) |
| §3.3 | `fxVars` / `fxRoll` strength rolls | missing (all effects have fixed numbers) |
| §3.5 | Budget lint LR1-LR8 (`tools/loot-check.mjs named`) | partial: parse/existence/no-skill-id checks run in the sim; the damage-share lint is not written |
| §4 | Smart loot: one 0.70 coin per item, class armour weight, class weapons/off-hands, main-stat line, class legendaries/sets only when smart, anti-streak (2 non-smart -> smart) | **added** (`ItemGen.generateItem`, `SmartLoot.ts`, `LootPity.ts`). Not done: duplicate-base protection, spec-role category bias (needs per-spec main stats, CORE §4.1) |
| §6 | Auto-salvage `off/poor/common/unneeded`, protected items, coalesced toast, first-time hint | **added** (setting row in the settings panel is panels-game work; the toggle lives in the inventory) |
| §7 | Elite weights (rare 2.5, epic 3, legendary 3), bad-luck guard, pity feeds, mini-boss/rare stones | **added**. Not done: mini-boss named chance (`miniNamed`), M+ elite item chance 35 % / ilvl offsets (depend on the ladder) |
| §8.1 | Legendary pity float + hard pity | **added** (`LootPity.ts`, flags `loot.pity`) |
| §8.2 | Named pity per boss (`p0 + 0.025·miss`, hard at 16) | **added** (flags `loot.namedMiss.<bossId>`; Monte Carlo matches the §8.2 table) |
| §9 | Yiğitlik Taşı (4 grades, income), track stamp, rank cost, `rescaleItem`, `upgradeTrack`, 60 % salvage refund, tooltip line | **added** (`data/trackData.ts`, `systems/Track.ts`, materials `yt_*`). **Missing**: the `yigitlik` panel (list, stat diff, Yükselt button), the blacksmith NPC entry, stone conversion NPC (P2) |
| §10.5 | `Upgrade.salvageYield` exported, refund on salvage | **added** |
| §10.7 / §11 | Events `loot:chest/chestOpened/named/autoSalvaged`, `track:upgraded`; `CharacterSave.loot`; `ItemInstance.track/fxRoll/src`; `UniqueDef` fields | missing in `src/types/*` and `core/events.ts` (not editable here): see section 5 for what was done instead |
| §12 | `tools/loot-check.mjs`, `dev/loot.html` | the sim `dev/combat-sim/loot_v3.mjs` replaces the checker (no dev page) |
| §2.5 / §9.6 | `lootChest` and `yigitlik` panels, collection log panel | missing (panels-items, larger UI work) |

## 2. Unique effect hooks

**How they work.** `data/uniqueFx.ts` maps each of the 87 Season 1 uniques to an effect-DSL row (`T` triggered procs, `S` stats). `systems/UniqueEffects.ts` folds the rows of the **equipped** uniques into the same `ActiveFx` as the talent layer: `StatCalc.collectFx` ends with a gear stage (`foldEquippedUniques`), `CharacterState.recomputeStats` already hands `fx.procs` to `G.procs.setEntries`. Equip, unequip, upgrade and respec all end in `recomputeStats` (`player:stats`), so the proc rows follow the gear with no extra sync and no Combat/SkillSystem edit. A `broken` item folds nothing; the same unique on two rings folds once. Proc source ids are `item:<slot>:<uniqueId>#<row>`.

Triggers the combat code does not emit are derived lazily by `UniqueEffects.tickUniqueEffects()`, called from `LootSystem.update` (no `Game.ts` wiring): `roll` (rising edge of `player.dodging`), `break` (`poise:break` while the local player is a contributor, `G.loot.contributed(enemyId)`), `kick` (`enemy:castEnd` with `interrupted` and `interruptedBy` = the local player).

**Tooltip.** `describeItem` returns `specialLines` + `specialInactive[]`. Implemented effects show their Turkish text in the orange unique line (for `approx` rows the text of what really happens, not the design text). Needs-engine effects show the design text greyed out with the suffix "(etkin değil)". Both tooltip renderers (`ui/widgets/tooltips.ts`, `ui/panels/items/common.ts`) honour it.

**Coverage (87 season uniques; the 16 legacy `leg_*` keep their combat code):**

| Mode | Count | Meaning |
|---|---|---|
| full | 19 | the whole effect of the design text works (numbers sometimes taken from GDD_LOOT_V3 §3.6 where the GDD retuned them: Orrery 18 %, Amarth 180 %, Kara Kan 10 x 100 %) |
| approx | 60 | trigger -> payoff works, a sub-part is simplified or dropped (line shapes become circles, "every Nth" becomes a chance, a stack counter that is consumed becomes a capped stacking buff, allies-wide effects apply to self, backstab conditions dropped...) |
| needs engine | 8 | listed below |

Needs engine (greyed out in the tooltip):

| Unique | Missing piece |
|---|---|
| `mt_chest_entropy` Entropi Zırhı | incoming-damage deferral (spread a share of each hit over 8 s) in `Combat.hitLocalPlayer` |
| `leg_les_onluk` Cerrah Önlüğü | the same deferral + heal-received multiplier |
| `leg_les_kanemici` Kan Emici Eldivenler | DoT tick speed by target HP, DoT crit, DoT transfer on death (StatusEffects tick hooks) |
| `leg_les_mumya_tomu` Mumyalama Tomu | damage multiplier by the number of distinct DoT kinds on the target, DoT extension |
| `leg_les_ayaz_tac` Kırağı Taçı | damage multiplier vs frozen / marked targets (outgoing damage hook) + mark spread |
| `uni_yk_harvestrobe` Hasatçının Kaftanı | DoT tick event (heal per tick, per-kind amplification stacks) |
| `leg_yg_isik_asa` Eyra'nın Işık Asası | line projectile that heals allies + a skill-count window (6 s) |
| `leg_eirich_crown` Boşluk Sözcüsü Tacı | DoT tick-speed multiplier, every-8th-tick nova |

Known simplifications that apply to many `approx` rows (so a future engine pass fixes several at once): no "next hit" consumption (buffs last their duration), `buff()` stacks are capped at 5 by the engine, ally-targeted statuses/buffs land on the wearer (`buff` is self-only, `st(near(r),…)` includes self), `st(…,bleed/burn/poison)` applies no DoT damage (no `dps` snapshot) so DoT-flavoured effects are written as `dmg`/`zone` hits, chances roll through PRD (no streaks).

## 3. Other loot pieces added

* **Smart loot** (§4): `SMART_LOOT = 0.70`, one coin per item in `ItemGen.generateItem` (`GenOpts.smart`: `true` forces, `false` = fully random, absent = coin); smart items get the class armour weight, class weapons/off-hands, a main-stat line (first suffix replaced when missing, equipment with 2+ lines), class legendaries and sets; `pickBase` lost its own 75 % coin; `WEIGHT_CLASSES` is derived from `CLASS_ARMOR_WEIGHT` (the 7 newer classes can now be dropped armour and equip it); `CLASS_AFFINITY` for all 11 classes; guaranteed chest items obey the 2-in-a-row anti-streak (`loot.offSmart`). Check: 100 % usable / right weight for forced-smart items in all 11 classes, >= 98 % carry the main stat, the 0.70 coin lands class-specific gear at 71-82 % usable.
* **Boss chest rules + named pity + hard pity** (§2.2, §8): `systems/ChestRoll.ts` (`rollBossChest`, `chestCtxOf`), `systems/LootPity.ts`, constants in `data/loot.ts` (`CHEST_RULES`, `chestRuleFor`, `chestStones`, `PITY`, `NAMED_PITY`, `SMART_LOOT`). The boss's named items are `LootTableDef.uniqueIds` of its `loot_*_bN` table. Verified: Monte Carlo chests-to-named matches the §8.2 table (5.5 / 5.1 / 4.6 / 3.3), never more than 17.
* **Pity feeds and elite guard** (§7, §8): boss chest +1, end chest +1, mini-boss +0.2, elite +0.1 (M+ +0.05), named rare +0.34; elites, mini-bosses and named rares use the pity weight multiplier; 4 elite items below Nadir force the next one Nadir+.
* **Yiğitlik Taşı + Yolu core** (§9): materials `yt_cirak/usta/sampiyon/efsane`, income from boss chests, M+ end chest, mini-bosses (50 %), open-world named rares (2 Çırak); `systems/Track.ts` (`stampTrack`, `trackInfo`, `nextRankCost`, `upgradeTrack`, `salvageRefund`), `ItemGen.rescaleItem`, tooltip line "Yiğitlik Yolu: Efsane 2/6 (88 → 94)", salvage refunds 60 % of the stones. `ItemInstance.track/src` are added by TypeScript module augmentation inside `Track.ts`.
* **Auto-salvage** (§6): `systems/AutoSalvage.ts` + `Settings.autoSalvage` (default `off`) + the "Oto-Parçala" button in the inventory toolbar (cycles Kapalı / Gri / Beyaz / Gereksiz). Gate runs in `LootSystem.rollKillDrops` before a generic drop spawns; coalesced toast every 4 s; one-time level-10 hint.

## 4. Engine (combat-owned) edits, all append-only

* `src/data/talentTrees/fx.ts`: triggers `roll break kick`, actions `zone burst`, `who` value `foes(r)`, arity checks for `zone`/`burst`.
* `src/combat/procActions.ts`: actions `zone` (ground zone at the trigger target, else the player; radius <= 6, dur <= 8, `taken` <= 0.2 via status `exposed`, <= 3 live zones per source) and `burst` (stacking mark, 8 s window, explodes at n); optional `ProcHost.enemiesAround` / `zoneTick` (implemented in `liveProcHost`); `ActionEnv.src`; `foes(r)` in `resolveWho`.
* `src/combat/Procs.ts`: `src: e.id` in the action env (1 line).

## 5. Requests / open issues for other owners

* **core (`src/core/events.ts`)**: events `loot:named { uid, uniqueId, bossId }`, `loot:autoSalvaged { count, sold, gold, yields }`, `track:upgraded { uid, from, to, track }`, `loot:chest`, `loot:chestOpened` (GDD §10.7). Nothing emits them yet.
* **core (`src/types/*`)**: move `ItemInstance.track/src` (now a module augmentation in `systems/Track.ts`) into `types/items.ts`; `CharacterSave.loot` (pity/seen/named-miss/pending/pouch) is stored in `save.flags` (`loot.pity`, `loot.namedMiss.<boss>`, `loot.seen.<unique>`, `loot.eliteSinceRare`, `loot.offSmart`, `hint.autoSalvage`) until then; `ChatAnn.k` `'loot'` for the party announcement.
* **mythic**: ladder `LADDER` / CM11 together with `vaultItemLevel`; `claimVault` smart 100 % + named 30 % + "Efsane Taşı" option; stones for Mitik/M+ vault.
* **panels-items (larger UI)**: `lootChest` panel + `BossChest` entity (scenes), `yigitlik` panel (use `Track.nextRankCost/upgradeTrack/canUpgradeTrack`), collection log ("Eşya Koleksiyonu", data: `loot.seen.*`, `loot.namedMiss.*`), stone conversion NPC.
* **panels-game**: a row for `autoSalvage` in the settings panel (Eşya group).
* **vfx-audio / hud**: named beam variant, fanfare sfx, `lootBanner`.
* **combat**: `poise:break` carries no breaker id (the `break` trigger uses "local player is a contributor"); `ProcEngine.reset()` is never called on scene changes (pending zone ticks of the old scene would still run); engine pieces of section 2.
* `generateUnique` fixed lines are still unscaled by item level (O-L3), and the season uniques can still roll from the generic legendary pool (any boss/elite at their `minItemLevel`) in addition to their boss tables.
