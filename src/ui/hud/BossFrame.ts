import { G } from '../../game/G';
import type { Enemy } from '../../entities/Enemy';
import type { EntityId } from '../../types/common';
import { ICON, div, esc, fmtClock, fmtCompact, iconEl, pulse, setClass, setDisplay, setStyle, setText } from '../widgets/dom';
import { CastBarEl } from '../widgets/CastBar';
import { Bar } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';

/** Top-centre boss frame: ornate bar, name + title, phase markers, big cast bar (interruptible styling), enrage timer, yells. */
export class BossFrame implements HudWidget {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private titleEl: HTMLElement;
  private phaseEl: HTMLElement;
  private hp: Bar;
  private notches: HTMLElement;
  private cast: CastBarEl;
  private enrageEl: HTMLElement;
  private enrageTime: HTMLElement;
  private pctEl: HTMLElement;
  /** Poise (Duruş) stripe under the HP bar; gold + the SENDELEDİ tag while the boss is broken (its marked_crit window). */
  private poise: HTMLElement;
  private poiseFill: HTMLElement;
  /** Screen-centre boss emote line; the HUD mounts it on its root (it must work while the frame is hidden). */
  readonly yellEl: HTMLElement;
  private banner: HTMLElement;
  private entityId: EntityId | null = null;
  private engagedAt = 0;
  private phase = '';
  private defeatedUntil = 0;
  private notchFor = '';
  private missingSince = 0;
  private yellTimer = 0;
  visible = false;

  constructor() {
    this.el = div('bf');
    const wing = div('bf-wing', this.el);
    div('bf-cap l', wing);
    div('bf-cap r', wing);
    const head = div('bf-head', this.el);
    iconEl(ICON('ui-boss'), 'bf-skull', head);
    const names = div('bf-names', head);
    this.nameEl = div('bf-name', names);
    this.titleEl = div('bf-title', names);
    this.phaseEl = div('bf-phase', head);
    const barWrap = div('bf-barwrap', this.el);
    this.hp = new Bar('hp bf-hp', barWrap);
    this.notches = div('bf-notches', barWrap);
    this.pctEl = div('bf-pct', barWrap);
    this.poise = div('bf-poise', barWrap);
    this.poiseFill = div('bf-poise-fill', this.poise);
    setDisplay(this.poise, false);
    div('bf-stag', this.el, 'SENDELEDİ!');
    this.enrageEl = div('bf-enrage', this.el);
    iconEl(ICON('buff-strength'), 'bf-enrage-ico', this.enrageEl);
    this.enrageTime = div('bf-enrage-time', this.enrageEl);
    this.cast = new CastBarEl('bf-cast');
    this.el.appendChild(this.cast.el);
    this.yellEl = div('hud-yell');
    this.banner = div('bf-banner', this.el);
    setDisplay(this.el, false);

    G.events.on('boss:engaged', ({ entityId }) => {
      this.entityId = entityId;
      this.engagedAt = G.world?.time ?? 0;
      this.defeatedUntil = 0;
      this.phase = '';
      this.missingSince = 0;
      this.notchFor = '';
    });
    G.events.on('boss:phase', ({ entityId, phase }) => {
      if (entityId === this.entityId) {
        this.phase = phase;
        pulse(this.phaseEl, 'flash');
      }
    });
    G.events.on('boss:yell', ({ text }) => {
      const e = this.entityId != null ? (G.world?.get(this.entityId) as Enemy | undefined) : undefined;
      this.yellEl.innerHTML = `<b>${esc(e?.name ?? 'Patron')}:</b> “${esc(text)}”`;
      pulse(this.yellEl, 'show');
      this.yellTimer = 5.5;
    });
    G.events.on('boss:defeated', ({ entityId }) => {
      if (entityId === this.entityId) {
        this.defeatedUntil = performance.now() + 4200;
        this.banner.textContent = 'PATRON YENİLDİ';
        pulse(this.banner, 'go');
      }
    });
    const off = () => {
      this.entityId = null;
      this.defeatedUntil = 0;
    };
    G.events.on('boss:wipe', off);
    G.events.on('scene:leaving', off);
  }

  get activeEntityId(): EntityId | null {
    return this.visible ? this.entityId : null;
  }

