/**
 * AUDIO_MIX: the calmer sound mix as plain data (no DOM, no AudioContext). Audio.ts applies these tables when it plays a sound;
 * tools/audio-audit.mjs reads the same tables for the before / after levels in docs/AUDIO_MIX.md.
 */

/** Per-id trim on top of the manifest gain (v). Ids not listed use mixTrim() (families by prefix). */
export const MIX_TRIM: Record<string, number> = {
  swing_light: 0.6, swing_heavy: 0.7, hit_crit: 0.75, crit_finisher: 0.85, level_up: 0.7, whoosh: 0.7, dodge: 0.8,
  footstep_stone: 0.8, footstep_dirt: 0.8, cast_pushback: 0.8, enemy_aggro: 0.8,
  // UI: the family default is 0.75 (mixTrim); hover is opt-in and stays lowest, the drag sample is quiet already
  ui_hover: 0.5, ui_drag: 0.6, ui_confirm: 0.6, ui_page_flip: 0.5, party_join: 0.6, party_leave: 0.6, countdown_tick: 0.6,
  passive_allocate: 0.6, passive_refund: 0.7, ui_tab: 0.7,
};

/** Longest audible length in seconds; a longer sample is cut and faded over its last 40 ms. */
export const MAX_SEC: Record<string, number> = { hit_crit: 0.35, crit_finisher: 0.6, level_up: 1.6, swing_light: 0.4, swing_heavy: 0.6 };

/** UI click-class sounds (isUiClickSound) are cut to this many seconds in real time, with the same 40 ms fade. */
export const UI_MAX_SEC = 0.15;

/**
 * UI click-class ids (the one-trigger-per-click set). A button's own click sound and a handler's sfx() for the same click arrive in
 * the same frame, so only the first is heard (UI_BURST_SEC). Hover is not in the set: it must never block the click after it.
 */
export const UI_CLICK_RX = /^(ui_|countdown_tick$|party_join$|party_leave$|passive_allocate$|passive_refund$|chat$)/;
export const UI_BURST_SEC = 0.05;
/** Interface bus scale on top of the uiVolume slider (the slider still runs 0..1 and stays linear). */
export const UI_BUS_SCALE = 0.7;
/** Low-pass on the interface bus: takes the bright top off clicks, open / close and tab sounds. */
export const UI_TONE_HZ = 4200;
export const UI_HOVER_GAP = 0.12;
export const UI_CLICK_GAP = 0.08;

export function isUiClickSound(id: string): boolean {
  return UI_CLICK_RX.test(id) && id !== 'ui_hover';
}

/** One UI click sound per burst: true when `t` is at least UI_BURST_SEC after the last one that played. */
export function uiBurstAllowed(last: number, t: number): boolean {
  return t - last >= UI_BURST_SEC;
}

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
  if (id.startsWith('ui_')) return 0.75;
  return 1;
}
