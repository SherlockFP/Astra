import * as THREE from 'three';
import { G } from '../../game/G';
import type { PeerInfo } from '../../net/NetSession';
import type { CharacterState } from '../../systems/CharacterState';
import { div, esc, fmtCd, iconEl, ICON, clamp01, pulse, setClass, setDisplay, setHTML, setStyle, setText, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

const _dir = new THREE.Vector3();

/**
 * Small combat-readability widgets of the HUD (hud module):
 *  - TalentBadge: "N" unspent-points badge on the action bar (GDD_TALENTS §5.9), mounted by ActionBar
 *  - DodgeCharges: segmented dodge-roll charge bar (recharge progress per segment, ready flash)
 *  - ComboPoints: rogue "Kombo Puani" pips ('combopoints:changed')
 *  - PerfectDodgeText: "KUSURSUZ KACIS!" pop ('player:perfectDodge')
 *  - AimHint: hint under the crosshair while a ground-targeted skill is being aimed ('skill:aimStart/End')
 *  - ReadyCheck: party ready-check card with a [Y] hotkey ('party:readyCheck', G.net.readyCheck)
 *  - DamageDirection: red arc around the crosshair pointing at whoever just hit the local player ('damage' events)
 */

/** Segmented dodge roll charge bar (left of the action bar). */
export class DodgeCharges implements HudWidget {
  readonly el: HTMLElement;
  private keyEl: HTMLElement;
  private segs: { el: HTMLElement; fill: HTMLElement }[] = [];
  private max = 0;
  private lastReady = -1;

  constructor() {
    this.el = div('dg');
    this.keyEl = div('dg-key', this.el);
  }

  private rebuild(max: number): void {
    for (const s of this.segs) s.el.remove();
    this.segs = [];
    this.max = max;
    for (let i = 0; i < max; i++) {
      const el = div('dg-seg', this.el);
      const fill = div('dg-fill', el);
      this.segs.push({ el, fill });
    }
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    setDisplay(this.el, !!p, 'flex');
    if (!p) return;
    const max = Math.max(1, Math.min(6, Math.round(p.dodgeMaxCharges || 2)));
    if (max !== this.max) {
      this.rebuild(max);
      this.lastReady = -1;
    }
    setText(this.keyEl, G.input ? G.input.bindingLabel('dodge') : 'Shift');
    const charges = Math.max(0, Math.min(max, p.dodgeCharges));
    for (let i = 0; i < this.segs.length; i++) {
      const f = clamp01(charges - i);
      const s = this.segs[i];
      setStyle(s.fill, 'width', (f * 100).toFixed(1) + '%');
      setClass(s.el, 'full', f >= 0.999);
    }
    const ready = Math.floor(charges + 1e-4);
    if (this.lastReady >= 0 && ready > this.lastReady && this.segs[ready - 1]) pulse(this.segs[ready - 1].el, 'ready');
    this.lastReady = ready;
    setClass(this.el, 'dodging', p.dodging);
    setClass(this.el, 'empty', ready <= 0);
  }

  reset(): void {
    this.lastReady = -1;
  }
}

/** Rogue combo points: five diamond pips, gold while building, red/pulsing at the maximum. */
export class ComboPoints implements HudWidget {
  readonly el: HTMLElement;
  private pips: HTMLElement[] = [];
  private points = 0;
  private max = 5;
  private shown = -1;

  constructor() {
    this.el = div('cp');
    div('cp-lbl', this.el).textContent = 'Kombo Puanı';
    for (let i = 0; i < 5; i++) this.pips.push(div('cp-pip', this.el));
    G.events.on('combopoints:changed', ({ points, max }) => {
      const gained = points > this.points;
      this.points = Math.max(0, points);
      this.max = Math.max(1, Math.min(5, max));
      if (gained && this.pips[this.points - 1]) pulse(this.pips[this.points - 1], 'pop');
    });
    G.events.on('scene:leaving', () => {
      this.points = 0;
    });
  }

  update(ctx: HudCtx): void {
    const rogue = ctx.player?.classId === 'rogue';
    setDisplay(this.el, rogue, 'flex');
    if (!rogue) return;
    if (this.shown === this.points) return;
    this.shown = this.points;
    for (let i = 0; i < this.pips.length; i++) {
      setDisplay(this.pips[i], i < this.max, '');
      setClass(this.pips[i], 'on', i < this.points);
    }
    setClass(this.el, 'max', this.points >= this.max);
  }

  reset(): void {
    this.points = 0;
    this.shown = -1;
  }
}

/** "KUSURSUZ KAÇIŞ!" pop at the screen centre when the local player dodges a hit at the last moment. */
export class PerfectDodgeText implements HudWidget {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('pd');
    div('pd-t', this.el).textContent = 'KUSURSUZ KAÇIŞ!';
    div('pd-s', this.el).textContent = 'Kaçış yükü geri kazanıldı';
    G.events.on('player:perfectDodge', () => {
      pulse(this.el, 'go');
      uiSound('ui_tab', 0.5);
    });
    G.events.on('scene:leaving', () => this.el.classList.remove('go'));
  }

  update(_ctx: HudCtx): void {}
}