  update(ctx: HudCtx): void {
    const now = ctx.now;
    let boss: Enemy | undefined;
    if (this.entityId != null && ctx.world) boss = ctx.world.get(this.entityId) as Enemy | undefined;
    const defeated = this.defeatedUntil > 0;
    if (defeated && now > this.defeatedUntil) {
      this.entityId = null;
      this.defeatedUntil = 0;
    }
    if (!boss && this.entityId != null && !defeated) {
      // entity not (yet) known: tolerate a short gap
      if (!this.missingSince) this.missingSince = now;
      if (now - this.missingSince > 1500) this.entityId = null;
    } else this.missingSince = 0;
    const show = this.entityId != null && !!boss;
    if (show !== this.visible) {
      this.visible = show;
      setDisplay(this.el, show);
      if (show) pulse(this.el, 'enter');
    }
    if (!show || !boss) return;
    const def = boss.bossDef;
    setText(this.nameEl, def?.name ?? boss.name);
    setText(this.titleEl, def?.title ?? '');
    setText(this.phaseEl, this.phase ? this.phaseLabel(this.phase) : '');
    const frac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    this.hp.set(frac, ctx.dt, `${fmtCompact(Math.max(0, boss.hp))} / ${fmtCompact(boss.maxHp)}`);
    setText(this.pctEl, `${Math.max(0, frac * 100).toFixed(frac < 0.1 ? 1 : 0).replace('.', ',')}%`);
    setClass(this.el, 'defeated', defeated);
    this.updatePoise(boss);
    // phase notches
    if (def && this.notchFor !== def.id) {
      this.notchFor = def.id;
      this.notches.innerHTML = '';
      for (const ph of def.phases ?? []) {
        if (ph.hpBelow < 1 && ph.hpBelow > 0) {
          const n = div('bf-notch', this.notches);
          n.style.left = (ph.hpBelow * 100).toFixed(1) + '%';
          n.dataset.hp = String(ph.hpBelow);
        }
      }
    }
    for (const n of Array.from(this.notches.children) as HTMLElement[]) {
      setClass(n, 'passed', frac < parseFloat(n.dataset.hp ?? '0'));
    }
    // enrage timer
    const enrageSec = def?.enrageTimer ?? 0;
    const enraged = boss.statuses.has('enrage');
    if (enrageSec > 0 || enraged) {
      const left = enrageSec - ((ctx.world?.time ?? 0) - this.engagedAt);
      setDisplay(this.enrageEl, true);
      if (enraged || left <= 0) {
        setText(this.enrageTime, 'ÖFKELENDİ!');
        setClass(this.enrageEl, 'enraged', true);
        setClass(this.enrageEl, 'soon', false);
      } else {
        setText(this.enrageTime, 'Öfke ' + fmtClock(left));
        setClass(this.enrageEl, 'enraged', false);
        setClass(this.enrageEl, 'soon', left < 30);
      }
    } else setDisplay(this.enrageEl, false);
    // cast
    const cv = ctx.casts.get(boss, now, ctx.world?.time ?? 0);
    if (cv) this.cast.set(cv.name, cv.frac, cv.remaining, cv);
    else this.cast.hide();
    if (this.yellTimer > 0) {
      this.yellTimer -= ctx.dt;
      if (this.yellTimer <= 0) this.yellEl.classList.remove('show');
    }
    setStyle(this.el, '--hp', String(Math.round(frac * 100)));
  }

  /** Poise stripe: visible while poise builds, full and gold (+ tag) while the boss is broken. */
  private updatePoise(boss: Enemy): void {
    const combat = G.combat;
    const broken = !!combat && combat.isStaggerBroken(boss);
    const f = !!combat && !broken ? combat.staggerFrac(boss) : 0;
    const show = broken || f > 0.001;
    setDisplay(this.poise, show);
    setClass(this.el, 'stag', broken);
    if (!show) return;
    setStyle(this.poiseFill, 'width', broken ? '100%' : (Math.min(1, f) * 100).toFixed(1) + '%');
  }

  private phaseLabel(id: string): string {
    const m = /(\d+)/.exec(id);
    return m ? `Evre ${m[1]}` : id.replace(/_/g, ' ');
  }

  reset(): void {
    this.entityId = null;
    this.visible = false;
    setDisplay(this.el, false);
  }
}
