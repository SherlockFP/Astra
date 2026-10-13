import type { FissureInfo, FissureModId, FissureThemeId, FissureTier } from '../../types/dungeons';

/**
 * Kadim Yarıklar: difficulty tiers, modifiers, scaling and unlock rules (docs/GDD_PROCGEN.md §7, §8). OWNER: world module.
 * Pure data + pure functions (no game imports): the generator, MythicPlus.enemyScaling, the finder tab and the headless check all use it.
 * These multipliers REPLACE DIFFICULTY_MULT for fissure runs (never multiplied with it); the party HP factor stays partyHpMult().
 */

export interface TierRule {
  id: FissureTier;
  /** Turkish name. */
  name: string;
  difficulty: 'normal' | 'heroic' | 'mythic';
  /** Rooms without connectors, inclusive range. */
  rooms: [number, number];
  /** Highest floor tier (2 m per tier); the map has maxTier + 1 levels at most. */
  maxTier: number;
  /** Modifiers rolled for the map. */
  mods: number;
  /** Non-boss HP / damage. */
  hp: number;
  dmg: number;
  bossHp: number;
  bossDmg: number;
  /** Target enemy count of a run (solo baseline; party strength is HP scaling, never extra bodies). */
  enemies: [number, number];
  /** Character level needed to open the tier. */
  unlockLevel: number;
  /** Clears of an easier tier needed (save flag `fis.clear.<tier>`). */
  needClear?: { tier: FissureTier; count: number };
  /** Extra bodies on the first member of every trash pack. */
  packBonus: number;
  /** Chance that a hall's elite slot is really an elite pack (the rest is a normal pack). */
  eliteChance: number;
  /** Item level the end-of-run reward is capped at (boss drops use the normal boss chest ladder). */
  ilvlCap: number;
  /** Gold of the end chest = level x this. */
  gold: number;
  dust: number;
  dragonCoins: number;
}

export const FISSURE_TIERS: Record<FissureTier, TierRule> = {
  n: {
    id: 'n', name: 'Normal', difficulty: 'normal', rooms: [8, 10], maxTier: 1, mods: 0, hp: 1, dmg: 1, bossHp: 1, bossDmg: 1,
    enemies: [80, 110], unlockLevel: 1, packBonus: 2, eliteChance: 0.5, ilvlCap: 62, gold: 40, dust: 6, dragonCoins: 0,
  },
  h: {
    id: 'h', name: 'Kahramanlık', difficulty: 'heroic', rooms: [10, 12], maxTier: 2, mods: 1, hp: 1.35, dmg: 1.2, bossHp: 1.3, bossDmg: 1.15,
    enemies: [110, 145], unlockLevel: 30, needClear: { tier: 'n', count: 1 }, packBonus: 3, eliteChance: 1, ilvlCap: 64, gold: 80, dust: 12, dragonCoins: 1,
  },
  m: {
    id: 'm', name: 'Mitik', difficulty: 'mythic', rooms: [12, 14], maxTier: 2, mods: 2, hp: 1.9, dmg: 1.5, bossHp: 1.8, bossDmg: 1.4,
    enemies: [145, 190], unlockLevel: 60, needClear: { tier: 'h', count: 3 }, packBonus: 3, eliteChance: 1, ilvlCap: 68, gold: 160, dust: 20, dragonCoins: 2,
  },
};

export const FISSURE_TIER_ORDER: readonly FissureTier[] = ['n', 'h', 'm'];

export interface ModInfo { id: FissureModId; name: string; desc: string }
/** The four modifiers implemented now (GDD §7 lists eight: fm_cevik and the three affix mods are deferred). */
export const FISSURE_MODS: Record<FissureModId, ModInfo> = {
  fm_surusu: { id: 'fm_surusu', name: 'Kalabalık Sürü', desc: 'Her sıradan sürüde bir yaratık daha var.' },
  fm_zirh: { id: 'fm_zirh', name: 'Zırhlı Sürü', desc: 'Patron olmayan düşmanların canı %25 fazla.' },
  fm_zalim: { id: 'fm_zalim', name: 'Zalim Muhafızlar', desc: 'Patronların canı %20, hasarı %10 fazla.' },
  fm_bereket: { id: 'fm_bereket', name: 'Yarık Bereketi', desc: 'Fazladan bir hazine odası ve elit sürü; düşman hasarı %10 fazla.' },
};
export const FISSURE_MOD_ORDER: readonly FissureModId[] = ['fm_surusu', 'fm_zirh', 'fm_zalim', 'fm_bereket'];

