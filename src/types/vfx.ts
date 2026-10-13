/**
 * Named VFX presets. Owned by the VFX module (vfx/VFX.ts must implement EVERY id here).
 * Other modules only reference ids from this list. The VFX owner may ADD ids; never rename/remove.
 */
export const VFX_IDS = [
  // generic combat
  'hit_spark', 'hit_blood', 'hit_magic', 'crit_burst', 'block_spark', 'dodge_dust', 'death_poof', 'death_bones',
  'slash_arc', 'slash_arc_big', 'spin_slash', 'ground_slam', 'shockwave', 'charge_trail', 'leap_land',
  // elemental
  'fire_burst', 'fire_projectile', 'fire_ground', 'meteor_fall', 'burn_loop',
  'frost_burst', 'frost_projectile', 'frost_nova', 'frost_ground', 'freeze_loop', 'blizzard',
  'lightning_strike', 'lightning_projectile', 'chain_lightning', 'shock_loop',
  'shadow_burst', 'shadow_projectile', 'shadow_ground', 'curse_loop',
  'poison_burst', 'poison_projectile', 'poison_cloud', 'poison_loop',
  'holy_burst', 'holy_projectile', 'heal_burst', 'heal_loop',
  'arcane_projectile', 'arcane_burst', 'blink',
  // physical projectiles
  'arrow_projectile', 'bolt_projectile', 'dagger_projectile', 'bone_projectile', 'rock_projectile',
  // buffs / states
  'buff_aura', 'enrage_aura', 'shield_bubble', 'stun_stars', 'stealth_smoke', 'haste_trail', 'war_cry',
  'level_up', 'potion_drink', 'respawn',
  // world / loot
  'loot_beam', 'gold_sparkle', 'chest_open', 'portal_swirl', 'torch_fire', 'brazier_fire', 'candle_flame',
  'ambient_dust', 'ambient_embers', 'ambient_snow', 'ambient_shadow_wisps', 'waypoint_glow',
  'upgrade_success', 'upgrade_fail', 'keystone_insert', 'keystone_upgrade',
  // enemy / boss / affix
  'enemy_cast_glow', 'boss_enrage', 'boss_spawn', 'add_spawn', 'telegraph_flash',
  'bolster_burst', 'sanguine_pool', 'bursting_pop', 'explosive_orb', 'explosive_orb_pop', 'volcanic_plume',
  'quaking_ring', 'necrotic_hit', 'spiteful_shade', 'storm_tornado', 'inspiring_aura',
  // ---- vfx module additions (append-only)
  // zone-sized smoke cloud (Duman Bombası): base radius 3 m x `scale` (= radius / 3), lasts `duration` (default 5 s)
  'smoke_zone',
  // ---- GDD_V2 (WP1 contracts): feel table §3.11, weapon arts §3.8, majors §2.2, weakness §7.3. Implemented by vfx-audio (WP6).
  'heavy_hit_burst', 'charge_glow', 'charge_ring', 'run_slash_trail', 'guard_spark', 'guard_break_shards', 'parry_flash',
  'riposte_trail', 'backstab_mark', 'stance_break_shards', 'crit_finisher_slash', 'perilous_mark', 'interrupt_burst',
  'weapon_art_wa_rising_blade', 'weapon_art_wa_earthbreaker', 'weapon_art_wa_crushing_blow', 'weapon_art_wa_starfall_beam',
  'weapon_art_wa_twin_bolts', 'weapon_art_wa_flurry', 'weapon_art_wa_piercing_bolt', 'weapon_art_wa_dawn_wave', 'weapon_art_wa_twin_vials',
  'bastion_dome', 'aegis_ring', 'aegis_dome', 'zeal_aura', 'wings_gold', 'hero_wave', 'bloodbath_burst', 'carnage_aura',
  'icy_veins_aura', 'combustion_aura', 'clarity_halo', 'dawn_pillars', 'blades_shadow', 'shadow_dance_smoke', 'elixir_rain',
  'brew_cauldron', 'weak_spark',
  // ---- GDD_CLASSES_V2 §11.1 (NC03, append-only): class VFX. Until a real preset exists, vfx/aliases.ts maps each id to an
  // existing preset (VFX.spawn resolves preset -> alias -> nothing). Implemented by vfx-audio (NC55–NC57).
  'fist_trail', 'kick_arc', 'palm_shock', 'chi_burst', 'chi_projectile', 'dragon_trail', 'brew_splash', 'arrow_trail',
  'arrow_rain', 'trap_ring', 'trap_snap', 'mark_loop', 'pet_summon', 'holy_slash', 'judgement_pillar', 'holy_hammer',
  'aura_ring', 'holy_ground', 'holy_beam', 'wings_aura', 'heal_pillar', 'bone_burst', 'corpse_explosion', 'grave_rise',
  'soul_wisp', 'bone_prison', 'drain_beam', 'curse_ring', 'death_nova', 'bone_armor', 'bone_storm', 'corruption_loop',
  'agony_loop', 'fire_rain', 'demon_portal', 'fel_aura', 'soul_orb', 'unstable_burst', 'infernal_fall',
  // ---- GDD_TALENTS §7.2 T0 / T19 (append-only): skill-shape verbs (§4.3) and the Alev Bariyeri barrier. vfx-audio implements them
  // (small trails / rings from existing sprites); until then vfx/aliases.ts maps them to the closest preset.
  'shape_split', 'shape_orbit', 'shape_return', 'shape_echo', 'shape_pull', 'blazing_barrier',
  // ---- GDD_ITEMS_V2 (IT-00, append-only): armor set aura (§1.5), forge announcements (§2.10), camp (§5.1). Implemented by vfx-audio.
  'set_aura', 'forge_announce', 'forge_announce_rainbow', 'camp_light', 'camp_smoke',
  // ---- GDD_LIFE (L-00b ids, append-only): gather strikes and chips (§1.6). Implemented by vfx-audio (L-00b); unknown ids stay silent.
  'wood_chips', 'rock_chips', 'leaf_burst', 'gather_sparkle',
  // ---- COMBAT_WOW §4.3 CW-01 (append-only): proc gain / consume bursts, cast hands, arcane orbs, crit ring, lockout flash.
  // Implemented by vfx-audio (CW-15); until then vfx/aliases.ts maps each id to the closest existing preset.
  'proc_burst', 'proc_consume', 'cast_hands_fire', 'cast_hands_frost', 'cast_hands_arcane', 'arcane_charge_orb', 'crit_ring',
  'lockout_flash',
] as const;

