# Paladin behaviours (NC51) — what each paladin skill row must set

Written by the NC51 package for PM-PA (the data package that writes `src/data/skillsets/paladin*.ts`, `specs_kit_paladin.ts`, `procs_kit_paladin.ts`).
Kit numbers: `docs/kits/plate-melee.md` §5 (Koruma), §6 (Kutsal), §7 (Ceza) — they win over `docs/GDD_CLASSES_V2.md` §4. Code: `src/combat/skills/behaviors_paladin.ts`
(9 new behaviours, installed into `BEHAVIORS`), sim: `dev/combat-sim/nc51.mjs`.

## 0. How a row reaches a behaviour

* `SkillDef.behavior` wins over `targeting` (`behaviorFor`). Rows of the new behaviours use `targeting: 'custom'` unless noted.
* `SkillSystem.makeCtx` only picks a soft target for `melee_arc`, `dash`, `target_projectile`, `target_instant` and `requires.target` rows. The new behaviours do not need it: they read the hard target from `aim.targetId` (`castTarget`) and the ally from `aim.allyId` / the friendly selection (U, F1-F5, `resolveHealTarget`).
* `SkillSystem` applies `def.selfStatuses` itself only for `kit_*` behaviours. **The new behaviours apply `def.selfStatuses` themselves** (`sys.applySelf`); `melee_arc` / `orbit_hammers` / `provoke` / `chain_projectile` do not, so statuses such as `righteous` or `templar_combo` go through `fx` / ProcDef rows (see §4).
* Pips are paid by `SkillSystem.pay` from `def.pip` (`{ id: 'holypower', cost: 3 }` for spenders, `{ gain: n }` for builders, a pip spender keeps `cost 3` exactly). `begin()` of every new behaviour fails unpaid (`sys.fail('target' | 'range')`, no cost, no cooldown, no pips), so a spender that has no valid target never loses Holy Power.
* Remote replays (`c.remote`) are visual only. Heals to a remote ally go out on the `heal` channel (`G.combat.healPlayer`), HoTs / ally statuses on `pstatus`, statuses on enemies through `G.combat.applyEnemyStatuses` (host applies, client asks the host).

## 1. New behaviours (params are `SkillDef.params.*` unless a `def.` field is named)

