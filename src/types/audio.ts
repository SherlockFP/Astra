/**
 * Named sound ids. Owned by the audio module (audio/Audio.ts maps every id to one or more files and
 * picks a random variant). The audio owner may ADD ids; never rename/remove.
 */
export const SFX_IDS = [
  // combat
  'swing_light', 'swing_heavy', 'hit_flesh', 'hit_metal', 'hit_bone', 'hit_crit', 'block', 'dodge', 'whoosh',
  'bow_shot', 'crossbow_shot', 'dagger_throw', 'shield_bash', 'ground_slam', 'war_cry',
  'spell_cast', 'fire_cast', 'fire_impact', 'frost_cast', 'frost_impact', 'lightning_cast', 'lightning_impact',
  'shadow_cast', 'shadow_impact', 'poison_impact', 'heal', 'buff', 'blink', 'explosion',
  'player_hurt', 'player_death', 'enemy_death', 'skeleton_death', 'enemy_aggro', 'boss_roar', 'boss_cast', 'boss_death',
  'footstep_stone', 'footstep_dirt', 'jump', 'land',
  // loot & items
  'gold_pickup', 'item_pickup', 'loot_drop', 'loot_drop_rare', 'loot_drop_epic', 'loot_drop_legendary',
  'potion_drink', 'equip', 'unequip', 'upgrade_success', 'upgrade_fail', 'upgrade_destroy', 'sell', 'buy',
  'chest_open', 'door_open', 'portal_enter',
  // ui
  'ui_click', 'ui_hover', 'ui_open', 'ui_close', 'ui_error', 'ui_tab', 'ui_drag', 'ui_drop',
  'level_up', 'quest_complete', 'achievement', 'keystone_insert', 'keystone_upgrade', 'keystone_deplete',
  'mplus_start', 'mplus_complete', 'mplus_fail', 'countdown_tick', 'ready_check', 'party_join', 'party_leave', 'chat',
  // ---- audio module additions (append-only): world / enemy / ui extras, then class voice barks
  'enemy_hurt', 'enemy_aggro_beast', 'enemy_aggro_ghost', 'enemy_aggro_slime', 'enemy_aggro_spider', 'enemy_aggro_brute',
  'enemy_aggro_demon', 'enemy_idle', 'enemy_spit', 'hit_armor_plate', 'hit_blunt', 'weapon_draw', 'footstep_wood',
  'footstep_grass', 'footstep_snow', 'footstep_carpet', 'door_close', 'gate_heavy', 'chest_locked', 'barrel_break',
  'pot_break', 'rubble', 'lever', 'trap_trigger', 'blacksmith_hammer', 'efsun_reroll', 'efsun_reveal', 'passive_allocate',
  'passive_refund', 'skill_unlock', 'vault_open', 'reward_coin', 'enemy_forces_complete', 'timer_warning', 'affix_proc',
  'boss_phase', 'boss_pull', 'player_revive', 'life_leech', 'stun', 'ui_confirm', 'ui_back', 'ui_page_flip', 'ui_menu_button',
  'ui_notify', 'room_join', 'heal_big', 'water_impact', 'enemy_death_slime', 'enemy_death_ghost', 'enemy_death_beast',
  'enemy_death_brute', 'enemy_death_bug', 'enemy_death_demon',
  // voices: warrior (knight/barbarian/rogue), mage, orc (orc/goblin/brute enemies). voice_<pack>_<key>
  'voice_warrior_attack', 'voice_warrior_light', 'voice_warrior_heavy', 'voice_warrior_crit', 'voice_warrior_hurt',
  'voice_warrior_death', 'voice_warrior_hup', 'voice_warrior_hut', 'voice_warrior_defend', 'voice_warrior_bleed',
  'voice_warrior_fire', 'voice_warrior_poison', 'voice_warrior_angry', 'voice_warrior_laugh', 'voice_warrior_yes',
  'voice_warrior_no', 'voice_warrior_thanks', 'voice_mage_attack', 'voice_mage_light', 'voice_mage_heavy', 'voice_mage_crit',
  'voice_mage_hurt', 'voice_mage_death', 'voice_mage_hup', 'voice_mage_hut', 'voice_mage_defend', 'voice_mage_bleed',
  'voice_mage_fire', 'voice_mage_poison', 'voice_mage_angry', 'voice_mage_laugh', 'voice_mage_yes', 'voice_mage_no',
  'voice_mage_thanks', 'voice_orc_attack', 'voice_orc_light', 'voice_orc_heavy', 'voice_orc_crit', 'voice_orc_hurt',
  'voice_orc_death', 'voice_orc_hup', 'voice_orc_hut', 'voice_orc_defend', 'voice_orc_bleed', 'voice_orc_fire',
  'voice_orc_poison', 'voice_orc_angry', 'voice_orc_laugh', 'voice_orc_yes', 'voice_orc_no', 'voice_orc_thanks',
  'voice_warrior_hello', 'voice_warrior_bye', 'voice_warrior_welcome', 'voice_mage_hello', 'voice_mage_bye',
  'voice_mage_welcome', 'voice_mage_spell_cast', 'voice_mage_spell_fire', 'voice_mage_spell_freeze',
  'voice_mage_spell_thunder', 'voice_mage_spell_haste', 'voice_mage_spell_shield', 'voice_mage_spell_blizzard',
  'voice_mage_spell_summon', 'voice_mage_spell_protect', 'voice_mage_spell_blind', 'voice_mage_spell_sleep',
  // ---- GDD_V2 (WP1 contracts): feel table §3.11, majors §2.2, weakness §7.3. Implemented by vfx-audio (WP6).
  'heavy_hit', 'weapon_art', 'charge_loop', 'charge_full', 'guard_hit', 'guard_break', 'parry', 'riposte', 'backstab',
  'stance_break', 'crit_finisher', 'perilous_warn', 'interrupt', 'hero_horn', 'choir_sting', 'ice_chime', 'fire_whoosh',
  'time_warp', 'choir_swell', 'whisper', 'potion_use', 'bubble_loop', 'wolf_howl', 'heartbeat_loop', 'weak_hit', 'resist_hit',
  // ---- GDD_CLASSES_V2 §11.2 (NC03, append-only): class SFX. Until audio/manifest.ts maps them, audio/aliases.ts plays the
  // existing id given there (Audio.playInternal falls back to it when SFX_MANIFEST[id] is missing). Owner: vfx-audio / audio.
  'punch_hit', 'kick_hit', 'chi_cast', 'gong', 'bow_draw', 'arrow_hit', 'trap_arm', 'trap_snap', 'wolf_bite', 'holy_cast',
  'holy_impact', 'hammer_hit', 'aura_on', 'divine_shield', 'bone_cast', 'bone_impact', 'raise_dead', 'curse_cast',
  'corpse_pop', 'fel_cast', 'fel_impact', 'drain_loop', 'demon_summon', 'imp_laugh',
  // ---- GDD_TALENTS §5.7 / T19 (append-only): talent and spec feedback. Until audio builds them, audio/aliases.ts plays the
  // target named in §5.7 (talent_take -> ui_click, talent_untake -> ui_tab, talent_apply -> ui_confirm, talent_capstone -> buff, spec_choose -> ui_tab).
  'talent_take', 'talent_untake', 'talent_apply', 'talent_capstone', 'spec_choose',
  // ---- GDD_ITEMS_V2 (IT-00, append-only): forge ceremony (§2.9), announcements (§2.10), camp (§5.1). Mapped by audio/aliases or the manifest.
  'forge_strike', 'forge_heartbeat', 'forge_ding', 'forge_crack', 'forge_shatter', 'camp_crackle', 'ann_chime',
  // ---- GDD_LIFE (L-00b, append-only): gathering, crafting and whisper sounds (§1.6, §1.11, §3.1). Mapped to existing files by L-00b.
  'chop_wood', 'mine_rock', 'pick_herb', 'skin_cut', 'tree_fall', 'craft_done', 'chat_whisper',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

// audio additions (GDD_OPENWORLD §9.1, append-only): open-world region themes. The audio module maps them onto existing tracks;
// unknown ids fail silently at runtime.
export const MUSIC_IDS = [
  'menu', 'town', 'dungeon_crypt', 'dungeon_fire', 'dungeon_frost', 'dungeon_shadow', 'boss', 'victory', 'defeat', 'combat',
  'world_vale', 'world_hills', 'world_marsh', 'world_canyon', 'world_ruins',
] as const;
export type MusicId = (typeof MUSIC_IDS)[number];

export interface PlaySfxOpts {
  pos?: [number, number, number]; // 3D positional (attenuated by distance to listener)
  volume?: number;                // 0..1 multiplier
  pitch?: number;                 // playback rate multiplier
  pitchVar?: number;              // random +/- variation
}
