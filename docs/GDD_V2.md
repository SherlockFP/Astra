# EFSUN ONLINE – Kadim Zindanlar · GDD V2 "Sistemler 2.0" (design addendum)

> Implementation contracts (WP1 types, ids, events, bindings, save migration, stubs): see `ARCHITECTURE.md` section "V2 contracts (WP1)".

> Status: v2.0, implementation-ready. Owner: lead game design. This document **extends** `docs/GDD_SYSTEMS.md` (stats, classes, items, loot, feel) and `docs/GDD_CONTENT.md` (enemies, dungeons, Mythic+). Nothing here removes an existing system; every place where V2 **changes** an existing rule is marked `OVERRIDE` and listed in §0.2.
> Precedence: `ARCHITECTURE.md` > `src/types/*` > this file > `GDD_SYSTEMS.md` / `GDD_CONTENT.md` (for the rules V2 touches). The code was checked while writing: where the older GDD and the code disagree (for example LMB chains are **4 steps** in code, threat/taunt/stagger already exist in `Combat.ts` and `EnemyAI.ts`), this document follows the **code**.
> Audience: the module owners listed in §12 (combat, enemies, items, mythic, hud, panels, scenes, net, vfx-audio). All **player-facing strings are Turkish**; ids are English snake_case; stat ids are the existing camelCase `StatId`s plus the NEW ones in §0.3.
> Numbers are initial tuning values and belong in data tables, never in logic. Percent notation, rounding and "DAHA FAZLA" (= separate multiplicative factor) follow GDD_SYSTEMS §0.
> User priority (unchanged): **combos, effects and hit feel come first.** §3 (Elden Ring depth) and §2 (cast feedback) are the first things to implement and polish.

## Table of contents

0. Conventions, overrides, new ids, final key bindings, role rules
1. Roles & specializations (2 specs per class, threat, tank kit, healer kit, DPS rotations, M+ role scaling)
2. Major cooldowns (45 s / 90 s / 3-min "Kurt Narası"), HUD layout
3. Elden Ring-style combat depth (heavy, run, jump, guard, parry, riposte, backstab, poise/stance break, weapon arts, combo routes)
4. Path of Exile systems (Destek Rünleri, Şişeler, Küreler, Mühürler)
5. Diablo systems (Aspektler, Elit Efsunları, Kadim Levha, Goblinler)
6. WoW tier sets (8 specs × 5 pieces, tokens, katalizör)
7. Creature weaknesses & Bestiyari
8. Mythic+ depth (forces, route planner, tank routes, kick helper, death recap, seasons, titles)
9. RAID "Efsun Kalesi" (5 bosses, layout, lockout, difficulties)
10. Boss mechanic library (reusable templates)
11. Balance overview, progression flow, UI change list
12. Implementation plan (work packages, owners, files, waves)
Appendix A. Type / data additions (copy-paste sketches)

---

## 0. Conventions, overrides, new ids, final key bindings, role rules

### 0.1 Naming

| Thing | Rule |
|---|---|
| Specs | `SpecId` = `<class>_<name>`: `knight_protector`, `knight_blademaster`, `barbarian_warlord`, `barbarian_butcher`, `mage_elementalist`, `mage_lightbringer`, `rogue_assassin`, `rogue_alchemist` |
| Roles | `RoleId` = `'tank' \| 'healer' \| 'dps'` (TR: Tank / Şifacı / Hasarcı) |
| New skills | `<class>_<name>`; spec-bound skills carry `SkillDef.spec: SpecId` (optional field, §A) |
| Major cooldown slots | `SkillSlotKey` NEW members `'m45' \| 'm90' \| 'm180'` (see §2) |
| Runes | `sup_*` (Destek Rünü, 24), rune items `rune_<name>_<rank 1..3>` |
| Flasks | `flask_*` bases, `fl_pre_*` / `fl_suf_*` affixes |
| Orbs | `orb_*` currency materials (stackable in `CharacterSave.materials`) |
| Seals | `seal_*` (Mühür) materials |
| Aspects | `asp_*` |
| Elite mods | the existing `ChampionMod` ids (`hizli atesli dondurucu kalkanli vampir isinlanan diriltici`) + 8 new |
| Families | `FamilyId` (§7): `beast undead_bone undead_flesh ghost insect slime fungus humanoid cultist golem demon elemental_fire elemental_frost dragon` |
| Raid | `efsun_kalesi`, bosses `rd_*`, packs `r_pNN`, rooms as in §9.3 |

### 0.2 OVERRIDE list (V2 changes an existing rule; the code owner must update)

| # | Existing rule | V2 rule | Why | Owner |
|---|---|---|---|---|
| O1 | `Sendeleme` (stagger break): stun 3 s elite / 4 s boss, ×1.25 damage, lock 10 s (`Combat.addStagger`) | **Duruş Kırılması**: 2.0 s window for every rank, ×1.25 damage kept, **lock 12 s (elite) / 25 s (boss)**, plus the Kritik Vuruş finisher (§3.7) | shorter window, bigger payoff | combat |
| O2 | "Hold LMB auto-repeats the chain" (GDD_SYSTEMS §8.2) | Tap < 0.28 s = light chain; **hold ≥ 0.28 s = charged heavy** (§3.2). Settings option "Basılı tutunca otomatik kombo" (default OFF) restores the old behaviour | Elden Ring heavy attack | player |
| O3 | Threat ×2.5 for **every** Şövalye (`trait_guardian`, hard-coded in `EnemyAI.onDamaged`) | Threat multiplier comes from `getStat('threatPct')` (§1.4); Koruyucu ×3.0, Savaş Lordu ×2.5, everyone else ×1.0 (Suikastçı ×0.8) | any class can tank or not | enemies |
| O4 | Class traits are always on | Traits stay, but `trait_guardian` loses the threat clause (moved to the spec passive); `trait_opportunist` backstab rule is replaced by the global **Arkadan Vuruş** (§3.6) | spec identity | combat |
| O5 | Untimed M+ (> 100% of the timer): key −1, "depleted" | **Soft depletion**: finishing in 100–110% of the timer keeps the key level (no upgrade, chest ilvl −2); only > 110% drops the key by 1 and uses ilvl −4 (§8.9) | friendlier | mythic |
| O6 | Potion keys 4/5 only | unchanged, flasks use keys 6–0 (§4.2) | non-disruptive | hud |
| O7 | `Mythic+ has no champions` | stays true, **except** the Mühür `seal_champions` (§4.4) which re-adds 3 champion packs | risk/reward | mythic |
| O8 | Skill bar = 8 slots, "one skill always on the bench" | Spec skills add more known skills than slots: the bench can hold 3–5 skills. Bars are saved **per spec** (`CharacterSave.specBars`) | build choice | combat |
| O9 | Legendary drop = named `leg_*` unique only | 70% of legendary drops become **Aspektli Efsanevi** (random aspect on a generic base); 30% stay named uniques (§5.1) | Diablo aspects | items |
| O10 | Boss `enrageTimer` only for 5-man dungeon bosses | raid bosses use **soft + hard enrage** (§9.4) | raid | enemies |

### 0.3 New ids appended to shared types (append-only, done in work package P1)

**New `StatId`s** (STAT_INFO TR names in the table; percent stats are fractions):

| StatId | TR | Unit | Rule |
|---|---|---|---|
| `healingPct` | Şifa Gücü | inc | multiplies healing done |
| `threatPct` | Tehdit | additive to ×1 | `threatMult = 1 + threatPct` (≥ 0.1) |
| `poiseDamagePct` | Duruş Hasarı | inc | multiplies poise damage dealt (replaces nothing; stacks with `staggerPct` additively) |
| `guardGauge` | Siper Dayanıklılığı | flat | adds to the Guard Gauge (§3.4) |
| `weaponArtPct` | Silah Sanatı Hasarı | inc | charged tier-2 hits |
| `finisherPct` | Kritik Vuruş Hasarı | inc | Kritik Vuruş / Karşı Vuruş damage |
| `flaskGainPct` | Şişe Dolumu | inc | flask charges gained |
| `flaskEffectPct` | Şişe Etkisi | inc | flask effect strength |
| `weakDamagePct` | Zayıflık Hasarı | inc | extra damage on "ZAYIF!" hits |
| `majorCdrPct` | Büyük Yetenek Soğuması | fraction | only 45 s / 90 s slots (cap 0.35) |
| `runeEffectPct` | Rün Etkisi | inc | scales support-rune numbers |
| `parryWindow` | Savuşturma Penceresi | seconds added | base 0.20 s |

**New `StatusId`s** (every id needs a `StatusDef` in `data/statuses.ts`; `stats` are per stack unless noted; `D` = default duration):

| id | TR | kind | Effect / numbers | Source |
|---|---|---|---|---|
| `guard` | Siper | buff | internal flag while guard held (movement ×0.6, 140° block) | guard key |
| `riposte` | Karşı Vuruş Hazır | buff | D 1.6 s; next LMB = Karşı Vuruş | parry |
| `guard_broken` | Siper Kırıldı | debuff | D 1.2 s stun + guard disabled 2 s | gauge 0 |
| `critbuff` | Kritik Gücü | buff | D 5 s `damagePct +0.15` | Kritik Vuruş |
| `shield_block` | Kalkan Kaldır | buff | D 6 s: frontal block 100%, `blockAmount +0.25` | knight_shield_block |
| `oath_ward` | Yemin Siperi | buff | absorb (magnitude = hp fraction), D 8 s | knight_ward_of_oath |
| `bastion` | Sarsılmaz Bastion | buff | D 10 s: DR −0.40 (own source), unstoppable | m45 knight_protector |
| `aegis` | Yemin Aegis'i | buff | D 8 s: DR −0.25 (party) | m90 knight_protector |
| `iron_stance` | Demir Duruş | buff | D 5 s: physical DR −0.35, unstoppable, 30% counter | barbarian_iron_stance |
| `blood_shield` | Kan Zırhı | buff | absorb, D 8 s | barbarian_blood_shield |
| `last_stand` | Son Direniş | buff | D 10 s: `maxHpPct +0.30`, DR −0.20, unstoppable | m45 barbarian_warlord |
| `rally` | Toplayıcı Kükreme | buff | D 12 s: `maxHpPct +0.15` | m90 barbarian_warlord |
| `zeal` | Gayret | buff | D 8 s: `attackSpeed +0.30` | m45 knight_blademaster |
| `wings` | Hüküm Kanatları | buff | D 20 s: holy more ×1.25, `critChance +0.20`, `moveSpeedPct +0.15` | m90 knight_blademaster |
| `carnage` | Katliam Çılgınlığı | buff | D 15 s: more ×1.35, `attackSpeed +0.30`, slow/root immune, `healReceivedPct −0.30` | m90 barbarian_butcher |
| `icy_veins` | Ayaz Damarları | buff | D 10 s: `castSpeed +0.30` | m45 mage_elementalist |
| `combustion` | Yanış | buff | D 12 s: fire more ×1.25, fire crit chance +1.0 | m90 mage_elementalist |
| `shadow_blades` | Gölge Bıçakları | buff | D 10 s: +25% of hit damage as shadow, energy cost −0.30 | m45 rogue_assassin |
| `shadow_veil_cd` | Ölümcül Gölge Dansı | buff | D 8 s: stealth that does not break, hits count as stealth openers | m90 rogue_assassin |
| `clarity` | Kadim Berraklık | buff | D 8 s: heals cost 0, `castSpeed +0.30`, heals castable while moving | m45 mage_lightbringer |
| `dawn_hot` | Şafak Işığı | buff | HoT 0.25×W per s, D 6 s + DR −0.20 for 4 s | m90 mage_lightbringer |
| `renew` | Yenilenme Işığı | buff | HoT (uses `regen` rules), D 12 s | mage_renew |
| `overheal_ward` | Taşan Şifa | buff | absorb = 40% of overheal, cap 15% max HP, D 6 s | Işık Çağıran passive |
| `brew_zone` | Mucize Karışım | buff | aura r 6 m: DR −0.25, 6% max HP/s HoT, cleanse poison/bleed | m90 rogue_alchemist |
| `elixir_regen` | Hayat İksiri | buff | D 6 s regen 0.3×W/s | m45 rogue_alchemist |
| `hero_haste` | Kurt Narası (ve eşdeğerleri) | buff | D 40 s: `attackSpeed +0.30`, `castSpeed +0.30`, `moveSpeedPct +0.10` | m180 |
| `sated` | Yorgun | debuff | D 150 s: no `hero_haste` can be applied | m180 |
| `weakness_chain` | Sömürü | buff (self) | up to 5 stacks, +4% damage each vs weak targets, D 4 s | weakness hits (§7.3) |
| `shielded_poise` | Duruş Zırhı | buff | enemy hyper-armor flag (internal) | enemies |
| `marked_crit` | Kritik Fırsatı | debuff | enemy broken: Kritik Vuruş prompt | poise break |
| `armored` `cursed_zone` | Zırhlı / Lanet Alanı | internal | elite mod markers (§5.2) | enemies |

**New `DamageType`s:** none (arcane/holy exist). **New `ResourceType`:** none; Kararlılık stays typed `'rage'` (see `classes.ts`). Pip counters (Adalet 0–5, Karışım 0–5) are **separate counters** like Kombo Puanı (`Player.pips: { adalet?: number; karisim?: number }`).

**New events** (`core/events.ts`): `parry`, `riposte`, `poise:break`, `crit:finisher`, `guard:broke`, `threat:update`, `kick:request`, `major:used`, `hero:cast`, `flask:used`, `spec:changed`, `weakness:hit`, `run:recap`. **New camera event:** `camera:punch { fov, in, out }`. **New net channels:** `threat`, `kick`, `spec` (§A).

### 0.4 Final key binding table (reconciles `DEFAULT_BINDINGS` with every V2 input)

Rule: **no existing binding is changed**; every V2 action is appended. All are rebindable (`InputAction` additions in `core/Input.ts`).

| InputAction | Default | Use | Notes |
|---|---|---|---|
| `moveForward/Back/Left/Right` | W A S D (+ arrows) | move | unchanged |
| `jump` | Space | jump; **LMB while airborne = Sıçrama Saldırısı** | unchanged key |
| `dodge` | Shift | roll; tap again at once for 2nd charge | unchanged |
| `walk` | Left Ctrl (hold) | slow walk | unchanged. Warning: Ctrl+W closes a browser tab; do not use Ctrl for combat |
| `skill_lmb` | LMB | tap = light chain, **hold = charge heavy**, LMB while `riposte`/broken-target = finisher | |
| `skill_rmb` `skill_q` `skill_e` `skill_r` `skill_s1..s3` | RMB Q E R 1 2 3 | the 8 class/spec skill slots | unchanged |
| `potionHp` `potionMp` | 4 5 | potions (shared 10 s / 15 s cooldown) | unchanged |
| **`guard`** | **G (hold)** + Mouse3 | guard; the first 0.20 s is the parry window | NEW; the Mouse3 alias needs `preventDefault` on the browser back button (mouseup of buttons 3/4) |
| **`skill_m45`** | **X** | 45 s major cooldown | NEW |
| **`skill_m90`** | **V** | 90 s major cooldown | NEW |
| **`skill_m180`** | **T** | 3-min party buff ("Kurt Narası" family), only on the 4 owning specs | NEW |
| **`flask1..flask5`** | **6 7 8 9 0** | Şişe Kemeri slots (§4.2) | NEW |
| **`targetAlly`** | **U** | cycle friendly targets, lowest HP% first | NEW (healers) |
| **`partySel1..5`** | **F1–F5** | select party member 1..5 as friendly target (F1 = self) | NEW; `Input` must `preventDefault` F2–F5 while a game scene is active (F5 reloads the page) |
| `interact` | F | interact, pick up, revive (hold) | unchanged |
| `revive` | Z (hold) | revive ally | unchanged |
| `targetNext` | Tab | hostile soft-target cycle / hard lock | unchanged |
| `freeCursor` | Alt (hold) | free cursor (party-frame clicking, route planner) | unchanged |
| `toggleLock` | MMB | camera lock | unchanged |
| `inventory` `character` `talents` `skills` `map` `party` `mplus` | I/B C N K M O J | panels | unchanged; `skills` (K) now has tabs Beceriler / Uzmanlık / Rünler |
| **`paragon`** | **P** | Kadim Levha | NEW |
| **`bestiary`** | **L** | Bestiyari | NEW |
| **`townPortal`** | **Y** | Dönüş Parşömeni (was "suggested T") | moved so T is free for the party buff |
| `chat` `menu` `screenshot` | Enter Esc F12 | | unchanged |

### 0.5 Role rules (apply to all specs)

| Role | Passive baseline (from the spec passive, not global) | Party-frame icon | HUD extras |
|---|---|---|---|
| Tank (Tank) | `maxHpPct +0.30`, armour +35–40%, own damage ×0.75, threat ×2.5–3.0, active mitigation skills | blue shield | threat bars on nameplates, loose-mob `!` marker, mitigation uptime ring |
| Healer (Şifacı) | `healingPct +0.25–0.30`, own damage ×0.60, resource regen +25%, heal crit, **Taşan Şifa** (overheal → absorb) | green cross | party frames clickable, healing meter, mana/energy economy bar |
| DPS (Hasarcı) | no penalty, spec passive adds ≈ +20–30% in its damage niche | red sword | threat warning at 90% of the tank |

**Healing formula** (new, mirrors the damage pipeline of GDD_SYSTEMS §1.5):

```
heal  = randInt(weaponMin, weaponMax) * coef * (1 + mainStat/100) * (1 + S.healingPct) * (crit ? critMult : 1)
heal *= target.healReceived (1 + S.healReceivedPct) * Π(healing debuffs: Necrotic, Grievous, Kasvetli Sis ...)
overheal = max(0, heal - (maxHp - hp))      // no threat for overheal; Işık Çağıran converts 40% into an absorb
```

Healing crits use the healer's `critChance` / `critDamage`. Healing sent to a remote player travels on the existing `heal` channel (owner applies it); the **source peer** also records "effective healing" for the meters (§8.10).

---

## 1. Roles & specializations

### 1.1 Overview

Every class has **two specs**. A spec is chosen at **level 10** from the Eğitmen (trainer) panel and can be **changed for free in town** (not inside a dungeon/raid; locked once the run timer or a boss is engaged). Changing spec: swaps passive stat block + `specials`, swaps the saved skill bar (`specBars[specId]`), keeps the passive tree, keeps all gear, and emits `spec:changed`. A first-time spec starts with its default bar (§1.2). Spec skills unlock on a schedule (below); the 45 s / 90 s / 3-min majors unlock at 10 / 20 / 30.

The **party trinity is possible with many combinations**: 2 tank specs, 2 healer specs, 4 DPS specs. Solo play stays viable: tanks have −25% damage but huge survivability, healers have a damaging basic that heals allies it hits and heal themselves with a strong HoT, DPS specs have self-sustain from flasks, potions and class traits.

| Spec id | Class | TR | Role | One-line identity | Damage type focus |
|---|---|---|---|---|---|
| `knight_protector` | Şövalye | **Koruyucu** | TANK | Kalkan Kaldır + Yemin Siperi aktif azaltma, tehdit ×3.0 | holy / physical |
| `knight_blademaster` | Şövalye | **Kılıç Ustası** | DPS | Adalet Puanı biriktirip Karar Darbesi ile bitirir; Kahramanlık Çağrısı sahibi | holy |
| `barbarian_warlord` | Barbar | **Savaş Lordu** | TANK | Öfke zırhı: hasar aldıkça güçlenir, Demir Duruş + Kan Zırhı | physical |
| `barbarian_butcher` | Barbar | **Kasap** | DPS | kanama yığınları + İdam; Kurt Narası sahibi | physical (bleed) |
| `mage_elementalist` | Büyücü | **Elementalist** | DPS | Termal Şok (buz ↔ ateş), Zaman Bükülmesi sahibi | fire / frost / arcane |
| `mage_lightbringer` | Büyücü | **Işık Çağıran** | HEALER | büyük tekil + alan şifa, Taşan Şifa kalkanı, mana ekonomisi | holy / arcane |
| `rogue_assassin` | Haydut | **Suikastçı** | DPS | gizlilik açılışları, arkadan vuruş, Gölge Dansı | physical / shadow |
| `rogue_alchemist` | Haydut | **Simyacı** | HEALER | seyyar şifacı: şişe bombaları, panzehir, Karışım Puanı; Hızlandırıcı İksir sahibi | poison / holy |

Why Simyacı instead of a second Haydut DPS ("Gölge Dansçısı"): the trinity needs two healer entry points on different classes. The Gölge Dansçısı fantasy is kept as the **Suikastçı's 90 s major** (Ölümcül Gölge Dansı, §2).

**Spec skill unlock schedule** (all specs): spec choice L10 → first spec skill + 45 s major (L10); second spec skill (L15); 90 s major (L20); 3-min party buff on the 4 owning specs (L30). Each row in the tables below states its own unlock level. New regular skills per spec: DPS 2, tanks 3 (including the single-target taunt), healers 5 (the heals are the kit), plus 2–3 majors each.

### 1.2 Default skill bars (`CharacterSave.specBars[specId]`)

Slots: `lmb rmb q e s1 s2 s3 r` + majors `m45 m90 m180` + guard (hold). "bench" = known but unslotted. Existing skill ids unchanged; **bold** = new in V2.

| Spec | lmb | rmb | q | e | s1 | s2 | s3 | r | m45 / m90 / m180 | bench |
|---|---|---|---|---|---|---|---|---|---|---|
| Koruyucu | knight_basic | knight_shield_bash | **knight_provoke** | knight_radiant_cleave | knight_challenge | **knight_shield_block** | **knight_ward_of_oath** | knight_heavens_judgment | **knight_unbroken_bastion / knight_oath_aegis** / – | knight_charge, knight_shield_wall, knight_consecration, knight_war_banner |
| Kılıç Ustası | knight_basic | **knight_templar_verdict** | knight_charge | knight_radiant_cleave | **knight_wake_of_flames** | knight_consecration | knight_shield_bash | knight_heavens_judgment | **knight_zeal / knight_wings_of_judgment / knight_heroism_call** | knight_challenge (no taunt), knight_shield_wall, knight_war_banner |
| Savaş Lordu | barbarian_basic | barbarian_cleave | **barbarian_provoke** | barbarian_whirlwind | barbarian_war_cry | **barbarian_iron_stance** | **barbarian_blood_shield** | barbarian_ancestral_tempest | **barbarian_last_stand / barbarian_rallying_roar** / – | barbarian_leap, barbarian_fissure, barbarian_axe_throw, barbarian_blood_rage |
| Kasap | barbarian_basic | **barbarian_rend** | barbarian_leap | barbarian_whirlwind | **barbarian_execute** | barbarian_fissure | barbarian_axe_throw | barbarian_ancestral_tempest | **barbarian_bloodbath / barbarian_carnage / barbarian_wolf_howl** | barbarian_cleave, barbarian_war_cry, barbarian_blood_rage |
| Elementalist | mage_basic | mage_fireball | mage_frost_nova | mage_blink | **mage_ice_lance** | **mage_flame_wave** | mage_meteor | mage_arcane_cataclysm | **mage_icy_veins / mage_combustion / mage_time_warp** | mage_blizzard, mage_arcane_orb, mage_mana_barrier |
| Işık Çağıran | **mage_light_bolt** | **mage_mend** | mage_blink | mage_frost_nova | **mage_renew** | **mage_radiant_pulse** | **mage_purify** | mage_arcane_cataclysm (holy variant) | **mage_divine_clarity / mage_dawn_resurgence** / – | mage_fireball, mage_mana_barrier (ally ward), mage_meteor, mage_blizzard, mage_arcane_orb |
| Suikastçı | rogue_basic | rogue_crossbow_shot | rogue_shadow_step | **rogue_backstab** | rogue_eviscerate | **rogue_garrote** | rogue_smoke_bomb | rogue_death_blossom | **rogue_shadow_blades / rogue_shadow_dance / –** | rogue_fan_of_knives, rogue_bolt_rain, rogue_deadly_venom |
| Simyacı | **rogue_vial_throw** | **rogue_vial_heal** | rogue_shadow_step (ally variant) | **rogue_smoke_ward** | **rogue_antidote** | **rogue_mending_draught** | rogue_fan_of_knives (poison only) | rogue_death_blossom (heals allies it passes) | **rogue_elixir_of_life / rogue_miracle_brew / rogue_haste_elixir** | rogue_crossbow_shot, rogue_eviscerate, rogue_smoke_bomb, rogue_bolt_rain, rogue_deadly_venom |

### 1.3 Spec definitions

Each spec lists: passive (a `StatBlock` + `specials` folded by `CharacterState`/StatCalc exactly like keystones), resource changes, how existing skills change (`mods`: applied by tag/id in SkillSystem), and the NEW skills. Columns of the new-skill tables: Sv = unlock level · Maliyet · BS = cooldown (s) · Döküm · Hedefleme · Katsayı (× weapon damage `W`, heals use `W` too) · Etkiler · Sarsma = poise damage · Tehdit = flat threat added (+ `threatMult` where stated) · Animasyon (Kilit).

#### 1.3.1 Koruyucu (`knight_protector`, TANK)

**Passive "Yemin Zırhı"** (`trait_protector`): `maxHpPct +0.30`, `armorPct +0.40`, `blockChance +0.15` (block cap 0.60 for this spec), `blockAmount +0.10`, `threatPct +2.0` (×3.0), own damage ×0.75 (`more`), `parryWindow +0.07` (0.27 s), Kararlılık regen 4 → 6/s, blocked hit +6 → **+8 Kararlılık**. Special `protector_cheat`: once per 90 s a hit that would kill you leaves you at 15% max HP and gives 1.5 s of `invulnerable` ("Son Savunma"; not counted as an M+ death).

**Resource:** Kararlılık pool 100 (unchanged); the tank spends it on mitigation (`Kalkan Kaldır`, `Yemin Siperi`), not on damage.

**Mods on existing skills**

| Skill | Change |
|---|---|
| `knight_shield_bash` | CD 3 → 2.5 s; flat threat +300; **interrupt tag** (stops an interruptible cast, 8 s internal kick lockout shown on the kick tracker); poise ×1.4 |
| `knight_charge` | impact applies `taunt` 2 s to non-boss enemies hit; unchanged otherwise |
| `knight_radiant_cleave` | cost 30 → 25; `threatMult` ×1.5 on its damage |
| `knight_challenge` | CD 15 → 12 s; +50 flat threat on every enemy in 8 m; keeps the 4 s AoE taunt |
| `knight_shield_wall` | stays as the big channelled block (bench by default); cannot be held together with `guard` |
| `knight_consecration` | ally heal 1.5% → 2% max HP/s; self armour +20% while standing in it |
| `knight_war_banner` | unchanged |
| `knight_heavens_judgment` | all enemies it stuns get +150 flat threat |
| basic chain `knight_basic_1..4` | coef unchanged; `gain` +1 Kararlılık per hit |

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Tehdit | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|---|
| 10 | `knight_provoke` | Kışkırtma | 0 | 8 | instant | single target ≤ 25 m (soft target) | — | `taunt` 3 s (boss: forced target 2 s, boss kick-back ICD 12 s shared with `knight_challenge`); threat set to `max(current, top × 1.10) + 100` | 0 | set | `Cheer` ×2.2 upper body (0.25) |
| 10 | `knight_shield_block` | Kalkan Kaldır | 30 Kar. | 9 per charge, **2 charges** | instant | self | — | 6 s `shield_block`: frontal 180° block chance 100%, `blockAmount +0.25` (total 0.95 cap), blocked hits +8 Kar., reflect 0.35×W holy to melee attackers (1 s ICD per attacker), +6 poise to attackers | 0 | each block = 0.35 × prevented damage | `Block_Attack` first 0.2 s then raise-shield pose (0.15) |
| 15 | `knight_ward_of_oath` | Yemin Siperi | 35 Kar. | 0 (ICD 1.5 s) | instant | self | — | `oath_ward`: absorb 22% max HP for 8 s; recast adds, cap 45% max HP; expiring unused heals 25% of the remainder | 0 | +60 | `Use_Item` ×2.5 (0.25) |

**Majors** (details §2): `knight_unbroken_bastion` (45 s), `knight_oath_aegis` (90 s).

**Tank rotation (Koruyucu) — priority list**

| # | Condition | Cast |
|---|---|---|
| 1 | pull start, enemy at range | `Kışkırtma` on the first mob (or `Hücum` to close the gap) |
| 2 | 3+ enemies not on you (loose `!` markers) | `Meydan Okuma` |
| 3 | a red-glow / big cast bar is coming (tank buster, coef ≥ 3.5) | `Kalkan Kaldır` ≥ 1 s before the hit, **keep ≈ 65% uptime**; hold `guard` + parry only for parryable hits |
| 4 | Kararlılık ≥ 60 and no `Yemin Siperi` active | `Yemin Siperi` |
| 5 | off cooldown | `Kalkan Darbesi` (interrupt/stagger; target casters first) |
| 6 | Kararlılık ≥ 25 | `Işıltılı Yarma` (AoE threat dump) |
| 7 | pack ≥ 4 stacked | `Kutsal Toprak` |
| 8 | filler | 4-step chain; take the finisher when enemies are staggered |
| cooldowns | tank buster ≥ coef 4.5 or lethal spike → `Sarsılmaz Bastion`; raid-wide spike or low healer mana → `Yemin Aegis'i`; ≥ 6 enemies → `Göksel Hüküm` | |

#### 1.3.2 Kılıç Ustası (`knight_blademaster`, DPS)

**Passive "Adalet Silahı"** (`trait_blademaster`): `attackSpeed +0.10`, `holyDamagePct +0.25`, `critChance +0.05`, threat ×1.0, `meleeDamagePct +0.10`. **Adalet Puanı** (0–5 pips, shown under the resource bar like Kombo): +1 per 2 basic hits (finisher +2), +1 per `Işıltılı Yarma` (+1 per 2 extra targets, max +3), generated by `knight_wake_of_flames`. Pips decay −1 every 4 s after 8 s out of combat.

**Mods on existing skills**

| Skill | Change |
|---|---|
| `knight_challenge` | **no taunt** in this spec: becomes "Savaş Çağrısı" — enemies in 8 m deal −10% damage for 6 s, self −20% damage taken 6 s, +30 Kar. |
| `knight_shield_bash` | stays (interrupt, 8 s kick lockout) |
| `knight_radiant_cleave` | +1 Adalet; Savunmasız 4 s unchanged |
| `knight_heavens_judgment` | +100% holy damage coefficient on enemies below 35% HP |
| basic chain | +5% coef; finisher (step 4) generates 2 pips |

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|
| 10 | `knight_templar_verdict` | Karar Darbesi | 1–5 Adalet | 0 (lock 0.55 s) | instant | melee 100° / 3.2 m | `2.0 + 1.0 × pips` holy (5 pips = 7.0) | 5 pips: Savunmasız 4 s + knockback medium; consumes all pips; `proc` 1.0 | 10 + 8×pips | `1H_Melee_Attack_Chop` ×1.25 (0.55) |
| 15 | `knight_wake_of_flames` | Kutsal Alev Dalgası | 20 Kar. | 9 | instant | cone 70° / 9 m, wave 25 m/s | 2.2 holy + burn 40% over 3 s | +2 Adalet (+1 per extra target, cap 5) | 14 | `1H_Melee_Attack_Stab` ×1.6 (0.5) |

**DPS rotation (Kılıç Ustası):** 1) `Kutsal Alev Dalgası` on CD → 2) 5 pips = `Karar Darbesi`; at 3–4 pips with `Gayret`/`Kanatlar` also fire it → 3) `Işıltılı Yarma` if ≥ 3 enemies or Kar. ≥ 60 → 4) `Kalkan Darbesi` to interrupt/stagger → 5) chain filler (finisher gives 2 pips) → majors: `Gayret` on pull, `Kanatlar` with `Hüküm` burst windows (boss poise break), `Kahramanlık Çağrısı` at the start of a big pull/boss.

#### 1.3.3 Savaş Lordu (`barbarian_warlord`, TANK)

**Passive "Yara Kabuğu"** (`trait_warlord`): `maxHpPct +0.30`, `armorPct +0.35`, `lifeSteal +0.02`, threat ×2.5 (`threatPct +1.5`), own damage ×0.75. **Öfke Zırhı** (special `warlord_rage_armor`): damage taken −0.25% per Öfke point (up to −25% at 100). Öfke generation from damage taken ×1.5 (existing "+1 per 2% max HP lost"), starts a fight with 30, **decay −2/s after 8 s** (instead of −4/s after 5 s), no +Öfke from basic hits beyond 3.

**Mods on existing skills**

| Skill | Change |
|---|---|
| `barbarian_cleave` | `threatMult` ×1.5; bleed 30% → 40% |
| `barbarian_leap` | landing applies `taunt` 2 s to non-boss enemies hit |
| `barbarian_whirlwind` | `threatMult` ×2.0 (AoE tick threat) |
| `barbarian_war_cry` | **also taunts** enemies in 8 m for 3 s, CD 20 → 16 s, still fears Sıradan/Sürü 1.5 s |
| `barbarian_blood_rage` | also grants an absorb of 15% max HP; costs 10% current HP (not 15%) |
| `barbarian_ancestral_tempest` | `threatMult` ×2.0 on all 8 ticks; −45% damage taken while channelling |
| `barbarian_axe_throw`, `barbarian_fissure` | unchanged |

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Tehdit | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|---|
| 10 | `barbarian_provoke` | Kükreyen Kışkırtma | 0 | 8 | instant | single ≤ 25 m | — | same rules as `knight_provoke` (taunt 3 s; boss forced 2 s, ICD 12 s shared with `war_cry` taunt) | 0 | set | `Cheer` ×2.0 upper (0.25) |
| 10 | `barbarian_iron_stance` | Demir Duruş | 20 Öfke | 8 per charge, **2 charges** | instant | self | counter 0.9×W phys melee 3 m | 5 s: physical damage taken −35% (own multiplicative source), unstoppable (no knockback/stagger/stun), each hit taken 30% chance → free Karşı Vuruş + 6 Öfke (ICD 0.8 s) | 6 per counter | +40 per counter | `Block_Attack` ×1.5 (0.2) |
| 15 | `barbarian_blood_shield` | Kan Zırhı | 40 Öfke | 3 (ICD) | instant | self | — | `blood_shield`: absorb = 20% max HP + 60% of the damage taken in the last 5 s (cap 45% max HP), 8 s | 0 | +60 | `Use_Item` ×2.2 (0.3) |

**Majors:** `barbarian_last_stand` (45 s), `barbarian_rallying_roar` (90 s).

**Tank rotation (Savaş Lordu):** 1) `Kükreyen Kışkırtma` / `Sıçrayış` to open → 2) `Savaş Narası` for ≥ 3 loose mobs (taunt+fear) → 3) **Demir Duruş before tank busters, keep ≈ 60% uptime** → 4) `Kan Zırhı` when Öfke ≥ 60 (the absorb scales with damage taken, so cast it after the first spike) → 5) `Yarma` on CD (bleed + threat) → 6) `Kasırga` for AoE threat (Öfke > 50) → 7) filler → cooldowns: `Son Direniş` for coef ≥ 4.5 busters or when HP < 40%; `Toplayıcı Kükreme` for raid-wide damage or to rescue squishies; `Ata Fırtınası` with ≥ 6 enemies.

#### 1.3.4 Kasap (`barbarian_butcher`, DPS)

**Passive "Kanlı İş"** (`trait_butcher`): `bleedDamagePct +0.40`, `bleedChance +0.15`, `executeDamagePct +0.40` (targets < 35% HP), `attackSpeed +0.05`, bleed stack cap 5 → **8**, Öfke gain +20% (`resourceGainPct +0.20`), threat ×1.0.

**Mods:** `barbarian_cleave` bleed 30% → 50% over 4 s; `barbarian_whirlwind` every 2nd tick adds a bleed stack; `barbarian_war_cry` keeps fear/buff but **no taunt**; `barbarian_blood_rage` unchanged; `barbarian_fissure` +20% poise.

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|
| 10 | `barbarian_rend` | Parçala | 20 Öfke | 6 | instant | melee 160° / 3.6 m | 1.6 phys | bleed 100% of the hit over 6 s, +1 stack on every target hit (cap 8) | 12 | `2H_Melee_Attack_Slice` ×1.2 (0.6) |
| 15 | `barbarian_execute` | İdam | 30 Öfke (refund 15 on kill) | 5 | instant | melee 70° / 3.2 m, single | 5.0 + 0.4 × bleed stacks on the target | usable only on targets < 35% HP; kills non-boss targets below 10% HP outright (cull); `proc` 1.0 | 25 | `2H_Melee_Attack_Chop` (0.8) |

**DPS rotation (Kasap):** 1) `Parçala` to 8 stacks on the main target → 2) `Yarma` for spread bleed → 3) `Kasırga` while Öfke > 40 → 4) `İdam` on any target < 35% (refund keeps Öfke alive) → 5) `Dönen Balta` for bleed on lines → majors: `Kan Banyosu` when ≥ 3 enemies carry 5+ stacks, `Katliam Çılgınlığı` for bursts, `Kurt Narası` at pull.

