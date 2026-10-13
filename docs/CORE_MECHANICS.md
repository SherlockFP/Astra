# EFSUN ONLINE — Core Mechanics & Balance (normative, authored by the orchestrator)

The user asked that the game's core mechanics, class synergies and balance be designed by Opus ("opus kursun, oyunun
temel mekanikleri ve mantığı çok önemli"). This document is **normative**: where it conflicts with GDD_SYSTEMS /
GDD_V2 / GDD_CLASSES_V2 / GDD_TALENTS, this document wins (precedence: ARCHITECTURE > CORE_MECHANICS > other GDDs).
Implementation is done by Haiku in the packages of §9; numbers are tuning targets enforced by the SimBench (§5).

## 1. Design pillars for combat & balance
1. **Every spec is viable.** At endgame with full BiS gear, all DPS specs land within ±3 % of each other on the
   composite benchmark. No class is "the" M+ class; identity comes from *how* damage is dealt (ST vs AoE vs burst,
   utility, buffs), not *how much*.
2. **The trinity matters.** Content (M+, raid) is tuned for 1 tank, 1 healer, 3 DPS. Tanks and healers are rewarded,
   not punished: faster queue priority, bonus vault/finder rewards.
3. **Composition matters a little.** Each class brings one party buff or debuff (§3) worth ~2–5 %. A full mixed party
   is ~12–18 % stronger than a mono-class party — enough to matter, never enough to exclude a class.
4. **Gear is the long-term ladder, skill is the short-term one.** BiS endgame gear ≈ ×2.0 damage and ×2.2 HP over a
   fresh level-60 character in starter greens; a skilled player with mid gear can still out-DPS a careless BiS player.
5. **Solo-aware roles** (audit finding): the tank/healer damage targets of §5.3 apply only in a party. When the party
   size is 1 (open world, solo keys) tank and healer specs get "Yalnız Kurt": damage ×1.40 (tanks) / ×2.2 (healers,
   bringing them to ~75–85 % of a DPS spec) and healers' overheal converts 30 % into a shield; it drops the moment a
   second player joins. A new character defaults to a DPS spec.
6. **Measured, not guessed.** Balance is maintained by a deterministic headless simulator + auto-tuner (§5) run after
   every content wave; out-of-band specs fail the check.

