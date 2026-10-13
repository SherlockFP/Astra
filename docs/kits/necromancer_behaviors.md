# Nekromant behaviours (NC52) and corpses (NC45) — what each necromancer skill row must set

Written by the NC45 / NC52 package for PM-NE (the data package that writes `src/data/skillsets/necromancer*.ts`, `specs_kit_necromancer.ts`, `procs_kit_necromancer.ts`, `rotations_kit_necromancer.ts`, `minions_kit_necromancer.ts`).
Kit numbers: `docs/kits/plate-melee.md` §8 (Kemik Muhafızı, Blood DK) and §9 (Ordu Efendisi, Unholy DK) — they win over `docs/GDD_CLASSES_V2.md` §5.
Code: `src/combat/skills/behaviors_necromancer.ts` (12 new behaviours, installed into `BEHAVIORS`), `src/combat/Corpses.ts` (`G.corpses`), `src/combat/magicShell.ts` (Anti-Magic Shell hook).
Sims: `dev/combat-sim/nc52.mjs` (behaviours, dev rows `t_*`), `dev/combat-sim/corpses.mjs` (registry + death hook).

## 0. How a row reaches a behaviour

* `SkillDef.behavior` wins over `targeting` (`behaviorFor`). Rows of the new behaviours keep a stock `targeting` where the behaviour needs the engine's soft target / range check: **`target_instant` for `death_strike`, `strike_self_buff`, `multi_cleave`, `scourge_strike`, `spread_aoe`, `death_order`; `target_projectile` for `death_coil`** (`SkillSystem.makeCtx` only picks a soft target for `melee_arc`, `dash`, `target_projectile`, `target_instant` and `requires.target` rows; the hard target comes from `aim.targetId` either way).
* `begin()` of the melee / lash behaviours is the stock `target_instant` check (target present, range with the 3 m melee lunge, line of sight) and fails unpaid (`sys.fail('target' | 'range')`: no cost, no cooldown, no pips).
* **The new behaviours apply `def.selfStatuses` themselves** (`SkillSystem` does it only for `kit_*` ids). `melee_arc`, `target_instant`, `grip`, `multi_strike` do not.
* Pips are paid by `SkillSystem.pay` from `def.pip` (`{ id: 'rune', cost: 2 }`, builders `params.gain`). The rune pip is `TALENT_PIPS.rune` (registered by `plateKit.ts`, max 6, +1 per 10 s); the necromancer ClassDef must NOT add a `secondary` rune pip. `resource` is `essence` (Öz = Runic Power, `regenRule 'rage'`): Öz gains are `params.gain` (+ `gainPerTarget`), Öz costs are `cost`.
* Remote replays (`c.remote`) are visual only: no damage, no minions, no statuses, no heals, never throw.
* DoT dps: the attacker fills it. Statuses on a **strike** (`def.statuses`, or `strike(.., {statuses})`) get `dps = hit amount x magnitude / duration` (Combat.resolveStatuses); statuses applied with `sys.statusOnly` do not. So DoT rows put the DoT in `def.statuses` of a damaging row and set `magnitude` = DoT coefficient / hit coefficient (Outbreak: 1.8 / 0.3 = 6; Kan Kaynatma: 1.4 / 1.4 = 1; Salgın fallback: 1.8 / 1.6 = 1.125).

## 1. New behaviours (params are `SkillDef.params.*` unless a `def.` field is named)

