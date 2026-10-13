import '../styles/hud-onboard.css';
import { G } from '../../game/G';
import type { UI } from '../UI';
import { ICON, div, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { recommend } from '../panels/game/guideEngine';
import { guideTarget, type GuideTarget } from './questMarks';
import type { HudCtx, HudWidget } from './types';

/** On-screen band: a target inside this inset floats at its projected point (px). */
const EDGE_INSET = 56;
/** Off-screen: the medallion is clamped to an ellipse this far inside the viewport (px). */
const CLAMP_INSET = 64;
/** Arrival radius (m): NPCs the player talks to, and everything else. */
const ARRIVE_NPC_M = 3;
const ARRIVE_M = 10;
/** Walking this far away re-arms an arrived target (m). */
const REARM_M = 25;
/** Height above the ground at which the medallion floats (m). */
const LIFT_M = 2.8;
/** Target lookup period (s): recommend() is the costly part, so the target is refreshed at 2 Hz (§4.4: ≤ 10 Hz). */
const LOOKUP_S = 0.5;

const KIND_CLASS: Record<GuideTarget['kind'], string> = { talk: 'oa-gold', turnin: 'oa-gold', kill: 'oa-blue', explore: 'oa-blue', dungeon: 'oa-violet' };
const KIND_ICON: Partial<Record<GuideTarget['kind'], string>> = { kill: 'skill-sword-slash', explore: 'ui-map', dungeon: 'ui-dungeon' };

/**
 * Objective arrow (§4.4): one diamond medallion at a time for the pinned quest, a ready turn-in or the recommended giver.
 * On screen it floats over the target with the distance under it; off screen it is clamped to an ellipse inside the
 * viewport and its chevron points at the target. Arrival (10 m, 3 m for NPCs) flashes once and hides it until the player
 * walks 25 m away. It hides under open panels, in the layout editor, and when Settings.questArrow is off.
 * OWNER: hud module.
 */
export class ObjectiveArrow implements HudWidget {
  readonly el: HTMLElement;
  private readonly medal: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly dist: HTMLElement;
  private readonly name: HTMLElement;
  private target: GuideTarget | null = null;
  private acc = LOOKUP_S;
  private arrivedKey: string | null = null;
  private shownKey = '';
  private kindCls = '';
  private readonly out = { x: 0, y: 0 };

  constructor(private ui: UI) {
    this.el = div('objective-arrow');
    setDisplay(this.el, false);
    this.medal = div('oa-medal', this.el);
    this.glyph = div('oa-glyph', this.medal);
    this.icon = iconEl(null, 'oa-ico', this.medal);
    div('oa-chev', this.el);
    this.dist = div('oa-dist', this.el);
    this.name = div('oa-name', this.el);
  }

  update(ctx: HudCtx): void {
    this.acc += ctx.dt;
    if (this.acc >= LOOKUP_S) {
      this.acc = 0;
      this.target = this.lookup();
    }
    const t = this.target;
    const p = G.player;
    const settingOn = G.settings?.data.questArrow !== false;
    if (!t || !p || !settingOn || ctx.ui.wantsCursor() || this.ui.hud?.editing) return this.hide();

    if (t.key !== this.shownKey) {
      this.shownKey = t.key;
      this.arrivedKey = null;
      this.setKind(t.kind);
      setText(this.glyph, t.kind === 'turnin' ? '?' : t.kind === 'talk' ? '!' : '');
      setText(this.name, t.label);
      setIconUrl(this.icon, KIND_ICON[t.kind] ? ICON(KIND_ICON[t.kind]!) : null);
    }

    const dx = t.x - p.position.x;
    const dz = t.z - p.position.z;
    const d = Math.hypot(dx, dz);
    if (this.arrivedKey === t.key) {
      if (d > REARM_M) this.arrivedKey = null;
    } else if (d < (t.kind === 'talk' || t.kind === 'turnin' ? ARRIVE_NPC_M : ARRIVE_M)) {
      this.arrivedKey = t.key;
      pulse(this.el, 'arrive');
      return this.hide();
    }
    if (this.arrivedKey === t.key) return this.hide();

    const ok = ctx.ui.projectWorld(t.x, p.position.y + LIFT_M, t.z, this.out);
    const W = ctx.ui.viewW;
    const H = ctx.ui.viewH;
    const onScreen = ok && this.out.x > EDGE_INSET && this.out.x < W - EDGE_INSET && this.out.y > EDGE_INSET && this.out.y < H - EDGE_INSET;
    let x: number;
    let y: number;
    let angleDeg = 0;
    if (onScreen) {
      x = this.out.x;
      y = this.out.y;
      setClass(this.el, 'off', false);
    } else {
      let vx: number;
      let vy: number;
      if (ok) {
        vx = this.out.x - W / 2;
        vy = this.out.y - H / 2;
      } else {
        // behind the camera: project the bearing onto the camera's right / forward axes (screen y points down)
        const cam = ctx.ui.camera;
        if (cam) {
          const e = cam.matrixWorld.elements;
          const sx = dx * e[0] + dz * e[2];
          const sf = -(dx * e[8] + dz * e[10]);
          vx = sx;
          vy = -sf;
        } else {
          vx = dx;
          vy = dz;
        }
      }
      const a = Math.atan2(vy, vx);
      const rx = W / 2 - CLAMP_INSET;
      const ry = H / 2 - CLAMP_INSET;
      x = W / 2 + Math.cos(a) * rx;
      y = H / 2 + Math.sin(a) * ry;
      angleDeg = (a * 180) / Math.PI;
      setClass(this.el, 'off', true);
    }
    setStyle(this.el, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`);
    setStyle(this.el, '--a', `${angleDeg.toFixed(1)}deg`);
    setText(this.dist, formatDistance(d));
    if (!this.el.classList.contains('on')) {
      setDisplay(this.el, true, 'flex');
      void this.el.offsetWidth;
      setClass(this.el, 'on', true);
    }
  }

  reset(): void {
    this.target = null;
    this.acc = LOOKUP_S;
    this.hide();
  }

  private lookup(): GuideTarget | null {
    const ch = G.character;
    let giver: string | null = null;
    if (ch) {
      try {
        const rq = recommend(ch).quest;
        giver = rq && rq.state === 'available' ? rq.giverNpcId ?? null : null;
      } catch {
        giver = null;
      }
    }
    return guideTarget(giver);
  }

  private setKind(kind: GuideTarget['kind']): void {
    const want = KIND_CLASS[kind];
    if (want === this.kindCls) return;
    if (this.kindCls) this.el.classList.remove(this.kindCls);
    this.el.classList.add(want);
    this.kindCls = want;
  }

  private hide(): void {
    if (!this.el.classList.contains('on') && this.el.style.display === 'none') return;
    this.el.classList.remove('on');
    setTimeout(() => {
      if (!this.el.classList.contains('on')) setDisplay(this.el, false);
    }, 250);
  }
}

/** Distance label (§4.4): whole metres below 100 m, 5 m steps from 100 m up. */
export function formatDistance(d: number): string {
  if (d < 100) return `${Math.round(d)} m`;
  return `${Math.round(d / 5) * 5} m`;
}
