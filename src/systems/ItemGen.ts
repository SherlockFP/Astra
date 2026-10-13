import { G } from '../game/G';
import { RNG, clamp, uid } from '../core/utils';
import { RARITY_COLORS, RARITY_ORDER, type ClassId, type Rarity } from '../types/common';
import { STAT_INFO, type StatBlock, type StatId } from '../types/stats';
import type { AffixDef, EquipSlot, ItemBaseDef, ItemCategory, ItemInstance, LocalMod, RolledAffix, UniqueDef } from '../types/items';
import { ITEM_BASES, IMPLICIT_PER_ILVL, BASES_BY_CATEGORY, CLASS_ARMOR_WEIGHT, CLASS_NAMES_TR, CLASS_WEAPONS, CLASS_OFFHANDS, CATEGORY_NAMES_TR, TIER_MIN_ILVL, tierForIlvl, isWeaponCategory, isEquipmentCategory } from '../data/itemBases';
import { AFFIX_BY_ID, ITEM_AFFIXES, TIER_WEIGHTS, tierNumberOfGate, DECIMAL_PCT_STATS, CLASS_AFFINITY } from '../data/affixes';
import { UNIQUES, SETS, SET_PIECES, CLASS_SET } from '../data/uniques';
import { parseGemId } from '../data/gems';
import { GEM_COLORS, gemName, MATERIALS } from '../data/materials';
import { MAX_UPGRADE_BY_RARITY, stepOf } from '../data/upgrades';
import { RARITY_WEIGHTS, type RankKey } from '../data/loot';

/** Everything a tooltip needs, computed by the items module (hud renders it in UI.itemTooltipHTML). */
export interface ItemDescription {
  name: string;                 // full name incl. "+7"
  rarity: Rarity;
  color: string;                // rarity css colour
  slotLabel: string;            // "Tek El Kılıç", "Kask"...
  itemLevel: number;
  requiredLevel: number;
  classes?: string[];           // Turkish class names allowed
  damage?: { min: number; max: number; aps: number; dps: number };
  armor?: number;
  implicitLines: string[];      // base stat lines
  affixLines: { text: string; tier: number; locked?: boolean; kind: 'prefix' | 'suffix' | 'unique' }[];
  upgradeLine?: string;         // "+7 Yükseltme: +35% hasar"
  socketLines: { gemName: string | null; text: string | null; color: string | null }[];
  setInfo?: { name: string; pieces: { name: string; owned: boolean }[]; bonuses: { count: number; text: string; active: boolean }[] };
  specialLines: string[];       // legendary effects (orange)
  flavor?: string;
  sellPrice: number;
  totalStats: StatBlock;        // all stats this item gives (for comparison deltas)
  icon: string;
  isEquipment: boolean;
  stack?: number;
  // ---- items module extras (optional for the renderer) ----
  /** Base item name (shown on a second line for Nadir/Destansı items whose name is generated). */
  baseName?: string;
  /** "Ruha Bağlı" */
  bound?: boolean;
  /** Plain-text effect of the item's upgrade tier ("Mavi parıltı"). */
  glow?: string;
  /** Upgrade level and its cap for this item (0 = cannot be upgraded). */
  upgrade?: number;
  maxUpgrade?: number;
  /** Material/consumable description (stackables). */
  desc?: string;
  /** Item level / weapon numbers before upgrade bonus (for "base damage" lines). */
  baseDamage?: { min: number; max: number };
  unique?: boolean;
  locked?: boolean;
}

// ============================================================================ constants
export const defaultRng = new RNG((Math.random() * 2 ** 32) >>> 0);

export const RARITY_AFFIX_RULES: Record<Rarity, { min: number; max: number; pre: number; suf: number; sockets: [number, number, number] }> = {
  // sockets: [P(>=1), P(>=2), P(>=3)] rolled in sequence
  poor: { min: 0, max: 0, pre: 0, suf: 0, sockets: [0, 0, 0] },
  common: { min: 0, max: 0, pre: 0, suf: 0, sockets: [0.25, 0, 0] },
  uncommon: { min: 1, max: 2, pre: 1, suf: 1, sockets: [0.3, 0, 0] },
  rare: { min: 3, max: 4, pre: 2, suf: 2, sockets: [0.4, 0.15, 0] },
  epic: { min: 5, max: 5, pre: 3, suf: 3, sockets: [1, 0.3, 0] },
  legendary: { min: 1, max: 1, pre: 1, suf: 1, sockets: [1, 0, 0] },
  set: { min: 0, max: 0, pre: 0, suf: 0, sockets: [1, 0, 0] },
};
const RARITY_IMPLICIT_MULT: Record<Rarity, number> = { poor: 0.75, common: 1, uncommon: 1, rare: 1, epic: 1.1, legendary: 1.1, set: 1.1 };
const SELL_RARITY_MULT: Record<Rarity, number> = { poor: 0.5, common: 1, uncommon: 2, rare: 4, epic: 8, legendary: 12, set: 12 };

const NAME_A = ['Kan', 'Gece', 'Fırtına', 'Kemik', 'Ölüm', 'Kor', 'Kuzgun', 'Demir', 'Gölge', 'Yıldız', 'Kurt', 'Ejder', 'Buz', 'Kül', 'Şimşek', 'Kader', 'Zehir', 'Ruh', 'Taş', 'Alev'];
const NAME_WEAPON = ['Dişi', 'Pençesi', 'Kesen', 'Yaran', 'Fısıltısı', 'Hükmü', 'Çığlığı', 'Laneti', 'Gazabı', 'Öpücüğü'];
const NAME_ARMOR = ['Kabuğu', 'Siperi', 'Postu', 'Kalesi', 'Örtüsü', 'Pulu', 'Duvarı', 'Peçesi', 'Zırhı', 'Sargısı'];
const NAME_JEWEL = ['Gözü', 'Mührü', 'Halkası', 'Yüreği', 'Sırrı', 'Tılsımı', 'Gözyaşı', 'Nefesi', 'Düğümü', 'Yemini'];
const NAME_POOR = ['Eski', 'Aşınmış', 'Paslı', 'Kırık', 'Yıpranmış', 'Çürük'];

