import { G } from '../game/G';
import type { ItemInstance } from '../types/items';
import { RANK_STEP, SALVAGE_REFUND, TRACKS, goldCost, stoneCost, trackOfContext, type TrackId, type TrackState } from '../data/trackData';
import type { ChestCtxId } from '../data/loot';
import { isEquipmentItem, refreshItemName, rescaleItem } from './ItemGen';
import { toast } from './notify';

/**
 * Loot V3 §9: Yiğitlik Yolu, the deterministic item-level upgrade track of dungeon gear. OWNER: items module.
 * A boss-chest equipment piece is stamped with `item.track = { t, b, sp }` (track, drop item level, stones spent). Each rank costs
 * Yiğitlik Taşı of the track's grade + gold, raises the item level by RANK_STEP (2) and rescales the item (ItemGen.rescaleItem),
 * up to the track's cap. Always succeeds (the Metin2 +N layer is the gamble). The panel (`yigitlik`) is NOT built yet: see
 * docs/kits/loot_v3_status.md; this module is its whole backend.
 */
declare module '../types/items' {
  interface ItemInstance {
    /** Loot V3: upgrade track state (systems/Track.ts). Absent on gear that cannot be upgraded this way. */
    track?: TrackState;
    /** Loot V3: where the item came from (dungeon, boss, key level, difficulty n/h/m/k). */
    src?: { d?: string; b?: string; k?: number; df: 'n' | 'h' | 'm' | 'k' };
  }
}

/** Stamps the track of a chest item (equipment only, and only while below the track's cap). Returns true when stamped. */
export function stampTrack(item: ItemInstance, ctx: ChestCtxId, keyLevel: number): boolean {
  const t = trackOfContext(ctx, keyLevel);
  if (!t || !isEquipmentItem(item) || item.itemLevel >= TRACKS[t].cap) return false;
  item.track = { t, b: item.itemLevel };
  return true;
}

export interface TrackInfo {
  t: TrackId;
  name: string;
  color: string;
  stone: string;
  cap: number;
  /** Ranks climbed so far / ranks available in total. */
  rank: number;
  maxRank: number;
}

export function trackInfo(item: ItemInstance): TrackInfo | null {
  const tr = item.track;
  const def = tr && TRACKS[tr.t];
  if (!tr || !def) return null;
  return {
    t: tr.t, name: def.name, color: def.color, stone: def.stone, cap: def.cap,
    rank: Math.max(0, Math.round((item.itemLevel - tr.b) / RANK_STEP)),
    maxRank: Math.max(0, Math.floor((def.cap - tr.b) / RANK_STEP)),
  };
}

/** What the next rank costs, or null when the item has no track or is at the cap. */
export function nextRankCost(item: ItemInstance): { stone: string; stones: number; gold: number; to: number } | null {
  const info = trackInfo(item);
  if (!info || item.itemLevel + RANK_STEP > info.cap) return null;
  return { stone: info.stone, stones: stoneCost(item.itemLevel), gold: goldCost(item.itemLevel), to: item.itemLevel + RANK_STEP };
}

export function canUpgradeTrack(item: ItemInstance): { ok: boolean; reason?: string } {
  if (!item.track) return { ok: false, reason: 'Bu eşya Yiğitlik Yolu\'nda değil.' };
  if (item.broken) return { ok: false, reason: 'Kırık eşya yükseltilemez.' };
  if (item.corrupted) return { ok: false, reason: 'Yozlaşmış eşya yükseltilemez.' };
  if (!nextRankCost(item)) return { ok: false, reason: 'Eşya yolun sonuna ulaştı.' };
  return { ok: true };
}

export interface TrackUpgradeResult { ok: boolean; reason?: string; from?: number; to?: number; item?: ItemInstance }

const latch = { uid: '', at: 0 };

/** Climbs one rank of the track (bag, stash or equipped item). Spends stones and gold; refuses when short. Never fails otherwise. */
export function upgradeTrack(uid: string): TrackUpgradeResult {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  const now = Date.now();
  if (latch.uid === uid && now - latch.at < 250) return { ok: false, reason: 'Çok hızlı.' };
  const f = ch.findItem(uid);
  if (!f) return { ok: false, reason: 'Eşya bulunamadı.' };
  const can = canUpgradeTrack(f.item);
  if (!can.ok) return can;
  const cost = nextRankCost(f.item)!;
  if (ch.material(cost.stone) < cost.stones) return { ok: false, reason: `${cost.stones} ${TRACKS[f.item.track!.t].name.replace(' Yolu', '')} Yiğitlik Taşı gerekli.` };
  if (ch.save.gold < cost.gold) return { ok: false, reason: `${cost.gold} altın gerekli.` };
  ch.spendMaterials([{ id: cost.stone, count: cost.stones }]);
  ch.spendGold(cost.gold);
  latch.uid = uid;
  latch.at = now;
  const from = f.item.itemLevel;
  rescaleItem(f.item, RANK_STEP);
  f.item.track!.sp = (f.item.track!.sp ?? 0) + cost.stones;
  refreshItemName(f.item);
  if (f.loc.where === 'equipment') {
    ch.recomputeStats();
    G.events.emit('equipment:changed', { slot: f.loc.slot });
  }
  G.events.emit('inventory:changed', {});
  ch.persist();
  toast(`${f.item.name ?? 'Eşya'}: eşya seviyesi ${from} → ${f.item.itemLevel}`, 'success');
  return { ok: true, from, to: f.item.itemLevel, item: f.item };
}

/** Stones returned when a track item is salvaged (SALVAGE_REFUND of the stones spent on it): [stone id, count] or null. */
export function salvageRefund(item: ItemInstance, refund = SALVAGE_REFUND): { id: string; count: number } | null {
  const tr = item.track;
  if (!tr?.sp) return null;
  const count = Math.floor(refund * tr.sp);
  return count > 0 ? { id: TRACKS[tr.t].stone, count } : null;
}