export type VfxId = (typeof VFX_IDS)[number];

/** Ground telegraph shapes (boss/enemy mechanics, ground-targeted skills preview). */
export type TelegraphShape =
  | { type: 'circle'; radius: number }
  | { type: 'ring'; inner: number; outer: number }
  | { type: 'cone'; radius: number; angle: number }    // angle in degrees, centered on dir
  | { type: 'line'; length: number; width: number }    // from origin along dir
  | { type: 'rect'; width: number; length: number };   // centered on origin

export type TelegraphKind = 'danger' | 'soak' | 'safe' | 'friendly';

export interface SpawnVfxOpts {
  dir?: [number, number, number];
  color?: number;               // hex override
  scale?: number;
  duration?: number;            // seconds (loops stop after this)
  follow?: import('three').Object3D; // attach & follow
  target?: [number, number, number]; // for beams/chains
  seed?: number;
}

/** COMBAT_WOW §4.3 CW-01 (append-only): `absorb` shield soak, `resist`, `miss`, `interrupt`, `mana` (mana gain numbers). */
export type DamageNumberKind = 'normal' | 'crit' | 'heal' | 'player_hurt' | 'dot' | 'immune' | 'dodge' | 'block' | 'xp' | 'gold'
  | 'absorb' | 'resist' | 'miss' | 'interrupt' | 'mana';
