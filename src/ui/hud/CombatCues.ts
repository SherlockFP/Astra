import * as THREE from 'three';
import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import { COMBAT_FEEL } from '../../combat/feel';
import { clamp01, div, pulse, setClass, setStyle, setText } from '../widgets/dom';
import { slotKeyLabel } from '../widgets/controlHints';
import type { HudCtx, HudWidget } from './types';
import { reticleAtCentre } from './Crosshair';
import '../styles/hud-combat.css';

const _v = new THREE.Vector3();
const _p = { x: 0, y: 0 };
const NS = 'http://www.w3.org/2000/svg';
/** Guard gauge arc under the reticle: 120 degrees of a 30 px circle; pathLength 1 makes the dash array a plain fraction. */
const GUARD_ARC = 'M 26 15 A 30 30 0 0 1 -26 15';
const SHARDS = 7;
/** How long the guard arc shatters after a guard break (ms, performance clock). */
const SHATTER_MS = 800;
/** Guard fraction under which the arc turns red and pulses. */
const LOW_GUARD = 0.3;

type PromptKind = '' | 'riposte' | 'finisher';

function svgEl(tag: string, attrs: Record<string, string>, parent: Element): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
}

/**
 * Combat feedback around the reticle and on the hard target (GDD_V2 §3.4-§3.7). Reads state only; Combat owns the rules.
 *  - parry flash ring + "SAVUŞTURMA!" callout, riposte / Kritik Vuruş callouts when they land;
 *  - guard gauge arc under the crosshair while guarding (red when low, shatter on `guard:broke`);
 *  - LMB prompts: "[Sol Tık] KARŞI VURUŞ" with a timer ring while the riposte status runs, and a pulsing
 *    "[Sol Tık] KRİTİK VURUŞ" when a marked (poise-broken) enemy is in reach (the finisher wins, as in SkillSystem);
 *  - lock-on ring on the hard target while the camera is locked on.
 * OWNER: hud module.
 */
export class CombatCues implements HudWidget {
  readonly el: HTMLElement;
  private center: HTMLElement;
  private flash: HTMLElement;
  private callout: HTMLElement;
  private guard: HTMLElement;
  private guardFill: SVGElement;
  private prompt: HTMLElement;
  private promptText: HTMLElement;
  private promptKey: HTMLElement;
  private lock: HTMLElement;
  private shatterAt = -1e9;
  private kind: PromptKind = '';
  private lastFill = -1;

  constructor() {
    this.el = div('cc');
    this.center = div('cc-center', this.el);
    this.flash = div('cc-flash', this.center);
    this.callout = div('cc-callout', this.center);
    this.guard = div('cc-guard', this.center);
    const gs = svgEl('svg', { viewBox: '-40 -40 80 80', class: 'cc-guard-svg' }, this.guard);
    svgEl('path', { d: GUARD_ARC, pathLength: '1', class: 'cc-guard-track' }, gs);
    this.guardFill = svgEl('path', { d: GUARD_ARC, pathLength: '1', class: 'cc-guard-fill' }, gs);
    this.guardFill.setAttribute('stroke-dasharray', '0 1');
    for (let i = 0; i < SHARDS; i++) {
      const s = div('cc-shard', this.guard);
      s.style.setProperty('--a', `${Math.round((i * 360) / SHARDS + ((i * 23) % 17))}deg`);
    }
    this.prompt = div('cc-prompt', this.center);
    this.promptKey = div('cc-key', this.prompt, '[Sol Tık]');
    this.promptText = div('cc-ptxt', this.prompt);
    this.lock = div('cc-lock', this.el);

    G.events.on('parry', () => this.say('SAVUŞTURMA!', 'parry', true));
    G.events.on('riposte', () => this.say('KARŞI VURUŞ!', 'riposte', false));
    G.events.on('crit:finisher', () => this.say('KRİTİK VURUŞ!', 'finisher', false));
    G.events.on('guard:broke', () => {
      this.shatterAt = performance.now();
    });
    G.events.on('scene:leaving', () => this.reset());
  }

  /** Short centre callout above the reticle (one at a time: a new one replaces the old). */
  private say(text: string, kind: string, ring: boolean): void {
    setText(this.callout, text);
    this.callout.dataset.kind = kind;
    pulse(this.callout, 'go');
    if (ring) pulse(this.flash, 'go');
  }

