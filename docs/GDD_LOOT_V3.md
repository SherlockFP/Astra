# EFSUN ONLINE — Loot V3: personal boss chests, named dungeon items, smart loot, pity, Yiğitlik Taşı (implements CORE_MECHANICS §15)

Status: design, implementation-ready, 2026-10-13. Docs only: no code was changed, no dev server, no browser. Author: Opus-level spec for Haiku coders.
Precedence: `ARCHITECTURE.md` > `CORE_MECHANICS.md` > this document > `GDD_ITEMS_V2.md` / `GDD_V2.md` / `GDD_SYSTEMS.md` §7 > the dungeon docs (`docs/dungeons/*.md`, whose "signature item" proposals are adopted and reconciled in §3.6).
All player-facing text is Turkish; ids, code and prose are English. Every number is a tuning target for `tools/loot-check.mjs` (§12) and SimBench (CORE §5), not a promise.

## Table of contents
0. Scope, verified code facts, decisions, overrides, new ids, priorities
1. Loot contexts and the item-level ladder
2. Personal boss chest ("Patron Sandığı")
3. Named dungeon items: framework, 34-item roster, reconciliation with the dungeon docs
4. Smart loot
5. Rarity presentation: beams, sounds, fanfare, banner
6. Auto-salvage
7. Elite, rare and mini-boss rules
8. Pity (legendary, named, elite bad-luck)
9. Yiğitlik Taşı and the Yiğitlik Yolu (item-level upgrade track)
10. Integration with ItemGen / LootSystem / MythicPlus / Vault / StatCalc / Save
11. Data shapes and migration notes
12. Economy and balance checks
13. Work packages (Haiku waves, ≤ 3 file-disjoint agents per wave)
14. Verification and QA
15. Open questions

---

## 0. Scope, verified code facts, decisions, overrides, new ids, priorities

### 0.1 Code facts this document builds on (verified in the repo on 2026-10-13)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | Every enemy death calls `LootSystem.onEnemyKilled` on every peer; the peer rolls ITS OWN drops with a private `RNG(Date.now ^ Math.random)`; anti-leech 60 units; drops are local-only `LootDrop` entities. Boss outside M+ = `DROP_TABLES.boss` (4 item rolls + 50 % + 25 %, 2 × rare+), in M+ a boss drops 1 item (ilvl `60 + key + 2`, cap 77) plus `ruh_tasi` + `ejderha_pulu`; bosses spawn a "fountain" of ground drops | `systems/LootSystem.ts` `rollKillDrops`, `data/loot.ts` | Personal rolling is already the model; the boss ground fountain is what the chest replaces (§2) |
| F2 | Legendary pity: `flags['loot.pity']` (number, max 40) is bumped only by boss kills with ≥ 1 item and reset by any legendary/set; `legendaryMult = min(PITY_CAP 5, 1 + PITY_STEP 0.25 × pity)`; at mult 1 a generic boss item is legendary ≈ 1.8 %, at ×5 ≈ 8.5 % (rare 60×3, epic 8×4, legendary 1×4, set 0.8×4) | `LootSystem.legendPity`, `data/loot.ts` | §8 extends the counter to elites/rares and adds named pity |
| F3 | `data/loot.ts` `MPLUS` still holds the OLD ladder (`chestIlvl = 60 + 2·min(k,15)` cap 90, `vaultIlvl = 63 + 2·min(k,15)` cap 93); `data/mythicAffixes.ts` `vaultItemLevel = 63 + 2·min(max(k,1),15)`. CORE §4.4 says chest `68 + 2·min(L,12)`, vault = chest + 3 cap 96 | same | CM11 (ilvl ladder) has NOT landed. §1 implements it for loot; do not run CM11's loot part separately |
| F4 | `endOfRunRewards(state)` rolls the M+ end chest (timed 2 items, depleted 1 at −4 ilvl; epic `min(70, 25+3k)`, legendary `min(12, 3+0.5k)`, set `min(14, 5+0.5k)`) and deposits items/gold/materials itself; `MythicPlus.claimVault(slot)` rolls with `Math.random` (min epic, legendary 15 %, set 15 %), caching panel-rolled items in `flags['vault.items.<week>']` | `LootSystem.ts`, `MythicPlus.ts` | The end chest and vault keep their flow; they gain stones, named items, track and pity (§10) |
| F5 | `ItemGen`: ilvl clamp **95**; `generateUnique` copies `fixedAffixes` ranges UNSCALED (authored at `minItemLevel`, no ilvl scaling); `pickUnique` prefers class 70 %; `pickBase` smart 75 %; `pickAffixDef` favours `CLASS_AFFINITY` 50 % — which only has 4 classes | `systems/ItemGen.ts`, `data/affixes.ts` | §3.3 adds scaling, §4 fixes smart loot |
| F6 | **Smart-loot bug:** armour bases carry `classes: WEIGHT_CLASSES[weight]` = `{ heavy: [knight, barbarian], medium: [rogue], light: [mage] }`; the other 8 classes (monk, archer, paladin, necromancer, warlock, demonhunter, evoker…) match NO armour base, so `pickBase`'s class filter empties and falls back to any weight | `data/itemBases.ts` | LT-06 derives usability from `CLASS_ARMOR_WEIGHT` (§4.2) |
| F7 | Bases exist for `sword1h axe2h dagger staff wand shield tome` + 6 armour slots × heavy/medium/light × T1–T5 + rings/amulets/belts. **No** `mace`, `bow`, `crossbow`, `fist`, `sword2h`, `axe1h` bases. T5 starts at ilvl 70 (`TIER_MIN_ILVL = [1,15,30,45,70]`) | `data/itemBases.ts` | Named items use only existing bases or a `baseIds` fallback list (§3.1) |
| F8 | `UniqueDef.special {id, desc, params}` is registered by `StatCalc.registerSpecial`; combat reads it through `combat/specials.ts` `sp(id)` and bespoke hooks (16 legacy `leg_*` ids are wired: `leg_dragonfang`, `leg_skullsplitter`, `leg_ember_staff`, …). Gear never feeds the talent effect DSL | `systems/StatCalc.ts`, `combat/specials.ts` | New named items use the DSL (`fx`), not new bespoke combat code (§3.2); legacy ones stay as they are |
| F9 | The effect DSL (`data/talentTrees/fx.ts`: `S` stats, `M` skill mods, `T` triggered procs, `G`, `X`) and the proc engine (`combat/Procs.ts`, `G.procs.setEntries`) exist and are fed only by `collectFx(save)` (spec, trees, web). 16 triggers, 15 actions, 17 conditions (GDD_TALENTS App. D) | `StatCalc.collectFx`, `combat/Procs.ts` | Equipped uniques with `fx` fold into the same `ActiveFx` (§10.3) |
| F10 | Salvage exists only at the blacksmith (`Upgrade.salvageItem/salvageAll`, private `salvageYield`); no auto-salvage; `Settings` has only `autoLoot` and `lootFilter` | `systems/Upgrade.ts`, `core/Settings.ts` | §6 |
| F11 | Loot beams: `BEAM_TIERS` (uncommon ground glint, rare 3.2 m, epic 5.5 m swirl, legendary 9 m + rings + pulse, set 8.5 m + leaves) via `G.vfx.lootBeam(object, rarity)`; sfx `loot_drop`, `loot_drop_rare/epic/legendary`; legendary/set landing = camera shake + toast; no fanfare, no named-item distinction | `vfx/presets_world.ts`, `LootSystem.onDropLanded` | §5 |
| F12 | `Chest` interactable (hinged lid, tiers wood/iron/gold/epic, `chestTierForKey`), personal per peer in `DungeonScene` (treasure chests) | `entities/interactables/Chest.ts` | `BossChest` extends it (§2.4) |
| F13 | `EquipSlot` has **no trinket slot** (helm … amulet, ring1, ring2, weapon, offhand). The dungeon docs (`docs/dungeons/*.md` §5.x) already propose signature items, loot-table ids (`loot_yg_b1`, `loot_mt_b4`, `loot_kef_b1`, `loot_mp_les_b1`, `loot_ps_b1`, `loot_tk_b1`, `loot_yk_b1`, `loot_ys_b1`) and `uniqueIds/uniqueChance` fields | docs | Adopted in §3.6; trinkets become amulets/rings with `slotHint: 'trinket'` |
| F14 | `CharacterSave.flags` is `Record<string, number\|boolean\|string>`; `normaliseCharacterSave` fills defaults on every load; `SAVE_VERSION` is 2 | `core/Save.ts` | New persistent state goes in ONE optional field `CharacterSave.loot` (§11) |
| F15 | Great Vault: 3 slots at 1 / 4 / 8 completed key runs per week, ilvl by the n-th best key, panel caches rolled items | `MythicPlus.vaultOptions/claimVault` | §10.4 |

### 0.2 Decisions at a glance

| # | Decision | Section |
|---|---|---|
| D1 | A boss kill spawns a **personal Patron Sandığı** (local entity, rolled at spawn, persisted, never lost). The ground fountain is dropped for items; gold, potions, globes and quest items still drop on the floor | §2 |
| D2 | Chest = 1 guaranteed item (2 while levelling in Normal) + chance of a second; the guaranteed item is a **named dungeon item** with a per-boss chance (with pity), else a generic rare+ item; Yiğitlik Taşı and the boss materials ride in the chest | §2.2 |
| D3 | Named items are **data**: `NamedDef` rows (§3.1) with a stat block plus an effect written in the existing effect DSL (`fx`), folded from equipped gear into `ActiveFx`. Four small DSL extensions (DX-1…DX-4) cover every effect of the 34-item roster; no per-item combat code | §3.2 |
| D4 | Roster: **34 named items** (8 levelling-dungeon items, 26 season-dungeon items), 3–4 per season dungeon, every effect passes a damage/defence budget lint (§3.5) | §3.6 |
| D5 | Smart loot = **70 %** (was 75 %): usable base + armour weight of the class + a guaranteed main-stat line; spec role biases the slot; 30 % is fully random (alts, stash, salvage). Duplicate and anti-streak protection | §4 |
| D6 | Presentation: named items get their own beam variant, fanfare, banner and party announcement; chest opening reveals items in ascending rarity with a slow-motion beat on the best one | §5 |
| D7 | Auto-salvage setting `off / poor / common / unneeded` (grey is sold, white and green are salvaged), protected-item rules, one coalesced toast every 4 s, no ground clutter | §6 |
| D8 | Elites and named rares roll rare+ more often (weights ×2.5 / ×3 / ×3 + bad-luck guard); mini-bosses carry a small named chance; champions unchanged | §7 |
| D9 | Pity: one float `loot.pity` fed by bosses 1.0, rares 0.34, elites 0.1; legendary weight `× min(5, 1 + 0.25·pity)`, **hard pity at 30**; per-boss **named pity** (+2.5 pp per miss, hard at 16 misses) | §8 |
| D10 | **Yiğitlik Taşı**: four grades (Çırak, Usta, Şampiyon, Efsane) = difficulty tiers. Dungeon items carry a `track`; each rank costs stones + gold, adds +2 item levels and rescales the item ×1.022² per rank, up to the track cap (70 / 76 / 86 / 94). Raid-level 96+ stays raid-only | §9 |
| D11 | Great Vault options become smart, can roll a named item of the run's dungeon (30 %), and can be exchanged for Efsane stones ("pick one reward or a currency", CORE §6) | §10.4 |
| D12 | Nothing new crosses the network except `chat.ann` loot announcements; loot stays personal | §10.6 |
| D13 | No trinket slots in v3 (`slotHint: 'trinket'` is reserved); on-use trinkets become passive procs keyed to the `major` trigger | §3.6 |

### 0.3 Override list (this document changes an existing rule; the code owner updates)

| # | Existing rule | New rule | Owner |
|---|---|---|---|
| O-L1 | GDD_SYSTEMS §7.1 boss = 4 item rolls + extras on the ground; `DROP_TABLES.boss.itemRolls` | Boss items come from the chest (§2.2). `DROP_TABLES.boss` stays only for its **materials/gem lines** and as the fallback for a boss without a `BOSS_LOOT` row; its `itemRolls/extraRolls` are ignored for chest bosses | items |
| O-L2 | `LootTableDef.extraItems` (+1 on final bosses), `uniqueIds/uniqueChance` on dungeon boss tables (dungeon docs) | Ignored for chest bosses. The final boss gets a doubled second-item chance and named p0 × 1.25 instead. `uniqueIds/uniqueChance` stay only for open-world rares (Vadi Efsanevileri) | items |
| O-L3 | `generateUnique` fixed lines unscaled | Fixed lines scale from `minItemLevel`: flat stats ×1.022^Δ, percent stats ×1.010^Δ (cap ×1.35) (§3.3) | items |
| O-L4 | GDD_V2 O9: 70 % of legendary drops are Aspektli Efsanevi, 30 % named `leg_*` | O9 applies ONLY to the generic legendary roll in `ItemGen.generateItem`. Named dungeon items come from the `BOSS_LOOT` channel and are never converted | items |
| O-L5 | `pickBase` smart 75 %, `CLASS_AFFINITY` 4 classes, armour `classes` from `WEIGHT_CLASSES` | `SMART_LOOT = 0.70`; affinity derived from the main stat for every class; armour usability from `CLASS_ARMOR_WEIGHT` (§4) | items |
| O-L6 | `RARITY_WEIGHTS.elite` rare 1.5, epic 2, legendary 2 | rare 2.5, epic 3, legendary 3 (also used by mini-bosses) (§7) | items |
| O-L7 | `MPLUS.chestIlvl/vaultIlvl`, `vaultItemLevel` (old ladder), `ItemGen` clamp 95 | `LADDER` of §1 (CORE §4.4); `ILVL_MAX = 100` (raid last bosses are 99) | items, mythic |
| O-L8 | `flags['loot.pity']` | `CharacterSave.loot.pity` (float); the flag is read once for migration and then ignored (§11) | core, items |
| O-L9 | M+ boss drops `ruh_tasi + ejderha_pulu` on the ground | Delivered inside the boss chest (same counts) | items |
| O-L10 | `Upgrade.salvageYield` private | exported; salvaging a track item refunds 60 % of the stones spent on it | items |

### 0.4 New ids (all append-only; shapes in §11)