export const SLOTS_FOR_CATEGORY: Partial<Record<ItemCategory, EquipSlot[]>> = {
  helm: ['helm'], shoulders: ['shoulders'], chest: ['chest'], gloves: ['gloves'], legs: ['legs'], boots: ['boots'], belt: ['belt'],
  amulet: ['amulet'], ring: ['ring1', 'ring2'],
  sword1h: ['weapon'], sword2h: ['weapon'], axe1h: ['weapon'], axe2h: ['weapon'], mace: ['weapon'], staff: ['weapon'], wand: ['weapon'],
  dagger: ['weapon', 'offhand'], crossbow: ['weapon'], bow: ['weapon'], shield: ['offhand'], tome: ['offhand'], quiver: ['offhand'],
};
export const slotsForCategory = (c: ItemCategory): EquipSlot[] => SLOTS_FOR_CATEGORY[c] ?? [];

// ============================================================================ small helpers
export const baseOf = (item: ItemInstance): ItemBaseDef | undefined => ITEM_BASES[item.baseId];
export const isEquipmentItem = (item: ItemInstance): boolean => {
  const b = baseOf(item);
  return !!b && isEquipmentCategory(b.category);
};
export const requiredLevelOf = (item: ItemInstance): number => clamp(Math.round(item.itemLevel) - 2, 1, 60);
export const rarityIndex = (r: Rarity): number => RARITY_ORDER.indexOf(r);
export const maxUpgradeOf = (item: ItemInstance): number => (isEquipmentItem(item) ? MAX_UPGRADE_BY_RARITY[item.rarity] ?? 0 : 0);

function roundStat(stat: StatId, v: number): number {
  if (STAT_INFO[stat]?.pct) return Math.round(v * 10000) / 10000;
  return Math.round(v);
}
/** Round a freshly rolled affix value: crit chance / life steal / dodge keep 0.1%, other percents whole %, flat whole numbers. */
function roundAffixValue(stat: StatId, v: number, local?: LocalMod): number {
  if (local === 'wpnDamagePct' || local === 'armorPct') return Math.round(v * 100) / 100;
  if (local === 'wpnAddFlat') return Math.round(v);
  if (STAT_INFO[stat]?.pct) return DECIMAL_PCT_STATS.has(stat) ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100;
  return Math.round(v);
}

export function affixLocal(a: RolledAffix): LocalMod | undefined {
  if (a.affixId.startsWith('fx:')) return a.affixId.split(':')[2] as LocalMod | undefined;
  return AFFIX_BY_ID[a.affixId]?.local;
}
const affixWeaponMult = (a: RolledAffix): number => AFFIX_BY_ID[a.affixId]?.weaponMult ?? 1;
export const isFixedAffix = (a: RolledAffix): boolean => a.affixId.startsWith('fx:');

/** Multiplier applied to random affix values from +10 upward ("Efsun gücü bonusu"). */
export function efsunBoost(item: ItemInstance): number {
  return 1 + stepOf(item.upgrade ?? 0).efsunBonus;
}

// ============================================================================ rarity & base picking
export interface RarityCtx {
  rank?: RankKey;
  /** Magic find as a fraction (0.5 = +50%). */
  magicFind?: number;
  minRarity?: Rarity;
  maxRarity?: Rarity;
  /** Multiplier on the legendary weight (pity). */
  legendaryMult?: number;
  /** Allow set pieces (bosses / chests only). */
  allowSet?: boolean;
  /** Explicit weights override (rarity -> weight), e.g. for chests. */
  weights?: Partial<Record<Rarity, number>>;
}

export function rollRarity(ilvl: number, ctx: RarityCtx = {}, rng: RNG = defaultRng): Rarity {
  const mf = clamp(ctx.magicFind ?? 0, 0, 2.5);
  const rankMult = (r: Rarity) => {
    const w = RARITY_WEIGHTS[r];
    if (ctx.rank === 'boss') return w.boss;
    if (ctx.rank === 'elite' || ctx.rank === 'miniboss') return w.elite;
    return 1;
  };
  const minI = ctx.minRarity ? rarityIndex(ctx.minRarity) : 0;
  const maxI = ctx.maxRarity ? rarityIndex(ctx.maxRarity) : RARITY_ORDER.length - 1;
  const entries: { r: Rarity; w: number }[] = [];
  for (const r of RARITY_ORDER) {
    const i = rarityIndex(r);
    if (i < minI || i > maxI) continue;
    const def = RARITY_WEIGHTS[r];
    if (ilvl < def.minIlvl) continue;
    let w = ctx.weights ? ctx.weights[r] ?? 0 : def.base * rankMult(r);
    if (!ctx.weights) {
      if (r === 'uncommon' || r === 'rare') w *= 1 + mf;
      else if (r === 'epic' || r === 'legendary' || r === 'set') w *= 1 + mf / 2;
      if (r === 'legendary') w *= ctx.legendaryMult ?? 1;
      if (r === 'set' && !(ctx.allowSet ?? ctx.rank === 'boss')) w = 0;
    }
    entries.push({ r, w });
  }
  if (!entries.some((e) => e.w > 0)) return ctx.minRarity ?? 'common';
  return rng.weighted(entries, (e) => e.w).r;
}

const ALL_PICK_CATEGORIES: { c: ItemCategory; w: number }[] = [
  { c: 'helm', w: 1 }, { c: 'shoulders', w: 1 }, { c: 'chest', w: 1 }, { c: 'gloves', w: 1 }, { c: 'legs', w: 1 }, { c: 'boots', w: 1 },
  { c: 'belt', w: 0.8 }, { c: 'amulet', w: 0.7 }, { c: 'ring', w: 1 },
  { c: 'sword1h', w: 1 }, { c: 'axe2h', w: 1 }, { c: 'staff', w: 1 }, { c: 'wand', w: 0.8 }, { c: 'dagger', w: 1 },
  { c: 'shield', w: 0.7 }, { c: 'tome', w: 0.7 },
];

