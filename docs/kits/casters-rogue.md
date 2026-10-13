# EFSUN ONLINE — Kit design: Büyücü, Haydut, Warlock (CM12, group 2: casters and rogue)

> Combat/class designer pass, 2026-10-13. Docs only: no code was changed.
> Specs covered: `mage_arcane`, `mage_fire`, `mage_frost`, `rogue_assassin`, `rogue_subtlety` (**new spec id**), `rogue_alchemist`, `warlock_affliction`, `warlock_destruction`.
> Research source: `docs/ref/wow/casters-rogue.md` (WoW Midnight 12.1, Season 2). Rules: `docs/CORE_MECHANICS.md` (§2, §3, §4, §5, §10) and `docs/COMBAT_WOW.md` (engine layer: GCD profiles, spell queue, procs and Spell Activation Overlay, pushback, lockout, combat text). Where `COMBAT_WOW.md` §3 / Appendix B describe the old mage / rogue kits they are **superseded by this file**; the proc *engine* carries over.
> Precedence for this file: ARCHITECTURE > CORE_MECHANICS > this file > COMBAT_WOW per-class rows > GDD_*.
> User notes honoured: **Arkan Füzeler** = homing missiles that lock onto the target, with a full effect stack (section 2e). **Gölge Adımı** teleports behind the target and **Sırttan Bıçak** is positional (section 7e). Rotations follow Midnight Season 2 (Method 12.1 priorities).

---

## Part A — Conventions used by every spec

### A.1 Units, naming, columns
* **Ids.** An existing id is reused when an old skill maps onto the WoW ability (rename + retune); otherwise a new id `<class>_<name>`. Dropped skills stay *defined* but get `unlockLevel: 99`, no default slot and no tree grant (CORE_MECHANICS §10.1).
* **Turkish names** keep the WoW flavour. TR names in tables are final UI strings.
* **Cast times** = WoW × 0.8 (`1.75 s → 1.4 s`). **Cooldowns** = WoW, except majors, which are bucketed to 45 s / 90 s / 3 min (the table says "WoW 60 s → 45").
* **GCD** (`'arpg'` profile, COMBAT_WOW §2.1): 1.0 s base, floor 0.5 s; Haydut GCD is fixed at 1.0 s (no haste scaling). **Off-GCD**: LMB chain, mobility, defensives, interrupts, majors, Ateş Patlaması (Fire Blast), Gölge Dansı, Gölge Adımı. A hard cast longer than the GCD simply runs concurrently with it.
* **Targeting abbreviations used in the tables**
  * `t_proj(n)` = `target_projectile`, homing at `n` rad/s (CM §10.2). No target: flies straight along the aim, never blocks the cast.
  * `t_inst` = `target_instant`: hits the target if in range and in line of sight. Melee ones (range ≤ 5 m) auto-lunge up to 3 m extra, else "Menzil dışında".
  * `proj`, `ground`, `self_aoe`, `self_buff`, `tele`, `beam`, `custom:<behaviour>` = the existing `SkillTargeting` values.
* **Clip names** are KayKit clips from `docs/assets/characters.md` §1.3 (verified): `Spellcast_Shoot`, `Spellcast_Raise`, `Spellcast_Long`, `Spellcasting` (loop), `Spellcast_Summon`, `Use_Item`, `Throw`, `Cheer`, `Dodge_Forward`, `1H_Melee_Attack_Stab`, `Dualwield_Melee_Attack_Slice|Chop|Stab`, `Unarmed_Melee_Attack_Kick`, `Dodge_Backward`. `Spellcast_Summon` is a skeleton-rig clip that plays on every KayKit rig (`characters.md` line 14) and is already used by `data/skills.ts`. No other clip name is used.
* **VFX column**: an existing `VfxId` (with `scale` / `color` options) or **NEW:`id`** with a one-line look. Nine new presets in total (section g). **SFX column**: existing `SfxId`, the CW-01 ids (`arcane_cast`, `arcane_impact`, `proc_gain`, `proc_use`, `cd_ready`…) or **NEW:`id`** (four in total).
* **Resource units.** Mana pool = 100 + 0.25 × Zeka (mage) / warlock 100, regen = class regen + 0.015 × Zeka (`manaScaling`). Energy pool 100, regen 12/s (×1.17 for the rogue specs, ×1.33 Simyacı). Shards: `pip shard`, max 5, stored as **fragments** (10 per shard, `PipDef.scale = 10`, section g).

