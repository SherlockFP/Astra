/**
 * AE-3 APL rows (docs/kits/agile-evoker.md §3.1c Kaos, §3.2c İntikam, + the Midnight Yutucu). Lines are in the A.3 condition DSL, first
 * match wins (same shape as rotations_kit_necromancer.ts / rotations_kit_paladin.ts). Consumed by CM5 (`src/data/rotations.ts`) once it
 * reads the kit tables; dev/combat-sim/kit_demonhunter.mjs runs the ST lists on a dev dummy. OWNER: combat (data).
 * Grammar extras on top of A.3 (same as the other kit rows): `hp% OP N`, `res`, `pips:soul`, `stacks:` / `remaining:` of own statuses,
 * `target.remaining:` of target statuses. The last line is the weapon chain (`demonhunter_basic` / `demonhunter_void_basic`), no condition.
 * Transformed buttons share the slot of the base button (Yok Ediş = Kaos Darbesi's slot, Ölüm Süpürmesi = Bıçak Dansı's, Ruh Bombası = Ruh
 * Yarma's, Boşluk Fırtınası = Boşluk Işını's), so the base id in a line presses whichever form is up.
 */
import type { KitApl } from './rotations_kit_rogue';

export const ROTATIONS_KIT_DEMONHUNTER: Record<string, KitApl> = {
  demonhunter_chaos: {
    st: [
      'demonhunter_the_hunt if cd_ready(demonhunter_the_hunt)',
      'demonhunter_essence_break if cd_ready(demonhunter_essence_break) && res >= 18',
      'demonhunter_metamorphosis if cd_ready(demonhunter_metamorphosis) && (cd_ready(demonhunter_eye_beam) || cd(demonhunter_eye_beam) <= 3)',
      'demonhunter_vengeful_retreat if cd_ready(demonhunter_vengeful_retreat) && cd(demonhunter_eye_beam) <= 1',
      'demonhunter_eye_beam if cd_ready(demonhunter_eye_beam) && res >= 15',
      'demonhunter_blade_dance if cd_ready(demonhunter_blade_dance) && res >= 18',
      'demonhunter_immolation_aura if charges(demonhunter_immolation_aura) >= 2 || res <= 70',
      'demonhunter_chaos_strike if res >= 20',
      'demonhunter_blur if hp% < 50',
      'demonhunter_basic',
    ],
    aoe: [
      'demonhunter_chaos_nova if cd_ready(demonhunter_chaos_nova) && targets >= 3',
      'demonhunter_the_hunt if cd_ready(demonhunter_the_hunt)',
      'demonhunter_immolation_aura if charges(demonhunter_immolation_aura) >= 1',
      'demonhunter_blade_dance if cd_ready(demonhunter_blade_dance) && targets >= 3',
      'demonhunter_essence_break if cd_ready(demonhunter_essence_break)',
      'demonhunter_eye_beam if cd_ready(demonhunter_eye_beam) && res >= 15',
      'demonhunter_metamorphosis if cd_ready(demonhunter_metamorphosis) && !cd_ready(demonhunter_eye_beam)',
      'demonhunter_chaos_strike if res >= 20',
      'demonhunter_basic',
    ],
  },
  demonhunter_vengeance: {
    st: [
      'demonhunter_fiery_brand if charges(demonhunter_fiery_brand) >= 2 || (charges(demonhunter_fiery_brand) >= 1 && !status:demon_spikes)',
      'demonhunter_sigil_of_flame if cd_ready(demonhunter_sigil_of_flame)',
      'demonhunter_demon_spikes if !status:demon_spikes && charges(demonhunter_demon_spikes) >= 1',
      'demonhunter_metamorphosis if hp% < 40 || (cd_ready(demonhunter_metamorphosis) && status:demon_spikes)',
      'demonhunter_fel_devastation if cd_ready(demonhunter_fel_devastation) && res >= 30 && target.remaining:fiery_brand >= 2',
      'demonhunter_soul_carver if cd_ready(demonhunter_soul_carver) && target.remaining:fiery_brand >= 3',
      'demonhunter_soul_cleave if status:soul_overflow && res >= 25',
      'demonhunter_fracture if charges(demonhunter_fracture) >= 1',
      'demonhunter_immolation_aura if charges(demonhunter_immolation_aura) >= 2 || res <= 40',
      'demonhunter_soul_cleave if res >= 22',
      'demonhunter_basic',
    ],
    aoe: [
      'demonhunter_sigil_of_flame if cd_ready(demonhunter_sigil_of_flame) && targets >= 2',
      'demonhunter_immolation_aura if charges(demonhunter_immolation_aura) >= 1',
      'demonhunter_demon_spikes if !status:demon_spikes && charges(demonhunter_demon_spikes) >= 1',
      'demonhunter_soul_cleave if status:soul_overflow && res >= 25',
      'demonhunter_fel_devastation if cd_ready(demonhunter_fel_devastation) && res >= 30',
      'demonhunter_fracture if charges(demonhunter_fracture) >= 1',
      'demonhunter_soul_cleave if res >= 22',
      'demonhunter_basic',
    ],
  },
  demonhunter_devourer: {
    st: [
      'demonhunter_the_hunt if cd_ready(demonhunter_the_hunt)',
      'demonhunter_void_metamorphosis if pips:soul >= 4 && !status:void_meta',
      'demonhunter_collapsing_star if status:void_meta && res >= 35',
      'demonhunter_reap if status:void_meta && pips:soul >= 3',
      'demonhunter_void_ray if res >= 20',
      'demonhunter_reap if pips:soul >= 6',
      'demonhunter_void_nova if cd_ready(demonhunter_void_nova)',
      'demonhunter_consume',
      'demonhunter_void_basic',
    ],
    aoe: [
      'demonhunter_the_hunt if cd_ready(demonhunter_the_hunt)',
      'demonhunter_void_nova if cd_ready(demonhunter_void_nova)',
      'demonhunter_void_metamorphosis if pips:soul >= 4 && !status:void_meta',
      'demonhunter_collapsing_star if status:void_meta && res >= 35',
      'demonhunter_reap if pips:soul >= 4',
      'demonhunter_void_ray if res >= 20',
      'demonhunter_consume',
      'demonhunter_void_basic',
    ],
  },
};