export function categoriesForClass(classId: ClassId): ItemCategory[] {
  return [...ALL_PICK_CATEGORIES.map((x) => x.c).filter((c) => !isWeaponCategory(c) && c !== 'shield' && c !== 'tome'), ...CLASS_WEAPONS[classId], ...CLASS_OFFHANDS[classId]];
}

export function classCanUse(classId: ClassId, base: ItemBaseDef): boolean {
  return !base.classes || base.classes.includes(classId);
}

export function pickBase(ilvl: number, opts: { category?: ItemCategory; classId?: ClassId; smart?: boolean; focus?: ItemCategory[] } = {}, rng: RNG = defaultRng): ItemBaseDef {
  const smart = !!opts.classId && (opts.smart ?? true) && rng.chance(0.75);
  let cats: { c: ItemCategory; w: number }[];
  if (opts.category) cats = [{ c: opts.category, w: 1 }];
  else if (opts.focus && opts.focus.length && rng.chance(0.5)) cats = opts.focus.map((c) => ({ c, w: 1 }));
  else if (smart && opts.classId) {
    const allowed = new Set(categoriesForClass(opts.classId));
    cats = ALL_PICK_CATEGORIES.filter((x) => allowed.has(x.c));
  } else cats = ALL_PICK_CATEGORIES;
  for (let attempt = 0; attempt < 6; attempt++) {
    const cat = rng.weighted(cats, (x) => x.w).c;
    let pool = (BASES_BY_CATEGORY[cat] ?? []).filter((b) => ilvl >= b.itemLevelRange[0]);
    if (smart && opts.classId) {
      const filtered = pool.filter((b) => classCanUse(opts.classId!, b));
      if (filtered.length) pool = filtered;
    }
    if (!pool.length) continue;
    const topTier = Math.max(...pool.map((b) => b.tier ?? 1));
    return rng.weighted(pool, (b) => ((b.tier ?? 1) === topTier ? 3 : 1));
  }
  // fallback: any base at all
  return ITEM_BASES['sword1h_t1'];
}

// ============================================================================ affix rolling
function eligibleTiers(def: AffixDef, ilvl: number): AffixDef['tiers'] {
  return def.tiers.filter((t) => ilvl >= t.minItemLevel);
}

/** Roll one affix of `def` for an item level. `tierPick`: restrict to given tier numbers (5..0); `bestN`: only the best N eligible tiers (epic = 3). */
export function rollAffixOf(def: AffixDef, ilvl: number, rng: RNG, opts: { tiers?: number[]; bestN?: number; twoHanded?: boolean; locked?: boolean } = {}): RolledAffix | null {
  let tiers = eligibleTiers(def, ilvl);
  if (opts.tiers) {
    const restricted = tiers.filter((t) => opts.tiers!.includes(tierNumberOfGate(t.minItemLevel)));
    if (restricted.length) tiers = restricted;
  }
  if (!tiers.length) return null;
  if (opts.bestN && tiers.length > opts.bestN) tiers = tiers.slice(tiers.length - opts.bestN);
  const t = rng.weighted(tiers, (x) => TIER_WEIGHTS[tierNumberOfGate(x.minItemLevel)] ?? 10);
  let v = rng.range(t.min, t.max);
  if (def.local === 'wpnAddFlat' && opts.twoHanded) v *= 1.5;
  const out: RolledAffix = { affixId: def.id, stat: def.stat, value: roundAffixValue(def.stat, v, def.local), tier: tierNumberOfGate(t.minItemLevel) };
  if (opts.locked) out.locked = true;
  return out;
}

function affixPoolFor(category: ItemCategory, ilvl: number, kind: 'prefix' | 'suffix' | null, exclude: Set<string>, excludeStats: Set<string>): AffixDef[] {
  return ITEM_AFFIXES.filter((a) => (!kind || a.kind === kind) && !exclude.has(a.id) && !excludeStats.has(a.stat + (a.local ?? '')) && (!a.categories || a.categories.includes(category)) && ilvl >= a.tiers[0].minItemLevel);
}

function pickAffixDef(pool: AffixDef[], classId: ClassId | undefined, rng: RNG): AffixDef | null {
  if (!pool.length) return null;
  const smart = !!classId && rng.chance(0.5);
  const fav = smart ? new Set<StatId>(CLASS_AFFINITY[classId!] ?? []) : null;
  return rng.weighted(pool, (a) => a.weight * (fav && fav.has(a.stat) ? 2 : 1));
}

/**
 * Roll `count` more affixes onto `existing` respecting rarity limits (prefix/suffix caps), duplicates and category.
 * Returns only the NEW affixes.
 */
export function rollMoreAffixes(
  category: ItemCategory, ilvl: number, rarity: Rarity, count: number, existing: RolledAffix[], rng: RNG,
  opts: { classId?: ClassId; twoHanded?: boolean; bestN?: number; kindsOnly?: 'prefix' | 'suffix' } = {},
): RolledAffix[] {
  const rules = RARITY_AFFIX_RULES[rarity];
  const used = new Set(existing.map((a) => a.affixId));
  const usedStats = new Set(existing.map((a) => a.stat + (affixLocal(a) ?? '')));
  const counts = { prefix: 0, suffix: 0 };
  for (const a of existing) {
    const d = AFFIX_BY_ID[a.affixId];
    if (d) counts[d.kind]++;
  }
  const limit = rarity === 'legendary' ? { prefix: 1, suffix: 1 } : { prefix: rules.pre, suffix: rules.suf };
  const out: RolledAffix[] = [];
  for (let i = 0; i < count; i++) {
    const prefixLeft = limit.prefix - counts.prefix;
    const suffixLeft = limit.suffix - counts.suffix;
    let kind: 'prefix' | 'suffix' | null = opts.kindsOnly ?? null;
    if (!kind) {
      if (prefixLeft <= 0 && suffixLeft <= 0) break;
      if (prefixLeft <= 0) kind = 'suffix';
      else if (suffixLeft <= 0) kind = 'prefix';
      else kind = rng.chance(prefixLeft / (prefixLeft + suffixLeft)) ? 'prefix' : 'suffix';
    }
    let def = pickAffixDef(affixPoolFor(category, ilvl, kind, used, usedStats), opts.classId, rng);
    if (!def && !opts.kindsOnly) {
      const other = kind === 'prefix' ? 'suffix' : 'prefix';
      if ((other === 'prefix' ? prefixLeft : suffixLeft) > 0) {
        def = pickAffixDef(affixPoolFor(category, ilvl, other, used, usedStats), opts.classId, rng);
        if (def) kind = other;
      }
    }
    if (!def) continue;
    const rolled = rollAffixOf(def, ilvl, rng, { twoHanded: opts.twoHanded, bestN: opts.bestN });
    if (!rolled) {
      used.add(def.id);
      i--;
      if (used.size > ITEM_AFFIXES.length) break;
      continue;
    }
    used.add(def.id);
    usedStats.add(def.stat + (def.local ?? ''));
    counts[def.kind]++;
    out.push(rolled);
  }
  return out;
}

