/**
 * GDD_TALENTS §2.2 — the shared 30-slot layout `TREE30`. All 30 trees (9 class + 21 spec) use the same slots,
 * positions, gates and edges; only the content differs. Pure data and helpers (type-only imports).
 *
 * Node types per tree kind: the `spec` column is the spec tree, the `cls` column the class tree (`*` in §2.2 =
 * `A` in spec trees, `M` in class trees; `s05` = `A` in both, a two-skill choice in the class tree).
 */
import type { NodeType, SlotId, TreeKind } from '../../types/talents';

/** Slot ids in canonical order (s01 … s30). */
export const SLOT_ORDER: readonly SlotId[] = [
  's01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10',
  's11', 's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20',
  's21', 's22', 's23', 's24', 's25', 's26', 's27', 's28', 's29', 's30',
];

/** Gate per row (§2.2 "Kapı"): points already spent in the tree required before the row is takeable. */
export const GATES: readonly number[] = [0, 1, 3, 5, 8, 11, 14, 17, 20, 23];

export interface SlotLayout {
  row: number;
  col: number;
  /** Node type in a spec tree. */
  spec: NodeType;
  /** Node type in a class tree. */
  cls: NodeType;
  /** Optional per-slot gate override (GDD_TALENTS F3); when absent the gate is `GATES[row]`. */
  gate?: number;
}

/** §2.2 table: canvas `x = 150 × col`, `y = 130 × row`. */
export const SLOT_LAYOUT: Record<SlotId, SlotLayout> = {
  s01: { row: 0, col: 1, spec: 'P', cls: 'P' },
  s02: { row: 0, col: 3, spec: 'C', cls: 'C' },
  s03: { row: 0, col: 5, spec: 'P', cls: 'P' },
  s04: { row: 1, col: 0, spec: 'M', cls: 'M' },
  s05: { row: 1, col: 2, spec: 'A', cls: 'A' },
  s06: { row: 1, col: 4, spec: 'P', cls: 'P' },
  s07: { row: 1, col: 6, spec: 'P', cls: 'P' },
  s08: { row: 2, col: 1, spec: 'P', cls: 'P' },
  s09: { row: 2, col: 3, spec: 'C', cls: 'C' },
  s10: { row: 2, col: 5, spec: 'P', cls: 'P' },
  s11: { row: 3, col: 0, spec: 'M', cls: 'M' },
  s12: { row: 3, col: 2, spec: 'A', cls: 'M' },
  s13: { row: 3, col: 4, spec: 'M', cls: 'M' },
  s14: { row: 3, col: 6, spec: 'P', cls: 'P' },
  s15: { row: 4, col: 1, spec: 'C', cls: 'C' },
  s16: { row: 4, col: 3, spec: 'P', cls: 'P' },
  s17: { row: 4, col: 5, spec: 'C', cls: 'C' },
  s18: { row: 5, col: 0, spec: 'M', cls: 'M' },
  s19: { row: 5, col: 2, spec: 'P', cls: 'P' },
  s20: { row: 5, col: 4, spec: 'A', cls: 'M' },
  s21: { row: 5, col: 6, spec: 'M', cls: 'M' },
  s22: { row: 6, col: 1, spec: 'P', cls: 'P' },
  s23: { row: 6, col: 3, spec: 'P', cls: 'P' },
  s24: { row: 6, col: 5, spec: 'P', cls: 'P' },
  s25: { row: 7, col: 1, spec: 'M', cls: 'M' },
  s26: { row: 7, col: 3, spec: 'C', cls: 'C' },
  s27: { row: 7, col: 5, spec: 'M', cls: 'M' },
  s28: { row: 8, col: 2, spec: 'K', cls: 'K' },
  s29: { row: 8, col: 4, spec: 'K', cls: 'K' },
  s30: { row: 9, col: 3, spec: 'K', cls: 'K' },
};

/** Palette slots, in the order the tree's `palette` list (12 stats) is assigned to them. */
export const PALETTE_SLOTS: readonly SlotId[] = [
  's01', 's03', 's06', 's07', 's08', 's10', 's14', 's16', 's19', 's22', 's23', 's24',
];

/** Node type of a slot in a tree of the given kind. */
export function slotType(slot: SlotId, kind: TreeKind): NodeType {
  const l = SLOT_LAYOUT[slot];
  return kind === 'class' ? l.cls : l.spec;
}

/** Gate of a slot: its per-slot override when present, else the gate of its row. */
export function slotGate(slot: SlotId): number {
  const l = SLOT_LAYOUT[slot];
  return l.gate ?? GATES[l.row];
}

const PARENTS: Record<SlotId, SlotId[]> = (() => {
  const out = {} as Record<SlotId, SlotId[]>;
  for (const slot of SLOT_ORDER) {
    const me = SLOT_LAYOUT[slot];
    out[slot] = me.row === 0
      ? []
      : SLOT_ORDER.filter((p) => {
          const pl = SLOT_LAYOUT[p];
          return pl.row === me.row - 1 && Math.abs(pl.col - me.col) <= 1;
        });
  }
  return out;
})();

/**
 * Parents of a slot (§2.2): the nodes of the previous row whose column differs by at most 1. Row 0 has none.
 * Returned in slot order (a fresh copy, safe to mutate).
 */
export function parentsOf(slot: SlotId): SlotId[] {
  return PARENTS[slot].slice();
}
