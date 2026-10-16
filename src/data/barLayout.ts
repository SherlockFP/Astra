/**
 * Default action-bar layout rule (owner, 2026-10-16; WoW Midnight retail layout), one rule for every class and spec:
 *
 *   keys 1-5  (rmb, q, e, r, s1 in the WoW scheme) hold the rotation: the first builder on 1, the first spender on 2, the rest in
 *             unlock order;
 *   Q / E / R (s2, s3, s4) hold the cooldowns, interrupts, mobility and defensives, first free key first;
 *   the majors (m45 / m90 / m180) keep their own explicit slot from the skill row (defaultSlot).
 *
 * The layout is built in grant order (unlock level, then role rank, then the kit's own order) and every skill takes the FIRST FREE
 * slot of its preference list. That makes it incremental: the bar at level N is a prefix of the bar at level N+1, and a new unlock
 * (Progression.autoAssignSkills) takes the next free slot of its role without moving anything the player already has.
 *
 * Pure (no G, no DOM): CharacterState.defaultBar, Progression and dev/combat-sim/bar_layout.mjs all use it.
 */
import type { SkillDef, SkillSlotKey } from '../types/skills';

/** The bar role of a skill for the default layout. */
export type BarRole = 'builder' | 'spender' | 'rotational' | 'cooldown' | 'interrupt' | 'mobility' | 'defensive' | 'stance';

/** Keys 1-5 of the WoW scheme, in key order (rmb = Digit1 ... s1 = Digit5). */
export const ROTATION_SLOTS: readonly SkillSlotKey[] = ['rmb', 'q', 'e', 'r', 's1'];
/** Q, E, R of the WoW scheme (s2 = KeyQ, s3 = KeyE, s4 = KeyR). */
export const UTILITY_SLOTS: readonly SkillSlotKey[] = ['s2', 's3', 's4'];
/** Explicit major slots (45 s / 90 s / 3 min); a skill row with one of them as defaultSlot keeps it. */
export const MAJOR_SLOTS: readonly SkillSlotKey[] = ['m45', 'm90', 'm180'];

/** Cooldown (seconds) from which a skill counts as a cooldown rather than a rotation filler. */
export const COOLDOWN_ROLE_MIN_CD = 25;

const ALL_ROLE_SLOTS: readonly SkillSlotKey[] = [...ROTATION_SLOTS, ...UTILITY_SLOTS];

/** Preference list per role: the first free slot wins. Rotation roles fall back to Q/E/R; utility roles fall back to the keys 1-5 only when Q/E/R are full. */
const PREFERENCE: Record<BarRole, readonly SkillSlotKey[]> = {
  // builders leave key 2 (q) to the first spender: a second builder goes to 3 / 4 / 5 first
  builder: ['rmb', 'e', 'r', 's1', 'q', ...UTILITY_SLOTS],
  rotational: ALL_ROLE_SLOTS,
  spender: ['q', 'rmb', 'e', 'r', 's1', 's2', 's3', 's4'],
  cooldown: [...UTILITY_SLOTS, ...ROTATION_SLOTS],
  interrupt: [...UTILITY_SLOTS, ...ROTATION_SLOTS],
  mobility: [...UTILITY_SLOTS, ...ROTATION_SLOTS],
  defensive: [...UTILITY_SLOTS, ...ROTATION_SLOTS],
  stance: [...UTILITY_SLOTS, ...ROTATION_SLOTS],
};

/** Grant-order rank: builders first, then the other rotation, then spenders; utility roles last (kit order decides among them). */
const RANK: Record<BarRole, number> = { builder: 0, rotational: 1, spender: 2, cooldown: 3, interrupt: 3, mobility: 3, defensive: 3, stance: 3 };

/** The role of a skill row. Order matters: an interrupt is an interrupt even when it has a cooldown. */
export function barRole(def: SkillDef): BarRole {
  const tags = def.tags ?? [];
  if (def.behavior === 'interrupt') return 'interrupt';
  if (tags.includes('movement') || tags.includes('teleport') || def.targeting === 'dash' || def.targeting === 'leap' || def.targeting === 'teleport') return 'mobility';
  if (tags.includes('f_shift')) return 'stance';
  if (tags.includes('defensive') || tags.includes('mitigation')) return 'defensive';
  if (def.cooldown >= COOLDOWN_ROLE_MIN_CD) return 'cooldown';
  if (def.cost < 0 || (def.pip?.gain ?? 0) > 0 || tags.includes('builder')) return 'builder';
  if (tags.includes('spender') || tags.includes('finisher') || (def.pip?.cost ?? 0) > 0 || def.pip?.consume !== undefined) return 'spender';
  return 'rotational';
}