| Kind | Ids |
|---|---|
| Materials | `yt_cirak`, `yt_usta`, `yt_sampiyon`, `yt_efsane` (kind `currency`, stack 9999) |
| Item fields | `ItemInstance.track?`, `.fxRoll?`, `.src?`; `UniqueDef` += `fx? fxVars? effect? dungeonId? bossIds? baseIds? slotHint? bp?` |
| Save | `CharacterSave.loot?: LootProfile` (pity counters, collection log, pending chests, pouch) |
| Settings | `autoSalvage: 'off'\|'poor'\|'common'\|'unneeded'` (default `'off'`), `lootFanfare: 'full'\|'quiet'` (default `'full'`), `chestAutoTake: boolean` (default `false`) |
| Events | `loot:chest`, `loot:chestOpened`, `loot:named`, `loot:autoSalvaged`, `track:upgraded` |
| SFX | `loot_fanfare_legendary`, `loot_fanfare_named`, `loot_fanfare_set`, `chest_boss_rise`, `chest_boss_open`, `chest_reveal_tick`, `track_upgrade`, `track_upgrade_max`, `salvage_auto` |
| VFX | `boss_chest_beam`, `chest_rise_dust`, `named_beam_flash`, `track_upgrade_burst`, `stone_gain` |
| Panels | `lootChest` (data `{ chestId?: string, pouch?: boolean }`), `yigitlik` (data `{ uid? }`) |
| Chat | `ChatAnn.k` += `'loot'` |
| DSL | action `zone`, action `burst`, who `foes(r)`, triggers `break`, `kick` (§3.2) |
| Tools | `tools/loot-check.mjs`, `src/dev/loot.ts` + `dev/loot.html` |

### 0.5 Priorities

| P | What ships | Sections |
|---|---|---|
| **P0** | Ladder + `LADDER`, boss chest (roll, entity, panel, pouch), named framework + the 19 named items of LT-04 (levelling 8 + Yiğitler 4 + Büyücü 3 + Kefaret 4), smart loot fix, pity, stones income | §1–4, §8, §9.2 |
| **P1** | Remaining 15 named items (LT-05), Yiğitlik Yolu UI and costs, auto-salvage, fanfare/banner/party announcement, vault integration | §3.6, §5, §6, §9, §10.4 |
| **P2** | Collection log panel, stone conversion NPC, legacy unique conversion to fx, trinket slots | §9.7, §3.7, §15 |

---

## 1. Loot contexts and the item-level ladder

Constants live in `data/loot.ts` as `LADDER` (new) and `CHEST_RULES` (new, §2.2); `MPLUS` keeps its exported names as thin wrappers so old callers compile.

```ts
export const ILVL_MAX = 100;                         // ItemGen clamp (was 95); raid last bosses are 99
export const LADDER = {
  normal: (lvl: number) => clamp(lvl + 2, 1, 62),    // levelling dungeons: monster level + 2 (boss +3 via RANK_ILVL_BONUS)
  heroic: 66, mythic0: 70,                           // CORE §4.4
  chestIlvl: (L: number) => 68 + 2 * Math.min(Math.max(L, 2), 12),         // +2 → 72 … +12 → 92
  vaultIlvl: (L: number) => Math.min(96, 68 + 2 * Math.min(Math.max(L, 2), 12) + 3),   // chest + 3, cap 96
  mplusBossOffset: -4,   // non-final boss chest = chestIlvl − 4, final boss chest = chestIlvl
  mplusMiniOffset: -6,   // mini-boss item
  mplusEliteOffset: -8,  // elite item (min 62)
  finalBonus: 2,         // Kahramanlık / Mitik 0 final boss chest
} as const;
```

| Context id | When | Base ilvl (non-final / final) | Track (§9) |
|---|---|---|---|
| `normal` | levelling dungeon, difficulty `normal` | `lvl+2` / `lvl+3` (cap 62) | `c` Çırak |
| `heroic` | difficulty `heroic` (Kahramanlık) | 66 / 68 | `u` Usta |
| `mythic0` | difficulty `mythic` without keystone | 70 / 72 | `s` Şampiyon |
| `mplus` L2–L6 | `keyLevel` 2…6 | `chestIlvl(L)−4` / `chestIlvl(L)` | `s` Şampiyon |
| `mplus` L≥7 | `keyLevel` ≥ 7 | same formulas | `e` Efsane |
| `world` | world boss / open-world boss | `clamp(lvl + 3, 1, 60)` (existing `RANK_ILVL_BONUS.boss`) | none |
| `vault` | Great Vault slot | `LADDER.vaultIlvl(Lₙ)` | `e` (no ranks left above cap: ilvl ≥ 94) |

The existing M+ trash/elite rules (`keyLevel` branch of `rollKillDrops`) switch to `chestIlvl(L) + mplusEliteOffset` for elites (min 62) and `+mplusMiniOffset` for mini-bosses. Mitik 0 counts as key 1 for trash (as today).

---

## 2. Personal boss chest ("Patron Sandığı")

### 2.1 Flow

1. A boss dies (`rank === 'boss'` and it is not an affix unit / `proc_*` entity). Combat's single death hook calls `G.loot.onEnemyKilled(enemy)` on every peer (unchanged). `LootSystem.rollKillDrops` takes the new **boss branch**: it calls `ChestRoll.rollBossChest(ctx)` and spawns ground drops only for gold, potions, globes and quest items.
2. **Eligibility** (per peer, local): the local player is in the same instance AND (within 80 units of the boss OR damaged it within the last 120 s). Dead players are eligible. Else: no chest, XP still granted (existing rule). (Bosses use 80 instead of the trash anti-leech 60 because arenas are large.)
3. `rollBossChest` rolls the contents **immediately** (§2.3), writes a `PendingChest` into `save.loot.pending` and persists at once (`ch.persist(true)`), so a reload cannot re-roll it. Max 6 pending chests; a 7th converts the oldest into pouch items first.
4. After a 1.2 s beat (the boss death animation) a `BossChest` entity rises from the floor at the boss position (nav-resolved, local only, not replicated): `chest_rise_dust` vfx, `chest_boss_rise` sfx, camera shake 0.08, and the **beam of the best item inside** (§5.1) — a legendary orange beam above the chest tells the player what is inside before opening.
5. The player presses F within 3.2 m → `lootChest` panel (§2.5): cards flip in ascending rarity (0.45 s apart), then **Hepsini Al** (take all) moves the items to the bag. Stones, materials and gold are credited at once when the chest opens (they never need bag space).
6. Bag space: items need free slots. With too few: toast "Çantanda {n} boş yer gerekli." and the panel offers per-item **Al** and **Parçala** (salvage) buttons; unclaimed items stay in the chest.
7. The chest disappears 5 s after it is emptied. On `scene:leaving` every unopened or partly-opened chest is converted into **pouch** items (`save.loot.pouch`, "Zindan Emaneti", max 30, oldest auto-salvaged beyond 30) which the player can claim from the inventory banner or the Kadim Kasa NPC page. Nothing is ever lost to a disconnect.

### 2.2 Chest rules (`data/loot.ts` `CHEST_RULES`)

| Context | Items guaranteed | Second item chance | Rarity of guaranteed generic item (weights; pity multiplies legendary) | Named p0 | Stones (grade × count; final boss +) | Boss materials |
|---|---|---|---|---|---|---|
| `normal` (levelling) | 2 | 50 % | `rare 70, epic 24, legendary 1, set 5`, first item min rare | 0.10 | `yt_cirak` × 2 (+1) | `DROP_TABLES.boss.materials` lines |
| `heroic` | 1 | 35 % | `rare 60, epic 33, legendary 3, set 4` | 0.12 | `yt_usta` × 3 (+2) | same lines |
| `mythic0` | 1 | 40 % | `rare 45, epic 45, legendary 4, set 6` | 0.15 | `yt_sampiyon` × 3 (+2) | same lines |
| `mplus` L | 1 | `min(40 %, 10 % + 1.5 %·L)` (final ×1.5, cap 60 %) | epic `min(70, 25+3L)`, legendary `min(6, 1.5+0.25L)`, set `min(7, 2.5+0.25L)`, rare = rest (half the legendary/set of the end chest because there are more chests) | `0.15 + 0.01·min(L, 10)` | L2–6: `yt_sampiyon` × `3+⌊L/2⌋` · L≥7: `yt_efsane` × `2+⌊L/3⌋`; final boss ×1.5 (+ the M+ materials of §10.2) | `ruh_tasi ×1`, `ejderha_pulu ×1` (+ lines) |
| `world` | 2 | 25 % | `DROP_TABLES.boss` weights (existing) | 0 | none | same lines |

- **Final boss** (`BossLootDef.final`): second-item chance ×2 (cap 75 %), named p0 × 1.25.
- **Named replaces the guaranteed item**: if the named roll hits, the guaranteed item IS the named item (a generic guaranteed item is not rolled in addition). The second item (if any) is always generic. In `normal` the first guaranteed slot may be named, the second is generic.
- **Second item** minimum rarity `uncommon`; **guaranteed generic** minimum `rare`.
- The chest pouch also receives `gem` roll (`DROP_TABLES.boss.gemChance` 50 %), exactly the existing material/gem logic moved from the ground.
- Boss chest items are `bound = true` (as M+ chest items are today); generic legendary/set already bind.

### 2.3 `rollBossChest(ctx)` (new `systems/ChestRoll.ts`)

```ts
export interface ChestCtx {
  enemy: Enemy; bossId: string; dungeonId?: string; rank: 'boss';
  difficulty: 'normal' | 'heroic' | 'mythic' | 'mythicplus'; keyLevel: number; final: boolean;
  charLevel: number; classId: ClassId; spec: SpecId | null; rng: RNG;
}
export function rollBossChest(ctx: ChestCtx): PendingChest;        // pure apart from reading G.character (profile, bag/stash for duplicate weights)
export function rollVaultItem(slot: number, key: number, runDungeonId: string | undefined, rng: RNG): ItemInstance;   // §10.4
export function namedChance(ctx: ChestCtx, miss: number): number;  // §8.2
```

Algorithm (exact):
1. `ctxId` from difficulty/keyLevel (§1 table). `ilvl` = ladder value (non-final/final). `rules = CHEST_RULES[ctxId]`.
2. `def = BOSS_LOOT[bossId]` (fallback `{ named: [], table: enemy.def.lootTable }` — warn once).
3. **Named roll** (if `def.named.length`): `miss = profile.namedMiss[bossId] ?? 0`; `p = namedChance(ctx, miss)`; on success pick the unique with weights `×1` not-yet-seen, `×0.25` already in `profile.seen`, `×0.3` when `classes` excludes the looter's class (70 % class-fit rule is therefore soft); `miss ← 0`, push `generateNamed(uniqueId, ilvl, rng, ctx)`; on failure `miss += 1`.
4. **Generic guaranteed items**: for each remaining guaranteed slot `generateItem({ itemLevel: ilvl, classId, smart: 'roll', rarityCtx: { weights, minRarity: 'rare', allowSet: true, legendaryMult: pityMult }, focus: LOOT_TABLES[def.table]?.focus, setChance: LOOT_TABLES[def.table]?.setChance ?? 0.1 })` — `smart: 'roll'` means the 70 % coin of §4 is flipped inside.
5. **Second item**: `rng.chance(p2)` → one generic item, min `uncommon`, same weights.
6. **Track stamp** (§9.1) on every equipment item; **source stamp** `item.src = { d: dungeonId, b: bossId, k: keyLevel, df }`.
7. **Pity update** (§8): any legendary/set/named in the chest resets `profile.pity`; else `pity += 1`. Boss counts `+1` once per chest (not per item).
8. Currency lines: stones (§2.2), boss materials/gem (moved from `DROP_TABLES.boss`, via the existing roll code), gold stays on the ground.
9. Return `PendingChest { id, bossId, dungeonId, ctx: ctxId, t, best, items, stones, materials, opened: false }`; `best` = highest rarity among items (named counts as `legendary` + flag).

### 2.4 `BossChest` entity (`entities/interactables/BossChest.ts`, owner scenes)

`class BossChest extends Chest` with `tier: 'epic'` visuals at scale 1.25, no light budget cost (`noLight` unless fewer than 6 point lights alive). Constructor `(id, pending: PendingChest)`. `interactPrompt`: "Patron Sandığını Aç" / "Ödülleri Gör" when partly taken. `interact()` emits `ui:openPanel { panel: 'lootChest', data: { chestId } }`. It spawns the best-rarity beam through `G.vfx.lootBeam(this.object3d, best, { named })` and reports `update(dt)` rise animation (y from −1.2 to 0 in 0.9 s, eased). Never throws; a failed `load()` falls back to the `chest_epic` prop mesh of the scene kit, then to a box.

### 2.5 `lootChest` panel (panels-items)

- Layout (WoW-like loot window crossed with a gacha reveal): header "Patron Sandığı — {boss name}" + difficulty chip (`Normal / Kahramanlık / Mitik / Mitik +N`); a row of 1–3 item cards (icon, rarity frame, name, ilvl, "Yiğitlik Yolu: Efsane 0/6" line), then a currency strip (stones with their grade colours, boss materials, gem).
- Reveal: cards start face-down (rarity-coloured back). On open they flip ascending by rarity every 0.45 s with `chest_reveal_tick` (pitch rising 5 % per card); the **best card flips last** with `camera:punch { fov: 4, in: 0.08, out: 0.35 }`, a 0.35 s time-scale 0.5 beat (only when `lootFanfare = 'full'`) and the fanfare of §5. A named item shows the banner of §5.3 inside the panel as well.
- Buttons: **Hepsini Al** (default, Enter), per-card **Al**, per-card **Parçala** (salvage via `Upgrade.salvageItem`, confirm for rare+), **Kilitle** (lock). `chestAutoTake` skips the panel: items fly to the bag after the reveal animation.
- The panel works for `pouch: true` (list of pouch items, no reveal) and for a `chestId` of `save.loot.pending`.
- Escape closes without losing anything (chest keeps the rest).

### 2.6 Edge cases

| Case | Rule |
|---|---|
| Boss dies while the local player is dead | eligible; chest rises normally; opening requires being alive |
| Wipe, boss resets | no death → no chest |
| Leave instance with chests | converted to pouch (§2.1.7) in the `scene:leaving` handler; `persist(true)` |
| Two bosses die within 2 s (paired bosses, `group: 'makinistler'`) | the dungeon counts ONE boss (SP-07 pairing): one chest, rolled by the first `death` event whose `bossId` has a `BOSS_LOOT` row; the sibling's death is ignored by a 5 s per-group latch |
| Solo / party size | no scaling of chest contents (personal loot); party size only scales enemy HP (CORE §6) |
| `G.world` missing or enemy from another world | return (existing guards) |
| Save from before this feature | `save.loot` missing → defaults; no pending chests |

