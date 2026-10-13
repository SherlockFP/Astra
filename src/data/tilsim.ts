/**
 * GDD_ITEMS_V2 §4.4: Tılsım Yuvası (Aion godstone, P2). IT-00 STUB: the stone type and grade lists (used by materials.ts for
 * the `tilsim_<type>_<grade>` ids) and the enable flag are final. The 8 stone rows are filled by IT-40.
 * OWNER: items.
 */

/** Stone families (ids `ts_<type>`; material ids `tilsim_<type>_<grade>`). Order = §4.4 table. */
export const TILSIM_TYPES = ['firtina', 'kor', 'buz', 'kan', 'golge', 'pinar', 'demir', 'ruzgar'] as const;
export type TilsimType = (typeof TILSIM_TYPES)[number];
/** Grades: 1 Çırak, 2 Usta, 3 Kadim. Three of one grade combine into one of the next grade at the Demirci. */
export const TILSIM_GRADES = 3;

export const TILSIM_ENABLED = false;

/** One Tılsım stone (§4.4 table). `grades[i]` = Grade I, II, III: proc chance and coefficient as the doc gives them. */
export interface TilsimDef {
  id: string;                 // `ts_<type>`
  type: TilsimType;
  name: string;
  slot: 'weapon' | 'chest';
  icd: number;                // internal cooldown, seconds
  grades: { chance: number; coef: number }[];
}

/** Filled by IT-40 (8 rows). */
export const TILSIMS: Record<string, TilsimDef> = {};
