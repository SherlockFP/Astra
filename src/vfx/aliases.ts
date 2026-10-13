/**
 * GDD_CLASSES_V2 §11.1 (NC03): alias table for the class VFX ids until their real presets exist.
 * VFX.spawn resolves: registered preset -> this table (one or more existing presets, with the alias numbers) -> nothing.
 * Caller opts win over the alias where both are given (colour); scale multiplies (caller scale × alias scale).
 * OWNER: vfx-audio. Every `id` here must be an existing preset id (VFX_IDS minus the new ones); the compiler checks it.
 */
import type { VfxId } from '../types/vfx';

/** One preset to play for an alias. `duration` (s) is used only when the caller gives none. */
export interface VfxAliasPart {
  id: VfxId;
  color?: number;
  scale?: number;
  duration?: number;
}

/** Primary preset plus optional extra layers played at the same spot. `yOffset` (m) moves every layer up / down. */
export interface VfxAlias extends VfxAliasPart {
  extra?: VfxAliasPart[];
  yOffset?: number;
}

export const VFX_ALIASES: Record<string, VfxAlias> = {
  fist_trail: { id: 'slash_arc', scale: 0.5, color: 0xfff0c8 },
  kick_arc: { id: 'slash_arc_big', scale: 0.7, yOffset: -0.55, color: 0xffe9a0 },
  palm_shock: { id: 'shockwave', scale: 0.45, extra: [{ id: 'hit_spark' }] },
  chi_burst: { id: 'hit_magic', scale: 1.3, color: 0x5de0a8 },
  chi_projectile: { id: 'arcane_projectile', color: 0x5de0a8 },
  dragon_trail: { id: 'charge_trail', color: 0x5de0a8, scale: 1.2 },
  brew_splash: { id: 'poison_burst', color: 0xd9a441, scale: 0.8 },
  arrow_trail: { id: 'haste_trail', color: 0xffffff, scale: 0.4 },
  arrow_rain: { id: 'blizzard', color: 0xd0c090 },
  trap_ring: { id: 'ground_slam', scale: 0.3, color: 0xc8a060 },
  trap_snap: { id: 'hit_spark', scale: 1.4, extra: [{ id: 'ground_slam', scale: 0.4 }] },
  mark_loop: { id: 'curse_loop', color: 0xff4040, scale: 0.7 },
  pet_summon: { id: 'death_poof', color: 0xa0c070, extra: [{ id: 'respawn', scale: 0.6 }] },
  holy_slash: { id: 'slash_arc', color: 0xffe9a0 },
  judgement_pillar: { id: 'holy_burst', scale: 1.4, extra: [{ id: 'loot_beam', color: 0xffe9a0, duration: 0.8 }] },
  holy_hammer: { id: 'holy_projectile', scale: 1.5 },
  aura_ring: { id: 'buff_aura', color: 0xffe9a0 },
  holy_ground: { id: 'holy_burst' },
  holy_beam: { id: 'chain_lightning', color: 0xffe9a0 },
  wings_aura: { id: 'buff_aura', scale: 1.5, color: 0xfff0c0 },
  heal_pillar: { id: 'heal_burst', scale: 1.6, extra: [{ id: 'loot_beam', color: 0x5aff7a }] },
  bone_burst: { id: 'hit_spark', color: 0xe8e0c8, extra: [{ id: 'death_bones' }] },
  corpse_explosion: { id: 'poison_burst', scale: 1.3, color: 0x8fbf6a, extra: [{ id: 'death_bones' }] },
  grave_rise: { id: 'death_poof', color: 0x6fe3b0 },
  soul_wisp: { id: 'ambient_shadow_wisps', color: 0x6fe3b0 },
  bone_prison: { id: 'ground_slam', scale: 0.8, color: 0xe8e0c8, extra: [{ id: 'death_bones' }] },
  drain_beam: { id: 'chain_lightning', color: 0xb06bff },
  curse_ring: { id: 'shadow_ground' },
  death_nova: { id: 'shockwave', color: 0x6fe3b0 },
  bone_armor: { id: 'buff_aura', color: 0xe8e0c8 },
  bone_storm: { id: 'spin_slash', color: 0xe8e0c8 },
  corruption_loop: { id: 'curse_loop', color: 0xa020a0 },
  agony_loop: { id: 'shock_loop', color: 0x8040c0 },
  fire_rain: { id: 'fire_ground', extra: [{ id: 'meteor_fall', scale: 0.4 }] },
  demon_portal: { id: 'portal_swirl', color: 0xc02040, scale: 0.6 },
  fel_aura: { id: 'enrage_aura', color: 0xb06bff },
  soul_orb: { id: 'gold_sparkle', color: 0xb06bff },
  unstable_burst: { id: 'shadow_burst', scale: 1.2 },
  infernal_fall: { id: 'meteor_fall', scale: 1.4, color: 0xff4020 },
  // ---- combat-feel and item / talent ids that have no own preset yet (layers of existing presets; caller colour wins)
  zeal_aura: { id: 'buff_aura', color: 0xffd24a, scale: 1.1 },
  wings_gold: { id: 'buff_aura', scale: 1.3, color: 0xffe08a, yOffset: 0.6 },
  hero_wave: { id: 'shockwave', color: 0xffd060, scale: 1.2, extra: [{ id: 'hit_spark', color: 0xffe9a0, scale: 1.4 }] },
  bloodbath_burst: { id: 'hit_blood', scale: 1.4, color: 0xc0101a, extra: [{ id: 'crit_burst', color: 0xff3030, scale: 0.8 }] },
  carnage_aura: { id: 'enrage_aura', color: 0xd01818, scale: 1.2 },
  icy_veins_aura: { id: 'buff_aura', color: 0x9fe6ff, scale: 1.1, extra: [{ id: 'frost_ground', scale: 0.6 }] },
  combustion_aura: { id: 'enrage_aura', color: 0xff7a20, scale: 1.1 },
  clarity_halo: { id: 'buff_aura', color: 0x7fb4ff, scale: 1.2 },
  dawn_pillars: { id: 'holy_burst', scale: 1.3, extra: [{ id: 'loot_beam', color: 0xfff0c0, duration: 1.0 }, { id: 'loot_beam', color: 0xffe08a, duration: 1.0 }] },
  blades_shadow: { id: 'shadow_burst', scale: 1.0, extra: [{ id: 'spin_slash', color: 0x6a3ab0, scale: 0.8 }] },
  shadow_dance_smoke: { id: 'stealth_smoke', color: 0x3a3150, scale: 1.1 },
  elixir_rain: { id: 'poison_cloud', color: 0xffd060, scale: 0.8, extra: [{ id: 'heal_burst', color: 0xffe08a, scale: 0.7 }] },
  brew_cauldron: { id: 'poison_loop', color: 0x9fff6a, scale: 1.0, extra: [{ id: 'burn_loop', color: 0xffa040, scale: 0.6 }] },
  // GDD_TALENTS §4.3 shape verbs (shape_split / orbit / return / echo / pull) have real presets in presets_combat.ts.
  blazing_barrier: { id: 'shield_bubble', color: 0xff7a30, scale: 1.1, extra: [{ id: 'fire_ground', scale: 0.5 }] },
  aegis_ring: { id: 'buff_aura', color: 0x9fe0ff, scale: 1.3 },
  aegis_dome: { id: 'bastion_dome', color: 0x9fe0ff, scale: 1.2 },
  set_aura: { id: 'buff_aura', scale: 1.0 },
  forge_announce: { id: 'upgrade_success', scale: 1.2, extra: [{ id: 'loot_beam', color: 0xffc040, duration: 1.4 }] },
  forge_announce_rainbow: { id: 'upgrade_success', scale: 1.3, color: 0xff80ff, extra: [{ id: 'loot_beam', color: 0x80e0ff, duration: 1.6 }, { id: 'loot_beam', color: 0xffe080, duration: 1.6 }] },
  camp_light: { id: 'brazier_fire', scale: 1.2 },
  camp_smoke: { id: 'stealth_smoke', color: 0x9a9080, scale: 0.7 },
  // COMBAT_WOW §4.3 CW-01 placeholders (CW-15 implements the real presets; no spawn caller yet): closest existing presets.
  proc_burst: { id: 'fire_burst', scale: 1.0, extra: [{ id: 'buff_aura', color: 0xff9a3c, scale: 0.8 }] },
  proc_consume: { id: 'hit_magic', color: 0xffb347, scale: 0.9 },
  cast_hands_fire: { id: 'fire_burst', scale: 0.35 },
  cast_hands_frost: { id: 'frost_burst', scale: 0.35 },
  cast_hands_arcane: { id: 'arcane_burst', scale: 0.35 },
  arcane_charge_orb: { id: 'arcane_burst', scale: 0.25 },
  crit_ring: { id: 'shockwave', color: 0xffd23a, scale: 0.6 },
  lockout_flash: { id: 'hit_magic', color: 0xb0c4ff, scale: 0.7 },
};

/** Alias entry for a VFX id, or undefined. Never throws (unknown ids are silently nothing). */
export function resolveVfxAlias(id: string): VfxAlias | undefined {
  return Object.prototype.hasOwnProperty.call(VFX_ALIASES, id) ? VFX_ALIASES[id] : undefined;
}
