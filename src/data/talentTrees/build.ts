/**
 * GDD_TALENTS §2.9 — expands a raw tree (palette + authored rows, generated into `raw/<class>.ts` by T1b) into a
 * `TreeDef` of 30 nodes in slot order, using the shared layout (layout.ts) and the palette values (palette.ts).
 * Pure: no `G`, no I/O.
 */
import type { ClassId } from '../../types/common';
import type { FxText, SlotId, TreeDef, TreeKind, TreeNodeDef } from '../../types/talents';
import type { StatId } from '../../types/stats';
import { STAT_INFO } from '../../types/stats';
import type { SpecId } from '../../types/v2';
import { PALETTE_SLOTS, SLOT_LAYOUT, SLOT_ORDER, parentsOf, slotGate, slotType } from './layout';
import { PALETTE_VALUE } from './palette';

/** Option of an authored row: `''` single option, `'A'` / `'B'` the two options of a choice. */
export type RawOpt = '' | 'A' | 'B';
/** `[slot, opt, name | null, desc | null, fx]`. `null` name/desc is allowed for skill-unlock (`G`) nodes only. */
export type RawRow = [slot: SlotId, opt: RawOpt, name: string | null, desc: string | null, fx: string];
/** One tree of a raw file: 12 palette stats (slot order of PALETTE_SLOTS) and the authored rows. */
export interface RawTree {
  palette: StatId[];
  rows: RawRow[];
}
/** Default export of a generated `raw/<classId>.ts`: the class tree and the trees of the class's specs. */
export interface RawClassFile {
  class: RawTree;
  specs: Partial<Record<SpecId, RawTree>>;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function fail(treeId: string, msg: string): never {
  throw new Error(`buildTree(${treeId}): ${msg}`);
}

/** Roman numeral for the n-th repeat of a stat on one tree (n ≥ 1). */
export function roman(n: number): string {
  return ROMAN[n] ?? String(n);
}

/** Gain text of one rank for a palette node: `+7`, or `+%6` for a fraction (0.06). */
export function formatGain(value: number): string {
  return Number.isInteger(value) ? `+${value}` : `+%${Number((value * 100).toFixed(2))}`;
}

/**
 * Two options (A and B) per slot: every choice `C`, the capstone `s30`, and the class-tree `A` at `s05` (a choice of
 * two skills). Everything else has one option (`''`).
 */
function hasTwoOptions(slot: SlotId, type: TreeNodeDef['type'], kind: TreeKind): boolean {
  return type === 'C' || (type === 'K' && slot === 's30') || (type === 'A' && kind === 'class');
}

/**
 * Builds one tree. Throws when a required row is missing, a row is unexpected (unknown slot, palette slot, duplicate
 * or wrong option), an fx string is empty, or the palette does not hold 12 stats with a palette value.
 * A `P` node has one generated option: `S <stat>=<value>` per rank.
 */
export function buildTree(
  treeId: string,
  kind: TreeKind,
  classId: ClassId,
  specId: SpecId | undefined,
  name: string,
  raw: RawTree,
): TreeDef {
  if (kind === 'spec' && !specId) fail(treeId, 'spec tree without specId');
  if (raw.palette.length !== PALETTE_SLOTS.length) {
    fail(treeId, `palette has ${raw.palette.length} stats, expected ${PALETTE_SLOTS.length}`);
  }

  const bySlot = new Map<SlotId, Map<RawOpt, RawRow>>();
  for (const row of raw.rows) {
    const [slot, opt] = row;
    if (!(slot in SLOT_LAYOUT)) fail(treeId, `unknown slot ${String(slot)}`);
    if (PALETTE_SLOTS.includes(slot)) fail(treeId, `authored row on palette slot ${slot}`);
    let m = bySlot.get(slot);
    if (!m) {
      m = new Map<RawOpt, RawRow>();
      bySlot.set(slot, m);
    }
    if (m.has(opt)) fail(treeId, `duplicate row ${slot}${opt}`);
    m.set(opt, row);
  }

  const repeats = new Map<StatId, number>();
  const nodes: TreeNodeDef[] = [];
  for (const slot of SLOT_ORDER) {
    const layout = SLOT_LAYOUT[slot];
    const type = slotType(slot, kind);
    const base = {
      slot,
      type,
      row: layout.row,
      col: layout.col,
      gate: slotGate(slot),
      parents: parentsOf(slot),
    };

    if (type === 'P') {
      const stat = raw.palette[PALETTE_SLOTS.indexOf(slot)];
      const value = PALETTE_VALUE[stat];
      if (value === undefined) fail(treeId, `no palette value for ${stat}`);
      const n = (repeats.get(stat) ?? 0) + 1;
      repeats.set(stat, n);
      const statName = STAT_INFO[stat].name;
      const option: FxText = {
        name: n > 1 ? `${statName} ${roman(n)}` : statName,
        desc: `${formatGain(value)} ${statName} / rank`,
        fx: `S ${stat}=${value}`,
      };
      nodes.push({ ...base, ranks: 2, stat, options: [option] });
      continue;
    }

    const wanted: RawOpt[] = hasTwoOptions(slot, type, kind) ? ['A', 'B'] : [''];
    const rows = bySlot.get(slot) ?? new Map<RawOpt, RawRow>();
    for (const opt of rows.keys()) {
      if (!wanted.includes(opt)) fail(treeId, `unexpected row ${slot}${opt} for a ${type} node`);
    }
    const options: FxText[] = wanted.map((opt) => {
      const row = rows.get(opt);
      if (!row) fail(treeId, `missing row ${slot}${opt} (${type} node)`);
      const [, , rowName, rowDesc, fx] = row;
      if (!fx) fail(treeId, `empty fx at ${slot}${opt}`);
      // a skill-unlock node (`G`) takes its name and description from the skill itself: keep them empty here
      return { name: rowName ?? '', desc: rowDesc ?? '', fx };
    });
    nodes.push({ ...base, ranks: 1, options });
  }

  return {
    id: treeId,
    kind,
    classId,
    ...(specId ? { specId } : {}),
    name,
    nodes,
  };
}
