# EFSUN ONLINE — WoW-faithful kits, group "agile-evoker": Keşiş · Okçu · İblis Avcısı · Ejderhasoy

> CM12 design pass (combat/class designer, Sonnet), dated 2026-10-13. Docs only: no code, no dev server, no browser.
> Normative parents: `docs/CORE_MECHANICS.md` (§2 roster, §3 party buffs, §4 stats, §5 SimBench, §10 bar/targeting/procs) and `docs/COMBAT_WOW.md`
> (engine layer: GCD profiles, 400 ms spell queue, procs + Spell Activation Overlay, pushback, lockout, combat text — its §3 per-class section and the old-kit rows are
> **superseded by this file**, the proc **engine** carries over). WoW data: `docs/ref/wow/agile-evoker.md` (Midnight Season 2, 12.1; items it marks `n/v` or "conflict" are
> resolved in §0.4 and re-listed in the open questions).
> Specs covered (10): `monk_brewmaster` · `monk_mistweaver` · `monk_windwalker` · `archer_marksman` · `archer_beastmaster` · `demonhunter_chaos` (NEW class) ·
> `demonhunter_vengeance` · `evoker_devastation` (NEW class) · `evoker_preservation` · `evoker_augmentation`.

## 0. Summary

### 0.1 The ten specs

| spec id | TR name | class | role | WoW model | primary resource / pips | signature mechanic | party buff (CORE §3) |
|---|---|---|---|---|---|---|---|
| `monk_brewmaster` | Demci | Keşiş | tank | Brewmaster | Enerji (100, 10/s) · no Çi | Sarsma (stagger) havuzu + Sarhoş Adım (Shuffle) + Arındırıcı İksir dump | Mistik Dokunuş: enemies take +5 % physical |
| `monk_mistweaver` | Sis Dokuyan | Keşiş | healer | Mistweaver | **Mana** (spec override) · Çi pips | Yenileyici Sis HoT web, Sis Esintisi (every punch/kick heals), Yu'lon window | Mistik Dokunuş |
| `monk_windwalker` | Rüzgâr Yürüyen | Keşiş | dps | Windwalker | Enerji + Çi (0–5) | Combo Breaker, Kara Tekme refunds Doğan Güneş / Cennet Yumrukları, Xuen + Zenith window | Mistik Dokunuş |
| `archer_marksman` | Nişancı | Okçu | dps | Marksmanship | Odak (100, 8/s, ×1.6 standing) | hard-cast Nişanlı Atış → Kesin Atışlar → Gizem/Son Atış, Tam İsabet, Volley | Kartal Gözü: party +3 % crit · Kurt Narası |
| `archer_beastmaster` | Av Ustası | Okçu | dps | Beast Mastery | Odak | Yoldaş + Dikenli Ok, Av Emri, Beast Cleave, Vahşi Gazap | Kartal Gözü · Kurt Narası |
| `demonhunter_chaos` | Kaos | İblis Avcısı | dps | Havoc | **Öfke / Fury** (100) | Fel Bıçakları passive Fury, Göz Işını ↔ İntikam Geri Çekilişi sync, Metamorfoz transforms two buttons | Kaos Damgası: enemies take +5 % magic |
| `demonhunter_vengeance` | İntikam | İblis Avcısı | tank | Vengeance | Öfke + **Ruh Parçacığı** pips (0–6) | Kırılma → fragments → Ruh Yarma / Ruh Bombası, Şeytan Dikenleri + Ateş Mührü active mitigation | Kaos Damgası |
| `evoker_devastation` | Yıkım Nefesi | Ejderhasoy | dps | Devastation | Mana (DPS: non-binding) + **Öz / Essence** pips (0–5) | empowered Ateş Nefesi / Ebedi Dalga, Parçala chain on Öz Patlaması, Ejder Öfkesi | Bronz Kudret: party +3 % haste · Kurt Narası · battle res |
| `evoker_preservation` | Koruyucu Nefes | Ejderhasoy | healer | Preservation | Mana + Öz pips | Geri Dönüş + Yankı ramp, empowered Rüya Nefesi, Durgunluk (Stasis) | Bronz Kudret · Kurt Narası · battle res |
| `evoker_augmentation` | Yüceltme | Ejderhasoy | support dps | Augmentation | Mana + Öz pips | Abanoz Kudret (2 highest DPS), Öngörü (Prescience, 2 charges), Çağların Nefesi bank | Bronz Kudret · Kurt Narası · battle res |

### 0.2 Notation used in every table

* **Slots** (CORE §10.1): `lmb` weapon chain (off-GCD) · `rmb` filler/builder · `q` main spender / proc button · `e` `r` rotational CDs · `s1` AoE · `s2` mobility · `s3` defensive ·
  `s4` interrupt/utility (new key G) · `m45` `m90` `m180` (X V T) majors. The 12 buttons are the whole kit; extra buttons are `replaces` transforms (button changes while a status is up).
* **cast**: `inst` instant · `cast x s` hard cast (WoW × 0.8, already applied) · `ch x s` channel · `emp r1/r2/r3` empowered (hold-to-charge, §g.1). Haste divides every duration.
* **targeting**: existing `melee_arc` `projectile` `ground_aoe` `self_aoe` `self_buff` `dash` `leap` `beam` `teleport` `summon` `custom:<behaviour>`; new (CORE §10.2) `target_projectile` (homing bolt),
  `target_instant` (hits target in range + LoS; melee ≤ 5 m auto-lunges +3 m). `ally` = `requires.target:'ally'` + `allyTarget:'friendly'` (smart-heal resolver of GDD_V2).
* **CD / chg**: seconds; `xN` = N charges (recharge per charge). `bucket` marks a major whose WoW CD was bucketed to 45 / 90 / 180 s.
* **cost / gen**: `−` spends, `+` generates. Primary-resource numbers are re-based to the **1.0 s GCD ('arpg' profile)** so a rotation is ≈ 85–90 % GCD-busy (WoW values are 1.5 s-GCD
  era: Fury / Focus costs are about ×0.5–0.7 of the WoW tooltip; Energy and Chi are unchanged because WoW Monk already uses a 1.0 s GCD). The WoW column keeps the original name.
* **coef · type**: damage = `coef × weapon roll (+ spellPower for spells)` (Combat.rollOutgoing); heal = `coef × weapon roll × (1 + main/100) × (1 + healingPct)` (healing.ts). `perTick` rows
  list the total of the channel/DoT. Damage types are the engine's 9: Chaos / fel is `shadow`, Spellfrost-blue is `frost`, "Volcanic" is `fire`.
* **GCD**: `on` / `off`. Off-GCD: LMB chain, mobility, defensives, interrupts, majors, and the WoW off-GCD buttons (Purifying Brew, Vengeful Retreat…).
* **Procs** are `ProcDef` rows of `data/procs.ts` (COMBAT_WOW §2.7): the overlay colour gives the `school`, defaults are `sfxGain 'proc_gain'`, `sfxUse 'proc_use'`, `vfxGain 'proc_burst'`, `vfxUse 'proc_consume'`; `priority` 3 = button-transform procs, 2 = free-cast procs, 1 = window buffs; at most 3 overlays are shown (COMBAT_WOW `maxOverlays`).
* **VFX / SFX**: ids from `types/vfx.ts` / `types/audio.ts` (many are aliases today, `vfx/aliases.ts`), CW-added ids (`proc_burst`, `proc_consume`, `crit_ring`, `arcane_charge_orb`, …) and **NEW** ids
  (defined in §g.3 with a one-line look). **anim** uses only the 76 clips that really exist in the five KayKit character GLBs (verified by reading the animation list of `Knight/Barbarian/Mage/Rogue/Rogue_Hooded.glb`; `Spellcast_Summon`, `Taunt` and `Spawn_Air`, which GDD_CLASSES_V2 §0.3 assumes, are **not** among them and are not used here).
* **Procs / statuses** use the COMBAT_WOW proc-engine row: `id · TR name · trigger · effect · duration · glow skill · overlay side`.
  Overlay colours follow COMBAT_WOW §2.7; the new schools use jade `#5de0a8` (Keşiş), fel `#9cff4a` (İblis Avcısı) and emerald/bronze `#7fe3c4` / `#d9a441` (Ejderhasoy).

### 0.3 APL condition DSL (usable by SimBench / `data/rotations.ts`)

```
line   := <skill_id> [ "if" cond ( "&&" cond )* ]          # ordered, first legal line wins each GCD; the LMB chain is the implicit last line
cond   := status:<id>[>=n]  |  !status:<id>                 # own status / stacks
        | tstatus:<id>[>=s | <=s]                            # status on the target, optional remaining-time bound (seconds)
        | remaining:<id><=s  |  missing:<id>                 # own status remaining time / an ally that lacks the status
        | charges>=n  |  cd:<skill><=s  |  cdready:<skill>
        | <res>>=n  |  pct:<res>>=f                          # res: energy chi focus fury mana essence soul
        | targets>=n  |  thp<f  |  php<f  |  fight>=s  |  moving  |  tcast                # tcast = target is casting (interrupt window)
        | stagger>=f  |  ally:hp<f  |  tank_hp<f  |  rank=n  # BM stagger pool fraction, lowest ally, tank, empower rank to release at
        | party_hp<f  |  injured>=n  |  party_spike  |  stored>=n          # party mean HP, injured allies, damage burst expected in 3 s, Stasis copies
        | party_wants_haste  |  allies_cds_up  |  tank_swap        # scenario flags supplied by the SimBench fight profile
```
`"hold <skill>@rank=n"` means: hold the empowered key until rank n, then release. Everything not listed falls through to the LMB chain.

### 0.4 Source conflicts of the research file, resolved once here (flagged again in the open questions)

| conflict (agile-evoker.md) | decision used by every table below |
|---|---|
| Bestial Wrath CD 90 s (Wowhead) vs 30 s (Method) | `m45` bucket, CD 45 s, 15 s window |
| Spirit Bomb / Soul Cleave resource: Fury (tooltip) vs fragments (Method) | **both**: Soul Cleave 22 Fury (+ eats ≤ 1 fragment), Spirit Bomb 25 Fury **and** ≥ 5 fragments |
| Fortifying Brew 6 min (Wowhead) vs 2 min (Method MW) | one class skill `monk_fortifying_brew`: `m180` for Demci (CD 180), `s3` for Sis Dokuyan (CD 120) |
| Tip the Scales CD 2 min vs 90 s | not a button; granted as a free `tip_scales` charge by Ejder Öfkesi (Dev) / Çağların Nefesi (Aug) |
| empowered spells "channel 2.5 s" (tooltip) vs empowered (guides) | **empowered**, 2.5 s × 0.8 = 2.0 s total hold, ranks at 0.67 / 1.33 / 2.00 s |
| Zenith Stomp removed on PTR vs present (Method) | present, folded into Invoke Xuen (one 2-min button, see Windwalker) |
| Blackout Kick "3 Chi" (WW table) | **1 Chi** (a 3-Chi kick every 3 s cannot be fed by 2 Chi per Tiger Palm); flagged |
| Ebon Might 10 s tooltip vs "recast at 4–5.5 s left" | 30 s CD, **20 s** base duration (+1 s per Eruption, cap 30 s) ⇒ 82 % uptime |
| Obsidian Scales "12 s, 2 charges" | 12 s duration, 90 s CD, 2 charges |
| Steady Shot "instant, generates Focus (n/v)" | **1.4 s hard cast** (deliberate deviation: it keeps the cast-then-release Marksman rhythm and the standing-still Focus bonus; as an instant it would be ≈ 23 button-mashed GCDs a minute). Focus is **not** the Marksman limiter — cast time and cooldowns are (§2.1 d) |
| Living Flame "12 % mana" (research file) | **2.5 % mana** — a deliberate ×0.21 rebase, all three Evoker specs. At 12 % the 14–19 Living Flame casts a minute would cost 168–230 % of the mana bar against a 78 % regen (Preservation's mana gate would fail by ≈ 130 %), so the filler / damage-mode button could not exist. The other Evoker costs are the research values (Reversion 2.2 %, Dream Breath 4.9 %, Fire Breath 1.8 %). Fallback if SimBench rejects the rebase: fewer Living Flame casts, not a higher cost (Preservation's damage is carried by the parallel chain anyway) |
| Azure Strike "instant, targeted, ranged filler" | kept **ranged**: `evoker_basic` is a pierce-2 projectile chain (range 25, up to 3 targets as in WoW), not a melee cone; Ejderhasoy is a ranged auto-attacker (CORE §12 "ranged classes auto-shoot") |
| Fiery Brand "60 s CD" (+ talent charge) | `x2` with a **30 s recharge** (tuning deviation: 2 casts a minute at steady state) so Vengeance's active-mitigation uptime reaches ≥ 60 % without a third source (§3.2 d) |
| Auto-attack as a slow weapon swing | LMB chain runs **in parallel** with the GCD at 0.33 coef/s (§0.5) |

### 0.5 Shared rules of the group

* **Passives** (`SpecDef.stats`, the GDD_V2 role baselines): tank `damagePct −0.25` (kept so "Yalnız Kurt" can lift it, CORE §1.5), healer `damagePct −0.40`, DPS none; Augmentation personal damage is
  tuned directly to 65 (no passive). Budget tables therefore list the **raw** coefficient sum and apply the passive on the last line.
* **Majors** keep the WoW CD bucketed to 45 / 90 / 180 s. Two exceptions are slot-limited (`m180` hosts a non-bucketed CD): Havoc's **The Hunt** (CD 90) and Vengeance's **Ruh Oyucu** (CD 60);
  `majors.ts` persists remaining seconds per slot, so a CD that differs from the bucket is technically free (flagged in the open questions).
* **Hero family** (CORE §3, `major_hero`, existing `heroBehavior`): Okçu (both specs, `archer_primal_rage`) and Ejderhasoy (all three, `evoker_fury_of_aspects`) own the m180 button `Kurt Narası`
  (`hero_haste` 40 s, `sated`). Sated length: CORE §3 says 10 min, COMBAT_WOW's `mage_time_warp` row says 150 s — **open question**; rows below use `sated: 600` (CORE wins).