/** Hint below the crosshair while a ground-targeted skill preview is active. */
export class AimHint implements HudWidget {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private active = false;

  constructor() {
    this.el = div('ah');
    this.nameEl = div('ah-name', this.el);
    const keys = div('ah-keys', this.el);
    keys.innerHTML = '<span><b>Bırak</b> / <b>Sol Tık</b> Yerleştir</span><span><b>Boşluk</b> İptal</span>';
    G.events.on('skill:aimStart', ({ skillId }) => {
      let name = '';
      try {
        name = G.skills.getDef(skillId)?.name ?? '';
      } catch { /* skills not ready */ }
      this.nameEl.textContent = name;
      this.active = true;
      setClass(this.el, 'on', true);
    });
    const off = () => {
      this.active = false;
      setClass(this.el, 'on', false);
    };
    G.events.on('skill:aimEnd', off);
    G.events.on('scene:leaving', off);
  }

  update(ctx: HudCtx): void {
    if (this.active && (!ctx.player || ctx.player.isDead)) {
      this.active = false;
      setClass(this.el, 'on', false);
    }
  }

  reset(): void {
    this.active = false;
    setClass(this.el, 'on', false);
  }
}

/**
 * Ready-check card. The cursor is usually locked during play, so [Y] answers "Hazırım"; the button works while the
 * cursor is free (Alt). Reads G.net.readyCheck + G.net.members(); the net module emits the toasts and the result.
 */
export class ReadyCheck implements HudWidget {
  readonly el: HTMLElement;
  private subEl: HTMLElement;
  private listEl: HTMLElement;
  private barFill: HTMLElement;
  private timeEl: HTMLElement;
  private btn: HTMLButtonElement;
  private hint: HTMLElement;
  private visible = false;
  private lastId = -1;

  constructor() {
    this.el = div('rc');
    const head = div('rc-head', this.el);
    iconEl(ICON('ui-party'), 'rc-ico', head);
    div('rc-title', head).textContent = 'HAZIR MISIN?';
    this.subEl = div('rc-sub', this.el);
    this.listEl = div('rc-list', this.el);
    const bar = div('rc-bar', this.el);
    this.barFill = div('rc-barfill', bar);
    this.timeEl = div('rc-time', bar);
    const row = div('rc-row', this.el);
    this.btn = document.createElement('button');
    this.btn.className = 'rc-btn';
    this.btn.addEventListener('click', () => this.answer());
    row.appendChild(this.btn);
    this.hint = div('rc-hint', row);
    setDisplay(this.el, false);
    G.events.on('scene:leaving', () => this.hide());
  }

  private answer(): void {
    const net = G.net;
    if (!net || !net.readyCheck?.active) return;
    const me = net.self;
    if (me?.ready) return;
    try {
      net.setReady(true);
    } catch (e) {
      console.warn('[hud] setReady failed', e);
    }
    uiSound('ui_click', 0.7);
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    setDisplay(this.el, false);
  }

  update(ctx: HudCtx): void {
    const net = G.net;
    const rc = net?.readyCheck;
    if (!net || !rc || !rc.active || !net.isOnline) {
      this.hide();
      return;
    }
    if (!this.visible) {
      this.visible = true;
      setDisplay(this.el, true);
      pulse(this.el, 'in');
    }
    if (rc.id !== this.lastId) {
      this.lastId = rc.id;
      setText(this.subEl, `${rc.by} bir hazırlık kontrolü başlattı`);
    }
    const me = net.self;
    const members: PeerInfo[] = net.members();
    let html = '';
    for (const m of members) {
      html += `<div class="rc-m${m.ready ? ' ok' : ''}"><span class="rc-mark">${m.ready ? '✓' : '…'}</span><span class="rc-name">${esc(m.name)}</span><span class="rc-st">${m.ready ? 'Hazır' : 'Bekliyor'}</span></div>`;
    }
    setHTML(this.listEl, html);
    const left = Math.max(0, (rc.deadline - ctx.now) / 1000);
    const frac = rc.timeoutMs > 0 ? clamp01((left * 1000) / rc.timeoutMs) : 0;
    setStyle(this.barFill, 'width', (frac * 100).toFixed(1) + '%');
    setText(this.timeEl, fmtCd(left));
    const ready = !!me?.ready;
    setClass(this.el, 'answered', ready);
    this.btn.textContent = ready ? 'Hazırsın' : 'Hazırım';
    this.btn.disabled = ready;
    setText(this.hint, ready ? 'Diğer oyuncular bekleniyor...' : 'Onaylamak için [Y] tuşuna bas');
    if (!ready && G.input?.keyPressed('KeyY') && !ctx.ui.hud.chat.isFocused) this.answer();
  }

