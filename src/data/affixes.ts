import type { AffixDef, ItemCategory, LocalMod } from '../types/items';
import type { StatId } from '../types/stats';
import { STAT_INFO } from '../types/stats';

/**
 * Affix pools (GDD_SYSTEMS 4.5-4.7). Tier gates (item level): T5 = 1, T4 = 12, T3 = 24, T2 = 36, T1 = 50, T0 = 72 (Mythic+ only).
 * `tiers` lists only the tiers that exist for an affix, ordered from the lowest (T5) to the best (T0).
 * Stored values are in data units (percent stats = fractions, e.g. 0.08 = 8%).
 * OWNER: items module.
 */

export const TIER_GATES = [1, 12, 24, 36, 50, 72] as const; // index 0 = T5 ... index 5 = T0
export const TIER_WEIGHTS: Record<number, number> = { 0: 5, 1: 15, 2: 30, 3: 50, 4: 75, 5: 100 };
/** GDD tier number (5 = weakest .. 0 = best) for an `AffixDef.tiers[i].minItemLevel` gate. */
export const tierNumberOfGate = (gate: number): number => {
  const i = TIER_GATES.indexOf(gate as (typeof TIER_GATES)[number]);
  return i < 0 ? 5 : 5 - i;
};

// slot shorthand (GDD 4.5)
const AR: ItemCategory[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];
const J: ItemCategory[] = ['amulet', 'ring'];
const W: ItemCategory[] = ['sword1h', 'axe2h', 'staff', 'wand', 'dagger'];
const O: ItemCategory[] = ['shield', 'tome'];
const SH: ItemCategory[] = ['shield'];

type Range = [number, number] | null;

function def(
  id: string, kind: 'prefix' | 'suffix', name: string, stat: StatId, categories: ItemCategory[], weight: number,
  ranges: Range[], opts: { scale?: number; local?: LocalMod; weaponMult?: number; decimals?: number } = {},
): AffixDef {
  const scale = opts.scale ?? (STAT_INFO[stat]?.pct && !opts.local ? 0.01 : 1);
  const tiers: AffixDef['tiers'] = [];
  for (let i = 0; i < 6; i++) {
    const r = ranges[i];
    if (!r) continue;
    tiers.push({ minItemLevel: TIER_GATES[i], min: +(r[0] * scale).toFixed(6), max: +(r[1] * scale).toFixed(6) });
  }
  const a: AffixDef = { id, kind, name, stat, tiers, categories, weight };
  if (opts.local) a.local = opts.local;
  if (opts.weaponMult) a.weaponMult = opts.weaponMult;
  return a;
}

const R = (...v: number[]): Range => [v[0], v[1]];
const SAME_ELEM: Range[] = [R(5, 8), R(9, 13), R(14, 19), R(20, 26), R(27, 34), R(35, 42)];
const SAME_RES: Range[] = [R(5, 8), R(9, 13), R(14, 19), R(20, 26), R(27, 34), R(35, 40)];
const MAIN_ATTR: Range[] = [R(3, 6), R(7, 12), R(13, 20), R(21, 30), R(31, 42), R(43, 55)];

