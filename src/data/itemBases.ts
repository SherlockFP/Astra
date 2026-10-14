import type { ClassId } from '../types/common';
import type { ArmorWeight, ItemBaseDef, ItemCategory } from '../types/items';
import type { StatBlock } from '../types/stats';

/**
 * Item bases (GDD_SYSTEMS 4.4). Generated from compact tables so ids follow the GDD:
 *  weapons/off-hands `<type>_t<1..5>` (sword1h_t3), armour `<slot>_<weight>_t<n>` (helm_heavy_t2), jewelry/belts by name.
 * OWNER: items module.
 */

/** Tier minimum item levels (T5 "Kadim" drops only in Mythic+). */
export const TIER_MIN_ILVL = [1, 15, 30, 45, 70] as const;
export const tierRange = (tier: number): [number, number] => [TIER_MIN_ILVL[tier - 1], tier < 5 ? TIER_MIN_ILVL[tier] - 1 : 95];
/** Highest tier whose minimum item level is <= ilvl. */
export function tierForIlvl(ilvl: number): number {
  let t = 1;
  for (let i = 0; i < 5; i++) if (ilvl >= TIER_MIN_ILVL[i]) t = i + 1;
  return t;
}

export const ARMOR_WEIGHT_NAMES_TR: Record<ArmorWeight, string> = { heavy: 'Ağır', medium: 'Orta', light: 'Hafif' };
// GDD_CLASSES_V2 §8 (NC04): the five new classes' rows mirror data/classes.ts; NC06 derives these maps from the registry.
export const CLASS_ARMOR_WEIGHT: Record<ClassId, ArmorWeight> = {
  knight: 'heavy', barbarian: 'heavy', mage: 'light', rogue: 'medium',
  monk: 'medium', archer: 'medium', paladin: 'heavy', necromancer: 'light', warlock: 'light',
  demonhunter: 'medium', evoker: 'medium', // CM1 stubs (mirror the registry rows of data/classes.ts)
  priest: 'light', shaman: 'medium', druid: 'medium', // CLASS SCAFFOLD stubs
};
// Loot V3 F6 fix: derived from CLASS_ARMOR_WEIGHT, so the 7 newer classes can use (and be dropped) armour too
const classesOfWeight = (w: ArmorWeight): ClassId[] => (Object.keys(CLASS_ARMOR_WEIGHT) as ClassId[]).filter((c) => CLASS_ARMOR_WEIGHT[c] === w);
export const WEIGHT_CLASSES: Record<ArmorWeight, ClassId[]> = { heavy: classesOfWeight('heavy'), medium: classesOfWeight('medium'), light: classesOfWeight('light') };
/** Weapon / off-hand categories each class can use (GDD 4.1). */
export const CLASS_WEAPONS: Record<ClassId, ItemCategory[]> = {
  knight: ['sword1h'], barbarian: ['axe2h'], mage: ['staff', 'wand'], rogue: ['dagger'],
  monk: ['fist'], archer: ['bow'], paladin: ['sword1h', 'mace'], necromancer: ['staff', 'wand'], warlock: ['staff', 'wand'],
  demonhunter: ['dagger'], evoker: ['staff', 'wand'], // AE-3 / AE-4
  priest: ['staff', 'wand', 'mace'], shaman: ['mace', 'axe1h'], druid: ['staff', 'dagger', 'mace'], // CLASS SCAFFOLD stubs
};
export const CLASS_OFFHANDS: Record<ClassId, ItemCategory[]> = {
  knight: ['shield'], barbarian: [], mage: ['tome'], rogue: ['dagger'],
  monk: [], archer: ['quiver'], paladin: ['shield'], necromancer: ['tome'], warlock: ['tome'],
  demonhunter: ['dagger'], evoker: ['tome'], // CM1 stubs
  priest: ['tome'], shaman: [], druid: [], // CLASS SCAFFOLD stubs
};
export const CLASS_NAMES_TR: Record<ClassId, string> = {
  knight: 'Şövalye', barbarian: 'Barbar', mage: 'Büyücü', rogue: 'Haydut',
  monk: 'Keşiş', archer: 'Okçu', paladin: 'Paladin', necromancer: 'Nekromant', warlock: 'Warlock',
  demonhunter: 'İblis Avcısı', evoker: 'Ejderhasoy', // CM1
  priest: 'Rahip', shaman: 'Şaman', druid: 'Druid', // CLASS SCAFFOLD
};

