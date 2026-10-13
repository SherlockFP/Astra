import { G } from '../../game/G';
import { getEnemyDef } from '../../data/enemies';
import { formatNumber } from '../../core/utils';
import { PARTY_ID_BASE, type ClassId, type EntityId, type SceneId } from '../../types/common';
import type { UI } from '../UI';
import { ICON, div, esc, fmtClock, h, iconEl, setClass, setStyle, setText, span, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/**
 * Damage meter ("Dövüş Ölçer"): a WoW Details!-style party meter, right edge above the loot column, closed to the DPS pill
 * by default. Clicks: only the header and buttons are UI; the bar list passes clicks through to the game unless the cursor is free.
 * OWNER: hud module. It is a pure consumer of G.events (damage, heal, death, player:died, boss:*, scene:changed):
 * every peer counts the hits it sees (its own, plus the replicated ones), so nothing is sent over the net.
 * Segments: "Mevcut Dövüş" (a fight starts on the first damage after 3 s quiet and ends 3 s after the last one),
 * one per boss fight, and "Tüm Koşu" (reset when a dungeon starts). Repaints at 4 Hz, never per frame.
 */

/** Party entity ids are PARTY_ID_BASE + slot (ARCHITECTURE "Entity ids"): 1..15. */
const PARTY_LAST = PARTY_ID_BASE + 14;
/** Seconds without damage that end a fight. */
const COMBAT_GAP = 3;
/** Seconds between repaints (4 Hz). */
const RENDER_EVERY = 0.25;
/** Finished fights kept for the segment dropdown. */
const HISTORY_CAP = 12;
/** Visible player rows (party is at most 5; the pool leaves room for more). */
const ROWS = 8;
const WIDTH = 320;
const HOTKEY = 'KeyD';
/** v2: the meter starts closed (DPS pill) at the right edge; older saved layouts (open, centre) are ignored on purpose. */
const STORE_KEY = 'efsun.dpsMeter.v2';

const CLASS_COLOR: Record<ClassId, string> = {
  knight: '#c79c6e',
  barbarian: '#c41f3b',
  mage: '#3fc7eb',
  rogue: '#fff569',
  monk: '#4fd1c5',
  archer: '#d9a441',
  paladin: '#fff0b8',
  necromancer: '#9ee07a',
  warlock: '#c05ae0',
  demonhunter: '#a330c9', // WoW class colour (CM1)
  evoker: '#33937f',      // WoW class colour (CM1)
};
const OTHER_COLOR = '#8a8a8a';

type Mode = 'dmg' | 'heal' | 'taken' | 'deaths';
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'dmg', label: 'Hasar', icon: 'skill-sword-slash' },
  { id: 'heal', label: 'İyileştirme', icon: 'skill-heal' },
  { id: 'taken', label: 'Alınan Hasar', icon: 'item-shield' },
  { id: 'deaths', label: 'Ölümler', icon: 'ui-skull' },
];

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
}

/** Dropdown selection: the live/most recent fight, the whole run, or a history segment id. */
type Sel = 'current' | 'run' | number;

interface Row {
  el: HTMLElement;
  bar: HTMLElement;
  rk: HTMLElement;
  nm: HTMLElement;
  vl: HTMLElement;
  ps: HTMLElement;
  pc: HTMLElement;
  stat: Stat | null;
  name: string;
}

const isParty = (id: EntityId | null | undefined): id is EntityId =>
  typeof id === 'number' && id >= PARTY_ID_BASE && id <= PARTY_LAST;

/** performance clock in seconds. */
const clock = (): number => performance.now() / 1000;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function valueOf(st: Stat, mode: Mode): number {
  switch (mode) {
    case 'dmg': return st.dealt;
    case 'heal': return st.healed;
    case 'taken': return st.taken;
    default: return st.deaths;
  }
}

