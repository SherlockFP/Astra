/**
 * PvP currencies, PvP gear and the PvP upgrade path (GDD_PVP_FINDER §4). OWNER: items (systems).
 *
 * - Currencies: Onur (`onur_puani`, daily cap 1500 on earning) and Fetih (`fetih_puani`, weekly cap on earning), spent at the
 *   vendors. Fetih mührü (`fetih_muhru`) pays the upgrade. World PvP honour is paid into `onur_puani` too (`grantOnur`); the
 *   old `save.pvp.honour` balance is moved once (`ensureOnurMigrated`); `save.pvp` stays the scoreboard.
 * - Gear: a PvP piece is an ordinary generated item of the ilvl track (Er 52, Şampiyon 58, Şampiyon+ 62), its PvE lines at 80 %,
 *   plus one PvP line (`fx:pvpPower` on the weapon, `fx:pvpResilience` on armour). `pvp: true`, `bound: true`.
 * - Upgrade: `pvpUpgrade(item)` steps the ilvl up through `rescaleItem` (affixes, gems, sockets and +N stay), costs 2 / 4 mühür,
 *   never fails, and stops at 62.
 * - Flags (`save.flags`, scalars): `pvp.onur_migrated`, `pvp.onur.<day>`, `pvp.fetih.<week>`, `pvp.buy.<kind>.<id>.<week>`.
 *   Old day / week keys are pruned on access.
 */
import { G } from '../game/G';
import { RNG, hashString } from '../core/utils';
import type { ClassId } from '../types/common';
import type { ItemCategory, ItemInstance } from '../types/items';
import type { StatId } from '../types/stats';
import { STAT_INFO } from '../types/stats';
import { currentWeek } from '../data/mythicAffixes';
import { BASES_BY_CATEGORY } from '../data/itemBases';
import { ONUR_DAILY_CAP, PVP_CONQUEST_STOCK, PVP_HONOR_STOCK, PVP_LINE, PVP_PVE_STAT_SHARE, PVP_SEASON_WEEKS, PVP_TRACK, PVP_TRACK_NAME, PVP_UPGRADE_COST, PvpStockRow, PvpTier, fetihWeeklyCap } from '../data/pvp/costs';
import { PVP_PIECE_NAMES, pvpSetIdOf, type PvpArmourSlot } from '../data/pvp/sets';
import { bountyDayKey } from './Bounties';
import { categoriesForClass, generateItem, rescaleItem, baseOf } from './ItemGen';
import type { VendorEntry } from './Vendor';

const ONUR = 'onur_puani';
const FETIH = 'fetih_puani';
const MUHUR = 'fetih_muhru';

// ------------------------------------------------------------------------------------------------------------ calendars
/** Week of the season, 1..8 (season = 8 mythic weeks). */
export function weekInSeason(week: number = currentWeek()): number {
  return ((Math.floor(week) % PVP_SEASON_WEEKS) + PVP_SEASON_WEEKS) % PVP_SEASON_WEEKS + 1;
}

type Ch = NonNullable<typeof G.character>;

const flagNum = (ch: Ch, key: string): number => Number(ch.save.flags[key] ?? 0);

/** Drops the day / week keys that are no longer current (keeps `save.flags` small). */
function pruneFlags(ch: Ch): void {
  const flags = ch.save.flags;
  const day = bountyDayKey();
  const week = currentWeek();
  for (const k of Object.keys(flags)) {
    if (k.startsWith('pvp.onur.') && Number(k.split('.')[2]) !== day) delete flags[k];
    else if (k.startsWith('pvp.fetih.') && Number(k.split('.')[2]) !== week) delete flags[k];
    else if (k.startsWith('pvp.buy.') && Number(k.split('.').pop()) !== week) delete flags[k];
  }
}

// ------------------------------------------------------------------------------------------------------------ Onur / Fetih
/** Moves the old world-PvP balance (`save.pvp.honour`) into `onur_puani`, once. Idempotent; called before every Onur change. */
export function ensureOnurMigrated(ch: Ch): void {
  if (ch.save.flags['pvp.onur_migrated']) return;
  ch.save.flags['pvp.onur_migrated'] = 1;
  const honour = Math.floor(ch.save.pvp?.honour ?? 0);
  if (honour > 0) ch.addMaterial(ONUR, honour);
}

export function onurToday(): { earned: number; cap: number; left: number } {
  const ch = G.character;
  const earned = ch ? flagNum(ch, `pvp.onur.${bountyDayKey()}`) : 0;
  return { earned, cap: ONUR_DAILY_CAP, left: Math.max(0, ONUR_DAILY_CAP - earned) };
}

export function fetihThisWeek(): { earned: number; cap: number; left: number; week: number } {
  const ch = G.character;
  const week = currentWeek();
  const earned = ch ? flagNum(ch, `pvp.fetih.${week}`) : 0;
  const cap = fetihWeeklyCap(weekInSeason(week));
  return { earned, cap, left: Math.max(0, cap - earned), week };
}

