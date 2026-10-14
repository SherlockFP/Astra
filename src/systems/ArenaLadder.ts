import type { ArenaBracket, ArenaProfile } from '../types/finder';
import { ARENA_BRACKETS } from '../types/finder';
import {
  ONUR_DAY_CAP, PVP_SEASON_WEEKS, applyRanked, fetihWeekCap, leaveLock, normaliseProfile, rewardsFor, rollSeason, seasonOfWeek, tierOf,
  titlesFor, weekInSeason, type ArenaTier, type Outcome, type RatingStep,
} from '../scenes/arena/arenaRules';

/**
 * ARENA LADDER (GDD_PVP_FINDER §3.4 / §4.2): the persistent side of the rating system. Reads and writes `CharacterSave.arena`
 * (ArenaProfile) through a small context, so the node sim can run it against a plain object and the game wires it to CharacterState
 * (systems/ArenaLadderG.ts, `G.arenaLadder`). The math is scenes/arena/arenaRules.ts (pure).
 *
 * Owner-stored (NETCODE §5): every peer applies ITS OWN result from the host's `arena {k:'result'}` (winner + team mean MMRs); nobody
 * writes another player's profile. Rewards go out through systems/PvpGear.ts (`grantOnur` / `grantFetih`: the shared daily Onur and weekly
 * Fetih caps live there, so world PvP and arenas count against the same limits) and `addMaterial` for `fetih_muhru`.
 */

export const CURRENCY = { onur: 'onur_puani', fetih: 'fetih_puani', muhru: 'fetih_muhru' } as const;

export interface LadderSave {
  arena?: ArenaProfile;
  titles?: string[];
}

export interface LadderCtx {
  save(): LadderSave | null;
  persist(): void;
  /** Mythic week counter (core/utils weekIndex). */
  week(): number;
  /** Local day key (equality only; systems/Bounties bountyDayKey). */
  day(): number;
  /** Epoch ms. */
  nowMs(): number;
  addMaterial(id: string, n: number): void;
  /** PvpGear.grantOnur / grantFetih: pay with the shared caps, return what was granted. */
  grantOnur(n: number): number;
  grantFetih(n: number): number;
  /** PvpGear.onurToday / fetihThisWeek: earned so far (for the cap preview). */
  onurToday(): { earned: number; cap: number };
  fetihWeek(): { earned: number; cap: number };
  /** Optional hooks: Onur lifetime counter / event, rating event, toast. */
  onHonor?(amount: number): void;
  onRating?(bracket: ArenaBracket, before: number, after: number): void;
  onTitle?(id: string): void;
}

export interface ArenaOutcome {
  bracket: ArenaBracket;
  ranked: boolean;
  /** Winner of the match, from `arena {k:'result'}`. */
  winner: 'A' | 'B' | 'draw';
  why: 'normal' | 'forfeit' | 'draw' | 'void';
  myTeam: 'A' | 'B';
  /** Team mean MMRs [A, B]. */
  mean: [number, number];
  /** Peer ids of the opposing team (anti win-trading). */
  opponents: string[];
  /** The local player left the match (forfeit): loss, no rewards. */
  leaver?: boolean;
}

export interface ArenaApplied {
  outcome: Outcome | 'void';
  rating: RatingStep | null;
  rewards: { onur: number; fetih: number; muhru: number; firstWin: boolean; fetihCapped: boolean; onurCapped: boolean };
  titles: string[];
}

export interface SeasonInfo {
  /** Display number (1-based). */
  season: number;
  /** 1..8 */
  week: number;
  weeks: number;
  fetih: { earned: number; cap: number };
  onur: { earned: number; cap: number };
}

/** Same opposing set repeatedly inside an hour pays 100 / 50 / 25 / 0 % of a GAIN (anti win-trading, mirrors PvpRules.AntiFarm). */
export const FARM = { windowMs: 3600000, mult: [1, 0.5, 0.25, 0] as readonly number[] } as const;

export class ArenaLadder {
  private readonly farm = new Map<string, { n: number; t: number }>();

  constructor(private readonly ctx: LadderCtx) {}

  /** The profile, created or normalised on first use, rolled to the current season (titles of the ended season are granted). */
  profile(): ArenaProfile | null {
    const save = this.ctx.save();
    if (!save) return null;
    const season = seasonOfWeek(this.ctx.week());
    const fresh = !save.arena;
    const p = (save.arena = normaliseProfile(save.arena, season));
    let dirty = fresh;
    if (season > p.season) {
      const before = { ...p.rating };
      const r = rollSeason(p, season);
      for (const t of r.titles) this.grantTitle(save, t);
      for (const b of ARENA_BRACKETS) if (before[b] !== p.rating[b]) this.ctx.onRating?.(b, before[b], p.rating[b]);
      dirty = true;
    }
    if (dirty) this.ctx.persist();
    return p;
  }

  rating(bracket: ArenaBracket): number { return this.profile()?.rating[bracket] ?? 1500; }
  mmr(bracket: ArenaBracket): number { return this.profile()?.mmr[bracket] ?? 1500; }
  games(bracket: ArenaBracket): number { return this.profile()?.games[bracket] ?? 0; }
  /** Tier of the bracket rating (Acemi ... Kadim Savaşçı). */
  tier(bracket: ArenaBracket): ArenaTier & { index: number; next: ArenaTier | null; toNext: number } {
    return tierOf(this.rating(bracket));
  }
  /** Best bracket rating (lobby / summary `pvpRating`). */
  best(): number {
    const p = this.profile();
    return p ? Math.max(...ARENA_BRACKETS.map((b) => p.rating[b])) : 0;
  }

