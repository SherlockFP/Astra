import type { DecorDef } from '../../types/dungeons';
import { LAYOUT } from './layout';

/**
 * Sisli Vadi decor (layout `decor`, written by tools/world-fill.mjs, drawn by world/WorldDecorFill.ts). OWNER: content module.
 * Story vignettes (camps, carts, graves, shrines), farm fields, junction signposts with destination labels, and filler clusters of
 * flowers, bushes and rocks. The generator is deterministic; edit the layout by hand, or rerun the tool, which regenerates only its
 * own entries.
 */
export const DECOR: DecorDef[] = (LAYOUT.decor ?? []).map((d) => ({
  id: d.id, kind: d.kind, recipe: d.recipe, regionId: d.region, pos: d.pos, rot: d.rot, lines: d.lines,
}));

/** Flat pads under the story decor (tile centre, m): the rolling ground does not lift or sink a vignette. Filler is not flattened. */
export const DECOR_FLATS: { pos: [number, number]; radius: number }[] = DECOR
  .filter((d) => d.kind !== 'flora' && d.kind !== 'rocks')
  .map((d) => ({ pos: d.pos, radius: d.kind === 'field' ? 8 : d.kind === 'signpost' ? 2 : 4 }));