export const WEAPON_CATEGORIES: ItemCategory[] = ['sword1h', 'sword2h', 'axe1h', 'axe2h', 'mace', 'staff', 'wand', 'dagger', 'crossbow', 'bow', 'fist'];
export const ARMOR_SLOT_CATEGORIES: ItemCategory[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];
export const OFFHAND_CATEGORIES: ItemCategory[] = ['shield', 'tome', 'quiver'];
export const JEWELRY_CATEGORIES: ItemCategory[] = ['amulet', 'ring'];
export const TWO_HANDED_CATEGORIES: ItemCategory[] = ['sword2h', 'axe2h', 'staff', 'bow', 'crossbow'];

export const isWeaponCategory = (c: ItemCategory) => WEAPON_CATEGORIES.includes(c);
export const isArmorCategory = (c: ItemCategory) => ARMOR_SLOT_CATEGORIES.includes(c);
export const isEquipmentCategory = (c: ItemCategory) =>
  isWeaponCategory(c) || isArmorCategory(c) || OFFHAND_CATEGORIES.includes(c) || JEWELRY_CATEGORIES.includes(c) || c === 'belt';

export const CATEGORY_NAMES_TR: Partial<Record<ItemCategory, string>> = {
  helm: 'Kask', shoulders: 'Omuzluk', chest: 'Zırh', gloves: 'Eldiven', legs: 'Pantolon', boots: 'Çizme', belt: 'Kemer', amulet: 'Kolye', ring: 'Yüzük',
  sword1h: 'Tek El Kılıç', sword2h: 'Çift El Kılıç', axe1h: 'Tek El Balta', axe2h: 'Çift El Balta', mace: 'Topuz', staff: 'Asa', wand: 'Değnek',
  dagger: 'Hançer', crossbow: 'Arbalet', bow: 'Yay', shield: 'Kalkan', tome: 'Büyü Kitabı', quiver: 'Okluk', fist: 'Yumruk Silahı',
  material: 'Malzeme', consumable: 'Kullanılabilir', keystone: 'Anahtar Taşı', gem: 'Taş', junk: 'Hurda',
};

export const ITEM_BASES: Record<string, ItemBaseDef> = {};
/** Per-item-level scaling of implicit stats (value = implicit + perIlvl * ilvl), keyed by base id. */
export const IMPLICIT_PER_ILVL: Record<string, StatBlock> = {};

const ic = (n: string) => `/assets/icons/${n}.svg`;
const KK = '/assets/models/weapons/';
const GEN = '/assets/models/gen/weapons/';

function put(b: ItemBaseDef): void {
  ITEM_BASES[b.id] = b;
}

