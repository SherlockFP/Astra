import type { ClassId } from '../../types/common';
import type { VfxId } from '../../types/vfx';
import type { SfxId } from '../../types/audio';
import { getClass } from '../../data/classes';

/**
 * Presentation data for the character creation screen (Turkish copy, showcase animations, colour variants).
 * Authoritative gameplay data lives in data/classes.ts (combat module); when a ClassDef exists its name/desc/
 * resourceName/color override the fallbacks below.
 * OWNER: scenes module (menu).
 */

export interface ShowcaseStep {
  /** KayKit clip name. */
  clip: string;
  /** Effect spawned in front of the character at `vfxAt` seconds into the clip. */
  vfx?: VfxId;
  vfxAt?: number;
  /** Local-space offset of the effect (x right, y up, z forward). */
  offset?: [number, number, number];
  vfxScale?: number;
  sfx?: SfxId;
  speed?: number;
}

export interface ClassPresentation {
  id: ClassId;
  name: string;
  tagline: string;
  role: string;
  resource: string;
  resourceColor: string;
  desc: string;
  highlights: string[];
  stats: { dayaniklilik: number; hasar: number; hareket: number; menzil: number };
  color: string;
  icon: string;
  idle: string;
  showcase: ShowcaseStep[];
}

const FALLBACK: Record<ClassId, ClassPresentation> = {
  knight: {
    id: 'knight', name: 'Şövalye', tagline: 'Kalenin Kalkanı', role: 'Tank · Ön Saf', resource: 'Kararlılık', resourceColor: '#e8c46a',
    desc: 'Zırhı ve kalkanıyla orduların önünde dikilir. Düşmanları üzerine çeker, kutsal ışıkla keser ve yoldaşlarını korur. Grubun sarsılmaz duvarıdır.',
    highlights: ['Kalkan Darbesi: sersemlet ve geri it', 'Hücum: hedefe atıl, yoldakileri devir', 'Göksel Hüküm: gökten kutsal darbe'],
    stats: { dayaniklilik: 5, hasar: 3, hareket: 2, menzil: 1 }, color: '#7fa8ff', icon: '/assets/icons/class-knight.svg', idle: 'Idle',
    showcase: [
      { clip: '1H_Melee_Attack_Slice_Diagonal', vfx: 'slash_arc', vfxAt: 0.36, offset: [0, 1.3, 1.2], sfx: 'swing_light' },
      { clip: '1H_Melee_Attack_Chop', vfx: 'slash_arc_big', vfxAt: 0.4, offset: [0, 1.5, 1.3], sfx: 'swing_heavy' },
      { clip: 'Block' },
      { clip: 'Cheer' },
    ],
  },
  barbarian: {
    id: 'barbarian', name: 'Barbar', tagline: 'Öfkenin Çocuğu', role: 'Yakın Dövüş · Alan Hasarı', resource: 'Öfke', resourceColor: '#ff6a30',
    desc: 'Devasa baltasını savuran vahşi bir savaşçı. Dövüştükçe öfkesi büyür, düşmanın kanıyla iyileşir ve sürüleri tek hamlede biçer.',
    highlights: ['Dönen Balta: çevrendeki herkesi biç', 'Kana Susamış: öfke saldırı hızına dönüşür', 'Yer Sarsıntısı: şok dalgasıyla ez'],
    stats: { dayaniklilik: 4, hasar: 5, hareket: 3, menzil: 1 }, color: '#ff7a3a', icon: '/assets/icons/class-barbarian.svg', idle: '2H_Melee_Idle',
    showcase: [
      { clip: '2H_Melee_Attack_Slice', vfx: 'slash_arc_big', vfxAt: 0.42, offset: [0, 1.3, 1.4], sfx: 'swing_heavy' },
      { clip: '2H_Melee_Attack_Spin', vfx: 'spin_slash', vfxAt: 0.5, offset: [0, 1.0, 0], speed: 1.5, sfx: 'whoosh' },
      { clip: '2H_Melee_Attack_Chop', vfx: 'ground_slam', vfxAt: 0.62, offset: [0, 0.1, 1.8], sfx: 'ground_slam' },
      { clip: 'Cheer' },
    ],
  },
  mage: {
    id: 'mage', name: 'Büyücü', tagline: 'Elementlerin Efendisi', role: 'Uzak Menzil · Büyü', resource: 'Mana', resourceColor: '#4f8bff',
    desc: 'Ateş, buz ve gizem büyüleriyle uzaktan yıkım saçar. Elementleri ustaca değiştirdikçe güçlenir; ama bir kez yakalandı mı, kolay yaralanır.',
    highlights: ['Gizem Oku: hızlı üçlü büyü zinciri', 'Element Dengesi: elementi değiştir, hasarı artır', 'Meteor ve Don: alan yıkımı'],
    stats: { dayaniklilik: 1, hasar: 5, hareket: 2, menzil: 5 }, color: '#b27bff', icon: '/assets/icons/class-mage.svg', idle: 'Idle',
    showcase: [
      { clip: 'Spellcast_Shoot', vfx: 'fire_burst', vfxAt: 0.35, offset: [0, 1.5, 1.4], sfx: 'fire_cast' },
      { clip: 'Spellcast_Raise', vfx: 'frost_nova', vfxAt: 1.0, offset: [0, 0.1, 1.6], sfx: 'frost_cast' },
      { clip: 'Spellcast_Long', vfx: 'arcane_burst', vfxAt: 1.2, offset: [0, 1.6, 1.4], sfx: 'spell_cast' },
      { clip: 'Cheer' },
    ],
  },
  rogue: {
    id: 'rogue', name: 'Haydut', tagline: 'Gölgelerin Bıçağı', role: 'Çevik · Suikastçı', resource: 'Enerji', resourceColor: '#e2c22a',
    desc: 'Hançerleri ve arbaletiyle gölgelerden vurur. Arkadan darbeler ve kombo puanlarıyla ölümcül hasar verir; kaçışlarıyla hiçbir tehlike onu yakalayamaz.',
    highlights: ['Hançer Kombosu: seri ve ölümcül', 'Fırsatçı: arkadan darbeler daha sert', 'Arbalet Atışı ve Duman Bombası'],
    stats: { dayaniklilik: 2, hasar: 4, hareket: 5, menzil: 3 }, color: '#5fd18c', icon: '/assets/icons/class-rogue.svg', idle: 'Idle',
    showcase: [
      { clip: 'Dualwield_Melee_Attack_Slice', vfx: 'slash_arc', vfxAt: 0.35, offset: [0, 1.2, 1.1], sfx: 'swing_light' },
      { clip: 'Dualwield_Melee_Attack_Chop', vfx: 'slash_arc', vfxAt: 0.35, offset: [0, 1.3, 1.1], sfx: 'swing_light' },
      { clip: 'Throw', vfx: 'dagger_projectile', vfxAt: 0.7, offset: [0, 1.4, 1.2], sfx: 'dagger_throw' },
      { clip: 'Cheer' },
    ],
  },
  // GDD_CLASSES_V2 §13.2 (NC04): presentation rows verbatim. The menu only offers PLAYABLE_CLASSES (data/classes.ts).
  monk: {
    id: 'monk', name: 'Keşiş', tagline: 'Bedenin ve Ruhun Ustası', role: 'Tank · DPS · Çi Ustası', resource: 'Enerji + Çi', resourceColor: '#e2c22a',
    desc: 'Silah yerine yumruğu, tekmeyi ve nefesi (Çi) kullanan sis tekkesinin dövüşçüsü. Kombolarını zincirler, yuvarlanıp sıçrar; demci olarak darbeleri erteler, rüzgâr yürüyen olarak durmadan vurur.',
    highlights: ['Yükselen Tekme → Uçan Yılan: tekme zincirinden sonra sıçra', 'Çi: vuruşlar biriktirir, ağır beceriler harcar', 'Sarsma: aldığın hasarı ertele, iksirle temizle'],
    stats: { dayaniklilik: 3, hasar: 4, hareket: 5, menzil: 1 }, color: '#4fd1c5', icon: '/assets/icons/buff-strength.svg', idle: 'Unarmed_Idle',
    showcase: [
      { clip: 'Unarmed_Melee_Attack_Punch_A', vfx: 'slash_arc', vfxAt: 0.40, offset: [0, 1.3, 1.1], sfx: 'swing_light', speed: 1.4 },
      { clip: 'Unarmed_Melee_Attack_Kick', vfx: 'slash_arc_big', vfxAt: 0.34, offset: [0, 0.8, 1.3], sfx: 'swing_heavy' },
      { clip: 'Dualwield_Melee_Attack_Stab', vfx: 'shockwave', vfxAt: 0.50, offset: [0, 0.1, 1.8], vfxScale: 0.5, sfx: 'ground_slam', speed: 1.3 },
      { clip: 'Cheer' },
    ],
  },
  archer: {
    id: 'archer', name: 'Okçu', tagline: 'Rüzgârın Gözü', role: 'Uzak Menzil · Avcı', resource: 'Odak', resourceColor: '#d9a441',
    desc: 'Bozkırın yay ustası. Uzaktan vurur, geri sıçrar, tuzak kurar ve kurt yoldaşıyla avlanır. Hareketsiz durdukça Odağı hızla dolar; nişancı olarak tek hedefi avlar, av ustası olarak sürüsüyle savaşır.',
    highlights: ['Nişanlı Atış: yayı çek, tam çekişte öldür', 'Geri Sıçrayış: kaç ve vurmaya devam et', 'Av Sürüsü: iki ek kurtla sürüyle saldır'],
    stats: { dayaniklilik: 1, hasar: 5, hareket: 3, menzil: 5 }, color: '#d9a441', icon: '/assets/icons/class-ranger.svg', idle: 'Idle',
    showcase: [
      { clip: '2H_Ranged_Shoot', vfx: 'hit_spark', vfxAt: 0.30, offset: [0, 1.5, 1.6], sfx: 'crossbow_shot' },
      { clip: 'Dodge_Backward', vfx: 'dodge_dust', vfxAt: 0.10, offset: [0, 0.1, 0] },
      { clip: '2H_Ranged_Shoot', vfx: 'shockwave', vfxAt: 0.40, offset: [0, 1.4, 2.0], vfxScale: 0.4, sfx: 'crossbow_shot', speed: 0.75 },
      { clip: 'Cheer' },
    ],
  },
  paladin: {
    id: 'paladin', name: 'Paladin', tagline: 'Işığın Yeminli Kılıcı', role: 'Tank · Şifacı · Savaşçı', resource: 'İnanç + Kutsal Güç', resourceColor: '#ffe9a0',
    desc: 'Kılıcı, topuzu ve kalkanıyla ışığa yemin etmiş zırhlı rahip. Koruma ile düşman dalgalarını durdurur, Kutsal ile ölmekte olan dostu geri çağırır, Ceza ile hüküm verir; auralarıyla tüm partiyi güçlendirir.',
    highlights: ['Yargı → Kutsal Hüküm: yargıla, sonra hükmet', 'Kutsal Güç: vurarak biriktir, Işığın Sözü ile iyileş', 'Şifa Eli: ölmek üzere olan dostu kurtar'],
    stats: { dayaniklilik: 5, hasar: 3, hareket: 2, menzil: 2 }, color: '#fff0b8', icon: '/assets/icons/class-cleric.svg', idle: 'Idle',
    showcase: [
      { clip: '1H_Melee_Attack_Slice_Diagonal', vfx: 'slash_arc', vfxAt: 0.38, offset: [0, 1.3, 1.2], sfx: 'swing_light' },
      { clip: 'Spellcast_Raise', vfx: 'holy_burst', vfxAt: 0.90, offset: [0, 0.2, 1.6], sfx: 'heal', speed: 2.0 },
      { clip: '1H_Melee_Attack_Chop', vfx: 'slash_arc_big', vfxAt: 0.45, offset: [0, 1.5, 1.3], sfx: 'swing_heavy' },
      { clip: 'Cheer' },
    ],
  },
  necromancer: {
    id: 'necromancer', name: 'Nekromant', tagline: 'Kemiklerin Fısıltısı', role: 'Çağırıcı · Ölüm Büyücüsü', resource: 'Öz', resourceColor: '#6fe3b0',
    desc: 'Ölümü hammadde sayan kuzgun kastının büyücüsü. Düşen düşmanların cesetlerini iskelete, patlamaya ya da laneti dönüştürür. Ordu efendisi olarak sürü yönetir, kemik ustası olarak doğrudan yıkım saçar.',
    highlights: ['İskelet çağır: cesetten daha güçlü minion', 'Kemik Mızrağı → Ceset Patlaması: zinciri başlat', 'Ölüler Ordusu: sekiz iskelet birden'],
    stats: { dayaniklilik: 2, hasar: 5, hareket: 2, menzil: 4 }, color: '#9ee07a', icon: '/assets/icons/skill-summon-skeleton.svg', idle: 'Idle',
    showcase: [
      { clip: 'Spellcast_Shoot', vfx: 'hit_magic', vfxAt: 0.37, offset: [0, 1.5, 1.4], sfx: 'shadow_cast' },
      { clip: 'Spellcast_Raise', vfx: 'death_poof', vfxAt: 0.95, offset: [0, 0.1, 2.0], speed: 2.0 },
      { clip: 'Spellcast_Long', vfx: 'death_bones', vfxAt: 1.5, offset: [0, 0.1, 2.2], sfx: 'boss_cast', speed: 1.6 },
      { clip: 'Cheer' },
    ],
  },
  warlock: {
    id: 'warlock', name: 'Warlock', tagline: 'Karanlığın Sözleşmesi', role: 'Lanetler · İblis Yoldaşı', resource: 'Mana + Ruh Parçası', resourceColor: '#4f8bff',
    desc: 'Ruhunu bir iblise rehin bırakmış kızıl pakt büyücüsü. Acıyı zamanla bir silaha çevirir; canını manaya, ruh parçalarını kaosa dönüştürür. İblis yoldaşı ve kıyamet ateşiyle savaşır.',
    highlights: ['Azap · Yozlaşma · Dengesiz Azap: lanet zinciri', 'İblis yoldaşı: İblisçik ya da Boşluk Gezgini', 'Kaos Oku: Ruh Parçalarını yıkıma çevir'],
    stats: { dayaniklilik: 2, hasar: 5, hareket: 2, menzil: 5 }, color: '#c05ae0', icon: '/assets/icons/skill-curse.svg', idle: 'Idle',
    showcase: [
      { clip: 'Spellcast_Shoot', vfx: 'shadow_burst', vfxAt: 0.37, offset: [0, 1.5, 1.4], sfx: 'shadow_cast' },
      { clip: 'Spellcast_Raise', vfx: 'fire_burst', vfxAt: 0.95, offset: [0, 0.1, 1.8], sfx: 'fire_cast', speed: 2.0 },
      { clip: 'Spellcast_Long', vfx: 'meteor_fall', vfxAt: 1.4, offset: [0, 0.1, 2.2], sfx: 'explosion' },
      { clip: 'Cheer' },
    ],
  },
  // CORE_MECHANICS §2 (CM1): presentation stubs of the two new classes. Not in CLASS_ORDER (not selectable); no showcase yet.
  demonhunter: {
    id: 'demonhunter', name: 'İblis Avcısı', tagline: 'Şeytani Öfkenin Avcısı', role: 'Hız · Gazap', resource: 'Gazap', resourceColor: '#b8ff3a',
    desc: 'Gözünü şeytani bir nefretle açan avcı. İki hançerle ve kanatlarıyla hızlıca yer değiştirir; düşman ateşiyle beslenir.',
    highlights: [], stats: { dayaniklilik: 3, hasar: 5, hareket: 5, menzil: 1 }, color: '#a330c9', icon: '/assets/icons/skill-claw-strike.svg', idle: 'Idle',
    showcase: [],
  },
  evoker: {
    id: 'evoker', name: 'Ejderhasoy', tagline: 'Ejderhanın Nefesi', role: 'Ejderha Nefesi · Destek', resource: 'Öz', resourceColor: '#d9a441',
    desc: 'Ejderha soyunun son büyücüsü. Tunç ve yeşil nefesiyle yakın ve uzak düşmanları yakar; müttefiklerini kanatlarının altına alır.',
    highlights: [], stats: { dayaniklilik: 3, hasar: 4, hareket: 2, menzil: 4 }, color: '#33937f', icon: '/assets/icons/skill-fire-breath.svg', idle: 'Idle',
    showcase: [],
  },
};