## 2. Class & spec roster (11 classes, 27 specs)
Every spec is modelled on a current WoW (Midnight) spec — kit, rotation and feel (user: "çoğu karakteri WoW'daki gibi
yap, rotasyonları WoW'a benzet"). Research: docs/ref/wow/*.md. WoW model per spec:
knight_protector = Protection Warrior · knight_blademaster = Arms Warrior · barbarian_butcher = Fury Warrior ·
barbarian_warlord = Guardian Druid (2H berserker tank) · mage_* = Arcane / Fire / Frost Mage · rogue_assassin =
Assassination · rogue_subtlety = Subtlety · rogue_alchemist = custom healer (Discipline-Priest-style "heal by damage") ·
monk_* = Brewmaster / Mistweaver / Windwalker · archer_marksman = Marksmanship Hunter · archer_beastmaster = Beast
Mastery · paladin_* = Protection / Holy / Retribution · necromancer_bone = Blood Death Knight · necromancer_summoner =
Unholy Death Knight · warlock_* = Affliction / Destruction · demonhunter_* = Havoc / Vengeance · evoker_* = Devastation /
Preservation / Augmentation.

| Class (id) | Turkish | Tank | Healer | DPS / Support |
|---|---|---|---|---|
| knight | Şövalye | knight_protector (Koruyucu) | – | knight_blademaster (Kılıç Ustası) |
| barbarian | Barbar | barbarian_warlord (Savaş Lordu) | – | barbarian_butcher (Kasap) |
| mage | Büyücü | – | – | mage_fire (Ateş), mage_frost (Buz), mage_arcane (Gizem) |
| rogue | Haydut | – | rogue_alchemist (Simyacı) | rogue_assassin (Suikastçı), rogue_subtlety (Gölge) **(new)** |
| monk | Keşiş | monk_brewmaster (Demci) | monk_mistweaver (Sis Dokuyan) | monk_windwalker (Rüzgâr Yürüyen) |
| archer | Okçu | – | – | archer_marksman (Nişancı), archer_beastmaster (Av Ustası) |
| paladin | Paladin | paladin_protection (Koruma) | paladin_holy (Kutsal) | paladin_retribution (Ceza) |
| necromancer | Nekromant | necromancer_bone (Kemik Muhafızı) **(override: TANK)** | – | necromancer_summoner (Ordu Efendisi) |
| warlock | Warlock | – | – | warlock_affliction (Azap), warlock_destruction (Yıkım) |
| demonhunter | İblis Avcısı **(new)** | demonhunter_vengeance (İntikam) | – | demonhunter_chaos (Kaos) |
| evoker | Ejderhasoy **(new)** | – | evoker_preservation (Koruyucu Nefes) | evoker_devastation (Yıkım Nefesi), evoker_augmentation (Yüceltme — support DPS) |

Coverage: **6 tanks, 4 healers, 16 DPS + 1 support.** Pure-DPS classes (mage, archer, warlock) are allowed like WoW
("ortalama her sınıfın tank ve dps speci" = most classes are hybrids). Old ids (mage_elementalist, mage_lightbringer)
stay migrated per GDD_TALENTS. The two new classes reuse KayKit rigs (İblis Avcısı = Rogue_Hooded variant with twin
glaives (dual 1H axes/swords), blindfold tint, fel-green VFX, double-jump + glide; Ejderhasoy = Mage variant with
dragon-scale tint, bronze/green/red breath VFX, empowered charge-release spells (hold-to-empower tiers 1–3)).
Signature mechanics: İblis Avcısı — Fury builder/spender, Göz Işını (channel beam), Metamorfoz (90 s major), fast
mobility; Vengeance — Ruh Parçası self-heal, sigils, low armor/high self-sustain tank. Ejderhasoy — Essence (5 pips),
empowered spells, Yüceltme spec buffs the 2 highest-DPS allies (Ebon Might-like) and grants Prescience-style crit to
2 allies; its personal damage is low but attributed buff damage counts toward its benchmark (§5.3).

## 3. Party buffs & debuffs (composition)
One unique contribution per class; identical buffs do not stack (a second copy is wasted, like WoW). Applied
room-wide to the party (radius ∞ inside the same world; refreshed every 10 s while the source lives; owner→all via
`pstatus`). Enemy debuffs are applied on hit by the source and replicated with `estatus`.
| Class | Buff / debuff (TR name) | Effect |
|---|---|---|
| Şövalye | Sancak (Kararlılık) | party +5 % max HP |
| Barbar | Savaş Narası | party +5 % physical damage |
| Büyücü | Gizem Zekası | party +5 % spell damage and +5 % max mana |
| Haydut | Zayıflatıcı Zehir | enemies take +3 % damage from all sources (on hit, 30 s) |
| Keşiş | Mistik Dokunuş | enemies take +5 % physical damage |
| Okçu | Kartal Gözü | party +3 % critical strike chance |
| Paladin | Bağlılık Aurası | party takes 3 % less damage |
| Nekromant | Ölüm Mührü | party +3 % versatility |
| Warlock | Ruh Taşı + Sağlık Taşı | battle resurrection (1 per boss/key 5 min) + party healthstones (heal 25 %, 1 per combat) |
| İblis Avcısı | Kaos Damgası | enemies take +5 % magic damage |
| Ejderhasoy | Bronz Kudret | party +3 % haste |
**Heroism family ("Kurt Narası", 3-min major, `Yorgun` 10 min):** Barbar, Okçu, Büyücü, Ejderhasoy. **Battle res:**
Warlock, Paladin (Kutsal), Ejderhasoy. The Group Finder shows missing buffs as greyed icons (composition hint).

## 4. Stat model (WoW-like layer on top of the existing pipeline)
### 4.1 Primary
Güç (str: plate/melee), Çeviklik (dex: leather/agility), Zeka (int: casters/healers), Dayanıklılık (vit: HP). Each
spec has ONE main stat (`ClassDef.mainStat` per spec); off-stat items still roll but the main stat converts at 1.0 and
the others at 0. Existing damage rule stays: `base *= 1 + mainStat / 100`.
### 4.2 Secondary ratings (new)
Items roll **ratings**: `critRating`, `hasteRating`, `masteryRating`, `versRating` (two per item, budget split 50/50 or
60/40). StatCalc converts rating → % using a level-scaled cost and WoW-style diminishing returns:
```
costPerPct(L) = BASE_COST[stat] * (0.15 + 0.85 * (L / 60) ** 1.5)      // BASE_COST at 60: crit 35, haste 33, mastery 35, vers 40
rawPct = rating / costPerPct(L)
DR bands on rawPct (bonus beyond base): 0–30 % ×1.0 · 30–39 ×0.9 · 39–47 ×0.8 · 47–54 ×0.7 · 54–66 ×0.6 · 66–126 ×0.5
```
- **Kritik** (critChance): +rating% (on top of base 5 % + talents); crit multiplier 1.5 (2.0 only via talents/aspects).
- **Hız / Haste**: +% attack speed, cast speed, resource regen and DoT/HoT tick rate; **GCD = 1.5 s / (1 + haste)**,
  min 0.75 s; LMB chain tempo scales too.
- **Ustalık / Mastery**: spec-specific (table `data/mastery.ts`): e.g. Ateş = +X % ignite, Buz = +X % frozen damage,
  Koruyucu = +X % block/DR, Kutsal = +X % healing on low-HP targets, Yüceltme = +X % buff strength. Coefficient per
  spec so that 1 % mastery ≈ 0.9–1.1 % of throughput.
- **Çok Yönlülük / Versatility**: +vers % damage & healing done, −vers/2 % damage taken.
Tertiary (rare affix slot): **Can Çalma** (leech %), **Kaçınma** (AoE damage taken −%), **Hız** (move speed %).
Existing PoE-style affixes (damagePct, <type>DamagePct, critDamage, …) remain as *special* affixes on magic/rare+
items with a smaller budget share (≤ 25 % of an item's secondary budget). The character sheet shows the WoW groups.
### 4.3 Item level & budget
The existing scale is kept: **item level ≈ monster level** (ItemGen affix tiers use `minItemLevel`, the vault already
uses 63 + 2 × key). `budget(ilvl, slot) = SLOT_MULT[slot] * B0 * 1.022 ** (ilvl - 60)` — ≈ +2.2 % per item level.
Split: main stat 40 %, Dayanıklılık 30 %, two secondary ratings 30 % (special affixes take part of the secondary share).
Calibrate `B0` so a full ilvl-60 green set at level 60 gives ≈ +35 % damage over naked, and full ilvl-96 BiS gives the
×2.0 / ×2.2 targets of §1. Upgrades (+N Metin2) add `+N * 0.6` effective item levels (shown as "(+7) 92 → 96.2").
Character "Eşya Seviyesi" = mean of equipped slots (2H counts twice); show equipped / overall like WoW.
### 4.4 Item level ladder (endgame, level 60) — overrides the ilvl numbers in GDD_PVP_FINDER / GDD_ITEMS_V2
| Source | ilvl |
|---|---|
| Open world greens / quest rewards | 56–62 |
| Normal dungeon | 62 · Kahramanlık 66 · Mitik 0 70 |
| Mitik+ end chest | 68 + 2 × min(L, 12) (+2 → 72, +10 → 88, +12 → 92) |
| Great Vault (dungeon row) | chest ilvl of the n-th best key + 3 (cap 96) |
| Raid Efsun Kalesi | Normal 80 · Kahramanlık 88 · Mitik 96 (+3 for the last two bosses) |
| PvP | Onur set 76 (PvP ilvl 90 in arenas) · Fetih set 86 (PvP ilvl 99 in arenas) |
| Crafted (professions) | 84 base, upgradable to 92 |

## 5. Balance methodology — SimBench + auto-tuner
### 5.1 SimBench (headless, deterministic)
A Node tool (`tools/simbench.mjs`, engine in `src/sim/*`) that reuses the real data and formulas (SKILLS, statuses,
StatCalc, Combat.rollOutgoing/mitigate, talents autoBuild, skill mods) without rendering. Each spec runs an
**APL** (priority list, `src/data/rotations.ts`: ordered entries `{ skill, if?: condition DSL }`, e.g. "use
mage_combustion if ignite_stacks>=3; use mage_fireball") against target dummies with a seeded RNG, 25 iterations.
Gear: a deterministic BiS profile per spec at ilvl 96 (stat weights from a first-pass sim). Talents: autoBuild.
### 5.2 Fight profiles
| Profile | Definition | Weight in composite |
|---|---|---|
| ST "Patchwerk" | 1 target, 300 s, no movement | 0.40 |
| Cleave3 | 3 targets, 120 s | 0.20 |
| AoE8 (M+ pull model) | 6 pulls × 30 s of 8 targets (HP decays as they die), 10 s downtime between pulls | 0.40 |
| Burst20 | first 20 s of ST (reported, not in composite) | – |
### 5.3 Targets & tolerance (endgame BiS, level 60)
- **DPS specs:** composite within **±3 %** of the DPS median; ST within ±7 %; AoE8 within ±10 % (identity allowed).
- **Support (Yüceltme):** personal composite 65 % of median; buff contribution attributed to buffed allies (simulated
  on two median DPS) must bring personal + attributed to **100 % ±3 %**.
- **Tanks:** composite damage 70 % ±5 % of the DPS median; on the tank damage profile (boss melee 1.4 s swings +
  periodic magic + 3 adds) the time-to-die index (with self-healing, active mitigation uptime from the APL) within ±5 %
  across tanks; self-healing share 15–30 % of damage taken.
- **Healers:** HPS on the 5-man M+ profile (tank + party damage stream) within ±5 %; a full 300 s fight must be
  completable with ≥ 5 % mana left at 95 % efficiency; healer damage 30–40 % of the DPS median.
### 5.4 Auto-tuner & regression gate
`tools/simbench.mjs --tune` computes per-spec correction factors (`target / actual`, clamped 0.7–1.3 per pass,
≤ 5 passes) and writes **`src/data/specTuning.ts`** (generated: `SPEC_TUNING[specId] = { dmg, heal, absorb }`),
applied in Combat.rollOutgoing / heal paths as the last multiplier. `--check` exits non-zero if any spec is out of
band (run after every class/talent/item wave; QA reports it). Per-skill outliers (one ability > 45 % of a spec's damage)
are flagged for design review.
### 5.5 In-game tools (Raidbots / Raider.IO style)
- **DPS Simülatörü** panel: runs SimBench in a Web Worker for the local character (current gear/talents) → DPS per
  profile, stat weights, "Üst Eşya" (best combination from bag + equipped), "Yükseltme Karşılaştır".
- **Sıralama** panel (Raider.IO-like): season leaderboards per dungeon and overall by M+ score, with the full
  **roster** (name, class/spec icons, ilvl) per run; filters by class/spec/role/party size; the local character's profile
  (score, best runs per dungeon, timed counts) — also shown in the Group Finder's Mythic+ tab.

## 6. Mythic+ scaling, flow & rewards (overrides GDD_CONTENT §5.4)
- Flow: enter the dungeon on **Mitik** (no timer) → keystone pedestal (Kehanet Taşı) near the start → insert any party
  member's key → 10 s countdown + start barrier → timer. Normal / Kahramanlık / Mitik 0 never use the pedestal.
- **Scaling:** HP and damage ×`1.08^(L−1)` for L ≤ 10 (→ ×2.0 at +10), then ×1.10 per level above 10.
  Fortified: trash +20 % HP, +30 % damage. Tyrannical: bosses +30 % HP, +15 % damage. Seasonal "Kibirli": every 20 %
  forces spawns "Kibir Tecessümü" (elite, 4× trash HP); killing it grants the party +10 % damage and +10 % move speed
  for 60 s.
- **Party size** (P2P allows small parties): enemy HP × {1: 0.45, 2: 0.62, 3: 0.78, 4: 0.89, 5: 1.0}; damage ×0.85 for
  1–2 players. Runs record party size; leaderboards are split solo / duo / party.
- Timer chest +1/+2/+3 at 100 % / 80 % / 60 %; death penalty +15 s; depletion −1 when untimed (never below +2).
- Score per dungeon (best Fortified + best Tyrannical) unchanged (GDD_CONTENT §5.9); rating = sum over dungeons.
- **Great Vault** (WoW-like, ref docs/ref/ui/wow-great-vault.webp): Raid 2/4/6 bosses · Dungeons 1/4/8 runs ·
  World 2/4/8 activities; pick one reward or a currency.

## 7. Leaderboards without a server (P2P gossip)
Every completed run produces a `RunRecord` with a stable hash (dungeon, level, time, affixes, seed, roster sorted).
Peers announce their top-20 runs (compact) in the global lobby room every 60 s and on join; each client merges what it
sees into a local store (`systems/Leaderboard.ts`, localStorage/IndexedDB, dedup by hash, keep top 200 per board).
A run is shown as **"Tanıklı"** when ≥ 2 of its roster announced the same hash, otherwise "Kişisel". Co-op game:
no anti-cheat beyond plausibility checks (time ≥ 40 % of timer, level ≤ 40). Seasons reset boards.

## 8. Progression flow (summary)
Level 1–30 open world (Sisli Vadi) with quests and Metin stones → dungeons Normal at 8/18/30/42 → level 60 →
Kahramanlık → Mitik 0 → first keystone → M+ ladder (+2…) + raid + PvP; weekly Great Vault; ilvl ladder §4.4.

## 9. Implementation packages (Haiku coders; orchestrator verifies with SimBench + Sonnet review)
| # | Owner | Package |
|---|---|---|
| CM1 | core | Contracts: ClassId += demonhunter, evoker; SpecId += demonhunter_chaos, demonhunter_vengeance, evoker_devastation, evoker_preservation, evoker_augmentation; necromancer_bone role → tank; rating stat ids (critRating, hasteRating, masteryRating, versRating, leechRating, avoidanceRating, speedRating) + STAT_INFO TR names; PartyBuffDef, SpecTuning, RunRecord.roster/partySize types; events party:buffs |
| CM2 | items + combat | Rating layer in StatCalc (§4.2 formulas, DR), haste → GCD/tempo/ticks, versatility in damage/heal/taken, data/mastery.ts per spec with hooks in Combat; character sheet groups (panels-items) |
| CM3 | combat | Party buffs/debuffs system (§3) + Group Finder composition hints data |
| CM4 | tools + new src/sim/* | SimBench engine (headless reuse of combat data/formulas), fight profiles §5.2, report table |
| CM5 | combat data | APLs for all 26 specs in src/data/rotations.ts (+ condition DSL) |
| CM6 | tools + combat | Auto-tuner + `--check` gate + generated src/data/specTuning.ts applied as final multiplier |
| CM7 | mythic | §6 scaling, party-size scaling, Kibirli seasonal affix, Great Vault 3×3, in-dungeon pedestal flow |
| CM8 | net + systems | Leaderboard gossip + local store (§7) |
| CM9 | panels-game | DPS Simülatörü panel, Sıralama panel, Raider.IO profile in Group Finder |
| CM10 | design (Sonnet) → combat data (Haiku) | İblis Avcısı + Ejderhasoy full kits (skills, APLs, talents trees, models) |
| CM11 | items | Item budget formula §4.3 + ilvl ladder §4.4 in ItemGen/LootSystem/MythicPlus rewards |
| CM12 | design (Sonnet) → combat data (Haiku, one class per coder) | WoW-faithful kits for all 27 specs per §10 (from docs/ref/wow/*.md) + skill-id migration table so talents keep working |
| CM13 | combat + hud | §10 engine features: target projectiles/instants, proc-gated & proc-instant skills, button replacement, positional "behind" checks, teleport-behind, spell alerts + proc glow on bar icons, spec GCD |
| CM14 | net + systems + town + panels | Pazar (Metin2-style player shops) per §11 |

## 10. WoW-faithful kits, targeting and procs (normative for CM12/CM13)
**Relation to docs/COMBAT_WOW.md (Sonnet, engine layer):** its engine packages CW-01…CW-09, CW-12, CW-15…CW-20 ARE
package CM13 (GCD profiles, 400 ms spell queue, lead-skip, pushback, school lockout, procs + Spell Activation Overlay,
PRD, combat text, ElvUI button states, cast bars, target frame auras). CW-01 also absorbs the CM1 contracts. Its
per-class §3, Appendix B rows for the old kits and CW-10/11/13/14 (old mage/melee kit data) are **superseded by CM12**
(the WoW-model kits); the proc *engine* and the WoW-named procs (Isınıyor/Sıcak Seri, Beyin Donması, Buz Parmağı,
Berrak Zihin, Ani Ölüm…) carry over into the new kits.

### 10.1 Bar layout per spec (LMB chain + 12 slots)
| Slot | Key | Role in the kit | Examples |
|---|---|---|---|
| lmb | Mouse0 | weapon chain — **off-GCD**, our auto-attack analogue (keeps the Elden Ring combo/finisher layer); feeds the spec (resource, or proc chance: Fire crits → Isınıyor, Frost → Buz Parmağı, Fury rage) | chain steps per weapon |
| rmb | Mouse2 | WoW filler / builder (on GCD) | Ateş Topu, Ayaz Oku, Arkan Patlama, Sırttan Bıçak, Ezme, Ölümcül Darbe, Haçlı Vuruşu, Gölge Oku, Canlı Alev |
| q | Q | main spender or proc button | Piroblast (Sıcak Seri), Buz Mızrağı, Arkan Füzeler (Berrak Zihin), Hayat Kesen, Zehir Boşalt, Tapınakçı Hükmü |
| e / r | E R | rotational cooldowns (6–30 s) | Ateş Patlaması, Anka Alevleri, Buz Küresi, Gölge Adımı, Gizli Teknik |
| s1 | 1 | AoE button | Alev Fırtınası, Kar Fırtınası, Arkan Patlayış, Shuriken Fırtınası, Bıçak Yelpazesi |
| s2 | 2 | mobility | Işınlan (Blink), Çekiş, Süzülme |
| s3 | 3 | personal defensive | Buz Kalkanı, Pelerin, Kemik Kalkanı |
| s4 **(new, KeyG)** | G | interrupt / utility | Büyü Kesme, Tekme, Susturma Oku |
| m45 / m90 / m180 | X V T | majors bucketed to 45 s / 90 s / 3 min | Arkan Yükseliş, Yanma (Combustion), Buzlu Damarlar, Gölge Bıçakları |

Rules: 9–12 abilities per spec; WoW cast times ×0.8, WoW cooldowns kept (only majors are bucketed); GCD per
COMBAT_WOW §2.1 (`'arpg'` profile: 1.0 s / speed, floor 0.5 s; `'wow'` profile for A/B); off-GCD: the LMB chain,
mobility, defensives, interrupts, majors and abilities WoW marks off-GCD (Ateş Patlaması, Gölge Adımı…). A spec that
needs one more rotational button uses `replaces` (button transform while a status is up) instead of a new slot.
Dodge is always available. Turkish names keep the WoW flavour so players recognise them. Existing skill
ids are reused where an old skill maps onto a WoW ability (rename + retune); dropped skills stay defined but unslotted,
and talent nodes are re-pointed (tools/talents-check.mjs must pass).

### 10.2 Targeting (soft + hard target already exist in PlayerController)
- Target = hard target (Tab / click) else soft target (60° cone, hysteresis). Every enemy-targeted kit ability uses it.
- New `targeting: 'target_projectile'`: spawned toward the target with homing (turn rate per skill: bolts 5 rad/s,
  Kaos Oku 4, missiles 9). No target → flies straight along the aim. Never blocks the cast (action-RPG rule).
- New `targeting: 'target_instant'`: hits the target if in range + line of sight (Ateş Patlaması, Hayat Kesen). Melee
  ones (range ≤ 5 m) auto-lunge up to 3 m extra; beyond that the cast fails with "Menzil dışında" and the icon is red.
- **Arkan Füzeler (Arcane Missiles)**: channel 2.0 s / (1 + haste), only with Berrak Zihin (Clearcasting) or as a
  weaker hardcast; 5 missiles (one per 0.4 s) alternating left/right hand, each a quadratic Bézier toward the target's
  chest with a random lateral control point, re-aimed at the live target every frame, 22 m/s; violet core + white rim +
  0.4 s ribbon trail; impact = small violet nova + sparks + hit-flash, 30 ms hit-stop, tiny shake only on the last
  missile. Walking allowed at 50 % speed while channelling.
- **Gölge Adımı (Shadowstep)**: off-GCD, enemy or ally target within 25 m, 2 charges / 30 s (research values win),
  teleports to 1.2 m behind the target facing its back; smoke puff at origin and destination, camera lerps 120 ms (no
  hard cut); +70 % move speed 2 s. Destination via NavGrid.resolveCircle, else try ±45°/±90° around the target, else
  fail "Yol yok". Remote peers see a jump, not a slide (Interpolator.SNAP_DIST — done).
- **Positional**: "behind" = angle between the target's facing and (attacker − target) > 110°. Sırttan Bıçak (Backstab)
  and Pusu: +30 % damage and +15 % crit chance from behind (exact rule follows the research file). Enemies face their
  current threat target, so DPS behind a tanked boss is rewarded and frontal cleaves punish standing in front.

### 10.3 Procs, replacement and feedback (the WoW "feel" layer)
- SkillDef (append-only): `requires?: { selfStatus?: StatusId; behind?: boolean; target?: 'enemy' | 'ally' }`,
  `procInstant?: { status: StatusId; consume: boolean }` (e.g. Sıcak Seri makes Piroblast instant + free),
  `replaces?: { skill: string; whileStatus: StatusId }` (button transforms, e.g. Gölge Vuruşu replaces Sırttan Bıçak
  during Gölge Dansı / stealth), `offGcd?: boolean`.
- **Spell alert**: when a proc is gained the bar icon gets an animated golden border (WoW activation overlay), two side
  glyphs flash left/right of the character at screen centre (fade-in 0.15 s, pulse while active) and a short cue sound
  plays; the proc also shows as a buff icon above the player frame.
- Cast bars for the player and the target (target cast bar: interruptible = gold, not = grey with a shield); spell
  queue window 0.4 s (the existing input buffer); interrupts lock the enemy's school for 3 s (ecast.interruptedBy).

## 11. Pazar — Metin2-style player shops (normative for CM14)
User: "Metin2'deki gibi market açıp çarı bırakacaksın, AFK insanlar senin marketinden alacak, para sana gelecek, mapte o
bölgede." Reference look: a crowded square of small stalls with floating title signs above them (docs/ref/ui #9).
- **Where:** the capital's **Pazar Meydanı** (dedicated market district, ~60 stall spots on a grid 2.5 m apart) and a
  smaller market corner (12 spots) in each village plaza. Stalls open only on those spots.
- **Opening:** buy a **Pazar Bohçası** (NPC Tezgâh Ustası); open it on a free spot → window: title (≤ 32 chars), up to
  12 slots (24 with "Büyük Bohça"), each an item or stack with a gold price. Listing fee 1 % of the total and sale tax
  3 % (Pazar Vergisi) are gold sinks. Listed items are locked (not usable / tradeable) until the shop closes.
- **AFK mode:** the character sits beside a wooden stall with a cloth canopy; a floating PSX-style board shows the
  title (canvas text sprite). The client enters **Pazarcı Modu**: rendering throttled to ~2 fps (paused while the tab
  is hidden), audio muted, an overlay with the live sales log. Closing the tab closes the shop — P2P has no server,
  exactly like classic Metin2's online-only shops. On next login the seller sees a sales summary.
- **Visibility across instances:** stalls are announced in the global lobby room on channel `shop` (title, spot, seller
  appearance digest, compact listing; every 30 s + on change). Each client renders announced stalls as lightweight static
  props + a seated seller model in its own copy of the market — no full player sync. Spot = deterministic
  `hash(sellerId) mod spots` with linear probing over the occupied set so all clients agree; only the 40 nearest boards
  render text (LOD), the rest show a blank board.
- **Buying:** walk within 6 m, open the stall (F) → listing window. Buy = the buyer reserves the gold locally and sends
  `shopBuy { txId, sellerId, slot, itemUid, price }` straight to the seller; the seller validates (still listed, same
  price), removes the item, credits gold minus tax, saves, and replies `shopSold { txId, item }`; the buyer adds the item
  and saves. Reject or 10 s timeout → refund. Dedup by txId on both sides. Trust model = co-op (seller authoritative
  over the item, buyer over the gold); plausibility checks only (price ≥ 1, item schema valid).
- **Pazar Arama** (shop search): panel listing every announced item (filters: slot, rarity, stat, efsun, price) with
  "Göster" → a beam over the stall + a map pin; price history per item base from observed listings.
- New net channels: `shop` (lobby announce), `shopBuy`, `shopSold` (peer-to-peer). Town data: Pazar Meydanı district +
  spot grid; NPC Tezgâh Ustası; items Pazar Bohçası / Büyük Bohça.
