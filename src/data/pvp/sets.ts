/**
 * PvP sets and spec traits (GDD_PVP_FINDER §4.3). OWNER: items (data). Consumers: systems/StatCalc.ts (set counting, arena
 * context), systems/PvpGear.ts (piece names of created items).
 *
 * - One set per playable class, id `pvp_<classId>`. Only the six armour pieces carry the set; the weapon is a PvP weapon
 *   with no set bonus. `ItemInstance.setId` of a PvP piece is the set id, `ItemInstance.pvp` is true.
 * - Bonuses are counted only while the equipped class matches `classId` (StatCalc).
 * - Set stats are PvP-only stats: StatCalc drops `pvpPower` / `pvpResilience` outside arena and PvP contexts.
 * - Spec traits: one PvP-only passive line per spec. Active only in arenas and PvP zones (StatCalc, `pvp.arena || pvp.zone`).
 */
import type { ClassId } from '../../types/common';
import type { SpecId } from '../../types/v2';
import type { SetDef } from '../../types/items';
import type { StatBlock } from '../../types/stats';

export type PvpArmourSlot = 'helm' | 'shoulders' | 'chest' | 'gloves' | 'legs' | 'boots';
export const PVP_ARMOUR_SLOTS: PvpArmourSlot[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];

/** Piece names are shared by all classes (the set name carries the class noun). */
export const PVP_PIECE_NAMES: Record<PvpArmourSlot, string> = {
  helm: 'Gladyatör Kaskı',
  shoulders: 'Gladyatör Omuzlukları',
  chest: 'Gladyatör Göğüslüğü',
  gloves: 'Gladyatör Eldivenleri',
  legs: 'Gladyatör Pantolonu',
  boots: 'Gladyatör Çizmeleri',
};

export interface PvpSetDef extends SetDef {
  classId: ClassId;
}

/** The seven playable classes (GDD_PVP_FINDER §4.3). Turkish class nouns come from the GDD list. */
const CLASS_NOUN: Record<'knight' | 'barbarian' | 'mage' | 'rogue' | 'paladin' | 'warlock' | 'necromancer' | 'monk' | 'archer' | 'priest' | 'shaman' | 'druid' | 'demonhunter' | 'evoker', string> = {
  knight: 'Şövalye', barbarian: 'Barbar', mage: 'Büyücü', rogue: 'Haydut', paladin: 'Paladin', warlock: 'Warlock', necromancer: 'Nekromant',
  monk: 'Keşiş', archer: 'Okçu',
  // CLASS SCAFFOLD (PvP set stubs; the sets are derived from this map)
  priest: 'Rahip', shaman: 'Şaman', druid: 'Druid',
  demonhunter: 'İblis Avcısı', evoker: 'Ejderhasoy',
};

const SAVAS_RUHU = {
  id: 'pvp_savas_ruhu',
  desc: 'Savaş Ruhu: bir oyuncuyu öldürünce maksimum canının %10\'u kadar can yenilenir ve 3 sn hızlanırsın.',
};

function makeSet(classId: keyof typeof CLASS_NOUN): PvpSetDef {
  return {
    id: `pvp_${classId}`,
    name: `Gladyatör Zırhı (${CLASS_NOUN[classId]})`,
    classId,
    pieces: PVP_ARMOUR_SLOTS.map((s) => PVP_PIECE_NAMES[s]),
    bonuses: [
      { count: 2, stats: { pvpPower: 0.04 } },
      { count: 4, stats: { pvpResilience: 0.06 } },
      { count: 6, special: { id: SAVAS_RUHU.id, desc: SAVAS_RUHU.desc } },
    ],
  };
}

/** Set registry keyed by set id. */
export const PVP_SETS: Record<string, PvpSetDef> = Object.fromEntries(
  (Object.keys(CLASS_NOUN) as (keyof typeof CLASS_NOUN)[]).map((c) => [`pvp_${c}`, makeSet(c)]),
);

/** Set id of a class (undefined for classes without a PvP set). */
export const pvpSetIdOf = (classId: ClassId): string | undefined => (PVP_SETS[`pvp_${classId}`] ? `pvp_${classId}` : undefined);

/** Turkish display name of a class noun (for the set name and vendor text). */
export const pvpClassNoun = (classId: ClassId): string | undefined => (CLASS_NOUN as Record<string, string>)[classId];

// ------------------------------------------------------------------------------------------------------------ spec traits
export interface PvpSpecTrait {
  specId: SpecId;
  name: string;
  desc: string;
  /** StatBlock folded by StatCalc while the context is an arena or a PvP zone. */
  stats: StatBlock;
}