#### 1.3.5 Elementalist (`mage_elementalist`, DPS)

**Passive "Elemental Uyum"** (`trait_elementalist`): `castSpeed +0.08`, `fireDamagePct +0.15`, `frostDamagePct +0.15`, `resourceRegenPct +0.25`. `trait_elemental_balance` bonus becomes **+20% DAHA FAZLA** (was 15%). **Termal Şok** (special `elementalist_thermal`): a fire hit on a Chilled/Frozen target (or a frost hit on a Burning target) deals **+40% DAHA FAZLA** and releases a steam burst r 2.5 m (0.5×W of the hit's element, 1.5 s ICD per target), consuming 2 chill stacks / the burn. Threat ×1.0.

**Mods:** `mage_fireball` burn 50% → 70%; `mage_blink` CD 5 → 4 s; `mage_frost_nova` unchanged; `mage_blizzard` +1 chill stack per tick→ still caps; others unchanged.

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|
| 10 | `mage_ice_lance` | Buz Mızrağı | 14 Mana | 1.5 | instant | projectile 40 m/s, r 0.3, range 28, pierce 1 | 1.6 frost | ×2.0 vs Chilled, ×3.0 vs Frozen (consumes the freeze: shatter); applies chill 1 stack | 6 | `Spellcast_Shoot` ×1.3 (0.35) |
| 15 | `mage_flame_wave` | Alev Dalgası | 25 Mana | 8 | instant | cone 80° / 8 m | 2.6 fire | burn 60% over 3 s, knockback light 0.8 m | 14 | `Spellcast_Raise` ×1.6 (0.45) |

**DPS rotation (Elementalist):** open `Buz Halkası` (freeze) → `Buz Mızrağı` on frozen (×3) → switch to fire: `Ateş Topu` on Chilled/Frozen = **Termal Şok** → `Alev Dalgası` → `Meteor` on CD → filler `Gizem Oku` (mana back) → majors: `Ayaz Damarları` + `Buz Halkası` chains, `Yanış` with `Meteor` + `Alev Dalgası`, `Zaman Bükülmesi` at pull/boss.

#### 1.3.6 Işık Çağıran (`mage_lightbringer`, HEALER)

**Passive "Kadim Işık"** (`trait_lightbringer`): `healingPct +0.30`, own damage ×0.60, `resourceRegenPct +0.25`, `castSpeed +0.10`, threat from healing ×0.6 (`threatPct −0.4` applied to heal threat only), **Taşan Şifa** (special `lightbringer_overheal`): overheal becomes `overheal_ward` absorb = 40% of the overheal (cap 15% max HP of the target, 6 s). Mana returns: +3 per `Işık Oku` enemy hit, +2 per kill.

**Mana economy** (L60, Zeka 254): pool 163 (100 + 0.25×Zeka), regen (5 + 0.015×Zeka) × 1.25 = **11.0/s**, out of combat ×3. Designed so that the **standard rotation costs ≈ 11–12 mana/s** (12 s window: 2 Şifa Dokunuşu 44 + 3 Yenilenme 54 + 1 Parlak Dalga 40 = 138). Spikes drain the pool in ≈ 15–20 s; `Kadim Berraklık`, Ruh İksiri (+45%), `Ruh Şişesi` and Işık Oku hits recover it. Healer burn-out is a design goal on high keys.

**Mods on existing skills:** `mage_basic` replaced by `mage_light_bolt` (below); `mage_frost_nova` unchanged (defensive freeze, 12 mana); `mage_mana_barrier` becomes **ally-targetable** `Işık Kalkanı` (target ally or self, absorb 18% max HP + 2.0×W, 10 s, CD 25 → 15 s); `mage_blink` unchanged; `mage_arcane_cataclysm` holy variant: star strikes deal 1.0 holy and **heal allies within 3 m of each strike for 0.8×W**.

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Animasyon |
|---|---|---|---|---:|---|---|---|---|---|
| 1→10 | `mage_light_bolt` (replaces the basic) | Işık Oku | +3 Mana per enemy hit | – (3-cast chain like Gizem Oku) | instant | projectile 30 m/s, pierce all allies, stops at the first enemy | enemy 0.8 holy; **ally 1.1×W heal** | passes through allies healing each; crit heals | `Spellcast_Shoot` |
| 10 | `mage_mend` | Şifa Dokunuşu | 22 Mana | 0 | cast 1.1 s (÷ castRate) | single ally ≤ 30 m (smart target §1.6) | heal 2.6×W | +25% crit chance on this heal | `Spellcast_Raise` [0.1–0.6] |
| 12 | `mage_renew` | Yenilenme Işığı | 18 Mana | 0 | instant | single ally ≤ 30 m, max 6 active | HoT 0.32×W per 1 s × 12 s (3.84×W) | refresh adds 6 s; stacks from different healers do not stack | `Spellcast_Shoot` ×1.5 |
| 15 | `mage_radiant_pulse` | Parlak Dalga | 40 Mana | 5 | cast 1.6 s | ally-centred AoE r 8 m, ≤ 30 m | heal 1.5×W each; +50% on targets below 50% HP | smart-heal priority on injured | `Spellcast_Raise` ×1.2 |
| 15 | `mage_purify` | Arındır | 14 Mana | 6 | instant | single ally | removes up to 2 dispellable debuffs (curse, slow, root, poison, bleed, burn, chill, blind, silence) + heal 0.6×W if something was removed | `dispellable` statuses only | `Use_Item` ×2 |

**Majors:** `mage_divine_clarity` (45 s), `mage_dawn_resurgence` (90 s).

**Healer priority (Işık Çağıran):** 1) keep `Yenilenme Işığı` on the tank + 1–2 injured → 2) `Şifa Dokunuşu` for the lowest-HP% target below 55% → 3) `Parlak Dalga` when ≥ 3 allies below 80% → 4) `Arındır` on dispellable debuffs (curse/poison/Ağır Yara not dispellable) → 5) `Işık Kalkanı` pre-cast on the tank before buster/raid pulse → 6) `Işık Oku` while nothing is injured (mana + damage) → cooldowns: `Berraklık` when mana < 30% or during burst healing; `Şafak Doğuşu` on raid-wide damage or when ≥ 3 allies < 50%.

#### 1.3.7 Suikastçı (`rogue_assassin`, DPS)

**Passive "Gölge Hasadı"** (`trait_assassin`): `critChance +0.06`, `critDamage +0.20`, `attackSpeed +0.05`, `parryWindow +0.04` (0.24 s), Enerji regen 12 → 14/s, threat ×0.8 (`threatPct −0.2`), stealth-opener bonus +50% → **+80% DAHA FAZLA**, `Arkadan Vuruş` damage +30% → **+60%** (§3.6). `Gölge Adımı` drops 50% of own threat (special `assassin_vanish`).

**Mods:** `rogue_eviscerate` +10% crit chance on the finisher; `rogue_fan_of_knives` poison stack ×1.5; `rogue_smoke_bomb` unchanged; `rogue_deadly_venom` Zehir Patlaması +25%.

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Sarsma | Animasyon |
|---|---|---|---|---:|---|---|---|---|---:|---|
| 10 | `rogue_backstab` | Sırttan Bıçak | 25 Enerji | 0 | instant | melee 45° / 2.6 m single | 2.2 phys; **×2.0 from behind** (4.4) | +2 Kombo (+3 from behind); poise ×1.5 from behind | 8 | `Dualwield_Melee_Attack_Stab` ×1.4 (0.4) |
| 15 | `rogue_garrote` | Gırtlak Kesme | 30 Enerji | 14 | instant | melee single | 1.2 phys + bleed 220% over 8 s | silence 3 s (non-boss) = **interrupt**; +50% DAHA FAZLA from stealth; +1 Kombo | 6 | `Dualwield_Melee_Attack_Chop` (0.4) |

**DPS rotation (Suikastçı):** open from `Gizlenme` (smoke / `Gölge Adımı`) with `Sırttan Bıçak` → `Gırtlak Kesme` (bleed + silence) → build to 5 Kombo with `Sırttan Bıçak` / chain → `İnfaz` at 5 → `Gölge Adımı` to reposition behind (CD 9 s) → `Ok Yağmuru` only for ranged pulls → majors: `Gölge Bıçakları` on pull, `Ölümcül Gölge Dansı` for boss burn (resets `Gölge Adımı`, `İnfaz` costs 0).

#### 1.3.8 Simyacı (`rogue_alchemist`, HEALER)

**Passive "Eczacı Çantası"** (`trait_alchemist`): `healingPct +0.25`, own damage ×0.60, **Enerji regen 12 → 16/s**, threat from healing ×0.6, `Kombo Puanı` is renamed **Karışım Puanı** (0–5): +1 per ally healed by `Şifa Şişesi` (max +2 per cast), +1 per `Şişe Fırlat` enemy hit, −1 every 4 s after 10 s out of combat. Special `alchemist_overheal`: overheal gives +10% healing for 4 s (stacking, cap 40%) instead of a shield — a "momentum" identity. Moves at +5% speed.

**Resource economy:** Enerji is cheaper to regen but spent on 15–30 per cast; no pool bonus. Standard rotation: 1 `Şifa Şişesi` 25 + 1 `Panzehir` 15 (on CD) + 1 `Mucize Damla` 30 per 10 s ≈ 8–9 Enerji/s sustainable.

**Mods:** `rogue_basic` replaced by `rogue_vial_throw` (below); `rogue_shadow_step` gains **ally variant**: if a friendly target is selected, teleport next to that ally (≤ 15 m) and drop a `Duman Siperi` puff (r 2.5 m, 3 s, −10% damage taken for allies inside) instead of the behind-enemy blink; `rogue_fan_of_knives` poison only, no damage vs allies; `rogue_death_blossom` heals allies it passes by 0.6×W per strike; other skills unchanged.

**New skills**

| Sv | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı | Etkiler | Animasyon |
|---|---|---|---|---:|---|---|---|---|---|
| 1→10 | `rogue_vial_throw` (replaces the basic) | Şişe Fırlat | – | – (chain of 3) | instant | arc projectile 22 m/s, range 22, r 0.4 | enemy 0.8 poison + 1 Zehir stack; **ally 1.0×W heal** | +1 Karışım per enemy hit | `Throw` ×1.6 |
| 10 | `rogue_vial_heal` | Şifa Şişesi | 25 Enerji | 0.8 | instant (lands 0.4 s) | ground point ≤ 22 m, r 3.5 | heal 1.8×W to allies in the splash + puddle 6 s healing 0.25×W/s | +1 Karışım per ally healed (max +2) | `Throw` [0.2–0.7] |
| 15 | `rogue_antidote` | Panzehir | 15 Enerji | 8 | instant | single ally ≤ 25 m | removes up to 3 dispellable debuffs + heal 0.8×W + `regen` 4 s | works on poison/bleed/curse/slow/root/blind | `Use_Item` ×2 |
| 15 | `rogue_smoke_ward` | Duman Siperi | 30 Enerji | 20 | instant | ground r 5, 6 s | — | allies inside DR −20%, enemies inside Körlük (50% miss) and lose the Simyacı as target | `Throw` |
| 20 | `rogue_mending_draught` | Mucize Damla | 30 Enerji + ≥ 1 Karışım | 0 | instant | single ally ≤ 25 m | heal `(1.6 + 1.1 × pips)×W` (5 pips = 7.1×W), consumes all pips | emergency heal; crit chance +15% | `Use_Item` ×1.6 |

**Majors:** `rogue_elixir_of_life` (45 s), `rogue_miracle_brew` (90 s), `rogue_haste_elixir` (3 min party buff).

**Healer priority (Simyacı):** 1) `Şifa Şişesi` on grouped allies (also builds pips) → 2) `Panzehir` on dispellable → 3) `Mucize Damla` at 3–5 pips for the lowest-HP ally → 4) `Duman Siperi` for ranged/AoE spikes or to blind trash → 5) `Şişe Fırlat` filler (pips + damage) → positioning: stay within 22 m, use `Gölge Adımı` ally variant to reach fallen allies; cooldowns: `Hayat İksiri` for burst, `Mucize Karışım` for sustained damage in a stack.

### 1.4 Threat system (extends the existing host-side table in `EnemyAI`)

Existing (kept): per-enemy `threat` map, healing threat 0.5/point split across engaged enemies (`EnemyDirector`), taunt status forced target, switch hysteresis 110% in melee / 130% outside, first-aggro 10 threat, stealth ×0.5.

```
threatMult(src)   = max(0.1, 1 + src.getStat('threatPct')) * (stealth ? 0.5 : 1)         // replaces the hard-coded knight ×2.5 (O3)
threat(dmg hit)   = dmg * threatMult * (skill.params.threatMult ?? 1) + (skill.params.threat ?? 0) + 1
threat(heal)      = effectiveHeal * 0.5 / enemiesEngaged * max(0.1, 1 + healer.threatPct)  // overheal gives none
threat(block)     = 0.35 * preventedDamage                                                 // tank blocks / Kalkan Kaldır / Demir Duruş counters
taunt (single)    = threat := max(threat, topThreat * 1.10) + 100 ; forced target 3 s (boss: 2 s, 12 s ICD per boss per tank)
taunt (AoE)       = same on every enemy in radius ; forced target 4 s (existing) ; boss ICD 12 s (existing)
decay             = none (threat never decays in combat); cleared on reset/leave
```

| Spec | `threatPct` | Effective | Notes |
|---|---:|---:|---|
| Koruyucu | +2.0 | ×3.0 | with own damage ×0.75 the tank generates **2.25×** the threat of an equal DPS |
| Savaş Lordu | +1.5 | ×2.5 | 1.875× |
| Kılıç Ustası / Kasap / Elementalist | 0 | ×1.0 | |
| Suikastçı | −0.2 | ×0.8 | `Gölge Adımı` / Gizlenme −50% |
| Işık Çağıran / Simyacı | −0.4 | ×0.6 on **heal** threat | damage threat ×1.0 |

**Pull rules (kept):** a new target takes over when its threat > current × 1.10 (melee) / × 1.30 (outside melee). **Bosses** keep ignoring threat for scripted mechanics; for their melee target they use the table and respect the taunt ICD.

**Threat HUD (hud module)**
- **Target frame** gets a "Tehdit" bar: your threat % relative to the enemy's current victim: green < 60%, yellow 60–89%, orange 90–109%, red ≥ 110% (= you are the target). Hover the bar for the top-5 list (name, class icon, %).
- **Nameplates**: every engaged enemy shows a small **threat leader flag** (class colour dot of the current victim). If the **local player has role tank** and the enemy's target is **not** the player, the nameplate shows a red **`!`** ("başıboş düşman") and a pulsing arrow at the screen edge when off-screen.
- **Party frames**: each member has a thin threat strip (max threat % among engaged enemies; shown only when ≥ 80%, red ≥ 100%).
- Data: the host computes top-3 threat per engaged enemy at **4 Hz** and broadcasts the new `threat` channel `{ e: EntityId, v: EntityId, t: [EntityId, number][] }` (values are % of the victim's threat).
- **Boss aggro table:** the boss frame shows the same table for the current boss (enables tank swaps).

**Tank swap (bosses with `stacker` profile, §1.7):** each melee hit applies `Yırtık` (+20% damage taken from that boss, 30 s, stacks to 6). Swap rule of thumb: taunt at 3 stacks. The boss taunt ICD stays 12 s for the same tank, but a **tank swap** (a different tank taunts) uses the shorter `tankSwapICD` of **8 s** (flag on raid bosses).

**Threat reduction tools:** Suikastçı `Gölge Adımı` (−50% own threat), any stealth (×0.5), Simyacı `Duman Siperi` (enemies inside drop the Simyacı), perfect dodge (−10% own threat on all enemies that were targeting you, once per 4 s), Kılıç Ustası `Savaş Çağrısı` (enemies deal −10%; no threat change). There is **no** Misdirection-style threat redirect in V2. A **tank-only** passive `Muhafız Çağrısı` (Koruyucu/Savaş Lordu): when a non-tank ally is targeted by a non-boss enemy within 20 m, `Kışkırtma` has −3 s cooldown (rewards fast pickups).

### 1.5 Active mitigation uptime design (tank kit summary)

| Mechanic | Koruyucu | Savaş Lordu |
|---|---|---|
| Rotational mitigation 1 (charges, ≈ 65% uptime) | `Kalkan Kaldır`: 2 × (9 s recharge), 6 s, block 100% frontal, costs 30 Kar. | `Demir Duruş`: 2 × (8 s recharge), 5 s, −35% physical, unstoppable, costs 20 Öfke |
| Resource-spent absorb | `Yemin Siperi` (35 Kar.): 22% max HP absorb, cap 45% | `Kan Zırhı` (40 Öfke): 20% max HP + 60% of recent damage, cap 45% |
| Manual guard | `G` hold + parry (shield guard, gauge 100) | `G` hold + parry (weapon guard, gauge 60) |
| Self-sustain | blocked hit +8 Kar.; `Kutsal Toprak` 2%/s; `Yemin Siperi` leftover heal | Öfke Zırhı (up to −25%), `lifeSteal` +2%, counter hits +6 Öfke |
| 45 s major | `Sarsılmaz Bastion` (−40%, unstoppable, 10 s) | `Son Direniş` (+30% max HP, −20%, 10 s) |
| 90 s major | `Yemin Aegis'i` (party −25%, 8 s) | `Toplayıcı Kükreme` (party +15% max HP, heal 15%, 12 s) |

Uptime target: charges recharge **one at a time**, so the steady state is one use per recharge period: `Kalkan Kaldır` 6 s per 9 s ≈ **67%**, `Demir Duruş` 5 s per 8 s ≈ **62%** (the burst of the 2 stored charges gives 100% for the first 12 s / 10 s of a pull). The Koruyucu 4-piece (§6.3) shortens the recharge per blocked hit, reaching ≈ 90%. Missing a tank buster without the buff must be punishing but survivable with `Yemin Siperi` + healer (design: an unmitigated coef-4.5 buster at +10 ≈ 55% of tank max HP).

### 1.6 Healer kit: targeting, smart heals, HoTs, shields, dispels

**Targeting modes** (`Settings.healTargeting`, default `smart`):

| Mode | How a heal picks its target |
|---|---|
| `smart` (default) | 1) the party frame under the cursor (Alt held) → 2) an ally in the **crosshair cone (±4° aim assist, ≤ range, LOS)** → 3) the selected friendly (`F1–F5` / `U`) → 4) the **lowest effective-HP% ally** in range with line of sight (excluding dead). Skills with `params.smartPriority = 'injured'` always skip full-HP allies |
| `frames` | only the hovered frame (Alt) or the selected friendly; if none → self |
| `crosshair` | only the crosshair ally; if none → self (action-combat purists) |

- **Party frames** (`ui/hud/PartyFrames.ts`): each frame is a **click target** when the cursor is free: **LMB = select friendly**, hover + skill key = cast on that member (works for every ally-targeted skill), RMB = nothing. Frames show: role icon, class colour, HP bar with incoming-heal prediction (lighter strip), absorb overlay, up to 4 debuff icons with a **dispellable border** (green), threat strip, range dimming (> 40 m greyed), dead = skull.
- **`U` (targetAlly)** cycles friendly targets sorted by missing HP%; **`F1–F5`** selects slot directly (F1 = self).
- **Friendly target ring**: a green ring under the selected ally + the name over the player frame ("Hedef: Ahmet").
- **HoTs:** `Yenilenme Işığı` (6 max), `Şifa Şişesi` puddle, `Şafak Işığı`. A HoT ticks every 1 s using the **snapshot** of `healingPct` at cast (like DoT snapshot rule). HoT heals are **effective-only** for threat.
- **Shields:** `Işık Kalkanı`, `Taşan Şifa`, `Yemin Siperi` (tank self). Absorbs use `Actor.statuses.absorb`; ally absorbs are sent on the `pstatus` channel (status `shield`, magnitude = amount).
- **AoE heals:** `Parlak Dalga`, `Şafak Doğuşu`, `Hayat İksiri Yağmuru`, `Mucize Karışım` zone.
- **Dispels:** `Arındır`, `Panzehir`. Dispellable statuses are those with `dispellable: true` in `data/statuses.ts` (slow, root, silence, fear, blind, burn, bleed, poison, chill, shock, curse, sunder). Boss/affix debuffs that are **not** dispellable: `bursting`, `necrotic`, `grievous`, `taunt`, `Yırtık`, `Kara Mühür`. Raid dispel checks use a special flag `dispelCheck: true` (§10).
- **Healing meters:** the HUD tracks effective healing, overhealing, absorb done, dispels; recap in the run summary (§8.10).
- **Mana economy** is part of the loop: `Ruh İksiri` (potion key 5), `Ruh Şişesi` flask (§4.2), `Kadim Berraklık`, mana on Işık Oku hits and kills.

### 1.7 Role-based scaling and "needs a tank" profiles (Mythic+, raid, elite packs)

New optional `EnemyDef.profile` (data hint for `EnemyAI`/`abilities.ts`). Unset = derived from `role` + `rank`.

| Profile | TR | Behaviour | Default for |
|---|---|---|---|
| `bruiser` | Dövüşçü | 3 light hits then 1 heavy (coef 1.8) every 6 s at its **current target** | melee trash |
| `buster` | Ezici | every 15 s a **frontal cone 120° / 5 m, coef 4.0** at its current target (**not parryable**, blockable, avoidable by `Kalkan Kaldır`/guard/dodge). `perilous` variant (red glyph) only on elites at key ≥ +8 | elite melee/tank, mini-boss |
| `cleaver` | Biçici | 3 s cone coef 0.9, 90°; punishes players stacked in front | tank role trash |
| `ranged_focus` | Nişancı | picks a random **non-tank** player (`target: 3`) every 8 s | ranged/caster trash |
| `aoe_pulse` | Dalga | party-wide damage pulse every 20 s (healer check), 4–6% max HP × key scaling | casters at key ≥ +4 |
| `stacker` | Yırtıcı | each melee hit stacks `Yırtık` (§1.4) → forces tank swap | bosses, raid bosses |

**Role-based scaling (Mythic+ only):**

```
squishyMult(L) = clamp(1 + 0.04 * (L - 3), 1, 1.60)         // keys +4.. : enemy MELEE damage vs a target that is not role 'tank'
healCheck(L)   = unavoidable party damage budget per second = maxHP * (0.9% + 0.15% * L)    // design target for affix/aoe_pulse tuning
tankBuster(L)  = coef 4.0 * mplusDmg(L)  (so +10 ≈ 8.0 base-coef-equivalent)
```

- `squishyMult` is applied by the **victim's** `hitLocalPlayer` when `hit.melee && p.role !== 'tank'` (the peer knows its own role). A party with **no tank** therefore takes more damage — this is the intended "needs a tank" pressure, but low keys (+2/+3) never apply it.
- **Seçkin packs at key ≥ +8** pick one elite mod from the safe set (§5.2: `hizli zirhli kalkanli vampir cagirici`) at 25% of elite packs — "Efsunlu Seçkin" — to add variety without champion packs.
- **Healer check:** from key +4, `aoe_pulse` casters appear; from +7 affixes (necrotic, grievous) reduce healing; the death recap shows "iyileştirme eksikliği" (§8.5).
- **Normal/Kahramanlık** have no squishy multiplier (levelling should not require a tank).

### 1.8 DPS rotations (summary table)

| Spec | Opener | Core loop | Burst window |
|---|---|---|---|
| Kılıç Ustası | Kahramanlık Çağrısı (party), Gayret | Alev Dalgası → 5 pip Karar Darbesi → Yarma → chain | Kanatlar + 5-pip Karar ×3 during poise break |
| Kasap | Kurt Narası, Parçala ×2 | 8-stack bleed → İdam on <35% → Kasırga | Kan Banyosu when ≥ 3 targets have ≥ 5 stacks → Katliam Çılgınlığı |
| Elementalist | Zaman Bükülmesi, Buz Halkası | freeze → Buz Mızrağı ×3 → Termal Şok (Ateş Topu) → Alev Dalgası → Meteor | Ayaz Damarları → Yanış (both 45 s/90 s offset) |
| Suikastçı | Gizlilik açılış (Sırttan Bıçak) | Gırtlak Kesme → 5 Kombo → İnfaz → Gölge Adımı | Gölge Bıçakları + Ölümcül Gölge Dansı |

(Healer and tank priority lists are in §1.3.)

---

## 2. Major cooldowns (WoW-style "büyük bekleme süreleri")

Every spec owns **two major cooldowns**: a **45 s** one (unlock L10, key `X`, slot `m45`) and a **90 s (1.5 min)** one (unlock L20, key `V`, slot `m90`). Four specs (one per class) also own a **3-minute party buff** (unlock L30, key `T`, slot `m180`): the **Kurt Narası family** (WoW Bloodlust/Heroism with the `Yorgun` debuff). Majors are the main way specs differ in a fight: 45 s = rotation ramp / rolling defensive, 90 s = burst / big defensive / raid cooldown.

### 2.1 Rules

| Rule | Value |
|---|---|
| Slots / data | `SkillDef.defaultSlot: 'm45' \| 'm90' \| 'm180'`, `params.major = 45 \| 90 \| 180`. Fixed per spec (not swappable); stored in `specBars` implicitly |
| Cost | none (resource-free) unless the table says; instant cast (lock 0.25–0.5 s), **not interruptible**, usable while moving, **not usable while stunned/frozen/feared** |
| Cooldown reduction | `effectiveCD = base × (1 − 0.5 × min(cdr, 0.40)) × (1 − min(majorCdrPct, 0.35))`, floor 50% of base. `m180` is **never** reduced |
| Persistence | cooldowns persist through death and scene changes (stored in `CharacterSave.flags.majorCd = { m45, m90, m180 }` as remaining seconds, ticked while in game) |
| Reset | **all majors reset to ready** when a dungeon/raid is entered, when a **boss wipe** resets the arena, and when an M+ run starts (after the 10 s countdown) — never in the open world |
| Aspect hooks | `asp_major_surge` (−8–15% 45/90 cooldown), `majorCdrPct` item stat (none on base affixes; comes from aspects, tier 4-piece, Kadim Levha) |
| Network | cast = normal `cast` channel (VFX/anim on peers); the remaining cooldown of the three slots (seconds, rounded) is appended to `PlayerSyncState.mcd: [number, number, number]` at 1 Hz so the **party cooldown tracker** can draw it |
| Hero effect | caster must **not** have `sated`. Applies `hero_haste` (40 s) to every living party member within 40 m **and** `sated` (150 s) to them; the caster gets both. Slot shows "Yorgun m:ss" in red while `sated` is active even if the 180 s cooldown is ready |
| Kick/threat | majors add no threat unless stated |
| Ready ping | when a major becomes ready: slot flash + `sfx_cd_ready` (soft chime) + brief gold ring; only for the local player |

`hero_haste` = `attackSpeed +0.30`, `castSpeed +0.30`, `moveSpeedPct +0.10` for 40 s; applies in all difficulties. It stacks multiplicatively with the aspect/seal bonuses but **not** with a second `hero_haste` (no stacking; refresh only). `Yorgun` only blocks hero effects; the `flask_silver` haste is a separate effect and stacks with it.

### 2.2 The 20 majors

Columns: id · TR name · key/CD · duration · effect (exact) · cast anim (KayKit clip, lock s) · VFX · SFX · tooltip (TR). New VFX/SFX ids are appended to `types/vfx.ts` / `types/audio.ts` and implemented by the vfx-audio owner (unknown ids fail silently).

| # | Spec | id | Ad (TR) | Key / CD | Süre | Etki (kesin) | Anim (lock) | VFX | SFX |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Koruyucu | `knight_unbroken_bastion` | Sarsılmaz Bastion | X / 45 s | 10 s | `bastion`: DR −40% (own multiplicative source), unstoppable (no knockback/stagger/stun), +10% max HP over the duration (heal), +30 Kar. on cast, +100 flat threat on every enemy within 8 m | `Cheer` ×1.8 (0.30) | `bastion_dome` (gold dither dome r 1.8), `holy_burst` small | `buff`, `shield_bash` |
| 2 | Koruyucu | `knight_oath_aegis` | Yemin Aegis'i | V / 90 s | 8 s | allies within 15 m: `aegis` DR −25%, instant heal 8% max HP; self absorb 30% max HP; ring expands 0.4 s | `Cheer` ×1.4 (0.40) | `aegis_ring` (r 15 expanding gold-white ring) + `aegis_dome` per ally | `hero_horn` (soft), `buff` |
| 3 | Kılıç Ustası | `knight_zeal` | Gayret | X / 45 s | 8 s | `zeal`: attack speed +30%; every basic hit +1 Adalet; `Işıltılı Yarma` costs 0 Kar. | `Cheer` ×2.0 (0.25) | `zeal_aura` (golden afterimage 3 copies, sword flame) | `buff`, `swing_heavy` pitch +10% |
| 4 | Kılıç Ustası | `knight_wings_of_judgment` | Hüküm Kanatları | V / 90 s | 20 s | `wings`: holy more ×1.25, +20 pp crit chance, +15% move speed; **Karar Darbesi costs 0 Adalet and counts as 3 pips** (consumes none) | `Cheer` ×1.2 (0.30) | `wings_gold` (billboard wing pair, additive flap 3 Hz), light pillar on cast | `choir_sting`, `buff` |
| 5 | Kılıç Ustası | `knight_heroism_call` | Kahramanlık Çağrısı | T / 180 s | 40 s | hero effect (see 2.1) | `Cheer` ×1.2 (0.40) | `hero_wave` (gold ring to 40 m), banner VFX over each player | `hero_horn` |
| 6 | Savaş Lordu | `barbarian_last_stand` | Son Direniş | X / 45 s | 10 s | `last_stand`: `maxHpPct +0.30` (current HP raised by the same amount), DR −20%, unstoppable, +30 Öfke; on expiry current HP is clamped (never below 25% of normal max) | `Cheer` ×1.6 (0.30) | `enrage_aura` (red-brown), steam | `war_cry` |
| 7 | Savaş Lordu | `barbarian_rallying_roar` | Toplayıcı Kükreme | V / 90 s | 12 s | allies within 20 m: `rally` `maxHpPct +0.15` and instant heal 15% max HP; enemies within 8 m (non-boss) feared 1.5 s; +100 flat threat on all enemies within 20 m | `Cheer` ×1.4 (0.40) | red shockwave r 20 + allies' red screen-edge pulse | `war_cry`, `boss_roar` low |
| 8 | Kasap | `barbarian_bloodbath` | Kan Banyosu | X / 45 s | instant | every bleed on enemies within 12 m **detonates** for 150% of its remaining damage; +20 Öfke per detonated target (cap 100); heal 1.5% max HP per detonated target (cap 12%) | `Cheer` ×1.5 (0.30) | `bloodbath_burst` (blood fountain per target, streams to the caster) | `hit_flesh` ×N, `explosion` low |
| 9 | Kasap | `barbarian_carnage` | Katliam Çılgınlığı | V / 90 s | 15 s | `carnage`: more ×1.35, attack speed +30%, slow/root immune, `healReceivedPct −0.30`; `İdam` usable on any target | `Cheer` ×1.6 (0.35) | `carnage_aura` (red eyes, afterimages) | heartbeat loop, `war_cry` |
| 10 | Kasap | `barbarian_wolf_howl` | Kurt Narası | T / 180 s | 40 s | hero effect | `Cheer` ×1.0 (0.50) | `hero_wave` wolf variant (spectral wolf heads in red mist) | `wolf_howl` |
| 11 | Elementalist | `mage_icy_veins` | Ayaz Damarları | X / 45 s | 10 s | `icy_veins`: cast speed +30%; frost spells apply chill 100%; frost projectiles pierce +2 | `Spellcast_Raise` ×2.0 (0.30) | `icy_veins_aura` (frost mist on hands, orbiting crystals) | `ice_chime` |
| 12 | Elementalist | `mage_combustion` | Yanış | V / 90 s | 12 s | `combustion`: fire spells always crit, fire more ×1.25; fire crits spread burn to enemies within 4 m (ICD 1.5 s per source) | `Spellcast_Raise` (0.50) | `combustion_aura` (flame halo, embers) + warm screen tint | `fire_whoosh` |
| 13 | Elementalist | `mage_time_warp` | Zaman Bükülmesi | T / 180 s | 40 s | hero effect | `Spellcast_Raise` ×1.2 (0.50) | `hero_wave` purple clock-ring r 40 m with rotating glyphs | `time_warp` |
| 14 | Işık Çağıran | `mage_divine_clarity` | Kadim Berraklık | X / 45 s | 8 s | `clarity`: heals cost 0 mana, cast speed +30%, heals castable while moving | `Spellcast_Raise` ×2.0 (0.25) | `clarity_halo` (gold halo, mana motes) | `buff` |
| 15 | Işık Çağıran | `mage_dawn_resurgence` | Şafak Doğuşu | V / 90 s | 6 s HoT | channel 1.5 s (rooted): heals all allies within 25 m for **3.5×W** instantly, then `dawn_hot` 0.25×W per s for 6 s, DR −20% for 4 s, cleanses 1 debuff | `Spellcast_Long` (1.5) | `dawn_pillars` (golden light pillars on each ally), `holy_burst` | `choir_swell` |
| 16 | Suikastçı | `rogue_shadow_blades` | Gölge Bıçakları | X / 45 s | 10 s | `shadow_blades`: every hit adds 25% of its damage as shadow, energy costs −30%, +1 Kombo per basic hit | `Use_Item` ×2.0 (0.20) | `blades_shadow` (violet dagger glow) | `whisper` |
| 17 | Suikastçı | `rogue_shadow_dance` | Ölümcül Gölge Dansı | V / 90 s | 8 s | `shadow_veil_cd`: stealth that does not break on attack; first 3 hits count as stealth openers (+80%), later hits +40%; `Gölge Adımı` reset and costs 0; `İnfaz` costs 0 Enerji; enemies within 2.5 m still see you | `Dodge_Forward` fade (0.30) | `shadow_dance_smoke` (black smoke body, afterimages, red eyes) | `whisper`, `whoosh` |
| 18 | Simyacı | `rogue_elixir_of_life` | Hayat İksiri Yağmuru | X / 45 s | 6 s HoT | heals every ally within 15 m for **1.8×W** + `elixir_regen` 0.3×W per s for 6 s; cleanses 1 debuff | `Throw` ×1.8 (0.30) | `elixir_rain` (green-gold droplets) | `potion_use` |
| 19 | Simyacı | `rogue_miracle_brew` | Mucize Karışım | V / 90 s | 10 s | cast 1.0 s: cauldron r 6 m at a ground point ≤ 22 m: allies inside DR −25%, heal 6% max HP/s, cleanse poison/bleed every 2 s | `Throw` ×1.2 (1.0 cast) | `brew_cauldron` (prop + steam + green glow, light) | `bubble_loop` |
| 20 | Simyacı | `rogue_haste_elixir` | Hızlandırıcı İksir | T / 180 s | 40 s | hero effect | `Throw` ×1.2 (0.30) | `hero_wave` green-gold | `potion_use`, `hero_horn` |

Tooltips (TR, `SkillDef.desc`):