const randomAffixCount = (rarity: Rarity, rng: RNG): number => {
  const r = RARITY_AFFIX_RULES[rarity];
  return r.min === r.max ? r.min : rng.int(r.min, r.max);
};

// ============================================================================ item construction
function rollSockets(base: ItemBaseDef, rarity: Rarity, rng: RNG): (string | null)[] | undefined {
  const r = RARITY_AFFIX_RULES[rarity].sockets;
  const max = base.maxSockets ?? 1;
  let n = 0;
  for (let i = 0; i < 3 && i < max; i++) {
    if (rng.chance(r[i])) n++;
    else break;
  }
  return n > 0 ? new Array<string | null>(n).fill(null) : undefined;
}

/** Base numbers (weapon damage, armour, implicit) rolled for an item level and rarity. */
function rollBaseNumbers(item: ItemInstance, base: ItemBaseDef, rng: RNG): void {
  const rm = RARITY_IMPLICIT_MULT[item.rarity];
  const ilvl = item.itemLevel;
  if (base.typeMult && base.weaponDamage) {
    const avg = (4 + 2.5 * ilvl) * base.typeMult * rm;
    const q1 = rng.range(0.95, 1.05), q2 = rng.range(0.95, 1.05);
    item.weaponDamage = [Math.max(1, Math.round(0.8 * avg * q1)), Math.max(2, Math.round(1.2 * avg * q2))];
  }
  const imp: StatBlock = {};
  const per = IMPLICIT_PER_ILVL[base.id];
  const raw = base.implicit ?? {};
  for (const k of Object.keys(raw) as StatId[]) {
    const v = ((raw[k] ?? 0) + (per?.[k] ?? 0) * ilvl) * rm;
    imp[k] = roundStat(k, v);
  }
  if (base.slotMult && base.armorWeight) imp.armor = Math.max(1, Math.round((10 + 4.2 * ilvl) * base.slotMult * rm * rng.range(0.95, 1.05)));
  if (Object.keys(imp).length) item.implicit = imp;
}

function wordsFor(base: ItemBaseDef): string[] {
  const c = base.category;
  if (isWeaponCategory(c) || c === 'tome') return NAME_WEAPON;
  if (c === 'ring' || c === 'amulet') return NAME_JEWEL;
  return NAME_ARMOR;
}

function twoWordName(base: ItemBaseDef, rng: RNG): string {
  return `${rng.pick(NAME_A)} ${rng.pick(wordsFor(base))}`;
}

/** Display name without upgrade decoration. */
export function cleanName(name: string | undefined): string {
  return (name ?? '').replace(/\s\+\d+$/, '').replace(/^Kusursuz\s/, '');
}

/** Item name + "+N" (and "Kusursuz" at +15). */
export function itemDisplayName(item: ItemInstance): string {
  const base = baseOf(item);
  const clean = cleanName(item.name) || base?.name || item.baseId;
  const up = item.upgrade ?? 0;
  return (up >= 15 ? 'Kusursuz ' : '') + clean + (up > 0 ? ` +${up}` : '');
}
/** Keep `item.name` in sync with the upgrade level (name incl. "+N" as ItemInstance documents). */
export function refreshItemName(item: ItemInstance): void {
  item.name = itemDisplayName(item);
}

function nameForMagic(base: ItemBaseDef, affixes: RolledAffix[]): string {
  const pre = affixes.map((a) => AFFIX_BY_ID[a.affixId]).find((d) => d?.kind === 'prefix');
  const suf = affixes.map((a) => AFFIX_BY_ID[a.affixId]).find((d) => d?.kind === 'suffix');
  return `${pre ? pre.name + ' ' : ''}${base.name}${suf ? ` (${suf.name})` : ''}`;
}

export interface GenOpts {
  itemLevel: number;
  rarity?: Rarity;
  baseId?: string;
  category?: ItemCategory;
  /** Looter's class: smart loot (75% usable gear, 70% usable legendaries) and class-flavoured affix weights. */
  classId?: ClassId;
  uniqueId?: string;
  setPieceId?: string;
  smart?: boolean;
  rarityCtx?: RarityCtx;
  /** Bias equipment categories (named loot tables). */
  focus?: ItemCategory[];
  /** Probability that a legendary-or-better roll turns into the class set piece (default 0). */
  setChance?: number;
}

function resolveBaseId(template: string, ilvl: number, classId: ClassId | undefined, pieceClass?: ClassId): string {
  const w = CLASS_ARMOR_WEIGHT[(pieceClass ?? classId ?? 'knight') as ClassId];
  return template.replace('{w}', w).replace('{t}', String(tierForIlvl(ilvl)));
}

