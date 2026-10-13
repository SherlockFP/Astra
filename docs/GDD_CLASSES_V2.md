# EFSUN ONLINE – Kadim Zindanlar · GDD: Classes V2 (5 new classes)

Design doc for **Keşiş (Monk), Okçu (Archer), Paladin, Nekromant (Necromancer), Warlock** — the batch-3 user request
("monk gibi bişi, rogue, okçu, tank paladin, necromancer, warlock gibi bişi"). Docs only; code is written afterwards by Haiku
agents from the work-package list in §14 (the same list is returned to the orchestrator).
Player-facing text is **Turkish**; ids, code and prose are English. Numbers are written to be **pasted into data files**.

**User priority #1 = combos, effects, hit feel.** Every class below has a 4-step LMB chain tuned to the chain targets of GDD_LIFE §5.13,
a heavy attack + weapon art + guard/parry/riposte + running/jump/roll attacks from the GDD_V2 §3 "Elden Ring layer" (§1.12), 2–3 skill-to-skill
route combos (§1.4), and per-skill feel weights (FEEL v2). Each class section ends with a "Vuruş hissi" recipe.

Read order for implementers: §0 (conventions) → §1 (shared systems) → your class section → §10 (statuses) → §11 (vfx/sfx ids) →
§14 (work packages). Existing contracts win over this doc: `ARCHITECTURE.md` > `src/types/*` > `GDD_V2.md` > `GDD_LIFE.md` > this file (for the rules those documents define) > `GDD_SYSTEMS.md`.

---

## 0. Conventions, assumptions, alignment

### 0.1 Alignment with the other design documents (re-checked 2026-10-13 after they landed)

`docs/GDD_V2.md` (Sistemler 2.0), `docs/GDD_LIFE.md` (professions + hit-feel pass) and `docs/GDD_OPENWORLD.md` existed when this document was finalised; `docs/GDD_TALENTS.md` does **not** exist yet (ROADMAP batch 5 will reconcile specs/talents after this file). What was adopted:

| Source | Adopted as-is (not redefined here) | What this document adds |
|---|---|---|
| GDD_V2 §0.3/§0.5/§1.1/App. A | `SpecDef` shape (`stats`, `specials`, `skills`, `unlock`, `majors {m45,m90,m180?}`, `mods`, `defaultBar`, `weaponArt?`, `basic?`, `guard?`), spec at **L10**, free switch in town, `specBars`, unlock schedule (spec skill 1 + `m45` at L10, skill 2 at L15, `m90` at L20), role baselines (tank: `maxHpPct +0.30`, armour +35–40 %, own damage ×0.75, threat ×2.5–3; healer: `healingPct +0.30`, own damage ×0.60, `resourceRegenPct +0.25`, **Taşan Şifa** overheal ward; DPS: spec passive ≈ +20–30 % in its niche), counts (tank: 3 new skills incl. the single-target taunt; healer: 5; DPS: 2; +2 majors), StatIds `healingPct threatPct majorCdrPct …`, StatusIds `hero_haste sated overheal_ward riposte marked_crit …`, key bindings **X = `skill_m45`, V = `skill_m90`, T = `skill_m180` (hero family, 4 owning specs only)**, healing formula, threat formula, smart-heal targeting (`AimInfo.allyId`, `U`, `F1–F5`), `m45/m90` cooldown/reset/HUD rules and cast-presentation standard (§2.3) | 11 new `SpecId`s, their passives/skills/majors, new pip counters, minions, auras, corpses |
| GDD_V2 §3 | heavy attack (hold LMB), guard + Guard Gauge, parry/riposte, poise break, Kritik Vuruş, backstab, weapon arts + **Kes**, `ComboRouteDef` | the rows for the five classes (heavy, run/jump/roll, guard, riposte, weapon arts, routes) — §1.12; the first real users of `mace`, `bow`, `fist` arts |
| GDD_LIFE §5 | FEEL v2 weight classes (`params.weight`: 0 light · 1 finisher · 2 heavy · 3 ultimate · **4 medium** · 5 parry · 6 stagger_break · 7 backstab), `FEEL_WEAPON` per weapon kind (tempo: fist 1.15, mace 0.95, bow 1.0, staff/wand 1.0), selective hit-freeze, chain rules, chain coef/s targets, knockback ramp 0.5/0.7/1.2/2.0, stagger ramp 3/3/5/9, trails | per-skill weights/flavour only; **no hit-stop/shake numbers are repeated** |
| GDD_LIFE §1 | crafting `GEAR_FAMILIES` rows for `mace`, `bow` (leather), `quiver` (leather) | item bases (§8) |
| GDD_OPENWORLD | – (no class dependency; only an "Okçu Eğitmeni" trainer NPC) | – |

Remaining assumptions (cheap to move, they are data-shaped):

| # | Assumption | Where |
|---|---|---|
| A1 | The five classes keep `ClassId` strings `monk archer paladin necromancer warlock`; **spec ids follow V2's `<classId>_<name>`**: `monk_brewmaster monk_windwalker`, `archer_marksman archer_beastmaster`, `paladin_protection paladin_holy paladin_retribution`, `necromancer_summoner necromancer_bone`, `warlock_affliction warlock_destruction` (+ wave 2: `monk_mistweaver`). | §0.2 |
| A2 | **No new `m180` hero effect**: V2 gives it to exactly four existing specs. The Okçu / Av Ustası 90 s major is a pack summon instead (an optional hero-family slot for it is listed in §15). | §3 |
| A3 | Healing, threat, smart targeting, `overheal_ward`, `provoke`, `healAlly` are **GDD_V2 WP5 deliverables**; this document only adds data rows and the minion/pip/aura/corpse/stagger systems. If V2 WP5 is not merged when a package here starts, implement against V2's stubs (`data/specs.ts`, `combat/healing.ts`) and report. | §1.8 |
| A4 | New pip counters live in `Player.pips` next to V2's `adalet`/`karisim` (§1.2). | §1.2 |
| A5 | Keşiş keeps the architecture's **4-step** chain (ARCHITECTURE: 3–4 hits). GDD_LIFE §5.13 pencilled a 5-step chain with tempo 1.15 and a 3.6 coef/s target; the 4-step chain below hits the same 3.6 coef/s with tempo 1.15 (§2.3). | §2.3 |
| A6 | Paladin overlaps thematically with V2's Şövalye · Kılıç Ustası (holy melee DPS, Karar Darbesi, Kanatlar). Differentiation: Paladin is the **aura / ally-support / ranged-throw** class (auras, Şifa Eli, İntikamcı Kalkan, Adalet Çekici, Kutsal Güç heals); Ceza is its support-DPS ("hüküm" marks, executes, aura amplification). Ceza can be postponed to wave 2 without breaking anything else. | §4 |
| A7 | The shared passive web gets **5 new class sectors**; the Dragonflight-style class/spec trees are GDD_TALENTS' job — §12 only supplies notables and "talent hooks". | §12 |

### 0.2 Class ids, names, one-line identity

| classId | TR name | role(s) | primary resource | secondary (pips) | main stat | armour | weapons (off-hand) | model |
|---|---|---|---|---|---|---|---|---|
| `monk` | Keşiş | Tank (Demci) · DPS (Rüzgâr Yürüyen) · Healer (Sis Dokuyan, wave 2) | `energy` Enerji | `chi` Çi (max 5) | Çeviklik | medium | `fist` (–) | Barbarian.glb |
| `archer` | Okçu | DPS (Nişancı · Av Ustası) | `focus` Odak (NEW) | – (pet) | Çeviklik | medium | `bow` (`quiver`) | Rogue.glb (unhooded) |
| `paladin` | Paladin | Tank (Koruma) · Healer (Kutsal) · DPS (Ceza) | `faith` İnanç (NEW) | `holypower` Kutsal Güç (max 5) | Güç | heavy | `sword1h` `mace` (`shield`) | Knight.glb |
| `necromancer` | Nekromant | DPS (Ordu Efendisi · Kemik Ustası) | `essence` Öz (NEW) | – (corpses) | Zeka | light | `staff` `wand` (`tome`) | Mage.glb |
| `warlock` | Warlock | DPS (Azap · Yıkım) | `mana` Mana | `shard` Ruh Parçası (max 5) | Zeka | light | `staff` `wand` (`tome`) | Rogue_Hooded.glb |

Skill-id prefixes: `monk_`, `archer_`, `paladin_`, `necro_`, `warlock_`. **Never derive `classId` from an id prefix** (`necro_` ≠ `necromancer`); use `SkillDef.classId`. Short ids used by the §1.12 rows (`mk_ ar_ pl_ nc_ wl_`) follow V2's `kn_/bb_/mg_/rg_` convention and are only ids of heavy/run/jump/roll/riposte skills and routes.

### 0.3 Reading the skill tables

Column legend used in every skill table (all numbers map 1:1 onto `SkillDef`, `data/skills.ts` conventions):

* **Sv·Slot** unlock level · default slot (`lmb rmb q e s1 s2 s3 r`, `m45`/`m90` = the major slots, `kitap` = benched book skill, `spec1/spec2` = spec skill, spec skills fill any free slot per the spec's `defaultBar`).
* **Mal** cost. `20` = `cost: 20`; `+10` = `cost: -10` (generates); `Çi−2` = `pip: {id:'chi', cost:2}`; `Çi+2` = `pip.gain 2`; `KG−3` = holypower cost 3; `RP−2` = shard cost 2; `10 + 14/s` = `cost 10` + `params.costPerSec 14`; `HP12%` = `params.hpCostPct 0.12`.
* **BS** cooldown (s); `c2` = `charges 2`. **Dök** cast time (`0` instant, `k1.5` = `channel: 1.5`, `c1.2` = `castTime: 1.2`).
* **Hedef** targeting + geometry: `arc 100/2.8` = melee_arc arc°/range; `proj v55 R28 r0.3 ×1 p0` = projectile speed/range/radius/count/pierce; `ground R20 r5 d3.5 t14` = ground_aoe range/radius/duration/ticks; `self r3.2` = self_aoe; `dash R12 r2.2 d0.4`; `leap R12 r3.5 d0.55`; `custom:<behavior>` = `targeting 'custom', behavior '<id>'`.
* **Hasar** `2.2 phys` = `damage {coef 2.2, type 'physical'}`; `~` suffix = `perTick: true`; `heal 1.3` = `heal.coef`.
* **Durum** statuses on targets / `self:` selfStatuses. `slow30%/4s` = `{status:'slow', magnitude 0.3, duration 4}`; DoT magnitudes follow §1.7.
* **Anim** `Clip ×animSpeed @hitTime` (clip seconds at speed 1; `hold:` = `holdAnim`; `cycle:` = `animCycle`). All five models share the KayKit 41-bone rig, so **any** KayKit clip (incl. skeleton-only `Spellcast_Summon`, `Taunt`, `Spawn_Air`) plays on every class. Times marked `†` are estimates that must be verified by scrubbing the clip in `dev/combat.html` (peak hand/foot speed) — put the verified value back into the table.
* **VFX/SFX** `c` cast, `p` projectile, `i` impact, `g` ground, `t` trail; `sc` sfx cast, `si` sfx impact. Ids marked **(N)** are NEW (§11 gives an alias to an existing preset so nothing is blocked while the vfx owner builds the real one).
* **params** keys: existing `end chain move stagger proc gain gainExtra gainMax weight lunge slow root upper impactRadius maxTargets atCaster fixed costPerSec minResource consumeAll unstoppable knockup fit step finisher tick moveSlow explode element pathCoef pathWidth speed` (see `data/skills.ts` header), V2's `major threat threatMult smartPriority`, plus the NEW keys of §1.1. Numbers only. **There are deliberately no `hitstop` / `shake` / `fovKick` params in the rows**: hit-stop, trauma, kick, FOV and flinch come from the FEEL v2 weight table (GDD_LIFE §5.2) via `params.weight`.

### 0.4 Combat-feel rules for the five classes (apply to every row)

1. **Chain rules (GDD_LIFE §5.13, new classes included)**: steps 1–2 `weight 0`, **step 3 `weight 4` (medium)**, last step `weight 1` + `finisher 1`; `stagger` 3 → 3 → 5 → 9; chain knockback ramp 0.5 / 0.7 / 1.2 / 2.0 m (× `massFactor`); last-step coef ≥ 1.6 × step-1 coef; `lunge` 0.5–1.4 m; `root 1` only on the finisher. Nominal chain rate `coefPerSec = Σ coef / Σ cadence`, `cadence_i = chain_{i−1} + hitTime_i / animSpeed_i` (wrap-around). **Targets**: Keşiş 3.6 · Okçu 3.2 · Paladin 3.0 · Nekromant 3.0 (+ minions) · Warlock 3.2 (+ DoT). Each class section prints its cadence sum so QA can re-check the tuning.
2. **Skill weights**: melee/ground skills with `coef < 2.5` and no AoE → `weight 4`; `coef ≥ 2.5`, slams and AoE bursts → `2`; ultimates → `3`; channels/ticks → `0` (ticks use the `tick` class automatically); projectile skills keep the projectile class unless the row sets a weight on purpose (marked big shots: Aimed Shot full charge, Kill Shot, Chaos Bolt, Bone Spirit).
3. **Tempo** is the weapon kind's `FEEL_WEAPON.tempo` (fist 1.15, mace 0.95, bow 1.0, staff/wand 1.0) — **no per-class tempo field**. `sword1h` keeps 1.0.
4. **Input** (V2/LIFE): hold LMB ≥ 0.28 s = charged heavy (§1.12); buffer 0.30 s; dodge cancels recoveries; upper-body attack-move (`upper 1`, `slow` 0.25–0.5) on light steps, root on finishers.
5. **Layered sound**: swing (`swing_light|heavy`, `bow_shot`) at the swing → impact by material (`EnemyDef.hitMaterial`, chosen by Audio) **plus** a class impact layer (`punch_hit`, `kick_hit`, `arrow_hit`, `holy_impact`, `hammer_hit`, `bone_impact`, `shadow_impact`) → crit adds `hit_crit` (existing) → voice bark (§9.1).
6. **Visual**: a trail on every swing (`slash_arc` family, `fist_trail`, `kick_arc`, `arrow_trail`), impact sprite along the swing dir, type colour via `TYPE_COLORS` or `params.vfxColor` (hex) — Çi jade `0x5de0a8`, bone `0xe8e0c8`, fel/shadow `0xb06bff`, holy `0xffe9a0`. Weapon trails are the Ribbon of GDD_LIFE §5.12.
7. **Camera hooks**: `params.zoomFov` (negative °, only the Okçu charge: −3° on top of the −1.5° draw of GDD_LIFE §5.3). Everything else (kick, FOV punch, slow-mo) is FEEL v2; majors follow V2 §2.3's presentation standard.
8. **Kills**: every class feeds the existing kill fling / death vfx; Necromancer additionally leaves corpses (§1.6), Warlock gets shards (§1.2).

---

## 1. Shared systems (new or generalised)

### 1.1 Type additions (append-only; core owns `src/types/*`; **GDD_V2 WP1 lands first — append only what is missing**)

```ts
// types/common.ts
ClassId      += 'monk' | 'archer' | 'paladin' | 'necromancer' | 'warlock';
ResourceType += 'focus' | 'faith' | 'essence';
export type PipId = 'combo' | 'adalet' | 'karisim' | 'chi' | 'holypower' | 'shard';   // secondary pip counters (max 5, shown under the bar)
EntityKind   += 'minion';
/** Minion entity ids: MINION_ID_BASE + slot*1000 + (counter % 1000). Owner allocates; networked (below LOCAL_ID_BASE 1_000_000, above HOST_DYNAMIC 899_999). */
export const MINION_ID_BASE = 900_000;

// types/v2.ts (V2's file)
SpecId += 'monk_brewmaster' | 'monk_windwalker' | 'archer_marksman' | 'archer_beastmaster' | 'paladin_protection' | 'paladin_holy'
        | 'paladin_retribution' | 'necromancer_summoner' | 'necromancer_bone' | 'warlock_affliction' | 'warlock_destruction';
// SpecDef / RoleId / SkillSlotKey 'm45'|'m90'|'m180' / SkillDef.spec / AimInfo.allyId / StatIds healingPct threatPct ... are V2's, not repeated.
```

```ts
// types/skills.ts  (append; SkillDef already has V2's `spec?`)
export interface SkillDef {
  /* ...existing + V2 fields... */
  pip?: { id: PipId; gain?: number; cost?: number; min?: number; consume?: 'all' | number; coefPerPip?: number };
  route?: { from: string[]; window: number; more?: number; free?: boolean; refund?: { skill: string; sec: number }; pipGain?: number; pipCostDelta?: number };   // from: skill ids, '@<tag>' or '@status:<id>' (see §1.4)
  minion?: { id: string; count: number; cap?: number; group?: string; life?: number; ignoreCap?: boolean; cycle?: string[] };
  aura?: { radius: number; cycle: StatusId[]; interval: number };   // toggle/cycle aura (Paladin)
  allyTarget?: 'friendly' | 'any';                 // heal/buff targeting hint for V2's smart resolver (friendly ⇒ params.smartPriority 'injured')
  animCycle?: string[];                            // clips alternated per tick/hit (Cennet Yumrukları)
  holdAnim?: string;                               // loop played while a charge/channel key is held
}
export type StatusId = /* existing union + V2 */ | 'chi_flow' | 'tigerlust' | 'tigerfury' | 'fortifying' | 'brewed' | 'stagger_pool'
  | 'hunters_mark' | 'deadeye' | 'trueshot' | 'wild_wrath'
  | 'judged' | 'forbearance' | 'aura_devotion' | 'aura_might' | 'aura_clarity' | 'righteous' | 'wrath_wings' | 'bulwark' | 'ardent' | 'aura_mastery' | 'crusade' | 'sentenced'
  | 'curse_decay' | 'bone_armor' | 'frenzy_minions' | 'lich'
  | 'agony' | 'corruption' | 'unstable_affliction' | 'immolate' | 'seed' | 'havoc' | 'soul_misery';
```

```ts
// types/stats.ts (append to STAT_IDS + STAT_INFO; healingPct / threatPct are V2's)
'minionDamagePct' // 'Yoldaş Hasarı' pct
'minionHpPct'     // 'Yoldaş Canı' pct
'trapDamagePct'   // 'Tuzak Hasarı' pct
```

```ts
// types/classes.ts (NEW, owned by core) — data shapes used by data/classes.ts
export interface PipDef { id: PipId; name: string; max: number; color: string; icon: string; decay?: { after: number; every: number }; startAt?: number }
export interface ClassVisualDef {
  url: string; plainUrl?: string; paletteClass: 'knight' | 'barbarian' | 'mage' | 'rogue';   // recolour anchor (ANCHOR_HUE source)
  defaultVariant: number; defaultTint?: number;
  show: string[]; hide: string[];                    // KayKit child nodes
  main: string[]; off: string[];                     // default built-in stand-in nodes
  attach?: { bow?: boolean; quiver?: boolean; book?: boolean };
}
// data/classes.ts ClassDefX additions (all optional so the old four stay valid):
//   resourceColor: string; tagline: string; icon: string; armorWeight: ArmorWeight; weapons: ItemCategory[]; offhands: ItemCategory[];
//   secondary?: PipDef; specs?: SpecId[]; visual?: ClassVisualDef; voice?: { pack: 'warrior'|'mage'|'orc'; pitch: number };
//   anims?: { idle?: string; run?: string; walk?: string }; cameraProfile?: 'melee'|'ranged'|'caster';
//   trait?: { id: string; name: string; desc: string };
//   regenRule?: 'default' | 'mana' | 'rage' | 'still'; manaScaling?: boolean;   // resource regen behaviour (§1.2)
```

New `params` keys introduced by this doc (all numbers): `vfxColor` (hex int), `zoomFov`, `back` (1 = dash backwards), `landShot` (coef of the free arrow after Geri Sıçrayış), `bounces bounceRange bounceMult`, `chargeMax coefMax critMax minCharge routeInstant`, `executeBelow executeCoef baseCoef refundOnKill`, `petCoef`, `tauntFirst` (1 = taunt only the first target), `kick` (1 = tagged kick for notables), `purify heal`, `keg` (1 = show/scale the Mug as a keg), `refundPurify`, `cleanse`, `corpseRange corpseSearch corpseHpBonus corpseRefund corpseSlots livingCoef explChain explChainMult routeRadius`, `heal healMinion beam`, `hpCostPct` (existing key), `healPerTarget maxHealTargets`, `spread`, `projMesh` (1 axe, 2 shield, 3 hammer; boomerang behaviour), `explodeCoef`, `shardChance shardOnCrit shardOnKill`, `ringRadius`, `store`, `hammers orbitTime orbitRadius hammerCoef`.

### 1.2 Resources and pips

New primary bars (`Actor.resourceType`, HUD `data-kind`, `RES_NAME`):

| ResourceType | TR | colour | max | regen/s | starts | gain | spend | decay |
|---|---|---|---|---|---|---|---|---|
| `energy` (Keşiş) | Enerji | `#e2c22a` + jade tint | 100 | 10 (ooc ×1.5) | full | basic hit none; Çi Torpidosu +10 | skills | – |
| `focus` | Odak | `#d9a441` | 100 | 8; **×1.6 while standing still ≥ 0.5 s** ("Sabit Nişan") | full | basics +4/+4/+6/+8, kill shot refund | skills | – |
| `faith` | İnanç | `#ffe9a0` | 100 | 5 | full | basics +3/+3/+4/+6, taking a hit +2 (tank spec) | skills | – |
| `essence` | Öz | `#6fe3b0` | 100 | 7; +8 per corpse consumed | full | basics +3/+3/+4/+0 | skills | – |
| `mana` (Warlock) | Mana | `#4f8bff` | 100 + 0.25×Zeka (like mage) | 6 + 0.015×Zeka, ooc ×3 | full | basics +3 | skills; Can Dönüşümü converts HP | – |

Code touch: `Combat.updateLocalPlayer` regen block currently special-cases `cls.id === 'mage'` and `'barbarian'`; replace with `ClassDefX.regenRule` flags — `'mana'` (int scaling, ooc ×3: mage + warlock), `'rage'` (decay: barbarian), `'still'` (focus: ×1.6 when `p.stillTime ≥ 0.5`), `'default'`. `StatCalc.out.resourceRegen` already adds `0.015×int` only for mage: make that `table.manaScaling` (warlock true). Every new bar starts **full** (`startResource 1`); only `rage` starts empty. `Metin2Bar.RES_NAME` / `hud*.css` get the 3 new kinds (colours above).

**Pips** (`PipDef` on `ClassDefX.secondary`) generalise the rogue's combo points and V2's `Player.pips { adalet?, karisim? }`:

| PipId | TR | class | max | colour | gain | spend | decay |
|---|---|---|---|---|---|---|---|
| `combo` | Kombo Puanı | rogue | 5 | `#ffd24a` | existing | existing | −1 / 3 s after 8 s ooc |
| `adalet` `karisim` | Adalet / Karışım Puanı | V2 (knight blademaster / rogue alchemist) | 5 | V2 | V2 | V2 | V2 |
| `chi` | Çi | monk | 5 (+1 `n_mk_inner_peace`) | `#5de0a8` | basics 1/1/0/1, Kaplan Avucu +2, Keg Smash +2, Çi Dalgası +1 | Kara Tekme 1, Uçan Yılan 2, Dönen Turna 2, Doğan Güneş 3, Cennet Yumrukları 3, Arındırıcı 1 | −1 / 4 s after 8 s ooc |
| `holypower` | Kutsal Güç | paladin | 5 (+1 `n_pl_sun_seal`) | `#ffe27a` | basic step 3 and 4 +1, Haçlı Darbesi +1, Yargı +1, Kutsal Şok +1, Kutsanmış Çekiç +1 | Kutsal Hüküm / Doğruluk Kalkanı / Işığın Sözü / Şafak Işığı / İlahi Fırtına 3 (up to 5) | none |
| `shard` | Ruh Parçası | warlock | 5 | `#b06bff` | kill of an enemy carrying your Azap/Yozlaşma/Dengesiz Azap/Yakıp Yıkma +1 (+25 % chance of +2 with `n_wl_soul_reaper`), Gölge Oku 12 % | Kaos Oku 2, Voidwalker çağır 1 | none |

Implementation: **extend V2's `Player.pips`** (`Partial<Record<PipId, number>>`) and give `SkillSystem` the API `addPip(actor, id, n)`, `spendPip(actor, id, n): boolean`, `pipCount(actor, id)`, `consumePips(actor, id)`; `addCombo/consumeCombo/comboPoints` stay as wrappers for `'combo'` and the old `cp`/`cpTimer` state moves into `Player.pips.combo`; event `pips:changed {id, points, max}` is added and `combopoints:changed` is still emitted for the rogue. `SkillSystem.pay()` checks/spends `def.pip.cost`; `afterHits()` applies `def.pip.gain` once per cast (rogue `params.cp` stays supported). Finisher behaviour `pip_finisher` = generalised `eviscerate`: `coef = def.damage.coef + coefPerPip × (pipsSpent − min)`, `consume 'all'|N`.

### 1.3 Specs, roles, major cooldowns (GDD_V2 model; this section only states what is new)

* **Data**: append the 11 specs to V2's `data/specs.ts` (`SPECS`, `getSpec(id)`), in V2's `SpecDef` shape. Worked example (copy for the others; skill rows are in the class sections):

```ts
{ id: 'monk_windwalker', classId: 'monk', name: 'Rüzgâr Yürüyen', role: 'dps', desc: 'Çi biriktirir, harcama zincirleriyle durmadan vurur.',
  stats: { attackSpeed: 0.12, critChance: 0.05 },
  specials: [{ id: 'trait_windwalker', desc: 'Her temel vuruşun %12 ihtimalle sonraki Kara Tekme bedava ve anında olur.', params: { comboBreaker: 0.12 } }],
  skills: ['monk_rising_sun_kick', 'monk_whirling_dragon'], unlock: { monk_rising_sun_kick: 10, monk_whirling_dragon: 15 },
  majors: { m45: 'monk_ww_tigers_fury', m90: 'monk_ww_storm_earth_fire' }, mods: [],
  defaultBar: { lmb: 'monk_basic', rmb: 'monk_tiger_palm', /* … see §2.9 */ },
  weaponArt: 'wa_tiger_barrage', guard: { gauge: 60, arc: 120, blockAmount: 0.40 } }
```

* **Schedule (V2 §1.1)**: spec skill 1 + `m45` at **L10**, spec skill 2 at **L15**, `m90` at **L20**; healers have 5 spec skills (L10, L10, L12, L15, L15), tanks 3 (provoke L10, mitigation L10, third L15), DPS 2. Spec passive is active from L10; below L10 no spec bonuses.
* **Majors** (V2 §2): `SkillDef.defaultSlot 'm45'|'m90'`, `params.major 45|90`, key X / V, no resource cost, instant, not interruptible, cooldown/reset/persistence rules of V2 §2.1, cast presentation V2 §2.3 (defensive / offensive / burst-heal / detonation). **None of the 11 specs owns an `m180`.**
* **Mods** (V2 `SpecDef.mods`): per-spec changes to core skills are written in the class sections (e.g. Demci: `monk_tiger_palm` `threatMult 1.5`).
* `SkillSystem.tryCastSlot` refuses a skill whose `def.spec` ≠ the active spec (toast "Bu beceri için {spec} uzmanlığı gerekir."); `Progression.unlockedSkills` follows `SpecDef.unlock` (V2 WP5).

### 1.4 Route system ("Kombo Rotaları") — skill-to-skill combos

V2 §3.9 defines **input-sequence routes** (`ComboRouteDef`, banner `ROTA: <ad>`, +5 % for 3 s, ComboCounter tier). The rows below are **skill-to-skill** routes with a mechanical bonus (the "Skill combos kept from ARCHITECTURE" of V2): data-driven in `SkillDef.route`, **and** every row is also registered as a `ComboRouteDef` in `data/comboRoutes.ts` (e.g. `{ id:'mk_r9', classId:'monk', name:'Uçan Yılan', inputs:['skill:monk_basic_3','skill:monk_flying_serpent'], windowFrom:0, windowTo:1.4, effect:'+%35, Çi harcamaz' }`) so the banner and ComboCounter rules apply.

```ts
route: { from: ['monk_basic_3'], window: 1.4, more: 0.35, free: true }   // Uçan Yılan Tekmesi after a landed Yükselen Tekme
```

* `SkillSystem` keeps `ActorState.lastLanded = { skillId, tags, at, targetId, hits }`, written in `afterHits()` when ≥ 1 enemy was hit (so a whiff never arms a route). `from` entries are skill ids, `'@tag'` (e.g. `'@kick'`: any landed skill whose `tags` include `kick`) or `'@status:<id>'` (armed while the soft target currently carries that status, e.g. `'@status:judged'`, `'@status:hunters_mark'`; the window is then the status duration, not the time since the last hit).
* In `SkillSystem.startAction()` (before `pay()`): if `def.route` and `now − lastLanded.at ≤ window` and `from` matches → `ctx.routeArmed = true`: `ctx.more *= 1 + more`; `free` → cost and pip cost are waived; `refund {skill, sec}` → `reduceCooldown(skill, sec)`; `pipGain` → `addPip`; `pipCostDelta` (e.g. −1) reduces this cast's pip cost by that many. Emit V2's route banner event (HUD flashes the skill slot gold, audio plays `ui_tab` +30 % pitch, vfx `crit_burst` small at the hands).
* Pre-cast feedback: `SkillSystem.routeArmed(skillId): boolean` is polled by the ActionBar (gold border pulse) while the window is open.
* Route table (all rows live in the skill tables of each class; collected here for QA):

| class | route | window | bonus |
|---|---|---|---|
| monk | Yükselen Tekme (`monk_basic_3`) → Uçan Yılan Tekmesi | 1.4 s | +35 %, no Çi cost |
| monk | Kara Tekme → Doğan Güneş Tekmesi (WW) | 1.2 s | +1 Çi |
| monk | Doğan Güneş Tekmesi → Dönen Ejder Yumruğu (WW) | 1.5 s | +40 % |
| monk | Fıçı Darbesi → Kara Tekme (BM) | 3 s | −1.5 s Keg Smash cooldown |
| archer | Geri Sıçrayış → Nişanlı Atış | 2.5 s | instant full charge |
| archer | Tuzak → Patlayıcı Ok | 3 s | +35 % (target rooted) |
| archer | Avcı İşareti → Son Atış (MS) | status duration (12 s) | +25 % |
| paladin | Yargı → Kutsal Hüküm | status duration (10 s) | +25 % |
| paladin | Adalet Çekici → İntikamcı Kalkan | 3 s | +30 %, silence +1 s |
| paladin | Kutsal Şok → Işığın Sözü (Holy) | 4 s | −1 Kutsal Güç cost |
| necromancer | Kemik Mızrağı → Ceset Patlaması | 3 s | +40 %, radius +1 m |
| necromancer | Kemik Hapishanesi → Kemik Fırtınası (BN) | 4 s | +30 % |
| necromancer | Lanet: Çürüme → Kan Emişi | 6 s | damage and heal ×1.5 |
| warlock | Azap → Yozlaşma → Dengesiz Azap (any order, later casts) | 4 s | +30 % DoT damage ("Pandemik") |
| warlock | Yakıp Yıkma → Kaos Oku (Destruction) | 5 s | +25 % (target burning) |

### 1.5 Minion / pet framework (the big new system)

Files: `types/minions.ts` (NEW), `entities/Minion.ts` (NEW, extends `Actor`, `kind 'minion'`, `team 'player'`), `ai/MinionAI.ts` (NEW), `combat/Minions.ts` (NEW manager, `G.minions`), `data/minions.ts` (NEW defs). Owners: combat (manager, data), enemies (AI helper reuse), net (replication), hud (frames).

```ts
export type MinionRole = 'melee' | 'ranged' | 'caster' | 'tank' | 'beast' | 'guardian' | 'clone';
export interface MinionAttack {
  id: string; name: string; kind: 'melee' | 'projectile' | 'aoe' | 'leap' | 'taunt' | 'buff';
  range: number; cooldown: number; hitTime: number; anim: string; animSpeed?: number;
  coef: number; type: DamageType; radius?: number; arc?: number; speed?: number; knockback?: number; stagger?: number;
  statuses?: StatusApply[]; vfx?: { cast?: VfxId; projectile?: VfxId; impact?: VfxId }; sfx?: { cast?: SfxId; impact?: SfxId };
  weight?: number; params?: Record<string, number>;
}
export interface MinionDef {
  id: string; name: string; ownerClass: ClassId; role: MinionRole; group: string;          // group = cap bucket ('skeleton','pet','demon','clone','golem','guardian','knight','pack','army','infernal')
  model: string; scale: number; tint?: number; emissive?: number; ghost?: number; hide?: string[];
  weapon?: { url: string; bone: 'handslot.r' | 'handslot.l'; pos?: [number, number, number]; rotY?: number; scale?: number };
  offhand?: { url: string; bone: 'handslot.r' | 'handslot.l'; pos?: [number, number, number]; rotY?: number; scale?: number };
  anims: { idle: string; walk: string; run: string; hit?: string; death: string; spawn?: string };
  hover?: number; radius: number; height: number; speed: number;
  hpFrac: number;              // × owner.maxHp × (1 + minionHpPct)
  armorFrac: number;           // physical DR fraction (0..0.6)
  attacks: MinionAttack[]; aggro: number; follow: [number, number]; leash: number;
  life?: number;               // seconds (timed summons)
  spawnVfx?: VfxId; spawnSfx?: SfxId; deathVfx?: VfxId;
}
```

**Rules**
1. **Authority**: the owner's peer simulates (AI, HP, attacks) — `Minion.authority = owner.isLocal`. Remote peers render interpolated copies. New net channel **`minion`** (owner → all, 10 Hz, added to the ARCHITECTURE channel table and to V2's `NetChannels`): `MinionSync[] = { id, defId, ownerId, x, z, yaw, anim, hp, maxHp, life }`; remote `Minion`s are created/removed by `Replication` exactly like remote players (despawn after 1.5 s without a snapshot or on `hp ≤ 0`). Id allocator `Minions.nextId(slot)`.
2. **Damage out**: `Combat.minionHitEnemy(minion, enemy, atk)` = `playerHitEnemy` with the **owner's** stat block: `dmg = W_owner × atk.coef × (1 + mainStat/100) × (1 + damagePct + <type>DamagePct + minionDamagePct) × Π more`; crit uses ½ of the owner's crit chance and full crit multiplier; `sourceId = owner.id`, `viaId = minion.id` (damage number shows the minion hit). **Threat** (V2 §1.4 formula): the hit adds `dmg × ownerThreatMult` to the owner's table ×0.6 and ×0.4 to the minion's own id. Client peers send the normal `hit` message to the host.
3. **Damage in**: enemies' `EnemyAI` target scoring (V2's `ai/threat.ts`) iterates `world.players` **and** `world.minions` (threat table keyed by entity id; a taunt on a minion sets threat = top × 1.10 + 100). `HitShapes` are resolved by each peer for its local player **and for its own minions** (`Combat.hitMinion(minion, spec)`; mitigation = armorFrac, no dodge/block/parry). Minion HP lives on the owner; death → `minion:died` event → `death_bones`/`death_poof`, corpse hook for skeletons (§1.6).
4. **Caps** (`MinionDef.group`): `skeleton` 4 (+2 Ordu Efendisi passive, +1 `n_nc_eternal_army`), `golem` 1, `knight` 2 (timed), `pet` 1, `pack` 2 (timed), `demon` 1, `infernal` 1 (timed), `clone` 2, `guardian` 1, `army` uncapped (8, timed). Summoning past a cap despawns the oldest of that group with `death_poof`. Per-peer hard cap 14, per-world 40.
5. **Scaling**: `maxHp = owner.maxHp × def.hpFrac × (1 + minionHpPct)`; armour = `armorFrac`; move speed = `max(def.speed, owner speed × 1.1)` while following > 8 m away.
6. **AI** (`MinionAI.update(m, dt)` — states `idle → follow → engage → return`): follow position = owner + formation slot (ring radius 3.2 m, 360°/n, index by spawn order, tanks front at 2.0 m); target priority: (1) owner's `targetId` or the last enemy the owner damaged ≤ 3 s ago, (2) enemy currently attacking the owner/another minion within `aggro`, (3) nearest enemy within `aggro` (9 m) — melee roles close to `range × 0.8`, ranged keep `0.8 × range` (kite back), casters stay behind the owner; attack choice = highest `weight` among ready attacks in range; `tank` role uses its `taunt` attack when ≥ 2 enemies target non-tanks; teleports to the owner when > 30 m away or stuck 3 s; Nav via `NavGrid.findPath`, repath 0.5 s; far minions (> 40 m from the camera) update every 3rd frame.
7. **Commands** (data-driven skills, no new input): `minion_command` behaviour (`necro_command_army`, `archer_kill_command`, `archer_call_pet`) sets `Minions.focus(owner, targetId, seconds)` / `recall(owner)`.
8. **Respawn**: pets/demons re-summon for free 2 s after `scene:changed` (offline: after the player spawns); a dead pet returns after 10 s (6 s with `n_ar_pack_bond`), a dead demon after 12 s; both need no cast.
9. **UI**: `MinionFrames` (hud) — small portraits under the party frames (pet/demon HP bars, timed summons show a countdown ring, golem/knights/army grouped as "×N"); nameplates: green bar, name "Yoldaş" prefix; `nameplate.friendly` colours already exist for party members.
10. **Models**: `Assets.load` + `SkeletonUtils.clone` per minion (shared clips, own mixer, `frustumCulled=false`, PSX patch automatic); weapons attached with the §1 handslot table of `docs/assets/characters.md` (`Skeleton_*` files: blade/axe `pos [0,0.0333,0] rotY π`, shield `[0,0.017,0.156]`, crossbow `[-0.105,-0.01,0] rotY π/2`). Spawn clip for skeleton-rig minions `Spawn_Ground_Skeletons` ×2.2 (1.6 s), death `Death_C_Skeletons` (bone pile) so corpses stay on screen.