  reset(): void {
    this.hide();
    this.lastId = -1;
  }
}

/**
 * Damage-direction indicator (hit feel / readability): every enemy hit on the local player lights a red wedge on a ring around the
 * crosshair that points toward the attacker and keeps tracking it while it fades, so off-screen attackers are never a mystery.
 * Heavier hits are brighter and wider; the same attacker re-uses its wedge so a flurry does not paint the whole ring.
 */
interface Wedge {
  el: HTMLElement;
  src: number;
  born: number;
  life: number;
  x: number;
  z: number;
  power: number;
}

export class DamageDirection implements HudWidget {
  readonly el: HTMLElement;
  private wedges: Wedge[] = [];
  private fwd = { x: 0, z: -1 };

  constructor() {
    this.el = div('dd');
    for (let i = 0; i < 6; i++) {
      const el = div('dd-w', this.el);
      div('dd-in', el);
      setDisplay(el, false);
      this.wedges.push({ el, src: -1, born: 0, life: 1, x: 0, z: 0, power: 0 });
    }
    G.events.on('damage', (e) => {
      const me = G.player;
      if (!me || e.targetId !== me.id || e.sourceId == null || e.sourceId === me.id) return;
      if (e.kind === 'dodge' || e.kind === 'immune' || e.kind === 'block' || e.amount <= 0) return;
      const src = G.world?.getActor(e.sourceId);
      if (!src) return;
      const now = performance.now();
      const power = Math.min(1, 0.35 + (e.amount / Math.max(1, me.maxHp)) * 4);
      // same attacker -> same wedge; otherwise the oldest one
      let w = this.wedges.find((x) => x.src === e.sourceId && now - x.born < x.life);
      if (!w) {
        w = this.wedges[0];
        for (const x of this.wedges) if (x.born < w.born) w = x;
      }
      w.src = e.sourceId;
      w.born = now;
      w.life = 900 + power * 500;
      w.x = src.position.x;
      w.z = src.position.z;
      w.power = Math.max(w.power * 0.5, power);
    });
    G.events.on('scene:leaving', () => this.reset());
  }

  update(ctx: HudCtx): void {
    const me = ctx.player;
    const cam = ctx.ui.camera;
    if (!me || !cam) return;
    // camera forward on the ground plane (screen up) and its right
    const f = this.fwd;
    cam.getWorldDirection(_dir);
    const fl = Math.hypot(_dir.x, _dir.z) || 1;
    f.x = _dir.x / fl;
    f.z = _dir.z / fl;
    const rx = -f.z, rz = f.x;
    for (const w of this.wedges) {
      if (w.src < 0) continue;
      const age = ctx.now - w.born;
      if (age >= w.life) {
        w.src = -1;
        setDisplay(w.el, false);
        continue;
      }
      // keep pointing at a living attacker while the wedge fades
      const a = G.world?.getActor(w.src);
      if (a && !a.isDead) {
        w.x = a.position.x;
        w.z = a.position.z;
      }
      const dx = w.x - me.position.x, dz = w.z - me.position.z;
      const ang = Math.atan2(dx * rx + dz * rz, dx * f.x + dz * f.z);
      const k = 1 - age / w.life;
      setDisplay(w.el, true);
      setStyle(w.el, 'transform', `rotate(${ang.toFixed(3)}rad)`);
      setStyle(w.el, 'opacity', (Math.min(1, k * 1.6) * (0.55 + w.power * 0.45)).toFixed(2));
      setStyle(w.el, '--p', w.power.toFixed(2));
    }
  }

  reset(): void {
    for (const w of this.wedges) {
      w.src = -1;
      setDisplay(w.el, false);
    }
  }
}

/** Tooltip host of the action bar (same shape as ActionBar's `ui`). */
export interface TipHost {
  showTooltip(html: string, x: number, y: number): void;
  hideTooltip(): void;
}

/** Save flag that keeps the N badge pulsing after a gain until the talents window is opened (GDD_TALENTS App. B). */
const TB_PULSE_FLAG = 'tb.pulse';
/** How often the unspent counts are re-read when no talent event arrived (ms). */
const TB_RECOUNT_MS = 250;

