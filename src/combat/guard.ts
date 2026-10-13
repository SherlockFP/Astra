import type { ClassId } from '../types/common';

/**
 * Guard stance, Guard Gauge (no stamina) and the perfect-parry window (GDD_V2 §3.4 / §3.5). Pure timing + gauge state:
 * Combat decides what a block or a parry does to the world. Times are the combat sim clock (Combat.clock).
 * OWNER: combat module.
 */

export const PARRY_WINDOW = 0.2;        // s, base parry window (+ S.parryWindow)
export const PARRY_LOCKOUT = 0.6;       // s, a press inside this of the previous one does nothing
export const PARRY_WHIFF_LOWER = 0.15;  // s of guard lowering after a whiffed window
export const GUARD_BREAK_STUN = 1.2;    // s stun on the player when the gauge breaks
export const GUARD_BROKEN_SEC = 2.0;    // s the guard stays disabled after a break
export const GUARD_REGEN_IDLE = 18;     // gauge / s while not guarding (0.8 s after the last block)
export const GUARD_REGEN_HELD = 6;      // gauge / s while guarding and unhit (1.0 s after the last block)

export interface GuardProfile {
  gauge: number;      // Guard Gauge max
  arc: number;        // block arc (degrees, frontal)
  blockBase: number;  // blockAmount before the stat (damage taken x (1 - blockAmount))
}

/** Classes with a sustained guard. Mage / rogue only get the parry window (no gauge). */
export const GUARD_PROFILES: Partial<Record<ClassId, GuardProfile>> = {
  knight: { gauge: 100, arc: 160, blockBase: 0.6 },
  barbarian: { gauge: 60, arc: 120, blockBase: 0.4 },
  paladin: { gauge: 100, arc: 160, blockBase: 0.55 }, // sword + shield like the knight (Koruma adds blockChance / blockAmount from the spec)
};

export function guardProfileOf(classId: ClassId | undefined): GuardProfile | undefined {
  return classId ? GUARD_PROFILES[classId] : undefined;
}

/** Gauge cost of one blocked hit: clamp(8 + 80 x hit / maxHp, 8, 60). */
export function guardCost(hitDamage: number, maxHp: number): number {
  return Math.min(60, Math.max(8, 8 + (80 * Math.max(0, hitDamage)) / Math.max(1, maxHp)));
}

export class GuardState {
  /** Guard stance is up this frame (held, allowed, not busy). */
  held = false;
  gauge = 0;
  max = 0;
  profile: GuardProfile | undefined;
  private parryUntil = -1;
  private lastPressAt = -99;
  private parried = false;
  private lowerUntil = -1;
  private brokenUntil = -1;
  private lastBlockAt = -99;

  setProfile(p: GuardProfile | undefined): void {
    if (p === this.profile) return;
    this.profile = p;
    this.max = p?.gauge ?? 0;
    this.gauge = this.max;
    this.held = false;
  }

  /** 0..1 gauge (HUD arc). */
  get frac(): number {
    return this.max > 0 ? Math.max(0, Math.min(1, this.gauge / this.max)) : 0;
  }

  /** True while the gauge is broken (Siper Kırıldı). */
  get isBroken(): boolean {
    return this.max > 0 && this.gauge <= 0;
  }

  canGuard(now: number): boolean {
    return this.max > 0 && now >= this.brokenUntil && now >= this.lowerUntil;
  }

  /** Opens the parry window. Returns false when the lockout still runs. */
  press(now: number, window: number): boolean {
    if (now - this.lastPressAt < PARRY_LOCKOUT) return false;
    this.lastPressAt = now;
    this.parryUntil = now + window;
    this.parried = false;
    return true;
  }

  parryOpen(now: number): boolean {
    return now < this.parryUntil;
  }

  /** Spends the open window on a parry. False when no window is open. */
  consumeParry(now: number): boolean {
    if (!this.parryOpen(now)) return false;
    this.parryUntil = -1;
    this.parried = true;
    return true;
  }

  /** Spends gauge for a blocked hit. Returns true when the gauge breaks (the guard then drops for GUARD_BROKEN_SEC). */
  block(now: number, cost: number): boolean {
    this.lastBlockAt = now;
    if (this.max <= 0) return false;
    this.gauge = Math.max(0, this.gauge - cost);
    if (this.gauge > 0) return false;
    this.brokenUntil = now + GUARD_BROKEN_SEC;
    this.held = false;
    return true;
  }

  update(dt: number, now: number): void {
    if (this.parryUntil > 0 && now >= this.parryUntil) {
      if (!this.parried) this.lowerUntil = now + PARRY_WHIFF_LOWER;
      this.parryUntil = -1;
    }
    if (this.max > 0 && this.gauge < this.max && now >= this.brokenUntil) {
      const since = now - this.lastBlockAt;
      const rate = this.held ? (since > 1.0 ? GUARD_REGEN_HELD : 0) : since > 0.8 ? GUARD_REGEN_IDLE : 0;
      if (rate > 0) this.gauge = Math.min(this.max, this.gauge + rate * dt);
    }
  }
}
