/**
 * AUDIO_MIX: the calmer sound mix as plain data (no DOM, no AudioContext). Audio.ts applies these tables when it plays a sound;
 * tools/audio-audit.mjs reads the same tables for the before / after levels in docs/AUDIO_MIX.md.
 */

/** Per-id trim on top of the manifest gain (v). Ids not listed use mixTrim() (families by prefix). */
export const MIX_TRIM: Record<string, number> = {
  swing_light: 0.6, swing_heavy: 0.7, hit_crit: 0.75, crit_finisher: 0.85, level_up: 0.7, ui_hover: 0.6, whoosh: 0.7, dodge: 0.8,
  footstep_stone: 0.8, footstep_dirt: 0.8, cast_pushback: 0.8, enemy_aggro: 0.8,
};

/** Longest audible length in seconds; a longer sample is cut and faded over its last 40 ms. */
export const MAX_SEC: Record<string, number> = { hit_crit: 0.35, crit_finisher: 0.6, level_up: 1.6, swing_light: 0.4, swing_heavy: 0.6 };

/** Combat sounds. Savaş sesleri 'low' (Az) quiets them, caps each id at 2 voices and widens their gaps. */
export const COMBAT_RX = /^(hit_|swing_|block$|dodge$|whoosh$|shield_bash$|parry$|riposte$|guard_|heavy_hit$|weapon_art$|backstab$|stance_break$|crit_finisher$|weak_hit$|resist_hit$|interrupt$|cast_pushback$|ground_slam$|war_cry$|bow_shot$|crossbow_shot$|dagger_throw$)/;
export const COMBAT_LOW_GAIN = 0.6;
export const COMBAT_LOW_CAP = 2;
export const COMBAT_LOW_GAP = 1.5;

/** Trim for an id: the table entry, else the family default (hits 0.8, swings 0.6, voices 0.85), else 1. */
export function mixTrim(id: string): number {
  const t = MIX_TRIM[id];
  if (t !== undefined) return t;
  if (id.startsWith('hit_') || id.endsWith('_impact')) return 0.8;
  if (id.startsWith('swing_')) return 0.6;
  if (id.startsWith('voice_')) return 0.85;
  return 1;
}
