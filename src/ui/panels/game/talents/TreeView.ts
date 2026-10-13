/**
 * GDD_TALENTS §5.2 tab 1 (T11): the WoW trees.
 * `TreeView` draws one 30-slot tree on a canvas (node shapes, rank pips, A|B halves, gate bars, states, links), takes the
 * mouse and the keyboard focus ring and opens the A|B popover. `TreeTab` is the whole tab: spec chips, the loadout bar,
 * the spec picker (no spec yet), the class and spec trees (side by side, stacked behind a toggle below 1100 px) and the
 * search. It implements TalentTab for the shell (talents.ts). The draft lives in G.talents (TalentSystem): the views read
 * it and only call its take / untake / canTake / stageTree / reset / loadLoadout actions. Owner: panels-game.
 */
import { G } from '../../../../game/G';
import { clamp } from '../../../../core/utils';
import { ROLE_TR } from '../../../../combat/specs';
import { SKILLS } from '../../../../data/skills';
import { SIGNATURE_SKILLS } from '../../../../data/skillSpecs';
import { getSpec } from '../../../../data/specs';
import { getTree, specsOfClass } from '../../../../data/talentTrees/index';
import { GATES } from '../../../../data/talentTrees/layout';
import { parseFx } from '../../../../data/talentTrees/fx';
import { MAX_SAVED_LOADOUTS } from '../../../../systems/Talents';
import { emit } from '../../../../systems/notify';
import { STAT_INFO, type StatId } from '../../../../types/stats';
import type { ClassId } from '../../../../types/common';
import type { SkillDef } from '../../../../types/skills';
import type { NodeType, SlotId, TreeDef, TreeKind, TreeNodeDef } from '../../../../types/talents';
import type { SpecId } from '../../../../types/v2';
import { askConfirm, button, esc, h, icon, sfx, tip, toast } from '../base';
import { ROLE_COLORS, glowSprite, nodePath, tintedIcon, type TalentTab, type TalentTabId } from './shared';

/* ------------------------------------------------------------------ */
/* Layout, palette and names                                            */
/* ------------------------------------------------------------------ */

/** Shared layout (GDD_TALENTS §2.2): node centre = (150 × column, 130 × row) in world units. */
const COL_W = 150;
const ROW_H = 130;
/** World rectangle that is fitted into a tree canvas (node centres span 0..900 × 0..1170 plus room for radii and gates). */
const WORLD_X0 = -60;
const WORLD_X1 = 960;
const WORLD_Y0 = -50;
const WORLD_Y1 = 1220;
const WORLD_CX = (WORLD_X0 + WORLD_X1) / 2;
const WORLD_CY = (WORLD_Y0 + WORLD_Y1) / 2;
/** Wheel zoom range, relative to the fitted view (GDD_TALENTS §5.2). */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.6;
/** Pointer travel (px) that turns a press into a drag. */
const DRAG_PX = 4;
/** Below this width the two trees stack behind the Sınıf | Uzmanlık toggle (GDD_TALENTS §5.1). */
export const STACK_BELOW_PX = 1100;

const GOLD = '#e8c25a';
const GOLD_LIGHT = '#ffe9aa';
const PALE = '#cdbd96';
const IRON = '#3a3328';
const IRON_DIM = '#6b604c';
const RUNE = '#5de0d0';
const FOCUS = '#fff3c4';
const STONE = '#1a130c';
const ICON_DIR = '/assets/icons/';

/** Turkish names of the node types (tooltips). */
const TYPE_NAMES: Record<NodeType, string> = { P: 'Küçük Düğüm', C: 'Seçim', M: 'Mekanik', A: 'Beceri', K: 'Kilit Taşı' };

/** Stat → icon of a palette (P) node; first match wins. Icons are the existing stat-*.svg / skill-*.svg set. */
const STAT_ICONS: [RegExp, string][] = [
  [/^str$/, 'stat-strength'], [/^dex$/, 'stat-dexterity'], [/^int$/, 'stat-intelligence'], [/^vit$/, 'stat-vitality'],
  [/^maxHp|^hpRegen|^hpOn|^healing|^healReceived/, 'stat-life'], [/lifeSteal/, 'buff-lifesteal'], [/^maxResource|resource/i, 'stat-mana'],
  [/^fireDamage/, 'skill-fireball'], [/^frostDamage/, 'skill-ice-bolt'], [/^lightningDamage/, 'skill-lightning-bolt'],
  [/^shadowDamage/, 'skill-curse'], [/^poisonDamage/, 'skill-poison-cloud'], [/^holyDamage/, 'skill-holy-light'],
  [/^arcaneDamage/, 'skill-arcane-orb'], [/^physicalDamage|^meleeDamage/, 'skill-sword-slash'],
  [/^crit/, 'stat-crit'], [/attackSpeed|castSpeed/, 'stat-attack-speed'], [/^cdr|majorCdr/, 'stat-cooldown'],
  [/^armor/, 'stat-armor'], [/^block/, 'stat-block'], [/^dodge/, 'stat-dodge'], [/^resFire/, 'stat-fire-resist'],
  [/^resFrost/, 'stat-cold-resist'], [/^resLightning/, 'stat-lightning-resist'], [/^resPoison/, 'stat-poison-resist'],
  [/^res/, 'stat-armor'], [/moveSpeed/, 'stat-move-speed'], [/^thorns/, 'buff-thorns'], [/potion|flask/, 'item-potion-health'],
  [/^damage|^aoe|^projectile|^dot|^bleed|^burn|^poison|^weak|^finisher/, 'stat-damage'], [/bossDamage/, 'ui-boss'],
  [/eliteDamage/, 'ui-elite'], [/ccDuration|ccReduction/, 'debuff-stun'], [/goldFind/, 'stat-gold-find'],
  [/magicFind/, 'stat-magic-find'], [/^xp/, 'ui-level-up'],
];

type Letter = 'A' | 'B';
type NodeState = 'taken' | 'available' | 'gated' | 'blocked';
type Dir = 'up' | 'down' | 'left' | 'right';

/* ------------------------------------------------------------------ */
/* Pure helpers (no DOM)                                                */
/* ------------------------------------------------------------------ */

/** A choice node has two options (A and B): every choice C, the capstone s30 and the class-tree s05. */
const isChoice = (n: TreeNodeDef): boolean => n.type !== 'P' && n.options.length === 2;

/** Points a node value stands for: a P node counts its rank, every other node 1 when taken. */
const pointsOf = (n: TreeNodeDef, v: number): number => (n.type === 'P' ? v : v > 0 ? 1 : 0);

function pointsIn(tree: TreeDef, vals: readonly number[]): number {
  let s = 0;
  tree.nodes.forEach((n, i) => {
    s += pointsOf(n, vals[i] ?? 0);
  });
  return s;
}

/** 30 non-negative integers from a stored array (missing entries are 0). */
function padValues(src: readonly number[] | undefined): number[] {
  const out: number[] = [];
  for (let i = 0; i < 30; i++) {
    const v = Math.trunc(Number(src?.[i]) || 0);
    out.push(v > 0 ? v : 0);
  }
  return out;
}

/** Working values of one tree: the open draft of this character, else the committed build of the active spec. */
function workingValues(kind: TreeKind): number[] {
  const T = G.talents;
  const save = G.character?.save;
  if (!T || !save) return padValues([]);
  const d = T.draft;
  if (d && d.charId === save.id) return padValues(kind === 'class' ? d.cls : d.spc);
  const spec = T.specId;
  const act = spec ? save.tb?.active[spec] : undefined;
  return padValues(kind === 'class' ? act?.cls : act?.spc);
}

/** Tree of a class or spec id; null when unknown (never throws). */
function treeOf(kind: TreeKind, id: string | null | undefined): TreeDef | null {
  if (!id) return null;
  try {
    return getTree(kind, id);
  } catch {
    return null;
  }
}