| behaviour | what it does | reads |
|---|---|---|
| `heal_target` | Single-target heal. Target order: aimed ally (`aim.allyId`) > for `def.allyTarget 'any'` an enemy under the reticle (damage branch with `def.damage`, exactly Holy Shock) > smart pick (`resolveHealTarget`: friendly selection > crosshair ally > lowest HP > self). Heal = `healFormula(coef)` with `coef = def.heal.coef (+ def.pip.coefPerPip x (spent - pip.min)) x (1 + missingHpBonus x missingFrac) x (lowHpMult if HP < lowHpBelow) x c.more` plus `healPct x targetMaxHp`. Optional HoT, dispel, faith refund. `def.statuses` land on the healed ally (or on the enemy in the damage branch); `def.selfStatuses` on the caster. | `def.heal {coef flat}`, `def.damage`, `def.allyTarget`, `def.range` (default 30), `def.pip`; `smartPriority` (1 = skip full-HP allies, fail unpaid when nobody is hurt), `missingHpBonus`, `lowHpBelow` + `lowHpMult` (1.15), `healPct` (fraction of max HP, Lay on Hands), `hotCoef` + `hotDur` (status `renew`, magnitude = heal per second), `dispel` (count; the heal then only comes when something was removed; targets an ally with a dispellable debuff unless `needDebuff 0`), `healBelow` (dual rows: an ally under this HP fraction is healed instead of attacking), `selfRefund` (faith when the caster heals itself), `gain` (faith), `forbearance 1` (skip allies under `forbearance`) |
| `heal_aoe` | Light of Dawn: heals up to `maxTargets` most injured allies inside `def.radius` around the caster (a cone when `def.arc` < 360), each with its own roll; HoT `dawn_hot`. Fails unpaid when nobody in reach is hurt. | `def.heal.coef`, `def.radius` (15), `def.arc` (360), `def.pip.coefPerPip`; `maxTargets` (5), `hotPct` (fraction of each heal, over `hotDur` 4), `needInjured` (0 = always cast) |
| `heal_bolt` | Kutsal weapon chain bolt: heals the first ally it touches, damages the first enemy. The ally is the aimed ally frame, or the friendly selection when no enemy is targeted, or the first ally standing in the lane of the bolt (before the targeted enemy). Everything else flies as a normal projectile (`sys.fireProjectile`: homing, `def.statuses` e.g. `judged`, `afterHits` faith). | `def.count` + `def.spread` (step 3: 3 bolts, 8 deg), `def.range` (26), `def.speed`, `def.radius`, `def.heal.coef` (per bolt), `def.damage` (per bolt), `def.statuses` (enemy hit); `gain` = faith **per bolt** (set it to the step gain / count) |
| `avengers_shield` | Bouncing shield (own implementation of `chain_projectile`, because the kit needs per-leg rules): every leg strikes `def.damage.coef x bounceMult^k`; the **first** target is taunted; every target is silenced and a running interruptible cast is **cut** (ability locked `lock` s) = the Koruma interrupt. Statuses of `def.statuses` other than `taunt` / `silence` land on every leg. Bosses: short taunt, no silence (StatusEffects rules). | `def.damage.coef`, `def.range` (30), `def.speed` (22), `def.radius` (0.9), `def.homing`, `def.cooldown` (kick tracker); `bounces` (2), `bounceRange` (7), `bounceMult` (1), `silence` (s, 0 = none), `lock` (4), `tauntDur` (3, 0 = none), `bossTauntDur` (2), `tauntFirst` (1; 0 = every leg taunts) |
| `hammer_of_wrath` | Thrown homing hammer, only castable while the gate is open: caster has `wrath_wings` or `exec_window`, or the target is under `threshold` HP. Otherwise fails unpaid (`target`). Needed because Ceza gets it as a direct spec skill (`treeSkills s05`), not only as a `replaces` transform. | `def.damage.coef` (Koruma patch 2.8, Ceza 4.0), `def.range` (22), `def.speed`, `def.homing`; `threshold` (0.2) |
| `splash_strike` | One heavy hit on a primary target (aimed enemy in reach, else nearest in the cone) then `splashMax` neighbours around the **primary** at `splashMult` damage. Row `statuses` land on the primary only (`splashStatuses 1` = on every hit). | `def.damage.coef`, `def.range`, `def.arc` (0 = aimed enemy only), `def.statuses`; `splashRadius` (5), `splashMax` (7), `splashMult` (0.5), `splashStatuses`, `stagger` |
| `wake_of_ashes` | Cone strike (burn rider from `def.statuses`); demons and undead (`family` demon / undead_bone / undead_flesh / ghost) are stunned (bosses refuse hard CC); the paladin heals `healPct` max HP per enemy hit, at most `healMax` hits (Sacrosanct Crusade). Replaces `wake_flames` for the paladin (that one grants Adalet pips). | `def.range` (12), `def.arc` (70), `def.damage`, `def.statuses`; `stunDur` (0 = none), `healPct`, `healMax` (3), `maxTargets`, `stagger` |
| `divine_steed` | The engine dash (nav-clamped, CC-immune while it runs, `charge_trail`) without the landing slam or path damage and never homing on a target; then the row's `selfStatuses` (`divine_steed`). Roots and slows are removed by the row's `cleanses` when the cast is paid. **Use `targeting: 'dash'`** so the cost is paid before the move. | `def.range` (dash length x 0.8), `def.selfStatuses`, `def.cleanses`; `speed` (30), `pathWidth`, `trail` (buff trail seconds) |
| `ardent_defender` | Applies `def.selfStatuses` (the `ardent` status); if the status is still on the caster 0.05 s before it ends (never spent by the lethal save) the caster heals `expireHealPct` of max HP. A recast supersedes the earlier timer. The lethal-hit save itself is a `T lethal` proc (see §4). | `def.selfStatuses` (`ardent`), `expireHealPct` (0.2) |