/** Generate an item (bases x rarity x affixes x item level). `rng` defaults to a module stream. */
export function generateItem(opts: GenOpts, rng: RNG = defaultRng): ItemInstance {
  const ilvl = clamp(Math.round(opts.itemLevel), 1, 95);
  if (opts.uniqueId) return generateUnique(opts.uniqueId, ilvl, rng, opts.classId);
  if (opts.setPieceId) return generateSetPiece(opts.setPieceId, ilvl, rng);
  let rarity = opts.rarity ?? rollRarity(ilvl, opts.rarityCtx ?? {}, rng);

  if (rarity === 'legendary') {
    const u = pickUnique(ilvl, opts.classId, opts.category, rng);
    if (u) return generateUnique(u.id, Math.max(ilvl, u.minItemLevel ?? 1), rng, opts.classId);
    rarity = 'epic';
  } else if (rarity === 'set') {
    const piece = pickSetPiece(ilvl, opts.classId, rng);
    if (piece) return generateSetPiece(piece.id, ilvl, rng);
    rarity = 'epic';
  }
  // legendary/set requested through rarityCtx may also be redirected into the class set
  if (rarity === 'epic' && opts.setChance && ilvl >= 40 && rng.chance(opts.setChance)) {
    const piece = pickSetPiece(ilvl, opts.classId, rng);
    if (piece) return generateSetPiece(piece.id, ilvl, rng);
  }

  const base = opts.baseId && ITEM_BASES[opts.baseId] ? ITEM_BASES[opts.baseId] : pickBase(ilvl, { category: opts.category, classId: opts.classId, smart: opts.smart, focus: opts.focus }, rng);
  return buildFromBase(base, ilvl, rarity, rng, opts.classId);
}

export function buildFromBase(base: ItemBaseDef, ilvl: number, rarity: Rarity, rng: RNG, classId?: ClassId): ItemInstance {
  const item: ItemInstance = {
    uid: uid('i'), baseId: base.id, rarity, itemLevel: ilvl, upgrade: 0, affixes: [], identified: true, createdAt: Date.now(),
  };
  rollBaseNumbers(item, base, rng);
  if (rarity !== 'poor' && rarity !== 'set' && rarity !== 'legendary') {
    const n = randomAffixCount(rarity, rng);
    item.affixes = rollMoreAffixes(base.category, ilvl, rarity, n, [], rng, { classId, twoHanded: base.twoHanded, bestN: rarity === 'epic' ? 3 : undefined });
  }
  item.sockets = rollSockets(base, rarity, rng);
  switch (rarity) {
    case 'poor': item.name = `${rng.pick(NAME_POOR)} ${base.name}`; break;
    case 'common': item.name = base.name; break;
    case 'uncommon': item.name = nameForMagic(base, item.affixes); break;
    default: item.name = twoWordName(base, rng);
  }
  if (!item.sockets) delete item.sockets;
  return item;
}

function pickUnique(ilvl: number, classId: ClassId | undefined, category: ItemCategory | undefined, rng: RNG): UniqueDef | null {
  let pool = Object.values(UNIQUES).filter((u) => ilvl >= (u.minItemLevel ?? 1));
  if (category) pool = pool.filter((u) => ITEM_BASES[u.baseId.replace('{w}', 'heavy').replace('{t}', '1')]?.category === category);
  if (!pool.length) return null;
  if (classId && rng.chance(0.7)) {
    const mine = pool.filter((u) => !u.classes || u.classes.includes(classId));
    if (mine.length) pool = mine;
  }
  return rng.pick(pool);
}

function pickSetPiece(ilvl: number, classId: ClassId | undefined, rng: RNG) {
  if (ilvl < 40) return null;
  const all = Object.values(SET_PIECES);
  let pool = all;
  if (classId && rng.chance(0.7)) pool = all.filter((p) => p.setId === CLASS_SET[classId]);
  return pool.length ? rng.pick(pool) : null;
}

const MAIN_STAT: Record<ClassId, StatId> = {
  knight: 'str', barbarian: 'str', mage: 'int', rogue: 'dex',
  monk: 'dex', archer: 'dex', paladin: 'str', necromancer: 'int', warlock: 'int',   // GDD_CLASSES_V2 §2.1–§6.1
};
export const mainStatOf = (c: ClassId): StatId => MAIN_STAT[c];

export function generateUnique(uniqueId: string, ilvl: number, rng: RNG = defaultRng, classId?: ClassId): ItemInstance {
  const def = UNIQUES[uniqueId];
  if (!def) return generateItem({ itemLevel: ilvl, rarity: 'epic', classId }, rng);
  const looterClass = classId ?? def.classes?.[0] ?? 'knight';
  const baseId = resolveBaseId(def.baseId, ilvl, looterClass, def.classes?.[0]);
  const base = ITEM_BASES[baseId] ?? ITEM_BASES[def.baseId];
  const lvl = clamp(Math.max(ilvl, def.minItemLevel ?? 1), 1, 95);
  const item: ItemInstance = {
    uid: uid('i'), baseId: base.id, rarity: 'legendary', itemLevel: lvl, upgrade: 0, affixes: [], uniqueId: def.id, name: def.name, identified: true, bound: true, createdAt: Date.now(),
  };
  rollBaseNumbers(item, base, rng);
  def.fixedAffixes.forEach((f) => {
    const stat = f.mainStat ? MAIN_STAT[looterClass] : f.stat;
    const raw = rng.range(f.min, f.max);
    item.affixes.push({
      affixId: `fx:${stat}${f.local ? ':' + f.local : ''}`, stat, value: roundAffixValue(stat, raw, f.local), tier: 0, locked: true,
    });
  });
  item.affixes.push(...rollMoreAffixes(base.category, lvl, 'legendary', 1, [], rng, { classId: looterClass, twoHanded: base.twoHanded }));
  item.sockets = rollSockets(base, 'legendary', rng);
  if (!item.sockets) delete item.sockets;
  return item;
}