---

## 3. Named dungeon items

### 3.1 Data shapes

Extend `UniqueDef` (append-only, `types/items.ts`, core in LT-00):

```ts
export interface UniqueDef {
  /* …existing fields… */
  /** Effect DSL (data/talentTrees/fx.ts grammar) folded from equipped gear. `{name}` placeholders are resolved from fxVars + item.fxRoll. */
  fx?: string;
  fxVars?: Record<string, [number, number]>;       // placeholder → [min, max]; value = lerp(min, max, item.fxRoll)
  /** Turkish tooltip effect text, placeholders `{name}` formatted like the resolved value (percent stays percent). */
  effect?: string;
  dungeonId?: string; bossIds?: string[];
  baseIds?: string[];                               // first id that exists in ITEM_BASES wins (class-aware '{w}' / '{t}' templates allowed)
  slotHint?: 'trinket';                             // reserved for the optional trinket slots (§3.7)
  bp?: number;                                      // budget points of the effect (lint only)
}
```

Authoring format (new, one file per dungeon in `src/data/namedLoot/`): `export const NAMED_X: NamedDef[]`.

```ts
export interface NamedDef {
  id: string; name: string; dungeonId: string; bossIds: string[];
  baseIds: string[]; classes?: ClassId[]; minItemLevel: number;
  lines: UniqueDef['fixedAffixes'];
  effect: string; fx?: string; fxVars?: Record<string, [number, number]>;
  flavor?: string; slotHint?: 'trinket'; bp?: number;
}
export function toUnique(d: NamedDef): UniqueDef;   // special = { id: d.id, desc: effect (resolved at 0.5), params: {} }, source = `${dungeon TR} — ${boss TR}`
```

`data/uniques.ts` ends with `for (const d of NAMED_ALL) UNIQUES[d.id] = toUnique(d)` (import from `./namedLoot/index`; the named files never import `UNIQUES`, so there is no import cycle). `data/bossLoot.ts` builds `BOSS_LOOT` from the same rows plus per-boss overrides:

```ts
export interface BossLootDef {
  bossId: string; dungeonId: string; table: string;     // table = LOOT_TABLES id from the dungeon doc (focus, setChance); missing table → warn once, rank table fallback
  named: string[];                                       // UniqueDef ids this boss can drop (0–2)
  final?: boolean; namedBase?: number; miniNamed?: number;
}
```

`ItemInstance` additions: `fxRoll?: number` (0..1, rolled at generation: `rng.next()` with source floor `min(0.5, 0.03·L)` in M+), `src?: { d?: string; b?: string; k?: number; df: 'n'|'h'|'m'|'k' }`.

### 3.2 The effect framework (no per-item combat code)

Equipped uniques with `fx` fold through `foldItems` exactly like talent rows: `S` rows add stats, `M` rows modify skills, `T` rows become `ProcEntry`s of `G.procs`. Source id for the proc engine: `item:<slot>:<uniqueId>`. Rules:
- A `broken` or `corrupted`-stat-frozen item still counts (corruption freezes affixes only); a **`broken` item (Kırık) contributes no effect** (same as its stats).
- Duplicates of the same unique equipped twice (two rings) fold once (`registerSpecial` already dedupes by id).
- **Skill ids are forbidden in `fx` of named items**; use `@tag` filters only (CM12 renames skills). Allowed statuses/stats are the existing ids. `tools/loot-check.mjs` enforces it.
- Class-restricted items (`classes`) simply never drop for other classes (70 % soft rule, §2.3) but may be traded/dropped; the effect is harmless on another class (filters just never match).

**Four small DSL extensions** (owned by combat/items, package LT-02; all backward compatible, `parseFx` gets the names, the engine gets the behaviour):

| Ext | Syntax | Behaviour | Used by |
|---|---|---|---|
| DX-1 `zone` | action `zone(coef,type,radius,dur[,tick=1[,taken=0]])` | ground zone at the trigger target's position, owned by the player; every `tick` s damages enemies inside for `coef × weapon damage` of `type` (no further procs); `taken` adds `+taken` damage taken for enemies inside; at most 3 live zones per source id (oldest removed) | Halkor, Orrery, Ferula |
| DX-2 `burst` | action `burst(key,n,coef,radius,type[,status:dur])` | adds 1 mark `key` (per target, 8 s refresh, shown as a small pip over the nameplate); at `n` marks consumes them and explodes at the target: `coef × weapon damage` in `radius` m (skipped when `coef = 0`), optionally applying `status:dur` to every enemy hit | Amarth, Acid Fang, Kara Kan, Nalthor |
| DX-3 `foes(r)` | `who` value for `st(...)` | applies the status to enemies within r m of the PLAYER (existing `near(r)` is allies only) | Nöbet Çanı |
| DX-4 triggers | `break`, `kick` | `break`: you broke an enemy's posture (event `poise:break`); `kick`: you interrupted an enemy cast (`ecast.interruptedBy`) | Gözcünün Gözü, Boynuzlu Tılsım |

Validation: `ACTIONS`/`TRIGGERS` sets and `parseFx` accept the new names; `parseFx` must report the same errors for bad arity. The engine caps: `zone` radius ≤ 6 m, dur ≤ 8 s; `burst` radius ≤ 8 m, `n` 2…12.

### 3.3 Scaling with item level and rolls

- **Fixed lines scale** (O-L3): authored at `minItemLevel` (`ref`); at generation `value = authored × s(ilvl − ref)` with `s = 1.022^Δ` for flat stats (`str dex int vit maxHp armor allAttr weaponMax-flat`) and `1.010^Δ` (cap ×1.35) for percent stats and local percentages. Δ ≥ 0 only. Track upgrades (§9.4) apply the same factors per rank, so a unique upgraded to an ilvl equals a unique dropped at that ilvl (±1 rounding).
- **Effect strength** is constant in ilvl by default (procs are tuned at the lint caps); `fxVars` placeholders vary it by `fxRoll` (4 items of the roster use them: Borusu, Orrery, Ferula, Skarmorak). The lint evaluates every item at its **maximum** roll.
- `rollMoreAffixes(..., 'legendary', 1, ...)` (one random line) stays as in `generateUnique`.

### 3.4 Slots and bases

Named items use `{w}` (armour weight of the looter) and `{t}` (tier by ilvl) templates: `helm_{w}_t{t}`, `shoulders_{w}_t{t}`, weapons `dagger_t{t}`, `axe2h_t{t}`, `staff_t{t}`, `shield_t{t}`, `tome_t{t}`, jewellery fixed ids (`ring_gold`, `ring_jade`, `amulet_ancient`, `amulet_amber`, `amulet_onyx`, `amulet_bone`). `baseIds` lists alternatives (e.g. `['dagger_t{t}', 'sword1h_t{t}']` picks the dagger for rogues and the sword for knights via `CLASS_WEAPONS`). Items needing absent bases (mace, polearm, bow) are in the backlog (§3.6).

### 3.5 Budget lint (every named effect, enforced by `tools/loot-check.mjs named`)

Reference throughput `R = 2.0` coef/s (weapon-damage coefficient of a sustained rotation: one coefficient-1.0 hit per 0.5 s). Trigger event probability per 0.5 s slot: `hit 1.0 · crit 0.30 · kill 0.25 · block 0.20 · hurt 0.30 · kick 0.10 · break 0.05 · status 0.20 · heal 0.50`.

| Rule | Check |
|---|---|
| LR1 damage procs | per T item: `D = coef` (`dmg`, `exp`), `coef·dur/tick` (`zone`), `coef` (`burst`, divided by `n`); rate `λ = min(2·p·ch, 1/icd)`; **share = D·λ/R ≤ 0.12** (12 % of sustained throughput, single target) |
| LR2 buffs | `Σ (stat bonus × uptime)`, uptime `= dur / max(icd, dur)`; offensive (damagePct, critChance, attackSpeed…) ≤ 0.06 · defensive (damageReductionPct) ≤ 0.06 |
| LR3 heals/shields | `icd < 20 s`: `heal ≤ 0.06`, `abs ≤ 0.08` of max HP · `icd ≥ 45 s`: `abs ≤ 0.50`, `heal ≤ 0.25` |
| LR4 crowd control | `st(foes(r), stun/freeze/slow)` duration ≤ 1.5 s and `icd ≥ 4 s`; never stacks on bosses (existing `ccImmune`) |
| LR5 zones | radius ≤ 4 m (≤ 6 for debuff zones with `coef = 0`), `taken ≤ 0.15` |
| LR6 no skill ids, only `@tag`, existing statuses/stats | parse + existence check (`fxContext`) |
| LR7 one effect per item (at most 2 `T` rows that are the same effect for two triggers) | count |
| LR8 `bp ≤ 150` and fixed lines ≤ the budget of an epic's 3 best lines at the item's ilvl | table lookup |

### 3.6 The roster: 34 named items

Season items: `minItemLevel 66`, `source` = "{dungeon} — {boss}". Levelling items: `minItemLevel` as listed. Lines: `wpn%` = local weapon damage %, `main` = looter's main stat (`mainStat: true`). Percent values are ranges at `minItemLevel`; they scale per §3.3. `fx` strings are the exact DSL (all rows without DX parse with the current `parseFx`; DX rows parse after LT-02). "Doc id" = the id proposed in the dungeon docs (renamed here where they were inconsistent).

#### Levelling dungeons (Normal; 8 items, 2 per dungeon)

| id | Name | Dungeon / boss | Base · classes | Lines | Effect (TR) | `fx` |
|---|---|---|---|---|---|---|
| `leg_km_kaldur_muhru` | Kaldur'un Kapı Mührü | Kemik Mahzeni · `boss_bekci_kaldur` | `shield_t{t}` · knight, paladin · min 8 | armorPct 40–55 % (local), blockChance 3 %, maxHp 40–60 | Bir saldırıyı bloklayınca 3 sn %10 hasar azaltma (6 sn bekleme). | `T block icd=6 => buff(km_kaldur,3,{damageReductionPct=.10})` |
| `leg_km_morkan_ruh` | Morkan'ın Ruh Kuyusu | Kemik Mahzeni · `boss_olucagiran_morkan` | `amulet_bone` · any · min 10 | allAttr 4–6, maxHp 30–50, resourceRegenPct 5–8 % | Öldürdüğün düşmanların %20'si 6 sn boyunca maks. canının %5'i kadar kalkan verir (2 sn bekleme). | `T kill ch=.2 icd=2 => abs(.05,6)` |
| `leg_kd_gurz_orsu` | Gurz'un Kızıl Örsü | Kızıl Dökümhane · `boss_dokumcu_gurz` | `axe2h_t{t}` · barbarian · min 18 | wpn% 60–75, str 8–12, fireDamagePct 8–12 % | Yakın dövüş kritikleri %25 şansla 3 m çevrede %120 ateş patlaması yaratır (2 sn bekleme). | `T crit:@melee ch=.25 icd=2 => exp(1.2,3,fire)` |
| `leg_kd_ignaroth_kor` | Ignaroth'un Mavi Közü | Kızıl Dökümhane · `boss_ignaroth` | `ring_jade` · any · min 20 | fireDamagePct 10–14 %, critDamage 10–15 %, dotPct 8–12 % | Yanan bir düşmanı ateş hasarıyla öldürdüğünde 4 m çevrede %50 ateş patlaması olur (3 sn bekleme). | `T kill:@fire icd=3 if=tst:burn => exp(.5,4,fire)` |
| `leg_bt_ayaz_ana_tac` | Ayaz Ana'nın Buz Tacı | Buzul Tahtı · `boss_ayaz_ana` | `helm_{w}_t{t}` · any · min 30 | main 12–18, cdr 4–6 %, resFrost 20 % | Buz hasarın %10 şansla hedefi 3 sn üşütür (3 sn bekleme). | `T hit:@frost ch=.1 icd=3 => st(tgt,chill,3,.3)` |
| `leg_bt_tugrul_kalkan` | Tuğrul'un Donmuş Kalkanı | Buzul Tahtı · `boss_tugrul` | `shield_t{t}` · knight, paladin · min 32 | armorPct 50–65 % (local), blockChance 4–5 %, resFrost 15–20 % | Canın %40'ın altına düşünce 5 sn maks. canının %25'i kalkan ve %10 can (45 sn bekleme). | `T hurt icd=45 if=hp<.4 => abs(.25,5) ; heal(.1)` |
| `leg_gt_nefris_bicak` | Nefris'in Gölge Bıçağı | Gölge Tapınağı · `boss_nefris` | `dagger_t{t}` · rogue, demonhunter · min 42 | wpn% 70–90, critChance 2–3 %, dex 15–22 | Gizlilikten çıkarken ilk vuruşun %60 ek gölge hasarı verir (6 sn bekleme). | `T hit icd=6 if=stealth => dmg(.6,shadow)` |
| `leg_gt_zakhar_gozu` | Zakhar'ın Uyanan Gözü | Gölge Tapınağı · `boss_zakhar` | `amulet_onyx` · any · min 44 | shadowDamagePct 12–16 %, lifeSteal 1–2 %, allAttr 10–14 | Gölge kritiklerin %15 şansla maks. canının %4'ünü iyileştirir (4 sn bekleme). | `T crit:@shadow ch=.15 icd=4 => heal(.04)` |

#### Season dungeons (Kahramanlık, Mitik 0, Mitik+; 26 items)

