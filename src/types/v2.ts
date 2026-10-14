/**
 * GDD_V2 "Sistemler 2.0" shared types (core module). Copied verbatim from docs/GDD_V2.md Appendix A (WP1).
 * Append-only for everyone: add optional fields / members, never rename or remove. See ARCHITECTURE.md "V2 contracts".
 */
import type { ClassId, DamageType } from './common';
import type { ItemCategory } from './items';
import type { StatBlock } from './stats';
import type { SkillDef, SkillSlotKey, StatusId } from './skills';
import type { SlotId } from './talents';

export type RoleId = 'tank' | 'healer' | 'dps';
export type SpecId = 'knight_protector' | 'knight_blademaster' | 'barbarian_warlord' | 'barbarian_butcher'
  | 'mage_elementalist' | 'mage_lightbringer' | 'rogue_assassin' | 'rogue_alchemist'
  // GDD_CLASSES_V2 §1.1 (NC01): the 11 wave-1 specs of the five new classes (wave-2 seeds are not listed yet)
  | 'monk_brewmaster' | 'monk_windwalker' | 'archer_marksman' | 'archer_beastmaster' | 'paladin_protection' | 'paladin_holy'
  | 'paladin_retribution' | 'necromancer_summoner' | 'necromancer_bone' | 'warlock_affliction' | 'warlock_destruction' | 'warlock_demonology'
  // GDD_TALENTS (T0, append-only): mage_elementalist / mage_lightbringer stay in the union until the migration ships (OT1).
  | 'mage_fire' | 'mage_frost' | 'mage_arcane'
  // GDD_TALENTS OT1: monk_mistweaver is a listed spec (its tree is authored; kit rows are wave 2)
  | 'monk_mistweaver'
  // WP-02 (Midnight-aligned): Okçu's melee Hayatta Kalma spec (Survival) joins the archer's wave-1 specs
  | 'archer_survival'
  // CORE_MECHANICS §2 / CM1 (append-only): İblis Avcısı (Kaos, İntikam), Ejderhasoy (Yıkım Nefesi, Koruyucu Nefes, Yüceltme),
  // and the Gölge spec of the rogue (CM12 kit). Ids only; SPECS rows arrive with the kit packages.
  | 'demonhunter_chaos' | 'demonhunter_vengeance' | 'evoker_devastation' | 'evoker_preservation' | 'evoker_augmentation'
  | 'rogue_subtlety'
  // HAYDUT WoW layout (append-only): Kanun Kaçağı (Outlaw). Kit rows only; no GDD_TALENTS tree yet, so it is not pickable.
  | 'rogue_outlaw'
  // CLASS SCAFFOLD (append-only): Rahip (priest_*), Şaman (shaman_*), Druid (druid_*). Ids only; SPECS rows arrive with the kits.
  | 'priest_discipline' | 'priest_holy' | 'priest_shadow'
  | 'shaman_elemental' | 'shaman_enhancement' | 'shaman_restoration'
  | 'druid_balance' | 'druid_feral' | 'druid_guardian' | 'druid_restoration'
  // WoW Midnight (12.0): the third Demon Hunter spec, Devourer ("Yutucu", Void caster)
  | 'demonhunter_devourer';
