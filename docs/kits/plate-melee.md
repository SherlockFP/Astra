# EFSUN ONLINE — Plate-melee kits (CM12, group A): Warrior x3, Guardian-loop tank, Paladin x3, Death Knight x2

Design pass of 2026-10-13 (docs only, no code touched). Authoritative inputs: `docs/CORE_MECHANICS.md` (§2, §3, §4, §5, §10), `docs/COMBAT_WOW.md` (engine layer: GCD profiles, spell queue, procs and Spell Activation Overlay, pushback, lockout, combat text; its §3 per-class section and old-kit Appendix B rows are **superseded by this file**, its proc ENGINE carries over), `ARCHITECTURE.md`, `docs/GDD_V2.md` (Elden Ring layer, tanks, majors), `docs/GDD_CLASSES_V2.md` (paladin / necromancer paper design, minion framework), `docs/GDD_TALENTS.trees.json`, and the WoW 12.1 research `docs/ref/wow/plate-melee.md`.

Everything in this file is a **tuning target**: coefficients are multiples of the weapon roll (`damage = W x coef`, spells `W + spellPower`, see `Combat.rollOutgoing`); SimBench (CM4–CM6) multiplies each spec by `SPEC_TUNING` afterwards. The hand calculations below prove the *shape* of every kit against the CORE §5 budget; they are not a replacement for the sim.

## Conventions and legend

**Bar** (CORE §10.1): `lmb` weapon chain (off-GCD, our auto-attack analogue) · `rmb` builder / filler · `q` main spender or proc button · `e`, `r` rotational buttons · `s1` (key 1) AoE · `s2` (key 2) mobility · `s3` (key 3) personal defensive · `s4` (key G, new) interrupt / utility · `m45` `m90` `m180` (X V T) majors. `X (replaces)` rows are not extra slots: they are button transforms (`SkillDef.replaces`, CM13) while a status is up.

**GCD** = COMBAT_WOW `'arpg'` profile (1.0 s base, floor 0.5 s). Off-GCD in every kit: the weapon chain, mobility, defensives, interrupts, majors, taunts, active-mitigation buttons (Kalkan Kaldır, Demir Duruş, Doğruluk Kalkanı). WoW cast times x0.8, WoW cooldowns kept; only majors (and a few `r` / `m` rows marked "bucketed") move to the 45 / 90 / 180 s buckets. Data not present in the research file is marked **(n/v)** in this text or collected under "assumptions" in §Open questions.

**Cells.** `I` instant · `C 1.2 s` hard cast · `CH 4 s` channel · `x1.4` = `animSpeed` · `@0.373` = clip hit time in seconds (clip time, before animSpeed) · `R` = Kararlılık / Öfke (rage-type) · `HP` = Kutsal Güç pip · `Öz` = Runic Power analogue · `rune` = DK rune pip · `PRD` = pseudo-random proc (COMBAT_WOW §2.7, `combat/prd.ts`) · `ICD` = internal cooldown. Targeting words: `melee_arc`, `self_aoe`, `ground_aoe`, `dash`, `leap`, `self_buff`, `custom:<behaviour>` exist today; `target_instant` (hit the hard / soft target if in range + LOS, melee ones auto-lunge up to 3 m) and `target_projectile` (homing) are CORE §10.2 / CM13. Clip names are limited to the **76 clips shared by all four KayKit player rigs** (`Knight.glb`, `Barbarian.glb`, `Mage.glb`, `Rogue.glb` carry the identical list); `Taunt` and `Spellcast_Summon` exist only on the skeleton / monster rigs and are NOT used. VFX / SFX ids without a prefix exist in `types/vfx.ts` / `types/audio.ts` (or are planned aliases of GDD_CLASSES_V2 §11); `NEW:` marks an id this document adds (§g gives an alias target for each, so the kit works before a real preset exists).

## Global rules this document sets (G1-G11)

