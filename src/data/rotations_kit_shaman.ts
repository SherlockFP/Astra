/**
 * Şaman APL rows (same shape as rotations_kit_monk.ts: first match wins, the last `st` line is the spec's basic). `pips:maelstrom`
 * counts Girdap (max 100). OWNER: shaman kit.
 */
import type { KitApl } from './rotations_kit_monk';

export const ROTATIONS_KIT_SHAMAN: Record<string, KitApl> = {
  // ---- Elementel (DPS, ranged): totems and the Stormkeeper / Ascendance majors, Flame Shock upkeep, Girdap spenders, then bolts
  shaman_elemental: {
    st: [
      'shaman_stormkeeper if cd_ready(shaman_stormkeeper)',
      'shaman_ascendance if cd_ready(shaman_ascendance) && status:stormkeeper',
      'shaman_totem_earthbind if cd_ready(shaman_totem_earthbind)',
      'shaman_totem_fire if cd_ready(shaman_totem_fire)',
      'shaman_flame_shock if !target.status:burn',
      'shaman_earth_shock if cd_ready(shaman_earth_shock) && pips:maelstrom >= 60',
      'shaman_lava_burst if cd_ready(shaman_lava_burst)',
      'shaman_chain_lightning if pips:maelstrom < 90',
      'shaman_lightning_bolt',
      'shaman_basic',
    ],
    aoe: [
      'shaman_totem_fire if cd_ready(shaman_totem_fire)',
      'shaman_chain_lightning if pips:maelstrom < 90',
      'shaman_earth_shock if cd_ready(shaman_earth_shock) && pips:maelstrom >= 60',
      'shaman_flame_shock if !target.status:burn',
      'shaman_lightning_bolt',
      'shaman_basic',
    ],
  },
  // ---- Geliştirme (DPS, melee): Doğal Öfke and the wolves on cooldown, Fırtına Vuruşu, Girdap spender at 50+, the weapon chain as the generator
  shaman_enhancement: {
    st: [
      'shaman_enh_unleash if cd_ready(shaman_enh_unleash)',
      'shaman_feral_spirit if cd_ready(shaman_feral_spirit)',
      'shaman_stormstrike if cd_ready(shaman_stormstrike)',
      'shaman_maelstrom_spender if pips:maelstrom >= 50',
      'shaman_lava_lash if cd_ready(shaman_lava_lash)',
      'shaman_crash_lightning if cd_ready(shaman_crash_lightning)',
      'shaman_enh_basic',
    ],
    aoe: [
      'shaman_crash_lightning if cd_ready(shaman_crash_lightning)',
      'shaman_maelstrom_spender if pips:maelstrom >= 50',
      'shaman_lava_lash if cd_ready(shaman_lava_lash)',
      'shaman_enh_basic',
    ],
  },
  // ---- Restorasyon (HEALER): cooldown heals first, Gel-Git on the hurt, Zincir Şifa for groups, the healer basic last
  shaman_restoration: {
    st: [
      'shaman_healing_rain if cd_ready(shaman_healing_rain) && allies.injured >= 3',
      'shaman_tide_totem if cd_ready(shaman_tide_totem) && allies.injured >= 3',
      'shaman_nature_swiftness if cd_ready(shaman_nature_swiftness) && ally.low% < 0.4',
      'shaman_riptide if cd_ready(shaman_riptide) && ally.low% < 0.9',
      'shaman_chain_heal if ally.low% < 0.6',
      'shaman_stream_totem if cd_ready(shaman_stream_totem) && allies.injured >= 2',
      'shaman_purify_spirit if allies.debuffed',
      'shaman_healing_wave if ally.low% < 0.8',
      'shaman_resto_basic',
    ],
  },
};