| behaviour | what it does | reads |
|---|---|---|
| `death_strike` | Melee strike on the aimed enemy, then the self-heal: `max(healPctOfRecent x damage taken in the last window s, minHealPct x max HP)`, x `vbMult` while `vampiric_blood`, x `c.more` (echoes); then a `blood_shield` absorb worth `shieldPct` of the heal. `def.selfStatuses` land on the caster. (`heal_self_recent` of plateKit only heals, it does not strike.) | `def.damage` (1.4), `def.range` (3.2), `def.arc`; `window` (5), `healPctOfRecent` (0.2), `minHealPct` (0.07), `vbMult` (1.3; set 1 to disable), `shieldPct` (0.2), `shieldCapPct` (0.45 of max HP), `shieldDur` (10) |
| `strike_self_buff` | One heavy strike on the aimed enemy, then `def.selfStatuses` on the caster (also on a miss when `buffOnMiss 1`). İlik Söken: `[{ bone_armor, 30, stacks 3 }]` (the status caps at 10). | `def.damage`, `def.range`, `def.selfStatuses`; `buffOnMiss` (0) |
| `multi_cleave` | `hits` hits `gap` s apart on the aimed enemy AND on the `cleave` nearest other enemies of the cone (`def.arc` around the cast direction); every hit carries `def.statuses` (slow on both). Öz gain once per cast. Unlike `multi_strike` the cleave targets take every hit. | `def.damage.coef` = coefficient PER HIT (0.5), `def.range` (3.2), `def.arc` (90), `def.statuses`; `hits` (2), `gap` (0.12), `cleave` (1), `cleaveMult` (1), `gain` |
| `scourge_strike` | Ranged lash. If the target carries `vile_contagion`, ONE stack is spent: the hit is `x (1 + stackMore)`, the plague erupts (every other enemy within `splashRadius` of the target that carries `virulent_plague` takes a `splashCoef` hit) and `summonPerStack` of `def.minion` are summoned (Küçük Ghul, group `lesser` cap 3). Without a stack it is a plain hit, no ghoul. | `def.damage` (0.55), `def.range` (25), `def.minion {id:'necro_lesser_ghoul', count 1, cap 3, group 'lesser', life 8}`; `stackMore` (0.35), `splashCoef` (0.5), `splashRadius` (5), `splashMax` (8), `splashNeed` (1 = only plagued enemies, 0 = all), `summonPerStack` (1), `gain` |
| `death_coil` | Homing bolt (the stock projectile path: `def.speed`, `def.homing`, `def.damage`), `x (1 + dtMore)` while `dark_transformation`; at cast time heals the caster's `pet`-group minions `petHealPct` of their max HP. **Aimed at an own minion** (target frame / reticle on it) it heals that minion `minionHealPct` and fires nothing. | `def.damage` (1.6), `def.range`, `def.speed`, `def.homing`; `dtMore` (0.2), `petHealPct` (0.05), `minionHealPct` (0.2) |
| `spread_aoe` | Salgın: strikes the aimed enemy and everything within `def.radius` of it (target first, then nearest, `maxTargets`). Every DoT in `def.statuses` (statuses with a `dotType`) is **copied from the target** (its live dps and remaining time) to the other enemies; where the target has none, the row's own application runs (dps from the hit). `x (1 + dtMore)` under `dark_transformation`. `center 1` = centred on the caster, no target needed. | `def.damage` (1.6), `def.radius` (8), `def.range` (25), `def.statuses`; `maxTargets` (8), `center` (0), `dtMore` (0.2), `gain` |
| `death_order` | Ölüm Emri: orders the caster's minions (`armyOnly 1` = group `army` only, else all within 40 m) onto the aimed enemy: `Minions.focus` for `focusSec`, a ring teleport round the target, and ONE merged hit of `cmdCoef x ghoul count` through `Minions.strike` (owner stats). With `cleaveMin` or more enemies within `cleaveRadius` of the target, up to `cleaveMax` others take `cleaveMult` of that. Spends one `vile_contagion` stack like the strike. Fails unpaid without a target or without minions. | `def.range` (30), `def.damage.type`; `cmdCoef` (per ghoul: 2.0 total / 8 = 0.25), `focusSec` (6), `armyOnly` (0), `cleaveMin` (3), `cleaveRadius` (5), `cleaveMax` (5), `cleaveMult` (0.5) |
| `empower_minions` | Karanlık Dönüşüm: `def.selfStatuses` (`dark_transformation`) on the caster, the caster's `pet`-group minions deal `dmgMult` x for the status duration (see §5), and all minions focus the aimed enemy. | `def.selfStatuses` (`dark_transformation` 15); `dmgMult` (2), `dur` (15, only if the status is not in the row), `focusSec` (= duration) |
| `summon_ring` | Ölüler Ordusu: `def.minion` summoned (the usual caps; `ignoreCap` skips the group cap, the owner cap 14 / world cap 40 stay), then placed in a ring of `ringRadius` round the caster (nav-resolved); `def.selfStatuses` (`army`) on the caster. grave_rise per ghoul + shockwave + shake. | `def.minion {id:'necro_army_ghoul', count 8, life 30, ignoreCap true, group 'army'}`, `def.selfStatuses`; `ringRadius` (4.5) |
| `magic_shell` | Büyü Karşıtı Kalkan: a MAGIC-ONLY absorb (every damage type except `physical` / `true`) of `absorbPct x max HP` for the status duration; refunds `rpPerPct` Öz per 1 % of max HP soaked, at most `rpCap` per shell. The status ends with the shell. The hook is `absorbMagicShell` in `combat/magicShell.ts`, called by `Combat.hitLocalPlayer` right before the type-blind `statuses.absorb`. | `def.selfStatuses` (`anti_magic_shell` 8); `absorbPct` (0.3), `rpPerPct` (1), `rpCap` (20), `dur` |
| `raise_dead` | Corpse consumer: takes the nearest corpse within `corpseRange` of the caster (or of the aim point, `atPoint 1`), summons `def.minion` ON it (HP x `1 + corpseHpBonus`), refunds `corpseRefund x def.cost`. `needCorpse 1`: fails unpaid without a corpse; `needCorpse 0` summons at the caster anyway. | `def.minion`, `def.cost`; `corpseRange` (12), `corpseHpBonus` (0.4), `corpseRefund` (1), `needCorpse` (1), `atPoint` (0) |
| `corpse_explosion` | Corpse consumer: takes the nearest corpse within `corpseSearch` of the aim point (`c.point`) and blasts `def.radius` around it (`maxTargets`); without a corpse a `livingCoef` x blast on the aim point (0 = fails unpaid). Enemies the blast kills leave corpses that go off again at `explChainMult`, `explChain` generations. | `def.damage`, `def.radius` (4.2), `def.range`; `corpseSearch` (6), `livingCoef` (0), `explChain` (0), `explChainMult` (0.5), `maxTargets` |

