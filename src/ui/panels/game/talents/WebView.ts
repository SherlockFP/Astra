/**
 * GDD_TALENTS §5.3 tab 2 (the passive web). T10 moved the PoE canvas here; T12 adds the §5.3 extensions: the own-start
 * view and ±1500 bounds, mastery and socket visuals, the mastery picker, the socket hook (onSocketClick), the minimap,
 * sector labels, the Pişmanlık Küresi chip, the Plan menu (EFP1 export, import, apply), the refund menu, and the web
 * draft: staged points, the "pure additions auto-apply after 1.5 s" setting, and its own apply row.
 * `WebView` is a TalentTab: the shell builds it once, shows it with onShow / onHide, and forwards refresh() and focus().
 * Owner: panels-game.
 *
 * Draft contract: the web keeps its own draft. `hasDraft()` reports it to the shell, `commitDraft()` applies it and
 * `discardDraft()` drops it. The shell's "Değişiklikleri Uygula" commits only the WoW trees, so the tab shows its own
 * apply row.
 */
import { G } from '../../../../game/G';
import { CLASS_START_NODE, TALENT_NODES, type TalentNode } from '../../../../data/talents';
import { getItemBase } from '../../../../data/items';
import { RNG } from '../../../../core/utils';
import { RARITY_COLORS, type ClassId } from '../../../../types/common';
import type { ItemInstance } from '../../../../types/items';
import { decodeWeb, encodeWeb } from '../../../../systems/talentStrings';
import { CLASS_META, button, clampN, esc, fmtInt, h, itemIcon, openPanel, sfx, statLine, statName, tip, toast } from '../base';
import { glowSprite, iconFor, tintedIcon, type TalentTab, type TalentTabId } from './shared';

const BASE = 0.5;
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 3.4;
/** GDD_TALENTS §3.2 TALENT_BOUNDS: the view never pans past ±1500 world units. */
const WORLD = 1500;
/** Pure additions auto-apply this long after the last change (§5.3, setting `autoApplyPassives`). */
const AUTO_APPLY_MS = 1500;
/** Minimap edge in CSS pixels (§5.3: 180 × 180). */
const MINI = 180;
/** Pişmanlık Küresi (GDD_TALENTS §3.8). */
const ORB = 'orb_regret';
const RADII: Record<TalentNode['kind'], number> = { small: 14, notable: 21, keystone: 30, start: 34, mastery: 24, socket: 24 };
/** Kind badges of the tooltip (§5.3). */
const KIND_NAMES: Record<TalentNode['kind'], string> = { small: 'Küçük', notable: 'Önemli', keystone: 'Kilit Taşı', start: 'Başlangıç', mastery: 'Ustalık', socket: 'Yuva' };
const KIND_COLORS: Record<TalentNode['kind'], string> = { small: '#e9dcc0', notable: '#ffd36a', keystone: '#ff9d4a', start: '#cfe3ff', mastery: '#b78cff', socket: '#7fe0ff' };
/** Sector id prefix of each class (GDD_CLASSES_V2 §12.1): own sector is tinted on the minimap. */
const CLASS_PREFIX: Record<ClassId, string> = {
  knight: 'kn', barbarian: 'bb', mage: 'mg', rogue: 'rg', monk: 'mk', archer: 'ar', paladin: 'pl', necromancer: 'nc', warlock: 'wl',
  demonhunter: 'dh', evoker: 'ev', // CM1 placeholder sector prefixes (no nodes yet, see data/talents.ts CLASS_START_NODE)
  priest: 'pr', shaman: 'sh', druid: 'dr', // CLASS SCAFFOLD (sector prefixes, no nodes yet)
};
/** Cluster hubs get their own label (GDD_TALENTS §3.5). */
const CLUSTER_LABEL: Record<string, string> = { cl_kn_hub: 'Siper Kümesi', cl_bb_hub: 'Şişe ve Kan Kümesi', cl_rg_hub: 'Sömürü Kümesi' };
/** A keystone clause that costs the player something (the drawback part of §3.2 keystones). */
const DRAWBACK_RE = /DAHA AZ|−|-\d|azalt|kayb|ceza|dezavantaj/i;

type NodeState = 'allocated' | 'available' | 'locked' | 'staged' | 'removing';
type Currency = 'orb' | 'gold';
interface Fx {
  x: number;
  y: number;
  t0: number;
  life: number;
  kind: 'ring' | 'spark' | 'fail' | 'flash';
  color: string;
  size: number;
  sparks?: { a: number; v: number }[];
}
/** The staged web changes. Nothing here is saved until `commitDraft()`. */
interface WebDraft {
  /** Nodes taken in the draft, in staging order (each one attaches to the set before it). */
  add: string[];
  /** Committed nodes staged for refund, with the currency that pays for each. */
  remove: Map<string, Currency>;
  /** Mastery option changes (node id → option index). A missing entry means "unchanged". */
  picks: Record<string, number>;
}
/** A Plan (EFP1) read from a string: shown as a translucent overlay until staged with "Planı Uygula". */
interface WebPlan {
  ids: string[];
  picks: Record<string, number>;
}
interface MenuItem {
  label: string;
  sub?: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}

/** Hook of the jewel picker (T17): returns true when it handled a click on an allocated socket. */
let socketPicker: ((nodeId: string) => boolean) | null = null;
export function setSocketPicker(fn: ((nodeId: string) => boolean) | null): void {
  socketPicker = fn;
}

/** Runs a read that may fail while a service is missing (the tab never throws from its reads). */
function read<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function emptyDraft(): WebDraft {
  return { add: [], remove: new Map(), picks: {} };
}

/** True when every node of `set` reaches `start` through links that stay inside `set` (§2.3 connectivity). */
function connectedSet(set: ReadonlySet<string>, start: string): boolean {
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    for (const l of TALENT_NODES[queue[i]]?.links ?? []) {
      if (set.has(l) && !seen.has(l)) {
        seen.add(l);
        queue.push(l);
      }
    }
  }
  for (const id of set) if (TALENT_NODES[id] && !seen.has(id)) return false;
  return true;
}

/** Keystone text with its drawback clauses in red (GDD_TALENTS §5.3). */
function effectHtml(text: string): string {
  return text
    .split(';')
    .map((c) => (DRAWBACK_RE.test(c) ? `<span class="pt-web-neg">${esc(c.trim())}</span>` : esc(c.trim())))
    .join('; ');
}

