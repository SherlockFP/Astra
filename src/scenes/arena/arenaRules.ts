import type { ArenaBracket, ArenaProfile } from '../../types/finder';
import { ARENA_BRACKETS } from '../../types/finder';

/**
 * ARENA RATING, SEASONS, TIERS AND REWARDS (GDD_PVP_FINDER §3.4, §4.2, package PV-04). PURE: no G, no clocks (callers pass week / day keys),
 * so the node sim (dev/combat-sim/arena.mjs) tests the exact functions the game uses. Persistence is systems/ArenaLadder.ts.
 *
 * Two numbers per bracket:
 *  - MMR (hidden): classic Elo over the TEAM means (E = 1 / (1 + 10^((opp - me) / 400))), K 48 while provisional, 32 after, 24 from 2100.
 *    Matchmaking (`qann.mmr`) and the result means use it.
 *  - rating (visible, the ladder): moves with the MMR delta but lags behind it: a player whose MMR is above the visible rating gains more
 *    and loses less until the two meet (and the other way round). With rating == MMR (every new character) the delta IS the Elo delta,
 *    which is what GDD §9.4 item 4 checks (+-1).
 */

export const RATING = {
  START: 1500,
  MAX: 5000,
  K_PROVISIONAL: 48,
  K: 32,
  K_HIGH: 24,
  HIGH_FROM: 2100,
  PROVISIONAL_GAMES: 10,
  /** Visible rating pulls toward the MMR by at most this factor (+-50 % of the delta). */
  LAG_SPAN: 400,
  LAG_MAX: 0.5,
  /** Soft reset at a season change: new = START + (old - START) x this. */
  SEASON_KEEP: 0.5,
} as const;

/** Season length in weeks (mythic week counter, core/utils weekIndex). */
export const PVP_SEASON_WEEKS = 8;
/** World position (metres) of an arena tile coordinate pair (GDD cell-edge convention: x 1.5 = the centre of cell 1; TILE_SIZE = 4 m). */
export const tileToWorld = (p: readonly [number, number]): { x: number; z: number } => ({ x: p[0] * 4, z: p[1] * 4 });

/** Arena entry level (GDD §7: level 1 refused; reuses the open-world flagging minimum). */
export const ARENA_MIN_LEVEL = 20;

// ---------------------------------------------------------------------------------------------------------------------
// tiers (the ladder) and season titles
// ---------------------------------------------------------------------------------------------------------------------

export interface ArenaTier { id: string; name: string; min: number }
/** Ladder by visible rating. The top three are the GDD §3.4 titles (Gladyatör >= 1800, Şampiyon >= 2100, Kadim Savaşçı >= 2400). */
export const ARENA_TIERS: readonly ArenaTier[] = [
  { id: 'acemi', name: 'Acemi', min: 0 },
  { id: 'savasci', name: 'Savaşçı', min: 1100 },
  { id: 'rakip', name: 'Rakip', min: 1400 },
  { id: 'duellocu', name: 'Düellocu', min: 1600 },
  { id: 'gladyator', name: 'Gladyatör', min: 1800 },
  { id: 'sampiyon', name: 'Şampiyon', min: 2100 },
  { id: 'kadim', name: 'Kadim Savaşçı', min: 2400 },
];

export function tierOf(rating: number): ArenaTier & { index: number; next: ArenaTier | null; toNext: number } {
  const r = Math.max(0, Number.isFinite(rating) ? rating : 0);
  let idx = 0;
  for (let i = 0; i < ARENA_TIERS.length; i++) if (r >= ARENA_TIERS[i].min) idx = i;
  const next = ARENA_TIERS[idx + 1] ?? null;
  return { ...ARENA_TIERS[idx], index: idx, next, toNext: next ? Math.max(0, next.min - Math.floor(r)) : 0 };
}

