/**
 * GDD_ITEMS_V2 §4.6: Ejderha Taşları (Metin2 dragon stones, character layer, P3). IT-00 STUB: colour and grade lists (used by
 * materials.ts for the `ds_<color>_<grade>` ids), the colour bonus and the rainbow table are final. The stat table is filled by IT-46.
 * OWNER: items.
 */
import type { StatId } from '../types/stats';

/** Stone colours (ids `ds_<color>_<grade>`). Order = §4.6 table. */
export const DRAGON_COLORS = ['kizil', 'mavi', 'yesil', 'sari', 'mor', 'siyah'] as const;
export type DragonColor = (typeof DRAGON_COLORS)[number];
/** Grades: 1 Çiğ, 2 Cilalı, 3 Kusursuz, 4 Kadim (grade 4 only by alchemy). */
export const DRAGON_GRADES = 4;

export const DRAGON_ENABLED = false;

/** Three or more stones of one colour multiply that colour's stat by this (§4.6). */
export const DRAGON_COLOR_MULT = 1.25;
/** "Gökkuşağı Ruhu" (six colours): allAttr by the lowest grade among the six, grades 1..4. */
export const DRAGON_RAINBOW_ALLATTR = [8, 14, 20, 28] as const;
/** Alchemy: success chance by input grade (1→2, 2→3, 3→4) and the cost per attempt. */
export const DRAGON_ALCHEMY = {
  successPct: [80, 60, 40] as const,
  gold: [2000, 10000, 40000] as const,
  toz: [4, 10, 25] as const,
  luckStepPp: 10,
  luckMaxPp: 30,
} as const;

/** Stone registry (stat per colour and grade). Filled by IT-46. */
export const DRAGON_STONES: Partial<Record<DragonColor, { stat: StatId; values: [number, number, number, number] }>> = {};
