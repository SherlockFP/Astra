import '../styles/hud-threat.css';
import { G } from '../../game/G';
import type { PendingThreat } from '../../combat/HitShapes';
import type { TelegraphShape } from '../../types/vfx';
import { div, setClass, setDisplay, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Only windups this close (m, from the player) are shown. */
const RANGE_M = 30;
/** Tolerance (m) on every shape edge, so a player standing on the rim is still warned. */
const DANGER_EXTRA = 0.4;

/** Is the point (px, pz) inside the telegraph shape placed at (ox, oz) facing (dx, dz)? Same geometry the hit uses. */
export function inShape(shape: TelegraphShape, ox: number, oz: number, dx: number, dz: number, px: number, pz: number): boolean {
  const vx = px - ox, vz = pz - oz;
  const d = Math.hypot(vx, vz);
  switch (shape.type) {
    case 'circle':
      return d <= shape.radius + DANGER_EXTRA;
    case 'ring':
      return d >= shape.inner - DANGER_EXTRA && d <= shape.outer + DANGER_EXTRA;
    case 'cone': {
      if (d > shape.radius + DANGER_EXTRA) return false;
      if (d < 0.4) return true;
      const cos = (vx * dx + vz * dz) / d;
      return cos >= Math.cos((shape.angle / 2) * (Math.PI / 180));
    }
    case 'line': {
      const along = vx * dx + vz * dz;
      const across = Math.abs(-vx * dz + vz * dx);
      return along >= -DANGER_EXTRA && along <= shape.length + DANGER_EXTRA && across <= shape.width / 2 + DANGER_EXTRA;
    }
    case 'rect': {
      const along = vx * dx + vz * dz;
      const across = Math.abs(-vx * dz + vz * dx);
      return Math.abs(along) <= shape.length / 2 + DANGER_EXTRA && across <= shape.width / 2 + DANGER_EXTRA;
    }
  }
}

/**
 * Where to step: out of a cone, line or circle the escape runs away from the windup origin; a rect or line is left
 * across its width. Returns a unit vector on the ground.
 */
export function escapeDir(t: PendingThreat, px: number, pz: number): [number, number] {
  const vx = px - t.x, vz = pz - t.z;
  const d = Math.hypot(vx, vz);
  if (t.shape.type === 'line' || t.shape.type === 'rect') {
    // side of the line the player stands on, pushed sideways
    const side = -vx * t.dz + vz * t.dx >= 0 ? 1 : -1;
    return [-t.dz * side, t.dx * side];
  }
  if (d < 0.01) return [-t.dx, -t.dz];
  return [vx / d, vz / d];
}

/**
 * Threat arrow (ElvUI-style centre cue, owner-requested "where to move"): one arrow under the crosshair for the most
 * urgent enemy windup within RANGE_M. Red with "Kaç!" when the player stands inside the danger shape (the arrow points
 * out of it); amber with the seconds left when the windup is aimed elsewhere (the arrow points at the enemy).
 * Reads HitShapes.pendingThreats(), so it works for every enemy windup the telegraph system draws.
 * OWNER: combat / HUD (session combat-skills).
 */
export class ThreatArrow implements HudWidget {
  readonly el: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly label: HTMLElement;
  private shown = false;

  constructor() {
    this.el = div('threat-arrow');
    this.arrow = div('threat-arrow-glyph', this.el);
    this.label = div('threat-arrow-label', this.el);
    setDisplay(this.el, false);
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    const threats = G.hitShapes && p && !p.isDead ? G.hitShapes.pendingThreats() : [];
    let best: PendingThreat | null = null;
    let bestD = Infinity;
    let inside = false;
    for (const t of threats) {
      const d = Math.hypot(t.x - p!.position.x, t.z - p!.position.z);
      if (d > RANGE_M) continue;
      const hit = inShape(t.shape, t.x, t.z, t.dx, t.dz, p!.position.x, p!.position.z);
      // inside beats outside; among equals the soonest landing wins
      const score = (hit ? 0 : 1000) + t.remain;
      if (score < bestD) { bestD = score; best = t; inside = hit; }
    }
    if (!best) {
      if (this.shown) { this.shown = false; setDisplay(this.el, false); }
      return;
    }
    if (!this.shown) { this.shown = true; setDisplay(this.el, true); }
    const [ex, ez] = inside ? escapeDir(best, p!.position.x, p!.position.z) : [best.x - p!.position.x, best.z - p!.position.z];
    // bearing of the vector relative to the character's facing (0 = straight ahead, the arrow glyph points up)
    const rel = Math.atan2(ex, ez) - p!.yaw;
    setStyle(this.arrow, 'transform', `rotate(${((rel * 180) / Math.PI).toFixed(0)}deg)`);
    setClass(this.el, 'danger', inside);
    setClass(this.el, 'warn', !inside);
    setText(this.label, inside ? 'Kaç!' : `${best.name ?? 'Tehlike'} ${best.remain.toFixed(1).replace('.', ',')} sn`);
  }

  reset(): void {
    this.shown = false;
    setDisplay(this.el, false);
  }
}