/** A bar candidate: the skill row, its id, its unlock level and its position in the kit (the tie-break inside a level). */
export interface LayoutCandidate {
  id: string;
  def: SkillDef;
  unlock: number;
  kitIndex: number;
}

/** Grant order of the candidates: unlock level, then role rank, then kit order. Pure. */
export function grantSort(list: readonly LayoutCandidate[]): LayoutCandidate[] {
  return list.slice().sort((a, b) => a.unlock - b.unlock || RANK[barRole(a.def)] - RANK[barRole(b.def)] || a.kitIndex - b.kitIndex);
}

/**
 * The first free slot of the skill's preference list, or null (the bar is full for this role). An explicit major slot is taken when free.
 * `bar` is changed in place.
 */
export function placeSkill(bar: Partial<Record<SkillSlotKey, string>>, id: string, def: SkillDef, reserved: readonly SkillSlotKey[] = []): SkillSlotKey | null {
  const explicit = def.defaultSlot;
  if (explicit && (MAJOR_SLOTS as readonly string[]).includes(explicit)) {
    if (bar[explicit]) return null;
    bar[explicit] = id;
    return explicit;
  }
  const role = barRole(def);
  // a non-spender skips the reserved slots while another slot is free; the reserved slot is the fallback of last resort
  const pref = PREFERENCE[role];
  const keepFree = role === 'spender' ? [] : reserved;
  for (const slot of [...pref.filter((s) => !keepFree.includes(s)), ...pref.filter((s) => keepFree.includes(s))]) {
    if (bar[slot]) continue;
    bar[slot] = id;
    return slot;
  }
  return null;
}

/**
 * The slots kept free for spenders: key 2 (q) when the class has a spender in its candidates, so a spender unlocked later still lands
 * on 2 and a filler unlocked earlier does not take it. A pure function of the class's candidates, not of the level.
 */
export function reservedSlots(candidates: readonly LayoutCandidate[]): SkillSlotKey[] {
  return candidates.some((c) => barRole(c.def) === 'spender') ? ['q'] : [];
}

/**
 * The default bar of a class at a level from its opening-kit candidates (unlock <= level) and its major rows. `lmb` is the basic attack.
 * Majors (explicit m45 / m90 / m180 rows in the class list) come first, in list order; the rest in grant order.
 */
export function layoutDefaultBar(basicId: string, candidates: readonly LayoutCandidate[], level: number, majors: readonly LayoutCandidate[] = []): Partial<Record<SkillSlotKey, string>> {
  const bar: Partial<Record<SkillSlotKey, string>> = { lmb: basicId };
  const reserved = reservedSlots(candidates);
  for (const m of majors) if (m.unlock <= level) placeSkill(bar, m.id, m.def);
  for (const c of grantSort(candidates)) if (c.unlock <= level) placeSkill(bar, c.id, c.def, reserved);
  return bar;
}

/**
 * The OLD opening-kit slots (before bar layout rev 1), frozen for the one-time migration in Save.ts: a bar that still holds exactly
 * this default is moved to the new default; any bar the player arranged is kept.
 */