Example rows (shape only; numbers from the kit tables):

```ts
// Kutsal Şok — heal OR damage
{ id: 'paladin_holy_shock', targeting: 'custom', behavior: 'heal_target', allyTarget: 'any', range: 25, cooldown: 6, cost: 6,
  heal: { coef: 1.43 }, damage: { coef: 2, type: 'holy' }, pip: { id: 'holypower', gain: 1 }, params: { healBelow: 0.9 } }
// Işığın Sözü (Kutsal): HoT + low-HP mastery; Koruma: params { missingHpBonus: 1, selfRefund: 5 }, no hot
{ id: 'paladin_word_of_glory', targeting: 'custom', behavior: 'heal_target', range: 30, heal: { coef: 1.4 }, pip: { id: 'holypower', cost: 3 },
  params: { hotCoef: 1.6, hotDur: 12, lowHpBelow: 0.35, lowHpMult: 1.15 } }
// Işık Oku step 3 (steps 1-2: count 1, heal 0.40, damage 1.1, gain 2)
{ id: 'paladin_holy_basic_3', targeting: 'projectile', behavior: 'heal_bolt', range: 26, speed: 45, radius: 0.4, count: 3, spread: 8,
  heal: { coef: 0.25 }, damage: { coef: 0.87, type: 'holy' }, statuses: [{ status: 'judged', duration: 10 }], params: { gain: 1.33 } }
// İntikamcı Kalkan
{ id: 'paladin_avengers_shield', targeting: 'target_projectile', behavior: 'avengers_shield', range: 30, speed: 22, radius: 0.9, homing: 9, cooldown: 15,
  damage: { coef: 2.4, type: 'holy' }, params: { bounces: 2, bounceRange: 7, silence: 3, lock: 4, tauntDur: 3, bossTauntDur: 2, threatMult: 2 } }
// Işık Çekici (replaces Kutsal Hüküm while hammer_window): primary 3.2, nearby (up to 7) 1.6
{ id: 'paladin_hammer_of_light', targeting: 'melee_arc', behavior: 'splash_strike', range: 3.4, arc: 140, damage: { coef: 3.2, type: 'holy' },
  pip: { id: 'holypower', cost: 3 }, params: { splashRadius: 6, splashMax: 7, splashMult: 0.5 } }
// İdam Hükmü (m45): ranged blast on the aimed enemy + neighbours in 10 m, DoT on the primary
{ id: 'paladin_ret_execution', targeting: 'target_instant', behavior: 'splash_strike', range: 20, arc: 0, damage: { coef: 3, type: 'holy' },
  statuses: [{ status: 'sentenced', duration: 10, magnitude: 0.9 }], selfStatuses: [{ status: 'hammer_window', duration: 12, stacks: 2 }],
  params: { splashRadius: 10, splashMax: 8, splashMult: 1 } }
```

## 2. Every paladin skill row -> behaviour

Legend: **NEW** = `behaviors_paladin.ts`; the other behaviours already exist (file in brackets). "default" = no `behavior`, the targeting default runs.

### Class chains

| skill id | spec(s) | behaviour / targeting | params it needs |
|---|---|---|---|
| `paladin_basic` (+ `_1.._4`) | Koruma, Ceza | parent `behavior 'combo'` (SkillSystem.tryBasic), steps default `melee_arc` | parent `steps 4, reset 0.85`; coefs 0.4 / 0.4 / 0.65 / 1.05 (G1); `gain` faith 3 / 3 / 4 / 6; `pip {holypower gain 1}` on steps 3 and 4; arcs / ranges / `lunge` / `stagger` per GDD §4.3 |
| `paladin_holy_basic` (+ `_1.._3`) | Kutsal (`SpecDef.basic`) | parent `combo` (steps 3, reset 0.8), steps **NEW `heal_bolt`**, `targeting 'projectile'` | see §1; `pip {holypower gain 1}` on steps 2 and 3 |

### Koruma (`paladin_protection`)

