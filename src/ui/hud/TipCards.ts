import '../styles/hud-onboard.css';
import { G } from '../../game/G';
import type { Enemy } from '../../entities/Enemy';
import { TIPS, tipView, type TipCtx, type TipDef } from '../../data/tips';
import { expandKeys, isWowScheme, keyLabel } from '../widgets/controlHints';
import type { UI } from '../UI';
import { ICON, div, h, iconEl, setDisplay, setClass, setStyle, setText, span, uiSound } from '../widgets/dom';
import { unspentTalentPoints } from './Extras';
import { guideWanted } from '../../systems/onboarding';
import type { HudCtx, HudWidget } from './types';

/** Scheduler period (s): tips are picked twice a second, never per frame (§4.7). */
const TICK_S = 0.5;
/** Minimum gap between two tips (ms). */
const GAP_MS = 25_000;
/** Life of a card (ms): it auto-hides after this, no click needed. */
const LIFE_MS = 8_000;
/** Combat counts as "in combat" this long after the last hit either way (ms). */
const COMBAT_HOLD_MS = 6_000;
/** Enemy distance that counts as "first enemy" (m), and loot distance (m). */
const ENEMY_NEAR_M = 18;
const DROP_NEAR_M = 8;
/** Save flag written by the welcome card (§4.10). */
const WELCOME_FLAG = 'onb.welcome';

/**
 * One-time tip card (§4.7): anchored in `.hud-tip` (bottom-left, above the chat), one at a time, 8 s life, click-through (it never
 * blocks the play area; only its buttons take clicks),
 * `✓ Anladım` dismisses, `Bir daha gösterme` sets Settings.showTips to false. The scheduler runs every 0.5 s, picks the
 * highest-priority tip whose condition holds and whose flag `tip.<id>` is unset, and never shows one while a panel is open,
 * the player is dead, or during combat unless the tip allows it. The condition inputs come from game events and the
 * character save; the table is data/tips.ts.
 * OWNER: hud module.
 */
export class TipCards implements HudWidget {
  readonly el: HTMLElement;
  private readonly card: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly keys: HTMLElement;
  private cur: { def: TipDef; left: number } | null = null;
  private acc = 0;
  private lastShownAt = -Infinity;
  private sceneStart = 0;
  private startPos: { x: number; z: number } | null = null;
  private moved = false;
  private promptSince = -1;
  private lastCombatAt = -Infinity;
  private bigHit = false;
  private dropNear = false;
  private questAccepted = false;
  private majorReady = false;

  constructor(private ui: UI) {
    this.el = div('tip-cards');
    this.card = div('tip-card k-plate', this.el);
    setDisplay(this.card, false);
    div('tip-stripe', this.card);
    iconEl(ICON('ui-star'), 'tip-medal', this.card);
    const body = div('tip-body', this.card);
    this.title = div('tip-title', body);
    this.text = div('tip-text', body);
    this.keys = div('tip-keys', body);
    const foot = div('tip-foot', body);
    const never = h('button', 'tip-never', foot, 'Bir daha gösterme');
    never.type = 'button';
    never.addEventListener('click', (e) => {
      e.stopPropagation();
      G.settings?.set('showTips', false);
      this.hide();
    });
    const ok = h('button', 'tip-ok k-btn k-btn--sm', foot, '✓ Anladım');
    ok.type = 'button';
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
    div('tip-bar', this.card);

    G.events.on('scene:changed', () => {
      this.sceneStart = performance.now();
      this.startPos = null;
      this.moved = false;
      this.promptSince = -1;
      this.hide();
    });
    G.events.on('interact:prompt', ({ text }) => {
      if (!text) this.promptSince = -1;
      else if (this.promptSince < 0) this.promptSince = performance.now();
    });
    G.events.on('damage', (e) => {
      const p = G.player;
      if (!p) return;
      if (e.targetId === p.id) {
        this.lastCombatAt = performance.now();
        if (e.sourceId !== null && p.maxHp > 0 && e.amount >= p.maxHp * 0.1) this.bigHit = true;
      } else if (e.sourceId === p.id) this.lastCombatAt = performance.now();
    });
    G.events.on('loot:dropped', ({ pos }) => {
      const p = G.player;
      if (!p) return;
      if (Math.hypot(pos[0] - p.position.x, pos[2] - p.position.z) <= DROP_NEAR_M) this.dropNear = true;
    });
    G.events.on('quest:updated', ({ state }) => {
      if (state === 'active') this.questAccepted = true;
    });
    G.events.on('skill:ready', ({ major }) => {
      if (major) this.majorReady = true;
    });
  }