export function generateSetPiece(pieceId: string, ilvl: number, rng: RNG = defaultRng): ItemInstance {
  const piece = SET_PIECES[pieceId];
  if (!piece) return generateItem({ itemLevel: ilvl, rarity: 'epic' }, rng);
  const classId = piece.classId ?? 'knight';
  const lvl = clamp(Math.max(ilvl, 40), 1, 95);
  const baseId = resolveBaseId(piece.baseId, lvl, classId, classId);
  const base = ITEM_BASES[baseId] ?? ITEM_BASES['sword1h_t1'];
  const item: ItemInstance = {
    uid: uid('i'), baseId: base.id, rarity: 'set', itemLevel: lvl, upgrade: 0, affixes: [], uniqueId: pieceId, setId: piece.setId, name: piece.name, identified: true, bound: true, createdAt: Date.now(),
  };
  rollBaseNumbers(item, base, rng);
  // 4 fixed lines at T2-T1: class main stat, vit, one slot-typical line, one resist
  const tierChoices = lvl >= 50 ? [2, 1] : [2];
  const used = new Set<string>();
  const usedStats = new Set<string>();
  const push = (def: AffixDef | undefined) => {
    if (!def) return;
    const r = rollAffixOf(def, lvl, rng, { tiers: tierChoices, twoHanded: base.twoHanded, locked: true });
    if (!r) return;
    used.add(def.id);
    usedStats.add(def.stat + (def.local ?? ''));
    item.affixes.push(r);
  };
  const cat = base.category;
  const allowed = (id: string) => { const d = AFFIX_BY_ID[id]; return d && (!d.categories || d.categories.includes(cat)) ? d : undefined; };
  push(allowed('suf_' + MAIN_STAT[classId]) ?? allowed('suf_vit'));
  if (!used.has('suf_vit')) push(allowed('suf_vit'));
  const typical = pickAffixDef(affixPoolFor(cat, lvl, 'prefix', used, usedStats), classId, rng) ?? pickAffixDef(affixPoolFor(cat, lvl, null, used, usedStats), classId, rng);
  push(typical ?? undefined);
  const resists = ['suf_res_fire', 'suf_res_frost', 'suf_res_lightning', 'suf_res_shadow', 'suf_res_poison'].map(allowed).filter((d): d is AffixDef => !!d && !used.has(d.id));
  if (resists.length) push(rng.pick(resists));
  else push(pickAffixDef(affixPoolFor(cat, lvl, null, used, usedStats), classId, rng) ?? undefined);
  item.sockets = rollSockets(base, 'set', rng);
  if (!item.sockets) delete item.sockets;
  return item;
}

// ============================================================================ affix rerolls (blacksmith)
const RESTRICTED_EFSUN: Rarity[] = ['poor', 'common', 'set'];
export function canEfsun(item: ItemInstance): boolean {
  return isEquipmentItem(item) && !RESTRICTED_EFSUN.includes(item.rarity);
}

/** Indices of affixes that can be rerolled (everything except fixed legendary lines / set lines). */
export function rerollableAffixIndices(item: ItemInstance): number[] {
  const out: number[] = [];
  item.affixes.forEach((a, i) => {
    if (isFixedAffix(a)) return;
    if (item.rarity === 'set') return;
    out.push(i);
  });
  return out;
}

/** Efsun Nesnesi: reroll all rerollable affixes (type + value), keeping the count; indices in `keep` stay. */
export function rerollAffixes(item: ItemInstance, keep: number[], rng: RNG = defaultRng, classId?: ClassId): void {
  const base = baseOf(item);
  if (!base) return;
  const rerollable = rerollableAffixIndices(item);
  const kept: RolledAffix[] = [];
  const fixedOrKept = new Set<number>(keep);
  item.affixes.forEach((a, i) => {
    if (!rerollable.includes(i) || fixedOrKept.has(i)) kept.push(a);
  });
  const toRoll = rerollable.filter((i) => !fixedOrKept.has(i)).length;
  const fresh = rollMoreAffixes(base.category, item.itemLevel, item.rarity, toRoll, kept, rng, { classId, twoHanded: base.twoHanded, bestN: item.rarity === 'epic' ? 3 : undefined });
  // keep original ordering: fixed first (they come first on uniques), then kept, then fresh
  item.affixes = [...kept, ...fresh];
  if (item.rarity === 'uncommon') item.name = nameForMagic(base, item.affixes);
  refreshItemName(item);
}

/** Kadim Efsun: reroll only the numbers, inside the current tier. */
export function rerollAffixValues(item: ItemInstance, rng: RNG = defaultRng): void {
  const idx = rerollableAffixIndices(item);
  for (const i of idx) {
    const a = item.affixes[i];
    const def = AFFIX_BY_ID[a.affixId];
    if (!def) continue;
    const t = def.tiers.find((x) => tierNumberOfGate(x.minItemLevel) === a.tier);
    if (!t) continue;
    let v = rng.range(t.min, t.max);
    if (def.local === 'wpnAddFlat' && baseOf(item)?.twoHanded) v *= 1.5;
    a.value = roundAffixValue(def.stat, v, def.local);
  }
}

/** Takviye Nesnesi: add one random affix if below the rarity maximum. Normal items become Büyülü. */
export function addRandomAffix(item: ItemInstance, rng: RNG = defaultRng, classId?: ClassId): boolean {
  const base = baseOf(item);
  if (!base || !isEquipmentItem(item)) return false;
  if (item.rarity === 'poor' || item.rarity === 'set') return false;
  if (item.rarity === 'legendary') return false;
  if (item.rarity === 'common') item.rarity = 'uncommon';
  const rules = RARITY_AFFIX_RULES[item.rarity];
  if (item.affixes.length >= rules.max) return false;
  const fresh = rollMoreAffixes(base.category, item.itemLevel, item.rarity, 1, item.affixes, rng, { classId, twoHanded: base.twoHanded, bestN: item.rarity === 'epic' ? 3 : undefined });
  if (!fresh.length) return false;
  item.affixes.push(...fresh);
  if (item.rarity === 'uncommon') item.name = nameForMagic(base, item.affixes);
  refreshItemName(item);
  return true;
}

// ============================================================================ gems
export function socketCategory(base: ItemBaseDef): 'weapon' | 'armor' | 'jewelry' {
  const c = base.category;
  if (isWeaponCategory(c)) return 'weapon';
  if (c === 'amulet' || c === 'ring' || c === 'belt') return 'jewelry';
  return 'armor';
}

