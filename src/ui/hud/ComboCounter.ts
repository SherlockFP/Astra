import { G } from '../../game/G';
import { div, fmtCompact, pulse, setClass, setDisplay, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

interface TierStyle {
  name: string;
  c1: string;
  c2: string;
  glow: string;
  size: number;
  shake: number;
}

/** Escalating combo styles (Hero Siege / DMC feel): bigger, hotter, shakier with every tier. */
const TIERS: TierStyle[] = [
  { name: 'KOMBO', c1: '#ffffff', c2: '#c9d2e6', glow: '#8fa6d8', size: 56, shake: 1.2 },
  { name: 'HARİKA!', c1: '#fff6b0', c2: '#ffcf33', glow: '#ffb400', size: 70, shake: 2.2 },
  { name: 'ÖLÜMCÜL!', c1: '#ffd29a', c2: '#ff7a1a', glow: '#ff5a00', size: 86, shake: 3.4 },
  { name: 'ÇILGIN!', c1: '#ffb0a0', c2: '#ff2a2a', glow: '#ff1010', size: 102, shake: 4.8 },
  { name: 'EFSANEVİ!', c1: '#ffe0ff', c2: '#b24dff', glow: '#e040ff', size: 120, shake: 6.4 },
  // GDD_LIFE §5.9: the 6th entry (tier 5, 70 hits) TANRISAL! is the top style: teal, biggest, strongest shake
  { name: 'TANRISAL!', c1: '#ffffff', c2: '#40ffd0', glow: '#20ffc0', size: 138, shake: 8 },
];

/** Tier name and colours for other HUD pieces (the route banner matches the counter's style). */
export function comboTierStyle(tier: number): { name: string; c1: string; c2: string; glow: string } {
  const st = TIERS[Math.max(0, Math.min(TIERS.length - 1, tier))];
  return { name: st.name, c1: st.c1, c2: st.c2, glow: st.glow };
}

const WINDOW_MS = 2000;

/** Big stylised combo counter: pop per hit, tier slams, shaking number, drain bar and running damage total. */
export class ComboCounter implements HudWidget {
  readonly el: HTMLElement;
  private rank: HTMLElement;
  private num: HTMLElement;
  private numWrap: HTMLElement;
  private label: HTMLElement;
  private bonus: HTMLElement;
  private bar: HTMLElement;
  private barFill: HTMLElement;
  private total: HTMLElement;
  private burst: HTMLElement;
  private count = 0;
  private tier = 0;
  private lastChange = 0;
  private lastHit = 0;
  private active = false;
  private fadingUntil = 0;
  private startT = 0;
  private hits: { t: number; a: number }[] = [];
  private shownTotal = 0;
  private bestTier = 0;

  constructor() {
    this.el = div('cb');
    this.burst = div('cb-burst', this.el);
    this.rank = div('cb-rank', this.el);
    this.numWrap = div('cb-numwrap', this.el);
    this.num = div('cb-num', this.numWrap);
    this.label = div('cb-label', this.el);
    this.bonus = div('cb-bonus', this.el);
    this.bar = div('cb-bar', this.el);
    this.barFill = div('cb-barfill', this.bar);
    this.total = div('cb-total', this.el);
    setDisplay(this.el, false);

    G.events.on('combo:changed', ({ count, tier }) => this.onCombo(count, tier));
    G.events.on('damage', (e) => {
      const me = G.player;
      if (!me || e.sourceId !== me.id || e.targetId === me.id) return;
      const now = performance.now();
      this.hits.push({ t: now, a: e.amount });
      if (this.hits.length > 400) this.hits.splice(0, 200);
    });
    G.events.on('scene:leaving', () => this.endCombo(true));
  }

  private onCombo(count: number, tier: number): void {
    const now = performance.now();
    if (count <= 1) this.startT = now - 250;
    if (count < 2) {
      if (this.active) this.endCombo(false);
      this.count = count;
      return;
    }
    const prevTier = this.tier;
    const increased = count > this.count;
    this.count = count;
    this.tier = Math.max(0, Math.min(TIERS.length - 1, tier));
    this.lastChange = now;
    if (!this.active) {
      this.active = true;
      this.bestTier = 0;
      setDisplay(this.el, true);
      this.el.classList.remove('out');
      pulse(this.el, 'in');
    }
    this.fadingUntil = 0;
    this.el.classList.remove('out');
    const st = TIERS[this.tier];
    this.el.dataset.tier = String(this.tier);
    this.el.style.setProperty('--c1', st.c1);
    this.el.style.setProperty('--c2', st.c2);
    this.el.style.setProperty('--glow', st.glow);
    this.el.style.setProperty('--size', st.size + 'px');
    setText(this.rank, st.name);
    setText(this.num, String(count));
    this.num.dataset.t = String(count);
    setText(this.label, 'VURUŞ');
    if (increased) {
      this.lastHit = now;
      pulse(this.numWrap, 'pop');
    }
    if (this.tier > prevTier && this.tier > this.bestTier) {
      this.bestTier = this.tier;
      pulse(this.rank, 'slam');
      pulse(this.burst, 'go');
      pulse(this.el, 'tierup');
      // (tier sounds are played by the audio module on 'combo:changed')
    }
  }

  private endCombo(instant: boolean): void {
    if (!this.active) return;
    this.active = false;
    this.count = 0;
    this.tier = 0;
    if (instant) {
      setDisplay(this.el, false);
      return;
    }
    this.el.classList.add('out');
    this.fadingUntil = performance.now() + 700;
  }

  update(ctx: HudCtx): void {
    const now = ctx.now;
    if (this.fadingUntil && now > this.fadingUntil) {
      this.fadingUntil = 0;
      setDisplay(this.el, false);
    }
    if (!this.active) return;
    const since = now - this.lastChange;
    // The combat module's ComboTracker is authoritative (its window is extended by kills/casts without an event).
    // Without one (dev pages) fall back to our own 2 s window so a stale counter never stays on screen.
    const tr = (G.combat as unknown as { combo?: { count: number; windowFrac: number; bonus: number } } | undefined)?.combo;
    let left: number;
    if (tr && typeof tr.windowFrac === 'number') {
      if (tr.count < 2 && since > 250) {
        this.endCombo(false);
        return;
      }
      left = Math.max(0, Math.min(1, tr.windowFrac));
      const bonus = Math.round(((tr.bonus ?? 1) - 1) * 100);
      setText(this.bonus, bonus > 0 ? `Hasar +%${bonus}` : '');
    } else {
      if (since > WINDOW_MS + 450) {
        this.endCombo(false);
        return;
      }
      left = Math.max(0, 1 - since / WINDOW_MS);
      setText(this.bonus, '');
    }
    setStyle(this.barFill, 'width', (left * 100).toFixed(1) + '%');
    setClass(this.el, 'low', left < 0.3);
    // shake: strong right after a hit, scaled by tier
    const st = TIERS[this.tier];
    const k = Math.max(0, 1 - (now - this.lastHit) / 260);
    const amp = st.shake * (0.25 + k * 1.1);
    const dx = (Math.random() - 0.5) * 2 * amp;
    const dy = (Math.random() - 0.5) * 2 * amp;
    const rot = (Math.random() - 0.5) * (0.6 + this.tier * 0.8) * (0.3 + k);
    this.numWrap.style.setProperty('--sx', dx.toFixed(2) + 'px');
    this.numWrap.style.setProperty('--sy', dy.toFixed(2) + 'px');
    this.numWrap.style.setProperty('--sr', rot.toFixed(2) + 'deg');
    // running damage total (sum of hits since the combo started)
    let sum = 0;
    for (const h of this.hits) if (h.t >= this.startT) sum += h.a;
    this.shownTotal += (sum - this.shownTotal) * Math.min(1, ctx.dt * 14);
    setText(this.total, `Toplam hasar  ${fmtCompact(this.shownTotal)}`);
  }

  reset(): void {
    this.endCombo(true);
  }
}
