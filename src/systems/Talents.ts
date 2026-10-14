/**
 * GDD_TALENTS §2 (WoW layer on `N`): TalentSystem. Spec choice and switching, the class tree and the spec tree (stored
 * per spec, §2.3), the staged draft that the window edits until "Değişiklikleri Uygula" (§5.5), loadouts (§2.7), the
 * Önerilen build, build strings (talentStrings.ts) and the respec cost (§2.8). The passive web (Pasif Puan) is not here.
 * Owner: items (T5). Created as `G.talents` in game/Game.ts. Pure rules live in this file; no UI code.
 *
 * Gameplay rules (all from the design doc, do not change without it):
 *   - points: class tree classPoints(L) = max(0, floor((L-10)/2)); spec tree specPoints(L) = max(0, floor((L-9)/2))
 *   - a new point needs: free pool point, gate met (points spent in the tree >= GATES[row]), a taken parent (row > 0)
 *   - a removal needs: every remaining taken node still meets its gate and has a taken parent (or is in row 0)
 *   - removals, spec switch and loadout / string loads only in a rest zone (town scene or a safe zone); adds out of combat
 *   - respec cost: removed == 0 ? 0 : tb.removals == 0 ? 0 : min(removed × 8 × level, 250 × level); a load is free
 */
import { G } from '../game/G';
import type { SkillSlotKey } from '../types/skills';
import type { ClassId } from '../types/common';
import type { SlotId, TalentBuild, TalentLoadout, TreeDef, TreeKind, TreeNodeDef } from '../types/talents';
import type { SpecId } from '../types/v2';
import { SKILLS } from '../data/skills';
import { SIGNATURE_SKILLS } from '../data/skillSpecs';
import { getSpec } from '../data/specs';
import { SPEC_ORDER, classOfSpec, getTree, specHasTree } from '../data/talentTrees/index';
import { SLOT_ORDER, parentsOf, slotGate, slotType } from '../data/talentTrees/layout';
import { parseFx } from '../data/talentTrees/fx';
import { emit } from './notify';
import { decodeBuild, encodeBuild } from './talentStrings';

/** Most saved loadouts per spec (§2.7). */
export const MAX_SAVED_LOADOUTS = 8;
/** Longest loadout name (§2.7). */
export const MAX_LOADOUT_NAME = 24;
/** Mastery XP per specialisation tier (§4.2). */
export const TIER_MASTERY_XP: readonly number[] = [200, 1000, 3000];
/** Level that opens a specialisation tier regardless of XP (§4.2). */
export const TIER_LEVEL: readonly number[] = [30, 45, 60];

const MAX_LEVEL = 60;
const NODE_COUNT = 30;
/** Skill-specialisation picks of a loadout: 3 signature skills × tiers 1–3 (§2.7). */
const SKILL_LEN = 9;
const ERR_FORMAT = 'Geçersiz yapı dizesi';

/** Class-tree points at a level (§2.1). */
export function classPoints(level: number): number {
  return Math.max(0, Math.floor((Math.min(level, MAX_LEVEL) - 10) / 2));
}

/** Spec-tree points at a level (§2.1). */
export function specPoints(level: number): number {
  return Math.max(0, Math.floor((Math.min(level, MAX_LEVEL) - 9) / 2));
}

/** Respec cost (§2.8): `removed` points, `removalsSoFar` = tb.removals before this Apply. */
export function respecCost(level: number, removed: number, removalsSoFar: number): number {
  return removed === 0 || removalsSoFar === 0 ? 0 : Math.min(removed * 8 * level, 250 * level);
}

/** True when a specialisation tier is open for an XP amount at a level (§4.2). */
export function tierUnlocked(xp: number, level: number, tier: number): boolean {
  if (tier < 1 || tier > 3) return false;
  return xp >= TIER_MASTERY_XP[tier - 1] || level >= TIER_LEVEL[tier - 1];
}

/** A staged change of the window (§5.5). `points` is the number of points the line moves. */
export interface DraftChange {
  kind: TreeKind;
  slot: SlotId;
  name: string;
  op: 'add' | 'remove';
  points: number;
  option?: 'A' | 'B';
}

/** The staged build. Never written to the save until `commit()`. */
export interface Draft {
  /** Owner (CharacterSave.id): a draft never outlives its character. */
  charId: string;
  specId: SpecId | null;
  cls: number[];
  spc: number[];
  skl: number[];
  /** Removed points that came with a loaded loadout or string: they are free (§2.7 "Yükle … ücretsiz"). */
  freeRemovals: number;
}

export interface TalentDiff {
  added: DraftChange[];
  removed: DraftChange[];
  /** New points the draft spends (choice swaps are not counted here). */
  addedPoints: number;
  /** Committed points the draft removes; a choice swap counts as one removal. */
  removedPoints: number;
  /** Gold the Apply costs (§2.8). */
  cost: number;
}

interface Build {
  cls: number[];
  spc: number[];
  skl: number[];
}