// ------------------------------------------------------------------ weapons & off-hands (7 types x 5 tiers)
interface WeaponTypeDef {
  category: ItemCategory;
  hands: 1 | 2 | 0;               // 0 = off-hand
  aps?: number;
  typeMult?: number;
  classes: ClassId[];
  names: string[];                // T1..T5
  models: string[];               // T1..T5
  implicit: StatBlock[];          // T1..T5
  icons: string[];                // T1..T5
  maxSockets: number;
}
const WEAPON_TYPES: WeaponTypeDef[] = [
  {
    category: 'sword1h', hands: 1, aps: 1.4, typeMult: 1.0, classes: ['knight', 'paladin'], maxSockets: 2,
    names: ['Kısa Kılıç', 'Pala', 'Şövalye Kılıcı', 'Ejder Kılıcı', 'Kadim Kılıç'],
    models: [GEN + 'sword_1h_iron.glb', GEN + 'sword_1h_scimitar.glb', GEN + 'sword_1h_knight.glb', GEN + 'sword_1h_dragon.glb', GEN + 'sword_1h_jade.glb'],
    implicit: [0.01, 0.015, 0.02, 0.025, 0.03].map((v) => ({ critChance: v })),
    icons: ['item-sword', 'item-sword', 'item-sword', 'item-sword-rune', 'item-sword-rune'],
  },
  {
    // Paladin weapon (CLASS_WEAPONS.paladin = sword1h + mace): holy-damage implicit, the `mace` weapon art (wa_crushing_blow)
    category: 'mace', hands: 1, aps: 1.3, typeMult: 1.05, classes: ['paladin'], maxSockets: 2,
    names: ['Demir Topuz', 'Dikenli Topuz', 'Kutsal Gürz', 'Işık Gürzü', 'Kadim Gürz'],
    models: [GEN + 'mace_flanged.glb', GEN + 'mace_flanged.glb', GEN + 'mace_morningstar.glb', GEN + 'mace_morningstar.glb', GEN + 'mace_morningstar.glb'],
    implicit: [0.03, 0.04, 0.05, 0.06, 0.07].map((v) => ({ holyDamagePct: v })),
    icons: ['item-mace', 'item-mace', 'item-mace-spiked', 'item-mace-spiked', 'item-mace-spiked'],
  },
  {
    category: 'axe2h', hands: 2, aps: 1.0, typeMult: 1.55, classes: ['barbarian'], maxSockets: 3,
    names: ['Odun Baltası', 'Savaş Baltası', 'Çift Ağızlı Balta', 'Cellat Baltası', 'Kadim Balta'],
    models: [KK + 'axe_2handed.gltf', KK + 'axe_2handed.gltf', GEN + 'axe_2h_battle.glb', GEN + 'axe_2h_executioner.glb', GEN + 'axe_2h_infernal.glb'],
    implicit: [0.1, 0.15, 0.2, 0.25, 0.3].map((v) => ({ critDamage: v })),
    icons: ['item-axe-2h', 'item-axe-2h', 'item-axe-2h', 'item-axe-2h', 'item-axe-2h'],
  },
  {
    category: 'staff', hands: 2, aps: 1.1, typeMult: 1.45, classes: ['mage', 'necromancer', 'warlock', 'evoker', 'druid'], maxSockets: 3,
    names: ['Meşe Asa', 'Kemik Asa', 'Kristal Asa', 'Ejder Asası', 'Kadim Asa'],
    models: [GEN + 'staff_wood.glb', GEN + 'staff_skull.glb', GEN + 'staff_crystal.glb', GEN + 'staff_fire.glb', GEN + 'staff_frost.glb'],
    implicit: [0.1, 0.15, 0.2, 0.25, 0.3].map((v) => ({ resourceRegenPct: v })),
    icons: ['item-staff', 'item-staff-skull', 'item-staff', 'item-staff', 'item-staff'],
  },
  {
    category: 'wand', hands: 1, aps: 1.4, typeMult: 1.0, classes: ['mage', 'necromancer', 'warlock', 'evoker'], maxSockets: 2,
    names: ['Söğüt Değnek', 'Kemik Değnek', 'Kristal Değnek', 'Yıldız Değneği', 'Kadim Değnek'],
    models: [KK + 'wand.gltf', GEN + 'wand_bone.glb', GEN + 'wand_arcane.glb', GEN + 'wand_arcane.glb', GEN + 'wand_arcane.glb'],
    implicit: [0.04, 0.06, 0.08, 0.1, 0.12].map((v) => ({ castSpeed: v })),
    icons: ['item-wand', 'item-wand', 'item-wand-orb', 'item-wand-orb', 'item-wand-orb'],
  },
  {
    category: 'dagger', hands: 1, aps: 1.7, typeMult: 0.85, classes: ['rogue', 'demonhunter'], maxSockets: 2,
    names: ['Hançer', 'Kama', 'Gölge Hançeri', 'Yılan Dişi', 'Kadim Hançer'],
    models: [GEN + 'dagger_iron.glb', GEN + 'dagger_curved.glb', GEN + 'dagger_assassin.glb', GEN + 'dagger_ritual.glb', GEN + 'dagger_ritual.glb'],
    implicit: [0.02, 0.025, 0.03, 0.035, 0.04].map((v) => ({ critChance: v })),
    icons: ['item-dagger', 'item-dagger-curved', 'item-dagger-curved', 'item-dagger-curved', 'item-dagger-curved'],
  },
  {
    category: 'shield', hands: 0, classes: ['knight', 'paladin'], maxSockets: 1,
    names: ['Yuvarlak Kalkan', 'Armalı Kalkan', 'Kule Kalkanı', 'Dikenli Kalkan', 'Kadim Kalkan'],
    models: [GEN + 'shield_round_wood.glb', GEN + 'shield_kite_crest.glb', GEN + 'shield_tower.glb', GEN + 'shield_demon_spiked.glb', GEN + 'shield_demon_spiked.glb'],
    implicit: [0.12, 0.14, 0.16, 0.18, 0.2].map((v) => ({ blockChance: v })),
    icons: ['item-shield-round', 'item-shield', 'item-shield-tower', 'item-shield-tower', 'item-shield-tower'],
  },
  {
    // Keşiş (CLASS_WEAPONS.monk = fist): no mesh, the fists are the Barbarian rig's arms (hands tinted by the glow tier)
    category: 'fist', hands: 1, aps: 1.5, typeMult: 0.95, classes: ['monk'], maxSockets: 2,
    names: ['Sarılı Yumruk', 'Deri Sargı', 'Pirinç Yumruk', 'Ejder Pençesi', 'Kadim Yumruk'],
    models: ['', '', '', '', ''],
    implicit: [0.03, 0.04, 0.05, 0.06, 0.07].map((v) => ({ attackSpeed: v })),
    icons: ['item-gloves-leather', 'item-gloves-leather', 'item-gloves', 'item-gloves', 'item-gloves'],
  },
  {
    // Okçu (CLASS_WEAPONS.archer = bow, CLASS_OFFHANDS.archer = quiver): bow_short T1-2, bow_composite T3-5 (GDD_CLASSES_V2 §3.2)
    category: 'bow', hands: 2, aps: 1.0, typeMult: 1.5, classes: ['archer'], maxSockets: 3,
    names: ['Meşe Yay', 'Kısa Yay', 'Bozkır Yayı', 'Kompozit Yay', 'Kadim Yay'],
    models: [GEN + 'bow_short.glb', GEN + 'bow_short.glb', GEN + 'bow_composite.glb', GEN + 'bow_composite.glb', GEN + 'bow_composite.glb'],
    implicit: [0.1, 0.15, 0.2, 0.25, 0.3].map((v) => ({ critDamage: v })),
    icons: ['item-bow', 'item-bow', 'item-bow-long', 'item-bow-long', 'item-bow-long'],
  },
  {
    category: 'quiver', hands: 0, classes: ['archer'], maxSockets: 1,
    names: ['Deri Okluk', 'Kirişli Okluk', 'Kemik Okluk', 'Rüzgâr Okluğu', 'Kadim Okluk'],
    models: [KK + 'quiver.gltf', KK + 'quiver.gltf', KK + 'quiver.gltf', KK + 'quiver.gltf', KK + 'quiver.gltf'],
    implicit: [0.08, 0.1, 0.12, 0.14, 0.16].map((v) => ({ resourceRegenPct: v })),
    icons: ['item-quiver', 'item-quiver', 'item-quiver', 'item-quiver', 'item-quiver'],
  },
  {
    category: 'tome', hands: 0, classes: ['mage', 'necromancer', 'warlock', 'evoker'], maxSockets: 1,
    names: ['Eski Defter', 'Büyü Kitabı', 'Mühürlü Kitap', 'Kara Kitap', 'Kadim Kitap'],
    models: [KK + 'spellbook_closed.gltf', KK + 'spellbook_closed.gltf', KK + 'spellbook_closed.gltf', KK + 'spellbook_closed.gltf', KK + 'spellbook_closed.gltf'],
    implicit: [
      { damagePct: 0.06, maxResource: 5 }, { damagePct: 0.09, maxResource: 8 }, { damagePct: 0.12, maxResource: 10 },
      { damagePct: 0.15, maxResource: 12 }, { damagePct: 0.18, maxResource: 15 },
    ],
    icons: ['item-tome', 'item-tome', 'item-tome', 'item-tome', 'item-tome'],
  },
];

