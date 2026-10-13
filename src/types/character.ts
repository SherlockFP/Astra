import type { ClassId } from './common';
import type { EquipSlot, ItemInstance } from './items';
import type { MythicProfile } from './mythic';
import type { SkillSlotKey } from './skills';
import type { SpecId } from './v2';
import type { TalentBuild } from './talents';
import type { CampState, HomeSave, UpgState } from './itemsV2';
import type { ProfessionId, ProfessionSave } from './professions';
import type { NationId } from '../data/nations';

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
  /** WP-08 achievements (systems/Achievements.ts). OPTIONAL, created on first use. Earned title ids go to `titles`, the chosen one to `title`. */
  achievements?: AchievementSave;
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
  // ---- CM14 Pazar (CORE_MECHANICS §11). OPTIONAL, created on first use by systems/Market.ts.
  /** Sales log of the player's stall (newest last, capped) plus what the player has not seen yet (next-login summary). */
  market?: MarketSave;
  // ---- WP-06 / WP-07 Uluslar + Kızıl Sınır (data/nations.ts, systems/Pvp.ts). OPTIONAL, append-only.
  /** Nation chosen at creation. Absent on old saves: CharacterState.ensureNation() stores the hash default of the id on first load. */
  nation?: NationId;
  /** PvP record of the character (owner-stored, like every personal counter). */
  pvp?: PvpSave;
}

/** WP-07: lifetime PvP record. `honour` is the spendable Onur balance, `honourTotal` the lifetime sum (achievement metric). */
export interface PvpSave {
  kills: number;
  deaths: number;
  honour: number;
  honourTotal: number;
  /** Highest kill streak reached. */
  bestStreak: number;
  /** Capture points this character helped flip. */
  captures: number;
}

/**
 * WP-08: achievement progress of one character (append-only). `prog` holds counters (add) and maxima (max) by metric id,
 * `sets` the distinct ids seen per set metric (waypoints, regions, quests...), `done` the unlock time (Date.now()) per
 * achievement id. Unknown keys are ignored, so old data keeps working when achievements are added.
 */
export interface AchievementSave {
  prog: Record<string, number>;
  sets: Record<string, string[]>;
  done: Record<string, number>;
  /** One-time backfill level (systems/Achievements.ts backfill). Absent = not backfilled yet. */
  v?: number;
}

/** CM14: one finished sale of the local player's stall. */
export interface MarketSaleRecord {
  /** Date.now() of the sale. */
  t: number;
  /** Item display name (with quantity for stacks). */
  name: string;
  rarity: string;
  /** Gold the buyer paid. */
  price: number;
  /** Gold the seller received (price minus Pazar Vergisi). */
  net: number;
  /** Buyer character name when the buy message carried it. */
  buyer?: string;
}

/** CM14: persisted market bookkeeping of one character. */
export interface MarketSaveData {
  sales: MarketSaleRecord[];
  /** Sales / gold since the player last looked at the log (shown as a summary on the next login). */
  unseenCount: number;
  unseenGold: number;
  /** Lifetime totals. */
  totalSold: number;
  totalGold: number;
}
export type MarketSave = MarketSaveData;

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
  /** WP-06 (append-only): nation of the character (party gate, nameplate colour, PvP hostility). Absent from old clients. */
  nation?: NationId;
}
