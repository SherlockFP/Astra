/**
 * AE-4 APL rows (docs/kits/agile-evoker.md §4.1c / §4.2c / §4.3c). Same shape as rotations_kit_necromancer.ts (A.3 condition DSL, first match
 * wins, the last line is the weapon chain). Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables;
 * dev/combat-sim/kit_evoker.mjs runs the ST lists on dev dummies and allies.
 *
 * Grammar extras on top of A.3 (the sim compiler of kit_evoker.mjs implements them):
 *  - `skill@rank=N`   an empowered hold: press the slot, release at rank N (0.67 / 1.33 / 2.00 s divided by haste).
 *  - `res` mana in percent of the bar; `pips:essence`   Öz count; `lowest.hp%` hp of the most injured ally; `injured` allies below 90 %; `stored` Durgunluk store; `tank.hp%`.
 * Koruyucu's damage-mode Yaşayan Alev only fills idle GCDs while the bar is above 60 % (mana is this spec's gate, doc 4.2 d). Deviations from the source text: the "hold rank 1" of the budget keeps the 0.67 s hold, the filler Yaşayan Alev has no `!moving` gate (the
 * sim dummy never moves), and Koruyucu's two Yaşayan Alev lines (heal / damage mode) are told apart by the aim (the sim aims the ally on `lowest.hp% < 80`).
 */
import type { KitApl } from './rotations_kit_rogue';

export const ROTATIONS_KIT_EVOKER: Record<string, KitApl> = {
  evoker_devastation: {
    st: [
      'evoker_fury_of_aspects if cd_ready(evoker_fury_of_aspects) && !status:sated',
      'evoker_dragonrage if cd_ready(evoker_dragonrage)',
      'evoker_deep_breath if cd_ready(evoker_deep_breath)',
      'evoker_fire_breath@rank=1 if cd_ready(evoker_fire_breath) || status:tip_scales',
      'evoker_eternity_surge@rank=1 if cd_ready(evoker_eternity_surge)',
      'evoker_disintegrate if status:essence_burst || pips:essence >= 3',
      'evoker_unbound_flame if status:unbound_flame',
      'evoker_living_flame',
      'evoker_basic',
    ],
    aoe: [
      'evoker_dragonrage if cd_ready(evoker_dragonrage)',
      'evoker_deep_breath if cd_ready(evoker_deep_breath)',
      'evoker_fire_breath@rank=3 if cd_ready(evoker_fire_breath) || status:tip_scales',
      'evoker_eternity_surge@rank=3 if cd_ready(evoker_eternity_surge) && targets >= 5',
      'evoker_eternity_surge@rank=2 if cd_ready(evoker_eternity_surge)',
      'evoker_pyre if targets >= 3 && (status:essence_burst || pips:essence >= 3)',
      'evoker_disintegrate if targets <= 2 && (status:essence_burst || pips:essence >= 3)',
      'evoker_living_flame',
      'evoker_basic',
    ],
  },
  evoker_preservation: {
    st: [
      'evoker_time_dilation if cd_ready(evoker_time_dilation) && tank.hp% < 35',
      'evoker_stasis_release if status:stasis && stored >= 3',
      'evoker_stasis if cd_ready(evoker_stasis) && injured >= 3',
      'evoker_reversion if lowest.hp% < 85 && !lowest.status:reversion',
      'evoker_echo if pips:essence >= 2 && injured >= 3',
      'evoker_dream_breath@rank=2 if cd_ready(evoker_dream_breath) && injured >= 3',
      'evoker_emerald_blossom if (status:essence_burst || pips:essence >= 3) && injured >= 3',
      'evoker_verdant_embrace if cd_ready(evoker_verdant_embrace) && lowest.hp% < 50',
      'evoker_living_flame if lowest.hp% < 80',
      'evoker_living_flame if res >= 60',
      'evoker_basic',
    ],
    aoe: [
      'evoker_dream_breath@rank=3 if cd_ready(evoker_dream_breath)',
      'evoker_emerald_blossom if status:essence_burst || pips:essence >= 3',
      'evoker_reversion if lowest.hp% < 85 && !lowest.status:reversion',
      'evoker_living_flame',
      'evoker_basic',
    ],
  },
  evoker_augmentation: {
    st: [
      'evoker_fury_of_aspects if cd_ready(evoker_fury_of_aspects) && !status:sated',
      'evoker_ebon_might if cd_ready(evoker_ebon_might) && (!status:ebon_might || remaining:ebon_might <= 5)',
      'evoker_prescience if charges(evoker_prescience) >= 2',
      'evoker_breath_of_eons if cd_ready(evoker_breath_of_eons) && status:ebon_might',
      'evoker_fire_breath@rank=1 if cd_ready(evoker_fire_breath) || status:tip_scales',
      'evoker_upheaval@rank=1 if cd_ready(evoker_upheaval)',
      'evoker_eruption if stacks:essence_burst >= 2 || pips:essence >= 3',
      'evoker_prescience if charges(evoker_prescience) >= 1',
      'evoker_living_flame',
      'evoker_basic',
    ],
    aoe: [
      'evoker_ebon_might if cd_ready(evoker_ebon_might) && (!status:ebon_might || remaining:ebon_might <= 5)',
      'evoker_prescience if charges(evoker_prescience) >= 1',
      'evoker_breath_of_eons if cd_ready(evoker_breath_of_eons) && status:ebon_might',
      'evoker_fire_breath@rank=3 if cd_ready(evoker_fire_breath) || status:tip_scales',
      'evoker_upheaval@rank=3 if cd_ready(evoker_upheaval)',
      'evoker_eruption if status:essence_burst || pips:essence >= 3',
      'evoker_living_flame',
      'evoker_basic',
    ],
  },
};