export function classPresentation(id: ClassId): ClassPresentation {
  const f = FALLBACK[id];
  const def = getClass(id);
  if (!def || !def.name) return f;
  return {
    ...f,
    name: def.name || f.name,
    desc: def.desc || f.desc,
    resource: def.resourceName || f.resource,
    color: def.color || f.color,
  };
}

export const CLASS_ORDER: ClassId[] = ['knight', 'barbarian', 'mage', 'rogue', 'paladin', 'necromancer', 'warlock'];

export interface VariantDef { name: string; css: string; tint: number }
/** Colour variants (appearance.variant index). `tint` is only used by the scenes-side fallback model loader. */
export const VARIANTS: VariantDef[] = [
  { name: 'Klasik', css: '#e8e2d2', tint: 0xffffff },
  { name: 'Kızıl', css: '#d8604c', tint: 0xffb4a2 },
  { name: 'Zümrüt', css: '#58b870', tint: 0xb4ffbc },
  { name: 'Safir', css: '#5a82e0', tint: 0xa8c4ff },
  { name: 'Altın', css: '#e0b840', tint: 0xffe296 },
  { name: 'Gölge', css: '#8a70b0', tint: 0x9c8ac0 },
];

const NAME_POOL = [
  'Aylin', 'Kaan', 'Demir', 'Selin', 'Tuna', 'Alparslan', 'Yağmur', 'Bora', 'Elif', 'Korkut', 'Deniz', 'Arda', 'Nehir', 'Toprak', 'Ayaz', 'Işık',
  'Umay', 'Batu', 'Ceren', 'Tarkan', 'Alaz', 'Kıvanç', 'Zeynep', 'Mete', 'Yiğit', 'Gökçe', 'Ilgaz', 'Barış', 'Özge', 'Boran', 'Efe', 'Sinan',
  'Asya', 'Tolga', 'Melek', 'Cengiz', 'Dilara', 'Oğuz', 'Berk', 'Hazal',
];

export function randomName(): string {
  return NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
}

const NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû][A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû0-9 '_-]*$/;

/** Returns a Turkish error message or null when valid. */
export function validateName(raw: string, existing: string[]): string | null {
  const name = raw.trim();
  if (name.length < 2) return 'İsim en az 2 karakter olmalı.';
  if (name.length > 14) return 'İsim en fazla 14 karakter olabilir.';
  if (!NAME_RE.test(name)) return "Sadece harf, rakam, boşluk ve - _ ' kullanılabilir (harfle başlamalı).";
  if (/\s{2,}/.test(name)) return 'Birden fazla boşluk kullanılamaz.';
  const low = name.toLocaleLowerCase('tr');
  if (existing.some((n) => n.toLocaleLowerCase('tr') === low)) return 'Bu isimde bir karakterin zaten var.';
  return null;
}