`raise_dead` / `corpse_explosion` are NOT used by either Death Knight kit (plate-melee §f1d: "corpses are not needed by either kit"); they exist so NC45 has consumers and the old GDD §5 caster rows (`necro_raise_skeleton`, `necro_corpse_explosion`) can come back as rows without code.

Example rows (shape only; numbers from the kit tables):

```ts
// Ölüm Darbesi (q)
{ id: 'necro_death_strike', targeting: 'target_instant', behavior: 'death_strike', range: 3.2, arc: 90, cost: 45, damage: { coef: 1.4, type: 'physical' },
  params: { window: 5, healPctOfRecent: 0.2, minHealPct: 0.07, shieldPct: 0.2, vbMult: 1.3 } }
// İlik Söken (e): 2 runes, +10 Öz, +3 Kemik Zırhı
{ id: 'necro_marrowrend', targeting: 'target_instant', behavior: 'strike_self_buff', range: 3.2, damage: { coef: 1.2, type: 'physical' },
  pip: { id: 'rune', cost: 2 }, params: { gain: 10 }, selfStatuses: [{ status: 'bone_armor', duration: 30, stacks: 3 }] }
// Kalp Darbesi (rmb): 2 x 0.5 on each of 2 targets, slow on both, 1 rune, +5 Öz
{ id: 'necro_heart_strike', targeting: 'target_instant', behavior: 'multi_cleave', range: 3.2, arc: 90, damage: { coef: 0.5, type: 'physical' },
  pip: { id: 'rune', cost: 1 }, statuses: [{ status: 'slow', duration: 8, magnitude: 0.2 }], params: { hits: 2, gap: 0.12, cleave: 1, gain: 5 } }
// Ölüm Kırbacı (rmb)
{ id: 'necro_scourge_strike', targeting: 'target_instant', behavior: 'scourge_strike', range: 25, damage: { coef: 0.55, type: 'shadow' }, tags: ['spell'],
  pip: { id: 'rune', cost: 1 }, minion: { id: 'necro_lesser_ghoul', count: 1, cap: 3, group: 'lesser', life: 8 },
  params: { gain: 10, stackMore: 0.35, splashCoef: 0.5, splashRadius: 5 } }
// Ölüm Emri (replaces the strike while `army`)
{ id: 'necro_death_order', targeting: 'target_instant', behavior: 'death_order', range: 30, damage: { coef: 0, type: 'shadow' }, pip: { id: 'rune', cost: 1 },
  replaces: { skill: 'necro_scourge_strike', whileStatus: 'army' }, params: { gain: 10, cmdCoef: 0.25, armyOnly: 1, cleaveMin: 3, cleaveMax: 5, cleaveMult: 0.5 } }
// Ölüm Sarmalı (q): 30 Öz (0 with sudden_doom = PROC_MODS), heals the pet 5 %
{ id: 'necro_death_coil', targeting: 'target_projectile', behavior: 'death_coil', range: 30, speed: 32, radius: 0.5, homing: 5, cost: 30, tags: ['spell'],
  damage: { coef: 1.6, type: 'shadow' }, params: { petHealPct: 0.05, dtMore: 0.2 } }
// Salgın (s1): 20 Öz (0 with sudden_doom), r 8 round the target
{ id: 'necro_epidemic', targeting: 'target_instant', behavior: 'spread_aoe', range: 25, radius: 8, cost: 20, tags: ['spell'], damage: { coef: 1.6, type: 'shadow' },
  statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 1.125 }], params: { maxTargets: 8, dtMore: 0.2 } }
// Karanlık Dönüşüm (m45)
{ id: 'necro_dark_transformation', targeting: 'self_buff', behavior: 'empower_minions', cooldown: 45, selfStatuses: [{ status: 'dark_transformation', duration: 15 }], params: { dmgMult: 2 } }
// Ölüler Ordusu (m90): 1 rune, hard cast 1.2 s
{ id: 'necro_army_of_the_dead', targeting: 'self_buff', behavior: 'summon_ring', castTime: 1.2, cooldown: 90, pip: { id: 'rune', cost: 1 },
  minion: { id: 'necro_army_ghoul', count: 8, life: 30, ignoreCap: true, group: 'army' }, selfStatuses: [{ status: 'army', duration: 30 }], params: { ringRadius: 4.5 } }
// Büyü Karşıtı Kalkan (s3)
{ id: 'necro_anti_magic_shell', targeting: 'self_buff', behavior: 'magic_shell', cooldown: 60, selfStatuses: [{ status: 'anti_magic_shell', duration: 8 }], params: { absorbPct: 0.3, rpPerPct: 1, rpCap: 20 } }
```