### 1.6 Corpse registry (Nekromant)

`combat/Corpses.ts` (`G.corpses`): `add(x, z, enemyDefId, rank, level)`, `nearest(x, z, r)`, `take(x, z, r): Corpse | null`, `count(x, z, r)`. Filled on **every peer** from the existing `death` handling (each peer already sees enemy deaths) — purely local, nothing is networked. Life 10 s (15 s with `n_nc_corpse_collector`), max 16, `rank 'boss'` leaves none. While the local player is a necromancer each corpse shows a `soul_wisp` loop vfx (green wisp) until consumed/expired. Consumers: `necro_corpse_explosion` (consume 1, radius 6 around the aim point), `necro_raise_skeleton` (consume 1 nearest within 12 m → minion `hpFrac ×1.4`, essence refunded), `necro_army_of_the_dead` (consume up to 4 → upgrades those slots to `necro_skel_warrior`), `n_nc_corpse_collector` (+8 Öz per consumed corpse). A killed minion skeleton also leaves a corpse (bone pile) when `n_nc_eternal_army` rolls.

### 1.7 DoT convention (Warlock)

Existing `Combat.resolveStatuses` (private, `combat/Combat.ts`) already computes `dps = roll.noCrit × magnitude / duration` for dot statuses (poison is per stack per second of `roll.base`). **All new DoTs use that same formula**: `StatusApply.magnitude` = *total DoT damage as a multiple of the casting hit's un-crit damage*, spread over `duration` (e.g. Yozlaşma: direct 0.7 + `corruption` magnitude 5.0 over 14 s ⇒ 3.5 coef of DoT). `dotstack` statuses (Azap) multiply by stacks. New `StatusDef`s `agony corruption unstable_affliction immolate` (§10) carry `dotType` and rule `stack`. Direct-hit coefficients below already account for this, so no combat code change is needed besides: (a) `unstable_affliction` end/death burst, (b) `seed` fuse, (c) shard-on-kill hook (§1.2) in `SkillSystem.onKill`.

### 1.8 Healing, ally targeting and threat — **reuse GDD_V2**

