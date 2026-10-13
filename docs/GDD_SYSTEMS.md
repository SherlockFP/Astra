# EFSUN ONLINE – Kadim Zindanlar · GDD: Core Systems

> Status: v1.0, implementation-ready. Owner: systems design. Companion docs: `ARCHITECTURE.md` (module ownership, damage authority), `docs/NETCODE.md`, `docs/GDD_CONTENT.md` (dungeons, enemies, Mythic+ timer/affixes/rating), `docs/assets/*`.
> Audience: the **combat** (classes, skills, statuses), **items** (stats, items, upgrades, talents, loot, progression) and **feedback** (vfx/audio/camera/hud) module owners, who turn these tables into `src/data/*.ts`.
> All **player-facing strings are Turkish**. Ids: snake_case for content (skills, items, affixes, nodes, materials); **stat ids are the existing camelCase `StatId`s of `src/types/stats.ts`** (plus a few marked NEW to append). Numbers are initial tuning values; keep them in data tables, never in logic.
> Computed tables (passive tree, XP curve, monster scaling, upgrade costs) were generated from the formulas in this document; if a table and a formula disagree, the formula wins.

## 0. Conventions

| Topic | Rule |
|---|---|
| Distance unit | `1 u = 1 three.js unit ≈ 1 m` (ARCHITECTURE rule 7). KayKit characters are used at **native scale (≈ 2.4 u tall)**, dungeon tile 4×4 u. Melee/AoE ranges are measured from the attacker's centre to the target's **collision edge** (add the target radius). |
| Time | Seconds (s) unless written `ms`. Fixed simulation step per `docs/NETCODE.md` (60 Hz). |
| Angles | Degrees. A melee arc of 120° means ±60° around the attacker's facing. |
| Percent notation | Tables show human percentages: `+%8` = +8 percentage points for chances/resists, +8% *increased* for multipliers. **In data, percent stats are stored as fractions** (`0.08`) per `stats.ts`. `DAHA FAZLA` (more) = a separate multiplicative factor, implemented as a `special` (not a `StatBlock` entry). |
| Rounding | Damage, HP, gold: round to integer at the **end** of a calculation. Display chances and life steal with 1 decimal. |
| Authority & RNG | Who computes what is defined in `ARCHITECTURE.md` → "Damage authority" (outgoing damage on the attacker's peer, incoming hits resolved by the victim's peer, enemy HP/death on the host, personal loot/XP per player). This doc defines only the math. Every gameplay roll uses the seeded `RNG` from `core/utils` (per-player stream); `Math.random()` only for cosmetics. |
| Stat stacking | `final = (base + Σflat) × (1 + Σincreased) × Π(more)`. |
| Content ids | Classes `knight`, `barbarian`, `mage`, `rogue`; skills `<class>_<name>`; passive nodes `<quadrant>_<arm><n>` / `n_*` / `ks_*`; affixes `pre_*`/`suf_*`; legendaries `leg_*`; sets `set_*`; materials snake_case. |
| Colours | Hex, used for UI text, beams and damage numbers. |

---

## 1. Stats & Formulas

### 1.1 Stat registry (`StatId`, `src/types/stats.ts`)

Every modifier (passives, affixes, gems, buffs, set bonuses) references one of these keys. `pp` = percentage points added directly to a chance/resist; `inc` = increased-percent (additive bucket). Rows marked **NEW** are not in `STAT_IDS` yet and must be appended (append-only rule) together with a `STAT_INFO` entry using the given TR name.

| StatId | Status | TR adı (`STAT_INFO.name`) | Unit (data) | Rule / cap |
|---|---|---|---|---|
| `str` | exists | Güç | flat | +1% damage if main stat (Şövalye, Barbar); +2 armour per point (all classes) |
| `dex` | exists | Çeviklik | flat | +1% damage if main stat (Haydut); +0.02 pp crit and +0.01 pp dodge per point (all) |
| `int` | exists | Zeka | flat | +1% damage if main stat (Büyücü); +0.05 pp all resists per point (all); Büyücü: +0.25 max mana and +0.015 mana/s per point |
| `vit` | exists | Dayanıklılık | flat | + `hpPerVit` HP per point (class table §1.2) |
| `allAttr` | **NEW** | Tüm Özellikler | flat | StatCalc adds it to str/dex/int/vit |
| `maxHp` / `maxHpPct` | exists | Maks. Can | flat / inc | |
| `hpRegen` | exists | Can Yenilenmesi/sn | HP/s | works in combat |
| `hpRegenPct` | **NEW** | Can Yenilenmesi | fraction of max HP per s | |
| `healReceivedPct` | **NEW** | Alınan İyileştirme | inc | |
| `potionPct` | exists | İksir Etkinliği | inc | |
| `maxResource` | exists | Maks. Kaynak | flat | Kararlılık / Öfke / Mana / Enerji |
| `resourceRegen` | exists | Kaynak Yenilenmesi/sn | flat /s | class base regen lives here (`ClassDef.baseStats`) |
| `resourceRegenPct` | **NEW** | Kaynak Yenilenmesi | inc | multiplies passive regen only |
| `resourceGainPct` | **NEW** | Kaynak Üretimi | inc | multiplies on-hit / on-skill generation |
| `costReductionPct` | **NEW** | Maliyet Azaltma | inc | cap 40% |
| `armor` / `armorPct` | exists | Zırh | flat / inc | local `armorPctLocal` affixes apply only to their own item (ItemGen) |
| `resFire` `resFrost` `resLightning` `resShadow` `resPoison` | exists | Ateş / Buz / Şimşek / Gölge / Zehir Direnci | pp | cap 75% (absolute max 85%) |
| `resAll` | exists | Tüm Dirençler | pp | adds to all five |
| `blockChance` | exists | Blok Şansı | pp | needs a shield; cap 50% (75% with `ks_iron_fortress`) |
| `blockAmount` | exists | Blok Miktarı | fraction of a blocked hit removed | base 0.60 |
| `dodgeChance` | exists | Kaçınma Şansı | pp | cap 40% |
| `critChance` | exists | Kritik Şansı | pp | base 5%, cap 75% |
| `critDamage` | exists | Kritik Hasarı | pp added to ×1.5 | `critMult = 1.5 + critDamage` |
| `attackSpeed` / `castSpeed` | exists | Saldırı Hızı / Büyü Hızı | inc | cap +100% each |
| `moveSpeedPct` | exists | Hareket Hızı | inc | cap +75% |
| `cdr` | exists | Bekleme Süresi Azaltma | inc | cap 40% |
| `damageReductionPct` | exists | Hasar Azaltma | fraction | generic DR from buffs; multiplicative per source (keep sources separate) |
| `lifeSteal` | exists | Can Çalma | fraction of damage | heal cap 10% max HP per rolling 1 s |
| `hpOnHit` / `hpOnKill` | exists | Vuruş / Öldürme Başına Can | flat | `hpOnHit × proc` |
| `hpOnKillPct` | **NEW** | Öldürme Başına Can % | fraction of max HP | |
| `damagePct` | exists | Hasar | inc | all damage |
| `physicalDamagePct` `fireDamagePct` `frostDamagePct` `lightningDamagePct` `shadowDamagePct` `poisonDamagePct` `holyDamagePct` | exists | … Hasarı | inc | by damage type |
| `arcaneDamagePct` | **NEW** | Gizem Hasarı | inc | by damage type (`arcane` is a NEW `DamageType` member) |
| `meleeDamagePct` / `projectileDamagePct` / `bleedDamagePct` | **NEW** | Yakın Dövüş / Mermi / Kanama Hasarı | inc | by skill tag |
| `aoePct` / `dotPct` | exists | Alan Hasarı / Zamanla Hasar | inc | by skill tag |
| `eliteDamagePct` / `bossDamagePct` | exists | Elit / Boss Hasarı | inc | conditional |
| `executeDamagePct` / `ailingDamagePct` / `chilledDamagePct` | **NEW** | Düşük Canlılara / Etkilenmişlere / Üşümüşlere Hasar | inc | conditional (< 35% HP / bleeding or poisoned / chilled or frozen) |
| `weaponMin` / `weaponMax` | exists | Min./Maks. Silah Hasarı | flat | the equipped weapon's rolled numbers (after local mods + upgrade) |
| `armorPen` | exists | Zırh Delme | fraction | cap 50% |
| `resPen` | **NEW** | Direnç Delme | pp | subtracted from the target's resist |
| `aoeRadiusPct` | **NEW** | Alan Genişliği | inc | radius, cap +60% |
| `projectileSpeedPct` / `pierce` | **NEW** | Mermi Hızı / Delme | inc / flat count | |
| `ccDurationPct` | **NEW** | Kontrol Etkisi Süresi | inc | CC you apply |
| `ccReductionPct` | exists | Kontrol Etkisi Azaltma | fraction | CC on you, cap 60% |
| `staggerPct` | **NEW** | Sarsma | inc | stagger you deal |
| `bleedChance` / `burnChance` / `poisonChance` | **NEW** | Kanama / Yanma / Zehir Şansı | pp | on-hit ailment chance × proc |
| `thorns` | exists | Diken Hasarı | flat | physical reflected on melee hit taken |
| `goldFindPct` / `magicFindPct` / `xpPct` | exists | Altın / Büyülü Eşya Bulma / Tecrübe | inc | MF cap 250% |
| `pickupRadius` | exists | Toplama Mesafesi | flat u | gold magnet radius bonus |

