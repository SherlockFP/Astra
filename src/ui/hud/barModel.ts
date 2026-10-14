/**
 * WoW-style action bar model (pure: no DOM, no game singletons, so dev/combat-sim/actionbar_dnd.mjs can drive it).
 *
 * A cell holds a skill or a consumable. Main-bar skills keep living in save.skillBar (SkillSystem casts from there);
 * main-bar consumables live in save.barLayout.main; the two extra bars are 12 cells each in save.barLayout.
 * Every operation here is a pure function over BarsState; barDrop.ts maps the state to and from the save.
 */
import type { BarCell, BarLayoutSave } from '../../types/character';

export type { BarCell, BarLayoutSave };

export type BarId = 'main' | 'bar2' | 'bar3';
export interface CellRef {
  bar: BarId;
  idx: number;
}
export type BarRow = (BarCell | null)[];
export interface BarsState {
  main: BarRow;
  bar2: BarRow;
  bar3: BarRow;
}

/** Cells per bar (the 12-slot main row and both extra bars). */
export const BAR_CELLS = 12;

/** Main-bar slot ids, left to right (the same order as ActionBar's MAIN_SPECS). */
export const MAIN_KEYS: readonly string[] = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];

/** Seconds of shared cooldown (the potion_cd status) a bar consumable that is not a potion starts. */
export const CONSUMABLE_CD_S = 10;

export function emptyRow(): BarRow {
  return Array.from({ length: BAR_CELLS }, () => null);
}

export function emptyState(): BarsState {
  return { main: emptyRow(), bar2: emptyRow(), bar3: emptyRow() };
}

export function sanitizeCell(v: unknown): BarCell | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { k?: unknown; id?: unknown };
  if (typeof o.id !== 'string' || !o.id) return null;
  if (o.k === 'skill') return { k: 'skill', id: o.id };
  if (o.k === 'mat') return { k: 'mat', id: o.id };
  return null;
}

/** A stored row, always BAR_CELLS long; anything malformed becomes an empty cell. */
export function sanitizeRow(v: unknown): BarRow {
  const row = emptyRow();
  if (Array.isArray(v)) for (let i = 0; i < BAR_CELLS; i++) row[i] = sanitizeCell(v[i]);
  return row;
}

export function sameCell(a: BarCell | null | undefined, b: BarCell | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.k === b.k && a.id === b.id;
}

export function rowOf(state: BarsState, bar: BarId): BarRow {
  return state[bar];
}

export function cellAt(state: BarsState, ref: CellRef): BarCell | null {
  return rowOf(state, ref.bar)[ref.idx] ?? null;
}

function cloneState(s: BarsState): BarsState {
  return { main: s.main.slice(), bar2: s.bar2.slice(), bar3: s.bar3.slice() };
}

/**
 * Put `content` on `to`. With `from` (a bar cell dragged), the cell it lands on moves to `from` (a swap; an empty target
 * leaves `from` empty). Without `from` (a skill book or bag drag) the source is untouched. A skill on the main bar lives in
 * one slot only, so the other main slots holding it are emptied (the same rule CharacterState.setSkillSlot applies).
 */
export function moveCell(state: BarsState, from: CellRef | null, to: CellRef, content: BarCell): BarsState {
  if (from && from.bar === to.bar && from.idx === to.idx) return state;
  const next = cloneState(state);
  const prev = next[to.bar][to.idx] ?? null;
  next[to.bar][to.idx] = { k: content.k, id: content.id };
  if (from) next[from.bar][from.idx] = prev;
  if (to.bar === 'main' && content.k === 'skill') {
    for (let j = 0; j < BAR_CELLS; j++) {
      const c = next.main[j];
      if (j !== to.idx && c && c.k === 'skill' && c.id === content.id) next.main[j] = null;
    }
  }
  return next;
}

/** Drag a cell off the bar: the cell is emptied. */
export function removeCell(state: BarsState, ref: CellRef): BarsState {
  const next = cloneState(state);
  next[ref.bar][ref.idx] = null;
  return next;
}

/** Barları Kilitle: with the lock on, a cell can only be picked up while Shift is held. */
export function canPickUp(lockOn: boolean, shift: boolean): boolean {
  return !lockOn || shift;
}

/** Stack count shown on an item cell: the total in the bags (the materials pouch), never negative. */
export function itemCount(materials: Record<string, number | undefined>, id: string): number {
  return Math.max(0, Math.floor(materials[id] ?? 0));
}

/** Shared cooldown of a bar cell: the remaining and total seconds of the potion_cd status (0 when none). */
export function sharedCooldown(status: { remaining: number; duration: number } | null | undefined): { remaining: number; total: number } {
  if (!status) return { remaining: 0, total: 0 };
  return { remaining: Math.max(0, status.remaining), total: Math.max(0, status.duration) };
}

/** A consumable can sit on a bar (potions, flasks, food, pet eggs and the other consumable kinds). */
export function isBarConsumable(kind: string | undefined): boolean {
  return kind === 'consumable';
}

/** Save shape: the extra bars in full, and only the consumables of the main bar (keyed by slot id). */
export function serializeBarLayout(state: BarsState, mainKeys: readonly string[] = MAIN_KEYS): BarLayoutSave {
  const main: Partial<Record<string, BarCell>> = {};
  state.main.forEach((c, i) => {
    const key = mainKeys[i];
    if (c && c.k === 'mat' && key) main[key] = { k: 'mat', id: c.id };
  });
  return {
    bar2: state.bar2.map((c) => (c ? { k: c.k, id: c.id } : null)),
    bar3: state.bar3.map((c) => (c ? { k: c.k, id: c.id } : null)),
    main,
  };
}

/** Reads the saved layout back. The main row holds the saved consumables only; main skills come from skillBar (see buildMainRow). */
export function parseBarLayout(raw: BarLayoutSave | null | undefined, mainKeys: readonly string[] = MAIN_KEYS): BarsState {
  const main = emptyRow();
  const saved = raw?.main ?? {};
  mainKeys.forEach((key, i) => {
    const c = sanitizeCell(saved[key]);
    if (c && c.k === 'mat') main[i] = c;
  });
  return { main, bar2: sanitizeRow(raw?.bar2), bar3: sanitizeRow(raw?.bar3) };
}

/**
 * The main row as the player sees it: a saved consumable wins, otherwise the skill bound to the slot in skillBar.
 */
export function buildMainRow(
  skillBar: Partial<Record<string, string>>,
  matRow: BarRow,
  mainKeys: readonly string[] = MAIN_KEYS,
): BarRow {
  return mainKeys.map((key, i): BarCell | null => {
    const m = matRow[i];
    if (m && m.k === 'mat') return { k: 'mat', id: m.id };
    const sid = skillBar[key];
    return sid ? { k: 'skill', id: sid } : null;
  });
}