* Healing formula, `healingPct`, `overheal_ward`, `Combat.healPlayer` routing (existing), effective-heal threat and the heal meters: **V2 §0.5 / §1.4 / WP5 `combat/healing.ts`**. Ally targeting: **V2 §1.6** (`AimInfo.allyId`, `Settings.healTargeting` `smart|frames|crosshair`, `U`, `F1–F5`, party frames as click targets, smart-heal priority). The rows here only set `allyTarget` (`'friendly'` ⇒ V2's `params.smartPriority 'injured'`; `'any'` ⇒ damage branch when the reticle is on an enemy, heal branch otherwise) and call V2's behaviours; if V2 names them differently (`light_bolt`, single heal, HoT, pulse, purify) the class behaviours `heal_bolt`/`heal_target` in §14 simply register aliases to the same functions.
* Heals do not target minions in wave 1, except through the explicit `healMinion` param of Kan Emişi / Can Emme-style drains.
* **Threat** (V2 §1.4): `threatMult = max(0.1, 1 + threatPct)`, per skill `params.threatMult` (multiplier) and `params.threat` (flat). New specs: Demci `threatPct +1.5` (×2.5), Koruma `threatPct +2.0` (×3.0), Kutsal `threatPct −0.4` (heal threat only), everyone else 0. `params.tauntFirst 1` + `statuses: taunt` forces the first target hit to attack the caster (single-target taunt without a separate skill). Tank provokes use V2's `provoke` behaviour (taunt 3 s, boss forced 2 s, ICD 12 s). Minion threat: §1.5.2.

### 1.9 Tank kit summary (new tanks)

| | Koruma (Paladin) | Demci (Keşiş) |
|---|---|---|
| Rotational mitigation | `Doğruluk Kalkanı` (3 KG, 6 s, +40 % armour, +20 % block) | `Arındırıcı İksir` (Sarsma purge) + Sarsma smoothing (§1.11) |
| Resource-spent absorb | İnanç → heals via `Kutsal Güç` spenders | none — the Sarsma pool is the buffer |
| Manual guard | `G` + parry (shield guard, gauge 100) | `G` + parry (hand guard, gauge 80) |
| Self-sustain | blocked hit +4 İnanç, `blockHolyPower` | Enerji regen; needs a healer |
| 45 s major | `İlahi Siper` (−35 %, reflect, CC immune, 8 s) | `Güçlendirici İksir` (+20 % HP, −20 %, 15 s) |
| 90 s major | `Yılmaz Savunucu` (−20 %, death save, 10 s) | `Kara Öküz Ruhu` (taunting ox guardian, 25 s) |

### 1.10 Auras (Paladin)

`combat/Auras.ts` (`G.auras`): per player `active: { skillId, status, radius, interval } | null`. `paladin_aura` has `aura.cycle` = `['aura_devotion','aura_might','aura_clarity']`. The active aura is a **selection**, not a bar slot: `flags['paladin.aura']` (default `aura_devotion`, set when `paladin_aura` unlocks at L20) is chosen in the skill panel (3 radio chips) and is re-applied automatically every `interval` (1 s) while the paladin is alive, through deaths and scene changes; a slotted `paladin_aura` (optional) advances the cycle in combat (devotion → might → clarity → off → devotion…). `aura:changed {playerId, status|null}` is emitted on every change, and the local player applies the status to every party member (and self) within `radius × (1 + auraRadius notables)` with duration `interval + 1.5` through the existing `applyPartyAt` (the `banner` mechanism). Remote peers see `aura_ring` (looping ground ring) via the status `vfx`. Aura statuses are listed in §10; effects are +armour 20 %, +8 % damage, +25 % resource regen & −20 % CC duration (values × `1 + auraPower`).

### 1.11 Stagger pool (Keşiş Demci)

Brewmaster mitigation. `StatusId 'stagger_pool'` (hidden, internal) is applied while the spec passive is active; the pool is a number on `SkillSystem.ActorState.stagger` (HUD bar `StaggerBar`, event `stagger:changed {pool, frac}`). *(Terminology: the **Sarsma** pool of the player is unrelated to the enemy **Duruş/poise** bar of V2 §3.7.)*

* `Combat.hitLocalPlayer` after mitigation, before HP loss (V2's new step 0 parry/guard comes first; perilous and unavoidable hits skip the pool): `absorbed = final × staggerAbsorb` (0.40; 0.50 with `n_mk_drunken_master`); `hpLoss = final − absorbed`; `pool += absorbed`; pool cap 80 % max HP (the excess is taken directly).
* Pool drains every 0.5 s: `tick = max(4, pool × 0.083)` dealt as **true** damage to the player (no armour, no crit, can kill, `damage` number kind `dot`); half-life ≈ 4 s.
* `monk_purifying_brew` removes 55 % of the current pool instantly (+6 % max HP heal); a successful parry purges 15 %. Pool > 35 % max HP = "Ağır Sarsıntı" (bar turns red, `hud` warning icon); pool > 60 % adds `healReceivedPct −0.25` until under 45 %.
* Other damage-redirect mechanics (`n_nc_soul_bond`, `n_wl_fate_link`) share the hook `Combat.redirectDamage(p, final)`.

### 1.12 Elden Ring layer (GDD_V2 §3) for the five classes

V2 gives every class a heavy attack, running/jump/roll attacks, guard, parry/riposte, a weapon art and combo routes; V2's §3.8 left `mace`, `bow` as "data only (Phase 2)". The new classes are the first users; the formats below are V2's. All ids are `SkillDef`s (free, 0.45 s lock, `upper 0`) unless noted; coefficients × `W`; poise = poise damage.

**Heavy attacks (hold LMB ≥ 0.28 s; tier 2 ≥ 0.75 s = weapon art)**

| Class | Tier-1 id / TR / clip | Tier-1 numbers | Tier-2 art |
|---|---|---|---|
| Keşiş | `mk_heavy` Ejder Yumruğu — `Unarmed_Melee_Attack_Punch_B` hold at 0.18, release ×1.2, hit 0.50† | 2.6 phys, arc 100° / 3.0 m, poise 30, knockback medium 1.6 m, +1 Çi | `wa_tiger_barrage` |
| Okçu | `ar_heavy` Yüklü Ok — hold `2H_Ranged_Aiming`, release `2H_Ranged_Shoot` @0.32 | projectile 70 m/s pierce 2, 3.0 phys, poise 24, +10 Odak | `wa_piercing_bolt` |
| Paladin (Koruma/Ceza) | `pl_heavy` Kutsal Ezici — `1H_Melee_Attack_Chop` hold at 0.18 ×1.1, hit 0.448 | 2.8 (50 % holy), arc 100° / 3.2 m, poise 36, knockback medium 1.8 m, +1 Kutsal Güç | `wa_crushing_blow` |
| Paladin (Kutsal, override) | `pl_heavy_heal` Yüklü Işık — `Spellcast_Raise` hold at 0.30 → `Spellcast_Shoot` | beam to the crosshair target: ally +2.0×W heal, enemy 2.2 holy; poise 20 | `wa_dawn_wave` (V2) |
| Nekromant | `nc_heavy` Yüklü Kemik Mızrağı — `Spellcast_Raise` hold at 0.30 → `Spellcast_Shoot` | bone lance r 0.6 pierce 3, 2.8 phys, leaves corpses, poise 20, +8 Öz | `wa_bone_spike` |
| Warlock | `wl_heavy` Yüklü Gölge Oku — same clips | r 0.7 bolt 2.8 shadow, explodes r 2.0 (0.8 splash), applies `corruption` 6 s, poise 18, +6 Mana | `wa_soul_flare` |

**Running / jump / roll attacks**

| Class | Running (`*_run`) | Jump (`*_jump`) | Roll (`*_roll`) |
|---|---|---|---|
| Keşiş | `mk_run` Kayan Tekme: slide-kick 4 m, 1.4 phys, arc 90°, poise 14, +1 Çi; continues at step 2 | `mk_jump` Ejder Dalışı: dive kick 1.8 phys, AoE r 2.4, poise 22, +1 Çi | `mk_roll` Dönen Tekme: 360° kick 1.5 phys r 2.4, continues at step 3, keeps `chi_flow` |
| Okçu | `ar_run` Koşarak Atış: full-speed volley of 3 arrows × 0.6, spread 10° | `ar_jump` Süzülen Ok: gravity ×0.15 for 0.6 s, 3 arrows × 0.7 | `ar_roll` Takla Atışı: after the roll 2 piercing arrows × 1.0 backwards-facing |
| Paladin | `pl_run` Kalkan Hamlesi: shoulder lunge 3 m, 1.3 phys, poise 16, knockback light; continues at step 2 | `pl_jump` Işık Dalışı: 1.5 holy, AoE r 2.2, poise 20 | `pl_roll` Yuvarlanma Kesiği: 1.5 phys, lunge 2.5, continues at step 3 |
| Nekromant | `nc_run` Koşarak Kıymık: 3 shards × 0.7, spread ±8° | `nc_jump` Ruh Süzülmesi: gravity ×0.15 for 0.5 s, 3 shards × 0.8 | `nc_roll` Kemik Çıkışı: bone spikes erupt at the roll origin, 1.2 phys r 2.0 |
| Warlock | `wl_run` Koşarak Gölge: 3 bolts × 0.7, each 30 % `agony` | `wl_jump` Süzülen Lanet: gravity ×0.15, 3 bolts × 0.8 | `wl_roll` Gölgeye Dönüş: leaves a shadow puddle (slow 25 %, r 2.5, 2 s) + 1.2 shadow |

**Guard and riposte** (V2 §3.4/§3.5; `SpecDef.guard` carries gauge/arc/blockAmount)

| Class | Guard | Guard counter (LMB while guarding) | Riposte (LMB within 1.6 s of a parry) |
|---|---|---|---|
| Keşiş | hand guard (`Blocking`), arc 120°, `blockAmount 0.40 + stat`, gauge 60 (Demci 80), melee only | Avuç Karşılığı 1.2 coef, poise 30 | `mk_riposte` Çi Karşılığı: `Dualwield_Melee_Attack_Stab` ×1.3, 3.5 phys guaranteed crit, +2 Çi, poise 55 |
| Okçu | none — parry window only | – | `ar_riposte` Gölge Adımı Atışı: backstep 3 m then point-blank piercing arrow, 3.5 phys guaranteed crit, poise 45 |
| Paladin | shield guard, arc 160° (Koruma 180°), `blockAmount 0.60 + shield + stat`, gauge 100; melee + projectiles | Kalkan Karşılığı 1.2 coef, poise 30 | `pl_riposte` Kutsal Karşılık: `1H_Melee_Attack_Stab` ×1.3, 3.5 holy guaranteed crit, +1 Kutsal Güç, poise 60; Koruma also reflects 0.5×W holy on the parry |
| Nekromant | none — parry window only, deflects projectiles (150 %, homing) | – | `nc_riposte` Kemik Cevabı: point-blank bone lance 3.0 phys guaranteed crit; a kill raises a skeleton; poise 40 |
| Warlock | none — parry window only, deflects projectiles | – | `wl_riposte` Pakt Cezası: point-blank 3.0 shadow guaranteed crit + max `agony`/`corruption`; poise 40 |

**Weapon arts** (V2 §3.8 format; every art carries **Kes**; data in `data/weaponArts.ts`)

| id | TR | Category | Class | Charge → release | Effect (exact) | Poise |
|---|---|---|---|---|---|---:|
| `wa_tiger_barrage` | Kaplan Yağmuru | `fist` | Keşiş | 0.75 s hold; 0.9 s flurry (`Unarmed_Melee_Attack_Punch_A/B` ×3 alternating) | 7 hits × 0.6 phys in a 90° / 3.2 m cone, final kick 1.6 phys + knockback medium, +1 Çi per 3 hits | 36 |
| `wa_crushing_blow` | Ezici Darbe | `mace` | Paladin | V2 row: 0.85 s hold | 3.6 coef (50 % holy) + poise ×2 effect | 90 |
| `wa_piercing_bolt` | Delici Ok | `bow` / `crossbow` | Okçu | V2 row: 1.0 s hold | hitscan 30 m, pierce all, 3.0 phys (full-charge Nişanlı Atış rules for crits) | 40 |
| `wa_dawn_wave` | Şafak Dalgası | `staff` / `wand` (+ `mace` for Kutsal via `SpecDef.weaponArt`) | Paladin · Kutsal | V2 row | cone 8 m: allies +1.4×W heal, enemies 1.6 holy | 20 |
| `wa_bone_spike` | Kemik Sivrisi | `staff` / `wand` | Nekromant (`SpecDef.weaponArt`) | 0.75 s hold | 3 bone spears fan ±10°, 1.5 phys each, pierce all, each kill leaves a corpse | 30 |
| `wa_soul_flare` | Ruh Alevi | `staff` / `wand` | Warlock (`SpecDef.weaponArt`) | 0.75 s hold; 0.4 s beam | hitscan 22 m, pierce all, 2.4 shadow + `corruption`, 25 % +1 Ruh Parçası per target | 28 |

**Combo routes (`data/comboRoutes.ts`, V2 `ComboRouteDef` rows; "L" = light, "H" = hold; the skill-to-skill routes of §1.4 are registered the same way)**

| class | id | TR | Input | Sonuç / sayılar |
|---|---|---|---|---|
| Keşiş | `mk_r1` | Klasik | L L L L | Yükselen Tekme + Çift Avuç, 3 Çi |
| Keşiş | `mk_r2` | Ejder Yumruğu | L L **H** | step 3 yerine `mk_heavy` 2.6, poise 30 |
| Keşiş | `mk_r3` | Kayan Zincir | **Koşu** L → L → L | `mk_run` 1.4 → step 2 → step 3 (Yükselen Tekme) → `monk_flying_serpent` window |
| Keşiş | `mk_r4` | Çi Karşılığı | **Parry** → Riposte → L | 3.5 + 2 Çi, then step 2 |
| Keşiş | `mk_r5` | Kaplan Yağmuru | **H(tier 2)** | `wa_tiger_barrage` (Kes) |
| Okçu | `ar_r1` | Klasik | L L L L | Tam Çekiş pierce line |
| Okçu | `ar_r2` | Yüklü Ok | L L **H** | step 3 yerine `ar_heavy` 3.0 pierce 2 |
| Okçu | `ar_r3` | Kayan Atış | **Koşu** L | `ar_run` 3 arrows, continues at step 2 |
| Okçu | `ar_r4` | Gölge Adımı Atışı | **Parry** → Riposte | backstep + 3.5 crit |
| Okçu | `ar_r5` | Delici Ok | **H(tier 2)** | `wa_piercing_bolt` (Kes) |
| Paladin | `pl_r1` | Klasik | L L L L | Kutsal Saplama + Balyoz, 2 Kutsal Güç |
| Paladin | `pl_r2` | Kutsal Ezici | L L **H** | `pl_heavy` 2.8 |
| Paladin | `pl_r3` | Kalkan Hamlesi | **Koşu** L → L | `pl_run` 1.3 → step 2 |
| Paladin | `pl_r4` | Kutsal Karşılık | **Parry** (shield guard) → Riposte | 3.5 holy crit + 1 Kutsal Güç |
| Paladin | `pl_r5` | Ezici Darbe | **H(tier 2)** | `wa_crushing_blow` (Kes) |
| Nekromant | `nc_r1` | Klasik | L L L L | Kemik Patlaması finisher |
| Nekromant | `nc_r2` | Yüklü Mızrak | L L **H** | `nc_heavy` 2.8 pierce 3 |
| Nekromant | `nc_r3` | Kemik Cevabı | **Parry** → Riposte | 3.0 crit + raise skeleton on kill |
| Nekromant | `nc_r4` | Kemik Sivrisi | **H(tier 2)** | `wa_bone_spike` (Kes) |
| Warlock | `wl_r1` | Klasik | L L L L | Kader Patlaması (Yozlaşma 50 %) |
| Warlock | `wl_r2` | Yüklü Gölge | L L **H** | `wl_heavy` 2.8 + Yozlaşma |
| Warlock | `wl_r3` | Pakt Cezası | **Parry** → Riposte | 3.0 crit + max DoTs |
| Warlock | `wl_r4` | Ruh Alevi | **H(tier 2)** | `wa_soul_flare` (Kes) |

Backstab (V2 §3.6) applies to all melee classes with the global ×1.3; no new class gets a backstab spec bonus. Kritik Vuruş uses each class's tier-1 heavy clip at ×1.3 (V2 §3.7).

---

## 2. Keşiş (`monk`) — "Bedenin ve Ruhun Ustası"

**Lore.** Karakurum'un sisli doruklarındaki *Sessiz Pınar Tekkesi* silah taşımayı ayıp sayar: keşişler yumruğu, tekmeyi ve nefesi (Çi) silaha çevirir. Tekkenin
demcileri "Kızıl Pınar" fıçılarından demlenmiş iksirle vuruşları ertelemeyi, rüzgâr yürüyenler ise vuruşları zincirleyip rüzgâra karışmayı öğrenir.
**Fantasy**: akıcı kombolar, tekme zincirleri, yuvarlanıp sıçrayan, hiç durmayan bir dövüşçü.

**Specs** (choose at L10): **Demci** (`monk_brewmaster`, TANK — Sarsma havuzu), **Rüzgâr Yürüyen** (`monk_windwalker`, DPS — Çi harcama zincirleri),
**Sis Dokuyan** (`monk_mistweaver`, HEALER — wave 2, §2.10).

### 2.1 Stats, resource, trait

| field | value |
|---|---|
| `resource` | `energy` (`resourceName: 'Enerji'`, `resourceColor '#e2c22a'`, regen 10/s) + pips `chi` (max 5) |
| `baseStats` | `{ str: 10, dex: 16, int: 8, vit: 14, resourceRegen: 10 }` |
| `perLevel` | `{ str: 1, dex: 4, int: 0, vit: 2 }` (L60 ⇒ 69 / 252 / 8 / 132) |
| `hpPerLevel` / `hpPerVit` | 11 / 10 (L1 HP 201, L60 naked HP 2,030) |
| `mainStat` / armour | `dex` / medium (`CLASS_ARMOR_WEIGHT.monk = 'medium'`) |
| `startResource` | 1 (full) |
| trait `trait_flow` — **Akış** | +6 % hareket hızı. Kaçış Yuvarlanması 6 → **8 m**, a perfect dodge grants +1 Çi, after any roll the next basic chain gets `chi_flow` (+20 % attack speed 2.5 s). With Çi ≥ 3: +8 % attack speed. |
| camera / tempo | `cameraProfile 'melee'`; tempo = `FEEL_WEAPON.fist` 1.15 (no class field) |
| `anims` | `{ idle: 'Unarmed_Idle' }` (run/walk default `Running_A` / `Walking_A`) |

### 2.2 Model recipe and animation map

| item | value |
|---|---|
| model | `/assets/models/characters/Barbarian.glb` (`visual.paletteClass: 'barbarian'`, `defaultVariant 4` "Altın", `defaultTint 0xffe2b0`) |
| nodes hidden | `2H_Axe 1H_Axe 1H_Axe_Offhand Barbarian_Round_Shield Barbarian_Hat Barbarian_Cape` (bare fists, no cape) |
| nodes shown | none by default. **`Mug`** is shown only while a Demci skill that has `params.keg` / Use_Item brew animation plays (`CharacterModel.setNodeOverride(['Mug'])`, the keg is the Mug scaled ×2.4 on `Keg Smash`) |
| weapon item | `fist` base (no GLB; `model: ''`) — hands are tinted with the weapon-glow tier colour via the existing upgrade-glow code on the arm meshes (`Barbarian_ArmLeft/ArmRight`); no attached mesh |
| clip map | idle `Unarmed_Idle`; run `Running_A`; walk `Walking_A`; hit `Hit_A`/`Hit_B`; death `Death_A`/`Death_B`; roll `Dodge_*`; jab `Unarmed_Melee_Attack_Punch_A` (1.467 s, hit ≈ 0.41†), cross `Unarmed_Melee_Attack_Punch_B` (1.667 s, hit ≈ 0.50†), kick `Unarmed_Melee_Attack_Kick` (0.933 s, hit 0.36, verified by barbarian_basic_3), palm strike `Dualwield_Melee_Attack_Stab` (hit 0.512, verified), crane `2H_Melee_Attack_Spinning` loop, whirl `2H_Melee_Attack_Spin` (2.4 s), brew `Use_Item` (hit 0.72), chi cast `Spellcast_Shoot` (hit 0.373) / `Spellcast_Raise`, flying kick `Jump_Full_Short`, guard `Blocking`, cheer `Cheer`, clone spawn `Spawn_Air` |

### 2.3 LMB chain — `monk_basic` "Keşiş Kombosu" (behavior `combo`, steps 4, reset 0.8)

`monk_basic`: `anim 'Unarmed_Melee_Attack_Punch_A'`, `targeting melee_arc`, `range 2.5`, `arc 90`, `tags [melee,basic,combo,unarmed]`, `params {steps:4, reset:0.8}`.
Each step also gets `tags [melee,basic,unarmed]` and `sfx cast swing_light` unless stated. Çi per full chain = **3**. Weights follow §0.4 (0 · 0 · 4 · 1), stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0.

| id | Ad | Çi | Hedef | Hasar | Anim ×speed @hit | VFX / SFX | params |
|---|---|:-:|---|---|---|---|---|
| `monk_basic_1` | Sert Yumruk | +1 | arc 90/2.5, knockback 0.5 | 0.78 phys | `Unarmed_Melee_Attack_Punch_A` ×1.9 @0.41† | t `fist_trail`(N) i `hit_spark` · si `punch_hit`(N) | `end 0.82 chain 0.03 move 0.08 stagger 3 proc 0.7 weight 0 upper 1 lunge 0.6 slow 0.35 step 1` |
| `monk_basic_2` | Çapraz Yumruk | +1 | arc 100/2.5, knockback 0.7 | 0.82 phys | `Unarmed_Melee_Attack_Punch_B` ×1.85 @0.50† | t `fist_trail` i `hit_spark` · si `punch_hit` | `end 0.90 chain 0.03 move 0.08 stagger 3 proc 0.7 weight 0 upper 1 lunge 0.6 slow 0.35 step 2` |
| `monk_basic_3` | Yükselen Tekme | 0 | arc 80/3.0, knockback 1.2 | 1.22 phys | `Unarmed_Melee_Attack_Kick` ×1.5 @0.36 | t `kick_arc`(N) i `chi_burst`(N) scale 0.5 · sc `swing_light` si `kick_hit`(N) | `end 0.70 chain 0.04 move 0.10 stagger 5 proc 0.8 weight 4 upper 0 lunge 0.9 slow 0.45 step 3 knockup 0.45 kick 1` tags +`kick` |
| `monk_basic_4` | Çift Avuç | +1 | arc 70/3.0, knockback 2.0 | 1.74 phys | `Dualwield_Melee_Attack_Stab` ×1.35 @0.512 | t `slash_arc_big` i `palm_shock`(N) · sc `swing_heavy` si `punch_hit` | `end 0.96 chain 0.06 move 0.20 stagger 9 proc 1 weight 1 root 1 lunge 1.0 step 4 finisher 1 impactRadius 1.7` tags +`finisher` |

**Chain check (GDD_LIFE §5.13 formula)**: cadence 0.276 + 0.300 + 0.270 + 0.419 = **1.265 s**, Σ coef 4.56 ⇒ **3.60 coef/s** nominal (target 3.6); last step 1.74 = 2.2 × step 1. With `FEEL_WEAPON.fist` tempo 1.15 the real rate is ≈ 4.1 coef/s of light fists (their hit-stop/trauma are scaled ×0.7/×0.6 by the same table, which is why the kick and finisher carry the weight). Step 3 is the **route anchor** of "Uçan Yılan" (§2.7). Steps 1–2 use `upper 1` so the Keşiş can keep running while jabbing (attack-move); step 4 roots.

### 2.4 Core skills (8)

| id | Ad | Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `monk_tiger_palm` | Kaplan Avucu | 1·rmb | 20, Çi+2 | 0 | 0 | arc 100/2.8 | 2.2 phys | – | `Unarmed_Melee_Attack_Punch_B` ×1.7 @0.50† | t `fist_trail` i `chi_burst` · sc `swing_light` si `punch_hit` | melee unarmed builder | `end 0.90 chain 0.08 move 0.18 stagger 8 proc 1 weight 4 lunge 1.0 slow 0.6` |
| `monk_chi_torpedo` | Çi Torpidosu | 3·q | +10 | 9 | 0 | dash R12 r2.2 d0.4 | path 0.8 / end 1.6 phys, knockback 1.5 | self: `chi_flow` 2.5 s | `Running_A` ×2.0 | t `dragon_trail`(N) i `palm_shock` · sc `whoosh` si `punch_hit` | melee movement unarmed | `end 0.9 chain 0.10 move 0.15 stagger 18 proc 1 weight 2 pathCoef 0.8 pathWidth 1.6 speed 30 unstoppable 1 fit 0`; pip Çi+1 |
| `monk_spinning_crane` | Dönen Turna Tekmesi | 6·e | Çi−2 | 6 | k1.5 | self r3.2, `custom:channel_aoe` | 0.55~ phys (6 ticks) | – | `2H_Melee_Attack_Spinning` ×1.0 @0.1 | c `spin_slash` (vfxColor 0x5de0a8) · sc `whoosh` | melee aoe channel unarmed | `end 0.3 chain 0.1 stagger 2 proc 0.3 weight 0 tick 0.25 moveSlow 0.5 immuneSlow 1 vfxColor 6152360` |
| `monk_blackout_kick` | Kara Tekme | 10·s1 | 15, Çi−1 | 2.5 | 0 | arc 120/3.0 | 3.0 phys, knockback 1.2 | – | `Unarmed_Melee_Attack_Kick` ×1.3 @0.36 | t `kick_arc` i `chi_burst` · sc `swing_heavy` si `kick_hit` | melee kick unarmed spender | `end 0.75 chain 0.08 move 0.18 stagger 12 proc 1 weight 2 lunge 1.0 root 1 knockup 0.3 kick 1`; route `{from:['monk_keg_smash'], window:3, refund:{skill:'monk_keg_smash', sec:1.5}}` |
| `monk_flying_serpent` | Uçan Yılan Tekmesi | 15·s2 | Çi−2 | 10 | 0 | leap R12 r3.5 d0.55 | 2.6 phys, knockback 1.5 | slow30%/2.5s | `Jump_Full_Short` ×1.0 @0.55 | t `dragon_trail` g `leap_land` i `palm_shock` · sc `jump` si `kick_hit` | melee movement kick aoe | `end 0.8 chain 0.12 move 0.2 stagger 22 proc 1 weight 2 fit 1 unstoppable 1 knockup 0.6 kick 1`; **route** `{from:['monk_basic_3'], window:1.4, more:0.35, free:true}` |
| `monk_chi_wave` | Çi Dalgası | 20·s3 | 25, Çi+1 | 7 | 0 | proj v20 R18 r0.7 ×1 p0, `custom:chain_projectile` | 2.0 arcane (each bounce ×0.9) | – | `Spellcast_Shoot` ×1.3 @0.373 | p `chi_projectile`(N) i `chi_burst` · sc `chi_cast`(N) | spell projectile arcane | `end 0.7 chain 0.1 move 0.2 stagger 4 proc 0.8 weight 0 upper 1 slow 0.5 bounces 3 bounceRange 6.5 bounceMult 0.9 vfxColor 6152360` |
| `monk_tigers_lust` | Kaplan Hırsı | 25·kitap | 0 | 30 | 0 | `self_buff` | – | self: `tigerlust` 6 s (cleanse slow/root) | `Cheer` ×1.8 @0.3 | c `haste_trail` · sc `buff` | buff movement | `end 0.7 chain 0.1 move 0.15 weight 0 cleanse 1 slow 0.6` |
| `monk_fists_of_fury` | Cennet Yumrukları | 30·r | Çi−3 | 60 | k3.0 (fixed) | cone arc 100/4.0, `custom:channel_cone` | 1.1~ ×10 ticks + final 3.0, final knockback 4 | – | cycle `Unarmed_Melee_Attack_Punch_A`,`…_B` ×2.2 @0.1 | c `chi_burst` i `hit_spark` · sc `swing_heavy` si `punch_hit` | ultimate melee aoe channel | `end 0.3 chain 0.2 tick 0.3 fixed 1 unstoppable 1 dr 0.3 stagger 3 proc 0.25 weight 0 finalCoef 3.0 finalKnock 4 finalStagger 30 finalWeight 3 moveSlow 0.1` |

| id | Açıklama (TR, tooltip) | VFX / SFX notes |
|---|---|---|
| `monk_basic` | Yumruk ve tekmelerle dört vuruşluk bir kombo yaparsın. Üçüncü vuruş düşmanı havaya sıçratan bir tekme, sonuncusu çift avuç darbesidir. Vuruşlar Çi kazandırır. | Short white fist streak, jade spark on the kick, avuç = ring + dust `palm_shock`. |
| `monk_tiger_palm` | Avucunla %220 hasar vurur ve 2 Çi kazanırsın. | Jade chi flash at the palm, flesh thump. |
| `monk_chi_torpedo` | 12 metreye kadar Çi'yle süzülür, yoldaki düşmanları iter ve varışta çevrene %160 hasar verirsin. Ardından 2.5 sn daha hızlı vurursun. | Jade afterimage dragon trail (3 ghosts via `createGhost`), dust at both ends. |
| `monk_spinning_crane` | 2 Çi harcayıp 1.5 sn boyunca dönerek çevrendeki herkese %55 hasarı 6 kez vurursun. Dönerken hareket edebilirsin. | Jade spinning ring, whoosh loop. |
| `monk_blackout_kick` | 1 Çi harcayan ağır bir tekme: %300 hasar verir ve düşmanı geri iter. | Wide kick crescent low to the ground, heavy thud (heavy weight class). |
| `monk_flying_serpent` | Hedefe doğru bir yılan gibi sıçrayıp inişte %260 hasar verirsin. Yükselen Tekme'den hemen sonra kullanırsan %35 daha güçlüdür ve Çi harcamaz. | Serpent-shaped jade ribbon behind the jump, landing shockwave; slot glows gold when the route is armed. |
| `monk_chi_wave` | Düşmanlar arasında 3 kez sekip her biri için %200 gizem hasarı veren bir Çi dalgası fırlatırsın. | Jade orb that curves to the next target; 1 Çi gained. |
| `monk_tigers_lust` | 6 saniye boyunca %35 daha hızlı koşar, %15 daha hızlı vurur, yavaşlatma ve kök etkilerinden kurtulursun. | Haste trail, wind burst on cast. |
| `monk_fists_of_fury` | 3 Çi harcayarak 3 saniye boyunca önündeki düşmanlara yumruk yağdırırsın (10 vuruş), son vuruş %300 hasarla savurur. Bu sırada durdurulamazsın ve %30 daha az hasar alırsın. | Rapid alternating fists, jade afterimages on the arms, final blast (ultimate weight). |

### 2.5 Specs (GDD_V2 `SpecDef` shape; skills L10 / L15, majors L10 / L20)

**`monk_windwalker` — Rüzgâr Yürüyen (DPS).** Tagline "Hiç Durmayan Yumruk". Passive "Rüzgâr Yolu" (`trait_windwalker`): `stats {attackSpeed 0.12, critChance 0.05}`, special `comboBreaker 0.12` (each basic step / Kaplan Avucu has 12 % to make the next Kara Tekme free and instant-chain). `skills` `monk_rising_sun_kick` (L10), `monk_whirling_dragon` (L15); majors `m45 monk_ww_tigers_fury` (L10), `m90 monk_ww_storm_earth_fire` (L20); `weaponArt wa_tiger_barrage`; `guard {gauge 60, arc 120, blockAmount 0.40}`; `mods []`.

**`monk_brewmaster` — Demci (TANK).** Tagline "Ertelenmiş Hasar". Passive "Ertelenmiş Hasar" (`trait_brewmaster`, V2 tank baseline): `stats {maxHpPct 0.30, armorPct 0.25, dodgeChance 0.08, threatPct 1.5}` (×2.5 threat), special `moreDamage 0.75, staggerAbsorb 0.40, parryPurge 0.15` — activates the Sarsma pool (§1.11). `skills` `monk_provoke` (L10), `monk_keg_smash` (L10), `monk_purifying_brew` (L15); majors `m45 monk_bm_fortifying_brew` (L10), `m90 monk_bm_black_ox` (L20); `weaponArt wa_tiger_barrage`; `guard {gauge 80, arc 120, blockAmount 0.40}`; `mods`: `monk_tiger_palm` `threatMult 1.5`, `monk_blackout_kick` `threatMult 1.3`.

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `monk_rising_sun_kick` | Doğan Güneş Tekmesi | WW · 10·spec1 | Çi−3 | 9 | 0 | arc 140/3.2 | 6.5 phys, knockback 1.8 | sunder12%/6s | `Unarmed_Melee_Attack_Kick` ×1.15 @0.36 | t `kick_arc` scale 1.2 i `holy_burst` scale 0.6 (vfxColor 0xffc060) · sc `swing_heavy` si `kick_hit` | melee kick spender | `end 0.85 chain 0.1 move 0.2 stagger 25 proc 1 weight 2 lunge 1.4 knockup 0.8 root 1 kick 1`; route `{from:['monk_blackout_kick'], window:1.2, pipGain:1}` |
| `monk_whirling_dragon` | Dönen Ejder Yumruğu | WW · 15·spec2 | Çi−2 | 14 | 0 | self r5.2 | 4.0 phys, knockback 3 | – | `2H_Melee_Attack_Spin` ×2.4 @0.6 | c `spin_slash` scale 1.4 i `shockwave` · sc `swing_heavy` si `ground_slam` | melee aoe | `end 1.0 chain 0.1 move 0.25 stagger 25 proc 1 weight 2`; route `{from:['monk_rising_sun_kick'], window:1.5, more:0.40}` |
| `monk_provoke` | Alay Et | BM · 10·spec1 | 0 | 8 | 0 | `custom:provoke` R25 (soft target) | – | `taunt` 3 s (boss: forced 2 s, ICD 12 s; threat := max(current, top × 1.10) + 100) | `Cheer` ×2.2 @0.3 | i `mark_loop` (vfxColor 0xd9a441) · sc `war_cry` | taunt tank | `end 0.5 chain 0.05 move 0.1 weight 0` |
| `monk_keg_smash` | Fıçı Darbesi | BM · 10·spec1 | 20, Çi+2 | 8 | 0 | arc 140/3.4 | 2.8 phys, knockback 1.2 | slow25%/4s, `brewed` 6 s | `2H_Melee_Attack_Chop` ×1.35 @0.735 | g `brew_splash`(N) i `ground_slam` scale 0.7 · sc `ground_slam` si `pot_break` | melee aoe tank | `end 1.2 chain 0.1 move 0.25 stagger 30 proc 1 weight 2 root 1 lunge 0.8 threatMult 3 keg 1 impactRadius 2.0 refundPurify 3` (`refundPurify 3` = −3 s on Arındırıcı İksir) |
| `monk_purifying_brew` | Arındırıcı İksir | BM · 15·spec2 | Çi−1 | 8 (c2) | 0 | `self_buff` | heal 6 % max HP | – | `Use_Item` ×2.2 @0.72 | c `brew_splash` scale 0.7 + `heal_burst` · sc `potion_drink` | self defensive | `end 0.9 chain 0.1 move 0.15 purify 0.55 heal 0.06 keg 1 weight 0` |
| `monk_ww_tigers_fury` | Kaplan Öfkesi | WW · m45 (L10) | 0, Çi+2 | 45 | 0 | `self_buff` | – | self: `tigerfury` 12 s | `Cheer` ×1.8 @0.3 | c `enrage_aura` (vfxColor 0x5de0a8) + `chi_burst` · sc `war_cry` | buff major | `major 45 end 0.7 chain 0.1 move 0.15 weight 1` |
| `monk_ww_storm_earth_fire` | Fırtına, Toprak ve Ateş | WW · m90 (L20) | 0 | 90 | 0 | `summon` (minions `monk_clone_fire`, `monk_clone_earth`, life 15 s) | – | self: `empower` 15 s (+10 %) | `Spellcast_Raise` ×1.6 @0.5† | g `respawn` ×2 at the clones · sc `chi_cast` | summon major | `major 90 end 0.9 chain 0.1 move 0.2 weight 2` |
| `monk_bm_fortifying_brew` | Güçlendirici İksir | BM · m45 (L10) | 0 | 45 | 0 | `self_buff` | heal 20 % max HP | self: `fortifying` 15 s | `Use_Item` ×1.8 @0.72 | c `brew_splash` + `shield_bubble` · sc `potion_drink` | defensive major | `major 45 end 0.9 chain 0.1 move 0.15 keg 1 heal 0.2 weight 1` |
| `monk_bm_black_ox` | Kara Öküz Ruhu | BM · m90 (L20) | 0 | 90 | 0 | `summon` (minion `monk_black_ox`, life 25 s) | – | – | `Taunt` ×1.5 @0.4† | g `pet_summon`(N) · sc `boss_roar` | summon major | `major 90 end 0.9 chain 0.1 move 0.2 weight 2` |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `monk_rising_sun_kick` | 3 Çi harcayarak %650 hasar veren yükselen bir tekme atar, hedefi 6 sn boyunca %12 daha savunmasız bırakırsın. Kara Tekme'den sonra 1 Çi iade eder. | Orange-gold rising crescent, ground dust (heavy weight class). |
| `monk_whirling_dragon` | 2 Çi harcayarak çevrene %400 hasar veren bir ejder kasırgası yaratırsın. Doğan Güneş Tekmesi'nden sonra %40 daha güçlüdür. | Jade dragon-shaped spin ring. |
| `monk_provoke` | Hedefi 3 saniye boyunca kendine kışkırtırsın ve tehdidini en üste çıkarırsın (patronlarda 2 sn, 12 sn bekleme). | Amber reticle on the target, short jeer. |
| `monk_keg_smash` | Fıçıyla yere vurarak önündekilere %280 hasar verir, onları yavaşlatır ve zayıflatırsın; 2 Çi kazanırsın. Arındırıcı İksir'in bekleme süresini 3 sn kısaltır. | Mug scaled to a keg overhead, amber splash on impact. |
| `monk_purifying_brew` | 1 Çi harcayarak Sarsma havuzunun %55'ini anında temizler ve canının %6'sını yenilersin. | Gulp animation, amber→jade glow on the character. |
| `monk_ww_tigers_fury` | 12 saniye boyunca %30 daha hızlı vurur, Enerji yenilenmen iki katına çıkar. Anında 2 Çi kazanırsın. | Jade-gold aura with tiger-stripe flicker. |
| `monk_ww_storm_earth_fire` | 15 saniye boyunca iki ruh kopyan yanında dövüşür; hasarın %10 artar. | Two translucent clones (fire-orange / earth-gold) pop in with `Spawn_Air`. |
| `monk_bm_fortifying_brew` | 15 saniye boyunca maksimum canını %20 artırır, aldığın hasarı %20 azaltır ve canının %20'sini yenilersin. | Amber shield bubble. |
| `monk_bm_black_ox` | 25 saniye boyunca yanında Kara Öküz savaşan bir ruh olarak dövüşür, düşmanları kışkırtır ve yere vurarak Sarsma havuzunu azaltır. | Spirit ox rises from the ground with a roar. |

### 2.6 Minions

| id | model · scale | role / group | hpFrac · armor | attacks (anim ×speed @hit, range, cd, coef) | anims | life | notes |
|---|---|---|---|---|---|---|---|
| `monk_clone_fire` | `Barbarian.glb` scale 1.0, tint `0xff7a30`, emissive `0x802000`, `ghost 0.78`, hide as §2.2 | clone / `clone` cap 2 | 0.40 · 0.2 | jab `Unarmed_Melee_Attack_Punch_A` ×1.6 @0.44 r2.4 cd 0.7 coef 0.9 **fire**; kick `Unarmed_Melee_Attack_Kick` ×1.4 @0.36 r3 cd 3.0 coef 1.4 knockback 1 | idle `Unarmed_Idle` walk `Walking_A` run `Running_A` hit `Hit_A` death `Death_A` spawn `Spawn_Air` ×2 | 15 | speed 7.5, follow [2,4], aggro 12, leash 25; copies the owner's target |
| `monk_clone_earth` | same, tint `0xc8a050`, emissive `0x403010` | clone / `clone` | 0.50 · 0.35 | same but phys, jab cd 0.8, `Dualwield_Melee_Attack_Stab` ×1.3 @0.512 r3 cd 4 coef 1.8 AoE r1.8 stagger 12 | same | 15 | slower (6.8) |
| `monk_black_ox` | `/assets/models/itch/creatures/rhino.glb` scale 0.8 (≈ 2.0 m), tint `0x2c2c3c`, emissive `0x2a6a50` | guardian / `guardian` cap 1 | 1.00 · 0.45 | `Gore` ×1.0 @0.45 r3 arc 90 cd 2.2 coef 1.6 knockback 1.5; `Stamp` @1.0 AoE r4 cd 4 coef 2.2 stagger 20 (each hit reduces the owner's Sarsma pool 8 %); `Roar` @0.3 taunt r8 3 s cd 6 | idle `Idle` walk `Walk` run `Run` hit `Hit` death `Death` spawn `Wake` ×1.5 | 25 | speed 5.4 (Run travels 5 m/s) |

### 2.7 Combo routes and rotations

* **Jab–Jab–Rising Kick → Flying Serpent**: `monk_basic_1 → _2 → _3` (kick lands) then `monk_flying_serpent` within 1.4 s: +35 %, no Çi, serpent trail; the slot glows gold as soon as the kick connects. This is the signature "Jab-Jab-Rising Kick → Flying Serpent".
* **WW spender loop**: Kaplan Avucu (+2 Çi) → Kara Tekme (−1) → Doğan Güneş (−3, refund 1 if it follows Kara Tekme) → Dönen Ejder (−2, +40 %). Çi income ≈ 3 per chain + 2 per palm; spend ≈ 6 per loop.
* **BM loop**: Fıçı Darbesi (+2 Çi, taunt, −cd Purify) → Kara Tekme (−1 Çi, −1.5 s Keg Smash cd when within 3 s of a Keg Smash) → Arındırıcı İksir when the pool > 35 %.
* Dodge-roll tech: roll → next chain with `chi_flow`; perfect dodge +1 Çi.

### 2.8 Vuruş hissi (hit-feel recipe)

Weights: steps 1–2 `light`, step 3 `medium` (kick), step 4 `finisher`; Kaplan Avucu `medium`; Kara Tekme, Uçan Yılan, Doğan Güneş, Dönen Ejder, Fıçı Darbesi `heavy`; Cennet Yumrukları ticks use the `tick` class and its final blow `finalWeight 3` (ultimate). Because `FEEL_WEAPON.fist` scales light hit-stop ×0.7 / trauma ×0.6 / kick ×0.6 (GDD_LIFE §5.3), the fist chain is *fast and tight*: the punch streak (`fist_trail`), a jade spark and the `punch_hit` thump over `hit_flesh` sell steps 1–2; the **kick** adds the 0.45 m pop and a low crescent (`kick_arc`); the **palm finisher** adds the ground ring (`palm_shock`) and dust fan. Voice: `voice_warrior_hup` on punches, `voice_warrior_hut` on kicks (the existing "hup/hut" barks fit kiai perfectly), `voice_warrior_angry` on Cennet Yumrukları. Majors use V2 §2.3's offensive/defensive presentation.

### 2.9 Starting kit, default bars

`startingItems ['fist_t1']` (+ equipped `chest_medium_t1 boots_medium_t1 helm_medium_t1 gloves_medium_t1`).
`SpecDef.defaultBar`: **WW** `{lmb monk_basic, rmb monk_tiger_palm, q monk_chi_torpedo, e monk_spinning_crane, s1 monk_blackout_kick, s2 monk_rising_sun_kick, s3 monk_flying_serpent, r monk_fists_of_fury, m45 monk_ww_tigers_fury, m90 monk_ww_storm_earth_fire}` (bench: `monk_whirling_dragon monk_chi_wave monk_tigers_lust`);
**BM** `{lmb monk_basic, rmb monk_tiger_palm, q monk_chi_torpedo, e monk_keg_smash, s1 monk_blackout_kick, s2 monk_purifying_brew, s3 monk_provoke, r monk_fists_of_fury, m45 monk_bm_fortifying_brew, m90 monk_bm_black_ox}` (bench: `monk_spinning_crane monk_flying_serpent monk_chi_wave monk_tigers_lust`).

### 2.10 Wave 2 seed — Sis Dokuyan (`monk_mistweaver`, HEALER)

Passive `monk_mw_passive` "Sis Örgüsü" (`trait_mistweaver`, V2 healer baseline): `stats {healingPct 0.30, resourceRegenPct 0.25, castSpeed 0.10, threatPct -0.4}`, special `moreDamage 0.60, overhealWard 0.40, smartHeal 1, mistLeech 0.40` (Kara Tekme/Dönen Turna heal the lowest ally for 40 % of damage dealt). V2 healer schedule: five spec skills `monk_mw_soothing_mist` (L10; channel 2.5 s on `allyTarget friendly`, heal 0.35 / 0.5 s tick, anim `Spellcasting`), `monk_mw_renewing_mist` (L10; HoT `regen` 6 s, 0.2 coef/tick, jumps 3×; cd 8 c2), `monk_mw_detox` (L12; dispel 2), `monk_mw_enveloping_mist` (L15; 1.4 s cast, heal 2.2 + 0.2/tick HoT), `monk_mw_vivify` (L15; cone heal 1.6 around the target). Majors `m45 monk_mw_thunder_tea` (L10; next 3 heals cost 0 and +50 %), `m90 monk_mw_revival` (L20; instant party heal coef 3.0 + cleanse). `weaponArt wa_tiger_barrage`, basic `monk_mw_basic` (palm heal-bolt, V2 `light_bolt` behaviour). Row-level numbers are written when V2 healer WPs (WP5) land; not part of the first wave.

---

## 3. Okçu (`archer`) — "Rüzgârın Gözü"

**Lore.** Kuzey bozkırlarının *Kök Boy* avcıları çocukluktan atın üstünde Türk yayı çeker; her okçunun bir kurt yoldaşı vardır. Okçu uzaktan vurur, geri çekilir,
tuzak kurar; sürüsü yaklaşana kadar bir kaçış yolu hazırlar. **Fantasy**: kiting, tuzak, yoldaş, kritik nişan.

**Specs** (L10): **Nişancı** (`archer_marksman`, DPS — tek hedef, dolu çekiş), **Av Ustası** (`archer_beastmaster`, DPS — yoldaş + zehir + Av Sürüsü).
Wave 2 seed: **Hayatta Kalma** (melee hunter, trap-centred; not specified here).

### 3.1 Stats, resource, trait

| field | value |
|---|---|
| `resource` | `focus` (`resourceName 'Odak'`, colour `#d9a441`, regen 8/s, **×1.6 while stationary ≥ 0.5 s**), no pips |
| `baseStats` | `{ str: 8, dex: 18, int: 8, vit: 12, resourceRegen: 8 }` |
| `perLevel` | `{ str: 0, dex: 4, int: 0, vit: 2 }` (L60 ⇒ 8 / 254 / 8 / 130) |
| `hpPerLevel` / `hpPerVit` | 9 / 9 (L1 HP 167, L60 naked 1,760) |
| `mainStat` / armour | `dex` / medium |
| trait `trait_hawkeye` — **Şahin Gözü** | +15 % kritik hasarı; hedef 12 m'den uzaktaysa +10 % hasar; ranged basics may be fired while running (`upper 1`, `slow 0.25`) |
| camera / tempo | `cameraProfile 'ranged'` (shoulder 0.85 m; `zoomFov −3°` while charging); tempo = `FEEL_WEAPON.bow` 1.0 |

### 3.2 Model recipe and animation map

| item | value |
|---|---|
| model | `/assets/models/characters/Rogue.glb` (the **unhooded** rig: `visual.paletteClass 'rogue'`, `defaultVariant 2` "Zümrüt", `defaultTint 0xd8ffd0`) |
| nodes | show `Rogue_Cape`; hide `Knife Knife_Offhand 1H_Crossbow 2H_Crossbow Throwable` |
| bow | `bow_t1..t5` items attach `/assets/models/gen/weapons/bow_short.glb` (T1–T2) / `bow_composite.glb` (T3–T5) through the existing `attachFor()` branch that maps category `bow` to `ATTACH.crossbow` (`handslot.r`, pos `[-0.105,-0.01,0]`, rotY π/2) — **verify in `dev/player.html`**: limbs must stand vertical and the arrow axis (+Z) must point forward in `2H_Ranged_Aiming`; if the grip is off, add a dedicated `ATTACH.bow` (adjust pos only) — the loadout code is already category-driven |
| quiver | `quiver_t*` (off-hand category `quiver`) attach `/assets/models/weapons/quiver.gltf` with `ATTACH.quiver` (`chest`, pos `[0,0.05,-0.2]`) — exists, only needs a quiver item base |
| clip map | idle `Idle`; aim hold `2H_Ranged_Aiming` (1.6 s loop, upper body); shoot `2H_Ranged_Shoot` (1.067 s, release 0.32 verified by `rogue_bolt_rain`); rapid `2H_Ranged_Shooting` (loop); backstep `Dodge_Backward`; trap `Throw` (hit 0.615); whistle `Use_Item` (0.72); mark `Spellcast_Shoot` (0.373); majors `Cheer`; hit/death/roll as every class |

### 3.3 LMB chain — `archer_basic` "Ok Serisi" (behavior `combo`, steps 4, reset 0.8)

`archer_basic`: `anim '2H_Ranged_Shoot'`, `targeting projectile`, `range 28`, `tags [ranged,basic,combo,projectile,physical]`, `params {steps:4, reset:0.8}`. Odak gain is `params.gain` (+ `gainExtra`). Weights 0 · 0 · 4 · 1, stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0.

| id | Ad | Hedef | Hasar | Anim ×speed @hit | VFX / SFX | params |
|---|---|---|---|---|---|---|
| `archer_basic_1` | Hızlı Ok | proj v55 R28 r0.3 ×1 p0, knockback 0.5 | 0.58 phys | `2H_Ranged_Shoot` ×2.0 @0.32 | p `arrow_projectile` t `arrow_trail`(N) i `hit_spark` · sc `bow_shot` si `arrow_hit`(N) | `end 0.62 chain 0.03 move 0.08 stagger 3 proc 0.7 gain 4 weight 0 upper 1 slow 0.25 step 1` |
| `archer_basic_2` | Çift Ok | proj v55 R28 r0.3 ×2 spread 6 p0, knockback 0.7 | 0.38 ×2 phys | `2H_Ranged_Shoot` ×2.0 @0.32 | same | `end 0.62 chain 0.03 move 0.08 stagger 3 proc 0.7 gain 4 gainExtra 2 gainMax 2 weight 0 upper 1 slow 0.25 step 2` |
| `archer_basic_3` | Delici Ok | proj v60 R28 r0.3 ×1 p2, knockback 1.2 | 0.95 phys | `2H_Ranged_Shoot` ×1.5 @0.32 | p `arrow_projectile` scale 1.2 t `arrow_trail` i `hit_spark` · sc `bow_shot` si `arrow_hit` | `end 0.64 chain 0.04 move 0.10 stagger 5 proc 0.8 gain 6 weight 4 upper 1 slow 0.35 step 3` |
| `archer_basic_4` | Tam Çekiş | proj v70 R28 r0.35 ×1 p99, knockback 2.0 | 1.30 phys | `2H_Ranged_Shoot` ×0.75 @0.32 | p `arrow_projectile` scale 1.6 t `arrow_trail` scale 1.6 i `shockwave` scale 0.35 + `hit_spark` · sc `bow_shot`+`swing_heavy` si `arrow_hit` | `end 0.64 chain 0.06 move 0.20 stagger 9 proc 1 gain 8 weight 1 upper 0 slow 0.6 step 4 finisher 1` tags +`finisher` |

**Chain check**: cadence 0.220 + 0.190 + 0.243 + 0.467 = **1.120 s**, Σ coef 3.59 ⇒ **3.2 coef/s** (target 3.2); last step 1.30 = 2.2 × step 1. Odak per chain: 4+4(+2)+6+8 = 22–24. The last step pierces the whole line; with W 231 (bow) a coef-0.58 arrow already hits for ≈ 1,100 at the reference build.

### 3.4 Core skills (8)

| id | Ad | Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `archer_aimed_shot` | Nişanlı Atış | 1·rmb | 25 (at release) | 0 | hold ≤1.0 s | `custom:charge_shot`, proj v75 R35 r0.35 ×1 p1 | 2.2 → 4.0 phys (by charge) | – | hold `2H_Ranged_Aiming`; release `2H_Ranged_Shoot` ×1.2 @0.32 | p `arrow_projectile` scale by charge t `arrow_trail` · sc `bow_draw`(N) → `bow_shot` si `arrow_hit` | ranged projectile physical charge | `chargeMax 1.0 coefMax 4.0 critMax 0.25 minCharge 0.25 zoomFov -3 slow 0.5 end 0.7 chain 0.08 move 0.15 stagger 8 proc 1 weight 1`; route `{from:['archer_disengage'], window:2.5}` + `routeInstant 1` |
| `archer_disengage` | Geri Sıçrayış | 3·q | 10 | 9 | 0 | dash backwards R7 r3 d0.3 (`back 1`) | free arrow 1.4 phys (`landShot`) | origin ring: slow40%/2s + knockback 2 (r3); self: `iframes` 0.25 s | `Dodge_Backward` ×1.0 @0.05 | c `dodge_dust` + `trap_snap`(N) i `hit_spark` · sc `whoosh` | movement ranged | `back 1 landShot 1.4 speed 30 unstoppable 1 end 0.45 chain 0.05 move 0 stagger 6 proc 0.5 weight 0` |
| `archer_multishot` | Çoklu Atış | 6·e | 30 | 4 | 0 | proj v55 R22 r0.3 ×5 spread 9 p0 | 0.9 phys each, knockback 0.6 | – | `2H_Ranged_Shoot` ×1.3 @0.32 | p `arrow_projectile` i `hit_spark` · sc `bow_shot` si `arrow_hit` | ranged projectile aoe | `end 0.64 chain 0.08 move 0.15 stagger 3 proc 0.7 weight 0 upper 1 slow 0.4` |
| `archer_call_pet` | Yoldaş Çağır | 10·s1 | 0 | 6 | 0 | `summon` (minion `archer_wolf`, cap 1, group `pet`) | – | – | `Use_Item` ×1.6 @0.72 | c `pet_summon`(N) · sc `wolf_howl`(N) | summon pet | `end 0.9 chain 0.1 move 0.15 weight 0 mend 0.35` (recast on a living pet below 70 % HP heals it 35 % over 3 s; at full HP dismisses it) |
| `archer_snare_trap` | Pençe Tuzağı | 15·s2 | 20 | 14 | 0 | ground R7 r1.8 d25, `custom:trap` | 1.5 phys | root 2.5 s, bleed (6 s, magnitude 1.0) | `Throw` ×1.5 @0.615 | g `trap_ring`(N) i `trap_snap`(N) · sc `trap_arm`(N) si `trap_snap` | trap ground bleed | `trapArm 0.8 trapMax 2 trapLife 25 stagger 12 proc 1 weight 1 end 0.95 chain 0.1 move 0.2` (scales with `trapDamagePct`) |
| `archer_explosive_arrow` | Patlayıcı Ok | 20·s3 | 35 | 7 | 0 | proj v55 R30 r0.4 ×1 p0, explode r3.2 | 2.4 fire, knockback 1.5 | burn40%/4s | `2H_Ranged_Shoot` ×1.0 @0.32 | p `fire_projectile` i `fire_burst` · sc `bow_shot`+`fire_cast` si `fire_impact` | ranged projectile fire aoe | `end 0.66 chain 0.1 move 0.2 stagger 8 proc 1 weight 1 upper 0 slow 0.5 explode 3.2 element 1`; route `{from:['archer_snare_trap'], window:3, more:0.35}` |
| `archer_hunters_mark` | Avcı İşareti | 25·kitap | 0 | 20 | 0 | `custom:target_status` R32 | – | `hunters_mark` 12 s on the soft target | `Spellcast_Shoot` ×1.8 @0.373 | i `mark_loop`(N) · sc `buff` | utility debuff | `end 0.5 chain 0.05 move 0.1 weight 0` |
| `archer_arrow_storm` | Ok Fırtınası | 30·r | 40 | 60 | 0 (wind-up 0.5) | ground R24 r7 d3.5 t14, `custom:volley` | 0.8~ phys (14 waves) | slow30%/0.6s | `2H_Ranged_Shoot` ×0.8 @0.32 (aimed up) | g `arrow_rain`(N) i `hit_spark` · sc `bow_shot` si `arrow_hit` | ultimate ranged aoe zone | `tick 0.25 slow 0.5 end 0.9 chain 0.2 move 0.25 stagger 1 proc 0.25 weight 3` |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `archer_basic` | Yayınla dört atışlık bir seri yaparsın: tek ok, çift ok, delici ok ve tüm hattı delen tam çekiş. Her isabet Odak kazandırır. | Thin streak per arrow; the 4th arrow is fat and bright, leaves a shock ring. |
| `archer_aimed_shot` | Tuşu basılı tutarak yayı çeker, bırakınca %220–%400 hasar veren delici bir ok atarsın. Tam çekişte kritik şansın %25 artar. Çekerken yavaşlar ve kamera yaklaşır. | Bow creaks, charge glow grows on the string, camera zooms in. |
| `archer_disengage` | Geriye 7 metre sıçrar, çevrendekileri yavaşlatıp iter ve inerken en yakın düşmana %140 hasarlı bir ok atarsın. Sonraki Nişanlı Atış anında tam çekilir. | Dust burst at the take-off spot, snap net ring. |
| `archer_multishot` | Beş ok birden atarsın; her biri %90 hasar verir. Yakın mesafede tüm oklar çarpar. | Fan of arrows. |
| `archer_call_pet` | Kurt yoldaşını çağırır; yaşıyorsa ve yaralıysa iyileştirir, tam canındaysa geri gönderir. Yoldaş ölürse 10 sn sonra kendiliğinden döner. | Whistle animation, leaf-and-dust puff, howl. |
| `archer_snare_trap` | Yere bir tuzak kurarsın (25 sn, en fazla 2). Düşman basınca 2.5 sn köklenir, %150 hasar alır ve kanar. | Glyph that arms after 0.8 s (barely visible), snap jaws on trigger. |
| `archer_explosive_arrow` | Çarptığında patlayan ok: %240 ateş hasarı verir ve yakar. Köklenmiş hedeflere Tuzak'tan sonra %35 daha güçlüdür. | Fire arrow, orange blast, knock back. |
| `archer_hunters_mark` | Hedefi 12 sn işaretlersin: duvarların ardından görünür, %8 fazla hasar alır, sana %10 ek kritik şansı verir. | Red reticle above the target. |
| `archer_arrow_storm` | Hedef bölgeye 3.5 sn boyunca ok yağdırır, 14 dalgada her düşmana %80 hasar verir ve yavaşlatırsın. | Arrow rain streaks + dust puffs, thunder-like rhythmic thunk, light weight class. |

### 3.5 Specs (GDD_V2 `SpecDef` shape; skills L10 / L15, majors L10 / L20)

**`archer_marksman` — Nişancı (DPS).** Tagline "Tek Ok, Tek Hedef". Passive "Keskin Nişancı" (`trait_marksman`): `stats {critChance 0.08, projectileDamagePct 0.10}`, special `chargeSpeed 0.30, petMult 0.5` (Nişanlı Atış charges 30 % faster; the wolf is only half as strong). `skills` `archer_rapid_fire` (L10), `archer_kill_shot` (L15); majors `m45 archer_ms_deadeye` (L10), `m90 archer_ms_trueshot` (L20); `weaponArt wa_piercing_bolt`; no `guard` (parry window only).
**`archer_beastmaster` — Av Ustası (DPS).** Tagline "Sürünün Lideri". Passive "Sürü Lideri" (`trait_beastmaster`): `stats {minionDamagePct 0.40, minionHpPct 0.30}`, special `petBleed 1` (the wolf's Bite also applies a 3 s bleed; the pet may be swapped to **Ayı** at L20 through the skill panel dropdown `flags['archer.pet']`). `skills` `archer_kill_command` (L10), `archer_serpent_sting` (L15); majors `m45 archer_bm_bestial_wrath` (L10), `m90 archer_bm_pack_hunt` (L20); `weaponArt wa_piercing_bolt`.

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `archer_rapid_fire` | Seri Ateş | MS · 10·spec1 | 30 | 12 | k2.2 | `custom:channel_shoot`, proj v60 R28 r0.3 (14 arrows) | 0.55 phys each (7.7) | – | hold `2H_Ranged_Shooting` | p `arrow_projectile` t `arrow_trail` · sc `bow_shot` (rate-limited 6/s) | ranged channel projectile | `tick 0.157 spread 2.5 speed 60 range 28 moveSlow 0.4 stagger 1 proc 0.25 weight 0` |
| `archer_kill_shot` | Son Atış | MS · 15·spec2 | 25 | 6 | 0 | proj v80 R35 r0.35 p0 | 2.0 phys (6.0 if target < 25 % HP) | – | `2H_Ranged_Shoot` ×0.9 @0.32 | p `arrow_projectile` scale 1.4 i `crit_burst` · sc `bow_shot` si `hit_crit` | ranged execute | `executeBelow 0.25 executeCoef 6.0 baseCoef 2.0 refundOnKill 1 end 0.7 chain 0.1 move 0.2 stagger 15 proc 1 weight 2`; route `{from:['@status:hunters_mark'], window:12, more:0.25}` |
| `archer_kill_command` | Av Emri | BM · 10·spec1 | 30 | 6 | 0 | `custom:pet_strike` R16 (the pet leaps and bites) | 3.2 phys (pet) | bleed (5 s, magnitude 0.6) | `Spellcast_Shoot` ×2.0 @0.373 | i `hit_blood` · sc `wolf_bite`(N) si `wolf_bite` | pet melee | `petCoef 3.2 stagger 15 weight 2 end 0.5 chain 0.05 move 0.1`; fails with toast "Yoldaş yok" |
| `archer_serpent_sting` | Zehirli Ok | BM · 15·spec2 | 20 | 3 | 0 | proj v50 R28 r0.3 p0 | 1.2 poison | poison ×2 stacks (8 s, 0.15) | `2H_Ranged_Shoot` ×1.6 @0.32 | p `poison_projectile` i `poison_burst` scale 0.5 · sc `bow_shot` si `poison_impact` | ranged poison | `end 0.64 chain 0.05 move 0.12 stagger 2 proc 0.7 weight 0 upper 1 slow 0.4 spreadOnDeath 1` (poison jumps to the 2 nearest enemies when the host dies) |
| `archer_ms_deadeye` | Keskin Nişan | MS · m45 (L10) | 0 | 45 | 0 | `self_buff` | – | self: `deadeye` 10 s (3 stacks) | `Spellcast_Raise` ×2.5 @0.5† | c `buff_aura` + `mark_loop` · sc `buff` | buff major | `major 45 end 0.5 chain 0.1 move 0.1 weight 0` (next 3 Nişanlı Atış: full charge instantly, cost 0, +30 % crit) |
| `archer_ms_trueshot` | Tam İsabet | MS · m90 (L20) | 0 | 90 | 0 | `self_buff` | – | self: `trueshot` 20 s | `Cheer` ×1.6 @0.3 | c `enrage_aura` (vfxColor 0xe8c15a) · sc `war_cry` | buff major | `major 90 end 0.8 chain 0.1 move 0.15 weight 1` |
| `archer_bm_bestial_wrath` | Vahşi Gazap | BM · m45 (L10) | 0 | 45 | 0 | `self_buff` (+pet) | – | self & pet: `wild_wrath` 10 s | `Cheer` ×1.8 @0.3 | c `enrage_aura` on you and the pet · sc `wolf_howl` | buff major | `major 45 end 0.7 chain 0.1 move 0.15 weight 1` |
| `archer_bm_pack_hunt` | Av Sürüsü | BM · m90 (L20) | 0 | 90 | 0 | `summon` (minion `archer_wolf_ally` ×2, life 20 s, group `pack`) | – | – | `Use_Item` ×1.6 @0.72 | g `pet_summon` ×2 · sc `wolf_howl` | summon major | `major 90 end 0.9 chain 0.1 move 0.2 weight 2` (the two wolves copy the owner's target; the pet itself gets `wild_wrath`-lite: +25 % damage for the duration) |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `archer_rapid_fire` | 2.2 saniye boyunca 14 ok yağdırır, her biri %55 hasar verir. Atış sırasında yavaş hareket edebilirsin. | Stream of arrows, light muzzle flicker. |
| `archer_kill_shot` | Canı %25'in altındaki hedefe %600 hasar verir (diğerlerine %200). Hedefi öldürürse maliyet iade edilir ve beklemesi sıfırlanır. | Heavy arrow, `crit_burst`, heavy weight class. |
| `archer_kill_command` | Yoldaşına hedefe atılmasını emredersin: %320 hasar verir ve hedefi kanatır. | Wolf leaps (Lunge), blood splash. |
| `archer_serpent_sting` | İki kat zehir bindirir (%120 hasar); zehirli hedef ölünce zehir en yakın iki düşmana geçer. | Green arrow, poison cloud puff. |
| `archer_ms_deadeye` | 10 saniye boyunca sonraki 3 Nişanlı Atış anında tam çekilir, bedava olur ve %30 ek kritik şansı alır. | Gold reticle ring around the character. |
| `archer_ms_trueshot` | 20 saniye boyunca kritik hasarın %50, saldırı hızın %40 artar, Odak yenilenmen iki katına çıkar ve oklar +1 deler. | Gold aura, eyes glow. |
| `archer_bm_bestial_wrath` | 10 saniye boyunca sen ve yoldaşın %25 daha çok hasar verir; yoldaşın %50 daha hızlı saldırır ve durdurulamaz. | Red aura on both. |
| `archer_bm_pack_hunt` | 20 saniye boyunca iki kurt daha çağırırsın; hedefine yoldaşınla birlikte sürü halinde saldırırlar. | Two dust-and-leaf puffs, howl. |

### 3.6 Minions

| id | model · scale | role / group | hpFrac · armor | attacks (anim ×speed @hit, range, cd, coef) | anims | notes |
|---|---|---|---|---|---|---|
| `archer_wolf` | `/assets/models/itch/creatures/wolf.glb` scale 1.0 (≈ 1.4 m; texture variants `wolf_black`/`wolf_white` for tint choice) | beast / `pet` cap 1 | 0.45 · 0.25 | `Bite` ×1.5 @0.47 r2.0 arc 100 cd 1.1 coef 0.9 phys; `Lunge` ×1.0 @0.87 leap r6 cd 6 coef 1.8 + bleed 4 s (0.4) stagger 12 (travels 2.1 m, the AI adds the missing distance); `Howl` ×1.0 @0.8 (cosmetic, plays on summon/recall) | idle `Idle` walk `Walk` run `Run` hit `Hit` death `Death` spawn `GetUp` ×1.5 | speed 7.0, follow [2.5,5], aggro 14, leash 30; foot-lock: `Run` travels 7.3 m/s, set `timeScale = speed/7.3` |
| `archer_bear` | `/assets/models/itch/creatures/bear.glb` scale 1.0 (≈ 2.06 m) | tank / `pet` | 0.85 · 0.40 | `Swipe` @0.42 r3 arc 120 cd 1.4 coef 1.1; `Slam` @0.77 AoE r3.5 cd 7 coef 2.0 stagger 15; `Roar` @0.3 taunt r8 3 s cd 10 | idle `Idle` walk `Walk` run `Run` hit `Hit` death `Death` spawn `Wake` | speed 6.8; Av Ustası L20 choice |
| `archer_wolf_ally` | `/assets/models/itch/creatures/wolf.glb` scale 0.95, texture `wolf_white` | beast / `pack` cap 2 | 0.25 · 0.15 | `Bite` ×1.5 @0.47 r2.0 arc 100 cd 1.0 coef 0.7 phys; `Lunge` @0.87 leap r6 cd 7 coef 1.2 | same as `archer_wolf` | life 20 s, speed 7.0; two of them from **Av Sürüsü**, they copy the owner's target |
| `archer_hawk` | **stub, wave 3** (no bird model exists; `Bat.glb` tinted `0x8a6a40` would read as a bat) | flyer / `pet` | 0.25 | `Bat_Attack` swoop coef 0.7 cd 1.2 | `Bat_Flying`… | do not implement now; the user's "optional" |

### 3.7 Combo routes and rotations

* **Kite loop**: Geri Sıçrayış (free arrow) → Nişanlı Atış (instant full charge) → basics while retreating (attack-move).
* **Trap combo**: Pençe Tuzağı → Patlayıcı Ok onto the rooted target (+35 %).
* **MS**: Avcı İşareti → Son Atış (+25 %, refunds on kill) → Seri Ateş when the Odak bar is full (stand still for the ×1.6 regen).
* **BM**: Yoldaş + Av Emri (3.2 bite, bleed) → Zehirli Ok on the same target; Vahşi Gazap (45 s) then Av Sürüsü (90 s) on pulls.

### 3.8 Vuruş hissi

Weights: steps 1–2 `light`/projectile (no hit-stop on release — `FEEL_WEAPON.bow` — only a tiny arrow-stuck sprite, a `hit_flesh` "tink" marker and the small camera kick on release), step 3 `medium` with 1.2 m knockback, **Tam Çekiş** `finisher` (fat arrow, ring, 2.0 m knockback); **Nişanlı Atış** is a marked big shot whose weight rises with charge (`projectile` → `heavy` at full draw; −3° zoom while drawing and a snap back on release); **Son Atış** `heavy` + `crit_burst`. Seri Ateş/Ok Fırtınası are tick-class (no stop). Barks: `voice_warrior_attack` 12 % on basics, `voice_warrior_crit` on kill shots.

### 3.9 Starting kit, default bars

`startingItems ['bow_t1','quiver_t1']` (+ `chest_medium_t1 boots_medium_t1 helm_medium_t1 gloves_medium_t1`).
**MS** bar `{lmb archer_basic, rmb archer_aimed_shot, q archer_disengage, e archer_multishot, s1 archer_rapid_fire, s2 archer_explosive_arrow, s3 archer_kill_shot, r archer_arrow_storm, m45 archer_ms_deadeye, m90 archer_ms_trueshot}` (bench: `archer_call_pet archer_snare_trap archer_hunters_mark`);
**BM** bar `{lmb archer_basic, rmb archer_aimed_shot, q archer_disengage, e archer_kill_command, s1 archer_call_pet, s2 archer_snare_trap, s3 archer_serpent_sting, r archer_arrow_storm, m45 archer_bm_bestial_wrath, m90 archer_bm_pack_hunt}` (bench: `archer_multishot archer_explosive_arrow archer_hunters_mark`).

---

## 4. Paladin (`paladin`) — "Işığın Yeminli Kılıcı"

**Lore.** *Güneş Mührü Tarikatı*'nın paladinleri, Ak Kale'nin surlarında kutsal bir yeminle kılıç, topuz ve kalkan taşır. Işık onların elinde kâh bir siper, kâh bir şifa, kâh bir
yargıdır. **Fantasy**: aura taşıyan, hüküm veren, ölmekte olan dostu "Şifa Eli" ile geri çağıran zırhlı savaş rahibi (Knight'ın kutsal kuzeni; Knight kalkanlı bruiser'dır,
Paladin ise Kutsal Güç ritmi + aura + şifa ile oynanır).

**Specs** (L10): **Koruma** (`paladin_protection`, TANK), **Kutsal** (`paladin_holy`, HEALER), **Ceza** (`paladin_retribution`, DPS) — the user's example "Paladin: Koruma / Kutsal / Ceza".

### 4.1 Stats, resource, trait

| field | value |
|---|---|
| `resource` | `faith` (`'İnanç'`, colour `#ffe9a0`, regen 5/s, starts full) + pips `holypower` (max 5, no decay) |
| `baseStats` | `{ str: 14, dex: 8, int: 10, vit: 16, resourceRegen: 5 }` |
| `perLevel` | `{ str: 3, dex: 0, int: 1, vit: 3 }` (L60 ⇒ 191 / 8 / 69 / 193; armour from Güç 382) |
| `hpPerLevel` / `hpPerVit` | 11 / 10 (L1 HP 221, L60 naked 2,640) |
| `mainStat` / armour | `str` / heavy (`WEIGHT_CLASSES.heavy` += paladin) |
| trait `trait_devotion` — **Adanmışlık** | +10 % kutsal hasar, +10 % şifa gücü (`healingPct`), blocking a hit grants +4 İnanç |
| camera / tempo | `cameraProfile 'melee'`; tempo = `FEEL_WEAPON.mace` 0.95 |

### 4.2 Model recipe and animation map

| item | value |
|---|---|
| model | `/assets/models/characters/Knight.glb` (`visual.paletteClass 'knight'`, `defaultVariant 4` "Altın", `defaultTint 0xfff0c0`) |
| nodes | show `Badge_Shield Knight_Helmet Knight_Cape`; stand-in main `1H_Sword`; hide `Round_Shield Rectangle_Shield Spike_Shield 2H_Sword 1H_Sword_Offhand` |
| items | `mace_t*` attach the generated `mace_flanged.glb` / `mace_morningstar.glb` (`ATTACH.genBlade`); `sword1h_t*` and `shield_t*` use the Knight's existing models; Kule/Arma kalkanı for Koruma |
| clip map | idle `Idle`; block `Blocking`/`Block_Hit`; slice `1H_Melee_Attack_Slice_Diagonal` (0.38) / `…Horizontal` (0.427); stab `1H_Melee_Attack_Stab` (0.56); chop `1H_Melee_Attack_Chop` (0.448); shield punch `Block_Attack` (0.427); throw `Throw` (0.615); cast `Spellcast_Shoot` (0.373) / `Spellcast_Raise` (burst ≈ 0.95†); spin `2H_Melee_Attack_Spin`; cheer `Cheer`; leap `Jump_Full_Long` |

### 4.3 LMB chain — `paladin_basic` "Kutsal Zincir" (behavior `combo`, steps 4, reset 0.85)

`paladin_basic`: `anim '1H_Melee_Attack_Slice_Horizontal'`, `melee_arc`, `range 2.6`, `arc 140`, `tags [melee,basic,combo]`, `params {steps:4, reset:0.85}`. Kutsal Güç per chain = **2** (steps 3 and 4). Weights 0 · 0 · 4 · 1, stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0.

| id | Ad | KG | Hedef | Hasar | Anim ×speed @hit | VFX / SFX | params |
|---|---|:-:|---|---|---|---|---|
| `paladin_basic_1` | Yemin Kesiği | 0 | arc 140/2.6, knockback 0.5 | 0.80 phys | `1H_Melee_Attack_Slice_Horizontal` ×1.4 @0.427 | t `slash_arc` · sc `swing_light` | `end 0.75 chain 0.04 move 0.10 stagger 3 proc 0.8 gain 3 weight 0 upper 1 lunge 0.7 slow 0.45 step 1` |
| `paladin_basic_2` | Kalkan Yumruğu | 0 | arc 80/2.4, knockback 0.7 | 0.80 phys | `Block_Attack` ×1.5 @0.427 | t `slash_arc` i `block_spark` · sc `swing_light` si `shield_bash` | `end 0.64 chain 0.04 move 0.10 stagger 3 proc 0.8 gain 3 weight 0 upper 1 lunge 0.5 slow 0.5 step 2` |
| `paladin_basic_3` | Kutsal Saplama | +1 | arc 55/3.4, knockback 1.2 | 1.15 holy | `1H_Melee_Attack_Stab` ×1.75 @0.56 | t `holy_slash`(N) i `holy_burst` scale 0.35 · sc `swing_light` si `holy_impact`(N) | `end 0.95 chain 0.05 move 0.12 stagger 5 proc 0.9 gain 4 weight 4 upper 0 lunge 1.3 slow 0.5 step 3` |
| `paladin_basic_4` | Kutsal Balyoz | +1 | arc 100/3.1, knockback 2.0 | 1.72 holy | `1H_Melee_Attack_Chop` ×1.15 @0.448 | t `slash_arc_big` i `holy_burst` scale 0.5 · sc `swing_heavy` si `hammer_hit`(N) | `end 0.85 chain 0.06 move 0.20 stagger 9 proc 1 gain 6 weight 1 root 1 lunge 0.8 step 4 finisher 1 impactRadius 1.4` tags +`finisher` |

**Chain check**: cadence 0.365 + 0.325 + 0.360 + 0.440 = **1.489 s**, Σ coef 4.47 ⇒ **3.0 coef/s** (target 3.0); last step 1.72 = 2.15 × step 1. `FEEL_WEAPON.mace` (tempo 0.95, hit-stop/trauma/kick multipliers per GDD_LIFE) gives the chain its heavier feel.

### 4.4 Core skills (8)

| id | Ad | Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `paladin_crusader_strike` | Haçlı Darbesi | 1·rmb | 15, KG+1 | 4 (c2) | 0 | arc 100/2.8 | 2.3 holy | – | `1H_Melee_Attack_Slice_Diagonal` ×1.35 @0.38 | t `holy_slash` i `holy_burst` scale 0.45 · sc `swing_heavy` si `holy_impact` | melee holy builder | `end 0.7 chain 0.06 move 0.15 stagger 10 proc 1 weight 4 lunge 0.9 slow 0.6` |
| `paladin_judgement` | Yargı | 3·q | 10, KG+1 | 8 | 0 | proj v55 R20 r0.4 ×1 p0 | 1.8 holy | `judged` 10 s | `Spellcast_Shoot` ×1.4 @0.373 | p `holy_projectile` i `holy_burst` scale 0.4 · sc `holy_cast`(N) si `holy_impact` | spell holy projectile builder | `end 0.65 chain 0.08 move 0.15 stagger 6 proc 1 weight 0 upper 1 slow 0.5 threatMult 1.5` |
| `paladin_verdict` | Kutsal Hüküm | 6·e | KG−3 (consume up to 5) | 1.5 | 0 | arc 140/3.2, knockback 2.0 | 4.0 holy (+1.0 per extra KG) | – | `1H_Melee_Attack_Chop` ×1.2 @0.448 | t `slash_arc_big` i `holy_burst` · sc `swing_heavy` si `hammer_hit` | melee holy spender | `coefPerPip 1.0 end 0.85 chain 0.08 move 0.2 stagger 20 proc 1 weight 2 lunge 0.8 root 1`; route `{from:['@status:judged'], window:6, more:0.25}` |
| `paladin_avengers_shield` | İntikamcı Kalkan | 10·s1 | 25 | 15 | 0 | proj out R14 v22 r0.9 p99, returns, `custom:boomerang` | 1.6 holy per pass | `silence` 1.5 s; `taunt` 3 s (first target) | `Throw` ×1.5 @0.615 | p `holy_projectile` scale 1.2 (shield mesh) i `block_spark` · sc `swing_light` si `shield_bash` | ranged holy tank | `projMesh 2 tauntFirst 1 threatMult 2 end 0.95 chain 0.1 move 0.2 stagger 8 proc 0.7 weight 0 slow 0.6`; route `{from:['paladin_hammer_of_justice'], window:3, more:0.30}` |
| `paladin_hammer_of_justice` | Adalet Çekici | 15·s2 | 20 | 25 | 0 | proj v36 R14 r0.6 ×1 p0 | 1.2 holy | `stun` 1.8 s (elite 0.9) | `Throw` ×1.4 @0.615 | p `holy_hammer`(N) i `holy_burst` · sc `swing_heavy` si `hammer_hit` | ranged holy cc | `projMesh 3 end 0.95 chain 0.1 move 0.2 stagger 20 proc 1 weight 0` |
| `paladin_aura` | Aura | 20·selector | 0 | 1.5 | 0 | `self_buff` toggle (skill-panel selector, optional bar slot), `aura {radius 20, cycle [aura_devotion, aura_might, aura_clarity], interval 1}` | – | cycles the aura on every cast | `Cheer` ×2.0 @0.3 | c `aura_ring`(N) · sc `aura_on`(N) | aura buff | `end 0.55 chain 0.1 move 0.1 weight 0` |
| `paladin_lay_on_hands` | Şifa Eli | 25·kitap | 0 | 120 | 0 | `custom:heal_target` `allyTarget friendly` R30 | heal 100 % of max HP | target: `forbearance` 90 s, cleanse | `Spellcast_Raise` ×2.0 @0.95† | c `heal_pillar`(N) · sc `heal_big` | heal defensive | `healPct 1.0 cleanse 1 end 1.0 chain 0.1 move 0.2 weight 0` (refused if the target has `forbearance`) |
| `paladin_avenging_wrath` | İntikam Kanatları | 30·r | 0 | 60 | 0 | `self_buff` | – | self: `wrath_wings` 15 s (+1 KG per 2 s) | `Cheer` ×1.4 @0.35 | c `wings_aura`(N) follow 15 s + `holy_burst` scale 1.4 · sc `war_cry`+`holy_cast` | ultimate buff | `end 0.9 chain 0.15 move 0.2 weight 3 cc 1.5` (`cc 1.5` = CC-immune for 1.5 s) |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `paladin_basic` | Kılıç, kalkan ve kutsal ışıkla dört vuruşluk bir zincir yaparsın. Son iki vuruş kutsal hasar verir ve Kutsal Güç kazandırır. | Gold slash lines, shield punch spark, holy burst on the finisher. |
| `paladin_crusader_strike` | %230 kutsal hasar verir ve 1 Kutsal Güç kazandırır. | Gold crescent, ember. |
| `paladin_judgement` | Hedefi yargılarak %180 kutsal hasar verir ve 10 sn boyunca %10 daha az hasar vermesini sağlarsın; Kutsal Hüküm yargılı hedefe %25 daha güçlüdür. | Light lance from the sky onto the target. |
| `paladin_verdict` | 3 Kutsal Güç harcayarak %400 kutsal hasar verirsin (fazladan her puan +%100, en fazla 5). | Heavy golden chop with a ring (weight class heavy). |
| `paladin_avengers_shield` | Kalkanını fırlatırsın: üç düşmana sekip döner, her geçişte %160 hasar verir, ilk hedefi susturup kışkırtır. | Spinning shield, metal ricochet clang. |
| `paladin_hammer_of_justice` | Adalet Çekici'ni fırlatarak hedefi 1.8 sn sersemletir, %120 hasar verirsin. | Spinning golden hammer, stars. |
| `paladin_aura` | Her kullanımda sıradaki aurayı açar: Adanmışlık (%20 zırh), Güç (%8 hasar), Berraklık (%25 kaynak yenilenmesi, %20 kontrol azaltma). 20 m içindeki müttefikleri etkiler. | Gold ground ring around the paladin (runes rotate), distinct tint per aura. |
| `paladin_lay_on_hands` | Seçili müttefikin (yoksa en yaralının) canını tamamen yeniler ve kötü etkileri temizler. Hedef 90 sn Cezalandırıldı olur. | Light pillar, white flash, choir swell. |
| `paladin_avenging_wrath` | 15 saniye kanatlanırsın: hasarın ve şifan %30 artar, 2 sn'de bir Kutsal Güç kazanırsın. | Large wing-shaped aura, camera kick. |

### 4.5 Specs (GDD_V2 `SpecDef` shape; skills per V2 counts, majors L10 / L20)

| spec | passive (`stats` + special) | role | skills (unlock) | majors | weaponArt · guard · basic |
|---|---|---|---|---|---|
| `paladin_protection` Koruma | "Sarsılmaz Kalkan" (`trait_protection`): `stats {maxHpPct 0.30, armorPct 0.40, blockChance 0.15, blockAmount 0.10, healReceivedPct 0.10, threatPct 2.0}` (×3.0 threat); special `moreDamage 0.75, blockHolyPower 0.20, parryReflect 0.5` (own damage ×0.75; 20 % of blocks +1 KG; a parry reflects 0.5×W holy) | TANK | `paladin_reckoning` L10, `paladin_shield_of_righteous` L10, `paladin_blessed_hammer` L15 | `m45 paladin_prot_bulwark`, `m90 paladin_prot_ardent` | `wa_crushing_blow` · guard 100 / 180° / 0.60 |
| `paladin_holy` Kutsal | "Işığın Ustası" (`trait_holy`): `stats {healingPct 0.30, resourceRegenPct 0.25, castSpeed 0.10, threatPct −0.4}`; special `moreDamage 0.60, overhealWard 0.40, smartHeal 1` (own damage ×0.60; overheal becomes a 40 % `overheal_ward` absorb, cap 15 % of the target's max HP, 6 s — V2's mechanism, id `paladin_overheal`) | HEALER | `paladin_holy_shock` L10, `paladin_flash_of_light` L10, `paladin_cleanse` L12, `paladin_word_of_glory` L15, `paladin_light_of_dawn` L15 | `m45 paladin_holy_aura_mastery`, `m90 paladin_holy_sanctuary` | `wa_dawn_wave` · guard 100 / 160° / 0.60 · **basic `paladin_holy_basic`** |
| `paladin_retribution` Ceza | "Hüküm Sahibi" (`trait_retribution`): `stats {holyDamagePct 0.20, attackSpeed 0.10, critChance 0.05}`; special `hpGenChance 0.20, auraPower 0.25` (basic hits +1 KG 20 % of the time; the active aura is 25 % stronger) | DPS | `paladin_divine_storm` L10, `paladin_hammer_of_wrath` L15 | `m45 paladin_ret_crusade`, `m90 paladin_ret_execution` | `wa_crushing_blow` · guard 100 / 160° / 0.60 |

`mods` (V2 `SpecDef.mods`): Koruma — `paladin_judgement` `threatMult 1.5` and `paladin_avengers_shield` `threatMult 2` (both already in the rows; its first-target taunt stays as a ranged pick-up tool, `paladin_reckoning` is the guaranteed single-target taunt); Kutsal — `paladin_judgement` becomes a pure damage filler (heal-neutral), `paladin_avengers_shield` loses `tauntFirst` (silence only) and is benched; Ceza — `paladin_avengers_shield` loses `tauntFirst`, `paladin_verdict` +0.5 coef on `judged` targets.

**Koruma · Ceza spec skills and all majors**

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `paladin_reckoning` | Hesaplaşma | Prot · 10·spec1 | 0 | 8 | 0 | `custom:provoke` R25 (soft target) | – | `taunt` 3 s (boss: forced 2 s, ICD 12 s; threat := max(current, top × 1.10) + 100) | `Cheer` ×2.2 @0.3 | i `judgement_pillar`(N) scale 0.5 · sc `holy_cast` | taunt tank | `end 0.5 chain 0.05 move 0.1 weight 0` |
| `paladin_shield_of_righteous` | Doğruluk Kalkanı | Prot · 10·spec1 | KG−3 (up to 5) | 1.5 | 0 | arc 120/3.0 | 2.2 holy (+0.5 per extra KG) | self: `righteous` 6 s | `Block_Attack` ×1.5 @0.427 | c `shield_bubble` scale 0.6 i `holy_burst` scale 0.5 · sc `shield_bash` si `holy_impact` | melee holy tank defensive | `coefPerPip 0.5 end 0.64 chain 0.08 move 0.15 stagger 15 proc 1 weight 4 threatMult 2` |
| `paladin_blessed_hammer` | Kutsanmış Çekiç | Prot · 15·spec2 | 15, KG+1 | 6 (c3) | 0 | self r4.2, `custom:orbit_hammers` | 1.8 holy total (3 hammers × 0.6) | – | `Spellcast_Raise` ×2.0 @0.95† | c `holy_hammer` ×3 orbiting · sc `swing_heavy` si `hammer_hit` | spell holy aoe tank | `hammers 3 orbitTime 0.9 orbitRadius 4.2 hammerCoef 0.6 threatMult 2.5 end 1.2 chain 0.1 move 0.2 stagger 5 proc 0.6 weight 4` |
| `paladin_prot_bulwark` | İlahi Siper | Prot · m45 (L10) | 0 | 45 | 0 | `self_buff` | – | self: `bulwark` 8 s (−35 % damage, reflect 20 % as holy, CC immune) | `Cheer` ×1.8 @0.3 | c `shield_bubble` (vfxColor 0xffe9a0) · sc `divine_shield`(N) | defensive major | `major 45 end 0.7 chain 0.1 move 0.15 weight 1` |
| `paladin_prot_ardent` | Yılmaz Savunucu | Prot · m90 (L20) | 0 | 90 | 0 | `self_buff` | – | self: `ardent` 10 s | `Cheer` ×1.4 @0.3 | c `shield_bubble` + `heal_burst` · sc `divine_shield` | defensive major | `major 90 end 0.9 chain 0.1 move 0.2 weight 2` (−20 % damage; the first lethal hit leaves 25 % HP and ends it; if it never triggers: heal 20 % at expiry) |
| `paladin_divine_storm` | İlahi Fırtına | Ret · 10·spec1 | KG−3 (up to 5) | 1.5 | 0 | self r5 | 3.6 holy (+0.7 per extra KG) | – | `2H_Melee_Attack_Spin` ×2.4 @0.6 | c `spin_slash` (vfxColor 0xffe9a0) i `holy_burst` · sc `swing_heavy` si `holy_impact` | melee holy aoe spender | `coefPerPip 0.7 end 1.0 chain 0.1 move 0.25 stagger 20 proc 1 weight 2` |
| `paladin_hammer_of_wrath` | Gazap Çekici | Ret · 15·spec2 | 25, KG+2 | 6 | 0 | proj v36 R22 r0.6 p0 (thrown hammer) | 5.0 holy | – | `Throw` ×1.4 @0.615 | p `holy_hammer` i `holy_burst` scale 0.8 · sc `swing_heavy` si `hammer_hit` | ranged holy execute | `executeBelow 0.35 projMesh 3 end 0.95 chain 0.1 move 0.2 stagger 25 proc 1 weight 2` (usable on targets < 35 % HP, or on any target during `wrath_wings`; otherwise the cast is refused with the `target` fail reason) |
| `paladin_ret_crusade` | Haçlı Seferi | Ret · m45 (L10) | 0 | 45 | 0 | `self_buff` | – | self: `crusade` 12 s (+25 % damage, +20 % attack speed) | `Cheer` ×1.8 @0.3 | c `buff_aura` + `holy_burst` · sc `war_cry` | buff major | `major 45 end 0.7 chain 0.1 move 0.15 weight 1` (+1 KG per 2 s) |
| `paladin_ret_execution` | İdam Hükmü | Ret · m90 (L20) | 0 | 90 | 0 | `custom:target_status` R20 | 6.0 holy burst on expiry (+ 50 % of the damage dealt to it) | target: `sentenced` 8 s | `Spellcast_Shoot` ×1.6 @0.373 | i `judgement_pillar`(N) at the end · sc `holy_cast` si `explosion` | burst major | `major 90 end 0.6 chain 0.1 move 0.15 weight 2 store 0.5` |

**Kutsal (healer) kit — `paladin_holy_basic` "Işık Oku" (behavior `combo`, steps 3, reset 0.8, `allyTarget 'any'`, behavior `heal_bolt` = V2's `light_bolt`)**: the projectile heals the first **ally** it touches and damages the first **enemy**; the soft ally target (V2 §1.6) bends its aim.

| id | Ad | Hedef | Hasar / şifa | Anim ×speed @hit | VFX / SFX | params |
|---|---|---|---|---|---|---|
| `paladin_holy_basic_1` | Işık Oku | proj v45 R26 r0.4 ×1 p0, knockback 0.5 | 1.0 holy · heal 0.40 | `Spellcast_Shoot` ×1.4 @0.373 | p `holy_projectile` i `holy_burst` scale 0.3 / `heal_burst` · sc `holy_cast` si `holy_impact` | `end 0.65 chain 0.04 move 0.08 stagger 3 proc 0.7 gain 3 weight 0 upper 1 slow 0.35 step 1 hand 0` |
| `paladin_holy_basic_2` | Işık Oku | same, knockback 0.7 | 1.0 holy · heal 0.40 | same | same | `… stagger 3 … step 2 hand 1` |
| `paladin_holy_basic_3` | Üçlü Işık | ×3 spread 8, knockback 1.2 | 0.55 holy · heal 0.25 (each) | `Spellcast_Shoot` ×1.2 @0.373 | same | `end 0.7 chain 0.06 move 0.12 stagger 5 proc 0.7 gain 3 weight 1 slow 0.4 step 3 finisher 1` + `pip.gain 1` |

**Kutsal spec skills and majors**

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar / şifa | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `paladin_holy_shock` | Kutsal Şok | Holy · 10·spec1 | 20, KG+1 | 6 | 0 | `custom:heal_target` `allyTarget any` R25 | heal 1.3 / dmg 1.8 holy | – | `Spellcast_Shoot` ×1.6 @0.373 | c `holy_beam`(N) (to target) i `heal_burst` / `holy_burst` · sc `holy_cast` si `holy_impact` | spell holy heal | `end 0.6 chain 0.06 move 0.12 stagger 8 proc 1 weight 4 upper 1 slow 0.5` |
| `paladin_flash_of_light` | Işık Parlaması | Holy · 10·spec1 | 25 | 0 | c1.0 (÷ castRate) | `custom:heal_target` `allyTarget friendly` R30 | heal 2.4 | – | `Spellcast_Raise` ×1.8 @0.55† | c `holy_beam` + `heal_burst` · sc `holy_cast` si `heal` | spell holy heal | `end 0.7 chain 0.1 move 0.2 weight 0 smartPriority 1` |
| `paladin_cleanse` | Arındırma | Holy · 12·spec2 | 14 | 6 | 0 | `custom:heal_target` `allyTarget friendly` R30 | heal 0.5 if something was removed | removes up to 2 dispellable debuffs | `Use_Item` ×2.0 @0.72 | c `holy_beam` i `heal_burst` · sc `holy_cast` | spell holy dispel | `dispel 2 end 0.6 chain 0.1 move 0.15 weight 0 smartPriority 1` |
| `paladin_word_of_glory` | Işığın Sözü | Holy · 15·spec2 | KG−3 (up to 5) | 1.0 | 0 | `custom:heal_target` `allyTarget friendly` R30 | heal 2.6 (+0.8 per extra KG) | – | `Spellcast_Raise` ×2.2 @0.95† | c `holy_beam` + `heal_pillar` · sc `holy_cast` si `heal_big` | spell holy heal spender | `coefPerPip 0.8 end 1.0 chain 0.1 move 0.2 weight 0 smartPriority 1`; route `{from:['paladin_holy_shock'], window:4, pipCostDelta:-1}` |
| `paladin_light_of_dawn` | Şafak Işığı | Holy · 15·spec2 | KG−3 (up to 5) | 1.5 | 0 | cone arc 70/10 (up to 5 allies) | heal 1.8 each (+0.4 per extra KG) | – | `Spellcast_Raise` ×2.0 @0.95† | c `holy_beam` cone + `heal_burst` per ally · sc `holy_cast` si `heal_big` | spell holy heal aoe | `coefPerPip 0.4 maxTargets 5 end 1.0 chain 0.1 move 0.2 weight 0 smartPriority 1` |
| `paladin_holy_aura_mastery` | Aura Ustalığı | Holy · m45 (L10) | 0 | 45 | 0 | `self_aoe` r20 (party) | – | allies and self: `aura_mastery` 10 s (−20 % damage taken, aura radius ×1.5) | `Cheer` ×1.8 @0.3 | c `aura_ring` scale 2 + `holy_burst` · sc `aura_on` | party defensive major | `major 45 end 0.7 chain 0.1 move 0.15 weight 1` |
| `paladin_holy_sanctuary` | Tyr'ın Sığınağı | Holy · m90 (L20) | 0 | 90 | 0 | ground at caster r9 d12 t12 (`atCaster 1`) | allies: heal 0.45 per tick (12 ticks); enemies: 0.3 holy per tick | allies: knockback immune | `Spellcast_Raise` ×1.6 @0.95† | g `holy_ground`(N) scale 3 · sc `holy_cast` | party heal major | `major 90 end 1.2 chain 0.1 move 0.25 weight 2 healTick 1` |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `paladin_reckoning` | Hedefi 3 saniye boyunca kendine kışkırtır ve tehdidini en üste çıkarırsın (patronlarda 2 sn, 12 sn bekleme). | Gold lance of light on the target. |
| `paladin_shield_of_righteous` | 3 Kutsal Güç harcayarak önündekilere %220 kutsal hasar verir ve 6 sn boyunca zırhını %40, blok şansını %20 artırırsın. | Brief golden dome over the shield arm. |
| `paladin_blessed_hammer` | Çevrende dönen üç kutsal çekiç yaratır, her biri %60 hasar verir ve düşmanların dikkatini çeker. 1 Kutsal Güç kazandırır. | Three hammers spiral outward, thump each hit. |
| `paladin_prot_bulwark` | 8 saniye boyunca %35 daha az hasar alır, vuran düşmanlara hasarın %20'sini geri yansıtır ve kontrol etkilerine bağışık olursun. | Gold bubble with rotating runes. |
| `paladin_prot_ardent` | 10 saniye boyunca %20 daha az hasar alırsın; ölümcül bir darbe alırsan canının %25'iyle ayakta kalırsın. Hiç tetiklenmezse bitince %20 can yenilersin. | Gold-white bubble, heartbeat. |
| `paladin_divine_storm` | 3 Kutsal Güç harcayarak çevrene %360 kutsal hasar veren bir kasırga yaratırsın. | Golden whirlwind. |
| `paladin_hammer_of_wrath` | Canı %35'in altındaki (ya da İntikam Kanatları sırasında herhangi bir) düşmana %500 kutsal hasarlı çekiç fırlatır, 2 Kutsal Güç kazandırır. | Spinning hammer, golden flash on impact. |
| `paladin_ret_crusade` | 12 saniye boyunca %25 daha çok hasar verir, %20 daha hızlı saldırır ve 2 sn'de bir Kutsal Güç kazanırsın. | Radiant outline on the character. |
| `paladin_ret_execution` | Hedefi 8 sn boyunca hükümlü kılarsın; süre bitince ona verdiğin hasarın %50'si artı %600 hasarla patlar. | Pillar of light on expiry. |
| `paladin_holy_basic` | Işık okları fırlatırsın: ilk çarptığı müttefiki iyileştirir, düşmana hasar verir. Üçüncü atış üç ok gönderir ve 1 Kutsal Güç kazandırır. | Soft white bolts, green heal sparkle on allies. |
| `paladin_holy_shock` | Müttefiki %130 iyileştirir ya da düşmana %180 kutsal hasar verir; 1 Kutsal Güç kazandırır. | Beam from hand to target. |
| `paladin_flash_of_light` | 1 saniyede dökülen büyük bir şifa: müttefiki %240 iyileştirir. | Soft beam, white flash. |
| `paladin_cleanse` | Müttefikten en fazla 2 temizlenebilir olumsuz etkiyi kaldırır; bir şey kaldırırsa %50 iyileştirir. | Green-white ripple. |
| `paladin_word_of_glory` | 3 Kutsal Güç harcayarak müttefiki %260 iyileştirirsin (fazladan her puan +%80). Kutsal Şok'tan sonra 1 puan az harcar. | Light pillar on the ally. |
| `paladin_light_of_dawn` | 3 Kutsal Güç harcayarak önündeki koninin içindeki en fazla 5 müttefiki %180 iyileştirirsin (fazladan her puan +%40). | Cone of dawn light, petals on each ally. |
| `paladin_holy_aura_mastery` | 10 saniye boyunca 20 m içindeki tüm müttefikler %20 daha az hasar alır ve aura yarıçapı %50 büyür. | Huge expanding aura ring. |
| `paladin_holy_sanctuary` | 12 saniye süren bir sığınak kurarsın: içindeki müttefikler her saniye %45 iyileşir, düşmanlar kutsal hasar alır. | Gold runic circle, rising motes. |

### 4.6 Combo routes and rotations

* **Judge → Verdict**: Yargı (+1 KG, `judged`) then Kutsal Hüküm (3 KG) on the judged target: +25 %. Prot variant: Yargı → **Doğruluk Kalkanı**.
* **Stun → Shield**: Adalet Çekici stun → İntikamcı Kalkan (+30 %, silence +1 s): lock a caster pack.
* **Holy**: Kutsal Şok (+1 KG, heal) → Işığın Sözü (−1 KG cost) on the lowest ally; Işık Parlaması on spikes; Işık Oku basics (+3 İnanç) in between; Şafak Işığı when ≥ 3 allies are hurt. The chosen aura stays on for the whole fight (Berraklık for long fights, Adanmışlık for tank damage, Güç for burst windows).
* **Ret**: Haçlı Darbesi ×2 (+2 KG) → İlahi Fırtına / Kutsal Hüküm; Gazap Çekici (+2 KG) on any target < 35 % or during Kanatlar; Haçlı Seferi + İdam Hükmü on bosses.
* **Prot rotation** (V2 priority-list style): pull start → Hesaplaşma on the first mob; loose mobs → Avenger's Shield; Kutsal Güç ≥ 3 and no `righteous` → Doğruluk Kalkanı; filler Haçlı Darbesi (+1) → Kutsanmış Çekiç (+1) → Yargı (+1); majors per V2 tank-buster rules.

### 4.7 Vuruş hissi

Weights: chain steps `light · light · medium · finisher` with the `FEEL_WEAPON.mace` multipliers (tempo 0.95; heavier than the Knight's sword); Haçlı Darbesi `medium`; Kutsal Hüküm, Kutsanmış Çekiç (per hammer), Doğruluk Kalkanı, Gazap Çekici, İlahi Fırtına `heavy` (gold ring + hammer thump); Adalet Çekici stun stars; the shield punch plays `block_spark` + `shield_bash`; heals show a green `+` number and a short `heal_burst` on the target plus a soft `heal` chime (never louder than combat sfx). Barks: `voice_warrior_defend` when a block happens (existing), `voice_warrior_angry` on İntikam Kanatları. Majors follow V2 §2.3 (defensive: gold vignette; burst-heal: white-gold bloom).

### 4.8 Starting kit, default bars

`startingItems ['mace_t1','shield_t1']` (+ `chest_heavy_t1 boots_heavy_t1 helm_heavy_t1 gloves_heavy_t1`), bag `['sword1h_t1']` (Ceza prefers a sword for the extra APS). The **aura** is chosen in the skill panel (`flags['paladin.aura']`, default `aura_devotion` once `paladin_aura` unlocks at L20) and stays active through deaths and scene changes — it needs no bar slot (a slotted `paladin_aura` cycles it in combat).
**Koruma** `{lmb paladin_basic, rmb paladin_crusader_strike, q paladin_judgement, e paladin_shield_of_righteous, s1 paladin_avengers_shield, s2 paladin_blessed_hammer, s3 paladin_reckoning, r paladin_avenging_wrath, m45 paladin_prot_bulwark, m90 paladin_prot_ardent}` (bench: `paladin_verdict paladin_hammer_of_justice paladin_lay_on_hands paladin_aura`);
**Kutsal** `{lmb paladin_holy_basic, rmb paladin_holy_shock, q paladin_flash_of_light, e paladin_word_of_glory, s1 paladin_light_of_dawn, s2 paladin_cleanse, s3 paladin_lay_on_hands, r paladin_avenging_wrath, m45 paladin_holy_aura_mastery, m90 paladin_holy_sanctuary}` (bench: `paladin_judgement paladin_crusader_strike paladin_hammer_of_justice paladin_aura`);
**Ceza** `{lmb paladin_basic, rmb paladin_crusader_strike, q paladin_judgement, e paladin_verdict, s1 paladin_divine_storm, s2 paladin_hammer_of_wrath, s3 paladin_hammer_of_justice, r paladin_avenging_wrath, m45 paladin_ret_crusade, m90 paladin_ret_execution}` (bench: `paladin_avengers_shield paladin_lay_on_hands paladin_aura`).

---

## 5. Nekromant (`necromancer`) — "Kemiklerin Fısıltısı"

**Lore.** *Kuzgun Kastı*'nın nekromantları ölümü bir son değil, bir hammadde sayar: düşen her düşmanın cesedi bir iskelete, bir patlamaya ya da bir lanete dönüşür. Kemik Mahzeni'nin
iskeletleri onların seve seve çağırdığı askerlerdir. **Fantasy**: ordu komutanı ya da kemik cerrahı; cesetler ve minion'larla dolu bir savaş alanı.

**Specs** (L10): **Ordu Efendisi** (`necromancer_summoner`, DPS — minion'lar), **Kemik Ustası** (`necromancer_bone`, DPS — doğrudan kemik/ceset hasarı). Wave 2 seed: **Kan Rahibi** (sustain/tank, HP-cost spells).

### 5.1 Stats, resource, trait

| field | value |
|---|---|
| `resource` | `essence` (`'Öz'`, colour `#6fe3b0`, regen 7/s, +8 per consumed corpse), no pips (corpses are world objects) |
| `baseStats` | `{ str: 6, dex: 8, int: 18, vit: 14, resourceRegen: 7 }` |
| `perLevel` | `{ str: 0, dex: 1, int: 4, vit: 2 }` (L60 ⇒ 6 / 67 / 254 / 132) |
| `hpPerLevel` / `hpPerVit` | 8 / 9 (L1 HP 184, L60 naked 1,718 — same as Büyücü) |
| `mainStat` / armour | `int` / light |
| trait `trait_corpse_harvest` — **Ceset Hasadı** | enemies leave a corpse for 10 s (§1.6); consuming one gives +8 Öz; minion damage +15 % (`minionDamagePct`) |
| camera / tempo | `cameraProfile 'caster'`; tempo = `FEEL_WEAPON.staff` 1.0 |

### 5.2 Model recipe and animation map

| item | value |
|---|---|
| model | `/assets/models/characters/Mage.glb` (`visual.paletteClass 'mage'`, `defaultVariant 5` "Gölge", `defaultTint 0xb8ffd8`) |
| nodes | show `Mage_Cape`; hide `Mage_Hat 1H_Wand Spellbook Spellbook_open`; stand-in main `2H_Staff` only when no gear model resolves |
| staff | `ItemBaseDef.modelByClass.necromancer = '/assets/models/gen/weapons/staff_skull.glb'` for every `staff_t*`, `wand_bone.glb` for `wand_t*` (grip model rule unchanged, `ATTACH.genBlade`/stick) |
| clip map | idle `Idle`; shard `Spellcast_Shoot` (0.373); burst `Spellcast_Raise` (≈ 0.95†); long `Spellcast_Long`; **summon `Spellcast_Summon`** (4.3 s skeleton-rig clip, effect ≈ 2.2†); channel `Spellcasting` (loop); staff thrust `2H_Melee_Attack_Stab` (0.56); command `Taunt` (1.033, effect 0.4†); cheer `Cheer` |

### 5.3 LMB chain — `necro_basic` "Kemik Kırıntıları" (behavior `combo`, steps 4, reset 0.8)

`necro_basic`: `anim 'Spellcast_Shoot'`, `projectile`, `range 22`, `tags [spell,basic,combo,projectile,shadow]`, `params {steps:4, reset:0.8}`. Öz gain via `params.gain` (+3/+3/+4/0). Weights 0 · 0 · 4 · 1, stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0 (GDD_LIFE chain rules).

| id | Ad | Hedef | Hasar | Anim ×speed @hit | VFX / SFX | params |
|---|---|---|---|---|---|---|
| `necro_basic_1` | Kemik Kıymığı | proj v32 R22 r0.35 ×1 p0, knockback 0.5 | 0.80 shadow | `Spellcast_Shoot` ×1.3 @0.373 | p `bone_projectile` scale 0.6 i `bone_burst`(N) scale 0.4 · sc `bone_cast`(N) si `bone_impact`(N) | `end 0.7 chain 0.05 move 0.10 stagger 3 proc 0.7 gain 3 weight 0 upper 1 slow 0.4 step 1 hand 0` |
| `necro_basic_2` | Kemik Kıymığı | same, knockback 0.7 | 0.80 shadow | same | same | `… step 2 hand 1` |
| `necro_basic_3` | Ruh Mızrağı | arc 55/3.2, knockback 1.2 (staff thrust) | 1.20 shadow | `2H_Melee_Attack_Stab` ×1.8 @0.56 | t `slash_arc` (shadow tint) i `hit_magic` · sc `swing_light` si `shadow_impact` | `end 0.95 chain 0.05 move 0.12 stagger 5 proc 0.8 gain 4 weight 4 upper 0 lunge 1.0 slow 0.5 step 3` |
| `necro_basic_4` | Kemik Patlaması | ground R4 r2.4 (burst in front), knockback 2.0 | 1.91 phys | `Spellcast_Raise` ×2.2 @0.95† | g `bone_burst` i `death_bones` · sc `bone_cast` si `bone_impact` | `end 1.0 chain 0.06 move 0.20 stagger 9 proc 1 gain 0 weight 1 step 4 finisher 1 knockup 0.5` |

**Chain check**: cadence 0.33 + 0.30 + 0.41 + 0.53 = **1.57 s**, Σ coef 4.71 ⇒ **3.0 coef/s** (GDD_LIFE target 3.0 + minions); last step 1.91 = 2.39 × step 1. `FEEL_WEAPON.staff` tempo 1.0.

### 5.4 Core skills (8)

| id | Ad | Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `necro_bone_spear` | Kemik Mızrağı | 1·rmb | 20 | 0 | 0 | proj v38 R24 r0.5 ×1 p99 | 2.4 phys | – | `Spellcast_Shoot` ×1.2 @0.373 | p `bone_projectile` scale 1.7 i `bone_burst` · sc `bone_cast` si `bone_impact` | spell projectile physical bone | `end 0.7 chain 0.1 move 0.2 stagger 8 proc 1 weight 0 upper 1 slow 0.5` |
| `necro_raise_skeleton` | İskelet Çağır | 3·q | 25 (refunded when a corpse is used) | 1.5 | 0 | `custom:minion_summon`, `minion {id:'auto', count 1, cap 4, group 'skeleton'}` | – | – | `Spellcast_Raise` ×2.4 @0.6† | g `grave_rise`(N) at 3 m ahead · sc `raise_dead`(N) | summon | `corpseRange 12 corpseHpBonus 0.4 corpseRefund 1.0 end 0.7 chain 0.1 move 0.15 weight 0` (composition by count: warrior, warrior, archer, mage, archer, warrior) |
| `necro_corpse_explosion` | Ceset Patlaması | 6·e | 30 | 3 | 0 | `custom:corpse_explosion` R16 r4.2 (nearest corpse within 6 m of the aim point) | 3.6 shadow, knockback 2.0 | – | `Spellcast_Raise` ×2.2 @0.95† | i `corpse_explosion`(N) · sc `corpse_pop`(N) si `bone_impact` | spell shadow aoe corpse | `corpseSearch 6 livingCoef 0.4 explChain 2 explChainMult 0.5 stagger 18 proc 1 weight 2 end 1.2 chain 0.1 move 0.25`; route `{from:['necro_bone_spear'], window:3, more:0.40}` + `routeRadius 1` |
| `necro_bone_prison` | Kemik Hapishanesi | 10·s1 | 30 | 14 | 0 | ground R16 r3.5 d4, `custom:bone_prison` | 1.2 phys | root 3.5 s | `Spellcast_Raise` ×2.2 @0.95† | g `bone_prison`(N) · sc `bone_cast` si `bone_impact` | spell cc zone | `ring 1 end 1.2 chain 0.1 move 0.25 stagger 10 proc 0.8 weight 1` |
| `necro_curse_decay` | Lanet: Çürüme | 15·s2 | 25 | 12 | 0 | ground R14 r5 d10 t20 | 0.35~ shadow | `curse_decay` 1.5 s (refresh), `curse` 1.5 s | `Spellcast_Raise` ×2.0 @0.95† | g `curse_ring`(N) · sc `curse_cast`(N) | spell curse zone | `tick 0.5 end 1.2 chain 0.1 move 0.25 stagger 1 proc 0.2 weight 0 curse 1` |
| `necro_blood_siphon` | Kan Emişi | 20·s3 | 10 + 14/s | 0 | k3 (6 ticks) | beam R12, `custom:beam_drain` | 0.5~ shadow (tick 0.5) | heals you and minions within 8 m for 50 % of damage | hold `Spellcasting` | c `drain_beam`(N) linked to the target · sc `curse_cast` + `drain_loop`(N) | spell channel drain | `tick 0.5 beam 1 heal 0.5 healMinion 0.5 costPerSec 14 range 12 moveSlow 0.5 end 0.3 stagger 1 proc 0.3 weight 0`; route `{from:['necro_curse_decay'], window:6, more:0.5}` (damage and heal ×1.5) |
| `necro_bone_armor` | Kemik Zırhı | 25·kitap | 20 | 20 | 0 | `self_buff` | thorns 0.6 shadow per absorbed hit | self: `bone_armor` 20 s (5 stacks) | `Spellcast_Raise` ×2.2 @0.6† | c `bone_armor`(N) follow 20 s · sc `bone_cast` | buff defensive | `armorStacks 5 absorbPct 0.08 thorns 0.6 end 0.8 chain 0.1 move 0.15 weight 0` (each stack absorbs one hit up to 8 % max HP) |
| `necro_army_of_the_dead` | Ölüler Ordusu | 30·r | 50 | 70 | 0 (wind-up 1.1 s) | `custom:minion_summon`, `minion {id:'necro_skel_rabble', count 8, life 18, ignoreCap, group 'army'}` | – | – | `Spellcast_Summon` ×2.0 @2.2† | g `grave_rise` ring r4.5 + `shockwave` · sc `raise_dead` + `boss_roar` | ultimate summon | `corpseSlots 4 ringRadius 4.5 end 3.0 chain 0.2 move 0.3 weight 3` (up to 4 nearby corpses upgrade their slot to a `necro_skel_warrior`; corpses play `Death_C_Skeletons_Resurrect` ×1.5) |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `necro_basic` | Asandan kemik kıymıkları fırlatır, ardından asanla saplar ve yerden kemik patlatırsın. Her vuruş Öz kazandırır. | Small bone shards, green-tinged thrust, bones erupt for the finisher. |
| `necro_bone_spear` | Önündeki tüm düşmanları delen bir kemik mızrağı fırlatırsın: %240 hasar. | Long white spear, dust/bone burst. Cheap way to leave corpses. |
| `necro_raise_skeleton` | Yerden bir iskelet çağırırsın (en fazla 4). Yakındaki bir cesedi kullanırsan %40 daha dayanıklı olur ve Öz iade edilir. | Skeleton claws out of the ground (`Spawn_Ground_Skeletons` ×2.2). |
| `necro_corpse_explosion` | En yakın cesedi patlatarak çevresine %360 gölge hasarı verirsin; patlamada ölenler de %50 gücünde patlar. Kemik Mızrağı'ndan sonra %40 daha güçlü ve +1 m geniştir. | Green-grey gore burst + bone chunks (heavy weight class). |
| `necro_bone_prison` | Hedef bölgeyi 4 saniyeliğine bir kemik kafesine çevirir, içindekileri köklersin. | Bone ribs rise in a ring. |
| `necro_curse_decay` | 10 saniye süren bir lanet alanı: içindekiler çürür, yavaşlar ve %20 daha az hasar verir. | Sickly green sigil, drifting wisps. |
| `necro_blood_siphon` | Hedeften can emerek her 0.5 sn %50 hasar verir ve verdiğin hasarın yarısı kadar seni ve yakındaki minion'ları iyileştirirsin. | Red-black beam to the caster. |
| `necro_bone_armor` | 20 saniye boyunca 5 kemik kalkanı kuşanırsın: her biri bir vuruşu (en fazla %8 can) emer ve saldırana gölge hasarı yansıtır. | Bones orbit the character, one shatters per hit. |
| `necro_army_of_the_dead` | 8 iskelet askeri çağırırsın (18 sn). Yakındaki cesetler iskelet savaşçıya dönüşür. | Skeleton horde bursts from the ground in a ring (ultimate weight class). |

### 5.5 Specs (GDD_V2 `SpecDef` shape; skills L10 / L15, majors L10 / L20)

**`necromancer_summoner` — Ordu Efendisi (DPS).** Tagline "Ölüler Emrinde". Passive "Ordu Komutanı" (`trait_summoner`): `stats {minionDamagePct 0.25, minionHpPct 0.20}`, special `skeletonCap 2, damageToMinions 0.15` (skeleton cap 4 → 6; 15 % of the damage you take is paid by your minions via `Combat.redirectDamage`). `skills` `necro_golem` (L10), `necro_command_army` (L15); majors `m45 necro_sm_frenzy` (L10), `m90 necro_sm_bone_knights` (L20); `weaponArt wa_bone_spike`; no guard (parry window only); `mods []`.
**`necromancer_bone` — Kemik Ustası (DPS).** Tagline "Kemiğin Hükmü". Passive "Kemik Ustası" (`trait_bone`): `stats {physicalDamagePct 0.15, resourceRegenPct 0.25}`, special `spearPierce 1, armorStacks 3, explosionRadius 0.15`. `skills` `necro_bone_storm` (L10), `necro_blood_surge` (L15); majors `m45 necro_bn_bone_spirit` (L10), `m90 necro_bn_lich_form` (L20); `weaponArt wa_bone_spike`; `mods []`.

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `necro_golem` | Kemik Golemi | Sum · 10·spec1 | 60 | 30 | 0 | `custom:minion_summon`, `minion {id 'necro_bone_golem', cap 1, group 'golem'}` | – | – | `Spellcast_Raise` ×1.5 @1.05† | g `grave_rise` scale 1.5 + `shockwave` · sc `raise_dead` + `ground_slam` | summon | `corpseSlots 2 end 1.4 chain 0.1 move 0.3 weight 2` (each corpse +20 % golem HP) |
| `necro_command_army` | Ordu: Hücum! | Sum · 15·spec2 | 0 | 12 | 0 | `custom:minion_command` R30 | each minion strikes 1.2 shadow (AoE r2) | targets: `taunt` 2 s | `Taunt` ×1.8 @0.4† | c `curse_ring` scale 0.8 · sc `curse_cast` | command | `cmdCoef 1.2 cmdRadius 2 taunt 2 stagger 8 weight 1 end 0.6 chain 0.1 move 0.15` (every minion within 40 m leaps/teleports next to the target and strikes) |
| `necro_bone_storm` | Kemik Fırtınası | Bone · 10·spec1 | 15 + 10/s | 10 | k3.5 | `custom:bone_storm`, self r3.6 (follows you) | 0.7~ phys (14 ticks) | – | hold `Spellcasting` | c `bone_storm`(N) follow · sc `bone_cast` loop | spell channel aoe bone | `tick 0.25 moveSlow 0.5 costPerSec 10 stagger 2 proc 0.3 weight 0 end 0.4 chain 0.1`; route `{from:['necro_bone_prison'], window:4, more:0.30}` |
| `necro_blood_surge` | Kan Dalgası | Bone · 15·spec2 | `hpCostPct 0.10` | 12 | 0 | self r6 | 4.5 shadow | heals 8 % max HP per enemy hit (max 5) | `Spellcast_Raise` ×2.2 @0.95† | c `death_nova`(N) · sc `corpse_pop` + `curse_cast` | spell shadow aoe | `healPerTarget 0.08 maxHealTargets 5 stagger 25 proc 1 weight 2 end 1.2 chain 0.1 move 0.25` |
| `necro_sm_frenzy` | Ölüm Çılgınlığı | Sum · m45 (L10) | 0 | 45 | 0 | `self_aoe` r40 (minions only) | each minion explodes on death for 1.5 shadow r3 | all minions: `frenzy_minions` 12 s | `Cheer` ×1.8 @0.3 | c `enrage_aura` on every minion · sc `war_cry` | buff major | `major 45 deathBlast 1.5 end 0.7 chain 0.1 move 0.15 weight 1` |
| `necro_sm_bone_knights` | Kemik Şövalyeleri | Sum · m90 (L20) | 0 | 90 | 0 | `custom:minion_summon`, `minion {id 'necro_bone_knight', count 2, life 25, group 'knight'}` | – | – | `Spellcast_Summon` ×2.0 @2.2† | g `grave_rise` ×2 + `shockwave` · sc `raise_dead` | summon major | `major 90 end 3.0 chain 0.2 move 0.3 weight 2` |
| `necro_bn_bone_spirit` | Kemik Ruhu | Bone · m45 (L10) | 0 | 45 | 0 | proj v18 R30 r0.6 homing | 9.0 shadow | – | `Spellcast_Shoot` ×1.2 @0.373 | p `shadow_projectile` scale 1.5 (vfxColor 0xe8ffd0) i `death_nova` scale 0.6 · sc `bone_cast` si `bone_impact` | burst major | `major 45 homing 1 stagger 30 proc 1 weight 2 upper 1 end 0.7 chain 0.1 move 0.2` (seeks the highest-HP enemy in 30 m) |
| `necro_bn_lich_form` | Lich Formu | Bone · m90 (L20) | 0 | 90 | 0 | `self_buff` | – | self: `lich` 15 s (Öz cost 0, +35 % damage, Kemik Mızrağı fires 3 spears spread 12°, CC immune) | `Spellcast_Raise` ×1.6 @0.6† | c `enrage_aura` (vfxColor 0x6fe3b0) + `bone_armor` · sc `curse_cast` + `boss_roar` | buff major | `major 90 end 1.0 chain 0.15 move 0.2 weight 3` |

| id | Açıklama (TR) |
|---|---|
| `necro_golem` | Kemiklerden dev bir golem yaratırsın (aynı anda 1). Kullanılan her ceset golemin canını %20 artırır. |
| `necro_command_army` | Tüm minion'larına hedefe atılmasını emredersin: her biri %120 hasarla vurur ve düşmanı 2 sn kışkırtır. |
| `necro_bone_storm` | 3.5 saniye boyunca etrafında dönen kemikler 14 kez %70 hasar verir. Dönerken yavaş hareket edebilirsin. Kemik Hapishanesi'nden sonra %30 daha güçlü. |
| `necro_blood_surge` | Mevcut canının %10'unu feda ederek çevrene %450 gölge hasarı verir; vurduğun her düşman için canının %8'ini (en fazla 5) yenilersin. |
| `necro_sm_frenzy` | 12 saniye boyunca tüm minion'larının saldırı hızı %60, hasarı %30 artar; ölünce patlarlar. |
| `necro_sm_bone_knights` | 25 saniyeliğine iki devasa kemik şövalyesi çağırırsın; düşmanları kışkırtıp önünde dururlar. |
| `necro_bn_bone_spirit` | En dayanıklı düşmana kilitlenen bir kemik ruhu salarsın: %900 gölge hasarı. |
| `necro_bn_lich_form` | 15 saniye Lich olursun: Öz harcamazsın, hasarın %35 artar, Kemik Mızrağı üç mızrak atar ve kontrol etkilerine bağışık olursun. |

### 5.6 Minions

Models are the existing KayKit skeleton rigs (same clips as `data/enemies.ts` `A_SKEL`); weapons from `/assets/models/weapons/skeleton/*`. Defaults for all skeleton-rig minions: anims `{idle 'Idle_Combat', walk 'Walking_A', run 'Running_A', hit 'Hit_A', death 'Death_C_Skeletons', spawn 'Spawn_Ground_Skeletons'}` (spawn played ×2.2), `radius 0.5`, `follow [2,4.5]`, `aggro 10`, `leash 28`.

| id | model · weapon · scale | role / group | hpFrac · armor | attacks (anim ×speed @hit, range, cd, coef) | notes |
|---|---|---|---|---|---|
| `necro_skel_warrior` | `Skeleton_Warrior.glb` · `Skeleton_Blade.gltf` (R) + `Skeleton_Shield_Small_A.gltf` (L) · 0.95 | tank / `skeleton` | 0.55 · 0.30 | `1H_Melee_Attack_Slice_Horizontal` ×1.3 @0.427 r2.6 arc 120 cd 1.4 coef 0.75 phys; `Block_Attack` ×1.4 @0.427 r2.4 cd 7 coef 0.5 stagger 8 + taunt 2 s | speed 6.0; weights 3 : 1 |
| `necro_skel_archer` | `Skeleton_Rogue.glb` · `Skeleton_Crossbow.gltf` (R, `ATTACH.crossbow` pose) · 0.95 | ranged / `skeleton` | 0.30 · 0.10 | `2H_Ranged_Shoot` ×1.3 @0.32 range 18 cd 1.9 coef 0.65 phys, bolt `bolt_projectile` v40 | keeps 14 m, kites back at `Walking_Backwards` |
| `necro_skel_mage` | `Skeleton_Mage.glb` · `Skeleton_Staff.gltf` (R) · 0.95 | caster / `skeleton` | 0.28 · 0.05 | `Spellcast_Shoot` ×1.2 @0.373 range 16 cd 2.4 coef 0.85 shadow, `shadow_projectile`, slow15%/1.5s | stays behind the owner |
| `necro_skel_rabble` | `Skeleton_Minion.glb` · `Skeleton_Axe.gltf` (R) · 0.9 | melee / `army` | 0.20 · 0.10 | `1H_Melee_Attack_Chop` ×1.3 @0.45 r2.6 cd 1.2 coef 0.6 phys | life 18 s, speed 6.8, 8 per cast |
| `necro_bone_golem` | `/assets/models/monsters/Giant.glb` · scale 0.85 · tint `0xe8dcc0` (the same look as the existing `bone_golem` enemy) | tank / `golem` | 1.20 · 0.50 | `Attack` @0.47 r3.6 arc 120 cd 2.4 coef 1.8 phys knockback 1.2; `Jump` slam (leap r6) landing AoE r3.5 cd 9 coef 2.4 stagger 15 | anims `Idle Walk Run HitRecieve Death`, speed 4.2, `radius 1.0`, `height 3.3` |
| `necro_bone_knight` | `Skeleton_Warrior.glb` · `Skeleton_Blade.gltf` (scale ×1.3) + `Skeleton_Shield_Large_A.gltf` · scale 1.3 · tint `0xcfc0ff` emissive `0x402080` | tank / `knight` | 0.90 · 0.45 | `1H_Melee_Attack_Slice_Horizontal` ×1.2 @0.427 r3.2 cd 1.5 coef 1.2; `Taunt` @0.4 taunt r7 3 s cd 8 | life 25 s, speed 5.8, `height 3.1` |

### 5.7 Combo routes and rotations

* **Bone Spear → Corpse Explosion**: pierce a line (leaves corpses as enemies die), then explode the nearest within 3 s: +40 %, +1 m radius, chain ×0.5 twice.
* **Prison → Storm** (Bone): root them, then the storm shreds (+30 %). **Curse → Siphon**: cursed target is drained for +50 % damage and heal.
* **Summoner**: Raise ×3–4 (each uses a corpse when available) → Golem (30 s) → Command Army on the pull → Frenzy (45 s) → Knights (90 s).
* Essence loop: basics (+3/+3/+4) + corpses (+8 each) + 7/s regen sustain ≈ one 20-Öz spell per 1.2 s.

### 5.8 Vuruş hissi

Weight classes (GDD_LIFE FEEL v2, no explicit hit-stop numbers here): shards `light` with a faint bone crack; **Ruh Mızrağı** `medium`; **Kemik Patlaması** `finisher` + 0.5 m pop + bone shower; Kemik Mızrağı `light`; **Ceset Patlaması** is the signature `heavy` impact: gore + bone chunks, short green screen flash, each chained explosion adds a smaller `medium` pulse; Kan Dalgası `heavy` + dark ring; summons are `ultimate`-weight camera cues for Ölüler Ordusu and `heavy` for the golem. Barks (mage pack, pitch 0.84): `voice_mage_spell_summon` on every summon, `voice_mage_spell_blind` on curses, `voice_mage_spell_cast` otherwise.

### 5.9 Starting kit, default bars

`startingItems ['staff_t1']` (+ `chest_light_t1 boots_light_t1 helm_light_t1 gloves_light_t1`), bag `['wand_t1','tome_t1']`.
**Ordu Efendisi** `{lmb necro_basic, rmb necro_bone_spear, q necro_raise_skeleton, e necro_corpse_explosion, s1 necro_golem, s2 necro_command_army, s3 necro_curse_decay, r necro_army_of_the_dead, m45 necro_sm_frenzy, m90 necro_sm_bone_knights}`;
**Kemik Ustası** `{lmb necro_basic, rmb necro_bone_spear, q necro_raise_skeleton, e necro_corpse_explosion, s1 necro_bone_storm, s2 necro_bone_prison, s3 necro_blood_surge, r necro_army_of_the_dead, m45 necro_bn_bone_spirit, m90 necro_bn_lich_form}`. `necro_blood_siphon` and `necro_bone_armor` stay benched (utility picks).

---

## 6. Warlock (`warlock`) — "Karanlığın Sözleşmesi"

**Lore.** *Kızıl Pakt*'ın warlock'ları, ölümden sonra ruhlarını gelecek bir hesap karşılığı bir iblise rehin bırakmış adamlardır. Acıyı zaman içinde bir silaha çevirir, iblislerini kendi
canlarından beslerler. **Fantasy**: yavaş yavaş çürüten laneti, kaos oku, çağırdığı iblis yoldaşı ve can–mana dengesi olan bir yarı-trajik büyücü.

**Specs** (L10): **Azap** (`warlock_affliction`, DPS — DoT, çok hedef, ramp), **Yıkım** (`warlock_destruction`, DPS — burst, Ruh Parçası harcayan Kaos Oku). Wave 2 seed: **İblis Ustası** (Demonology-like, pet-tank/AoE).

### 6.1 Stats, resource, trait

| field | value |
|---|---|
| `resource` | `mana` (`'Mana'`, colour `#4f8bff`, pool 100 + 0.25×Zeka, regen 6 + 0.015×Zeka, ×3 out of combat) + pips `shard` (max 5) |
| `baseStats` | `{ str: 6, dex: 8, int: 17, vit: 15, resourceRegen: 6 }` |
| `perLevel` | `{ str: 0, dex: 1, int: 4, vit: 2 }` (L60 ⇒ 6 / 67 / 253 / 133) |
| `hpPerLevel` / `hpPerVit` | 8 / 9 (L1 HP 193, L60 naked 1,727) |
| `mainStat` / armour | `int` / light; `ClassDefX.regenRule 'mana'` and `manaScaling true` (StatCalc adds `0.015×int`) |
| trait `trait_blood_pact` — **Kan Pakti** | +20 % zamanla hasar (`dotPct`); DoT ticks heal you for 3 % of the tick; your demon's damage heals you for 10 % of it |
| camera / tempo | `cameraProfile 'caster'`; tempo = `FEEL_WEAPON.staff` 1.0 |

### 6.2 Model recipe and animation map

| item | value |
|---|---|
| model | `/assets/models/characters/Rogue_Hooded.glb` (the hood is the cultist look; `visual.paletteClass 'rogue'`, `defaultVariant 1` "Kızıl", `defaultTint 0xffb0c8`) |
| nodes | show `Rogue_Cape`; hide `Knife Knife_Offhand 1H_Crossbow 2H_Crossbow Throwable` |
| items | default loadout = **staff** (parity with Büyücü's weapon damage, §7): `modelByClass.warlock`: `staff_t*` → `staff_fire.glb`; the alternative **wand + tome** build uses `wand_t*` → `wand_bone.glb` (ruby-violet orb) with the `tome` drawn **open** (`ClassVisualDef.attach.book`, `ATTACH.bookOpen`) |
| clip map | idle `Idle`; bolt `Spellcast_Shoot` (0.373); big cast `Spellcast_Raise` (≈ 0.95†) / `Spellcast_Long`; channel `Spellcasting` (loop); **summon `Spellcast_Summon`** (effect ≈ 2.2†); tap `Use_Item` (0.72); cheer `Cheer` |

### 6.3 LMB chain — `warlock_basic` "Gölge Oku Zinciri" (behavior `combo`, steps 4, reset 0.8)

`warlock_basic`: `anim 'Spellcast_Shoot'`, `projectile`, `range 24`, `tags [spell,basic,combo,projectile,shadow]`, `params {steps:4, reset:0.8}`. Mana gain via `params.gain` (+3/+3/+3 +3 extra/+6). Weights 0 · 0 · 4 · 1, stagger 3/3/5/9, knockback ramp 0.5/0.7/1.2/2.0 (GDD_LIFE chain rules).

| id | Ad | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | params |
|---|---|---|---|---|---|---|---|
| `warlock_basic_1` | Gölge Fısıltısı | proj v30 R24 r0.35 ×1 p0, knockback 0.5 | 0.85 shadow | `agony` (8 s, magnitude 1.0, chance 0.25) | `Spellcast_Shoot` ×1.3 @0.373 | p `shadow_projectile` i `hit_magic` · sc `shadow_cast` si `shadow_impact` | `end 0.7 chain 0.05 move 0.10 stagger 3 proc 0.7 gain 3 weight 0 upper 1 slow 0.4 step 1 hand 0` |
| `warlock_basic_2` | Gölge Fısıltısı | same, knockback 0.7 | 0.85 shadow | same | same | same | `… step 2 hand 1` |
| `warlock_basic_3` | İkiz Oklar | ×2 spread 8, knockback 1.2 | 0.62 shadow each | `agony` chance 0.25 each | `Spellcast_Shoot` ×1.15 @0.373 | same | `end 0.75 chain 0.06 move 0.12 stagger 5 proc 0.7 gain 3 gainExtra 3 gainMax 3 weight 4 slow 0.45 step 3` |
| `warlock_basic_4` | Kader Patlaması | ground R14 r2.6 at the soft target, knockback 2.0 | 2.02 shadow | `corruption` (6 s, magnitude 2.0, chance 0.5) | `Spellcast_Raise` ×2.2 @0.95† | g `unstable_burst`(N) · sc `shadow_cast` si `shadow_impact` | `end 1.0 chain 0.06 move 0.20 stagger 9 proc 1 gain 6 weight 1 step 4 finisher 1` |

**Chain check**: cadence 0.33 + 0.30 + 0.37 + 0.55 = **1.55 s**, Σ coef 4.96 ⇒ **3.2 coef/s** direct (GDD_LIFE target 3.2 + DoT; the DoTs it spreads are the real damage); last step 2.02 = 2.38 × step 1. `FEEL_WEAPON.staff` tempo 1.0.

### 6.4 Core skills (8)

Direct hits follow §1.7 (DoT `magnitude` = total DoT as a multiple of the casting hit).

| id | Ad | Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `warlock_shadow_bolt` | Gölge Oku | 1·rmb | 14 | 0 | 0 | proj v28 R28 r0.45 ×1 p0 | 2.2 shadow | – | `Spellcast_Shoot` ×1.15 @0.373 | p `shadow_projectile` scale 1.3 i `shadow_burst` scale 0.5 · sc `shadow_cast` si `shadow_impact` | spell projectile shadow | `end 0.7 chain 0.1 move 0.2 stagger 8 proc 1 weight 0 upper 1 slow 0.5 shardChance 0.12` |
| `warlock_corruption` | Yozlaşma | 3·q | 12 | 0 | 0 | proj v40 R28 r0.3 ×1 p0 | 0.7 shadow | `corruption` (14 s, magnitude 5.0) | `Spellcast_Shoot` ×1.6 @0.373 | p `shadow_projectile` (vfxColor 0xa020a0, scale 0.8) i `corruption_loop`(N) · sc `curse_cast`(N) si `shadow_impact` | spell dot curse shadow | `end 0.6 chain 0.05 move 0.1 stagger 2 proc 0.6 weight 0 upper 1 slow 0.4`; route `{from:['warlock_agony','warlock_unstable_affliction'], window:4, more:0.30}` |
| `warlock_agony` | Azap | 6·e | 10 | 0 | 0 | proj v40 R28 r0.3 ×1 p0 | 0.4 shadow | `agony` (18 s, magnitude 2.4, +1 stack, max 8) | `Spellcast_Shoot` ×1.7 @0.373 | p `shadow_projectile` (vfxColor 0x8040c0, scale 0.8) i `agony_loop`(N) · sc `curse_cast` si `shadow_impact` | spell dot curse shadow | `end 0.6 chain 0.05 move 0.1 stagger 1 proc 0.5 weight 0 upper 1 slow 0.4`; route `{from:['warlock_corruption','warlock_unstable_affliction'], window:4, more:0.30}` |
| `warlock_summon_demon` | İblis Çağır | 10·s1 | 0 (voidwalker: RP−1) | 4 | c1.2 | `custom:minion_summon`, `minion {id 'warlock_imp', count 1, cap 1, group 'demon', cycle ['warlock_imp','warlock_voidwalker']}` | – | – | `Spellcast_Summon` ×2.4 @2.2† | g `demon_portal`(N) · sc `demon_summon`(N) | summon demon | `cycleOnRecast 1 end 0.5 chain 0.1 move 0.2 weight 1` (recasting with a living demon dismisses it and calls the next one in the cycle) |
| `warlock_drain_life` | Can Emme | 15·s2 | 8 + 10/s | 0 | k3 (6 ticks) | beam R14, `custom:beam_drain` | 0.55~ shadow (tick 0.5) | heals you for 60 % of damage dealt | hold `Spellcasting` | c `drain_beam`(N) · sc `curse_cast` + `drain_loop`(N) | spell channel drain | `tick 0.5 beam 1 heal 0.6 costPerSec 10 range 14 moveSlow 0.5 shardOnKill 1 end 0.3 stagger 1 proc 0.3 weight 0` |
| `warlock_rain_of_fire` | Ateş Yağmuru | 20·s3 | 15 + 12/s | 8 | k3 (6 ticks) | ground R20 r5, `custom:rain` | 0.6~ fire (tick 0.5) | burn30%/2s | hold `Spellcasting` | g `fire_rain`(N) i `fire_burst` scale 0.3 · sc `fire_cast` si `fire_impact` | spell channel aoe fire zone | `tick 0.5 costPerSec 12 moveSlow 0.5 fixed 1 end 0.3 stagger 1 proc 0.25 weight 0 element 1` |
| `warlock_life_tap` | Can Dönüşümü | 25·kitap | `hpCostPct 0.12` | 6 | 0 | `self_buff` | – | restores 35 + 10 % of max Mana | `Use_Item` ×2.0 @0.72 | c `soul_orb`(N) · sc `life_leech` | utility | `manaFlat 35 manaPct 0.10 end 0.9 chain 0.1 move 0.15 weight 0` |
| `warlock_summon_infernal` | Cehennem Muhafızı | 30·r | 50 | 60 | 0 | ground R20 r6, `custom:minion_summon` + meteor, `minion {id 'warlock_infernal', count 1, life 20, group 'infernal', cap 1}` | 6.0 fire, knockback 3 | `stun` 1.5 s | `Spellcast_Raise` ×1.6 @1.05† | g `infernal_fall`(N) i `fire_burst` scale 1.2 + `shockwave` · sc `explosion` + `demon_summon` | ultimate summon fire | `delay 0.9 end 1.3 chain 0.15 move 0.3 stagger 40 proc 1 weight 3` |

| id | Açıklama (TR) | VFX / SFX notes |
|---|---|---|
| `warlock_basic` | Gölge oklarıyla dört vuruşluk bir zincir yaparsın; oklar Azap bindirir, son vuruş çevreye Yozlaşma yayar. Her vuruş Mana kazandırır. | Purple bolts, dark ring on the finisher. |
| `warlock_shadow_bolt` | Hedefe %220 gölge hasarı veren bir gölge oku atarsın. %12 şansla Ruh Parçası verir. | Fat violet bolt, shadow burst. |
| `warlock_corruption` | Hedefi 14 saniye boyunca çürüten bir lanet bırakır: %70 anlık + toplam %350 zamanla hasar. | Dark wisps rise from the target. |
| `warlock_agony` | Hedefe her kullanımda +1 yığın Azap ekler (en fazla 8); yığınlar saniye başına daha çok hasar verir. | Purple spirals tighten with stacks. |
| `warlock_summon_demon` | Bir İblisçik çağırırsın. Yaşıyorsa yeniden kullanmak onu gönderir ve sıradaki iblisi (Boşluk Gezgini, 1 Ruh Parçası) çağırır. Yoldaş ölürse 12 sn sonra kendiliğinden döner. | Red-violet portal opens, laugh. |
| `warlock_drain_life` | 3 saniye boyunca hedeften can emer: 6 kez %55 hasar verir ve hasarın %60'ı kadar iyileşirsin. Hedef ölürse Ruh Parçası kazanırsın. | Magenta tether between you and the target. |
| `warlock_rain_of_fire` | Hedef bölgeye 3 saniye boyunca ateş yağdırır: 6 kez %60 hasar verir ve yakar. | Falling embers, orange ground glow. |
| `warlock_life_tap` | Canının %12'sini feda ederek 35 + maksimum Mana'nın %10'u kadar Mana kazanırsın. | Red orb flies from the chest to the staff. |
| `warlock_summon_infernal` | Gökten bir Cehennem Muhafızı düşürürsün: çevreye %600 ateş hasarı verir, 1.5 sn sersemletir ve 20 saniye boyunca senin için savaşır. | Meteor fall, huge shockwave (ultimate weight class), infernal roar. |

### 6.5 Specs (GDD_V2 `SpecDef` shape; skills L10 / L15, majors L10 / L20)

**`warlock_affliction` — Azap (DPS, DoT).** Tagline "Zaman Senin Silahın". Passive "Sonsuz Azap" (`trait_affliction`): `stats {dotPct 0.25, castSpeed 0.08}`, special `shardOnKill 1, dotCrit 0.5` (DoT ticks may crit at 50 % of your crit chance; shard-on-kill is on in every spec but this raises the Soul Reaper bonus). `skills` `warlock_unstable_affliction` (L10), `warlock_seed_of_corruption` (L15); majors `m45 warlock_af_dark_soul` (L10), `m90 warlock_af_pandemic` (L20); `weaponArt wa_soul_flare`; no guard (parry window only); `mods []`.
**`warlock_destruction` — Yıkım (DPS, burst).** Tagline "Her Şeyi Yak". Passive "Yıkımın Eli" (`trait_destruction`): `stats {fireDamagePct 0.20, critChance 0.06, critDamage 0.20}`, special `shardOnCrit 0.20, directMore 0.10` (a fire crit has 20 % to grant +1 Ruh Parçası; direct damage +10 %). `skills` `warlock_immolate` (L10), `warlock_chaos_bolt` (L15); majors `m45 warlock_ds_havoc` (L10), `m90 warlock_ds_cataclysm` (L20); `weaponArt wa_soul_flare`; `mods []`.

| id | Ad | Spec · Sv·Slot | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `warlock_unstable_affliction` | Dengesiz Azap | Aff · 10·spec1 | 20 | 0 | 0 | proj v40 R28 r0.3 p0 | 1.0 shadow | `unstable_affliction` (8 s, magnitude 7.0) | `Spellcast_Shoot` ×1.5 @0.373 | p `shadow_projectile` (vfxColor 0xa020a0) i `corruption_loop` · sc `curse_cast` si `shadow_impact` | spell dot shadow | `burst 2.0 burstRadius 3 end 0.65 chain 0.06 move 0.12 stagger 3 proc 0.8 weight 0 upper 1 slow 0.4` (bursts for 2.0 shadow r3 when it expires or the target dies); route `{from:['warlock_agony','warlock_corruption'], window:4, more:0.30}` |
| `warlock_seed_of_corruption` | Yozlaşma Tohumu | Aff · 15·spec2 | 25 | 12 | 0 | proj v34 R26 r0.4 p0 | 0.8 shadow + seed explosion 2.5 shadow r6 | `seed` 3.5 s | `Spellcast_Shoot` ×1.3 @0.373 | p `shadow_projectile` scale 1.4 i `curse_ring` scale 0.6 · sc `curse_cast` si `shadow_impact` | spell aoe shadow | `seedFuse 3.5 seedRadius 6 seedCoef 2.5 seedDamageCap 4 end 0.7 chain 0.1 move 0.2 stagger 6 proc 0.8 weight 1` (explodes early after taking 4× the hit's damage; applies Yozlaşma to everything caught) |
| `warlock_immolate` | Yakıp Yıkma | Dest · 10·spec1 | 16 | 0 | 0 | proj v32 R26 r0.4 p0 | 1.0 fire | `immolate` (12 s, magnitude 4.0) | `Spellcast_Shoot` ×1.5 @0.373 | p `fire_projectile` scale 0.9 i `fire_burst` scale 0.45 · sc `fire_cast` si `fire_impact` | spell dot fire | `element 1 end 0.65 chain 0.06 move 0.12 stagger 3 proc 0.8 weight 0 upper 1 slow 0.4` |
| `warlock_chaos_bolt` | Kaos Oku | Dest · 15·spec2 | 20, RP−2 | 0 | c1.2 | proj v26 R30 r0.7 p0 | 7.0 fire | – | cast hold `Spellcasting`, release `Spellcast_Shoot` @0.373 | p `fire_projectile` scale 2.0 i `fire_burst` scale 1.1 + `crit_burst` · sc `fire_cast` si `explosion` | spell projectile fire burst | `resPen 0.5 critBonus 0.20 stagger 30 proc 1 weight 2 element 1 end 0.7 chain 0.1 move 0.2`; route `{from:['warlock_immolate'], window:5, more:0.25}` |
| `warlock_af_dark_soul` | Karanlık Ruh | Aff · m45 (L10) | 0 | 45 | 0 | `self_buff` | – | self: `soul_misery` 15 s (+30 % DoT damage, +1 Ruh Parçası per 3 s) | `Spellcast_Raise` ×2.2 @0.6† | c `fel_aura`(N) follow 15 s · sc `curse_cast` | buff major | `major 45 end 0.8 chain 0.1 move 0.15 weight 1` |
| `warlock_af_pandemic` | Pandemik | Aff · m90 (L20) | 0 | 90 | 0 | ground R20 r7 d12 t12, `custom:pandemic` | 0.5~ shadow per second | every 1 s the highest-stack Azap and Yozlaşma in the zone is copied to all enemies inside | `Spellcast_Raise` ×1.8 @1.05† | g `curse_ring` scale 2.3 + `corruption_loop` · sc `curse_cast` | zone major | `major 90 pandemic 1 end 1.2 chain 0.1 move 0.25 weight 2` |
| `warlock_ds_havoc` | Kaos | Dest · m45 (L10) | 0 | 45 | 0 | `custom:target_status` R30 | – | target: `havoc` 10 s (60 % of your direct damage is copied onto it 0.15 s later) | `Spellcast_Shoot` ×1.8 @0.373 | i `mark_loop` (vfxColor 0xb06bff) · sc `curse_cast` | utility major | `major 45 havocMult 0.6 end 0.5 chain 0.05 move 0.1 weight 0` |
| `warlock_ds_cataclysm` | Kıyamet Yağmuru | Dest · m90 (L20) | 0 | 90 | 0 | ground R22 r7 d2.4 | 6 fireballs × 3.0 fire (AoE r3.5, knockback 2) | – | `Spellcast_Raise` ×1.5 @1.05† | g `fire_rain` scale 2.3 i `fire_burst` · sc `fire_cast` si `explosion` | burst major | `major 90 balls 6 ballInterval 0.4 ballCoef 3.0 ballRadius 3.5 scatter 6 end 1.4 chain 0.1 move 0.3 weight 3` |

| id | Açıklama (TR) |
|---|---|
| `warlock_unstable_affliction` | 8 saniye boyunca %700 gölge hasarı veren kararsız bir lanet; süre dolunca ya da hedef ölünce %200 hasarla patlar. Azap/Yozlaşma'dan sonra %30 daha güçlü. |
| `warlock_seed_of_corruption` | Hedefe bir tohum ekler; 3.5 sn sonra ya da yeterli hasar alınca %250 hasarla patlar ve yakındaki herkese Yozlaşma bulaştırır. |
| `warlock_immolate` | Hedefi tutuşturur: %100 ateş hasarı ve 12 saniyede toplam %400 yanma hasarı. |
| `warlock_chaos_bolt` | 2 Ruh Parçası harcayarak 1.2 sn'de %700 ateş hasarı veren bir kaos oku salarsın; dirençlerin yarısını yok sayar, kritik şansı +%20. |
| `warlock_af_dark_soul` | 15 saniye boyunca zamanla hasarın %30 artar ve her 3 sn'de bir Ruh Parçası kazanırsın. |
| `warlock_af_pandemic` | 12 saniyelik bir alan: içindeki her düşmana, alandaki en güçlü Azap ve Yozlaşma saniyede bir kopyalanır. |
| `warlock_ds_havoc` | Bir düşmanı 10 sn işaretlersin; doğrudan hasarlarının %60'ı ona da vurur. |
| `warlock_ds_cataclysm` | Hedef bölgeye 6 dev ateş topu yağdırırsın: her biri %300 ateş hasarı verir ve savurur. |

### 6.6 Minions (demons)

| id | model · scale | role / group | hpFrac · armor | attacks (anim ×speed @hit, range, cd, coef) | anims | notes |
|---|---|---|---|---|---|---|
| `warlock_imp` | `/assets/models/gen/creatures/imp_fire.glb` · 0.95 (≈ 1.45 m) | caster / `demon` | 0.30 · 0.05 | **Firebolt** `Cast` ×1.0 @0.8 range 16 cd 1.6 coef 1.1 fire + burn30%/2s, projectile `fire_projectile` v24 scale 0.5, spawned at the `orb` bone; claw `Attack` @0.4 r2.2 cd 1.0 coef 0.5 (only when something is within 2.2 m) | idle `Idle` walk `Walk` run `Run` hit `Hit` death `Death` | speed 6.5, follow [2.5,5], keeps ~9 m from enemies; 10 % of its damage heals the owner (`trait_blood_pact`) |
| `warlock_voidwalker` | `/assets/models/monsters/Demon.glb` · 0.95 · tint `0x5a3a9a` emissive `0x2a1060` | tank / `demon` | 0.75 · 0.50 | `Attack` @0.37 r2.6 arc 120 cd 1.4 coef 1.0 phys; **Eziyet** (kind `taunt`) `Jump` @0.1 radius 6, taunt 3 s, cd 8; **Gölge Kalkanı** (kind `buff`) absorbs 15 % of the owner's max HP for 6 s, cd 20 | idle `Idle` walk `Walk` run `Run` hit `HitRecieve` death `Death` | speed 5.8; costs 1 Ruh Parçası to summon |
| `warlock_infernal` | `/assets/models/gen/creatures/elemental_fire.glb` · 1.1 (≈ 2.8 m) | guardian / `infernal` | 1.00 · 0.40 | `Attack` @0.5† AoE r3 cd 2.0 coef 2.0 fire; `Cast` @0.9 ground ring r5 cd 6 coef 1.5 fire | idle `Idle` walk `Walk` run `Run` hit `Hit` death `Death` | life 20 s, speed 4.5; falls in with `infernal_fall` |

### 6.7 Combo routes and rotations

* **DoT chain (any order)**: Azap → Yozlaşma → Dengesiz Azap within 4 s of each other: each later cast +30 % DoT. Opener ≈ 3 casts, 38 mana, then Gölge Oku filler / basics for mana.
* **Destruction**: Yakıp Yıkma → Kaos Oku within 5 s (+25 %); shards come from kills of DoT'd enemies and fire crits; Kaos (45 s) then Kıyamet Yağmuru (90 s) on bosses.
* **Mana loop**: basics +3 each, Can Dönüşümü (12 % HP → 35 + 10 %), Can Emme (heals back). Shards: kill of an enemy carrying any of your DoTs +1 (cap 5); Gölge Oku 12 %.

### 6.8 Vuruş hissi

Bolts are slow and heavy (28–30 m/s) with a violet comet trail and a dark ring on impact. Weight classes (GDD_LIFE FEEL v2): chain steps `light · light · medium · finisher` (**Kader Patlaması** also adds a small ground pop); Gölge Oku `light`; **Kaos Oku** `heavy` (fireball explosion, short FOV push from the camera profile); Dengesiz Azap / Tohum burst `medium`; Kıyamet Yağmuru `ultimate`; the Infernal landing `ultimate` (shockwave ring). DoT ticks never stop time but show tiny purple/orange dots. Demon summon: portal flash + imp laugh `imp_laugh`. Barks (mage pack, pitch 0.76): `voice_mage_spell_fire` on fire spells, `voice_mage_spell_summon` on demons, `voice_mage_spell_sleep` on curses.

### 6.9 Starting kit, default bars

`startingItems ['staff_t1']` (+ `chest_light_t1 boots_light_t1 helm_light_t1 gloves_light_t1`), bag `['wand_t1','tome_t1']` (the wand + tome loadout trades 31 % weapon damage for +12 % damage, cast speed and mana — same choice the Büyücü has).
**Azap** `{lmb warlock_basic, rmb warlock_shadow_bolt, q warlock_corruption, e warlock_agony, s1 warlock_unstable_affliction, s2 warlock_summon_demon, s3 warlock_drain_life, r warlock_summon_infernal, m45 warlock_af_dark_soul, m90 warlock_af_pandemic}`;
**Yıkım** `{lmb warlock_basic, rmb warlock_shadow_bolt, q warlock_corruption, e warlock_immolate, s1 warlock_chaos_bolt, s2 warlock_summon_demon, s3 warlock_rain_of_fire, r warlock_summon_infernal, m45 warlock_ds_havoc, m90 warlock_ds_cataclysm}`. `warlock_agony`, `warlock_seed_of_corruption`, `warlock_life_tap` are the benched picks.

---

## 7. Balance targets (vs the existing four classes)

### 7.1 Reference build and method

* **Reference**: level 60, ilvl-60 "blue/epic" gear (GDD_SYSTEMS §1.2): main stat ≈ 400 (`1 + 400/100 = 5.0×`), +60 % increased damage bucket, 9 % crit at ×1.5 (≈ +4.5 % average), no keystones, no Mythic+ scaling. Damage per hit = `W × coef × 5.0 × 1.6 × 1.045 ≈ W × coef × 8.4`; heal per cast = `W × coef × 5.0 × (1 + healingPct)` (GDD_V2 §1.6 formula).
* **Weapon averages** `W = (4 + 2.5·ilvl) × typeMult` = `154 × typeMult` at ilvl 60: sword1h 154 (APS 1.4), axe2h 239 (1.0), staff 223 (1.1), dagger 131 + 0.25 off-hand ≈ 164 (1.7), **fist 192 (typeMult 1.25, APS 1.6)**, **bow 231 (typeMult 1.5, APS 1.0)**, **mace 162 (typeMult 1.05, APS 1.3)**, wand 154 (1.4). GDD_LIFE §1 `GEAR_FAMILIES` rows for `mace`, `bow`, `quiver` follow the same tier scale.
* **Chain targets (GDD_LIFE §5, the authority for the LMB chains of all nine classes, coef/s = Σ step coef ÷ Σ cadence, tempo included)**: Şövalye 3.0 · Barbar 3.3 · Büyücü 3.3 · Haydut 3.5 · **Keşiş 3.6 · Okçu 3.2 · Paladin 3.0 · Nekromant 3.0 + minions · Warlock 3.2 + DoT**. The chains of §2.3 / §3.3 / §4.3 / §5.3 / §6.3 are tuned to those numbers.
* **Sustained ST coef/s** = chain target × 1.10 (resource skills lift the chain by ≈ 10 % on average; the new classes' skills are written to the same uplift). **DPS index** = `sustained coef/s × W × role factor`, normalised so **Barbarian = 100** (868 = 3.63 × 239). **Role factor** (GDD_V2 §11.1): DPS 1.0, tank ×0.75 and healer ×0.60 of own damage, times an uptime factor (0.9 for tanks, 0.8 for healers — time spent on taunts, shields and heals). The bench (§7.4) re-measures the existing four first; if they differ by > 10 points from the table, scale *every* target by the measured Barbarian value.
* **EHP index** = HP ÷ (1 − total mitigation) with L70 monsters (M+10), **Knight = 100** (≈ HP 4,800, armour 2,300 ⇒ 36 % armour DR + shield block ⇒ ≈ 9,400 EHP). Brewmaster/Koruma include their active mitigation at the uptime of the rotation in §2.7 / §4.6, using V2's tank baselines (`maxHpPct 0.30`, armour/dodge, threat ×2.5–3.0).
* **HPS** (healer, GDD_V2 §11.1): `healCheck(L) = maxHP × (0.9 % + 0.15 % · L)` unavoidable party damage per second (L60 ⇒ 9.9 % ⇒ ≈ 475 at 4,800 max HP); a healer's sustained HPS ≈ 1.25 × `healCheck` (≈ 600) at par, with ≤ 85 % cast uptime over 90 s, mana lasting 4–6 min, and a 3-second burst answer. Kutsal is compared against **Işık Çağıran** (`mage_lightbringer`) and must land within ±15 %.

### 7.2 Targets

| class · spec | weapon (W, APS) | chain coef/s (LIFE) | sustained ST coef/s | **DPS index** | AoE index (≥ 5 targets) | burst index (first 10 s with majors) | **EHP index** | HPS | notes |
|---|---|---:|---:|---:|---:|---:|---:|---|---|
| Şövalye (existing) | sword 154 / 1.4 | 3.0 | 3.3 | 59 | 70 | 66 | 100 | – | tank benchmark (spec-less baseline until V2 specs ship) |
| Barbar (existing) | axe 239 / 1.0 | 3.3 | 3.6 | 100 | 100 | 100 | 58 | – | DPS benchmark |
| Büyücü (existing) | staff 223 / 1.1 | 3.3 | 3.6 | 93 | 112 | 97 | 32 | – | placeholder AoE/burst until measured |
| Haydut (existing) | dagger 164 / 1.7 | 3.5 | 3.8 | 73 | 68 | 116 | 44 | – | placeholder AoE/burst until measured |
| **Keşiş · Rüzgâr Yürüyen** | fist 192 / 1.6 | 3.6 | 3.96 | **88 ± 8** | 85 | 98 | 52 | – | Çi-limited; strong mobility |
| **Keşiş · Demci** | fist 192 / 1.6 | 3.6 | 3.96 | **60 ± 6** | 62 | 55 | **96 sustained / 122 vs burst** (stagger smoothing) | – | taunt `monk_provoke`; threat ×2.5 |
| **Okçu · Nişancı** | bow 231 / 1.0 | 3.2 | 3.5 | **91 ± 8** | 70 | 105 | 40 | – | kiting; Odak-limited |
| **Okçu · Av Ustası** | bow 231 / 1.0 | 3.2 | 2.9 own + pet 0.9 | **94 ± 8** (pet ≈ 15 %) | 80 | 98 | 44 | – | `archer_bm_pack_hunt` (Av Sürüsü) = 2 extra wolves for 20 s |
| **Paladin · Koruma** | mace 162 / 1.3 | 3.0 | 3.3 | **42 ± 6** | 60 | 45 | **108 ± 8** | – | spike mitigation via Doğruluk Kalkanı; threat ×3.0 |
| **Paladin · Kutsal** | mace 162 / 1.3 | 3.0 (shared basic bolt) | 3.3 | **30 ± 5** | 35 | 28 | 82 | **sustained ST ≈ 700 ± 100 (V2 ≈ 1.25 × healCheck + 15 % single-target allowance); 4,500 in 3 s burst; Sığınak ≈ 5,700 per ally / 12 s (≈ V2's 90 s heal major ± 10 %)** | smart heals; Taşan Şifa ward |
| **Paladin · Ceza** | sword 154 / 1.4 | 3.0 | 3.6 (attackSpeed +10 %) | **80 ± 8** | 88 | 92 | 78 | self-heal ≈ 5 % | holyDamagePct +20 % |
| **Nekromant · Ordu Efendisi** | staff 223 / 1.1 | 3.0 + minions | 2.2 own + minions 1.4 | **92 ± 8** (minions ≈ 40 %, capped at 60 %) | 96 | 85 | 36 → **48** with minion body-block | – | cap 4/6 skeletons |
| **Nekromant · Kemik Ustası** | staff 223 / 1.1 | 3.0 | 3.6 | **93 ± 8** | 112 | 100 | 34 | – | corpse-dependent AoE |
| **Warlock · Azap** | staff 223 / 1.1 | 3.2 + DoT | 3.5 (DoT 1.9 + filler 1.6) | **91 ± 8** (ramp 8 s) | 105 | 78 | 38 | self-heal ≈ 4 % | |
| **Warlock · Yıkım** | staff 223 / 1.1 | 3.2 | 3.7 | **96 ± 8** | 90 | 112 | 36 | – | shard spender |

Acceptance windows: DPS / AoE / burst within ±10 index points, EHP ±10, HPS ±15 %. V2's spec parity (±5 % sustained among the DPS specs of one class) applies to the two DPS specs of Okçu, Nekromant and Warlock. Utility parity (CC, mobility, party buffs) is tracked qualitatively: every spec has ≥ 1 CC or mobility tool and every DPS spec has an AoE answer. Weapon arts, heavies and riposte (§1.12) are excluded from the bench's sustained numbers; the bench reports them separately as "bonus windows" (poise-break damage, riposte crit).

### 7.3 Tuning knobs (in this order)

1. skill `damage.coef` / `heal.coef`; 2. resource `gain`/`cost`; 3. DoT `magnitude` and `duration`; 4. minion `attacks[].coef` and `hpFrac`; 5. spec passive `stats`; 6. cooldowns. Never touch weapon `typeMult` (shared with items) — new types are fixed at fist 1.25 / bow 1.5 / mace 1.05. Never touch `FEEL_WEAPON` tempo to balance (GDD_LIFE owns feel).

### 7.4 Bench (headless, `dev/combat-sim/classbench.mjs`)

`node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/classbench.mjs [classId] [specId]` — uses the existing harness (`addPlayer`, `addEnemy`, `tap`, `press`, `stepSec`, `events`). For each class/spec: build a L60 character with the reference stat block (`ch.stats` override: main stat 400, `damagePct 0.6`, W by weapon above), run a 60 s single-target fight against a 1e9-HP dummy (armour family DR 0.30), then a 7-dummy pack for AoE, report `DPS`, `coef/s`, `index = DPS / BarbarianDPS × 100`, resource starvation seconds, and (tank specs) 30 s of 4 scripted attackers at L70 damage for EHP. Rotation = the priority list below, evaluated every 0.1 s (`first usable wins`):

| spec | priority list |
|---|---|
| WW | m90 → m45 → fists_of_fury (Çi ≥ 3 & ready) → whirling_dragon (route armed) → rising_sun_kick (Çi ≥ 3) → blackout_kick (Çi ≥ 1) → tiger_palm → basic chain |
| BM | provoke on the first mob → m45 when pool > 35 % → purifying_brew (pool > 35 %) → keg_smash → blackout_kick → tiger_palm → basic |
| MS | m90 → m45 → kill_shot (< 25 % or marked) → aimed_shot (full charge) → rapid_fire (Odak ≥ 30) → multishot (≥ 3 targets) → basic |
| BM-hunter | m90 → m45 → kill_command → serpent_sting (uptime) → aimed_shot → basic (pet always alive) |
| Prot | reckoning on the first mob → bulwark when < 60 % HP → shield_of_righteous (KG ≥ 3 & no `righteous`) → avengers_shield → blessed_hammer → judgement → crusader_strike → basic |
| Holy | m90 sanctuary / m45 aura_mastery on > 40 % group damage → flash_of_light (lowest ally < 55 %) → word_of_glory (KG ≥ 3 on lowest ally) → light_of_dawn (≥ 3 allies < 80 %) → holy_shock → holy_basic on lowest ally |
| Ret | m90 → m45 → hammer_of_wrath (target < 35 % or wings) → verdict / divine_storm (KG ≥ 3) → judgement → crusader_strike → basic |
| Summoner | raise to cap → golem → m90 → m45 → command_army → corpse_explosion (≥ 1 corpse) → bone_spear → basic |
| Bone | m90 → m45 → blood_surge → bone_storm → corpse_explosion (route armed) → bone_spear → basic |
| Affliction | m45 → m90 → agony → corruption → unstable_affliction → seed (≥ 3 targets) → shadow_bolt → drain_life/life_tap when mana < 25 % |
| Destruction | m90 → m45 → chaos_bolt (≥ 2 shards) → immolate → shadow_bolt → rain_of_fire (≥ 4 targets) |

---

## 8. Items, weapons and starting gear (items module)

* **New category** `fist` ("Yumruk Silahı") appended to `ItemCategory` (`types/items.ts`), `WEAPON_CATEGORIES`, `CATEGORY_NAMES_TR`, bag `SORT_ORDER`. `bow`, `mace`, `quiver` already exist as categories but have **no base definitions**; `crossbow`, `sword2h`, `axe1h` stay unused.
* **New `ItemBaseDef.modelByClass?: Partial<Record<ClassId, string>>`** — `loadCharacterModel` picks it before `model` (staff skull for Nekromant, fire staff / bone wand for Warlock). `ItemBaseDef.classes` lists every class allowed to equip.
* `CLASS_ARMOR_WEIGHT`: monk `medium`, archer `medium`, paladin `heavy`, necromancer `light`, warlock `light`; `WEIGHT_CLASSES` updated (heavy: knight barbarian paladin · medium: rogue monk archer · light: mage necromancer warlock). `CLASS_WEAPONS`/`CLASS_OFFHANDS`/`CLASS_NAMES_TR` come from `CLASSES` (§1.1 registry fields), not literals.

| type id | TR | hands | APS | typeMult | classes | T1 → T5 names | models T1 → T5 | implicit T1 → T5 | icons |
|---|---|:-:|---:|---:|---|---|---|---|---|
| `fist` | Yumruk Silahı | 2 (no off-hand) | 1.6 | 1.25 | monk | Sargılı Yumruklar · Demir Eldivenler · Çelik Parmaklıklar · Ejder Pençeleri · Kadim Yumruklar | `''` (hands; glow tiers on the arm meshes) | `attackSpeed` +3 / 4 / 5 / 6 / 7 % | `item-gloves-leather`, `item-gloves` |
| `bow` | Yay | 2 | 1.0 | 1.5 | archer | Kısa Yay · Av Yayı · Kompozit Yay · Türk Yayı · Kadim Yay | `bow_short.glb` ×2, `bow_composite.glb` ×3 (`/assets/models/gen/weapons/`) | `projectileSpeedPct` +10 / 15 / 20 / 25 / 30 % | `item-bow`, `item-bow-long` |
| `mace` | Topuz | 1 | 1.3 | 1.05 | paladin | Dişli Topuz · Çivili Gürz · Şövalye Topuzu · Kutsal Gürz · Kadim Topuz | `mace_flanged.glb`, `mace_morningstar.glb`, `mace_morningstar.glb`, `hammer_2h_thunder.glb` (scaled 0.6), same | `holyDamagePct` +4 / 6 / 8 / 10 / 12 % | `item-mace`, `item-mace-spiked` |
| `quiver` (off-hand) | Okluk | off | – | – | archer | Deri Okluk · Av Okluğu · Güçlendirilmiş Okluk · Türk Okluğu · Kadim Okluk | `/assets/models/weapons/quiver.gltf` | `damagePct` +6 / 9 / 12 / 15 / 18 % and `maxResource` +5 / 8 / 10 / 12 / 15 | `item-quiver` |

Shared-base updates: `sword1h.classes += paladin`; `shield.classes += paladin`; `staff.classes += necromancer, warlock`; `wand.classes += necromancer, warlock`; `tome.classes += necromancer, warlock`. `modelByClass`: `staff_t1..t5 → {necromancer: staff_skull.glb, warlock: staff_fire.glb}`, `wand_t1..t5 → {warlock: wand_bone.glb, necromancer: wand_bone.glb}`, `tome → spellbook_open.gltf` for warlock.

**Starting gear** (`CharacterState` tables): `START_GEAR` monk `['fist_t1','chest_medium_t1','boots_medium_t1']`, archer `['bow_t1','quiver_t1','chest_medium_t1','boots_medium_t1']`, paladin `['mace_t1','shield_t1','chest_heavy_t1','boots_heavy_t1']`, necromancer `['staff_t1','chest_light_t1','boots_light_t1']`, warlock `['staff_t1','chest_light_t1','boots_light_t1']`; `START_EXTRA_GEAR` monk/archer `['helm_medium_t1','gloves_medium_t1']`, paladin `['helm_heavy_t1','gloves_heavy_t1']`, necromancer/warlock `['helm_light_t1','gloves_light_t1']`; `START_BAG` paladin `['sword1h_t1']`, necromancer `['wand_t1','tome_t1']`, warlock `['wand_t1','tome_t1']`. `ClassDef.startingItems` mirrors the weapon pieces (monk `['fist_t1']`, archer `['bow_t1','quiver_t1']`, paladin `['mace_t1','shield_t1']`, necromancer `['staff_t1']`, warlock `['staff_t1']`).

Class-specific uniques and 2/4/6-piece sets are **not** in this doc (GDD_ITEMS_V2 / GDD_V2 tier sets). `uniques.ts` `classes:[]` filters keep working because the new class ids are simply absent from existing uniques.

---

## 9. Audio, voices, icons

### 9.1 Voice pack mapping (`ClassDefX.voice`, replaces the `packFor()` switch in `audio/Audio.ts`)

| class | pack | pitch | bark policy |
|---|---|---:|---|
| monk | `warrior` | 1.08 | `voice_warrior_hup` on punches / `voice_warrior_hut` on kicks (the existing kiai grunts), `voice_warrior_crit` on crits, `voice_warrior_angry` on Cennet Yumrukları |
| archer | `warrior` | 1.18 | `voice_warrior_attack` 12 % on basics, `voice_warrior_crit` on Son Atış, `voice_warrior_yes` on Avcı İşareti |
| paladin | `warrior` | 0.94 | `voice_warrior_defend` on blocks (existing rule), `voice_warrior_angry` on İntikam Kanatları, `voice_warrior_thanks` when an ally is healed by Lay on Hands / Word of Glory |
| necromancer | `mage` | 0.84 | `voice_mage_spell_summon` on every summon, `voice_mage_spell_blind` on curses, `voice_mage_spell_cast` otherwise |
| warlock | `mage` | 0.76 | `voice_mage_spell_fire` on fire spells, `voice_mage_spell_summon` on demons, `voice_mage_spell_sleep` on curses, `voice_mage_spell_cast` otherwise |
| demons / imp | `orc` | 1.5 (imp) / 0.8 (voidwalker) | aggro/death use `voice_orc_*` on the minion's position, rate-limited to 1 per 4 s |

`Audio.onLocalCast` (mage-pack branch) gets three more `kind`s: `tags.includes('summon') || def.minion → 'summon'`, `tags.includes('curse') → 'blind'`, `tags.includes('heal') → 'protect'`; the warrior-pack branch gets `def.tags.includes('kick') → 'hut'`, `'unarmed' → 'hup'`.

### 9.2 Sound effect files for the new sfx ids

New ids and the existing files they should map to (`audio/manifest.ts` is the source of truth; the audio owner may add entries; until then the alias in §11.2 plays): `punch_hit` ← `sfx/melee/hit_soft_heavy_01..05` + `hit_blunt_01.wav` (pitch 1.15); `kick_hit` ← `hit_soft_heavy_03..05` + `hit_blunt_01.wav` (pitch 0.9); `chi_cast` ← `magic/shimmer_01.mp3`, `buff_attack_01.ogg` (pitch 1.2); `gong` ← `world/bell_heavy_01..05` (pitch 0.6, vol 0.5); `bow_draw` ← `melee/draw_knife_01..03` (pitch 0.7); `arrow_hit` ← `melee/hit_flesh_medium_01..03` (pitch 1.3) + `chop_01.ogg`; `trap_arm` ← `world/metal_click_01`, `lock_01..03`; `trap_snap` ← `world/metal_02..03` + `creatures/bite_02.wav`; `wolf_howl` ← `creatures/howl_01.ogg`; `wolf_bite` ← `creatures/bite_01..03.wav`; `holy_cast` ← `magic/heal_01.ogg` + `buff_defense_01.ogg`; `holy_impact` ← `magic/arcane_03.ogg` (pitch 1.4); `hammer_hit` ← `melee/hit_plate_heavy_01..05` + `world/impact_light_01`; `aura_on` ← `magic/buff_attack_01.ogg`; `divine_shield` ← `magic/absorb_01.ogg` + `block`; `bone_cast` ← `magic/earth_01.ogg`; `bone_impact` ← existing `hit_bone`; `raise_dead` ← `magic/revive_01.ogg` (pitch 0.7) + `creatures/ghost_03.wav`; `curse_cast` ← `magic/debuff_01.ogg`; `corpse_pop` ← `magic/fire_explosion_01.ogg` (pitch 0.8) + `creatures/burble_01.ogg`; `fel_cast` ← `magic/spell_02.ogg` (pitch 0.8); `fel_impact` ← existing `shadow_impact`; `drain_loop` ← `magic/absorb_01.ogg` (`loop 1`); `demon_summon` ← `creatures/giant_02.wav` (pitch 1.2) + `enemy_aggro_demon`; `imp_laugh` ← `creatures/chatter_01..04.ogg` (pitch 0.7).

### 9.3 Class and skill icons (game-icons, CC BY 3.0, **all already in `public/assets/icons`**)

Class icon (`ClassDefX.icon`, menu card, party frame, `CLASS_META`): monk `buff-strength` (muscle-up, reads as brawler), archer `class-ranger`, paladin `class-cleric`, necromancer `skill-summon-skeleton`, warlock `skill-curse`. Optional later upgrade: dedicated `class-monk`, `class-necromancer`, `class-warlock` glyphs from game-icons.net (verify the exact names on the site and add the credit to `credits-vfx-ui.md`); the fallbacks below ship now.

Skill icons (`SkillDef.icon = '/assets/icons/<name>.svg'`; duplicates across classes are acceptable):

| class | `skill id suffix → icon name` |
|---|---|
| monk | `basic → skill-double-strike`, `tiger_palm → skill-claw-strike`, `chi_torpedo → skill-dash`, `spinning_crane → skill-whirlwind`, `blackout_kick → skill-thunderclap`, `flying_serpent → skill-leap`, `chi_wave → skill-arcane-missiles`, `tigers_lust → buff-haste`, `provoke → skill-taunt`, `fists_of_fury → skill-blade-storm`, `rising_sun_kick → skill-execute`, `whirling_dragon → skill-cleave`, `keg_smash → skill-ground-slam`, `purifying_brew → skill-holy-water`, `ww_tigers_fury → skill-berserk`, `ww_storm_earth_fire → skill-shadow-grasp`, `bm_fortifying_brew → skill-iron-skin`, `bm_black_ox → skill-charge` |
| archer | `basic → skill-rapid-fire`, `aimed_shot → skill-aimed-shot`, `disengage → skill-dodge-roll`, `multishot → skill-multishot`, `call_pet → skill-claw-strike`, `snare_trap → skill-snare-trap`, `explosive_arrow → skill-fire-arrow`, `hunters_mark → debuff-marked`, `arrow_storm → skill-rain-of-arrows`, `rapid_fire → skill-arrow-volley`, `kill_shot → skill-piercing-shot`, `kill_command → skill-leap`, `serpent_sting → skill-poison-arrow`, `ms_deadeye → buff-crit`, `ms_trueshot → skill-lightning-arrow`, `bm_bestial_wrath → skill-berserk`, `bm_pack_hunt → skill-war-cry` |
| paladin | `basic → skill-sword-slash`, `crusader_strike → skill-thrust`, `judgement → skill-holy-light`, `verdict → skill-hammer-of-justice`, `avengers_shield → skill-shield-bash`, `hammer_of_justice → skill-thunderclap`, `aura → buff-aura`, `lay_on_hands → skill-resurrect`, `avenging_wrath → buff-blessing`, `shield_of_righteous → skill-shield-wall`, `blessed_hammer → skill-holy-nova`, `prot_bulwark → skill-divine-shield`, `prot_ardent → buff-invulnerable`, `holy_basic → skill-smite`, `holy_shock → skill-heal`, `flash_of_light → skill-holy-light`, `cleanse → skill-renew`, `light_of_dawn → skill-regeneration`, `reckoning → skill-taunt`, `word_of_glory → skill-prayer`, `holy_aura_mastery → skill-healing-shield`, `holy_sanctuary → skill-consecration`, `divine_storm → skill-cleave`, `hammer_of_wrath → skill-meteor-impact`, `ret_crusade → skill-battle-shout`, `ret_execution → skill-assassinate` |
| necromancer | `basic → skill-bone-spear`, `bone_spear → skill-bone-spear`, `raise_skeleton → skill-summon-skeleton`, `corpse_explosion → skill-arcane-explosion`, `bone_prison → skill-shadow-grasp`, `curse_decay → skill-curse`, `blood_siphon → skill-life-drain`, `bone_armor → buff-thorns`, `army_of_the_dead → skill-summon-skeleton`, `golem → item-staff-skull`, `command_army → skill-taunt`, `bone_storm → skill-blade-storm`, `blood_surge → skill-rend`, `sm_frenzy → skill-berserk`, `sm_bone_knights → skill-shield-wall`, `bn_bone_spirit → skill-shadow-grasp`, `bn_lich_form → buff-lifesteal` |
| warlock | `basic → skill-lightning-bolt`, `shadow_bolt → skill-lightning-bolt`, `corruption → debuff-curse`, `agony → skill-poison-cloud`, `summon_demon → skill-fire-breath`, `drain_life → buff-lifesteal`, `rain_of_fire → skill-firewall`, `life_tap → skill-regeneration`, `summon_infernal → skill-meteor-impact`, `unstable_affliction → debuff-shock`, `seed_of_corruption → skill-fire-nova`, `immolate → debuff-burn`, `chaos_bolt → skill-fireball`, `af_dark_soul → buff-crit`, `af_pandemic → skill-thunderstorm`, `ds_havoc → debuff-marked`, `ds_cataclysm → skill-meteor` |

Status icons are listed in §10. Item icons: `item-gloves-leather` (fist T1–T2), `item-gloves` (fist T3–T5), `item-bow`, `item-bow-long`, `item-mace`, `item-mace-spiked`, `item-quiver`.

---

## 10. New statuses (`data/statuses.ts`: `STATUSES` + `STATUS_RULES`; combat owner)

Conventions as in `data/statuses.ts`: `stats` are per stack unless the rule says `perMag`; `takenMore` / `dealtMore` are the existing multiplier fields of `StatusRule`; icons are existing files (`/assets/icons/<icon>.svg`). All names Turkish.

| id | name (TR) | icon | kind | stats / effect | dot · stacks | rule (`STATUS_RULES`) | looping vfx |
|---|---|---|---|---|---|---|---|
| `chi_flow` | Çi Akışı | `buff-haste` | buff | `attackSpeed +0.20` | – | `refresh` | `haste_trail` |
| `tigerlust` | Kaplan Hırsı | `buff-haste` | buff | `moveSpeedPct +0.35, attackSpeed +0.15`; applying it removes `slow` and `root` | – | `refresh`, `immuneSlow` | `haste_trail` |
| `tigerfury` | Kaplan Öfkesi | `buff-strength` | buff | `attackSpeed +0.30, resourceRegenPct +1.0` | – | `refresh` | `enrage_aura` (jade) |
| `fortifying` | Güçlendirilmiş | `buff-defense` | buff | `maxHpPct +0.20, damageReductionPct +0.20` | – | `refresh` | `shield_bubble` |
| `brewed` | Bira Lekesi | `debuff-weakness` | debuff | `damagePct −0.10, armorPct −0.10` (on enemies) | – | `refresh`, dispellable | `curse_loop` (amber) |
| `stagger_pool` | Sarsma | `buff-absorb` | buff | internal marker of the Demci passive; pool stored in `SkillSystem` (§1.11) | – | `internal`, `hidden` | – |
| `hunters_mark` | Avcı İşareti | `debuff-marked` | debuff | `takenMore 0.08` (all sources); +10 % crit chance for the applier against it; visible through walls | – | `refresh` | `mark_loop` |
| `deadeye` | Keskin Nişan | `buff-crit` | buff | stack counter (3); consumed one per Nişanlı Atış; `critChance +0.30` while stacks > 0 | stacks 3 | `stack` | `buff_aura` |
| `trueshot` | Tam İsabet | `skill-lightning-arrow` | buff | `critDamage +0.5, attackSpeed +0.4, resourceRegenPct +1.0, pierce +1` | – | `refresh` | `enrage_aura` (gold) |
| `wild_wrath` | Vahşi Gazap | `skill-berserk` | buff | `damagePct +0.25` (pet gets `attackSpeed +0.5` + CC immunity through `MinionDef` hook) | – | `refresh` | `enrage_aura` |
| `judged` | Yargılı | `debuff-curse` | debuff | `damagePct −0.10` (enemy deals 10 % less); `Kutsal Hüküm` route marker | – | `refresh`, dispellable | `curse_loop` (gold) |
| `forbearance` | Cezalandırıldı | `debuff-weakness` | debuff | none; target cannot receive Şifa Eli / İlahi Siper again | – | `refresh` | – |
| `aura_devotion` | Adanmışlık Aurası | `buff-defense` | buff | `armorPct +0.20` (× `1 + auraPower`) | – | `refresh` | `aura_ring` |
| `aura_might` | Güç Aurası | `buff-strength` | buff | `damagePct +0.08` | – | `refresh` | `aura_ring` |
| `aura_clarity` | Berraklık Aurası | `buff-mana-regen` | buff | `resourceRegenPct +0.25, ccReductionPct +0.20` | – | `refresh` | `aura_ring` |
| `righteous` | Doğruluk | `skill-shield-wall` | buff | `armorPct +0.40, blockChance +0.20` | – | `refresh` | `buff_aura` |
| `wrath_wings` | İntikam Kanatları | `buff-blessing` | buff | `damagePct +0.30, healingPct +0.30`; +1 Kutsal Güç per 2 s | – | `refresh` | `wings_aura` |
| `bulwark` | İlahi Siper | `buff-reflect` | buff | `damageReductionPct +0.35`; reflects 20 % of damage taken as holy; CC immune | – | `refresh`, `immuneCC` | `shield_bubble` |
| `ardent` | Yılmaz Savunucu | `buff-invulnerable` | buff | `damageReductionPct +0.20`; death-save at the first lethal hit (HP → 25 %), else +20 % heal at expiry | – | `refresh` | `shield_bubble` |
| `aura_mastery` | Aura Ustalığı | `buff-aura` | buff | `damageReductionPct +0.20`; aura radius ×1.5 | – | `refresh` | `aura_ring` |
| `crusade` | Haçlı Seferi | `buff-strength` | buff | `damagePct +0.25, attackSpeed +0.20`; +1 Kutsal Güç per 2 s | – | `refresh` | `buff_aura` |
| `sentenced` | Hükümlü | `debuff-marked` | debuff | stores 50 % of the applier's damage; bursts at expiry (§4.5) | – | `refresh` | `mark_loop` |
| `curse_decay` | Çürüme | `debuff-curse` | debuff | `moveSpeedPct −0.15` (zone ticks deal the damage) | – | `refresh`, dispellable | `curse_loop` (green) |
| `bone_armor` | Kemik Zırhı | `buff-thorns` | buff | stack counter (5): each stack absorbs one hit ≤ 8 % max HP and reflects 0.6 shadow | stacks 5 | `stack` | `bone_armor` |
| `frenzy_minions` | Ölüm Çılgınlığı | `skill-berserk` | buff | on minions: `attackSpeed +0.6, damagePct +0.3`; death blast 1.5 | – | `refresh` | `enrage_aura` |
| `lich` | Lich Formu | `buff-lifesteal` | buff | `damagePct +0.35, costReductionPct +1.0` (cap lifted for this id); Kemik Mızrağı ×3; CC immune | – | `refresh`, `immuneCC` | `enrage_aura` (jade) |
| `agony` | Azap | `debuff-curse` | debuff | shadow DoT; each stack adds its own dps (§1.7) | `dotType shadow`, max 8 (+4 `n_wl_agony_mastery`) | `dotstack` | `agony_loop` |
| `corruption` | Yozlaşma | `debuff-curse` | debuff | shadow DoT 14 s | `dotType shadow` | `strongest` | `corruption_loop` |
| `unstable_affliction` | Dengesiz Azap | `debuff-shock` | debuff | shadow DoT 8 s; bursts for 2.0 r3 on expiry or target death | `dotType shadow` | `strongest` | `corruption_loop` |
| `immolate` | Yakıp Yıkma | `debuff-burn` | debuff | fire DoT 12 s | `dotType fire` | `strongest` | `burn_loop` |
| `seed` | Yozlaşma Tohumu | `debuff-marked` | debuff | fuse 3.5 s / damage cap (§6.5) | – | `refresh` | `curse_loop` |
| `havoc` | Kaos | `debuff-marked` | debuff | 60 % of the caster's direct damage is copied onto this target | – | `refresh` | `mark_loop` (violet) |
| `soul_misery` | Karanlık Ruh | `buff-crit` | buff | `dotPct +0.30`; +1 Ruh Parçası per 3 s | – | `refresh` | `fel_aura` |

Boss rules: `brewed`, `judged`, `curse_decay`, `hunters_mark`, `sentenced`, `havoc` apply fully to bosses (debuffs, not CC); `root` (Pençe Tuzağı, Kemik Hapishanesi) and `stun` (Adalet Çekici, Cehennem Muhafızı) follow the usual boss immunity + stagger-conversion rule; `taunt` follows the existing boss rule (4 s, 12 s ICD).

---

## 11. New VFX and SFX ids

### 11.1 VFX (`types/vfx.ts` append; implemented by vfx-audio; **until a real preset exists the alias runs**)

`VFX.spawn(id, pos, opts)` must resolve ids in this order: registered preset → alias entry (below) → silently nothing. The alias table lives in `src/vfx/aliases.ts` as `Record<string, { id: VfxId; color?: number; scale?: number; extra?: { id: VfxId; color?: number; scale?: number }[]; yOffset?: number }>`; caller opts (`scale`, `color`, `dir`, `duration`, `follow`, `target`) multiply/override.

| new id | alias (existing preset + opts) | real preset sketch (when built) | loop |
|---|---|---|:-:|
| `fist_trail` | `slash_arc` scale 0.5, colour `0xfff0c8` | 3 short white streaks along the fist path, 0.12 s | |
| `kick_arc` | `slash_arc_big` scale 0.7, yOffset −0.55, colour `0xffe9a0` | low crescent following the leg sweep | |
| `palm_shock` | `shockwave` scale 0.45 + `hit_spark` | flat ring r 2 + dust fan in the strike direction | |
| `chi_burst` | `hit_magic` scale 1.3, colour `0x5de0a8` | jade flash + 6 rising motes | |
| `chi_projectile` | `arcane_projectile` colour `0x5de0a8` | jade orb with comet tail | |
| `dragon_trail` | `charge_trail` colour `0x5de0a8` scale 1.2 | serpentine ribbon (sine wiggle) | |
| `brew_splash` | `poison_burst` colour `0xd9a441` scale 0.8 | amber liquid droplets + foam ring | |
| `arrow_trail` | `haste_trail` colour `0xffffff` scale 0.4 | thin additive streak behind the arrow, 0.18 s | |
| `arrow_rain` | `blizzard` colour `0xd0c090` | falling arrow streaks + dust puffs over radius `scale × 3` m | ✓ |
| `trap_ring` | `ground_slam` scale 0.3, colour `0xc8a060` | faint rune glyph that fades after arming | |
| `trap_snap` | `hit_spark` scale 1.4 + `ground_slam` scale 0.4 | iron jaws closing + dust | |
| `mark_loop` | `curse_loop` colour `0xff4040` scale 0.7 | rotating reticle above the head (colour via opts) | ✓ |
| `pet_summon` | `death_poof` colour `0xa0c070` + `respawn` scale 0.6 | leaf/dust puff | |
| `holy_slash` | `slash_arc` colour `0xffe9a0` | gold crescent with embers | |
| `judgement_pillar` | `holy_burst` scale 1.4 + `loot_beam` colour `0xffe9a0` duration 0.8 | light pillar from the sky + ring + flash | |
| `holy_hammer` | `holy_projectile` scale 1.5 | spinning hammer mesh + gold trail | |
| `aura_ring` | `buff_aura` colour `0xffe9a0` | ground ring of rotating runes, radius = opts.scale × 3 m | ✓ |
| `holy_ground` | `holy_burst` (re-spawned every 0.5 s) | gold circle + rising motes | ✓ |
| `holy_beam` | `chain_lightning` colour `0xffe9a0` with `opts.target` | soft beam caster → target, 0.25 s | |
| `wings_aura` | `buff_aura` scale 1.5, colour `0xfff0c0` | two wing-shaped additive quads behind the shoulders | ✓ |
| `heal_pillar` | `heal_burst` scale 1.6 + `loot_beam` colour `0x5aff7a` | white-green pillar with petals | |
| `bone_burst` | `hit_spark` colour `0xe8e0c8` + `death_bones` | 6–8 bone shards, 0.4 s | |
| `corpse_explosion` | `poison_burst` scale 1.3 colour `0x8fbf6a` + `death_bones` | green gore burst + bone chunks, light screen tint | |
| `grave_rise` | `death_poof` colour `0x6fe3b0` | dirt mound + green wisps | |
| `soul_wisp` | `ambient_shadow_wisps` colour `0x6fe3b0` | small wisp over each corpse | ✓ |
| `bone_prison` | `ground_slam` scale 0.8 colour `0xe8e0c8` + `death_bones` | ring of bone ribs rising | ✓ (duration) |
| `drain_beam` | `chain_lightning` colour `0xb06bff` with `opts.target` | pulsing tether (colour via opts: Necro red-black, Warlock magenta) | ✓ |
| `curse_ring` | `shadow_ground` | rotating sigil decal, radius via scale | ✓ |
| `death_nova` | `shockwave` colour `0x6fe3b0` | expanding sickly ring | |
| `bone_armor` | `buff_aura` colour `0xe8e0c8` | 5 bone shards orbiting the chest | ✓ |
| `bone_storm` | `spin_slash` colour `0xe8e0c8` | bones orbiting at radius 3.6 | ✓ |
| `corruption_loop` | `curse_loop` colour `0xa020a0` | dark wisps rising from the target | ✓ |
| `agony_loop` | `shock_loop` colour `0x8040c0` | purple spirals, density by stacks | ✓ |
| `fire_rain` | `fire_ground` + `meteor_fall` scale 0.4 | falling embers + glowing ground | ✓ |
| `demon_portal` | `portal_swirl` colour `0xc02040` scale 0.6 | small red-violet portal on the ground | |
| `fel_aura` | `enrage_aura` colour `0xb06bff` | violet flame outline | ✓ |
| `soul_orb` | `gold_sparkle` colour `0xb06bff` | orb flying from the body to the weapon | |
| `unstable_burst` | `shadow_burst` scale 1.2 | dark ring + wisps | |
| `infernal_fall` | `meteor_fall` scale 1.4 colour `0xff4020` | meteor from the sky, huge impact, ember rain | |

Always-tinted usage: many rows pass `params.vfxColor` (hex) — `SkillSystem.vfx()`/behaviours must forward it as `opts.color`.

### 11.2 SFX (`types/audio.ts` append; audio owner maps files, §9.2; **alias plays until then**)

| new id | alias (existing id + opts) |
|---|---|
| `punch_hit` | `hit_flesh` pitch 1.2 |
| `kick_hit` | `hit_blunt` |
| `chi_cast` | `spell_cast` pitch 1.3 |
| `gong` | `block` pitch 0.5 |
| `bow_draw` | `weapon_draw` pitch 1.4 |
| `arrow_hit` | `hit_flesh` pitch 1.3 |
| `trap_arm` | `lever` |
| `trap_snap` | `trap_trigger` |
| `wolf_howl` | `enemy_aggro_beast` pitch 0.8 |
| `wolf_bite` | `hit_flesh` pitch 0.9 |
| `holy_cast` | `heal` |
| `holy_impact` | `spell_cast` pitch 1.5 |
| `hammer_hit` | `ground_slam` |
| `aura_on` | `buff` |
| `divine_shield` | `buff` pitch 0.7 |
| `bone_cast` | `shadow_cast` |
| `bone_impact` | `hit_bone` |
| `raise_dead` | `enemy_aggro_ghost` pitch 0.8 |
| `curse_cast` | `shadow_cast` pitch 0.8 |
| `corpse_pop` | `explosion` pitch 1.2 |
| `fel_cast` | `shadow_cast` pitch 0.9 |
| `fel_impact` | `shadow_impact` |
| `drain_loop` | `life_leech` |
| `demon_summon` | `enemy_aggro_demon` |
| `imp_laugh` | `voice_orc_laugh` pitch 1.6 |

Resolution lives in `src/audio/aliases.ts` (`Record<string, { id: SfxId; pitch?: number; volume?: number }>`), consulted by `Audio.play/playInternal` when `SFX_MANIFEST[id]` is missing. Unknown ids never throw.

---

## 12. Passive web (PoE layer) — five new class sectors

The shared tree (`data/talents.ts`, GDD_SYSTEMS §3: 125 nodes, radius ≈ 1000) keeps all existing nodes untouched. Each new class gets a **sector** of 24 nodes attached outside the four existing **bridge notables** (cardinal axes), plus one diagonal sector for the Nekromant. (GDD_TALENTS will later add the Dragonflight-style class/spec trees on top; the web below is only the PoE layer and the notable pool they can reuse.)

### 12.1 Geometry and wiring (all nodes, data generated by `buildClassSector(cfg)`; ids `<prefix>_start`, `<prefix>_p1`, `<prefix>_a1..a7`, `<prefix>_m1..m8`, `<prefix>_b1..b7`)

| class | prefix | start `S` | outward `u` | lateral `v` = (−u.y, u.x) | entry notable `p1` | attaches to (existing) |
|---|---|---|---|---|---|---|
| paladin | `pl` | (0, −860) | (0, −1) | (1, 0) | (0, −750) | `n_spellblade` (0, −640) |
| keşiş | `mk` | (−860, 0) | (−1, 0) | (0, −1) | (−750, 0) | `n_warlord` (−640, 0) |
| okçu | `ar` | (0, 860) | (0, 1) | (−1, 0) | (0, 750) | `n_hunter_instinct` (0, 640) |
| warlock | `wl` | (860, 0) | (1, 0) | (0, 1) | (750, 0) | `n_arcane_trickster` (640, 0) |
| nekromant | `nc` | (800, −800) | (0.7071, −0.7071) | (0.7071, 0.7071) | (735, −735) | via two connectors: `nc_c1` (560, −770) ↔ `mg_c1`, `nc_c2` (770, −560) ↔ `mg_c2`, both ↔ `nc_p1` |

* Node positions: `pos(arm, k) = S + u·(68·k) + v·lat(arm)`, `lat`: arm A −150, arm M 0, arm B +150. Arm lengths A 7, M 8, B 7.
* Roles by index: A2 A4 A6, M2 M4 M6, B2 B4 B6 = **notables**; `p1` = entry notable; `M8` = **keystone**; every other arm node is a **small** node ⇒ 10 notables + 1 keystone + 12 smalls + start + p1 = 24 nodes per sector (nc +2 connectors).
* Links (bidirectional; add both directions): `start↔p1`, `p1↔<attach node>`, `start↔a1,m1,b1`, `a_k↔a_{k+1}`, `m_k↔m_{k+1}`, `b_k↔b_{k+1}`, wheel cross-links `a4↔m4` and `m4↔b4`. The attach node's own `links` array gets `<prefix>_p1` appended.
* The class start node: `kind 'start'`, `classStart: <classId>`, free for its own class at creation (`CLASS_START_NODE[classId] = '<prefix>_start'`), and a **foreign start** for others at 1 point for `+10` of the class main stat (`pl {str 10}`, `mk {dex 10}`, `ar {dex 10}`, `nc {int 10}`, `wl {int 10}`).
* `TALENT_BOUNDS = { minX: −1500, maxX: 1500, minY: −1500, maxY: 1500 }`; the talents UI initial zoom keeps framing ±1000 (new sectors are reached by panning).

```ts
interface SectorCfg {
  prefix: 'pl' | 'mk' | 'ar' | 'wl' | 'nc'; classId: ClassId; start: [number, number]; u: [number, number]; entry: [number, number];
  attach: string[];                                   // existing node ids the p1 node links to (nc: its connectors)
  smalls: { A: StatBlock[]; M: StatBlock[]; B: StatBlock[] };   // 4 each, in index order A1 A3 A5 A7 / M1 M3 M5 M7 / B1 B3 B5 B7
  notables: Record<'P1'|'A2'|'A4'|'A6'|'M2'|'M4'|'M6'|'B2'|'B4'|'B6', { id: string; name: string; desc: string; stats?: StatBlock; params?: Record<string, number> }>;
  keystone: { id: string; name: string; desc: string; stats?: StatBlock; params: Record<string, number> };   // at M8
}
```
Icons: smalls reuse `stat-*.svg` by stat; notables `stat-damage.svg` / the class' skill icons; keystones `stat-damage.svg`.

### 12.2 Small-node stat lists (value per node; names/descriptions generated from `STAT_INFO`)

| class | arm A (A1 A3 A5 A7) | arm M (M1 M3 M5 M7) | arm B (B1 B3 B5 B7) |
|---|---|---|---|
| mk | `attackSpeed .04`, `physicalDamagePct .08`, `critChance .01`, `meleeDamagePct .08` | `resourceRegenPct .10`, `moveSpeedPct .03`, `dodgeChance .02`, `cdr .03` | `maxHpPct .05`, `armorPct .12`, `vit 10`, `healReceivedPct .06` |
| ar | `projectileDamagePct .08`, `critChance .01`, `critDamage .12`, `projectileSpeedPct .10` | `resourceRegenPct .10`, `attackSpeed .04`, `dex 10`, `cdr .03` | `minionHpPct .10`, `minionDamagePct .10`, `moveSpeedPct .03`, `poisonDamagePct .08` |
| pl | `holyDamagePct .08`, `meleeDamagePct .08`, `attackSpeed .04`, `critChance .01` | `armorPct .12`, `blockChance .02`, `maxHpPct .05`, `resAll .05` | `healingPct .08`, `resourceRegenPct .10`, `aoeRadiusPct .08`, `healReceivedPct .06` |
| nc | `physicalDamagePct .08`, `critChance .01`, `projectileDamagePct .08`, `critDamage .12` | `resourceRegenPct .10`, `shadowDamagePct .08`, `int 10`, `dotPct .10` | `minionHpPct .10`, `minionDamagePct .10`, `maxHpPct .05`, `castSpeed .04` |
| wl | `dotPct .10`, `shadowDamagePct .08`, `critChance .01`, `dotPct .10` | `resourceRegenPct .10`, `castSpeed .04`, `int 10`, `maxResource 5` | `fireDamagePct .08`, `critDamage .12`, `aoeRadiusPct .08`, `cdr .03` |

### 12.3 Notables and keystones (`special.params` are read through `sp(id)` in `combat/specials.ts`; plain `stats` are folded by `StatCalc`)

**Keşiş (`mk`)**

| slot | id | Ad | effect (TR) | stats | special params |
|---|---|---|---|---|---|
| P1 | `n_mk_gate` | Tekke Kapısı | +10 Çeviklik; +%5 hareket hızı | `dex 10, moveSpeedPct .05` | – |
| A2 | `n_mk_iron_fist` | Demir Yumruk | +%25 fiziksel hasar; yumruk silahlarında +%10 saldırı hızı | `physicalDamagePct .25` | `fistAttackSpeed .10` |
| A4 | `n_mk_dragon_heel` | Ejder Topuğu | Tekme becerileri +%30 hasar verir | – | `kickDamagePct .30` (skills tagged `kick`) |
| A6 | `n_mk_thousand_palms` | Bin Avuç | Her 5. temel vuruşta bedava %100'lük ek avuç darbesi | – | `everyNth 5, extraCoef 1.0` |
| M2 | `n_mk_inner_peace` | İç Huzur | +%25 kaynak yenilenmesi; maks. Çi +1 | `resourceRegenPct .25` | `pipMaxChi 1` |
| M4 | `n_mk_chi_harmony` | Çi Uyumu | Çi harcayınca %20 şansla 1 Çi geri kazanırsın | – | `pipRefundChance .20` |
| M6 | `n_mk_flowing_river` | Akan Nehir | +%10 hareket hızı; Kaçış Yuvarlanması +1 şarj | `moveSpeedPct .10` | `dodgeRollCharges 1` |
| B2 | `n_mk_serene_body` | Dingin Beden | +%20 maks. can; +%12 alınan iyileştirme; kontrol süresi −%15 | `maxHpPct .20, healReceivedPct .12, ccReductionPct .15` | – |
| B4 | `n_mk_drunken_master` | Sarhoş Usta | Sarsma emilimi %40 → %50; havuz erime hızı −%15 | – | `staggerAbsorb .10, staggerDecayPct −.15` |
| B6 | `n_mk_celestial_fist` | Göksel Yumruk | Cennet Yumrukları bekleme süresi −%20 | – | `ultCdr .20` |
| M8 | `ks_mk_empty_hand` | **Boş El** | %30 DAHA FAZLA hasar; maks. can %20 DAHA AZ | – | `moreDamage 1.3, moreHp .8` |

**Okçu (`ar`)**

| slot | id | Ad | effect (TR) | stats | special params |
|---|---|---|---|---|---|
| P1 | `n_ar_gate` | Bozkır Kapısı | +10 Çeviklik; +%2 kritik şansı | `dex 10, critChance .02` | – |
| A2 | `n_ar_eagle_eye` | Şahin Gözü | +%20 kritik hasarı; 15 m'den uzak hedeflere +%15 hasar | `critDamage .20` | `farDamage .15, farRange 15` |
| A4 | `n_ar_piercing_shot` | Delici Uç | Oklar +1 deler; delinen her hedefte hasar düşmek yerine +%5 artar | `pierce 1` | `pierceKeep .05` |
| A6 | `n_ar_sharp_shooter` | Keskin Nişancı | +%30 mermi hasarı; Nişanlı Atış tam çekişte kesin kritik | `projectileDamagePct .30` | `fullChargeCrit 1` |
| M2 | `n_ar_steady_focus` | Sabit Odak | Hareketsizken Odak yenilenmesi +%60 ve +%10 kritik şansı | – | `stillRegenPct .60, stillCrit .10` |
| M4 | `n_ar_rapid_hands` | Hızlı Eller | +%12 saldırı hızı; Çoklu Atış +2 ok | `attackSpeed .12` | `multishotExtra 2` |
| M6 | `n_ar_wind_walker` | Rüzgâr Yürüyüşü | +%8 hareket hızı; Geri Sıçrayış bekleme −%35 | `moveSpeedPct .08` | `disengageCdr .35` |
| B2 | `n_ar_pack_bond` | Sürü Bağı | Yoldaşın +%40 can ve hasar; ölünce 6 sn'de döner | `minionHpPct .40, minionDamagePct .40` | `petRespawn 6` |
| B4 | `n_ar_trapper` | Tuzak Ustası | Tuzaklar +%50 hasar, bekleme −%25, +1 aynı anda tuzak | `trapDamagePct .50` | `trapCdr .25, trapMax 1` |
| B6 | `n_ar_venom_tip` | Zehirli Uç | +%35 zehir hasarı; oklar %20 şansla zehirler | `poisonDamagePct .35, poisonChance .20` | – |
| M8 | `ks_ar_lone_wolf` | **Yalnız Kurt** | Yoldaş çağıramazsın; %25 DAHA FAZLA hasar; +%12 kaçınma | `dodgeChance .12` | `noPet 1, moreDamage 1.25` |

**Paladin (`pl`)**

| slot | id | Ad | effect (TR) | stats | special params |
|---|---|---|---|---|---|
| P1 | `n_pl_gate` | Ak Kale Kapısı | +10 Güç; +%5 maks. can | `str 10, maxHpPct .05` | – |
| A2 | `n_pl_righteous_fury` | Haklı Öfke | +%25 kutsal hasar; Haçlı Darbesi %15 şansla ek Kutsal Güç verir | `holyDamagePct .25` | `crusaderExtraHp .15` |
| A4 | `n_pl_scales_of_justice` | Adalet Terazisi | Yargı etkisi 16 sn sürer; yargılı hedefe +%12 hasar | – | `judgedDuration 6, judgedTakenMore .12` |
| A6 | `n_pl_executioners_light` | Cellat Işığı | Canı < %35 düşmanlara +%40 kutsal hasar; öldürünce +1 Kutsal Güç; Gazap Çekici +%20 hasar | `executeDamagePct .40` | `killHolyPower 1, hammerOfWrathMore .20` |
| M2 | `n_pl_sworn_shield` | Yeminli Kalkan | +%25 zırh; +%8 blok şansı; Doğruluk Kalkanı +2 sn | `armorPct .25, blockChance .08` | `righteousExtraSec 2` |
| M4 | `n_pl_aura_master` | Aura Ustası | Aura yarıçapı +%30; aura etkileri +%25 güçlü | – | `auraRadius .30, auraPower .25` |
| M6 | `n_pl_unyielding` | Yılmaz Kalp | +%15 maks. can; kontrol −%30; ölümcül hasarda 60 sn'de bir %20 canla ayakta kal | `maxHpPct .15, ccReductionPct .30` | `cheatDeathHp .20, cheatDeathIcd 60` |
| B2 | `n_pl_healing_light` | Şifa Işığı | +%20 şifa gücü; şifalar %20 şansla ek bir müttefiki %50 iyileştirir | `healingPct .20` | `splashHealChance .20, splashMult .5` |
| B4 | `n_pl_beacon_soul` | Fener Ruhu | Şifa Eli bekleme −%35; Cezalandırıldı 30 sn kısalır | – | `lohCdr .35, forbearanceMinus 30` |
| B6 | `n_pl_sun_seal` | Güneş Mührü | Maks. Kutsal Güç +1; harcamada %15 şansla geri döner | – | `pipMaxHolypower 1, pipRefundChance .15` |
| M8 | `ks_pl_lightbringer` | **Işık Taşıyıcı** | Tüm kutsal hasar ve şifa %30 DAHA FAZLA; zırh %25 DAHA AZ | – | `moreDamage 1.3, moreHealing 1.3, moreArmor .75` |

**Nekromant (`nc`)**

| slot | id | Ad | effect (TR) | stats | special params |
|---|---|---|---|---|---|
| P1 | `n_nc_gate` | Mezar Kapısı | +10 Zeka; +%10 gölge hasarı | `int 10, shadowDamagePct .10` | – |
| A2 | `n_nc_marrow_master` | İlik Ustası | +%30 fiziksel hasar; Kemik Mızrağı +1 deler | `physicalDamagePct .30` | `spearPierce 1` |
| A4 | `n_nc_bone_harvest` | Kemik Hasadı | Ceset Patlaması yarıçapı +%25; zincir +1 | – | `corpseExplosionRadius .25, corpseChain 1` |
| A6 | `n_nc_spear_lord` | Mızrak Lordu | Her 4. Kemik Mızrağı 3 mızrak atar | – | `spearBarrageEvery 4, spearBarrageCount 3` |
| M2 | `n_nc_corpse_collector` | Cesetçi | Ceset ömrü +%50; ceset tüketince +8 Öz | – | `corpseLife .5, corpseEssence 8` |
| M4 | `n_nc_curse_master` | Lanetlerin Efendisi | Lanet süresi +%40, yarıçap +%20; lanetli düşmanlara +%15 hasar | `ailingDamagePct .15` | `curseDuration .4, curseRadius .2` |
| M6 | `n_nc_death_scent` | Ölüm Kokusu | +%40 zamanla hasar; ölen düşman %25 şansla Ruh Küresi bırakır (maks. canın %5'i) | `dotPct .40` | `orbChance .25, orbHeal .05` |
| B2 | `n_nc_eternal_army` | Sonsuz Ordu | +1 iskelet sınırı; ölen iskelet %20 şansla ayağa kalkar | – | `skeletonCap 1, skeletonRevive .20` |
| B4 | `n_nc_soul_bond` | Ruh Bağı | Aldığın hasarın %15'i minion'lara dağılır; minion'lar saniyede %3 can yeniler | – | `damageToMinions .15, minionRegen .03` |
| B6 | `n_nc_blood_priest` | Kan Rahibi | +%0.5 can çalma (minion'lar da iyileşir); +%15 maks. can | `lifeSteal .005, maxHpPct .15` | – |
| M8 | `ks_nc_unliving` | **Ölümsüz** | Minion'lar %40 DAHA FAZLA hasar verir; maks. can %30 DAHA AZ; iyileştirmeler %50 etkisiz | – | `minionMore 1.4, moreHp .7, healMult .5` |

**Warlock (`wl`)**

| slot | id | Ad | effect (TR) | stats | special params |
|---|---|---|---|---|---|
| P1 | `n_wl_gate` | Kızıl Pakt Kapısı | +10 Zeka; +%0.3 can çalma | `int 10, lifeSteal .003` | – |
| A2 | `n_wl_blight_master` | Yozlaşma Ustası | +%40 zamanla hasar; DoT süreleri +%20 | `dotPct .40` | `dotDuration .20` |
| A4 | `n_wl_agony_mastery` | Acı Tadı | Azap maks. yığını +4 (12); yığın başına +%2 hasar | – | `agonyMaxStacks 4, agonyPerStack .02` |
| A6 | `n_wl_soul_reaper` | Ruh Biçen | DoT'lu düşman ölünce %25 şansla +2 Ruh Parçası | – | `shardOnKillExtra .25` |
| M2 | `n_wl_blood_pact` | Kan Pakti | Can Dönüşümü maliyeti −%33, verdiği mana +%50 | – | `lifeTapCostMult .67, lifeTapManaMult 1.5` |
| M4 | `n_wl_demon_bond` | İblis Bağı | İblisin can ve hasarı +%35; ölen iblis %50 daha hızlı döner | `minionHpPct .35, minionDamagePct .35` | `demonRespawn .5` |
| M6 | `n_wl_dark_covenant` | Karanlık Antlaşma | Kaos Oku 1 Ruh Parçası daha ucuz; Ruh Parçası kazancı +%20 | – | `chaosBoltCost −1, shardGain .20` |
| B2 | `n_wl_conflagrate` | Yıkım Sanatı | +%30 ateş hasarı; ateş kritik hasarı +%25 | `fireDamagePct .30, critDamage .25` | – |
| B4 | `n_wl_fate_link` | Kader Bağı | Aldığın hasarın %20'si iblise yönlenir; iblis %30 daha az hasar alır | – | `damageToMinions .20, minionDr .30` |
| B6 | `n_wl_brimstone` | Ateş ve Kükürt | Ateş Yağmuru +%40 hasar, +%25 yarıçap | – | `rainDamage .40, rainRadius .25` |
| M8 | `ks_wl_pain_contract` | **Acı Sözleşmesi** | Zamanla hasar %35 DAHA FAZLA; anlık hasar %25 DAHA AZ | – | `dotMore 1.35, directMore .75` |

### 12.4 Spec talent hooks (seeds for GDD_TALENTS; not specified further here)

| spec | hooks |
|---|---|
| monk_windwalker | Kara Tekme 2 kez vurur · Kaplan Öfkesi +4 sn · Cennet Yumrukları +4 vuruş ve %15 Çi iadesi · Uçan Yılan kombosu Çi iade eder |
| monk_brewmaster | Arındırıcı İksir +1 şarj · Fıçı Darbesi yarıçap +1 m ve bekleme −2 sn · Kara Öküz basışları düşmanı yakar · Sarsma bir kez %50 yumuşar |
| archer_marksman | Nişanlı Atış +1 delme · Keskin Nişan sırasında oklar patlar · Seri Ateş +6 ok · Son Atış sıfırlanma şansı %50 |
| archer_beastmaster | Av Emri yoldaşı iki kez atar · Ayı: Kükreme kalkan verir · Av Sürüsü +6 sn ve üçüncü kurt · Yoldaş Vahşi Gazap'ta alan hasarı verir |
| paladin_protection | Doğruluk Kalkanı Kutsal Güç iade eder · Kutsanmış Çekiç +1 şarj · İlahi Siper +3 sn · Hesaplaşma bekleme −3 sn · Kalkan Duvarı benzeri blok penceresi (Knight ile paylaşılan) |
| paladin_holy | Kutsal Şok iki hedefi birden iyileştirir · Işığın Sözü HoT bırakır · Sığınak +4 sn · Beacon (şifaların %30'u ikinci hedefe) |
| paladin_retribution | İlahi Fırtına kritik şansı artırır · Gazap Çekici çarpınca zincirler (+1 hedef) · Haçlı Seferi +%10 · İdam Hükmü depolama %70 |
| necromancer_summoner | Golem sınırı 2 · Komut: Hücum iskeletleri patlatır · Kemik Şövalyeleri +1 · İskeletler cesetten doğunca %20 hızlı |
| necromancer_bone | Kemik Fırtınası sırasında mızrak atılır · Ceset Patlaması zinciri +1 · Lich formu +5 sn · Kan Dalgası yarıçap +2 m |
| warlock_affliction | Pandemik +4 sn · Seed 2 hedef ekler · Azap yığını başına kritik · Dengesiz Azap iki kez patlar |
| warlock_destruction | Kaos Oku +%15 kritik hasar · Yakıp Yıkma yayılır · Kıyamet Yağmuru +2 top · Kaos hedefi 2'ye çıkar |

---

## 13. Class selection UI (3D menu) and presentation data

### 13.1 Layout for 9 classes (scenes owner: `ui/menu/MenuUI.ts`, `menu.css`, `classInfo.ts`)

* The vertical list of class cards (`.efs-class`, 4 cards today) does not fit 9. Replace with a **3 × 3 tile grid** `div.efs-classgrid` (`display:grid; grid-template-columns:repeat(3,1fr); gap:8px`) inside `.efs-create-l` (width stays `clamp(290px,24vw,370px)`). Tile = 86×96 px: 40 px mask icon (existing `iconStyle`), class name (Cinzel 13 px), three 8 px role pips (blue shield = tank, green cross = healer, red blade = DPS) lit for the roles the class offers; `--c` accent border, `.sel` glow as today. Selected tile also shows its tagline under the grid (single line).
* **Order = `CLASS_ORDER`** (also drives `LoadingScene` preloads): row 1 *Ön Saf* — `knight`, `paladin`, `monk`; row 2 *Vahşi · Suikast* — `barbarian`, `rogue`, `archer`; row 3 *Büyü* — `mage`, `necromancer`, `warlock`. Keyboard: arrow keys move the selection, `Enter` jumps to the name field; mouse wheel on the grid does nothing (page scroll only).
* Narrow screens (existing `@media` block): same grid, 56 px tiles, no tagline; the right panel is hidden as today.
* Right panel "Sınıf Bilgisi": after the role/resource badges add a **spec row**: one chip per spec (`SpecDef.name` + role pip; wave-2 specs shown greyed with "yakında"), then highlights and the four characteristic pip bars (`dayaniklilik hasar hareket menzil`).
* Pedestal: `setPedestalClass` keeps its pop/flash; the showcase loop uses the presentation rows below. Optional (P2): companions on the pedestal — archer: wolf `Idle`; warlock: imp floating; necromancer: two skeleton warriors rising (`Spawn_Ground_Skeletons` ×2.2) on showcase step 3 (`MenuScene.pedExtras: Visual[]`, disposed on class change).
* Saved-character rows: meta line `Sv. 42 Keşiş · Demci` (spec from `flags['spec']`, else just the class).
* Character creation creates **no spec** (L10 decision); below L10 a "Uzmanlık seç" toast appears on level-up to 10.

### 13.2 Presentation rows (`classInfo.ts` `FALLBACK`; the `ClassDef` fields override name/desc/colour/resource as today)

| id | tagline | role | resource label (colour) | color | icon | idle | stats (dayanıklılık / hasar / hareket / menzil) |
|---|---|---|---|---|---|---|---|
| `monk` | Bedenin ve Ruhun Ustası | Tank · DPS · Çi Ustası | Enerji + Çi (`#e2c22a`) | `#4fd1c5` | `buff-strength` | `Unarmed_Idle` | 3 / 4 / 5 / 1 |
| `archer` | Rüzgârın Gözü | Uzak Menzil · Avcı | Odak (`#d9a441`) | `#d9a441` | `class-ranger` | `Idle` | 1 / 5 / 3 / 5 |
| `paladin` | Işığın Yeminli Kılıcı | Tank · Şifacı · Savaşçı | İnanç + Kutsal Güç (`#ffe9a0`) | `#fff0b8` | `class-cleric` | `Idle` | 5 / 3 / 2 / 2 |
| `necromancer` | Kemiklerin Fısıltısı | Çağırıcı · Ölüm Büyücüsü | Öz (`#6fe3b0`) | `#9ee07a` | `skill-summon-skeleton` | `Idle` | 2 / 5 / 2 / 4 |
| `warlock` | Karanlığın Sözleşmesi | Lanetler · İblis Yoldaşı | Mana + Ruh Parçası (`#4f8bff`) | `#c05ae0` | `skill-curse` | `Idle` | 2 / 5 / 2 / 5 |

| id | desc (TR) | highlights (TR) | showcase steps (`clip` · vfx at s · offset · sfx · speed) — vfx ids exist today |
|---|---|---|---|
| `monk` | Silah yerine yumruğu, tekmeyi ve nefesi (Çi) kullanan sis tekkesinin dövüşçüsü. Kombolarını zincirler, yuvarlanıp sıçrar; demci olarak darbeleri erteler, rüzgâr yürüyen olarak durmadan vurur. | `Yükselen Tekme → Uçan Yılan: tekme zincirinden sonra sıçra` · `Çi: vuruşlar biriktirir, ağır beceriler harcar` · `Sarsma: aldığın hasarı ertele, iksirle temizle` | `Unarmed_Melee_Attack_Punch_A` · `slash_arc` 0.40 · [0,1.3,1.1] · `swing_light` · ×1.4 ; `Unarmed_Melee_Attack_Kick` · `slash_arc_big` 0.34 · [0,0.8,1.3] · `swing_heavy` ; `Dualwield_Melee_Attack_Stab` · `shockwave` 0.50 · [0,0.1,1.8] ×0.5 · `ground_slam` · ×1.3 ; `Cheer` |
| `archer` | Bozkırın yay ustası. Uzaktan vurur, geri sıçrar, tuzak kurar ve kurt yoldaşıyla avlanır. Hareketsiz durdukça Odağı hızla dolar; nişancı olarak tek hedefi avlar, av ustası olarak sürüsüyle savaşır. | `Nişanlı Atış: yayı çek, tam çekişte öldür` · `Geri Sıçrayış: kaç ve vurmaya devam et` · `Av Sürüsü: iki ek kurtla sürüyle saldır` | `2H_Ranged_Shoot` · `hit_spark` 0.30 · [0,1.5,1.6] · `crossbow_shot` ; `Dodge_Backward` · `dodge_dust` 0.10 · [0,0.1,0] ; `2H_Ranged_Shoot` ×0.75 · `shockwave` 0.40 · [0,1.4,2.0] ×0.4 · `crossbow_shot` ; `Cheer` |
| `paladin` | Kılıcı, topuzu ve kalkanıyla ışığa yemin etmiş zırhlı rahip. Koruma ile düşman dalgalarını durdurur, Kutsal ile ölmekte olan dostu geri çağırır, Ceza ile hüküm verir; auralarıyla tüm partiyi güçlendirir. | `Yargı → Kutsal Hüküm: yargıla, sonra hükmet` · `Aura: partiyi sürekli güçlendir` · `Şifa Eli: ölmek üzere olan dostu kurtar` | `1H_Melee_Attack_Slice_Diagonal` · `slash_arc` 0.38 · [0,1.3,1.2] · `swing_light` ; `Spellcast_Raise` ×2.0 · `holy_burst` 0.9 · [0,0.2,1.6] · `heal` ; `1H_Melee_Attack_Chop` · `slash_arc_big` 0.45 · [0,1.5,1.3] · `swing_heavy` ; `Cheer` |
| `necromancer` | Ölümü hammadde sayan kuzgun kastının büyücüsü. Düşen düşmanların cesetlerini iskelete, patlamaya ya da laneti dönüştürür. Ordu efendisi olarak sürü yönetir, kemik ustası olarak doğrudan yıkım saçar. | `İskelet çağır: cesetten daha güçlü minion` · `Kemik Mızrağı → Ceset Patlaması: zinciri başlat` · `Ölüler Ordusu: sekiz iskelet birden` | `Spellcast_Shoot` · `hit_magic` 0.37 · [0,1.5,1.4] · `shadow_cast` ; `Spellcast_Raise` ×2.0 · `death_poof` 0.95 · [0,0.1,2.0] ; `Spellcast_Summon` ×1.6 · `death_bones` 1.5 · [0,0.1,2.2] · `boss_cast` ; `Cheer` |
| `warlock` | Ruhunu bir iblise rehin bırakmış kızıl pakt büyücüsü. Acıyı zamanla bir silaha çevirir; canını manaya, ruh parçalarını kaosa dönüştürür. İblis yoldaşı ve kıyamet ateşiyle savaşır. | `Azap · Yozlaşma · Dengesiz Azap: lanet zinciri` · `İblis yoldaşı: İblisçik ya da Boşluk Gezgini` · `Kaos Oku: Ruh Parçalarını yıkıma çevir` | `Spellcast_Shoot` · `shadow_burst` 0.37 · [0,1.5,1.4] · `shadow_cast` ; `Spellcast_Raise` ×2.0 · `fire_burst` 0.95 · [0,0.1,1.8] · `fire_cast` ; `Spellcast_Long` · `meteor_fall` 1.4 · [0,0.1,2.2] · `explosion` ; `Cheer` |

---

## 14. Work-package index (full text of every package is in the `implementationPlan` returned with this doc; each is Haiku-sized)

Prefix **NC** = "new classes". Owners use the ARCHITECTURE module names. **Prerequisite for the whole list: GDD_V2 WP1 (contracts: `SkillSlotKey 'm45'|'m90'|'m180'`, `SkillDef.spec`, `SpecDef`/`SpecId`, healing/threat stats, `types/v2.ts`) is merged; GDD_V2 WP2 (Elden Ring layer: heavy/guard/parry/riposte, `data/weaponArts.ts`, `data/comboRoutes.ts`, `combat/feel.ts` FEEL v2) and WP5 (specs/roles, majors, healing, threat, `provoke`, ally smart targeting, `data/specs.ts`) are merged before the packages that name them.** Where V2's work is not merged yet, implement against its stubs and report (assumption A3). **Order**: A (types/registry) → B (data) → C (systems; mostly parallel) → D (presentation) → QA. Packages that touch different files can run in parallel. Skill data goes into **new per-class files** under `src/data/skillsets/` — `monk.ts archer.ts paladin.ts necromancer.ts warlock.ts` (combo + 8 core), `monkSpecs.ts archerSpecs.ts paladinSpecs.ts paladinHoly.ts necromancerSpecs.ts warlockSpecs.ts` (spec skills + majors), `layerMonkArcher.ts layerPaladinCasters.ts` (Elden Ring rows) — each exporting `register<Name>(add)`. **NC04 creates all of them as empty stubs and wires them into `data/skills.ts` once**, so NC10–NC20 and NC31–NC32 only fill their own file and never touch `data/skills.ts`. The same trick is used for minion defs (`src/data/minions/{monk,archer,necromancer,warlock}.ts`, aggregated by `src/data/minions.ts`, NC23), passive sectors (`src/data/talentSectors/{mk,ar,pl,nc,wl}.ts`, aggregated by NC26) and behaviours (`src/combat/skills/behaviors_<class>.ts` stubs created by NC48). Packages that must edit the same existing file are chained by their dependencies (`Combat.ts`: NC37 → NC47 → NC42; `SkillSystem.ts`: NC35 → NC38; `data/statuses.ts`: NC21 → NC22).

**Removed or folded compared with the pre-V2 plan**: no `m1`/`m2` slot package (V2 WP1/WP6 own `m45/m90/m180`, X/V/T); no ally-targeting package (V2 WP5 `healing.ts`, `heal_target`/`light_bolt`, smart target); no threat package (V2 WP4/WP5: `threatPct`, `threatMult`, `provoke`); the spec-system package shrinks to appending 11 `SpecDef` rows (NC05); the spec picker UI is V2 WP8.

| NC | title | module(s) | deps |
|---|---|---|---|
| 01 | types: `common.ts` (ClassId ×5, ResourceType ×3, PipId, EntityKind `minion`, `MINION_ID_BASE`), `stats.ts` (`minionDamagePct minionHpPct trapDamagePct`), `events.ts` (`pips:changed`, `minion:*`, `corpse:*`) | core | V2.WP1 |
| 02 | types: `skills.ts` (SkillDef `pip route minion aura allyTarget animCycle holdAnim`, StatusId appends), NEW `types/classes.ts`, NEW `types/minions.ts` | core | 01 |
| 03 | VFX_IDS/SFX_IDS appends + alias resolvers `vfx/aliases.ts`, `audio/aliases.ts` | vfx-audio | 01 |
| 04 | `data/classes.ts`: `ClassDefX` registry fields + 5 class entries + helpers; empty skillset stub files wired into `data/skills.ts` | combat | 02 |
| 05 | `data/specs.ts`: append the 11 wave-1 `SpecDef` rows to V2's `SPECS` | combat | 02, 04, V2.WP5 |
| 06 | items module: class-keyed tables derive from the registry; StatCalc `manaScaling` | items | 04 |
| 07 | visuals from the registry: CharacterModel, CharacterVisual, CharacterPreview | player, scenes, panels-items | 04 |
| 08 | remaining class-keyed maps: PlayerFrame, panels-game base, CharacterPanel, SkillsPanel, net messages, Audio `packFor`, dev arrays | hud, panels-game, panels-items, net, audio | 04 |
| 09 | item bases `fist/bow/mace/quiver`, `modelByClass`, start gear, GEAR_FAMILIES rows | items | 06 |
| 10 | skills: Keşiş combo + 8 core | combat | 02, 04 |
| 11 | skills: Keşiş spec skills (+ `monk_provoke`) + 4 majors | combat | 10, 05 |
| 12 | skills: Okçu combo + 8 core | combat | 02, 04 |
| 13 | skills: Okçu spec skills + 4 majors + `archer_wolf_ally` minion row | combat | 12, 05 |
| 14 | skills: Paladin combo + 8 core | combat | 02, 04 |
| 15 | skills: Paladin Koruma + Ceza spec skills + majors | combat | 14, 05 |
| 16 | skills: Paladin Kutsal `paladin_holy_basic` + 5 spec skills + majors | combat | 14, 05 |
| 17 | skills: Nekromant combo + 8 core | combat | 02, 04 |
| 18 | skills: Nekromant spec skills + 4 majors | combat | 17, 05 |
| 19 | skills: Warlock combo + 8 core | combat | 02, 04 |
| 20 | skills: Warlock spec skills + 4 majors | combat | 19, 05 |
| 21 | statuses A (monk, archer, paladin) | combat | 02 |
| 22 | statuses B (necromancer, warlock) | combat | 21 |
| 23 | minion data: aggregator `data/minions.ts` + Keşiş + Okçu files | combat | 02 |
| 24 | minion data: Nekromant file | combat | 23 |
| 25 | minion data: Warlock file | combat | 23 |
| 26 | passive web: `buildClassSector` generator + aggregator + bounds + start nodes + attach links + Keşiş sector file | items | 04 |
| 27 | passive web: Okçu sector | items | 26 |
| 28 | passive web: Paladin sector | items | 26 |
| 29 | passive web: Nekromant sector | items | 26 |
| 30 | passive web: Warlock sector | items | 26 |
| 31 | Elden Ring rows A: heavy/run/jump/roll/riposte `SkillDef`s for Keşiş and Okçu (`mk_*`, `ar_*`) | combat | 10, 12, V2.WP2 |
| 32 | Elden Ring rows B: the same for Paladin, Nekromant, Warlock (`pl_*`, `nc_*`, `wl_*`) | combat | 14, 17, 19, V2.WP2 |
| 33 | weapon arts: append 6 rows to `data/weaponArts.ts` (`wa_tiger_barrage wa_crushing_blow wa_piercing_bolt wa_dawn_wave wa_bone_spike wa_soul_flare`) | combat | 05, V2.WP2 |
| 34 | `data/comboRoutes.ts` rows (23 routes) + verify `FEEL_WEAPON` (fist/mace/bow/staff/wand) + guard fields of the 11 specs | combat | 31, 32, 33 |
| 35 | pips generalisation (SkillSystem, events) | combat | 02, 04 |
| 36 | pip HUD (`PipBar`) + resource gauge kinds (`RES_NAME`, CSS) | hud | 35 |
| 37 | resource regen rules (`regenRule`, focus still-time) | combat, items | 04 |
| 38 | route system (+ ActionBar route glow; also registered as `ComboRouteDef`) | combat, hud | 35, V2.WP2 |
| 39 | `Minion` entity + `World.minions` | combat, core | 02 |
| 40 | `MinionAI` | enemies | 39 |
| 41 | `Minions` manager (caps, summon, commands, respawn) + `minion_summon`/`minion_command` behaviours | combat | 39, 40 |
| 42 | minion damage hooks: `minionHitEnemy`, `hitMinion`, `redirectDamage`, HitShapes, EnemyAI target scoring | combat, enemies | 39, 47, V2.WP4 |
| 43 | `minion` net channel + Replication | net | 39 |
| 44 | `MinionFrames` HUD + nameplates | hud | 39 |
| 45 | `Corpses` registry + hooks | combat | 02 |
| 46 | `Auras` | combat | 02 |
| 47 | stagger pool + `StaggerBar` | combat, hud | 37, V2.WP2 |
| 48 | shared behaviours: `chain_projectile`, `pip_finisher`, `target_status`, `channel_cone`, `beam_drain`, `orbit_hammers` + per-class behaviour stub files (reuse V2 heal/`provoke` behaviours) | combat | 35, 38, V2.WP5 |
| 49 | Keşiş behaviours | combat | 48, 47 |
| 50 | Okçu behaviours | combat | 48, 41 |
| 51 | Paladin behaviours | combat | 48, 46, V2.WP5 |
| 52 | Nekromant behaviours | combat | 48, 41, 45 |
| 53 | Warlock behaviours (+ shard hooks) | combat | 48, 41 |
| 54 | specials hooks for passives/notables | combat | 05, 26–30 |
| 55 | vfx presets: Keşiş + Okçu | vfx-audio | 03 |
| 56 | vfx presets: Paladin | vfx-audio | 03 |
| 57 | vfx presets: Nekromant + Warlock | vfx-audio | 03 |
| 58 | audio: sfx mapping, voices, `onLocalCast` kinds | audio | 03, 04 |
| 59 | player: attach recipes (bow, quiver, book), Mug keg override, idle clips | player | 07 |
| 60 | menu: 3×3 class grid + presentation rows + spec chips | scenes | 04, 05 |
| 61 | dev pages + combat-sim + `classbench` + minion scenario | dev, combat | 04 |
| 62 | QA pass (browser, per class) | qa | all |

---

## 15. Assumptions and open questions for the orchestrator

1. **GDD_V2 / GDD_LIFE are the authority.** Specs, majors (`m45`/`m90`, X/V), unlock schedule, role baselines, healing/threat/smart targeting, the Elden Ring layer and FEEL v2 are adopted as written (§0.1); if they change, only the data rows in §2–§6 change. Spec choice at L10. Several packages depend on V2 WP2/WP5 being merged; they can start against V2's stubs (A3).
2. **Warlock uses `mana`** (needs the `regenRule`/`manaScaling` generalisation of §1.2). The alternative (new `soulpower` bar) was rejected to avoid a fourth new HUD kind.
3. **Healer count**: wave 1 has two healer specs in total with V2's Işık Çağıran and Simyacı plus Paladin · Kutsal; Mistweaver is wave 2. If Paladin · Kutsal slips, parties still have V2's two healers.
4. **Minion ids** use `MINION_ID_BASE = 900_000` (below `LOCAL_ID_BASE`); `HOST_DYNAMIC_ID_BASE` range 50_000–899_999 is unchanged. Net budget: up to 14 minions per peer at 10 Hz (≈ 14 × 24 B ≈ 3.4 kB/s).
5. **Okçu hawk pet** is a stub (no bird model); wolf and bear ship. Wave 2: Hayatta Kalma spec, İblis Ustası spec, Sis Dokuyan, Kan Rahibi.
6. **Clip hit-times marked †** (Punch A/B, `Spellcast_Raise` burst, `Spellcast_Summon` effect frame, `Taunt`, Infernal `Attack`) are estimates; verify by scrubbing in `dev/combat.html` and update the tables (the data rows carry the numbers, not the code).
7. **Bow attach** reuses the crossbow transform (`attachFor` already routes `bow` there) — needs a visual pass.
8. **Armour mitigation parity**: Monk/Archer wear medium armour (Rogue-like); tank specs get their survivability from passives (`armorPct`, `maxHpPct`) rather than from armour weight.
9. **Performance**: minion AI throttle (every 3rd frame beyond 40 m), shared skeleton clips, `frustumCulled = false`, max 40 minions per world. Necromancer + Warlock + Archer parties are the worst case; QA must measure.
10. **Icon credits**: no new game-icons files are required; optional class glyphs would need a credits entry.
11. **GDD_TALENTS** (ROADMAP batch 5; file does not exist yet) should treat §12.3 notables as the PoE-layer additions and §12.4 as seeds; the `N` window must scroll to ±1500 for the new sectors.
12. **Stat balance risk**: `minionDamagePct` and `healingPct` are new multiplicative buckets — add them to the item affix pools only after the bench (§7.4) is green.
13. **Optional hero-family slot for Av Ustası.** V2 gives the `m180` hero effect (T / 180 s) to exactly four existing specs; the Okçu BM 90 s major is a pack summon (`archer_bm_pack_hunt`) so the class does not need one. If the owner wants a hero effect for the Okçu, add `archer_horn_call` to V2 §2.1's hero family list and a fifth slot in `SpecDef.majors.m180`; nothing in this document blocks that.
14. **Paladin / Şövalye overlap.** Differentiation is aura, ally support, throws and Kutsal Güç; Ceza can be postponed to wave 2 without touching the other specs (A6).
15. **Keşiş chain length.** GDD_LIFE §5.13 pencilled a 5-step Keşiş chain; this document uses 4 steps (ARCHITECTURE range 3–4) with the same 3.6 coef/s target (A5). A 5th step only needs one more row `monk_basic_5` and `steps: 5`.
16. **Heavy/guard for casters.** Nekromant and Warlock have no guard (parry window only); V2 gives that to Elementalist/Işık Çağıran too, so the rule is consistent.

