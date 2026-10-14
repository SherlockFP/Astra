/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2c, mage_arcane APLs). One line per entry, top to bottom = priority, in the A.3 DSL
 * consumed by CM5 (`data/rotations.ts`). Fire and frost APLs (§3c / §4c) come with their kit rows. OWNER: combat (data).
 */
export const ROTATIONS_KIT_MAGE: Record<string, unknown> = {
  mage_arcane: {
    st: [
      'mage_touch_of_magi if cd_ready(mage_touch_of_magi)',
      'mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40 && res% >= 60',
      'mage_arcane_barrage if stacks:arcane_salvo >= 20 || (status:clearcasting && stacks:arcane_salvo >= 12)',
      'mage_arcane_barrage if status:arcane_surge && stacks:arcane_salvo >= 10',
      'mage_arcane_missiles if status:clearcasting && stacks:arcane_salvo < 16',
      'mage_arcane_orb if cd_ready(mage_arcane_orb) && pips:arcane <= 2',
      'mage_arcane_missiles if stacks:arcane_salvo < 12 && res% >= 40',
      'mage_arcane_blast',
      'mage_basic',
    ],
    aoe: [
      'mage_touch_of_magi if cd_ready(mage_touch_of_magi)',
      'mage_arcane_surge if cd_ready(mage_arcane_surge) && cd(mage_touch_of_magi) > 40',
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
      'mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2 && !status:combustion',
      'mage_meteor if cd_ready(mage_meteor) && (status:combustion || cd(mage_combustion) > 12)',
      'mage_fire_blast if status:heating_up && charges >= 1',
      'mage_pyroblast if status:hot_streak',
      'mage_fire_blast if status:combustion && charges >= 1',
      'mage_pyroblast if status:pyroclasm && !moving',
      'mage_scorch if moving',
      'mage_fireball',
      'mage_basic',
    ],
    aoe: [
      'mage_combustion if cd_ready(mage_combustion) && charges(mage_fire_blast) >= 2',
      'mage_meteor if cd_ready(mage_meteor)',
      'mage_fire_blast if charges >= 1',
      'mage_flamestrike if status:hot_streak && targets >= 4',
      'mage_flamestrike if status:pyroclasm && targets >= 4',
      'mage_pyroblast if status:hot_streak',
      'mage_fireball',
      'mage_basic',
    ],
  },
  mage_frost: {
    st: [
      'mage_flurry if status:brain_freeze',
      'mage_ice_lance if status:fingers_of_frost && stacks:fingers_of_frost >= 2',
      'mage_frozen_orb if cd_ready(mage_frozen_orb)',
      'mage_ray_of_frost if cd_ready(mage_ray_of_frost) && charges(mage_flurry) < 1 && !status:fingers_of_frost',
      'mage_comet_storm if status:comet_ready',
      'mage_glacial_spike if status:glacial_ready',
      'mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6',
      'mage_flurry if charges >= 1 && target.stacks:freezing < 6',
      'mage_frost_nova if cd_ready(mage_frost_nova) && target.stacks:freezing >= 3',
      'mage_frostbolt',
      'mage_basic',
    ],
    aoe: [
      'mage_blizzard if status:freezing_rain || cd_ready(mage_blizzard)',
      'mage_flurry if status:brain_freeze',
      'mage_ice_lance if status:fingers_of_frost || target.stacks:freezing >= 6',
      'mage_frozen_orb',
      'mage_glacial_spike if status:glacial_ready',
      'mage_ray_of_frost',
      'mage_comet_storm if status:comet_ready',
      'mage_frostbolt',
      'mage_basic',
    ],
  },
};
