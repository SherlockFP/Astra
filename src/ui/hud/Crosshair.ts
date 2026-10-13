import * as THREE from 'three';
import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { UI } from '../UI';
import { div, pulse, setClass } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

const _v = new THREE.Vector3();

/** Reticle position in canvas CSS px: screen centre in action mode, the mouse in classic mode. */
export function reticle(ui: UI): { x: number; y: number; ok: boolean } {
  const action = G.settings.data.cameraMode === 'action';
  if (action) return { x: ui.viewW / 2, y: ui.viewH / 2, ok: !ui.wantsCursor() };
  return { x: G.input.mouseX, y: G.input.mouseY, ok: !G.input.pointerOverUI && !ui.wantsCursor() };
}

/** Enemy whose screen silhouette is under the reticle (soft target), nearest to the reticle centre. */
export function findHoverTarget(ctx: HudCtx): Actor | null {
  const w = ctx.world;
  const p = ctx.player;
  if (!w || !p || p.isDead) return null;
  const ui = ctx.ui;
  const ret = reticle(ui);
  if (!ret.ok) return null;
  const cam = G.engine.activeCamera as THREE.PerspectiveCamera;
  if (!cam || !(cam as THREE.PerspectiveCamera).isPerspectiveCamera) return null;
  const f = ui.viewH / (2 * Math.tan((cam.fov * Math.PI) / 360));
  let best: Actor | null = null;
  let bestScore = 1e9;
  const px = p.position.x, pz = p.position.z;
  for (const e of w.enemies) {
    if (e.isDead || e.removed) continue;
    const dx = e.position.x - px, dz = e.position.z - pz;
    if (dx * dx + dz * dz > 48 * 48) continue;
    e.pointAt(0.5, _v);
    const camDist = _v.distanceTo(cam.position);
    if (!ui.projectWorld(_v.x, _v.y, _v.z, _p)) continue;
    const rpx = Math.max(16, ((e.radius + 0.45) / Math.max(0.5, camDist)) * f);
    const d = Math.hypot(_p.x - ret.x, _p.y - ret.y);
    if (d <= rpx * 1.2) {
      const score = d / rpx;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
  }
  return best;
}
const _p = { x: 0, y: 0 };

/** Centre crosshair (action mode) with enemy-hover state and hit/crit/kill markers. */
export class Crosshair implements HudWidget {
  readonly el: HTMLElement;
  private marker: HTMLElement;

  constructor() {
    this.el = div('xh');
    div('xh-dot', this.el);
    for (let i = 1; i <= 4; i++) div('xh-t t' + i, this.el);
    this.marker = div('xh-hit', this.el);
    for (let i = 1; i <= 4; i++) div('xh-m m' + i, this.marker);
    G.events.on('damage', (e) => {
      const me = G.player;
      if (!me || e.sourceId !== me.id || e.targetId === me.id) return;
      if (e.kind === 'dot') return;
      this.marker.classList.remove('crit', 'kill');
      if (e.crit) this.marker.classList.add('crit');
      pulse(this.marker, 'go');
    });
    G.events.on('death', (e) => {
      const me = G.player;
      if (!me || e.killerId !== me.id) return;
      this.marker.classList.remove('crit');
      this.marker.classList.add('kill');
      pulse(this.marker, 'go');
    });
  }

  update(ctx: HudCtx): void {
    const show = (ctx.mode === 'town' || ctx.mode === 'dungeon') && G.settings.data.cameraMode === 'action' && !ctx.ui.wantsCursor() && !!ctx.player && !ctx.player.isDead;
    setClass(this.el, 'on', show);
    setClass(this.el, 'hover', show && !!ctx.hover);
    const boss = ctx.hover && (ctx.hover as unknown as { isBoss?: boolean }).isBoss;
    setClass(this.el, 'boss', show && !!boss);
  }
}
