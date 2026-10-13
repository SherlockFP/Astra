import type { ChestCtxId } from './loot';

/**
 * Loot V3 §9: Yiğitlik Taşı and the Yiğitlik Yolu (item-level upgrade track). OWNER: items module.
 * All tuning knobs live here; systems/Track.ts holds the logic.
 */
export type TrackId = 'c' | 'u' | 's' | 'e';
/** Stored in `ItemInstance.track` (systems/Track.ts augments the type): the track, the item level it dropped at, stones spent. */
export interface TrackState { t: TrackId; b: number; sp?: number }

export const TRACKS: Record<TrackId, { name: string; stone: string; cap: number; color: string }> = {
  c: { name: 'Çırak Yolu', stone: 'yt_cirak', cap: 70, color: '#b08a5a' },
  u: { name: 'Usta Yolu', stone: 'yt_usta', cap: 76, color: '#4aa3ff' },
  s: { name: 'Şampiyon Yolu', stone: 'yt_sampiyon', cap: 86, color: '#b050ff' },
  e: { name: 'Efsane Yolu', stone: 'yt_efsane', cap: 94, color: '#ff8a10' },
};

/** Item levels gained per rank. */
export const RANK_STEP = 2;
/** Stones for one rank at the item's CURRENT item level (62 -> 8, 70 -> 13, 90 -> 27). */
export const stoneCost = (ilvl: number): number => Math.ceil(6 + 0.7 * (ilvl - 60));
/** Gold for one rank. */
export const goldCost = (ilvl: number): number => 300 + 45 * ilvl;
/** Share of the stones spent on an item that a salvage returns. */
export const SALVAGE_REFUND = 0.6;
/** Per item level: flat stats / weapon numbers x 1.022, percent stats x 1.010 (the CORE_MECHANICS §4.3 ladder slope). */
export const RESCALE = { flat: 1.022, pct: 1.01 };

/** The track a boss-chest item of this context belongs to (null = none: open world, vendors, raid). */
export function trackOfContext(ctx: ChestCtxId, keyLevel: number): TrackId | null {
  switch (ctx) {
    case 'normal': return 'c';
    case 'heroic': return 'u';
    case 'mythic0': return 's';
    case 'mplus': return keyLevel >= 7 ? 'e' : 's';
    default: return null;
  }
}
