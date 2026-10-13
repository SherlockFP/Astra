/**
 * KIT PK-WARLOCK APL rows (docs/kits/casters-rogue.md §10c, §11c). Lines are in the A.3 condition DSL, first match wins; `pips:shard`
 * counts display shards (fragments / 10). Consumed by CM5 (`src/data/rotations.ts`) once it reads the kit tables. OWNER: combat (data).
 */
export interface KitApl { st: string[]; aoe?: string[] }

export const ROTATIONS_KIT_WARLOCK: Record<string, KitApl> = {
  warlock_affliction: {
    st: [
      'warlock_haunt if cd_ready(warlock_haunt) && (!target.status:haunt || target.remaining:haunt < 3)',
      'warlock_agony if !target.status:agony || dot_refresh:agony',
      'warlock_corruption if !target.status:corruption || dot_refresh:corruption',
      'warlock_summon_darkglare if cd_ready(warlock_summon_darkglare) && target.status:agony && target.status:corruption',
      'warlock_malevolence if cd_ready(warlock_malevolence) && pips:shard >= 2',
      'warlock_unstable_affliction if pips:shard >= 1 && (pips:shard >= 4 || status:malevolence || status:darkglare_active || !target.status:unstable_affliction)',
      'warlock_shadow_bolt',
      'warlock_basic',
    ],
    aoe: [
      'warlock_haunt if cd_ready(warlock_haunt) && !target.status:haunt',
      'warlock_agony @each if !target.status:agony',
      'warlock_summon_darkglare if cd_ready(warlock_summon_darkglare)',
      'warlock_seed_of_corruption if pips:shard >= 1 && targets >= 3',
      'warlock_malevolence if cd_ready(warlock_malevolence)',
      'warlock_corruption @each if !target.status:corruption && !target.status:seed',
      'warlock_shadow_bolt',
      'warlock_basic',
    ],
  },
  warlock_destruction: {
    st: [
      'warlock_summon_infernal if cd_ready(warlock_summon_infernal)',
      'warlock_malevolence if cd_ready(warlock_malevolence) && pips:shard >= 3',
      'warlock_immolate if !target.status:immolate || dot_refresh:immolate',
      'warlock_shadowburn if status:exec_window || status:fiendish_cruelty',
      'warlock_chaos_bolt if pips:shard >= 4 || (status:malevolence && pips:shard >= 2)',
      'warlock_conflagrate if charges >= 2 || (charges >= 1 && !status:backdraft)',
      'warlock_chaos_bolt if pips:shard >= 2 && status:backdraft',
      'warlock_incinerate',
      'warlock_basic',
    ],
    aoe: [
      'warlock_summon_infernal if cd_ready(warlock_summon_infernal)',
      'warlock_malevolence if cd_ready(warlock_malevolence)',
      'warlock_immolate @each if !target.status:immolate',
      'warlock_rain_of_fire if pips:shard >= 3 && targets >= 3',
      'warlock_conflagrate if charges >= 1',
      'warlock_incinerate',
      'warlock_basic',
    ],
  },
};
