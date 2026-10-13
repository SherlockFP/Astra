/**
 * Stat ids. Every stat source (class base, level, items, upgrades, gems, talents, buffs) produces a StatBlock;
 * StatCalc (systems/StatCalc.ts) folds them into a final StatBlock. Percent stats are stored as fractions
 * (0.15 = 15%) unless the comment says otherwise.
 */
export const STAT_IDS = [
  // primary
  'str', 'dex', 'int', 'vit',
  // pools
  'maxHp', 'maxHpPct', 'maxResource', 'hpRegen', 'resourceRegen', 'hpOnHit', 'hpOnKill', 'lifeSteal',
  // offense
  'weaponMin', 'weaponMax', 'attackSpeed', 'castSpeed', 'damagePct',
  'physicalDamagePct', 'fireDamagePct', 'frostDamagePct', 'lightningDamagePct', 'shadowDamagePct', 'poisonDamagePct', 'holyDamagePct', 'arcaneDamagePct',
  'spellPower', 'critChance', 'critDamage', 'cdr', 'aoePct', 'dotPct', 'bossDamagePct', 'eliteDamagePct', 'armorPen',
  // defense
  'armor', 'armorPct', 'blockChance', 'blockAmount', 'dodgeChance', 'damageReductionPct', 'thorns',
  'resFire', 'resFrost', 'resLightning', 'resShadow', 'resPoison', 'resArcane', 'resAll',
  'ccReductionPct',
  // utility
  'moveSpeed', 'moveSpeedPct', 'goldFindPct', 'magicFindPct', 'xpPct', 'pickupRadius', 'potionPct',
  // appended by items module (GDD_SYSTEMS 1.1 NEW stats)
  'allAttr', 'hpRegenPct', 'healReceivedPct', 'resourceRegenPct', 'resourceGainPct', 'costReductionPct', 'hpOnKillPct', 'meleeDamagePct', 'projectileDamagePct', 'bleedDamagePct', 'executeDamagePct', 'ailingDamagePct', 'chilledDamagePct', 'resPen', 'aoeRadiusPct', 'projectileSpeedPct', 'pierce', 'ccDurationPct', 'staggerPct', 'bleedChance', 'burnChance', 'poisonChance', 'weaponAps',
  // appended by GDD_V2 §0.3 (WP1 contracts)
  'healingPct', 'threatPct', 'poiseDamagePct', 'guardGauge', 'weaponArtPct', 'finisherPct', 'flaskGainPct', 'flaskEffectPct',
  'weakDamagePct', 'majorCdrPct', 'runeEffectPct', 'parryWindow',
  // appended by GDD_CLASSES_V2 §1.1 (NC01): minion / pet / trap buckets (multiplicative with the owner's damage)
  'minionDamagePct', 'minionHpPct', 'trapDamagePct',
  // appended by GDD_TALENTS §0.4 (T0): Ustalık Kazancı (skill mastery XP gain)
  'skillMasteryPct',
  // appended by GDD_LIFE §7 (L-00): PvP damage dealt (power) / taken (resilience); PvP hits only
  'pvpPower', 'pvpResilience',
  // appended by CORE_MECHANICS §4.2 (CM1): secondary RATINGS (raw item/character values; StatCalc converts them to % with the
  // level-scaled cost and diminishing returns, CM2). leech / avoidance / speed are the rare tertiary ratings.
  'critRating', 'hasteRating', 'masteryRating', 'versRating', 'leechRating', 'avoidanceRating', 'speedRating',
] as const;

export type StatId = (typeof STAT_IDS)[number];
export type StatBlock = Partial<Record<StatId, number>>;

