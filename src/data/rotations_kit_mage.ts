/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2c / §3c / §4c; WoW core loops per docs/WOW_ABILITY_MAP.md §14). One line per entry,
 * top to bottom = priority, in the A.3 DSL consumed by CM5 (`data/rotations.ts`). Only skills that are bound on the spec's bar
 * (specs_kit_mage.ts defaultBar) appear here; Ejderha Nefesi, Canlı Bomba, Büyü Çağırma, Buz Halkası and Kuyruklu Yıldız
 * Yağmuru are not bound (no second bar in code), so they are not in the APLs. OWNER: combat (data).
 *
 * Core loops:
 *  - Ateş: Ateş Topu / Kavurma filler; Isınıyor -> Ateş Patlaması; Sıcak Seri -> Piroblast; Yanış opens with 2 Ateş Patlaması charges;
 *    Meteor and Zaman Bükme ride the Yanış window.
 *  - Buz: Beyin Donması -> Dondurucu Sağanak; Buz Parmağı -> Buz Mızrağı; Buz Damarları and Donmuş Küre on cooldown;
 *    Ayaz Işını when Dondurucu Sağanak has no charge; Buz Sarkıtı when hazır.
 *  - Gizem: Yük -> Gizem Barajı when 4 yük (or Berrak Zihin + Gizem Mermisi stacks); Gizem Dalgalanması with Touch of the Magi;
 *    Arkan Füzeler when Berrak Zihin is up, else Gizem Patlaması to build yük.
 */
export const ROTATIONS_KIT_MAGE: Record<string, unknown> = {
  mage_arcane: {
    st: [
      'mage_touch_of_magi if cd_ready(mage_touch_of_magi)',
      'mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40 && res% >= 60',
      'mage_time_warp if cd_ready(mage_time_warp) && status:arcane_surge',
      'mage_arcane_barrage if stacks:arcane_salvo >= 20 || (status:clearcasting && stacks:arcane_salvo >= 12)',
      'mage_arcane_barrage if status:arcane_surge && stacks:arcane_salvo >= 10',
      'mage_arcane_missiles if status:clearcasting && stacks:arcane_salvo < 16',
      'mage_arcane_barrage if pips:arcane >= 4',
      'mage_arcane_orb if cd_ready(mage_arcane_orb) && pips:arcane <= 2',
      'mage_arcane_missiles if stacks:arcane_salvo < 12 && res% >= 40',
      'mage_arcane_blast',
      'mage_basic',
    ],
    aoe: [
      'mage_touch_of_magi if cd_ready(mage_touch_of_magi)',
      'mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40',
      'mage_time_warp if cd_ready(mage_time_warp) && status:arcane_surge',
      'mage_arcane_orb if cd_ready(mage_arcane_orb)',
      'mage_arcane_pulse if cd_ready(mage_arcane_pulse) && targets >= 3',
      'mage_arcane_barrage if stacks:arcane_salvo >= 15 || (pips:arcane >= 4 && stacks:arcane_salvo >= 10)',
      'mage_arcane_missiles if status:clearcasting || stacks:arcane_salvo < 10',
      'mage_arcane_blast',
      'mage_basic',
    ],
  },
  mage_fire: {
    st: [
      'mage_ice_barrier if cd_ready(mage_ice_barrier) && hp% < 60', // the L1-9 shield (on the opening bar only; the fire bar has none from L10)
      'mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2 && !status:combustion',
      'mage_meteor if cd_ready(mage_meteor) && (status:combustion || cd(mage_combustion) > 12)',
      'mage_time_warp if cd_ready(mage_time_warp) && status:combustion',
      'mage_fire_blast if status:heating_up && charges >= 1',
      'mage_pyroblast if status:hot_streak',
      'mage_fire_blast if status:combustion && charges >= 1',
      'mage_pyroblast if status:pyroclasm && !moving',
      'mage_scorch if moving',
      'mage_fireball',
      'mage_basic',
    ],
    aoe: [
      'mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2 && !status:combustion',
      'mage_meteor if cd_ready(mage_meteor)',
      'mage_fire_blast if status:heating_up && charges >= 1',
      'mage_flamestrike if status:hot_streak && targets >= 4',
      'mage_flamestrike if status:pyroclasm && targets >= 4',
      'mage_fire_blast if charges >= 1',
      'mage_flamestrike if targets >= 3',
      'mage_pyroblast if status:hot_streak',
      'mage_fireball',
      'mage_basic',
    ],
  },
  mage_frost: {
    st: [
      'mage_flurry if status:brain_freeze',
      'mage_icy_veins if cd_ready(mage_icy_veins)',
      'mage_ice_lance if status:fingers_of_frost && stacks:fingers_of_frost >= 2',
      'mage_frozen_orb if cd_ready(mage_frozen_orb)',
      'mage_ray_of_frost if cd_ready(mage_ray_of_frost) && charges(mage_flurry) < 1 && !status:fingers_of_frost',
      'mage_glacial_spike if status:glacial_ready',
      'mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6',
      'mage_flurry if charges >= 1 && target.stacks:freezing < 6',
      'mage_frostbolt',
      'mage_basic',
    ],
    aoe: [
      'mage_flurry if status:brain_freeze',
      'mage_blizzard if status:freezing_rain || cd_ready(mage_blizzard)',
      'mage_icy_veins if cd_ready(mage_icy_veins)',
      'mage_frozen_orb if cd_ready(mage_frozen_orb)',
      'mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6',
      'mage_glacial_spike if status:glacial_ready',
      'mage_ray_of_frost',
      'mage_frostbolt',
      'mage_basic',
    ],
  },
};
