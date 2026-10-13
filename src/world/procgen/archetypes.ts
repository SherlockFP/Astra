import type { PackRole } from './themes';

/**
 * Generic room templates of the generated maps (docs/GDD_PROCGEN.md §5.1). OWNER: world module.
 * Sizes are tiles, slot offsets are GDD tile coordinates from the rect corner (an integer is a tile centre). Doors are not part of
 * the template: the generator puts a 2 tile door on any side, and drops slots that would stand in a door lane.
 * Boss rooms are not here: they are the bosses' own arenas (arenas.ts).
 */

export type GenericKind = 'start' | 'chamber' | 'hall' | 'treasure' | 'shrine';

export interface Slot {
  at: [number, number];
  role: PackRole;
}

export interface Archetype {
  id: string;
  kind: GenericKind;
  w: number;
  h: number;
  /** Clear height above the room's floor (m). */
  ceiling: number;
  slots: Slot[];
  weight: number;
  /** Builder auto decor density 0..1. */
  autoDecor: number;
}

const S = (x: number, z: number, role: PackRole): Slot => ({ at: [x, z], role });

export const ARCHETYPES: Archetype[] = [
  { id: 'st_a', kind: 'start', w: 8, h: 8, ceiling: 8, slots: [], weight: 1, autoDecor: 0.3 },
  { id: 'st_b', kind: 'start', w: 10, h: 7, ceiling: 8, slots: [], weight: 1, autoDecor: 0.3 },

  { id: 'ch_a', kind: 'chamber', w: 8, h: 8, ceiling: 8, slots: [S(2, 2, 'trash'), S(5.5, 2, 'caster'), S(3.5, 5.2, 'mixed')], weight: 1, autoDecor: 0.5 },
  { id: 'ch_b', kind: 'chamber', w: 9, h: 7, ceiling: 8, slots: [S(2, 2, 'trash'), S(6.5, 2, 'caster'), S(4.5, 4.5, 'swarm')], weight: 1, autoDecor: 0.5 },
  { id: 'ch_c', kind: 'chamber', w: 7, h: 9, ceiling: 8, slots: [S(2, 2, 'swarm'), S(4.5, 4.2, 'trash'), S(2, 6.5, 'caster')], weight: 1, autoDecor: 0.5 },
  { id: 'ch_d', kind: 'chamber', w: 10, h: 8, ceiling: 9, slots: [S(2, 2, 'trash'), S(6, 2, 'caster'), S(3, 5.2, 'mixed'), S(7, 5, 'trash')], weight: 0.7, autoDecor: 0.5 },

  { id: 'hl_a', kind: 'hall', w: 12, h: 10, ceiling: 12, slots: [S(2.5, 2.5, 'trash'), S(8.5, 2.5, 'trash'), S(5.5, 5, 'elite'), S(2.5, 7, 'caster'), S(8.5, 7, 'swarm')], weight: 1, autoDecor: 0.6 },
  { id: 'hl_b', kind: 'hall', w: 10, h: 12, ceiling: 12, slots: [S(2.5, 2.5, 'trash'), S(6.5, 2.5, 'swarm'), S(4.5, 5.5, 'elite'), S(2.5, 9, 'mixed'), S(6.5, 9, 'caster')], weight: 1, autoDecor: 0.6 },
  { id: 'hl_c', kind: 'hall', w: 14, h: 8, ceiling: 12, slots: [S(2.5, 3.5, 'trash'), S(6.5, 2.2, 'elite'), S(10.5, 2.5, 'trash'), S(8, 5.3, 'swarm')], weight: 0.7, autoDecor: 0.6 },
  { id: 'hl_d', kind: 'hall', w: 8, h: 14, ceiling: 14, slots: [S(2.5, 2.5, 'trash'), S(5, 5.5, 'elite'), S(2.5, 8.5, 'caster'), S(5, 11, 'mixed')], weight: 0.7, autoDecor: 0.6 },

  // treasure and shrine rooms are dead ends: the pack stands in the middle, the chest / shrine at the back (placed by the generator)
  { id: 'tr_a', kind: 'treasure', w: 7, h: 7, ceiling: 8, slots: [], weight: 1, autoDecor: 0.4 },
  { id: 'tr_b', kind: 'treasure', w: 6, h: 8, ceiling: 8, slots: [], weight: 1, autoDecor: 0.4 },
  { id: 'sh_a', kind: 'shrine', w: 6, h: 6, ceiling: 8, slots: [], weight: 1, autoDecor: 0.4 },
  { id: 'sh_b', kind: 'shrine', w: 7, h: 6, ceiling: 8, slots: [], weight: 1, autoDecor: 0.4 },
];

export const ARCHETYPES_BY_KIND = (kind: GenericKind): Archetype[] => ARCHETYPES.filter((a) => a.kind === kind);