/**
 * "N" talent badge on the action bar's top edge (GDD_TALENTS §5.9, T15). Shows the unspent points of the three pools
 * (Sınıf + Uzmanlık + Pasif) and is hidden at 0. Each gain (a pool grows: level-up, passive or rating milestone) makes it
 * pulse gold until the `talents` window is opened; the pulse is kept in the save flag `tb.pulse`. A click opens the window.
 * Read-only towards the build: it only reads G.talents / G.progression.
 */
export class TalentBadge implements HudWidget {
  readonly el: HTMLElement;
  private keyEl: HTMLElement;
  private countEl: HTMLElement;
  private ui: TipHost;
  private dirty = true;
  private lastCalc = -Infinity;
  private lastChar: CharacterState | null = null;
  private lastPool = -1;
  private total = 0;
  private parts = { cls: 0, spc: 0, pas: 0 };
  private hovered = false;
  private warned = false;

  constructor(ui: TipHost) {
    this.ui = ui;
    this.el = div('tb-badge hud-interactive');
    this.keyEl = div('tb-key', this.el);
    this.countEl = div('tb-count', this.el);
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.hideTooltip();
      G.ui.openPanel('talents');
    });
    this.el.addEventListener('mouseenter', (e) => {
      this.hovered = true;
      this.showTip(e.clientX, e.clientY);
    });
    this.el.addEventListener('mousemove', (e) => {
      if (this.hovered) this.showTip(e.clientX, e.clientY);
    });
    this.el.addEventListener('mouseleave', () => {
      this.hovered = false;
      this.ui.hideTooltip();
    });
    // anything that changes a pool or the build re-counts on the next frame
    for (const name of ['talents:changed', 'talents:committed', 'loadout:changed', 'spec:changed', 'passives:changed', 'player:levelup'] as const) {
      G.events.on(name, () => {
        this.dirty = true;
      });
    }
    G.events.on('ui:panel', ({ panel, open }) => {
      if (panel === 'talents' && open) this.setPulse(false);
    });
  }

  update(ctx: HudCtx): void {
    try {
      this.tick(ctx);
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.error('[hud] talent badge failed (reported once):', e);
      }
    }
  }

  private tick(ctx: HudCtx): void {
    const ch = ctx.character;
    if (ch !== this.lastChar) {
      this.lastChar = ch;
      this.lastPool = -1;
      this.dirty = true;
    }
    if (!ch) {
      setDisplay(this.el, false);
      return;
    }
    if (this.dirty || ctx.now - this.lastCalc >= TB_RECOUNT_MS) this.recount(ctx.now);
    setDisplay(this.el, this.total > 0, 'flex');
    setText(this.keyEl, G.input?.bindingLabel('talents') ?? 'N');
    setText(this.countEl, String(this.total));
    setClass(this.el, 'pulsing', !!ch.save.flags[TB_PULSE_FLAG]);
  }

  private recount(now: number): void {
    this.lastCalc = now;
    this.dirty = false;
    const t = G.talents;
    const pr = G.progression;
    this.parts = {
      cls: t?.pointsFree('class') ?? 0,
      spc: t?.pointsFree('spec') ?? 0,
      pas: pr?.talentPointsAvailable() ?? 0,
    };
    this.total = this.parts.cls + this.parts.spc + this.parts.pas;
    // the size of the three pools: a growing pool is a gain (level-up, passive milestone, rating milestone)
    const pool = (t?.pointsTotal('class') ?? 0) + (t?.pointsTotal('spec') ?? 0) + (pr?.talentPointsTotal() ?? 0);
    if (this.lastPool >= 0 && pool > this.lastPool && !G.ui.isPanelOpen('talents')) this.setPulse(true);
    this.lastPool = pool;
  }

  /** Writes or clears the `tb.pulse` flag of the active character (persisted, debounced). */
  private setPulse(on: boolean): void {
    const ch = G.character;
    if (!ch) return;
    const flags = ch.save.flags;
    if (!!flags[TB_PULSE_FLAG] === on) return;
    if (on) flags[TB_PULSE_FLAG] = 1;
    else delete flags[TB_PULSE_FLAG];
    ch.persist();
  }

  private showTip(x: number, y: number): void {
    const bind = G.input?.bindingLabel('talents') ?? 'N';
    this.ui.showTooltip(
      `<div class="sk"><div class="sk-name">Uzmanlık ve Yetenekler</div>` +
        `<div class="sk-tags">Harcanmamış puan: ${this.total}</div>` +
        `<div class="sk-desc">Sınıf ${this.parts.cls} · Uzmanlık ${this.parts.spc} · Pasif ${this.parts.pas}</div>` +
        `<div class="sk-key">Açmak için: <b>${esc(bind)}</b></div></div>`,
      x,
      y,
    );
  }
}