| skill id | slot | behaviour | params it needs |
|---|---|---|---|
| `paladin_blessed_hammer` | rmb | `orbit_hammers` [sharedBehaviors] on `targeting 'self_aoe'` | `hammers 3, orbitTime 0.9, orbitRadius 4.2, hammerCoef 0.6, threatMult 2.5`, `duration 6`, `charges 3`, `cooldown 6`, `statuses [{curse 3}]` (lands on every hammer hit), `pip gain 1`, faith cost 5 |
| `paladin_shield_of_righteous` | q | default `melee_arc` | `arc 120, range 3, maxTargets 5`, `pip cost 3`, coef 2.0; `righteous` 6 s + 50 % `shining_light` = proc rows (§4) |
| `paladin_judgement` | e | default `target_projectile` (or `target_instant`), `homing 6` | `statuses [{judged 10}]`, `pip gain 1`, `charges 2, cooldown 12`, `threatMult 1.5`; `replaces` row below |
| `paladin_hammer_of_wrath` | e (replaces `paladin_judgement`), Ceza r | **NEW `hammer_of_wrath`**, `targeting 'target_projectile'` | `damage.coef 2.8` (Koruma spec patch) / 4.0 (Ceza), `homing 6`, `range 22`, `pip gain 1`, `charges 2, cooldown 8`, `threshold 0.2`. `SkillDef.replaces` holds one `whileStatus`, so write two replacing rows (`whileStatus 'exec_window'` and a second id with `'wrath_wings'`) with the same behaviour |
| `paladin_avengers_shield` | r | **NEW `avengers_shield`** | see §1 (Koruma: taunt + silence; Kutsal / Ceza patch `tauntDur 0`) |
| `paladin_consecration` | s1 | default `ground_aoe` | `params.atCaster 1`, `radius 5`, `duration 12`, `ticks 12`, `damage.coef 0.1` per tick, `statuses [{slow 1.5, magnitude 0.15}]` (re-applied on every tick, so a short duration), faith cost 5. (The ally armour aura is not implemented, see §5) |
| `paladin_divine_steed` | s2 (all specs) | **NEW `divine_steed`**, `targeting 'dash'` | see §1; `range 10, cooldown 45`, `selfStatuses [{divine_steed 3}]`, `cleanses ['root','slow']` |
| `paladin_word_of_glory` | s3 | **NEW `heal_target`** | `heal.coef 2.6`, `pip cost 3` (0 with `shining_light`: PROC_MODS), `params {missingHpBonus 1, selfRefund 5}`, `range 30` |
| `paladin_reckoning` | s4 | `provoke` [behaviors.ts] | `range 25`, `params {tauntDur 3, bossTauntDur 2, threatBoost 100}`, `cooldown 8`, add `requires {target 'enemy'}` so the hard target is used (otherwise it picks inside a 60 deg cone) |
| `paladin_avenging_wrath` | m45 (Koruma), m90 (Kutsal, Ceza) | `self_buff` | `selfStatuses [{wrath_wings 20, magnitude 0.10 | 0.15}]`; Ceza also `{hammer_window 12, stacks 2}`; spec patch `cooldown 45 / 90` |
| `paladin_prot_ardent` | m90 | **NEW `ardent_defender`** | `selfStatuses [{ardent 10}]`, `params {expireHealPct 0.2}` |
| `paladin_prot_bulwark` | m180 | `self_buff` | `selfStatuses [{bulwark 8}]` (reflect: §5) |

### Kutsal (`paladin_holy`)