/** Turkish display names for tooltips. `pct` = render value*100 with a % sign. */
export const STAT_INFO: Record<StatId, { name: string; pct?: boolean }> = {
  str: { name: 'Güç' }, dex: { name: 'Çeviklik' }, int: { name: 'Zeka' }, vit: { name: 'Dayanıklılık' },
  maxHp: { name: 'Maks. Can' }, maxHpPct: { name: 'Maks. Can', pct: true }, maxResource: { name: 'Maks. Kaynak' },
  hpRegen: { name: 'Can Yenilenmesi/sn' }, resourceRegen: { name: 'Kaynak Yenilenmesi/sn' },
  hpOnHit: { name: 'Vuruş Başına Can' }, hpOnKill: { name: 'Öldürme Başına Can' }, lifeSteal: { name: 'Can Çalma', pct: true },
  weaponMin: { name: 'Min. Silah Hasarı' }, weaponMax: { name: 'Maks. Silah Hasarı' },
  attackSpeed: { name: 'Saldırı Hızı', pct: true }, castSpeed: { name: 'Büyü Hızı', pct: true }, damagePct: { name: 'Hasar', pct: true },
  physicalDamagePct: { name: 'Fiziksel Hasar', pct: true }, fireDamagePct: { name: 'Ateş Hasarı', pct: true },
  frostDamagePct: { name: 'Buz Hasarı', pct: true }, lightningDamagePct: { name: 'Şimşek Hasarı', pct: true },
  shadowDamagePct: { name: 'Gölge Hasarı', pct: true }, poisonDamagePct: { name: 'Zehir Hasarı', pct: true },
  holyDamagePct: { name: 'Kutsal Hasar', pct: true }, arcaneDamagePct: { name: 'Gizem Hasarı', pct: true },
  spellPower: { name: 'Büyü Gücü' }, critChance: { name: 'Kritik Şansı', pct: true }, critDamage: { name: 'Kritik Hasarı', pct: true },
  cdr: { name: 'Bekleme Süresi Azaltma', pct: true }, aoePct: { name: 'Alan Hasarı', pct: true }, dotPct: { name: 'Zamanla Hasar', pct: true },
  bossDamagePct: { name: 'Boss Hasarı', pct: true }, eliteDamagePct: { name: 'Elit Hasarı', pct: true }, armorPen: { name: 'Zırh Delme', pct: true },
  armor: { name: 'Zırh' }, armorPct: { name: 'Zırh', pct: true }, blockChance: { name: 'Blok Şansı', pct: true },
  blockAmount: { name: 'Blok Miktarı' }, dodgeChance: { name: 'Kaçınma Şansı', pct: true },
  damageReductionPct: { name: 'Hasar Azaltma', pct: true }, thorns: { name: 'Diken Hasarı' },
  resFire: { name: 'Ateş Direnci', pct: true }, resFrost: { name: 'Buz Direnci', pct: true }, resLightning: { name: 'Şimşek Direnci', pct: true },
  resShadow: { name: 'Gölge Direnci', pct: true }, resPoison: { name: 'Zehir Direnci', pct: true }, resArcane: { name: 'Gizem Direnci', pct: true }, resAll: { name: 'Tüm Dirençler', pct: true },
  ccReductionPct: { name: 'Kontrol Etkisi Azaltma', pct: true },
  moveSpeed: { name: 'Hareket Hızı' }, moveSpeedPct: { name: 'Hareket Hızı', pct: true },
  goldFindPct: { name: 'Altın Bulma', pct: true }, magicFindPct: { name: 'Büyülü Eşya Bulma', pct: true }, xpPct: { name: 'Tecrübe Kazancı', pct: true },
  pickupRadius: { name: 'Toplama Mesafesi' }, potionPct: { name: 'İksir Etkinliği', pct: true },
  // appended by items module
  allAttr: { name: 'Tüm Özellikler' },
  hpRegenPct: { name: 'Can Yenilenmesi', pct: true },
  healReceivedPct: { name: 'Alınan İyileştirme', pct: true },
  resourceRegenPct: { name: 'Kaynak Yenilenmesi', pct: true },
  resourceGainPct: { name: 'Kaynak Üretimi', pct: true },
  costReductionPct: { name: 'Maliyet Azaltma', pct: true },
  hpOnKillPct: { name: 'Öldürme Başına Can %', pct: true },
  meleeDamagePct: { name: 'Yakın Dövüş Hasarı', pct: true },
  projectileDamagePct: { name: 'Mermi Hasarı', pct: true },
  bleedDamagePct: { name: 'Kanama Hasarı', pct: true },
  executeDamagePct: { name: 'Düşük Canlılara Hasar', pct: true },
  ailingDamagePct: { name: 'Etkilenmişlere Hasar', pct: true },
  chilledDamagePct: { name: 'Üşümüşlere Hasar', pct: true },
  resPen: { name: 'Direnç Delme', pct: true },
  aoeRadiusPct: { name: 'Alan Genişliği', pct: true },
  projectileSpeedPct: { name: 'Mermi Hızı', pct: true },
  pierce: { name: 'Delme' },
  ccDurationPct: { name: 'Kontrol Etkisi Süresi', pct: true },
  staggerPct: { name: 'Sarsma', pct: true },
  bleedChance: { name: 'Kanama Şansı', pct: true },
  burnChance: { name: 'Yanma Şansı', pct: true },
  poisonChance: { name: 'Zehir Şansı', pct: true },
  weaponAps: { name: 'Silah Saldırı Hızı' },
  // appended by GDD_V2 §0.3 (WP1 contracts)
  healingPct: { name: 'Şifa Gücü', pct: true },
  threatPct: { name: 'Tehdit', pct: true },
  poiseDamagePct: { name: 'Duruş Hasarı', pct: true },
  guardGauge: { name: 'Siper Dayanıklılığı' },
  weaponArtPct: { name: 'Silah Sanatı Hasarı', pct: true },
  finisherPct: { name: 'Kritik Vuruş Hasarı', pct: true },
  flaskGainPct: { name: 'Şişe Dolumu', pct: true },
  flaskEffectPct: { name: 'Şişe Etkisi', pct: true },
  weakDamagePct: { name: 'Zayıflık Hasarı', pct: true },
  majorCdrPct: { name: 'Büyük Yetenek Soğuması', pct: true },
  runeEffectPct: { name: 'Rün Etkisi', pct: true },
  parryWindow: { name: 'Savuşturma Penceresi' },
  // appended by GDD_CLASSES_V2 §1.1 (NC01)
  minionDamagePct: { name: 'Yoldaş Hasarı', pct: true },
  minionHpPct: { name: 'Yoldaş Canı', pct: true },
  trapDamagePct: { name: 'Tuzak Hasarı', pct: true },
  // appended by GDD_TALENTS §0.4 (T0)
  skillMasteryPct: { name: 'Ustalık Kazancı', pct: true },
  // appended by GDD_LIFE §7 (L-00)
  pvpPower: { name: 'PvP Gücü', pct: true },
  pvpResilience: { name: 'PvP Direnci', pct: true },
  // appended by CORE_MECHANICS §4.2 (CM1): ratings are shown as raw numbers (no pct); the % conversion is StatCalc's (CM2)
  critRating: { name: 'Kritik Vuruş' },
  hasteRating: { name: 'Hız' },
  masteryRating: { name: 'Ustalık' },
  versRating: { name: 'Çok Yönlülük' },
  leechRating: { name: 'Can Çalma' },
  avoidanceRating: { name: 'Kaçınma' },
  speedRating: { name: 'Hareket Hızı' },
};

export function addStats(into: StatBlock, add: StatBlock, mult = 1): StatBlock {
  for (const k in add) {
    const id = k as StatId;
    into[id] = (into[id] ?? 0) + (add[id] ?? 0) * mult;
  }
  return into;
}

export const stat = (b: StatBlock, id: StatId) => b[id] ?? 0;
