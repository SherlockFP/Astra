import { G } from '../../../../game/G';
import { MARKET } from '../../../../data/market';
import { getMarket } from '../../../../systems/Market';
import { h } from '../base';
import '../../../styles/panels-market.css';

/**
 * PAZARCI MODU (CORE_MECHANICS §11 "AFK mode"): while the player's stall is open and the player sits idle at it, the client throttles
 * rendering to ~2 fps (the simulation, the network and the timers keep running; a hidden tab renders nothing anyway), mutes the audio
 * and shows an overlay with the live sales log. Any key / click, closing the stall, walking away or leaving the scene restores
 * everything. OWNER: panels-game module (market UI).
 *
 * The render throttle needs no change in core/Engine.ts: it wraps the engine's own `renderFrame` method on the instance while the
 * mode is on and deletes the wrapper afterwards (the prototype method comes back). If core ever adds a first-class frame-skip hook,
 * replace `throttleRender` / `restoreRender` below with it.
 */

const GRACE_MS = 700;
const fmt = (n: number): string => Math.round(n).toLocaleString('tr-TR');
const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : String(mm)) + `:${String(ss).padStart(2, '0')}`;
};
const hhmm = (t: number): string => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

type EngineLike = { renderFrame?: (dt: number) => void };
type AudioLike = { master?: GainNode | null; ctx?: AudioContext | null; applyVolumes?: () => void };