/** Title ids saved in `CharacterSave.titles` (ranked, per bracket, highest reached, kept forever) and shown with `arenaTitleName`. */
export const TITLE_TIERS: readonly string[] = ['gladyator', 'sampiyon', 'kadim'];
export const titleId = (tierId: string, bracket: ArenaBracket): string => `pvp_${tierId}_${bracket}`;
/** Season title ids: awarded at the season change for the best rating reached in the ended season (Gladyatör and above). */
export const seasonTitleId = (season: number, tierId: string, bracket: ArenaBracket): string => `pvp_s${season + 1}_${tierId}_${bracket}`;

export function arenaTitleName(id: string): string | null {
  const m = /^pvp_(?:s(\d+)_)?(gladyator|sampiyon|kadim)_(1v1|2v2|3v3)$/.exec(id);
  if (!m) return null;
  const tier = ARENA_TIERS.find((t) => t.id === m[2]);
  if (!tier) return null;
  return m[1] ? `${tier.name} (Sezon ${m[1]}, ${m[3]})` : `${tier.name} (${m[3]})`;
}

/** Titles earned at `rating` in `bracket`: every title tier from Gladyatör up to the one reached. */
export function titlesFor(rating: number, bracket: ArenaBracket): string[] {
  const t = tierOf(rating);
  return TITLE_TIERS.filter((id) => ARENA_TIERS.findIndex((x) => x.id === id) <= t.index).map((id) => titleId(id, bracket));
}

// ---------------------------------------------------------------------------------------------------------------------
// seasons / weeks
// ---------------------------------------------------------------------------------------------------------------------

export const seasonOfWeek = (week: number): number => Math.floor(Math.max(0, week) / PVP_SEASON_WEEKS);
/** 1..8. */
export const weekInSeason = (week: number): number => (Math.max(0, Math.floor(week)) % PVP_SEASON_WEEKS) + 1;
/** Weekly Fetih earning cap: min(3000, 1000 + 250 x (week in season - 1)). */
export const fetihWeekCap = (wis: number): number => Math.min(3000, 1000 + 250 * (Math.max(1, Math.min(PVP_SEASON_WEEKS, Math.floor(wis))) - 1));
/** Shared daily Onur cap (GDD_LIFE §7.7). */
export const ONUR_DAY_CAP = 1500;
/** Fetih mührü: 1 per ranked win in the last two weeks of the season. */
export const isMuhruWeek = (wis: number): boolean => wis >= PVP_SEASON_WEEKS - 1;

export const softReset = (rating: number): number => Math.max(0, Math.round(RATING.START + (rating - RATING.START) * RATING.SEASON_KEEP));

/**
 * Season names (GDD_PVP_FINDER §3.4 season line). Season n (1-based) runs from `start` for PVP_SEASON_WEEKS weeks, on the same week origin
 * as seasonOfWeek (core/utils weekIndex, Mondays 2024-01-01 + 8 weeks per season). Seasons past the table show "Sezon N" until a name is
 * added here. The dates are the table's own labels and the sim checks them against seasonStartMs.
 */
