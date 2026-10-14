import type { ArenaPhase } from '../../types/arena';
import type { ArenaBracket } from '../../types/finder';
import { NET } from '../../net/messages';
import { dampenPct } from '../../combat/pvp';

/**
 * ARENA MATCH STATE MACHINE (GDD_PVP_FINDER §3.3, package PV-04). PURE and host-driven: no G, no three.js, no timers of its own. The host's
 * ArenaController feeds it `tick(dt)`, `down(peer)` and `leave(peer)` and turns the events it emits into `arena` messages; the sim
 * (dev/combat-sim/arena.mjs) drives it with a fake clock.
 *
 *   loading -> prep (30 s, gates closed, invulnerable) -> live (max 300 s) -> round_end (15 s) -> prep -> ... -> match_end
 *
 * Rules (GDD §3.3.1 and §7, conflicts resolved in favour of the strings table: "{name} maçtan ayrıldı. Maç sonlandı."):
 *  - best of 3: first to 2 round wins;
 *  - a round ends when a team has no living fighter (simultaneous wipes within one tick are a draw round), or at 300 s: more living
 *    fighters win, then the larger sum of remaining HP fractions, then a draw round;
 *  - two draw rounds make a MATCH DRAW (no rating change, half rewards);
 *  - a fighter who leaves forfeits the whole match: the other team wins (`why: 'forfeit'`); leaving before the first prep voids the match;
 *  - the host leaving voids the match (no rating, no rewards): `voidMatch()`;
 *  - dampening (Yıpranma) follows the live clock of the round (combat/pvp.ts dampenPct) and is announced once a second.
 */

export type { ArenaBracket, ArenaPhase };

export interface ArenaMatchOpts {
  matchId: string;
  bracket: ArenaBracket;
  ranked: boolean;
  teams: { A: string[]; B: string[] };
  /** Team mean MMRs (set by the proposer from the matcher's numbers). */
  mean: [number, number];
  prepSec?: number;
  roundSec?: number;
  intermissionSec?: number;
  /** Draw rounds that make a match draw. */
  drawsToVoid?: number;
  winsNeeded?: number;
}

export type ArenaEvent =
  | { k: 'phase'; ph: 'prep' | 'live' | 'round_end' | 'match_end'; round: number; left: number; score: [number, number]; rw?: 'A' | 'B' | 'draw' }
  | { k: 'damp'; pct: number }
  | { k: 'out'; peer: string; team: 'A' | 'B' }
  | { k: 'forfeit'; peer: string }
  | { k: 'result'; result: ArenaResult };

export interface ArenaResult {
  winner: 'A' | 'B' | 'draw';
  why: 'normal' | 'forfeit' | 'draw' | 'void';
  score: [number, number];
  mean: [number, number];
}

export class ArenaMatch {
  phase: ArenaPhase = 'loading';
  round = 1;
  score: [number, number] = [0, 0];
  draws = 0;
  /** Seconds left in the current phase (prep / live / round_end). */
  left = 0;
  /** Seconds since the gates opened this round. */
  liveSec = 0;
  result: ArenaResult | null = null;
  readonly alive = new Set<string>();
  readonly present = new Set<string>();
  readonly teamOf = new Map<string, 'A' | 'B'>();
  private lastDampSec = -1;
  readonly prepSec: number;
  readonly roundSec: number;
  readonly intermissionSec: number;
  readonly drawsToVoid: number;
  readonly winsNeeded: number;

  constructor(readonly o: ArenaMatchOpts, private readonly emit: (e: ArenaEvent) => void, private readonly hpFrac: (peer: string) => number = () => 1) {
    this.prepSec = o.prepSec ?? NET.ARENA_PREP_SEC;
    this.roundSec = o.roundSec ?? NET.ARENA_ROUND_SEC;
    this.intermissionSec = o.intermissionSec ?? NET.ARENA_INTERMISSION_SEC;
    this.drawsToVoid = o.drawsToVoid ?? 2;
    this.winsNeeded = o.winsNeeded ?? 2;
    for (const t of ['A', 'B'] as const) for (const p of o.teams[t]) this.teamOf.set(p, t);
  }

  get over(): boolean { return this.phase === 'match_end'; }
  get dampPct(): number { return this.phase === 'live' ? dampenPct(this.liveSec) : 0; }
  aliveCount(team: 'A' | 'B'): number {
    let n = 0;
    for (const p of this.alive) if (this.teamOf.get(p) === team) n++;
    return n;
  }

  /** Everybody is in the arena scene: start round 1's prep. */
  begin(): void {
    if (this.phase !== 'loading') return;
    for (const p of this.teamOf.keys()) this.present.add(p);
    this.startPrep();
  }

