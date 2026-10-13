// CW-02 · Pseudo-random distribution (COMBAT_WOW §2.7). Pure: the RNG is injected.
// Attempt n (counted since the last proc for that key) procs with chance min(1, C * n). C is solved so the long-run rate equals
// the nominal chance p. Test vectors: 10 % -> 0.01475, 20 % -> 0.0557, 25 % -> 0.0847, 30 % -> 0.1189.

const cCache = new Map<number, number>();

/** Long-run proc rate for a given C: 1 / expected attempts until the first proc. */
export function prdRate(c: number): number {
  let surv = 1;
  let expected = 0;
  for (let n = 1; n < 1e7; n++) {
    expected += surv;
    surv *= 1 - Math.min(1, c * n);
    if (surv <= 0) break;
  }
  return 1 / expected;
}

/** Solves C for a nominal chance p in (0, 1). Cached. */
export function prdC(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const hit = cCache.get(p);
  if (hit !== undefined) return hit;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (prdRate(mid) < p) lo = mid; else hi = mid;
  }
  const c = (lo + hi) / 2;
  cCache.set(p, c);
  return c;
}

/** Per-key PRD state. `roll` is mean-preserving: dry streaks and double procs are both bounded. */
export class Prd {
  private attempts = new Map<string, number>();

  roll(key: string, p: number, rng: () => number): boolean {
    if (p <= 0) return false;
    if (p >= 1) { this.attempts.set(key, 0); return true; }
    const n = (this.attempts.get(key) ?? 0) + 1;
    const chance = Math.min(1, prdC(p) * n);
    if (rng() < chance) { this.attempts.set(key, 0); return true; }
    this.attempts.set(key, n);
    return false;
  }

  /** Attempts since the last proc for `key` (0 when unknown). */
  count(key: string): number { return this.attempts.get(key) ?? 0; }

  reset(key?: string): void {
    if (key === undefined) this.attempts.clear();
    else this.attempts.delete(key);
  }
}