export class DamageMeter implements HudWidget {
  readonly el: HTMLElement;
  private readonly pill: HTMLButtonElement;
  private readonly win: HTMLElement;
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs: HTMLButtonElement[] = [];
  private readonly segBtn: HTMLButtonElement;
  private readonly segTxt: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly rowsEl: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly empty: HTMLElement;
  private readonly collapseBtn: HTMLButtonElement;
  private readonly sendBtn: HTMLButtonElement;
  /** Last value written to the bar list's capture mode (see syncCursorMode). */
  private rowsCapture = false;

  private open = false;
  /** A saved position is applied on the first update (the element is not attached yet in the constructor). */
  private placePending = true;
  private collapsed = false;
  private mode: Mode = 'dmg';
  private sel: Sel = 'current';
  private menuOpen = false;
  private menuDirty = true;
  /** Dragged position in HUD css px (null = default bottom-right anchor). */
  private pos: { x: number; y: number } | null = null;
  private drag: { pid: number; sx: number; sy: number; ox: number; oy: number } | null = null;

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
  private readonly names = new Map<EntityId, { name: string; cls: ClassId | null }>();
  /** Reused sort buffer for the repaint and the chat summary (no per-frame allocation). */
  private readonly scratch: Stat[] = [];

  constructor(private ui: UI) {
    this.run = this.makeSeg('run', 'Tüm Koşu', null, clock());
    this.loadPrefs();

    this.el = div('dm');
    this.pill = h('button', 'dm-pill hud-interactive ui-capture', this.el);
    this.pill.type = 'button';
    this.pill.title = 'Dövüş Ölçer (Shift+D)';
    iconEl(ICON('ui-leaderboard'), 'dm-pico', this.pill);
    span('dm-plbl', this.pill, 'DPS');

    // Capture is per element, not per window: the header and the buttons take the mouse, the window body and the bar
    // list pass clicks through to the game (a fight behind the meter must still be clickable).
    this.win = div('dm-win', this.el);
    this.head = div('dm-head ui-capture', this.win);
    span('dm-title', this.head, 'Dövüş Ölçer');
    span('dm-key', this.head, 'Shift+D');
    this.collapseBtn = h('button', 'dm-hb', this.head, '–');
    this.collapseBtn.type = 'button';
    this.collapseBtn.title = 'Küçült / Aç';
    const closeBtn = h('button', 'dm-hb', this.head, '×');
    closeBtn.type = 'button';
    closeBtn.title = 'Kapat';

    this.body = div('dm-body', this.win);
    const tabRow = div('dm-tabs', this.body);
    MODES.forEach((m, i) => {
      const b = h('button', 'dm-tab', tabRow);
      b.type = 'button';
      iconEl(ICON(m.icon), 'dm-tico', b);
      span('dm-tlbl', b, m.label);
      b.addEventListener('click', () => {
        this.mode = MODES[i].id;
        this.menuOpen = false;
        setClass(this.el, 'menu-open', false);
        this.savePrefs();
        this.nextRender = 0;
        b.blur();
      });
      this.tabs.push(b);
    });

    const segWrap = div('dm-seg', this.body);
    this.segBtn = h('button', 'dm-segbtn', segWrap);
    this.segBtn.type = 'button';
    this.segTxt = span('dm-segtxt', this.segBtn);
    span('dm-caret', this.segBtn);
    this.menu = div('dm-menu ui-capture', segWrap);
    this.segBtn.addEventListener('click', () => {
      this.menuOpen = !this.menuOpen;
      setClass(this.el, 'menu-open', this.menuOpen);
      if (this.menuOpen) this.buildMenu();
      this.segBtn.blur();
    });

    this.meta = div('dm-meta', this.body);
    this.rowsEl = div('dm-rows ui-passthrough', this.body);
    for (let i = 0; i < ROWS; i++) {
      const el = div('dm-row off', this.rowsEl);
      const bar = div('dm-bar', el);
      const row: Row = {
        el, bar,
        rk: span('dm-rk', el),
        nm: span('dm-nm', el),
        vl: span('dm-vl', el),
        ps: span('dm-ps', el),
        pc: span('dm-pc', el),
        stat: null,
        name: '',
      };
      el.addEventListener('mouseenter', (e) => this.showRowTip(row, e));
      el.addEventListener('mouseleave', () => this.ui.hideTooltipIf(el));
      this.rows.push(row);
    }
    this.empty = div('dm-empty', this.body, 'Henüz kayıt yok.');

    this.sendBtn = h('button', 'dm-send hud-interactive', this.body, 'Sohbete Gönder');
    this.sendBtn.type = 'button';
    this.sendBtn.title = 'Seçili görünümün özetini grup sohbetine yaz';
    this.sendBtn.addEventListener('click', () => {
      this.send();
      this.sendBtn.blur();
    });

    this.pill.addEventListener('click', () => {
      this.setOpen(true);
      this.pill.blur();
    });
    closeBtn.addEventListener('click', () => {
      this.setOpen(false);
      closeBtn.blur();
    });
    this.collapseBtn.addEventListener('click', () => {
      this.setCollapsed(!this.collapsed);
      this.collapseBtn.blur();
    });

    this.head.addEventListener('pointerdown', (e) => this.onDown(e));
    this.head.addEventListener('pointermove', (e) => this.onMove(e));
    this.head.addEventListener('pointerup', (e) => this.onUp(e));
    this.head.addEventListener('pointercancel', (e) => this.onUp(e));

    setClass(this.el, 'closed', !this.open);
    setClass(this.el, 'collapsed', this.collapsed);
    this.collapseBtn.textContent = this.collapsed ? '+' : '–';
    if (this.pos) {
      this.el.style.left = `${this.pos.x}px`;
      this.el.style.top = `${this.pos.y}px`;
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
    }

    const ev = G.events;
    ev.on('damage', (e) => this.onDamage(e.targetId, e.sourceId, e.amount, e.kind));
    ev.on('heal', (e) => {
      if (this.isPlayerId(e.sourceId) && e.amount > 0) this.bump('healed', e.sourceId, e.amount);
    });
    ev.on('death', (e) => {
      if (this.isPlayerId(e.killerId)) this.bump('kills', e.killerId, 1);
    });
    ev.on('player:died', (e) => {
      if (this.isPlayerId(e.entityId)) this.bump('deaths', e.entityId, 1);
    });
    ev.on('boss:engaged', (e) => this.onBossEngaged(e.bossId));
    ev.on('boss:defeated', (e) => this.closeBoss('kill', e.bossId));
    ev.on('boss:wipe', (e) => this.closeBoss('wipe', e.bossId));
    ev.on('scene:changed', (e) => this.onScene(e.to));

    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => {
      if (this.pos) this.placeAt(this.pos.x, this.pos.y);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // HudWidget
  // ---------------------------------------------------------------------------------------------

  update(_ctx: HudCtx): void {
    if (this.placePending) {
      this.placePending = false;
      if (this.pos) this.placeAt(this.pos.x, this.pos.y);
    }
    this.syncCursorMode();
    const t = clock();
    if (this.combat && t - this.lastHit > COMBAT_GAP) this.endFight(this.lastHit + COMBAT_GAP);
    if (!this.open || t < this.nextRender) return;
    this.nextRender = t + RENDER_EVERY;
    this.render(t);
  }

  /**
   * The bar list takes the mouse only while the cursor is free (a panel is open, or Alt frees it). In action camera the
   * cursor is locked and a click is an attack, so a row under an enemy must not swallow it. Only writes on change.
   */
  private syncCursorMode(): void {
    const free = this.ui.wantsCursor() || !!G.input?.down('freeCursor');
    if (free === this.rowsCapture) return;
    this.rowsCapture = free;
    setClass(this.rowsEl, 'ui-capture', free);
    setClass(this.rowsEl, 'ui-passthrough', !free);
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
    if (tgtPlayer) this.bump('taken', targetId, amount);
  }

  /** Adds `amount` to a player's counter in the run and in every live segment. */
  private bump(field: StatField, id: EntityId, amount: number): void {
    this.statOf(this.run, id)[field] += amount;
    if (this.combat) this.statOf(this.combat, id)[field] += amount;
    if (this.boss) this.statOf(this.boss, id)[field] += amount;
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
    return { id: ++this.seq, kind, label, bossId, start, end: start, active: true, result: null, combatSec: 0, stats: new Map() };
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

  private nameOf(id: EntityId): { name: string; cls: ClassId | null } {
    const r = this.names.get(id);
    if (r && r.name) return r;
    return { name: `Oyuncu ${id - PARTY_ID_BASE + 1}`, cls: r?.cls ?? null };
  }

  private refreshRoster(): void {
    const w = G.world;
    const list: { id: EntityId; name: string; classId: ClassId }[] = [];
    if (w) for (const p of w.players) list.push(p);
    // the local player is always listed (its own hits must show even if the world roster lags behind)
    const me = G.player;
    if (me && !list.some((p) => p.id === me.id)) list.push(me);
    for (const p of list) {
      const r = this.names.get(p.id);
      if (r) {
        r.name = p.name;
        r.cls = p.classId;
      } else this.names.set(p.id, { name: p.name, cls: p.classId });
      // the run lists every party member, even those who have not done anything yet
      this.statOf(this.run, p.id);
    }
  }

  /** Fills `scratch` with the segment's players sorted by the current mode, returns the total. */
  private fillSorted(seg: Segment | null, mode: Mode): number {
    const list = this.scratch;
    list.length = 0;
    let total = 0;
    if (seg) {
      for (const st of seg.stats.values()) {
        list.push(st);
        total += valueOf(st, mode);
      }
    }
    list.sort((a, b) => valueOf(b, mode) - valueOf(a, mode));
    return total;
  }

  // ---------------------------------------------------------------------------------------------
  // Render (4 Hz, only while open)
  // ---------------------------------------------------------------------------------------------

  private render(t: number): void {
    this.refreshRoster();
    const mode = this.mode;
    const seg = this.resolve();

    for (let i = 0; i < this.tabs.length; i++) setClass(this.tabs[i], 'on', MODES[i].id === mode);
    setText(this.segTxt, this.selLabel(seg));
    if (this.menuOpen && this.menuDirty) this.buildMenu();

    const total = this.fillSorted(seg, mode);
    const list = this.scratch;
    const dur = seg ? this.segDuration(seg, t) : 1;
    const top = list.length > 0 ? valueOf(list[0], mode) : 0;
    const me = G.world?.localPlayer?.id ?? -1;

    for (let i = 0; i < ROWS; i++) {
      const row = this.rows[i];
      const st = i < list.length ? list[i] : null;
      setClass(row.el, 'off', !st);
      row.stat = st;
      if (!st) continue;
      const v = valueOf(st, mode);
      const who = this.nameOf(st.id);
      row.name = who.name;
      setText(row.rk, String(i + 1));
      setText(row.nm, who.name);
      setStyle(row.bar, '--bc', who.cls ? CLASS_COLOR[who.cls] : OTHER_COLOR);
      setStyle(row.bar, 'width', top > 0 ? `${((v / top) * 100).toFixed(1)}%` : '0%');
      if (mode === 'deaths') {
        setText(row.vl, String(v));
        setText(row.ps, '');
      } else {
        setText(row.vl, formatNumber(v));
        setText(row.ps, `${formatNumber(v / dur)}/sn`);
      }
      setText(row.pc, total > 0 ? `${Math.round((v / total) * 100)}%` : '0%');
      setClass(row.el, 'me', st.id === me);
    }

    setClass(this.empty, 'off', list.length > 0);
    if (!seg) setText(this.meta, 'Dövüş yok');
    else {
      const lbl = seg.kind === 'run' ? 'Savaş' : 'Süre';
      if (mode === 'deaths') setText(this.meta, `${lbl} ${fmtClock(dur)} · Toplam ${total} ölüm`);
      else setText(this.meta, `${lbl} ${fmtClock(dur)} · Toplam ${formatNumber(total)} · ${formatNumber(total / dur)}/sn`);
    }
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
  }

  private menuItem(sel: Sel, label: string): void {
    const b = h('button', 'dm-mi', this.menu, label);
    b.type = 'button';
    setClass(b, 'on', sel === this.sel);
    b.addEventListener('click', () => this.choose(sel));
  }

  private choose(sel: Sel): void {
    this.sel = sel;
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

  private summary(seg: Segment, t: number): string {
    const mode = this.mode;
    const md = MODES.find((m) => m.id === mode) ?? MODES[0];
    const dur = this.segDuration(seg, t);
    this.fillSorted(seg, mode);
    const list = this.scratch;
    const head = `Dövüş Ölçer · ${md.label} · ${this.segTitle(seg)} · ${fmtClock(dur)}: `;
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
    const text = this.summary(seg, clock());
    try {
      if (G.net.isOnline) G.net.sendChat(text);
      else G.events.emit('net:chat', { from: 'Sistem', text, channel: 'system' });
    } catch (e) {
      console.warn('[dps] chat send failed', e);
    }
    uiSound('ui_click', 0.6);
  }

  // ---------------------------------------------------------------------------------------------
  // Open / collapse / hotkey / drag
  // ---------------------------------------------------------------------------------------------

  private setOpen(v: boolean): void {
    this.open = v;
    setClass(this.el, 'closed', !v);
    if (!v) {
      this.menuOpen = false;
      setClass(this.el, 'menu-open', false);
    }
    this.nextRender = 0;
    this.savePrefs();
  }

  private setCollapsed(v: boolean): void {
    this.collapsed = v;
    setClass(this.el, 'collapsed', v);
    this.collapseBtn.textContent = v ? '+' : '–';
    this.savePrefs();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code !== HOTKEY || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const mode = this.ui.mode;
    if (mode !== 'town' && mode !== 'dungeon') return;
    if (this.ui.hud?.chat.isFocused) return;
    this.setOpen(!this.open);
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const s = this.ui.scale || 1;
    const r = this.el.getBoundingClientRect();
    this.drag = { pid: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left / s, oy: r.top / s };
    try {
      this.head.setPointerCapture(e.pointerId);
    } catch { /* capture unsupported */ }
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    const s = this.ui.scale || 1;
    this.placeAt(d.ox + (e.clientX - d.sx) / s, d.oy + (e.clientY - d.sy) / s);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pid) return;
    this.drag = null;
    try {
      this.head.releasePointerCapture(e.pointerId);
    } catch { /* ignore */ }
    this.savePrefs();
  }

  /** Moves the window to (x, y) in HUD css px, keeping it inside the viewport. */
  private placeAt(x: number, y: number): void {
    const s = this.ui.scale || 1;
    const r = this.el.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth / s - r.width / s);
    const maxY = Math.max(0, window.innerHeight / s - r.height / s);
    const cx = clamp(x, 0, maxX);
    const cy = clamp(y, 0, maxY);
    this.pos = { x: cx, y: cy };
    this.el.style.left = `${cx}px`;
    this.el.style.top = `${cy}px`;
    this.el.style.right = 'auto';
    this.el.style.bottom = 'auto';
  }

  // ---------------------------------------------------------------------------------------------
  // Persistence (per viewer, best effort)
  // ---------------------------------------------------------------------------------------------

  private loadPrefs(): void {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as {
        open?: unknown; collapsed?: unknown; mode?: unknown; sel?: unknown;
        pos?: { x?: unknown; y?: unknown } | null;
      };
      if (typeof p.open === 'boolean') this.open = p.open;
      if (typeof p.collapsed === 'boolean') this.collapsed = p.collapsed;
      if (p.mode === 'dmg' || p.mode === 'heal' || p.mode === 'taken' || p.mode === 'deaths') this.mode = p.mode;
      if (p.sel === 'current' || p.sel === 'run') this.sel = p.sel;
      const x = p.pos?.x;
      const y = p.pos?.y;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) this.pos = { x, y };
    } catch {
      /* storage blocked or corrupt: keep the defaults */
    }
  }

  private savePrefs(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        open: this.open,
        collapsed: this.collapsed,
        mode: this.mode,
        sel: this.sel === 'run' ? 'run' : 'current',
        pos: this.pos,
      }));
    } catch {
      /* ignore */
    }
  }
}
