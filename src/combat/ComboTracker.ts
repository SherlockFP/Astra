import { G } from '../game/G';
import { FEEL } from './feel';

/**
 * Hit-combo counter of the LOCAL player (Hero Siege / DMC style). Every landed hit on an enemy inside the window
 * (2 s, refreshed on each hit) increments the count; tiers (0..4) give the HUD an escalating style and a small damage bonus.
 * Emits 'combo:changed' {count, tier} on every change and {0,0} when the window expires or the player dies.
 * OWNER: combat module.
 */
export class ComboTracker {
  count = 0;
  tier = 0;
  private timer = 0;
  /** Best combo this scene (for run summaries / toasts). */
  best = 0;
  /** Called when a hit pushes the combo into a higher tier (Combat plays a small flourish). */
  onTierUp: ((tier: number) => void) | null = null;

  /** Damage multiplier granted by the current tier. */
  get bonus(): number {
    return 1 + FEEL.comboBonus[this.tier];
  }

  /** 0..1 how much of the window is left (HUD decay bar). */
  get windowFrac(): number {
    return this.count > 0 ? Math.max(0, this.timer / FEEL.comboWindow) : 0;
  }

  tierFor(count: number): number {
    let t = 0;
    for (let i = 0; i < FEEL.comboTiers.length; i++) if (count >= FEEL.comboTiers[i]) t = i + 1;
    return t;
  }

  /** Register `hits` landed hits (one swing hitting 3 enemies counts 3 but never more than +4 per call). */
  onHit(hits = 1): void {
    hits = Math.max(1, Math.min(4, hits));
    this.count += hits;
    this.timer = FEEL.comboWindow;
    const prevTier = this.tier;
    this.tier = this.tierFor(this.count);
    if (this.count > this.best) this.best = this.count;
    this.emit();
    if (this.tier > prevTier) {
      try { this.onTierUp?.(this.tier); } catch { /* ignore */ }
    }
  }

  /**
   * A completed combo route (GDD_V2 §3.9) gives one extra tier: the count jumps to the next tier threshold (no-op at the top tier,
   * the window is only refreshed). Same change / tier-up path as onHit.
   */
  bumpTier(): void {
    this.timer = FEEL.comboWindow;
    if (this.tier >= FEEL.comboTiers.length) return;
    this.count = Math.max(this.count, FEEL.comboTiers[this.tier]);
    const prevTier = this.tier;
    this.tier = this.tierFor(this.count);
    if (this.count > this.best) this.best = this.count;
    this.emit();
    if (this.tier > prevTier) {
      try { this.onTierUp?.(this.tier); } catch { /* ignore */ }
    }
  }

  /** Extend the window a bit without counting (kills, skill casts) so the chain feels forgiving. */
  extend(sec = 0.5): void {
    if (this.count > 0) this.timer = Math.min(FEEL.comboWindow, this.timer + sec);
  }

  reset(): void {
    if (this.count === 0 && this.tier === 0) return;
    this.count = 0;
    this.tier = 0;
    this.timer = 0;
    this.emit();
  }

  /**
   * GDD_LIFE §5.9 drain: when the window expires the tier drops ONE step per `FEEL.comboDrain` seconds (the count is set to the new
   * tier's threshold) instead of resetting, so sustained play keeps its reward. A hit inside the drain climbs back at once.
   */
  update(dt: number): void {
    if (this.count <= 0) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.tier <= 0) {
      this.reset();
      return;
    }
    const nt = this.tier - 1;
    this.tier = nt;
    this.count = nt === 0 ? 0 : FEEL.comboTiers[nt - 1];
    this.timer = nt === 0 ? 0 : FEEL.comboDrain;
    this.emit();
  }

  private emit(): void {
    G.events?.emit('combo:changed', { count: this.count, tier: this.tier });
  }
}
