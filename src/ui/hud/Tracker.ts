import '../styles/hud-right.css';
import type { Enemy } from '../../entities/Enemy';
import type { UI } from '../UI';
import { ICON, div, fmtClock, h, iconEl, span, setClass, setDisplay, setText } from '../widgets/dom';
import type { World } from '../../world/World';
import { G } from '../../game/G';
import type { HudCtx } from './types';
import type { MythicTracker } from './MythicTracker';
import type { QuestTracker } from './QuestTracker';

type Mode = 'boss' | 'run' | 'quest' | 'hint';

/** Tab order of the header (`Görev · Koşu · Boss`, §2.9). The hint pane has no tab. */
const TAB_MODES: Exclude<Mode, 'hint'>[] = ['quest', 'run', 'boss'];
const TAB: Record<Exclude<Mode, 'hint'>, { label: string; icon: string }> = {
  quest: { label: 'Görev', icon: 'ui-quest' },
  run: { label: 'Koşu', icon: 'ui-dungeon' },
  boss: { label: 'Boss', icon: 'ui-boss' },
};
/** Click on a pane opens the matching panel (quest pane: the quest widget does it itself). */
const OPEN_PANEL: Record<Mode, string | null> = { boss: null, run: 'mplusInfo', quest: 'questlog', hint: 'guide' };
/** A tab click pins its mode for this long (ms), then auto-selection resumes. */
const PIN_MS = 60_000;
const STORE_KEY = 'efsun.tracker.v1';
const HINT_FALLBACK = 'Önerilen adım için [.]';