* **G1 · Weapon chain rebase.** CORE §10.1 wants the chain at ~20 % of the single-target budget. Today a 4-step chain is Σ 5.35 (knight) / 5.4 (barbarian) coef and out-damages everything if spammed. All plate chains are rebased to **Σ 2.5** (steps keep their relative weights, finisher x2.2-2.5 of step 1; `FEEL` weights, hit-stop, stagger, knockback, lunge unchanged, so the *feel* of the combo is untouched). Heavy attack (hold LMB), weapon arts, riposte and Kritik Vuruş are separate skills, not in the rotation budget, and keep their GDD_V2 numbers. Exception: Kutsal's heal-bolt chain (`paladin_holy_basic`) is the healer's main damage source: Σ 4.8 damage (Yargı is folded into step 3, the healer has no Yargı button) and Σ 1.55 heal per chain (its damage budget is 35, not 100). SimBench knob: `lmbShare` (target 18-22 % of ST).
* **G2 · Resources.** Şövalye Kararlılık and Barbar Öfke stay the existing rage-type bars (100); Paladin keeps İnanç (`faith`) + the `holypower` pip (max 5, spenders cost **3** exactly, WoW) — İnanç is the real mana of Kutsal and a token cost for Koruma / Ceza; Nekromant keeps `Öz` as Runic Power (decays out of combat, `regenRule 'rage'`) and gets a new `rune` pip (max 6, +1 per 10 s per rune = 0.6 / s, §g need 1).
* **G3 · Anger Management.** The research names it on Arms, Fury and Prot. Spec trait `trait_anger` (Arms, Kasap, Koruyucu; Vampirik Kan has the same rule for Kemik Muhafızı, counted in Öz): every **20** resource spent reduces the remaining cooldown of the spec's majors (`m45`, `m90`, `m180`) by 1 s (§g need 7; the first draft said 10, halved after the budget review). **The cooldowns printed in the kit tables are the BASE (WoW-cadence) values; the trait is a bonus on top of them.** Every hand calculation therefore carries a separate "Anger Management CDR" row that counts the extra major casts (effective cooldown T = base / (1 + R spent per second / 20)); Arms (273 R / min) shortens its majors by ~19 %, Kasap (360 R / min) by ~23 %, Koruyucu (350 R / min) by ~22 %. SimBench knob: `angerPer` (default 20).
* **G4 · Role tools.** Every tank has a single-target taunt, an active mitigation button, a short defensive, a major ladder, an interrupt (or interrupt-on-a-rotation-button: Avenger's Shield) and mobility. Taunts: Kışkırtma (`knight_provoke`, `r`), Kükreyen Balta (Warlord: ranged taunt + DoT on the `r` button), Hesaplaşma (`s4`), Ölüm Kancası (`r`, pull + taunt).
* **G5 · Party buffs (CORE §3).** Şövalye brings **Sancak** (+5 % max HP), Barbar **Savaş Narası** (+5 % physical damage), Paladin **Bağlılık Aurası** (−3 % damage taken, always on, replaces the old aura-cycle skill), Nekromant **Ölüm Mührü** (+3 % versatility). Heroism family = Barbar (Kasap owns `barbarian_wolf_howl` on `m180`), so Şövalye **loses** `knight_heroism_call` (Arms gets Bıçak Fırtınası on `m180` instead). Battle res = Paladin (Kutsal) — not modelled here (GDD_V2 rez rules).
* **G6 · Damage types.** Warriors, Warlord, Blood: physical (shadow for Blood Boil / plague). Paladins: holy (steps 1-2 of the chain stay physical). Unholy: shadow + physical. All former holy flavour of the Şövalye is moved to the Paladin class.
* **G7 · Shared ids with spec patches.** Where two specs of a class use one WoW ability (Charge, Pummel, Avatar, Avenging Wrath, Divine Shield, Rebuke, Death's Advance, Anti-Magic Shell, Mind Freeze, Icebound Fortitude, `rend`, `sudden_death`) the skill id is shared and per-spec numbers come from `SpecDef.mods.patch` (cooldown, params). The major cooldown a skill really uses is its own `cooldown` (the slot only sets `MAJOR_BASE` for save restore), so one id may sit in `m45` for one spec and `m90` for another. `isMajorDef` only reads `SkillDef.defaultSlot` (m45 / m90 / m180), which controls the "major" tag (off-GCD, burst banner, `T major` talent trigger); a shared id keeps one `defaultSlot` (Avenging Wrath `m90`, Divine Shield `m180`) and the slot a spec really uses comes from `SpecDef.majors` / `defaultBar`; do NOT set `params.major = 180` on anything but the Heroism skill (`isHeroDef`).
* **G8 · Unlock schedule** (GDD_V2 §1.1): spec chosen at L10, first spec skill + `m45` at L10, second spec skill L15, `m90` L20, `m180` L30; the spec's `s05` talent node grants one spec skill (`treeSkills`). Class-wide skills keep their current `unlockLevel` unless a row says otherwise.
* **G9 · No pips for the warriors.** The Adalet pip (`adalet`) of the old blademaster is dropped (no WoW analogue). It stays in `PipId` for old saves.
* **G10 · Role handicaps are baked into the coefficients.** The tank sums (70 per 60 s) and the healer damage sum (35) are *final* numbers, 70 % and 35 % of a DPS spec as CORE §5.3 asks. The GDD_V2 own-damage handicaps (`damagePct -0.25` on the tank SpecDefs, `moreDamage 0.75` / `0.60` specials) are therefore **removed** (f3), otherwise they would apply twice. CORE §1.5 "Yalnız Kurt" (solo tanks ~85-90 %, solo healers ~75-85 %) becomes a plain solo multiplier on top of the baked numbers (tanks x1.25 -> 87 %, healers per CORE), same effect as "ignore the negative modifier" but without a hidden stat.
* **G11 · AoE coefficients.** An AoE row lists the **per-target coefficient at full strength up to its target cap**, with no falloff helper (same convention as `docs/kits/agile-evoker.md`; `docs/kits/casters-rogue.md` E9 `crowdFactor(n) = 0.4 + 0.6 x min(n, 8) / 8` is the alternative). If `crowdFactor` is adopted globally, the AoE rows of §1-§9 are re-based to their 8-target value and the 30 s AoE8 totals stay as printed (they are already 8-target totals). In every kit the AoE button is **not stronger than its single-target analogue on one target** (Çelik Girdap 2.0 < Ölümcül Darbe 3.4, İlahi Fırtına 2.3 = Kutsal Hüküm 2.3, Salgın 1.6 = Ölüm Sarmalı 1.6) so the ST APL never picks it (the two exceptions are free builders gated by charges / cooldown: Kan Kaynatma 1.4 per target and Kutsal Zemin).

## 0. Summary of the group

| spec id | TR | role | WoW model | resource | signature mechanic | ST (per 60 s) | AoE8 (per 30 s) |
|---|---|---|---|---|---|---:|---:|
| `knight_blademaster` | Kılıç Ustası | DPS | Arms Warrior | Kararlılık (rage) | Dev Ezme (45 s) + Savaş Avatarı (90 s) window, Ani Ölüm / Savaş Efendisi procs, rage-starved deliberate pacing | 104.3 | 229.1 |
| `knight_protector` | Koruyucu | TANK | Protection Warrior | Kararlılık (rage) | Kalkan Kaldır -> Kalkan Darbesi heartbeat, parry / block -> İntikam Hazır (free Revenge), Yemin Siperi rage dump | 71.8 | 161.2 |
| `barbarian_butcher` | Kasap | DPS | Fury Warrior | Öfke (rage) | Enrage loop (Çılgın Hamle + Kan Susuzluğu), Pervasızlık transforms (Kan Banyosu, Kemik Ezici), Kurt Narası | 103.6 | 232.4 |
| `barbarian_warlord` | Savaş Lordu | TANK | Guardian Druid loop (2H berserker form) | Öfke (rage) | Rage economy: Yarma / Paralama build, Demir Duruş (Ironfur stacks), Kanlı Kürk free-cast loop, ranged taunt axe | 71.9 | 145.4 |
| `paladin_protection` | Koruma | TANK | Protection Paladin | Kutsal Güç pips + İnanç | Holy Power loop, Doğruluk Kalkanı near-100 % uptime, İntikamcı Kalkan bounce + silence | 71.4 | 148.6 |
| `paladin_holy` | Kutsal | HEALER | Holy Paladin | İnanç (mana) + Kutsal Güç pips | Smart ranged heals, Işık Aşısı free Flash of Light, Holy Power spend, İlahi Çınlama burst | damage 34.0 / **heal 98.7** | - |
| `paladin_retribution` | Ceza | DPS | Retribution Paladin | Kutsal Güç pips + İnanç | Holy Power spend at 5, Işık Çekici windows (Avenging Wrath / İdam Hükmü), Küllerin Uyanışı, Adalet Savaşı reset | 102.9 | 205.2 |
| `necromancer_bone` | Kemik Muhafızı | TANK | Blood Death Knight | Öz (Runic Power) + runes | Bone Shield charges + rune / Öz juggling, Ölüm Darbesi heals the last 5 s of damage, Ölüm Kancası pull | 70.4 | 146.3 |
| `necromancer_summoner` | Ordu Efendisi | DPS | Unholy Death Knight | Öz (Runic Power) + runes | Permanent ghoul + Lesser Ghouls + Army (Ölüm Emri), Karanlık Dönüşüm window, Ani Kıyamet free Death Coil | 102.3 | 210.4 |

**Budget gate (CORE §5 / the assignment).** All nine land inside their bands at 0 haste / 0 crit, mid gear: DPS ST 100 ± 5 per 60 s (Arms 104.3, Kasap 103.6, Ceza 102.9, Ordu Efendisi 102.3; Arms and Kasap include their explicit Anger Management CDR row, G3) and AoE8 225 ± 25 per 30 s (229.1 / 232.4 / 205.2 / 210.4); tanks ST 70 ± 5 (Koruyucu 71.8, Savaş Lordu 71.9, Koruma 71.4, Kemik Muhafızı 70.4) with active-mitigation uptime >= 60 % (Kalkan Kaldır 67 % + Yemin Siperi, Demir Duruş 76 %, Doğruluk Kalkanı 70 %, Kemik Zırhı ~80 %) and a derived AoE8 of 4.5 x half the ST (137-177: 161.2 / 145.4 / 148.6 / 146.3); healer (Kutsal) heals 98.7 effective units per 60 s on a 5-man stream, damage 34.0, mana ~100 % after 300 s at 100 % of the casts and still ~100 % at 105 % (net +10 / +3 per minute). Every melee AoE row carries a resource ledger (Arms: per-target rage gain; Kasap: per-target rage gain; Koruyucu and Savaş Lordu: pack-fed by hits taken; Koruma / Ceza: Holy Power). Hand calculations are reproducible: each table below is `casts per 60 s x coef`.

**Method note.** WoW action-power percentages (Shield Slam 231 %, Mortal Strike, Final Verdict 465 %, Holy Shock 1117 % SP ...) fix the *ratios* between the abilities of a spec; the absolute scale is set by the budget. Conversions: weapon-chain 20 coef / 60 s for the melee DPS (8 chains x Σ 2.5; tanks 6 chains = 15); majors are amortised x60/90 (x60/45, x60/180); cooldown-window buffs count as `window seconds x uplift x coef-per-second of the rest of the rotation`; DoTs count their full pandemic-refreshed value; minion damage is counted for Ordu Efendisi. Execute phases (< 20 % HP) and haste / crit stats are left to SimBench.

**APL condition DSL used in every §c block** (one line = one priority entry, evaluated top to bottom every frame; the first castable entry whose condition holds is cast; `off` GCD entries never consume the GCD, so they are checked every frame): `skill if cond [&& cond] [|| cond]`; conditions: `cd == 0`, `cd:<skill> > 5`, `charges >= n`, `resource >= n` (R / Öz / İnanç), `pips >= n` (Holy Power), `runes >= n`, `status:<id>` (own buff up, `>= n` for stacks), `stacks:<id>@tgt`, `remaining:<id>[@tgt] < s`, `target.hp < f`, `hp < f` (own), `targets >= n`, `damage_taken_5s > f` (fraction of max HP, §g need 3), `injured_allies >= n`, `ally.hp < f`, `lmb` as the filler terminal. CM5 compiles this into `src/data/rotations_kit_<class>.ts` rows `{ skill, if }`.

## 1. `knight_blademaster` — Kılıç Ustası (Arms Warrior) · DPS

**Resource.** Kararlılık (rage-type, 100). Weapon chain feeds it (x1.75 for Arms), Hücum +20, spenders cost 15-25.

**Identity.** Dev Ezme window (45 s) + Savaş Avatarı (90 s); proc-driven Ani Ölüm / Savaş Efendisi; deliberate, rage-starved pacing.

### 1a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | knight_basic (+ _1.._4) | Kılıç Kombosu | auto-attack (rage from swings) | I (4 steps) | melee_arc 120-150° / 2.6-3.4 m | 2.6-3.4 | - | gen +7 / +7 / +9 / +10 R (old 4/4/5/6, Arms passive x1.75), **+1 R per extra target hit (max 4, also x1.75)** | off | 0.45 / 0.5 / 0.65 / 0.9 phys (sum 2.50, was 5.35) | - | sudden_death 10 % PRD per hit (icd 3 s) | slash_arc, slash_arc_big (step 4) | 1H_Melee_Attack_Slice_Diagonal, 1H_Melee_Attack_Slice_Horizontal, 1H_Melee_Attack_Stab, 1H_Melee_Attack_Chop | swing_light, swing_heavy |
| rmb | knight_mortal_strike (NEW) | Ölümcül Darbe | Mortal Strike | I | target_instant (melee, auto-lunge 3 m) | 3.2 | 6 s | cost 25 R | on | 3.4 phys | applies mortal_wound 10 s (target takes -50 % healing); consumes - | 25 % PRD -> battlelord | slash_arc_big + hit_blood (red ring on target) | 1H_Melee_Attack_Chop x1.25 | swing_heavy / hit_flesh |
| q | knight_execute (NEW) | Cellat Vuruşu | Execute (Sudden Death) | I | target_instant (melee) via behaviour execute | 3.2 | - | cost 25 R (0 with sudden_death) | on | 4.4 phys; x1.25 vs target < 20 % HP | usable only target < 20 % HP or sudden_death; consumes 1 sudden_death stack | sudden_death glow (q), overlay top | crit_finisher_slash + fire_burst (ember burst) | 1H_Melee_Attack_Chop x0.95 (heavy overhead) | swing_heavy / heavy_hit |
| e | knight_overpower (NEW) | Üstün Vuruş | Overpower | I | target_instant (melee) | 3.0 | 2 x 12 s | free | on | 2.2 phys | consumes battlelord (no charge spent) | battlelord glow (e), overlay right | slash_arc (white flash) | 1H_Melee_Attack_Slice_Diagonal x1.5 | swing_light / hit_flesh |
| r | knight_rend (NEW) | Kanatan Kesik | Rend | I | target_instant (melee) | 3.0 | - | cost 15 R | on | 0.6 phys + DoT 2.4 over 15 s | applies rend (bleed, single stack, 15 s, pandemic refresh < 30 %) | - | hit_blood + burn_loop tinted red (trailing red streaks) | 1H_Melee_Attack_Slice_Horizontal x1.3 | swing_light / hit_flesh |
| s1 | knight_radiant_cleave (kept, retuned) | Çelik Girdap | Whirlwind (n/v in the research; the Sweeping Strikes rider is **EFSUN-invented**, the sources mark Whirlwind / Sweeping Strikes n/v) | I | self_aoe r 4.5 (180° front) | 4.5 | - | cost 20 R (was 30), **refunds +2 R per target hit (max 8 = +16 R)** | on | 2 phys per target (max 8) | applies sweeping 6 s when >= 3 targets hit (MS/Execute cleave to 2 extra targets at 60 %) | sweeping glow on rmb/q while up | spin_slash (steel ring) | 2H_Melee_Attack_Spin x2.0 (verify with 1H sword) | swing_heavy |
| s2 | knight_charge (kept, retuned) | Hücum | Charge | dash | dash 12 m (stops at target) | 12 | 20 s (talent s11: +1 charge) | gen +20 R | off | 1 phys | applies root 1 s (non-boss), slow breakout; consumes - | - | charge_trail + ground_slam on arrival | Running_A x2.0 | swing_heavy / ground_slam |
| s3 | knight_die_by_sword (NEW) | Kılıç Perdesi | Die by the Sword | I | self_buff | - | 120 s | free | off | - | applies die_by_sword 8 s (-40 % damage taken, parry window x2, every parried hit refreshes riposte) | - | aegis_ring (silver blade halo) | Block x1.0 | buff / guard_hit |
| s4 | knight_pummel (NEW, utility row) | Kesici Darbe | Pummel | I | target_instant (melee interrupt, behaviour interrupt) | 3.5 | 15 s | free | off | no damage | cancels interruptible cast; school lockout 3 s on trash/elite (boss: cast cancelled, poise +20) | - | interrupt_burst | Unarmed_Melee_Attack_Punch_A x1.8 | interrupt |
| m45 | knight_colossus_smash (NEW) | Dev Ezme | Colossus Smash | I | self_aoe r 5 (cleave, max 8 targets) | 5 | 45 s base (Anger Management, G3) | free; **+5 R per target hit (max 4 = +20 R)** | off | 2.4 phys AoE | applies colossus 10 s (+30 % damage you deal to each target); consumes - | opens the window: Execute / MS glow, burst banner with Avatar | NEW:colossus_smash (ground shock ring, cracked decal, gold flare) + shockwave | 1H_Melee_Attack_Chop x0.9 | ground_slam / explosion x0.3 |
| m90 | knight_avatar (NEW; replaces knight_wings_of_judgment) | Savaş Avatarı | Avatar | I | self_buff | - | 90 s base (Anger Management, G3) | free | off | - | applies avatar 20 s (+20 % damage dealt, cleanses root/slow on cast) | burst banner when stacked with colossus | zeal_aura + wings_gold tint red-gold | Cheer x1.4 | buff / war_cry x0.5 |
| m180 | knight_bladestorm (NEW) | Bıçak Fırtınası | Bladestorm | CH 4 s (8 ticks) | self_aoe r 4 (channel, move 50 %) | 4 | 180 s base (WoW 90 s n/v, bucketed; Anger Management, G3) | free | off | 0.9 phys per tick per target (8 ticks) | unstoppable (CC immune) while channelling | - | spin_slash (loop) + hit_spark | 2H_Melee_Attack_Spinning x1.0 (loop) | swing_heavy loop |

### 1b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| sudden_death | Ani Ölüm | weapon chain hit 10 % PRD (icd 3 s); Colossus Smash cast | next Cellat Vuruşu costs 0, usable at any target HP, +15 % damage | 12 s, 2 stacks | knight_execute (q) | top, dark red | ProcDef + PROC_MODS {costMult 0, anyHp, more 1.15, consume 1 stack} |
| battlelord | Savaş Efendisi | Mortal Strike hit 25 % PRD | next Üstün Vuruş is free and does not spend a charge | 8 s | knight_overpower (e) | right, orange-white | PROC_MODS {chargeFree, cdFree} |
| colossus | Dev Ezme (target debuff) | Dev Ezme hit | target takes +30 % damage from you (own-debuff highlight on the target frame) | 10 s | - | - | STATUS_RULES {stack refresh, takenMoreFromSource 0.30} |
| mortal_wound | Ölümcül Yara (target debuff) | Ölümcül Darbe hit | target healing received -50 % | 10 s | - | - | STATUS_RULES {stack refresh, healMult 0.5} |
| sweeping | Süpürme (**EFSUN-invented rider**, not in the research) | Çelik Girdap hits >= 3 targets | Ölümcül Darbe and Cellat Vuruşu also hit 2 nearby enemies at 60 % | 6 s | knight_mortal_strike, knight_execute | left (small) | PROC_MODS {extraTargets 2, extraMult 0.6} = engine need #4 |
| avatar | Savaş Avatarı | Avatar cast | +20 % damage dealt, cleanses root / slow on cast | 20 s | - | center ring (existing zeal_aura) | STATUS_RULES {dealtMore 0.20} |
| die_by_sword | Kılıç Perdesi | Kılıç Perdesi cast | -40 % damage taken, parry window x2, parried hits refresh riposte | 8 s | - | - | STATS {damageReductionPct 0.40, parryWindow +0.20} |
| rend | Parçalama | Kanatan Kesik hit (also Gök Gürültüsü, Kükreyen Balta) | physical bleed, one stack, refresh keeps up to 30 % of the old duration | 15 s | - | - | dotType physical, stack refresh, dotstack cap 1 |

### 1c) APL

```text
ST:
 1. knight_rend if !status:rend@tgt || remaining:rend@tgt < 4.5
 2. knight_avatar if cd:knight_avatar == 0 && (status:colossus@tgt || cd:knight_colossus_smash > 5)
 3. knight_colossus_smash if cd == 0
 4. knight_execute if status:sudden_death >= 2
 5. knight_mortal_strike if resource >= 25
 6. knight_execute if status:sudden_death >= 1 || (target.hp < 0.20 && resource >= 25)
 7. knight_overpower if charges >= 1
 8. knight_bladestorm if cd == 0 && status:avatar
 9. lmb (weapon chain) as filler
AoE:
 1. knight_colossus_smash if cd == 0
 2. knight_avatar if cd == 0
 3. knight_bladestorm if cd == 0 && targets >= 4
 4. knight_radiant_cleave if resource >= 20 && !status:sweeping
 5. knight_mortal_strike if status:sweeping && resource >= 25
 6. knight_execute if status:sudden_death >= 1
 7. knight_overpower if charges >= 1
 8. knight_radiant_cleave if resource >= 20
 9. lmb (weapon chain) as filler
```

### 1d) Budget hand calculation

**Single target, per 60 s (target 100 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (8 chains = 32 steps) | 8.0 | 2.50 | 20.0 | filler; also the rage engine |
| Ölümcül Darbe | 8.5 | 3.40 | 28.9 | CD 6 s but rage-gated (25 R) |
| Cellat Vuruşu (Ani Ölüm procs only) | 3.0 | 4.40 | 13.2 | target < 20 % phase is a SimBench bonus, not counted here |
| Üstün Vuruş | 5.0 | 2.20 | 11.0 | 2 charges, 12 s recharge |
| Kanatan Kesik (hit + DoT) | 4.0 | 3.00 | 12.0 | 15 s cycle |
| Dev Ezme hit | 1.3 | 2.40 | 3.2 | 45 s |
| Dev Ezme window (+30 % for 10 s on ~1.5 coef/s) | 1.3 | 4.50 | 6.0 | uplift counted as coef |
| Savaş Avatarı (+20 % for 20 s) x 60/90 | 0.7 | 6.00 | 4.0 | amortised major |
| Bıçak Fırtınası (8 ticks) x 60/180 | 0.3 | 7.20 | 2.4 | amortised major |
| Anger Management CDR (273 R spent = 13.7 s per major per minute: +0.30 Dev Ezme casts at 6.9, +0.12 Avatar at 6.0, +0.11 Bıçak Fırtınası at 7.2) | 1.0 | 3.60 | 3.6 | 2.07 + 0.71 + 0.78; effective cadence 36.7 / 73 / 147 s |
| **TOTAL** | | | **104.3** | |

**AoE8, 8 targets, 30 s pull (target 225 ± 25):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (cleave, avg 3 targets, 9 steps) | 2.3 | 7.50 | 16.9 | 2.25 chains per 30 s, each step hits ~3 |
| Çelik Girdap x 8 targets | 6.5 | 16.00 | 104.0 | cost 20 R, refunds 2 R per target (AoE ledger below) |
| Ölümcül Darbe (sweeping: 1 + 2 x 0.6 hits) | 5.0 | 7.48 | 37.4 | sweeping up 100 % |
| Üstün Vuruş (single) | 2.5 | 2.20 | 5.5 |  |
| Dev Ezme x 8 targets | 1.0 | 19.20 | 19.2 | opener of the pull |
| Dev Ezme window (+30 % for 10 s on ~7 coef/s) | 1.0 | 21.00 | 21.0 | uplift |
| Savaş Avatarı (+20 % for 20 s on ~6 coef/s) x 30/90 | 0.3 | 24.00 | 8.0 | amortised |
| Bıçak Fırtınası (8 ticks x 8 targets) x 30/180 | 0.2 | 57.60 | 9.6 | amortised |
| Anger Management CDR (255 R spent per 30 s = 12.8 s per major: +0.14 Avatar casts at 24.0, +0.07 Bıçak Fırtınası at 57.6; Dev Ezme stays 1 per pull) | 1.0 | 7.50 | 7.5 | 3.4 + 4.1 |
| **TOTAL** | | | **229.1** | |

**Resource check (ST).** Rage ledger / 60 s: income = 32 chain steps x 8.3 = 266 + Hücum 20 = 286; spend = Ölümcül Darbe 8.5 x 25 = 213 + Kanatan Kesik 4 x 15 = 60 = 273 (Cellat / Üstün free). Balanced, slightly starved. Anger Management (G3, 1 s per 20 R) turns the 273 R into 13.7 s of CDR per major per minute; it is counted in the CDR row above, not hand-waved (effective cadence Dev Ezme 36.7 s, Avatar 73 s, Bıçak Fırtınası 147 s).

**Resource check (AoE8, per 30 s; new).** The Arms chain gains **+1 R per extra target hit (max 4, x1.75 passive)**, Çelik Girdap **costs 20 R and refunds 2 R per target hit (max 8)** and Dev Ezme gives **+5 R per target (max 4)** (engine: `params.gainPerTarget` + `gainPerTargetMax`, §g need 11). Income = 9 chain steps x 8.3 = 75 + chain cleave gain 9 x 3.5 (avg 3 targets, 2 extra x 1.75) = 31 + Hücum 20 + Dev Ezme 20 + Çelik Girdap refund 6.5 x 16 = 104 = **250**; spend = Çelik Girdap 6.5 x 20 = 130 + Ölümcül Darbe 5 x 25 = 125 = **255**. Balanced within 2 % (the 5 R gap is one skipped Ölümcül Darbe). On one target the chain gain is 0 and Çelik Girdap costs a net 20 R, so the ST APL still never picks it (G11).

**Party buff the class brings (CORE §3).** Sancak (Kararlılık): party +5 % max HP (class buff, CM3).

### 1e) What it feels like

* Deliberate: every GCD is a decision between Ölümcül Darbe (rage), Üstün Vuruş (free, two charges) and the Cellat window; the weapon chain fills the gaps and is the rage faucet.
* The 45 s Dev Ezme beat shakes the ground, and Savaş Avatarı lands second; burst banner when both are up, then Execute / Ölümcül Darbe on cooldown inside the 10 s window.
* Ani Ölüm procs make the q button glow; two stacks stored is a visible "hold it" tension (Method: Execute at 2 stacks).
* Elden Ring layer unchanged (guard = hold `Mouse3` / `CapsLock`, `G` is `s4`): perfect parry -> riposte (3.5 coef, guaranteed crit) is still the highest single hit of the kit; Kılıç Perdesi doubles the parry window.

**Not modelled (by design, slot budget or sources).** Heroic Strike on Apex procs (the rage dump is Cellat / Ölümcül Darbe; Apex would be a talent node), Spell Reflection, Impending Victory, Rallying Cry, Intervene, Warbreaker (merged into Colossus Smash by the 12.0 patch), Sweeping Strikes as a separate button (n/v in the research; kept only as the EFSUN-invented `sweeping` rider of Çelik Girdap), Battlelord's other effects (n/v), the Slayer / Colossus hero trees.

**Signature moment (VFX / SFX detail).** Dev Ezme (Colossus Smash): the caster raises the sword overhead (anim 0.9x, 0.35 s wind-up), hit-stop 70 ms, ground-slam ring r 5 m (existing `shockwave` + NEW `colossus_smash`: a gold-edged crack decal that spreads 0.25 s and stays 10 s under every affected target as a faint gold ring, so the player SEES the +30 % window); camera trauma 0.3, 30 ms `crit_burst` on each target in the first 3; sfx `ground_slam` + low `explosion` x0.3 + `heavy_hit` layer; the window gets a thin gold vignette that fades with the 10 s timer.

## 2. `knight_protector` — Koruyucu (Protection Warrior) · TANK

**Resource.** Kararlılık (rage-type, 100). Builders: Kalkan Darbesi +15, Gök Gürültüsü +5, Moral Bozma +15, Hücum +20, chain +4..6, every hit taken +3 (spec fx). Spenders: Kalkan Kaldır 30, İntikam 20, Yemin Siperi 35.

**Identity.** Kalkan Kaldır -> Kalkan Darbesi heartbeat; perfect parry / block lights İntikam Hazır (free Revenge); Yemin Siperi as the rage dump; Sarsılmaz Bastion (Shield Wall).

### 2a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | knight_basic (+ _1.._4) | Kılıç Kombosu | auto-attack / Devastate-style filler | I (4 steps) | melee_arc 120-150° / 2.6-3.4 m | 2.6-3.4 | - | gen +4 / +4 / +5 / +6 R | off | 0.45 / 0.5 / 0.65 / 0.9 phys (sum 2.5) | - | riposte window after parry (existing); feeds revenge_ready via block | slash_arc, slash_arc_big | 1H_Melee_Attack_Slice_Diagonal, 1H_Melee_Attack_Slice_Horizontal, 1H_Melee_Attack_Stab, 1H_Melee_Attack_Chop | swing_light, swing_heavy |
| rmb | knight_shield_bash (kept, retuned) | Kalkan Darbesi | Shield Slam | I | melee_arc 100° (target_instant for a hard target) | 2.8 | 9 s | gen +15 R (old: cost 20, CD 3) | on | 3 phys; x1.3 while shield_block | no stun any more (stagger 25 kept); consumes - | shield_block rider +30 % | block_spark + shockwave (gold crack flash) | Block_Attack x1.45 | shield_bash |
| q | knight_revenge (NEW) | İntikam | Revenge | I | melee_arc 150° / 3.4 m (max 5 targets) | 3.4 | - | cost 20 R (0 with revenge_ready) | on | 2 phys per target, x1.25 on proc | consumes revenge_ready | revenge_ready glow (q), overlay left + right | slash_arc_big (red arc) + shockwave r 2.2 on proc | 1H_Melee_Attack_Slice_Horizontal x1.3 | swing_heavy / hit_armor_plate |
| e | knight_shield_block (kept, + store / release) | Kalkan Kaldır | Shield Block | I | self_buff | - | 2 x 9 s | cost 30 R | off | - | applies shield_block 6 s (frontal block 100 %, blockAmount +0.25); **stores 15 % of the damage blocked (`store 0.15`, `storeCap 10`, no rage per block) and releases it when the 6 s end or on recast as a 4 m / 90° heavy shockwave, flat damage, knockback 3 (the old Kalkan Duvarı identity)** | Kalkan Darbesi +30 % | shield_bubble (blue-steel ring) | Block_Attack x1.0 | buff / block |
| r | knight_provoke (kept) | Kışkırtma | Taunt | I | custom:provoke (soft / hard target) | 25 | 8 s | free | off | - | applies taunt 3 s (boss 2 s, ICD 12 s), threat := top x 1.10 + 100 | - | war_cry | Cheer x2.2 | buff |
| s1 | knight_thunder_clap (NEW) | Gök Gürültüsü | Thunder Clap | I | self_aoe r 5 | 5 | 6 s | gen +5 R | on | 1 phys per target + rend DoT 1.2 each | applies rend 15 s + slow 20 % 6 s to all hit | refreshes rend; feeds İntikam via cleave | shockwave tinted blue (opts.color) + ground ring | 1H_Melee_Attack_Stab x1.8 (blade into ground) | ground_slam |
| s2 | knight_charge (kept, spec patch) | Hücum (Kalkan Hücumu) | Shield Charge | dash | dash 12 m, AoE r 3 at arrival | 12 | 45 s (spec mods patch, was 10 s) | gen +20 R | off | 1.6 phys AoE | applies stun 1.5 s (non-boss) and grants revenge_ready + refunds 1 Kalkan Kaldır charge (Champion's Bulwark) | revenge_ready | charge_trail + ground_slam + stun_stars | Running_A x2.0 | swing_heavy / ground_slam |
| s3 | knight_ward_of_oath (kept) | Yemin Siperi | Ignore Pain | I | custom:absorb_self | - | 1.5 s | cost 35 R | off | - | applies oath_ward 8 s: absorb 22 % max HP, stacks to 45 % | rage dump at >= 70 R (resource90 glow) | shield_bubble (pale-gold glyph) | Use_Item x2.5 | buff |
| s4 | knight_pummel (NEW, shared with Arms) | Kesici Darbe | Pummel | I | target_instant (melee interrupt) | 3.5 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | interrupt_burst | Unarmed_Melee_Attack_Punch_A x1.8 | interrupt |
| m45 | knight_challenge (kept, retuned) | Moral Bozma | Demoralizing Shout | I | self_aoe r 8 | 8 | 45 s | gen +15 R | off | - | applies curse (-20 % damage dealt) 8 s to all hit; no taunt any more (old: taunt 4 s) | - | war_cry (red shout waves) | Cheer x1.5 | war_cry |
| m90 | knight_avatar (NEW, shared with Arms) | Savaş Avatarı | Avatar | I | self_buff | - | 90 s | free | off | - | applies avatar 20 s (+20 % damage dealt, cleanses root / slow) | - | zeal_aura + wings_gold tint red-gold | Cheer x1.4 | buff |
| m180 | knight_unbroken_bastion (kept, retuned) | Sarsılmaz Bastion | Shield Wall | I | custom:major_bastion | - | 180 s base (Anger Management, G3) | free | off | - | applies bastion 8 s (-40 % damage, CC immune); old +10 % heal removed | - | bastion_dome | Cheer x1.8 | buff / divine_shield |

### 2b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| revenge_ready | İntikam Hazır | block 30 % (icd 1.5 s); perfect parry 100 %; Hücum landing 100 % | next İntikam costs 0, +25 % damage, threat x2 | 6 s | knight_revenge (q) | left + right, orange-white | ProcDef + PROC_MODS {costMult 0, more 1.25, consume} |
| shield_block | Kalkan Kaldır | Kalkan Kaldır cast | frontal block 100 %, blockAmount +0.25, Kalkan Darbesi +30 %; 15 % of the blocked damage is released on expiry | 6 s | knight_shield_bash (soft ring) | - | existing status; add `more 1.3` for knight_shield_bash in PROC_MODS; store / release = §g need 12 (flat damage, not W-scaled, not in the coef budget: SimBench checks it stays under 2 coef-units per minute) |
| oath_ward | Yemin Siperi | Yemin Siperi cast | absorb 22 % max HP, stacking cap 45 % | 8 s | - | - | existing absorb_self behaviour |
| bastion | Sarsılmaz Bastion | m180 cast | -40 % damage taken, CC immune | 8 s | - | center vignette gold | existing status (duration 10 -> 8) |
| curse | Zayıflama (target debuff) | Moral Bozma | enemies deal -20 % damage | 8 s | - | - | existing status |
| rend | Parçalama | Gök Gürültüsü | single-stack physical bleed | 15 s | - | - | shared with Arms / Warlord (see Arms) |
| avatar | Savaş Avatarı | m90 cast | +20 % damage dealt | 20 s | - | - | shared |

### 2c) APL

```text
ST:
 1. knight_shield_block if charges >= 2 || (!status:shield_block && charges >= 1)
 2. knight_ward_of_oath if resource >= 70 || (resource >= 35 && !status:oath_ward && damage_taken_5s > 0.15)
 3. knight_challenge if cd == 0
 4. knight_charge if cd == 0 && status:revenge_ready == 0
 5. knight_shield_bash if cd == 0
 6. knight_revenge if status:revenge_ready || resource >= 60
 7. knight_thunder_clap if cd == 0 && (!status:rend@tgt || targets >= 2)
 8. knight_avatar if cd == 0
 9. lmb (weapon chain) as filler
AoE:
 1. knight_charge if cd == 0 (pull)
 2. knight_challenge if cd == 0
 3. knight_shield_block (as ST)
 4. knight_thunder_clap if cd == 0
 5. knight_revenge if status:revenge_ready || resource >= 40
 6. knight_shield_bash if cd == 0
 7. knight_ward_of_oath if resource >= 70
 8. lmb (weapon chain) as filler
```

### 2d) Budget hand calculation

**Single target, per 60 s (target 70 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (6 chains) | 6.0 | 2.50 | 15.0 | filler + rage |
| Kalkan Darbesi | 6.5 | 3.00 | 19.5 | CD 9 s |
| Kalkan Kaldır rider (+30 % while up, 67 % uptime) | 6.5 | 0.60 | 3.9 |  |
| İntikam (4 paid + 5 proc) | 9.0 | 2.00 | 18.0 | proc-fed by block / parry |
| Gök Gürültüsü (hit + rend DoT) | 4.0 | 2.20 | 8.8 | refresh rend every 15 s |
| Hücum (Shield Charge) x 60/45 | 1.3 | 1.60 | 2.1 |  |
| Moral Bozma x 60/45 | 1.3 | 0.40 | 0.5 |  |
| Savaş Avatarı (+20 % for 20 s on ~1.1 coef/s) x 60/90 | 0.7 | 4.40 | 2.9 |  |
| Anger Management CDR (350 R spent = 17.5 s per major per minute: +0.39 Moral Bozma casts at 0.4, +0.19 Avatar at 4.4) | 1.0 | 1.00 | 1.0 | 0.16 + 0.84 |
| **TOTAL** | | | **71.8** | |

**AoE8, 8 targets, 30 s pull (derived target 4.5 x half the ST = 157 ± 20):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (3 chains x ~3 targets) | 3.0 | 7.50 | 22.5 |  |
| Gök Gürültüsü x 8 targets (hit + rend DoT 0.6) | 5.0 | 12.80 | 64.0 |  |
| İntikam (cone, 5 targets) | 4.0 | 10.00 | 40.0 |  |
| Kalkan Darbesi | 3.3 | 3.00 | 9.9 |  |
| Hücum x 8 targets | 1.0 | 12.80 | 12.8 | pull opener |
| Moral Bozma x 8 | 1.0 | 3.20 | 3.2 |  |
| Savaş Avatarı (+20 % for 20 s on ~5 coef/s) x 30/90 | 0.3 | 20.00 | 6.7 |  |
| Anger Management CDR (192 R spent per 30 s = 9.6 s per major: +0.11 Avatar casts at 20.0; Moral Bozma stays 1 per pull) | 1.0 | 2.10 | 2.1 |  |
| **TOTAL** | | | **161.2** | |

**Active mitigation and resource check.** Active mitigation uptime: Kalkan Kaldır 6 s per 9 s recharge per charge = 66.7 % steady state (100 % for the first 12 s from 2 stored charges). Yemin Siperi (8 s absorb, ~3.5 casts per minute) fills the gaps: union coverage ~ 85 %. Rage ledger / 60 s: income = chain 24 steps x 4.75 = 114 + Kalkan Darbesi 6.5 x 15 = 98 + Gök Gürültüsü 10 x 5 = 50 + hits taken ~28 x 3 = 84 = 346; spend = Kalkan Kaldır 6.7 x 30 = 200 + Yemin Siperi 2 x 35 = 70 + İntikam 4 x 20 = 80 = 350. Balanced; a dropped Kalkan Kaldır is felt as rage capping or empty bar.

**AoE8 rage ledger / 30 s (new).** No per-target rage is needed here, the pack feeds the bar through hits taken. Income = chain 12 steps x 4.75 = 57 + Kalkan Darbesi 3.3 x 15 = 50 + Gök Gürültüsü 5 x 5 = 25 + Hücum 20 + Moral Bozma 15 + hits taken ~24 (8 mobs, the +3 trigger has icd 1 s) x 3 = 72 = **239**; spend = Kalkan Kaldır 3.3 x 30 = 100 + İntikam 2 paid (the other 2 of 4 are İntikam Hazır) x 20 = 40 + Yemin Siperi 1.5 x 35 = 52 = **192**. Surplus ~47 R goes into 1-2 more Yemin Siperi (APL AoE 7, resource >= 70), which only raises uptime. The AoE is never rage-starved, the failure mode is capping.

**Party buff the class brings (CORE §3).** Sancak (Kararlılık): party +5 % max HP (class buff, CM3).

### 2e) What it feels like

* Kalkan Darbesi on cooldown with Kalkan Kaldır up is the heartbeat; the gold crack flash on the shield bash is the "tank hit" every 9 s.
* Elden Ring parry feeds the WoW proc: a perfect parry gives İntikam Hazır (free Revenge cone), so skilled guard timing converts into threat and rage.
* Yemin Siperi is the rage dump you press when the bar glows (resource90) so you never cap; Hücum opens a pull with a stun cone and a free İntikam.
* Moral Bozma + Sarsılmaz Bastion are the visible "tank buster" answers; Kışkırtma (r) is always one press away.

**Not modelled (by design, slot budget or sources).** Spell Reflection, Devastate / Devastator resets, Demolish, Thunder Blast and the Mountain Thane tree, Last Stand, Rallying Cry, Intervene, Heroic Throw, Rend as a separate tree effect (Gök Gürültüsü applies it directly), Champion's Bulwark beyond the Hücum rider, Execute for tanks.

**Signature moment (VFX / SFX detail).** İntikam Hazır: the parry ring (existing `parry_flash`, 120 ms hit-stop) is followed within 0.15 s by the proc overlay on both sides of the character (orange-white shield edges, 6 s pulse, 1.5 s expiry flicker) and marching ants on the q button; the free İntikam is a 150° red arc (`slash_arc_big`, weight `heavy`, 90 ms victim stop, trauma 0.2) with one extra shockwave r 2.2 m on the proc cast and a green rage-gain pop; sfx `parry` -> `proc_gain` bell -> `swing_heavy` + `hit_armor_plate`.

## 3. `barbarian_butcher` — Kasap (Fury Warrior) · DPS

**Resource.** Öfke (rage-type, 100, decays out of combat). Chain +5/+5/+5/+8 (+20 % spec), Kan Susuzluğu +8, Öfkeli Darbe +12, Hücum-style Sıçrayış +20, Kasırga +3 per target. Spender: Çılgın Hamle 80, İdam 25.

**Identity.** Enrage loop (Çılgın Hamle + Kan Susuzluğu 30 %), Pervasızlık (Recklessness) window with Kan Banyosu / Kemik Ezici transforms, Kurt Narası owner.

### 3a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | barbarian_basic (+ _1.._4) | Balta Kombosu | auto-attacks (rage) | I (4 steps) | melee_arc 140-200° / 3.0-3.3 m | 3.0-3.3 | - | gen +5 / +5 / +5 / +8 R (+1 per extra target, max 4; Fury x1.2) | off | 0.45 / 0.5 / 0.45 / 1.1 phys (sum 2.5, was 5.4) | - | sudden_death 10 % PRD (icd 3 s), +6 % if target bleeds (Bloodbath rider) | slash_arc, slash_arc_big + ground_slam (step 4) | 2H_Melee_Attack_Slice / Stab, Unarmed_Melee_Attack_Kick, 2H_Melee_Attack_Chop | swing_light, swing_heavy |
| rmb | barbarian_bloodthirst (NEW) | Kan Susuzluğu | Bloodthirst | I | target_instant (melee) | 3.2 | 4.5 s | gen +8 R | on | 1.8 phys; heals 3 % max HP | 30 % PRD applies enrage (4 s, +15 % damage) | replaced by barbarian_bloodbath while carnage; consumes meat_cleaver stack (cleave) | hit_blood (crimson splash) + heal_burst (green pulse on self) | 2H_Melee_Attack_Slice x1.4 | swing_heavy / hit_flesh |
| rmb (replaces) | barbarian_bloodbath (kept id, role changed) | Kan Banyosu | Bloodbath (Recklessness transform) | I | target_instant (melee) | 3.2 | 4.5 s (shared with Bloodthirst) | gen +8 R | on | 2.2 phys + bleed rider 25 % over 6 s | `replaces {skill: barbarian_bloodthirst, whileStatus: carnage}` | same as Kan Susuzluğu | bloodbath_burst + hit_blood | 2H_Melee_Attack_Slice x1.6 | swing_heavy / explosion x0.25 |
| q | barbarian_rampage (NEW) | Çılgın Hamle | Rampage | I (4 strikes, gap 0.17 s) | target_instant (melee, behaviour multi_strike) | 3.2 | 1.5 s | cost 80 R | on | 4 x 1.30 = 5.2 phys | applies enrage 4 s (100 %) | enrage refresh; Kasırga rider hits 3 extra targets | slash_arc x4 + enrage_aura on self | animCycle [2H Slice, Stab, Chop, Slice] x2.4 | swing_heavy x4 / heavy_hit on strike 4 |
| e | barbarian_raging_blow (NEW) | Öfkeli Darbe | Raging Blow | I (2 hits) | target_instant (melee, multi_strike x2) | 3.2 | 2 x 8 s | gen +12 R | on | 1.6 phys (2 x 0.8) | - | replaced by barbarian_crushing_blow while carnage; meat_cleaver | slash_arc x2 (double red strike) | 2H_Melee_Attack_Chop x1.5 | swing_heavy x2 |
| e (replaces) | barbarian_crushing_blow (NEW) | Kemik Ezici | Crushing Blow (Recklessness transform) | I (2 hits) | target_instant (melee, multi_strike x2) | 3.2 | 2 x 8 s (shared) | gen +12 R | on | 1.9 phys | `replaces {skill: barbarian_raging_blow, whileStatus: carnage}` | same | slash_arc_big x2 + ground_slam small | 2H_Melee_Attack_Chop x1.3 | swing_heavy / ground_slam |
| r | barbarian_execute (kept, retuned) | İdam | Execute (Massacre) | I | target_instant (melee) via behaviour execute | 3.2 | - | cost 25 R (0 with sudden_death) | on | 3.5 phys (old 5.0); x1.3 below 35 % | usable < 35 % HP or sudden_death; consumes 1 stack; non-boss < 10 % HP culled (kept), refund 15 R on kill | sudden_death glow (r), overlay top | crit_finisher_slash + hit_blood | 2H_Melee_Attack_Chop x1.0 (hit 0.735) | swing_heavy / heavy_hit |
| s1 | barbarian_whirlwind (kept, retuned) | Kasırga | Whirlwind (Meat Cleaver) | CH 2 s (8 ticks), hold | self_aoe r 3.2, move 60 % | 3.2 | - | gen +3 R per target (max 5); old: cost 10 + 16/s | on | 0.38 phys per tick per target (8 ticks) | on end applies meat_cleaver 8 s, 2 stacks (Kan Susuzluğu / Öfkeli Darbe / Çılgın Hamle hit 3 extra targets at 60 %) | meat_cleaver rider | spin_slash (loop) | 2H_Melee_Attack_Spinning x1.0 | swing_heavy loop |
| s2 | barbarian_leap (kept, retuned) | Sıçrayış | Charge / Heroic Leap | leap | leap to aim point (range 14), AoE r 4 | 14 | 20 s (old 9 s) | gen +20 R | off | 1.2 phys AoE (old 2.2) | slow 40 % 2.5 s | - | leap_land + ground_slam | Jump_Full_Short | jump / ground_slam |
| s3 | barbarian_blood_rage (kept, retuned) | Kan Hiddeti | Enraged Regeneration | I | self_buff | - | 120 s (old 35 s) | free (old: costs 15 % of current HP) | off | - | applies bloodrage 8 s: -30 % damage taken, lifesteal 8 %, Kan Susuzluğu heal x3 | - | enrage_aura (red glow) + heal_burst | Cheer x1.6 | war_cry / buff |
| s4 | barbarian_pummel (kept, promoted to baseline) | Yumruk Darbesi | Pummel | I | target_instant (melee interrupt) | 3.5 | 15 s (old 12) | free (old 10 R) | off | no damage | cancels cast; lockout 3 s on trash/elite; stun 0.8 s kept for non-boss | - | interrupt_burst | Unarmed_Melee_Attack_Punch_A x1.5 | interrupt / punch_hit |
| m45 | barbarian_avatar (NEW) | Savaş Avatarı | Avatar (Anger Management) | I | self_buff | - | 45 s base (WoW 90 s, bucketed; magnitude halved; Anger Management, G3) | free | off | - | applies avatar 20 s: +10 % damage dealt (Arms/Prot: +20 %), cleanses root / slow | burst banner with carnage | zeal_aura red-gold + wings_gold | Cheer x1.4 | buff / war_cry x0.5 |
| m90 | barbarian_carnage (kept, retuned) | Pervasızlık | Recklessness | I | self_buff | - | 90 s base (Anger Management, G3) | free | off | - | applies carnage 12 s: +20 % crit chance, +50 % rage generation; Kan Susuzluğu -> Kan Banyosu, Öfkeli Darbe -> Kemik Ezici; old +35 % damage / -30 % healing removed | burst banner with avatar | carnage_aura (red flame spikes) | Cheer x1.6 | war_cry |
| m180 | barbarian_wolf_howl (kept) | Kurt Narası | Bloodlust / Heroism (Heroism family) | I | custom:major_hero (party range 40) | 40 | 180 s | free | off | - | applies hero_haste 40 s to the party (+30 % attack / cast speed, +10 % move), sated (Yorgun) 600 s = CORE §3 (legacy rows use 150 s, only this skill is retuned, like `mage_time_warp` in casters-rogue.md) | - | hero_wave + haste_trail | Cheer x1.0 | wolf_howl / hero_horn |

### 3b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| enrage | Kudurma | Çılgın Hamle 100 %; Kan Susuzluğu / Kan Banyosu 30 % PRD | +15 % damage dealt, +11 % attack speed (existing magnitude model: dealtMore x mag, attackSpeed 0.75 x mag) | 4 s | - | center ring (enrage_aura) | existing status; STATUS_RULES enrage {stack strongest, dealtMore 1}; cast with magnitude 0.15 |
| sudden_death | Ani Ölüm | weapon chain hit 10 % PRD (icd 3 s), +6 % if target bleeds | next İdam costs 0, usable at any target HP | 12 s, 2 stacks | barbarian_execute (r) | top, dark red | ProcDef + PROC_MODS {costMult 0, anyHp, consume 1 stack}; shared status id with Arms |
| carnage | Pervasızlık | Pervasızlık cast | +20 % crit chance on abilities, +50 % rage generation, transforms rmb / e | 12 s | rmb, e (transform) | both sides, flame | existing id retuned; `replaces` rows on the two transforms |
| meat_cleaver | Et Satırı | Kasırga ends | next 2 Kan Susuzluğu / Kan Banyosu / Öfkeli Darbe / Kemik Ezici / Çılgın Hamle hit 3 extra nearby targets at 60 % | 8 s, 2 stacks | rmb, e, q | left (small) | PROC_MODS {extraTargets 3, extraMult 0.6, consume 1 stack} = engine need #4 |
| avatar | Savaş Avatarı | m45 cast | +10 % damage dealt (magnitude 0.10) | 20 s | - | center ring | shared status, magnitude per class |
| bloodrage | Kan Hiddeti | s3 cast | -30 % damage taken, lifesteal 8 %, Kan Susuzluğu healing x3 | 8 s | - | - | existing status; stats damageReductionPct 0.30 |
| hero_haste / sated | Kurt Narası / Yorgun | m180 | party +30 % haste; sated blocks a second copy for 600 s (CORE §3) | 40 s / 600 s | - | - | existing (heroBehavior) |

### 3c) APL

```text
ST:
 1. barbarian_carnage if cd == 0 (with barbarian_avatar)
 2. barbarian_avatar if cd == 0
 3. barbarian_rampage if !status:enrage || resource >= 100
 4. barbarian_execute if status:sudden_death >= 2
 5. barbarian_rampage if resource >= 80
 6. barbarian_execute if status:sudden_death >= 1 || target.hp < 0.35
 7. barbarian_raging_blow if charges >= 1   (Kemik Ezici while carnage)
 8. barbarian_bloodthirst if cd == 0   (Kan Banyosu while carnage)
 9. lmb (weapon chain) as filler
AoE:
 1. barbarian_carnage + barbarian_avatar on cd
 2. barbarian_whirlwind if !status:meat_cleaver
 3. barbarian_rampage if resource >= 80 && status:meat_cleaver
 4. barbarian_bloodthirst if status:meat_cleaver
 5. barbarian_raging_blow if status:meat_cleaver
 6. barbarian_execute if status:sudden_death
 7. barbarian_whirlwind (filler)
 8. lmb (weapon chain) as filler
```

### 3d) Budget hand calculation

**Single target, per 60 s (target 100 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (8 chains) | 8.0 | 2.50 | 20.0 | filler + rage |
| Kan Susuzluğu | 11.0 | 1.80 | 19.8 | CD 4.5 s, 3 s lost to Çılgın Hamle / GCD; one more cast traded for the extra Çılgın Hamle the CDR-pulled Pervasızlık window brings |
| Öfkeli Darbe | 7.5 | 1.60 | 12.0 | 2 charges, 8 s recharge |
| Çılgın Hamle | 4.5 | 5.20 | 23.4 | 80 R each |
| İdam (Ani Ölüm procs) | 3.0 | 3.50 | 10.5 | execute phase counted in SimBench only |
| Savaş Avatarı (+10 % for 20 s on ~1.6 coef/s) x 60/45 | 1.3 | 3.20 | 4.3 | amortised |
| Pervasızlık (+20 % crit = +10 % damage, 12 s, + extra Çılgın Hamle) x 60/90 | 0.7 | 6.12 | 4.1 | amortised |
| Enrage uptime ~55 % x +15 % on direct damage | 1.0 | 7.22 | 7.2 | baked uplift |
| Anger Management CDR (360 R spent = 18 s per major per minute: +0.40 Avatar casts at 3.2, +0.17 Pervasızlık at 6.12) | 1.0 | 2.30 | 2.3 | 1.28 + 1.02 |
| **TOTAL** | | | **103.6** | |

**AoE8, 8 targets, 30 s pull (target 225 ± 25):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (cleave, 3 targets, 2.25 chains) | 2.3 | 7.50 | 16.9 |  |
| Kasırga x 8 targets (8 ticks) | 4.0 | 24.32 | 97.3 | 2 s channel, 4 casts per 30 s |
| Kan Susuzluğu with Et Satırı (1 + 3 x 0.6) | 6.0 | 5.04 | 30.2 |  |
| Öfkeli Darbe with Et Satırı | 3.8 | 4.48 | 16.8 |  |
| Çılgın Hamle with Et Satırı | 2.3 | 14.56 | 32.8 |  |
| İdam (single) | 1.5 | 3.50 | 5.3 |  |
| Savaş Avatarı (+10 % for 20 s on ~6 coef/s) x 30/45 | 0.7 | 12.00 | 8.0 |  |
| Pervasızlık + enrage uplift (~12 % of direct 190) | 1.0 | 22.80 | 22.8 |  |
| Anger Management CDR (184 R spent per 30 s = 9.2 s per major: +0.20 Avatar casts at 12.0) | 1.0 | 2.40 | 2.4 |  |
| **TOTAL** | | | **232.4** | |

**Resource check.** Rage ledger / 60 s: income = chain 32 steps x 6.9 (5/5/5/8 avg 5.75 x 1.2) = 221 + Kan Susuzluğu 11 x 8 = 88 + Öfkeli Darbe 7.5 x 12 = 90 + Sıçrayış 3 x 20 = 60 = 459 (+ Pervasızlık +50 % for 12 s ~ +45); spend = Çılgın Hamle 4.5 x 80 = 360 + İdam paid 0 = 360 -> surplus feeds the 5th Çılgın Hamle during Pervasızlık.

**Party buff the class brings (CORE §3).** Savaş Narası (class buff): party +5 % physical damage; plus Kurt Narası (m180) Heroism for the party (Heroism family).

### 3e) What it feels like

* Rampage-Enrage loop: Çılgın Hamle (four rapid slashes + red aura) keeps Kudurma up, Kan Susuzluğu heals you and rerolls Enrage 30 % of the time; the bar swings between 0 and 80.
* Pervasızlık is the big beat: both rmb and e visibly transform (Kan Banyosu, Kemik Ezici, flame spikes), burst banner when Avatar is stacked.
* High-APM and flat damage; every missed filler is felt (Method). Charge-weaving analogue: Sıçrayış +20 R every 20 s is the "rage on demand" button.
* Elden Ring layer unchanged: heavy hold-attack (Kafa Yaran / Yer Kıran weapon art) still available between fillers; Kasırga still lets you walk.

**Not modelled (by design, slot budget or sources).** Odyn's Fury (placement unclear in the sources), Wrecking Throw, Thunder Clap / Thunder Blast (Mountain Thane), Bladestorm (bench: `barbarian_ancestral_tempest` can be offered by a talent), Heroic Leap as a second mobility button, Rend, tier-set numbers (search summaries, unverified).

**Signature moment (VFX / SFX detail).** Çılgın Hamle (Rampage): four strikes 0.17 s apart (animCycle Slice -> Stab -> Chop -> Slice at x2.4), each with its own `slash_arc`, hit-stop 20 ms on 1-3 and 70 ms on the fourth (the only strike with weight `heavy`), camera trauma 0.08 per strike +0.2 on the fourth, a red rage aura flash on the character at the start (`enrage_aura`, 0.25 s) that stays as the 4 s Kudurma glow; four stacked `swing_heavy` pitches +4 % each and a final `heavy_hit`; the rage bar empties from 80 with a streak and the Kudurma icon on the player frame pulses gold-red.

## 4. `barbarian_warlord` — Savaş Lordu (Guardian Druid loop (2H berserker form)) · TANK

**Resource.** Öfke (rage-type, 100, decays out of combat). Builders: Yarma +12, Paralama +5, Sıçrayış +20, chain +5..8, every hit taken +2 (spec fx). Spenders: Demir Duruş 30, Ezici Balta 40, Kan Yenilenmesi 10. Never cap it.

**Identity.** Rage economy: Yarma / Paralama build, Demir Duruş (Ironfur stacks) is active mitigation, Kanlı Kürk (Gory Fur) swaps free Ezici Balta <-> free Demir Duruş, Kan Yenilenmesi vs Demir Duruş is a real choice.

### 4a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | barbarian_basic (+ _1.._4) | Balta Kombosu | auto-attack / Swipe filler | I (4 steps) | melee_arc 140° / 3.0 m | 3.0-3.3 | - | gen +5 / +5 / +5 / +8 R | off | 0.45 / 0.5 / 0.45 / 1.1 phys (sum 2.5) | - | riposte window after parry; hits taken feed rage (spec fx) | slash_arc, slash_arc_big | 2H_Melee_Attack_Slice / Stab, Unarmed_Melee_Attack_Kick, 2H_Melee_Attack_Chop | swing_light, swing_heavy |
| rmb | barbarian_cleave (kept, retuned) | Yarma | Mangle | I | melee_arc 130° / 3.6 m (was 200°) | 3.6 | 6 s (old: 0) | gen +12 R (old: cost 25) | on | 1.5 phys (old 2.4); +15 % with gore | applies bleed 4 s (kept); consumes gore (CD reset) | gore glow (rmb), overlay left | slash_arc_big (three-claw trails, orange) | 2H_Melee_Attack_Slice x1.2 | swing_heavy |
| q | barbarian_maul (NEW) | Ezici Balta | Maul / Raze (auto-cleave on >= 2 targets) | I | melee_arc 150° / 3.4 m (max 3 targets, 100 % / 50 % / 50 %) | 3.4 | - | cost 40 R (0 with gory_maul) | on | 2.4 phys | grants absorb 35 % of damage dealt (Ursoc's Fury, cap 20 % max HP, 8 s); 20 % PRD -> gory_iron; consumes gory_maul | gory_maul glow (q) | slash_arc_big + ground_slam small | 2H_Melee_Attack_Chop x1.2 | swing_heavy / hit_armor_plate |
| e | barbarian_iron_stance (kept, retuned) | Demir Duruş | Ironfur | I | self_buff | - | 0.5 s (old 2 x 8 s) | cost 30 R (0 with gory_iron) | off | - | applies iron_stance 7 s, stacks to 3 (+13 % physical damage reduction per stack, shared timer); 20 % PRD -> gory_maul | gory_iron glow (e) | enrage_aura (metallic fur shimmer, intensity = stacks) | Block_Attack x1.5 | buff / block |
| r | barbarian_axe_throw (kept, retuned) | Kükreyen Balta | Growl + Moonfire (ranged DoT) | I | target_projectile (homing 4 rad/s, no pierce) | 25 (old 14) | 8 s (old 2) | free (old 15 R) | off | 0.7 phys + rend DoT 1.4 over 15 s | applies taunt 3 s (boss 2 s, ICD 12 s) + rend 15 s; return pass removed | maintains rend; Kızıl Ata CD -50 % | bone_projectile (spinning axe) + hit_blood | Throw x1.5 | swing_light / dagger_throw |
| s1 | barbarian_thrash (NEW) | Paralama | Thrash | I | self_aoe r 4 | 4 | 6 s | gen +5 R | on | 0.5 phys per target + bleed DoT 0.4 per stack-tick eq. | applies bleed (cap 3 stacks via StatusApply.maxStacks) 15 s, slow 20 %; 15 % PRD -> gore; Ursoc absorb 35 % | gore (Yarma reset) | spin_slash tinted + blood motes ring | 2H_Melee_Attack_Spin x2.2 | swing_heavy |
| s2 | barbarian_leap (kept, retuned) | Sıçrayış | Wild Charge / Heroic Leap | leap | leap to aim point (range 14) | 14 | 20 s (old 9 s) | gen +20 R | off | 1.2 phys AoE (old 2.2) | slow 40 % 2.5 s | - | leap_land + ground_slam | Jump_Full_Short | jump / ground_slam |
| s3 | barbarian_blood_shield (kept, retuned) | Kan Yenilenmesi | Frenzied Regeneration | I | self_buff | - | 26 s (old 3 s) | cost 10 R | off | heals 32 % max HP over 3 s | applies regen HoT 3 s (magnitude 0.32 max HP); old absorb behaviour removed | - | heal_loop + enrage_aura (green-gold) | Use_Item x2.2 | heal / buff |
| s4 | barbarian_pummel (kept, promoted to baseline) | Yumruk Darbesi | Skull Bash | I | target_instant (melee interrupt) | 3.5 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | interrupt_burst | Unarmed_Melee_Attack_Punch_A x1.5 | interrupt / punch_hit |
| m45 | barbarian_last_stand (kept, retuned) | Son Direniş (Taş Deri) | Barkskin | I | custom:major_last_stand | - | 45 s | gen +20 R (old 30) | off | - | applies last_stand 8 s: -25 % damage taken, CC immune (old: +30 % max HP, 10 s, -20 %) | - | enrage_aura grey-brown (bark texture) | Cheer x1.6 | buff |
| m90 | barbarian_ancestral_tempest (kept, retuned) | Ata Fırtınası | Lunar Beam (damage + defense + heal) | CH 3 s (6 ticks) | custom:tempest, self r 6 (pull 3 m) | 6 | 90 s (WoW 60 s, bucketed; old 50 s) | free (old: min 50 R, consume all) | off | 6 phys per target total (6 ticks); heals 12 % max HP over the channel | -30 % damage taken while channelling (kept `dr 0.3`), unstoppable | - | spin_slash + shockwave rings + heal_loop (vertical shaft look = NEW:ancestral_beam) | 2H_Melee_Attack_Spin x1.0 | swing_heavy / boss_roar x0.3 |
| m180 | barbarian_incarnation (NEW) | Ata Kılığı | Incarnation: Guardian of Ursoc | I | self_buff | - | 180 s | free | off | - | applies ursoc_form 20 s: +15 % max HP, -15 % damage taken, Yarma and Paralama cooldowns x0.5 | Yarma / Paralama refresh visibly (CD sweep halves) | enrage_aura large + carnage_aura (bear-spirit silhouette = NEW:ancestor_bear) | Cheer x1.2 | war_cry / boss_roar x0.4 |

### 4b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| gore | Kanlı Fırsat | Yarma or Paralama hit 15 % PRD (icd 2 s) | next Yarma: cooldown reset, +15 % damage, +5 R | 10 s | barbarian_cleave (rmb) | left, dark red | ProcDef + PROC_MODS {cdReset, more 1.15, consume} |
| gory_maul | Kanlı Kürk: Balta | Demir Duruş cast 20 % PRD | next Ezici Balta costs 0 | 12 s | barbarian_maul (q) | right, red | PROC_MODS {costMult 0, consume} |
| gory_iron | Kanlı Kürk: Demir | Ezici Balta cast 20 % PRD | next Demir Duruş costs 0 | 12 s | barbarian_iron_stance (e) | right, grey-gold | PROC_MODS {costMult 0, consume} |
| iron_stance | Demir Duruş | Demir Duruş cast | +13 % physical damage reduction per stack (max 3), 7 s shared timer | 7 s | - | self aura intensity | existing id retuned: STATUS_RULES {stack stack, max 3}, drop immuneCC |
| last_stand | Son Direniş | m45 cast | -25 % damage, CC immune | 8 s | - | center vignette | existing, numbers retuned |
| ursoc_form | Ata Kılığı | m180 cast | +15 % max HP, -15 % damage, Yarma / Paralama CD x0.5 | 20 s | rmb, s1 | both sides | new status; cooldown multiplier = engine need #4 (`cdMult`) |
| bleed (Paralama stacks) | Kanama | Paralama | physical DoT, 3 stacks max for this application | 15 s | - | - | existing dotstack; StatusApply.maxStacks 3 |
| rend | Parçalama | Kükreyen Balta | single-stack bleed | 15 s | - | - | shared with Arms / Prot (see Arms) |

### 4c) APL

```text
ST:
 1. barbarian_iron_stance if !status:iron_stance || remaining:iron_stance < 1.5 || status:gory_iron   (off-GCD, rage reserve 30)
 2. barbarian_blood_shield if hp < 0.55 && cd == 0
 3. barbarian_axe_throw if !status:rend@tgt || remaining:rend@tgt < 4.5   (also the taunt)
 4. barbarian_thrash if cd == 0 && (stacks:bleed@tgt < 3 || targets >= 2)
 5. barbarian_cleave if status:gore || cd == 0
 6. barbarian_maul if status:gory_maul || resource >= 70
 7. barbarian_last_stand if hp < 0.6 && cd == 0   (never overlap with ancestral_tempest)
 8. barbarian_ancestral_tempest if cd == 0 && targets >= 1
 9. lmb (weapon chain) as filler
AoE:
 1. barbarian_leap if cd == 0 (pull opener)
 2. barbarian_iron_stance (as ST)
 3. barbarian_thrash if cd == 0
 4. barbarian_cleave if status:gore || cd == 0
 5. barbarian_maul if status:gory_maul || resource >= 60   (Raze behaviour: cone 3 targets)
 6. barbarian_ancestral_tempest if cd == 0
 7. barbarian_axe_throw to pick up strays
 8. lmb (weapon chain) as filler
```

### 4d) Budget hand calculation

**Single target, per 60 s (target 70 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (6 chains) | 6.0 | 2.50 | 15.0 | filler + rage |
| Yarma (10 on CD + 2 Kanlı Fırsat resets) | 12.0 | 1.50 | 18.0 | CD 6 s |
| Paralama (hit + maintained bleed share) | 10.0 | 0.90 | 9.0 | CD 6 s |
| Ezici Balta | 5.0 | 2.40 | 12.0 | 40 R each, 2 free via Kanlı Kürk |
| Kükreyen Balta (hit) | 7.5 | 0.70 | 5.3 | taunt cycle 8 s |
| Kükreyen Balta rend DoT (15 s cycles) | 4.0 | 1.40 | 5.6 |  |
| Ata Fırtınası x 60/90 | 0.7 | 6.00 | 4.0 | amortised |
| Ata Kılığı extra Yarma / Paralama casts x 60/180 (+~9 casts) | 1.0 | 3.00 | 3.0 |  |
| **TOTAL** | | | **71.9** | |

**AoE8, 8 targets, 30 s pull (derived target 4.5 x half the ST = 157 ± 20):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (3 chains x ~3 targets) | 3.0 | 7.50 | 22.5 |  |
| Paralama x 8 targets (hit + DoT 0.7) | 5.0 | 9.60 | 48.0 |  |
| Yarma (130 deg, 3 targets) | 5.0 | 4.50 | 22.5 |  |
| Ezici Balta (cone, 1 + 0.5 + 0.5 targets) | 2.5 | 4.80 | 12.0 |  |
| Ata Fırtınası x 8 targets x 30/90 | 0.3 | 48.00 | 16.0 |  |
| Sıçrayış landing x 8 targets (1.5 casts) | 1.5 | 9.60 | 14.4 |  |
| Kükreyen Balta (strays) | 4.0 | 1.50 | 6.0 |  |
| Ata Kılığı extra casts x 30/180 (+~3.5 AoE casts) | 1.0 | 4.00 | 4.0 |  |
| **TOTAL** | | | **145.4** | |

**Active mitigation and resource check.** Active mitigation uptime: Demir Duruş costs 30 R for 7 s with a shared refresh timer; 6.5 casts per minute = 45.5 s = 76 % uptime (>= 60 %), 1 stack = 13 % physical DR, 3 stacks = 39 %. Kan Yenilenmesi (26 s) is the second pillar: one 32 % heal per 26 s. Rage ledger / 60 s: income = chain 24 steps x 5.75 = 138 + Yarma 12 x 12 = 144 + Paralama 10 x 5 = 50 + hits taken ~30 x 2 = 60 + Sıçrayış 3 x 20 = 60 = 452; spend = Demir Duruş 6.5 x 30 = 195 (-20 % with Kanlı Kürk) + Ezici Balta 5 x 40 = 200 (-2 free) + Kan Yenilenmesi 2.3 x 10 = 23 = ~400. The 50 spare rage is the decision budget: dump Ezici Balta or save for a second Demir Duruş stack.

**AoE8 rage ledger / 30 s (new).** Income = chain 12 steps x 5.75 = 69 + Paralama 5 x 5 = 25 + Yarma 5 x 12 = 60 + hits taken ~24 x 2 = 48 + Sıçrayış 1.5 x 20 = 30 = **232**; spend = Demir Duruş 3.25 x 30 = 98 (about 20 % free via Kanlı Kürk = ~78) + Ezici Balta 2.5 x 40 = 100 (about 0.5 free = ~80) + Kan Yenilenmesi 1.2 x 10 = 12 = **~170-210**. The 20-60 R surplus is the decision budget (a third Demir Duruş stack, or 1-2 extra Ezici Balta casts, each a 3-target cone that the table above does not count: headroom).

**Party buff the class brings (CORE §3).** Savaş Narası (class buff): party +5 % physical damage (shared with Kasap; identical copies do not stack).

### 4e) What it feels like

* Rage economy is the game: Yarma / Paralama build, Demir Duruş and Ezici Balta spend, and the bar should live between 30 and 90; capping is visible as a wasted bar pulse.
* Kanlı Kürk makes Demir Duruş and Ezici Balta feed each other with free casts, so there is a pattern to read instead of a fixed rotation; Kanlı Fırsat resets Yarma for a double press.
* Kükreyen Balta is both the ranged taunt (homing, no cast blocking) and the DoT you maintain; Kan Yenilenmesi vs Demir Duruş is a real choice every pull.
* Elden Ring layer unchanged (guard = `Mouse3` / `CapsLock`; weapon guard gauge 60 + 20 spec bonus, parry -> riposte, Kafa Yaran heavy); Ata Fırtınası is the loud cooldown with a pull and -30 % damage.

**Not modelled (by design, slot budget or sources).** Bear Form shapeshift (the Warlord is always a 2H berserker), Galactic Guardian and Moonfire as a separate button, Wild Guardian spirit, Lunation, Survival Instincts, Raze / Ravage / Swipe as separate buttons (Ezici Balta and Kasırga cover them), cat weaving, Ursoc's Guidance, After the Wildfire.

**Signature moment (VFX / SFX detail).** Ata Fırtınası (Lunar Beam analogue): the Warlord plants the axe (0.4 s), a 3 s vertical shaft of pale spirit light rises over a 6 m ring (NEW `ancestral_beam`: additive cone of motes + the existing `spin_slash` blades orbiting at 1.2 rev/s), each of the six ticks pulls enemies 0.5 m inward and adds a merged number, the player heals in green pulses on the 2nd, 4th and 6th tick, trauma 0.1 per tick and a final 0.3 shockwave; the character is unstoppable and the armor plates glow; sfx `swing_heavy` loop + a low `boss_roar` x0.3 at start and `explosion` x0.4 at the end.

## 5. `paladin_protection` — Koruma (Protection Paladin) · TANK

**Resource.** Kutsal Güç (pip `holypower`, max 5, spenders cost 3) + İnanç (faith, 100, regen 5/s: only Word of Glory, Consecration and Judgment cost it, a few points each). Builders: Kutsanmış Çekiç +1, Yargı +1, Hammer of Wrath +1, weapon chain steps 3 and 4 +1 each. Block grants +4 İnanç (class trait).

**Identity.** Holy Power loop: builders -> Doğruluk Kalkanı (active mitigation, 6 s) near 100 % uptime; İntikamcı Kalkan bounce + silence as the interrupt rhythm; Avenging Wrath opener.

### 5a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | paladin_basic (+ _1.._4) (planned) | Kutsal Zincir | auto-attack | I (4 steps) | melee_arc 80-140° / 2.4-3.4 m | 2.4-3.4 | - | gen faith +3/+3/+4/+6; HP +1 on steps 3 and 4 | off | 0.4 / 0.4 / 0.65 / 1.05 (steps 1-2 phys, 3-4 holy), sum 2.5 | - | riposte after parry; block -> +4 faith | slash_arc, holy_slash(planned alias), holy_burst scale 0.4-0.5 | 1H_Melee_Attack_Slice_Horizontal / Block_Attack / Stab / Chop | swing_light, shield_bash, swing_heavy, holy_impact |
| rmb | paladin_blessed_hammer (planned) | Kutsanmış Çekiç | Blessed Hammer | I | self_aoe r 4.2 (3 orbiting hammers, behaviour orbit_hammers) | 4.2 | 3 x 6 s | gen +1 HP, faith 5 | on | 1.2 holy ST (3 x 0.6 = 1.8 if all hammers connect), AoE | applies curse 3 s (hit enemies deal -20 % on their next melee); threat x2.5 | - | holy_hammer x3 orbiting | Spellcast_Raise x2.0 @0.95 | swing_heavy / hammer_hit |
| q | paladin_shield_of_righteous (planned) | Doğruluk Kalkanı | Shield of the Righteous | I | melee_arc 120° / 3.0 m (front cone, needs shield) | 3.0 | - | cost 3 HP | off | 2 holy, max 5 targets | applies righteous 6 s (+40 % armor, +20 % block); 50 % PRD per cast -> shining_light | shining_light glow on s3; Aegis uptime tracker on player frame | shield_bubble scale 0.6 + holy_burst scale 0.5 (brief dome over shield arm) | Block_Attack x1.5 | shield_bash / holy_impact |
| e | paladin_judgement (planned) | Yargı | Judgment (replaced by Hammer of Wrath at < 20 % HP or during Avenging Wrath) | I | target_instant (ranged, LOS) / target_projectile v55 | 20 | 2 x 12 s | gen +1 HP, faith 4 | on | 1.6 holy | applies judged 10 s (target deals -10 % damage) | `replaces {skill: paladin_judgement -> paladin_hammer_of_wrath, whileStatus: wrath_wings \| exec_window}` | holy_projectile + judgement_pillar scale 0.5 (golden sigil on target) | Spellcast_Shoot x1.4 @0.373 | holy_cast / holy_impact |
| e (replaces) | paladin_hammer_of_wrath (planned id, shared with Ret) | Gazap Çekici | Hammer of Wrath | I (thrown) | target_projectile (homing) v36 | 22 | 2 x 8 s | gen +1 HP | on | 2.8 holy (tank patch; Ret 4.0) | usable only under wrath_wings or exec_window (target < 20 % HP, conditional status) | exec_window (ConditionalStatus, hidden) | holy_hammer + holy_burst scale 0.8 | Throw x1.4 @0.615 | swing_heavy / hammer_hit |
| r | paladin_avengers_shield (planned) | İntikamcı Kalkan | Avenger's Shield | I | target_projectile + chain_projectile (3 targets) | 30 | 15 s | free (faith 5) | on | 2.4 holy per target (200 % + 30 %) | silence 3 s on non-player casters (interrupt), taunt first target 3 s (tank patch) | Glory of the Vanguard not modelled | holy_projectile scale 1.2 (white spiral, shield mesh) + block_spark on ricochet | Throw x1.5 @0.615 | swing_light / shield_bash |
| s1 | paladin_consecration (NEW; moved from knight_consecration) | Kutsal Zemin | Consecration | I (ground zone at caster) | ground_aoe atCaster r 5, 12 s | 5 | 9 s | faith 5 | on | 1.2 holy per target (12 ticks x 0.10) | applies slow 15 % to enemies inside; allies inside +3 % armor (Sanctuary note) | - | holy_ground scale 1.2 (pulsing gold ring) | 1H_Melee_Attack_Stab x1.8 @0.56 | ground_slam / holy_cast |
| s2 | paladin_divine_steed (NEW) | İlahi Binek | Divine Steed | dash | dash 10 m then speed buff | 10 | 45 s | free | off | - | applies windrunner-style speed +40 % 3 s (id divine_steed); roots / slows removed on cast | - | charge_trail gold + haste_trail | Running_A x2.0 | whoosh / holy_cast |
| s3 | paladin_word_of_glory (planned) | Işığın Sözü | Word of Glory | I | custom:heal_target (smart: self / ally) | 30 | - | cost 3 HP (0 with shining_light) | on | heal 2.6, +100 % scaled by target missing HP | consumes shining_light; refunds 5 faith when self-cast | shining_light glow (s3) | heal_pillar (gold-white light pillar) | Spellcast_Raise x2.2 @0.95 | heal / holy_cast |
| s4 | paladin_reckoning (planned) | Hesaplaşma | Hand of Reckoning | I | custom:provoke (soft target) | 25 | 8 s | free | off | - | applies taunt 3 s (boss 2 s, ICD 12 s) | - | judgement_pillar scale 0.5 | Cheer x2.2 | holy_cast |
| m45 | paladin_avenging_wrath (planned, spec patch CD 45) | İntikam Kanatları | Avenging Wrath (Righteous Protector 1 min) | I | self_buff | - | 45 s (bucketed from 60 s) | free | off | - | applies wrath_wings 20 s: +10 % damage and healing, +10 % crit; makes Hammer of Wrath usable | burst banner | wings_aura follow + holy_burst scale 1.4 (radiant wings) | Cheer x1.4 | war_cry + holy_cast |
| m90 | paladin_prot_ardent (planned) | Yılmaz Savunucu | Ardent Defender (2 min) | I | self_buff | - | 90 s (bucketed from 120 s) | free | off | - | applies ardent 10 s: -20 % damage; the first lethal hit leaves 25 % HP and ends it; if never triggered, heal 20 % at expiry | - | shield_bubble + heal_burst | Cheer x1.4 | divine_shield |
| m180 | paladin_prot_bulwark (planned, moved from m45) | İlahi Siper | Guardian of Ancient Kings | I | self_buff | - | 180 s (bucketed from 5 min) | free | off | - | applies bulwark 8 s: -45 % damage, reflect 20 % as holy, CC immune | - | shield_bubble tinted 0xffe9a0 (guardian spirit silhouette = NEW:ancient_guardian) | Cheer x1.8 | divine_shield |

### 5b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| righteous | Doğruluk | Doğruluk Kalkanı cast | +40 % armor, +20 % block chance | 6 s | - | self aura (gold dome) | existing StatusId; STATS {armorPct 0.40, blockChance 0.20} |
| shining_light | Parlak Işık | every 2nd Doğruluk Kalkanı (50 % PRD) | next Işığın Sözü costs 0 Holy Power | 15 s | paladin_word_of_glory (s3) | right, gold | ProcDef + PROC_MODS {costMult 0, pipCost 0, consume} |
| exec_window | Gazap Penceresi (hidden) | target < 20 % HP (ConditionalStatus, maintained per frame) | Yargı transforms into Gazap Çekici | while true | e (transform) | - | ProcWatcher `when(p, target)` = engine need #6 |
| wrath_wings | İntikam Kanatları | m45 cast | +10 % damage / healing / crit; Yargı transforms into Gazap Çekici | 20 s | - | center + both | existing StatusId; STATS {dealtMore 0.10, critChance 0.10} |
| judged | Yargılı (target debuff) | Yargı hit | target deals -10 % damage | 10 s | - | - | existing StatusId; STATS {damagePct -0.10} on the target |
| ardent | Yılmaz Savunucu | m90 cast | -20 % damage; lethal-hit save 25 % HP | 10 s | - | center vignette | existing StatusId; `lethal` hook (spec specials) |
| bulwark | İlahi Siper | m180 cast | -45 % damage, reflect 20 %, CC immune | 8 s | - | center vignette gold | existing StatusId |
| forbearance | Cezalandırıldı | Divine Shield / Lay on Hands | blocks a second Divine Shield / Lay on Hands | 90 s | - | - | existing StatusId |

### 5c) APL

```text
ST:
 1. paladin_prot_ardent / paladin_prot_bulwark reactively (not in the DPS list)
 2. paladin_avenging_wrath if cd == 0
 3. paladin_shield_of_righteous if hp >= 3 && (!status:righteous || pips >= 5)
 4. paladin_word_of_glory if status:shining_light && hp < 0.7
 5. paladin_hammer_of_wrath if (status:wrath_wings || target.hp < 0.20) && charges >= 1
 6. paladin_avengers_shield if cd == 0
 7. paladin_judgement if charges >= 1
 8. paladin_blessed_hammer if charges >= 1
 9. paladin_consecration if cd == 0 && !ground:consecration
10. lmb (weapon chain) as filler
AoE:
 1. paladin_avenging_wrath if cd == 0
 2. paladin_consecration if cd == 0
 3. paladin_shield_of_righteous (as ST)
 4. paladin_avengers_shield if cd == 0
 5. paladin_blessed_hammer if charges >= 1
 6. paladin_hammer_of_wrath if wrath_wings
 7. paladin_judgement if charges >= 1
 8. lmb (weapon chain) as filler
```

### 5d) Budget hand calculation

**Single target, per 60 s (target 70 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (6 chains) | 6.0 | 2.50 | 15.0 | filler + 12 HP |
| Kutsanmış Çekiç | 10.0 | 1.20 | 12.0 | 3 charges, 6 s recharge |
| Yargı / Gazap Çekici | 5.0 | 1.60 | 8.0 | 2 charges, 12 s recharge |
| Doğruluk Kalkanı | 7.0 | 2.00 | 14.0 | 3 HP each |
| İntikamcı Kalkan | 4.0 | 2.40 | 9.6 | 15 s |
| Kutsal Zemin (12 ticks) | 6.7 | 1.20 | 8.0 | 9 s CD |
| İntikam Kanatları (+10 % dmg +10 % crit = +15 % for 20 s on ~1.2 coef/s) x 60/45 | 1.3 | 3.60 | 4.8 | amortised |
| **TOTAL** | | | **71.4** | |

**AoE8, 8 targets, 30 s pull (derived target 4.5 x half the ST = 157 ± 20):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (3 chains x ~3 targets) | 3.0 | 7.50 | 22.5 |  |
| Kutsanmış Çekiç (avg 5 targets) | 5.0 | 9.00 | 45.0 |  |
| Kutsal Zemin x 8 targets | 3.3 | 9.60 | 31.7 |  |
| İntikamcı Kalkan (3 targets) | 2.0 | 7.20 | 14.4 |  |
| Doğruluk Kalkanı (cone, 3 targets) | 3.5 | 6.00 | 21.0 |  |
| Yargı | 2.5 | 1.60 | 4.0 |  |
| İntikam Kanatları (+15 % for 20 s on ~5 coef/s) x 30/45 | 0.7 | 15.00 | 10.0 |  |
| **TOTAL** | | | **148.6** | |

**Active mitigation and resource check.** Active mitigation uptime: Doğruluk Kalkanı 6 s per cast, 7 casts per minute = 42 s = 70 % (>= 60 %); Holy Power ledger / 60 s: income = weapon chain 6 chains x 2 = 12 + Kutsanmış Çekiç 10 + Yargı 5 = 27 (+ Gazap Çekici 3 per Avenging Wrath); spend = Doğruluk Kalkanı 7 x 3 = 21 + Işığın Sözü 2 x 3 = 6 = 27, 1 of every 2 Işığın Sözü free (Parlak Işık). Capping at 5 pips is the visible mistake.

**Party buff the class brings (CORE §3).** Bağlılık Aurası (class buff): party takes 3 % less damage (always on, CM3; replaces the old aura-cycle skill).

### 5e) What it feels like

* Holy Power is a visible 5-pip bar; the skill is never wasting a builder at 5 and keeping Doğruluk Kalkanı near always on; Kutsanmış Çekiç and the weapon chain keep it flowing.
* İntikamcı Kalkan is the iconic ranged button: spinning shield, 3 bounces, silence on casters, taunts the first target; it is also your interrupt rhythm (15 s).
* The opener is a statement: İntikam Kanatları (m45), İntikamcı Kalkan, Gazap Çekici in the Wrath window, Doğruluk Kalkanı, Kutsal Zemin on the pack.
* Elden Ring layer unchanged: shield guard (hold `Mouse3` / `CapsLock`, gauge 100, 180°), parry -> 0.5 x W holy reflection (Koruma spec), perfect parry gives +1 HP.

**Not modelled (by design, slot budget or sources).** Divine Guidance stacks on Consecration, Holy Armaments (Holy Bulwark / Sacred Weapon, Lightsmith), Hammer of Light of the Templar tree, Blessing of Spellwarding, Sentinel, Glory of the Vanguard, Shake the Heavens, Divine Toll, Divine Shield, Lay on Hands, Hammer of the Righteous (Blessed Hammer is the modelled builder).

**Signature moment (VFX / SFX detail).** İntikamcı Kalkan (Avenger's Shield): the throw (`Throw` x1.5, hit 0.4 s) releases a large spinning shield mesh (projMesh 2, scale 1.2) with a white spiral trail and a soft ring; each of the three ricochets plays `block_spark` + a metal clang (`shield_bash` pitch +6 % per bounce) and a gold ring on the victim; the first target gets the taunt chevron and a silence glyph (3 s) if casting; the shield returns to the off-hand with a 0.1 s flash; camera trauma 0.05 per bounce, no hit-stop on the attacker; the Holy Power bar does not change, but the bounce count is shown as three small pips on the crosshair.

## 6. `paladin_holy` — Kutsal (Holy Paladin) · HEALER

**Resource.** İnanç = mana (100, Holy patch: regen **1.7/s**, `regenRule mana` x Zeka scaling; weapon chain refunds +2/+2/+4) + Kutsal Güç (pip, max 5, spenders 3). Builders: Kutsal Şok +1, Işık Aşısı Parlaması +1, weapon chain steps 2 and 3 +1 each, Divine Toll +5 (Yargı is folded into chain step 3, see 6a).

**Identity.** Ranged smart healing (party frames / crosshair / lowest ally), Işık Aşısı free Flash of Light beat, Holy Power spend at 5 (Işığın Sözü for one target, Şafak Işığı for many), İlahi Çınlama burst.

### 6a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | paladin_holy_basic (+ _1.._3) (planned) | Işık Oku | Holy Light bolts (heal-bolt weapon chain) | I (3 steps) | target_projectile v45 R26 (heals first ally touched, damages first enemy); step 3 = 3 bolts spread 8° | 26 | - | gen faith +2 / +2 / +4; HP +1 on steps 2 and 3 | off | damage 1.1 / 1.1 / 2.6 holy (step 3 = 3 x 0.87) = 4.8 (Yargı folded in); heal 0.40 / 0.40 / 0.75 (3 x 0.25) = 1.55 | step 3 bolts apply judged 10 s to the enemy hit | riposte window; 15 % PRD on step 3 -> infusion_of_light | holy_projectile, heal_burst on allies, holy_burst small on enemies | Spellcast_Shoot x1.4 / x1.2 | holy_cast, holy_impact, heal |
| rmb | paladin_holy_shock (planned) | Kutsal Şok | Holy Shock | I | custom:heal_target (allyTarget any: ally = heal, enemy under reticle = damage) | 25 | 6 s | cost 6 faith (2.24 % mana scale), gen +1 HP | on | heal 1.43 (1117 % SP x1.1 in 12.1.0) / damage 2 holy | 25 % PRD (icd 3 s) -> infusion_of_light | infusion_of_light | holy_beam (hand to target) + heal_burst / holy_burst | Spellcast_Shoot x1.6 @0.373 | holy_cast / holy_impact / heal |
| q | paladin_flash_of_light (planned) | Işık Parlaması | Flash of Light | C 1.2 s (1.5 x 0.8); instant and free with Işık Aşısı | custom:heal_target (allyTarget friendly, smartPriority injured) | 30 | - | cost 10 faith (0 on proc) | on | heal 2.8 (x1.2 on proc) | consumes infusion_of_light; gen +1 HP on proc | infusion_of_light glow (q), overlay top | holy_beam + heal_burst (white flash) | Spellcast_Raise x1.8 @0.55 | holy_cast / heal |
| e | paladin_word_of_glory (planned) | Işığın Sözü | Word of Glory (Eternal Flame version) | I | custom:heal_target (allyTarget friendly) | 30 | - | cost 3 HP | on | heal 1.4 + HoT 1.6 over 12 s = 3 | applies renew HoT 12 s; heal x1.15 on targets under 35 % HP (Mastery) | pips5 glow (e) at 5 HP | holy_beam + heal_pillar | Spellcast_Raise x2.2 @0.95 | holy_cast / heal_big |
| r | paladin_cleanse (planned) | Arındırma | Cleanse Toxins | I | custom:heal_target (allyTarget friendly) | 30 | 6 s | cost 4 faith | on | heal 0.5 when something was removed | removes up to 2 dispellable debuffs (poison, bleed, curse, slow, root, silence, fear, blind, burn, chill, shock, sunder) | - | holy_beam + heal_burst green-white ripple | Use_Item x2.0 @0.72 | holy_cast |
| s1 | paladin_light_of_dawn (planned) | Şafak Işığı | Light of Dawn (12.1: centered on you) | I | self_aoe r 15 (friendly, up to 5 most injured allies) | 15 | - | cost 3 HP | on | heal 2.2 to each of up to 5 allies | applies dawn_hot (small HoT 4 s, 30 % of the heal) | pips5 glow | heal_burst on each ally + aura_ring r 15 (radiant dome) = NEW:dawn_dome tint | Spellcast_Raise x2.0 @0.95 | holy_cast / heal_big |
| s2 | paladin_divine_steed (NEW, shared with Koruma / Ceza) | İlahi Binek | Divine Steed (baseline paladin class ability, used by all three paladin specs) | dash | dash 10 m then speed buff | 10 | 45 s | free | off | - | applies divine_steed 3 s (+40 % move speed); roots / slows removed on cast | - | charge_trail gold + haste_trail | Running_A x2.0 | whoosh / holy_cast |
| s3 | paladin_divine_shield (kept, retuned: exists in `skills_class_utils.ts`) | İlahi Kalkan | Divine Shield | I | self_buff | - | 300 s | free | off | - | applies invulnerable 8 s; forbearance 90 s | - | shield_bubble (white bubble) | Cheer x1.4 | divine_shield |
| s4 | paladin_rebuke (kept, retuned: exists in `skills_class_utils.ts`) | Azarlama | Rebuke | I | target_instant (melee interrupt) | 3.5 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | interrupt_burst | Unarmed_Melee_Attack_Punch_A x1.8 | interrupt |
| m45 | paladin_divine_toll (NEW) | İlahi Çınlama | Divine Toll | I | self_aoe r 30 (5 Holy Shocks at the most injured allies or nearest enemies) | 30 | 45 s (bucketed from 60 s) | free; gen +5 HP (fills the bar) | off | 5 x 1.43 heal (or 5 x 2 holy on enemies) = 7.15 | each hit may grant infusion_of_light (15 % each, one per cast) | infusion_of_light | NEW:divine_toll (radiant ring pulse from the paladin, 5 beams = holy_beam x5) | Cheer x1.8 @0.3 -> Spellcast_Raise | choir_sting + holy_cast |
| m90 | paladin_avenging_wrath (planned, spec patch) | İntikam Kanatları | Avenging Wrath (Holy) | I | self_buff | - | 90 s (bucketed from 2 min) | free | off | - | applies wrath_wings 20 s: +15 % damage, healing and crit; Kutsal Şok crit +20 % | burst banner with Divine Toll | wings_aura follow + holy_burst scale 1.4 | Cheer x1.4 | war_cry + holy_cast |
| m180 | paladin_holy_aura_mastery (planned, moved from m45) | Aura Ustalığı | Aura Mastery | I | self_aoe r 20 (party) | 20 | 180 s (WoW 3 min) | free | off | - | applies aura_mastery 10 s to the party: -20 % damage taken (Bağlılık Aurası x2 radius / strength) | - | aura_ring scale 2 + holy_burst | Cheer x1.8 @0.3 | aura_on / choir_swell |

### 6b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| infusion_of_light | Işık Aşısı | Kutsal Şok 25 % PRD (icd 3 s); Işık Oku step 3 15 %; İlahi Çınlama 15 % each (max 1) | next Işık Parlaması is instant, free and +20 % stronger, gives +1 HP | 15 s | paladin_flash_of_light (q) | top, pale gold | ProcDef + PROC_MODS {costMult 0, castTimeMult 0, more 1.2, pipGain 1, consume} |
| renew | Yenilenme Işığı | Işığın Sözü (Eternal Flame) | heal-over-time 1.6 coef over 12 s | 12 s | - | - | existing status (hot) |
| dawn_hot | Şafak Işığı HoT | Şafak Işığı | small HoT on healed allies | 4 s | - | - | existing status (hot) |
| wrath_wings | İntikam Kanatları | m90 cast | +15 % damage / healing / crit | 20 s | - | center + both | existing StatusId |
| aura_mastery | Aura Ustalığı | m180 cast | party -20 % damage taken | 10 s | - | center ring | existing StatusId (party via pstatus) |
| judged | Yargılı (target debuff) | Işık Oku step 3 bolt hit (Yargı folded in) | target deals -10 % damage | 10 s | - | - | existing StatusId |
| forbearance | Cezalandırıldı | Divine Shield | blocks a second use of Divine Shield / Lay on Hands | 90 s | - | - | existing StatusId |

### 6c) APL

```text
HEAL PRIORITY (single list, party / raid stream):
 1. paladin_cleanse if ally has dispellable && cd == 0
 2. paladin_divine_toll if cd == 0 && (injured_allies >= 3 || pips <= 1)
 3. paladin_avenging_wrath if cd == 0 && cd:paladin_divine_toll > 30   (right after Divine Toll)
 4. paladin_holy_aura_mastery if raid_damage_spike
 5. paladin_flash_of_light if status:infusion_of_light   (lowest ally)
 6. paladin_holy_shock if cd == 0   (lowest ally; enemy under reticle only if nobody < 90 %)
 7. paladin_light_of_dawn if pips >= 3 && injured_allies >= 3
 8. paladin_word_of_glory if pips >= 5 || (pips >= 3 && ally.hp < 0.6)
 9. paladin_flash_of_light if ally.hp < 0.6
10. lmb (Işık Oku) as filler: refunds faith, +1 HP on steps 2 and 3, step 3 applies judged
AoE:
 1. paladin_divine_toll, paladin_avenging_wrath, paladin_holy_aura_mastery on damage spikes
 2. paladin_light_of_dawn at >= 3 HP and >= 3 injured
 3. paladin_holy_shock on the lowest ally
 4. paladin_word_of_glory only on the tank
 5. lmb filler
```

### 6d) Budget hand calculation

**Healing, per 60 s on a 5-man stream (target 100 ± 5 effective units):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Kutsal Şok (heal casts) | 8.0 | 1.43 | 11.4 | 6 s CD, 2 casts per minute go to enemies |
| Işık Parlaması (6 paid + 2.5 Işık Aşısı) | 8.5 | 2.80 | 23.8 | proc casts +20 % not counted |
| Işığın Sözü (heal + HoT) | 4.0 | 3.00 | 12.0 | 3 HP each |
| Şafak Işığı (avg 3.5 allies hit) | 6.0 | 7.70 | 46.2 | 3 HP each |
| İlahi Çınlama x 60/45 | 1.3 | 7.15 | 9.5 | amortised |
| Işık Oku heal share (6 chains) | 6.0 | 1.55 | 9.3 | only when an ally is touched |
| İntikam Kanatları (+15 % healing for 20 s on ~1.9 coef/s) x 60/90 | 0.7 | 5.70 | 3.8 | amortised |
| Overheal -15 % (5-man stream) | 1.0 | -17.41 | -17.4 | effective healing units |
| **TOTAL** | | | **98.7** | |

**Damage, per 60 s (target 35):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Işık Oku damage share (6 chains, Yargı folded in) | 6.0 | 4.80 | 28.8 | when aimed at enemies |
| Kutsal Şok on enemies | 2.0 | 2.00 | 4.0 |  |
| İntikam Kanatları (+15 % damage) x 60/90 | 0.7 | 1.80 | 1.2 | amortised |
| **TOTAL** | | | **34.0** | |

**Mana check.** Holy Power ledger / 60 s: income = Kutsal Şok 10 + weapon chain steps 2 and 3 (6 chains x 2) 12 + Işık Aşısı Parlaması 2.5 + İlahi Çınlama 5 / 45 s = 6.7 -> 31.2; spend = Işığın Sözü 4 x 3 + Şafak Işığı 6 x 3 = 30 (Yargı is folded into chain step 3, its pips moved to chain step 2). Mana ledger / 60 s (İnanç, pool 100, **regen 1.7 / s**): income = 1.7 x 60 = 102 + Işık Oku refunds 6 chains x 8 = 48 = **150**; spend = Kutsal Şok 10 x 6 = 60 + Işık Parlaması 6 paid x 10 = 60 + Arındırma ~5 x 4 = 20 = **140** (Işığın Sözü, Şafak Işığı and İlahi Çınlama cost Holy Power, not mana; the 20 mana of Yargı left the ledger with the fold). **Net +10 per minute at 100 % of the casts and +3 per minute at 105 % (spend 147)**: the pool stays at ~100 % over 300 s at both ends, so the CORE 5.3 gate (>= 5 % left at 95 % efficiency) holds with a wide margin; only at 110 % casts does it go negative (-4 per minute, 80 % left after 300 s). Mana therefore gates burst spend, not the steady state: ten extra panic Işık Parlaması in a row (100 mana) empty the pool, which then refills at ~2.5 per second (regen 1.7 + refunds ~0.8 while the chain is used). SimBench knob: `healerRegen`.

**Party buff the class brings (CORE §3).** Bağlılık Aurası (class buff): party takes 3 % less damage; Aura Mastery (m180) doubles it for 10 s.

### 6e) What it feels like

* Holy Shock on a 6 s clock keeps the rhythm; the Holy Power bar makes you spend as you gain; Işık Aşısı is the "free cast" beat (button lights, Flash is instant).
* Reactive and ranged (Method): the skill is target choice and timing; party frames are click targets, and the crosshair ally cone gives action-RPG aim assist.
* İlahi Çınlama + İntikam Kanatları is the big heal window: five beams from the paladin to the five most injured allies, +5 Holy Power, then Şafak Işığı pulses.
* The weapon chain (Işık Oku) is both a filler heal and the mana faucet, so stepping out of a heal lull never feels dead.

**Not modelled (by design, slot budget or sources).** Holy Light, Beacon of Virtue / Faith (nothing replaces it), Blessing of Sacrifice, Lay on Hands on the bar (bench), Eternal Flame as its own button (folded into Işığın Sözü), Tyr's Deliverance, Holy Prism, the Season 2 tier-set Infusion variants (sources conflict), Aura Mastery assignment logic.

**Signature moment (VFX / SFX detail).** İlahi Çınlama (Divine Toll): the paladin raises the arm (0.3 s), a gold ring pulses outward to 30 m (`aura_ring` scale 2.5, 0.35 s) and five `holy_beam` lines lock onto the five lowest allies (or nearest enemies), each landing a `heal_burst` with a green `+` number and a chime pitched +4 % per target; the Holy Power bar fills by five pips with a stepped pip sound; the player frame flashes gold and the burst banner appears when İntikam Kanatları is up; trauma 0.1, no hit-stop; sfx `choir_sting` x0.5 + `holy_cast` + five `heal` chimes in 60 ms steps.

## 7. `paladin_retribution` — Ceza (Retribution Paladin) · DPS

**Resource.** Kutsal Güç (pip `holypower`, max 5, spenders cost 3) + İnanç (100, regen 5/s, only a few points per builder). Builders: Haçlı Darbesi +1, Adalet Bıçağı +1, Yargı / Gazap Çekici +1, Küllerin Uyanışı +3, weapon chain steps 3 and 4 +1 each (Crusading Strikes).

**Identity.** Burst windows: Avenging Wrath + İdam Hükmü open Işık Çekici (Hammer of Light) on the Final Verdict button; Küllerin Uyanışı cone; Adalet Savaşı (Art of War) resets Adalet Bıçağı.

### 7a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | paladin_basic (+ _1.._4) (planned) | Kutsal Zincir | auto-attack (Crusading Strikes) | I (4 steps) | melee_arc 80-140° / 2.4-3.4 m | 2.4-3.4 | - | gen faith +3/+3/+4/+6; HP +1 on steps 3 and 4 | off | 0.4 / 0.4 / 0.65 / 1.05 (steps 1-2 phys, 3-4 holy), sum 2.5 | - | riposte after parry; 12 % PRD per hit -> art_of_war (Adalet Savaşı) | slash_arc, holy_slash, holy_burst scale 0.4-0.5 | 1H_Melee_Attack_Slice_Horizontal / Block_Attack / Stab / Chop | swing_light, shield_bash, swing_heavy, holy_impact |
| rmb | paladin_crusader_strike (planned) | Haçlı Darbesi | Crusader Strike / Templar Strike | I | melee_arc 100° / 2.8 m (target_instant for hard target) | 2.8 | 6 s | gen +1 HP, faith 5 | on | 1 holy | opens templar_combo 4 s | `replaces {paladin_crusader_strike -> paladin_templar_slash, whileStatus: templar_combo}` | holy_slash + holy_burst scale 0.45 (gold crescent) | 1H_Melee_Attack_Slice_Diagonal x1.35 @0.38 | swing_heavy / holy_impact |
| rmb (replaces) | paladin_templar_slash (NEW) | Tapınakçı Kılıcı | Templar Slash | I | melee_arc 100° / 2.8 m | 2.8 | - (only inside templar_combo) | free | on | 0.6 holy | consumes templar_combo | follow-up of Haçlı Darbesi | holy_slash (second, reversed arc) | 1H_Melee_Attack_Slice_Horizontal x1.5 | swing_light / holy_impact |
| q | paladin_verdict (planned) | Kutsal Hüküm | Final Verdict | I | melee_arc 140° / 3.2 m (target_instant) | 3.2 | - | cost 3 HP | on | 2.3 holy; +25 % on a judged target | 15 % PRD resets Yargı; crusade stack during wrath_wings | pips5 glow (q) at >= 4 HP before a Crusading Strikes step (cap pressure) | slash_arc_big + holy_burst (downward gold strike) | 1H_Melee_Attack_Chop x1.2 @0.448 | swing_heavy / hammer_hit |
| q (replaces) | paladin_hammer_of_light (NEW) | Işık Çekici | Hammer of Light | I | melee_arc 140° / 3.4 m, primary + up to 7 nearby (50 %) | 3.4 | - | cost 3 HP (cut from 5 in 12.1.0) | on | 3.2 holy primary + 1.6 nearby; hotfix +50 % included | `replaces {paladin_verdict -> paladin_hammer_of_light, whileStatus: hammer_window}`; consumes 1 of 2 stacks | hammer_window glow (q), overlay top | NEW:hammer_of_light (giant white-gold hammer falls onto the target, ring r 4) | Spellcast_Raise x1.6 @0.95 | hammer_hit + explosion x0.3 |
| e | paladin_blade_of_justice (NEW) | Adalet Bıçağı | Blade of Justice | I | target_instant (sword beam, LOS) | 10 | 12 s | gen +1 HP | on | 1.8 holy | consumes art_of_war (CD reset, +25 % damage) | art_of_war glow (e), overlay left | holy_slash + holy_beam short (pale-gold blade streak) | 1H_Melee_Attack_Stab x1.6 @0.56 | swing_heavy / holy_impact |
| r | paladin_judgement (planned) | Yargı | Judgment (replaced by Hammer of Wrath at < 20 % HP or during Avenging Wrath) | I | target_instant (ranged, LOS) / target_projectile v55 | 20 | 12 s (1 charge) | gen +1 HP, faith 4 | on | 1.2 holy | applies judged 10 s (target takes +10 % holy damage from you = Expurgation); 15 % of Kutsal Hüküm hits reset it | `replaces {paladin_judgement -> paladin_hammer_of_wrath, whileStatus: wrath_wings \| exec_window}` | holy_projectile + judgement_pillar scale 0.5 (golden sigil) | Spellcast_Shoot x1.4 @0.373 | holy_cast / holy_impact |
| r (replaces) | paladin_hammer_of_wrath (planned id, shared with Koruma) | Gazap Çekici | Hammer of Wrath | I (thrown) | target_projectile (homing) v36 | 22 | 2 x 8 s | gen +1 HP | on | 4 holy (Koruma patch 2.8) | usable only under wrath_wings or exec_window (target < 20 % HP, conditional status) | exec_window (ConditionalStatus, hidden) | holy_hammer + holy_burst scale 0.8 | Throw x1.4 @0.615 | swing_heavy / hammer_hit |
| s1 | paladin_divine_storm (planned) | İlahi Fırtına | Divine Storm | I | self_aoe r 5.5 (max 8) | 5.5 | - | cost 3 HP | on | 2.3 holy per target | crusade stack during wrath_wings | - | spin_slash tinted 0xffe9a0 + holy_burst (white-gold tornado) | 2H_Melee_Attack_Spin x2.4 @0.6 | swing_heavy / holy_impact |
| s2 | paladin_divine_steed (NEW) | İlahi Binek | Divine Steed | dash | dash 10 m then speed buff | 10 | 45 s | free | off | - | speed +40 % 3 s (divine_steed), cleanses roots / slows | - | charge_trail gold + haste_trail | Running_A x2.0 | whoosh / holy_cast |
| s3 | paladin_wake_of_ashes (NEW) | Küllerin Uyanışı | Wake of Ashes (doubles as a defensive: Sacrosanct Crusade) | I | cone 70° / 12 m (behaviour wake_flames, retuned) | 12 | 30 s | gen +3 HP | on | 2.2 holy + burn 1 over 9 s | applies burn 9 s; stuns demon / undead family 5 s (non-boss); heals the paladin 8 % max HP per enemy hit (max 3) = Sacrosanct Crusade | - | NEW:wake_of_ashes (gold cone shockwave, ember burn) | 1H_Melee_Attack_Stab x1.6 | explosion x0.4 / holy_cast |
| s4 | paladin_rebuke (kept, retuned: exists in `skills_class_utils.ts`) | Azarlama | Rebuke | I | target_instant (melee interrupt) | 3.5 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | interrupt_burst + holy_burst | Unarmed_Melee_Attack_Punch_A x1.8 | interrupt / holy_impact |
| m45 | paladin_ret_execution (planned, moved from m90) | İdam Hükmü | Execution Sentence | I | target_instant (ranged blast, LOS) | 20 | 45 s (bucketed from 60 s) | free | off | 3 holy AoE r 10 + sentenced DoT 0.9 (+0.15 per HP spent during it) | applies sentenced 10 s; opens hammer_window (2 stacks) | hammer_window; burst banner with wings | judgement_pillar (hammer falls from the sky) + holy_burst at primary | Spellcast_Shoot x1.6 @0.373 | holy_cast / explosion x0.3 |
| m90 | paladin_avenging_wrath (planned, spec patch) | İntikam Kanatları | Avenging Wrath | I | self_buff | - | 90 s (bucketed from 2 min) | free | off | - | applies wrath_wings 20 s: +15 % damage and crit (12.1.0 value); opens hammer_window; each HP spent adds a crusade stack (+2 % haste, cap 20 %) | burst banner | wings_aura follow + holy_burst scale 1.4 | Cheer x1.4 | war_cry + holy_cast |
| m180 | paladin_divine_shield (kept, retuned: exists in `skills_class_utils.ts`) | İlahi Kalkan | Divine Shield | I | self_buff | - | 180 s (WoW 5 min, bucketed) | free | off | - | applies invulnerable 8 s (threat x0.5); forbearance 90 s on self (blocks Lay on Hands) | - | shield_bubble (white bubble) | Cheer x1.4 | divine_shield |

### 7b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| art_of_war | Adalet Savaşı | weapon chain hit 12 % PRD (icd 2 s), Haçlı Darbesi 8 % | next Adalet Bıçağı: cooldown reset, +25 % damage | 12 s | paladin_blade_of_justice (e) | left, pale gold | ProcDef + PROC_MODS {cdReset, more 1.25, consume} |
| hammer_window | Işık Çekici Hazır | Avenging Wrath or İdam Hükmü cast | Kutsal Hüküm transforms into Işık Çekici (AoE, 3 HP), 2 casts | 12 s, 2 stacks | paladin_hammer_of_light (q) | top, white-gold | replaces rule; PROC_MODS {consume 1 stack} |
| templar_combo | Tapınakçı Zinciri | Haçlı Darbesi hit | rmb transforms into Tapınakçı Kılıcı | 4 s | rmb (transform) | - | `replaces` rule only (hidden status) |
| exec_window | Gazap Penceresi (hidden) | target < 20 % HP (ConditionalStatus, maintained per frame) | Yargı transforms into Gazap Çekici | while true | r (transform) | - | ProcWatcher `when(p, target)` = engine need #6 |
| judged | Yargılı (target debuff) | Yargı hit | target takes +10 % holy damage from the paladin; Kutsal Hüküm +25 % (Expurgation) | 10 s | - | - | existing StatusId; Ret patch {takenMoreFromSource 0.10} |
| wrath_wings | İntikam Kanatları | m90 cast | +15 % damage and crit chance; Yargı -> Gazap Çekici | 20 s | - | center + both | existing StatusId; STATS {dealtMore 0.15, critChance 0.15} |
| crusade | Sefer | each HP spent during wrath_wings | +2 % attack / cast speed per stack, cap 10 stacks (+20 %) | 20 s | - | self aura | existing StatusId; stack with cap, spec special trait_retribution |
| sentenced | Hükümlü (target debuff) | İdam Hükmü | delayed holy DoT; +0.15 coef per HP spent during it | 10 s | - | - | existing StatusId; dotType holy |
| burn | Yanma | Küllerin Uyanışı | holy burn DoT 9 s | 9 s | - | - | existing status |

### 7c) APL

```text
ST:
 1. paladin_avenging_wrath if cd == 0
 2. paladin_ret_execution if cd == 0
 3. paladin_hammer_of_light if status:hammer_window && pips >= 3
 4. paladin_verdict if pips >= 5 || (pips >= 4 && next_is_lmb_step3or4)
 5. paladin_wake_of_ashes if cd == 0 && pips <= 2
 6. paladin_blade_of_justice if status:art_of_war
 7. paladin_blade_of_justice if cd == 0 && pips <= 4
 8. paladin_hammer_of_wrath if (status:wrath_wings || target.hp < 0.20) && pips <= 4
 9. paladin_judgement if charges >= 1 && pips <= 4
10. paladin_verdict if pips >= 3
11. paladin_crusader_strike if cd == 0 (paladin_templar_slash while status:templar_combo)
12. lmb (weapon chain) as filler
AoE:
 1. paladin_avenging_wrath, paladin_ret_execution on cd
 2. paladin_hammer_of_light if status:hammer_window && pips >= 3
 3. paladin_divine_storm if pips >= 5 || (pips >= 3 && targets >= 3)
 4. paladin_wake_of_ashes if cd == 0 && pips <= 2
 5. paladin_blade_of_justice if status:art_of_war || cd == 0
 6. paladin_judgement / hammer_of_wrath if charges >= 1
 7. paladin_crusader_strike / paladin_templar_slash
 8. lmb (weapon chain) as filler
```

### 7d) Budget hand calculation

**Single target, per 60 s (target 100 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (8 chains) | 8.0 | 2.50 | 20.0 | 16 HP, 12 % art_of_war |
| Haçlı Darbesi | 8.0 | 1.00 | 8.0 | 6 s CD |
| Tapınakçı Kılıcı (follow-up) | 8.0 | 0.60 | 4.8 | no HP |
| Adalet Bıçağı (5 + 1.5 resets) | 6.5 | 1.80 | 11.7 | 12 s CD, art_of_war |
| Yargı | 5.0 | 1.20 | 6.0 |  |
| Gazap Çekici replaces ~2.5 Yargı per Avenging Wrath window (net coef gain) x 0.67 windows | 1.7 | 2.80 | 4.7 | net gain |
| Küllerin Uyanışı (hit + burn) | 2.0 | 3.20 | 6.4 | 30 s |
| Kutsal Hüküm | 7.0 | 2.30 | 16.1 | 3 HP each |
| Işık Çekici (inside windows) | 4.8 | 3.20 | 15.4 | 3 HP each |
| İdam Hükmü (blast + DoT + 6 HP bonus) x 60/45 | 1.3 | 4.80 | 6.4 | 45 s |
| İntikam Kanatları (+15 % for 20 s on ~1.7 coef/s) x 60/90 | 0.7 | 5.10 | 3.4 | amortised |
| **TOTAL** | | | **102.9** | |

**AoE8, 8 targets, 30 s pull (target 225 ± 25):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (cleave, 3 targets, 2.25 chains) | 2.3 | 7.50 | 16.9 |  |
| İlahi Fırtına x 8 targets | 5.2 | 18.40 | 95.7 | 3 HP each |
| Işık Çekici (primary + 7 at 50 %) | 2.0 | 14.40 | 28.8 | AoE pulls open the windows more often |
| Küllerin Uyanışı (cone, packed pull = 8 targets, burn) | 1.0 | 25.60 | 25.6 |  |
| Adalet Bıçağı (single) | 3.3 | 1.80 | 5.9 |  |
| Haçlı Darbesi + Tapınakçı Kılıcı | 4.0 | 1.60 | 6.4 |  |
| Yargı | 2.5 | 1.20 | 3.0 |  |
| İdam Hükmü (blast on 8 targets) x 30/45 | 0.7 | 24.00 | 16.0 |  |
| İntikam Kanatları (+15 % for 20 s on ~7 coef/s) x 30/90 | 0.3 | 21.00 | 7.0 |  |
| **TOTAL** | | | **205.2** | |

**Resource check.** Holy Power ledger / 60 s: income = weapon chain 8 chains x 2 = 16 + Haçlı Darbesi 8 + Adalet Bıçağı 6.5 + Yargı / Gazap Çekici 5 + Küllerin Uyanışı 2 x 3 = 6 = 41.5; spend = Kutsal Hüküm 7 x 3 + Işık Çekici 4.8 x 3 = 35.4 + capped overflow ~ 6 (the visible mistake). Spend-at-5 rule: a 4-pip Kutsal Hüküm right before a chain step 3/4 (Method: 4 HP before a Crusading Strikes auto).

**Party buff the class brings (CORE §3).** Bağlılık Aurası (class buff): party takes 3 % less damage (always on, CM3); identical copies do not stack.

### 7e) What it feels like

* A priority list in your head, not a fixed rotation (Method): builders on cooldown, spend at 5 (or 4 before a weapon-chain step), procs jump the queue.
* Burst is readable: İntikam Kanatları + İdam Hükmü light the q button as Işık Çekici (giant falling hammer, AoE) for two casts; Crusade stacks add haste per HP spent; Yargı turns into Gazap Çekici in the window.
* Küllerin Uyanışı is the clear cooldown beat: cone shockwave, burn, stun on undead / demons (5 s), a small heal (Sacrosanct Crusade); Adalet Savaşı gives the free-feeling extra Adalet Bıçağı.
* Elden Ring layer unchanged (guard = `Mouse3` / `CapsLock`): parry -> riposte (finisher), heavy attack with Ezici Darbe weapon art (mace), poise breaks still reward Kritik Vuruş.

**Not modelled (by design, slot budget or sources).** Divine Toll (bench), Divine Arbiter tier procs, Seal of the Templar, Blessing of Freedom / Protection, Word of Glory, Shield of Vengeance, Crusade as a separate talent button (folded into Avenging Wrath), Truth's Wake, Herald of the Sun tree (the Templar flow is modelled by the `replaces` chains).

**Signature moment (VFX / SFX detail).** Işık Çekici (Hammer of Light): the q button lights with the top overlay; the cast raises the sword (0.95 clip, 0.25 s), a 6 m high white-gold hammer mesh drops onto the primary target in 0.18 s (`hammer_of_light`: additive streak + a ring of 8 hammer shards flying to up to 7 nearby enemies at 50 %), hit-stop 100 ms, trauma 0.3 + 0.1 per extra target, a white flash 60 ms, `crit_burst` on crits; sfx `hammer_hit` + `explosion` x0.3 + choir sting x0.4; the transform ends with a small gold ring and the Final Verdict icon returning; each cast adds a Crusade stack pop on the character.

## 8. `necromancer_bone` — Kemik Muhafızı (Blood Death Knight) · TANK

**Resource.** Öz = Runic Power (100, decays out of combat, `regenRule rage`): +5 Kalp Darbesi, +10 İlik Söken, chain +3 per step. Ölüm Darbesi costs 45. Runes = pip `rune` (max 6, each rune recharges in 10 s = 0.6 rune/s, NEW pip regen): Kalp Darbesi 1, İlik Söken 2. Kemik Zırhı charges = status stacks (max 10).

**Identity.** Bone Shield charges are tangible (İlik Söken refills 3, each hit spends one); Ölüm Darbesi pays back 20 % of damage taken in the last 5 s; Vampiric Blood / Dancing Rune Weapon / Icebound Fortitude as the cooldown ladder; Death Grip pull.

### 8a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | necro_blood_basic (+ _1.._4) (NEW chain, spec basic) | Kemik Orağı Kombosu | auto-attack (RP) | I (4 steps) | melee_arc 90-140° / 2.8-3.4 m (2H skull-scythe staff) | 2.8-3.4 | - | gen +3 / +3 / +3 / +4 Öz | off | 0.45 / 0.45 / 0.55 / 1.05 phys (sum 2.5) | - | riposte window after parry (guard gauge 80) | slash_arc shadow tint, bone_burst on step 4 | 2H_Melee_Attack_Slice / Slice / Stab / Chop | swing_light, swing_heavy, bone_impact |
| rmb | necro_heart_strike (NEW) | Kalp Darbesi | Heart Strike | I (2 hits, behaviour multi_strike) | target_instant (melee) + cleave 1 nearby (arc 90°) | 3.2 | - | cost 1 rune, gen +5 Öz | on | 2 x 0.5 = 1 phys on each of 2 targets | applies slow 20 % 8 s to both | Death Strike cap pressure (Öz >= 75) | slash_arc x2 (twin red arcs) + slow ring | 2H_Melee_Attack_Slice x1.5 | swing_heavy / hit_flesh |
| q | necro_death_strike (NEW) | Ölüm Darbesi | Death Strike | I | target_instant (melee) | 3.2 | - | cost 45 Öz | on | 1.4 phys; heals 20 % of damage taken in the last 5 s (min 7 % max HP) | grants blood_shield absorb = 20 % of the heal (Mastery Kan Kalkanı); consumes - | resource90 glow (>= 75 Öz); heal low-HP glow | hit_blood + heal_burst (red motes drawn into the player) | 2H_Melee_Attack_Stab x1.6 | heavy_hit / heal |
| e | necro_marrowrend (NEW) | İlik Söken | Marrowrend | I | target_instant (melee) | 3.2 | - | cost 2 runes, gen +10 Öz | on | 1.2 phys (x1.5 in 12.1.0 already included) | adds 3 bone_armor charges (max 10, 30 s) | Bone Shield < 5 charges glow (e) | bone_burst + bone_armor orbit pulse (bone-white spike burst) | 2H_Melee_Attack_Chop x1.4 | bone_impact / swing_heavy |
| r | necro_deaths_grip (NEW) | Ölüm Kancası | Death Grip (tank pull and taunt) | I | target_projectile (chain hook, homing) | 30 | 25 s | free | off | - | pulls the target to 3 m (non-boss; boss: taunt only) + taunt 3 s (boss 2 s, ICD 12 s) | - | drain_beam (spectral chain) + hit_magic at the hook | Throw x1.8 @0.615 | whoosh / curse_cast |
| s1 | necro_blood_boil (NEW) | Kan Kaynatma | Blood Boil | I | self_aoe r 5 (ground burst around the caster) | 5 | 2 x 7.5 s | free | on | 1.4 shadow per target (max 8) | applies blood_plague 24 s (DoT 1.4 per target) | Boiling Point not modelled; avoid capping 2 charges | NEW:blood_burst (dark red ground burst ring) | Spellcast_Raise x2.2 @0.95 | corpse_pop / explosion x0.3 |
| s2 | necro_deaths_advance (NEW) | Ölüm Atılışı | Death's Advance | I | self_buff (speed) | - | 25 s | free | off | - | applies deaths_advance 6 s: +40 % move speed, knockback immune | - | charge_trail dark + shadow_burst | Running_A x2.0 | whoosh / shadow_cast |
| s3 | necro_anti_magic_shell (NEW) | Büyü Karşıtı Kalkan | Anti-Magic Shell | I | self_buff | - | 60 s | free | off | absorbs magic damage up to 30 % max HP | applies anti_magic_shell 8 s; +1 Öz per 1 % max HP absorbed (cap 20) | - | shield_bubble tinted violet 0x9b6bff | Spellcast_Raise x2.2 @0.6 | buff / shadow_cast |
| s4 | necro_mind_freeze (NEW) | Zihin Dondurma | Mind Freeze | I | target_instant (ranged interrupt, LOS) | 15 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | frost_burst small on the caster + interrupt_burst | Spellcast_Shoot x2.0 | interrupt / frost_impact |
| m45 | necro_vampiric_blood (NEW) | Vampirik Kan | Vampiric Blood (90 s; 30-45 s with Öz spent) | I | self_buff | - | 45 s base (bucketed; Anger-Management-style, G3: every 20 Öz spent -1 s) | free | off | - | applies vampiric_blood 10 s: +30 % max HP, +30 % healing received, Ölüm Darbesi heals x1.3 | - | enrage_aura tinted red + heal_loop (red mist) | Cheer x1.6 | buff / heartbeat_loop |
| m90 | necro_dancing_rune_weapon (NEW) | Hayalet Orak Dansı | Dancing Rune Weapon (2 min) | I | self_buff | - | 90 s (bucketed from 120 s) | free | off | echo 50 % of Kalp Darbesi / Kan Kaynatma / İlik Söken / Ölüm Darbesi | applies dancing_rune_weapon 12 s: spectral twin weapon, parry chance +30 % | burst banner with Vampiric Blood | shape_echo + blades_shadow (ghost twin blade follows the player) | Spellcast_Raise x1.6 @0.6 | curse_cast / whisper |
| m180 | necro_icebound_fortitude (NEW) | Buz Gibi Sebat | Icebound Fortitude | I | self_buff | - | 180 s | free | off | - | applies icebound 8 s: -30 % damage taken, stun / fear immune (do not overlap with Dancing Rune Weapon) | - | shield_bubble tinted ice-blue 0x8fe3ff + frost_nova small | Cheer x1.8 | ice_chime / buff |

### 8b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| bone_armor | Kemik Zırhı | İlik Söken +3 charges | each charge +3 % damage reduction (and 6 % armor), max 10; a melee hit taken consumes 1 charge (icd 2.5 s); expires after 30 s | 30 s, 10 stacks | necro_marrowrend (e) glow below 5 | player frame stack counter | existing StatusId `bone_armor` retuned: STATUS_RULES {stack stack, max 10}; consume-on-hit hook = engine need #2 |
| blood_plague | Kan Vebası | Kan Kaynatma | shadow DoT on each target | 24 s | - | - | new status; dotType shadow, stack refresh |
| blood_shield | Kan Zırhı | Ölüm Darbesi | absorb = 20 % of the heal done (mastery Kan Kalkanı) | 10 s | - | - | existing absorb status |
| vampiric_blood | Vampirik Kan | m45 | +30 % max HP, +30 % healing received, Ölüm Darbesi x1.3 | 10 s | - | center vignette red | STATS {maxHpPct 0.30, healReceivedPct 0.30} |
| dancing_rune_weapon | Hayalet Orak | m90 | echo 50 % of the four rotation abilities, +30 % parry | 12 s | - | both sides, bone-white | uses the proc DSL `echo(skill, delay 0.2, 0.5)` for the listed skills |
| icebound | Buz Gibi Sebat | m180 | -30 % damage, stun immune | 8 s | - | center vignette ice | STATS {damageReductionPct 0.30}, STATUS_RULES {immuneCC} |
| anti_magic_shell | Büyü Karşıtı Kalkan | s3 | absorbs magic up to 30 % max HP, refunds Öz | 8 s | - | - | absorb status limited to non-physical types |
| deaths_advance | Ölüm Atılışı | s2 | +40 % move speed, knockback immune | 6 s | - | - | STATS {moveSpeedPct 0.40}, STATUS_RULES {immuneKnockback} |

### 8c) APL

```text
ST:
 1. necro_vampiric_blood if cd == 0 && (hp < 0.75 || boss_buster_soon)
 2. necro_death_strike if resource >= 75 || (resource >= 45 && hp < 0.75)
 3. necro_marrowrend if stacks:bone_armor < 5 || remaining:bone_armor < 6
 4. necro_blood_boil if charges >= 2 || !status:blood_plague@tgt
 5. necro_dancing_rune_weapon if cd == 0 (never with necro_icebound_fortitude)
 6. necro_heart_strike if runes >= 3   (rune cap pressure)
 7. necro_death_strike if resource >= 45 && hp < 0.9
 8. necro_blood_boil if charges >= 1
 9. necro_heart_strike if runes >= 1
10. lmb (weapon chain) as filler: Öz +3 per step
AoE:
 1. necro_deaths_grip on strays; necro_blood_boil first (applies blood_plague to all)
 2. necro_marrowrend if stacks:bone_armor < 5
 3. necro_death_strike as ST
 4. necro_heart_strike (cleave 2) for runes
 5. necro_blood_boil if charges >= 1
 6. lmb (weapon chain) as filler
```

### 8d) Budget hand calculation

**Single target, per 60 s (target 70 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (6 chains) | 6.0 | 2.50 | 15.0 | filler + 72 Öz |
| Kalp Darbesi (rune-limited) | 20.0 | 1.00 | 20.0 | 20 runes |
| İlik Söken (24 charges / min) | 8.0 | 1.20 | 9.6 | 16 runes, +80 Öz |
| Ölüm Darbesi | 5.6 | 1.40 | 7.8 | 252 Öz / 45 |
| Kan Kaynatma | 8.0 | 1.40 | 11.2 | 2 x 7.5 s |
| Kan Vebası DoT (maintained, 2.5 applications) | 2.5 | 1.40 | 3.5 | 24 s |
| Hayalet Orak Dansı echo 50 % x 60/90 | 0.7 | 4.86 | 3.2 | amortised |
| **TOTAL** | | | **70.4** | |

**AoE8, 8 targets, 30 s pull (derived target 4.5 x half the ST = 157 ± 20):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (cleave, 4 targets, 3 chains) | 3.0 | 10.00 | 30.0 |  |
| Kalp Darbesi (2 targets) | 10.0 | 2.00 | 20.0 |  |
| Kan Kaynatma x 8 targets (2 stored + 4 recharged) | 6.0 | 11.20 | 67.2 |  |
| Kan Vebası DoT on 8 targets | 8.0 | 1.75 | 14.0 |  |
| İlik Söken | 4.0 | 1.20 | 4.8 |  |
| Ölüm Darbesi | 2.8 | 1.40 | 3.9 |  |
| Hayalet Orak Dansı echo x 30/90 (~3.2 coef/s AoE) | 0.3 | 19.20 | 6.4 | amortised |
| **TOTAL** | | | **146.3** | |

**Active mitigation and resource check.** Active mitigation uptime: Kemik Zırhı (>= 5 charges) is the pillar: İlik Söken adds 3 charges x 8 casts = 24 per minute, the 2.5 s consume ICD caps losses at 24 per minute, so the steady state holds 5-8 charges (~ 80 % uptime at >= 5, 100 % at >= 1) = 15-24 % damage reduction; Ölüm Darbesi (5.6 per minute) heals 20 % of the last 5 s of damage each and adds a Kan Zırhı absorb. Rune ledger / 60 s: income 36 (0.6 / s); spend = Kalp Darbesi 20 + İlik Söken 8 x 2 = 36. Öz ledger: income = Kalp 100 + İlik 80 + chain 72 = 252; spend = Ölüm Darbesi 5.6 x 45 = 252. Expected self-healing share of damage taken ~ 12-16 % (SimBench target 15-30 %: if low, raise Ölüm Darbesi min-heal to 9 %).

**Party buff the class brings (CORE §3).** Ölüm Mührü (class buff): party +3 % versatility.

### 8e) What it feels like

* Bone Shield charges are tangible: bones orbit the player, each hit taken pops one and the stack counter on the frame ticks down; İlik Söken re-arms three.
* Taking hits pays back: Ölüm Darbesi heals for what you took in the last 5 s (red motes pulled into the chest); the skill is pressing it after the hit, not before.
* A rune / Öz juggling loop with only five or six real buttons; Kan Kaynatma charges and rune cap pressure make idle time impossible.
* Ölüm Kancası is the only pull-and-taunt in the game: it yanks stray trash into the pack (boss: taunt only).

**Not modelled (by design, slot budget or sources).** Death and Decay (Crimson Scourge), Consumption / Reaper's Mark (hero trees), Lichborne, Raise Dead, Boiling Point, Coagulopathy, Blood Debt (tier set), Dark Command as a separate button (Ölüm Kancası taunts).

**Signature moment (VFX / SFX detail).** Ölüm Darbesi (Death Strike): the staff thrusts (`2H_Melee_Attack_Stab` x1.6, hit 0.35 s) and, at the hit frame, the damage taken in the last 5 s shows as a ring of red motes (NEW use of `heal_burst` tinted 0xaa1830) that fly from the wound spots on the model into the chest over 0.4 s; the heal number is green and large, a Kan Zırhı absorb ring appears, hit-stop 70 ms and trauma 0.15; the cast is audibly weighty (`heavy_hit` + `hit_flesh` + a low `heal` x0.6) and the rune glyph under the player drops one pip; the more damage was taken, the bigger the mote burst (scales with heal / max HP, cap x2).

## 9. `necromancer_summoner` — Ordu Efendisi (Unholy Death Knight) · DPS

**Resource.** Öz = Runic Power (100, decays out of combat): Çürüten Darbe +15, Ölüm Kırbacı +10, chain +3/+3/+4/0. Ölüm Sarmalı costs 30, Salgın 20. Runes = pip `rune` (max 6, 0.6 rune/s): Çürüten Darbe 2, Ölüm Kırbacı 1, Salgın Çıkışı 1, Ölüler Ordusu 1.

**Identity.** Minion identity: permanent Kemik Ghul (Ghoul pet), Lesser Ghouls summoned by Ölüm Kırbacı, Ölüler Ordusu turns the strike into Ölüm Emri / Salgın Emri; Karanlık Dönüşüm window; Ani Kıyamet free Death Coil.

### 9a) Kit table

| slot | id | TR name | WoW source | cast | targeting | range | CD / charges | cost / gen | GCD | coef + type | statuses applied / consumed | proc links | VFX | anim clip | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | necro_basic (+ _1.._4) (NEW chain, class basic) | Kemik Kırıntıları | auto-attack / pet autos (RP) | I (4 steps) | target_projectile v32 R22 (steps 1-2), staff thrust arc 55° (3), ground burst r 2.4 (4) | 22 | - | gen +3 / +3 / +4 / 0 Öz | off | 0.45 / 0.45 / 0.55 / 1.05 (shadow, shadow, shadow, phys), sum 2.5 | - | Ani Kıyamet 12 % PRD per step 3 / Çürüten Darbe / Ölüm Kırbacı hit | bone_projectile, hit_magic, bone_burst + death_bones (step 4) | Spellcast_Shoot x1.3 (x2) / 2H_Melee_Attack_Stab x1.8 / Spellcast_Raise x2.2 | bone_cast, shadow_impact, bone_impact |
| rmb | necro_scourge_strike (NEW) | Ölüm Kırbacı | Scourge Strike (30 yd in Midnight) | I | target_instant (ranged lash, LOS) | 25 | - | cost 1 rune, gen +10 Öz | on | 0.55 shadow; x1.35 while the target carries vile_contagion | spends 1 vile_contagion stack (erupts plague: +35 % and a 0.5 coef splash to every enemy within 5 m that carries virulent_plague) and summons 1 Lesser Ghoul; 12 % PRD -> sudden_doom | sudden_doom | slash_arc shadow tint + corpse_explosion small (purple-black scythe arc with plague burst) | Spellcast_Shoot x1.5 @0.373 | shadow_cast / shadow_impact |
| rmb (replaces) | necro_death_order (NEW) | Ölüm Emri / Salgın Emri | Death Order / Epidemic Order (Army of the Dead) | I | custom:minion_command (target, or r 5 AoE at >= 3 enemies) | 30 | - | cost 1 rune, gen +10 Öz | on | 2.0 shadow total from the ghouls on one target; cleave 5 targets at 50 % with >= 3 enemies | `replaces {necro_scourge_strike -> necro_death_order, whileStatus: army}`; spends vile_contagion like the strike | army window | curse_ring + grave_rise on the ghouls leaping | Spellcast_Raise x2.4 @0.5 | curse_cast / bone_impact |
| q | necro_death_coil (NEW) | Ölüm Sarmalı | Death Coil | I | target_projectile (homing 5 rad/s, v32) | 30 | - | cost 30 Öz (0 with sudden_doom) | on | 1.6 shadow | consumes sudden_doom; heals the ghoul pet 5 % of its HP | sudden_doom glow (q), overlay top | shadow_projectile + death_nova small (purple bolt) | Spellcast_Shoot x1.5 @0.373 | shadow_cast / shadow_impact |
| e | necro_festering_strike (NEW) | Çürüten Darbe | Festering Strike | I | target_instant (melee, staff thrust) | 3.2 | - | cost 2 runes, gen +15 Öz | on | 0.7 phys | applies vile_contagion +3 stacks (max 3, 20 s) | vile_contagion < 3 glow (e) | poison_burst (green blight drip) + hit_blood | 2H_Melee_Attack_Stab x1.5 @0.56 | swing_heavy / poison_impact |
| r | necro_outbreak (NEW) | Salgın Çıkışı | Outbreak | I | target_instant (ranged, LOS) | 25 | - | cost 1 rune | on | 0.3 shadow + virulent_plague DoT 1.8 over 21 s | applies virulent_plague 21 s (pandemic refresh < 30 %) | plague missing glow (r) | poison_projectile + poison_cloud small (green disease spread) | Spellcast_Shoot x1.5 @0.373 | poison_impact |
| s1 | necro_epidemic (NEW) | Salgın | Epidemic | I | target_instant + AoE r 8 around the target | 30 | - | cost 20 Öz (0 with sudden_doom) | on | 1.6 shadow per target (max 8; lower than Ölüm Sarmalı 1.6 on one target, so Sarmal stays the ST button) | spreads virulent_plague to every enemy hit; consumes sudden_doom | sudden_doom glow (s1) | poison_cloud r 8 + death_nova (purple wave pulse) | Spellcast_Raise x2.0 @0.95 | shadow_impact / corpse_pop |
| s2 | necro_deaths_advance (shared with Blood) | Ölüm Atılışı | Death's Advance | I | self_buff (speed) | - | 25 s | free | off | - | applies deaths_advance 6 s: +40 % move speed, knockback immune | - | charge_trail dark + shadow_burst | Running_A x2.0 | whoosh / shadow_cast |
| s3 | necro_anti_magic_shell (shared with Blood) | Büyü Karşıtı Kalkan | Anti-Magic Shell | I | self_buff | - | 60 s | free | off | absorbs magic damage up to 30 % max HP | applies anti_magic_shell 8 s; refunds Öz | - | shield_bubble tinted violet | Spellcast_Raise x2.2 @0.6 | buff / shadow_cast |
| s4 | necro_mind_freeze (shared with Blood) | Zihin Dondurma | Mind Freeze | I | target_instant (ranged interrupt, LOS) | 15 | 15 s | free | off | no damage | cancels cast; lockout 3 s on trash/elite | - | frost_burst small + interrupt_burst | Spellcast_Shoot x2.0 | interrupt / frost_impact |
| m45 | necro_dark_transformation (NEW) | Karanlık Dönüşüm | Dark Transformation (1 min; the research only says it opens the Reaper's Mark / Festering Scythe window, CD n/v; **the pet x2 + cleave effect below is EFSUN-invented**: the old Shadowlands behaviour, kept so the budget does not depend on the n/v Reaper's Mark numbers) | I | custom:minion_command (the Kemik Ghul pet) + self_buff | 40 | 45 s (bucketed from 60 s) | free | off | pet damage x2 and cleave r 3 for 15 s | applies dark_transformation 15 s: pet x2 damage, Ölüm Sarmalı / Salgın +20 % | burst banner with Ordu | bone_burst on the pet + curse_ring (glowing eyes, dark bolt from caster to pet) | Spellcast_Raise x1.8 @0.6 | curse_cast / boss_roar x0.3 |
| m90 | necro_army_of_the_dead (kept id, retuned) | Ölüler Ordusu | Army of the Dead (1.5 min) | C 1.2 s (hard cast, was channelled) | custom:minion_summon (8 Ordu Ghulü ring r 4.5, 30 s) | - | 90 s (old 70 s) | cost 1 rune (old 50 Öz) | off | ghouls: 0.13 shadow per hit, 1 hit / 1.8 s, 8 ghouls for 30 s | applies army 30 s (strike becomes Ölüm Emri); ghouls ignore the minion cap (group army) | army window | grave_rise ring r 4.5 + shockwave | Spellcast_Long x1.0 | raise_dead / boss_roar x0.4 |
| m180 | necro_icebound_fortitude (shared with Blood) | Buz Gibi Sebat | Icebound Fortitude | I | self_buff | - | 180 s | free | off | - | applies icebound 8 s: -30 % damage taken, stun / fear immune | - | shield_bubble ice-blue + frost_nova small | Cheer x1.8 | ice_chime / buff |

**Minions (GDD_CLASSES_V2 §1.5 framework, rows for `data/minions_kit_necromancer.ts`)**

| id | TR | lifetime / group | stats and attacks | model |
|---|---|---|---|---|
| necro_ghoul | Kemik Ghul | permanent pet, group `pet` cap 1, free respawn after 2 s (scene change) / 10 s (dead) | hpFrac 0.8, armor 0.30; claw every 1.8 s coef 0.40 shadow (r 2.6) | Skeleton_Minion rig, tint 0x9fe08a; Dark Transformation: x2 damage, cleave r 3, scale +15 % |
| necro_lesser_ghoul | Küçük Ghul | timed 8 s, group `lesser` cap 3, summoned per vile_contagion stack spent by Ölüm Kırbacı | hpFrac 0.15; 3 swings coef 0.16 | Skeleton_Minion rig, smaller (scale 0.8), tint 0x7fc070, spawn Spawn_Ground_Skeletons x2.2 |
| necro_army_ghoul | Ordu Ghulü | timed 30 s, group `army` uncapped (8 per cast) | hpFrac 0.2; 1 swing / 1.8 s coef 0.13 | Skeleton_Minion rig, tint 0x9fe08a (replaces plan `necro_skel_rabble`: life 18 -> 30) |

### 9b) Procs and statuses

| id | TR name | trigger | effect | duration | glow skill | overlay side | engine fields (ProcDef / PROC_MODS / STATUS_RULES) |
|---|---|---|---|---|---|---|---|
| vile_contagion | Çürük Bulaşı (target debuff) | Çürüten Darbe +3 stacks (max 3) | Ölüm Kırbacı spends one: +35 % damage, plague eruption splash, Lesser Ghoul summoned | 20 s, 3 stacks | necro_festering_strike glow when < 3 | target frame own-debuff stacks | new status (stack, max 3); spent by the necro_scourge_strike / necro_death_order behaviour |
| virulent_plague | Zehirli Veba (target DoT) | Salgın Çıkışı; Salgın spreads it | shadow DoT | 21 s | necro_outbreak glow when missing | - | new status; dotType shadow, pandemic refresh |
| sudden_doom | Ani Kıyamet | Çürüten Darbe / Ölüm Kırbacı hit 12 % PRD (icd 2 s); chain step 3 12 % | next Ölüm Sarmalı or Salgın costs 0 | 12 s | necro_death_coil (q), necro_epidemic (s1) | top, purple-green | ProcDef + PROC_MODS {costMult 0, consume} on both skills |
| dark_transformation | Karanlık Dönüşüm (**EFSUN-invented effect**, see 9a) | m45 | pet x2 damage + cleave; Ölüm Sarmalı / Salgın +20 % | 15 s | - | both sides, dark | new status; minion modifier read by MinionAI attack coef |
| army | Ölüler Ordusu | m90 | rmb transforms into Ölüm Emri / Salgın Emri | 30 s | rmb (transform) | burst banner | `replaces` rule; status also cap-exempts ghouls |
| icebound / anti_magic_shell / deaths_advance | see Blood | defensives and mobility | shared with Kemik Muhafızı | - | - | - | shared statuses |

### 9c) APL

```text
ST:
 1. necro_outbreak if !status:virulent_plague@tgt || remaining:virulent_plague@tgt < 6.3
 2. necro_dark_transformation if cd == 0 (with necro_army_of_the_dead when both ready)
 3. necro_army_of_the_dead if cd == 0
 4. necro_death_coil if status:sudden_doom
 5. necro_festering_strike if stacks:vile_contagion@tgt < 3 (and runes >= 2)
 6. necro_scourge_strike if stacks:vile_contagion@tgt >= 1  (necro_death_order while status:army)
 7. necro_death_coil if resource >= 30
 8. necro_scourge_strike if runes >= 1 (no stack: filler)
 9. lmb (necro_basic chain) as filler: Öz +3
AoE:
 1. necro_outbreak if !status:virulent_plague@tgt
 2. necro_dark_transformation, necro_army_of_the_dead on cd
 3. necro_epidemic if status:sudden_doom || resource >= 20   (replaces Death Coil at >= 3 targets)
 4. necro_festering_strike if stacks:vile_contagion < 3
 5. necro_scourge_strike (necro_death_order inside army)
 6. lmb filler
```

### 9d) Budget hand calculation

**Single target, per 60 s (target 100 ± 5):**

| ability / line | casts per 60 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (8 chains, 32 steps) | 8.0 | 2.50 | 20.0 | Öz +80 |
| Çürüten Darbe | 6.0 | 0.70 | 4.2 | 12 runes, +90 Öz |
| Ölüm Kırbacı (with eruption) | 18.0 | 0.74 | 13.4 | 18 runes, +180 Öz |
| Ölüm Sarmalı (paid 11.7 + 3 free) | 14.7 | 1.60 | 23.5 | 30 Öz each |
| Salgın Çıkışı (hit + plague DoT) | 3.0 | 2.10 | 6.3 | 3 runes |
| Kemik Ghul autos (33 / min) | 33.0 | 0.36 | 11.9 | pet |
| Karanlık Dönüşüm window (+33 % of pet damage) | 1.0 | 3.92 | 3.9 | amortised 15 s per 45 s |
| Küçük Ghullar (18 per min x 3 swings) | 18.0 | 0.42 | 7.6 | one per Ölüm Kırbacı |
| Ölüler Ordusu (8 ghouls x 16.7 hits) x 60/90 | 0.7 | 17.37 | 11.6 | amortised |
| **TOTAL** | | | **102.3** | |

**AoE8, 8 targets, 30 s pull (target 225 ± 25):**

| ability / line | casts per 30 s | coef per cast | total | note |
|---|---:|---:|---:|---|
| Weapon chain (2.25 chains, burst step cleaves ~2) | 2.3 | 5.00 | 11.3 |  |
| Salgın Çıkışı x 8 targets (hit + plague) | 1.5 | 16.80 | 25.2 |  |
| Salgın x 8 targets (7 paid at 20 Öz + 2 Ani Kıyamet) | 9.0 | 12.80 | 115.2 | replaces Ölüm Sarmalı |
| Ölüm Kırbacı (with eruption + 0.5 splash on 7 plagued targets) | 9.0 | 4.24 | 38.2 |  |
| Çürüten Darbe | 3.0 | 0.70 | 2.1 |  |
| Kemik Ghul (cleave in DT window: x1.5 avg) | 16.5 | 0.54 | 8.9 |  |
| Küçük Ghullar | 9.0 | 0.42 | 3.8 |  |
| Ölüler Ordusu (8 ghouls on 8 targets) x 30/90 | 0.3 | 17.37 | 5.8 |  |
| **TOTAL** | | | **210.4** | |

**Resource check.** Rune ledger / 60 s: income 36 (0.6 / s); spend = Çürüten Darbe 6 x 2 = 12 + Ölüm Kırbacı 18 + Salgın Çıkışı 3 + Ölüler Ordusu 0.67 = 33.7 (the spare ~2 pays Ölüm Emri inside the army window). Öz ledger / 60 s: income = Çürüten 90 + Kırbaç 180 + chain 80 = 350; spend = Ölüm Sarmalı 11.7 x 30 = 351 (+ 3 free via Ani Kıyamet). AoE: Salgın costs 20, 9 casts per 30 s = 7 paid x 20 = 140 Öz + 2 free; AoE income ~ 150 (chain gain +1 per extra target, Çürüten Darbe 3 x 15, Ölüm Kırbacı 9 x 10 = 90 + 45 + chain). Minion share of the ST budget: ~ 35 % (pet 12 + DT 4 + lesser 7.6 + army 11.6 of ~ 102).

**Party buff the class brings (CORE §3).** Ölüm Mührü (class buff): party +3 % versatility (shared with Kemik Muhafızı).

### 9e) What it feels like

* Army of the Dead turns the strike button into a command: Ölüm Emri sends the ghouls leaping onto the target; the whole screen reads "conducting a horde".
* Çürüten Darbe -> three Ölüm Kırbacı is the loop: each strike erupts the plague and spawns a short-lived Lesser Ghoul, so your pack visibly grows and shrinks with your rhythm.
* Karanlık Dönüşüm is the burst window: the ghoul swells, glowing eyes, cleave claws; Ani Kıyamet makes the q button glow for a free Death Coil.
* Simple on paper (Method) so the variety is minion micro: commanding the army, keeping the plague up, spending Öz into Salgın when two or more enemies are around.

**Not modelled (by design, slot budget or sources).** Soul Reaper, Reaper's Mark and Festering Scythe (research: the Dark Transformation window opens them, Reaper's Mark below 35 % target HP, Festering Scythe above it, Soul Reaper spends Lesser Ghoul stacks; every coefficient, cost and cooldown is n/v, so they are **not modelled** and the kit keeps the pet x2 effect marked EFSUN-invented instead; Phase 2 hook: `dark_transformation` already is the window status, so `replaces {necro_scourge_strike -> necro_festering_scythe | necro_reapers_mark, whileStatus: dark_transformation}` rows can be added later without touching the budget rows), Lord of the Dead (Magus of the Dead), Summon Gargoyle / Apocalypse / Unholy Assault (not in the Midnight sources), Forbidden Knowledge, Lichborne, Raise Dead as a button (the pet is automatic), Death Charge (Rider of the Apocalypse hero-tree mobility, from an unverified search summary; the kit's Unholy mobility is Death's Advance on `s2`, shared with Blood, so Death Charge is left out deliberately).

**Signature moment (VFX / SFX detail).** Ölüler Ordusu: the caster plants the staff (`Spellcast_Long`, 1.2 s cast bar, the hard cast of the kit) and eight Ordu Ghulü claw out of the ground in a ring r 4.5 m (`grave_rise` x8 with `Spawn_Ground_Skeletons` x2.2, each with a green wisp), a low `boss_roar` x0.4 + `raise_dead`, trauma 0.3 with a 0.35 s ground shockwave; for 30 s the strike icon reads Ölüm Emri, the 8 ghoul portraits group under the minion frames with a 30 s ring, and every Ölüm Emri makes all ghouls dash to the target (0.25 s, `curse_ring` on landing, merged damage number); 1 hit-stop 60 ms on the first Order only.

## f) Skill-id migration

Disposition words: **kept (retuned)** = same id, numbers / role change; **kept id, role changed** = id survives with a different job; **renamed -> new id** = the old skill maps onto a WoW ability under a new id (old id stays defined, unslotted, until a cleanup pass; talent nodes are re-pointed in f2); **dropped (unslotted)** = SkillDef stays in `SKILLS` but is on no default bar (stays castable if a player's saved bar still has it, see f4); **never defined** = id only exists in `GDD_CLASSES_V2` / the talent trees, no SkillDef was ever written, so it is simply not implemented. Paladin and Nekromant SkillDefs do not exist yet (`data/skillsets/*` are compile-only stubs), so their rows say what the planned id becomes. The only exceptions are the four class-utility rows already defined in `src/data/skills_class_utils.ts` (`paladin_rebuke`, `paladin_divine_shield`, `necro_soul_snap`, `necro_spirit_walk`; PM-00c moves them into per-class files): they are real SkillDefs and are handled as kept (retuned) or dropped (unslotted), never as "planned" or "never defined".

### f1a) Şövalye (knight): existing ids

| old id | disposition | new role in the WoW kit | numbers that change |
|---|---|---|---|
| `knight_basic` (+ `_1.._4`) | kept (retuned) | weapon chain, both specs | coef 1.0/1.05/1.3/2.0 -> 0.45/0.50/0.65/0.90 (Σ 2.5); damage type physical; rage gain x1.75 for Arms (spec stat `resourceGainPct 0.75`), +1 R per extra target hit (max 4) |
| `knight_shield_bash` | kept (retuned) | Koruyucu `rmb` Kalkan Darbesi (Shield Slam); Arms: bench | CD 3 -> 9 s; cost 20 -> gen +15 R; coef 2.2 -> 3.0 (x1.3 with `shield_block`); stun removed |
| `knight_charge` | kept (retuned) | `s2` both specs: Hücum (Charge) / Kalkan Hücumu (Shield Charge) | Arms CD 10 -> 20 s, coef 1.6 -> 1.0, root 1 s instead of stun 1.2; Koruyucu spec patch CD 45 s, stun 1.5 AoE r 3, grants `revenge_ready` + a Kalkan Kaldır charge |
| `knight_radiant_cleave` | kept (retuned) | Arms `s1` Çelik Girdap (Whirlwind + Sweeping Strikes rider); Koruyucu: bench | holy -> physical; cost 30 -> 20 and refunds 2 R per target hit (max 8); coef 2.6 -> 2.0 per target; CD 0; adds `sweeping` (EFSUN-invented rider) |
| `knight_challenge` | kept (retuned) | Koruyucu `m45` Moral Bozma (Demoralizing Shout); Arms: bench | taunt removed, applies `curse` 8 s; gen +15 R (was +30); CD 15 -> 45 s; slot s1 -> m45 |
| `knight_provoke` | kept | Koruyucu `r` Kışkırtma (taunt) | slot q -> r; numbers unchanged |
| `knight_shield_block` | kept (retuned) | Koruyucu `e` Kalkan Kaldır | slot s2 -> e; gains params `store 0.15`, `storeCap 10`, `gainPerBlock 0` and the release on expiry (§g need 12) |
| `knight_ward_of_oath` | kept | Koruyucu `s3` Yemin Siperi (Ignore Pain) | slot unchanged (s3); numbers unchanged |
| `knight_unbroken_bastion` | kept (retuned) | Koruyucu `m180` Sarsılmaz Bastion (Shield Wall) | slot m45 -> m180, CD 45 -> 180 s, duration 10 -> 8 s, heal 10 % removed |
| `knight_shield_wall` | dropped (unslotted) | the hold-channel block is replaced by Kalkan Kaldır + Sarsılmaz Bastion; its stored-damage / release identity moves to `knight_shield_block` (params `store`, `storeCap`, §g need 12) and its talent nodes are re-pointed there (f2) | - |
| `knight_consecration` | dropped (unslotted) | the ability moves to the Paladin as `paladin_consecration` (NEW) | - |
| `knight_war_banner` | dropped (unslotted) | party buff is the passive Sancak (CORE §3) | - |
| `knight_heavens_judgment` | dropped (unslotted) | optional bench "Heroic Leap" later (CD 45 s, 2.4 physical); nodes re-pointed in f2 | - |
| `knight_oath_aegis` | dropped (unslotted) | no Rallying Cry on the bar | - |
| `knight_heroism_call` | dropped (unslotted) | Şövalye is not in the Heroism family (CORE §3); Arms `m180` is `knight_bladestorm` | - |
| `knight_templar_verdict` | renamed -> `knight_mortal_strike` | Arms `rmb` Ölümcül Darbe; the Adalet-pip behaviour `templar` is retired | rmb pip-spender -> 6 s CD, cost 25 R, 3.4 physical |
| `knight_wake_of_flames` | renamed -> `knight_execute` | Arms `q` Cellat Vuruşu, granted by the spec `s05` node | AoE cone builder -> single-target Execute |
| `knight_zeal` | renamed -> `knight_colossus_smash` | Arms `m45` Dev Ezme | self attack-speed buff -> AoE strike + `colossus` debuff window |
| `knight_wings_of_judgment` | renamed -> `knight_avatar` | `m90` Savaş Avatarı, shared by Arms and Koruyucu | +25 % holy damage, +20 % crit, +15 % move -> +20 % damage 20 s |
| `knight_intercept`, `knight_guardian_vow` | kept | class utility rows granted by the class `s05` node | none |

New ids: `knight_mortal_strike`, `knight_execute`, `knight_overpower`, `knight_rend`, `knight_die_by_sword`, `knight_pummel`, `knight_colossus_smash`, `knight_avatar`, `knight_bladestorm`, `knight_revenge`, `knight_thunder_clap`.

### f1b) Barbar (barbarian): existing ids

| old id | disposition | new role in the WoW kit | numbers that change |
|---|---|---|---|
| `barbarian_basic` (+ `_1.._4`) | kept (retuned) | weapon chain | coef 1.1/1.1/1.0/2.2 -> 0.45/0.50/0.45/1.10 (Σ 2.5); gains unchanged (+5/+5/+5/+8) |
| `barbarian_cleave` | kept (retuned) | Savaş Lordu `rmb` Yarma (Mangle); Kasap: bench | CD 0 -> 6 s, cost 25 -> gen +12 R, arc 200 -> 130°, coef 2.4 -> 1.5 |
| `barbarian_leap` | kept (retuned) | `s2` both specs Sıçrayış (Charge / Heroic Leap) | CD 9 -> 20 s, gen +15 -> +20 R, landing coef 2.2 -> 1.2 |
| `barbarian_whirlwind` | kept (retuned) | Kasap `s1` Kasırga (Whirlwind + Meat Cleaver); Savaş Lordu: bench | channel 6 s + 16 R/s -> 2 s channel, gen +3 R per target, applies `meat_cleaver`; ticks 24 x 0.7 -> 8 x 0.38 |
| `barbarian_war_cry` | dropped (unslotted) | becomes the class `s05` utility choice (A); the party buff is the passive Savaş Narası | - |
| `barbarian_fissure` | dropped (unslotted) | none | - |
| `barbarian_axe_throw` | kept (retuned) | Savaş Lordu `r` Kükreyen Balta (ranged taunt + DoT, Growl + Moonfire); Kasap: bench | range 14 -> 25, CD 2 -> 8 s, cost 15 -> 0, `target_projectile`, no return pass, taunt + `rend` |
| `barbarian_blood_rage` | kept (retuned) | Kasap `s3` Kan Hiddeti (Enraged Regeneration) | CD 35 -> 120 s, HP cost removed, -30 % damage taken, lifesteal 8 % |
| `barbarian_ancestral_tempest` | kept (retuned) | Savaş Lordu `m90` Ata Fırtınası (Lunar Beam analogue) | slot r -> m90, min 50 R + consume-all removed, CD 50 -> 90 s, 6 ticks x 1.0, heals 12 % |
| `barbarian_provoke` | dropped (unslotted) | Warlord taunt lives on Kükreyen Balta | - |
| `barbarian_iron_stance` | kept (retuned) | Savaş Lordu `e` Demir Duruş (Ironfur) | 2 charges / 8 s, 5 s, -35 % -> CD 0.5 s, cost 30, 7 s, stacks to 3 (+13 % each); CC immunity removed |
| `barbarian_blood_shield` | kept (retuned) | Savaş Lordu `s3` Kan Yenilenmesi (Frenzied Regeneration) | absorb 20 % -> heal 32 % over 3 s; CD 3 -> 26 s; cost 40 -> 10 R |
| `barbarian_rend` | renamed -> `barbarian_bloodthirst` | Kasap `rmb` Kan Susuzluğu (Fury has no Rend) | bleed stack builder -> 4.5 s CD, +8 R, heals 3 %, Enrage 30 % |
| `barbarian_execute` | kept (retuned) | Kasap `r` İdam | cost 30 -> 25 R, CD 5 -> 0, coef 5.0 -> 3.5, bleedCoef removed, + `sudden_death` |
| `barbarian_last_stand` | kept (retuned) | Savaş Lordu `m45` Son Direniş (Barkskin) | +30 % max HP removed, -20 % -> -25 %, 10 -> 8 s, +30 -> +20 R |
| `barbarian_rallying_roar` | dropped (unslotted) | no Rallying Cry on the bar | - |
| `barbarian_bloodbath` | kept id, role changed | Kasap `rmb` transform Kan Banyosu (Bloodthirst replacement during Pervasızlık) | was `m45` bleed detonation; now 2.2 physical + 25 % bleed rider |
| `barbarian_carnage` | kept (retuned) | Kasap `m90` Pervasızlık (Recklessness) | +35 % damage / +30 % AS / -30 % healing -> +20 % crit, +50 % rage gain, 12 s |
| `barbarian_wolf_howl` | kept (retuned) | Kasap `m180` Kurt Narası (Heroism) | `sated` (Yorgun) 150 -> 600 s per CORE §3; the shared `heroBehavior` default 150 stays for legacy rows |
| `barbarian_pummel`, `barbarian_intimidating_shout` | kept (class utility rows) | `barbarian_pummel` becomes baseline `s4` on both specs (CD 12 -> 15, cost 10 -> 0, silence 3 s); intimidating shout stays the class `s05` B choice | see row |

New ids: `barbarian_thrash`, `barbarian_maul`, `barbarian_incarnation`, `barbarian_rampage`, `barbarian_raging_blow`, `barbarian_crushing_blow`, `barbarian_avatar`.

### f1c) Paladin (planned ids; only the class-utility rows `paladin_rebuke` and `paladin_divine_shield` exist as SkillDefs today)

| planned id (GDD_CLASSES_V2 / talent trees) | disposition | role in the WoW kit |
|---|---|---|
| `paladin_basic` (+ `_1.._4`) | kept (as planned, Σ coef 4.47 -> 2.5) | Koruma / Ceza chain; steps 3 and 4 +1 HP |
| `paladin_holy_basic` (+ `_1.._3`) | kept (as planned) | Kutsal heal-bolt chain (`SpecDef.basic`) |
| `paladin_crusader_strike` | kept | Ceza `rmb` Haçlı Darbesi (Crusader / Templar Strike); bench for the others |
| `paladin_judgement` | kept | Yargı: Koruma `e`, Ceza `r` (transforms into Gazap Çekici for Koruma / Ceza); Kutsal has no Yargı button, its effect (`judged`, damage, +1 HP) is folded into step 3 of `paladin_holy_basic` |
| `paladin_verdict` | kept | Ceza `q` Kutsal Hüküm (Final Verdict) |
| `paladin_avengers_shield` | kept | Koruma `r` İntikamcı Kalkan (interrupt + taunt first target); bench for the others |
| `paladin_shield_of_righteous`, `paladin_blessed_hammer`, `paladin_reckoning` | kept | Koruma `q`, `rmb`, `s4` |
| `paladin_prot_bulwark` | kept, slot changed | Guardian of Ancient Kings: m45 -> `m180` (CD 45 -> 180, -45 %) |
| `paladin_prot_ardent` | kept | Ardent Defender, `m90` |
| `paladin_flash_of_light`, `paladin_holy_shock`, `paladin_word_of_glory`, `paladin_light_of_dawn`, `paladin_cleanse` | kept | Kutsal `q`, `rmb`, `e`, `s1`, `r` |
| `paladin_holy_aura_mastery` | kept, slot changed | Kutsal `m180` (m45 -> m180, CD 180) |
| `paladin_divine_storm` | kept | Ceza `s1` |
| `paladin_hammer_of_wrath` | kept, role changed | Judgment transform (<20 % HP or Avenging Wrath) for Koruma and Ceza; spec `s05` grant for Ceza stays |
| `paladin_ret_execution` | kept, slot changed | Execution Sentence, `m90` -> `m45` |
| `paladin_avenging_wrath` | kept (shared) | `m45` Koruma (CD 45), `m90` Kutsal and Ceza (CD 90) via spec patch |
| `paladin_rebuke`, `paladin_divine_shield` | kept (retuned) | real SkillDefs today (`skills_class_utils.ts`, `unlockLevel 99`, granted by the class `s05` talent node). `paladin_rebuke`: baseline `s4` for Kutsal and Ceza through `SpecDef.unlock` (Koruma `s4` is Hesaplaşma and its interrupt is İntikamcı Kalkan; Rebuke stays the class `s05A` talent choice there and is **not** in Koruma's `SpecDef.skills`); retune: cost 10 -> 0, CD 15 kept, range 4 -> 3.5, the +1 Holy Power pip removed (no ledger counts it), silence 3 s kept. `paladin_divine_shield`: Kutsal `s3` (CD 300 via spec patch), Ceza `m180` (CD 180), Koruma bench; retune: CD 150 -> 180, duration 5 -> 8 s, `defaultSlot m180`, forbearance 90 s kept |
| `paladin_lay_on_hands` | kept | bench (class `s25` talent node keeps modifying it) |
| `paladin_hammer_of_justice` | dropped (never defined) | optional Phase 2 bench stun |
| `paladin_aura` | dropped (never defined) | the aura is the passive Bağlılık Aurası (CORE §3); `aura_might`, `aura_clarity`, `aura_devotion` StatusIds stay unused |
| `paladin_holy_sanctuary` | dropped (never defined) | optional Phase 2 bench (Tyr's Deliverance) |
| `paladin_ret_crusade` | dropped (never defined) | folded into Avenging Wrath (status `crusade` stacks per HP spent) |
| NEW | - | `paladin_consecration` (renamed from `knight_consecration`), `paladin_divine_steed`, `paladin_templar_slash`, `paladin_hammer_of_light`, `paladin_blade_of_justice`, `paladin_wake_of_ashes`, `paladin_divine_toll` |

### f1d) Nekromant (planned ids; only the class-utility rows `necro_soul_snap` and `necro_spirit_walk` exist as SkillDefs today)

| planned id | disposition | role in the WoW kit |
|---|---|---|
| `necro_basic` (+ `_1.._4`) | kept (as planned, Σ 4.71 -> 2.5) | Ordu Efendisi (Unholy) ranged chain |
| `necro_army_of_the_dead` | kept, retuned | Unholy `m90` Ölüler Ordusu: `r` 70 s ultimate -> m90, 1 rune, 30 s ghouls, hard cast 1.2 s |
| `necro_bone_spear`, `necro_raise_skeleton`, `necro_corpse_explosion`, `necro_bone_prison`, `necro_curse_decay`, `necro_blood_siphon`, `necro_bone_armor` (skill), `necro_golem`, `necro_command_army`, `necro_sm_frenzy`, `necro_sm_bone_knights`, `necro_bone_storm`, `necro_blood_surge`, `necro_bn_bone_spirit`, `necro_bn_lich_form` | dropped (never defined) | caster-necromancer kit replaced by the two Death Knight kits; `bone_armor` survives as the Bone Shield **status**; corpses (`G.corpses`, NC45) are not needed by either kit |
| `necro_soul_snap`, `necro_spirit_walk` | dropped (unslotted) | real SkillDefs today (`skills_class_utils.ts`, granted by `class:necromancer / s05A / s05B`); the kit's interrupt is `necro_mind_freeze` (`s4`) and its mobility `necro_deaths_advance` (`s2`), and f2 re-points both `s05` nodes (`necro_deaths_grip` / `necro_lichborne`), so the rows stay defined (old bars and saves keep resolving) but no node grants them any more | - |
| NEW (Kemik Muhafızı) | - | `necro_blood_basic`, `necro_heart_strike`, `necro_death_strike`, `necro_marrowrend`, `necro_deaths_grip`, `necro_blood_boil`, `necro_vampiric_blood`, `necro_dancing_rune_weapon` |
| NEW (Ordu Efendisi) | - | `necro_scourge_strike`, `necro_death_order`, `necro_death_coil`, `necro_festering_strike`, `necro_outbreak`, `necro_epidemic`, `necro_dark_transformation` |
| NEW (shared) | - | `necro_deaths_advance`, `necro_anti_magic_shell`, `necro_mind_freeze`, `necro_icebound_fortitude`; bench Phase 2: `necro_lichborne` |

### f2) Talent nodes that reference a changed or dropped id

Node reference = `tree / slot+option` (tree key as in `docs/GDD_TALENTS.trees.json`: `class:<id>` or `spec:<id>`; node ids of the generated `talentTrees/raw/*.ts` use the same slot / option). **New fx** replaces the old `fx` string in the JSON (PM-TAL); the Turkish `name` / `desc` of a node is regenerated from the new fx, with the suggested new name where the old name mentions a dropped skill, the Adalet pip or holy flavour. Every skill id in a new fx exists in §1-§9 or in f1 (checked by script: 0 unknown ids, 0 dropped ids left in the 13 trees). Nodes of these trees that are not listed need no change.

**Param contract (script check in PM-TAL).** Every `p.<key>` in a new fx must exist in the target skill's `params` once its package has landed. Keys used below: `p.store` / `storeCap` on `knight_shield_block` (§g need 12; the draft re-point of s12 to `knight_unbroken_bastion` had no `store` param and is gone), `p.threatMult` on `barbarian_thrash` (2.0), `barbarian_cleave` (1.5) and `knight_revenge` (1.0, 2.0 on the proc), `p.threat` on `knight_charge` (0 default, spec patch 250 for Koruyucu), `p.moveSlow` on `barbarian_whirlwind` (0.6, exists). PM-KN / PM-BA define these keys in their rows.

126 node rows + 24 skill-specialisation rows.

| node | old fx | new fx | new name |
|---|---|---|---|
| `class:barbarian / s05A` | `G barbarian_pummel` | `G barbarian_war_cry` |  |
| `class:barbarian / s11` | `M barbarian_whirlwind costx=.85 p.moveSlow*=0.5` | `M barbarian_whirlwind dmgx=1.1 p.moveSlow*=0.5` |  |
| `class:barbarian / s12` | `M barbarian_war_cry cd=-3 p.allyMore*=1.5` | `M barbarian_pummel cd=-3` | Yumruk Ustası |
| `class:barbarian / s15B` | `M barbarian_fissure+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25` | `M barbarian_thrash+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25` |  |
| `class:barbarian / s18` | `M barbarian_fissure cd=-3 rng=+3` | `M barbarian_leap cd=-3 rng=+3` | Uzun Sıçrayış |
| `class:barbarian / s25` | `M barbarian_blood_rage costx=.7 sdur=bloodrage:+3` | `M barbarian_blood_rage cdx=.85 sdur=bloodrage:+3` |  |
| `class:barbarian / s26A` | `T cast:barbarian_war_cry => st(near(20),empower,6)` | `T major ch=1 icd=20 => st(near(20),empower,6)` |  |
| `spec:barbarian_warlord / s02A` | `M barbarian_iron_stance cd=-1.5` | `M barbarian_iron_stance costx=.85` | Demir Duruş Ustası |
| `spec:barbarian_warlord / s02B` | `M barbarian_iron_stance dmgx=1.2 stgx=1.3` | `M barbarian_iron_stance sdur=iron_stance:+2` | Uzun Demir Duruş |
| `spec:barbarian_warlord / s04` | `M barbarian_provoke cd=-2 rng=+8` | `M barbarian_axe_throw cd=-2 rng=+8` |  |
| `spec:barbarian_warlord / s11` | `M barbarian_blood_shield absx=1.25` | `M barbarian_blood_shield healx=1.25` | Kalın Kan Yenilenmesi |
| `spec:barbarian_warlord / s13` | `M barbarian_whirlwind p.threatMult*=1.25 costx=.9` | `M barbarian_thrash p.threatMult*=1.25 dmgx=1.1` | Paralama Çemberi |
| `spec:barbarian_warlord / s15B` | `M barbarian_iron_stance st=slow:1.5:.3` | `M barbarian_thrash st=slow:2:.3` |  |
| `spec:barbarian_warlord / s18` | `M barbarian_war_cry cd=-3 sdur=fear:+1` | `M barbarian_axe_throw cd=-1 sdur=taunt:+1` | Meydan Balta |
| `spec:barbarian_warlord / s21` | `M barbarian_rallying_roar rad=+5 sdur=rally:+3` | `M barbarian_ancestral_tempest rad=+2` | Geniş Fırtına |
| `spec:barbarian_warlord / s30A` | `S maxHpPct=.12 threatPct=.15 ;; M barbarian_rallying_roar cdx=.8` | `S maxHpPct=.12 threatPct=.15 ;; M barbarian_incarnation cdx=.8` |  |
| `spec:barbarian_butcher / s02A` | `M barbarian_rend dmgx=1.15 dotx=1.25` | `M barbarian_bloodthirst dmgx=1.15` | Kan Susuzluğu Ustası |
| `spec:barbarian_butcher / s04` | `M barbarian_rend cd=-1 costx=.9` | `M barbarian_rampage costx=.9` | Çılgınlık Hazırlığı |
| `spec:barbarian_butcher / s09A` | `T hit ch=.15 if=tst:bleed => heal(.015)` | `T hit:barbarian_bloodthirst ch=.5 => heal(.015)` |  |
| `spec:barbarian_butcher / s11` | `M barbarian_execute dmgx=1.15 cd=-1` | `M barbarian_execute dmgx=1.15 stgx=1.2` |  |
| `spec:barbarian_butcher / s12` | `M barbarian_whirlwind dmgx=1.1 st=bleed:4:.3` | `M barbarian_whirlwind dmgx=1.1 st=slow:2:.3` | Kasırga Ustası |
| `spec:barbarian_butcher / s13` | `M barbarian_cleave dotx=1.3 sdur=bleed:+2` | `M barbarian_raging_blow dmgx=1.15` | Öfkeli Darbe Ustası |
| `spec:barbarian_butcher / s15A` | `M barbarian_bloodbath cd=-5 dmgx=1.2` | `M barbarian_bloodbath dmgx=1.2 dotx=1.4` |  |
| `spec:barbarian_butcher / s17B` | `M barbarian_axe_throw dotx=1.4 shape=return` | `M barbarian_rampage dmgx=1.1` | Çılgın Kemik |
| `spec:barbarian_butcher / s18` | `M barbarian_fissure cd=-3 st=bleed:5:.4` | `M barbarian_raging_blow cd=-1` | Öfkeli Fay |
| `spec:barbarian_butcher / s26B` | `T kill if=tst:bleed ch=.2 => res(6) ; heal(.02)` | `T kill ch=.2 => res(6) ; heal(.02)` |  |
| `spec:barbarian_butcher / s27` | `M barbarian_ancestral_tempest dmgx=1.15 st=bleed:4:.4` | `M barbarian_carnage cdx=.85` | Kan Yağmuru |
| `spec:barbarian_butcher / s30A` | `S bleedDamagePct=.30 ;; M barbarian_bloodbath dmgx=1.2` | `S damagePct=.05 ;; M barbarian_bloodbath dmgx=1.2` |  |
| `class:knight / s18` | `M knight_shield_wall cd=-4 p.store*=1.5` | `M knight_shield_block cd=-1.5 p.store*=1.5` | Kalkan Kaldır: Sabır |
| `class:knight / s21` | `M knight_consecration radx=1.15 dmgx=1.2` | `M knight_avatar sdur=avatar:+3` | Avatar Uzatma |
| `class:knight / s25` | `M knight_war_banner sdur=banner:+3 p.gainPerSec*=1.5` | `S majorCdrPct=.04 ;; M knight_avatar cdx=.95` | Sancak Yemini |
| `class:knight / s26A` | `T cast:knight_heavens_judgment => st(party,blessed,8)` | `T cast:knight_avatar => st(party,blessed,8)` | Cesaret Şarkısı |
| `class:knight / s27` | `M knight_heavens_judgment cdx=.85 kbx=1.2` | `M knight_avatar cdx=.85 sdur=avatar:+2` | Avatar: Yargı Günü |
| `class:knight / s30A` | `S holyDamagePct=.25 ;; M knight_heavens_judgment dmgx=1.25` | `S meleeDamagePct=.15 ;; M knight_charge dmgx=1.25` | Savaş Efendisi |
| `class:knight / s30B` | `S armorPct=.30 blockChance=.05 ;; M knight_shield_wall cdx=.75` | `S armorPct=.30 blockChance=.05 ;; M knight_unbroken_bastion cdx=.75` |  |
| `spec:knight_protector / s12` | `M knight_shield_wall cdx=.85 p.store*=1.25` | `M knight_shield_block cdx=.85 p.store*=1.25` | Kalkan Kaldır: Yemin |
| `spec:knight_protector / s13` | `M knight_radiant_cleave cost=-5 p.threatMult*=1.2` | `M knight_revenge cost=-5 p.threatMult*=1.2` | İntikam: Tehdit Taşkını |
| `spec:knight_protector / s17B` | `M knight_consecration healx=1.5` | `M knight_ward_of_oath absx=1.15` | Şifa Siperi |
| `spec:knight_protector / s21` | `M knight_oath_aegis rad=+5 sdur=aegis:+2` | `M knight_challenge rad=+4 sdur=curse:+2` | Geniş Moral Bozma |
| `spec:knight_protector / s27` | `M knight_heavens_judgment p.threat+=250 dmgx=1.1` | `M knight_charge p.threat+=250 dmgx=1.1` |  |
| `spec:knight_blademaster / s02A` | `S holyDamagePct=.08 ;; T hit:@basic ch=.15 => pip(adalet,1)` | `S meleeDamagePct=.06 ;; T hit:@basic ch=.15 => res(6)` | Savaş Hızlanması |
| `spec:knight_blademaster / s02B` | `M knight_templar_verdict dmgx=1.15 crit=+.1` | `M knight_mortal_strike dmgx=1.15 crit=+.1` | Ölümcül Hasat |
| `spec:knight_blademaster / s04` | `M knight_templar_verdict stgx=1.3 rng=+0.5` | `M knight_mortal_strike stgx=1.3 rng=+0.5` | Keskin Darbe |
| `spec:knight_blademaster / s05` | `G knight_wake_of_flames` | `G knight_execute` |  |
| `spec:knight_blademaster / s09A` | `S holyDamagePct=.06 ;; T cast:knight_wake_of_flames => buff(flame_ward,4,{damageReductionPct=.12})` | `S meleeDamagePct=.05 ;; T cast:knight_execute => buff(execute_ward,4,{damageReductionPct=.12})` | Cellat Zırhı |
| `spec:knight_blademaster / s09B` | `T cast:knight_charge => pip(adalet,1)` | `T cast:knight_charge => res(10)` | Savaşçı Atılışı |
| `spec:knight_blademaster / s11` | `S aoePct=.08 ;; M knight_wake_of_flames rng=+2 radx=1.15` | `S aoePct=.08 ;; M knight_radiant_cleave radx=1.15 rng=+0.5` | Geniş Girdap |
| `spec:knight_blademaster / s12` | `M knight_radiant_cleave dmgx=1.15 pip=adalet:1` | `M knight_radiant_cleave dmgx=1.15 cost=-5` | Girdap Hasadı |
| `spec:knight_blademaster / s13` | `S critDamage=.10 ;; M knight_heavens_judgment cdx=.85 stgx=1.3` | `S critDamage=.10 ;; M knight_colossus_smash cdx=.85 stgx=1.3` | Dev Ezme Çağrısı |
| `spec:knight_blademaster / s15A` | `M knight_zeal sdur=zeal:+3 ;; T hit:@basic ch=.2 => pip(adalet,1)` | `M knight_colossus_smash sdur=colossus:+3 ;; T hit:@basic ch=.2 => res(6)` | Ezme Ustası |
| `spec:knight_blademaster / s17A` | `M knight_wings_of_judgment sdur=wings:+6` | `M knight_avatar sdur=wings:+6` |  |
| `spec:knight_blademaster / s17B` | `S resourceGainPct=.20 ;; T tick:4 if=pips>=1:adalet&inCombat => pip(adalet,1)` | `S resourceGainPct=.20` | Çabuk Öfke |
| `spec:knight_blademaster / s18` | `S critChance=.01 ;; T cast:knight_templar_verdict ch=.2 => echo(knight_templar_verdict,.5,.4)` | `S critChance=.01 ;; T cast:knight_mortal_strike ch=.2 => echo(knight_mortal_strike,.5,.4)` |  |
| `spec:knight_blademaster / s20` | `M knight_wings_of_judgment+knight_zeal cdx=.9` | `M knight_avatar+knight_colossus_smash cdx=.9` |  |
| `spec:knight_blademaster / s21` | `M knight_consecration dmgx=1.25 radx=1.1` | `M knight_bladestorm dmgx=1.25 radx=1.1` | Fırtına Alanı |
| `spec:knight_blademaster / s26A` | `T cast:knight_templar_verdict if=pips>=5:adalet => st(near(10),blessed,6)` | `T cast:knight_colossus_smash => st(near(10),blessed,6)` | Savaş Fenerı |
| `spec:knight_blademaster / s27` | `T cast:knight_templar_verdict if=pips>=5:adalet => exp(1.2,3.5,holy)` | `T cast:knight_colossus_smash => exp(1.2,3.5,physical)` | Ezme Patlaması |
| `spec:knight_blademaster / s28` | `T cast:knight_templar_verdict => buff(verdict_chain,4,{attackSpeed=.05},max=3)` | `T cast:knight_mortal_strike => buff(verdict_chain,4,{attackSpeed=.05},max=3)` |  |
| `spec:knight_blademaster / s29` | `S critChance=.04 ;; T crit ch=.25 => pip(adalet,1)` | `S critChance=.04 ;; T crit ch=.25 => res(5)` | Cellat Gözü |
| `spec:knight_blademaster / s30A` | `M knight_templar_verdict dmgx=1.3 ;; T cast:knight_templar_verdict if=pips>=5:adalet => rst(knight_wake_of_flames)` | `M knight_mortal_strike dmgx=1.3 ;; T cast:knight_mortal_strike ch=.15 => rst(knight_overpower)` | Ölüm Kasırgası |
| `spec:knight_blademaster / s30B` | `S executeDamagePct=.40 ;; T kill => pip(adalet,2)` | `S executeDamagePct=.40 ;; T kill => res(10)` |  |
| `class:necromancer / s02A` | `S moveSpeedPct=.06 ;; M necro_raise_skeleton cd=-0.5` | `S moveSpeedPct=.06 ;; M necro_deaths_advance cd=-3` |  |
| `class:necromancer / s04` | `M necro_bone_spear dmgx=1.15 rng=+4` | `M necro_death_coil dmgx=1.15 rng=+4` |  |
| `class:necromancer / s05A` | `G necro_soul_snap` | `G necro_deaths_grip` |  |
| `class:necromancer / s05B` | `G necro_spirit_walk` | `G necro_lichborne` |  |
| `class:necromancer / s09A` | `T cast:necro_bone_armor => abs(.1,10)` | `T cast:necro_anti_magic_shell => abs(.1,10)` |  |
| `class:necromancer / s11` | `M necro_raise_skeleton costx=.8 ;; S minionHpPct=.10` | `M necro_anti_magic_shell cdx=.85 ;; S minionHpPct=.10` | Kalkan Ustası |
| `class:necromancer / s12` | `M necro_corpse_explosion radx=1.15 dmgx=1.15` | `M necro_epidemic radx=1.15 dmgx=1.15` | Geniş Salgın |
| `class:necromancer / s13` | `M necro_bone_prison cd=-3 sdur=root:+1` | `M necro_deaths_grip cd=-5` | Kanca Ustası |
| `class:necromancer / s15A` | `M necro_curse_decay radx=1.2 dur=+4` | `M necro_blood_boil radx=1.2 dur=+4` |  |
| `class:necromancer / s15B` | `S lifeSteal=.005 ;; M necro_blood_siphon healx=1.25` | `S lifeSteal=.005 ;; M necro_death_strike healx=1.25` |  |
| `class:necromancer / s18` | `M necro_curse_decay dmgx=1.25` | `M necro_death_coil dmgx=1.25` | Sarmal Ustalığı |
| `class:necromancer / s21` | `M necro_blood_siphon dmgx=1.2 rng=+3` | `M necro_festering_strike dmgx=1.2 rng=+1` | Çürüten Usta |
| `class:necromancer / s25` | `M necro_bone_armor p.armorStacks+=2 cd=-5` | `M necro_vampiric_blood sdur=vampiric_blood:+3` | Vampirik Ustalık |
| `class:necromancer / s26B` | `T cast:necro_bone_armor => st(near(10),fortify,4)` | `T cast:necro_anti_magic_shell => st(near(10),fortify,4)` |  |
| `spec:necromancer_summoner / s02A` | `X trait_summoner{skeletonCap=1}` | `X trait_summoner{lesserGhoulCap=1}` | Büyük Ordu |
| `spec:necromancer_summoner / s02B` | `M necro_golem cd=-5 dmgx=1.2` | `M necro_dark_transformation cd=-5 dmgx=1.2` |  |
| `spec:necromancer_summoner / s04` | `M necro_golem dmgx=1.15 stgx=1.3` | `M necro_scourge_strike dmgx=1.15 stgx=1.3` | Keskin Kırbaç |
| `spec:necromancer_summoner / s05` | `G necro_command_army` | `G necro_epidemic` |  |
| `spec:necromancer_summoner / s09B` | `X trait_summoner{skeletonRevive=.20}` | `X trait_summoner{ghoulRevive=.20}` |  |
| `spec:necromancer_summoner / s11` | `M necro_command_army dmgx=1.25 sdur=taunt:+1` | `M necro_death_order dmgx=1.25` | Emir Gücü |
| `spec:necromancer_summoner / s12` | `M necro_raise_skeleton cd=-0.5 costx=.8` | `M necro_festering_strike costx=.85` | Hızlı Çürüme |
| `spec:necromancer_summoner / s13` | `M necro_corpse_explosion dmgx=1.2 radx=1.1` | `M necro_epidemic dmgx=1.2 radx=1.1` | Yayılan Salgın |
| `spec:necromancer_summoner / s15A` | `M necro_sm_frenzy sdur=frenzy_minions:+4` | `M necro_dark_transformation sdur=dark_transformation:+4` | Dönüşüm Ustası |
| `spec:necromancer_summoner / s15B` | `M necro_sm_bone_knights p.life+=6` | `M necro_army_of_the_dead sdur=army:+6` | Ordu Ustası |
| `spec:necromancer_summoner / s18` | `M necro_golem cdx=.85` | `M necro_dark_transformation cdx=.85` | Ghul Nöbeti |
| `spec:necromancer_summoner / s20` | `M necro_sm_frenzy+necro_sm_bone_knights cdx=.9` | `M necro_dark_transformation+necro_army_of_the_dead cdx=.9` |  |
| `spec:necromancer_summoner / s25` | `M necro_curse_decay radx=1.2 ;; T cast:necro_curse_decay => buff(curse_edge,10,{minionDamagePct=.10})` | `M necro_outbreak radx=1.2 ;; T cast:necro_outbreak => buff(curse_edge,10,{minionDamagePct=.10})` | Veba Gölgesi |
| `spec:necromancer_summoner / s26B` | `T cast:necro_sm_bone_knights => st(near(10),fortify,6)` | `T cast:necro_army_of_the_dead => st(near(10),fortify,6)` |  |
| `spec:necromancer_summoner / s27` | `M necro_command_army cd=-3` | `M necro_dark_transformation cd=-3` | Komuta Zinciri |
| `spec:necromancer_summoner / s30A` | `S minionDamagePct=.25 minionHpPct=.20 ;; M necro_golem cdx=.8` | `S minionDamagePct=.25 minionHpPct=.20 ;; M necro_army_of_the_dead cdx=.8` |  |
| `spec:necromancer_summoner / s30B` | `S shadowDamagePct=.20 minionDamagePct=.15 ;; M necro_command_army dmgx=1.2` | `S shadowDamagePct=.20 minionDamagePct=.15 ;; M necro_death_order dmgx=1.2` |  |
| `spec:necromancer_bone / s02A` | `M necro_bone_storm costx=.85 dmgx=1.1` | `M necro_death_strike costx=.85 dmgx=1.1` | Darbe Ustası |
| `spec:necromancer_bone / s02B` | `T tick:3 if=inCombat => echo(necro_bone_spear,.5,.1)` | `T tick:3 if=inCombat => echo(necro_heart_strike,.5,.1)` | Kalp Yankısı |
| `spec:necromancer_bone / s04` | `M necro_bone_storm rad=+1 dur=+1` | `M necro_blood_boil rad=+1` | Geniş Kaynatma |
| `spec:necromancer_bone / s05` | `G necro_blood_surge` | `G necro_marrowrend` |  |
| `spec:necromancer_bone / s09A` | `T cast:necro_blood_surge => buff(blood_ward,6,{damageReductionPct=.12})` | `T cast:necro_blood_boil => buff(blood_ward,6,{damageReductionPct=.12})` |  |
| `spec:necromancer_bone / s09B` | `T cast:necro_bone_storm => buff(storm_ward,4,{damageReductionPct=.1})` | `T cast:necro_marrowrend => buff(storm_ward,4,{damageReductionPct=.1})` | Kemik Zırhı |
| `spec:necromancer_bone / s11` | `M necro_blood_surge rad=+2 dmgx=1.15` | `M necro_blood_boil rad=+2 dmgx=1.15` |  |
| `spec:necromancer_bone / s12` | `M necro_bone_spear prc=+1 dmgx=1.1` | `M necro_heart_strike dmgx=1.1` | Delici Kalp |
| `spec:necromancer_bone / s13` | `M necro_corpse_explosion dmgx=1.2 p.explChainMult*=1.2` | `M necro_blood_boil dmgx=1.2` | Kaynayan Kan |
| `spec:necromancer_bone / s15A` | `M necro_bn_bone_spirit dmgx=1.2 cd=-5` | `M necro_dancing_rune_weapon sdur=dancing_rune_weapon:+3 cd=-5` | Orak Ustası |
| `spec:necromancer_bone / s15B` | `M necro_bn_lich_form sdur=lich:+5` | `M necro_vampiric_blood sdur=vampiric_blood:+5` | Kan Ustası |
| `spec:necromancer_bone / s17B` | `T hit:necro_bone_spear ch=.1 => res(4)` | `T hit:necro_heart_strike ch=.1 => res(4)` |  |
| `spec:necromancer_bone / s18` | `M necro_bone_prison cd=-3 dmgx=1.2` | `M necro_deaths_grip cd=-3 dmgx=1.2` | Kanca Kemiği |
| `spec:necromancer_bone / s20` | `M necro_bn_bone_spirit+necro_bn_lich_form cdx=.9` | `M necro_dancing_rune_weapon+necro_vampiric_blood cdx=.9` |  |
| `spec:necromancer_bone / s21` | `M necro_blood_siphon healx=1.25 dmgx=1.15` | `M necro_death_strike healx=1.25 dmgx=1.15` | Darbe Emişi |
| `spec:necromancer_bone / s25` | `M necro_curse_decay dmgx=1.25` | `M necro_marrowrend dmgx=1.25` | İlik Lanetı |
| `spec:necromancer_bone / s26A` | `T cast:necro_bn_lich_form => st(party,empower,6)` | `T cast:necro_dancing_rune_weapon => st(party,empower,6)` |  |
| `spec:necromancer_bone / s26B` | `T cast:necro_bn_bone_spirit => heal(.05)` | `T cast:necro_vampiric_blood => heal(.05)` |  |
| `spec:necromancer_bone / s27` | `T cast:necro_bone_storm ch=.15 => echo(necro_bone_storm,.5,.5)` | `T cast:necro_blood_boil ch=.15 => echo(necro_blood_boil,.5,.5)` | Kaynatma Yankısı |
| `spec:necromancer_bone / s30A` | `S physicalDamagePct=.25 ;; M necro_bone_storm dmgx=1.25` | `S physicalDamagePct=.25 ;; M necro_heart_strike dmgx=1.25` |  |
| `spec:necromancer_bone / s30B` | `S shadowDamagePct=.20 castSpeed=.05 ;; M necro_bn_lich_form cdx=.8` | `S shadowDamagePct=.20 castSpeed=.05 ;; M necro_dancing_rune_weapon cdx=.8` |  |
| `class:paladin / s18` | `M paladin_hammer_of_justice cd=-5 sdur=stun:+0.5` | `M paladin_rebuke cd=-3` | Azarlama Ustası |
| `class:paladin / s21` | `M paladin_aura radx=1.3` | `M paladin_divine_steed cd=-5` | Binek Ustası |
| `spec:paladin_protection / s25` | `M paladin_aura radx=1.15` | `M paladin_consecration radx=1.15` | Zemin Muhafızı |
| `spec:paladin_holy / s15B` | `M paladin_holy_sanctuary dur=+4` | `M paladin_divine_toll cd=-5` | Çınlama Ustası |
| `spec:paladin_holy / s21` | `M paladin_holy_aura_mastery+paladin_holy_sanctuary cdx=.9` | `M paladin_holy_aura_mastery+paladin_divine_toll cdx=.9` |  |
| `spec:paladin_holy / s27` | `M paladin_holy_sanctuary rad=+3 healx=1.15` | `M paladin_divine_toll healx=1.15` | Geniş Çınlama |
| `spec:paladin_holy / s30A` | `S healingPct=.20 ;; M paladin_holy_sanctuary cdx=.85` | `S healingPct=.20 ;; M paladin_divine_toll cdx=.85` |  |
| `spec:paladin_retribution / s15A` | `M paladin_ret_crusade sdur=crusade:+4` | `M paladin_avenging_wrath sdur=crusade:+4` |  |
| `spec:paladin_retribution / s20` | `M paladin_ret_crusade+paladin_ret_execution cdx=.9` | `M paladin_avenging_wrath+paladin_ret_execution cdx=.9` |  |
| `spec:paladin_retribution / s21` | `M paladin_hammer_of_justice cd=-4` | `M paladin_blade_of_justice cd=-2` | Hızlı Bıçak |
| `spec:paladin_retribution / s25` | `M paladin_aura radx=1.2` | `M paladin_wake_of_ashes radx=1.2` | Küller Gücü |
| `spec:paladin_retribution / s26A` | `T cast:paladin_ret_crusade => st(party,empower,6)` | `T cast:paladin_avenging_wrath => st(party,empower,6)` |  |
| `spec:paladin_retribution / s30B` | `S critDamage=.25 attackSpeed=.05 ;; M paladin_ret_crusade cdx=.8` | `S critDamage=.25 attackSpeed=.05 ;; M paladin_avenging_wrath cdx=.8` |  |

**Skill-specialisation rows (`skillSpecs[]` in the JSON, `SKILL_SPEC_ROWS`)**: the `skill` key of these rows changes (the 18 rows keyed by a retired signature skill move to its successor; fx strings follow by plain id substitution, one row overridden). Unchanged rows (`knight_shield_bash`, `knight_radiant_cleave`, `barbarian_cleave`, `barbarian_whirlwind`, `barbarian_leap`, `paladin_crusader_strike`, `paladin_judgement`, `paladin_avengers_shield`) stay.

| class | old `skill` -> new `skill` | tier / opt | old fx | new fx |
|---|---|---|---|---|
| knight | `knight_consecration` -> `knight_charge` | 1A | `M knight_consecration st=burn:3:.3` | `M knight_charge st=burn:3:.3` |
| knight | `knight_consecration` -> `knight_charge` | 1B | `T cast:knight_consecration => st(near(8),blessed,6)` | `T cast:knight_charge => st(near(8),blessed,6)` |
| knight | `knight_consecration` -> `knight_charge` | 2A | `M knight_consecration p.atCaster=0` | `M knight_charge rng=+3` |
| knight | `knight_consecration` -> `knight_charge` | 2B | `T cast:knight_consecration => exp(1.0,5,holy)` | `T cast:knight_charge => exp(1.0,5,holy)` |
| knight | `knight_consecration` -> `knight_charge` | 3A | `T cast:knight_consecration => buff(holy_fort,8,{damageReductionPct=.15})` | `T cast:knight_charge => buff(holy_fort,8,{damageReductionPct=.15})` |
| knight | `knight_consecration` -> `knight_charge` | 3B | `M knight_consecration shape=echo:2:1` | `M knight_charge shape=echo:2:1` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 1A | `M necro_bone_spear st=curse_decay:3:1` | `M necro_death_coil st=curse_decay:3:1` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 1B | `M necro_bone_spear st=bleed:5:.4` | `M necro_death_coil st=bleed:5:.4` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 2A | `M necro_bone_spear shape=split:3:.4` | `M necro_death_coil shape=split:3:.4` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 2B | `M necro_bone_spear shape=return` | `M necro_death_coil shape=return` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 3A | `M necro_bone_spear cv=shadow:1 ;; T hit:necro_bone_spear => resp(.02)` | `M necro_death_coil cv=shadow:1 ;; T hit:necro_death_coil => resp(.02)` |
| necromancer | `necro_bone_spear` -> `necro_death_coil` | 3B | `M necro_bone_spear cv=frost:1 st=chill:4:2` | `M necro_death_coil cv=frost:1 st=chill:4:2` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 1A | `T cast:necro_raise_skeleton => st(near(10),fortify,6)` | `T cast:necro_scourge_strike => st(near(10),fortify,6)` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 1B | `T cast:necro_raise_skeleton => st(near(10),haste,6)` | `T cast:necro_scourge_strike => st(near(10),haste,6)` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 2A | `M necro_raise_skeleton shape=echo:.8:1` | `M necro_scourge_strike shape=echo:.8:1` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 2B | `T cast:necro_raise_skeleton => exp(1.0,4,physical)` | `T cast:necro_scourge_strike => exp(1.0,4,physical)` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 3A | `M necro_raise_skeleton cv=fire:1` | `M necro_scourge_strike cv=fire:1` |
| necromancer | `necro_raise_skeleton` -> `necro_scourge_strike` | 3B | `M necro_raise_skeleton cv=poison:1 st=poison:5:.2` | `M necro_scourge_strike cv=poison:1 st=poison:5:.2` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 1A | `M necro_corpse_explosion st=bleed:5:.5` | `M necro_blood_boil st=bleed:5:.5` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 1B | `M necro_corpse_explosion st=curse_decay:4:1` | `M necro_blood_boil st=curse_decay:4:1` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 2A | `M necro_corpse_explosion shape=echo:.5:.6` | `M necro_blood_boil shape=echo:.5:.6` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 2B | `M necro_corpse_explosion shape=split:5:.3` | `M necro_blood_boil shape=split:5:.3` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 3A | `M necro_corpse_explosion cv=poison:1 st=poison:6:.3` | `M necro_blood_boil cv=poison:1 st=poison:6:.3` |
| necromancer | `necro_corpse_explosion` -> `necro_blood_boil` | 3B | `M necro_corpse_explosion cv=shadow:1 ;; T hit:necro_corpse_explosion => res(8)` | `M necro_blood_boil cv=shadow:1 ;; T hit:necro_blood_boil => res(8)` |

### f3) SpecDef passives that change (skill rows excluded, they are in §h)

| spec | old passive | new passive |
|---|---|---|
| `knight_blademaster` | `attackSpeed .10, holyDamagePct .25, critChance .05, meleeDamagePct .10`, special `blademaster_pips` | `meleeDamagePct .10, critChance .05, attackSpeed .05, resourceGainPct .75`, special `trait_anger` (G3) and fx `sudden_death` / `battlelord` rows |
| `knight_protector` | `maxHpPct .30, armorPct .40, blockChance .15, blockAmount .10, threatPct 2.0, damagePct -.25, parryWindow .07` | same without `damagePct` (G10) + fx `T hurt icd=1 => res(3)`; `protector_cheat` (Son Savunma) kept; mods: `knight_shield_bash` cooldown patch removed (threat 300 kept), `knight_charge` cooldown 45; `trait_anger` |
| `barbarian_butcher` | `bleedDamagePct .40, bleedChance .15, executeDamagePct .40, attackSpeed .05, resourceGainPct .20`, special `butcher_bleed_cap` | `executeDamagePct .40, attackSpeed .05, resourceGainPct .20, critChance .05`, special `trait_anger`; `butcher_bleed_cap` removed |
| `barbarian_warlord` | `maxHpPct .30, armorPct .35, lifeSteal .02, threatPct 1.5, damagePct -.25`; special `warlord_rage_armor` max 25 % | same without `damagePct` (G10); `warlord_rage_armor` max 25 % -> 15 % (per point .0025 -> .0015, Ironfur now stacks); fx `T hurt icd=0.5 => res(2)`; `ursoc_fury` absorb 35 % of Paralama and Ezici Balta damage |
| `paladin_protection` | per GDD_CLASSES_V2 §4.5 | as planned (`maxHpPct .30, armorPct .40, blockChance .15, blockAmount .10, healReceivedPct .10, threatPct 2.0`, 20 % of blocks +1 HP, parry reflects 0.5 W holy; the planned `moreDamage 0.75` is dropped, G10) + `mods`: `paladin_avenging_wrath` cooldown 45, `paladin_hammer_of_wrath` coef 2.8 |
| `paladin_holy` | per GDD_CLASSES_V2 §4.5 | as planned (`healingPct .30, resourceRegenPct .25, castSpeed .10, threatPct -.4`, overheal ward 40 %; the planned `moreDamage 0.60` is dropped, G10) + `mainStat int`, faith regen 1.7 / s, `basic paladin_holy_basic` |
| `paladin_retribution` | `holyDamagePct .20, attackSpeed .10, critChance .05`, special `hpGenChance .20` | `hpGenChance` removed (chain steps 3 and 4 give +1 HP explicitly), `auraPower` removed; `mods`: `paladin_avenging_wrath` cooldown 90, `paladin_judgement` statuses `judged` with takenMoreFromSource |
| `necromancer_bone` | role override TANK (CORE §2), `physicalDamagePct .15, resourceRegenPct .25` | `maxHpPct .30, armorPct .35, lifeSteal .03, threatPct 2.0` (no own-damage handicap, G10), `mainStat str`, `basic necro_blood_basic`, special `trait_bone_shield` (consume-on-hit ICD 2.5 s), mastery Kan Kalkanı |
| `necromancer_summoner` | `minionDamagePct .25, minionHpPct .20`, special `skeletonCap 2` | `minionDamagePct .25, minionHpPct .20, shadowDamagePct .10`, `mainStat str`, special `trait_summoner {lesserGhoulCap 3, ghoulRevive 0}` (skeleton cap -> Lesser Ghoul cap) |

### f4) Saved bars

`remapBars` keeps a saved slot while its skill id is still in `SKILLS`; because dropped skills stay defined, existing characters would keep stale bars (for example Kasap with `barbarian_bloodbath` on `m45`). §g need 9: a one-time reset of `specBars[spec]` for the nine specs (`flags['bars.plate1'] = 1`) to the new `defaultBar`, run from `normaliseCharacterSave`. No id alias table is needed.

## g) New engine needs beyond CORE §10 / COMBAT_WOW

Already promised by CM13 / CW packages and **assumed** by these kits (not new): the `s4` slot and `skill_s4 = KeyG` input; `SkillDef.requires`, `procInstant`, `replaces`, `offGcd`; `target_instant` / `target_projectile`; GCD profiles, spell queue, `ProcDef` + `PROC_MODS` + `PRD` + Spell Activation Overlay (CW-02, 03, 04, 07, 08, 09); `execute` behaviour `anyHp` (CW-14); pips API (NC35) and pip HUD (NC36); minion framework NC39-NC44 (Unholy); shared behaviours `chain_projectile`, `orbit_hammers`, `heal_target`, `target_status` (NC48, V2 WP5); `interrupt` behaviour (`combat/skills/utilities.ts`, exists).

**Interplay with the old-kit rows of COMBAT_WOW (CW-03 / CW-11 / Appendix B).** CW-03 already appends the StatusIds `revenge_ready` and `sudden_death`; both stay and are re-bound: `revenge_ready` -> `knight_revenge` (was `knight_shield_bash`), `sudden_death` -> `knight_execute` and `barbarian_execute`. `art_of_justice` (old blademaster, `knight_wake_of_flames`) is dropped, `wrath_return` (old Warlord, `barbarian_cleave` free) is replaced by `gore`, `opportunity` belongs to the rogue group. CW-11's `specs.ts fx` strings for knight / barbarian are replaced by the `fx` of the SpecDef sketches in §h; the `PROC_MODS` rows for `knight_shield_bash` {costMult 0, cdFree, more 1.4} and `knight_wake_of_flames` {cdReset, bonusPips} are deleted and the nine kits' rows (§1-§9 b) are the new data.

The list below is what is **not** covered. Each item is small and justified; owner = the package of §h that implements it.

| # | Need | Why (specs) | Owner |
|---|---|---|---|
| 1 | `PipId 'rune'` + `PipDef.regen { every }` (timed +1 per `every` seconds up to `max`, with a 6-glyph HUD variant) | both Death Knights (WoW's rune juggling is the class identity; `PipDef.decay` only subtracts) | PM-00b |
| 2 | Stack consume-on-hit with ICD: `STATUS_RULES.consumeOnHit { icd }`, applied in `Combat.hitLocalPlayer` after mitigation | Kemik Zırhı (Bone Shield: one charge per melee hit taken, ICD 2.5 s) | PM-00b |
| 3 | `Combat.damageTakenWithin(player, sec)` (ring buffer, last 8 s) + behaviour `heal_self_recent` (`healPctOfRecent`, `minHealPct`) + APL condition `damage_taken_5s` | Ölüm Darbesi (heals 20 % of the last 5 s, min 7 % max HP); the tank APLs read the same number | PM-00b |
| 4 | Status riders in `PROC_MODS` / `STATUS_RULES`: `extraTargets` + `extraMult` (cleave riders `sweeping`, `meat_cleaver`), `cdMult` on listed skills (`ursoc_form`), `takenMoreFromSource` (target takes more damage only from the applier: `colossus`, `judged` Ceza) | Arms, Kasap, Savaş Lordu, Ceza; the global `takenMore` rule (sunder) would turn Dev Ezme into a party buff | PM-00b |
| 5 | Behaviour `multi_strike` (N hits on one target with gap `gap` s, own crit and flinch each, hit-stop only on the last, optional cleave) | Çılgın Hamle (4), Öfkeli Darbe / Kemik Ezici (2), Kalp Darbesi (2 + second target) | PM-00b (file `combat/skills/plateKit.ts`) |
| 6 | Condition watcher `exec_window` (hidden self status while the target HP < 20 %; `ProcWatcher.when(player, target)`). **The same watcher is specified by `docs/kits/casters-rogue.md` (E4 / PK-0, together with `aoe_mode`)**: PM-00b only adds it if PK-0 has not landed, never a second copy | Judgment -> Hammer of Wrath transform (Koruma, Ceza) | PM-00b (or PK-0) |
| 7 | Spend hook `specials.onSpend(player, resource, amount)` -> `reduceCooldown` on `m45` / `m90` / `m180` by `amount / 20` s (`angerPer`, G3) | Anger Management (G3): Arms, Kasap, Koruyucu, Vampirik Kan | PM-00b |
| 8 | Behaviours `grip` (reverse knockback toward the caster to 3 m, bosses: taunt only) and `divine_toll` (n x Holy Shock via `heal_target` on the most injured allies or the nearest enemies, +HP up to the cap) | Ölüm Kancası; İlahi Çınlama | PM-00b |
| 9 | One-time `specBars` reset for the nine specs (`flags['bars.plate1']`, f4) | dropped / moved ids would leave stale bars | PM-00a |
| 10 | `SpecDef.mainStat?` and `SpecDef.basic?` honoured by `Combat.rollOutgoing` / `SkillSystem` (CM2 plans per-spec main stat; `basic` exists for the Simyacı): Kutsal `int`, both Death Knights `str`, `basic` for Kemik Muhafızı and Kutsal | identity of the specs (G2, open question 2) | PM-00a (if CM2 has not landed it) |
| 11 | Per-target resource gain: `params.gainPerTarget` (+ `gainPerTargetMax`) applied once per enemy hit by a `self_aoe` / `melee_arc` skill or chain step; chain-step gains are multiplied by the spec's `resourceGainPct`, ability gains are flat | AoE rage ledgers (1d / 3d): Arms chain +1 (max 4), Çelik Girdap +2 (max 8, against its cost 20), Dev Ezme +5 (max 4); Kasap chain +1 (max 4) and Kasırga +3 (max 5) use the same keys | PM-00b |
| 12 | Block store and release for `knight_shield_block`: while `shield_block` is up, `SkillSystem.onBlocked` adds `store` x blocked amount to a per-status buffer (the code path the old `shield_wall` hold used), and when the status ends or is recast a 4 m / 90° `strikeMany` releases it as flat damage (cap `storeCap` x 300, heavy, knockback 3); `gainPerBlock 0` | keeps the Kalkan Duvarı stored-damage identity and gives `class:knight / s18` and `spec:knight_protector / s12` a real param (f2) | PM-00b (behaviour `shield_block` in `plateKit.ts`) |

**New behaviours (4):** `multi_strike`, `grip`, `divine_toll`, `shield_block`, all in the new file `src/combat/skills/plateKit.ts`; every other row uses an existing behaviour or targeting default (`execute`, `wake_flames` (Küllerin Uyanışı, retuned), `channel_aoe` (Bıçak Fırtınası, Kasırga), `tempest`, `major_*`, `absorb_self`, `heal_target`, `interrupt`, `minion_summon`, `minion_command`, `melee_arc`, `self_aoe`, `self_buff`, `dash`, `leap`).

**New StatusIds (32)**, each needs a `StatusDef` and a `STATUS_RULES` row (new file `src/data/statuses_kit_plate.ts`, merged into `STATUSES` by two lines in `data/statuses.ts`, same pattern as `statuses_talents.ts`):

| id | TR | kind | icon | rule / stats |
|---|---|---|---|---|
| `sudden_death` | Ani Ölüm | buff | `buff-crit` | stack to 2, 12 s; shared Arms / Fury |
| `battlelord` | Savaş Efendisi | buff | `buff-strength` | refresh 8 s |
| `colossus` | Dev Ezme | debuff | `debuff-armor-break` | `takenMoreFromSource 0.30`, 10 s |
| `mortal_wound` | Ölümcül Yara | debuff | `debuff-bleed` | `healMult 0.5`, 10 s |
| `sweeping` | Süpürme | buff | `buff-strength` | rider `extraTargets 2, extraMult 0.6`, 6 s |
| `avatar` | Savaş Avatarı | buff | `buff-strength` | `dealtMore = magnitude` (0.20 / 0.10), cleanse root + slow on apply, 20 s |
| `die_by_sword` | Kılıç Perdesi | buff | `buff-defense` | `damageReductionPct 0.40, parryWindow +0.20`, 8 s |
| `rend` | Parçalama | debuff | `debuff-bleed` | `dotType physical`, `stack refresh`, 15 s, pandemic 30 % |
| `revenge_ready` | İntikam Hazır | buff | `buff-defense` | refresh 6 s |
| `meat_cleaver` | Et Satırı | buff | `buff-strength` | stack 2, rider `extraTargets 3, extraMult 0.6`, 8 s |
| `gore` | Kanlı Fırsat | buff | `buff-strength` | refresh 10 s |
| `gory_maul`, `gory_iron` | Kanlı Kürk: Balta / Demir | buff | `buff-lifesteal` / `buff-defense` | refresh 12 s |
| `ursoc_form` | Ata Kılığı | buff | `buff-defense` | `maxHpPct 0.15, damageReductionPct 0.15`, `cdMult 0.5` on Yarma + Paralama, 20 s |
| `shining_light` | Parlak Işık | buff | `buff-blessing` | refresh 15 s |
| `infusion_of_light` | Işık Aşısı | buff | `buff-blessing` | refresh 15 s |
| `art_of_war` | Adalet Savaşı | buff | `buff-crit` | refresh 12 s |
| `hammer_window` | Işık Çekici Hazır | buff | `buff-blessing` | stack 2, 12 s |
| `templar_combo` | Tapınakçı Zinciri | buff | hidden | 4 s |
| `exec_window` | Gazap Hazır | buff | hidden | ConditionalStatus (need 6) |
| `divine_steed` | İlahi Binek | buff | `buff-haste` | `moveSpeedPct 0.40`, 3 s |
| `blood_plague` | Kan Vebası | debuff | `debuff-poison` | `dotType shadow`, refresh, 24 s |
| `vampiric_blood` | Vampirik Kan | buff | `buff-lifesteal` | `maxHpPct 0.30, healReceivedPct 0.30`, 10 s |
| `dancing_rune_weapon` | Hayalet Orak | buff | `buff-aura` | echo 50 % of four skills, `parryWindow` +, 12 s |
| `icebound` | Buz Gibi Sebat | buff | `buff-defense` | `damageReductionPct 0.30`, `immuneCC`, 8 s |
| `anti_magic_shell` | Büyü Karşıtı Kalkan | buff | `buff-absorb` | magic-only absorb 30 % max HP, 8 s |
| `deaths_advance` | Ölüm Atılışı | buff | `buff-haste` | `moveSpeedPct 0.40`, knockback immune, 6 s |
| `vile_contagion` | Çürük Bulaşı | debuff | `debuff-curse` | stack to 3, 20 s |
| `virulent_plague` | Zehirli Veba | debuff | `debuff-poison` | `dotType shadow`, 21 s, pandemic |
| `sudden_doom` | Ani Kıyamet | buff | `buff-mana-regen` | refresh 12 s |
| `dark_transformation` | Karanlık Dönüşüm | buff | `buff-strength` | 15 s; read by MinionAI for the pet |
| `army` | Ölüler Ordusu | buff | `buff-aura` | 30 s, `replaces` trigger |

Existing StatusIds in `types/skills.ts` that these kits need and that **still have no StatusDef** (NC21 / NC22 were never written): `judged`, `forbearance`, `righteous`, `wrath_wings`, `bulwark`, `ardent`, `aura_mastery`, `crusade`, `sentenced`, `bone_armor` (retuned to the 10-stack Bone Shield). PM-00a defines them too. Retuned existing defs: `iron_stance` (stack to 3, no `immuneCC`), `bastion` (8 s), `last_stand` (-25 %, no max-HP), `carnage` (+20 % crit, +50 % rage gain, no damage / healing malus), `shield_block`, `bloodrage`, `enrage` (called with magnitude 0.15).

**New VFX ids (9)** — every one has an alias in `vfx/aliases.ts` so the kit works before a real preset exists:

| id | look | alias target until implemented |
|---|---|---|
| `colossus_smash` | gold-edged crack decal spreading 0.25 s under the targets, stays 10 s as a faint ring | `shockwave` tinted `0xffd070` + `ground_slam` |
| `blood_burst` | dark red ground burst ring with a few droplets | `death_nova` tinted `0xaa1830` |
| `hammer_of_light` | giant white-gold hammer drops 6 m onto the target, ring r 4, shards to nearby enemies | `holy_hammer` scale 2.5 + `holy_burst` scale 1.2 |
| `wake_of_ashes` | gold cone shockwave 70° / 12 m with ember particles left burning 9 s | `holy_burst` scale 2.0 + `fire_burst` tinted gold |
| `divine_toll` | radiant ring pulse from the caster with five beams | `aura_ring` scale 2.5 + `holy_beam` x5 |
| `ancestral_beam` | vertical shaft of pale spirit light over a 6 m ring (Ata Fırtınası) | `spin_slash` + `heal_loop` + `shockwave` |
| `ancestor_bear` | translucent bear-spirit silhouette around the Savaş Lordu (Ata Kılığı) | `enrage_aura` scale 1.5 + `carnage_aura` |
| `ancient_guardian` | golden guardian-spirit silhouette (İlahi Siper) | `shield_bubble` tinted `0xffe9a0` + `wings_aura` |
| `dawn_dome` | radiant dome r 15 around the paladin (Şafak Işığı) | `aura_ring` scale 3 + `heal_burst` |

**New SFX ids: none.** Every row maps onto the existing ids (`ground_slam`, `heavy_hit`, `hammer_hit`, `holy_cast`, `holy_impact`, `bone_impact`, `curse_cast`, `corpse_pop`, `raise_dead`, `divine_shield`, `interrupt`, `parry`, `proc_gain` and the rest of the COMBAT_WOW CW-12 set). Layering recipes (pitch +4 % per hit, merged numbers, hit-stop caps) follow COMBAT_WOW §2.16-2.17.

## h) Implementation packages (Haiku coders)

Naming: **PM-xx** = plate-melee package. One coder per class, plus one shared package that must run first and serially. Every package ends with `npx tsc --noEmit` = 0 errors and its own dev check file (`src/dev/wow/pm<Class>.ts`, auto-loaded by CW-02's `import.meta.glob('./wow/*.ts')`, run with `window.dev.wow.run('pm<class>.*')` in `dev/combat.html`). Per-class numbers come **verbatim from the kit tables of this file** (§1-§9 a); text in `desc` fields is Turkish, ids English.

### Ownership and conflict rules (read first)

| Shared file | Owner | Rule |
|---|---|---|
| `src/combat/skills/behaviors.ts` | **PM-00b** only | one added import line for the new file `combat/skills/plateKit.ts` (`multi_strike`, `grip`, `divine_toll`, `shield_block`); class packages never edit `behaviors.ts` |
| `src/types/skills.ts` (StatusId), `src/types/common.ts` (PipId), `src/types/classes.ts` (PipDef) | **PM-00a** only | append-only (§g tables) |
| `src/data/statuses.ts` + new `src/data/statuses_kit_plate.ts` | **PM-00a** only | 32 new defs + rules, 10 pending defs, 7 retunes, two merge lines |
| `src/vfx/aliases.ts` + `src/types/vfx.ts` (9 NEW ids) | **PM-00a** only | aliases only; real presets belong to the vfx owner, later |
| `src/data/skills.ts` | **PM-00c** only | mechanical extraction of the knight and barbarian rows into `skillsets/knight.ts` / `skillsets/barbarian.ts`; afterwards class packages edit only their own skillset files |
| `src/data/skills_class_utils.ts` (`CLASS_UTIL_SKILLS`, 18 class-utility rows, merged into `SKILLS` at the end of `skills.ts`) | **PM-00c** only | splits it mechanically into `skills_class_utils_<class>.ts` files plus an aggregator; afterwards **PM-KN / PM-BA / PM-PA / PM-NE** each edit only their own file (`_knight`, `_barbarian`, `_paladin`, `_necromancer`: four packages no longer share one file); the mage / rogue / monk / archer / warlock rows move verbatim into `skills_class_utils_other.ts`, which no plate-melee package touches |
| `src/data/specs.ts` | **PM-00c** only | moves the 4 knight / barbarian SpecDefs into `data/specs_kit_knight.ts`, `data/specs_kit_barbarian.ts`, adds `specs_paladin.ts`, `specs_necromancer.ts` (empty), merges all four |
| `src/data/classes.ts` | **PM-00a** only | `ClassDefX.skills` lists, `mainStat` notes, necromancer / paladin `visual` tweaks |
| `src/combat/procMods.ts`, `src/data/procs.ts` (CW-03) | **PM-00b** merges | class packages put rows into their own `src/data/procs_kit_<class>.ts` (`PROC_DEFS_KIT_<CLASS>`, `PROC_MODS_KIT_<CLASS>`); PM-00b adds the four merge lines |
| `docs/GDD_TALENTS.trees.json` | **PM-TAL** only | class packages write patch files `docs/kits/talents_<class>.json`; PM-TAL applies them and runs `node tools/gen-talent-data.mjs` |
| `src/data/rotations.ts` (CM5) | CM5 | class packages write `src/data/rotations_kit_<class>.ts` from the APL blocks; CM5 merges |
| other groups (`docs/kits/casters-rogue.md` PK-0, `docs/kits/agile-evoker.md` AE-0) | orchestrator | their scaffolds edit the same append-only files (`types/*`, bottom import lines of `behaviors.ts`, `vfx/aliases.ts`, `data/statuses.ts`, `data/specs.ts`, `data/classes.ts`, `data/skills.ts`). Order agreed in agile-evoker.md: **PK-0 -> PM-00a/b/c -> AE-0**, each re-reading the files before appending (append-only means textual, not semantic, conflicts). File naming follows their `_kit_` convention (`data/{specs,statuses,procs,rotations,minions}_kit_<class>.ts`, `combat/skills/<name>Kit.ts`). Shared ids: `exec_window` (watcher, PK-0), `sated 600 s` (CORE §3). |

### GDD_CLASSES_V2 packages these packages depend on (NC table, `docs/GDD_CLASSES_V2.md` "Prefix NC")

The NC ids below are defined in the NC table of `docs/GDD_CLASSES_V2.md` (rows 04, 14-18, 23, 24, 35, 36, 39-41, 43, 44, 48, 51, 52). They are existing packages, not new work of this file.

| NC | what it is (title in the NC table) | needed by | note |
|---|---|---|---|
| 04 | `ClassDefX` registry + empty skillset stubs wired into `data/skills.ts` | PM-KN, PM-BA, PM-PA, PM-NE | stubs exist today (`src/data/skillsets/*.ts`, 9 lines each) |
| 14, 15, 16 (paladin) and 17, 18 (nekromant) | the paper-design skill rows of GDD_CLASSES_V2 (Paladin combo + core, Koruma / Ceza, Kutsal; Nekromant combo + core, spec skills) | **superseded** by PM-PA / PM-NE | they write the same files (`skillsets/paladin*.ts`, `necromancer*.ts`): **do not run them**, PM-PA / PM-NE replace them with this file's numbers |
| 23 / 24 | minion data aggregator `data/minions.ts` / Nekromant minion file | PM-NE | PM-NE writes `data/minions_kit_necromancer.ts` and registers it with the NC23 aggregator; NC24 is superseded |
| 35 / 36 | pips generalisation (SkillSystem, events) / pip HUD | PM-00b (rune), PM-PA, PM-NE | |
| 39 / 40 / 41 | `Minion` entity + `World.minions` / `MinionAI` / `Minions` manager (caps, summon, commands, respawn) **including the `minion_summon` and `minion_command` behaviours** | PM-NE | `minion_summon` / `minion_command` come from NC41, not NC52 (earlier draft) |
| 43 / 44 | `minion` net channel / `MinionFrames` HUD | PM-NE | |
| 48 | shared behaviours `chain_projectile`, `pip_finisher`, `target_status`, `channel_cone`, `beam_drain`, `orbit_hammers` | PM-BA, PM-PA, PM-NE | |
| 51 | Paladin behaviours (deps 48, 46, V2 WP5) | PM-PA | |
| 52 | Nekromant behaviours (deps 48, 41, 45) | PM-NE | the new `grip` behaviour is PM-00b, not NC52 |

**Gate before a class package starts** (orchestrator check, one line each): PM-PA needs NC35 / NC48 / NC51 merged (`grep -l orbit_hammers src/combat/skills/*.ts` and the NC51 behaviour file registered); PM-NE needs NC39-NC41 merged (`src/combat/Minions.ts` exists and `grep -l minion_summon src/combat/skills/*.ts` hits). If a gate fails, schedule the missing NC package first; PM-xx never stubs it.

### PM-00 · Shared contracts, hooks and file split — core + combat · serial, first · L (three Haiku commits a, b, c)

* **PM-00a (types, statuses, vfx aliases, classes, save).** Files: `src/types/skills.ts`, `src/types/common.ts`, `src/types/classes.ts`, `src/types/v2.ts` (`SpecDef.mainStat?`, `basic?` if missing), `src/types/vfx.ts`, `src/vfx/aliases.ts`, `src/data/statuses.ts`, `src/data/statuses_kit_plate.ts` (new), `src/data/classes.ts`, `src/core/Save.ts` (`bars.plate1` reset in `normaliseCharacterSave`), `src/combat/Combat.ts` (one line: `rollOutgoing` reads `specOf(p)?.mainStat ?? cls.mainStat`). Tasks: §g needs 9 and 10, 32 new StatusIds + defs + rules, the 10 pending defs, 7 retunes, 9 VFX ids + aliases, `PipId 'rune'` + `PipDef.regen`. Verification: `tsc` = 0; `window.dev.wow.run('pm00.defs')`: every StatusId used in a kit table has a `STATUSES` entry; every NEW VFX id resolves through `resolveVfxAlias`; old saves load (dev migrate check).
* **PM-00b (engine hooks and behaviours).** Files: `src/combat/skills/plateKit.ts` (new), `src/combat/skills/behaviors.ts` (one import), `src/combat/procMods.ts` + `src/combat/procFx.ts` (riders `extraTargets` / `extraMult` / `cdMult` / `takenMoreFromSource`, `ConditionalStatus`), `src/combat/SkillSystem.ts` (rune regen tick via the pips API, `specials.onSpend` call in `pay()`), `src/combat/specials.ts` (`trait_anger`), `src/combat/Combat.ts` (`damageTakenWithin`, `consumeOnHit` in `hitLocalPlayer`), `src/data/statuses_kit_plate.ts` rules. Tasks: §g needs 1-8, 11 and 12. Depends on: CM13 (`requires/replaces/offGcd`), CW-03, CW-07, NC35. Verification (`src/dev/wow/pm00b.ts`): `pm00b.multi_strike` (4 hits 0.17 s apart, one hit-stop), `pm00b.grip` (non-boss pulled to 3 m, boss taunted only), `pm00b.rider` (apply `sweeping`, MS hits 2 extra targets at 60 %, stack consumed), `pm00b.cdmult`, `pm00b.rune` (6 -> 0 -> +1 per 10 s), `pm00b.consume` (Bone Shield loses 1 charge per hit, never faster than ICD 2.5 s), `pm00b.recent` (take 300 damage, `damageTakenWithin(5) == 300`), `pm00b.anger` (spend 100 R -> m45 remaining -5 s), `pm00b.how` (target 19 % -> `exec_window` on, 21 % -> off), `pm00b.gain` (Çelik Girdap on 8 dummies: -20 +16 = -4 R; Arms chain step 1 on 3 dummies: +7 + 2 x 1.75 = 10.5 R), `pm00b.store` (Kalkan Kaldır up, block 200 damage -> 30 flat released when the 6 s end, no rage gained from the blocks).
* **PM-00c (file split, mechanical, zero behaviour change).** Files: `src/data/skills.ts`, `src/data/skills_class_utils*.ts`, `src/data/skillsets/knight.ts` (new), `src/data/skillsets/barbarian.ts` (new), `src/data/specs.ts`, `src/data/specs_kit_knight.ts`, `specs_barbarian.ts`, `specs_paladin.ts`, `specs_necromancer.ts` (new). Tasks: move the knight rows (`knight_basic` ... `knight_guardian_vow` rows that live in skills.ts, lines 53-153, the V2 spec blocks 472-507 and the majors 589-620) and the barbarian rows (lines 155-257, the V2 blocks 508-541 and the majors 621-653) verbatim into `registerKnight(add)` / `registerBarbarian(add)` and call them from `skills.ts` at the same position; move the four knight / barbarian SpecDefs verbatim into the new spec files (`SPEC_LIST` keeps the rogue specs) and `Object.assign(SPECS, KNIGHT_SPECS, BARBARIAN_SPECS, PALADIN_SPECS, NECRO_SPECS)`. Also split `src/data/skills_class_utils.ts` (the 18 rows of GDD_TALENTS §1.4, imported by `skills.ts` line 18 and merged at its end): export the shared `row()` helper from `skills_class_utils_row.ts`, move the rows verbatim into `skills_class_utils_knight.ts` (`knight_intercept`, `knight_guardian_vow`), `_barbarian.ts` (`barbarian_pummel`, `barbarian_intimidating_shout`), `_paladin.ts` (`paladin_rebuke`, `paladin_divine_shield`), `_necromancer.ts` (`necro_soul_snap`, `necro_spirit_walk`) and `_other.ts` (everything else), and keep `skills_class_utils.ts` as the aggregator exporting the same `CLASS_UTIL_SKILLS`. Verification: a node one-liner dumps `Object.keys(SKILLS).sort()` and `Object.keys(SPECS)` before and after; identical, and `JSON.stringify` of every def identical; `tsc` = 0; `node dev/combat-sim/skills.mjs knight` unchanged.

### PM-KN · Şövalye (Arms + Prot Warrior) — combat (data) · after PM-00 · M

* **Files (own):** `src/data/skillsets/knight.ts` (retune the kept rows and add the 11 new skills of f1a, exact numbers from §1 / §2 a), `src/data/specs_kit_knight.ts` (two SpecDefs below), `src/data/procs_kit_knight.ts`, `src/data/skills_class_utils_knight.ts` (no change needed: `knight_intercept`, `knight_guardian_vow` are kept as they are), `src/data/rotations_kit_knight.ts` (APL blocks of §1c / §2c), `docs/kits/talents_knight.json` (the knight rows of f2), `src/dev/wow/pmKnight.ts`.
* **SpecDef sketch.**
  * `knight_blademaster`: `stats {meleeDamagePct .10, critChance .05, attackSpeed .05, resourceGainPct .75}`; specials `trait_anger {per 20, cdr 1}`; `skills [knight_mortal_strike, knight_overpower, knight_rend, knight_die_by_sword, knight_pummel]`, `unlock {mortal_strike 10, overpower 10, pummel 10, rend 12, die_by_sword 15}`; `treeSkills {knight_execute: 's05'}`; `majors {m45 knight_colossus_smash, m90 knight_avatar, m180 knight_bladestorm}`; `fx 'T hit:@basic ch=.10 icd=3 => st(self,sudden_death,12) ;; T cast:knight_mortal_strike ch=.25 icd=2 => st(self,battlelord,8)'`; `defaultBar {lmb knight_basic, rmb knight_mortal_strike, q knight_execute, e knight_overpower, r knight_rend, s1 knight_radiant_cleave, s2 knight_charge, s3 knight_die_by_sword, s4 knight_pummel, m45 knight_colossus_smash, m90 knight_avatar, m180 knight_bladestorm}`.
  * `knight_protector`: stats unchanged except `damagePct` removed (G10) + fx `'T hurt icd=1 => res(3) ;; T block ch=.3 icd=1.5 => st(self,revenge_ready,6) ;; T parry => st(self,revenge_ready,6)'`; specials keep `protector_cheat`, add `trait_anger`; `skills [knight_provoke, knight_shield_block, knight_ward_of_oath, knight_revenge, knight_thunder_clap, knight_pummel]`, `unlock {provoke 10, shield_block 10, pummel 10, revenge 12, thunder_clap 12, ward_of_oath 15}`; `majors {m45 knight_challenge, m90 knight_avatar, m180 knight_unbroken_bastion}`; `mods [{skill knight_charge, patch {cooldown 45}}, {skill knight_shield_bash, params {threat 300}}]`; `defaultBar {lmb knight_basic, rmb knight_shield_bash, q knight_revenge, e knight_shield_block, r knight_provoke, s1 knight_thunder_clap, s2 knight_charge, s3 knight_ward_of_oath, s4 knight_pummel, m45 knight_challenge, m90 knight_avatar, m180 knight_unbroken_bastion}`.
* **Tasks:** retune `knight_basic_1..4` coefs and `gain`; rewrite `knight_shield_bash`, `knight_charge`, `knight_radiant_cleave`, `knight_challenge`, `knight_unbroken_bastion`; add the 11 new rows (`behavior 'execute'` for `knight_execute` with `threshold .20, anyHp via sudden_death`; `interrupt` for `knight_pummel`; `major_*` or `self_buff` for the majors; `channel_aoe` for `knight_bladestorm`); never delete old rows (dropped ones stay defined, `defaultSlot` removed).
* **Depends:** PM-00a/b/c, CM13 (`replaces`, `offGcd`, `target_instant`), CW-03 / CW-07 (procs), CW-14 (execute `anyHp`).
* **Verification (`pmkn.*`):** `pmkn.bars` both defaultBars resolve in `SKILLS`; `pmkn.cd` mortal_strike 6 s, shield_bash 9 s, colossus 45 s, avatar 90 s, bladestorm 180 s; `pmkn.procs` force `sudden_death` -> Execute free once and usable at 90 % target HP; force `revenge_ready` -> Revenge free once; `pmkn.parry` a perfect parry on a dev dummy grants `revenge_ready`; `pmkn.ledger` run the APL on a dev dummy for 60 s: rage income within 15 % of 286 (Arms) / 346 (Prot); `pmkn.mit` Kalkan Kaldır uptime 60-70 %; `dev/combat-sim/skills.mjs knight` reports no missing id.

### PM-BA · Barbar (Kasap = Fury, Savaş Lordu = Guardian loop) — combat (data) · after PM-00 · M

* **Files (own):** `src/data/skillsets/barbarian.ts`, `src/data/specs_kit_barbarian.ts`, `src/data/procs_kit_barbarian.ts`, `src/data/rotations_kit_barbarian.ts`, `src/data/skills_class_utils_barbarian.ts` (retune `barbarian_pummel` here: it is NOT in `skillsets/barbarian.ts`), `docs/kits/talents_barbarian.json`, `src/dev/wow/pmBarbarian.ts`.
* **SpecDef sketch.**
  * `barbarian_butcher`: `stats {executeDamagePct .40, attackSpeed .05, resourceGainPct .20, critChance .05}`; specials `trait_anger`; `skills [barbarian_bloodthirst, barbarian_rampage, barbarian_raging_blow, barbarian_pummel]`, `unlock {bloodthirst 10, pummel 10, raging_blow 12, rampage 15}`; `treeSkills {barbarian_execute: 's05'}`; `majors {m45 barbarian_avatar, m90 barbarian_carnage, m180 barbarian_wolf_howl}`; `fx 'T hit:@melee ch=.10 icd=3 => st(self,sudden_death,12) ;; T cast:barbarian_bloodthirst ch=.30 icd=1 => st(self,enrage,4,.15) ;; T cast:barbarian_rampage => st(self,enrage,4,.15)'`; `mods [{skill barbarian_bloodthirst, replaces {skill barbarian_bloodbath, whileStatus carnage}}, {skill barbarian_raging_blow, replaces {skill barbarian_crushing_blow, whileStatus carnage}}]` (or the equivalent `SkillDef.replaces` on the two replacement rows); `defaultBar {lmb barbarian_basic, rmb barbarian_bloodthirst, q barbarian_rampage, e barbarian_raging_blow, r barbarian_execute, s1 barbarian_whirlwind, s2 barbarian_leap, s3 barbarian_blood_rage, s4 barbarian_pummel, m45 barbarian_avatar, m90 barbarian_carnage, m180 barbarian_wolf_howl}`.
  * `barbarian_warlord`: stats unchanged except `damagePct` removed (G10) + `warlord_rage_armor` max .15; fx `'T hurt icd=.5 => res(2) ;; T hit:barbarian_thrash ch=.15 icd=2 => st(self,gore,10) ;; T hit:barbarian_cleave ch=.15 icd=2 => st(self,gore,10) ;; T cast:barbarian_iron_stance ch=.20 => st(self,gory_maul,12) ;; T cast:barbarian_maul ch=.20 => st(self,gory_iron,12)'`; `skills [barbarian_maul, barbarian_thrash, barbarian_iron_stance, barbarian_pummel]`, `unlock {iron_stance 10, pummel 10, thrash 12, maul 15}`; `treeSkills {barbarian_blood_shield: 's05'}`; `majors {m45 barbarian_last_stand, m90 barbarian_ancestral_tempest, m180 barbarian_incarnation}`; `mods [{skill barbarian_cleave, params {threatMult 1.5}}, {skill barbarian_thrash, params {threatMult 2.0}}, {skill barbarian_maul, params {threatMult 2.0}}]`; `defaultBar {lmb barbarian_basic, rmb barbarian_cleave, q barbarian_maul, e barbarian_iron_stance, r barbarian_axe_throw, s1 barbarian_thrash, s2 barbarian_leap, s3 barbarian_blood_shield, s4 barbarian_pummel, m45 barbarian_last_stand, m90 barbarian_ancestral_tempest, m180 barbarian_incarnation}`.
* **Tasks:** retune the kept rows of f1b exactly; add `barbarian_bloodthirst`, `_rampage` (behaviour `multi_strike`, `animCycle`), `_raging_blow`, `_crushing_blow`, `_thrash`, `_maul`, `_incarnation`, `_avatar`; promote `barbarian_pummel` in `skills_class_utils_barbarian.ts` (cost 10 -> 0, CD 12 -> 15, params `silence 3`, `stun 0.8` kept, unlocked at L10 by both specs through `SpecDef.unlock`); `barbarian_axe_throw` gets `targeting 'target_projectile'`, `params.tauntFirst 1`; keep old unslotted rows defined.
* **Depends:** PM-00a/b/c, CM13, CW-03 / CW-07, CW-14, NC48 (`target_status` not needed).
* **Verification (`pmba.*`):** bars resolve; `pmba.replaces` apply `carnage` -> rmb resolves to `barbarian_bloodbath`, e to `barbarian_crushing_blow`; `pmba.rampage` 4 hits, applies `enrage`; `pmba.cleave` Kasırga then Kan Susuzluğu hits 3 extra targets once, twice max; `pmba.iron` three casts -> 3 stacks, 39 % DR, expiry after 7 s; `pmba.gory` force `gory_maul` -> Ezici Balta free; `pmba.growl` Kükreyen Balta taunts a dev target and applies `rend`; `pmba.ledger` 60 s APL rage income within 15 % of 459 (Kasap) / 452 (Lord).

### PM-PA · Paladin (Koruma, Kutsal, Ceza) — combat (data) · after PM-00 and NC04 / NC35 / NC36 / NC48 / NC51 (replaces NC14-NC16) · L

* **Files (own):** `src/data/skillsets/paladin.ts` (class chain `paladin_basic` + shared rows), `paladinSpecs.ts` (Koruma + Ceza rows), `paladinHoly.ts` (Kutsal rows), `src/data/skills_class_utils_paladin.ts` (retune `paladin_rebuke`, `paladin_divine_shield` per f1c), `src/data/specs_kit_paladin.ts`, `src/data/procs_kit_paladin.ts`, `src/data/rotations_kit_paladin.ts`, `docs/kits/talents_paladin.json`, `src/dev/wow/pmPaladin.ts`.
* **SpecDef sketch.** `paladin_protection`: role tank, stats per f3, `skills [paladin_reckoning, paladin_shield_of_righteous, paladin_blessed_hammer, paladin_word_of_glory, paladin_avengers_shield, paladin_consecration, paladin_divine_steed]` (Rebuke only through the class `s05A` talent, `G paladin_rebuke`; Koruma's `s4` is Hesaplaşma and its interrupt is İntikamcı Kalkan), `majors {m45 paladin_avenging_wrath, m90 paladin_prot_ardent, m180 paladin_prot_bulwark}`, `mods [{skill paladin_avenging_wrath, patch {cooldown 45}}, {skill paladin_hammer_of_wrath, params {coef 2.8}}]`, `defaultBar {lmb paladin_basic, rmb paladin_blessed_hammer, q paladin_shield_of_righteous, e paladin_judgement, r paladin_avengers_shield, s1 paladin_consecration, s2 paladin_divine_steed, s3 paladin_word_of_glory, s4 paladin_reckoning, m45 paladin_avenging_wrath, m90 paladin_prot_ardent, m180 paladin_prot_bulwark}`. `paladin_holy`: role healer, `mainStat int`, `basic paladin_holy_basic`, `skills [paladin_holy_shock, paladin_flash_of_light, paladin_cleanse, paladin_word_of_glory, paladin_light_of_dawn, paladin_divine_steed, paladin_rebuke, paladin_divine_shield]`, `majors {m45 paladin_divine_toll, m90 paladin_avenging_wrath, m180 paladin_holy_aura_mastery}`, `defaultBar {lmb paladin_holy_basic, rmb paladin_holy_shock, q paladin_flash_of_light, e paladin_word_of_glory, r paladin_cleanse, s1 paladin_light_of_dawn, s2 paladin_divine_steed, s3 paladin_divine_shield, s4 paladin_rebuke, m45 paladin_divine_toll, m90 paladin_avenging_wrath, m180 paladin_holy_aura_mastery}`. `paladin_retribution`: role dps, `skills [paladin_crusader_strike, paladin_verdict, paladin_blade_of_justice, paladin_judgement, paladin_divine_storm, paladin_wake_of_ashes, paladin_divine_steed, paladin_rebuke]`, `treeSkills {paladin_hammer_of_wrath: 's05'}`, `majors {m45 paladin_ret_execution, m90 paladin_avenging_wrath, m180 paladin_divine_shield}`, `mods [{skill paladin_avenging_wrath, patch {cooldown 90}}]`, `defaultBar {lmb paladin_basic, rmb paladin_crusader_strike, q paladin_verdict, e paladin_blade_of_justice, r paladin_judgement, s1 paladin_divine_storm, s2 paladin_divine_steed, s3 paladin_wake_of_ashes, s4 paladin_rebuke, m45 paladin_ret_execution, m90 paladin_avenging_wrath, m180 paladin_divine_shield}`.
* **Tasks:** write the planned paper rows of GDD_CLASSES_V2 §4.3-§4.5 **with the numbers of §7-§9 a of this file** (this file wins); add the 7 new ids; `paladin_judgement` / `paladin_crusader_strike` / `paladin_verdict` get `replaces` rows (Gazap Çekici, Tapınakçı Kılıcı, Işık Çekici); `paladin_hammer_of_wrath` uses behaviour `execute` with `requires`-style gating (`exec_window` or `wrath_wings`); `paladin_divine_toll` behaviour `divine_toll`; passive Bağlılık Aurası is a CM3 party buff row, not a skill; `ClassDefX.skills` for the class: `[paladin_judgement, paladin_crusader_strike, paladin_divine_steed, paladin_rebuke, paladin_word_of_glory, paladin_avengers_shield, paladin_avenging_wrath, paladin_divine_shield]` (done by PM-00a data, rows by this package).
* **Depends:** PM-00a/b/c, CM13, CW-03 / CW-07, NC35 / NC36 (pips), NC48 (`chain_projectile`, `orbit_hammers`, `heal_target`), NC51 (paladin behaviours), V2 WP5 `healing.ts`; NC14-NC16 are superseded by this package (see the NC table above).
* **Verification (`pmpa.*`):** bars resolve for all three specs; `pmpa.hp` Kutsal Güç income / spend over a 60 s APL run on a dev dummy within 15 % of 27 (Koruma) / 31.2 (Kutsal) / 41.5 (Ceza); spend costs exactly 3; `pmpa.replace` Yargı becomes Gazap Çekici under `wrath_wings` and at 19 % target HP; `pmpa.hol` AW opens `hammer_window`, Kutsal Hüküm becomes Işık Çekici for 2 casts; `pmpa.heal` Holy Shock on a damaged dev ally heals, on an enemy damages; Işık Aşısı makes Işık Parlaması instant and free; `pmpa.mana` Kutsal İnanç ledger +10 / minute +- 5 at 100 % of the casts and >= 0 at 105 %; `pmpa.mit` Doğruluk Kalkanı uptime >= 60 % over 60 s APL run.

### PM-NE · Nekromant (Kemik Muhafızı = Blood DK, Ordu Efendisi = Unholy DK) — combat (data) · after PM-00 and NC04 / NC23 / NC35 / NC36 / NC39-NC41 / NC43 / NC44 / NC48 / NC52 (replaces NC17-NC18, NC24) · L

* **Files (own):** `src/data/skillsets/necromancer.ts` (both chains + shared rows), `necromancerSpecs.ts` (spec rows), `src/data/minions_kit_necromancer.ts` (`necro_ghoul`, `necro_lesser_ghoul`, `necro_army_ghoul`, merged by NC23's aggregator), `src/data/skills_class_utils_necromancer.ts` (left unchanged: `necro_soul_snap`, `necro_spirit_walk` are dropped / unslotted, f1d), `src/data/specs_kit_necromancer.ts`, `src/data/procs_kit_necromancer.ts`, `src/data/rotations_kit_necromancer.ts`, `docs/kits/talents_necromancer.json`, `src/dev/wow/pmNecro.ts`.
* **SpecDef sketch.** `necromancer_bone`: role tank, `mainStat str`, `basic necro_blood_basic`, stats per f3, `skills [necro_heart_strike, necro_death_strike, necro_marrowrend, necro_deaths_grip, necro_blood_boil, necro_deaths_advance, necro_anti_magic_shell, necro_mind_freeze]`, `treeSkills {necro_marrowrend: 's05'}`, `majors {m45 necro_vampiric_blood, m90 necro_dancing_rune_weapon, m180 necro_icebound_fortitude}`, `fx 'T cast:necro_death_strike => st(self,blood_shield,10)'`, `defaultBar {lmb necro_blood_basic, rmb necro_heart_strike, q necro_death_strike, e necro_marrowrend, r necro_deaths_grip, s1 necro_blood_boil, s2 necro_deaths_advance, s3 necro_anti_magic_shell, s4 necro_mind_freeze, m45 necro_vampiric_blood, m90 necro_dancing_rune_weapon, m180 necro_icebound_fortitude}`. `necromancer_summoner`: role dps, `mainStat str`, `basic necro_basic`, `skills [necro_scourge_strike, necro_death_coil, necro_festering_strike, necro_outbreak, necro_deaths_advance, necro_anti_magic_shell, necro_mind_freeze]`, `treeSkills {necro_epidemic: 's05'}`, `majors {m45 necro_dark_transformation, m90 necro_army_of_the_dead, m180 necro_icebound_fortitude}`, `fx 'T hit:necro_scourge_strike ch=.12 icd=2 => st(self,sudden_doom,12) ;; T hit:necro_festering_strike ch=.12 icd=2 => st(self,sudden_doom,12)'`, `minion {pet necro_ghoul auto-summon, cap 1}`, `defaultBar {lmb necro_basic, rmb necro_scourge_strike, q necro_death_coil, e necro_festering_strike, r necro_outbreak, s1 necro_epidemic, s2 necro_deaths_advance, s3 necro_anti_magic_shell, s4 necro_mind_freeze, m45 necro_dark_transformation, m90 necro_army_of_the_dead, m180 necro_icebound_fortitude}`.
* **Tasks:** the two chains (5 rows each: parent + 4 steps, numbers of §8 / §9 a); the 4 shared rows and 15 spec rows; ghoul minion rows (hpFrac / attacks in §9 b); `necro_death_order` as a `replaces` row consuming `vile_contagion`; ClassDef: `resource essence` keeps `regenRule 'rage'` (decay) for both specs, `secondary` pip `rune`; the NC32 Elden Ring `nc_*` rows: Kemik Muhafızı uses the melee-shaped rows with guard gauge 80, Ordu Efendisi keeps the caster rows (parry window only).
* **Depends:** PM-00a/b/c (rune pip, consume-on-hit, damage window, riders), CM13, CW-03 / CW-07, NC35 / NC36, NC39-NC41 (minion entity, AI, manager with `minion_summon` / `minion_command`), NC43 / NC44 (net, frames), NC23 (minion data aggregator), NC48, NC52 (necromancer behaviours); NC17 / NC18 / NC24 are superseded by this package (see the NC table above).
* **Verification (`pmne.*`):** bars resolve; `pmne.rune` Kalp Darbesi costs 1 rune, İlik Söken 2, 6 runes recharge in 10 s each; `pmne.bone` İlik Söken +3 `bone_armor`, melee hits consume one per 2.5 s; `pmne.death_strike` take 300 damage -> Ölüm Darbesi heals 60 (20 %) or 7 % max HP, whichever is higher, grants `blood_shield`; `pmne.grip` pulls a dev dummy; `pmne.vile` Çürüten Darbe -> 3 stacks, Ölüm Kırbacı spends 1 and spawns 1 Küçük Ghul; `pmne.army` Ölüler Ordusu spawns 8 ghouls (ignore cap) for 30 s and the rmb resolves to `necro_death_order`; `pmne.dt` Karanlık Dönüşüm doubles the pet's attack coef for 15 s; `pmne.ledger` 60 s APL run: rune income 36 / 60 s +- 4, Öz within 15 % of 252 (Kemik) / 350 (Ordu).

### PM-TAL · Talent re-pointing — items · after PM-KN, PM-BA, PM-PA, PM-NE · S

* **Files:** `docs/GDD_TALENTS.trees.json` (apply the four `docs/kits/talents_<class>.json` patches = the f2 table), then `node tools/gen-talent-data.mjs` (regenerates `src/data/talentTrees/raw/{knight,barbarian,paladin,necromancer}.ts` and `src/data/skillSpecs.ts`), `docs/GDD_TALENTS.md` node descriptions for renamed nodes (Turkish text of changed nodes is rewritten from the new `fx`).
* **Verification:** `node tools/gen-talent-data.mjs --check` exit 0; `node tools/talents-check.mjs trees skillspecs crossrefs` exit 0 with no unknown skill id and every `p.<key>` of the f2 fx present in the target skill's `params` (the warnings about planned paladin / necro ids disappear once PM-PA / PM-NE landed); `window.dev.wow.run('pmtal.*')`: every `G <skill>` node target exists, every `M <skill>` target is on some default bar of the class.

### Waves

`PM-00a -> PM-00b -> PM-00c` (serial, one coder) then `PM-KN || PM-BA || PM-PA || PM-NE` (≤ 4 parallel, disjoint files by the table above) then `PM-TAL`, then CM5 (APL data), CM4-CM6 (SimBench, tuning), Haiku QA pass (CORE low-CPU policy: one pass at the end).

## Open questions and assumptions

**Decisions the orchestrator / owner needs to take (biggest first)**

1. **Resolved: key G.** `s4` = `KeyG` (`core/Input.ts`: `skill_s4: ['KeyG']`), guard = `Mouse3` + `CapsLock` (same file; `core/Settings.ts` migrates a stored `['KeyG', 'Mouse3']` guard binding away via `LEGACY_GUARD`). The Elden Ring layer text of the kits says "guard = `Mouse3` / `CapsLock`". Nothing is left to decide here.
2. **Death Knight identity.** `necromancer` is today an int / light-armor / Mage-rig caster class (`ClassDefX.mainStat 'int'`, `armorWeight 'light'`, `essence` bar, GDD_CLASSES_V2 skeleton summoner). CORE §2 already overrides `necromancer_bone` to a TANK. These kits make both specs Strength specs (`SpecDef.mainStat 'str'`, §g need 10), give Kemik Muhafızı a melee chain on the Mage rig (2H clips, skull-scythe staff, `necro_blood_basic`) and keep the robed model. Decide: keep the Mage rig and robe (cheapest, flagged here), or move the class to the Knight / Barbarian rig with a hooded-skull variant (CM-level art task). Plate armor weight for the Death Knights is not decided either (`armorWeight 'heavy'` would let them wear Knight gear; keep `'light'` and rely on spec passives like the GDD_V2 tanks otherwise).
3. **Weapon chain rebase (G1).** Σ 5.35 / 5.4 / 4.47 / 4.71 -> Σ 2.5 for every plate chain. If the owner wants the old LMB numbers back, the ability coefs must drop ~25 % and Anger Management-style resource engines get weaker; the cleaner fallback is the `lmbShare` knob in SimBench (chain damage x0.55 at 100 % uptime but x1.0 as weave filler). Needs a feel check in `dev/combat.html` (damage numbers on the finisher drop from 2.0 to 0.9).
4. **Heroism and majors.** Şövalye loses the 3-minute party buff (CORE §3 Heroism family = Barbar, Okçu, Büyücü, Ejderhasoy); Arms `m180` is Bıçak Fırtınası (bucketed from the 90 s WoW cooldown, whose cooldown the research lists as n/v). Kasap keeps Kurt Narası. Savaş Avatarı sits on `m90` for Arms / Koruyucu but on `m45` (magnitude 10 %) for Kasap because Method says Fury cooldowns come up every ~45 s with Anger Management; if you prefer one rule, put it on `m90` for everyone and fuse it into Pervasızlık for Kasap.
5. **Research gaps filled from WoW baseline knowledge** (marked n/v in `docs/ref/wow/plate-melee.md`; verify in game or in the next research pass): Pummel / Rebuke / Skull Bash / Mind Freeze 15 s with a 3 s EFSUN lockout (COMBAT_WOW 4 s on trash would also be fine), Death Grip 25 s, Divine Steed 45 s, Death's Advance 25 s / +40 % / 6 s, Anti-Magic Shell 60 s, Die by the Sword 120 s, Charge 20 s, Overpower 2 x 12 s, Rend 15 s / 15 R, Execute at 20 % (35 % with Massacre / Fury), Judgment 12 s, Wake of Ashes burn 9 s, Heart Strike +5 Öz / Marrowrend +10 Öz (the wiki lists the cost only), Blood Boil 2 x 7.5 s (wiki), Bone Shield charge ICD 2.5 s (EFSUN number; WoW consumes per hit).
6. **Arms visuals.** The Şövalye rig has a `2H_Sword` mesh but the kit keeps the 1H chain clips (the user asked to keep the existing chain). Çelik Girdap and Bıçak Fırtınası use `2H_Melee_Attack_Spin(ning)` with a 1H sword in hand; verify in `dev/combat.html`, fallback `1H_Melee_Attack_Slice_Horizontal` + `spin_slash` vfx. A 2H sword base for Arms is a later item category decision.
7. **Savaş Lordu compression.** Guardian has more essential buttons than 12 slots: Moonfire + Growl share Kükreyen Balta, Maul / Raze share Ezici Balta (auto-cleave), Thrash takes the AoE slot and Kasırga moves to bench; Wild Guardian / Galactic Guardian are not modelled. Confirm the fantasy ("2H berserker, axe throw taunts").
8. **Kutsal omissions.** No Holy Light, Beacon, Lay on Hands or Blessing of Sacrifice on the default bar (12 buttons). Mobility: Divine Steed is a baseline paladin class ability in WoW, so Kutsal now has it on `s2` like Koruma / Ceza (the first draft left `s2` to Cleanse because the Holy research page lists no mobility, which was a research gap, not a WoW fact). Cleanse moved to `r`, and Yargı is folded into step 3 of the heal-bolt chain (no button). Lay on Hands is on Ceza's bench and in the class talent node; Beacon is represented by nothing. Alternative: swap Divine Shield for Lay on Hands on `s3` of Kutsal.
9. **Class-tree talent nodes** that point at a spec-only skill are inert for the other spec of the class (f2 prefers shared skills: charge, pummel, avatar, leap, anti-magic shell, deaths advance; the rest are split). `tools/talents-check.mjs` does not flag this.
10. **Unholy minion load.** One pet + up to 3 Lesser Ghouls + 8 army ghouls per player = 12 minions; NC caps are 14 per peer, 40 per world (two Unholy in one party can hit the world cap). SimBench must count minion damage in the Unholy composite (this file counts ~ 35 % of the budget as minion damage).
11. **Signature-skill table** (`SIGNATURE_SKILLS`, 3 per class) for Nekromant maps to `necro_death_coil`, `necro_scourge_strike`, `necro_blood_boil` (f2); Kemik Muhafızı can only use one of them. The talent owner may swap one for `necro_heart_strike`.
12. **Cross-group conventions.** This file follows the sibling docs on `sated` 600 s, `exec_window`, `_kit_` file names and the PK-0 -> PM-00 -> AE-0 scaffold order; it does **not** use `crowdFactor` (G11) and the Heroism skill `barbarian_wolf_howl` is retuned to 600 s here. If the owner wants one convention, G11 is the only table that changes.
13. **Environment note.** While writing this the build machine's `C:` drive was at 100 % (12-180 MB free), so Haiku QA / browser passes may fail on disk space.
14. **`necro_lichborne` has no SkillDef.** f2 re-points `class:necromancer / s05B` to `G necro_lichborne` (a bench id of f1d), so the node would grant nothing until PM-NE defines a minimal row (self buff, heal on use) or the node is re-pointed to `necro_deaths_advance`. Decide before PM-NE starts.
15. **Anger Management balance.** Arms (104.3) sits at the top edge of its ST band with the CDR row included; if SimBench confirms it, trim Ölümcül Darbe (3.4) before touching `angerPer`.


## Design notes / rejected critique

Review pass of 2026-10-13 (docs only). Every issue of the critic was handled; this section records what was rejected or changed in form.

**Rejected (in part): "NC16, NC36, NC39-NC41, NC44, NC51 and NC52 appear only in plate-melee.md".** False: all of them are rows of the NC table in `docs/GDD_CLASSES_V2.md` ("Prefix NC", rows 16 Kutsal skills, 36 pip HUD, 39 Minion entity, 40 MinionAI, 41 Minions manager + `minion_summon` / `minion_command`, 44 MinionFrames, 51 Paladin behaviours, 52 Nekromant behaviours). Inventing PM-00b copies of them would duplicate real packages. Accepted from the same item: (a) the attribution of `minion_summon` / `minion_command` was wrong (NC41, not NC52); (b) NC14-NC18 write the same skillset files as PM-PA / PM-NE, so they are now marked superseded and must not run; (c) the dependencies are spelled out in a table with gate checks (section h, "GDD_CLASSES_V2 packages these packages depend on"). `NC43` (net) is listed too because the Ordu Efendisi minions replicate.

**Taken in a different form than the critic suggested**

* **Kutsal mana (issue 1).** Instead of only raising regen to 2.0 / s, Yargı was folded into step 3 of the heal-bolt chain (needed anyway to free `r` for Cleanse, issue 9), which removes 20 mana from the spend (160 -> 140); regen is 1.7 / s. Result: net +10 per minute at 100 % casts and +3 at 105 %, both ends stated, `pmpa.mana` updated. Kutsal chain damage rose Σ 3.25 -> Σ 4.8 so the healer damage stays at 34.0 (target 35).
* **Anger Management (issue 4).** Option A of the critic: the printed cooldowns are BASE values and every spec carries an explicit CDR row; the rate was halved (1 s per 20 R) because Kasap would otherwise exceed 105. Kasap also gives up one Kan Susuzluğu cast per minute (103.6 final). Arms lands at 104.3, inside the band but at its top edge: SimBench should trim Ölümcül Darbe first, not the CDR.
* **AoE rage ledgers (issue 2).** Arms got per-target rage (chain +1 per extra target, Çelik Girdap cost 20 / refund 2 per target, Dev Ezme +5 per target) rather than a lower Girdap count; Koruyucu and Savaş Lordu are pack-fed by hits taken and only needed the ledger, not new mechanics.
* **Dark Transformation (issue 8).** Marked EFSUN-invented instead of modelling the Reaper's Mark / Festering Scythe flow: the research gives no coefficients, costs or cooldowns for them (all n/v), so a modelled version would be fabricated numbers on top of a budget that must stay checkable. The Phase 2 hook (`replaces` rows on the existing `dark_transformation` status) is documented. The Sweeping Strikes rider is marked the same way.
* **Shield Wall store (issue 7).** The stored-damage identity moved onto `knight_shield_block` (new engine need 12) rather than inventing a `store` param on Sarsılmaz Bastion. Class node `class:knight / s18` points at it as well, which makes the node inert for Arms (open question 9 already covers that class of problem).
