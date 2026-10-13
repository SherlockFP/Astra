import type { ClassId } from './common';
import type { EquipSlot, ItemInstance } from './items';
import type { MythicProfile } from './mythic';
import type { SkillSlotKey } from './skills';
import type { SpecId } from './v2';
import type { TalentBuild } from './talents';
import type { CampState, HomeSave, UpgState } from './itemsV2';
import type { ProfessionId, ProfessionSave } from './professions';

export const BAG_SIZE = 48;
export const STASH_SIZE = 120;
export const LEVEL_CAP = 60;

/**
 * Persistent character save (localStorage via core/Save.ts). Plain JSON only.
 * Mutated exclusively through CharacterState (systems/CharacterState.ts) so events fire.
 */
export interface CharacterSave {
  version: number;
  id: string;
  name: string;
  classId: ClassId;
  appearance: { variant: number; tint?: number };
  level: number;
  xp: number;                 // xp into current level
  gold: number;
  createdAt: number;
  lastPlayed: number;
  playedSec: number;
  equipment: Partial<Record<EquipSlot, ItemInstance>>;
  bag: (ItemInstance | null)[];      // length BAG_SIZE
  stash: (ItemInstance | null)[];    // length STASH_SIZE
  materials: Record<string, number>; // stackable currencies/materials/consumables by id (gold not included)
  talents: string[];                 // allocated passive node ids
  talentRefunds: number;
  skillBar: Partial<Record<SkillSlotKey, string>>; // slot -> skill id
  skillRanks: Record<string, number>;              // optional skill ranks (future)
  mythic: MythicProfile;
  flags: Record<string, number | boolean | string>; // tutorial, unlocked dungeons, bounties progress...
  stats: { kills: number; deaths: number; bossKills: number; dungeonsCompleted: number; highestKey: number; legendaryFound: number };
  // ---- GDD_V2 §A (WP1 contracts). All OPTIONAL. core/Save.ts normaliseCharacterSave() fills defaults on load (old saves load).
  // Scalar tutorial / catalyst / key-swap markers go into `flags` by convention (e.g. flags.catalyst, flags.keySwapWeek).
  /** Selected spec. undefined = no spec chosen yet (Eğitmen panel, level 10). */
  spec?: SpecId;
  /** Per-spec saved skill bars (O8). */
  specBars?: Partial<Record<SpecId, Partial<Record<SkillSlotKey, string>>>>;
  /** Support runes socketed per skill id; null = empty socket. */
  skillRunes?: Record<string, (string | null)[]>;
  /** Şişe Kemeri: 5 flask slots (flask1..flask5). */
  flasks?: (ItemInstance | null)[];
  /** Current flask charges, parallel to `flasks` (5 entries). */
  flaskCharges?: number[];
  /** Bestiyari codex entries: rolled data per enemy id. */
  codex?: Record<string, { roll: number }>;
  /** Bestiyari kill counter per enemy id. */
  bestiary?: Record<string, number>;
  /** Kadim Levha (paragon) progress. */
  paragon?: { ks: number; xp: number; points: number; boards: { id: string; mx: number; my: number }[]; cells: string[]; glyphs: { boardIdx: number; socket: 0 | 1; id: string; level: number }[] };
  /** Route planner saves per dungeon id, max 5 each (GDD_V2 §8.2). */
  routes?: Record<string, { name: string; pulls: string[][]; note?: string; updatedAt: number }[]>;
  /** Raid lockout bookkeeping (efsun_kalesi). */
  raid?: { week: number; killed: { normal: string[]; heroic: string[]; mythic: string[] } };
  /** Earned titles (ids). */
  titles?: string[];
  /** Selected title id. */
  title?: string;
  /** Unlocked cosmetic ids. */
  cosmetics?: Record<string, boolean>;
  /** Remaining major cooldown seconds for the 45 s / 90 s / 3-min slots (GDD_V2 §2.1). Top-level because `flags` only holds scalars. */
  majorCd?: { m45: number; m90: number; m180: number };
  // ---- GDD_TALENTS (T0 contracts). All OPTIONAL. Filled by migrateTalents (core/Save.ts) on load, once (flags['tb.migrated']).
  /** WoW-style talent build: class + spec tree allocations per spec, saved loadouts, removal counter (GDD_TALENTS §2.7–§2.8). */
  tb?: TalentBuild;
  /** Skill mastery (Ustalık) XP per skill id (GDD_TALENTS §4.2). */
  skillMastery?: Record<string, number>;
  /** Passive extras (GDD_TALENTS §3.7–§3.8): chosen option per passive node id, and jewel per socket id (null = empty). */
  passiveExtra?: { picks: Record<string, number>; jewels: Record<string, ItemInstance | null> };
  // ---- GDD_ITEMS_V2 (IT-00). All OPTIONAL. core/Save.ts normaliseCharacterSave() fills `upg` on load.
  /** Talih Birikimi (failstacks) + fails / wins / destroy streak / best + the Basma Günlüğü ring buffer (GDD_ITEMS_V2 §2.3, §2.10). */
  upg?: UpgState;
  /** House (one per character, GDD_ITEMS_V2 §5.2.8). Owner-only data. */
  home?: HomeSave;
  /** Camp rested pool and hearthstone timer (GDD_ITEMS_V2 §5.1). */
  camp?: CampState;
  // ---- GDD_LIFE (L-00). OPTIONAL. normaliseCharacterSave() fills `{}` on load.
  /** Gathering and crafting skill per profession (GDD_LIFE §1.2 / §1.3). */
  professions?: Partial<Record<ProfessionId, ProfessionSave>>;
}

/** Lightweight summary used in menus and in network handshakes. */
export interface CharacterSummary {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  itemLevel: number;
  rating: number;
  variant: number;
  /** GDD_LIFE / UX-41 (append-only): combat role of the active spec (Tank / Şifacı / Hasarcı). Absent before a spec. */
  role?: "tank" | "healer" | "dps";
}