## 2. Every necromancer skill row -> behaviour

Legend: **NEW** = `behaviors_necromancer.ts`; the other behaviours already exist (file in brackets). "default" = no `behavior`, the targeting default runs.

### Class chains

| skill id | spec(s) | behaviour / targeting | params it needs |
|---|---|---|---|
| `necro_blood_basic` (+ `_1.._4`) | Kemik Muhafızı (`SpecDef.basic`) | parent `behavior 'combo'` (`SkillSystem.tryBasic`), steps default `melee_arc` | parent `steps 4`; coefs 0.45 / 0.45 / 0.55 / 1.05; `gain` Öz 3 / 3 / 3 / 4 (`resourceGainPct` multiplies chain gains); arcs 90-140 deg, range 2.8-3.4 |
| `necro_basic` (+ `_1.._4`) | Ordu Efendisi | parent `combo`; steps 1-2 default `target_projectile` (v32, R22), step 3 `melee_arc` 55 deg thrust, step 4 `melee_arc` with `params.impactRadius 2.4` (ground burst) | coefs 0.45 / 0.45 / 0.55 / 1.05 (shadow, shadow, shadow, physical); `gain` Öz 3 / 3 / 4 / 0; 12 % `sudden_doom` on step 3 = proc row |

### Kemik Muhafızı (`necromancer_bone`)