export class PazarciMode {
  active = false;
  private el: HTMLElement | null = null;
  private logEl: HTMLElement | null = null;
  private statEl: HTMLElement | null = null;
  private subEl: HTMLElement | null = null;
  private enteredAt = 0;
  private lastInput = performance.now();
  private lastRender = 0;
  private offs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  install(): () => void {
    const bump = (): void => {
      this.lastInput = performance.now();
      if (this.active && performance.now() - this.enteredAt > GRACE_MS) this.exit();
    };
    const move = (e: MouseEvent): void => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 4) bump();
    };
    window.addEventListener('keydown', bump, true);
    window.addEventListener('mousedown', bump, true);
    window.addEventListener('wheel', bump, true);
    window.addEventListener('touchstart', bump, true);
    window.addEventListener('mousemove', move, true);
    this.offs.push(
      () => window.removeEventListener('keydown', bump, true),
      () => window.removeEventListener('mousedown', bump, true),
      () => window.removeEventListener('wheel', bump, true),
      () => window.removeEventListener('touchstart', bump, true),
      () => window.removeEventListener('mousemove', move, true),
      G.events.on('market:sale', () => this.paint()),
      G.events.on('market:changed', (e) => {
        if (e.what === 'own' || e.what === 'sales') this.paint();
      }),
      G.events.on('scene:leaving', () => this.exit()),
    );
    this.timer = setInterval(() => this.tick(), 500);
    return () => this.dispose();
  }

  dispose(): void {
    this.exit();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const o of this.offs.splice(0)) o();
  }

  /** Per half second: auto-enter after idle time at the stall, leave when the stall is gone or the player walked away. */
  private tick(): void {
    const m = getMarket();
    if (!m.own) {
      if (this.active) this.exit();
      return;
    }
    if (this.active) {
      if (!m.nearOwnSeat(MARKET.AFK_LEAVE_DIST)) this.exit();
      else this.paint(true);
      return;
    }
    if (performance.now() - this.lastInput >= MARKET.AFK_IDLE_S * 1000 && m.nearOwnSeat(MARKET.AFK_LEAVE_DIST)) this.enter();
  }

  enter(): void {
    const m = getMarket();
    if (this.active || !m.own) return;
    this.active = true;
    this.enteredAt = performance.now();
    this.throttleRender();
    this.muteAudio();
    this.build();
    this.paint();
    G.events.emit('market:mode', { on: true });
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.restoreRender();
    this.restoreAudio();
    this.el?.remove();
    this.el = this.logEl = this.statEl = this.subEl = null;
    this.lastInput = performance.now();
    try {
      G.events.emit('market:mode', { on: false });
    } catch {
      /* bus gone */
    }
  }

  /* ---------------------------------------------------------------------------- render + audio */

  private throttleRender(): void {
    const eng = G.engine as unknown as EngineLike;
    const orig = eng.renderFrame;
    if (typeof orig !== 'function' || Object.prototype.hasOwnProperty.call(eng, 'renderFrame')) return;
    const gap = 1000 / MARKET.AFK_FPS;
    this.lastRender = 0;
    eng.renderFrame = (dt: number): void => {
      const now = performance.now();
      if (now - this.lastRender < gap) return;
      this.lastRender = now;
      orig.call(eng, dt);
    };
  }

  private restoreRender(): void {
    const eng = G.engine as unknown as EngineLike;
    if (Object.prototype.hasOwnProperty.call(eng, 'renderFrame')) delete eng.renderFrame;
  }

  private muteAudio(): void {
    const a = G.audio as unknown as AudioLike | undefined;
    try {
      if (a?.master && a.ctx) a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.05);
    } catch {
      /* audio not running */
    }
  }

  private restoreAudio(): void {
    try {
      (G.audio as unknown as AudioLike | undefined)?.applyVolumes?.();
    } catch {
      /* audio not running */
    }
  }

  /* ---------------------------------------------------------------------------- overlay */

  private build(): void {
    this.logEl = h('div.pm-afk-log');
    this.statEl = h('div.pm-afk-stats');
    this.subEl = h('div.pm-afk-sub');
    this.el = h(
      'div.pm-afk',
      null,
      h(
        'div.pm-afk-card',
        null,
        h('div.pm-afk-title', null, 'PAZARCI MODU'),
        this.subEl,
        this.statEl,
        h('div.pm-afk-h', null, 'Satış Günlüğü'),
        this.logEl,
        h('div.pm-afk-hint', null, 'Görüntü saniyede ~2 kare, ses kapalı. Dönmek için herhangi bir tuşa bas ya da tıkla.'),
      ),
    );
    this.el.addEventListener('mousedown', () => {
      if (performance.now() - this.enteredAt > GRACE_MS) this.exit();
    });
    const root = (G.ui && G.ui.root) || document.body;
    root.appendChild(this.el);
  }

  /** Redraw the log and the numbers (cheap; the overlay keeps only the last 12 sales). */
  private paint(clockOnly = false): void {
    const m = getMarket();
    const o = m.own;
    if (!this.el || !o) return;
    if (this.subEl) this.subEl.textContent = `"${o.title}" tezgâhın açık · ${clock(Date.now() - o.openedAt)}`;
    if (clockOnly) return;
    if (this.statEl) {
      this.statEl.textContent = `Satılan: ${o.sales.length} eşya   ·   Kazanç: ${fmt(o.netGold)} altın   ·   Tezgâhta kalan: ${o.listings.length} eşya`;
    }
    if (this.logEl) {
      this.logEl.textContent = '';
      const rows = o.sales.slice(-12).reverse();
      if (!rows.length) this.logEl.append(h('div.pm-afk-empty', null, 'Henüz satış yok. Müşteri bekleniyor...'));
      for (const s of rows) {
        this.logEl.append(
          h(
            'div.pm-afk-row',
            null,
            h('span.t', null, hhmm(s.t)),
            h('span.n', { style: { color: `var(--rar-${s.rarity}, #fff)` } }, s.name),
            h('span.g', null, `+${fmt(s.net)} altın`),
            h('span.b', null, s.buyer ? `← ${s.buyer}` : ''),
          ),
        );
      }
    }
  }
}

let mode: PazarciMode | null = null;
export function pazarciMode(): PazarciMode {
  mode ??= new PazarciMode();
  return mode;
}

/** Called by mountMarket: starts watching idle time / stall state. Returns the disposer. */
export function installPazarciMode(): () => void {
  const m = pazarciMode();
  const off = m.install();
  return () => {
    off();
    mode = null;
  };
}
