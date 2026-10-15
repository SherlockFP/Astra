import { G } from '../../game/G';
import { ICON, div, esc, iconEl, pulse, setClass, setDisplay, setText } from '../widgets/dom';
import { SKILLS } from '../../data/skills';
import { classGrantOrder } from '../../data/openingKit';
import type { HudCtx, HudWidget } from './types';

/** Banner ranks (§2.11): 1 boss intro, 2 level-up, 3 quest accepted / completed, 4 zone title, 5 world announce. */
export const BANNER_RANK = { levelUp: 2, quest: 3, zone: 4 } as const;

/** Default skill unlock levels in class order when SkillDef.unlockLevel is missing (same table as Progression). */
const DEFAULT_UNLOCKS = [1, 3, 6, 10, 15, 20, 25, 30];
/** The queue that holds the level-up banners (set by LevelUpBanner). */
let levelQueue: BannerQueue | null = null;
/** Ability names listed in the level-up banners of the current lane; their "Yeni beceri öğrendin" toasts are not shown twice. */
const levelAbilityNames = new Set<string>();

/** True while a level-up banner shows or waits: the HUD toast lane holds its toasts until it ends, so none overlaps it. */
export function levelUpBannerBusy(): boolean {
  return !!levelQueue && levelQueue.hasRank(BANNER_RANK.levelUp);
}

/** True for a toast whose content the level-up banner already shows (the "SEVİYE N!" line, a listed new ability). */
export function levelUpBannerSwallows(text: string): boolean {
  if (!levelUpBannerBusy()) return false;
  if (/^SEV.YE \d+!$/.test(text)) return true;
  const m = /^Yeni beceri öğrendin: (.+)$/.exec(text);
  return !!m && levelAbilityNames.has(m[1]);
}

/** Abilities a character learns on reaching `level`: the same rule as Progression.autoAssignSkills (unlock === level). */
function abilitiesAt(level: number): { name: string; icon: string }[] {
  const ch = G.character;
  if (!ch) return [];
  const out: { name: string; icon: string }[] = [];
  classGrantOrder(ch.classId).forEach((id, i) => {
    const def = SKILLS[id];
    const unlock = def?.unlockLevel ?? DEFAULT_UNLOCKS[i] ?? 99;
    if (unlock === level) out.push({ name: def?.name ?? id, icon: def?.icon ?? '' });
  });
  return out;
}

/** Interact prompt text without the key: the badge already shows the key, so a leading or trailing "F" / "[F]" (the bound key) is dropped. */
export function stripKeyHint(text: string, key: string): string {
  const keys = Array.from(new Set([key, 'F'])).map((k) => k.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'));
  const alt = keys.join('|');
  const cleaned = text
    .replace(new RegExp('^\\s*\\[?(?:' + alt + ')\\]?\\s+'), '')
    .replace(new RegExp('\\s*\\[(?:' + alt + ')\\]\\s*$'), '')
    .trim();
  return cleaned || text;
}

interface QueuedBanner {
  rank: number;
  ms: number;
  seq: number;
  show: () => void;
  hide: () => void;
}

/** Queue length cap (§2.11): the oldest banner of the lowest rank is dropped past this. */
const QUEUE_MAX = 3;

/** Zone title on screen: at most 3 s, so it never sits on nameplates and combat text for long. */
const ZONE_BANNER_MS = 3000;

/** True while the local player is in combat (Actor.inCombat: hit or hitting within 5 s). */
const inCombat = (): boolean => !!G.player?.inCombat;

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

  /** True while a banner of this rank shows or waits in the queue. */
  hasRank(rank: number): boolean {
    return this.current?.rank === rank || this.waiting.some((w) => w.rank === rank);
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
      // never over a fight: the title is dropped when it arrives mid-combat
      if (inCombat()) return;
      this.queue.push(
        BANNER_RANK.zone,
        ZONE_BANNER_MS,
        () => {
          // the queue may hand over a turn after combat began: the title stays off then too
          if (inCombat()) return;
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
    // a fight that starts while the title is up takes it down at once; the queue still times out its slot
    if (inCombat() && this.el.classList.contains('on')) setClass(this.el, 'on', false);
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
  private abil: HTMLElement;

  constructor(private queue: BannerQueue) {
    this.el = div('lvlup');
    div('lvlup-rays', this.el);
    div('lvlup-glow', this.el);
    const card = div('lvlup-card', this.el);
    iconEl(ICON('ui-level-up'), 'lvlup-ico', card);
    div('lvlup-title', card).textContent = 'SEVİYE ATLADIN!';
    this.num = div('lvlup-num', card);
    div('lvlup-hint', card).textContent = 'Canın ve kaynakların yenilendi';
    this.abil = div('lvlup-abil', card);
    levelQueue = queue;
    G.events.on('player:levelup', ({ level }) => {
      // the new abilities of this level are listed inside the banner (icon + name), not in a separate toast
      const abilities = abilitiesAt(level);
      for (const a of abilities) levelAbilityNames.add(a.name);
      this.queue.push(
        BANNER_RANK.levelUp,
        4200,
        () => {
          setText(this.num, String(level));
          this.showAbilities(abilities);
          setClass(this.el, 'on', true);
          pulse(this.el, 'go');
        },
        () => {
          setClass(this.el, 'on', false);
          if (!levelUpBannerBusy()) levelAbilityNames.clear();
        },
      );
    });
    G.events.on('scene:leaving', () => setClass(this.el, 'on', false));
  }

  private showAbilities(list: { name: string; icon: string }[]): void {
    this.abil.replaceChildren();
    this.abil.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    div('lvlup-abil-tag', this.abil).textContent = list.length > 1 ? 'Yeni beceriler' : 'Yeni beceri';
    for (const a of list) {
      const row = div('lvlup-ab', this.abil);
      iconEl(a.icon, 'lvlup-ab-ico', row);
      div('lvlup-ab-name', row).textContent = a.name;
    }
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
      const clean = stripKeyHint(text, label);
      if (this.current !== clean) {
        this.text.innerHTML = esc(clean);
        pulse(this.el, 'pop');
      }
      this.current = clean;
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