export interface GemEffect { stats: StatBlock; local?: { mod: LocalMod; value: number }; lines: string[] }
export function gemEffect(gemMaterialId: string | null | undefined, base: ItemBaseDef | undefined, slot?: EquipSlot): GemEffect | null {
  const g = parseGemId(gemMaterialId);
  if (!g || !base) return null;
  const cat = socketCategory(base);
  const eff = g.def[cat];
  if (!eff) return null;
  const value = eff.values[g.grade - 1] ?? 0;
  const stats: StatBlock = {};
  const lines: string[] = [];
  for (const s of eff.stats) {
    stats[s] = (stats[s] ?? 0) + value;
    lines.push(fmtStat(s, value));
  }
  const out: GemEffect = { stats, lines };
  if ('local' in eff && eff.local) {
    out.local = { mod: eff.local, value };
    lines.push(`+%${Math.round(value * 100)} Silah Hasarı`);
  }
  void slot;
  return out;
}

// ============================================================================ numbers: weapon damage, armour, stats
export function upgradeWeaponPct(item: ItemInstance): number { return stepOf(item.upgrade ?? 0).weaponPct; }
export function upgradeArmorPct(item: ItemInstance): number { return stepOf(item.upgrade ?? 0).armorPct; }
export function upgradeJewelPct(item: ItemInstance): number { return stepOf(item.upgrade ?? 0).weaponPct * 0.5; }

export function weaponNumbers(item: ItemInstance): { min: number; max: number; aps: number; baseMin: number; baseMax: number } | null {
  const base = baseOf(item);
  if (!base || !item.weaponDamage || !base.attacksPerSecond) return null;
  const up = upgradeWeaponPct(item);
  const boost = efsunBoost(item);
  let pct = 0, flat = 0;
  for (const a of item.affixes) {
    const l = affixLocal(a);
    const b = a.locked ? 1 : boost;
    if (l === 'wpnDamagePct') pct += a.value * b;
    else if (l === 'wpnAddFlat') flat += a.value * b;
  }
  (item.sockets ?? []).forEach((gid) => {
    const e = gemEffect(gid, base);
    if (e?.local?.mod === 'wpnDamagePct') pct += e.local.value;
  });
  const [w0, w1] = item.weaponDamage;
  const min = Math.max(1, Math.round((w0 * (1 + up) + flat) * (1 + pct)));
  const max = Math.max(min, Math.round((w1 * (1 + up) + flat) * (1 + pct)));
  return { min, max, aps: base.attacksPerSecond, baseMin: w0, baseMax: w1 };
}

export function armorNumber(item: ItemInstance): number {
  const base = item.implicit?.armor;
  if (!base) return 0;
  const up = upgradeArmorPct(item);
  const boost = efsunBoost(item);
  let local = 0;
  for (const a of item.affixes) if (affixLocal(a) === 'armorPct') local += a.value * (a.locked ? 1 : boost);
  return Math.round(base * (1 + up) * (1 + local));
}

/** Stats an equipped item contributes (implicit + affixes + upgrade bonus + gems). Used by StatCalc and comparisons. */
export function itemStats(item: ItemInstance, slot?: EquipSlot): StatBlock {
  const base = baseOf(item);
  const out: StatBlock = {};
  if (!base || !isEquipmentCategory(base.category)) return out;
  const add = (k: StatId, v: number) => {
    if (v) out[k] = (out[k] ?? 0) + v;
  };
  const isWeapon = isWeaponCategory(base.category);
  const up = item.upgrade ?? 0;
  const boost = efsunBoost(item);

  // weapon
  const w = isWeapon ? weaponNumbers(item) : null;
  if (w) {
    const k = slot === 'offhand' ? 0.25 : 1;
    add('weaponMin', w.min * k);
    add('weaponMax', w.max * k);
    if (slot !== 'offhand') add('weaponAps', w.aps);
  }
  // armour
  if (item.implicit?.armor) add('armor', armorNumber(item));
  // implicit (non-armour)
  const jewel = !isWeapon && !base.armorWeight && base.category !== 'tome';
  for (const k of Object.keys(item.implicit ?? {}) as StatId[]) {
    if (k === 'armor') continue;
    let v = item.implicit![k] ?? 0;
    if (jewel) v *= 1 + upgradeJewelPct(item);
    add(k, v);
  }
  if (base.category === 'shield' && up > 0) add('blockChance', 0.005 * up);
  // affixes
  for (const a of item.affixes) {
    const l = affixLocal(a);
    if (l) continue; // local mods are folded into weapon/armour numbers
    const b = a.locked ? 1 : boost;
    let v = a.value * b;
    if (isWeapon && a.stat === 'attackSpeed') v *= affixWeaponMult(a);
    add(a.stat, v);
  }
  // gems
  (item.sockets ?? []).forEach((gid) => {
    const e = gemEffect(gid, base, slot);
    if (!e) return;
    for (const k of Object.keys(e.stats) as StatId[]) add(k, e.stats[k] ?? 0);
  });
  return out;
}

// ============================================================================ formatting
const fmtNum = (n: number, maxDec = 1) => String(Number(n.toFixed(maxDec)));

/** "+%8 Ateş Hasarı" / "+12 Güç". */
export function fmtStat(stat: StatId, value: number): string {
  const info = STAT_INFO[stat];
  if (!info) return `${value}`;
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  if (info.pct) return `${sign}%${fmtNum(abs * 100)} ${info.name}`;
  return `${sign}${fmtNum(abs, 1)} ${info.name}`;
}

function fmtAffix(a: RolledAffix, item: ItemInstance): string {
  const l = affixLocal(a);
  const v = a.value * (a.locked ? 1 : efsunBoost(item));
  if (l === 'wpnDamagePct') return `+%${fmtNum(v * 100)} Silah Hasarı`;
  if (l === 'wpnAddFlat') return `+${fmtNum(v, 0)} Ek Silah Hasarı`;
  if (l === 'armorPct') return `+%${fmtNum(v * 100)} Zırh`;
  let val = v;
  if (item && a.stat === 'attackSpeed' && isWeaponCategory(baseOf(item)?.category ?? 'junk')) val *= affixWeaponMult(a);
  return fmtStat(a.stat, val);
}

export function sellValue(item: ItemInstance): number {
  const base = baseOf(item);
  if (!base) {
    const m = MATERIALS[item.baseId];
    return Math.max(1, (m?.sellPrice ?? 1) * (item.quantity ?? 1));
  }
  const raw = (5 + 1.2 * item.itemLevel) * SELL_RARITY_MULT[item.rarity] * (1 + 0.1 * (item.upgrade ?? 0));
  return Math.max(1, Math.round(raw));
}

