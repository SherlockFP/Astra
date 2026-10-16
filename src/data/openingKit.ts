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
  // Knight (Şövalye): L1 Charge, Shield Block, Thunder Clap, Shield Slam (Shield Block gives the Protector its 4th L1 skill and adds no damage, so solo TTK stays in band); L2 Radiant Cleave; L3 Pummel; L4 Revenge; L5 Taunt.
  knight: [
    ['knight_charge', 's2', 1], ['knight_shield_block', 'q', 1], ['knight_thunder_clap', 'rmb', 1], ['knight_shield_slam', 'e', 1],
    ['knight_radiant_cleave', 'r', 2], ['knight_pummel', 's3', 3], ['knight_revenge', 's4', 4], ['knight_provoke', 's1', 5],
  ],
  // Barbarian (Barbar): L1 Charge, Shield Slam, Revenge, Thunder Clap (Warlord's 4th L1 skill; Butcher gets Thunder Clap on its bar too). Whirlwind keeps its own L1 unlock
  // for the Butcher (not on the opening kit, so the kit stays at 4); L2 Iron Stance; L3 Bloodthirst; L4 Provoke; L5 Pummel.
  barbarian: [
    ['barbarian_leap', 's2', 1], ['barbarian_shield_slam', 'q', 1], ['barbarian_revenge', 'e', 1], ['barbarian_thunder_clap', 's1', 1],
    ['barbarian_iron_stance', 'rmb', 2], ['barbarian_bloodthirst', 'r', 3], ['barbarian_provoke', 's3', 4], ['barbarian_pummel', 's4', 5],
  ],
  // Mage (Büyücü): L1 Fireball, Frostbolt, Arcane Missiles, Blizzard, Ice Barrier (the caster's early shield: lowest base HP); L2 Frost Nova; L3 Blink; L5 Pyroblast.
  mage: [
    ['mage_fireball', 'rmb', 1], ['mage_frostbolt', 'q', 1], ['mage_arcane_missiles', 'e', 1], ['mage_blizzard', 'r', 1],
    ['mage_ice_barrier', 's4', 1], ['mage_frost_nova', 's2', 2], ['mage_blink', 's3', 3], ['mage_pyroblast', 's1', 5],
  ],
  // Rogue (Haydut): L1 Mutilate, Envenom, Shadowstep, Kick; L2 Stealth; L3 Slice and Dice; L4 Sprint; L5 Garrote.
  rogue: [
    ['rogue_mutilate', 'rmb', 1], ['rogue_envenom', 'q', 1], ['rogue_shadow_step', 's2', 1], ['rogue_kick', 's3', 1],
    ['rogue_stealth', 'e', 2], ['rogue_slice_and_dice', 'r', 3], ['rogue_sprint', 's4', 4], ['rogue_garrote', 's1', 5],
  ],
  // Paladin (Paladin): L1 Judgment, Crusader Strike, Word of Glory, Divine Steed; L2 Rebuke; L3 Avenger's Shield; L4 Consecration; L5 Hammer of Justice.
  paladin: [
    ['paladin_judgement', 'rmb', 1], ['paladin_crusader_strike', 'e', 1], ['paladin_word_of_glory', 'q', 1], ['paladin_divine_steed', 's2', 1],
    ['paladin_rebuke', 's3', 2], ['paladin_avengers_shield', 'r', 3], ['paladin_consecration', 's1', 4], ['paladin_hammer_of_justice', 's4', 5],
  ],
  // Necromancer (Nekromancer): L1 Scourge Strike, Death Coil, Festering Strike, Death's Advance; L2 Mind Freeze; L3 Death Strike; L4 Blood Boil; L5 Outbreak.
  necromancer: [
    ['necro_scourge_strike', 'rmb', 1], ['necro_death_coil', 'q', 1], ['necro_festering_strike', 'e', 1], ['necro_deaths_advance', 's2', 1],
    ['necro_mind_freeze', 's3', 2], ['necro_death_strike', 'r', 3], ['necro_heart_strike', 's1', 4], ['necro_outbreak', 's4', 5],
  ],
  // Warlock (Büyücü-Kilitçi): L1 Shadow Bolt, Agony, Demonic Circle, Spell Lock; L2 Corruption; L3 Haunt; L4 Dark Pact; L5 Unstable Affliction.
  warlock: [
    ['warlock_shadow_bolt', 'rmb', 1], ['warlock_agony', 'e', 1], ['warlock_demonic_circle', 's2', 1], ['warlock_spell_lock', 's3', 1],
    ['warlock_corruption', 'r', 2], ['warlock_haunt', 's1', 3], ['warlock_dark_pact', 's4', 4], ['warlock_unstable_affliction', 'q', 5],
  ],
  // Monk (Keşiş): L1 Tiger Palm, Chi Torpedo, Spinning Crane Kick, Blackout Kick; L2 Expel Harm (the first defensive, early so the monk has one before L4); L3 Spear Hand Strike; L4 Flying Serpent Kick; L5 Rising Sun Kick.
  monk: [
    ['monk_tiger_palm', 'rmb', 1], ['monk_chi_torpedo', 's2', 1], ['monk_spinning_crane', 'q', 1], ['monk_blackout_kick', 'e', 1],
    ['monk_expel_harm', 'r', 2], ['monk_spear_hand_strike', 's3', 3], ['monk_flying_serpent', 's4', 4], ['monk_rising_sun_kick', 's1', 5],
  ],
  // Archer (Okçu): L1 Aimed Shot, Disengage, Multi-Shot, Snare Trap; L2 Call Pet; L3 Exhilaration (the first heal / defensive, was L10); L4 Serpent Sting; L5 Rapid Fire.
  archer: [
    ['archer_aimed_shot', 'rmb', 1], ['archer_disengage', 's2', 1], ['archer_multishot', 'e', 1], ['archer_snare_trap', 'r', 1],
    ['archer_call_pet', 's1', 2], ['archer_exhilaration', 'q', 3], ['archer_serpent_sting', 's3', 4], ['archer_rapid_fire', 's4', 5],
  ],
  // Shaman (Şaman): L1 Lightning Bolt, Ghost Wolf, Wind Shear, Astral Shift; L2 Flame Shock; L3 Lava Burst; L4 Chain Lightning; L5 Hex.
  shaman: [
    ['shaman_lightning_bolt', 'rmb', 1], ['shaman_ghost_wolf', 's2', 1], ['shaman_wind_shear', 's3', 1], ['shaman_astral_shift', 's4', 1],
    ['shaman_flame_shock', 'e', 2], ['shaman_lava_burst', 'r', 3], ['shaman_earth_shock', 'q', 4], ['shaman_frost_shock', 's1', 5],
  ],
  // Demon Hunter (İblis Avcısı): L1 Chaos Strike, Blade Dance, Immolation Aura, Fel Rush; L2 Demon Spikes; L3 Disrupt; L4 Eye Beam; L5 Torment.
  demonhunter: [
    ['demonhunter_chaos_strike', 'q', 1], ['demonhunter_blade_dance', 'e', 1], ['demonhunter_immolation_aura', 'rmb', 1], ['demonhunter_fel_rush', 's2', 1],
    ['demonhunter_demon_spikes', 's3', 2], ['demonhunter_disrupt', 's4', 3], ['demonhunter_eye_beam', 'r', 4], ['demonhunter_torment', 's1', 5],
  ],
  // Evoker (Ejderha Çağırıcı): L1 Living Flame, Disintegrate, Fire Breath, Hover; L2 Pyre; L3 Quell; L4 Obsidian Scales; L5 Eternity Surge.
  evoker: [
    ['evoker_living_flame', 'rmb', 1], ['evoker_disintegrate', 'q', 1], ['evoker_fire_breath', 's2', 1], ['evoker_hover', 's3', 1],
    ['evoker_pyre', 'e', 2], ['evoker_quell', 's4', 3], ['evoker_obsidian_scales', 'r', 4], ['evoker_eternity_surge', 's1', 5],
  ],
  // Priest (Rahip): L1 Power Word: Shield, Flash Heal, Smite, Renew; L2 Psychic Scream; L3 Desperate Prayer; L4 Dispel Magic; L5 Fade.
  priest: [
    ['priest_power_word_shield', 'rmb', 1], ['priest_flash_heal', 'q', 1], ['priest_smite', 'e', 1], ['priest_renew', 'r', 1],
    ['priest_psychic_scream', 's2', 2], ['priest_desperate_prayer', 's3', 3], ['priest_dispel', 's1', 4], ['priest_fade', 's4', 5],
  ],
  // Druid (Druid): L1 Wrath, Moonfire, Rejuvenation, Cat Form; L2 Bear Form; L3 Regrowth; L4 Barkskin; L5 Travel Form.
  druid: [
    ['druid_wrath', 'rmb', 1], ['druid_moonfire', 'e', 1], ['druid_rejuvenation', 'q', 1], ['druid_cat_form', 's2', 1],
    ['druid_bear_form', 's3', 2], ['druid_regrowth', 'r', 3], ['druid_barkskin', 's4', 4], ['druid_travel_form', 's1', 5],
  ],
};