  update(ctx: HudCtx): void {
    const now = ctx.now;
    const p = ctx.player;
    const inGame = ctx.mode === 'town' || ctx.mode === 'dungeon';
    const alive = inGame && !!p && !p.isDead;
    // the reticle is at screen centre (Aksiyon always, WoW while a mouse button is held)
    const action = alive && reticleAtCentre() && !ctx.ui.wantsCursor();

    // guard gauge arc (centre reticle only: it sits on the reticle)
    const g = G.combat?.guard;
    const shattering = now - this.shatterAt < SHATTER_MS;
    const guardOn = action && !!p && !!g && g.max > 0 && (G.combat.isGuarding(p) || shattering);
    setClass(this.guard, 'on', guardOn);
    setClass(this.guard, 'shatter', shattering);
    if (guardOn && g) {
      const f = clamp01(g.frac);
      if (this.lastFill < 0 || Math.abs(f - this.lastFill) > 0.002) {
        this.lastFill = f;
        this.guardFill.setAttribute('stroke-dasharray', `${f.toFixed(3)} 1`);
      }
      setClass(this.guard, 'low', f > 0 && f < LOW_GUARD);
      setClass(this.guard, 'broken', g.isBroken);
    }

    // LMB prompt: Kritik Vuruş first (SkillSystem.trySpecialLmb order), then the riposte window
    let kind: PromptKind = '';
    let t = 1;
    let far = false;
    if (alive && p && ctx.world) {
      const scan = this.scan(p, ctx.world.enemies);
      if (scan.finisher) kind = 'finisher';
      else {
        const st = p.statuses.get('riposte');
        if (st) {
          kind = 'riposte';
          t = st.duration > 0 ? clamp01(st.remaining / st.duration) : 1;
          far = !scan.riposteReach;
        }
      }
    }
    this.setPrompt(kind, t, far);
    // the key chip follows the scheme: the skill_lmb binding (Aksiyon), or "Oto" while the WoW auto-attack throws the swing
    setText(this.promptKey, `[${slotKeyLabel('lmb')}]`);

    // lock-on ring: the camera only exposes `lockedOn`; the hard target is the player's current target while it is set
    let lockOn = false;
    if (alive && p && G.camera?.lockedOn && p.targetId != null && ctx.world) {
      const e = ctx.world.get<Enemy>(p.targetId);
      if (e && !e.isDead && !e.removed) {
        const v = e.pointAt(0.5, _v);
        if (ctx.ui.projectWorld(v.x, v.y, v.z, _p)) {
          const dist = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
          const k = Math.max(0.6, Math.min(1.25, 12 / Math.max(1, dist)));
          setStyle(this.lock, 'transform', `translate(${_p.x.toFixed(1)}px, ${_p.y.toFixed(1)}px) scale(${k.toFixed(2)})`);
          lockOn = true;
        }
      }
    }
    setClass(this.lock, 'on', lockOn);
  }

  /** One pass over the enemies: a marked enemy this player may still finish in reach, and any enemy within riposte reach. */
  private scan(p: Actor, enemies: Enemy[]): { finisher: boolean; riposteReach: boolean } {
    let finisher = false;
    let riposteReach = false;
    const px = p.position.x, pz = p.position.z;
    for (const e of enemies) {
      if (e.isDead || e.removed) continue;
      const d = Math.hypot(e.position.x - px, e.position.z - pz) - e.radius;
      if (!finisher && d <= COMBAT_FEEL.krtRange + 0.6 && e.statuses.has('marked_crit') && G.combat.canFinish(e, p.id)) finisher = true;
      if (!riposteReach && d <= COMBAT_FEEL.riposteRange + 0.4) riposteReach = true;
      if (finisher && riposteReach) break;
    }
    return { finisher, riposteReach };
  }

  private setPrompt(kind: PromptKind, t: number, far: boolean): void {
    if (kind !== this.kind) {
      this.kind = kind;
      setClass(this.prompt, 'riposte', kind === 'riposte');
      setClass(this.prompt, 'finisher', kind === 'finisher');
      setText(this.promptText, kind === 'finisher' ? 'KRİTİK VURUŞ' : kind === 'riposte' ? 'KARŞI VURUŞ' : '');
    }
    setClass(this.prompt, 'on', kind !== '');
    setClass(this.prompt, 'far', far);
    // timer ring: the riposte window drains; the finisher ring stays full and pulses
    setStyle(this.prompt, '--t', (kind === 'riposte' ? t : 1).toFixed(3));
  }

  reset(): void {
    setClass(this.lock, 'on', false);
    setClass(this.guard, 'on', false);
    setClass(this.guard, 'shatter', false);
    this.setPrompt('', 1, false);
    this.shatterAt = -1e9;
    this.lastFill = -1;
  }
}
