// Hand-written SFX entries for the combat-feel, class, talent, forge and gather ids (types/audio.ts). Merged into SFX_MANIFEST by
// manifest.ts, so Audio sees one table. Paths are relative to /assets/audio/. Layers (`ly`) play on top of the sample; the synth
// thump under parry / guard_break / stance_break / crit_finisher / heavy_hit comes from Audio.play (SYNTH_THUMP), not from a file.
import type { SfxEntry } from './manifest';

/** `base` + two-digit numbers from..to + ext, e.g. seq('sfx/melee/hit_plate_light_', 1, 3, '.ogg'). */
const seq = (base: string, from: number, to: number, ext: string): string[] => {
  const out: string[] = [];
  for (let i = from; i <= to; i++) out.push(`${base}${String(i).padStart(2, '0')}${ext}`);
  return out;
};

export const SFX_FEEL_MANIFEST: Record<string, SfxEntry> = {
  // ---- combat feel (GDD_V2 §3.11, §2.2, §7.3)
  heavy_hit: { f: seq('sfx/melee/hit_soft_heavy_', 1, 5, '.ogg'), v: 0.85, pv: 0.06, mv: 4, ly: seq('sfx/melee/swing_', 1, 3, '.wav'), lv: 0.5 },
  weapon_art: { f: seq('sfx/melee/sword_attack_', 1, 4, '.ogg'), v: 0.9, pv: 0.06, mv: 2, ly: seq('sfx/magic/arcane_', 1, 3, '.ogg'), lv: 0.5 },
  charge_loop: { f: seq('sfx/progression/rise_', 1, 3, '.wav'), v: 0.35, pv: 0.05, mv: 2, ly: ['sfx/magic/charge_01.ogg'], lv: 0.4, np: 1 },
  charge_full: { f: ['sfx/jingles/steel_05.ogg', 'sfx/jingles/steel_09.ogg', 'sfx/jingles/steel_13.ogg'], v: 0.8, pv: 0.04, mv: 1, ly: ['sfx/magic/revive_01.ogg'], lv: 0.35, np: 1 },
  guard_hit: { f: seq('sfx/melee/hit_plate_medium_', 1, 5, '.ogg'), v: 0.6, pv: 0.07, mv: 4, ly: seq('sfx/melee/hit_metal_light_', 1, 5, '.ogg'), lv: 0.5 },
  guard_break: { f: seq('sfx/world/break_glass_heavy_', 1, 5, '.ogg'), v: 0.85, pv: 0.06, mv: 2, ly: seq('sfx/melee/hit_plate_heavy_', 1, 5, '.ogg'), lv: 0.7 },
  parry: { f: seq('sfx/melee/sword_clash_', 4, 10, '.ogg'), v: 0.9, pv: 0.05, mv: 3, ly: ['sfx/loot/metal_ringing_01.wav', 'sfx/jingles/steel_06.ogg', 'sfx/jingles/steel_12.ogg'], lv: 0.55 },
  riposte: { f: seq('sfx/melee/sword_attack_', 3, 6, '.ogg'), v: 0.75, pv: 0.08, mv: 2, ly: ['sfx/magic/buff_attack_01.ogg'], lv: 0.55, p: 1.15 },
  backstab: { f: ['sfx/melee/slice_01.ogg', 'sfx/melee/slice_02.ogg'], v: 0.8, pv: 0.08, mv: 3, ly: seq('sfx/melee/hit_flesh_medium_', 1, 3, '.ogg'), lv: 0.6 },
  stance_break: { f: seq('sfx/world/break_glass_heavy_', 1, 5, '.ogg'), v: 0.95, pv: 0.05, mv: 2, ly: ['sfx/magic/ice_explosion_01.ogg'], lv: 0.6 },
  crit_finisher: { f: seq('sfx/melee/hit_flesh_heavy_', 1, 5, '.ogg'), v: 1.0, pv: 0.05, mv: 2, ly: seq('sfx/melee/hit_metal_heavy_', 1, 5, '.ogg'), lv: 0.8 },
  perilous_warn: { f: seq('sfx/ambience/dark_stinger_', 1, 5, '.wav'), v: 0.6, pv: 0.04, mv: 2, np: 1 },
  interrupt: { f: seq('sfx/melee/hit_plate_light_', 1, 3, '.ogg'), v: 0.75, pv: 0.07, mv: 3, ly: seq('sfx/world/impact_light_', 1, 3, '.ogg'), lv: 0.6 },

  // ---- class, weapon and spell feedback
  hero_horn: { f: ['sfx/progression/rise_04.wav', 'sfx/progression/rise_05.wav'], v: 0.9, pv: 0.03, mv: 1, p: 0.9, ly: ['sfx/progression/upper_01.wav'], lv: 0.6, np: 1 },
  choir_sting: { f: seq('itch/healing-spell-impacts/heals/heal-impact-', 1, 3, '.ogg'), v: 0.7, pv: 0.04, mv: 2, p: 0.9, np: 1 },
  ice_chime: { f: ['sfx/magic/shimmer_01.mp3'], v: 0.6, pv: 0.05, mv: 2, p: 1.3, ly: seq('itch/basic-spell-impacts/spells/ice-impact-', 1, 3, '.ogg'), lv: 0.5 },
  fire_whoosh: { f: seq('sfx/magic/fire_', 1, 3, '.ogg'), v: 0.7, pv: 0.08, mv: 3, ly: ['sfx/melee/swish_01.wav'], lv: 0.4 },
  time_warp: { f: ['sfx/magic/speed_up_01.ogg'], v: 0.7, pv: 0.03, mv: 1, p: 0.6, ly: ['sfx/magic/sleep_01.ogg'], lv: 0.35, np: 1 },
  choir_swell: { f: ['sfx/magic/heal_01.ogg'], v: 0.9, pv: 0.03, mv: 1, p: 0.8, ly: ['itch/healing-spell-impacts/heals/heal-impact-05.ogg'], lv: 0.4, np: 1 },
  whisper: { f: seq('sfx/creatures/weird_', 1, 3, '.ogg'), v: 0.45, pv: 0.1, mv: 2, np: 1 },
  bubble_loop: { f: ['sfx/magic/water_01.ogg'], v: 0.5, pv: 0.05, mv: 2 },
  wolf_howl: { f: ['sfx/creatures/howl_01.ogg'], v: 0.9, pv: 0.04, mv: 1 },
  heartbeat_loop: { f: ['sfx/melee/hit_soft_heavy_05.ogg'], v: 0.5, pv: 0.03, mv: 2, p: 0.7, np: 1 },
  weak_hit: { f: seq('sfx/melee/hit_metal_light_', 1, 3, '.ogg'), v: 0.6, pv: 0.07, mv: 4, p: 1.25, ly: ['sfx/magic/debuff_01.ogg'], lv: 0.6 },
  resist_hit: { f: ['sfx/melee/hit_plate_light_04.ogg', 'sfx/melee/hit_plate_light_05.ogg'], v: 0.55, pv: 0.06, mv: 3, p: 0.8, ly: ['sfx/magic/buff_defense_01.ogg'], lv: 0.5 },
  camp_crackle: { f: ['sfx/magic/fire_04.ogg', 'sfx/magic/fire_05.ogg'], v: 0.4, pv: 0.06, mv: 1, np: 1 },

  // ---- gathering and crafting (GDD_LIFE L-00b, §1.6 / §1.11)
  chop_wood: { f: ['sfx/melee/chop_01.ogg'], v: 0.8, pv: 0.08, mv: 2, ly: seq('sfx/world/wood_', 1, 5, '.ogg'), lv: 0.6 },
  mine_rock: { f: seq('sfx/world/mining_', 1, 5, '.ogg'), v: 0.75, pv: 0.08, mv: 2, ly: seq('sfx/world/stones_', 1, 4, '.ogg'), lv: 0.6 },
  pick_herb: { f: seq('sfx/loot/cloth_', 1, 4, '.ogg'), v: 0.5, pv: 0.06, mv: 2, p: 1.3, ly: ['sfx/ui/pluck_01.ogg', 'sfx/ui/pluck_02.ogg'], lv: 0.5, np: 1 },
  skin_cut: { f: ['sfx/melee/slice_01.ogg', 'sfx/melee/slice_02.ogg'], v: 0.7, pv: 0.08, mv: 2, ly: ['sfx/melee/hit_flesh_medium_04.ogg', 'sfx/melee/hit_flesh_medium_05.ogg'], lv: 0.5 },
  tree_fall: { f: seq('sfx/world/break_wood_heavy_', 1, 5, '.ogg'), v: 1.0, pv: 0.05, mv: 1, p: 0.85, ly: seq('sfx/world/creak_', 1, 3, '.ogg'), lv: 0.6 },
  craft_done: { f: ['sfx/loot/equip_armor_light_01.wav'], v: 0.6, pv: 0.04, mv: 1, ly: ['sfx/ui/confirm_03.ogg'], lv: 0.6, np: 1 },
  chat_whisper: { f: ['sfx/ui/pluck_01.ogg', 'sfx/ui/pluck_02.ogg'], v: 0.3, pv: 0.03, mv: 2, p: 1.4, np: 1 },

  // ---- COMBAT_WOW §2.16 / CW-12: school impact, proc and cooldown feedback (existing files only)
  arcane_cast: { f: seq('sfx/magic/arcane_', 1, 4, '.ogg'), v: 0.8, pv: 0.06, mv: 2, ly: ['sfx/magic/cast_01.wav'], lv: 0.5 },
  arcane_impact: { f: ['sfx/magic/spell_01.ogg', 'sfx/magic/spell_02.ogg'], v: 0.8, pv: 0.06, mv: 3, p: 1.1, ly: ['sfx/magic/arcane_05.ogg'], lv: 0.5 },
  proc_gain: { f: ['sfx/magic/buff_attack_01.ogg'], v: 0.7, pv: 0.04, mv: 2, ly: ['sfx/magic/shimmer_01.mp3'], lv: 0.5, np: 1 },
  proc_use: { f: ['sfx/magic/spell_02.ogg'], v: 0.8, pv: 0.04, mv: 2, p: 1.4, np: 1 },
  cd_ready: { f: ['sfx/magic/shimmer_01.mp3'], v: 0.4, pv: 0.03, mv: 2, p: 1.3, np: 1 },
  cast_pushback: { f: ['sfx/melee/hit_plate_light_04.ogg'], v: 0.5, pv: 0.05, mv: 2, p: 0.7, np: 1 },
};