/** Display names of the themes (Turkish). */
export const FISSURE_THEME_NAMES: Record<FissureThemeId, string> = {
  crypt: 'Mezarlık Yarığı', forge: 'Kor Yarığı', frost: 'Buzul Yarığı', shadow: 'Gölge Yarığı',
};

/** Enemy level of a run: Normal follows the party level, Kahramanlık is 30..60, Mitik is always 60. */
export function fissureEnemyLevel(tier: FissureTier, avgLevel: number): number {
  const a = Math.max(1, Math.min(60, Math.round(avgLevel) || 1));
  if (tier === 'm') return 60;
  if (tier === 'h') return Math.max(30, a);
  return a;
}

export interface UnlockResult { ok: boolean; reason: string }

/**
 * Can this character open the tier? `clears` = the `fis.clear.<tier>` counters. `gatesOff` is the `?unlock` tester switch
 * (skips the clear counts only, like the Zindan Bulucu).
 */
export function fissureUnlock(tier: FissureTier, charLevel: number, clears: Partial<Record<FissureTier, number>>, gatesOff = false): UnlockResult {
  const rule = FISSURE_TIERS[tier];
  if (charLevel < rule.unlockLevel) return { ok: false, reason: `${rule.name} için ${rule.unlockLevel}. seviye gerekir.` };
  const need = rule.needClear;
  if (need && !gatesOff && (clears[need.tier] ?? 0) < need.count) {
    return { ok: false, reason: `${FISSURE_TIERS[need.tier].name} Yarığı ${need.count} kez tamamla (${Math.min(need.count, clears[need.tier] ?? 0)}/${need.count}).` };
  }
  return { ok: true, reason: '' };
}

/** HP / damage multipliers of a generated map for one enemy (tier x modifiers). Party HP scaling is NOT included. */
export function fissureScaling(info: Pick<FissureInfo, 'tier' | 'mods'>, isBoss: boolean): { hp: number; dmg: number } {
  const r = FISSURE_TIERS[info.tier] ?? FISSURE_TIERS.n;
  let hp = isBoss ? r.bossHp : r.hp;
  let dmg = isBoss ? r.bossDmg : r.dmg;
  const has = (m: FissureModId): boolean => info.mods.includes(m);
  if (!isBoss && has('fm_zirh')) hp *= 1.25;
  if (!isBoss && has('fm_bereket')) dmg *= 1.1;
  if (isBoss && has('fm_zalim')) { hp *= 1.2; dmg *= 1.1; }
  return { hp, dmg };
}

/** End-of-run chest of a fissure (the boss chests already rolled the items): gold, magic dust, dragon coins. */
export function fissureEndRewards(tier: FissureTier, level: number, mods: readonly FissureModId[]): { gold: number; dust: number; dragonCoins: number } {
  const r = FISSURE_TIERS[tier];
  const bonus = mods.includes('fm_bereket') ? 1.25 : 1;
  return { gold: Math.round(Math.max(1, level) * r.gold * bonus), dust: r.dust, dragonCoins: r.dragonCoins };
}

/** Item level of a boss drop inside a fissure: follows the enemy level, capped per tier (Normal 62, Kahramanlık 64, Mitik 68). */
export function fissureItemLevel(tier: FissureTier, level: number, final: boolean): number {
  const r = FISSURE_TIERS[tier];
  const base = level + (tier === 'n' ? 1 : tier === 'h' ? 3 : 7) + (final ? 1 : 0);
  return Math.max(1, Math.min(r.ilvlCap, base));
}

/** Save flag names (CharacterSave.flags; scalar numbers only, no per-seed flags). */
export const fissureClearFlag = (tier: FissureTier): string => `fis.clear.${tier}`;
export const fissureBestFlag = (tier: FissureTier): string => `fis.best.${tier}`;
