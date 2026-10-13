import { G } from '../../game/G';
import { ICON, div, esc, iconEl, pulse, setClass, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Big zone title banner ("ui:zoneName"): ornamental dividers, fade in/out, queued. */
export class ZoneBanner implements HudWidget {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;
  private queue: { title: string; subtitle?: string }[] = [];
  private until = 0;
  private phase: 'idle' | 'show' = 'idle';

  constructor() {
    this.el = div('zone');
    div('zone-orn top', this.el);
    this.title = div('zone-title', this.el);
    this.sub = div('zone-sub', this.el);
    div('zone-orn bot', this.el);
    G.events.on('ui:zoneName', (z) => {
      this.queue.push(z);
      if (this.queue.length > 3) this.queue.shift();
    });
    G.events.on('scene:leaving', () => {
      this.queue = [];
      this.until = 0;
      this.phase = 'idle';
      setClass(this.el, 'show', false);
    });
  }

  update(ctx: HudCtx): void {
    if (this.phase === 'idle' && this.queue.length && (ctx.mode === 'town' || ctx.mode === 'dungeon')) {
      const z = this.queue.shift()!;
      setText(this.title, z.title);
      setText(this.sub, z.subtitle ?? '');
      this.sub.style.display = z.subtitle ? '' : 'none';
      pulse(this.el, 'show');
      setClass(this.el, 'on', true);
      this.until = ctx.now + 4300;
      this.phase = 'show';
    } else if (this.phase === 'show' && ctx.now > this.until) {
      setClass(this.el, 'on', false);
      this.phase = 'idle';
    }
  }
}

/** Huge pre-run countdown numbers (10..1) and "BAŞLA!". Reads G.mplus.state.countdown and 'run:countdown'. */
export class CountdownBanner implements HudWidget {
  readonly el: HTMLElement;
  private label: HTMLElement;
  private num: HTMLElement;
  private last = -1;
  private hideAt = 0;
  private startedSeen = false;

  constructor() {
    this.el = div('cd');
    this.label = div('cd-label', this.el);
    this.num = div('cd-num', this.el);
    G.events.on('run:countdown', ({ seconds }) => this.show(Math.ceil(seconds)));
    G.events.on('run:started', () => {
      this.startedSeen = true;
    });
    G.events.on('scene:leaving', () => {
      this.last = -1;
      this.hideAt = 0;
      setClass(this.el, 'on', false);
    });
  }

  private show(n: number): void {
    if (n === this.last) return;
    this.last = n;
    if (n > 0) {
      setText(this.num, String(n));
      setText(this.label, n > 3 ? 'Koşu başlıyor' : 'Hazır ol!');
      this.el.dataset.n = n <= 3 ? String(n) : '4';
      setClass(this.el, 'go', false);
      this.hideAt = performance.now() + 1100;
    } else {
      setText(this.num, 'BAŞLA!');
      setText(this.label, '');
      this.el.dataset.n = '0';
      setClass(this.el, 'go', true);
      this.hideAt = performance.now() + 1500;
    }
    setClass(this.el, 'on', true);
    pulse(this.num, 'tick');
  }

  update(ctx: HudCtx): void {
    const st = G.mplus?.state;
    if (st && !st.started && st.countdown > 0) this.show(Math.ceil(st.countdown));
    else if (st && st.started && this.last > 0) this.show(0);
    if (this.hideAt && ctx.now > this.hideAt) {
      this.hideAt = 0;
      setClass(this.el, 'on', false);
      if (this.last === 0) this.last = -1;
    }
    void this.startedSeen;
  }
}

/** "SEVİYE ATLADIN!" banner with rotating light rays. */
export class LevelUpBanner implements HudWidget {
  readonly el: HTMLElement;
  private num: HTMLElement;
  private hideAt = 0;

  constructor() {
    this.el = div('lvlup');
    div('lvlup-rays', this.el);
    div('lvlup-glow', this.el);
    const card = div('lvlup-card', this.el);
    iconEl(ICON('ui-level-up'), 'lvlup-ico', card);
    div('lvlup-title', card).textContent = 'SEVİYE ATLADIN!';
    this.num = div('lvlup-num', card);
    div('lvlup-hint', card).textContent = 'Canın ve kaynakların yenilendi';
    G.events.on('player:levelup', ({ level }) => {
      setText(this.num, String(level));
      setClass(this.el, 'on', true);
      pulse(this.el, 'go');
      this.hideAt = performance.now() + 4200;
    });
    G.events.on('scene:leaving', () => {
      this.hideAt = 0;
      setClass(this.el, 'on', false);
    });
  }

  update(ctx: HudCtx): void {
    if (this.hideAt && ctx.now > this.hideAt) {
      this.hideAt = 0;
      setClass(this.el, 'on', false);
    }
  }
}

/** "[F] Demirci ile konuş" interaction prompt. */
export class InteractPrompt implements HudWidget {
  readonly el: HTMLElement;
  private key: HTMLElement;
  private text: HTMLElement;
  private current: string | null = null;

  constructor() {
    this.el = div('ip');
    this.key = div('ip-key', this.el);
    this.text = div('ip-text', this.el);
    G.events.on('interact:prompt', ({ text, key }) => {
      if (!text) {
        this.current = null;
        setClass(this.el, 'on', false);
        return;
      }
      const label = key ?? (G.input ? G.input.bindingLabel('interact') : 'F');
      this.key.textContent = label;
      if (this.current !== text) {
        this.text.innerHTML = esc(text);
        pulse(this.el, 'pop');
      }
      this.current = text;
      setClass(this.el, 'on', true);
    });
    G.events.on('scene:leaving', () => {
      this.current = null;
      setClass(this.el, 'on', false);
    });
  }

  update(ctx: HudCtx): void {
    // hide while a panel owns the cursor
    setClass(this.el, 'hidden', ctx.ui.wantsCursor());
  }
}

/**
 * World announcements (`world:announce`: metin / rare / boss / info, GDD_OPENWORLD §9.4): a stack of short lines under the zone
 * title, newest at the bottom. Each line lives 4.5 s; at most three are shown. OWNER: hud module.
 */
export class WorldAnnounce implements HudWidget {
  readonly el: HTMLElement;
  private items: { el: HTMLElement; until: number }[] = [];

  constructor() {
    this.el = div('wa');
    G.events.on('world:announce', ({ text, kind }) => {
      const row = div(`wa-row wa-${kind}`, this.el);
      setText(row, text);
      this.items.push({ el: row, until: performance.now() + 4500 });
      while (this.items.length > 3) this.items.shift()?.el.remove();
    });
    G.events.on('scene:leaving', () => this.clear());
  }

  update(ctx: HudCtx): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (ctx.now > this.items[i].until) {
        this.items[i].el.remove();
        this.items.splice(i, 1);
      }
    }
  }

  reset(): void {
    this.clear();
  }

  private clear(): void {
    for (const it of this.items) it.el.remove();
    this.items = [];
  }
}
