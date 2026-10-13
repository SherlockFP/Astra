/**
 * GDD_CLASSES_V2 shared class data shapes (core module, NC02). Used by data/classes.ts (`ClassDefX` registry fields, the
 * five new class entries) and by the presentation owners (entities/CharacterModel, ui/menu, audio voices, vfx pips).
 * Append-only for everyone: add optional fields, never rename or remove. See ARCHITECTURE.md "Class contracts (NC01-NC04)".
 */
import type { ClassId, DamageType, PipId } from './common';
import type { StatBlock } from './stats';
import type { StatusId } from './skills';

/**
 * Secondary pip counter shown under the primary bar (GDD_CLASSES_V2 §1.2). Stored in `Player.pips[id]`
 * (SkillSystem.addPip / spendPip / pipCount), event `pips:changed { id, points, max }`.
 */
export interface PipDef {
  id: PipId;
  name: string;               // Turkish
  max: number;                // 5 for every pip of the new classes (+1 from some notables). With `scale`, the max in internal units.
  /**
   * KIT PK-0: internal units per displayed pip (warlock shard fragments: max 50, scale 10 = five shown pips). The stored count,
   * `max`, and every SkillDef.pip amount (cost / consume / gain / min) are in internal units; `pips:changed` reports
   * `points = floor(count / scale)` and `max / scale`. Default 1.
   */
  scale?: number;
  color: string;              // hex, e.g. '#5de0a8' (Çi)
  icon: string;               // icon name in public/assets/icons (no path, no .svg), e.g. 'buff-haste'
  /** Passive decay: -1 pip every `every` seconds after `after` seconds out of combat (Çi: after 8 s, every 4 s). */
  decay?: { after: number; every: number };
  /** PM-00a (plate-melee §g need 1): timed regeneration, +1 per `every` seconds up to `max` (Death Knight runes: every 10 s). */
  regen?: { every: number };
  startAt?: number;
}

/**
 * Character model recipe (GDD_CLASSES_V2 §2.2–§6.2): one KayKit GLB per class, recoloured by `paletteClass`
 * (ANCHOR_HUE source), with the KayKit child nodes shown / hidden and the stand-in weapons named.
 */
export interface ClassVisualDef {
  url: string;                                   // /assets/models/characters/<X>.glb
  plainUrl?: string;
  paletteClass: 'knight' | 'barbarian' | 'mage' | 'rogue';   // recolour anchor
  defaultVariant: number;                        // colour variant index (1..5)
  defaultTint?: number;                          // 0xRRGGBB
  show: string[];                                // KayKit child nodes shown by default
  hide: string[];                                // KayKit child nodes hidden by default
  main: string[];                                // stand-in main-hand nodes, shown only when no gear model resolves
  off: string[];                                 // stand-in off-hand nodes, same rule
  attach?: { bow?: boolean; quiver?: boolean; book?: boolean };
}

/**
 * CORE_MECHANICS §3 (CM1, append-only): one unique party buff or enemy debuff per class (applied by CM3). Room-wide for the party
 * (radius = the whole world), refreshed every `refreshSec` while the source lives; identical `group`s do not stack (a second copy
 * is wasted, like WoW). Owner -> all over `pstatus`; enemy debuffs are applied on hit by the source and replicated with `estatus`.
 * Heroism (Kurt Narası, Yorgun 10 min) and battle res are marked by `family` so the Group Finder can show missing buffs.
 */
export interface PartyBuffDef {
  id: string;                          // e.g. 'party_sancak'
  classId: ClassId;                    // the source class
  name: string;                        // Turkish (Sancak, Savaş Narası, Gizem Zekası, Kaos Damgası, Bronz Kudret ...)
  target: 'party' | 'enemies';
  /** Bonuses granted to every party member while active (fractions), e.g. { maxHpPct: 0.05 }. */
  stats?: StatBlock;
  /** Enemy debuff: extra damage taken (fraction) from `school` ('all' = every source). */
  takenPct?: { school: DamageType | 'all'; pct: number };
  /** Seconds the status lasts after each application / refresh. */
  durationSec: number;
  /** Refresh cadence while the source lives (CORE_MECHANICS §3: 10 s). */
  refreshSec: number;
  /** Stacking group: buffs of the same group never stack. */
  group: string;
  /** Status id shown on the affected unit (existing StatusDef or a new one in data/statuses*.ts). */
  status: StatusId;
  icon: string;                        // icon name in public/assets/icons (no path, no .svg)
  family?: 'heroism' | 'battle_res';
}