  season(): SeasonInfo {
    const p = this.profile();
    const week = this.ctx.week();
    const wis = weekInSeason(week);
    void p;
    return { season: seasonOfWeek(week) + 1, week: wis, weeks: PVP_SEASON_WEEKS, fetih: this.ctx.fetihWeek(), onur: this.ctx.onurToday() };
  }

  /** Epoch ms until which the queue is locked (0 / past = free). */
  lockedUntil(): number {
    return this.profile()?.lockUntil ?? 0;
  }
  lockRemainingMs(): number {
    return Math.max(0, this.lockedUntil() - this.ctx.nowMs());
  }

  /** The local player left a live match: counts the forfeit and locks the queue (5 / 15 / 30 / 60 min by the leaves of the day). Returns minutes. */
  penalizeLeave(): number {
    const p = this.profile();
    if (!p) return 0;
    const day = this.ctx.day();
    if (p.leaves.day !== day) p.leaves = { n: 0, day };
    p.leaves.n++;
    const min = leaveLock(p.leaves.n);
    p.lockUntil = Math.max(p.lockUntil, this.ctx.nowMs() + min * 60000);
    this.ctx.persist();
    return min;
  }

  private farmMult(opponents: readonly string[], won: boolean, now: number): number {
    const key = [...opponents].sort().join('|');
    if (!key) return 1;
    for (const [k, v] of this.farm) if (now - v.t > FARM.windowMs) this.farm.delete(k);
    const e = this.farm.get(key);
    const before = e && now - e.t <= FARM.windowMs ? e.n : 0;
    if (won) this.farm.set(key, { n: before + 1, t: now });
    return FARM.mult[Math.min(before, FARM.mult.length - 1)];
  }

  /**
   * Applies one finished match to THIS character: rating / MMR (ranked), rewards (caps from the profile), titles. `void` matches and
   * missing saves change nothing. Idempotence is the caller's job (ArenaController applies each match id once).
   */
  applyResult(r: ArenaOutcome): ArenaApplied {
    const empty: ArenaApplied = { outcome: 'void', rating: null, rewards: { onur: 0, fetih: 0, muhru: 0, firstWin: false, fetihCapped: false, onurCapped: false }, titles: [] };
    const save = this.ctx.save();
    const p = this.profile();
    if (!save || !p || r.why === 'void') return empty;
    const outcome: Outcome = r.winner === 'draw' ? 'draw' : r.winner === r.myTeam ? 'win' : 'loss';
    const myMean = r.mean[r.myTeam === 'A' ? 0 : 1];
    const oppMean = r.mean[r.myTeam === 'A' ? 1 : 0];
    const now = this.ctx.nowMs();
    const farm = this.farmMult(r.opponents, outcome === 'win', now);
    let step: RatingStep | null = null;
    if (r.ranked) {
      const b = r.bracket;
      const res = applyRanked(
        { rating: p.rating[b], mmr: p.mmr[b], games: p.games[b], wins: p.wins[b], peak: p.peak[b] },
        myMean, oppMean, outcome === 'draw' ? 'draw' : outcome === 'win', farm,
      );
      p.rating[b] = res.stats.rating;
      p.mmr[b] = res.stats.mmr;
      p.games[b] = res.stats.games;
      p.wins[b] = res.stats.wins;
      p.peak[b] = res.stats.peak;
      step = res.step;
      if (step.delta !== 0) this.ctx.onRating?.(b, step.before, step.after);
    }
    const week = this.ctx.week();
    const day = this.ctx.day();
    const rw = rewardsFor({
      ranked: r.ranked, outcome, myMean, oppMean, firstWinAvailable: p.firstWinDay !== day,
      onurEarnedToday: this.ctx.onurToday().earned, fetihEarnedWeek: this.ctx.fetihWeek().earned, weekInSeason: weekInSeason(week), leaver: r.leaver,
    });
    // win-trading: a farmed win also pays no Fetih (Onur keeps its small base)
    const wantFetih = outcome === 'win' ? Math.floor(rw.fetih * farm) : rw.fetih;
    const onur = rw.onur > 0 ? this.ctx.grantOnur(rw.onur) : 0;
    if (onur > 0) this.ctx.onHonor?.(onur);
    if (rw.firstWin && onur > 0) p.firstWinDay = day;
    const fetih = wantFetih > 0 ? this.ctx.grantFetih(wantFetih) : 0;
    if (rw.muhru > 0) this.ctx.addMaterial(CURRENCY.muhru, rw.muhru);
    const titles: string[] = [];
    if (r.ranked && step) {
      for (const id of titlesFor(p.peak[r.bracket], r.bracket)) if (this.grantTitle(save, id)) titles.push(id);
    }
    this.ctx.persist();
    return { outcome, rating: step, rewards: { onur, fetih, muhru: rw.muhru, firstWin: rw.firstWin && onur > 0, fetihCapped: rw.fetihCapped, onurCapped: rw.onurCapped }, titles };
  }

  private grantTitle(save: LadderSave, id: string): boolean {
    save.titles ??= [];
    if (save.titles.includes(id)) return false;
    save.titles.push(id);
    this.ctx.onTitle?.(id);
    return true;
  }
}