| id (doc id) | Name | Dungeon / boss | Base · classes | Lines | Effect (TR) | `fx` |
|---|---|---|---|---|---|---|
| `leg_yg_borusu` | Yiğitlik Borusu *(trinket)* | Yiğitler Sarayı · `boss_heymdal` | `amulet_ancient` · any | allAttr 12–16, maxHpPct 3–5 %, majorCdrPct 4–6 % | Bir büyük beceri (X/V/T) kullandığında 20 sn boyunca +%{dmg} hasar ve +%5 hareket hızı (90 sn bekleme). | `T major icd=90 => buff(yg_horn,20,{damagePct={dmg},moveSpeedPct=.05})` · `fxVars dmg [.06,.10]` |
| `leg_yg_valkyr_pelerini` | Valkyr Kanat Pelerini | Yiğitler Sarayı · `boss_hirya` | `shoulders_{w}_t{t}` · any | main 15–22, maxHpPct 3–5 %, resAll 6–8 % | Vuruşların %6 şansla 5 m çevrede %70 kutsal hasar saçar (1 sn bekleme). | `T hit ch=.06 icd=1 => exp(.7,5,holy)` |
| `leg_yg_av_pencesi` | Kanlı Av Pençesi | Yiğitler Sarayı · `boss_fenrur` | `dagger_t{t}`/`sword1h_t{t}` · rogue, demonhunter, knight, paladin | wpn% 80–100, ailingDamagePct 8–10 %, main 20–30 | Kritik vuruşlar hedefi 4 sn kanatır (1.5 sn bekleme). | `T crit icd=1.5 => st(tgt,bleed,4,.5)` |
| `leg_yg_aegis_golgesi` | Aegis'in Gölgesi | Yiğitler Sarayı · `boss_odyn` | `shield_t{t}` · knight, paladin | armorPct 60–80 % (local), blockChance 5 %, maxHpPct 4–6 % | Blokta en yakın 3 müttefike (10 m) 4 sn maks. canının %6'sı kadar kalkan verir (8 sn bekleme). | `T block icd=8 => st(near(10),shield,4,.06)` |
| `leg_mt_fener` (Alacakaranlık Feneri) | Alacakaranlık Feneri *(trinket)* | Büyücüler Terası · `boss_seranel` | `amulet_ancient` · any | allAttr 12–16, critChance 2–3 %, castSpeed 4–6 % | Savaştayken her 45 sn'de bir 8 sn boyunca +%12 kritik şansı. | `T tick:45 if=inCombat => buff(mt_lantern,8,{critChance=.12})` |
| `leg_mt_gemellus_golge` | Gemellus'un Üçüncü Gölgesi | Büyücüler Terası · `boss_gemellus` | `helm_{w}_t{t}` · any | main 20–30, cdr 3–5 %, maxHpPct 3–5 % | Vuruşların %4 şansla bir Yankı Kopyası doğurur: vuruşu %50 gizem hasarıyla tekrarlar (2 sn bekleme). | `T hit ch=.04 icd=2 => dmg(.5,arcane)` |
| `leg_mt_orrery_asasi` (`leg_orrery_staff`) | Yörünge Asası | Büyücüler Terası · `boss_degentrius` | `staff_t{t}` · mage, warlock, necromancer, evoker | wpn% 80–100, arcaneDamagePct 15–20 %, int 25–35 | Gizem veya gölge büyüler her 3 sn'de bir hedefin çevresinde 6 sn dönen bir Mercek Küresi başlatır (1.5 sn'de bir %{c} hasar, en fazla 3 küre). | `T hit:@arcane icd=3 => zone({c},arcane,3,6,1.5) ;; T hit:@shadow icd=3 => zone({c},arcane,3,6,1.5)` · `fxVars c [.15,.18]` · **DX-1** |
| `leg_kef_halkor_kiymik` (`leg_kef_halkor_shard`) | Halkor'un Kıymığı | Kefaret Salonları · `boss_halkor` | `ring_gold` · any | critChance 3–4 %, maxHpPct 3–5 %, main 15–20 | Kritiklerin %12'si hedefin altında 3 m'lik bir Cam Kırığı bırakır (4 sn, saniyede %50 hasar, 3 sn bekleme). | `T crit ch=.12 icd=3 => zone(.5,physical,3,4,1)` · **DX-1** |
| `leg_kef_ekelon_eye` | Gözcünün Gözü | Kefaret Salonları · `boss_ekelon` | `amulet_ancient` · any | attackSpeed 4–6 %, maxHpPct 3–5 %, ccReductionPct 6–10 % | Bir düşmanı sersemlettiğinde veya duruşunu kırdığında 6 sn %8 hasar azaltma (10 sn bekleme). | `T status:stun icd=10 => buff(kef_eye,6,{damageReductionPct=.08}) ;; T break icd=10 => buff(kef_eye,6,{damageReductionPct=.08})` · **DX-4** |
| `leg_kef_vessel` | Kefaret Kabı | Kefaret Salonları · `boss_alyez` | `tome_t{t}` · mage, warlock, necromancer, evoker | healingPct 6–8 %, maxHpPct 3–5 %, int 15–22 | İyileştirdiğinde (8 sn bekleme) hedefe 6 sn maks. canının %5'i kadar anima kalkanı verir. | `T heal icd=8 => st(ally,shield,6,.05)` |
| `leg_kef_ferula` | Kızıl Ferula | Kefaret Salonları · `boss_velkaan` | `staff_t{t}` · mage, warlock, necromancer | wpn% 90–110, damagePct 8–12 %, int 25–35 | Büyülerin %10 ihtimalle hedefin altında 4 m'lik Kefaret Halkası bırakır; içindeki düşmanlar 5 sn %{t} fazla hasar alır (6 sn bekleme). | `T hit:@spell ch=.1 icd=6 => zone(0,arcane,4,5,1,{t})` · `fxVars t [.10,.14]` · **DX-1** |
| `leg_les_amarth` | Hasatçının Tırpanı | Leş Uyanışı · `boss_hasatci_amarth` | `axe2h_t{t}` · barbarian | wpn% 80–100, critDamage 25–35 %, str 25–35 | Kritik vuruşlar hedefe İşkence Yankısı yükü verir; 5. yükte 4 m çevrede %180 gölge patlaması olur. | `T crit icd=0.5 => burst(torment,5,1.8,4,shadow)` · **DX-2** |
| `leg_les_dikisat` | Dikişet'in Kalbi | Leş Uyanışı · `boss_cerrah_dikisat` | `amulet_ancient` · any | maxHpPct 8–10 %, vit 20–30, critChance 3–4 % | Canın %40'ın altına düşünce 6 sn maks. canının %50'si kalkan ve +%20 hasar (90 sn bekleme). | `T hurt icd=90 if=hp<.4 => abs(.5,6) ; buff(les_stitch,6,{damagePct=.2})` |
| `leg_les_nalthor` | Ayazbağlayan'ın Asası | Leş Uyanışı · `boss_ayazbaglayan_nalthor` | `staff_t{t}` · mage, warlock, necromancer, evoker | wpn% 80–100, frostDamagePct 20–30 %, int 25–35 | Buz hasarın hedefe Kırağı Damgası vurur; 3. damgada 4 m çevre 1.5 sn donar. | `T hit:@frost icd=0.4 => burst(rime,3,0,0,frost,freeze:1.5)` · **DX-2** |
| `leg_ps_antler_charm` | Boynuzlu Bilgenin Tılsımı | Peri Sisleri · `boss_ingra_malok` | `amulet_ancient` · any | allAttr 10–14, moveSpeedPct 4–6 %, maxHpPct 3–5 % | Bir düşmanın büyüsünü kestiğinde veya duruşunu kırdığında 8 sn +%8 hasar ve +%8 hareket hızı (yığılmaz). | `T kick => buff(ps_antler,8,{damagePct=.08,moveSpeedPct=.08}) ;; T break => buff(ps_antler,8,{damagePct=.08,moveSpeedPct=.08})` · **DX-4** |
| `leg_ps_acid_fang` | Tred'ova'nın Asit Dişi | Peri Sisleri · `boss_tredova` | `dagger_t{t}`/`sword1h_t{t}` · rogue, demonhunter, knight, paladin | wpn% 80–100, poisonDamagePct 12–16 %, main 20–30 | Vuruşların %15 şansla Asit Yarası yükü verir; 5. yükte 4 m çevrede %150 zehir patlaması olur. | `T hit ch=.15 icd=0.8 => burst(acid,5,1.5,4,poison)` · **DX-2** |
| `leg_ps_lakali_tear` | Lakali'nin Gözyaşı | Peri Sisleri · `boss_tredova` (shared with Acid Fang) | `amulet_ancient` · any | healingPct 6–8 %, maxHpPct 4–6 %, resAll 6–8 % | Savaştayken her 25 sn'de bir en düşük canlı müttefikini maks. canının %12'si kadar iyileştirir ve 6 sn %10 güçlendirir. | `T tick:25 if=inCombat => healally(.12) ; st(ally,fortify,6,.1)` |
| `leg_tk_seda_lens` (`leg_seda_lens`) | Seda'nın Lens Gözü | Taşkasa · `boss_seda` | `ring_gold` · any | critChance 3–4 %, critDamage 10–15 %, main 15–20 | Kritiklerin %12'si hedefin çevresinde 4 m'lik bir Lens Patlaması yaratır (%70 silah hasarı, 2 sn bekleme). *(doc: 8 m line; the DSL has no line shape, so it is a burst)* | `T crit ch=.12 icd=2 => exp(.7,4,physical)` |
| `leg_tk_skarmorak_yurek` (`leg_skarmorak_heart`) | Çatlak Yürek | Taşkasa · `boss_skarmorak` | `amulet_ancient` · any | maxHpPct 6–8 %, damageReductionPct 2–3 %, vit 20–30 | Savaştayken her 12 sn'de bir maks. canının %{s}'i kadar kristal kalkan oluşur; kalkan hasar aldığında 4 sn +%15 hasar verir. | `T tick:12 if=inCombat => abs({s},12) ;; T hurt icd=12 if=shield => buff(tk_heart,4,{damagePct=.15})` · `fxVars s [.05,.07]` |
| `leg_tk_eirich_asasi` (`leg_eirich_staff`) | Eirich'in Fısıltı Asası | Taşkasa · `boss_eirich` | `staff_t{t}` · mage, warlock, necromancer, evoker | wpn% 80–100, shadowDamagePct 12–16 %, arcaneDamagePct 12–16 %, int 20–30 | Gölge ve gizem büyülerinin %10'u Boşluk Yankısı bırakır: büyü 1.5 sn sonra %60 hasarla tekrarlanır. | `T hit:@shadow ch=.1 icd=1.5 => dmg(.6,shadow) ;; T hit:@arcane ch=.1 icd=1.5 => dmg(.6,arcane)` |
| `leg_yk_yumurta_kesesi` (`uni_yk_sacbrood`) | Yumurta Kesesi *(trinket)* | Yankı Ağı · `boss_avanoksa` | `amulet_amber` · any | poisonDamagePct 8–10 %, maxHpPct 3–5 %, attackSpeed 3–5 % | Bir büyük beceri kullandığında 18 sn boyunca +%15 zehir hasarı ve +%10 saldırı hızı (120 sn bekleme). | `T major icd=120 => buff(yk_sac,18,{poisonDamagePct=.15,attackSpeed=.10})` |
| `leg_yk_gozetmen_baltasi` (`uni_yk_impaler`, polearm) | Gözetmenin Kazıcı Baltası | Yankı Ağı · `boss_anubzek` | `axe2h_t{t}` · barbarian | wpn% 80–100, physicalDamagePct 10–14 %, str 25–35 | Vuruşların %12 şansla 4 m çevrede %120 fiziksel patlama yapar ve hedefi 3 sn yavaşlatır (6 sn bekleme). *(doc: polearm line; no polearm base)* | `T hit ch=.12 icd=6 => exp(1.2,4,physical) ; st(tgt,slow,3,.3)` |
| `leg_yk_kara_kan_oragi` (`uni_yk_sickle`) | Kara Kan Orağı | Yankı Ağı · `boss_kikatal` | `dagger_t{t}` · rogue, demonhunter | wpn% 80–100, shadowDamagePct 15–20 %, critChance 3–4 % | Gölge vuruşlar Kara Kan biriktirir; 10 yükte 6 m çevrede %100 gölge patlaması olur. *(doc: 8 charges × 450 %; retuned by LR1)* | `T hit:@shadow icd=0.3 => burst(karakan,10,1,6,shadow)` · **DX-2** |
| `leg_ys_nobet_cani` | Nöbet Çanı | Yıldız Divanı · `boss_gerdan` | `shield_t{t}` · knight, paladin | armorPct 60–80 % (local), blockChance 5 %, maxHp 150–220 | Blokta (4 sn'de bir) 8 m çevredeki düşmanları 1.5 sn sersemletir, yakın müttefiklere 4 sn %8 güç verir. | `T block icd=4 => st(foes(8),stun,1.5) ; st(near(8),fortify,4,.08)` · **DX-3** |
| `leg_ys_alevcelenk` | Alevçelenk Yüzüğü | Yıldız Divanı · `boss_taliksa` | `ring_gold` · any | dotPct 15–20 %, fireDamagePct 6–9 %, maxHp 60–100 | Yanan bir düşman öldüğünde 6 m çevrede %60 ateş patlaması yayılır (3 sn bekleme). | `T kill icd=3 if=tst:burn => exp(.6,6,fire)` |
| `leg_ys_pinar_keser` | Pınar Kesen | Yıldız Divanı · `boss_melandros` | `dagger_t{t}` · rogue, demonhunter | wpn% 80–100, critChance 3–4 %, dex 20–30 | Kritikler %12 ek gizem hasarı verir ve 6 sn +%2 hareket hızı (en fazla 8 yığın). | `T crit icd=0.25 => dmg(.12,arcane) ; buff(ys_pinar,6,{moveSpeedPct=.02},max=8)` |

**Per-boss roster rows** (`BOSS_LOOT`): Kaldur→`leg_km_kaldur_muhru` · Morkan→`leg_km_morkan_ruh` · Azrakel→(both, final) · Gurz→`leg_kd_gurz_orsu` · Ateşyürek→none · Ignaroth→`leg_kd_ignaroth_kor` (final) · Ak Pençe→none · Ayaz Ana→`leg_bt_ayaz_ana_tac` · Tuğrul→`leg_bt_tugrul_kalkan` (final) · Nefris→`leg_gt_nefris_bicak` · Kevvas→none · Zakhar→`leg_gt_zakhar_gozu` (final). Season: Heymdal, Hirya, Fenrür, Odyn (final) = one each as in the table; Arkanotron→none, Seranel→Fener, Gemellus→Gölge, Degentrius (final)→Orrery; Halkor, Ekelon, Alyez, Velkaan (final) one each; Çürükkemik→none, Amarth, Dikişet, Nalthor (final); İngra Malok→Boynuzlu, Sis Çağıran→none, Tred'ova (final)→Asit Dişi + Gözyaşı; Seda, Skarmorak, Makinistler (Brokk+Dorlita, one boss)→none, Eirich (final); Avanoksa, Anubzek, Kikatal (final); Gerdan, Taliksa, Melandros (final). (Azrakel pool for levelling: Kaldur/Morkan items also drop from Azrakel at ×0.5 weight so the final boss always has something.)

**Backlog (data-only waves later, ids reserved):** `leg_les_curukkemik` Dikişli Hasat Kuşağı (belt_heavy, `T kill icd=1 => zone(.4,poison,4,6)`) · `leg_ps_mist_ocarina` Sis Çağıran'ın Ocarinası (ring, `T hurt icd=45 if=hp<.4 => buff(ps_mist,4,{damageReductionPct=.30})`) · `leg_tk_dorlita_cekici` (mace base absent) · `leg_yk_kozmik_yanki` (ring, `T major icd=90 => exp(6,10,shadow)`) · `leg_ys_yildiz_haritasi` (amulet, `T tick:45 if=inCombat => buff(ys_star,8,{critChance=.12,moveSpeedPct=.10})`) · `leg_yg_odyn_muhru` (ring, on major +12 % holy/lightning 15 s). Also chest/gloves/boots/belt named items for every dungeon (none of the 34 is a chest, gloves, legs, boots or belt: armour variety is the next data wave).

**Role coverage of the 34:** tanks 7 (Kaldur, Tuğrul, Aegis, Nöbet Çanı, Ekelon, Skarmorak, Dikişet) · healers 3 + 2 hybrid (Kab, Lakali, Borusu; Gözyaşı works for all) · casters 8 (Ayaz, Gemellus, Orrery, Ferula, Nalthor, Eirich, Zakhar, Halkor) · melee 10 (Gurz, Nefris, Av Pençesi, Amarth, Acid Fang, Gözetmen, Sickle, Pınar, Seda, Valkyr) · universal jewellery 12.

### 3.7 Later: trinket slots, legacy conversion, collection log

- **P2 trinket slots:** `EquipSlot += 'trinket1','trinket2'`, bases `trinket_*`, StatCalc + panel rows, `slotHint: 'trinket'` items move there unchanged. Until then the three trinkets are amulets.
- **P2 legacy conversion:** the 16 legacy `leg_*` uniques stay hooked (F8); converting those expressible in the DSL to `fx` is optional (LT-14).
- **P2 collection log** ("Eşya Koleksiyonu"): panel listing every named item by dungeon, grey until `profile.seen` contains it, tooltip with source boss and your miss counter ("Pity: 7/16"), progress counter per dungeon. Data already exists (`loot.seen`, `loot.namedMiss`).

---

## 4. Smart loot

`SMART_LOOT = 0.70` (`data/loot.ts`). Applies to generic chest items, the vault (100 % smart there), elites and rares; not to vendors (existing `smart` flag path) and not to named drops (they have their own class weights, §2.3).

### 4.1 What "smart" means (`systems/SmartLoot.ts`)

1. **Roll the coin once per item:** `smart = rng.chance(SMART_LOOT)`. The old inner 75 % in `pickBase` and the 70 % in `pickUnique` are removed (the coin is the only one).
2. **Category** (smart): weights `armour slot 1.0 · belt 0.8 · amulet 0.7 · ring 1.0 · class weapon 1.5 · class offhand 1.0`, then by the spec role (`getSpec(spec)?.role`): `tank`: offhand ×2 if the class has a shield, armour ×1.2; `healer`: offhand/tome ×2, jewellery ×1.2; `dps`: weapon ×1.5. No spec yet → class weights only.
3. **Base** (smart): armour bases must satisfy `CLASS_ARMOR_WEIGHT[classId] === base.armorWeight` (F6 fix); weapons/offhands must be in `CLASS_WEAPONS/CLASS_OFFHANDS`; the top tier available for the ilvl is preferred ×3 (existing rule).
4. **Main-stat guarantee** (smart, equipment with ≥ 2 affixes): the first rolled prefix-or-suffix line is forced to the **main stat** of the class (`mainStatOf(classId)`; `specMainStat(spec) ?? mainStatOf(classId)` once CORE §4.1 per-spec data lands) at its normal tier roll; if the base already has it as implicit nothing changes. `CLASS_AFFINITY` is generated for all 11 classes from the main stat plus a class list (`data/affixes.ts`).
5. **Not smart (30 %)**: uniform over `ALL_PICK_CATEGORIES` and every base — this is the intended "alt/stash/salvage" share.

### 4.2 Protections

| Rule | Value |
|---|---|
| Anti-streak | after 2 consecutive non-smart **guaranteed** chest items the next one is smart (`profile.offSmart` counter, reset on a smart item) |
| Duplicate protection (named) | already-seen unique weight ×0.25 (§2.3) |
| Duplicate base protection | when a generic rare+ roll lands on the same `baseId` as the item currently equipped in that slot and its ilvl ≤ equipped ilvl, re-roll the base once (not the rarity) |
| Class set pieces | `pickSetPiece` keeps 70 % class set (`CLASS_SET[classId]`) but only when smart |

### 4.3 Verification numbers

`tools/loot-check.mjs smart`: for each of the 11 classes, roll 5,000 chest items at ilvl 80 with `smart` forced true: **100 %** of armour bases match the class weight, 100 % of weapons are class weapons, ≥ 98 % of rare+ items carry the main stat on a non-implicit line; with the 70 % coin the measured fraction of usable items must land in 70–76 % (the non-smart 30 % are usable by chance ≈ 8 %).

---

## 5. Rarity presentation: beams, sounds, fanfare, banner

### 5.1 Beams (extends `BEAM_TIERS`, owner vfx-audio)

`G.vfx.lootBeam(object, rarity, opts?: { named?: boolean; chest?: boolean })` (optional third argument, backward compatible). The existing tiers stay; the table lists what is added.

| Rarity | Beam | Height | Visible | Extra |
|---|---|---|---|---|
| Sıradan / poor | none (label only) | – | label 15 m | – |
| Büyülü | green ground glint | – | 20 m | – |
| Nadir | blue `#0070dd` additive beam, slow pulse | 3.2 m | 30 m | short chime |
| Destansı | purple `#a335ee` beam + swirl | 5.5 m | 45 m | edge flash 0.5 |
| Efsanevi | orange `#ff8000` beam + 2 rings + pulse every 1.2 s | 9 m | 80 m | shake 0.12, toast, fanfare |
| Set | green-gold `#b8e04a` beam + leaf particles | 8.5 m | 80 m | shake, toast, set fanfare |
| **Named (Adlandırılmış)** | legendary core + **white-hot inner column**, dungeon accent ring colour, sparkle rate ×1.6 | **12 m** | **120 m** | `named_beam_flash` (0.8 s gold vignette), banner (§5.3), music duck 1.2 s, party announcement |
| **Boss chest** | beam of the best item inside, chest-sized ring (radius 1.4 m) | tier height | tier distance | `chest_rise_dust` on spawn |

Beam colour accent per dungeon is optional data: `NamedDef` has none in v3; the accent uses `RARITY_COLORS.legendary`.

### 5.2 Sounds (manifest entries in `audio/manifest_feel.ts`, ids in `types/audio.ts`)

| Event | SFX id | Build (existing files, layered) |
|---|---|---|
| Item lands (existing) | `loot_drop`, `loot_drop_rare`, `loot_drop_epic`, `loot_drop_legendary` | unchanged |
| Chest rises | `chest_boss_rise` | `sfx/world/impact_light_*` pitched 0.7 + `chest_locked` layer, 0.8 vol |
| Chest opens | `chest_boss_open` | `chest_open` + shimmer layer |
| Card flip | `chest_reveal_tick` | `sfx/ui/glass_02` pitch +5 % per card |
| Legendary reveal | `loot_fanfare_legendary` | `sfx/jingles/steel_02` + `sfx/world/bell_heavy_03` + `sfx/magic/shimmer_01`; **ducks music 0.5 s** |
| Set reveal | `loot_fanfare_set` | bell + shimmer, distinct pitch |
| Named reveal | `loot_fanfare_named` | `loot_fanfare_legendary` + low drum swell (`sfx/world/impact_heavy_*` pitched 0.6) + `achievement`; ducks music 1.2 s |
| Track upgrade | `track_upgrade` / `track_upgrade_max` | forge ding family (`forge_ding`), max = ding + shimmer |
| Auto-salvage tick | `salvage_auto` | soft `sfx/loot/item_misc_*` pitched 1.3, volume 0.25, at most 1 per 0.5 s |

Unknown ids fail silently (existing rule); `lootFanfare = 'quiet'` plays only `loot_drop_*` and skips ducking/slow-motion.

### 5.3 Banner, toast and party announcement

- **Legendary/Set** at chest open or ground landing: existing toast stays ("Efsanevi eşya düştü: {ad}").
- **Named**: top-centre banner (`ui/hud/lootBanner.ts`, 3.2 s, fade 0.3 s): icon (64 px), name in legendary orange (Cinzel), second line "{Zindan} — {Patron}" and, when `ilvl` ≥ 80, "Eşya Seviyesi {ilvl}". Title text **"ADLANDIRILMIŞ EŞYA"** above in gold small caps. One banner at a time; a second queues.
- **Party announcement**: when a legendary/set/named item is taken from a chest, the local peer sends `chat` with `ann: { k: 'loot', n: name, l: ilvl, r: rarity, c: classId }` (ChatAnn extension) → party chat line "Ayşe, [Kızıl Ferula] buldu!" with an item link (existing `ChatLink` snapshot). Solo/offline: no send.
- **Minimap**: legendary/set/named chests get the star icon (existing rule for legendary drops).

### 5.4 Settings

`lootFanfare: 'full' | 'quiet'` (default `full`): `quiet` removes slow-motion, music ducking, vignette flashes and banner animation (the banner becomes a toast). `screenShake` still scales every shake.

---

## 6. Auto-salvage

### 6.1 Setting and modes

`Settings.autoSalvage` (panels-game settings, "Eşya" group, label "Otomatik Parçala"):

| Mode | Poor (grey) | Common (white) | Uncommon (green) |
|---|---|---|---|
| `off` (default) | keep | keep | keep |
| `poor` | **sell** (gold = `sellValue`) | keep | keep |
| `common` | sell | **salvage** | keep |
| `unneeded` | sell | salvage | salvage **if not an upgrade** (below) |

### 6.2 Protected items (never auto-processed)

`item.locked`; `item.bound` with `rarity ≥ rare`; any `uniqueId`/`setId`/`aspectId`; `upgrade > 0`; filled sockets; `track` items; `rarity ≥ rare` in every mode; quest items; items matching a slot where the character has nothing equipped and whose ilvl ≥ character level − 6 (a possible first piece). In `unneeded`, an uncommon is an **upgrade** when its slot is empty OR `scoreOf(item) > scoreOf(equipped)`, where `scoreOf = itemLevel × (class-usable ? 1 : 0.5) + 2 × (#affixes on the class affinity list)`; wrong-class items are never upgrades.

### 6.3 Where and how

- `systems/AutoSalvage.ts`: `decide(item, ch): 'keep' | 'sell' | 'salvage'`, `process(item): { gold?: number; yields?: {id,count}[] } | null`.
- `LootSystem.rollKillDrops`: each rolled generic item passes through `AutoSalvage.decide` **before** `pushItem`; sold/salvaged items do not spawn (no clutter, no pickup lag); a small floating text "+5 Kara Demir" / "+12 altın" appears at the corpse (`G.vfx.damageNumber(..., 'xp', text)` style) and `bountyEvent('salvage', 1)` counts. Boss-chest items are rare+ and unaffected.
- Coalesced toast every 4 s, only when something was processed: "Otomatik: 14 eşya parçalandı (+31 Kara Demir, +6 Büyülü Toz), 9 eşya satıldı (+84 altın)". Event `loot:autoSalvaged { count, sold, gold, yields }`.
- Yields use the exported `salvageYield` (O-L10); `poor` sells instead of salvaging (the old salvage gave 50 % of 1 Kara Demir, which is worse than the vendor price).
- A first-time hint at character level 10: toast "Otomatik Parçala'yı Ayarlar → Eşya bölümünden açabilirsin."

---

## 7. Elite, rare and mini-boss rules

| Source | Today | New |
|---|---|---|
| Seçkin (elite) outside M+ | 1 item, +40 % extra, min uncommon; rarity weights rare ×1.5, epic ×2, legendary ×2 | counts unchanged; weights **rare ×2.5, epic ×3, legendary ×3** (O-L6); **bad-luck guard:** `profile.eliteSinceRare` counts consecutive elite items below rare; at 4 the next elite item is rare+ (reset on any rare+) |
| Seçkin in M+ | 30 % item, ilvl `min(75, 60+key)` | **35 %** item, ilvl `chestIlvl(L) − 8` (min 62), same weights as above |
| Named rare (`rare_*`) | `RARE_BASE`: min rare for all items, 15 % unique | unchanged + `legendaryMult ×1.5`, `profile.pity += 0.34`, **+2 `yt_cirak`** (open world only) |
| Mini-boss (`miniboss`) | 2 items +50 %, min rare ×1 | unchanged counts; weights as elite (O-L6); **named chance `miniNamed = 0.05`** per kill drawn from the non-final named pool of the dungeon (season dungeons only; `BossLootDef.miniNamed`); +1 stone of the context grade at 50 % |
| Champion (`enemy.champion`) | +1 item, rare floor | unchanged |
| Treasure goblin | 4–8 items rare+ | unchanged |
| Metin stones, world rares | existing tables | unchanged except the pity feed above |

**Legendary pity extends to elites** through the shared counter (§8.1): an elite adds 0.1 pity; M+ elites 0.05.

---

## 8. Pity

### 8.1 Legendary pity (generic legendary/set roll)

- Counter `loot.pity` (float, cap 60). Feeds: boss chest **+1.0** (once per chest), end chest **+1.0**, named rare **+0.34**, Seçkin **+0.10** (M+ **+0.05**), mini-boss **+0.2**.
- Reset to 0 when any generic legendary, set or **named** item is obtained from the roll channel (named items count).
- Legendary weight multiplier (existing formula, new input): `min(PITY_CAP 5, 1 + PITY_STEP 0.25 × pity)` → ×5 at pity 16.
- **Hard pity:** at `pity ≥ 30` the next boss-chest generic guaranteed item is forced to `legendary` (or `set`, 50/50 when the class has set pieces) and the counter resets.
- Expected: an average player makes ≈ 9 pity/hour (6 boss chests + 30 elites); without luck the hard pity lands after ≈ 3.3 h.

### 8.2 Named pity (per boss)

`profile.namedMiss[bossId]` = chests without a named drop from that boss. `namedChance(ctx, miss) = min(0.75, p0 + 0.025 × miss)` with `p0` from §2.2 (× 1.25 final boss, cap 0.75); at `miss ≥ 16` the chance is 1 (hard pity). The counter resets on a named drop from that boss.

Expected chests until the named drop (exact, from the formula; `tools/loot-check.mjs pity` re-computes):

| p0 | no pity | with pity | worst case |
|---|---|---|---|
| 0.10 (normal) | 10.0 | **5.5** | 17 |
| 0.12 (Kahramanlık) | 8.3 | **5.1** | 17 |
| 0.15 (Mitik 0 / M+2) | 6.7 | **4.6** | 17 |
| 0.20 (M+ ≈ +7) | 5.0 | **3.9** | 17 |
| 0.25 (M+ ≥ +10) | 4.0 | **3.3** | 17 |

A boss that owns two named items splits the success 50/50 (weights §2.3), so the second one costs ≈ 2× on average — intended farm depth. The collection log shows the counter.

### 8.3 Other protections

Elite rare guard (§7); anti-streak smart (§4.2); the pouch (§2.1) so disconnects never cost an item.

---

## 9. Yiğitlik Taşı and the Yiğitlik Yolu

### 9.1 Stones and tracks

Four stone grades (materials, kind `currency`, no vendor sale, stack 9999). One grade per difficulty tier, like WoW crests:

| Id | TR name | Colour | Dropped by | Track | Cap ilvl |
|---|---|---|---|---|---|
| `yt_cirak` | Çırak Yiğitlik Taşı | `#b08a5a` bronze | Normal dungeons, open-world named rares | `c` **Çırak Yolu** | **70** |
| `yt_usta` | Usta Yiğitlik Taşı | `#4aa3ff` blue | Kahramanlık | `u` **Usta Yolu** | **76** |
| `yt_sampiyon` | Şampiyon Yiğitlik Taşı | `#b050ff` purple | Mitik 0, M+ L2–6 | `s` **Şampiyon Yolu** | **86** |
| `yt_efsane` | Efsane Yiğitlik Taşı | `#ff8a10` orange | M+ L≥7, Great Vault currency option, raid (hook) | `e` **Efsane Yolu** | **94** |

Raid items (CORE §4.4: Normal 80, Kahramanlık 88, Mitik 96/99) have **no track** (they are not upgradeable above their drop ilvl, so ilvl 96+ stays raid-exclusive); raid bosses drop `yt_efsane` as currency. Open-world and vendor items have no track; the +N (Metin2) upgrade is their only path.

`item.track = { t: 'c'|'u'|'s'|'e', b: number, sp?: number }`: `t` the track, `b` the ilvl at which the item dropped (used for the rank counter), `sp` stones spent (for the 60 % salvage refund, §9.5). It is stamped by `Track.stampTrack(item, ctxId)` on every equipment item from a boss/mini-boss/M+ elite/chest/vault, but only when `itemLevel < cap`. **Rank** = `(itemLevel − b) / 2`; `maxRank = floor((cap − b) / 2)`.

### 9.2 Income (per player, personal)

| Source | Stones |
|---|---|
| Boss chest | §2.2 (Normal 2 (+1 final) · Kahramanlık 3 (+2) · Mitik 0 3 (+2) · M+ L2–6 `3+⌊L/2⌋` Şampiyon · M+ L≥7 `2+⌊L/3⌋` Efsane; final boss ×1.5 in M+) |
| Mini-boss | 1 of the context grade, 50 % |
| M+ end chest (timed) | `4 + L` of the grade of L; depleted: half (rounded down) |
| Great Vault currency option | slot 1: 20 · slot 2: 35 · slot 3: 55 `yt_efsane` (§10.4) |
| Salvage | 60 % of the stones spent on that item (§9.5) |
| Open-world named rare | 2 `yt_cirak` |

Reference run, M+ +10, 4 bosses, timed: bosses `5+5+5+8 = 23` + end chest `14` = **37 `yt_efsane`** (≈ 20–25 min). Weekly 8 keys ≈ 300 stones.

### 9.3 Cost of one rank

```
stones(ilvl) = ceil(6 + 0.7 × (ilvl − 60))        // ilvl = the item's CURRENT ilvl before the upgrade (62→8, 66→11, 70→13, 76→18, 80→20, 86→25, 90→27)
gold(ilvl)   = 300 + 45 × ilvl                      // 76 → 3,720 · 90 → 4,350
```
Stones are of the track's grade only (a Şampiyon item takes `yt_sampiyon`). +2 item levels per rank. Reference: bringing 12 slots from 88 to 94 (3 ranks each) = 36 ranks ≈ 1,000 `yt_efsane` ≈ 27 timed +10 keys ≈ 3.5 weeks at 8 keys/week — the seasonal chase in the middle of the ladder, below raid Mitik 96.

### 9.4 What an upgrade does (`Track.upgradeTrack(uid)`)

1. Validate: item exists (bag, stash or equipped), has `track`, not `broken`, not `corrupted`, `itemLevel + 2 ≤ cap`, enough stones + gold.
2. Spend stones and gold; `track.sp += stones`.
3. `rescaleItem(item, +2)`: `itemLevel += 2`; every rolled affix `value`, `weaponDamage[0..1]`, `implicit` stats and (for uniques) fixed lines multiply by `1.022² = 1.0444` (flat stats and weapon numbers) or `1.010² = 1.0201` (percent stats, cap total ×1.35 over the drop value); all re-rounded with the existing `roundAffixValue`. Affixes are **not re-rolled**; locked/efsun lines scale too; `special`/`bench`/`mw` keep their data. Gems, sockets, `upgrade` (+N), `uniqueId`, `fxRoll` are untouched.
4. `item.name` refreshed (`refreshItemName`); `persist`; if equipped → `recomputeStats()` and the gear channel update (existing).
5. Events: `track:upgraded { uid, from, to, track }`, sfx `track_upgrade` (`track_upgrade_max` at the cap), vfx `track_upgrade_burst` at the player/the blacksmith panel anvil.
6. **No failure, no destruction, no protection scroll**: a track upgrade always succeeds (the Metin2 +N layer is the gamble; this layer is the deterministic one). Idempotent per click; double-clicks are rejected by a 250 ms latch.

Interaction with other layers: `itemIlvlEquiv = itemLevel + UPGRADE_ILVL[up] + MW_ILVL[mw]` (GDD_ITEMS_V2 O-IT8) therefore includes the track automatically; `requiredLevelOf` is unaffected (≥ 62 clamps to 60); affix rerolls roll tiers by the new `itemLevel`; Kalite (quality %) is computed against the **current** ilvl ranges, so quality may drop after a rescale (accepted: quality is derived and cosmetic).

### 9.5 Salvage and conversion

- Salvaging a track item returns `floor(0.6 × track.sp)` stones of its grade in addition to the normal yield.
- **P2 stone conversion** (Taş Ustası or blacksmith tab): 4 stones of grade n → 1 of grade n+1 (up only), 50 gold per conversion. Never down.

### 9.6 UI

- **Panel `yigitlik`** (panels-items; also a "Yiğitlik Yolu" button in the item context menu and a second menu entry on the blacksmith NPC): left list of upgradeable items (equipped first, then bag; icon, name, `ilvl → ilvl+2`, rank "2/6", track colour chip); right: item preview with a stat diff (old → new for every line, green deltas), cost row (stones with owned/needed, gold), big **Yükselt** button, small "Hepsini Yükselt (tek kaza)" for the same item up to the cap (confirm). Currency strip with the four stones. Anvil ceremony reuses `ForgeFx` sparkle (no failure branch).
- **Tooltip lines** (`ui/panels/items/common.ts`): after the ilvl line, "Yiğitlik Yolu: Efsane 2/6 (88 → 94)" in the track colour; named items add "Adlandırılmış · {Zindan} — {Patron}" and the orange effect text; provenance `src` shows "Mitik +8" when present.
- **HUD**: stones appear in the currency strip of the inventory (existing materials list filters `kind: 'currency'`), plus a floating "+5 Efsane Taşı" (`stone_gain` vfx) on chest open.

### 9.7 Tuning knobs (all in `data/trackData.ts`)

`TRACKS` (cap, grade, name, colour), `STONE_COST = { base: 6, perIlvl: 0.7 }`, `GOLD_COST = { base: 300, perIlvl: 45 }`, `RANK_STEP = 2`, `SALVAGE_REFUND = 0.6`, `CONVERT_RATE = 4`, `RESCALE = { flat: 1.022, pct: 1.010, pctCap: 1.35 }`.

---

## 10. Integration map

### 10.1 `systems/ItemGen.ts` (items; after IT-03)

- `ILVL_MAX = 100` in the clamp of `generateItem`/`generateUnique`.
- `GenOpts` += `smart?: boolean | 'roll'` (`'roll'` flips the 0.70 coin once), `named?: { uniqueId: string; ctx: NamedRollCtx }` (delegates to `generateNamed`).
- `generateUnique`: fixed-line scaling (§3.3); `baseIds` resolution (first existing in `ITEM_BASES`, class-aware); `fxRoll` (rolled with the source floor); returns `src` when a ctx is given. Legacy uniques without `baseIds` behave as before.
- `pickBase`/`pickUnique`/`pickAffixDef`: §4 (single coin, `CLASS_ARMOR_WEIGHT`, main-stat guarantee, all-class `CLASS_AFFINITY`). `itemBases.ts`: `WEIGHT_CLASSES` derived from `CLASS_ARMOR_WEIGHT` (adds the 8 missing classes).
- New export `rescaleItem(item, deltaIlvl)` (used by `Track`).

### 10.2 `systems/LootSystem.ts` (items; after IT-05 / CM11)

`rollKillDrops` changes:
1. `rank === 'boss'` and eligible → `spawnBossChest(enemy, ctx)` (calls `rollBossChest`, persists, creates `BossChest`); ground drops: gold, potions, globes, quest items only. **The existing `DROP_TABLES.boss` material/gem lines move into the chest**; M+ `ruh_tasi` + `ejderha_pulu` move into the chest (O-L9).
2. Elites/mini-bosses: §7 (weights, guard, named mini chance, M+ ilvl/chance). `rollItem` passes `smart: 'roll'`.
3. AutoSalvage gate before `pushItem` (§6).
4. Pity feed (§8.1) replaces the `flags['loot.pity']` code.
5. `endOfRunRewards(state)` keeps its signature and deposit behaviour; changes: ladder (`LADDER.chestIlvl`), stones (`4+L` timed), `smart: 'roll'` for the 2 items (70 %), generic legendary pity, `src` + track stamp, named chance **0** for the end chest (the named channel is the boss chest and the vault).
6. `scene:leaving` handler `convertPendingToPouch()`; `loot.pouch` accessors `claimPouch(uid)`, `salvagePouch(uid)`.
7. New public API: `spawnBossChest`, `openChest(chestId)`, `takeChestItem(chestId, uid)`, `takeAllChest(chestId)`, `claimPouch(uid)`.

`LootDrop.ts` (items): pass `named` to `lootBeam`, draw the named label with a gold left border; chest items never use `LootDrop`.

### 10.3 `systems/StatCalc.ts` (items) and `CharacterState` (items)

- `collectFx(save)` gets a final **gear stage**: for each equipped slot with `it.uniqueId` whose `UNIQUES[id].fx` exists and `!it.broken`: `foldItems(acc, resolveUniqueFx(def, it), 'item:' + slot + ':' + id, 1)`. `resolveUniqueFx` replaces `{var}` by `lerp(fxVars[var], it.fxRoll ?? 0.5)`. `S` rows of an item `fx` are allowed but the roster does not use them (stats live in `lines`).
- `CharacterState`: `get loot(): LootProfile` (lazily defaulted), `addPity(n)`, `markSeen(uid)`, `noteChestMiss(bossId, hit)`, `addPending(chest)`, `removePending(id)`, `pouch` helpers. `addItem` unchanged.

### 10.4 `MythicPlus` and the Great Vault (mythic; after CM7)

- `vaultOptions()`: `itemLevels[i] = LADDER.vaultIlvl(keys[n-1])`; also returns `dungeons[i]` (the `dungeonId` of the run that unlocked the slot) and `stones[i] = [20, 35, 55][i]`.
- `claimVault(slot, mode: 'item' | 'stones' = 'item')`: `item` uses `ChestRoll.rollVaultItem(slot, key, dungeonId, rng)`; `stones` credits `yt_efsane` and marks the week claimed. The roll: smart **100 %**, min Destansı, legendary 15 %, set 15 % (existing), **named 30 %** from that dungeon's pool (class-weighted, duplicates ×0.25), `track` `e` stamped when `itemLevel < 94`, pity ignored (vault is a choice), `src.df = 'k'`. The panel rolls the three options once per week and caches them in `flags['vault.items.<week>']` as today (JSON of `ItemInstance[]`; named items fit the same shape); the `stones` option needs no cache.
- `completeRun` → `endOfRunRewards` unchanged call; it now also credits stones and uses the ladder.
- `data/mythicAffixes.ts` `vaultItemLevel` becomes `(k) => LADDER.vaultIlvl(k)`.
- Weekly reset, slot unlock counts (1 / 4 / 8) unchanged.

### 10.5 `Upgrade.ts` (items; after IT-02)

`export function salvageYield(item, r)`; `salvageItem` adds the 60 % stone refund and clears `loot.pouch`/pending references; blacksmith tabs unchanged (the `yigitlik` panel is separate, §9.6).

### 10.6 Net

No new channel. Loot stays personal. Only `chat.ann` with `k: 'loot'` (§5.3) is sent, and `ChatLink` snapshots already carry `uniqueId`. `compactItem` keeps `track`/`fxRoll` only when an item is shown in chat (≤ 5 affixes rule of GDD_ITEMS_V2 O-IT9 unchanged).

### 10.7 Events and settings

`core/events.ts` (append-only): `'loot:chest': { id: string; bossId: string; best: Rarity; named: boolean }`, `'loot:chestOpened': { id: string; items: string[] }`, `'loot:named': { uid: string; uniqueId: string; bossId: string }`, `'loot:autoSalvaged': { count: number; sold: number; gold: number; yields: { id: string; count: number }[] }`, `'track:upgraded': { uid: string; from: number; to: number; track: string }`. `core/Settings.ts` (append-only): the three settings of §0.4 with defaults.

---

## 11. Data shapes and migration notes

```ts
// types/loot.ts (core, new)
export type TrackId = 'c' | 'u' | 's' | 'e';
export interface TrackState { t: TrackId; b: number; sp?: number }
export type ChestCtxId = 'normal' | 'heroic' | 'mythic0' | 'mplus' | 'world';
export interface PendingChest {
  id: string; bossId: string; dungeonId?: string; ctx: ChestCtxId; keyLevel: number; t: number;
  best: Rarity; named: boolean;
  items: ItemInstance[];                         // not yet taken
  stones: { id: string; count: number }[];       // credited on first open, then emptied
  materials: { id: string; count: number }[];    // credited on first open, then emptied
  opened: boolean;
}
export interface LootProfile {
  v: 1;
  pity: number;                                  // generic legendary pity (float, cap 60)
  namedMiss: Record<string, number>;             // bossId → chests without a named drop
  eliteSinceRare: number;
  offSmart: number;                              // consecutive non-smart guaranteed items
  seen: string[];                                // unique ids ever obtained (collection log)
  pending: PendingChest[];                       // ≤ 6
  pouch: ItemInstance[];                         // ≤ 30 (Zindan Emaneti)
  stats: { chests: number; named: number; legendary: number; autoSalvaged: number; stonesEarned: number };
}
// types/items.ts (append-only): ItemInstance.track?: TrackState; ItemInstance.fxRoll?: number; ItemInstance.src?: { d?: string; b?: string; k?: number; df: 'n'|'h'|'m'|'k' };
// types/character.ts (append-only): CharacterSave.loot?: LootProfile;
// types/itemsV2.ts: ChatAnn.k += 'loot'
```

```ts
// data/trackData.ts (items)
export const TRACKS: Record<TrackId, { name: string; stone: string; cap: number; color: string }> = {
  c: { name: 'Çırak Yolu',    stone: 'yt_cirak',    cap: 70, color: '#b08a5a' },
  u: { name: 'Usta Yolu',     stone: 'yt_usta',     cap: 76, color: '#4aa3ff' },
  s: { name: 'Şampiyon Yolu', stone: 'yt_sampiyon', cap: 86, color: '#b050ff' },
  e: { name: 'Efsane Yolu',   stone: 'yt_efsane',   cap: 94, color: '#ff8a10' },
};
export const RANK_STEP = 2;
export const stoneCost = (ilvl: number) => Math.ceil(6 + 0.7 * (ilvl - 60));
export const goldCost = (ilvl: number) => 300 + 45 * ilvl;
```

Migration (all in `normaliseCharacterSave`, idempotent):
- `loot` missing → defaults (`pity` from `flags['loot.pity']` once, guarded by `flags['loot.migrated'] = 1`; the flag is left in place for downgrade).
- Items without `track`/`fxRoll`/`src` are valid; generic items already in bags/stash/equipment never get a track retroactively (no free upgrades for old gear).
- Legacy uniques (`leg_*` without `fx`) behave as before. Old `vault.items.<week>` caches stay valid (the new fields are optional).
- `MPLUS` exports remain (wrappers over `LADDER`); callers need no change.
- No version bump (`SAVE_VERSION` stays 2).

Turkish strings catalogue (keep consistent): "Patron Sandığı", "Patron Sandığını Aç", "Ödülleri Gör", "Hepsini Al", "Al", "Parçala", "Kilitle", "Zindan Emaneti", "Çantanda {n} boş yer gerekli.", "ADLANDIRILMIŞ EŞYA", "Yiğitlik Yolu", "Yiğitlik Taşı", "Yükselt", "Hepsini Yükselt", "Otomatik Parçala", "Gereksiz Eşyaları Parçala", "Eşya Koleksiyonu", "Çırak/Usta/Şampiyon/Efsane Yolu".

---

## 12. Economy and balance checks

1. **Item flow per run** (player, M+ +10, 4 bosses, timed): 4 boss chests × (1 + 0.25) ≈ 5.0 + end chest 2 = **7 items**; ≈ 0.7 named expected (p 0.25 × 4 bosses × named-owning bosses 3/4) ⇒ first named of any boss within ≈ 2 runs, a specific one ≈ 3.3 kills of its boss (§8.2). Old model: 1 per boss + 2 chest = 6. Roughly neutral on count, better on quality.
2. **Levelling dungeons (Normal):** 2 guaranteed + 50 % = 2.5 items per boss chest vs the old 4+0.75 ground rolls — lower count but each ≥ rare for the first (old: 2 of 4.75 rare+). Auto-salvage plus `profile.eliteSinceRare` keep upgrades flowing while levelling. Open risk listed in §15.
3. **Power budget:** named effects obey LR1–LR8 (≤ 12 % damage share, ≤ 6 % defence). The Metin2/Ustalık/efsun layers of GDD_ITEMS_V2 §4.7 are untouched; the track adds at most `1.0444^6 ≈ +30 %` to an item's numbers on a 6-rank track (cap ilvl 94 ≈ the CORE BiS slope `1.022^Δ`), i.e. it moves an item along the **existing** ilvl power curve and creates no new multiplier. Track caps stay 2 ilvl (≈ 4.4 %) below raid Mitik 96.
4. **Stone sinks vs sources:** 12 slots × (88→94) ≈ 1,000 `yt_efsane` ≈ 27 timed +10 keys; Şampiyon: 12 slots × (72→86, 7 ranks) × ~18 ≈ 1,600 `yt_sampiyon` ≈ 50 runs of M+ L2–6. Gold per rank 3.7–4.4 k: ≈ 160 k gold for a full Efsane round — comparable to Ustalık (GDD_ITEMS_V2 §2.8: 0.6 M per item) at ≈ 25 % of its cost. Knob: `STONE_COST.base/perIlvl`.
5. **Named gating:** 34 items × ≈ 5 kills of their boss at M+ p ≈ 0.2: a dedicated player completes one dungeon's set in ≈ 15 boss kills (3 items) — two weeks of keys at 8/week if the weekly key matches; the keystone service "Zindanı Değiştir" targets a dungeon.
6. **Verification (headless, `tools/loot-check.mjs`):** stages `named` (parse, lint LR1–LR8, ids, bases exist, no skill ids), `bosses` (every `bossId` exists in `BOSSES`/dungeon docs ids, every `table` exists or is warned), `ladder` (ilvl table of §1 for L = 2…15), `pity` (Monte-Carlo 200,000 chests per p0: mean within ±2 % of the table of §8.2, max 17), `track` (cost table, `rescaleItem` ×6 stays within ±1 % of `generateUnique` at the final ilvl, idempotent refund), `smart` (§4.3), `economy` (stone income per reference run: Normal boss 2/3, Kahramanlık 3/5, Mitik 0 3/5, M+ +10 37 ±1). Exit code 1 on any failure; needs Node ≥ 22.18 like `tools/talents-check.mjs`.
7. **Dev page** `dev/loot.html` (items): chest simulator (pick boss, difficulty, key; opens 1,000 chests; histogram of rarity/named; pity counters), track calculator, auto-salvage dry run. No per-agent browser testing (project rule): the page is for the final QA pass and for the user.

---

## 13. Work packages (Haiku coders; Sonnet reviews each wave's diff; ≤ 3 file-disjoint agents per wave)

Conventions for **every** package (copy into the agent prompt): finish with `npx tsc --noEmit` = 0 errors in your files and `node tools/loot-check.mjs <your stage>` where one is named; Turkish UI strings; never throw from a frame loop (warn once, degrade); touch ONLY the files listed; never change an existing exported signature (add optional fields/exports); shared type files (`src/types/*`, `src/core/events.ts`, `src/core/Settings.ts`, `src/core/Save.ts`) are touched only by **LT-00**; numbers come from this document and live in `src/data/*` constants, never inline; unknown ids (vfx, sfx, items) fail silently; **no browser tests, no dev server** (memory: low CPU) — verification is `tsc` + the headless checker; the orchestrator runs ONE Haiku QA browser pass at the end.

**Coordination gate (read first):** several files are also edited by packages of other plans. Before launching a package that touches such a file, the orchestrator checks that the other plan's package for that file is merged; otherwise the LT package waits one wave. File → other plan: `ItemGen.ts` IT-03 · `LootSystem.ts` IT-05, CM11 · `Upgrade.ts` IT-02 · `data/materials.ts` IT-01 · `StatCalc.ts` CM2, IT-41 · `CharacterState.ts` IT-04 · `MythicPlus.ts` CM7 · `ui/panels/items/common.ts` IT-33 · `LootDrop.ts` IT-15. **CM11 (ilvl ladder, loot part) is subsumed by LT-01/LT-06/LT-08/LT-10; do not run it separately for these files** (its budget formula §4.3 belongs to CM2).

### 13.1 Wave schedule

| Wave | Packages | Why this grouping |
|---|---|---|
| 0 | **LT-00** contracts + stubs | everything imports the types and stubs |
| 1 | **LT-01** loot data · **LT-02** DSL extensions + proc runtime · **LT-03** vfx/audio ids | data / combat+fx / vfx-audio: disjoint |
| 2 | **LT-04** named data A · **LT-05** named data B · **LT-13** checker + dev page | three data-only authors + the validator (runs after the wave) |
| 3 | **LT-06** ItemGen + SmartLoot + Track core · **LT-07** StatCalc gear fx + CharacterState + AutoSalvage · **LT-09** BossChest entity + banner | items / items / scenes+hud |
| 4 | **LT-08** ChestRoll + LootSystem + LootDrop · **LT-11** panels (chest, yigitlik, tooltips) · **LT-12** settings rows + NPC entry | needs LT-06/07 APIs; panels and settings are independent |
| 5 | **LT-10** MythicPlus ladder + vault + end chest · **LT-14** (optional) legacy unique conversion | needs LT-08 (`ChestRoll`) |
| QA | one Haiku browser pass (dev/loot.html + a dungeon boss kill) → Sonnet fixes | gate |

### 13.2 Packages

#### Wave 0

**LT-00 — Contracts, ids and stubs** · owner: core (orchestrator) · deps: none · size M
- **Files:** `src/types/loot.ts` (new), `src/types/items.ts`, `src/types/character.ts`, `src/types/itemsV2.ts`, `src/types/audio.ts`, `src/types/vfx.ts`, `src/core/events.ts`, `src/core/Settings.ts`, `src/core/Save.ts`, `ARCHITECTURE.md`; **stubs (compile-only):** `src/data/trackData.ts`, `src/data/bossLoot.ts`, `src/data/namedLoot/{index,levelling,yigitler,buyucu,kefaret,les,peri,taskasa,yanki,yildiz}.ts` (each exports an empty `NamedDef[]`; `index.ts` exports `NAMED_ALL`), `src/systems/{ChestRoll,SmartLoot,Track,AutoSalvage}.ts` (final signatures, returning `null`/`{ ok: false, reason: 'Henüz yok.' }`), `src/entities/interactables/BossChest.ts` (class stub extending `Chest`) + its export in `interactables/index.ts`.
- **Tasks:** (1) `types/loot.ts` exactly as §11 (+ `NamedDef`, `BossLootDef`, `ChestCtxId`, `TrackId`); (2) `types/items.ts`: `ItemInstance` += `track? fxRoll? src?`, `UniqueDef` += `fx? fxVars? effect? dungeonId? bossIds? baseIds? slotHint? bp?`; (3) `types/character.ts`: `CharacterSave.loot?`; (4) `ChatAnn.k` += `'loot'`; (5) SFX/VFX ids of §0.4 appended to `types/audio.ts`/`types/vfx.ts`; (6) events of §10.7; (7) settings of §0.4 with defaults; (8) `normaliseCharacterSave`: default `loot`, `pity` migration from `flags['loot.pity']` with `flags['loot.migrated']`; (9) `ARCHITECTURE.md`: new files in module rows (items: data/trackData, bossLoot, namedLoot/*, systems/ChestRoll, SmartLoot, Track, AutoSalvage, tools/loot-check.mjs; scenes: BossChest; panels-items: LootChestPanel, TrackPanel), panels `lootChest`/`yigitlik`, the "Loot V3 flows" paragraph (boss chest, named effect fold, track) and the open items.
- **Done when:** `tsc` clean, game boots unchanged, an old save loads (gets `loot` defaults), no behaviour change.

#### Wave 1

**LT-01 — Loot data core** · owner: items · deps: LT-00 · size M
- **Files:** `src/data/loot.ts`, `src/data/materials.ts`, `src/data/trackData.ts`, `src/data/bossLoot.ts`.
- **Tasks:** (1) `data/loot.ts`: `ILVL_MAX`, `LADDER` (§1), `CHEST_RULES` (§2.2) as typed data, `SMART_LOOT`, pity constants (`PITY_FEEDS`, `PITY_HARD = 30`, `NAMED_STEP 0.025`, `NAMED_CAP 0.75`, `NAMED_HARD 16`), `RARITY_WEIGHTS.elite` update (O-L6), `MPLUS` wrappers (`chestIlvl`, `vaultIlvl`, same names); (2) `data/materials.ts`: the four `yt_*` currencies (§9.1, icons `item-upgrade-stone`, colours in desc); (3) `data/trackData.ts`: §11 data + `stampTrackFor(ctxId, ilvl)` helper; (4) `data/bossLoot.ts`: `BOSS_LOOT` builder from `NAMED_ALL` (§3.1) + the per-boss table of §3.6 as data (including the levelling dungeons' `final` flags and the Azrakel ×0.5 rule), `namedChanceBase(ctxId, keyLevel, final)`.
- **Done when:** `tsc` clean; `node tools/loot-check.mjs ladder` (once LT-13 exists; before that, a 10-line inline assert in the package report) prints the §1 table for L = 2…15 (`chestIlvl(12) = 92`, `vaultIlvl(12) = 95`, `vaultIlvl(15) = 95`).

**LT-02 — DSL extensions and proc runtime** · owner: combat + items · deps: LT-00 · size M
- **Files:** `src/data/talentTrees/fx.ts`, `src/combat/Procs.ts`, `src/combat/procActions.ts`, `src/combat/procConds.ts`.
- **Tasks:** implement DX-1 `zone`, DX-2 `burst`, DX-3 `foes(r)`, DX-4 triggers `break` (hook `poise:break`) and `kick` (hook the interrupt event) exactly as §3.2 incl. caps; `parseFx` accepts them (arity/numeric checks); engine behaviours reuse HitShapes/StatusEffects; mark UI is a small pip sprite on the nameplate (hud-free: emit `proc:mark` event or reuse `G.vfx`), per-source live-zone cap 3; never throw, warn once.
- **Done when:** `tsc` clean; a throw-away script (in the package report only, not committed) parses all 34 `fx` strings of §3.6 with 0 errors and rejects `zone(1,2)`, `burst(x)`, `st(foes(x),stun,1)`; the existing `node tools/talents-check.mjs` still exits 0.

**LT-03 — VFX and audio** · owner: vfx-audio · deps: LT-00 · size S–M
- **Files:** `src/vfx/VFX.ts`, `src/vfx/presets_world.ts`, `src/vfx/aliases.ts`, `src/audio/manifest_feel.ts`, `src/audio/aliases.ts`.
- **Tasks:** `lootBeam(object, rarity, opts?)` with the named/chest variants of §5.1 (named height 12 m, visible 120, white-hot core, ×1.6 sparkles; chest ring radius 1.4); implement the 5 VFX ids (`chest_rise_dust`, `named_beam_flash`, `track_upgrade_burst`, `stone_gain`, `boss_chest_beam`) as presets/aliases of existing ones; SFX entries/aliases of §5.2 built from existing sample files (layers via the manifest's `ly`), music ducking helper `G.audio.duck(seconds)` if the Audio class lacks a public one (use the existing `duckTarget/duckUntil` fields).
- **Done when:** `tsc` clean; unknown-id calls stay silent; `lootBeam(obj, 'legendary')` without opts renders exactly as before.

#### Wave 2

**LT-04 — Named data A** · owner: items · deps: LT-00 (types), LT-02 for the DX rows to validate · size M
- **Files:** `src/data/namedLoot/levelling.ts`, `yigitler.ts`, `buyucu.ts`, `kefaret.ts`.
- **Tasks:** transcribe the rows of §3.6 for Kemik Mahzeni, Kızıl Dökümhane, Buzul Tahtı, Gölge Tapınağı (8), Yiğitler Sarayı (4), Büyücüler Terası (3), Kefaret Salonları (4) into `NamedDef[]` (lines with `p()` helper for percents, `mainStat: true` where the table says "main", effect text with `{var}` placeholders, `fxVars`, `baseIds`, `classes`, `minItemLevel`, `bossIds`, `dungeonId`, `bp` estimate). Flavour text optional, Turkish, one sentence.
- **Done when:** `tsc` clean; every `fx` byte-identical to §3.6; `node tools/loot-check.mjs named` (after LT-13) passes for these files.

**LT-05 — Named data B** · owner: items · deps: as LT-04 · size M
- **Files:** `src/data/namedLoot/les.ts`, `peri.ts`, `taskasa.ts`, `yanki.ts`, `yildiz.ts`.
- **Tasks:** same for Leş Uyanışı (3), Peri Sisleri (3), Taşkasa (3), Yankı Ağı (3), Yıldız Divanı (3) = 15 items.
- **Done when:** as LT-04.

**LT-13 — Checker and dev page** · owner: items · deps: LT-00, runs against LT-01/04/05 outputs · size M
- **Files:** `tools/loot-check.mjs` (new), `src/dev/loot.ts` (new), `dev/loot.html` (new).
- **Tasks:** `tools/loot-check.mjs` in the style of `tools/talents-check.mjs` (module hook, stages `named bosses ladder pity track smart economy`, `--v`, exit 1 on errors); lint LR1–LR8 of §3.5 implemented as pure functions; Monte-Carlo stages seeded; `src/dev/loot.ts` + `dev/loot.html`: chest simulator, track calculator, auto-salvage dry run (uses only data and pure functions, no scene).
- **Done when:** `node tools/loot-check.mjs ladder pity named` runs without crashing on the current data (stages that need not-yet-filled data print `skip` instead of failing); `tsc` clean for `src/dev/loot.ts`.

#### Wave 3

**LT-06 — ItemGen, smart loot, track core** · owner: items · deps: LT-01, LT-04/05 (data), IT-03 gate · size L
- **Files:** `src/systems/ItemGen.ts`, `src/systems/SmartLoot.ts`, `src/systems/Track.ts`, `src/systems/Upgrade.ts`, `src/data/itemBases.ts`, `src/data/affixes.ts`, `src/data/uniques.ts`.
- **Tasks:** §10.1 in full (ILVL_MAX, `generateNamed`, fixed-line scaling, `baseIds`, `fxRoll`, smart coin and main-stat guarantee, single coin, `WEIGHT_CLASSES` derived from `CLASS_ARMOR_WEIGHT`, `CLASS_AFFINITY` for all 11 classes, `rescaleItem`); `SmartLoot.ts` (§4); `Track.ts`: `stampTrack`, `trackInfo(item)`, `stoneCostOf/goldCostOf`, `canUpgrade`, `upgradeTrack(uid)`, `convertStones` (P2, behind a const flag), events/sfx/vfx calls; `Upgrade.ts`: export `salvageYield`, add the refund; `uniques.ts`: `NAMED_ALL` merge line (§3.1).
- **Done when:** `tsc` clean; `node tools/loot-check.mjs smart track named` passes (all 11 classes smart-usable 100 %, `rescaleItem` ×6 within ±1 %, fx ids resolve).

**LT-07 — StatCalc gear fx, loot profile, auto-salvage** · owner: items · deps: LT-00, LT-02, LT-06 (resolveUniqueFx may live in `ItemGen`/`Track`; import it) · size M
- **Files:** `src/systems/StatCalc.ts`, `src/systems/CharacterState.ts`, `src/systems/AutoSalvage.ts`.
- **Tasks:** §10.3 gear stage in `collectFx` (no change to existing talent folds; `broken` skip; dedupe); `CharacterState` loot-profile accessors; `AutoSalvage.decide/process` (§6) incl. coalesced toast helper and `loot:autoSalvaged` event.
- **Done when:** `tsc` clean; with one fx unique equipped in a throw-away fixture `collectFx(save).procs` has the expected entries and an old save without uniques yields the same `ActiveFx` as before (deep-equal in the package report).

**LT-09 — BossChest entity and loot banner** · owner: scenes + hud · deps: LT-00, LT-03 · size M
- **Files:** `src/entities/interactables/BossChest.ts`, `src/entities/interactables/index.ts`, `src/ui/hud/lootBanner.ts` (new), one mount line in the HUD host file (`src/ui/hud/HUD.ts` or the file that mounts HUD widgets).
- **Tasks:** §2.4 entity (rise animation, beam, prompt, panel open, safe fallbacks); `lootBanner.ts` §5.3 (queue, `loot:named` / legendary / set listeners, `lootFanfare` respect).
- **Done when:** `tsc` clean; instantiating `BossChest` with a fixture `PendingChest` in the dev harness does not throw (verified by the QA pass, not by the coder).

#### Wave 4

**LT-08 — ChestRoll and LootSystem** · owner: items · deps: LT-01, LT-06, LT-07, LT-09, IT-05/CM11 gate · size L
- **Files:** `src/systems/ChestRoll.ts`, `src/systems/LootSystem.ts`, `src/entities/LootDrop.ts`.
- **Tasks:** §2.3 `rollBossChest`, `namedChance`, `rollVaultItem`; §10.2 (boss branch, elites/mini-bosses/rares §7, auto-salvage gate, pity feed §8, `endOfRunRewards` ladder + stones + smart, pouch conversion on `scene:leaving`, chest API); `LootDrop`: named flag to beam/label.
- **Done when:** `tsc` clean; `node tools/loot-check.mjs pity economy ladder` passes (mean chests-to-named within ±2 % of §8.2; stone income of the reference runs).

**LT-11 — Panels** · owner: panels-items · deps: LT-06, LT-07, LT-09, IT-33 gate for `common.ts` · size L
- **Files:** `src/ui/panels/items/LootChestPanel.ts` (new), `src/ui/panels/items/TrackPanel.ts` (new), `src/ui/panels/items/index.ts` (register `lootChest`, `yigitlik`), `src/ui/panels/items/common.ts` (tooltip lines §9.6), `src/ui/styles/panels-loot.css` (new, imported by the two new TS files), item context-menu entry in the inventory panel file that owns it.
- **Tasks:** §2.5 and §9.6 exactly; the reveal animation uses CSS transforms only (no per-frame JS loops beyond `requestAnimationFrame` while open); strings of §11.
- **Done when:** `tsc` clean; both panels open from `dev/panels-items.html?...` with a fixture (QA pass verifies).

**LT-12 — Settings rows and NPC entry** · owner: panels-game + scenes · deps: LT-00 · size S
- **Files:** `src/ui/panels/game/` settings file(s) that render the "Eşya" group, `src/entities/NPC.ts` (blacksmith second menu entry "Yiğitlik Yolu" → `ui:openPanel yigitlik`).
- **Tasks:** rows for `autoSalvage` (4-way select, help text of §6.1), `lootFanfare`, `chestAutoTake`; NPC menu entry; the level-10 hint toast hooks in `AutoSalvage` (already LT-07).
- **Done when:** `tsc` clean; settings persist through `G.settings`.

#### Wave 5

**LT-10 — MythicPlus ladder, vault, end chest** · owner: mythic · deps: LT-08, CM7 gate · size M
- **Files:** `src/systems/MythicPlus.ts`, `src/data/mythicAffixes.ts`.
- **Tasks:** §10.4 (`vaultOptions` ladder + dungeon + stones, `claimVault(slot, mode)`, `rollVaultItem` usage, week cache compatibility), `vaultItemLevel` wrapper, `completeRun` unchanged call; the vault panel (panels-game `mplusInfo`) shows the new "Efsane Taşı" option — that one-line UI change is done by LT-10 in `src/ui/panels/game/` only if the vault panel file is not owned by another package of the wave (otherwise a follow-up).
- **Done when:** `tsc` clean; `node tools/loot-check.mjs ladder` matches the vault table; an old week cache JSON still claims.

**LT-14 (optional, P2) — Legacy unique conversion** · owner: items · deps: LT-07 · size S–M
- **Files:** `src/data/uniques.ts` only. Convert the legacy `leg_*` whose `special` is expressible in the DSL to `fx` and drop the bespoke hook ids from combat only after a QA pass confirms parity (keep both until then).

---

## 14. Verification and QA

- **Per package:** `npx tsc --noEmit` = 0 errors in the package's files; the named `node tools/loot-check.mjs <stage>`.
- **Per wave:** a Sonnet review of the diff (project policy), then a Haiku fix pass; the orchestrator spot-checks `LootSystem.rollKillDrops` (boss branch) and `StatCalc.collectFx` (gear stage) personally.
- **Final QA (one Haiku browser pass, low CPU, one tab):**
  1. `dev/loot.html`: simulate 1,000 chests per context; named frequency and pity counters match §8.2 within the tolerance; auto-salvage dry run keeps protected items.
  2. Dungeon (Kemik Mahzeni, Normal): kill the first boss: chest rises after ≈ 1.2 s with the beam colour of its best item; open with F; reveal order ascending; **Hepsini Al** fills the bag; bag-full path shows the toast and keeps items; leave the dungeon with an unopened chest → item appears in the pouch banner.
  3. A season dungeon on Mitik 0 and a M+ key: stones appear (grade per §9.1), end chest unchanged in flow, vault shows ladder ilvls, "Efsane Taşı" option works.
  4. Equip a named item (use the dev grant): proc fires in the dev combat page (`dev/combat.html`), `G.procs` entry count matches, unequip removes it.
  5. `yigitlik` panel: upgrade an item two ranks: ilvl +4, stats ×1.0444² visible in the diff, stones/gold debited, tooltip line updates; salvage refunds 60 %.
  6. Settings: `autoSalvage = unneeded` while farming trash: coalesced toast, no ground clutter; `lootFanfare = quiet` removes slow-motion/ducking.
  7. Old save loads; no console errors during a full dungeon run.
- **Checklist for the reviewers:** no `Math.random` in loot rolling except cosmetics (use the injected `rng`); no named-item `fx` contains a skill id; `BOSS_LOOT` ids ⊂ real boss ids; every new material id has an icon; `tsc` clean.

---

## 15. Open questions (decisions for the orchestrator / user)

1. **Levelling dungeon chest size.** The user asked "1 guaranteed + chance of a second". For Normal levelling dungeons this spec uses 2 + 50 % (the old model gave 4.75 rolls and levelling relies on drops). Keep 2, or follow the letter (1 + 35 %) and compensate with elites? Number lives in `CHEST_RULES.normal`.
2. **Trinket slots.** Three signature trinkets (Borusu, Fener, Yumurta Kesesi) are amulets for now. Add `trinket1/trinket2` (UI, StatCalc, bases) as a P2 package, or stay amulet-only?
3. **Raid rows.** Raid bosses should use the same chest + `yt_efsane`; this doc leaves a hook (no track, stones only). A raid GDD must define `BOSS_LOOT` rows, ilvl 80/88/96/99 contexts and the Vault raid row.
4. **Stone conversion NPC** (P2): 4:1 up-only is a placeholder; confirm the NPC (Taş Ustası vs blacksmith tab).
5. **Status magnitudes.** `st(near(10),shield,4,.06)` and `st(ally,fortify,6,.1)` assume the fourth argument is a fraction of the target's max HP (shield) / a damage-reduction fraction (fortify). Combat must confirm the semantics when implementing the allies' `st` (STATUSES today has the ids but the magnitude convention of non-`dps` statuses is not documented).
6. **`kick` trigger source.** DX-4 `kick` needs a reliable interrupt event; `ecast.interruptedBy` exists on the net channel but no local G event is documented. LT-02 may add `kick:done` (core events, append-only) — core to decide whether LT-00 adds it now.
7. **Pity tuning.** Named p0 and the hard-pity thresholds (16 / 30) are first guesses from §8; revisit after the first playtest with `profile.stats` telemetry (local only, no server).
8. **Bound named items and Pazar.** Named items are `bound` (CORE §15 implies personal, build-defining). Confirm "no trade/Pazar for named items".
9. **Vault named chance 30 %.** Generous on purpose (a choice among 3); lower to 20 % if named items feel cheap.
10. **Armour named items.** None of the 34 is chest/gloves/legs/boots/belt; the next data wave should add one per dungeon (the backlog lists the first ones).
11. **Roster ids differ from the dungeon docs** where noted (e.g. `leg_orrery_staff` → `leg_mt_orrery_asasi`, `uni_yk_*` → `leg_yk_*`); the dungeon implementation packages (YS-x, MT-x, …) must use `BOSS_LOOT` instead of `uniqueIds/uniqueChance` on their `LOOT_TABLES` rows (they still add the table for `focus`/`setChance`).
