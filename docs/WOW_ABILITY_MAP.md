# EFSUN ONLINE — WoW Ability Map (Midnight reference)

Scope: map every class and spec in `src/data` to its WoW counterpart, with gaps, Turkish names and WoW-style keys. Research only: no code changed.

## 0. Method and limits (read first)

- **Our side:** read from `src/data` (skillsets, kits, `classes.ts`). Ids and fields verified.
- **WoW side:** partly verified. Most specs come from prior knowledge. Check each on Wowhead before building. Unlock levels (~) are indicative.
- **Status codes:** `MAP` exists and matches. `RENAME` exists, but the name is opaque (player-facing fix). `PARTIAL` exists, function differs. `MISSING` no row. `EXTRA` our skill has no WoW counterpart.
- **Key slots** come from `docs/CONTROLS_WOW.md` (§3, D3): `rmb`=1, `q`=2, `e`=3, `r`=4, `s1`=5, `s2`=Q, `s3`=E, `s4`=R, `m45`=X, `m90`=V, `m180`=T, `potionHp`=G, `potionMp`=H, flasks 6–0, `lmb`=auto-attack (Mouse0 reserved in WoW).
- **Naming format:** `Türkçe Ad (English)`, e.g. `Kesici Darbe (Pummel)`.
- **Bar capacity:** 8 skill slots plus 3 majors. Extra rows are marked `Shift+` (a second bar, not in code).

## 1. Global findings (apply to all classes)