/**
 * Pays `n` Onur, capped by the daily limit. Returns the amount granted. `_reason` names the source (kill, flip, duel, arena...);
 * it is for the caller's log only.
 */
export function grantOnur(n: number, _reason: string): number {
  const ch = G.character;
  if (!ch || !(n > 0) || !ch.save?.flags || typeof ch.addMaterial !== 'function') return 0;
  ensureOnurMigrated(ch);
  pruneFlags(ch);
  const key = `pvp.onur.${bountyDayKey()}`;
  const earned = flagNum(ch, key);
  const g = Math.min(Math.floor(n), Math.max(0, ONUR_DAILY_CAP - earned));
  if (g <= 0) return 0;
  ch.save.flags[key] = earned + g;
  ch.addMaterial(ONUR, g);
  return g;
}

/** Pays `n` Fetih, capped by the weekly limit on earning (unspent Fetih carries). Returns the amount granted. */
export function grantFetih(n: number): number {
  const ch = G.character;
  if (!ch || !(n > 0)) return 0;
  pruneFlags(ch);
  const week = currentWeek();
  const key = `pvp.fetih.${week}`;
  const earned = flagNum(ch, key);
  const g = Math.min(Math.floor(n), Math.max(0, fetihWeeklyCap(weekInSeason(week)) - earned));
  if (g <= 0) return 0;
  ch.save.flags[key] = earned + g;
  ch.addMaterial(FETIH, g);
  return g;
}