for (const w of WEAPON_TYPES) {
  for (let t = 1; t <= 5; t++) {
    const mult = w.typeMult ?? 0;
    const avg1 = 6.5 * mult;
    put({
      id: `${w.category}_t${t}`, name: w.names[t - 1], category: w.category, icon: ic(w.icons[t - 1]), model: w.models[t - 1],
      minLevel: Math.max(1, TIER_MIN_ILVL[t - 1] - 2), itemLevelRange: tierRange(t), classes: w.classes,
      implicit: w.implicit[t - 1], weaponDamage: mult ? [Math.round(0.8 * avg1), Math.round(1.2 * avg1)] : undefined,
      attacksPerSecond: w.aps, twoHanded: w.hands === 2 || undefined, tier: t, typeMult: w.typeMult, maxSockets: w.maxSockets,
      armorWeight: w.category === 'shield' ? 'heavy' : undefined, slotMult: w.category === 'shield' ? 1.5 : undefined,
      typeName: CATEGORY_NAMES_TR[w.category],
    });
  }
}

// ------------------------------------------------------------------ armour (6 slots x 3 weights x 5 tiers)
const ARMOR_SLOTS: { slot: ItemCategory; mult: number; sockets: number }[] = [
  { slot: 'helm', mult: 1.0, sockets: 2 }, { slot: 'shoulders', mult: 0.9, sockets: 1 }, { slot: 'chest', mult: 1.4, sockets: 2 },
  { slot: 'gloves', mult: 0.7, sockets: 1 }, { slot: 'legs', mult: 1.2, sockets: 2 }, { slot: 'boots', mult: 0.8, sockets: 1 },
];
const ARMOR_NAMES: Record<ArmorWeight, Record<string, string[]>> = {
  heavy: {
    helm: ['Demir Miğfer', 'Çelik Miğfer', 'Muhafız Miğferi', 'Ejder Miğferi', 'Kadim Miğfer'],
    shoulders: ['Demir Omuzluk', 'Çelik Omuzluk', 'Muhafız Omuzluğu', 'Ejder Omuzluğu', 'Kadim Omuzluk'],
    chest: ['Demir Zırh', 'Çelik Zırh', 'Muhafız Zırhı', 'Ejder Zırhı', 'Kadim Zırh'],
    gloves: ['Demir Eldiven', 'Çelik Eldiven', 'Muhafız Eldiveni', 'Ejder Eldiveni', 'Kadim Eldiven'],
    legs: ['Demir Bacaklık', 'Çelik Bacaklık', 'Muhafız Bacaklığı', 'Ejder Bacaklığı', 'Kadim Bacaklık'],
    boots: ['Demir Çizme', 'Çelik Çizme', 'Muhafız Çizmesi', 'Ejder Çizmesi', 'Kadim Çizme'],
  },
  medium: {
    helm: ['Deri Başlık', 'Pullu Başlık', 'Avcı Başlığı', 'Gölge Başlığı', 'Kadim Başlık'],
    shoulders: ['Deri Omuzluk', 'Pullu Omuzluk', 'Avcı Omuzluğu', 'Gölge Omuzluğu', 'Kadim Omuzluk'],
    chest: ['Deri Yelek', 'Pullu Yelek', 'Avcı Yeleği', 'Gölge Yeleği', 'Kadim Yelek'],
    gloves: ['Deri Eldiven', 'Pullu Eldiven', 'Avcı Eldiveni', 'Gölge Eldiveni', 'Kadim Eldiven'],
    legs: ['Deri Pantolon', 'Pullu Pantolon', 'Avcı Pantolonu', 'Gölge Pantolonu', 'Kadim Pantolon'],
    boots: ['Deri Bot', 'Pullu Bot', 'Avcı Botu', 'Gölge Botu', 'Kadim Bot'],
  },
  light: {
    helm: ['Keten Şapka', 'İpek Şapka', 'Tılsımlı Şapka', 'Yıldız Şapkası', 'Kadim Şapka'],
    shoulders: ['Keten Şal', 'İpek Şal', 'Tılsımlı Şal', 'Yıldız Şalı', 'Kadim Şal'],
    chest: ['Keten Cübbe', 'İpek Cübbe', 'Tılsımlı Cübbe', 'Yıldız Cübbesi', 'Kadim Cübbe'],
    gloves: ['Keten Eldiven', 'İpek Eldiven', 'Tılsımlı Eldiven', 'Yıldız Eldiveni', 'Kadim Eldiven'],
    legs: ['Keten Şalvar', 'İpek Şalvar', 'Tılsımlı Şalvar', 'Yıldız Şalvarı', 'Kadim Şalvar'],
    boots: ['Keten Sandalet', 'İpek Sandalet', 'Tılsımlı Sandalet', 'Yıldız Sandaleti', 'Kadim Sandalet'],
  },
};
const ARMOR_ICON: Record<ArmorWeight, Record<string, string>> = {
  heavy: { helm: 'item-helm-heavy', shoulders: 'item-shoulders-spiked', chest: 'item-chest', gloves: 'item-gloves', legs: 'item-pants', boots: 'item-boots' },
  medium: { helm: 'item-hood', shoulders: 'item-shoulders', chest: 'item-chest-leather', gloves: 'item-gloves-leather', legs: 'item-pants-cloth', boots: 'item-boots-leather' },
  light: { helm: 'item-hood', shoulders: 'item-cape', chest: 'item-chest-cloth', gloves: 'item-gloves-leather', legs: 'item-pants-cloth', boots: 'item-boots-leather' },
};
for (const weight of ['heavy', 'medium', 'light'] as ArmorWeight[]) {
  const wm = weight === 'heavy' ? 1.0 : weight === 'medium' ? 0.6 : 0.35;
  for (const s of ARMOR_SLOTS) {
    for (let t = 1; t <= 5; t++) {
      put({
        id: `${s.slot}_${weight}_t${t}`, name: ARMOR_NAMES[weight][s.slot][t - 1], category: s.slot, icon: ic(ARMOR_ICON[weight][s.slot]),
        minLevel: Math.max(1, TIER_MIN_ILVL[t - 1] - 2), itemLevelRange: tierRange(t), classes: WEIGHT_CLASSES[weight],
        tier: t, armorWeight: weight, slotMult: s.mult * wm, maxSockets: s.sockets, typeName: `${CATEGORY_NAMES_TR[s.slot]} (${ARMOR_WEIGHT_NAMES_TR[weight]})`,
      });
    }
  }
}