  private startPrep(): void {
    this.phase = 'prep';
    this.left = this.prepSec;
    this.liveSec = 0;
    this.lastDampSec = -1;
    this.alive.clear();
    for (const p of this.present) this.alive.add(p);
    this.emit({ k: 'phase', ph: 'prep', round: this.round, left: this.left, score: [...this.score] as [number, number] });
  }

  private startLive(): void {
    this.phase = 'live';
    this.liveSec = 0;
    this.left = this.roundSec;
    this.emit({ k: 'phase', ph: 'live', round: this.round, left: this.left, score: [...this.score] as [number, number] });
    this.emit({ k: 'damp', pct: 0 });
    this.lastDampSec = 0;
  }

  tick(dt: number): void {
    if (!(dt > 0) || this.over) return;
    if (this.phase === 'prep') {
      this.left -= dt;
      if (this.left <= 0) this.startLive();
      return;
    }
    if (this.phase === 'round_end') {
      this.left -= dt;
      if (this.left <= 0) {
        this.round++;
        this.startPrep();
      }
      return;
    }
    if (this.phase !== 'live') return;
    this.liveSec += dt;
    this.left = Math.max(0, this.roundSec - this.liveSec);
    const a = this.aliveCount('A'), b = this.aliveCount('B');
    if (a === 0 || b === 0) {
      this.endRound(a === 0 && b === 0 ? 'draw' : a === 0 ? 'B' : 'A');
      return;
    }
    const sec = Math.floor(this.liveSec);
    if (sec !== this.lastDampSec) {
      this.lastDampSec = sec;
      this.emit({ k: 'damp', pct: Math.round(this.dampPct * 10) / 10 });
    }
    if (this.liveSec >= this.roundSec) this.endRound(this.timeoutWinner(a, b));
  }

  private timeoutWinner(a: number, b: number): 'A' | 'B' | 'draw' {
    if (a !== b) return a > b ? 'A' : 'B';
    const hp = (t: 'A' | 'B'): number => {
      let s = 0;
      for (const p of this.alive) if (this.teamOf.get(p) === t) s += Math.max(0, Math.min(1, this.hpFrac(p)));
      return s;
    };
    const ha = hp('A'), hb = hp('B');
    if (Math.abs(ha - hb) < 1e-6) return 'draw';
    return ha > hb ? 'A' : 'B';
  }

  /** A fighter died (live only). Resolution happens in the next tick so simultaneous deaths are one draw round. */
  down(peer: string): void {
    if (this.phase !== 'live' || !this.alive.has(peer)) return;
    this.alive.delete(peer);
    this.emit({ k: 'out', peer, team: this.teamOf.get(peer) ?? 'A' });
  }

  private endRound(rw: 'A' | 'B' | 'draw'): void {
    if (rw === 'draw') this.draws++;
    else this.score[rw === 'A' ? 0 : 1]++;
    this.liveSec = Math.min(this.liveSec, this.roundSec);
    if (this.draws >= this.drawsToVoid) return this.finish({ winner: 'draw', why: 'draw', score: [...this.score] as [number, number], mean: this.o.mean }, rw);
    if (this.score[0] >= this.winsNeeded || this.score[1] >= this.winsNeeded) {
      const winner = this.score[0] >= this.winsNeeded ? 'A' : 'B';
      return this.finish({ winner, why: 'normal', score: [...this.score] as [number, number], mean: this.o.mean }, rw);
    }
    this.phase = 'round_end';
    this.left = this.intermissionSec;
    this.emit({ k: 'phase', ph: 'round_end', round: this.round, left: this.left, score: [...this.score] as [number, number], rw });
  }

  private finish(r: ArenaResult, rw?: 'A' | 'B' | 'draw'): void {
    if (this.result) return;
    this.phase = 'match_end';
    this.left = 0;
    this.result = r;
    this.emit({ k: 'phase', ph: 'match_end', round: this.round, left: 0, score: r.score, ...(rw ? { rw } : {}) });
    this.emit({ k: 'result', result: r });
  }

  /** A fighter left (closed the game, left the room, disconnected). Forfeits the match for his team. */
  leave(peer: string): void {
    const team = this.teamOf.get(peer);
    if (!team || this.over) return;
    this.present.delete(peer);
    this.alive.delete(peer);
    if (this.phase === 'loading') return this.voidMatch();
    this.emit({ k: 'forfeit', peer });
    const w = team === 'A' ? 'B' : 'A';
    const score: [number, number] = [...this.score] as [number, number];
    score[w === 'A' ? 0 : 1] = Math.max(score[w === 'A' ? 0 : 1], this.winsNeeded);
    this.finish({ winner: w, why: 'forfeit', score, mean: this.o.mean });
  }

  /** The host left, or the match could not start: no rating, no rewards. */
  voidMatch(): void {
    if (this.over) return;
    this.finish({ winner: 'draw', why: 'void', score: [...this.score] as [number, number], mean: this.o.mean });
  }
}
