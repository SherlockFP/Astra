import { G } from '../../game/G';
import { getEnemyDef } from '../../data/enemies';
import { formatNumber } from '../../core/utils';
import { CLASS_ICON_PATH, specIcon } from '../../vfx/specIcons';
import { PARTY_ID_BASE, type ClassId, type EntityId, type SceneId } from '../../types/common';
import type { SpecId } from '../../types/v2';
import type { UI } from '../UI';
import { CLASS_COLORS, classColor } from '../widgets/classColors';
import { fmtMeter } from '../widgets/numFormat';
import { ICON, div, esc, fmtClock, h, iconEl, setClass, setDisplay, setIconUrl, setStyle, setText, span, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/**
 * Details!-style damage / healing meter (UI_REDESIGN §2.10.1). Two columns "DPS" and "HPS" with 18 px class-coloured rows
 * (spec icon left, name left and per-second value right on the bar), a death mini-list, and a head with the tabs
 * Hasar / İyileştirme / Ölümler and the segment dropdown. Visibility follows Settings.meterVisibility (auto / always / never);
 * Shift+D toggles it for the session.
 * OWNER: hud module. It is a pure consumer of G.events (damage, heal, death, player:died, boss:*, scene:changed):
 * every peer counts the hits it sees (its own, plus the replicated ones), so nothing is sent over the net.
 * Segments: "Mevcut Dövüş" (a fight starts on the first damage after 3 s quiet and ends 3 s after the last one),
 * one per boss fight, and "Tüm Koşu" (reset when a dungeon starts). Repaints at 4 Hz, never per frame.
 */

/** Party entity ids are PARTY_ID_BASE + slot (ARCHITECTURE "Entity ids"): 1..15. */
const PARTY_LAST = PARTY_ID_BASE + 14;
/** Seconds without damage that end a fight. */
const COMBAT_GAP = 3;
/** `auto` keeps the meter on for this long after the last combat hit (§2.10.1). */
const AUTO_LINGER = 15;
/** Fade-out before the window is removed from the layout. */
const FADE_MS = 400;
/** Seconds between repaints (4 Hz). */
const RENDER_EVERY = 0.25;
/** Finished fights kept for the segment dropdown. */
const HISTORY_CAP = 12;
/** Death entries kept per segment. */
const DEATH_CAP = 40;
/** Rows per column: 5 in the split view, 8 in a single view. */
const SPLIT_ROWS = 5;
const ROWS = 8;
/** Death rows in the pool (the deaths view shows all of them). */
const DEATH_POOL = 8;
const HOTKEY = 'KeyD';
/** v3 `{ view, segment }` (the v2 pill / window position is ignored on purpose). */
const STORE_KEY = 'efsun.dpsMeter.v3';
const OTHER_COLOR = '#8a8a8a';

/** What the window shows: the split view (DPS | HPS), one column, or the death list. */
type View = 'split' | 'damage' | 'healing' | 'taken' | 'deaths';
const VIEWS: View[] = ['split', 'damage', 'healing', 'taken', 'deaths'];

type Mode = 'dmg' | 'heal' | 'taken' | 'deaths';
const MODE_LABEL: Record<Mode, string> = { dmg: 'Hasar', heal: 'İyileştirme', taken: 'Alınan Hasar', deaths: 'Ölümler' };
const COL_TITLE: Record<Mode, string> = { dmg: 'DPS', heal: 'HPS', taken: 'Alınan/sn', deaths: 'Ölüm' };

type StatField = 'dealt' | 'healed' | 'taken' | 'deaths' | 'kills';

/** Per-player counters inside one segment. */
interface Stat {
  id: EntityId;
  dealt: number;
  healed: number;
  taken: number;
  deaths: number;
  kills: number;
}

interface DeathEntry {
  /** performance.now() in seconds. */
  at: number;
  name: string;
  /** Name of the last enemy that hit the player (empty when unknown). */
  by: string;
}

type SegKind = 'run' | 'combat' | 'boss';

interface Segment {
  id: number;
  kind: SegKind;
  /** combat: "Dövüş #n"; boss: boss name; run: "Tüm Koşu". */
  label: string;
  bossId: string | null;
  /** performance.now() in seconds. */
  start: number;
  end: number;
  active: boolean;
  result: 'kill' | 'wipe' | null;
  /** run only: seconds spent in fights (closed fights plus the live one). */
  combatSec: number;
  stats: Map<EntityId, Stat>;
  deathLog: DeathEntry[];
}

/** Dropdown selection: the live/most recent fight, the whole run, or a history segment id. */
type Sel = 'current' | 'run' | number;

interface Row {
  el: HTMLElement;
  ico: HTMLElement;
  fill: HTMLElement;
  nm: HTMLElement;
  vl: HTMLElement;
  stat: Stat | null;
  name: string;
}

interface Col {
  root: HTMLElement;
  title: HTMLElement;
  total: HTMLElement;
  rows: Row[];
}

interface DeathRow {
  el: HTMLElement;
  nm: HTMLElement;
  tm: HTMLElement;
  by: HTMLElement;
}

interface Who {
  name: string;
  cls: ClassId | null;
  spec: SpecId | null;
}

/**
 * Dev hook (dev/hud-ext/meter.ts): fake party members that exist only for the meter, so the dev page can show five
 * classes without a world. Empty in the game.
 */
export const meterDevRoster = new Map<EntityId, { id: EntityId; name: string; classId: ClassId; spec: SpecId | null }>();

const isParty = (id: EntityId | null | undefined): id is EntityId =>
  typeof id === 'number' && id >= PARTY_ID_BASE && id <= PARTY_LAST;

/** performance clock in seconds. */
const clock = (): number => performance.now() / 1000;

function valueOf(st: Stat, mode: Mode): number {
  switch (mode) {
    case 'dmg': return st.dealt;
    case 'heal': return st.healed;
    case 'taken': return st.taken;
    default: return st.deaths;
  }
}

/** The columns a view shows (null = empty column slot). */
function columnsOf(view: View): [Mode | null, Mode | null] {
  switch (view) {
    case 'split': return ['dmg', 'heal'];
    case 'damage': return ['dmg', null];
    case 'healing': return ['heal', null];
    case 'taken': return ['taken', null];
    default: return [null, null];
  }
}

/** The mode a chat summary or a tooltip refers to. */
function primaryMode(view: View): Mode {
  if (view === 'healing') return 'heal';
  if (view === 'taken') return 'taken';
  if (view === 'deaths') return 'deaths';
  return 'dmg';
}

export class DamageMeter implements HudWidget {
  readonly el: HTMLElement;
  private readonly win: HTMLElement;
  private readonly head: HTMLElement;
  /** Hasar, İyileştirme, Ölümler (in that order). */
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly segBtn: HTMLButtonElement;
  private readonly segTxt: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly cols: HTMLElement;
  private readonly colList: Col[] = [];
  private readonly deathBox: HTMLElement;
  private readonly deathRows: DeathRow[] = [];
  private readonly empty: HTMLElement;
  /** Last value written to the bar list's capture mode (see syncCursorMode). */
  private rowsCapture = false;

  private view: View = 'split';
  private sel: Sel = 'current';
  private menuOpen = false;
  private menuDirty = true;
  /** Shift+D override for this session: null = follow Settings.meterVisibility. */
  private forced: boolean | null = null;
  private shownNow = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;

  private seq = 0;
  private fightNo = 0;
  private run: Segment;
  private combat: Segment | null = null;
  private lastCombat: Segment | null = null;
  private boss: Segment | null = null;
  private history: Segment[] = [];
  /** performance seconds of the last fight-relevant damage. */
  private lastHit = -Infinity;
  private nextRender = 0;
  private readonly names = new Map<EntityId, Who>();
  /** Last enemy name that hit each player (the killer shown in the death list). */
  private readonly lastBy = new Map<EntityId, string>();

  constructor(private ui: UI) {
    this.run = this.makeSeg('run', 'Tüm Koşu', null, clock());
    this.loadPrefs();

    this.el = div('dm');
    setDisplay(this.el, false);
    this.win = div('dm-win', this.el);
    this.head = div('dm-head ui-capture', this.win);

    const tabDefs: { view: 'damage' | 'healing' | 'deaths'; icon: string }[] = [
      { view: 'damage', icon: 'skill-sword-slash' },
      { view: 'healing', icon: 'skill-heal' },
      { view: 'deaths', icon: 'ui-skull' },
    ];
    const tabLabels: Record<string, string> = { damage: 'Hasar', healing: 'İyileştirme', deaths: 'Ölümler' };
    for (const td of tabDefs) {
      const b = h('button', 'dm-tab', this.head);
      b.type = 'button';
      b.title = tabLabels[td.view];
      iconEl(ICON(td.icon), 'dm-tico', b);
      span('dm-tlbl', b, tabLabels[td.view]);
      b.addEventListener('click', () => {
        this.onTab(td.view);
        b.blur();
      });
      this.tabs.push(b);
    }

    const segWrap = div('dm-seg', this.head);
    this.segBtn = h('button', 'dm-segbtn', segWrap);
    this.segBtn.type = 'button';
    this.segTxt = span('dm-segtxt', this.segBtn);
    span('dm-caret', this.segBtn, '▾');
    this.menu = div('dm-menu ui-capture', segWrap);
    this.segBtn.addEventListener('click', () => {
      this.menuOpen = !this.menuOpen;
      setClass(this.el, 'menu-open', this.menuOpen);
      if (this.menuOpen) this.buildMenu();
      this.segBtn.blur();
    });

    this.cols = div('dm-cols ui-passthrough', this.win);
    for (let c = 0; c < 2; c++) {
      const root = div('dm-col', this.cols);
      const title = div('dm-title', root);
      const tt = span('dm-tt', title);
      const total = span('dm-tsum', title);
      const list = div('dm-rows', root);
      const rows: Row[] = [];
      for (let i = 0; i < ROWS; i++) rows.push(this.makeRow(list));
      this.colList.push({ root, title: tt, total, rows });
    }

    this.deathBox = div('dm-deaths', this.win);
    for (let i = 0; i < DEATH_POOL; i++) {
      const el = div('dm-death', this.deathBox);
      span('dm-dk', el, '☠');
      const nm = span('dm-dn', el);
      const tm = span('dm-dt', el);
      const by = span('dm-db', el);
      setDisplay(el, false);
      this.deathRows.push({ el, nm, tm, by });
    }
    this.empty = div('dm-empty', this.win, 'Henüz kayıt yok. Bir düşmana vur.');

    const ev = G.events;
    ev.on('damage', (e) => this.onDamage(e.targetId, e.sourceId, e.amount, e.kind));
    ev.on('heal', (e) => {
      if (this.isPlayerId(e.sourceId) && e.amount > 0) this.bump('healed', e.sourceId, e.amount);
    });
    ev.on('death', (e) => {
      if (this.isPlayerId(e.killerId)) this.bump('kills', e.killerId, 1);
    });
    ev.on('player:died', (e) => {
      if (this.isPlayerId(e.entityId)) {
        this.bump('deaths', e.entityId, 1);
        this.recordDeath(e.entityId);
      }
    });
    ev.on('boss:engaged', (e) => this.onBossEngaged(e.bossId));
    ev.on('boss:defeated', (e) => this.closeBoss('kill', e.bossId));
    ev.on('boss:wipe', (e) => this.closeBoss('wipe', e.bossId));
    ev.on('scene:changed', (e) => this.onScene(e.to));

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ---------------------------------------------------------------------------------------------
  // HudWidget
  // ---------------------------------------------------------------------------------------------

  update(ctx: HudCtx): void {
    this.syncCursorMode();
    const t = clock();
    if (this.combat && t - this.lastHit > COMBAT_GAP) this.endFight(this.lastHit + COMBAT_GAP);
    this.applyShown(this.wantShown(ctx, t));
    if (!this.shownNow || t < this.nextRender) return;
    this.nextRender = t + RENDER_EVERY;
    this.render(t);
  }

  /** Visibility (§2.10.1): the Shift+D override first, then Settings.meterVisibility; `auto` = party of 2+, a dungeon, or combat in the last 15 s. */
  private wantShown(ctx: HudCtx, t: number): boolean {
    if (this.forced !== null) return this.forced;
    const v = G.settings?.data.meterVisibility ?? 'auto';
    if (v === 'always') return true;
    if (v === 'never') return false;
    if (ctx.mode === 'dungeon') return true;
    if (this.partyCount() >= 2) return true;
    return t - this.lastHit <= AUTO_LINGER;
  }

  /** Shows at once; hides after the 400 ms fade. A hidden window takes no space (display none). */
  private applyShown(show: boolean): void {
    if (show === this.shownNow) return;
    this.shownNow = show;
    clearTimeout(this.fadeTimer);
    if (show) {
      setClass(this.el, 'fade', false);
      setDisplay(this.el, true);
      return;
    }
    setClass(this.el, 'fade', true);
    this.fadeTimer = setTimeout(() => {
      if (!this.shownNow) setDisplay(this.el, false);
    }, FADE_MS);
  }

  /** Party size as the local player sees it (the local player counts once). */
  private partyCount(): number {
    const ids = new Set<EntityId>();
    const me = G.player;
    if (me) ids.add(me.id);
    for (const p of G.world?.players ?? []) ids.add(p.id);
    return ids.size;
  }

  /**
   * The bar list takes the mouse only while the cursor is free (a panel is open, or Alt frees it). In action camera the
   * cursor is locked and a click is an attack, so a row under an enemy must not swallow it. Only writes on change.
   */
  private syncCursorMode(): void {
    const free = this.ui.wantsCursor() || !!G.input?.down('freeCursor');
    if (free === this.rowsCapture) return;
    this.rowsCapture = free;
    setClass(this.cols, 'ui-capture', free);
    setClass(this.cols, 'ui-passthrough', !free);
  }

  // ---------------------------------------------------------------------------------------------
  // Event intake (no DOM work here)
  // ---------------------------------------------------------------------------------------------

  /** A party member: a party slot id, or the local player's own id (even if the world lookup of its slot fails). */
  private isPlayerId(id: EntityId | null | undefined): id is EntityId {
    if (typeof id !== 'number') return false;
    if (isParty(id)) return true;
    const me = G.player;
    return !!me && id === me.id;
  }

  /**
   * The party member a damage event is credited to. A hit on an enemy that carries no source (older / replicated
   * events) is the local player's own damage when its kind is a player hit (normal / crit / dot).
   */
  private attribute(targetId: EntityId, sourceId: EntityId | null | undefined, kind: string): EntityId | null {
    if (typeof sourceId === 'number') return sourceId;
    if (kind !== 'normal' && kind !== 'crit' && kind !== 'dot') return null;
    if (this.isPlayerId(targetId)) return null;
    // enemies are never player entities: a target the world no longer knows (just died) still counts as an enemy
    const t = G.world?.get(targetId);
    if (t && t.kind !== 'enemy') return null;
    return G.player?.id ?? null;
  }

  private onDamage(targetId: EntityId, sourceId: EntityId | null | undefined, amount: number, kind: string): void {
    // immune / dodge / block texts arrive with amount 0
    if (!(amount > 0)) return;
    const src = this.attribute(targetId, sourceId, kind);
    const srcPlayer = this.isPlayerId(src);
    const tgtPlayer = this.isPlayerId(targetId);
    // a party member hitting an enemy (or the world), or an enemy (not the world) hitting a party member, is a fight;
    // party-on-party self damage and environmental damage are not
    const dealt = srcPlayer && !tgtPlayer;
    const enemyHit = tgtPlayer && !srcPlayer && src !== null;
    // open / extend the fight BEFORE counting, so the first hit of a fight lands in its segment
    if (dealt || enemyHit) this.touchFight(clock());
    if (dealt && src !== null) this.bump('dealt', src, amount);
    if (tgtPlayer) {
      this.bump('taken', targetId, amount);
      if (enemyHit && src !== null) {
        const ent = G.world?.get(src);
        if (ent && 'name' in ent && typeof ent.name === 'string') this.lastBy.set(targetId, ent.name);
      }
    }
  }

  /** Adds `amount` to a player's counter in the run and in every live segment. */
  private bump(field: StatField, id: EntityId, amount: number): void {
    this.statOf(this.run, id)[field] += amount;
    if (this.combat) this.statOf(this.combat, id)[field] += amount;
    if (this.boss) this.statOf(this.boss, id)[field] += amount;
  }

  /** Death entry for the run, the live fight and the live boss segment (the death list reads these). */
  private recordDeath(id: EntityId): void {
    const entry: DeathEntry = { at: clock(), name: this.nameOf(id).name, by: this.lastBy.get(id) ?? '' };
    this.lastBy.delete(id);
    for (const seg of [this.run, this.combat, this.boss]) {
      if (!seg) continue;
      seg.deathLog.push(entry);
      if (seg.deathLog.length > DEATH_CAP) seg.deathLog.shift();
    }
  }

  private statOf(seg: Segment, id: EntityId): Stat {
    let s = seg.stats.get(id);
    if (!s) {
      s = { id, dealt: 0, healed: 0, taken: 0, deaths: 0, kills: 0 };
      seg.stats.set(id, s);
    }
    return s;
  }

  private makeSeg(kind: SegKind, label: string, bossId: string | null, start: number): Segment {
    return { id: ++this.seq, kind, label, bossId, start, end: start, active: true, result: null, combatSec: 0, stats: new Map(), deathLog: [] };
  }

  // ---- fights ----

  private touchFight(now: number): void {
    if (this.combat && now - this.lastHit > COMBAT_GAP) this.endFight(this.lastHit + COMBAT_GAP);
    if (!this.combat) this.startFight(now);
    this.lastHit = now;
  }

  private startFight(now: number): void {
    const seg = this.makeSeg('combat', `Dövüş #${++this.fightNo}`, null, now);
    this.combat = seg;
    this.lastCombat = seg;
    this.addHistory(seg);
  }

  private endFight(at: number): void {
    const c = this.combat;
    if (!c) return;
    c.end = Math.max(c.start, at);
    c.active = false;
    this.combat = null;
    this.run.combatSec += c.end - c.start;
    this.menuDirty = true;
  }

  private addHistory(seg: Segment): void {
    this.history.push(seg);
    while (this.history.length > HISTORY_CAP) {
      const i = this.history.findIndex((s) => !s.active);
      if (i < 0) break;
      this.history.splice(i, 1);
    }
    this.menuDirty = true;
  }

  // ---- bosses ----

  private onBossEngaged(bossId: string): void {
    if (this.boss && this.boss.bossId === bossId) return;
    const t = clock();
    if (this.boss) this.closeBoss(null);
    const name = getEnemyDef(bossId)?.name ?? bossId;
    const seg = this.makeSeg('boss', name, bossId, t);
    this.boss = seg;
    this.addHistory(seg);
  }

  /** Closes the live boss segment (only when `bossId` matches, if given). */
  private closeBoss(result: 'kill' | 'wipe' | null, bossId?: string): void {
    const b = this.boss;
    if (!b) return;
    if (bossId !== undefined && b.bossId !== bossId) return;
    b.end = clock();
    b.active = false;
    b.result = result;
    this.boss = null;
    this.menuDirty = true;
  }

  // ---- scenes ----

  private onScene(to: SceneId): void {
    const t = clock();
    this.endFight(Math.min(t, this.lastHit + COMBAT_GAP));
    this.closeBoss(null);
    if (to === 'dungeon') this.resetRun(t);
  }

  private resetRun(t: number): void {
    this.run = this.makeSeg('run', 'Tüm Koşu', null, t);
    this.history = [];
    this.lastCombat = null;
    this.fightNo = 0;
    if (typeof this.sel === 'number') this.sel = 'current';
    this.menuDirty = true;
    this.nextRender = 0;
  }

  // ---------------------------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------------------------

  private segDuration(seg: Segment, t: number): number {
    const d = seg.kind === 'run'
      ? seg.combatSec + (this.combat ? t - this.combat.start : 0)
      : (seg.active ? t : seg.end) - seg.start;
    return Math.max(1, d);
  }

  private resolve(): Segment | null {
    if (this.sel === 'run') return this.run;
    if (this.sel === 'current') return this.combat ?? this.lastCombat;
    const s = this.history.find((x) => x.id === this.sel);
    return s ?? this.combat ?? this.lastCombat;
  }

  private segTitle(seg: Segment): string {
    if (seg.kind === 'run') return 'Tüm Koşu';
    if (seg.kind === 'combat') return seg.label + (seg.active ? ' (sürüyor)' : '');
    const state = seg.active ? 'sürüyor'
      : seg.result === 'kill' ? 'Öldürüldü'
      : seg.result === 'wipe' ? 'Ekip düştü'
      : 'Yarım kaldı';
    return `Boss: ${seg.label} (${state})`;
  }

  private selLabel(seg: Segment | null): string {
    if (this.sel === 'current') return 'Mevcut Dövüş';
    if (this.sel === 'run') return 'Tüm Koşu';
    return seg ? this.segTitle(seg) : 'Mevcut Dövüş';
  }

  private nameOf(id: EntityId): Who {
    const r = this.names.get(id);
    if (r && r.name) return r;
    return { name: `Oyuncu ${id - PARTY_ID_BASE + 1}`, cls: r?.cls ?? null, spec: r?.spec ?? null };
  }

  private refreshRoster(): void {
    const w = G.world;
    const list = [] as { id: EntityId; name: string; classId: ClassId; spec: SpecId | null }[];
    if (w) for (const p of w.players) list.push({ id: p.id, name: p.name, classId: p.classId, spec: p.spec ?? null });
    for (const d of meterDevRoster.values()) if (!list.some((p) => p.id === d.id)) list.push(d);
    // the local player is always listed (its own hits must show even if the world roster lags behind)
    const me = G.player;
    if (me && !list.some((p) => p.id === me.id)) list.push({ id: me.id, name: me.name, classId: me.classId, spec: me.spec ?? null });
    for (const p of list) {
      const r = this.names.get(p.id);
      if (r) {
        r.name = p.name;
        r.cls = p.classId;
        r.spec = p.spec;
      } else this.names.set(p.id, { name: p.name, cls: p.classId, spec: p.spec });
      // the run lists every party member, even those who have not done anything yet
      this.statOf(this.run, p.id);
    }
  }

  /** The segment's players sorted by the mode's value, with the segment total. */
  private rank(seg: Segment | null, mode: Mode): { list: Stat[]; total: number } {
    const list: Stat[] = [];
    let total = 0;
    if (seg) {
      for (const st of seg.stats.values()) {
        list.push(st);
        total += valueOf(st, mode);
      }
    }
    list.sort((a, b) => valueOf(b, mode) - valueOf(a, mode));
    return { list, total };
  }

  /** Spec icon of a player, the class icon when the spec is unknown (remote players), or none. */
  private iconOf(who: Who): string {
    return specIcon(who.spec) || (who.cls ? CLASS_ICON_PATH[who.cls] : '') || '';
  }

  private colourOf(who: Who): string {
    return who.cls && CLASS_COLORS[who.cls] ? classColor(who.cls) : OTHER_COLOR;
  }

  /** The effective view: the split view needs two columns, so the small size class shows single views only. */
  private effectiveView(): View {
    if (this.view === 'split' && this.ui.hud?.density === 'sm') return 'damage';
    return this.view;
  }

  // ---------------------------------------------------------------------------------------------
  // Render (4 Hz, only while shown)
  // ---------------------------------------------------------------------------------------------

  private render(t: number): void {
    this.refreshRoster();
    const view = this.effectiveView();
    const seg = this.resolve();
    const dur = seg ? this.segDuration(seg, t) : 1;
    const me = G.player?.id ?? -1;

    for (let i = 0; i < this.tabs.length; i++) {
      const on = i === 0 ? view === 'split' || view === 'damage' : i === 1 ? view === 'split' || view === 'healing' : view === 'deaths';
      setClass(this.tabs[i], 'on', on);
    }
    setText(this.segTxt, seg ? `${this.selLabel(seg)} ${fmtClock(this.segDuration(seg, t))}` : this.selLabel(seg));
    if (this.menuOpen && this.menuDirty) this.buildMenu();

    setClass(this.win, 'single', view !== 'split');
    setClass(this.win, 'deaths', view === 'deaths');
    setDisplay(this.empty, !seg);
    setDisplay(this.cols, !!seg && view !== 'deaths');

    const cols = columnsOf(view);
    const perCol = view === 'split' ? SPLIT_ROWS : ROWS;
    for (let c = 0; c < this.colList.length; c++) {
      const col = this.colList[c];
      const mode = cols[c];
      setDisplay(col.root, mode !== null && !!seg);
      if (mode === null || !seg) continue;
      const { list, total } = this.rank(seg, mode);
      // the local player is always listed: outside the shown ranks it replaces the last row, prefixed with its rank
      const idx = list.findIndex((s) => s.id === me);
      const self = idx >= 0 ? list[idx] : me >= 0 && this.isPlayerId(me) ? this.blankStat(me) : null;
      if (self && idx < 0) list.push(self);
      const selfIdx = list.indexOf(self as Stat);
      const shown: { st: Stat; rank: number; extra: boolean }[] = list.slice(0, perCol).map((st, i) => ({ st, rank: i + 1, extra: false }));
      if (selfIdx >= perCol && shown.length > 0) shown[shown.length - 1] = { st: list[selfIdx], rank: selfIdx + 1, extra: true };
      const top = list.length > 0 ? valueOf(list[0], mode) : 0;

      setText(col.title, COL_TITLE[mode]);
      setText(col.total, `Σ ${fmtMeter(total)}`);
      for (let i = 0; i < ROWS; i++) {
        const row = col.rows[i];
        const item = shown[i];
        setDisplay(row.el, !!item);
        row.stat = item?.st ?? null;
        if (!item) continue;
        this.paintRow(row, item, top, mode, dur, me);
      }
    }

    this.renderDeaths(seg, view);
  }

  private blankStat(id: EntityId): Stat {
    return { id, dealt: 0, healed: 0, taken: 0, deaths: 0, kills: 0 };
  }

  private paintRow(row: Row, item: { st: Stat; rank: number; extra: boolean }, top: number, mode: Mode, dur: number, me: EntityId): void {
    const st = item.st;
    const v = valueOf(st, mode);
    const who = this.nameOf(st.id);
    row.name = who.name;
    setText(row.nm, item.extra ? `${item.rank}. Sen` : who.name);
    setText(row.vl, fmtMeter(v / dur));
    setStyle(row.fill, '--bc', this.colourOf(who));
    setStyle(row.fill, 'width', top > 0 ? `${((v / top) * 100).toFixed(1)}%` : '0%');
    setIconUrl(row.ico, this.iconOf(who));
    setClass(row.el, 'me', st.id === me);
    setClass(row.el, 'extra', item.extra);
  }

  /** Death mini-list (split and single views, 3 / 2 rows; none at `sm`) and the full list of the deaths view. */
  private renderDeaths(seg: Segment | null, view: View): void {
    const sm = this.ui.hud?.density === 'sm';
    const limit = view === 'deaths' ? DEATH_POOL : this.ui.hud?.density === 'md' ? 2 : 3;
    const hide = !seg || seg.deathLog.length === 0 || (view !== 'deaths' && sm);
    setDisplay(this.deathBox, !hide);
    if (hide || !seg) return;
    const entries = seg.deathLog.slice(-limit).reverse();
    for (let i = 0; i < DEATH_POOL; i++) {
      const r = this.deathRows[i];
      const e = entries[i];
      setDisplay(r.el, !!e);
      if (!e) continue;
      setText(r.nm, e.name);
      setText(r.tm, fmtClock(e.at - seg.start));
      setText(r.by, e.by);
    }
  }

  private makeRow(parent: HTMLElement): Row {
    const el = div('dm-row', parent);
    const ico = iconEl(null, 'dm-ico', el);
    const bar = div('dm-bar', el);
    const fill = div('dm-fill', bar);
    const nm = span('dm-nm', bar);
    const vl = span('dm-vl', bar);
    const row: Row = { el, ico, fill, nm, vl, stat: null, name: '' };
    el.addEventListener('mouseenter', (e) => this.showRowTip(row, e));
    el.addEventListener('mouseleave', () => this.ui.hideTooltipIf(el));
    return row;
  }

  /** Tab click: an unlit tab opens its single view, the lit tab of a single view returns to the split view. */
  private onTab(t: 'damage' | 'healing' | 'deaths'): void {
    if (t === 'deaths') this.view = 'deaths';
    else {
      const cur = this.effectiveView();
      if (cur === t) {
        if (this.ui.hud?.density === 'sm') return;
        this.view = 'split';
      } else this.view = t;
    }
    this.savePrefs();
    this.nextRender = 0;
  }

  private buildMenu(): void {
    this.menuDirty = false;
    this.menu.textContent = '';
    this.menuItem('current', 'Mevcut Dövüş');
    this.menuItem('run', 'Tüm Koşu');
    for (let i = this.history.length - 1; i >= 0; i--) {
      const s = this.history[i];
      this.menuItem(s.id, this.segTitle(s));
    }
    const taken = h('button', 'dm-mi', this.menu, this.view === 'taken' ? 'Alınan Hasarı Kapat' : 'Alınan Hasar');
    taken.type = 'button';
    taken.addEventListener('click', () => {
      this.view = this.view === 'taken' ? 'split' : 'taken';
      this.afterChoice();
    });
    const send = h('button', 'dm-mi', this.menu, 'Sohbete Gönder');
    send.type = 'button';
    send.addEventListener('click', () => {
      this.send();
      this.afterChoice();
    });
  }

  private menuItem(sel: Sel, label: string): void {
    const b = h('button', 'dm-mi', this.menu, label);
    b.type = 'button';
    setClass(b, 'on', sel === this.sel);
    b.addEventListener('click', () => {
      this.sel = sel;
      this.afterChoice();
    });
  }

  private afterChoice(): void {
    this.menuOpen = false;
    setClass(this.el, 'menu-open', false);
    this.savePrefs();
    this.nextRender = 0;
  }

  private showRowTip(row: Row, e: MouseEvent): void {
    const st = row.stat;
    if (!st) return;
    const html = `<div class="st"><div class="st-name">${esc(row.name)}</div>`
      + `<div class="st-kind">Hasar ${esc(formatNumber(st.dealt))} · İyileştirme ${esc(formatNumber(st.healed))}</div>`
      + `<div class="st-kind">Alınan ${esc(formatNumber(st.taken))} · Ölüm ${st.deaths} · Öldürme ${st.kills}</div></div>`;
    this.ui.showTooltipFor(row.el, html, e.clientX, e.clientY);
  }

  // ---------------------------------------------------------------------------------------------
  // Chat summary
  // ---------------------------------------------------------------------------------------------

  private summary(seg: Segment, t: number, mode: Mode): string {
    const dur = this.segDuration(seg, t);
    const { list } = this.rank(seg, mode);
    const head = `Dövüş Ölçer · ${MODE_LABEL[mode]} · ${this.segTitle(seg)} · ${fmtClock(dur)}: `;
    let text = head;
    let count = 0;
    for (let i = 0; i < list.length && count < 5; i++) {
      const st = list[i];
      const v = valueOf(st, mode);
      if (v <= 0) continue;
      const piece = `${count > 0 ? ' | ' : ''}${i + 1}. ${this.nameOf(st.id).name} ${formatNumber(v)}`
        + (mode === 'deaths' ? ' ölüm' : ` (${formatNumber(v / dur)}/sn)`);
      if (text.length + piece.length > 185) break;
      text += piece;
      count++;
    }
    if (count === 0) text += 'veri yok';
    return text;
  }

  private send(): void {
    const seg = this.resolve();
    if (!seg) {
      this.ui.toast('Gönderilecek dövüş verisi yok.', 'info');
      return;
    }
    const text = this.summary(seg, clock(), primaryMode(this.effectiveView()));
    try {
      if (G.net.isOnline) G.net.sendChat(text);
      else G.events.emit('net:chat', { from: 'Sistem', text, channel: 'system' });
    } catch (e) {
      console.warn('[dps] chat send failed', e);
    }
    uiSound('ui_click', 0.6);
  }

  // ---------------------------------------------------------------------------------------------
  // Hotkey and persistence
  // ---------------------------------------------------------------------------------------------

  /** Shift+D: shows the meter when it is hidden, hides it when it is shown (for this session). */
  private onKey(e: KeyboardEvent): void {
    if (e.code !== HOTKEY || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mode = this.ui.mode;
    if (mode !== 'town' && mode !== 'dungeon') return;
    if (this.ui.hud?.chat.isFocused) return;
    this.forced = !this.shownNow;
    this.nextRender = 0;
  }

  private loadPrefs(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as { view?: unknown; segment?: unknown };
      if (typeof p.view === 'string' && (VIEWS as string[]).includes(p.view)) this.view = p.view as View;
      if (p.segment === 'current' || p.segment === 'run') this.sel = p.segment;
    } catch (err) {
      console.warn("[dps] saved meter prefs unreadable, using defaults", err);
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view: this.view, segment: this.sel === 'run' ? 'run' : 'current' }));
    } catch (err) {
      console.warn("[dps] meter prefs not saved", err);
    }
  }
}