export const LEGACY_KIT_SLOTS: Readonly<Record<string, SkillSlotKey>> = {
  knight_charge: 's2', knight_radiant_cleave: 's1', knight_thunder_clap: 's3', knight_shield_slam: 'q', knight_revenge: 'e', knight_pummel: 's4', knight_shield_block: 'rmb', knight_provoke: 'r',
  barbarian_leap: 's2', barbarian_whirlwind: 's1', barbarian_shield_slam: 'q', barbarian_revenge: 'e', barbarian_thunder_clap: 's3', barbarian_iron_stance: 'rmb', barbarian_bloodthirst: 's4', barbarian_provoke: 'r',
  mage_fireball: 'rmb', mage_frostbolt: 'q', mage_arcane_missiles: 'e', mage_blizzard: 's1', mage_frost_nova: 's3', mage_blink: 's2', mage_ice_barrier: 's4', mage_pyroblast: 'r',
  rogue_mutilate: 'rmb', rogue_envenom: 'q', rogue_shadow_step: 's2', rogue_kick: 's4', rogue_stealth: 'e', rogue_slice_and_dice: 's1', rogue_sprint: 's3', rogue_garrote: 'r',
  paladin_judgement: 'rmb', paladin_crusader_strike: 'q', paladin_word_of_glory: 'e', paladin_divine_steed: 's2', paladin_rebuke: 's1', paladin_avengers_shield: 's3', paladin_consecration: 's4', paladin_hammer_of_justice: 'r',
  necro_scourge_strike: 'rmb', necro_death_coil: 'q', necro_festering_strike: 'e', necro_deaths_advance: 's2', necro_mind_freeze: 's4', necro_death_strike: 's1', necro_heart_strike: 's3', necro_outbreak: 'r',
  warlock_shadow_bolt: 'rmb', warlock_agony: 'e', warlock_demonic_circle: 's2', warlock_spell_lock: 's4', warlock_corruption: 'r', warlock_haunt: 's1', warlock_dark_pact: 's3', warlock_unstable_affliction: 'q',
  monk_tiger_palm: 'rmb', monk_chi_torpedo: 'q', monk_spinning_crane: 'e', monk_blackout_kick: 's1', monk_spear_hand_strike: 's4', monk_flying_serpent: 's2', monk_expel_harm: 's3', monk_rising_sun_kick: 'r',
  archer_aimed_shot: 'rmb', archer_disengage: 'q', archer_multishot: 'e', archer_snare_trap: 's2', archer_call_pet: 's1', archer_arcane_shot: 's3', archer_serpent_sting: 's4', archer_rapid_fire: 'r',
  shaman_lightning_bolt: 'rmb', shaman_ghost_wolf: 'q', shaman_wind_shear: 's4', shaman_astral_shift: 's3', shaman_flame_shock: 's1', shaman_lava_burst: 'e', shaman_earth_shock: 's2', shaman_frost_shock: 'r',
  demonhunter_chaos_strike: 'rmb', demonhunter_blade_dance: 's1', demonhunter_immolation_aura: 'e', demonhunter_fel_rush: 's2', demonhunter_demon_spikes: 's3', demonhunter_disrupt: 's4', demonhunter_eye_beam: 'r', demonhunter_torment: 'q',
  evoker_living_flame: 'rmb', evoker_disintegrate: 'q', evoker_fire_breath: 'e', evoker_hover: 's2', evoker_pyre: 's1', evoker_quell: 's4', evoker_obsidian_scales: 's3', evoker_eternity_surge: 'r',
  priest_power_word_shield: 'rmb', priest_flash_heal: 'q', priest_smite: 'e', priest_renew: 's2', priest_psychic_scream: 's1', priest_desperate_prayer: 's4', priest_dispel: 's3', priest_fade: 'r',
  druid_wrath: 'rmb', druid_moonfire: 'q', druid_rejuvenation: 'e', druid_cat_form: 's1', druid_bear_form: 's3', druid_regrowth: 's2', druid_barkskin: 's4', druid_travel_form: 'r',
};

/** One opening-kit row: [skill id, slot, unlock level] (data/openingKit.ts). */
export type KitRow = readonly [skillId: string, slot: SkillSlotKey, level: number];

/**
 * The bar candidates of a class: the kit rows (their unlock level is the skill row's, written by skills.ts from the kit) and the
 * class's major rows (explicit m45 / m90 / m180 defaultSlot, not in the kit). Rows without a skill are dropped.
 */
export function barCandidates(kit: readonly KitRow[], classSkillIds: readonly string[], skills: Readonly<Record<string, SkillDef | undefined>>): { candidates: LayoutCandidate[]; majors: LayoutCandidate[] } {
  const candidates: LayoutCandidate[] = [];
  kit.forEach(([id], kitIndex) => {
    const def = skills[id];
    if (def) candidates.push({ id, def, unlock: def.unlockLevel, kitIndex });
  });
  const kitIds = new Set(kit.map(([id]) => id));
  const majors: LayoutCandidate[] = [];
  classSkillIds.forEach((id, kitIndex) => {
    const def = skills[id];
    if (!def || kitIds.has(id) || !def.defaultSlot || !(MAJOR_SLOTS as readonly string[]).includes(def.defaultSlot)) return;
    majors.push({ id, def, unlock: def.unlockLevel, kitIndex });
  });
  return { candidates, majors };
}