Local item modifiers (not `StatBlock` entries; ItemGen applies them to the item's own numbers): **`wpnDamagePctLocal`** (Silah Hasarı %, weapon only), **`wpnAddFlatLocal`** (Ek Silah Hasarı, added to both weapon min and max), **`armorPctLocal`** (yerel Zırh %). Suggested: append `local?: boolean` to `AffixDef` and mark these affixes `local: true` with `stat: 'weaponMax' | 'armorPct'` as the nearest display stat.

### 1.2 Primary attributes by class

`attr(L) = base + growth × (L − 1)` (no free attribute points; the passive tree is the build layer).

| Class id | TR | Güç base/+lvl | Çeviklik | Zeka | Dayanıklılık | Main stat | hpPerLevel | hpPerVit | Armour weight |
|---|---|---|---|---|---|---|---:|---:|---|
| `knight` | Şövalye | 14 / +3 | 10 / +1 | 8 / +0 | 16 / +3 | Güç | 12 | 10 | Ağır |
| `barbarian` | Barbar | 16 / +4 | 10 / +1 | 6 / +0 | 16 / +2 | Güç | 12 | 12 | Ağır |
| `mage` | Büyücü | 6 / +0 | 10 / +1 | 18 / +4 | 14 / +2 | Zeka | 8 | 9 | Hafif |
| `rogue` | Haydut | 10 / +1 | 18 / +4 | 6 / +0 | 14 / +2 | Çeviklik | 10 | 9 | Orta |

Reference (naked, no gear/passives):

| Class | L1 attrs (G/Ç/Z/D) | L1 HP | L60 attrs | L60 HP | L60 armour from Güç | L60 crit | L60 other |
|---|---|---:|---|---:|---:|---:|---|
| Şövalye | 14/10/8/16 | 222 | 191/69/8/193 | 2,700 | 382 | 6.4% | — |
| Barbar | 16/10/6/16 | 254 | 252/69/6/134 | 2,378 | 504 | 6.4% | — |
| Büyücü | 6/10/18/14 | 184 | 6/69/254/132 | 1,718 | 12 | 6.4% | 163 mana, 8.8 mana/s, +12.7% all res |
| Haydut | 10/18/6/14 | 186 | 69/254/6/132 | 1,838 | 138 | 10.1% | +2.5% dodge |

Typical level-60 blue/epic-geared values to balance against: HP 3,300 (Büyücü) – 4,800 (Şövalye); armour 600 (Büyücü) – 2,300 (Şövalye); main stat ≈ 380–420.

### 1.3 Derived stats

All values below in data units (percent stats are fractions). `S` = folded StatBlock from StatCalc.

```
str,dex,int,vit = classBase + growth*(L-1) + S.str|dex|int|vit + S.allAttr
maxHP        = (50 + hpPerLevel*L + vit*hpPerVit + S.maxHp) * (1 + S.maxHpPct) * Π(moreHp specials)
armor        = (2*str + Σ item armour (after local %) + S.armor) * (1 + S.armorPct)
critChance   = clamp(0.05 + 0.0002*dex + S.critChance, 0, 0.75)
critMult     = 1.5 + S.critDamage
dodge        = clamp(0.0001*dex + S.dodgeChance, 0, 0.40)
block        = hasShield ? clamp(shieldImplicit + classBonus + S.blockChance, 0, 0.50) : 0     // cap 0.75 with ks_iron_fortress
blockAmount  = 0.60 + S.blockAmount
resist[t]    = clamp(S.res<T> + S.resAll + 0.0005*int + debuffs, -1.0, 0.75 + resCapBonus)       // resCapBonus ≤ 0.10
APS          = weaponAPS * (1 + min(S.attackSpeed, 1.0))
castRate     = weaponAPS * (1 + min(S.castSpeed, 1.0))        // Büyücü uses castRate for everything
moveSpeed    = 7.0 u/s * (1 + min(S.moveSpeedPct, 0.75)) * slowFactor   // slowFactor ≥ 0.30 (strongest slow only)
cooldown     = baseCD * (1 - min(S.cdr, 0.40))
cost         = baseCost * (1 - min(S.costReductionPct, 0.40))
```

**Resources** (all fixed-size pools; this keeps skill costs level-independent):

| Resource id | TR | Class | Max | Regen | Generation | Out of combat |
|---|---|---|---|---|---|---|
| `resolve` | Kararlılık | Şövalye | 100 + `maxResource` | 4/s always | basic hit +4/+4/+6 (first target), blocked hit +6, skills listed | starts full |
| `rage` | Öfke | Barbar | 100 + `maxResource` | none | basic hit +5/+5/+8 (+1 per extra target, max +4), +1 per 2% max HP lost to damage, skills listed | decays 4/s after 5 s without dealing/taking damage; starts 0 |
| `mana` | Mana | Büyücü | 100 + 0.25×Zeka + `maxResource` | 5 + 0.015×Zeka /s | basic hit +2 | regen ×3 |
| `energy` | Enerji | Haydut | 100 + `maxResource` | 12/s | — | — |
| `combo` | Kombo Puanı | Haydut | 5 | — | basic hit +1 (first target), skills listed | −1 every 3 s after 8 s out of combat |

`resourceRegenPct` multiplies passive regen; `resourceGainPct` multiplies on-hit/on-skill generation. "Out of combat" = no damage dealt or taken for 5 s.

Code mapping: `ResourceType` / `ClassDef.resource` currently allow `'rage' | 'mana' | 'energy'`. Append `'resolve'` (append-only rule) for the Şövalye; if that is not done, implement the Şövalye as resource `'rage'` with `resourceName: 'Kararlılık'` and the regen rules above. Kombo Puanı is a separate counter on the Haydut (not a `ResourceType`); show it as 5 pips under the resource bar.

### 1.4 Damage types

| Type id | TR | Mitigated by | Number colour | Typical ailment |
|---|---|---|---|---|
| `physical` | Fiziksel | Armour | `#ffffff` | Kanama (`bleed`) |
| `fire` | Ateş | `resFire` | `#ff8a2a` | Yanma (`burn`) |
| `frost` | Buz | `resFrost` | `#7fd8ff` | Üşüme → Donma (`chill` → `freeze`) |
| `lightning` | Şimşek | `resLightning` | `#ffe14a` | Sersemleme (monsters only in v1) |
| `shadow` | Gölge | `resShadow` | `#a46bff` | Zayıflama (monsters only in v1) |
| `poison` | Zehir | `resPoison` | `#7dff5a` | Zehir (`poison`) |
| `holy` | Kutsal | no player resist (players never take holy in v1); monsters: family holy modifier (§1.10) | `#ffe9a0` | — (Şövalye damage type) |
| `arcane` (**NEW** `DamageType` member) | Gizem | **target's lowest** of fire/frost/lightning resist | `#ff6bd8` | — (Büyücü) |
| `true` | Saf | nothing (scripted mechanics only) | `#ff3b3b` | — |

### 1.5 Damage pipeline (outgoing, player → monster)

```
// 1. Weapon base (diablo-style: every skill, including spells, scales from weapon damage)
W     = randInt(S.weaponMin, S.weaponMax)         // main-hand after local affixes + upgrade bonus
W    += offhandDagger ? 0.25 * randInt(offMin, offMax) : 0
base  = W * skill.coef                            // coef from skill tables (per hit / per tick) = SkillDef.damage.coef
// 2. Attribute
base *= 1 + mainStat/100
// 3. Increased bucket (one additive sum, fractions)
inc   = S.damagePct + S.<type>DamagePct + Σ tag stats (meleeDamagePct | projectileDamagePct | aoePct | dotPct | bleedDamagePct)
        + conditionals (eliteDamagePct, bossDamagePct, executeDamagePct, ailingDamagePct, chilledDamagePct)
base *= 1 + inc
// 4. More multipliers (each separately): keystones, class skill buffs, set bonuses, traits
base *= Π more
// 5. Crit (hits only, unless ks_perfect_agony)
if (rng() < critChance) base *= critMult           // flag isCrit for juice
// 6. Mitigation on target
physical: armorEff = targetArmor*(1 - S.armorPen); DR = armorEff/(armorEff + 50*attackerLevel + 200), cap 0.75
          monsters use their family physical DR (§1.10) directly instead of an armour value
holy:     base *= 1 - familyHolyRes                (players: n/a)
true:     no mitigation
others:   res = targetRes[type] - S.resPen  (arcane: min(fire,frost,lightning) - S.resPen); base *= 1 - res
// 7. Target damage-taken multipliers: Savunmasız ×1.15, stagger break ×1.25, frozen-shatter, boss phase shields...
// 8. Level difference (open world only): player→higher monster: ×max(0.40, 1 - 0.06*(Lm-Lp))
final = max(1, round(base))
```

**Incoming (monster → player)** uses the same order: `monsterDmg(L) × rankMult × attack.coef × affixes × M+ dmgMult → dodge roll (hits only) → block roll (frontal 160°, melee+projectile only) → armour/resist → player DR buffs (multiplicative) → absorb shields → HP`. Monster level difference: higher-level monster ×(1 + 0.05×(Lm − Lp)), cap ×1.5.

**DoTs** snapshot steps 1–4 at application (no crit), then every tick applies steps 6–7. Ticks every 0.5 s. Bleed ignores 50% of armour DR.

### 1.6 Mitigation curves

Armour DR = `armor / (armor + 50·attackerLevel + 200)`, cap 75%. In Mythic+ the attacker level is `60 + keyLevel`, so the same armour mitigates a little less at higher keys.

| Armour | vs L10 | vs L30 | vs L60 | vs M+10 (L70) | vs M+15 (L75) |
|---:|---:|---:|---:|---:|---:|
| 250 | 26.3% | 12.8% | 7.2% | 6.3% | 6.0% |
| 500 | 41.7% | 22.7% | 13.5% | 11.9% | 11.2% |
| 1,000 | 58.8% | 37.0% | 23.8% | 21.3% | 20.2% |
| 2,000 | 74.1% | 54.1% | 38.5% | 35.1% | 33.6% |
| 3,000 | 75% (cap) | 63.8% | 48.4% | 44.8% | 43.2% |
| 5,000 | 75% | 74.6% | 61.0% | 57.5% | 55.9% |

Resistances are linear percentages: 40% fire resist = 40% less fire damage. Negative resist increases damage taken (monsters can have negative resist; players get negative resist only from debuffs/affixes, floor −100).

### 1.7 Crits

* Base 5% chance, ×1.5 damage. Haydut trait and `n_assassin` add backstab crit.
* Monsters do **not** crit in v1 (balancing simplicity) except via a monster affix defined in the enemy doc.
* Guaranteed-crit effects (Gölge Adımı, Gölge Dansı, Duman Bombası) set `forceCrit` on the next qualifying hit.

### 1.8 Ailments & status effects

Code column = `StatusId` in `src/types/skills.ts` (NEW = append to the union and add a `StatusDef` in `data/statuses.ts`). `StatusApply.magnitude` carries the number in the "Rule" column.

| Design id | Code `StatusId` | TR | Source type | Rule (`magnitude`) | Duration | Stacking | On bosses |
|---|---|---|---|---|---|---|---|
| `bleed` | `bleed` | Kanama | physical | total = X% of the hit, over duration; ignores 50% armour | 3–4 s (skill) | up to 5 instances; new instance replaces weakest | full |
| `burn` | `burn` | Yanma | fire | total = X% of the hit | 3 s | strongest only, refresh duration | full |
| `poison` | `poison` | Zehir | poison | each stack = 0.15 × W per second (snapshotted) | 4 s, refresh on new stack | max 10 stacks (+5 `n_toxicologist`) | full |
| `chill` | `chill` | Üşüme | frost | −10% move & attack speed per stack | 3 s | max 5; at 5 stacks → `freeze` (trash), elites capped at −50% | capped −30% |
| `freeze` | `freeze` | Donma | frost | cannot act, animation paused, blue-white material; on death shatters (r 2, coef 0.5 frost) | 1.5–2 s | DR group `hard` | converts to stagger |
| `stun` | `stun` | Sersemleme | any | cannot act, stars VFX | per skill | DR group `hard` | converts to stagger |
| `knockback` | — (`SkillDef.knockback`) | Geri İtme | any | displacement (see §8.5) | 0.2–0.35 s | — | immune |
| `knockup` | `knockdown` | Havaya Kaldırma | any | vertical 0.8–1 u, counts as stun | 0.6 s | DR group `hard` | immune |
| `fear` | `fear` | Korku | any | runs away from source | per skill | DR group `fear` | immune |
| `slow` | `slow` | Yavaşlama | any | −X% move speed (`moveSpeedPct` −X) | per skill | strongest only | ×0.5 effect |
| `root` | `root` | Kök Salma | any | cannot move, can attack | per skill | DR group `root` | immune |
| `blind` | **NEW** `blind` | Körlük | any | 50% miss chance on attacks | per skill | — | 25% miss |
| `taunt` | **NEW** `taunt` | Kışkırtma | Şövalye | forced target | 4 s | — | forced target, 4 s, 12 s ICD per boss |
| `vulnerable` | `sunder` | Savunmasız | any | +15% damage taken | per skill | — | full |
| `weaken` | `curse` | Zayıflama | monsters | −20% damage dealt | per skill | — | — |
| `stealth` | `stealth` | Gizlenme | Haydut | enemies drop target; threat ×0.5; next hit +50% DAHA FAZLA & crit | until attack | — | — |
| `iframes` | `iframes` | — | dodge roll, blink, leaps | immune to damage & CC | per action | — | — |
| buffs | `shield`, `haste`, `empower`, `fortify`, `regen`, `invulnerable` | — | skills | absorb / speed / damage / DR / HoT / immunity — see each skill | per skill | — | — |

**Diminishing returns** (per target, per DR group, 8 s window): 100% → 60% → 30% → immune for 6 s. Slows are not on DR.

**Stagger (Sarsma) bar** — the answer to CC on big enemies. Each skill has a `stagger` value (tables in §2). Elites/mini-bosses/bosses have a bar; hard CC on CC-immune targets converts to stagger ×2. Bar decays 10%/s after 3 s without stagger. When full: **Sendeleme** — stunned 3 s (elite) / 4 s (boss), takes ×1.25 damage, bar locked for 10 s after recovery.

| Rank | Stagger bar | Party scaling |
|---|---:|---|
| Seçkin | 100 | ×(1 + 0.5·(n−1)) |
| Ara Patron | 300 | same |
| Patron | 600 | same |

### 1.9 Proc coefficient

Every hit has `proc` (0.1–1.0, in the skill tables). Life steal, life on hit, on-hit ailment chances (`bleedChance` etc.) and on-hit item effects are multiplied by `proc`. Channel ticks and multi-hit ultimates use low procs.

### 1.10 Enemy scaling

Base formulas (trash rank, level L):

```
monsterHP(L)  = round(14 + 0.62 * L^2)
monsterDmg(L) = round(14 + 4.5 * L)        // per basic attack, before attack.coef
xpMonster(L)  = round(5 + 1.2 * L^1.5)
goldAvg(L)    = 2 + 0.5 * L                // when gold drops
```

Design intent: with level-appropriate blue gear a coef 1.0 hit kills a Sıradan in ~2 hits and a Sürü in 1, at every level. Player power is roughly quadratic (linear weapon damage × linear main stat), so monster HP is quadratic; M+ adds exponential pressure on top.

| Seviye | Sıradan HP | Sıradan hasar/vuruş | Sürü HP | Seçkin HP | Ara Patron HP | Patron HP | XP (Sıradan) | Ort. altın (düşerse) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 15 | 19 | 5 | 60 | 300 | 1,200 | 6 | 2.5 |
| 5 | 30 | 37 | 11 | 120 | 600 | 2,400 | 18 | 4.5 |
| 10 | 76 | 59 | 27 | 304 | 1,520 | 6,080 | 43 | 7.0 |
| 15 | 154 | 82 | 54 | 616 | 3,080 | 12,320 | 75 | 9.5 |
| 20 | 262 | 104 | 92 | 1,048 | 5,240 | 20,960 | 112 | 12.0 |
| 25 | 402 | 127 | 141 | 1,608 | 8,040 | 32,160 | 155 | 14.5 |
| 30 | 572 | 149 | 200 | 2,288 | 11,440 | 45,760 | 202 | 17.0 |
| 35 | 774 | 172 | 271 | 3,096 | 15,480 | 61,920 | 253 | 19.5 |
| 40 | 1,006 | 194 | 352 | 4,024 | 20,120 | 80,480 | 309 | 22.0 |
| 45 | 1,270 | 217 | 445 | 5,080 | 25,400 | 101,600 | 367 | 24.5 |
| 50 | 1,564 | 239 | 547 | 6,256 | 31,280 | 125,120 | 429 | 27.0 |
| 55 | 1,890 | 262 | 662 | 7,560 | 37,800 | 151,200 | 494 | 29.5 |
| 60 | 2,246 | 284 | 786 | 8,984 | 44,920 | 179,680 | 563 | 32.0 |

**Ranks**

| Rank id | TR | HP × | Dmg × | XP × | Gold × | Model scale | CC | Attack interval / windup | Aggro radius |
|---|---|---:|---:|---:|---:|---:|---|---|---:|
| `swarm` | Sürü | 0.35 | 0.6 | 0.35 | 0.5 | 0.85 | full | 1.6 s / 0.40 s | 12 m |
| `trash` | Sıradan | 1 | 1 | 1 | 1 | 1.0 | full | 1.8 s / 0.45 s | 12 m |
| `elite` | Seçkin | 4 | 1.5 | 5 | 6 | 1.25 | hard CC 50% duration + stagger bar | 1.5 s / 0.55 s | 15 m |
| `mini_boss` | Ara Patron | 20 | 2.0 | 25 | 25 | 1.5 | hard-CC immune → stagger; slows ×0.5 | per ability | 18 m |
| `boss` | Patron | 80 | 2.5 | 100 | 60 | 2.0 | hard-CC immune → stagger; slows ×0.5 | per ability, telegraphs 1.0–1.5 s | room trigger |

Rank TR names are shown only on elite+ nameplates ("Seçkin", "Ara Patron", "Patron"); trash/swarm have no rank label (avoids confusion with the Sıradan rarity). `swarm` monsters are the horde fodder that makes Hero Siege / PoE density possible: packs of 8–20 Sürü + 3–6 Sıradan, plus a Seçkin pack (1 Seçkin + 3–5 Sıradan) every ~45 s of clearing.

**Monster families** (default resist profile in %, negative = takes extra; `GDD_CONTENT.md` / `data/enemies.ts` may override per monster):

| Family id | TR | Physical DR | Fire | Frost | Lightning | Shadow | Poison | Holy | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `beast` | Hayvan | 0% | 0 | 0 | 0 | 0 | 0 | 0 | — |
| `skeleton` | İskelet | 15% | −25 | 25 | 0 | 50 | 75 | −25 | bleed immune |
| `ghost` | Hortlak | 50% | 0 | 0 | 0 | 75 | 75 | −50 | bleed immune |
| `spider` | Örümcek | 0% | −25 | 0 | 0 | 0 | 50 | 0 | — |
| `cultist` | Kültist | 5% | 10 | 10 | 10 | 25 | 0 | 0 | — |
| `golem` | Golem | 30% | 50 | 50 | −25 | 0 | 75 | 0 | bleed immune |
| `demon` | İblis | 10% | 50 | −25 | 0 | 25 | 25 | −25 | — |

**Level assignment**

| Content | Monster level |
|---|---|
| Open-world zone | zone level ±1 (Seçkin +1, Ara Patron +2, Patron +3), capped 60 |
| Normal dungeon | scales to party average level, clamped to `[dungeon.minLevel, dungeon.minLevel + 10]` |
| Mythic+ | 60, then key multipliers below; armour formula uses attacker level 60 + key |

**Party scaling** (players within 50 m of the monster when it enters combat): HP ×(1 + 0.6·(n−1)) in open world/normal dungeons, ×(1 + 0.7·(n−1)) in Mythic+ (5 players = ×3.8). Damage is not scaled. Stagger bars ×(1 + 0.5·(n−1)).

**Mythic+ multipliers** (`hpMult = 1.10^(k−1)`, `dmgMult = 1.08^(k−1)`, starting key +2). Timer, affixes and rating live in the Mythic+ doc; loot rules are in §7.4.

| Anahtar | HP çarpanı | Hasar çarpanı | Sıradan HP (5 kişi, ×3.8) | Sıradan hasar | Saldıran seviyesi (zırh formülü) | Sandık ilvl | Kasa ilvl |
|---:|---:|---:|---:|---:|---:|---:|---:|
| +2 | ×1.10 | ×1.08 | 9,388 | 307 | 62 | 64 | 67 |
| +3 | ×1.21 | ×1.17 | 10,327 | 331 | 63 | 66 | 69 |
| +4 | ×1.33 | ×1.26 | 11,360 | 358 | 64 | 68 | 71 |
| +5 | ×1.46 | ×1.36 | 12,496 | 386 | 65 | 70 | 73 |
| +6 | ×1.61 | ×1.47 | 13,745 | 417 | 66 | 72 | 75 |
| +7 | ×1.77 | ×1.59 | 15,120 | 451 | 67 | 74 | 77 |
| +8 | ×1.95 | ×1.71 | 16,632 | 487 | 68 | 76 | 79 |
| +9 | ×2.14 | ×1.85 | 18,295 | 526 | 69 | 78 | 81 |
| +10 | ×2.36 | ×2.00 | 20,125 | 568 | 70 | 80 | 83 |
| +12 | ×2.85 | ×2.33 | 24,351 | 662 | 72 | 84 | 87 |
| +15 | ×3.80 | ×2.94 | 32,411 | 834 | 75 | 90 | 93 |
| +18 | ×5.05 | ×3.70 | 43,139 | 1051 | 78 | 90 | 93 |
| +20 | ×6.12 | ×4.32 | 52,198 | 1226 | 80 | 90 | 93 |

### 1.11 Healing & regeneration

```
heal = amount * (1 + S.healReceivedPct) * Π(healing debuffs, e.g. M+ grievous ×0.5)
inCombatRegen/s  = S.hpRegen + S.hpRegenPct * maxHP            // base 0
outOfCombatRegen = inCombatRegen + 0.04 * maxHP                 // after 5 s without damage dealt/taken; also in M+
lifeSteal heal   = damageDealt * S.lifeSteal * proc             // capped at 10% maxHP per rolling 1 s window
```

Heal sources: potions (§6.5), Can Küresi health globes (§7.1), life steal/on-hit/on-kill, Kutsal Toprak, Kan Hiddeti, level-up (full heal + full resource).

### 1.12 Threat (party only)

```
threat += damage * threatMult         // Şövalye threatMult 2.5 (trait), everyone else 1.0
threat += healing * 0.5 / enemiesInCombat
taunt  : threat = topThreat * 1.1 and forced target for 4 s
stealth: own threat × 0.5 on all enemies
```

* First aggro: the first player who enters the aggro radius (or damages the monster from anywhere) gets 10 threat.
* Target switch only when a new player exceeds current target's threat by **10%** (in melee range of the monster) or **30%** (outside melee).
* Pack link: aggroing one member aggroes all pack members within 8 m.
* Bosses ignore threat for their scripted mechanics.

---

## 2. Classes

### 2.0 Shared rules

**Default input map** — matches `DEFAULT_BINDINGS` in `src/core/Input.ts` (all rebindable)

| Input (`InputAction`) | Action |
|---|---|
| WASD (`move*`) | Move (camera-relative) |
| Mouse | Orbit camera (shift-lock ON by default; hold Alt = `freeCursor`) |
| Middle mouse (`toggleLock`) | Kamera Kilidi: toggle shift-lock |
| LMB (`skill_lmb`) | Basic attack / combo (hold = auto-repeat) |
| RMB, Q, E, 1, 2, 3 (`skill_rmb`, `skill_q`, `skill_e`, `skill_s1..s3`) | 6 flexible skill slots |
| R (`skill_r`) | **Ultimate slot** — only the level-30 skill (tag `ultimate`) can go here |
| Shift (`dodge`) | Kaçış Yuvarlanması (dodge roll) |
| Space (`jump`) / Left Ctrl (`walk`) | Jump / walk toggle |
| 4 / 5 (`potionHp` / `potionMp`) | Can İksiri / Ruh İksiri |
| F (`interact`) | Interact, pick up nearest item, revive ally (hold) |
| Tab (`targetNext`) | Soft-target cycle / hard lock (§8.8) |
| I or B / C / N / K / M / O / J | Envanter / Karakter / Pasif Ağaç (`talents`) / Yetenek Kitabı (`skills`) / Harita / Grup / Mitik+ |
| suggested NEW `townPortal` = T | Dönüş Parşömeni (town portal, 3 s channel) |

**Skill bar & loadout.** Each class learns 8 skills (levels 1, 3, 6, 10, 15, 20, 25, 30) but the bar has 6 flexible slots + the ultimate slot, so **one regular skill is always on the bench** — the build choice. Auto-assignment on unlock: L1 → RMB, L3 → Q, L6 → E, L10 → 1, L15 → 2, L20 → 3, L30 → R. The L25 skill goes to the Yetenek Kitabı (K) with the toast "Yeni beceri öğrendin! Yetenek Kitabı'ndan (K) bir yuvaya sürükle." Swapping is free out of combat (not inside an active M+ run after the timer starts). In the skill tables the "Tuş" column shows this default; "kitap" = benched by default.

**Skill data** maps onto the existing `SkillDef` (`src/types/skills.ts`): `cost` (negative = generates), `cooldown`, `castTime` (0 = instant), `channel`, `hitTime` (= normalised hit × segment length / speed), `anim` + `animSpeed`, `targeting` (`melee_arc` / `projectile` / `ground_aoe` / `self_aoe` / `self_buff` / `dash` / `leap` / `teleport` / `beam` / `custom`), `range`, `radius`, `arc`, `speed`, `count`, `spread`, `pierce`, `duration`, `ticks`, `damage {coef, type, perTick}`, `statuses` / `selfStatuses` (`StatusApply`), `knockback`, `tags`, `behavior` (for multi-phase skills such as Hücum, Kalkan Duvarı, Dönen Balta, Ölüm Dansı) and `params` (stagger, proc, resource gain, segment start/end, everything else in the tables). Cast types used below:

| castType | Behaviour | Movement while active | Cancel |
|---|---|---|---|
| `instant` | Animation plays; effect at the clip's hit time. Cost/CD are paid at the hit time | ×0.35 speed until hit time, then free after `recoveryCancel` | dodge any time (nothing paid if before hit time) |
| `cast` | Cast bar (`castTime / castRate`), effect on completion | rooted | dodge cancels (nothing paid) |
| `channel` | Hold key; cost/s; ticks | per skill | release / dodge / other skill |
| `dash` | Moves the caster along a path; unstoppable | scripted | not cancellable |
| `charge` | Hold to charge up to `maxCharge`, release to fire | ×0.5 | dodge |

`speedStat`: Büyücü skills scale animation and cast time with `castRate`; all other classes scale with `APS`. Animation playback rate = `clipSegmentDuration / (baseLock / speedFactor)`.

**Universal: Kaçış Yuvarlanması** (`dodge_roll`, Shift) — 6.0 m in 0.40 s, i-frames 0.04–0.34 s, 2 charges, 4.0 s recharge each (sequential), passes through enemies (not walls), direction = WASD relative to camera (no input → backwards). Clips `Dodge_Forward/Backward/Left/Right` (0.4 s, rate 1.0) chosen by roll direction relative to the character's facing. **Kusursuz Kaçış** (perfect dodge): if an enemy hit would have landed in the first 0.15 s of the i-frames, gain +30% DAHA FAZLA damage for 2 s and refund 50% of the charge; white rim flash + `sfx_perfect_dodge`. Details in §8.7.

**Universal: Jump** — 1.5 m apex, 0.65 s airtime, `Jump_Start → Jump_Idle → Jump_Land`; no combat function in v1.

**Class traits** (always on)

| Trait id | Class | TR | Effect |
|---|---|---|---|
| `trait_guardian` | Şövalye | Muhafız | Threat ×2.5. With a shield: +10% block chance. Blocked hits grant +6 Kararlılık. |
| `trait_bloodthirst` | Barbar | Kana Susamış | +1% attack speed per 10 Öfke (max +10%). +0.5% base life steal. |
| `trait_elemental_balance` | Büyücü | Element Dengesi | Using a skill of a different element (fire/frost/arcane) than the previous skill grants +15% DAHA FAZLA damage for 5 s (refreshes, does not stack). |
| `trait_opportunist` | Haydut | Fırsatçı | Hits from behind (attacker inside the target's rear 120°) get +25% crit damage. +10% crit chance vs stunned/slowed/frozen/blinded targets. |

**Skill table column legend:** Sv = unlock level · Tuş = default slot (see loadout above) · BS = cooldown (s) · Katsayı = damage coefficient × weapon damage (per hit/tick) · Sarsma = stagger points · Proc = proc coefficient · Kilit = base animation lock (s) at speed 1.0. Clip segments are normalised times `[start–end]` of the KayKit clip; "hit" is the normalised hit time (estimated; verify by scrubbing and store in the clip table, see §8.1).

### 2.1 Şövalye (`knight`) — tank / bruiser

* Model `Knight.glb`. Visible nodes: `1H_Sword` (main hand), shield node by base type (`Round_Shield` / `Badge_Shield` / `Rectangle_Shield` / `Spike_Shield`), `Knight_Helmet` when the helm slot is filled (option "Kaskı gizle"), `Knight_Cape`. Hidden: `1H_Sword_Offhand`, `2H_Sword`, unused shields.
* Weapon: `sword1h` (APS 1.4) + `shield`. Resource: Kararlılık. Role: frontline, taunts, party buffs, **holy** (Kutsal) damage.

**Basic attack `knight_basic` – Kılıç Kombosu**

| Hit | Clip [segment] hit | Step time | Arc / range | Coef | Effects | Sarsma | Kararlılık |
|---|---|---|---|---:|---|---:|---:|
| 1 | `1H_Melee_Attack_Slice_Diagonal` [0.00–0.70] hit 0.38 | 1.00/APS | 120° / 2.6 m | 1.00 phys | — | 3 | +4 |
| 2 | `1H_Melee_Attack_Slice_Horizontal` [0.00–0.70] hit 0.40 | 1.00/APS | 150° / 2.6 m | 1.00 phys | — | 3 | +4 |
| 3 | `1H_Melee_Attack_Chop` [0.00–0.75] hit 0.42 | 1.35/APS | 70° / 2.9 m | 1.70 phys | knockback light 0.8 m | 8 | +6 |

**Skills**

| Sv | Tuş | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı (tip) | Etkiler | Sarsma | Proc | Animasyon (Kilit) |
|---|---|---|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | RMB | `knight_shield_bash` | Kalkan Darbesi | 20 Kar. | 3 | instant | melee 100° / 2.8 m | 2.20 phys | stun 0.8 s (Seçkin 0.4 s), knockback medium 2.5 m | 25 | 1.0 | `Block_Attack` [0–0.6] hit 0.40 (0.55) |
| 3 | Q | `knight_charge` | Hücum | +20 Kar. | 10 | dash | dash ≤12 m to soft target (else forward) at 30 m/s; path width 1.5 m; end AoE r 3 m | path 0.60, impact 1.60 phys | path: side-push 1.5 m; impact: stun 1.2 s (Seçkin 0.6 s); unstoppable | 30 | 0.5 / 1.0 | `Running_A` ×2.0 during dash → `1H_Melee_Attack_Stab` [0.15–0.55] (0.35 after arrival) |
| 6 | E | `knight_radiant_cleave` | Işıltılı Yarma | 30 Kar. | 0 | instant | melee 180° / 3.5 m | 2.60 holy | Savunmasız (`sunder`, +15% damage taken) 4 s | 12 | 1.0 | `1H_Melee_Attack_Slice_Horizontal` [0–0.7] hit 0.40 (0.60) |
| 10 | 1 | `knight_challenge` | Meydan Okuma | +30 Kar. | 15 | instant | self AoE r 8 m | — | taunt 4 s all enemies; self −20% damage taken (DAHA AZ) 6 s | 0 | — | `Cheer` [0–0.6] ×1.5 (0.40) |
| 15 | 2 | `knight_shield_wall` | Kalkan Duvarı | 10 Kar. | 16 (starts on release) | channel ≤4 s | frontal 140° block; release cone 90° / 4 m | release 1.50 phys + stored | blocks 100% frontal hits, −50% others; move ×0.4; +5 Kar. per blocked hit; stores 15% of blocked (pre-mitigation) damage, added to release (cap 10×W); release knockback heavy 3 m | 40 | 1.0 | `Blocking` loop → `Block_Attack` [0–0.6] (0.45) |
| 20 | 3 | `knight_consecration` | Kutsal Toprak | 35 Kar. | 18 | instant | ground AoE r 5 m at caster, 6 s | 0.45 holy / 0.5 s tick (12 ticks) | enemies slowed 20%; allies inside heal 1.5% max HP/s and +10% armour | 1/tick | 0.2 | `1H_Melee_Attack_Stab` [0.10–0.60] (sword planted) (0.50) |
| 25 | kitap | `knight_war_banner` | Savaş Sancağı | 0 | 40 | instant | place at caster (or ground ≤8 m), aura r 10 m, 12 s | — | allies +15% DAHA FAZLA damage, +20% armour, +15% resource regen; Şövalye +3 Kar./s; banner invulnerable | 0 | — | `Use_Item` [0–0.5] (0.50) |
| 30 | R | `knight_heavens_judgment` | Göksel Hüküm | 50 Kar. | 60 | dash (leap) | ground target ≤10 m, airtime 0.6 s (invulnerable), landing AoE r 6 m | 7.00 holy | stun 2 s (Seçkin 1 s), knockback 4 m outward + knockup 1 m; then **Kutsanmış** 5 s: −25% damage taken, +20% attack speed | 100 | 1.0 | `Jump_Start` → `Jump_Idle` → `1H_Melee_Attack_Chop` [0.30–0.80] on landing (1.10 total) |

| id | Açıklama (tooltip) | VFX / SFX notes |
|---|---|---|
| `knight_shield_bash` | Kalkanınla önündeki düşmanlara vurarak %220 silah hasarı verirsin, onları sersemletir ve geri itersin. | White-gold shield flare, dust ring at feet, heavy metal clang. Hit-stop heavy. |
| `knight_charge` | Hedefe doğru 12 metreye kadar hücum edersin; yoldaki düşmanları kenara iter, varışta çevrene %160 hasar verip sersemletirsin. 20 Kararlılık kazandırır. | Golden afterimage trail (3 ghost copies, 0.15 s apart), ground scrape decal, impact shockwave ring. |
| `knight_radiant_cleave` | Geniş bir yay çizerek %260 kutsal hasar verir ve vurduğun düşmanları 4 saniye boyunca savunmasız bırakırsın (%15 daha fazla hasar alırlar). | Wide golden-orange crescent swing trail, ember particles, PSX additive sprite. |
| `knight_challenge` | Savaş naranla 8 metre içindeki tüm düşmanları 4 saniye boyunca kendine kışkırtır, 6 saniye boyunca %20 daha az hasar alırsın. | Red-gold shout ring expanding to 8 m; red "!" icon over taunted enemies. Horn-like shout SFX. |
| `knight_shield_wall` | Kalkanını kaldırıp önden gelen tüm saldırıları engellersin. Bıraktığında engellenen hasarın bir kısmını patlamayla geri yansıtırsın. | Translucent golden hexagon barrier in front (dithered), crack flashes per blocked hit, release = cone shockwave. |
| `knight_consecration` | Kılıcını toprağa saplayarak 6 saniye boyunca kutsal bir alan yaratırsın: düşmanlar kutsal hasar alır ve yavaşlar, müttefikler iyileşir. | Golden runic circle decal (r 5 m) with rising motes; low-res animated rune texture. |
| `knight_war_banner` | 12 saniye boyunca bir savaş sancağı dikersin: yakındaki müttefikler %15 daha fazla hasar verir ve %20 daha fazla zırh kazanır. | Low-poly pole + cloth quad with party colour, vertex-wave cloth shader, golden aura ring. |
| `knight_heavens_judgment` | Göğe sıçrayıp hedef noktaya inerek %700 kutsal hasar verirsin, düşmanları sersemletir ve savurursun. Ardından 5 saniye boyunca kutsanırsın. | Golden light pillar from sky at landing point (telegraph 0.6 s), ground crack decal, screen shake 0.45, flash. |

### 2.2 Barbar (`barbarian`) — berserker

* Model `Barbarian.glb`. Visible: `2H_Axe`; `Barbarian_Hat` when helm slot filled; `Barbarian_Cape`. Hidden: `1H_Axe`, `1H_Axe_Offhand`, `Barbarian_Round_Shield`, `Mug` (Mug only for the town `Cheer` emote).
* Weapon: `axe2h` (APS 1.0). Resource: Öfke (starts empty, builds by fighting). Role: AoE melee, sustain through life steal, highest stagger.

**Basic attack `barbarian_basic` – Balta Kombosu**

| Hit | Clip [segment] hit | Step time | Arc / range | Coef | Effects | Sarsma | Öfke |
|---|---|---|---|---:|---|---:|---:|
| 1 | `2H_Melee_Attack_Slice` [0.00–0.70] hit 0.40 | 0.90/APS | 140° / 3.0 m | 1.10 phys | — | 5 | +5 |
| 2 | `2H_Melee_Attack_Stab` [0.10–0.60] hit 0.35 | 0.90/APS | 50° / 3.2 m | 1.10 phys | — | 5 | +5 |
| 3 | `2H_Melee_Attack_Chop` [0.00–0.70] hit 0.45 | 1.40/APS | 70° / 3.2 m + impact AoE r 1.5 m | 2.00 phys | knockback medium 1.5 m | 12 | +8 |

**Skills**

| Sv | Tuş | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı (tip) | Etkiler | Sarsma | Proc | Animasyon (Kilit) |
|---|---|---|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | RMB | `barbarian_cleave` | Yarma | 25 Öfke | 0 | instant | melee 200° / 3.6 m | 2.40 phys | bleed 30% over 4 s; knockback light 0.8 m | 10 | 1.0 | `2H_Melee_Attack_Slice` [0–0.7] ×1.2 hit 0.40 (0.60) |
| 3 | Q | `barbarian_leap` | Sıçrayış | +15 Öfke | 9 | dash (leap) | ground ≤14 m, airtime 0.55 s, landing AoE r 4 m | 2.20 phys | slow 40% 2.5 s; knockback 1.5 m outward; unstoppable | 25 | 1.0 | `Jump_Full_Short` ×2.1 (landing lock 0.25) |
| 6 | E | `barbarian_whirlwind` | Kasırga | 10 + 16/s Öfke | 0 | channel | self AoE r 3.2 m | 0.70 phys / 0.25 s tick | move ×0.75, steerable; immune to slow while channelling | 2/tick | 0.3 | `2H_Melee_Attack_Spinning` loop (rate × APS) |
| 10 | 1 | `barbarian_war_cry` | Savaş Narası | +40 Öfke | 20 | instant | self AoE r 8 m | — | fear 1.5 s (Sıradan/Sürü), Seçkin slowed 30% 2 s; self 8 s +20% DAHA FAZLA damage, +15% attack speed; allies ≤15 m +10% DAHA FAZLA damage 8 s | 10 | — | `Cheer` [0–0.6] ×1.4 (0.50) |
| 15 | 2 | `barbarian_fissure` | Yer Yaran | 35 Öfke | 7 | instant | line 12 m × 2.5 m, travels 30 m/s | 3.40 phys | stun 1.5 s (Seçkin 0.75 s), knockup 0.8 m | 45 | 1.0 | `2H_Melee_Attack_Chop` [0–0.7] hit 0.45 (0.80) |
| 20 | 3 | `barbarian_axe_throw` | Dönen Balta | 15 Öfke | 2 | instant | projectile out 14 m at 22 m/s then returns, r 0.8 m, pierce all | 1.60 phys per pass | each target hit max 2× (out + back); bleed 20% over 3 s | 6 | 0.7 | `Throw` [0.20–0.70] hit 0.45 (0.45) |
| 25 | kitap | `barbarian_blood_rage` | Kan Hiddeti | 15% current HP | 35 | instant | self buff 10 s | — | +8% life steal, +25% DAHA FAZLA damage, immune to slow/root, +50% Öfke generation | 0 | — | `Cheer` [0–0.5] ×1.6 (0.35) |
| 30 | R | `barbarian_ancestral_tempest` | Ata Fırtınası | needs ≥50 Öfke, consumes all | 50 | channel 2.4 s (fixed) | self AoE r 6 m | 1.50 phys × 8 ticks | +1% DAHA FAZLA damage per Öfke consumed (max +100%); pulls enemies 3 m inward every 0.5 s; final knockback 4 m; unstoppable, −30% damage taken | 15/tick | 0.25 | `2H_Melee_Attack_Spin` full (2.4 s, rate 1.0) |

| id | Açıklama (tooltip) | VFX / SFX notes |
|---|---|---|
| `barbarian_cleave` | Baltanı geniş bir yayda savurarak %240 silah hasarı verirsin ve düşmanlarda kanama başlatırsın. | Red-steel arc trail, blood spark sprites, meaty impact SFX. |
| `barbarian_leap` | Hedef noktaya sıçrayıp inişte %220 hasar verirsin ve düşmanları yavaşlatırsın. 15 Öfke kazandırır. | Dust explosion + low-poly rock debris on landing, landing crack decal, shake 0.25. |
| `barbarian_whirlwind` | Bir kasırga gibi dönerek çevrendeki tüm düşmanlara sürekli hasar verirsin. Hareket edebilirsin. | Swirling wind/blood ribbon ring (r 3.2 m), dust kicks, looping whoosh SFX. |
| `barbarian_war_cry` | Kükreyerek yakındaki düşmanları korkutur, 8 saniye boyunca hasarını ve saldırı hızını artırırsın. Müttefiklerin de güçlenir. 40 Öfke kazandırır. | Red shockwave ring, camera shake 0.2, deep roar SFX, red screen-edge pulse for allies buffed. |
| `barbarian_fissure` | Baltanı yere indirerek 12 metre boyunca ilerleyen bir yarık açarsın; yoldaki düşmanlar %340 hasar alır ve havaya fırlar. | Ground crack decal line erupting low-poly rocks sequentially along the line, heavy shake 0.35. |
| `barbarian_axe_throw` | Dönen bir balta fırlatırsın; gidişte ve dönüşte değdiği her düşmana %160 hasar verir. | Spinning clone of the `1H_Axe` mesh with red ribbon trail; whirring loop SFX. |
| `barbarian_blood_rage` | Canının %15'ini feda ederek 10 saniye boyunca çılgına dönersin: can çalma, hasar ve Öfke üretimin artar. | Red aura, character material tint red (emissive 0.3), steam particles, heartbeat SFX. |
| `barbarian_ancestral_tempest` | Tüm Öfkeni tüketerek atalarının ruhunu çağırır, devasa bir fırtınayla çevrendeki düşmanları içine çekip parçalarsın. | Giant red tornado (scrolling cylinder), spectral ancestor axes orbiting, debris, shake 0.45, final shockwave. |

### 2.3 Büyücü (`mage`) — ranged caster (ateş / buz / gizem)

* Model `Mage.glb`. Staff build: visible `2H_Staff`. Wand build: `1H_Wand` + `Spellbook` (swap to `Spellbook_open` during `Spellcast_Long`/channels). `Mage_Hat` when helm slot filled; `Mage_Cape`.
* Weapons: `staff` (2H, APS 1.1) or `wand` (APS 1.4) + `tome` (Büyü Kitabı). Resource: Mana. Every skill uses `castRate`.

**Basic attack `mage_basic` – Gizem Oku** (ranged 3-cast chain)

| Cast | Clip [segment] hit | Step time | Projectile | Coef | Effects | Sarsma | Mana |
|---|---|---|---|---:|---|---:|---:|
| 1 | `Spellcast_Shoot` [0.05–0.75] hit 0.40 | 1.00/castRate | 30 m/s, r 0.35 m, range 25 m | 0.95 arcane | — | 2 | +2 on hit |
| 2 | same (mirrored hand flash) | 1.00/castRate | same | 0.95 arcane | — | 2 | +2 |
| 3 | `Spellcast_Shoot` [0.05–0.80] | 1.25/castRate | 3 bolts, spread ±10° | 0.65 arcane each | — | 2 each | +2 per hit |

**Skills**

| Sv | Tuş | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı (tip) | Etkiler | Sarsma | Proc | Animasyon (Kilit) |
|---|---|---|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | RMB | `mage_fireball` | Ateş Topu | 12 Mana | 0 | instant | projectile 24 m/s, r 0.5 m, range 30 m; explodes r 2.5 m | 2.30 fire | burn 50% over 3 s | 8 | 1.0 | `Spellcast_Shoot` [0.10–0.70] hit 0.40 (0.45) |
| 3 | Q | `mage_frost_nova` | Buz Halkası | 18 Mana | 9 | instant | self AoE r 5 m | 1.20 frost | freeze 2 s (Sıradan/Sürü); Seçkin+: chill 5 stacks (−50%) 3 s | 20 | 1.0 | `Spellcasting` [0–1] (0.35) |
| 6 | E | `mage_blink` | Işınlanma | 10 Mana | 5 | instant | teleport ≤10 m (move dir, else camera forward), 0.10 s | 0.80 arcane at origin r 2.5 m | i-frames 0.25 s; origin burst slows 30% 2 s | 5 | 0.5 | vanish/appear sprite; `Dodge_Forward` [0.5–1.0] on arrival (0.15) |
| 10 | 1 | `mage_meteor` | Meteor | 35 Mana | 8 | cast 0.6 s | ground ≤25 m, impact 0.9 s after cast, r 4 m | 5.00 fire + ground 0.40 fire / 0.5 s × 6 (r 3 m, 3 s) | knockback 2 m outward; telegraph decal visible to all | 50 | 1.0 / 0.2 | `Spellcast_Raise` [0.10–0.60] (cast) |
| 15 | 2 | `mage_blizzard` | Kar Fırtınası | 15 + 10/s Mana | 0 | channel ≤5 s | ground ≤25 m, r 5 m; centre follows reticle at 6 m/s | 0.55 frost / 0.25 s tick | slow 40%; +1 chill stack per tick (5 → freeze 1.5 s on Sıradan); caster rooted | 1/tick | 0.25 | `Spellcasting` loop |
| 20 | 3 | `mage_arcane_orb` | Gizemli Küre | 25 Mana | 4 | instant | projectile 7 m/s, range 20 m, pierce all; pulses r 2.5 m; end explosion r 4 m | 0.50 arcane / 0.25 s pulse; end 3.00 arcane | — | 2/pulse, 20 end | 0.3 / 1.0 | `Spellcast_Shoot` [0.10–0.70] (0.45) |
| 25 | kitap | `mage_mana_barrier` | Büyü Kalkanı | 30 Mana | 25 | instant | self buff 8 s | on break 1.00 frost r 4 m | absorb shield = 25% max HP + 3×Zeka; while it holds +20% cast speed; on break/expire: frost burst (chill 2 stacks) | 10 | 1.0 | `Spellcast_Raise` [0.20–0.55] (0.40) |
| 30 | R | `mage_arcane_cataclysm` | Kadim Kıyamet | 50 Mana | 70 | channel 3.0 s (fixed) | 15 star strikes on random enemies ≤14 m (elites first), r 2 m each; final nova r 8 m | strikes 1.30 arcane; nova 4.00 arcane | move ×0.5 while channelling; nova knockback 5 m | 8/strike, 60 nova | 0.3 / 1.0 | `Spellcast_Long` loop [0.20–0.80] → `Spellcast_Shoot` (nova) |

| id | Açıklama (tooltip) | VFX / SFX notes |
|---|---|---|
| `mage_fireball` | Çarptığında patlayan bir ateş topu fırlatırsın: %230 ateş hasarı verir ve düşmanları yakar. | Low-poly icosphere with flipbook flame trail, impact explosion sprite + point light flash (0.15 s). |
| `mage_frost_nova` | Çevrendeki düşmanları dondurup %120 buz hasarı verirsin. Güçlü düşmanlar ağır şekilde yavaşlar. | Expanding ice ring, ice-crystal shard meshes on frozen enemies, frozen material swap (blue-white, dithered). |
| `mage_blink` | Kısa bir mesafeye ışınlanırsın; ayrıldığın yerde düşmanlara hasar veren bir gizem patlaması bırakırsın. | Purple particle burst at origin and destination, 1-frame character hide, crackle SFX. |
| `mage_meteor` | Hedef noktaya bir meteor çağırırsın: %500 ateş hasarı verir ve yerde 3 saniye yanan bir alan bırakır. | Red ring telegraph decal, falling rock with fire trail from 25 m up, big explosion, shake 0.35, scorched decal. |
| `mage_blizzard` | Hedef bölgeye sürekli buz yağdırarak düşmanları yavaşlatır ve sonunda dondurursun. | Falling ice shard particles, blue fog disc decal, wind loop SFX. |
| `mage_arcane_orb` | Yavaşça ilerleyen, yolundaki her şeyi delen ve sonunda patlayan bir gizem küresi gönderirsin. | Violet glowing orb with orbiting motes, screen-space wobble, hum loop SFX. |
| `mage_mana_barrier` | 8 saniye boyunca hasarı emen bir büyü kalkanıyla korunursun; kalkan dayanırken daha hızlı büyü yaparsın. | Translucent icosahedron bubble (PSX dithered transparency), shatter shards on break. |
| `mage_arcane_cataclysm` | Gökten yıldızlar yağdırarak çevrendeki düşmanları dövüp son olarak büyük bir gizem dalgasıyla savurursun. | Fog tint shifts purple, star beams strike from above, final violet shockwave + flash, shake 0.45. |

### 2.4 Haydut (`rogue`) — agile assassin, hançer + arbalet

* Model `Rogue.glb` or `Rogue_Hooded.glb` (cosmetic choice at character creation: "Kapüşonlu"). Visible: `Knife` + `Knife_Offhand` in melee; `1H_Crossbow` (hide `Knife`) during Arbalet Atışı; `2H_Crossbow` (hide both knives) during Ok Yağmuru; `Throwable` during Bıçak Yelpazesi / Duman Bombası. `Rogue_Cape` always. The crossbows are class tools, not items: ranged skills use main-hand weapon damage.
* Weapons: `dagger` (APS 1.7) in `weapon` + a second `dagger` in `offhand` (Haydut-only dual wield, §4.4). Resources: Enerji + Kombo Puanı.

**Basic attack `rogue_basic` – Hançer Kombosu**

| Hit | Clip [segment] hit | Step time | Arc / range | Coef | Effects | Sarsma | Kombo |
|---|---|---|---|---:|---|---:|---:|
| 1 | `Dualwield_Melee_Attack_Slice` [0.00–0.65] hit 0.35 | 0.90/APS | 120° / 2.4 m | 0.85 phys | — | 2 | +1 |
| 2 | `Dualwield_Melee_Attack_Chop` [0.00–0.65] hit 0.40 | 0.90/APS | 90° / 2.4 m | 0.85 phys | — | 2 | +1 |
| 3 | `Dualwield_Melee_Attack_Stab` [0.05–0.60] hit 0.32 | 1.30/APS | 45° / 2.7 m | 1.60 phys | bleed 25% over 3 s; knockback light 0.5 m | 6 | +1 |

**Skills**

| Sv | Tuş | id | Ad | Maliyet | BS | Döküm | Hedefleme | Katsayı (tip) | Etkiler | Sarsma | Proc | Animasyon (Kilit) |
|---|---|---|---|---|---:|---|---|---|---|---:|---:|---|
| 1 | RMB | `rogue_crossbow_shot` | Arbalet Atışı | 15 Enerji | 0 | instant | projectile 45 m/s, r 0.3 m, range 30 m, pierce 1 | 1.80 phys | +1 Kombo on hit | 5 | 1.0 | `1H_Ranged_Shoot` [0.15–0.60] hit 0.30 (0.40) |
| 3 | Q | `rogue_shadow_step` | Gölge Adımı | 20 Enerji | 9 | instant | teleport behind soft target ≤15 m (none: 8 m forward) | — | i-frames 0.2 s; next melee hit within 3 s is a guaranteed crit; +1 Kombo | 0 | — | `Dodge_Forward` [0.5–1.0] (0.20) |
| 6 | E | `rogue_fan_of_knives` | Bıçak Yelpazesi | 30 Enerji | 4 | instant | self AoE r 5 m | 1.50 phys | 1 Zehir stack; slow 30% 2 s; +1 Kombo per target (max +3) | 6 | 0.7 | `Throw` [0.20–0.60] ×1.5 (0.35) |
| 10 | 1 | `rogue_eviscerate` | İnfaz | 30 Enerji, ≥1 Kombo | 0 | instant (finisher) | melee 60° / 2.8 m, max 3 targets | 1.40 + 1.20 × Kombo phys (5 → 7.40) | consumes all Kombo; at 5: bleed 100% over 4 s + stun 0.5 s | 8 + 6×Kombo | 1.0 | `Dualwield_Melee_Attack_Stab` [0.05–0.60] ×1.4 (0.50) |
| 15 | 2 | `rogue_smoke_bomb` | Duman Bombası | 25 Enerji | 18 | instant | ground AoE r 5 m at caster, 5 s | — | enemies inside: blind (50% miss) and drop the Haydut as target; Haydut inside: Gizlenme (breaks on attack or 1 s after leaving), first hit from stealth +50% DAHA FAZLA & crit | 0 | — | `Throw` [0.20–0.60] (0.40) |
| 20 | 3 | `rogue_bolt_rain` | Ok Yağmuru | 40 Enerji | 10 | instant | ground ≤22 m, r 5 m, 8 waves / 0.25 s | 0.60 phys per wave | slow 25% | 3/wave | 0.3 | `2H_Ranged_Shoot` [0.15–0.60] aimed up (0.45) |
| 25 | kitap | `rogue_deadly_venom` | Ölümcül Zehir | 0 | 30 | instant | self buff 12 s | — | every hit applies +1 extra Zehir stack; poison damage +50% DAHA FAZLA; İnfaz triggers **Zehir Patlaması**: consumes the target's stacks, deals their remaining damage ×1.5 instantly in r 3 m | 0 | — | `Use_Item` [0–0.4] (0.40) |
| 30 | R | `rogue_death_blossom` | Ölüm Dansı | 50 Enerji | 60 | dash (multi) | up to 8 enemies ≤12 m, 0.3 s per target, 3 strikes each | 1.00 phys per strike | untargetable 2.4 s; grants 5 Kombo at the end | 4/strike | 0.4 | cycle `Dualwield_Melee_Attack_Slice/Chop/Stab` at ×2.5 with afterimages |

| id | Açıklama (tooltip) | VFX / SFX notes |
|---|---|---|
| `rogue_crossbow_shot` | Arbaletinle delici bir ok atarak %180 hasar verirsin. 1 Kombo Puanı kazandırır. | `arrow.gltf` bolt with white streak trail, twang SFX, small impact puff. |
| `rogue_shadow_step` | Hedefin arkasına ışınlanırsın; 3 saniye içindeki ilk yakın dövüş vuruşun kesin kritik olur. | Black-purple smoke puff at origin and destination, whoosh SFX. |
| `rogue_fan_of_knives` | Çevrene bıçak yağdırarak %150 hasar verir, düşmanları zehirler ve yavaşlatırsın. | Ring of 12 cloned `Knife` meshes flying outward, green tint on poisoned enemies. |
| `rogue_eviscerate` | Tüm Kombo Puanlarını harcayan ölümcül bir bitirici. 5 Kombo ile hedef kanar ve sersemler. | Red X-slash decal on target, blood burst, heavy hit-stop, combo pips burst UI. |
| `rogue_smoke_bomb` | Bir duman bombası atarsın: içindeki düşmanlar kör olur ve seni kaybeder, sen ise gizlenirsin. | Grey dithered smoke sprites (r 5 m), stealth = character alpha 0.35 with dither. |
| `rogue_bolt_rain` | Hedef bölgeye ok yağdırarak 2 saniye boyunca toplam %480 hasar verirsin. | Bolts (`arrow_bundle.gltf`) falling in waves, dust puffs, rhythmic thunk SFX. |
| `rogue_deadly_venom` | 12 saniye boyunca bıçaklarını ölümcül zehirle kaplarsın; İnfaz zehri patlatır. | Daggers emissive green, dripping particles, green burst on Zehir Patlaması. |
| `rogue_death_blossom` | Gölgelere karışıp yakındaki düşmanların arasında dans ederek her birine üç kez saplarsın. | Dark-violet afterimage trail, slash lines on each target, slow-motion-feel via hit-stop chain. |

---

## 3. Pasif Ağaç (Path of Exile-style shared constellation)

### 3.1 Rules

| Rule | Value |
|---|---|
| Points | 1 per level from L2 (59) + 6 from "Kadim Bilgelik" quests at L12/22/32/42/52/60 + 5 from M+ rating milestones 500/1000/1500/2000/2500 = **70 total** |
| Allocation | A node can be allocated if it is adjacent to an allocated node. Own class start is allocated for free at creation. |
| Foreign start nodes | Allocatable for 1 point by other classes; grant +10 of that class's main stat. They let a character cross through another quadrant. |
| Refund | Single node: 25 × level gold (only if the remaining tree stays connected to the class start). Full reset: "Kadim Unutuş Parşömeni" 1,000 × level gold; the first full reset is free. |
| Layout | Coordinates in a 2D plane, origin = tree centre, x right, **y down** (screen space), radius ≈ 1,000. |
| UI | Pan/zoom canvas. Node draw radius: small 14 px, notable 22 px, keystone 30 px, start 34 px (at zoom 1 = 1 unit/px × 0.5). Allocated links gold `#e8c25a`, available links pale, locked links dark. Hover shows tooltip + shortest-path point cost (BFS). |
| Data | `PassiveNodeDef { id, type, nameTr, x, y, links[], effects[] }`; effect keys as in the table below (`stat+value` = flat/increased per §1.1; `more_*` = DAHA FAZLA multiplier; other keys are rule flags). |

### 3.2 Layout

```
                    N: Büyülü Kılıç  (köprü ŞÖVALYE.B ↔ BÜYÜCÜ.A, kutsal/ateş teması)
      ŞÖVALYE (225°)  ●                                   ●  BÜYÜCÜ (-45°)
        A Kılıç  → W        ◇ hub         hub ◇        A Ateş  → N
        M Kale   (dışa)            CORE               M Gizem (dışa)
        B Kutsal → N        ◇ hub         hub ◇        B Buz   → E
 W: Savaş Lordu ·                                               · E: Gizemli Hilekâr
        B Dev    → W        (hub halkası 4 hub'ı bağlar)      A Gölge → E
        M Hiddet (dışa)                                       M Suikast (dışa)
        A Kan    → S                                          B Zehir/Nişancı → S
      BARBAR (135°)   ●                                   ●  HAYDUT (45°)
                    S: Avcı İçgüdüsü (köprü HAYDUT.B ↔ BARBAR.A, kanama/zehir teması)
```

* Class starts on the diagonals at r = 420. From each start: an inward path (r 300, 190) to a hub (r 90) and the centre **Kadim Çekirdek**; the 4 hubs form a ring.
* Three outward arms per class at θ−25° (A), θ (M), θ+25° (B), nodes at r = 520 / 600 / **690 (notable)** / 780 / 860 / **950 (keystone or notable)**.
* Two cross-links at r = 780 (θ ± 12.5°) join the arms into a wheel.
* Each class's B-arm (node at r 600) connects through a 7-node bridge arc (r 640, notable in the middle on the cardinal axis) to the next class's A-arm (clockwise: Büyücü → Haydut → Barbar → Şövalye → Büyücü).

**At a glance – keystones (8)**

| Quadrant | Keystone | Rule change |
|---|---|---|
| Şövalye A | Sabit El | Cannot crit, 30% DAHA FAZLA damage, +50% stagger |
| Şövalye M | Demir Kale | Block ×2 (cap 75), dodge 0, heal 2% per block, −10% move speed |
| Barbar A | Kan Kurban | Life steal ×2 (cap 20%/s), no natural regen, potions −50% |
| Barbar M | Çılgın Ruh | +1% DAHA FAZLA damage per 1% missing HP (max 60), −30% healing received |
| Büyücü A | Cam Top | 35% DAHA FAZLA damage, 30% DAHA AZ max HP |
| Büyücü M | Zihin Kalkanı | 30% of damage taken from mana first (4 dmg = 1 mana) |
| Haydut A | Gölge Dansı | +1 dodge charge, faster recharge, guaranteed crit after roll, −15% max HP |
| Haydut M | Kusursuz İşkence | Bleed/poison can crit; hit crit multiplier ×0.7 |

### 3.3 Full node list

Total **125** nodes: 4 start, 92 small, 21 notable, 8 keystone; **140** links (bidirectional). Columns map 1:1 onto `TalentNode` (`kind`, `name`, `x`, `y`, `links`, `stats`, `special {id, desc, params}`, `classStart`); use the TR tooltip as `desc`.

| id | `kind` | ad (TR) | x | y | `links` | etki (TR tooltip) | `stats` (fractions) | `special` |
|---|---|---|---:|---:|---|---|---|---|
| `core` | notable (Önemli) | Kadim Çekirdek | 0 | 0 | `mg_hub` `rg_hub` `bb_hub` `kn_hub` | +10 Tüm Özellikler; +%5 hasar; +%5 maks. can | `{ allAttr: 10, damagePct: 0.05, maxHpPct: 0.05 }` | — |
| `mg_start` | start (Başlangıç) | Büyücü Başlangıcı | 297 | -297 | `mg_p1` `mg_a1` `mg_m1` `mg_b1` | Büyücü için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Zeka | — | classStart: `mage`; foreign `{ int: 10 }` |
| `mg_p1` | small (Küçük) | Zeka | 212 | -212 | `mg_start` `mg_p2` | +10 Zeka | `{ int: 10 }` | — |
| `mg_p2` | small (Küçük) | Dayanıklılık | 134 | -134 | `mg_p1` `mg_hub` | +10 Dayanıklılık | `{ vit: 10 }` | — |
| `mg_hub` | small (Küçük) | Tüm Özellikler | 64 | -64 | `mg_p2` `core` `rg_hub` `kn_hub` | +5 Tüm Özellikler | `{ allAttr: 5 }` | — |
| `mg_a1` | small (Küçük) | Ateş hasarı | 178 | -489 | `mg_start` `mg_a2` | +%8 ateş hasarı | `{ fireDamagePct: 0.08 }` | — |
| `mg_a2` | small (Küçük) | Büyü hızı | 205 | -564 | `mg_a1` `n_pyromancer` `br_n6` | +%4 büyü hızı | `{ castSpeed: 0.04 }` | — |
| `n_pyromancer` | notable (Önemli) | Ateş Ustası | 236 | -648 | `mg_a2` `mg_a3` | +%30 ateş hasarı; Yanma süresi +%50; yanan düşmanlara +%10 kritik hasarı | `{ fireDamagePct: 0.3 }` | `n_pyromancer` `{ burnDurationPct: 0.5, critDamageVsBurning: 0.1 }` |
| `mg_a3` | small (Küçük) | Zamanla hasar | 267 | -733 | `n_pyromancer` `mg_a4` `mg_c1` | +%10 zamanla hasar | `{ dotPct: 0.1 }` | — |
| `mg_a4` | small (Küçük) | Ateş hasarı | 294 | -808 | `mg_a3` `ks_glass_cannon` | +%8 ateş hasarı | `{ fireDamagePct: 0.08 }` | — |
| `ks_glass_cannon` | keystone (Kilit Taşı) | Cam Top | 325 | -893 | `mg_a4` | %35 DAHA FAZLA hasar. Maks. can %30 DAHA AZ. | — | `ks_glass_cannon` `{ moreDamage: 1.35, moreHp: 0.7 }` |
| `mg_m1` | small (Küçük) | Maks. kaynak | 368 | -368 | `mg_start` `mg_m2` | +5 maks. kaynak | `{ maxResource: 5 }` | — |
| `mg_m2` | small (Küçük) | Kaynak yenilenmesi | 424 | -424 | `mg_m1` `n_arcane_flow` | +%10 kaynak yenilenmesi | `{ resourceRegenPct: 0.1 }` | — |
| `n_arcane_flow` | notable (Önemli) | Gizem Akışı | 488 | -488 | `mg_m2` `mg_m3` | +%30 kaynak yenilenmesi; +15 maks. mana; büyü maliyetleri −%8 | `{ resourceRegenPct: 0.3, maxResource: 15, costReductionPct: 0.08 }` | — |
| `mg_m3` | small (Küçük) | Gizem hasarı | 552 | -552 | `n_arcane_flow` `mg_m4` `mg_c1` `mg_c2` | +%8 gizem hasarı | `{ arcaneDamagePct: 0.08 }` | — |
| `mg_m4` | small (Küçük) | Bekleme süresi azaltma | 608 | -608 | `mg_m3` `ks_mind_shield` | +%3 bekleme süresi azaltma | `{ cdr: 0.03 }` | — |
| `ks_mind_shield` | keystone (Kilit Taşı) | Zihin Kalkanı | 672 | -672 | `mg_m4` | Alınan hasarın %30'u önce manadan düşülür (4 hasar = 1 mana). Mana 0 iken etkisiz. +%20 kaynak yenilenmesi. | `{ resourceRegenPct: 0.2 }` | `ks_mind_shield` `{ damageToManaPct: 0.3, damagePerMana: 4 }` |
| `mg_b1` | small (Küçük) | Buz hasarı | 489 | -178 | `mg_start` `mg_b2` | +%8 buz hasarı | `{ frostDamagePct: 0.08 }` | — |
| `mg_b2` | small (Küçük) | Kontrol etkisi süresi | 564 | -205 | `mg_b1` `n_cryomancer` `br_e1` | +%10 kontrol etkisi süresi | `{ ccDurationPct: 0.1 }` | — |
| `n_cryomancer` | notable (Önemli) | Buz Ustası | 648 | -236 | `mg_b2` `mg_b3` | +%25 buz hasarı; Donma süresi +%30; donmuş/üşümüş düşmanlara +%15 hasar | `{ frostDamagePct: 0.25, chilledDamagePct: 0.15 }` | `n_cryomancer` `{ freezeDurationPct: 0.3 }` |
| `mg_b3` | small (Küçük) | Buz hasarı | 733 | -267 | `n_cryomancer` `mg_b4` `mg_c2` | +%8 buz hasarı | `{ frostDamagePct: 0.08 }` | — |
| `mg_b4` | small (Küçük) | Büyü hızı | 808 | -294 | `mg_b3` `n_spell_echo` | +%4 büyü hızı | `{ castSpeed: 0.04 }` | — |
| `n_spell_echo` | notable (Önemli) | Büyü Yankısı | 893 | -325 | `mg_b4` | Mermi büyülerin %12 şansla bedavaya ikinci kez atılır (Yankı, %70 hasar) | — | `n_spell_echo` `{ echoChance: 0.12, echoDamageMult: 0.7 }` |
| `mg_c1` | small (Küçük) | Kritik şansı | 419 | -658 | `mg_a3` `mg_m3` | +%1 kritik şansı | `{ critChance: 0.01 }` | — |
| `mg_c2` | small (Küçük) | Maks. can | 658 | -419 | `mg_m3` `mg_b3` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `rg_start` | start (Başlangıç) | Haydut Başlangıcı | 297 | 297 | `rg_p1` `rg_a1` `rg_m1` `rg_b1` | Haydut için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Çeviklik | — | classStart: `rogue`; foreign `{ dex: 10 }` |
| `rg_p1` | small (Küçük) | Çeviklik | 212 | 212 | `rg_start` `rg_p2` | +10 Çeviklik | `{ dex: 10 }` | — |
| `rg_p2` | small (Küçük) | Dayanıklılık | 134 | 134 | `rg_p1` `rg_hub` | +10 Dayanıklılık | `{ vit: 10 }` | — |
| `rg_hub` | small (Küçük) | Tüm Özellikler | 64 | 64 | `rg_p2` `core` `mg_hub` `bb_hub` | +5 Tüm Özellikler | `{ allAttr: 5 }` | — |
| `rg_a1` | small (Küçük) | Kaçınma | 489 | 178 | `rg_start` `rg_a2` | +%2 kaçınma | `{ dodgeChance: 0.02 }` | — |
| `rg_a2` | small (Küçük) | Hareket hızı | 564 | 205 | `rg_a1` `n_like_a_shadow` `br_e6` | +%3 hareket hızı | `{ moveSpeedPct: 0.03 }` | — |
| `n_like_a_shadow` | notable (Önemli) | Gölge Gibi | 648 | 236 | `rg_a2` `rg_a3` | +%8 kaçınma; +%10 hareket hızı; kaçınılan her saldırı +10 Enerji | `{ dodgeChance: 0.08, moveSpeedPct: 0.1 }` | `n_like_a_shadow` `{ energyOnDodge: 10 }` |
| `rg_a3` | small (Küçük) | Kritik şansı | 733 | 267 | `n_like_a_shadow` `rg_a4` `rg_c1` | +%1 kritik şansı | `{ critChance: 0.01 }` | — |
| `rg_a4` | small (Küçük) | Kaçınma | 808 | 294 | `rg_a3` `ks_shadow_dance` | +%2 kaçınma | `{ dodgeChance: 0.02 }` | — |
| `ks_shadow_dance` | keystone (Kilit Taşı) | Gölge Dansı | 893 | 325 | `rg_a4` | Kaçış Yuvarlanması +1 şarj ve %30 daha hızlı dolar. Yuvarlanmadan sonraki 1.5 sn içindeki ilk vuruş kesin kritik. Maks. can %15 DAHA AZ. | — | `ks_shadow_dance` `{ dodgeRollCharges: 1, dodgeRollRechargePct: -0.3, guaranteedCritWindow: 1.5, moreHp: 0.85 }` |
| `rg_m1` | small (Küçük) | Kritik şansı | 368 | 368 | `rg_start` `rg_m2` | +%1 kritik şansı | `{ critChance: 0.01 }` | — |
| `rg_m2` | small (Küçük) | Kritik hasarı | 424 | 424 | `rg_m1` `n_assassin` | +%12 kritik hasarı | `{ critDamage: 0.12 }` | — |
| `n_assassin` | notable (Önemli) | Suikastçı | 488 | 488 | `rg_m2` `rg_m3` | +%5 kritik şansı; +%40 kritik hasarı; arkadan vuruşlarda +%10 kritik şansı | `{ critChance: 0.05, critDamage: 0.4 }` | `n_assassin` `{ backstabCritChance: 0.1 }` |
| `rg_m3` | small (Küçük) | Yakın dövüş hasarı | 552 | 552 | `n_assassin` `rg_m4` `rg_c1` `rg_c2` | +%8 yakın dövüş hasarı | `{ meleeDamagePct: 0.08 }` | — |
| `rg_m4` | small (Küçük) | Kritik hasarı | 608 | 608 | `rg_m3` `ks_perfect_agony` | +%12 kritik hasarı | `{ critDamage: 0.12 }` | — |
| `ks_perfect_agony` | keystone (Kilit Taşı) | Kusursuz İşkence | 672 | 672 | `rg_m4` | Kanama ve Zehir uygulanırken kritik atabilir ve kritik çarpanını kullanır. Doğrudan vuruşların kritik çarpanı %30 azalır. | — | `ks_perfect_agony` `{ dotCanCrit: 1, hitCritMultScale: 0.7 }` |
| `rg_b1` | small (Küçük) | Zehir hasarı | 178 | 489 | `rg_start` `rg_b2` | +%8 zehir hasarı | `{ poisonDamagePct: 0.08 }` | — |
| `rg_b2` | small (Küçük) | Mermi hasarı | 205 | 564 | `rg_b1` `n_marksman` `br_s1` | +%8 mermi hasarı | `{ projectileDamagePct: 0.08 }` | — |
| `n_marksman` | notable (Önemli) | Keskin Nişancı | 236 | 648 | `rg_b2` `rg_b3` | +%25 mermi hasarı; +1 delme; +%20 mermi hızı | `{ projectileDamagePct: 0.25, pierce: 1, projectileSpeedPct: 0.2 }` | — |
| `rg_b3` | small (Küçük) | Zamanla hasar | 267 | 733 | `n_marksman` `rg_b4` `rg_c2` | +%10 zamanla hasar | `{ dotPct: 0.1 }` | — |
| `rg_b4` | small (Küçük) | Zehir hasarı | 294 | 808 | `rg_b3` `n_toxicologist` | +%8 zehir hasarı | `{ poisonDamagePct: 0.08 }` | — |
| `n_toxicologist` | notable (Önemli) | Zehir Ustası | 325 | 893 | `rg_b4` | +%40 zehir hasarı; maks. Zehir yığını +5; Zehir süresi +%25 | `{ poisonDamagePct: 0.4 }` | `n_toxicologist` `{ poisonMaxStacks: 5, poisonDurationPct: 0.25 }` |
| `rg_c1` | small (Küçük) | Saldırı hızı | 658 | 419 | `rg_a3` `rg_m3` | +%4 saldırı hızı | `{ attackSpeed: 0.04 }` | — |
| `rg_c2` | small (Küçük) | Maks. can | 419 | 658 | `rg_m3` `rg_b3` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `bb_start` | start (Başlangıç) | Barbar Başlangıcı | -297 | 297 | `bb_p1` `bb_a1` `bb_m1` `bb_b1` | Barbar için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Güç | — | classStart: `barbarian`; foreign `{ str: 10 }` |
| `bb_p1` | small (Küçük) | Güç | -212 | 212 | `bb_start` `bb_p2` | +10 Güç | `{ str: 10 }` | — |
| `bb_p2` | small (Küçük) | Dayanıklılık | -134 | 134 | `bb_p1` `bb_hub` | +10 Dayanıklılık | `{ vit: 10 }` | — |
| `bb_hub` | small (Küçük) | Tüm Özellikler | -64 | 64 | `bb_p2` `core` `rg_hub` `kn_hub` | +5 Tüm Özellikler | `{ allAttr: 5 }` | — |
| `bb_a1` | small (Küçük) | Fiziksel hasar | -178 | 489 | `bb_start` `bb_a2` | +%8 fiziksel hasar | `{ physicalDamagePct: 0.08 }` | — |
| `bb_a2` | small (Küçük) | Kanama şansı | -205 | 564 | `bb_a1` `n_bloodletter` `br_s6` | +%5 kanama şansı | `{ bleedChance: 0.05 }` | — |
| `n_bloodletter` | notable (Önemli) | Kan Döken | -236 | 648 | `bb_a2` `bb_a3` | +%40 kanama hasarı; +%15 kanama şansı | `{ bleedDamagePct: 0.4, bleedChance: 0.15 }` | — |
| `bb_a3` | small (Küçük) | Zamanla hasar | -267 | 733 | `n_bloodletter` `bb_a4` `bb_c1` | +%10 zamanla hasar | `{ dotPct: 0.1 }` | — |
| `bb_a4` | small (Küçük) | Can çalma | -294 | 808 | `bb_a3` `ks_blood_sacrifice` | +%0.4 can çalma | `{ lifeSteal: 0.004 }` | — |
| `ks_blood_sacrifice` | keystone (Kilit Taşı) | Kan Kurban | -325 | 893 | `bb_a4` | Can çalma ×2; can çalma üst sınırı saniyede maks. canın %20'si. Doğal can yenilenmesi yok (savaş dışı dahil). İksirler %50 daha az iyileştirir. | — | `ks_blood_sacrifice` `{ lifeStealMult: 2, lifeStealCapPct: 0.2, noHpRegen: 1, potionMult: 0.5 }` |
| `bb_m1` | small (Küçük) | Kaynak üretimi | -368 | 368 | `bb_start` `bb_m2` | +%10 kaynak üretimi | `{ resourceGainPct: 0.1 }` | — |
| `bb_m2` | small (Küçük) | Saldırı hızı | -424 | 424 | `bb_m1` `n_rage_engine` | +%4 saldırı hızı | `{ attackSpeed: 0.04 }` | — |
| `n_rage_engine` | notable (Önemli) | Öfke Makinesi | -488 | 488 | `bb_m2` `bb_m3` | +%25 kaynak üretimi; Öfke kazandıktan sonra 8 sn boyunca Öfke azalmaz; +10 maks. Öfke | `{ resourceGainPct: 0.25, maxResource: 10 }` | `n_rage_engine` `{ rageDecayDelay: 8 }` |
| `bb_m3` | small (Küçük) | Yakın dövüş hasarı | -552 | 552 | `n_rage_engine` `bb_m4` `bb_c1` `bb_c2` | +%8 yakın dövüş hasarı | `{ meleeDamagePct: 0.08 }` | — |
| `bb_m4` | small (Küçük) | Saldırı hızı | -608 | 608 | `bb_m3` `ks_berserker_soul` | +%4 saldırı hızı | `{ attackSpeed: 0.04 }` | — |
| `ks_berserker_soul` | keystone (Kilit Taşı) | Çılgın Ruh | -672 | 672 | `bb_m4` | Eksik canın her %1'i için %1 DAHA FAZLA hasar (en fazla %60). Alınan iyileştirme −%30. | `{ healReceivedPct: -0.3 }` | `ks_berserker_soul` `{ moreDamagePerMissingHpPct: 1, maxMoreDamage: 0.6 }` |
| `bb_b1` | small (Küçük) | Maks. can | -489 | 178 | `bb_start` `bb_b2` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `bb_b2` | small (Küçük) | Sarsma | -564 | 205 | `bb_b1` `n_thick_skin` `br_w1` | +%10 sarsma | `{ staggerPct: 0.1 }` | — |
| `n_thick_skin` | notable (Önemli) | Kalın Deri | -648 | 236 | `bb_b2` `bb_b3` | +%20 maks. can; saniyede maks. canın %1'i kadar yenilenme; +%10 alınan iyileştirme | `{ maxHpPct: 0.2, hpRegenPct: 0.01, healReceivedPct: 0.1 }` | — |
| `bb_b3` | small (Küçük) | Alan genişliği | -733 | 267 | `n_thick_skin` `bb_b4` `bb_c2` | +%8 alan genişliği | `{ aoeRadiusPct: 0.08 }` | — |
| `bb_b4` | small (Küçük) | Maks. can | -808 | 294 | `bb_b3` `n_executioner` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `n_executioner` | notable (Önemli) | Cellat | -893 | 325 | `bb_b4` | Canı %35'in altındaki düşmanlara +%40 hasar; öldürme başına maks. canın %2'si | `{ executeDamagePct: 0.4, hpOnKillPct: 0.02 }` | — |
| `bb_c1` | small (Küçük) | Can çalma | -419 | 658 | `bb_a3` `bb_m3` | +%0.4 can çalma | `{ lifeSteal: 0.004 }` | — |
| `bb_c2` | small (Küçük) | Güç | -658 | 419 | `bb_m3` `bb_b3` | +10 Güç | `{ str: 10 }` | — |
| `kn_start` | start (Başlangıç) | Şövalye Başlangıcı | -297 | -297 | `kn_p1` `kn_a1` `kn_m1` `kn_b1` | Şövalye için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Güç | — | classStart: `knight`; foreign `{ str: 10 }` |
| `kn_p1` | small (Küçük) | Güç | -212 | -212 | `kn_start` `kn_p2` | +10 Güç | `{ str: 10 }` | — |
| `kn_p2` | small (Küçük) | Dayanıklılık | -134 | -134 | `kn_p1` `kn_hub` | +10 Dayanıklılık | `{ vit: 10 }` | — |
| `kn_hub` | small (Küçük) | Tüm Özellikler | -64 | -64 | `kn_p2` `core` `bb_hub` `mg_hub` | +5 Tüm Özellikler | `{ allAttr: 5 }` | — |
| `kn_a1` | small (Küçük) | Yakın dövüş hasarı | -489 | -178 | `kn_start` `kn_a2` | +%8 yakın dövüş hasarı | `{ meleeDamagePct: 0.08 }` | — |
| `kn_a2` | small (Küçük) | Saldırı hızı | -564 | -205 | `kn_a1` `n_oath_blade` `br_w6` | +%4 saldırı hızı | `{ attackSpeed: 0.04 }` | — |
| `n_oath_blade` | notable (Önemli) | Kılıç Yemini | -648 | -236 | `kn_a2` `kn_a3` | +%20 yakın dövüş hasarı; kılıçla +%10 saldırı hızı; +%4 kritik şansı | `{ meleeDamagePct: 0.2, critChance: 0.04 }` | `n_oath_blade` `{ attackSpeedWithSword1h: 0.1 }` |
| `kn_a3` | small (Küçük) | Kritik şansı | -733 | -267 | `n_oath_blade` `kn_a4` `kn_c1` | +%1 kritik şansı | `{ critChance: 0.01 }` | — |
| `kn_a4` | small (Küçük) | Yakın dövüş hasarı | -808 | -294 | `kn_a3` `ks_steady_hand` | +%8 yakın dövüş hasarı | `{ meleeDamagePct: 0.08 }` | — |
| `ks_steady_hand` | keystone (Kilit Taşı) | Sabit El | -893 | -325 | `kn_a4` | Kritik vuruş yapamazsın. %30 DAHA FAZLA hasar. +%50 sarsma. | `{ staggerPct: 0.5 }` | `ks_steady_hand` `{ noCrit: 1, moreDamage: 1.3 }` |
| `kn_m1` | small (Küçük) | Zırh | -368 | -368 | `kn_start` `kn_m2` | +%12 zırh | `{ armorPct: 0.12 }` | — |
| `kn_m2` | small (Küçük) | Blok şansı | -424 | -424 | `kn_m1` `n_bulwark` | +%2 blok şansı | `{ blockChance: 0.02 }` | — |
| `n_bulwark` | notable (Önemli) | Siper | -488 | -488 | `kn_m2` `kn_m3` | +%25 zırh; +%8 blok şansı; blok edilen vuruşlardan ek %10 azaltma | `{ armorPct: 0.25, blockChance: 0.08, blockAmount: 0.1 }` | — |
| `kn_m3` | small (Küçük) | Maks. can | -552 | -552 | `n_bulwark` `kn_m4` `kn_c1` `kn_c2` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `kn_m4` | small (Küçük) | Zırh | -608 | -608 | `kn_m3` `ks_iron_fortress` | +%12 zırh | `{ armorPct: 0.12 }` | — |
| `ks_iron_fortress` | keystone (Kilit Taşı) | Demir Kale | -672 | -672 | `kn_m4` | Blok şansın ×2, blok üst sınırı %75. Kaçınma şansın 0 olur. Her blok maks. canın %2'sini iyileştirir (0.5 sn ICD). −%10 hareket hızı. | `{ moveSpeedPct: -0.1 }` | `ks_iron_fortress` `{ blockChanceMult: 2, blockCap: 0.75, dodgeZero: 1, healOnBlockPct: 0.02, healOnBlockIcd: 0.5 }` |
| `kn_b1` | small (Küçük) | Kutsal hasar | -178 | -489 | `kn_start` `kn_b2` | +%8 kutsal hasar | `{ holyDamagePct: 0.08 }` | — |
| `kn_b2` | small (Küçük) | Kaynak yenilenmesi | -205 | -564 | `kn_b1` `n_unshaken_will` `br_n1` | +%10 kaynak yenilenmesi | `{ resourceRegenPct: 0.1 }` | — |
| `n_unshaken_will` | notable (Önemli) | Sarsılmaz İrade | -236 | -648 | `kn_b2` `kn_b3` | +%25 kaynak yenilenmesi; üzerindeki kontrol etkileri −%30 süre; +10 maks. Kararlılık | `{ resourceRegenPct: 0.25, ccReductionPct: 0.3, maxResource: 10 }` | — |
| `kn_b3` | small (Küçük) | Alan genişliği | -267 | -733 | `n_unshaken_will` `kn_b4` `kn_c2` | +%8 alan genişliği | `{ aoeRadiusPct: 0.08 }` | — |
| `kn_b4` | small (Küçük) | Kutsal hasar | -294 | -808 | `kn_b3` `n_holy_light` | +%8 kutsal hasar | `{ holyDamagePct: 0.08 }` | — |
| `n_holy_light` | notable (Önemli) | Kutsal Işık | -325 | -893 | `kn_b4` | +%25 kutsal hasar; Kutsal Toprak yarıçapı +%20 ve içindeki müttefikler +%10 hasar verir | `{ holyDamagePct: 0.25 }` | `n_holy_light` `{ consecrationRadiusPct: 0.2, consecrationAllyDamagePct: 0.1 }` |
| `kn_c1` | small (Küçük) | Güç | -658 | -419 | `kn_a3` `kn_m3` | +10 Güç | `{ str: 10 }` | — |
| `kn_c2` | small (Küçük) | Tüm dirençler | -419 | -658 | `kn_m3` `kn_b3` | +%5 tüm dirençler | `{ resAll: 0.05 }` | — |
| `br_e1` | small (Küçük) | Zeka | 618 | -166 | `mg_b2` `br_e2` | +10 Zeka | `{ int: 10 }` | — |
| `br_e2` | small (Küçük) | Büyü hızı | 630 | -111 | `br_e1` `br_e3` | +%4 büyü hızı | `{ castSpeed: 0.04 }` | — |
| `br_e3` | small (Küçük) | Mermi hasarı | 638 | -56 | `br_e2` `n_arcane_trickster` | +%8 mermi hasarı | `{ projectileDamagePct: 0.08 }` | — |
| `n_arcane_trickster` | notable (Önemli) | Gizemli Hilekâr | 640 | 0 | `br_e3` `br_e4` | +%10 saldırı ve büyü hızı; +%15 mermi hızı; mermiler +1 delme | `{ attackSpeed: 0.1, castSpeed: 0.1, projectileSpeedPct: 0.15, pierce: 1 }` | — |
| `br_e4` | small (Küçük) | Kritik hasarı | 638 | 56 | `n_arcane_trickster` `br_e5` | +%12 kritik hasarı | `{ critDamage: 0.12 }` | — |
| `br_e5` | small (Küçük) | Saldırı hızı | 630 | 111 | `br_e4` `br_e6` | +%4 saldırı hızı | `{ attackSpeed: 0.04 }` | — |
| `br_e6` | small (Küçük) | Çeviklik | 618 | 166 | `br_e5` `rg_a2` | +10 Çeviklik | `{ dex: 10 }` | — |
| `br_s1` | small (Küçük) | Çeviklik | 166 | 618 | `rg_b2` `br_s2` | +10 Çeviklik | `{ dex: 10 }` | — |
| `br_s2` | small (Küçük) | Zehir hasarı | 111 | 630 | `br_s1` `br_s3` | +%8 zehir hasarı | `{ poisonDamagePct: 0.08 }` | — |
| `br_s3` | small (Küçük) | Hareket hızı | 56 | 638 | `br_s2` `n_hunter_instinct` | +%3 hareket hızı | `{ moveSpeedPct: 0.03 }` | — |
| `n_hunter_instinct` | notable (Önemli) | Avcı İçgüdüsü | 0 | 640 | `br_s3` `br_s4` | Kanayan veya zehirlenmiş düşmanlara +%20 hasar; +%5 hareket hızı | `{ ailingDamagePct: 0.2, moveSpeedPct: 0.05 }` | — |
| `br_s4` | small (Küçük) | Kanama şansı | -56 | 638 | `n_hunter_instinct` `br_s5` | +%5 kanama şansı | `{ bleedChance: 0.05 }` | — |
| `br_s5` | small (Küçük) | Fiziksel hasar | -111 | 630 | `br_s4` `br_s6` | +%8 fiziksel hasar | `{ physicalDamagePct: 0.08 }` | — |
| `br_s6` | small (Küçük) | Güç | -166 | 618 | `br_s5` `bb_a2` | +10 Güç | `{ str: 10 }` | — |
| `br_w1` | small (Küçük) | Dayanıklılık | -618 | 166 | `bb_b2` `br_w2` | +10 Dayanıklılık | `{ vit: 10 }` | — |
| `br_w2` | small (Küçük) | Sarsma | -630 | 111 | `br_w1` `br_w3` | +%10 sarsma | `{ staggerPct: 0.1 }` | — |
| `br_w3` | small (Küçük) | Maks. can | -638 | 56 | `br_w2` `n_warlord` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `n_warlord` | notable (Önemli) | Savaş Lordu | -640 | 0 | `br_w3` `br_w4` | +%15 maks. can; +%15 sarsma; +%10 alan genişliği | `{ maxHpPct: 0.15, staggerPct: 0.15, aoeRadiusPct: 0.1 }` | — |
| `br_w4` | small (Küçük) | Zırh | -638 | -56 | `n_warlord` `br_w5` | +%12 zırh | `{ armorPct: 0.12 }` | — |
| `br_w5` | small (Küçük) | Yakın dövüş hasarı | -630 | -111 | `br_w4` `br_w6` | +%8 yakın dövüş hasarı | `{ meleeDamagePct: 0.08 }` | — |
| `br_w6` | small (Küçük) | Güç | -618 | -166 | `br_w5` `kn_a2` | +10 Güç | `{ str: 10 }` | — |
| `br_n1` | small (Küçük) | Güç | -166 | -618 | `kn_b2` `br_n2` | +10 Güç | `{ str: 10 }` | — |
| `br_n2` | small (Küçük) | Ateş hasarı | -111 | -630 | `br_n1` `br_n3` | +%8 ateş hasarı | `{ fireDamagePct: 0.08 }` | — |
| `br_n3` | small (Küçük) | Maks. can | -56 | -638 | `br_n2` `n_spellblade` | +%5 maks. can | `{ maxHpPct: 0.05 }` | — |
| `n_spellblade` | notable (Önemli) | Büyülü Kılıç | 0 | -640 | `br_n3` `br_n4` | +%12 hasar; yakın dövüş fiziksel hasarının %10'u kadar ek ateş hasarı; +10 Güç ve +10 Zeka | `{ damagePct: 0.12, str: 10, int: 10 }` | `n_spellblade` `{ meleePhysAsExtraFire: 0.1 }` |
| `br_n4` | small (Küçük) | Zeka | 56 | -638 | `n_spellblade` `br_n5` | +10 Zeka | `{ int: 10 }` | — |
| `br_n5` | small (Küçük) | Gizem hasarı | 111 | -630 | `br_n4` `br_n6` | +%8 gizem hasarı | `{ arcaneDamagePct: 0.08 }` | — |
| `br_n6` | small (Küçük) | Bekleme süresi azaltma | 166 | -618 | `br_n5` `mg_a2` | +%3 bekleme süresi azaltma | `{ cdr: 0.03 }` | — |

---

## 4. Items

### 4.1 Equipment slots

| `EquipSlot` | TR | Count | Accepts `ItemCategory` / notes |
|---|---|---:|---|
| `helm` | Kask | 1 | `helm`; toggles the class helmet node |
| `shoulders` | Omuzluk | 1 | `shoulders` |
| `chest` | Zırh | 1 | `chest` |
| `gloves` | Eldiven | 1 | `gloves` |
| `legs` | Pantolon | 1 | `legs` |
| `boots` | Çizme | 1 | `boots`; only slot with `suf_move_speed` |
| `belt` | Kemer | 1 | `belt`; only slot with `suf_potion` |
| `amulet` | Kolye | 1 | `amulet` |
| `ring1`, `ring2` | Yüzük | 2 | `ring` |
| `weapon` | Silah | 1 | `sword1h`, `axe2h`, `staff`, `wand`, `dagger`; 2H (`twoHanded`) locks `offhand` |
| `offhand` | Yan El | 1 | `shield`, `tome`, `dagger` (Haydut only) |

**Class restrictions**

| Class | weapon | offhand | Armour weight (helm…boots) |
|---|---|---|---|
| Şövalye | `sword1h` | `shield` | `heavy` (Ağır) |
| Barbar | `axe2h` | — | `heavy` |
| Büyücü | `staff` (2H) or `wand` | `tome` (with wand) | `light` (Hafif) |
| Haydut | `dagger` | `dagger` (dual wield) | `medium` (Orta) |

Belts, amulets, rings are universal. Visuals: KayKit characters cannot swap armour meshes, so armour tier is shown as a material tint on the class texture (T1 none, T2 steel-blue `#8fa9c8`, T3 gold trim `#d9b45a`, T4 dark red `#9c2f2f`, T5 ancient teal emissive `#3fe0c8`) and the helmet node toggles with the helm slot. Weapon/offhand bases map to KayKit nodes (below) and get upgrade glows (§5.3).

### 4.2 Rarities

| Rarity id | TR | Colour | Affixes (prefix/suffix max) | Implicit | Sockets (roll) | Max upgrade | Efsun | Beam |
|---|---|---|---|---|---|---|---|---|
| `poor` | Sıradan | gri `#9d9d9d` | 0 | ×0.75 | 0 | — (cannot upgrade) | no | none |
| `common` | Normal | beyaz `#ffffff` | 0 | ×1.0 | 0–1 (25%) | +9 | Takviye only | none |
| `uncommon` | Büyülü | yeşil `#1eff00` | 1–2 (1/1) | ×1.0 | 0–1 (30%) | +9 | yes | ground glint |
| `rare` | Nadir | mavi `#0070dd` | 3–4 (2/2) | ×1.0 | 0–2 (40% / 15%) | +12 | yes | blue 3 m |
| `epic` | Destansı | mor `#a335ee` | 5 (3/3), tier floor = best eligible − 2 | ×1.10 | 1–2 (30% for 2) | +15 | yes | purple 5 m |
| `legendary` | Efsanevi | turuncu `#ff8000` | unique effect + 3 fixed lines + 1 random | ×1.10 | 1 | +15 | random line only | orange 8 m |
| `set` | Set | altın-yeşil `#b8e04a` | set bonus + 4 fixed lines | ×1.10 | 1 | +15 | no | gold-green 8 m |

Rarity ids are the existing `Rarity` union of `src/types/common.ts` (`poor | common | uncommon | rare | epic | legendary | set`). Display names follow the design brief: **poor = Sıradan (gri), common = Normal (beyaz), uncommon = Büyülü (yeşil)**. Note for the core owner: `RARITY_NAMES_TR` currently says poor "Değersiz" / common "Sıradan" and `RARITY_COLORS.set` is `#00d5a0`; the brief asks for Sıradan/Normal and an altın-yeşil set colour (`#b8e04a` proposed).

Max sockets per slot: 2H weapon 3, 1H weapon 2, chest/helm/legs 2, others 1 (jewelry 1).

### 4.3 Item level (ilvl) & required level

| Source | ilvl |
|---|---|
| Open world / normal dungeon | monster level (+0 Sıradan/Sürü, +1 Seçkin, +2 Ara Patron, +3 Patron), cap 60 |
| Mythic+ trash/elite drops | 60 + key (cap 75) |
| Mythic+ boss drops | 60 + key + 2 (cap 77) |
| Mythic+ end chest | 60 + 2 × min(key, 15) (cap 90), depleted −4 |
| Weekly vault (Kadim Kasa) | 63 + 2 × min(key, 15) (cap 93) |
| Vendor / daily chest | player level (daily chest at 60: 64) |

`requiredLevel = clamp(ilvl − 2, 1, 60)`. Base type pick: uniformly among bases of the slot whose `minIlvl ≤ ilvl`, with the highest eligible tier weighted ×3.

### 4.4 Base types

**Scaling formulas**

```
weaponAvg(ilvl) = (4 + 2.5*ilvl) * typeMult ; wMin = round(0.8*avg) ; wMax = round(1.2*avg)   (±5% quality roll on both)
armorItem(ilvl) = round((10 + 4.2*ilvl) * slotMult * weightMult * U(0.95,1.05))
slotMult  : helm 1.0, shoulders 0.9, chest 1.4, gloves 0.7, legs 1.2, boots 0.8, shield 1.5
weightMult: heavy 1.0, medium 0.6, light 0.35   (shield = heavy)
```

| ilvl | Silah ort. (×1.0 tip) | Tek El Kılıç min–maks | Çift El Balta min–maks (×1.55) | Asa (×1.45) | Hançer (×0.85) | Ağır Zırh (göğüs, ×1.4) | Orta Zırh (göğüs) | Hafif Zırh (göğüs) | Kalkan zırhı (×1.5) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 6.5 | 5–8 | 8–12 | 8–11 | 4–7 | 20 | 12 | 7 | 21 |
| 5 | 16.5 | 13–20 | 20–31 | 19–29 | 11–17 | 43 | 26 | 15 | 47 |
| 10 | 29.0 | 23–35 | 36–54 | 34–50 | 20–30 | 73 | 44 | 25 | 78 |
| 15 | 41.5 | 33–50 | 51–77 | 48–72 | 28–42 | 102 | 61 | 36 | 110 |
| 20 | 54.0 | 43–65 | 67–100 | 63–94 | 37–55 | 132 | 79 | 46 | 141 |
| 30 | 79.0 | 63–95 | 98–147 | 92–137 | 54–81 | 190 | 114 | 67 | 204 |
| 40 | 104.0 | 83–125 | 129–193 | 121–181 | 71–106 | 249 | 150 | 87 | 267 |
| 50 | 129.0 | 103–155 | 160–240 | 150–224 | 88–132 | 308 | 185 | 108 | 330 |
| 60 | 154.0 | 123–185 | 191–286 | 179–268 | 105–157 | 367 | 220 | 128 | 393 |
| 70 | 179.0 | 143–215 | 222–333 | 208–311 | 122–183 | 426 | 255 | 149 | 456 |
| 80 | 204.0 | 163–245 | 253–379 | 237–355 | 139–208 | 484 | 291 | 170 | 519 |
| 90 | 229.0 | 183–275 | 284–426 | 266–398 | 156–234 | 543 | 326 | 190 | 582 |

**Weapons & off-gloves** (tiers T1–T5 have `minIlvl` 1 / 15 / 30 / 45 / 70; T5 "Kadim" drops only in Mythic+)

| Type id | TR type | Hands | APS | typeMult | T1 | T2 | T3 | T4 | T5 | Implicit by tier (T1→T5) | KayKit node |
|---|---|---|---:|---:|---|---|---|---|---|---|---|
| `sword1h` | Tek El Kılıç | 1H | 1.4 | 1.00 | Kısa Kılıç | Pala | Şövalye Kılıcı | Ejder Kılıcı | Kadim Kılıç | `critChance` +1/1.5/2/2.5/3 | Knight `1H_Sword` |
| `shield` | Kalkan | off | — | — | Yuvarlak Kalkan | Armalı Kalkan | Kule Kalkanı | Dikenli Kalkan | Kadim Kalkan | armour (slotMult 1.5) + block 12/14/16/18/20% | `Round_Shield` / `Badge_Shield` / `Rectangle_Shield` / `Spike_Shield` / `Badge_Shield`+teal |
| `axe2h` | Çift El Balta | 2H | 1.0 | 1.55 | Odun Baltası | Savaş Baltası | Çift Ağızlı Balta | Cellat Baltası | Kadim Balta | `critDamage` +10/15/20/25/30 | Barbarian `2H_Axe` |
| `staff` | Asa | 2H | 1.1 | 1.45 | Meşe Asa | Kemik Asa | Kristal Asa | Ejder Asası | Kadim Asa | `resourceRegenPct` +10/15/20/25/30 | Mage `2H_Staff` |
| `wand` | Değnek | 1H | 1.4 | 1.00 | Söğüt Değnek | Kemik Değnek | Kristal Değnek | Yıldız Değneği | Kadim Değnek | `castSpeed` +4/6/8/10/12 | Mage `1H_Wand` |
| `tome` | Büyü Kitabı | off | — | — | Eski Defter | Büyü Kitabı | Mühürlü Kitap | Kara Kitap | Kadim Kitap | `damagePct` +6/9/12/15/18 and `maxResource` +5/8/10/12/15 | Mage `Spellbook` |
| `dagger` | Hançer | 1H | 1.7 | 0.85 | Hançer | Kama | Gölge Hançeri | Yılan Dişi | Kadim Hançer | `critChance` +2/2.5/3/3.5/4 | Rogue `Knife` |

Base ids: `<category>_t<n>` (e.g. `sword1h_t3`), `ItemBaseDef.category` = the type id above, `itemLevelRange = [minIlvl, next tier minIlvl − 1]` (T5: [70, 95]). **Haydut dual wield:** a `dagger` may also be equipped in `offhand` (Haydut only; shown on `Knife_Offhand`); there it adds 25% of its rolled average damage to the main-hand W and its implicit applies normally. Categories `sword2h`, `axe1h`, `mace`, `crossbow`, `bow`, `quiver` are reserved (not dropped in v1); the Haydut crossbows are visual class tools.

**Armour** (base id `<slot>_<weight>_t<n>`, e.g. `helm_heavy_t2`; tiers as above; `classes` = Şövalye+Barbar for heavy, Haydut for medium, Büyücü for light)

| Weight / slot | T1 (1) | T2 (15) | T3 (30) | T4 (45) | T5 (70, M+) |
|---|---|---|---|---|---|
| Ağır / helm | Demir Miğfer | Çelik Miğfer | Muhafız Miğferi | Ejder Miğferi | Kadim Miğfer |
| Ağır / shoulders | Demir Omuzluk | Çelik Omuzluk | Muhafız Omuzluğu | Ejder Omuzluğu | Kadim Omuzluk |
| Ağır / chest | Demir Zırh | Çelik Zırh | Muhafız Zırhı | Ejder Zırhı | Kadim Zırh |
| Ağır / gloves | Demir Eldiven | Çelik Eldiven | Muhafız Eldiveni | Ejder Eldiveni | Kadim Eldiven |
| Ağır / legs | Demir Bacaklık | Çelik Bacaklık | Muhafız Bacaklığı | Ejder Bacaklığı | Kadim Bacaklık |
| Ağır / boots | Demir Çizme | Çelik Çizme | Muhafız Çizmesi | Ejder Çizmesi | Kadim Çizme |
| Orta / helm | Deri Başlık | Pullu Başlık | Avcı Başlığı | Gölge Başlığı | Kadim Başlık |
| Orta / shoulders | Deri Omuzluk | Pullu Omuzluk | Avcı Omuzluğu | Gölge Omuzluğu | Kadim Omuzluk |
| Orta / chest | Deri Yelek | Pullu Yelek | Avcı Yeleği | Gölge Yeleği | Kadim Yelek |
| Orta / gloves | Deri Eldiven | Pullu Eldiven | Avcı Eldiveni | Gölge Eldiveni | Kadim Eldiven |
| Orta / legs | Deri Pantolon | Pullu Pantolon | Avcı Pantolonu | Gölge Pantolonu | Kadim Pantolon |
| Orta / boots | Deri Bot | Pullu Bot | Avcı Botu | Gölge Botu | Kadim Bot |
| Hafif / helm | Keten Şapka | İpek Şapka | Tılsımlı Şapka | Yıldız Şapkası | Kadim Şapka |
| Hafif / shoulders | Keten Şal | İpek Şal | Tılsımlı Şal | Yıldız Şalı | Kadim Şal |
| Hafif / chest | Keten Cübbe | İpek Cübbe | Tılsımlı Cübbe | Yıldız Cübbesi | Kadim Cübbe |
| Hafif / gloves | Keten Eldiven | İpek Eldiven | Tılsımlı Eldiven | Yıldız Eldiveni | Kadim Eldiven |
| Hafif / legs | Keten Şalvar | İpek Şalvar | Tılsımlı Şalvar | Yıldız Şalvarı | Kadim Şalvar |
| Hafif / boots | Keten Sandalet | İpek Sandalet | Tılsımlı Sandalet | Yıldız Sandaleti | Kadim Sandalet |

**Jewelry & belts** (implicit values use `round`)

| Base id | TR | Slot | minIlvl | Implicit |
|---|---|---|---:|---|
| `ring_iron` | Demir Yüzük | ring | 1 | `maxHp` 5 + 2×ilvl |
| `ring_silver` | Gümüş Yüzük | ring | 10 | `resAll` 3 + ilvl/10 |
| `ring_gold` | Altın Yüzük | ring | 20 | `critChance` 1 + ilvl/40 |
| `ring_jade` | Yeşim Yüzük | ring | 30 | `resourceRegenPct` 5 + ilvl/6 |
| `amulet_bone` | Kemik Kolye | amulet | 1 | `str` 2 + ilvl/3 |
| `amulet_onyx` | Oniks Kolye | amulet | 1 | `dex` 2 + ilvl/3 |
| `amulet_lapis` | Lapis Kolye | amulet | 1 | `int` 2 + ilvl/3 |
| `amulet_amber` | Kehribar Kolye | amulet | 10 | `vit` 2 + ilvl/3 |
| `amulet_ancient` | Kadim Kolye | amulet | 50 | `allAttr` 2 + ilvl/6 |
| `belt_leather` | Deri Kemer | belt | 1 | `maxHp` 5 + 2×ilvl |
| `belt_chain` | Zincir Kemer | belt | 15 | `armor` 5 + 3×ilvl |
| `belt_heavy` | Ağır Kemer | belt | 30 | `str` and `vit` 1 + ilvl/6 each |
| `belt_sash` | İpek Kuşak | belt | 30 | `potionPct` 10 + ilvl/6 |

### 4.5 Affix rules

* Affix count by rarity per §4.2; each affix id at most once per item; prefix/suffix limits respected.
* **Tier gates** (ilvl): T5 = 1, T4 = 12, T3 = 24, T2 = 36, T1 = 50, T0 = 72 (Mythic+ only, "Kadim" tier).
* **Tier weights** among eligible tiers: T0 5, T1 15, T2 30, T3 50, T4 75, T5 100. Epic: only the best 3 eligible tiers.
* Affix pick: weighted by the affix `weight`, filtered by slot (and by class-usefulness ×2 weight for the owner's class main stat / damage types — "smart affixes", 50% of rolls).
* Value: uniform inside the tier range; integers except crit chance, life steal, dodge (1 decimal).
* "(yerel)" = local: modifies only the item it is on (weapon damage/APS, armour value).
* Weapon-local flat added damage on 2H weapons ×1.5.
* **Naming**: Büyülü = `"{prefixTr} {baseTr}"` and/or `" ({suffixTr})"` → *Alevli Pala (Ayının)*. Nadir/Destansı = random two-word name (§4.8) + base on the second tooltip line. Efsanevi/Set = fixed names.

Slot shorthand used below (→ `AffixDef.categories`): **AR** = `helm, shoulders, chest, gloves, legs, boots`; **J** = `amulet, ring`; **W** = weapon categories `sword1h, axe2h, staff, wand, dagger`; **O** = `shield, tome` (an off-hand dagger rolls from the W pool); **Sh** = `shield` only; single words = that category.

### 4.6 Prefix pool (Ön Ekler)

| id | TR name | Stat | Slots | Weight | T5 (1) | T4 (12) | T3 (24) | T2 (36) | T1 (50) | T0 (72) |
|---|---|---|---|---:|---|---|---|---|---|---|
| `pre_wpn_dmg_pct` | Keskin | `wpnDamagePctLocal` (yerel) | W | 100 | 10–19 | 20–34 | 35–54 | 55–79 | 80–109 | 110–139 |
| `pre_wpn_add_flat` | Ağır | `wpnAddFlatLocal` (yerel, added to both weapon min and max) | W | 100 | 1–3 | 4–7 | 8–14 | 15–26 | 27–40 | 41–58 |
| `pre_dmg_pct` | Kudretli | `damagePct` | J, gloves, W, O | 80 | 3–4 | 5–6 | 7–9 | 10–12 | 13–15 | 16–19 |
| `pre_dmg_phys_pct` | Vahşi | `physicalDamagePct` | J, gloves, W | 80 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_fire_pct` | Alevli | `fireDamagePct` | J, gloves, W, O | 80 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_frost_pct` | Buzul | `frostDamagePct` | J, gloves, W, O | 80 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_arcane_pct` | Gizemli | `arcaneDamagePct` | J, gloves, W, O | 80 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_poison_pct` | Zehirli | `poisonDamagePct` | J, gloves, W, O | 80 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_melee_pct` | Yırtıcı | `meleeDamagePct` | J, gloves, shoulders, W | 60 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_projectile_pct` | Delici | `projectileDamagePct` | J, gloves, shoulders, W | 60 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_aoe_pct` | Yıkıcı | `aoePct` | amulet, gloves, shoulders, W | 60 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–42 |
| `pre_dmg_dot_pct` | Çürütücü | `dotPct` | J, gloves, W | 50 | 6–10 | 11–16 | 17–23 | 24–31 | 32–40 | 41–50 |
| `pre_dmg_vs_elite_pct` | Avcı | `eliteDamagePct` | J, W, O | 40 | 4–6 | 7–9 | 10–12 | 13–15 | 16–18 | 19–22 |
| `pre_hp_flat` | Sağlam | `maxHp` | AR, belt, J, O | 120 | 10–20 | 25–45 | 50–90 | 95–150 | 155–220 | 225–300 |
| `pre_hp_pct` | Canlı | `maxHpPct` | chest, belt, amulet, Sh | 50 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 | 13–15 |
| `pre_armor_flat` | Zırhlı | `armor` | AR, belt, Sh | 100 | 8–15 | 20–40 | 45–80 | 85–130 | 135–190 | 195–260 |
| `pre_armor_local_pct` | Takviyeli | `armorPctLocal` (yerel) | AR, Sh | 100 | 10–19 | 20–34 | 35–54 | 55–74 | 75–94 | 95–120 |
| `pre_life_steal` | Vampirik | `lifeSteal` | W, J | 30 | — | 0.4–0.6 | 0.7–1.0 | 1.1–1.5 | 1.6–2.0 | 2.1–2.5 |
| `pre_res_max_flat` | Coşkun | `maxResource` | helm, chest, amulet, O | 50 | 3–4 | 5–6 | 7–9 | 10–12 | 13–15 | 16–20 |
| `pre_block` | Koruyucu | `blockChance` | Sh | 60 | 2 | 3 | 4 | 5–6 | 7–8 | 9–10 |
| `pre_thorns` | Dikenli | `thorns` | chest, shoulders, Sh | 40 | 2–4 | 5–10 | 12–25 | 28–50 | 55–90 | 95–140 |
| `pre_armor_pen` | Parçalayıcı | `armorPen` | W, gloves | 30 | — | — | 5–7 | 8–10 | 11–14 | 15–18 |
| `pre_res_pen` | Delen | `resPen` | W, gloves, amulet | 30 | — | — | 3–4 | 5–6 | 7–8 | 9–10 |

### 4.7 Suffix pool (Son Ekler)

| id | TR name | Stat | Slots | Weight | T5 (1) | T4 (12) | T3 (24) | T2 (36) | T1 (50) | T0 (72) |
|---|---|---|---|---:|---|---|---|---|---|---|
| `suf_str` | Ayının | `str` | all | 100 | 3–6 | 7–12 | 13–20 | 21–30 | 31–42 | 43–55 |
| `suf_dex` | Vaşağın | `dex` | all | 100 | 3–6 | 7–12 | 13–20 | 21–30 | 31–42 | 43–55 |
| `suf_int` | Baykuşun | `int` | all | 100 | 3–6 | 7–12 | 13–20 | 21–30 | 31–42 | 43–55 |
| `suf_vit` | Kaplumbağanın | `vit` | all | 100 | 3–6 | 7–12 | 13–20 | 21–30 | 31–42 | 43–55 |
| `suf_all_attr` | Kadimlerin | `allAttr` | J | 30 | — | 2–4 | 5–7 | 8–11 | 12–15 | 16–20 |
| `suf_attack_speed` | Rüzgârın | `attackSpeed` (W: yerel ×1.5) | W, gloves, J | 60 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 | 13–15 |
| `suf_cast_speed` | Bilgenin | `castSpeed` | W, O, gloves, helm, J | 60 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 | 13–15 |
| `suf_crit_chance` | Şahinin | `critChance` | W, O, gloves, helm, J | 60 | 0.5–1.0 | 1.1–1.5 | 1.6–2.2 | 2.3–3.0 | 3.1–4.0 | 4.1–5.0 |
| `suf_crit_damage` | Kurdun | `critDamage` | W, gloves, J | 60 | 5–9 | 10–15 | 16–22 | 23–30 | 31–38 | 39–46 |
| `suf_res_fire` | Semenderin | `resFire` | AR, belt, J, O | 100 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–40 |
| `suf_res_frost` | Yetinin | `resFrost` | AR, belt, J, O | 100 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–40 |
| `suf_res_lightning` | Fırtınanın | `resLightning` | AR, belt, J, O | 100 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–40 |
| `suf_res_shadow` | Şafağın | `resShadow` | AR, belt, J, O | 100 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–40 |
| `suf_res_poison` | Yılanın | `resPoison` | AR, belt, J, O | 100 | 5–8 | 9–13 | 14–19 | 20–26 | 27–34 | 35–40 |
| `suf_res_all` | Gökkuşağının | `resAll` | J, chest, Sh | 40 | — | 3–4 | 5–7 | 8–10 | 11–13 | 14–16 |
| `suf_move_speed` | Çitanın | `moveSpeedPct` | boots | 80 | 3–4 | 5–6 | 7–8 | 9–10 | 11–12 | 13–14 |
| `suf_cdr` | Zamanın | `cdr` | helm, shoulders, gloves, J | 40 | — | 2–3 | 4–5 | 6–7 | 8–9 | 10–11 |
| `suf_hp_regen` | Trolün | `hpRegen` | AR, belt, J | 70 | 1–2 | 3–5 | 6–10 | 11–18 | 19–28 | 29–40 |
| `suf_res_regen` | Pınarın | `resourceRegenPct` | helm, J, O, W (staff/wand) | 60 | 5–8 | 9–12 | 13–17 | 18–22 | 23–28 | 29–35 |
| `suf_life_on_hit` | Sülüğün | `hpOnHit` | W, gloves, ring | 50 | 1–2 | 3–5 | 6–10 | 11–18 | 19–28 | 29–40 |
| `suf_gold_find` | Tüccarın | `goldFindPct` | helm, boots, belt, J | 50 | 5–10 | 11–17 | 18–25 | 26–34 | 35–44 | 45–55 |
| `suf_magic_find` | Talihin | `magicFindPct` | helm, boots, J | 40 | 3–5 | 6–9 | 10–14 | 15–19 | 20–25 | 26–32 |
| `suf_dodge` | Gölgenin | `dodgeChance` | shoulders, gloves, legs, boots | 50 | 0.5–1.0 | 1.1–1.5 | 1.6–2.2 | 2.3–3.0 | 3.1–3.8 | 3.9–4.5 |
| `suf_cc_reduction` | Kayanın | `ccReductionPct` | helm, chest, legs, belt | 40 | 4–6 | 7–9 | 10–13 | 14–17 | 18–22 | 23–27 |
| `suf_potion` | Şifacının | `potionPct` | belt | 60 | 5–8 | 9–12 | 13–17 | 18–22 | 23–28 | 29–35 |
| `suf_xp_gain` | Öğrencinin | `xpPct` | helm, J | 30 | 2–3 | 4–5 | 6–7 | 8–9 | 10–11 | — |
| `suf_stagger` | Devin | `staggerPct` | W, gloves, shoulders | 40 | 5–8 | 9–12 | 13–17 | 18–22 | 23–28 | 29–35 |

### 4.8 Rare / epic name generator

Name = `"{first} {second}"`, first from list A, second from the slot group's list (no repeats on the same item).

| List | Words |
|---|---|
| A (all) | Kan, Gece, Fırtına, Kemik, Ölüm, Kor, Kuzgun, Demir, Gölge, Yıldız, Kurt, Ejder, Buz, Kül, Şimşek, Kader, Zehir, Ruh, Taş, Alev |
| Weapon (W, O except shield) | Dişi, Pençesi, Kesen, Yaran, Fısıltısı, Hükmü, Çığlığı, Laneti, Gazabı, Öpücüğü |
| Armour (AR, shield, belt) | Kabuğu, Siperi, Postu, Kalesi, Örtüsü, Pulu, Duvarı, Peçesi, Zırhı, Sargısı |
| Jewelry (J) | Gözü, Mührü, Halkası, Yüreği, Sırrı, Tılsımı, Gözyaşı, Nefesi, Düğümü, Yemini |

### 4.9 Efsanevi (legendary / unique) items

Legendaries have a fixed base, 3 fixed stat lines (ranges rolled at drop), 1 random affix and a unique effect. 70% of legendary drops are for the looter's class. All are "Ruha Bağlı" (soulbound).

| id | Ad | Base | Min ilvl | Class | Fixed lines | Unique effect (TR tooltip) | Source |
|---|---|---|---:|---|---|---|---|
| `leg_dragonfang` | Ejderdişi | `sword1h` | 40 | Şövalye | `wpnDamagePctLocal` 80–100; `fireDamagePct` 15–20; `str` 20–30 | Kılıç Kombosu'nun 3. vuruşu önüne 6 m ilerleyen bir ateş dalgası salar (%150 ateş hasarı). | any boss 40+ |
| `leg_mountain_heart` | Dağın Kalbi | `shield` (Kule Kalkanı) | 40 | Şövalye | `armorPctLocal` 60–80; `blockChance` 5; `maxHp` 150–220 | Engellenen her vuruş 3 m şok dalgası yaratır (%100 hasar, 1 sn ICD) ve Kalkan Darbesi'nin bekleme süresini 0.5 sn azaltır. | any boss 40+ |
| `leg_skullsplitter` | Kafatası Yaran | `axe2h` | 40 | Barbar | `wpnDamagePctLocal` 90–110; `critDamage` 25–35; `str` 20–30 | Yer Yaran 30°'lik yelpazede 3 yarık açar (her biri %60 hasar). +%30 sarsma. | any boss 40+ |
| `leg_heart_of_storm` | Kasırganın Yüreği | Ağır `chest` | 35 | Barbar | `maxHpPct` 10–14; `str` 25–35; `resAll` 8–10 | Kasırga 6 m içindeki düşmanları içine çeker ve %30 daha az Öfke harcar. | any boss 35+ |
| `leg_ember_staff` | Kül Asası | `staff` | 40 | Büyücü | `wpnDamagePctLocal` 80–100; `fireDamagePct` 20–30; `int` 20–30 | Ateş Topu çarptığında 3 küçük ateş topuna bölünür (her biri %40 hasar). Yanan düşmanlar öldüğünde yanma 4 m çevreye yayılır. | any boss 40+ |
| `leg_frozen_crown` | Donmuş Taç | Hafif `helm` | 35 | Büyücü | `int` 20–30; `cdr` 6–8; `resFrost` 20 | Buz Halkası 2 şarja sahip olur. Donmuş düşmanlar %25 daha fazla hasar alır. | any boss 35+ |
| `leg_tome_of_echoes` | Yankılar Kitabı | `tome` | 45 | Büyücü | `damagePct` 12–16; `maxResource` 10–15; `castSpeed` 8–10 | Gizem büyülerin %20 şansla bedavaya ikinci kez atılır. | M+ chest / boss 45+ |
| `leg_whisper` | Fısıltı | `dagger` | 40 | Haydut | `wpnDamagePctLocal` 80–100; `critChance` 3–4; `dex` 20–30 | Kritik vuruşlar +2 Zehir yığını uygular. 5 Kombo ile İnfaz 2 Kombo Puanı iade eder. | any boss 40+ |
| `leg_nightstalker_hood` | Gece Avcısı Başlığı | Orta `helm` | 35 | Haydut | `dex` 20–30; `critChance` 2–3; `resShadow` 20 | Gölge Adımı'ndan sonra 2 sn gizlenirsin; gizlenmeden yapılan ilk vuruş +%100 kritik hasarı alır. (Görsel: `Rogue_Head_Hooded`) | any boss 35+ |
| `leg_windrunner` | Rüzgâr Koşucusu | `boots` (looter's weight) | 30 | Hepsi | `moveSpeedPct` 14–18; `maxHp` 100–150; main stat 15–25 | Kaçış Yuvarlanması +1 şarj kazanır; her yuvarlanma 3 sn boyunca +%15 hareket ve saldırı/büyü hızı verir. | any boss 30+ |
| `leg_blood_ring` | Kan Yüzüğü | `ring_iron` | 30 | Hepsi | `lifeSteal` 2–3; `critDamage` 15–20; `vit` 15–20 | Can çalma süreli hasarlara (DoT) %50 verimle uygulanır. | any boss 30+ |
| `leg_eye_of_ancients` | Kadimlerin Gözü | `amulet_ancient` | 50 | Hepsi | `allAttr` 15–20; `resAll` 10–14; `cdr` 5 | Son 4 sn içinde verdiğin her farklı hasar türü için +%8 hasar (en fazla 3 tür). | M+ chest |
| `leg_madmans_belt` | Çılgının Kemeri | `belt_heavy` | 30 | Hepsi | `maxHp` 150–220; `potionPct` 10; `str`/`dex`/`int` (class main) 15–20 | Canın %50'nin altındayken +%25 saldırı ve büyü hızı ile +%3 can çalma kazanırsın. | any boss 30+ |
| `leg_titan_grip` | Titan Kavrayışı | Ağır `gloves` | 40 | Şövalye/Barbar | `attackSpeed` 8–10; `str` 20–30; `critDamage` 10 | Temel saldırının her 3. vuruşu 3 m geri iten bir şok dalgası yaratır (%200 hasar). | any boss 40+ |
| `leg_phoenix_mantle` | Anka Omuzluğu | `shoulders` (looter's weight) | 45 | Hepsi | `fireDamagePct` 8–12; `resFire` 20; `maxHp` 100–150 | Ölümcül hasar aldığında %40 canla dirilir ve 6 m ateş patlaması yaratırsın (%400 ateş hasarı). 180 sn bekleme. (M+ ölüm sayacına eklenmez.) | M+ chest / boss 45+ |
| `leg_merchant_kings_ring` | Tüccar Kralın Yüzüğü | `ring_gold` | 20 | Hepsi | `goldFindPct` 40–60; `magicFindPct` 10; `maxHp` 60–100 | Altın toplamak maks. canının %0.5'ini iyileştirir. Altın mıknatıs yarıçapı +4 m. | any boss 20+ |

### 4.10 Set items (4 sets × 4 pieces)

Set pieces: fixed name, 4 fixed lines (class main stat T2–T1 range for its ilvl, `vit` T2–T1, one slot-typical line from the affix pool at T2–T1, one resist T2–T1) + implicit. Drop only from ilvl ≥ 40 bosses (weights §7.2) and Mythic+ chests. "Ruha Bağlı".

| Set id | Ad | Class | Pieces (slot) | 2-parça bonusu | 4-parça bonusu |
|---|---|---|---|---|---|
| `set_holy_vanguard` | Kutsal Öncü | Şövalye | Kutsal Öncü Miğferi (helm), Kutsal Öncü Omuzlukları (shoulders), Kutsal Öncü Zırhı (chest), Kutsal Öncü Kalkanı (shield) | +%20 zırh; Kutsal Toprak müttefikleri saniyede ek %1.5 iyileştirir. | Meydan Okuma, Kalkan Darbesi'nin bekleme süresini sıfırlar. Kalkan Darbesi %200 DAHA FAZLA hasar verir ve 4 m kutsal patlama yaratır (%200 kutsal hasar). |
| `set_wolfblood` | Kurt Kanı | Barbar | Kurt Kanı Başlığı (helm), Kurt Kanı Göğüslüğü (chest), Kurt Kanı Bacaklığı (legs), Kurt Kanı Baltası (axe2h) | Savaş Narası aktifken +%15 saldırı hızı. | Kasırga her 1 sn'de düşman arayan bir kan hortumu çıkarır (%120 hasar/sn, 3 sn yaşar). Savaş Narası'ndan sonraki 4 sn Kasırga Öfke harcamaz. |
| `set_archmage_legacy` | Başbüyücünün Mirası | Büyücü | Başbüyücü Şapkası (helm), Başbüyücü Cübbesi (chest), Başbüyücü Eldivenleri (gloves), Başbüyücü Kolyesi (amulet) | +%20 mana yenilenmesi; bekleme süreleri −%10. | Meteor 2 ek meteor çağırır (%60 hasar, 1.5 m sapma) ve Işınlanma'nın bekleme süresini sıfırlar. |
| `set_shadow_veil` | Gölge Peçesi | Haydut | Gölge Peçesi Başlığı (helm), Gölge Peçesi Eldivenleri (gloves), Gölge Peçesi Botları (boots), Gölge Peçesi Hançeri (dagger) | Kaçış Yuvarlanması'ndan sonra 3 sn +%10 kritik şansı. | 5 Kombo ile İnfaz, Gölge Adımı'nı sıfırlar ve %150 DAHA FAZLA hasar verir. |

---

## 5. Demirci (Blacksmith): Upgrades, Efsun, Sockets

### 5.1 +0 → +15 upgrade table

Gold cost = `(100 + 20 × ilvl) × goldMult`. Materials are consumed on every attempt, success or fail.

| Hedef | Başarı % | Altın çarpanı | Altın @ilvl 30 | Altın @ilvl 60 | Altın @ilvl 90 | Kara Demir | Büyülü Toz | Ejderha Pulu | Ruh Taşı | Başarısızlık (korumasız) | Kümülatif silah hasarı % | Kümülatif zırh % | Efsun gücü bonusu % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|
| +0→+1 | 100 | ×1 | 700 | 1,300 | 1,900 | 2 | — | — | — | yok | +3 | +2 | — |
| +1→+2 | 100 | ×1.5 | 1,050 | 1,950 | 2,850 | 3 | — | — | — | yok | +6 | +5 | — |
| +2→+3 | 95 | ×2 | 1,400 | 2,600 | 3,800 | 4 | — | — | — | kalır | +10 | +8 | — |
| +3→+4 | 90 | ×3 | 2,100 | 3,900 | 5,700 | 5 | 1 | — | — | kalır | +14 | +11 | — |
| +4→+5 | 80 | ×4 | 2,800 | 5,200 | 7,600 | 6 | 2 | — | — | kalır | +18 | +14 | — |
| +5→+6 | 70 | ×6 | 4,200 | 7,800 | 11,400 | 8 | 3 | — | — | kalır | +23 | +18 | — |
| +6→+7 | 60 | ×8 | 5,600 | 10,400 | 15,200 | — | 4 | 1 | — | −1 | +29 | +23 | — |
| +7→+8 | 50 | ×11 | 7,700 | 14,300 | 20,900 | — | 5 | 2 | — | −1 | +35 | +28 | — |
| +8→+9 | 40 | ×15 | 10,500 | 19,500 | 28,500 | — | 6 | 3 | — | −1 | +42 | +34 | — |
| +9→+10 | 30 | ×20 | 14,000 | 26,000 | 38,000 | — | 8 | 4 | 1 | YOK OLUR | +50 | +40 | +5 |
| +10→+11 | 25 | ×27 | 18,900 | 35,100 | 51,300 | — | 10 | 5 | 2 | YOK OLUR | +59 | +47 | +6 |
| +11→+12 | 20 | ×36 | 25,200 | 46,800 | 68,400 | — | 12 | 6 | 3 | YOK OLUR | +69 | +55 | +10 |
| +12→+13 | 15 | ×48 | 33,600 | 62,400 | 91,200 | — | 15 | 8 | 4 | YOK OLUR | +80 | +64 | +12 |
| +13→+14 | 10 | ×64 | 44,800 | 83,200 | 121,600 | — | 18 | 10 | 5 | YOK OLUR | +92 | +74 | +14 |
| +14→+15 | 5 | ×85 | 59,500 | 110,500 | 161,500 | — | 22 | 12 | 6 | YOK OLUR | +105 | +84 | +20 |

* **Weapons**: the cumulative % multiplies the weapon's base damage (before local affixes are added).
* **Armour/shields**: cumulative ×0.8 multiplies the item's base armour (shield block chance +0.5 pp per +).
* **Jewelry/belts**: cumulative ×0.5 multiplies the implicit value.
* **Efsun gücü bonusu**: from +10 the item's random affix values are multiplied by `1 + bonus/100` (display the boosted value, store the raw roll).
* **+15**: also adds 1 socket (may exceed the slot maximum by 1) and the title prefix "Kusursuz" in the item name.

### 5.2 Upgrade rules & materials

| Item id | TR | Use | Sources |
|---|---|---|---|
| `kara_demir` | Kara Demir | +1…+6 | salvage normal/magic/rare, 1.5% trash drop |
| `buyulu_toz` | Büyülü Toz | +4…+15, gem combining | salvage magic+ |
| `ejderha_pulu` | Ejderha Pulu | +7…+15 | salvage epic+, Seçkin 3%, boss 40%, M+ chest |
| `ruh_tasi` | Ruh Taşı | +10…+15 | M+ bosses & chests, salvage legendary/set |
| `kutsama_kagidi` | Kutsama Kağıdı | protection: on failure the item **keeps its level** (no −1, no destroy) | M+ chest (timed ≥ +10), daily chest 10%, Av Mührü vendor (50) |
| `demirci_el_kitabi` | Demircinin El Kitabı | +10 pp success for one attempt | Av Mührü vendor (25), boss 2% |

* Failure outcome without protection: target +1…+6 → item stays; target +7…+9 → **−1**; target +10…+15 → **item destroyed** (all invested materials lost, nothing returned).
* One Kutsama Kağıdı and one El Kitabı can be used per attempt (both allowed together). Success cap 100%.
* **Demircinin Hatırası** (anti-frustration): each failed attempt at target ≥ +10 adds +2 pp to that item's next attempt (stored on the item as `failStacks`, max +20 pp), cleared on success.
* Max upgrade by rarity: Normal/Büyülü +9, Nadir +12, Destansı/Efsanevi/Set +15. Sıradan cannot be upgraded.
* Upgrade UI: big anvil animation (1.2 s), success = gold burst + `sfx_upgrade_success`, fail = smoke + `sfx_upgrade_fail`, destroy = item shatters into shards + `sfx_upgrade_destroy`. Global party chat message on +12 or higher success ("X, Ejder Kılıcı'nı +12'ye yükseltti!").

### 5.3 Weapon glow tiers

| Upgrade | Glow id | Look (applied to the weapon mesh + off-hand) |
|---|---|---|
| +0…+6 | none | — |
| +7…+8 | `glow_blue` | blue `#3fa9ff` additive rim/emissive pulse (1.5 s period), faint |
| +9…+11 | `glow_purple` | purple `#b14cff`, stronger emissive + 6 drifting motes |
| +12…+14 | `glow_crimson` | red core `#ff4030` with gold edge `#ffc040`, ember spark particles, short swing trail |
| +15 | `glow_rainbow` | hue cycles through the spectrum every 4 s, sparkle particles, long swing trail, tiny point light on the weapon |

Armour at +12 or higher adds ambient sparkles to the character (subtle, 4 particles/s). Glows render in the low-res buffer so they get the PSX dither.

### 5.4 Efsun (affix reroll)

| Item id | TR | Effect | Rules | Sources |
|---|---|---|---|---|
| `efsun_nesnesi` | Efsun Nesnesi | Rerolls all random affixes (types + values) on a Büyülü/Nadir/Destansı item, keeping the affix count; on Efsanevi only the random line | uses the item's ilvl for tier gates | vendor 8,000 gold (max 5/day), daily chest 25%, M+ chest (timed ≥ +5), Av Mührü (20) |
| `efsun_kilidi` | Efsun Kilidi | Locks one affix before an Efsun Nesnesi | 1 lock = 1 Kilit; 2 locks = 3 Kilit (max 2 locks) | M+ chest (timed ≥ +8, 50%), Av Mührü (40) |
| `kadim_efsun` | Kadim Efsun | Rerolls only the numeric values inside their current tiers | — | M+ chest 20%, boss 5% (L50+) |
| `takviye_nesnesi` | Takviye Nesnesi | Adds one random affix if the item is below its rarity maximum; on a Normal item it adds 1 affix and turns it Büyülü | cannot exceed rarity limits | Seçkin 1%, boss 10%, Av Mührü (15) |

### 5.5 Sockets & gems (Taşlar)

* Socket count rolled at drop (§4.2). Add a socket with **Oyma Kalemi** (`oyma_kalemi`, Av Mührü 30 or boss 5%): 100% success up to the slot max, gold 5,000 × (current sockets + 1).
* Removing a gem: 500 × grade gold, gem returned. Overwriting a socket destroys the old gem.
* Combining: 3 gems of the same type and grade → 1 of the next grade at the Demirci, 100% success. Gold: 100 / 500 / 2,500 / 10,000 / 40,000 for grades 1→2 … 5→6, plus Büyülü Toz 0/1/3/6/10.

**Grades** (`grade` 1–6)

| Grade | TR prefix | Req. level | Drop |
|---:|---|---:|---|
| 1 | Kırık | 1 | L1+ |
| 2 | Kusurlu | 15 | L15+ |
| 3 | (none: "Yakut") | 30 | L30+ |
| 4 | Kusursuz | 45 | L45+ |
| 5 | Kraliyet | 60 | L60, M+ |
| 6 | Kadim | 60 | combine only, or M+ chest at key ≥ 15 |

**Types** (W = weapon socket, A = armour/off-hand socket, J = jewelry/belt socket; values for grades 1/2/3/4/5/6)

| Gem id | TR | Colour | W | A | J |
|---|---|---|---|---|---|
| `gem_ruby` | Yakut | `#e0303a` | `wpnDamagePctLocal` 4/6/8/10/13/16 | `str` 5/10/16/24/34/45 | `resFire` 4/6/8/10/13/16 |
| `gem_emerald` | Zümrüt | `#2ecc71` | `critDamage` 6/10/15/20/26/32 | `dex` 5/10/16/24/34/45 | `resPoison` 4/6/8/10/13/16 |
| `gem_sapphire` | Safir | `#2f6fe0` | `resourceRegenPct` 6/9/12/15/19/24 | `int` 5/10/16/24/34/45 | `resFrost` 4/6/8/10/13/16 |
| `gem_topaz` | Topaz | `#f2c037` | `attackSpeed` and `castSpeed` 2/3/4/5/6/8 | `vit` 5/10/16/24/34/45 | `resLightning` 4/6/8/10/13/16 |
| `gem_amethyst` | Ametist | `#9b59d0` | `lifeSteal` 0.3/0.5/0.8/1.1/1.5/2.0 | `maxHpPct` 1/2/3/4/5/6 | `resShadow` 4/6/8/10/13/16 |
| `gem_diamond` | Elmas | `#e8f4ff` | `eliteDamagePct` 4/6/8/10/13/16 | `resAll` 2/3/4/5/6/8 | `cdr` 1/1.5/2/2.5/3/4 |

Gem ids with grade: `gem_ruby_1` … `gem_ruby_6`. Display: `"{gradePrefix} {typeTr}"` (e.g. "Kusursuz Yakut"). Gems are stackable materials in `CharacterSave.materials` (ItemCategory `gem`); a socket stores the gem id in `ItemInstance.sockets`. The existing `GemDef` has a single `stat`; append optional `weapon`, `armor`, `jewelry` (`{stat, values[6]}`) fields to express the per-socket-category effects above.

### 5.6 Salvage (Parçalama)

| Rarity | Yield |
|---|---|
| Sıradan | Kara Demir ×1 (50%) |
| Normal | Kara Demir ×1–2 |
| Büyülü | Kara Demir ×2–3, Büyülü Toz ×1 |
| Nadir | Kara Demir ×1–2, Büyülü Toz ×2–4, Ejderha Pulu ×1 (10%) |
| Destansı | Büyülü Toz ×4–6, Ejderha Pulu ×1–2 |
| Efsanevi / Set | Büyülü Toz ×6–8, Ejderha Pulu ×2–3, Ruh Taşı ×1 |
| Upgraded item | additionally returns 30% (rounded down) of upgrade materials invested (never gold) |

Socketed gems are returned to the pouch when salvaging. "Toplu Parçala" button: salvage all non-locked items of a chosen rarity or lower.

---

## 6. Progression

### 6.1 XP curve (levels 1–60)

```
xpMonster(L)  = round(5 + 1.2 * L^1.5)                 // Sıradan of level L
killsToLevel  = 30 + 10 * L                            // design target, same-level Sıradan kills
xpToNext(L)   = round10(killsToLevel(L) * xpMonster(L))
```

| Seviye L | xpToNext(L) | Kümülatif XP (L'ye ulaşmak için) | xpMonster(L) (Sıradan) | ~Sıradan öldürme / seviye |
|---:|---:|---:|---:|---:|
| 1 | 240 | 0 | 6 | 40 |
| 2 | 400 | 240 | 8 | 50 |
| 3 | 660 | 640 | 11 | 60 |
| 4 | 1,050 | 1,300 | 15 | 70 |
| 5 | 1,440 | 2,350 | 18 | 80 |
| 10 | 5,590 | 16,520 | 43 | 130 |
| 15 | 13,500 | 58,540 | 75 | 180 |
| 20 | 25,760 | 148,670 | 112 | 230 |
| 25 | 43,400 | 310,520 | 155 | 280 |
| 30 | 66,660 | 571,550 | 202 | 330 |
| 35 | 96,140 | 961,420 | 253 | 380 |
| 40 | 132,870 | 1,512,520 | 309 | 430 |
| 45 | 176,160 | 2,260,220 | 367 | 480 |
| 50 | 227,370 | 3,240,970 | 429 | 530 |
| 55 | 286,520 | 4,493,520 | 494 | 580 |
| 59 | 340,380 | 5,718,710 | 549 | 620 |
| 60 | — (maks.) | 6,059,090 | 563 | — |

Toplam 1→60 XP: **6,059,090**. Toplam Sıradan-eşdeğeri öldürme: **19,470** (≈ 6–9 saat oyun, görev/zindan bonuslarıyla).

At level 60 XP stops (bar shows "MAKS."). `xpPct` affixes and Bilgelik İksiri do nothing in Mythic+.

### 6.2 XP modifiers

| Modifier | Value |
|---|---|
| Rank multiplier | Sürü 0.35, Sıradan 1, Seçkin 5, Ara Patron 25, Patron 100 |
| Monster lower than player by d | d ≤ 3: 100%, 4: 80%, 5: 60%, 6: 40%, 7: 20%, ≥ 8: 5% |
| Monster higher than player by d | +5% per level, max +25% |
| Party | every member within 60 m gets the **full** XP × (1 + 0.05 × (n − 1)) (no split; monsters already have more HP) |
| Katliam Bonusu (massacre) | kill chain with < 1.5 s between kills: at 10/25/50/100 kills, bonus = 5/10/20/35% of the chain's XP, banner "KATLİAM ×25!" |
| Daily bounty | 15% of `xpToNext(L)` each |
| First clear of a dungeon | 50% of `xpToNext(L)` |
| Level-up | full HP + resource refill, golden pillar VFX, `sfx_level_up`, +1 passive point toast |

### 6.3 Unlock schedule

| Level | Unlocks |
|---:|---|
| 1 | Basic attack, skill 1 (RMB), dodge roll, potions |
| 2 | Pasif Ağaç (first point) |
| 3 | Skill 2 (Q) |
| 5 | Günlük Görevler board, Depo (stash) |
| 6 | Skill 3 (E) |
| 8 | Party play and the first normal dungeon |
| 10 | Skill 4 (F); Demirci upgrades +1…+9; salvage |
| 12 | Kadim Bilgelik quest #1 (+1 passive) |
| 15 | Skill 5 (1); Efsun items usable; gem combining |
| 20 | Skill 6 (2); elixir vendor; legendaries begin dropping (min ilvl 20) |
| 25 | Skill 7 (3); Gizemli Tüccar (gamble vendor) |
| 30 | Skill 8 = ultimate (R); upgrades +10…+15 |
| 40 | Set items begin dropping |
| 50 | T1 affixes reachable (ilvl 50) |
| 60 | Mythic+ (first keystone from quest "Kadim Anahtar"), Kadim Kasa (weekly vault), M+ bounties |

### 6.4 Gold economy

**Income** (drop amount = `goldAvg(L) × rankGoldMult × U(0.6, 1.4) × (1 + goldFindPct/100)`; drop chances in §7.1). Rough L60 income: ≈ 70–90k gold/hour from kills + vendor sales.

**Vendor sell price** (vendors buy everything; buy-back of last 12 sales):

```
sell(item) = round((5 + 1.2*ilvl) * rarityMult * (1 + 0.1*upgradeLevel))
rarityMult: Sıradan 0.5, Normal 1, Büyülü 2, Nadir 4, Destansı 8, Efsanevi/Set 12
materials : Kara Demir 5, Büyülü Toz 20, Ejderha Pulu 200, Ruh Taşı 1,000 ; gems: 50 × 3^(grade−1)
```

**Vendor buy list**

| Item id | TR | Price | Req. level |
|---|---|---:|---:|
| `pot_hp_1`…`pot_hp_5` | Küçük / Orta / Büyük / Güçlü / Kadim Can İksiri | 10 / 40 / 120 / 300 / 600 | 1 / 15 / 30 / 45 / 60 |
| `pot_res_1`…`pot_res_5` | Küçük … Kadim Ruh İksiri | 8 / 32 / 96 / 240 / 480 | 1 / 15 / 30 / 45 / 60 |
| `scroll_town` | Dönüş Parşömeni | 25 | 1 |
| elixirs | see §6.5 | 1,500–4,000 | 5–30 |
| `efsun_nesnesi` | Efsun Nesnesi | 8,000 (max 5/day) | 15 |
| `gem_*_1` | Kırık gems | 500 | 1 |
| white bases | Normal items of every base ≤ player level | sell × 4 | — |

**Gizemli Tüccar (gambling, L25+)**: pick a slot type, pay `20 × sell(normal item at player level)`; receives an item at ilvl = player level with rarity weights Büyülü 70 / Nadir 25 / Destansı 4.5 / Efsanevi 0.5.

**Gold sinks**: upgrades (§5.1), Efsun/Oyma, gem combine/unsocket, respec (§3.1), "Burada Diril" (§6.6), gambling, elixirs. **No durability/repair.**

### 6.5 Consumables

| Item id | TR | Effect | Cooldown | Stack |
|---|---|---|---|---:|
| `pot_hp_1`…`5` | Can İksiri (5 tiers) | heals 25 / 35 / 45 / 55 / 65% max HP: 60% instantly, 40% over 3 s; × `potionPct` | 10 s shared (all HP potions) | 99 |
| `pot_res_1`…`5` | Ruh İksiri (5 tiers) | restores 25 / 35 / 45 / 55 / 65% max resource instantly (Öfke: adds) | 15 s shared | 99 |
| `scroll_town` | Dönüş Parşömeni | 3 s channel, opens portal to town (party can use it for 60 s); not usable in M+ | — | 99 |
| `elixir_might` | Kudret İksiri | +10% DAHA FAZLA damage — category **Savaş** | 30 min | 20 |
| `elixir_swiftness` | Rüzgâr İksiri | +8% move speed, +5% attack & cast speed — **Savaş** | 30 min | 20 |
| `elixir_ironskin` | Demir Deri İksiri | +15% armour, +10 all resist — **Muhafız** | 30 min | 20 |
| `elixir_vitality` | Hayat İksiri | +10% max HP — **Muhafız** | 30 min | 20 |
| `elixir_wisdom` | Bilgelik İksiri | +20% XP (not in M+) — **Yardım** | 60 min | 20 |
| `elixir_fortune` | Talih İksiri | +25% gold find, +15% magic find — **Yardım** | 30 min | 20 |

Elixir prices: might 2,500 · swiftness 2,000 · ironskin 2,500 · vitality 2,000 · wisdom 1,500 · fortune 4,000. One elixir per category; durations tick only while in game and persist through death. The potion quick slot (key 4/5) automatically uses the highest tier the player can use. Potions are instant (no animation lock); if idle, play `Use_Item` upper-body only.

### 6.6 Death penalty

| Context | Penalty | Respawn |
|---|---|---|
| Open world | from L10: lose 5% of the current level's `xpToNext` (cannot de-level); no item/gold loss | town or last Kutsal Taş checkpoint with 50% HP; or "Burada Diril" after 5 s for 50 × level gold; 3 s spawn immunity |
| Normal dungeon | none | last dungeon checkpoint; party revive allowed (hold F 3 s, out of combat) |
| Mythic+ | no XP loss; +5 s on the timer per death (rule owned by the M+ doc) | release → dungeon start; party revive allowed **in combat** (hold F 4 s, reviver cannot act) |
| Any revive | revived with 30% HP + 2 s immunity | — |

### 6.7 Inventory & stash

| Container | Size | Contents | Code |
|---|---|---|---|
| Çanta (bag) | 48 slots (8×6), 1 item = 1 slot | equipment (and keystones) | `CharacterSave.bag`, `BAG_SIZE` |
| Kese (pouch) | unlimited types, stacks 9,999 (potions 99) | materials, gems, consumables, scrolls, Av Mührü | `CharacterSave.materials` |
| Depo (stash) | 120 slots shown as 2 tabs × 60 (10×6) | equipment | `CharacterSave.stash`, `STASH_SIZE` |

Bag/stash expansions (gold sink) are a v2 option; they would need `BAG_SIZE`/`STASH_SIZE` to become per-save values.

Items can be locked (`kilit`) to block selling/salvaging. Sorting button: by slot, then rarity, then ilvl.

### 6.8 Günlük Görevler (daily bounties) & Av Mührü

* Board "Görev Panosu" in town (L5+). 3 random bounties per day from the templates below matching the player's level; reset 04:00 local time; 1 free reroll per day, further rerolls 500 × level gold.
* Each bounty reward: 15% of `xpToNext(L)` (L < 60), 100 × L gold, **Av Mührü** ×5 (×8 at L60).
* All 3 done → **Günlük Sandık**: 1 Nadir+ item (25% Destansı) at ilvl = L (64 at 60), +5 Av Mührü, 25% Efsun Nesnesi, 10% Kutsama Kağıdı, 50% gem (grade by level).
* Weekly **Haftalık Ferman**: complete 12 dailies in a week → 1 Destansı item + 30 Av Mührü + 1 Efsun Kilidi (reset Monday 04:00).

| Template id | TR title | Requirement |
|---|---|---|
| `bounty_kill_family` | {Aile} Avı | kill 60 monsters of a family (zone level ±5) |
| `bounty_kill_elites` | Seçkin Avcısı | kill 8 Seçkin packs |
| `bounty_kill_boss` | Patron Avı | kill 2 Patrons |
| `bounty_dungeon` | Zindan Temizliği | complete 1 dungeon |
| `bounty_mplus` (L60) | Kadim Sınav | complete 1 M+ key ≥ max(2, best − 3) |
| `bounty_mplus_timed` (L60) | Zamana Karşı | time any M+ key |
| `bounty_upgrade` | Demircinin Çırağı | succeed 3 upgrades |
| `bounty_salvage` | Hurdacı | salvage 15 items |
| `bounty_gold` | Hazine Avcısı | collect 1,000 × L gold |
| `bounty_globe` | Hayatta Kal | pick up 25 Can Küresi |
| `bounty_party` | Yoldaşlık | kill 150 monsters in a party of 2+ |
| `bounty_no_death` | Ölümsüz | kill 3 Seçkin packs without dying |

**Mühürdar** (Av Mührü vendor)

| Item | Cost (Av Mührü) |
|---|---:|
| Kutsama Kağıdı | 50 |
| Demircinin El Kitabı | 25 |
| Efsun Nesnesi | 20 |
| Efsun Kilidi | 40 |
| Takviye Nesnesi | 15 |
| Oyma Kalemi | 30 |
| Random gem (grade by level) | 30 |
| Ejderha Pulu ×3 | 20 |
| Ruh Taşı ×1 (L60) | 35 |
| Mühür Sandığı (Nadir+ item, choose slot, ilvl = L) | 60 |

---

## 7. Loot

### 7.1 Drop tables (open world & normal dungeons)

| Rank | Item chance | Extra items | Guaranteed | Gold chance × mult | Potion | Can Küresi | Gem | Materials |
|---|---|---|---|---|---:|---|---:|---|
| Sürü | 3% | — | — | 15% × 0.5 | 1% | 3% | 0.2% | Kara Demir 0.5% |
| Sıradan | 8% | — | — | 30% × 1 | 3% | 8% | 0.5% | Kara Demir 1.5% |
| Seçkin | 100% | +1 (40%) | min Büyülü | 100% × 6 | 25% | 100% (1–2) | 5% | Ejderha Pulu 3%, Takviye 1% |
| Ara Patron | 100% ×2 | +1 (50%) | 1 Nadir+ | 100% × 25 | 100% | 2 | 20% | Ejderha Pulu 15% |
| Patron | 100% ×4 | +1 (50%), +1 (25%) | 2 Nadir+ | 100% × 60 | 100% | 3 | 50% | Ejderha Pulu 40%, Takviye 10%, El Kitabı 2%, Kadim Efsun 5% (L50+), Oyma Kalemi 5% |

**Can Küresi** (health globe, `health_globe`): red low-poly orb, bobbing; walking over it heals 15% max HP to the picker and all allies within 8 m; magnet radius 2 m; despawns after 30 s.

### 7.2 Rarity weights

| Rarity | Base weight | Elite / Ara Patron | Patron | Availability |
|---|---:|---|---|---|
| Sıradan | 300 | 0 | 0 | — |
| Normal | 400 | 0 | 0 | — |
| Büyülü | 230 | ×1 | ×1 | — |
| Nadir | 60 | ×1.5 | ×3 | — |
| Destansı | 8 | ×2 | ×4 | ilvl ≥ 10 |
| Efsanevi | 1.0 | ×2 | ×4 | ilvl ≥ 20 (per item min ilvl) |
| Set | 0.8 | ×0 | ×4 | bosses only, ilvl ≥ 40 |

* **Magic find**: Büyülü and Nadir weights × (1 + MF/100); Destansı/Efsanevi/Set × (1 + MF/200). MF cap 250.
* **Legendary pity**: every Patron kill without a legendary drop adds +25% of base legendary weight (cap ×5), reset when the player gets any legendary.
* "Guaranteed Nadir+" slots reroll rarity with Sıradan/Normal/Büyülü removed.

### 7.3 Smart loot

* 75% of equipment drops are for the looter's class (allowed weapon types / armour weight); 25% fully random (stash for alts or salvage).
* Legendary: 70% class-specific or universal usable by the class.

### 7.4 Mythic+ loot

| Source | Rule |
|---|---|
| Trash / Sürü in M+ | no equipment; gold, potions, Can Küresi, materials as §7.1 |
| Seçkin in M+ | 1 Büyülü+ item per player at 30% (ilvl 60 + key) |
| Bosses in M+ | 1 Nadir+ item per player (ilvl 60 + key + 2) + Ruh Taşı ×1 + Ejderha Pulu ×1 |
| **End chest – timed** | per player **2 items**, ilvl 60 + 2 × min(key, 15) |
| **End chest – depleted** | per player **1 item**, ilvl −4 |
| Chest rarity | min Nadir; Destansı 25% + 3%/key (cap 70%); Efsanevi 3% + 0.5%/key (cap 12%); Set 5% + 0.5%/key (cap 14%) |
| Chest extras | gold 2,000 × key; Ruh Taşı 1 + ⌊key/3⌋; Ejderha Pulu 2 + ⌊key/2⌋; Büyülü Toz 10 + 2 × key; gem 30% (Kraliyet at key ≥ 10, Kadim 10% at key ≥ 15); timed only: Efsun Nesnesi (key ≥ 5), Efsun Kilidi 50% (key ≥ 8), Kutsama Kağıdı ×1 (key ≥ 10) / ×2 (key ≥ 15), Kadim Efsun 20% |
| Key change | timed ≤ 100% of timer: +1; ≤ 80%: +2; ≤ 60%: +3; depleted: −1 (min +2) |
| **Kadim Kasa** (weekly vault) | slots unlock at 1 / 4 / 8 M+ completions this week (timed or not). Each slot shows one item at ilvl 63 + 2 × min(keyₙ, 15) where keyₙ = the highest / 4th highest / 8th highest key; the player takes **one** slot. Min Destansı; Efsanevi 15%, Set 15%. Reset Monday 04:00 local. |

### 7.5 Party loot (personal loot)

* Loot is rolled **separately for every player** with that player's seeded RNG (which peer performs the roll is defined by `ARCHITECTURE.md` / `NETCODE.md`); each player sees only their own drops. Unpicked drops expire after 5 min.
* Gold, potions, Can Küresi: each player gets their own instance (Can Küresi heal still affects allies).
* No trading in v1. Efsanevi/Set/M+ chest items are "Ruha Bağlı".
* A player more than 60 m from the kill gets no drops from it (anti-leech), but still gets XP if inside the dungeon instance.

### 7.6 Loot filter & pickup

| Setting id | TR label | Default |
|---|---|---|
| `filter_hide_common` | Sıradan eşyaları gizle | on |
| `filter_hide_normal` | Normal eşyaları gizle | off (auto-on at L30) |
| `filter_min_rarity` | Gösterilecek en düşük nadirlik | none |
| `filter_hide_other_class` | Diğer sınıfların eşyalarını gizle | off |
| `autopickup_gold` | Altını otomatik topla | always on (magnet 4 m, pickup 1.2 m) |
| `autopickup_pouch` | İksir / malzeme / taşları otomatik topla | on |
| `autopickup_min_rarity` | Eşyaları otomatik topla (en düşük nadirlik) | off |
| `labels_always` | Etiketleri her zaman göster | Büyülü+ on; Alt shows all |

Hidden items still exist and appear while Alt is held. Pickup: press **F** (`interact`, nearest item within 2.5 m), walk over it with auto-loot on, or click its label with the free cursor. Full bag → red toast "Çantan dolu!" and the item stays on the ground.

### 7.7 Drop presentation ("loot explosion")

**Physics** (cosmetic, client-side, deterministic from the drop seed)

| Param | Value |
|---|---|
| Spawn | from the monster's chest height (1.0 m × model scale) |
| Initial velocity | up 6–9 m/s, horizontal 2–5 m/s, random direction |
| Gravity | 20 m/s², one bounce (restitution 0.3), then settle with a 0.1 s squash |
| Scatter | lands 1.5–4 m from the corpse; minimum 0.8 m between items (re-pick angle) |
| Stagger | items spawn 40 ms apart; Patron: 0.6 s pause after death, then a burst (all at once) with a gold-coin shower |
| Gold | small coin-pile mesh, sized by amount (3 sizes) |
| Ground model | the item's own mesh where available (weapons/shields from KayKit nodes/props), otherwise a rarity-coloured bag/chest icon mesh |

**Beams & labels**

| Rarity | Beam | Height | Visible distance | Extra | Minimap |
|---|---|---:|---:|---|---|
| Sıradan / Normal | — | — | label only within 15 m (Alt) | — | — |
| Büyülü | ground glint (green sparkle disc) | — | 20 m | — | — |
| Nadir | blue `#0070dd` additive cylinder, slow pulse | 3 m | 30 m | — | dot |
| Destansı | purple `#a335ee` beam + 8 swirling particles | 5 m | 45 m | — | dot |
| Efsanevi | orange `#ff8000` beam + ground ring + pulse every 1.2 s | 8 m | 80 m | screen-edge orange flash once | star icon |
| Set | gold-green `#b8e04a` beam + leaf particles | 8 m | 80 m | screen-edge flash once | star icon |

Labels: rarity-coloured text on a 70% black box, upgrade/socket icons, stack-avoid vertically, fade with distance.

**Sounds**

| Event | SFX id | Notes |
|---|---|---|
| Any item lands | `sfx_drop_generic` | soft thud, random pitch ±10% |
| Büyülü lands | `sfx_drop_magic` | light chime |
| Nadir lands | `sfx_drop_rare` | "ding" |
| Destansı lands | `sfx_drop_epic` | bright two-note chime |
| Efsanevi lands | `sfx_drop_legendary` | choir/gong, ducks music 0.5 s |
| Set lands | `sfx_drop_set` | distinct bell + shimmer |
| Gold lands / picked | `sfx_gold_drop` / `sfx_gold_pickup` | coin jingle / tink (pitch rises during fast chains) |
| Item picked | `sfx_item_pickup` | cloth/leather |
| Can Küresi picked | `sfx_globe_pickup` | soft heal whoosh |

---

## 8. Combat Feel Parameters

### 8.1 Attack phase model & cancel windows

Every attack/skill clip is played as a segment `[start, end]` (normalised) with phases **windup** (segment start → hit), **active** (hit time; sweeps get an active window of 0.06 s) and **recovery** (hit → segment end). Hit detection runs at the hit time on the host: cone test (arc, range, height ±1.5 m), each target hit once per swing (multi-tick skills list their ticks).

| Action type | → dodge | → another skill / basic | → movement |
|---|---|---|---|
| Basic attack | any time (before hit: nothing happens) | after hit + 0.05 s | after hit + 0.15 s |
| `instant` skill | any time; before hit: no cost, no cooldown | after hit + 0.10 s | after hit + 0.20 s |
| `cast` skill | any time (cast cancelled, nothing paid) | no | no (rooted) |
| `channel` | any time (ends channel) | any time (ends channel) | per skill |
| `dash` / leap | no | after landing + 0.15 s | after landing + 0.15 s |
| Ultimate | not in the first 0.3 s | after its lock | after its lock |
| Dodge roll | — | after 0.30 s ("roll-attack") | after 0.40 s |
| Being hit | hit reaction (`Hit_A`/`Hit_B`, upper body) plays only for hits > 10% max HP and never interrupts unless the hit stuns | | |

**Clip timing table** (estimates from KayKit clip lengths; tune by scrubbing and store as `{clip, start, end, hit}`)

| Clip | Length (s) | Default segment | Hit (normalised) |
|---|---:|---|---:|
| `1H_Melee_Attack_Slice_Diagonal` | 1.000 | 0.00–0.70 | 0.38 |
| `1H_Melee_Attack_Slice_Horizontal` | 1.067 | 0.00–0.70 | 0.40 |
| `1H_Melee_Attack_Chop` | 1.067 | 0.00–0.75 | 0.42 |
| `1H_Melee_Attack_Stab` | 1.600 | 0.10–0.55 | 0.35 |
| `2H_Melee_Attack_Slice` | 1.100 | 0.00–0.70 | 0.40 |
| `2H_Melee_Attack_Stab` | 1.600 | 0.10–0.60 | 0.35 |
| `2H_Melee_Attack_Chop` | 1.633 | 0.00–0.70 | 0.45 |
| `2H_Melee_Attack_Spin` | 2.400 | 0.00–1.00 | ticks 0.10–0.85 |
| `2H_Melee_Attack_Spinning` | 0.667 | loop | tick every 0.25 s |
| `Dualwield_Melee_Attack_Slice` | 1.167 | 0.00–0.65 | 0.35 |
| `Dualwield_Melee_Attack_Chop` | 1.267 | 0.00–0.65 | 0.40 |
| `Dualwield_Melee_Attack_Stab` | 1.600 | 0.05–0.60 | 0.32 |
| `1H_Ranged_Shoot` | 1.067 | 0.15–0.60 | 0.30 |
| `2H_Ranged_Shoot` | 1.067 | 0.15–0.60 | 0.30 |
| `Spellcast_Shoot` | 0.933 | 0.05–0.75 | 0.40 |
| `Spellcast_Raise` | 2.100 | 0.10–0.60 | 0.50 |
| `Spellcast_Long` | 2.533 | loop 0.20–0.80 | — |
| `Spellcasting` | 0.667 | loop | 0.50 |
| `Throw` | 1.367 | 0.20–0.70 | 0.45 |
| `Block_Attack` | 1.067 | 0.00–0.60 | 0.40 |
| `Cheer` | 1.667 | 0.00–0.60 | 0.30 |
| `Use_Item` | 1.600 | 0.00–0.50 | 0.45 |
| `Dodge_*` | 0.400 | full | — |

Playback rate = `(end − start) × clipLength / desiredDuration`, where `desiredDuration` = step time (basic) or `lock / speedFactor` (skills). Blend in 0.06 s, out 0.10 s. Locomotion is blended under the upper body only during ranged/caster clips that allow movement.

### 8.2 Combo timing (LMB)

| Param | Value |
|---|---|
| Input buffer | 0.25 s (presses before the window opens are queued; last input wins) |
| Combo window | from hit + 0.05 s until segment end + 0.35 s |
| Combo reset | 0.80 s after the last swing ends without input, or on dodge/skill (melee finisher resets to hit 1) |
| Hold LMB | auto-repeats the chain at the same timing |
| Facing | rotation snaps (max 0.08 s lerp) at swing start to the soft target / camera forward (§8.8) |
| Step-in | if the soft target is ≤ 1.5 m beyond range, the swing lunges up to 1.0 m during windup |
| Movement during windup | ×0.35 speed (steering), during active/recovery 0 until the move-cancel point |

### 8.3 Hit-stop

Hit-stop freezes the **attacker's and victim's animation mixers** (not the simulation) locally — safe in P2P. Victims also get a 60 ms white hit-flash (emissive) and a 0.05 m positional jiggle.

| Hit type | Hit-stop |
|---|---:|
| Basic hit 1/2 | 40 ms |
| Combo finisher (hit 3) | 70 ms |
| Heavy skill (coef ≥ 2.5, slams, İnfaz) | 90 ms |
| Ultimate impact | 120 ms |
| Crit | +25 ms |
| Killing blow | +20 ms |
| Hitting a boss | 60 ms (base, replaces the above if lower) |
| Projectile hit | 0 ms (crit: 25 ms) |
| DoT / channel tick | 0 ms (channel crit: 15 ms) |
| Player hurt by > 15% max HP | 50 ms |

Rules: multi-target hits apply hit-stop **once per swing** (max of targets); cap 120 ms of hit-stop per 0.3 s window; remote players' hits do not hit-stop your character.

### 8.4 Screen shake (trauma model)

`trauma ∈ [0,1]`, shake amount = trauma², decay 1.6/s, max offset 0.35 m, max roll 2.5°, Perlin frequency 25 Hz. Only events caused by **you** or within 10 m of you (with falloff) shake your camera. Option slider "Ekran sarsıntısı" 0–100% (default 70%).

| Event | Trauma add |
|---|---:|
| Your basic hit 1/2 | 0.06 |
| Your finisher | 0.12 |
| Your crit | +0.08 |
| Heavy skill / slam | 0.30 |
| Ultimate | 0.45 |
| Nearby explosion (≤ 10 m) | 0.25 × (1 − d/10) |
| Boss slam (≤ 15 m) | 0.50 × (1 − d/15) |
| You are hit (> 10% max HP) | 0.20 |
| Level-up / loot | 0 |

### 8.5 Knockback

| Class | Distance | Duration | Curve |
|---|---:|---:|---|
| `light` | 0.5–0.8 m | 0.20 s | ease-out quad |
| `medium` | 1.5–2.5 m | 0.25 s | ease-out quad |
| `heavy` | 3 m | 0.30 s | ease-out cubic |
| `ultimate` | 4–5 m | 0.35 s | ease-out cubic + 0.3 m hop |

Distance × rank mass factor: Sürü 1.2, Sıradan 1.0, Seçkin 0.5, Ara Patron 0.2, Patron 0 (immune). **Duvara Çarpma** (wall slam): if a knocked-back enemy hits a wall before travelling 70% of the distance, it takes an extra hit of coef 0.5 (same type) and a 0.5 s stun, with a dust burst.

### 8.6 Damage numbers

| Param | Value |
|---|---|
| Font | pixel/bitmap style (PSX), outlined 2 px black |
| Base size | 18 px; scales 18→34 px with `dmg / targetMaxHP` (0→50%) |
| Colour | by damage type (§1.4); incoming damage on you: red `#ff3b3b`; heals: green `#5aff7a` with "+" |
| Crit | ×1.5 size, yellow-orange `#ffcc33` outline, "!" suffix, pop scale 1.8→1.0 in 0.12 s |
| Motion | rise 1.2 m over 0.8 s, random x jitter ±0.3 m, fade out last 0.25 s |
| Merging | DoT ticks and channel ticks on the same target within 0.1 s merge into one number |
| Filtering | other players' numbers at 60% size/opacity; option to hide |
| Status text | "BLOK" (grey), "KAÇTI" (white), "BAĞIŞIK" (grey), "SENDELEDİ!" (orange, stagger break), "DONDU" (cyan) |

### 8.7 Dodge roll (`dodge_roll`)

| Param | Value |
|---|---|
| Distance / duration | 6.0 m / 0.40 s (ease-out), recovery 0.10 s |
| I-frames | 0.04–0.34 s (0.30 s), immune to damage and CC |
| Charges | 2, recharge 4.0 s each (sequential) |
| Collision | passes through enemies, blocked by walls/props |
| Direction | WASD relative to camera; no input = backwards |
| Clip | `Dodge_Forward/Backward/Left/Right` by roll direction relative to the facing |
| Cancels | everything in §8.1 except dashes, casts' completion and the first 0.3 s of ultimates |
| Perfect dodge (Kusursuz Kaçış) | a hit landing in the first 0.15 s of i-frames → +30% DAHA FAZLA damage 2 s, 50% of the charge refunded, white rim flash, `sfx_perfect_dodge` |
| VFX | dust puff at start, 2 afterimages (alpha 0.3) |

### 8.8 Targeting & camera (third-person)

**Camera**

| Param | Value |
|---|---|
| Distance | default 7.5 u, wheel 3–13 u |
| Pivot | character + (0, 2.0, 0) (KayKit ≈ 2.4 u tall); shoulder offset 0.6 u right (toggle to centre) |
| Pitch | −60°…+75° |
| FOV | 60° |
| Follow | position lerp 12/s; rotation unsmoothed; collision pull-in with 0.2 m sphere |
| Shift-lock | default ON: cursor hidden, mouse orbits, character yaw follows camera yaw (720°/s); locomotion uses `Running_A`, `Running_Strafe_Left/Right`, `Walking_Backwards` (backpedal at 70% speed). Left Ctrl toggles. With shift-lock OFF the character turns toward its movement direction. Hold Alt for a free cursor (UI, loot labels). |

**Soft targeting** (default)

| Rule | Value |
|---|---|
| Melee | candidates within skill range + 1.5 m and inside a 60° cone (±30°) of the camera forward; score = 0.6 × (1 − angle/30°) + 0.4 × (1 − dist/range); best target gets the swing facing and step-in |
| Projectiles | aim at the crosshair ray hit point; aim assist bends direction up to 4° toward an enemy within 2 m of the ray |
| Ground AoE | reticle at the crosshair ground hit, clamped to max range; **tap** = quick-cast at reticle, **hold** = show reticle, release to cast |
| Self AoE / buffs | no target |
| Target-required skills (Gölge Adımı, Hücum) | use the soft target, else the fallback in the skill table |
| Indicator | small red diamond above the current soft target |

**Hard lock** (Tab / middle mouse): locks to the nearest enemy in front; Tab cycles by angle; breaks beyond 30 m or after 2 s without line of sight; camera keeps the target framed; WASD strafes around it; all skills aim at it.

### 8.9 Enemy aggro, telegraphs, reactions

| Param | Value |
|---|---|
| Aggro radius | Sürü/Sıradan 12 m, Seçkin 15 m, Ara Patron 18 m, Patron room trigger; line of sight required; Gizlenme ×0.3 |
| Pack link | 8 m |
| Damage aggro | any damage aggroes the monster on the attacker regardless of distance |
| Leash | open world only: 40 m from spawn → return, heal to full, immune while returning. Dungeons/M+: no leash, no reset |
| Telegraphs | Sıradan windup 0.45 s (weapon flash), Seçkin 0.55 s, big attacks 1.0–1.5 s with red ground decals that fill up; every telegraphed attack is dodgeable with i-frames |
| Flinch | Sıradan/Sürü flinch (and lose their windup) on finishers, heavy skills and crits; Seçkin+ never flinch (stagger bar instead) |
| Death | KayKit-style monsters play their death clip, then dissolve (dither fade 0.6 s) after 2 s; heavy/ultimate kills launch the corpse 1–2 m |
| Max simultaneous attackers on one player | 6 melee slots around the player (others circle at 3–4 m), keeps hordes readable |

### 8.10 Network notes

* Authority and message flow are owned by `ARCHITECTURE.md` (Damage authority, net channels) and `docs/NETCODE.md`. The formulas here are deterministic given the inputs and a seeded RNG, so whichever peer resolves a hit gets the same result.
* Dodge-roll i-frames and block/dodge rolls are evaluated by the victim's peer (incoming hits are victim-resolved).
* Purely local, never synced: hit-stop, screen shake, damage-number layout, loot-explosion physics (seeded), beams, labels.
* Loot is personal (§7.5).

---

## Appendix A. Mapping to the existing code contracts

The shared types already exist (`src/types/*`, append-only). This is how each design concept maps onto them, and the minimal **appends** this design needs.

| Design concept | Where it lives | Mapping / required append |
|---|---|---|
| Stats | `types/stats.ts` `StatId` | §1.1 table. Append: `allAttr, hpRegenPct, healReceivedPct, resourceRegenPct, resourceGainPct, costReductionPct, hpOnKillPct, arcaneDamagePct, meleeDamagePct, projectileDamagePct, bleedDamagePct, executeDamagePct, ailingDamagePct, chilledDamagePct, resPen, aoeRadiusPct, projectileSpeedPct, pierce, ccDurationPct, staggerPct, bleedChance, burnChance, poisonChance` (+ `STAT_INFO` TR names from §1.1). |
| Damage types | `types/common.ts` `DamageType` | uses `physical, fire, frost, lightning, shadow, poison, holy, true`; append `arcane`. |
| Resources | `ResourceType`, `ClassDef.resource` | append `resolve` (Kararlılık) — fallback in §1.3. Kombo = Haydut-only counter. |
| Rarities | `Rarity`, `RARITY_COLORS`, `RARITY_NAMES_TR` | ids unchanged; TR names/colour per §4.2 (core owner to update names + set colour). |
| Classes | `data/classes.ts` `ClassDef` | `baseStats` = L1 attributes + `resourceRegen` base; `perLevel` = growth (§1.2); HP formula in StatCalc uses `hpPerLevel`/`hpPerVit` (put them in `ClassDef` as optional fields or a StatCalc table); `weaponNodes` per §2.1–2.4; `basicAttack` = `<class>_basic`; `skills` = the 8 skill ids in unlock order. |
| Skills | `data/skills.ts` `SkillDef` | one entry per skill + one per basic combo step (`<class>_basic_1..3`, `behavior: 'combo'`); fields per §2.0; stagger/proc/resource gain/segments in `params` (`{stagger, proc, gain, segStart, segEnd}`). Ultimate = tag `ultimate` (only slot `r`). |
| Statuses | `data/statuses.ts` `StatusDef` | §1.8 mapping; append `blind`, `taunt` to `StatusId`. |
| Skill bar | `CharacterSave.skillBar` (`SkillSlotKey` → id) | 6 flexible slots + `r`; bench rule §2.0. |
| Passive tree | `data/talents.ts` `TalentNode` | §3.3 table → `{id, name, kind, x, y, links, stats, special, classStart}`; `stats` column is already code-ready (fractions); keystones/notables with rule changes use `special: {id, desc, params}`. `CharacterSave.talents` stores allocated ids. |
| Item bases | `data/items.ts` `ItemBaseDef` | §4.4; `category` = type id; `weaponDamage` = value at ilvl 1 from §4.4 formula (ItemGen scales with `(4 + 2.5·ilvl)·typeMult`); `attacksPerSecond`, `twoHanded`, `implicit`, `classes`, `model` (KayKit node/prop). |
| Affixes | `ITEM_AFFIXES: AffixDef[]` | §4.6–4.7 → `{id, kind, name, stat, tiers: [{minItemLevel, min, max}], categories, weight}`; tier gates 1/12/24/36/50/72; append optional `local?: boolean` for local affixes. |
| Item instance | `ItemInstance` | `upgrade` (0–15), `affixes[].locked` (Efsun Kilidi), `sockets`, `uniqueId`, `setId`, `bound` (Ruha Bağlı); append optional `failStacks?: number` (Demircinin Hatırası). |
| Uniques / sets | `UNIQUES` / `SETS` | §4.9 → `UniqueDef {fixedAffixes, special: {id: leg_* effect id, desc}}`; §4.10 → `SetDef {pieces, bonuses: [{count: 2, stats or special}, {count: 4, special}]}`. |
| Gems | `GEMS` / `GemDef` | §5.5; append optional per-socket-category fields (see §5.5). |
| Materials & consumables | `data/materials.ts` `MaterialDef` | every id in §5.2, §5.4, §5.5, §6.5, plus `av_muhru` (Av Mührü, kind `currency`) and gems; stored in `CharacterSave.materials`. |
| Bag / stash | `BAG_SIZE` 48, `STASH_SIZE` 120 | §6.7. |
| Upgrade / efsun | `systems/Upgrade.ts` | §5.1–5.4 tables as data (`UPGRADE_STEPS[1..15]`). |
| XP / levels | `systems/Progression.ts`, `LEVEL_CAP` 60 | §6.1 formulas. |
| Loot | `systems/LootSystem.ts`, `ItemGen.ts` | §7 tables; per-player seeded RNG. |
| Mythic+ numbers | `systems/MythicPlus.ts` | HP/damage multipliers §1.10, chest/vault loot §7.4; timer/affixes/rating per `GDD_CONTENT.md`. |
| Feel constants | `Engine.hitStop`, `ThirdPersonCamera.shake`, vfx damage numbers | §8 tables (suggest one `FEEL` constants object in the combat module). |
