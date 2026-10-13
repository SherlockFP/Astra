import { G } from '../../game/G';
import { ICON, div, esc, iconEl, pulse, setClass, setDisplay, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Banner ranks (§2.11): 1 boss intro, 2 level-up, 3 quest accepted / completed, 4 zone title, 5 world announce. */
export const BANNER_RANK = { levelUp: 2, quest: 3, zone: 4 } as const;

interface QueuedBanner {
  rank: number;
  ms: number;
  seq: number;
  show: () => void;
  hide: () => void;
}

/** Queue length cap (§2.11): the oldest banner of the lowest rank is dropped past this. */
const QUEUE_MAX = 3;

/**
 * Serialises the big centre banners of ranks 2–5 (§2.11): one plays at a time, the queue is ordered by rank then age, a
 * lower-rank banner waits for the higher one to end, and past three waiting banners the oldest lowest-rank one is dropped.
 * It is a HUD widget (ticked by the HUD loop) so it needs no timer of its own. OWNER: hud module.
 */
export class BannerQueue implements HudWidget {
  readonly el: HTMLElement = div('banner-queue');
  private waiting: QueuedBanner[] = [];
  private current: { rank: number; end: number; hide: () => void } | null = null;
  private seq = 0;

  constructor() {
    setDisplay(this.el, false);
  }

  /** Queues one banner: `show` runs when its turn comes, `hide` runs `ms` later. */
  push(rank: number, ms: number, show: () => void, hide: () => void): void {
    this.waiting.push({ rank, ms, seq: this.seq++, show, hide });
    this.waiting.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
    while (this.waiting.length > QUEUE_MAX) {
      let worst = 0;
      for (let i = 1; i < this.waiting.length; i++) {
        const w = this.waiting[i];
        const cur = this.waiting[worst];
        if (w.rank > cur.rank || (w.rank === cur.rank && w.seq < cur.seq)) worst = i;
      }
      this.waiting.splice(worst, 1);
    }
  }

  /** Ends the running banner and forgets the waiting ones (scene change). */
  clear(): void {
    this.current?.hide();
    this.current = null;
    this.waiting = [];
  }

  update(ctx: HudCtx): void {
    if (this.current && ctx.now >= this.current.end) {
      const c = this.current;
      this.current = null;
      c.hide();
    }
    if (!this.current && this.waiting.length) {
      const next = this.waiting.shift()!;
      this.current = { rank: next.rank, end: ctx.now + next.ms, hide: next.hide };
      next.show();
    }
  }

  reset(): void {
    this.clear();
  }
}

/** Big zone title banner ("ui:zoneName", rank 4): ornamental dividers, fade in/out, through the banner queue. */
export class ZoneBanner implements HudWidget {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private sub: HTMLElement;

  constructor(private queue: BannerQueue) {
    this.el = div('zone');
    div('zone-orn top', this.el);
    this.title = div('zone-title', this.el);
    this.sub = div('zone-sub', this.el);
    div('zone-orn bot', this.el);
    G.events.on('ui:zoneName', (z) => {
      if (!G.ui?.mode || (G.ui.mode !== 'town' && G.ui.mode !== 'dungeon')) return;
      this.queue.push(
        BANNER_RANK.zone,
        4300,
        () => {
          setText(this.title, z.title);
          setText(this.sub, z.subtitle ?? '');
          this.sub.style.display = z.subtitle ? '' : 'none';
          pulse(this.el, 'show');
          setClass(this.el, 'on', true);
        },
        () => setClass(this.el, 'on', false),
      );
    });
    G.events.on('scene:leaving', () => setClass(this.el, 'on', false));
  }

  update(_ctx: HudCtx): void {
    /* timing is owned by the queue */
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

/** "SEVİYE ATLADIN!" banner with rotating light rays (rank 2, through the banner queue). */
export class LevelUpBanner implements HudWidget {
  readonly el: HTMLElement;
  private num: HTMLElement;

  constructor(private queue: BannerQueue) {
    this.el = div('lvlup');
    div('lvlup-rays', this.el);
    div('lvlup-glow', this.el);
    const card = div('lvlup-card', this.el);
    iconEl(ICON('ui-level-up'), 'lvlup-ico', card);
    div('lvlup-title', card).textContent = 'SEVİYE ATLADIN!';
    this.num = div('lvlup-num', card);
    div('lvlup-hint', card).textContent = 'Canın ve kaynakların yenilendi';
    G.events.on('player:levelup', ({ level }) => {
      this.queue.push(
        BANNER_RANK.levelUp,
        4200,
        () => {
          setText(this.num, String(level));
          setClass(this.el, 'on', true);
          pulse(this.el, 'go');
        },
        () => setClass(this.el, 'on', false),
      );
    });
    G.events.on('scene:leaving', () => setClass(this.el, 'on', false));
  }

  update(_ctx: HudCtx): void {
    /* timing is owned by the queue */
  }
}

/**
 * "Görev Alındı: …" / "Görev Tamamlandı: …" banner (rank 3, §2.11, §4.9). Fired on the state transitions of `quest:updated`
 * (available → active, active / ready → done), not on every progress tick. The first sight of a quest that is already done
 * is not announced.
 */
export class QuestBanner implements HudWidget {
  readonly el: HTMLElement;
  private medal: HTMLElement;
  private title: HTMLElement;
  private name: HTMLElement;
  private seen = new Map<string, string>();

  constructor(private queue: BannerQueue) {
    this.el = div('qbanner');
    this.medal = div('qb-medal', this.el);
    const body = div('qb-body', this.el);
    this.title = div('qb-title', body);
    this.name = div('qb-name', body);
    G.events.on('quest:updated', ({ questId, state }) => {
      const prev = this.seen.get(questId);
      this.seen.set(questId, state);
      if (prev === state) return;
      const name = G.quests?.def(questId)?.name ?? questId;
      // accepted: available -> active, or the first sight of an active quest that has no progress yet (a fresh accept)
      const fresh = (prev === undefined || prev === 'available') && (G.quests?.progressRows(questId) ?? []).every((r) => r.have === 0);
      if (state === 'active' && fresh) this.fire('Görev Alındı', name, '!');
      else if (state === 'done' && (prev === 'ready' || prev === 'active')) this.fire('Görev Tamamlandı', name, '✓');
    });
    G.events.on('scene:leaving', () => setClass(this.el, 'on', false));
  }

  private fire(title: string, name: string, glyph: string): void {
    this.queue.push(
      BANNER_RANK.quest,
      2400,
      () => {
        setText(this.medal, glyph);
        setText(this.title, title + ':');
        setText(this.name, name);
        pulse(this.el, 'show');
        setClass(this.el, 'on', true);
      },
      () => setClass(this.el, 'on', false),
    );
  }

  update(_ctx: HudCtx): void {
    /* timing is owned by the queue */
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
