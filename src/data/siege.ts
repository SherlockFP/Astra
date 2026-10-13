import type { NationId } from './nations';

/**
 * KALE KUŞATMASI (MMO pillars WP-14). PURE data: no G, no three.js, importable from the node sims.
 *
 * A weekly 30-minute siege at a fortress in Karakır Bozkırı. The schedule is a pure function of the UTC clock (Saturday 17:00 UTC
 * = 20:00 in Turkey, UTC+3), announced by the open-world calendar (scenes/world/EventCalendar.ts). Inside the fortress arena,
 * during the window, players of DIFFERENT guilds may hurt each other; the banner in the middle is captured by holding it for
 * HOLD_SEC seconds. The guild holding the banner at the end wins. Rewards are LOCAL and trust-based (see docs/MMO_PILLARS.md).
 */

/** The open-world map that hosts the fortress (`DungeonDef.id` of Karakır Bozkırı). */
export const SIEGE_MAP_ID = 'karakir_bozkiri';

export const SIEGE = {
  /** Date.getUTCDay() of the window start: 6 = Saturday. */
  WEEKDAY_UTC: 6,
  /** Start hour in UTC (17:00 UTC = 20:00 UTC+3). */
  START_HOUR_UTC: 17,
  /** Window length (s). */
  DUR_SEC: 1800,
  /** Announcements before the start (s), ascending. Same lead times as the event calendar. */
  LEADS_SEC: [300, 60] as readonly number[],
  /** The banner flips after this many seconds of uncontested presence of one guild. */
  HOLD_SEC: 60,
  /** Progress runs back at this speed while the banner is empty or the holder's guild stands alone. */
  DECAY: 1,
  /** Pazar tax cut for the members of the holding guild (share of the tax that is waived). */
  TAX_CUT: 0.1,
  /** The winning nation's buff: duration (s) and XP bonus (percent). */
  ZAFER_SEC: 3600,
  ZAFER_XP_PCT: 5,
  /** Hit reach for the arena: a player counts as "inside" when within this distance of the fortress centre (m). */
  ARENA_R: 40,
  /** Banner capture radius (m) around the centre. */
  BANNER_R: 16,
  /** Entry gate of the fortress fight (the Karakır map levels 30-45). Under-levelled players are neither targets nor threats. */
  MIN_LEVEL: 30,
} as const;

/** Fortress site. Tile [162, 92] of region r9 (Rüzgâr Yaylası), between the camps; centre in metres (tile centre = (t + 0.5) * 4). */
export const SIEGE_FORT = {
  id: 'bozkir_kalesi',
  name: 'Bozkır Kalesi',
  regionId: 'r9',
  tile: [162, 92] as [number, number],
  center: [650, 370] as [number, number],
} as const;

/** One guild's holder record (the banner, or the last winner). */
export interface SiegeHolderRec {
  gid: string;
  name: string;
  /** Majority nation of the guild's capturers (null: tie or unknown). */
  nation: NationId | null;
}

/** Week 0 starts on the Saturday 1970-01-03 00:00 UTC (the first Saturday after the epoch). */
export const SIEGE_ANCHOR_MS = Date.UTC(1970, 0, 3, 0, 0, 0);
export const WEEK_MS = 7 * 24 * 3600 * 1000;

/** Epoch ms of the window start of week `w` (Saturday 17:00 UTC). */
export const siegeStartOf = (w: number): number => SIEGE_ANCHOR_MS + w * WEEK_MS + SIEGE.START_HOUR_UTC * 3600 * 1000;

/** The week index a moment falls in (weeks start on Saturday 00:00 UTC). */
export const siegeWeekOf = (ms: number): number => Math.floor((ms - SIEGE_ANCHOR_MS) / WEEK_MS);
