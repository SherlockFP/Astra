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
  // ---- K3 / P-06 season dungeon visuals: alias targets from the season docs where they name one, otherwise the closest preset.
  ambient_stardust: { id: 'ambient_dust', color: 0xc8d8ff },
  arcane_orb: { id: 'arcane_projectile', scale: 0.8 },
  void_torrent: { id: 'lightning_strike', color: 0x7a3cff, scale: 1.2 },
  dome_suppress: { id: 'aegis_dome', color: 0x6a3ab0 },
  web_burst: { id: 'smoke_zone', color: 0xe8e8e0, scale: 0.9 },
  egg_burst: { id: 'add_spawn', color: 0xc8e0a0, scale: 1.1 },
  swarm_cloud: { id: 'poison_cloud', color: 0x7a8a40 },
  black_blood: { id: 'shadow_ground', color: 0x1a0c12 },
  static_field: { id: 'shock_loop', color: 0xeaf2ff, scale: 0.9 },
  storm_flash: { id: 'lightning_strike', color: 0xeaf2ff, scale: 1.2 },
  ambient_leaves: { id: 'ambient_embers', color: 0xffc080 },
  rune_pad_glow: { id: 'arcane_burst', color: 0x7fd0ff, scale: 0.5 },
  ambient_anima_motes: { id: 'ambient_embers', color: 0x60ffd8 },
  ambient_mist: { id: 'ambient_dust', scale: 3 },
  pollen_cloud: { id: 'poison_cloud', color: 0xffd060 },
  anima_glob: { id: 'poison_projectile', color: 0x60ffd8 },
  sigil_pulse: { id: 'buff_aura', color: 0x60ffd8 },
  consumption_swirl: { id: 'portal_swirl', color: 0x60c8ff },
  acid_pool: { id: 'poison_cloud', color: 0x9fff40, scale: 0.9 },
  // ---- KIT PK-0 (docs/kits/casters-rogue.md §g): kit presets until their preset files implement them (presets_kit_*.ts).
  arcane_missile: { id: 'arcane_projectile', scale: 1.1 },
  arcane_missile_hit: { id: 'arcane_burst', scale: 0.5 },
  prismatic_bolt: { id: 'arcane_projectile', color: 0xff80ff, scale: 1.2 },
  glacial_spike: { id: 'frost_projectile', scale: 1.4 },
  shatter_burst: { id: 'frost_burst', color: 0xd8f4ff, scale: 1.2 },
  shadowstep_streak: { id: 'blink', color: 0x6a3ab0 },
  secret_clones: { id: 'shadow_ground', color: 0x9a7ad0, scale: 0.8 },
  link_tether: { id: 'haste_trail', color: 0x9fd840, scale: 0.6 },
  darkglare_eye: { id: 'curse_loop', color: 0x9a4cff, scale: 0.9 },
  // ---- PM-00a (docs/kits/plate-melee.md §g 'New VFX ids'): plate-melee kit presets, alias targets until real presets exist.
  colossus_smash: { id: 'shockwave', color: 0xffd070, extra: [{ id: 'ground_slam' }] },
  blood_burst: { id: 'death_nova', color: 0xaa1830 },
  hammer_of_light: { id: 'holy_hammer', scale: 2.5, extra: [{ id: 'holy_burst', scale: 1.2 }] },
  wake_of_ashes: { id: 'holy_burst', scale: 2.0, extra: [{ id: 'fire_burst', color: 0xffd070 }] },
  divine_toll: { id: 'aura_ring', scale: 2.5, extra: [{ id: 'holy_beam' }, { id: 'holy_beam' }, { id: 'holy_beam' }, { id: 'holy_beam' }, { id: 'holy_beam' }] },
  ancestral_beam: { id: 'spin_slash', extra: [{ id: 'heal_loop' }, { id: 'shockwave' }] },
  ancestor_bear: { id: 'enrage_aura', scale: 1.5, extra: [{ id: 'carnage_aura' }] },
  ancient_guardian: { id: 'shield_bubble', color: 0xffe9a0, extra: [{ id: 'wings_aura' }] },
  dawn_dome: { id: 'aura_ring', scale: 3, extra: [{ id: 'heal_burst' }] },
  // ---- AE-0 (docs/kits/agile-evoker.md §g.3): İblis Avcısı / Ejderhasoy presets, alias targets until real presets exist.
  empower_charge: { id: 'charge_ring', scale: 1.1, extra: [{ id: 'buff_aura', scale: 0.5 }] },
  dragon_breath_cone: { id: 'fire_burst', scale: 2.4, extra: [{ id: 'burn_loop', scale: 1.4 }] },
  essence_beam: { id: 'chain_lightning', color: 0x7fe3c4, scale: 1.2 },
  glaive_trail: { id: 'slash_arc', color: 0xb06bff },
  fel_wings: { id: 'wings_aura', color: 0x9cff4a },
  soul_fragment_orb: { id: 'soul_orb', scale: 0.5 },
  sigil_ground: { id: 'fire_ground', color: 0xff7a30, extra: [{ id: 'ground_slam', scale: 0.3 }] },
  ebon_wings: { id: 'wings_gold', color: 0x9cd070 },
  prescience_rune: { id: 'chain_lightning', color: 0xd9a441, scale: 0.8 },
  temporal_wound: { id: 'ground_slam', color: 0xd9a441, scale: 0.35 },
  time_ripple: { id: 'buff_aura', color: 0xd9a441, extra: [{ id: 'ambient_dust', color: 0xd9a441 }] },
  void_ray: { id: 'drain_beam', color: 0xb06bff, scale: 1.2 },
  void_burst: { id: 'shadow_burst', color: 0xb06bff, extra: [{ id: 'arcane_burst', color: 0x6a3ab0, scale: 0.8 }] },
};

/** Alias entry for a VFX id, or undefined. Never throws (unknown ids are silently nothing). */
export function resolveVfxAlias(id: string): VfxAlias | undefined {
  return Object.prototype.hasOwnProperty.call(VFX_ALIASES, id) ? VFX_ALIASES[id] : undefined;
}
