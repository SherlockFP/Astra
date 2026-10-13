/**
 * GDD_CLASSES_V2 §11.2 (NC03): alias table for the class SFX ids until audio/manifest.ts maps their files (§9.2).
 * Audio.playInternal: when SFX_MANIFEST[id] is missing it plays the alias target with the alias pitch / volume
 * (multiplied with the caller's). Unknown ids still warn once and stay silent.
 * OWNER: vfx-audio / audio. Every `id` here must be an existing SFX_IDS member that has a manifest entry.
 */
import type { SfxId } from '../types/audio';
import { SFX_MANIFEST } from './manifest';

export interface SfxAlias {
  id: SfxId;
  pitch?: number;
  volume?: number;
}

export const SFX_ALIASES: Record<string, SfxAlias> = {
  punch_hit: { id: 'hit_flesh', pitch: 1.2 },
  kick_hit: { id: 'hit_blunt' },
  chi_cast: { id: 'spell_cast', pitch: 1.3 },
  gong: { id: 'block', pitch: 0.5 },
  bow_draw: { id: 'weapon_draw', pitch: 1.4 },
  arrow_hit: { id: 'hit_flesh', pitch: 1.3 },
  trap_arm: { id: 'lever' },
  trap_snap: { id: 'trap_trigger' },
  wolf_bite: { id: 'hit_flesh', pitch: 0.9 },
  holy_cast: { id: 'heal' },
  holy_impact: { id: 'spell_cast', pitch: 1.5 },
  hammer_hit: { id: 'ground_slam' },
  aura_on: { id: 'buff' },
  divine_shield: { id: 'buff', pitch: 0.7 },
  bone_cast: { id: 'shadow_cast' },
  bone_impact: { id: 'hit_bone' },
  raise_dead: { id: 'enemy_aggro_ghost', pitch: 0.8 },
  curse_cast: { id: 'shadow_cast', pitch: 0.8 },
  corpse_pop: { id: 'explosion', pitch: 1.2 },
  fel_cast: { id: 'shadow_cast', pitch: 0.9 },
  fel_impact: { id: 'shadow_impact' },
  drain_loop: { id: 'life_leech' },
  demon_summon: { id: 'enemy_aggro_demon' },
  imp_laugh: { id: 'voice_orc_laugh', pitch: 1.6 },
  // ---- talent / spec feedback (GDD_TALENTS §5.7) and item / gather ids that reuse an existing sound
  talent_take: { id: 'ui_click' },
  talent_untake: { id: 'ui_tab' },
  talent_apply: { id: 'ui_confirm' },
  talent_capstone: { id: 'buff' },
  spec_choose: { id: 'ui_tab' },
  potion_use: { id: 'potion_drink' },
  forge_strike: { id: 'blacksmith_hammer' },
  forge_heartbeat: { id: 'countdown_tick', pitch: 0.6, volume: 0.6 },
  forge_ding: { id: 'upgrade_success', pitch: 1.3 },
  forge_crack: { id: 'upgrade_fail', pitch: 1.2 },
  forge_shatter: { id: 'upgrade_destroy' },
  ann_chime: { id: 'ui_notify', pitch: 1.15 },
};

/** Alias entry for an SFX id, or undefined. Never throws. */
export function resolveSfxAlias(id: string): SfxAlias | undefined {
  return Object.prototype.hasOwnProperty.call(SFX_ALIASES, id) ? SFX_ALIASES[id] : undefined;
}

/** True when play(id) makes a sound: a manifest entry, or an alias whose target has one. Never throws (dev-page check). */
export function sfxResolves(id: string): boolean {
  if (SFX_MANIFEST[id]) return true;
  const alias = resolveSfxAlias(id);
  return !!alias && !!SFX_MANIFEST[alias.id];
}
