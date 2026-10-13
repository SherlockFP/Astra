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
      'mage_prismatic_bolt if status:prismatic_ready',
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
      'mage_prismatic_bolt if status:prismatic_ready',
      'mage_arcane_missiles if status:clearcasting || stacks:arcane_salvo < 10',
      'mage_arcane_blast',
      'mage_basic',
    ],
  },
};
