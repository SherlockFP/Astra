/**
 * Per-session combat counters of the LOCAL player (GDD_V2 §8.10 feed): parries, ripostes, poise breaks, Kritik Vuruş,
 * guard blocks and breaks, charged releases. The run summary / HUD read `snapshot()`; nothing here affects gameplay.
 * OWNER: combat module.
 */
export type MeterKey = 'parry' | 'riposte' | 'poiseBreak' | 'finisher' | 'guardBlock' | 'guardBreak' | 'chargeHeavy' | 'chargeArt' | 'interrupt';

export class CombatMeters {
  private counts: Partial<Record<MeterKey, number>> = {};

  add(key: MeterKey, n = 1): void {
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }

  get(key: MeterKey): number {
    return this.counts[key] ?? 0;
  }

  snapshot(): Partial<Record<MeterKey, number>> {
    return { ...this.counts };
  }

  reset(): void {
    this.counts = {};
  }
}