// ------------------------------------------------------------------------------------------------------------ PvP items
const WEAPON_CATS: ItemCategory[] = ['sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'crossbow', 'bow'];
const ARMOUR_CAT: Record<PvpArmourSlot, ItemCategory> = { helm: 'helm', shoulders: 'shoulders', chest: 'chest', gloves: 'gloves', legs: 'legs', boots: 'boots' };

/** First weapon category the class can use (undefined when the class has none in the table). */
export function pvpWeaponCategory(classId: ClassId): ItemCategory | undefined {
  const allowed = new Set<ItemCategory>(categoriesForClass(classId));
  return WEAPON_CATS.find((c) => allowed.has(c));
}

/** PvE stat value at the PvP share (percent lines keep three decimals, flat lines are whole numbers). */
function pveShare(stat: StatId, v: number): number {
  const x = v * PVP_PVE_STAT_SHARE;
  return STAT_INFO[stat]?.pct ? Math.round(x * 1000) / 1000 : Math.round(x);
}

/**
 * Builds one PvP piece of a tier for a class. `slot` is an armour slot or `'weapon'`. Returns null when the class has no
 * usable base for the slot. The item is not placed anywhere.
 */
export function createPvpItem(slot: PvpArmourSlot | 'weapon', tier: PvpTier, classId: ClassId, rng: RNG = new RNG(Date.now() >>> 0 || 1)): ItemInstance | null {
  const isWeapon = slot === 'weapon';
  const category = isWeapon ? pvpWeaponCategory(classId) : ARMOUR_CAT[slot];
  if (!category || !BASES_BY_CATEGORY[category]?.length) return null;
  const ilvl = PVP_TRACK[tier];
  const item = generateItem({ itemLevel: ilvl, rarity: 'epic', category, classId, smart: true }, rng);
  // PvE lines at 80 %
  for (const a of item.affixes) a.value = pveShare(a.stat, a.value);
  if (item.implicit) for (const k of Object.keys(item.implicit) as StatId[]) item.implicit[k] = pveShare(k, item.implicit[k] ?? 0);
  if (item.weaponDamage) item.weaponDamage = [Math.max(1, Math.round(item.weaponDamage[0] * PVP_PVE_STAT_SHARE)), Math.max(2, Math.round(item.weaponDamage[1] * PVP_PVE_STAT_SHARE))];
  // one PvP line, locked (same convention as fixed unique lines)
  const line = PVP_LINE[tier];
  item.affixes.push(isWeapon
    ? { affixId: 'fx:pvpPower', stat: 'pvpPower', value: line.power, tier: 0, locked: true }
    : { affixId: 'fx:pvpResilience', stat: 'pvpResilience', value: line.resilience, tier: 0, locked: true });
  item.pvp = true;
  item.bound = true;
  const setId = isWeapon ? undefined : pvpSetIdOf(classId);   // weapons carry no set bonus (GDD_PVP_FINDER §4.3)
  if (setId) item.setId = setId;
  const base = baseOf(item);
  item.name = isWeapon ? `Gladyatör ${base?.name ?? 'Silahı'}` : PVP_PIECE_NAMES[slot];
  return item;
}

/** Next step of the ilvl track above the item's level, with its mühür cost. null at the cap (Şampiyon+). */
export function pvpNextStep(item: ItemInstance): { to: number; cost: number } | null {
  const to = (Object.values(PVP_TRACK) as number[]).sort((a, b) => a - b).find((t) => t > item.itemLevel);
  if (to === undefined) return null;
  return { to, cost: PVP_UPGRADE_COST[to] ?? 0 };
}

/** Track name of a PvP ilvl ("Er" / "Şampiyon" / "Şampiyon+"), or the ilvl as text off the track. */
export function pvpTierLabel(ilvl: number): string {
  const e = (Object.entries(PVP_TRACK) as [PvpTier, number][]).find(([, v]) => v === ilvl);
  return e ? PVP_TRACK_NAME[e[0]] : `ilvl ${ilvl}`;
}

/**
 * PvP upgrade (GDD_PVP_FINDER §4.5): one ilvl track step for the mühür cost. Affixes, gems, sockets and +N are kept (rescale,
 * not re-roll). No failure. Refuses at Şampiyon+ (62).
 */
export function pvpUpgrade(item: ItemInstance): { ok: boolean; reason?: string; to?: number; cost?: number } {
  const ch = G.character;
  if (!ch) return { ok: false, reason: 'Karakter yok.' };
  if (!item.pvp) return { ok: false, reason: 'Bu eşya PvP eşyası değil.' };
  const f = ch.findItem(item.uid);
  if (!f) return { ok: false, reason: 'Eşya üzerinde değil.' };
  if (f.item.listed) return { ok: false, reason: 'Pazarda duran eşya yükseltilemez.' };
  const step = pvpNextStep(f.item);
  if (!step) return { ok: false, reason: 'Eşya en yüksek seviyede (Şampiyon+).' };
  if (ch.material(MUHUR) < step.cost) return { ok: false, reason: `Yeterli Fetih mühürün yok (${step.cost} gerekli).` };
  ch.useMaterial(MUHUR, step.cost);
  rescaleItem(f.item, step.to - f.item.itemLevel);
  ch.recomputeStats();
  ch.persist();
  return { ok: true, to: step.to, cost: step.cost };
}

/** Owned PvP pieces (worn, bag and stash), for the upgrade list. */
export function ownedPvpItems(): ItemInstance[] {
  const ch = G.character;
  if (!ch) return [];
  const all: (ItemInstance | null | undefined)[] = [...Object.values(ch.save.equipment as Record<string, ItemInstance | null | undefined>), ...ch.save.bag, ...ch.save.stash];
  return all.filter((it): it is ItemInstance => !!it?.pvp);
}

// ------------------------------------------------------------------------------------------------------------ vendor stock
/** Weekly purchases of a stock row (flag `pvp.buy.<kind>.<id>.<week>`). */
export function weeklyBought(kind: 'pvp_honor' | 'pvp_conquest', id: string): number {
  const ch = G.character;
  if (!ch) return 0;
  return flagNum(ch, `pvp.buy.${kind}.${id}.${currentWeek()}`);
}
export function addWeeklyBought(kind: 'pvp_honor' | 'pvp_conquest', id: string, n: number): void {
  const ch = G.character;
  if (!ch) return;
  pruneFlags(ch);
  const key = `pvp.buy.${kind}.${id}.${currentWeek()}`;
  ch.save.flags[key] = flagNum(ch, key) + n;
}

/** Stock of a PvP vendor for the day (seeded per character and day). Items are created from the ilvl track. */
export function pvpStockEntries(kind: 'pvp_honor' | 'pvp_conquest', classId: ClassId, seed: number): VendorEntry[] {
  const rows: PvpStockRow[] = kind === 'pvp_honor' ? PVP_HONOR_STOCK : PVP_CONQUEST_STOCK;
  const tier: PvpTier = kind === 'pvp_honor' ? 'er' : 'sampiyon';
  const currency = kind === 'pvp_honor' ? ONUR : FETIH;
  const out: VendorEntry[] = [];
  for (const row of rows) {
    const id = `pvp:${kind}:${row.id}`;
    const weeklyKey = `${kind}.${row.id}`;
    if (row.slot === 'muhur') {
      out.push({ materialId: MUHUR, perUnit: row.count, price: row.price, currency, id, weeklyLimit: row.weeklyLimit, weeklyKey, stock: row.weeklyLimit ? Math.max(0, row.weeklyLimit - weeklyBought(kind, weeklyKey)) : undefined } as VendorEntry);
      continue;
    }
    const rng = new RNG(((seed ^ hashString(id)) >>> 0) || 1);
    const item = createPvpItem(row.slot as PvpArmourSlot | 'weapon', tier, classId, rng);
    if (!item) continue;
    out.push({
      item, price: row.price, currency, id: `${id}:${item.uid}`, requiredLevel: Math.max(1, item.itemLevel - 2),
      weeklyLimit: row.weeklyLimit, weeklyKey, stock: row.weeklyLimit ? Math.max(0, row.weeklyLimit - weeklyBought(kind, weeklyKey)) : undefined,
    } as VendorEntry);
  }
  return out;
}