function loadCollapsed(): Partial<Record<Mode, boolean>> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as { collapsed?: Partial<Record<Mode, unknown>> };
    const out: Partial<Record<Mode, boolean>> = {};
    for (const m of ['boss', 'run', 'quest', 'hint'] as Mode[]) {
      const v = p.collapsed?.[m];
      if (typeof v === 'boolean') out[m] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * The top-right context tracker (UI_REDESIGN §2.9, one tracker for the whole column). Four panes, one shown at a time:
 * `boss` (HUD boss frame is up) > `run` (Mythic+ / dungeon run on screen) > `quest` (an active quest) > `hint`
 * ("Ne yapmalıyım?", so the tracker is never empty). The header lists the modes that have content as text tabs; a tab
 * click pins that mode for 60 s. Collapse state is stored per mode in `efsun.tracker.v1`; `sm` starts collapsed.
 * The MythicTracker and QuestTracker keep their data logic and render into the run and quest panes.
 * OWNER: hud module. Constructor signature is fixed by index.ts.
 */
export class ContextTracker {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly tabRow: HTMLElement;
  private readonly helpBtn: HTMLButtonElement;
  private readonly collapseBtn: HTMLButtonElement;
  private readonly body: HTMLElement;
  private readonly panes: Record<Mode, HTMLElement>;
  private readonly bossName: HTMLElement;
  private readonly bossPhase: HTMLElement;
  private readonly bossEnrage: HTMLElement;
  private readonly hintBody: HTMLElement;
  private tabSig = '';
  private pin: { mode: Mode; until: number } | null = null;
  private collapsed: Partial<Record<Mode, boolean>> = loadCollapsed();
  private lastActive: Mode | '' = '';
  private lastCollapsed: boolean | null = null;
  private hintText = '';
  private engagedId: number | null = null;
  private engagedAt = 0;

  constructor(private ui: UI, private mythic: MythicTracker, private quests: QuestTracker) {
    this.el = div('trk k-plate');

    this.head = div('trk-head', this.el);
    span('trk-title', this.head, 'Takipçi');
    this.tabRow = div('trk-tabs', this.head);
    this.helpBtn = h('button', 'trk-hb', this.head, '?');
    this.helpBtn.type = 'button';
    this.helpBtn.title = 'Otomatik sıra: Boss › Koşu › Görev › Ne yapmalıyım? Sekmeye tıklarsan 60 sn o kalır.';
    this.collapseBtn = h('button', 'trk-hb', this.head, '▾');
    this.collapseBtn.type = 'button';
    this.collapseBtn.title = 'Küçült / Aç';
    this.collapseBtn.addEventListener('click', () => {
      const m = this.lastActive;
      if (m === '') return;
      this.collapsed[m] = !this.isCollapsed(m);
      this.savePrefs();
      this.lastCollapsed = null;
    });

    this.body = div('trk-body', this.el);
    this.panes = {
      boss: div('trk-pane pane-boss', this.body),
      run: div('trk-pane pane-run', this.body),
      quest: div('trk-pane pane-quest', this.body),
      hint: div('trk-pane pane-hint', this.body),
    };

    const bp = this.panes.boss;
    const bpHead = div('trk-bhead', bp);
    iconEl(ICON('ui-boss'), 'trk-bico', bpHead);
    this.bossName = div('trk-bname', bpHead);
    this.bossPhase = span('trk-bphase', bpHead);
    this.bossEnrage = div('trk-enrage', bp);

    // run and quest panes host the widgets built by index.ts (their own data and cards)
    this.panes.run.appendChild(mythic.el);
    this.panes.quest.appendChild(quests.el);

    const hp = this.panes.hint;
    const hint = div('trk-hint', hp);
    div('trk-hint-t', hint, 'Ne yapmalıyım?');
    const row = div('trk-hint-row', hint);
    this.hintBody = div('trk-hint-b', row);
    span('k-key--dim', row, '.');
    this.panes.run.addEventListener('click', () => this.openFor('run'));
    hp.addEventListener('click', () => this.openFor('hint'));
    for (const m of ['boss', 'run', 'quest', 'hint'] as Mode[]) setDisplay(this.panes[m], m === 'hint');
    // index.ts does not list this widget in the HUD loop, so it refreshes itself at 10 Hz (the MythicTracker and
    // QuestTracker flags it reads are kept current by the loop)
    setInterval(() => this.refresh(G.world), 100);
  }

  update(ctx: HudCtx): void {
    this.refresh(ctx.world);
  }

  private refresh(world: World | null): void {
    const bossId = this.ui.hud?.bossEntityId ?? null;
    if (bossId !== this.engagedId) {
      this.engagedId = bossId;
      this.engagedAt = world?.time ?? 0;
    }
    const avail: Mode[] = [];
    if (this.quests.shown) avail.push('quest');
    if (this.mythic.shown) avail.push('run');
    if (bossId !== null) avail.push('boss');

    const now = performance.now();
    if (this.pin && (now > this.pin.until || !avail.includes(this.pin.mode))) this.pin = null;
    const auto: Mode = avail.includes('boss') ? 'boss' : avail.includes('run') ? 'run' : avail.includes('quest') ? 'quest' : 'hint';
    const active: Mode = this.pin ? this.pin.mode : auto;

    this.syncTabs(avail, active);
    for (const m of ['boss', 'run', 'quest', 'hint'] as Mode[]) setDisplay(this.panes[m], m === active);
    if (active === 'boss') this.updateBoss(world);
    if (active === 'hint') this.updateHint();

    const c = this.isCollapsed(active);
    if (active !== this.lastActive || c !== this.lastCollapsed) {
      this.lastActive = active;
      this.lastCollapsed = c;
      setClass(this.el, 'collapsed', c);
      setText(this.collapseBtn, c ? '▸' : '▾');
    }
  }

  reset(): void {
    this.pin = null;
    this.engagedId = null;
  }

  /** Header tabs for the modes with content; rebuilt only when that set changes. */
  private syncTabs(avail: Mode[], active: Mode): void {
    const tabs = TAB_MODES.filter((m) => avail.includes(m));
    const sig = tabs.join(',');
    if (sig !== this.tabSig) {
      this.tabSig = sig;
      this.tabRow.textContent = '';
      for (const m of tabs) {
        const b = h('button', 'trk-tab', this.tabRow);
        b.type = 'button';
        b.dataset.mode = m;
        b.title = TAB[m].label;
        iconEl(ICON(TAB[m].icon), 'trk-tico', b);
        span('trk-tlbl', b, TAB[m].label);
        b.addEventListener('click', () => {
          this.pin = { mode: m, until: performance.now() + PIN_MS };
          b.blur();
        });
      }
      setClass(this.head, 'few', tabs.length >= 3);
    }
    for (const b of Array.from(this.tabRow.children) as HTMLElement[]) setClass(b, 'on', b.dataset.mode === active);
  }

  private isCollapsed(m: Mode): boolean {
    const v = this.collapsed[m];
    if (v !== undefined) return v;
    return this.ui.hud?.density === 'sm';
  }

  private updateBoss(world: World | null): void {
    const id = this.engagedId;
    const boss = id !== null ? (world?.get(id) as Enemy | undefined) : undefined;
    if (!boss) return;
    const def = boss.bossDef;
    setText(this.bossName, def?.name ?? boss.name);
    // phase n is reached when HP drops below the threshold of phase n-1 (same rule as the boss frame notches)
    const frac = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
    const marks = (def?.phases ?? []).filter((p) => p.hpBelow > 0 && p.hpBelow < 1);
    const total = marks.length + 1;
    const cur = 1 + marks.filter((p) => frac < p.hpBelow).length;
    setText(this.bossPhase, total > 1 ? `Faz ${cur} / ${total}` : '');
    const enrageSec = def?.enrageTimer ?? 0;
    const enraged = boss.statuses.has('enrage');
    if (enrageSec > 0 || enraged) {
      const left = enrageSec - ((world?.time ?? 0) - this.engagedAt);
      setDisplay(this.bossEnrage, true);
      setText(this.bossEnrage, enraged || left <= 0 ? 'ÖFKELENDİ!' : `Öfke ${fmtClock(left)}`);
      setClass(this.bossEnrage, 'soon', !enraged && left > 0 && left < 30);
    } else setDisplay(this.bossEnrage, false);
  }

  private updateHint(): void {
    const adv = this.ui.hud?.adviceLine?.() ?? '';
    const text = adv || HINT_FALLBACK;
    if (text === this.hintText) return;
    this.hintText = text;
    setText(this.hintBody, text);
  }

  private openFor(mode: Mode): void {
    const id = OPEN_PANEL[mode];
    if (!id) return;
    try {
      this.ui.openPanel(id);
    } catch (err) {
      console.warn("[hud] tracker: panel " + id + " not open", err);
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ collapsed: this.collapsed }));
    } catch (err) {
      console.warn("[hud] tracker: collapse state not saved", err);
    }
  }
}