/** Search key: lower case (Turkish rules) without diacritics, so "ateş" matches "Ates". */
function norm(s: string): string {
  return s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** The first skill a node grants (`G` item of its option), or undefined. */
function grantOf(fx: string): string | undefined {
  const it = parseFx(fx).items.find((x) => x.k === 'G');
  return it && it.k === 'G' ? it.skill : undefined;
}

/** Option title: the authored name, else the granted skill's name, else the slot. */
function optionTitle(n: TreeNodeDef, o: TreeNodeDef['options'][number]): string {
  if (o.name) return o.name;
  const g = grantOf(o.fx);
  return (g && SKILLS[g]?.name) || n.slot;
}

/** Option effect text: the authored description, else the granted skill's (placeholders removed), else the fx string. */
function optionDesc(n: TreeNodeDef, o: TreeNodeDef['options'][number]): string {
  if (o.desc) return o.desc;
  const g = grantOf(o.fx);
  const sk = g ? SKILLS[g] : undefined;
  if (sk?.desc) return sk.desc.replace(/\{\w+\}/g, '').trim();
  return n.type === 'P' ? '' : o.fx;
}

/** Name of the skill an option touches: the skill it grants or modifies (`G` or `M` item), or ''. */
function touchedSkillName(fx: string): string {
  for (const it of parseFx(fx).items) {
    const id = it.k === 'G' ? it.skill : it.k === 'M' ? it.target : '';
    if (id && SKILLS[id]) return SKILLS[id].name;
  }
  return '';
}

/** Icon of a node: the stat icon for P, the granted or modified skill's icon, else the star. */
function nodeIcon(n: TreeNodeDef): string {
  if (n.type === 'P') {
    const stat = n.stat ?? '';
    for (const [re, name] of STAT_ICONS) if (re.test(stat)) return ICON_DIR + name + '.svg';
    return ICON_DIR + 'ui-star.svg';
  }
  const items = parseFx(n.options[0]?.fx ?? '').items;
  const g = items.find((x) => x.k === 'G');
  if (g && g.k === 'G' && SKILLS[g.skill]) return SKILLS[g.skill].icon;
  const m = items.find((x) => x.k === 'M');
  if (m && m.k === 'M' && SKILLS[m.target]) return SKILLS[m.target].icon;
  return ICON_DIR + 'ui-star.svg';
}

/** Why one point cannot be added to node `i` of `sim` (null = it can). Mirrors TalentSystem.canTake without the edit rule. */
function addBlocker(
  tree: TreeDef,
  index: Map<SlotId, number>,
  sim: readonly number[],
  i: number,
  opt: Letter | undefined,
  pool: number,
): string | null {
  const n = tree.nodes[i];
  const cur = sim[i] ?? 0;
  const choice = isChoice(n);
  if (n.type === 'P') {
    if (cur >= 2) return 'Maksimum seviye.';
  } else if (choice) {
    if (cur === (opt === 'B' ? 2 : 1)) return 'Bu seçim zaten alındı.';
  } else if (cur > 0) {
    return 'Bu düğüm zaten alındı.';
  }
  const swap = choice && cur > 0;
  const spent = pointsIn(tree, sim);
  if (!swap && spent >= pool) return 'Boş puan yok.';
  if (cur === 0) {
    if (spent < n.gate) return `Bu sıra için ${n.gate} puan harca (${spent}/${n.gate})`;
    if (n.parents.length && !n.parents.some((p) => (sim[index.get(p) ?? -1] ?? 0) > 0)) return 'Bağlı bir düğüm seçili değil.';
  }
  return null;
}

/**
 * "Yola git" (Ctrl-click, §5.2): the nodes to take, in order, so that node `target` becomes legal. Ancestors of the target
 * come first (lowest row first); other legal nodes fill the gates. Pure: returns null when the free points do not reach it.
 */
function planPath(tree: TreeDef, index: Map<SlotId, number>, vals: readonly number[], target: number, pool: number): number[] | null {
  const sim = vals.slice();
  const anc = new Set<number>();
  const stack: SlotId[] = [...tree.nodes[target].parents];
  while (stack.length) {
    const pi = index.get(stack.pop() as SlotId);
    if (pi === undefined || anc.has(pi)) continue;
    anc.add(pi);
    stack.push(...tree.nodes[pi].parents);
  }
  const steps: number[] = [];
  for (let guard = 0; guard < 64; guard++) {
    const tOpt: Letter | undefined = isChoice(tree.nodes[target]) ? 'A' : undefined;
    if (!addBlocker(tree, index, sim, target, tOpt, pool)) {
      steps.push(target);
      return steps;
    }
    let best = -1;
    let bestKey = Infinity;
    for (let i = 0; i < tree.nodes.length; i++) {
      if (i === target) continue;
      const n = tree.nodes[i];
      // a taken choice is never a filler: addBlocker would call its A <-> B swap legal and change the build for no point
      if (isChoice(n) && (sim[i] ?? 0) > 0) continue;
      if (addBlocker(tree, index, sim, i, isChoice(n) ? 'A' : undefined, pool)) continue;
      const key = (anc.has(i) ? 0 : 1000) + n.row * 10 + i / 100;
      if (key < bestKey) {
        bestKey = key;
        best = i;
      }
    }
    if (best < 0) return null;
    const bn = tree.nodes[best];
    sim[best] = bn.type === 'P' ? (sim[best] ?? 0) + 1 : 1;
    steps.push(best);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* TreeView: one canvas tree                                            */
/* ------------------------------------------------------------------ */

export interface TreeViewHooks {
  /** A staged change happened in this tree (the tab refreshes and tells the shell). */
  changed(): void;
  /** The pointer pressed in this tree: it becomes the keyboard pane. */
  activated(view: TreeView): void;
}

/** One 30-slot tree: `TreeView(kind, hooks)`. The tree and the draft are read from G.talents on every refresh(). */
export class TreeView {
  /** Root of the pane (header, canvas, popover, help line). */
  readonly el: HTMLElement;
  private tree: TreeDef | null = null;
  private index = new Map<SlotId, number>();
  private vals: number[] = [];
  private spent = 0;
  private total = 0;
  private free = 0;
  private state: NodeState[] = [];
  private icons: string[] = [];
  private searchText: string[] = [];
  private query = '';
  private matches = new Set<number>();
  private hover = -1;
  private focusIdx = -1;
  private popIdx = -1;
  private tipKey = '';
  private active = false;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private t = 0;
  private drag: { mx: number; my: number; px: number; py: number; moved: boolean; button: number; shift: boolean; ctrl: boolean } | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private wrap!: HTMLElement;
  private popEl!: HTMLElement;
  private kickerEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private badgeEl!: HTMLElement;
  private ro: ResizeObserver | null = null;

  constructor(readonly kind: TreeKind, private readonly hooks: TreeViewHooks) {
    this.el = this.build();
  }

  private build(): HTMLElement {
    this.kickerEl = h('span.pt-tree-kicker', null, this.kind === 'class' ? 'Sınıf Ağacı' : 'Uzmanlık Ağacı');
    this.titleEl = h('b.pt-tree-name', null, '—');
    this.badgeEl = h('span.pt-tree-free', null, '');
    const fit = button('Sığdır', () => this.resetView(), { variant: 'ghost', cls: 'pt-tree-fit', title: 'Ağacı ekrana sığdır' });
    const head = h('header.pt-tree-phead', null, h('div.pt-tree-ptitle', null, this.kickerEl, this.titleEl), this.badgeEl, fit);
    this.canvas = h('canvas.pt-tree-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.popEl = h('div.pt-tree-pop', { role: 'dialog' });
    this.wrap = h('div.pt-tree-wrap', null, this.canvas, this.popEl);
    const help = h('div.pt-tree-help', null, 'Sol tık: al · Sağ tık: geri al · Shift: 2. derece · Ctrl: yola git · Ok tuşları: gezin');
    const root = h('section.pt-tree-pane', { dataset: { kind: this.kind } }, head, this.wrap, help);
    this.bindPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    return root;
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      const [mx, my] = this.local(e);
      this.drag = { mx, my, px: this.panX, py: this.panY, moved: false, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events have no pointer capture */
      }
      this.hooks.activated(this);
    });
    c.addEventListener('pointermove', (e) => {
      const [mx, my] = this.local(e);
      const d = this.drag;
      if (d) {
        if (!d.moved && Math.hypot(mx - d.mx, my - d.my) > DRAG_PX) d.moved = true;
        if (d.moved && d.button === 0) {
          this.panX = d.px + (mx - d.mx);
          this.panY = d.py + (my - d.my);
          this.clampPan();
          this.hideTip();
        }
        return;
      }
      this.updateHover(mx, my, e.clientX, e.clientY);
    });
    c.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
      if (d && !d.moved) this.click(d.mx, d.my, d.button, d.shift, d.ctrl);
    });
    c.addEventListener('pointercancel', () => {
      this.drag = null;
    });
    c.addEventListener('pointerleave', () => {
      if (this.drag) return;
      this.hover = -1;
      this.hideTip();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [mx, my] = this.local(e);
        this.zoomAt(mx, my, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
  }

  /* ---------------------------------------------------------------- lifecycle */

  /** The tab shows or hides this tree: hidden trees do not draw and drop their popover and tooltip. */
  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.drag = null;
      this.hover = -1;
      this.closePop();
      this.hideTip();
    }
  }

  /** Re-reads the tree, the working values and the node states. Never emits: the tab does that. */
  refresh(): void {
    const T = G.talents;
    const tree = T ? T.tree(this.kind) : null;
    if (tree !== this.tree) this.prepare(tree);
    this.vals = workingValues(this.kind);
    this.total = T ? T.pointsTotal(this.kind) : 0;
    this.spent = tree ? pointsIn(tree, this.vals) : 0;
    this.free = Math.max(0, this.total - this.spent);
    this.computeStates();
    this.updateHeader();
    this.tipKey = '';
    if (this.popIdx >= 0) this.openPop(this.popIdx);
  }

  /** Called every animation frame by the tab while it is visible. */
  frame(t: number): void {
    this.t = t;
    if (this.active) this.draw();
  }

  /** Keeps the canvas bitmap in step with the pane (layout pixels; the transform of the UI scale is handled by local()). */
  resize(): void {
    const W = Math.max(0, this.wrap.clientWidth);
    const H = Math.max(0, this.wrap.clientHeight);
    if (W === this.W && H === this.H) return;
    this.W = W;
    this.H = H;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(W * this.dpr));
    this.canvas.height = Math.max(1, Math.round(H * this.dpr));
    this.clampPan();
    if (this.popIdx >= 0) this.placePop(this.popIdx);
    if (this.active) this.draw();
  }

  private prepare(tree: TreeDef | null): void {
    this.tree = tree;
    this.index = new Map();
    this.icons = [];
    this.searchText = [];
    this.popIdx = -1;
    this.popEl.classList.remove('is-open');
    this.popEl.replaceChildren();
    if (!tree) {
      this.matches = new Set();
      return;
    }
    tree.nodes.forEach((n, i) => {
      this.index.set(n.slot, i);
      this.icons[i] = nodeIcon(n);
      const parts = n.options.map((o) => `${optionTitle(n, o)} ${optionDesc(n, o)}`);
      if (n.stat) parts.push(STAT_INFO[n.stat as StatId]?.name ?? '');
      this.searchText[i] = norm(parts.join(' | '));
    });
    this.applyQuery();
  }

  private computeStates(): void {
    const T = G.talents;
    this.state = [];
    if (!this.tree || !T) return;
    this.tree.nodes.forEach((n, i) => {
      const v = this.vals[i] ?? 0;
      if (v > 0) this.state[i] = 'taken';
      else if (this.spent < n.gate) this.state[i] = 'gated';
      else this.state[i] = T.canTake(this.kind, n.slot).ok ? 'available' : 'blocked';
    });
  }

  private updateHeader(): void {
    this.titleEl.textContent = this.tree ? this.tree.name : this.kind === 'class' ? 'Sınıf' : 'Uzmanlık seçilmedi';
    this.badgeEl.textContent = `Kalan ${this.free}/${this.total}`;
    this.el.classList.toggle('is-pulse', this.free > 0 && this.state.includes('available'));
    this.el.classList.toggle('is-empty', !this.tree);
  }

  /* ---------------------------------------------------------------- search */

  /** Search highlight (GDD_TALENTS §5.2): other nodes dim. Empty text clears it. */
  setQuery(raw: string): void {
    this.query = norm(raw.trim());
    this.applyQuery();
  }

  private applyQuery(): void {
    this.matches = new Set();
    if (!this.query || !this.tree) return;
    this.searchText.forEach((s, i) => {
      if (s.includes(this.query)) this.matches.add(i);
    });
  }

  /** Indices of the matching nodes of this tree, in slot order. */
  matchIndices(): number[] {
    return [...this.matches].sort((a, b) => a - b);
  }

  /* ---------------------------------------------------------------- view */

  /** Fits the whole tree in the pane (zoom 1, centred). */
  resetView(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  private baseScale(): number {
    return Math.min(this.W / (WORLD_X1 - WORLD_X0), this.H / (WORLD_Y1 - WORLD_Y0));
  }

  private scale(): number {
    return this.baseScale() * this.zoom;
  }

  private toScreen(wx: number, wy: number): [number, number] {
    const s = this.scale();
    return [this.W / 2 + this.panX + (wx - WORLD_CX) * s, this.H / 2 + this.panY + (wy - WORLD_CY) * s];
  }

  private toWorld(sx: number, sy: number): [number, number] {
    const s = this.scale() || 1;
    return [WORLD_CX + (sx - this.W / 2 - this.panX) / s, WORLD_CY + (sy - this.H / 2 - this.panY) / s];
  }

  private pos(n: TreeNodeDef): [number, number] {
    return this.toScreen(n.col * COL_W, n.row * ROW_H);
  }

  private radius(n: TreeNodeDef): number {
    const r = clamp(this.scale() * 52, 10, 18);
    if (n.type === 'K') return r * (n.slot === 's30' ? 1.35 : 1.15);
    return r;
  }

  private zoomAt(mx: number, my: number, f: number): void {
    const [wx, wy] = this.toWorld(mx, my);
    this.zoom = clamp(this.zoom * f, ZOOM_MIN, ZOOM_MAX);
    const s = this.scale();
    this.panX = mx - this.W / 2 - (wx - WORLD_CX) * s;
    this.panY = my - this.H / 2 - (wy - WORLD_CY) * s;
    this.clampPan();
  }

  private clampPan(): void {
    const s = this.scale();
    const lx = this.W / 2 + ((WORLD_X1 - WORLD_X0) * s) / 2;
    const ly = this.H / 2 + ((WORLD_Y1 - WORLD_Y0) * s) / 2;
    this.panX = clamp(this.panX, -lx, lx);
    this.panY = clamp(this.panY, -ly, ly);
  }

  /** Pans so that a node is in view (keyboard focus, search). */
  private ensureVisible(i: number): void {
    const n = this.tree?.nodes[i];
    if (!n || this.W <= 0) return;
    const [x, y] = this.pos(n);
    const r = this.radius(n) + 8;
    if (x >= r && x <= this.W - r && y >= r && y <= this.H - r) return;
    const s = this.scale();
    this.panX = -(n.col * COL_W - WORLD_CX) * s;
    this.panY = -(n.row * ROW_H - WORLD_CY) * s;
    this.clampPan();
  }

  /** Screen position relative to the canvas, independent of CSS transforms (UI scale). */
  private local(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return [0, 0];
    return [(e.clientX - r.left) * (this.W / r.width), (e.clientY - r.top) * (this.H / r.height)];
  }

  /* ---------------------------------------------------------------- drawing */

  private draw(): void {
    const ctx = this.ctx;
    if (this.W <= 0 || this.H <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.globalAlpha = 1;
    const tree = this.tree;
    if (!tree) {
      ctx.fillStyle = PALE;
      ctx.font = '600 14px Cinzel, Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.kind === 'spec' ? 'Bir uzmanlık seç' : 'Sınıf ağacı yok', this.W / 2, this.H / 2);
      ctx.textAlign = 'start';
      return;
    }
    this.drawGates(ctx);
    this.drawLinks(ctx, tree);
    tree.nodes.forEach((n, i) => this.drawNode(ctx, n, i));
    ctx.globalAlpha = 1;
  }

  /** Gate bars between two rows: gold once the tree's spent points reach the gate, grey before. */
  private drawGates(ctx: CanvasRenderingContext2D): void {
    for (let row = 1; row < GATES.length; row++) {
      const g = GATES[row];
      const wy = row * ROW_H - ROW_H / 2;
      const [x0, y] = this.toScreen(WORLD_X0 + 30, wy);
      const [x1] = this.toScreen(WORLD_X1 - 30, wy);
      const open = this.spent >= g;
      ctx.globalAlpha = this.query ? 0.45 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = open ? GOLD : IRON;
      ctx.lineWidth = open ? 3 : 2;
      ctx.stroke();
      if (open) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.strokeStyle = 'rgba(255,240,190,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = open ? GOLD_LIGHT : IRON_DIM;
      for (const x of [x0, x1]) {
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      const [cx] = this.toScreen(WORLD_CX, wy);
      const text = `${g} puan`;
      ctx.font = '600 10px Cinzel, Georgia, serif';
      const tw = ctx.measureText(text).width + 10;
      ctx.fillStyle = 'rgba(10,7,4,0.92)';
      ctx.fillRect(cx - tw / 2, y - 7, tw, 14);
      ctx.strokeStyle = open ? GOLD : IRON;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - tw / 2 + 0.5, y - 6.5, tw - 1, 13);
      ctx.fillStyle = open ? GOLD_LIGHT : PALE;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, y + 0.5);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.globalAlpha = 1;
  }

  /** Links from each node to its parents: gold when both ends are taken, pale from a taken parent, iron otherwise. */
  private drawLinks(ctx: CanvasRenderingContext2D, tree: TreeDef): void {
    ctx.setLineDash([]);
    for (let i = 0; i < tree.nodes.length; i++) {
      const n = tree.nodes[i];
      const [x2, y2] = this.pos(n);
      const v = this.vals[i] ?? 0;
      for (const p of n.parents) {
        const pi = this.index.get(p);
        if (pi === undefined) continue;
        const [x1, y1] = this.pos(tree.nodes[pi]);
        const pv = this.vals[pi] ?? 0;
        ctx.globalAlpha = this.query && !this.matches.has(i) ? 0.25 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        if (pv > 0 && v > 0) {
          ctx.strokeStyle = GOLD;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.save();
          ctx.strokeStyle = 'rgba(255,240,190,0.8)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 12]);
          ctx.lineDashOffset = -this.t * 30;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = pv > 0 ? 'rgba(205,189,150,0.55)' : 'rgba(58,51,40,0.9)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawNode(ctx: CanvasRenderingContext2D, n: TreeNodeDef, i: number): void {
    const [x, y] = this.pos(n);
    const r = this.radius(n);
    const st = this.state[i] ?? 'blocked';
    const v = this.vals[i] ?? 0;
    const base = this.query && !this.matches.has(i) ? 0.22 : 1;
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 4));

    // taken: a warm glow behind the node (a capstone glows brighter)
    if (st === 'taken') {
      const g = glowSprite(GOLD);
      const gs = r * 3.4;
      ctx.globalAlpha = base * (n.type === 'K' ? 0.5 : 0.28);
      ctx.drawImage(g, x - gs / 2, y - gs / 2, gs, gs);
    }

    // fill, then the taken half(s) of a choice
    nodePath(ctx, n.type, x, y, r);
    ctx.globalAlpha = base;
    ctx.fillStyle = st === 'taken' ? 'rgba(232,194,90,0.22)' : STONE;
    ctx.fill();
    if (isChoice(n)) {
      for (const [half, opt, color] of [
        [0, 1, GOLD],
        [1, 2, RUNE],
      ] as const) {
        if (v !== opt) continue;
        ctx.save();
        nodePath(ctx, n.type, x, y, r);
        ctx.clip();
        ctx.globalAlpha = base * 0.55;
        ctx.fillStyle = color;
        ctx.fillRect(half === 0 ? x - r - 2 : x, y - r - 2, r + 2, 2 * r + 4);
        ctx.restore();
      }
      ctx.globalAlpha = base;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.strokeStyle = 'rgba(205,189,150,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // outline by state: taken gold, available pale and pulsing, gated and blocked iron
    nodePath(ctx, n.type, x, y, r);
    ctx.lineWidth = st === 'taken' ? 2 : 1.5;
    ctx.strokeStyle = st === 'taken' ? GOLD : st === 'available' ? PALE : IRON;
    ctx.globalAlpha = base * (st === 'available' ? pulse : st === 'blocked' ? 0.6 : 1);
    ctx.stroke();

    // icon, tinted by state
    const src = this.icons[i];
    const ic = src ? tintedIcon(src, st === 'taken' ? GOLD_LIGHT : st === 'available' ? PALE : IRON_DIM) : null;
    if (ic) {
      const s = r * (n.type === 'P' ? 1.1 : 1.3);
      ctx.globalAlpha = base * (st === 'blocked' ? 0.55 : st === 'gated' ? 0.5 : 1);
      ctx.drawImage(ic, x - s / 2, y - s / 2, s, s);
    }
    if (st === 'gated') {
      const lock = tintedIcon(ICON_DIR + 'ui-lock.svg', '#a89a7a');
      if (lock) {
        const s = r * 0.9;
        ctx.globalAlpha = base;
        ctx.drawImage(lock, x + r * 0.5 - s / 2, y - r * 0.55 - s / 2, s, s);
      }
    }

    // rank pips of a palette node
    if (n.type === 'P') {
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.arc(x + (k ? 4.5 : -4.5), y + r + 5, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = v > k ? GOLD : IRON;
        ctx.globalAlpha = base;
        ctx.fill();
      }
    }

    // a taken capstone turns its eight rays
    if (n.type === 'K' && st === 'taken') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.t * 0.5);
      ctx.strokeStyle = 'rgba(255,220,120,0.55)';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = base;
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25);
        ctx.lineTo(Math.cos(a) * r * 1.75, Math.sin(a) * r * 1.75);
        ctx.stroke();
      }
      ctx.restore();
    }

    // hover and keyboard focus rings
    if (i === this.hover) {
      nodePath(ctx, n.type, x, y, r + 3);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,243,196,0.75)';
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
    if (i === this.focusIdx && this.active) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      nodePath(ctx, n.type, x, y, r + 6);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = FOCUS;
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- hit tests */

  private nodeAt(mx: number, my: number): number {
    if (!this.tree) return -1;
    let best = -1;
    let bestD = Infinity;
    this.tree.nodes.forEach((n, i) => {
      const [x, y] = this.pos(n);
      const r = this.radius(n) + 4;
      const d = Math.hypot(mx - x, my - y);
      if (d <= r && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** Row of the gate bar under the pointer (6 px band), or -1. */
  private gateAt(mx: number, my: number): number {
    for (let row = 1; row < GATES.length; row++) {
      const wy = row * ROW_H - ROW_H / 2;
      const [x0, y] = this.toScreen(WORLD_X0 + 30, wy);
      const [x1] = this.toScreen(WORLD_X1 - 30, wy);
      if (mx >= x0 && mx <= x1 && Math.abs(my - y) <= 6) return row;
    }
    return -1;
  }

  /* ---------------------------------------------------------------- tooltips */

  private kindLabel(): string {
    return `${this.kind === 'class' ? 'Sınıf Ağacı' : 'Uzmanlık Ağacı'}${this.tree ? ' · ' + this.tree.name : ''}`;
  }

  private updateHover(mx: number, my: number, cx: number, cy: number): void {
    const i = this.nodeAt(mx, my);
    const g = i < 0 ? this.gateAt(mx, my) : -1;
    this.hover = i;
    this.canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
    if (i < 0 && g < 0) {
      this.hideTip();
      return;
    }
    const key = i >= 0 ? `n${i}:${this.vals[i]}:${this.state[i]}:${this.spent}` : `g${g}:${this.spent}`;
    if (key !== this.tipKey) {
      this.tipKey = key;
      tip.show(i >= 0 ? this.nodeTip(i) : this.gateTip(g), cx, cy, 'pt-tree-tip');
    } else {
      tip.move(cx, cy);
    }
  }

  private hideTip(): void {
    this.tipKey = '';
    tip.hide();
  }

  private gateTip(row: number): string {
    const g = GATES[row];
    const ok = this.spent >= g;
    return (
      `<div class="pg-ttip-name" style="color:${ok ? GOLD_LIGHT : PALE}">Kapı · ${g} puan</div>` +
      `<div class="pg-ttip-kind">${esc(this.kindLabel())}</div>` +
      (ok ? `<div class="pt-tt-ok">Kapı açık (${this.spent}/${g})</div>` : `<div class="pt-tt-gate">Bu sıra için ${g} puan harca (${this.spent}/${g})</div>`)
    );
  }

  /** Node tooltip (GDD_TALENTS §5.2): kind, name, rank or both options, effect, gate line, blocked reason, hints. */
  private nodeTip(i: number): string {
    const T = G.talents;
    const n = this.tree?.nodes[i];
    if (!T || !n) return '';
    const v = this.vals[i] ?? 0;
    const st = this.state[i];
    const out: string[] = [];
    const titleColor = st === 'taken' ? GOLD_LIGHT : st === 'available' ? PALE : '#8c7f66';
    const choice = isChoice(n);
    const title = choice ? TYPE_NAMES[n.type] : optionTitle(n, n.options[0]);
    out.push(`<div class="pg-ttip-name" style="color:${titleColor}">${esc(title)}</div>`);
    out.push(`<div class="pg-ttip-kind">${esc(this.kindLabel())} · ${esc(TYPE_NAMES[n.type])}</div>`);
    if (n.type === 'P') out.push(`<div class="pg-ttip-stats">Derece ${v}/2</div>`);
    if (choice) {
      n.options.forEach((o, k) => {
        const on = v === k + 1;
        out.push(
          `<div class="pt-tt-opt${on ? ' is-taken' : ''}"><b>${k === 0 ? 'A' : 'B'} · ${esc(optionTitle(n, o))}</b>` +
            `<span>${esc(optionDesc(n, o))}</span>${k === 0 ? '<em>Önerilen</em>' : ''}</div>`,
        );
      });
    } else {
      const desc = optionDesc(n, n.options[0]);
      if (desc) out.push(`<div class="pt-tt-desc">${esc(desc)}</div>`);
      const g = grantOf(n.options[0]?.fx ?? '');
      const def = g ? (SKILLS[g] as SkillDef | undefined) : undefined;
      if (n.type === 'A' && def) {
        let html = '';
        try {
          html = G.ui?.skillTooltipHTML(def) ?? '';
        } catch {
          html = '';
        }
        if (html) out.push(`<div class="pt-tt-skill">${html}</div>`);
      }
    }
    if (st === 'taken') {
      out.push(`<div class="pt-tt-ok">${choice ? `Seçilen: ${v === 2 ? 'B' : 'A'}` : 'Alındı'}</div>`);
    } else if (this.spent < n.gate) {
      out.push(`<div class="pt-tt-gate">Bu sıra için ${n.gate} puan harca (${this.spent}/${n.gate})</div>`);
    } else if (st === 'blocked') {
      const reason = T.canTake(this.kind, n.slot).reason;
      if (reason) out.push(`<div class="pt-tt-block">${esc(reason)}</div>`);
    }
    out.push(
      `<div class="pt-tt-hint">${choice ? 'Sol tık: A | B seç' : 'Sol tık: al'} · Sağ tık: geri al · Shift: 2. derece · Ctrl: yola git</div>`,
    );
    return out.join('');
  }

  /* ---------------------------------------------------------------- actions */

  private refused(reason: string | null): void {
    sfx('ui_error', 0.6);
    toast(reason || 'Bu işlem yapılamadı.', 'warning');
  }

  private click(mx: number, my: number, button: number, shift: boolean, ctrl: boolean): void {
    const T = G.talents;
    if (!T || !this.tree) return;
    const i = this.nodeAt(mx, my);
    if (i < 0) {
      this.closePop();
      return;
    }
    this.focusIdx = i;
    if (button === 2) {
      this.remove(i);
      return;
    }
    const n = this.tree.nodes[i];
    const st = this.state[i];
    if (ctrl && st !== 'taken' && st !== 'available') {
      this.takePath(i);
      return;
    }
    if (isChoice(n)) {
      if (this.popIdx === i) this.closePop();
      else this.openPop(i);
      return;
    }
    this.take(i, undefined, shift && n.type === 'P');
  }

  /** Adds a point (or a choice option) to a node of the draft. `again` takes the second rank of a palette node (Shift). */
  private take(i: number, opt?: Letter, again = false): boolean {
    const T = G.talents;
    const n = this.tree?.nodes[i];
    if (!T || !n) return false;
    if (!T.take(this.kind, n.slot, opt)) {
      this.refused(T.lastReason);
      return false;
    }
    if (again) T.take(this.kind, n.slot, opt);
    this.closePop();
    if (n.type === 'K') sfx('talent_capstone', 0.9);
    else sfx('talent_take', 0.7);
    this.hooks.changed();
    return true;
  }

  /** Removes one point (right-click, Backspace). Refused with the §2.3 reason when dependants exist. */
  private remove(i: number): void {
    const T = G.talents;
    const n = this.tree?.nodes[i];
    if (!T || !n || (this.vals[i] ?? 0) === 0) return;
    if (!T.untake(this.kind, n.slot)) {
      this.refused(T.lastReason);
      return;
    }
    this.closePop();
    sfx('talent_untake', 0.7);
    this.hooks.changed();
  }

  /** Ctrl-click on a locked node: stages the shortest legal chain that unlocks it, if the free points reach it. */
  private takePath(i: number): void {
    const T = G.talents;
    const tree = this.tree;
    if (!T || !tree) return;
    if (!T.specId) {
      this.refused('Önce bir uzmanlık seç.');
      return;
    }
    const edit = T.canEditHere();
    if (!edit.add) {
      this.refused(edit.reason ?? null);
      return;
    }
    const steps = planPath(tree, this.index, this.vals, i, T.pointsTotal(this.kind));
    if (!steps) {
      this.refused('Yolu açmak için yeterli boş puan yok.');
      return;
    }
    this.closePop();
    let done = 0;
    for (const s of steps) {
      const n = tree.nodes[s];
      if (!T.take(this.kind, n.slot, isChoice(n) ? 'A' : undefined)) {
        this.refused(T.lastReason);
        break;
      }
      done++;
    }
    if (done > 0) {
      sfx('talent_take', 0.6);
      toast(`Yol taslağa eklendi: ${done} puan. Uygula ile onaylanır.`, 'info');
    }
    this.hooks.changed();
  }

  /* ---------------------------------------------------------------- A | B popover */

  private openPop(i: number): void {
    const T = G.talents;
    const n = this.tree?.nodes[i];
    if (!T || !n || !isChoice(n)) {
      this.closePop();
      return;
    }
    this.popIdx = i;
    const v = this.vals[i] ?? 0;
    const head = h('div.pt-tree-pop-head', null, h('b', null, TYPE_NAMES[n.type]), h('span', null, 'Bir seçim yap'));
    const rows = n.options.map((o, k) => {
      const letter: Letter = k === 0 ? 'A' : 'B';
      const on = v === k + 1;
      const check = on ? null : T.canTake(this.kind, n.slot, letter);
      const can = on || (check?.ok ?? false);
      const btn = h(
        'button.pt-tree-opt',
        { type: 'button', disabled: on || !can, title: on ? 'Alındı' : can ? '' : check?.reason ?? '' },
        h('i.pt-tree-opt-letter', null, letter),
        h(
          'span.pt-tree-opt-body',
          null,
          h('b', null, optionTitle(n, o)),
          h('small', null, optionDesc(n, o)),
          touchedSkillName(o.fx) ? h('small.pt-tree-opt-skill', null, `Beceri: ${touchedSkillName(o.fx)}`) : null,
        ),
        k === 0 ? h('i.pt-tree-rec', { title: 'Önerilen' }) : null,
      ) as HTMLButtonElement;
      btn.classList.add(letter === 'A' ? 'is-a' : 'is-b');
      if (on) btn.classList.add('is-taken');
      btn.addEventListener('click', () => this.take(i, letter));
      return btn;
    });
    this.popEl.replaceChildren(head, ...rows);
    this.popEl.classList.add('is-open');
    this.placePop(i);
  }

  private placePop(i: number): void {
    const n = this.tree?.nodes[i];
    if (!n) return;
    const [x, y] = this.pos(n);
    const r = this.radius(n);
    const pw = this.popEl.offsetWidth || 240;
    const ph = this.popEl.offsetHeight || 150;
    let top = y + r + 10;
    if (top + ph > this.H - 6) top = y - r - 10 - ph;
    this.popEl.style.left = `${clamp(x - pw / 2, 6, Math.max(6, this.W - pw - 6))}px`;
    this.popEl.style.top = `${clamp(top, 6, Math.max(6, this.H - ph - 6))}px`;
  }

  closePop(): void {
    this.popIdx = -1;
    this.popEl.classList.remove('is-open');
    this.popEl.replaceChildren();
  }

  /* ---------------------------------------------------------------- keyboard and focus */

  /** Focus moves to a node by slot id (openPanel('talents', { focus })). Unknown ids are ignored. */
  focusSlot(slot: SlotId): void {
    const i = this.index.get(slot);
    if (i === undefined) return;
    this.focusIdx = i;
    this.ensureVisible(i);
  }

  /** The first node that can be taken (or is taken), else the first slot. */
  private firstFocus(): number {
    let i = this.state.indexOf('available');
    if (i < 0) i = this.state.indexOf('taken');
    return i < 0 ? 0 : i;
  }

  /** Arrow keys: the nearest node in that direction (rows and columns of the shared layout). */
  moveFocus(dir: Dir): void {
    const tree = this.tree;
    if (!tree) return;
    if (this.focusIdx < 0) {
      this.focusIdx = this.firstFocus();
      this.ensureVisible(this.focusIdx);
      return;
    }
    const c = tree.nodes[this.focusIdx];
    let best = -1;
    let score = Infinity;
    tree.nodes.forEach((n, j) => {
      if (j === this.focusIdx) return;
      const dx = n.col - c.col;
      const dy = n.row - c.row;
      const [p, q] =
        dir === 'right' ? [dx, dy] : dir === 'left' ? [-dx, dy] : dir === 'down' ? [dy, dx] : [-dy, dx];
      if (p <= 0) return;
      const s = p + Math.abs(q) * 0.8;
      if (s < score) {
        score = s;
        best = j;
      }
    });
    if (best >= 0) {
      this.focusIdx = best;
      this.ensureVisible(best);
    }
  }

  /** Space / Enter: a choice opens its popover, any other node takes a point. */
  keyTake(): void {
    if (!this.tree) return;
    if (this.focusIdx < 0) {
      this.focusIdx = this.firstFocus();
      this.ensureVisible(this.focusIdx);
      return;
    }
    if (isChoice(this.tree.nodes[this.focusIdx])) {
      if (this.popIdx === this.focusIdx) this.closePop();
      else this.openPop(this.focusIdx);
    } else {
      this.take(this.focusIdx);
    }
  }

  /** A / B on a focused choice takes that option. */
  keyOpt(letter: Letter): void {
    if (this.focusedIsChoice()) this.take(this.focusIdx, letter);
  }

  focusedIsChoice(): boolean {
    const n = this.tree?.nodes[this.focusIdx];
    return !!n && isChoice(n);
  }

  /** Backspace: removes one point of the focused node. */
  keyRemove(): void {
    if (this.focusIdx >= 0) this.remove(this.focusIdx);
  }

  /** Escape closes an open popover. Returns true when it did (the caller then keeps the window open). */
  keyEscape(): boolean {
    if (this.popIdx < 0) return false;
    this.closePop();
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* TreeTab: the whole tab 1                                             */
/* ------------------------------------------------------------------ */

/** Dialog hooks of the loadout bar (T14 plugs its dialogs in here). Without a hook the default action runs. */
export interface TreeTabHooks {
  /** Spec pick. Default: a confirm and setSpec. 'choose' on the first pick, 'switch' afterwards. */
  chooseSpec?(specId: SpecId, mode: 'choose' | 'switch'): void;
  /** Kaydet. Default: saves the working build as "Yapı N". */
  saveLoadout?(): void;
  /** Düzenle (rename, delete, duplicate). The button is shown only with this hook. */
  loadoutMenu?(loadoutId: string): void;
  /** Önerilen. Default: stages autoBuild of both trees. */
  recommended?(): void;
  /** Sıfırla. Default: askConfirm and reset(). */
  reset?(): void;
  /** Dışa Aktar. Default: copies the build string to the clipboard. */
  exportDialog?(): void;
  /** İçe Aktar. Without this hook the button is disabled. */
  importDialog?(): void;
}

function nameOf(id: SpecId | string): string {
  return treeOf('spec', id)?.name ?? id;
}

/** Why a spec switch is refused (GDD_TALENTS §2.4 / §5.6): the rest-zone line, or the combat / dungeon reason as given. */
function switchReason(edit: { reason?: string }): string {
  const r = edit.reason ?? '';
  if (!r || r.startsWith('Şehir/köy dışında')) return 'Uzmanlığı değiştirmek için şehir veya köyde ol.';
  return r;
}

/** Tab 1 of the `N` window: `TreeTab` implements TalentTab (the shell builds it once and drives it). */
export class TreeTab implements TalentTab {
  readonly id: TalentTabId = 'tree';
  readonly label = 'Uzmanlık & Yetenekler';
  /** Root of the tab: the shell shows and hides it. */
  readonly el: HTMLElement;
  private active = false;
  private raf = 0;
  private views!: Record<TreeKind, TreeView>;
  private focusKind: TreeKind = 'class';
  private stacked = false;
  private stackKind: TreeKind = 'class';
  private loadPick = 'active';
  private chipsEl!: HTMLElement;
  private loadSel!: HTMLSelectElement;
  private btn!: Record<'load' | 'save' | 'rec' | 'menu' | 'reset' | 'exp' | 'imp', HTMLButtonElement>;
  private picker!: HTMLElement;
  private grid!: HTMLElement;
  private stackBar!: HTMLElement;
  private stackBtns!: Record<TreeKind, HTMLButtonElement>;
  private searchInput!: HTMLInputElement;
  private searchCount!: HTMLElement;
  private matchList: { kind: TreeKind; idx: number }[] = [];
  private matchPos = -1;
  private ro: ResizeObserver | null = null;
  private readonly onKeyFn = (e: KeyboardEvent): void => this.onKey(e);
  private readonly loop = (t: number): void => {
    if (!this.active) {
      this.raf = 0;
      return;
    }
    this.views.class.frame(t / 1000);
    this.views.spec.frame(t / 1000);
    this.raf = requestAnimationFrame(this.loop);
  };

  constructor(
    private readonly modalHost: () => HTMLElement,
    private readonly hooks: TreeTabHooks = {},
  ) {
    const hook: TreeViewHooks = {
      changed: () => this.changed(),
      activated: (v) => {
        this.focusKind = v.kind;
      },
    };
    this.views = { class: new TreeView('class', hook), spec: new TreeView('spec', hook) };
    this.el = h('div.pt-tab-tree');
    this.build();
  }

  private build(): void {
    this.chipsEl = h('div.pt-tree-chips');
    const chipRow = h('div.pt-tree-chiprow', null, h('span.pt-tree-lbl', null, 'Uzmanlık'), this.chipsEl);

    this.loadSel = h('select.pt-tree-loadsel', { title: 'Bu uzmanlığın kayıtlı yapıları' }) as HTMLSelectElement;
    this.loadSel.addEventListener('change', () => {
      this.loadPick = this.loadSel.value;
      this.renderButtons();
    });
    this.btn = {
      load: button('Yükle', () => this.loadSelected(), { variant: 'ghost', title: 'Seçili yapıyı taslağa yükle (şehir veya köy)' }),
      save: button('Kaydet', () => this.saveCurrent(), { variant: 'ghost', title: 'Taslağı adlı bir yapı olarak kaydet' }),
      rec: button('Önerilen', () => this.recommended(), { variant: 'ghost', title: 'İki ağacı otomatik doldur (taslak)' }),
      menu: button('Düzenle', () => this.hooks.loadoutMenu?.(this.loadPick), { variant: 'ghost', title: 'Yeniden adlandır, sil veya çoğalt' }),
      reset: button('Sıfırla', () => this.reset(), { variant: 'danger', title: 'Bu uzmanlığın iki ağacını taslakta sıfırla' }),
      exp: button('Dışa Aktar', () => this.exportBuild(), { variant: 'ghost', title: 'Yapı dizesini panoya kopyala' }),
      imp: button('İçe Aktar', () => this.hooks.importDialog?.(), { variant: 'ghost', title: 'Yapı dizesini yapıştır' }),
    };
    this.searchInput = h('input.pg-search', {
      type: 'text',
      placeholder: 'Ara… (kritik, ateş topu)',
      maxLength: 32,
      spellcheck: false,
    }) as HTMLInputElement;
    this.searchCount = h('span.pg-search-count', null, '');
    this.searchInput.addEventListener('input', () => this.onSearch());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.cycleMatch(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        if (this.searchInput.value) {
          e.stopPropagation();
          this.searchInput.value = '';
          this.onSearch();
        }
        this.searchInput.blur();
      }
    });
    const searchBox = h('div.pg-search-box.pt-tree-search', null, h('span.pg-search-ico', null, '⌕'), this.searchInput, this.searchCount);
    const loadRow = h(
      'div.pt-tree-loadout',
      null,
      h('span.pt-tree-lbl', null, 'Yapı'),
      this.loadSel,
      this.btn.load,
      this.btn.save,
      this.btn.rec,
      this.btn.menu,
      h('span.pt-tree-sep'),
      this.btn.reset,
      this.btn.exp,
      this.btn.imp,
      h('span.pt-tree-sp'),
      searchBox,
    );

    this.stackBtns = {
      class: button('Sınıf', () => this.stackTo('class'), { variant: 'ghost', cls: 'pt-tree-stackbtn' }),
      spec: button('Uzmanlık', () => this.stackTo('spec'), { variant: 'ghost', cls: 'pt-tree-stackbtn' }),
    };
    this.stackBar = h('div.pt-tree-stack', null, this.stackBtns.class, this.stackBtns.spec);
    this.picker = h('div.pt-tree-picker');
    this.grid = h('div.pt-tree-grid', null, this.views.class.el, this.views.spec.el);
    this.el.append(chipRow, loadRow, this.stackBar, this.picker, this.grid);
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.el);
  }

  /* ---------------------------------------------------------------- lifecycle (TalentTab) */

  /** Shown: start the frame loop and the keyboard, and read the talents. */
  onShow(): void {
    this.active = true;
    window.addEventListener('keydown', this.onKeyFn, true);
    this.views.class.setActive(true);
    this.views.spec.setActive(true);
    this.render();
    this.onResize();
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  /** Hidden: stop the frame loop and the keyboard, drop the tooltip and the popover. */
  onHide(): void {
    this.active = false;
    window.removeEventListener('keydown', this.onKeyFn, true);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.views.class.setActive(false);
    this.views.spec.setActive(false);
    tip.hide();
  }

  /** Re-reads the trees, the chips and the loadout bar (called by the shell on talent events while visible). */
  refresh(): void {
    if (this.active) this.render();
  }

  /** The tree tab has staged changes when the draft differs from the committed build (the shell also asks G.talents). */
  hasDraft(): boolean {
    const d = G.talents?.diff();
    return !!d && d.added.length + d.removed.length > 0;
  }

  /** openPanel('talents', { tab: 'tree', focus }): `class:<slot>` / `spec:<slot>` or a bare slot id (the spec tree first). */
  focus(id: string): void {
    let kind: TreeKind = G.talents?.specId ? 'spec' : 'class';
    let slot = id;
    if (id.startsWith('class:')) {
      kind = 'class';
      slot = id.slice(6);
    } else if (id.startsWith('spec:')) {
      kind = 'spec';
      slot = id.slice(5);
    }
    this.stackTo(kind);
    this.views[kind].focusSlot(slot as SlotId);
  }

  /* ---------------------------------------------------------------- layout */

  private onResize(): void {
    const w = this.el.clientWidth;
    const stacked = w > 0 && w < STACK_BELOW_PX;
    if (stacked !== this.stacked) {
      this.stacked = stacked;
      this.el.classList.toggle('is-stacked', stacked);
    }
    this.applyStack();
  }

  /** Stacked layout: only the chosen tree is shown (the others are display:none through CSS). */
  private applyStack(): void {
    this.views.class.el.classList.toggle('is-current', this.stackKind === 'class');
    this.views.spec.el.classList.toggle('is-current', this.stackKind === 'spec');
    this.stackBtns.class.classList.toggle('is-active', this.stackKind === 'class');
    this.stackBtns.spec.classList.toggle('is-active', this.stackKind === 'spec');
  }

  private stackTo(kind: TreeKind): void {
    this.stackKind = kind;
    this.focusKind = kind;
    this.applyStack();
  }

  /* ---------------------------------------------------------------- render */

  private render(): void {
    const T = G.talents;
    const spec = G.character && T ? T.specId : null;
    this.renderChips(spec);
    this.renderLoadout(spec);
    const hasSpec = !!spec;
    this.picker.style.display = hasSpec ? 'none' : '';
    this.grid.style.display = hasSpec ? '' : 'none';
    if (!hasSpec) this.renderPicker();
    this.views.class.refresh();
    this.views.spec.refresh();
    this.applyStack();
  }

  /** Spec chips of the class: the active one is marked; a click picks or switches (rest zone for a switch). */
  private renderChips(spec: SpecId | null): void {
    const char = G.character;
    const T = G.talents;
    const kids: HTMLElement[] = [];
    if (char && T) {
      const edit = T.canEditHere();
      for (const id of specsOfClass(char.classId)) {
        const on = id === spec;
        const blocked = !on && (spec ? !edit.remove : !edit.add);
        const reason = blocked ? (spec ? switchReason(edit) : edit.reason ?? '') : '';
        const role = getSpec(id)?.role ?? '';
        const chip = button(nameOf(id), () => {
          if (!on) this.chooseSpec(id, spec ? 'switch' : 'choose');
        }, { variant: 'ghost', cls: 'pt-tree-chip', disabled: blocked, title: reason });
        chip.prepend(h('i.pt-tree-chip-dot'));
        chip.classList.toggle('is-active', on);
        chip.style.setProperty('--role', ROLE_COLORS[role] ?? GOLD);
        kids.push(chip);
      }
    }
    this.chipsEl.replaceChildren(...kids);
  }

  /** Loadout selector and its buttons. Loading and import need a rest zone (the Apply would not stage them otherwise). */
  private renderLoadout(spec: SpecId | null): void {
    const T = G.talents;
    const list = spec && T ? T.savedLoadouts() : [];
    const opts: HTMLOptionElement[] = [h('option', { value: 'active' }, 'Aktif') as HTMLOptionElement];
    for (const l of list) opts.push(h('option', { value: l.id }, l.name) as HTMLOptionElement);
    this.loadSel.replaceChildren(...opts);
    if (this.loadPick !== 'active' && !list.some((l) => l.id === this.loadPick)) this.loadPick = 'active';
    this.loadSel.value = this.loadPick;
    this.loadSel.disabled = !spec;
    this.renderButtons();
  }

  private renderButtons(): void {
    const T = G.talents;
    const spec = T?.specId ?? null;
    const edit = T ? T.canEditHere() : null;
    const count = spec && T ? T.loadoutCount() : 0;
    this.btn.load.disabled = !spec || !edit?.remove || this.loadPick === 'active';
    this.btn.load.title = edit?.remove ? 'Seçili yapıyı taslağa yükle' : edit?.reason ?? 'Yapı yalnızca şehir veya köyde yüklenebilir.';
    this.btn.save.disabled = !spec || count >= MAX_SAVED_LOADOUTS;
    this.btn.save.title = count >= MAX_SAVED_LOADOUTS ? `En fazla ${MAX_SAVED_LOADOUTS} kayıt` : 'Taslağı adlı bir yapı olarak kaydet';
    this.btn.rec.disabled = !spec;
    this.btn.menu.style.display = this.hooks.loadoutMenu ? '' : 'none';
    this.btn.menu.disabled = !spec || this.loadPick === 'active';
    this.btn.reset.disabled = !spec;
    this.btn.exp.disabled = !spec;
    this.btn.imp.disabled = !spec || !edit?.remove || !this.hooks.importDialog;
  }

  /** The spec picker (GDD_TALENTS §5.6 step 1): 2–3 cards of the class, shown until a spec is chosen. */
  private renderPicker(): void {
    const char = G.character;
    const T = G.talents;
    if (!char || !T) {
      this.picker.replaceChildren(h('p', null, char ? 'Uzmanlık sistemi hazır değil.' : 'Karakter seçilmedi.'));
      return;
    }
    const edit = T.canEditHere();
    const cards = specsOfClass(char.classId).map((id) => this.card(id, char.classId, edit.add, edit.reason));
    this.picker.replaceChildren(
      h(
        'div.pt-tree-picker-head',
        null,
        h('b', null, 'Bir uzmanlık seç'),
        h('span', null, 'Uzmanlık bir kez seçilir. Sonradan değiştirmek için şehir veya köyde olman gerekir.'),
      ),
      h('div.pt-tree-cards', null, ...cards),
    );
  }

  private card(id: SpecId, classId: ClassId, canAdd: boolean, reason?: string): HTMLElement {
    const sd = getSpec(id);
    const tree = treeOf('spec', id);
    const role = sd?.role;
    const sigs = (SIGNATURE_SKILLS[classId] ?? [])
      .map((sk) => SKILLS[sk] as SkillDef | undefined)
      .filter((d): d is SkillDef => !!d);
    const sigIcons = sigs.map((d) => {
      const im = icon(d.icon, 'pt-tree-card-ico');
      im.title = d.name;
      return im;
    });
    const card = h(
      'article.pt-tree-card',
      { dataset: { spec: id } },
      h('span.pt-tree-card-role', null, role ? `Rol: ${ROLE_TR[role]}` : ''),
      h('h4', null, tree?.name ?? id),
      h('p', null, sd?.desc ?? ''),
      h('div.pt-tree-card-skills', null, ...sigIcons),
      button('Uzmanlığı Seç', () => this.chooseSpec(id, 'choose'), {
        variant: 'primary',
        disabled: !canAdd,
        title: canAdd ? '' : reason ?? '',
      }),
    );
    card.style.setProperty('--role', ROLE_COLORS[role ?? ''] ?? GOLD);
    return card;
  }

  /* ---------------------------------------------------------------- actions */

  private refused(reason: string | null): void {
    sfx('ui_error', 0.6);
    toast(reason || 'Bu işlem yapılamadı.', 'warning');
  }

  /** A spec pick or switch: through the Dialogs hook, else a confirm and setSpec. */
  private chooseSpec(id: SpecId, mode: 'choose' | 'switch'): void {
    const T = G.talents;
    if (!T) return;
    const edit = T.canEditHere();
    if (mode === 'choose' && !edit.add) {
      this.refused(edit.reason ?? 'Şu an uzmanlık seçilemez.');
      return;
    }
    if (mode === 'switch' && !edit.remove) {
      this.refused(switchReason(edit));
      return;
    }
    if (mode === 'switch' && this.hasDraft()) {
      this.refused('Önce taslağı uygula veya geri al.');
      return;
    }
    if (this.hooks.chooseSpec) {
      this.hooks.chooseSpec(id, mode);
      return;
    }
    const cur = T.specId;
    const name = nameOf(id);
    const text =
      mode === 'switch' && cur
        ? `${nameOf(cur)} → ${name}. Aktif yapın kaydedilir; bu uzmanlığın yapısı yüklenir (ücretsiz).`
        : `${name} seçilsin mi? Değiştirmek için bir şehir/köy gerekir.`;
    askConfirm(this.modalHost(), text, mode === 'switch' ? 'Değiştir' : 'Uzmanlığı Seç', 'Vazgeç').then((ok) => {
      if (!ok) return;
      const T2 = G.talents;
      if (!T2) return;
      if (!T2.setSpec(id)) this.refused(T2.lastReason ?? 'Uzmanlık değiştirilemedi.');
      else {
        sfx('spec_choose', 0.8);
        toast(`${name} uzmanlığı seçildi.`, 'success');
      }
      this.render();
    });
  }

  /** Önerilen: stages autoBuild of both trees (the Apply charges the removals). */
  private recommended(): void {
    if (this.hooks.recommended) {
      this.hooks.recommended();
      return;
    }
    const T = G.talents;
    if (!T || !T.specId) {
      this.refused('Önce bir uzmanlık seç.');
      return;
    }
    const a = T.stageTree('class', T.autoBuild('class'));
    const b = a && T.stageTree('spec', T.autoBuild('spec'));
    if (!a || !b) {
      this.refused(T.lastReason);
      return;
    }
    toast('Önerilen yapı taslağa eklendi. Uygula ile onaylanır.', 'info');
    this.changed();
  }

  /** Sıfırla: clears both trees of the active spec in the draft, after a confirm. */
  private reset(): void {
    if (this.hooks.reset) {
      this.hooks.reset();
      return;
    }
    const T = G.talents;
    if (!T || !T.specId) return;
    askConfirm(
      this.modalHost(),
      'Bu uzmanlığın iki ağacındaki tüm puanlar taslakta sıfırlanır. İlk geri alma ücretsiz.',
      'Sıfırla',
      'Vazgeç',
      true,
    ).then((ok) => {
      const T2 = G.talents;
      if (!ok || !T2) return;
      T2.reset();
      toast('Taslak sıfırlandı. Uygula ile onaylanır.', 'info');
      this.changed();
    });
  }

  /** Kaydet: through the Dialogs hook, else saves the working build under a default name. */
  private saveCurrent(): void {
    if (this.hooks.saveLoadout) {
      this.hooks.saveLoadout();
      return;
    }
    const T = G.talents;
    if (!T || !T.specId) return;
    if (T.loadoutCount() >= MAX_SAVED_LOADOUTS) {
      this.refused(`En fazla ${MAX_SAVED_LOADOUTS} yapı kaydedilebilir.`);
      return;
    }
    try {
      const l = T.saveLoadout(`Yapı ${T.loadoutCount() + 1}`);
      this.loadPick = l.id;
      toast(`"${l.name}" kaydedildi.`, 'success');
    } catch (e) {
      console.warn('[talents] saveLoadout failed', e);
      this.refused('Yapı kaydedilemedi.');
    }
    this.render();
  }

  /** Yükle: the selected saved loadout goes into the draft (free, rest zone). */
  private loadSelected(): void {
    const T = G.talents;
    if (!T || this.loadPick === 'active') return;
    if (!T.loadLoadout(this.loadPick)) {
      this.refused(T.lastReason);
      return;
    }
    sfx('ui_tab', 0.7);
    toast('Yapı taslağa yüklendi. Uygula ile onaylanır.', 'info');
    this.changed();
  }

  /** Dışa Aktar: through the Dialogs hook, else the build string goes to the clipboard. */
  private exportBuild(): void {
    if (this.hooks.exportDialog) {
      this.hooks.exportDialog();
      return;
    }
    const T = G.talents;
    const s = T ? T.exportBuild() : '';
    if (!s) {
      this.refused('Önce bir uzmanlık seç.');
      return;
    }
    const clip = navigator.clipboard;
    if (!clip) {
      toast(`Yapı dizesi: ${s}`, 'info');
      return;
    }
    clip.writeText(s).then(
      () => toast('Yapı dizesi panoya kopyalandı.', 'success'),
      () => toast(`Yapı dizesi: ${s}`, 'info'),
    );
  }

  /** A tree changed the draft: the tab re-reads and the shell refreshes its staging bar. */
  private changed(): void {
    this.render();
    emit('talents:changed', {});
  }

  /* ---------------------------------------------------------------- search */

  private onSearch(): void {
    const q = this.searchInput.value.trim();
    const list: { kind: TreeKind; idx: number }[] = [];
    for (const k of ['class', 'spec'] as const) {
      const v = this.views[k];
      v.setQuery(q);
      for (const idx of v.matchIndices()) list.push({ kind: k, idx });
    }
    this.matchList = q ? list : [];
    this.matchPos = -1;
    this.searchCount.textContent = q ? `${list.length} eşleşme` : '';
  }

  /** Enter / Shift+Enter: the next or previous match, centred and focused. */
  private cycleMatch(dir: 1 | -1): void {
    const n = this.matchList.length;
    if (!n) return;
    if (this.matchPos < 0) this.matchPos = dir > 0 ? 0 : n - 1;
    else this.matchPos = (this.matchPos + dir + n) % n;
    const m = this.matchList[this.matchPos];
    this.stackTo(m.kind);
    const v = this.views[m.kind];
    v.focusSlot(this.slotOf(m.kind, m.idx));
    this.searchCount.textContent = `${this.matchPos + 1}/${n}`;
  }

  private slotOf(kind: TreeKind, idx: number): SlotId {
    const tree = treeOf(kind, kind === 'class' ? G.character?.classId : G.talents?.specId);
    return (tree?.nodes[idx]?.slot ?? 's01') as SlotId;
  }

  /* ---------------------------------------------------------------- keyboard */

  /** Keys of tab 1 (GDD_TALENTS §5.8). Text fields and buttons keep their own keys; Escape closes a popover first. */
  private onKey(e: KeyboardEvent): void {
    if (!this.active || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) {
      return;
    }
    const v = this.views[this.focusKind];
    const dirs: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    const dir = dirs[e.code];
    if (dir) {
      e.preventDefault();
      v.moveFocus(dir);
      return;
    }
    switch (e.code) {
      case 'Space':
      case 'Enter':
        e.preventDefault();
        v.keyTake();
        return;
      case 'Backspace':
        e.preventDefault();
        v.keyRemove();
        return;
      case 'KeyA':
      case 'KeyB':
        if (v.focusedIsChoice()) {
          e.preventDefault();
          v.keyOpt(e.code === 'KeyA' ? 'A' : 'B');
        }
        return;
      case 'Escape':
        if (v.keyEscape()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      default:
        return;
    }
  }
}