/** Outline of a regular hexagon (pointy top) for mastery nodes. */
function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Outline of a star with `points` tips. */
function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class WebView implements TalentTab {
  readonly id: TalentTabId = 'web';
  readonly label = 'Pasif Ağaç';
  /** Root of the tab: the shell shows and hides it. */
  readonly el: HTMLElement;
  /** True between onShow and onHide: the frame loop runs only then. */
  private active = false;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private mini!: HTMLCanvasElement;
  private miniCtx!: CanvasRenderingContext2D;
  private miniDrag = false;
  private wrap!: HTMLElement;
  private pointsEl!: HTMLElement;
  private pointsNum!: HTMLElement;
  private pointsTotalEl!: HTMLElement;
  private spentEl!: HTMLElement;
  private classEl!: HTMLElement;
  private orbEl!: HTMLElement;
  private planDrop!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchCount!: HTMLElement;
  private sideList!: HTMLElement;
  private side!: HTMLElement;
  private stageEl!: HTMLElement;
  private stageTxt!: HTMLElement;
  private stageHint!: HTMLElement;
  private stageApply!: HTMLButtonElement;

  private nodes: TalentNode[] = [];
  private byId = new Map<string, TalentNode>();
  private adj = new Map<string, string[]>();
  private links: [TalentNode, TalentNode][] = [];
  private stars: { x: number; y: number; s: number; p: number }[] = [];
  private labels: { x: number; y: number; text: string }[] = [];

  /** Committed web nodes: `save.talents` plus the own start. */
  private committed = new Set<string>();
  private draft: WebDraft = emptyDraft();
  private draftChar = '';
  /** Nodes allocated in the view: committed minus staged removals plus staged additions. */
  private allocated = new Set<string>();
  private avail = new Set<string>();
  private dist = new Map<string, number>();
  private prev = new Map<string, string | null>();
  private plan: WebPlan | null = null;
  /** Mastery node whose picker is open right after it was taken: pure-addition auto-apply waits for the choice. */
  private choosing: string | null = null;
  private committing = false;
  private autoTimer = 0;
  private popEl: HTMLElement | null = null;
  private menuEl: HTMLElement | null = null;
  private dlgEl: HTMLElement | null = null;

  private W = 800;
  private H = 600;
  private dpr = 1;
  private cam = { x: 0, y: 0, zoom: 0.7 };
  private tgt = { x: 0, y: 0, zoom: 0.7 };
  private hover: TalentNode | null = null;
  private hoverPath: string[] = [];
  private fx: Fx[] = [];
  private raf = 0;
  private lastT = 0;
  private mouse = { x: 0, y: 0, inside: false };
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null = null;
  private query = '';
  private matches = new Set<string>();
  private matchList: string[] = [];
  private matchIdx = -1;
  private ro: ResizeObserver | null = null;
  private flash = 0;
  private builtOnce = false;

  /** `modalHost` is the window root: confirm layers attach there, and a closed window is how onHide tells a close from a tab switch. */
  constructor(private readonly modalHost: () => HTMLElement) {
    this.el = h('div.pt-tab-web');
    this.build();
  }

  private get myClass(): ClassId | null {
    return G.character?.classId ?? null;
  }

  private ownStart(): string | undefined {
    const c = this.myClass;
    return c ? CLASS_START_NODE[c] : undefined;
  }

  private isOwnStart(n: TalentNode): boolean {
    return n.kind === 'start' && !!n.classStart && n.classStart === this.myClass;
  }

  private build(): void {
    // toolbar
    this.pointsNum = h('b.pg-tp-num', null, '0');
    this.pointsTotalEl = h('small.pt-web-of', null, '');
    this.pointsEl = h('div.pg-tp-badge', null, h('span.pg-tp-lbl', null, 'KALAN PUAN'), h('span', null, this.pointsNum, this.pointsTotalEl));
    this.spentEl = h('div.pg-tp-spent', null, '');
    this.classEl = h('div.pg-tp-class', null, '');
    this.orbEl = h('span.pt-web-orb', { title: 'Pişmanlık Küresi: bir düğümü ücretsiz (altınsız) iade eder' }, '');
    this.searchInput = h('input.pg-search', { type: 'text', placeholder: 'Düğüm ara... (ateş, kritik, can)', maxLength: 32, spellcheck: false }) as HTMLInputElement;
    this.searchCount = h('span.pg-search-count', null, '');
    this.searchInput.addEventListener('input', () => this.setQuery(this.searchInput.value));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.cycleMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        if (this.query) {
          e.stopPropagation();
          this.searchInput.value = '';
          this.setQuery('');
        }
        this.searchInput.blur();
      }
    });
    const searchBox = h('div.pg-search-box', null, h('span.pg-search-ico', null, '⌕'), this.searchInput, this.searchCount);
    this.planDrop = h('div.pt-web-drop', null, button('Plan ▾', (e) => this.togglePlanMenu(e), { variant: 'ghost', title: 'Pasif planı dışa aktar, içe aktar veya uygula' }));
    const tools = h(
      'div.pg-tp-tools',
      null,
      this.planDrop,
      button('Başlangıca git', () => this.centerHome(), { variant: 'ghost', title: 'Kendi başlangıç düğümüne dön' }),
      button('Tümünü Göster', () => this.fitAll(), { variant: 'ghost', title: 'Tüm ağacı göster (±1500)' }),
      button('Sıfırla', () => openPanel('trainer'), { variant: 'danger', title: 'Yetenek Eğitmeni: puanları sıfırla' }),
    );
    const info = h('div.pg-tp-info', null, this.classEl, this.spentEl);
    const toolbar = h('div.pg-tp-bar', null, this.pointsEl, info, this.orbEl, searchBox, tools);

    // canvas, side summary, minimap, legend, help, zoom
    this.canvas = h('canvas.pg-tp-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.mini = h('canvas.pt-web-mini', { title: 'Haritada tıkla: o bölgeye git' }) as HTMLCanvasElement;
    this.miniCtx = this.mini.getContext('2d')!;
    this.sideList = h('div.pg-tp-sidelist.pg-scroll');
    const sideToggle = h('button.pg-tp-sidetoggle', { type: 'button', title: 'Toplam etkileri göster/gizle' }, '▸') as HTMLButtonElement;
    this.side = h('div.pg-tp-side', null, h('div.pg-tp-sidehead', null, h('span', null, 'Toplam Etkiler'), sideToggle), this.sideList);
    sideToggle.addEventListener('click', () => {
      sfx('ui_tab', 0.7);
      const collapsed = this.side.classList.toggle('is-collapsed');
      sideToggle.textContent = collapsed ? '◂' : '▸';
    });
    const legend = h(
      'div.pg-tp-legend',
      null,
      h('span', null, h('i.lg.k-small'), 'Küçük'),
      h('span', null, h('i.lg.k-notable'), 'Önemli'),
      h('span', null, h('i.lg.k-keystone'), 'Kilit Taşı'),
      h('span', null, h('i.lg.k-start'), 'Başlangıç'),
      h('span.sep'),
      h('span', null, h('i.lg.s-alloc'), 'Alındı'),
      h('span', null, h('i.lg.s-avail'), 'Alınabilir'),
      h('span', null, h('i.lg.s-lock'), 'Kilitli'),
    );
    const help = h('div.pg-tp-help', null, 'Sürükle: kaydır · Tekerlek: yakınlaştır · Tıkla: puan harca · Sağ tık: geri al');
    const zoomBox = h(
      'div.pg-tp-zoom',
      null,
      button('+', () => this.zoomBy(1.3), { variant: 'ghost', cls: 'pg-sq' }),
      button('−', () => this.zoomBy(1 / 1.3), { variant: 'ghost', cls: 'pg-sq' }),
    );
    this.wrap = h('div.pg-tp-view', null, this.canvas, this.side, legend, help, zoomBox, this.mini);
    this.mini.addEventListener('pointerdown', (e) => {
      this.miniDrag = true;
      this.mini.setPointerCapture?.(e.pointerId);
      this.miniJump(e);
    });
    this.mini.addEventListener('pointermove', (e) => {
      if (this.miniDrag) this.miniJump(e);
    });
    const endMini = () => {
      this.miniDrag = false;
    };
    this.mini.addEventListener('pointerup', endMini);
    this.mini.addEventListener('pointercancel', endMini);

    // staging row: the web draft's own apply (below the canvas)
    this.stageTxt = h('span.pt-web-stage-txt', null, '');
    this.stageHint = h('span.pt-web-stage-hint', null, '');
    this.stageApply = button('Pasifleri Uygula', () => this.applyNow(), { variant: 'primary', cls: 'pt-apply', title: 'Pasif taslağını kalıcı olarak uygula' });
    this.stageEl = h(
      'div.pt-web-stage.is-off',
      null,
      this.stageTxt,
      this.stageHint,
      h('span.pt-web-stage-sp'),
      button('Geri Al', () => this.discardDraft(), { variant: 'normal', title: 'Pasif taslağındaki değişiklikleri at' }),
      this.stageApply,
    );

    this.el.append(toolbar, this.wrap, this.stageEl);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
  }

  /* ---------------------------------------------------------------- lifecycle (TalentTab) */

  /** Shown: the shell has already made `el` visible. The view starts on the own start, like the old window's open. */
  onShow(): void {
    this.active = true;
    this.rebuildGraph();
    this.refreshState();
    this.resize();
    this.centerHome(true);
    if (!this.raf) {
      this.lastT = performance.now() / 1000;
      this.raf = requestAnimationFrame(this.frame);
    }
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('mousedown', this.onDocDown, true);
    this.scheduleAuto();
  }

  /**
   * Hidden: stop the frame loop, drop the drag, the tooltip and the popovers. A closed window drops the staged web draft
   * (it was never applied); a tab switch keeps it.
   */
  onHide(): void {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.drag = null;
    this.miniDrag = false;
    window.clearTimeout(this.autoTimer);
    this.autoTimer = 0;
    this.closePicker();
    this.closeMenu();
    this.closeDialog();
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('mousedown', this.onDocDown, true);
    tip.hide();
    if (this.modalHost().style.display === 'none') this.discardDraft();
  }

  /** Re-read the allocation from the character (called by the shell on talent events while visible). */
  refresh(): void {
    if (this.active && !this.committing) this.refreshState();
  }

  /** The web draft holds staged points, refunds or mastery picks that are not applied yet. */
  hasDraft(): boolean {
    return !this.draftEmpty();
  }

  /** Staged web points for the shell's staging bar: nodes taken and nodes refunded in the draft. */
  stagedCounts(): { add: number; remove: number } {
    this.syncDraft();
    return { add: this.draft.add.length, remove: this.draft.remove.size };
  }

  /** openPanel('talents', { focus }): centre the view on a node of the web. */
  focus(id: string): void {
    const n = this.byId.get(id);
    if (!n) return;
    this.tgt.x = n.x;
    this.tgt.y = n.y;
    this.tgt.zoom = clampN(this.zoomFor(500), MIN_ZOOM, MAX_ZOOM);
  }

  /** Applies the web draft (points, refunds, mastery picks). `ok: false` keeps the draft and says why. */
  commitDraft(): { ok: boolean; error?: string } {
    const ch = G.character;
    if (!ch) return { ok: false, error: 'Karakter seçilmedi.' };
    if (this.committing) return { ok: false, error: 'Taslak zaten uygulanıyor.' };
    this.readCommitted();
    this.syncDraft();
    if (this.draftEmpty()) return { ok: true };
    const start = this.ownStart();
    const P = G.progression;
    const fail = (error: string) => ({ ok: false, error });

    const adds = this.draft.add.slice();
    const removes = [...this.draft.remove.entries()];
    const picks = Object.entries(this.draft.picks);
    const edit = read(() => G.talents?.canEditHere() ?? null, null);
    if (!edit || !start) return fail('Uzmanlık sistemi hazır değil.');
    if (adds.length && !edit.add) return fail(edit.reason ?? 'Şu an puan eklenemez.');
    if ((removes.length || picks.length) && ch.webEditReason()) return fail(ch.webEditReason() ?? 'Şu an değiştirilemez.');
    const orbs = removes.filter(([, c]) => c === 'orb').length;
    const golds = removes.length - orbs;
    if (golds > 0 && !edit.remove) return fail(edit.reason ?? 'Altınla geri almak için şehir veya köyde ol.');
    if (orbs > ch.material(ORB)) return fail('Pişmanlık Küresi yok.');
    const cost = golds * P.refundCost();
    if (cost > ch.save.gold) return fail('Yetersiz altın.');
    const jewels = removes.filter(([id]) => !!ch.save.passiveExtra?.jewels?.[id]).length;
    if (jewels > 0 && ch.save.bag.filter((x) => !x).length < jewels) return fail('Çantan dolu!');

    // Simulate on a copy: removals leaf-first (deepest first), then the additions in attach order.
    const depth = new Map<string, number>([[start, 0]]);
    for (let i = 0, queue = [start]; i < queue.length; i++) {
      for (const l of TALENT_NODES[queue[i]]?.links ?? []) {
        if (this.committed.has(l) && !depth.has(l)) {
          depth.set(l, (depth.get(queue[i]) ?? 0) + 1);
          queue.push(l);
        }
      }
    }
    const sim = new Set(this.committed);
    const order = removes.map(([id]) => id).sort((a, b) => (depth.get(b) ?? 0) - (depth.get(a) ?? 0));
    for (const id of order) {
      sim.delete(id);
      if (!connectedSet(sim, start)) return fail('Bu iade ağacın bağlantısını koparır.');
    }
    let left = adds.slice();
    let moved = true;
    while (left.length && moved) {
      moved = false;
      left = left.filter((a) => {
        if (TALENT_NODES[a]?.links.some((l) => sim.has(l))) {
          sim.add(a);
          moved = true;
          return false;
        }
        return true;
      });
    }
    if (left.length) return fail('Bağlı olmayan seçimler var.');
    const spentAfter = read(() => P.talentPointsSpent(), 0) - removes.length + adds.length;
    if (spentAfter > read(() => P.talentPointsTotal(), 0)) return fail('Yeterli puan yok.');

    // Apply: refunds first (they free points), then the additions, then the mastery picks.
    this.committing = true;
    let error: string | null = null;
    try {
      for (const [id, cur] of removes) {
        const ok = cur === 'orb' ? P.refundNodeOrb(id) : P.refundNode(id);
        if (!ok) {
          error = 'Pasif iade yapılamadı.';
          break;
        }
      }
      let todo = adds.slice();
      while (!error && todo.length) {
        const next = todo.find((a) => (TALENT_NODES[a]?.links ?? []).some((l) => ch.save.talents.includes(l)));
        if (!next) {
          error = 'Bağlı olmayan seçimler var.';
          break;
        }
        if (!P.allocate(next)) error = 'Pasif puan harcanamadı.';
        todo = todo.filter((x) => x !== next);
      }
      if (!error) for (const [id, idx] of picks) if (ch.save.talents.includes(id)) ch.pickMastery(id, idx);
    } finally {
      this.committing = false;
    }
    // A failure in the middle leaves the applied part in place: the draft is dropped so the view re-reads the save.
    this.draft = emptyDraft();
    this.choosing = null;
    window.clearTimeout(this.autoTimer);
    this.autoTimer = 0;
    if (error) {
      this.refreshState();
      return fail(error);
    }
    G.events.emit('talents:committed', { kind: 'web' });
    this.refreshState();
    return { ok: true };
  }

  /** Drops the web draft (the window was closed, or "Geri Al"). */
  discardDraft(): void {
    this.draft = emptyDraft();
    this.choosing = null;
    window.clearTimeout(this.autoTimer);
    this.autoTimer = 0;
    this.closePicker();
    this.refreshState();
  }

  /** Socket click (§5.3): the jewel picker of T17 when registered; otherwise a plain notice. */
  onSocketClick(nodeId: string): void {
    const n = TALENT_NODES[nodeId];
    if (!n || n.kind !== 'socket') return;
    if (socketPicker?.(nodeId)) return;
    if (!this.committed.has(nodeId)) {
      toast('Mücevher yuvasını önce almalısın.', 'info');
      return;
    }
    toast('Mücevher seçimi yakında bu yuvada açılacak.', 'info');
  }

  /* ---------------------------------------------------------------- data */

  private rebuildGraph(): void {
    this.nodes = Object.values(TALENT_NODES);
    this.byId.clear();
    this.adj.clear();
    this.links = [];
    for (const n of this.nodes) {
      this.byId.set(n.id, n);
      this.adj.set(n.id, []);
    }
    const seen = new Set<string>();
    for (const n of this.nodes) {
      for (const l of n.links ?? []) {
        const o = this.byId.get(l);
        if (!o) continue;
        const key = n.id < l ? n.id + '|' + l : l + '|' + n.id;
        if (seen.has(key)) continue;
        seen.add(key);
        this.links.push([n, o]);
        this.adj.get(n.id)!.push(l);
        this.adj.get(l)!.push(n.id);
      }
    }
    // decorative stars (deterministic)
    const rng = new RNG(1337);
    this.stars = [];
    for (let i = 0; i < 320; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * WORLD;
      this.stars.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: rng.range(1, 2.4), p: rng.range(0, 6.28) });
    }
    // sector and cluster labels (drawn at zoom < 0.5)
    this.labels = [];
    for (const [cls, startId] of Object.entries(CLASS_START_NODE)) {
      const n = this.byId.get(startId);
      const name = CLASS_META[cls as ClassId]?.name;
      if (n && name) this.labels.push({ x: n.x * 1.25, y: n.y * 1.25, text: `${name} Bölgesi` });
    }
    for (const [hub, text] of Object.entries(CLUSTER_LABEL)) {
      const n = this.byId.get(hub);
      if (n) this.labels.push({ x: n.x, y: n.y, text });
    }
  }

  /** Reads the committed web from the character (save.talents plus the own start). */
  private readCommitted(): void {
    this.committed = new Set(G.character?.save.talents ?? []);
    const start = this.ownStart();
    if (start) this.committed.add(start);
  }

  /** Drops draft entries that no longer make sense (committed by someone else, another character, a removed mastery). */
  private syncDraft(): void {
    const id = G.character?.save.id ?? '';
    if (id !== this.draftChar) {
      this.draft = emptyDraft();
      this.draftChar = id;
      this.plan = null;
      this.choosing = null;
    }
    this.draft.add = this.draft.add.filter((n, i, all) => !!TALENT_NODES[n] && !this.committed.has(n) && all.indexOf(n) === i);
    for (const n of [...this.draft.remove.keys()]) {
      const node = TALENT_NODES[n];
      if (!node || !this.committed.has(n) || this.isOwnStart(node)) this.draft.remove.delete(n);
    }
    for (const n of Object.keys(this.draft.picks)) {
      const node = TALENT_NODES[n];
      const staged = this.draft.add.includes(n);
      const have = this.committed.has(n) && !this.draft.remove.has(n);
      if (!node || node.kind !== 'mastery' || this.draft.remove.has(n) || (!staged && !have)) {
        delete this.draft.picks[n];
      } else if (have && !staged && this.draft.picks[n] === this.committedPick(n)) {
        delete this.draft.picks[n];
      }
    }
  }

  private draftEmpty(): boolean {
    return !this.draft.add.length && !this.draft.remove.size && !Object.keys(this.draft.picks).length;
  }

  /** Nodes allocated in the draft (committed minus removals plus additions). */
  private draftSet(): Set<string> {
    const set = new Set<string>();
    for (const n of this.committed) if (!this.draft.remove.has(n)) set.add(n);
    for (const n of this.draft.add) set.add(n);
    const start = this.ownStart();
    if (start) set.add(start);
    return set;
  }

  /** Free points of the draft: the passive pool minus the committed spend and the staged change. */
  private freeDraft(): number {
    const total = read(() => G.progression.talentPointsTotal(), 0);
    const spent = read(() => G.progression.talentPointsSpent(), 0);
    return Math.max(0, total - (spent + this.draft.add.length - this.draft.remove.size));
  }

  private committedPick(id: string): number {
    return read(() => G.character?.save.passiveExtra?.picks[id] ?? 0, 0);
  }

  private pickOf(id: string): number {
    return this.draft.picks[id] ?? this.committedPick(id);
  }

  private jewelAt(id: string): ItemInstance | null {
    return read(() => G.character?.save.passiveExtra?.jewels?.[id] ?? null, null);
  }

  /** Recomputes the view from the committed save and the draft. Never changes the draft except to drop stale entries. */
  private refreshState(): void {
    this.readCommitted();
    this.syncDraft();
    const set = this.draftSet();
    this.allocated = set;
    const free = this.freeDraft();
    this.avail.clear();
    if (free > 0) {
      for (const n of this.nodes) {
        if (set.has(n.id)) continue;
        if ((n.links ?? []).some((l) => set.has(l))) this.avail.add(n.id);
      }
    }
    // BFS from the draft set: dist = points needed to reach a node, prev = path parent
    this.dist.clear();
    this.prev.clear();
    const queue: string[] = [];
    for (const id of set) {
      if (!this.byId.has(id)) continue;
      this.dist.set(id, 0);
      this.prev.set(id, null);
      queue.push(id);
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      const d = this.dist.get(id)!;
      for (const o of this.adj.get(id) ?? []) {
        // a node staged for refund cannot be a stepping stone of a new path
        if (this.dist.has(o) || this.draft.remove.has(o)) continue;
        this.dist.set(o, d + 1);
        this.prev.set(o, id);
        queue.push(o);
      }
    }
    const total = read(() => G.progression.talentPointsTotal(), 0);
    this.pointsNum.textContent = String(free);
    this.pointsTotalEl.textContent = ` / ${total}`;
    this.pointsEl.classList.toggle('has-points', free > 0);
    const spentNodes = [...set].filter((id) => {
      const n = this.byId.get(id);
      return n && !this.isOwnStart(n);
    }).length;
    this.spentEl.textContent = `Harcanan: ${spentNodes}`;
    const cm = this.myClass ? CLASS_META[this.myClass] : null;
    this.classEl.textContent = cm ? `${cm.name} · Seviye ${G.character?.level ?? 1}` : 'Karakter seçilmedi';
    this.classEl.style.color = cm?.color ?? '';
    const orbs = read(() => G.character?.material(ORB) ?? 0, 0);
    this.orbEl.textContent = `Pişmanlık Küresi ×${orbs}`;
    this.orbEl.classList.toggle('is-empty', orbs <= 0);
    this.buildSide();
    if (this.hover) this.hoverPath = this.pathTo(this.hover.id);
    this.updateSearch();
    this.refreshStage();
  }

  private stateOf(n: TalentNode): NodeState {
    if (this.draft.remove.has(n.id) && this.committed.has(n.id)) return 'removing';
    if (this.draft.add.includes(n.id)) return 'staged';
    if (this.allocated.has(n.id)) return 'allocated';
    if (this.avail.has(n.id)) return 'available';
    return 'locked';
  }

  private pathTo(id: string): string[] {
    if (this.allocated.has(id)) return [];
    const path: string[] = [];
    let cur: string | null | undefined = id;
    let guard = 0;
    while (cur && !this.allocated.has(cur) && guard++ < 400) {
      path.push(cur);
      cur = this.prev.get(cur);
    }
    if (cur == null && !this.allocated.size) return [];
    return path.reverse();
  }

  private buildSide(): void {
    const sum: Record<string, number> = {};
    const specials: { name: string; text: string }[] = [];
    for (const id of this.allocated) {
      const n = this.byId.get(id);
      if (!n) continue;
      for (const [k, v] of Object.entries(n.stats ?? {})) sum[k] = (sum[k] ?? 0) + (v as number);
      const sp = n.special?.desc;
      if (sp) specials.push({ name: n.name, text: sp });
    }
    this.sideList.innerHTML = '';
    const keys = Object.keys(sum).sort((a, b) => statName(a).localeCompare(statName(b), 'tr'));
    if (!keys.length && !specials.length) {
      this.sideList.append(h('div.pg-empty', null, 'Henüz bir etki yok.'));
      return;
    }
    for (const k of keys) this.sideList.append(h('div.pg-tp-line', null, statLine(k, sum[k])));
    if (specials.length) {
      this.sideList.append(h('div.pg-tp-sp-h', null, 'Özel Etkiler'));
      for (const s of specials) this.sideList.append(h('div.pg-tp-sp', null, h('b', null, s.name), h('span', null, s.text)));
    }
  }

  /* ---------------------------------------------------------------- search */

  private setQuery(q: string): void {
    this.query = q.trim().toLocaleLowerCase('tr');
    this.matchIdx = -1;
    this.updateSearch();
  }

  private updateSearch(): void {
    this.matches.clear();
    this.matchList = [];
    if (this.query.length >= 2) {
      for (const n of this.nodes) {
        const hay = [n.name, n.desc ?? '', n.special?.desc ?? '', ...(n.choices ?? []).map((c) => c.name + ' ' + c.desc), ...Object.keys(n.stats ?? {}).map(statName)]
          .join(' ')
          .toLocaleLowerCase('tr');
        if (hay.includes(this.query)) {
          this.matches.add(n.id);
          this.matchList.push(n.id);
        }
      }
      this.searchCount.textContent = this.matchList.length ? `${this.matchList.length} sonuç` : 'Sonuç yok';
      this.searchCount.classList.toggle('none', !this.matchList.length);
    } else {
      this.searchCount.textContent = '';
    }
  }

  private cycleMatch(dir: number): void {
    if (!this.matchList.length) return;
    this.matchIdx = (this.matchIdx + dir + this.matchList.length) % this.matchList.length;
    const n = this.byId.get(this.matchList[this.matchIdx]);
    if (n) {
      this.tgt.x = n.x;
      this.tgt.y = n.y;
      this.tgt.zoom = Math.max(this.tgt.zoom, 1.1);
      sfx('ui_tab', 0.6);
    }
  }

  /* ---------------------------------------------------------------- camera */

  /** Zoom at which a circle of radius `r` (world units) fills the view's shorter half-side. */
  private zoomFor(r: number): number {
    return clampN((Math.min(this.W, this.H) / 2 - 14) / (r * BASE), MIN_ZOOM, MAX_ZOOM);
  }

  private homeNode(): TalentNode | null {
    const id = this.ownStart();
    return id ? this.byId.get(id) ?? null : null;
  }

  /** Centres on the own start at a zoom that fits ±1000 (§5.3); without a start, centres on the core. */
  private centerHome(snap = false): void {
    const hn = this.homeNode();
    if (hn) {
      this.tgt.x = hn.x;
      this.tgt.y = hn.y;
      this.tgt.zoom = this.zoomFor(1000);
    } else {
      this.tgt.x = 0;
      this.tgt.y = 0;
      this.tgt.zoom = this.zoomFor(WORLD);
    }
    if (snap) Object.assign(this.cam, this.tgt);
  }

  /** "Tümünü Göster": the whole web, ±1500. */
  private fitAll(): void {
    this.tgt.x = 0;
    this.tgt.y = 0;
    this.tgt.zoom = this.zoomFor(WORLD);
    sfx('ui_tab', 0.6);
  }

  private zoomBy(f: number): void {
    this.zoomAt(this.W / 2, this.H / 2, f);
  }

  private zoomAt(sx: number, sy: number, f: number): void {
    const s0 = this.tgt.zoom * BASE;
    const wx = (sx - this.W / 2) / s0 + this.tgt.x;
    const wy = (sy - this.H / 2) / s0 + this.tgt.y;
    this.tgt.zoom = clampN(this.tgt.zoom * f, MIN_ZOOM, MAX_ZOOM);
    const s1 = this.tgt.zoom * BASE;
    this.tgt.x = wx - (sx - this.W / 2) / s1;
    this.tgt.y = wy - (sy - this.H / 2) / s1;
    this.clampTarget();
  }

  private clampTarget(): void {
    const d = Math.hypot(this.tgt.x, this.tgt.y);
    if (d > WORLD) {
      this.tgt.x *= WORLD / d;
      this.tgt.y *= WORLD / d;
    }
  }

  private resize(): void {
    if (!this.wrap) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const oldMin = Math.min(this.W, this.H);
    this.W = this.wrap.clientWidth || 800;
    this.H = this.wrap.clientHeight || 600;
    // keep the framing when the window is resized
    if (this.builtOnce && oldMin > 50) {
      const k = Math.min(this.W, this.H) / oldMin;
      this.cam.zoom = clampN(this.cam.zoom * k, MIN_ZOOM, MAX_ZOOM);
      this.tgt.zoom = clampN(this.tgt.zoom * k, MIN_ZOOM, MAX_ZOOM);
    }
    this.builtOnce = true;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.mini.width = Math.round(MINI * this.dpr);
    this.mini.height = Math.round(MINI * this.dpr);
  }

  private toScreen(wx: number, wy: number): [number, number] {
    const s = this.cam.zoom * BASE;
    return [(wx - this.cam.x) * s + this.W / 2, (wy - this.cam.y) * s + this.H / 2];
  }

  /* ---------------------------------------------------------------- minimap */

  /** Minimap click or drag: the view moves to that world point. */
  private miniJump(e: PointerEvent): void {
    const r = this.mini.getBoundingClientRect();
    if (!r.width) return;
    const lx = clampN(((e.clientX - r.left) / r.width) * MINI, 0, MINI);
    const ly = clampN(((e.clientY - r.top) / r.height) * MINI, 0, MINI);
    this.tgt.x = (lx / MINI) * WORLD * 2 - WORLD;
    this.tgt.y = (ly / MINI) * WORLD * 2 - WORLD;
    this.clampTarget();
    sfx('ui_tab', 0.3);
  }

  private drawMini(): void {
    const c = this.miniCtx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#0a0705';
    c.fillRect(0, 0, MINI, MINI);
    const k = MINI / (WORLD * 2);
    const mx = (x: number) => (x + WORLD) * k;
    const own = this.myClass ? CLASS_PREFIX[this.myClass] : '';
    const ownColor = this.myClass ? CLASS_META[this.myClass]?.color ?? '#9a8a6a' : '#9a8a6a';
    for (const n of this.nodes) {
      const st = this.stateOf(n);
      if (st === 'allocated') {
        c.fillStyle = '#e8c25a';
        c.fillRect(mx(n.x) - 1.2, mx(n.y) - 1.2, 2.4, 2.4);
      } else if (st === 'staged') {
        c.fillStyle = '#9fe6ff';
        c.fillRect(mx(n.x) - 1.2, mx(n.y) - 1.2, 2.4, 2.4);
      } else if (st === 'removing') {
        c.fillStyle = '#b5482f';
        c.fillRect(mx(n.x) - 1.2, mx(n.y) - 1.2, 2.4, 2.4);
      } else {
        c.fillStyle = own && n.id.startsWith(own + '_') ? ownColor : '#5b4d3a';
        c.globalAlpha = own && n.id.startsWith(own + '_') ? 0.85 : 0.7;
        c.fillRect(mx(n.x) - 0.7, mx(n.y) - 0.7, 1.4, 1.4);
        c.globalAlpha = 1;
      }
    }
    // viewport rectangle
    const sc = this.cam.zoom * BASE;
    const hw = this.W / 2 / sc;
    const hh = this.H / 2 / sc;
    c.strokeStyle = '#ffe9aa';
    c.lineWidth = 1;
    c.strokeRect(mx(this.cam.x - hw), mx(this.cam.y - hh), 2 * hw * k, 2 * hh * k);
    c.strokeStyle = '#c9a24a';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, MINI - 1, MINI - 1);
  }

  /* ---------------------------------------------------------------- pointer */

  private localPos(e: PointerEvent | WheelEvent | MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const sx = this.canvas.offsetWidth ? r.width / this.canvas.offsetWidth : 1;
    return { x: (e.clientX - r.left) / sx, y: (e.clientY - r.top) / sx };
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      const p = this.localPos(e);
      this.drag = { x: p.x, y: p.y, cx: this.tgt.x, cy: this.tgt.y, moved: false, id: e.pointerId };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.localPos(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = true;
      if (this.drag && this.drag.id === e.pointerId) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > 5) {
          this.drag.moved = true;
          c.style.cursor = 'grabbing';
        }
        if (this.drag.moved) {
          const s = this.tgt.zoom * BASE;
          this.tgt.x = this.drag.cx - dx / s;
          this.tgt.y = this.drag.cy - dy / s;
          this.clampTarget();
          this.cam.x = this.tgt.x;
          this.cam.y = this.tgt.y;
          this.setHover(null, e);
          return;
        }
      }
      this.setHover(this.pick(p.x, p.y), e);
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      c.style.cursor = '';
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d && !d.moved) {
        const p = this.localPos(e);
        const n = this.pick(p.x, p.y);
        if (n) this.click(n);
      }
    });
    c.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
      if (!this.drag) this.setHover(null);
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = this.localPos(e);
      const n = this.pick(p.x, p.y);
      if (n) this.rightClick(n, e);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.localPos(e);
        this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0014));
      },
      { passive: false },
    );
  }

  /** Outside clicks close the mastery picker and the menus; clicks on the Plan button are left to its toggle. */
  private onDocDown = (e: MouseEvent): void => {
    const t = e.target as Node | null;
    if (!t) return;
    if (this.menuEl && !this.menuEl.contains(t) && !this.planDrop.contains(t)) this.closeMenu();
    if (this.popEl && !this.popEl.contains(t)) this.closePicker();
  };

  /** Keyboard (§5.8): arrows pan, + / − zoom, C centres on the start. Escape closes the popovers. */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.active) return;
    if (e.key === 'Escape') {
      if (this.dlgEl) {
        this.closeDialog();
        return;
      }
      if (this.popEl || this.menuEl) {
        this.closePicker();
        this.closeMenu();
      }
      return;
    }
    if (this.dlgEl) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const s = this.tgt.zoom * BASE;
    switch (e.key) {
      case 'ArrowLeft':
        this.tgt.x -= 120 / s;
        break;
      case 'ArrowRight':
        this.tgt.x += 120 / s;
        break;
      case 'ArrowUp':
        this.tgt.y -= 120 / s;
        break;
      case 'ArrowDown':
        this.tgt.y += 120 / s;
        break;
      case '+':
      case '=':
        this.zoomBy(1.2);
        break;
      case '-':
      case '_':
        this.zoomBy(1 / 1.2);
        break;
      case 'c':
      case 'C':
        this.centerHome();
        break;
      default:
        return;
    }
    e.preventDefault();
    this.clampTarget();
  };

  private pick(px: number, py: number): TalentNode | null {
    let best: TalentNode | null = null;
    let bestScore = Infinity;
    const z = this.cam.zoom;
    for (const n of this.nodes) {
      const [sx, sy] = this.toScreen(n.x, n.y);
      const r = RADII[n.kind] * z + 4;
      const d = Math.hypot(sx - px, sy - py);
      if (d <= r && d / r < bestScore) {
        best = n;
        bestScore = d / r;
      }
    }
    return best;
  }

  private setHover(n: TalentNode | null, e?: PointerEvent): void {
    if (n !== this.hover) {
      this.hover = n;
      this.hoverPath = n ? this.pathTo(n.id) : [];
      if (n) sfx('ui_hover', 0.35);
      if (n && e) tip.show(this.tooltipFor(n), e.clientX, e.clientY, 'pg-tip-talent');
      else tip.hide();
      this.canvas.style.cursor = n ? 'pointer' : '';
    } else if (n && e) {
      tip.move(e.clientX, e.clientY);
    }
  }

  /* ---------------------------------------------------------------- tooltip */

  private tooltipFor(n: TalentNode): string {
    const lines: string[] = [];
    const st = this.stateOf(n);
    const kc = n.kind === 'start' && n.classStart ? CLASS_META[n.classStart]?.color ?? KIND_COLORS.start : KIND_COLORS[n.kind];
    lines.push(`<div class="pg-ttip-name" style="color:${kc}">${esc(n.name)}</div>`);
    let kind = KIND_NAMES[n.kind];
    if (n.kind === 'start') kind = this.isOwnStart(n) ? 'Başlangıç' : `${CLASS_META[n.classStart as ClassId]?.name ?? 'Başka Sınıf'} Başlangıcı`;
    lines.push(`<div class="pg-ttip-kind"><span class="pt-web-kindbadge" style="color:${kc}">${esc(kind)}</span></div>`);
    if (n.desc) lines.push(`<div class="pg-ttip-stats">${n.kind === 'keystone' ? effectHtml(n.desc) : esc(n.desc)}</div>`);
    else for (const [k, v] of Object.entries(n.stats ?? {})) lines.push(`<div class="pg-ttip-stats">${statLine(k, v as number)}</div>`);
    if (n.special?.desc && n.special.desc !== n.desc) {
      lines.push(`<div class="pg-ttip-special">${n.kind === 'keystone' ? effectHtml(n.special.desc) : esc(n.special.desc)}</div>`);
    }
    if (n.kind === 'start' && !this.isOwnStart(n)) {
      lines.push(`<div class="pg-ttip-kind" style="margin-top:6px">Başka sınıfın başlangıcı: 1 puanla alınabilir, ağacın o bölgesine geçit sağlar.</div>`);
    }
    if (n.kind === 'mastery' && n.choices?.length) {
      const cur = this.pickOf(n.id);
      n.choices.forEach((c, i) => lines.push(`<div class="pt-web-opt">${i === cur ? '◆ ' : ''}<b>${esc(c.name)}</b> — ${esc(c.desc)}</div>`));
    }
    if (n.kind === 'socket') {
      const j = this.jewelAt(n.id);
      const jn = j ? getItemBase(j.baseId)?.name ?? j.baseId : '';
      lines.push(`<div class="pg-ttip-stats">${j ? `Yuvada: ${esc(jn)}` : 'Boş yuva'}</div>`);
    }
    const pts = this.freeDraft();
    if (st === 'allocated') {
      lines.push(`<div class="pg-ttip-foot have">✓ Alındı${this.isOwnStart(n) ? '' : ' · Sağ tık: geri al'}</div>`);
    } else if (st === 'staged') {
      lines.push(`<div class="pg-ttip-foot pt-web-foot-stage">Taslakta · sağ tık: ${n.kind === 'mastery' ? 'seçimi değiştir' : 'vazgeç'}</div>`);
    } else if (st === 'removing') {
      lines.push(`<div class="pg-ttip-foot pt-web-foot-remove">Geri alınacak · tıkla: vazgeç</div>`);
    } else if (st === 'available') {
      lines.push(`<div class="pg-ttip-foot ${pts > 0 ? 'ok' : 'no'}">${pts > 0 ? 'Tıkla: 1 puan harca' : 'Puan yok · yetenek puanı kazan'}</div>`);
    } else {
      const d = this.dist.get(n.id);
      if (d == null) lines.push(`<div class="pg-ttip-foot no">Bu düğüme ulaşan yol yok</div>`);
      else if (d <= pts) lines.push(`<div class="pg-ttip-foot ok">Toplam bedel: ${d} puan · tıkla, aradaki düğümler otomatik alınır</div>`);
      else lines.push(`<div class="pg-ttip-foot no">Toplam bedel: ${d} puan (kalan: ${pts})</div>`);
    }
    return `<div class="pg-ttip">${lines.join('')}</div>`;
  }

  private refreshTip(): void {
    if (this.hover) tip.show(this.tooltipFor(this.hover), this.mouse.x + this.canvas.getBoundingClientRect().left, this.mouse.y + this.canvas.getBoundingClientRect().top, 'pg-tip-talent');
  }

  /* ---------------------------------------------------------------- staging */

  /** Left click: stage a node (and its path), take back a staged removal, or act on an allocated node. */
  private click(n: TalentNode): void {
    const id = n.id;
    if (this.draft.remove.has(id)) {
      this.draft.remove.delete(id);
      sfx('talent_take', 0.5);
      this.afterDraftChange();
      return;
    }
    if (this.allocated.has(id)) {
      if (this.draft.add.includes(id)) {
        sfx('ui_hover', 0.5);
        return;
      }
      if (n.kind === 'mastery') this.openPicker(id, false);
      else if (n.kind === 'socket') this.onSocketClick(id);
      else sfx('ui_click', 0.4);
      return;
    }
    const free = this.freeDraft();
    const d = this.dist.get(id);
    if (free <= 0) return this.fail(n, 'Yetenek puanın yok. Seviye atlayarak puan kazan.');
    if (d == null) return this.fail(n, 'Bu düğüme ulaşan bir yol yok.');
    if (d > free) return this.fail(n, `Bu yol ${d} puan gerektiriyor (kalan: ${free}).`);
    const edit = read(() => G.talents?.canEditHere() ?? null, null);
    if (!edit?.add) return this.fail(n, edit?.reason ?? 'Şu an puan eklenemez.');
    const path = this.pathTo(id);
    if (!path.length) return this.fail(n, 'Bu düğüme ulaşan bir yol yok.');
    path.forEach((p, i) => {
      this.draft.add.push(p);
      const pn = this.byId.get(p);
      if (pn) this.granted(pn, i);
    });
    this.afterDraftChange();
    if (n.kind === 'mastery') this.openPicker(id, true);
  }

  /** Right click: re-open a staged mastery's picker, drop a staged node, cancel a removal, or open the refund menu. */
  private rightClick(n: TalentNode, e: MouseEvent): void {
    if (this.draft.add.includes(n.id)) {
      if (n.kind === 'mastery') this.openPicker(n.id, false);
      else this.unstageAdd(n.id);
      return;
    }
    if (this.draft.remove.has(n.id)) {
      this.draft.remove.delete(n.id);
      this.afterDraftChange();
      return;
    }
    if (this.committed.has(n.id) && !this.isOwnStart(n)) {
      const p = this.localPos(e);
      this.openNodeMenu(n, p.x, p.y);
    }
  }

  /** Takes a staged addition back, when no other staged node hangs on it. */
  private unstageAdd(id: string): void {
    const start = this.ownStart();
    const rest = this.draftSet();
    rest.delete(id);
    if (!start || !connectedSet(rest, start)) {
      this.warn('Bu düğümün üzerinde başka seçimler duruyor.');
      return;
    }
    this.draft.add = this.draft.add.filter((x) => x !== id);
    delete this.draft.picks[id];
    sfx('talent_untake', 0.6);
    this.afterDraftChange();
  }

  /** Stages the removal of a committed node, paid with one orb or with gold (rest zone only). Applied on commit. */
  private stageRemove(id: string, cur: Currency): void {
    const n = TALENT_NODES[id];
    const ch = G.character;
    if (!n || !ch || !this.committed.has(id) || this.isOwnStart(n) || this.draft.remove.has(id)) return;
    const used = [...this.draft.remove.values()].filter((c) => c === cur).length;
    if (cur === 'orb') {
      const r = ch.webEditReason();
      if (r) return this.warn(r);
      if (ch.material(ORB) <= used) return this.warn('Pişmanlık Küresi yok.');
    } else {
      const edit = read(() => G.talents?.canEditHere() ?? null, null);
      if (!edit?.remove) return this.warn(edit?.reason ?? 'Altınla geri almak için şehir veya köyde ol.');
      const cost = read(() => G.progression.refundCost(), 0);
      if ((used + 1) * cost > ch.save.gold) return this.warn('Yetersiz altın.');
    }
    const start = this.ownStart();
    const rest = this.draftSet();
    rest.delete(id);
    if (!start || !connectedSet(rest, start)) return this.warn('Bu iade ağacın bağlantısını koparır.');
    this.draft.remove.set(id, cur);
    delete this.draft.picks[id];
    sfx('talent_untake', 0.7);
    this.fxAt(n, '#7fb2ff', 'fail');
    this.afterDraftChange();
  }

  /** Mastery option change. Free; applied on commit (a pure addition for the auto-apply). */
  private setPick(id: string, idx: number): void {
    const n = TALENT_NODES[id];
    if (!n?.choices?.[idx]) return;
    const staged = this.draft.add.includes(id);
    if (!staged) {
      const r = G.character?.webEditReason();
      if (r) return this.warn(r);
    }
    const have = this.committed.has(id) && !staged;
    if (have && idx === this.committedPick(id)) delete this.draft.picks[id];
    else this.draft.picks[id] = idx;
    sfx('ui_click', 0.5);
    this.afterDraftChange();
  }

  private afterDraftChange(): void {
    this.refreshState();
    this.scheduleAuto();
    this.refreshTip();
  }

  /** Pure additions (and mastery picks) apply by themselves after 1.5 s, when the setting is on. */
  private scheduleAuto(): void {
    window.clearTimeout(this.autoTimer);
    this.autoTimer = 0;
    if (!this.active || this.committing || this.choosing) return;
    if (this.draft.remove.size || this.draftEmpty()) return;
    if (!read(() => G.settings.get('autoApplyPassives'), true)) return;
    this.autoTimer = window.setTimeout(() => {
      this.autoTimer = 0;
      if (!this.active || this.choosing || this.draftEmpty()) return;
      const r = this.commitDraft();
      if (!r.ok) {
        this.warn(r.error ?? 'Pasif taslağı uygulanamadı.');
        this.refreshState();
      }
    }, AUTO_APPLY_MS);
  }

  /** The web apply row's button. */
  private applyNow(): void {
    const r = this.commitDraft();
    if (r.ok) {
      sfx('talent_apply', 0.6);
      toast('Pasif değişiklikler uygulandı.', 'success');
    } else {
      this.warn(r.error ?? 'Pasif taslağı uygulanamadı.');
    }
    this.refreshState();
  }

  private refreshStage(): void {
    const hasDraft = !this.draftEmpty();
    this.stageEl.classList.toggle('is-off', !hasDraft);
    this.stageEl.classList.toggle('is-pending', hasDraft);
    if (!hasDraft) return;
    const plus = this.draft.add.length;
    const minus = this.draft.remove.size;
    const picks = Object.keys(this.draft.picks).length;
    const goldRemoves = [...this.draft.remove.values()].filter((c) => c === 'gold').length;
    const cost = goldRemoves * read(() => G.progression.refundCost(), 0);
    this.stageTxt.textContent = `Pasif taslağı: +${plus} −${minus}${picks ? ` · ${picks} seçim` : ''} · Bedel: ${fmtInt(cost)} altın`;
    const edit = read(() => G.talents?.canEditHere() ?? null, null);
    const auto = read(() => G.settings.get('autoApplyPassives'), true) && minus === 0;
    let hint: string;
    let warnCls = false;
    if (this.choosing) hint = 'Ustalık seçimini yap.';
    else if (minus && !edit?.remove) {
      hint = 'Geri alma yalnızca şehir veya köyde.';
      warnCls = true;
    } else if (auto) hint = 'Yalnızca ekleme: 1,5 sn sonra kendiliğinden uygulanır.';
    else hint = 'Uygula ile kalıcılaşır.';
    this.stageHint.textContent = hint;
    this.stageHint.classList.toggle('is-warn', warnCls);
  }

  private fail(n: TalentNode, msg: string): void {
    this.warn(msg);
    this.fxAt(n, '#ff5a4a', 'fail');
  }

  /** Refused action: a warning toast and a red shake of the points badge. */
  private warn(msg: string): void {
    sfx('ui_error');
    toast(msg, 'warning');
    this.pointsEl.classList.remove('pg-shake');
    void this.pointsEl.offsetWidth;
    this.pointsEl.classList.add('pg-shake');
  }

  private fxAt(n: TalentNode, color: string, kind: 'fail' | 'ring'): void {
    this.fx.push({ x: n.x, y: n.y, t0: performance.now() / 1000, life: 0.45, kind, color, size: RADII[n.kind] });
  }

  private granted(n: TalentNode, order: number): void {
    const now = performance.now() / 1000 + order * 0.09;
    const big = n.kind === 'keystone';
    const color = big ? '#ff9d4a' : n.kind === 'notable' ? '#ffd36a' : '#ffe9a0';
    const sparks = Array.from({ length: big ? 22 : n.kind === 'notable' ? 14 : 9 }, (_, i) => ({ a: (i / (big ? 22 : 12)) * Math.PI * 2 + Math.random() * 0.5, v: 40 + Math.random() * (big ? 120 : 70) }));
    this.fx.push({ x: n.x, y: n.y, t0: now, life: big ? 1.1 : 0.7, kind: 'ring', color, size: RADII[n.kind] });
    this.fx.push({ x: n.x, y: n.y, t0: now, life: big ? 1.2 : 0.8, kind: 'spark', color, size: RADII[n.kind], sparks });
    if (big) {
      this.fx.push({ x: n.x, y: n.y, t0: now + 0.1, life: 1.4, kind: 'ring', color: '#ffffff', size: RADII[n.kind] });
      this.flash = 0.32;
    }
    const play = () => sfx(n.kind === 'keystone' ? 'keystone_insert' : n.kind === 'notable' ? 'upgrade_success' : 'passive_allocate', 0.9);
    if (order === 0) play();
    else window.setTimeout(play, order * 90);
    if (n.kind === 'keystone') window.setTimeout(() => sfx('level_up', 0.5), order * 90 + 120);
  }

  /* ---------------------------------------------------------------- popovers and menus */

  /** Mastery picker: three cards (name, effect, cost hint). `fresh` = the node was just taken and the choice is pending. */
  private openPicker(id: string, fresh: boolean): void {
    const n = TALENT_NODES[id];
    if (!n?.choices?.length) return;
    this.closePicker();
    this.choosing = fresh ? id : null;
    const cur = this.pickOf(id);
    const cards = n.choices.map((c, i) => {
      const card = h(
        `button.pt-web-pick${i === cur ? '.is-current' : ''}`,
        { type: 'button' },
        h('b', null, c.name),
        h('span', null, c.desc),
        h('small', null, i === cur ? 'Seçili' : 'Düğüm bedeli: 1 puan · seçim ücretsiz'),
      ) as HTMLButtonElement;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setPick(id, i);
        this.closePicker();
      });
      return card;
    });
    const pop = h(
      'div.pt-web-pop',
      null,
      h('div.pt-web-pop-h', null, n.name),
      h('div.pt-web-pop-cards', null, ...cards),
      h('small.pt-web-pop-note', null, 'Seçim taslakta değiştirilebilir; uygulanınca kalıcılaşır.'),
    );
    const [sx, sy] = this.toScreen(n.x, n.y);
    pop.style.left = `${clampN(sx - 150, 8, Math.max(8, this.W - 308))}px`;
    pop.style.top = sy > this.H * 0.55 ? `${Math.max(8, sy - 250)}px` : `${clampN(sy + 30, 8, Math.max(8, this.H - 240))}px`;
    this.wrap.append(pop);
    this.popEl = pop;
    this.scheduleAuto();
  }

  private closePicker(): void {
    this.popEl?.remove();
    this.popEl = null;
    if (this.choosing) {
      this.choosing = null;
      this.scheduleAuto();
    }
  }

  /** Refund and option menu of an allocated node (right click). */
  private openNodeMenu(n: TalentNode, x: number, y: number): void {
    const items: MenuItem[] = [];
    if (n.kind === 'mastery' && n.choices?.length) items.push({ label: 'Seçimi değiştir', onClick: () => this.openPicker(n.id, false) });
    if (n.kind === 'socket') items.push({ label: 'Mücevheri değiştir', onClick: () => this.onSocketClick(n.id) });
    const ch = G.character;
    const owned = read(() => ch?.material(ORB) ?? 0, 0);
    const staged = [...this.draft.remove.values()].filter((c) => c === 'orb').length;
    const orbs = Math.max(0, owned - staged);
    const reason = ch ? read(() => ch.webEditReason(), 'Okunamadı.') : 'Karakter seçilmedi.';
    items.push({
      label: `Pişmanlık Küresi kullan (${orbs})`,
      sub: 'Bir küre, bağlantıyı koruyarak bu düğümü iade eder',
      title: reason ?? (orbs < 1 ? 'Pişmanlık Küresi yok.' : ''),
      disabled: !!reason || orbs < 1,
      onClick: () => this.stageRemove(n.id, 'orb'),
    });
    const cost = read(() => G.progression.refundCost(), 0);
    const edit = read(() => G.talents?.canEditHere() ?? null, null);
    const gold = ch?.save.gold ?? 0;
    items.push({
      label: `Altınla geri al (${fmtInt(cost)})`,
      sub: 'Yalnızca şehir veya köyde',
      title: !edit?.remove ? edit?.reason ?? 'Şehir veya köyde ol.' : gold < cost ? 'Yetersiz altın.' : '',
      disabled: !edit?.remove || gold < cost,
      onClick: () => this.stageRemove(n.id, 'gold'),
    });
    items.push({ label: 'İptal', onClick: () => undefined });
    this.showMenu(this.wrap, { x, y }, n.name, items);
  }

  private togglePlanMenu(e: MouseEvent): void {
    e.stopPropagation();
    if (this.menuEl && this.menuEl.classList.contains('pt-web-drop-menu')) {
      this.closeMenu();
      return;
    }
    const items: MenuItem[] = [
      { label: 'Dışa Aktar (EFP1)', sub: 'Kayıtlı pasif ağacı metin olarak kopyala', onClick: () => this.exportPlanDialog() },
      { label: 'İçe Aktar', sub: 'Bir EFP1 metninden plan göster', onClick: () => this.importPlanDialog() },
      { label: 'Planı Uygula', sub: 'Bağlı olan kadarını, puanın yettiği ölçüde taslağa ekle', disabled: !this.plan, onClick: () => this.applyPlan() },
      { label: 'Planı Temizle', disabled: !this.plan, onClick: () => this.clearPlan() },
    ];
    this.showMenu(this.planDrop, null, 'Plan', items);
  }

  /** Shows a menu in `host`: at (x, y) inside a view, or under the anchor (`pt-web-drop-menu`) when `pos` is null. */
  private showMenu(host: HTMLElement, pos: { x: number; y: number } | null, title: string, items: MenuItem[]): void {
    this.closeMenu();
    const kids: Node[] = [];
    if (title) kids.push(h('div.pt-web-menu-h', null, title));
    for (const it of items) {
      const b = h('button.pt-web-mi', { type: 'button', title: it.title ?? '' }, it.label, it.sub ? h('small.pt-web-mi-sub', null, it.sub) : null) as HTMLButtonElement;
      b.disabled = !!it.disabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        this.closeMenu();
        it.onClick();
      });
      kids.push(b);
    }
    const menu = h(`div.pt-web-menu${pos ? '' : '.pt-web-drop-menu'}`, null, ...kids);
    if (pos) {
      menu.style.left = `${clampN(pos.x, 6, Math.max(6, this.W - 250))}px`;
      menu.style.top = `${clampN(pos.y, 6, Math.max(6, this.H - 220))}px`;
    }
    host.append(menu);
    this.menuEl = menu;
  }

  private closeMenu(): void {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  /** Modal layer inside the view: title, body nodes and buttons. */
  private openDialog(title: string, body: Node[], buttons: HTMLElement[]): void {
    this.closeDialog();
    const layer = h(
      'div.pt-web-dlg',
      null,
      h('div.pt-web-dlg-box', null, h('div.pt-web-dlg-h', null, title), ...body, h('div.pt-web-dlg-btns', null, ...buttons)),
    );
    layer.addEventListener('mousedown', (e) => {
      if (e.target === layer) this.closeDialog();
    });
    this.wrap.append(layer);
    this.dlgEl = layer;
  }

  private closeDialog(): void {
    this.dlgEl?.remove();
    this.dlgEl = null;
  }

  /* ---------------------------------------------------------------- plan (EFP1) */

  private exportPlanDialog(): void {
    const ch = G.character;
    if (!ch) return;
    this.readCommitted();
    const str = encodeWeb(ch.classId, [...this.committed], ch.save.passiveExtra?.picks ?? {});
    const ta = document.createElement('textarea');
    ta.className = 'pt-web-ta';
    ta.readOnly = true;
    ta.value = str;
    const fallback = () => {
      ta.focus();
      ta.select();
      toast('Metni seçip kopyalayabilirsin.', 'info');
    };
    const copy = () => {
      if (!navigator.clipboard) return fallback();
      navigator.clipboard.writeText(str).then(
        () => toast('Plan panoya kopyalandı.', 'success'),
        () => fallback(),
      );
    };
    this.openDialog(
      'Pasif Planı Dışa Aktar',
      [h('p.pt-web-dlg-p', null, 'Kayıtlı pasif ağacın ve Ustalık seçimlerinin metnidir. İçe Aktar ile geri yükleyebilirsin.'), ta],
      [button('Kopyala', copy, { variant: 'primary' }), button('Kapat', () => this.closeDialog(), { variant: 'ghost' })],
    );
    ta.select();
  }

  private importPlanDialog(): void {
    const ta = document.createElement('textarea');
    ta.className = 'pt-web-ta';
    ta.placeholder = 'EFP1-…';
    this.openDialog(
      'Pasif Planı İçe Aktar',
      [h('p.pt-web-dlg-p', null, 'Bir EFP1 metni yapıştır. Plan ağacın üstünde yarı saydam görünür; "Planı Uygula" ile taslağa eklenir.'), ta],
      [button('Yükle', () => this.importPlan(ta.value), { variant: 'primary' }), button('İptal', () => this.closeDialog(), { variant: 'ghost' })],
    );
    ta.focus();
  }

  private importPlan(raw: string): void {
    const ch = G.character;
    if (!ch) return;
    const r = decodeWeb(raw);
    if (!r.ok) {
      this.warn('Geçersiz yapı dizesi');
      return;
    }
    if (r.classId !== ch.classId) {
      this.warn('Bu plan başka bir sınıfa ait.');
      return;
    }
    const own = this.ownStart();
    const ids = r.allocated.filter((id) => id !== own && !!TALENT_NODES[id]);
    this.closeDialog();
    this.plan = { ids, picks: r.picks };
    toast(`Plan yüklendi: ${ids.length} düğüm. "Planı Uygula" ile taslağa ekleyebilirsin.`, 'info');
    this.refreshState();
  }

  /** "Planı Uygula": stages the connected part of the plan that the free points pay for. */
  private applyPlan(): void {
    const plan = this.plan;
    if (!plan) return;
    const edit = read(() => G.talents?.canEditHere() ?? null, null);
    if (!edit?.add) return this.warn(edit?.reason ?? 'Şu an puan eklenemez.');
    const set = this.draftSet();
    let free = this.freeDraft();
    const staged: string[] = [];
    let moved = true;
    while (free > 0 && moved) {
      moved = false;
      for (const id of plan.ids) {
        if (free <= 0) break;
        if (set.has(id) || this.committed.has(id)) continue;
        const node = TALENT_NODES[id];
        if (!node || !node.links.some((l) => set.has(l))) continue;
        set.add(id);
        staged.push(id);
        free--;
        moved = true;
      }
    }
    if (!staged.length) {
      toast('Planın bağlı olduğu bir düğüm için puanın yok.', 'info');
      return;
    }
    this.draft.add.push(...staged);
    for (const id of set) if (plan.picks[id] !== undefined) this.draft.picks[id] = plan.picks[id];
    plan.ids = plan.ids.filter((id) => !staged.includes(id));
    if (!plan.ids.length) this.plan = null;
    toast(`${staged.length} düğüm taslağa eklendi.`, 'success');
    this.afterDraftChange();
  }

  private clearPlan(): void {
    this.plan = null;
    this.refreshState();
  }

  /* ---------------------------------------------------------------- render */

  private frame = (now: number): void => {
    if (!this.active) {
      this.raf = 0;
      return;
    }
    const t = now / 1000;
    const dt = Math.min(0.05, Math.max(0.001, t - this.lastT));
    this.lastT = t;
    if (this.wrap.clientWidth && (this.wrap.clientWidth !== this.W || this.wrap.clientHeight !== this.H)) this.resize();
    const k = 1 - Math.exp(-13 * dt);
    this.cam.x += (this.tgt.x - this.cam.x) * k;
    this.cam.y += (this.tgt.y - this.cam.y) * k;
    this.cam.zoom += (this.tgt.zoom - this.cam.zoom) * k;
    try {
      this.draw(t);
    } catch (e) {
      console.error('[talents] draw failed', e);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw(t: number): void {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // background
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
    bg.addColorStop(0, '#221810');
    bg.addColorStop(0.55, '#130d09');
    bg.addColorStop(1, '#070403');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (!this.nodes.length) {
      ctx.fillStyle = '#b3a284';
      ctx.font = '700 18px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillText('Yetenek ağacı verisi yüklenemedi', W / 2, H / 2);
      return;
    }

    const z = this.cam.zoom;
    const s = z * BASE;
    const [ox, oy] = this.toScreen(0, 0);

    // faint stars
    ctx.fillStyle = '#e8c46a';
    for (const st of this.stars) {
      const [sx, sy] = this.toScreen(st.x, st.y);
      if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
      ctx.globalAlpha = 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.3 + st.p));
      const sz = Math.max(1, st.s * Math.min(1.6, z));
      ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
    }
    ctx.globalAlpha = 1;

    // quadrant glows
    for (const n of this.nodes) {
      if (n.kind !== 'start' || !n.classStart) continue;
      const [sx, sy] = this.toScreen(n.x * 1.25, n.y * 1.25);
      const col = CLASS_META[n.classStart]?.color ?? '#ffffff';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 560 * s);
      g.addColorStop(0, col + '26');
      g.addColorStop(1, col + '00');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 600 * s, sy - 600 * s, 1200 * s, 1200 * s);
    }

    // decorative rings
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(201,162,74,0.10)';
    ctx.setLineDash([3, 9]);
    for (const r of [90, 300, 420, 600, 780, 950]) {
      ctx.beginPath();
      ctx.arc(ox, oy, r * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(201,162,74,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ox, oy, 1010 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // sector labels (zoomed out, §5.3)
    if (z < 0.5) {
      ctx.save();
      ctx.font = '700 15px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(232,194,90,0.5)';
      for (const lb of this.labels) {
        const [sx, sy] = this.toScreen(lb.x, lb.y);
        ctx.fillText(lb.text, sx, sy);
      }
      ctx.restore();
    }

    this.drawLinks(ctx, t, z);
    this.drawNodes(ctx, t, z);
    if (this.plan) this.drawPlan(ctx, t, z);
    this.drawFx(ctx, t, s);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,236,170,${this.flash})`;
      ctx.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - 0.018);
    }
    this.drawMini();
  }

  private drawLinks(ctx: CanvasRenderingContext2D, t: number, z: number): void {
    const lw = clampN(z * 4.2, 2, 9);
    const dark = new Path2D();
    const pale = new Path2D();
    const gold = new Path2D();
    for (const [a, b] of this.links) {
      const aa = this.allocated.has(a.id);
      const ba = this.allocated.has(b.id);
      const [ax, ay] = this.toScreen(a.x, a.y);
      const [bx, by] = this.toScreen(b.x, b.y);
      const p = aa && ba ? gold : aa || ba ? pale : dark;
      p.moveTo(ax, ay);
      p.lineTo(bx, by);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = '#2f2418';
    ctx.stroke(dark);
    ctx.lineWidth = lw * 0.8;
    ctx.strokeStyle = 'rgba(205,191,154,0.55)';
    ctx.stroke(pale);
    // allocated: glow + core + flowing energy
    ctx.lineWidth = lw * 2.4;
    ctx.strokeStyle = 'rgba(232,194,90,0.16)';
    ctx.stroke(gold);
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#d9a93f';
    ctx.stroke(gold);
    ctx.lineWidth = lw * 0.38;
    ctx.strokeStyle = '#fff1b8';
    ctx.setLineDash([lw * 1.6, lw * 3.2]);
    ctx.lineDashOffset = -t * lw * 5;
    ctx.stroke(gold);
    ctx.setLineDash([]);

    // hover path preview
    if (this.hoverPath.length) {
      const pulse = 0.55 + 0.35 * Math.sin(t * 7);
      ctx.lineWidth = lw * 1.1;
      ctx.strokeStyle = `rgba(255,233,160,${pulse})`;
      ctx.setLineDash([lw * 1.4, lw * 1.4]);
      ctx.lineDashOffset = -t * lw * 8;
      ctx.beginPath();
      let prevId: string | null = null;
      for (const id of this.hoverPath) {
        const n = this.byId.get(id);
        const pid = this.prev.get(id);
        const from = pid ? this.byId.get(pid) : prevId ? this.byId.get(prevId) : null;
        if (n && from) {
          const [ax, ay] = this.toScreen(from.x, from.y);
          const [bx, by] = this.toScreen(n.x, n.y);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        prevId = id;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawNodes(ctx: CanvasRenderingContext2D, t: number, z: number): void {
    const order: Record<TalentNode['kind'], number> = { small: 0, notable: 1, keystone: 2, start: 3, mastery: 2, socket: 0 };
    const sorted = [...this.nodes].sort((a, b) => order[a.kind] - order[b.kind]);
    const searching = this.query.length >= 2;
    const onPath = new Set(this.hoverPath);
    for (const n of sorted) {
      const [sx, sy] = this.toScreen(n.x, n.y);
      let r = RADII[n.kind] * z;
      if (sx < -r * 3 || sy < -r * 3 || sx > this.W + r * 3 || sy > this.H + r * 3) continue;
      const st = this.stateOf(n);
      const hov = this.hover === n;
      const match = this.matches.has(n.id);
      if (hov) r *= 1.1;
      ctx.globalAlpha = searching && !match ? 0.28 : 1;
      this.drawNode(ctx, n, sx, sy, r, st, t, hov, onPath.has(n.id));
      if (searching && match) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.strokeStyle = '#7ff0ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 6 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.25 * pulse;
        ctx.drawImage(glowSprite('#7ff0ff'), sx - r * 3, sy - r * 3, r * 6, r * 6);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: TalentNode, x: number, y: number, r: number, st: NodeState, t: number, hov: boolean, onPath: boolean): void {
    const alloc = st === 'allocated';
    const staged = st === 'staged';
    const removing = st === 'removing';
    const avail = st === 'available';
    const kind = n.kind;
    const accent = kind === 'keystone' ? '#ff9d4a' : kind === 'notable' ? '#ffd36a' : kind === 'start' ? CLASS_META[n.classStart ?? 'knight']?.color ?? '#cfe3ff' : '#ffe9a0';

    // glow
    if (alloc || staged || removing || hov || onPath) {
      const gcol = kind === 'start' ? accent : alloc ? '#ffc94d' : staged ? '#9fe6ff' : removing ? '#ff7a5a' : '#fff1c0';
      const gs = glowSprite(gcol);
      const base = alloc || staged ? 0.85 : 0.5;
      ctx.globalAlpha *= base;
      const gr = r * (kind === 'keystone' ? 3.4 : 2.6) * (1 + (kind === 'keystone' && alloc ? 0.1 * Math.sin(t * 2.4) : 0));
      ctx.drawImage(gs, x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = ctx.globalAlpha / base;
    }

    const ringW = Math.max(1.5, r * 0.16);
    let ringCol: string | CanvasGradient;
    let fillCol: string;
    let iconCol: string;
    if (alloc) {
      const g = ctx.createLinearGradient(x, y - r, x, y + r);
      g.addColorStop(0, '#fff0b0');
      g.addColorStop(1, kind === 'keystone' ? '#d4731f' : '#b8862f');
      ringCol = g;
      fillCol = kind === 'keystone' ? '#4a2a10' : '#40300f';
      iconCol = '#fff2c0';
    } else if (staged) {
      ringCol = `rgba(159,230,255,${0.7 + 0.3 * Math.sin(t * 5)})`;
      fillCol = '#16262c';
      iconCol = '#dff6ff';
    } else if (removing) {
      ringCol = '#b5482f';
      fillCol = '#24110c';
      iconCol = '#c77a66';
    } else if (avail) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 4 + n.x * 0.01);
      ringCol = `rgba(236,222,180,${pulse})`;
      fillCol = '#2a1e12';
      iconCol = '#d9ccaa';
    } else {
      ringCol = kind === 'keystone' ? '#6a4a3a' : kind === 'start' ? '#5b4d3a' : '#4b3d2b';
      fillCol = '#15100b';
      iconCol = '#85775a';
    }
    if (hov && !alloc && !staged) ringCol = '#fff3c4';
    if (onPath && !alloc && !staged) ringCol = '#ffe08a';

    ctx.lineWidth = ringW;
    ctx.strokeStyle = ringCol;
    ctx.fillStyle = fillCol;

    if (kind === 'keystone') {
      // octagon with inner octagon and four diamond studs
      const poly = (rad: number, rot: number) => {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = rot + (i / 8) * Math.PI * 2;
          const px = x + Math.cos(a) * rad;
          const py = y + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };
      poly(r, Math.PI / 8);
      ctx.fill();
      ctx.stroke();
      poly(r * 0.78, Math.PI / 8);
      ctx.lineWidth = Math.max(1, ringW * 0.5);
      ctx.strokeStyle = alloc ? 'rgba(255,200,120,0.75)' : 'rgba(120,90,70,0.8)';
      ctx.stroke();
      ctx.fillStyle = alloc ? '#ffd7a0' : avail ? '#cbbd96' : '#5a4b3a';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const px = x + Math.cos(a) * (r + ringW * 0.9);
        const py = y + Math.sin(a) * (r + ringW * 0.9);
        const d = Math.max(2.5, r * 0.14);
        ctx.beginPath();
        ctx.moveTo(px, py - d);
        ctx.lineTo(px + d, py);
        ctx.lineTo(px, py + d);
        ctx.lineTo(px - d, py);
        ctx.closePath();
        ctx.fill();
      }
    } else if (kind === 'start') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = ringW * 1.2;
      ctx.strokeStyle = alloc || staged ? accent : avail ? ringCol : this.isOwnStart(n) ? accent : '#5b4d3a';
      ctx.stroke();
      // rune ticks
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.strokeStyle = alloc || staged ? accent : 'rgba(150,130,100,0.55)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + t * 0.05;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r + ringW), y + Math.sin(a) * (r + ringW));
        ctx.lineTo(x + Math.cos(a) * (r + ringW + r * 0.14), y + Math.sin(a) * (r + ringW + r * 0.14));
        ctx.stroke();
      }
      iconCol = alloc ? accent : avail ? '#d9ccaa' : '#6e6250';
    } else if (kind === 'mastery') {
      // gold hexagon with an inner star (§5.3)
      hexPath(ctx, x, y, r);
      ctx.fill();
      ctx.stroke();
      hexPath(ctx, x, y, r * 0.76);
      ctx.lineWidth = Math.max(1, ringW * 0.5);
      ctx.strokeStyle = alloc ? 'rgba(255,230,150,0.8)' : 'rgba(120,100,70,0.7)';
      ctx.stroke();
      starPath(ctx, x, y, r * 0.5, r * 0.21, 5);
      ctx.fillStyle = alloc ? '#ffe6a0' : staged ? '#dff6ff' : avail ? '#cbbd96' : '#5a4b3a';
      ctx.fill();
      return;
    } else if (kind === 'socket') {
      // open ring; the socketed jewel's icon, tinted by its rarity, sits inside (§5.3)
      ctx.lineWidth = ringW * 1.6;
      ctx.strokeStyle = ringCol;
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2 + 0.55, -Math.PI / 2 - 0.55 + Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = fillCol;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      const jewel = this.jewelAt(n.id);
      if (jewel) {
        const ic = tintedIcon(itemIcon(jewel), RARITY_COLORS[jewel.rarity] ?? '#e9dcc0');
        if (ic) ctx.drawImage(ic, x - r * 0.55, y - r * 0.55, r * 1.1, r * 1.1);
      } else {
        ctx.fillStyle = iconCol;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (kind === 'notable') {
        ctx.lineWidth = Math.max(1, ringW * 0.5);
        ctx.strokeStyle = alloc ? 'rgba(255,230,150,0.85)' : 'rgba(120,100,70,0.7)';
        ctx.beginPath();
        ctx.arc(x, y, r + ringW * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = alloc ? '#ffe6a0' : '#5b4d3a';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
          const sz = Math.max(1.6, r * 0.09);
          ctx.fillRect(x + Math.cos(a) * (r + ringW * 1.35) - sz, y + Math.sin(a) * (r + ringW * 1.35) - sz, sz * 2, sz * 2);
        }
      }
    }

    // icon
    const ic = tintedIcon(iconFor(n), iconCol);
    if (ic) {
      const sz = r * (kind === 'start' ? 1.25 : kind === 'small' ? 1.2 : 1.12);
      ctx.drawImage(ic, x - sz / 2, y - sz / 2, sz, sz);
    }
    void accent;
  }

  /** Plan overlay (§3.9): the nodes of an imported plan that the draft does not hold yet, as dashed pale rings. */
  private drawPlan(ctx: CanvasRenderingContext2D, t: number, z: number): void {
    if (!this.plan) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const id of this.plan.ids) {
      const n = this.byId.get(id);
      if (!n || this.allocated.has(id)) continue;
      const [sx, sy] = this.toScreen(n.x, n.y);
      ctx.strokeStyle = `rgba(93,224,208,${0.45 + 0.2 * Math.sin(t * 4)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, RADII[n.kind] * z * 1.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawFx(ctx: CanvasRenderingContext2D, t: number, s: number): void {
    if (!this.fx.length) return;
    const z = this.cam.zoom;
    this.fx = this.fx.filter((f) => t - f.t0 < f.life);
    for (const f of this.fx) {
      const age = t - f.t0;
      if (age < 0) continue;
      const k = age / f.life;
      const [sx, sy] = this.toScreen(f.x, f.y);
      ctx.save();
      if (f.kind === 'ring' || f.kind === 'fail') {
        ctx.globalAlpha = (1 - k) * 0.95;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = Math.max(2, (1 - k) * 6 * z);
        ctx.beginPath();
        ctx.arc(sx, sy, f.size * z * (1 + k * (f.kind === 'fail' ? 0.9 : 2.8)), 0, Math.PI * 2);
        ctx.stroke();
      } else if (f.kind === 'spark' && f.sparks) {
        ctx.fillStyle = f.color;
        for (const sp of f.sparks) {
          const d = sp.v * age * z * 0.9;
          ctx.globalAlpha = (1 - k) * (1 - k);
          const sz = Math.max(2, (1 - k) * 4 * z);
          ctx.fillRect(sx + Math.cos(sp.a) * d - sz / 2, sy + Math.sin(sp.a) * d - sz / 2 + age * age * 30 * z, sz, sz);
        }
      }
      ctx.restore();
    }
    void s;
  }
}