| # | Finding | Evidence | Action |
|---|---|---|---|
| G1 | Names are literal translations; players do not recognise them | e.g. `demonhunter_blade_dance` "Bıçak Dansı" (WoW: Blade Dance) | Use `Türkçe Ad (English)` everywhere. |
| G2 | Duplicate ids with conflicting definitions | `rogue_*` (`rogue_shadow_step`, `rogue_backstab`, `rogue_kick`, `rogue_garrote`, `rogue_eviscerate`, …), `warlock_spell_lock`, `warlock_unending_resolve` defined in two files | Pick one source of truth. A later `add()` wins silently. |
| G3 | Broken name string | `druid_fury_of_elune` name renders as `Elune\` | Fix the escape. |
| G4 | Empty names | `knight_oath_aegis`, `shaman_enh_basic` | Add names. |

### 2.1 Arms (`knight_blademaster`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Mortal Strike | core spender | ~10 | `knight_mortal_strike` | MAP | Ölümcül Darbe (Mortal Strike) | q (2) |
| Overpower | core filler, charges | ~10 | `knight_overpower` | MAP | Üstün Vuruş (Overpower) | rmb (1) |
| Execute | execute spender | ~10 | `knight_execute` | MAP | Cellat Vuruşu (Execute) | e (3) |
| Slam | filler | ~ | — | MISSING | Vuruş Çarpması (Slam) | — |
| Colossus Smash | major (still Arms' key CD in Midnight) | ~10 | `knight_colossus_smash` | MAP | Dev Ezme (Colossus Smash) | X (m45) |
| Bladestorm | major channel | ~30 | `knight_bladestorm` | RENAME | Kılıç Fırtınası (Bladestorm) | T (m180) |
| Avatar | major | ~20 | `knight_avatar` | MAP | Savaş Avatarı (Avatar) | V (m90) |
| Whirlwind | AoE | ~6 | `knight_radiant_cleave` | RENAME | Çelik Girdap (Whirlwind) | s1 (5) |
| Sweeping Strikes | cleave buff | ~ | — | MISSING | Süpürücü Vuruşlar (Sweeping Strikes) | — |
| Rend | bleed | ~12 | `knight_rend` | RENAME | Yırtık Kesik (Rend) | Shift+ |
| Pummel | interrupt | ~10 | `knight_pummel` | RENAME | Kesici Darbe (Pummel) | R (s4) |
| Charge | gap closer | 3 | `knight_charge` | RENAME | Hücum (Charge) | Q (s2) |
| Die by the Sword | personal defensive | ~15 | `knight_die_by_sword` | RENAME | Kılıçla Ölüm (Die by the Sword) | E (s3) |
| Heroic Leap | mobility | ~ | — | MISSING | Kahraman Sıçraması (Heroic Leap) | — |

### 2.2 Protection (`knight_protector`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Shield Slam | core builder | ~10 | — | MISSING | Kalkan Vuruşu (Shield Slam) | q (2) |
| Thunder Clap | AoE (Midnight: primary AoE threat) | ~12 | `knight_thunder_clap` | RENAME | Gök Gürültüsü (Thunder Clap) | s1 (5) |
| Revenge | spender | ~12 | `knight_revenge` | RENAME | İntikam (Revenge) | e (3) |
| Ignore Pain | absorb | ~15 | `knight_ward_of_oath` | PARTIAL | Acı Yutma (Ignore Pain) | E (s3) |
| Shield Block | active mitigation | ~10 | `knight_shield_block` | RENAME | Kalkan Kaldırma (Shield Block) | Shift+ |
| Last Stand | major defensive | ~10 | `knight_unbroken_bastion` | PARTIAL | Son Direniş (Last Stand) | X (m45) |
| Shield Wall | personal defensive | ~15 | `knight_shield_wall` | RENAME | Kalkan Duvarı (Shield Wall) | Shift+ |
| Avatar | major (moved to Prot in Midnight) | ~20 | `knight_avatar` | MAP | Savaş Avatarı (Avatar) | V (m90) |
| Taunt | threat | ~ | `knight_provoke` | RENAME | Kışkırtma (Taunt) | Shift+ |
| Demoralizing Shout | debuff AoE | ~10 | `knight_challenge` | RENAME | Moral Bozucu Narası (Demoralizing Shout) | Shift+ |
| Spell Reflection | defensive | ~ | — | MISSING | Büyü Yansıtma (Spell Reflection) | — |
| Intervene | mobility | ~ | — | MISSING | Müdahale (Intervene) | — |
| Heroic Throw | ranged pull | ~ | — | MISSING | Kahraman Atışı (Heroic Throw) | — |
| Champion's Spear | reshaped in Midnight | ~ | — | MISSING | Şampiyon Mızrağı (Champion's Spear) | — |

### 3.1 Butcher (`barbarian_butcher`) = Fury

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Bloodthirst | core builder | ~10 | `barbarian_bloodthirst` | RENAME | Kan Susuzluğu (Bloodthirst) | rmb (1) |
| Rampage | spender | ~15 | `barbarian_rampage` | RENAME | Çılgın Hamle (Rampage) | q (2) |
| Raging Blow | builder, multi-hit | ~12 | `barbarian_raging_blow` | RENAME | Öfkeli Darbe (Raging Blow) | e (3) |
| Crushing Blow | builder | ~12 | `barbarian_crushing_blow` | RENAME | Kemik Ezici (Crushing Blow) | Shift+ |
| Bloodbath | DoT builder | ~10 | `barbarian_bloodbath` | RENAME | Kan Banyosu (Bloodbath) | Shift+ |
| Whirlwind | AoE (channel) | ~6 | `barbarian_whirlwind` | RENAME | Kasırga (Whirlwind) | s1 (5) |
| Enraged Regeneration | personal defensive | ~ | — | MISSING | Öfkeli Yenilenme (Enraged Regeneration) | E (s3) |
| Recklessness | major | ~20 | `barbarian_carnage` | RENAME | Pervasızlık (Recklessness) | V (m90) |
| Avatar | major | ~20 | `barbarian_avatar` | RENAME | Savaş Avatarı (Avatar) | X (m45) |
| Bloodlust/Heroic (Wolf howl) | hero | ~30 | `barbarian_wolf_howl` | RENAME | Kurt Narası (Hero talent, Midnight-specific) | T (m180) |
| Execute | finisher | ~15 | `barbarian_execute` | RENAME | İdam (Execute) | Shift+ |
| Rend | bleed | ~10 | `barbarian_rend` | RENAME | Parçala (Rend) | Shift+ |
| Charge | gap closer | 3 | `barbarian_leap` | PARTIAL | Hücum (Charge) | s2 (Q) |
| Intimidating Shout | CC | ~ | — | MISSING | Korkutucu Narası (Intimidating Shout) | — |
| Berserker Rage | utility | ~ | — | MISSING | Berserker Öfkesi (Berserker Rage) | — |

### 3.2 Warlord (`barbarian_warlord`) = Protection (tank)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Shield Slam | core builder | ~10 | — | MISSING | Kalkan Vuruşu (Shield Slam) | q (2) |
| Thunder Clap | AoE threat | ~12 | — | MISSING | Gök Gürültüsü (Thunder Clap) | s1 (5) |
| Revenge | spender | ~12 | — | MISSING | İntikam (Revenge) | e (3) |
| Ignore Pain | absorb | ~15 | `barbarian_blood_shield` | PARTIAL | Acı Yutma (Ignore Pain) | E (s3) |
| Shield Block | active mitigation | ~10 | `barbarian_iron_stance` | PARTIAL | Kalkan Kaldırma (Shield Block) | Shift+ |
| Last Stand | major defensive | ~10 | `barbarian_last_stand` | RENAME | Son Direniş (Last Stand) | X (m45) |
| Shield Wall | personal defensive | ~15 | — | MISSING | Kalkan Duvarı (Shield Wall) | Shift+ |
| Thrash | builder AoE | ~12 | `barbarian_thrash` | RENAME | Paralama (Thrash) | Shift+ |
| Maul | spender | ~15 | `barbarian_maul` | RENAME | Ezici Balta (Maul) | Shift+ |
| Provoke | taunt | ~10 | `barbarian_provoke` | RENAME | Kükreyen Kışkırtma (Taunt) | Shift+ |
| Rallying Cry | group heal + defensive | ~20 | `barbarian_rallying_roar` | RENAME | Toplayıcı Kükreme (Rallying Cry) | V (m90) |
| Avatar | major | ~20 | `barbarian_incarnation` | PARTIAL | Ata Kılığı (Avatar, Midnight Prot) | T (m180) |

### 4.1 Brewmaster (`monk_brewmaster`) = tank

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Keg Smash | core builder | ~10 | `monk_keg_smash` | RENAME | Fıçı Darbesi (Keg Smash) | e (3) |
| Breath of Fire | AoE debuff | ~ | — | MISSING | Ateş Nefesi (Breath of Fire) | — |
| Blackout Kick | spender | ~ | `monk_blackout_kick` | RENAME | Kara Tekme (Blackout Kick) | s1 (5) |
| Tiger Palm | builder | 1 | `monk_tiger_palm` | RENAME | Kaplan Avucu (Tiger Palm) | rmb (1) |
| Purifying Brew | stagger purge | ~15 | `monk_purifying_brew` | RENAME | Arındırıcı İksir (Purifying Brew) | E (s3) |
| Celestial Brew | absorb | ~ | — | MISSING | Göksel Karışım (Celestial Brew) | — |
| Fortifying Brew | major defensive | ~ | `monk_bm_fortifying_brew` | RENAME | Güçlendirici İksir (Fortifying Brew) | X (m45) |
| Invoke Niuzao | major summon | ~20 | `monk_bm_black_ox` | RENAME | Niuzao'yu Çağır (Invoke Niuzao) | V (m90) |
| Provoke | taunt | 10 | `monk_provoke` | RENAME | Alay Et (Provoke) | Shift+ |
| Spinning Crane Kick | AoE channel | ~ | `monk_spinning_crane` | RENAME | Dönen Turna Tekmesi (Spinning Crane Kick) | Q (s2) |
| Expel Harm | filler, heal | ~ | — | MISSING | Zorla Savuşturma (Expel Harm) | — |
| Exploding Keg | AoE | ~ | — | MISSING | Patlayan Fıçı (Exploding Keg) | — |

### 4.2 Windwalker (`monk_windwalker`) = DPS melee

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Rising Sun Kick | core spender | ~10 | `monk_rising_sun_kick` | RENAME | Doğan Güneş Tekmesi (Rising Sun Kick) | q (2) |
| Tiger Palm | builder | 1 | `monk_tiger_palm` | RENAME | Kaplan Avucu (Tiger Palm) | rmb (1) |
| Blackout Kick | spender | ~ | `monk_blackout_kick` | RENAME | Kara Tekme (Blackout Kick) | s1 (5) |
| Spinning Crane Kick | AoE | ~ | `monk_spinning_crane` | RENAME | Dönen Turna Tekmesi (Spinning Crane Kick) | e (3) |
| Whirling Dragon Punch | AoE cd | ~ | `monk_whirling_dragon` | RENAME | Dönen Ejder Yumruğu (Whirling Dragon Punch) | Shift+ |
| Fists of Fury | channel ultimate | ~ | `monk_fists_of_fury` | RENAME | Cennet Yumrukları (Fists of Fury) | r (4) |
| Invoke Xuen | major | ~ | `monk_ww_tigers_fury` | RENAME | Xuen'i Çağır (Invoke Xuen) | X (m45) |
| Storm, Earth and Fire | major | ~ | `monk_ww_storm_earth_fire` | RENAME | Fırtına, Toprak ve Ateş (Storm, Earth, and Fire) | V (m90) |
| Flying Serpent Kick | mobility | ~ | `monk_flying_serpent` | RENAME | Uçan Yılan Tekmesi (Flying Serpent Kick) | Q (s2) |
| Chi Wave | ranged | ~ | `monk_chi_wave` | RENAME | Çi Dalgası (Chi Wave) | E (s3) |
| Touch of Death | execute | ~ | — | MISSING | Ölüm Dokunuşu (Touch of Death) | — |
| Touch of Karma | defensive | ~ | — | MISSING | Karma Dokunuşu (Touch of Karma) | — |
| Roll / Chi Torpedo | mobility | 1 | `monk_chi_torpedo` | RENAME | Çi Torpidosu (Roll) | Shift+ |

### 4.3 Mistweaver (`monk_mistweaver`) = healer

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Vivify | core heal | ~ | `monk_mw_vivify` | RENAME | Canlandırma (Vivify) | rmb (1) |
| Enveloping Mist | heal over time | ~ | `monk_mw_enveloping_mist` | RENAME | Sarmalayan Sis (Enveloping Mist) | q (2) |
| Renewing Mist | HoT | ~ | `monk_mw_renewing_mist` | RENAME | Yenileyen Sis (Renewing Mist) | e (3) |
| Soothing Mist | channel | ~ | `monk_mw_soothing_mist` | RENAME | Dinginlik Sisi (Soothing Mist) | r (4) |
| Essence Font | AoE heal | ~ | — | MISSING | Öz Çeşmesi (Essence Font) | — |
| Thunder Focus Tea | major | ~ | `monk_mw_thunder_tea` | RENAME | Yıldırım Odağı Çayı (Thunder Focus Tea) | X (m45) |
| Revival | major AoE heal | ~ | `monk_mw_revival` | RENAME | Diriliş (Revival) | V (m90) |
| Detox | dispel | ~ | `monk_mw_detox` | RENAME | Sis Arındırma (Detox) | s3 (E) |
| Life Cocoon | external defensive | ~ | — | MISSING | Yaşam Kozası (Life Cocoon) | — |
| Sheilun's Gift | heal | ~ | — | MISSING | Sheilun'un Armağanı (Sheilun's Gift) | — |

### 5.1 Marksman (`archer_marksman`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Aimed Shot | core charge | 1 | `archer_aimed_shot` | RENAME | Nişanlı Atış (Aimed Shot) | rmb (1) |
| Rapid Fire | channel | ~10 | `archer_rapid_fire` | RENAME | Seri Ateş (Rapid Fire) | s1 (5) |
| Kill Shot | execute | ~15 | `archer_kill_shot` | RENAME | Son Atış (Kill Shot) | E (s3) |
| Trueshot | major | ~20 | `archer_ms_trueshot` | RENAME | Tam İsabet (Trueshot) | V (m90) |
| Arcane Shot | spender | ~ | — | MISSING | Gizemli Ok (Arcane Shot) | q (2) |
| Steady Shot | builder | ~ | — | MISSING | Sakin Atış (Steady Shot) | — |
| Multi-Shot | AoE | 1 | `archer_multishot` | RENAME | Çoklu Atış (Multi-Shot) | e (3) |
| Disengage | mobility | 1 | `archer_disengage` | RENAME | Geri Sıçrayış (Disengage) | Shift+ |
| Hunter's Mark | debuff | ~25 | `archer_hunters_mark` | RENAME | Avcı İşareti (Hunter's Mark) | Shift+ |
| Deadeye | major | ~10 | `archer_ms_deadeye` | RENAME | Keskin Nişan (Deadeye) | X (m45) |

### 5.2 Beast Mastery (`archer_beastmaster`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Kill Command | pet strike | ~10 | `archer_kill_command` | RENAME | Av Emri (Kill Command) | e (3) |
| Cobra Shot | builder | ~ | — | MISSING | Kobra Atışı (Cobra Shot) | — |
| Bestial Wrath | major | ~10 | `archer_bm_bestial_wrath` | RENAME | Vahşi Gazap (Bestial Wrath) | X (m45) |
| Call of the Wild | major summon | ~20 | `archer_bm_pack_hunt` | RENAME | Vahşi Çağrı (Call of the Wild) | V (m90) |
| Serpent Sting | DoT | ~15 | `archer_serpent_sting` | RENAME | Yılan Sokumu (Serpent Sting) | E (s3) |
| Barbed Shot | pet frenzy builder | ~ | — | MISSING | Dikenli Atış (Barbed Shot) | — |
| Cobra Shot/Scare Beast | utility | ~ | — | MISSING | Korkutma (Scare Beast) | — |
| Call Pet | pet | 10 | `archer_call_pet` | RENAME | Yoldaş Çağır (Call Pet) | Shift+ |
| Counter Shot | interrupt | ~ | — | MISSING | Karşı Atış (Counter Shot) | R (s4) |

### 5.3 Survival (`archer_survival`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Raptor Strike | core spender | ~15 | `archer_sv_raptor_strike` | RENAME | Yırtıcı Vuruş (Raptor Strike) | Shift+ |
| Wildfire Bomb | AoE | ~10 | `archer_sv_wildfire_bomb` | RENAME | Yangın Bombası (Wildfire Bomb) | s1 (5) |
| Explosive Shot | AoE (Survival) | ~20 | `archer_explosive_arrow` | MAP (wrong spec) | Patlayıcı Atış (Explosive Shot) | s3 (E) |
| Boomstick | major melee AoE | ~10 | `archer_sv_boomstick` | RENAME | Namlu Patlatıcı (Boomstick) | Shift+ |
| Survival of the Fittest | major defensive | ~20 | `archer_sv_last_stand` | RENAME | Hayatta Kalma Yarışı (Survival of the Fittest) | X (m45) |
| Flanking Strike | mobility/melee | ~ | — | MISSING | Yanaşma Atışı (Flanking Strike) | — |
| Harpoon | pull | ~ | — | MISSING | Zıpkın (Harpoon) | — |
| Aspect of the Turtle | self defensive | ~ | — | MISSING | Kaplumbağa Vaşağı (Aspect of the Turtle) | Shift+ |
| Disengage | mobility | 1 | `archer_disengage` | RENAME | Geri Sıçrayış (Disengage) | Q (s2) |

### 6.1 Protection (`paladin_protection`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Shield of the Righteous | defensive spender | ~10 | `paladin_shield_of_righteous` | RENAME | Doğruluk Kalkanı (Shield of the Righteous) | Q (s2) |
| Avenger's Shield | ranged AoE, taunt | ~10 | `paladin_avengers_shield` | RENAME | İntikamcı Kalkan (Avenger's Shield) | rmb (1) |
| Judgment | builder | 1 | `paladin_judgement` | RENAME | Yargı (Judgment) | e (3) |
| Consecration | AoE zone | ~12 | `paladin_consecration` | RENAME | Kutsal Zemin (Consecration) | s1 (5) |
| Hammer of the Righteous | builder | ~ | — | MISSING | Doğruluk Çekici (Hammer of the Righteous) | — |
| Blessed Hammer | builder | ~10 | `paladin_blessed_hammer` | RENAME | Kutsanmış Çekiç (Blessed Hammer) | Shift+ |
| Reckoning | taunt | ~10 | `paladin_reckoning` | RENAME | Hesaplaşma (Reckoning) | Shift+ |
| Ardent Defender | major defensive | ~20 | `paladin_prot_ardent` | RENAME | Yılmaz Savunucu (Ardent Defender) | V (m90) |
| Guardian of Ancient Kings | major | ~30 | `paladin_prot_bulwark` | PARTIAL | Kadim Krallar Koruyucusu (Guardian of Ancient Kings) | T (m180) |
| Divine Shield | personal immunity | ~ | — | MISSING | İlahi Kalkan (Divine Shield) | — |
| Divine Steed (mobility) | mobility | ~ | `paladin_divine_steed` | RENAME | İlahi Binek (Divine Steed) | Shift+ |
| Word of Glory | self heal | 1 | `paladin_word_of_glory` | RENAME | Işığın Sözü (Word of Glory) | Shift+ |

### 6.2 Holy (`paladin_holy`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Holy Shock | core builder | ~10 | `paladin_holy_shock` | RENAME | Kutsal Şok (Holy Shock) | rmb (1) |
| Flash of Light | single heal | 1 | `paladin_flash_of_light` | RENAME | Işık Parlaması (Flash of Light) | q (2) |
| Light of Dawn | AoE spender | ~15 | `paladin_light_of_dawn` | RENAME | Şafak Işığı (Light of Dawn) | e (3) |
| Holy Light | big heal | ~ | — | MISSING | Kutsal Işık (Holy Light) | — |
| Cleanse | dispel | ~12 | `paladin_cleanse` | RENAME | Arındırma (Cleanse) | Shift+ |
| Divine Toll | major AoE heal | ~ | `paladin_divine_toll` | RENAME | İlahi Çınlama (Divine Toll) | X (m45) |
| Aura Mastery | major defensive | ~30 | `paladin_holy_aura_mastery` | RENAME | Aura Ustalığı (Aura Mastery) | T (m180) |
| Beacon of Light | HoT transfer | ~ | — | MISSING | Işık Mekanı (Beacon of Light) | — |
| Avenging Wrath | major | ~10 | `paladin_avenging_wrath` | RENAME | İntikam Kanatları (Avenging Wrath) | V (m90) |
| Lay on Hands | emergency heal | ~25 | `paladin_lay_on_hands` | RENAME | Şifa Eli (Lay on Hands) | Shift+ |
| Holy Prism | heal/damage | ~ | — | MISSING | Kutsal Prizma (Holy Prism) | — |

### 6.3 Retribution (`paladin_retribution`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Crusader Strike | core builder | 1 | `paladin_crusader_strike` | RENAME | Haçlı Darbesi (Crusader Strike) | rmb (1) |
| Judgment | builder | 1 | `paladin_judgement` | RENAME | Yargı (Judgment) | e (3) |
| Blade of Justice | builder | ~12 | `paladin_blade_of_justice` | RENAME | Adalet Bıçağı (Blade of Justice) | s1 (5) |
| Final Verdict | spender | ~10 | `paladin_verdict` | RENAME | Son Hüküm (Final Verdict) | q (2) |
| Hammer of Light | AoE spender | ~10 | `paladin_hammer_of_light` | RENAME | Işık Çekici (Hammer of Light) | Shift+ |
| Divine Storm | AoE spender | ~10 | `paladin_divine_storm` | RENAME | İlahi Fırtına (Divine Storm) | Shift+ |
| Wake of Ashes | builder | ~15 | `paladin_wake_of_ashes` | RENAME | Küllerin Uyanışı (Wake of Ashes) | r (4) |
| Execution Sentence | major | ~10 | `paladin_ret_execution` | RENAME | İdam Hükmü (Execution Sentence) | X (m45) |
| Avenging Wrath | major | ~10 | `paladin_avenging_wrath` | RENAME | İntikam Kanatları (Avenging Wrath) | V (m90) |
| Hammer of Wrath | execute ranged | ~ | — | MISSING | Öfke Çekici (Hammer of Wrath) | — |
| Divine Steed | mobility | ~ | `paladin_divine_steed` | RENAME | İlahi Binek (Divine Steed) | Shift+ |

### 7.1 Blood (`necromancer_bone`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Heart Strike | core builder | 1 | `necro_heart_strike` | RENAME | Kalp Darbesi (Heart Strike) | rmb (1) |
| Death Strike | spender, heal | ~10 | `necro_death_strike` | RENAME | Ölüm Darbesi (Death Strike) | q (2) |
| Marrowrend | builder, shield | ~12 | `necro_marrowrend` | RENAME | İlik Söken (Marrowrend) | e (3) |
| Blood Boil | AoE | ~12 | `necro_blood_boil` | RENAME | Kan Kaynatma (Blood Boil) | s1 (5) |
| Dancing Rune Weapon | major | ~20 | `necro_dancing_rune_weapon` | RENAME | Hayalet Orak Dansı (Dancing Rune Weapon) | V (m90) |
| Vampiric Blood | major | ~10 | `necro_vampiric_blood` | RENAME | Vampirik Kan (Vampiric Blood) | X (m45) |
| Death's Advance | mobility | 6 | `necro_deaths_advance` | RENAME | Ölüm Atılışı (Death's Advance) | Q (s2) |
| Anti-Magic Shell | defensive | ~15 | `necro_anti_magic_shell` | RENAME | Büyü Karşıtı Kalkan (Anti-Magic Shell) | E (s3) |
| Death's Grip | pull/taunt | ~15 | `necro_deaths_grip` | RENAME | Ölüm Kancası (Death's Grip) | Shift+ |
| Mind Freeze | interrupt | ~10 | `necro_mind_freeze` | RENAME | Zihin Dondurma (Mind Freeze) | R (s4) |
| Icebound Fortitude | major defensive | ~30 | `necro_icebound_fortitude` | RENAME | Buz Gibi Sebat (Icebound Fortitude) | T (m180) |
| Consumption / Bonestorm | major | ~ | — | MISSING | Kemik Fırtınası (Bonestorm) | — |

### 7.2 Unholy (`necromancer_summoner`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Festering Strike | core builder | 1 | `necro_festering_strike` | RENAME | Çürüten Darbe (Festering Strike) | e (3) |
| Death Coil | spender | 1 | `necro_death_coil` | RENAME | Ölüm Sarmalı (Death Coil) | q (2) |
| Scourge Strike | builder | 1 | `necro_scourge_strike` | RENAME | Ölüm Kırbacı (Scourge Strike) | rmb (1) |
| Outbreak | DoT | ~10 | `necro_outbreak` | RENAME | Salgın Çıkışı (Outbreak) | r (4) |
| Epidemic | AoE spender | ~15 | `necro_epidemic` | RENAME | Salgın (Epidemic) | s1 (5) |
| Dark Transformation | major | ~10 | `necro_dark_transformation` | RENAME | Karanlık Dönüşüm (Dark Transformation) | X (m45) |
| Army of the Dead | major | ~20 | `necro_army_of_the_dead` | RENAME | Ölüler Ordusu (Army of the Dead) | V (m90) |
| Death and Decay | AoE zone | ~ | — | MISSING | Ölüm ve Çürüme (Death and Decay) | — |
| Raise Dead | pet summon | ~ | — | MISSING | Ölüleri Diriltme (Raise Dead) | — |
| Death Grip (shared) | pull | ~15 | `necro_deaths_grip` | RENAME | Ölüm Kancası (Death's Grip) | Shift+ |

### 8.1 Affliction (`warlock_affliction`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Agony | DoT | 1 | `warlock_agony` | RENAME | Azap (Agony) | e (3) |
| Corruption | DoT | 6 | `warlock_corruption` | RENAME | Yozlaşma (Corruption) | r (4) |
| Unstable Affliction | core DoT | ~10 | `warlock_unstable_affliction` | RENAME | Dengesiz Azap (Unstable Affliction) | q (2) |
| Malefic Rapture | spender | ~ | — | MISSING | Kötücül Coşku (Malefic Rapture) | — |
| Haunt | core | ~10 | `warlock_haunt` | RENAME | Musallat (Haunt) | s1 (5) |
| Seed of Corruption | AoE | ~12 | `warlock_seed_of_corruption` | RENAME | Yozlaşma Tohumu (Seed of Corruption) | Shift+ |
| Summon Darkglare | major | ~20 | `warlock_summon_darkglare` | RENAME | Karanlık Göz (Summon Darkglare) | V (m90) |
| Malevolence | major (talent) | ~10 | `warlock_malevolence` | RENAME | Kötülük (Malevolence) | X (m45) |
| Shadow Bolt | filler | 1 | `warlock_shadow_bolt` | RENAME | Gölge Oku (Shadow Bolt) | rmb (1) |
| Spell Lock | interrupt | ~10 | `warlock_spell_lock` | RENAME | Büyü Kilidi (Spell Lock) | R (s4) |
| Demonic Circle | mobility | 1 | `warlock_demonic_circle` | RENAME | İblis Çemberi (Demonic Circle) | Shift+ |
| Dark Pact | defensive | ~15 | `warlock_dark_pact` | RENAME | Karanlık Pakt (Dark Pact) | E (s3) |
| Unending Resolve | personal defensive | ~30 | `warlock_unending_resolve` | DUPLICATE | Bitmeyen Kararlılık (Unending Resolve) | T (m180) |

### 8.2 Demonology (absent from data)

Missing core rows if added: Demonbolt, Hand of Gul'dan, Summon Vilefiend, Call Dreadstalkers, Implosion.
### 8.3 Destruction (`warlock_destruction`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Incinerate | filler | 1 | `warlock_incinerate` | RENAME | Kül Etme (Incinerate) | rmb (1) |
| Conflagrate | builder | 3 | `warlock_conflagrate` | RENAME | Alevlendirme (Conflagrate) | e (3) |
| Immolate | DoT | 6 | `warlock_immolate` | RENAME | Yakıp Yıkma (Immolate) | r (4) |
| Chaos Bolt | spender | ~15 | `warlock_chaos_bolt` | RENAME | Kaos Oku (Chaos Bolt) | q (2) |
| Rain of Fire | AoE channel | ~12 | `warlock_rain_of_fire` | RENAME | Ateş Yağmuru (Rain of Fire) | s1 (5) |
| Shadowburn | execute | ~10 | `warlock_shadowburn` | RENAME | Gölge Yakma (Shadowburn) | Shift+ |
| Havoc | debuff cleave | ~ | — | MISSING | Kargaşa (Havoc) | — |
| Summon Infernal | major | ~20 | `warlock_summon_infernal` | RENAME | Cehennem Muhafızı (Summon Infernal) | V (m90) |
| Dark Soul: Instability | major | ~ | `warlock_malevolence` | PARTIAL | Karanlık Ruh: Dengesizlik (Dark Soul: Instability) | X (m45) |
| Fel Domination/Cataclysm | utility | ~ | — | MISSING | Cehennem Kıyameti (Cataclysm) | — |

### 9.1 Havoc (`demonhunter_chaos`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Chaos Strike | core spender | 1 | `demonhunter_chaos_strike` | RENAME | Kaos Darbesi (Chaos Strike) | rmb (1) |
| Annihilation | spender (Havoc) | ~20 | `demonhunter_annihilation` | RENAME | Yok Ediş (Annihilation) | q (2) |
| Blade Dance | AoE builder | 3 | `demonhunter_blade_dance` | RENAME | Bıçak Dansı (Blade Dance) | s1 (5) |
| Death Sweep | AoE spender | ~20 | `demonhunter_death_sweep` | RENAME | Ölüm Süpürmesi (Death Sweep) | e (3) |
| Eye Beam | channel AoE | ~6 | `demonhunter_eye_beam` | RENAME | Göz Işını (Eye Beam) | r (4) |
| Immolation Aura | zone AoE | 1 | `demonhunter_immolation_aura` | RENAME | Yakıcı Aura (Immolation Aura) | Shift+ |
| Fel Rush | mobility | 1 | `demonhunter_fel_rush` | RENAME | Fel Atılışı (Fel Rush) | Q (s2) |
| Disrupt | interrupt | ~10 | `demonhunter_disrupt` | RENAME | Bozucu (Disrupt) | R (s4) |
| Metamorphosis | major | ~20 | `demonhunter_metamorphosis` | RENAME | Metamorfoz (Metamorphosis) | V (m90) |
| Essence Break | major (Havoc) | ~ | `demonhunter_essence_break` | RENAME | Öz Kırılması (Essence Break) | X (m45) |
| Vengeful Retreat | mobility | ~10 | `demonhunter_vengeful_retreat` | RENAME | İntikam Geri Çekilişi (Vengeful Retreat) | Shift+ |
| Blur | defensive | ~10 | `demonhunter_blur` | RENAME | Bulanıklık (Blur) | E (s3) |
| The Hunt | major | ~30 | `demonhunter_the_hunt` | RENAME | Av (The Hunt) | T (m180) |

### 9.2 Vengeance (`demonhunter_vengeance`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Fracture | core builder | 1 | `demonhunter_fracture` | RENAME | Kırılma (Fracture) | rmb (1) |
| Soul Cleave | spender, heal | 1 | `demonhunter_soul_cleave` | RENAME | Ruh Yarma (Soul Cleave) | q (2) |
| Spirit Bomb | AoE spender | ~10 | `demonhunter_spirit_bomb` | RENAME | Ruh Bombası (Spirit Bomb) | s1 (5) |
| Sigil of Flame | zone | ~ | — | MISSING | Alev Mühürü (Sigil of Flame) | — |
| Fiery Brand | defensive | ~10 | `demonhunter_fiery_brand` | RENAME | Ateş Mührü (Fiery Brand) | Shift+ |
| Demon Spikes | personal defensive | 1 | `demonhunter_demon_spikes` | RENAME | Şeytan Dikenleri (Demon Spikes) | E (s3) |
| Infernal Strike | gap closer | ~10 | `demonhunter_infernal_strike` | RENAME | İnfernal Atılış (Infernal Strike) | Q (s2) |
| Torment | taunt | 1 | `demonhunter_torment` | RENAME | İşkence (Torment) | Shift+ |
| Fel Devastation | major channel | ~10 | `demonhunter_fel_devastation` | RENAME | Fel Yıkımı (Fel Devastation) | X (m45) |
| Soul Carver | major | ~20 | `demonhunter_soul_carver` | RENAME | Ruh Oyucu (Soul Carver) | T (m180) |
| Imprison | CC | ~ | — | MISSING | Hapis (Imprison) | — |
| Disrupt | interrupt | ~ | `demonhunter_disrupt` | MAP (shared) | Bozucu (Disrupt) | R (s4) |

### 9.3 Devourer (`demonhunter_devourer`) — Midnight-era spec (verify)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Consume | core builder | 1 | `demonhunter_consume` | RENAME | Tüket (Consume) | rmb (1) |
| Reap | spender | ~3 | `demonhunter_reap` | RENAME | Biç (Reap) | q (2) |
| Void Ray | channel | ~6 | `demonhunter_void_ray` | RENAME | Boşluk Işını (Void Ray) | e (3) |
| Void Nova | AoE builder | ~10 | `demonhunter_void_nova` | RENAME | Boşluk Girdabı (Void Nova) | s1 (5) |
| Collapsing Star | AoE finisher | ~20 | `demonhunter_collapsing_star` | RENAME | Çöken Yıldız (Collapsing Star) | r (4) |
| Void Storm | channel AoE | ~20 | `demonhunter_void_storm` | RENAME | Boşluk Fırtınası (Void Storm) | Shift+ |
| Void Metamorphosis | major | ~20 | `demonhunter_void_metamorphosis` | RENAME | Boşluk Metamorfozu (Void Metamorphosis) | V (m90) |
| Void basic chain | LMB | — | `demonhunter_void_basic*` | RENAME | Boşluk Kıvılcımı (Void Bolt) | lmb (auto) |
| Silence | interrupt | ~ | — | MISSING | Susturma (Silence) | R (s4) |

### 10.1 Devastation (`evoker_devastation`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Living Flame | builder | 1 | `evoker_living_flame` | RENAME | Yaşayan Alev (Living Flame) | rmb (1) |
| Disintegrate | channel spender | 1 | `evoker_disintegrate` | RENAME | Parçala (Disintegrate) | q (2) |
| Fire Breath | empower AoE | 1 | `evoker_fire_breath` | RENAME | Ateş Nefesi (Fire Breath) | e (3) |
| Eternity Surge | empower | ~10 | `evoker_eternity_surge` | RENAME | Ebedi Dalga (Eternity Surge) | r (4) |
| Pyre | AoE spender | ~6 | `evoker_pyre` | RENAME | Alev Çığlığı (Pyre) | s1 (5) |
| Shattering Star | builder | ~ | — | MISSING | Kırıcı Yıldız (Shattering Star) | — |
| Azure Strike | filler | 1 | `evoker_basic` | RENAME | Azur Darbesi (Azure Strike) | lmb (auto) |
| Dragonrage | major | ~20 | `evoker_dragonrage` | RENAME | Ejder Öfkesi (Dragonrage) | V (m90) |
| Deep Breath | major movement | ~ | `evoker_deep_breath` | RENAME | Derin Nefes (Deep Breath) | X (m45) |
| Hover | mobility | ~10 | `evoker_hover` | RENAME | Süzül (Hover) | Q (s2) |
| Obsidian Scales | personal defensive | ~15 | `evoker_obsidian_scales` | RENAME | Obsidyen Pullar (Obsidian Scales) | E (s3) |
| Quell | interrupt | ~10 | `evoker_quell` | RENAME | Bastır (Quell) | R (s4) |
| Fury of the Aspects | hero | ~30 | `evoker_fury_of_aspects` | RENAME | Aspectlerin Öfkesi (Fury of the Aspects) | T (m180) |

### 10.2 Preservation (`evoker_preservation`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Reversion | core HoT | ~10 | `evoker_reversion` | RENAME | Geri Dönüş (Reversion) | q (2) |
| Dream Breath | AoE heal | ~10 | `evoker_dream_breath` | RENAME | Rüya Nefesi (Dream Breath) | e (3) |
| Echo | heal buff | ~10 | `evoker_echo` | RENAME | Yankı (Echo) | r (4) |
| Emerald Blossom | AoE heal | ~10 | `evoker_emerald_blossom` | RENAME | Zümrüt Çiçeği (Emerald Blossom) | s1 (5) |
| Verdant Embrace | heal + move | ~10 | `evoker_verdant_embrace` | RENAME | Yeşil Kucaklayış (Verdant Embrace) | Q (s2) |
| Time Dilation | defensive | ~10 | `evoker_time_dilation` | RENAME | Zaman Genişlemesi (Time Dilation) | X (m45) |
| Rewind | major heal | ~ | — | MISSING | Geri Sarma (Rewind) | Shift+ |
| Stasis | storage | ~20 | `evoker_stasis` | RENAME | Durgunluk (Stasis) | V (m90) |
| Stasis Release | follow-up | ~20 | `evoker_stasis_release` | RENAME | Durgunluk Salımı (Stasis Release) | (follow-up of Stasis) |
| Obsidian Scales | defensive | ~15 | `evoker_obsidian_scales` | MAP (shared) | Obsidyen Pullar (Obsidian Scales) | E (s3) |
| Living Flame | builder | 1 | `evoker_living_flame` | MAP (shared) | Yaşayan Alev (Living Flame) | rmb (1) |

### 10.3 Augmentation (`evoker_augmentation`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Ebon Might | buff | ~10 | `evoker_ebon_might` | RENAME | Abanoz Kudret (Ebon Might) | e (3) |
| Prescience | buff | ~10 | `evoker_prescience` | RENAME | Öngörü (Prescience) | r (4) |
| Eruption | spender | ~10 | `evoker_eruption` | RENAME | Püskürme (Eruption) | q (2) |
| Upheaval | major | ~10 | `evoker_upheaval` | RENAME | Yer Sarsıntısı (Upheaval) | X (m45) |
| Breath of Eons | major | ~20 | `evoker_breath_of_eons` | RENAME | Çağların Nefesi (Breath of Eons) | V (m90) |
| Fire Breath (shared) | empower | 1 | `evoker_fire_breath` | MAP (shared) | Ateş Nefesi (Fire Breath) | Shift+ |
| Living Flame (shared) | builder | 1 | `evoker_living_flame` | MAP (shared) | Yaşayan Alev (Living Flame) | rmb (1) |
| Hover (shared) | mobility | ~10 | `evoker_hover` | MAP (shared) | Süzül (Hover) | Q (s2) |
| Quell (shared) | interrupt | ~10 | `evoker_quell` | MAP (shared) | Bastır (Quell) | R (s4) |
| Time Skip | mobility | ~ | — | MISSING | Zaman Atlatma (Time Skip) | — |

### 11.1 Discipline (`priest_discipline`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Power Word: Shield | core shield | 1 | `priest_power_word_shield` | RENAME | Güç Kalkanı (Power Word: Shield) | rmb (1) |
| Penance | channel heal/damage | ~10 | `priest_disc_penance` | RENAME | Tövbe (Penance) | q (2) |
| Power Word: Radiance | AoE heal | ~15 | `priest_disc_radiance` | RENAME | Güç Işıması (Power Word: Radiance) | s1 (5) |
| Pain Suppression | defensive | ~12 | `priest_disc_pain_suppression` | RENAME | Acı Bastırma (Pain Suppression) | E (s3) |
| Rapture | major shield | ~10 | `priest_disc_rapture` | RENAME | Vecd (Rapture) | V (m90) |
| Evangelism | major | ~20 | `priest_disc_evangelism` | RENAME | İncil (Evangelism) | Shift+ (cd60, no m-slot) |
| Flash Heal | filler | 1 | `priest_flash_heal` | RENAME | Hızlı Şifa (Flash Heal) | e (3) |
| Psychic Scream | AoE CC | ~8 | `priest_psychic_scream` | RENAME | Psişik Çığlık (Psychic Scream) | Shift+ |
| Dispel Magic | dispel | ~12 | `priest_dispel` | RENAME | Büyü Arındırma (Dispel Magic) | Shift+ |
| Power Infusion | party buff | ~ | — | MISSING | Güç Aşılama (Power Infusion) | T (m180) |
| Smite | filler | 1 | `priest_smite` | RENAME | Kutsal Ceza (Smite) | Shift+ |

### 11.2 Holy (`priest_holy`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Holy Word: Serenity | holyword | ~10 | `priest_holy_serenity` | RENAME | Kutsal Söz: Huzur (Holy Word: Serenity) | rmb (1) |
| Holy Word: Sanctify | holyword AoE | ~15 | `priest_holy_sanctify` | RENAME | Kutsal Söz: Kutsama (Holy Word: Sanctify) | q (2) |
| Prayer of Healing | AoE heal | ~10 | `priest_holy_prayer` | RENAME | Şifa Duası (Prayer of Healing) | e (3) |
| Circle of Healing | AoE heal | ~15 | `priest_holy_circle` | RENAME | Şifa Çemberi (Circle of Healing) | s1 (5) |
| Divine Hymn | channel major | ~10 | `priest_holy_hymn` | RENAME | İlahi Ezgi (Divine Hymn) | X (m45) |
| Guardian Spirit | external defensive | ~20 | `priest_holy_guardian` | RENAME | Koruyucu Ruh (Guardian Spirit) | V (m90) |
| Renew | HoT | 5 | `priest_renew` | RENAME | Yenileme (Renew) | s2 (Q) |
| Holy Fire | damage | ~ | — | MISSING | Kutsal Ateş (Holy Fire) | — |
| Prayer of Mending | bounce heal | ~ | — | MISSING | Onarım Duası (Prayer of Mending) | — |
| Heal (single) | filler | 1 | `priest_holy_basic` | RENAME | Kutsal Şifa Oku (Heal) | lmb (auto) |

### 11.3 Shadow (`priest_shadow`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Mind Blast | core builder | ~10 | `priest_shadow_mind_blast` | RENAME | Zihin Patlaması (Mind Blast) | rmb (1) |
| Shadow Word: Pain | DoT | ~10 | `priest_shadow_swp` | RENAME | Gölge Acısı (Shadow Word: Pain) | e (3) |
| Vampiric Touch | DoT | ~12 | `priest_shadow_vt` | RENAME | Vampirik Dokunuş (Vampiric Touch) | r (4) |
| Mind Flay | channel filler | ~12 | `priest_shadow_mind_flay` | RENAME | Zihin Sızması (Mind Flay) | Q (s2) |
| Void Bolt | builder | ~15 | `priest_shadow_void_bolt` | RENAME | Boşluk Oku (Void Bolt) | q (2) |
| Voidform | major | ~10 | `priest_shadow_voidform` | RENAME | Boşluk Formu (Voidform) | V (m90) |
| Shadowfiend | major summon | ~20 | `priest_shadow_fiend` | RENAME | Gölge Canavarı (Shadowfiend) | T (m180) |
| Dispersion | defensive | ~ | — | MISSING | Dağılma (Dispersion) | E (s3) |
| Psychic Scream (shared) | CC | ~8 | `priest_psychic_scream` | MAP (shared) | Psişik Çığlık (Psychic Scream) | Shift+ |
| Silence | interrupt | ~ | — | MISSING | Susturma (Silence) | R (s4) |

### 12.1 Elemental (`shaman_elemental`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Lightning Bolt | filler | 1 | `shaman_lightning_bolt` | RENAME | Yıldırım Oku (Lightning Bolt) | rmb (1) |
| Flame Shock | DoT | 1 | `shaman_flame_shock` | RENAME | Alev Şoku (Flame Shock) | q (2) |
| Lava Burst | builder | ~10 | `shaman_lava_burst` | RENAME | Lav Patlaması (Lava Burst) | e (3) |
| Earth Shock | spender | ~10 | `shaman_earth_shock` | RENAME | Toprak Şoku (Earth Shock) | s1 (5) |
| Chain Lightning | AoE | ~15 | `shaman_chain_lightning` | RENAME | Zincir Yıldırım (Chain Lightning) | Q (s2) |
| Wind Shear | interrupt | 1 | `shaman_wind_shear` | RENAME | Rüzgâr Kesişi (Wind Shear) | R (s4) |
| Fire Elemental | major summon | ~20 | `shaman_totem_fire` | PARTIAL | Ateş Elementali (Fire Elemental) | Shift+ |
| Earthbind Totem | totem | ~15 | `shaman_totem_earthbind` | RENAME | Toprak Bağlama Totemi (Earthbind Totem) | Shift+ |
| Stormkeeper | major | ~10 | `shaman_stormkeeper` | RENAME | Fırtına Bekçisi (Stormkeeper) | X (m45) |
| Ascendance | major | ~20 | `shaman_ascendance` | RENAME | Yükseliş (Ascendance) | V (m90) |
| Earth Elemental | major summon | ~ | — | MISSING | Toprak Elementali (Earth Elemental) | T (m180) |
| Spiritwalker's Grace | mobility | ~ | — | MISSING | Ruh Yürüyüşü (Spiritwalker's Grace) | Shift+ |

### 12.2 Enhancement (`shaman_enhancement`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Stormstrike | core builder | 1 | `shaman_stormstrike` | RENAME | Fırtına Vuruşu (Stormstrike) | rmb (1) |
| Lava Lash | spender | ~10 | `shaman_lava_lash` | RENAME | Lav Kamçısı (Lava Lash) | e (3) |
| Crash Lightning | AoE builder | ~10 | `shaman_crash_lightning` | RENAME | Çatırdayan Yıldırım (Crash Lightning) | Q (s2) |
| Primordial Wave / Maelstrom spender | spender | ~ | `shaman_maelstrom_spender` | PARTIAL | Girdap Patlaması (Maelstrom Weapon spend) | s1 (5) |
| Feral Spirit | major summon | ~20 | `shaman_feral_spirit` | RENAME | Ruh Kurdu Çağrısı (Feral Spirit) | V (m90) |
| Doom Winds | major | ~ | `shaman_enh_unleash` | PARTIAL | Doğal Öfke (Doom Winds) | X (m45) |
| Ascendance (Enhancement) | major | ~20 | `shaman_ascendance` | MAP (shared with Elemental) | Yükseliş (Ascendance) | T (m180) |
| Flame Shock (shared) | DoT | 1 | `shaman_flame_shock` | MAP (shared) | Alev Şoku (Flame Shock) | Shift+ |
| Wind Shear (shared) | interrupt | 1 | `shaman_wind_shear` | MAP (shared) | Rüzgâr Kesişi (Wind Shear) | R (s4) |
| Frost Shock | slow | ~ | — | MISSING | Don Şoku (Frost Shock) | Shift+ |

### 12.3 Restoration (`shaman_restoration`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Healing Wave | single heal | 1 | `shaman_healing_wave` | RENAME | Şifalı Dalga (Healing Wave) | rmb (1) |
| Riptide | HoT | 1 | `shaman_riptide` | RENAME | Gel-Git Dalgası (Riptide) | q (2) |
| Chain Heal | bounce heal | ~10 | `shaman_chain_heal` | RENAME | Zincir Şifa (Chain Heal) | e (3) |
| Healing Rain | AoE heal | ~15 | `shaman_healing_rain` | RENAME | Şifa Yağmuru (Healing Rain) | s1 (5) |
| Purify Spirit | dispel | ~10 | `shaman_purify_spirit` | RENAME | Ruh Arındırma (Purify Spirit) | Shift+ |
| Healing Stream Totem | totem HoT | ~10 | `shaman_stream_totem` | RENAME | Şifa Akıntısı Totemi (Healing Stream Totem) | Shift+ |
| Spiritwalker's Grace (healer) | — | — | — | MISSING | Ruh Yürüyüşü (Spiritwalker's Grace) | — |
| Nature's Swiftness | major | ~10 | `shaman_nature_swiftness` | RENAME | Doğa Çabukluğu (Nature's Swiftness) | X (m45) |
| Tide Totem | major | ~20 | `shaman_tide_totem` | RENAME | Gelgit Totemi (Tide Totem) | V (m90) |
| Earthen Wall/Totem | defensive | ~ | — | MISSING | Toprak Duvarı Totemi (Earthen Wall) | T (m180) |
| Wind Shear (shared) | interrupt | 1 | `shaman_wind_shear` | MAP (shared) | Rüzgâr Kesişi (Wind Shear) | R (s4) |
| Bloodlust (Heroism) | party buff | ~25 | `shaman_bloodlust` | RENAME | Kan Coşkusu (Bloodlust) | Shift+ |

### 13.1 Balance (`druid_balance`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Wrath | filler | 1 | `druid_wrath` | RENAME | Güneş Gazabı (Wrath) | rmb (1) |
| Starfire | filler | ~10 | `druid_starfire` | RENAME | Yıldız Ateşi (Starfire) | e (3) |
| Moonfire | DoT | 1 | `druid_moonfire` | RENAME | Ay Ateşi (Moonfire) | q (2) |
| Sunfire | DoT | ~10 | `druid_sunfire` | RENAME | Güneş Ateşi (Sunfire) | s1 (5) |
| Starsurge | spender | ~12 | `druid_starsurge` | RENAME | Yıldız Dalgası (Starsurge) | Shift+ |
| Starfall | AoE channel | ~20 | `druid_starfall` | RENAME | Yıldız Yağmuru (Starfall) | r (4) |
| Celestial Alignment | major | ~10 | `druid_celestial_alignment` | RENAME | Göksel Hizalanma (Celestial Alignment) | X (m45) |
| Incarnation: Chosen of Elune | major | ~20 | `druid_fury_of_elune` | BROKEN NAME | Elune'nin Seçilmişi (Incarnation: Chosen of Elune) | V (m90) |
| Eclipse | buff (Midnight: not a button) | ~15 | `druid_eclipse` | RENAME | Tutulma (Eclipse) | Shift+ |
| Solar Beam | interrupt | ~10 | `druid_solar_beam` | RENAME | Güneş Işını (Solar Beam) | R (s4) |
| Barkskin | defensive | ~10 | `druid_barkskin` | RENAME | Meşe Kabuğu (Barkskin) | E (s3) |
| Innervate | party buff | ~ | — | MISSING | İlham (Innervate) | Shift+ |

### 13.2 Feral (`druid_feral`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Shred | builder | 1 | `druid_shred` | RENAME | Doğra (Shred) | rmb (1) |
| Rake | builder + bleed | 1 | `druid_rake` | RENAME | Tırmık (Rake) | q (2) |
| Rip | finisher bleed | ~10 | `druid_rip` | RENAME | Parçalama (Rip) | e (3) |
| Ferocious Bite | spender | 1 | `druid_ferocious_bite` | RENAME | Yırtıcı Isırık (Ferocious Bite) | s1 (5) |
| Swipe | AoE builder | ~10 | `druid_swipe` | RENAME | Pençe Savurma (Swipe) | Shift+ |
| Berserk | major | ~10 | `druid_berserk` | RENAME | Vahşileşme (Berserk) | X (m45) |
| Feral Frenzy | major | ~20 | `druid_feral_frenzy` | RENAME | Vahşi Çılgınlık (Feral Frenzy) | V (m90) |
| Tiger's Fury | cat buff | ~ | `druid_feral_fury` | RENAME | Pars Öfkesi (Tiger's Fury) | E (s3) |
| Cat Form | form | 1 | `druid_cat_form` | RENAME | Kedi Biçimi (Cat Form) | Shift+ |
| Dash / Cat Dash | mobility | ~15 | `druid_cat_dash` | RENAME | Atılma (Dash) | Q (s2) |
| Skull Bash | interrupt | ~ | — | MISSING | Kafatası Vuruşu (Skull Bash) | R (s4) |

### 13.3 Guardian (`druid_guardian`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Mangle | builder | ~8 | `druid_mangle` | RENAME | Parçalayıcı Pençe (Mangle) | rmb (1) |
| Thrash | AoE bleed | ~8 | `druid_thrash` | RENAME | Çırpınma (Thrash) | s1 (5) |
| Ironfur | defensive stack | ~8 | `druid_ironfur` | RENAME | Demir Post (Ironfur) | Shift+ |
| Frenzied Regeneration | self heal | ~10 | `druid_frenzied_regen` | RENAME | Çılgın Yenilenme (Frenzied Regeneration) | E (s3) |
| Growl | taunt | ~10 | `druid_growl` | RENAME | Kükreme (Growl) | Shift+ |
| Survival Instincts | major defensive | ~ | `druid_survival_instincts` | RENAME | Hayatta Kalma İçgüdüsü (Survival Instincts) | X (m45) |
| Berserk (Bear) | major | ~ | `druid_sleeper_rage` | PARTIAL | Uyuyanın Öfkesi (Incarnation: Guardian of Ursoc, verify) | V (m90) |
| Barkskin (shared) | defensive | ~10 | `druid_barkskin` | MAP (shared) | Meşe Kabuğu (Barkskin) | Shift+ |
| Skull Bash (shared) | interrupt | ~ | — | MISSING | Kafatası Vuruşu (Skull Bash) | R (s4) |
| Maul | spender | ~ | — | MISSING | Parçalayıcı Darbe (Maul) | Shift+ |

### 13.4 Restoration (`druid_restoration`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Rejuvenation | HoT | 1 | `druid_rejuvenation` | RENAME | Gençleşme (Rejuvenation) | rmb (1) |
| Lifebloom | HoT | ~10 | `druid_lifebloom` | RENAME | Yaşam Çiçeği (Lifebloom) | q (2) |
| Wild Growth | AoE HoT | ~12 | `druid_wild_growth` | RENAME | Yabani Büyüme (Wild Growth) | s1 (5) |
| Swiftmend | burst heal | ~10 | `druid_swiftmend` | RENAME | Çabuk İyileşme (Swiftmend) | e (3) |
| Regrowth | filler heal | 5 | `druid_regrowth` | RENAME | Yeniden Büyüme (Regrowth) | Q (s2) |
| Nature's Cure | dispel | ~12 | `druid_natures_cure` | RENAME | Doğa Şifası (Nature's Cure) | Shift+ |
| Ironbark | external defensive | ~10 | `druid_ironbark` | RENAME | Demir Kabuk (Ironbark) | X (m45) |
| Tranquility | channel AoE | ~20 | `druid_tranquility` | RENAME | Dinginlik (Tranquility) | V (m90) |
| Innervate | party buff | ~ | — | MISSING | İlham (Innervate) | Shift+ |
| Efflorescence | heal zone | ~ | — | MISSING | Çiçeklenme (Efflorescence) | Shift+ |

### 14.1 Fire (`mage_fire`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Fireball | filler | 1 | `mage_fireball` | RENAME | Ateş Topu (Fireball) | rmb (1) |
| Pyroblast | big cast | ~10 | `mage_pyroblast` | RENAME | Piroblast (Pyroblast) | q (2) |
| Fire Blast | instant | ~10 | `mage_fire_blast` | RENAME | Ateş Patlaması (Fire Blast) | e (3) |
| Scorch | filler | ~ | `mage_scorch` | RENAME | Kavurma (Scorch) | r (4) |
| Flamestrike | AoE | ~12 | `mage_flamestrike` | RENAME | Alev Sütunu (Flamestrike) | s1 (5) |
| Phoenix Flames | builder | ~15 | `mage_phoenix_flames` | RENAME | Anka Alevleri (Phoenix Flames) | Shift+ |
| Combustion | major | ~20 | `mage_combustion` | RENAME | Yanış (Combustion) | V (m90) |
| Counterspell | interrupt | ~ | `mage_counterspell` | RENAME | Büyü Kırma (Counterspell) | R (s4) |
| Blazing Barrier | defensive | ~15 | `mage_blazing_barrier` | RENAME | Alev Bariyeri (Blazing Barrier) | E (s3) |
| Blink | mobility | 6 | `mage_blink` | RENAME | Işınlanma (Blink) | Q (s2) |
| Meteor | AoE | ~10 | `mage_meteor` | MAP | Meteor (Meteor) | X (m45) |
| Dragon's Breath | cone | ~ | — | MISSING | Ejderha Nefesi (Dragon's Breath) | — |
| Living Bomb | DoT | ~ | — | MISSING | Canlı Bomba (Living Bomb) | — |

### 14.2 Frost (`mage_frost`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Frostbolt | filler | 1 | `mage_frostbolt` | RENAME | Ayaz Oku (Frostbolt) | rmb (1) |
| Ice Lance | builder/spender | ~3 | `mage_ice_lance` | RENAME | Buz Mızrağı (Ice Lance) | q (2) |
| Flurry | spender | ~6 | `mage_flurry` | RENAME | Dondurucu Sağanak (Flurry) | e (3) |
| Frost Nova | CC | 3 | `mage_frost_nova` | RENAME | Buz Halkası (Frost Nova) | Shift+ |
| Blizzard | AoE channel | ~15 | `mage_blizzard` | RENAME | Kar Fırtınası (Blizzard) | s1 (5) |
| Frozen Orb | major AoE | ~20 | `mage_frozen_orb` | RENAME | Donmuş Küre (Frozen Orb) | V (m90) |
| Ray of Frost | major | ~20 | `mage_ray_of_frost` | RENAME | Ayaz Işını (Ray of Frost) | X (m45) |
| Ice Barrier | defensive | ~15 | `mage_ice_barrier` | RENAME | Buz Bariyeri (Ice Barrier) | E (s3) |
| Ice Block | personal immunity | ~ | `mage_ice_block` | MAP (no bar slot) | Buz Küresi (Ice Block) | Shift+ |
| Glacial Spike | builder | ~ | `mage_glacial_spike` | RENAME | Buz Sarkıtı (Glacial Spike) | r (4) |
| Comet Storm | AoE | ~ | `mage_comet_storm` | RENAME | Kuyruklu Yıldız Yağmuru (Comet Storm) | Shift+ |
| Counterspell | interrupt | ~ | `mage_counterspell` | RENAME | Büyü Kırma (Counterspell) | R (s4) |
| Icy Veins | major | ~ | — | MISSING | Buz Damarları (Icy Veins) | T (m180) |

### 14.3 Arcane (`mage_arcane`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Arcane Blast | core builder | 1 | `mage_arcane_blast` | RENAME | Gizem Patlaması (Arcane Blast) | rmb (1) |
| Arcane Missiles | channel spender | 3 | `mage_arcane_missiles` | RENAME | Arkan Füzeler (Arcane Missiles) | q (2) |
| Arcane Barrage | spender | 6 | `mage_arcane_barrage` | RENAME | Gizem Barajı (Arcane Barrage) | e (3) |
| Arcane Orb | AoE | 20 | `mage_arcane_orb` | RENAME | Gizemli Küre (Arcane Orb) | r (4) |
| Arcane Pulse | AoE | 12 | `mage_arcane_pulse` | RENAME | Arkan Nabzı (Arcane Pulse) | s1 (5) |
| Touch of the Magi | major | ~10 | `mage_touch_of_magi` | RENAME | Büyücü Dokunuşu (Touch of the Magi) | X (m45) |
| Arcane Surge | major | ~20 | `mage_arcane_surge` | RENAME | Gizem Dalgalanması (Arcane Surge) | V (m90) |
| Prismatic Barrier | defensive | 15 | `mage_prismatic_barrier` | RENAME | Prizmatik Bariyer (Prismatic Barrier) | E (s3) |
| Counterspell | interrupt | ~ | `mage_counterspell` | RENAME | Büyü Kırma (Counterspell) | R (s4) |
| Blink | mobility | 6 | `mage_blink` | RENAME | Işınlanma (Blink) | Q (s2) |
| Time Warp | major, shared | ~ | `mage_time_warp` | MISSING | Zaman Bükme (Time Warp) | T (m180) |
| Evocation | channel mana | ~ | — | MISSING | Büyü Çağırma (Evocation) | Shift+ |

### 15.1 Assassination (`rogue_assassin`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Mutilate | core builder | 1 | `rogue_mutilate` | RENAME | Sakatlama (Mutilate) | rmb (1) |
| Envenom | finisher | 3 | `rogue_envenom` | RENAME | Zehirleme (Envenom) | q (2) |
| Garrote | opener/silence | 6 | `rogue_garrote` | RENAME | Gırtlak Kesme (Garrote) | e (3) |
| Rupture | finisher bleed | 10 | `rogue_rupture` | RENAME | Yırtma (Rupture) | r (4) |
| Fan of Knives | AoE | 6 | `rogue_fan_of_knives` | RENAME | Bıçak Yelpazesi (Fan of Knives) | s1 (5) |
| Crimson Tempest | AoE finisher | 12 | `rogue_crimson_tempest` | RENAME | Kızıl Fırtına (Crimson Tempest) | Shift+ |
| Kingsbane | major | ~10 | `rogue_kingsbane` | RENAME | Kral Belası (Kingsbane) | X (m45) |
| Deathmark | major | ~20 | `rogue_deathmark` | RENAME | Ölüm İşareti (Deathmark) | V (m90) |
| Kick | interrupt | ~10 | `rogue_kick` | RENAME | Tekme (Kick) | R (s4) |
| Shadowstep | mobility | 3 | `rogue_shadow_step` | RENAME | Gölge Adımı (Shadowstep) | Q (s2) |
| Vanish | major stealth | 15 | `rogue_vanish` | RENAME | Kaybol (Vanish) | T (m180) |
| Kidney Shot | CC finisher | ~ | — | MISSING | Böbrek Vuruşu (Kidney Shot) | Shift+ |
| Cloak of Shadows | defensive | ~ | `rogue_cloak_of_shadows` | PARTIAL (defined, not on bar) | Gölge Pelerini (Cloak of Shadows) | Shift+ (E is Feint in data) |

### 15.2 Subtlety (`rogue_subtlety`)

| WoW ability | Type | WoW L (~) | Our id | Status | Proposed name | Key |
|---|---|---|---|---|---|---|
| Backstab | core builder | 1 | `rogue_backstab` | RENAME | Sırttan Bıçak (Backstab) | rmb (1) |
| Shadowstrike | builder, teleport | ~10 | `rogue_shadowstrike` | RENAME | Gölge Vuruşu (Shadowstrike) | Shift+ |
| Eviscerate | finisher | 10 | `rogue_eviscerate` | RENAME | İnfaz (Eviscerate) | q (2) |
| Black Powder | AoE finisher | ~10 | `rogue_black_powder` | RENAME | Kara Barut (Black Powder) | Shift+ |
| Secret Technique | major finisher | ~20 | `rogue_secret_technique` | RENAME | Gizli Teknik (Secret Technique) | r (4) |
| Shadow Dance | stealth burst | ~20 | `rogue_shadow_dance` | RENAME | Gölge Dansı (Shadow Dance) | E (s3) |
| Shuriken Storm | AoE | ~6 | `rogue_shuriken_storm` | RENAME | Shuriken Fırtınası (Shuriken Storm) | s1 (5) |
| Goremaw's Bite | major | ~10 | `rogue_goremaws_bite` | RENAME | Kan Isırığı (Goremaw's Bite) | X (m45) |
| Shadow Blades | major | ~10 | `rogue_shadow_blades` | RENAME | Gölge Bıçakları (Shadow Blades) | V (m90) |
| Symbols of Death | major | ~ | — | MISSING | Ölüm Sembolleri (Symbols of Death) | T (m180) |
| Kick | interrupt | ~10 | `rogue_kick` | MAP (shared) | Tekme (Kick) | R (s4) |
| Feint | defensive | ~ | `rogue_feint` | MAP (shared) | Aldatma (Feint) | Shift+ |

### 15.3 Alchemist (`rogue_alchemist`) — custom, no WoW spec

| Our row | Our id | Type | Closest WoW analogue | Status | Action |
|---|---|---|---|---|---|
| Asit Şişesi | `rogue_acid_flask` | ranged poison | Pistol Shot (Outlaw) / Throw | EXTRA | Decide: keep as custom or replace with an Outlaw row. |
| Şişe Fırlat | `rogue_vial_throw` | basic | LMB chain | EXTRA | Keep, basic. |
| Şifa Şişesi | `rogue_vial_heal` | AoE heal | — | EXTRA | Custom. |
| Panzehir | `rogue_antidote` | dispel | Cleanse Poison | EXTRA | Custom. |
| Duman Siperi | `rogue_smoke_ward` | AoE defensive | Smoke Bomb | EXTRA | Custom. |
| Mucize Damla / Mucize Karışım | `rogue_mending_draught`, `rogue_miracle_brew` | heal | — | EXTRA | Custom. |
| Hayat İksiri Yağmuru | `rogue_elixir_of_life` | major AoE heal | — | EXTRA | Custom. |
| Hızlandırıcı İksir | `rogue_haste_elixir` | hero buff, L30 / L99 (duplicate) | — | EXTRA | Duplicate row with two unlock levels (L30 and L99). Fix. |
| Koruyucu İksir / Yüce Karışım | `rogue_ward_potion`, `rogue_ascendant_brew` | shield / major heal | — | EXTRA | Custom. |

## 16. Proposed WoW key layout (summary)

| Physical key | Slot | Role in WoW layout |
|---|---|---|
| LMB | `lmb` | Auto-attack chain (Mouse0 reserved; `Oto` toggle) |
| 1 | `rmb` | Core builder or filler (on GCD) |
| 2 | `q` | Main spender |
| 3 | `e` | Second builder, spender or DoT |
| 4 | `r` | Long CD or ultimate (channel/AoE) |
| 5 | `s1` | AoE |
| Q | `s2` | Mobility or gap closer |
| E | `s3` | Personal defensive |
| R | `s4` | Interrupt (every class that has one) |
| X / V / T | `m45` / `m90` / `m180` | Majors (3 per spec) |
| G / H | potions | HP / MP |
| 6–0 | flasks | Unchanged |
| Shift+ | — | Second bar (proposed, not in code) for extra rows: taunts, dispels, Shift+ extras |

## 17. Work size and recommended order

Counts are approximate. "Missing" = WoW rows with no skill. "Renames" = existing rows that need a Turkish-plus-English name.

| Class | Specs (ours) | Missing | Renames | Size | Notes |
|---|---|---|---|---|---|
| Knight (Warrior) | Arms, Prot | 9 | 13 | M | EXTRA (paladin-style): Wake of Flames, Templar Verdict, Zeal, Wings of Judgment; Prot: Consecration, Heaven's Judgment, War Banner, Heroism Call, unnamed Oath Aegis. Missing: Shield Slam, Spell Reflection, Intervene. |
| Barbarian (Warrior) | Fury, Warlord | 9 | 12 | M | Fury EXTRA: Cleave, Axe Throw, Fissure. Warlord needs real tank rows (Shield Slam, Revenge, Thunder Clap, Shield Wall). |
| Mage | Fire, Frost, Arcane | 5 | 25 | M | `mage_time_warp` is the m180 in all 3 specs with no row. Two conflicting major sets (`specs_kit_mage.ts` vs `specs_talents.ts`). |
| Rogue | Assassination, Subtlety, Alchemist (custom) | 4 + Outlaw | 19 | L | 9 duplicate ids across 2 files (shadow_step, backstab, kick, garrote, eviscerate, shadow_dance, shadow_blades, fan_of_knives, haste_elixir). Alchemist: 9 EXTRA, no WoW spec. |
| Paladin | Prot, Holy, Ret | 8 | 27 | S | Ret EXTRA: Templar Slash. Holy basic chain unnamed. |
| Necromancer (DK) | Blood, Unholy | 3 | 19 | S | Frost not in data (decide). Unholy has no interrupt or defensive row. |
| Warlock | Affliction, Destruction | 6 | 16 | M | Demonology absent. Duplicate ids: spell_lock, unending_resolve. |
| Monk | Brew, WW, MW | 10 | 25 | M | Brewmaster has 2 skills on `e` (Keg Smash, Spinning Crane). Mistweaver heal thin. |
| Archer (Hunter) | MM, BM, SV | 8 | 17 | S | Beast Mastery has no interrupt row. Explosive Shot sits on Marksman in data, Survival in WoW. |
| Shaman | Ele, Enh, Resto | 7 | 22 | M | Enhancement basic and rows have blank names (G4). |
| Demon Hunter | Havoc, Vengeance, Devourer | 5 | 30 | S | Kit complete; names only. Owner's Blade Dance example. Devourer is Midnight (verify). |
| Evoker | Dev, Pres, Aug | 4 | 22 | S | Preservation: key check for Stasis/Time Dilation. |
| Priest | Disc, Holy, Shadow | 7 | 22 | M | Shadow has no interrupt. Discipline Evangelism has no major slot. |
| Druid | Bal, Feral, Guard, Resto | 6 | 29 | M | `Elune\` name bug (G3). Skull Bash shared by Feral and Guardian. |

Totals: about 100 missing WoW rows and about 310 renames. Renames are cheap (one table per class). Missing rows are the real cost.

Recommended order:

1. **Blockers (S):** fix `mage_time_warp`; fix `druid_fury_of_elune` name; add names for `knight_oath_aegis` and `shaman_enh_basic`; resolve duplicate ids (rogue, warlock). Otherwise a rename can be overwritten by a later `add()`.
2. **Naming pass (S per class):** Demon Hunter first (owner's example), then Paladin, Archer, Evoker, Necromancer, Warlock.
3. **Tank rows (M):** Knight Prot and Barbarian Warlord (Shield Slam, Revenge, Thunder Clap, Shield Wall).
4. **Mage specs and interrupts (M):** Time Warp, Icy Veins, Silence, Wind Shear placement.
5. **Monk Mistweaver heal and Druid shared rows (M).**
6. **Decisions before build:** Necro Frost? Warlock Demonology? Rogue Alchemist to Outlaw or retire? Second bar (Shift+) yes or no?
7. **Rogue (L)** last, since it depends on the decisions in step 6.

## 18. Caveats

- WoW spell lists are prior knowledge plus partial Midnight preview material. Verify on Wowhead before building. Unlock levels (~) are indicative.
- Midnight changes noted in the search (Warrior): Champion's Spear reshaped, Thunder Clap as Protection AoE, Avatar moved to Protection.
- No code was changed and nothing was committed.