| skill id | slot | behaviour | params it needs |
|---|---|---|---|
| `paladin_holy_shock` | rmb | **NEW `heal_target`** | §1 example; `cooldown 6`, faith 6, `pip gain 1`, `infusion_of_light` 25 % = proc row |
| `paladin_flash_of_light` | q | **NEW `heal_target`** | `castTime 1.2`, `heal.coef 2.8`, `params {smartPriority 1}`, faith 10; Işık Aşısı = PROC_MODS (instant, free, `more 1.2`, `pipGain 1`) |
| `paladin_word_of_glory` | e | **NEW `heal_target`** | §1 example (HoT `renew`, `lowHpBelow 0.35`) |
| `paladin_cleanse` | r | **NEW `heal_target`** | `heal.coef 0.5`, `params {dispel 2}` (talent `p.dispel` already points here), `cooldown 6`, faith 4 |
| `paladin_light_of_dawn` | s1 | **NEW `heal_aoe`** | `radius 15`, `heal.coef 2.2`, `pip cost 3`, `params {maxTargets 5, hotPct 0.3, hotDur 4}` (GDD cone variant: `arc 70`) |
| `paladin_divine_steed` | s2 | **NEW `divine_steed`** | as Koruma |
| `paladin_divine_shield` | s3 | `status_self` [utilities.ts], row exists | `selfStatuses [{forbearance 90}, {invulnerable 8}]`, `cooldown 300` (spec patch), `params {cleanse 1}` |
| `paladin_rebuke` | s4 | `interrupt` [utilities.ts], row exists | `range 3.5`, `cost 0`, `cooldown 15`, `params {silence 3}`, drop the +1 `pip` (f1c) |
| `paladin_divine_toll` | m45 | `divine_toll` [plateKit.ts] | `params {pulses 5, interval 0.12, healCoef 1.43, enemyCoef 2}`, `pip gain 5`, `cooldown 45`. It rolls its own 15 % `infusion_of_light` (once per cast): do not add a second proc row |
| `paladin_avenging_wrath` | m90 | `self_buff` | `wrath_wings` magnitude 0.15 |
| `paladin_holy_aura_mastery` | m180 | `self_buff` with `radius 20` (party) | `selfStatuses [{aura_mastery 10}]`; `self_buff` applies the statuses to the party within `radius` (`applyParty`) |
| `paladin_lay_on_hands` (bench) | - | **NEW `heal_target`** | `heal.coef 0`, `params {healPct 1, forbearance 1}`, `statuses [{forbearance 90}]` (lands on the healed ally), `cooldown 120` |

### Ceza (`paladin_retribution`)

| skill id | slot | behaviour | params it needs |
|---|---|---|---|
| `paladin_crusader_strike` | rmb | default `melee_arc` | `arc 100, range 2.8, lunge`, `pip gain 1`, `cooldown 6`; `templar_combo` 4 s = proc row (§4) |
| `paladin_templar_slash` | rmb (replaces) | default `melee_arc` | `replaces {paladin_crusader_strike, templar_combo}`; consumes `templar_combo` (PROC_MODS) |
| `paladin_verdict` | q | default `melee_arc` (or `target_instant`) | `arc 140, range 3.2`, `pip cost 3`, coef 2.3; +25 % on a judged target = `route {from ['@status:judged'], window 6, more 0.25}` (the 10 % `judged` rule is `takenMoreFromSource`) |
| `paladin_hammer_of_light` | q (replaces `paladin_verdict` while `hammer_window`) | **NEW `splash_strike`** | §1 example; consumes 1 `hammer_window` stack (PROC_MODS) |
| `paladin_blade_of_justice` | e | default `target_instant` | `range 10`, `pip gain 1`, `cooldown 12`; `art_of_war` = PROC_MODS (`cdReset`, `more 1.25`) |
| `paladin_judgement` | r | as Koruma | Ceza patch `charges 1` |
| `paladin_hammer_of_wrath` | r (replaces) / spec skill s05 | **NEW `hammer_of_wrath`** | `damage.coef 4`; see Koruma |
| `paladin_divine_storm` | s1 | default `self_aoe` | `radius 5.5`, coef 2.3, `pip cost 3`; the 8-target cap is not enforced (§5); `crusade` stack per spent pip = proc row |
| `paladin_divine_steed` | s2 | **NEW `divine_steed`** | as Koruma |
| `paladin_wake_of_ashes` | s3 | **NEW `wake_of_ashes`** | `range 12, arc 70`, `damage.coef 2.2`, `statuses [{burn 9, magnitude 1}]`, `pip gain 3`, `cooldown 30`, `params {stunDur 5, healPct 0.08, healMax 3}` |
| `paladin_rebuke` | s4 | `interrupt` | as Kutsal |
| `paladin_ret_execution` | m45 | **NEW `splash_strike`** (ranged) | §1 example |
| `paladin_avenging_wrath` | m90 | `self_buff` | `wrath_wings` 0.15 + `hammer_window` x2, `cooldown 90` |
| `paladin_divine_shield` | m180 | `status_self` | `cooldown 180` |