### A.2 Budget method (so SimBench can reproduce the hand calculation)
* **Coefficient** = the `damage.coef` / `heal.coef` of `Combat.rollOutgoing` (`W × coef`; spells add `spellPower` to `W`). All rows below are *pre-crit* coefficients; a row with "always crits" carries a x1.42 multiplier (1.5 / the 1.055 average crit factor at 11 % crit). "At 0 haste / 0 crit" = no rating contribution (base crit 5 % + spec bonus, mid-gear main stat).
* **60 s window.** The LMB chain is the filler between GCD abilities: the reference rotation spends **6.0 s** per minute in the chain at a nominal **3.3 coef/s** (GDD_LIFE chain targets 3.0–3.6) = **19.8 coef = ~20 % of 100**. The remaining ~54 s of the minute must be filled by GCD abilities and casts; every spec table prints "GCD s used / 54", which has to stay ≤ 54. A spec that would idle is a design error (idle time would be filled by the LMB chain and break the 20 % share).
* **Majors** are amortised (`casts/60 s = 60 / CD`: a 90 s major counts x0.67, a 45 s major x1.33). Buff windows (Combustion, Shadow Blades, Haunt amp…) are counted as "window value" = bonus coefficient the window adds to the rest of the rotation.
* **AoE8** = 8 targets, one 30 s pull, total across all targets, target **225 ±25** (= 4.5 × the 30 s single-target total of 50). LMB in AoE = 3 s x 3.3 x 1.5 finisher splash.
* **Healer (Simyacı)** = 100 ±5 healing units per 60 s on a 5-man stream (after assumed overheal, "effective share" column) and 35 *effective* damage per 60 s (the kit coefficients are pre-modifier; the spec's `damagePct −0.40` multiplies them by 0.6).
* Every number is a tuning start for SimBench (CM §5); the auto-tuner multiplies per spec afterwards.

### A.3 APL condition DSL (consumed by CM5 `src/data/rotations.ts`)
One line per entry, **top to bottom = priority**: the first line whose skill is castable (cost, cooldown, GCD slot) and whose condition holds is cast; off-GCD lines (marked `# off-GCD`) are re-evaluated every time the sim is free, before the GCD lines.
```
line  := skill_id [ "if" cond ( "&&" cond )* ]
cond  := status:<id> | !status:<id> | stacks:<id> OP N | remaining:<id> < S          # caster statuses
       | target.status:<id> | !target.status:<id> | target.stacks:<id> OP N | target.remaining:<id> < S
       | target.hp% OP N | targets >= N                                              # enemies within 10 m of the target
       | res OP N | res% OP N | pips:<pip> OP N                                      # resource, resource %, pips (shard = fragments/10)
       | charges OP N | charges(<skill>) OP N | cd(<skill>) OP S | cd_ready(<skill>)  # own / other skill
       | prev:<skill> | moving | behind | stealthed | opener | dot_refresh:<status>  # dot_refresh = target DoT below 30 % duration
       | ally.low% OP N | allies.injured OP N | allies.linked OP N | allies.debuffed OP N   # healers only; injured = below 90 % HP
OP    := >= | <= | > | < | ==
line suffix  @each   evaluate the line once per enemy (nearest first) with `target.*` bound to that enemy (DoT spreading in AoE)
```
The last line of every APL is the LMB filler (`mage_basic`, `rogue_basic`, `warlock_basic`, `rogue_vial_throw`) with no condition ("weave when nothing else is castable").

### A.4 Shared mechanics introduced by this file (details in section g)
* **`aoe_mode`** (hidden self status): applied while ≥ 3 enemies are within 10 m of the current target, refreshed by a watcher every 0.25 s. Used by `replaces` so one button swaps in the AoE version (`Dengesiz Azap → Yozlaşma Tohumu`, `Yırtma → Kızıl Fırtına`, `İnfaz → Kara Barut`). This is how WoW's "Seed instead of UA / Crimson Tempest instead of Rupture" rules fit the fixed 12-slot bar.
* **`exec_window`** (hidden self status): target HP < 20 %; `Kaos Oku → Gölge Yakma` swaps while it (or `fiendish_cruelty`) is up.
* **Behind** = angle between the target's facing and (attacker − target) **> 110°** (CM §10.2; `Combat.isBehind` currently uses cos ≤ −0.6428 ≈ 130°, see open questions). Enemies face their threat target.
* **Spell queue / lead skip / PRD** are COMBAT_WOW engine behaviour; all procs below use PRD (`prd.ts`) with the listed `ch` as the nominal rate.
* **Hero talents are not modelled.** Where Midnight's rotation depends on a hero talent (Malevolence, Wither, Spellslinger Salvo caps) the baseline kit carries the effect as a spec ability and the table says so.

---

## 0. Summary table

| Spec id | TR | Role | WoW model | Resource | Signature mechanic |
|---|---|---|---|---|---|
| `mage_arcane` | Gizem Ustası | DPS | Arcane Mage | Mana + Gizem Yükü (0–4) + Gizem Mermisi (Salvo 0–20) | **Arkan Füzeler**: 5 homing missiles; Berrak Zihin makes them free; Salvo is dumped by Arkan Baraj; Dalgalanma burns all mana |
| `mage_fire` | Ateş Büyücüsü | DPS | Fire Mage | Mana + Isınıyor / Sıcak Seri | Crit → Isınıyor → Ateş Patlaması converts → instant Piroblast; Yanış window; Meteor |
| `mage_frost` | Buz Büyücüsü | DPS | Frost Mage | Mana + Buz Sarkıtları (0–5) + Donma (enemy stacks) | Freezing stacks and Buz Parmağı → **Buz Mızrağı shatters** (x3); Buz Sarkıtı at 5; Ayaz Işını → Kuyruklu Yıldız |
| `rogue_assassin` | Suikastçı | DPS | Assassination Rogue | Enerji + Kombo (0–5) | Bleeds (Gırtlak Kesme, Yırtma) + poison stacks; Kral Belası + Ölüm İşareti + Kaybol window |
| `rogue_subtlety` | Gölge | DPS | Subtlety Rogue | Enerji + Kombo (0–6) | **Gölge Adımı / Gölge Vuruşu snap behind the target**; positional Sırttan Bıçak; Gölge Dansı windows with Gizli Teknik clones |
| `rogue_alchemist` | Simyacı | Healer | custom: Discipline Priest (Atonement) + potions | Enerji + Karışım Puanı | **Simya Bağı**: damage heals linked allies (46 % transfer); shield-potion → link → damage ramps |
| `warlock_affliction` | Azap | DPS | Affliction Warlock | Mana + Ruh Parçası (fragments) | Agony / Corruption / Dengesiz Azap DoTs, Musallat (+16 %), Karanlık Göz window; Tohum in AoE |
| `warlock_destruction` | Yıkım | DPS | Destruction Warlock | Mana + Ruh Parçası (fragments) | Fragments → **Kaos Oku** (always crits); Alevlendirme + Dönüş Alevi; Ateş Yağmuru; Cehennem Muhafızı |

Party buffs (CORE_MECHANICS §3): all three mage specs bring **Gizem Zekası** (party +5 % spell damage, +5 % max mana) and the Heroism-family major **Zaman Bükülmesi** (m180). All rogue specs bring **Zayıflatıcı Zehir** (enemies take +3 % damage from all sources, 30 s, applied on hit by the poison / finisher / vial hits listed per spec). Both warlock specs bring **Ruh Taşı + Sağlık Taşı** (battle res + party healthstones, no bar slot: CM3 owns the button).

---

## Part B — Specs

### 1. Büyücü (mage): rows shared by all three specs

| slot | id | TR | rule |
|---|---|---|---|
| lmb | `mage_basic` (+`_1.._3`) | Gizem Oku / Ateş Oku / Buz Oku | 3-step chain, rows unchanged except `targeting: target_projectile` (homing 5 rad/s); Ateş / Buz variants come from the spec `mods` (`cv=fire:1` / `cv=frost:1`, patch `name`). +2 mana per hit (step 3: +2 per extra target, max 6). Nominal 3.3–3.5 coef/s (existing rows). |
| s2 | `mage_blink` | Işınlanma | WoW **Shimmer** (Blink was removed in Midnight): range 10 → **20 m**, CD 5 → **30 s, 1 charge**, cost 10 → 0, off-GCD, iframes 0.15 s, arcane departure burst 0.6 coef r 2.5 (the burst keeps the talent text of `class:mage#s02A`). Does not clear roots (WoW). |
| s4 | `mage_counterspell` | Büyü Kırma | WoW Counterspell: baseline on the bar (the class `s05` node no longer grants it), range 30 → **40 m**, CD 20 → **25 s**, cost 10 → 0, off-GCD. Existing `interrupt` behaviour: cut + `silence` 3 s on trash/elite, the cast school is locked 4 s, bosses lose the cast only (WoW 7 s school lock). |
| m180 | `mage_time_warp` | Zaman Bükülmesi | Heroism family (CM §3). Behaviour `major_hero`: range 40, `hero_haste` 40 s (+30 % haste, +10 % move), CD 180, `sated` (Yorgun) **600 s** (CM §3; legacy rows use 150, only this skill is retuned here), off-GCD, `params.major = 180`. |
| s3 | one barrier per spec | Prizmatik / Alev / Buz Bariyeri | WoW Prismatic / Blazing / Ice Barrier, 30 s CD, off-GCD. All three carry the tag `shield` so class-tree nodes can use `@shield`. `mage_mana_barrier` (old "Büyü Kalkanı") is **dropped**. |
| passive | `trait_*` | – | Spec traits keep their ids (`trait_pyromancer`, `trait_cryomancer`, `trait_arcanist`) and are rewritten to the numbers in the spec sections. Party buff **Gizem Zekası** (+5 % spell damage, +5 % max mana) is carried by every mage (CM3). |

Mage resource economy (all three specs): pool 100 + 0.25 × Zeka (~163 at Zeka 253), regen 5 + 0.015 × Zeka ≈ 8.8/s (Gizem +30 % ≈ 11.4/s). Costs below are tuned so Ateş / Buz spend ~45–60 % of regen (mana is a soft limiter, like WoW) and Gizem spends ~60 % plus Dalgalanma.

---

### 2. `mage_arcane` — Gizem Ustası (Arcane Mage)

**SpecDef wiring.** `stats { arcaneDamagePct 0.20, resourceRegenPct 0.30, castSpeed 0.05, maxResource 20 }` (unchanged). Trait `trait_arcanist` retuned: `chargeMax 4, chargeDmg 0.12` (arcane spells +12 %/charge), `chargeCost 0.25` now **only** for `mage_arcane_blast` / `mage_prismatic_bolt` (new tag `charge_cost`), `manaFloor 0.4, manaSlope 0.003` (mana above 40 % adds 0.3 % arcane damage per point, max +18 %), `chargeDecay 5 / chargeDecayDelay 8`. `skills` and unlock levels: `mage_arcane_blast` 1, `mage_arcane_missiles` 3, `mage_arcane_barrage` 6, `mage_arcane_orb` 10, `mage_arcane_pulse` 12, `mage_prismatic_barrier` 15; `treeSkills { mage_prismatic_bolt: 's05' }`; majors `{ m45 mage_touch_of_magi, m90 mage_arcane_surge, m180 mage_time_warp }`; `mage_counterspell` 10, `mage_blink` 6. Pip: `arcane` (existing `TALENT_PIPS.arcane`). New status stacks: `arcane_salvo` (max 20).

#### 2a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `mage_basic` | Gizem Oku | auto-attack analogue | instant, 3-step chain | t_proj(5) | 25 | – | +2 mana/hit | off | arcane 0.95 / 0.95 / 3 x 0.65 | – | 10 % PRD `clearcasting` per hit (icd 4 s) | arcane_projectile, arcane_burst | Spellcast_Shoot x1.3 | arcane_cast, arcane_impact |
| rmb | `mage_arcane_blast` | Arkan Patlama | Arcane Blast | cast 1.8 s (WoW 2.25) | t_proj(5) | 30 | – | 9 mana x (1 + 0.25 x charges); **+1 Gizem Yükü** | on | arcane 1.20, +12 %/charge | – | PRD 10 % `clearcasting` (icd 3 s); replaced by Prizma Oku while `prismatic_ready` | arcane_projectile x1.3, cast_hands_arcane | Spellcast_Shoot x1.1 (hold) | arcane_cast, arcane_impact |
| q | `mage_arcane_missiles` | Arkan Füzeler | Arcane Missiles | **channel 2.0 s** (WoW 2.5), 5 waves | t_proj(9) with 3D curve (E1) | 30 | – | 10 mana, **0 with Berrak Zihin**; **+1 Salvo per wave** | on | arcane 5 x 0.60 = 3.0 with Berrak Zihin; hardcast x0.60 = 1.8 | consumes `clearcasting`; adds `arcane_salvo` | glow **q** on `clearcasting` (centre, violet) | NEW:`arcane_missile` (core + rim + ribbon), NEW:`arcane_missile_hit`, cast_hands_arcane, mark_loop lock-on sigil | Spellcasting (loop, hands up) | NEW:`arcane_missile_launch`, NEW:`arcane_missile_hit` |
| e | `mage_arcane_barrage` | Arkan Baraj | Arcane Barrage | instant | t_inst | 30 | – | 6 mana, 0 with Berrak Zihin; spends **all Salvo and all charges**; refunds 2 mana per charge | on | arcane 1.7 + 0.17 per Salvo (4.42 at 16, 5.1 at 20), +12 %/charge; 80 % splash r 6 (max 7 others) | consumes `arcane_salvo`, pip `arcane`, `clearcasting`; Salvo >= 10 grants `prismatic_ready` (needs s05) | glow **e** at Salvo >= 20 (rule `salvo_full`) or on `clearcasting` | arcane_burst x1.2, shockwave x0.8 (colour 0xb78cff), arcane_charge_orb fly-out | Spellcast_Shoot x1.5 | arcane_cast, arcane_impact |
| r | `mage_arcane_orb` | Gizemli Küre | Arcane Orb | instant | proj (pierce all, 8 m/s) | 20 | CD 20 | 12 mana; **+1 charge on cast, +1 on first hit** | on | arcane 6 pulses x 0.38 = 2.3 per target, r 2.5 | – | – | arcane_projectile x2.0, arcane_burst per pulse x0.5 | Spellcast_Shoot x1.0 | spell_cast, arcane_impact |
| s1 | `mage_arcane_pulse` | Arkan Nabzı | Arcane Pulse (12.1) | cast 1.6 s (WoW 2.0) | self_aoe r 8 | – | CD 15 | 14 mana; **+1 charge per enemy struck (max +4)** | on | arcane 3.6 per target at 8 targets (`crowd`: x(0.4 + 0.6 n/8)) | – | – | shockwave x1.6 (0xb78cff), arcane_burst | Spellcast_Raise x1.3 | arcane_cast, explosion x0.3 |
| s2 | `mage_blink` | Işınlanma | Shimmer | instant | tele | 20 | CD 30 | 0 | off | arcane 0.6 (departure burst) | iframes 0.15 | – | blink | Dodge_Forward x1.6 | blink |
| s3 | `mage_prismatic_barrier` | Prizmatik Bariyer | Prismatic Barrier | instant | self_buff | – | CD 30 | 0 | off | absorb 25 % max HP + 2 x W; −15 % magic damage taken while it holds | `shield`, `prismatic_barrier` (30 s) | – | shield_bubble (0xd0a0ff) | Spellcast_Raise x1.8 | buff |
| s4 | `mage_counterspell` | Büyü Kırma | Counterspell | instant | t_inst | 40 | CD 25 | 0 | off | – | interrupt, `silence` 3 s | – | interrupt_burst | Spellcast_Shoot x1.5 | interrupt |
| m45 | `mage_touch_of_magi` | Büyücü Dokunuşu | Touch of the Magi | instant | t_inst | 30 | CD 45 | 5 % max mana; **+4 charges; guaranteed Berrak Zihin** | off | arcane 0.5; stores 20 % of the damage you deal to it for 12 s, then detonates (r 4) | `touch_of_magi` (12 s) | – | mark_loop (0xb78cff), arcane_burst x1.6 on detonation | Spellcast_Shoot x1.8 | spell_cast, arcane_impact |
| m90 | `mage_arcane_surge` | Gizem Dalgalanması | Arcane Surge | cast 2.0 s (WoW 2.5) | self_aoe r 8 | – | CD 90 | **spends all mana**; guaranteed Berrak Zihin | off (may precast) | arcane 4.0 + 6.0 x mana%, target and <= 8 m with falloff | `arcane_surge` 15 s: +35 % spell damage, mana regen x5.25 | – | enrage_aura (0xc9a0ff), charge_ring | Spellcast_Raise x1.0 | arcane_cast, choir_swell x0.4 |
| m180 | `mage_time_warp` | Zaman Bükülmesi | Time Warp | instant | self_buff (party r 40) | 40 | CD 180 | 0 | off | – | `hero_haste` 40 s, `sated` 600 s | – | hero_wave, buff_aura | Spellcast_Raise x1.2 | time_warp |
| replaces rmb | `mage_prismatic_bolt` | Prizma Oku | Prismatic Bolt (apex, 12.1) | cast 1.6 s | t_proj(6) | 30 | granted by `prismatic_ready` (12 s) | 0 mana; **+2 charges** | on | arcane 3.6 (highest single hit) | consumes `prismatic_ready` | glow **rmb** (top, `#ff8fee`) | NEW:`prismatic_bolt` (multi-colour core, rainbow ribbon) | Spellcast_Shoot x0.9 (hold) | arcane_cast pitch 1.2, arcane_impact |

#### 2b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `clearcasting` | Berrak Zihin | PRD 10 % on Arkan Patlama / Baraj / Küre hit and 10 % per LMB hit (icd 3–4 s); **guaranteed** by Büyücü Dokunuşu and Gizem Dalgalanması | next Arkan Füzeler **or** Arkan Baraj costs 0; Füzeler at full damage (hardcast x0.60) | 15 s, 1 charge (2 from Touch/Surge) | q, e | centre, violet halo |
| `arcane_salvo` | Gizem Mermisi | +1 per Arkan Füzeler wave that lands | Baraj +0.17 coef per stack; cap 20; shown as a counter beside the pips | 15 s since the last gain | e (soft at 12, strong at 20) | – |
| pip `arcane` | Gizem Yükü | Patlama +1, Küre +1 +1, Nabız +1 per enemy, Dokunuş +4, Prizma Oku +2 | +12 % arcane damage each; Patlama/Prizma mana x(1 + 0.25 n); all spent by Baraj | −1 per 5 s after 8 s out of combat | e at 4 | – (orbiting `arcane_charge_orb` per charge) |
| `prismatic_ready` | Prizma Hazır | Baraj cast with Salvo >= 10 (needs s05) | next Arkan Patlama becomes Prizma Oku | 12 s | rmb | top, multi-colour |
| `touch_of_magi` | Büyücü Dokunuşu | Touch cast | target debuff, stores 20 % of your damage, detonates | 12 s | – | target-frame icon |
| `arcane_surge` | Gizem Dalgalanması | Surge cast | +35 % spell damage, regen x5.25 | 15 s | – | burst banner with m90/m45 |

#### 2c. APL

ST:
```
mage_touch_of_magi if cd_ready(mage_touch_of_magi)                                   # off-GCD, never delayed
mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40 && res% >= 60   # off-GCD, right after Touch ("big burn")
mage_arcane_barrage if stacks:arcane_salvo >= 20 || (status:clearcasting && stacks:arcane_salvo >= 12)
mage_arcane_barrage if status:arcane_surge && stacks:arcane_salvo >= 10
mage_prismatic_bolt if status:prismatic_ready
mage_arcane_missiles if status:clearcasting && stacks:arcane_salvo < 16
mage_arcane_orb if cd_ready(mage_arcane_orb) && pips:arcane <= 2
mage_arcane_missiles if stacks:arcane_salvo < 12 && res% >= 40                       # weak hardcast
mage_arcane_blast
mage_basic
```
AoE (>= 3 targets):
```
mage_touch_of_magi if cd_ready(mage_touch_of_magi)
mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40
mage_arcane_orb if cd_ready(mage_arcane_orb)
mage_arcane_pulse if cd_ready(mage_arcane_pulse) && targets >= 3
mage_arcane_barrage if stacks:arcane_salvo >= 15 || (pips:arcane >= 4 && stacks:arcane_salvo >= 10)
mage_prismatic_bolt if status:prismatic_ready
mage_arcane_missiles if status:clearcasting || stacks:arcane_salvo < 10
mage_arcane_blast
mage_basic
```

#### 2d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Arkan Patlama | 14.00 | 1.20 | x1.26 | 21.2 | x1.26 = avg 2.2 charges |
| Arkan Füzeler, Berrak Zihin (full damage) | 4.00 | 3.00 | x1.00 | 12.0 | 5 waves x 0.60 |
| Arkan Füzeler, hardcast (weak) | 4.00 | 1.80 | x1.00 | 7.2 | x0.60 |
| Arkan Baraj | 2.50 | 4.42 | x1.40 | 15.5 | 1.7 + 0.17 x ~16 Salvo (cap 20); x1.4 = 4 charges |
| Gizemli Küre | 3.00 | 2.30 | x1.00 | 6.9 | 6 pulses x 0.38 |
| Büyücü Dokunuşu | 1.33 | 4.10 | x1.00 | 5.5 | 0.5 hit + 20 % of ~18 coef stored in 12 s |
| Gizem Dalgalanması | 0.67 | 7.00 | x1.00 | 4.7 | 4.0 + 6.0 x mana% burst + window value, amortised |
| Prizma Oku (replaces Patlama) | 2.00 | 3.60 | x1.00 | 7.2 | after a Barrage with >= 10 Salvo |
| **TOTAL (ST)** | | | | **99.9** | target 100 ±5; GCD time 51.2 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Arkan Nabzı | 2.00 | 8 | 3.60 | x1.00 | 57.6 | 15 s CD, all 8 hit |
| Gizemli Küre | 1.50 | 7 | 2.30 | x1.00 | 24.1 | rolls through ~7 |
| Arkan Baraj, main target | 1.50 | 1 | 4.76 | x1.40 | 10.0 | ~18 Salvo |
| Arkan Baraj, splash 80 % x 7 | 1.50 | 7 | 3.81 | x1.40 | 56.0 | r 6 m |
| Arkan Füzeler (waves spread) | 5.00 | 1 | 2.50 | x1.00 | 12.5 | same total, 5 different targets; builds the Salvo |
| Arkan Patlama | 4.00 | 1 | 1.20 | x1.26 | 6.0 |  |
| Dalgalanma + Dokunuş (buff window and stored damage) | 1.00 | 1 | 24.00 | x1.00 | 24.0 | +35 % on ~120 coef, /3 amort + bursts |
| **TOTAL (AoE8, 30 s)** | | | | | **205.1** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Mana (60 s, ST): Blast 14 x (9 x ~1.55) = 195, Füzeler hardcast 4 x 10 = 40, Baraj 2.5 x 6 = 15 (free on Berrak Zihin), Küre 3 x 12 = 36, Prizma Oku 0, Touch 1.33 x 8 = 11, Surge dumps ~110 x 0.67 = 73: **~370 spent vs ~690 regen + ~30 LMB gain**, the surplus is the mana-floor damage bonus (mana stays above 40 % ~85 % of the time) and Surge refills it. **Party buff:** Gizem Zekası.

#### 2e. What it feels like, and the signature move

* **Lock-on, then a salvo.** Press `Q`, the hands flare, a violet sigil locks onto the target and five missiles peel out of alternating hands, curve away, and bend back onto the chest of the live target. Free (Berrak Zihin) missiles are white-hot, weak hardcast ones are violet: the player reads "free" at a glance.
* **Dump moment.** At 20 Salvo the Arkan Baraj icon gets ants, the four orbiting `arcane_charge_orb`s fly out with the shot, 0.18 trauma, a violet shockwave and a "+mana" refund number.
* **Big burn.** Touch then Surge: the mana bar drains to zero, then refills at x5.25 with a visible surge; burst banner "PATLAMA!" with the 90 s major; Berrak Zihin stacks twice, so two white-hot Füzeler salvos fire back to back.
* **Mana floor.** Mana above 40 % glows on the bar edge; players hold Barrage/Missiles to stay above it between bursts.

**Signature: Arkan Füzeler (Arcane Missiles), exact behaviour**

```
press        queue window 0.4 s (spell queue). target = hard target else soft target (60 deg cone). No target: straight along the aim, no homing.
t = 0.00     animation starts the same frame: Spellcasting loop, hands raised. cast_hands_arcane glow on both hand bones (0.15 s). Lock-on sigil
             (mark_loop, 0xb78cff, scale 0.6) follows the target for the whole channel. FOV -1.5 deg. SFX arcane_cast. Walking allowed at 50 % speed.
t = 0.10     wave 1 spawns (press -> effect <= 0.14 s lead budget). Then every 0.40 s / (1 + haste): waves at 0.10, 0.50, 0.90, 1.30, 1.70 s.
             Channel ends at 2.0 s / (1 + haste); the last missile may still be in flight and always lands.
spawn        hand bone alternates: handslot.l (waves 1, 3, 5), handslot.r (waves 2, 4). The missile first bursts outward: aim axis rotated +-35 deg
             (side of its hand) and +25 deg pitch for 0.12 s, then the curve takes over.
path         quadratic Bezier P0 = hand, P2 = target chest (0.55 x height), P1 = midpoint + lateral x L + up x U,
             L = random(-1.6, 1.6) m x clamp(dist/10, 0.4, 1.4), U = random(0.4, 1.2) m. P2 is the LIVE target position every frame; u advances by
             22 m/s / curve length (re-estimated each frame). The lateral term decays to 0 over the last 25 % of u, so a live target is always hit.
walls        NavGrid.raycast on each sampled segment; a missile that hits a wall pops with arcane_missile_hit (no damage).
target dies  waves not yet spawned and missiles in flight retarget the nearest living enemy within 12 m of the dead target; none: straight on the aim.
AoE          >= 3 enemies within 10 m of the target: wave i picks the i-th nearest enemy (cycle) so the five missiles fan out to different enemies.
             Total coefficient unchanged (only the spread differs), so AoE value comes from Salvo and splash on Baraj, not from the channel.
visual       core: additive violet sprite 0.35 m (0xb78cff); white rim 0.5 m alpha 0.5; ribbon trail 0.4 s, width 0.18 -> 0, 12 samples, additive;
             4 sparks at the spawn point. Berrak Zihin variant: white core, scale x1.25.
impact       arcane_missile_hit: violet nova r 0.8 (0.18 s), 6 sparks, school flash 70 ms, hit_magic layer. Hit-stop 30 ms per missile (victim only,
             never the attacker), trauma 0.02 per hit and 0.10 on the LAST missile only. Numbers of one channel merge into <= 2 live numbers
             (COMBAT_WOW 2.11, 0.45 s merge); the last wave adds crit_ring if any missile crit.
sfx          arcane_missile_launch per wave, pitch +4 % per wave (1.00 .. 1.16); arcane_missile_hit per impact, pitch +6 % per wave (rising arpeggio);
             arcane_impact + hit_crit layers only on a crit. Salvo gain: soft ui_tab-style tick per stack.
interrupts   dodge roll cancels the channel (missiles in flight still land); pushback cuts 25 % of the channel twice (unspawned waves are lost);
             a school lockout stops the cast. Pushback does not touch missiles already flying.
```

---

### 3. `mage_fire` — Ateş Büyücüsü (Fire Mage)

**SpecDef wiring.** `stats` unchanged (`fireDamagePct 0.20, critChance 0.06, castSpeed 0.05, burnChance 0.25`; `burnChance` becomes the Tutuşma (Ignite) chance on any fire hit). Trait `trait_pyromancer` rewritten per COMBAT_WOW CW-13: `heating_up` on a direct fire crit (not DoT, LMB counts), a second direct fire crit while it is active becomes `hot_streak` 8 s, **a non-crit does not clear it**; `streakCrit 0.25`, `burnCrit 0.5`. `HOT_STREAK_SKILLS` in `combat/specs/mage.ts` becomes `mage_pyroblast`, `mage_flamestrike` (Meteor no longer consumes it). `skills`: `mage_fireball` 1, `mage_pyroblast` 3, `mage_fire_blast` 6, `mage_scorch` 10, `mage_flamestrike` 12, `mage_blazing_barrier` 15; `treeSkills { mage_meteor: 's05' }`; majors `{ m45 mage_meteor, m90 mage_combustion, m180 mage_time_warp }`. Spec `fx` (retuned): `M mage_basic cv=fire:1 ;; M mage_fireball dotx=1.4 ;; M mage_blink cd=-1`.

#### 3a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `mage_basic` | Ateş Oku | auto-attack analogue | instant, 3-step chain | t_proj(5) | 25 | – | +2 mana/hit | off | fire 0.95 / 0.95 / 3 x 0.65 | `burn` (Ignite) | fire crits feed `heating_up` | fire_projectile x0.6, fire_burst x0.5 | Spellcast_Shoot x1.3 | fire_cast, fire_impact |
| rmb | `mage_fireball` | Ateş Topu | Fireball | cast 1.4 s (WoW 1.75) | t_proj(5), 24 m/s | 35 | – | 8 mana | on | fire 0.92 + Ignite 0.25 / 3 s; explodes for 30 % on enemies within 2.5 m (max 2) | `burn` | crit builds `heating_up` | fire_projectile, fire_burst | Spellcast_Shoot x1.15 (hold) | fire_cast, fire_impact |
| q | `mage_pyroblast` | Piroblast | Pyroblast | cast 3.2 s (WoW 4); **instant + free on Sıcak Seri** | t_proj(4), 18 m/s | 35 | – | 10 mana (0 on Sıcak Seri) | on | fire 2.8 + Ignite 0.7 / 4 s; heavy (hit-stop 40, trauma 0.14) | consumes `hot_streak`, `pyroclasm`; crit rolls `pyroclasm` | glow **q** on `hot_streak` (top + both sides) | fire_projectile x2.0 (long trail), fire_burst x1.2, crit_burst | Spellcast_Raise x1.0 (hold), Spellcast_Shoot | fire_cast, fire_impact, explosion x0.25 |
| e | `mage_fire_blast` | Ateş Patlaması | Fire Blast | instant | t_inst | 35 | **3 charges, 12 s recharge** | 0 | **off** | fire 0.90; **guaranteed crit while Isınıyor**; spreads Ignite to <= 2 enemies within 8 m (60 % of the remaining) | converts `heating_up` -> `hot_streak`; in Yanış each cast refunds its charge (PRD 50 %) | glow **e** on `heating_up` (left, ember) | fire_burst x0.7, hit_spark, fire streak (fire_projectile x0.5, instant) | Spellcast_Shoot x2.0 | fire_whoosh, fire_impact |
| r | `mage_scorch` | Kavurma | Scorch | cast 1.2 s, **no movement slow** (the kiting filler) | t_proj(6) | 30 | – | 4 mana | on | fire 0.80 | – | – | fire_projectile x0.5, fire_burst x0.4 | Spellcast_Shoot x1.4 | fire_cast, fire_impact |
| s1 | `mage_flamestrike` | Alev Sütunu | Flamestrike | cast 2.8 s (WoW 3.5); instant + free on Sıcak Seri | ground r 6 | 35 | – | 12 mana (0 on Sıcak Seri) | on | fire 2.8 per target at 8 targets (`crowd`), Ignite | consumes `hot_streak`, `pyroclasm` | glow **s1** on `hot_streak` with >= 3 targets | fire_rain x1.3, fire_ground | Spellcast_Raise x1.4 | fire_cast, explosion x0.3 |
| s2 | `mage_blink` | Işınlanma | Shimmer | instant | tele | 20 | CD 30 | 0 | off | arcane 0.6 | iframes 0.15 | – | blink | Dodge_Forward x1.6 | blink |
| s3 | `mage_blazing_barrier` | Alev Bariyeri | Blazing Barrier | instant | self_buff | – | **2 charges, 30 s recharge** (12.1) | 0 | off | absorb 25 % max HP + 2 x W (60 s); melee attackers burn 0.6 / 3 s; break nova 2.0 r 4 | `shield`, `blazing_barrier` | – | blazing_barrier | Spellcast_Raise x1.8 | fire_cast, buff |
| s4 | `mage_counterspell` | Büyü Kırma | Counterspell | instant | t_inst | 40 | CD 25 | 0 | off | – | interrupt, `silence` 3 s | – | interrupt_burst | Spellcast_Shoot x1.5 | interrupt |
| m45 | `mage_meteor` | Meteor | Meteor (talent, s05) | instant, lands after 2.4 s (WoW 3) | ground at target (else aim), telegraph circle r 4 | 35 | CD 45 | 0 | off | fire 3.8 impact + burning ground 1.6 / 4 s | `burn` | – | meteor_fall, fire_ground, telegraph_flash | Spellcast_Raise x1.75 | fire_cast, explosion |
| m90 | `mage_combustion` | Yanış | Combustion | instant | self_buff | – | CD 90 (WoW 120 / 60 with Kindling) | 0 | off | – | `combustion` 12 s: fire spells always crit; Ateş Patlaması refunds | – | combustion_aura | Spellcast_Raise x1.6 | fire_cast, proc_gain |
| m180 | `mage_time_warp` | Zaman Bükülmesi | Time Warp | instant | self_buff (party r 40) | 40 | CD 180 | 0 | off | – | `hero_haste` 40 s, `sated` 600 s | – | hero_wave | Spellcast_Raise x1.2 | time_warp |

#### 3b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `heating_up` | Isınıyor | direct fire crit (hit or LMB, not DoT) when not already up; **non-crits do not clear it** | the next direct fire crit becomes `hot_streak`; Ateş Patlaması is a guaranteed crit | 10 s | e | left, dim orange |
| `hot_streak` | Sıcak Seri (existing) | direct fire crit while `heating_up` | Piroblast and Alev Sütunu are instant and free, +25 % crit chance | 8 s | q, s1 | top bright orange + both sides |
| `pyroclasm` | Piroklazm | Piroblast crit, PRD 20 % (icd 6 s) | next 2 hard-cast Piroblast / Alev Sütunu: cast time −40 %, damage +25 % | 20 s, 2 charges | q | right, amber |
| `combustion` | Yanış (existing) | Combustion cast | fire spells always crit; Ateş Patlaması refunds (PRD 50 %) | 12 s | – | warm vignette + burst banner |
| `burn` | Yanma / Tutuşma | any fire hit (`burnChance`) | Ignite DoT; Ateş Patlaması spreads it | 3–4 s | – | target-frame own-debuff icon |

#### 3c. APL

ST:
```
mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2 && !status:combustion       # off-GCD
mage_meteor if cd_ready(mage_meteor) && (status:combustion || cd(mage_combustion) > 12)                    # off-GCD
mage_fire_blast if status:heating_up && charges >= 1                                                       # off-GCD, mid-cast allowed
mage_pyroblast if status:hot_streak
mage_fire_blast if status:combustion && charges >= 1                                                       # off-GCD refund loop
mage_pyroblast if status:pyroclasm && !moving
mage_scorch if moving                                                                                      # castable on the move (no cast slow)
mage_fireball
mage_basic
```
AoE (>= 4 targets):
```
mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2
mage_meteor if cd_ready(mage_meteor)
mage_fire_blast if charges >= 1                                  # off-GCD, spreads Ignite
mage_flamestrike if status:hot_streak && targets >= 4
mage_flamestrike if status:pyroclasm && targets >= 4
mage_pyroblast if status:hot_streak
mage_fireball
mage_basic
```

#### 3d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Ateş Topu | 26.00 | 1.17 | x1.00 | 30.4 | 0.92 hit + 0.25 Ignite |
| Piroblast | 8.00 | 3.50 | x1.00 | 28.0 | 2.8 + 0.7 Ignite; 7 of 8 instant (Hot Streak) |
| Ateş Patlaması (off-GCD) | 6.00 | 0.90 | x1.00 | 5.4 | 3 charges / 36 s + Combustion refunds |
| Kavurma | 3.00 | 0.80 | x1.00 | 2.4 | while moving (no cast slow) / Fire Blast empty |
| Meteor | 1.33 | 5.40 | x1.00 | 7.2 | 3.8 impact + 1.6 burning ground |
| Yanış window value | 0.67 | 8.00 | x1.00 | 5.3 | 100 % crit 12 s (~x1.42 on ~20 coef) |
| Piroklazm (inside Piroblast) | 1.50 | 1.00 | x1.00 | 1.5 | +25 % x ~3.4 coef |
| **TOTAL (ST)** | | | | **100.1** | target 100 ±5; GCD time 49.2 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Alev Sütunu (Sıcak Seri, instant) | 5.00 | 8 | 2.80 | x1.00 | 112.0 | ground r 6 |
| Ateş Patlaması (hit + Ignite on 2 more) | 3.00 | 3 | 0.60 | x1.00 | 5.4 | spread to <= 2 enemies |
| Piroblast, main target | 4.00 | 1 | 3.50 | x1.00 | 14.0 |  |
| Ateş Topu (main + 30 % splash on 2) | 6.00 | 1 | 1.87 | x1.00 | 11.2 | 1.17 + 2 x 0.35 |
| Meteor | 0.67 | 8 | 5.40 | x1.00 | 28.9 |  |
| Yanış window, amortised | 1.00 | 1 | 30.00 | x1.00 | 30.0 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **216.4** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Mana (60 s): Fireball 26 x 8 = 208, Pyroblast ~12, Scorch 3 x 4 = 12: **~235 spent vs ~530 regen**: Fire never starves (as in WoW). **Party buff:** Gizem Zekası.

#### 3e. What it feels like

* **Three-step loop.** A Fireball crit pops a small ember (Isınıyor, left overlay, Ateş Patlaması icon ants); Ateş Patlaması, pressed in the middle of the next cast, is a guaranteed crit and converts it; the whole screen top-flashes orange and Piroblast fires instantly with a huge two-metre fire sphere and a long trail (hit-stop 40 ms, trauma 0.14, `crit_burst`).
* **Yanış window.** `combustion_aura` + warm vignette, "PATLAMA!" with Meteor; Ateş Patlaması keeps refunding (a hot flicker on the charge pips), the Alev Sütunu swap at 4+ targets, the Meteor telegraph circle lands inside the window.
* **Meteor.** A red circle telegraph, a rising whistle, 2.4 s later the impact; the burning ground tick numbers merge.
* **Standout VFX/SFX.** Piroblast sphere (`fire_projectile` x2.0 with `trail`) and Meteor (`meteor_fall` + `fire_ground`); `fire_whoosh` on Ateş Patlaması, `explosion` layer x0.25 on Piroblast.

---

### 4. `mage_frost` — Buz Büyücüsü (Frost Mage)

**SpecDef wiring.** `stats` unchanged (`frostDamagePct 0.20, chilledDamagePct 0.15, castSpeed 0.08, ccDurationPct 0.15`). Trait `trait_cryomancer` kept (`fofChance 0.15, fofMax 2, fofDur 15, fofCrit 0.5`) and extended in `combat/specs/mage.ts` with the shatter rule: Buz Mızrağı is x3 against a **Frozen** target = `freeze` status, **or** the caster has Buz Parmağı (consumes 1), **or** the target has `freezing` >= 6 stacks (consumes 6). `skills`: `mage_frostbolt` 1, `mage_ice_lance` 3, `mage_flurry` 6, `mage_frost_nova` 10, `mage_blizzard` 12, `mage_ice_barrier` 15; `treeSkills { mage_glacial_spike: 's05' }`; majors `{ m45 mage_ray_of_frost, m90 mage_frozen_orb, m180 mage_time_warp }`. Spec `fx`: `M mage_basic cv=frost:1 ;; M mage_frost_nova cd=-1 ;; M mage_blink cd=-1` (the old `M mage_blizzard st=chill:3:2` stays).

#### 4a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `mage_basic` | Buz Oku | auto-attack analogue | instant, 3-step chain | t_proj(5) | 25 | – | +2 mana/hit | off | frost 0.95 / 0.95 / 3 x 0.65 | `chill` 1 | PRD 15 % `fingers_of_frost` per hit | frost_projectile x0.6, frost_burst x0.5 | Spellcast_Shoot x1.3 | frost_cast, frost_impact |
| rmb | `mage_frostbolt` | Ayaz Oku | Frostbolt | cast 1.4 s (WoW 1.75) | t_proj(5), 28 m/s | 35 | – | 8 mana; +1 Icicle | on | frost 1.20; `chill` 1 | +1 `freezing` on target, +1 `icicles`; PRD 15 % `fingers_of_frost`, PRD 12 % `brain_freeze` (icd 3 s) | replaced by Buz Sarkıtı at 5 Icicles | frost_projectile, frost_burst | Spellcast_Shoot x1.15 (hold) | frost_cast, frost_impact |
| (replaces rmb) | `mage_glacial_spike` | Buz Sarkıtı | Glacial Spike (talent, s05) | cast 1.4 s (WoW 1.75) | t_proj(4), 20 m/s | 35 | granted by `glacial_ready` | 10 mana | on | frost 3.3 (+50 % splash r 3 on <= 3 others); x1.5 against `freezing` >= 6 | +3 `freezing`; consumes all `icicles`, `glacial_ready` | glow **rmb** (top, ice blue) | NEW:`glacial_spike` (jagged spike slams in), frost_burst | Spellcast_Raise x1.4 | frost_cast, ice_chime, frost_impact, NEW:`ice_shatter` |
| q | `mage_ice_lance` | Buz Mızrağı | Ice Lance | instant | t_proj(9), 40 m/s | 35 | – | 6 mana | on | frost 0.85; **x3 shatter** (Frozen / Parmak / Freezing >= 6); Parmak adds +50 % crit; a shatter splashes 70 % of its damage to <= 3 enemies within 6 m | consumes `fingers_of_frost` (1) or `freezing` (6) | glow **q** on Parmak >= 1 or target Freezing >= 6 | frost_projectile x0.45 (thin spear); shatter: NEW:`shatter_burst` | Spellcast_Shoot x1.5 | frost_cast; shatter: NEW:`ice_shatter` |
| e | `mage_flurry` | Dondurucu Sağanak | Flurry | instant (3 hits, 0.12 s apart) | t_inst | 35 | **2 charges, 30 s recharge** | 10 mana; **free and charge-free on Beyin Donması** | on | frost 3 x 0.57 = 1.7; `chill` 2 | +3 `freezing`; consumes `brain_freeze`; 25 % `freezing_rain` | glow **e** on `brain_freeze` (top, pale blue) | frost_burst x0.7 x3, frost_nova x0.3 on the last | Spellcast_Shoot x2.0 | frost_cast, ice_chime |
| r | `mage_frost_nova` | Buz Halkası | Frost Nova | instant | self_aoe r 5 | – | CD 30 (was 9) | 12 mana | on | frost 0.6; root 3 s (`freeze` 2 s on trash) | +2 `freezing`; +1 `fingers_of_frost` per frozen enemy (existing trait text) | – | frost_nova | Spellcast_Raise x2.6 | frost_cast, frost_impact |
| s1 | `mage_blizzard` | Kar Fırtınası | Blizzard | cast 1.6 s (WoW 2); **instant + free on Dondurucu Yağmur** | ground r 6, 8 s zone | 35 | CD 15 | 15 mana | on | frost 16 ticks x 0.375 = 6.0 per target at 8 targets (`crowd`), slow 40 % | +1 `freezing` per 2 ticks; `chill` | glow **s1** on `freezing_rain` (right, cyan) | blizzard (ground), frost_burst x0.4 | Spellcast_Raise x1.75 | frost_cast, frost_impact |
| s2 | `mage_blink` | Işınlanma | Shimmer | instant | tele | 20 | CD 30 | 0 | off | arcane 0.6 | iframes 0.15 | – | blink | Dodge_Forward x1.6 | blink |
| s3 | `mage_ice_barrier` | Buz Bariyeri | Ice Barrier | instant | self_buff | – | CD 30 | 0 | off | absorb 25 % max HP + 2 x W; −10 % physical damage taken; melee attackers chilled; break nova frost 1.0 r 4 | `shield`, `ice_barrier` | – | shield_bubble (0x8fe3ff), frost_nova on break | Spellcast_Raise x1.8 | buff, frost_impact |
| s4 | `mage_counterspell` | Büyü Kırma | Counterspell | instant | t_inst | 40 | CD 25 | 0 | off | – | interrupt, `silence` 3 s | – | interrupt_burst | Spellcast_Shoot x1.5 | interrupt |
| m45 | `mage_ray_of_frost` | Ayaz Işını | Ray of Frost | **channel 3.2 s** (WoW 4) | beam, hands -> target | 30 | CD 45 (WoW 60) | 15 mana | off (3.2 s action) | frost 8 ticks x 0.525 = 4.2; slow 30 % | +1 `freezing` per tick; end grants `comet_ready` | – | drain_beam (0x8fe3ff, x1.0) | Spellcasting (loop) | frost_cast, drain_loop pitch 1.3 |
| (replaces m45) | `mage_comet_storm` | Kuyruklu Yıldız Yağmuru | Comet Storm (talent) | instant, 7 comets 0.1 s apart | ground at target r 3 | 35 | via `comet_ready` only | 0 | off | frost 7 x 0.43 = 3.0, r 1.5 each | +1 `freezing` per comet; consumes `comet_ready` | glow **m45** (top) | meteor_fall (0x8fe3ff, x0.45) x7 | Spellcast_Raise x2.0 | explosion x0.3 pitch 1.6, ice_chime |
| m90 | `mage_frozen_orb` | Donmuş Küre | Frozen Orb | instant | proj orb, homes on the target (2 rad/s), 8 s | 30 | CD 90 (WoW 60) | 0 | off | frost 12 pulses x 0.54 = 6.5 per target, r 3.2; slow 50 % | +20 % `fingers_of_frost` per pulse; `chill` | – | frost_projectile x3.0, frost_burst per pulse | Spellcast_Raise x1.6 | frost_cast, frost_impact |
| m180 | `mage_time_warp` | Zaman Bükülmesi | Time Warp | instant | self_buff (party r 40) | 40 | CD 180 | 0 | off | – | `hero_haste` 40 s, `sated` 600 s | – | hero_wave | Spellcast_Raise x1.2 | time_warp |

#### 4b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `fingers_of_frost` | Buz Parmağı (existing) | PRD 15 % per direct frost hit (max 2); Buz Halkası +1 per frozen enemy; Küre pulses 20 % | next Buz Mızrağı shatters (x3), +50 % crit | 15 s, 2 charges | q | left shards (1), both sides (2) |
| `brain_freeze` | Beyin Donması | PRD 12 % per Ayaz Oku / Buz Sarkıtı hit (icd 3 s) | next Dondurucu Sağanak free, no charge spent | 12 s | e | top, pale blue-white |
| `icicles` | Buz Sarkıtları | +1 per Ayaz Oku hit | at 5: `glacial_ready` | 20 s | – | counter by the pips |
| `glacial_ready` | Buz Sarkıtı Hazır | 5 Icicles | Ayaz Oku button becomes Buz Sarkıtı (spends all Icicles) | 15 s | rmb | top, ice blue |
| `freezing` | Donma (enemy debuff) | Ayaz Oku +1, Sağanak +3, Sarkıt +3, Işın +1/tick, Kuyruklu +1 each, Fırtına +1 per 2 ticks | >= 6 stacks = shatter-ready for Buz Mızrağı (consumes 6); cap 12 | 15 s | q (rule) | target-frame own-debuff icon with the stack number |
| `comet_ready` | Kuyruklu Yıldız Hazır | Ayaz Işını completes (cancel before 50 % does not grant it) | m45 button becomes Kuyruklu Yıldız Yağmuru | 8 s | m45 | top, pale blue |
| `freezing_rain` | Dondurucu Yağmur | Sağanak cast 25 % | Kar Fırtınası instant and free | 12 s | s1 | right, cyan |

#### 4c. APL

ST:
```
mage_flurry if status:brain_freeze                                                         # free Flurry first
mage_ice_lance if status:fingers_of_frost && stacks:fingers_of_frost >= 2
mage_frozen_orb if cd_ready(mage_frozen_orb)                                               # off-GCD
mage_ray_of_frost if cd_ready(mage_ray_of_frost) && charges(mage_flurry) < 1 && !status:fingers_of_frost   # after Flurry and Lance are spent
mage_comet_storm if status:comet_ready
mage_glacial_spike if status:glacial_ready
mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6
mage_flurry if charges >= 1 && target.stacks:freezing < 6
mage_frost_nova if cd_ready(mage_frost_nova) && target.stacks:freezing >= 3
mage_frostbolt
mage_basic
```
AoE (>= 3 targets): `mage_blizzard if status:freezing_rain || cd_ready(mage_blizzard)`, `mage_flurry if status:brain_freeze`, `mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6`, `mage_frozen_orb`, `mage_glacial_spike if status:glacial_ready`, `mage_ray_of_frost`, `mage_comet_storm if status:comet_ready`, `mage_frostbolt`, `mage_basic`.

#### 4d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Ayaz Oku | 17.00 | 1.20 | x1.00 | 20.4 |  |
| Buz Sarkıtı (replaces Ayaz Oku) | 3.50 | 3.30 | x1.00 | 11.5 | 5 Icicles each |
| Dondurucu Sağanak | 4.00 | 1.70 | x1.00 | 6.8 | 3 hits x 0.57; 2 charges / 30 s + Brain Freeze |
| Buz Mızrağı | 11.00 | 0.85 | x2.60 | 24.3 | x3 shatter on ~80 % of casts, rest x1 |
| Donmuş Küre | 0.67 | 6.50 | x1.00 | 4.3 | 12 pulses x 0.54 |
| Ayaz Işını | 1.33 | 4.20 | x1.00 | 5.6 | 8 ticks x 0.525, channel 3.2 s |
| Kuyruklu Yıldız Yağmuru (replaces Işın) | 1.33 | 3.00 | x1.00 | 4.0 | 7 comets x 0.43 |
| Buz Halkası | 2.00 | 0.60 | x1.00 | 1.2 |  |
| **TOTAL (ST)** | | | | **98.0** | target 100 ±5; GCD time 50.0 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Kar Fırtınası | 2.00 | 8 | 6.00 | x1.00 | 96.0 | 8 s zone, 16 ticks x 0.375 |
| Donmuş Küre | 0.33 | 8 | 6.50 | x1.00 | 17.2 |  |
| Dondurucu Sağanak | 2.00 | 1 | 1.70 | x1.00 | 3.4 |  |
| Buz Mızrağı shatter, main target | 5.00 | 1 | 2.20 | x1.00 | 11.0 |  |
| Buz Mızrağı splash (shatter 70 %) | 5.00 | 3 | 1.80 | x1.00 | 27.0 | 70 % of the 2.55 shatter hit |
| Buz Sarkıtı (50 % splash x 3) | 1.50 | 4 | 2.47 | x1.00 | 14.8 |  |
| Ayaz Oku | 6.00 | 1 | 1.20 | x1.00 | 7.2 |  |
| Ayaz Işını (single target) | 0.67 | 1 | 4.20 | x1.00 | 2.8 |  |
| Kuyruklu Yıldız Yağmuru (r 3, 6 targets) | 0.67 | 6 | 3.00 | x1.00 | 12.1 |  |
| Buz Halkası (root + damage) | 1.00 | 8 | 1.00 | x1.00 | 8.0 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **214.3** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Mana (60 s): Ayaz Oku 17 x 8 = 136, Buz Sarkıtı 3.5 x 10 = 35, Sağanak 4 x 10 x ~0.4 (Beyin Donması free) = 16, Mızrak 11 x 6 = 66, Halka 2 x 12, Işın 1.33 x 15 = 20: **~300 spent vs ~560 regen**. **Party buff:** Gizem Zekası.

#### 4e. What it feels like

* **Stacks you can see.** Donma stacks climb on the enemy (target-frame icon with a number, frost crystals on the model); at 6 the Buz Mızrağı icon ants: the shatter (x3, glass-shard burst, `ice_shatter` + `crit_ring`, "PARÇALANDI!") is the payoff.
* **Procs.** Buz Parmağı chime pitches by stack; Beyin Donması makes Sağanak free (top pale-blue overlay); five Icicles swap Ayaz Oku for the jagged Buz Sarkıtı slam.
* **Ray into comets.** Ayaz Işını is a 3.2 s beam that stacks Donma 8 times; when it ends the same key becomes Kuyruklu Yıldız Yağmuru and seven comets crash into the stacked target.
* **Standout VFX/SFX.** Glacial Spike slam + shatter shards; `ice_chime` on every proc; the orb follows the target and pulses frost bursts.

---

### 5. Haydut (rogue): rows and rules shared by all three specs

| slot | id | TR | rule |
|---|---|---|---|
| lmb | `rogue_basic` (+`_1.._4`) | Hançer Kombosu | 4-step chain, coef 0.85 / 0.85 / 0.95 / 1.70 (sum 4.35, cadence ~1.37 s = **3.2 coef/s**), **+3 energy per hit** (`gain 3`), **combo point only on steps 2 and 4** (`cp 1`; it was +1 on every step, which would flood the Kombo bar), step 4 keeps `bleed` 3 s. The finisher step applies **Zayıflatıcı Zehir** (CM §3, enemy +3 % damage taken, 30 s; CM3 owns the debuff). Shadow Technique (Gölge spec) hooks the same hits. |
| s2 | `rogue_shadow_step` | Gölge Adımı | WoW Shadowstep: see the row in each table and the full behaviour in 7e. |
| s3 | `rogue_feint` (new) | Aldatma | WoW Feint: off-GCD, 20 energy, CD 15 s, **2 charges**, 6 s: −40 % damage from area attacks (HitShapes with radius > 0), −15 % from the rest. |
| s4 | `rogue_kick` | Tekme | WoW Kick: baseline on the bar (class `s05` no longer grants it), range 3 (+3 m auto-lunge), CD 12 → **15 s**, cost 10 → 0, off-GCD, `interrupt` behaviour (silence 3 s on trash/elite, bosses lose the cast only). |
| m180 | `rogue_vanish` (renamed from `rogue_smoke_bomb`) | Kaybol | WoW Vanish (2 min, **bucketed to 180**), off-GCD, `stealth` 3 s (the first attack from it gets the engine's stealth opener: x1.5, forced crit), threat −50 %, grants `improved_garrote` (Assassin). Used by Suikastçı and Gölge. |
| resource | Enerji | – | pool 100, regen 12/s (x1.17 Suikastçı / Gölge via `resourceRegenPct 0.17`, x1.33 Simyacı). **Costs are ARPG-scaled** (15–25, existing rogue costs were 15–30), not WoW's 35–50: the rogue GCD is a fixed 1.0 s, so the reference rotation is GCD-bound and the LMB chain fills the rest, like every other spec. |
| pip | `combo` | Kombo Puanı | max 5 (Gölge: 6 via `trait_subtlety.maxCombo`). Finishers spend all points and scale per point (`finisher` behaviour, E2). |
| GCD | – | – | fixed 1.0 s, never hasted (COMBAT_WOW §2.1). |

**Positional rule** (CM §10.2, one rule for the whole game): `behind` = angle(target facing, attacker − target) > 110°. Backstab: **+20 % damage** (Midnight rule from the research file) and **+15 % crit chance** (CM). For 1.0 s after Gölge Adımı / Gölge Vuruşu the check always passes (`behind_grace`), so a boss that turns in that second does not void the snap. Enemies face their current threat target, so DPS behind a tanked boss is rewarded and frontal cleaves punish standing in front.

---

### 6. `rogue_assassin` — Suikastçı (Assassination Rogue)

**SpecDef wiring.** `stats { critChance 0.06, critDamage 0.20, attackSpeed 0.05, parryWindow 0.04, resourceRegenPct 0.17, threatPct -0.2 }` (unchanged). Specials: `assassin_vanish` (Kaybol drops 50 % threat, kept), `assassin_opener` is **dropped** (the x1.8 stealth opener is replaced by the engine's stealth rule + Gelişmiş Gırtlak Kesme), new `trait_assassination` = Deadly Poison baseline: Sakatlama, Bıçak Yelpazesi and LMB hits apply `poison` (existing id, stack cap 10, magnitude 0.18 per application, 12 s). `skills`: `rogue_mutilate` 1, `rogue_envenom` 3, `rogue_garrote` 6 (kept id), `rogue_rupture` 10, `rogue_fan_of_knives` 12 (kept id), `rogue_crimson_tempest` 12 (replace-only), `rogue_feint` 15, `rogue_kick` 10, `rogue_shadow_step` 3 (kept id); `treeSkills { rogue_kingsbane: 's05' }`; majors `{ m45 rogue_kingsbane, m90 rogue_deathmark, m180 rogue_vanish }`. `mods []`.

#### 6a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `rogue_basic` | Hançer Kombosu | auto-attack | instant, 4-step chain | melee_arc | 2.4–2.9 | – | +3 energy/hit; +1 CP on steps 2, 4 | off | physical 0.85 / 0.85 / 0.95 / 1.70 | `poison` +1 per hit; step 4 `bleed` 3 s | – | slash_arc, slash_arc_big (step 4) | Dualwield_Melee_Attack_Slice / Chop, 1H_Melee_Attack_Stab, Dualwield_Melee_Attack_Stab | swing_light, swing_heavy |
| rmb | `rogue_mutilate` | Sakatlama | Mutilate | instant | t_inst melee | 3.0 (+3 lunge) | – | 18 energy; **+2 CP** | on | physical 0.85 (two 0.425 hits) | +1 `poison` | – | slash_arc x0.8 (alternating blades), hit_spark | Dualwield_Melee_Attack_Slice x1.8 | swing_light, hit_flesh |
| q | `rogue_envenom` | Zehirleme | Envenom | instant | t_inst melee | 3.0 | – | 15 energy; finisher 1–5 CP | on | physical 0.8 + 0.38 per CP (5 CP = 2.7) | consumes CP, `darkest_night` | glow **q** at CP >= 5 | poison_burst x0.7 (green), slash_arc_big, crit_finisher_slash at 5 CP | Dualwield_Melee_Attack_Stab x1.5 | swing_heavy, poison_impact |
| e | `rogue_garrote` | Gırtlak Kesme | Garrote | instant | t_inst melee | 3.0 | CD 6 (was 14) | 20 energy (0 on Gelişmiş Gırtlak Kesme); **+1 CP** | on | physical 0.35 + `garrote` bleed 1.35 / 18 s | from stealth or `improved_garrote`: silence 3 s and +50 % bleed; consumes `improved_garrote` | glow **e** on `improved_garrote` (right, red) | curse_loop (0xb02020) tendrils, hit_blood | Dualwield_Melee_Attack_Chop x1.5 | swing_light, hit_flesh |
| r | `rogue_rupture` | Yırtma | Rupture | instant | t_inst melee | 3.0 | – | 12 energy; finisher 1–5 CP | on | `rupture` bleed 0.84 per CP over 8 + 4 x CP s (5 CP: 24 s, 4.2) | consumes CP | glow **r** when `rupture` < 30 % (refresh) | hit_blood, curse_loop (0xff3030) | Dualwield_Melee_Attack_Stab x1.4 | swing_heavy, hit_flesh |
| (replaces r) | `rogue_crimson_tempest` | Kızıl Fırtına | Crimson Tempest | instant | self_aoe r 8 | – | – (button swaps in `aoe_mode`) | 20 energy; finisher 1–5 CP | on | physical 1.2 hit + `rupture`-style bleed 2.0 per target at 5 CP (`crowd`) | consumes CP; bleeds every target hit | glow **r** with >= 3 targets | slash_arc_big x1.3, hit_blood | Dualwield_Melee_Attack_Slice x1.6 | swing_heavy |
| s1 | `rogue_fan_of_knives` | Bıçak Yelpazesi | Fan of Knives | instant | self_aoe r 8 | – | – (was CD 4) | 20 energy; **+1 CP per target (max 5)** | on | physical 0.80 per target at 8 targets (`crowd`) | +1 `poison` per target | – | dagger_projectile ring x12, poison_burst | Throw x1.6 | dagger_throw |
| s2 | `rogue_shadow_step` | Gölge Adımı | Shadowstep | instant | tele-behind, t_inst (enemy or ally) | 25 | CD 30, 1 charge (class `s02B` +1) | 0 (was 20) | off | – | `shadowstep_haste` +70 % move 2 s, `behind_grace` 1 s, iframes 0.2 s | next Mutilate/Garrote glows (rule `behind`) | NEW:`shadowstep_streak`, stealth_smoke x1.1 both ends, backstab_mark on the back 0.6 s | Dodge_Forward x1.8 | whoosh pitch 1.4, NEW:`shadowstep_snap` |
| s3 | `rogue_feint` | Aldatma | Feint | instant | self_buff | – | CD 15, 2 charges | 20 energy | off | −40 % area damage, −15 % other, 6 s | `feint` | – | shadow_burst x0.6, buff_aura (0x303040) | Dodge_Backward x1.6 | whoosh |
| s4 | `rogue_kick` | Tekme | Kick | instant | t_inst melee | 3.0 (+3 lunge) | CD 15 | 0 | off | – | interrupt, `silence` 3 s | – | kick_arc, interrupt_burst | Unarmed_Melee_Attack_Kick x1.5 | kick_hit, interrupt |
| m45 | `rogue_kingsbane` | Kral Belası | Kingsbane (talent, s05) | instant | t_inst melee | 3.0 | CD 45 (WoW 60) | 25 energy; **+1 CP** | off | physical 0.6 + `kingsbane` DoT 2.9 / 14 s, DoT +10 % per `poison` stack on the target (cap +100 %) | `kingsbane` (own debuff) | – | poison_cloud (0x2a4020, scale grows with stacks), hit_blood | Dualwield_Melee_Attack_Stab x1.4 | swing_heavy, poison_impact |
| m90 | `rogue_deathmark` | Ölüm İşareti | Deathmark | instant | t_inst | 5 | CD 90 (WoW 120) | restores 80 energy over 16 s | off | – | `deathmark` on the target 16 s: your Garrote, Rupture and poison damage +75 %; grants `darkest_night` | – | mark_loop (0x6a2a9a), curse_ring x1.5 | Dualwield_Melee_Attack_Stab x1.2 | curse_cast, whisper |
| m180 | `rogue_vanish` | Kaybol | Vanish | instant | self_buff | – | CD 180 (WoW 120) | 0 | off | – | `stealth` 3 s, `improved_garrote` 6 s, threat −50 % | glow **e** | stealth_smoke x1.6 | Dodge_Backward x1.0 | whoosh pitch 0.8 |


#### 6b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `improved_garrote` | Gelişmiş Gırtlak Kesme | Kaybol cast | Gırtlak Kesme costs 0, silences, +50 % bleed | 6 s | e | right, red |
| `darkest_night` | Karanlık Gece | Ölüm İşareti cast | next Zehirleme +100 % damage and refunds 2 CP | 16 s | q | top, dark red |
| `poison` | Zehir (existing, max 10) | Sakatlama, Yelpaze, LMB hits | DoT stack; Kral Belası scales with it; **Zayıflatıcı Zehir** debuff is refreshed by every application | 12 s | – | target-frame stack icon |
| `garrote` / `rupture` / `kingsbane` / `deathmark` | own debuffs | the matching ability | bleeds / DoT / amp; pandemic glow below 30 % | 18 s / 8–24 s / 14 s / 16 s | r (Yırtma refresh) | own-debuff row (COMBAT_WOW 2.15) |
| `aoe_mode` | – | >= 3 enemies within 10 m | Yırtma becomes Kızıl Fırtına | hidden | r | – |

#### 6c. APL

ST:
```
rogue_deathmark if cd_ready(rogue_deathmark) && target.status:garrote && target.status:rupture            # off-GCD
rogue_kingsbane if cd_ready(rogue_kingsbane) && (target.status:deathmark || cd(rogue_deathmark) > 20)     # off-GCD
rogue_vanish if cd_ready(rogue_vanish) && cd(rogue_deathmark) < 3 && !status:stealth                      # off-GCD, then Garrote
rogue_garrote if status:improved_garrote
rogue_garrote if (!target.status:garrote || dot_refresh:garrote) && res >= 20
rogue_rupture if pips:combo >= 5 && (!target.status:rupture || dot_refresh:rupture)
rogue_envenom if pips:combo >= 5
rogue_mutilate if pips:combo <= 3
rogue_envenom if pips:combo >= 4
rogue_mutilate
rogue_basic
```
AoE (>= 3 targets):
```
rogue_deathmark if cd_ready(rogue_deathmark)
rogue_kingsbane if cd_ready(rogue_kingsbane)
rogue_garrote @each if !target.status:garrote && res >= 20
rogue_crimson_tempest if pips:combo >= 4 && targets >= 3                  # replaces Rupture in aoe_mode, spreads the bleeds
rogue_fan_of_knives if pips:combo < 5
rogue_envenom if pips:combo >= 5 && targets < 3
rogue_basic
```

#### 6d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Sakatlama | 28.00 | 0.85 | x1.00 | 23.8 | 2 dagger hits, +2 CP |
| Zehirleme | 11.00 | 2.70 | x1.00 | 29.7 | 5 CP finisher |
| Yırtma | 2.50 | 4.20 | x1.00 | 10.5 | 24 s bleed at 5 CP |
| Gırtlak Kesme | 4.00 | 1.70 | x1.00 | 6.8 | 18 s bleed |
| Kral Belası | 1.33 | 3.50 | x1.00 | 4.7 | 14 s DoT, +10 % per poison stack |
| Ölüm İşareti window | 0.67 | 6.10 | x1.00 | 4.1 | x1.75 on bleeds and poison for 16 s |
| Kaybol -> Gelişmiş Gırtlak Kesme | 0.33 | 2.10 | x1.00 | 0.7 |  |
| Karanlık Gece (empowered Zehirleme) | 0.67 | 1.20 | x1.00 | 0.8 |  |
| **TOTAL (ST)** | | | | **100.8** | target 100 ±5; GCD time 45.5 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Bıçak Yelpazesi | 9.00 | 8 | 0.80 | x1.00 | 57.6 | +1 CP per target |
| Kızıl Fırtına (replaces Yırtma) | 3.00 | 8 | 3.20 | x1.00 | 76.8 | hit 1.2 + bleed 2.0 |
| Zehirleme | 3.00 | 1 | 2.70 | x1.00 | 8.1 |  |
| Gırtlak Kesme (4 targets) | 4.00 | 1 | 1.70 | x1.00 | 6.8 |  |
| Poison stacks (72 applications from Bıçak Yelpazesi on 8 targets) | 72.00 | 1 | 0.60 | x1.00 | 43.2 | 0.6 per stack over 12 s |
| Ölüm İşareti + Kral Belası, amortised | 1.00 | 1 | 14.00 | x1.00 | 14.0 |  |
| Sakatlama | 4.00 | 1 | 0.85 | x1.00 | 3.4 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **224.8** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Combo points (60 s, ST): in = Sakatlama 28 x 2 + Gırtlak 4 + Kral Belası 1.3 + LMB (3.75 chains x 2) = 68.8, out = Zehirleme 11 x 5 + Yırtma 2.5 x 5 = 67.5. Energy (60 s): out = 28 x 18 + 11 x 15 + 2.5 x 12 + 4 x 20 + 1.33 x 25 = 812; in = 14.0 x 60 + LMB 45 + Deathmark 40 = 925: **88 % used**. **Party buff:** Zayıflatıcı Zehir (every poison application).

#### 6e. What it feels like

* **Builder → finisher rhythm.** Sakatlama builds two points with two quick blade flashes; Zehirleme at five points is a green burst with a bigger slash. Poison stacks climb as icons on the target and Kral Belası's cloud grows with them.
* **The window.** Kaybol → Gelişmiş Gırtlak Kesme (silent, free, red tendrils, silence) → Ölüm İşareti (purple-black sigil spreads, energy bar surges +5/s for 16 s) → Kral Belası: three 45–90 s cooldowns that read as one burst, with the "PATLAMA!" banner.
* **Standout VFX/SFX.** Kral Belası cloud scaling with poison stacks; Garrote tendrils; low whisper + `curse_cast` toll on Ölüm İşareti.

---

### 7. `rogue_subtlety` — Gölge (Subtlety Rogue) — **new spec id**

**SpecDef wiring (new).** `id 'rogue_subtlety'`, `classId 'rogue'`, `name 'Gölge'`, `role 'dps'`, `desc 'Gölge Adımıyla hedefin arkasına geçer, Gölge Dansında Gizli Teknik klonlarıyla patlar.'`, `stats { critChance 0.05, critDamage 0.25, attackSpeed 0.05, resourceRegenPct 0.17, threatPct -0.2, parryWindow 0.04 }`. Specials: `trait_subtlety` = **Derin Strateji** (`maxCombo 6`) + **Gölge Tekniği** (`shadow_technique`: every 4th LMB hit, every 2nd inside Gölge Dansı, grants +1 CP and +8 energy) + **Zayıflık Bulma** (Gölge Vuruşu or a stealth Sırttan Bıçak grants `find_weakness`). `skills`: `rogue_backstab` 1 (kept id, spec `rogue_assassin` → `rogue_subtlety`), `rogue_shadowstrike` 1 (replace-only), `rogue_eviscerate` 3 (kept id), `rogue_black_powder` 3 (replace-only), `rogue_shuriken_storm` 6, `rogue_shadow_dance` 10 (kept id, spec change), `rogue_feint` 15, `rogue_kick` 10, `rogue_shadow_step` 3; `treeSkills { rogue_secret_technique: 's05' }`; majors `{ m45 rogue_goremaws_bite, m90 rogue_shadow_blades, m180 rogue_vanish }`. The `rogue_shadow_blades` row moves m45 → m90 (CD 45 → 90) and `rogue_shadow_dance` moves m90 → **e** (CD 90 → 20).

#### 7a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `rogue_basic` | Hançer Kombosu | auto-attack | instant, 4-step chain | melee_arc | 2.4–2.9 | – | +3 energy/hit; +1 CP on steps 2, 4 | off | physical 0.85 / 0.85 / 0.95 / 1.70 | step 4 `bleed` 3 s | `shadow_technique` counter | slash_arc, slash_arc_big | Dualwield_Melee_Attack_Slice / Chop, 1H_Melee_Attack_Stab, Dualwield_Melee_Attack_Stab | swing_light, swing_heavy |
| rmb | `rogue_backstab` | Sırttan Bıçak | Backstab | instant | t_inst melee | 3.0 (+3 lunge) | – | 16 energy; **+1 CP** | on | physical 0.90; **+20 % damage and +15 % crit from behind** | `find_weakness` when cast from stealth | glow **rmb** while behind (rule `behind`); replaced by Gölge Vuruşu while `stealth` | backstab_mark on the target's back when behind, slash_arc | Dualwield_Melee_Attack_Stab x1.4 | backstab, swing_light |
| (replaces rmb) | `rogue_shadowstrike` | Gölge Vuruşu | Shadowstrike | instant | t_inst; **teleports behind the target** (same placement as Gölge Adımı) | 25 | – | 20 energy; **+2 CP** | on | physical 1.40; +25 % while stealthed | `find_weakness` 10 s, `behind_grace` 1 s | glow **rmb** while `stealth` (top, dark) | NEW:`shadowstep_streak` (x0.7), crit_finisher_slash, backstab_mark | Dualwield_Melee_Attack_Stab x2.0 | backstab, whoosh, NEW:`shadowstep_snap` |
| q | `rogue_eviscerate` | İnfaz | Eviscerate | instant | t_inst melee | 3.0 | – | 20 energy; finisher 1–6 CP | on | physical 0.5 + 0.38 per CP (6 CP = 2.8) | consumes CP | glow **q** at CP >= 6 | slash_arc_big, hit_blood | Dualwield_Melee_Attack_Stab x1.5 | swing_heavy |
| (replaces q) | `rogue_black_powder` | Kara Barut | Black Powder | instant | self_aoe r 6 | – | – (swaps in `aoe_mode`) | 20 energy; finisher 1–6 CP | on | physical 0.4 + 0.32 per CP per target (6 CP = 2.3, `crowd`) | consumes CP | glow **q** with >= 3 targets | smoke_zone x0.5, slash_arc_big | Throw x1.6 | explosion x0.3, swing_heavy |
| e | `rogue_shadow_dance` | Gölge Dansı | Shadow Dance | instant | self_buff | – | CD 20, 1 charge (talent +1) | 0 | off | – | `shadow_veil_cd` 6 s (unbreakable stealth) + `stealth`; Backstab -> Gölge Vuruşu; Shadow Technique x2 | glow **e** at CP >= 6 with Gizli Teknik ready (rule `dance_ready`) | shadow_dance_smoke | Throw x2.0 | whoosh, whisper |
| r | `rogue_secret_technique` | Gizli Teknik | Secret Technique (talent, s05) | instant | t_inst melee, clones strike in r 6 | 3.0 | CD 25 | 24 energy; finisher 1–6 CP | on | physical 1.0 + 0.75 per CP (6 CP = 5.5): three strikes from you over 0.45 s plus two clone strikes (each 25 % of the total); the final hit and the clones explode in r 6 for 40 % on every other enemy | consumes CP | glow **r** at CP >= 6 inside Gölge Dansı | NEW:`secret_clones` | Dualwield_Melee_Attack_Slice, Stab, Chop x1.8 (animCycle) | backstab pitch ladder x3, crit_finisher |
| s1 | `rogue_shuriken_storm` | Shuriken Fırtınası | Shuriken Storm | instant | self_aoe r 8 | – | – | 24 energy; **+1 CP per target** | on | physical 1.00 per target at 8 targets (`crowd`) | – | – | dagger_projectile ring x10 (spin 14) | Throw x1.8 | dagger_throw |
| s2 | `rogue_shadow_step` | Gölge Adımı | Shadowstep | instant | tele-behind, t_inst (enemy or ally) | 25 | CD 30, 1 charge (class `s02B` +1) | 0 | off | – | `shadowstep_haste` +70 % move 2 s, `behind_grace` 1 s, iframes 0.2 s | Sırttan Bıçak glows (rule `behind`) | NEW:`shadowstep_streak`, stealth_smoke x1.1 both ends, backstab_mark | Dodge_Forward x1.8 | whoosh pitch 1.4, NEW:`shadowstep_snap` |
| s3 | `rogue_feint` | Aldatma | Feint | instant | self_buff | – | CD 15, 2 charges | 20 energy | off | −40 % area damage, −15 % other, 6 s | `feint` | – | shadow_burst x0.6 | Dodge_Backward x1.6 | whoosh |
| s4 | `rogue_kick` | Tekme | Kick | instant | t_inst melee | 3.0 (+3 lunge) | CD 15 | 0 | off | – | interrupt, `silence` 3 s | – | kick_arc, interrupt_burst | Unarmed_Melee_Attack_Kick x1.5 | kick_hit, interrupt |
| m45 | `rogue_goremaws_bite` | Kan Isırığı | Goremaw's Bite | instant | t_inst melee + 2 nearby | 3.0 | CD 45 | 16 energy; **+2 CP** | off | physical 0.8 + `bleed` 1.2 / 14 s; for 14 s your finishers repeat 20 % of their damage as shadow | `goremaw` 14 s | – | hit_blood, shadow_burst, curse_loop | Dualwield_Melee_Attack_Chop x1.4 | swing_heavy, hit_flesh |
| m90 | `rogue_shadow_blades` | Gölge Bıçakları | Shadow Blades | instant | self_buff | – | CD 90 (WoW 90) | 0 | off | – | `shadow_blades` 16 s: +20 % damage dealt, builders give +1 extra CP (the old −30 % cost is removed) | – | blades_shadow | Use_Item x2.0 | buff, whisper |
| m180 | `rogue_vanish` | Kaybol | Vanish | instant | self_buff | – | CD 180 (WoW 120) | 0 | off | – | `stealth` 3 s, threat −50 % | glow **rmb** (Gölge Vuruşu) | stealth_smoke x1.6 | Dodge_Backward x1.0 | whoosh pitch 0.8 |

#### 7b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `shadow_veil_cd` | Gölge Dansı (existing id, TR renamed) | Gölge Dansı cast | stealth that does not break on attack; Sırttan Bıçak -> Gölge Vuruşu; Gizli Teknik is the finisher of choice | 6 s | rmb, r | black smoke body |
| `stealth` | Gizlenme (existing) | Kaybol, Gölge Dansı | engine stealth opener (x1.5 once, forced crit) except inside Dance, where it does not break | 3–6 s | rmb | – |
| `find_weakness` | Zayıflık Bulma | Gölge Vuruşu, or Sırttan Bıçak from stealth | +10 % damage (stands in for 30 % armour ignore) | 10 s | – | buff row |
| `shadow_technique` | Gölge Tekniği | LMB hit counter (4, or 2 in Dance) | +1 CP and +8 energy | – | – | counter on the Kombo bar |
| `behind_grace` | – | Gölge Adımı / Gölge Vuruşu | "behind" always true | 1.0 s | – | hidden |
| `shadow_blades` | Gölge Bıçakları (existing) | m90 | +20 % damage, +1 CP on builders | 16 s | – | vignette + banner |
| `goremaw` | Kan Isırığı | m45 | finishers repeat 20 % as shadow | 14 s | – | buff row |
| `aoe_mode` | – | >= 3 enemies within 10 m | İnfaz becomes Kara Barut | hidden | q | – |

#### 7c. APL

ST:
```
rogue_goremaws_bite if cd_ready(rogue_goremaws_bite)                                                        # off-GCD
rogue_shadow_dance if pips:combo >= 6 && cd_ready(rogue_secret_technique) && !status:shadow_veil_cd       # off-GCD
rogue_shadow_blades if status:shadow_veil_cd && cd_ready(rogue_shadow_blades)                              # off-GCD, inside Dance
rogue_secret_technique if pips:combo >= 6 && status:shadow_veil_cd
rogue_vanish if cd_ready(rogue_vanish) && pips:combo <= 2 && !status:shadow_veil_cd                        # off-GCD, then Shadowstrike
rogue_shadowstrike if stealthed
rogue_eviscerate if pips:combo >= 6 && !status:shadow_veil_cd
rogue_secret_technique if pips:combo >= 6 && cd_ready(rogue_secret_technique)
rogue_shadow_step if !behind && cd_ready(rogue_shadow_step)                                                # off-GCD reposition
rogue_backstab
rogue_basic
```
Rule from Method: stop starting Gölge Dansı when Gölge Bıçakları has <= 10 s left. AoE (>= 3 targets):
```
rogue_goremaws_bite if cd_ready(rogue_goremaws_bite)
rogue_shadow_dance if pips:combo >= 6 && cd_ready(rogue_secret_technique)
rogue_shadow_blades if status:shadow_veil_cd
rogue_secret_technique if pips:combo >= 6 && status:shadow_veil_cd
rogue_vanish if cd_ready(rogue_vanish) && pips:combo <= 2 && !status:shadow_veil_cd
rogue_black_powder if pips:combo >= 6 && targets >= 3                    # replaces Eviscerate in aoe_mode
rogue_shuriken_storm if targets >= 2
rogue_shadowstrike if stealthed && targets < 3
rogue_basic
```

#### 7d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Sırttan Bıçak | 26.00 | 0.90 | x1.15 | 26.9 | +20 % behind, ~75 % of casts behind |
| Gölge Vuruşu (replaces Sırttan Bıçak in Dance) | 9.00 | 1.40 | x1.00 | 12.6 | 3 per Dance x 3 Dances |
| İnfaz | 7.20 | 2.80 | x1.00 | 20.2 | 6 CP |
| Gizli Teknik | 2.40 | 5.50 | x1.00 | 13.2 | 3 hits + clone hits at 6 CP |
| Kan Isırığı | 1.33 | 2.80 | x1.00 | 3.7 | bleed + 20 % finisher repeat |
| Gölge Bıçakları window | 0.67 | 8.00 | x1.00 | 5.3 | +20 % damage 16 s + extra CP |
| Kaybol opener | 0.33 | 2.20 | x1.00 | 0.7 |  |
| **TOTAL (ST)** | | | | **102.5** | target 100 ±5; GCD time 44.6 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Shuriken Fırtınası | 10.00 | 8 | 1.00 | x1.00 | 80.0 | +1 CP per target |
| Kara Barut (replaces İnfaz) | 3.00 | 8 | 2.30 | x1.00 | 55.2 | 0.4 + 0.32 x 6 CP |
| Gizli Teknik (main + 40 % to 7 others) | 1.20 | 1 | 20.90 | x1.00 | 25.1 | 5.5 + 7 x 2.2 |
| Gölge Vuruşu | 3.00 | 1 | 1.40 | x1.00 | 4.2 |  |
| Kan Isırığı (3 targets) | 0.67 | 3 | 2.80 | x1.00 | 5.6 |  |
| Gölge Bıçakları, amortised | 1.00 | 1 | 18.00 | x1.00 | 18.0 |  |
| İnfaz | 1.00 | 1 | 2.80 | x1.00 | 2.8 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **205.8** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Combo points (60 s, ST): in = Sırttan Bıçak 26 + Gölge Vuruşu 9 x 2 + Kan Isırığı 1.33 x 2 + LMB (3.75 chains x 2) + Shadow Technique ~3 + Shadow Blades ~3 = 60.2, out = İnfaz 7.2 x 6 + Gizli Teknik 2.4 x 6 = 57.6. Energy (60 s): out = 26 x 16 + 9 x 20 + 7.2 x 20 + 2.4 x 24 + 1.33 x 16 = 819; in = 14.0 x 60 + LMB 45 + Shadow Technique 25 = 910: **90 % used**. **Party buff:** Zayıflatıcı Zehir (LMB finisher step and every finisher).

#### 7e. What it feels like, and the signature move

* **The snap.** `E`/`2` (Gölge Adımı) and every Gölge Vuruşu inside Gölge Dansı teleport the Haydut behind the target in the same frame: the camera lerps 120 ms, the model leaves a 0.25 s afterimage, and a golden mark pulses on the target's back, so the next Sırttan Bıçak always reads "behind".
* **Windows.** Gölge Dansı (6 s) + Gölge Bıçakları (16 s): the Kombo bar fills 2 points per Gölge Vuruşu, the "PATLAMA!" banner shows with the 90 s major, and Gizli Teknik fires three strikes plus two shadow clones around the target.
* **Quiet then loud.** Between windows the spec is Sırttan Bıçak taps and LMB chains; inside them every button is a teleporting strike.
* **Standout VFX/SFX.** `shadowstep_streak` (dark ribbon + afterimage), `secret_clones` (two silhouettes strike from ±120° with a delay), `backstab` pitch ladder (+8 % per strike) under Gizli Teknik.

**Signature: Gölge Adımı (Shadowstep) and Sırttan Bıçak (Backstab), exact behaviour**

```
Gölge Adımı  off-GCD, instant. target = hard target, else soft target, else (Simyacı / ally use) the friendly target (U / F1..F5) within 25 m.
             No valid target: the cast FAILS (no cooldown, text "Hedef yok"); the old 8 m blink fallback is removed (params.fallback = 0).
destination  1.2 m behind the target on the line opposite its facing: off = target.radius + caster.radius + 0.55 (the existing formula), resolved with
             NavGrid.resolveCircle; if blocked, try +-45 deg then +-90 deg around the target; still blocked: fail with "Yol yok", no cooldown.
             Allies: the same formula but the caster ends up beside, facing the ally (no "behind").
frame 0      model hidden 0.08 s, smoke puff + shadow_burst at the origin (stealth_smoke x1.1), afterimage silhouette stays 0.25 s at the origin
             (NEW:shadowstep_streak draws a dark ribbon origin -> destination for 0.18 s so remote peers see where you went).
frame 1      position set (forcedMove cleared, velocity zeroed), yaw = facing the target's back, smoke puff at the destination, backstab_mark
             pulses on the target's back for 0.6 s, camera kickFov -3 deg and a 120 ms position lerp (no hard cut), trauma 0.03, edge vignette 0.1 s.
             Remote peers: they see a jump, not a slide (Interpolator.SNAP_DIST already handles it). Clears nothing (WoW: no root break).
after        shadowstep_haste +70 % move speed 2 s; behind_grace 1.0 s; iframes 0.2 s. The engine's `ambush` forced-crit status is NOT applied any more.
             Cooldown 30 s, 1 charge (class node s02B: +1 charge, slower recharge; s02A: -2 s). Cast is off-GCD, so Gölge Adımı -> Sırttan Bıçak is one GCD.
Gölge Vuruşu same destination rule, range 25, on GCD, only while `stealth` is up (Gölge Dansı, Kaybol): +2 CP, +25 % damage, applies find_weakness;
             it replaces Sırttan Bıçak on the same key through `replaces { skill: rogue_backstab, whileStatus: stealth }`.
Sırttan Bıçak  melee t_inst, range 3.0 with 3 m auto-lunge. Behind (angle > 110 deg, or behind_grace) = +20 % damage, +15 % crit chance, the
             backstab_mark flashes gold on the hit and the `backstab` sound plays; frontal hits deal base damage with no mark. The key glows
             (`behind` rule) when the player is behind the target, so the glow is the positional cue in a fight where enemies turn.
```

---

### 8. `rogue_alchemist` — Simyacı (custom healer: Discipline Priest "heal by damage" + potions)

**SpecDef wiring.** `stats { healingPct 0.25, damagePct -0.40, resourceRegenPct 0.33, moveSpeedPct 0.05 }` (unchanged), `basic 'rogue_vial_throw'`, special `alchemist_overheal` (Taşan Şifa, kept). **New core mechanic Simya Bağı** (`alchemy_link`, the Atonement analogue): see 8b. `skills` (spec rows): `rogue_vial_throw` 1, `rogue_acid_flask` 3, `rogue_ward_potion` 6, `rogue_bubbling_brew` 8, `rogue_vial_heal` 10 (kept), `rogue_mending_draught` 12 (kept), `rogue_antidote` 15 (kept), `rogue_smoke_ward` 15 (kept, `treeSkills { rogue_smoke_ward: 's05' }` unchanged), `rogue_shadow_step` 3; majors `{ m45 rogue_elixir_of_life, m90 rogue_miracle_brew, m180 rogue_ascendant_brew }`. **`rogue_haste_elixir` is dropped**: the Heroism family (CM §3) does not include Haydut. Heal numbers use `healFormula` (dex scaling, `healingPct`), heal "coef" = multiple of the weapon roll like damage. **Damage coefficients in 8a are pre-modifier**: the spec keeps `damagePct −0.40` (the solo "Yalnız Kurt" rule in CM §1 relies on a negative damage modifier), so 58 coefficient per minute is 35 effective. The Simyacı has **no interrupt** by design (Discipline has none): s4 is the dispel / utility button.

#### 8a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `rogue_vial_throw` | Şişe Fırlat | auto-attack (Smite-less) | instant | t_proj(6), enemy or ally by reticle (`vial_throw`) | 22 | repeat 0.4 s | 0 | off | enemy poison 1.35 (pre-modifier); ally heal 1.0 | `poison` 6 s on enemies; +1 Karışım Puanı per heal | every damage hit feeds Simya Bağı | poison_projectile, poison_burst | Throw x1.6 | dagger_throw, poison_impact |
| rmb | `rogue_acid_flask` | Asit Şişesi | Smite | cast 1.2 s (WoW 1.5) | t_proj(6), lobbed | 25 | – | 20 energy | on | poison 2.50 (pre-modifier) | `poison` 6 s | feeds Simya Bağı | poison_projectile x1.4, poison_burst x0.9 | Throw x1.3 | dagger_throw, poison_impact |
| q | `rogue_bubbling_brew` | Kaynayan Karışım | Penance | **channel 1.6 s** (WoW 2) = 3 flask bolts | enemy: t_proj(8); ally: t_inst heal (smart resolver) | 25 | CD 9 | 33 energy | on | enemy poison 3 x 1.35 = 4.05 (pre-modifier); ally heal 3 x 0.8 = 2.4 | consumes `brew_boost` (+30 %) | damage mode feeds Simya Bağı | poison_projectile x0.8 / heal_burst | Spellcasting (loop), Throw per bolt | potion_use, heal |
| e | `rogue_ward_potion` | Koruyucu İksir | Power Word: Shield | instant | t_inst ally (smart resolver) | 30 | CD 7.5 | 25 energy | on | absorb 1.5 (15 s) | applies `alchemy_link` 15 s; grants `brew_boost` 12 s | glow **e** when < 5 allies linked (rule `link_gap`) | shield_bubble (0x7dffb0), NEW:`link_tether` | Throw x1.8 | potion_use, buff |
| r | `rogue_vial_heal` | Şifa Şişesi | Power Word: Radiance | cast 1.6 s (WoW 2); instant with `elixir_ramp` | ground r 3.5 -> <= 5 injured allies within 30 m | 30 | CD 18 | 42 energy (−40 % with `elixir_ramp`) | on | heal 1.4 per ally + puddle 0.25 x 6 ticks | applies `alchemy_link` at 60 % duration (9 s); consumes `elixir_ramp` | glow **r** on `elixir_ramp` (centre, green-gold) | heal_burst, elixir_rain x0.6, NEW:`link_tether` | Throw x1.0 | heal, potion_use |
| s1 | `rogue_mending_draught` | Mucize Damla | Flash Heal | instant | t_inst ally | 30 | – | 33 energy | on | heal 1.6 + 1.1 per Karışım Puanı (spends all) | applies `alchemy_link` 15 s | glow **s1** at Karışım >= 3 (pulses at 5) | heal_burst, shield_bubble x0.5 | Use_Item x1.6 | heal |
| s2 | `rogue_shadow_step` | Gölge Adımı | Shadowstep | instant | tele, t_inst ally or enemy | 25 | CD 30 | 0 | off | – | `shadowstep_haste` 2 s | – | NEW:`shadowstep_streak`, stealth_smoke | Dodge_Forward x1.8 | whoosh, NEW:`shadowstep_snap` |
| s3 | `rogue_smoke_ward` | Duman Siperi | Power Word: Barrier (lite) | instant | ground r 5 | 20 | CD 30 (was 20) | 30 energy | off | zone 6 s: allies −15 % damage taken, enemies blinded 1.2 s | – | – | smoke_zone | Throw x1.0 | buff |
| s4 | `rogue_antidote` | Panzehir | Purify | instant | t_inst ally | 25 | CD 8 | 17 energy | on | heal 0.8; removes up to 3 debuffs; regen 4 s | `regen` | – | heal_burst | Use_Item x2.0 | heal |
| m45 | `rogue_elixir_of_life` | Hayat İksiri Yağmuru | Evangelism (lite) | instant | self_aoe heal r 15 (`major_elixir`) | 15 | CD 45 | 0 | off | heal 1.8 per ally + regen 0.3 x 6 s + cleanse 1 | applies `alchemy_link` to **all** allies within 40 m (full 15 s); grants `elixir_ramp` 10 s | – | elixir_rain | Throw x1.8 | potion_use |
| m90 | `rogue_miracle_brew` | Mucize Karışım | Barrier + HoT zone | cast 1.0 s | ground r 6 (`major_brew`) | 22 | CD 90 | 0 | off | zone 10 s: allies −25 % damage, heal 0.6/s each, cleanse every 2 s | – | – | brew_cauldron | Throw x1.2 | buff |
| m180 | `rogue_ascendant_brew` (new) | Yüce Karışım | Ultimate Penitence | cast 1.2 s then **channel 4.8 s** (WoW 1.5 + 6) | self, throws at the target (enemy within 25 m) | 25 | CD 180 (WoW 240) | 0 | off | 8 pulses: poison 0.85 (pre-modifier) at the target and a 1.5 heal on the most injured ally | `ascendant` 6 s: absorb 60 % max HP, immune to knockback and CC | – | buff_aura (0x7dffb0), heal_pillar, NEW:`link_tether` | Spellcast_Long / Spellcasting (loop) | choir_swell, potion_use |

#### 8b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `alchemy_link` | Simya Bağı | Koruyucu İksir (15 s), Mucize Damla (15 s), Şifa Şişesi (9 s, <= 5 injured allies), Hayat İksiri (all, 15 s) | **every damage the Simyacı deals heals each linked ally for 46 % of it** (full value for the first 5 injured linked allies, x0.5 beyond; Season 2 Atonement transfer); the Simyacı's own damage modifier of −40 % is already in `stats` | 15 s (9 s via Şifa Şişesi) | e (when < 5 linked) | linked allies show a green-gold tether line and a link icon |
| `elixir_ramp` | Hayat İksiri Hazırlığı | Hayat İksiri cast | next 2 Şifa Şişesi are instant and −40 % cost | 10 s | r | centre, green-gold |
| `brew_boost` | Köpüren Karışım | Koruyucu İksir cast (Weal and Woe) | next Kaynayan Karışım +30 % | 12 s | q | left, pale green |
| `overheal_ward` | Taşan Şifa (existing) | overheal | +10 % healing per stack (max 4, 4 s) | 4 s | – | small gold ring on the target frame |
| pip `karisim` | Karışım Puanı | vial heal landings (cap 2 per cast) | Mucize Damla +1.1 coef per point | – | s1 at >= 3 | – |

#### 8c. APL (healer)

Healer-only conditions: `ally.low% OP N` (lowest ally HP %), `allies.injured OP N` (allies below 90 %), `allies.linked OP N`, `allies.debuffed OP N`. ST = tank-damage stream, AoE = party-damage stream.
```
rogue_miracle_brew if cd_ready(rogue_miracle_brew) && allies.injured >= 3 && ally.low% < 50          # off-GCD
rogue_elixir_of_life if cd_ready(rogue_elixir_of_life) && allies.linked < 3 && allies.injured >= 2    # off-GCD, ramp
rogue_ascendant_brew if cd_ready(rogue_ascendant_brew) && allies.linked >= 4 && allies.injured >= 3   # off-GCD
rogue_mending_draught if ally.low% < 40 && pips:karisim >= 1
rogue_ward_potion if allies.linked < 5                                    # tank first, then lowest ally
rogue_vial_heal if allies.injured >= 3 && (allies.linked < 4 || status:elixir_ramp)
rogue_bubbling_brew if allies.linked >= 2                                 # on the enemy: damage, heals every linked ally
rogue_antidote if allies.debuffed >= 1
rogue_acid_flask
rogue_vial_throw
```

#### 8d. Budget hand calculation

**Damage (target 35 effective per 60 s):**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| Şişe Fırlat (LMB, poison) | 12.50 | 1.35 | x1.00 | 16.9 | 5 s x 2.5 throws/s (0.4 s repeat), feeds Simya Bağı |
| Asit Şişesi | 9.00 | 2.50 | x1.00 | 22.5 | hard cast 1.2 s |
| Kaynayan Karışım (enemy mode) | 3.00 | 4.05 | x1.00 | 12.1 | 3 flasks x 1.35 |
| Poison DoT (applied by Şişe / Asit) and Yüce Karışım pulses | 1.00 | 6.70 | x1.00 | 6.7 | poison, ~6 s ticks; 0.33 x 8 x 0.85 pulses included |
| **TOTAL damage (pre-modifier coefficients)** | | | | **58.2** | the spec keeps `damagePct −0.40` (Yalnız Kurt relies on it) |
| **Effective damage after x0.60** | | | | **34.9** | target 35 |

**Healing (target 100 ±5 units per 60 s, 5-man stream, overheal already deducted):**

| Ability | casts / 60 s | coef | targets | effective share | total | note |
|---|---:|---:|---:|---:|---:|---|
| Simya Bağı flow (46 % of our damage x 2.4 effective linked allies) | 1.00 | 16.10 | 2.4 | x1.00 | 38.6 | effective damage 35.0 x 0.46 x 2.4 effective allies |
| Koruyucu İksir (absorb + link) | 8.00 | 1.50 | 1 | x0.85 | 10.2 | 7.5 s CD |
| Kaynayan Karışım (ally mode) | 3.70 | 2.40 | 1 | x0.85 | 7.5 | 3 flasks x 0.8 |
| Şifa Şişesi (ground + <= 5 links) | 3.30 | 1.40 | 3 | x0.80 | 11.1 | 18 s CD, 3 effective targets |
| Mucize Damla (Karışım Puanı) | 5.00 | 3.25 | 1 | x0.90 | 14.6 | 1.6 + 1.1 x 1.5 points |
| Panzehir | 3.00 | 0.80 | 1 | x0.90 | 2.2 |  |
| Hayat İksiri Yağmuru (m45) | 1.33 | 1.80 | 5 | x0.60 | 7.2 | 5 allies, regen included (~x1.2) |
| Mucize Karışım cauldron (m90) | 0.67 | 3.00 | 5 | x0.50 | 5.0 | 10 s x 0.6/s |
| Yüce Karışım (m180) | 0.33 | 12.00 | 1 | x1.00 | 4.0 | 4.8 s channel, each pulse heals the most injured ally |
| **TOTAL healing** | | | | | **100.5** | target 100 ±5; GCD time (heals + damage + majors) ~45.5 s / 54 s |

Energy (60 s): out = Asit 9 x 20 + Kaynayan 6.7 x 33 + Koruyucu 8 x 25 + Şifa Şişesi 3.3 x 42 + Mucize Damla 5 x 33 + Panzehir 3 x 17 = 956; in = 16.0 x 60 = 960: **99.6 % used**, so the bar oscillates between ~15 % and ~45 % and ends the 300 s fight at >= 5 % (hand model, 95 % efficiency). **Party buff:** Zayıflatıcı Zehir (every poison hit, and the Link damage keeps it up).

#### 8e. What it feels like

* **Heal by hitting.** A shield potion lands on the tank, a green-gold tether line draws from the Simyacı to the tank; every Şişe / Asit hit sends a pulse down each tether and small green `+` numbers appear on the linked allies. Five tethers at once is a visible web; dropping below five makes Koruyucu İksir glow.
* **Ramp.** Hayat İksiri links everyone, the next two Şifa Şişesi are instant, then Kaynayan Karışım on the boss heals the whole party through the web; Yüce Karışım turns the Simyacı into a spinning alchemist with a shield, throwing eight pulses.
* **Standout VFX/SFX.** `link_tether` (thin additive line with a travelling pulse), a soft chime per heal tick (existing `heal`, pitch +3 % per linked ally), `choir_swell` on Yüce Karışım.

---

### 9. Warlock: rows and rules shared by both specs

The warlock has **almost no runtime rows yet** (`data/skillsets/warlock.ts` and `warlockSpecs.ts` are compile-only stubs; GDD_CLASSES_V2 §6 is a design only; the only coded rows are `warlock_spell_lock` and `warlock_unending_resolve` in `data/skills_class_utils.ts`). This file supersedes GDD_CLASSES_V2 §6.4–§6.5 where they differ; ids from §6 are kept wherever the WoW ability matches.

| slot | id | TR | rule |
|---|---|---|---|
| lmb | `warlock_basic` (+`_1.._4`) | Gölge Oku Zinciri | as GDD_CLASSES_V2 §6.3: 4 steps, coef 0.85 / 0.85 / 2 x 0.62 / 2.02 (sum 4.96, cadence 1.55 s = **3.2 coef/s**), +3 mana per hit (step 4 +6), weights 0 / 0 / 4 / 1. Affliction flavour: steps 1–2 25 % `agony` stack, step 4 50 % `corruption` 6 s, +20 % shard chance on step 4. Destruction flavour: spec `mods` `M warlock_basic cv=fire:1`, step 4 50 % `immolate` 6 s. |
| s2 | `warlock_demonic_circle` (new) | İblis Çemberi | WoW Demonic Circle: Teleport, **simplified**: no placed circle; teleports 14 m along the movement input (else the aim) like `mage_blink`, removes roots and slows, leaves a rune ring for 6 s. Off-GCD, CD 30, cost 0. |
| s3 | `warlock_dark_pact` (new) | Karanlık Pakt | WoW Dark Pact: sacrifices 20 % of **current** HP (never lethal) for an absorb worth 200 % of it, 20 s. Off-GCD, CD 60. Replaces `warlock_life_tap`. |
| s4 | `warlock_spell_lock` | Büyü Kilidi | WoW Spell Lock (the felhunter's bite, cast directly, no pet): range 30 → **40**, CD 24 (kept), cost 10 → 0, off-GCD, `interrupt` behaviour (silence 3 s, bosses lose the cast only). Baseline on the bar (class `s05` no longer grants it). |
| m45 | `warlock_malevolence` (new) | Kötülük | WoW Malevolence (a hero talent in WoW, baked into the spec because hero talents are not modelled), bucket 60 → 45. |
| m180 | `warlock_unending_resolve` | Bitmeyen Kararlılık | WoW Unending Resolve, CD 180 (exact bucket), off-GCD: −25 % damage taken, immune to silence / interrupt / pushback, 8 s. Status id reused: `resolve_pact` (TR renamed, −30 % → −25 %). The coded row changes CD 60 → **180** and replaces `params.ccImmune` by silence / interrupt / pushback immunity only. |
| resource | Mana + `shard` | – | mana pool 100, regen 6 + 0.015 x Zeka (`manaScaling`); **shards in fragments**: `pip shard` max 5 displayed pips, `PipDef.scale = 10` (stored 0–50). Shard costs below are written in fragments. |
| trait | `trait_blood_pact` | Kan Pakti | class trait kept: +20 % DoT damage (`dotPct`), DoT ticks heal you for 3 % of the tick. |
| passive | Ruh Taşı + Sağlık Taşı | – | party buff (CM §3): battle res (1 per boss / key, 5 min) + party healthstones (heal 25 %, 1 per combat). No bar slot: CM3 owns the interaction. |

Spectral summons (`warlock_summon_darkglare`, `warlock_summon_infernal`) use the new `spectral_summon` behaviour (E7), **not** the minion system (it has no runtime yet).

---

### 10. `warlock_affliction` — Azap (Affliction Warlock)

**SpecDef wiring.** `stats { dotPct 0.25, castSpeed 0.08 }`, `specials trait_affliction { shardOnKill 1, dotCrit 0.5 }` (GDD §6.5, kept). `skills`: `warlock_shadow_bolt` 1, `warlock_agony` 3, `warlock_corruption` 6, `warlock_unstable_affliction` 10, `warlock_seed_of_corruption` 12 (replace-only), `warlock_dark_pact` 15, `warlock_demonic_circle` 6, `warlock_spell_lock` 10; `treeSkills { warlock_haunt: 's05' }` (the old `s05` grant of Seed becomes Musallat); majors `{ m45 warlock_malevolence, m90 warlock_summon_darkglare, m180 warlock_unending_resolve }`. Replaced / dropped: `warlock_af_dark_soul`, `warlock_af_pandemic`, `warlock_summon_demon`, `warlock_life_tap`, `warlock_drain_life` (benched, class `s05` pick).

#### 10a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `warlock_basic` | Gölge Oku Zinciri | auto-attack | instant, 4-step chain | t_proj(5) (step 4 ground r 2.6) | 24 | – | +3 mana/hit | off | shadow 0.85 / 0.85 / 2 x 0.62 / 2.02 | 25 % `agony` (steps 1–2), 50 % `corruption` (step 4) | – | shadow_projectile, unstable_burst (step 4) | Spellcast_Shoot x1.3, Spellcast_Raise x2.2 (step 4) | shadow_cast, shadow_impact |
| rmb | `warlock_shadow_bolt` | Gölge Oku | Shadow Bolt | cast 1.6 s (WoW 2.0) | t_proj(5), 28 m/s | 30 | – | 10 mana | on | shadow 0.95 | PRD 6 % +10 fragments | – | shadow_projectile x1.3, shadow_burst x0.5 | Spellcast_Shoot x1.15 (hold) | shadow_cast, shadow_impact |
| q | `warlock_unstable_affliction` | Dengesiz Azap | Unstable Affliction | cast 1.2 s (WoW 1.5) | t_proj(6) | 30 | – | **10 fragments (1 shard)** + 6 mana | on | shadow 0.3 + `unstable_affliction` 2.2 / 16 s = 2.5; each cast is its own instance (max 3 live, 12.0.0 overlap rule) | `unstable_affliction` | glow **q** at >= 1 shard when it is not live, or at 4 shards | shadow_projectile (0xa020a0), corruption_loop | Spellcast_Shoot x1.5 | curse_cast, shadow_impact |
| (replaces q) | `warlock_seed_of_corruption` | Yozlaşma Tohumu | Seed of Corruption | cast 1.6 s (WoW 2.0) | t_proj(5) | 30 | – (swaps in `aoe_mode`) | 10 fragments + 8 mana | on | seed explodes after 12 s or after taking 4 x the hit's damage: shadow 4.6 per target at 8 targets (`crowd`), r 10; applies `corruption` to everything caught | `seed` 12 s | glow **q** with >= 3 targets | shadow_projectile x1.4, curse_ring x0.8, corruption_loop | Spellcast_Shoot x1.3 | curse_cast, explosion x0.3 |
| e | `warlock_agony` | Azap | Agony | instant | t_inst | 35 | – | 5 mana; **each tick PRD 14 % (global icd 2 s): +10 fragments** | on | shadow 0.25 + `agony` DoT 2.55 / 18 s (one stack per tick, up to 8) = 2.8 | `agony` | glow **e** when `agony` < 30 % | agony_loop, curse_loop | Spellcast_Shoot x1.7 | curse_cast, shadow_impact |
| r | `warlock_corruption` | Yozlaşma | Corruption | instant | t_inst | 35 | – | 5 mana | on | shadow 0.2 + `corruption` DoT 1.6 / 14 s = 1.8 | `corruption` | glow **r** when < 30 % | corruption_loop | Spellcast_Shoot x1.6 | curse_cast |
| s1 | `warlock_haunt` | Musallat | Haunt (talent, s05) | cast 1.2 s (WoW 1.5) | t_proj(4), 20 m/s | 35 | CD 15 (reset if the target dies) | 6 mana | on | shadow 1.2 | `haunt` 18 s: the target takes **+16 %** damage from you (12.1.0) | glow **s1** when `haunt` < 3 s or ready | soul_wisp x1.5 (ghost), shadow_burst x0.5 | Spellcast_Shoot x1.3 | curse_cast, shadow_impact |
| s2 | `warlock_demonic_circle` | İblis Çemberi | Demonic Circle: Teleport | instant | tele | 14 | CD 30 | 0 | off | – | removes roots, slows | – | curse_ring, demon_portal x0.6 | Dodge_Forward x1.6 | fel_cast, blink |
| s3 | `warlock_dark_pact` | Karanlık Pakt | Dark Pact | instant | self_buff | – | CD 60 | sacrifices 20 % current HP | off | absorb 200 % of the sacrifice, 20 s | `shield`, `dark_pact` | – | shield_bubble (0x7a2a9a) | Use_Item x2.0 | curse_cast, life_leech |
| s4 | `warlock_spell_lock` | Büyü Kilidi | Spell Lock | instant | t_inst | 40 | CD 24 | 0 | off | – | interrupt, `silence` 3 s | – | interrupt_burst (0x7dff5a) | Spellcast_Shoot x1.8 | interrupt, fel_cast |
| m45 | `warlock_malevolence` | Kötülük | Malevolence | instant | self_buff + pulse | – | CD 45 (WoW 60) | 0 | off | pulse: every enemy carrying one of your DoTs takes 0.5 per DoT (<= 3: 1.5) | `malevolence` 20 s: +8 % haste, +12 % DoT damage | – | fel_aura x1.2 (follow), curse_ring pulse | Spellcast_Raise x1.8 | fel_cast, proc_gain |
| m90 | `warlock_summon_darkglare` | Karanlık Göz | Summon Darkglare | instant | self (spectral summon beside the target) | 35 | CD 90 (WoW 120) | 0 | off | 10 pulses (2 s): shadow 0.55 on **every enemy carrying your DoTs** (ST total 5.5) | `darkglare_active` 20 s: your DoTs +20 % | – | NEW:`darkglare_eye`, curse_ring | Spellcast_Summon x2.4 | demon_summon, curse_cast |
| m180 | `warlock_unending_resolve` | Bitmeyen Kararlılık | Unending Resolve | instant | self_buff | – | CD 180 | 0 | off | – | `resolve_pact` 8 s: −25 % damage taken, silence / interrupt / pushback immune | – | shield_bubble (0x5a2a7a), fel_aura | Cheer x1.6 | buff, fel_cast |

#### 10b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `agony` | Azap (existing id) | Azap cast, LMB steps 1–2 25 % | DoT with one stack per tick (max 8); each tick PRD 14 % grants a shard | 18 s | e (refresh) | own-debuff row, stacks shown |
| `corruption` | Yozlaşma (existing id) | Yozlaşma, Tohum, LMB step 4 | DoT | 14 s | r (refresh) | own-debuff row |
| `unstable_affliction` | Dengesiz Azap (existing id) | Dengesiz Azap | DoT instance (max 3) | 16 s | q | own-debuff row |
| `haunt` | Musallat | Musallat | +16 % damage taken from the caster | 18 s | s1 | own-debuff row |
| `malevolence` | Kötülük | m45 | +8 % haste, +12 % DoT damage | 20 s | – | burst banner |
| `darkglare_active` | Karanlık Göz | m90 | DoTs +20 % | 20 s | – | burst banner |
| `seed` | Yozlaşma Tohumu (existing id) | Tohum | detonation | 12 s | – | own-debuff row |
| `aoe_mode` | – | >= 3 enemies within 10 m | Dengesiz Azap becomes Yozlaşma Tohumu | hidden | q | – |
| shard fragments | Ruh Parçası | Azap tick, Gölge Oku 6 %, LMB step 4 20 %, kill (`shardOnKill`) | spent by Dengesiz Azap / Tohum (10) | – | q | pips under the mana bar |

#### 10c. APL

ST:
```
warlock_haunt if cd_ready(warlock_haunt) && (!target.status:haunt || target.remaining:haunt < 3)
warlock_agony if !target.status:agony || dot_refresh:agony
warlock_corruption if !target.status:corruption || dot_refresh:corruption
warlock_summon_darkglare if cd_ready(warlock_summon_darkglare) && target.status:agony && target.status:corruption    # off-GCD, refresh short DoTs first
warlock_malevolence if cd_ready(warlock_malevolence) && pips:shard >= 2                                            # off-GCD, save shards for it
warlock_unstable_affliction if pips:shard >= 1 && (pips:shard >= 4 || status:malevolence || status:darkglare_active || !target.status:unstable_affliction)
warlock_shadow_bolt
warlock_basic
```
AoE (>= 3 targets): `@each` evaluates the line for every enemy in turn (nearest first, `target.*` bound to that enemy).
```
warlock_haunt if cd_ready(warlock_haunt) && !target.status:haunt
warlock_agony @each if !target.status:agony
warlock_summon_darkglare if cd_ready(warlock_summon_darkglare)                                                       # off-GCD
warlock_seed_of_corruption if pips:shard >= 1 && targets >= 3                                                        # replaces Dengesiz Azap in aoe_mode
warlock_malevolence if cd_ready(warlock_malevolence)                                                                 # off-GCD
warlock_corruption @each if !target.status:corruption && !target.status:seed
warlock_shadow_bolt
warlock_basic
```

#### 10d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Gölge Oku | 19.00 | 0.95 | x1.00 | 18.1 | filler |
| Azap | 4.00 | 2.80 | x1.00 | 11.2 | 18 s DoT, stacks ramp to 8 |
| Yozlaşma | 4.00 | 1.80 | x1.00 | 7.2 | 14 s DoT |
| Dengesiz Azap | 7.00 | 2.50 | x1.00 | 17.5 | 16 s DoT, 1 shard |
| Musallat | 4.00 | 1.20 | x1.00 | 4.8 |  |
| Karanlık Göz | 0.67 | 7.00 | x1.00 | 4.7 | 5.5 + per DoT + 20 % DoT |
| Kötülük | 1.33 | 3.00 | x1.00 | 4.0 | DoT pulse + 8 % haste |
| Musallat amp (+16 % on all other rows) | 1.00 | 10.02 | x1.00 | 10.0 | +16 % damage taken |
| **TOTAL (ST)** | | | | **97.2** | target 100 ±5; GCD time 51.6 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Yozlaşma Tohumu burst (replaces Dengesiz Azap) | 3.00 | 8 | 4.60 | x1.00 | 110.4 | r 10 m, 3 shards |
| Azap (once on each of 8) | 8.00 | 1 | 2.80 | x1.00 | 22.4 |  |
| Yozlaşma (via Tohum, 8 targets, 2 refreshes) | 2.00 | 8 | 1.80 | x1.00 | 28.8 |  |
| Musallat | 2.00 | 1 | 1.20 | x1.00 | 2.4 |  |
| Karanlık Göz (DoT count) | 0.33 | 8 | 5.00 | x1.00 | 13.2 |  |
| Kötülük pulse | 0.67 | 8 | 1.50 | x1.00 | 8.0 |  |
| Gölge Oku | 6.00 | 1 | 0.95 | x1.00 | 5.7 |  |
| Musallat amp (+16 %, main target) | 1.00 | 1 | 8.00 | x1.00 | 8.0 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **213.8** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Shards (60 s, ST): in = Azap ticks 30 x 14 % x (1 per 2 s) = 4.2 + Gölge Oku 19 x 6 % = 1.1 + LMB step 4 ~0.75 + kills ~1 = **7.1 shards**; out = Dengesiz Azap 7. Mana (60 s): out = 19 x 10 + 4 x 5 + 4 x 5 + 7 x 6 + 4 x 6 = 296 vs regen 9.8 x 60 = 588: **50 %**. **Party buff:** Ruh Taşı + Sağlık Taşı.

#### 10e. What it feels like

* **A web you keep alive.** Azap's purple spiral tightens as its stacks ramp, Yozlaşma wisps rise, Dengesiz Azap swirls green-purple; icons in the own-debuff row pulse gold below 30 % ("refresh now").
* **Shard rhythm.** A wisp flies from the target to the player's pips whenever Azap ticks a shard; the Dengesiz Azap key lights at the right moment, and in a pack the same key becomes Yozlaşma Tohumu.
* **Big window.** Musallat (+16 % badge on the target) + Kötülük (a dark pulse that travels along every DoT) + Karanlık Göz (a floating eye rises behind the target and fires thin violet beams at every DoT'd enemy): the "PATLAMA!" banner appears.
* **Standout VFX/SFX.** `darkglare_eye`, the Malevolence pulse running down DoT lines, `demon_summon` + `curse_cast` layers.

---

### 11. `warlock_destruction` — Yıkım (Destruction Warlock)

**SpecDef wiring.** `stats { fireDamagePct 0.20, critChance 0.06, critDamage 0.20 }`, `specials trait_destruction { directMore 0.10 }` (the old `shardOnCrit 0.20` is replaced by the fragment rules). `skills`: `warlock_incinerate` 1, `warlock_conflagrate` 3, `warlock_immolate` 6, `warlock_shadowburn` 10 (replace-only), `warlock_rain_of_fire` 12 (kept id), `warlock_dark_pact` 15, `warlock_demonic_circle` 6, `warlock_spell_lock` 10; `treeSkills { warlock_chaos_bolt: 's05' }` (unchanged grant); majors `{ m45 warlock_malevolence, m90 warlock_summon_infernal, m180 warlock_unending_resolve }`. Spec `mods`: `M warlock_basic cv=fire:1`. Dropped: `warlock_ds_havoc`, `warlock_ds_cataclysm`, `warlock_summon_demon`, `warlock_life_tap`. Havoc and Soulfire are intentionally **not** in this kit (see open questions).

#### 11a. Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / generation | GCD | damage / heal coef + type | statuses applied / consumed | proc links | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `warlock_basic` | Kor Oku Zinciri | auto-attack | instant, 4-step chain | t_proj(5) (step 4 ground r 2.6) | 24 | – | +3 mana/hit | off | fire 0.85 / 0.85 / 2 x 0.62 / 2.02 | step 4 50 % `immolate` 6 s | – | fire_projectile x0.6, fire_burst | Spellcast_Shoot x1.3, Spellcast_Raise x2.2 (step 4) | fire_cast, fire_impact |
| rmb | `warlock_incinerate` | Kül Etme | Incinerate | cast 1.6 s (WoW 2.0) | t_proj(5), 26 m/s | 30 | – | 8 mana; **+2 fragments (+1 on crit)** | on | fire 1.00 | PRD 8 % `fiendish_cruelty` on crit (icd 6 s) | `backdraft` −30 % cast time | fire_projectile x0.9, fire_burst x0.5 | Spellcast_Shoot x1.15 (hold) | fire_cast, fire_impact |
| q | `warlock_chaos_bolt` | Kaos Oku | Chaos Bolt | cast 2.4 s (WoW 3.0) | t_proj(3), 22 m/s | 30 | – | **20 fragments (2 shards)** + 10 mana | on | fire 4.4, **always crits**, ignores 50 % fire resist; heavy (hit-stop 60, trauma 0.20) | consumes `backdraft` | `backdraft` −30 % cast time; glow **q** at >= 4 shards | fire_projectile x2.0 (0xb06bff / 0x7dff5a flicker), unstable_burst, crit_burst | Spellcast_Raise x1.0 (hold), Spellcast_Shoot | fel_cast, fire_impact, explosion x0.25 |
| (replaces q) | `warlock_shadowburn` | Gölge Yakma | Shadowburn | instant | t_inst | 30 | 2 charges, 12 s recharge | 10 fragments + 4 mana | on | shadow 4.0; kill within 5 s: +10 fragments and +1 charge | consumes `fiendish_cruelty` | glow **q** on `exec_window` (target < 20 %) or `fiendish_cruelty` | shadow_burst x1.2 (0xff5a2a), crit_burst | Spellcast_Shoot x1.8 | shadow_cast, shadow_impact |
| e | `warlock_conflagrate` | Alevlendirme | Conflagrate | instant | t_inst | 30 | **2 charges, 13 s recharge** | 0; **+5 fragments** | on | fire 1.5 | grants `backdraft` x2 (12 s) | glow **e** at 2 charges | fire_burst x0.8, hit_spark | Spellcast_Shoot x1.8 | fire_cast, fire_impact |
| r | `warlock_immolate` | Yakıp Yıkma | Immolate | instant | t_inst | 35 | – | 6 mana | on | fire 0.15 + `immolate` DoT 2.05 / 18 s = 2.2; each tick PRD 12 %: +1 fragment | `immolate` | glow **r** when < 30 % | burn_loop, fire_burst x0.4 | Spellcast_Shoot x1.6 | fire_cast |
| s1 | `warlock_rain_of_fire` | Ateş Yağmuru | Rain of Fire | instant | ground r 6 | 35 | – | **30 fragments (3 shards)** | on | 8 ticks x 1.0 = 8.0 per target at 8 targets (`crowd`), 8 s | `burn` | glow **s1** at >= 3 shards with >= 3 targets | fire_rain x1.6, fire_ground | Spellcast_Raise x1.6 | fire_cast, explosion x0.3 |
| s2 | `warlock_demonic_circle` | İblis Çemberi | Demonic Circle: Teleport | instant | tele | 14 | CD 30 | 0 | off | – | removes roots, slows | – | curse_ring, demon_portal x0.6 | Dodge_Forward x1.6 | fel_cast, blink |
| s3 | `warlock_dark_pact` | Karanlık Pakt | Dark Pact | instant | self_buff | – | CD 60 | sacrifices 20 % current HP | off | absorb 200 % of the sacrifice, 20 s | `shield`, `dark_pact` | – | shield_bubble (0x7a2a9a) | Use_Item x2.0 | curse_cast, life_leech |
| s4 | `warlock_spell_lock` | Büyü Kilidi | Spell Lock | instant | t_inst | 40 | CD 24 | 0 | off | – | interrupt, `silence` 3 s | – | interrupt_burst (0x7dff5a) | Spellcast_Shoot x1.8 | interrupt, fel_cast |
| m45 | `warlock_malevolence` | Kötülük | Malevolence | instant | self_buff + pulse | – | CD 45 (WoW 60) | 0 | off | pulse 0.5 per DoT on each affected enemy (1.0 with Immolate + burn) ; **+8 % haste, +12 % DoT damage, 20 s** | `malevolence` | – | fel_aura x1.2 (follow), curse_ring pulse | Spellcast_Raise x1.8 | fel_cast, proc_gain |
| m90 | `warlock_summon_infernal` | Cehennem Muhafızı | Summon Infernal | instant | ground at the target (else the aim), spectral summon | 35 | CD 90 (WoW 120 / 90 with Inferno) | 0; generates 1 fragment per second for 30 s | off | landing fire 2.0 r 4 + `stun` 2 s (boss immune); 30 pulses of fire 0.2 r 6 (ST total 8.0) | `stun` | – | infernal_fall, shockwave, fire_burst x1.2 | Spellcast_Raise x1.6 | explosion, demon_summon |
| m180 | `warlock_unending_resolve` | Bitmeyen Kararlılık | Unending Resolve | instant | self_buff | – | CD 180 | 0 | off | – | `resolve_pact` 8 s | – | shield_bubble (0x5a2a7a), fel_aura | Cheer x1.6 | buff, fel_cast |

#### 11b. Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side |
|---|---|---|---|---|---|---|
| `backdraft` | Dönüş Alevi | Alevlendirme cast (2 stacks) | next 2 Kaos Oku / Kül Etme: cast time −30 % | 12 s | q | left, red-orange |
| `immolate` | Yakıp Yıkma (existing id) | Yakıp Yıkma, LMB step 4 | DoT; ticks can grant fragments | 18 s | r (refresh) | own-debuff row |
| `fiendish_cruelty` | Şeytani Zalimlik | Kül Etme crit, PRD 8 % (icd 6 s) | Kaos Oku becomes Gölge Yakma at any HP | 10 s | q | top, dark red |
| `exec_window` | – | target < 20 % HP (watcher) | Kaos Oku becomes Gölge Yakma | hidden | q | – |
| `malevolence` | Kötülük | m45 | +8 % haste, +12 % DoT damage | 20 s | – | burst banner |
| shard fragments | Ruh Parçası | Kül Etme +2 (+1 crit), Alevlendirme +5, Yakıp Yıkma tick 12 % +1, Muhafız +1/s, Gölge Yakma kill +10 | spent by Kaos Oku (20), Gölge Yakma (10), Ateş Yağmuru (30) | – | q, s1 | pips under the mana bar |

#### 11c. APL

ST:
```
warlock_summon_infernal if cd_ready(warlock_summon_infernal)                                               # off-GCD
warlock_malevolence if cd_ready(warlock_malevolence) && pips:shard >= 3                                    # off-GCD, spenders go inside it
warlock_immolate if !target.status:immolate || dot_refresh:immolate
warlock_shadowburn if status:exec_window || status:fiendish_cruelty
warlock_chaos_bolt if pips:shard >= 4 || (status:malevolence && pips:shard >= 2)
warlock_conflagrate if charges >= 2 || (charges >= 1 && !status:backdraft)
warlock_chaos_bolt if pips:shard >= 2 && status:backdraft
warlock_incinerate
warlock_basic
```
AoE (>= 3 targets):
```
warlock_summon_infernal if cd_ready(warlock_summon_infernal)
warlock_malevolence if cd_ready(warlock_malevolence)
warlock_immolate @each if !target.status:immolate
warlock_rain_of_fire if pips:shard >= 3 && targets >= 3
warlock_conflagrate if charges >= 1
warlock_incinerate
warlock_basic
```

#### 11d. Budget hand calculation

**Single target (Patchwerk), 60 s:**

| Ability | casts / 60 s | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---|
| LMB chain | 6.0 s x 3.3/s | - | - | 19.8 | 3.3 coef/s, 6 s of every 60 s |
| Kül Etme | 21.00 | 1.00 | x1.00 | 21.0 | 2.2 fragments |
| Alevlendirme | 5.00 | 1.50 | x1.00 | 7.5 | 2 charges / 13 s, +5 fragments |
| Kaos Oku | 4.50 | 4.40 | x1.42 | 28.1 | 2 shards, always crits (x1.42 vs avg crit) |
| Yakıp Yıkma | 3.30 | 2.20 | x1.00 | 7.3 | 18 s DoT |
| Gölge Yakma | 0.50 | 4.00 | x1.00 | 2.0 | Fiendish Cruelty / below 20 % |
| Cehennem Muhafızı | 0.67 | 8.00 | x1.00 | 5.3 | 30 s guardian + landing |
| Kötülük | 1.33 | 3.50 | x1.00 | 4.7 | DoT pulse + 8 % haste |
| **TOTAL (ST)** | | | | **95.7** | target 100 ±5; GCD time 53.2 s / 54 s |

**AoE8 (8 targets, 30 s pull):**

| Ability | casts / 30 s | targets hit | coef | avg mult | total | note |
|---|---:|---:|---:|---:|---:|---|
| LMB chain | 3 s x 3.3/s x 1.5 splash | - | - | - | 14.8 | |
| Ateş Yağmuru | 2.00 | 8 | 8.00 | x1.00 | 128.0 | 8 s, 8 ticks x 1.0 |
| Alevlendirme | 3.00 | 1 | 1.50 | x1.00 | 4.5 |  |
| Kül Etme (main + 40 % cleave on 2) | 9.00 | 1 | 1.80 | x1.00 | 16.2 |  |
| Yakıp Yıkma on each of 8 (@each) | 8.00 | 1 | 2.20 | x1.00 | 17.6 | 18 s DoT |
| Cehennem Muhafızı (landing + pulses) | 0.33 | 8 | 8.00 | x1.00 | 21.1 | 2.0 landing + 30 pulses x 0.2, all 8 stay in r 6 |
| Kötülük pulse | 0.67 | 8 | 1.20 | x1.00 | 6.4 |  |
| **TOTAL (AoE8, 30 s)** | | | | | **208.7** | target 225 ±25 (= 4.5 x the 30 s ST total of 50) |

Fragments (60 s, ST): in = Kül Etme 21 x 2.2 = 46 + Alevlendirme 5 x 5 = 25 + Yakıp Yıkma ticks 3.3 x 9 x 12 % = 3.6 + Muhafız 0.67 x 30 = 20 = **94.6**; out = Kaos Oku 4.5 x 20 = 90 + Gölge Yakma 0.5 x 10 = 5 = 95. AoE (30 s): in = 9 x 2.2 + 3 x 5 + 8 targets x 13 ticks x 12 % = 12.5 + Muhafız 10 = ~57, out = Ateş Yağmuru 2 x 30 = 60. Mana (60 s): out = 21 x 8 + 4.5 x 10 + 3.3 x 6 + 2 = 235 vs regen 588: **40 %**. **Party buff:** Ruh Taşı + Sağlık Taşı.

#### 11e. What it feels like

* **Heavy payoffs.** Fragments climb as Kül Etme / Alevlendirme land (pips fill from the bottom); Kaos Oku is the biggest single hit in the game: a purple-green flickering sphere, 60 ms hit-stop, 0.20 trauma, a guaranteed crit burst and a huge number.
* **Alevlendirme dance.** Two charges recharge in a visible pair; each cast flares the left red-orange Dönüş Alevi overlay, which makes the next two casts faster.
* **Execute.** Below 20 % HP (or on Şeytani Zalimlik) the same key becomes Gölge Yakma: a dark-red instant burst, and a kill refunds the charge and a shard.
* **Windows.** Kötülük pulses every DoT, then Cehennem Muhafızı crashes down (shockwave, stun ring, 30 s of fire pulses). Ateş Yağmuru in packs is the shard dump.
* **Standout VFX/SFX.** Kaos Oku flicker colours, `infernal_fall` + `shockwave` landing, `explosion` layer x0.25 on every Kaos Oku.

---

## Part C — Group-level sections

### f. Skill-id and talent-node migration

#### f.1 Skill ids

Legend: **kept** = same id, retuned; **renamed** = new id for the same ability; **dropped** = stays defined (`unlockLevel 99`, no slot, no tree grant) so old saves and `tools/talents-check.mjs` still resolve it. "(planned)" = id that exists only in design docs (COMBAT_WOW CW-10, GDD_CLASSES_V2 §6), never in code.

**Büyücü**

| old id | status | new role | retune summary |
|---|---|---|---|
| `mage_basic`, `_1`–`_3` | kept | lmb, all specs | `target_projectile`; spec `mods` rename Ateş / Buz Oku |
| `mage_fireball` | kept | Ateş rmb | instant 12 mana -> cast 1.4 s, 8 mana; coef 2.3 -> 0.92 + Ignite 0.25; `explode` 2.5 m stays but at 30 % splash on max 2 |
| `mage_frost_nova` | kept | Buz r (Ateş / Gizem: class `s05` B pick) | CD 9 -> 30, root 3 s, +2 Freezing |
| `mage_blink` | kept | s2, all | Shimmer: range 10 -> 20, CD 5 -> 30, cost 10 -> 0, off-GCD |
| `mage_meteor` | kept | Ateş m45 (granted by spec `s05`) | CD 8 -> 45, instant, lands 2.4 s, coef 5.0 -> 3.8 + 1.6 ground |
| `mage_blizzard` | kept | Buz s1 | channel 5 s -> cast 1.6 s, 8 s zone, CD 15 |
| `mage_arcane_orb` | kept | Gizem r | CD 4 -> 20, cost 25 -> 12, gives charges |
| `mage_mana_barrier` | **dropped** | – | replaced by `mage_prismatic_barrier` / `mage_blazing_barrier` / `mage_ice_barrier` (tag `shield`) |
| `mage_arcane_cataclysm` | **dropped** | – | the ultimate has no WoW counterpart in these specs |
| `mage_phoenix_flames` | **dropped** | – | Phoenix Flames was removed in Midnight; replaced by `mage_fire_blast` |
| `mage_blazing_barrier` | kept | Ateş s3 | slot m45 -> s3, CD 45 -> 30, 2 charges, 10 s -> 60 s |
| `mage_flurry` | kept | Buz e | `burst_shot` projectile -> `target_instant` 3 hits; CD 10 -> 2 charges / 30 s |
| `mage_frozen_orb` | kept | Buz m90 | follows its target, 8 s, 12 pulses; CD 90 |
| `mage_arcane_blast` | kept | Gizem rmb | cast 0.9 -> 1.8, cost 18 -> 9, coef 2.4 -> 1.2 |
| `mage_arcane_barrage` | kept | Gizem e | slot q -> e, CD 3 -> 0, consumes Salvo and charges |
| `mage_touch_of_magi` | kept | Gizem m45 | 25 % / 8 s -> 20 % / 12 s, `target_instant`, +4 charges |
| `mage_arcane_surge` | kept | Gizem m90 | 12 s +30 % -> 15 s +35 %, cast 2.0 s, spends all mana |
| `mage_counterspell` | kept | s4 baseline | CD 20 -> 25, range 40, no longer a tree grant |
| `mage_ice_block` | kept (benched) | class `s05` A pick | unchanged |
| `mage_flame_wave` (planned) | **dropped** | – | replaced by `mage_flamestrike` |
| `mage_ice_lance` (planned) | kept, implemented | Buz q | see 4a |
| `mage_icy_veins` (planned) | **dropped** | – | not in the Midnight Frost kit; `mage_ray_of_frost` takes m45 |
| `mage_combustion`, `mage_time_warp` (planned) | kept, implemented | Ateş m90 / m180 all | see 3a, A.1 |
| new | – | – | `mage_pyroblast`, `mage_fire_blast`, `mage_scorch`, `mage_flamestrike`, `mage_frostbolt`, `mage_glacial_spike`, `mage_comet_storm`, `mage_ray_of_frost`, `mage_ice_barrier`, `mage_arcane_missiles`, `mage_arcane_pulse`, `mage_prismatic_bolt`, `mage_prismatic_barrier` |
| status `winters_chill` (planned CW-03) | **dropped** | – | `freezing` replaces it |

**Haydut**

| old id | status | new role | retune summary |
|---|---|---|---|
| `rogue_basic`, `_1`–`_4` | kept | lmb, Suikastçı + Gölge | +3 energy per hit, combo point only on steps 2 and 4 |
| `rogue_crossbow_shot` | **dropped** | – | no ranged builder in these specs; replaced by `rogue_mutilate` (Suikastçı) / `rogue_backstab` (Gölge) |
| `rogue_shadow_step` | kept | s2, all three | cost 20 -> 0, CD 9 -> 30, range 15 -> 25, ally or enemy, fail rules, no `ambush` crit, +70 % move |
| `rogue_fan_of_knives` | kept | Suikastçı s1 | slot e -> s1, CD 4 -> 0, cost 30 -> 20, +1 CP per target (cap 3 -> 5), +poison |
| `rogue_eviscerate` | kept | Gölge q | cost 30 -> 20, 6 CP, new finisher formula |
| `rogue_smoke_bomb` | **renamed** `rogue_vanish` | m180 (Suikastçı, Gölge) | ground smoke zone -> 3 s self stealth, CD 18 -> 180 |
| `rogue_bolt_rain` | **dropped** | – | not a rogue ability |
| `rogue_deadly_venom` | **dropped** | – | Deadly Poison is now a baseline passive of Suikastçı |
| `rogue_death_blossom` | **dropped** | – | the ultimate is replaced by Gizli Teknik / Kral Belası |
| `rogue_backstab` | kept | Gölge rmb | spec `rogue_assassin` -> `rogue_subtlety`; cost 25 -> 16; x2 / +3 CP behind -> +20 % dmg, +15 % crit, +1 CP |
| `rogue_garrote` | kept | Suikastçı e | bleed 8 -> 18 s, CD 14 -> 6, silence only from stealth, +1 CP |
| `rogue_vial_throw` | kept | Simyacı lmb | feeds Simya Bağı |
| `rogue_vial_heal` | kept | Simyacı r | Radiance analogue: cast 1.6 s, applies Simya Bağı |
| `rogue_antidote` | kept | Simyacı s4 | utility slot |
| `rogue_smoke_ward` | kept | Simyacı s3 | CD 20 -> 30, DR 20 -> 15 % |
| `rogue_mending_draught` | kept | Simyacı s1 | applies Simya Bağı |
| `rogue_shadow_blades` | kept | Gölge m90 | spec change, slot m45 -> m90, CD 45 -> 90, −30 % cost removed |
| `rogue_shadow_dance` | kept | Gölge e | spec change, slot m90 -> e, CD 90 -> 20, 8 s -> 6 s, no Gölge Adımı reset |
| `rogue_elixir_of_life`, `rogue_miracle_brew` | kept | Simyacı m45 / m90 | grants Simya Bağı / unchanged |
| `rogue_haste_elixir` | **dropped** | – | Haydut is not in the Heroism family (CM §3); `rogue_ascendant_brew` takes m180 |
| `rogue_kick` | kept | s4 baseline | CD 12 -> 15, cost 10 -> 0 |
| `rogue_cloak_of_shadows` | kept (benched) | class `s05` A pick | unchanged |
| new | – | – | `rogue_mutilate`, `rogue_envenom`, `rogue_rupture`, `rogue_crimson_tempest`, `rogue_deathmark`, `rogue_kingsbane`, `rogue_feint`, `rogue_thistle_tea` (benched, class `s05` B pick: +50 energy, 3 charges, CD 60), `rogue_shadowstrike`, `rogue_secret_technique`, `rogue_shuriken_storm`, `rogue_black_powder`, `rogue_goremaws_bite`, `rogue_acid_flask`, `rogue_bubbling_brew`, `rogue_ward_potion`, `rogue_ascendant_brew` |
| `opportunity` proc (planned CW-03/11) | **dropped** | – | belonged to the crossbow |
| SpecId | **added** | `rogue_subtlety` | `data/classes.ts` rogue `specs`, `types/v2.ts`, `talentTrees/index.ts` `SPEC_TABLE` (appended as index 21 so existing export strings stay valid) |

**Warlock** (design-only ids, except `warlock_spell_lock` and `warlock_unending_resolve`, which are coded in `skills_class_utils.ts`)

| design id (GDD_CLASSES_V2 §6) | status | new role | retune summary |
|---|---|---|---|
| `warlock_basic`, `_1`–`_4` | kept | lmb | as §6.3, fire flavour for Yıkım |
| `warlock_shadow_bolt` | kept | Azap rmb | instant 2.2 -> cast 1.6 s, coef 0.95, 10 mana, PRD 6 % shard |
| `warlock_corruption` | kept | Azap r | instant DoT, 14 s, route bonus (+30 %) is removed |
| `warlock_agony` | kept | Azap e | stacks ramp per tick, 18 s, shard chance on tick |
| `warlock_summon_demon` | **dropped** | – | pets are not in the base kit (spectral summons only) |
| `warlock_drain_life` | kept (benched) | class `s05` A pick | unchanged |
| `warlock_rain_of_fire` | kept | Yıkım s1 | channel -> instant ground, 3 shards, 8 s |
| `warlock_life_tap` | **dropped** | – | replaced by `warlock_dark_pact` |
| `warlock_summon_infernal` | kept | Yıkım m90 | 60 s -> 90 s, `spectral_summon` |
| `warlock_unstable_affliction` | kept | Azap q | 1 shard, 16 s, overlap allowed, no burst |
| `warlock_seed_of_corruption` | kept | Azap (replaces q in `aoe_mode`) | 10 fragments, 12 s fuse |
| `warlock_immolate` | kept | Yıkım r | 18 s DoT, fragment ticks |
| `warlock_chaos_bolt` | kept | Yıkım q (granted by spec `s05`) | cast 1.2 -> 2.4, 2 shards, always crits |
| `warlock_af_dark_soul` | **dropped** | – | removed in WoW; `warlock_malevolence` takes m45 |
| `warlock_af_pandemic` | **dropped** | – | replaced by `warlock_summon_darkglare` (m90) |
| `warlock_ds_havoc` | **dropped** | – | not in the Midnight Destruction priority; Malevolence takes m45 |
| `warlock_ds_cataclysm` | **dropped** | – | replaced by `warlock_summon_infernal` as the Yıkım burst |
| `warlock_spell_lock`, `warlock_unending_resolve` | kept | s4 / m180 baseline | no longer class `s05` grants; Büyü Kilidi range 30 -> 40, cost 10 -> 0; Bitmeyen Kararlılık CD 60 -> 180, `ccImmune` -> silence / interrupt / pushback immunity, DR 30 -> 25 % |
| new | – | – | `warlock_haunt`, `warlock_malevolence`, `warlock_summon_darkglare`, `warlock_dark_pact`, `warlock_demonic_circle`, `warlock_incinerate`, `warlock_conflagrate`, `warlock_shadowburn`, `warlock_mortal_coil` (benched, class `s05` B pick: heals 20 % max HP + 3 s horror, CD 45) |
| statuses | – | – | `soul_misery`, `havoc` stay in the `StatusId` union but are unused (dropped); `agony`, `corruption`, `unstable_affliction`, `immolate`, `seed` need `StatusDef`s |

#### f.2 Talent nodes that reference a changed or dropped id

Node = `<tree id>#<slot><option>` from `docs/GDD_TALENTS.trees.json` (tree ids as in `data/talentTrees/index.ts`). "req" = required for `tools/talents-check.mjs` to keep the node meaningful; "rec" = recommended (the node would otherwise only act on one spec). All new fx strings use only ops, triggers and tags the parser accepts (`FX_TAGS` has `shield`, `aoe`, `major`, `summon`). **Edit the JSON and regenerate** (`node tools/gen-talent-data.mjs`); `src/data/talentTrees/raw/*.ts` is generated.

**`class:mage`**

| node | old fx | new fx | |
|---|---|---|---|
| #s05A | `G mage_counterspell` | `G mage_ice_block` | req (Counterspell is baseline) |
| #s05B | `G mage_ice_block` | `G mage_frost_nova` | req |
| #s21 Kadim Kalkan | `M mage_mana_barrier absx=1.25 cd=-3` | `M @shield absx=1.25 cd=-3` | req |
| #s25 Kıyamet Çağrısı -> "Gök Çağrısı" | `M mage_arcane_cataclysm cdx=.85 p.strikes+=3` | `M mage_meteor+mage_arcane_orb+mage_frozen_orb cdx=.85` | req |
| #s26B Koruyucu Büyücü | `T cast:mage_mana_barrier => st(near(10),fortify,4)` | `T cast:@shield => st(near(10),fortify,4)` | req |
| #s30B Arkanist | `S arcaneDamagePct=.25 ;; M mage_arcane_cataclysm dmgx=1.25` | `S arcaneDamagePct=.25 ;; M mage_arcane_barrage dmgx=1.25` | req |
| #s11 | `M mage_frost_nova cd=-1.5 radx=1.1` | `M mage_frost_nova+mage_arcane_pulse cd=-1.5 radx=1.1` | rec |
| #s12 | `M mage_meteor cd=-1.5 dmgx=1.1` | `M mage_meteor+mage_comet_storm cd=-1.5 dmgx=1.1` | rec |
| #s13 Geniş Kar Fırtınası -> "Geniş Büyü Alanı" | `M mage_blizzard radx=1.2 costx=.85` | `M mage_blizzard+mage_flamestrike+mage_arcane_pulse radx=1.2 costx=.85` | rec |
| #s18 | `M mage_arcane_orb cd=-1.5 dmgx=1.2` | `M mage_arcane_orb+mage_frozen_orb cd=-1.5 dmgx=1.2` | rec |
| #s27 Gök Taşı Yağmuru -> "Alan Ustalığı" | `M mage_meteor+mage_blizzard dmgx=1.15 radx=1.1` | `M @aoe dmgx=1.15 radx=1.1` | rec |

**`spec:mage_fire`**

| node | old fx | new fx | |
|---|---|---|---|
| #s04 Kızgın Dalga -> "Kızgın Sütun" | `M mage_flame_wave dmgx=1.15 dotx=1.3` | `M mage_flamestrike dmgx=1.15 dotx=1.3` | req |
| #s05 | `G mage_phoenix_flames` | `G mage_meteor` | req |
| #s11 Yayılan Anka -> "Yayılan Alev" | `M mage_phoenix_flames p.bounces+=1 p.bounceMult*=1.06` | `M mage_fire_blast p.spread+=1 p.spreadMult*=1.06` | req |
| #s12 Kızıl Düşüş | `M mage_meteor cd=-2 castx=.5` | `M mage_meteor cd=-3` (cast is instant now) | rec |
| #s18 Kızıl Dalga -> "Kızıl Patlama" | `M mage_flame_wave chg=+1 cdx=1.2` | `M mage_fire_blast chg=+1 cdx=1.2` | req |
| #s21 Yangın Çağrısı | `M mage_phoenix_flames cd=-2` | `M mage_fire_blast cd=-2` | req |
| #s27 Kıyamet Kıvılcımı -> "Alev Kıvılcımı" | `M mage_arcane_cataclysm dmgx=1.15 st=burn:4:.5` | `M mage_flamestrike dmgx=1.15 st=burn:4:.5` | req |
| #s29 Kor Kasırgası | `T cast:mage_meteor if=sst:hot_streak => buff(ember_haste,3,{castSpeed=.15})` | `T cast:mage_pyroblast if=sst:hot_streak => buff(ember_haste,3,{castSpeed=.15})` | rec |
| #s30A Anka Efendisi -> "Ateş Efendisi" | `S fireDamagePct=.25 ;; M mage_phoenix_flames dmgx=1.25` | `S fireDamagePct=.25 ;; M mage_fire_blast+mage_pyroblast dmgx=1.25` | req |

**`spec:mage_frost`**

| node | old fx | new fx | |
|---|---|---|---|
| #s05 | `G mage_flurry` | `G mage_glacial_spike` | req |
| #s11 Parçalayıcı Mızrak | `T cast:mage_ice_lance if=tst:freeze => exp(.8,3,frost)` | `T cast:mage_ice_lance if=tst:freezing => exp(.8,3,frost)` | req |
| #s15A Damar Ustası -> "Işın Ustası" | `M mage_icy_veins sdur=icy_veins:+4` | `M mage_ray_of_frost dur=+1` | req |
| #s20 Kış Büyücüsü | `M mage_icy_veins+mage_frozen_orb cdx=.9` | `M mage_ray_of_frost+mage_frozen_orb cdx=.9` | req |
| #s27 Kıyamet Soğuğu -> "Kuyruklu Soğuk" | `M mage_arcane_cataclysm dmgx=1.15 st=chill:4:1` | `M mage_comet_storm dmgx=1.15 st=chill:4:1` | req |
| #s30B Kış Kralı | `S castSpeed=.08 ccDurationPct=.15 ;; M mage_icy_veins cdx=.8` | `S castSpeed=.08 ccDurationPct=.15 ;; M mage_ray_of_frost cdx=.8` | req |

**`spec:mage_arcane`**

| node | old fx | new fx | |
|---|---|---|---|
| #s05 | `G mage_arcane_barrage` | `G mage_prismatic_bolt` | req |
| #s11 Hızlı Baraj | `M mage_arcane_barrage cd=-1 radx=1.2` | `M mage_arcane_barrage dmgx=1.1 radx=1.2` (Baraj has no CD) | rec |
| #s13 Gizem Zırhı | `T cast:mage_mana_barrier => pip(arcane,1)` | `T cast:mage_prismatic_barrier => pip(arcane,1)` | req |
| #s21 Yüklü Kıyamet -> "Yüklü Füzeler" | `T cast:mage_arcane_cataclysm => pip(arcane,2)` | `T cast:mage_arcane_missiles => pip(arcane,1)` | req |
| #s25 Gizem Siperi | `M mage_mana_barrier absx=1.25 ;; T cast:mage_mana_barrier => buff(barrier_arcane,8,{arcaneDamagePct=.1})` | `M mage_prismatic_barrier absx=1.25 ;; T cast:mage_prismatic_barrier => buff(barrier_arcane,8,{arcaneDamagePct=.1})` | req |

**`class:rogue`**

| node | old fx | new fx | |
|---|---|---|---|
| #s04 Keskin Arbalet -> "Keskin Hançer" | `M rogue_crossbow_shot dmgx=1.15 prc=+1` | `M rogue_mutilate+rogue_backstab dmgx=1.15` | req |
| #s05A | `G rogue_kick` | `G rogue_cloak_of_shadows` | req |
| #s05B | `G rogue_cloak_of_shadows` | `G rogue_thistle_tea` | req |
| #s11 Hızlı Yelpaze -> "Geniş Yelpaze" | `M rogue_fan_of_knives cd=-1.5 dotx=1.25` | `M rogue_fan_of_knives+rogue_shuriken_storm radx=1.2 dmgx=1.1` | req (the CD is 0 now) |
| #s12 İnfaz Ustası | `M rogue_eviscerate dmgx=1.15 stgx=1.1` | `M rogue_eviscerate+rogue_envenom dmgx=1.15 stgx=1.1` | rec |
| #s13 Duman Ustası -> "Kaybolma Ustası" | `M rogue_smoke_bomb cd=-3 radx=1.2` | `M rogue_vanish cd=-12` | req |
| #s18 Kara Bulut | `M rogue_bolt_rain cd=-3 rad=+1` | `M rogue_crimson_tempest+rogue_black_powder rad=+1 dmgx=1.1` | req |
| #s25 Yoğun Zehir -> "Yoğun Kanama" | `M rogue_deadly_venom sdur=venom:+4 dmgx=1.25` | `M rogue_kingsbane+rogue_goremaws_bite dmgx=1.25` | req |
| #s26A Gölge Ortağı | `T cast:rogue_smoke_bomb => st(near(8),haste,4)` | `T cast:rogue_vanish => st(near(8),haste,4)` | req |
| #s26B Çalıntı Şans | `T cast:rogue_deadly_venom => resp(.2)` | `T cast:@major icd=20 => resp(.2)` | req |
| #s27 Dans Zinciri | `M rogue_death_blossom cdx=.85 dmgx=1.1` | `M rogue_secret_technique+rogue_kingsbane cdx=.85 dmgx=1.1` | req |
| #s30B Zehir Kralı | `S poisonDamagePct=.25 dotPct=.10 ;; M rogue_deadly_venom dmgx=1.2` | `S poisonDamagePct=.25 dotPct=.10 ;; M rogue_envenom+rogue_kingsbane dmgx=1.2` | req |

**`spec:rogue_assassin`** (the old rows are mostly a Subtlety tree, see the next block; the Suikastçı tree is re-targeted to its own kit)

| node | old fx | new fx |
|---|---|---|
| #s02A Arkadan Hasat | `M rogue_backstab dmgx=1.15 pip=combo:1` | `M rogue_mutilate dmgx=1.15 pip=combo:1` |
| #s04 Keskin Sırt | `M rogue_backstab costx=.9 rng=+0.4` | `M rogue_mutilate costx=.9 rng=+0.4` |
| #s05 | `G rogue_garrote` | `G rogue_kingsbane` |
| #s09B Kan Dansı | `T hit:rogue_backstab ch=.3 if=tst:bleed => dmg(.8,physical)` | `T hit:rogue_mutilate ch=.3 if=tst:bleed => dmg(.8,physical)` |
| #s11 Gölge Biçer | `T cast:rogue_eviscerate if=pips>=5:combo ch=.2 => pip(combo,2)` | `T cast:rogue_envenom if=pips>=5:combo ch=.2 => pip(combo,2)` |
| #s12 Garrote Zehri | `M rogue_garrote dotx=1.4 sdur=bleed:+2` | `M rogue_garrote dotx=1.4 sdur=garrote:+2` |
| #s15A Bıçak Ustası -> "Mühür Ustası" | `M rogue_shadow_blades sdur=shadow_blades:+4` | `M rogue_deathmark sdur=deathmark:+4` |
| #s15B Karanlık Dans -> "Karanlık Pelerin" | `M rogue_shadow_dance sdur=shadow_veil_cd:+2` | `M rogue_vanish sdur=stealth:+2` |
| #s20 Gecenin Katili | `M rogue_shadow_blades+rogue_shadow_dance cdx=.9` | `M rogue_deathmark+rogue_vanish cdx=.9` |
| #s21 Gölge Çiçeği -> "Kanlı Çiçek" | `M rogue_death_blossom cd=-8 dmgx=1.2` | `M rogue_kingsbane cd=-6 dmgx=1.2` |
| #s26A Gölge Ortağı | `T cast:rogue_shadow_dance => st(near(10),haste,4)` | `T cast:rogue_deathmark => st(near(10),haste,4)` |
| #s27 Ölümcül Ritim | `T cast:rogue_eviscerate if=sst:shadow_blades ch=.3 => echo(rogue_eviscerate,.6,.3)` | `T cast:rogue_envenom if=tst:deathmark ch=.3 => echo(rogue_envenom,.6,.3)` |
| #s28 Gölge Hasadı | `S critDamage=.20 ;; T cast:rogue_eviscerate if=pips>=5:combo => st(self,stealth,2)` | `S critDamage=.20 ;; T cast:rogue_envenom if=pips>=5:combo => st(self,stealth,2)` |
| #s30A Gece Efendisi | `S critChance=.03 critDamage=.20 ;; M rogue_backstab dmgx=1.25` | `S critChance=.03 critDamage=.20 ;; M rogue_mutilate dmgx=1.25` |
| #s30B Gölge Hükümdarı | `S physicalDamagePct=.20 ;; M rogue_eviscerate dmgx=1.3 ;; M rogue_shadow_step chg=+1` | `S physicalDamagePct=.20 ;; M rogue_envenom dmgx=1.3 ;; M rogue_shadow_step chg=+1` |

**`spec:rogue_subtlety` (new tree)** = the **old `spec:rogue_assassin` rows copied unchanged** (they already target `rogue_backstab`, `rogue_eviscerate`, `rogue_shadow_blades`, `rogue_shadow_dance`, `rogue_shadow_step`), except:

| node | old fx | new fx |
|---|---|---|
| #s05 | `G rogue_garrote` | `G rogue_secret_technique` |
| #s09A Susturucu | `M rogue_garrote cd=-2 sdur=silence:+1.5` | `M rogue_kick cd=-3 sdur=silence:+1.5` |
| #s11 Gölge Biçer | `... if=pips>=5:combo ...` | `... if=pips>=6:combo ...` (max 6 points) |
| #s12 Garrote Zehri -> "Isırık Zehri" | `M rogue_garrote dotx=1.4 sdur=bleed:+2` | `M rogue_goremaws_bite dotx=1.4 sdur=bleed:+2` |
| #s21 Gölge Çiçeği -> "Klon Çiçeği" | `M rogue_death_blossom cd=-8 dmgx=1.2` | `M rogue_secret_technique cd=-5 dmgx=1.2` |
| #s25 Zehirli Gölge -> "Keskin Gölge" | `M rogue_fan_of_knives crit=+.15 dotx=1.3` | `M rogue_shuriken_storm crit=+.15 dmgx=1.3` |
| #s28 Gölge Hasadı | `... if=pips>=5:combo ...` | `... if=pips>=6:combo ...` |

**`spec:rogue_alchemist`**

| node | old fx | new fx |
|---|---|---|
| #s26A Grup İksiri | `T cast:rogue_haste_elixir => st(party,regen,6)` | `T cast:rogue_ascendant_brew => st(party,regen,6)` |
| #s27 Hızlandırıcı Usta -> "Yüce Usta" | `M rogue_haste_elixir sdur=hero_haste:+8` | `M rogue_ascendant_brew dur=+1.5` |

**`class:warlock`**

| node | old fx | new fx | |
|---|---|---|---|
| #s05A | `G warlock_spell_lock` | `G warlock_drain_life` | req (Büyü Kilidi is baseline) |
| #s05B | `G warlock_unending_resolve` | `G warlock_mortal_coil` | req |
| #s09A Can Bağı | `T cast:warlock_life_tap => buff(life_pact,6,{damageReductionPct=.1})` | `T cast:warlock_dark_pact => buff(life_pact,6,{damageReductionPct=.1})` | req |
| #s13 İblis Çağrısı -> "Çağrı Ustası" | `M warlock_summon_demon cd=-2 ;; S minionHpPct=.10` | `M warlock_summon_darkglare+warlock_summon_infernal cd=-4 ;; S minionHpPct=.10` | req |
| #s17B Kan Pakti | `M warlock_life_tap costx=.67 p.manaFlat*=1.5` | `M warlock_dark_pact cd=-12 p.absorbMult*=1.5` | req |
| #s25 Kadim Dönüşüm -> "Kadim Çember" | `M warlock_life_tap cd=-3 costx=.8` | `M warlock_demonic_circle cd=-6` | req |
| #s26A Karanlık Ordu | `T cast:warlock_summon_infernal => st(party,empower,8)` | `T cast:@summon => st(party,empower,8)` | req |
| #s26B Koruyucu Sözleşme | `T cast:warlock_life_tap => st(near(10),fortify,4)` | `T cast:warlock_dark_pact => st(near(10),fortify,4)` | req |
| #s27 Muhafız Efendisi | `M warlock_summon_infernal cdx=.85 dmgx=1.2` | `M warlock_summon_infernal+warlock_summon_darkglare cdx=.85 dmgx=1.2` | req |
| #s30B Şeytan Efendisi | `S minionDamagePct=.25 minionHpPct=.20 ;; M warlock_summon_demon cdx=.7` | `S minionDamagePct=.25 minionHpPct=.20 ;; M warlock_summon_infernal+warlock_summon_darkglare cdx=.8` | req |

**`spec:warlock_affliction`**

| node | old fx | new fx |
|---|---|---|
| #s05 | `G warlock_seed_of_corruption` | `G warlock_haunt` |
| #s15A Karanlık Ruh Ustası -> "Kötülük Ustası" | `M warlock_af_dark_soul sdur=soul_misery:+4` | `M warlock_malevolence sdur=malevolence:+4` |
| #s15B Pandemik Ustası -> "Göz Ustası" | `M warlock_af_pandemic dur=+4 radx=1.2` | `M warlock_summon_darkglare dur=+4` |
| #s18 Acı Emişi -> "Karanlık Ok" | `M warlock_drain_life dmgx=1.2` | `M warlock_shadow_bolt dmgx=1.2` |
| #s20 Acı Zamanı | `M warlock_af_dark_soul+warlock_af_pandemic cdx=.9` | `M warlock_malevolence+warlock_summon_darkglare cdx=.9` |
| #s25 Tohum Fırtınası | `M warlock_seed_of_corruption cd=-4 dmgx=1.25` | `M warlock_seed_of_corruption dmgx=1.25 radx=1.2` |
| #s26A Acı Yayılımı | `T cast:warlock_af_pandemic => st(party,empower,6)` | `T cast:warlock_summon_darkglare => st(party,empower,6)` |
| #s26B Ruh Bağı | `T cast:warlock_af_dark_soul => pip(shard,2)` | `T cast:warlock_malevolence => pip(shard,2)` |
| #s30B Zaman Efendisi | `S dotPct=.20 shadowDamagePct=.10 castSpeed=.05 ;; M warlock_af_pandemic cdx=.8` | `S dotPct=.20 shadowDamagePct=.10 castSpeed=.05 ;; M warlock_summon_darkglare cdx=.8` |

**`spec:warlock_destruction`**

| node | old fx | new fx |
|---|---|---|
| #s02B Kor Gölge | `M warlock_shadow_bolt cv=fire:.5 dmgx=1.1` | `M warlock_basic cv=fire:.5 dmgx=1.1` |
| #s15A Kaos Efendisi -> "Kötülük Efendisi" | `M warlock_ds_havoc sdur=havoc:+4` | `M warlock_malevolence sdur=malevolence:+4` |
| #s15B Kıyamet Ustası -> "Muhafız Ustası" | `M warlock_ds_cataclysm p.balls+=2` | `M warlock_summon_infernal dur=+4` |
| #s20 Yıkım Zamanı | `M warlock_ds_havoc+warlock_ds_cataclysm cdx=.9` | `M warlock_malevolence+warlock_summon_infernal cdx=.9` |
| #s21 Kor Fırtınası | `T crit:warlock_shadow_bolt ch=.2 => dmg(.6,fire)` | `T crit:warlock_incinerate ch=.2 => dmg(.6,fire)` |
| #s26A Yıkım Haykırışı | `T cast:warlock_ds_cataclysm => st(party,empower,6)` | `T cast:warlock_summon_infernal => st(party,empower,6)` |
| #s26B Kor Bağı | `T cast:warlock_ds_havoc => pip(shard,2)` | `T cast:warlock_malevolence => pip(shard,2)` |
| #s30B Kıyamet Kralı | `S critDamage=.25 critChance=.02 ;; M warlock_ds_cataclysm cdx=.8` | `S critDamage=.25 critChance=.02 ;; M warlock_summon_infernal cdx=.8` |

**skillSpecs rows** (`docs/GDD_TALENTS.trees.json` `skillSpecs`, 162 rows): `mage_fireball`, `mage_frost_nova`, `mage_arcane_orb`, `rogue_fan_of_knives`, `rogue_shadow_step`, `warlock_shadow_bolt`, `warlock_corruption`, `warlock_drain_life` rows keep their ids and fx (all ops still valid). The six `rogue_crossbow_shot` rows move to `skill: rogue_mutilate`; rows 1A, 1B, 2B, 3A, 3B keep their fx, row 2A `shape=return` becomes `shape=echo:.2:.6` (projectile-only verbs are not valid on a melee skill). `warlock_drain_life` rows are reachable only through the class `s05` A pick.

---

### g. New engine needs beyond CORE_MECHANICS §10 and COMBAT_WOW

Everything here is **additional**; the CM13 / CW contracts it relies on (`target_projectile`, `target_instant`, `requires.behind`, `replaces`, `procInstant`, `offGcd`, the `s4` slot and KeyG, spell queue, lead skip, PRD, `ProcDef`, `SpellOverlay`, pushback, lockout) are assumed, not repeated.

| # | Need | Why it cannot use an existing hook | Owner |
|---|---|---|---|
| E1 | **`homing_missiles` behaviour + `Projectile.curve`** (3D quadratic Bézier toward the live target, per-wave spawn at the hand bones, retarget on death, AoE cycle) | `Projectile.homing` turns in the XZ plane only; Arkan Füzeler needs height, a lateral control point and 5 timed spawns (2e) | PK-0 (`Projectile.ts`), PK-MAGE (behaviour) |
| E2 | **`finisher` behaviour** (CP-scaled damage, optional bleed per CP, optional AoE and max-CP param) | the existing `eviscerate` is hard-coded for one skill; six finishers share one formula | PK-ROGUE |
| E3 | **`shadow_step` v2** (ally or enemy target, fail rules "Hedef yok" / "Yol yok", ±45° / ±90° fallbacks, `behind_grace`, Gölge Vuruşu variant, no `ambush`) | the existing behaviour blinks 8 m forward without a target and applies the crit status; the new rules are in 7e | PK-ROGUE |
| E4 | **Condition watchers** `aoe_mode` (>= 3 enemies within 10 m of the target) and `exec_window` (target HP < 20 %) writing hidden self statuses every 0.25 s; the bar's `replaces` and GLOW_RULES read them; the new GLOW_RULES named in the tables are `behind`, `salvo_full`, `shatter_ready` (target Freezing >= 6), `dance_ready`, `link_gap` and `refresh` (own DoT below 30 %) | `replaces.whileStatus` needs a status; no engine code produces target-conditional statuses; COMBAT_WOW `GLOW_RULES` has none of these | CW-07 `procFx.ts` (or PK-0 `data/watchers.ts` if CW-07 is late) |
| E5 | **`freezing` enemy debuff, `icicles`, `glacial_ready` / `comet_ready` replace triggers, shatter rule** | mage.ts only knows Frozen / Parmak; Freezing is the Midnight Frost core | PK-MAGE |
| E6 | **`PipDef.scale` (shard fragments) and per-spec `maxCombo` (6 for Gölge)** | pips are integers with a fixed max | PK-0 (types), PK-WARLOCK / PK-ROGUE (data) |
| E7 | **`spectral_summon` behaviour** (Karanlık Göz, Cehennem Muhafızı: a visual that follows / sits at a point, the caster's machine applies pulses; peers replay visuals from `cast`) | the minion system (`types/minions.ts`) has no runtime; two timed summons do not justify building it now | PK-WARLOCK |
| E8 | **`combat/link.ts` (Simya Bağı)**: after every damaging hit of the Simyacı, heal each `alchemy_link` ally for 46 % of it (first 5 injured at full value, the rest x0.5) through the existing `heal` channel; the `alchemy_link` status travels over `pstatus` | no heal-by-damage hook exists; this is the healer's core | PK-ROGUE |
| E9 | **`crowdFactor(n) = 0.4 + 0.6 x min(n, 8) / 8`** helper, applied by the behaviours of AoE buttons tagged `crowd` (Arkan Nabzı, Alev Sütunu, Kar Fırtınası, Bıçak Yelpazesi, Shuriken Fırtınası, Kara Barut, Kızıl Fırtına, Ateş Yağmuru, Tohum) | without it an 8-target button would out-damage Fireball on a single target; coefficients in the tables are "at 8 targets" | PK-0 (exports it from `behaviors.ts`), used by each class file |
| E10 | **`combat/positional.ts` `isBehind` (> 110°) + `behind_grace`** | `Combat.isBehind` is cos <= −0.6428 (130°); CM §10.2 says 110° | PK-0 (new file); the `Combat.ts` call-site switch is CM13 `requires.behind` |
| E11 | **Small class behaviours** (no contract change): `ignite_spread` (Ateş Patlaması), `comet_storm` (7 delayed ground hits), `dot_pulse` (Kötülük), `bubbling_brew` (ally / enemy channel), `ascendant_brew`, `demonic_circle` (reuse `teleport` + `params.cleanse`) | per-skill logic | class packages |
| E12 | **`sated` 600 s for `mage_time_warp`** (CM §3) | legacy rows use 150 s | PK-MAGE (this row only) |

**New StatusIds** (each needs `StatusDef` + `STATUS_RULES`; ids marked CW-03 are already planned there). Mage: `arcane_salvo` (stack, max 20), `clearcasting` (CW-03), `prismatic_ready`, `heating_up` (CW-03), `pyroclasm` (2 stacks), `brain_freeze` (CW-03), `icicles` (max 5), `glacial_ready`, `comet_ready`, `freezing_rain`, `freezing` (enemy debuff, max 12), `prismatic_barrier`, `ice_barrier` (HUD labels of the shields). Rogue: `garrote`, `rupture`, `kingsbane`, `deathmark`, `darkest_night`, `improved_garrote`, `find_weakness`, `shadow_technique` (counter), `shadowstep_haste`, `behind_grace` (hidden), `feint`, `goremaw`, `alchemy_link`, `elixir_ramp`, `brew_boost`, `ascendant`. Warlock: `haunt`, `malevolence`, `darkglare_active`, `backdraft` (2 stacks), `fiendish_cruelty`, `dark_pact` (label). Shared hidden: `aoe_mode`, `exec_window`. Existing ids that need a `StatusDef`: `agony` (dotstack max 8), `corruption`, `unstable_affliction` (dotstack max 3), `immolate`, `seed`. Existing defs retuned: `shadow_blades` (remove `costReductionPct 0.30`, add +20 % damage), `shadow_veil_cd` (TR "Gölge Dansı"), `resolve_pact` (TR "Bitmeyen Kararlılık", −25 %), `hero_haste` / `sated` unchanged.

**New VFX ids (9)** — everything else reuses an existing id with `scale` / `color`, or the planned CW-01 ids (`cast_hands_arcane`, `arcane_charge_orb`, `proc_burst`, `crit_ring`):

| id | look (1 line) | justification |
|---|---|---|
| `arcane_missile` | violet additive core 0.35 m + white rim + 0.4 s tapering ribbon, spark spawn | the signature projectile; existing `arcane_projectile` has no ribbon or curve |
| `arcane_missile_hit` | small violet nova r 0.8 (0.18 s) + 6 sparks + flash | five impacts per cast need a cheap, distinct pop (not `arcane_burst`) |
| `prismatic_bolt` | multi-colour core with a rainbow ribbon | apex spell identity |
| `glacial_spike` | jagged ice spike falling onto the target, ground crack | the biggest Frost hit |
| `shatter_burst` | glass-shard burst, short white flash | the Buz Mızrağı payoff |
| `shadowstep_streak` | dark ribbon origin -> destination + 0.25 s afterimage | remote peers must see where the Haydut went |
| `secret_clones` | two translucent silhouettes strike from ±120°, 0.2 s delayed | Gizli Teknik payoff |
| `link_tether` | thin additive green-gold line caster -> ally with a travelling pulse | Simya Bağı must be visible |
| `darkglare_eye` | a floating eye rises behind the target and fires thin violet beams | Karanlık Göz |

**New SFX ids (4):** `arcane_missile_launch` (short zap-whoosh, pitch +4 %/wave), `arcane_missile_hit` (soft chime-pop, +6 %/wave), `ice_shatter` (glass break, reuse `ice_explosion_01`), `shadowstep_snap` (cloth snap + low thump). Until audio maps them, `audio/aliases.ts` falls back to `spell_cast`, `arcane_impact`, `frost_impact`, `whoosh`.

---

### h. Implementation packages for Haiku coders

One package per class, plus one shared scaffold package that must run first. Numbers, ids and rows are exactly the tables above; coders make no design decisions. File ownership follows ARCHITECTURE.md (combat owns `src/data/*skills*`, `statuses*`, `specs*`, `src/combat/*`; vfx-audio owns `src/vfx/*`, `src/audio/*`; core owns `src/types/*`).

#### Dependencies and order

* CM13 / COMBAT_WOW: **CW-01** (contracts, `startAt`), **CW-02** (gcd / spellQueue / prd, dev scaffold), **CW-03** (`data/procs.ts`, `procMods.ts`), **CW-04** (GCD, queue, lead skip, off-GCD), **CW-07** (procs, pushback, lockout, PRD, watcher host), **CW-08 / CW-09** (bar glow, overlay), **CW-12** (audio), **CW-15** (proc vfx), and the CM §10 contracts (`target_projectile`, `target_instant`, `requires.behind`, `replaces`, `procInstant`, `offGcd`, `s4`, spec GCD).
* **Superseded, do not run as written:** CW-10 (mage rows), CW-11 (melee procs for the old rogue: the `opportunity` proc is dropped), CW-13 (mage hooks), CW-14 (mage behaviours). PK-MAGE / PK-ROGUE replace them.
* Order: CW-01..03 -> **PK-0** -> (CW-04..09 / CM13 in parallel as planned) -> **PK-MAGE ‖ PK-ROGUE ‖ PK-WARLOCK** (3 coders, within the 5-agent limit; they start once CW-07 has landed) -> **T-step** (talent JSON) -> CM5 APL rows -> CM4 SimBench -> CM6 tuner. One Haiku QA pass at the end runs `dev.wow.runAll()` and the node checks once (no per-agent browser tests).

#### PK-0 · Shared scaffold — core + combat + vfx-audio · small · deps CW-01, CW-03 (appends to the same type files, so it runs after them)

* **Edit:** `src/types/skills.ts` (append every new `StatusId` of section g, nothing else), `src/types/vfx.ts` (+9 ids), `src/types/audio.ts` (+4 ids), `src/types/v2.ts` (`SpecId` += `rogue_subtlety`), `src/types/classes.ts` (`PipDef.scale?: number`), `src/data/classes.ts` (`rogue.specs` += `rogue_subtlety`; warlock `secondary` pip `scale: 10`; the `skills` arrays of mage / rogue / warlock become the class-level ids of f.1: no `mage_mana_barrier`, `mage_arcane_cataclysm`, `rogue_crossbow_shot`, `rogue_bolt_rain`, `rogue_deadly_venom`, `rogue_death_blossom`, `warlock_summon_demon`, `warlock_life_tap`), `src/data/talentTrees/index.ts` (`SPEC_TABLE` append `{ id: 'rogue_subtlety', classId: 'rogue', name: 'Gölge' }` as the 22nd entry; `raw/rogue.ts` is generated by the T-step), `src/data/skills.ts` (one line after the existing `Object.assign`: `Object.assign(SKILLS, KIT_MAGE, KIT_ROGUE, KIT_WARLOCK)`), `src/data/statuses.ts` (merge `STATUSES_KIT_MAGE / ROGUE / WARLOCK`), `src/data/specs.ts` (merge `SPECS_KIT_MAGE / ROGUE / WARLOCK`), `src/combat/skills/behaviors.ts` (three side-effect imports `./mageKit`, `./rogueKit`, `./warlockKit` at the end, export `crowdFactor`), `src/entities/Projectile.ts` (`curve?: { lateral: number; rise: number; decay: number }` option), `src/vfx/VFX.ts` (three preset-file imports), `src/vfx/aliases.ts` and `src/audio/aliases.ts` (fallback rows for the new ids).
* **Create (empty, compile-only):** `src/combat/positional.ts` (`isBehind`, 110°), `src/combat/skills/{mageKit,rogueKit,warlockKit}.ts`, `src/data/{skills_kit_mage,skills_kit_rogue,skills_kit_warlock,statuses_kit_mage,statuses_kit_rogue,statuses_kit_warlock,specs_kit_mage,specs_kit_rogue,specs_kit_warlock}.ts` (the new warlock rows go to the existing `data/skillsets/warlock.ts` / `warlockSpecs.ts`; `skills_kit_warlock.ts` only holds the overrides of the two coded class-utility rows), `src/data/rotations_kit_{mage,rogue,warlock}.ts`, `src/vfx/presets_kit_{mage,rogue,warlock}.ts`.
* **Verify:** `npx tsc --noEmit` = 0; `node tools/talents-check.mjs trees` still passes (the new spec has no tree until the T-step: allow-list it).
* **Ownership of the serialised files:** `behaviors.ts` and `Projectile.ts` and every `types/*` addition = **PK-0 only**; statuses = one file per class; vfx presets = one file per class; `Combat.ts` and `SkillSystem.ts` are not touched by any of these packages.

#### PK-MAGE · Büyücü kits — combat (data, behaviours, hooks) + vfx-audio (own preset file) · L · deps PK-0, CW-07, CW-08, CW-09, CW-15

* **Files (edit):** `src/data/skills_mage_specs.ts` (rewrite: all mage spec rows of 2a / 3a / 4a), `src/combat/specs/mage.ts` (hooks: Heating Up / Hot Streak per CW-13, `HOT_STREAK_SKILLS = pyroblast, flamestrike`, Clearcasting, Salvo, shatter + Freezing, Icicles, replace triggers, Touch / Surge / Barrier changes), `docs/GDD_TALENTS.trees.json` (only the `class:mage`, `spec:mage_fire`, `spec:mage_frost`, `spec:mage_arcane` keys, with the Edit tool).
* **Files (create / fill):** `src/data/skills_kit_mage.ts` (full rows for the **kept legacy ids** `mage_basic*`, `mage_fireball`, `mage_frost_nova`, `mage_blink`, `mage_meteor`, `mage_blizzard`, `mage_arcane_orb`, and the class-utility rows `mage_counterspell` (baseline `s4`) and `mage_ice_block`; plus the new `mage_time_warp`; marks `mage_mana_barrier`, `mage_arcane_cataclysm`, `mage_phoenix_flames` as `unlockLevel 99`), `src/data/statuses_kit_mage.ts`, `src/data/specs_kit_mage.ts` (the three `SpecDef`s with the wiring paragraphs; replaces `TALENT_SPECS` entries by merge order), `src/combat/skills/mageKit.ts` (`homing_missiles`, `ignite_spread`, `comet_storm`, Frozen Orb follow, Ray of Frost beam params, Touch / Surge / Barrier behaviours), `src/vfx/presets_kit_mage.ts` (`arcane_missile`, `arcane_missile_hit`, `prismatic_bolt`, `glacial_spike`, `shatter_burst`), `src/data/rotations_kit_mage.ts` (the 6 APLs), `src/dev/wow/kit_mage.ts`, `dev/combat-sim/kit_mage.mjs`.
* **Tasks:** write every row of the three kit tables (cast, cost, coef, params), the proc tables as `ProcDef` rows via the PK-0 merge hooks (CW-03 `procs.ts` is not edited: export `PROC_DEFS_KIT_MAGE` and let `procs.ts` spread it through one PK-0 line), implement E1, E5, E9 usage, E11 (mage), E12.
* **Verification.** `npx tsc --noEmit`; `node tools/talents-check.mjs` (all stages); `node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_mage.mjs` prints PASS for: `kit.mage.ids` (every id in the bars resolves, no missing skill), `kit.mage.apl` (the APLs parse and every referenced id / status exists), `kit.mage.budget` (ST totals of 2d / 3d / 4d reproduce within ±5 % with the table cast counts), `kit.mage.missiles` (a `clearcasting` Füzeler: 5 spawns at 0.10 / 0.50 / 0.90 / 1.30 / 1.70 s, +5 `arcane_salvo`, 0 mana spent, all five hit a moving dummy, a dying dummy retargets), `kit.mage.heating` (forced crits: `heating_up` then `hot_streak`, Piroblast instant and free, status consumed), `kit.mage.shatter` (Freezing 6 or Parmak makes Buz Mızrağı x3 and spends the stacks), `kit.mage.replaces` (Prizma Oku / Buz Sarkıtı / Kuyruklu Yıldız swaps on the right statuses). Browser checks (`window.dev.wow.run('kit.mage.*')`) are run once by the final QA pass, not by this coder.

#### PK-ROGUE · Haydut kits — combat + vfx-audio (own preset file) · L · deps PK-0, CW-07, CW-08, CW-09

* **Files (edit):** `docs/GDD_TALENTS.trees.json` (`class:rogue`, `spec:rogue_assassin`, `spec:rogue_alchemist` keys, new `spec:rogue_subtlety` key, `skillSpecs` rows for `rogue_crossbow_shot`, with the Edit tool).
* **Files (create / fill):** `src/data/skills_kit_rogue.ts` (full rows for all rogue ids of 5–8, including the retuned legacy ids and the class-utility rows `rogue_kick` (baseline `s4`) and `rogue_cloak_of_shadows`; marks `rogue_crossbow_shot`, `rogue_bolt_rain`, `rogue_deadly_venom`, `rogue_death_blossom`, `rogue_haste_elixir` as `unlockLevel 99`; renames `rogue_smoke_bomb` -> `rogue_vanish`), `src/data/statuses_kit_rogue.ts`, `src/data/specs_kit_rogue.ts` (`rogue_assassin`, `rogue_subtlety`, `rogue_alchemist` `SpecDef`s; replaces the `SPEC_LIST` entries by merge order), `src/combat/skills/rogueKit.ts` (E2, E3, E8, Alchemist behaviours, Gölge Tekniği counter, `shadow_blades` +1 CP hook, Feint area-damage reduction), `src/combat/link.ts` (E8), `src/vfx/presets_kit_rogue.ts` (`shadowstep_streak`, `secret_clones`, `link_tether`), `src/data/rotations_kit_rogue.ts`, `src/dev/wow/kit_rogue.ts`, `dev/combat-sim/kit_rogue.mjs`.
* **Tasks:** rows of 6a / 7a / 8a, procs of 6b / 7b / 8b, LMB chain retune (energy gain, CP on steps 2 and 4), finisher formulas, Shadowstep v2 per 7e, `rogue_basic` Zayıflatıcı Zehir hooks (the debuff itself is CM3).
* **Verification.** `npx tsc --noEmit`; `node tools/talents-check.mjs`; `node ... dev/combat-sim/kit_rogue.mjs` PASS for: `kit.rogue.ids`, `kit.rogue.apl`, `kit.rogue.budget` (6d / 7d / 8d within ±5 %), `kit.rogue.shadowstep` (lands 1.2 m behind a target facing +Z; blocked by a wall: tries ±45° then ±90°; no target: fails with no cooldown; ally target ends beside it), `kit.rogue.positional` (Sırttan Bıçak +20 % and +15 % crit only when the angle is > 110° or `behind_grace` is up), `kit.rogue.replaces` (Gölge Vuruşu while `stealth`, Kızıl Fırtına / Kara Barut while `aoe_mode`), `kit.rogue.combo` (Gölge cap 6, others 5), `kit.rogue.link` (Simya Bağı: a 100-damage hit heals each of 3 linked allies for 46; the 6th linked ally gets 23).

#### PK-WARLOCK · Warlock kits — combat + vfx-audio (own preset file) · L · deps PK-0, CW-07, CW-08, CW-09, CM13 (`PipDef.scale` from PK-0)

* **Files (edit / fill):** `src/data/skillsets/warlock.ts` (`registerWarlock`: `warlock_basic*`, `warlock_shadow_bolt`, `warlock_agony`, `warlock_corruption`, `warlock_demonic_circle`, `warlock_dark_pact`, `warlock_spell_lock`, `warlock_drain_life`, `warlock_mortal_coil`), `src/data/skillsets/warlockSpecs.ts` (`registerWarlockSpecs`: all spec rows and majors of 10a / 11a), `docs/GDD_TALENTS.trees.json` (`class:warlock`, `spec:warlock_affliction`, `spec:warlock_destruction` keys, with the Edit tool).
* **Files (create / fill):** `src/data/skills_kit_warlock.ts` (overrides of `warlock_spell_lock`, `warlock_unending_resolve`), `src/data/statuses_kit_warlock.ts`, `src/data/specs_kit_warlock.ts` (the two `SpecDef`s), `src/combat/skills/warlockKit.ts` (E7 `spectral_summon`, `dot_pulse`, DoT stack rules for `agony` / `unstable_affliction`, fragment generation hooks (Azap tick PRD, Kül Etme crit, Yakıp Yıkma tick, kill), Seed detonation, Shadowburn kill refund), `src/vfx/presets_kit_warlock.ts` (`darkglare_eye`), `src/data/rotations_kit_warlock.ts`, `src/dev/wow/kit_warlock.ts`, `dev/combat-sim/kit_warlock.mjs`.
* **Tasks:** rows of 10a / 11a, procs of 10b / 11b, fragment economy of 10d / 11d, summons per E7.
* **Verification.** `npx tsc --noEmit`; `node tools/talents-check.mjs` (the talent nodes' skill ids must now resolve without the "doc-only id" warnings); `node ... dev/combat-sim/kit_warlock.mjs` PASS for: `kit.warlock.ids`, `kit.warlock.apl`, `kit.warlock.budget` (10d / 11d within ±5 %), `kit.warlock.shards` (Azap tick PRD rate 14 % ±1 %, Kul Etme +2 / +3 on crit, Kaos Oku spends 20 fragments, display shows pips = fragments / 10), `kit.warlock.replaces` (Tohum while `aoe_mode`, Gölge Yakma while `exec_window` or `fiendish_cruelty`), `kit.warlock.dots` (Dengesiz Azap max 3 live instances, Azap stacks ramp one per tick up to 8), `kit.warlock.summon` (Karanlık Göz pulses every 2 s for 20 s on every DoT'd enemy; Cehennem Muhafızı stuns non-boss targets 2 s).

#### T-step · Talent data (serialised, after the three class packages) — items (talents owner) · S

Applies the f.2 tables (the class packages already edited their own JSON keys; this step only regenerates and validates): `node tools/gen-talent-data.mjs`, then `node tools/talents-check.mjs` (all stages) must exit 0; update the `docs/GDD_TALENTS.md` prose for the renamed nodes. Concurrent edits of `docs/GDD_TALENTS.trees.json` are safe only because each class package edits disjoint keys with exact-string `Edit` calls (never a whole-file rewrite).

---

## Open questions (biggest first)

1. **Positional angle.** CM §10.2 says behind = > 110°, `Combat.isBehind` implements cos ≤ −0.6428 (130°, "rear 100°"), and CM also says +30 % damage while the research file says +20 %. This file takes 110° and +20 % (+15 % crit from CM). Confirm or keep the stricter 130° rule.
2. **Majors that left their WoW bucket.** Kaybol 120 → 180, Frozen Orb 60 → 90 (with Ayaz Işını 60 → 45), Combustion 120 / 60 → 90, Karanlık Göz 120 → 90, Cehennem Muhafızı 120 / 90 → 90, Kötülük 60 → 45, Simyacı majors 90 / 180 / 240 → 45 / 90 / 180. Acceptable under "bucketed", or should Kaybol / Karanlık Göz keep 120 as non-major buttons?
3. **LMB uptime assumption.** The 20 % LMB share assumes 6 s of chain per minute and a GCD-bound rotation (54 s of GCD time per minute). SimBench must confirm real chain uptime; if players chain far more, the LMB coefficients (3.2–3.5 coef/s, existing rows) are the knob, not the kit.
4. **Hero talents are baked in.** Malevolence (both warlocks), Salvo caps (20, not the Sunfury 25), Prizma Oku, Arcane Surge's mana burst, Crimson Tempest / Black Powder as `aoe_mode` swaps are design decisions, not WoW parity. Soulfire, Havoc, Wither / Dark Harvest, Thistle Tea (benched) and Coup de Grace are not in the bars.
5. **Dropped CM examples.** CM §10.1 lists Anka Alevleri and Buzlu Damarlar as example majors; the Midnight research has no Phoenix Flames and no Icy Veins, so both are dropped (Ateş Patlaması and Ayaz Işını take their place). Confirm.
6. **Subtlety needs a whole talent tree and SPEC ids.** `rogue_subtlety` is spec #22 (appended so existing export strings stay valid); its tree is the old Suikastçı rows plus 7 changes, and the new Suikastçı tree is re-targeted (f.2). `tools/talents-check.mjs` stages `strings` / `bench` may assert 21 specs.
7. **Simyacı resource.** CM asks healers for "≥ 5 % mana after 300 s"; the Simyacı's resource is Enerji, so the check is on Enerji (hand model: 99.6 % of regen spent). Should the healer get a mana-like pool instead?
8. **Warlock simplifications.** No pet (Spell Lock is cast directly), no placed Demonic Circle, summons are spectral (no minion entities). Confirm that is acceptable until the minion system exists.
9. **Heroism sated.** `mage_time_warp` uses `sated` 600 s (CM §3) while the other Heroism rows still use 150 s; the other class packages need the same change.
10. **Alchemist damage identity.** Simya Bağı transfer 46 % with a spec damage modifier of −40 % makes the Simyacı's own numbers tiny; if SimBench shows healing is too dependent on the player landing hits, add a flat 15 % heal-per-cast floor.