| skill id | slot | behaviour | params it needs |
|---|---|---|---|
| `necro_heart_strike` | rmb | **NEW `multi_cleave`** | §1 example; `pip rune cost 1`, `gain 5` |
| `necro_death_strike` | q | **NEW `death_strike`** | §1 example; cost 45 Öz. The sketch `fx 'T cast:necro_death_strike => st(self,blood_shield,10)'` is not needed (the behaviour applies `shield` + `blood_shield` itself); drop it, or the label status is refreshed with magnitude 0 |
| `necro_marrowrend` | e | **NEW `strike_self_buff`** | §1 example; the "< 5 charges" glow is a ProcDef / glow rule on `bone_armor` stacks |
| `necro_deaths_grip` | r | `grip` [plateKit], `targeting 'target_projectile'` | `range 30`, `cooldown 25`, `params {taunt 3, bossTaunt 2, pullTo 3}`; boss: taunt only; the taunt ICD 12 s is the StatusEffects boss rule |
| `necro_blood_boil` | s1 | `self_aoe` [behaviors.ts], no `behavior` | `radius 5`, `charges 2`, `cooldown 7.5`, `damage {coef 1.4, shadow}`, `statuses [{blood_plague 24, magnitude 1}]`, `params.maxTargets 8` (self_aoe applies the statuses on every strike, so every target gets its own dps) |
| `necro_deaths_advance` | s2 (both specs) | `self_buff` [behaviors.ts] | `cooldown 25`, `selfStatuses [{deaths_advance 6}]` (`STATUS_RULES.deaths_advance.immuneKnockback` exists) |
| `necro_anti_magic_shell` | s3 (both specs) | **NEW `magic_shell`** | §1 example; Blood `rpPerPct 1` / `rpCap 20`; Unholy "refunds Öz" with the same numbers |
| `necro_mind_freeze` | s4 (both specs) | `interrupt` [utilities.ts] | `range 15`, `cooldown 15`, `cost 0`, `params {silence 3}` (lockout 3 s on trash / elite) |
| `necro_vampiric_blood` | m45 | `self_buff` | `cooldown 45`, `selfStatuses [{vampiric_blood 10}]` (`maxHpPct 0.30`, `healReceivedPct 0.30` are in the StatusDef); Anger Management (`-1 s per 20 Öz spent`) = `specials.onSpend` (done by PM-00b); `death_strike` reads the status for its x1.3 |
| `necro_dancing_rune_weapon` | m90 | `self_buff` | `cooldown 90`, `selfStatuses [{dancing_rune_weapon 12}]` (`parryWindow +0.30` is in the def); the 50 % echo of the four rotation skills is a proc: `T cast:necro_heart_strike if=sst:dancing_rune_weapon => echo(..., 0.2, 0.5)` and likewise for blood_boil, marrowrend, death_strike (echoes run the behaviour with `c.more 0.5`: `death_strike` heals half) |
| `necro_icebound_fortitude` | m180 (both specs) | `self_buff` | `cooldown 180`, `selfStatuses [{icebound 8}]` (`damageReductionPct 0.30`, `immuneCC` in the def / rule) |

### Ordu Efendisi (`necromancer_summoner`)