/** Copy of an array padded (or cut) to `n` integers; missing or invalid entries are 0. */
function padNums(src: readonly number[] | undefined, n: number): number[] {
  const out = new Array<number>(n).fill(0);
  if (!src) return out;
  for (let i = 0; i < n; i++) {
    const v = src[i];
    out[i] = typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  return out;
}

function sameArr(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

function newLoadoutId(): string {
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function cleanLoadoutName(name: string, n: number): string {
  const t = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LOADOUT_NAME);
  return t || `Yapı ${n}`;
}

/** Skill ids granted by an fx string (`G <skillId>` items). Cached: fx strings are fixed data. */
const grantCache = new Map<string, string[]>();
function grantsOf(fx: string): string[] {
  let v = grantCache.get(fx);
  if (!v) {
    v = parseFx(fx).items.flatMap((it) => (it.k === 'G' ? [it.skill] : []));
    grantCache.set(fx, v);
  }
  return v;
}

/** A choice node (two options, value 1 = A, 2 = B). Class s05, C, and the capstone s30. */
function isChoice(node: TreeNodeDef): boolean {
  return node.type !== 'P' && node.options.length === 2;
}

/** Largest legal value of a node: P ranks 0–2, choices 0–2, everything else 0–1. */
function maxValueOf(node: TreeNodeDef): number {
  return node.type === 'P' || isChoice(node) ? 2 : 1;
}

/** Points a node value stands for: a P node counts its rank, every other node 1 when taken. */
function pointsOf(node: TreeNodeDef, v: number): number {
  return node.type === 'P' ? v : v > 0 ? 1 : 0;
}

function optionIndexOf(node: TreeNodeDef, v: number): number {
  return isChoice(node) && v === 2 ? 1 : 0;
}

/**
 * Skill ids a build grants (taken `G` nodes of the class tree and the spec tree, GDD_TALENTS §2.3). Pure: `cls` / `spc` are the
 * point arrays of the build. TalentSystem.grantedSkills uses it for the committed build; systems/BetaTest.ts for the beta kit.
 */
export function grantedSkillsOf(classId: ClassId, specId: SpecId, cls: readonly number[], spc: readonly number[]): string[] {
  const out: string[] = [];
  for (const kind of ['class', 'spec'] as const) {
    const tree = getTree(kind, kind === 'class' ? classId : specId);
    if (!tree) continue;
    const arr = kind === 'class' ? cls : spc;
    tree.nodes.forEach((node, i) => {
      const v = arr[i] ?? 0;
      if (!v) return;
      const o = node.options[optionIndexOf(node, v)];
      if (!o) return;
      for (const g of grantsOf(o.fx)) if (!out.includes(g)) out.push(g);
    });
  }
  return out;
}

function letterOf(node: TreeNodeDef, v: number): 'A' | 'B' | undefined {
  if (!isChoice(node) || v <= 0) return undefined;
  return v === 2 ? 'B' : 'A';
}

/** Name of a node line for the diff list: the option name, or the granted skill's name for an unnamed `G` node. */
function labelOf(node: TreeNodeDef, v: number): string {
  const o = node.options[optionIndexOf(node, v)] ?? node.options[0];
  if (o?.name) return o.name;
  const g = o ? grantsOf(o.fx)[0] : undefined;
  return (g && SKILLS[g]?.name) || g || node.slot;
}

function pointsIn(tree: TreeDef, arr: readonly number[]): number {
  let s = 0;
  tree.nodes.forEach((n, i) => {
    s += pointsOf(n, arr[i] ?? 0);
  });
  return s;
}

/** Diff of one tree between two arrays. Each changed node is one line; a choice swap is a removal plus an addition. */
function treeDelta(
  kind: TreeKind,
  tree: TreeDef,
  from: readonly number[],
  to: readonly number[],
): { added: DraftChange[]; removed: DraftChange[]; addedPoints: number; removedPoints: number } {
  const added: DraftChange[] = [];
  const removed: DraftChange[] = [];
  let addedPoints = 0;
  let removedPoints = 0;
  tree.nodes.forEach((node, i) => {
    const a = from[i] ?? 0;
    const b = to[i] ?? 0;
    if (a === b) return;
    if (node.type === 'P') {
      if (b > a) {
        added.push({ kind, slot: node.slot, name: labelOf(node, b), op: 'add', points: b - a });
        addedPoints += b - a;
      } else {
        removed.push({ kind, slot: node.slot, name: labelOf(node, a), op: 'remove', points: a - b });
        removedPoints += a - b;
      }
      return;
    }
    if (a > 0) {
      removed.push({ kind, slot: node.slot, name: labelOf(node, a), op: 'remove', points: 1, option: letterOf(node, a) });
      removedPoints += 1;
    }
    if (b > 0) {
      added.push({ kind, slot: node.slot, name: labelOf(node, b), op: 'add', points: 1, option: letterOf(node, b) });
      if (a === 0) addedPoints += 1;
    }
  });
  return { added, removed, addedPoints, removedPoints };
}

/** Points a draft removes from the committed build (used to make a load free). */
function removedBetween(trees: { class: TreeDef | null; spec: TreeDef | null }, from: Build, to: Build): number {
  let n = 0;
  if (trees.class) n += treeDelta('class', trees.class, from.cls, to.cls).removedPoints;
  if (trees.spec) n += treeDelta('spec', trees.spec, from.spc, to.spc).removedPoints;
  return n;
}

/**
 * Önerilen (§2.7): greedy build with `points` points. Priority A (0) → choice (1) → K (2) → M (3) → P rank 1 (4)
 * → P rank 2 (5); ties by slot number; gates and parents honoured. Choices take option A (value 1). Pure.
 */
export function autoBuildTree(kind: TreeKind, points: number): number[] {
  const taken = new Array<number>(NODE_COUNT).fill(0);
  const typeRank = (t: string, rank: number): number => {
    if (t === 'P') return rank === 0 ? 4 : 5;
    return ({ A: 0, C: 1, K: 2, M: 3 } as Record<string, number>)[t] ?? 3;
  };
  const maxRank = (t: string): number => (t === 'P' ? 2 : 1);
  let spent = 0;
  while (spent < points) {
    let best = -1;
    let bestRank = Infinity;
    for (let i = 0; i < NODE_COUNT; i++) {
      const slot = SLOT_ORDER[i];
      const t = slotType(slot, kind);
      if (taken[i] >= maxRank(t)) continue;
      if (spent < slotGate(slot)) continue;
      const ps = parentsOf(slot);
      if (ps.length && !ps.some((p) => taken[SLOT_ORDER.indexOf(p)] > 0)) continue;
      const r = typeRank(t, taken[i]);
      if (r < bestRank) {
        bestRank = r;
        best = i;
      }
    }
    if (best < 0) break;
    taken[best] += 1;
    spent += 1;
  }
  return taken;
}

/**
 * The talent system of the `N` window (GDD_TALENTS §2, §5.5). All reads and writes go through `G.character`; the
 * class has no state of its own besides the staged draft and the last refusal reason.
 */
export class TalentSystem {
  /** Staged changes of the window, or null when nothing is open. Use `beginDraft()` to start one. */
  draft: Draft | null = null;
  /** Reason of the last refused action (Turkish), for the UI to show. Null after a successful action. */
  lastReason: string | null = null;

  // ======================================================================== state

  /** Active spec of the character (null before the level-10 choice). */
  get specId(): SpecId | null {
    return G.character?.save.spec ?? null;
  }

  /** Whether a point may be added (`add`) and removed / a spec or loadout switched (`remove`), and why not. */
  canEditHere(): { add: boolean; remove: boolean; reason?: string } {
    const char = G.character;
    if (!char) return { add: false, remove: false, reason: 'Karakter seçilmedi.' };
    if (G.player?.inCombat) return { add: false, remove: false, reason: 'Savaşta değiştirilemez.' };
    const mp = G.mplus;
    const run = mp?.active ? mp.state : null;
    const inDungeon = G.scenes?.current?.id === 'dungeon';
    if ((run && run.started) || (inDungeon && !run)) {
      return { add: false, remove: false, reason: 'Zindan içinde değiştirilemez.' };
    }
    const world = G.world as unknown as { isSafeZone?: (p: unknown) => boolean } | null;
    const player = G.player;
    const rest = G.scenes?.current?.id === 'town' || (!!player && !!world?.isSafeZone?.(player));
    if (!rest) return { add: true, remove: false, reason: 'Şehir/köy dışında yalnızca puan eklenebilir.' };
    return { add: true, remove: true };
  }

  /** Tree of the active spec (`spec`) or of the character's class (`class`); null when unknown. */
  tree(kind: TreeKind): TreeDef | null {
    return this.treeFor(kind, this.specId);
  }

  /** Points the pool of a tree holds at the character's level (§2.1). */
  pointsTotal(kind: TreeKind): number {
    const level = G.character?.level ?? 1;
    return kind === 'class' ? classPoints(level) : specPoints(level);
  }

  /** Points spent in the working build (the draft when open, else the committed build). */
  pointsSpent(kind: TreeKind): number {
    this.check();
    const tree = this.tree(kind);
    if (!tree) return 0;
    return pointsIn(tree, kind === 'class' ? this.working().cls : this.working().spc);
  }

  /** Free points of a tree in the working build. */
  pointsFree(kind: TreeKind): number {
    return Math.max(0, this.pointsTotal(kind) - this.pointsSpent(kind));
  }

  // ======================================================================== spec

  /**
   * Chooses (first time, level 10 or more) or switches the spec. A switch needs a rest zone and no staged changes; it is
   * free. The spec's own bar is restored (`specBars`) or its `defaultBar` used. Emits `spec:changed`, `skillbar:changed`.
   */
  setSpec(id: SpecId): boolean {
    this.check();
    const char = G.character;
    if (!char) return this.refuse('Karakter seçilmedi.');
    const save = char.save;
    if (!SPEC_ORDER.includes(id) || classOfSpec(id) !== save.classId) return this.refuse('Bu uzmanlık bu sınıfa ait değil.');
    // KIT PK-0: a registered spec without a generated tree (rogue_subtlety until the T-step) cannot be picked
    if (!specHasTree(id)) return this.refuse('Bu uzmanlık henüz hazır değil.');
    const prev = save.spec;
    if (prev === id) {
      this.lastReason = null;
      return true;
    }
    const edit = this.canEditHere();
    if (!prev) {
      if (char.level < 10) return this.refuse('Uzmanlık seviye 10’da seçilir.');
      if (!edit.add) return this.refuse(edit.reason ?? 'Şu an uzmanlık seçilemez.');
    } else {
      if (!edit.add) return this.refuse(edit.reason ?? 'Şu an uzmanlık değiştirilemez.');
      if (!edit.remove) return this.refuse('Uzmanlığı değiştirmek için şehir veya köyde ol.');
    }
    if (this.staged()) return this.refuse('Önce taslağı uygula veya geri al.');

    this.draft = null;
    const bars = (save.specBars ??= {});
    if (prev) bars[prev] = { ...save.skillBar };
    save.spec = id;
    const saved = bars[id];
    const next: Partial<Record<SkillSlotKey, string>> =
      saved && Object.keys(saved).length ? { ...saved } : { ...(getSpec(id)?.defaultBar ?? save.skillBar) };
    if (!next.lmb && save.skillBar.lmb) next.lmb = save.skillBar.lmb;
    save.skillBar = next;
    this.syncGrantedBar([], this.grantedSkills(), id, false);
    this.lastReason = null;
    char.recomputeStats();
    emit('spec:changed', { entityId: G.player?.id ?? 0, spec: id });
    emit('skillbar:changed', {});
    char.persist();
    return true;
  }

  // ======================================================================== draft

  /** Starts a draft from the committed build of the active spec (or returns the open one). */
  beginDraft(): Draft {
    this.check();
    if (this.draft) return this.draft;
    const c = this.committed();
    this.draft = {
      charId: G.character?.save.id ?? '',
      specId: this.specId,
      cls: c.cls,
      spc: c.spc,
      skl: c.skl,
      freeRemovals: 0,
    };
    return this.draft;
  }

  /** Whether a point can be added to a node in the draft, and why not. `opt` picks option A or B of a choice. */
  canTake(kind: TreeKind, slot: SlotId, opt?: 'A' | 'B'): { ok: boolean; reason?: string } {
    this.check();
    if (!this.specId) return { ok: false, reason: 'Önce bir uzmanlık seç.' };
    const tree = this.tree(kind);
    if (!tree) return { ok: false, reason: 'Ağaç bulunamadı.' };
    const i = SLOT_ORDER.indexOf(slot);
    const node = tree.nodes[i];
    if (i < 0 || !node) return { ok: false, reason: 'Bilinmeyen düğüm.' };
    const arr = this.arrayOf(kind, this.working());
    const cur = arr[i] ?? 0;
    if (node.type === 'P') {
      if (cur >= 2) return { ok: false, reason: 'Maksimum seviye.' };
    } else if (isChoice(node)) {
      const want = opt === 'B' ? 2 : 1;
      if (cur === want) return { ok: false, reason: 'Bu seçim zaten alındı.' };
      // swapping A and B of a taken choice keeps the point: allowed in the draft, counted on Apply (§2.3)
      if (cur > 0) return { ok: true };
    } else if (cur > 0) {
      return { ok: false, reason: 'Bu düğüm zaten alındı.' };
    }
    const edit = this.canEditHere();
    if (!edit.add) return { ok: false, reason: edit.reason ?? 'Şu an puan eklenemez.' };
    const spent = this.pointsSpent(kind);
    if (spent >= this.pointsTotal(kind)) return { ok: false, reason: 'Boş puan yok.' };
    if (cur === 0) {
      if (spent < node.gate) return { ok: false, reason: `Bu sıra için ${node.gate} puan harca (${spent}/${node.gate})` };
      if (node.parents.length && !node.parents.some((p) => (arr[SLOT_ORDER.indexOf(p)] ?? 0) > 0)) {
        return { ok: false, reason: 'Bağlı bir düğüm seçili değil.' };
      }
    }
    return { ok: true };
  }

  /** Adds a point to a node in the draft (or swaps a choice). Returns false and sets `lastReason` when refused. */
  take(kind: TreeKind, slot: SlotId, opt?: 'A' | 'B'): boolean {
    const c = this.canTake(kind, slot, opt);
    if (!c.ok) return this.refuse(c.reason ?? 'Seçilemez.');
    const d = this.beginDraft();
    const i = SLOT_ORDER.indexOf(slot);
    const node = this.tree(kind)?.nodes[i];
    if (!node) return this.refuse('Bilinmeyen düğüm.');
    const arr = kind === 'class' ? d.cls : d.spc;
    if (node.type === 'P') arr[i] = (arr[i] ?? 0) + 1;
    else if (isChoice(node)) arr[i] = opt === 'B' ? 2 : 1;
    else arr[i] = 1;
    this.lastReason = null;
    return true;
  }

  /**
   * Removes a point from a node in the draft (a P rank, or the whole choice / node). Refused when a remaining taken node
   * would lose its gate or its last parent (§2.3 untake rule). Allowed in the draft; the Apply is gated by the rest zone.
   */
  untake(kind: TreeKind, slot: SlotId): boolean {
    this.check();
    const tree = this.tree(kind);
    const i = SLOT_ORDER.indexOf(slot);
    const node = tree?.nodes[i];
    if (!tree || !node) return this.refuse('Bilinmeyen düğüm.');
    const cur = this.arrayOf(kind, this.working())[i] ?? 0;
    if (cur === 0) return this.refuse('Bu düğüm seçili değil.');
    const next = node.type === 'P' ? cur - 1 : 0;
    const trial = this.arrayOf(kind, this.working()).slice();
    trial[i] = next;
    if (this.structureError(kind, trial)) return this.refuse('Bu düğüme bağlı seçimler var.');
    const d = this.beginDraft();
    (kind === 'class' ? d.cls : d.spc)[i] = next;
    this.lastReason = null;
    return true;
  }

  /**
   * Replaces one whole tree of the draft (Önerilen, presets). The ranks are validated like a loaded build.
   * Not a rest-zone action: the Apply charges the removals.
   */
  stageTree(kind: TreeKind, ranks: readonly number[]): boolean {
    this.check();
    const arr = padNums(ranks, NODE_COUNT);
    const err = this.structureError(kind, arr);
    if (err) return this.refuse(err);
    const d = this.beginDraft();
    if (kind === 'class') d.cls = arr;
    else d.spc = arr;
    this.lastReason = null;
    return true;
  }

  /** The draft as a diff against the committed build, with the respec cost (§2.8). */
  diff(): TalentDiff {
    this.check();
    const d = this.draft;
    const out: TalentDiff = { added: [], removed: [], addedPoints: 0, removedPoints: 0, cost: 0 };
    if (!d) return out;
    const comm = this.committed();
    for (const kind of ['class', 'spec'] as const) {
      const tree = this.tree(kind);
      if (!tree) continue;
      const t = treeDelta(kind, tree, this.arrayOf(kind, comm), this.arrayOf(kind, { cls: d.cls, spc: d.spc, skl: d.skl }));
      out.added.push(...t.added);
      out.removed.push(...t.removed);
      out.addedPoints += t.addedPoints;
      out.removedPoints += t.removedPoints;
    }
    out.cost = this.wowRespecCost(Math.max(0, out.removedPoints - d.freeRemovals));
    return out;
  }

  /**
   * Applies the draft (atomic): validates it, checks the rest-zone and combat rules, pays the gold, writes
   * `tb.active[spec]`, bumps `tb.removals` when a removal is part of it, recomputes the stats and grants, emits
   * `talents:committed {kind:'wow'}` (and `skillbar:changed` when the grants changed). A refusal keeps the draft.
   */
  commit(): { ok: boolean; error?: string } {
    this.check();
    const char = G.character;
    const spec = this.specId;
    const d = this.draft;
    if (!char || !spec) return this.refuseWith('Uzmanlık seçilmedi.');
    if (!d) return { ok: true };
    if (!this.staged()) {
      this.draft = null;
      this.lastReason = null;
      return { ok: true };
    }
    const err = this.structureError('class', d.cls) ?? this.structureError('spec', d.spc);
    if (err) return this.refuseWith(err);
    const diff = this.diff();
    const edit = this.canEditHere();
    if (diff.addedPoints > 0 && !edit.add) return this.refuseWith(edit.reason ?? 'Şu an puan eklenemez.');
    if (diff.removedPoints > 0 && !edit.remove) {
      return this.refuseWith(edit.reason ?? 'Puan geri almak için şehir veya köyde ol.');
    }
    if (diff.cost > char.save.gold) return this.refuseWith('Yetersiz altın.');
    const tb = this.tbWrite();
    if (!tb) return this.refuseWith('Karakter seçilmedi.');

    const before = this.grantedSkills();
    if (diff.cost > 0 && !char.spendGold(diff.cost)) return this.refuseWith('Yetersiz altın.');
    tb.active[spec] = {
      id: 'active',
      name: 'Aktif',
      cls: d.cls.slice(),
      spc: d.spc.slice(),
      skl: d.skl.slice(),
      at: Date.now(),
    };
    if (diff.removedPoints > 0) tb.removals += 1;
    this.draft = null;
    this.lastReason = null;
    const after = this.grantedSkills();
    this.syncGrantedBar(before, after, spec, true);
    char.recomputeStats();
    emit('talents:committed', { kind: 'wow' });
    if (!sameSet(before, after)) emit('skillbar:changed', {});
    char.persist(true);
    return { ok: true };
  }

  /** Discards the draft. */
  cancel(): void {
    this.draft = null;
    this.lastReason = null;
  }

  /** Sıfırla (§5.6): clears both trees of the active spec in the draft. The first removal Apply is free as usual. */
  reset(): void {
    this.check();
    if (!this.specId) return;
    const d = this.beginDraft();
    d.cls = new Array<number>(NODE_COUNT).fill(0);
    d.spc = new Array<number>(NODE_COUNT).fill(0);
    d.freeRemovals = 0;
    this.lastReason = null;
  }

  /** Önerilen: the greedy build of a tree for the tree's pool (§2.7). Pure; use `stageTree` to put it in the draft. */
  autoBuild(kind: TreeKind, points?: number): number[] {
    return autoBuildTree(kind, points ?? this.pointsTotal(kind));
  }

  // ======================================================================== skills

  /** Skill ids granted by the committed build (taken `G` nodes of both trees of the active spec, §2.3). */
  grantedSkills(): string[] {
    const spec = this.specId;
    const char = G.character;
    if (!spec || !char) return [];
    const comm = this.committed();
    return grantedSkillsOf(char.save.classId, spec, comm.cls, comm.spc);
  }

  /** Picked option of a signature skill's tier in the working build: 0 none, 1 A, 2 B. */
  skillPick(skillId: string, tier: number): 0 | 1 | 2 {
    const idx = this.skillIndexOf(skillId, tier);
    if (idx < 0) return 0;
    const v = this.working().skl[idx] ?? 0;
    return v === 1 ? 1 : v === 2 ? 2 : 0;
  }

  /** Whether a pick can be set now, and why not (tier lock, out of combat, unknown skill). */
  canSetSkillPick(skillId: string, tier: number, pick: number): { ok: boolean; reason?: string } {
    const char = G.character;
    if (!char) return { ok: false, reason: 'Karakter seçilmedi.' };
    if (!this.specId) return { ok: false, reason: 'Önce bir uzmanlık seç.' };
    if (this.skillIndexOf(skillId, tier) < 0 || (pick !== 0 && pick !== 1 && pick !== 2)) {
      return { ok: false, reason: 'Bu beceri uzmanlığı yok.' };
    }
    if (pick !== 0 && !tierUnlocked(char.save.skillMastery?.[skillId] ?? 0, char.level, tier)) {
      const xp = char.save.skillMastery?.[skillId] ?? 0;
      return { ok: false, reason: `Kilitli: Ustalık ${xp} / ${TIER_MASTERY_XP[tier - 1]} veya Seviye ${TIER_LEVEL[tier - 1]}` };
    }
    if (G.player?.inCombat) return { ok: false, reason: 'Beceri seçimi savaşta yapılamaz.' };
    return { ok: true };
  }

  /**
   * Sets the A / B / none pick of a signature skill tier. Immediate (not staged): it writes the committed loadout and the
   * draft, and invalidates the resolved skills (recomputeStats). Refused picks set `lastReason`.
   */
  setSkillPick(skillId: string, tier: number, pick: number): void {
    const c = this.canSetSkillPick(skillId, tier, pick);
    if (!c.ok) {
      this.lastReason = c.reason ?? null;
      return;
    }
    const spec = this.specId;
    const tb = this.tbWrite();
    if (!spec || !tb) return;
    const idx = this.skillIndexOf(skillId, tier);
    const act = (tb.active[spec] ??= {
      id: 'active',
      name: 'Aktif',
      cls: padNums([], NODE_COUNT),
      spc: padNums([], NODE_COUNT),
      skl: padNums([], SKILL_LEN),
      at: Date.now(),
    });
    const skl = padNums(act.skl, SKILL_LEN);
    skl[idx] = pick;
    act.skl = skl;
    if (this.draft) this.draft.skl[idx] = pick;
    this.lastReason = null;
    G.character?.recomputeStats();
    emit('talents:changed', {});
    G.character?.persist();
  }

  // ======================================================================== loadouts

  /** Saved loadouts of the active spec (copies). */
  savedLoadouts(): TalentLoadout[] {
    const spec = this.specId;
    const list = spec ? this.tbRead()?.saved[spec] : undefined;
    return list ? list.map((l) => ({ ...l, cls: l.cls.slice(), spc: l.spc.slice(), skl: l.skl.slice() })) : [];
  }

  /** Number of saved loadouts of the active spec (check against MAX_SAVED_LOADOUTS before `saveLoadout`). */
  loadoutCount(): number {
    return this.savedLoadouts().length;
  }

  /**
   * Saves the working build (the open draft, else the committed one) under a name. Throws when there is no spec or
   * the MAX_SAVED_LOADOUTS (8) limit is reached: check `loadoutCount()` first.
   */
  saveLoadout(name: string): TalentLoadout {
    this.check();
    const spec = this.specId;
    const tb = this.tbWrite();
    if (!spec || !tb) throw new Error('TalentSystem.saveLoadout: uzmanlık seçilmedi');
    const list = (tb.saved[spec] ??= []);
    if (list.length >= MAX_SAVED_LOADOUTS) throw new Error(`TalentSystem.saveLoadout: en fazla ${MAX_SAVED_LOADOUTS} kayıt`);
    const w = this.working();
    const loadout: TalentLoadout = {
      id: newLoadoutId(),
      name: cleanLoadoutName(name, list.length + 1),
      cls: w.cls.slice(),
      spc: w.spc.slice(),
      skl: w.skl.slice(),
      at: Date.now(),
    };
    list.push(loadout);
    emit('loadout:changed', { specId: spec });
    G.character?.persist();
    return loadout;
  }

  /** Loads a saved loadout into the draft (free, rest zone only). The Apply applies it. */
  loadLoadout(id: string): boolean {
    this.check();
    const edit = this.canEditHere();
    if (!edit.remove) return this.refuse(edit.reason ?? 'Yapı yalnızca şehir veya köyde yüklenebilir.');
    const found = this.savedLoadouts().find((l) => l.id === id);
    if (!found) return this.refuse('Yapı bulunamadı.');
    const build: Build = { cls: padNums(found.cls, NODE_COUNT), spc: padNums(found.spc, NODE_COUNT), skl: this.sanitizeSkl(found.skl) };
    if (this.structureError('class', build.cls) || this.structureError('spec', build.spc)) return this.refuse(ERR_FORMAT);
    return this.stageLoaded(build);
  }

  renameLoadout(id: string, name: string): void {
    const spec = this.specId;
    const list = spec ? this.tbRead()?.saved[spec] : undefined;
    const l = list?.find((x) => x.id === id);
    if (!l || !spec) return;
    const t = name.trim();
    if (!t) return;
    l.name = cleanLoadoutName(t, 1);
    emit('loadout:changed', { specId: spec });
    G.character?.persist();
  }

  deleteLoadout(id: string): void {
    const spec = this.specId;
    const list = spec ? this.tbRead()?.saved[spec] : undefined;
    if (!list || !spec) return;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    list.splice(i, 1);
    emit('loadout:changed', { specId: spec });
    G.character?.persist();
  }

  // ======================================================================== strings

  /** Build string of the working build (the open draft, else the committed one); '' without a spec. */
  exportBuild(): string {
    const spec = this.specId;
    if (!spec) return '';
    const w = this.working();
    return encodeBuild(spec, w.cls, w.spc, w.skl);
  }

  /**
   * Loads a build string into the draft (rest zone, free). A string of another spec of the same class switches the spec
   * first (free). Every failure reads "Geçersiz yapı dizesi" except the rule messages.
   */
  importBuild(str: string): { ok: boolean; error?: string } {
    this.check();
    const char = G.character;
    if (!char) return this.refuseWith('Karakter seçilmedi.');
    const edit = this.canEditHere();
    if (!edit.remove) return this.refuseWith(edit.reason ?? 'Yapı yalnızca şehir veya köyde yüklenebilir.');
    const r = decodeBuild(str, char.save.classId);
    if (!r.ok) return this.refuseWith(ERR_FORMAT);
    // validate against the string's own spec before anything changes (a bad string must change nothing)
    const specTree = this.treeFor('spec', r.specId);
    if (this.structureError('class', r.cls, this.tree('class')) || this.structureError('spec', r.spc, specTree)) {
      return this.refuseWith(ERR_FORMAT);
    }
    if (r.specId !== this.specId) {
      if (this.staged()) return this.refuseWith('Önce taslağı uygula veya geri al.');
      if (!this.setSpec(r.specId)) return this.refuseWith(this.lastReason ?? ERR_FORMAT);
    }
    this.stageLoaded({ cls: r.cls, spc: r.spc, skl: this.sanitizeSkl(r.skl) });
    return { ok: true };
  }

  // ======================================================================== respec cost

  /** Gold for removing `removed` points in one Apply (§2.8). Uses tb.removals (0 = the first removal Apply is free). */
  wowRespecCost(removed: number): number {
    const level = G.character?.level ?? 1;
    return respecCost(level, removed, this.tbRead()?.removals ?? 0);
  }

  // ======================================================================== internals

  /** Clears a draft that belongs to another character. */
  private check(): void {
    if (this.draft && this.draft.charId !== (G.character?.save.id ?? '')) this.draft = null;
  }

  private tbRead(): TalentBuild | undefined {
    return G.character?.save.tb;
  }

  private tbWrite(): TalentBuild | null {
    const save = G.character?.save;
    if (!save) return null;
    save.tb ??= { v: 1, active: {}, saved: {}, removals: 0 };
    return save.tb;
  }

  /** Committed build of the active spec (fresh arrays; zeros before any commit). */
  private committed(): Build {
    const spec = this.specId;
    const l = spec ? this.tbRead()?.active[spec] : undefined;
    return { cls: padNums(l?.cls, NODE_COUNT), spc: padNums(l?.spc, NODE_COUNT), skl: padNums(l?.skl, SKILL_LEN) };
  }

  /** Working build: the draft when open, else the committed one. */
  private working(): Build {
    const d = this.draft;
    if (d) return { cls: d.cls, spc: d.spc, skl: d.skl };
    return this.committed();
  }

  private arrayOf(kind: TreeKind, b: Build): number[] {
    return kind === 'class' ? b.cls : b.spc;
  }

  /** True when the draft differs from the committed build (trees or picks). */
  private staged(): boolean {
    const d = this.draft;
    if (!d) return false;
    const c = this.committed();
    return !sameArr(c.cls, d.cls) || !sameArr(c.spc, d.spc) || !sameArr(c.skl, d.skl);
  }

  /**
   * Whole-tree validity of an array against a tree (default: the working tree of the active spec): values in range,
   * pool not exceeded, every taken node has its gate (total points in the tree) and a taken parent. Returns the error or null.
   */
  private structureError(kind: TreeKind, arr: readonly number[], tree: TreeDef | null = this.tree(kind)): string | null {
    if (!tree) return 'Uzmanlık seçilmedi.';
    let total = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = tree.nodes[i];
      const v = arr[i] ?? 0;
      if (!Number.isInteger(v) || v < 0 || v > maxValueOf(node)) return ERR_FORMAT;
      total += pointsOf(node, v);
    }
    if (total > this.pointsTotal(kind)) return 'Puan havuzu aşıldı.';
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = tree.nodes[i];
      if (!(arr[i] ?? 0)) continue;
      if (total < node.gate) return `Bu sıra için ${node.gate} puan gerekir.`;
      if (node.parents.length && !node.parents.some((p) => (arr[SLOT_ORDER.indexOf(p)] ?? 0) > 0)) {
        return 'Bağlı bir düğüm seçili değil.';
      }
    }
    return null;
  }

  /** Skill picks of a build with the tiers the character cannot open set to 0 (tier lock, §4.2). */
  private sanitizeSkl(skl: readonly number[]): number[] {
    const char = G.character;
    const list = char ? SIGNATURE_SKILLS[char.save.classId] ?? [] : [];
    const xp = char?.save.skillMastery ?? {};
    const level = char?.level ?? 1;
    return padNums(skl, SKILL_LEN).map((v, i) => {
      const skill = list[Math.floor(i / 3)];
      const tier = (i % 3) + 1;
      if (!skill || !tierUnlocked(xp[skill] ?? 0, level, tier)) return 0;
      return v === 1 || v === 2 ? v : 0;
    });
  }

  /** Index of a signature skill tier in `skl` (3 skills × tiers 1–3, §2.7), or -1. */
  private skillIndexOf(skillId: string, tier: number): number {
    const char = G.character;
    if (!char || !Number.isInteger(tier) || tier < 1 || tier > 3) return -1;
    const k = (SIGNATURE_SKILLS[char.save.classId] ?? []).indexOf(skillId);
    return k < 0 ? -1 : k * 3 + (tier - 1);
  }

  /**
   * Puts a build into the draft as a load: the caller has validated it. The removals the load brings are free (§2.7),
   * so the Apply charges only the removals the player makes afterwards.
   */
  private stageLoaded(build: Build): boolean {
    const d = this.beginDraft();
    const comm = this.committed();
    d.cls = build.cls.slice();
    d.spc = build.spc.slice();
    d.skl = build.skl.slice();
    d.freeRemovals = removedBetween({ class: this.tree('class'), spec: this.tree('spec') }, comm, build);
    this.lastReason = null;
    return true;
  }

  /** Tree of a kind for a given spec (the class tree needs no spec). Null when unknown; never throws. */
  private treeFor(kind: TreeKind, specId: SpecId | null): TreeDef | null {
    const save = G.character?.save;
    if (!save) return null;
    const id = kind === 'class' ? save.classId : specId;
    if (!id) return null;
    try {
      return getTree(kind, id);
    } catch (e) {
      console.warn('[talents] tree build failed', kind, id, e);
      return null;
    }
  }

  /**
   * Grants changed: removes the skills that are no longer granted from the bar (when `dropGone`) and fills the spec's
   * `defaultBar` slot of each newly granted skill when that slot is empty (§2.3).
   */
  private syncGrantedBar(before: readonly string[], after: readonly string[], spec: SpecId | null, dropGone: boolean): void {
    const save = G.character?.save;
    if (!save) return;
    const bar = save.skillBar;
    const b = new Set(before);
    const a = new Set(after);
    if (dropGone) {
      for (const key of Object.keys(bar) as SkillSlotKey[]) {
        const sk = bar[key];
        if (sk && b.has(sk) && !a.has(sk)) delete bar[key];
      }
    }
    const def = spec ? getSpec(spec)?.defaultBar : undefined;
    if (!def) return;
    for (const sk of after) {
      if (b.has(sk) || Object.values(bar).includes(sk)) continue;
      const slot = (Object.keys(def) as SkillSlotKey[]).find((k) => def[k] === sk);
      if (slot && !bar[slot]) bar[slot] = sk;
    }
  }

  private refuse(reason: string): false {
    this.lastReason = reason;
    return false;
  }

  private refuseWith(reason: string): { ok: false; error: string } {
    this.lastReason = reason;
    return { ok: false, error: reason };
  }
}