| id | desc |
|---|---|
| `knight_unbroken_bastion` | 10 saniye boyunca aldığın hasar %40 azalır, sersemletilemez ve geri itilemezsin. Maks. canının %10'u kadar iyileşirsin ve yakındaki düşmanların dikkatini çekersin. |
| `knight_oath_aegis` | 15 metre içindeki müttefikler 8 saniye boyunca %25 daha az hasar alır ve hemen canlarının %8'ini geri kazanır. Sen de maks. canının %30'u kadar kalkan kazanırsın. |
| `knight_zeal` | 8 saniye boyunca saldırı hızın %30 artar, her temel vuruş Adalet Puanı kazandırır ve Işıltılı Yarma Kararlılık harcamaz. |
| `knight_wings_of_judgment` | 20 saniye boyunca kutsal kanatlar açarsın: kutsal hasarın %25 artar, kritik şansın %20 ve hareket hızın %15 yükselir. Karar Darbesi bedava olur ve 3 Adalet Puanı gibi vurur. |
| `knight_heroism_call` | Tüm grubunun saldırı ve büyü hızı 40 saniye boyunca %30, hareket hızı %10 artar. Etkilenenler 2.5 dakika Yorgun kalır ve bu etkiyi tekrar alamaz. |
| `barbarian_last_stand` | 10 saniye boyunca maks. canın %30 artar, aldığın hasar %20 azalır ve kontrol altına alınamazsın. 30 Öfke kazanırsın. |
| `barbarian_rallying_roar` | 20 metre içindeki müttefiklerin maks. canı 12 saniye boyunca %15 artar ve hemen %15 can yenilerler. Yakındaki düşmanlar korkar ve dikkatini sana verir. |
| `barbarian_bloodbath` | 12 metre içindeki tüm kanamalar kalan hasarlarının %150'siyle patlar. Patlayan her düşman için Öfke ve can kazanırsın. |
| `barbarian_carnage` | 15 saniye boyunca hasarın %35, saldırı hızın %30 artar; yavaşlatılamaz ve köklenemezsin. İdam her düşmana vurabilir. Aldığın iyileştirme %30 azalır. |
| `barbarian_wolf_howl` | Kurt gibi uluyarak tüm grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı verirsin. Etkilenenler 2.5 dakika Yorgun kalır. |
| `mage_icy_veins` | 10 saniye boyunca büyü hızın %30 artar, buz büyülerin her zaman üşütür ve 2 hedef daha deler. |
| `mage_combustion` | 12 saniye boyunca ateş büyülerin daima kritik vurur ve %25 daha fazla hasar verir. Kritik vuruşlar yanmayı 4 metre çevreye yayar. |
| `mage_time_warp` | Zamanı büker: tüm grubunun saldırı ve büyü hızı 40 saniye boyunca %30, hareket hızı %10 artar. Etkilenenler 2.5 dakika Yorgun kalır. |
| `mage_divine_clarity` | 8 saniye boyunca iyileştirmelerin mana harcamaz, %30 daha hızlı dökülür ve yürürken yapılabilir. |
| `mage_dawn_resurgence` | 25 metre içindeki tüm müttefikleri anında iyileştirir, ardından 6 saniye boyunca yenilenme verir ve 4 saniye hasarlarını %20 azaltır. Bir olumsuz etkiyi temizler. |
| `rogue_shadow_blades` | 10 saniye boyunca her vuruşun hasarının %25'i kadar ek gölge hasarı eklenir, yetenek maliyetlerin %30 azalır ve her temel vuruş Kombo kazandırır. |
| `rogue_shadow_dance` | 8 saniye boyunca saldırınca bile gizliliğini kaybetmezsin: ilk 3 vuruş pusu vuruşu sayılır. Gölge Adımı yenilenir ve bedava olur, İnfaz Enerji harcamaz. |
| `rogue_elixir_of_life` | 15 metre içindeki tüm müttefikleri iyileştirir, 6 saniye boyunca yenilenme verir ve bir olumsuz etkiyi temizler. |
| `rogue_miracle_brew` | Yere bir kazan kurarsın: 10 saniye boyunca içindeki müttefikler %25 daha az hasar alır, saniyede canlarının %6'sını yenilerler ve zehir/kanamadan arınırlar. |
| `rogue_haste_elixir` | Grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı veren bir iksir fırlatırsın. Etkilenenler 2.5 dakika Yorgun kalır. |

`SkillDef` example (copy as a template for the other majors):

```ts
{ id: 'knight_unbroken_bastion', classId: 'knight', spec: 'knight_protector', name: 'Sarsılmaz Bastion', icon: '/assets/icons/skill-shield-wall.svg',
  unlockLevel: 10, defaultSlot: 'm45', cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.30,
  targeting: 'self_buff', selfStatuses: [{ status: 'bastion', duration: 10 }], tags: ['major','defensive','buff'],
  vfx: { cast: 'bastion_dome' }, sfx: { cast: 'buff' },
  params: { major: 45, end: 0.6, chain: 0.1, move: 0.1, weight: 1, gainRes: 30, threatAoE: 100, threatR: 8, healPct: 0.10 } }
```

### 2.3 Cast presentation standard (feel)

| Major type | Camera | Hit-stop | Screen | Time |
|---|---|---|---|---|
| defensive (1, 2, 6, 7, 14) | shake 0.15, FOV −2° over 0.15 s then back (0.35 s) | none | brief colour vignette (gold/red/blue) 0.4 s | – |
| offensive (3, 4, 9, 11, 12, 16, 17) | shake 0.20, `camera:punch { fov: −4, in 0.08, out 0.30 }` | none | weapon/hand glow ramp 0.25 s | – |
| burst-heal (15, 18, 19) | shake 0.10 | none | soft white-gold bloom pulse 0.3 s | – |
| detonation (8) | shake 0.30 | 60 ms | red flash 0.1 s | – |
| **hero (5, 10, 13, 20)** | shake 0.25, `camera:punch { fov: −6 }` | none | centre banner "KURT NARASI!" / "KAHRAMANLIK!" / "ZAMAN BÜKÜLMESİ!" / "HIZLANDIRICI İKSİR!" (gold, Cinzel, 1.6 s) with the caster's name; warm vignette; every player's model gets `haste_trail` + weapon glow for the duration | – |