/**
 * Everything a tooltip needs ("items computes, hud renders").
 */
export function describeItem(item: ItemInstance): ItemDescription {
  const base = baseOf(item);
  const mat = MATERIALS[item.baseId];
  const color = RARITY_COLORS[item.rarity] ?? '#ffffff';
  if (!base) {
    // stackable material / consumable that ended up as an item (defensive)
    return {
      name: item.name ?? mat?.name ?? item.baseId, rarity: item.rarity, color, slotLabel: mat ? 'Malzeme' : '', itemLevel: item.itemLevel, requiredLevel: mat?.requiredLevel ?? 1,
      implicitLines: [], affixLines: [], socketLines: [], specialLines: [], sellPrice: sellValue(item), totalStats: {}, icon: mat?.icon ?? '', isEquipment: false, stack: item.quantity, desc: mat?.desc,
    };
  }
  const equip = isEquipmentCategory(base.category);
  const unique = item.uniqueId ? UNIQUES[item.uniqueId] : undefined;
  const piece = item.uniqueId && item.setId ? SET_PIECES[item.uniqueId] : undefined;
  const w = equip && isWeaponCategory(base.category) ? weaponNumbers(item) : null;
  const up = item.upgrade ?? 0;
  const implicitLines: string[] = [];
  for (const k of Object.keys(item.implicit ?? {}) as StatId[]) {
    if (k === 'armor') continue;
    let v = item.implicit![k] ?? 0;
    const jewel = !isWeaponCategory(base.category) && !base.armorWeight && base.category !== 'tome';
    if (jewel) v *= 1 + upgradeJewelPct(item);
    if (k === 'blockChance' && base.category === 'shield') v += 0.005 * up;
    implicitLines.push(k === 'blockChance' ? `%${fmtNum(v * 100)} Blok Şansı` : fmtStat(k, v));
  }
  const affixLines = item.affixes.map((a) => {
    const def = AFFIX_BY_ID[a.affixId];
    return { text: fmtAffix(a, item), tier: a.tier, locked: a.locked || undefined, kind: (isFixedAffix(a) ? 'unique' : def?.kind ?? 'suffix') as 'prefix' | 'suffix' | 'unique' };
  });
  let upgradeLine: string | undefined;
  if (equip && up > 0) {
    const step = stepOf(up);
    if (w) upgradeLine = `+${up} Yükseltme: +%${Math.round(step.weaponPct * 100)} hasar`;
    else if (item.implicit?.armor) upgradeLine = `+${up} Yükseltme: +%${Math.round(step.armorPct * 100)} zırh`;
    else upgradeLine = `+${up} Yükseltme: +%${Math.round(step.weaponPct * 50)} taban etki`;
    if (step.efsunBonus > 0) upgradeLine += `, efsunlar +%${Math.round(step.efsunBonus * 100)}`;
  }
  const socketLines = (item.sockets ?? []).map((gid) => {
    const g = parseGemId(gid);
    if (!g) return { gemName: null, text: null, color: null };
    const e = gemEffect(gid, base);
    return { gemName: gemName(g.type, g.grade), text: e ? e.lines.join(', ') : null, color: GEM_COLORS[g.type] };
  });
  const specialLines: string[] = [];
  if (unique?.special) specialLines.push(unique.special.desc);

  let setInfo: ItemDescription['setInfo'];
  if (item.setId && SETS[item.setId]) {
    const set = SETS[item.setId];
    const equipped = G.character?.save.equipment ?? {};
    const ownedIds = new Set(Object.values(equipped).map((e) => e?.uniqueId).filter(Boolean) as string[]);
    const count = set.pieces.filter((p) => ownedIds.has(p)).length;
    setInfo = {
      name: set.name,
      pieces: set.pieces.map((p) => ({ name: SET_PIECES[p]?.name ?? p, owned: ownedIds.has(p) })),
      bonuses: set.bonuses.map((b) => ({
        count: b.count,
        text: [b.stats ? Object.entries(b.stats).map(([k, v]) => fmtStat(k as StatId, v as number)).join(', ') : '', b.special?.desc ?? ''].filter(Boolean).join(' · '),
        active: count >= b.count,
      })),
    };
  }
  const classes = base.classes ? base.classes.map((c) => CLASS_NAMES_TR[c]) : undefined;
  const slotLabel = base.typeName ?? CATEGORY_NAMES_TR[base.category] ?? '';
  const desc: ItemDescription = {
    name: itemDisplayName(item), rarity: item.rarity, color, slotLabel, itemLevel: item.itemLevel, requiredLevel: requiredLevelOf(item), classes,
    implicitLines, affixLines, socketLines, specialLines, sellPrice: sellValue(item), totalStats: itemStats(item), icon: base.icon, isEquipment: equip,
    baseName: base.name, bound: item.bound, upgrade: up, maxUpgrade: maxUpgradeOf(item), unique: !!unique || undefined, locked: item.locked,
  };
  if (w) {
    desc.damage = { min: w.min, max: w.max, aps: +w.aps.toFixed(2), dps: +(((w.min + w.max) / 2) * w.aps).toFixed(1) };
    desc.baseDamage = { min: w.baseMin, max: w.baseMax };
  }
  if (item.implicit?.armor) desc.armor = armorNumber(item);
  if (upgradeLine) desc.upgradeLine = upgradeLine;
  if (setInfo) desc.setInfo = setInfo;
  if (unique?.flavor) desc.flavor = unique.flavor;
  if (piece && !desc.flavor) desc.flavor = `${setInfo?.name ?? ''} takımının parçası.`;
  if (item.quantity && item.quantity > 1) desc.stack = item.quantity;
  if (base.desc) desc.desc = base.desc;
  if (up >= 7) desc.glow = up >= 15 ? 'Gökkuşağı parıltı' : up >= 12 ? 'Kızıl parıltı' : up >= 9 ? 'Mor parıltı' : 'Mavi parıltı';
  return desc;
}

export { TIER_MIN_ILVL };