export const ITEM_AFFIXES: AffixDef[] = [
  // ---------------------------------------------------------------- prefixes
  def('pre_wpn_dmg_pct', 'prefix', 'Keskin', 'weaponMax', W, 100, [R(10, 19), R(20, 34), R(35, 54), R(55, 79), R(80, 109), R(110, 139)], { scale: 0.01, local: 'wpnDamagePct' }),
  def('pre_wpn_add_flat', 'prefix', 'Ağır', 'weaponMax', W, 100, [R(1, 3), R(4, 7), R(8, 14), R(15, 26), R(27, 40), R(41, 58)], { scale: 1, local: 'wpnAddFlat' }),
  def('pre_dmg_pct', 'prefix', 'Kudretli', 'damagePct', [...J, 'gloves', ...W, ...O], 80, [R(3, 4), R(5, 6), R(7, 9), R(10, 12), R(13, 15), R(16, 19)]),
  def('pre_dmg_phys_pct', 'prefix', 'Vahşi', 'physicalDamagePct', [...J, 'gloves', ...W], 80, SAME_ELEM),
  def('pre_dmg_fire_pct', 'prefix', 'Alevli', 'fireDamagePct', [...J, 'gloves', ...W, ...O], 80, SAME_ELEM),
  def('pre_dmg_frost_pct', 'prefix', 'Buzul', 'frostDamagePct', [...J, 'gloves', ...W, ...O], 80, SAME_ELEM),
  def('pre_dmg_arcane_pct', 'prefix', 'Gizemli', 'arcaneDamagePct', [...J, 'gloves', ...W, ...O], 80, SAME_ELEM),
  def('pre_dmg_poison_pct', 'prefix', 'Zehirli', 'poisonDamagePct', [...J, 'gloves', ...W, ...O], 80, SAME_ELEM),
  def('pre_dmg_melee_pct', 'prefix', 'Yırtıcı', 'meleeDamagePct', [...J, 'gloves', 'shoulders', ...W], 60, SAME_ELEM),
  def('pre_dmg_projectile_pct', 'prefix', 'Delici', 'projectileDamagePct', [...J, 'gloves', 'shoulders', ...W], 60, SAME_ELEM),
  def('pre_dmg_aoe_pct', 'prefix', 'Yıkıcı', 'aoePct', ['amulet', 'gloves', 'shoulders', ...W], 60, SAME_ELEM),
  def('pre_dmg_dot_pct', 'prefix', 'Çürütücü', 'dotPct', [...J, 'gloves', ...W], 50, [R(6, 10), R(11, 16), R(17, 23), R(24, 31), R(32, 40), R(41, 50)]),
  def('pre_dmg_vs_elite_pct', 'prefix', 'Avcı', 'eliteDamagePct', [...J, ...W, ...O], 40, [R(4, 6), R(7, 9), R(10, 12), R(13, 15), R(16, 18), R(19, 22)]),
  def('pre_hp_flat', 'prefix', 'Sağlam', 'maxHp', [...AR, 'belt', ...J, ...O], 120, [R(10, 20), R(25, 45), R(50, 90), R(95, 150), R(155, 220), R(225, 300)]),
  def('pre_hp_pct', 'prefix', 'Canlı', 'maxHpPct', ['chest', 'belt', 'amulet', ...SH], 50, [R(3, 4), R(5, 6), R(7, 8), R(9, 10), R(11, 12), R(13, 15)]),
  def('pre_armor_flat', 'prefix', 'Zırhlı', 'armor', [...AR, 'belt', ...SH], 100, [R(8, 15), R(20, 40), R(45, 80), R(85, 130), R(135, 190), R(195, 260)]),
  def('pre_armor_local_pct', 'prefix', 'Takviyeli', 'armorPct', [...AR, ...SH], 100, [R(10, 19), R(20, 34), R(35, 54), R(55, 74), R(75, 94), R(95, 120)], { scale: 0.01, local: 'armorPct' }),
  def('pre_life_steal', 'prefix', 'Vampirik', 'lifeSteal', [...W, ...J], 30, [null, R(0.4, 0.6), R(0.7, 1.0), R(1.1, 1.5), R(1.6, 2.0), R(2.1, 2.5)]),
  def('pre_res_max_flat', 'prefix', 'Coşkun', 'maxResource', ['helm', 'chest', 'amulet', ...O], 50, [R(3, 4), R(5, 6), R(7, 9), R(10, 12), R(13, 15), R(16, 20)]),
  def('pre_block', 'prefix', 'Koruyucu', 'blockChance', SH, 60, [R(2, 2), R(3, 3), R(4, 4), R(5, 6), R(7, 8), R(9, 10)]),
  def('pre_thorns', 'prefix', 'Dikenli', 'thorns', ['chest', 'shoulders', ...SH], 40, [R(2, 4), R(5, 10), R(12, 25), R(28, 50), R(55, 90), R(95, 140)]),
  def('pre_armor_pen', 'prefix', 'Parçalayıcı', 'armorPen', [...W, 'gloves'], 30, [null, null, R(5, 7), R(8, 10), R(11, 14), R(15, 18)]),
  def('pre_res_pen', 'prefix', 'Delen', 'resPen', [...W, 'gloves', 'amulet'], 30, [null, null, R(3, 4), R(5, 6), R(7, 8), R(9, 10)]),

  // ---------------------------------------------------------------- suffixes
  def('suf_str', 'suffix', 'Ayının', 'str', [...AR, 'belt', ...J, ...W, ...O], 100, MAIN_ATTR),
  def('suf_dex', 'suffix', 'Vaşağın', 'dex', [...AR, 'belt', ...J, ...W, ...O], 100, MAIN_ATTR),
  def('suf_int', 'suffix', 'Baykuşun', 'int', [...AR, 'belt', ...J, ...W, ...O], 100, MAIN_ATTR),
  def('suf_vit', 'suffix', 'Kaplumbağanın', 'vit', [...AR, 'belt', ...J, ...W, ...O], 100, MAIN_ATTR),
  def('suf_all_attr', 'suffix', 'Kadimlerin', 'allAttr', J, 30, [null, R(2, 4), R(5, 7), R(8, 11), R(12, 15), R(16, 20)]),
  def('suf_attack_speed', 'suffix', 'Rüzgârın', 'attackSpeed', [...W, 'gloves', ...J], 60, [R(3, 4), R(5, 6), R(7, 8), R(9, 10), R(11, 12), R(13, 15)], { weaponMult: 1.5 }),
  def('suf_cast_speed', 'suffix', 'Bilgenin', 'castSpeed', [...W, ...O, 'gloves', 'helm', ...J], 60, [R(3, 4), R(5, 6), R(7, 8), R(9, 10), R(11, 12), R(13, 15)]),
  def('suf_crit_chance', 'suffix', 'Şahinin', 'critChance', [...W, ...O, 'gloves', 'helm', ...J], 60, [R(0.5, 1.0), R(1.1, 1.5), R(1.6, 2.2), R(2.3, 3.0), R(3.1, 4.0), R(4.1, 5.0)]),
  def('suf_crit_damage', 'suffix', 'Kurdun', 'critDamage', [...W, 'gloves', ...J], 60, [R(5, 9), R(10, 15), R(16, 22), R(23, 30), R(31, 38), R(39, 46)]),
  def('suf_res_fire', 'suffix', 'Semenderin', 'resFire', [...AR, 'belt', ...J, ...O], 100, SAME_RES),
  def('suf_res_frost', 'suffix', 'Yetinin', 'resFrost', [...AR, 'belt', ...J, ...O], 100, SAME_RES),
  def('suf_res_lightning', 'suffix', 'Fırtınanın', 'resLightning', [...AR, 'belt', ...J, ...O], 100, SAME_RES),
  def('suf_res_shadow', 'suffix', 'Şafağın', 'resShadow', [...AR, 'belt', ...J, ...O], 100, SAME_RES),
  def('suf_res_poison', 'suffix', 'Yılanın', 'resPoison', [...AR, 'belt', ...J, ...O], 100, SAME_RES),
  def('suf_res_all', 'suffix', 'Gökkuşağının', 'resAll', [...J, 'chest', ...SH], 40, [null, R(3, 4), R(5, 7), R(8, 10), R(11, 13), R(14, 16)]),
  def('suf_move_speed', 'suffix', 'Çitanın', 'moveSpeedPct', ['boots'], 80, [R(3, 4), R(5, 6), R(7, 8), R(9, 10), R(11, 12), R(13, 14)]),
  def('suf_cdr', 'suffix', 'Zamanın', 'cdr', ['helm', 'shoulders', 'gloves', ...J], 40, [null, R(2, 3), R(4, 5), R(6, 7), R(8, 9), R(10, 11)]),
  def('suf_hp_regen', 'suffix', 'Trolün', 'hpRegen', [...AR, 'belt', ...J], 70, [R(1, 2), R(3, 5), R(6, 10), R(11, 18), R(19, 28), R(29, 40)]),
  def('suf_res_regen', 'suffix', 'Pınarın', 'resourceRegenPct', ['helm', ...J, ...O, 'staff', 'wand'], 60, [R(5, 8), R(9, 12), R(13, 17), R(18, 22), R(23, 28), R(29, 35)]),
  def('suf_life_on_hit', 'suffix', 'Sülüğün', 'hpOnHit', [...W, 'gloves', 'ring'], 50, [R(1, 2), R(3, 5), R(6, 10), R(11, 18), R(19, 28), R(29, 40)]),
  def('suf_gold_find', 'suffix', 'Tüccarın', 'goldFindPct', ['helm', 'boots', 'belt', ...J], 50, [R(5, 10), R(11, 17), R(18, 25), R(26, 34), R(35, 44), R(45, 55)]),
  def('suf_magic_find', 'suffix', 'Talihin', 'magicFindPct', ['helm', 'boots', ...J], 40, [R(3, 5), R(6, 9), R(10, 14), R(15, 19), R(20, 25), R(26, 32)]),
  def('suf_dodge', 'suffix', 'Gölgenin', 'dodgeChance', ['shoulders', 'gloves', 'legs', 'boots'], 50, [R(0.5, 1.0), R(1.1, 1.5), R(1.6, 2.2), R(2.3, 3.0), R(3.1, 3.8), R(3.9, 4.5)]),
  def('suf_cc_reduction', 'suffix', 'Kayanın', 'ccReductionPct', ['helm', 'chest', 'legs', 'belt'], 40, [R(4, 6), R(7, 9), R(10, 13), R(14, 17), R(18, 22), R(23, 27)]),
  def('suf_potion', 'suffix', 'Şifacının', 'potionPct', ['belt'], 60, [R(5, 8), R(9, 12), R(13, 17), R(18, 22), R(23, 28), R(29, 35)]),
  def('suf_xp_gain', 'suffix', 'Öğrencinin', 'xpPct', ['helm', ...J], 30, [R(2, 3), R(4, 5), R(6, 7), R(8, 9), R(10, 11), null]),
  def('suf_stagger', 'suffix', 'Devin', 'staggerPct', [...W, 'gloves', 'shoulders'], 40, [R(5, 8), R(9, 12), R(13, 17), R(18, 22), R(23, 28), R(29, 35)]),
];