export interface ArenaSeasonDef { n: number; name: string; start: string }
export const ARENA_SEASONS: readonly ArenaSeasonDef[] = [
  { n: 1, name: 'Kızıl Kum', start: '2024-01-01' },
  { n: 2, name: 'Ayaz Kılıcı', start: '2024-02-26' },
  { n: 3, name: 'Kadim Alev', start: '2024-04-22' },
  { n: 4, name: 'Gölge Kapısı', start: '2024-06-17' },
  { n: 5, name: 'Zümrüt Ova', start: '2024-08-12' },
  { n: 6, name: 'Demir Fırtına', start: '2024-10-07' },
  { n: 7, name: 'Kara Kurt', start: '2024-12-02' },
  { n: 8, name: 'Kehanet Yıldızı', start: '2025-01-27' },
];
/** Start of season n (1-based) in ms, same origin and week length as core/utils weekIndex. */
export const seasonStartMs = (n: number): number => Date.UTC(2024, 0, 1) + (Math.max(1, Math.floor(n)) - 1) * PVP_SEASON_WEEKS * 7 * 24 * 3600 * 1000;
/** Season label for the UI: "Sezon 1: Kızıl Kum", or "Sezon 19" when the table has no name for it. */
export function seasonTitle(n: number): string {
  const d = ARENA_SEASONS.find((s) => s.n === n);
  return d ? `Sezon ${n}: ${d.name}` : `Sezon ${n}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// presence rating (lpres `ar`, systems/Social.ts): the best 2v2 / 3v3 rating of a player and its tier
// ---------------------------------------------------------------------------------------------------------------------

export type PresenceBracket = '2v2' | '3v3';
export interface ArenaPresence { rating: number; bracket: PresenceBracket; tier: string }

/** The presence line of a player: the higher of 2v2 / 3v3 (2v2 on a tie). The tier is derived from the rating, never sent. */
export function presenceOf(rating: Record<ArenaBracket, number>): ArenaPresence {
  const bracket: PresenceBracket = rating['3v3'] > rating['2v2'] ? '3v3' : '2v2';
  const r = Math.max(0, Math.min(RATING.MAX, Math.round(rating[bracket])));
  return { rating: r, bracket, tier: tierOf(r).id };
}

/** Strict receipt check of the wire field `ar` ({ r, b }): a bad value means "no rating" (null). Rating clamped to 0..RATING.MAX. */
export function sanitizePresence(raw: unknown): ArenaPresence | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { r?: unknown; b?: unknown };
  if (typeof o.r !== 'number' || !Number.isFinite(o.r)) return null;
  if (o.b !== '2v2' && o.b !== '3v3') return null;
  const r = Math.max(0, Math.min(RATING.MAX, Math.round(o.r)));
  return { rating: r, bracket: o.b, tier: tierOf(r).id };
}

// ---------------------------------------------------------------------------------------------------------------------
// Elo
// ---------------------------------------------------------------------------------------------------------------------

/** Expected score of a side with team rating `me` against `opp`. */
export const expectedScore = (me: number, opp: number): number => 1 / (1 + Math.pow(10, (opp - me) / 400));

export function kFactor(games: number, mmr: number): number {
  if (games < RATING.PROVISIONAL_GAMES) return RATING.K_PROVISIONAL;
  return mmr >= RATING.HIGH_FROM ? RATING.K_HIGH : RATING.K;
}

export const teamMean = (ratings: readonly number[]): number => (ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : RATING.START);

/** Elo delta for one side: `S` 1 win / 0 loss / 0.5 draw (a match draw changes nothing: pass `draw` and get 0). */
export function eloDelta(args: { teamMmr: number; oppMmr: number; won: boolean | 'draw'; games: number; mmr: number }): number {
  if (args.won === 'draw') return 0;
  const e = expectedScore(args.teamMmr, args.oppMmr);
  return Math.round(kFactor(args.games, args.mmr) * ((args.won ? 1 : 0) - e));
}

export interface BracketStats { rating: number; mmr: number; games: number; wins: number; peak: number }
export interface RatingStep { delta: number; mmrDelta: number; before: number; after: number; mmrAfter: number }

/**
 * One ranked result for one player. `myMean` / `oppMean` are the TEAM mean MMRs (result.mean). `farmMult` (0..1) scales a GAIN only (anti
 * win-trading, see ArenaLadder.farm). Returns the new stats (not mutated) and the step.
 */
export function applyRanked(
  s: BracketStats, myMean: number, oppMean: number, won: boolean | 'draw', farmMult = 1,
): { stats: BracketStats; step: RatingStep } {
  const mmrDelta0 = eloDelta({ teamMmr: myMean, oppMmr: oppMean, won, games: s.games, mmr: s.mmr });
  const mmrDelta = mmrDelta0 > 0 ? Math.round(mmrDelta0 * Math.max(0, Math.min(1, farmMult))) : mmrDelta0;
  let delta = mmrDelta;
  if (mmrDelta !== 0) {
    const g = Math.max(-RATING.LAG_MAX, Math.min(RATING.LAG_MAX, (s.mmr - s.rating) / RATING.LAG_SPAN));
    const dir = mmrDelta > 0 ? 1 : -1;
    delta = Math.round(mmrDelta * (1 + g * dir));
    if (delta * dir < 1) delta = dir; // a decided match always moves the ladder by at least 1
  }
  const rating = Math.max(0, Math.min(RATING.MAX, s.rating + delta));
  const mmr = Math.max(0, Math.min(RATING.MAX, s.mmr + mmrDelta));
  return {
    stats: { rating, mmr, games: s.games + (won === 'draw' ? 0 : 1), wins: s.wins + (won === true ? 1 : 0), peak: Math.max(s.peak, rating) },
    step: { delta: rating - s.rating, mmrDelta: mmr - s.mmr, before: s.rating, after: rating, mmrAfter: mmr },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// rewards (§4.2)
// ---------------------------------------------------------------------------------------------------------------------

export type Outcome = 'win' | 'loss' | 'draw';

export const REWARDS = {
  onur: { unrankedWin: 30, unrankedLoss: 10, rankedWin: 20, rankedLoss: 5, firstWin: 100 },
  fetih: { win: 30, winBonusOppHigher: 5, bonusGap: 100, loss: 8 },
  /** A match draw pays half of a win. */
  drawFactor: 0.5,
} as const;

export interface RewardInput {
  ranked: boolean;
  outcome: Outcome;
  myMean: number;
  oppMean: number;
  /** First arena win of the day not yet taken. */
  firstWinAvailable: boolean;
  onurEarnedToday: number;
  fetihEarnedWeek: number;
  /** 1..8 */
  weekInSeason: number;
  /** A forfeiting player gets nothing (match left by choice). */
  leaver?: boolean;
}
export interface RewardOut {
  onur: number;
  fetih: number;
  muhru: number;
  firstWin: boolean;
  /** What the caps cut off (UI hint "Haftalık sınır doldu"). */
  fetihCapped: boolean;
  onurCapped: boolean;
}

export function rewardsFor(r: RewardInput): RewardOut {
  const none: RewardOut = { onur: 0, fetih: 0, muhru: 0, firstWin: false, fetihCapped: false, onurCapped: false };
  if (r.leaver) return none;
  const O = REWARDS.onur, F = REWARDS.fetih;
  let onur = r.outcome === 'win' ? (r.ranked ? O.rankedWin : O.unrankedWin) : r.outcome === 'loss' ? (r.ranked ? O.rankedLoss : O.unrankedLoss)
    : Math.round((r.ranked ? O.rankedWin : O.unrankedWin) * REWARDS.drawFactor);
  let firstWin = false;
  if (r.outcome === 'win' && r.firstWinAvailable) {
    onur += O.firstWin;
    firstWin = true;
  }
  let fetih = 0;
  if (r.ranked) {
    if (r.outcome === 'win') fetih = F.win + (r.oppMean >= r.myMean + F.bonusGap ? F.winBonusOppHigher : 0);
    else if (r.outcome === 'loss') fetih = F.loss;
    else fetih = Math.round(F.win * REWARDS.drawFactor);
  }
  const onurRoom = Math.max(0, ONUR_DAY_CAP - Math.max(0, r.onurEarnedToday));
  const fetihRoom = Math.max(0, fetihWeekCap(r.weekInSeason) - Math.max(0, r.fetihEarnedWeek));
  const onurCapped = onur > onurRoom;
  const fetihCapped = fetih > fetihRoom;
  onur = Math.min(onur, onurRoom);
  fetih = Math.min(fetih, fetihRoom);
  const muhru = r.ranked && r.outcome === 'win' && isMuhruWeek(r.weekInSeason) ? 1 : 0;
  return { onur, fetih, muhru, firstWin: firstWin && onur > 0, fetihCapped, onurCapped };
}

// ---------------------------------------------------------------------------------------------------------------------
// hit rules (GDD §3.5.4 items 1-2: same match, live phase, other team, both alive)
// ---------------------------------------------------------------------------------------------------------------------

export type ArenaDeny = 'phase' | 'self' | 'team' | 'dead' | 'unknown' | null;
export interface ArenaHitCtx {
  phase: string;
  aId: number;
  vId: number;
  /** Team of the attacker / victim entity, undefined when the entity is not in this match. */
  aTeam: 'A' | 'B' | undefined;
  vTeam: 'A' | 'B' | undefined;
  aDead: boolean;
  vDead: boolean;
}
/** May the attacker hurt the victim? null = yes. No damage in prep / round_end / match_end, never a teammate, never the dead, never a stranger. */
export function arenaDeny(c: ArenaHitCtx): ArenaDeny {
  if (c.phase !== 'live') return 'phase';
  if (c.aId === c.vId) return 'self';
  if (!c.aTeam || !c.vTeam) return 'unknown';
  if (c.aTeam === c.vTeam) return 'team';
  if (c.aDead || c.vDead) return 'dead';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// leave / forfeit penalty
// ---------------------------------------------------------------------------------------------------------------------

/** Queue lock minutes by forfeits in the last 24 h: 5, 15, 30, 60 (max). */
export const LEAVE_LOCK_MIN: readonly number[] = [5, 15, 30, 60];
export function leaveLock(leavesToday: number): number {
  return LEAVE_LOCK_MIN[Math.min(LEAVE_LOCK_MIN.length, Math.max(1, leavesToday)) - 1];
}

// ---------------------------------------------------------------------------------------------------------------------
// profile defaults / season rollover (no storage here)
// ---------------------------------------------------------------------------------------------------------------------

const perBracket = <T>(v: T): Record<ArenaBracket, T> => ({ '1v1': v, '2v2': v, '3v3': v });

export function newProfile(season: number): ArenaProfile {
  return {
    season,
    rating: perBracket(RATING.START), mmr: perBracket(RATING.START), games: perBracket(0), wins: perBracket(0), peak: perBracket(RATING.START),
    firstWinDay: -1,
    lockUntil: 0, leaves: { n: 0, day: -1 }, history: [],
  };
}

/** Fills missing fields of an old / partial profile (a save from an older build). Mutates and returns it. */
export function normaliseProfile(p: Partial<ArenaProfile> | undefined, season: number): ArenaProfile {
  const base = newProfile(season);
  if (!p) return base;
  const out = p as ArenaProfile;
  out.season = Number.isFinite(out.season) ? out.season : season;
  for (const k of ['rating', 'mmr', 'games', 'wins', 'peak'] as const) {
    const cur = (out[k] ??= base[k]) as Record<ArenaBracket, number>;
    for (const b of ARENA_BRACKETS) if (!Number.isFinite(cur[b])) cur[b] = base[k][b];
  }
  out.firstWinDay = Number.isFinite(out.firstWinDay) ? out.firstWinDay : -1;
  out.lockUntil = Number.isFinite(out.lockUntil) ? out.lockUntil : 0;
  out.leaves ??= base.leaves;
  out.history ??= [];
  return out;
}

/**
 * Season rollover: archive the ended season's best, soft-reset rating and MMR, clear games / wins. Returns the title ids the ended season
 * earned (Gladyatör+ per bracket, by the PEAK). Mutates `p`.
 */
export function rollSeason(p: ArenaProfile, season: number): { titles: string[]; archived: boolean } {
  if (season <= p.season) return { titles: [], archived: false };
  const titles: string[] = [];
  const best = perBracket<number>(RATING.START);
  for (const b of ARENA_BRACKETS) {
    best[b] = p.peak[b];
    const t = tierOf(p.peak[b]);
    for (const tid of TITLE_TIERS) {
      if (ARENA_TIERS.findIndex((x) => x.id === tid) <= t.index) titles.push(seasonTitleId(p.season, tid, b));
    }
  }
  p.history.push({ season: p.season, best });
  if (p.history.length > 8) p.history.splice(0, p.history.length - 8);
  for (const b of ARENA_BRACKETS) {
    p.rating[b] = softReset(p.rating[b]);
    p.mmr[b] = softReset(p.mmr[b]);
    p.games[b] = 0;
    p.wins[b] = 0;
    p.peak[b] = p.rating[b];
  }
  p.season = season;
  return { titles, archived: true };
}
