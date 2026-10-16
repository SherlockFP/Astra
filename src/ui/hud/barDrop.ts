import { G } from '../../game/G';
import { MATERIALS } from '../../data/materials';
import { DEFAULT_BAR2_BY_SPEC } from '../../data/defaultExtraBar';
import { isFlaskBase } from '../../data/flasks';
import type { SkillDef, SkillSlotKey } from '../../types/skills';
import type { BarLayoutSave } from '../../types/character';
import type { CharacterState } from '../../systems/CharacterState';
import type { DragPayload } from '../panels/items/common';
import {
  type BarCell,
  type BarsState,
  type CellRef,
  CONSUMABLE_CD_S,
  MAIN_KEYS,
  buildMainRow,
  canPickUp,
  cellAt,
  emptyState,
  isBarConsumable,
  moveCell,
  parseBarLayout,
  removeCell,
  sameCell,
  sanitizeRow,
  serializeBarLayout,
} from './barModel';

/**
 * Game side of the action bars. Reads the bar contents from the character save, writes changes back (main-bar skills
 * through CharacterState.setSkillSlot, everything else into save.barLayout), and builds the drag payloads.
 */

/** Legacy per-character extra-bar storage (before the save held them): imported once when the save has no layout. */
function legacyBars(cid: string): BarLayoutSave | null {
  try {
    const raw = localStorage.getItem('efsun.bars.' + cid);
    if (!raw) return null;
    const data = JSON.parse(raw) as { bars?: Record<string, unknown> } | null;
    return { bar2: sanitizeRow(data?.bars?.bar2), bar3: sanitizeRow(data?.bars?.bar3) };
  } catch {
    return null;
  }
}

/** The bars of the current character (empty when no character is loaded). */
export function readBars(): BarsState {
  const ch = G.character;
  if (!ch) return emptyState();
  const save = ch.save;
  if (!save.barLayout) save.barLayout = legacyBars(save.id) ?? {};
  // second-bar defaults of the spec (defensive rows), seeded once: a save with a bar2 entry is never touched
  const seed = save.spec ? DEFAULT_BAR2_BY_SPEC[save.spec] : undefined;
  if (seed && save.barLayout.bar2 === undefined) save.barLayout.bar2 = seed.map((id) => ({ k: 'skill' as const, id }));
  const parsed = parseBarLayout(save.barLayout);
  return { main: buildMainRow(save.skillBar, parsed.main), bar2: parsed.bar2, bar3: parsed.bar3 };
}

/** Writes `next` (derived from `prev`) to the save. */
export function writeBars(prev: BarsState, next: BarsState): void {
  const ch = G.character;
  if (!ch) return;
  const lay = (ch.save.barLayout ??= {});
  const data = serializeBarLayout(next, MAIN_KEYS);
  const changed: number[] = [];
  for (let i = 0; i < MAIN_KEYS.length; i++) if (!sameCell(prev.main[i], next.main[i])) changed.push(i);
  // clear first, then write: a skill moved between two main slots must not be wiped by the other slot's write
  for (const i of changed) ch.setSkillSlot(MAIN_KEYS[i] as SkillSlotKey, null);
  for (const i of changed) {
    const c = next.main[i];
    if (c?.k === 'skill') ch.setSkillSlot(MAIN_KEYS[i] as SkillSlotKey, c.id);
  }
  lay.bar2 = data.bar2;
  lay.bar3 = data.bar3;
  lay.main = data.main;
  ch.persist();
}

/** Any main-bar key takes any skill of the class (WoW layout: key 4 = r is a rotation key too, barLayout.ts). */
function mainAllows(_idx: number, def: SkillDef, ch: CharacterState): boolean {
  return def.classId === 'common' || def.classId === ch.classId;
}

/** Whether `p` may land on the cell `ref`: a skill that is unlocked (and allowed in that slot), or a consumable. */
export function barAccepts(ref: CellRef, p: DragPayload): boolean {
  const ch = G.character;
  if (!ch) return false;
  if (p.kind === 'skill') {
    const def = G.skills?.getDef(p.skillId);
    if (!def || ch.level < def.unlockLevel) return false;
    return ref.bar !== 'main' || mainAllows(ref.idx, def, ch);
  }
  if (p.kind === 'mat') return isBarConsumable(MATERIALS[p.id]?.kind);
  if (p.kind === 'item') return isBarConsumable(MATERIALS[p.item.baseId]?.kind);
  return false;
}

/** Drop onto a cell: a dragged bar cell swaps with the target; a skill book / pouch / bag drag places a copy. */
export function applyBarDrop(ref: CellRef, p: DragPayload): boolean {
  if (!barAccepts(ref, p)) return false;
  let content: BarCell;
  let from: CellRef | null = null;
  if (p.kind === 'skill') {
    content = { k: 'skill', id: p.skillId };
    from = p.cell ?? null;
  } else if (p.kind === 'mat') {
    content = { k: 'mat', id: p.id };
    from = p.cell ?? null;
  } else if (p.kind === 'item') {
    content = { k: 'mat', id: p.item.baseId };
  } else return false;
  const prev = readBars();
  writeBars(prev, moveCell(prev, from, ref, content));
  return true;
}

/** Released outside every drop zone: the dragged bar cell is removed. */
export function barDropOutside(p: DragPayload): void {
  if (p.kind !== 'skill' && p.kind !== 'mat') return;
  if (!p.cell) return;
  const prev = readBars();
  writeBars(prev, removeCell(prev, p.cell));
}

/** Drag source for a bar cell: a filled cell can be picked up (Shift held while Barları Kilitle is on). */
export function barPayload(ref: CellRef, ev?: PointerEvent): DragPayload | null {
  const c = cellAt(readBars(), ref);
  if (!c) return null;
  if (!canPickUp(G.settings?.data.barLock === true, !!ev?.shiftKey)) return null;
  return c.k === 'skill' ? { kind: 'skill', skillId: c.id, cell: ref } : { kind: 'mat', id: c.id, cell: ref };
}

/** Puts a consumable on a cell from the right-click picker, or clears the cell when `c` is null. */
export function placeBarCell(ref: CellRef, c: BarCell | null): void {
  const prev = readBars();
  writeBars(prev, c ? moveCell(prev, null, ref, c) : removeCell(prev, ref));
}

/**
 * Uses a consumable from a bar. Potions go through Combat.usePotion (its own cooldown). Other consumables go through
 * CharacterState.useConsumable and then start the shared cooldown; while it runs no bar cell fires.
 */
export function useBarMat(id: string): boolean {
  const ch = G.character;
  const p = G.player;
  if (!ch || !p) return false;
  // a flask on the bar drinks from its belt slot on its own cooldown (not the shared potion one)
  if (isFlaskBase(id)) return G.combat?.useFlask(ch.save.flasks?.findIndex((f) => f?.baseId === id) ?? -1) ?? false;
  const cd = p.statuses.get('potion_cd');
  if (cd && cd.remaining > 0.05) {
    G.events.emit('ui:toast', { text: 'Henüz hazır değil.', kind: 'warning' });
    return false;
  }
  const m = MATERIALS[id];
  if (m?.potion) return G.combat?.usePotion(m.potion.kind) ?? false;
  const r = ch.useConsumable(id);
  if (!r.ok) {
    if (r.reason) G.events.emit('ui:toast', { text: r.reason, kind: 'warning' });
    return false;
  }
  p.statuses.apply('potion_cd', CONSUMABLE_CD_S, { magnitude: 1 });
  return true;
}
