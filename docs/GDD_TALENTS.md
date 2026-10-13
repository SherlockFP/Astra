# EFSUN ONLINE – Kadim Zindanlar · GDD: Uzmanlıklar ve Yetenekler (`N` penceresi — WoW × Path of Exile)

> Status: v1.0, implementation-ready. Owner: lead game design. This document is the **batch-5 reconciliation** requested in `docs/ROADMAP.md` ("WoW-style specs + talents on N … **WoW + Path of Exile combined**"). It sits on top of `docs/GDD_V2.md` (roles, specs, majors, runes), `docs/GDD_CLASSES_V2.md` (5 new classes, passive-web sectors) and `docs/GDD_SYSTEMS.md` §3 (the existing 125-node Pasif Ağaç). Where it changes a rule of those documents the change is listed in §0.3 as an `OVERRIDE`.
> Precedence: `ARCHITECTURE.md` > `src/types/*` + stub signatures > this file > `GDD_V2.md` / `GDD_CLASSES_V2.md` (for the rules §0.3 overrides) > `GDD_SYSTEMS.md` / `GDD_LIFE.md`. Checked against the code on 2026-10-13: the game still ships **4 classes, no specs**; `data/talents.ts` has 125 nodes and `Progression` owns the single passive pool; V2 and CLASSES_V2 are not implemented yet, so every id below that belongs to them is a design target (the plan in §7 states which V2/CLASSES_V2 packages it consumes).
> Audience: the module owners of §7 (items, combat, panels-game, hud, vfx-audio, core, scenes). All **player-facing strings are Turkish**; ids, code and prose are English; stat ids are the existing camelCase `StatId`s plus the NEW ones of V2/CLASSES_V2 and the one this file adds (`skillMasteryPct`).
> Machine-readable companions (generated from the same data as the tables below; **if a table and a JSON disagree, the JSON is the source the Haiku packages copy from, and the discrepancy is a bug to report**): `docs/GDD_TALENTS.trees.json` (30 trees · 729 authored rows · 27 skills × 6 specialisation options = 162 rows · palette values) and `docs/GDD_TALENTS.web.json` (the golden 306-node passive web). The headless validator of §7 (`tools/talents-check.mjs`) must reproduce/verify both.
> Numbers are initial tuning values and belong in data tables, never in logic. Percent notation, "DAHA FAZLA" (= separate multiplicative factor) and rounding follow GDD_SYSTEMS §0.

## Table of contents

0. Vision, decisions, conventions, overrides
1. Final spec list — 21 specs for 9 classes (mage reconciliation, healer decision, new rows, class utilities, migration)
2. WoW layer on `N` — spec choice, class tree + spec tree (30 + 30 nodes), node types, gates, effect DSL, loadouts, import/export, respec, all 30 trees
3. PoE layer on `N` — the 306-node wheel, 9 class starts, generator recipe, clusters, masteries, jewel sockets, passive points, Pişmanlık Küresi
4. Bridge — Beceri Uzmanlıkları (per-skill specialisation), how it relates to support runes
5. UI — the `N` window, tabs, zoom/pan, search, tooltips, staging ("Değişiklikleri Uygula"), respec flow, visuals, keys
6. Balance rules — power budget per point, ledger, caps, interaction with gear / ilvl, validators
7. IMPLEMENTATION PLAN — Haiku packages, waves, file ownership, acceptance checks
Appendix A. Type / data sketches · B. Events and flags · C. Save fields and migration · D. Effect-DSL reference · E. Verification checklist · F. Open questions · G. Reference DSL parser · H. Reference build-string codec / autoBuild

---

## 0. Vision, decisions, conventions, overrides

### 0.1 What the player gets

Press **N**: **one window, three tabs**.

1. **Uzmanlık & Yetenekler** (WoW layer, from **level 10**): pick one of 2–3 specs of your class (switchable in towns / villages), then spend **Sınıf Puanı** in the shared **class tree** and **Uzmanlık Puanı** in the **spec tree** of the active spec — Dragonflight-style 30-node trees with ranks, A|B choice nodes, skill-unlock nodes, gates ("bu sıradan sonrası için ağaçta N puan harca") and capstones. Named loadouts, import/export string, Önerilen (recommended) build.
2. **Pasif Ağaç** (PoE layer, from **level 2**): the existing shared constellation grown from 125 to **306 nodes**: 9 class starts on a wheel, small/notable/keystone nodes, 14 **masteries** (pick 1 of 3 effects), 9 **jewel sockets**, three outer **clusters** that give the V2 stats (guard, flasks, weakness, runes) a home. **Pasif Puan** from levels + quests + milestones; refunds with **Pişmanlık Küresi**.
3. **Beceri Uzmanlıkları** (Last-Epoch bridge): each class's three signature skills gain three tiers of A|B **form changes** (split / return / orbit / echo / element conversion / charges instead of cooldown …) unlocked by *using the skill* (Ustalık), not by spending points.

The three layers use **separate currencies** (Sınıf/Uzmanlık Puanı · Pasif Puan · Ustalık) so no layer can starve another; all three are priced on the same Budget-Point scale as gear (§6).

### 0.2 Decision summary (the answers to the brief)

| # | Question | Decision | Why (one line) |
|---|---|---|---|
| D1 | How many specs? | **21** (§1.2): knight 2, barbarian 2, **mage 3**, rogue 2, **monk 3**, archer 2, **paladin 3**, necromancer 2, warlock 2 | every class 2–3 as asked; the 18 designed V2 / CLASSES_V2 specs that survive keep their ids (20 designed − 2 retired + 3 new = 21) |
| D2 | Mage? | `mage_elementalist` is **split** into **Ateş** `mage_fire` and **Buz** `mage_frost`; **Gizem** `mage_arcane` is new; all three are DPS and share `m180 mage_time_warp` | WoW parity; the hybrid-only "Termal Şok" is retired, cross-element play lives on in the class trait Element Dengesi and in choice nodes (§1.1) |
| D3 | V2's healer `mage_lightbringer`? | **Retired** (not a 4th spec). Its healer role is already covered by Kutsal (Paladin), Simyacı (Haydut) and Sis Dokuyan (Keşiş) | a 4th mage spec breaks "2–3 per class"; `paladin_holy` already implements the same Taşan Şifa / Işık Oku kit (§1.1) |
| D4 | Trinity? | 4 tank specs, 3 healer specs, 14 DPS specs (§1.7); a 5-man needs 1 tank spec + 1 healer spec from different classes — 10 valid different-class pairs | unchanged promise of V2 |
| D5 | Where do spec skills come from? | Spec **core** (passive + 1st skill(s) + `m45`) is free at the L10 choice; the *second* skill of tank/DPS specs (and one optional skill of healers) is an **A node** (`s05`); healers keep V2's heal schedule by level; `m90` stays level-gated (L20) | gives the tree real "buy a button" decisions without breaking V2 |
| D6 | Point pools | Sınıf Puanı: 25 (even levels 12–60) · Uzmanlık Puanı: 25 (odd levels 11–59) · Pasif Puan: **89** (59 levels + 30 milestone points, was 70) | 50 WoW points at L60 split 25/25; PoE web gets the extra milestone points because it grew 2.5× |
| D7 | Tree shape | One shared 30-slot **TREE30** layout for all 30 trees: 12 palette-stat nodes (2 ranks), 5 A / B choices, 7–9 skill-mod nodes, 1–3 skill-unlock nodes, 3 capstones | one UI, one parser, 30 trees of content; capacity 42 points vs 25 spendable ⇒ ~60 % filled (Dragonflight ≈ 60 %) |
| D8 | Effects | **One effect DSL** (§2.5, Appendix D): `S` stats · `M` skill mods · `T` triggered procs · `G` skill grants · `X` bespoke specials — implemented once (`combat/skillMods.ts`, `combat/Procs.ts`), data never needs new code | 729 authored rows cannot each have a code path |
| D9 | PoE web | Keep the 125 nodes **byte-identical**; add 5 class sectors (CLASSES_V2 §12 generator), 3 clusters, 14 masteries, 9 sockets = **306 nodes** (§3.1) | save compatibility, reuse of the sector generator |
| D10 | Bridge model | **Beceri Uzmanlıkları** = qualitative **form** changes, unlocked by skill mastery. **Support runes** (V2 §4.1) stay the quantitative **numbers** layer. They share no verbs (banned-verb list §4.3) | LE-style depth without duplicating PoE supports |
| D11 | Staging | Everything is staged in a draft and applied with **"Değişiklikleri Uygula"** (web *additions* auto-apply after 1.5 s by default to keep today's feel); WoW-layer *additions* may be applied anywhere out of combat, *removals / spec / loadout changes* only in a rest zone | WoW feel + a respec cost that still matters |
| D12 | Respec costs | WoW removals `8 × level` gold per removed point (cap `250 × level`, first Apply with removals free); PoE: **Pişmanlık Küresi** per node, or gold `25 × level` (existing); spec switch and loadout load are free | exploring a new build costs, hopping between known builds does not |
| D13 | Balance | Node price table (§6.1), ledger (§6.2), 1 global knob `TALENT_POWER` + per-layer knobs; **headless budget validator** is part of the data build | the trees must not outgrow gear |
| D14 | Content delivery | Trees, skill specs and web additions are delivered as **JSON → generated TS** (one package), not hand-typed per class | removes transcription errors from 729 rows |

### 0.3 OVERRIDE list (this document changes a rule of another document)

| # | Source rule | New rule | Owner of the change |
|---|---|---|---|
| OT1 | GDD_V2 §0.1/§1.1: 8 specs incl. `mage_elementalist`, `mage_lightbringer` | 21 specs; `mage_elementalist` → `mage_fire` / `mage_frost`; `mage_lightbringer` retired; new `mage_arcane`; `monk_mistweaver` promoted from "wave 2" to a **listed** spec (its tree is authored; kit rows still wave 2) | combat (`data/specs.ts`), items (migration) |
| OT2 | GDD_V2 §1.1 + CLASSES_V2 §1.3: spec skills unlock by level (L10/L12/L15/L20) | core skills at L10; later spec skills are **tree A nodes** (§1.5 table); `m45` L10 and `m90` L20 unchanged | combat (`Progression.unlockedSkills`, `SpecDef.treeSkills`) |
| OT3 | GDD_V2 §2: `m180` only on 4 specs (Kılıç Ustası, Kasap, Elementalist, Simyacı) | `mage_time_warp` belongs to **all three** mage specs (class-wide); the other three owners are unchanged | combat |
| OT4 | GDD_SYSTEMS §3.1: 70 passive points | **89**: 59 (levels 2–60) + 6 (Kadim Bilgelik) + 8 (zindan fethi) + 6 (bölge kaşifi) + 5 (M+ rating) + 5 (raid ilk ölüm) | items (`Progression`) |
| OT5 | GDD_SYSTEMS §3.1 refunds: 25 × level gold per node / 1,000 × level full reset | kept as the **gold** path; **Pişmanlık Küresi** (§3.8) is the cheap precise path | items, panels-game (`trainer`) |
| OT6 | GDD_V2 §11.3: spec selection in `trainer` and `skills` tab "Uzmanlık" | the spec is chosen and switched **in `N`** (tab 1); the `trainer` keeps PoE gold refunds and deep-links to `N`; `skills` (K) tab "Uzmanlık" becomes a read-only summary with an "N'de aç" button | panels-game, panels-items |
| OT7 | CLASSES_V2 §12.4 "spec talent hooks (seeds)" | superseded: every hook is a node of §2.10 (windwalker hooks → `monk_windwalker` s02/s09/s12…, etc.) | – |
| OT8 | GDD_V2 §6 tier sets (8) | 21 specs ⇒ the 8 V2 sets are re-bound (§1.6): `Elementlerin Efendisi` → three mage variants, `Şafak Habercisi` → `paladin_holy`; the other 13 specs get sets in a later content pass | items (`data/tierSets.ts`) |
| OT9 | `data/talents.ts` `TalentNode.kind: 'start'\|'small'\|'notable'\|'keystone'` | adds `'mastery'` and `'socket'`, optional `fx` / `choices` (§3.2) | items |

### 0.4 Naming and ids

| Thing | Rule |
|---|---|
| Spec ids | `SpecId = '<classId>_<name>'` as in §1.2 (V2 convention) |
| Tree ids | `class:<classId>` and `spec:<specId>` (`TreeDef.id`) |
| Slot ids | `s01 … s30` (`SlotId`), the same 30 slots in every tree (§2.2) |
| Node ids (runtime) | `<treeId>/<slot>` (e.g. `spec:mage_fire/s05`); choice option suffix `#A` / `#B` (e.g. `class:knight/s02#B`) |
| Passive web ids | existing ids untouched; new: `<prefix>_start`, `_p1`, `_a1.._a7`, `_m1.._m8`, `_b1.._b7` (CLASSES_V2 §12.1), `n_*` notables, `ks_*` keystones, `cl_kn_*`, `cl_bb_*`, `cl_rg_*` clusters, `ms_*` masteries, `sk_*` sockets |
| Bespoke special ids | `trait_pyromancer`, `trait_cryomancer`, `trait_arcanist`, `trait_brewmaster`, `trait_summoner` (the only ones the `X` rows touch; Appendix D) |
| New `StatId` | `skillMasteryPct` (Ustalık Kazancı, inc) — everything else already exists in code or V2/CLASSES_V2 |
| New `PipId` | `arcane` (Gizem Yükü, max 4, `#b78cff`) |
| New `StatusId`s (13) | `hot_streak fingers_of_frost touch_of_magi arcane_surge blazing_barrier intercept_ward guardian_vow karma_ward spirit_walk feign_death cloak_ward resolve_pact ice_block` — each needs a `StatusDef` (§1.3.3, §1.4) |
| New `InputAction` | none (`talents` = N already exists) |
| Currency ids | `orb_regret` (Pişmanlık Küresi), `jewel_*` items (§3.7) |

---

## 1. Final spec list — 21 specs for 9 classes

### 1.1 Reconciliation decisions

**Mage.** WoW's mage is three damage specs; V2 had a fire/frost hybrid (Elementalist) and a healer (Işık Çağıran). Both are replaced:

* **Ateş (`mage_fire`)**, **Buz (`mage_frost`)**, **Gizem (`mage_arcane`)** — each owns one resource-style mechanic (Sıcak Seri, Buz Parmakları, Gizem Yükü), two spec skills, two majors, and a different shape of the same eight core skills.
* **Termal Şok** (V2's Elementalist signature: fire on chilled / frost on burning = +40 % DAHA FAZLA + steam burst) belonged to the hybrid and is **not carried over**. What remains of the idea: the class trait `trait_elemental_balance` (Element Dengesi, unchanged), the class-tree choice `class:mage/s30 A "Elementalist"` (+15 % fire and frost damage) and the cross-element choice nodes `mage_fire/s26 A "Kızıl Ahenk"` and `mage_frost/s26 A "Soğuk Ahenk"` (the next spell of the other element +15 % for 4 s).
* **Işık Çağıran is retired, not renamed.** Justification: (1) "every class 2–3 specs" forbids a 4th mage spec; (2) its rows are a copy of the healer kit that CLASSES_V2 §4.5 already specifies in full for `paladin_holy` (Işık Oku `heal_bolt`, Taşan Şifa `overheal_ward`, single heal, burst heal, cleanse, party major) and that V2 §1.3.8 specifies for `rogue_alchemist`; the healing framework (V2 WP5: `combat/healing.ts`, smart targeting, `healAlly`) is therefore fully exercised by Kutsal + Simyacı + Sis Dokuyan without any mage row; (3) V2's `mage_light_bolt / mage_mend / mage_renew / mage_radiant_pulse / mage_purify / mage_divine_clarity / mage_dawn_resurgence` rows are **dropped from V2 WP5** (5 skills + 2 majors + 1 tier set less to build). If a caster healer is wanted later it comes back as a Dragonflight-style **hero path** (post-launch, see §F).

**Everyone else keeps V2 / CLASSES_V2 exactly** (ids, passives, majors, bars, the healers' full unlock schedule). The only structural change: the **second spec skill** of every tank and DPS spec (V2's L15 unlock) and **one optional skill** of every healer (Şafak Işığı, Duman Siperi, Canlandır) become the **A node `s05`** of the spec tree (§1.5) — reachable with the 2nd Uzmanlık Puanı (the first arrives at L11, the second at L13).

**Trinity.** Tanks: `knight_protector`, `barbarian_warlord`, `monk_brewmaster`, `paladin_protection`. Healers: `paladin_holy`, `rogue_alchemist`, `monk_mistweaver` (kit = wave 2). DPS: 14. A party of five always has several valid compositions (§1.7); solo play stays viable exactly as V2 §1.1 describes.

### 1.2 The 21 specs

Columns: **Çekirdek** = granted free by level, exactly V2's schedule (L10 for the first skills, healers' later heals at L12 / L15 / L20), plus the spec passive `trait_*`; **Ağaç becerileri** = `G` nodes in the spec tree (slot); majors `m45` L10 / `m90` L20 / `m180` L30 (owner specs only). Source: spec numbers and skill rows are in GDD_V2 §1.3 / §2.2 and GDD_CLASSES_V2 §2.5 / §3.5 / §4.5 / §5.5 / §6.5 unless marked **NEW** (§1.3).

| # | Spec id | TR | Rol | Kimlik (one line) | Anahtar mekanik | Çekirdek (L10) | Ağaç becerileri (A düğümleri) | m45 · m90 · m180 |
|--:|---|---|:-:|---|---|---|---|---|
| 1 | `knight_protector` | Koruyucu | Tank | Kalkan Kaldır + Yemin Siperi ile aktif azaltma, tehdit ×3 | `trait_protector`: blok uptime ≈ %65, Son Savunma (90 sn) | `knight_provoke`, `knight_shield_block` | s05 `knight_ward_of_oath` | `knight_unbroken_bastion` · `knight_oath_aegis` · – |
| 2 | `knight_blademaster` | Kılıç Ustası | DPS | Adalet Puanı biriktirip Karar Darbesi ile bitirir | `trait_blademaster`: Adalet 0–5 | `knight_templar_verdict` | s05 `knight_wake_of_flames` | `knight_zeal` · `knight_wings_of_judgment` · `knight_heroism_call` |
| 3 | `barbarian_warlord` | Savaş Lordu | Tank | Öfke zırhı: hasar aldıkça güçlenir, Demir Duruş + Kan Zırhı | `trait_warlord`: −%0.25 hasar / Öfke | `barbarian_provoke`, `barbarian_iron_stance` | s05 `barbarian_blood_shield` | `barbarian_last_stand` · `barbarian_rallying_roar` · – |
| 4 | `barbarian_butcher` | Kasap | DPS | Kanama yığınları (8) + İdam | `trait_butcher`: yığın sınırı 8, İdam < %35 | `barbarian_rend` | s05 `barbarian_execute` | `barbarian_bloodbath` · `barbarian_carnage` · `barbarian_wolf_howl` |
| 5 | `mage_fire` **NEW** | Ateş Büyücüsü | DPS | Art arda kritiklerle Sıcak Seri kurar, yanmayı sürüye yayar | `trait_pyromancer`: 2 ateş kritiği → Sıcak Seri (8 sn, anında + bedava Alev Dalgası / Meteor / Anka) | `mage_flame_wave` | s05 `mage_phoenix_flames` | `mage_blazing_barrier` · `mage_combustion` · `mage_time_warp` |
| 6 | `mage_frost` **NEW** | Buz Büyücüsü | DPS | Buz Parmakları ile donmuş sayılan Buz Mızrakları, alan kontrolü | `trait_cryomancer`: buz vuruşu %15 → Buz Parmağı (maks. 2) | `mage_ice_lance` | s05 `mage_flurry` | `mage_icy_veins` · `mage_frozen_orb` · `mage_time_warp` |
| 7 | `mage_arcane` **NEW** | Gizem Ustası | DPS | Gizem Yükü ve mana hâkimiyeti: yükle, harca, patlat | `trait_arcanist`: Gizem Yükü 0–4 (+%12 hasar, +%25 mana maliyeti / yük) | `mage_arcane_blast` | s05 `mage_arcane_barrage` | `mage_touch_of_magi` · `mage_arcane_surge` · `mage_time_warp` |
| 8 | `rogue_assassin` | Suikastçı | DPS | Pusu açılışları, Arkadan Vuruş, Kombo, Gölge Dansı | `trait_assassin`: pusu +%80 | `rogue_backstab` | s05 `rogue_garrote` | `rogue_shadow_blades` · `rogue_shadow_dance` · – |
| 9 | `rogue_alchemist` | Simyacı | Şifacı | Seyyar şifacı: şişe bombaları, Karışım Puanı | `trait_alchemist`: Taşan Şifa = momentum | `rogue_vial_throw` (temel), `rogue_vial_heal`; L15 `rogue_antidote`; L20 `rogue_mending_draught` | s05 `rogue_smoke_ward` | `rogue_elixir_of_life` · `rogue_miracle_brew` · `rogue_haste_elixir` |
| 10 | `monk_brewmaster` | Demci | Tank | Ertelenmiş hasar: Sarsma havuzu | `trait_brewmaster`: %40 emilim, havuz eritme | `monk_provoke`, `monk_keg_smash` | s05 `monk_purifying_brew` | `monk_bm_fortifying_brew` · `monk_bm_black_ox` · – |
| 11 | `monk_windwalker` | Rüzgâr Yürüyen | DPS | Çi harcama zincirleri, hiç durmayan yumruk | `trait_windwalker`: Kombo Kırıcı %12 | `monk_rising_sun_kick` | s05 `monk_whirling_dragon` | `monk_ww_tigers_fury` · `monk_ww_storm_earth_fire` · – |
| 12 | `monk_mistweaver` | Sis Dokuyan | Şifacı | Sis HoT'ları, Çi, tekme-şifa sızıntısı (**kit wave 2**) | `trait_mistweaver`: Sis Sızıntısı %40 | `monk_mw_soothing_mist`, `monk_mw_renewing_mist`; L12 `monk_mw_detox`; L15 `monk_mw_enveloping_mist` | s05 `monk_mw_vivify` | `monk_mw_thunder_tea` · `monk_mw_revival` · – |
| 13 | `archer_marksman` | Nişancı | DPS | Tek ok, tek hedef; dolu çekiş, infaz | `trait_marksman`: çekiş +%30 hızlı | `archer_rapid_fire` | s05 `archer_kill_shot` | `archer_ms_deadeye` · `archer_ms_trueshot` · – |
| 14 | `archer_beastmaster` | Av Ustası | DPS | Sürünün lideri: yoldaş + zehir | `trait_beastmaster`: yoldaş ısırığı kanatır, Ayı seçimi L20 | `archer_kill_command` | s05 `archer_serpent_sting` | `archer_bm_bestial_wrath` · `archer_bm_pack_hunt` · – |
| 15 | `paladin_protection` | Koruma | Tank | Doğruluk Kalkanı, Kutsal Güç, aura | `trait_protection`: blokta %20 +1 KG, parry yansıtır | `paladin_reckoning`, `paladin_shield_of_righteous` | s05 `paladin_blessed_hammer` | `paladin_prot_bulwark` · `paladin_prot_ardent` · – |
| 16 | `paladin_holy` | Kutsal | Şifacı | Işık Oku, Kutsal Şok, Taşan Şifa, aura | `trait_holy`: overheal → %40 kalkan | `paladin_holy_shock`, `paladin_flash_of_light`; L12 `paladin_cleanse`; L15 `paladin_word_of_glory` | s05 `paladin_light_of_dawn` | `paladin_holy_aura_mastery` · `paladin_holy_sanctuary` · – |
| 17 | `paladin_retribution` | Ceza | DPS | Hüküm / aura güçlendiren destek-DPS | `trait_retribution`: aura +%25 güçlü | `paladin_divine_storm` | s05 `paladin_hammer_of_wrath` | `paladin_ret_crusade` · `paladin_ret_execution` · – |
| 18 | `necromancer_summoner` | Ordu Efendisi | DPS | Ölüler emrinde: iskelet + golem + ordu | `trait_summoner`: iskelet sınırı +2 | `necro_golem` | s05 `necro_command_army` | `necro_sm_frenzy` · `necro_sm_bone_knights` · – |
| 19 | `necromancer_bone` | Kemik Ustası | DPS | Kemiğin hükmü: kanal + Kan Dalgası | `trait_bone`: mızrak +1 delme, Zırh 3 | `necro_bone_storm` | s05 `necro_blood_surge` | `necro_bn_bone_spirit` · `necro_bn_lich_form` · – |
| 20 | `warlock_affliction` | Azap | DPS | Zaman senin silahın: DoT zincirleri | `trait_affliction`: DoT kritik %50 | `warlock_unstable_affliction` | s05 `warlock_seed_of_corruption` | `warlock_af_dark_soul` · `warlock_af_pandemic` · – |
| 21 | `warlock_destruction` | Yıkım | DPS | Her şeyi yak: patlama ve Kaos | `trait_destruction`: ateş kritiği → Ruh Parçası | `warlock_immolate` | s05 `warlock_chaos_bolt` | `warlock_ds_havoc` · `warlock_ds_cataclysm` · – |

Canonical orders (used by the import/export strings §2.7 and `SPEC_ORDER`): `CLASS_ORDER = knight, barbarian, mage, rogue, monk, archer, paladin, necromancer, warlock`; `SPEC_ORDER` = the table order above (index 0–20).

### 1.3 The three new mage specs in full

#### 1.3.1 `SpecDef` data (V2 `SpecDef` shape + one new field)

`SpecDef` gains one optional field: **`treeSkills?: Record<skillId, SlotId>`** — skills that are not granted at L10 but by the named A node of the spec tree (`Progression.unlockedSkills` merges `SpecDef.skills` (core) with `G.talents.grantedSkills()`). `unlock` lists core skills only (level 10).

```ts
{ id: 'mage_fire', classId: 'mage', name: 'Ateş Büyücüsü', role: 'dps',
  desc: 'Art arda kritiklerle Sıcak Seri kurar; yanmayı sürüye yayar.',
  stats: { fireDamagePct: 0.20, critChance: 0.06, castSpeed: 0.05, burnChance: 0.25 },
  specials: [{ id: 'trait_pyromancer', params: { streakCrits: 2, streakDur: 8, streakIcd: 0, streakCrit: 0.25, burnCrit: 0.5 },
    desc: 'Art arda 2 ateş kritiği 8 sn Sıcak Seri verir: sonraki Alev Dalgası, Meteor ve Anka Alevleri anında dökülür, mana harcamaz ve +%25 kritik şansı alır. Yanma tikleri kritik yapabilir (kritik şansının %50\'si).' }],
  skills: ['mage_flame_wave'], unlock: { mage_flame_wave: 10 }, treeSkills: { mage_phoenix_flames: 's05' },
  majors: { m45: 'mage_blazing_barrier', m90: 'mage_combustion', m180: 'mage_time_warp' },
  mods: [ { skill: 'mage_basic', patch: { name: 'Ateş Oku' } } ],                         // V2 SpecDef.mods: display patch only
  fx: 'M mage_basic cv=fire:1 ;; M mage_fireball dotx=1.4 ;; M mage_blink cd=-1',             // numeric changes use the effect DSL (§2.5): chain turns fire, burn 50 % -> 70 %, Işınlanma 5 -> 4 s
  defaultBar: { lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_flame_wave',
    s3: 'mage_phoenix_flames', r: 'mage_arcane_cataclysm', m45: 'mage_blazing_barrier', m90: 'mage_combustion', m180: 'mage_time_warp' } }  // bench: blizzard, arcane_orb, mana_barrier

{ id: 'mage_frost', classId: 'mage', name: 'Buz Büyücüsü', role: 'dps',
  desc: 'Buz Parmakları ile Buz Mızraklarını kırar; alanı dondurur ve yavaşlatır.',
  stats: { frostDamagePct: 0.20, chilledDamagePct: 0.15, castSpeed: 0.08, ccDurationPct: 0.15 },
  specials: [{ id: 'trait_cryomancer', params: { fofChance: 0.15, fofMax: 2, fofDur: 15, fofCrit: 0.5 },
    desc: 'Buz vuruşları %15 şansla Buz Parmağı verir (en fazla 2, 15 sn): sonraki Buz Mızrağı hedefi Donmuş sayar (×3, parçalanma) ve +%50 kritik şansı alır. Buz Halkası donduran her düşman bir Buz Parmağı verir.' }],
  skills: ['mage_ice_lance'], unlock: { mage_ice_lance: 10 }, treeSkills: { mage_flurry: 's05' },
  majors: { m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp' },
  mods: [ { skill: 'mage_basic', patch: { name: 'Buz Oku' } } ],
  fx: 'M mage_basic cv=frost:1 ;; M mage_frost_nova cd=-1 ;; M mage_blizzard st=chill:3:2 ;; M mage_blink cd=-1',
  defaultBar: { lmb: 'mage_basic', rmb: 'mage_ice_lance', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_flurry', s2: 'mage_blizzard',
    s3: 'mage_mana_barrier', r: 'mage_arcane_cataclysm', m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp' } }  // bench: fireball, meteor, arcane_orb

{ id: 'mage_arcane', classId: 'mage', name: 'Gizem Ustası', role: 'dps',
  desc: 'Gizem Yükü biriktirir, manayı silaha çevirir; yükle, harca, patlat.',
  stats: { arcaneDamagePct: 0.20, resourceRegenPct: 0.30, castSpeed: 0.05, maxResource: 20 },
  specials: [{ id: 'trait_arcanist', params: { chargeMax: 4, chargeDmg: 0.12, chargeCost: 0.25, manaFloor: 0.4, manaSlope: 0.003, chargeDecay: 5, chargeDecayDelay: 8 },
    desc: 'Gizem Yükü (0–4): her yük gizem hasarını %12 artırır, gizem büyülerinin mana maliyetini %25 artırır. Manan %40\'ın üzerinde her %1 için gizem hasarı +%0.3 (tam manada +%18). Yükler 8 sn savaş dışı kalınca 5 sn\'de bir azalır.' }],
  skills: ['mage_arcane_blast'], unlock: { mage_arcane_blast: 10 }, treeSkills: { mage_arcane_barrage: 's05' },
  majors: { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp' },
  mods: [],
  fx: 'M mage_arcane_orb dmgx=1.2 ;; M mage_blink cd=-1',
  defaultBar: { lmb: 'mage_basic', rmb: 'mage_arcane_blast', q: 'mage_arcane_barrage', e: 'mage_blink', s1: 'mage_arcane_orb', s2: 'mage_mana_barrier',
    s3: 'mage_frost_nova', r: 'mage_arcane_cataclysm', m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp' } }  // bench: fireball, meteor, blizzard
```

`SpecDef` therefore gains a second optional field, **`fx?: string`** — spec-level numeric skill changes written in the same effect DSL as the trees (applied by `combat/skillMods.ts` before talents and runes, §4.4). `cv=fire:1` converts the whole `mage_basic` chain (steps 1–3) to fire and swaps its projectile vfx (the `element` param convention of `SkillSystem` already maps 1 fire / 2 frost / 3 arcane). The new pip `arcane` is added to `PipDef` (`name 'Gizem Yükü', max 4, color '#b78cff', decay { after 8, every 5 }`).

#### 1.3.2 Mechanics in play terms

| Spec | Opener | Core loop | Burst window | What the tree changes |
|---|---|---|---|---|
| Ateş | `Ateş Topu` (burn) → `Alev Dalgası` | fire hits crit twice in a row → **Sıcak Seri** → instant free `Meteor` / `Alev Dalgası` / `Anka Alevleri`; `Anka Alevleri` bounces to burning targets and spreads burn | `Yanış` (always crit) + Sıcak Seri chain; `Alev Bariyeri` is the defensive 45 s | Sıcak Seri duration / crit threshold (s02), burn spread (s17B), phoenix bounces (s11) |
| Buz | `Buz Halkası` (freeze) → `Buz Mızrağı` on frozen (×3) | `Dondurucu Sağanak` (3 chill bolts, 25 % Parmak each) → Parmakla `Buz Mızrağı` (shatter) | `Ayaz Damarları` + `Donmuş Küre` (6 pulses, 25 % Parmak per pulse) | Parmak chance / cap (s02), shatter bursts (s11), Kış Kralı (s30B) |
| Gizem | `Gizem Patlaması` ×4 (builder, +1 yük) | Blast ×4 → `Gizem Barajı` spends all charges (1.8 + 0.9 per charge, 4 charges = 5.4) and refunds 2 mana per charge; mana kept > 70 % | `Büyücü Dokunuşu` (stores 25 % of damage, detonates) then `Gizem Dalgalanması` (+30 % arcane, mana ×3, Blast −50 %) | charge cap (s02A), mana slope (s02B), Baraj echo (s27) |

#### 1.3.3 New `SkillDef` rows (mage) — copy-paste ready, `data/skills_mage_specs.ts`

Columns follow CLASSES_V2 §0.3 (Mal cost · BS cooldown · Dök cast · Hedef · Hasar · Durum · Anim ×speed @hit · VFX/SFX · Etiket · params). New VFX ids marked **(N)** alias an existing preset until the vfx owner builds them (CLASSES_V2 §11 rule).

| id | Ad | Spec · Nasıl açılır | Mal | BS | Dök | Hedef | Hasar | Durum | Anim ×speed @hit | VFX / SFX | Etiket | params |
|---|---|---|---|---:|---|---|---|---|---|---|---|---|
| `mage_phoenix_flames` | Anka Alevleri | Ateş · A düğümü `s05` | 20 | 9 (c2) | 0 | proj v30 R26 r0.4 ×1 p0, `custom:bounce_projectile` | 1.9 fire; sekmeler ×0.85 | burn40%/3 s; sekme: en yakın **yanan** düşman ≤ 6 m, en çok 2× | `Spellcast_Shoot` ×1.4 @0.373 | p `fire_projectile` scale 0.9 · i `fire_burst` scale 0.4 · sc `fire_cast` si `fire_impact` | spell projectile fire | `bounces 2 bounceRange 6 bounceMult 0.85 element 1 end 0.65 chain 0.08 move 0.15 stagger 5 proc 0.8 weight 0 upper 1 slow 0.4` |
| `mage_flurry` | Dondurucu Sağanak | Buz · A düğümü `s05` | 22 | 10 | 0 (3 × 0.18 s) | proj v38 R26 r0.3 ×3 sıralı, `custom:burst_shot` | 0.8 frost × 3 (2.4) | her ok `chill` 1 yığın; her ok %25 Buz Parmağı | `Spellcast_Shoot` ×2.0 @0.2 (×3) | p `frost_projectile` · i `frost_burst` scale 0.3 · sc `ice_cast` si `ice_impact` | spell projectile frost | `burst 3 gap 0.18 element 2 end 0.9 chain 0.1 move 0.2 stagger 2 proc 0.5 weight 0 upper 1 slow 0.4` |
| `mage_arcane_blast` | Gizem Patlaması | Gizem · çekirdek L10 | 18 (+%25 / yük) | 0 | c0.9 (÷ castRate) | proj v32 R26 r0.45 ×1 p0 | 2.4 arcane | +1 Gizem Yükü (max 4) | `Spellcast_Shoot` ×1.1 @0.373 | p `arcane_projectile` scale 1.2 · i `arcane_burst` · sc `spell_cast` si `arcane_impact` | spell projectile arcane builder | `pip arcane gain 1 element 3 end 0.7 chain 0.1 move 0.2 stagger 6 proc 1 weight 4 upper 0` |
| `mage_arcane_barrage` | Gizem Barajı | Gizem · A düğümü `s05` | 12 | 3 | 0 | proj v45 R30 r0.4 + patlama r3 | 1.8 + 0.9 / harcanan yük arcane (4 yük = 5.4) | tüm yükleri harcar; yük başına +2 mana iade | `Spellcast_Shoot` ×1.5 @0.373 | p `arcane_projectile` i `arcane_burst` scale 0.7 · sc `spell_cast` si `arcane_impact` | spell projectile arcane spender | `pip arcane consume all coefPerPip 0.9 refundPerPip 2 element 3 explode 3 end 0.65 chain 0.08 move 0.15 stagger 8 proc 1 weight 2` |
| `mage_blazing_barrier` | Alev Bariyeri | Ateş · `m45` (L10) | 0 | 45 | 0 | `self_buff` | – | `blazing_barrier` 10 s: emilim %22 maks. can + 2.0×W; yakın dövüş saldırganı 3 sn yanar (%60); kırılınca r4 ateş patlaması 2.0 | `Spellcast_Raise` ×1.8 @0.30 | c `blazing_barrier`(N, alias `shield_bubble` tint `0xff7a30`) · sc `fire_cast` | defensive major fire | `major 45 end 0.7 chain 0.1 move 0.15 weight 1 absorbPct 0.22 absorbW 2.0 thornBurn 0.6 breakNova 2.0 breakRadius 4` |
| `mage_frozen_orb` | Donmuş Küre | Buz · `m90` (L20) | 0 | 90 | 0 | proj v8 R26 r0.9 pierce all, `custom:orb_pulse` | 6 darbe × 1.1 frost r3.2 (3 s) | her darbe `chill`; her darbe %25 Buz Parmağı; yavaşlatma %40 | `Spellcast_Raise` ×1.6 @0.5 | p `frost_projectile` scale 2.2 · i `frost_burst` · sc `ice_cast` | burst major frost | `major 90 pulses 6 pulseCoef 1.1 pulseRadius 3.2 fofPerPulse 0.25 end 0.9 chain 0.1 move 0.2 weight 2 element 2` |
| `mage_touch_of_magi` | Büyücü Dokunuşu | Gizem · `m45` (L10) | 0 | 45 | 0 | `custom:target_status` R30 | süre bitince depolanan hasar (cap 30×W) r4 arcane | hedef `touch_of_magi` 8 s: senin hasarının %25'i depolanır; patlayınca +2 Gizem Yükü | `Spellcast_Shoot` ×1.8 @0.373 | i `mark_loop` (vfxColor 0xb78cff) · sc `arcane_cast` | burst major arcane | `major 45 store 0.25 storeCapW 30 burstRadius 4 pipOnBurst 2 end 0.6 chain 0.1 move 0.15 weight 1` |
| `mage_arcane_surge` | Gizem Dalgalanması | Gizem · `m90` (L20) | 0 | 90 | 0 | `self_buff` | – | `arcane_surge` 12 s: gizem +%30 DAHA FAZLA, mana yenilenmesi ×3, Gizem Patlaması maliyeti −%50; anında +40 mana | `Spellcast_Raise` ×1.5 @0.5 | c `enrage_aura` (vfxColor 0xb78cff) · sc `arcane_cast` | burst major arcane | `major 90 more 1.3 regenMult 3 blastCostMult 0.5 manaFlat 40 end 0.9 chain 0.1 move 0.2 weight 2` |

Statuses to add to `data/statuses.ts` (`StatusDef`): `hot_streak` (buff 8 s, Sıcak Seri, icon `buff-crit`), `fingers_of_frost` (buff 15 s, max 2 stacks, icon `debuff-freeze` tinted), `touch_of_magi` (debuff 8 s), `arcane_surge` (buff 12 s: `damageMore` via special, `resourceRegenPct +2.0`), `blazing_barrier` (buff 10 s, absorb). `mage_time_warp` is V2's row, unchanged.

Tooltips (TR, `SkillDef.desc`):

| id | desc |
|---|---|
| `mage_phoenix_flames` | Hedefe %190 ateş hasarı veren ve yakan bir alev fırlatırsın; alev en yakın yanan düşmana en fazla 2 kez sekip yanmayı yayar. |
| `mage_flurry` | Üç hızlı buz oku atarsın; her ok %80 hasar verir, hedefi üşütür ve %25 şansla Buz Parmağı kazandırır. |
| `mage_arcane_blast` | %240 gizem hasarı verirsin ve 1 Gizem Yükü kazanırsın. Her yük hasarı artırır ama mana maliyetini de artırır. |
| `mage_arcane_barrage` | Tüm Gizem Yüklerini harcayıp %180 + yük başına %90 gizem hasarı verirsin; harcanan her yük için 2 mana geri alırsın. |
| `mage_blazing_barrier` | 10 saniye boyunca maks. canının %22'si kadar kalkan kazanırsın; sana vuranlar yanar, kalkan kırılınca çevreye ateş patlar. |
| `mage_frozen_orb` | Yavaş ilerleyen bir buz küresi salarsın: 3 saniyede 6 kez %110 buz hasarı verir, düşmanları üşütür ve Buz Parmağı kazandırabilir. |
| `mage_touch_of_magi` | Hedefi 8 saniye işaretlersin; verdiğin hasarın %25'i depolanır ve süre bitince patlayarak geri verilir. Patlama +2 Gizem Yükü kazandırır. |
| `mage_arcane_surge` | 12 saniye boyunca gizem hasarın %30 artar, mana yenilenmen üç katına çıkar ve Gizem Patlaması yarı maliyetle dökülür. Anında 40 mana kazanırsın. |

### 1.4 Class utility skills — the `s05` choice of every class tree (18 new rows)

Every **class tree** has one skill-unlock slot `s05` that is an **A|B choice of two skills** (take one): **A = the class interrupt** (so every class can kick in Mythic+ — V2 §8.4's kick tracker lists them; the Şövalye is the one exception: its interrupt is already `knight_shield_bash`, so its A is the ally dash Müdahale), **B = a class utility** (defensive / escape / ally tool). Rows go to `data/skills_class_utils.ts`; `SkillDef.classId` = the class, `unlockLevel 99` (granted only by the node), `defaultSlot` none (the player slots them from the skill book). All interrupts share one behaviour `interrupt` (`combat/skills/utilities.ts`): stops an **interruptible** cast, locks that ability for 4 s (the kick-tracker rule of V2 §8.4), **silence 3 s on non-boss** targets; bosses only lose the cast.

| id | Ad | Sınıf · slot | Mal | BS | Hedef / etki (exact) | Anim ×speed | Etiket |
|---|---|---|---|---:|---|---|---|
| `knight_intercept` | Müdahale | Şövalye · A | 0 | 20 | seçili müttefike ≤ 20 m atılır (yoksa 12 m ileri); müttefik 4 sn `intercept_ward` (hasar −%25); kendine +20 Kararlılık | `Dodge_Forward` ×1.4 | movement defensive |
| `knight_guardian_vow` | Muhafız Yemini | Şövalye · B | 0 | 30 | müttefik hedef ≤ 25 m: 8 sn `guardian_vow` — aldığı hasarın %30'unu sen üstlenirsin (üst sınır saniyede maks. canının %15'i) | `Cheer` ×1.6 | defensive buff |
| `barbarian_pummel` | Yumruk Darbesi | Barbar · A | 10 Öfke | 12 | melee 3 m tek hedef: `interrupt` + 0.8 sn sersemletme (boss hariç) | `Unarmed_Melee_Attack_Punch_A` ×1.5 | melee kick |
| `barbarian_intimidating_shout` | Korkutucu Haykırış | Barbar · B | 0 | 40 | r6: boss olmayanlar 6 sn korkar (seçkin 3 sn); bosslar 6 sn %20 daha az hasar verir | `Cheer` ×1.4 | shout cc |
| `mage_counterspell` | Büyü Kırma | Büyücü · A | 10 Mana | 20 | R30 hedef: `interrupt` + sessizlik 3 sn | `Spellcast_Shoot` ×1.5 | spell kick |
| `mage_ice_block` | Buz Küresi | Büyücü · B | 0 | 120 | 4 sn `ice_block`: dokunulmaz, hareket/beceri yok; bitince maks. canın %20'si yenilenir; kök/yavaşlatmayı temizler | `Spellcast_Raise` ×1.2 | defensive |
| `rogue_kick` | Tekme | Haydut · A | 10 Enerji | 12 | melee 3 m: `interrupt` | `Unarmed_Melee_Attack_Kick` ×1.5 | melee kick |
| `rogue_cloak_of_shadows` | Gölge Pelerini | Haydut · B | 0 | 60 | 4 sn `cloak_ward`: tüm temizlenebilir olumsuz etkileri kaldırır, `resAll +0.60` | `Cheer` ×1.8 | defensive |
| `monk_spear_hand` | Mızrak Eli | Keşiş · A | 15 Enerji | 15 | koni 4 m: `interrupt` + 4 sn sessizlik (boss hariç) | `Dualwield_Melee_Attack_Stab` ×1.5 | melee kick |
| `monk_touch_of_karma` | Karma Dokunuşu | Keşiş · B | 0 | 90 | 6 sn `karma_ward`: aldığın hasarın %60'ı ertelenir ve izleyen 6 sn içinde DoT olarak alınır (öldüremez: en az 1 can bırakır) | `Cheer` ×1.4 | defensive |
| `archer_muzzle` | Susturucu Ok | Okçu · A | 15 Odak | 20 | R25 mermi: `interrupt` + 3 sn sessizlik | `2H_Ranged_Shoot` ×1.4 | ranged kick |
| `archer_feign_death` | Ölü Taklidi | Okçu · B | 0 | 30 | tüm tehdidini sıfırlar; 4 sn `feign_death` (hasarla bozulmayan gizlilik), hedef kilitlerini düşürür | `Death_A` ×0.6 (kısa) | utility stealth |
| `paladin_rebuke` | Azarlama | Paladin · A | 10 İnanç | 15 | melee 4 m: `interrupt` + 1 Kutsal Güç | `1H_Melee_Attack_Stab` ×1.5 | melee kick holy |
| `paladin_divine_shield` | İlahi Kalkan | Paladin · B | 0 | 150 | 5 sn dokunulmaz; `forbearance` 90 sn (Şifa Eli / İlahi Kalkan engellenir); olumsuz etkileri temizler | `Cheer` ×1.2 | defensive holy |
| `necro_soul_snap` | Ruh Koparma | Nekromant · A | 10 Öz | 20 | R20: `interrupt` + 3 sn sessizlik + 10 Öz | `Spellcast_Shoot` ×1.5 | spell kick |
| `necro_spirit_walk` | Ruh Yürüyüşü | Nekromant · B | 15 Öz | 45 | 4 sn `spirit_walk`: hareket +%40, düşmanların içinden geçer, fiziksel hasar −%30 | `Spellcast_Raise` ×1.6 | movement defensive |
| `warlock_spell_lock` | Büyü Kilidi | Warlock · A | 10 Mana | 24 | R30: `interrupt` + 3 sn sessizlik (iblis yoldaş varsa onun adına: ek ses yok) | `Spellcast_Shoot` ×1.5 | spell kick |
| `warlock_unending_resolve` | Dayanıklılık Sözleşmesi | Warlock · B | 0 | 60 | 8 sn `resolve_pact`: aldığın hasar −%30, kontrol etkilerine bağışık | `Cheer` ×1.6 | defensive |

`SkillDef` template (copy for every row; replace values): `{ id, classId, name, desc, icon: '/assets/icons/skill-<closest>.svg', unlockLevel: 99, cost, cooldown, castTime: 0, anim, animSpeed, hitTime: 0.3, targeting: 'self_buff' | 'melee_arc' | 'projectile' | 'custom', tags, behavior: 'interrupt' | 'intercept' | 'guardian_vow' | 'ice_block' | 'karma' | 'feign' | 'spirit_walk' | 'status_self', params: { major?: undefined, end: 0.5, chain: 0.1, move: 0.15, weight: 0 } }`. Icons: reuse the nearest existing `skill-*.svg` (`skill-shield-bash`, `skill-taunt`, `skill-berserk`, `skill-war-cry`, `skill-blink`, `skill-mana-shield`, `skill-shadow-step`, `skill-smoke-bomb`, `skill-leap`, `skill-hammer-of-justice`, …); no new art is blocking.

### 1.5 Which skills the trees grant (A nodes), per spec

| Tree group | s05 | s12 | s20 |
|---|---|---|---|
| the 15 tank and DPS spec trees | the spec's 2nd skill (table §1.2, V2's L15 skill) | `M` (authored) | `M` (authored) |
| the 3 healer spec trees | one optional skill (`paladin_light_of_dawn`, `rogue_smoke_ward`, `monk_mw_vivify`) | `M` | `M` |
| the 9 class trees | **A / B choice** of §1.4 | `M` | `M` |

The layout keeps `s12` / `s20` typed `A` in spec trees so a later spec or a hero path can grant more skills without a layout change; in every v1 tree they are ordinary `M` rows.

Pacing check against V2 (second spec skill at L15): the first Uzmanlık Puanı arrives at **L11** and `s05` (row 1, gate 1) needs 1 point already spent in the spec tree — a player takes any row-0 node at L11 and the skill at **L13**, two levels *earlier* than V2. Healers keep V2's full heal schedule by level (L10 / L10 / L12 / L15 or L20); depth-first A nodes would have delayed a healer's AoE heal to L33 (row-5 gate 11), which is why healer kits are **not** tree-gated.

### 1.6 Tier sets and other V2 bindings

| V2 set | New binding | 2-parça / 4-parça (replace V2's text; initial values) |
|---|---|---|
| `Elementlerin Efendisi` (Elementalist) | three sets `tier_mage_fire`, `tier_mage_frost`, `tier_mage_arcane`, same piece names, different bonuses | **Ateş 2p:** Sıcak Seri için 2 yerine 1 kritik yeter (6 sn bekleme); Anka Alevleri +1 sekme · **4p:** Sıcak Seri bitince %30 şansla yenilenir; Yanış sırasında Meteor bekleme −%50 — **Buz 2p:** Buz Parmağı şansı +%10, Parmaklı Buz Mızrağı +%25 · **4p:** Donmuş Küre her darbede %40 Parmak şansı; Ayaz Damarları sırasında Dondurucu Sağanak çift atar — **Gizem 2p:** Gizem Barajı 4 yükte yarı mana harcar · **4p:** Büyücü Dokunuşu patlaması +%30 ve +3 yük; Gizem Dalgalanması sırasında Gizem Patlaması bedava |
| `Şafak Habercisi` (Işık Çağıran) | `tier_paladin_holy` (same name, Paladin heavy armour variant) | **2p:** Işığın Sözü +%20 iyileştirir, %30 şansla ikinci hedefe %50 sıçrar; Taşan Şifa sınırı %15 → %25 · **4p:** Tyr'ın Sığınağı bekleme 90 → 70 s; Taşan Şifa kalkanlı müttefike Şafak Işığı anında dökülür |
| other 6 V2 sets | unchanged | – |
| the 13 specs without a set | content pass after launch | data-only (`data/tierSets.ts`) |

Spec binding of set bonuses (V2 §6.1) already reads the active spec id, so nothing else changes.

### 1.7 Role coverage and party compositions

| Role | Specs | Classes |
|---|---|---|
| Tank (4) | `knight_protector`, `barbarian_warlord`, `monk_brewmaster`, `paladin_protection` | Şövalye, Barbar, Keşiş, Paladin |
| Healer (3) | `paladin_holy`, `rogue_alchemist`, `monk_mistweaver` (kit wave 2) | Paladin, Haydut, Keşiş |
| DPS (14) | blademaster, butcher, fire, frost, arcane, assassin, windwalker, marksman, beastmaster, retribution, summoner, bone, affliction, destruction | all 9 |

A 5-man (1 T + 1 H + 3 DPS) has 10 different-class (tank, healer) pairs (Şövalye/Barbar × Paladin/Haydut/Keşiş = 6, Keşiş × Paladin/Haydut = 2, Paladin × Haydut/Keşiş = 2) plus the two same-class pairs if two players choose Paladin or Keşiş; the hero effect (`m180`) still comes from four classes (Şövalye, Barbar, Büyücü, Haydut), so a single `sated` window applies per 150 s as before. Hero-effect owners: `knight_blademaster`, `barbarian_butcher`, `mage_fire / frost / arcane`, `rogue_alchemist`.

### 1.8 Migration notes for characters that already picked a V2 spec

Only relevant once V2 WP5 has shipped; the code today has no specs. `Save.normalize` runs `migrateTalents(save)` (Appendix C) once (`flags['tb.migrated'] = 1`).

| Old `spec` | New `spec` | Rule | Extras |
|---|---|---|---|
| `mage_elementalist` | `mage_fire` **or** `mage_frost` | count allocated web nodes of the fire family (`n_pyromancer`, `mg_a*`, `ks_glass_cannon`) vs frost family (`n_cryomancer`, `mg_b*`, `n_spell_echo`); frost if frost > fire, else fire | `specBars[old]` copied to the new spec with `mage_ice_lance`/`mage_flame_wave` kept and `m45/m90` remapped (fire: `mage_blazing_barrier`/`mage_combustion`; frost: `mage_icy_veins`/`mage_frozen_orb`); 1 free full web reset (`flags['tb.freeWebReset'] = 1`, consumed by the trainer's Kadim Unutuş / the N reset); toast "Elementalist ikiye ayrıldı: Ateş / Buz. Uzmanlığını N'den değiştirebilirsin." |
| `mage_lightbringer` | `mage_arcane` | healer→DPS is unavoidable | one free full web reset (`flags['tb.freeWebReset'] = 1`); toast "Işık Çağıran kaldırıldı. Şifacılık için Paladin (Kutsal), Haydut (Simyacı) veya Keşiş (Sis Dokuyan) seçebilirsin."; `skillRunes` entries of the dropped healing skills stay in the save (keyed by skill id) and are ignored |
| all other V2 specs | unchanged | – | their `specBars` stay |
| no spec, level ≥ 10 | none | the N window shows the spec picker with a pulsing "Uzmanlık Seç" badge | |

Characters without `tb` start with an **empty** build for the spec they pick (every point unspent; the Önerilen button of §2.7 fills it in one click). Their already-allocated passive web is untouched (the 125 old node ids are stable).


---

## 2. WoW layer on `N` — spec choice, class tree, spec tree

### 2.1 Pools and schedule

| Havuz (TR) | Kaynak | Miktar | Nerede harcanır |
|---|---|---:|---|
| **Sınıf Puanı** | every **even** level 12 … 60 | **25** | the shared **class tree** of the character's class |
| **Uzmanlık Puanı** | every **odd** level 11 … 59 | **25** | the **spec tree** of the active spec |
| Pasif Puan | levels 2–60, quests, milestones (§3.8) | 89 | the PoE web (§3) |
| Ustalık | using a signature skill (§4.2) | per skill | skill specialisation tiers (free of points) |

The spec itself is chosen at **level 10** and is *not* a point: it grants the spec passive (`SpecDef.stats/specials/fx`), the core skills and the `m45` major immediately. Points per level: `classPoints(L) = max(0, floor((L − 10) / 2))`, `specPoints(L) = max(0, floor((L − 9) / 2))` (L60 → 25 / 25).

| Seviye | 10 | 11 | 12 | 15 | 20 | 30 | 40 | 50 | 55 | 60 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sınıf Puanı (toplam) | 0 | 0 | 1 | 2 | 5 | 10 | 15 | 20 | 22 | 25 |
| Uzmanlık Puanı (toplam) | 0 | 1 | 1 | 3 | 5 | 10 | 15 | 20 | 23 | 25 |
| açılmış en yüksek satır (Uzmanlık ağacı; sınıf ağacı biraz geriden gelir) | – | 1 | 1 | 2 | 3 | 4 | 6 | 8 | 9 | 9 |

(Gate rows from the table in §2.2; the ultimate capstone `s30` needs 23 points in its own tree ⇒ level 55 for the spec tree, level 56 for the class tree.) Each tree has **capacity 42** points (12 palette nodes × 2 ranks + 18 single-point nodes) against **25** spendable, i.e. a player fills ≈ 60 % of each tree — the Dragonflight ratio — so every build omits real choices. Below level 10 the `Uzmanlık & Yetenekler` tab shows both trees greyed with "Seviye 10'da açılır"; the `Pasif Ağaç` tab works from level 2 (today's behaviour).

### 2.2 The shared layout `TREE30`

All 30 trees (9 class + 21 spec) use the **same 30 slots, positions, gates and edges**; only the content differs. A node is **takeable** when (1) its **gate** is met (points already spent *in this tree* ≥ gate), (2) at least one **parent** (the nodes of the previous row within one column; table) has rank ≥ 1 (row 0 has no parents), (3) the pool of the tree has a free point, (4) rank < max.

```
 satır   sütun→  0      1      2      3      4      5      6          kapı
   0                   s01P          s02C          s03P                  0
   1            s04M          s05A          s06P          s07P           1
   2                   s08P          s09C          s10P                  3
   3            s11M          s12*          s13M          s14P           5
   4                   s15C          s16P          s17C                  8
   5            s18M          s19P          s20*          s21M          11
   6                   s22P          s23P          s24P                 14
   7                   s25M          s26C          s27M                 17
   8                          s28K          s29K                        20
   9                                 s30K (A|B)                         23
```

`P` palette stat node (2 ranks) · `C` A|B choice (1 point) · `M` skill-mod / mechanic node (1 point) · `A` skill unlock · `K` capstone. `*` = **A in spec trees, M in class trees**; `s05` = **A** (spec: grants one skill) / **A|B choice of two skills** (class tree, §1.4). Canvas coordinates: `x = 150 × column`, `y = 130 × row`; links are drawn from each node to its parents.

| Slot | Satır | Sütun | Kapı (ağaçta harcanan puan) | Uzm. türü | Sınıf türü | Üst düğümler |
|---|:-:|:-:|:-:|:-:|:-:|---|
| s01 | 0 | 1 | 0 | P | P | – |
| s02 | 0 | 3 | 0 | C | C | – |
| s03 | 0 | 5 | 0 | P | P | – |
| s04 | 1 | 0 | 1 | M | M | s01 |
| s05 | 1 | 2 | 1 | A | A | s01, s02 |
| s06 | 1 | 4 | 1 | P | P | s02, s03 |
| s07 | 1 | 6 | 1 | P | P | s03 |
| s08 | 2 | 1 | 3 | P | P | s04, s05 |
| s09 | 2 | 3 | 3 | C | C | s05, s06 |
| s10 | 2 | 5 | 3 | P | P | s06, s07 |
| s11 | 3 | 0 | 5 | M | M | s08 |
| s12 | 3 | 2 | 5 | A | M | s08, s09 |
| s13 | 3 | 4 | 5 | M | M | s09, s10 |
| s14 | 3 | 6 | 5 | P | P | s10 |
| s15 | 4 | 1 | 8 | C | C | s11, s12 |
| s16 | 4 | 3 | 8 | P | P | s12, s13 |
| s17 | 4 | 5 | 8 | C | C | s13, s14 |
| s18 | 5 | 0 | 11 | M | M | s15 |
| s19 | 5 | 2 | 11 | P | P | s15, s16 |
| s20 | 5 | 4 | 11 | A | M | s16, s17 |
| s21 | 5 | 6 | 11 | M | M | s17 |
| s22 | 6 | 1 | 14 | P | P | s18, s19 |
| s23 | 6 | 3 | 14 | P | P | s19, s20 |
| s24 | 6 | 5 | 14 | P | P | s20, s21 |
| s25 | 7 | 1 | 17 | M | M | s22 |
| s26 | 7 | 3 | 17 | C | C | s23 |
| s27 | 7 | 5 | 17 | M | M | s24 |
| s28 | 8 | 2 | 20 | K | K | s25, s26 |
| s29 | 8 | 4 | 20 | K | K | s26, s27 |
| s30 | 9 | 3 | 23 | K | K | s28, s29 |


Slot counts: class tree **P 12 · C 5 · M 9 · A 1 · K 3 = 30**; spec tree **P 12 · C 5 · M 7 · A 3 · K 3 = 30**. Palette nodes take their stat from the tree's `palette` list in slot order `s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24`.

### 2.3 Node types and rules

| Type | Ranks | Points | Content | Rules |
|---|:-:|:-:|---|---|
| `P` palette | 2 | 1 per rank | one `StatId`, value per rank from §2.6 | name = `STAT_INFO` name + roman numeral per repeat (e.g. "Ateş Hasarı II"); rank 2 requires rank 1 |
| `C` choice | 1 | 1 | two authored options A and B | the player takes **A or B**; switching inside the draft is free (untake + take), after Apply it counts as one removal |
| `M` mod | 1 | 1 | one authored effect (DSL) — mostly skill mods (`M`) and procs (`T`) | |
| `A` skill unlock | 1 | 1 | `G skillId` (spec trees, `s05`) · class tree `s05` = choice of two skills | the skill appears in the skill book (K) and fills the spec's `defaultBar` slot when empty |
| `K` capstone | 1 | 1 | `s28`, `s29` single; `s30` **A / B** final choice | gate 20 / 20 / 23; exactly one of `s30 A / B` |

**Untake rule:** a point may be removed only if afterwards every remaining taken node still satisfies its gate (`spent' ≥ gate(row)`) and has ≥ 1 taken parent (or is in row 0); otherwise the node shows "Bu düğüme bağlı seçimler var" in the tooltip and the click is refused (the player removes from the bottom up, exactly like WoW).

**Grants:** `grantedSkills()` is the union of the taken `A` nodes of the active spec's trees; leaving a node removes the skill from the bar (its slot is greyed "Beceri kilitli"). Granted skills use the class/spec `unlockLevel 99` convention of §1.4 (the node is the only unlock).

**Per-spec storage:** each spec has its **own** class-tree and spec-tree allocation (WoW: switching spec swaps both). Points are re-granted per spec from the same level formula, so a level-60 character has 25 + 25 points in *every* spec it has ever used. Unused specs start empty.

### 2.4 Spec choice and switching

* **Choose** (level ≥ 10, once): tab 1 shows 2–3 spec cards (role icon, name, one-line identity, key mechanic, signature skills); **"Uzmanlığı Seç"** opens the confirm modal "{Uzmanlık} seçilsin mi? Değiştirmek için bir şehir/köy gerekir." Choosing sets `save.spec`, applies `defaultBar` (`specBars[spec]`), grants `m45`, emits `spec:changed`.
* **Switch:** allowed in a **rest zone** (`G.talents.canEditHere().remove`: town scene or an open-world village / sanctuary zone) when not in combat and not in a dungeon, raid or Mythic+; **free**. The target spec loads its own `active` loadout (empty on first use). Net: V2's `spec` channel announces the new spec id.
* Locked: inside `DungeonScene` (any difficulty) and while an M+/raid run exists; the Spec buttons show "Zindan içinde değiştirilemez".
* **Role badge:** the player frame shows "Koruyucu · Tank" (V2 §2.4); the `N` header shows the spec colour (tank blue `#5aa8ff`, healer green `#6fdc8c`, DPS red `#e0604e`).

### 2.5 Effect DSL in one page (full reference: Appendix D)

Every non-palette node, every skill-specialisation option, every cluster/mastery node and `SpecDef.fx` is written in one small language so that **no node needs its own code**:

```
fx    := item ( " ;; " item )*
item  := "S " key=val …                              stats (per rank on P nodes)                      → StatCalc
       | "M " target op=val …                         skill modifiers (applied to a derived SkillDef)   → combat/skillMods.ts
       | "T " trigger[:filter] [if=cond&cond] [ch=p] [icd=s] " => " action ( " ; " action )*           → combat/Procs.ts
       | "G " skillId                                grants a skill                                    → TalentSystem
       | "X " specialId{key=val,…}                   adds to the params of a bespoke special           → combat/specials.ts (≤ 5 ids)
```

Examples (all taken from the data): `S fireDamagePct=.12 burnChance=.08` · `M mage_fireball dmgx=1.1 st=burn:4:.5` · `T crit:@fire ch=.1 => resp(.04)` · `T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` · `G knight_ward_of_oath` · `X trait_pyromancer{streakDur=4}`. The 729 rows of §2.10, the 162 specialisation options (§4.5) and the 78 web rows (36 cluster nodes + 42 mastery effects, §3.5–3.6) are all expressed with a vocabulary of **26 mod ops (+ the generic `p.<key>`), 16 triggers, 15 actions and 17 conditions** (Appendix D), implemented by three packages (T3, T4, T7).

**Folding order** (`StatCalc` / `resolveSkill`): base `SkillDef` → `SpecDef.fx` → class-tree mods → spec-tree mods → skill-specialisation options → web `fx` (notables, masteries, jewels) → support runes (V2 §4.1) → stats. `x` ops multiply, `+`/`-` ops add; hard limits per op in Appendix D (e.g. total `cdx` ≥ 0.5, `chg` ≤ +2, `cnt` ≤ +4).

### 2.6 Palette values (stat per rank of a `P` node)

Each rank = **≈ 20 BP** (one fifth of a T1 affix roll, GDD_LIFE §6.2) so a full 2-rank `P` node ≈ 40 BP and the 12 palette nodes of a tree ≈ 470 BP if all taken (the build only takes ≈ 6 of them). Values are data (`data/talentTrees/palette.ts` `PALETTE_VALUE`), all other numbers in the tables are absolute.

| Stat | Rank başına | ≈BP |
|---|--:|--:|
| `str` | 7 | 19 |
| `dex` | 7 | 19 |
| `int` | 7 | 19 |
| `vit` | 7 | 19 |
| `allAttr` | 7 | 19 |
| `damagePct` | 0.03 | 21 |
| `physicalDamagePct` | 0.06 | 20 |
| `fireDamagePct` | 0.06 | 20 |
| `frostDamagePct` | 0.06 | 20 |
| `lightningDamagePct` | 0.06 | 20 |
| `shadowDamagePct` | 0.06 | 20 |
| `poisonDamagePct` | 0.06 | 20 |
| `holyDamagePct` | 0.06 | 20 |
| `arcaneDamagePct` | 0.06 | 20 |
| `meleeDamagePct` | 0.06 | 20 |
| `projectileDamagePct` | 0.06 | 20 |
| `bleedDamagePct` | 0.06 | 20 |
| `dotPct` | 0.06 | 20 |
| `aoePct` | 0.06 | 20 |
| `critChance` | 0.007 | 20 |
| `critDamage` | 0.07 | 20 |
| `attackSpeed` | 0.02 | 17 |
| `castSpeed` | 0.02 | 17 |
| `cdr` | 0.017 | 20 |
| `moveSpeedPct` | 0.02 | 17 |
| `maxHp` | 38 | 20 |
| `maxHpPct` | 0.02 | 17 |
| `armor` | 33 | 20 |
| `armorPct` | 0.17 | 20 |
| `resAll` | 0.02 | 17 |
| `hpRegen` | 5 | 21 |
| `lifeSteal` | 0.004 | 22 |
| `dodgeChance` | 0.007 | 20 |
| `blockChance` | 0.015 | 20 |
| `staggerPct` | 0.05 | 20 |
| `resourceRegenPct` | 0.05 | 20 |
| `resourceGainPct` | 0.05 | 20 |
| `costReductionPct` | 0.04 | 20 |
| `executeDamagePct` | 0.06 | 20 |
| `ailingDamagePct` | 0.06 | 20 |
| `chilledDamagePct` | 0.06 | 20 |
| `eliteDamagePct` | 0.03 | 21 |
| `bossDamagePct` | 0.03 | 21 |
| `ccDurationPct` | 0.06 | 20 |
| `ccReductionPct` | 0.05 | 20 |
| `projectileSpeedPct` | 0.08 | 20 |
| `aoeRadiusPct` | 0.04 | 20 |
| `potionPct` | 0.05 | 20 |
| `healReceivedPct` | 0.03 | 21 |
| `blockAmount` | 0.02 | 17 |
| `healingPct` | 0.03 | 21 |
| `guardGauge` | 6 | 20 |
| `parryWindow` | 0.02 | 20 |
| `poiseDamagePct` | 0.05 | 20 |
| `finisherPct` | 0.06 | 20 |
| `weaponArtPct` | 0.06 | 20 |
| `weakDamagePct` | 0.06 | 20 |
| `majorCdrPct` | 0.018 | 20 |
| `flaskGainPct` | 0.1 | 20 |
| `flaskEffectPct` | 0.06 | 20 |
| `runeEffectPct` | 0.06 | 20 |
| `minionDamagePct` | 0.06 | 20 |
| `minionHpPct` | 0.06 | 20 |
| `trapDamagePct` | 0.06 | 20 |
| `maxResource` | 3 | 20 |
| `bleedChance` | 0.04 | 20 |
| `burnChance` | 0.04 | 20 |
| `poisonChance` | 0.04 | 20 |
| `hpOnKillPct` | 0.006 | 20 |
| `resFire` | 0.06 | 20 |
| `resFrost` | 0.06 | 20 |
| `resLightning` | 0.06 | 20 |
| `resShadow` | 0.06 | 20 |
| `resPoison` | 0.06 | 20 |
| `resArcane` | 0.06 | 20 |
| `armorPen` | 0.02 | 20 |
| `resPen` | 0.02 | 20 |
| `thorns` | 24 | 20 |
| `hpOnHit` | 2 | 20 |
| `threatPct` | 0.05 | – |
| `skillMasteryPct` | 0.1 | – |


### 2.7 Loadouts, Önerilen, import / export

* **Loadouts:** per spec one **active** loadout (the committed build) plus up to **8 saved** loadouts (`TalentLoadout { id, name ≤ 24 chars, cls[30], spc[30], skl[9], at }`). Buttons: **Kaydet** (save active under a name), **Yükle** (load a saved one into the draft; free; applies on "Değişiklikleri Uygula"), **Yeniden Adlandır**, **Sil**, **Çoğalt**. Loading a loadout is *free* (no removal cost) but only in a rest zone.
* **Önerilen** (recommended build): fills the draft with `autoBuild(tree, points)` — greedy, re-evaluated after every pick, priority **A → C (option A) → K → M → P rank 1 → P rank 2**, ties by slot number, honouring gates and parents. Option **A of every choice is the designer's baseline**; B is the alternative playstyle. It is a starting point, never the "best" build.
* **Export string** `EFT1-<SS>-<19 chars>-<4 chars>-<CC>`: `SS` = `SPEC_ORDER` index (2 digits); the 19 chars = base64url of 14 bytes = class tree (7 bytes) + spec tree (7 bytes); the 4 chars = base64url of 3 bytes of skill-specialisation picks; `CC` = CRC-8 (poly `0x07`, init 0) of the 18 payload bytes (`SS` byte + 14 + 3) as two upper-case hex digits. Per tree, slots are packed in order `s01…s30` MSB-first with widths **P 2 bits (0–2) · C 2 bits (0 none, 1 A, 2 B) · M 1 bit · spec A 1 bit · class `s05` 2 bits (0/1/2 = none/A/B) · K `s28`,`s29` 1 bit · `s30` 2 bits**, padded with zeros to 56 bits (class tree 49 bits, spec tree 48 bits). Skill specs: the class's 3 signature skills in the §4.5 order × tiers 1–3 × 2 bits (0 none, 1 A, 2 B) = 18 bits, padded to 24. Verified example (autoBuild of both trees for `mage_fire`, first signature skill T1–T3 = A): `EFT1-04-Vqq9VuhEgFdVeq3QiQA-VAAA-47`. Decoding a string whose CRC fails, whose spec belongs to another class, or whose allocation violates gates/parents shows "Geçersiz yapı dizesi" and changes nothing; a valid string is loaded into the **draft** (never directly committed) and the diff is shown.
* **Web string** (read-only plan, §3.9): `EFP1-<classIndex 1 digit>-<52 chars>-<6 chars>-<CC>` — a 306-bit set of allocated node indices (canonical `TALENT_LIST` order) + 14 mastery picks (2 bits each).

### 2.8 Applying changes and the respec cost

| Change | Where allowed | Cost |
|---|---|---|
| **add** a point (any node, any tree) | anywhere, out of combat (not in a dungeon after the countdown) | free |
| **remove** a point, **switch spec**, **load a saved loadout**, import a string | rest zone only (`canEditHere().remove`) | removals: `wowRespecCost` below; spec switch and loadout/string load: **free** |
| **Sıfırla** (clear the active spec's both trees) | rest zone | `wowRespecCost(level, totalSpent)` |

`wowRespecCost(level, removed) = removed == 0 ? 0 : (tb.removals == 0 ? 0 : min(removed × 8 × level, 250 × level))` — the **first** Apply that contains a removal is free (`tb.removals` counts them), and one Apply never costs more than `250 × level`.

| Seviye | 1 nokta | 10 nokta | 25 nokta (tam sıfırlama) | tavan |
|---:|---:|---:|---:|---:|
| 20 | 160 | 1,600 | 4,000 | 5,000 |
| 40 | 320 | 3,200 | 8,000 | 10,000 |
| 60 | 480 | 4,800 | 12,000 | 15,000 |

(L60 income is 70–90 k gold/h, so a full reset ≈ 10 minutes of farming; switching between *known* builds stays free, which is the point of loadouts.) A removal is counted **by net committed points**: a draft that removes 3 and adds 3 costs 3 removals.

### 2.9 Data shapes

```ts
// types/talents.ts (NEW, core)
export type TreeKind = 'class' | 'spec';
export type NodeType = 'P' | 'C' | 'M' | 'A' | 'K';
export type SlotId = 's01' | 's02' | /* … */ 's30';
export interface FxText { name: string; desc: string; fx: string }                    // fx = effect DSL string (§2.5)
export interface TreeNodeDef {
  slot: SlotId; type: NodeType; row: number; col: number; gate: number; parents: SlotId[]; ranks: 1 | 2;
  stat?: StatId;                       // P nodes
  options: FxText[];                   // P: 1 generated · M/K/A: 1 · C, K s30, class s05: 2 (A, B)
}
export interface TreeDef { id: string; kind: TreeKind; classId: ClassId; specId?: SpecId; name: string; nodes: TreeNodeDef[] }   // nodes: 30, slot order
export interface TalentLoadout { id: string; name: string; cls: number[]; spc: number[]; skl: number[]; at: number }
export interface TalentBuild { v: 1; active: Partial<Record<SpecId, TalentLoadout>>; saved: Partial<Record<SpecId, TalentLoadout[]>>; removals: number }
// CharacterSave (append-only, all optional): spec?: SpecId; tb?: TalentBuild; skillMastery?: Record<string, number>;
//   passiveExtra?: { picks: Record<string, number>; jewels: Record<string, ItemInstance | null> }
export interface ActiveFx { stats: StatBlock; mods: ModEntry[]; procs: ProcEntry[]; grants: string[]; bespoke: Record<string, Record<string, number>> }
```

Raw data lives in `src/data/talentTrees/raw/<classId>.ts` (generated from `docs/GDD_TALENTS.trees.json`): `{ class: { palette: StatId[12], rows: Row[] }, specs: Record<SpecId, { palette, rows }> }`, `Row = [slot, opt('' | 'A' | 'B'), name | null, desc | null, fx]`; `buildTree(raw)` expands palette + rows into `TreeDef` using `layout.ts` (§2.2) and `PALETTE_VALUE`.

### 2.10 The 30 trees

How to read the tables: **Slot** per §2.2 · **Tür** C choice / M mod / A skill unlock / K capstone · **Seç.** option (A | B, – for single) · **fx** the effect DSL string (Appendix D) · P nodes are not listed (they come from the palette line). Every row obeys the budget caps of §6.1 (checked by `tools/talents-check.mjs`). Spec trees show a `Beceri: …` row at `s05` (the one skill the tree grants); `s12` and `s20` are ordinary `M` rows in every v1 spec.

#### 2.10.1 Şövalye (`knight`)

kaynak Kararlılık (`rage`) · spec: Koruyucu (Tank), Kılıç Ustası (Hasarcı; Adalet Puanı) · sınıf ağacı `s05`: **Müdahale** | **Muhafız Yemini** · Kalkan Darbesi iki spec için de kesme (interrupt) olarak kalır.

##### `class:knight` — Şövalye — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `str` · s03 `meleeDamagePct` · s06 `maxHpPct` · s07 `armorPct` · s08 `blockChance` · s10 `critChance` · s14 `attackSpeed` · s16 `holyDamagePct` · s19 `resAll` · s22 `ccReductionPct` · s23 `staggerPct` · s24 `resourceRegenPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Süvari Adımı | Hareket hızı +%8; Hücum bekleme süresi −3 sn. | `S moveSpeedPct=.08 ;; M knight_charge cd=-3` |
| s02 | C | B | Zırhlı Atılış | Hücum +3 m menzil kazanır; atılırken aldığın hasar %30 azalır. | `M knight_charge rng=+3 ;; T cast:knight_charge => buff(charge_ward,2,{damageReductionPct=.3})` |
| s04 | M | – | Parlak Kalkan | Kalkan Darbesi bekleme −0.5 sn ve menzil +1 m. | `M knight_shield_bash cd=-0.5 rng=+1` |
| s05 | A | A | Beceri: Müdahale | Açılan beceri: `knight_intercept` (SkillDef satırı §1) | `G knight_intercept` |
| s05 | A | B | Beceri: Muhafız Yemini | Açılan beceri: `knight_guardian_vow` (SkillDef satırı §1) | `G knight_guardian_vow` |
| s09 | C | A | Yemin Gücü | Canın %40 altına düşünce 6 sn maks. canının %15'i kadar kalkan kazanırsın (45 sn bekleme). | `T hurt if=hp<.4 icd=45 => abs(.15,6)` |
| s09 | C | B | Çelik İrade | Kontrol azaltma +%15; canın %30 altına düşünce 2 olumsuz etki temizlenir (60 sn bekleme). | `S ccReductionPct=.15 ;; T hurt if=hp<.3 icd=60 => purge(2)` |
| s11 | M | – | Çelik Hücum | Hücum +1 şarj kazanır; şarjlar %25 daha yavaş dolar. | `M knight_charge chg=+1 cdx=1.25` |
| s12 | M | – | Işık Hasadı | Işıltılı Yarma alanı +%20, hasarı +%10. | `M knight_radiant_cleave radx=1.2 dmgx=1.1` |
| s13 | M | – | Meydan Okuma Yankısı | Meydan Okuma bekleme −3 sn, yarıçap +2 m. | `M knight_challenge cd=-3 rad=+2` |
| s15 | C | A | Kılıç Hasadı | Temel vuruşlar %10 şansla ek %80 fiziksel hasar vurur. | `T hit:@basic ch=.1 => dmg(.8,physical)` |
| s15 | C | B | Kalkan Ustası | Kalkan Darbesi hasarı +%20, sarsması +%30. | `M knight_shield_bash dmgx=1.2 stgx=1.3` |
| s17 | C | A | Kararlılık Akışı | Kaynak yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Kararlı Vuruş | Vuruşların %20 şansla +4 Kararlılık verir. | `T hit ch=.2 => res(4)` |
| s18 | M | – | Kalkan Duvarı: Sabır | Kalkan Duvarı bekleme −4 sn; depoladığı hasar %50 artar. | `M knight_shield_wall cd=-4 p.store*=1.5` |
| s20 | M | – | Kahramanlık Sancağı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Kutsal Toprak: Işık Alanı | Kutsal Toprak alanı +%15, hasarı +%20. | `M knight_consecration radx=1.15 dmgx=1.2` |
| s25 | M | – | Sancak Yemini | Savaş Sancağı 3 sn uzun sürer; Kararlılık kazancı %50 artar. | `M knight_war_banner sdur=banner:+3 p.gainPerSec*=1.5` |
| s26 | C | A | Cesaret Şarkısı | Göksel Hüküm kullanınca grup 8 sn Kutsanmış olur. | `T cast:knight_heavens_judgment => st(party,blessed,8)` |
| s26 | C | B | Siper Kardeşliği | Blokladığın vuruşlar 8 m içindeki müttefikleri 4 sn güçlendirir (2 sn bekleme). | `T block icd=2 => st(near(8),fortify,4)` |
| s27 | M | – | Göksel Hüküm: Yargı Günü | Göksel Hüküm bekleme −%15, savurma +%20. | `M knight_heavens_judgment cdx=.85 kbx=1.2` |
| s28 | K | – | Yılmaz Muhafız | Maks. can +%10. Ölümcül darbede canının %20'siyle ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Adalet Ordusu | Hasar +%6. Kritik vuruşlar 6 sn boyunca +%4 saldırı hızı yığar (en fazla 5). | `S damagePct=.06 ;; T crit => buff(justice_army,6,{attackSpeed=.04},max=5)` |
| s30 | K | A | Kutsal Savaşçı | Kutsal hasar +%25; Göksel Hüküm hasarı +%25. | `S holyDamagePct=.25 ;; M knight_heavens_judgment dmgx=1.25` |
| s30 | K | B | Demir Kale | Zırh +%30, blok şansı +%5; Kalkan Duvarı %25 daha sık kullanılır. | `S armorPct=.30 blockChance=.05 ;; M knight_shield_wall cdx=.75` |

##### `spec:knight_protector` — Koruyucu — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `maxHpPct` · s03 `armorPct` · s06 `blockChance` · s07 `threatPct` · s08 `guardGauge` · s10 `blockAmount` · s14 `parryWindow` · s16 `vit` · s19 `resAll` · s22 `holyDamagePct` · s23 `healReceivedPct` · s24 `staggerPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Kalkan Refleksi | Kalkan Kaldır şarjları 1.5 sn daha hızlı dolar. | `M knight_shield_block cd=-1.5` |
| s02 | C | B | Aegis Dönüşü | Kalkan Kaldır 2 sn daha uzun sürer. | `M knight_shield_block sdur=shield_block:+2` |
| s04 | M | – | Tehditkâr Kalkan | Kalkan Darbesi hasarı +%15 ve +150 sabit tehdit verir. | `M knight_shield_bash dmgx=1.15 p.threat+=150` |
| s05 | A | – | Beceri: Yemin Siperi | Açılan beceri: `knight_ward_of_oath` (SkillDef satırı §1) | `G knight_ward_of_oath` |
| s09 | C | A | Blok Ustalığı | Engellenen her vuruş +2 Kararlılık verir. | `T block => res(2)` |
| s09 | C | B | Parlak Savunma | Savuşturma penceresi +0.05 sn; başarılı savuşturma 4 sn %15 hasar azaltma verir. | `S parryWindow=.05 ;; T parry => buff(parry_guard,4,{damageReductionPct=.15})` |
| s11 | M | – | Güçlü Yemin Siperi | Yemin Siperi emilimi +%25. | `M knight_ward_of_oath absx=1.25` |
| s12 | M | – | Kalkan Duvarı: Yemin | Kalkan Duvarı bekleme −%15; depoladığı hasar +%25. | `M knight_shield_wall cdx=.85 p.store*=1.25` |
| s13 | M | – | Yarma: Tehdit Taşkını | Işıltılı Yarma 5 Kararlılık ucuz; tehdit çarpanı +%20. | `M knight_radiant_cleave cost=-5 p.threatMult*=1.2` |
| s15 | C | A | Demir Duvar | Engellenen vuruşlar Kalkan Darbesi bekleme süresini 0.5 sn azaltır (1 sn bekleme). | `T block icd=1 => cdr(knight_shield_bash,0.5)` |
| s15 | C | B | Karşı Kılıç | Savuşturmadan sonra 3 sn vuruşların +%60 hasar verir. | `T parry => buff(riposte_edge,3,{damagePct=.6})` |
| s17 | C | A | Kararlı Nöbetçi | Kaynak yenilenmesi +%20; Kalkan Kaldır maliyeti −%20. | `S resourceRegenPct=.20 ;; M knight_shield_block costx=.8` |
| s17 | C | B | Şifa Işığı | Kutsal Toprak'ın iyileştirmesi +%50. | `M knight_consecration healx=1.5` |
| s18 | M | – | Kışkırtma Ustası | Kışkırtma bekleme −2 sn, menzil +8 m. | `M knight_provoke cd=-2 rng=+8` |
| s20 | M | – | Kadim Bastion | Sarsılmaz Bastion bekleme −%15 ve 2 sn daha uzun sürer. | `M knight_unbroken_bastion cdx=.85 sdur=bastion:+2` |
| s21 | M | – | Geniş Aegis | Yemin Aegis'i yarıçap +5 m, 2 sn daha uzun sürer. | `M knight_oath_aegis rad=+5 sdur=aegis:+2` |
| s25 | M | – | Kutsal Kalkan | Kalkan Darbesi hasarının yarısı kutsala dönüşür; hasar +%10. | `M knight_shield_bash cv=holy:.5 dmgx=1.1` |
| s26 | C | A | Güvenli Liman | Yemin Siperi kullanınca 12 m içindeki müttefikler de Yemin Siperi alır. | `T cast:knight_ward_of_oath => st(near(12),oath_ward,8)` |
| s26 | C | B | Yankılanan Nara | Meydan Okuma sonrası 5 sn blok miktarı +%15. | `T cast:knight_challenge => buff(echo_roar,5,{blockAmount=.15})` |
| s27 | M | – | Hüküm: Muhafız | Göksel Hüküm +250 sabit tehdit verir, hasarı +%10. | `M knight_heavens_judgment p.threat+=250 dmgx=1.1` |
| s28 | K | – | Sarsılmaz Nöbetçi | Maks. can +%8, blok şansı +%4. Blokların %15 şansla Kalkan Kaldır'ı sıfırlar (6 sn bekleme). | `S maxHpPct=.08 blockChance=.04 ;; T block ch=.15 icd=6 => rst(knight_shield_block)` |
| s29 | K | – | Yeminli Kalkan | Savuşturma çevreye %120 kutsal patlama yapar ve +10 Kararlılık verir. | `S guardGauge=20 ;; T parry => exp(1.2,3,holy) ; res(10)` |
| s30 | K | A | Işığın Zırhı | Zırh +%20, alınan iyileştirme +%15; Yemin Siperi +1 şarj. | `S armorPct=.20 healReceivedPct=.15 ;; M knight_ward_of_oath chg=+1` |
| s30 | K | B | Ateşten Siper | Blok şansı +%6, diken +40; engellenen vuruşlar saldırgana %80 kutsal hasar yansıtır. | `S blockChance=.06 thorns=40 ;; T block => dmg(.8,holy)` |

##### `spec:knight_blademaster` — Kılıç Ustası — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `attackSpeed` · s03 `holyDamagePct` · s06 `critChance` · s07 `meleeDamagePct` · s08 `critDamage` · s10 `finisherPct` · s14 `str` · s16 `damagePct` · s19 `cdr` · s22 `resourceGainPct` · s23 `weaponArtPct` · s24 `poiseDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Adalet Hızlanması | Kutsal hasar +%8; temel vuruşlar %15 şansla ek +1 Adalet verir. | `S holyDamagePct=.08 ;; T hit:@basic ch=.15 => pip(adalet,1)` |
| s02 | C | B | Hüküm Hasadı | Karar Darbesi hasarı +%15, kritik şansı +%10. | `M knight_templar_verdict dmgx=1.15 crit=+.1` |
| s04 | M | – | Keskin Karar | Karar Darbesi sarsması +%30, menzili +0.5 m. | `M knight_templar_verdict stgx=1.3 rng=+0.5` |
| s05 | A | – | Beceri: Kutsal Alev Dalgası | Açılan beceri: `knight_wake_of_flames` (SkillDef satırı §1) | `G knight_wake_of_flames` |
| s09 | C | A | Alev Zırhı | Kutsal hasar +%6; Kutsal Alev Dalgası sonrası 4 sn %12 hasar azaltma. | `S holyDamagePct=.06 ;; T cast:knight_wake_of_flames => buff(flame_ward,4,{damageReductionPct=.12})` |
| s09 | C | B | Işığın Atılışı | Hücum +1 Adalet verir. | `T cast:knight_charge => pip(adalet,1)` |
| s11 | M | – | Geniş Alev | Alan hasarı +%8; Kutsal Alev Dalgası +2 m menzil, +%15 alan. | `S aoePct=.08 ;; M knight_wake_of_flames rng=+2 radx=1.15` |
| s12 | M | – | Adalet Hasadı | Işıltılı Yarma hasarı +%15; fazladan her 2 hedefte +1 Adalet. | `M knight_radiant_cleave dmgx=1.15 pip=adalet:1` |
| s13 | M | – | Hüküm Günü Çağrısı | Kritik hasarı +%10; Göksel Hüküm bekleme −%15, sarsması +%30. | `S critDamage=.10 ;; M knight_heavens_judgment cdx=.85 stgx=1.3` |
| s15 | C | A | Gayret Ustası | Gayret 3 sn uzar; temel vuruşlar %20 şansla +1 Adalet verir. | `M knight_zeal sdur=zeal:+3 ;; T hit:@basic ch=.2 => pip(adalet,1)` |
| s15 | C | B | Kılıç Fırtınası | Saldırı hızı +%8; temel zincir hasarı +%10. | `S attackSpeed=.08 ;; M knight_basic dmgx=1.1` |
| s17 | C | A | Uzun Uçuş | Hüküm Kanatları 6 sn daha uzun sürer. | `M knight_wings_of_judgment sdur=wings:+6` |
| s17 | C | B | Çabuk Adalet | Kaynak kazancı +%20; savaşta Adalet varsa 4 sn'de bir +1 kazanırsın. | `S resourceGainPct=.20 ;; T tick:4 if=pips>=1:adalet&inCombat => pip(adalet,1)` |
| s18 | M | – | Çifte Hüküm | Kritik şansı +%1; Karar Darbesi %20 şansla yarım güçte ikinci kez vurur. | `S critChance=.01 ;; T cast:knight_templar_verdict ch=.2 => echo(knight_templar_verdict,.5,.4)` |
| s20 | M | – | Borazancı Kardeşliği | Hüküm Kanatları ve Gayret bekleme −%10. | `M knight_wings_of_judgment+knight_zeal cdx=.9` |
| s21 | M | – | Adalet Alanı | Kutsal Toprak alanı +%10, hasarı +%25. | `M knight_consecration dmgx=1.25 radx=1.1` |
| s25 | M | – | Hücum Ustalığı | Yakın dövüş hasarı +%8; Hücum hasarı +%25, sarsması +%40. | `S meleeDamagePct=.08 ;; M knight_charge dmgx=1.25 stgx=1.4` |
| s26 | C | A | Adalet Fenerı | 5 Adalet'le Karar Darbesi 10 m içindeki müttefikleri 6 sn Kutsanmış yapar. | `T cast:knight_templar_verdict if=pips>=5:adalet => st(near(10),blessed,6)` |
| s26 | C | B | Yalnız Kılıç | Yakınında (40 m) müttefik yokken +%12 hasar. | `T tick:1 if=solo => buff(lone_blade,2,{damagePct=.12})` |
| s27 | M | – | Yargı Patlaması | 5 Adalet'le Karar Darbesi hedefin çevresinde %120 kutsal patlama yapar. | `T cast:knight_templar_verdict if=pips>=5:adalet => exp(1.2,3.5,holy)` |
| s28 | K | – | Hüküm Zinciri | Karar Darbesi sonrası 4 sn +%5 saldırı hızı yığar (en fazla 3). | `T cast:knight_templar_verdict => buff(verdict_chain,4,{attackSpeed=.05},max=3)` |
| s29 | K | – | Hüküm Sahibi | Kritik şansı +%4; kritik vuruşlar %25 şansla +1 Adalet verir. | `S critChance=.04 ;; T crit ch=.25 => pip(adalet,1)` |
| s30 | K | A | Kutsal Kasırga | Karar Darbesi hasarı +%30; 5 Adalet'le kullanınca Kutsal Alev Dalgası sıfırlanır. | `M knight_templar_verdict dmgx=1.3 ;; T cast:knight_templar_verdict if=pips>=5:adalet => rst(knight_wake_of_flames)` |
| s30 | K | B | Cellat Yemini | Canı <%35 düşmanlara +%40 hasar; öldürünce +2 Adalet. | `S executeDamagePct=.40 ;; T kill => pip(adalet,2)` |


#### 2.10.2 Barbar (`barbarian`)

kaynak Öfke (`rage`) · spec: Savaş Lordu (Tank), Kasap (Hasarcı; kanama yığınları) · sınıf ağacı `s05`: **Yumruk Darbesi** (kesme) | **Korkutucu Haykırış**.

##### `class:barbarian` — Barbar — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `str` · s03 `physicalDamagePct` · s06 `maxHpPct` · s07 `attackSpeed` · s08 `critChance` · s10 `bleedDamagePct` · s14 `lifeSteal` · s16 `armorPct` · s19 `resourceGainPct` · s22 `staggerPct` · s23 `meleeDamagePct` · s24 `ccReductionPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Vahşi Sıçrayış | Sıçrayış bekleme −2 sn; inişte 2 sn %20 hareket hızı. | `M barbarian_leap cd=-2 ;; T cast:barbarian_leap => buff(wild_leap,2,{moveSpeedPct=.2})` |
| s02 | C | B | Çelik Ayak | Sıçrayış +1 şarj; şarjlar %30 daha yavaş dolar. | `M barbarian_leap chg=+1 cdx=1.3` |
| s04 | M | – | Parçalayıcı Yarma | Yarma kanaması +%30 güçlü, hasarı +%10. | `M barbarian_cleave dotx=1.3 dmgx=1.1` |
| s05 | A | A | Beceri: Yumruk Darbesi | Açılan beceri: `barbarian_pummel` (SkillDef satırı §1) | `G barbarian_pummel` |
| s05 | A | B | Beceri: Korkutucu Haykırış | Açılan beceri: `barbarian_intimidating_shout` (SkillDef satırı §1) | `G barbarian_intimidating_shout` |
| s09 | C | A | Kan Kalkanı | Öfken %50'nin üzerindeyken aldığın hasar %10 azalır. | `T tick:1 if=res>.5 => buff(blood_guard,2,{damageReductionPct=.1})` |
| s09 | C | B | Dirilen Öfke | Canın %35 altına düşünce +30 Öfke ve 5 sn %3 can çalma kazanırsın (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => res(30) ; buff(revenge_leech,5,{lifeSteal=.03})` |
| s11 | M | – | Kasırga Ustası | Kasırga yavaşlatması %50 azalır; Öfke maliyeti −%15. | `M barbarian_whirlwind costx=.85 p.moveSlow*=0.5` |
| s12 | M | – | Savaş Narası: Yankı | Savaş Narası bekleme −3 sn; müttefik hasar bonusu %50 artar. | `M barbarian_war_cry cd=-3 p.allyMore*=1.5` |
| s13 | M | – | Yer Sarsıntısı | Sıçrayış inişi %30 daha geniş ve 1 sn sersemletir. | `M barbarian_leap radx=1.3 st=stun:1:1` |
| s15 | C | A | Kanlı Tırpan | Yakın dövüş vuruşları %10 şansla kanama (4 sn) uygular. | `T hit:@melee ch=.1 => st(tgt,bleed,4,.3)` |
| s15 | C | B | Yıkıcı Güç | Yer Yaran ve Ata Fırtınası hasarı +%15, sarsması +%25. | `M barbarian_fissure+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25` |
| s17 | C | A | Öfke Pınarı | Öfke kazancı +%20. | `S resourceGainPct=.20` |
| s17 | C | B | Soğukkanlı Öfke | Maks. Öfke +10; vuruşlar %15 şansla +3 Öfke verir. | `S maxResource=10 ;; T hit ch=.15 => res(3)` |
| s18 | M | – | Fay Hattı | Yer Yaran bekleme −3 sn, menzil +3 m. | `M barbarian_fissure cd=-3 rng=+3` |
| s20 | M | – | Kan Çağrısı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Kemik Parçalayıcı Balta | Dönen Balta kanaması +%50 güçlü; geri dönerken ikinci kez vurur. | `M barbarian_axe_throw dotx=1.5 shape=return` |
| s25 | M | – | Hiddet Düzeni | Kan Hiddeti can maliyeti −%30, süresi +3 sn. | `M barbarian_blood_rage costx=.7 sdur=bloodrage:+3` |
| s26 | C | A | Savaş Haykırışı | Savaş Narası'nı kullanınca 20 m içindeki müttefikler 6 sn güçlenir. | `T cast:barbarian_war_cry => st(near(20),empower,6)` |
| s26 | C | B | Dayanıklı Ruh | Kontrol azaltma +%15; Kan Hiddeti kullanınca %10 can yenilenir. | `S ccReductionPct=.15 ;; T cast:barbarian_blood_rage => heal(.1)` |
| s27 | M | – | Nesillerin Fırtınası | Ata Fırtınası bekleme −%15; çekim gücü +%30. | `M barbarian_ancestral_tempest cdx=.85 p.pull*=1.3` |
| s28 | K | – | Sarsılmaz Kemik | Maks. can +%10. Ölümcül darbede %25 canla ayakta kalır, 6 sn Kan Hiddeti gücü kazanırsın (90 sn bekleme). | `S maxHpPct=.10 ;; T lethal icd=90 => heal(.25) ; st(self,bloodrage,6)` |
| s29 | K | – | Kan Seli | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(blood_tide,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Savaş Ruhu | Fiziksel hasar +%25; Ata Fırtınası hasarı +%25. | `S physicalDamagePct=.25 ;; M barbarian_ancestral_tempest dmgx=1.25` |
| s30 | K | B | Yaşayan Duvar | Maks. can +%12, zırh +%20; canın %50 altına düşünce 5 sn %10 kalkan (20 sn bekleme). | `S maxHpPct=.12 armorPct=.20 ;; T hurt if=hp<.5 icd=20 => abs(.1,5)` |

##### `spec:barbarian_warlord` — Savaş Lordu — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `maxHpPct` · s03 `armorPct` · s06 `threatPct` · s07 `vit` · s08 `lifeSteal` · s10 `resAll` · s14 `staggerPct` · s16 `meleeDamagePct` · s19 `ccReductionPct` · s22 `healReceivedPct` · s23 `guardGauge` · s24 `parryWindow`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Demir Duruş Hızı | Demir Duruş şarjları 1.5 sn daha hızlı dolar. | `M barbarian_iron_stance cd=-1.5` |
| s02 | C | B | Karşı Hasar | Demir Duruş karşı vuruşları +%20 hasar, +%30 sarsma verir. | `M barbarian_iron_stance dmgx=1.2 stgx=1.3` |
| s04 | M | – | Kükreyen Tehdit | Kükreyen Kışkırtma bekleme −2 sn, menzil +8 m. | `M barbarian_provoke cd=-2 rng=+8` |
| s05 | A | – | Beceri: Kan Zırhı | Açılan beceri: `barbarian_blood_shield` (SkillDef satırı §1) | `G barbarian_blood_shield` |
| s09 | C | A | Yara Kabuğu Sertleşir | Aldığın vuruşlar %10 şansla +5 Öfke verir. | `T hurt ch=.1 => res(5)` |
| s09 | C | B | Kanlı Direnç | Canın %50 altındayken %12 hasar azaltma kazanırsın. | `T tick:1 if=hp<.5 => buff(bloody_resolve,2,{damageReductionPct=.12})` |
| s11 | M | – | Kalın Kan Zırhı | Kan Zırhı emilimi +%25. | `M barbarian_blood_shield absx=1.25` |
| s12 | M | – | Kemik Kırıcı | Yarma tehdit çarpanı +%30, hasarı +%10. | `M barbarian_cleave p.threatMult*=1.3 dmgx=1.1` |
| s13 | M | – | Çelik Çember | Kasırga tehdit çarpanı +%25; Öfke maliyeti −%10. | `M barbarian_whirlwind p.threatMult*=1.25 costx=.9` |
| s15 | C | A | Öfke Zırhı Ustası | Öfken %50 üzerindeyken 2 sn'de bir yenilenen +%10 zırh ve +%1 can çalma kazanırsın. | `T tick:1 if=res>.5 => buff(rage_plate,2,{armorPct=.1,lifeSteal=.01})` |
| s15 | C | B | Karşı Hücum | Demir Duruş karşı vuruşları hedefi 1.5 sn yavaşlatır. | `M barbarian_iron_stance st=slow:1.5:.3` |
| s17 | C | A | Öfke Biriktirici | Öfke kazancı +%20. | `S resourceGainPct=.20` |
| s17 | C | B | Kendini Onaran | Kan Zırhı kullanınca %4 can yenilenir. | `T cast:barbarian_blood_shield => heal(.04)` |
| s18 | M | – | Meydan Nara'sı | Savaş Narası bekleme −3 sn; korku süresi +1 sn. | `M barbarian_war_cry cd=-3 sdur=fear:+1` |
| s20 | M | – | Uzun Direniş | Son Direniş bekleme −%15, 3 sn daha uzun sürer. | `M barbarian_last_stand cdx=.85 sdur=last_stand:+3` |
| s21 | M | – | Geniş Kükreme | Toplayıcı Kükreme +5 m yarıçap, 3 sn daha uzun sürer. | `M barbarian_rallying_roar rad=+5 sdur=rally:+3` |
| s25 | M | – | Kale Yıkıcı | Sıçrayış +200 sabit tehdit verir. | `M barbarian_leap p.threat+=200` |
| s26 | C | A | Sürü Koruyucusu | Demir Duruş kullanınca 10 m içindeki müttefikler 4 sn güçlenir. | `T cast:barbarian_iron_stance => st(near(10),fortify,4)` |
| s26 | C | B | Kan Bağı | Kan Zırhı kullanınca en yaralı müttefik %5 iyileşir. | `T cast:barbarian_blood_shield => healally(.05)` |
| s27 | M | – | Siper Fırtınası | Ata Fırtınası tehdit çarpanı +%30; sırasındaki hasar azaltma +%10. | `M barbarian_ancestral_tempest p.threatMult*=1.3 p.dr+=.1` |
| s28 | K | – | Yılmaz Savaşçı | Maks. can +%10, zırh +%10. Ölümcül darbede %25 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 armorPct=.10 ;; T lethal icd=90 => heal(.25) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Öfke Kalkanı | Aldığın vuruşlar %20 şansla 6 sn boyunca %4 hasar azaltma yığar (en fazla 4, 1 sn bekleme). | `T hurt ch=.2 icd=1 => buff(rage_shield,6,{damageReductionPct=.04},max=4)` |
| s30 | K | A | Savaş Efendisi | Maks. can +%12, tehdit +%15; Toplayıcı Kükreme bekleme −%20. | `S maxHpPct=.12 threatPct=.15 ;; M barbarian_rallying_roar cdx=.8` |
| s30 | K | B | Kan Kalesi | Can çalma +%2, zırh +%15; Kan Zırhı bekleme −%30. | `S lifeSteal=.02 armorPct=.15 ;; M barbarian_blood_shield cdx=.7` |

##### `spec:barbarian_butcher` — Kasap — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `bleedDamagePct` · s03 `physicalDamagePct` · s06 `attackSpeed` · s07 `critChance` · s08 `critDamage` · s10 `executeDamagePct` · s14 `bleedChance` · s16 `meleeDamagePct` · s19 `str` · s22 `resourceGainPct` · s23 `damagePct` · s24 `lifeSteal`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Parçalayıcı | Parçala hasarı +%15, kanaması +%25. | `M barbarian_rend dmgx=1.15 dotx=1.25` |
| s02 | C | B | Kan Kokusu | Kanayan düşmanlara +%10 hasar; kanama şansı +%8. | `S ailingDamagePct=.10 bleedChance=.08` |
| s04 | M | – | İdam Hazırlığı | Parçala bekleme −1 sn, Öfke maliyeti −%10. | `M barbarian_rend cd=-1 costx=.9` |
| s05 | A | – | Beceri: İdam | Açılan beceri: `barbarian_execute` (SkillDef satırı §1) | `G barbarian_execute` |
| s09 | C | A | Kan Hırsı | Kanayan düşmana vuruşlar %15 şansla %1.5 maks. can yeniler. | `T hit ch=.15 if=tst:bleed => heal(.015)` |
| s09 | C | B | Öfke Dönüşü | Kritik vuruşlar %20 şansla +4 Öfke verir. | `T crit ch=.2 => res(4)` |
| s11 | M | – | Cellat Baltası | İdam hasarı +%15, bekleme −1 sn. | `M barbarian_execute dmgx=1.15 cd=-1` |
| s12 | M | – | Kanlı Girdap | Kasırga hasarı +%10 ve vuruşlarda kanama uygular. | `M barbarian_whirlwind dmgx=1.1 st=bleed:4:.3` |
| s13 | M | – | Kanatan Yarma | Yarma kanaması +%30 güçlü, 2 sn daha uzun sürer. | `M barbarian_cleave dotx=1.3 sdur=bleed:+2` |
| s15 | C | A | Banyo Hazırlığı | Kan Banyosu bekleme −5 sn, patlama hasarı +%20. | `M barbarian_bloodbath cd=-5 dmgx=1.2` |
| s15 | C | B | Katliam | Katliam Çılgınlığı 4 sn daha uzun sürer. | `M barbarian_carnage sdur=carnage:+4` |
| s17 | C | A | Hırlayan Öfke | Öfke kazancı +%20. | `S resourceGainPct=.20` |
| s17 | C | B | Dönen Kemik | Dönen Balta kanaması +%40; geri dönerken vurur. | `M barbarian_axe_throw dotx=1.4 shape=return` |
| s18 | M | – | Parçalayıcı Fay | Yer Yaran bekleme −3 sn ve kanama uygular. | `M barbarian_fissure cd=-3 st=bleed:5:.4` |
| s20 | M | – | Sürü Çağrısı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Av Sıçrayışı | Sıçrayış bekleme −2 sn, hasarı +%15. | `M barbarian_leap cd=-2 dmgx=1.15` |
| s25 | M | – | Şiddet Düzeni | Kan Hiddeti 4 sn daha uzun sürer. | `M barbarian_blood_rage sdur=bloodrage:+4` |
| s26 | C | A | Sürü Lideri | Kurt Narası kullanınca +40 Öfke kazanırsın. | `T cast:barbarian_wolf_howl => res(40)` |
| s26 | C | B | Kan Dostları | Kanayan düşmanı öldürünce %20 şansla +6 Öfke ve %2 can kazanırsın. | `T kill if=tst:bleed ch=.2 => res(6) ; heal(.02)` |
| s27 | M | – | Kan Yağmuru | Ata Fırtınası hasarı +%15 ve kanama uygular. | `M barbarian_ancestral_tempest dmgx=1.15 st=bleed:4:.4` |
| s28 | K | – | Cellat Çağrısı | Canı <%35 düşmanlara +%30 hasar. İdam bir hedefi öldürürse bekleme süresi sıfırlanır. | `S executeDamagePct=.30 ;; T kill:barbarian_execute => rst(barbarian_execute)` |
| s29 | K | – | Kanlı Çılgınlık | Saldırı hızı +%5, kritik şansı +%2.5. | `S attackSpeed=.05 critChance=.025 ;; T crit ch=.15 => buff(frenzy_edge,4,{critDamage=.15},max=1)` |
| s30 | K | A | Kasap Efendisi | Kanama hasarı +%30; Kan Banyosu patlaması +%20 hasar. | `S bleedDamagePct=.30 ;; M barbarian_bloodbath dmgx=1.2` |
| s30 | K | B | Katliam Efendisi | Hasar +%8; İdam Öfke maliyeti −%50 ve hasarı +%20. | `S damagePct=.08 ;; M barbarian_execute costx=.5 dmgx=1.2` |


#### 2.10.3 Büyücü (`mage`)

kaynak Mana · spec: **Ateş**, **Buz**, **Gizem** (hepsi Hasarcı) · sınıf ağacı `s05`: **Büyü Kırma** (kesme) | **Buz Küresi** · `s30` A "Elementalist" Ateş/Buz için, B "Arkanist" Gizem için · `mage_time_warp` (m180) üç spec için de ortak.

##### `class:mage` — Büyücü — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `int` · s03 `castSpeed` · s06 `critChance` · s07 `critDamage` · s08 `resourceRegenPct` · s10 `cdr` · s14 `maxHpPct` · s16 `damagePct` · s19 `projectileDamagePct` · s22 `aoePct` · s23 `costReductionPct` · s24 `resAll`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Işınlanma Ustası | Işınlanma bekleme −1.5 sn; ayrıldığın yerdeki patlama +%20 hasar verir. | `M mage_blink cd=-1.5 dmgx=1.2` |
| s02 | C | B | Gölge Adım | Işınlanma +1 şarj (daha yavaş dolar); ışınlanınca 2 sn %15 hareket hızı. | `M mage_blink chg=+1 cdx=1.4 ;; T cast:mage_blink => buff(blink_haste,2,{moveSpeedPct=.15})` |
| s04 | M | – | Yoğun Ateş Topu | Ateş Topu patlama alanı +%20, hasarı +%10. | `M mage_fireball radx=1.2 dmgx=1.1` |
| s05 | A | A | Beceri: Büyü Kırma | Açılan beceri: `mage_counterspell` (SkillDef satırı §1) | `G mage_counterspell` |
| s05 | A | B | Beceri: Buz Küresi | Açılan beceri: `mage_ice_block` (SkillDef satırı §1) | `G mage_ice_block` |
| s09 | C | A | Büyü Zırhı | Manan %60 üzerindeyken aldığın hasar %8 azalır. | `T tick:1 if=res>.6 => buff(mana_ward,2,{damageReductionPct=.08})` |
| s09 | C | B | Son Sığınak | Canın %30 altına düşünce 8 sn maks. canının %20'si kadar kalkan kazanırsın (60 sn bekleme). | `T hurt if=hp<.3 icd=60 => abs(.2,8)` |
| s11 | M | – | Hızlı Buz Halkası | Buz Halkası bekleme −1.5 sn, alan +%10. | `M mage_frost_nova cd=-1.5 radx=1.1` |
| s12 | M | – | Hızlı Düşüş | Meteor bekleme −1.5 sn, ilk darbe hasarı +%10. | `M mage_meteor cd=-1.5 dmgx=1.1` |
| s13 | M | – | Geniş Kar Fırtınası | Kar Fırtınası alanı +%20, mana maliyeti −%15. | `M mage_blizzard radx=1.2 costx=.85` |
| s15 | C | A | Odaklı Büyü | Kritik hasarı +%15, kritik şansı +%1. | `S critDamage=.15 critChance=.01` |
| s15 | C | B | Alan Hâkimi | Alan hasarı +%10, alan genişliği +%8. | `S aoePct=.10 aoeRadiusPct=.08` |
| s17 | C | A | Zihin Pınarı | Mana yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Büyü Yankısı | Büyüler %12 şansla maks. mananın %5'ini iade eder. | `T cast:* ch=.12 => resp(.05)` |
| s18 | M | – | Küre Pulsarı | Gizemli Küre bekleme −1.5 sn, patlama hasarı +%20. | `M mage_arcane_orb cd=-1.5 dmgx=1.2` |
| s20 | M | – | Zaman Büyücüsü | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Kadim Kalkan | Büyü Kalkanı emilimi +%25, bekleme −3 sn. | `M mage_mana_barrier absx=1.25 cd=-3` |
| s25 | M | – | Kıyamet Çağrısı | Kadim Kıyamet bekleme −%15, yıldız sayısı +3. | `M mage_arcane_cataclysm cdx=.85 p.strikes+=3` |
| s26 | C | A | Zaman Bükücü | Zaman Bükülmesi kullanınca maks. mananın %50'si geri gelir ve Işınlanma sıfırlanır. | `T cast:mage_time_warp => resp(.5) ; rst(mage_blink)` |
| s26 | C | B | Koruyucu Büyücü | Büyü Kalkanı kullanınca 10 m içindeki müttefikler 4 sn güçlenir. | `T cast:mage_mana_barrier => st(near(10),fortify,4)` |
| s27 | M | – | Gök Taşı Yağmuru | Meteor ve Kar Fırtınası hasarı +%15, alanı +%10. | `M mage_meteor+mage_blizzard dmgx=1.15 radx=1.1` |
| s28 | K | – | Büyücü Kalkanı | Maks. can +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olur ve Işınlanma sıfırlanır (90 sn bekleme). | `S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5) ; rst(mage_blink)` |
| s29 | K | – | Element Akışı | Hasar +%6. Her büyü 4 sn boyunca +%3 hasar yığar (en fazla 3). | `S damagePct=.06 ;; T cast:@spell => buff(element_flow,4,{damagePct=.03},max=3)` |
| s30 | K | A | Elementalist | Ateş ve buz hasarı +%15. | `S fireDamagePct=.15 frostDamagePct=.15` |
| s30 | K | B | Arkanist | Gizem hasarı +%25; Kadim Kıyamet hasarı +%25. | `S arcaneDamagePct=.25 ;; M mage_arcane_cataclysm dmgx=1.25` |

##### `spec:mage_fire` — Ateş Büyücüsü — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `fireDamagePct` · s03 `critChance` · s06 `castSpeed` · s07 `critDamage` · s08 `burnChance` · s10 `dotPct` · s14 `int` · s16 `damagePct` · s19 `aoePct` · s22 `projectileDamagePct` · s23 `cdr` · s24 `resourceRegenPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Uzun Seri | Sıcak Seri 4 sn daha uzun sürer. | `X trait_pyromancer{streakDur=4}` |
| s02 | C | B | Çabuk Seri | Sıcak Seri için 2 yerine 1 art arda kritik yeter (6 sn bekleme). | `X trait_pyromancer{streakCrits=-1,streakIcd=6}` |
| s04 | M | – | Kızgın Dalga | Alev Dalgası hasarı +%15, yanması +%30. | `M mage_flame_wave dmgx=1.15 dotx=1.3` |
| s05 | A | – | Beceri: Anka Alevleri | Açılan beceri: `mage_phoenix_flames` (SkillDef satırı §1) | `G mage_phoenix_flames` |
| s09 | C | A | Kor Yürek | Yanan düşmana vuruşlar %15 şansla ek %50 ateş hasarı verir. | `T hit ch=.15 if=tst:burn => dmg(.5,fire)` |
| s09 | C | B | Kor Kalkanı | Ateş direnci +%20; hasar alınca %10 şansla 4 sn %5 kalkan. | `S resFire=.20 ;; T hurt ch=.1 => abs(.05,4)` |
| s11 | M | – | Yayılan Anka | Anka Alevleri +1 sekme yapar; sekme kaybı azalır. | `M mage_phoenix_flames p.bounces+=1 p.bounceMult*=1.06` |
| s12 | M | – | Kızıl Düşüş | Meteor bekleme −2 sn; döküm süresi −%50. | `M mage_meteor cd=-2 castx=.5` |
| s13 | M | – | Kor Fırtınası | Ateş Topu yanması +%30 güçlü, 2 sn daha uzun sürer. | `M mage_fireball dotx=1.3 sdur=burn:+2` |
| s15 | C | A | Yanış Ustası | Yanış 4 sn daha uzun sürer. | `M mage_combustion sdur=combustion:+4` |
| s15 | C | B | Bariyer Ustası | Alev Bariyeri emilimi +%30; yansıttığı yanma +%50. | `M mage_blazing_barrier absx=1.3 dotx=1.5` |
| s17 | C | A | Ateş Ruhu | Mana yenilenmesi +%20; ateş kritikleri %10 şansla %4 mana iade eder. | `S resourceRegenPct=.20 ;; T crit:@fire ch=.1 => resp(.04)` |
| s17 | C | B | Kor Çağrısı | Kritik şansı +%2; ateş kritikleri çevreye %50 ateş patlaması yapar (3 sn bekleme). | `S critChance=.02 ;; T crit:@fire icd=3 => exp(.5,4,fire)` |
| s18 | M | – | Kızıl Dalga | Alev Dalgası +1 şarj kazanır; şarjlar %20 daha yavaş dolar. | `M mage_flame_wave chg=+1 cdx=1.2` |
| s20 | M | – | Anka Gözü | Alev Bariyeri ve Yanış bekleme −%10. | `M mage_blazing_barrier+mage_combustion cdx=.9` |
| s21 | M | – | Yangın Çağrısı | Anka Alevleri bekleme −2 sn. | `M mage_phoenix_flames cd=-2` |
| s25 | M | – | Kızıl Taş | Meteor hasarı +%25; yerdeki ateş %30 daha güçlü. | `M mage_meteor dmgx=1.25 p.groundCoef*=1.3` |
| s26 | C | A | Kızıl Ahenk | Ateş büyüsünden sonra 4 sn buz hasarı +%15. | `T cast:@fire => buff(thermal_edge,4,{frostDamagePct=.15})` |
| s26 | C | B | Alev Dansı | Işınlanınca 4 sn ateş hasarı +%15. | `T cast:mage_blink => buff(ember_step,4,{fireDamagePct=.15})` |
| s27 | M | – | Kıyamet Kıvılcımı | Kadim Kıyamet hasarı +%15 ve yıldızlar yanma bırakır. | `M mage_arcane_cataclysm dmgx=1.15 st=burn:4:.5` |
| s28 | K | – | Kızıl Yürek | Ateş hasarı +%10, kritik şansı +%3. Yanış başlayınca 12 sn kritik hasarı +%25. | `S fireDamagePct=.10 critChance=.03 ;; T cast:mage_combustion => buff(red_heart,12,{critDamage=.25})` |
| s29 | K | – | Kor Kasırgası | Sıcak Seri ile Meteor atınca 3 sn büyü hızı +%15. | `T cast:mage_meteor if=sst:hot_streak => buff(ember_haste,3,{castSpeed=.15})` |
| s30 | K | A | Anka Efendisi | Ateş hasarı +%25; Anka Alevleri hasarı +%25. | `S fireDamagePct=.25 ;; M mage_phoenix_flames dmgx=1.25` |
| s30 | K | B | Güneş Kralı | Kritik şansı +%3, kritik hasarı +%15; Yanış bekleme −%20. | `S critChance=.03 critDamage=.15 ;; M mage_combustion cdx=.8` |

##### `spec:mage_frost` — Buz Büyücüsü — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `frostDamagePct` · s03 `castSpeed` · s06 `chilledDamagePct` · s07 `critChance` · s08 `critDamage` · s10 `ccDurationPct` · s14 `int` · s16 `damagePct` · s19 `projectileDamagePct` · s22 `cdr` · s23 `resourceRegenPct` · s24 `aoePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Parmak Şansı | Buz Parmakları kazanma şansı +%10. | `X trait_cryomancer{fofChance=.10}` |
| s02 | C | B | Derin Don | Buz Parmakları 1 yığın daha tutulur. | `X trait_cryomancer{fofMax=1}` |
| s04 | M | – | Keskin Mızrak | Buz Mızrağı hasarı +%15, delme +1. | `M mage_ice_lance dmgx=1.15 prc=+1` |
| s05 | A | – | Beceri: Dondurucu Sağanak | Açılan beceri: `mage_flurry` (SkillDef satırı §1) | `G mage_flurry` |
| s09 | C | A | Buz Kalkanı | Buz Halkası kullanınca 6 sn maks. canının %12'si kadar kalkan kazanırsın. | `T cast:mage_frost_nova => abs(.12,6)` |
| s09 | C | B | Donmuş Kalp | Canın %35 altına düşünce Buz Halkası sıfırlanır (45 sn bekleme). | `T hurt if=hp<.35 icd=45 => rst(mage_frost_nova)` |
| s11 | M | – | Parçalayıcı Mızrak | Donmuş hedefte Buz Mızrağı çevreye %80 buz patlaması yapar. | `T cast:mage_ice_lance if=tst:freeze => exp(.8,3,frost)` |
| s12 | M | – | Tipi | Dondurucu Sağanak +1 mermi atar. | `M mage_flurry cnt=+1` |
| s13 | M | – | Uzun Kış | Kar Fırtınası hasarı +%20. | `M mage_blizzard dmgx=1.2` |
| s15 | C | A | Damar Ustası | Ayaz Damarları 4 sn daha uzun sürer. | `M mage_icy_veins sdur=icy_veins:+4` |
| s15 | C | B | Buz Kıran | Üşümüş ve donmuş düşmanlara +%20 hasar. | `S chilledDamagePct=.20` |
| s17 | C | A | Kış Ruhu | Mana yenilenmesi +%20; Buz Mızrağı mana maliyeti −%20. | `S resourceRegenPct=.20 ;; M mage_ice_lance costx=.8` |
| s17 | C | B | Buz Kalbi | Üşümüş düşmanı öldürünce maks. mananın %8'ini geri alırsın. | `T kill if=tst:chill => resp(.08)` |
| s18 | M | – | Kar Perisi | Buz Halkası +1 şarj kazanır; şarjlar %25 daha yavaş dolar. | `M mage_frost_nova chg=+1 cdx=1.25` |
| s20 | M | – | Kış Büyücüsü | Ayaz Damarları ve Donmuş Küre bekleme −%10. | `M mage_icy_veins+mage_frozen_orb cdx=.9` |
| s21 | M | – | Girdap | Donmuş Küre +1 m yarıçap, hasarı +%15. | `M mage_frozen_orb rad=+1 dmgx=1.15` |
| s25 | M | – | Buzul Çağrısı | Kar Fırtınası ve Buz Halkası alanı +%20. | `M mage_blizzard+mage_frost_nova radx=1.2` |
| s26 | C | A | Soğuk Ahenk | Buz büyüsünden sonra 4 sn ateş hasarı +%15. | `T cast:@frost => buff(thermal_edge2,4,{fireDamagePct=.15})` |
| s26 | C | B | Donmuş Kalkan | Işınlanınca 3 sn %15 hasar azaltma kazanırsın. | `T cast:mage_blink => buff(frost_step,3,{damageReductionPct=.15})` |
| s27 | M | – | Kıyamet Soğuğu | Kadim Kıyamet hasarı +%15 ve yıldızlar üşütür. | `M mage_arcane_cataclysm dmgx=1.15 st=chill:4:1` |
| s28 | K | – | Buz Yürek | Buz hasarı +%10, büyü hızı +%4. Buz Halkası bir Buz Parmağı verir. | `S frostDamagePct=.10 castSpeed=.04 ;; T cast:mage_frost_nova => st(self,fingers_of_frost,15)` |
| s29 | K | – | Don Ustası | Kritik şansı +%3. Buz kritikleri %20 şansla çevreye %70 buz patlaması yapar. | `S critChance=.03 ;; T crit:@frost ch=.2 => exp(.7,3,frost)` |
| s30 | K | A | Buzul Efendisi | Buz hasarı +%25; Donmuş Küre hasarı +%25. | `S frostDamagePct=.25 ;; M mage_frozen_orb dmgx=1.25` |
| s30 | K | B | Kış Kralı | Büyü hızı +%8, kontrol süresi +%15; Ayaz Damarları bekleme −%20. | `S castSpeed=.08 ccDurationPct=.15 ;; M mage_icy_veins cdx=.8` |

##### `spec:mage_arcane` — Gizem Ustası — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `arcaneDamagePct` · s03 `resourceRegenPct` · s06 `castSpeed` · s07 `critChance` · s08 `critDamage` · s10 `maxResource` · s14 `int` · s16 `damagePct` · s19 `costReductionPct` · s22 `cdr` · s23 `aoePct` · s24 `projectileDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Yük Ustalığı | Gizem Yükü sınırı 1 artar. | `X trait_arcanist{chargeMax=1}` |
| s02 | C | B | Taşan Mana | Mana hasar bonusu eğimi +%0.1 artar. | `X trait_arcanist{manaSlope=.001}` |
| s04 | M | – | Hızlı Patlama | Gizem Patlaması döküm süresi −%15, hasarı +%10. | `M mage_arcane_blast castx=.85 dmgx=1.1` |
| s05 | A | – | Beceri: Gizem Barajı | Açılan beceri: `mage_arcane_barrage` (SkillDef satırı §1) | `G mage_arcane_barrage` |
| s09 | C | A | Yük Kalkanı | En az 2 Gizem Yükün varken %8 hasar azaltma kazanırsın. | `T tick:1 if=pips>=2:arcane => buff(charge_ward,2,{damageReductionPct=.08})` |
| s09 | C | B | Zihin Sığınağı | Canın %35 altına düşünce 1 sn dokunulmaz olur, maks. mananın %20'sini geri alırsın (45 sn bekleme). | `T hurt if=hp<.35 icd=45 => st(self,iframes,1) ; resp(.2)` |
| s11 | M | – | Hızlı Baraj | Gizem Barajı bekleme −1 sn, alanı +%20. | `M mage_arcane_barrage cd=-1 radx=1.2` |
| s12 | M | – | Küre Çekirdeği | Gizemli Küre kullanınca +1 Gizem Yükü kazanırsın. | `M mage_arcane_orb pip=arcane:1` |
| s13 | M | – | Gizem Zırhı | Büyü Kalkanı kullanınca +1 Gizem Yükü kazanırsın. | `T cast:mage_mana_barrier => pip(arcane,1)` |
| s15 | C | A | Dokunuş Ustası | Büyücü Dokunuşu 3 sn daha uzun sürer. | `M mage_touch_of_magi sdur=touch_of_magi:+3` |
| s15 | C | B | Yüklü Adım | Işınlanma +1 Gizem Yükü verir. | `T cast:mage_blink => pip(arcane,1)` |
| s17 | C | A | Mana Çağlayanı | Mana yenilenmesi +%20; Gizem Yükü kazanınca maks. mananın %3'ü geri gelir. | `S resourceRegenPct=.20 ;; T pip:arcane => resp(.03)` |
| s17 | C | B | Tasarruflu Büyücü | Gizem Patlaması mana maliyeti −%20; maliyet azaltma +%5. | `M mage_arcane_blast costx=.8 ;; S costReductionPct=.05` |
| s18 | M | – | Pulsar | Gizemli Küre bekleme −1.5 sn, patlama hasarı +%20. | `M mage_arcane_orb cd=-1.5 dmgx=1.2` |
| s20 | M | – | Zaman Dokunuşu | Büyücü Dokunuşu ve Gizem Dalgalanması bekleme −%10. | `M mage_touch_of_magi+mage_arcane_surge cdx=.9` |
| s21 | M | – | Yüklü Kıyamet | Kadim Kıyamet 2 Gizem Yükü verir. | `T cast:mage_arcane_cataclysm => pip(arcane,2)` |
| s25 | M | – | Gizem Siperi | Büyü Kalkanı emilimi +%25; kalkanlıyken 8 sn gizem hasarı +%10. | `M mage_mana_barrier absx=1.25 ;; T cast:mage_mana_barrier => buff(barrier_arcane,8,{arcaneDamagePct=.1})` |
| s26 | C | A | Mana Armağanı | Gizem Dalgalanması kullanınca grup 6 sn güçlenir. | `T cast:mage_arcane_surge => st(party,empower,6)` |
| s26 | C | B | Kendi Kalkanı | Büyücü Dokunuşu kullanınca 8 sn maks. canının %10'u kadar kalkan kazanırsın. | `T cast:mage_touch_of_magi => abs(.1,8)` |
| s27 | M | – | Baraj Yankısı | Gizem Barajı %25 şansla yarım güçte tekrar eder. | `T cast:mage_arcane_barrage ch=.25 => echo(mage_arcane_barrage,.5,.4)` |
| s28 | K | – | Gizem Yürek | Gizem hasarı +%10, büyü hızı +%5. 4 Gizem Yükünde 3 sn büyü hızı +%10. | `S arcaneDamagePct=.10 castSpeed=.05 ;; T pip:arcane if=pips>=4:arcane => buff(full_charge,3,{castSpeed=.10})` |
| s29 | K | – | Mana Hâkimi | Manan %70 üzerindeyken kritik şansı +%6. | `T tick:1 if=res>.7 => buff(mana_master,2,{critChance=.06})` |
| s30 | K | A | Kadim Arkanist | Gizem hasarı +%25; Gizem Barajı hasarı +%25. | `S arcaneDamagePct=.25 ;; M mage_arcane_barrage dmgx=1.25` |
| s30 | K | B | Zaman Efendisi | Büyü hızı +%8, bekleme azaltma +%4; Gizem Dalgalanması bekleme −%20. | `S castSpeed=.08 cdr=.04 ;; M mage_arcane_surge cdx=.8` |


#### 2.10.4 Haydut (`rogue`)

kaynak Enerji · pip Kombo (Suikastçı) / Karışım (Simyacı) · spec: Suikastçı (Hasarcı), Simyacı (Şifacı) · sınıf ağacı `s05`: **Tekme** (kesme) | **Gölge Pelerini**.

##### `class:rogue` — Haydut — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `dex` · s03 `critChance` · s06 `critDamage` · s07 `attackSpeed` · s08 `dodgeChance` · s10 `physicalDamagePct` · s14 `moveSpeedPct` · s16 `poisonDamagePct` · s19 `maxHpPct` · s22 `cdr` · s23 `resourceRegenPct` · s24 `projectileDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Gölge Adım Ustası | Gölge Adımı bekleme −2 sn. | `M rogue_shadow_step cd=-2` |
| s02 | C | B | Çevik Ayak | Gölge Adımı +1 şarj (daha yavaş dolar); hareket hızı +%6. | `M rogue_shadow_step chg=+1 cdx=1.3 ;; S moveSpeedPct=.06` |
| s04 | M | – | Keskin Arbalet | Arbalet Atışı hasarı +%15, delme +1. | `M rogue_crossbow_shot dmgx=1.15 prc=+1` |
| s05 | A | A | Beceri: Tekme | Açılan beceri: `rogue_kick` (SkillDef satırı §1) | `G rogue_kick` |
| s05 | A | B | Beceri: Gölge Pelerini | Açılan beceri: `rogue_cloak_of_shadows` (SkillDef satırı §1) | `G rogue_cloak_of_shadows` |
| s09 | C | A | Kaçınma Sanatı | Kaçındığın her saldırı +8 Enerji verir (2 sn bekleme). | `T dodge icd=2 => res(8)` |
| s09 | C | B | Gölge Kalkan | Canın %35 altına düşünce 2 sn gizlenir ve %15 can yenilersin (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => st(self,stealth,2) ; heal(.15)` |
| s11 | M | – | Hızlı Yelpaze | Bıçak Yelpazesi bekleme −1.5 sn, zehri +%25. | `M rogue_fan_of_knives cd=-1.5 dotx=1.25` |
| s12 | M | – | İnfaz Ustası | İnfaz hasarı +%15, sarsması +%10. | `M rogue_eviscerate dmgx=1.15 stgx=1.1` |
| s13 | M | – | Duman Ustası | Duman Bombası bekleme −3 sn, alanı +%20. | `M rogue_smoke_bomb cd=-3 radx=1.2` |
| s15 | C | A | Zehir Ustası | Zehir hasarı +%15; vuruşlar %10 şansla zehir uygular. | `S poisonDamagePct=.15 ;; T hit ch=.1 => st(tgt,poison,6,.2)` |
| s15 | C | B | Kanayan Bıçak | Kritik vuruşlar %20 şansla 5 sn kanama uygular. | `T crit ch=.2 => st(tgt,bleed,5,.4)` |
| s17 | C | A | Enerji Pınarı | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Hızlı Eller | Enerji maliyetleri −%10, saldırı hızı +%3. | `S costReductionPct=.10 attackSpeed=.03` |
| s18 | M | – | Kara Bulut | Ok Yağmuru bekleme −3 sn, yarıçapı +1 m. | `M rogue_bolt_rain cd=-3 rad=+1` |
| s20 | M | – | Gölge Zamanı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Pusu Hazırlığı | Gölge Adımı sonrası 3 sn kritik şansı +%10. | `T cast:rogue_shadow_step => buff(shadow_edge,3,{critChance=.10})` |
| s25 | M | – | Yoğun Zehir | Ölümcül Zehir 4 sn daha uzun sürer, hasarı +%25. | `M rogue_deadly_venom sdur=venom:+4 dmgx=1.25` |
| s26 | C | A | Gölge Ortağı | Duman Bombası 8 m içindeki müttefiklere 4 sn hız verir. | `T cast:rogue_smoke_bomb => st(near(8),haste,4)` |
| s26 | C | B | Çalıntı Şans | Ölümcül Zehir kullanınca maks. enerjinin %20'si geri gelir. | `T cast:rogue_deadly_venom => resp(.2)` |
| s27 | M | – | Dans Zinciri | Ölüm Dansı bekleme −%15, hasarı +%10. | `M rogue_death_blossom cdx=.85 dmgx=1.1` |
| s28 | K | – | Gölge Pelerini | Maks. can +%8, kaçınma +%2. Ölümcül darbede %20 canla ayakta kalır, 3 sn gizlenirsin (90 sn bekleme). | `S maxHpPct=.08 dodgeChance=.02 ;; T lethal icd=90 => heal(.2) ; st(self,stealth,3)` |
| s29 | K | – | Katil Refleksi | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(assassin_rhythm,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Gölge Ustası | Kritik hasarı +%30, kritik şansı +%2. | `S critDamage=.30 critChance=.02` |
| s30 | K | B | Zehir Kralı | Zehir hasarı +%25, zamanla hasar +%10; Ölümcül Zehir hasarı +%20. | `S poisonDamagePct=.25 dotPct=.10 ;; M rogue_deadly_venom dmgx=1.2` |

##### `spec:rogue_assassin` — Suikastçı — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `critChance` · s03 `critDamage` · s06 `attackSpeed` · s07 `physicalDamagePct` · s08 `dex` · s10 `executeDamagePct` · s14 `damagePct` · s16 `bleedDamagePct` · s19 `meleeDamagePct` · s22 `finisherPct` · s23 `dodgeChance` · s24 `cdr`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Arkadan Hasat | Sırttan Bıçak hasarı +%15; +1 Kombo verir. | `M rogue_backstab dmgx=1.15 pip=combo:1` |
| s02 | C | B | Gölge Atılışı | Gölge Adımı sonrası 4 sn enerji maliyetleri −%40. | `T cast:rogue_shadow_step => buff(step_edge,4,{costReductionPct=.4})` |
| s04 | M | – | Keskin Sırt | Sırttan Bıçak enerji maliyeti −%10, menzili +0.4 m. | `M rogue_backstab costx=.9 rng=+0.4` |
| s05 | A | – | Beceri: Gırtlak Kesme | Açılan beceri: `rogue_garrote` (SkillDef satırı §1) | `G rogue_garrote` |
| s09 | C | A | Susturucu | Gırtlak Kesme bekleme −2 sn, susturma +1.5 sn. | `M rogue_garrote cd=-2 sdur=silence:+1.5` |
| s09 | C | B | Kan Dansı | Kanayan hedefe Sırttan Bıçak %30 şansla ek %80 fiziksel hasar vurur. | `T hit:rogue_backstab ch=.3 if=tst:bleed => dmg(.8,physical)` |
| s11 | M | – | Gölge Biçer | 5 Kombo'da İnfaz %20 şansla 2 Kombo iade eder. | `T cast:rogue_eviscerate if=pips>=5:combo ch=.2 => pip(combo,2)` |
| s12 | M | – | Garrote Zehri | Gırtlak Kesme kanaması +%40, süresi +2 sn. | `M rogue_garrote dotx=1.4 sdur=bleed:+2` |
| s13 | M | – | Hızlı Bıçak | Temel zincir hasarı +%10, saldırı hızı +%3. | `M rogue_basic dmgx=1.1 ;; S attackSpeed=.03` |
| s15 | C | A | Bıçak Ustası | Gölge Bıçakları 4 sn daha uzun sürer. | `M rogue_shadow_blades sdur=shadow_blades:+4` |
| s15 | C | B | Karanlık Dans | Ölümcül Gölge Dansı 2 sn daha uzun sürer. | `M rogue_shadow_dance sdur=shadow_veil_cd:+2` |
| s17 | C | A | Enerji Hırsı | Enerji yenilenmesi +%20; kritik vuruşlar %15 şansla +5 Enerji verir. | `S resourceRegenPct=.20 ;; T crit ch=.15 => res(5)` |
| s17 | C | B | Ölümcül Sakinlik | Gizlilikten vurunca 4 sn saldırı hızı +%12 (5 sn bekleme). | `T hit if=stealth icd=5 => buff(ambush_rush,4,{attackSpeed=.12})` |
| s18 | M | – | Suikast Planı | Gölge Adımı sonrası ilk 4 sn hasar +%25. | `T cast:rogue_shadow_step => buff(vanish_edge,4,{damagePct=.25})` |
| s20 | M | – | Gecenin Katili | Gölge Bıçakları ve Ölümcül Gölge Dansı bekleme −%10. | `M rogue_shadow_blades+rogue_shadow_dance cdx=.9` |
| s21 | M | – | Gölge Çiçeği | Ölüm Dansı bekleme −8 sn, hasarı +%20. | `M rogue_death_blossom cd=-8 dmgx=1.2` |
| s25 | M | – | Zehirli Gölge | Bıçak Yelpazesi kritik şansı +%15, zehri +%30. | `M rogue_fan_of_knives crit=+.15 dotx=1.3` |
| s26 | C | A | Gölge Ortağı | Ölümcül Gölge Dansı 10 m içindeki müttefiklere 4 sn hız verir. | `T cast:rogue_shadow_dance => st(near(10),haste,4)` |
| s26 | C | B | Kan Hırsızı | Öldürünce %20 şansla +10 Enerji ve %2 can kazanırsın. | `T kill ch=.2 => res(10) ; heal(.02)` |
| s27 | M | – | Ölümcül Ritim | Gölge Bıçakları sırasında İnfaz %30 şansla yarı güçte tekrar vurur. | `T cast:rogue_eviscerate if=sst:shadow_blades ch=.3 => echo(rogue_eviscerate,.6,.3)` |
| s28 | K | – | Gölge Hasadı | Kritik hasarı +%20. 5 Kombo'da İnfaz kullanınca 2 sn gizlenirsin. | `S critDamage=.20 ;; T cast:rogue_eviscerate if=pips>=5:combo => st(self,stealth,2)` |
| s29 | K | – | Katil Ritmi | Hasar +%6, kritik şansı +%2. Kritik vuruşlar 4 sn +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 critChance=.02 ;; T crit => buff(killer_rhythm,4,{attackSpeed=.05},max=4)` |
| s30 | K | A | Gece Efendisi | Kritik şansı +%3, kritik hasarı +%20; Sırttan Bıçak hasarı +%25. | `S critChance=.03 critDamage=.20 ;; M rogue_backstab dmgx=1.25` |
| s30 | K | B | Gölge Hükümdarı | Fiziksel hasar +%20; İnfaz hasarı +%30; Gölge Adımı +1 şarj. | `S physicalDamagePct=.20 ;; M rogue_eviscerate dmgx=1.3 ;; M rogue_shadow_step chg=+1` |

##### `spec:rogue_alchemist` — Simyacı — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `healingPct` · s03 `resourceRegenPct` · s06 `maxHpPct` · s07 `dex` · s08 `cdr` · s10 `healReceivedPct` · s14 `moveSpeedPct` · s16 `poisonDamagePct` · s19 `costReductionPct` · s22 `armorPct` · s23 `resAll` · s24 `dodgeChance`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Geniş Şişe | Şifa Şişesi alanı +%20, iyileştirmesi +%10. | `M rogue_vial_heal radx=1.2 healx=1.1` |
| s02 | C | B | Hızlı Şişe | Şifa Şişesi bekleme −0.3 sn, maliyeti −%15. | `M rogue_vial_heal cd=-0.3 costx=.85` |
| s04 | M | – | Taze Karışım | Şişe Fırlat iyileştirmesi +%25. | `M rogue_vial_throw healx=1.25` |
| s05 | A | – | Beceri: Duman Siperi | Açılan beceri: `rogue_smoke_ward` (SkillDef satırı §1) | `G rogue_smoke_ward` |
| s09 | C | A | Panzehir Ustası | Panzehir bekleme −2 sn ve 1 ek olumsuz etki temizler. | `M rogue_antidote cd=-2 p.dispel+=1` |
| s09 | C | B | Güçlü Tonik | Panzehir iyileştirmesi +%40. | `M rogue_antidote healx=1.4` |
| s11 | M | – | Yoğun Damla | Mucize Damla iyileştirmesi +%15. | `M rogue_mending_draught healx=1.15` |
| s12 | M | – | Şişe Yağmuru | Şifa Şişesi birikintisi 3 sn daha uzun sürer ve %10 daha çok iyileştirir. | `M rogue_vial_heal dur=+3 healx=1.1` |
| s13 | M | – | Uzun Siper | Duman Siperi bekleme −4 sn, alanı +%20. | `M rogue_smoke_ward cd=-4 radx=1.2` |
| s15 | C | A | Ayık Kafa | Şifalar %12 şansla en yaralı müttefiği %5 iyileştirir. | `T heal ch=.12 => healally(.05)` |
| s15 | C | B | Zehirli Dokunuş | Şişe Fırlat %20 şansla düşmana zehir uygular. | `T hit:rogue_vial_throw ch=.2 => st(tgt,poison,6,.2)` |
| s17 | C | A | Enerji Eczası | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Taşan Eczacı | Şifalar %10 şansla maks. enerjinin %5'ini iade eder. | `T heal ch=.1 => resp(.05)` |
| s18 | M | – | Hızlandırıcı Şişe | Şifa Şişesi 10 m içindeki müttefiklere 3 sn güçlendirme verir. | `T cast:rogue_vial_heal => st(near(10),fortify,3)` |
| s20 | M | – | Karışım Dengesi | Karışım Puanı kazandığında %15 şansla +1 ek puan kazanırsın. | `T pip:karisim ch=.15 => pip(karisim,1)` |
| s21 | M | – | Hayat İksiri Ustalığı | Hayat İksiri Yağmuru iyileştirmesi +%20. | `M rogue_elixir_of_life healx=1.2` |
| s25 | M | – | Mucize Karışım Ustalığı | Mucize Karışım 4 sn daha uzun sürer. | `M rogue_miracle_brew sdur=brew_zone:+4` |
| s26 | C | A | Grup İksiri | Hızlandırıcı İksir kullanınca grup 6 sn yenilenme kazanır. | `T cast:rogue_haste_elixir => st(party,regen,6)` |
| s26 | C | B | Seyyar Şifacı | Hareket hızı +%8; hareket halindeyken şifa gücü +%10. | `S moveSpeedPct=.08 ;; T tick:1 if=moving => buff(walking_apothecary,2,{healingPct=.1})` |
| s27 | M | – | Hızlandırıcı Usta | Hızlandırıcı İksir 8 sn daha uzun sürer. | `M rogue_haste_elixir sdur=hero_haste:+8` |
| s28 | K | – | Eczacı Ustası | Şifa gücü +%12, maks. can +%5. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S healingPct=.12 maxHpPct=.05 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Kadim Formül | Şifa gücü +%8. 5 Karışım Puanı ile Mucize Damla en yaralı müttefiği ek %10 iyileştirir. | `S healingPct=.08 ;; T cast:rogue_mending_draught if=pips>=5:karisim => healally(.1)` |
| s30 | K | A | Büyük Simyager | Şifa gücü +%20; Hayat İksiri Yağmuru bekleme −%15. | `S healingPct=.20 ;; M rogue_elixir_of_life cdx=.85` |
| s30 | K | B | Zehirli Şifa | Zehir hasarı +%25, şifa gücü +%8; şifalar %10 şansla düşmanlara zehir bulutu bırakır. | `S poisonDamagePct=.25 healingPct=.08 ;; T heal ch=.1 => exp(.6,4,poison)` |


#### 2.10.5 Keşiş (`monk`)

kaynak Enerji · pip Çi · spec: Demci (Tank), Rüzgâr Yürüyen (Hasarcı), Sis Dokuyan (Şifacı; kit wave 2) · sınıf ağacı `s05`: **Mızrak Eli** (kesme) | **Karma Dokunuşu**.

##### `class:monk` — Keşiş — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `dex` · s03 `attackSpeed` · s06 `physicalDamagePct` · s07 `critChance` · s08 `moveSpeedPct` · s10 `dodgeChance` · s14 `maxHpPct` · s16 `meleeDamagePct` · s19 `resourceRegenPct` · s22 `cdr` · s23 `critDamage` · s24 `ccReductionPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Akış | Çi Torpidosu bekleme −2 sn. | `M monk_chi_torpedo cd=-2` |
| s02 | C | B | Rüzgâr Adımı | Hareket hızı +%8; bir saldırıdan kaçınınca 2 sn saldırı hızı +%15. | `S moveSpeedPct=.08 ;; T dodge => buff(wind_step,2,{attackSpeed=.15})` |
| s04 | M | – | Sert Avuç | Kaplan Avucu hasarı +%15 ve +1 ek Çi verir. | `M monk_tiger_palm dmgx=1.15 pip=chi:1` |
| s05 | A | A | Beceri: Mızrak Eli | Açılan beceri: `monk_spear_hand` (SkillDef satırı §1) | `G monk_spear_hand` |
| s05 | A | B | Beceri: Karma Dokunuşu | Açılan beceri: `monk_touch_of_karma` (SkillDef satırı §1) | `G monk_touch_of_karma` |
| s09 | C | A | Çi Kalkanı | Çi harcayınca 3 sn %10 hasar azaltma kazanırsın. | `T spend:chi => buff(chi_ward,3,{damageReductionPct=.1})` |
| s09 | C | B | Bedenin Direnci | Canın %35 altına düşünce %15 can yenilenir ve +2 Çi kazanırsın (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => heal(.15) ; pip(chi,2)` |
| s11 | M | – | Çevik Torpido | Çi Torpidosu +1 şarj (daha yavaş dolar); yol hasarı +%20. | `M monk_chi_torpedo chg=+1 cdx=1.3 dmgx=1.2` |
| s12 | M | – | Dönen Turna | Dönen Turna Tekmesi alanı +%15, hasarı +%15. | `M monk_spinning_crane radx=1.15 dmgx=1.15` |
| s13 | M | – | Ağır Tekme | Kara Tekme hasarı +%15, sarsması +%25. | `M monk_blackout_kick dmgx=1.15 stgx=1.25` |
| s15 | C | A | Çi Ustası | Harcadığın Çi'nin %15 şansla 1 puanı geri döner. | `T spend:chi ch=.15 => pip(chi,1)` |
| s15 | C | B | Yumruk Fırtınası | Saldırı hızı +%6; temel zincir hasarı +%10. | `S attackSpeed=.06 ;; M monk_basic dmgx=1.1` |
| s17 | C | A | Enerji Pınarı | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | İçsel Huzur | Enerji maliyetleri −%10; Çi kazanınca maks. enerjinin %3'ü geri gelir. | `S costReductionPct=.10 ;; T pip:chi => resp(.03)` |
| s18 | M | – | Ejder Atılışı | Uçan Yılan Tekmesi bekleme −2 sn, iniş alanı +%20. | `M monk_flying_serpent cd=-2 radx=1.2` |
| s20 | M | – | Tekke Sırrı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Sekme Ustası | Çi Dalgası +1 sekme yapar; sekme kaybı azalır. | `M monk_chi_wave p.bounces+=1 p.bounceMult*=1.05` |
| s25 | M | – | Uzun Hırs | Kaplan Hırsı 3 sn daha uzun sürer, bekleme −8 sn. | `M monk_tigers_lust sdur=tigerlust:+3 cd=-8` |
| s26 | C | A | Tekke Kardeşliği | Kaplan Hırsı 10 m içindeki müttefiklere 5 sn hız verir. | `T cast:monk_tigers_lust => st(near(10),haste,5)` |
| s26 | C | B | Sabır | Cennet Yumrukları sırasında alınan hasar %10 daha azalır. | `M monk_fists_of_fury p.dr+=.1` |
| s27 | M | – | Göğün Yumrukları | Cennet Yumrukları bekleme −%15; son vuruş hasarı +%25. | `M monk_fists_of_fury cdx=.85 p.finalCoef*=1.25` |
| s28 | K | – | Sarsılmaz Beden | Maks. can +%8, kaçınma +%2. Ölümcül darbede %20 canla ayakta kalır ve +3 Çi kazanırsın (90 sn bekleme). | `S maxHpPct=.08 dodgeChance=.02 ;; T lethal icd=90 => heal(.2) ; pip(chi,3)` |
| s29 | K | – | Akan Yumruk | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(flowing_fist,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Usta Yumruk | Fiziksel hasar +%25; Cennet Yumrukları hasarı +%25. | `S physicalDamagePct=.25 ;; M monk_fists_of_fury dmgx=1.25` |
| s30 | K | B | Rüzgârın Çocuğu | Hareket hızı +%8, saldırı hızı +%5; Çi Torpidosu bekleme −%25. | `S moveSpeedPct=.08 attackSpeed=.05 ;; M monk_chi_torpedo cdx=.75` |

##### `spec:monk_brewmaster` — Demci — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `maxHpPct` · s03 `armorPct` · s06 `dodgeChance` · s07 `threatPct` · s08 `vit` · s10 `resAll` · s14 `staggerPct` · s16 `healReceivedPct` · s19 `ccReductionPct` · s22 `parryWindow` · s23 `guardGauge` · s24 `meleeDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Fıçı Hızı | Fıçı Darbesi bekleme −1.5 sn, alanı +%15. | `M monk_keg_smash cd=-1.5 radx=1.15` |
| s02 | C | B | Sarsma Yumuşatıcı | Sarsma havuzu emilimi +%5 artar. | `X trait_brewmaster{staggerAbsorb=.05}` |
| s04 | M | – | Alay Ustası | Alay Et bekleme −2 sn, menzil +8 m. | `M monk_provoke cd=-2 rng=+8` |
| s05 | A | – | Beceri: Arındırıcı İksir | Açılan beceri: `monk_purifying_brew` (SkillDef satırı §1) | `G monk_purifying_brew` |
| s09 | C | A | Çifte İksir | Arındırıcı İksir +1 şarj kazanır; şarjlar %20 daha yavaş dolar. | `M monk_purifying_brew chg=+1 cdx=1.2` |
| s09 | C | B | Sarhoş Duruş | Başarılı savuşturma Sarsma havuzunu ek %10 temizler. | `X trait_brewmaster{parryPurge=.10}` |
| s11 | M | – | Kara Tekme: Tehdit | Kara Tekme tehdit çarpanı +%30, hasarı +%10. | `M monk_blackout_kick p.threatMult*=1.3 dmgx=1.1` |
| s12 | M | – | Kızıl Pınar | Fıçı Darbesi hasarı +%15; Zayıflatma 4 sn daha uzun sürer. | `M monk_keg_smash dmgx=1.15 sdur=brewed:+4` |
| s13 | M | – | Kaplan Tehdidi | Kaplan Avucu tehdit çarpanı +%30, hasarı +%10. | `M monk_tiger_palm p.threatMult*=1.3 dmgx=1.1` |
| s15 | C | A | Kaçak Fıçı | Bir saldırıdan kaçınınca Fıçı Darbesi bekleme süresi 1 sn azalır (2 sn bekleme). | `T dodge icd=2 => cdr(monk_keg_smash,1)` |
| s15 | C | B | Demir Deri | Canın %60 altındayken zırhın +%20 artar. | `T tick:1 if=hp<.6 => buff(iron_skin,2,{armorPct=.2})` |
| s17 | C | A | Enerji Çeşmesi | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Kalp Atışı | Çi harcayınca maks. canının %2'si yenilenir. | `T spend:chi => heal(.02)` |
| s18 | M | – | Yumuşak Vuruş | Sarsma havuzunun erime hızı %10 azalır. | `X trait_brewmaster{poolDecay=-.1}` |
| s20 | M | – | Karanlık Pınar | Güçlendirici İksir ve Kara Öküz bekleme −%10. | `M monk_bm_fortifying_brew+monk_bm_black_ox cdx=.9` |
| s21 | M | – | Öküz Yoldaşı | Kara Öküz hasarı +%25 ve 6 sn daha uzun kalır. | `M monk_bm_black_ox dmgx=1.25 p.life+=6` |
| s25 | M | – | İksir Ustalığı | Güçlendirici İksir 5 sn daha uzun sürer, iyileştirmesi +%25. | `M monk_bm_fortifying_brew sdur=fortifying:+5 healx=1.25` |
| s26 | C | A | Tekke Muhafızı | Alay Et kullanınca 10 m içindeki müttefikler 4 sn güçlenir. | `T cast:monk_provoke => st(near(10),fortify,4)` |
| s26 | C | B | İkram | Arındırıcı İksir kullanınca en yaralı müttefik %6 iyileşir. | `T cast:monk_purifying_brew => healally(.06)` |
| s27 | M | – | Demir Yumruklar | Cennet Yumrukları tehdit çarpanı +%30, sırasındaki hasar azaltma +%10. | `M monk_fists_of_fury p.threatMult*=1.3 p.dr+=.1` |
| s28 | K | – | Sarsılmaz Usta | Maks. can +%10, zırh +%10. Ölümcül darbede %25 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 armorPct=.10 ;; T lethal icd=90 => heal(.25) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Pınar Ruhu | Siper dayanıklılığı +15, savuşturma penceresi +0.03 sn. Savuşturma Fıçı Darbesi'ni sıfırlar (8 sn bekleme). | `S parryWindow=.03 guardGauge=15 ;; T parry icd=8 => rst(monk_keg_smash)` |
| s30 | K | A | Usta Demci | Maks. can +%10, kaçınma +%2; Arındırıcı İksir bekleme −%20. | `S maxHpPct=.10 dodgeChance=.02 ;; M monk_purifying_brew cdx=.8` |
| s30 | K | B | Ejder Pınarı | Alınan iyileştirme +%15, tehdit +%15; Kara Öküz bekleme −%20. | `S healReceivedPct=.15 threatPct=.15 ;; M monk_bm_black_ox cdx=.8` |

##### `spec:monk_windwalker` — Rüzgâr Yürüyen — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `attackSpeed` · s03 `critChance` · s06 `physicalDamagePct` · s07 `meleeDamagePct` · s08 `critDamage` · s10 `dex` · s14 `damagePct` · s16 `finisherPct` · s19 `weaponArtPct` · s22 `moveSpeedPct` · s23 `cdr` · s24 `resourceGainPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Çifte Tekme | Kara Tekme %25 şansla yarı güçte ikinci kez vurur. | `T cast:monk_blackout_kick ch=.25 => echo(monk_blackout_kick,.6,.3)` |
| s02 | C | B | Uzun Öfke | Kaplan Öfkesi 4 sn daha uzun sürer. | `M monk_ww_tigers_fury sdur=tigerfury:+4` |
| s04 | M | – | Keskin Güneş | Doğan Güneş Tekmesi hasarı +%15, sarsması +%20. | `M monk_rising_sun_kick dmgx=1.15 stgx=1.2` |
| s05 | A | – | Beceri: Dönen Ejder Yumruğu | Açılan beceri: `monk_whirling_dragon` (SkillDef satırı §1) | `G monk_whirling_dragon` |
| s09 | C | A | Kombo Kırıcı | Kaplan Avucu %12 şansla 6 sn boyunca enerji maliyetlerini −%40 yapar. | `T cast:monk_tiger_palm ch=.12 => buff(combo_break,6,{costReductionPct=.4})` |
| s09 | C | B | Rüzgâr Sırtı | Çi harcayınca 3 sn hareket hızı +%12. | `T spend:chi => buff(wind_back,3,{moveSpeedPct=.12})` |
| s11 | M | – | Ejder Kasırgası | Dönen Ejder Yumruğu alanı +%15, hasarı +%15. | `M monk_whirling_dragon radx=1.15 dmgx=1.15` |
| s12 | M | – | Cennet Hasadı | Cennet Yumrukları hasarı +%10; kullanınca %15 şansla 3 Çi iade eder. | `M monk_fists_of_fury dmgx=1.1 ;; T cast:monk_fists_of_fury ch=.15 => pip(chi,3)` |
| s13 | M | – | Yılan Atılışı | Uçan Yılan Tekmesi 1 Çi iade eder. | `T cast:monk_flying_serpent => pip(chi,1)` |
| s15 | C | A | Fırtına Ustası | Fırtına, Toprak ve Ateş 5 sn daha uzun sürer. | `M monk_ww_storm_earth_fire sdur=empower:+5` |
| s15 | C | B | Aslan Yürek | Kaplan Öfkesi sırasında kritik şansı +%8. | `T cast:monk_ww_tigers_fury => buff(tiger_crit,12,{critChance=.08})` |
| s17 | C | A | Enerji Akışı | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Çi Akışı | Temel vuruşlar %10 şansla +1 Çi verir. | `T hit:@basic ch=.1 => pip(chi,1)` |
| s18 | M | – | Torpido Rüzgârı | Çi Torpidosu sonrası 4 sn saldırı hızı +%12. | `T cast:monk_chi_torpedo => buff(torpedo_haste,4,{attackSpeed=.12})` |
| s20 | M | – | Rüzgâr Yürüyüşçüsü | Kaplan Öfkesi ve Fırtına, Toprak ve Ateş bekleme −%10. | `M monk_ww_tigers_fury+monk_ww_storm_earth_fire cdx=.9` |
| s21 | M | – | Güneş Yankısı | Doğan Güneş Tekmesi %15 şansla yarı güçte tekrar eder. | `T cast:monk_rising_sun_kick ch=.15 => echo(monk_rising_sun_kick,.5,.4)` |
| s25 | M | – | Rüzgâr Dalgası | Çi Dalgası hasarı +%20 ve +1 Çi verir. | `M monk_chi_wave dmgx=1.2 pip=chi:1` |
| s26 | C | A | Kopya Ustası | Fırtına, Toprak ve Ateş sırasında yoldaş hasarın +%25 artar. | `T cast:monk_ww_storm_earth_fire => buff(clone_edge,15,{minionDamagePct=.25})` |
| s26 | C | B | Rüzgâr Dostu | Kaplan Öfkesi 10 m içindeki müttefiklere 6 sn hız verir. | `T cast:monk_ww_tigers_fury => st(near(10),haste,6)` |
| s27 | M | – | Kombo Ustası | Doğan Güneş Tekmesi bekleme −%10, kritik şansı +%10. | `M monk_rising_sun_kick cdx=.9 crit=+.1` |
| s28 | K | – | Hiç Durmayan | Saldırı hızı +%6, kritik şansı +%2.5. Kritik vuruşlar %15 şansla +1 Çi verir. | `S attackSpeed=.06 critChance=.025 ;; T crit ch=.15 => pip(chi,1)` |
| s29 | K | – | Kaplan Ruhu | Hasar +%6, kritik hasarı +%15. Çi harcamaları %20 şansla 4 sn +%5 saldırı hızı yığar (en fazla 3). | `S damagePct=.06 critDamage=.15 ;; T spend:chi ch=.2 => buff(tiger_spirit,4,{attackSpeed=.05},max=3)` |
| s30 | K | A | Rüzgâr Efendisi | Fiziksel hasar +%25; Dönen Ejder Yumruğu hasarı +%25. | `S physicalDamagePct=.25 ;; M monk_whirling_dragon dmgx=1.25` |
| s30 | K | B | Ejder Yürek | Kritik hasarı +%30, saldırı hızı +%4; Doğan Güneş Tekmesi bekleme −%20. | `S critDamage=.30 attackSpeed=.04 ;; M monk_rising_sun_kick cdx=.8` |

##### `spec:monk_mistweaver` — Sis Dokuyan — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `healingPct` · s03 `resourceRegenPct` · s06 `maxHpPct` · s07 `dex` · s08 `cdr` · s10 `healReceivedPct` · s14 `moveSpeedPct` · s16 `attackSpeed` · s19 `dodgeChance` · s22 `armorPct` · s23 `resAll` · s24 `costReductionPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Sakin Sis | Rahatlatıcı Sis iyileştirmesi +%20. | `M monk_mw_soothing_mist healx=1.2` |
| s02 | C | B | Yenileyici Akış | Yenileyici Sis +1 şarj kazanır, iyileştirmesi +%10. | `M monk_mw_renewing_mist chg=+1 healx=1.1` |
| s04 | M | – | Sis Okşaması | Rahatlatıcı Sis enerji maliyeti −%15. | `M monk_mw_soothing_mist costx=.85` |
| s05 | A | – | Beceri: Canlandır | Açılan beceri: `monk_mw_vivify` (SkillDef satırı §1) | `G monk_mw_vivify` |
| s09 | C | A | Arınma Pınarı | Detoks bekleme −2 sn ve 1 ek olumsuz etki temizler. | `M monk_mw_detox cd=-2 p.dispel+=1` |
| s09 | C | B | Sis Zırhı | Şifaların %15 şansla hedefe 4 sn güçlendirme verir. | `T heal ch=.15 => st(ally,fortify,4)` |
| s11 | M | – | Güçlü Sarmalama | Sarmalayıcı Sis iyileştirmesi +%15. | `M monk_mw_enveloping_mist healx=1.15` |
| s12 | M | – | Sis Yayılımı | Yenileyici Sis alanı +2 m, iyileştirmesi +%10. | `M monk_mw_renewing_mist rad=+2 healx=1.1` |
| s13 | M | – | Hızlı Sis | Yenileyici Sis bekleme −1 sn, iyileştirmesi +%10. | `M monk_mw_renewing_mist cd=-1 healx=1.1` |
| s15 | C | A | Canlandırma Ustası | Canlandır alanı +%20, iyileştirmesi +%15. | `M monk_mw_vivify radx=1.2 healx=1.15` |
| s15 | C | B | Sis Dalgası | Rahatlatıcı Sis tikleri %10 şansla en yaralı müttefiği %4 iyileştirir. | `T heal:monk_mw_soothing_mist ch=.1 => healally(.04)` |
| s17 | C | A | Enerji Pınarı | Enerji yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Çay Molası | Şifalar %10 şansla maks. enerjinin %5'ini iade eder. | `T heal ch=.1 => resp(.05)` |
| s18 | M | – | Çabuk Çay | Gök Gürültüsü Çayı bekleme −%15. | `M monk_mw_thunder_tea cdx=.85` |
| s20 | M | – | Sakin Nefes | Sarmalayıcı Sis döküm süresi −%15. | `M monk_mw_enveloping_mist castx=.85` |
| s21 | M | – | Diriliş Ustalığı | Diriliş iyileştirmesi +%20. | `M monk_mw_revival healx=1.2` |
| s25 | M | – | Sis Çağrısı | Yenileyici ve Sarmalayıcı Sis iyileştirmesi +%20. | `M monk_mw_renewing_mist+monk_mw_enveloping_mist healx=1.2` |
| s26 | C | A | Tekke Dostu | Diriliş kullanınca grup 6 sn yenilenme kazanır. | `T cast:monk_mw_revival => st(party,regen,6)` |
| s26 | C | B | Sis Adımı | Hareket hızı +%8; hareket halindeyken şifa gücü +%10. | `S moveSpeedPct=.08 ;; T tick:1 if=moving => buff(mist_step,2,{healingPct=.1})` |
| s27 | M | – | Çi Hasadı | Şifalar %15 şansla +1 Çi verir. | `T heal ch=.15 => pip(chi,1)` |
| s28 | K | – | Sis Ustası | Şifa gücü +%12, maks. can +%5. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S healingPct=.12 maxHpPct=.05 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Sakin Zihin | Şifa gücü +%8, kaynak yenilenmesi +%15. | `S healingPct=.08 resourceRegenPct=.15` |
| s30 | K | A | Büyük Sis Ustası | Şifa gücü +%20; Diriliş bekleme −%15. | `S healingPct=.20 ;; M monk_mw_revival cdx=.85` |
| s30 | K | B | Gök Çayı | Şifa gücü +%10, bekleme azaltma +%4; Gök Gürültüsü Çayı bekleme −%20. | `S healingPct=.10 cdr=.04 ;; M monk_mw_thunder_tea cdx=.8` |


#### 2.10.6 Okçu (`archer`)

kaynak Odak · spec: Nişancı, Av Ustası (ikisi Hasarcı) · sınıf ağacı `s05`: **Susturucu Ok** (kesme) | **Ölü Taklidi**.

##### `class:archer` — Okçu — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `dex` · s03 `projectileDamagePct` · s06 `critChance` · s07 `critDamage` · s08 `attackSpeed` · s10 `moveSpeedPct` · s14 `maxHpPct` · s16 `dodgeChance` · s19 `projectileSpeedPct` · s22 `resourceRegenPct` · s23 `cdr` · s24 `damagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Rüzgâr Adımı | Geri Sıçrayış bekleme −2 sn. | `M archer_disengage cd=-2` |
| s02 | C | B | Av Atılışı | Geri Sıçrayış +1 şarj (yavaş dolar); sonrası 2 sn hareket hızı +%15. | `M archer_disengage chg=+1 cdx=1.4 ;; T cast:archer_disengage => buff(hunter_dash,2,{moveSpeedPct=.15})` |
| s04 | M | – | Nişancı Gözü | Nişanlı Atış hasarı +%15, menzili +4 m. | `M archer_aimed_shot dmgx=1.15 rng=+4` |
| s05 | A | A | Beceri: Susturucu Ok | Açılan beceri: `archer_muzzle` (SkillDef satırı §1) | `G archer_muzzle` |
| s05 | A | B | Beceri: Ölü Taklidi | Açılan beceri: `archer_feign_death` (SkillDef satırı §1) | `G archer_feign_death` |
| s09 | C | A | Hızlı Kaçış | Hasar alınca %10 şansla 3 sn hareket hızı +%20 (6 sn bekleme). | `T hurt ch=.1 icd=6 => buff(scatter,3,{moveSpeedPct=.2})` |
| s09 | C | B | Av Zırhı | Canın %35 altına düşünce 6 sn maks. canının %15'i kadar kalkan kazanırsın (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => abs(.15,6)` |
| s11 | M | – | Geniş Çoklu Atış | Çoklu Atış hasarı +%15, maliyeti −%10. | `M archer_multishot dmgx=1.15 costx=.9` |
| s12 | M | – | Av Çağrısı | Yoldaş Çağır bekleme −2 sn; yoldaşın iyileşmesi %50 artar. | `M archer_call_pet cd=-2 p.mend*=1.5` |
| s13 | M | – | Pençe Ustası | Pençe Tuzağı bekleme −3 sn, alanı +%20. | `M archer_snare_trap cd=-3 radx=1.2` |
| s15 | C | A | Keskin Uç | Mermi hasarı +%15, kritik şansı +%1. | `S projectileDamagePct=.15 critChance=.01` |
| s15 | C | B | Zehirli Uç | Mermi vuruşları %10 şansla zehir uygular. | `T hit:@projectile ch=.1 => st(tgt,poison,6,.2)` |
| s17 | C | A | Sabit Nişan | Odak yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Odaklı Av | Odak maliyetleri −%10; kritik vuruşlar %15 şansla +4 Odak verir. | `S costReductionPct=.10 ;; T crit ch=.15 => res(4)` |
| s18 | M | – | Patlayıcı Uç | Patlayıcı Ok patlama alanı +%20, hasarı +%10. | `M archer_explosive_arrow radx=1.2 dmgx=1.1` |
| s20 | M | – | Av Sırrı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Uzun İşaret | Avcı İşareti 6 sn daha uzun sürer, bekleme −6 sn. | `M archer_hunters_mark sdur=hunters_mark:+6 cd=-6` |
| s25 | M | – | Tuzak Ustalığı | Pençe Tuzağı hasarı +%25; aynı anda +1 tuzak kurulabilir. | `M archer_snare_trap dmgx=1.25 p.trapMax+=1` |
| s26 | C | A | Av Sürüsü | Yoldaş çağırınca 10 m içindeki müttefikler 5 sn hız kazanır. | `T cast:archer_call_pet => st(near(10),haste,5)` |
| s26 | C | B | Tuzak Ağı | Pençe Tuzağı hedefi 1.5 sn daha uzun köklü tutar. | `M archer_snare_trap sdur=root:+1.5` |
| s27 | M | – | Ok Yağmuru | Ok Fırtınası bekleme −%15, alanı +%20. | `M archer_arrow_storm cdx=.85 radx=1.2` |
| s28 | K | – | Av Muhafızı | Maks. can +%8, kaçınma +%2. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.08 dodgeChance=.02 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Yaban Ritmi | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(wild_rhythm,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Keskin Gözlü | Kritik hasarı +%30, kritik şansı +%2. | `S critDamage=.30 critChance=.02` |
| s30 | K | B | Sürü Efendisi | Yoldaş hasarı ve canı +%20; Yoldaş Çağır bekleme −%30. | `S minionDamagePct=.20 minionHpPct=.20 ;; M archer_call_pet cdx=.7` |

##### `spec:archer_marksman` — Nişancı — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `critChance` · s03 `critDamage` · s06 `projectileDamagePct` · s07 `attackSpeed` · s08 `dex` · s10 `damagePct` · s14 `executeDamagePct` · s16 `projectileSpeedPct` · s19 `resourceRegenPct` · s22 `bossDamagePct` · s23 `finisherPct` · s24 `weaponArtPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Hızlı Çekiş | Nişanlı Atış %15 daha hızlı çekilir. | `M archer_aimed_shot p.chargeMax*=0.85` |
| s02 | C | B | Delici Atış | Nişanlı Atış +1 delme yapar, hasarı +%10. | `M archer_aimed_shot prc=+1 dmgx=1.1` |
| s04 | M | – | Uzun Seri | Seri Ateş hasarı +%20, maliyeti −%15. | `M archer_rapid_fire dmgx=1.2 costx=.85` |
| s05 | A | – | Beceri: Son Atış | Açılan beceri: `archer_kill_shot` (SkillDef satırı §1) | `G archer_kill_shot` |
| s09 | C | A | Kritik Dalga | Mermi kritikleri %15 şansla ek %60 fiziksel hasar vurur. | `T crit:@projectile ch=.15 => dmg(.6,physical)` |
| s09 | C | B | Avcı Refleksi | Nişanlı Atış sonrası 3 sn %12 hasar azaltma kazanırsın. | `T cast:archer_aimed_shot => buff(hunter_ward,3,{damageReductionPct=.12})` |
| s11 | M | – | Cellat Oku | Son Atış bekleme −1 sn, hasarı +%15. | `M archer_kill_shot cd=-1 dmgx=1.15` |
| s12 | M | – | Tüfek Atışı | Çoklu Atış +2 ok atar, hasarı +%10. | `M archer_multishot cnt=+2 dmgx=1.1` |
| s13 | M | – | Ağır Patlama | Patlayıcı Ok hasarı +%20, alanı +%10. | `M archer_explosive_arrow dmgx=1.2 radx=1.1` |
| s15 | C | A | Keskin Nişan Ustası | Keskin Nişan 4 sn daha uzun sürer. | `M archer_ms_deadeye sdur=deadeye:+4` |
| s15 | C | B | Tam İsabet Ustası | Tam İsabet 5 sn daha uzun sürer. | `M archer_ms_trueshot sdur=trueshot:+5` |
| s17 | C | A | Sabit Odak | Odak yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Odak Hırsı | Son Atış bir hedefi öldürürse +20 Odak kazanırsın. | `T kill:archer_kill_shot => res(20)` |
| s18 | M | – | Uzun Bakış | Avcı İşareti 6 sn daha uzun sürer. | `M archer_hunters_mark sdur=hunters_mark:+6` |
| s20 | M | – | Nişancı Zamanı | Keskin Nişan ve Tam İsabet bekleme −%10. | `M archer_ms_deadeye+archer_ms_trueshot cdx=.9` |
| s21 | M | – | Hızlı Parmak | Seri Ateş döküm süresi −%20. | `M archer_rapid_fire castx=.8` |
| s25 | M | – | Kasırga Fırtınası | Ok Fırtınası hasarı +%20, bekleme −%10. | `M archer_arrow_storm dmgx=1.2 cdx=.9` |
| s26 | C | A | Av Ortağı | Tam İsabet kullanınca grup 6 sn güçlenir. | `T cast:archer_ms_trueshot => st(party,empower,6)` |
| s26 | C | B | Gözcü | Avcı İşareti 20 m içindeki müttefikleri 5 sn güçlendirir. | `T cast:archer_hunters_mark => st(near(20),empower,5)` |
| s27 | M | – | Yankı Atış | Nişanlı Atış %15 şansla yarı güçte tekrar eder. | `T cast:archer_aimed_shot ch=.15 => echo(archer_aimed_shot,.5,.35)` |
| s28 | K | – | Keskin Nişancı | Kritik şansı +%2.5, mermi hasarı +%15. Kritik vuruşlar %20 şansla Geri Sıçrayış bekleme süresini 1 sn azaltır. | `S critChance=.025 projectileDamagePct=.15 ;; T crit ch=.2 => cdr(archer_disengage,1)` |
| s29 | K | – | Av Ritmi | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(marksman_rhythm,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Gökyüzü Atıcısı | Mermi hasarı +%25; Nişanlı Atış hasarı +%25. | `S projectileDamagePct=.25 ;; M archer_aimed_shot dmgx=1.25` |
| s30 | K | B | Kartal Gözü | Kritik hasarı +%30, boss hasarı +%6; Tam İsabet bekleme −%20. | `S critDamage=.30 bossDamagePct=.06 ;; M archer_ms_trueshot cdx=.8` |

##### `spec:archer_beastmaster` — Av Ustası — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `minionDamagePct` · s03 `minionHpPct` · s06 `projectileDamagePct` · s07 `critChance` · s08 `attackSpeed` · s10 `poisonDamagePct` · s14 `dex` · s16 `damagePct` · s19 `trapDamagePct` · s22 `resourceRegenPct` · s23 `maxHpPct` · s24 `cdr`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Hızlı Emir | Av Emri bekleme −1.5 sn. | `M archer_kill_command cd=-1.5` |
| s02 | C | B | Kanlı Isırık | Av Emri kanaması +%40 güçlü, 3 sn daha uzun sürer. | `M archer_kill_command dotx=1.4 sdur=bleed:+3` |
| s04 | M | – | Kuvvetli Isırık | Av Emri hasarı +%15, sarsması +%20. | `M archer_kill_command dmgx=1.15 stgx=1.2` |
| s05 | A | – | Beceri: Zehirli Ok | Açılan beceri: `archer_serpent_sting` (SkillDef satırı §1) | `G archer_serpent_sting` |
| s09 | C | A | Yoldaş Bağı | Yoldaşın canı +%20. | `S minionHpPct=.20` |
| s09 | C | B | Sürü Kalkanı | Canın %35 altına düşünce 6 sn maks. canının %15'i kadar kalkan kazanırsın (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => abs(.15,6)` |
| s11 | M | – | Zehir Yayılımı | Zehirli Ok hasarı +%20; zehir bir hedef daha yayılır. | `M archer_serpent_sting dmgx=1.2 p.spreadOnDeath+=1` |
| s12 | M | – | Hızlı Çağrı | Yoldaş Çağır bekleme −2 sn. | `M archer_call_pet cd=-2` |
| s13 | M | – | Tuzak Ustası | Pençe Tuzağı hasarı +%25, kanaması +%30. | `M archer_snare_trap dmgx=1.25 dotx=1.3` |
| s15 | C | A | Gazap Ustası | Vahşi Gazap 4 sn daha uzun sürer. | `M archer_bm_bestial_wrath sdur=wild_wrath:+4` |
| s15 | C | B | Sürü Ustası | Av Sürüsü kurtları 6 sn daha uzun kalır. | `M archer_bm_pack_hunt p.life+=6` |
| s17 | C | A | Av Ruhu | Odak yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Yoldaş Ruhu | Yoldaşın vuruşları %10 şansla +5 Odak verir. | `T hit:@pet ch=.1 => res(5)` |
| s18 | M | – | Ayı Dostu | Yoldaş canı +%10, hasarı +%10. | `S minionHpPct=.10 minionDamagePct=.10` |
| s20 | M | – | Sürü Komutanı | Vahşi Gazap ve Av Sürüsü bekleme −%10. | `M archer_bm_bestial_wrath+archer_bm_pack_hunt cdx=.9` |
| s21 | M | – | Zehirli Dişler | Yoldaşın vuruşları %25 şansla zehir uygular. | `T hit:@pet ch=.25 => st(tgt,poison,5,.2)` |
| s25 | M | – | Ağır Emir | Av Emri hasarı +%25, menzili +4 m. | `M archer_kill_command dmgx=1.25 rng=+4` |
| s26 | C | A | Sürü Lideri | Av Sürüsü kullanınca grup 6 sn güçlenir. | `T cast:archer_bm_pack_hunt => st(party,empower,6)` |
| s26 | C | B | Av Dostu | Vahşi Gazap 10 m içindeki müttefiklere 6 sn hız verir. | `T cast:archer_bm_bestial_wrath => st(near(10),haste,6)` |
| s27 | M | – | Kurt Fırtınası | Av Sürüsü kurtlarının hasarı +%25. | `M archer_bm_pack_hunt dmgx=1.25` |
| s28 | K | – | Sürü Reisi | Yoldaş hasarı ve canı +%15. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S minionDamagePct=.15 minionHpPct=.15 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Yaban Kalbi | Hasar +%6. Yoldaşın kritik vuruşları %20 şansla +4 Odak verir. | `S damagePct=.06 ;; T crit:@pet ch=.2 => res(4)` |
| s30 | K | A | Hayvanlar Efendisi | Yoldaş hasarı +%25, canı +%20; Av Emri hasarı +%20. | `S minionDamagePct=.25 minionHpPct=.20 ;; M archer_kill_command dmgx=1.2` |
| s30 | K | B | Zehir Avcısı | Zehir hasarı +%25, zamanla hasar +%10; Zehirli Ok hasarı +%20. | `S poisonDamagePct=.25 dotPct=.10 ;; M archer_serpent_sting dmgx=1.2` |


#### 2.10.7 Paladin (`paladin`)

kaynak İnanç · pip Kutsal Güç · spec: Koruma (Tank), Kutsal (Şifacı), Ceza (Hasarcı) · sınıf ağacı `s05`: **Azarlama** (kesme) | **İlahi Kalkan**.

##### `class:paladin` — Paladin — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `str` · s03 `holyDamagePct` · s06 `maxHpPct` · s07 `armorPct` · s08 `meleeDamagePct` · s10 `healingPct` · s14 `resAll` · s16 `blockChance` · s19 `critChance` · s22 `resourceRegenPct` · s23 `ccReductionPct` · s24 `cdr`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Kutsal Atılış | Hareket hızı +%8; Yargı bekleme −1 sn. | `S moveSpeedPct=.08 ;; M paladin_judgement cd=-1` |
| s02 | C | B | Işığın Adımı | Hareket hızı +%5; Haçlı Darbesi 0.5 m daha ileri atılır. | `S moveSpeedPct=.05 ;; M paladin_crusader_strike p.lunge+=0.5` |
| s04 | M | – | Hızlı Haçlı | Haçlı Darbesi bekleme −0.5 sn, hasarı +%10. | `M paladin_crusader_strike cd=-0.5 dmgx=1.1` |
| s05 | A | A | Beceri: Azarlama | Açılan beceri: `paladin_rebuke` (SkillDef satırı §1) | `G paladin_rebuke` |
| s05 | A | B | Beceri: İlahi Kalkan | Açılan beceri: `paladin_divine_shield` (SkillDef satırı §1) | `G paladin_divine_shield` |
| s09 | C | A | Kutsal Kalkan | Kutsal Güç harcayınca 4 sn %10 hasar azaltma kazanırsın. | `T spend:holypower => buff(holy_ward,4,{damageReductionPct=.1})` |
| s09 | C | B | Işığın Nefesi | Canın %35 altına düşünce %15 can yenilenir ve +2 Kutsal Güç kazanırsın (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => heal(.15) ; pip(holypower,2)` |
| s11 | M | – | Keskin Yargı | Yargı hasarı +%15, süresi 4 sn uzar. | `M paladin_judgement dmgx=1.15 sdur=judged:+4` |
| s12 | M | – | Hüküm Hasadı | Kutsal Hüküm hasarı +%15, sarsması +%25. | `M paladin_verdict dmgx=1.15 stgx=1.25` |
| s13 | M | – | Geniş Kalkan | İntikamcı Kalkan +1 hedefe sıçrar, bekleme −2 sn. | `M paladin_avengers_shield cnt=+1 cd=-2` |
| s15 | C | A | Cellat Işığı | Canı <%35 düşmanlara +%15 hasar; kutsal hasar +%5. | `S executeDamagePct=.15 holyDamagePct=.05` |
| s15 | C | B | Kutsal Öfke | Temel vuruşlar %12 şansla +1 Kutsal Güç verir. | `T hit:@basic ch=.12 => pip(holypower,1)` |
| s17 | C | A | İnanç Pınarı | İnanç yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Yeminli Kılıç | İnanç maliyetleri −%10; Kutsal Güç harcamak %15 şansla 1 puan geri verir. | `S costReductionPct=.10 ;; T spend:holypower ch=.15 => pip(holypower,1)` |
| s18 | M | – | Çekiç Ustası | Adalet Çekici bekleme −5 sn, sersemletme +0.5 sn. | `M paladin_hammer_of_justice cd=-5 sdur=stun:+0.5` |
| s20 | M | – | Yemin Bilgeliği | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Aura Ustası | Aura yarıçapı +%30. | `M paladin_aura radx=1.3` |
| s25 | M | – | Şifa Eli Ustası | Şifa Eli bekleme −%25. | `M paladin_lay_on_hands cdx=.75` |
| s26 | C | A | Işığın Ordusu | İntikam Kanatları kullanınca grup 8 sn güçlenir. | `T cast:paladin_avenging_wrath => st(party,empower,8)` |
| s26 | C | B | Koruyucu Melek | Şifa Eli hedefine 8 sn güçlendirme verir. | `T cast:paladin_lay_on_hands => st(ally,fortify,8)` |
| s27 | M | – | Kanatlı Hüküm | İntikam Kanatları bekleme −%15, 4 sn daha uzun sürer. | `M paladin_avenging_wrath cdx=.85 sdur=wrath_wings:+4` |
| s28 | K | – | Yılmaz Kalp | Maks. can +%10, kontrol azaltma +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 ccReductionPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Adalet Kılıcı | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(justice_blade,5,{attackSpeed=.05},max=4)` |
| s30 | K | A | Işık Taşıyıcı | Kutsal hasar +%25, şifa gücü +%8. | `S holyDamagePct=.25 healingPct=.08` |
| s30 | K | B | Ak Kale | Zırh +%25, maks. can +%8, blok şansı +%3. | `S armorPct=.25 maxHpPct=.08 blockChance=.03` |

##### `spec:paladin_protection` — Koruma — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `maxHpPct` · s03 `armorPct` · s06 `blockChance` · s07 `threatPct` · s08 `healReceivedPct` · s10 `guardGauge` · s14 `parryWindow` · s16 `vit` · s19 `resAll` · s22 `holyDamagePct` · s23 `blockAmount` · s24 `ccReductionPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Hesaplaşma Hızı | Hesaplaşma bekleme −2 sn, menzil +8 m. | `M paladin_reckoning cd=-2 rng=+8` |
| s02 | C | B | Parlak Kalkan | Doğruluk Kalkanı 2 sn daha uzun sürer. | `M paladin_shield_of_righteous sdur=righteous:+2` |
| s04 | M | – | Doğruluk Hasarı | Doğruluk Kalkanı hasarı +%15, tehdit çarpanı +%20. | `M paladin_shield_of_righteous dmgx=1.15 p.threatMult*=1.2` |
| s05 | A | – | Beceri: Kutsanmış Çekiç | Açılan beceri: `paladin_blessed_hammer` (SkillDef satırı §1) | `G paladin_blessed_hammer` |
| s09 | C | A | Blok Gücü | Engellenen vuruşlar %20 şansla +1 Kutsal Güç verir. | `T block ch=.2 => pip(holypower,1)` |
| s09 | C | B | Yansıma | Başarılı savuşturma çevreye %100 kutsal patlama yapar. | `T parry => exp(1.0,3,holy)` |
| s11 | M | – | Çekiç Ustası | Kutsanmış Çekiç +1 şarj kazanır, hasarı +%15. | `M paladin_blessed_hammer chg=+1 dmgx=1.15` |
| s12 | M | – | Kalkan Fırtınası | İntikamcı Kalkan tehdit çarpanı +%30, bekleme −2 sn. | `M paladin_avengers_shield p.threatMult*=1.3 cd=-2` |
| s13 | M | – | Tehditkâr Yargı | Yargı tehdit çarpanı +%30, hasarı +%10. | `M paladin_judgement p.threatMult*=1.3 dmgx=1.1` |
| s15 | C | A | Sarsılmaz Kalkan | Doğruluk Kalkanı sırasında blok şansı +%10, blok miktarı +%10. | `T cast:paladin_shield_of_righteous => buff(righteous_wall,6,{blockChance=.10,blockAmount=.10})` |
| s15 | C | B | Demir Yemin | Kutsal Güç harcayınca maks. canının %3'ü yenilenir. | `T spend:holypower => heal(.03)` |
| s17 | C | A | İnanç Kalesi | İnanç yenilenmesi +%20; engellenen vuruş +2 İnanç verir. | `S resourceRegenPct=.20 ;; T block => res(2)` |
| s17 | C | B | Yeminli Nöbet | İnanç maliyetleri −%15. | `S costReductionPct=.15` |
| s18 | M | – | Hesaplaşma Yankısı | Hesaplaşma kullanınca 10 m içindeki müttefikler 4 sn güçlenir. | `T cast:paladin_reckoning => st(near(10),fortify,4)` |
| s20 | M | – | Kadim Siper | İlahi Siper ve Yılmaz Savunucu bekleme −%10. | `M paladin_prot_bulwark+paladin_prot_ardent cdx=.9` |
| s21 | M | – | Uzun Siper | İlahi Siper 3 sn daha uzun sürer. | `M paladin_prot_bulwark sdur=bulwark:+3` |
| s25 | M | – | Aura Muhafızı | Aura yarıçapı +%15. | `M paladin_aura radx=1.15` |
| s26 | C | A | Şifa Koruyucusu | İlahi Siper kullanınca en yaralı müttefik %5 iyileşir. | `T cast:paladin_prot_bulwark => healally(.05)` |
| s26 | C | B | Yılmaz Dost | Yılmaz Savunucu kullanınca grup 5 sn güçlenir. | `T cast:paladin_prot_ardent => st(party,fortify,5)` |
| s27 | M | – | Kanatlı Muhafız | İntikam Kanatları bekleme −%15. | `M paladin_avenging_wrath cdx=.85` |
| s28 | K | – | Sarsılmaz Muhafız | Maks. can +%8, blok şansı +%4. Blokların %15 şansla İntikamcı Kalkan bekleme süresini 3 sn azaltır (6 sn bekleme). | `S maxHpPct=.08 blockChance=.04 ;; T block ch=.15 icd=6 => cdr(paladin_avengers_shield,3)` |
| s29 | K | – | Kutsal Duvar | Siper dayanıklılığı +20, savuşturma penceresi +0.03 sn. Savuşturma +10 İnanç ve +1 Kutsal Güç verir. | `S guardGauge=20 parryWindow=.03 ;; T parry => res(10) ; pip(holypower,1)` |
| s30 | K | A | Işığın Zırhı | Zırh +%20, alınan iyileştirme +%15; Yılmaz Savunucu bekleme −%15. | `S armorPct=.20 healReceivedPct=.15 ;; M paladin_prot_ardent cdx=.85` |
| s30 | K | B | Ateş Kalkanı | Blok şansı +%6, diken +40; engellenen vuruşlar saldırgana %80 kutsal hasar yansıtır. | `S blockChance=.06 thorns=40 ;; T block => dmg(.8,holy)` |

##### `spec:paladin_holy` — Kutsal — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `healingPct` · s03 `resourceRegenPct` · s06 `maxHpPct` · s07 `str` · s08 `cdr` · s10 `healReceivedPct` · s14 `castSpeed` · s16 `holyDamagePct` · s19 `costReductionPct` · s22 `armorPct` · s23 `resAll` · s24 `aoeRadiusPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Işık Hızı | Işık Parlaması döküm süresi −%15. | `M paladin_flash_of_light castx=.85` |
| s02 | C | B | Şok Ustası | Kutsal Şok bekleme −1.5 sn, iyileştirmesi +%10. | `M paladin_holy_shock cd=-1.5 healx=1.1` |
| s04 | M | – | Kutsal Taşkın | Kutsal Şok iyileştirmesi +%15. | `M paladin_holy_shock healx=1.15` |
| s05 | A | – | Beceri: Şafak Işığı | Açılan beceri: `paladin_light_of_dawn` (SkillDef satırı §1) | `G paladin_light_of_dawn` |
| s09 | C | A | Arınma Pınarı | Arındırma bekleme −2 sn ve 1 ek olumsuz etki temizler. | `M paladin_cleanse cd=-2 p.dispel+=1` |
| s09 | C | B | Işık Zırhı | Şifaların %15 şansla hedefe 4 sn güçlendirme verir. | `T heal ch=.15 => st(ally,fortify,4)` |
| s11 | M | – | Söz Gücü | Işığın Sözü iyileştirmesi +%15. | `M paladin_word_of_glory healx=1.15` |
| s12 | M | – | Şok Zinciri | Kutsal Şok %25 şansla kendi bekleme süresini 2 sn azaltır. | `T cast:paladin_holy_shock ch=.25 => cdr(paladin_holy_shock,2)` |
| s13 | M | – | Parlama Ustası | Işık Parlaması iyileştirmesi +%15, maliyeti −%10. | `M paladin_flash_of_light healx=1.15 costx=.9` |
| s15 | C | A | Şafak Ustası | Şafak Işığı 2 hedef daha iyileştirir. | `M paladin_light_of_dawn cnt=+2` |
| s15 | C | B | Sığınak Ustası | Tyr'ın Sığınağı 4 sn daha uzun sürer. | `M paladin_holy_sanctuary dur=+4` |
| s17 | C | A | İnanç Pınarı | İnanç yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Taşan Işık | Şifalar %10 şansla maks. İnanç'ın %5'ini iade eder. | `T heal ch=.1 => resp(.05)` |
| s18 | M | – | Işık Oku Ustası | Işık Oku iyileştirmesi +%20. | `M paladin_holy_basic healx=1.2` |
| s20 | M | – | Sözün Ağırlığı | Işığın Sözü hedefi 6 sn güçlendirir. | `T cast:paladin_word_of_glory => st(ally,fortify,6)` |
| s21 | M | – | Aura Dalgası | Aura Ustalığı ve Tyr'ın Sığınağı bekleme −%10. | `M paladin_holy_aura_mastery+paladin_holy_sanctuary cdx=.9` |
| s25 | M | – | Işık Çağlayanı | Işığın Sözü 1 Kutsal Güç daha ucuz olur. | `M paladin_word_of_glory pipc=holypower:-1` |
| s26 | C | A | Fener | Şifaların %20 şansla en yaralı müttefiği ek %4 iyileştirir. | `T heal ch=.2 => healally(.04)` |
| s26 | C | B | Grup Işığı | Aura Ustalığı kullanınca grup 6 sn yenilenme kazanır. | `T cast:paladin_holy_aura_mastery => st(party,regen,6)` |
| s27 | M | – | Geniş Sığınak | Tyr'ın Sığınağı yarıçap +3 m, iyileştirmesi +%15. | `M paladin_holy_sanctuary rad=+3 healx=1.15` |
| s28 | K | – | Işığın Ustası | Şifa gücü +%12, maks. can +%5. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S healingPct=.12 maxHpPct=.05 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Kutsal Zihin | Şifa gücü +%8, kaynak yenilenmesi +%15. | `S healingPct=.08 resourceRegenPct=.15` |
| s30 | K | A | Büyük Rahip | Şifa gücü +%20; Tyr'ın Sığınağı bekleme −%15. | `S healingPct=.20 ;; M paladin_holy_sanctuary cdx=.85` |
| s30 | K | B | Şafak Kralı | Şifa gücü +%10, bekleme azaltma +%4; Aura Ustalığı bekleme −%20. | `S healingPct=.10 cdr=.04 ;; M paladin_holy_aura_mastery cdx=.8` |

##### `spec:paladin_retribution` — Ceza — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `holyDamagePct` · s03 `attackSpeed` · s06 `critChance` · s07 `meleeDamagePct` · s08 `critDamage` · s10 `str` · s14 `damagePct` · s16 `finisherPct` · s19 `executeDamagePct` · s22 `resourceGainPct` · s23 `cdr` · s24 `weaponArtPct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Fırtına Hızı | İlahi Fırtına bekleme −0.5 sn, alanı +%15. | `M paladin_divine_storm cd=-0.5 radx=1.15` |
| s02 | C | B | Haçlı Ateşi | Haçlı Darbesi %15 şansla +1 Kutsal Güç verir. | `T cast:paladin_crusader_strike ch=.15 => pip(holypower,1)` |
| s04 | M | – | Kutsal Kasırga | İlahi Fırtına hasarı +%15, kritik şansı +%10. | `M paladin_divine_storm dmgx=1.15 crit=+.1` |
| s05 | A | – | Beceri: Gazap Çekici | Açılan beceri: `paladin_hammer_of_wrath` (SkillDef satırı §1) | `G paladin_hammer_of_wrath` |
| s09 | C | A | Hüküm Gücü | Yargı sonrası 4 sn kutsal hasar +%20. | `T cast:paladin_judgement => buff(judged_edge,4,{holyDamagePct=.20})` |
| s09 | C | B | Çekiç Ateşi | Gazap Çekici +1 ek Kutsal Güç verir. | `M paladin_hammer_of_wrath pip=holypower:1` |
| s11 | M | – | Zincir Çekiç | Gazap Çekici +1 hedefe sıçrar, hasarı +%10. | `M paladin_hammer_of_wrath cnt=+1 dmgx=1.1` |
| s12 | M | – | Hüküm Kılıcı | Kutsal Hüküm hasarı +%15, sarsması +%25. | `M paladin_verdict dmgx=1.15 stgx=1.25` |
| s13 | M | – | Cellat Yargısı | Yargı bekleme −1 sn, hasarı +%10. | `M paladin_judgement cd=-1 dmgx=1.1` |
| s15 | C | A | Sefer Ustası | Haçlı Seferi 4 sn daha uzun sürer. | `M paladin_ret_crusade sdur=crusade:+4` |
| s15 | C | B | İdam Ustası | İdam Hükmü hasarı +%20, 2 sn daha uzun sürer. | `M paladin_ret_execution dmgx=1.2 sdur=sentenced:+2` |
| s17 | C | A | İnanç Alevi | İnanç yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Fırtına Ruhu | Kutsal Güç harcayınca %10 şansla 4 sn saldırı hızı +%12. | `T spend:holypower ch=.1 => buff(storm_spirit,4,{attackSpeed=.12})` |
| s18 | M | – | Güçlü Haçlı | Haçlı Darbesi hasarı +%20, bekleme −0.5 sn. | `M paladin_crusader_strike dmgx=1.2 cd=-0.5` |
| s20 | M | – | Yargı Zamanı | Haçlı Seferi ve İdam Hükmü bekleme −%10. | `M paladin_ret_crusade+paladin_ret_execution cdx=.9` |
| s21 | M | – | Hızlı Çekiç | Adalet Çekici bekleme −4 sn. | `M paladin_hammer_of_justice cd=-4` |
| s25 | M | – | Aura Gücü | Aura yarıçapı +%20. | `M paladin_aura radx=1.2` |
| s26 | C | A | Yargı Ordusu | Haçlı Seferi kullanınca grup 6 sn güçlenir. | `T cast:paladin_ret_crusade => st(party,empower,6)` |
| s26 | C | B | Kılıç Kardeşliği | İdam Hükmü 10 m içindeki müttefiklere 6 sn hız verir. | `T cast:paladin_ret_execution => st(near(10),haste,6)` |
| s27 | M | – | Kanatlı İntikam | İntikam Kanatları bekleme −%15. | `M paladin_avenging_wrath cdx=.85` |
| s28 | K | – | Yeminli Kılıç | Yakın dövüş hasarı +%10, kritik şansı +%2. Kritik vuruşlar %20 şansla +1 Kutsal Güç verir. | `S meleeDamagePct=.10 critChance=.02 ;; T crit ch=.2 => pip(holypower,1)` |
| s29 | K | – | Hüküm Sahibi | Saldırı hızı +%5, kritik hasarı +%15. Öldürünce +1 Kutsal Güç kazanırsın. | `S attackSpeed=.05 critDamage=.15 ;; T kill => pip(holypower,1)` |
| s30 | K | A | Kutsal Cellat | Kutsal hasar +%25; Gazap Çekici hasarı +%25. | `S holyDamagePct=.25 ;; M paladin_hammer_of_wrath dmgx=1.25` |
| s30 | K | B | Haçlı Efendisi | Kritik hasarı +%25, saldırı hızı +%5; Haçlı Seferi bekleme −%20. | `S critDamage=.25 attackSpeed=.05 ;; M paladin_ret_crusade cdx=.8` |


#### 2.10.8 Nekromant (`necromancer`)

kaynak Öz · spec: Ordu Efendisi, Kemik Ustası (ikisi Hasarcı) · sınıf ağacı `s05`: **Ruh Koparma** (kesme) | **Ruh Yürüyüşü**.

##### `class:necromancer` — Nekromant — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `int` · s03 `shadowDamagePct` · s06 `physicalDamagePct` · s07 `minionDamagePct` · s08 `minionHpPct` · s10 `dotPct` · s14 `maxHpPct` · s16 `castSpeed` · s19 `critChance` · s22 `resourceRegenPct` · s23 `cdr` · s24 `lifeSteal`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Mezar Hızı | Hareket hızı +%6; İskelet Çağır bekleme −0.5 sn. | `S moveSpeedPct=.06 ;; M necro_raise_skeleton cd=-0.5` |
| s02 | C | B | Ruh Adımı | Hasar alınca %10 şansla 3 sn hareket hızı +%20 (6 sn bekleme). | `T hurt ch=.1 icd=6 => buff(spirit_dash,3,{moveSpeedPct=.2})` |
| s04 | M | – | Keskin Mızrak | Kemik Mızrağı hasarı +%15, menzil +4 m. | `M necro_bone_spear dmgx=1.15 rng=+4` |
| s05 | A | A | Beceri: Ruh Koparma | Açılan beceri: `necro_soul_snap` (SkillDef satırı §1) | `G necro_soul_snap` |
| s05 | A | B | Beceri: Ruh Yürüyüşü | Açılan beceri: `necro_spirit_walk` (SkillDef satırı §1) | `G necro_spirit_walk` |
| s09 | C | A | Kemik Kalkanı | Kemik Zırhı kullanınca 10 sn maks. canının %10'u kadar kalkan kazanırsın. | `T cast:necro_bone_armor => abs(.1,10)` |
| s09 | C | B | Ruh Direnci | Canın %35 altına düşünce %15 can yenilenir ve 15 m içindeki yoldaşlar 4 sn güçlenir (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => heal(.15) ; st(near(15),empower,4)` |
| s11 | M | – | Hızlı Mezar | İskelet Çağır maliyeti −%20; yoldaş canı +%10. | `M necro_raise_skeleton costx=.8 ;; S minionHpPct=.10` |
| s12 | M | – | Geniş Patlama | Ceset Patlaması alanı +%15, hasarı +%15. | `M necro_corpse_explosion radx=1.15 dmgx=1.15` |
| s13 | M | – | Hapishane Ustası | Kemik Hapishanesi bekleme −3 sn, kök süresi +1 sn. | `M necro_bone_prison cd=-3 sdur=root:+1` |
| s15 | C | A | Lanet Ustası | Lanet: Çürüme alanı +%20, süresi +4 sn. | `M necro_curse_decay radx=1.2 dur=+4` |
| s15 | C | B | Kan Rahibi | Can çalma +%0.5; Kan Emişi iyileştirmesi +%25. | `S lifeSteal=.005 ;; M necro_blood_siphon healx=1.25` |
| s17 | C | A | Öz Pınarı | Öz yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Ceset Toplayıcı | Öldürmeler %25 şansla +8 Öz verir. | `T kill ch=.25 => res(8)` |
| s18 | M | – | Lanet Ustalığı | Lanet: Çürüme hasarı +%25. | `M necro_curse_decay dmgx=1.25` |
| s20 | M | – | Mezar Zamanı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Uzun Emiş | Kan Emişi hasarı +%20, menzili +3 m. | `M necro_blood_siphon dmgx=1.2 rng=+3` |
| s25 | M | – | Kemik Zırhı Ustalığı | Kemik Zırhı +2 kalkan, bekleme −5 sn. | `M necro_bone_armor p.armorStacks+=2 cd=-5` |
| s26 | C | A | Ölüm Ordusu | Ölüler Ordusu kullanınca grup 8 sn güçlenir. | `T cast:necro_army_of_the_dead => st(party,empower,8)` |
| s26 | C | B | Koruyucu Kemik | Kemik Zırhı 10 m içindeki müttefikleri 4 sn güçlendirir. | `T cast:necro_bone_armor => st(near(10),fortify,4)` |
| s27 | M | – | Ordu Yankısı | Ölüler Ordusu bekleme −%15, +2 iskelet askeri çağırır. | `M necro_army_of_the_dead cdx=.85 cnt=+2` |
| s28 | K | – | Ölümsüz Beden | Maks. can +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Mezar Ritmi | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(grave_rhythm,5,{castSpeed=.05},max=4)` |
| s30 | K | A | Kemik Efendisi | Fiziksel hasar +%20, gölge hasarı +%15. | `S physicalDamagePct=.20 shadowDamagePct=.15` |
| s30 | K | B | Ruh Efendisi | Yoldaş hasarı ve canı +%20; Ölüler Ordusu bekleme −%20. | `S minionDamagePct=.20 minionHpPct=.20 ;; M necro_army_of_the_dead cdx=.8` |

##### `spec:necromancer_summoner` — Ordu Efendisi — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `minionDamagePct` · s03 `minionHpPct` · s06 `shadowDamagePct` · s07 `int` · s08 `castSpeed` · s10 `critChance` · s14 `damagePct` · s16 `maxHpPct` · s19 `resourceRegenPct` · s22 `dotPct` · s23 `cdr` · s24 `physicalDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Büyük Ordu | İskelet sınırı +1 artar. | `X trait_summoner{skeletonCap=1}` |
| s02 | C | B | Golem Çağrısı | Kemik Golemi bekleme −5 sn, hasarı +%20. | `M necro_golem cd=-5 dmgx=1.2` |
| s04 | M | – | Golem Kayası | Kemik Golemi hasarı +%15, sarsması +%30. | `M necro_golem dmgx=1.15 stgx=1.3` |
| s05 | A | – | Beceri: Ordu: Hücum! | Açılan beceri: `necro_command_army` (SkillDef satırı §1) | `G necro_command_army` |
| s09 | C | A | Ordu Kalkanı | Aldığın hasarın %10'u daha fazla yoldaşlarına dağılır. | `X trait_summoner{damageToMinions=.10}` |
| s09 | C | B | Ölümcül Dönüş | Ölen iskeletler %20 şansla yeniden ayağa kalkar. | `X trait_summoner{skeletonRevive=.20}` |
| s11 | M | – | Emir Gücü | Ordu: Hücum! hasarı +%25; kışkırtma 1 sn uzar. | `M necro_command_army dmgx=1.25 sdur=taunt:+1` |
| s12 | M | – | Hızlı Mezar | İskelet Çağır bekleme −0.5 sn, maliyeti −%20. | `M necro_raise_skeleton cd=-0.5 costx=.8` |
| s13 | M | – | Patlayan Ordu | Ceset Patlaması hasarı +%20, alanı +%10. | `M necro_corpse_explosion dmgx=1.2 radx=1.1` |
| s15 | C | A | Çılgınlık Ustası | Ölüm Çılgınlığı 4 sn daha uzun sürer. | `M necro_sm_frenzy sdur=frenzy_minions:+4` |
| s15 | C | B | Şövalye Ustası | Kemik Şövalyeleri 6 sn daha uzun kalır. | `M necro_sm_bone_knights p.life+=6` |
| s17 | C | A | Öz Pınarı | Öz yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Ruh Hasadı | Yoldaşların öldürmeleri %20 şansla +6 Öz verir. | `T kill:@minion ch=.2 => res(6)` |
| s18 | M | – | Golem Nöbeti | Kemik Golemi bekleme −%15. | `M necro_golem cdx=.85` |
| s20 | M | – | Ordu Zamanı | Ölüm Çılgınlığı ve Kemik Şövalyeleri bekleme −%10. | `M necro_sm_frenzy+necro_sm_bone_knights cdx=.9` |
| s21 | M | – | Ölüler Ordusu Genişler | Ölüler Ordusu +2 asker çağırır, bekleme −8 sn. | `M necro_army_of_the_dead cnt=+2 cd=-8` |
| s25 | M | – | Lanet Gölgesi | Lanet: Çürüme alanı +%20; kullanınca 10 sn yoldaş hasarı +%10. | `M necro_curse_decay radx=1.2 ;; T cast:necro_curse_decay => buff(curse_edge,10,{minionDamagePct=.10})` |
| s26 | C | A | Ölüm Çobanı | Ölüler Ordusu kullanınca grup 8 sn güçlenir. | `T cast:necro_army_of_the_dead => st(party,empower,8)` |
| s26 | C | B | Kemik Kalkanı | Kemik Şövalyeleri 10 m içindeki müttefikleri 6 sn güçlendirir. | `T cast:necro_sm_bone_knights => st(near(10),fortify,6)` |
| s27 | M | – | Komuta Zinciri | Ordu: Hücum! bekleme −3 sn. | `M necro_command_army cd=-3` |
| s28 | K | – | Sonsuz Ordu | Yoldaş hasarı ve canı +%15. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S minionDamagePct=.15 minionHpPct=.15 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Mezar Efendisi | Hasar +%6. Yoldaş öldürmeleri 6 sn boyunca +%4 yoldaş hasarı yığar (en fazla 5). | `S damagePct=.06 ;; T kill:@minion => buff(grave_master,6,{minionDamagePct=.04},max=5)` |
| s30 | K | A | Ordu Efendisi | Yoldaş hasarı +%25, canı +%20; Kemik Golemi bekleme −%20. | `S minionDamagePct=.25 minionHpPct=.20 ;; M necro_golem cdx=.8` |
| s30 | K | B | Ölüler Kralı | Gölge hasarı +%20, yoldaş hasarı +%15; Ordu: Hücum! hasarı +%20. | `S shadowDamagePct=.20 minionDamagePct=.15 ;; M necro_command_army dmgx=1.2` |

##### `spec:necromancer_bone` — Kemik Ustası — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `physicalDamagePct` · s03 `shadowDamagePct` · s06 `castSpeed` · s07 `critChance` · s08 `critDamage` · s10 `int` · s14 `damagePct` · s16 `resourceRegenPct` · s19 `aoePct` · s22 `dotPct` · s23 `cdr` · s24 `lifeSteal`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Fırtına Ustası | Kemik Fırtınası maliyeti −%15, hasarı +%10. | `M necro_bone_storm costx=.85 dmgx=1.1` |
| s02 | C | B | Mızrak Fırtınası | Savaşta 3 sn'de bir otomatik Kemik Mızrağı yankısı (%50 hasar) atılır. | `T tick:3 if=inCombat => echo(necro_bone_spear,.5,.1)` |
| s04 | M | – | Keskin Fırtına | Kemik Fırtınası yarıçapı +1 m, süresi +1 sn. | `M necro_bone_storm rad=+1 dur=+1` |
| s05 | A | – | Beceri: Kan Dalgası | Açılan beceri: `necro_blood_surge` (SkillDef satırı §1) | `G necro_blood_surge` |
| s09 | C | A | Kan Kalkanı | Kan Dalgası sonrası 6 sn %12 hasar azaltma kazanırsın. | `T cast:necro_blood_surge => buff(blood_ward,6,{damageReductionPct=.12})` |
| s09 | C | B | Kemik Zırhı | Kemik Fırtınası sırasında 4 sn %10 hasar azaltma kazanırsın. | `T cast:necro_bone_storm => buff(storm_ward,4,{damageReductionPct=.1})` |
| s11 | M | – | Geniş Dalga | Kan Dalgası yarıçap +2 m, hasarı +%15. | `M necro_blood_surge rad=+2 dmgx=1.15` |
| s12 | M | – | Delici Kemik | Kemik Mızrağı +1 delme yapar, hasarı +%10. | `M necro_bone_spear prc=+1 dmgx=1.1` |
| s13 | M | – | Zincir Patlama | Ceset Patlaması hasarı +%20; zincir patlamalar %20 daha güçlü. | `M necro_corpse_explosion dmgx=1.2 p.explChainMult*=1.2` |
| s15 | C | A | Ruh Ustası | Kemik Ruhu hasarı +%20, bekleme −5 sn. | `M necro_bn_bone_spirit dmgx=1.2 cd=-5` |
| s15 | C | B | Lich Ustası | Lich Formu 5 sn daha uzun sürer. | `M necro_bn_lich_form sdur=lich:+5` |
| s17 | C | A | Öz Pınarı | Öz yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Kemik Hasadı | Kemik Mızrağı vuruşları %10 şansla +4 Öz verir. | `T hit:necro_bone_spear ch=.1 => res(4)` |
| s18 | M | – | Hapishane Kemiği | Kemik Hapishanesi bekleme −3 sn, hasarı +%20. | `M necro_bone_prison cd=-3 dmgx=1.2` |
| s20 | M | – | Kemik Zamanı | Kemik Ruhu ve Lich Formu bekleme −%10. | `M necro_bn_bone_spirit+necro_bn_lich_form cdx=.9` |
| s21 | M | – | Emiş Ustası | Kan Emişi iyileştirmesi +%25, hasarı +%15. | `M necro_blood_siphon healx=1.25 dmgx=1.15` |
| s25 | M | – | Çürüme Lanetı | Lanet: Çürüme hasarı +%25. | `M necro_curse_decay dmgx=1.25` |
| s26 | C | A | Ölüm Çağrısı | Lich Formu kullanınca grup 6 sn güçlenir. | `T cast:necro_bn_lich_form => st(party,empower,6)` |
| s26 | C | B | Koruyucu Ruh | Kemik Ruhu kullanınca %5 can yenilenir. | `T cast:necro_bn_bone_spirit => heal(.05)` |
| s27 | M | – | Fırtına Yankısı | Kemik Fırtınası %15 şansla yarı güçte tekrar eder. | `T cast:necro_bone_storm ch=.15 => echo(necro_bone_storm,.5,.5)` |
| s28 | K | – | Kemik Yürek | Fiziksel hasar +%10, kritik şansı +%2. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S physicalDamagePct=.10 critChance=.02 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Kemik Ritmi | Hasar +%6, kritik hasarı +%15. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4). | `S damagePct=.06 critDamage=.15 ;; T crit => buff(bone_rhythm,5,{castSpeed=.05},max=4)` |
| s30 | K | A | Kemik Hükümdarı | Fiziksel hasar +%25; Kemik Fırtınası hasarı +%25. | `S physicalDamagePct=.25 ;; M necro_bone_storm dmgx=1.25` |
| s30 | K | B | Lich Kralı | Gölge hasarı +%20, büyü hızı +%5; Lich Formu bekleme −%20. | `S shadowDamagePct=.20 castSpeed=.05 ;; M necro_bn_lich_form cdx=.8` |


#### 2.10.9 Warlock (`warlock`)

kaynak Mana · pip Ruh Parçası · spec: Azap, Yıkım (ikisi Hasarcı) · sınıf ağacı `s05`: **Büyü Kilidi** (kesme) | **Dayanıklılık Sözleşmesi**.

##### `class:warlock` — Warlock — Sınıf Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `int` · s03 `shadowDamagePct` · s06 `dotPct` · s07 `castSpeed` · s08 `critChance` · s10 `maxHpPct` · s14 `minionDamagePct` · s16 `minionHpPct` · s19 `resourceRegenPct` · s22 `cdr` · s23 `fireDamagePct` · s24 `lifeSteal`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Gölge Adımı | Hareket hızı +%8. | `S moveSpeedPct=.08` |
| s02 | C | B | İblis Atılışı | Hasar alınca %10 şansla 3 sn hareket hızı +%20 (6 sn bekleme). | `T hurt ch=.1 icd=6 => buff(fel_dash,3,{moveSpeedPct=.2})` |
| s04 | M | – | Yoğun Gölge Oku | Gölge Oku hasarı +%15, maliyeti −%10. | `M warlock_shadow_bolt dmgx=1.15 costx=.9` |
| s05 | A | A | Beceri: Büyü Kilidi | Açılan beceri: `warlock_spell_lock` (SkillDef satırı §1) | `G warlock_spell_lock` |
| s05 | A | B | Beceri: Dayanıklılık Sözleşmesi | Açılan beceri: `warlock_unending_resolve` (SkillDef satırı §1) | `G warlock_unending_resolve` |
| s09 | C | A | Can Bağı | Can Dönüşümü sonrası 6 sn %10 hasar azaltma kazanırsın. | `T cast:warlock_life_tap => buff(life_pact,6,{damageReductionPct=.1})` |
| s09 | C | B | Kader Direnci | Canın %35 altına düşünce %15 can yenilenir (60 sn bekleme). | `T hurt if=hp<.35 icd=60 => heal(.15)` |
| s11 | M | – | Yozlaşma Ustası | Yozlaşma maliyeti −%20, zamanla hasarı +%15. | `M warlock_corruption costx=.8 dotx=1.15` |
| s12 | M | – | Azap Ustası | Azap maliyeti −%20, zamanla hasarı +%10. | `M warlock_agony costx=.8 dotx=1.1` |
| s13 | M | – | İblis Çağrısı | İblis Çağır bekleme −2 sn; yoldaş canı +%10. | `M warlock_summon_demon cd=-2 ;; S minionHpPct=.10` |
| s15 | C | A | Zaman Silahı | Zamanla hasar +%20. | `S dotPct=.20` |
| s15 | C | B | Ateş ve Kükürt | Ateş hasarı +%15; Ateş Yağmuru hasarı +%15. | `S fireDamagePct=.15 ;; M warlock_rain_of_fire dmgx=1.15` |
| s17 | C | A | Ruh Pınarı | Mana yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Kan Pakti | Can Dönüşümü maliyeti −%33, verdiği mana +%50. | `M warlock_life_tap costx=.67 p.manaFlat*=1.5` |
| s18 | M | – | Emme Ustası | Can Emme hasarı +%20, iyileştirmesi +%25. | `M warlock_drain_life dmgx=1.2 healx=1.25` |
| s20 | M | – | Sözleşme Zamanı | Büyük yetenek bekleme süreleri %6 daha hızlı azalır. | `S majorCdrPct=.06` |
| s21 | M | – | Geniş Ateş Yağmuru | Ateş Yağmuru alanı +%25, mana maliyeti −%10. | `M warlock_rain_of_fire radx=1.25 costx=.9` |
| s25 | M | – | Kadim Dönüşüm | Can Dönüşümü bekleme −3 sn, maliyeti −%20. | `M warlock_life_tap cd=-3 costx=.8` |
| s26 | C | A | Karanlık Ordu | Cehennem Muhafızı kullanınca grup 8 sn güçlenir. | `T cast:warlock_summon_infernal => st(party,empower,8)` |
| s26 | C | B | Koruyucu Sözleşme | Can Dönüşümü 10 m içindeki müttefikleri 4 sn güçlendirir. | `T cast:warlock_life_tap => st(near(10),fortify,4)` |
| s27 | M | – | Muhafız Efendisi | Cehennem Muhafızı bekleme −%15, hasarı +%20. | `M warlock_summon_infernal cdx=.85 dmgx=1.2` |
| s28 | K | – | Karanlık Beden | Maks. can +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Sözleşme Ritmi | Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4). | `S damagePct=.06 ;; T crit => buff(pact_rhythm,5,{castSpeed=.05},max=4)` |
| s30 | K | A | Acı Efendisi | Zamanla hasar +%30, gölge hasarı +%10. | `S dotPct=.30 shadowDamagePct=.10` |
| s30 | K | B | Şeytan Efendisi | Yoldaş hasarı +%25, canı +%20; İblis Çağır bekleme −%30. | `S minionDamagePct=.25 minionHpPct=.20 ;; M warlock_summon_demon cdx=.7` |

##### `spec:warlock_affliction` — Azap — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `dotPct` · s03 `shadowDamagePct` · s06 `castSpeed` · s07 `critChance` · s08 `int` · s10 `damagePct` · s14 `critDamage` · s16 `resourceRegenPct` · s19 `lifeSteal` · s22 `cdr` · s23 `maxHpPct` · s24 `ailingDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Dengesiz Güç | Dengesiz Azap hasarı +%15, zamanla hasarı +%15. | `M warlock_unstable_affliction dmgx=1.15 dotx=1.15` |
| s02 | C | B | Yozlaşma Yayılımı | Yozlaşma kritik şansı +%10, süresi +3 sn. | `M warlock_corruption crit=+.1 sdur=corruption:+3` |
| s04 | M | – | Dengesiz Ustalık | Dengesiz Azap maliyeti −%20, süresi +2 sn. | `M warlock_unstable_affliction costx=.8 sdur=unstable_affliction:+2` |
| s05 | A | – | Beceri: Yozlaşma Tohumu | Açılan beceri: `warlock_seed_of_corruption` (SkillDef satırı §1) | `G warlock_seed_of_corruption` |
| s09 | C | A | Kan Hırsı | Azaplı düşmanı öldürünce %50 şansla %2 can yenilenir. | `T kill if=tst:agony ch=.5 => heal(.02)` |
| s09 | C | B | Gölge Zırhı | Azap uygularken %15 şansla 4 sn %12 hasar azaltma kazanırsın. | `T cast:warlock_agony ch=.15 => buff(shadow_ward,4,{damageReductionPct=.12})` |
| s11 | M | – | Tohum Ustası | Yozlaşma Tohumu +1 hedefe bulaşır, hasarı +%20. | `M warlock_seed_of_corruption cnt=+1 dmgx=1.2` |
| s12 | M | – | Azap Yankısı | Azap %15 şansla fazladan bir yığın uygular. | `T cast:warlock_agony ch=.15 => st(tgt,agony,18)` |
| s13 | M | – | Yozlaşma Gücü | Yozlaşma zamanla hasarı +%20, maliyeti −%15. | `M warlock_corruption dotx=1.2 costx=.85` |
| s15 | C | A | Karanlık Ruh Ustası | Karanlık Ruh 4 sn daha uzun sürer. | `M warlock_af_dark_soul sdur=soul_misery:+4` |
| s15 | C | B | Pandemik Ustası | Pandemik 4 sn daha uzun sürer, alanı +%20. | `M warlock_af_pandemic dur=+4 radx=1.2` |
| s17 | C | A | Ruh Pınarı | Mana yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Ruh Biçen | Azaplı düşman ölünce %25 şansla +1 Ruh Parçası kazanırsın. | `T kill if=tst:agony ch=.25 => pip(shard,1)` |
| s18 | M | – | Acı Emişi | Can Emme hasarı +%20. | `M warlock_drain_life dmgx=1.2` |
| s20 | M | – | Acı Zamanı | Karanlık Ruh ve Pandemik bekleme −%10. | `M warlock_af_dark_soul+warlock_af_pandemic cdx=.9` |
| s21 | M | – | Ateş Dili | Dengesiz Azaplı düşman ölünce çevreye %100 gölge patlaması olur. | `T kill if=tst:unstable_affliction => exp(1.0,4,shadow)` |
| s25 | M | – | Tohum Fırtınası | Yozlaşma Tohumu bekleme −4 sn, patlaması +%25. | `M warlock_seed_of_corruption cd=-4 dmgx=1.25` |
| s26 | C | A | Acı Yayılımı | Pandemik kullanınca grup 6 sn güçlenir. | `T cast:warlock_af_pandemic => st(party,empower,6)` |
| s26 | C | B | Ruh Bağı | Karanlık Ruh kullanınca +2 Ruh Parçası kazanırsın. | `T cast:warlock_af_dark_soul => pip(shard,2)` |
| s27 | M | – | Acıların Dansı | Yozlaşma %20 şansla yarı güçte yeniden uygulanır. | `T cast:warlock_corruption ch=.2 => echo(warlock_corruption,.5,.4)` |
| s28 | K | – | Sonsuz Acı | Zamanla hasar +%15, büyü hızı +%4. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S dotPct=.15 castSpeed=.04 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Kader Dokusu | Hasar +%6, kritik şansı +%2. Kritik vuruşlar %15 şansla +1 Ruh Parçası verir. | `S damagePct=.06 critChance=.02 ;; T crit ch=.15 => pip(shard,1)` |
| s30 | K | A | Acı Hükümdarı | Zamanla hasar +%30; Dengesiz Azap hasarı +%20. | `S dotPct=.30 ;; M warlock_unstable_affliction dmgx=1.2` |
| s30 | K | B | Zaman Efendisi | Zamanla hasar +%20, gölge hasarı +%10, büyü hızı +%5; Pandemik bekleme −%20. | `S dotPct=.20 shadowDamagePct=.10 castSpeed=.05 ;; M warlock_af_pandemic cdx=.8` |

##### `spec:warlock_destruction` — Yıkım — Uzmanlık Ağacı

Palet (12 P düğümü, sırayla s01 s03 s06 s07 s08 s10 s14 s16 s19 s22 s23 s24; her düğüm 2 rank, değerler §2.6): s01 `fireDamagePct` · s03 `critChance` · s06 `critDamage` · s07 `castSpeed` · s08 `int` · s10 `damagePct` · s14 `shadowDamagePct` · s16 `resourceRegenPct` · s19 `aoePct` · s22 `cdr` · s23 `maxHpPct` · s24 `executeDamagePct`

| Slot | Tür | Seç. | Ad | Etki (TR) | fx |
|---|:-:|:-:|---|---|---|
| s02 | C | A | Alev Ustası | Yakıp Yıkma yanması +%25, süresi +3 sn. | `M warlock_immolate dotx=1.25 sdur=immolate:+3` |
| s02 | C | B | Kor Gölge | Gölge Oku hasarının yarısı ateşe dönüşür; hasarı +%10. | `M warlock_shadow_bolt cv=fire:.5 dmgx=1.1` |
| s04 | M | – | Keskin Alev | Yakıp Yıkma hasarı +%15, maliyeti −%15. | `M warlock_immolate dmgx=1.15 costx=.85` |
| s05 | A | – | Beceri: Kaos Oku | Açılan beceri: `warlock_chaos_bolt` (SkillDef satırı §1) | `G warlock_chaos_bolt` |
| s09 | C | A | Kor Zırhı | Ateş kritikleri %15 şansla 4 sn %10 hasar azaltma verir. | `T crit:@fire ch=.15 => buff(ember_ward,4,{damageReductionPct=.1})` |
| s09 | C | B | Yıkım Hırsı | Kritik vuruşlar %20 şansla +1 Ruh Parçası verir. | `T crit ch=.2 => pip(shard,1)` |
| s11 | M | – | Kaos Ustalığı | Kaos Oku hasarı +%15, kritik şansı +%10. | `M warlock_chaos_bolt dmgx=1.15 crit=+.1` |
| s12 | M | – | Yıkım Yağmuru | Ateş Yağmuru hasarı +%20, alanı +%15. | `M warlock_rain_of_fire dmgx=1.2 radx=1.15` |
| s13 | M | – | Hızlı Kaos | Kaos Oku döküm süresi −%20. | `M warlock_chaos_bolt castx=.8` |
| s15 | C | A | Kaos Efendisi | Kaos 4 sn daha uzun sürer. | `M warlock_ds_havoc sdur=havoc:+4` |
| s15 | C | B | Kıyamet Ustası | Kıyamet Yağmuru +2 ateş topu atar. | `M warlock_ds_cataclysm p.balls+=2` |
| s17 | C | A | Ruh Pınarı | Mana yenilenmesi +%20. | `S resourceRegenPct=.20` |
| s17 | C | B | Ruh Alevi | Ateş kritikleri %20 şansla maks. mananın %4'ünü iade eder. | `T crit:@fire ch=.2 => resp(.04)` |
| s18 | M | – | Yakıcı Dalga | Yakıp Yıkma'lı düşman ölünce çevreye %80 ateş patlaması olur. | `T kill if=tst:immolate => exp(.8,4,fire)` |
| s20 | M | – | Yıkım Zamanı | Kaos ve Kıyamet Yağmuru bekleme −%10. | `M warlock_ds_havoc+warlock_ds_cataclysm cdx=.9` |
| s21 | M | – | Kor Fırtınası | Gölge Oku kritikleri %20 şansla ek %60 ateş hasarı vurur. | `T crit:warlock_shadow_bolt ch=.2 => dmg(.6,fire)` |
| s25 | M | – | Ateş Gücü | Ateş hasarı +%15; Kaos Oku maliyeti −%15. | `S fireDamagePct=.15 ;; M warlock_chaos_bolt costx=.85` |
| s26 | C | A | Yıkım Haykırışı | Kıyamet Yağmuru kullanınca grup 6 sn güçlenir. | `T cast:warlock_ds_cataclysm => st(party,empower,6)` |
| s26 | C | B | Kor Bağı | Kaos kullanınca +2 Ruh Parçası kazanırsın. | `T cast:warlock_ds_havoc => pip(shard,2)` |
| s27 | M | – | Kaos Yankısı | Kaos Oku %15 şansla yarı güçte tekrar eder. | `T cast:warlock_chaos_bolt ch=.15 => echo(warlock_chaos_bolt,.5,.4)` |
| s28 | K | – | Yıkımın Eli | Ateş hasarı +%10, kritik şansı +%3. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme). | `S fireDamagePct=.10 critChance=.03 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)` |
| s29 | K | – | Alev Ritmi | Hasar +%6, kritik hasarı +%15. Ateş kritikleri 5 sn boyunca +%5 büyü hızı yığar (en fazla 4). | `S damagePct=.06 critDamage=.15 ;; T crit:@fire => buff(flame_rhythm,5,{castSpeed=.05},max=4)` |
| s30 | K | A | Yıkım Hükümdarı | Ateş hasarı +%25; Kaos Oku hasarı +%25. | `S fireDamagePct=.25 ;; M warlock_chaos_bolt dmgx=1.25` |
| s30 | K | B | Kıyamet Kralı | Kritik hasarı +%25, kritik şansı +%2; Kıyamet Yağmuru bekleme −%20. | `S critDamage=.25 critChance=.02 ;; M warlock_ds_cataclysm cdx=.8` |



---

## 3. PoE layer on `N` — the 306-node wheel

### 3.1 Geometry: nine class starts on a wheel

The existing web (125 nodes; four classes on the diagonals at r = 420, the bridge ring at r ≈ 640, keystones at r ≈ 950) is kept **byte-identical** (ids, positions, stats, links, so every saved `talents` array stays valid). Five sectors, three clusters, 14 masteries and 9 sockets are added around it. Coordinates: origin = centre, x right, **y down**, units as in GDD_SYSTEMS §3.

```
                      pl  PALADİN (0,−860)
                       |   spoke north, 24 nodes
       cl_kn           |                          nc  NEKROMANT (800,−800) · outer NE
   (−800,−800)  kn ●---+---● mg (297,−297)          (connectors nc_c1/nc_c2 ↔ mg_c1/mg_c2)
                   \   |   /
   mk KEŞİŞ  ●------ [core] ------●  wl WARLOCK
   (−860,0)        /   |   \                      (860,0)
   cl_bb        bb ●---+---● rg (297,297)             cl_rg
   (−800,800)          |                          (800,800)
                      ar  OKÇU (0,860)
```

| Class | Start | (x, y) | r · angle | Sector | Attaches to | Steps start→core | Steps start→own keystone |
|---|---|---|---|---|---|---:|---:|
| Büyücü | `mg_start` | (297, −297) | 420 · −45° | old (GDD_SYSTEMS §3) | – | 4 | 6 (`ks_glass_cannon`, `ks_mind_shield`) |
| Haydut | `rg_start` | (297, 297) | 420 · 45° | old | – | 4 | 6 (`ks_shadow_dance`, `ks_perfect_agony`) |
| Barbar | `bb_start` | (−297, 297) | 420 · 135° | old | – | 4 | 6 (`ks_blood_sacrifice`, `ks_berserker_soul`) |
| Şövalye | `kn_start` | (−297, −297) | 420 · −135° | old | – | 4 | 6 (`ks_steady_hand`, `ks_iron_fortress`) |
| Paladin | `pl_start` | (0, −860) | 860 · −90° | `pl` (CLASSES_V2 §12) | `n_spellblade` | 12 | 8 (`ks_pl_lightbringer`) |
| Keşiş | `mk_start` | (−860, 0) | 860 · 180° | `mk` | `n_warlord` | 12 | 8 (`ks_mk_empty_hand`) |
| Okçu | `ar_start` | (0, 860) | 860 · 90° | `ar` | `n_hunter_instinct` | 12 | 8 (`ks_ar_lone_wolf`) |
| Warlock | `wl_start` | (860, 0) | 860 · 0° | `wl` | `n_arcane_trickster` | 12 | 8 (`ks_wl_pain_contract`) |
| Nekromant | `nc_start` | (800, −800) | 1131 · −45° | `nc` | connectors `nc_c1`, `nc_c2` ↔ `mg_c1`, `mg_c2` | 12 | 8 (`ks_nc_unliving`) |

The five new classes start on the **rim** and grow outward (their arms and keystones are 8 steps away) while their entry node connects *inward* to the bridge ring, so they reach the old classes' territory in 3–4 steps (`pl_start → n_pl_gate → n_spellblade → ring`). The Nekromant sits behind the Büyücü: its connectors make `ks_glass_cannon` / `ks_mind_shield` 6 steps away (shadow / DoT casters share the mage nodes). Distances between starts (steps): neighbours on the wheel 7–8, opposite sides 15 (`mg_start → mk_start`).

Foreign-start rule (unchanged): a class's **own** start is free and grants nothing; another class may take it for 1 point and receives its `stats` (`pl +10 Güç`, `mk +10 Çeviklik`, `ar +10 Çeviklik`, `wl +10 Zeka`, `nc +10 Zeka`, the old four as today).

### 3.2 Node kinds and the extended `TalentNode`

| Kind | Count | Draw radius (px at zoom 1) | Cost | Notes |
|---|---:|---:|:-:|---|
| `start` | 9 | 34 | 0 / 1 (foreign) | class start, `classStart` set |
| `small` | 178 | 14 | 1 | one or two stats (≈ 25 BP) |
| `notable` | 80 | 21 | 1 | ≈ 100 BP |
| `keystone` | 16 | 30 | 1 | rule change with a drawback; dead end |
| `mastery` | 14 | 24 | 1 | **pick 1 of 3** effects; attached to one notable (dead end) |
| `socket` | 9 | 24 | 1 | holds one jewel (§3.7); dead end |
| **total** | **306** | | | 125 old + 122 sectors + 36 clusters + 14 + 9 |

```ts
// data/talents.ts (append to the existing interface)
kind: 'start' | 'small' | 'notable' | 'keystone' | 'mastery' | 'socket';
fx?: string;                                                        // effect DSL for nodes defined by this document
choices?: { name: string; desc: string; fx: string }[];            // mastery: exactly 3
// exports: TALENT_NODES, TALENT_LIST (canonical order = creation order of §3.3), CLASS_START_NODE (9 entries),
//          TALENT_BOUNDS = { minX: −1500, maxX: 1500, minY: −1500, maxY: 1500 }  (the bbox is ±1404)
CLASS_START_NODE = { mage:'mg_start', rogue:'rg_start', barbarian:'bb_start', knight:'kn_start',
                     paladin:'pl_start', monk:'mk_start', archer:'ar_start', warlock:'wl_start', necromancer:'nc_start' }
```

`StatCalc` folds `stats` as today, **`special`** through `registerSpecial` as today (the CLASSES_V2 §12.3 notables keep their `special.params` read by `sp(id)`; their code is the CLASSES_V2 packages' job), and the new **`fx`** (and the chosen mastery `choices[pick].fx`) through `collectFx` (§2.5) — so every node of §3.5–3.6 is pure data.

### 3.3 Generator recipe (`src/data/passiveWeb.ts`)

The web is **built, not typed**: `RAW_BASE` (the 125 old nodes) stays in `data/talents.ts`; `buildPassiveWeb(RAW_BASE)` returns the 306. Coordinates are exact (rounded with `Math.round`, no jitter) so the golden file can be compared byte-for-byte; the seed constant `WEB_SEED = 0xEF5017` only drives the UI's cosmetic star-field (never gameplay).

```ts
const R2 = Math.SQRT1_2, NOTABLE = ['A2','A4','A6','M2','M4','M6','B2','B4','B6'];
const SECTORS = {                               // CLASSES_V2 §12.1, verbatim
  pl: { classId:'paladin',     start:[0,-860],    u:[0,-1],   entry:[0,-750],    attach:['n_spellblade'] },
  mk: { classId:'monk',        start:[-860,0],    u:[-1,0],   entry:[-750,0],    attach:['n_warlord'] },
  ar: { classId:'archer',      start:[0,860],     u:[0,1],    entry:[0,750],     attach:['n_hunter_instinct'] },
  wl: { classId:'warlock',     start:[860,0],     u:[1,0],    entry:[750,0],     attach:['n_arcane_trickster'] },
  nc: { classId:'necromancer', start:[800,-800],  u:[R2,-R2], entry:[735,-735],  attach:['nc_c1','nc_c2'] } };
// 1. nc connectors:  nc_c1 (560,-770) small shadowDamagePct .08 ↔ mg_c1 ; nc_c2 (770,-560) small maxHpPct .05 ↔ mg_c2
// 2. for p of [pl, mk, ar, wl, nc]:  buildClassSector(p)
function buildClassSector(p) {
  const { start, u, entry, attach } = SECTORS[p], v = [-u[1], u[0]], lat = { A:-150, M:0, B:150 };
  const pos = (arm, k) => [Math.round(start[0] + u[0]*68*k + v[0]*lat[arm]), Math.round(start[1] + u[1]*68*k + v[1]*lat[arm])];
  add(`${p}_start`, 'start', start, { classStart: classId, stats: FOREIGN[p] });              // FOREIGN: pl{str 10} mk{dex 10} ar{dex 10} nc{int 10} wl{int 10}
  add(P1.id, 'notable', entry, P1);  link(`${p}_start`, P1.id);  attach.forEach(a => link(P1.id, a));
  for (const arm of ['A','M','B']) for (let k = 1; k <= (arm === 'M' ? 8 : 7); k++) {   // creation order A1..A7, M1..M8, B1..B7
    const key = arm + k;
    node = NOTABLE.includes(key) ? NOTABLES[p][key]                                       // CLASSES_V2 §12.3 rows (id, name, desc, stats, params)
         : key === 'M8'          ? KEYSTONE[p]
         : { id:`${p}_${arm.toLowerCase()}${k}`, kind:'small', stats: SMALLS[p][arm][{1:0,3:1,5:2,7:3}[k]] };   // CLASSES_V2 §12.2
    add(node.id, node.kind, pos(arm, k), node);
    link(k === 1 ? `${p}_start` : prev, node.id);  prev = node.id;
  }
  link(id('A',4), id('M',4));  link(id('M',4), id('B',4));                                  // wheel cross-links
}
// 3. clusters (kn, bb, rg):  hub = (800·dx, 800·dy), θ = atan2(dy, dx), petal φ ∈ {θ−55°, θ, θ+55°} ('a','m','b'), node j (1..3) = hub + 70·j·(cos φ, sin φ)
//    creation order: hub, a1 a2 a3, m1 m2 m3, b1 b2 b3, c1, c2;  links: hub–x1–x2–x3 per petal, a2–m2–b2;
//    connector i (c1,c2) = midpoint of inner node CL[i] and the hub, linked to CL[i] and to the hub;  dir: kn(−1,−1) bb(−1,1) rg(1,1); inner: kn_c1/kn_c2, bb_c1/bb_c2, rg_c1/rg_c2
// 4. masteries (§3.6):  pos = parent + 62·(cos(a0+off), sin(a0+off)),  a0 = atan2(parent.y, parent.x),  off from the table; link to the parent only
// 5. sockets   (§3.7):  same with distance 58
// 6. validateWeb(nodes)
```

`validateWeb` (also run by `tools/talents-check.mjs` against `docs/GDD_TALENTS.web.json`): **306** nodes with kinds `{ start 9, small 178, notable 80, keystone 16, mastery 14, socket 9 }`; unique ids; every link bidirectional and every endpoint exists; **minimum pairwise distance ≥ 50** (measured 55: `mk_m5 ↔ ms_chi`); **0 crossing link segments**; bbox ±1404; every node is reachable from every `start` (BFS = 306); every `fx` parses (§2.5) and every `S` stat is a `StatId`; positions and link sets equal the golden file (Δ = 0). The 125 base nodes must equal their pre-change values exactly (Δ = 0).

### 3.4 Sector content (reused, not repeated)

The five sectors are **exactly** GDD_CLASSES_V2 §12: ids `<prefix>_start / _p1 / _a1.._a7 / _m1.._m8 / _b1.._b7`, 10 notables + 1 keystone + 12 smalls per sector (the Nekromant adds the two connectors), small-node stat lists §12.2, notable and keystone rows §12.3 (`n_mk_*`, `n_ar_*`, `n_pl_*`, `n_nc_*`, `n_wl_*`, `ks_mk_empty_hand`, `ks_ar_lone_wolf`, `ks_pl_lightbringer`, `ks_nc_unliving`, `ks_wl_pain_contract`). Small-node names/descriptions are generated from `STAT_INFO` (`name = statName(firstStat)`, `desc = "+%8 Kutsal Hasar"`). The golden file stores the final text of all 306 nodes. The `special.params` of those 55 notables/keystones are implemented through `sp(id)` by the CLASSES_V2 packages (the web node itself carries only data).

### 3.5 Outer clusters (36 nodes) — a home for the V2 stats

Three satellite clusters sit on the outer diagonals NW / SW / SE, mirroring the Nekromant's NE sector. They exist because V2 added ~10 stats that had **no node anywhere in the web**: `guardGauge`, `parryWindow`, `poiseDamagePct`, `finisherPct` (guard / parry / stance layer), `flaskGainPct`, `flaskEffectPct` (flasks), `weakDamagePct`, `runeEffectPct` (weakness and runes). Each cluster is a "flower": a hub, three 3-node petals (small · **notable** · small, the middle petal ends in a **keystone**), a2–m2–b2 cross-links, two connectors to the inner class. All values are final data (all rows parse and price under the §6 caps: smalls 10–33 BP, notables 50–123 BP, avg 102).

**Siper Kümesi** (`cl_kn`, Duruş, savuşturma ve Kritik Vuruş (V2 §3 katmanı); bağlantı: `kn_c1`, `kn_c2`)

| id | Tür | Ad | Etki | fx |
|---|:-:|---|---|---|
| `cl_kn_hub` | small | Siper Dayanıklılığı | +8 Siper Dayanıklılığı | `S guardGauge=8` |
| `cl_kn_a1` | small | Savuşturma Penceresi | +0.01 sn savuşturma penceresi | `S parryWindow=.01` |
| `cl_kn_a2` | notable | Savuşturma Ustası | Savuşturma penceresi +0.05 sn; başarılı savuşturma 4 sn hasarı +%10 artırır. | `S parryWindow=.05 ;; T parry => buff(parry_flow,4,{damagePct=.10})` |
| `cl_kn_a3` | small | Duruş Hasarı | +%5 duruş hasarı | `S poiseDamagePct=.05` |
| `cl_kn_m1` | small | Kritik Vuruş Hasarı | +%6 Kritik Vuruş hasarı | `S finisherPct=.06` |
| `cl_kn_m2` | notable | Duruş Kırıcı | Duruş hasarı +%20; sarsma +%10. | `S poiseDamagePct=.20 staggerPct=.10` |
| `cl_kn_m3` | keystone | Kırıcı Disiplin | Kritik Vuruş ve Karşı Vuruş hasarı +%50; savuşturma penceresi −0.08 sn. | `S finisherPct=.50 parryWindow=-.08` |
| `cl_kn_b1` | small | Siper Dayanıklılığı | +8 Siper Dayanıklılığı | `S guardGauge=8` |
| `cl_kn_b2` | notable | Bastion Ruhu | Siper Dayanıklılığı +25; blok şansı +%3. | `S guardGauge=25 blockChance=.03` |
| `cl_kn_b3` | small | Blok Miktarı | +%4 blok miktarı | `S blockAmount=.04` |
| `cl_kn_c1` | small | Çelik Yol (bağlayıcı) | +%10 zırh | `S armorPct=.10` |
| `cl_kn_c2` | small | Demir Nefes (bağlayıcı) | +%3 maks. can | `S maxHpPct=.03` |

**Şişe ve Kan Kümesi** (`cl_bb`, Şişeler, can çalma, hayatta kalma (V2 §4.2); bağlantı: `bb_c1`, `bb_c2`)

| id | Tür | Ad | Etki | fx |
|---|:-:|---|---|---|
| `cl_bb_hub` | small | Şişe Dolumu | +%10 şişe dolumu | `S flaskGainPct=.10` |
| `cl_bb_a1` | small | İksir Etkinliği | +%8 iksir etkinliği | `S potionPct=.08` |
| `cl_bb_a2` | notable | Kızıl Kadeh | Şişe etkisi +%20; şişe dolumu +%20. | `S flaskEffectPct=.20 flaskGainPct=.20` |
| `cl_bb_a3` | small | Can Yenilenmesi | +4 can yenilenmesi/sn | `S hpRegen=4` |
| `cl_bb_m1` | small | Can Çalma | +%0.4 can çalma | `S lifeSteal=.004` |
| `cl_bb_m2` | notable | Kan Pınarı | Öldürme başına maks. canın %1.5'i; can çalma +%0.5. | `S hpOnKillPct=.015 lifeSteal=.005` |
| `cl_bb_m3` | keystone | Kanla Sulanan | Şişe dolumu +%100; iksirlerin etkinliği %50 azalır. | `S flaskGainPct=1.0 potionPct=-.5` |
| `cl_bb_b1` | small | Şişe Etkisi | +%6 şişe etkisi | `S flaskEffectPct=.06` |
| `cl_bb_b2` | notable | Şişe Ustası | Şişe dolumu +%30; şişe etkisi +%15. | `S flaskGainPct=.30 flaskEffectPct=.15` |
| `cl_bb_b3` | small | Alınan İyileştirme | +%4 alınan iyileştirme | `S healReceivedPct=.04` |
| `cl_bb_c1` | small | Kızıl Yol (bağlayıcı) | +%3 maks. can | `S maxHpPct=.03` |
| `cl_bb_c2` | small | Kan Damarı (bağlayıcı) | +3 can yenilenmesi/sn | `S hpRegen=3` |

**Sömürü Kümesi** (`cl_rg`, Zayıflık sömürüsü, rünler, kritik (V2 §4.1, §7); bağlantı: `rg_c1`, `rg_c2`)

| id | Tür | Ad | Etki | fx |
|---|:-:|---|---|---|
| `cl_rg_hub` | small | Zayıflık Hasarı | +%6 zayıflık hasarı | `S weakDamagePct=.06` |
| `cl_rg_a1` | small | Kritik Şansı | +%0.7 kritik şansı | `S critChance=.007` |
| `cl_rg_a2` | notable | Zayıflık Avcısı | Zayıflık hasarı +%20; kritik şansı +%1.5. | `S weakDamagePct=.20 critChance=.015` |
| `cl_rg_a3` | small | Kritik Hasarı | +%7 kritik hasarı | `S critDamage=.07` |
| `cl_rg_m1` | small | Rün Etkisi | +%4 rün etkisi | `S runeEffectPct=.04` |
| `cl_rg_m2` | notable | Rün Ustası | Rün etkisi +%20; bekleme süresi azaltma +%3. | `S runeEffectPct=.20 cdr=.03` |
| `cl_rg_m3` | keystone | Sömürü Çılgınlığı | Zayıflık hasarı +%60; genel hasar −%10. | `S weakDamagePct=.60 damagePct=-.10` |
| `cl_rg_b1` | small | Hareket Hızı | +%2 hareket hızı | `S moveSpeedPct=.02` |
| `cl_rg_b2` | notable | Pusu Avcısı | Etkilenmişlere hasar +%15; elit hasarı +%10. | `S ailingDamagePct=.15 eliteDamagePct=.10` |
| `cl_rg_b3` | small | Boss Hasarı | +%3 boss hasarı | `S bossDamagePct=.03` |
| `cl_rg_c1` | small | Gölge Yol (bağlayıcı) | +%0.7 kaçınma | `S dodgeChance=.007` |
| `cl_rg_c2` | small | Çevik Yol (bağlayıcı) | +%2 saldırı hızı | `S attackSpeed=.02` |


### 3.6 Masteries (14 × 3 effects)

A **mastery** is a dead-end node next to one notable (the angle in the table, e.g. `+50°`, is its offset from the parent's radial direction, §3.3 step 4); it needs that notable (and a path to it) allocated, costs 1 point and, when taken, opens a **3-effect picker** (`save.passiveExtra.picks[nodeId] = 0|1|2`). Changing the pick = refunding the node and taking it again (draft changes are free; after Apply it costs one refund). Every effect is priced ≤ 90 BP (avg 41 stat BP + the proc/mod it adds).

| id | Ebeveyn | Ad | Seçenek 1 | Seçenek 2 | Seçenek 3 |
|---|---|---|---|---|---|
| `ms_fire` | `n_pyromancer` (+50°) | Ateş Ustalığı | **Yakıp Kavuran** — Ateş hasarı +%12; yanma şansı +%8. `S fireDamagePct=.12 burnChance=.08` | **Kor Patlaması** — Yanan düşman ölünce çevreye %80 ateş patlaması olur. `T kill if=tst:burn => exp(.8,4,fire)` | **Alev Hızı** — Büyü hızı +%6; Ateş Topu hasarı +%10. `S castSpeed=.06 ;; M mage_fireball dmgx=1.1` |
| `ms_frost` | `n_cryomancer` (+50°) | Buz Ustalığı | **Kış Soluğu** — Buz hasarı +%12; üşümüşlere hasar +%8. `S frostDamagePct=.12 chilledDamagePct=.08` | **Parçalanan Buz** — Donmuş düşman ölünce çevreye %80 buz patlaması olur. `T kill if=tst:freeze => exp(.8,4,frost)` | **Buz Kalkanı** — Buz büyüsü kullanınca 4 sn %8 hasar azaltma kazanırsın. `T cast:@frost => buff(frost_aegis,4,{damageReductionPct=.08})` |
| `ms_arcane` | `n_arcane_flow` (+50°) | Gizem Ustalığı | **Gizem Akışı** — Gizem hasarı +%12; kaynak yenilenmesi +%10. `S arcaneDamagePct=.12 resourceRegenPct=.10` | **Mana Sızıntısı** — Gizem büyüleri %10 şansla maks. mananın %3'ünü iade eder. `T cast:@arcane ch=.1 => resp(.03)` | **Zaman Kıvrımı** — Bekleme azaltma +%3; büyü hızı +%4. `S cdr=.03 castSpeed=.04` |
| `ms_shadow` | `n_assassin` (+50°) | Gölge Ustalığı | **Keskin Gölge** — Kritik hasarı +%15; kritik şansı +%1. `S critDamage=.15 critChance=.01` | **Kaçınma Dansı** — Bir saldırıdan kaçınınca 3 sn hasarın +%15 artar. `T dodge => buff(shadow_dance_ms,3,{damagePct=.15})` | **Gölge Zırhı** — Gizlilikten vurunca 3 sn %15 hasar azaltma kazanırsın (5 sn bekleme). `T hit if=stealth icd=5 => buff(shadow_armor,3,{damageReductionPct=.15})` |
| `ms_poison` | `n_toxicologist` (+0°) | Zehir Ustalığı | **Ölümcül Doz** — Zehir hasarı +%12; zehir şansı +%8. `S poisonDamagePct=.12 poisonChance=.08` | **Salgın** — Zehirli düşman ölünce çevreye %60 zehir bulutu olur. `T kill if=tst:poison => exp(.6,4,poison)` | **Panzehir Bilgisi** — Zehir direnci +%15; kontrol azaltma +%5. `S resPoison=.15 ccReductionPct=.05` |
| `ms_blood` | `n_bloodletter` (+50°) | Kan Ustalığı | **Kan Seli** — Kanama hasarı +%12; kanama şansı +%8. `S bleedDamagePct=.12 bleedChance=.08` | **Kan Hasadı** — Kanayan düşmanı öldürünce maks. canının %2'si yenilenir. `T kill if=tst:bleed => heal(.02)` | **Kızıl Öfke** — Kanayan düşmana vuruşlar %10 şansla +3 kaynak verir. `T hit ch=.1 if=tst:bleed => res(3)` |
| `ms_rage` | `n_rage_engine` (+50°) | Öfke Ustalığı | **Öfke Pınarı** — Kaynak üretimi +%12; maks. kaynak +5. `S resourceGainPct=.12 maxResource=5` | **Savaş Çılgınlığı** — Vuruşlar %10 şansla 4 sn saldırı hızını +%6 artırır (3 sn bekleme). `T hit ch=.1 icd=3 => buff(war_frenzy,4,{attackSpeed=.06})` | **Demir Irade** — Kontrol azaltma +%8; sarsma +%8. `S ccReductionPct=.08 staggerPct=.08` |
| `ms_guard` | `n_bulwark` (+50°) | Siper Ustalığı | **Kalkan Duvarı** — Blok şansı +%3; zırh +%10. `S blockChance=.03 armorPct=.10` | **Karşı Vuruş** — Blokların %10 şansla çevreye %80 hasar vurur. `T block ch=.1 => dmg(.8,physical)` | **Sarsılmaz** — Siper Dayanıklılığı +20; kontrol azaltma +%5. `S guardGauge=20 ccReductionPct=.05` |
| `ms_holy` | `n_holy_light` (+0°) | Kutsal Ustalık | **Işık Çağlayanı** — Kutsal hasar +%12; şifa gücü +%4. `S holyDamagePct=.12 healingPct=.04` | **Kutsal Yeminler** — Kutsal kritikler %15 şansla en yaralı müttefiği %3 iyileştirir. `T crit:@holy ch=.15 => healally(.03)` | **Işık Zırhı** — Tüm dirençler +%3; zırh +%8. `S resAll=.03 armorPct=.08` |
| `ms_heal` | `n_pl_healing_light` (+50°) | Şifa Ustalığı | **Taşan Şifa** — Şifa gücü +%8; alınan iyileştirme +%4. `S healingPct=.08 healReceivedPct=.04` | **Yenilenme** — Şifalar %10 şansla hedefe 4 sn yenilenme verir. `T heal ch=.1 => st(ally,regen,4)` | **Mana Pınarı** — Kaynak yenilenmesi +%12; maliyet azaltma +%4. `S resourceRegenPct=.12 costReductionPct=.04` |
| `ms_minion` | `n_nc_eternal_army` (+50°) | Yoldaş Ustalığı | **Güçlü Ordu** — Yoldaş hasarı +%12; yoldaş canı +%10. `S minionDamagePct=.12 minionHpPct=.10` | **Ruh Bağı** — Yoldaş öldürmeleri %20 şansla maks. canının %2'sini yeniler. `T kill:@minion ch=.2 => heal(.02)` | **Hızlı Çağrı** — Bekleme azaltma +%3; kaynak yenilenmesi +%8. `S cdr=.03 resourceRegenPct=.08` |
| `ms_chi` | `n_mk_chi_harmony` (+50°) | Çi Ustalığı | **Derin Nefes** — Kaynak yenilenmesi +%12; saldırı hızı +%3. `S resourceRegenPct=.12 attackSpeed=.03` | **Çi Taşkını** — Çi harcayınca %10 şansla +1 Çi kazanırsın. `T spend:chi ch=.1 => pip(chi,1)` | **Akış Zırhı** — Kaçınma +%1.5; hareket hızı +%3. `S dodgeChance=.015 moveSpeedPct=.03` |
| `ms_ranged` | `n_ar_sharp_shooter` (-50°) | Nişancı Ustalığı | **Keskin Uç** — Mermi hasarı +%12; mermi hızı +%10. `S projectileDamagePct=.12 projectileSpeedPct=.10` | **Nişan Alma** — Hareketsiz durduktan 1.5 sn sonra 4 sn hasarın +%10 artar. `T still:1.5 => buff(steady_aim,4,{damagePct=.10})` | **Av Refleksi** — Hareket hızı +%3; kaçınma +%1.5. `S moveSpeedPct=.03 dodgeChance=.015` |
| `ms_dot` | `n_wl_blight_master` (-50°) | Zaman Ustalığı | **Uzun Acı** — Zamanla hasar +%12; büyü hızı +%3. `S dotPct=.12 castSpeed=.03` | **Ruh Hasadı** — Azaplı düşmanı öldürünce %20 şansla maks. mananın %3'ü geri gelir. `T kill if=tst:agony ch=.2 => resp(.03)` | **Kader Zırhı** — Maks. can +%4; can çalma +%0.3. `S maxHpPct=.04 lifeSteal=.003` |


### 3.7 Jewel sockets and jewels (optional wave — T17)

Nine **sockets** (`kind 'socket'`, one per class, attached to the small node shown) hold one **Kadim Mücevher** each; the node must be allocated; removing the node returns the jewel to the bag. Jewels are items (`ItemCategory 'jewel'`, no equip slot — sockets only, `CharacterSave.passiveExtra.jewels[nodeId]`): three bases **`jewel_ruby` Yakut (Güç)**, **`jewel_sapphire` Safir (Zeka)**, **`jewel_emerald` Zümrüt (Çeviklik)**; rarity Büyülü 1 affix · Nadir 2 · Destansı 3 (no Efsanevi); each affix is drawn from the colour's pool of 6 and is worth **50 BP** (one T1 roll × 0.5, scaled by the item's ilvl band exactly like gear): Ruby `str vit fireDamagePct meleeDamagePct armorPct maxHpPct`, Sapphire `int castSpeed frostDamagePct arcaneDamagePct resourceRegenPct cdr`, Emerald `dex critChance critDamage poisonDamagePct projectileDamagePct moveSpeedPct`. Sources: M+ end chest (timed ≥ +5: 12 %), Efsun Goblini (6 %), raid bosses (15 %), Gizemli Tüccar (new gamble slot "Mücevher", price `20 × sell(normal item of the player's level)` as for gear). Typical build: 3–5 sockets ≈ 300–500 BP (the cost is the path points, so sockets are a deliberate choice, not free power).

| id | Ebeveyn | Açı | Yuva |
|---|---|--:|---|
| `sk_kn` | `kn_c1` | 0° | Şövalye |
| `sk_bb` | `bb_c1` | 0° | Barbar |
| `sk_mg` | `mg_c1` | 0° | Büyücü |
| `sk_rg` | `rg_c1` | 0° | Haydut |
| `sk_pl` | `pl_a5` | -50° | Paladin |
| `sk_mk` | `mk_a5` | -50° | Keşiş |
| `sk_ar` | `ar_a5` | -50° | Okçu |
| `sk_wl` | `wl_a5` | -50° | Warlock |
| `sk_nc` | `nc_a5` | -50° | Nekromant |


### 3.8 Passive points and refunds

| Source | Points | Rule |
|---|---:|---|
| Levels 2–60 | 59 | 1 per level (existing) |
| Kadim Bilgelik quests | 6 | L12 / 22 / 32 / 42 / 52 / 60 (existing) |
| **Zindan Fethi** | **8** | first clear of each of the 4 dungeons on **Normal** (4) and **Kahramanlık** (4): `flags['pp.dun.<dungeonId>.<n or h>']` |
| **Bölge Kaşifi** | **6** | complete the region (boss killed once + every landmark found; GDD_OPENWORLD §5.8) of `bolge_kurt`, `bolge_ayi`, `bolge_orumcek`, `bolge_ork`, `bolge_bataklik`, `bolge_mezarlik`: `flags['pp.reg.<id>']` |
| M+ rating milestones | 5 | 500 / 1,000 / 1,500 / 2,000 / 2,500 (existing) |
| **Efsun Kalesi ilk ölüm** | **5** | first kill of each raid boss on any difficulty: `flags['pp.raid.<bossId>']` |
| **Total** | **89** | `PASSIVE_POINT_TOTAL = 89` |

`Progression.talentPointsAt(level, rating)` stays the formula for the first two + the rating rows; milestone flags add the rest (`passivePointsTotal()` = existing + `count(flags 'pp.*')`). Toast on every milestone: "+1 pasif puan kazandın (N)." The numbers keep the web at ≈ 29 % filled (89 / 306).

**Refunds (`Pişmanlık Küresi`, id `orb_regret`)** — a stackable material (pouch):

| Path | Where | Cost | Rule |
|---|---|---|---|
| **Pişmanlık Küresi** | anywhere out of combat (not in a dungeon after the countdown) | 1 orb per node | refunds one node, **the tree must stay connected to the class start** (existing rule); mastery/socket nodes included (jewel returns to the bag) |
| Gold (existing) | rest zone only | `25 × level` per node | same rule |
| Kadim Unutuş (existing) | trainer | `1,000 × level` (first free) | resets the whole web |

Orb sources: **Kadim Bilgelik** quests (+1 each, 6), Gizemli Tüccar **5,000 gold** each (max 3/day), M+ timed end chest ≥ +5 (10 %), Efsun Goblini (5 %), raid boss kill (15 %). The orb's value is *location freedom*, not a discount.

### 3.9 Measured sanity numbers (design pass, `tools/talents-check.mjs --bench`)

* **Parity of the nine starts** (greedy value-density path of N points from each start, node value = priced stats + 55 for an unpriced special + 90 for a keystone, drawbacks ignored — an *upper bound*, used only to compare classes): at **N = 89**: Şövalye 7,406 · Haydut 7,446 · Barbar 7,485 · Büyücü 7,486 · Nekromant 7,559 · Keşiş 7,770 · Warlock 7,801 · Okçu 7,806 · Paladin 7,885 BP ⇒ max / min = **1.065** (target ≤ 1.10); at N = 70: 5,968–6,507 (1.09). The 19 extra points raise the web by ≈ 23 %.
* **Notable density:** the new sectors are 42 % notables (10 of 24) against 17 % in the old ones; this is why they reach the same total at the same point count — their arms are *short and rich*, the old arms *long and sparse*.
* **Crossings 0, minimum distance 55, longest new link 203 px** (`rg_c1 ↔ cl_rg_c1`), longest existing link 226 (`mg_start ↔ mg_a1`).
* **Web export string** `EFP1-<classIndex>-<52 chars>-<6 chars>-<CC>`: 306 bits (allocated flags in `TALENT_LIST` order, 39 bytes → 52 base64url chars) + 14 mastery picks × 2 bits (4 bytes → 6 chars) + CRC-8 (poly `0x07`) over the 43 payload bytes; import shows the plan as a translucent overlay ("Plan") on the canvas; points are not spent until the player clicks nodes or presses "Planı Uygula" (which stages the connected prefix of the plan that fits the free points).


---

## 4. Bridge — Beceri Uzmanlıkları (Last-Epoch-style skill specialisation)

### 4.1 The decision: one model, no duplicate system

Three candidate models were weighed against GDD_V2 §4.1 (the 24 **Destek Rünleri**, 2 sockets per skill):

| Model | Verdict | Why |
|---|---|---|
| A. Mini-trees *are* the support runes | rejected | runes are loot-driven generic multipliers (`Çoklu Atış +2 mermi`, `Kısa Bekleme ×0.8`); a point-driven copy would duplicate every verb and make the rune panel redundant |
| B. A third point pool (Last Epoch's per-skill points) | rejected | the player already has Sınıf/Uzmanlık Puanı and Pasif Puan; a third spend currency fragments the N window |
| **C. Form changes unlocked by *using* the skill — no points** | **chosen** | gives the "my Fireball splits / returns / becomes Frostball" fantasy, rewards playing a skill, adds no currency, and shares **no verb** with runes |

**Division of labour (the contract that avoids duplicates):**

| Layer | Answers | Typical content | Source |
|---|---|---|---|
| Support runes (V2 §4.1) | *how much* | `more`, +projectiles, +pierce, chain, area, cost ×, cooldown ×, leech, crit | loot, 2 sockets per skill, swappable at the skill book |
| **Beceri Uzmanlığı (this section)** | ***how* — the form of the skill** | split-on-hit, return, orbit, echo, **full element conversion**, **charges instead of cooldown**, new status on hit, pull, a skill-local proc | mastery tiers, A / B per tier, free to change out of combat |
| Class / spec trees (§2) | *when and with what* | procs, mods on named skills, resource rules, skill unlocks | Sınıf / Uzmanlık Puanı |
| Passive web (§3) | *global stats* | `%` stats, keystones, masteries | Pasif Puan |

### 4.2 Mastery (Ustalık)

* **XP:** `Progression.addSkillMastery(skillId, xp)` is called by `SkillSystem` after a cast that hit ≥ 1 enemy (or healed / buffed ≥ 1 ally): `xp = min(20, 1 + floor(cooldown / 2))` (basic chain and instant skills: 1; a 9 s skill: 5; a 60 s ultimate: 20), channels award once per second of channel, at most one award per skill per 0.5 s. `StatCalc` stat **`skillMasteryPct`** (Ustalık Kazancı) multiplies it (no web node uses it in v1; reserved for aspects / Kadim Levha).
* **Tiers:** `MASTERY_XP = [200, 1000, 3000]` for tier 1 / 2 / 3. **Level catch-up:** tier *t* is also unlocked when the character level ≥ `[30, 45, 60][t − 1]`, so a level-60 character always has every tier open. Progress is stored per skill id (`CharacterSave.skillMastery`), survives spec changes (shared by all specs that use the skill).
* **Time to tier 3** (3,000 XP): a cooldown-0 skill (1 XP per use) ≈ 3,000 uses ≈ 3 h of constant fighting — which is why the level gate exists; an 8–10 s skill (5 XP) ≈ 600 uses ≈ 90 min; the ultimate (20 XP) ≈ 150 uses.
* **Picks:** per signature skill a tier holds **A, B or none**; picks are free to change **out of combat anywhere** (they change a form, not power) and are part of the loadout (`TalentLoadout.skl[9]`: 3 skills × 3 tiers, 0/1/2). A tier whose predecessor tier has no pick is still selectable (tiers are independent; the ladder is cosmetic).

### 4.3 The banned-verb rule (checked by the data build)

A specialisation option **must contain at least one form verb** and **none of the runes' verbs**:

| Allowed (form) | Banned (number — belongs to runes / trees) |
|---|---|
| `shape=split:n:coef` · `shape=return` · `shape=orbit:n` · `shape=echo:delay:coef` · `shape=pull:strength` | `dmgx` · `cd` · `cdx` (except as the price of `chg`) · `cost` · `costx` · `rad` · `radx` · `rng` · `cast` · `castx` |
| `cv=<type>:1` (**full** conversion only; partial conversion is a tree verb) | `cnt` (extra projectiles) · `prc` (pierce) · `kbx` · `stgx` · `crit` · `dotx` · `healx` · `absx` · `dur` |
| `st=<status>:<dur>:<mag>` (a status the skill did not apply) | any `S` (stat) item |
| `chg=+1` **with** `cdx≥1.4` (cooldown → charges) | `G`, `X` items |
| `p.<key>=v` (set a behaviour param, e.g. `atCaster=0`) | |
| `T hit:<skill> …` / `T cast:<skill> …` (skill-local procs only; the target must be the option's own skill) | procs on other skills |

### 4.4 Resolution order and the net rule

`resolveSkill(def, player)` (V2 WP3 export, extended by T7) builds the derived `SkillDef` in this order and caches it until stats, picks, runes or loadout change (`cacheKey = skillId|specId|rev`): **base def → `SpecDef.mods` patches → `SpecDef.fx` → class-tree and spec-tree `M` mods → skill-specialisation options (tiers 1→3, picked side) → web `fx` mods (notables, masteries, jewels) → support runes → stats/crit pipeline.** Form shapes (`split`, `return`, `orbit`, `echo`, `pull`) are executed by the behaviours through a single wrapper (`withShape(behavior, shape)` in `combat/skillMods.ts`), so no skill needs bespoke code. Remote peers replay the form: the `cast` message gains an optional **`sf: number`** (3 tiers × 2 bits of the cast skill's picks, `0` when none) so vfx/anim match; damage stays attacker-authoritative (ARCHITECTURE "client-computed damage").

### 4.5 The 27 signature skills (3 per class) — 162 options

Every class has three signature skills (rmb-slot builder, a signature mid-skill, a build-defining third) — the skills the class tree already tweaks most. Each has 3 tiers × A|B. `shape` verbs execute as above; "→ ateş/buz…" rows are full element conversions that change the projectile vfx and the damage type; the `fx` column is the exact effect string (all rows parse and obey §4.3; checked headless). The remaining 45 core skills and the spec skills get their rows in a later data-only wave using the same vocabulary.

**Şövalye**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Kalkan Darbesi (`knight_shield_bash`) | T1 | **Çarpma Dalgası** — Darbe çevredeki düşmanlara %60 hasarla çarpma dalgası yayar. `T hit:knight_shield_bash => exp(.6,3,physical)` | **Kutsal Kıvılcım** — Darbe hedefi 4 sn Savunmasız yapar (+%10 hasar alır). `M knight_shield_bash st=sunder:4:.1` |
|  | T2 | **Fırlatılan Kalkan** — Kalkanı ileri fırlatırsın; hedefte geri döner ve ikinci kez vurur. `M knight_shield_bash shape=return` | **Yankılı Darbe** — Darbe 0.4 sn sonra yarım güçte bir kez daha vurur. `M knight_shield_bash shape=echo:.4:.5` |
|  | T3 | **Kutsal Darbe** — Darbe tamamen kutsal hasara dönüşür ve hedefi 3 sn Yargılı yapar. `M knight_shield_bash cv=holy:1 st=judged:3:1` | **Kale Duruşu** — Darbe sonrası 4 sn blok şansın +%25 olur ve +4 Kararlılık kazanırsın. `T cast:knight_shield_bash => buff(wall_stance,4,{blockChance=.25}) ; res(4)` |
| Işıltılı Yarma (`knight_radiant_cleave`) | T1 | **Çifte Yarma** — Yarma 0.3 sn sonra %50 güçle ikinci kez vurur. `M knight_radiant_cleave shape=echo:.3:.5` | **Işık Yarığı** — Yarma isabet eden düşmanları 3 sn yakar. `M knight_radiant_cleave st=burn:3:.4` |
|  | T2 | **Dönen Yarma** — Yarma önündeki koni yerine çevrendeki 360° alana vurur. `M knight_radiant_cleave shape=orbit:1` | **Çekim** — Yarma düşmanları sana doğru çeker. `M knight_radiant_cleave shape=pull:2` |
|  | T3 | **Işık Hasadı** — Yarma bir düşmanı öldürürse bekleme süresi 2 sn azalır. `T kill:knight_radiant_cleave => cdr(knight_radiant_cleave,2)` | **Adalet Darbesi** — Yarma seçkin düşmanları %30 şansla 1.2 sn sersemletir. `T hit:knight_radiant_cleave if=elite ch=.3 => st(tgt,stun,1.2)` |
| Kutsal Toprak (`knight_consecration`) | T1 | **Alev Zemini** — Kutsal Toprak içindeki düşmanları yakar. `M knight_consecration st=burn:3:.3` | **Işık Zemini** — Kutsal Toprak açılırken 8 m içindeki müttefikleri 6 sn Kutsanmış yapar. `T cast:knight_consecration => st(near(8),blessed,6)` |
|  | T2 | **Kalıcı Toprak** — Kutsal Toprak seninle değil, işaret ettiğin noktada açılır. `M knight_consecration p.atCaster=0` | **Kutsal Patlama** — Kutsal Toprak açılırken çevreye %100 kutsal patlama yapar. `T cast:knight_consecration => exp(1.0,5,holy)` |
|  | T3 | **Kutsal Kale** — Toprak açılınca 8 sn %15 hasar azaltma kazanırsın. `T cast:knight_consecration => buff(holy_fort,8,{damageReductionPct=.15})` | **Güneş Alanı** — Toprak 2 sn sonra yeniden aktifleşir. `M knight_consecration shape=echo:2:1` |

**Barbar**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Yarma (`barbarian_cleave`) | T1 | **Çifte Yarma** — Yarma 0.35 sn sonra %60 güçle tekrar vurur. `M barbarian_cleave shape=echo:.35:.6` | **Bağ Kesen** — Yarma hedefi 2 sn yavaşlatır. `M barbarian_cleave st=slow:2:.3` |
|  | T2 | **Dönen Yarma** — Yarma çevrendeki 360° alana vurur. `M barbarian_cleave shape=orbit:1` | **Kanlı Çekim** — Yarma düşmanları sana doğru çeker. `M barbarian_cleave shape=pull:2` |
|  | T3 | **Kan Hasadı** — Kanayan hedefe Yarma %3 can yeniler ve +5 Öfke verir. `T hit:barbarian_cleave if=tst:bleed => heal(.03) ; res(5)` | **Boyun Eğdiren** — Yarma seçkin düşmanları %30 şansla 1.2 sn sersemletir. `T hit:barbarian_cleave if=elite ch=.3 => st(tgt,stun,1.2)` |
| Kasırga (`barbarian_whirlwind`) | T1 | **Çelik Kasırga** — Kasırga başlarken 3 sn %20 hasar azaltma kazanırsın. `T cast:barbarian_whirlwind => buff(steel_whirl,3,{damageReductionPct=.2})` | **Kan Kasırgası** — Kasırga vuruşları kanama uygular. `M barbarian_whirlwind st=bleed:4:.3` |
|  | T2 | **Çekim Girdabı** — Kasırga düşmanları merkezine çeker. `M barbarian_whirlwind shape=pull:3` | **Devirici Fırtına** — Kasırga vuruşları düşmanları kısa süre yere devirir. `M barbarian_whirlwind st=knockdown:.8:1` |
|  | T3 | **Alev Kasırgası** — Kasırga ateş hasarına dönüşür ve düşmanları yakar. `M barbarian_whirlwind cv=fire:1 st=burn:3:.4` | **Ölüm Çemberi** — Kasırga bitince çevreye %200 patlama yapar. `T cast:barbarian_whirlwind => exp(2.0,5,physical)` |
| Sıçrayış (`barbarian_leap`) | T1 | **Yer Sarsıcı** — İniş darbesi hedefleri 1 sn sersemletir. `M barbarian_leap st=stun:1:1` | **Havalı Dönüş** — Sıçrayış %30 şansla bekleme süresini sıfırlar. `T cast:barbarian_leap ch=.3 => rst(barbarian_leap)` |
|  | T2 | **Çifte Sıçrayış** — Sıçrayış +1 şarj kazanır; şarjlar %50 daha yavaş dolar. `M barbarian_leap chg=+1 cdx=1.5` | **Yankılı İniş** — İniş 0.5 sn sonra %60 güçle tekrar patlar. `M barbarian_leap shape=echo:.5:.6` |
|  | T3 | **Meteor İnişi** — İniş ateş hasarına dönüşür ve düşmanları 4 sn yakar. `M barbarian_leap cv=fire:1 st=burn:4:.5` | **Kükreyen İniş** — İnişte çevredeki düşmanlar 2 sn korkar. `M barbarian_leap st=fear:2:1` |

**Büyücü**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Ateş Topu (`mage_fireball`) | T1 | **Parçalanan Top** — Ateş Topu çarpınca %40 güçte 3 kıvılcıma ayrılır. `M mage_fireball shape=split:3:.4` | **Yanıcı Top** — Ateş Topu hedefi 5 sn güçlü yakar. `M mage_fireball st=burn:5:.6` |
|  | T2 | **Dönen Alev** — 3 küçük ateş topu çevrende döner ve yakın düşmanlara vurur. `M mage_fireball shape=orbit:3` | **Çift Top** — Ateş Topu 0.3 sn sonra %70 güçle ikinci kez atılır. `M mage_fireball shape=echo:.3:.7` |
|  | T3 | **Buz Topu** — Ateş Topu buz hasarına dönüşür ve hedefi 2 yığın üşütür. `M mage_fireball cv=frost:1 st=chill:4:2` | **Gizem Topu** — Ateş Topu gizem hasarına dönüşür; isabette %3 mana iade eder. `M mage_fireball cv=arcane:1 ;; T hit:mage_fireball => resp(.03)` |
| Buz Halkası (`mage_frost_nova`) | T1 | **Kar Kristali** — Buz Halkası düşmanları 3 sn Savunmasız yapar. `M mage_frost_nova st=sunder:3:.15` | **Soğuk Nabız** — Halka 1 sn sonra %50 güçle yeniden genişler. `M mage_frost_nova shape=echo:1:.5` |
|  | T2 | **Çifte Halka** — Buz Halkası +1 şarj kazanır; şarjlar %50 daha yavaş dolar. `M mage_frost_nova chg=+1 cdx=1.5` | **Buz Çekimi** — Halka düşmanları merkeze doğru çeker. `M mage_frost_nova shape=pull:2` |
|  | T3 | **Ateş Halkası** — Halka ateş hasarına dönüşür ve düşmanları yakar. `M mage_frost_nova cv=fire:1 st=burn:4:.5` | **Mutlak Sıfır** — Halka seçkin düşmanlara 4 yığın Üşüme uygular. `T hit:mage_frost_nova if=elite => st(tgt,chill,4,4)` |
| Gizemli Küre (`mage_arcane_orb`) | T1 | **Titreşim** — Gizemli Küre geçtiği düşmanları 2 sn yavaşlatır. `M mage_arcane_orb st=slow:2:.3` | **Çekici Küre** — Gizemli Küre düşmanları kendine çeker. `M mage_arcane_orb shape=pull:1` |
|  | T2 | **Üçlü Küre** — Küre patlarken %50 güçte 3 küçük küreye ayrılır. `M mage_arcane_orb shape=split:3:.5` | **Dönen Küre** — Küre ilerlemek yerine etrafında döner. `M mage_arcane_orb shape=orbit:1` |
|  | T3 | **Ateş Küresi** — Küre ateş hasarına dönüşür ve düşmanları yakar. `M mage_arcane_orb cv=fire:1 st=burn:4:.4` | **Zaman Küresi** — Küre düşmanları %40 yavaşlatır; açılırken müttefiklere 4 sn hız verir. `M mage_arcane_orb st=slow:2:.4 ;; T cast:mage_arcane_orb => st(near(8),haste,4)` |

**Haydut**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Arbalet Atışı (`rogue_crossbow_shot`) | T1 | **Zehirli Ok** — Ok zehir hasarına dönüşür ve hedefi 6 sn zehirler. `M rogue_crossbow_shot cv=poison:1 st=poison:6:.2` | **Kanatan Ok** — Ok hedefi 5 sn kanatır. `M rogue_crossbow_shot st=bleed:5:.4` |
|  | T2 | **Geri Dönen Ok** — Ok hedefi deldikten sonra sana geri döner. `M rogue_crossbow_shot shape=return` | **Çift Ok** — Ok 0.25 sn sonra %70 güçle ikinci kez atılır. `M rogue_crossbow_shot shape=echo:.25:.7` |
|  | T3 | **Patlayıcı Ok** — Ok ateş hasarına dönüşür ve çarpınca %80 patlama yapar. `M rogue_crossbow_shot cv=fire:1 ;; T hit:rogue_crossbow_shot => exp(.8,3,fire)` | **Gölge Oku** — Ok gölge hasarına dönüşür; gizliyken hedefi 2 sn susturur. `M rogue_crossbow_shot cv=shadow:1 ;; T hit:rogue_crossbow_shot if=stealth => st(tgt,silence,2)` |
| Bıçak Yelpazesi (`rogue_fan_of_knives`) | T1 | **Zehirli Bıçaklar** — Bıçaklar hedefleri 6 sn zehirler. `M rogue_fan_of_knives st=poison:6:.25` | **Sakatlayıcı** — Bıçaklar hedefleri 3 sn yavaşlatır. `M rogue_fan_of_knives st=slow:3:.4` |
|  | T2 | **Dönen Bıçaklar** — Bıçaklar çevrende 6 sn döner ve yakın düşmanlara vurur. `M rogue_fan_of_knives shape=orbit:6` | **Geri Dönen Bıçaklar** — Bıçaklar menzil sonunda sana geri döner. `M rogue_fan_of_knives shape=return` |
|  | T3 | **Bıçak Fırtınası** — Bıçak Yelpazesi +1 şarj kazanır; şarjlar %50 daha yavaş dolar. `M rogue_fan_of_knives chg=+1 cdx=1.5` | **Gölge Yelpazesi** — Bıçaklar gölge hasarına dönüşür; atınca 1.5 sn gizlenirsin. `M rogue_fan_of_knives cv=shadow:1 ;; T cast:rogue_fan_of_knives => st(self,stealth,1.5)` |
| Gölge Adımı (`rogue_shadow_step`) | T1 | **Hızlı Kaçış** — Adım sonrası 2 sn hareket hızın +%25 olur. `T cast:rogue_shadow_step => buff(step_haste,2,{moveSpeedPct=.25})` | **Arkadan Vuruş** — Adım sonrası 3 sn kritik şansın +%25 olur. `T cast:rogue_shadow_step => buff(step_crit,3,{critChance=.25})` |
|  | T2 | **Çifte Adım** — Gölge Adımı +1 şarj kazanır; şarjlar %50 daha yavaş dolar. `M rogue_shadow_step chg=+1 cdx=1.5` | **Gölge Bırak** — Adımdan 1.5 sn sonra başlangıç noktana geri çekilirsin. `M rogue_shadow_step shape=echo:1.5:1` |
|  | T3 | **Gölge Takası** — Adım noktasındaki düşmanlar 1.5 sn korkar. `M rogue_shadow_step st=fear:1.5:1` | **Duman Perdesi** — Adım noktasında 5 m içindeki müttefikleri 2 sn gizler. `T cast:rogue_shadow_step => st(near(5),stealth,2)` |

**Keşiş**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Kaplan Avucu (`monk_tiger_palm`) | T1 | **Yankı Avuç** — Avuç 0.25 sn sonra yarım güçle tekrar vurur. `M monk_tiger_palm shape=echo:.25:.5` | **Çi Sızıntısı** — Avuç hedefi 3 sn Savunmasız yapar. `M monk_tiger_palm st=sunder:3:.08` |
|  | T2 | **Kaplan Pençesi** — Avuç hedefi 5 sn kanatır. `M monk_tiger_palm st=bleed:5:.4` | **Çekici Avuç** — Avuç düşmanı sana doğru çeker. `M monk_tiger_palm shape=pull:1.5` |
|  | T3 | **Ejder Avucu** — Avuç ateş hasarına dönüşür ve hedefi 4 sn yakar. `M monk_tiger_palm cv=fire:1 st=burn:4:.4` | **Bulut Avucu** — Avuç çevreye %80 hasarla şok dalgası yayar. `T hit:monk_tiger_palm => exp(.8,3,physical)` |
| Kara Tekme (`monk_blackout_kick`) | T1 | **Çifte Tekme** — Tekme 0.3 sn sonra %60 güçle tekrar vurur. `M monk_blackout_kick shape=echo:.3:.6` | **Kemik Kıran** — Tekme hedefi 4 sn Savunmasız yapar. `M monk_blackout_kick st=sunder:4:.1` |
|  | T2 | **Süpüren Tekme** — Tekme çevrendeki 360° alana vurur. `M monk_blackout_kick shape=orbit:1` | **Yere Seren** — Tekme hedefleri 1 sn yere devirir. `M monk_blackout_kick st=knockdown:1:1` |
|  | T3 | **Yıldırım Tekme** — Tekme şimşek hasarına dönüşür ve hedefi 3 sn çarpar. `M monk_blackout_kick cv=lightning:1 st=shock:3:.3` | **Gölge Tekme** — Tekme gölge hasarına dönüşür ve +1 Çi verir. `M monk_blackout_kick cv=shadow:1 ;; T hit:monk_blackout_kick => pip(chi,1)` |
| Çi Dalgası (`monk_chi_wave`) | T1 | **Hızlı Dalga** — Dalga 0.4 sn sonra yarım güçle tekrar atılır. `M monk_chi_wave shape=echo:.4:.5` | **Şifa Dalgası** — Dalga müttefiğe değerse %4 iyileştirir. `T hit:monk_chi_wave => healally(.04)` |
|  | T2 | **Çatallı Dalga** — Dalga %60 güçte 2 küçük dalgaya ayrılır. `M monk_chi_wave shape=split:2:.6` | **Dönen Dalga** — Dalgalar çevrende döner ve yakın düşmanlara vurur. `M monk_chi_wave shape=orbit:2` |
|  | T3 | **Ateş Dalgası** — Dalga ateş hasarına dönüşür ve düşmanları yakar. `M monk_chi_wave cv=fire:1 st=burn:4:.4` | **Zehir Dalgası** — Dalga zehir hasarına dönüşür ve düşmanları zehirler. `M monk_chi_wave cv=poison:1 st=poison:6:.3` |

**Okçu**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Nişanlı Atış (`archer_aimed_shot`) | T1 | **Zehirli Uç** — Ok hedefi 6 sn zehirler. `M archer_aimed_shot st=poison:6:.3` | **Kanatan Uç** — Ok hedefi 5 sn kanatır. `M archer_aimed_shot st=bleed:5:.5` |
|  | T2 | **Yankı Atış** — Ok 0.3 sn sonra yarım güçle tekrar atılır. `M archer_aimed_shot shape=echo:.3:.5` | **Geri Dönen Ok** — Ok menzil sonunda sana geri döner ve tekrar vurur. `M archer_aimed_shot shape=return` |
|  | T3 | **Yıldırım Oku** — Ok şimşek hasarına dönüşür ve hedefi 3 sn çarpar. `M archer_aimed_shot cv=lightning:1 st=shock:3:.3` | **Buzul Oku** — Ok buz hasarına dönüşür ve hedefi 2 yığın üşütür. `M archer_aimed_shot cv=frost:1 st=chill:4:2` |
| Çoklu Atış (`archer_multishot`) | T1 | **Zehirli Yağmur** — Oklar hedefleri 4 sn zehirler. `M archer_multishot st=poison:4:.2` | **Yavaşlatıcı Oklar** — Oklar hedefleri 2 sn yavaşlatır. `M archer_multishot st=slow:2:.3` |
|  | T2 | **Patlayan Oklar** — Oklar %20 şansla çarptığı yerde küçük patlama yapar. `T hit:archer_multishot ch=.2 => exp(.5,2.5,physical)` | **Dönen Oklar** — 5 ok çevrende döner ve yakın düşmanlara vurur. `M archer_multishot shape=orbit:5` |
|  | T3 | **Ateş Oku Seli** — Oklar ateş hasarına dönüşür ve düşmanları yakar. `M archer_multishot cv=fire:1 st=burn:3:.3` | **Gölge Sürüsü** — Oklar gölge hasarına dönüşür; atınca 1 sn gizlenirsin. `M archer_multishot cv=shadow:1 ;; T cast:archer_multishot => st(self,stealth,1)` |
| Patlayıcı Ok (`archer_explosive_arrow`) | T1 | **Yapışkan Patlama** — Ok hedefe yapışır ve 1.5 sn sonra bir kez daha patlar. `M archer_explosive_arrow shape=echo:1.5:1` | **Yanıcı Patlama** — Patlama hedefleri 5 sn güçlü yakar. `M archer_explosive_arrow st=burn:5:.6` |
|  | T2 | **Parçalayıcı Ok** — Ok patlarken %40 güçte 4 parçaya ayrılır. `M archer_explosive_arrow shape=split:4:.4` | **Mayın Oku** — Patlama hedefleri 1.5 sn köklendirir. `M archer_explosive_arrow st=root:1.5:1` |
|  | T3 | **Buz Bombası** — Patlama buz hasarına dönüşür ve hedefleri 1.5 sn dondurur. `M archer_explosive_arrow cv=frost:1 st=freeze:1.5:1` | **Zehir Bulutu** — Patlama zehir hasarına dönüşür ve çevreye %40 zehir bulutu bırakır. `M archer_explosive_arrow cv=poison:1 ;; T hit:archer_explosive_arrow => exp(.4,4,poison)` |

**Paladin**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Haçlı Darbesi (`paladin_crusader_strike`) | T1 | **Çifte Vuruş** — Darbe 0.3 sn sonra yarım güçle tekrar vurur. `M paladin_crusader_strike shape=echo:.3:.5` | **Işık İşareti** — Darbe hedefi 4 sn Yargılı yapar. `M paladin_crusader_strike st=judged:4:1` |
|  | T2 | **Dönen Kılıç** — Darbe çevrendeki 360° alana vurur. `M paladin_crusader_strike shape=orbit:1` | **Çekiç Dalgası** — Darbe çevreye %50 kutsal dalga yayar. `T hit:paladin_crusader_strike => exp(.5,3,holy)` |
|  | T3 | **Cezalandırıcı** — Darbe hedefi 1.2 sn sersemletir. `M paladin_crusader_strike st=stun:1.2:1` | **Işık Fırtınası** — Darbe %20 şansla +1 Kutsal Güç verir. `T hit:paladin_crusader_strike ch=.2 => pip(holypower,1)` |
| Yargı (`paladin_judgement`) | T1 | **Çifte Yargı** — Yargı 0.4 sn sonra yarım güçle tekrar vurur. `M paladin_judgement shape=echo:.4:.5` | **Zincir Yargı** — Yargılı hedef ölürse Yargı en yakın düşmana geçer. `T kill:paladin_judgement => st(tgt,judged,10)` |
|  | T2 | **Yıldırım Yargısı** — Yargı şimşek hasarına dönüşür ve hedefi 3 sn çarpar. `M paladin_judgement cv=lightning:1 st=shock:3:.3` | **Sarsıcı Yargı** — Yargı hedefi 3 sn yavaşlatır. `M paladin_judgement st=slow:3:.4` |
|  | T3 | **Işık Mızrağı** — Yargı hedefte %40 güçte 3 ışık mızrağına ayrılır. `M paladin_judgement shape=split:3:.4` | **Yargı Alanı** — Yargı çarpınca çevreye %80 kutsal patlama yapar. `T hit:paladin_judgement => exp(.8,4,holy)` |
| İntikamcı Kalkan (`paladin_avengers_shield`) | T1 | **Susturucu Kalkan** — Kalkan ilk hedefi 2 sn susturur. `M paladin_avengers_shield st=silence:2:1` | **Kışkırtıcı Kalkan** — Kalkan isabet ettiği her düşmanı 2 sn kışkırtır. `M paladin_avengers_shield st=taunt:2:1` |
|  | T2 | **Çifte Kalkan** — Kalkan 0.6 sn sonra %70 güçle ikinci kez fırlatılır. `M paladin_avengers_shield shape=echo:.6:.7` | **Dönen Kalkan** — Kalkan çevrende dönerek yakın düşmanlara vurur. `M paladin_avengers_shield shape=orbit:1` |
|  | T3 | **Şifalı Kalkan** — Kalkan müttefiğe değerse %4 iyileştirir. `T hit:paladin_avengers_shield => healally(.04)` | **Işık Kalkanı** — Kalkan geri döndüğünde %50 şansla 6 sn %12 hasar azaltma kazanırsın. `T hit:paladin_avengers_shield ch=.5 => buff(shield_return,6,{damageReductionPct=.12})` |

**Nekromant**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Kemik Mızrağı (`necro_bone_spear`) | T1 | **Çürüten Mızrak** — Mızrak hedefi 3 sn Çürüme lanetiyle işaretler. `M necro_bone_spear st=curse_decay:3:1` | **Kanatan Kemik** — Mızrak hedefi 5 sn kanatır. `M necro_bone_spear st=bleed:5:.4` |
|  | T2 | **Parçalanan Kemik** — Mızrak %40 güçte 3 kemik parçasına ayrılır. `M necro_bone_spear shape=split:3:.4` | **Geri Dönen Mızrak** — Mızrak menzil sonunda sana geri döner. `M necro_bone_spear shape=return` |
|  | T3 | **Ruh Mızrağı** — Mızrak gölge hasarına dönüşür; isabette %2 mana iade eder. `M necro_bone_spear cv=shadow:1 ;; T hit:necro_bone_spear => resp(.02)` | **Buzul Kemik** — Mızrak buz hasarına dönüşür ve hedefi 2 yığın üşütür. `M necro_bone_spear cv=frost:1 st=chill:4:2` |
| İskelet Çağır (`necro_raise_skeleton`) | T1 | **Zırhlı İskelet** — Çağırınca 10 m içindeki yoldaşlar 6 sn güçlendirilir. `T cast:necro_raise_skeleton => st(near(10),fortify,6)` | **Çevik İskelet** — Çağırınca 10 m içindeki yoldaşlar 6 sn hız kazanır. `T cast:necro_raise_skeleton => st(near(10),haste,6)` |
|  | T2 | **Çifte Çağrı** — Çağrı 0.8 sn sonra bir kez daha tekrar eder. `M necro_raise_skeleton shape=echo:.8:1` | **Kemik Dalgası** — Çağırma çevreye %100 kemik patlaması yapar. `T cast:necro_raise_skeleton => exp(1.0,4,physical)` |
|  | T3 | **Ateş İskeleti** — Çağrılan iskeletler ateş hasarı verir. `M necro_raise_skeleton cv=fire:1` | **Zehirli İskelet** — Çağrılan iskeletler zehir hasarı verir ve hedefleri zehirler. `M necro_raise_skeleton cv=poison:1 st=poison:5:.2` |
| Ceset Patlaması (`necro_corpse_explosion`) | T1 | **Kanlı Patlama** — Patlama hedefleri 5 sn kanatır. `M necro_corpse_explosion st=bleed:5:.5` | **Çürük Patlama** — Patlama hedefleri 4 sn Çürüme lanetiyle işaretler. `M necro_corpse_explosion st=curse_decay:4:1` |
|  | T2 | **Çift Patlama** — Patlama 0.5 sn sonra %60 güçle tekrar eder. `M necro_corpse_explosion shape=echo:.5:.6` | **Kemik Şarapneli** — Patlama %30 güçte 5 kemik parçası saçar. `M necro_corpse_explosion shape=split:5:.3` |
|  | T3 | **Zehir Bulutu** — Patlama zehir hasarına dönüşür ve hedefleri zehirler. `M necro_corpse_explosion cv=poison:1 st=poison:6:.3` | **Ruh Patlaması** — Patlama gölge hasarına dönüşür; isabette +8 Öz verir. `M necro_corpse_explosion cv=shadow:1 ;; T hit:necro_corpse_explosion => res(8)` |

**Warlock**

| Beceri | Kademe | Seçenek A | Seçenek B |
|---|:-:|---|---|
| Gölge Oku (`warlock_shadow_bolt`) | T1 | **Hızlı Ok** — Ok 0.3 sn sonra yarım güçle tekrar atılır. `M warlock_shadow_bolt shape=echo:.3:.5` | **Azap Oku** — Ok hedefe 1 Azap yığını ekler. `M warlock_shadow_bolt st=agony:12:1` |
|  | T2 | **Çatallı Ok** — Ok %40 güçte 3 küçük oka ayrılır. `M warlock_shadow_bolt shape=split:3:.4` | **Dönen Oklar** — 3 gölge oku çevrende döner ve yakın düşmanlara vurur. `M warlock_shadow_bolt shape=orbit:3` |
|  | T3 | **Ateş Oku** — Ok ateş hasarına dönüşür ve hedefi 4 sn yakar. `M warlock_shadow_bolt cv=fire:1 st=burn:4:.4` | **Buz Oku** — Ok buz hasarına dönüşür ve hedefi 2 yığın üşütür. `M warlock_shadow_bolt cv=frost:1 st=chill:4:2` |
| Yozlaşma (`warlock_corruption`) | T1 | **Bulaşıcı** — Yozlaşmalı hedef ölünce yozlaşma en yakın düşmana geçer. `T kill:warlock_corruption => st(tgt,corruption,14)` | **Çürüten Dokunuş** — Yozlaşma hedefi 3 sn yavaşlatır. `M warlock_corruption st=slow:3:.3` |
|  | T2 | **Çifte Yozlaşma** — Yozlaşma 0.8 sn sonra %70 güçle yeniden uygulanır. `M warlock_corruption shape=echo:.8:.7` | **Yayılan Çürüme** — Yozlaşma çarpınca çevreye %40 gölge patlaması yapar. `T hit:warlock_corruption => exp(.4,4,shadow)` |
|  | T3 | **Ateşten Yozlaşma** — Yozlaşma ateş hasarına dönüşür. `M warlock_corruption cv=fire:1` | **Zehirli Yozlaşma** — Yozlaşma zehir hasarına dönüşür ve 8 sn zehirler. `M warlock_corruption cv=poison:1 st=poison:8:.2` |
| Can Emme (`warlock_drain_life`) | T1 | **Çifte Emiş** — Can Emme ikinci bir hedefe de bağlanır (%50 güç). `M warlock_drain_life shape=split:2:.5` | **Mana Emişi** — Can Emme tikleri %30 şansla maks. mananın %2'sini geri verir. `T hit:warlock_drain_life ch=.3 => resp(.02)` |
|  | T2 | **Yankı Emiş** — Can Emme 0.6 sn sonra yarım güçle tekrar eder. `M warlock_drain_life shape=echo:.6:.5` | **Çekim Bağı** — Can Emme hedefi sana doğru çeker. `M warlock_drain_life shape=pull:2` |
|  | T3 | **Ateş Emişi** — Can Emme ateş hasarına dönüşür ve hedefi yakar. `M warlock_drain_life cv=fire:1 st=burn:3:.3` | **Ruh Emişi** — Canı %25 altındaki hedefte Can Emme %50 şansla +1 Ruh Parçası verir. `T hit:warlock_drain_life if=thp<.25 ch=.5 => pip(shard,1)` |


### 4.6 UI summary (details §5.4)

Third tab **Beceri Uzmanlıkları**: the 3 signature skills as large cards (icon, name, mastery bar `XP / next`, 3 tier rungs with a lock icon showing "Ustalık 600 / 1,000 veya Seviye 45"); picking an unlocked rung opens a two-card chooser (A | B) with the exact effect text and a small animated preview icon (the vfx id of the shape); the active picks also show on the skill tooltip and in the skill book (K) as chips ("Parçalanan Top · Buz Topu").


---

## 5. UI — the `N` window

Owner: **panels-game** (`src/ui/panels/game/talents.ts` becomes the shell; new files under `src/ui/panels/game/talents/`); hotkey, panel id (`talents`), `windowFrame`/`GamePanel` base and the dark-gold look are unchanged. `openPanel('talents', { tab?: 'tree' | 'web' | 'skills', focus?: string })`.

### 5.1 Window and tabs

Reference size 1180 × 720 (min 960 × 600; the layout stretches, the canvases refit, `ui.scale` applies). Title "Uzmanlık ve Yetenekler" (icon `ui-talent-tree.svg`). Header (all tabs): class icon + name + level, **spec chip** (role-coloured: "Ateş Büyücüsü · Hasarcı"), point badges. Footer (all tabs): the **staging bar**.

```
┌ Uzmanlık ve Yetenekler ───────────────────────────────────────────────────────────── [×] ┐
│ [Uzmanlık & Yetenekler]  [Pasif Ağaç]  [Beceri Uzmanlıkları]        ◈ Büyücü · Seviye 34 │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ Uzmanlık  ( ATEŞ )  ( BUZ )  ( GİZEM )        Yapı: [Aktif ▾] [Kaydet][Yükle][Önerilen]  │
│ ● Ateş Büyücüsü · Hasarcı                     [Sıfırla][Dışa Aktar][İçe Aktar]  [⌕ ara…] │
├────────────────────────────────────┬─────────────────────────────────────────────────────┤
│  SINIF AĞACI · Büyücü   Kalan 4/17 │  UZMANLIK AĞACI · Ateş Büyücüsü   Kalan 3/17        │
│        ◯──◇──◯                     │        ◯──◇──◯                                      │
│     ▢──□──◯──◯   (30 düğüm)        │     ▢──□──◯──◯   kapı çizgileri "5 puan"            │
│        …                           │        …                                            │
├────────────────────────────────────┴─────────────────────────────────────────────────────┤
│ Taslak: +3  −1   Bedel 480 altın   [Taslağı Göster]      [Geri Al]   [Değişiklikleri Uygula] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

| Tab | Content | Available |
|---|---|---|
| **1 · Uzmanlık & Yetenekler** | spec cards / spec bar, loadout bar, **class tree** (left) and **spec tree** (right), staging bar | from level 10 (both trees visible and greyed before; tab pulses "Seviye 10'da açılır") |
| **2 · Pasif Ağaç** | the 306-node web canvas, toolbar, side summary, minimap, legend | from level 2 (today's behaviour) |
| **3 · Beceri Uzmanlıkları** | three skill cards with mastery bars and tier choosers | visible from level 10; tiers unlock by Ustalık or level (§4.2) |

Below 1100 px width the two trees stack behind a **Sınıf | Uzmanlık** sub-toggle instead of sitting side by side.

### 5.2 Tab 1 — the WoW trees

* **Canvas per tree:** `TreeView` draws the 30 slots at the §2.2 positions, auto-fitted to its container (wheel zoom 0.6–1.6 and drag-pan are available but the default is "fit"). Links run from each node to its parents; **gate bars** are horizontal gold-inlaid lines between rows labelled with the gate ("5 puan") that turn from grey to gold when the tree's spent points reach the gate; the bar shows `spent / gate` on hover.
* **Node shapes:** `P` round iron ring with **rank pips** (0–2) · `C` diamond **split in two halves** (A left, B right; the taken half glows) · `M` hexagon · `A` rounded square with the skill icon and a small "Beceri" ribbon · `K` octagon with a gold crown (the `s30` capstone is larger and animates when taken). Icons: `P` = the tinted `stat-*.svg` of its stat; `M`/`C`/`K` = the `SkillDef.icon` of the skill they change (first skill in the `fx`), otherwise `ui-star.svg`; `A` = the granted skill's icon.
* **States:** *taken* (gold ring, filled), *available* (pale ring, pulsing outline), *gated* (grey with a lock and "Bu sıra için N puan harca (x/N)"), *blocked* (parent missing: dim, no pulse), *chosen / not-chosen half* for choices.
* **Mouse:** left-click = take (a choice node opens a small **A | B popover** under the node; clicking a half takes it); right-click = remove one point (refused with the §2.3 message when dependants exist); shift-click on a `P` node = take rank 2 in one go; **Ctrl-click** on a locked node = "yola git": takes the shortest legal chain of nodes that unlocks it if the free points allow (confirm in the staging bar). Double-click an `A` node = take it **and** put its skill on the bar when a slot is free.
* **Choice popover** shows both options in full with the effect text, the skill it touches, and a green "Önerilen" dot on option A.
* **Point badges:** "Kalan 4 / 17" per tree = free points / points available at the current level. A tree that has free points and an available node pulses its title.
* **Search** (`⌕`, shared with tab 2): matches node names, descriptions and stat names (diacritic-insensitive, e.g. "kritik", "ateş topu"); non-matching nodes dim, Enter / Shift+Enter cycle matches, Esc clears.

### 5.3 Tab 2 — the passive web (extended existing canvas)

The existing 1,110-line `TalentsPanel` canvas is **moved, not rewritten**, into `talents/WebView.ts` (zoom 0.28–3.4, pan, search with match cycling, hover path cost via BFS, grant/fail effects, side "Toplam Etkiler" list, legend). Additions:

* **Initial view:** centred on the character's **own start** at zoom fitting ±1000 (the new sectors are reached by panning; bounds ±1500); "Başlangıca git" and "Tümünü Göster" (fit ±1500) buttons.
* **New node visuals:** `mastery` = gold hexagon with an inner star, `socket` = open ring that shows the socketed jewel's icon tinted by rarity; clusters and sectors get a faint sector label ("Siper Kümesi", "Paladin Bölgesi") drawn at zoom < 0.5.
* **Mastery picker:** taking a mastery opens a 3-card popover (name, effect, priced hint); right-click re-opens it for a staged node. **Socket:** clicking an allocated socket opens the jewel list of the bag (compatible items only) with a compare tooltip.
* **Minimap** (bottom-left, 180 × 180): all 306 nodes as dots (allocated gold, own sector tinted), the viewport rectangle, click-to-jump.
* **Toolbar:** points badge **"KALAN PUAN 12 / 89"**, `Pişmanlık Küresi ×N` chip, **Plan** menu (Dışa Aktar `EFP1…` / İçe Aktar / Planı Temizle), search, Ortala, Tümünü Göster, Sıfırla (opens the trainer's full reset).
* **Hover tooltip:** kind badge (Küçük / Önemli / Kilit Taşı / Ustalık / Yuva / Başlangıç), name, effect lines (generated from `stats`, `desc`, `fx`), "Toplam bedel: N puan" from the shortest path (existing BFS), and for masteries the three effects; keystone drawbacks are red.
* **Allocation** is staged like tab 1 (draft set + `Pasif Puan` counter in the footer); the *"allocate immediately"* behaviour of today is replaced by Apply, except that **pure additions auto-apply after 1.5 s** when the setting `Ayarlar › Oyun › Pasif puanları anında uygula` (default **on**) is enabled — so existing players keep their muscle memory.

### 5.4 Tab 3 — Beceri Uzmanlıkları

Three skill cards in a row. Card: skill icon + name; mastery bar "Ustalık 640 / 1,000"; a vertical ladder of three rungs (T1 T2 T3): locked rung = padlock + "Ustalık 600 / 1,000 veya Seviye 45"; unlocked rung = two small option buttons (A | B) with names, the chosen one gold; hover = full effect text and the vfx shape icon (split ⑂, return ↺, orbit ◯, echo ⁝, pull ⟲, element swatch, charges ◔). Picks apply immediately (free, out of combat) and update the loadout `skl[]`; the staging bar is not used on this tab.

### 5.5 Staging, apply and cancel ("Değişiklikleri Uygula")

* The window edits a **draft** (`TalentSystem.draft`: arrays `cls[30] spc[30] skl[9]` + the web draft set); the committed build is untouched until **Apply**.
* **Staging bar:** `Taslak: +a −r` (added / removed points), the gold **bedel**, `[Taslağı Göster]` (opens a diff list: "+ Alev Dalgası'nı Aç", "− Işınlanma Ustası"), `[Geri Al]` (discard all), `[Değişiklikleri Uygula]` (primary button; disabled with a tooltip reason when: not in a rest zone and the draft has removals, not enough gold, draft invalid).
* **Apply** is atomic: validate gates/parents/pools → pay gold → write `save.tb` / `save.talents` / `passiveExtra` → `CharacterState.recomputeStats()` → emit `talents:committed` (+ `skillbar:changed` when grants change) → toast "Değişiklikler uygulandı." Failure shows an error toast and keeps the draft.
* **Closing** (X, Esc, N) with a non-empty draft opens "Kaydedilmemiş değişiklikler var." `[Uygula] [At] [Geri dön]` (Esc on that dialog = Geri dön). Level-ups while open refresh the free counters and keep the draft.
* **Undo stack:** 64 steps (`Ctrl+Z` / `Ctrl+Y`), per window session.

### 5.6 Respec flow

1. **Choose spec (L10):** tab 1 opens on the spec picker (2–3 large cards: role icon, name, tagline, key mechanic, signature skill icons, "Rol: Hasarcı"); **"Uzmanlığı Seç"** → confirm modal (§2.4). Level-up toast at 10: "Uzmanlık seçme zamanı! (N)"; the HUD talent badge pulses until chosen.
2. **Switch spec:** click another spec chip. In a rest zone: confirm modal "Ateş Büyücüsü → Buz Büyücüsü. Aktif yapın kaydedilir; bu uzmanlığın yapısı yüklenir (ücretsiz)." Outside: the chips are disabled with "Uzmanlığı değiştirmek için şehir veya köyde ol."
3. **Remove points:** allowed in the draft always; Apply is gated by the rest-zone rule and shows the cost line; the confirm modal states "3 puan geri alınacak · 1,440 altın".
4. **Sıfırla:** removes both trees' points of the active spec (draft) — same cost rule, with the first-free note ("İlk geri alma ücretsiz").
5. **Web refunds:** right-click an allocated node → context menu **"Pişmanlık Küresi kullan (3)"** (works out of combat anywhere, not in a started dungeon) / **"Altınla geri al (1,500)"** (rest zone only) / "İptal"; both staged like everything else and consumed on Apply.
6. **Banner:** outside a rest zone the staging bar shows "Şehir/köy dışında yalnızca puan eklenebilir." in muted text.

### 5.7 Visual language (PSX dark fantasy)

| Element | Rule |
|---|---|
| Frame | the existing `windowFrame` (Cinzel headings `var(--font-head)`, dark stone panel, gold hairline); no new fonts |
| Colours | tokens in `panels-talents-*.css`: gold `#e8c25a` (taken lines/rings), pale `#cdbd96` (available), iron `#3a3328` (locked), rune cyan `#5de0d0` (choice B half), tank `#5aa8ff`, healer `#6fdc8c`, DPS `#e0604e`, class accent = `CLASS_META[classId].color` |
| Lines | taken = solid gold 2 px with a slow travelling highlight (dithered, 8-frame loop); available = pale 1 px; locked = iron 1 px; **gate bars** 3 px gold-inlaid with rivets |
| Glow | nodes use the existing `glowSprite` radial; taken capstones add a rotating 8-ray sprite; everything quantised to the PSX dither look (nearest-neighbour sprites, `image-rendering: pixelated`) |
| Feedback | take = ring pulse + 6 sparks (existing `granted()` fx) + `talent_take`; untake = grey puff + `talent_untake`; capstone = gold flash + `talent_capstone`; Apply = seal-stamp animation on the staging bar + `talent_apply`; fail = red shake (existing `fail()`) |
| New sfx ids (aliases until audio builds them) | `talent_take` → `ui_click`, `talent_untake` → `ui_tab`, `talent_apply` → `ui_confirm`/`level_up` low volume, `talent_capstone` → `buff`, `spec_choose` → `ui_tab` + `buff` |

### 5.8 Keyboard

`N` toggle (existing) · `Esc` close (with the unsaved prompt) · `1 / 2 / 3` or `Tab / Shift+Tab` switch tabs · `[` `]` previous / next spec (rest zone) · `/` or `Ctrl+F` search · `Enter` Apply · `Ctrl+Z / Ctrl+Y` undo / redo · tab 1: **arrow keys move a focus ring between nodes** (nearest slot in that direction), `Space` / `Enter` take, `Backspace` remove, `A` / `B` pick a choice half · tab 2: arrow keys pan, `+ / −` zoom, `C` centre on start. (This also closes the INTEGRATION_TODO note "the talents tree has no keyboard navigation".)

### 5.9 HUD and other panels touched

* **HUD (hud module):** a small **"N"** talent badge next to the action bar shows the count of unspent points (`Sınıf + Uzmanlık + Pasif`) and pulses gold until the window is opened after each gain; the **player frame** shows the spec chip ("Koruyucu · Tank"); a level-up toast names the new points ("Seviye 14! +1 Sınıf Puanı (N)").
* **Skill book (K):** granted skills come from `grantedSkills()`; each skill with a specialisation shows its picks as chips; the K "Uzmanlık" tab becomes a read-only spec summary with **"N'de aç"**.
* **Trainer (`trainer`):** keeps the PoE full reset and the gold single refund, and adds a **"Uzmanlık Odası"** button that opens `N` (spec change is free there).
* **Party frames / inspect:** role icon from `SPECS[spec].role`; no talent data is networked beyond the spec id (V2 `spec` channel).

### 5.10 Files

| File | Owner | Content |
|---|---|---|
| `src/ui/panels/game/talents.ts` | panels-game | `TalentsPanel` shell: `windowFrame`, header, tab bar, staging bar, event wiring; delegates to the views |
| `src/ui/panels/game/talents/WebView.ts` | panels-game | the moved 1,000-line canvas + §5.3 additions |
| `src/ui/panels/game/talents/TreeView.ts` | panels-game | the 30-slot canvas (`TreeView(treeDef, draft, handlers)`) |
| `src/ui/panels/game/talents/SkillSpecView.ts` | panels-game | tab 3 |
| `src/ui/panels/game/talents/Dialogs.ts` | panels-game | spec picker, confirms, diff list, loadout menu, import/export dialogs |
| `src/ui/panels/game/talents/shared.ts` | panels-game | icon cache / tint helpers moved from the old file, node-shape drawing, tooltip HTML builders |
| `src/ui/styles/panels-talents-{shell,tree,web,skills,dialogs}.css` | panels-game | one stylesheet per file above (imported in `ui/panels/index.ts`) |


---

## 6. Balance rules

Everything is priced on the **Budget-Point (BP)** scale of GDD_LIFE §6.2 (1 BP = 1 % of one 100-BP affix roll; a level-60 character wears ≈ 4,800 BP of gear). The rules below are initial tuning; the *structure* (price table, caps, ledger, knobs, validators) is the deliverable.

### 6.1 Price list per node type (and the caps the data build enforces)

| Node | Budget (BP) | Hard cap checked by `tools/talents-check.mjs` |
|---|---|---|
| WoW `P` rank | 20 (≈ 40 per node) | value = `PALETTE_VALUE` table, exact |
| WoW `C` option | 60–80 | `S` part ≤ 80 BP · `dmgx` ≤ 1.20 · `cdx` ≥ 0.75 |
| WoW `M` | 40–70 | `S` part ≤ 70 BP · `dmgx` ≤ 1.25 · `cdx` ≥ 0.70 |
| WoW `K` (`s28`, `s29`) | 100–130 | `S` part ≤ 130 BP · `dmgx` ≤ 1.30 · `cdx` ≥ 0.65 |
| WoW `K` final (`s30` A / B) | 110–150 | `S` part ≤ 150 BP · `dmgx` ≤ 1.35 · `cdx` ≥ 0.60 |
| WoW `A` | one skill ≈ 60 | the skill row exists |
| Skill specialisation option | ≈ 25 per tier (≈ 75 per fully picked skill) | banned verbs (§4.3), ≥ 1 form verb |
| PoE small / notable / keystone | 25 / 100 / 100–150 net of drawback | existing sectors untouched; new rows measured: smalls 10–33, notables 50–123 (avg 102) |
| PoE mastery effect | ≤ 90 | `S` part ≤ 90 BP |
| Jewel affix | 50 | tier table × 0.5 |

`S` prices use the T1 100-BP values of GDD_LIFE §6.2 (`REF` table in `tools/talents-check.mjs`; new V2 stats use design references: `guardGauge` 30, `parryWindow` 0.10 s, `poiseDamagePct` 25.5 %, `finisherPct` 30.5 %, `flaskGainPct` 50 %, `flaskEffectPct` 30 %, `weakDamagePct` 30 %, `runeEffectPct` 30 %, `majorCdrPct` 9 %, `minionDamagePct` / `minionHpPct` / `trapDamagePct` 30.5 %, `healingPct` 14 %). **Procs, mods and grants are not priced mechanically** — they obey structural rules instead:

* every `T` entry has a hidden **internal cooldown ≥ 0.25 s**; `ch` is multiplied by the source skill's `params.proc` (default 1) for `hit`/`crit`/`kill` triggers (DoT ticks never trigger `hit`);
* `dmg()` / `exp()` coefficient ≤ 2.0 per proc (the authored maximum is 2.0, Ölüm Çemberi); `echo()` coefficient ≤ 0.7; a **proc chain depth ≤ 2** (a damage proc caused by a proc cannot trigger `T hit` / `T crit` again except once);
* `buff(…,max=N)` ≤ 5 stacks; a talent buff is a dynamic status `tb:<key>` (one instance per key; re-trigger refreshes duration and adds a stack);
* every `lethal` entry is one of the "Ölümcül darbe" capstones (`s28`) — ICD 90 s, never counted as an M+ death (V2 `protector_cheat` rule), at most one such effect can fire per 90 s whatever the sources.

### 6.2 The level-60 ledger

| Source | Points | Relevant BP | Share |
|---|---:|---:|---:|
| Gear (12 slots, ilvl 60 T1 rolls) | – | 4,800 | 46 % |
| Spec passive (V2 `trait_*`) | free | 400 | 4 % |
| Class tree | 25 | 900 | 9 % |
| Spec tree | 25 | 900 | 9 % |
| Skill specialisations (6 bar skills × 3 tiers) | – | 450 | 4 % |
| Passive web | 89 | 3,000 | 29 % |
| **Total** | | **10,450** | 100 % |

*Where the numbers come from.* The greedy best-25-point benchmark over the real data (`tools/talents-check.mjs --bench`; node value = priced stats + 45 per `M` + 50 per `T` + 60 per skill grant + 40 per `X`) gives **class trees 1,186–1,422 BP (mean 1,311)** and **spec trees 1,088–1,391 BP (mean 1,236)**: knight 1,252 · barbarian 1,404 · mage 1,231 · rogue 1,283 · monk 1,422 · archer 1,186 · paladin 1,343 · necromancer 1,309 · warlock 1,372 and, per spec, protector 1,391 · blademaster 1,088 · warlord 1,208 · butcher 1,361 · fire 1,302 · frost 1,189 · arcane 1,239 · assassin 1,359 · alchemist 1,173 · brewmaster 1,156 · windwalker 1,348 · mistweaver 1,244 · marksman 1,163 · beastmaster 1,141 · protection 1,199 · holy 1,243 · retribution 1,264 · summoner 1,223 · bone 1,292 · affliction 1,151 · destruction 1,216. A given build uses ≈ 70 % of that (resource / defence / off-role nodes) ⇒ ≈ 900 relevant per tree. The web's greedy value at 89 points (7,400–7,900 nominal, §3.9) includes penalties, defence and resource nodes a build ignores: ≈ 40 % relevant ⇒ ≈ 3,000. **Spread:** spec trees are within **−12 % / +13 %** of the mean (the lowest, `knight_blademaster`, was lifted from 959 to 1,088 by adding stat parts to six procs); the heuristic is a *fairness* check, not a DPS simulation — classbench (§6.5) has the last word.

### 6.3 How the layers stack with gear, `ilvl` and each other

* **All layers are flat.** Tree, web and specialisation numbers do not scale with `ilvl` (the `PALETTE_VALUE` is calibrated to the T1 band). Gear scales: T1 → T0 rolls (+28 % at ilvl ≥ 72), intra-tier scaling `+0.35 %` per ilvl up to +8 % (GDD_LIFE §6.2), plus +N upgrades, aspects, sets. So the tree share of *build power* **falls with gear**:

| Effective ilvl | 60 | 75 | 90 | 105 (M+15) | 120 |
|---|---:|---:|---:|---:|---:|
| Gear affix BP (T1-equivalent) | 4,800 | 6,000 | 6,310 | 6,410 | 6,410 |
| Tree layers (fixed, ledger) | 5,650 | 5,650 | 5,650 | 5,650 | 5,650 |
| **Tree share** | 54 % | 48 % | 47 % | 47 % | 47 % |

(+N upgrades, the Kadim Levha and aspects then dominate the late chase, which is the intended Metin2-style growth path; the trees never need re-tuning when new gear tiers ship.)
* **Layer interaction rules:** (1) `S` stats of all layers add into the *increased* bucket of the damage pipeline (GDD_SYSTEMS §1.5 step 3) — no layer has its own "more"; (2) skill-local `dmgx` is a separate multiplier **only for that skill** (and is capped per node); (3) global "more" exists only in keystones/specials (`moreDamage` convention) and the product of all of them is capped at ×1.6; (4) support runes multiply last (V2 §4.1) and may not exceed their own cap; (5) a **mutually exclusive** pair (A|B, mastery pick, spec options) never stacks with itself.
* **Soft caps** of GDD_LIFE §6.6 apply to the *sum* of all sources; the tree adds these **new aggregate caps** (applied in `StatCalc` after the sum):

| Stat | Cap | Reason |
|---|---|---|
| `threatPct` | +3.0 (×4 threat) | tanks sit at +1.5…+2.0 from their passive; palette/web may add up to +1.0 |
| `healingPct` | +1.00 | healer passive +0.30 + trees + web + gear |
| `minionDamagePct` / `minionHpPct` | +1.50 / +1.50 | summoner stack |
| `guardGauge` | +160 | base 60–100 ⇒ at most ≈ 3× |
| `parryWindow` | +0.20 s | base 0.20 s ⇒ 0.40 s maximum |
| `finisherPct` | +1.50 | `cl_kn_m3` gives +0.50 |
| `weakDamagePct` | +1.50 | `cl_rg_m3` gives +0.60 |
| `flaskGainPct` / `flaskEffectPct` | +2.00 / +1.00 | `cl_bb_m3` gives +1.00 |
| `majorCdrPct` | 0.35 | V2 §2.1 (unchanged) |
| talent `damageReductionPct` buffs | product ≥ 0.45 (max −55 %) | dynamic `tb:` buffs multiply; other DR sources keep their own rules |

### 6.4 Resource and respec economy

* WoW respec: `8 × level` per removed point, cap `250 × level`, first removal-Apply free (§2.8) — ≈ 10 minutes of L60 income for a full reset; PoE: Pişmanlık Küresi 5,000 gold at the vendor (max 3 / day), gold refund `25 × level`, Kadim Unutuş `1,000 × level` (first free). Gold is therefore a *mild* sink (V2's Kadim Levha and Efsun remain the big ones).
* Skill specialisation picks and loadout loads are free; only *experiments* (removals) cost.

### 6.5 Knobs and calibration order

1. **`PALETTE_VALUE`** (the 12 stat nodes of every tree) — global feel of "numbers go up".
2. **`TALENT_POWER`** (default 1.0, range 0.7–1.3): multiplies every numeric tree value at fold time — stats, and the deviation from 1 of `dmgx`/`cdx`/`radx`… (never procs' chances).
3. **`SPEC_SCALE[specId]`** (default 1.0): per-spec scalar if the benchmark leaves a spec outside ±8 %.
4. **`WEB_POWER`** (default 1.0): scalar for the web nodes defined here (clusters, masteries, jewels); the original 125 are not touched.
5. **`MASTERY_XP`** thresholds and the level catch-up (`[30, 45, 60]`).
6. Individual node numbers (data rows).

**Calibration:** extend `dev/combat-sim/classbench.mjs` (CLASSES_V2 §7.4) with `--talents`: it builds `autoBuild` for both trees (25 / 25), takes option **A** of the first signature skill's three tiers, and a 70-point web path from the shipped presets, then runs the V2 §11.1 targets: sustained DPS spec parity **±8 %**, burst specs may lead short fights by ≤ 15 %; for the mages: Ateş leads burst (+10 %), Buz leads AoE / control, Gizem leads long single-target. Tanks are checked for mitigation uptime (V2 §1.3), healers for HPS vs. mana (V2 §1.3.6).

### 6.6 What `tools/talents-check.mjs` verifies (headless, ≈ 1 s, Node ≥ 22.18 like `tools/content-check.mjs`)

1. **Trees:** 30 trees; each has 12 palette stats (all `StatId`), the required slot rows of §2.2 (C ×5 with A+B, K ×2 + `s30` A+B, class M ×9 + `s05` A+B, spec M ×7 and `s05/s12/s20` rows), unique names (warn), name ≤ 30 and description 8–170 chars; every fx parses; every skill id exists in `SKILLS` (or the registered V2/CLASSES_V2/this-doc ids), every stat in `STAT_IDS`, every status in `StatusId` / `STATUS_NEW`; the §6.1 caps.
2. **Skill specs:** 27 skills × 6 options, the banned-verb rule, `M` target = own skill, `T` filters = own skill.
3. **Web:** `validateWeb` of §3.3 and equality with `docs/GDD_TALENTS.web.json`.
4. **Strings:** `encode → decode` round trip and CRC rejection for all 21 specs with `autoBuild` loadouts.
5. **Bench:** the parity numbers of §3.9 / §6.2 within ±15 % (warning) / ±25 % (error).
6. **Cross-refs:** every `G` skill has a `SkillDef` row, every `SpecDef.treeSkills` slot is a `G` row of that spec's tree, every class tree `s05` offers two skills, and for 8 of the 9 classes exactly one of them is an interrupt (`behavior 'interrupt'`; the Şövalye's is `knight_shield_bash`).


---

## 7. IMPLEMENTATION PLAN (Haiku work packages)

Twenty-three packages, each sized for **one Haiku agent**, tagged with the **owning module(s)** of `ARCHITECTURE.md`, with the files they own, exact function names / data shapes / numbers, dependencies and an acceptance check. Rules (same as GDD_V2 §12): **no two packages of the same wave edit the same file**; later waves may edit files created earlier; every package ends with `npx tsc --noEmit` = 0 errors and a short report (what was built, public APIs added, known gaps). Node tools need Node ≥ 22.18 (native type stripping, the pattern of `tools/content-check.mjs`). **Prerequisites:** GDD_V2 WP1 (types), WP3 (`resolveSkill`, StatCalc special hooks) and WP5 (`data/specs.ts`, healing, majors); GDD_CLASSES_V2's class packages for the five new classes. If one of them has not merged when a package starts, implement against its stub signatures and report.

### 7.1 Wave schedule (≤ 3 agents in parallel)

| Wave | Packages | Why this grouping |
|---|---|---|
| W0 | **T0** contracts, stubs, ARCHITECTURE | everything imports its types and stubs |
| W1 | **T1** tree framework · **T1b** data generator · **T3** skill-mod engine | disjoint: `data/talentTrees/*` vs `tools/` + generated data vs `combat/skillMods.ts` |
| W2 | **T2** passive-web builder · **T4** proc engine · **T5** TalentSystem | disjoint: `data/passiveWeb.ts`+`talents.ts` vs `combat/Proc*.ts` vs `systems/Talents*.ts` |
| W3 | **T6** StatCalc / CharacterState / Progression · **T8** mage specs · **T9** class utilities | disjoint: `systems/*` vs mage data+hooks vs utility data+behaviours |
| W4 | **T7** combat integration · **T10** UI shell · **T18** headless check + dev page | T7 needs T3/T4/T6/T8/T9; T10 needs T5/T6; T18 needs T1b/T2/T5 |
| W5 | **T11** TreeView · **T12** WebView extension · **T13** SkillSpecView | disjoint files in `ui/panels/game/talents/` |
| W6 | **T14** dialogs · **T15** HUD · **T21** skill-book link | |
| W7 | **T16** tier sets · **T17** jewels (optional) · **T19** vfx / audio / icons | |
| W8 | **T20** migration tests + QA pass | needs everything |

Critical path: T0 → T1 → T5 → T6 → T7 → T10 → T11 → T14 → T20 (the system is playable headless after W4, visible after W5).

### 7.2 Packages

**T0 — Contracts, stubs, ARCHITECTURE** · owner: **core** · wave 0 · depends: V2 WP1 · size M
- **Files:** `src/types/talents.ts` (NEW, Appendix A verbatim), `src/types/stats.ts` (append `'skillMasteryPct'` + `STAT_INFO` `{ name: 'Ustalık Kazancı', pct: true }`; append any V2 stat ids still missing), `src/types/common.ts` (`PipId += 'arcane'`; `ClassId` + the five new ids if CLASSES_V2 WP1 has not), `src/types/skills.ts` (`StatusId +=` the 13 ids of §0.4), `src/types/character.ts` (`CharacterSave += spec?, tb?, skillMastery?, passiveExtra?`), `src/core/events.ts` (`'talents:committed': { kind: 'wow' | 'web' }`, `'loadout:changed': { specId: string }`, `'skillmastery:changed': { skillId: string; rank: number }`, `'passives:changed': Record<string, never>`), `src/core/Save.ts` (call `migrateTalents(save)` from the normalise path; **no** version bump of its own if V2 WP1 already bumped), `src/core/Settings.ts` (append `autoApplyPassives: boolean`, default `true`), `src/game/G.ts` + `src/game/Game.ts` (service fields `procs?: ProcEngine`, `talents?: TalentSystem`; `G.procs = new ProcEngine(); G.talents = new TalentSystem();` after `G.progression`), `ARCHITECTURE.md` (module table: panels-game owns `src/ui/panels/game/talents/*`, `src/ui/styles/panels-talents-*.css`; items owns `src/data/talentTrees/*`, `src/data/{passiveWeb,passiveExtra,skillSpecs,jewels}.ts`, `src/systems/{Talents,talentStrings,SkillMastery}.ts`; combat owns `src/combat/{skillMods,Procs,procActions,procConds}.ts`, `src/combat/specs/mage.ts`, `src/combat/skills/utilities.ts`; panel ids unchanged), **stubs** (empty exports so later packages can import in any order): `src/data/skills_mage_specs.ts` (`export const MAGE_SPEC_SKILLS: Record<string, SkillDef> = {}`), `src/data/skills_class_utils.ts` (`CLASS_UTIL_SKILLS`), `src/data/statuses_talents.ts` (`TALENT_STATUSES: Record<string, StatusDef>`), `src/data/specs_talents.ts` (`TALENT_SPECS`), `src/combat/specs/mage.ts`, `src/combat/skills/utilities.ts` (side-effect modules), **class stubs** `src/combat/Procs.ts` (`export class ProcEngine { setEntries(_e: unknown[]): void {} emit(_t: string, _c: unknown): void {} reset(): void {} update(_dt: number): void {} }`) and `src/systems/Talents.ts` (`export class TalentSystem {}`) that T4 / T5 replace, plus the merge lines `Object.assign(SKILLS, MAGE_SPEC_SKILLS, CLASS_UTIL_SKILLS)` at the end of `data/skills.ts`, `Object.assign(STATUSES, TALENT_STATUSES)` in `data/statuses.ts`, `Object.assign(SPECS, TALENT_SPECS)` in V2's `data/specs.ts`, `import './utilities'; import '../specs/mage';` at the end of `combat/skills/behaviors.ts`.
- **Tasks:** (1) all type appends (Appendix A) incl. `SpecDef.treeSkills?`, `SpecDef.fx?`, `PipDef` for `arcane` (`{ id:'arcane', name:'Gizem Yükü', max:4, color:'#b78cff', icon:'/assets/icons/skill-arcane-orb.svg', decay:{ after:8, every:5 } }`); (2) `migrateTalents(save)` per Appendix C (pure, no `G`); (3) the stub files and merge lines; (4) ARCHITECTURE.md edits.
- **Done when:** `tsc` clean, the game boots unchanged, an old save loads with `spec` undefined and `talents` intact.

**T1 — Tree framework** · owner: **items** · wave 1 · depends: T0 · size M
- **Files (own):** `src/data/talentTrees/{layout,palette,fx,build,index}.ts`.
- **`layout.ts`:** `export const GATES = [0,1,3,5,8,11,14,17,20,23]`; `export const SLOT_LAYOUT: Record<SlotId, { row: number; col: number; spec: NodeType; cls: NodeType }>` = the table of §2.2 (30 rows; `s05` spec `A` class `A`; `s12`/`s20` spec `A` class `M`); `export const PALETTE_SLOTS: SlotId[] = ['s01','s03','s06','s07','s08','s10','s14','s16','s19','s22','s23','s24']`; `export const parentsOf = (s: SlotId): SlotId[]` (nodes of the previous row with `|Δcol| ≤ 1`); `slotType(slot, kind)`.
- **`palette.ts`:** `export const PALETTE_VALUE: Partial<Record<StatId, number>>` — copy the table of §2.6 exactly (value per rank).
- **`fx.ts`:** `export type FxItem = {k:'S',stats:StatBlock} | {k:'M',target:string,ops:{op:string,mode?:'='|'+='|'*=',v:string|number}[]} | {k:'T',trig:string,filter?:string,conds:Cond[],ch:number,icd:number,actions:{a:string,args:string[]}[]} | {k:'G',skill:string} | {k:'X',id:string,params:Record<string,number>}`; `parseFx(fx: string): { items: FxItem[]; errors: string[] }` implementing the grammar of §2.5 / Appendix D **exactly** (items split on `" ;; "`, actions on `" ; "`, `if=` conditions split on `&`, `buff(key,dur,{a=1,b=2},max=3)` parsed with the braces), `validateFx(items, ctx)` (skill ids exist, stats are `StatId`, statuses exist). Pure functions, no `G`. **Reference implementation: Appendix G** (tested on all 972 fx strings) — port it, do not redesign it.
- **`build.ts`:** `buildTree(treeId: string, kind: TreeKind, classId: ClassId, specId: SpecId | undefined, name: string, raw: RawTree): TreeDef` — expands the palette into 12 `P` nodes (`stat`, `options:[{ name: statName(stat) + (n>1 ? ' ' + roman(n) : ''), desc: '+%6 Ateş Hasarı / rank', fx: 'S ' + stat + '=' + value }]`), turns `rows` into `options` per slot (`''` → 1 option, `'A'/'B'` → 2), fills `row/col/gate/parents/ranks`; throws on a missing required slot (§6.6 list).
- **`index.ts`:** `CLASS_ORDER`, `SPEC_ORDER` (§1.2), `TREES: Record<string, TreeDef>` built lazily from `./raw/<class>` (generated by T1b), `getTree(kind, id)`, `treeIdFor(kind, classId, specId)`, `specsOfClass(classId)`.
- **Done when:** a throw-away script parses all fx examples of Appendix D with 0 errors and rejects the negative examples; `buildTree` on a fixture yields 30 nodes with the §2.2 types.

**T1b — Data generator** · owner: **items** · wave 1 · depends: T0 · size S
- **Files (own):** `tools/gen-talent-data.mjs`; **generated** (header `// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit`): `src/data/talentTrees/raw/{knight,barbarian,mage,rogue,monk,archer,paladin,necromancer,warlock}.ts`, `src/data/skillSpecs.ts`, `src/data/passiveExtra.ts`.
- **Tasks:** read `docs/GDD_TALENTS.trees.json` (`trees["class:knight"]` / `trees["spec:mage_fire"]` → `{ palette, rows:[{slot,opt,name,desc,fx}] }`, `skillSpecs[]`, `paletteValue`) and `docs/GDD_TALENTS.web.json` (306 nodes); emit (a) each raw class file `export default { class: { palette, rows }, specs: { <specId>: { palette, rows } } }` with `Row = [slot, opt, name|null, desc|null, fx]`; (b) `src/data/skillSpecs.ts`: `export const SKILL_SPEC_ROWS: SkillSpecRow[]` (`{classId, skill, tier, opt, name, desc, fx}`) + `SIGNATURE_SKILLS: Record<ClassId, string[]>` (table order of §4.5) + `skillSpecsOf(skillId)`; (c) `src/data/passiveExtra.ts`: `SECTOR_ROWS` (the 122 sector nodes' id/kind/name/desc/stats/special), `CLUSTER_ROWS`, `MASTERY_ROWS` (`{id, parent, off, name, choices:[{name,desc,fx}]}`), `SOCKET_ROWS`, `NC_CONNECTORS`; all derived from the JSON (so T2 builds geometry procedurally but never types content). Idempotent, deterministic key order, 2-space indent.
- **Done when:** `tsc` clean; counts printed: trees 30 · rows 729 · skill spec rows 162 · mastery choices 42 · cluster nodes 36 · sectors 122.

**T3 — Skill-mod engine** · owner: **combat** · wave 1 · depends: T0 · size M
- **Files (own):** `src/combat/skillMods.ts`.
- **API:** `export interface ModEntry { target: string; op: string; mode?: '=' | '+=' | '*='; v: string | number; src: string }`; `applySkillMods(def: SkillDef, mods: ModEntry[]): SkillDef` (returns a **derived copy**, never mutates `SKILLS`), `modsFor(skillId: string, tags: string[], all: ModEntry[]): ModEntry[]` (target match: id, `a+b`, `@tag`, `*`), `collectMods(items: FxItem[], src: string): ModEntry[]`, `withShape(def, shape): ShapeSpec | null` (`{ kind:'split'|'return'|'orbit'|'echo'|'pull', n?, coef?, delay?, strength? }` for the behaviours), `selfTestSkillMods(): string[]`.
- **Op → field mapping** (Appendix D table): implement all 26 ops + `p.<key>` with the stated limits; floors `cooldown ≥ 0.5 × base`, `cdx` product ≥ 0.5, `chg ≤ +2`, `cnt ≤ +4`, `prc ≤ +4`, `radx` product ≤ 1.6; `cv` replaces `damage.type`, sets `params.element` (fire 1 / frost 2 / arcane 3 / others 0) and swaps `vfx.projectile/impact` by the convert table (`fire_projectile`/`fire_burst`, `frost_projectile`/`frost_burst`, `arcane_projectile`/`arcane_burst`, `shadow_projectile`/`shadow_burst`, `poison_projectile`/`poison_burst`, `holy_projectile`/`holy_burst`, lightning → `bolt_projectile`/`hit_spark`, physical → keep) and rewrites the type tag in `tags`.
- **Done when:** `selfTestSkillMods()` applies every example op of Appendix D to a fixture `SkillDef` (a real fireball clone) and checks the exact resulting fields; no mutation of the source def.

**T2 — Passive web builder** · owner: **items** · wave 2 · depends: T0, T1b (data), T1 (`parseFx`) · size M
- **Files (own):** `src/data/passiveWeb.ts`; **edits** `src/data/talents.ts` (interface additions of §3.2; rename the literal array to `RAW_BASE` (content untouched); replace the three exports at the bottom by `export const TALENT_LIST = buildPassiveWeb(RAW_BASE)`, `TALENT_NODES`, `CLASS_START_NODE` (9 entries), `TALENT_BOUNDS` ±1500).
- **Tasks:** implement `buildPassiveWeb(base: TalentNode[]): TalentNode[]` exactly as the recipe of §3.3 (sectors from `SECTOR_ROWS`, clusters from `CLUSTER_ROWS`, masteries from `MASTERY_ROWS`, sockets from `SOCKET_ROWS`; creation order = canonical `TALENT_LIST` order; `link(a,b)` bidirectional and idempotent); export `validateWeb(nodes): string[]` (the checks of §3.3); small nodes get `name = STAT_INFO name`, `desc` generated; start nodes `desc` "X için ücretsiz ve otomatik…"; no randomness.
- **Done when:** `validateWeb(TALENT_LIST)` = `[]`; a node script comparing with `docs/GDD_TALENTS.web.json` reports 0 id/position/link differences for 306 nodes; the 125 base nodes are deep-equal to before.

**T4 — Proc engine** · owner: **combat** · wave 2 · depends: T0, T1 (`FxItem`) · size M
- **Files (own):** `src/combat/Procs.ts`, `src/combat/procActions.ts`, `src/combat/procConds.ts`.
- **API:** `export class ProcEngine { setEntries(entries: ProcEntry[]): void; emit(trigger: string, ctx: ProcCtx): void; reset(): void; update(dt: number): void }` (`G.procs`, created by `Game.ts`'s owner in T7); `ProcEntry { id, on, filter?, conds, ch, icd, actions, src }` built by `collectProcs(items, src)`; `ProcCtx { player, skillId?, tags?, target?, ally?, crit?, amount?, pipId? }`. Triggers/conds/actions exactly as Appendix D: `hit crit kill cast dodge block parry hurt lethal heal pip spend status major still tick`; per-entry ICD map; global chain-depth guard (≤ 2); `tick:<s>` timers only in combat; `still:<s>` fires once per standing period; chance `ch × skill.params.proc` for `hit|crit|kill`.
- **Actions** call narrow interfaces so the package compiles before T7: `G.status?.applyDynamic(actor, def)`, `G.skills?.reduceCooldown(actor, skillId, sec)`, `G.skills?.resetCooldown`, `G.skills?.addPip(actor, id, n)`, `G.combat?.healPlayer`, `G.combat?.procDamage(player, target, coef, type, radius?)`, `G.skills?.castEcho(actor, skillId, coef, delay)`; unknown targets warn once and no-op (never throw from the frame loop).
- **Done when:** `selfTestProcs()` (exported) drives a fake world through 20 scripted events (crit → buff stack to max 5, lethal with ICD, `if=tst:burn`, chain depth) and asserts the outcomes.

**T5 — TalentSystem** · owner: **items** · wave 2 · depends: T0, T1 · size L
- **Files (own):** `src/systems/Talents.ts`, `src/systems/talentStrings.ts`.
- **`talentStrings.ts`:** `encodeBuild(specId, cls, spc, skl): string`, `decodeBuild(str): { ok: true; specId; cls; spc; skl } | { ok: false; error: 'format'|'crc'|'class' }`, `encodeWeb(classId, allocated: string[], picks: Record<string, number>): string`, `decodeWeb(str)`; bit widths per §2.7 (class tree 49 bits, spec 48, padded to 56; skill specs 18 → 24); CRC-8 poly `0x07`; base64url alphabet `A–Za–z0–9-_`. **Verified vector:** `autoBuild('class',25)` + `autoBuild('spec',25)` + `skl=[1,1,1,0,0,0,0,0,0]` for `mage_fire` ⇒ `EFT1-04-Vqq9VuhEgFdVeq3QiQA-VAAA-47`.
- **`Talents.ts`** (`G.talents`; created in `Game.ts` by T7's owner-note — T5 only exports the class): `class TalentSystem { get specId(): SpecId | null; setSpec(id): boolean; canEditHere(): { add: boolean; remove: boolean; reason?: string }; pointsTotal(kind: TreeKind): number; pointsSpent(kind): number; pointsFree(kind): number; tree(kind): TreeDef | null; beginDraft(): Draft; draft: Draft | null; canTake(kind, slot, opt?): { ok: boolean; reason?: string }; take(kind, slot, opt?): boolean; untake(kind, slot): boolean; diff(): { added: DraftChange[]; removed: DraftChange[]; cost: number }; commit(): { ok: boolean; error?: string }; cancel(): void; autoBuild(kind, points?): number[]; grantedSkills(): string[]; skillPick(skillId, tier): 0|1|2; setSkillPick(skillId, tier, pick): void; saveLoadout(name): TalentLoadout; loadLoadout(id): boolean; deleteLoadout(id): void; renameLoadout(id, name): void; exportBuild(): string; importBuild(str): { ok: boolean; error?: string }; wowRespecCost(removed: number): number; reset(): void }`. Reference code for the codec, `autoBuild` and `wowRespecCost`: **Appendix H**. Rules exactly §2.3 / §2.8: gates from `GATES`, parents from `parentsOf`, untake rule, `P` ranks, choice swap, removal accounting by net committed points, first removal-Apply free via `tb.removals`, cost cap `250 × level`; `canEditHere` = scene `town` or `G.world?.isSafeZone?.(player)`, and not in combat/dungeon; `commit` writes `save.tb.active[spec]`, bumps `tb.removals`, calls `G.character.recomputeStats()`, emits `talents:committed {kind:'wow'}` and `skillbar:changed` when grants changed; `setSpec` applies `defaultBar`/`specBars`, emits `spec:changed`, free in rest zones.
- **`autoBuild`:** the greedy of §2.7 (priority A → C(A) → K → M → P rank 1 → P rank 2, ties by slot number, re-evaluated per pick, gates and parents honoured).
- **Done when:** a dev script round-trips `encode/decode` for all 21 specs, runs `autoBuild` for both trees at 25 points (every result obeys gates/parents), `commit` cost table of §2.8 matches (`wowRespecCost` L60: 1 → 480, 25 → 12,000, cap 15,000), the verified vector above matches.

**T6 — StatCalc, CharacterState, Progression** · owner: **items** · wave 3 · depends: T1, T2, T5 · size L
- **Files (own):** `src/systems/{StatCalc,CharacterState,Progression}.ts`, new `src/systems/SkillMastery.ts`.
- **StatCalc:** `collectFx(save): ActiveFx` — for the active spec: every taken tree node (P: `stat × rank × PALETTE_VALUE`; others: the chosen option's fx via `parseFx` + `collectMods` / `collectProcs`), web nodes with `fx` (allocated), chosen mastery `choices[pick].fx`, socketed jewel stats, `SpecDef.fx`, skill-specialisation picks (mods only); returns `{ stats, mods, procs, grants, bespoke }` and `computeStats` folds `stats × TALENT_POWER` into `S` right after the passive-tree block and before elixirs; `bespoke` entries (`X trait_*{k=v}`) **add** to the params of the matching `specials` entry (`registerSpecial` merges instead of ignoring duplicates for talent `X`); apply the §6.3 aggregate caps after the sum; `StatCalcResult.fx` returned.
- **CharacterState:** fields `fx: ActiveFx`, getters `spec`, `activeLoadout`; `setSpec`, `recomputeStats()` also stores `fx`, calls `G.procs?.setEntries(fx.procs)` and `G.skills?.invalidateResolved()`; `create()` initialises `tb`; `normalize()` fills `skillMastery ??= {}`, `passiveExtra ??= { picks: {}, jewels: {} }` and runs `migrateTalents`; web API `pickMastery(nodeId, idx)`, `socketJewel(nodeId, item|null)`.
- **Progression:** `passivePointsTotal()` = existing `talentPointsAt` + count of flags `pp.*` (cap 89); `grantPassiveMilestone(flag)` (idempotent, toast "+1 pasif puan kazandın (N)."); subscriptions: `run:completed` (dungeon first clear → `pp.dun.<id>.<n|h>`; raid boss first kill → `pp.raid.<bossId>`), region completion event → `pp.reg.<id>`; `refundNodeOrb(nodeId)` (consumes `orb_regret`, same connectivity rule, works out of combat anywhere); keep `refundNode` (gold) and `refundAll`; `onLevelUp` toasts "+1 Sınıf Puanı / +1 Uzmanlık Puanı (N)" per §2.1 and "Uzmanlık seçme zamanı!" at 10; `unlockedSkills(classId, level)` merges `G.talents.grantedSkills()`; keep existing `talentPoints*` names for the web pool (compat with `trainer`).
- **SkillMastery:** `addSkillMastery(skillId, baseXp)`, `masteryXp(skillId)`, `masteryRank(skillId)` (0–3 from `MASTERY_XP=[200,1000,3000]` or level `[30,45,60]`), `xpFor(def)` = `min(20, 1 + floor(cooldown/2))`; emits `skillmastery:changed`.
- **Done when:** a headless script (T18) loads a fake `CharacterSave` with a spec, a taken tree and web nodes and gets the expected stats (`fireDamagePct` +…), a mastery pick folds its fx, 89-point cap holds, orb refund keeps connectivity.

**T8 — Mage specs and rows** · owner: **combat** · wave 3 · depends: T0, V2 WP5 · size M
- **Files (own):** `src/data/skills_mage_specs.ts` (fill `MAGE_SPEC_SKILLS`: the 8 rows of §1.3.3 as full `SkillDef`s; icons: `mage_phoenix_flames` `skill-fire-wave`, `mage_flurry` `skill-ice-bolt`, `mage_arcane_blast` `skill-arcane-missiles`, `mage_arcane_barrage` `skill-arcane-explosion`, `mage_blazing_barrier` `skill-firewall`, `mage_frozen_orb` `skill-frozen-orb`, `mage_touch_of_magi` `skill-curse`, `mage_arcane_surge` `skill-arcane-orb`), `src/data/statuses_talents.ts` (the 13 `StatusDef`s: names TR "Sıcak Seri", "Buz Parmağı", "Büyücü Dokunuşu", "Gizem Dalgalanması", "Alev Bariyeri", "Müdahale Siperi", "Muhafız Yemini", "Karma Siperi", "Ruh Yürüyüşü", "Ölü Taklidi", "Gölge Pelerini", "Dayanıklılık Sözleşmesi", "Buz Küresi"; kinds/durations of §1.3.3 / §1.4; `fingers_of_frost` `maxStacks 2`), `src/data/specs_talents.ts` (the 3 `SpecDef`s of §1.3.1), `src/combat/specs/mage.ts`.
- **Mechanics (`specs/mage.ts`, registered through the `SpecHooks` interface T7 exposes — until then export `mageHooks`):** **Sıcak Seri** — on a fire damage *hit* crit increment `streak`, a non-crit fire hit resets it, at `streakCrits` (2) apply status `hot_streak` (`streakDur` 8 s) and clear; while active `mage_meteor`, `mage_flame_wave`, `mage_phoenix_flames` cost 0, `castTime 0`, `critChance +0.25`, consumed on cast; DoT crits at `burnCrit × critChance`. **Buz Parmakları** — each frost hit `fofChance` (0.15; `mage_flurry` bolts 0.25; `mage_frozen_orb` pulses 0.25), max `fofMax` (2), `fofDur` 15 s; `mage_ice_lance` consumes one: treats target as Frozen (×3 + shatter) and `+fofCrit` crit chance; `mage_frost_nova` freezing a target grants one. **Gizem Yükü** — pip `arcane` (max `chargeMax` 4; decays −1 / 5 s after 8 s out of combat), `mage_arcane_blast` +1, `mage_arcane_barrage` consumes all (coef `1.8 + 0.9 × charges`, refund 2 mana per charge), each charge `+chargeDmg` 0.12 arcane damage and `+chargeCost` 0.25 mana cost on `@arcane` spells; mana bonus `manaSlope × (mana% − 40)` capped at 60 pp; `mage_touch_of_magi` stores 25 % of your damage on the target (cap `30 × W`) and bursts (r4, +2 charges); `mage_arcane_surge` +30 % arcane, regen ×3, Blast cost −50 %, +40 mana.
- **Done when:** the dev combat page (T18 hooks) plays each mechanic: two fire crits → `hot_streak` icon + free Meteor; frost hits grant Parmak and Ice Lance ×3; four Blasts + Barrage = 5.4 coef; all 8 skills cast without exceptions; `tsc` clean.

**T9 — Class utility skills** · owner: **combat** · wave 3 · depends: T0 · size M
- **Files (own):** `src/data/skills_class_utils.ts` (fill `CLASS_UTIL_SKILLS`: the 18 rows of §1.4 with the template; icons: `knight_intercept` `skill-charge`, `knight_guardian_vow` `skill-shield-wall`, `barbarian_pummel` `skill-double-strike`, `barbarian_intimidating_shout` `skill-battle-shout`, `mage_counterspell` `skill-arcane-missiles`, `mage_ice_block` `skill-ice-block`, `rogue_kick` `skill-quick-slash`, `rogue_cloak_of_shadows` `skill-smoke-bomb`, `monk_spear_hand` `skill-thrust`, `monk_touch_of_karma` `skill-iron-skin`, `archer_muzzle` `skill-piercing-shot`, `archer_feign_death` `skill-vanish`, `paladin_rebuke` `skill-smite`, `paladin_divine_shield` `skill-divine-shield`, `necro_soul_snap` `skill-curse`, `necro_spirit_walk` `skill-teleport`, `warlock_spell_lock` `skill-curse`, `warlock_unending_resolve` `skill-iron-skin`), `src/combat/skills/utilities.ts`.
- **Behaviours** (registered by import side effect in `BEHAVIORS`): `interrupt` (find the target — soft target else nearest interruptible enemy in range/arc; if `ability.interruptible` and casting: cancel the cast, lock that ability 4 s (V2 §8.4 kick lockout), `silence 3 s` on non-boss; emits `kick:request`), `intercept` (dash to the ally or 12 m forward via `actor.forcedMove`, apply `intercept_ward` to the ally), `guardian_vow` (ally status + damage redirect through `Combat.redirectDamage`, 30 %, cap 15 % max HP/s), `ice_block` (invulnerable 4 s, no actions, heal 20 % at end), `karma` (60 % of damage taken deferred into a 6 s DoT, min 1 HP), `feign` (zero threat via `threat:update`, stealth that survives damage 4 s), `spirit_walk` (+40 % move, ignore collisions with enemies, physical −30 %), `status_self` (apply the row's `selfStatuses`).
- **Done when:** each row casts in the dev combat page; interrupt stops a boss cast bar test and shows on the kick tracker; `tsc` clean.

**T7 — Combat integration** · owner: **combat** · wave 4 · depends: T3, T4, T6, T8, T9 · size L
- **Files (own):** edits to `src/combat/{SkillSystem,Combat,StatusEffects,specials}.ts`, `src/combat/skills/behaviors.ts` (registry only), (core wiring of `G.procs` / `G.talents` already done by T0).
- **Tasks:** (1) `SkillSystem.resolveSkill(def, player)` = V2 resolve + `applySkillMods(def, modsFor(...))`, cached by `skillId|spec|rev` (`invalidateResolved()`); every cast uses the resolved def (cost, cooldown, charges, targeting numbers); (2) **shapes**: after a hit, `withShape(def)` triggers `split` (n child projectiles/strikes, no re-split), `return` (returning projectile 0.7 coef), `orbit` (n orbiters 3 s, tick 0.5 s, coef 0.35; melee skills widen the arc to 360°), `echo` (replay the hit after the delay), `pull` (displace non-boss hits toward the impact centre); the `cast` net message gains `sf` (3 tiers × 2 bits); (3) **events to `G.procs.emit`**: `cast` at `pay()`, `hit`/`crit` per damaging instance (DoT ticks excluded), `kill` (also minion kills with filter `@minion`), `hurt`, `lethal` (before death: if a proc heals ≥ 1 HP or grants `invulnerable` the death is cancelled, ICD 90 s shared lock), `dodge`, `block`, `parry`, `heal`, `spend`/`pip`, `status`, `major`; (4) `StatusEffects.applyDynamic(actor, { id:'tb:'+key, name, icon, stats, duration, maxStacks })` (no `StatusDef`; stacks multiply stats; same key refreshes); (5) `SkillSystem.tryCastSlot` refuses skills not in `unlockedSkills`/`grantedSkills` ("Beceri kilitli"); (6) mastery XP: `afterHits()` → `G.progression.addSkillMastery`; (7) `SpecHooks` registry (`registerSpecHooks(traitId, hooks)`) used by T8; (8) `specials.ts`: merge `X` params (read through `sp(id)` unchanged).
- **Done when:** in the dev combat page a mage with a hand-made `fx` list shows: `M mage_fireball dmgx=1.1 cd=-1` changes the resolved def; `shape=split` spawns 3 children; `T crit => buff(...)` stacks 5; `T lethal` saves once per 90 s; `tsc` clean.

**T10 — UI shell** · owner: **panels-game** · wave 4 · depends: T5, T6 · size M
- **Files (own):** `src/ui/panels/game/bounty.ts` (TrainerPanel only: an **"Uzmanlık Odası"** button → `openPanel('talents')` and the `Pişmanlık Küresi` count line), `src/ui/panels/game/talents.ts` (rewritten shell), **moved** `src/ui/panels/game/talents/WebView.ts` (the old canvas code, behaviour unchanged), `src/ui/panels/game/talents/shared.ts` (icon cache, tint helpers, shape drawing stubs), five empty `src/ui/styles/panels-talents-*.css` + their imports in `ui/panels/index.ts`.
- **Tasks:** `TalentsPanel` with `windowFrame`, header (class icon, name, level, spec chip, point badges), 3-tab bar (`TalentTab { id; label; el; onShow(); onHide(); hasDraft(): boolean }`; tabs 1 and 3 are placeholders that show "Yakında" until T11/T13), the **staging bar** (diff counts, cost, buttons), event wiring (`talents:changed`, `talents:committed`, `spec:changed`, `player:levelup`, `player:stats`, `skillmastery:changed`), unsaved-changes prompt, `openPanel('talents', {tab, focus})`, the 15-second level-up pulse hook; the PoE tab must behave exactly like today (regression-free).
- **Done when:** `N` opens the shell, tab 2 works as before (allocate/refund/search/zoom), 306 nodes render (after T2), no console errors.

**T18 — Headless check and dev page** · owner: **items** (+ panels-game dev) · wave 4 · depends: T1b, T2, T5 · size M
- **Files (own):** `tools/talents-check.mjs`, `src/dev/talents.ts`, `dev/talents.html`.
- **`tools/talents-check.mjs`** (pattern of `tools/content-check.mjs`: register an extension-resolving loader, import the `.ts` data): stages **trees · skillspecs · web · strings · bench · crossrefs** exactly as §6.6; flags `--bench` (prints the §3.9 / §6.2 tables), `--v`; exit code ≠ 0 on any error; prints counts (`trees 30 rows 729`, `web 306`, `skillspecs 162`).
- **`dev/talents.html` + `src/dev/talents.ts`:** a fake character (class/level/spec selectors, gold slider), mounts `TalentsPanel`, buttons "autoBuild", "export/import round trip", "give 100k gold", "set rest zone on/off", "print fx" (dumps `collectFx`).
- **Done when:** `node tools/talents-check.mjs` exits 0 on the committed data.

**T11 — TreeView** · owner: **panels-game** · wave 5 · depends: T10, T5 · size L
- **Files (own):** `src/ui/panels/game/talents/TreeView.ts`, `src/ui/styles/panels-talents-tree.css`.
- **Tasks:** §5.2 in full: 30-slot canvas per tree with node shapes (P/C/M/A/K), rank pips, gate bars and counters, states, A|B popover, mouse (take / right-click untake / shift-click rank 2 / Ctrl-click path / double-click grant+bar), keyboard focus ring (arrows, Space/Enter, Backspace, A/B), tooltips (`talents/shared.ts` builders: title, type badge, "Rank 1/2", effect text, gate line "Bu sıra için N puan harca (x/N)", both options for choices, skill tooltip for `A`), search highlight, spec cards + spec picker hook, loadout bar (calls T14 dialogs through callbacks), responsive stacking below 1100 px, per-tree point badges.
- **Done when:** with `autoBuild` drafts both trees fill correctly, untake obeys §2.3, tooltips show correct gate text, choice A|B swap works in the draft.

**T12 — WebView extension** · owner: **panels-game** · wave 5 · depends: T10, T2, T6 · size M
- **Files (own):** `src/ui/panels/game/talents/WebView.ts` (edits), `src/ui/panels/game/settings.ts` (one toggle row "Pasif puanları anında uygula" bound to `Settings.autoApplyPassives`), `src/ui/styles/panels-talents-web.css`.
- **Tasks:** §5.3: initial view on the own start, `centerHome`, bounds ±1500, `mastery`/`socket` drawing and tooltips, **mastery picker popover**, **socket → jewel picker hook** (`onSocketClick(nodeId)` delegating to T17 when present), minimap, sector labels at zoom < 0.5, `Pişmanlık Küresi` chip and the **context menu** (orb / gold / cancel), draft-based allocation with the "pure additions auto-apply after 1.5 s" setting, `Plan` import/export (`EFP1`), the 9-start `CLASS_START_NODE` handling (own start free, foreign start +stat), keystone drawback colouring.
- **Done when:** all 14 masteries open a 3-choice picker, orb refund keeps connectivity, minimap jumps, a foreign start can be taken for 1 point.

**T13 — SkillSpecView** · owner: **panels-game** · wave 5 · depends: T10, T6 · size M
- **Files (own):** `src/ui/panels/game/talents/SkillSpecView.ts`, `src/ui/styles/panels-talents-skills.css`.
- **Tasks:** §5.4: 3 cards per class (`SIGNATURE_SKILLS[classId]`), mastery bar (`G.progression.masteryXp`), 3 rungs with lock text, A|B choosers with effect text and shape icons, immediate picks through `G.talents.setSkillPick`, chips in tooltips.
- **Done when:** unlocked tiers can be picked, locked tiers show the exact "Ustalık x / y veya Seviye z" text, picks persist in the loadout.

**T14 — Dialogs** · owner: **panels-game** · wave 6 · depends: T10, T5 · size M
- **Files (own):** `src/ui/panels/game/talents/Dialogs.ts`, `src/ui/styles/panels-talents-dialogs.css`.
- **Tasks:** spec picker modal + switch confirm (§2.4 / §5.6), apply confirm with cost line, diff list ("Taslağı Göster"), loadout menu (Kaydet / Yükle / Yeniden Adlandır / Sil / Çoğalt, max 8, names ≤ 24), export dialog (copy-to-clipboard of `EFT1…`), import dialog (paste, validate, "Geçersiz yapı dizesi"), "Önerilen" / "Sıfırla" confirms, unsaved-changes prompt, all strings Turkish as in §5.
- **Done when:** every flow of §5.6 is reachable and updates the draft/commit state correctly.

**T15 — HUD** · owner: **hud** · wave 6 · depends: T6 · size S
- **Files (own):** `src/ui/hud/{PlayerFrame,ActionBar,Extras}.ts` (edits) + `src/ui/styles/hud-extras.css` (append).
- **Tasks:** the "N" talent badge (count of unspent `Sınıf + Uzmanlık + Pasif`, gold pulse until the panel is opened after each gain, click opens `N`); the spec chip on the player frame; level-up toast lines (`Seviye 14! +1 Sınıf Puanı (N)`); listens to `talents:changed`, `player:levelup`, `spec:changed`.
- **Done when:** the badge appears at level 2 (web point), shows class/spec counts from level 11/12, disappears at 0.

**T21 — Skill-book link** · owner: **panels-items** · wave 6 · depends: T6 · size S
- **Files (own):** `src/ui/panels/items/SkillsPanel.ts`.
- **Tasks:** list `grantedSkills()` skills, show specialisation chips, convert the "Uzmanlık" tab into a read-only summary with an **"N'de aç"** button (`G.ui.openPanel('talents', { tab: 'tree' })`).
- **Done when:** granted tree skills appear in K and can be dragged to the bar.

**T16 — Tier sets** · owner: **items** (data) · wave 7 · depends: T8 · size S
- **Files (own):** `src/data/tierSets.ts` (edits): `tier_mage_fire / frost / arcane` and `tier_paladin_holy` per §1.6 (2p / 4p `special.id` `ts_<spec>_2|4`, effect text TR), removal of `tier_mage_elementalist` / `tier_mage_lightbringer`.

**T17 — Jewels (optional)** · owner: **items + panels-items** · wave 7 · depends: T12, T6 · size M
- **Files (own):** `src/data/jewels.ts` (3 bases, 18 affix defs per §3.7, tier scaling via `affixes.ts` helper × 0.5), `ItemGen.rollJewel(ilvl, rarity)`, `LootSystem` drops (M+ chest, Efsun Goblini, raid), vendor gamble slot "Mücevher", `ItemCategory 'jewel'` handling in inventory tooltips/icons (`item-gem-*.svg`), `CharacterState.socketJewel`.
- **Done when:** a jewel drops, socketing in an allocated socket changes stats, unsocketing returns it.

**T19 — vfx / audio / icons** · owner: **vfx-audio** · wave 7 · depends: T11 · size S
- **Files (own):** `src/vfx/presets_combat.ts` (+ `Fx.ts` aliases), `src/audio/*` (ids), `types/vfx.ts` / `types/audio.ts` appends by T0's rule: sfx `talent_take`, `talent_untake`, `talent_apply`, `talent_capstone`, `spec_choose` (aliases of §5.7); vfx `shape_split`, `shape_orbit`, `shape_return`, `shape_echo`, `shape_pull` (small trails/rings from existing sprites), `blazing_barrier`, `frost_projectile`, `frost_burst`, `arcane_projectile`, `arcane_burst` (aliases of the closest existing presets until real ones exist); `SPEC_ICON: Record<SpecId, string>` (role-tinted class icon fallback `CLASS_META[classId].icon`).

**T20 — Migration tests + QA** · owner: **core/items** + Haiku QA · wave 8 · depends: all · size M
- **Files (own):** `src/dev/migrate.ts` (fixtures: V2-era saves with `mage_elementalist`, `mage_lightbringer`, a 70-point web), extend `tools/talents-check.mjs` stage `migrate`.
- **Tasks:** run Appendix C migrations on the fixtures (spec mapping, bars, free respec flag, toasts); Haiku QA scenario script (open `N` at levels 2/10/20/60, spec switch in town, add/remove points, Apply with cost, import/export, mastery pick, web refund with orb, close with unsaved changes, 0 console errors) + the ROADMAP score loop entry.

### 7.3 File ownership matrix (conflict check)

| Path | W0 | W1 | W2 | W3 | W4 | W5 | W6 | W7 |
|---|---|---|---|---|---|---|---|---|
| `src/types/*`, `src/core/{events,Save,Settings}.ts`, `src/game/{G,Game}.ts`, stubs, `ARCHITECTURE.md` | **T0** | – | – | – | – | – | – | – |
| `src/data/talentTrees/{layout,palette,fx,build,index}.ts` | – | **T1** | – | – | – | – | – | – |
| `tools/gen-talent-data.mjs`, `src/data/talentTrees/raw/*`, `skillSpecs.ts`, `passiveExtra.ts` | – | **T1b** | – | – | – | – | – | – |
| `src/combat/skillMods.ts` | – | **T3** | – | – | – | – | – | – |
| `src/data/passiveWeb.ts`, `src/data/talents.ts` | – | – | **T2** | – | – | – | – | – |
| `src/combat/{Procs,procActions,procConds}.ts` | – | – | **T4** | – | – | – | – | – |
| `src/systems/{Talents,talentStrings}.ts` | – | – | **T5** | – | – | – | – | – |
| `src/systems/{StatCalc,CharacterState,Progression,SkillMastery}.ts` | – | – | – | **T6** | – | – | – | – |
| `src/data/{skills_mage_specs,statuses_talents,specs_talents}.ts`, `src/combat/specs/mage.ts` | stub | – | – | **T8** | – | – | – | – |
| `src/data/skills_class_utils.ts`, `src/combat/skills/utilities.ts` | stub | – | – | **T9** | – | – | – | – |
| `src/combat/{SkillSystem,Combat,StatusEffects,specials}.ts`, `behaviors.ts` | – | – | – | – | **T7** | – | – | – |
| `src/ui/panels/game/{talents,bounty}.ts`, `talents/{WebView,shared}.ts`, css files | – | – | – | – | **T10** | T12 (`WebView.ts`, `settings.ts`) | – | – |
| `tools/talents-check.mjs`, `src/dev/talents.ts`, `dev/talents.html` | – | – | – | – | **T18** | – | – | T20 |
| `talents/TreeView.ts`, `talents/SkillSpecView.ts`, their css | – | – | – | – | – | **T11**, **T13** | – | – |
| `talents/Dialogs.ts`, dialogs css | – | – | – | – | – | – | **T14** | – |
| `src/ui/hud/*` | – | – | – | – | – | – | **T15** | – |
| `src/ui/panels/items/SkillsPanel.ts` | – | – | – | – | – | – | **T21** | – |
| `src/data/{tierSets,jewels}.ts`, `ItemGen.ts`, `LootSystem.ts` | – | – | – | – | – | – | – | **T16**, **T17** |
| `src/vfx/*`, `src/audio/*` | – | – | – | – | – | – | – | **T19** |

Within a wave no path appears twice (T10 and T12 touch `WebView.ts` in different waves; T20 extends T18's tool after it is finished).

### 7.4 Dependencies in one line

`T0 → {T1, T1b, T3} → {T2 (T1b,T1), T4 (T1), T5 (T1)} → {T6 (T2,T5), T8, T9} → {T7 (T3,T4,T6,T8,T9), T10 (T5,T6), T18 (T1b,T2,T5)} → {T11, T12, T13} → {T14, T15, T21} → {T16, T17, T19} → T20`.


---

## Appendix A. Type / data sketches (copy-paste for T0)

```ts
// ---- types/talents.ts (NEW, core) -------------------------------------------------------------
export type TreeKind = 'class' | 'spec';
export type NodeType = 'P' | 'C' | 'M' | 'A' | 'K';
export type SlotId = 's01'|'s02'|'s03'|'s04'|'s05'|'s06'|'s07'|'s08'|'s09'|'s10'|'s11'|'s12'|'s13'|'s14'|'s15'|'s16'|'s17'|'s18'|'s19'|'s20'
                   | 's21'|'s22'|'s23'|'s24'|'s25'|'s26'|'s27'|'s28'|'s29'|'s30';
export interface FxText { name: string; desc: string; fx: string }
export interface TreeNodeDef {
  slot: SlotId; type: NodeType; row: number; col: number; gate: number; parents: SlotId[];
  ranks: 1 | 2; stat?: StatId; options: FxText[];
}
export interface TreeDef { id: string; kind: TreeKind; classId: ClassId; specId?: SpecId; name: string; nodes: TreeNodeDef[] }
export interface TalentLoadout { id: string; name: string; cls: number[]; spc: number[]; skl: number[]; at: number }
export interface TalentBuild { v: 1; active: Partial<Record<SpecId, TalentLoadout>>; saved: Partial<Record<SpecId, TalentLoadout[]>>; removals: number }
export interface SkillSpecRow { classId: ClassId; skill: string; tier: 1 | 2 | 3; opt: 'A' | 'B'; name: string; desc: string; fx: string }

// effect DSL (parsed form)
export type Cond = { c: 'hp<' | 'hp>' | 'res<' | 'res>' | 'thp<' | 'thp>'; v: number } | { c: 'pips>='; v: number; id: PipId }
                 | { c: 'tst' | 'sst'; status: string } | { c: 'still' | 'moving' | 'stealth' | 'elite' | 'boss' | 'shield' | 'inCombat' | 'solo' };
export type FxItem =
  | { k: 'S'; stats: StatBlock }
  | { k: 'M'; target: string; ops: { op: string; mode?: '=' | '+=' | '*='; v: string | number }[] }
  | { k: 'T'; trig: string; filter?: string; conds: Cond[]; ch: number; icd: number; actions: { a: string; args: string[] }[] }
  | { k: 'G'; skill: string }
  | { k: 'X'; id: string; params: Record<string, number> };
export interface ModEntry { target: string; op: string; mode?: '=' | '+=' | '*='; v: string | number; src: string }
export interface ProcEntry { id: string; on: string; filter?: string; conds: Cond[]; ch: number; icd: number; actions: { a: string; args: string[] }[]; src: string }
export interface ActiveFx { stats: StatBlock; mods: ModEntry[]; procs: ProcEntry[]; grants: string[]; bespoke: Record<string, Record<string, number>> }

// ---- types/v2.ts additions (SpecDef) ---------------------------------------------------------
interface SpecDef { /* …V2… */ treeSkills?: Record<string, SlotId>; fx?: string }
type SpecId = /* V2 + CLASSES_V2 */ | 'mage_fire' | 'mage_frost' | 'mage_arcane';        // 'mage_elementalist' | 'mage_lightbringer' removed from the union after migration ships
// ---- types/common.ts:  PipId += 'arcane'
// ---- types/stats.ts:   STAT_IDS += 'skillMasteryPct';  STAT_INFO.skillMasteryPct = { name: 'Ustalık Kazancı', pct: true }
// ---- types/skills.ts:  StatusId += 'hot_streak' | 'fingers_of_frost' | 'touch_of_magi' | 'arcane_surge' | 'blazing_barrier' | 'intercept_ward'
//                                 | 'guardian_vow' | 'karma_ward' | 'spirit_walk' | 'feign_death' | 'cloak_ward' | 'resolve_pact' | 'ice_block'
// ---- types/character.ts (CharacterSave, all optional, Save.normalize fills defaults)
spec?: SpecId; tb?: TalentBuild; skillMastery?: Record<string, number>;
passiveExtra?: { picks: Record<string, number>; jewels: Record<string, ItemInstance | null> };
// ---- data/talents.ts (TalentNode)
kind: 'start' | 'small' | 'notable' | 'keystone' | 'mastery' | 'socket'; fx?: string; choices?: { name: string; desc: string; fx: string }[];
// ---- core/Settings.ts:  autoApplyPassives: boolean (default true)
// ---- net: cast message  sf?: number   (3 tiers × 2 bits of skill-specialisation picks of the cast skill)
```

## Appendix B. Events and flags

| Name | Payload | Emitted by | Used by |
|---|---|---|---|
| `talents:changed` (existing) | `{}` | `CharacterState.recomputeStats` on any committed change | panels, HUD |
| `talents:committed` | `{ kind: 'wow' \| 'web' }` | `TalentSystem.commit`, `Progression` web apply | `TalentsPanel` (clear draft), HUD |
| `spec:changed` (V2) | `{ specId, prev }` | `TalentSystem.setSpec` | HUD, net (`spec` channel), `SkillSystem` (bars) |
| `loadout:changed` | `{ specId }` | `TalentSystem` loadout ops | `Dialogs` |
| `skillmastery:changed` | `{ skillId, rank }` | `SkillMastery` | `SkillSpecView`, toasts ("Ustalık: Ateş Topu — Kademe 2 açıldı!") |
| `passives:changed` | `{}` | masteries / jewels | `WebView` |
| `skillbar:changed` (existing) | `{}` | grants change | action bar |

Flags (`CharacterSave.flags`): `pp.dun.<dungeonId>.<n|h>`, `pp.reg.<regionId>`, `pp.raid.<bossId>` (passive milestones, value `1`); `tb.migrated`, `tb.freeWebReset` (migration); `tb.pulse` (HUD pulse until the window is opened).

## Appendix C. Save fields and migration

```json
{ "spec": "mage_fire",
  "tb": { "v": 1, "removals": 0,
    "active": { "mage_fire": { "id": "active", "name": "Aktif", "cls": [1,1,1, …30], "spc": [1,1,1, …30], "skl": [1,1,1,0,0,0,0,0,0], "at": 1760300000000 } },
    "saved":  { "mage_fire": [ { "id": "l1", "name": "Boss", "cls": […], "spc": […], "skl": […], "at": 1760300500000 } ] } },
  "skillMastery": { "mage_fireball": 640, "mage_frost_nova": 120 },
  "passiveExtra": { "picks": { "ms_fire": 1 }, "jewels": { "sk_mg": null } },
  "talents": ["mg_start", "mg_a1", …] }
```

`talents` (the web) keeps its shape and meaning; everything else is additive. Arrays are slot-indexed (`cls[i]` ↔ `s{i+1}`): `P` 0–2, `C` 0/1/2 (none/A/B), others 0/1; `skl[3 × skill + tier − 1]` 0/1/2.

```ts
export function migrateTalents(save: CharacterSave): void {           // pure; runs from Save.normalize
  if (save.flags['tb.migrated']) return;
  save.flags['tb.migrated'] = 1;
  save.tb ??= { v: 1, active: {}, saved: {}, removals: 0 };
  save.skillMastery ??= {};
  save.passiveExtra ??= { picks: {}, jewels: {} };
  const old = save.spec as string | undefined;
  if (old === 'mage_elementalist') {
    const has = (re: RegExp) => save.talents.filter((id) => re.test(id)).length;
    const fire = has(/^(n_pyromancer|mg_a\d|ks_glass_cannon)$/), frost = has(/^(n_cryomancer|mg_b\d|n_spell_echo)$/);
    save.spec = frost > fire ? 'mage_frost' : 'mage_fire';
    remapBars(save, old, save.spec, { m45: save.spec === 'mage_fire' ? 'mage_blazing_barrier' : 'mage_icy_veins',
                                     m90: save.spec === 'mage_fire' ? 'mage_combustion' : 'mage_frozen_orb' });
    save.flags['tb.freeWebReset'] = 1;
  } else if (old === 'mage_lightbringer') {
    save.spec = 'mage_arcane';
    remapBars(save, old, 'mage_arcane', { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge' });
    save.flags['tb.freeWebReset'] = 1;
  }
  // 5 new classes: CLASS_START_NODE[classId] is added to save.talents by normalize() as today
}
```

`remapBars` copies `specBars[old]` to `specBars[new]`, replaces `m45/m90` as given, drops slots whose skill no longer exists in the new spec's `defaultBar`/known list, and deletes `specBars[old]`.

## Appendix D. Effect-DSL reference

**Grammar.** `fx := item (" ;; " item)*`; `item := S pairs | M target ops | T trigger[:filter] [if=conds] [ch=p] [icd=s] " => " actions | G skillId | X id{k=v,…}`. Stat pairs `key=value` (no spaces, `.08` or `0.08`, negative `-.08`); mod `op=value` pairs separated by spaces; conds joined by `&`; actions separated by `" ; "`. **Reserved characters** inside names/descriptions are irrelevant (only `fx` is parsed). **Targets** (`M`): `skillId`, `skillId+skillId`, `@tag`, `*`. **Tags:** `basic melee spell projectile aoe dot kick finisher ultimate movement major buff defensive fire frost arcane holy shadow physical poison heal trap curse builder spender minion pet unarmed bone cc zone aura shout summon bleed channel combo shield taunt teleport stealth utility ranged` (derived by `SkillSystem` per V2 §4.1 plus the `tags` array of the def).

**Mod ops (26 + `p.<key>`)** — applied by `applySkillMods` to a derived copy:

| op | arg | field / effect | combine | limit |
|---|---|---|---|---|
| `dmgx` | ×n | `damage.coef` | multiply | node caps §6.1 |
| `cd` | ±s | `cooldown` | add | total ≥ −50 % of base |
| `cdx` | ×n | `cooldown` | multiply | product ≥ 0.5 |
| `cost` | ±n | resource `cost` | add | ≥ 0 |
| `costx` | ×n | resource `cost` | multiply | ≥ 0.4 |
| `dur` | ±s | skill `duration` / `channel` / zone / aura time | add | ≥ 0.5 |
| `rad` | ±m | `radius` and radius-like params (`explode`, `impactRadius`, `pulseRadius`, `strikeRadius`, `novaRadius`, `ringRadius`) | add | ≤ +4 |
| `radx` | ×n | same | multiply | product ≤ 1.6 |
| `rng` | ±m | `range` | add | ≤ +10 |
| `cast` | ±s | `castTime` | add | ≥ 0 |
| `castx` | ×n | `castTime`, `params.chargeMax` | multiply | ≥ 0.5 |
| `chg` | +n | `charges` | add | ≤ +2 total |
| `cnt` | +n | `count` (projectiles) / `params.maxTargets` / `params.balls` / `params.hammers` | add | ≤ +4 |
| `prc` | +n | `pierce` | add | ≤ +4 |
| `stgx` | ×n | `params.stagger`, `params.staggerPerCp` | multiply | ≤ 2.0 |
| `kbx` | ×n | `knockback`, `params.finalKnock` | multiply | ≤ 2.0 |
| `st` | `status:dur:mag[:ch],…` | append `StatusApply` to `statuses` | append | ≤ 2 per skill |
| `sdur` | `status:+s,…` | add seconds to the skill's own status of that id (`statuses` or `selfStatuses`) | add | ≤ +10 |
| `cv` | `type:frac` | `damage.type`, `params.element`, vfx swap, tag swap; `frac < 1` splits the coefficient between the original and the new type | replace | spec options: `frac = 1` only |
| `pip` | `id:n` | `pip.gain` | add | ≤ +2 |
| `pipc` | `id:n` | `pip.cost` | add | stays ≥ 1 if it was ≥ 1 |
| `crit` | +p | `params.critBonus` (skill-local crit chance) | add | ≤ +0.25 |
| `dotx` | ×n | magnitude of dot statuses the skill applies | multiply | ≤ 1.6 |
| `healx` | ×n | `heal.coef`, `params.heal`, `params.healPct` | multiply | ≤ 1.6 |
| `absx` | ×n | magnitude of absorb statuses, `params.absorbPct`, `params.hpPct` | multiply | ≤ 1.6 |
| `shape` | `split:n:coef` · `return` · `orbit:n` · `echo:delay:coef` · `pull:strength` | `params.shape` (+ args), executed by `withShape` | replace | one per skill |
| `p.<key>` | `=` / `+=` / `*=` | `params[key]` (key must already exist on the target's `params`; validator whitelist) | per mode | – |

**Shapes.** `split` — on the main hit spawn *n* children (projectiles in a fan / small radial blasts r 1.5 m around a melee target), each `coef × skill coef`, children never split; `return` — a returning projectile (`projMesh` of the skill, coef 0.7) after the hit or at max range; `orbit:n` — projectile/ground skills: *n* copies orbit the caster at 2.5 m for 3 s hitting enemies within 1.2 m every 0.5 s for coef 0.35 each; melee skills: the arc becomes 360°; `echo` — replay the hit at the same place after `delay` s; `pull` — displace non-boss hit targets `strength` m toward the impact centre (mass-scaled).

**Triggers (16):** `hit[:f]` a player skill damage instance on an enemy (never a DoT tick) · `crit[:f]` a crit hit · `kill[:f]` an enemy dies from you or your minion (`@minion` = minion kills only) · `cast:<skill\|@tag\|*>` when resources are paid · `dodge` you avoid an attack (roll i-frames or `dodgeChance`) · `block` · `parry` · `hurt` you took damage > 0 · `lethal` damage that would reduce HP ≤ 0 (runs before death; any action that heals ≥ 1 HP or grants `invulnerable` cancels the death; shared 90 s lock) · `heal[:f]` you healed ≥ 1 effective HP on an ally or yourself · `pip:<id>` a pip was gained · `spend:<id>` pips were spent · `status:<id>` you applied that status to an enemy · `major` a major was used · `still:<s>` you stood still *s* seconds (fires once per standing period) · `tick:<s>` every *s* seconds while in combat. Filters `f` = skill id, `@tag` or `*`. Chance `ch` (default 1) × `skill.params.proc` for `hit|crit|kill`; `icd` seconds per entry (default 0 → engine minimum 0.25 s).

**Actions (15):** `st(who,status,dur[,mag])` with `who` = `self` \| `tgt` (trigger target) \| `ally` (trigger's ally or the lowest-HP% ally) \| `party` \| `near(r)` (allies within r m, incl. self) · `buff(key,dur,{stat=v,…}[,max=n])` dynamic status `tb:<key>` · `cdr(skill\|@tag,sec)` · `rst(skill)` cooldown ready · `res(n)` resource ± n · `resp(f)` resource + f × max · `pip(id,n)` · `exp(coef,radius,type)` explosion at the target (owner's weapon damage × coef, no further procs) · `dmg(coef,type)` one extra hit on the target · `heal(f)` self f × max HP · `healally(f)` lowest-HP% ally (self if alone) f × its max HP · `abs(f,dur)` absorb f × max HP for `dur` · `echo(skill,coef,delay)` free repeat of a skill · `spawn(minion,n,life)` (reserved, unused in v1 data) · `purge(n)` remove n dispellable debuffs.

**Conditions (17), joined by `&`:** `hp<x` `hp>x` (self HP fraction) · `res<x` `res>x` (resource fraction) · `thp<x` `thp>x` (target HP fraction) · `tst:<status>` target has the status · `sst:<status>` self has it · `pips>=n:<id>` · `still` · `moving` · `stealth` · `elite` (target rank ≥ elite) · `boss` · `shield` (self has an absorb) · `inCombat` · `solo` (no ally within 40 m).

**`X` bespoke.** `X <specialId>{key=value,…}` **adds** each value to `params[key]` of the active special `specialId` (the spec's `trait_*`): used only for `trait_pyromancer{streakDur, streakCrits, streakIcd}`, `trait_cryomancer{fofChance, fofMax}`, `trait_arcanist{chargeMax, manaSlope}`, `trait_brewmaster{staggerAbsorb, parryPurge, poolDecay}`, `trait_summoner{skeletonCap, damageToMinions, skeletonRevive}` (12 rows in the whole dataset); their code reads `sp(id)` as usual.

**Positive examples (must parse):** `S moveSpeedPct=.08 ;; M knight_charge cd=-3` · `T cast:knight_charge => buff(charge_ward,2,{damageReductionPct=.3})` · `T hit:@basic ch=.1 => dmg(.8,physical)` · `T tick:4 if=pips>=1:adalet&inCombat => pip(adalet,1)` · `M barbarian_fissure+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25` · `M mage_fireball cv=frost:1 st=chill:4:2` · `T kill if=tst:burn => exp(.8,4,fire)` · `G knight_intercept` · `X trait_arcanist{chargeMax=1}`. **Negative examples (must fail):** unknown op `M knight_charge speedx=2` · bad trigger `T zzz => st(self,haste,2)` · unknown status `T hit => st(self,nonexistent,1)` · missing `=>` · `buff` without `{…}` · `S` with an unknown stat.

## Appendix E. Verification checklist (QA + automated)

1. `node tools/talents-check.mjs` exits 0: 30 trees, 729 rows, 162 spec options, web 306 / golden Δ0, strings round trip for 21 specs, bench within bounds, cross-refs.
2. `npx tsc --noEmit` clean; game boots; an old save (4 classes, 70 web points) loads unchanged; `N` opens the same web it always did.
3. Level 10: spec picker appears; choose; bars change; `m45` available; level 11: first Uzmanlık Puanı, level 12: first Sınıf Puanı; badge counts correct.
4. Take / untake obeys gates and parents (e.g. cannot untake `s09` while `s15` depends on it); choice swap in draft free, after Apply counts as a removal; capstone `s30` needs 23 points.
5. Outside a rest zone: additions apply, removals / spec switch / loadout load refused with the banner text; inside: costs match §2.8 (L60: 1 → 480 gold, cap 15,000).
6. Export → import round trip equals the active build; a corrupted CRC is rejected; a string from another class is rejected.
7. Each `G` node grants its skill (appears in K, fills the bar slot when empty); untaking removes it.
8. fx: one node per DSL form behaves in the dev combat page (mod, shape, proc, buff stack, lethal save once / 90 s).
9. Mage specs: Sıcak Seri, Buz Parmağı, Gizem Yükü, 8 new skills, `mage_time_warp` on all three.
10. Web: 306 nodes render ≥ 55 fps on a mid PC at every zoom; minimap; mastery picker; orb refund keeps connectivity; foreign start +10 stat; own start free.
11. Skill specialisation: tier unlock by XP and by level; picks persist; vfx shapes visible to a second peer (`sf`).
12. Hot-seat net test (LocalTransport): spec id visible on party frames; no talent data except `spec` is networked.
13. Migration fixtures: elementalist → fire/frost by web family, lightbringer → arcane, free web reset flag, toasts.
14. Balance: `node tools/talents-check.mjs --bench` prints the §3.9 / §6.2 tables; `classbench --talents` parity ±8 % (after T7).
15. Performance: `collectFx` < 2 ms, `resolveSkill` cache hit rate > 99 % in a 60 s fight (profile hook in the dev page).

## Appendix F. Assumptions and open questions

| # | Item | Assumption / how to resolve |
|---|---|---|
| F1 | A caster healer is missed | Return `Işık Çağıran` post-launch as a **hero path** (Dragonflight "hero talents": a third, later choice that adds a themed 10-node branch at level 60); the DSL and `treeSkills` already support it |
| F2 | More specs per class | `monk_mistweaver` is listed with a full tree; candidates for later data-only waves: `archer_survival`, `warlock_demonology`, `barbarian_berserker`, `knight_templar` — one raw data file each, no code |
| F3 | Spec skills at level 15 vs "first point at 11" | the A node needs 1 spent point (gate 1): earliest L13; healers' second/third skills later by design (§1.5); if playtests dislike it, lower the gate of `s12` to 3 and `s20` to 8 in `GATES`-independent per-slot overrides (`SLOT_LAYOUT` allows a `gate?` field) |
| F4 | `ailingDamagePct` | defined by GDD_SYSTEMS as bleeding/poisoned; nodes here use it only on bleed/poison builds — if burning should count, widen the definition in `Combat.rollOutgoing` (one line) |
| F5 | PvP | GDD_LIFE §7 PvP: trees and web apply fully; a PvP-specific `TALENT_POWER` scalar (e.g. 0.8) can be hung on `combat/pvp.ts` without touching data |
| F6 | `isSafeZone` | GDD_OPENWORLD's village safe-zone box API (`G.world.isSafeZone`) may not exist yet: `canEditHere` then treats only `TownScene` as a rest zone |
| F7 | Respec costs | the §2.8 numbers are a first guess (≈ 10 min of L60 income for a full reset) — tune after the first playtest; `wowRespecCost` is the only function to change |
| F8 | Spec-tier sets | 13 specs have no tier set yet (content pass); the spec-binding rule already handles it |
| F9 | Hero-effect pool | `m180` owners unchanged except the three mage specs sharing one; if a party of 5 wants more, V2's `sated` keeps it one per 150 s |


## Appendix G. Reference implementation — the effect-DSL parser (JavaScript, tested)

Standalone (no imports), tested against all 972 `fx` strings of this document (729 tree rows + 162 specialisation options + 78 web rows + 3 `SpecDef.fx`) with 0 errors, and against 6 negative examples (all rejected). **T1 ports it to `src/data/talentTrees/fx.ts`** (typed `FxItem` of Appendix A) and keeps its behaviour; pass the existence sets (`skills`, `stats`, `statuses`, `tags`) from `SKILLS`, `STAT_IDS`, `StatusId` + the 13 new ids, and the tag list of Appendix D.

```js
// Reference parser of the effect DSL (standalone, no imports). T1 ports this to src/data/talentTrees/fx.ts.
const TRIGGERS = new Set(['hit', 'crit', 'kill', 'cast', 'dodge', 'block', 'parry', 'hurt', 'lethal', 'heal', 'pip', 'spend', 'status', 'major', 'still', 'tick']);
const ACTIONS = new Set(['st', 'buff', 'cdr', 'rst', 'res', 'resp', 'pip', 'exp', 'dmg', 'heal', 'healally', 'abs', 'echo', 'spawn', 'purge']);
const MOD_OPS = new Set(['dmgx', 'cd', 'cdx', 'cost', 'costx', 'dur', 'rad', 'radx', 'rng', 'cast', 'castx', 'chg', 'cnt', 'prc', 'stgx', 'kbx', 'st', 'sdur', 'cv', 'pip', 'pipc', 'crit', 'dotx', 'healx', 'absx', 'shape']);
const TYPES = ['physical', 'fire', 'frost', 'lightning', 'shadow', 'poison', 'holy', 'arcane'];
const PIPS = ['combo', 'adalet', 'karisim', 'chi', 'holypower', 'shard', 'arcane'];
const num = (s) => Number(String(s).replace(/^\+/, ''));

/** @param ctx { skills:Set, stats:Set, statuses:Set, tags:Set } existence sets; pass null to skip existence checks */
export function parseFx(fx, ctx = null) {
  const errors = [], items = [];
  const has = (set, v, what) => { if (ctx && !ctx[set].has(v)) errors.push(`unknown ${what} ${v}`); };
  const filterOk = (t) => !t || t === '*' || (t.startsWith('@') ? !ctx || ctx.tags.has(t.slice(1)) : !ctx || ctx.skills.has(t));
  for (const raw of fx.split(' ;; ')) {
    const it = raw.trim(), kind = it[0], rest = it.slice(2).trim();
    if (it.length > 1 && it[1] !== ' ') { errors.push(`bad item start "${it.slice(0, 12)}"`); continue; }
    if (kind === 'S') {
      const stats = {};
      for (const kv of rest.split(/\s+/)) {
        const m = kv.match(/^([A-Za-z]+)=(-?[0-9.]+)$/);
        if (!m) { errors.push(`bad S pair "${kv}"`); continue; }
        has('stats', m[1], 'stat'); stats[m[1]] = num(m[2]);
      }
      items.push({ k: 'S', stats });
    } else if (kind === 'M') {
      const parts = rest.split(/\s+/), target = parts.shift(), ops = [];
      for (const t of target.split('+')) { if (t === '*') continue; if (t.startsWith('@')) { if (ctx && !ctx.tags.has(t.slice(1))) errors.push(`unknown tag ${t}`); } else has('skills', t, 'skill'); }
      for (const kv of parts) {
        const m = kv.match(/^([A-Za-z.]+)(\*=|\+=|=)(.+)$/);
        if (!m) { errors.push(`bad op "${kv}"`); continue; }
        const [, op, mode, v] = m;
        if (op.startsWith('p.')) { if (!Number.isFinite(num(v))) errors.push(`bad value ${kv}`); ops.push({ op, mode, v: num(v) }); continue; }
        if (!MOD_OPS.has(op)) { errors.push(`unknown mod op ${op}`); continue; }
        if (op === 'st' || op === 'sdur') for (const e of v.split(',')) { const [sid, a] = e.split(':'); has('statuses', sid, 'status'); if (op === 'st' && !Number.isFinite(num(a))) errors.push(`st needs a duration: ${e}`); }
        else if (op === 'cv') { const [ty, f] = v.split(':'); if (!TYPES.includes(ty) || !(num(f) > 0 && num(f) <= 1)) errors.push(`bad cv ${v}`); }
        else if (op === 'shape') { if (!['split', 'return', 'echo', 'orbit', 'pull'].includes(v.split(':')[0])) errors.push(`unknown shape ${v}`); }
        else if (op === 'pip' || op === 'pipc') { const [pid, n] = v.split(':'); if (!PIPS.includes(pid) || !Number.isFinite(num(n))) errors.push(`bad ${op} ${v}`); }
        else if (!Number.isFinite(num(v))) errors.push(`bad number ${kv}`);
        ops.push({ op, v });
      }
      items.push({ k: 'M', target, ops });
    } else if (kind === 'T') {
      const mm = rest.match(/^(\S+)((?:\s+(?:if|ch|icd)=\S+)*)\s*=>\s*(.+)$/);
      if (!mm) { errors.push(`bad T "${rest.slice(0, 30)}"`); continue; }
      const [trig, ...targ] = mm[1].split(':');
      if (!TRIGGERS.has(trig)) errors.push(`unknown trigger ${trig}`);
      if (['hit', 'crit', 'kill', 'cast'].includes(trig) && !filterOk(targ[0])) errors.push(`bad filter ${targ[0]}`);
      if (trig === 'cast' && !targ[0]) errors.push('cast needs a target');
      if (trig === 'status') has('statuses', targ[0], 'status');
      let ch = 1, icd = 0; const conds = [];
      for (const kv of mm[2].trim().split(/\s+/).filter(Boolean)) {
        const k = kv.slice(0, kv.indexOf('=')), v = kv.slice(kv.indexOf('=') + 1);
        if (k === 'ch') ch = num(v); else if (k === 'icd') icd = num(v);
        else for (const c of v.split('&')) {
          const a = c.match(/^(hp<|hp>|res<|res>|thp<|thp>)([0-9.]+)$/), b = c.match(/^pips>=([0-9.]+):([a-z]+)$/), d = c.match(/^(tst|sst):([a-z_0-9]+)$/), e = c.match(/^(still|moving|stealth|elite|boss|shield|inCombat|solo)$/);
          if (a) conds.push({ c: a[1], v: num(a[2]) }); else if (b) conds.push({ c: 'pips>=', v: num(b[1]), id: b[2] });
          else if (d) { has('statuses', d[2], 'status'); conds.push({ c: d[1], status: d[2] }); } else if (e) conds.push({ c: e[1] }); else errors.push(`bad condition ${c}`);
        }
      }
      const actions = [];
      for (const a of mm[3].split(' ; ')) {
        const am = a.trim().match(/^([a-z]+)\((.*)\)$/);
        if (!am || !ACTIONS.has(am[1])) { errors.push(`bad action "${a}"`); continue; }
        const args = am[2].replace(/\{[^}]*\}/, (s) => s.replace(/,/g, '\u0001')).split(',').map((s) => s.replace(/\u0001/g, ','));
        if (am[1] === 'st') { if (!['self', 'tgt', 'ally', 'party'].includes(args[0]) && !/^near\(\d+\)$/.test(args[0])) errors.push(`bad who ${args[0]}`); has('statuses', args[1], 'status'); }
        if (am[1] === 'buff') { const b = am[2].match(/\{([^}]*)\}/); if (!b) errors.push('buff needs {stats}'); else for (const kv of b[1].split(',')) has('stats', kv.split('=')[0].trim(), 'stat'); }
        actions.push({ a: am[1], args });
      }
      items.push({ k: 'T', trig, filter: targ[0], conds, ch, icd, actions });
    } else if (kind === 'G') { has('skills', rest, 'skill'); items.push({ k: 'G', skill: rest }); }
    else if (kind === 'X') { const m = rest.match(/^([a-z_0-9]+)\{(.*)\}$/); if (!m) errors.push(`bad X "${rest}"`); else { const params = {}; for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); params[k] = num(v); } items.push({ k: 'X', id: m[1], params }); } }
    else errors.push(`bad item kind "${it.slice(0, 12)}"`);
  }
  return { items, errors };
}

```

## Appendix H. Reference implementation — build strings, `autoBuild`, respec cost (JavaScript, tested)

`SLOTS` = `s01…s30`, `slot(s, kind).type` / `.row` and `parents(s)` are T1's `SLOT_LAYOUT` / `parentsOf` (§2.2), `GATES` as in §2.2, `SPEC_ORDER` is the table order of §1.2. The round trip `decode(encode(…))` and the CRC rejection were run for the vector of §2.7 (`EFT1-04-Vqq9VuhEgFdVeq3QiQA-VAAA-47`). **T5 ports it to `src/systems/talentStrings.ts` and `Talents.ts` (`autoBuild`, `wowRespecCost`).**

```js
function widths(kind) {
  return SLOTS.map((s) => {
    const t = slot(s, kind).type;
    if (s === 's30') return 2;
    if (t === 'P' || t === 'C') return 2;
    if (kind === 'class' && s === 's05') return 2;
    return 1;
  });
}
const totalBits = (k) => widths(k).reduce((a, b) => a + b, 0);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function pack(arr, kind) {
  const w = widths(kind); const bits = [];
  arr.forEach((v, i) => { for (let b = w[i] - 1; b >= 0; b--) bits.push((v >> b) & 1); });
  while (bits.length < 56) bits.push(0);
  const bytes = [];
  for (let i = 0; i < 56; i += 8) bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  return bytes;
}
function unpack(bytes, kind) {
  const bits = bytes.flatMap((b) => b.toString(2).padStart(8, '0').split('').map(Number));
  const w = widths(kind); const out = []; let p = 0;
  for (const x of w) { let v = 0; for (let b = 0; b < x; b++) v = (v << 1) | bits[p++]; out.push(v); }
  return out;
}
const b64 = (bytes) => { let bits = bytes.flatMap((b) => b.toString(2).padStart(8, '0').split('')); while (bits.length % 6) bits.push('0'); let s = ''; for (let i = 0; i < bits.length; i += 6) s += B64[parseInt(bits.slice(i, i + 6).join(''), 2)]; return s; };
const unb64 = (s, n) => { const bits = s.split('').flatMap((c) => B64.indexOf(c).toString(2).padStart(6, '0').split('')); const out = []; for (let i = 0; i < n * 8; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2)); return out; };
function crc8(bytes) { let c = 0; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff; } return c; }
function encode(specId, cls, spc, skl) {
  const si = SPEC_ORDER.indexOf(specId);
  const tb = [...pack(cls, 'class'), ...pack(spc, 'spec')];
  const sk = [];
  const bits = []; skl.forEach((v) => { bits.push((v >> 1) & 1, v & 1); }); while (bits.length < 24) bits.push(0);
  for (let i = 0; i < 24; i += 8) sk.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const crc = crc8([si, ...tb, ...sk]);
  return `EFT1-${String(si).padStart(2, '0')}-${b64(tb)}-${b64(sk).slice(0, 4)}-${crc.toString(16).padStart(2, '0').toUpperCase()}`;
}
function decode(str) {
  const m = str.match(/^EFT1-(\d\d)-([A-Za-z0-9_-]{19})-([A-Za-z0-9_-]{4})-([0-9A-F]{2})$/);
  if (!m) return { ok: false, error: 'format' };
  const si = Number(m[1]); const tb = unb64(m[2], 14); const sk = unb64(m[3], 3);
  if (crc8([si, ...tb, ...sk]) !== parseInt(m[4], 16)) return { ok: false, error: 'crc' };
  const bits = sk.flatMap((b) => b.toString(2).padStart(8, '0').split('').map(Number)); const skl = []; for (let i = 0; i < 9; i++) skl.push((bits[2 * i] << 1) | bits[2 * i + 1]);
  return { ok: true, specId: SPEC_ORDER[si], cls: unpack(tb.slice(0, 7), 'class'), spc: unpack(tb.slice(7), 'spec'), skl };
}
// ---- autoBuild: priority A, C(option A), K, M, P rank1, P rank2
const typeRank = (t, rank) => ({ A: 0, C: 1, K: 2, M: 3, P: rank === 0 ? 4 : 5 })[t];
function autoBuild(kind, points, treeId) {
  const taken = new Array(30).fill(0);
  let spent = 0;
  const maxRank = (s) => (slot(s, kind).type === 'P' ? 2 : 1);
  while (spent < points) {
    let best = null;
    SLOTS.forEach((s, i) => {
      if (taken[i] >= maxRank(s)) return;
      if (spent < GATES[slot(s, kind).row]) return;
      const ps = parents(s);
      if (ps.length && !ps.some((p) => taken[SLOTS.indexOf(p)] > 0)) return;
      const t = slot(s, kind).type; const k = [typeRank(t, taken[i]), i];
      if (!best || k[0] < best.k[0] || (k[0] === best.k[0] && k[1] < best.k[1])) best = { i, k };
    });
    if (!best) break;
    taken[best.i]++; spent++;
  }
  // choices: option A (1)
  return taken;
}


// §2.8
export const wowRespecCost = (level, removed, removalsSoFar) =>
  removed === 0 || removalsSoFar === 0 ? 0 : Math.min(removed * 8 * level, 250 * level);
```

`autoBuild` returns the rank array of one tree (`P` 0–2, others 0/1); option **A** of every `C` / `K s30` / class `s05` is the one stored (value 1). Example result for 25 points: `s01…s22` rank 1, `s25`, `s28`, `s30` — a broad, safe baseline; the player then edits.
