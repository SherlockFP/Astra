import { G } from '../../game/G';
import { activeProcs, procOverlayFor, PROC_MAX_OVERLAYS, type ProcDef } from '../../data/procs';
import type { StatusId } from '../../types/skills';
import { div, setClass, setStyle } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import '../styles/hud-overlay.css';

/**
 * COMBAT_WOW §2.7 / §2.10 / CW-09. Spell Activation Overlay (one art piece per active proc, at most PROC_MAX_OVERLAYS,
 * highest priority first) and the burst banner ("PATLAMA!") with an edge vignette while >= 2 offensive majors are up.
 *
 * Polls the local player's statuses every frame against PROC_DEFS, so it works without proc events. Overlays are
 * anchored at screen centre - 40 px (CSS: `.sao-root`). Gated by Settings.abilityGlow (overlays only).
 */

/** Offensive major statuses (COMBAT_WOW §2.10 list). Two or more active = burst window. */
const BURST_STATUSES: readonly StatusId[] = [
  'zeal', 'wings', 'carnage', 'shadow_blades', 'shadow_veil_cd', 'icy_veins', 'combustion', 'arcane_surge', 'hero_haste',
];
const BURST_MIN = 2;

/** Overlay colour per school (COMBAT_WOW §2.7). */
const SCHOOL_COLOR: Readonly<Record<string, string>> = {
  fire: '#ff9a3c',
  frost: '#8fe3ff',
  arcane: '#ff8fee',
  holy: '#fff0a0',
  physical: '#ffe9c8',
  shield: '#ffe9c8',
  bleed: '#ff5a4a',
  rage: '#ff5a4a',
  shadow: '#9cff7a',
  poison: '#9cff7a',
};
const SCHOOL_FALLBACK = '#ffe9c8';

/** Expiry warning window (seconds) for the 4 Hz flicker. */
const WARN_SEC = 1.5;
/** A proc that vanishes with more than this left was spent by a cast (consume flash), otherwise it ran out. */
const CONSUMED_MIN_SEC = 0.3;
const OUT_MS = 350;
const CONSUME_MS = 200;

interface Entry {
  def: ProcDef;
  el: HTMLElement;
  /** Remaining seconds of the status on the last frame it was wanted. */
  lastRemaining: number;
}

interface Ghost {
  el: HTMLElement;
  until: number;
}

export class SpellOverlay implements HudWidget {
  readonly el: HTMLElement;
  private readonly edge: HTMLElement;
  private readonly root: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly live = new Map<string, Entry>();
  /** Overlays that are fading out (expired / consumed / no longer in the top set); removed after their animation. */
  private readonly ghosts: Ghost[] = [];
  private burst = false;

  constructor() {
    this.el = div('sao-layer');
    this.edge = div('sao-edge', this.el);
    this.root = div('sao-root', this.el);
    this.banner = div('sao-burst', this.el);
    this.banner.textContent = 'PATLAMA!';
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    const live = p && !p.isDead ? p : null;
    const showOverlays = !!live && G.settings.data.abilityGlow;
    const want = showOverlays && live ? activeProcs(live.statuses).slice(0, PROC_MAX_OVERLAYS) : [];
    const wantIds = new Set(want.map((d) => d.id));

    // retire overlays that are no longer wanted: spent by a cast = consume flash, otherwise a plain fade-out
    for (const [id, e] of this.live) {
      if (wantIds.has(id)) continue;
      this.live.delete(id);
      const consumed = !!live && !live.statuses.has(e.def.status) && e.lastRemaining > CONSUMED_MIN_SEC;
      e.el.classList.remove('warn');
      e.el.classList.add(consumed ? 'consume' : 'out');
      this.ghosts.push({ el: e.el, until: ctx.now + (consumed ? CONSUME_MS : OUT_MS) });
    }

    // add / update the wanted overlays (already sorted by priority, capped at PROC_MAX_OVERLAYS)
    if (live) {
      for (const def of want) {
        let e = this.live.get(def.id);
        if (!e) {
          e = this.make(def);
          this.live.set(def.id, e);
          this.root.appendChild(e.el);
        }
        const pos = procOverlayFor(def, live.statuses.stacks(def.status));
        if (e.el.dataset.pos !== pos) e.el.dataset.pos = pos;
        const rem = live.statuses.get(def.status)?.remaining ?? 0;
        e.lastRemaining = rem;
        setClass(e.el, 'warn', rem > 0 && rem <= WARN_SEC);
      }
    }

    // drop finished fade-outs
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      if (ctx.now >= g.until) {
        g.el.remove();
        this.ghosts.splice(i, 1);
      }
    }

    // burst window: >= 2 offensive majors up (edge vignette + banner); event only on change
    const burst = !!live && BURST_STATUSES.filter((s) => live.statuses.has(s)).length >= BURST_MIN;
    if (burst !== this.burst) {
      this.burst = burst;
      G.events.emit('burst:window', { active: burst });
    }
    setClass(this.edge, 'on', burst);
    setClass(this.banner, 'on', burst);
  }

  reset(): void {
    for (const e of this.live.values()) e.el.remove();
    this.live.clear();
    for (const g of this.ghosts) g.el.remove();
    this.ghosts.length = 0;
    setClass(this.edge, 'on', false);
    setClass(this.banner, 'on', false);
    if (this.burst) {
      this.burst = false;
      G.events.emit('burst:window', { active: false });
    }
  }

  private make(def: ProcDef): Entry {
    const el = div('sao');
    el.dataset.id = def.id;
    el.dataset.school = def.school;
    el.dataset.pos = def.overlay;
    setStyle(el, '--c', SCHOOL_COLOR[def.school] ?? SCHOOL_FALLBACK);
    div('sao-art', el);
    return { def, el, lastRemaining: 0 };
  }
}