* **Battle res**: Ejderhasoy (all specs) may use the revive key (Z) in combat (class passive `battle_res`, shared 1-per-10-min pool of CM3). No bar slot.
* **Interrupts** apply the COMBAT_WOW §2.6 rule: cancel + `silence` 3 s on trash/elite, boss: cancel only, poise +20.
* **LMB** of every class keeps the GDD_CLASSES_V2 §0.4 chain rules (weights 0/0/4/1, stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0, finisher last) — only coefficients and per-hit resource hooks are retuned (chain tables below).
* **LMB parallel rule (the one rule behind every budget table).** The chain is the WoW auto-attack analogue (CORE §10.1 / §12: it runs by itself against the current target while the target is in range and the player is in combat). It runs **in parallel with the GCD**: instants, hard casts, channels and empower holds do **not** pause the swing timer (verified in code: `SkillSystem.autoReady` returns false while `p.cast`, a channel, a charge / hold or a ground aim is active, because a swing would cancel that action — **engine item g.2 #19 (AE-ENG)** lets the due chain steps fire as *unanimated auto-hits* in those states: effect + sfx at the muzzle / on the target, no clip, no action cancel, the swing timer keeps running; instants and off-GCD buttons already coexist with the chain through the existing `chainAt` cancel point). SimBench models the chain as flat damage. If #19 is rejected the fallback is the WoW "no auto-attack while casting" rule, which removes ≈ 16–20 coef of the chain from Nişancı, Yıkım Nefesi, Yüceltme and Koruyucu Nefes and ≈ 4 from Rüzgâr Yürüyen (open question 15). Hence the chain is budgeted as a flat **≈ 0.33 coef/s ⇒ ≈ 20 per 60 s** (monk 0.34, archer 0.34, İblis Avcısı 0.325, Ejderhasoy 0.34: the four chains are rescaled so every DPS spec gets "LMB ≈ 20 % of the ST budget"). The two healers carry an explicit chain multiplier through `mods` (Sis Dokuyan ×1.9 incl. echo kicks, Koruyucu Nefes ×2.4) because their damage budget is 35 per minute and their GCDs belong to healing; the tanks, Yüceltme and every DPS use the plain chain. **The chain never competes with a GCD button**: every filler is worth more per GCD second than the chain's 0.34 coef/s (smallest: Yüceltme Yaşayan Alev 0.75 per 1.6 s = 0.47 coef/s, Nişancı Sabit Atış 0.60 per 1.4 s = 0.43, Av Ustası Kobra Atışı 0.55 per 1.0 s), and "LMB only" play is worth ≈ 20 of 100. Because the chain now swings 47–60 times a minute instead of the 6–15 times of the old idle-only model, **every per-hit resource / proc number of the chains was divided by the same factor** (monk Enerji +3 → +2 per hit, Çi hooks become finisher PRDs; archer Odak +2 → +1; İblis Avcısı Öfke +3 → +1, fragment on the finisher 100 % → 20 %; Öz on the Evoker finisher 50 % → 6 %, Öz Patlaması on the Yıkım finisher 5 % → 1 %), and every resource-check line below was re-derived with the chain's full-minute income.
* **Idle GCDs.** The last GCD line of every APL is the rmb filler (the chain is no longer an implicit last line). Resource-gated specs (Demci, Windwalker, Av Ustası, Kaos, İntikam) wait for the resource in the leftover 0–6 s; healers deliberately leave GCDs idle (reactive, and mana is their gate).
* **Budget model** (all `Σ` lines): GCD 1.0 s, 0 haste / 0 crit; an instant occupies 1.0 s, a hard cast / channel / empower hold its duration (an empower hold shorter than the GCD counts as 1.0 s; the rank-3 holds of the AoE pull count their full 2.0 s), an off-GCD button 0.3–0.5 s of animation. Rotations are **GCD-saturated** (busy 57–60 s of 60, the rest is resource-starved ticks) unless the spec section says otherwise; the filler absorbs the time the listed buttons leave over; the chain adds its flat rate on top (× 60 s in ST, × 30 s and × its target count in the 8-target pull: monk 3, archer 2.6 (pierce 2 + line finisher, coef-weighted over the four steps), İblis Avcısı 2.5, Ejderhasoy 3). Majors are amortised ×60/CD (×40/CD in the 30 s AoE pull because M+ pulls repeat every 40 s); AoE per-target coefficient = ST coefficient × falloff (≤ 1). The script that produced every calc table is not shipped; numbers can be re-derived from the tables.
* **Shared skill ids with per-spec numbers → `SpecDef.mods`.** An id used by more than one spec has **one base row** (in `data/skillsets/<class>.ts`; the base is the first spec named in the table below) and every other spec lists a `mods` entry `{ skill, patch?, params? }` in its own section ("Spec mods" tables of §1–§4, copied 1:1 into `data/specs_kit_<class>.ts` by AE-1…AE-4). `combat/specs.ts specPatched()` already shallow-merges `patch` onto the SkillDef and `params` onto `params` for every spec (it is *not* threat-only, despite the header comment of `data/specs.ts`), so `cost`, `cooldown`, `charges`, `defaultSlot`, `damage`, `heal`, `pip`, `replaces`, `selfStatuses`, `statuses` are all patchable and **no engine change is needed** (AE-ENG only owns hook call sites, below). Two rules: nested objects (`damage`, `heal`, `pip`) are replaced wholesale, so a patch carries the whole object; `params.major` is **never** set on a non-hero row (`isHeroDef` reads `params.major === 180`, the bucketing comes from `defaultSlot`). Per-hit resource gains, PRD rolls, `essence_burst` sources and Sis Esintisi are not skill fields: they live in the spec hook table `combat/specs/<class>.ts` keyed by `SpecId` (registered by the bottom import of `behaviors.ts`, §h).

| shared id | base row = | patched by |
|---|---|---|
| `monk_tiger_palm`, `monk_blackout_kick` | Rüzgâr Yürüyen | Demci |
| `monk_rising_sun_kick`, `monk_spinning_crane` | Rüzgâr Yürüyen (`e` 10 s 2.50 / `s1` 2.10) | Sis Dokuyan |
| `monk_fortifying_brew` | Sis Dokuyan (`s3`, 120 s) | Demci (`m180`, 180 s) |
| `monk_basic_1.._4` | plain chain | Sis Dokuyan (×1.9) |
| `demonhunter_immolation_aura`, `demonhunter_metamorphosis` | Kaos | İntikam |
| `evoker_living_flame`, `evoker_fire_breath` | Yıkım Nefesi | Koruyucu Nefes (LF), Yüceltme (LF, FB) |
| `evoker_basic_1.._3` | plain chain | Koruyucu Nefes (×2.4) |
| `essence_burst` (StatusDef + one `ProcDef` + one `PROC_MODS` row keyed by status) | one row whose `skills` / glow list is the union of the three free-spell sets | none: the skills a spec does not own are not on its bar, so they never glow |
| `archer_*`, `demonhunter_basic`, `evoker_obsidian_scales`, `evoker_quell`, `evoker_hover` | identical in every spec | – |

---

# 1. Keşiş (`monk`) — Demci · Sis Dokuyan · Rüzgâr Yürüyen

**Class frame** (unchanged from GDD_CLASSES_V2 §2 unless stated): Barbarian.glb (unarmed, `Mug` shown only while a brew animation plays), main stat Çeviklik, medium armour, Enerji bar (100, regen 10/s)
+ `chi` pips (0–5, jade `#5de0a8`). Spec resource: the pip bar is shown for Rüzgâr Yürüyen and Sis Dokuyan, hidden for Demci. **Sis Dokuyan swaps the primary bar to Mana** (`SpecDef.resource = 'mana'`, new field §g.2,
because a healer is judged on mana, CORE §5.3). Trait `trait_flow` (Akış: +6 % move speed, perfect dodge +1 Çi, roll → next chain +20 % speed) stays. All three specs apply **Mistik Dokunuş** (`mystic_touch`, 30 s,
enemies take +5 % physical, applied on every LMB / Kaplan Avucu hit; CM3 owns the debuff table).

**Shared LMB chain `monk_basic`** (`behavior combo`, 4 steps, reset 0.8 s, tempo `FEEL_WEAPON.fist` 1.15): chain tempo 1.265 s (47.4 chains, 190 hits per 60 s) ⇒ **0.34 coef/s ≈ 20.4 per 60 s** (parallel rule, §0.5).

| step id | TR | anim · speed @hit | arc / range | coef | weight / stagger | VFX · SFX |
|---|---|---|---|---:|---|---|
| `monk_basic_1` | Sert Yumruk | `Unarmed_Melee_Attack_Punch_A` ×1.9 @0.41 | 90° / 2.5 | 0.08 phys | 0 / 3, lunge 0.6 | `fist_trail` → `hit_spark` · `punch_hit` |
| `monk_basic_2` | Çapraz Yumruk | `Unarmed_Melee_Attack_Punch_B` ×1.85 @0.50 | 100° / 2.5 | 0.08 phys | 0 / 3 | `fist_trail` · `punch_hit` |
| `monk_basic_3` | Yükselen Tekme | `Unarmed_Melee_Attack_Kick` ×1.5 @0.36 | 80° / 3.0 | 0.11 phys, knock-up 0.45 | 4 / 5, `kick` | `kick_arc` + `chi_burst`(0.5) · `kick_hit` |
| `monk_basic_4` | Çift Avuç | `Dualwield_Melee_Attack_Stab` ×1.35 @0.512 | 70° / 3.0 | 0.16 phys, finisher | 1 / 9, root | `slash_arc_big` + `palm_shock` · `punch_hit` |

Per-spec LMB hooks (spec hook table `combat/specs/monk.ts`, not SkillDef fields; numbers are the parallel-rule values of §0.5): **Demci** +2 Enerji per hit (8 per chain, ≈ 379 per minute), step 4 +3 s `shuffle`;
**Rüzgâr Yürüyen** step 4 (finisher) 40 % PRD +1 Çi (≈ 19 per minute); **Sis Dokuyan** chain ×1.9 (`mods`, §1.2), steps 1–2 +1 `teachings` stack (max 4), step 3 spends all stacks for one 0.10-coef echo kick each, step 4 25 % PRD +1 Çi (≈ 12 per minute), every damaging hit feeds **Sis Esintisi**.

---

## 1.1 `monk_brewmaster` — Demci (tank, WoW Brewmaster)

**Passive (`SpecDef.stats`)**: `maxHpPct .30, armorPct .25, dodgeChance .08, threatPct 1.5, damagePct −.25`. **Trait `trait_brewmaster` (Sarsma, GDD_CLASSES_V2 §1.11 retuned)**: 30 % of every non-perilous hit
goes into the stagger pool instead of HP (55 % while `shuffle` is up); the pool drains as true damage, `max(3, pool × 0.05)` every 0.5 s (≈ 10 s to clear, WoW wording); pool cap 80 % max HP.
Bands (HUD bar colour): light < 30 %, moderate 30–60 %, heavy ≥ 60 % of max HP; heavy adds `healReceivedPct −0.25` until the pool is under 45 %.

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses (applied / consumed) | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `monk_basic` (+`_1.._4`) | Keşiş Kombosu | auto attack | inst chain | melee_arc | 2.5–3 | – | +2 Enerji / hit | off | 0.08/0.08/0.11/0.16 phys | step 4: +3 s `shuffle` | – | `fist_trail` `kick_arc` `palm_shock` | per step: `Unarmed_Melee_Attack_Punch_A`, `…_Punch_B`, `…_Kick`, `Dualwield_Melee_Attack_Stab` | `punch_hit` `kick_hit` |
| rmb | `monk_tiger_palm` | Kaplan Avucu | Tiger Palm | inst | target_instant | 4 (+3) | – | −25 Enerji | on | 0.65 phys (×1.55 with `blackout_combo` ⇒ 1.01) | consumes `blackout_combo`; `mystic_touch`; threatMult 1.5 | glow on `blackout_combo` | `palm_shock` `chi_burst` | `Unarmed_Melee_Attack_Punch_B` | `punch_hit` |
| q | `monk_blackout_kick` | Kara Tekme | Blackout Kick | inst | target_instant (cone 120°, ≤ 3 targets) | 4 (+3) | 3 s | – | on | 0.85 phys | +5 s `shuffle` (cap 15 s); applies `blackout_combo` 6 s | creates `blackout_combo` | `kick_arc` `chi_burst` | `Unarmed_Melee_Attack_Kick` ×1.3 | `kick_hit` |
| e | `monk_keg_smash` | Fıçı Darbesi | Keg Smash | inst | target_instant + AoE r 6 | 4 (+3) | 8 s | −40 Enerji | on | 2.80 phys | +5 s `shuffle`; `slow` 20 % 15 s; `keg_mark` 15 s on targets; `cdrOnCast` −3 s on Purifying + Celestial Brew; threatMult 3 | – | `brew_splash` + `ground_slam`(0.7); Mug ×2.4 as keg | `2H_Melee_Attack_Chop` ×1.35 | `ground_slam` `pot_break` |
| r | `monk_breath_of_fire` | Ateş Nefesi | Breath of Fire | inst | melee_arc (arc 90°, range 8) | 8 | 15 s | – | on | 2.60 fire (incl. 3 s burn); +40 % DoT on `keg_mark` targets | `burn` 3 s | – | `fire_burst` cone + `burn_loop` | `Use_Item` (drink, spit) ×1.5 | `fire_cast` |
| s1 | `monk_provoke` | Alay Et | Provoke | inst | target_instant | 25 | 8 s | – | off | – | `taunt` 3 s (boss: forced 2 s, ICD 12 s; threat := max(cur, top × 1.1) + 100) | – | `mark_loop` amber | `Cheer` ×2.2 | `war_cry` |
| s2 | `monk_chi_torpedo` | Çi Torpidosu | Roll / Chi Torpedo | inst | dash | 12 | 10 s x2 | – | off | path 0.8 phys (not budgeted) | self `chi_flow` 2.5 s | – | `dragon_trail` `palm_shock` | `Running_A` ×2 | `whoosh` |
| s3 | `monk_purifying_brew` | Arındırıcı İksir | Purifying Brew | inst | self_buff | – | 18 s x2 | – | off | heal 6 % max HP | clears 50 % of the stagger pool; +1 `purified_chi` (max 4, 20 s); 20 % `one_more_round` | `one_more_round` | `brew_splash` (0.7) + `heal_burst` | `Use_Item` ×2.2 | `potion_drink` |
| s4 | `monk_spear_hand` | Mızrak Eli | Spear Hand Strike | inst | melee_arc (existing `interrupt` behaviour) | 4, cone 90° | 15 s | – (row cost 15 → 0) | off | – | cancel + silence 3 s (row 4 → 3) | – | `palm_shock` | `Dualwield_Melee_Attack_Stab` ×1.5 | `interrupt` |
| m45 | `monk_celestial_brew` | Göksel Demlik | Celestial Brew | inst | self_buff | – | 45 s (bucket, WoW 60) | – | off | absorb = 14 % max HP × (1 + 0.25 × `purified_chi`) | consumes `purified_chi`; 8 s `shield` | – | `shield_bubble` gold | `Use_Item` ×1.8 | `potion_drink` `buff` |
| m90 | `monk_bm_black_ox` | Kara Öküz Niuzao | Invoke Niuzao | inst | summon (minion `monk_black_ox` 25 s, rhino model) | 40 | 90 s (bucket, WoW 120) | – | off | ox 8.7 total over 25 s (stomp every 3 s) | each stomp −8 % stagger pool; self +15 % absorb of stagger | – | `pet_summon` | `Cheer` ×1.5 | `boss_roar` |
| m180 | `monk_fortifying_brew` | Güçlendirici İksir | Fortifying Brew | inst | self_buff | – | 180 s (bucket, WoW 360) | – | off | heal 20 % max HP | `fortifying` 15 s: +20 % max HP, −20 % damage taken; +15 % stagger effectiveness | – | `brew_splash` + `shield_bubble` | `Use_Item` ×1.8 | `potion_drink` |

Dropped from the WoW kit (slot-limited): Touch of Death, Dampen Harm, Exploding Keg, Spinning Crane Kick (Demci has no AoE button — Keg Smash + Breath of Fire + the ≤ 3-target Blackout Kick are its AoE).

**Spec mods (Demci)** — base rows are Rüzgâr Yürüyen's (§0.5):

| skill | patch / params |
|---|---|
| `monk_tiger_palm` | `patch { cost: 25, pip: undefined, damage: { coef: 0.65, type: 'physical' } }`, `params { threatMult: 1.5 }` (the ×1.55 `blackout_combo` is a hook of `combat/specs/monk.ts`) |
| `monk_blackout_kick` | `patch { pip: undefined, damage: { coef: 0.85, type: 'physical' } }` (no Çi cost) |
| `monk_fortifying_brew` | `patch { defaultSlot: 'm180', cooldown: 180 }` (base row is the Sis Dokuyan `s3` / 120 s one; neither sets `params.major`) |
| `monk_keg_smash` | `params { threatMult: 3 }` (Demci-only row; shown for completeness) |

### b) Procs and statuses (COMBAT_WOW proc engine rows)

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `shuffle` | Sarhoş Adım | Kara Tekme +5 s, Fıçı Darbesi +5 s, LMB finisher +3 s (cap 15 s) | stagger absorb 30 % → 55 % | 15 s cap | – | HUD buff icon only |
| `blackout_combo` | Kara Kombo | Kara Tekme hit | next Kaplan Avucu +55 % damage | 6 s | `monk_tiger_palm` | left, amber `#ffc060` |
| `purified_chi` | Arınmış Çi | Arındırıcı İksir (+1, max 4) | Göksel Demlik shield ×(1 + 0.25 × stacks) | 20 s | `monk_celestial_brew` at ≥ 3 | – |
| `one_more_round` | Bir Tur Daha | PRD 20 % on Arındırıcı İksir / Göksel Demlik cast (icd 5 s) | next Arındırıcı İksir spends no charge | 10 s | `monk_purifying_brew` | both, gold |
| `keg_mark` | Fıçı İşareti | Fıçı Darbesi (debuff on enemies) | Ateş Nefesi DoT +40 % | 15 s | – | target-frame own debuff |
| `stagger_pool` (hidden) | Sarsma | passive | pool mechanics above; HUD band bar | – | – | HUD StaggerBar |

### c) APL

```
# ST
monk_celestial_brew        if status:purified_chi>=3 && stagger>=0.30        # m45
monk_purifying_brew        if stagger>=0.30 && charges>=1  ||  charges>=2 && stagger>=0.15
monk_bm_black_ox           if fight>=25                                        # m90 on cooldown
monk_fortifying_brew       if php<0.35                                         # m180 emergency
monk_blackout_kick         if cdready:monk_blackout_kick
monk_tiger_palm            if status:blackout_combo && energy>=25
monk_keg_smash             if cdready:monk_keg_smash && energy>=40
monk_breath_of_fire        if cdready:monk_breath_of_fire && tstatus:keg_mark
monk_tiger_palm            if energy>=25                                       # filler: spends every point of Energy the chain and regen provide
monk_spear_hand            if tcast
monk_provoke               if tank_swap
# AoE: identical, but Keg Smash and Breath of Fire move above Blackout Kick; Kara Tekme cleaves 3.
```

### d) Budget hand calculation (Demci)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Kara Tekme `monk_blackout_kick` | 18 | 3 s CD, no cost; every 3rd GCD | 0.85 | 15.3 |
| Kaplan Avucu `monk_tiger_palm` (Kara Kombo) | 18 | 25 Energy, one per Kara Tekme, ×1.55 | 1.01 | 18.14 |
| Kaplan Avucu `monk_tiger_palm` (plain) | 9.4 | Energy-limited filler, takes every GCD the rest leaves | 0.65 | 6.11 |
| Fıçı Darbesi `monk_keg_smash` | 7.5 | 8 s CD, 40 Energy | 2.8 | 21 |
| Ateş Nefesi `monk_breath_of_fire` | 4 | 15 s CD | 2.6 | 10.4 |
| Alay Et `monk_provoke` | 1.5 | taunt, 8 s CD, ≈ 1.5 uses (no damage) | 0 | 0 |
| Niuzao `monk_bm_black_ox` | 0.67 | m90: 60 / 90 (ox 25 s) | 8.7 | 5.83 |
| Arındırıcı İksir `monk_purifying_brew` | 4.6 | off-GCD, 2 charges / 18 s, Keg −3 s ⇒ 4.6 | 0 | 0 |
| Göksel Demlik `monk_celestial_brew` | 1.33 | m45: 60 / 45, off-GCD | 0 | 0 |
| LMB chain (parallel, all 60 s) | 47.4 chains | 0.43 per chain = 0.34 / s | – | 20.4 |
| **Σ raw** | | | | **97.2** (target 93.3) |
| × passive `damagePct −0.25` | | | | **72.9** (target 70 ±5) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Kara Tekme `monk_blackout_kick` — 3 s CD, cleaves 3 (Shadowboxing Treads), 6 of 10 slots | 6 | 3 | 0.85 | 15.3 |
| Kaplan Avucu `monk_tiger_palm` (Kara Kombo) | 6 | 1 | 1.01 | 6.04 |
| Kaplan Avucu `monk_tiger_palm` (plain) — Energy left after Keg / Breath | 7 | 1 | 0.65 | 4.55 |
| Fıçı Darbesi `monk_keg_smash` — 0 / 8 / 16 / 24 s | 4 | 8 | 2.8 | 89.6 |
| Ateş Nefesi `monk_breath_of_fire` — 0 / 15 s | 2 | 8 | 2.6 | 41.6 |
| Niuzao `monk_bm_black_ox` — 40 / 90, ox stomps 3 targets | 0.44 | 3 | 4.35 | 5.74 |
| LMB chain (parallel, 30 s, cleaves 3) | 23.7 chains | 3 | 0.43 per chain (10.2 per target) | 30.6 |
| **Σ raw** | | | | **193.4** (target 210) |
| × passive `damagePct −0.25` | | | | **145.1** (target 158 ±15) |

Time budget: ST GCD busy 56.9 s + 3.0 s off-GCD animation = 59.9 of 60 s; AoE GCD busy 25.0 s + 1.5 s off-GCD, 3.5 s Energy-starved idle. Resource check per window — Energy ST in 979 (600 regen + 379 chain) / out 985 (7.5 Keg × 40 + 27.4 Kaplan Avucu × 25), AoE in 490 (300 + 190) / out 485 (4 × 40 + 13 × 25).

**Active mitigation uptime** (rule ≥ 60 %): `shuffle` is the AM of this spec. Sources: Kara Tekme 18/min × 5 s + Fıçı Darbesi 7.5/min × 5 s + the chain finisher 47.4/min × 3 s ≈ 270 s of refresh per 60 s against a 15 s cap,
and the longest gap between two refreshes is Kara Tekme's 3 s CD ⇒ **≈ 99 % uptime**. Arındırıcı İksir clears ≈ 4.6 × 50 % of the pool per minute; Göksel Demlik covers 1.33 × 8 s = 10.7 s (18 %) of absorb.
Self-heal share (CORE target 15–30 %): Purifying heal 4.6 × 6 % = 27.6 % max HP/min + Celestial 1.33 × (14–28 %) absorb + Fortifying; ≈ 22 % of damage taken at the boss melee profile (SimBench to confirm).
**Party buff**: Mistik Dokunuş (+5 % physical damage taken, 30 s) refreshed by every LMB / Kaplan Avucu hit.

### e) What it feels like

* **Kick–punch rhythm**: every third GCD is Kara Tekme (the kick that arms Kara Kombo and tops up Sarhoş Adım), then a Kaplan Avucu that lights up amber, then Fıçı Darbesi or filler. It is a metronome with accents.
* **The stagger bar is the health bar**: hits do not tick HP down, they pour into a brown-gold pool that bleeds out; pressing Arındırıcı İksir is a visible *dump* (half the bar vanishes, amber mist sweeps off the monk).
  Göksel Demlik after 3–4 purifies is the "I am invincible for 8 s" moment.
* **Niuzao** lands with a ground-shaking stomp every 3 s that visibly shrinks the stagger bar.
* **Signature move — Fıçı Darbesi**: `2H_Melee_Attack_Chop` at ×1.35, the `Mug` node swaps to a barrel (scale ×2.4) raised overhead for the wind-up frames (hit frame 0.735 s of the clip, lead-skip does not apply: `params.lead 0`),
  on the hit frame a `ground_slam` ring (r 6) + `brew_splash` amber-brown spray fan along the facing, 8 % camera trauma, 70 ms victim hit-stop (weight 2), `ground_slam` + `pot_break` layered, barrel shards (`death_bones` tinted
  amber, 6 sprites) fly outward and the Mug swaps back at 0.35 s after the hit; every marked enemy gets an amber barrel-ring on its feet for 15 s (target-frame own-debuff icon pulses at < 30 %).
  Voice: `voice_warrior_hut`.

---

## 1.2 `monk_mistweaver` — Sis Dokuyan (healer, WoW Mistweaver)

**Passive**: `healingPct .30, resourceRegenPct .25, castSpeed .10, threatPct −.4, damagePct −.40`; primary bar = **Mana** (100; base 0.75 %/s). Trait `trait_mistweaver` **Sis Esintisi** (Gust of Mists, mastery
analogue): every damaging hit of this spec (LMB step, Doğan Güneş Tekmesi, Dönen Turna tick) heals the lowest-HP ally within 30 m for 25 % of the hit's coefficient as healing (Taşan Şifa overheal ward of GDD_V2 stays).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `monk_basic` (+`_1.._4`) | Keşiş Kombosu | Tiger Palm / Blackout Kick weaving | inst chain | melee_arc | 2.5–3 | – | 25 % PRD +1 Çi (step 4), +1 `teachings` (steps 1–2) | off | **×1.9 spec mod**: 0.15/0.15/0.21/0.30 phys; Sis Esintisi heal 25 % | step 3 spends `teachings`: 1 echo kick (0.10) per stack (2 per chain) | – | `fist_trail` `kick_arc` | per step: `Unarmed_Melee_Attack_Punch_A`, `…_Punch_B`, `…_Kick`, `Dualwield_Melee_Attack_Stab` | `punch_hit` `kick_hit` |
| rmb | `monk_mw_vivify` | Canlandırma | Vivify | cast 1.2 s (inst with proc) | target_instant ally | 30 | – | −3 % mana | on | heal 2.8 (target 2.0 + 0.4 to each of 2 Yenileyici Sis carriers) | consumes `vivacious_vivification` | `vivacious_vivification` | `heal_burst` pale green | `Spellcast_Raise` | `heal` |
| q | `monk_mw_enveloping_mist` | Sarmalayan Sis | Enveloping Mist | cast 1.6 s | target_instant ally | 30 | – | −3.6 % mana | on | HoT 4.6 over 6 s | target `enveloped` (+10 % from your heals) | `thunder_focus` makes it instant | `heal_loop` jade cocoon | `Spellcasting` ×0.9 | `heal` |
| e | `monk_mw_renewing_mist` | Yenileyici Sis | Renewing Mist | inst | target_instant ally | 30 | 8 s x2 | −1.8 % mana | on | HoT 2.8 (20 s) | `renewing_mist` (regen), jumps to the 2 lowest allies | creates `vivacious_vivification` (PRD 15 %, icd 6 s) | `heal_loop` green motes | `Spellcast_Shoot` ×1.6 | `heal` |
| r | `monk_mw_thunder_tea` | Gök Gürültüsü Çayı | Thunder Focus Tea | inst | self_buff | – | 30 s | – | off | – | `thunder_focus` 30 s: next Yenileyici Sis +1 jump & +10 s, next Sarmalayan Sis instant, next Canlandırma twice | glow | `brew_splash` gold + `buff_aura` | `Use_Item` ×1.8 | `potion_drink` |
| s1 | `monk_rising_sun_kick` | Doğan Güneş Tekmesi | Rising Sun Kick | inst | target_instant | 4 (+3) | 12 s | −2 Çi, −2.5 % mana | on | 1.5 phys (spec patch) + Jadefire heal 2.0; `replaces` → `monk_spinning_crane` while `dance_of_chiji` | −1 s on Yenileyici Sis CD; `mystic_touch` | `dance_of_chiji` (PRD 6 % on TP-role hits) | `kick_arc` gold + `holy_burst`(0.6) | `Unarmed_Melee_Attack_Kick` | `kick_hit` |
| s2 | `monk_chi_torpedo` | Çi Torpidosu | Roll | inst | dash | 12 | 10 s x2 | – | off | – | `chi_flow` | – | `dragon_trail` | `Running_A` | `whoosh` |
| s3 | `monk_fortifying_brew` | Güçlendirici İksir | Fortifying Brew | inst | self_buff | – | 120 s (Method) | – | off | heal 20 % max HP | `fortifying` 15 s | – | `shield_bubble` | `Use_Item` | `potion_drink` |
| s4 | `monk_spear_hand` | Mızrak Eli | Spear Hand Strike | inst | melee_arc (`interrupt`) | 4 | 15 s | – | off | – | silence 3 s | – | `palm_shock` | `Dualwield_Melee_Attack_Stab` ×1.5 | `interrupt` |
| m45 | `monk_mw_life_cocoon` | Yaşam Kozası | Life Cocoon | inst | target_instant ally | 30 | 45 s (bucket, WoW 60) | −2.4 % mana | off | absorb 4.5 units (≈ 22 % target max HP) | 12 s `shield`; target takes +50 % from your HoTs | – | `shield_bubble` pale jade | `Cheer` ×1.6 | `buff` |
| m90 | `monk_mw_invoke_yulon` | Yu'lon | Invoke Yu'lon | inst | summon (VFX zone, no model) | 40 | 90 s (bucket, WoW 120) | −5 % mana | off | 25 s of 0.8 s pulses: 11 units over the 5-man; Sarmalayan Sis cast time −40 % | `yulon_window` | – | **NEW** `jade_serpent` | `Spellcast_Raise` ×1.2 | `gong` `choir_swell` |
| m180 | `monk_mw_revival` | Diriliş | Revival | inst | self_aoe | 30 | 180 s | −4.4 % mana | off | heal 3.0 per ally (13.5 effective on 4.5) | cleanse 2 each | – | `heal_pillar` wide ring | `Cheer` | `heal_big` |

Dropped (slot-limited): Detox (Diriliş and Gök Gürültüsü Çayı's empowered Canlandırma dispel 1), Soothing Mist, Chi-Ji (Yu'lon only), Mana Tea, Touch of Death.

**Spec mods (Sis Dokuyan)** — base rows are Rüzgâr Yürüyen's (§0.5); `monk_fortifying_brew` is this spec's base row:

| skill | patch / params |
|---|---|
| `monk_basic_1` … `_4` | `patch { damage: { coef: 0.15 / 0.15 / 0.21 / 0.30, type: 'physical' } }` (plain 0.08 / 0.08 / 0.11 / 0.16 × 1.9; the echo kick 0.10 is a hook) |
| `monk_rising_sun_kick` | `patch { defaultSlot: 's1', cooldown: 12, cost: <2.5 % mana>, pip: { id: 'chi', cost: 2 }, damage: { coef: 1.5, type: 'physical' }, heal: { coef: 2.0 }, replaces: { skill: 'monk_spinning_crane', whileStatus: 'dance_of_chiji' } }` |
| `monk_spinning_crane` | `patch { defaultSlot: undefined, damage: { coef: 1.65, type: 'physical' } }` (reachable only through the `replaces` above) |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `vivacious_vivification` | Canlı Canlandırma | Yenileyici Sis cast, PRD 15 %, icd 6 s | next Canlandırma instant, −25 % mana | 10 s | `monk_mw_vivify` | left, pale green `#b8f5d0` |
| `thunder_focus` | Gök Gürültüsü | Gök Gürültüsü Çayı | empowers the next RM / EM / Vivify (see kit) | 30 s | the three heals | top, gold |
| `dance_of_chiji` | Chi-Ji Dansı | PRD 6 % (icd 4 s) on Tiger-Palm-role LMB hits | Dönen Turna Tekmesi free, +40 %; **s1 button transforms** | 15 s | `monk_spinning_crane` | top, red-gold `#ff8a70` |
| `teachings` | Tekke Öğretisi | LMB steps 1–2, max 4 | step 3 gains one echo kick per stack | 15 s | – | HUD stack |
| `renewing_mist` | Yenileyici Sis | cast | HoT 20 s, jumps | 20 s | – | ally frame |
| `enveloped` | Sarılmış | cast | +10 % healing taken from the monk | 6 s | – | ally frame |
| `yulon_window` | Yu'lon Penceresi | Invoke Yu'lon | pulses + EM cast −40 % | 25 s | `monk_mw_enveloping_mist` | center, jade |

### c) APL (healer: reactive; priority per GCD)

```
monk_mw_life_cocoon        if ally:hp<0.30                                     # m45
monk_mw_revival            if party_hp<0.55                                    # m180
monk_mw_invoke_yulon       if cdready && party_spike                          # m90 (ramp: Thunder Tea + 2 Renewing first)
monk_mw_thunder_tea        if cdready                                          # on cooldown
monk_mw_vivify             if status:vivacious_vivification && ally:hp<0.75
monk_mw_renewing_mist      if charges>=2 || missing:renewing_mist && ally:hp<0.9
monk_mw_enveloping_mist    if ally:hp<0.6
monk_mw_vivify             if ally:hp<0.5
monk_spinning_crane        if status:dance_of_chiji                            # s1 transformed
monk_rising_sun_kick       if cdready:monk_rising_sun_kick
monk_spear_hand            if tcast
# idle GCDs stay idle on purpose (mana gate); the parallel LMB chain (×1.9) keeps punching and Sis Esintisi heals from every hit
```

### d) Budget hand calculation (Sis Dokuyan)

**Healing — 60 s on the 5-man stream** (units = heal coef × allies effectively healed; SimBench applies 95 % efficiency)

| ability | casts / 60 s | how | heal / cast | total heal | mana % / cast | total mana % |
|---|---:|---|---:|---:|---:|---:|
| Canlandırma `monk_mw_vivify` | 8 | 1.2 s cast, target + 2 Renewing Mist carriers (effective) | 2.8 | 22.4 | 3 | 24 |
| Sarmalayan Sis `monk_mw_enveloping_mist` | 4 | 1.6 s cast, 6 s HoT, +10 % bonus on the target | 4.6 | 18.4 | 3.6 | 14.4 |
| Yenileyici Sis `monk_mw_renewing_mist` | 6 | 2 charges / 8 s (+1 s per Rising Sun Kick), jumps 2× | 2.8 | 16.8 | 1.8 | 10.8 |
| Gök Gürültüsü Çayı `monk_mw_thunder_tea` | 2 | 30 s CD, empowers the next heal (+2 units) | 2 | 4 | 0 | 0 |
| Doğan Güneş Tekmesi `monk_rising_sun_kick` | 5 | 12 s CD, Jadefire: 100 % of damage ⇒ heal + Sis Esintisi | 2 | 10 | 2.5 | 12.5 |
| Dönen Turna Tekmesi (Chi-Ji dansı) `monk_spinning_crane` | 1.5 | free, only on Chi-Ji Dansı procs | 0.8 | 1.2 | 0 | 0 |
| Yaşam Kozası `monk_mw_life_cocoon` | 1.33 | m45: 60 / 45, absorb counted as healing | 4.5 | 6 | 2.4 | 3.2 |
| Yu'lon `monk_mw_invoke_yulon` | 0.67 | m90: 60 / 90, 25 s of 0.8 s pulses | 11 | 7.34 | 5 | 3.33 |
| Diriliş `monk_mw_revival` | 0.33 | m180: 60 / 180, 3.0 × 4.5 targets + cleanse | 13.5 | 4.5 | 4.4 | 1.47 |
| Sis Esintisi (LMB hits heal the lowest ally for 25 % of their damage) | – | parallel chain ×1.9 incl. echo kicks = 48.2 coef | – | 12.06 | 0 | 0 |
| **Σ** | | | | **102.7** (target 100 ±5) | | **69.7** |

Mana: spend 69.7 %/min, regen 56.2 %/min (class base 0.75 %/s = 45/min × (1 + spec passive resourceRegenPct 0.25)) ⇒ net -13.4 %/min ⇒ after 300 s: **32.8 % left** at 100 % efficiency and **14.4 % left** at 95 % efficiency (spend ÷ 0.95 = 73.4 %/min; gate ≥ 5 %).

**Damage — 60 s** (raw, before the healer passive `damagePct −0.40`)

| source | casts | coef / cast | total |
|---|---:|---:|---:|
| Doğan Güneş Tekmesi `monk_rising_sun_kick` | 5 | 1.5 | 7.5 |
| Dönen Turna Tekmesi (Chi-Ji dansı) `monk_spinning_crane` | 1.5 | 1.65 | 2.47 |
| LMB chain (parallel, ×1.9 spec mod): 47.4 chains × 0.82 + 47.4 × 2 echo kicks × 0.10 | 60 s | 0.80 / s | 48.24 |
| **Σ raw** | | | **58.2** × 0.60 = **34.9** (target 35) |

Time budget: GCD busy 30.6 s (the other 29.4 s are reactive idle GCDs: nobody injured enough, mana is the gate); the chain swings the whole minute.

**Party buff**: Mistik Dokunuş (same debuff as the other two monk specs; a second monk does not add a second copy).

### e) What it feels like

* **Ramp, then payoff**: Gök Gürültüsü Çayı → Yu'lon → two Yenileyici Sis → instant Sarmalayan Sis; the Enveloping cast bar visibly speeds up inside the 25 s serpent window.
* **Punches that heal**: while nobody is hurt the monk keeps punching, and every landed hit sends a tiny jade wisp to the lowest-HP ally (Sis Esintisi) — the healer is never idle.
* **Canlı Canlandırma** is the reactive "save": the left overlay flashes pale green and Vivify turns instant.
* **Signature move — Invoke Yu'lon**: `Spellcast_Raise` ×1.2, a 14 m jade serpent ribbon (**NEW** `jade_serpent`: 3 stacked additive ribbons with a sine wave, white head with two horn sprites, 25 s) spirals out of the
  ground, circles the party at 6 m radius and every 0.8 s releases a soft green pulse ring on the lowest-HP ally (heal number green, no hit-stop). `gong` on the cast, `choir_swell` low under it; the HUD burst banner counts Yu'lon
  as a defensive major only (not "PATLAMA").

---

## 1.3 `monk_windwalker` — Rüzgâr Yürüyen (DPS, WoW Windwalker)

**Passive**: `attackSpeed .08, critChance .05`; trait `trait_windwalker`: LMB finisher (step 4) 40 % PRD +1 Çi (≈ 19 per minute on the parallel chain). Çi pips (max 5, −1 per 4 s after 8 s out of combat).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `monk_basic` (+`_1.._4`) | Keşiş Kombosu | auto attack | inst chain | melee_arc | 2.5–3 | – | step 4: 40 % PRD +1 Çi | off | 0.08/0.08/0.11/0.16 phys | – | – | `fist_trail` `kick_arc` `palm_shock` | per step: `Unarmed_Melee_Attack_Punch_A`, `…_Punch_B`, `…_Kick`, `Dualwield_Melee_Attack_Stab` | `punch_hit` `kick_hit` |
| rmb | `monk_tiger_palm` | Kaplan Avucu | Tiger Palm | inst | target_instant | 4 (+3) | – | −50 Enerji, **+2 Çi** | on | 0.85 phys | `mystic_touch` | 12 % `combo_breaker`, 6 % `dance_of_chiji` | `palm_shock` `chi_burst` | `Unarmed_Melee_Attack_Punch_B` ×1.7 | `punch_hit` |
| q | `monk_blackout_kick` | Kara Tekme | Blackout Kick | inst | target_instant (cone 120°, ≤ 3) | 4 (+3) | 3 s | −1 Çi (0 with `combo_breaker`) | on | 0.95 phys | `cdrOnCast`: −1 s Doğan Güneş + −1 s Cennet Yumrukları | glow on `combo_breaker` | `kick_arc` `chi_burst` | `Unarmed_Melee_Attack_Kick` ×1.3 | `kick_hit` |
| e | `monk_rising_sun_kick` | Doğan Güneş Tekmesi | Rising Sun Kick | inst | target_instant (cone 140°) | 4 (+3) | 10 s | −2 Çi | on | 2.50 phys | `sunder` 12 % 6 s | – | `kick_arc`(1.2) + `holy_burst` gold | `Unarmed_Melee_Attack_Kick` ×1.15, lunge 1.4 | `kick_hit` |
| r | `monk_fists_of_fury` | Cennet Yumrukları | Fists of Fury | ch 3.2 s | custom:`channel_cone` (§g.2) | 5, cone 100° | 24 s | −3 Çi | on | 5.35 phys total (8 ticks × 0.55 + closing blow 0.95, knockback 4) | `dr` 15 % and unstoppable while channelling | – | `chi_burst`, `fist_trail` alternating, jade after-images | `animCycle` `Unarmed_Melee_Attack_Punch_A` / `…_Punch_B` ×2.2 | `punch_hit` `swing_heavy` |
| s1 | `monk_spinning_crane` | Dönen Turna Tekmesi | Spinning Crane Kick | ch 1.2 s | custom:`channel_aoe` (existing) | r 4 | – | −2 Çi (0 on `dance_of_chiji`) | on | 2.10 phys per target (3 ticks) | – | glow on `dance_of_chiji` | `spin_slash` jade | `2H_Melee_Attack_Spinning` | `whoosh` |
| s2 | `monk_chi_torpedo` | Çi Torpidosu | Roll / Flying Serpent Kick | inst | dash | 12 | 10 s x2 | – | off | path 0.8 (not budgeted) | `chi_flow` | – | `dragon_trail` | `Running_A` ×2 | `whoosh` |
| s3 | `monk_touch_of_karma` | Karma Dokunuşu | Touch of Karma | inst | self_buff (`karma` behaviour, existing) | – | 90 s | – | off | – | `karma_ward` 6 s | – | `buff_aura` | `Cheer` ×1.4 | `buff` |
| s4 | `monk_spear_hand` | Mızrak Eli | Spear Hand Strike | inst | melee_arc (`interrupt`) | 4 | 15 s | – | off | – | silence 3 s | – | `palm_shock` | `Dualwield_Melee_Attack_Stab` ×1.5 | `interrupt` |
| m45 | `monk_whirling_dragon` | Dönen Ejder Yumruğu | Whirling Dragon Punch | inst | self_aoe | r 5.2 | 45 s (bucket, WoW 35) | – | off | 4.60 phys per target, knockback 3 | `heart_of_jade` 8 s (next Cennet Yumrukları +25 %) | – | `spin_slash`(1.4) + `shockwave` | `2H_Melee_Attack_Spin` ×2.4 | `ground_slam` |
| m90 | `monk_invoke_xuen` | Xuen | Invoke Xuen + Zenith | inst | summon (minion `monk_xuen`, 20 s) | 40 | 90 s (bucket, WoW 120) | – | off | tiger ≈ 7 + Zenith window ≈ 3 (= 10.05 total) | self `zenith` 15 s | `zenith` | `pet_summon` + `enrage_aura` (jade-gold) | `Cheer` ×1.8 | `gong` `wolf_howl` pitch 0.8 |
| m180 | `monk_touch_of_death` | Ölüm Dokunuşu | Touch of Death | inst | target_instant | 4 (+3) | 180 s | – | off | 11.5 phys (×2.0 below 15 % HP) | – | – | `shadow_burst` palm mark + `crit_burst` | `Dualwield_Melee_Attack_Stab` ×1.2 | `crit_finisher` |

Xuen minion: `warg.glb` ×1.3, white tint `0xf2f0e0`, orange emissive stripes (`0xff8a30`), 20 s, cleaves 3 (needs the minion framework, §h dependency D-MINION).

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `combo_breaker` | Kombo Kırıcı | Kaplan Avucu / Kara Tekme hit, PRD 12 %, icd 1.5 s | next Kara Tekme costs 0 Çi | 15 s | `monk_blackout_kick` | right, jade `#5de0a8` |
| `dance_of_chiji` | Chi-Ji Dansı | Kaplan Avucu / Kara Tekme, PRD 6 %, icd 4 s | next Dönen Turna free, +40 % | 15 s | `monk_spinning_crane` | top, red-gold |
| `heart_of_jade` | Yeşim Yürek | Dönen Ejder Yumruğu | next Cennet Yumrukları +25 % | 8 s | `monk_fists_of_fury` | left, jade |
| `zenith` | Zirve | Invoke Xuen | +15 % damage; Kaplan Avucu −50 % Enerji and +1 Çi; Doğan Güneş CD −50 % | 15 s | – | burst banner (PATLAMA) with Zirve + Xuen |
| `chi_flow` | Akış | Çi Torpidosu / roll | +20 % attack speed | 2.5 s | – | – |

### c) APL

```
# ST
monk_touch_of_death        if cdready                                        # m180
monk_whirling_dragon       if cdready:monk_whirling_dragon && cd:monk_invoke_xuen>=10   # m45
monk_invoke_xuen           if cdready                                        # m90
monk_fists_of_fury         if chi>=3 && (status:heart_of_jade || cdready:monk_fists_of_fury)
monk_rising_sun_kick       if chi>=2 && cdready:monk_rising_sun_kick
monk_blackout_kick         if status:combo_breaker
monk_spinning_crane        if status:dance_of_chiji
monk_tiger_palm            if energy>=50 && chi<=3
monk_blackout_kick         if chi>=1 && cdready:monk_blackout_kick
monk_spear_hand            if tcast
# AoE (targets>=3): Spinning Crane takes the Chi dump slot above Rising Sun Kick / Blackout Kick:
monk_spinning_crane        if chi>=2 && targets>=3                           # inserted after Fists of Fury
```

### d) Budget hand calculation (Rüzgâr Yürüyen)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Kaplan Avucu `monk_tiger_palm` | 12 | energy-limited: 600 regen / 50 | 0.85 | 10.2 |
| Kara Tekme `monk_blackout_kick` | 15 | 3 s CD, 1 Chi; 12 % free (Combo Breaker) | 0.95 | 14.25 |
| Doğan Güneş Tekmesi `monk_rising_sun_kick` | 7.5 | 10 s CD, each Kara Tekme −1 s ⇒ ≈ 8 s | 2.5 | 18.75 |
| Cennet Yumrukları `monk_fists_of_fury` | 3.1 | 24 s CD, −1 s per Kara Tekme ⇒ ≈ 19 s | 5.35 | 16.59 |
| Dönen Turna Tekmesi `monk_spinning_crane` | 1.4 | only free Chi-Ji Dansı procs (6 % per TP/BK) | 2.1 | 2.94 |
| Dönen Ejder Yumruğu `monk_whirling_dragon` | 1.33 | m45: 60 / 45 | 4.6 | 6.12 |
| Ölüm Dokunuşu `monk_touch_of_death` | 0.33 | m180: 60 / 180 | 11.5 | 3.8 |
| Xuen `monk_invoke_xuen` | 0.67 | m90: 60 / 90 (tiger 20 s) | 10.05 | 6.73 |
| LMB chain (parallel, all 60 s) | 47.4 chains | 0.43 per chain = 0.34 / s | – | 20.4 |
| **Σ raw** | | | | **99.8** (target 100) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Kaplan Avucu `monk_tiger_palm` — 300 regen / 50 | 6 | 1 | 0.85 | 5.1 |
| Kara Tekme `monk_blackout_kick` — Chi goes to Turna first | 2 | 1 | 0.95 | 1.9 |
| Doğan Güneş Tekmesi `monk_rising_sun_kick` — 2 Chi budget | 2 | 1 | 2.5 | 5 |
| Cennet Yumrukları `monk_fists_of_fury` — CD 24 s, ≈ 1.5 / 30 s | 1.55 | 5 | 5.35 | 41.46 |
| Dönen Turna Tekmesi `monk_spinning_crane` — 2 Chi each | 5 | 8 | 2.1 | 84 |
| Dönen Ejder Yumruğu `monk_whirling_dragon` — 40 / 45 (pull cycle 40 s) | 0.9 | 8 | 4.6 | 33.12 |
| Ölüm Dokunuşu `monk_touch_of_death` — 40 / 180 | 0.22 | 1 | 11.5 | 2.53 |
| Xuen `monk_invoke_xuen` — 40 / 90, tiger cleaves 3 | 0.44 | 3 | 5 | 6.6 |
| LMB chain (parallel, 30 s, cleaves 3) | 23.7 chains | 3 | 0.43 per chain (10.2 per target) | 30.6 |
| **Σ raw** | | | | **210.3** (target 225) |

Time budget: ST GCD busy 47.9 s + 12.1 s Energy-starved idle (Energy is the limiter, the chain keeps swinging); AoE GCD busy 22.2 s + 7.8 s idle. Resource check per window — energy ST in 600 / out 600, AoE in 300 / out 300; chi ST in 43 (12 Tiger Palms × 2 + chain 19) / out 39, AoE in 21.5 (6 × 2 + chain 9.5) / out 20.7.

**Party buff**: Mistik Dokunuş (+5 % physical damage taken, 30 s, on every Kaplan Avucu / LMB hit).

### e) What it feels like

* **Chi rhythm**: Kaplan Avucu → Kara Tekme → Doğan Güneş Tekmesi → Cennet Yumrukları as the big payoff, with Kara Tekme visibly shaving the cooldowns of the two bigger buttons (each kick shows a tiny "−1" tick on their icons).
* **Windows stack**: Whirling Dragon Punch's Yeşim Yürek into Cennet Yumrukları, then Xuen + Zirve for 15 s (Tiger Palm half price, Doğan Güneş twice as often).
* **Ölüm Dokunuşu** is a once-per-3-minutes "delete" — the execute doubles below 15 % HP.
* **Signature move — Cennet Yumrukları**: the channel is held (`fixed`), the monk plants and alternates `Unarmed_Melee_Attack_Punch_A` / `_B` at ×2.2; every tick spawns one `fist_trail` streak from the alternating hand and a
  jade after-image (`createGhost`, 3 ghosts, 0.25 s fade) on the shoulder side; the cone shows a faint jade floor sector; ticks use the `tick` hit class (no hit-stop) but a stacked "drum roll" sound (`punch_hit` pitch +2 % per tick, cap +20 %)
  and one merged damage number per target per 0.45 s; the 8th tick is the **closing blow**: wide `slash_arc_big`, `palm_shock` ring r 5, 4 m knockback, 100 ms hit-stop, trauma 0.3, `swing_heavy` + `crit_finisher` layers, voice `voice_warrior_angry`.
  Movement is slowed 90 % during the channel; the camera pulls −2° FOV for the channel and snaps back on the closing blow.

---

# 2. Okçu (`archer`) — Nişancı · Av Ustası

**Class frame** (GDD_CLASSES_V2 §3 kept): Rogue.glb (unhooded, cape shown), bow + quiver, main stat Çeviklik, medium armour, **Odak** bar (100, regen 8/s, **×1.6 while standing still ≥ 0.5 s** — "Sabit Nişan"),
trait `trait_hawkeye` (+15 % crit damage, +10 % damage to targets ≥ 12 m away, ranged basics may be fired while running at `slow 0.25`). Class passives: **Kartal Gözü** (`eagle_eye`, party +3 % crit, aura refreshed every 10 s) and
the m180 **Kurt Narası** (`archer_primal_rage`, `behavior major_hero`, `dur 40`, `sated 600`, `range 40`; "İlkel Öfke": the bow-string howl of the pet — `wolf_howl` + `hero_wave` VFX, anim `Cheer`).
**Interrupt `archer_muzzle`** (existing row "Susturucu Ok", retuned CD 20 → 24 s; silence 3 s) and **defensive `archer_exhilaration`** (NEW) are in every bar.

**Shared LMB chain `archer_basic`** (Ok Serisi, 4 steps, tempo `FEEL_WEAPON.bow` 1.0, cadence 1.12 s (53.6 chains, 268 arrow hits per 60 s) ⇒ **0.34 coef/s ≈ 20.4 per 60 s** (parallel rule, §0.5), +1 Odak per arrow hit):

| step id | TR | anim · speed @hit | shape | coef | weight / stagger | VFX · SFX |
|---|---|---|---|---:|---|---|
| `archer_basic_1` | Hızlı Ok | `2H_Ranged_Shoot` ×2.0 @0.32 | proj v55 R28, 1 arrow | 0.06 phys | 0 / 3, `upper 1` | `arrow_projectile` `arrow_trail` · `bow_shot` `arrow_hit` |
| `archer_basic_2` | Çift Ok | `2H_Ranged_Shoot` ×2.0 @0.32 | 2 arrows, spread 6° | 0.04 × 2 phys | 0 / 3 | same |
| `archer_basic_3` | Delici Ok | `2H_Ranged_Shoot` ×1.5 @0.32 | pierce 2 | 0.10 phys | 4 / 5 | `arrow_projectile`(1.2) |
| `archer_basic_4` | Tam Çekiş | `2H_Ranged_Shoot` ×0.75 @0.32 | pierce the whole line | 0.14 phys, finisher | 1 / 9 | fat arrow + `shockwave`(0.35) · `bow_shot` + `swing_heavy` |

(Marksmanship's WoW "Auto Shot +756 %" is why the chain stays a visible 20 % of the budget. Per-hit Odak is +1 on the parallel chain, +2 was the idle-only value.)

---

## 2.1 `archer_marksman` — Nişancı (DPS, WoW Marksmanship)

**Passive**: `critChance .08, projectileDamagePct .10`; trait `trait_marksman`: Aimed Shot is a 2.0 s hard cast (WoW 2.5 s × 0.8, no charge-shot), **Kesin Atışlar** system below. Tag `ranged`, resource Odak.

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `archer_basic` (+`_1.._4`) | Ok Serisi | Auto Shot | inst chain | projectile | 28 | – | +1 Odak / hit | off | 0.06 / 0.04×2 / 0.10 / 0.14 phys | – | – | `arrow_projectile` `arrow_trail` | `2H_Ranged_Shoot` | `bow_shot` `arrow_hit` |
| rmb | `archer_steady_shot` | Sabit Atış | Steady Shot | cast 1.4 s | target_projectile (homing 5 rad/s) | 40 | – | **+8 Odak** | on | 0.60 phys (1.4 s cast ⇒ 0.43 coef/s, above the chain's 0.34); **`replaces` → `archer_arcane_shot` while `precise_shots`** | – | – | `arrow_projectile` | `2H_Ranged_Shoot` ×1.3 | `bow_shot` |
| rmb′ | `archer_arcane_shot` | Gizem Atışı | Arcane Shot (Precise Shots) | inst | target_projectile | 40 | – | −20 Odak | on | 1.65 arcane (always empowered ×2.0 of 0.83) | consumes 1 `precise_shots` | – | `arcane_projectile` | `Spellcast_Shoot` ×1.6 | `spell_cast` |
| q | `archer_aimed_shot` | Nişanlı Atış | Aimed Shot | **cast 2.0 s** (draw hold) | target_projectile | 40 | 12 s (x2 under Tam İsabet) | −35 Odak | on | 3.75 phys; Trick Shots: cleaves 5 at 70 % | +2 `precise_shots` (15 s, max 2) | creates `precise_shots` | `arrow_projectile`(1.2 by charge) + string glow | hold `2H_Ranged_Aiming` → `2H_Ranged_Shoot` ×1.2 | `bow_draw` → `bow_shot` |
| e | `archer_rapid_fire` | Seri Ateş | Rapid Fire | ch 1.6 s | target_projectile stream | 40 | 16 s | – | on | 4.55 phys total (12 arrows) | applies `trick_shots` 8 s | – | `arrow_trail` stream | hold `2H_Ranged_Shooting` | `bow_shot` rate-limited 6/s |
| r | `archer_explosive_shot` | Patlayıcı Atış | Explosive Shot | inst | target_projectile | 40 | 30 s | −20 Odak | on | 3.35 fire (3 ticks of 1.1, AoE r 3; −10 % per target past 5) | `burn` 3 s | – | `fire_projectile` + `fire_burst` | `2H_Ranged_Shoot` ×1.0 | `fire_cast` `fire_impact` |
| s1 | `archer_kill_shot` | Son Atış | Kill Shot | inst | target_projectile | 40 | 10 s | −10 Odak | on | 6.0 phys (+100 % with `precise_shots`); **requires `exec_window`** (target HP < 20 %; execute phase only, not in the ST budget) | refund cost + reset CD on kill | consumes `precise_shots` | `arrow_projectile`(1.4) + `crit_burst` | `2H_Ranged_Shoot` ×0.9 | `bow_shot` `hit_crit` |
| s2 | `archer_disengage` | Geri Sıçrayış | Disengage | inst | dash (backwards) | 7 | 20 s | – | off | free arrow 1.4 phys at the landing (`landShot`) | `iframes` 0.25 s; slow 40 % + knockback 2 r 3 at the take-off spot | – | `dodge_dust` + `trap_snap` | `Dodge_Backward` | `whoosh` |
| s3 | `archer_exhilaration` | Canlanma | Exhilaration | inst | self_buff | – | 120 s | – | off | heal 30 % max HP (pet too) | – | – | `heal_burst` | `Cheer` ×2.0 | `heal` |
| s4 | `archer_muzzle` | Susturucu Ok | Counter Shot | inst | custom (existing `interrupt`) | 40 | 24 s | – (row 15 → 0) | off | – | cancel + silence 3 s | – | `arrow_trail` | `2H_Ranged_Shoot` ×1.4 | `interrupt` |
| m45 | `archer_volley` | Ok Yağmuru | Volley | inst | ground_aoe (6 s, tick 0.5) | 40, r 8 | 45 s (WoW 45, no bucket change) | – | off | 6.65 phys per target over the rain | `trick_shots` 6 s | – | `arrow_rain` | `2H_Ranged_Shoot` ×0.8 aimed up | `bow_shot` rhythm |
| m90 | `archer_ms_trueshot` | Tam İsabet | Trueshot | inst | self_buff | – | 90 s (bucket, WoW 120) | – | off | window bonus 3.35 | `trueshot` 15 s: +30 % crit, +10 % damage, Aimed Shot 2nd charge + CD −50 % | `trueshot` | `enrage_aura` gold `0xe8c15a` | `Cheer` ×1.6 | `war_cry` |
| m180 | `archer_primal_rage` | İlkel Öfke | Primal Rage | inst | self_buff (`major_hero`) | 40 | 180 s | – | off | – | `hero_haste` 40 s party; `sated` | – | `hero_wave` + `wings_aura` | `Cheer` | `hero_horn` `wolf_howl` |

Replaced / dropped old ids are in §f. Marksman has no mobility beyond Geri Sıçrayış and no AoE button (its AoE is Ok Yağmuru + Trick Shots).
**Spec mods**: none — every Okçu skill id has the same numbers in both specs (§0.5 table); the per-hit Odak of the chain is a hook of `combat/specs/archer.ts`.

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `precise_shots` | Kesin Atışlar | Nişanlı Atış hit (+2, max 2) | **s rmb transforms** to Gizem Atışı (×2.0); Son Atış +100 % | 15 s | `archer_arcane_shot`, `archer_kill_shot` | left, gold-white `#fff0a0` |
| `trick_shots` | Hile Atışları | Seri Ateş / Ok Yağmuru | Nişanlı Atış cleaves 5 (70 %), Seri Ateş hits 8 | 8 s / 6 s | `archer_aimed_shot` | right, amber |
| `trueshot` | Tam İsabet | m90 | see kit; `bullseye` stacks +1 % damage per crit (max 30) | 15 s | `archer_aimed_shot` | top, gold |
| `eagle_eye` | Kartal Gözü | passive aura | party +3 % crit | refresh 10 s | – | HUD |
| `exec_window` (hidden watcher status, **shared** with docs/kits/casters-rogue.md E4) | İnfaz Penceresi | target HP < 20 % (refreshed every 0.25 s by the watcher) | Son Atış `requires.selfStatus 'exec_window'` | while true | `archer_kill_shot` | – |

### c) APL

```
# ST
archer_primal_rage         if party_wants_haste                              # m180 on pull / burst
archer_ms_trueshot         if cdready                                         # m90
archer_volley              if cdready                                         # m45
archer_explosive_shot      if cdready && focus>=20
archer_kill_shot           if status:exec_window && focus>=10
archer_arcane_shot         if status:precise_shots>=1 && focus>=20            # rmb transformed
archer_aimed_shot          if focus>=35 && (cdready || status:trueshot)
archer_rapid_fire          if cdready
archer_muzzle              if tcast                                           # off-GCD
archer_exhilaration        if php<0.35                                        # off-GCD
archer_steady_shot                                                            # last GCD line = the filler (1.4 s cast, +8 Odak); Focus is not its limiter
# AoE (targets>=3): Volley + Rapid Fire first (Trick Shots), Aimed Shot while status:trick_shots, Explosive Shot on the largest pack
archer_rapid_fire          if targets>=3 && !status:trick_shots
archer_aimed_shot          if status:trick_shots
```

### d) Budget hand calculation (Nişancı)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Sabit Atış `archer_steady_shot` | 23.2 | filler, 1.4 s cast, takes every GCD the others leave (32.5 s) | 0.60 | 13.92 |
| Nişanlı Atış `archer_aimed_shot` | 5 | 12 s CD, 2.0 s cast, 35 Focus | 3.75 | 18.75 |
| Gizem Atışı `archer_arcane_shot` | 7.5 | Precise Shots: 1.5 per Aimed Shot | 1.65 | 12.38 |
| Seri Ateş `archer_rapid_fire` | 3.75 | 16 s CD, 1.6 s channel | 4.55 | 17.06 |
| Patlayıcı Atış `archer_explosive_shot` | 2 | 30 s CD, 20 Focus | 3.35 | 6.7 |
| Ok Yağmuru `archer_volley` | 1.33 | m45: 60 / 45 | 6.65 | 8.84 |
| Tam İsabet `archer_ms_trueshot` | 0.67 | m90: 60 / 90 (window bonus counted in coef) | 3.35 | 2.24 |
| LMB chain (parallel, all 60 s) | 53.6 chains | 0.38 per chain = 0.34 / s | – | 20.36 |
| **Σ raw** | | | | **100.3** (target 100) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Sabit Atış `archer_steady_shot` — filler | 11.3 | 1 | 0.60 | 6.78 |
| Nişanlı Atış `archer_aimed_shot` — 2 s cast, Trick Shots cleave 5 | 2.5 | 5 | 2.6 | 32.5 |
| Gizem Atışı `archer_arcane_shot` — 4 / 30 s | 4 | 1 | 1.65 | 6.6 |
| Seri Ateş `archer_rapid_fire` — 16 s CD; Trick Shots ⇒ 8 targets | 2 | 8 | 3.65 | 58.4 |
| Patlayıcı Atış `archer_explosive_shot` — 30 s CD, −10 % per target past 5 ⇒ 3.1 average | 1 | 8 | 3.1 | 24.8 |
| Ok Yağmuru `archer_volley` — 40 / 45 | 0.9 | 8 | 6.65 | 47.88 |
| Tam İsabet `archer_ms_trueshot` — 40 / 90 | 0.44 | 1 | 3.35 | 1.47 |
| LMB chain (parallel, 30 s; pierce 2 + line finisher ⇒ 2.6 targets, coef-weighted) | 26.8 chains | 2.6 | 0.38 per chain (10.18 per target) | 26.5 |
| **Σ raw** | | | | **204.9** (target 225) |

Time budget: ST GCD busy 27.5 s of listed buttons (Aimed 10.0, Rapid Fire 6.0, Gizem 7.5, Patlayıcı 2.0, off-GCD 2.0) + 32.5 s Sabit Atış = 60 s; AoE 14.2 s listed (Aimed 5.0, Rapid Fire 3.2, Gizem 4.0, Patlayıcı 1.0, off-GCD 1.0) + 15.8 s Sabit Atış = 30 s.
Focus check per window — ST in ≈ 1167 (regen 713 = 480 × (1 + 0.6 × 48.5 / 60) with the ×1.6 standing bonus on the 48.5 s spent casting; chain 268; Sabit Atış 23.2 × 8 = 186) / out 365 (5 × 35 + 7.5 × 20 + 2 × 20); AoE in ≈ 579 (355 + 134 + 90) / out 188.
**Focus is deliberately not the limiter of Nişancı** (it sits at the cap like WoW MM; the Odak bar only matters after a burst of Gizem / Patlayıcı casts empties it): cast time, cooldowns and the Kesin Atışlar charges are, so the filler line carries no Focus condition. **Party buff**: Kartal Gözü (+3 % crit) and
Kurt Narası on the 3-minute button.

### e) What it feels like

* **Cast, then payoff**: a 2.0 s draw (the bar can be pushed back; standing still gives the ×1.6 Focus bonus) releases a big arrow, the screen edge flashes **Kesin Atışlar** and the filler button *becomes* a bright arcane arrow.
* **Seri Ateş + Ok Yağmuru** turn the whole pack into Trick Shots: the next Aimed Shot visibly cleaves.
* **Tam İsabet** is the "everything crits" window: the second Aimed Shot charge lights up and the reticle ring turns gold.
* **Signature move — Nişanlı Atış**: pressing `q` shoulder-cams in (−3° FOV on top of the −1.5° draw of GDD_LIFE §5.3), `2H_Ranged_Aiming` held for 2.0 s ÷ haste; the bow string and
  arrowhead glow grow from white to amber over the hold (`arrow_projectile` scale 0.8 → 1.2), a thin amber ring tightens around the target (the reticle, `mark_loop` tinted), `bow_draw` creaks and rises in pitch;
  on release the camera snaps back +3°, `2H_Ranged_Shoot` ×1.2 fires a fat arrow (`arrow_trail` ×1.6, v75, homing 4 rad/s) that leaves a faint air-ripple ring every 8 m; impact = `crit_burst` if crit, `hit_spark`, 60 ms victim hit-stop
  (weight "projectile → heavy at full draw"), trauma 0.14, `bow_shot` + `arrow_hit` layers. No attacker freeze (COMBAT_WOW §2.17).

---

## 2.2 `archer_beastmaster` — Av Ustası (DPS, WoW Beast Mastery)

**Passive**: `minionDamagePct .40, minionHpPct .30`; trait `trait_beastmaster`: the pet (`archer_wolf`, wolf.glb; Ayı `archer_bear` at L20 via the skill panel) is **automatic** — it is summoned on spawn, returns 10 s after dying, and
Canlanma heals it 30 % as well (so the old Yoldaş Çağır button is not needed). Pet auto attacks (≈ 0.37 coef/s for the 22.35 per minute below) are the "pet" row of the budget and are cleaved by **Parçalayıcı Pençe** (Beast Cleave).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `archer_basic` (+`_1.._4`) | Ok Serisi | Auto Shot | inst chain | projectile | 28 | – | +1 Odak / hit | off | 0.06 / 0.04×2 / 0.10 / 0.14 phys | – | – | `arrow_trail` | `2H_Ranged_Shoot` | `bow_shot` |
| rmb | `archer_cobra_shot` | Kobra Atışı | Cobra Shot | inst | target_projectile | 40 | – | −18 Odak | on | 0.55 poison | – | – | `poison_projectile` | `2H_Ranged_Shoot` ×1.6 | `bow_shot` `poison_impact` |
| q | `archer_kill_command` | Av Emri | Kill Command | inst | custom:`pet_strike` (pet leaps, bites) | 50 | 7.5 s x2 | −25 Odak | on | 1.70 phys (pet), cleaved by Parçalayıcı Pençe | pet `frenzy` +1 | – | `hit_blood` + pet leap | `Spellcast_Shoot` ×2.0 | `wolf_bite` |
| e | `archer_barbed_shot` | Dikenli Ok | Barbed Shot | inst | target_projectile | 40 | 12 s x2 | **+20 Odak over 8 s** | on | 2.05 bleed (12 s) | `bleed` 12 s; pet `frenzy` ×3 (+10 % attack speed each, 8 s) | – | `arrow_projectile` red trail | `2H_Ranged_Shoot` ×1.6 | `bow_shot` |
| r | `archer_wild_thrash` | Vahşi Hırpalama | Wild Thrash | inst | custom:`pet_strike` AoE | 8 around target | 12 s | – | on | 1.05 phys per target | applies `beast_cleave` | `beast_cleave` | `ground_slam`(0.6) + `hit_blood` | `Spellcast_Raise` | `wolf_bite` `ground_slam` |
| s1 | `archer_multishot` | Çoklu Atış | Multi-Shot | inst | projectile fan (5 arrows, spread 9°) | 22 | – | −30 Odak | on | 0.95 phys per target (≤ 8) | applies `beast_cleave` 10 s | `beast_cleave` | `arrow_projectile` fan | `2H_Ranged_Shoot` ×1.3 | `bow_shot` |
| s2 | `archer_disengage` | Geri Sıçrayış | Disengage | inst | dash (back) | 7 | 20 s | – | off | free arrow 1.4 | `iframes` 0.25 s | – | `dodge_dust` | `Dodge_Backward` | `whoosh` |
| s3 | `archer_exhilaration` | Canlanma | Exhilaration / Survival of the Fittest | inst | self_buff | – | 120 s | – | off | heal 30 % (self + pet) | – | – | `heal_burst` | `Cheer` | `heal` |
| s4 | `archer_muzzle` | Susturucu Ok | Counter Shot | inst | custom (`interrupt`) | 40 | 24 s | – | off | – | silence 3 s | – | `arrow_trail` | `2H_Ranged_Shoot` | `interrupt` |
| m45 | `archer_bm_bestial_wrath` | Vahşi Gazap | Bestial Wrath | inst | self_buff (+pet) | – | 45 s (bucket; WoW 30 s Method / 90 s Wowhead) | – | off | window bonus 2.15 | `wild_wrath` 15 s: you +20 %, pet +25 % damage and attack speed, pet unstoppable | – | `enrage_aura` red on both | `Cheer` ×1.8 | `wolf_howl` |
| m90 | `archer_bm_pack_hunt` | Av Sürüsü | Call of the Wild (talent; not in the research file) | inst | summon (2 × `archer_wolf_ally`, 20 s) | 40 | 90 s (bucket) | – | off | wolves 6.0 total, cleave 5 | – | – | `pet_summon` ×2 | `Use_Item` ×1.6 | `wolf_howl` |
| m180 | `archer_primal_rage` | İlkel Öfke | Primal Rage | inst | self_buff (`major_hero`) | 40 | 180 s | – | off | – | `hero_haste` 40 s; `sated` | – | `hero_wave` | `Cheer` | `hero_horn` |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `frenzy` | Çılgınlık | Dikenli Ok (+1, max 3) | pet attack speed +10 % per stack | 8 s | – | pet frame |
| `beast_cleave` | Parçalayıcı Pençe | Çoklu Atış / Vahşi Hırpalama | pet melee and Av Emri hit all enemies within 8 m of the pet's target at 55 % | 10 s | `archer_multishot` when down in AoE | right, red-brown `#c0603a` |
| `wild_wrath` | Vahşi Öfke | Vahşi Gazap | +20 % damage (you), +25 % (pet) | 15 s | – | burst banner |
| `barbed` (debuff) | Dikenli | Dikenli Ok | bleed | 12 s | – | target-frame own debuff, refresh pulse < 30 % |
| `howl_of_pack` | Sürü Uluması | passive timer 30 s | next Av Emri also summons a 6 s spectral beast (its damage is inside the 1.70 average of Av Emri); glow | until used | `archer_kill_command` | center, green `#a0c070` |

### c) APL

```
# ST
archer_primal_rage         if party_wants_haste
archer_bm_bestial_wrath    if cdready                                           # m45
archer_bm_pack_hunt        if fight>=20                                         # m90
archer_barbed_shot         if charges>=2 || tstatus:barbed<=2 || cd:archer_bm_bestial_wrath<=3
archer_kill_command        if focus>=25 && (status:howl_of_pack || charges>=1)
archer_wild_thrash         if cdready
archer_cobra_shot          if focus>=18
archer_muzzle              if tcast
archer_exhilaration        if php<0.35
# AoE (targets>=3)
archer_multishot           if !status:beast_cleave || focus>=48
archer_wild_thrash         if cdready
archer_barbed_shot         if charges>=2
archer_kill_command        if focus>=25
```

### d) Budget hand calculation (Av Ustası)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Yoldaş (otomatik saldırılar) `archer_pet` | 1 | continuous pet auto attacks, 60 s | 22.35 | 22.35 |
| Kobra Atışı `archer_cobra_shot` | 36 | filler, 18 Focus, takes every GCD the Focus allows | 0.55 | 19.8 |
| Av Emri `archer_kill_command` | 8 | 2 charges / 7.5 s, 25 Focus | 1.7 | 13.6 |
| Dikenli Ok `archer_barbed_shot` | 5 | 2 charges / 12 s ⇒ 5 (+20 Focus over 8 s) | 2.05 | 10.25 |
| Vahşi Hırpalama `archer_wild_thrash` | 5 | 12 s CD | 1.05 | 5.25 |
| Çoklu Atış `archer_multishot` | 0 | not used in ST | 0.95 | 0 |
| Vahşi Gazap `archer_bm_bestial_wrath` | 1.33 | m45: 60 / 45 (window bonus in coef) | 2.15 | 2.86 |
| Av Sürüsü `archer_bm_pack_hunt` | 0.67 | m90: 60 / 90 (two wolves 20 s) | 6 | 4.02 |
| LMB chain (parallel, all 60 s) | 53.6 chains | 0.38 per chain = 0.34 / s | – | 20.36 |
| **Σ raw** | | | | **98.5** (target 100) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Yoldaş (otomatik saldırılar) `archer_pet` — Beast Cleave kept up by Çoklu Atış: pet melee hits 1 + 0.55 × 7 = 4.85 targets, 30 s of pet damage = 0.55 × the 60 s row | 1 | 4.85 | 12.3 | 59.66 |
| Kobra Atışı `archer_cobra_shot` — filler, Focus-limited | 8 | 1 | 0.55 | 4.4 |
| Av Emri `archer_kill_command` — pet strike, cleaved to 4.85 targets | 4 | 4.85 | 1.7 | 32.98 |
| Dikenli Ok `archer_barbed_shot` — 2 charges / 12 s ⇒ 2.5 per pull | 2.5 | 1 | 2.05 | 5.12 |
| Vahşi Hırpalama `archer_wild_thrash` — 12 s CD ⇒ 2.5 per pull | 2.5 | 8 | 1.05 | 21 |
| Çoklu Atış `archer_multishot` — Beast Cleave refresh + Focus dump, 30 Focus | 6 | 8 | 0.95 | 45.6 |
| Vahşi Gazap `archer_bm_bestial_wrath` — 40 / 45 | 1 | 1 | 2.15 | 2.15 |
| Av Sürüsü `archer_bm_pack_hunt` — 40 / 90, wolves cleave 5 | 0.44 | 5 | 3.6 | 7.92 |
| LMB chain (parallel, 30 s; pierce 2 + line finisher ⇒ 2.6 targets, coef-weighted) | 26.8 chains | 2.6 | 0.38 per chain (10.18 per target) | 26.5 |
| **Σ raw** | | | | **205.3** (target 225) |

Time budget: ST GCD busy 54.0 s (36 Kobra + 8 Av Emri + 5 Dikenli + 5 Hırpalama) + 2.5 s off-GCD, 3.5 s Focus-starved idle; AoE 23.0 s + 1.2 s off-GCD, 5.8 s Focus-starved idle. Resource check per window — **Focus ST in 848 (regen 480 — instants, no standing bonus — + Dikenli Ok 100 + chain 268) / out 848 (36 × 18 + 8 × 25)**, AoE in 424 (240 + 50 + 134) / out 424 (8 × 18 + 4 × 25 + 6 × 30).

Focus is the limiter of this spec: Kobra Atışı (18), Av Emri (25) and Çoklu Atış (30) spend exactly what regen, Dikenli Ok's +20 over 8 s and the chain (+1 Odak per arrow hit) provide — the spec is cap-neutral (in ≈ out). **Party buff**: Kartal Gözü, Kurt Narası.

### e) What it feels like

* **Pack feel**: Dikenli Ok (bleed + three frenzy ticks on the wolf), Av Emri (the wolf leaps from wherever it stands), Kobra Atışı filling the gaps; **Çoklu Atış** on a pack flashes the right-hand red-brown overlay and every wolf bite now cleaves.
* **Vahşi Gazap** is the loud window: red aura on archer and wolf, the wolf becomes unstoppable and its bites show merged numbers on every neighbour.
* **Signature move — Av Emri**: the archer plays `Spellcast_Shoot` ×2.0 (a pointing gesture), a white-red ring on the target marks the strike, the wolf accelerates (foot-locked `Run`, timeScale = speed / 7.3), leaps the last 6 m with
  `Lunge`, lands with a `hit_blood` spray and a 70 ms victim hit-stop (pet weight 2), `wolf_bite` thump + `hit_flesh`; with Parçalayıcı Pençe active the bite repeats as a 55 % flash on every enemy within 8 m of the first,
  merged into one number per target; the archer never freezes.

---

# 3. İblis Avcısı (`demonhunter`) — NEW CLASS — Kaos · İntikam

## 3.0 Class frame, visual identity and ClassDef sketch

| field | value |
|---|---|
| `id` / TR | `demonhunter` / **İblis Avcısı** (tagline "Gözleri Bağlı, Ruhu Uyanık"), role text "Yakın Dövüş · Kaos / Tank" |
| model | `/assets/models/characters/Rogue_Hooded.glb` (`visual.paletteClass 'rogue'`, `defaultVariant` = "Yosun" grey-green skin, `defaultTint 0x9aa88a`). Nodes: **hide** `Knife Knife_Offhand 1H_Crossbow 2H_Crossbow Throwable`, keep `Rogue_Head_Hooded` and `Rogue_Cape` (the cape is the folded "wings" silhouette at rest) |
| weapons | **twin glaives** = dual 1H (`axe1h` / `sword1h`; both hands equipped): attach `/assets/models/gen/weapons/axe_1h_crescent.glb` to `handslot.r` **and** `handslot.l` (crescent blade = glaive), scale ×1.2, emissive fel-green edge `0x7dff3a` (upgrade-glow tier colour overrides it); all existing dual-wield clips (`Dualwield_Melee_Attack_Slice / _Chop / _Stab`) play unchanged |
| blindfold | NEW helper `CharacterModel.attachBlindfold(color)`: a 0.34 × 0.07 m black band on `head` + two additive fel-green eye billboards (0.05 m, bloom) that shine through the band; Havoc eyes `0x9cff4a`, Vengeance eyes `0xff7a30` |
| VFX palette | fel-green `#9cff4a` primary, violet `#b06bff` (Kaos), ember `#ff7a30` (İntikam fire); existing `fel_aura` / `demon_portal` / `soul_orb` aliases (GDD_CLASSES_V2 §11.1) are reused |
| movement signature | **double jump** (a second `Jump_Start` in the air, +60 % height, once per airtime) and **glide** (hold jump while falling: terminal velocity ×0.25, `Jump_Idle` pose, +20 % forward speed) — PlayerController feature §g.2; Fel Atılışı and İntikam Geri Çekilişi are the horizontal mobility |
| resource | `ResourceType 'fury'` — Öfke, bar 100, colour `#9cff4a`, decays 4/s after 6 s out of combat. Costs are WoW × 0.5 (see §0.2). `StatCalc` resource regen 0 (all regen is the spec passive) |
| secondary pip | `PipId 'soul'` — **Ruh Parçacığı**, max 6, `#b8ff9a`, shown only for İntikam; fragments auto-collect (no ground orbs) with a `soul_fragment_orb` VFX flying to the player |
| ClassDef sketch | `baseStats { str 10, dex 18, int 8, vit 14, resourceRegen 0 }`, `perLevel { str 1, dex 4, int 0, vit 2 }`, `hpPerLevel 10`, `hpPerVit 10`, `mainStat 'dex'`, `armorWeight 'medium'`, `weapons ['axe1h','sword1h']`, `offhands []`, `basicAttack 'demonhunter_basic'`, `startingItems ['axe1h_t1','axe1h_t1']`, `color '#9cff4a'`, `voice { pack 'warrior', pitch 0.9 }`, `cameraProfile 'melee'`, `regenRule 'default'`, `specs ['demonhunter_chaos','demonhunter_vengeance']`, trait `trait_demonhunter` **Karanlık Görüş** (+8 % damage vs enemies < 6 m, +10 % move speed while gliding) |
| class buff | **Kaos Damgası** (`chaos_brand`): any hit of this class applies it (30 s): enemies take +5 % magic (non-physical) damage — CM3 owns the debuff table and the type-restricted `takenMore` (§g.2) |

**Shared LMB chain `demonhunter_basic`** — Fel Bıçakları (Demon Blades analogue), 4 steps, reset 0.8 s, tempo `FEEL_WEAPON` dual-wield 1.0, cadence 1.17 s (51.3 chains, 205 hits per 60 s) ⇒ **0.325 coef/s ≈ 19.5 per 60 s** (parallel rule, §0.5), **+1 Öfke per hit**:

| step id | TR | anim · speed @hit | shape | coef | weight / stagger | VFX · SFX |
|---|---|---|---|---|---|---|
| `demonhunter_basic_1` | Sağ Pençe | `Dualwield_Melee_Attack_Slice` ×1.8 @0.408 | arc 120° / 2.6 | 0.07 phys | 0 / 3, `upper 1`, lunge 0.6 | `glaive_trail` (NEW, alias `slash_arc` violet) · `swing_light` `hit_flesh` |
| `demonhunter_basic_2` | Sol Pençe | `Dualwield_Melee_Attack_Chop` ×1.5 @0.507 | 110° / 2.6 | 0.07 phys | 0 / 3, `upper 1` | `glaive_trail` · `swing_light` |
| `demonhunter_basic_3` | Çapraz Saplama | `Dualwield_Melee_Attack_Stab` ×1.6 @0.512 | 60° / 3.2, lunge 1.3 | 0.10 shadow | 4 / 5 | `glaive_trail` + `shadow_burst`(0.4) · `swing_heavy` |
| `demonhunter_basic_4` | İkiz Girdap | `2H_Melee_Attack_Spin` ×2.0 @0.6 | 360° / 3.0 | 0.14 shadow, finisher | 1 / 9, root | `spin_slash` fel-green + `shockwave`(0.5) · `swing_heavy` `heavy_hit` |

(Clip hit times are the GDD_CLASSES_V2 verified values; the rogue chain uses the same dual-wield clips, so the two classes differ by speed, arc and the spin finisher — verify in `dev/combat.html`.)

---

## 3.1 `demonhunter_chaos` — Kaos (DPS, WoW Havoc)

**Passive**: `critChance .06, attackSpeed .05, shadowDamagePct .15`. Trait `trait_havoc` **Fel Bıçakları** (Demon Blades): **+10 Öfke/s while in combat** (haste-scaled) — the WoW auto-attack Fury engine folded into a passive; the parallel chain adds +1 per hit on top (≈ 205 per minute, §0.5).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `demonhunter_basic` (+`_1.._4`) | Fel Bıçakları | Demon Blades | inst chain | melee_arc | 2.6–3.2 | – | +1 Öfke / hit | off | 0.07 / 0.07 / 0.10 / 0.14 | `chaos_brand` | – | `glaive_trail` `spin_slash` | `Dualwield_Melee_Attack_Slice` / `…_Chop` / `…_Stab`, `2H_Melee_Attack_Spin` | `swing_light` `swing_heavy` |
| rmb | `demonhunter_chaos_strike` | Kaos Darbesi | Chaos Strike | inst | target_instant | 4 (+3) | – | −20 Öfke | on | 0.70 shadow (two glaive hits); **`replaces` → `demonhunter_annihilation` while `metamorphosis`** | `chaos_brand`; Essence Break window +60 % | – | `glaive_trail` + `shadow_burst` | `Dualwield_Melee_Attack_Slice` ×1.8 | `swing_light` `fel_impact` |
| rmb′ | `demonhunter_annihilation` | Yok Ediş | Annihilation | inst | target_instant | 4 (+3) | – | −20 Öfke | on | 0.91 shadow (×1.3) | as above | – | violet-red `glaive_trail` + `crit_burst` | `Dualwield_Melee_Attack_Chop` ×1.6 | `swing_heavy` `fel_impact` |
| q | `demonhunter_blade_dance` | Bıçak Dansı | Blade Dance | inst | self_aoe | r 6 | 15 s | −18 Öfke | on | 2.20 shadow per target; **`replaces` → `demonhunter_death_sweep` (CD 9 s) while `metamorphosis`** | `chaos_brand`; Essence Break +60 % | – | `spin_slash` blue-violet | `2H_Melee_Attack_Spin` ×1.8 | `swing_heavy` |
| q′ | `demonhunter_death_sweep` | Ölüm Süpürmesi | Death Sweep | inst | self_aoe | r 7 | 9 s | −18 Öfke | on | 2.55 shadow per target | as above | – | `spin_slash`(1.3) red-violet | `2H_Melee_Attack_Spin` ×1.8 | `swing_heavy` |
| e | `demonhunter_eye_beam` | Göz Işını | Eye Beam | ch 2.4 s | custom:`channel_beam` (re-aims to facing, §g.2) | 20 line, width 2 | 30 s | −15 Öfke, **+12 Blind Fury** | on | 6.20 shadow total (4 ticks of 1.55), hits ≤ 5 in AoE | `unstoppable`, slow 70 % while channelling | glow when `initiative` is up | **NEW** `essence_beam` (fel-violet double beam from both eyes) | `Spellcast_Long` ×1.2 | **NEW** `eye_beam_loop` |
| r | `demonhunter_vengeful_retreat` | İntikam Geri Çekilişi | Vengeful Retreat | inst | dash (backwards) | 8 | 25 s | – | off | 0.55 shadow to enemies ≤ 6 m at the take-off spot, knockback 1.5 | `initiative` 6 s; `iframes` 0.25 s | `initiative` | `dodge_dust` + `fel_aura` | `Dodge_Backward` ×1.3 | `whoosh` |
| s1 | `demonhunter_immolation_aura` | Yakıp Yok Etme Aurası | Immolation Aura | inst | self_aoe (follows caster, 6 ticks) | r 7 | 15 s x2 | **+20 Öfke** | on | 2.65 fire per target over 6 s | – | – | `fire_ground` follow + `burn_loop` | `Spellcast_Raise` ×2.0 | `fire_cast` |
| s2 | `demonhunter_fel_rush` | Fel Atılışı | Fel Rush | inst | dash | 12 | 10 s x2 | – | off | 0.70 shadow along the path (r 2) | self absorb 4 % max HP 4 s (First In, Last Out) | – | `charge_trail` fel-green | `Running_A` ×2.2 | `whoosh` `fel_cast` |
| s3 | `demonhunter_blur` | Bulanıklık | Blur | inst | self_buff | – | 60 s x2 | – | off | – | `blur` 10 s: −35 % damage taken, +50 % dodge | – | `buff_aura` violet blur | `Cheer` ×2.2 | `blink` |
| s4 | `demonhunter_disrupt` | Bozucu | Disrupt | inst | melee_arc (existing `interrupt`) | 5, cone 90° | 15 s | – | off | – | cancel + silence 3 s | – | `kick_arc` violet | `Unarmed_Melee_Attack_Kick` ×1.6 | `interrupt` |
| m45 | `demonhunter_essence_break` | Öz Kırılması | Essence Break | inst | self_aoe | r 10 | 45 s (bucket, WoW 40) | – | off | 5.30 shadow per target (initial); window below | `essence_break` 4 s on targets | `essence_break` | `shockwave` dark-blue + `fel_aura` | `Spellcast_Raise` ×1.5 | `fel_impact` `explosion`(0.3) |
| m90 | `demonhunter_metamorphosis` | Metamorfoz | Metamorphosis | inst | self_buff + leap impact | r 5 | 90 s (bucket, WoW 120) | – | off | impact 2.65 shadow per target | `metamorphosis` 24 s: +25 % haste, **Kaos Darbesi / Bıçak Dansı transform**, +15 % max HP | `metamorphosis` | **NEW** `fel_wings` + `enrage_aura` fel | `Jump_Full_Short` + `Spellcast_Raise` | `demon_summon`(0.5) `boss_roar`(0.4) |
| m180 | `demonhunter_the_hunt` | Av | The Hunt | cast 0.8 s then dash | dash (homing) | 50 | **90 s** (m180 slot, exception) | – | off | 7.95 shadow (hit 4.0 + 6 s DoT 3.95) | `exergy` 10 s: +10 % damage; DoT `the_hunt` | `exergy` | `charge_trail` + `chain_lightning` violet chain | `Spellcast_Raise` ×1.5 → `Running_A` ×2.5 | `fel_cast` `whoosh` |

Dropped from the WoW kit (slot-limited): Felblade, Throw Glaive, Darkness, Chaos Nova. Demonsurge / Initiative-Inertia hero branches are not modelled (Fel-Scarred is not selected).

**Spec mods (Kaos)**: none — Kaos rows are the base rows of the shared ids (§0.5): `demonhunter_immolation_aura` (+20 Öfke, 2.65) and `demonhunter_metamorphosis` (24 s, impact 2.65, `metamorphosis`).

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `metamorphosis` | Metamorfoz | m90 | button transforms (Kaos Darbesi → Yok Ediş ×1.3, Bıçak Dansı → Ölüm Süpürmesi 9 s), +25 % haste, wings | 24 s | – | burst banner |
| `initiative` | Girişim | İntikam Geri Çekilişi | +12 % damage, Kaos Darbesi / Yok Ediş +15 % crit chance | 6 s | `demonhunter_eye_beam` | left, fel-green |
| `exergy` | Taşkınlık | Av | +10 % damage (stacks with Girişim) | 10 s | – | – |
| `essence_break` | Öz Kırılması | m45 (debuff on enemies) | Kaos Darbesi / Yok Ediş / Bıçak Dansı / Ölüm Süpürmesi deal +60 % to the target | 4 s | `demonhunter_chaos_strike` | target-frame own debuff |
| `chaos_brand` | Kaos Damgası | any hit (class buff) | enemy +5 % magic damage taken | 30 s | – | target frame |
| `blur` | Bulanıklık | s3 | −35 % damage taken | 10 s | – | – |
| rule `resource90` | – | Öfke ≥ 90 | Kaos Darbesi / Yok Ediş soft ants (cap pressure) | – | – | – |

### c) APL

```
# ST
demonhunter_the_hunt            if cdready:demonhunter_the_hunt                                   # m180 slot, CD 90
demonhunter_essence_break       if cdready && fury>=18                                            # m45; then spend inside the 4 s window
demonhunter_metamorphosis       if cdready && (cdready:demonhunter_eye_beam || cd:demonhunter_eye_beam<=3)   # m90
demonhunter_vengeful_retreat    if cdready && cd:demonhunter_eye_beam<=1                          # pair with Eye Beam (Initiative)
demonhunter_eye_beam            if cdready && fury>=15 && !moving
demonhunter_blade_dance         if cdready && fury>=18                                            # Death Sweep while metamorphosis
demonhunter_immolation_aura     if charges>=2 || fury<=70
demonhunter_chaos_strike        if fury>=20                                                       # Annihilation while metamorphosis
demonhunter_disrupt             if tcast
demonhunter_blur                if php<0.5
# AoE (targets>=3): Immolation Aura and Blade Dance move above Eye Beam; Metamorphosis waits for Eye Beam, Immolation Aura and Blade Dance to be on cooldown
demonhunter_immolation_aura     if charges>=1
demonhunter_blade_dance         if cdready && targets>=3
```

### d) Budget hand calculation (Kaos)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Kaos Darbesi / Yok Ediş `demonhunter_chaos_strike` | 39.7 | Fury-limited filler, 20 Fury, takes every GCD the Fury allows (Yok Ediş in Metamorfoz ×1.3, 24 s of 90 ⇒ average 0.70 × 1.08) | 0.756 | 30.01 |
| Bıçak Dansı / Ölüm Süpürmesi `demonhunter_blade_dance` | 4.8 | 15 s CD (Ölüm Süpürmesi 9 s in Metamorfoz) ⇒ 4.8 | 2.3 | 11.04 |
| Göz Işını `demonhunter_eye_beam` | 2 | 30 s CD, 2.4 s channel, Blind Fury +12 | 6.2 | 12.4 |
| Yakıp Yok Etme Aurası `demonhunter_immolation_aura` | 4 | 2 charges / 15 s ⇒ 4, +20 Fury | 2.65 | 10.6 |
| İntikam Geri Çekilişi `demonhunter_vengeful_retreat` | 2.4 | 25 s CD paired with Eye Beam ⇒ 2.4 | 0.55 | 1.32 |
| Fel Atılışı `demonhunter_fel_rush` | 3 | 2 charges / 10 s, weave 3 | 0.7 | 2.1 |
| Av `demonhunter_the_hunt` | 0.67 | m180 slot, CD 90: 60 / 90 | 7.95 | 5.33 |
| Metamorfoz `demonhunter_metamorphosis` | 0.67 | m90: 60 / 90 (impact only; form bonus in Yok Ediş) | 2.65 | 1.78 |
| Öz Kırılması `demonhunter_essence_break` | 1.33 | m45: 60 / 45 (window +60 % counted in coef) | 5.3 | 7.05 |
| LMB chain (parallel, all 60 s) | 51.3 chains | 0.38 per chain = 0.325 / s | – | 19.49 |
| **Σ raw** | | | | **101.1** (target 100) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Kaos Darbesi / Yok Ediş `demonhunter_chaos_strike` — Fury left after Dans / Işın | 19 | 1 | 0.756 | 14.36 |
| Bıçak Dansı / Ölüm Süpürmesi `demonhunter_blade_dance` — 15 s CD + Ölüm Süpürmesi in the Metamorfoz window ⇒ 3.2 | 3.2 | 8 | 2.3 | 58.88 |
| Göz Işını `demonhunter_eye_beam` — 30 s CD, beam hits 5 (falloff 0.9) | 1 | 5 | 5.6 | 28 |
| Yakıp Yok Etme Aurası `demonhunter_immolation_aura` — 2 casts | 2 | 8 | 2.5 | 40 |
| İntikam Geri Çekilişi `demonhunter_vengeful_retreat` — paired with Eye Beam | 1.2 | 3 | 0.55 | 1.98 |
| Fel Atılışı `demonhunter_fel_rush` — weave 1.5 | 1.5 | 8 | 0.7 | 8.4 |
| Av `demonhunter_the_hunt` — 40 / 90 | 0.44 | 1 | 7.95 | 3.5 |
| Metamorfoz `demonhunter_metamorphosis` — 40 / 90 | 0.44 | 8 | 1.85 | 6.51 |
| Öz Kırılması `demonhunter_essence_break` — 40 / 45 | 0.9 | 8 | 3.7 | 26.64 |
| LMB chain (parallel, 30 s; arcs + 360° finisher ⇒ 2.5 targets) | 25.6 chains | 2.5 | 0.38 per chain (9.74 per target) | 24.36 |
| **Σ raw** | | | | **212.6** (target 225) |

Time budget: ST GCD busy 54.1 s (39.7 + 4.8 + 4.8 + 4.0 + 0.8) + 2.6 s off-GCD, 3.3 s Fury-starved idle; AoE 26.95 s + 1.5 s off-GCD, 1.6 s idle. Resource check per window — **Fury ST in 909 (passive 600 + chain 205 + Immolation Aura 80 + Blind Fury 24) / out 910 (39.7 × 20 + 4.8 × 18 + 2 × 15)**, AoE in 455 (300 + 103 + 40 + 12) / out 453 (19 × 20 + 3.2 × 18 + 15).

Fury is the limiter and is exactly spent: Kaos Darbesi is the always-on filler and its cast count is what the chain's +1 per hit pays for (no starvation, no cap pressure beyond the ≥ 90 % glow). **Party buff**: Kaos Damgası (+5 % magic damage taken).

### e) What it feels like

* **Burst rhythm**: Vengeful Retreat hop → Eye Beam (Girişim glows green on the beam button) → Essence Break → spend inside the 4 s window; Metamorfoz turns two buttons into their red-violet versions and shortens Bıçak Dansı to 9 s.
* **Fury is an engine, not a bar to babysit**: it refills at 10/s, so Kaos Darbesi is the always-on filler and Fury cap pressure (≥ 90 %) makes it glow.
* **Signature move — Göz Işını**: `Spellcast_Long` ×1.2 (the DH plants and throws the head back), the blindfold eyes flare (eye billboards ×3 scale, bloom) and two thin violet-green beams (**NEW** `essence_beam`: additive ribbon with a
  travelling spiral pulse every 0.6 s, colour `0x9cff4a` core / `0xb06bff` halo, width 2.0, length 20) sweep out from the eyes along the facing, re-aimed every frame (the player can turn at 70 % slow); each of the four ticks spawns a
  small violet nova on every enemy in the line, one merged damage number per target, trauma 0.05 per tick, final tick trauma 0.14 + 40 ms victim stop; `eye_beam_loop` (a rising hum, +2 % pitch per tick) and `fel_cast` at the start;
  **Blind Fury** shows as small green Fury pips popping off the eyes into the bar (+12). Vengeful Retreat paired right before it turns the whole channel +12 % harder and bathes the beam in a brighter green.

---

## 3.2 `demonhunter_vengeance` — İntikam (tank, WoW Vengeance)

**Passive**: `maxHpPct .30, armorPct .15, dodgeChance .05, lifeSteal .04, threatPct 1.5, damagePct −.25` (low armour, high self-sustain per CORE §2). Trait `trait_vengeance` **Fel Kanı**: **+6 Öfke/s in combat** (WoW's Shear spam folded into a passive; Shear has no slot),
+1 Ruh Parçacığı per 10 s, and LMB step 4 has a 20 % PRD to give +1 fragment (≈ 10 per minute on the parallel chain). Fragments (0–6) never decay in combat; `soul_overflow` (hidden, ≥ 5 fragments) transforms the Ruh Yarma button.

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `demonhunter_basic` (+`_1.._4`) | Fel Bıçakları | Shear | inst chain | melee_arc | 2.6–3.2 | – | +1 Öfke / hit; step 4 20 % PRD +1 fragment | off | 0.07 / 0.07 / 0.10 / 0.14 | `chaos_brand` | – | `glaive_trail` `spin_slash` | `Dualwield_Melee_Attack_Slice` / `…_Chop` / `…_Stab`, `2H_Melee_Attack_Spin` | `swing_light` `swing_heavy` |
| rmb | `demonhunter_fracture` | Kırılma | Fracture | inst | target_instant | 4 (+3) | 4.5 s x2 | **+14 Öfke, +2 fragments** | on | 0.75 phys (two crossing slashes); +20 % in `metamorphosis` | `cdrOnCast` −0.5 s on Şeytan Dikenleri (Feed the Demon) | – | `glaive_trail` ×2 crossing | `Dualwield_Melee_Attack_Slice` ×1.6 | `swing_light` `hit_flesh` |
| q | `demonhunter_soul_cleave` | Ruh Yarma | Soul Cleave | inst | melee_arc cone 120° | 5 | – | −22 Öfke, eats ≤ 1 fragment (+40 % damage and heal per fragment) | on | 1.05 phys, cleave 3; heal 1.0 (≈ 3.3 % max HP) per cast; **`replaces` → `demonhunter_spirit_bomb` while `soul_overflow`** | `cdrOnCast` −0.5 s Şeytan Dikenleri | – | `slash_arc_big` blue-violet + `heal_burst` | `Dualwield_Melee_Attack_Chop` ×1.5 | `swing_heavy` `heal` |
| q′ | `demonhunter_spirit_bomb` | Ruh Bombası | Spirit Bomb | inst | self_aoe | r 7 | – | −25 Öfke, **spends all fragments (needs ≥ 5)** | on | 2.30 fire per target; heal 6 % max HP if ≥ 3 targets | `frailty` 6 s (you heal 10 % of damage you deal to it) | – | `soul_orb` burst + `fire_burst` | `Spellcast_Raise` ×1.8 | `fel_impact` `heal` |
| e | `demonhunter_fiery_brand` | Ateş Mührü | Fiery Brand | inst | target_instant | 30 | **30 s x2** (recharge; tuning deviation, WoW 60 s CD + talent charge, §0.4) | – | off | 1.15 fire | `fiery_brand` 8 s: target deals −40 % damage to you and takes +10 % from you | – | `fire_burst` + `mark_loop` orange | `Spellcast_Shoot` ×1.8 | `fire_cast` |
| r | `demonhunter_torment` | İşkence | Torment | inst | target_instant | 25 | 8 s | – | off | – | `taunt` 3 s (boss: forced 2 s, ICD 12 s; threat := max(cur, top × 1.1) + 100) | – | `chain_lightning` fel chain to the target | `Cheer` ×2.2 | `war_cry` |
| s1 | `demonhunter_immolation_aura` | Yakıp Yok Etme Aurası | Immolation Aura | inst | self_aoe (follows caster, 6 ticks) | r 7 | 15 s x2 | **+16 Öfke** | on | 1.85 fire per target over 6 s | – | – | `fire_ground` follow | `Spellcast_Raise` ×2.0 | `fire_cast` |
| s2 | `demonhunter_infernal_strike` | İnfernal Atılış | Infernal Strike (+ Sigil of Flame) | inst | leap | 30 | 20 s x2 | – | off | 1.85 fire at the landing (r 5) incl. the **Alev Mührü** that arms 2 s later and burns 4 s | – | – | `infernal_fall`(0.7) + **NEW** `sigil_ground` | `Jump_Full_Long` | `fire_impact` |
| s3 | `demonhunter_demon_spikes` | Şeytan Dikenleri | Demon Spikes | inst | self_buff | – | 20 s x2 | – | off | – | `demon_spikes` 8 s (WoW 6 s + 2 s folded from Feed the Demon): armour +100 %, parry window +30 % | – | `shield_bubble` dark spikes (`bone_armor` alias tinted) | `Cheer` ×2.4 | `guard_hit` |
| s4 | `demonhunter_disrupt` | Bozucu | Disrupt | inst | melee_arc (`interrupt`) | 5 | 15 s | – | off | – | silence 3 s | – | `kick_arc` | `Unarmed_Melee_Attack_Kick` | `interrupt` |
| m45 | `demonhunter_fel_devastation` | Fel Yıkımı | Fel Devastation | ch 1.6 s | custom:`channel_beam` (cone 60°) | 20 | 45 s (bucket, WoW 40) | −30 Öfke | on | 5.35 fire per target (≤ 8) | heals 12 % max HP over the channel; unstoppable, slow 60 % | – | `essence_beam` fan, ember `0xff7a30` | `Spellcast_Long` ×1.5 | `fire_whoosh` `fel_cast` |
| m90 | `demonhunter_metamorphosis` | Metamorfoz | Metamorphosis | inst | self_buff + leap impact | r 5 | 90 s (bucket) | – | off | impact 1.55 fire | `metamorphosis_v` 15 s: +40 % max HP, +15 % leech, +20 % damage on Kırılma / Yarma / Bomba | – | `fel_wings` + `enrage_aura` ember | `Jump_Full_Short` + `Spellcast_Raise` | `demon_summon`(0.5) `boss_roar`(0.4) |
| m180 | `demonhunter_soul_carver` | Ruh Oyucu | Soul Carver | inst | target_instant | 4 (+3) | **60 s** (m180 slot, exception) | – | off | 3.80 fire (hit + 3 s DoT) | **+3 fragments** | – | `fire_burst` + slash | `Dualwield_Melee_Attack_Chop` ×1.4 | `fire_impact` |

Dropped (slot-limited): standalone Sigil of Flame (merged into İnfernal Atılış), Sigil of Spite, Felblade, Darkness. The Vengeance AoE button is Yakıp Yok Etme Aurası (s1).

**Spec mods (İntikam)** — base rows are Kaos's (§0.5):

| skill | patch / params |
|---|---|
| `demonhunter_immolation_aura` | `patch { cost: -16, damage: { coef: 1.85, type: 'fire', perTick: true } }` (base: −20 cost = +20 Öfke, 2.65) |
| `demonhunter_metamorphosis` | `patch { damage: { coef: 1.55, type: 'fire' }, selfStatuses: [metamorphosis_v 15 s] }` (base: 2.65 shadow, `metamorphosis` 24 s); the +20 % on Kırılma / Yarma / Bomba is the `metamorphosis_v` rule row |
| `demonhunter_fiery_brand` etc. | İntikam-only rows, no patch |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `soul_overflow` (hidden pip-threshold status) | Ruh Taşması | fragments ≥ 5 | q button transforms into Ruh Bombası | while ≥ 5 | `demonhunter_spirit_bomb` | top, green-white `#b8ff9a` |
| `demon_spikes` | Şeytan Dikenleri | s3 | armour +100 %, parry +30 % | 8 s | – | HUD buff icon |
| `fiery_brand` | Ateş Mührü | e (debuff on target) | −40 % damage to you, +10 % taken from you | 8 s | – | target frame own debuff |
| `frailty` | Zayıflık | Ruh Bombası (debuff) | heal 10 % of your damage to it | 6 s | – | target frame |
| `metamorphosis_v` | Metamorfoz | m90 | see kit | 15 s | – | burst banner |
| `chaos_brand` | Kaos Damgası | any hit | enemy +5 % magic | 30 s | – | target frame |
| `soul` pip | Ruh Parçacığı | see kit | 0–6 | – | – | PipDef `soul`, `soul_fragment_orb` fly-in |

### c) APL

```
# ST
demonhunter_fiery_brand       if charges>=2 || (charges>=1 && !status:demon_spikes)       # off-GCD, stagger into Demon Spikes gaps
demonhunter_demon_spikes      if !status:demon_spikes && charges>=1
demonhunter_metamorphosis     if php<0.4 || cdready && status:demon_spikes                # m90
demonhunter_fel_devastation   if cdready && fury>=30 && tstatus:fiery_brand>=2            # m45
demonhunter_soul_carver       if tstatus:fiery_brand>=3                                    # m180 slot
demonhunter_spirit_bomb       if status:soul_overflow && fury>=25                          # q transformed
demonhunter_fracture          if charges>=1
demonhunter_immolation_aura   if charges>=2 || fury<=40
demonhunter_infernal_strike   if moving
demonhunter_soul_cleave       if fury>=22
demonhunter_disrupt           if tcast
demonhunter_torment           if tank_swap
# AoE (targets>=3): Immolation Aura first, Spirit Bomb above Soul Cleave at >= 4 fragments
```

### d) Budget hand calculation (İntikam)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Kırılma `demonhunter_fracture` | 13 | 2 charges / 4.5 s ⇒ 13; +14 Fury, +2 souls | 0.75 | 9.75 |
| Ruh Yarma `demonhunter_soul_cleave` | 30.5 | Fury sink and filler, 22 Fury, eats up to 1 soul; takes every GCD the Fury allows | 1.05 | 32.02 |
| Ruh Bombası `demonhunter_spirit_bomb` | 4 | ≥ 5 souls, 25 Fury (replaces Ruh Yarma) | 2.3 | 9.2 |
| Yakıp Yok Etme Aurası `demonhunter_immolation_aura` | 4 | 2 charges / 15 s ⇒ 4, +16 Fury | 1.85 | 7.4 |
| İşkence `demonhunter_torment` | 1.5 | taunt, 8 s CD, ≈ 1.5 uses (no damage) | 0 | 0 |
| Fel Yıkımı `demonhunter_fel_devastation` | 1.33 | m45: 60 / 45, 1.6 s channel, 30 Fury | 5.35 | 7.12 |
| Ruh Oyucu `demonhunter_soul_carver` | 1 | m180 slot, CD 60 ⇒ 1.0 (+3 souls) | 3.8 | 3.8 |
| Metamorfoz `demonhunter_metamorphosis` | 0.67 | m90: 60 / 90 (+20 % on Kırılma/Yarma/Bomba via coef) | 1.55 | 1.04 |
| Ateş Mührü `demonhunter_fiery_brand` | 2 | 2 charges, 30 s recharge ⇒ 2 / min, off-GCD | 1.15 | 2.3 |
| Şeytan Dikenleri `demonhunter_demon_spikes` | 4.1 | off-GCD, 2 charges, 20 s recharge − 0.5 s per Kırılma / Ruh Yarma (see below), no damage | 0 | 0 |
| İnfernal Atılış (+Alev Mührü) `demonhunter_infernal_strike` | 2 | 2 charges / 20 s, used 2 / min as mobility, lands an Alev Mührü | 1.85 | 3.7 |
| LMB chain (parallel, all 60 s) | 51.3 chains | 0.38 per chain = 0.325 / s | – | 19.49 |
| **Σ raw** | | | | **95.8** (target 93.3) |
| × passive `damagePct −0.25` | | | | **71.9** (target 70 ±5) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Kırılma `demonhunter_fracture` — 6 / 30 s | 6 | 1 | 0.75 | 4.5 |
| Ruh Yarma `demonhunter_soul_cleave` — Fury left | 12.9 | 3 | 0.75 | 29.03 |
| Ruh Bombası `demonhunter_spirit_bomb` — 3.5 / 30 s (Fallout: Aura hits add fragments) | 3.5 | 8 | 2.3 | 64.4 |
| Yakıp Yok Etme Aurası `demonhunter_immolation_aura` — 2 casts | 2 | 8 | 1.85 | 29.6 |
| Fel Yıkımı `demonhunter_fel_devastation` — 40 / 45 | 0.9 | 8 | 4.3 | 30.96 |
| Ruh Oyucu `demonhunter_soul_carver` — 40 / 60 | 0.67 | 3 | 2.3 | 4.62 |
| Metamorfoz `demonhunter_metamorphosis` — 40 / 90 | 0.44 | 8 | 0.95 | 3.34 |
| Ateş Mührü `demonhunter_fiery_brand` — 1 in the pull | 1 | 1 | 1.15 | 1.15 |
| İnfernal Atılış (+Alev Mührü) `demonhunter_infernal_strike` — 1 | 1 | 8 | 1.5 | 12 |
| LMB chain (parallel, 30 s; arcs + 360° finisher ⇒ 2.5 targets) | 25.6 chains | 2.5 | 0.38 per chain (9.74 per target) | 24.36 |
| **Σ raw** | | | | **204.0** (target 210) |
| × passive `damagePct −0.25` | | | | **153.0** (target 158 ±15) |

Time budget: ST GCD busy 53.6 s (13 + 30.5 + 4 + 4 + 2.1) + 4.4 s off-GCD, 2.0 s Fury-starved idle; AoE 25.8 s + 2.2 s off-GCD, 2.0 s idle. Resource check per window — **Fury ST in 811 (passive 360 + Kırılma 182 + Aura 64 + chain 205) / out 811 (30.5 × 22 + 4 × 25 + 1.33 × 30)**, AoE in 399 (180 + 84 + 32 + 103) / out 398 (12.9 × 22 + 3.5 × 25 + 0.9 × 30); soul ST in 45.3 (Fel Kanı 6 + Kırılma 26 + Ruh Oyucu 3 + chain 20 % × 51.3 = 10.3) / out 45.3 (Ruh Bombası 4 × 5 + Ruh Yarma eats 25.3), AoE in 25.1 (3 + 12 + 2 + chain 5.1 + Fallout 3) / out 25.1 (3.5 × 5 + 7.6).

**Active mitigation uptime** (rule ≥ 60 %), derived without an overlap constant. Three sources; the APL places them independently, so the union is 1 − Π(1 − uᵢ) (staggering Ateş Mührü into Dikenler gaps can only improve on that):
Şeytan Dikenleri — 2 charges, 20 s recharge, each Kırılma / Ruh Yarma cast −0.5 s (13 + 30.5 = 43.5 casts/min ⇒ −21.8 s of recharge) ⇒ (60 + 21.8) / 20 = 4.1 casts × 8 s = **32.7 s ⇒ u = 54.5 %**;
Ateş Mührü — 2 charges, **30 s recharge** (§0.4) ⇒ 2 casts/min × 8 s = **16 s ⇒ u = 26.7 %**; Metamorfoz — 15 s per 90 s = **10 s ⇒ u = 16.7 %**.
Union = 1 − 0.455 × 0.733 × 0.833 = **72 %** with Metamorfoz and 1 − 0.455 × 0.733 = **67 %** without it (rule ≥ 60 % ✓ both ways; with the old 60 s recharge — one Ateş Mührü cast a minute at steady state — the no-Metamorfoz union would be only 1 − 0.455 × 0.867 = 61 %, i.e. no margin, which is why the recharge was shortened).
Self-healing: Ruh Yarma 30.5 casts × 3.3 % + Ruh Bombası 4 × 6 % + Fel Yıkımı 1.33 × 12 % + 4 % leech ≈ 20–27 % of damage taken (target 15–30 %).

**Party buff**: Kaos Damgası.

### e) What it feels like

* **Fragments are the beat**: Kırılma is a twin-slash that flings two green orbs into the pip bar; Ruh Yarma chews one (a heal ring), and at five the button flips to Ruh Bombası with a green-white top overlay.
* **Two defensive clocks** run side by side — Şeytan Dikenleri (short, armour, a visible dark-spike shell) and Ateş Mührü (a branded target who hits softer) — and the rotation is "keep one of them up".
* **Signature move — Ruh Bombası**: `Spellcast_Raise` ×1.8, the DH clutches a ball of fragments (the six `soul_fragment_orb` pip orbs fly from the bar to the chest in 0.25 s, brightening), then punches it into the ground:
  a green-white `soul_orb` burst, a ring r 7, ember fire sprites, heal pulse ring (`heal_burst`) when ≥ 3 enemies are hit, 90 ms victim hit-stop (weight 2), trauma 0.18, `fel_impact` + `heal` + a low "soul chime" (`proc_use` pitch 0.8) — the pips empty into the orb one by one with `ui_tab` +4 % pitch per pip.

---

# 4. Ejderhasoy (`evoker`) — NEW CLASS — Yıkım Nefesi · Koruyucu Nefes · Yüceltme

## 4.0 Class frame, visual identity, empowered spells and ClassDef sketch

| field | value |
|---|---|
| `id` / TR | `evoker` / **Ejderhasoy** (tagline "Alevin ve Zamanın Çocuğu"), role text "Menzilli · Yıkım / Şifa / Destek" (a **ranged auto-attacker**, §4.0 chain) |
| model | `/assets/models/characters/Mage.glb` (`visual.paletteClass 'mage'`) with a **dragon-scale tint** (`defaultTint` by spec: Yıkım `0xd04030` red-orange with azure accents, Koruyucu `0x4fd19a` emerald, Yüceltme `0xd9a441` bronze-gold). Nodes: **hide** `Mage_Hat 1H_Wand Spellbook Spellbook_open`, **show** `2H_Staff` (staff by item) and `Mage_Cape` (read as the wing mantle) |
| horns / wings | NEW helper `CharacterModel.attachHorns(color)` (two 0.18 m cones on `head`, tinted like the scale tint). Wings are VFX only: `wings_aura` (alias exists) tinted per spec, attached to `chest` while Süzül, Derin Nefes, Ejder Öfkesi or an empowered hold is active |
| VFX palette | Yıkım: ember `#ff7a30` + azure `#4aa8ff` (Spellfrost-blue = `frost` type, Volcanic = `fire`); Koruyucu: emerald `#4fd19a`; Yüceltme: bronze `#d9a441` + black `#2a2418`; Essence `#7fe3c4` |
| resource | `mana` (Mana, `#4f8bff`, `manaScaling` true: regen += 0.015 × Zeka, class base 1.0 %/s) + **pip `essence`** (Öz, max 5, `#7fe3c4`; **passive regen 1 pip per 3.5 s ÷ haste**, doubled by Ejder Öfkesi; no decay). DPS specs never run out of mana (Yıkım ≈ 52 % and Yüceltme ≈ 54 % spend per minute against a 60 % / 72 % regen, with Living Flame at the rebased 2.5 %, §0.4); Koruyucu is judged on mana (budget below). Note: `PipId 'essence'` must not be confused with `ResourceType 'essence'` (Nekromant Öz) — open question 6 |
| ClassDef sketch | `baseStats { str 8, dex 8, int 18, vit 12, resourceRegen 6 }`, `perLevel { str 0, dex 0, int 4, vit 2 }`, `hpPerLevel 9`, `hpPerVit 9`, `mainStat 'int'`, `armorWeight 'medium'`, `weapons ['staff','wand']`, `basicAttack 'evoker_basic'`, `startingItems ['staff_t1']`, `color '#7fe3c4'`, `voice { pack 'mage', pitch 0.85 }`, `cameraProfile 'caster'`, `autoAttack 'ranged'` (auto-fires at range 25 like `archer`; the "casters only swing in melee range" clause of CORE §12 does not apply to it), `regenRule 'mana'`, `manaScaling true`, trait `trait_evoker` **Ejder Kanı** (+5 % max HP, +10 % move speed for 3 s after Süzül ends) |
| class passives | **Bronz Kudret** (`bronze_blessing`, party +3 % haste, aura refreshed every 10 s) · **battle res** (`battle_res`: revive key in combat, shared pool) · **Kurt Narası** `evoker_fury_of_aspects` (`major_hero`, `dur 40`, `sated 600`; anim `Cheer`, vfx `hero_wave` + `wings_gold`; sfx `hero_horn`) on `m180` in every spec |
| shared buttons | `evoker_obsidian_scales` (s3, all specs) · `evoker_quell` (s4, all specs) · `evoker_hover` (s2: Yıkım, Yüceltme; Koruyucu uses Yeşil Kucaklayış) |

**Shared LMB chain `evoker_basic`** — Azur Darbesi (Azure Strike), 3 steps, reset 0.8 s, cadence 1.0 s (60 chains, 180 hits per 60 s) ⇒ **0.34 coef/s ≈ 20.4 per 60 s** (parallel rule, §0.5), `frost` type, finisher 6 % chance **+1 Öz** (≈ 3.6 Öz per minute).
**Ranged** — WoW's Azure Strike is an instant, targeted, ranged filler, not a melee swing: every step releases an azure crescent `projectile` (v 40, range 25, **pierce 2 ⇒ the target plus up to 2 enemies behind it**, ≈ 3 targets as in WoW). Ejderhasoy is therefore a **ranged auto-attacker** (CORE §12: "ranged classes auto-shoot"; the evoker never has to stand in melee range for its chain, the 14–25 m kit and the chain share one position):

| step id | TR | anim · speed @hit | shape | coef | weight / stagger | VFX · SFX |
|---|---|---|---|---:|---|---|
| `evoker_basic_1` | Mavi Pençe | `Spellcast_Shoot` ×2.0 (hit †0.30) | projectile v40 R25, pierce 2 | 0.10 frost | 0 / 2, `upper 1` | `frost_burst`(0.5) at the muzzle + azure crescent (`slash_arc` tinted 0x4aa8ff, flying) · `frost_cast` |
| `evoker_basic_2` | Mavi Pençe | `Spellcast_Shoot` ×1.8 (hit †0.35) | same | 0.10 frost | 0 / 2, `upper 1` | same |
| `evoker_basic_3` | Azur Süpürmesi | `Spellcast_Raise` ×1.8 (hit †0.45) | wide crescent, arc 60° at the muzzle, pierce 2 | 0.14 frost, finisher | 1 / 6 | `frost_nova`(0.4) on the first target + azure crescent · `ice_chime` |

(`†` = clip hit time estimated, to be scrubbed in `dev/combat.html`; the rate target of 0.34 coef/s is what the budget uses. The old melee clips `2H_Melee_Attack_*` and the 7 m cone are gone with the melee assumption.)

### 4.0.1 Empowered hold-to-charge spells (the signature mechanic of the class)

* **Input**: the slot key is **held**. Rank thresholds are `hold[1..3] = 0.67 / 1.33 / 2.00 s` (WoW 2.5 s × 0.8 split in thirds), all ÷ (1 + haste). Releasing before 0.67 s cancels the cast without cost or cooldown; releasing between thresholds fires the highest rank reached;
  holding past 2.00 s auto-releases at rank 3. `tip_scales` (granted by Ejder Öfkesi / Çağların Nefesi) skips the hold and fires at **rank 3** instantly.
* **While holding**: movement −80 % (`Süzül` removes the slow), pushback does not delay the thresholds (a hit costs nothing), a school lockout / stun cancels. Empowered buttons are `castTime`-less `custom:empower` skills so the generic cast bar shows a **3-notch bar**
  (CW-17 extension, §g.1) and three ring pips above the hands (**NEW** `empower_charge`: ring 1 / 2 / 3 light up in school colour as each rank is reached, with a rising 3-step tone **NEW** `empower_charge` sfx).
* **Rank effect table** (the budget uses rank 1 in single target and rank 3 in the 8-target pull):

| spell | rank 1 | rank 2 | rank 3 |
|---|---|---|---|
| Ateş Nefesi (Fire Breath) | cone 14 m / 50°, damage ×1.00, DoT 14 s | 18 m / 60°, ×1.25, DoT 17 s | 22 m / 70°, ×1.55, DoT 20 s; grants 1 / 2 / 3 `leaping_flames` |
| Ebedi Dalga (Eternity Surge) | 1 target | 3 targets | 5 targets (full damage each) |
| Rüya Nefesi (Dream Breath) | cone 12 m, HoT 4 s | 15 m, HoT 8 s | 18 m, HoT 12 s |
| Yer Sarsıntısı (Upheaval) | radius 5 | 7.5 | 10 |

---

## 4.1 `evoker_devastation` — Yıkım Nefesi (DPS, WoW Devastation)

**Passive**: `castSpeed .05, fireDamagePct .10`. Tag set `spell`. Mana is non-binding for this spec (≈ 52 % of the bar per minute: Living Flame 18.4 × 2.5 + Ateş Nefesi 2 × 1.8 + Ebedi Dalga 2 × 1.2, against a 60 % regen).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `evoker_basic` (+`_1.._3`) | Azur Darbesi | Azure Strike | inst chain | projectile (pierce 2) | 25 | – | finisher 6 % +1 Öz | off | 0.10 / 0.10 / 0.14 frost | – | 1 % `essence_burst` per finisher | azure crescents | `Spellcast_Shoot` / `…_Shoot` / `Spellcast_Raise` | `frost_cast` `ice_chime` |
| rmb | `evoker_living_flame` | Yaşayan Alev | Living Flame | cast 1.6 s | target_projectile (homing 5 rad/s) | 25 | – | −2.5 % mana (research 12 %, §0.4) | on | 1.00 fire (1.6 s cast ⇒ 0.63 coef/s, above the chain's 0.34); consumes `leaping_flames`: +1 extra target per stack; **`replaces` → `evoker_unbound_flame` while `unbound_flame`** | – | 15 % `burnout` (next cast instant, +30 %) | `fire_projectile` + `fire_burst` | `Spellcast_Shoot` ×1.15 | `fire_cast` `fire_impact` |
| rmb′ | `evoker_unbound_flame` | Serbest Alev | Unbound Flame (Apex) | inst | target_projectile | 25 | – (4 charges after Ejder Öfkesi) | free | on | 1.75 fire | 25 % `essence_burst`; consumes 1 `unbound_flame` | – | gold-white `fire_projectile` | `Spellcast_Shoot` ×1.6 | `fire_cast` |
| q | `evoker_disintegrate` | Parçala | Disintegrate | ch 2.4 s | custom:`channel_beam` (tracks the target, §g.2) | 25 | – | **−3 Öz** (0 with `essence_burst`) | on | 2.90 arcane total (4 ticks of 0.725); `iridescence` +20 % per stack | consumes `essence_burst` / `iridescence` | glow on `essence_burst` | **NEW** `essence_beam` azure-white with spiral pulse | hold `Spellcasting` | `eye_beam_loop` (reused as beam hum) |
| e | `evoker_fire_breath` | Ateş Nefesi | Fire Breath | **emp r1/r2/r3** (0.67 / 1.33 / 2.00 s) | custom:`empower` cone | 14 / 18 / 22 | 30 s x2 | −1.8 % mana | on | 5.60 fire at r1 (initial 2.4 + 14 s DoT 3.2); ×1.25 / ×1.55 | `burn` DoT; **+1 `essence_burst`**; +rank `leaping_flames` | creates both | **NEW** `dragon_breath_cone` (fire) + `empower_charge` | hold `Spellcasting` → `Spellcast_Shoot` ×1.5 | **NEW** `dragon_breath` + `fire_whoosh` |
| r | `evoker_eternity_surge` | Ebedi Dalga | Eternity Surge | **emp r1/r2/r3** | custom:`empower` (bolt to the target, 1 / 3 / 5 targets) | 25 | 30 s | −1.2 % mana | on | 4.00 frost per target | +2 `iridescence` (10 s) | `iridescence` | `dragon_breath_cone` azure-gold narrow + `frost_burst` | hold `Spellcasting` → `Spellcast_Shoot` ×1.2 | `dragon_breath` `ice_chime` |
| s1 | `evoker_pyre` | Pyre | Pyre | inst | target_instant + AoE r 8 | 25 | – | **−3 Öz** (0 with `essence_burst`) | on | 2.10 fire per target; `iridescence` +20 % | consumes `essence_burst` | glow on `essence_burst` | `fire_burst`(1.2) + `meteor_fall`(0.3) | `Spellcast_Raise` ×1.8 | `fire_impact` `explosion`(0.3) |
| s2 | `evoker_hover` | Süzül | Hover | inst | self_buff | – | 35 s x2 | – | off | – | `hover` 6 s: +30 % move speed, **hard casts do not slow you** (§g.2) | – | `wings_aura` azure + `haste_trail` | `Jump_Start` ×1.5 → `Jump_Idle` pose | `whoosh` |
| s3 | `evoker_obsidian_scales` | Obsidyen Pullar | Obsidian Scales | inst | self_buff | – | 90 s x2 | – | off | – | `obsidian` 12 s: −30 % damage taken | – | `shield_bubble` black-gold | `Cheer` ×2.0 | `buff` |
| s4 | `evoker_quell` | Bastır | Quell | inst | custom (existing `interrupt`) | 25 | 40 s | – | off | – | cancel + silence 3 s | – | `shockwave`(0.4) azure | `Spellcast_Shoot` ×2.0 | `interrupt` |
| m45 | `evoker_deep_breath` | Derin Nefes | Deep Breath | inst (0.8 s wind-up) | dash (flight line) | 25 | 45 s (bucket; WoW charges n/v) | – | off | 6.40 fire per target: path + landing r 6 | – | – | `wings_aura` + `fire_ground` trail + `meteor_fall`(0.5) landing | `Jump_Full_Long` ×0.9 | `fire_whoosh` `boss_roar`(0.4) |
| m90 | `evoker_dragonrage` | Ejder Öfkesi | Dragonrage | inst | self_buff | – | 90 s (bucket, WoW 120) | – | off | impact 2.0 + window bonus ≈ 1.6 = 3.60 | `dragonrage` 18 s: +15 % damage, Öz regen ×2, Ateş Nefesi / Ebedi Dalga CD −50 %; grants `tip_scales`; then 4 × `unbound_flame` (15 s) | `dragonrage` `tip_scales` `unbound_flame` | `wings_gold` red + `enrage_aura` red-gold | `Cheer` ×1.6 | `boss_roar` `hero_horn`(0.5) |
| m180 | `evoker_fury_of_aspects` | Aspectlerin Öfkesi | Fury of the Aspects | inst | self_buff (`major_hero`) | 40 | 180 s | – | off | – | `hero_haste` 40 s party; `sated` | – | `hero_wave` + `wings_gold` | `Cheer` | `hero_horn` |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `essence_burst` | Öz Patlaması | Ateş Nefesi +1 (certain), LMB finisher 1 % PRD, Serbest Alev 25 %, Ejder Öfkesi +1 (max 2) | next Parçala / Pyre costs 0 Öz | 15 s | `evoker_disintegrate`, `evoker_pyre` | left, emerald `#7fe3c4` |
| `leaping_flames` | Sıçrayan Alevler | Ateş Nefesi rank (1–3 stacks) | each stack: next Yaşayan Alev hits +1 extra target | 20 s | `evoker_living_flame` (AoE) | – |
| `burnout` | Alev Tükenişi | Yaşayan Alev, PRD 15 % | next Yaşayan Alev instant, +30 % | 10 s | `evoker_living_flame` | right, orange |
| `iridescence` | Gökkuşağı | Ebedi Dalga (2 stacks) | next 2 Parçala / Pyre +20 % each | 10 s | – | right, azure |
| `tip_scales` | Terazi Eğimi | Ejder Öfkesi start (1 charge) | next empowered spell fires instantly at rank 3 | 30 s | `evoker_fire_breath` | top, gold |
| `dragonrage` | Ejder Öfkesi | m90 | see kit | 18 s | – | burst banner (PATLAMA) |
| `unbound_flame` | Serbest Alev | after Ejder Öfkesi (4 stacks) | **rmb button transforms** | 15 s | `evoker_unbound_flame` | center, white-gold |
| `hover` | Süzül | s2 | +30 % speed, no cast slow | 6 s | – | – |

**Spec mods (Yıkım Nefesi)**: none — its rows are the base rows of the shared ids (§0.5): `evoker_living_flame` (1.00 fire, −2.5 % mana, `leaping_flames`, `burnout`) and `evoker_fire_breath` (`e`, 5.60, 30 s x2). The `essence_burst` row is shared (one ProcDef / PROC_MODS row, union of the three free-spell sets); the Yıkım-only trigger "LMB finisher 1 % PRD" is a hook of `combat/specs/evoker.ts`.

### c) APL

```
# ST
evoker_fury_of_aspects     if party_wants_haste                                    # m180
evoker_dragonrage          if cdready                                              # m90 (grants tip_scales + 4 Unbound Flame)
evoker_deep_breath         if cdready                                              # m45
hold evoker_fire_breath@rank=1   if cdready || status:tip_scales
hold evoker_eternity_surge@rank=1 if cdready
evoker_disintegrate        if status:essence_burst || essence>=3
evoker_unbound_flame       if status:unbound_flame>=1                              # rmb transformed
evoker_living_flame        if !moving                                              # filler
evoker_quell               if tcast
evoker_obsidian_scales     if php<0.5
# AoE (targets>=3)
hold evoker_fire_breath@rank=3   if cdready                                        # Leaping Flames x3 for Living Flame
hold evoker_eternity_surge@rank=(targets>=5?3:2) if cdready
evoker_pyre                if targets>=3 && (status:essence_burst || essence>=3)
evoker_disintegrate        if targets<=2 && (status:essence_burst || essence>=3)
evoker_living_flame        if targets<=2 && status:leaping_flames
```

### d) Budget hand calculation (Yıkım Nefesi)

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Parçala `evoker_disintegrate` | 9 | 3 Essence (free with Öz Patlaması), 2.4 s channel | 2.9 | 26.1 |
| Yaşayan Alev `evoker_living_flame` | 18.4 | 1.6 s cast filler, takes every GCD the others leave (29.4 s) | 1.0 | 18.4 |
| Serbest Alev `evoker_unbound_flame` | 2.67 | after Ejder Öfkesi: 4 free casts per window ⇒ 2.67 | 1.75 | 4.67 |
| Ateş Nefesi `evoker_fire_breath` | 2 | 2 charges / 30 s ⇒ 2, rank 1 (hold 0.67 s, counted 1.0 s) | 5.6 | 11.2 |
| Ebedi Dalga `evoker_eternity_surge` | 2 | 30 s CD ⇒ 2, rank 1 | 4 | 8 |
| Pyre `evoker_pyre` | 1 | 1 Essence spender in ST (Öz Patlaması) | 2.1 | 2.1 |
| Derin Nefes `evoker_deep_breath` | 1.33 | m45: 60 / 45, 0.8 s | 6.4 | 8.51 |
| Ejder Öfkesi (+%15 hasar penceresi) `evoker_dragonrage` | 0.67 | m90: 60 / 90; coef = impact 2.0 + window +15 % ≈ 1.6 | 3.6 | 2.41 |
| LMB chain (parallel, all 60 s, ranged pierce 2) | 60 chains | 0.34 per chain = 0.34 / s | – | 20.4 |
| **Σ raw** | | | | **101.8** (target 100) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets; **empowered holds at rank 3 count their full 2.0 s**, §4.0.1)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Parçala `evoker_disintegrate` — 1.1: Essence goes to Pyre | 1.1 | 3 | 2.3 | 7.59 |
| Yaşayan Alev `evoker_living_flame` — filler on 1–2 targets (Leaping Flames), takes the leftover 16.2 s | 10.1 | 2 | 0.6 | 12.12 |
| Serbest Alev `evoker_unbound_flame` — 1.8 | 1.8 | 2 | 1.05 | 3.78 |
| Ateş Nefesi `evoker_fire_breath` — rank 3 cone, 1 cast | 1 | 8 | 4.5 | 36 |
| Ebedi Dalga `evoker_eternity_surge` — rank 3: 5 targets | 1 | 5 | 3.2 | 16 |
| Pyre `evoker_pyre` — AoE spender, 3 Essence each ⇒ 4.5; full ST value, no falloff | 4.5 | 8 | 2.1 | 75.6 |
| Derin Nefes `evoker_deep_breath` — 40 / 45, line + landing | 0.9 | 8 | 3.85 | 27.72 |
| Ejder Öfkesi (+%15 hasar penceresi) `evoker_dragonrage` — 40 / 90 | 0.44 | 1 | 3.6 | 1.58 |
| LMB chain (parallel, 30 s, pierce 2 ⇒ 3 targets) | 30 chains | 3 | 0.34 per chain (10.2 per target) | 30.6 |
| **Σ raw** | | | | **211.0** (target 225, floor 210) |

Time budget (GCD seconds): ST — Parçala 21.6 + Yaşayan Alev 29.4 + Serbest Alev 2.7 + Ateş Nefesi 2.0 + Ebedi Dalga 2.0 + Pyre 1.0 + Derin Nefes 1.1 + Ejder Öfkesi 0.3 = **60.1 s**; AoE — Parçala 2.64 + Yaşayan Alev 16.2 + Serbest Alev 1.8 + Ateş Nefesi 2.0 + Ebedi Dalga 2.0 + Pyre 4.5 + Derin Nefes 0.72 + Ejder Öfkesi 0.2 = **30.1 s** (the previous 24.6 s under-charged the two 2.0 s rank-3 holds and the filler; the chain no longer uses idle time).
Resource check per window — essence ST in 30.1 / out 30, AoE in 16.1 / out 16.8 (the 0.7 gap is covered by free Öz Patlaması casts); mana ST ≈ 52 % of the bar.

Öz: passive 17.1/min (1 per 3.5 s) + Dragonrage doubling ≈ 3.4 + chain ≈ 3.6 (6 % × 60 finishers) + 2 Fire Breath bursts (worth 6 pips) ⇒ ≈ 30/min against 9 Parçala + 1 Pyre = 30 spent. AoE: passive 8.6 + Dragonrage 1.3 + chain 1.8 + Fire Breath burst 3.0 + Serbest Alev bursts 1.4 = 16.1 against 1.1 Parçala + 4.5 Pyre = 16.8 spent. **Party buff**: Bronz Kudret (+3 % haste), Kurt Narası, battle res.

### e) What it feels like

* **Choose your rank**: single target = tap Ateş Nefesi to rank 1 and keep moving on; a pack = hold to rank 3 and watch the cone grow. Every breath hands back a free Parçala (Öz Patlaması).
* **Chain beam**: Parçala → Parçala → Parçala while Öz Patlaması keeps lighting, with Yaşayan Alev as the 1.6 s filler and Süzül letting you cast on the run.
* **Ejder Öfkesi** is the loud 18 s: wings, doubled Öz, both breath buttons half cooldown, an instant rank-3 breath (Terazi Eğimi), then four free Serbest Alev casts.
* **Signature move — Ateş Nefesi (empowered)**: key down → the evoker rears back (`Spellcasting` loop), wings flick out, a small fire orb forms at the mouth (`empower_charge`); at **0.67 s** ring 1 lights with a low `ui_tab` note and a short exhale puff,
  at **1.33 s** ring 2 and the orb doubles (the HUD cast bar's second notch pops gold), at **2.00 s** ring 3, a white flash on the model and a **beat of silence** in the loop; the cone preview on the ground (a fan of `fire_ground` embers) widens with each rank.
  Release → `Spellcast_Shoot` ×1.5 exhale: the **NEW** `dragon_breath_cone` (a layered cone of 40 additive fire particles + 3 slow smoke ribbons, length by rank, 0.5 s) sweeps out, ground embers stay for 3 s, every enemy hit gets a burning outline
  (`burn_loop`), 80 ms victim hit-stop at rank 3 only (weight 2, otherwise 0), trauma 0.10 / 0.14 / 0.22 by rank, camera pull −2° FOV on release and a +3° kick back; `dragon_breath` (a throat roar + flame whoosh) layered with `fire_whoosh`; the
  attacker never freezes. A `proc_burst` appears on the Parçala button the moment the breath lands (Öz Patlaması).

---

## 4.2 `evoker_preservation` — Koruyucu Nefes (healer, WoW Preservation)

**Passive**: `healingPct .30, resourceRegenPct .30, castSpeed .05, threatPct −.4, damagePct −.40`. Trait `trait_preservation`: **Taşan Şifa** overheal ward (GDD_V2) and **Echo** below.

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `evoker_basic` (+`_1.._3`) | Azur Darbesi | Azure Strike | inst chain | projectile (pierce 2) | 25 | – | finisher 6 % +1 Öz | off | **×2.4 spec mod**: 0.24 / 0.24 / 0.34 frost | – | – | azure crescents | `Spellcast_Shoot` / `…_Shoot` / `Spellcast_Raise` | `frost_cast` |
| rmb | `evoker_living_flame` | Yaşayan Alev | Living Flame | cast 1.6 s | target_projectile (enemy) / target_instant (ally) | 25 | – | −2.5 % mana (research 12 %, §0.4) | on | heal 1.5 (ally) / 1.00 fire (enemy, "damage mode": the Yıkım base row) | – | 20 % `essence_burst` | `heal_burst` green / `fire_projectile` | `Spellcast_Shoot` ×1.15 | `heal` / `fire_cast` |
| q | `evoker_reversion` | Geri Dönüş | Reversion | inst | target_instant ally | 30 | – (research lists no CD; limited by mana and GCD) | −2.2 % mana | on | HoT 3.0 over 12 s + 10 % absorb | `reversion` 12 s | 15 % `essence_burst`; `merithras_blessing` bounce | `heal_loop` golden spiral | `Spellcast_Raise` ×2.0 | `heal` |
| e | `evoker_dream_breath` | Rüya Nefesi | Dream Breath | **emp r1/r2/r3** | custom:`empower` frontal cone (allies) | 12 / 15 / 18 | 30 s | −4.9 % mana | on | heal 8.5 effective at r2 (≈ 3 allies: instant 0.8 + HoT 4 / 8 / 12 s) | `dream_breath` HoT | 25 % `merithras_blessing` at r ≥ 2 | **NEW** `dragon_breath_cone` emerald-gold + motes | hold `Spellcasting` → `Spellcast_Shoot` ×1.3 | `dragon_breath` `heal` |
| r | `evoker_echo` | Yankı | Echo | inst | target_instant ally | 30 | – | **−2 Öz** | on | the duplicate heal ≈ 1.8 | `echo` on the ally 20 s: next heal on him repeats at 70 % | `twin_echoes` doubles it | `heal_loop` ghost silhouette | `Spellcast_Shoot` ×1.8 | `buff` |
| s1 | `evoker_emerald_blossom` | Zümrüt Çiçek | Emerald Blossom | inst | ground_aoe on the ally (r 8) | 30 | – | **−3 Öz** (0 with `essence_burst`), −5 % mana | on | heal 7.0 effective (3 injured allies, 2.3 each) | sets `twin_echoes` (next Yankı applies 2) | glow on `essence_burst` | `heal_pillar`-flower, `heal_loop` | `Spellcast_Raise` ×1.6 | `heal_big` |
| s2 | `evoker_verdant_embrace` | Yeşil Kucaklayış | Verdant Embrace | inst | dash to ally + heal | 25 | 24 s | −3 % mana | on | heal 3.4 (direct 2.0 + Lifebind) | `lifebind` 8 s: 60 % of your healing on others also heals the bound ally | – | `dragon_trail` green vines | `Dodge_Forward` ×1.4 | `heal` `whoosh` |
| s3 | `evoker_obsidian_scales` | Obsidyen Pullar | Obsidian Scales | inst | self_buff | – | 90 s x2 | – | off | – | `obsidian` 12 s | – | `shield_bubble` | `Cheer` | `buff` |
| s4 | `evoker_quell` | Bastır | Quell | inst | custom (`interrupt`) | 25 | 40 s | – | off | – | silence 3 s | – | `shockwave`(0.4) | `Spellcast_Shoot` | `interrupt` |
| m45 | `evoker_time_dilation` | Zaman Genişlemesi | Time Dilation | inst | target_instant ally | 30 | 45 s (bucket, WoW 60) | −2 % mana | off | −40 % damage taken for 8 s (counted as 4.5 units) | `time_dilation` 8 s (HoTs on the ally tick 50 % slower, double length) | – | `time_ripple` (NEW) gold sand glyph | `Cheer` ×1.8 | `time_warp`(0.5) |
| m90 | `evoker_stasis` | Durgunluk | Stasis | inst | self_buff | – | 90 s | – | off | stored copies of your next 3 heal casts, released free: 7.0 units | `stasis` 30 s; **button transforms** into `evoker_stasis_release` while active | `stasis` | `time_ripple` blue-gold crystal around the player | `Spellcast_Raise` ×1.6 | `time_warp` |
| m90′ | `evoker_stasis_release` | Durgunluk Salımı | Stasis (release) | inst | self | – | – | free | off | releases the stored 1–3 heals at the original targets (full coef, no mana) | consumes `stasis` | – | stored ghost icons fly out | `Cheer` | `heal_big` |
| m180 | `evoker_fury_of_aspects` | Aspectlerin Öfkesi | Fury of the Aspects | inst | self_buff (`major_hero`) | 40 | 180 s | – | off | – | `hero_haste` 40 s party | – | `hero_wave` | `Cheer` | `hero_horn` |

Dropped (slot-limited): Temporal Anomaly, Rewind, Emerald Communion, Dream Flight, Tip the Scales (as a button), Hover (Yeşil Kucaklayış is the mobility; Süzül is rebindable).

**Spec mods (Koruyucu Nefes)** — base rows are Yıkım Nefesi's (§0.5):

| skill | patch / params |
|---|---|
| `evoker_basic_1` … `_3` | `patch { damage: { coef: 0.24 / 0.24 / 0.34, type: 'frost' } }` (plain 0.10 / 0.10 / 0.14 × 2.4 ⇒ 0.82 coef/s, 49.2 per minute) |
| `evoker_living_flame` | `patch { heal: { coef: 1.5 }, allyTarget: 'any' }` (the damage half is the base row; `essence_burst` 20 % and `merithras_blessing` bounce are hooks of `combat/specs/evoker.ts`) |
| `evoker_fire_breath`, `evoker_unbound_flame`, `evoker_disintegrate`, `evoker_pyre`, `evoker_eternity_surge`, `evoker_deep_breath`, `evoker_dragonrage` | not on this bar |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `essence_burst` | Öz Patlaması | Geri Dönüş PRD 15 %, Yaşayan Alev PRD 20 % (max 2) | next Zümrüt Çiçek / Yankı costs 0 Öz | 15 s | `evoker_emerald_blossom`, `evoker_echo` | left, emerald |
| `merithras_blessing` | Merithra'nın Lütfu | Rüya Nefesi r ≥ 2, PRD 25 % | next Geri Dönüş / Yaşayan Alev heal bounces to the 4 lowest allies at 50 % | 30 s (12.1.5) | `evoker_reversion` | top, emerald-gold |
| `echo` | Yankı | Yankı | next heal on the ally repeats at 70 % | 20 s | – | ally frame |
| `twin_echoes` | İkiz Yankılar | Zümrüt Çiçek | next Yankı applies two | 15 s | `evoker_echo` | right, gold |
| `lifebind` | Yaşam Bağı | Yeşil Kucaklayış | 60 % of your healing on others also heals the bound ally | 8 s | – | ally frame |
| `stasis` | Durgunluk | m90 | stores next 3 heal casts | 30 s | `evoker_stasis_release` | center, blue-gold |
| `time_dilation` | Zaman Genişlemesi | m45 (on ally) | −40 % damage taken | 8 s | – | ally frame |

### c) APL (reactive, priority per GCD)

```
evoker_time_dilation       if tank_hp<0.35                                         # m45
evoker_stasis              if cdready && party_spike                                # m90 (cast the heals, then release)
evoker_stasis_release      if status:stasis && stored>=3
evoker_reversion           if ally:hp<0.85 && missing:reversion
evoker_echo                if essence>=2 && party_spike                             # opener: Echo -> Reversion
hold evoker_dream_breath@rank=2   if cdready && injured>=3
evoker_emerald_blossom     if (status:essence_burst || essence>=3) && injured>=3
evoker_verdant_embrace     if ally:hp<0.5 && cdready
evoker_living_flame        if ally:hp<0.8                                          # heal mode
evoker_living_flame        otherwise                                               # damage mode on the soft target
evoker_quell               if tcast
```

### d) Budget hand calculation (Koruyucu Nefes)

**Healing — 60 s on the 5-man stream** (units = heal coef × allies effectively healed; SimBench applies 95 % efficiency)

| ability | casts / 60 s | how | heal / cast | total heal | mana % / cast | total mana % |
|---|---:|---|---:|---:|---:|---:|
| Yaşayan Alev (şifa) `evoker_living_flame` | 4 | 1.6 s cast, 20 % Öz Patlaması; only when a single ally is hurt | 1.5 | 6 | 2.5 | 10 |
| Yaşayan Alev (düşmana) `evoker_living_flame` | 10 | damage mode while nobody is hurt (the 1.00 Yıkım row) | – | – | 2.5 | 25 |
| Geri Dönüş `evoker_reversion` | 10 | no CD (research), 12 s HoT + absorb, 15 % Öz Patlaması; mana / GCD limited | 3 | 30 | 2.2 | 22 |
| Yankı `evoker_echo` | 3 | 2 Essence, next heal on the target repeats at 70 % | 1.8 | 5.4 | 0 | 0 |
| Rüya Nefesi `evoker_dream_breath` | 2 | 30 s CD, empowered rank 2 (hold 1.33 s), ≈ 3 targets | 8.5 | 17 | 4.9 | 9.8 |
| Zümrüt Çiçek `evoker_emerald_blossom` | 3 | 3 Essence or Öz Patlaması, 3 injured allies | 7 | 21 | 5 | 15 |
| Yeşil Kucaklayış `evoker_verdant_embrace` | 2.5 | 24 s CD, heal + Lifebind (8 s, 60 % echo) | 3.4 | 8.5 | 3 | 7.5 |
| Zaman Genişlemesi `evoker_time_dilation` | 1.33 | m45: 60 / 45, −40 % damage 8 s counted as healing | 4.5 | 6 | 2 | 2.67 |
| Durgunluk `evoker_stasis` | 0.67 | m90: 60 / 90, 3 stored casts released free | 7 | 4.67 | 0 | 0 |
| **Σ** | | | | **98.6** (target 100 ±5) | | **92.0** |

Living Flame sits at the rebased 2.5 % (§0.4): at the research 12 % the 14 casts would add 133 % of the bar per minute and the gate would fail by a wide margin.
Mana: spend 92.0 %/min, regen 78.0 %/min (class base 1.0 %/s = 60/min × (1 + spec passive resourceRegenPct 0.30)) ⇒ net -14.0 %/min ⇒ after 300 s: **30.2 % left** at 100 % efficiency and **6.0 % left** at 95 % efficiency (spend ÷ 0.95 = 96.8 %/min; gate ≥ 5 %).

**Damage — 60 s** (raw, before the healer passive `damagePct −0.40`)

| source | casts | coef / cast | total |
|---|---:|---:|---:|
| Yaşayan Alev (düşmana) `evoker_living_flame` | 10 | 1.00 | 10 |
| LMB chain (parallel, all 60 s, ×2.4 spec mod: 0.82 per 1.0 s chain) | 60 chains | 0.82 | 49.2 |
| **Σ raw** | | | **59.2** × 0.60 = **35.5** (target 35) |

Time budget: GCD busy 44.6 s (incl. the 10 damage-mode Yaşayan Alev); the other 15.4 s are idle GCDs **on purpose** — mana is this spec's gate (§0.4: filling them with Living Flame would cost another 9.6 casts × 2.5 % = 24 % of the bar and break the 5 % line), the ranged chain swings the whole minute.

Öz: income ≈ 34 per minute (passive 17.1 + chain ≈ 3.6 + ≈ 4.3 Öz Patlaması worth 3 pips each) against ≈ 15 spent on Yankı and Zümrüt Çiçek — Essence never limits this spec, **mana does** (the 95 %-efficiency line above is the binding gate). Reversion has no CD in the research file, so it is limited only by mana and the GCD.

**Party buff**: Bronz Kudret, Kurt Narası, battle res.

### e) What it feels like

* **Ramp then spike-catch**: Echo → Geri Dönüş on the tank, double Geri Dönüş up on two allies, Rüya Nefesi into the group right before the hit lands, Zümrüt Çiçek on the free Öz Patlaması; Merithra'nın Lütfu bounces the next heal around.
* **Stasis**: you heal three times, three ghost icons gather beside the bar, and one press later all three land again for free — the "timed release" moment.
* **Zaman Genişlemesi** is the tank save: a gold sand glyph and the incoming hits slow to a crawl on the ally frame.
* **Signature move — Rüya Nefesi (empowered)**: hold, the evoker leans forward, emerald-gold motes gather at the mouth (`empower_charge`, green-gold); ring 1/2/3 as above; on release a **cone of drifting leaves and gold motes** (`dragon_breath_cone`, emerald, 3 s of lingering motes along the cone)
  washes over the party in 0.5 s, every ally touched gets a green-gold HoT outline whose brightness tracks the remaining HoT time (rank 3 = 12 s), heal numbers are merged per ally, **no hit-stop and no shake** (healing never uses time-stop), `dragon_breath` softened (−6 dB, pitch ×1.15) + `heal`; the HUD ally frames show a
  small dragon-breath icon with the remaining seconds, so the healer *sees* which rank was applied.

---

## 4.3 `evoker_augmentation` — Yüceltme (support DPS, WoW Augmentation)

**Passive**: none on damage (personal damage is tuned to 65 directly); `castSpeed .05, resourceRegenPct .20`. Trait `trait_augmentation` **Zamanın Ustası**: your buffs on allies use the **top-damage list** of `combat/meters.ts` (the two highest-DPS allies within 40 m; solo or duo parties buff whoever is there).
**Attribution**: the buffed damage stays on the ally's meter row; SimBench credits `buff attribution` to the Evoker via the table in §d (CORE §5.3).

### a) Kit

| slot | id | TR | WoW | cast | targeting | rng | CD / chg | cost / gen | GCD | coef · type | statuses | procs | VFX | anim | sfx |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| lmb | `evoker_basic` (+`_1.._3`) | Azur Darbesi | Azure Strike | inst chain | projectile (pierce 2) | 25 | – | finisher 6 % +1 Öz | off | 0.10 / 0.10 / 0.14 frost | – | – | azure crescents | `Spellcast_Shoot` / `…_Shoot` / `Spellcast_Raise` | `frost_cast` |
| rmb | `evoker_living_flame` | Yaşayan Alev | Living Flame | cast 1.6 s | target_projectile | 25 | – | −2.5 % mana (research 12 %, §0.4), **+0.25 Öz** | on | 0.75 fire (1.6 s cast ⇒ 0.47 coef/s, above the chain's 0.34); consumes `leaping_flames` | – | – | `fire_projectile` bronze | `Spellcast_Shoot` ×1.15 | `fire_cast` |
| q | `evoker_eruption` | Püskürme | Eruption | cast 2.0 s | target_instant + AoE r 8 | 25 | – | **−3 Öz** (0 with `essence_burst`) | on | 2.00 fire on the target, cleave 5 at 90 % (1.8 each) | **+1 s on `ebon_might`** (cap 30 s) | glow on `essence_burst` | `fire_burst` gold-green + `ground_slam`(0.5) | `Spellcast_Raise` ×1.2 | `fire_impact` |
| e | `evoker_ebon_might` | Abanoz Kudret | Ebon Might | cast 1.2 s | custom (top-2 damage allies ≤ 40 m) | 40 | 30 s | −1 % mana | on | – | `ebon_might` 20 s: allies +11 % damage; you +8 % damage | – | **NEW** `ebon_wings` (gold-green energy wings over the buffed allies) | `Spellcast_Raise` ×1.2 | `buff` `choir_sting` |
| r | `evoker_prescience` | Öngörü | Prescience | inst | target_instant ally (soft-heal resolver, max 2 active) | 25 | 12 s x2 | – | on | – | `prescience` 20 s on the ally: +13 % crit chance; each cast 30 % `essence_burst` for you | `essence_burst` | **NEW** `prescience_rune` (blue-gold rune ribbon you→ally) | `Spellcast_Shoot` ×1.8 | `buff` |
| s1 | `evoker_fire_breath` | Ateş Nefesi | Fire Breath | **emp r1/r2/r3** | custom:`empower` cone | 14 / 18 / 22 | 30 s x2 | −1.8 % mana | on | 3.40 fire at r1 (×1.25 / ×1.55) | `burn`; +rank `leaping_flames` | – | `dragon_breath_cone` fire-bronze | hold `Spellcasting` → `Spellcast_Shoot` ×1.5 | `dragon_breath` |
| s2 | `evoker_hover` | Süzül | Hover | inst | self_buff | – | 35 s x2 | – | off | – | `hover` 6 s | – | `wings_aura` bronze | `Jump_Start` | `whoosh` |
| s3 | `evoker_obsidian_scales` | Obsidyen Pullar | Obsidian Scales | inst | self_buff | – | 90 s x2 | – | off | – | `obsidian` 12 s | – | `shield_bubble` | `Cheer` | `buff` |
| s4 | `evoker_quell` | Bastır | Quell | inst | custom (`interrupt`) | 25 | 40 s | – | off | – | silence 3 s | – | `shockwave`(0.4) | `Spellcast_Shoot` | `interrupt` |
| m45 | `evoker_upheaval` | Yer Sarsıntısı | Upheaval | **emp r1/r2/r3** | custom:`empower` ground (radius 5 / 7.5 / 10) | 25 | 45 s (bucket, WoW 40) | – | on | 3.10 physical per target (no knock-up, 12.1) | – | – | `quaking_ring` gold-brown + `ground_slam` | hold `Spellcasting` → `Spellcast_Raise` | `ground_slam` `explosion`(0.3) |
| m90 | `evoker_breath_of_eons` | Çağların Nefesi | Breath of Eons | inst | dash (flight line 30 m, steerable) | 30 | 90 s (bucket, WoW 120) | – | off | 3.10 fire per target hit | `temporal_wound` 10 s on every enemy hit; banks 15 % of damage dealt by `ebon_might` allies and detonates; **grants `tip_scales`** | `tip_scales` | `wings_aura` + bronze `shockwave` + **NEW** `temporal_wound` | `Jump_Full_Long` ×0.9 | `time_warp` |
| m180 | `evoker_fury_of_aspects` | Aspectlerin Öfkesi | Fury of the Aspects | inst | self_buff (`major_hero`) | 40 | 180 s | – | off | – | `hero_haste` 40 s party | – | `hero_wave` | `Cheer` | `hero_horn` |

Dropped (slot-limited): Time Skip, Deep Breath, Blistering Scales, Zephyr, Tip the Scales (as a button). Duplicate (Apex) and the hero branches are not modelled.

**Spec mods (Yüceltme)** — base rows are Yıkım Nefesi's (§0.5):

| skill | patch / params |
|---|---|
| `evoker_living_flame` | `patch { damage: { coef: 0.75, type: 'fire' }, pip: { id: 'essence', gain: 0.25 } }` (no heal half, no `burnout`) |
| `evoker_fire_breath` | `patch { defaultSlot: 's1', damage: { coef: 3.4, type: 'fire' } }` (base: `e`, 5.60; cooldown 30 s x2, cost −1.8 % mana, ranks and `leaping_flames` are the same) |
| `evoker_basic_1` … `_3` | none (plain chain) |

### b) Procs and statuses

| id | TR | trigger | effect | dur | glow | overlay |
|---|---|---|---|---|---|---|
| `ebon_might` | Abanoz Kudret | cast | top-2 DPS allies +11 % damage, self +8 %; Püskürme +1 s each (cap 30 s) | 20 s | – | HUD buff on every buffed ally |
| `prescience` | Öngörü | cast (max 2 active) | ally +13 % crit chance; 30 % `essence_burst` per cast | 20 s | – | ally frame |
| `essence_burst` | Öz Patlaması | Öngörü 30 %, Yaşayan Alev (builds +0.25 Öz), passive Anachronism | next Püskürme costs 0 Öz | 15 s (max 2) | `evoker_eruption` | left, emerald |
| `temporal_wound` | Zamansal Yara | Çağların Nefesi (debuff on enemies) | banks 15 % of damage taken from `ebon_might` allies; detonates when it ends | 10 s | – | target-frame own debuff (bronze clock) |
| `tip_scales` | Terazi Eğimi | Çağların Nefesi | next empowered spell instantly at rank 3 | 30 s | `evoker_fire_breath` | top, gold |
| `leaping_flames` | Sıçrayan Alevler | Ateş Nefesi ranks | Yaşayan Alev +1 target per stack | 20 s | – | – |

### c) APL

```
# ST (and AoE: same list, empowered ranks raised)
evoker_fury_of_aspects     if party_wants_haste                                    # m180
evoker_ebon_might          if !status:ebon_might || remaining:ebon_might<=5              # keep it rolling, Eruption extends it
evoker_prescience          if charges>=2 || missing:prescience
evoker_breath_of_eons      if cdready && allies_cds_up                          # m90, opener: Ebon Might, Breath of Eons, Fire Breath with Tip the Scales
hold evoker_fire_breath@rank=1    if cdready || status:tip_scales                   # AoE: rank=3
hold evoker_upheaval@rank=1       if cdready                                        # AoE: rank so that every enemy is inside the radius
evoker_eruption            if status:essence_burst>=2 || essence>=3
evoker_prescience          if charges>=1
evoker_living_flame                                                                    # filler, builds Öz
evoker_quell               if tcast
```

### d) Budget hand calculation (Yüceltme)

**Personal damage** (target 65 ±5 ST, 146 ±16 AoE8):

**ST — 60 s, 1 target, 0 haste / 0 crit** (GCD 1.0 s; LMB = parallel chain, §0.5)

| ability | casts / 60 s | how | coef / cast | total |
|---|---:|---|---:|---:|
| Püskürme `evoker_eruption` | 9 | 3 Essence, 2.0 s cast | 2 | 18 |
| Yaşayan Alev `evoker_living_flame` | 19.3 | 1.6 s filler, +0.25 Essence, takes every GCD the others leave (30.9 s) | 0.75 | 14.48 |
| Ateş Nefesi `evoker_fire_breath` | 2 | 2 charges / 30 s ⇒ 2, rank 1 | 3.4 | 6.8 |
| Yer Sarsıntısı `evoker_upheaval` | 1.33 | m45 slot, CD 45: 60 / 45, rank 1 | 3.1 | 4.12 |
| Çağların Nefesi `evoker_breath_of_eons` | 0.67 | m90: 60 / 90 (own hit only; the bank is in the buff table) | 3.1 | 2.08 |
| Abanoz Kudret `evoker_ebon_might` | 2 | 30 s CD ⇒ 2, 1.2 s cast, no damage | 0 | 0 |
| Öngörü `evoker_prescience` | 5 | 2 charges / 12 s ⇒ 5, instant, no damage | 0 | 0 |
| LMB chain (parallel, all 60 s, ranged pierce 2) | 60 chains | 0.34 per chain = 0.34 / s | – | 20.4 |
| **Σ raw** | | | | **65.9** (target 65) |

**AoE8 — 30 s pull, 8 targets** (totals are summed over all targets; **rank-3 holds count their full 2.0 s**, §4.0.1)

| ability | casts / 30 s | targets | coef / target | total |
|---|---:|---:|---:|---:|
| Püskürme `evoker_eruption` — cleave 5 at 90 % | 5 | 5 | 1.8 | 45 |
| Yaşayan Alev `evoker_living_flame` — filler on 2 targets (Leaping Flames), the leftover 12.3 s | 7.7 | 2 | 0.44 | 6.78 |
| Ateş Nefesi `evoker_fire_breath` — rank 3 cone | 1 | 8 | 3.05 | 24.4 |
| Yer Sarsıntısı `evoker_upheaval` — 40 / 45, rank 3 radius | 0.9 | 8 | 3.1 | 22.32 |
| Çağların Nefesi `evoker_breath_of_eons` — 40 / 90 | 0.44 | 8 | 2.5 | 8.8 |
| LMB chain (parallel, 30 s, pierce 2 ⇒ 3 targets) | 30 chains | 3 | 0.34 per chain (10.2 per target) | 30.6 |
| **Σ raw** | | | | **137.9** (target 146) |

Time budget (GCD seconds): ST — Püskürme 18.0 + Yaşayan Alev 30.9 + Ateş Nefesi 2.0 + Yer Sarsıntısı 1.3 + Abanoz Kudret 2.4 + Öngörü 5.0 + Çağların Nefesi 0.3 = **60.0 s**; AoE — Püskürme 10.0 + Yaşayan Alev 12.3 + Ateş Nefesi hold 2.0 + Yer Sarsıntısı hold 1.8 + Abanoz Kudret 1.2 + Öngörü 2.5 + Çağların Nefesi 0.2 = **30.0 s** (the previous 25.5 s under-charged the rank-3 holds).
Resource check per window — essence ST in 30.0 (passive 17.1 + Yaşayan Alev 4.8 + chain 3.6 + Öngörü 30 % bursts 4.5) / out 27 (9 × 3), AoE in 14.6 (8.6 + 1.9 + 1.8 + 2.25) / out 15; mana ST ≈ 54 % of the bar (Yaşayan Alev 19.3 × 2.5 + Ateş Nefesi 3.6 + Abanoz Kudret 2) against a 72 % regen.

**Attributed buff value on two median DPS** (each deals 100 per 60 s in ST, 225 per 30 s in the AoE pull; pair = 200 / 450). Target: personal + attributed = 100 % ±3 %.

| buff | model | ST per 60 s (pair 200) | AoE8 per 30 s (pair 450) |
|---|---|---:|---:|
| Abanoz Kudret `+11 %` | 20 s + 1 s per Püskürme (9/min ⇒ 4.5 per 30 s): uptime **82 %** | 200 × 0.11 × 0.82 = **18.0** | 450 × 0.11 × 0.82 = **40.6** |
| Öngörü `+13 % crit` = +6.5 % damage | 5 casts × 20 s = 100 ally-seconds of 120 ⇒ uptime **83 %** | 200 × 0.065 × 0.83 = **10.8** | 450 × 0.065 × 0.83 = **24.3** |
| Çağların Nefesi bank | window 10 s, the two allies' damage × 2.0 (their cooldowns are aligned to it), bank 15 % | 2 × 1.667 × 10 × 2.0 × 0.15 = 10.0 × (60/90 = 0.667) = **6.7** | 2 × 7.5 × 10 × 2.0 × 0.15 = 45 × (40/90 = 0.444) = **20.0** |
| **Σ attributed** | | **35.5** (rule ≥ 35 ✓) | **84.9** |
| personal | | 65.9 | 137.9 |
| **personal + attributed** | | **101.4** (100 ±3 ✓) | **222.8** (target 225 ±3 % ⇒ 218–232 ✓) |

**Party buff**: Bronz Kudret (+3 % haste, not stacked with a second Evoker), Kurt Narası, battle res; the active buffs above are *on top* of the class aura.

### e) What it feels like

* **You are the conductor**: Abanoz Kudret on the two best damage dealers, Öngörü on both, Çağların Nefesi right when their cooldowns pop; the Evoker's own bar is a steady Püskürme–Yaşayan Alev drumbeat that keeps Abanoz Kudret alive.
* **The bank pays out**: after 10 s every wounded enemy flashes a bronze clock ring and the stored damage detonates in one big merged number — the moment the party sees the Evoker's contribution.
* **Signature move — Abanoz Kudret**: `Spellcast_Raise` ×1.2 (1.2 s cast), the evoker spreads the wings and a **gold-green energy wing pair** (**NEW** `ebon_wings`, two additive feather sprites that unfold over 0.25 s) appears on the two buffed allies' backs,
  linked to the caster by a thin gold ribbon that fades after 0.6 s; each buffed ally's name plate shows a tiny `ebon_might` icon with a bronze countdown ring, and every Püskürme visibly *feeds* the ring (+1 s tick pulse); the cast ends with a soft `choir_sting` + `buff`, no camera effects.

---

# f) Skill-id migration table (group-wide)

**Policy.** Monk and Archer skillsets are compile-only stubs (`data/skillsets/monk*.ts`, `archer*.ts` are empty `register*` functions), so no old row exists in `SKILLS`: the "old ids" are the ids named in GDD_CLASSES_V2 §2–§3, `data/classes.ts`,
`data/skills_class_utils.ts` (the 4 real utility rows) and the talent data (`docs/GDD_TALENTS.trees.json` → generated `src/data/talentTrees/raw/{monk,archer}.ts`, `src/data/skillSpecs.ts`). **kept** = same id, retuned to this file;
**renamed** = new id for the same WoW ability; **dropped** = not authored in this pass (id reserved, any `G` / `M` / `T` node pointing at it is re-pointed below; a later wave may author it as a book skill).
İblis Avcısı and Ejderhasoy have no old ids and no talent trees yet (seeds in §f.3). Every spec-bound skill gets `SkillDef.spec`; class-level ones keep `classId` only.

## f.1 Skill ids

| old id (source) | decision | new id / target and what changed |
|---|---|---|
| `monk_basic` + `_1.._4` | **kept (retuned)** | coefs 0.78/0.82/1.22/1.74 → 0.08/0.08/0.11/0.16 (tempo 1.265 s, 0.34 coef/s, parallel chain §0.5); Sis Dokuyan `mods` ×1.9 (0.15/0.15/0.21/0.30); per-spec Enerji / Çi / Teachings hooks in `combat/specs/monk.ts` |
| `monk_tiger_palm` | **kept (retuned)** | 2.2 coef / 20 Enerji / +2 Çi → **base row = Rüzgâr Yürüyen** (0.85 coef, −50 Enerji, +2 Çi); Demci `mods` (0.65 coef, −25 Enerji, no Çi); `blackout_combo`, `combo_breaker` hooks |
| `monk_chi_torpedo` | **kept (retuned)** | dash 12 m CD 9 → 2 charges × 10 s; no Enerji gain; slot q → `s2` |
| `monk_spinning_crane` | **kept** | slot e → `s1`; **base row = WW** (2.10 per target, 2 Çi); Sis Dokuyan `mods` (1.65, no slot, reached through `replaces`); absent from the Demci bar |
| `monk_blackout_kick` | **kept (retuned)** | s1 → `q`; 3.0 → **base row = Rüzgâr Yürüyen** (0.95 coef, 1 Çi, Combo Breaker free); Demci `mods` (0.85, no Çi); CD 2.5 → 3 s; `cdrOnCast` on RSK / FoF |
| `monk_fists_of_fury` | **kept (WW only)** | ultimate (60 s, 3.0 s) → `r`, 24 s CD, 3.2 s channel, 5.35 total; `params.dr` 0.3 → 0.15, `finalCoef` 3.0 → 0.95 (kept so the class-tree nodes still resolve) |
| `monk_rising_sun_kick` | **kept (retuned)** | **base row = WW** (`e`, 10 s, 2.50, −2 Çi); Sis Dokuyan `mods` (`s1`, 12 s, 1.5 coef + Jadefire heal, mana cost, `replaces` → Dönen Turna); 6.5 → 2.50 |
| `monk_whirling_dragon` | **kept** | WW spec2 L15 → `m45` (CD 14 → 45 s); 4.0 → 4.60 per target |
| `monk_provoke` | **kept** | Demci `s1` (was spec1 + q) |
| `monk_keg_smash` | **kept (retuned)** | 2.8 → 2.80, CD 8 s, 40 Enerji; slot → `e` |
| `monk_purifying_brew` | **kept (retuned)** | Çi cost 1 → none; 2 charges × 18 s; slot → `s3` |
| `monk_bm_black_ox` | **kept** | m90, `monk_black_ox` minion kept (rhino model) |
| `monk_bm_fortifying_brew` | **renamed** | → `monk_fortifying_brew` (class skill; **base row = Sis Dokuyan** `s3` / 120 s; Demci `mods` `m180` / 180 s; `params.major` is never set) |
| `monk_ww_tigers_fury` | **dropped** | Zirve (`zenith`) is part of `monk_invoke_xuen` |
| `monk_ww_storm_earth_fire` | **renamed** | → `monk_invoke_xuen` (clones `monk_clone_fire` / `_earth` dropped, new minion `monk_xuen`) |
| `monk_flying_serpent` | **dropped** | route `monk_basic_3 → flying serpent` of GDD_CLASSES_V2 §1.4 dropped; mobility is `monk_chi_torpedo` |
| `monk_chi_wave` | **dropped** | WoW Chi Burst/Wave is a talent not in the research file; talent / skillSpec rows re-pointed |
| `monk_tigers_lust` | **dropped** | talents re-pointed to `monk_chi_torpedo` |
| `monk_mw_soothing_mist` | **dropped** | `monk_mw_vivify` is the rmb heal |
| `monk_mw_renewing_mist` | **kept (retuned)** | 2 charges × 8 s, HoT 2.8 / 20 s, jumps 2× |
| `monk_mw_detox` | **dropped** | dispel folded into Diriliş and the empowered Canlandırma |
| `monk_mw_enveloping_mist` | **kept** | cast 1.4 → 1.6 s (WoW 2.0 × 0.8), 4.6 HoT |
| `monk_mw_vivify` | **kept (retuned)** | cone heal → single heal with 2 Renewing-Mist carriers; now the rmb filler heal |
| `monk_mw_thunder_tea` | **kept (retuned)** | m45 → `r`, CD 45 → 30 s |
| `monk_mw_revival` | **kept** | m90 → `m180` (CD 180) |
| `monk_mw_basic` | **dropped** | MW uses `monk_basic` + Sis Esintisi |
| `monk_spear_hand` (real row, `skills_class_utils.ts`) | **kept (retuned)** | s05 grant → baseline L10 `s4`; row cost 15 → 0, silence 4 → 3 |
| `monk_touch_of_karma` (real row) | **kept** | baseline `s3` for Rüzgâr Yürüyen; `s05B` pick for the other specs |
| `mk_*` (heavy / run / jump / roll / riposte, `layerMonkArcher.ts`) | **kept untouched** | GDD_CLASSES_V2 §1.12 |
| **new monk ids** | – | `monk_celestial_brew`, `monk_breath_of_fire`, `monk_invoke_xuen`, `monk_touch_of_death`, `monk_mw_life_cocoon`, `monk_mw_invoke_yulon`, `monk_fortifying_brew`, minion `monk_xuen` |
| `archer_basic` + `_1.._4` | **kept (retuned)** | 0.58 / 0.38×2 / 0.95 / 1.30 → 0.06 / 0.04×2 / 0.10 / 0.14 (0.34 coef/s, parallel chain §0.5); +1 Odak per hit |
| `archer_aimed_shot` | **kept (retuned)** | charge-shot (`chargeMax`) → **2.0 s hard cast**, 12 s CD, grants Kesin Atışlar; slot rmb → `q` (MM only) |
| `archer_disengage` | **kept** | slot q → `s2`, CD 9 → 20 s |
| `archer_multishot` | **kept (BM only)** | slot e → Av Ustası `s1`; Beast Cleave applier |
| `archer_rapid_fire` | **kept (retuned)** | MM `e`, 16 s CD, 1.6 s channel, no Focus cost |
| `archer_kill_shot` | **kept (retuned)** | MM `s1`, requires target HP < 20 % (was 25 %) |
| `archer_kill_command` | **kept (retuned)** | BM `q`, 2 charges × 7.5 s; the bleed moved to Dikenli Ok |
| `archer_ms_trueshot` | **kept** | MM `m90` (CD bucket 120 → 90) |
| `archer_bm_bestial_wrath` | **kept** | BM `m45` |
| `archer_bm_pack_hunt` | **kept** | BM `m90` (Call of the Wild analogue) |
| `archer_muzzle` (real row) | **kept (retuned)** | `s4`, CD 20 → 24 s |
| `archer_feign_death` (real row) | **kept** | `s05B` tree-granted, not in a default bar |
| `archer_explosive_arrow` | **renamed** | → `archer_explosive_shot` (MM `r`, 30 s, 3-tick fire DoT) |
| `archer_arrow_storm` | **renamed** | → `archer_volley` (MM `m45`, 6 s rain) |
| `archer_serpent_sting` | **renamed** | → `archer_barbed_shot` (poison arrow → bleed arrow, 2 charges, +20 Odak) |
| `archer_call_pet` | **dropped** | the pet is automatic (spawn, 10 s auto-return, healed by `archer_exhilaration`) |
| `archer_snare_trap` | **dropped** | traps are not in the research file; talents re-pointed |
| `archer_hunters_mark` | **dropped** | not part of the Midnight S2 core loops |
| `archer_ms_deadeye` | **dropped** | has no WoW counterpart |
| `ar_*` layer rows | **kept untouched** | – |
| minions `archer_wolf`, `archer_bear`, `archer_wolf_ally`, `archer_hawk` (stub) | **kept** | unchanged |
| **new archer ids** | – | `archer_steady_shot`, `archer_arcane_shot`, `archer_exhilaration`, `archer_primal_rage`, `archer_cobra_shot`, `archer_wild_thrash` (+ the three renames) |
| all `demonhunter_*` (27 ids incl. the 5 chain rows, §3) and `evoker_*` (29 ids incl. the 4 chain rows, §4) | **new** | no migration |

**Status ids** (union in `types/skills.ts`, `StatusDef` in `data/statuses.ts` / the new `data/statuses_kit_<class>.ts`): kept `chi_flow` `fortifying` `stagger_pool` `trueshot` `wild_wrath`; dropped `tigerlust` `tigerfury` `hunters_mark` `deadeye`; renamed `brewed` → `keg_mark`.
New (≈ 54, all appended by AE-0 with a stub `StatusDef`; the hidden watcher `exec_window` is shared with the casters-rogue kit doc): monk `shuffle blackout_combo purified_chi one_more_round keg_mark combo_breaker dance_of_chiji heart_of_jade zenith vivacious_vivification thunder_focus teachings renewing_mist enveloped yulon_window mystic_touch` ·
archer `precise_shots trick_shots frenzy beast_cleave barbed howl_of_pack eagle_eye` · İblis Avcısı `metamorphosis metamorphosis_v initiative exergy essence_break chaos_brand blur soul_overflow demon_spikes fiery_brand frailty the_hunt` ·
Ejderhasoy `essence_burst leaping_flames burnout iridescence tip_scales dragonrage unbound_flame hover obsidian merithras_blessing echo twin_echoes lifebind stasis time_dilation ebon_might prescience temporal_wound bronze_blessing battle_res`.

## f.2 Talent nodes that reference a changed or dropped id (monk + archer)

Node id = `tree/slot+opt` of `docs/GDD_TALENTS.trees.json` (the generated `raw/*.ts` and the live `TREES` follow it). The JSON is the source of truth: edit it, then `node tools/gen-talent-data.mjs`, then `node tools/talents-check.mjs`
(unknown skill ids are errors there). 48 rows; every other monk / archer node is unchanged (their skills are kept; params that no longer matter are inert).

| node id (`tree/slot+opt`) | node | old fx | new fx | why |
|---|---|---|---|---|
| `class:archer/s05A` | (grant) | `G archer_muzzle` | `M archer_muzzle cd=-4` | was `G archer_muzzle` (grant). Muzzle is now a baseline L10 unlock (`SpecDef.unlock`); node gets name "Keskin Susturucu", desc "Susturucu Ok bekleme −4 sn". `s05B G archer_feign_death` is unchanged. |
| `class:archer/s12` | Av Çağrısı | `M archer_call_pet cd=-2 p.mend*=1.5` | `M archer_exhilaration cd=-10 healx=1.5` | Yoldaş Çağır dropped (pet is automatic); the pet-heal talent moves onto Canlanma (heals the pet too). Name "Av Çağrısı" kept. |
| `class:archer/s13` | Pençe Ustası | `M archer_snare_trap cd=-3 radx=1.2` | `M archer_disengage cd=-3 radx=1.2` | Pençe Tuzağı dropped; the utility talent now improves Geri Sıçrayış (take-off slow ring r +20 %). |
| `class:archer/s18` | Patlayıcı Uç | `M archer_explosive_arrow radx=1.2 dmgx=1.1` | `M archer_explosive_shot radx=1.2 dmgx=1.1` | rename `archer_explosive_arrow` → `archer_explosive_shot` (MM only; inert for Av Ustası). |
| `class:archer/s21` | Uzun İşaret | `M archer_hunters_mark sdur=hunters_mark:+6 cd=-6` | `M archer_muzzle cd=-4 p.silence+=1` | Avcı İşareti dropped; "Uzun İşaret" becomes a longer silence (`params.silence` 3 → 4) + shorter CD on Susturucu Ok (both specs have it). Duplicates s05A on purpose: s05A is an A/B pick, s21 is a plain node. |
| `class:archer/s25` | Tuzak Ustalığı | `M archer_snare_trap dmgx=1.25 p.trapMax+=1` | `M archer_disengage dmgx=1.25` | Tuzak Ustalığı: `p.trapMax` no longer exists; free arrow of Geri Sıçrayış +25 %. |
| `class:archer/s26A` | Av Sürüsü | `T cast:archer_call_pet => st(near(10),haste,5)` | `T cast:archer_primal_rage => st(near(10),haste,5)` | Av Sürüsü: was on Yoldaş Çağır; now on the hero button (both specs). |
| `class:archer/s26B` | Tuzak Ağı | `M archer_snare_trap sdur=root:+1.5` | `M archer_disengage sdur=slow:+1.5` | Tuzak Ağı: root → slow of the take-off ring. |
| `class:archer/s27` | Ok Yağmuru | `M archer_arrow_storm cdx=.85 radx=1.2` | `M archer_volley cdx=.85 radx=1.2` | rename `archer_arrow_storm` → `archer_volley` (MM only). |
| `class:archer/s30B` | Sürü Efendisi | `S minionDamagePct=.20 minionHpPct=.20 ;; M archer_call_pet cdx=.7` | `S minionDamagePct=.20 minionHpPct=.20 ;; M archer_exhilaration cdx=.7` | Sürü Efendisi: second half moves to Canlanma. |
| `spec:archer_marksman/s02A` | Hızlı Çekiş | `M archer_aimed_shot p.chargeMax*=0.85` | `M archer_aimed_shot castx=.85` | Aimed Shot is a 2.0 s hard cast now (no `chargeMax`): Hızlı Çekiş = cast time −15 %. |
| `spec:archer_marksman/s04` | Uzun Seri | `M archer_rapid_fire dmgx=1.2 costx=.85` | `M archer_rapid_fire dmgx=1.2 cdx=.9` | Seri Ateş has no Focus cost now: `costx` → `cdx`. |
| `spec:archer_marksman/s12` | Tüfek Atışı | `M archer_multishot cnt=+2 dmgx=1.1` | `M archer_arcane_shot dmgx=1.15` | Marksman has no Çoklu Atış on its bar: "Tüfek Atışı" now buffs Gizem Atışı (`cnt=+2` dropped). |
| `spec:archer_marksman/s13` | Ağır Patlama | `M archer_explosive_arrow dmgx=1.2 radx=1.1` | `M archer_explosive_shot dmgx=1.2 radx=1.1` | rename `archer_explosive_arrow` → `archer_explosive_shot`. |
| `spec:archer_marksman/s15A` | Keskin Nişan Ustası | `M archer_ms_deadeye sdur=deadeye:+4` | `M archer_ms_trueshot sdur=trueshot:+4` | Keskin Nişan (`archer_ms_deadeye`) dropped: node boosts Tam İsabet (+4 s). |
| `spec:archer_marksman/s18` | Uzun Bakış | `M archer_hunters_mark sdur=hunters_mark:+6` | `M archer_ms_trueshot sdur=trueshot:+3` | Avcı İşareti dropped: "Uzun Bakış" → +3 s Tam İsabet (s15B is the A/B alternative of s15A; s18 is a plain node, so +3 s stacks only with the pick). |
| `spec:archer_marksman/s20` | Nişancı Zamanı | `M archer_ms_deadeye+archer_ms_trueshot cdx=.9` | `M archer_volley+archer_ms_trueshot cdx=.9` | `archer_ms_deadeye` → `archer_volley` (the two MM majors). |
| `spec:archer_marksman/s25` | Kasırga Fırtınası | `M archer_arrow_storm dmgx=1.2 cdx=.9` | `M archer_volley dmgx=1.2 cdx=.9` | rename `archer_arrow_storm` → `archer_volley`. |
| `spec:archer_marksman/s26B` | Gözcü | `T cast:archer_hunters_mark => st(near(20),empower,5)` | `T cast:archer_volley => st(near(20),empower,5)` | Avcı İşareti dropped: Gözcü triggers on Ok Yağmuru. |
| `spec:archer_beastmaster/s02B` | Kanlı Isırık | `M archer_kill_command dotx=1.4 sdur=bleed:+3` | `M archer_barbed_shot dotx=1.4 sdur=bleed:+3` | Kill Command no longer applies the bleed (Dikenli Ok does); id `archer_kill_command` itself is kept. |
| `spec:archer_beastmaster/s05` | (grant) | `G archer_serpent_sting` | `G archer_barbed_shot` | rename `archer_serpent_sting` → `archer_barbed_shot` (poison arrow → bleed arrow with 2 charges). |
| `spec:archer_beastmaster/s11` | Zehir Yayılımı | `M archer_serpent_sting dmgx=1.2 p.spreadOnDeath+=1` | `M archer_barbed_shot dmgx=1.2 dotx=1.15` | `p.spreadOnDeath` dropped (poison jump); "Zehir Yayılımı" → bleed damage. |
| `spec:archer_beastmaster/s12` | Hızlı Çağrı | `M archer_call_pet cd=-2` | `M archer_exhilaration cd=-10` | Hızlı Çağrı: Yoldaş Çağır dropped → Canlanma recharge. |
| `spec:archer_beastmaster/s13` | Tuzak Ustası | `M archer_snare_trap dmgx=1.25 dotx=1.3` | `M archer_barbed_shot dmgx=1.25 dotx=1.3` | Tuzak Ustası: trap dropped → Dikenli Ok (bleed DoT) — fits "dotx". |
| `spec:archer_beastmaster/s30B` | Zehir Avcısı | `S poisonDamagePct=.25 dotPct=.10 ;; M archer_serpent_sting dmgx=1.2` | `S bleedDamagePct=.25 dotPct=.10 ;; M archer_barbed_shot dmgx=1.2` | poison → bleed; `archer_serpent_sting` → `archer_barbed_shot`. |
| `class:monk/s05A` | (grant) | `G monk_spear_hand` | `M monk_spear_hand cd=-3` | was `G monk_spear_hand`; Mızrak Eli is a baseline L10 unlock for all three specs. Name "Keskin Mızrak", desc "Mızrak Eli bekleme −3 sn". `s05B G monk_touch_of_karma` unchanged (Rüzgâr Yürüyen has it baseline; Demci / Sis Dokuyan may pick it). |
| `class:monk/s18` | Ejder Atılışı | `M monk_flying_serpent cd=-2 radx=1.2` | `M monk_chi_torpedo cd=-2 radx=1.2` | Uçan Yılan dropped; the dash-landing talent moves onto Çi Torpidosu (landing ring). |
| `class:monk/s21` | Sekme Ustası | `M monk_chi_wave p.bounces+=1 p.bounceMult*=1.05` | `M monk_spinning_crane radx=1.15 dmgx=1.1` | Çi Dalgası dropped (bounce params gone): "Sekme Ustası" → Dönen Turna (Demci and Rüzgâr Yürüyen; inert for Sis Dokuyan outside Chi-Ji Dansı). |
| `class:monk/s25` | Uzun Hırs | `M monk_tigers_lust sdur=tigerlust:+3 cd=-8` | `M monk_chi_torpedo cd=-3 sdur=chi_flow:+1` | Kaplan Hırsı dropped: "Uzun Hırs" lengthens Akış and shortens Çi Torpidosu. |
| `class:monk/s26A` | Tekke Kardeşliği | `T cast:monk_tigers_lust => st(near(10),haste,5)` | `T cast:monk_chi_torpedo => st(near(10),haste,5)` | Tekke Kardeşliği now triggers on Çi Torpidosu. |
| `spec:monk_brewmaster/s09B` | Sarhoş Duruş | `X trait_brewmaster{parryPurge=.10}` | `X trait_brewmaster{parryPurge=.10}` | kept: new trait param `parryPurge` (a successful parry purges 15 % → 10 % more) must exist in `trait_brewmaster` (§1.1). |
| `spec:monk_brewmaster/s12` | Kızıl Pınar | `M monk_keg_smash dmgx=1.15 sdur=brewed:+4` | `M monk_keg_smash dmgx=1.15 sdur=keg_mark:+4` | `brewed` → `keg_mark`. |
| `spec:monk_brewmaster/s18` | Yumuşak Vuruş | `X trait_brewmaster{poolDecay=-.1}` | `X trait_brewmaster{poolDecay=-.1}` | kept: trait param `poolDecay` (drain tick fraction 0.05 → 0.055). |
| `spec:monk_brewmaster/s20` | Karanlık Pınar | `M monk_bm_fortifying_brew+monk_bm_black_ox cdx=.9` | `M monk_fortifying_brew+monk_bm_black_ox cdx=.9` | rename `monk_bm_fortifying_brew` → `monk_fortifying_brew`. |
| `spec:monk_brewmaster/s25` | İksir Ustalığı | `M monk_bm_fortifying_brew sdur=fortifying:+5 healx=1.25` | `M monk_fortifying_brew sdur=fortifying:+5 healx=1.25` | rename. |
| `spec:monk_brewmaster/s27` | Demir Yumruklar | `M monk_fists_of_fury p.threatMult*=1.3 p.dr+=.1` | `M monk_keg_smash p.threatMult*=1.3 dmgx=1.1` | Cennet Yumrukları is not on the Demci bar: "Demir Yumruklar" now buffs Fıçı Darbesi (`p.dr` dropped). |
| `spec:monk_windwalker/s02B` | Uzun Öfke | `M monk_ww_tigers_fury sdur=tigerfury:+4` | `M monk_invoke_xuen sdur=zenith:+4` | `monk_ww_tigers_fury` / `tigerfury` dropped, Zirve is part of Xuen. |
| `spec:monk_windwalker/s13` | Yılan Atılışı | `T cast:monk_flying_serpent => pip(chi,1)` | `T cast:monk_chi_torpedo => pip(chi,1)` | Uçan Yılan → Çi Torpidosu. |
| `spec:monk_windwalker/s15A` | Fırtına Ustası | `M monk_ww_storm_earth_fire sdur=empower:+5` | `M monk_invoke_xuen sdur=zenith:+5` | `monk_ww_storm_earth_fire` → `monk_invoke_xuen`, status `empower` → `zenith`. |
| `spec:monk_windwalker/s15B` | Aslan Yürek | `T cast:monk_ww_tigers_fury => buff(tiger_crit,12,{critChance=.08})` | `T cast:monk_invoke_xuen => buff(tiger_crit,12,{critChance=.08})` | `monk_ww_tigers_fury` → `monk_invoke_xuen`. |
| `spec:monk_windwalker/s20` | Rüzgâr Yürüyüşçüsü | `M monk_ww_tigers_fury+monk_ww_storm_earth_fire cdx=.9` | `M monk_whirling_dragon+monk_invoke_xuen cdx=.9` | the two old WW majors → the new m45 / m90 pair. |
| `spec:monk_windwalker/s25` | Rüzgâr Dalgası | `M monk_chi_wave dmgx=1.2 pip=chi:1` | `M monk_blackout_kick dmgx=1.2 crit=+.05` | Çi Dalgası dropped: "Rüzgâr Dalgası" → Kara Tekme (`pip=chi:1` removed: Tiger Palm already gives +2). |
| `spec:monk_windwalker/s26A` | Kopya Ustası | `T cast:monk_ww_storm_earth_fire => buff(clone_edge,15,{minionDamagePct=.25})` | `T cast:monk_invoke_xuen => buff(xuen_edge,20,{minionDamagePct=.25})` | clones → Xuen; `clone_edge` → `xuen_edge`. |
| `spec:monk_windwalker/s26B` | Rüzgâr Dostu | `T cast:monk_ww_tigers_fury => st(near(10),haste,6)` | `T cast:monk_invoke_xuen => st(near(10),haste,6)` | `monk_ww_tigers_fury` → `monk_invoke_xuen`. |
| `spec:monk_mistweaver/s02A` | Sakin Sis | `M monk_mw_soothing_mist healx=1.2` | `M monk_mw_vivify healx=1.2` | `monk_mw_soothing_mist` dropped (Vivify is the rmb heal). |
| `spec:monk_mistweaver/s04` | Sis Okşaması | `M monk_mw_soothing_mist costx=.85` | `M monk_mw_vivify costx=.85` | same. |
| `spec:monk_mistweaver/s09A` | Arınma Pınarı | `M monk_mw_detox cd=-2 p.dispel+=1` | `M monk_mw_thunder_tea cd=-3` | `monk_mw_detox` dropped; the dispel is carried by Diriliş and the empowered Canlandırma (`p.dispel` gone). |
| `spec:monk_mistweaver/s15B` | Sis Dalgası | `T heal:monk_mw_soothing_mist ch=.1 => healally(.04)` | `T heal:monk_mw_vivify ch=.1 => healally(.04)` | same. |

**Not changed on purpose**: the `s05` grant nodes `spec:monk_brewmaster/s05 G monk_purifying_brew`, `spec:monk_windwalker/s05 G monk_whirling_dragon`, `spec:monk_mistweaver/s05 G monk_mw_vivify`, `spec:archer_marksman/s05 G archer_kill_shot` stay valid and follow the mage precedent
(`SpecDef.treeSkills: { mage_phoenix_flames: 's05' }`): the skill is on the default bar but only usable once the node is taken; `SpecDef.treeSkills` is filled for these four. **Class-tree nodes that point at a skill missing from the active spec's bar are inert for that spec**
(e.g. Cennet Yumrukları nodes for Demci / Sis Dokuyan, Çoklu Atış nodes for Nişancı): accepted for now, listed as an open question.

**`skillSpecs` rows** (`data/skillSpecs.ts`, the per-skill tier A/B upgrades; 12 rows need an id change):
`archer_explosive_arrow` × 6 rows → `archer_explosive_shot` (ids rename only); `monk_chi_wave` × 6 rows (`Hızlı Dalga`, `Şifa Dalgası`, `Çatallı Dalga`, `Dönen Dalga`, `Ateş Dalgası`, `Zehir Dalgası`) → skill `monk_rising_sun_kick` (names "Hızlı Tekme", "Şifa Tekmesi", "Çatallı Tekme", "Dönen Tekme",
"Ateş Tekmesi", "Zehir Tekmesi"; `healally` row stays as is). `monk_tiger_palm`, `monk_blackout_kick`, `archer_aimed_shot`, `archer_multishot` rows are unchanged.

## f.3 Talent seeds for the new classes (GDD_TALENTS authors; no tree exists yet)

Per spec 4 hooks the kit already exposes (class trees follow the 9-class pattern; both new classes need `class:demonhunter` / `class:evoker` and 5 spec trees before the talent panel lists them):
`demonhunter_chaos`: `M demonhunter_eye_beam cd=-3`, `T cast:demonhunter_vengeful_retreat => buff(initiative_plus,6,{critChance=.1})`, `M demonhunter_essence_break dur=+1`, `X trait_havoc{furyRegen=+1}` ·
`demonhunter_vengeance`: `M demonhunter_fiery_brand chg=+1`, `X trait_vengeance{soulPer10s=+0.5}`, `M demonhunter_spirit_bomb dmgx=1.2`, `T cast:demonhunter_demon_spikes => healally(.03)` ·
`evoker_devastation`: `M evoker_fire_breath shape=…` (rank-1 cone +4 m), `M evoker_disintegrate dmgx=1.15`, `T cast:evoker_dragonrage => pip(essence,2)`, `M evoker_pyre radx=1.2` ·
`evoker_preservation`: `M evoker_reversion chg=+1`, `X trait_preservation{echoPct=+.1}`, `M evoker_dream_breath healx=1.15`, `M evoker_stasis cdx=.9` ·
`evoker_augmentation`: `M evoker_ebon_might dur=+4`, `M evoker_prescience chg=+1`, `X trait_augmentation{bankPct=+.03}`, `M evoker_breath_of_eons cdx=.9`.

---

# g) New engine needs beyond CORE_MECHANICS §10 / COMBAT_WOW (kept short, each justified)

Everything not listed here is covered by CM13 / CW (GCD profiles, queue, procs + overlay, glow, `replaces`, `requires`, `procInstant`, `offGcd`, `target_projectile` / `target_instant`, pushback, lockout, combat text, cast bars).

### g.1 Empowered hold-to-charge — the one new spell mechanic (justified: 5 of the 36 Evoker buttons and the class identity)

* `SkillDef.empower?: { ranks: 3; hold: [number, number, number]; maxHold?: number }` (append-only) and `behavior 'empower'` (`combat/skills/empower.ts`). It reuses the **existing channel hold loop** of `SkillSystem` (`ch.slot` / key-up release, line ≈ 1418) — no new input action: the rank is
  `floor` of the thresholds crossed, passed to the spell's real effect through `ctx.data.rank`; below rank 1 the action is cancelled without cost / cooldown; `tip_scales` skips the hold at rank 3; haste divides the thresholds; pushback does not delay them; stun / lockout cancels.
  Used by Ateş Nefesi (Yıkım, Yüceltme), Ebedi Dalga, Rüya Nefesi, Yer Sarsıntısı.
* HUD: the CW-17 cast bar gets 3 rank notches while an `empower` skill is held (`cast:rank {skillId, rank}` event) and a rank pip above the action button.

### g.2 Other engine changes (each is small and has a named consumer)

| # | change | consumer(s) | why it cannot be data only |
|---|---|---|---|
| 1 | `behavior 'channel_beam'`: channel with per-tick re-aim (target-tracking or facing), line or cone shape, per-tick resource gain, `moveSlow`, unstoppable (extends existing `beam` + `channel`) | Parçala, Göz Işını, Fel Yıkımı | `beam` fires along the aim captured at cast start and has no re-aim |
| 2 | `behavior 'channel_cone'` = `channel_aoe` with an arc and a closing blow (`finalCoef`) | Cennet Yumrukları | `channel_aoe` is circular |
| 3 | `SkillDef.cdrOnCast?: { skill: string; sec: number }[]` applied in `pay()` | Kara Tekme → RSK / FoF, Fıçı Darbesi → Brews, Kırılma / Ruh Yarma → Şeytan Dikenleri | talents have `cdr` but base-kit refunds must be data on the skill |
| 4 | consume the shared hidden watcher status **`exec_window`** (target HP < 20 %; defined once by casters-rogue.md E4, CW-07 `procFx.ts` or its PK-0 `data/watchers.ts`) — no new `requires` field | Son Atış | – |
| 5 | `PipDef.statusAt?: { min: number; status: StatusId }` — hidden status maintained while a pip counter ≥ min | `soul_overflow` (Ruh Yarma → Ruh Bombası) | `replaces` is status-based; no pip-driven status exists |
| 6 | `SpecDef.resource?: ResourceType` — spec-level primary-bar override | Sis Dokuyan (mana) | the class owns the resource today |
| 7 | `hover` status ⇒ `SkillSystem` ignores the cast / channel `act_slow` | Süzül (cast while moving) | slows are hard-wired in `startAction` |
| 8 | `groundAoe params.follow` — the zone follows the caster | Yakıp Yok Etme Aurası | `atCaster` zones are static |
| 9 | stagger pool: `Combat` damage-redirect hook (`registerDamageRedirect`) + `combat/stagger.ts` + HUD `StaggerBar` (GDD_CLASSES_V2 §1.11 retuned: 30 % / 55 %, drain 5 % per 0.5 s) | Demci | `stagger_pool` exists only as a StatusId |
| 10 | heal hooks in `healing.healAmount`: `echo` (repeat 70 % once) and `lifebind` (60 % mirror) | Yankı, Yeşil Kucaklayış | heals have no per-target post-hooks |
| 11 | `behavior 'top_allies_buff'` (picks the top-N damage allies from `combat/meters.ts`) and `behavior 'temporal_wound'` (bank % of allied damage, detonate; reuse the `touch_of_magi` store path of `specs/mage.ts`) | Abanoz Kudret, Öngörü, Çağların Nefesi | no party-target selection by damage |
| 12 | `behavior 'stasis'` / `'stasis_release'` (record up to 3 heal casts, replay free) | Durgunluk | – |
| 13 | `behavior 'pet_strike'` (pet leaps, bites, cleave hook) | Av Emri, Vahşi Hırpalama | needs the minion framework (§h dependency) |
| 14 | `StatusRule.takenMoreTypes?: DamageType[]` (type-restricted takenMore) | Mistik Dokunuş (+5 % physical), Kaos Damgası (+5 % magic) | `takenMore` hits every type; owned by CM3 |
| 15 | `ResourceType += 'fury'`, `PipId += 'essence' \| 'soul'`, `PipDef`s with colours; Öfke decay rule; Öz passive regen rule (`regenRule 'pips'`) | İblis Avcısı, Ejderhasoy | contracts |
| 16 | `PlayerController`: double jump + glide for `demonhunter` | class feel | movement is not data |
| 17 | revive key usable in combat for `evoker` (battle res, CM3 pool) | all Evoker specs | CORE §3 |
| 18 | `CharacterModel.attachBlindfold(color)`, `attachHorns(color)`, twin-glaive attach (both hands) | class visual identity | model code |
| 19 | **auto-hits during casts**: `SkillSystem.autoHit(p, aim)` fires the due LMB step's effect without starting an action (no clip, no `endAction`), `autoReady` keeps its current meaning for the animated swing; `game/AutoAttack.ts` gets a `busy` input (hard cast / channel / charge / hold) next to `paused` (stun, dead, ground aim, panels) and calls `autoHit` instead of idling while `busy`; `ClassDef.autoAttack: 'ranged'` (existing field) for `evoker` | the parallel chain rule of §0.5 (Nişancı, Yıkım Nefesi, Yüceltme, Koruyucu Nefes spend 50–54 s of 60 in a cast bar) | today a swing starts an action and would cancel the cast, so `autoReady` and the driver pause the chain |
| 20 | **class-neutral spec hooks**: widen `SpecHooks` in `combat/specials.ts` (today typed with the mage contexts) with `onLmbStep(caster, step, ctx)` (per-hit Enerji / Çi / Odak / Öfke, finisher PRDs, fragments), `onCast(caster, def, ctx)`, `onDamageDealt(hit, ctx)` (Sis Esintisi, `essence_burst` sources, Ebon Might bank) and `onHealDone(heal, ctx)`; the four tables `combat/specs/{monk,archer,demonhunter,evoker}.ts` register under their trait ids exactly like `mageHooks` (`registerSpecHooks('trait_brewmaster', monkHooks)` …) | every `combat/specs/<class>.ts` of §h | `specHooksOf()` only reaches tables registered under a trait id and the interface has mage-only members; call sites: `SkillSystem.ts` (`startBasicStep` hit, `pay`), `Combat.ts` (`rollOutgoing` / damage dealt), `healing.ts` (heal done) |

### g.3 New VFX ids (12) — each maps to an existing preset through `vfx/aliases.ts` until the real preset exists

| id | one-line look | alias until built |
|---|---|---|
| `empower_charge` | 3 small rings above the hands, lighting 1 → 3 in the school colour, with a growing orb at the mouth | `buff_aura` + `charge_ring` |
| `dragon_breath_cone` | layered cone of 40 additive particles + 3 slow smoke ribbons, length / width by rank, 0.5 s sweep + 3 s lingering motes (colour via `opts.color`) | `fire_burst` scaled ×2.4 |
| `essence_beam` | thin additive ribbon with a travelling spiral pulse every 0.6 s, core `0x9cff4a` / halo violet (or azure for Evoker) | `chain_lightning` |
| `glaive_trail` | twin curved crescent ribbons in fel-green / violet along the swing | `slash_arc` violet |
| `fel_wings` | two bat-wing silhouettes (additive, 18 sprites) unfolding on the back for 0.3 s and staying as a faint outline | `wings_aura` fel-tinted |
| `soul_fragment_orb` | small green-white orb that arcs from the target into the player's chest (0.25 s) | `soul_orb` |
| `sigil_ground` | rotating ground glyph (outer ring + 3 runes) that flashes when it fires | `ground_slam`(0.3) + `fire_ground` |
| `jade_serpent` | 14 m jade ribbon with a sine wave, white head with two horn sprites, circling the party | `dragon_trail` jade |
| `time_ripple` | gold sand-glyph circle with 6 drifting grains | `buff_aura` gold + `ambient_dust` |
| `ebon_wings` | two gold-green feather sprites unfolding on an ally's back over 0.25 s | `wings_gold` tinted |
| `prescience_rune` | blue-gold rune ribbon from caster to ally, fading in 0.6 s | `chain_lightning` blue-gold |
| `temporal_wound` | bronze clock ring on the enemy's feet with a slow hand, bursts on detonation | `ground_slam`(0.3) bronze |

**New SFX ids (3)**: `empower_charge` (rising 3-step tone: `ui_tab` +0 / +4 / +8 %), `dragon_breath` (`fire_whoosh` + `boss_roar` at 0.4), `eye_beam_loop` (`drain_loop` / `charge_loop` hum; also the Parçala beam) — all alias-able in `audio/aliases.ts`.
**New events**: `cast:rank {skillId; rank}` (g.1). No new settings. No new net channels (everything is local-state or an existing `pstatus` / `estatus`; Ebon Might / Prescience / Time Dilation / Life Cocoon buffs on remote allies use `pstatus`).

---

# h) Implementation packages (Haiku coders)

Conventions: each package ends with `npx tsc --noEmit` = 0 and its own `src/dev/wow/aeN.ts` check file registering `aeN.*` checks (`window.dev.wow.run('aeN.*')`, COMBAT_WOW §4.1 pattern, no browser per package — one Haiku QA pass at the end runs `window.dev.wow.runAll()`
and `node tools/talents-check.mjs`; see review policy). Each class package creates only **new files** plus the data rows inside its own existing stub file; every shared file is edited by exactly one package (matrix below).

| # | package | owner module | depends on | files |
|---|---|---|---|---|
| **AE-0** | shared registries and stubs | core | CM1 (append what CM1 did not), CW-01 | edit: `types/common.ts` (ClassId, ResourceType `fury`, PipId `essence` `soul`), `types/v2.ts` (5 SpecIds), `types/skills.ts` (StatusId ≈ 54, `empower`, `cdrOnCast`; `SkillSlotKey` `'s4'` only if CM13 has not added it), `types/classes.ts` (`PipDef.statusAt`), `types/vfx.ts` (12 ids), `types/audio.ts` (3 ids), `core/events.ts` (`cast:rank`), `data/classes.ts` (monk / archer `skills` arrays, **two new ClassDefs** from §3.0 / §4.0), `data/specs.ts` (merge `AGILE_SPECS`), `data/statuses.ts` (merge the 4 `statuses_kit_<class>.ts`), `data/skills.ts` (4 `register*` calls), `combat/skills/behaviors.ts` (**bottom import lines only**: the mage block `import { mageHooks } from '../specs/mage'; for (const trait of mageHooks.traits) registerSpecHooks(trait, mageHooks)` gets four siblings for `monkHooks` / `archerHooks` / `demonhunterHooks` / `evokerHooks` from `../specs/{monk,archer,demonhunter,evoker}` — each table exports its `traits` array, e.g. `['trait_brewmaster', 'trait_mistweaver', 'trait_windwalker']` — plus the four side-effect imports `./monkKit` … `./evokerKit`), `vfx/aliases.ts`, `vfx/specIcons.ts`, `audio/aliases.ts`, `data/procs.ts` **and `combat/procMods.ts`** (merge lines of the four `procs_kit_<class>.ts` / `PROC_MODS` fragments; `essence_burst` is one row with the union `skills` list, §0.5), `data/classes.ts` rows carry `autoAttack: 'ranged'` for `evoker`. create (empty, compile-safe): `data/skillsets/{demonhunter,demonhunterSpecs,evoker,evokerSpecs}.ts`, `data/{specs,statuses,procs,rotations}_kit_{monk,archer,demonhunter,evoker}.ts`, `combat/skills/{monk,archer,demonhunter,evoker}Kit.ts`, `combat/specs/{monk,archer,demonhunter,evoker}.ts`, `vfx/presets_kit_{monk,archer,demonhunter,evoker}.ts` (the `_kit_` naming is the one of docs/kits/casters-rogue.md PK-0), `dev/wow/ae{0,1,2,3,4}.ts`. verify: tsc; `ae0.ids` (every id in the §f.1 "new" lists resolves in its registry, every aliased VFX / SFX resolves) |
| **AE-ENG** | engine features of §g.1–g.2 #1–#12 | combat (+ hud for the cast bar and `StaggerBar`) | AE-0, CW-04, CW-07, CW-08, CW-17, CM13 (`replaces`, `requires`, `target_*`) | edit: `combat/SkillSystem.ts` (empower hold/rank, `cdrOnCast`, `hover` no-slow, pip-status, `autoHit` §g.2 #19, hook call sites of #20 in `startBasicStep` / `pay`), `combat/specials.ts` (widened `SpecHooks` interface, #20), `combat/Combat.ts` (damage-redirect hook, `onDamageDealt` call), `combat/healing.ts` (echo / lifebind hook call, `onHealDone` call), `game/AutoAttack.ts` (`busy` input, #19), `ui/widgets/CastBar.ts` (rank notches), `ui/hud/ActionBar.ts` (rank pip on the button; *serialised after CW-08*, its other owner). create: `combat/skills/empower.ts`, `combat/skills/channels.ts` (`channel_beam`, `channel_cone`), `combat/stagger.ts`, `combat/skills/group.ts` (`top_allies_buff`, `temporal_wound`, `stasis*`, `pet_strike` stub), `ui/hud/StaggerBar.ts`. verify: `ae0.empower` (rank thresholds ÷ haste, cancel below rank 1, tip_scales), `ae0.channel_beam`, `ae0.cdr`, `ae0.stagger`, `ae0.echo`, `ae0.autohit` (a chain step fires while `p.cast` is active and the cast is not cancelled), `ae0.hooks` (a table registered under `trait_windwalker` receives `onLmbStep`), `ae0.mods` (`specPatched` returns the İntikam `immolation_aura` patch, nested `damage` replaced wholesale) |
| **AE-V** | player visuals and movement | player | AE-0, CW-04, CW-19 | edit: `entities/CharacterModel.ts` (class model rows for `demonhunter` / `evoker`, `attachBlindfold`, `attachHorns`, twin-glaive attach), `game/PlayerController.ts` (double jump + glide, battle-res revive key, passes the new `busy` flag of §g.2 #19 instead of `paused` for hard cast / channel / hold). verify: `aev.attach` (nodes exist: `head`, `handslot.l`, `handslot.r`), `aev.jump` |
| **AE-1** | **Keşiş** (3 specs) | combat (data) + vfx-audio (preset file) | AE-0, AE-ENG; minion framework **D-MINION** (GDD_CLASSES_V2 §1.5: `entities/Minion.ts`, `combat/Minions.ts`, `data/minions.ts`) for Xuen / Niuzao; CM13 | **only** these files: `data/skillsets/monk.ts` (chain + core rows: `monk_basic`+4, `monk_tiger_palm`, `monk_blackout_kick`, `monk_spinning_crane`, `monk_chi_torpedo`, `monk_fists_of_fury`, `monk_rising_sun_kick`, `monk_provoke`, `monk_fortifying_brew`), `data/skillsets/monkSpecs.ts` (Demci / Sis Dokuyan / WW rows), `data/specs_kit_monk.ts` (3 SpecDefs with bars of §1.1–1.3, `treeSkills` and the `mods` tables "Spec mods" of §1.1 / §1.2), `data/statuses_kit_monk.ts`, `data/procs_kit_monk.ts` (ProcDefs of the three `b)` tables), `combat/specs/monk.ts` (Shuffle/stagger numbers, Çi gain, Combo Breaker / Chi-Ji PRD, Teachings, Sis Esintisi), `combat/skills/monkKit.ts` (`keg_smash`, `celestial_brew`, `purifying_brew`, `thunder_tea`, `life_cocoon`, `yulon`, `revival`, `touch_of_death`, `xuen` / `black_ox` summons), `data/minions_monk.ts` (exports `MONK_MINIONS`; the import line lives in D-MINION's `data/minions.ts`, below), `vfx/presets_kit_monk.ts` (`jade_serpent`), `data/rotations_kit_monk.ts` (§c APLs), `dev/wow/ae1.ts`. verify: every `defaultBar` id resolves; `ae1.bars` (3 bars × 12 slots), `ae1.shuffle` (Kara Tekme +5 s, cap 15), `ae1.stagger` (30 % / 55 % deferral, Purifying 50 %), `ae1.cdr` (Kara Tekme −1 s RSK), `ae1.mw_mana` (spec resource override), `ae1.gust` |
| **AE-2** | **Okçu** (2 specs) | combat (data) | AE-0, AE-ENG; **D-MINION** for the wolf pet and `archer_wolf_ally`; CM13 | `data/skillsets/archer.ts` (chain + `archer_steady_shot`, `archer_arcane_shot`, `archer_aimed_shot`, `archer_rapid_fire`, `archer_explosive_shot`, `archer_kill_shot`, `archer_cobra_shot`, `archer_kill_command`, `archer_barbed_shot`, `archer_wild_thrash`, `archer_multishot`, `archer_disengage`, `archer_exhilaration`, `archer_primal_rage`), `data/skillsets/archerSpecs.ts` (spec rows + majors `archer_volley`, `archer_ms_trueshot`, `archer_bm_bestial_wrath`, `archer_bm_pack_hunt`), `data/specs_kit_archer.ts` (no `mods`, §2.1), `data/statuses_kit_archer.ts`, `data/procs_kit_archer.ts`, `combat/specs/archer.ts` (Kesin Atışlar, Hile Atışları, Odak ×1.6 standing regen, Frenzy, Beast Cleave), `combat/skills/archerKit.ts` (`pet_strike` for Av Emri / Vahşi Hırpalama, `volley` zone), `data/minions_archer.ts` (exports `ARCHER_MINIONS`, imported by D-MINION's `data/minions.ts`), `data/rotations_kit_archer.ts`, `dev/wow/ae2.ts`. verify: `ae2.bars`, `ae2.precise` (Aimed Shot → rmb becomes Gizem Atışı, consumed), `ae2.execute` (Son Atış requires < 20 %), `ae2.cleave` |
| **AE-3** | **İblis Avcısı** (2 specs, new class) | combat (data) + vfx-audio (presets) | AE-0, AE-ENG, AE-V; CM13 (`replaces`) | `data/skillsets/demonhunter.ts` (chain + `chaos_strike`, `annihilation`, `blade_dance`, `death_sweep`, `eye_beam`, `vengeful_retreat`, `immolation_aura`, `fel_rush`, `blur`, `disrupt`, `essence_break`, `metamorphosis`, `the_hunt`), `data/skillsets/demonhunterSpecs.ts` (Vengeance rows: `fracture`, `soul_cleave`, `spirit_bomb`, `fiery_brand`, `torment`, `infernal_strike`, `demon_spikes`, `fel_devastation`, `soul_carver`, the Kaos rows of `immolation_aura` / `metamorphosis` are the base rows, İntikam patches them through the `mods` of §3.2), `data/specs_kit_demonhunter.ts` (İntikam `mods` of §3.2), `data/statuses_kit_demonhunter.ts`, `data/procs_kit_demonhunter.ts`, `combat/specs/demonhunter.ts` (Fury passive regen, Fel Kanı, fragments, `soul_overflow`, Metamorfoz transform), `combat/skills/demonhunterKit.ts` (`the_hunt` dash, Alev Mührü zone, follow-zone aura wiring), `vfx/presets_kit_demonhunter.ts` (`glaive_trail`, `fel_wings`, `soul_fragment_orb`, `sigil_ground`, `essence_beam`), `data/rotations_kit_demonhunter.ts`, `dev/wow/ae3.ts`. verify: `ae3.bars`, `ae3.meta` (Kaos Darbesi → Yok Ediş while `metamorphosis`), `ae3.souls` (≥ 5 ⇒ Ruh Bombası), `ae3.fury` (regen 10/s Kaos, 6/s İntikam) |
| **AE-4** | **Ejderhasoy** (3 specs, new class) | combat (data) + vfx-audio (presets) | AE-0, AE-ENG (empower!), AE-V; CM3 (Bronz Kudret aura, battle res pool); CM13 | `data/skillsets/evoker.ts` (chain + `living_flame`, `unbound_flame`, `disintegrate`, `fire_breath`, `eternity_surge`, `pyre`, `hover`, `obsidian_scales`, `quell`, `deep_breath`, `dragonrage`, `fury_of_aspects`), `data/skillsets/evokerSpecs.ts` (`reversion`, `dream_breath`, `echo`, `emerald_blossom`, `verdant_embrace`, `time_dilation`, `stasis`, `stasis_release`, `eruption`, `ebon_might`, `prescience`, `upheaval`, `breath_of_eons`), `data/specs_kit_evoker.ts` (Koruyucu Nefes / Yüceltme `mods` of §4.2 / §4.3), `data/statuses_kit_evoker.ts`, `data/procs_kit_evoker.ts`, `combat/specs/evoker.ts` (Öz passive regen, Öz Patlaması, Echo / Lifebind data, Ebon Might uptime rules), `combat/skills/evokerKit.ts` (per-spell empower rank effects, `deep_breath` flight dash, `breath_of_eons` flight + wound), `vfx/presets_kit_evoker.ts` (`empower_charge`, `dragon_breath_cone`, `ebon_wings`, `prescience_rune`, `temporal_wound`, `time_ripple`), `data/rotations_kit_evoker.ts`, `dev/wow/ae4.ts`. verify: `ae4.bars`, `ae4.rank` (0.67 / 1.33 / 2.00 s thresholds ÷ haste), `ae4.burst` (Fire Breath → `essence_burst` → Parçala free), `ae4.ebon` (top-2 DPS allies, +1 s per Püskürme), `ae4.wound` (bank 15 %), `ae4.stasis` |
| **AE-5** | talent migration (monk + archer) | items | AE-1, AE-2 | `docs/GDD_TALENTS.trees.json` (48 rows of §f.2), `data/skillSpecs.ts` (12 rows), then regenerate `data/talentTrees/raw/{monk,archer}.ts` with `tools/gen-talent-data.mjs`. verify: `node tools/talents-check.mjs` all stages pass; `ae5.nodes` (every node of §f.2 parses with `parseFx` without warnings). *(New class / spec trees for `demonhunter` and `evoker` are a separate talents wave — D-TREES.)* |
| **AE-6** | tuning gate | combat (data) | CM4 SimBench, CM5, CM6, AE-1…AE-4 | numbers only in the new skill rows and `SPEC_TUNING`: re-run the §d budgets in SimBench (ST ±5, AoE8 ±25, tanks 70 ±5, healers 100 ±5 with ≥ 5 % mana at 95 % efficiency, Yüceltme 100 ±3 with attribution), fix per-spec outliers by scaling `coef` only |

**Package order (waves):** `CM1 → AE-0 → { AE-ENG ‖ AE-V } → { AE-1 ‖ AE-2 ‖ AE-3 ‖ AE-4 } → AE-5 → AE-6`. AE-ENG must run after CW-04 / CW-07 / CW-08 / CW-17 are merged (it edits `SkillSystem.ts`, `CastBar.ts`, the action-bar file); AE-V after CW-04 and CW-19 (`PlayerController.ts`).

**File-conflict matrix (one owner per file; everything else is a new file per class):**

| shared file | single owner | how the class packages reach it |
|---|---|---|
| `types/*`, `core/events.ts` | **AE-0** (append-only) | – |
| `combat/skills/behaviors.ts` | **AE-0** (bottom import lines only) | each class creates `combat/skills/<class>Kit.ts` that self-registers (`BEHAVIORS[...] =`, the `utilities.ts` pattern) |
| `data/statuses.ts`, `data/statuses_talents.ts` | **AE-0** (merge lines) | `data/statuses_kit_<class>.ts` (StatusDefs + `STATUS_RULES` entries) |
| `data/procs.ts`, `combat/procMods.ts` (CW-03 / CW-11 owners) | **AE-0** (merge lines) | `data/procs_kit_<class>.ts` exports `ProcDef[]` and `PROC_MODS` fragments |
| `data/specs.ts`, `data/classes.ts` | **AE-0** | `data/specs_kit_<class>.ts` |
| `vfx/VFX.ts` / `vfx/aliases.ts` / `vfx/specIcons.ts` | **AE-0** (registration + alias lines) | `vfx/presets_kit_<class>.ts` |
| `audio/manifest*.ts` / `audio/aliases.ts` | **AE-0** | – |
| `combat/SkillSystem.ts`, `combat/Combat.ts`, `combat/healing.ts`, `ui/widgets/CastBar.ts` | **AE-ENG** | – |
| `entities/CharacterModel.ts`, `game/PlayerController.ts` | **AE-V** | – |
| `data/skills.ts` | **AE-0** (4 `register*` calls) | rows live in `data/skillsets/*.ts` of each class |
| `combat/specs/<class>.ts` (4 new files) | **AE-1…AE-4** (one each) | registered under their trait ids by the **AE-0** bottom imports of `behaviors.ts` (mage pattern); `SpecHooks` interface, registry and call sites in `combat/specials.ts` / `SkillSystem.ts` / `Combat.ts` / `healing.ts` belong to **AE-ENG** (§g.2 #20) |
| `combat/specs.ts` (`specPatched`) | **nobody** | already applies `SpecDef.mods` `patch` + `params`; the rows live in `data/specs_kit_<class>.ts` |
| `combat/procMods.ts` | **AE-0** (merge lines) | `data/procs_kit_<class>.ts` `PROC_MODS` fragments |
| `game/AutoAttack.ts` | **AE-ENG** | `busy` input; `game/PlayerController.ts` (AE-V) passes it |
| `data/minions.ts` (D-MINION creates it) | **D-MINION** | `MONK_MINIONS` / `ARCHER_MINIONS` exports of AE-1 / AE-2; if D-MINION has not landed, the two files stay unimported and the minion checks are skipped |
| `data/rotations.ts` (CM5) | CM5 owner | `data/rotations_kit_<class>.ts` fragments |
| `docs/GDD_TALENTS.trees.json`, `data/skillSpecs.ts` | **AE-5** | – |

---

# Open questions (largest first)

1. **Minion framework (D-MINION)** — Av Ustası's pet is 22 % of its single-target budget, Xuen / Niuzao / the Pack-Hunt wolves also need it, and `entities/Minion.ts` / `combat/Minions.ts` do not exist yet (GDD_CLASSES_V2 §1.5 is design only). If it slips, Av Ustası is the spec most at risk; a fallback is to model the pet as a damage-only ghost owned by the player, and to build Xuen / Niuzao / the Pack-Hunt wolves with the `spectral_summon` behaviour that casters-rogue.md (E7) already plans for its timed summons (a visual that follows or sits at a point while the caster's machine applies the pulses).
2. **`m180` hosts non-bucketed cooldowns** (Havoc's The Hunt CD 90, Vengeance's Ruh Oyucu CD 60, because Metamorfoz takes `m90` per CORE §2): acceptable (majors persist seconds per slot) or should one move to a rotational slot?
3. **Sated length of Kurt Narası**: CORE §3 says 10 min, COMBAT_WOW's `mage_time_warp` row says 150 s; the rows here use 600.
4. **Ebon Might numbers**: research tooltip 10 s vs guide advice to recast at 4–5.5 s left; we use 20 s duration with 82 % uptime and **top-2 allies** (CORE §2) instead of WoW's all-allies — confirm.
5. **Sis Dokuyan mana via `SpecDef.resource`** (new field) vs keeping Energy for the monk class and judging the healer on Energy: CORE §5.3 is written for mana, so the override is assumed.
6. **`PipId 'essence'` (Evoker) vs `ResourceType 'essence'` (Nekromant Öz)** — same word, different type spaces; rename one (e.g. Nekromant `'oz'`) before AE-0.
7. **Tank taunt cost a slot** (Demci lost Dönen Turna, İntikam lost the standalone Alev Mührü): keep, or give tanks a 13th key?
8. **Class-tree nodes pointing at spec-only skills are inert for the other specs** (Cennet Yumrukları, Çoklu Atış, Ok Yağmuru): move them into the spec trees in the talents wave?
9. **Resource of Spirit Bomb / Soul Cleave** (tooltip Fury vs Method fragments) — both are required here; confirm after an in-game check. Also Blackout Kick 1 Chi vs the research row's 3 Chi, Call of the Wild (not in the research file), Obsidian Scales CD 90 s.
10. **Fury / Focus costs are WoW × 0.5–0.7** for the 1.0 s GCD profile; if the default profile flips to `'wow'` (1.5 s) the §d tables must be re-derived (the busy-time columns would drop ≈ 33 %).
11. **Tank −25 % / healer −40 % passives** are the V2 baselines and are applied after the raw budget; SimBench auto-tuning (`SPEC_TUNING`) will overwrite them if they disagree — keep or bake into the coefficients?
12. **Shared conventions with the sibling kit docs.** `docs/kits/casters-rogue.md` already fixes `sated 600 s`, the shared hidden watcher `exec_window` (target HP < 20 %), the `_kit_` file naming and a scaffold package **PK-0** that edits the same append-only files as **AE-0** (`types/*`, `combat/skills/behaviors.ts` bottom imports, `vfx/aliases.ts`, `audio/aliases.ts`); plate-melee's scaffold will do the same. Run the scaffolds serially (PK-0 → plate-melee scaffold → AE-0), each re-reading the files before appending; the append-only rule means only textual, not semantic, conflicts.
13. **AoE falloff convention.** casters-rogue.md lists coefficients "at 8 targets" and scales them down with `crowdFactor(n) = 0.4 + 0.6 × min(n, 8) / 8` (its E9). This file lists the **single-target coefficient** of every button and a per-target AoE coefficient that is ≤ the ST value (the "coef / target" column). The two conventions give the same totals but need one helper: either the AoE rows here become `params.aoeFalloff` on the abilities whose AoE per-target value is below the ST one (Eye Beam, Fel Devastation, Rapid Fire, Deep Breath, Fire Breath, Eruption…), or E9 is adopted and the tables here are re-based to the 8-target value.
14. **New talent trees** for `demonhunter` / `evoker` (2 class + 5 spec trees) do not exist; the talent panel cannot list the new classes until they are authored (D-TREES).
15. **Auto-hits during casts (§g.2 #19)** — the one engine addition behind the parallel LMB rule. If it is rejected, the chain pauses while `p.cast` / a channel / a hold is active (today's `autoReady`) and the budgets lose: Nişancı ≈ 16 coef (it hard-casts Sabit Atış), Yıkım Nefesi ≈ 18, Yüceltme ≈ 18, Koruyucu Nefes ≈ 20 of its 49 chain coef, Rüzgâr Yürüyen ≈ 4, Kaos / İntikam ≈ 1–2; the four caster specs would need their spell coefficients raised by the same amount (SimBench) and the "LMB ≈ 20 %" share would hold only for the instant-heavy specs.
16. **Tuning deviations from the research file (all in §0.4)**: Living Flame 12 % → 2.5 % mana, Fiery Brand 60 s → 2 charges × 30 s, Steady Shot instant → 1.4 s hard cast. Each is a one-row change if the owner prefers the research value; the budgets above would then need fewer Living Flame casts (Evoker), a third active-mitigation source (İntikam) and an instant Steady Shot (Nişancı: filler coef 0.60 → 0.43 over ≈ 32 casts, Focus still cap-pinned).
17. **Ejderhasoy as a ranged auto-attacker** — `ClassDef.autoAttack: 'ranged'` (reach 25 m, `AUTO.rangedMax` 28) and a projectile chain instead of the melee cone; the Azure Strike clips are `Spellcast_Shoot` / `Spellcast_Raise` (hit times are estimates until scrubbed in `dev/combat.html`). The default `casterAutoShot` setting stays false for the other casters.
18. **Healer chain multipliers** (Sis Dokuyan ×1.9, Koruyucu Nefes ×2.4, via `mods`) exist only to reach the healer damage budget of 35 without a damage button on bars that have none free; if healers should not auto-attack harder than DPS, give them a Tiger Palm / Living Flame style damage button instead (slot cost) and set the multiplier back to 1.

---

# Design notes / rejected critique

Review round 2 (critic findings, all 8 handled; what was rejected or changed in shape is listed here).

* **#1 LMB higher than the fillers (high) — accepted, option (a).** Option (b) (raise filler coefficients above the chain and lower the chain to 0.5–0.8 coef/s) was **rejected**: a GCD-saturated rotation never idles, so an exclusive chain would be worth ≈ 0 and could not reach the brief's "LMB ≈ 20 % of the ST budget" or feed resources / procs. Instead the chain runs in parallel (flat 0.33 coef/s, §0.5), every chain was rescaled (monk 0.43 / archer 0.38 / İblis Avcısı 0.38 / Ejderhasoy 0.34 per chain), every GCD filler is worth more per second than the chain, the rotations are GCD-saturated, and all 10 × 2 Σ tables, the resource checks (per-hit gains divided by the 4–10× higher swing count) and the procs on the chain were re-derived. The unstated engine assumption is now stated and verified against `SkillSystem.autoReady` / `game/AutoAttack.ts`: that code pauses the chain during casts, which is why g.2 #19 (auto-hits during casts) exists and why open question 15 prices the fallback. Side effects of the re-derivation: Demci Kaplan Avucu 0.85 → 0.65, Kaos Darbesi 0.78 → 0.70, Yaşayan Alev 1.35 → 1.00 (Yıkım) / 0.85 → 0.75 (Yüceltme), Sabit Atış 0.85 → 0.60, Dönen Turna (WW) 1.90 → 2.10, Pyre AoE 1.9 → 2.1 (the ST value), Eruption cleave 80 % → 90 %, healer chain multipliers (open question 18).
* **#2 İntikam active mitigation (medium) — accepted.** The critic's arithmetic is right (one Ateş Mührü cast a minute under the `xN` convention). Fix = 2 charges with a 30 s recharge (§0.4 deviation), the 0.8 overlap constant is gone: the uptime is the union of three independent coverages, 72 % with and 67 % without Metamorfoz. Soul Cleave heal 1.2 → 1.0 so the self-heal share stays at 15–30 % with the 30.5 casts a minute the new rotation needs.
* **#3 Living Flame mana (medium) — accepted, first option.** Rebase 12 % → 2.5 % is now a §0.4 row, an open question (16) and noted in all three Evoker sections; the "cut the cast count" alternative is kept as the stated fallback, not applied, because Living Flame is the only always-available button of Yıkım Nefesi and Yüceltme (their mana never binds).
* **#4 AoE empower holds (medium) — accepted.** Time rows recomputed with 2.0 s rank-3 holds and the leftover filler (Yıkım Nefesi 30.1 s, Yüceltme 30.0 s); Yıkım AoE 211.0 (≥ 210), Yüceltme personal 137.9 + attributed 84.9 = 222.8 (≥ 220, inside 218–232).
* **#5 Azure Strike melee (medium) — accepted, ranged option.** The chain is a pierce-2 projectile (range 25) and the class is a ranged auto-attacker; the alternative (cut the chain share) was rejected because the chain share is the parallel-rule budget line.
* **#6 shared ids with per-spec numbers (medium) — accepted, with one premise rejected.** The critic read the header comment of `data/specs.ts` ("mods applies only patch and threat params"); the code (`combat/specs.ts specPatched`) shallow-merges the whole `patch` and `params`, so **no `mods` runtime extension is needed** — the fix is the base-row table of §0.5 plus a "Spec mods" table in every spec section and the AE-1…AE-4 file lists. Nested objects are replaced wholesale and `params.major` is never set on a non-hero row; both rules are written down. `essence_burst` stays one StatusDef / ProcDef / PROC_MODS row with the union of the three free-spell sets (a skill a spec does not own is not on its bar).
* **#7 Steady Shot (medium) — accepted, "remove it from the limiter claim".** Making it an instant Focus builder (the research value) was rejected for this pass: as an instant it would fill ≈ 32 GCDs a minute at 0.43 coef and Focus still would not bind (chain income 268 + regen 713 against 365 spent). It stays a 1.4 s hard cast (§0.4 row), the APL line has no Focus condition, the budget uses the cast count the leftover time allows (23.2) and the doc says plainly that Focus is not Nişancı's limiter.
* **#8 wiring (medium) — accepted.** AE-0 gets the four `combat/specs/<class>.ts` bottom imports and `combat/procMods.ts`; AE-ENG gets the hook interface and call sites (`specials.ts`, `SkillSystem.ts`, `Combat.ts`, `healing.ts`, §g.2 #20) and the auto-hit change; D-MINION gets the two minion merge lines; `combat/specs.ts` needs no edit. The matrix lists all of them.
