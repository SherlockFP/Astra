/**
 * Opening kit (owner playtest 2026-10-14; critic: "no payoff between level 2 and 3"). Every playable class gets exactly 4 bar
 * abilities at L1 (plus the basic attack), then one new bar ability at each of L2, L3, L4 and L5, so the bar holds 8 abilities by
 * level 5. Rows: [skill id, bar slot, unlock level]. Turkish name + English original are the skill rows' own `name`.
 *
 * skills.ts applies this table once, after every skill row is registered: it writes `unlockLevel` and `defaultSlot` on the row
 * and makes sure the id is in the class list (CLASSES[c].skills). CharacterState.defaultBar, Progression.autoAssignSkills and the
 * action bar reveal (ActionBar.reveal) all read those fields, so they agree on the levels. Skills above L5 keep their own levels.
 */
import type { ClassId } from '../types/common';
import { CLASSES } from './classes';
import type { SkillSlotKey } from '../types/skills';

export type OpeningRow = readonly [skillId: string, slot: SkillSlotKey, level: 1 | 2 | 3 | 4 | 5];

/**
 * Class skill ids in grant order: the class list (CLASSES[c].skills), then any opening-kit id the list does not hold. The list itself is
 * not changed, so the class-default fallback (defaultSkillBar, indexed by list position) keeps its slots.
 */
export function classGrantOrder(classId: ClassId): string[] {
  const list = CLASSES[classId]?.skills ?? [];
  const extra = (OPENING_KIT[classId] ?? []).map(([id]) => id).filter((id) => !list.includes(id));
  return extra.length ? [...list, ...extra] : list;
}