export const PVP_SPEC_TRAITS: Partial<Record<SpecId, PvpSpecTrait>> = {
  knight_protector: { specId: 'knight_protector', name: 'Sarsılmaz Duvar', desc: 'Arenada hasar azaltma +%3.', stats: { damageReductionPct: 0.03 } },
  knight_blademaster: { specId: 'knight_blademaster', name: 'Kılıç Ustası', desc: 'Arenada kritik vuruş şansı +%3.', stats: { critChance: 0.03 } },
  barbarian_warlord: { specId: 'barbarian_warlord', name: 'Savaş Lordu', desc: 'Arenada hasar +%4.', stats: { damagePct: 0.04 } },
  barbarian_butcher: { specId: 'barbarian_butcher', name: 'Kasap', desc: 'Arenada can çalma +%2.', stats: { lifeSteal: 0.02 } },
  mage_fire: { specId: 'mage_fire', name: 'Alev Ustası', desc: 'Arenada ateş hasarı +%5.', stats: { fireDamagePct: 0.05 } },
  mage_frost: { specId: 'mage_frost', name: 'Donduran', desc: 'Arenada buz hasarı +%5.', stats: { frostDamagePct: 0.05 } },
  mage_arcane: { specId: 'mage_arcane', name: 'Gizem Ustası', desc: 'Arenada arkan hasarı +%5.', stats: { arcaneDamagePct: 0.05 } },
  rogue_assassin: { specId: 'rogue_assassin', name: 'Suikastçı', desc: 'Arenada kritik hasarı +%5.', stats: { critDamage: 0.05 } },
  rogue_alchemist: { specId: 'rogue_alchemist', name: 'Kontrol Kırıcı', desc: 'Arenada kontrol etkilerine karşı süre kısalması +%5.', stats: { ccReductionPct: 0.05 } },
  paladin_protection: { specId: 'paladin_protection', name: 'Kutsal Kalkan', desc: 'Arenada zırh +%3.', stats: { armorPct: 0.03 } },
  paladin_holy: { specId: 'paladin_holy', name: 'Şafak Işığı', desc: 'Arenada aldığın iyileşme +%3.', stats: { healReceivedPct: 0.03 } },
  paladin_retribution: { specId: 'paladin_retribution', name: 'İntikam', desc: 'Arenada kutsal hasar +%5.', stats: { holyDamagePct: 0.05 } },
  necromancer_summoner: { specId: 'necromancer_summoner', name: 'Çağırıcı', desc: 'Arenada yaratık hasarı +%5.', stats: { minionDamagePct: 0.05 } },
  necromancer_bone: { specId: 'necromancer_bone', name: 'Kemik Ustası', desc: 'Arenada maksimum can +%2.', stats: { maxHpPct: 0.02 } },
  warlock_affliction: { specId: 'warlock_affliction', name: 'Azap Ustası', desc: 'Arenada zamanla hasar +%5.', stats: { dotPct: 0.05 } },
  warlock_destruction: { specId: 'warlock_destruction', name: 'Yıkım', desc: 'Arenada gölge hasarı +%5.', stats: { shadowDamagePct: 0.05 } },
  monk_brewmaster: { specId: 'monk_brewmaster', name: 'Demci', desc: 'Arenada alınan hasar -%3 (Sarsma havuzu).', stats: { damageReductionPct: 0.03 } },
  monk_windwalker: { specId: 'monk_windwalker', name: 'Rüzgâr Yürüyen', desc: 'Arenada saldırı hızı +%3.', stats: { attackSpeed: 0.03 } },
  monk_mistweaver: { specId: 'monk_mistweaver', name: 'Sis Dokuyan', desc: 'Arenada aldığın iyileşme +%3.', stats: { healReceivedPct: 0.03 } },
  archer_marksman: { specId: 'archer_marksman', name: 'Nişancı', desc: 'Arenada kritik şansı +%3.', stats: { critChance: 0.03 } },
  archer_beastmaster: { specId: 'archer_beastmaster', name: 'Av Ustası', desc: 'Arenada yoldaş hasarı +%5.', stats: { minionDamagePct: 0.05 } },
  archer_survival: { specId: 'archer_survival', name: 'Hayatta Kalma', desc: 'Arenada maksimum can +%2.', stats: { maxHpPct: 0.02 } },
  demonhunter_chaos: { specId: 'demonhunter_chaos', name: 'Kaos', desc: 'Arenada kritik şansı +%3.', stats: { critChance: 0.03 } },
  demonhunter_vengeance: { specId: 'demonhunter_vengeance', name: 'İntikam', desc: 'Arenada alınan hasar -%3.', stats: { damageReductionPct: 0.03 } },
  demonhunter_devourer: { specId: 'demonhunter_devourer', name: 'Yutucu', desc: 'Arenada gölge hasarı +%5.', stats: { shadowDamagePct: 0.05 } },
  evoker_devastation: { specId: 'evoker_devastation', name: 'Yıkım Nefesi', desc: 'Arenada ateş hasarı +%5.', stats: { fireDamagePct: 0.05 } },
  evoker_preservation: { specId: 'evoker_preservation', name: 'Koruyucu Nefes', desc: 'Arenada aldığın iyileşme +%3.', stats: { healReceivedPct: 0.03 } },
  evoker_augmentation: { specId: 'evoker_augmentation', name: 'Yüceltme', desc: 'Arenada büyü hızı +%3.', stats: { castSpeed: 0.03 } },
};