| skill id | slot | behaviour | params it needs |
|---|---|---|---|
| `necro_scourge_strike` | rmb | **NEW `scourge_strike`** | §1 example |
| `necro_death_order` | rmb (replaces) | **NEW `death_order`** | §1 example; `SkillDef.replaces` holds one `whileStatus` (`army`) |
| `necro_death_coil` | q | **NEW `death_coil`** | §1 example; `sudden_doom` = PROC_MODS `{costMult 0, consume}` |
| `necro_festering_strike` | e | `target_instant` [behaviors.ts], no `behavior` | `range 3.2`, `damage {coef 0.7, physical}`, `pip rune cost 2`, `gain 15`, `statuses [{vile_contagion 20, stacks 3}]` (max 3 in the def); 12 % `sudden_doom` = proc row |
| `necro_outbreak` | r | `target_instant` [behaviors.ts], no `behavior` | `range 25`, `damage {coef 0.3, shadow}`, `pip rune cost 1`, `statuses [{virulent_plague 21, magnitude 6}]` (dps 1.8 coef over 21 s; pandemic refresh is `STATUS_RULES.virulent_plague.pandemic`) |
| `necro_epidemic` | s1 | **NEW `spread_aoe`** | §1 example |
| `necro_deaths_advance` / `necro_anti_magic_shell` / `necro_mind_freeze` / `necro_icebound_fortitude` | s2-s4, m180 | as Kemik Muhafızı | |
| `necro_dark_transformation` | m45 | **NEW `empower_minions`** | §1 example; `cooldown 45` |
| `necro_army_of_the_dead` | m90 | **NEW `summon_ring`** | §1 example (existing id kept, retuned) |

### Minions (data rows, PM-NE)

`necro_ghoul` (group `pet`, cap 1, respawn 10 s / 2 s on scene change), `necro_lesser_ghoul` (group `lesser`, cap 3, life 8), `necro_army_ghoul` (group `army`, life 30) already exist in `data/minions*.ts` (NC23). `necro_ghoul` still needs the `taunt` attack row for Kemik Muhafızı (HANDOFF). The pet is auto-summoned by the spec (`minion {pet necro_ghoul auto-summon, cap 1}` = `G.minions.summon` from the spec / scene hook, not a behaviour).

Not built (no behaviour needed): `necro_lichborne`, Death and Decay, Raise Dead as a button, Reaper's Mark / Soul Reaper.

## 3. Behaviours the rows must NOT use

* `heal_self_recent` (plateKit) for Ölüm Darbesi: it heals but does not strike and gives no blood shield. Use `death_strike`.
* `multi_strike` (plateKit) for Kalp Darbesi: its cleave hits the second target ONCE at 60 %; the kit wants both hits on both targets. Use `multi_cleave`.
* `minion_command` (minionBehaviors) for Ölüm Emri: no vile_contagion spend, no cleave, one strike per ghoul. Use `death_order`. (`minion_command` stays right for plain "attack my target" orders.)
* `minion_summon` for Ölüler Ordusu: no ring and no `army` status. Use `summon_ring`.
* `absorb_self` / `shield` statuses for Anti-Magic Shell: the generic `shield` absorb is type-blind (it would soak physical hits).

## 4. What stays in the data package (procs / fx, not behaviours)

Suggested forms; check the DSL in `docs/GDD_TALENTS.md` §2.5 / `src/combat/Procs.ts` before pasting.

| effect | where |
|---|---|
| `sudden_doom` 12 % PRD (icd 2 s) on Çürüten Darbe / Ölüm Kırbacı hit; chain step 3 12 % | `T hit:necro_scourge_strike ch=.12 icd=2 => st(self,sudden_doom,12) ;; T hit:necro_festering_strike ch=.12 icd=2 => ...` |
| `sudden_doom` makes Ölüm Sarmalı / Salgın free and is consumed | PROC_MODS on both skills `{costMult 0, consume}` + glow on q / s1 |
| `bone_armor` consumed by melee hits (icd 2.5 s) | exists (`STATUS_RULES.bone_armor.consumeOnHit`, `Combat.consumeOnHit`) |
| Anger Management (`m45` cooldown -1 s per 20 Öz) | `specials.onSpend` (PM-00b) |
| `dancing_rune_weapon` echoes | proc DSL `echo(skill, delay, 0.5)` |
| `army` window: rmb becomes Ölüm Emri | `replaces` row (§2) |
| Plague / bone-shield / vile-contagion glow rules | ProcDef glow rows (`vile_contagion < 3` on e, `virulent_plague` missing on r, `bone_armor < 5` on e) |
| pet auto-summon | spec `minion` field, `G.minions.summon(player, minionDef('necro_ghoul'))` |

