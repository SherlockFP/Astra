import type { DamageType } from '../types/common';
import type { EnemyDef } from '../types/enemies';
import type { FamilyDef, FamilyId } from '../types/v2';

/**
 * Enemy families (GDD_OPENWORLD 6.5): used by kill objectives ("{Aile} Avi") and family bounties.
 * Derived from the enemy id prefix; unknown open-world ids fall back to 'beast', anything else has no family.
 * OWNER: items module.
 */
export type EnemyFamily = 'beast' | 'spider' | 'ghost' | 'skeleton' | 'cultist' | 'golem' | 'demon' | 'bandit' | 'orc' | 'metin';

const BY_ID: Record<string, EnemyFamily> = {
  ow_wolf: 'beast', ow_wolf_dire: 'beast', ow_warg: 'beast', ow_rat: 'beast', ow_bear: 'beast', ow_boar: 'beast', ow_rhino: 'beast',
  ow_bat: 'beast', ow_wasp: 'beast', ow_wasp_swamp: 'beast', ow_deer: 'beast', ow_mushnub: 'beast', ow_mushroom_brute: 'beast',
  ow_spider: 'spider', ow_spider_giant: 'spider', ow_centipede: 'spider',
  ow_wraith: 'ghost', ow_will: 'ghost', ow_ghoul: 'ghost', ow_vampire: 'ghost', shade: 'ghost',
  ow_golem: 'golem', ow_scarecrow: 'golem',
  ow_imp: 'demon', ow_ember: 'demon',
  ow_goblin: 'bandit', ow_goblin_shaman: 'bandit', ow_puglin: 'bandit', ow_puglin_chief: 'bandit', ow_bandit: 'bandit',
  ow_bandit_archer: 'bandit', ow_bandit_brute: 'bandit', ow_bandit_chief: 'bandit',
  ow_orc: 'orc', ow_orc_archer: 'orc', ow_orc_shaman: 'orc', ow_orc_brute: 'orc',
  cult_acolyte: 'cultist', cult_summoner: 'cultist', ow_witch: 'cultist', ow_keeper: 'skeleton',
  ow_grave_knight: 'skeleton',
};

/** Family of an enemy def id (undefined when it has none). */
export function familyOf(enemyId: string): EnemyFamily | undefined;
/** GDD_V2 §7 (WP1 stub): the def's creature family (`EnemyDef.family`). Overload kept next to the open-world lookup. */
export function familyOf(def: EnemyDef): FamilyId | undefined;
export function familyOf(x: string | EnemyDef): EnemyFamily | FamilyId | undefined {
  if (typeof x !== 'string') return x.family;
  const enemyId = x;
  const known = BY_ID[enemyId];
  if (known) return known;
  if (enemyId.startsWith('skel_')) return 'skeleton';
  if (enemyId.startsWith('cult_')) return 'cultist';
  if (enemyId.startsWith('metin_')) return 'metin';
  if (enemyId.startsWith('ow_')) return 'beast';
  return undefined;
}

/** Region id of a camp / patrol pack id ("r3_c04" -> "r3"); undefined for dungeon packs. */
export function regionOfPack(packId: string | null | undefined): string | undefined {
  const m = packId ? /^(r\d+)_/.exec(packId) : null;
  return m ? m[1] : undefined;
}

/**
 * GDD_V2 §7.1 family registry (14 families). COMPILE-ONLY STUB (WP1): empty until the enemies owner fills it (WP4).
 * `def.resist` overrides the family default per monster.
 */
export const FAMILIES: Partial<Record<FamilyId, FamilyDef>> = {};

/** Resist / weakness summary of one damage type (GDD_V2 §7.3). `resist` is a fraction: 0.5 = +50%, -0.25 = -25%. */
export interface WeaknessInfo {
  resist: number;
  /** Zayıf: effective resist <= -0.20. */
  weak: boolean;
  /** Dirençli: resist >= +0.50. */
  resisted: boolean;
  /** Bağışık: resist >= +0.95 (no damage). */
  immune: boolean;
}

/**
 * GDD_V2 §7.3 (WP1 stub): effective resist of `def` for `type`. def.resist wins over the family default; arcane uses the
 * lowest of fire / frost / lightning (GDD_SYSTEMS 1.4). Fully defined on def data alone, so it is usable before WP4.
 */
export function weaknessOf(def: EnemyDef, type: DamageType): WeaknessInfo {
  const fam = def.family ? FAMILIES[def.family]?.resist : undefined;
  const resistOf = (t: DamageType): number => def.resist?.[t] ?? fam?.[t] ?? 0;
  const resist = type === 'arcane' ? Math.min(resistOf('fire'), resistOf('frost'), resistOf('lightning')) : resistOf(type);
  return { resist, weak: resist <= -0.2, resisted: resist >= 0.5, immune: resist >= 0.95 };
}