Dropped / not built (no behaviour needed): `paladin_hammer_of_justice`, `paladin_aura` (the passive Bağlılık Aurası is the CM3 party buff), `paladin_holy_sanctuary`, `paladin_ret_crusade`.

## 3. Behaviours the rows must NOT use

* `wake_flames` (knight): gives Adalet pips. `execute`: melee cone, gate is `sudden_death` / threshold, not the wrath gate. `chain_projectile`: works for a plain shield bounce but cannot taunt only the first target or cut a cast; `paladin_avengers_shield` therefore uses `avengers_shield`.

## 4. What stays in the data package (procs / fx, not behaviours)

Suggested forms; check the exact DSL in `docs/GDD_TALENTS.md` §2.5 / `src/combat/Procs.ts` before pasting.

| effect | where |
|---|---|
| `righteous` 6 s on Doğruluk Kalkanı cast | `T cast:paladin_shield_of_righteous => st(self,righteous,6)` |
| `shining_light` 50 % PRD per Doğruluk Kalkanı | ProcDef PRD row; PROC_MODS on `paladin_word_of_glory` `{costMult 0, pipCost 0, consume}` |
| `templar_combo` 4 s after Haçlı Darbesi | `T cast:paladin_crusader_strike => st(self,templar_combo,4)` |
| `infusion_of_light` 25 % (icd 3) on Kutsal Şok | `T cast:paladin_holy_shock ch=.25 icd=3 => st(self,infusion_of_light,15)` (the chain step 3 15 % likewise) |
| `art_of_war` 12 % per chain hit | ProcDef / `T hit:@basic ch=.12 icd=2 => st(self,art_of_war,12)` |
| `crusade` stack per Holy Power spent under `wrath_wings` | `T spend:holypower if=sst:wrath_wings => st(self,crusade,20)` |
| Kutsal Hüküm 15 % resets Yargı | `T cast:paladin_verdict ch=.15 => rst(paladin_judgement)` |
| Ardent Defender lethal save (leave 25 % HP, end the status) | `T lethal if=sst:ardent => heal(.25) ...` then remove `ardent`; the 20 % expiry heal is the `ardent_defender` behaviour |
| `hammer_window` stack consumption, `templar_combo` consumption, `art_of_war` cd reset | `PROC_MODS_KIT_PALADIN` rows |
| `exec_window` | hidden watcher status (`data/watchers.ts`, exists) |
| Koruma block -> +4 faith, `blockHolyPower` | spec special / trait (`trait_devotion`) |

## 5. Known gaps (not covered by NC51)

* **Cleanse on a remote ally:** the heal is sent, but there is no net channel that removes a status on the owner's machine (`pstatus` only applies). `dispelUpTo` clears the local replica only (same as the rogue Panzehir). Needs a net-owner op.
* **Main stat for heals:** `healing.ts` `MAIN_STAT` has no `paladin` entry (falls back to `str`); Kutsal wants `int` (`SpecDef.mainStat` is read by `Combat.rollOutgoing` only). One-line fix in `healing.ts` (not touched here).
* **`wrath_wings` healing:** the status def carries `critChance` and `dealtMore` only; the "+15 % healing" of Kutsal needs `healingPct` in its stats (perMag) in `statuses_kit_plate.ts`.
* **`bulwark` reflect 20 %** and the **Consecration ally armour aura** have no engine support (`groundAoe` only special-cases the `knight_consecration` id); `self_aoe` has no `maxTargets` (İlahi Fırtına cap 8).
* **Overheal ward** (`overheal_ward` absorb) is not wired by any heal behaviour (the plate-melee budget does not use it).
* `divine_toll` (plateKit) picks targets and rolls `infusion_of_light` itself; `orbit_hammers` ignores `def.damage.coef` (uses `hammerCoef`).