// ------------------------------------------------------------------ jewelry & belts (GDD 4.4 table; implicit = a + b*ilvl)
interface JewelDef { id: string; name: string; category: ItemCategory; minIlvl: number; icon: string; implicit: StatBlock; perIlvl: StatBlock; desc?: string }
const JEWELS: JewelDef[] = [
  { id: 'ring_iron', name: 'Demir Yüzük', category: 'ring', minIlvl: 1, icon: 'item-ring', implicit: { maxHp: 5 }, perIlvl: { maxHp: 2 } },
  { id: 'ring_silver', name: 'Gümüş Yüzük', category: 'ring', minIlvl: 10, icon: 'item-ring-gem', implicit: { resAll: 0.03 }, perIlvl: { resAll: 0.001 } },
  { id: 'ring_gold', name: 'Altın Yüzük', category: 'ring', minIlvl: 20, icon: 'item-ring-power', implicit: { critChance: 0.01 }, perIlvl: { critChance: 0.000250 } },
  { id: 'ring_jade', name: 'Yeşim Yüzük', category: 'ring', minIlvl: 30, icon: 'item-ring-gem', implicit: { resourceRegenPct: 0.05 }, perIlvl: { resourceRegenPct: 0.0016667 } },
  { id: 'amulet_bone', name: 'Kemik Kolye', category: 'amulet', minIlvl: 1, icon: 'item-amulet', implicit: { str: 2 }, perIlvl: { str: 1 / 3 } },
  { id: 'amulet_onyx', name: 'Oniks Kolye', category: 'amulet', minIlvl: 1, icon: 'item-necklace', implicit: { dex: 2 }, perIlvl: { dex: 1 / 3 } },
  { id: 'amulet_lapis', name: 'Lapis Kolye', category: 'amulet', minIlvl: 1, icon: 'item-necklace', implicit: { int: 2 }, perIlvl: { int: 1 / 3 } },
  { id: 'amulet_amber', name: 'Kehribar Kolye', category: 'amulet', minIlvl: 10, icon: 'item-amulet', implicit: { vit: 2 }, perIlvl: { vit: 1 / 3 } },
  { id: 'amulet_ancient', name: 'Kadim Kolye', category: 'amulet', minIlvl: 50, icon: 'item-amulet', implicit: { allAttr: 2 }, perIlvl: { allAttr: 1 / 6 } },
  { id: 'belt_leather', name: 'Deri Kemer', category: 'belt', minIlvl: 1, icon: 'item-belt', implicit: { maxHp: 5 }, perIlvl: { maxHp: 2 } },
  { id: 'belt_chain', name: 'Zincir Kemer', category: 'belt', minIlvl: 15, icon: 'item-belt', implicit: { armor: 5 }, perIlvl: { armor: 3 } },
  { id: 'belt_heavy', name: 'Ağır Kemer', category: 'belt', minIlvl: 30, icon: 'item-belt', implicit: { str: 1, vit: 1 }, perIlvl: { str: 1 / 6, vit: 1 / 6 } },
  { id: 'belt_sash', name: 'İpek Kuşak', category: 'belt', minIlvl: 30, icon: 'item-belt', implicit: { potionPct: 0.1 }, perIlvl: { potionPct: 0.0016667 } },
];
for (const j of JEWELS) {
  put({
    id: j.id, name: j.name, category: j.category, icon: ic(j.icon), minLevel: Math.max(1, j.minIlvl - 2), itemLevelRange: [j.minIlvl, 95],
    implicit: j.implicit, maxSockets: 1, typeName: CATEGORY_NAMES_TR[j.category],
  });
  IMPLICIT_PER_ILVL[j.id] = j.perIlvl;
}

// ------------------------------------------------------------------ lookups
export const BASES_BY_CATEGORY: Partial<Record<ItemCategory, ItemBaseDef[]>> = {};
for (const b of Object.values(ITEM_BASES)) (BASES_BY_CATEGORY[b.category] ??= []).push(b);

/** Class armour weight of a base (heavy/medium/light) or undefined for non-armour. */
export const baseWeight = (b: ItemBaseDef): ArmorWeight | undefined => b.armorWeight;

/** Can the class use this base (weapon type / armour weight / off-hand)? Jewelry & belts: everyone. */
export function classCanUseBase(classId: ClassId, b: ItemBaseDef): boolean {
  if (b.classes && !b.classes.includes(classId)) return false;
  return true;
}