export const OPENING_KIT: Partial<Record<ClassId, readonly OpeningRow[]>> = {
  // Knight (Şövalye): L1 Charge, Whirlwind, Thunder Clap, Shield Slam; L2 Revenge; L3 Pummel; L4 Shield Block; L5 Taunt.
  knight: [
    ['knight_charge', 's2', 1], ['knight_radiant_cleave', 's1', 1], ['knight_thunder_clap', 's3', 1], ['knight_shield_slam', 'q', 1],
    ['knight_revenge', 'e', 2], ['knight_pummel', 's4', 3], ['knight_shield_block', 'rmb', 4], ['knight_provoke', 'r', 5],
  ],
  // Barbarian (Barbar): L1 Charge, Whirlwind, Shield Slam, Revenge; L2 Thunder Clap; L3 Shield Block; L4 Bloodthirst; L5 Taunt.
  barbarian: [
    ['barbarian_leap', 's2', 1], ['barbarian_whirlwind', 's1', 1], ['barbarian_shield_slam', 'q', 1], ['barbarian_revenge', 'e', 1],
    ['barbarian_thunder_clap', 's3', 2], ['barbarian_iron_stance', 'rmb', 3], ['barbarian_bloodthirst', 's4', 4], ['barbarian_provoke', 'r', 5],
  ],
  // Mage (Büyücü): L1 Fireball, Frostbolt, Arcane Missiles, Blizzard; L2 Frost Nova; L3 Blink; L4 Ice Barrier; L5 Pyroblast.
  mage: [
    ['mage_fireball', 'rmb', 1], ['mage_frostbolt', 'q', 1], ['mage_arcane_missiles', 'e', 1], ['mage_blizzard', 's1', 1],
    ['mage_frost_nova', 's3', 2], ['mage_blink', 's2', 3], ['mage_ice_barrier', 's4', 4], ['mage_pyroblast', 'r', 5],
  ],
  // Rogue (Haydut): L1 Mutilate, Envenom, Shadowstep, Kick; L2 Stealth; L3 Slice and Dice; L4 Sprint; L5 Garrote.
  rogue: [
    ['rogue_mutilate', 'rmb', 1], ['rogue_envenom', 'q', 1], ['rogue_shadow_step', 's2', 1], ['rogue_kick', 's4', 1],
    ['rogue_stealth', 'e', 2], ['rogue_slice_and_dice', 's1', 3], ['rogue_sprint', 's3', 4], ['rogue_garrote', 'r', 5],
  ],
  // Paladin (Paladin): L1 Judgment, Crusader Strike, Word of Glory, Divine Steed; L2 Rebuke; L3 Avenger's Shield; L4 Consecration; L5 Hammer of Justice.
  paladin: [
    ['paladin_judgement', 'rmb', 1], ['paladin_crusader_strike', 'q', 1], ['paladin_word_of_glory', 'e', 1], ['paladin_divine_steed', 's2', 1],
    ['paladin_rebuke', 's1', 2], ['paladin_avengers_shield', 's3', 3], ['paladin_consecration', 's4', 4], ['paladin_hammer_of_justice', 'r', 5],
  ],
  // Necromancer (Nekromancer): L1 Scourge Strike, Death Coil, Festering Strike, Death's Advance; L2 Mind Freeze; L3 Death Strike; L4 Blood Boil; L5 Outbreak.
  necromancer: [
    ['necro_scourge_strike', 'rmb', 1], ['necro_death_coil', 'q', 1], ['necro_festering_strike', 'e', 1], ['necro_deaths_advance', 's2', 1],
    ['necro_mind_freeze', 's4', 2], ['necro_death_strike', 's1', 3], ['necro_heart_strike', 's3', 4], ['necro_outbreak', 'r', 5],
  ],
  // Warlock (Büyücü-Kilitçi): L1 Shadow Bolt, Agony, Demonic Circle, Spell Lock; L2 Corruption; L3 Haunt; L4 Dark Pact; L5 Unstable Affliction.
  warlock: [
    ['warlock_shadow_bolt', 'rmb', 1], ['warlock_agony', 'e', 1], ['warlock_demonic_circle', 's2', 1], ['warlock_spell_lock', 's4', 1],
    ['warlock_corruption', 'r', 2], ['warlock_haunt', 's1', 3], ['warlock_dark_pact', 's3', 4], ['warlock_unstable_affliction', 'q', 5],
  ],
  // Monk (Keşiş): L1 Tiger Palm, Chi Torpedo, Spinning Crane Kick, Blackout Kick; L2 Spear Hand Strike; L3 Flying Serpent Kick; L4 Expel Harm; L5 Rising Sun Kick.
  monk: [
    ['monk_tiger_palm', 'rmb', 1], ['monk_chi_torpedo', 'q', 1], ['monk_spinning_crane', 'e', 1], ['monk_blackout_kick', 's1', 1],
    ['monk_spear_hand_strike', 's4', 2], ['monk_flying_serpent', 's2', 3], ['monk_expel_harm', 's3', 4], ['monk_rising_sun_kick', 'r', 5],
  ],
  // Archer (Okçu): L1 Aimed Shot, Disengage, Multi-Shot, Snare Trap; L2 Call Pet; L3 Arcane Shot; L4 Serpent Sting; L5 Rapid Fire.
  archer: [
    ['archer_aimed_shot', 'rmb', 1], ['archer_disengage', 'q', 1], ['archer_multishot', 'e', 1], ['archer_snare_trap', 's2', 1],
    ['archer_call_pet', 's1', 2], ['archer_arcane_shot', 's3', 3], ['archer_serpent_sting', 's4', 4], ['archer_rapid_fire', 'r', 5],
  ],
  // Shaman (Şaman): L1 Lightning Bolt, Ghost Wolf, Wind Shear, Astral Shift; L2 Flame Shock; L3 Lava Burst; L4 Chain Lightning; L5 Hex.
  shaman: [
    ['shaman_lightning_bolt', 'rmb', 1], ['shaman_ghost_wolf', 'q', 1], ['shaman_wind_shear', 's4', 1], ['shaman_astral_shift', 's3', 1],
    ['shaman_flame_shock', 's1', 2], ['shaman_lava_burst', 'e', 3], ['shaman_earth_shock', 's2', 4], ['shaman_frost_shock', 'r', 5],
  ],
  // Demon Hunter (İblis Avcısı): L1 Chaos Strike, Blade Dance, Immolation Aura, Fel Rush; L2 Demon Spikes; L3 Disrupt; L4 Eye Beam; L5 Torment.
  demonhunter: [
    ['demonhunter_chaos_strike', 'rmb', 1], ['demonhunter_blade_dance', 's1', 1], ['demonhunter_immolation_aura', 'e', 1], ['demonhunter_fel_rush', 's2', 1],
    ['demonhunter_demon_spikes', 's3', 2], ['demonhunter_disrupt', 's4', 3], ['demonhunter_eye_beam', 'r', 4], ['demonhunter_torment', 'q', 5],
  ],
  // Evoker (Ejderha Çağırıcı): L1 Living Flame, Disintegrate, Fire Breath, Hover; L2 Pyre; L3 Quell; L4 Obsidian Scales; L5 Eternity Surge.
  evoker: [
    ['evoker_living_flame', 'rmb', 1], ['evoker_disintegrate', 'q', 1], ['evoker_fire_breath', 'e', 1], ['evoker_hover', 's2', 1],
    ['evoker_pyre', 's1', 2], ['evoker_quell', 's4', 3], ['evoker_obsidian_scales', 's3', 4], ['evoker_eternity_surge', 'r', 5],
  ],
  // Priest (Rahip): L1 Power Word: Shield, Flash Heal, Smite, Renew; L2 Psychic Scream; L3 Desperate Prayer; L4 Dispel Magic; L5 Fade.
  priest: [
    ['priest_power_word_shield', 'rmb', 1], ['priest_flash_heal', 'q', 1], ['priest_smite', 'e', 1], ['priest_renew', 's2', 1],
    ['priest_psychic_scream', 's1', 2], ['priest_desperate_prayer', 's4', 3], ['priest_dispel', 's3', 4], ['priest_fade', 'r', 5],
  ],
  // Druid (Druid): L1 Wrath, Moonfire, Rejuvenation, Cat Form; L2 Bear Form; L3 Regrowth; L4 Barkskin; L5 Travel Form.
  druid: [
    ['druid_wrath', 'rmb', 1], ['druid_moonfire', 'q', 1], ['druid_rejuvenation', 'e', 1], ['druid_cat_form', 's1', 1],
    ['druid_bear_form', 's3', 2], ['druid_regrowth', 's2', 3], ['druid_barkskin', 's4', 4], ['druid_travel_form', 'r', 5],
  ],
};