## 5. Corpses (NC45) — `G.corpses`

* **Registry** (`combat/Corpses.ts`): `add(x, z, defId, rank, level, opts?)`, `onEnemyKilled(enemy)` (the death hook), `within / nearest / count (x, z, r, y?)`, `take / takeMany`, `consume(id)`, `clear`, `update(dt)`, `list`. Events `corpse:added` / `corpse:removed {reason: consumed | expired | cleared}`.
* **Fill**: `Combat.finalizeDeath` calls `G.corpses?.onEnemyKilled(enemy)` next to the loot hook, i.e. on every peer (host after the kill, clients from the `death` message), for enemies that are not rewardless (`proc_`, affix units). `rank 'boss'` leaves none (miniboss does). Nothing is networked.
* **Authority**: none. Every peer's list is its own; a consumed corpse disappears only on the consuming peer. Whatever a consumer produces is replicated by the usual channels (`hit`, `minion`). Cross-peer logic must therefore use position / radius queries, never ids. The corpse id is the dead enemy's entity id (equal on all peers for dungeon enemies; a re-death replaces the record), ties in the queries are broken by lower id.
* **Life**: `Corpses.life` = 30 s (talent `n_nc_corpse_collector` `corpseLife` adds a share, e.g. 0.5 -> 45 s), max 16 (the oldest leaves with reason `expired`), cleared on `scene:leaving`. An enemy that stands up again (Diriltici revive) takes its record with it; a sunk / removed enemy entity does not.
* **Visual**: while the local player is a necromancer each corpse shows a `soul_wisp` loop (alias of `ambient_shadow_wisps`); failures are swallowed.
* **Consumers today**: `raise_dead`, `corpse_explosion`. Neither Death Knight kit uses them.

## 6. Known gaps (not covered by NC45 / NC52)

* **Dark Transformation is pet-only damage x2, no cleave and no scale.** The engine has no per-minion damage modifier (`Minions.strike` reads `minionDamagePct` of the owner only, `MinionAI` reads no status), so `empower_minions` swaps the pet's `m.def` for a copy whose attack `coef` is a getter (x `dmgMult` while `world.time < until`). A leaked copy (pet respawn queued with the copy) is harmless once the window is over. The "cleave r 3" and "scale +15 %" of the kit need a `Minion` / `MinionAI` hook (exported helper: `empowerMinion(minion, until, mult)`).
* **Spent enemy statuses are spent on the caster's view.** `vile_contagion` (Ölüm Kırbacı, Ölüm Emri) is consumed with `consumeStack` on the local enemy copy; a client cannot remove a status on the host (no net op, same limit as the paladin Cleanse). The host broadcasts the removal when the last stack goes. Only the caster reads these stacks, so the rotation is consistent.
* **`death_order` focuses ALL minions** (`Minions.focus` is per owner) and teleports only the selected group (`armyOnly`). The merged hit is one `playerHitEnemy` per target (primary + cleave), not one per ghoul.
* **Anti-Magic Shell needs the Combat hook** (`absorbMagicShell`, one line in `hitLocalPlayer`; state lives in `combat/magicShell.ts`). It protects the local player only (not minions, not remote allies). Minion HP is hit by `Combat.hitMinion` with no shell.
* **Death Strike's blood shield** is based on the requested heal (also when the player is at full HP); `healAmount` applies the target's heal-received multipliers on top.
* **`raise_dead` / `corpse_explosion`** do not model the old GDD `corpseSlots` (army upgrade) or `corpseEssence` (+8 Öz per corpse, talent); `Corpses` exposes `take` for them.
* The Unholy basic chain "Ani Kıyamet 12 % per step 3" and the mastery numbers are data (§4), not behaviours.