  update(ctx: HudCtx): void {
    this.acc += ctx.dt;
    if (this.acc < TICK_S) return;
    const dt = this.acc;
    this.acc = 0;
    const now = performance.now();

    // a running card counts down (hover pauses it) and leaves when a panel opens or the player turns the tips off
    if (this.cur) {
      this.cur.left -= dt * 1000;
      if (this.cur.left <= 0 || ctx.ui.wantsCursor() || G.settings?.data.showTips === false) this.hide();
      return;
    }

    const ch = G.character;
    const p = G.player;
    if (!ch || !p || G.settings?.data.showTips === false) return;
    if (ctx.mode !== 'town' && ctx.mode !== 'dungeon') return;
    if (p.isDead || ctx.ui.wantsCursor()) return;
    if (ch.save.level <= 2 && !ch.save.flags[WELCOME_FLAG]) return;
    // the first-10-minutes guide (ui/hud/Onboarding.ts) owns the tip slot while it runs
    if (guideWanted(ch.save)) return;
    if (now - this.lastShownAt < GAP_MS) return;

    if (!this.startPos) this.startPos = { x: p.position.x, z: p.position.z };
    if (!this.moved && Math.hypot(p.position.x - this.startPos.x, p.position.z - this.startPos.z) > 0.5) this.moved = true;
    const c = this.context(ctx, now);
    let best: TipDef | null = null;
    for (const d of TIPS) {
      if (ch.save.flags['tip.' + d.id]) continue;
      if (c.inCombat && !d.inCombat) continue;
      if (best && best.prio >= d.prio) continue;
      let ok = false;
      try {
        ok = d.when(c);
      } catch {
        ok = false;
      }
      if (ok) best = d;
    }
    if (best) this.show(best, c);
  }

  reset(): void {
    this.hide();
  }

  private context(ctx: HudCtx, now: number): TipCtx {
    const ch = G.character!;
    const p = G.player!;
    const save = ch.save;
    const enemies = (ctx.world?.enemies ?? []) as Enemy[];
    let enemyNear = false;
    for (const e of enemies) {
      if (e.isDead || e.removed) continue;
      if (Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) <= ENEMY_NEAR_M) {
        enemyNear = true;
        break;
      }
    }
    const flags = save.flags;
    return {
      level: save.level,
      inTown: ctx.mode === 'town',
      inCombat: now - this.lastCombatAt < COMBAT_HOLD_MS,
      hpFrac: p.maxHp > 0 ? p.hp / p.maxHp : 1,
      sceneAge: (now - this.sceneStart) / 1000,
      moved: this.moved,
      promptHeld: this.promptSince >= 0 && now - this.promptSince >= 1000,
      enemyNear,
      bigHit: this.bigHit,
      dropNear: this.dropNear,
      bagHasItem: save.bag.some((x) => !!x),
      hasPotion: (save.materials?.pot_hp_1 ?? 0) > 0,
      questAccepted: this.questAccepted,
      waypointFound: Object.keys(flags).some((k) => k.startsWith('world.wp.') && flags[k] === true),
      unspent: unspentTalentPoints(),
      specChosen: !!save.spec,
      majorReady: this.majorReady,
      flag: (k: string) => !!flags[k],
    };
  }

  private show(def: TipDef, c: TipCtx): void {
    const ch = G.character;
    if (!ch) return;
    ch.save.flags['tip.' + def.id] = 1;
    ch.persist();
    this.lastShownAt = performance.now();
    setText(this.title, `İpucu · ${def.title}`);
    const view = tipView(def, c, { wow: isWowScheme(), expand: expandKeys, label: keyLabel });
    setText(this.text, view.text);
    this.keys.textContent = '';
    for (const k of view.keys) span('k-key k-key--dim', this.keys, k);
    setDisplay(this.keys, view.keys.length > 0, 'flex');
    this.cur = { def, left: LIFE_MS };
    setStyle(this.card, '--life', `${LIFE_MS}ms`);
    setDisplay(this.card, true, 'flex');
    // restart the hairline animation and the slide-in
    this.card.classList.remove('on');
    void this.card.offsetWidth;
    this.card.classList.add('on');
    uiSound('ui_open', 0.3);
  }

  private hide(): void {
    if (!this.cur) return;
    this.cur = null;
    this.card.classList.remove('on');
    setTimeout(() => {
      if (!this.cur) setDisplay(this.card, false);
    }, 200);
  }
}