export interface SpecDef {
  id: SpecId; classId: ClassId; name: string; role: RoleId; desc: string;
  stats: StatBlock;                                   // folded like a keystone (threatPct, maxHpPct, ...)
  specials?: { id: string; desc: string; params?: Record<string, number> }[];
  skills: string[];                                   // new skill ids (unlock order)
  unlock: Record<string, number>;                     // skillId -> level
  majors: { m45: string; m90: string; m180?: string };
  mods: { skill: string; params?: Record<string, number>; patch?: Partial<SkillDef> }[];   // per-spec changes to existing skills
  defaultBar: Partial<Record<SkillSlotKey, string>>;
  weaponArt?: string;                                 // override of the category art (healers)
  basic?: string;                                     // replaces <class>_basic (Işık Çağıran, Simyacı)
  /** PM-00a (plate-melee §g need 10): per-spec main stat for Combat.rollOutgoing (falls back to ClassDef.mainStat). */
  mainStat?: 'str' | 'dex' | 'int';
  guard?: { gauge: number; arc: number; blockAmount: number };
  // ---- GDD_TALENTS (T0, append-only). Optional; data owners fill them (combat data for mage specs, §1.3.1).
  /** Skills granted by an A node of the spec tree instead of level 10 (`Progression.unlockedSkills`). */
  treeSkills?: Record<string, SlotId>;
  /** Spec-level numeric skill changes in the effect DSL (GDD_TALENTS §2.5), applied by combat/skillMods.ts. */
  fx?: string;
}
/**
 * CORE_MECHANICS §1.1 / §5.4 (CM1, append-only): generated per-spec correction factors (`src/data/specTuning.ts`, written by
 * tools/simbench.mjs --tune). Applied as the last multiplier in Combat.rollOutgoing (`dmg`), heal paths (`heal`) and shields (`absorb`).
 * Neutral value = 1 for each factor.
 */
export interface SpecTuning { dmg: number; heal: number; absorb: number }

export type FamilyId = 'beast'|'undead_bone'|'undead_flesh'|'ghost'|'insect'|'slime'|'fungus'|'humanoid'|'cultist'|'golem'|'demon'|'elemental_fire'|'elemental_frost'|'dragon';
export interface FamilyDef { id: FamilyId; name: string; resist: Partial<Record<DamageType, number>>; immune: StatusId[]; takenMore?: Partial<Record<StatusId, number>>; poiseMult: number; icon: string }
export interface RuneDef { id: string; name: string; needs: string[]; forbid?: string[]; costMult: number; ranks: [RuneMods, RuneMods, RuneMods]; desc: string }
export type RuneMods = Partial<{ more: number; addProj: number; pierce: number; chain: number; areaPct: number; speedPct: number; gainAs: Partial<Record<DamageType, number>>; leech: number; cull: number; critMult: number; critDmg: number; cdMult: number; costMult: number; every3: number; poisePct: number; bleed: number; echo: number; dotMore: number; resGain: number; durPct: number; effectPct: number; nextHitMore: number; noAilments: boolean; projSpeedPct: number }>;
export interface FlaskBaseDef { id: string; name: string; minIlvl: number; max: [number, number, number, number]; use: number; effect: Record<string, number>; dur: [number, number, number, number]; icon: string }
export interface OrbDef { id: string; name: string; desc: string; apply: 'one' | 'all' | 'add' | 'values' | 'rarity' | 'remove' | 'corrupt' | 'alchemy' }
export interface AspectDef { id: string; name: string; group: 'off' | 'def' | 'util' | 'mob'; classId?: ClassId | 'healer'; desc: string; params: Record<string, [number, number]> }
export interface SealDef { id: string; name: string; points: 1 | 2 | 3; risk: Record<string, number>; reward: Record<string, number>; desc: string }
export interface TierSetDef { id: string; specId: SpecId; name: string; pieces: Record<'helm'|'shoulders'|'chest'|'gloves'|'legs', string>; bonus2: { id: string; desc: string }; bonus4: { id: string; desc: string } }
export interface ParagonBoardDef { id: string; name: string; cells: string[][]; N: StatBlock; M: StatBlock; R: StatBlock; C: { stats?: StatBlock; special?: string; desc: string } }
export interface RaidInfo { lockout: true; bossOrder: string[]; wipeResetSec: number; brez: { perAttempt: number[] } }
export interface WeaponArtDef { id: string; name: string; category: ItemCategory; chargeSec: number; coef: number; poise: number; kick: boolean; kickLockout: number; params: Record<string, number> }
export interface ComboRouteDef { id: string; classId: ClassId; name: string; inputs: string[]; windowFrom: number; windowTo: number; effect: string }
export interface TankRoute { id: string; dungeonId: string; name: string; pulls: { n: number; packs: string[]; forces: number; tip: string }[]; skip: string[]; total: number }