export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries(ITEM_AFFIXES.map((a) => [a.id, a]));
export const getAffix = (id: string): AffixDef | undefined => AFFIX_BY_ID[id];

/** Stats that keep 1 decimal when expressed in percent (crit chance, life steal, dodge); everything else is rounded to whole units. */
export const DECIMAL_PCT_STATS = new Set<StatId>(['critChance', 'lifeSteal', 'dodgeChance']);

/** Affix-id fragments that are "smart" for a class (used for 2x weight on 50% of rolls, GDD 4.5). */
export const CLASS_AFFINITY: Record<string, StatId[]> = {
  knight: ['str', 'vit', 'armor', 'blockChance', 'meleeDamagePct', 'physicalDamagePct', 'maxHp', 'maxHpPct', 'thorns', 'resAll', 'holyDamagePct'],
  barbarian: ['str', 'vit', 'physicalDamagePct', 'meleeDamagePct', 'aoePct', 'lifeSteal', 'attackSpeed', 'critDamage', 'maxHp', 'staggerPct'],
  mage: ['int', 'fireDamagePct', 'frostDamagePct', 'arcaneDamagePct', 'castSpeed', 'resourceRegenPct', 'cdr', 'maxResource', 'aoePct', 'dotPct'],
  rogue: ['dex', 'physicalDamagePct', 'poisonDamagePct', 'projectileDamagePct', 'meleeDamagePct', 'critChance', 'critDamage', 'attackSpeed', 'dodgeChance', 'dotPct'],
};
