import type { EntityId } from '../types/common';
import type { DeathHealEntry, DeathHitEntry, DeathRecap } from '../types/deathLog';

/** GDD_V2 §8.5: 10 s window, at most 40 entries per list. */
export const DEATH_LOG_WINDOW = 10;
export const DEATH_LOG_MAX = 40;

/** Fixed-capacity ring: the oldest entry is overwritten first. `toArray()` returns oldest -> newest. */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.buf = new Array<T | undefined>(Math.max(1, Math.floor(capacity)));
  }

  get size(): number {
    return this.count;
  }

  push(v: T): void {
    this.buf[this.head] = v;
    this.head = (this.head + 1) % this.buf.length;
    if (this.count < this.buf.length) this.count++;
  }

  toArray(): T[] {
    const out: T[] = [];
    const n = this.buf.length;
    const start = (this.head - this.count + n) % n;
    for (let i = 0; i < this.count; i++) out.push(this.buf[(start + i) % n] as T);
    return out;
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}

/**
 * Rolling log of the LOCAL player's incoming hits and received heals (GDD_V2 §8.5). Combat records into it; `recap()` builds the
 * snapshot that Combat publishes as `death:recap` on death. Pure data, no game references, so it is testable on its own.
 */
export class DeathLog {
  private readonly hits = new RingBuffer<DeathHitEntry>(DEATH_LOG_MAX);
  private readonly heals = new RingBuffer<DeathHealEntry>(DEATH_LOG_MAX);

  recordHit(e: DeathHitEntry): void {
    this.hits.push(e);
  }

  recordHeal(e: DeathHealEntry): void {
    this.heals.push(e);
  }

  /** Hits inside the window ending at `now`, oldest first. */
  hitsSince(now: number, windowSec = DEATH_LOG_WINDOW): DeathHitEntry[] {
    return this.hits.toArray().filter((h) => now - h.t <= windowSec);
  }

  healsSince(now: number, windowSec = DEATH_LOG_WINDOW): DeathHealEntry[] {
    return this.heals.toArray().filter((h) => now - h.t <= windowSec);
  }

  /**
   * Snapshot at the moment of death. `unused` are the Turkish labels of the defensives that were ready (filled by Combat, which knows
   * the potions and dodge charges).
   */
  recap(now: number, unused: string[] = [], windowSec = DEATH_LOG_WINDOW): DeathRecap {
    const hits = this.hitsSince(now, windowSec);
    const heals = this.healsSince(now, windowSec);
    const killingBlow = hits.length ? hits[hits.length - 1] : null;

    const bySource = new Map<string, { source: EntityId | null; name: string; amount: number }>();
    let taken = 0;
    for (const h of hits) {
      taken += h.amount;
      const key = h.source === null ? '#env' : String(h.source);
      const cur = bySource.get(key) ?? { source: h.source, name: h.sourceName, amount: 0 };
      cur.amount += h.amount;
      bySource.set(key, cur);
    }
    const topSources = [...bySource.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);

    let healed = 0;
    for (const h of heals) healed += h.amount;

    return {
      at: now,
      windowSec,
      hits,
      heals,
      killingBlow,
      topSources,
      taken,
      healed,
      avoidable: !!killingBlow && killingBlow.avoidable,
      hpSeries: hits.map((h) => ({ t: h.t, hpPct: h.hpPct })),
      unused: unused.slice(),
    };
  }

  clear(): void {
    this.hits.clear();
    this.heals.clear();
  }
}