Animation notes: majors reuse existing KayKit upper-body clips (`Cheer`, `Spellcast_Raise`, `Spellcast_Long`, `Use_Item`, `Throw`, `Dodge_Forward`); the player may keep moving (upper-body only) except the two channels (15, 19's 1.0 s cast), which root. All cast VFX are visible to peers through the normal `cast` replay (`playRemoteCast`).

### 2.4 HUD layout (reference 1920×1080; `lg` 64 px, `md` 48 px, `sm` 36 px)

```
 [Y town portal]                                                               [flask 6][7][8][9][0]  (sm, above the potions)
 [T hero sm, gold frame]  [X m45 lg][V m90 lg] || [LMB lg][RMB lg][Q][E][1][2][3] [R] || [4 pot][5 pot]
 (guard gauge: thin arc under the crosshair + a bar under the player frame; riposte/parry ring on the crosshair)
```

| Element | Placement | Content |
|---|---|---|
| Major cluster | left of the LMB slot, 12 px gap, X then V | lg round slots, sweep cooldown, remaining seconds, ready flash; border colour: gold = offensive, blue = defensive, green = heal |
| Hero slot (T) | above-left of X, `sm`, gold frame; hidden for specs without `m180` | shows `Yorgun m:ss` (red) while `sated`; "BAŞKASI KULLANDI" tooltip if sated by an ally |
| Flask bar | right of the potions, 5 `sm` slots | liquid-fill = charges, key label, flashes on use, greyed when below `use` charges (§4.2) |
| Spec badge | on the player frame | role icon + spec name ("Koruyucu · Tank") |
| Guard gauge | arc around the crosshair (appears only while guarding or below 100%) + bar under the player frame | §3.4 |
| Party cooldown tracker | right edge of each party frame | up to 3 mini icons (m45/m90/m180) with a radial sweep, shown only when the cooldown has < 20 s left or is active |
| Combat prompts | under the crosshair | `KRİTİK!` (broken target), `KARŞI VURUŞ!` (riposte), `ARKADAN!` (backstab opportunity) |

Tooltips for major slots use the existing `skillTooltipHTML` with an added line "Büyük Yetenek · Bekleme 45 sn" and, for hero slots, the current `Yorgun` timer.

---

## 3. Elden Ring-style combat depth

Goal: add **Elden Ring's "decisions per second"** (charge, guard, parry, riposte, poise, backstab, critical hit, weapon arts) on top of the existing Diablo/Hero Siege combo flow, **without** stamina and without slowing the pace. Everything here is built around the existing LMB 4-step chains (`<class>_basic_1..4` with `weight`, `chain`, `move` params), dodge roll (2 charges, i-frames 0.04–0.34 s), hit-stop / trauma tables (GDD_SYSTEMS §8.3–8.4) and the existing **stagger bar** (`Combat.staggerMax/addStagger`, renamed **Duruş / Poise** in the UI).

### 3.1 Action overview

| Action | TR | Input | Condition | Short rule |
|---|---|---|---|---|
| Light chain | Hafif Kombo | tap LMB (< 0.28 s) | idle / chain window | existing 4-step (knight/barbarian/rogue) / 3-cast (mage) chain, unchanged |
| Heavy attack | Ağır Vuruş | hold LMB ≥ 0.28 s, release | any | 2 charge tiers, tier 2 = **weapon art** (§3.8) |
| Running attack | Koşu Saldırısı | tap LMB | moving ≥ 0.45 s at ≥ 85% move speed | lunge 3 m, replaces chain step 1, flows into step 2 |
| Jump attack | Sıçrama Saldırısı | LMB | airborne ≥ 0.12 s | plunge, AoE on landing |
| Roll attack | Yuvarlanma Saldırısı | LMB | 0.30 s after a dodge start (existing "roll-attack" window) | lunge 2.5 m, flows into step 3 |
| Guard | Siper | hold `G` | not stunned | frontal block, Guard Gauge, **first 0.20 s = parry window** |
| Guard counter | Siper Karşılığı | LMB while guarding | knight, barbarian | quick bash 1.2 coef, poise 30 |
| Parry → Riposte | Savuşturma → Karşı Vuruş | `G` timed, then LMB within 1.6 s | parry succeeded | auto-aim finisher 3.5 coef + crit |
| Backstab | Arkadan Vuruş | any melee hit | attacker inside the target's rear 100° | ×1.3 damage (Suikastçı ×1.6), ×1.5 poise |
| Poise break | Duruş Kırılması | fill the enemy poise bar | – | 2.0 s stun window, ×1.25 damage |
| Critical hit | Kritik Vuruş | LMB (or backstab) | enemy is poise-broken, within 3.2 m | scripted finisher, huge damage + camera punch |
| Weapon art | Silah Sanatı | hold LMB to tier 2 | – | per weapon category, includes the **Kes** interrupt |

**No stamina.** Resource pacing comes from the existing class resources, dodge charges, the **Guard Gauge** (guard only) and the recovery length of heavy actions. Decision rationale: stamina would punish the Hero-Siege-style horde pace and fight the "dodge always available" standard in ARCHITECTURE.

### 3.2 Charged heavy attack (hold LMB)

| Param | Value |
|---|---|
| Tap vs hold threshold | 0.28 s (input held, no release) — a tap that releases earlier is a light attack (the 0.25 s input buffer still applies) |
| Charge pose | the class clip is **held on its wind-up frame** (`params.holdFrame`) while charging; weapon/hands glow ramps; character moves at ×0.5 and may rotate with the camera |
| Tier 1 | 0.28–0.75 s of holding → **Ağır Vuruş** (white-hot glow) |
| Tier 2 | ≥ 0.75 s → **Silah Sanatı** (gold glow + `charge_full` ding + rim flash) — holds indefinitely, no auto-release |
| Cancel | dodge cancels the charge without cost; skills cancel it; stun cancels it |
| Hyper-armor | from release until `hit + 0.10 s` on tier 2 (ignores flinch/knockback from hits < 20% max HP); tier 1 none |
| Resource | heavy hit grants the finisher amount (knight +10, barbarian +14, mage +6, rogue +2 Kombo); no cost |
| Settings | "Basılı tutunca otomatik kombo" (default OFF) re-enables hold-to-repeat for tap-style players: holding then never charges |

**Heavy attack table** (coef × W, `weight` 2 unless stated; poise = poise damage; hit-stop/shake per §3.11)

| Class | Tier 1 id / TR / clip | Tier 1 numbers | Tier 2 (weapon art) |
|---|---|---|---|
| Şövalye | `kn_heavy` Ağır Darbe — `1H_Melee_Attack_Chop` hold at 0.18, release [0.18–0.85] ×1.15, hit 0.448 | 2.6 phys (Koruyucu: +30% as holy), arc 100° / 3.2 m, poise 30, knockback medium 1.6 m | `wa_rising_blade` Yükselen Kılıç (§3.8) |
| Barbar | `bb_heavy` Kafa Yaran — `2H_Melee_Attack_Chop` hold at 0.20, hit 0.45 | 3.2 phys, arc 120° / 3.6 m, poise 40, knockback heavy 2.5 m, `stagger` ×1.2 on elites | `wa_earthbreaker` Yer Kıran |
| Büyücü | `mg_heavy` Yüklü Gizem Oku — `Spellcast_Raise` hold at 0.30 → `Spellcast_Shoot` | projectile r 0.7, pierce 2, 28 m/s, 2.8 arcane, explodes r 2.0 m (0.8 coef splash), poise 18; mana +6 | `wa_starfall_beam` Yıldız Işını (staff) / `wa_twin_bolts` (wand) |
| Haydut | `rg_heavy` Delici Hamle — `Dualwield_Melee_Attack_Stab` hold at 0.15 | dash 4 m through enemies then 3.0 phys, 60° / 2.8 m, poise 24, +2 Kombo | `wa_flurry` Hançer Fırtınası |
| Işık Çağıran (override) | `mg_heavy_heal` Yüklü Işık | beam to the crosshair target: ally +2.0×W heal, enemy 2.2 holy; poise 20 | `wa_dawn_wave` Şafak Dalgası |
| Simyacı (override) | `rg_heavy_vial` Büyük Şişe | lobbed vial r 2.5: enemies 2.0 poison + slow 30% 2 s, allies +2.0×W heal; +1 Karışım | `wa_twin_vials` Çift Şişe |

### 3.3 Running, jump and roll attacks

| Class | Running attack (id / TR) | Jump attack | Roll attack |
|---|---|---|---|
| Şövalye | `kn_run` Koşu Hamlesi: shoulder-lunge 3 m, 1.4 phys, arc 90°, poise 14, knockback light; continues the chain at step 2 | `kn_jump` Göksel Dalış: 1.6 holy, AoE r 2.2 m on landing, poise 20; +25% if airtime ≥ 0.4 s | `kn_roll` Yuvarlanma Kesiği: 1.6 phys, lunge 2.5 m, continues at step 3 |
| Barbar | `bb_run` Balta Atılışı: 4 m lunge, 1.5 phys, arc 160°, poise 18, bleed 20% over 3 s | `bb_jump` Yer Çökertme: 2.0 phys, AoE r 3.0 m, poise 28, small dust ring | `bb_roll` Dönen Kesik: 1.6 phys, arc 200° / 3 m, continues at step 3 |
| Büyücü | `mg_run` Koşarak Atış: full-speed cast, 3 bolts × 0.7 arcane, spread ±8° (mage can already cast on the move; this adds the volley) | `mg_jump` Süzülen Salvo: gravity ×0.15 for 0.5 s, 3 bolts × 0.8 arcane, poise 8 each | `mg_roll` Çapraz Atış: after the roll 3 piercing bolts × 1.2 arcane |
| Haydut | `rg_run` Kayan Bıçak: slide 4 m under enemies, 1.1 phys per enemy passed, +1 Kombo | `rg_jump` Kuş Saldırısı: dive 1.7 phys single target, +2 Kombo, counts as backstab if behind | `rg_roll` Arkadan Dönüş: if an enemy is within 5 m the roll ends **behind** it, next `Sırttan Bıçak`/light hit counts as a backstab; 1.3 phys |

All three are **free** (no resource), 0.45 s base lock, `upper: 0` (full-body), cancelable by dodge after the hit like basics. Running attack cooldown: none. Jump attack cooldown 1.0 s. Roll attack: only once per roll.

### 3.4 Guard and the Guard Gauge

| Class | Guard type | Block arc | `blockAmount` | Gauge max | Notes |
|---|---|---|---:|---:|---|
| Şövalye | shield guard (needs the shield) | 160° (Koruyucu 180°) | `0.60 + shield implicit + stat` | 100 | blocks melee **and** projectiles; spells/AoE are not blockable (existing rule) |
| Barbar | weapon guard | 120° | `0.40 + stat` | 60 | melee only; Savaş Lordu +20 gauge |
| Büyücü | no sustained guard | – | – | 0 | the parry window only (§3.5); can reflect projectiles |
| Haydut | no sustained guard | – | – | 0 | the parry window only; riposte teleports behind the target |

- Gauge max = class base + `guardGauge` stat + 10 per shield tier (knight). Item/aspect/talent bonuses use `guardGauge`.
- **Cost per blocked hit** = `clamp(8 + 80 × hitDamage / maxHP, 8, 60)`. `Kalkan Kaldır` blocks cost 0 gauge.
- **Regen:** 18/s starting 0.8 s after the last block while **not** guarding; 6/s while guarding and unhit.
- **Gauge empty = Siper Kırıldı:** `guard_broken` 1.2 s stun, guard disabled 2 s, hit-stop 110 ms, trauma 0.4, white "SİPER KIRILDI!" text.
- Guard rules: movement ×0.6, character faces camera, any skill (except `knight_shield_wall`) cancels it, dodge cancels it instantly, stun/freeze breaks it. `blockChance` is treated as 100% while guarding (the stat keeps working when **not** guarding as the passive block roll).
- **Perilous attacks** (`EnemyAbility.perilous`, §3.12) ignore guard completely and shatter the gauge; shown with a red glyph — dodge them.
- HUD: bar under the player frame + arc around the crosshair (blue, turns orange < 30%, red + shake at 0).

### 3.5 Parry and riposte

Pressing `G` opens the **parry window** for `0.20 s + S.parryWindow` (Koruyucu 0.27 s, Suikastçı 0.24 s). A `parryable` enemy hit that lands inside the window is **parried**:

| Effect | Value |
|---|---|
| Damage | 0, no status, no knockback, no gauge cost |
| Enemy poise damage | trash/swarm: instant break (flinch + 0.8 s `parried` recoil, windup cancelled); elite **+60**; mini-boss **+90**; boss **+120** (20% of 600) ×(1 + 0.5 per extra party member, max ×3 at 5) — bosses are never recoiled, only poise-damaged |
| Player | `riposte` status 1.6 s, +10 class resource, hit-stop 120 ms, trauma 0.25, `parry_flash` at the contact point, `parry` SFX, gold text "SAVUŞTURMA!" |
| Spec bonuses | Koruyucu: reflects 0.5×W holy to the attacker on parry; Suikastçı: parry also grants 2 Kombo; Elementalist/Işık Çağıran: parry deflects **projectiles** back (150% damage, 6 m/s homing to the source) |
| Lockout | the window lasts 0.20 s; **pressing again within 0.60 s of the previous press does nothing** (no spam); a whiffed window costs 0.15 s of guard lowering |
| Late press | a hit after the window but while guarding = normal block (gauge cost) |

**Riposte (Karşı Vuruş):** while `riposte` is active, LMB within 3.5 m of the parried enemy → auto-face, lunge up to 2.5 m, invulnerable for the first 0.35 s:

| Class | id / TR | Clip | Damage |
|---|---|---|---|
| Şövalye | `kn_riposte` Kutsal Karşılık | `1H_Melee_Attack_Stab` ×1.3 | 3.5 holy-phys, guaranteed crit, +50% armour pen, poise 60 |
| Barbar | `bb_riposte` Kemik Kıran | `2H_Melee_Attack_Chop` ×1.1 | 4.0 phys, guaranteed crit, poise 70 |
| Büyücü | `mg_riposte` Karşı Büyü | `Spellcast_Shoot` point-blank | 3.0 arcane, guaranteed crit, poise 40 |
| Haydut | `rg_riposte` Gölge Karşılığı | `Dualwield_Melee_Attack_Stab` after a 0.1 s blink **behind** the target | 4.0 phys, guaranteed crit, counts as backstab, poise 50 |

If the target is already poise-broken the riposte becomes a **Kritik Vuruş** (§3.7). Riposte damage scales with `finisherPct`. Hit-stop 140 ms, trauma 0.35, `riposte_trail`.

### 3.6 Backstab (Arkadan Vuruş)

- Condition: melee hit whose attacker lies inside the target's **rear 100°** (±50° around `−facing`) at the hit frame. Evaluated by the **attacker's** machine with the target's replicated yaw (interpolated).
- Effect: `×1.3 DAHA FAZLA` damage (Suikastçı ×1.6), poise damage ×1.5 (bosses ×1.2), green "ARKADAN!" text + `backstab_mark` flash on the target's back, `backstab` SFX layer. Replaces the old `trait_opportunist` backstab rule (O4); the Haydut's "+10% crit vs stunned/slowed/blinded" clause stays.
- Hitting a **poise-broken or stunned** enemy from behind triggers the Kritik Vuruş automatically.
- UI: a faint green arc appears behind enemies within 3 m while the player is inside their rear arc.
- Enemies with `def.ai.backstabbable === false` (shielded fronts, floating orbs, summoned adds) ignore the bonus.

### 3.7 Poise (Duruş), stance break and Kritik Vuruş

**Terminology:** the existing "stagger bar" **is** the poise bar. UI says **Duruş**; the code keeps `Combat.stagger` (alias `poise`). Hits add poise damage from `SkillDef.params.stagger` (existing) or the new `poise` field of heavy/parry/riposte/weapon-art hits. `S.staggerPct` and `S.poiseDamagePct` add together.

**Poise bar by rank** (per `EnemyDef`: `poise?` max, `poiseRegen?` fraction/s, `poiseDelay?` s, `hyperArmor?` 0..1 — defaults from rank, multiplied by family)

| Rank | Poise max | Regen | Delay | Hyper-armor (fraction of windup protected from flinch) | Break window | Lock after break | Party scaling |
|---|---:|---|---:|---:|---:|---:|---|
| `swarm` | 6 | – | – | 0 | flinch 0.4 s | – | none |
| `trash` | 24 | 10%/s | 3 s | 0 | 2.0 s | 8 s | none |
| `elite` | 100 | 10%/s | 3 s | 0.5 | 2.0 s | 12 s | ×(1 + 0.5(n−1)) |
| `miniboss` | 300 | 10%/s | 3 s | 0.8 | 2.0 s | 15 s | same |
| `boss` | 600 | 10%/s | 3 s | 1.0 | 2.0 s | 25 s | same |
| raid boss | 900 | 6%/s | 4 s | 1.0 | 2.0 s | 30 s | same |

Family multipliers on max poise: golem ×1.5, dragon ×1.3, humanoid/cultist/demon ×1.0, beast ×0.8, ghost ×0.6 (undead flavour). Poise damage taken from weak-type hits is ×1.5 (§7.3).

**Break (OVERRIDE O1):** bar full → `poise:break` → `stun` 2.0 s (replicated via `estatus`), damage taken ×1.25, status `marked_crit` (shows a pulsing gold "KRİTİK!" ring over the enemy and the crosshair prompt), `SENDELEDİ!` text, `stance_break_shards` + `stance_break` SFX, trauma 0.35, hit-stop 100 ms. A boss **cannot** be hard-stunned by CC but **can** be broken; while broken it plays its stagger clip (`Hit_B`/`Lie_Idle` loop) and **cancels its current non-perilous cast**.

**Kritik Vuruş (Critical hit)** — LMB within 3.2 m of a `marked_crit` enemy (or a backstab on it):

| Part | Value |
|---|---|
| Animation | the class heavy clip at ×1.3 aimed at the target; player invulnerable 0.6 s; 0.15 s lunge to 1.2 m from the target |
| Damage | `W × 5.0 × (1 + main/100) × crit(guaranteed) × (1 + S.finisherPct)` **+** `pctMaxHp × target.maxHp` capped at `20×W`: swarm/trash 25%, elite 12%, mini-boss 6%, boss 2.5%, raid boss 1.5% |
| Ending the window | trash/elite: the finisher **ends** the break (target dies or is hit-reacted); boss/mini-boss: the window continues for the remaining time (second player can also execute; each player at most once per window) |
| Rewards | `critbuff` (+15% damage, 5 s), +25 resource, `crit_finisher` SFX |
| Camera / time | `camera:punch { fov: −9, in: 0.07, out: 0.45 }`, trauma 0.55, hit-stop 160 ms, time-scale 0.35 for 0.22 s then 0.3 s recovery (existing `Combat.slowmo`) |
| VFX | white flash 60 ms, `crit_finisher_slash` (large X-slash decal), elemental burst by damage type, corpse fling on kill |
| Net | the player sends a normal `hit` with `skillId: 'crit_finisher'`, `crit: true`, `poise: 0`; host validates `marked_crit` (if the status is gone the hit is just a heavy hit) |

### 3.8 Weapon arts (Silah Sanatları)

A weapon art is the **tier-2 charged heavy** of the equipped **weapon category**. It replaces the class heavy's tier-2 effect; every art carries **Kes** (interrupt) — it stops an `interruptible` enemy cast within its hit area, shows "KESİLDİ!", then starts a **personal kick lockout** (default 10 s; mage 12 s, rogue 8 s; shown on the kick tracker, §8.4). `weaponArtPct` scales damage.

| id | TR | Category (`ItemCategory`) | Class / availability | Charge → release | Effect (exact) | Poise | Kes |
|---|---|---|---|---|---|---:|---|
| `wa_rising_blade` | Yükselen Kılıç | `sword1h` | Şövalye | 0.75 s hold; release dash 3.5 m + rising slash `1H_Melee_Attack_Stab`→`Slice` | 3.4 coef (phys; Koruyucu/Kılıç Ustası: 50% holy), arc 100° / 3.4 m, knockup 0.8 m on Sıradan/Sürü, sword-flare trail | 50 | yes |
| `wa_earthbreaker` | Yer Kıran | `axe2h` | Barbar | 0.75 s hold; overhead slam | 4.2 coef cone 120° / 4.2 m + shockwave r 3.0 m (1.2 coef), wall slam (§8.5), heavy knockback | 70 | yes |
| `wa_crushing_blow` | Ezici Darbe | `mace` | data only (no mace base yet; Phase 2) | 0.85 s hold | 3.6 coef + poise ×2 effect | 90 | yes |
| `wa_starfall_beam` | Yıldız Işını | `staff` | Büyücü (Elementalist; Işık Çağıran uses `wa_dawn_wave`) | 0.75 s hold; 0.4 s beam | hitscan 22 m, width 1.2 m, pierce all: 3.2 arcane | 30 | yes |
| `wa_twin_bolts` | İkiz Şimşek | `wand` | Büyücü | **0.60 s** hold | 2 homing bolts (range 20), 1.5 lightning each | 20 | yes |
| `wa_flurry` | Hançer Fırtınası | `dagger` | Haydut (Suikastçı) | 0.75 s hold; 0.6 s | 6 strikes × 0.7 phys at ×4 speed, step 2 m behind the target if it has its back turned | 36 | yes |
| `wa_piercing_bolt` | Delici Ok | `crossbow` / `bow` | data only (Phase 2 bases) | 1.0 s hold | hitscan 30 m pierce all: 3.0 phys | 40 | yes |
| `wa_dawn_wave` | Şafak Dalgası | `staff`/`wand` | Işık Çağıran (spec override) | 0.75 s | cone 8 m: allies +1.4×W heal, enemies 1.6 holy | 20 | yes |
| `wa_twin_vials` | Çift Şişe | `dagger` | Simyacı (spec override) | 0.75 s | two vials: one 2.0×W heal puddle, one 2.0 poison + slow | 20 | yes |

`SpecDef.weaponArt?: string` overrides the category art for healers. Weapon art data lives in `data/weaponArts.ts`.

### 3.9 Combo routes ("Kombo Yolları")

Timing reference (GDD_SYSTEMS §8.2, code `params.chain/move`): the **branch window** of step n opens at `hit + 0.05 s` and closes at `end + 0.35 s` of step n. A **branch** is: press-and-hold LMB inside the window; the heavy then replaces step n+1. Completing a route shows the small banner `ROTA: <ad>` and gives the `ComboCounter` one extra tier plus **+5% damage for 3 s**. Routes are data (`data/comboRoutes.ts`): `{ id, classId, name, inputs, windowFrom, windowTo, effect }`.

**Şövalye** (4-step chain: Çapraz, Yatay, Saplama (lunge), Balyoz finisher)

| id | TR | Input | Pencere | Sonuç / sayılar |
|---|---|---|---|---|
| `kn_r1` | Klasik | L L L L | standart | mevcut zincir, bitirici 2.0 + knockback 1.6 m |
| `kn_r2` | Kalkan Ezme | L L **H** | adım 2 penceresi | step 3 yerine `Ağır Darbe` 2.6 + holy burst r 1.5 m, poise 30, knockback medium |
| `kn_r3` | Hüküm Zinciri | L L L **H** | adım 3 penceresi | step 4 yerine kılıcı saplar: 3.4 holy, shockwave r 2.2 m, poise 60; 20 Kar. harcarsa +30% |
| `kn_r4` | Koşu Zinciri | **Koşu** L → L → H | koşu 0.45 s sonra | Koşu Hamlesi 1.4 → step 2 → heavy; her halka +5% |
| `kn_r5` | Karşılık | **Parry** → Riposte (L) → L → H | parry sonrası 1.6 s | Karşı Vuruş 3.5 + garantili kritik, sonra step 2'den devam |
| `kn_r6` | Yuvarlanma Hücumu | Dodge → L (0.30 s sonra) | roll penceresi | Yuvarlanma Kesiği 1.6 → step 3'ten devam (1–2 atlanır) |
| `kn_r7` | Gökten Hüküm | Jump + L → L | havada | Göksel Dalış 1.6 → step 1 |
| `kn_r8` | Kalkan İptali | L L L → **RMB** (hit + 0.10 s) → L | step 3 recovery | `Kalkan Darbesi` iptal-kombo → step 4 **Kırıcı** (+30% hasar, poise ×1.5) |

**Barbar**

| id | TR | Input | Sonuç / sayılar |
|---|---|---|---|
| `bb_r1` | Klasik | L L L L | mevcut zincir, bitirici 2.0 + impact AoE r 1.5 m |
| `bb_r2` | Kafa Yaran | L L **H** | `Kafa Yaran` 3.2, poise 40, heavy knockback |
| `bb_r3` | Kasırga Finali | L L L **H** | step 4 yerine 360° döner: 2.8 phys r 3.2 m, bleed 20% |
| `bb_r4` | Balta Atılışı | **Koşu** L → L | 4 m atılış 1.5 + kanama, step 2'ye devam |
| `bb_r5` | Kemik Kıran | **Parry** (weapon guard) → Riposte | 4.0 garantili kritik, poise 70 |
| `bb_r6` | Dönen Kesik | Dodge → L | 200° 1.6, step 3'e devam |
| `bb_r7` | Yer Çökertme | Jump + L | 2.0 AoE r 3.0 + toz halkası, poise 28 |
| `bb_r8` | Silah Sanatı | **H(tier 2)** | `wa_earthbreaker` (Kes) |

**Büyücü** (3-cast chain)

| id | TR | Input | Sonuç / sayılar |
|---|---|---|---|
| `mg_r1` | Klasik Salvo | L L L | 0.95, 0.95, 3×0.65 |
| `mg_r2` | Gizem Mızrağı | L L **H** | `Yüklü Gizem Oku` 2.8 + splash 0.8 |
| `mg_r3` | Çapraz Atış | Dodge → L | roll sonrası 3 delici 1.2 |
| `mg_r4` | Karşı Büyü | **Parry** → (projectile deflect) → Riposte | 3.0 garantili kritik |
| `mg_r5` | Süzülen Salvo | Jump + L | gravity ×0.15, 3×0.8 |
| `mg_r6` | Buz Mızrağı Zinciri | Buz Halkası → **Buz Mızrağı** ×3 | donmuş hedefte ×3 (§1.3.5) |
| `mg_r7` | Termal Şok | Buz yığını → **Ateş Topu** | +40% DAHA FAZLA + buhar patlaması |
| `mg_r8` | Silah Sanatı | **H(tier 2)** | `wa_starfall_beam` / `wa_twin_bolts` (Kes) |

**Haydut** (4-step chain)

| id | TR | Input | Sonuç / sayılar |
|---|---|---|---|
| `rg_r1` | Klasik | L L L L | mevcut zincir, bitirici kanama 25% |
| `rg_r2` | Hançer Fırtınası | L L **H(tier 2)** | `wa_flurry` 6×0.7 (Kes) |
| `rg_r3` | Kayan Bıçak | **Koşu** L → L | 4 m kayış 1.1, +1 Kombo |
| `rg_r4` | Gölge Karşılığı | **Parry** → Riposte | arkaya ışınlanır, 4.0 garantili kritik, +2 Kombo |
| `rg_r5` | Kuş Saldırısı | Jump + L | 1.7, +2 Kombo |
| `rg_r6` | Arkadan Dönüş | Dodge → L | arkaya döner, sonraki vuruş Arkadan sayılır |
| `rg_r7` | Gölge Dörtlüsü | (arkadan) L L L L | tüm adımlarda ×1.3 Arkadan, finisher +25% |
| `rg_r8` | Pusu Zinciri | Gölge Adımı → **Sırttan Bıçak** → İnfaz | Suikastçı: 3 s içinde kesin kritik + 2 Kombo |

**Skill combos kept from ARCHITECTURE** (unchanged numbers, now also counted for the `ComboCounter`): Charge → Shield Bash stun → Whirlwind; Frost Nova freeze → Ice Lance shatter; Backstab from stealth crit.

### 3.10 Dodge, i-frames, hyper-armor summary

| Action | I-frames | Hyper-armor / unstoppable | Cancelable by dodge |
|---|---|---|---|
| Dodge roll | 0.04–0.34 s (existing) | – | – |
| Perfect dodge | existing (+30% damage 2 s) | – | – |
| Light chain steps | none | none | yes after the hit (existing) |
| Heavy tier 1 | none | none | until release |
| Heavy tier 2 / weapon art | none | from release to `hit + 0.10 s` (hits < 20% max HP) | until release |
| Parry window | 0.20 s of **parry** (hit negated) | – | yes |
| Riposte / Kritik Vuruş | first 0.35 s / 0.6 s | yes | no |
| Guard | – | – | yes |
| Class skills | per existing tables (leaps, `iframes` where stated) | `unstoppable` param where stated | per existing |

### 3.11 Feel table (hit-stop, shake, VFX, SFX) — copy into `combat/feel.ts` as the new `FEEL` entries

| Action | Hit-stop (ms) | Trauma | Extra | VFX id (new unless noted) | SFX id |
|---|---:|---:|---|---|---|
| Light hit 1/2 | 40 (existing) | 0.06 | – | `slash_arc` (existing) | `swing_light` |
| Light finisher | 70 | 0.12 | existing | `slash_arc_big` | `swing_heavy` |
| Heavy tier 1 hit | 85 | 0.20 | enemy flinch if trash | `heavy_hit_burst` | `heavy_hit` |
| Heavy tier 2 / weapon art | 110 | 0.32 | `camera:punch fov −3` | `weapon_art_<id>` | `weapon_art` |
| Charge tick (tier up) | – | – | weapon rim flash, 40 ms | `charge_glow`, `charge_ring` | `charge_loop`, `charge_full` |
| Running attack | 55 | 0.12 | dust trail | `run_slash_trail` | `swing_heavy` |
| Jump attack landing | 90 | 0.30 | dust ring | `ground_slam` (existing) | `ground_slam` |
| Roll attack | 55 | 0.12 | – | `slash_arc` | `swing_light` |
| Guard hit (blocked) | 50 | 0.12 | spark on the guard | `guard_spark` | `guard_hit` |
| Guard break | 110 | 0.40 | player stagger, shards | `guard_break_shards` | `guard_break` |
| **Parry** | 120 | 0.25 | white flash 40 ms, 0.5× time for 0.12 s | `parry_flash` (star burst) | `parry` (ring + bell) |
| **Riposte** | 140 | 0.35 | `camera:punch fov −5` | `riposte_trail` | `riposte` |
| Backstab hit | 80 | 0.18 | green mark | `backstab_mark` | `backstab` |
| **Poise break** | 100 | 0.35 | enemy shards, gold text | `stance_break_shards` | `stance_break` (glass + gong) |
| **Kritik Vuruş** | 160 | 0.55 | slow-mo 0.35× 0.22 s, `camera:punch fov −9` | `crit_finisher_slash` | `crit_finisher` |
| Perilous warning | – | – | red glyph over enemy, screen-edge pulse | `perilous_mark` | `perilous_warn` |
| Kes (interrupt) | 60 | 0.10 | gold "KESİLDİ!" | `interrupt_burst` | `interrupt` |

Rules: hit-stop is applied **once per swing** (max of targets), capped at 120 ms per 0.3 s window (GDD_SYSTEMS §8.3) — **except** Kritik Vuruş (160 ms, uncapped, exclusive). Remote players' actions never hit-stop your character. All camera effects respect the "Ekran sarsıntısı" slider.

### 3.12 Data and code contracts for the combat/enemies owners

**`EnemyDef` additions (all optional; defaults by rank × family):**

```ts
poise?: number;          // max poise (overrides the rank default)
poiseRegen?: number;     // fraction of max per second after the delay (default 0.10)
poiseDelay?: number;     // seconds without poise damage before regen (default 3)
hyperArmor?: number;     // 0..1 fraction of each windup that cannot be flinched
stanceBreakable?: boolean; // false = poise bar hidden, only flinches (floating orbs, cages)
backstabbable?: boolean; // default true
family?: FamilyId;       // §7 (default resists/weaknesses come from the family)
profile?: 'bruiser'|'buster'|'cleaver'|'ranged_focus'|'aoe_pulse'|'stacker'; // §1.7
```

**`EnemyAbility` additions:** `parryable?: boolean` (default `true` for `melee`/`cone`/`charge` basic swings, `false` for projectile/ground/self AoE/summon/custom), `perilous?: boolean` (can neither be parried nor guarded; dodge only; red glyph during the windup; implies `blockable: false`), `kick?: 0 | 1 | 2` (interrupt priority: 0 none, 1 medium, 2 HIGH; mirrors the roster's "interrupt priority" column), `tankBuster?: boolean`.

**`IncomingHit` additions:** `parryable?: boolean`, `perilous?: boolean`, `melee?: boolean` (for `squishyMult` and guard rules). `HitShapeSpec` carries the same flags (replicated).

**Authority:** parry/block/dodge are resolved by the **victim's** peer in `hitLocalPlayer` (new step 0 before dodge): `if (p.parryOpen && hit.parryable !== false && !hit.unavoidable && !hit.perilous) → parried`. A successful parry sends `G.net.sendRequest('parry', { enemyId, poise })`; the host applies `Combat.applyParry(enemy, poise, parryerId)` (poise damage + `parried` recoil). Poise damage dealt by players travels in `hit.poise?: number` (appended to the `hit` channel payload and `ApplyDamageOpts`). The host owns the poise bar, the break and the `marked_crit` status (replicated through `estatus`).

**Player state machine** (`PlayerController` / `SkillSystem`; states in priority order): `finisher > riposte > weaponArtRelease > heavyRelease > charge > light(n) > rollAttack > runAttack > jumpAttack > guard(parryWindow) > skill > dodge > move`. Transition rules: dodge cancels everything except `finisher`, `riposte` (first 0.35 s), `weaponArtRelease` after release and dashes; skills cancel `charge`/`guard`/`light` recovery as in GDD_SYSTEMS §8.1; `guard` cannot start during `heavyRelease`/`finisher`.

**Input buffering:** unchanged (0.25 s, last input wins). The hold test for LMB runs from the press timestamp; releasing before 0.28 s queues a normal light attack.

**New events:** `parry { enemyId, perfect }`, `riposte { targetId }`, `poise:break { enemyId }`, `crit:finisher { targetId, damage }`, `guard:broke {}`; `camera:punch { fov, in, out }`.

**Implementation priority inside the combat package** (user priority is feel): (1) heavy charge + tier VFX/SFX, (2) guard + parry + riposte + hit-stop/slow-mo, (3) poise break + Kritik Vuruş + camera punch, (4) running/jump/roll attacks, (5) backstab, (6) weapon arts + Kes, (7) combo routes + banner.

---

## 4. Path of Exile systems, adapted

Four PoE pillars are added **on top of** the existing PoE-like passive tree, Efsun items and item gems: (4.1) support-gem sockets, (4.2) flasks with kill-fed charges, (4.3) currency orbs, (4.4) "map-like" modifiers on keystones. Design rule: PoE depth, Diablo/Metin2 readability — every system has **one panel, one drop source table and ≤ 12 base items**.

### 4.1 Destek Rünleri (support runes) — the "gem" system

**Decision:** PoE links are replaced by **skill rune sockets** that live **on the skill**, not on items (item sockets keep the Metin2 gems of GDD_SYSTEMS §5.5). This keeps loot readable, avoids 6-link gear checks and lets a skill's build be swapped at the skill book.

| Rule | Value |
|---|---|
| Sockets | each skill in the 8 bar slots (`lmb rmb q e s1 s2 s3 r`) has **2 rune sockets** (`lmb` = basic chain, applies to every step and the heavy). Majors (`m45/m90`) have **1** socket (only `empower`, `cooldown`, `efficiency`, `inspiration` fit). The `m180` has none |
| 3rd socket | Kadim Levha node "Rün Çekirdeği" (§5.3): +1 socket on a chosen skill, **max 3 skills** with 3 sockets |
| Storage | `CharacterSave.skillRunes: Record<skillId, (string \| null)[]>` keyed by skill id (swapping a skill off the bar keeps its runes). Runes are **stackable materials** `rune_<name>_<rank>` in the pouch; socketing moves one, removing returns it (free, any time out of combat) |
| Ranks | 1 **Çırak**, 2 **Usta**, 3 **Kadim**. Combine **3 × same rune & rank → 1 of the next rank** at the Demirci "Rünler" tab: 1→2 1,000 gold + 2 Büyülü Toz; 2→3 10,000 gold + 8 Büyülü Toz |
| Unlock | runes drop from L15; the panel opens at L15 (together with gem combining) |
| Limits | one copy of a given rune per skill; a rune whose `needs` do not match the skill's tags is **greyed** and cannot be socketed; `Vahşet` and the ailment runes exclude each other |
| Stacking | all `more` values multiply; "gain as" values add before the pipeline; rune numbers are scaled by `1 + S.runeEffectPct` |
| Cost rule | **`Maliyet ×`** multiplies the skill's resource cost (`cost`). Skills with **no** cost (basic chain) convert it to **attack time**: `swingTime × (1 + (costMult − 1) × 0.5)`. Skills with a cooldown and no cost convert it to **+0.5 × (costMult − 1)** on the cooldown |
| Implementation | `resolveSkill(def, player)` returns a **derived `SkillDef` copy** with rune modifiers applied (projectile count, pierce, chain, radius, cooldown, cost, castTime, params); cached until runes/stats change. `Combat.rollOutgoing` reads `more`/`gainAs` from `def.params.rune*` fields. No other module needs to know about runes |

**Derived tag rules** (so every skill can be matched without touching 60 skill defs). From `SkillDef` the SkillSystem computes tags: `attack` (class knight/barbarian/rogue weapon skills, any skill with tag `melee`), `spell` (class mage skills), `projectile` (`targeting === 'projectile'` or tag), `aoe` (`self_aoe`/`ground_aoe`/`leap` or radius ≥ 2 or tag), `dot` (tag `dot`, `damage.perTick`, ticking statuses), `channel` (`channel > 0`), `movement` (`dash`/`leap`/`teleport`), `buff` (`self_buff`/`summon`/`aura`/`shout`/`banner`/heal), `damaging` (has `damage`), `melee`, `basic`, `ultimate`, `major`, and the damage-type tag (`physical fire frost lightning shadow poison holy arcane`).

**The 24 runes** (values rank 1 / 2 / 3; "Maliyet ×" see cost rule)

| # | id | TR | Needs (any-of) | Rank 1 / 2 / 3 | Maliyet × |
|---|---|---|---|---|---:|
| 1 | `sup_multishot` | Çoklu Atış | projectile | +2 / +2 / +3 mermi (yelpaze ±12°); hasar ×0.75 / ×0.80 / ×0.80 | 1.30 |
| 2 | `sup_chain` | Zincir | projectile, beam | +1 / +2 / +2 zincirleme (en yakın düşman ≤ 8 m, aynı hedefe iki kez değil); her zincirde hasar ×0.90 | 1.20 |
| 3 | `sup_pierce` | Delme | projectile | +2 / +3 / +4 delme | 1.10 |
| 4 | `sup_added_fire` | Eklenmiş Ateş | damaging | hasarın %20 / 25 / 30'u ek ateş olarak; yanma şansı +%15 | 1.20 |
| 5 | `sup_added_frost` | Eklenmiş Buz | damaging | hasarın %20 / 25 / 30'u ek buz olarak; %35 / 45 / 55 şansla +1 Üşüme | 1.20 |
| 6 | `sup_added_poison` | Eklenmiş Zehir | damaging | hasarın %20 / 25 / 30'u ek zehir olarak; %30 / 40 / 50 şansla +1 Zehir yığını | 1.20 |
| 7 | `sup_area` | Genişletilmiş Alan | aoe | yarıçap +%20 / 25 / 30; hasar ×0.90 / 0.92 / 0.94 | 1.15 |
| 8 | `sup_concentrate` | Yoğunlaşma | aoe | yarıçap −%30; hasar ×1.40 / 1.45 / 1.50 | 1.25 |
| 9 | `sup_fast_cast` | Hızlı Döküm | attack, spell (not channel) | bu becerinin hızı +%20 / 25 / 30 | 1.25 |
| 10 | `sup_lifeleech` | Can Emici | damaging | verilen hasarın %3 / 4 / 5'i can (ortak 1 s sınırı: maks. canın %10'u) | 1.20 |
| 11 | `sup_culling` | Kıyım | attack, spell | boss olmayan düşmanlar %10 / 12 / 15 canın altında anında ölür (Seçkin: yarı eşik; boss: hiç) | 1.20 |
| 12 | `sup_crit` | Artan Kritik | damaging | kritik şansı ×1.5 / 1.6 / 1.7; kritik hasarı +%10 / 15 / 20 | 1.20 |
| 13 | `sup_brutality` | Vahşet | physical | fiziksel hasar ×1.30 / 1.35 / 1.40; **kanama/zehir/yanma/üşüme uygulayamaz** | 1.15 |
| 14 | `sup_efficiency` | Verimlilik | any with cost | kaynak maliyeti ×0.70 / 0.65 / 0.60; hasar ×0.85 / 0.87 / 0.89 | (kendisi) |
| 15 | `sup_fast_proj` | Hızlı Mermi | projectile | mermi hızı +%40 / 50 / 60; hasar ×1.10 / 1.12 / 1.15 | 1.10 |
| 16 | `sup_cooldown` | Kısa Bekleme | skill with CD ≥ 3 s | bekleme ×0.80 / 0.75 / 0.70; rank 3: şarjlı becerilerde +1 şarj | 1.25 |
| 17 | `sup_ruthless` | Acımasız | attack, melee, basic | her 3. kullanımda hasar ×1.40 / 1.50 / 1.60 ve duruş hasarı ×1.5 | 1.20 |
| 18 | `sup_stagger` | Sarsıcı | attack, melee | duruş hasarı ×1.40 / 1.50 / 1.60; Sıradan'lara +%25 sendeletme şansı | 1.10 |
| 19 | `sup_bleed` | Kanatıcı | physical attack | vuruşta %25 / 33 / 40 şansla kanama (vuruşun %100'ü, 4 s); kanama hasarı ×1.20 | 1.15 |
| 20 | `sup_echo` | Yankı | spell, attack (not channel/dash) | 0.35 s sonra bedavaya bir kez tekrar eder: hasar ×0.55 / 0.60 / 0.65 | 1.30 |
| 21 | `sup_decay` | Çürüme | dot | zamanla hasar ×1.25 / 1.30 / 1.35; DoT süresi −%20 | 1.10 |
| 22 | `sup_inspiration` | İlham | any | isabette +1.5 / 2 / 2.5 kaynak (saniyede en çok 3 kez); maliyet ×0.90 | (kendisi 0.90) |
| 23 | `sup_empower` | Kudret | buff, aura, shout, banner, zone | süre +%25 / 30 / 35; etki gücü +%15 / 18 / 22 | 1.20 |
| 24 | `sup_pursuit` | Takipçi | movement | bekleme ×0.80 / 0.75 / 0.70; kullanım sonrası 3 s içinde ilk saldırı +%25 / 30 / 35 hasar | 1.15 |

Rune item names: `"{rankTr} {nameTr} Rünü"` (e.g. "Usta Zincir Rünü"). Icons: `/assets/icons/rune-<name>.svg` (generate 24 PSX-style 32 px icons; colour = tag family: orange projectile, blue aoe, red attack, purple spell, green utility).

**Sources and drop rates (personal loot; add `runeChance` / `runeRank` to `DropTable`)**

| Source | Chance of ≥ 1 rune | Count | Rune pick |
|---|---:|---|---|
| Sürü | 0.1% | 1 | 24 uniform; 50% weight bonus to runes usable by the looter's class tags |
| Sıradan | 0.4% | 1 | same |
| Seçkin | 6% | 1 | same |
| Ara Patron | 20% | 1 | same |
| Patron | 55% | 1–2 | same |
| M+ boss | 40% | 1 | same |
| M+ chest (timed) | 100% | 2 + ⌊key/5⌋ | same |
| Raid boss | 100% | 1 / 2 / 2 (N / K / M) | same |
| Mühürdar | – | – | 20 Av Mührü: pick one **Çırak** rune |

Rank by source level: < 30: rank 1 only; 30–44: 80/20/0; 45–59: 55/40/5; 60 (non-M+): 45/45/10; M+ key ≥ 10: 25/55/20; raid Mitik: 10/55/35 (% rank 1/2/3).

**Panel (`skills`, tab "Rünler")**: left = the 8 bar skills + majors (icon, name), centre = the selected skill's icon with 2–3 socket rings (drag a rune in; hover shows the **resulting numbers** "Hasar ×0.84 · Mermi +2 · Maliyet ×1.30"), right = rune inventory (filter: compatible only, rank, search). Right-click a socket removes. The skill tooltip lists active runes.

### 4.2 Şişeler (flasks)

**Şişe Kemeri:** 5 flask slots (`CharacterSave.flasks: (ItemInstance | null)[5]`, current charges in `CharacterSave.flaskCharges: number[5]`), keys `6 7 8 9 0` (`flask1..5`). Flasks are **items** (`ItemCategory 'flask'` NEW) found as loot and sold by the Simyacı NPC; they are **not** potions (potions on 4/5 stay untouched, shared 10 s / 15 s cooldown).

| Rule | Value |
|---|---|
| Use | press → if `charges ≥ useCharges`: consume, apply the effect, 0.5 s internal cooldown on that slot. Same-type effects **refresh** (never stack). Below the cost: toast "Yeterli şarj yok" + flash |
| Tiers (`itemLevel` gates) | **Küçük** (ilvl 1–19), **Orta** (20–39), **Büyük** (40–59), **Kadim** (60+): scales max charges and magnitudes (table) |
| Rarities | Normal (0 affixes), Büyülü (1 affix: prefix or suffix), Nadir (1 prefix + 1 suffix). No epic/legendary flasks |
| Charges gained | per kill within 40 m of the player: Sürü **0.3**, Sıradan **1**, Seçkin **4**, Ara Patron **10**, Patron **15**; critical hit on an elite or higher **+0.5** (ICD 1 s); picking a **Can Küresi +3** (all five flasks); the Kadim Levha / aspect `asp_flask_lord` and `S.flaskGainPct` scale gains. Overflow is lost |
| Passive refill | none in combat. **Şişe Çeşmesi** in town (free, instant). Dungeon/raid entry and M+ countdown end: all flasks full |
| Persistence | charges persist in the save |
| Net | flask effects are local buffs (status on the player, broadcast through `pstate.statuses` for visuals only) |

**12 bases** (`data/flasks.ts`; `max` = max charges Küçük / Orta / Büyük / Kadim; `use` = charges per use; duration Küçük→Kadim)

| id | TR | min ilvl | max | use | Effect (Küçük → Kadim) | Duration |
|---|---|---:|---|---:|---|---|
| `flask_life` | Can Şişesi | 1 | 40 / 50 / 60 / 70 | 25 | heals **35 / 45 / 55 / 65%** max HP (60% instantly, rest over the duration); removes bleed | 3 s |
| `flask_mana` | Ruh Şişesi | 1 | 40 / 50 / 60 / 70 | 25 | restores **35 / 45 / 55 / 65%** of the max resource (Öfke: adds 25 / 32 / 40 / 48 Öfke) | 3 s |
| `flask_hybrid` | Karma Şişe | 5 | 40 / 45 / 50 / 55 | 25 | **25 / 30 / 35 / 40%** HP and the same % resource | 4 s |
| `flask_quicksilver` | Cıva Şişesi | 10 | 40 | 20 | +30% move speed; removes slow/root | 4 / 5 / 6 / 7 s |
| `flask_granite` | Granit Şişesi | 15 | 40 | 30 | +60% armour, +10 pp block chance | 4 / 5 / 6 / 7 s |
| `flask_ruby` | Yakut Şişesi | 20 | 40 | 30 | +40 pp fire resist, immune to Yanma (removes it) | 5 / 6 / 7 / 8 s |
| `flask_sapphire` | Safir Şişesi | 20 | 40 | 30 | +40 pp frost resist, immune to Üşüme/Donma | 5 / 6 / 7 / 8 s |
| `flask_emerald` | Zümrüt Şişesi | 20 | 40 | 30 | +40 pp poison resist, immune to Zehir (removes it) | 5 / 6 / 7 / 8 s |
| `flask_amethyst` | Ametist Şişesi | 20 | 40 | 30 | +40 pp shadow resist, immune to Korku/Körlük | 5 / 6 / 7 / 8 s |
| `flask_basalt` | Bazalt Şişesi | 25 | 40 | 30 | −25% physical damage taken, unstoppable | 4 / 5 / 6 / 7 s |
| `flask_diamond` | Elmas Şişesi | 30 | 40 | 35 | +20 pp critical chance | 4 / 5 / 6 / 7 s |
| `flask_silver` | Gümüş Şişe | 40 | 40 | 35 | +25% attack and cast speed | 4 / 5 / 6 / 7 s |

**Flask affixes** (`data/flasks.ts`, `FlaskAffixDef`; rolled uniformly in range; Büyülü = one random affix of either kind, Nadir = one prefix + one suffix)

| id | Kind | TR | Effect | Range |
|---|---|---|---|---|
| `fl_pre_capacity` | prefix | Geniş | max charges | +20–40% |
| `fl_pre_efficient` | prefix | Tutumlu | charges used per use | −15–30% |
| `fl_pre_potent` | prefix | Yoğun | effect strength (heal amount, magnitude) | +20–40% |
| `fl_pre_swift` | prefix | Seri | life/resource flasks recover **faster** (duration) | −40–60% |
| `fl_pre_gain` | prefix | Doyurucu | charges gained | +25–50% |
| `fl_pre_crit` | prefix | Kanlı | +1 charge per critical hit on any enemy (ICD 0.5 s) | fixed |
| `fl_suf_unstoppable` | suffix | Dayanıklılık | during the effect: unstoppable (no stagger/knockback/stun) | fixed |
| `fl_suf_resist` | suffix | Soğukkanlılık | +all resist during the effect | +10–20 pp |
| `fl_suf_haste` | suffix | Rüzgâr | +move speed during the effect | +10–20% |
| `fl_suf_lifesteal` | suffix | Susuzluk | +life steal during the effect | +2–4% |
| `fl_suf_damage` | suffix | Öfke | +damage during the effect | +8–15% |
| `fl_suf_shield` | suffix | Siper | on use: absorb (6 s) | 8–12% max HP |
| `fl_suf_cleanse` | suffix | Arınma | on use: removes dispellable debuffs | 1–2 |
| `fl_suf_resource` | suffix | Kaynak | on use: +resource | +10–15 |

Names: Normal "Orta Can Şişesi"; Büyülü "Geniş Orta Can Şişesi"; Nadir "Doyurucu Büyük Can Şişesi (Rüzgârın)". Flasks can take the **Kaos / Yüceltme / Arınma** orbs (not Bozulma, not Efsun). Sold by the Simyacı NPC (Normal Küçük/Orta 300 / 1,200 gold, Büyük 5,000, Kadim 20,000), drop from Seçkin+ (Sıradan 0.3%, Seçkin 4%, Patron 25%, chest 1).

**HUD:** 5 `sm` slots right of the potions: liquid fill = charges %, key label, pulse on a charge gain, grey below `use`; tooltip shows base, tier, affixes, charges/max, effect; right-click in the inventory equips to the first empty slot.

### 4.3 Küreler (currency orbs) and how they coexist with Efsun / upgrades / sockets

**Principle:** Metin2 layers (+N upgrade, Efsun, sockets, Oyma) stay exactly as they are; the **orbs are a second, faster affix-crafting layer** with different verbs. The new **Zanaat** tab on the `blacksmith` panel hosts them (item slot, orb list, "Olası sonuçlar" preview, no undo).

| id | TR | Effect (exact) | Applies to | Relationship to the existing item |
|---|---|---|---|---|
| `orb_chaos` | **Kaos Küresi** | rerolls **ONE random non-locked affix** (type and value, tier gates by ilvl) | Büyülü/Nadir/Destansı (and flasks) | cheap, frequent. **`efsun_nesnesi` stays the "reroll ALL" tool** (expensive, 8,000 gold). `efsun_kilidi` locks protect against **both** |
| `orb_exalt` | **Yüceltme Küresi** | adds **1 random affix with tier ≤ T3** (T3/T2/T1/T0 weighted 40/35/20/5) | Nadir/Destansı below their affix cap; **once per item** (`exalted` flag) | premium counterpart of `takviye_nesnesi` (random tier, any count) |
| `kadim_efsun` (UI name **İlahi Küre**) | **İlahi Küre** | rerolls **numeric values only** inside the current tiers | any item with affixes | same item/id as today, only the UI/tooltip name and icon change — no code migration |
| `orb_chance` | **Şans Küresi** | Normal item → random rarity: Büyülü 62%, Nadir 30%, Destansı 7%, Efsanevi (Aspektli, §5.1) 1% | Normal items only | pairs with the Takviye logic; Efsanevi gets a random aspect of the item's slot group |
| `orb_annul` | **Arınma Küresi** | removes **1 random non-locked affix** | Büyülü+ | the "undo" tool; unlocked affixes only |
| `orb_alchemy` | **Simya Küresi** | Normal → **Nadir with 4 random affixes** | Normal items | like `takviye` but skips straight to rare |
| `orb_corrupt` | **Bozulma Küresi** | irreversible; outcomes: 30% nothing (still tagged `corrupted`), 25% values rerolled (−10% … +20% of each), 20% +1 socket (above the base max), 15% a random extra implicit (+3–8% damage or +3–8% max HP), 10% **upgrade ceiling +1** (max +16, +N upgrades continue) | Nadir+, **non-corrupted** | endgame gamble. `corrupted` items refuse every orb and Efsun item afterwards, but **keep** blacksmith +N upgrades and gem sockets |

General rules:
- No orb touches **+N upgrade level, sockets/gems, `bound`, `uniqueId` special, set bonus**. Named legendaries (`leg_*`) only accept `kadim_efsun` and `efsun_nesnesi` (random line only, as today). **Aspektli Efsanevi** accept all orbs; the aspect always stays (Arınma never removes it).
- Affix rolls respect the tier gates (T0 only in M+ ilvl ≥ 72), "smart affix" 50% bias and slot filters (GDD_SYSTEMS §4.5). Flasks use `FlaskAffixDef` pools.
- Orbs are stackable materials (`CharacterSave.materials`), 9,999 stack, vendor sell price: Kaos 20, Şans 40, Simya 60, Arınma 150, Yüceltme 800, İlahi 600, Bozulma 1,000 gold.
- Acquisition (non-drop): **Mühürdar** (Av Mührü): Kaos 4, Şans 6, Simya 8, Arınma 18, Yüceltme 45, İlahi 35, Bozulma 60. **Simyacı NPC (gold, max 20/day):** Kaos 2,500, Şans 4,000.

**Drop rates** (per player, personal loot; % chance of ≥ 1 drop; "(n)" = count; M+ values scale with key `k`)

| Source | Kaos | Şans | Simya | Arınma | Yüceltme | İlahi | Bozulma |
|---|---:|---:|---:|---:|---:|---:|---:|
| Sürü | 0.05 | 0.02 | 0.01 | 0.005 | 0 | 0 | 0 |
| Sıradan | 0.25 | 0.10 | 0.05 | 0.02 | 0.002 | 0.001 | 0 |
| Seçkin | 6 | 3 | 1.5 | 1 | 0.4 | 0.3 | 0.05 |
| Ara Patron | 20 | 10 | 6 | 4 | 1.5 | 1 | 0.3 |
| Patron (dungeon) | 60 (1–2) | 30 | 20 | 12 | 5 | 4 | 1 |
| M+ boss | 45 (1–2) | 20 | 15 | 15 | 8 | 6 | 2 |
| M+ end chest (timed) | 100 (2 + ⌊k/4⌋) | 40 | 30 | 35 | 15 + 1·k (cap 45) | 20 | 4 + 0.5·k |
| M+ end chest (depleted) | 100 (1) | 20 | 15 | 15 | 5 | 8 | 1 |
| Raid boss N / K / M | 100 (2 / 3 / 3) | 40 / 50 / 60 | 30 | 40 / 50 / 60 | 15 / 25 / 40 | 20 / 30 / 40 | 3 / 6 / 10 |
| Efsun Goblini (§5.4) | 100 (3–5) | 20 | 20 | 60 | 30 | 30 | 5 |
| Günlük Sandık | 40 | 20 | 10 | 10 | 2 | 5 | 0 |

Efsunlu Yarık (seasonal M+ affix) guardians drop 1 Kaos + 10% Yüceltme to every player when killed in time (adds to the table).

### 4.4 Mühürler (map-like keystone modifiers)

A **Mühür** is a consumable (`seal_*` material) slotted **beside the Kadim Anahtar Taşı** at the Kehanet Taşı to add **risk and reward** to one Mythic+ run. This is the PoE map-mod loop on the existing keystone.

| Rule | Value |
|---|---|
| Points budget | key +2–+6: **2 points**; +7–+11: **4**; +12 and above: **6**; max **3** seals per key. Each seal costs 1–3 points |
| Score | a timed run gains **+2% score per point used** (cap +12%); stored in `RunRecord.seals` and shown in the breakdown (§8.8) |
| Consumption | consumed when the countdown starts, even if the run is abandoned |
| Net | chosen at the ready-check by the key owner; `DungeonParams.seals: string[]` / `RunState.seals?: string[]`; the host applies enemy-side mods, every peer applies its own player-side mods and rolls its own chest bonuses |
| Sources | M+ end chest (timed ≥ +5): 1 random seal; M+ boss (key ≥ 6): 12% each; Mühürdar 25 Av Mührü; raid Mitik chest 30% |
| UI | `keystone` panel: a "Mühür" row with 3 slots, tooltip lines "Risk" (red) and "Ödül" (green), a points counter "2 / 4 puan" |

| id | TR | Pts | Risk (enemy/player side) | Reward |
|---|---|---:|---|---|
| `seal_wrath` | Gazap Mührü | 2 | enemy damage +25% | currency drop counts ×2; each boss +15% chance of an extra `orb_exalt` |
| `seal_bulwark` | Kalın Deri Mührü | 2 | enemy HP +25% | chest Nadir+ weight +30%, Efsanevi weight +15% |
| `seal_haste` | Çevik Mühür | 2 | enemy move/attack speed +20% | +1 random Rün (rank ≥ 2) per boss |
| `seal_champions` | Şampiyonlar Mührü | 2 | 3 champion packs (1–2 mods each, §5.2) return | each champion drops +1 Nadir+ item and 25% an orb |
| `seal_pressure` | Zaman Baskısı Mührü | 3 | timer −10% | `orb_chance` drops ×2 |
| `seal_dread` | Ölüm Kokusu Mührü | 1 | death penalty 15 s → 30 s | chest gold ×2, Ruh Taşı +2 |
| `seal_gloom` | Kör Karanlık Mührü | 1 | fog far −40%, nameplates hidden beyond 25 m, minimap radius −30% | chest Büyülü/Nadir weights +25% |
| `seal_ensorcell` | Efsunlu Mühür | 3 | all damaging affix params ×1.3 (volcanic, quaking, storming, explosive, bursting...) | chest +1 guaranteed `orb_exalt` |
| `seal_rot` | Çürüme Mührü | 2 | healing received −20% | Aspektli Efsanevi weight ×2 in the chest |
| `seal_armored` | Zırhlı Mühür | 2 | enemy armour/phys resist +40%, poise ×1.5 | chest item ilvl +2, extra socket chance +20% |
| `seal_drought` | Kuraklık Mührü | 1 | flask gain −50%, no Can Küresi | all orb drops ×1.5 |
| `seal_trapped` | Tuzaklı Mühür | 2 | every 12 s a plume under a random player (r 2 m, 1.5 s warning, 20% max HP) | +3 Kadim Toz (`ancient_dust`, Kadim Levha glyph material) per boss |
| `seal_golden` | Altın Mühür | 1 | enemy HP and damage +10%; a guaranteed Hazine Goblini in a cleared room | chest gold ×3 |
| `seal_swarm` | Sürü Çağrısı Mührü | 1 | +25% swarm members per pack (extras give 0 forces) | Katliam XP ×2, flask gains ×2 |

Seal text example (`desc`): "Düşmanlar %25 daha fazla hasar verir. Ödül: para birimi düşüşleri iki katına çıkar." The Efsunlu Yarık seasonal affix works unchanged with seals.

---

## 5. Diablo systems

Four Diablo pillars: (5.1) legendary **Aspektler** (extract / imprint, ~30 aspects that modify skills), (5.2) **Elit Efsunları** (15 monster mods for elite/champion packs), (5.3) **Kadim Levha** (paragon-like board after level 60), (5.4) refined **Hazine/Cevher/Efsun Goblinleri**. They sit on top of the existing uniques (`leg_*`), 4 old sets, Efsun items and the 125-node passive tree.

### 5.1 Aspektler (legendary aspects)

**Model (OVERRIDE O9):** a legendary drop is now **Aspektli Efsanevi** (70%) or a **named unique `leg_*`** (30%, unchanged: fixed lines + fixed unique effect, not extractable). An Aspektli Efsanevi is a rolled item on a normal base (`rarity: 'legendary'`) with `ItemInstance.aspectId` and `aspectRoll` (0–1). Orange name "{Aspekt adı} {Baz adı}", orange beam, same loot sounds. Legendary pity (GDD_SYSTEMS §7.2) counts both kinds.

| Rule | Value |
|---|---|
| Roll at drop | `aspectRoll = rng()`; items from M+ with ilvl ≥ 72 use `max(roll, 0.25)`; raid Mitik `max(roll, 0.40)` |
| Slot groups | `off` weapon, offhand dagger, gloves, ring1, ring2 · `def` chest, legs, shoulders, offhand shield · `util` helm, belt, amulet, offhand tome · `mob` boots. An aspect can only roll on / be imprinted onto its group |
| Class weighting | 70% of aspect picks prefer aspects whose hook matches the looter's class/skill tags (generic aspects are always eligible) |
| **Extract** | at **Kâtip Hakan** (NEW town NPC, panel `codex`, "Kadim Kodeks"): destroy one Aspektli Efsanevi → `CharacterSave.codex[aspectId]` stores the **best roll seen**; returns 3 Kadim Toz (`ancient_dust`). Named uniques cannot be extracted |
| **Imprint** | pick an aspect from the codex + a **Nadir or Destansı** item of a matching slot group: cost **15,000 + 500 × ilvl** gold, 1 Ruh Taşı, 5 Kadim Toz. The item becomes `legendary`, keeps its affixes (an Epic loses its **lowest-tier** affix, so max 4), gets `aspectId`/`aspectRoll = codex roll`, becomes `bound` (Ruha Bağlı). Re-imprint = pay again, old aspect lost |
| Polish | in the codex: raise a codex roll by **+5 pp for 10 Kadim Toz** (cap 100%, cost +5 dust per 25 pp already above 50%) |
| Value | `value = min + (max − min) × roll` for every number shown as (a–b) |
| Hook | each aspect is a `special` id equal to its `asp_*` id, read through `G.character.hasSpecial / specialParams` like uniques; the combat/skill owners implement hooks by **tag** |

**The 30 aspects** (`data/aspects.ts`). Group: `off` / `def` / `util` / `mob`. Class column "—" = any class.

| # | id | TR | Group | Class | Effect (a–b = min–max by roll) |
|---|---|---|---|---|---|
| 1 | `asp_cleaving` | Yarıcı | off | — (melee) | melee-arc skills: arc +20% and range +(0.4–0.8) m; each enemy hit beyond the first adds +(3–5)% damage (max 6 enemies) |
| 2 | `asp_piercing_light` | Delici Işık | off | — (projectile) | projectile skills: +(1–2) pierce; each enemy pierced gives the next hit +(8–12)% damage (max +40%) |
| 3 | `asp_conflagration` | Alev Zinciri | off | — (fire) | Yanma spreads every 2 s with (40–60)% chance to the nearest enemy within 3 m; burning enemies that die spread it automatically |
| 4 | `asp_frostbite` | Ayaz Isırığı | off | — (frost) | at 5 Üşüme stacks the target becomes **Kırılgan** instead of freezing: takes +(25–35)% damage for 4 s (freeze-immune targets too) |
| 5 | `asp_venomous` | Zehir Dolu | off | — (poison) | max Zehir stacks +(3–5); each stack adds +(2–3)% poison damage |
| 6 | `asp_sanguine` | Kan Susuzluğu | off | — (bleed) | (30–50)% of bleed damage dealt returns as life (cap 2% max HP per second) |
| 7 | `asp_executioner` | Cellat | off | — | +(25–40)% damage to enemies below 30% HP; a kill speeds up all cooldowns by (0.5–1.0) s (ICD 1 s) |
| 8 | `asp_overpower` | Ezici | off | — | hits have (10–15)% chance to be **Ezici**: +(30–50)% damage and ×2 poise damage |
| 9 | `asp_echoing_strike` | Yankılı Vuruş | off | — (basic) | every 4th basic hit sends a wave: (80–120)% weapon damage, 6 m line, pierces |
| 10 | `asp_poise_breaker` | Duruş Kırıcı | off | — | poise damage +(25–40)%; when an enemy's poise breaks it takes +(15–22)% damage for 4 s (stacks with the ×1.25 break bonus additively) |
| 11 | `asp_bulwark` | Siper | def | Şövalye / Barbar | blocked or guarded hits reflect (8–14)% of the damage as holy to the attacker; guard gauge cost −(10–20)% |
| 12 | `asp_unyielding` | Pes Etmez | def | — | below 50% HP: damage reduction +(10–18)% and CC duration −(20–30)% |
| 13 | `asp_stoneskin` | Taş Deri | def | — | after a stun/freeze/root ends: 3 s of +(20–30)% armour and CC immunity |
| 14 | `asp_thorn_bloom` | Diken Çiçeği | def | — | thorns damage +(60–100)%; thorns hits apply Kanama |
| 15 | `asp_second_wind` | İkinci Nefes | def | — | lethal damage: survive once with (20–35)% HP (120 s, shares its lock with `leg_phoenix_mantle`; not an M+ death) |
| 16 | `asp_oath_ward` | Yemin Kalkanı | def | — | every 6 s the next damage you take is reduced by (40–60)% |
| 17 | `asp_lifebloom` | Can Çiçeği | def | — | Can Küresi heals (25–40)% more and allies within 8 m get double the effect |
| 18 | `asp_ward_of_dust` | Toz Muskası | def | — | after a dodge or perfect dodge: 2 s of +(15–25)% damage reduction and −10% threat |
| 19 | `asp_mana_font` | Kaynak Çeşmesi | util | — | basic attacks generate (15–25)% more resource (healers: Işık Oku / Şişe Fırlat give +mana/energy) |
| 20 | `asp_swift_cd` | Çevik Beceri | util | — | skills with cooldown ≤ 8 s recover (8–14)% faster |
| 21 | `asp_major_surge` | Büyük Yetenek Dalgası | util | — | **45 s and 90 s majors** recover (8–15)% faster (`majorCdrPct`; the 3-min buff is excluded) |
| 22 | `asp_rune_amp` | Rün Yankısı | util | — | support runes on one skill (the one in `lmb`) are (10–18)% stronger (`runeEffectPct`) |
| 23 | `asp_flask_lord` | Şişe Efendisi | util | — | flask charge gains +(30–50)%; during any flask effect +(10–15)% damage |
| 24 | `asp_goblin_bait` | Altın Kokusu | util | — | Hazine/Cevher/Efsun Goblini spawn chance ×2; gold and gem/orb drops from goblins +(30–50)% |
| 25 | `asp_hunter_lore` | Avcı Bilgisi | util | — | **ZAYIF!** hits deal +(10–18)% more damage; Sömürü stacks build twice as fast (§7.3) |
| 26 | `asp_healing_echo` | Şifa Yankısı | util | healer specs | heals have (12–20)% chance to repeat once after 1.5 s for 50% (no cost, no threat) |
| 27 | `asp_charge_trail` | İz Bırakan | mob | — | dash/leap/teleport skills leave a 4 m trail: (60–90)% weapon damage per second for 3 s |
| 28 | `asp_blink_echo` | Işın Yankısı | mob | — | after a movement skill: 3 s of +(15–25)% move speed and +(30–45)% damage on the next attack |
| 29 | `asp_gale_step` | Fırtına Adımı | mob | — | dodge roll +(15–25)% distance and a gust: enemies within 2 m are pushed 1 m (ICD 3 s) |
| 30 | `asp_phase_walker` | Gölge Yürüyüşü | mob | — | after a perfect dodge or perfect parry: 2 s unbreakable Gizlenme and −(30–50)% threat on all enemies |

**Codex panel (`codex`)**: grid of 30 aspect cards (locked/unlocked, roll bar, group icon), actions "Çıkar" (extract), "Bas" (imprint), "Parlat" (polish). Tooltips show the effect with the current roll and the range.

### 5.2 Elit Efsunları (monster mods for elite and champion packs)

**15 mods.** The first 7 are the existing `ChampionMod` ids in `ai/champion.ts` (numbers kept; display names **Vampirik** and **Işınlayıcı** replace "Vampir"/"Işınlanan"); 8 are new. Each mod has an icon row on the nameplate (up to 3) and a colour of the aura/name.

| # | id | TR | Colour | Effect (exact) | Counterplay |
|---|---|---|---|---|---|
| 1 | `hizli` | Hızlı | `0xffe040` | +40% move and attack speed | CC, kiting, `Kalkan Kaldır` |
| 2 | `atesli` | Ateşli | `0xff6a20` | on death a 4 m circle flashes 1.2 s then 2.5 coef fire | step away from the corpse |
| 3 | `dondurucu` | Dondurucu | `0x80d0ff` | every 8 s fires 3 slow frost orbs that leave chill puddles | dodge orbs, avoid puddles |
| 4 | `kalkanli` | Kalkanlı | `0xe0e8ff` | allies within 8 m take −40% damage | kill the carrier first / poise-break it |
| 5 | `vampir` | Vampirik | `0xc02040` | heals 20% of the damage it deals | burst, `Savunmasız` |
| 6 | `isinlanan` | Işınlayıcı | `0xb060ff` | every 6 s blinks next to a random player | tank picks it up with `Kışkırtma` |
| 7 | `diriltici` | Diriltici | `0x60ff90` | every 15 s revives one dead pack member at 50% (once each) | kill the reviver, interrupt |
| 8 | `zirhli` | Zırhlı | `0xb0b8c8` | +40 pp physical resist, poise ×1.5, **hyper-armor 0.7**, frontal block 25% from 120° | elements/true damage, attack from behind, parry/Kritik |
| 9 | `cagirici` | Çağırıcı | `0xd060a0` | every 12 s a 1.5 s **interruptible** cast summons 2 `Çırak` adds (swarm, HP ×0.3, 0 forces, max 6 alive) | **kick** the cast, kill adds |
| 10 | `mayinci` | Mayın Döşeyen | `0xff9040` | every 5 s drops a mine (r 2 m, armed after 1.5 s; detonates when a player is within 1.5 m or after 8 s: 1.2 coef fire; max 5; any hit destroys it without damage) | read the glyphs, shoot/touch with ranged, don't stand still |
| 11 | `simsekli` | Şimşekli | `0xffe14a` | every 7 s 1 s-telegraphed chain lightning through up to 3 players (0.8 coef per jump, jumps ≤ 8 m) | spread ≥ 9 m |
| 12 | `zehirli` | Zehirli | `0x7dff5a` | leaves poison puddles while moving (r 1.2 m, 6 s, 0.25 coef per 0.5 s); attacks add 1 Zehir stack | don't fight in the trail, `Panzehir`/`Arındır` |
| 13 | `zincirleyen` | Zincirleyen | `0x9090a8` | every 10 s a 1.2 s cast tethers the **farthest** player and pulls them 6 m (dodge i-frames break it) | roll through the tether |
| 14 | `yansitici` | Yansıtıcı | `0xd8d8e8` | every 15 s a reflect shield for 4 s: reflects 25% of damage taken as true damage (cap 8% attacker max HP per hit) | stop attacking or use DoTs for 4 s |
| 15 | `lanetci` | Lanetçi | `0x6040a0` | every 9 s a 1.2 s **interruptible** cast puts a curse on a random player (−20% damage dealt, +15% damage taken, 8 s, dispellable) | kick, `Arındır`/`Panzehir` |

**Usage rules**

| Context | Rule |
|---|---|
| Open world (Sisli Koru) Seçkin packs | 0 mods 40%, 1 mod 40%, 2 mods 20%; "Efsunlu Seçkin" name tag; +20% drop quality per mod |
| Normal / Kahramanlık / Mitik 0 | the existing 3 champion packs per run get **1–2 mods** (70% / 30%); the champion drops +1 Nadir+ item (existing) and +1 orb per 2 mods |
| **Mühür `seal_champions`** | re-adds 3 champion packs to an M+ run (O7) |
| Mythic+ ≥ +8 | 25% of elite packs become "Efsunlu Seçkin" with **one** mod from the safe set `hizli zirhli kalkanli vampir cagirici` |
| Raid trash | 1 mod on mini-elites (`rd_stone_sentinel`, `rd_forge_zealot`) |
| Forbidden pairs | `kalkanli + zirhli`, `isinlanan + zincirleyen`, `diriltici + cagirici` (two summon/revive loops), `hizli + dondurucu` |
| Mod aura | `buff_aura` in the mod colour; a 2-mod enemy uses both colours alternating; blue nameplate |
| Network | mods are seeded from the dungeon seed (identical on every peer, as today); the behaviours run on the host |
| Data | extend `ChampionMod` union and `CHAMPION_MODS` in `ai/champion.ts`; passive handlers keep using `PassiveHandler` |

### 5.3 Kadim Levha (paragon-like endgame board)

**Unlock:** level 60 (the XP bar continues as "Kadim Seviye N"). Panel `paragon`, key **P**. Data in `data/paragon.ts`.

| Rule | Value |
|---|---|
| Kadim Seviye (KS) | 1–100. `paragonXpToNext(k) = round10(340,380 × (0.28 + 0.01 × k))` for k = 0..99 (KS 1 ≈ 98,700 XP ≈ 175 Sıradan kills; KS 100 ≈ 435,000) |
| Kadim XP sources | all kill XP at L60 (same formulas as before, `xpPct` applies), plus **M+ completion**: `+ (10% + 1% × min(key, 15))` of the current requirement (timed) / half (untimed); **raid** boss kill: 6% / 10% / 15% (N/K/M) |
| Points | 1 per KS + **1 bonus at KS 10, 20, …, 100** = **110 points** |
| Boards | `CharacterSave.paragon.boards`. Start with `bd_war` free; **KS 10 / 25 / 50** unlock the 2nd / 3rd / 4th board (choose any of the four templates; attach to a free side on a 3×3 meta-grid) |
| Board shape | 9×9 cells (below). Orthogonal adjacency. A cell can be taken when orthogonally adjacent to an allocated cell. Board 1 starts allocated at the **centre `C`**. Another board's entry **gate** (the 4 edge-middle `R` cells) becomes free when the facing gate of the adjacent board is allocated |
| Centre bonus | the `C` (legendary) cell's effect activates when **≥ 12 cells** of that board are allocated |
| Glyph sockets | 2 per board (`G`). A glyph affects the **5×5 square** around its socket (Chebyshev distance ≤ 2) |
| Respec | "Kadim Unutuş": 25,000 gold, all points refunded |

```
r\c 1 2 3 4 5 6 7 8 9      N normal (50)   M magic (24)   R rare gate (4)   G glyph socket (2)   C centre legendary (1)   total 81
1   N N M N R N M N N
2   N M N N N N N M N
3   M N G M N M N N M
4   N N M N M N M N N
5   R N N M C M N N R
6   N N M N M N M N N
7   M N N M N M G N M
8   N M N N N N N M N
9   N N M N R N M N N
```

**4 board templates**

| Board id | TR | Theme | N (50) | M (24) | R (4) | C legendary (≥ 12 cells) |
|---|---|---|---|---|---|---|
| `bd_war` | Savaş Levhası | tank / melee | +6 Güç | +1.5% maks. can | +4% hasar | **Kadim Savaşçı**: +10% DAHA FAZLA yakın dövüş hasarı, +10% maks. can |
| `bd_arcane` | Gizem Levhası | caster / healer | +6 Zeka | +1.5% kaynak yenilenmesi | +4% hasar | **Kadim Bilge**: +12% DAHA FAZLA büyü hasarı, +12% Şifa Gücü |
| `bd_shadow` | Gölge Levhası | rogue / crit | +6 Çeviklik | +1.0 pp kritik şansı | +6 pp kritik hasarı | **Kadim Gölge**: +10% DAHA FAZLA kritik/Arkadan Vuruş hasarı, +10% saldırı hızı |
| `bd_ancient` | Kadim Levha | utility | +3 Tüm Özellikler | +2% Şişe Dolumu | +1.5% bekleme süresi azaltma | **Kadim Bağ**: +1 Rün yuvası (bir beceriye), +10% Büyük Yetenek Soğuması azalması |

Extra rune sockets: `bd_ancient`'s centre gives the first; a second skill gets +1 at **KS 60**, a third at **KS 90** (max 3 skills with 3 sockets).

**8 glyphs** (`gl_*`; level 1–20, level up with Kadim Toz: `5 × level` dust each; value × `(1 + 0.05 × (level − 1))`; `allocated` = allocated cells in the 5×5 around the socket)

| id | TR | Per allocated cell | Threshold bonus (≥ 8 allocated) |
|---|---|---|---|
| `gl_might` | Kudret Parıltısı | +0.4% hasar | +8% DAHA FAZLA yakın dövüş hasarı |
| `gl_bulwark` | Siper Parıltısı | +0.5% zırh | +6 pp blok şansı, +20 Siper Dayanıklılığı |
| `gl_arcane` | Gizem Parıltısı | +0.4% element/gizem hasarı | +8% DAHA FAZLA büyü hasarı |
| `gl_shadow` | Gölge Parıltısı | +0.3 pp kritik şansı | +10 pp kritik hasarı |
| `gl_vigor` | Can Parıltısı | +0.5% maks. can | +10% alınan iyileştirme |
| `gl_haste` | Hız Parıltısı | +0.2% bekleme süresi azaltma | +5% Büyük Yetenek Soğuması azalması |
| `gl_fortune` | Talih Parıltısı | +1% altın/büyülü eşya bulma | Goblin görünme şansı ×1.5 |
| `gl_poise` | Duruş Parıltısı | +0.6% duruş hasarı | +10% Kritik Vuruş hasarı |

Glyph sources: M+ end chest (timed ≥ +8: 25%, +2% per key above 8), raid bosses (Kahramanlık+: 15% / Mitik 30%), Efsun Goblini 10%. `ancient_dust` (Kadim Toz): M+ boss 2, M+ chest 5 + key, raid boss 4, Efsun Goblini 8, salvage Aspektli Efsanevi 10, extract an aspect 3.

`CharacterSave.paragon: { ks: number; xp: number; points: number; boards: { id: string; mx: number; my: number }[]; cells: string[]; glyphs: { boardIdx: number; socket: 0 | 1; id: string; level: number }[] }`. Cell id format `"<boardIdx>:<r><c>"`.

### 5.4 Hazine, Cevher ve Efsun Goblinleri (loot goblin refinement)

The existing `treasure_goblin` (Hazine Goblini, flee AI, 12× HP, 4–8 items) stays; V2 adds mechanics and two rarer variants.

| Variant | id | Share of goblin spawns | Rewards |
|---|---|---:|---|
| Hazine Goblini (gold) | `treasure_goblin` | 87% | gold burst per hit, 4–8 items (1 Nadir+), 20 × goldAvg (existing) |
| **Cevher Goblini** (blue tint) | `gem_goblin` | 10% | 3–5 gems (grade by level), 1–2 runes (§4.1), 1 flask |
| **Efsun Goblini** (purple tint) | `efsun_goblin` | 3% | orbs per the §4.3 table row, 12% a guaranteed Aspektli Efsanevi, 8 Kadim Toz, glyph 10% |

**Behaviour refinement (all variants):**

| Mechanic | Value |
|---|---|
| Hit counter | instead of one big HP pool it has a **"Kese" meter of 12 hits** (each hit ≥ 0.25 s apart counts; AoE ticks count once per 0.5 s). Every hit knocks out a coin/item burst (`gold × 0.5 × goldAvg × 6` split by variant) — the "Altın Yağmuru" |
| Flee | runs away at 7.7 m/s; **teleports (portal puff) every 6 s after 12 s alive**; after **25 s** it opens a portal and escapes |
| **Goblin Pusu** | if it escapes, a pack of **10 gold-tinted swarm goblins** (HP 0.35, drop gold ×2) spawns around the nearest player and attacks ("Goblin Pusu!") |
| Telegraph | coin-jingle SFX + gold/blue/purple minimap ping (existing); banner "Hazine Goblini göründü!" / "Cevher Goblini …" / "**Efsun Goblini** göründü!" |
| M+ | forces 0; only gold, materials, globes and 1 item per player (existing); `seal_golden` guarantees one |
| Aspect | `asp_goblin_bait` ×2 spawn chance and +30–50% rewards |
| Spawn chance | unchanged (Sisli Koru 15% / 5 min, dungeons Normal/Heroic 8%, M+ 3%); `gl_fortune` threshold ×1.5 |

---

## 6. WoW tier sets (per-spec 5-piece sets)

Eight **tier sets** (one per spec) of **5 pieces** (`helm shoulders chest gloves legs`) with **2-piece** and **4-piece** bonuses that **change the rotation**. They are the raid/M+ gear goal. The four existing leveling sets (Kutsal Öncü, Kurt Kanı, Başbüyücünün Mirası, Gölge Peçesi) stay as they are (2/4-piece, class-bound, ilvl ≥ 40 drops); both families can be active together.

### 6.1 Rules

| Rule | Value |
|---|---|
| Set id | `tier_<specId>`; piece item id `tier_<specId>_<slot>`; `ItemInstance.setId = tier_<specId>`, rarity `set`, `bound` |
| Piece lines | 4 fixed lines: main stat (T1–T0 band for the ilvl), `vit` (T1), one slot-typical affix (helm `cdr`/`castSpeed`/`critChance`, shoulders `damagePct`/`staggerPct`, chest `maxHpPct`/`armorPct`, gloves `attackSpeed`/`critDamage`, legs `dodgeChance`/`armorPct`), one resist or armour line; armour weight by class (knight/barbarian heavy, rogue medium, mage light); max upgrade +15, sockets 1–2 |
| ilvl | raid Normal **69**, Kahramanlık **75**, Mitik **81** (+3 over the boss drops); M+ vault token/piece = `63 + 2 × min(key, 15)` (cap 93); Katalizör = the converted item's ilvl |
| Spec binding | the **bonuses only count while the equipped spec matches** (tooltip line "Bu bonus Koruyucu uzmanlığı gerektirir" in grey otherwise); the pieces stay wearable |
| Counting | 2 / 4 pieces of the **same** `tier_*` set; no 5-piece bonus. The old 4 sets use their own counters |
| Data | `SetDef.bonuses[].special.id`: `ts_<specId>_2` / `ts_<specId>_4`; `data/tierSets.ts` |

### 6.2 The 8 sets

| Spec | Set (TR) | helm / shoulders / chest / gloves / legs (TR piece names) |
|---|---|---|
| Koruyucu | **Yeminli Nöbetçi** | Yeminli Nöbetçi Miğferi / Omuzlukları / Zırhı / Eldivenleri / Pantolonu |
| Kılıç Ustası | **Hüküm Kılıcı** | Hüküm Kılıcı Miğferi / Omuzlukları / Zırhı / Eldivenleri / Pantolonu |
| Savaş Lordu | **Yıkımın Lordu** | Yıkımın Lordu Miğferi / Omuzlukları / Zırhı / Eldivenleri / Pantolonu |
| Kasap | **Kan Hasatçısı** | Kan Hasatçısı Başlığı / Omuzlukları / Göğüslüğü / Eldivenleri / Bacaklığı |
| Elementalist | **Elementlerin Efendisi** | Elementlerin Efendisi Şapkası / Omuzlukları / Cübbesi / Eldivenleri / Pantolonu |
| Işık Çağıran | **Şafak Habercisi** | Şafak Habercisi Tacı / Omuzlukları / Cübbesi / Eldivenleri / Pantolonu |
| Suikastçı | **Gecenin Katili** | Gecenin Katili Başlığı / Omuzlukları / Yeleği / Eldivenleri / Pantolonu |
| Simyacı | **Kadim Simyager** | Kadim Simyager Başlığı / Omuzlukları / Önlüğü / Eldivenleri / Pantolonu |

### 6.3 Bonuses (exact numbers; "değiştirir" = what changes in play)

| Spec | 2-parça (`ts_*_2`) | 4-parça (`ts_*_4`) | Rotasyona etkisi |
|---|---|---|---|
| Koruyucu | `Kalkan Kaldır` aktifken `Kalkan Darbesi` bekleme süresi 2.5 → **1.25 s** ve +%60 kutsal hasar | `Yemin Siperi` emilimi **+%40**; `Kalkan Kaldır` etkinken engellenen her vuruş bir şarjın yenilenmesini **1 s** hızlandırır (ICD 1 s); `Sarsılmaz Bastion` bekleme −10 s | blok pencereleri içinde Darbe spamlenir; blok uptime ≈ %90'a çıkar |
| Kılıç Ustası | `Kutsal Alev Dalgası` +1 ek Adalet ve yanması 4 m yayılır; `Işıltılı Yarma` +1 Adalet | 5 Adalet'le `Karar Darbesi`, `Kutsal Alev Dalgası`'nı sıfırlar; `Hüküm Kanatları` sırasında Karar Darbesi iki kez vurur (2. vuruş %50) | Dalga → Karar döngüsü sıkılaşır, Kanatlar penceresi 3× Karar'a dönüşür |
| Savaş Lordu | `Demir Duruş` karşı vuruş şansı %30 → **%50**, her karşı vuruş +15 Öfke | `Kan Zırhı` maliyeti 40 → **25 Öfke**, süresi +4 s, `Demir Duruş` sırasında yenilenebilir (sınır %60 maks. can) | Öfke döngüsü karşı vuruşlarla kendini besler; Kan Zırhı daha sık |
| Kasap | `Parçala` yığın sınırı 8 → **10**; `İdam` eşiği %35 → **%45** | `Kan Banyosu` bekleme 45 → **35 s**; patlamadan sonra 6 s boyunca `İdam` bedava ve **tüm hedeflere** %40 hasarla vurur | patlama sonrası İdam sprint'i, kanama yığma planı önemli |
| Elementalist | `Termal Şok` +%40 → **+%65**, buhar yarıçapı 2.5 → 4 m | `Termal Şok` her 1 s'de `Buz Halkası`'nın bekleme süresini 1.5 s azaltır; `Yanış` sırasında `Buz Mızrağı` ateş hasarı verir (Termal Şok tetikler) | buz ↔ ateş geçişi daha sık ve karlı; Yanış penceresinde Mızrak spam'i |
| Işık Çağıran | `Yenilenme Işığı` tikleri %20 daha fazla iyileştirir, her 3. tik en yakın müttefiğe %50 sıçrar; `Taşan Şifa` sınırı %15 → **%25** | `Şafak Doğuşu` bekleme 90 → **70 s**; `Taşan Şifa` kalkanı olan bir müttefik varken `Parlak Dalga` **anında** dökülür | HoT yayma + kalkan → anlık AoE şifa kombinasyonu |
| Suikastçı | `Sırttan Bıçak` +1 Kombo (arkadan +4), arkadan kritik şansı +15 pp; `Gırtlak Kesme` bekleme −4 s | `İnfaz` 5 Kombo'da 2 Kombo iade eder ve `Gölge Adımı` bekleme −3 s; `Ölümcül Gölge Dansı`'nda pusu bonusu ilk 3 yerine ilk **5** vuruşa | İnfaz döngüsü hızlanır, dans penceresi uzar |
| Simyacı | `Şifa Şişesi` birikintisi 6 → **9 s** ve +%20 iyileştirme; her iyileştirilen müttefik için +1 ek Karışım | `Mucize Damla` 5 puanda 8 m içindeki **tüm müttefikleri** %40 oranında iyileştirir; `Mucize Karışım` +4 s; `Panzehir` bekleme −3 s | puan biriktirip kitlesel Damla patlatma oyunu |

### 6.4 Sources, tokens, Katalizör

| Source | Rule |
|---|---|
| Raid boss tokens | each boss drops **1 slot token** per player: B1 Gürbüz → `tk_gloves` (Eldiven Mührü), B2 Selvinaz → `tk_shoulders` (Omuzluk Mührü), B3 Dağhan → `tk_legs` (Pantolon Mührü), B4 Karaşin → `tk_helm` (Miğfer Mührü), B5 Yıldızkanat → `tk_chest` (Zırh Mührü) **and** a 25% chance of a second random token. Drop chance: **Normal 35% / Kahramanlık 70% / Mitik 100%** (B5 always). Tokens are class- and spec-agnostic materials |
| Redeem | **Set Ustası Selim** (NEW NPC, panel `tierset`): 1 token + 1 Ruh Taşı + gold (Normal 5,000 / Kahramanlık 10,000 / Mitik 20,000) → the piece of that slot for the **currently equipped spec's** set, at the token's ilvl (69/75/81). Soulbound |
| M+ | Kadim Kasa vault slot can show a **token** instead of an item (15% per slot at key ≥ 10, 30% at ≥ 15); timed end chest ≥ +10: 10% a token (ilvl by key like the vault) |
| Normal bosses | the 5-man dungeon bosses never drop tier pieces |
| **Kadim Katalizör** | same NPC, tab "Katalizör": converts one **non-set, non-Aspektli** equipment piece of slot helm/shoulders/chest/gloves/legs with ilvl ≥ 66 into the tier piece of that slot for the current spec at **the item's ilvl** (the piece's own fixed lines replace the old ones; +N upgrade and gem sockets are kept). Costs 5,000 gold. Charges: **1 per week** (Monday 04:00 reset) + **1 per timed M+ ≥ +10** completion, max 3 stored (`CharacterSave.flags.catalyst`) |

---

## 7. Creature weaknesses and the Bestiyari

### 7.1 Families, resists and status rules

Every `EnemyDef` gets a `family: FamilyId` (`data/families.ts`); the family supplies **default** resists and status rules, and `def.resist` / `def.ai` still **override per monster**. Values are resists in % (positive = resists, **negative = weak**); arcane damage uses the target's lowest of fire/frost/lightning resist (GDD_SYSTEMS §1.4), so it is not a column. V2 supersedes the family numbers of GDD_SYSTEMS §1.10 for the families listed (`spider` → `insect`, new families added).

| Family id | TR | Phys | Fire | Frost | Lightning | Shadow | Poison | Holy | Poise × | Immune to | Vulnerable to / notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| `beast` | Hayvan | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.8 | – | Kanama süresi +25%, Korku süresi +25% |
| `undead_bone` | İskelet | 15 | −25 | 25 | 0 | 50 | 75 | −35 | 1.0 | Kanama, Korku | Kutsal ve ateş; kemik yığını geri dirilir |
| `undead_flesh` | Çürümüş | 0 | −30 | 10 | 0 | 30 | 60 | −30 | 1.0 | Korku | Yanma hasarı +25% |
| `ghost` | Hortlak | 50 | 0 | 0 | 0 | 75 | 75 | −50 | 0.6 | Kanama, Zehir, Korku | Gizem (fiziksel dirençli, elementi yok) ve kutsal |
| `insect` | Böcek / Örümcek | 0 | −35 | 10 | 0 | 0 | 50 | 0 | 0.9 | – | Yanma süresi +25%, Yavaşlama +25% |
| `slime` | Balçık | 40 | −15 | −15 | −30 | 0 | 100 | 0 | 1.0 | Kanama, Zehir | Şimşek; ölünce 2 küçük balçığa bölünür (yanıcı olmayanlar) |
| `fungus` | Mantar | 0 | −40 | 0 | 0 | 0 | 80 | 0 | 1.0 | Zehir (ağır direnç) | Yanma hasarı +50%, spor bulutları ateşle temizlenir |
| `humanoid` | İnsansı | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.0 | – | Kanama ve sersemletme etkili (+25% süre) |
| `cultist` | Kültist | 5 | 10 | 10 | 10 | 25 | 0 | −20 | 1.0 | – | Kutsal, Zayıflama laneti |
| `golem` | Yapay (Golem) | 40 | 20 | 20 | −35 | 0 | 100 | 0 | **1.5** | Kanama, Zehir, Korku, Donma (Üşüme ×0.5) | Şimşek; duruş kırılması büyük ödül verir |
| `demon` | İblis | 10 | 60 | −30 | 0 | 30 | 30 | −35 | 1.0 | – (Korku ×0.5 süre) | Buz ve kutsal |
| `elemental_fire` | Ateş Elementali | 20 | **100** | **−50** | 0 | 0 | 100 | 0 | 1.0 | Yanma, Kanama, Zehir, Korku | Buz (+%50) ve Üşüme yığınları ×2 |
| `elemental_frost` | Buz Elementali | 20 | **−50** | **100** | 0 | 0 | 100 | 0 | 1.0 | Üşüme, Donma, Kanama, Zehir, Korku | Ateş (+%50), Yanma +25% hasar |
| `dragon` | Ejder | 25 | 50 | 50 | −25 | 20 | 40 | 0 | **1.3** | Korku, geri itme; sert CC duruş hasarına çevrilir (×2) | Şimşek ve **Gizem** (en düşük element direnci −25 olduğu için) |

### 7.2 Existing roster → family (with overrides)

`def.resist` overrides in parentheses (+ = resists). Everything not listed keeps the family default.

| Family | Enemy ids |
|---|---|
| `beast` | `ow_rat` `crypt_rat` `ow_bat` · `ice_bat` (frost +60, fire −30) · `yeti_brute` and `boss_ak_pence` (frost +50, fire −30) |
| `undead_bone` | `skel_rattler` `bone_skull` `skel_minion` `skel_archer` `skel_mage` `skel_warrior` `boss_bekci_kaldur` `boss_olucagiran_morkan` `boss_azrakel` · `flame_skull` (fire +100 immune to Yanma, frost −40) · `frost_dead` (frost +100, immune Üşüme/Donma, fire −40) · `boss_tugrul` (frost +80, fire −30) · `bone_golem` (poise explicitly 160, keeps the family numbers) |
| `undead_flesh` | `ow_zombie` `crypt_ghoul` |
| `ghost` | `crypt_wraith` `shade` `affix_spiteful_shade` · `frost_wraith` (frost +80, fire −25) |
| `insect` | `ow_spider` `shadow_spider` `shadow_spiderling` · `snow_spider` (frost +80, fire −50) |
| `slime` | `ow_slime` `ow_slimelet` · `lava_slime` `lava_slimelet` (fire +100 immune to Yanma, frost −50; no split) · `frost_slime` (frost +100, fire −50) |
| `fungus` | `ow_mushnub` `wb_curukkok` |
| `humanoid` | `ow_goblin` `ow_goblin_shaman` `treasure_goblin` `forge_goblin` `ow_orc_chief` `forge_orc` · `frost_knight` (frost +50, fire −20) · `boss_dokumcu_gurz` (fire +30) |
| `cultist` | `cult_acolyte` `cult_assassin` `cult_summoner` `cult_ritualist` `shadow_priest` `boss_nefris` `nefris_clone` · `fire_priest` (fire +50, frost −25) · `boss_ayaz_ana` and `ayaz_image` (frost +60, fire −30) |
| `golem` | none in the old roster (raid: `rd_stone_sentinel`, `rd_daghan`) |
| `demon` | `forge_imp` `forge_demon` `void_imp` `void_demon` `boss_kevvas` `boss_zakhar` · `boss_ignaroth` (fire +80, frost −20) |
| `elemental_fire` | `magma_golem` `boss_atesyurek` |
| `elemental_frost` | `ice_elemental` |
| `dragon` | `npc_kiragi` (friendly), raid `rd_yildizkanat`, `rd_wyrmling` |

**Dungeon cheat sheet** (shown in the dungeon tooltip of the portal panel and the Bestiyari): Kemik Mahzeni — **Kutsal, Ateş** (kaçın: Zehir, Gölge). Kızıl Dökümhane — **Buz, Kutsal** (ateş işe yaramaz). Buzul Tahtı — **Ateş, Şimşek** (buz ve zehir zayıf). Gölge Tapınağı — **Kutsal, Buz** (gölge işe yaramaz, ateş orta). Efsun Kalesi — karışık; Yıldızkanat'ta element döngüsü (§9).

### 7.3 Exploiting weaknesses (feedback rules)

| Term | Rule |
|---|---|
| **Zayıf** | effective resist ≤ **−20%** for the hit's damage type |
| **Dirençli** | resist ≥ **+50%** |
| **Bağışık** | resist ≥ **+95%** (0 damage) or the status is in the family's immune list |
| **ZAYIF! hit** | the damage number is ×1.25 size, orange-to-white gradient, prefix "ZAYIF!" (first 3 per target per second to avoid spam), `weak_hit` SFX layer (bright chime), small `weak_spark` VFX in the damage-type colour; **poise damage ×1.5** |
| **Sömürü** (`weakness_chain`) | consecutive ZAYIF! hits on the **same target within 4 s** add a stack on the attacker (max 5): each stack +4% damage vs weak targets (max +20%); decays when 4 s pass without a weak hit |
| `S.weakDamagePct` | adds to ZAYIF! hit damage (aspect `asp_hunter_lore`, Kadim Levha) |
| **Dirençli hit** | grey number ×0.85 size, dull `resist_hit` SFX |
| **Bağışık** | "BAĞIŞIK" grey text, no damage, no status; a status refused by immunity shows "BAĞIŞIK" over the enemy |
| Status vulnerabilities | duration/damage modifiers in the family table are applied by `StatusEffects` (burn/bleed/slow/fear durations) |
| Party synergy | Sömürü is per attacker, but a **shared mark** exists: the first ZAYIF! hit by anyone in a party applies "Zayıf Nokta" to the target for 3 s (+5% damage from **all** party members, no stacking) — encourages mixing damage types |

**UI:** nameplates (enemies) show up to **2 weakness icons** (damage-type icon with a red ▲) and **1–2 resist icons** (grey ▼) at 12 px; a `?` appears until the Bestiyari has revealed the data for that monster type. The enemy target frame shows the full row incl. immunities. Hover (free cursor) gives "İskelet · Zayıf: Kutsal, Ateş · Dirençli: Zehir, Gölge · Bağışık: Kanama, Korku".

### 7.4 Bestiyari (monster codex) — panel `bestiary`, key **L**

| Item | Rule |
|---|---|
| Entries | one per `EnemyDef`/`BossDef` (≈ 70 existing + raid ≈ 12); internal/affix units are hidden |
| Tracking | `CharacterSave.bestiary: Record<enemyId, number>` kills (each peer counts its own, within 60 m, like loot/XP); bosses count kills per difficulty |
| Unlock tiers | **0** seen (name + silhouette) · **5** family, rank, level range · **10** **weaknesses** (icons + %) · **25** resists, immunities, status vulnerabilities · **50** ability list (TR names, damage category, interrupt priority, short tips) · **100** loot table + lore · **250** "Avcı Rozeti" (cosmetic frame in the codex) |
| Boss entries | "Mekanikler" tab (phases + one-line TR tips per mechanic) unlocks at **3 kills** (5-man) / **1 kill** (raid) |
| Family rewards | total kills in a family: 100 / 300 / 700 → **Av Bilgisi** +1% / +2% / +3% damage vs that family (`damageVsFamily`, applied in `Combat.rollOutgoing`); all 14 families at tier 3 → title "Bestiyari Ustası" |
| Layout | left: families as collapsible groups with progress rings + search; centre: PSX model on a slow turntable, name/title/rank/family badge, kill counter and the next unlock; right: tabs **Zayıflıklar** (icon grid with %, immunities), **Yetenekler**, **Notlar/Lore**, **Ödüller**; bottom bar: global completion % |
| Sound | page-turn SFX `ui_page`, unlock chime `ui_unlock` + toast "Bestiyari: {Ad} zayıflıkları öğrenildi!" |

---

## 8. Mythic+ depth

Everything in GDD_CONTENT §5 stays (keystone, affixes, rotation, timer, death penalty +15 s, score formulas, rating colours, vault). V2 adds the **information layer** (forces %, routes, kick helper, recap), the **role pressure** (§1.7), **seals** (§4.4), **seasons** and the **meta-progression** (titles, portals, cosmetics).

### 8.1 Enemy forces on nameplates and in the HUD

| Element | Rule |
|---|---|
| Nameplate forces tag | in M+ every non-summoned trash/elite enemy shows `+x.xx%` under its name (`forces / forcesRequired × 100`, 2 decimals, small gold text; bosses and 0-force units show nothing). Setting "Düşman gücü göster" (default ON) |
| Pull counter | a HUD chip next to the run tracker: **"Çekim: +%12.40"** = sum of the forces of engaged (not yet dead) enemies; turns green when current + pull ≥ 100%, shows "kalan %4.20" |
| Kill feedback | on a kill a gold floating "+0.80%" rises from the corpse (suppressed for swarm kills: merged into one number per 0.5 s) |
| Tracker | existing `MythicTracker`: "Düşman Gücü: 45.20%" + a thin projected bar (current + pull) |
| Pack tooltip | hovering one member (free cursor) shows the pack's total forces and member list |
| Data | already present: `EnemyDef.forces`, `PackDef.forces`, `DungeonDef.forcesRequired` |

### 8.2 Route planner (map panel)

Opens from the map (`M`) while in a dungeon and from the keystone panel in town (preview mode). Cursor must be free (Alt held) or the panel open.

| Feature | Rule |
|---|---|
| Layer | the dungeon minimap (rooms, doors); **pack markers**: circle size ∝ forces, colour by composition (red = has elite, orange = trash, purple = caster-heavy, grey = optional/hollow), icons for dormant (bones), stealth (eye), patrol (dashed loop with arrows and a moving dot at its true period). Boss markers, shrines, rift spots, Kehanet Taşı |
| Pull tool | click packs to add them to the **current pull**; each pull gets a numbered badge and a colour; Shift-click removes; drag a pack between pulls; "Yeni çekim" starts the next pull |
| Forces bar | cumulative % after each pull with 80% / 100% markers and warnings "Eksik: %6.40" / "Fazla: %3.20" |
| Save / load | up to **5 routes per dungeon**: `CharacterSave.routes: Record<dungeonId, SavedRoute[]>`; `SavedRoute { name, pulls: string[][] /* pack ids */, note?, updatedAt }`. Buttons: Kaydet, Yükle, Sil, Yeniden adlandır, **Hazır Rotalar** (the §8.3 presets, read-only, "Kopyala") |
| Share | export string `EFR1:<base64url(JSON {d: dungeonId, p: pulls})>` copied to the clipboard / posted to party chat; chat messages starting with `EFR1:` render a clickable chip "Rotayı al" |
| Auto-fill | "Tamamla" greedily adds the nearest unclaimed packs until 100% (suggestion only) |
| In-run overlay | the active route is drawn on the minimap (numbered pulls, current highlighted, finished greyed); for the **tank role** a gold diamond with the pull number floats over the next pack (`WorldLabels`), toggle "Tank rotası göster" (default ON in M+) |
| Pull markers | the leader (or the tank) can place a **pull marker** at the cursor: a pulsing ring + "ÇEKİM" label visible to the whole party for 30 s (`req` kind `marker`, host relays as chat-free event; max 1 per player) |
| Patrols | patrol lines dotted; hover shows period (s) and "çarpışma süresi" to the next pack within 4 m (body-pull warning, §GDD_CONTENT 0.5) |

### 8.3 Tank Rotası presets (optimal pull order)

`data/routes.ts`: `TankRoute { id, dungeonId, name, pulls: { n: number; packs: string[]; forces: number; tip: string }[], skip: string[], total: number }`. Forces are the sums of `PackDef.forces`; "Küm. %" is cumulative of the `forcesRequired`. Bosses give 0 forces. Interrupt targets use the roster priorities (§8.4).

**Kemik Mahzeni** (`kemik_mahzeni`, need 250) — route A, everything except optional rooms, total **258 (103.2%)**, margin 8

| Çekim | Packs | Forces | Küm. % | Tank notu |
|---:|---|---:|---:|---|
| 1 | d1_p01 | 9 | 3.6 | giriş; okçuyu önce çek (`Kışkırtma`) |
| 2 | d1_p02 + d1_p04 + d1_p06 | 30 | 15.6 | **büyük çekim #1** (24 düşman): uyuyan kemikler + devriye; `Meydan Okuma` ilk saniye |
| 3 | d1_p03 + d1_p05 | 24 | 25.2 | iki büyücü: **Ölüleri Kaldır'ı kes** (HIGH) |
| 4 | d1_p07 | 9 | 28.8 | → **Boss 1 Bekçi Kaldur** |
| 5 | d1_p08 + d1_p09 | 18 | 36.0 | kafatası sürüsü + büyücü; büyücüyü kes |
| 6 | d1_p10 + d1_p13 | 27 | 46.8 | hortlak: **Korkunç Çığlık'ı kes**; okçuları kenara çek |
| 7 | d1_p11 + d1_p12 | 24 | 56.4 | fare sürüsü patlar; golemi `Kışkırtma`/`Hücum` ile ayrı çek |
| 8 | d1_p14 + d1_p15 | 21 | 64.8 | 2 hortlak: ikisini sırayla kes |
| 9 | d1_p16 + d1_p17 | 24 | 74.4 | 2 büyücü + uyuyan kemikler (sıraların altı) |
| 10 | d1_p18 | 11 | 78.8 | → **Boss 2 Morkan** |
| 11 | d1_p22 + d1_p23 | 22 | 87.6 | 3 gulyabani + büyücü: AoE |
| 12 | d1_p24 + d1_p25 | 27 | 98.4 | büyücü + hortlak: iki kes gerekir |
| 13 | d1_p27 | 12 | 103.2 | → **Boss 3 Azrakel** |

**Kızıl Dökümhane** (`kizil_dokumhane`, need 270) — route A minus the patrol `d2_p06`, total **276 (102.2%)**, margin 6

| Çekim | Packs | Forces | Küm. % | Tank notu |
|---:|---|---:|---:|---|
| 1 | d2_p01 | 6 | 2.2 | goblinler, ısınma |
| 2 | d2_p02 + d2_p03 | 25 | 11.5 | `forge_orc` **Çalışın!'ı kes**; balçıkları duvara ayır |
| 3 | d2_p04 | 15 | 17.0 | **Ateş Rahibi** (kes: şifa/kalkan) |
| 4 | d2_p05 | 10 | 20.7 | **Magma Golemi tek başına**, ölüm patlaması: kimseden uzakta öldür |
| 5 | d2_p07 | 7 | 23.3 | → **Boss 1 Gurz** (devriye d2_p06 atlanır) |
| 6 | d2_p11 + d2_p12 | 19 | 30.4 | orku kes |
| 7 | d2_p13 + d2_p14 | 25 | 39.6 | rahip kes; kafataşı sürüsü AoE |
| 8 | d2_p15 + d2_p16 | 24 | 48.5 | golem + rahip + iblis; golemi ayrı öldür |
| 9 | d2_p17 + d2_p20 | 29 | 59.3 | ork + 2 rahip (iki kes) |
| 10 | d2_p19 + d2_p21 | 27 | 69.3 | golem + balçık + kafatası sürüsü |
| 11 | d2_p18 + d2_p22 | 18 | 75.9 | lav üstü iblisçikler (menzilli/bekle) → **Boss 2 Ateşyürek** |
| 12 | d2_p23 + d2_p24 + d2_p26 | 31 | 87.4 | **büyük çekim**: 10 goblin + iblisler + kafataşları |
| 13 | d2_p25 + d2_p27 | 33 | 99.6 | 2 ork + rahip: üç kes; golemi ayır |
| 14 | d2_p28 | 7 | 102.2 | → **Boss 3 Ignaroth** |

**Buzul Tahtı** (`buzul_tahti`, need 250) — route A skipping `d3_p07 d3_p09 d3_p10 d3_p14 d3_p21` (and the optional `d3_p15`), total **264 (105.6%)**, margin 14 (the final pull is optional: 252 = 100.8% after pull 11)

| Çekim | Packs | Forces | Küm. % | Tank notu |
|---:|---|---:|---:|---|
| 1 | d3_p01 | 10 | 4.0 | |
| 2 | d3_p02 + d3_p05 | 26 | 14.4 | hortlak **Buz Mızrağı'nı kes**; elemental Buz Zırhı |
| 3 | d3_p03 + d3_p06 | 28 | 25.6 | yeti Kar Topu ve şövalye **Dondurucu Kesik** önden: arkana çevir |
| 4 | d3_p04 + d3_p08 | 24 | 35.2 | yarasa sürüsü + 2 hortlak (2 kes) → **Boss 1 Ak Pençe** |
| 5 | d3_p11 + d3_p12 | 28 | 46.4 | kütüphane: 3 hortlak, kesleri paylaştır |
| 6 | d3_p13 | 14 | 52.0 | → **Boss 2 Ayaz Ana** |
| 7 | d3_p16 + d3_p17 | 25 | 62.0 | 2 buz elementali |
| 8 | d3_p18 + d3_p19 | 30 | 74.0 | yeti + 6 yarasa + 2 hortlak |
| 9 | d3_p20 | 17 | 80.8 | şövalye + elemental |
| 10 | d3_p22 + d3_p23 | 32 | 93.6 | 3 şövalye, 2 hortlak: ağır çekim, `Sarsılmaz Bastion`/`Son Direniş` |
| 11 | d3_p24 | 18 | 100.8 | |
| 12 | d3_p25 | 12 | 105.6 | → **Boss 3 Tuğrul** (opsiyonel) |

**Gölge Tapınağı** (`golge_tapinagi`, need 210) — route B (batı önce), skipping `d4_p18 d4_p20 d4_p12`, total **221 (105.2%)**, margin 11

| Çekim | Packs | Forces | Küm. % | Tank notu |
|---:|---|---:|---:|---|
| 1 | d4_p01 + d4_p02 + d4_p03 | 40 | 19.0 | **büyük çekim (21 düşman)**: 16 mürit + void demon; *Fanatik* hepsini aynı anda öldür |
| 2 | d4_p04 | 9 | 23.3 | gizli suikastçılar: AoE ile ortaya çıkar |
| 3 | d4_p05 + d4_p06 | 27 | 36.2 | rahip kes |
| 4 | d4_p07 + d4_p08 | 28 | 49.5 | çağırıcı **İblis Çağır'ı kes** |
| 5 | d4_p09 | 9 | 53.8 | → **Boss 1 Nefris** |
| 6 | d4_p16 | 15 | 61.0 | Kara Hol: 11 mürit |
| 7 | d4_p17 + d4_p19 | 34 | 77.1 | 2 rahip + çağırıcı: 3 kes; koridora çek |
| 8 | d4_p10 + d4_p11 | 24 | 88.6 | doğu kanadı: rahip + çağırıcı |
| 9 | d4_p13 + d4_p14 | 27 | 101.4 | |
| 10 | d4_p15 | 8 | 105.2 | → **Boss 2 Kevvas**, sonra final **Boss 3 Zakhar** (iki kanat boss ölünce) |

**Efsun Kalesi (raid)** has no forces; the same preset format lists "temizlik sırası" for optional trash (§9.3).

### 8.4 Interrupt (kick) rotation helper and tracker

**What counts as a kick** (all tracked): the **Kes** of every weapon art (lockout 10 s; mage 12 s, rogue 8 s), `knight_shield_bash` (tag `interrupt`, 8 s lockout), `rogue_garrote` (silence; CD 14 s), `barbarian_fissure` (stun; CD 7 s), `mage_frost_nova` (freeze; CD 9 s). Any other hard CC still interrupts per GDD_CONTENT §0.6 but is not tracked. Kick state is **per player**: `ready` time.

| Part | Rule |
|---|---|
| Net | new channel `kick`: owner → all `{ id: EntityId; ready: number; order?: number }` (sent on use and on spec/gear change); the leader's order assignment is sent as `order` on the leader's own message for each member (host relays) |
| Tracker widget (`KickTracker`, hud) | compact list under the party frames: class icon, name, kick icon with a cooldown sweep and a green "hazır" dot; the **next in order** is highlighted gold; setting "Kes takipçisi" (default ON when party ≥ 2) |
| Assign order | Alt-click a party frame → context menu "Kes sırası: 1 2 3 4 5 / Yok" (leader only); default order = ready time ascending |
| Prompt | when a hostile **interruptible** cast with `kick ≥ 1` starts within 40 m and line of sight: the enemy's cast bar gains a small badge with the **assigned player's** class colour; if it is **you**: gold screen-edge flash + `sfx_kick_prompt` + a key hint; if that player's kick is on cooldown the next ready one takes over; `kick: 2` (HIGH) also flashes the tracker row red |
| Result | success: "**{Ad} kesti!**" (gold text + party chat line, `kick.success`); failure with at least one ready kick: red "**KESİLMEDİ: {büyü adı}**"; counts per player in the recap |
| Priorities | `EnemyAbility.kick`: 2 = HIGH (heals, summons, CC, big nukes), 1 = MED (buffs) — set from the roster: `skel_mage` Ölüleri Kaldır 2, `crypt_wraith` Korkunç Çığlık 2, `crypt_ghoul` Leş Yiyici 1, `fire_priest` şifa/kalkan 2, `forge_orc` Çalışın! 2, `forge_imp` Ateş Yağmuru 1, `frost_wraith` Buz Mızrağı 2, `ice_elemental` Buz Zırhı 1, `shadow_priest` şifa/kalkan 2, `cult_summoner` İblis Çağır / Karanlık Ayin 2, `shade` Kabus 2, `ow_goblin_shaman` şifa 2, `cagirici`/`lanetci` elite mods 2 |

### 8.5 Death recap

| Part | Rule |
|---|---|
| Log | `Combat` keeps a rolling **10 s** ring buffer (max 40 entries) of **incoming hits** on the local player `{ t, source, ability, amount, mitigated, type, avoidable, hpPct }` and **heals received** `{ t, source, amount, overheal }` |
| Panel | on death the existing `death` panel gets a **"Ölüm Özeti"** tab: timeline (HP% line, red hit bars, green heal bars), the **killing blow** highlighted, top-3 damage sources, a tag **"Kaçınılabilirdi"** when the ability category is avoidable (GDD_CONTENT §0.6), the ability's TR `tip` (e.g. "Kırmızı alandan çık"), and **"Kullanılmayan:"** lines for defensives that were ready (potion, flask, `Yemin Siperi`, major, dodge charge) |
| M+ summary | `runSummary` shows a deaths table: player, count, time lost, killer ability per death, avoidable % |
| Net | each peer records its own; `pdeath` payload gets optional `by?: string` (ability name) and `av?: boolean`; the host appends `RunState.deathLog?: { id: number; t: number; by: string; av: boolean }[]` for the summary |
| Data | `data/abilityTips.ts`: `abilityId → TR tip` (start with the ≈ 40 avoidable boss/trash abilities) |

### 8.6 Seasons (seasonal affix rotation)

Seasons are **12 weeks**, aligned to the existing 12-week affix rotation (`WEEK_EPOCH_MS`): `seasonIndex = floor(weekIndex / 12)`. Each season has its **own seasonal affix** (from +10) on top of the weekly rotation, its own rating, and its own title ladder.

| Season | Name (TR) | Weeks | Start (04:00 TR) | Seasonal affix |
|---|---|---|---|---|
| Sezon 1 (current, index 3) | **Efsunlu Yarık** | 36–47 | 2026-09-14 | `seasonal_efsun` (existing, GDD_CONTENT §5.5.4) |
| Sezon 2 | **Kızıl Ay** | 48–59 | **2026-12-07** | `seasonal_kizil_ay` (below) |
| Sezon 3 | **Kadim Sis** | 60–71 | **2027-03-01** | `seasonal_sis` (below) |
| Sezon 4 | (open) | 72–83 | 2027-05-24 | – |

**`seasonal_kizil_ay` — Kızıl Ay** (params `{ thresholds:[0.25,0.5,0.75], duration:45, dmgPct:0.25, orbEvery:10, orbHealPct:0.10, orbDmgPct:0.10, orbBuff:30 }`): each time forces cross 25/50/75% a **Kızıl Ay** rises for 45 s: all enemies deal +25% damage; every **10th kill** during the moon drops an **Ay Küresi** (walk over it: heal 10% max HP and +10% damage for 30 s, party-wide within 8 m). After the moon sets, enemies killed during it count normally. Banner "Kızıl Ay doğuyor!".

**`seasonal_sis` — Kadim Sis** (params `{ interval:40, duration:14, fogFar:14, lanternRadius:6, wraithHpPct:0.25, wraithDmgPct:0.2 }`): every 40 s (in combat) a thick fog rolls in for 14 s: fog far plane 14 m, nameplates beyond 14 m hidden, and 2 **Sis Hortlakları** (HP 25% of an elite, +20% damage, 0 forces) spawn at the edge and fixate the farthest player; killing both ends the fog early and gives each player a 10 s `windrunner`-like +15% speed. Players carrying a **Fener** (a free interactable at the dungeon start, 1 per player, 6 m light radius) keep nameplates visible within 6 m.

Season rules: ratings of the previous season are archived (`MythicProfile.seasons?: Record<number, { rating: number; best: Record<string, unknown> }>`); the new season starts at 0.0, keeps titles/cosmetics, gives every player a fresh **+2 key** (existing weekly maintenance), and resets the Raider-style leaderboard in the lobby. Passive-point milestones (500/1000/…) are **account-lifetime** (not repeated per season).

### 8.7 Titles, portals and cosmetics at rating thresholds

Reward on first reaching the **season rating** (cosmetics persist across seasons; titles show "(S2)"):

| Rating | Title (TR) | Portal skin (local, visible to party at the dungeon start) | Cosmetic | Extra |
|---:|---|---|---|---|
| 300 | Mitik Çaylak | – | – | – |
| 500 | Anahtar Çırağı | Kadim Kapı: Gümüş (silver swirl) | – | +1 passive point (existing milestone) |
| 1000 | **Anahtar Taşıyıcı** | Kadim Kapı: Mor | weapon trail "Efsun İzi (mor)" | +1 passive point |
| 1500 | **Kadim Gezgin** | Kadim Kapı: Turuncu | character aura "Mitik Aura (turuncu)" | +1 passive point |
| 2000 | **Efsun Fatihi** | Kadim Kapı: Altın | footstep sparkle | +1 passive point |
| 2500 | **Kadim Efendi** | Kadim Kapı: Kadim (animated) | pet "Kırağı Yavrusu" | +1 passive point |
| per dungeon | "{Zindan} Hâkimi" | tint of **that** dungeon's portal | – | key +15 timed there |
| season end | "Sezon N Kadim" | – | frame in the codex | top rating tier at season end (1750+) |

The title appears under the player name on nameplates and in the lobby; one title selected in the `character` panel. Cosmetics are toggles in the character panel ("Kozmetik" tab).

### 8.8 Score breakdown UI (`mplusInfo` tab "Puan")

| Part | Content |
|---|---|
| Table | per dungeon: icon, name, **best Tahkimli run** (key, time, upgrade ★, score), **best Zorba run**, `dungeonScore = 1.5·max + 0.5·min`, a stacked contribution bar |
| Header | total rating (colour by tier), delta of the last run, season name and days left |
| Next targets | per dungeon "**+N zamanında → +x.x puan**" (computed with `computeScore` at 80% of the timer) and the cheapest improvement highlighted |
| Seals | a line "Mühür bonusu: +%6 (3 puan)" when the best run used seals |
| Recent | last 10 runs with date, key, time vs timer, deaths, affixes, seals |
| Tooltip | "Puan hesabı" shows `scoreBase(L)`, time bonus (up to +7.5 at 60% timer) and the Raider-style weighting |

### 8.9 Key rules: depletion and rerolls

| Rule | V2 |
|---|---|
| Timed (≤ 100%) | unchanged: +1 / +2 / +3 levels (≤ 100 / 80 / 60%), new random dungeon |
| **Soft depletion (O5)** | **100–110%** of the timer: key level **unchanged**, `depleted` flag, **1 chest item per player at ilvl −2** (instead of −4), no key upgrade |
| Untimed (> 110%) | key −1 (min +2), `depleted`, chest 1 item ilvl −4 (existing numbers) |
| Abandon | unchanged: −1, same dungeon, no credit |
| Zindanı Değiştir | unchanged (free once per week, else 1,000 × L gold) |
| **Anahtar Takası** (NEW) | in a party, two members can swap the **dungeon** of their keys once per week (levels unchanged); `req` kind `keyswap`, both must accept |
| Seals | consumed on countdown start (§4.4) |
| Disconnect | unchanged (rejoin, timer runs) |

### 8.10 Timer chest visuals and run summary

**Chest by result** (presentation only; loot rules in GDD_SYSTEMS §7.4):

| Result | Chest model | Beams | Particles | SFX |
|---|---|---|---|---|
| Untimed | `chest_iron`, dull grey-brown | 0 | dust | `chest_open` |
| Timed +1 (bronze) | `chest_gold` | 1 amber beam 3 m | 20 gold motes | `chest_open_1` |
| Timed +2 (silver) | `chest_epic` tinted silver-white | 2 beams 5 m, rotating | 40 motes + sparkle ring | `chest_open_2` |
| Timed +3 (gold) | `chest_epic` tinted gold-white, crown halo | 3 beams 8 m + coin shower (60 coins) | 80 motes, bloom pulse | `chest_open_3` (choir) |

The result banner above the chest shows ★/★★/★★★ plus "Zamanında: +2 · 11:42 / 13:00 · Ölüm: 2" (existing).

**Run summary meters** (`runSummary` and the raid summary): per player rows with **Hasar**, **Efektif İyileştirme** (+ overheal %), **Alınan Hasar**, **Kesmeler** (kicks / missed), **Ölümler**, **Arındırmalar**, **Emilen** (absorb); a small bar chart per metric; plus **Rota İstatistikleri**: pulls, average pull size (forces), average time per pull, longest idle stretch. `Combat` owns the counters (`combat/meters.ts`), broadcast by each peer once at run end in the `run:recap` event payload.

---

## 9. RAID: "Efsun Kalesi" (`efsun_kalesi`)

A 5-boss raid for a **party of 1–5** (designed for 5). It is built from the **same machinery as the dungeons** (`DungeonDef`, tile layout, `DungeonScene`, `BossController` + boss scripts, `boss_lock` / `boss_exit` doors, host-authoritative `RunState`), with difficulty modes, a weekly lockout, tier tokens and boss mechanics from the §10 library. Name rationale: *Efsun* is the game's central magic; the Kale is built around the first **Efsun Kaynağı** (the source), and its five guardians are the bosses.

### 9.1 Identity

| field | value |
|---|---|
| id | `efsun_kalesi` |
| Name / short | Efsun Kalesi / Efsun Kalesi |
| Lore (TR, loading screen) | *"Kadim Zindanların en derininde, ilk Efsun Kaynağı'nın etrafına bir kale örüldü. Kaynak'ı beş muhafız korur: zincirbaşı Gürbüz, alev rahibesi Selvinaz, yaşayan kaya Dağhan, gölge vezir Karaşin ve Kaynak'ın nöbetçisi ejder Yıldızkanat. Kaynak uyanırsa bütün efsunlar zincirinden boşalır."* |
| Players | 1–5 (design 5); party size locks at entry |
| Entry | 5th portal in the Kadim Kapılar Salonu (gold-purple swirl, `TownNpc role 'portal'`, `dungeonId 'efsun_kalesi'`), or the **Raid Bulucu** tab of the party panel (§9.7) |
| Unlock | Normal: level 60 and **one Mitik 0 clear** (any dungeon). Kahramanlık: kill Yıldızkanat on Normal. Mitik: kill Yıldızkanat on Kahramanlık **and** M+ rating ≥ 800 |
| Enemy level | Normal 62 · Kahramanlık 64 · Mitik 66 (armour formula uses this level) |
| Grid | 56 × 48 tiles (224 × 192 m) |
| Completion | all 5 bosses dead (**no forces**: `DungeonDef.raid` makes `MythicPlus.checkCompletion` ignore forces); then the **Efsun Sandığı** spawns in the final arena + exit portal |
| Theme | fog `0x16102a`, near 10 m, far 46 m; ambient `0x4a3c6a` × 0.40; hemisphere sky/ground `0x7a6aa0` / `0x241830`; torch `0xffb060` with purple accents `0xb060ff`; bloom 0.7; KayKit texture tint `0xd0c8e0`; palette `0x1a1428, 0x4a3c6a, 0xd0c8e0, 0xb060ff, 0xffb060`; music `dungeon_temple` for rooms (reuse), boss fights `boss` (existing). A new `MusicId` `raid_final` is optional for Yıldızkanat |
| Visual direction | a violet-stone citadel with floating arcane crystals; each boss arena has its own tint: Gürbüz iron/brown, Selvinaz crimson fire, Dağhan grey stone, Karaşin deep purple/black, Yıldızkanat white-violet starfield ceiling |

### 9.2 Difficulty modes and player-count scaling

Formulas: `bossHP = monsterHP(L) × hpMult × diffHp × partyHp(n)` and `dmg = monsterDmg(L) × dmgMult × diffDmg` with `monsterHP(L) = round(14 + 0.62 L²)`, `monsterDmg(L) = round(14 + 4.5 L)` (GDD_SYSTEMS §1.10). `partyHp(n) = 1 + 0.6 (n − 1)` for Normal/Kahramanlık, `1 + 0.7 (n − 1)` for Mitik (same as the dungeon rules). The `hpMult` column of each boss ≈ the **solo time-to-kill in seconds at par**: with 5 players (effective 3.7× solo DPS because tank/healer deal less) the fights last about **4–7 minutes**.

| | Normal | Kahramanlık (`heroic`) | Mitik (`mythic`) |
|---|---|---|---|
| Enemy level | 62 | 64 | 66 |
| Boss HP × / DMG × | 1.00 / 1.00 | 1.35 / 1.25 | 1.90 / 1.60 |
| Trash HP × / DMG × | 1.00 / 1.00 | 1.25 / 1.20 | 1.60 / 1.45 |
| Extra mechanics | – | **+1 per boss** (marked K) | **+2 per boss** (K and M) |
| Soft / hard enrage timers | base | −8% | −15% |
| Drop ilvl / tier piece ilvl | 66 / 69 | 72 / 75 | 78 / 81 |
| Recommended ilvl (shown red/green in the finder) | 62 | 70 | 76 |
| Kadim XP per boss | 6% | 10% | 15% |

**Player-count scaling** (host applies at entry; `RunState` carries `partySize`)

| n | HP × (Normal/Kah.) | HP × (Mitik) | Soak circles / required soakers each | Spread / link targets | Add count × | Enrage × | Tank swap |
|---:|---:|---:|---|---:|---:|---:|---|
| 1 | 1.0 | 1.0 | 1 / 1 | 0 (link skipped) | 0.5 | 1.50 | stacks capped at 3 and decay 2× faster |
| 2 | 1.6 | 1.7 | 1 / 1 | 1 | 0.65 | 1.35 | as above |
| 3 | 2.2 | 2.4 | 2 / 1 | 1 | 0.80 | 1.20 | as above |
| 4 | 2.8 | 3.1 | 2 / 2 | 2 | 0.90 | 1.10 | **swap required** (stack debuffs full) |
| 5 | 3.4 | 3.8 | 3 / 2 | 3 | 1.00 | 1.00 | **swap required** |

Add counts are rounded up (min 1). Raid-wide damage pulses scale by `max(0.6, 0.5 + 0.1 n)`. Damage, intermission lengths and telegraph times never scale. Wipes: arena reset in 5 s, dead respawn at the last **Diriliş Taşı** (the start and the exit door of each killed boss).

**Savaş Dirilişi (battle revive):** hold `F`/`Z` for 4 s on a fallen ally during a boss fight (reviver cannot act): **2 per attempt for n ≥ 4, 1 for n ≤ 3**, reset on a wipe. HUD shows the charges next to the boss frame. (`RunState.brez?: number`.)

### 9.3 Layout (same format as GDD_CONTENT §4.x)

Directions: **yaw 0 = +z (south on the grid), 90 = +x (east), 180 = −z (north), 270 = −x (west)**. Rooms abut each other exactly (door tile is in room `a`, on the boundary facing `side`), like the existing dungeons. `start` = south centre; the final arena is the north centre.

```
     0         1         2         3         4         5
     01234567890123456789012345678901234567890123456789012345
  0                              555555555555555544444444444
  1                              555555555555555544444444444
  2                              555555555555555544444444444
  3                              555555555555555544444444444
  4                              555555555555555544444444444
  5                              555555555555555544444444444
  6                              555555555555555544444444444
  7                              555555555555555544444444444
  8                  222222222222555555555555555544444444444
  9                  222222222222555555555555555544444444444
 10  KKKKKKKKKKKKKK  222222222222555555555555555544444444444
 11  KKKKKKKKKKKKKK  2222222222225555555555555555    ##
 12  KKKKKKKKKKKKKK  222222222222       ##           dd
 13  KKKKKKKKKKKKKK  222222222222       ff       GGGG++GGGGG
 14  KKKKKKKKKKKKK+b#222222222222       ff       GGGGGGGGGGG
 15  KKKKKKKKKKKKK+b#222222222222       ff       GGGGGGGGGGG
 16  KKKKKKKKKKKKKK  222222222222  MMMMM++MMMMM  GGGGGGGGGGG
 17  KKKKKKKKKKKKKK  22222222222%x+MMMMMMMMMMMM+y+GGGGGGGGGG
 18  KKKKKKKKKKKKKK  22222222222%x+MMMMMMMMMMMM+y+GGGGGGGGGG
 19  KKKKKKKKKKKKKK  222222222222  MMMMMMMMMMMM  GGGGGGGGGGG
 20  KKKKKKKKKKKKKK                MMMMMMMMMMMM  GGGGGGGGGGG
 21  KKKKKKKKKKKKKK                MMMMMMMMMMMM  GGGGGGGGGGG
 22        ++                      MMMMMMMMMMMM      ++
 23        vv                      MMMMMMMMMMMM      uu
 24        vv                        ++              uu
 25        vv                        mm              uu
 26    1111%%1111                    mm          3333%%33333
 27    1111111111                    mm          33333333333
 28    1111111111    HHHHHHHHHHHHHHHH++HHHHHH    33333333333
 29    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 30    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 31    1111111111#www+HHHHHHHHHHHHHHHHHHHHHH+eee#33333333333
 32    1111111111#www+HHHHHHHHHHHHHHHHHHHHHH+eee#33333333333
 33    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 34    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 35    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 36    1111111111    HHHHHHHHHHHHHHHHHHHHHHHH    33333333333
 37    1111111111    HH++HHHHHHHHHHHHHHHHHHHH    33333333333
 38                    hh       ++
 39                    ++       ss
 40              TTTTTTTTTTTT   ss
 41              TTTTTTTTTTTT   ss
 42              TTTTTTTTTTTTSSS++SSS
 43              TTTTTTTTTTTTSSSSSSSS
 44              TTTTTTTTTTTTSSSSSSSS
 45              TTTTTTTTTTTTSSSSSSSS
 46                          SSSSSSSS
 47
```

Legend: `S` giris, `s` k_giris, `H` dis_avlu (hub), `h` k_hz, `T` hazine_odasi (optional), `w` k_w, `1` zincir_arena (B1), `v` k_w2, `K` kor_galerisi, `b` k_b2, `2` alev_arena (B2), `x` k_sc_w, `m` k_mer, `M` merkez_salonu, `f` k_final, `5` kaynak_arena (B5), `e` k_e, `3` kaya_arena (B3), `u` k_e2, `G` golge_galerisi, `y` k_sc_e, `d` k_b4, `4` hesap_arena (B4); door tiles: `+` open, `#` boss_lock, `%` boss_exit. Row/column numbers are tile coordinates (1 char = 1 tile = 4 m); the layout was machine-checked: no overlapping rooms, every door tile lies on a shared boundary.


**Rooms** (`rect` = x, z, w, h in tiles; size in m = ×4)

| id | Ad (TR) | rect | size (m) | floor / wall | notes |
|---|---|---|---|---|---|
| `giris` | Kale Kapısı | 24, 42, 8, 5 | 32 × 20 | temple / temple | start room, autoDecor 0.3, **Diriliş Taşı** |
| `k_giris` | Surların Altı | 27, 38, 2, 4 | 8 × 16 | temple / temple | |
| `dis_avlu` | Dış Avlu | 16, 28, 24, 10 | 96 × 40 | stone / temple | hub; 3 packs; shrine `shrine_ward` |
| `k_hz` | Hazine Geçidi | 18, 38, 2, 2 | 8 × 8 | stone_dark / temple | optional |
| `hazine_odasi` | Hazine Odası | 12, 40, 12, 6 | 48 × 24 | tiles / temple | **optional**; chests + `treasure_goblin` pack |
| `k_w` | Batı Dehlizi | 12, 31, 4, 2 | 16 × 8 | stone_dark / temple | 1 pack |
| `zincir_arena` | Zincir Salonu | 2, 26, 10, 12 | 40 × 48 | stone_dark / forge | **Boss 1 arena** (order 1); iron chains hanging, 4 pillars |
| `k_w2` | Çıkış Merdiveni | 6, 22, 2, 4 | 8 × 16 | stone / temple | 1 pack |
| `kor_galerisi` | Kor Galerisi | 0, 10, 14, 12 | 56 × 48 | lava_rock / forge | 3 packs; braziers (fire theme) |
| `k_b2` | Sunak Yolu | 14, 14, 2, 2 | 8 × 8 | lava_rock / forge | |
| `alev_arena` | Alev Sunağı | 16, 8, 12, 12 | 48 × 48 | lava_rock / forge | **Boss 2 arena** (order 2); 4 stone pillars at (19,11) (24,11) (19,16) (24,16) for the LOS phase; central altar |
| `k_sc_w` | Batı Kısayolu | 28, 17, 2, 2 | 8 × 8 | stone / temple | shortcut to `merkez_salonu` |
| `k_mer` | Merkez Merdiveni | 32, 24, 2, 4 | 8 × 16 | stone / temple | 1 pack |
| `merkez_salonu` | Merkez Salonu | 30, 16, 12, 8 | 48 × 32 | tiles / temple | hub of the shortcuts; 3 packs; shrine `shrine_haste`; **Diriliş Taşı** |
| `k_final` | Kaynak Eşiği | 35, 12, 2, 4 | 8 × 16 | temple / temple | the final door (boss_lock) |
| `kaynak_arena` | Efsun Kaynağı | 28, 0, 16, 12 | 64 × 48 | temple / temple | **Boss 5 arena** (order 5); central source well, 3 crystal platforms |
| `k_e` | Doğu Dehlizi | 40, 31, 4, 2 | 16 × 8 | stone_dark / temple | 1 pack |
| `kaya_arena` | Kaya Salonu | 44, 26, 11, 12 | 44 × 48 | stone / cave | **Boss 3 arena** (order 3); outer ring collapses (void) |
| `k_e2` | Gölge Merdiveni | 48, 22, 2, 4 | 8 × 16 | stone_dark / temple | 1 pack |
| `golge_galerisi` | Gölge Galerisi | 44, 13, 11, 9 | 44 × 36 | temple / temple | 3 packs; purple braziers; shrine `shrine_power` |
| `k_sc_e` | Doğu Kısayolu | 42, 17, 2, 2 | 8 × 8 | stone / temple | shortcut to `merkez_salonu` |
| `k_b4` | Defter Koridoru | 48, 11, 2, 2 | 8 × 8 | temple / temple | |
| `hesap_arena` | Hesap Salonu | 44, 0, 11, 11 | 44 × 44 | temple / temple | **Boss 4 arena** (order 4); 4 rune circles at (46,3) (52,3) (46,8) (52,8) r 3 m (tile units 0.75) |

**Doors** (`a` → `b`, tile in `a`, side, width in tiles, gate)

| a | b | tile (in a) | side | width | gate |
|---|---|---|---|---:|---|
| giris | k_giris | 27, 42 | n | 2 | none |
| k_giris | dis_avlu | 27, 38 | n | 2 | none |
| dis_avlu | k_hz | 18, 37 | s | 2 | none |
| k_hz | hazine_odasi | 18, 39 | s | 2 | none |
| dis_avlu | k_w | 16, 31 | w | 2 | none |
| k_w | zincir_arena | 12, 31 | w | 2 | boss_lock |
| zincir_arena | k_w2 | 6, 26 | n | 2 | boss_exit |
| k_w2 | kor_galerisi | 6, 22 | n | 2 | none |
| kor_galerisi | k_b2 | 13, 14 | e | 2 | none |
| k_b2 | alev_arena | 15, 14 | e | 2 | boss_lock |
| alev_arena | k_sc_w | 27, 17 | e | 2 | boss_exit |
| k_sc_w | merkez_salonu | 29, 17 | e | 2 | none |
| dis_avlu | k_mer | 32, 28 | n | 2 | none |
| k_mer | merkez_salonu | 32, 24 | n | 2 | none |
| merkez_salonu | k_final | 35, 16 | n | 2 | none |
| k_final | kaynak_arena | 35, 12 | n | 2 | boss_lock |
| dis_avlu | k_e | 39, 31 | e | 2 | none |
| k_e | kaya_arena | 43, 31 | e | 2 | boss_lock |
| kaya_arena | k_e2 | 48, 26 | n | 2 | boss_exit |
| k_e2 | golge_galerisi | 48, 22 | n | 2 | none |
| golge_galerisi | k_sc_e | 44, 17 | w | 2 | none |
| k_sc_e | merkez_salonu | 42, 17 | w | 2 | none |
| golge_galerisi | k_b4 | 48, 13 | n | 2 | none |
| k_b4 | hesap_arena | 48, 11 | n | 2 | boss_lock |

Boss order is **linear 1 → 5** (west wing first: Gürbüz, Selvinaz; then the east wing: Dağhan, Karaşin; then the final): `boss_lock` doors stay closed while any boss with a lower `order` lives, so the final opens only after **all four**. After each wing's last boss a **shortcut** (`k_sc_w` / `k_sc_e`) opens back to the Merkez Salonu.

**Boss placements** (`pos` tile coords, `facing` degrees)

| bossId | roomId | pos | facing | order |
|---|---|---|---:|---:|
| `rd_gurbuz` | zincir_arena | 6.5, 30 | 90 | 1 |
| `rd_selvinaz` | alev_arena | 22, 13.5 | 270 | 2 |
| `rd_daghan` | kaya_arena | 49.5, 31 | 270 | 3 |
| `rd_karasin` | hesap_arena | 49.5, 5 | 0 | 4 |
| `rd_yildizkanat` | kaynak_arena | 36, 5 | 0 | 5 |

`start: { pos: [28, 44], facing: 180 }`; `exit: { pos: [36, 9] }` (portal inside `kaynak_arena`, opens after the final boss); `extras.fontOfPower: [28, 44]` (unused, required by the type), `extras.riftSpots: []`, `extras.shrines`: `shrine_ward` (18, 30) in `dis_avlu`, `shrine_haste` (31, 22) in `merkez_salonu`, `shrine_power` (52, 20) in `golge_galerisi`; `extras.chests`: `chest_gold` at (14, 43) and (21, 43) in `hazine_odasi`. Shrines are single-use per entry and also work in the raid.

**Trash packs** (`PackDef`; no forces; levels per difficulty; elite mods (K/M) on `rd_stone_sentinel` / `rd_forge_zealot` units: Normal 0, Kahramanlık 1 mod on 25% of those packs, Mitik 1 mod on 50%, safe set only)

| pack | room | center | members | notes |
|---|---|---|---|---|
| r_p01 | dis_avlu | 22, 32 | `rd_chain_guard` ×3, `rd_forge_zealot` ×1 | kick the zealot's shield |
| r_p02 | dis_avlu | 33, 32 | `rd_chain_guard` ×3, `rd_shade_scribe` ×1 | kick Ağıt |
| r_p03 | dis_avlu | 27, 30 | `rd_stone_sentinel` ×1 | patrol (20,30) ↔ (35,30); body-pulls r_p01/r_p02 |
| r_p04 | k_w | 13.5, 32 | `rd_ember_spirit` ×6 | swarm, explode on death (frost kills them quietly) |
| r_p05 | kor_galerisi | 3, 14 | `rd_forge_zealot` ×2, `rd_ember_spirit` ×4 | |
| r_p06 | kor_galerisi | 9, 14 | `rd_stone_sentinel` ×1, `rd_forge_zealot` ×1 | tank buster pack |
| r_p07 | kor_galerisi | 6, 18 | `rd_shade_scribe` ×1, `rd_chain_guard` ×3 | healer first |
| r_p08 | k_w2 | 6.5, 23.5 | `rd_ember_spirit` ×6 | |
| r_p09 | k_e | 41.5, 32 | `rd_chain_guard` ×4 | Zincir Kancası pulls: stay together |
| r_p10 | k_e2 | 48.5, 23.5 | `rd_ember_spirit` ×6 | |
| r_p11 | golge_galerisi | 47, 16 | `rd_shade_scribe` ×2, `rd_wyrmling` ×2 | 2 kicks |
| r_p12 | golge_galerisi | 52, 16 | `rd_stone_sentinel` ×1, `rd_chain_guard` ×3 | |
| r_p13 | golge_galerisi | 49.5, 19.5 | `rd_forge_zealot` ×2, `rd_shade_scribe` ×1 | |
| r_p14 | merkez_salonu | 33, 19 | `rd_wyrmling` ×3, `rd_shade_scribe` ×1 | flying; ranged pull |
| r_p15 | merkez_salonu | 38, 19 | `rd_stone_sentinel` ×2 | two tanks or one swap |
| r_p16 | merkez_salonu | 35.5, 21.5 | `rd_forge_zealot` ×3, `rd_ember_spirit` ×4 | patrol (31,21.5) ↔ (40,21.5) |
| r_p17 | k_mer | 33, 25.5 | `rd_chain_guard` ×2 | |
| r_p18 | hazine_odasi | 17, 42.5 | `rd_chain_guard` ×4, `treasure_goblin` ×1 | **optional**, Hazine Goblini guaranteed on K/M |

**Suggested clear order** (the raid "route preset"): dis_avlu (r_p01, r_p02, patrol r_p03 last) → west: r_p04 → **B1** → r_p08, r_p05–r_p07 → **B2** → shortcut → merkez_salonu r_p14–r_p16, r_p17 → east: r_p09 → **B3** → r_p10, r_p11–r_p13 → **B4** → shortcut → merkez → **B5**. Optional `hazine_odasi` any time after B1.

### 9.4 The five bosses

General: telegraph minimums of GDD_CONTENT §0.6 apply (≥ 1.0 s boss ability, ≥ 1.2 s above coef 4, ≥ 2.0 s room-wide). `coef` is × the boss's base damage. Raid damage pulses are "% max HP of every player". Every boss: `ccImmune`, `rank 'boss'`, **raid poise 900** (× family: golem 1.5, dragon 1.3), poise-break window 2.0 s, lock 30 s, `Kritik Vuruş` = 1.5% max HP (capped 20×W). **Hard enrage** = party wipe pulse "5% max HP per second stacking" after the timer. Mechanic ids refer to §10 templates.

#### Boss 1 — Zincirbaşı Gürbüz (`rd_gurbuz`), "Kale Kapısının Zincir Efendisi"

| field | value |
|---|---|
| family / role | `humanoid` / melee tank-buster, profile `stacker` |
| hpMult / dmgMult | 260 / 2.6 (Normal), speed 5.2, radius 1.6, scale 1.9, tint `0x9a8a7a` (model suggestion `MON('Orc')`) |
| Arena / enrage | `zincir_arena` 40 × 48 m; soft enrage 5:30 (attack speed +25%), hard 7:30 |
| Intro / death | "Kale kapısını kimse açamaz!" / "Zincirler... çözüldü..." |

| Phase | HP | Ability (id · TR) | Timing | Telegraph / template | Damage (category) | Notes |
|---|---|---|---|---|---|---|
| P1 Zincir Efendisi | 100–66% | `gurbuz_slash` Zincir Savurma | cd 8 s | cone 100° / 6 m, windup 1.0 s · `tank_buster` | coef 3.5 (tank buster, blockable, not parryable) | +1 `Yırtık` stack (+20% damage taken from him, 30 s, max 6); **swap at 3** |
| | | `gurbuz_link` Zincir Bağı | first 12 s, cd 25 s | `link_spread` (pairs = spread table) | explosion coef 4.0 r 5 if linked players end within 5 m; stretching beyond 14 m deals coef 2.0/s | keep 5–14 m apart for 8 s |
| | | `gurbuz_orbs` Yıkım Küreleri | first 20 s, cd 30 s | `soak` (circles = soak table, r 4 m, 4 s) | each circle: 40% max HP split among soakers; unsoaked = raid pulse 25% + knock-up | |
| P2 Demir Yağmuru | 66–33% | (P1 abilities, link cd 22 s, orbs cd 26 s) + `Zincir Zırhı` | at 66% | `phase_shield`: absorb 8% boss max HP; breaking it = poise break | – | shield must be broken to continue; **Kritik Vuruş window** |
| | | `gurbuz_guards` Muhafızları Çağır | first 18 s, cd 40 s | `add_wave`, 1.4 s interruptible cast (**kick 2**), 2 × `rd_chain_guard` (×n scaling, HP 5% boss) | guards cast `Zincir Çek` after 25 s: pull a random player + coef 2.0 | kill guards or kick |
| Intermission | at 33% | `gurbuz_walls` Kale Duvarları | 12 s, boss invulnerable at centre | `intermission` + `wall_sweep`: 6 sweeps (2 × 40 m rects, 1 safe lane 6 m, alternating W/E every 2 s, 1.6 s telegraph) | coef 5.0 + knockback | green lane shows the safe spot |
| P3 Çılgın Zincir | 33–0% | attack speed +25%; `gurbuz_execute` Kıyım | cd 30 s | cone 120° / 8 m, windup 1.8 s · **perilous** (`tank_buster`) | coef 5.0 | dodge or major defensive |
| | | link cd 18 s with 3 pairs (5 players: 2 pairs + 1 solo marked); orbs cd 20 s with +1 circle; guards cd 35 s | | | | hard enrage 7:30 |
| **K (+1)** | | `Zincir Bağı` snaps leave a bleed (Kanama 3 stacks) | | | | |
| **M (+2)** | | orbs leave poison puddles (r 3 m, 8 s); guards spawn with the `kalkanli` elite mod | | | | |

Loot: token `tk_gloves`; exclusive unique `leg_rd_chain_ring` (§9.6).

#### Boss 2 — Kor Rahibe Selvinaz (`rd_selvinaz`), "Alev Sunağının Rahibesi"

| field | value |
|---|---|
| family / role | `cultist` with `def.resist` {fire +90, frost −40} / caster (kites at the centre), profile `ranged_focus` (no tank swap) |
| hpMult / dmgMult | 300 / 2.4, speed 0 (stays on the altar), radius 1.0, scale 1.7, tint `0xc03020`, emissive `0x601000` (model `CHAR('Mage')`) |
| Arena / enrage | `alev_arena` 48 × 48 m; soft enrage 6:00 (beam rotation +25%), hard 8:00 |

| Phase | HP | Ability | Timing | Telegraph / template | Damage | Notes |
|---|---|---|---|---|---|---|
| P1 Alev | 100–70% | `selvinaz_fireball` Kor Topu | cd 3.5 s, 1.5 s cast | single target (`target 0`) | coef 2.4 fire + `Yanık` stack (max 6, 3%/stack, dispellable) | not interruptible (boss) |
| | | `selvinaz_beams` Alev Işınları | first 14 s, cd 30 s | `beam_rotate`: 3 beams 120° apart, width 3 m, rotate 0.35 rad/s for 8 s, 1.5 s telegraph | coef 3.0 per 0.5 s tick | run with the rotation between beams |
| | | `selvinaz_sparks` Kıvılcım | first 22 s, cd 28 s | `spread` (targets 3 at n = 5), 4 s, r 5 m | coef 2.2 on everyone inside | stay ≥ 6 m apart |
| Intermission 1 | at 70% | `Yükselen Alev` | 25 s, boss untargetable | `intermission` + `safe_zone_flood`: floor floods except a safe disc r 10 → 6 m; **4 `rd_flame_altar`** (breakable, HP 6% boss HP) + 6 `rd_ember_spirit` every 8 s run to the boss (each arrival heals her 4%) | flooded floor coef 1.5 per 0.5 s | altars must die in 25 s else raid pulse 40% + 2 s stun |
| P2 Kor Ruhları | 70–35% | `Alev Işınları` ×4 beams (cd 28 s), `Kıvılcım` ×4 targets (cd 24 s) | | | | |
| | | `selvinaz_spirits` Kor Ruhları | first 18 s, cd 35 s | `add_wave`: 6 `rd_ember_spirit` (swarm; explode r 2 m coef 1.0 when they die next to players unless frost-killed) | | |
| | | `selvinaz_pyres` Sunak Alevleri | first 30 s, cd 40 s | `soak` variant: 3 pyres, each needs **2 players** standing 4 s (n = 5; 1 for n ≤ 3) | unextinguished: raid pulse 15% + `Yanık` ×3 | |
| Intermission 2 | at 35% | `Yükselen Alev II` | 30 s | 6 altars, safe disc 8 → 5 m, 8 spirits per wave | as above | |
| P3 Kor Kasırgası | 35–0% | all P2 cooldowns −15%; `selvinaz_inferno` Cehennem Nefesi | cd 45 s | `pillar_los`: 12 s of raid pulses (8% max HP every 3 s); 4 stone pillars give cover (hide behind one, 2 players per pillar max effective) | raid pulse 8% | line of sight through the pillar blocks it |
| **K (+1)** | | beams +1 (4/5) | | | | |
| **M (+2)** | | spirits leave burning puddles; sparks mark +1 target | | | | |

Weakness note: frost-based damage is **ZAYIF!** (+40%), fire is nearly useless; `flask_ruby` removes `Yanık`. Loot: `tk_shoulders`; unique `leg_rd_ember_amulet`.

#### Boss 3 — Taş Muhafız Dağhan (`rd_daghan`), "Surların Yaşayan Kayası"

| field | value |
|---|---|
| family / role | `golem` / melee tank, profile `stacker` |
| hpMult / dmgMult | 340 / 2.8, speed 4.2, radius 2.0, scale 2.4, tint `0x8a8a90` (model `MON('Giant')`), **poise 1350** (golem ×1.5) |
| Arena / enrage | `kaya_arena` 44 × 48 m (inner floor radius 22 m); soft enrage 6:30 (arena shrinks to 14 m), hard 8:30 |

| Phase | HP | Ability | Timing | Telegraph / template | Damage | Notes |
|---|---|---|---|---|---|---|
| P1 Kaya Zırhı | 100–66% | `daghan_fist` Ezici Yumruk | cd 10 s | cone 90° / 6 m, windup 1.2 s · `tank_buster` | coef 4.0, +1 `Çatlak Kemik` (−15% armour, +12% damage taken from him, 30 s, max 8) | swap at 4 |
| | | `daghan_quake` Sarsıntı Dalgaları | first 10 s, cd 18 s | `ring_wave_jump`: 3 expanding rings (r 4 → 20 m, 0.8 s apart) | coef 2.0 each | **jump over** (airborne at contact) or dodge i-frames |
| | | `daghan_boulders` Kaya Yağmuru | first 20 s, cd 30 s | `soak`: circles r 3 m (soak table), line markers 2.0 s | soaked: 30% max HP split; unsoaked: raid pulse 12% | |
| | | `daghan_armor` Kaya Zırhı | at 85% and 60% | `phase_shield` **poise-gated**: for 15 s damage taken −80% and poise ×2; **break the poise** (or finish the 15 s) | break → `Çatlak Çekirdek`: boss takes +30% damage for 12 s and cannot attack; no break → raid pulse 30% + 3 `Taş Deri` stacks on the tank | the Elden Ring poise system is the mechanic |
| P2 Yıkılan Zemin | 66–33% | `daghan_collapse` Kenar Çökmesi | at 66%, then cd 45 s | `floor_tile_hazard`: a 90° arc of the outer ring collapses (3 s telegraph); inner radius 22 → 17 → 14 m | falling in: 40% max HP + 2 s stun, respawn at the edge | positional squeeze |
| | | Boulders +1 circle, Quake 4 rings | | | | |
| P3 Yarım Golemler | 33–0% | `daghan_split` | at 33% | `linked_death`: 2 × `rd_daghan_half` (each 50% of the remaining HP; separate aggro, **each stacks `Çatlak Kemik`**) | must die within **10 s** of each other or the survivor revives the other at 50% | two tanks or a swap; n ≤ 3: halves share a slow enrage |
| | | `daghan_crush` Ezilme (one half) | cd 25 s | circle r 6 m on the farthest player, 2.0 s | coef 4.0 | |
| **K (+1)** | | halves share `Kaya Zırhı` casts | | | | |
| **M (+2)** | | quake +2 rings; boulders leave lava puddles (r 3 m, 10 s) | | | | |

Hard enrage 8:30. Weakness: lightning ZAYIF!; poison/bleed immune; Kritik Vuruş windows are the key DPS spikes. Loot: `tk_legs`; unique `leg_rd_stone_belt`.

#### Boss 4 — Gölge Vezir Karaşin (`rd_karasin`), "Ruhların Hesap Bekçisi"

| field | value |
|---|---|
| family / role | `cultist` with `def.resist` {shadow +60, holy −35} / caster (hovers), profile `stacker` (shadow) |
| hpMult / dmgMult | 380 / 2.5, speed 5.0, radius 1.1, scale 1.7, tint `0x301048` (model `CHAR('Mage')`, hover bob) |
| Arena / enrage | `hesap_arena` 44 × 44 m; soft enrage 7:00, hard 9:00 |

| Phase | HP | Ability | Timing | Telegraph / template | Damage | Notes |
|---|---|---|---|---|---|---|
| P1 Hesap Açılır | 100–70% | `karasin_bolt` Defter Oku | cd 3 s, 1.2 s cast | tank target · `tank_buster` every 4th cast coef 4.0 | coef 2.2 shadow, +1 `Kara Mühür` stack (+20% shadow damage taken, 30 s, max 6) | swap at 3 |
| | | `karasin_soul_seal` Ruh Mührü | first 14 s, cd 30 s | `dispel_check`: 3 players (n scaling) get a dispellable debuff, 8 s | on expiry: shadow explosion r 6 m coef 4.0 on the holder | **dispel it** (`Arındır`/`Panzehir`) or kill-cleanse via flask `flask_amethyst` |
| | | `karasin_stalker` Gölge Takipçi | first 20 s, cd 28 s | `fixate`: a shade (`rd_karasin_shade`, HP 6% boss, speed 5.6) fixates the farthest player 10 s | touch: coef 3.0 + slow 40% 4 s | kill or kite |
| | | `karasin_nova` Karanlık Nova | first 26 s, cd 30 s | `spread`: 2 marked players, 3 s, r 5 m | coef 3.0 | |
| Intermission 1 | at 70% | `Gölge Âlemi` | 22 s | `intermission` + `phase_realm`: arena tinted purple, boss untargetable; 3 waves of `rd_shade_scribe` (kick 2 on `Ağıt`: completed cast = raid pulse 8%) | pulses 8% | kill **8 scribes** to exit; failing = pulse ×3 |
| P2 Defter | 70–40% | `karasin_ledger` Hesap Defteri | first 15 s, cd 40 s | `rune_sequence`: 4 rune circles light in order (0.7 s each, shown 3 s), then resolve in the same order every 1.5 s | each circle needs 1 player inside for 1.2 s; fail = raid pulse 10% | memory + movement |
| | | `karasin_cage` Kafes | first 25 s, cd 45 s | `trap` (existing Kemik Hapsi logic): 2 players in crystal cages 12 s (HP 3% boss) | caged: shadow tick 2% max HP/s | free them by attacking the cage |
| Intermission 2 | at 40% | `Gölge Âlemi II` | 15 s | 6 scribes | | |
| P3 Son Hesap | 40–0% | `karasin_blink` Gölge Adımı | cd 12 s | blinks to a random player, r 4 m after 1.0 s | coef 3.0 | all earlier mechanics at −20% cooldowns |
| **K (+1)** | | Ruh Mührü +1 player | | | | |
| **M (+2)** | | Defter 6 runes; cages 3 players | | | | |

Weakness: holy ZAYIF!, shadow resisted. Hard enrage 9:00. Loot: `tk_helm`; unique `leg_rd_ledger_ring`.

#### Boss 5 — Efsun Ejderi Yıldızkanat (`rd_yildizkanat`), "Efsun Kaynağının Nöbetçisi"

| field | value |
|---|---|
| family / role | `dragon` / melee-ranged hybrid, profile `stacker` |
| hpMult / dmgMult | 480 / 2.8, speed 6.0, radius 2.2, scale 2.6, tint `0xb0a0ff`, emissive `0x4020a0` (model `MON('Dragon_Evolved')`), poise 1170 (dragon ×1.3) |
| Arena / enrage | `kaynak_arena` 64 × 48 m; soft enrage 8:00 (+20% damage per 30 s stack), hard 10:00 |

| Phase | HP | Ability | Timing | Telegraph / template | Damage | Notes |
|---|---|---|---|---|---|---|
| P1 Yer | 100–75% | `yk_claw` Pençe | cd 8 s | cone 100° / 7 m, windup 1.0 s · `tank_buster` | coef 4.0, +1 `Efsun Çürüğü` (−10% max HP, +15% arcane damage taken, 30 s, max 6) | swap at 3 |
| | | `yk_tail` Kuyruk Savurma | first 8 s, cd 14 s | `positional_tank_face`: rear cone 140° / 10 m, windup 1.2 s with tail glow | coef 3.5 + knockback 6 m | tank must keep her **facing away** from the party |
| | | `yk_breath` Efsun Nefesi | first 12 s, cd 24 s | cone 80° / 26 m at a random player, 1.6 s telegraph | coef 3.0 + `Efsun Yanığı` (dispellable DoT 6 s) | |
| | | `yk_gust` Kanat Rüzgârı | cd 30 s | raid knockback 8 m | coef 1.5 | |
| P2 Gökyüzü | 75–50% | she hovers at 10 m: **melee cannot reach**; ranged/magic can | | | | wyrmlings give melee targets |
| | | `yk_meteors` Yıldız Düşüşü | cd 20 s | `meteor_line`: 5 lines (width 3 m), 1.8 s telegraph | coef 3.5 | |
| | | `yk_hatchlings` Efsun Yavruları | first 10 s, cd 45 s | `add_wave`: 4 × `rd_wyrmling` (×n scaling) land; each alive at phase end gives her +25% damage; `Alev Soluğu` interruptible (kick 1) | | |
| | | `yk_starfall` Yıldız Çöküşü | first 25 s, cd 40 s | `soak`: 3 circles r 5 m (soak table, **2 soakers** for n ≥ 4) | soaked: 35% max HP split; unsoaked: raid pulse 20% | |
| Intermission 1 | at 50% | `Kaynak Patlaması` | 20 s | arena floods with arcane fire except **3 crystal platforms** (r 5 m); 3 `rd_crystal` (HP 5%, `stanceBreakable` false) | flood coef 2.0 per 0.5 s | destroy all 3 within 20 s → she is stunned 8 s (+40% damage); each survivor adds a raid pulse |
| P3 Efsun Fırtınası | 50–25% | `yk_shell` Efsun Kabuğu | every 20 s, cycle **Ateş → Buz → Gizem**, 2 s colour warning | `elemental_shell`: **Ateş**: fire +100, frost −50 · **Buz**: frost +100, fire −50 · **Gizem**: elemental +60, holy −50 | shell change = Kabuk Patlaması r 12 m coef 2.0 + knockback | creature-weakness system in action: swap elements; physical is unaffected (25% resist) |
| | | `yk_storm` Efsun Fırtınası | cd 35 s | `roaming_zone`: 3 storm zones r 4 m drifting 3.5 m/s for 12 s | coef 2.0 per 0.5 s | |
| | | claw / tail / breath ×2 (two cones) | | | | |
| Intermission 2 | at 25% | `Çöküş` | 15 s | arena shrinks to the inner ring (r 14 m); 3 stars must be soaked | raid pulse 15% / failed star | |
| P4 Çöküş | 25–0% | all mechanics at −20% cooldowns; Efsun Çürüğü stacks 2× | | soft enrage ramp | | hard enrage 10:00 |
| **K (+1)** | | Yıldız Çöküşü +1 circle | | | | |
| **M (+2)** | | shells cycle every 15 s; meteors +2 lines | | | | |

Weakness: lightning ZAYIF!; arcane good outside the shells. Loot: `tk_chest` (+ 25% second token); unique `leg_rd_star_heart`; Efsun Sandığı.

**Mechanic coverage matrix** (every raid uses every required family of mechanic):

| Boss | Positional | Soak | Spread / link | Add waves | Intermission | Tank swap | Enrage | Special |
|---|---|---|---|---|---|---|---|---|
| Gürbüz | wall sweep lanes | orbs | link | guards | ✓ (1) | ✓ | ✓ | phase shield |
| Selvinaz | rotating beams | pyres | sparks | spirits | ✓ (2) | – (caster) | ✓ | pillar LOS, safe-zone flood |
| Dağhan | arena collapse, jump rings | boulders | – | – | (poise-gated shield) | ✓ | ✓ | **poise break window**, linked split |
| Karaşin | rune circles | rune soak | nova | scribes | ✓ (2, shadow realm) | ✓ | ✓ | dispel check, fixate, cages |
| Yıldızkanat | tail cone | star soak | breath | wyrmlings | ✓ (2) | ✓ | ✓ | **elemental shell (weakness)** |

### 9.5 Raid enemies (`data/enemies.ts` additions, owner: enemies)

`hp`/`dmg` are the usual multipliers on the trash baseline (level 62/64/66). Models are existing assets (`MON`/`CHAR`), tinted. `kick` = interrupt priority.

| id | TR | family | role / rank | HP × / DMG × | speed | Model (suggestion) | Abilities |
|---|---|---|---|---|---:|---|---|
| `rd_chain_guard` | Zincir Nöbetçisi | `humanoid` | melee / trash | 1.3 / 1.2 | 5.4 | `CHAR('Knight')` tint `0x6a6a7a` | `Zincir Kancası` (pulls the farthest player 6 m, 1.2 s cast, kick 1, cd 14 s) |
| `rd_forge_zealot` | Alev Mürit | `cultist` (fire +50, frost −25) | caster / trash | 1.2 / 1.3 | 4.9 | `CHAR('Mage')` tint `0xc03020` | `Alev Salvosu` (3 fireballs 0.9, 1.6 s cast, kick 1), `Kor Kalkanı` (absorb 10% on an ally, kick 2) |
| `rd_ember_spirit` | Kor Ruhu | `elemental_fire` | swarm / trash | 0.3 / 0.6 | 8.0 | `MON('Ghost')` tint `0xff7030` emissive | explodes on death r 2 m coef 0.8 fire (not when killed by frost) |
| `rd_stone_sentinel` | Taş Nöbetçi | `golem` | tank / elite | 4.5 / 1.8 | 3.8 | `MON('Giant')` tint `0x8a8a90` | `Taş Yumruk` (cone 4.0, windup 1.2 s, **perilous** on Mitik), `Yer Sarsıntısı` (ring 2.0); ccImmune; poise 160 |
| `rd_shade_scribe` | Gölge Kâtip | `cultist` (shadow +40) | healer / trash | 1.3 / 1.0 | 4.9 | `CHAR('Mage')` tint `0x301048` | `Ağıt` (raid pulse 3% max HP, 2.0 s cast, kick 2), `Defter Kalkanı` (absorb 12% on an ally, kick 2) |
| `rd_wyrmling` | Efsun Yavrusu | `dragon` | ranged / trash, flying | 0.9 / 1.1 | 7.0 | `MON('Dragon')` scale 0.6 | `Alev Soluğu` (cone 60° / 6 m coef 1.2, 1.4 s cast, kick 1) |
| `rd_flame_altar` | Alev Sunağı | – | breakable (B2) | HP 6% boss | 0 | prop + `PROC:rift` glow | `stanceBreakable false`; channels the boss shield |
| `rd_crystal` | Efsun Kristali | – | breakable (B5) | HP 5% boss | 0 | `gen/props/crystal_purple` ×2 | `stanceBreakable false` |
| `rd_daghan_half` | Yarım Golem | `golem` | boss add (B3) | 50% of the remaining HP | 4.2 | `MON('Giant')` scale 1.6 | boss kit subset: Yumruk, Ezilme |
| `rd_karasin_shade` | Gölge Takipçi | `ghost` | boss add (B4) | HP 6% boss | 5.6 | `MON('Ghost')` tint `0x200010` | fixates, touch coef 3.0 + slow |

### 9.6 Lockout, loot, vault

| Rule | Value |
|---|---|
| Lockout | weekly (Monday 04:00 TR, the same instant as keys/vault) **per difficulty and per boss**: `CharacterSave.raid: { week: number; killed: { normal: string[]; heroic: string[]; mythic: string[] } }`. A boss killed this week by that character gives **no loot/XP again** on that difficulty (the fight still happens for the party; the entry panel lists locked bosses). Each peer applies its own lockout when rolling loot |
| Loot | personal (GDD_SYSTEMS §7.5); table below |
| Efsun Sandığı | after Yıldızkanat: 1 item (ilvl as the difficulty) + orbs from the §4.3 raid row |
| Kadim Kasa (raid row) | weekly vault gains a **raid row**: slots unlock at **2 / 4 / 5** bosses killed this week on Kahramanlık or Mitik (the best difficulty per boss counts); slot ilvl = difficulty ilvl + 3 (75 / 81); can show a tier token |
| Titles | "Efsun Kalesi Fatihi" (Normal), "Kadim Kale Kahramanı" (Kahramanlık), "Efsun Efendisi" (Mitik) on the first kill of Yıldızkanat |

| | Normal | Kahramanlık | Mitik |
|---|---|---|---|
| Items per boss per player | 1 | 2 | 2 |
| Rarity | Destansı+; Efsanevi 8% | Destansı+; Efsanevi 12% | Destansı+; Efsanevi 18% (Aspektli 70%, roll ≥ 0.40) |
| Raid exclusive unique (1 per boss) | 6% | 10% | 15% |
| Tier token (§6.4) | 35% | 70% | 100% |
| Currencies / runes | §4.3 raid row / §4.1 raid row | same | same |
| Glyph (§5.3) | – | 15% | 30% |
| Ruh Taşı / Kadim Toz | 1 / 4 | 2 / 4 | 3 / 6 |
| Gold per boss | 3,000 | 5,000 | 8,000 |

**Raid exclusive uniques** (items module adds them to `data/uniques.ts` with `source: 'Efsun Kalesi'`):

| id | Ad | Slot | Effect |
|---|---|---|---|
| `leg_rd_chain_ring` | Zincirbaşının Halkası | ring | after a **block or parry**: 3 s of +15% armour and +20% poise damage |
| `leg_rd_ember_amulet` | Kor Rahibenin Tılsımı | amulet | Yanan düşmanlara +25% hasar; ateş direnci +25 pp; fire hits have 20% chance to spread Yanma (4 m) |
| `leg_rd_stone_belt` | Taşın Kalbi Kemeri | belt | +40 Siper Dayanıklılığı; after a stun/freeze ends: 3 s +30% armour |
| `leg_rd_ledger_ring` | Hesap Defteri Yüzüğü | ring | each **Kes** (interrupt) grants +10% damage for 6 s (3 stacks) |
| `leg_rd_star_heart` | Yıldızkanat'ın Kalbi | amulet | 45 s / 90 s majors recover 10% faster; using one grants +15% damage for 6 s |

### 9.7 Entry, UI and implementation notes

- **Raid Bulucu** (new tab on the `party` panel): difficulty selector, per-boss lockout ticks (per character, and for each party member), recommended ilvl (red/green), "Hazırım" ready check (15 s, reuses the M+ ready check), the leader's "Raid'e Gir" → `G.net.requestScene('dungeon', { dungeonId: 'efsun_kalesi', difficulty, partySize, seed, affixes: [], enemyLevel: 62 | 64 | 66, keyOwner: '' })`.
- `DungeonDef.raid?: { lockout: true; bossOrder: string[]; wipeResetSec: 5; brez: { perAttempt: [1, 1, 1, 2, 2] } }` marks the dungeon as a raid (`MythicPlus.checkCompletion`: complete when every boss is dead; no timer, no forces, no keystone, `RunState.raid = true`).
- `RunState` additions: `raid?: boolean; wipes?: number; brez?: number; seals?: string[]; deathLog?: …` (§A).
- **Raid markers** (skull/cross/moon/diamond/square) for pull and mechanic callouts: `req` kind `marker`, 1 per player, 5 markers, shown above targets/ground for the party.
- **Map:** `kale` tab in the map panel with the room graph, cleared boss ticks and the suggested clear order.
- The boss scripts live in `ai/bosses/efsun.ts` and use **only** library helpers from `ai/bosses/mechanics.ts` (§10) plus the existing `kit.ts`.

---

## 10. Boss mechanic library (reusable templates)

**Goal:** implement each mechanic **once** in `src/ai/bosses/mechanics.ts` and reuse it from any boss script (`ai/bosses/*.ts`), trash ability, elite mod or affix. It builds on the existing `ai/bosses/kit.ts` helpers (`circle`, `ring`, `beam`, `band`, `wedge`, `zone`, `dashLine`, `pickPlayers`, `playersIn`, `farthestPlayer`, `statusPlayer`, `spawnMech`, `trapPlayer`, `updatePrisons`, `every`, `floatOver`) and the `BossController` / `HitShapes` pipeline (telegraphs and damage are **replicated HitShapes**, every peer resolves them for its own local player; marks and UI cues go through `ai/bossNet.ts`).

**Shape of a template**

```ts
export interface MechanicHandle { update(dt: number): void; abort(): void; readonly done: boolean }
export type MechanicFn<P> = (c: BossController, params: P) => MechanicHandle;   // started from an ability's start()/tick(), ticked from tick()
export const MECH = { spread, stackShare, soak, linkSpread, tetherPull, beamRotate, safeZoneFlood, pillarLos, addWave, addPriority,
  intermission, phaseShield, wallSweep, ringWaveJump, floorTileHazard, tankSwapDebuff, positionalTankFace, frontalCleave, fixate,
  dispelCheck, runeSequence, trapCage, elementalShell, linkedDeath, roamingZone, meteorLines, raidPulse, enrage, knockbackEdge, interruptibleCast } as const;
```

All counts that depend on the party use the **scaling functions** (pure, in `mechanics.ts`, mirror of §9.2):
`soakCircles(n)`: 1,1,2,2,3 · `soakNeed(n)`: 1,1,1,2,2 · `spreadTargets(n)`: 0,1,1,2,3 · `addScale(n)`: 0.5,0.65,0.8,0.9,1.0 (round up, min 1) · `enrageMul(n)`: 1.5,1.35,1.2,1.1,1.0 · `pulseMul(n)`: `max(0.6, 0.5 + 0.1 n)`.

**Telegraph kinds** (`TelegraphKind`): existing `danger` red, `soak` yellow, `safe` green, `friendly` blue; **new**: `perilous` (red + pulsing glyph, never parryable/blockable, §3.12) and `link` (white line between two players). New bossNet messages: `mark` (per-player ring/icon: spread, stack, fixate, seal), `link` (tether lines), `shell` (boss element for the weakness UI), `perilous`, `realm` (screen tint for phase realms), `brez` (battle-revive charges).

| # | id | TR | Parameters (defaults) | Behaviour | Telegraph / category | Used by |
|---|---|---|---|---|---|---|
| 1 | `spread` | Dağıl | `targets` (spreadTargets(n)), `markDur` 4, `radius` 5, `coef` 2.2, `avoidTank` false | marks N random players; each marked player gets a ring that follows it; at expiry a circle on each deals `coef` to **everyone inside** | `mark` + danger / avoidable | Selvinaz Kıvılcım, Karaşin Nova, Yıldızkanat Nefes (variant) |
| 2 | `stackShare` | Toplan | `target` 1, `radius` 4, `coef` 5.0 split among those inside, `delay` 3 | one marked player; damage divided by the players standing in the circle (minimum 2 or it is lethal) | soak-yellow / avoidable (by grouping) | reserved (M+ trash casters, future bosses) |
| 3 | `soak` | Emme | `circles` soakCircles(n), `radius` 3–5, `need` soakNeed(n), `delay` 4, `shareCoefPct` 0.3–0.4, `failPulsePct` 0.12–0.25, `knockup` | circles on random arena positions (min 6 m apart); each needs `need` players inside at resolve; success: split damage; fail: raid pulse | soak / avoidable | Gürbüz Küreler, Selvinaz Sunaklar, Dağhan Kayalar, Yıldızkanat Yıldız Çöküşü |
| 4 | `linkSpread` | Zincir Bağı | `pairs` spreadTargets(n)/2 (≥ 1), `dur` 8, `minDist` 5, `maxDist` 14, `snapCoef` 4.0, `snapRadius` 5, `stretchCoefPerSec` 2.0 | links random non-tank pairs; ending within `minDist` snaps the chain (AoE on both); beyond `maxDist` the chain stretches (damage per second) | link / avoidable | Gürbüz |
| 5 | `tetherPull` | Çekim | `targets` 1, `castTime` 1.2, `pullDist` 6, `breakOnIframes` true | tethers the farthest player and pulls; dodge i-frames break it | link / avoidable | `zincirleyen` elite mod, `rd_chain_guard` |
| 6 | `beamRotate` | Dönen Işınlar | `beams` 3, `width` 3, `length` arenaR, `angSpeed` 0.35 rad/s, `dur` 8, `tick` 0.5, `coef` 3.0, `telegraph` 1.5 | beams from the boss rotate; `beam()` re-issued each tick with the new angle | danger / avoidable | Selvinaz |
| 7 | `safeZoneFlood` | Güvenli Bölge | `safeR0` 10, `safeR1` 6, `shrink` s, `floorCoef` 1.5 per 0.5 s | arena floor becomes a damaging `ring` (persist zone) outside a shrinking safe disc | safe-green disc + danger floor | Selvinaz ara evreleri, Yıldızkanat ara evre |
| 8 | `pillarLos` | Sütun Arkası | `pulses` 4, `interval` 3, `pulsePct` 0.08×pulseMul, `pillars` [{x,z,r}] | raid pulses hit only players **not** hidden behind a pillar (LOS circle test done by each victim's peer from the broadcast pillar list) | unavoidable unless cover | Selvinaz P3 |
| 9 | `addWave` | Ek Dalgası | `enemyId`, `count` × addScale(n), `every` 35–45, `castTime` 1.4 + `kick` 2, `hpPct`, `reachHealPct`, `aliveBuff` | interruptible summon cast spawns adds at set points; optional: adds that reach the boss heal it, or each living add buffs the boss | purple cast bar / avoidable-ish | Gürbüz Muhafızlar, Selvinaz Ruhlar, Yıldızkanat Yavrular, Karaşin Kâtipler |
| 10 | `addPriority` | Öncelikli Ek | `enemyId`, `timeout` 25, `failPulsePct` 0.4, `failStun` 2 | marked adds that **must** die before the timer ends | gold timer on the add | Selvinaz sunaklar, Yıldızkanat kristalleri |
| 11 | `intermission` | Ara Evre | `atHp`, `dur`, `bossInvuln` true, `bossPos`, `tint`, `onEnd` | boss leaps to a point, becomes invulnerable and runs sub-mechanics; HUD banner "ARA EVRE" + countdown | – | all five raid bosses |
| 12 | `phaseShield` | Evre Kalkanı | `absorbPct` 0.08, `breakByPoise` false, `timeout` 15, `failPulsePct` 0.3, `bonusDmg` 0.3, `bonusDur` 12 | an absorb that must be broken; with `breakByPoise` the **poise bar** breaks it (Elden Ring tie-in); success opens a damage window, failure pulses | gold shield | Gürbüz Zincir Zırhı, Dağhan Kaya Zırhı |
| 13 | `wallSweep` | Duvar Süpürme | `count` 6, `thick` 2 tiles, `safeGap` 6 m, `interval` 2, `coef` 5.0, `telegraph` 1.6 | alternating wall rects sweep across the arena, one safe lane shown green | danger + safe | Gürbüz ara evre |
| 14 | `ringWaveJump` | Halka Dalgaları | `rings` 3, `r0` 4, `r1` 20, `gap` 0.8, `coef` 2.0, `jumpable` true | expanding rings (HitShape `ring` with `low: true`): a victim that is **airborne** (y ≥ 0.3 m) or rolling is not hit | danger / avoidable | Dağhan |
| 15 | `floorTileHazard` | Zemin Çökmesi | `arcDeg` 90, `telegraph` 3, `ringIdx`, `fallPct` 0.4, `stun` 2 | an arc of the outer ring becomes void (nav cells closed, `ZoneDef` void); falling = % damage + stun + teleport to the nearest safe tile | danger | Dağhan |
| 16 | `tankSwapDebuff` | Yırtık | `status` id, `perStack` {damageTakenFromBoss 0.2}, `maxStacks` 6, `dur` 30, `swapAt` 3, `tauntICD` 8 (off-tank) | each boss melee hit stacks a debuff on the victim; the debuff only amplifies **that boss's** damage; taunt by the second tank swaps | – | Gürbüz, Dağhan, Karaşin, Yıldızkanat |
| 17 | `positionalTankFace` | Kuyruk Savurma | `coneDeg` 140 (rear), `range` 10, `windup` 1.2, `coef` 3.5, `knockback` 6, `interval` 14 | big rear attack: the tank must keep the boss turned away from the party | danger | Yıldızkanat |
| 18 | `frontalCleave` | Yaylı Darbe | `coneDeg` 100, `range` 6–8, `windup` 1.0–1.8, `coef` 3.5–5.0, `perilous` false, `parryable` false | tank buster | danger / tank buster | all bosses |
| 19 | `fixate` | Peşine Düşme | `enemyId`, `dur` 10, `speed` 5.6, `touchCoef` 3.0, `slow` 0.4, `target` farthest | spawns a chaser that ignores threat | `mark` + danger | Karaşin |
| 20 | `dispelCheck` | Arındırma Sınavı | `targets` spreadTargets(n)+, `dur` 8, `radius` 6, `coef` 4.0, `status` dispellable | debuff that explodes at expiry unless dispelled | `mark` + danger | Karaşin Ruh Mührü |
| 21 | `runeSequence` | Rün Sırası | `circles` 4 (6 on M), `showStep` 0.7, `resolveStep` 1.5, `soakDur` 1.2, `failPulsePct` 0.10 | circles light in an order, then resolve in that order; each needs a player inside for the soak time | soak-yellow numbered | Karaşin Defter |
| 22 | `trapCage` | Kafes | `targets` 2, `hpPct` 0.03, `dur` 12, `tickPct` 0.02 | wraps `trapPlayer` (existing prison logic) with cage HP as a % of boss HP | danger | Karaşin |
| 23 | `elementalShell` | Efsun Kabuğu | `cycle` ['fire','frost','arcane'], `interval` 20, `warn` 2, `immune` +100, `weak` −50 (arcane shell: elemental +60, holy −50), `burstR` 12, `burstCoef` 2.0 | the boss's resists are overridden per shell (runtime `resist` patch + `shell` bossNet message so the nameplate shows it) | danger burst | Yıldızkanat |
| 24 | `linkedDeath` | Bağlı Ölüm | `enemyIds`, `window` 10, `reviveHpPct` 0.5 | two adds that must die within `window` s of each other | – | Dağhan P3 |
| 25 | `roamingZone` | Dolaşan Bölge | `count` 3, `radius` 4, `speed` 3.5, `dur` 12, `tick` 0.5, `coef` 2.0 | drifting damage zones (persist circle moved each tick) | danger | Yıldızkanat |
| 26 | `meteorLines` | Meteor Çizgileri | `lines` 5 (+2 M), `width` 3, `telegraph` 1.8, `coef` 3.5 | random parallel strike lines | danger | Yıldızkanat |
| 27 | `raidPulse` | Dalga Hasarı | `pct` × pulseMul(n), `ticks`, `interval` | raid-wide percentage damage (healer check) | unavoidable | all bosses (fail penalties, intermissions) |
| 28 | `enrage` | Çileden Çıkma | `softAt`, `softStack` {dmg 0.2, every 30}, `hardAt`, `hardPulsePct` 0.05/s stacking, timers × enrageMul(n) × difficulty | soft ramp then hard wipe; banner `boss.enrage` | – | all bosses |
| 29 | `knockbackEdge` | Kenara Savurma | `dist` 6–8, `coef` 1.5, `origin` boss | pushes players toward the arena edge (pairs with `floorTileHazard`) | danger | Yıldızkanat Rüzgâr, Dağhan |
| 30 | `interruptibleCast` | Kesilebilir Büyü | `name`, `cast`, `kick` 1–2, `onComplete`, `onInterrupt` | the generic cast with the new kick priority badge and `KESİLDİ!` result | purple cast bar | trash, adds, elite mods |

**Authoring rules for boss scripts:** (1) boss ability data (cooldown, first at, windup, damage coef) lives in `data/enemies.ts`; scripts call `MECH.*` from `start/tick`; (2) every mechanic must be deterministic on the host and **clients only render** (HitShapes + bossNet); (3) no per-frame allocation in `update`; (4) every template exposes `abort()` for wipes and phase changes (the existing `abort(c, b, reason)` handler hook); (5) minimum windups of GDD_CONTENT §0.6; (6) all player-targeting uses `pickPlayers(c, n, avoidTank)` with the host's seeded RNG so the pick is reproducible in tests; (7) a dev harness page `src/dev/enemies.ts` gets one button per template ("Spread", "Soak", ...) spawning a training boss.

---

## 11. Balance overview, progression flow and UI changes

### 11.1 Balance overview

**Design budgets** (initial; all numbers are data):

| Budget | Target |
|---|---|
| Role damage | tank ×0.75, healer ×0.60 (own damage), DPS 1.0. Spec parity target ±5% sustained (burst specs may lead on short fights): Kılıç Ustası 100, Kasap 100 (burst), Elementalist 103 (single target) / 96 (AoE), Suikastçı 102 (single) / 93 (AoE) |
| Threat | tank threat/s ≈ 2.25× an equal DPS (Koruyucu) / 1.9× (Savaş Lordu); a DPS may out-threat the tank only with a > 2× damage advantage |
| Tank intake | an unmitigated coef-4.0 buster ≈ 45–55% of tank max HP at the key's baseline; with the buff up (`Kalkan Kaldır`/`Demir Duruş`) ≈ 12–20%; healer must keep the tank above 40% with ≈ 55–65% of its mana budget |
| Healer budget | `healCheck(L) = maxHP × (0.9% + 0.15%·L)` unavoidable party damage per second; healer sustained HPS ≈ 1.25× that at par; mana lasts ≈ 4–6 min of continuous max healing at L60 before majors/flasks |
| Major cooldown value | 45 s offensive ≈ +5–6% average DPS (a 25–30% buff for 8–10 s per 45 s); 90 s offensive ≈ +5–7% (25–35% for 12–20 s per 90 s); defensive majors cut a buster/pulse by 40% for 8–10 s; hero buff ≈ +5% group DPS averaged over a 3-min cycle |
| Offensive power inflation caps | at endgame (M+ +10): total **`more` product** from runes ≤ ×1.6 per skill, aspects ≤ ×1.15 (offensive aspect), tier 4-piece ≤ ×1.25 on its niche, Kadim Levha ≤ ×1.30, seals risk-compensated; the existing M+ HP curve (×2.36 at +10) stays the dominant pressure |
| Poise | trash break ≈ 3–4 light chain hits or 1 heavy; elite ≈ 6–8 s of full-party pressure or a parry + 2 heavies; boss ≈ 25–35 s of dedicated poise play; boss breaks should happen 1–3 times per fight (Kritik Vuruş = ~1.5% HP each, the real value is the ×1.25 + free hits window) |
| Raid fight length | Normal ≈ 4–5 min per boss with 5 players, Kahramanlık ≈ +20% tuning required, Mitik ≈ +60% HP with hard mechanics; enrage at ≈ 130% of the expected kill time |
| Drop budget | orbs: a Patron kill ≈ 1.2 Kaos on average; a timed +10 chest ≈ 4.5 Kaos, 0.4 Yüceltme, 0.2 İlahi; the expected number of Yüceltme per week for a casual (8 keys) ≈ 1.5; runes ≈ 1 per 2 elite packs at 60; legendaries unchanged; aspects ≈ 1 per 6 legendaries after the roll |
| Time to complete | levelling 1–60 6–9 h (unchanged); Kadim Levha KS 100 ≈ 100+ h; raid Normal clear ≈ 45 min first week; tier set (4-piece) ≈ 3–4 weeks of Kahramanlık/Mitik |

### 11.2 Progression flow (levelling → specs → dungeons → M+ → raid)

The **Elden Ring layer (heavy, run, jump, roll attack, guard, parry, backstab, poise)** is available from **level 1** (it is movement-level combat feel, not progression). Tutorial quests at the Eğitmen teach it with a training dummy that attacks ("Savuşturma Çıraklığı").

| Level / milestone | What opens |
|---|---|
| 1 | basic chain, skill 1, dodge, potions; heavy/guard/parry/poise/backstab; Bestiyari (L) records kills from the first monster |
| 3 / 6 | skills 2 / 3 (existing) |
| 8 | party play + first dungeon (existing); quest "Kışkırtma ve Tehdit" explains threat, taunt, role icons |
| **10** | **choose a spec** (Eğitmen), 45 s major + 1st spec skill; first **flask** from the quest "İlk Şişe" (slots 6–7 unlock); Demirci +1…+9, salvage (existing) |
| 12 | Kadim Bilgelik #1 (existing) |
| **15** | **rune panel** + rune drops, gem combining (existing), 2nd spec skill, flask slots 8–10 → all five open at 20 |
| **20** | **90 s major**; legendaries and aspected legendaries start dropping (existing min ilvl 20); **orbs** start dropping (Kaos/Şans/Simya from Seçkin up) |
| 25 | Gizemli Tüccar; **Kâtip Hakan** (aspect extract/imprint) |
| **30** | ultimate (R) and the **3-min hero buff** for owner specs; upgrades +10…+15 |
| 40 | old class sets (ilvl 40+ bosses) |
| 50 | Kahramanlık dungeons; T1 affixes |
| **60** | Mythic 0, first key, Kadim Levha (P), Kadim Kasa; **Efsun Kalesi Normal** after one Mitik 0 clear; Katalizör (weekly charge) |
| KS 10 / 25 / 50 | Levha boards 2 / 3 / 4 |
| Raid Kahramanlık / Mitik | gates in §9.1; tier tokens, raid vault, glyphs, exclusive uniques |

Weekly loop at 60: daily bounties (3) → M+ keys with seals (+vault) → raid lockout (3 difficulties) → Katalizör charge and Kadim Kasa (Monday 04:00 reset) → season rating (12-week seasons).

### 11.3 UI change list (panels, widgets, owners)

**New / changed panels** (`G.ui.openPanel(id, data)`)

| Panel / widget | id | Key | Owner module | Reads / writes |
|---|---|---|---|---|
| Spec selection (+ spec info, role icon) | in `trainer` and `skills` tab "Uzmanlık" | K | panels-game (`trainer`), panels-items (`skills`) | `SPECS`, `character.setSpec` |
| Skill book tabs: Beceriler / Uzmanlık / **Rünler** | `skills` | K | panels-items | `skillRunes`, rune inventory |
| Flask bar (HUD) + flask equip (character panel) | HUD / `character` | 6–0 | hud / panels-items | `flasks`, `flaskCharges` |
| **Zanaat** tab (orbs) and **Rünler** tab (combine) | `blacksmith` | NPC | panels-items | orbs, runes |
| Aspect codex | `codex` (NEW) | NPC | panels-items | `codex`, `ItemInstance.aspectId` |
| Kadim Levha | `paragon` (NEW) | P | panels-game | `paragon` |
| Bestiyari | `bestiary` (NEW) | L | panels-game | `bestiary`, `FAMILIES` |
| Route planner (map tab) + Hazır Rotalar | `map` | M | panels-game | `routes`, `TANK_ROUTES`, `DungeonDef.packs` |
| Raid Bulucu | `party` tab | O | panels-game | `raid`, `RunState` |
| Set Ustası (token redeem + Katalizör) | `tierset` (NEW) | NPC | panels-items | tokens, `catalyst` |
| Keystone: Mühür row | `keystone` | NPC | panels-game | `seal_*` materials |
| M+ info: Puan sekmesi | `mplusInfo` | J | panels-game | `MythicProfile` |
| Death recap tab | `death` | auto | panels-game | combat log |
| Character panel: Başlık / Kozmetik tabs | `character` | C | panels-items | titles, cosmetics |
| Settings: new keybinds, heal targeting, auto-combo, forces tag, kick tracker | `settings` | Esc | panels-game | `Settings` |

**New / changed in-game HUD widgets** (hud owner)

| Widget | Notes |
|---|---|
| Action bar: X / V (lg) + T (sm) slots, party cooldown tracker | §2.4 |
| Flask bar (5 slots) | §4.2 |
| Guard gauge arc/bar, parry/riposte ring, Kritik/Arkadan prompts | §3 |
| Poise bar on enemy nameplates / target frame, weakness icons, forces tag, elite mod icons, threat flag and `!` marker | §1.4, §5.2, §7.3, §8.1 |
| Target threat bar + boss aggro table | §1.4 |
| Party frames: role icon, click targeting (Alt), prediction, absorb, dispellable border, threat strip, cooldown tracker | §1.6 |
| Kick tracker + cast-bar badge | §8.4 |
| Run tracker: pull counter, seals row; death recap overlay | §8.1, §8.5 |
| Boss frame: poise, phase markers, enrage timer, battle-revive charges, shell element | §9 |
| Combo banner `ROTA:` and hero banners | §3.9, §2.3 |
| Healer extras: friendly target ring, healing meter chip | §1.6 |

**New town NPCs / objects** (scenes owner, `data/town.ts`): Kâtip Hakan (`role 'codex'`, near the Demirci), Set Ustası Selim (`role 'tierset'`), Simyacı NPC (flask vendor + gold orbs, extends the existing alchemist: `vendor` kind `flask`), Şişe Çeşmesi (interactable, free refill), Zanaat Tezgâhı (an extra interactable beside the anvil that opens `blacksmith` on the Zanaat tab), 5th portal "Efsun Kalesi". Place them with the existing town layout rules (3–6 m from related NPCs, not on paths).

---

## 12. IMPLEMENTATION PLAN (work packages)

Eight packages, each sized for **one Sonnet agent**, tagged with the **owning module(s)** of `ARCHITECTURE.md` and the files they own. **No two packages that run in the same wave edit the same file**; later waves may edit files created or modified in earlier waves. Every package ends with `npx tsc --noEmit` = 0 errors and a short report (what was built, APIs added, known gaps). The dev harness pages in `src/dev/*` are the QA entry points. Combat/effects/hit feel (WP2) is the **first priority** and ships first.

### 12.1 Wave schedule (≤ 3 agents in parallel)

| Wave | Packages | Why this grouping |
|---|---|---|
| 0 | **WP1** contracts | everything else imports its types and stubs |
| 1 | **WP2** combat-feel · **WP3** items · **WP4** enemies | disjoint files: `combat/*`+player vs `systems/*`+items data vs `ai/*`+enemies data |
| 2 | **WP5** specs/roles · **WP6** feedback (hud + vfx-audio) · **WP7** raid + Mythic+ + scenes | WP5 needs WP2's `SkillSystem`/`Combat`; WP6 needs the events from WP2/WP4; WP7 needs the mechanic library of WP4 |
| 3 | **WP8** panels (items + game) | needs the APIs of WP3, WP5, WP7 |
| QA | integration pass (Haiku smoke test + Sonnet fixes) | after each wave run the loop protocol of ROADMAP.md |

### 12.2 Packages

**WP1 — Contracts and stubs** · owner: **core (orchestrator)** · wave 0 · depends: – · size S–M
- **Files:** `src/types/*` (append-only: `stats.ts`, `skills.ts`, `items.ts`, `enemies.ts`, `character.ts`, `mythic.ts`, `dungeons.ts`, `net.ts`, `vfx.ts`, `audio.ts`, `common.ts` if needed, **new** `src/types/v2.ts`), `src/core/{Input,events,Save,Settings}.ts`, `src/combat/HitShapes.ts` (**only** the optional spec fields `parryable? perilous? low? poise?`), `ARCHITECTURE.md` (module tables, new files per module, new channels), `docs/GDD_V2.md` cross-links.
- **Tasks:** (1) append the StatIds + `STAT_INFO` (§0.3), StatusIds, `SkillSlotKey` `'m45'|'m90'|'m180'`, `SkillDef.spec?`, `EnemyDef`/`EnemyAbility` fields (§3.12), `ItemCategory 'flask'`, `ItemInstance.aspectId/aspectRoll/exalted/corrupted`, `CharacterSave` fields (§A), `RunState`/`RunRecord`/`MythicProfile` fields, `DungeonDef.raid`, `TownNpcRole` `'codex'|'tierset'|'crafting'`, `NetChannels` `threat/kick/spec`, `hit.poise`, `pdeath.by/av`, `PlayerSyncState.mcd`; (2) new `InputAction`s + default bindings + TR names + `preventDefault` for F2–F5 in game scenes; (3) new events (§0.3); (4) `Save` migration (version bump, defaults for every new field); (5) `Settings` keys (`healTargeting`, `autoCombo`, `showForces`, `kickTracker`, `showTankRoute`); (6) **stub data modules** exporting empty typed registries (and neutral helper functions `getSpec(id)`, `familyOf(def)`, `weaknessOf(def, type): { resist: number; weak: boolean; resisted: boolean; immune: boolean }`) so other packages compile: `data/{specs,families,runes,flasks,orbs,aspects,seals,tierSets,paragon,weaponArts,comboRoutes,routes,abilityTips}.ts`; (7) new VFX/SFX ids from §3.11, §2.2, §7.3 appended to `types/vfx.ts`/`types/audio.ts` (vfx-audio implements them in WP6).
- **Done when:** `tsc` clean, game boots unchanged (no behaviour change), old saves load.

**WP2 — Elden Ring layer and combat feel** · owner: **combat + player (+camera)** · wave 1 · depends: WP1 · size L
- **Files (own):** `src/combat/{Combat,SkillSystem,ComboTracker,feel,HitShapes}.ts`, new `src/combat/{guard,weaponArts,meters,deathLog}.ts`, `src/data/{weaponArts,comboRoutes}.ts`, `src/game/PlayerController.ts`, `src/entities/Player.ts` (pips field only if needed), `src/camera/ThirdPersonCamera.ts`, `src/dev/combat.ts`.
- **Tasks (priority order):** (1) heavy attack: hold detection, charge pose/tiers, per-class heavies, hyper-armor, auto-combo setting; (2) guard + Guard Gauge + parry window + `riposte` + guard counter, `hitLocalPlayer` step 0 (parry) and guard block rules, request `parry` to the host (`Combat.applyParry`), `perilous`/`parryable` handling; (3) poise: rename UI, per-`EnemyDef` poise/regen/hyper-armor reading with rank defaults and family multipliers, **break = 2 s** (O1), `marked_crit` status, **Kritik Vuruş** (damage formula, camera punch, slow-mo, invulnerability), `hit.poise` on the net; (4) running/jump/roll attacks; (5) backstab (rear 100°) incl. spec multipliers via `getStat`; (6) weapon arts + Kes (interrupt) + kick lockouts + `kick` channel send; (7) combo routes data + banner event; (8) feel table → `FEEL`; (9) `deathLog` ring buffer + `meters.ts` counters, `squishyMult(L)` in `hitLocalPlayer`, `damage` event gets `weak`/`resisted` flags (reads `data/families.ts` through `weaknessOf()`); (10) dev harness buttons for every action.
- **Done when:** every action in §3.1 works offline in the dev combat page for all 4 classes with the §3.11 feedback; tsc clean.

**WP3 — Items 2.0 (runes, flasks, orbs, aspects, tier sets, Kadim Levha, goblins)** · owner: **items** · wave 1 · depends: WP1 · size L
- **Files (own):** `src/systems/{CharacterState,ItemGen,LootSystem,Progression,StatCalc,Upgrade,Vendor,Bounties}.ts`, new `src/systems/{Runes,Flasks,Crafting,Aspects,Paragon,TierSets}.ts`, `src/data/{items,itemBases,materials,uniques,loot,talents,gems,runes,flasks,orbs,aspects,tierSets,paragon,seals}.ts`, `src/entities/LootDrop.ts`, `src/dev/items.ts`, `src/dev/fakeTalents.ts`.
- **Tasks:** (1) data tables of §4.1, §4.2, §4.3, §5.1, §5.3, §6 (runes ×24 + ranks, flask bases/affixes, orb definitions + drop tables, 30 aspects, 8 tier sets + token/catalyst materials, 4 boards + 8 glyphs, 14 seals as materials); (2) `resolveSkill(def, player)` (rune application) exported for the combat package; (3) `CharacterState` APIs: `setSpec`, `socketRune/unsocketRune/combineRunes`, `useFlask`, `applyOrb`, `extractAspect/imprintAspect/polishAspect`, `redeemToken/catalyze`, `paragon*`, spec/aspect/tier/rune/paragon stat folding in StatCalc (specials via `hasSpecial`); (4) loot: aspected legendaries (O9), rune/orb/flask/seal/glyph drops, flask charge gain hooks (`death` events), Kadim XP after L60, goblin variants' tables, `asp_*`/tier `special` ids registered; (5) ItemGen: flask items, tier pieces, Aspektli items, naming; (6) vendor lists (flasks, orbs, runes via Mühürdar); (7) save defaults.
- **Done when:** headless checks (`src/dev/items.ts` extended) roll all new item kinds, orbs obey §4.3 rules, runes alter a derived SkillDef, tsc clean.

**WP4 — Enemies 2.0 (families, weaknesses, threat, poise data, elite mods, mechanic library)** · owner: **enemies** · wave 1 · depends: WP1 · size L
- **Files (own):** `src/ai/{EnemyAI,EnemyDirector,abilities,champion,BossController,bossNet}.ts`, new `src/ai/threat.ts`, new `src/ai/bosses/mechanics.ts` (+ `kit.ts` additions), `src/entities/{Enemy,EnemyFactory}.ts`, `src/data/{enemies,families,abilityTips}.ts`, `src/dev/enemies.ts`.
- **Tasks:** (1) `data/families.ts` (14 families, §7.1) + `family`/overrides on all existing defs (§7.2) + `EnemyFactory` resist/immunity resolution + status rules; (2) poise data defaults and per-def overrides, hyper-armor in the windup logic (non-boss flinch rule), `parryable`/`perilous`/`kick`/`tankBuster` flags on existing abilities (per roster tables), `EnemyAI.shape()` passes the flags into HitShapes; (3) **threat** (O3): `threatPct`-based multiplier, heal threat rule, block threat, `provoke` single taunt handling and boss ICDs, 4 Hz `threat` channel broadcast; (4) dmg profiles (§1.7) with defaults by role/rank and `stacker` (Yırtık), `aoe_pulse`; (5) elite mods: extend `ChampionMod` to 15 (§5.2), usage rules, forbidden pairs, "Efsunlu Seçkin" assignment API; (6) `mechanics.ts`: all 30 templates (§10) + scaling functions + bossNet messages, with a dev harness button per template; (7) `abilityTips.ts` for ≈ 40 avoidable abilities; (8) hover-bob/ghost flags unchanged.
- **Done when:** the dev enemies page spawns each template and elite mod without errors; threat/taunt behave per §1.4 in a 2-player LocalTransport test; tsc clean.

**WP5 — Specs, roles, skills, major cooldowns, healing** · owner: **combat (data + skills)** · wave 2 · depends: WP1, WP2, WP3 (for `resolveSkill`/StatCalc hooks), WP4 (threat params) · size L
- **Files (own):** `src/data/{specs,skills,statuses,classes}.ts`, `src/combat/skills/behaviors.ts`, new `src/combat/{specs,healing,majors}.ts`, plus **edits** to `src/combat/{SkillSystem,Combat}.ts`, `src/game/PlayerController.ts`, `src/entities/Player.ts` (these were owned by WP2 in wave 1, now free), `src/dev/combat.ts`.
- **Tasks:** (1) `SPECS` (8) with passives/specials/mods/default bars/unlock schedule; (2) 44 new `SkillDef`s (24 spec skills §1.3 + 20 majors §2.2) + the 4 hero effects + statuses (§0.3) with `STATUS_RULES`; (3) behaviors: `shield_block`, `ward_of_oath`, `iron_stance`, `blood_shield`, `provoke`, `templar_verdict`, `rend/execute`, `thermal_shock`, `ice_lance`, light heals (`mend/renew/pulse/purify/light_bolt`), alchemist vials/antidote/smoke_ward/mending_draught, majors (all 20), `hero_haste/sated`, `overheal_ward`; (4) **ally targeting**: `AimInfo.allyId`, smart-heal resolver (`healTargeting`), friendly cycle (`U`), `F1–F5`, healing pipeline (`healAlly`: formula §0.5, effective heal, overheal absorb, threat via `EnemyDirector`), dispels; (5) major slots in `SkillSystem` + `PlayerController` input + cooldown storage/reset rules + `mcd` sync; (6) spec change flow (`spec` channel, per-spec bars, lock rules in dungeons) wired to `CharacterState.setSpec`; (7) tank mechanics: Guard `blockChance` cap per spec, `protector_cheat`, Öfke Zırhı, Muhafız Çağrısı; (8) harness buttons per spec.
- **Done when:** each spec's bar, majors, heals and mitigation work in the dev combat page (2-peer LocalTransport for ally heals/hero buff); tsc clean.

**WP6 — Feedback layer: HUD, nameplates, VFX, audio** · owner: **hud + vfx-audio** · wave 2 · depends: WP1, WP2 (events), WP4 (`threat` channel), partially WP5 (slot data) · size L
- **Files (own):** `src/ui/UI.ts` (hotkeys), `src/ui/hud/*` (ActionBar, PartyFrames, TargetFrame, BossFrame, MythicTracker, new `KickTracker.ts`, `FlaskBar.ts`, `GuardGauge.ts`, `ThreatBar.ts`, `Prompts.ts`), `src/ui/widgets/{Nameplates,WorldLabels,tooltips,status,CastBar}.ts`, `src/ui/styles/{hud,hud-extras,overlays,widgets}.css`, `src/vfx/*` (new presets of §3.11/§2.2/§7.3, DamageNumbers ZAYIF/BAĞIŞIK/resist styles, camera punch consumer if visual), `src/audio/*` (new SFX ids and mix), `src/dev/{hud,vfx}.ts`.
- **Tasks:** implement every HUD item of §11.3 (X/V/T slots with cooldown sweeps and Yorgun state, flask bar, guard gauge, riposte/parry/critical prompts, enemy poise bar, weakness icons (reads Bestiyari unlock level), forces tag, elite mod icons, threat flag/`!`, target threat bar, party frames (click select with Alt, role icons, prediction, absorb, dispellable borders, threat strip, cooldown tracker), kick tracker, pull counter, boss frame extras), all new VFX/SFX ids (placeholders from existing sprite sheets/procedural meshes are acceptable, quality pass later), damage number styling.
- **Done when:** the HUD dev page shows each element with fake data; no console errors; tsc clean.

**WP7 — Raid, Mythic+ depth, scenes and town** · owner: **mythic + scenes + content + enemies (raid scripts)** · wave 2 · depends: WP1, WP4 (library), WP3 (seal/orb ids) · size XL (may be split into **7a M+/town/scenes** and **7b raid content**, which are file-disjoint)
- **Files (own):** `src/systems/{MythicPlus,Affixes}.ts`, `src/data/mythicAffixes.ts`, `src/data/dungeons/{efsun_kalesi,index}.ts`, raid additions at the **end** of `src/data/enemies.ts`, `src/ai/bosses/{efsun,index}.ts`, `src/scenes/{DungeonScene,TownScene}.ts`, `src/data/town.ts`, `src/entities/interactables/*` (Şişe Çeşmesi, Kâtip, Set Ustası, Zanaat Tezgâhı), `src/world/DungeonBuilder.ts` (raid theme/decor only), `src/dev/{mythic,scenes,content}.ts`.
- **Tasks (7a):** soft depletion (O5), seals (consumption, host-side enemy mods, per-peer reward mods, `RunRecord.seals`, score bonus), seasons (index, archived ratings, `seasonal_kizil_ay` and `seasonal_sis` data + host behaviour), key swap, death log aggregation (`RunState.deathLog`), kick/death/healing meters aggregation in the summary event, rating titles/cosmetics grants, `raid` completion rule (`DungeonDef.raid`), lockout bookkeeping (`CharacterSave.raid`), raid vault row, Savaş Dirilişi, markers `req`, town NPCs/portal placement. **(7b):** `efsun_kalesi` `DungeonDef` exactly as §9.3 (rooms/doors/packs/bosses/extras/theme), 10 new enemy defs (§9.5), 5 boss definitions + scripts (`ai/bosses/efsun.ts`) built **only** from `MECH.*` templates with the §9.4 numbers, difficulty/n-scaling application at spawn, per-difficulty loot tables ids.
- **Done when:** `efsun_kalesi` loads in the dungeon scene, all five bosses run all phases in the dev scenes page with 1–5 simulated players, seals/soft depletion/seasons verified with the mythic dev page; tsc clean.

**WP8 — Panels (items + game)** · owner: **panels-items + panels-game** · wave 3 · depends: WP3, WP5, WP7 · size L
- **Files (own):** `src/ui/panels/items/*`, `src/ui/panels/game/*`, `src/ui/styles/{panels-items,panels-game}.css`, `src/ui/panels/index.ts`, `src/data/routes.ts` (the §8.3 presets), `src/dev/{panels-items,panels-game}.ts`.
- **Tasks:** all panels of §11.3: spec selection in `trainer` + `skills` tabs (Uzmanlık, Rünler), blacksmith Zanaat + Rünler tabs, flask equip in `character`, `codex`, `tierset`, `paragon`, `bestiary`, route planner (map tab, save/load/export `EFR1:`), raid finder (party tab), keystone seal row, `mplusInfo` Puan tab, `death` recap tab, character titles/cosmetics tabs, settings entries; data hooks to `CharacterState`/`G.mplus`/`G.character`. Tank routes data from §8.3 (`TANK_ROUTES`).
- **Done when:** each panel opens from the dev panel pages with realistic fake data and via the real hotkeys/NPCs in town; tsc clean.

### 12.3 File ownership matrix (conflict check)

| Path | W0 | W1 | W2 | W3 |
|---|---|---|---|---|
| `src/types/*`, `src/core/*`, `ARCHITECTURE.md`, stub data | WP1 | – | – | – |
| `src/combat/*` (Combat, SkillSystem, HitShapes, feel, ComboTracker, new guard/weaponArts/meters/deathLog) | – (HitShapes fields only) | **WP2** | WP5 (SkillSystem/Combat edits, new specs/healing/majors) | – |
| `src/game/PlayerController.ts`, `src/entities/Player.ts`, `src/camera/*` | – | **WP2** | WP5 | – |
| `src/data/{skills,statuses,classes,specs}.ts`, `src/combat/skills/behaviors.ts` | stub (specs) | – | **WP5** | – |
| `src/systems/{CharacterState,ItemGen,LootSystem,Progression,StatCalc,Upgrade,Vendor,Bounties}.ts`, items data, `src/entities/LootDrop.ts` | – | **WP3** | – | – |
| `src/ai/*`, `src/entities/{Enemy,EnemyFactory}.ts`, `src/data/{enemies,families,abilityTips}.ts` | – | **WP4** | WP7 (appends raid enemies; adds `ai/bosses/efsun.ts`) | – |
| `src/ui/hud/*`, `src/ui/widgets/*`, `src/vfx/*`, `src/audio/*`, `src/ui/UI.ts`, hud/widget CSS | – | – | **WP6** | – |
| `src/systems/{MythicPlus,Affixes}.ts`, `src/data/{mythicAffixes,town}.ts`, `src/data/dungeons/*`, `src/scenes/*`, `src/entities/interactables/*`, `src/world/DungeonBuilder.ts` | – | – | **WP7** | – |
| `src/ui/panels/*`, panel CSS, `src/data/routes.ts` | stub (routes) | – | – | **WP8** |
| `src/net/*` | untouched (channels are carried generically; senders register receivers) | | | |

Within a wave no path appears twice. Shared type files are touched **only** by WP1 afterwards (later packages that need a field report it to the orchestrator, who appends it between waves).

### 12.4 Dependencies in one line

`WP1 → {WP2, WP3, WP4} → {WP5 (needs WP2+WP3+WP4), WP6 (needs WP2+WP4), WP7 (needs WP3+WP4)} → WP8 (needs WP3+WP5+WP7) → QA`.

---

## Appendix A. Type / data additions (copy-paste sketches for WP1)

```ts
// ---- types/v2.ts (NEW, core) ----
export type RoleId = 'tank' | 'healer' | 'dps';
export type SpecId = 'knight_protector' | 'knight_blademaster' | 'barbarian_warlord' | 'barbarian_butcher'
  | 'mage_elementalist' | 'mage_lightbringer' | 'rogue_assassin' | 'rogue_alchemist';
export interface SpecDef {
  id: SpecId; classId: ClassId; name: string; role: RoleId; desc: string;
  stats: StatBlock;                                   // folded like a keystone (threatPct, maxHpPct, ...)
  specials?: { id: string; desc: string; params?: Record<string, number> }[];
  skills: string[];                                   // new skill ids (unlock order)
  unlock: Record<string, number>;                     // skillId -> level
  majors: { m45: string; m90: string; m180?: string };
  mods: { skill: string; params?: Record<string, number>; patch?: Partial<SkillDef> }[];   // per-spec changes to existing skills
  defaultBar: Partial<Record<SkillSlotKey, string>>;
  weaponArt?: string;                                 // override of the category art (healers)
  basic?: string;                                     // replaces <class>_basic (Işık Çağıran, Simyacı)
  guard?: { gauge: number; arc: number; blockAmount: number };
}
export type FamilyId = 'beast'|'undead_bone'|'undead_flesh'|'ghost'|'insect'|'slime'|'fungus'|'humanoid'|'cultist'|'golem'|'demon'|'elemental_fire'|'elemental_frost'|'dragon';
export interface FamilyDef { id: FamilyId; name: string; resist: Partial<Record<DamageType, number>>; immune: StatusId[]; takenMore?: Partial<Record<StatusId, number>>; poiseMult: number; icon: string }
export interface RuneDef { id: string; name: string; needs: string[]; forbid?: string[]; costMult: number; ranks: [RuneMods, RuneMods, RuneMods]; desc: string }
export type RuneMods = Partial<{ more: number; addProj: number; pierce: number; chain: number; areaPct: number; speedPct: number; gainAs: Partial<Record<DamageType, number>>; leech: number; cull: number; critMult: number; critDmg: number; cdMult: number; costMult: number; every3: number; poisePct: number; bleed: number; echo: number; dotMore: number; resGain: number; durPct: number; effectPct: number; nextHitMore: number; noAilments: boolean; projSpeedPct: number }>;
export interface FlaskBaseDef { id: string; name: string; minIlvl: number; max: [number, number, number, number]; use: number; effect: Record<string, number>; dur: [number, number, number, number]; icon: string }
export interface OrbDef { id: string; name: string; desc: string; apply: 'one' | 'all' | 'add' | 'values' | 'rarity' | 'remove' | 'corrupt' | 'alchemy' }
export interface AspectDef { id: string; name: string; group: 'off' | 'def' | 'util' | 'mob'; classId?: ClassId | 'healer'; desc: string; params: Record<string, [number, number]> }
export interface SealDef { id: string; name: string; points: 1 | 2 | 3; risk: Record<string, number>; reward: Record<string, number>; desc: string }
export interface TierSetDef { id: string; specId: SpecId; name: string; pieces: Record<'helm'|'shoulders'|'chest'|'gloves'|'legs', string>; bonus2: { id: string; desc: string }; bonus4: { id: string; desc: string } }
export interface ParagonBoardDef { id: string; name: string; cells: string[][]; N: StatBlock; M: StatBlock; R: StatBlock; C: { stats?: StatBlock; special?: string; desc: string } }
export interface RaidInfo { lockout: true; bossOrder: string[]; wipeResetSec: number; brez: { perAttempt: number[] } }
export interface WeaponArtDef { id: string; name: string; category: ItemCategory; chargeSec: number; coef: number; poise: number; kick: boolean; kickLockout: number; params: Record<string, number> }
export interface ComboRouteDef { id: string; classId: ClassId; name: string; inputs: string[]; windowFrom: number; windowTo: number; effect: string }
export interface TankRoute { id: string; dungeonId: string; name: string; pulls: { n: number; packs: string[]; forces: number; tip: string }[]; skip: string[]; total: number }

// ---- types/skills.ts ----
export type SkillSlotKey = 'lmb' | 'rmb' | 'q' | 'e' | 'r' | 's1' | 's2' | 's3' | 'm45' | 'm90' | 'm180';   // append (also append to SKILL_SLOT_KEYS)
interface SkillDef { spec?: SpecId; /* + params: threat, threatMult, major, smartPriority, ... */ }
interface AimInfo { allyId?: EntityId | null }

// ---- types/enemies.ts ----
interface EnemyDef { poise?: number; poiseRegen?: number; poiseDelay?: number; hyperArmor?: number; stanceBreakable?: boolean; backstabbable?: boolean; family?: FamilyId; profile?: 'bruiser'|'buster'|'cleaver'|'ranged_focus'|'aoe_pulse'|'stacker' }
interface EnemyAbility { parryable?: boolean; perilous?: boolean; kick?: 0 | 1 | 2; tankBuster?: boolean }

// ---- combat/HitShapes.ts (spec fields only) ----
interface HitShapeSpec { parryable?: boolean; perilous?: boolean; low?: boolean; poise?: number }

// ---- types/character.ts (CharacterSave, all optional with Save-migration defaults) ----
spec?: SpecId; specBars?: Partial<Record<SpecId, Partial<Record<SkillSlotKey, string>>>>;
skillRunes?: Record<string, (string | null)[]>; flasks?: (ItemInstance | null)[]; flaskCharges?: number[];
codex?: Record<string, { roll: number }>; bestiary?: Record<string, number>;
paragon?: { ks: number; xp: number; points: number; boards: { id: string; mx: number; my: number }[]; cells: string[]; glyphs: { boardIdx: number; socket: 0 | 1; id: string; level: number }[] };
routes?: Record<string, { name: string; pulls: string[][]; note?: string; updatedAt: number }[]>;
raid?: { week: number; killed: { normal: string[]; heroic: string[]; mythic: string[] } };
titles?: string[]; title?: string; cosmetics?: Record<string, boolean>;
// flags: majorCd { m45, m90, m180 }, catalyst, key swap week, tutorial flags

// ---- types/items.ts ----
ItemCategory += 'flask'; ItemInstance += { aspectId?: string; aspectRoll?: number; exalted?: boolean; corrupted?: boolean; flaskTier?: number };

// ---- types/mythic.ts ----
RunState += { raid?: boolean; wipes?: number; brez?: number; seals?: string[]; deathLog?: { id: number; t: number; by: string; av: boolean }[]; partySize?: number };
RunRecord += { seals?: string[] }; MythicProfile += { seasons?: Record<number, { rating: number; best: Record<string, unknown> }> };
AffixId += 'seasonal_kizil_ay' | 'seasonal_sis';

// ---- types/dungeons.ts ----
DungeonDef += { raid?: RaidInfo }; TownNpcRole += 'codex' | 'tierset' | 'crafting';

// ---- types/net.ts ----
NetChannels += {
  threat: { e: EntityId; v: EntityId; t: [EntityId, number][] };
  kick: { id: EntityId; ready: number; order?: number };
  spec: { id: EntityId; spec: SpecId };
};
hit += { poise?: number }; pdeath += { by?: string; av?: boolean };      // PlayerSyncState += { mcd?: [number, number, number] }

// ---- core/Input.ts ----
InputAction += 'guard' | 'skill_m45' | 'skill_m90' | 'skill_m180' | 'flask1' | 'flask2' | 'flask3' | 'flask4' | 'flask5'
  | 'targetAlly' | 'partySel1' | 'partySel2' | 'partySel3' | 'partySel4' | 'partySel5' | 'paragon' | 'bestiary' | 'townPortal';
// defaults: KeyG/Mouse3, KeyX, KeyV, KeyT, Digit6..Digit0, KeyU, F1..F5, KeyP, KeyL, KeyY

// ---- core/events.ts ----
'parry' | 'riposte' | 'poise:break' | 'crit:finisher' | 'guard:broke' | 'threat:update' | 'kick:request' | 'major:used' | 'hero:cast'
| 'flask:used' | 'spec:changed' | 'weakness:hit' | 'run:recap' | 'camera:punch'
```
