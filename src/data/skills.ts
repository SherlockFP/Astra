import type { SkillDef } from '../types/skills';
// GDD_CLASSES_V2 (NC04): per-class skillset files, wired once here. Each package fills only its own file.
import { registerMonk } from './skillsets/monk';
import { registerArcher } from './skillsets/archer';
import { registerPaladin } from './skillsets/paladin';
import { registerNecromancer } from './skillsets/necromancer';
import { registerWarlock } from './skillsets/warlock';
import { registerMonkSpecs } from './skillsets/monkSpecs';
import { registerPriest } from './skillsets/priest';
import { registerPriestSpecs } from './skillsets/priestSpecs';
import { registerShaman } from './skillsets/shaman';
import { registerShamanSpecs } from './skillsets/shamanSpecs';
import { registerDruid } from './skillsets/druid';
import { registerDruidSpecs } from './skillsets/druidSpecs';
import { registerArcherSpecs } from './skillsets/archerSpecs';
import { registerPaladinSpecs } from './skillsets/paladinSpecs';
import { registerPaladinHoly } from './skillsets/paladinHoly';
import { registerNecromancerSpecs } from './skillsets/necromancerSpecs';
import { registerWarlockSpecs } from './skillsets/warlockSpecs';
// AE-3 / AE-4 (docs/kits/agile-evoker.md): İblis Avcısı and Ejderhasoy rows
import { registerDemonHunter } from './skillsets/demonhunter';
import { registerDemonHunterSpecs } from './skillsets/demonhunterSpecs';
import { registerEvoker } from './skillsets/evoker';
import { registerEvokerSpecs } from './skillsets/evokerSpecs';
import { registerLayerMonkArcher } from './skillsets/layerMonkArcher';
import { registerLayerPaladinCasters } from './skillsets/layerPaladinCasters';
// GDD_TALENTS (T0): compile-only stubs, filled by T8 (mage spec rows) and T9 (class utility rows). Merged at the end of this file.
import { MAGE_SPEC_SKILLS } from './skills_mage_specs';
import { CLASS_UTIL_SKILLS } from './skills_class_utils';
// KIT PK-0 (docs/kits/casters-rogue.md §h): empty kit tables until PK-MAGE / PK-ROGUE / PK-WARLOCK fill them.
import { SKILLS_KIT_MAGE } from './skills_kit_mage';
import { SKILLS_KIT_ROGUE } from './skills_kit_rogue';
import { SKILLS_KIT_WARLOCK } from './skills_kit_warlock';
import { registerKnight } from './skillsets/knight';
import { registerBarbarian } from './skillsets/barbarian';
import { OPENING_KIT } from './openingKit';

/**
 * OWNER: combat module. Every player skill (basic attack combo steps included) keyed by id. GDD_SYSTEMS 2.1-2.4.
 *
 * Timing convention (all in CLIP seconds at speed 1; SkillSystem divides by animSpeed x attack/cast speed):
 *   hitTime            when the effect fires (clip time of the impact frame)
 *   params.end         when the action is over (clip time)
 *   params.chain       seconds after the hit when the NEXT action may start (default 0.05 basic / 0.10 skills)
 *   params.move        seconds after the hit when movement is free again (default 0.15 / 0.20)
 * params keys (numbers only):
 *   stagger, proc, gain (+resource on first hit), gainExtra (+per extra target) gainMax, cp (rogue combo points),
 *   weight 0 light | 1 finisher | 2 heavy | 3 ultimate, hitstop (ms) / shake (trauma) overrides,
 *   lunge (m step-in), slow (0..1 movement slow while acting), root (1 = rooted until the move point),
 *   upper (1 = may play upper-body only while moving), impactRadius (extra AoE around the impact),
 *   maxTargets, atCaster (ground skills centred on the caster), fixed (channel cannot be released early),
 *   costPerSec, minResource, consumeAll, unstoppable, knockup (m), forceCrit, fit (fit the clip into `duration`).
 * Basic attacks: `<class>_basic` (behavior 'combo', params.steps = N) + steps `<class>_basic_1..N`.
 */
export const SKILLS: Record<string, SkillDef> = {};
export const getSkill = (id: string): SkillDef | undefined => SKILLS[id];

const I = (n: string) => `/assets/icons/${n}.svg`;

type Def = Partial<SkillDef> & Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;

function add(d: Def): SkillDef {
  const def: SkillDef = {
    unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, tags: [],
    ...d,
  } as SkillDef;
  SKILLS[def.id] = def;
  return def;
}

// PM-00c: knight and barbarian rows (class, spec and major rows) live in skillsets/knight.ts and skillsets/barbarian.ts.
registerKnight(add);
registerBarbarian(add);

// ======================================================================================================
// BÜYÜCÜ (mage) — Mana
// ======================================================================================================
add({
  id: 'mage_basic', classId: 'mage', name: 'Gizem Oku (Arcane Bolt)', icon: I('skill-arcane-missiles'), defaultSlot: 'lmb',
  desc: 'Asandan gizem okları fırlatırsın. Üçüncü atış üç ok birden gönderir. Her isabet Mana kazandırır.',
  anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'combo', 'projectile', 'arcane'],
  behavior: 'combo', params: { steps: 3, reset: 0.8 },
});
add({
  id: 'mage_basic_1', classId: 'mage', name: 'Gizem Oku (Arcane Bolt)', icon: I('skill-arcane-missiles'),
  desc: 'Tek bir gizem oku.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'projectile', range: 25, speed: 30, radius: 0.35, count: 1, pierce: 0,
  damage: { coef: 0.95, type: 'arcane' }, tags: ['spell', 'basic', 'projectile', 'arcane'],
  vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
  params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 1, hand: 0 },
});
add({
  id: 'mage_basic_2', classId: 'mage', name: 'Gizem Oku (Arcane Bolt)', icon: I('skill-arcane-missiles'),
  desc: 'İkinci gizem oku.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'projectile', range: 25, speed: 30, radius: 0.35, count: 1, pierce: 0,
  damage: { coef: 0.95, type: 'arcane' }, tags: ['spell', 'basic', 'projectile', 'arcane'],
  vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
  params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 2, hand: 1 },
});
add({
  id: 'mage_basic_3', classId: 'mage', name: 'Gizem Oku (Arcane Bolt)', icon: I('skill-arcane-missiles'),
  desc: 'Üç gizem oku birden.', anim: 'Spellcast_Shoot', animSpeed: 1.0, hitTime: 0.373, targeting: 'projectile', range: 25, speed: 32, radius: 0.35, count: 3, spread: 10, pierce: 0,
  damage: { coef: 0.65, type: 'arcane' }, tags: ['spell', 'basic', 'projectile', 'arcane', 'finisher'],
  vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
  params: { end: 0.78, chain: 0.06, move: 0.15, stagger: 2, gain: 2, gainExtra: 2, gainMax: 6, proc: 0.7, weight: 0, step: 3, finisher: 1, slow: 0.5, hand: 2 },
});
add({
  id: 'mage_fireball', classId: 'mage', name: 'Ateş Topu', icon: I('skill-fireball'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'Çarptığında patlayan bir ateş topu fırlatırsın: %230 ateş hasarı verir ve düşmanları yakar.',
  cost: 12, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.373, targeting: 'projectile', range: 30, speed: 24, radius: 0.5, count: 1, pierce: 0,
  damage: { coef: 2.3, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.5 }],
  tags: ['spell', 'fire', 'projectile', 'aoe'], vfx: { projectile: 'fire_projectile', impact: 'fire_burst', cast: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
  params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 8, proc: 1, hitstop: 52, shake: 0.22, explode: 2.5, slow: 0.5, element: 1 },
});
add({
  id: 'mage_frost_nova', classId: 'mage', name: 'Buz Halkası (Frost Nova)', icon: I('skill-frost-nova'), unlockLevel: 3,
  desc: 'Çevrendeki düşmanları dondurup %120 buz hasarı verirsin. Güçlü düşmanlar ağır şekilde yavaşlar.',
  cost: 18, cooldown: 9, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.6, hitTime: 0.95, targeting: 'self_aoe', radius: 5,
  damage: { coef: 1.2, type: 'frost' }, statuses: [{ status: 'freeze', duration: 2 }, { status: 'chill', duration: 3, stacks: 5 }],
  tags: ['spell', 'frost', 'aoe', 'cc'], vfx: { cast: 'frost_nova', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
  params: { end: 1.4, chain: 0.1, move: 0.2, stagger: 20, proc: 1, weight: 2, slow: 0.7, element: 2 },
});
add({
  id: 'mage_blink', classId: 'mage', name: 'Işınlanma (Blink)', icon: I('skill-blink'), unlockLevel: 6, defaultSlot: 's2',
  desc: 'Kısa bir mesafeye ışınlanırsın; ayrıldığın yerde düşmanlara hasar veren bir gizem patlaması bırakırsın.',
  cost: 10, cooldown: 5, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.05, targeting: 'teleport', range: 10, radius: 2.5,
  damage: { coef: 0.8, type: 'arcane' }, statuses: [{ status: 'slow', duration: 2, magnitude: 0.3 }], selfStatuses: [{ status: 'iframes', duration: 0.25 }],
  tags: ['offgcd', 'spell', 'arcane', 'movement'], vfx: { cast: 'blink', impact: 'arcane_burst' }, sfx: { cast: 'blink' },
  params: { end: 0.3, chain: 0.0, move: 0.0, stagger: 5, proc: 0.5, weight: 0, element: 3 },
});
add({
  id: 'mage_meteor', classId: 'mage', name: 'Meteor (Meteor)', icon: I('skill-meteor'), unlockLevel: 10, defaultSlot: 'm45',
  desc: 'Hedef noktaya bir meteor çağırırsın: %500 ateş hasarı verir ve yerde 3 saniye yanan bir alan bırakır.',
  cost: 35, cooldown: 8, castTime: 0.6, anim: 'Spellcast_Raise', animSpeed: 1.75, hitTime: 1.05, targeting: 'ground_aoe', range: 25, radius: 4, duration: 3, ticks: 6,
  damage: { coef: 5.0, type: 'fire' }, knockback: 2, statuses: [{ status: 'burn', duration: 3, magnitude: 0.3 }],
  tags: ['spell', 'fire', 'aoe', 'zone'], vfx: { cast: 'fire_burst', impact: 'meteor_fall', ground: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
  behavior: 'meteor',
  params: { end: 1.4, chain: 0.1, move: 0.0, stagger: 50, proc: 1, weight: 2, delay: 0.9, groundCoef: 0.4, groundRadius: 3, groundTick: 0.5, root: 1, element: 1 },
});
add({
  id: 'mage_blizzard', classId: 'mage', name: 'Kar Fırtınası (Blizzard)', icon: I('skill-blizzard'), unlockLevel: 1, defaultSlot: 's1',
  desc: 'Tuşu basılı tutarak hedef bölgeye sürekli buz yağdırırsın. Düşmanlar yavaşlar ve sonunda donar. Büyü yaparken yerinde durursun.',
  cost: 15, cooldown: 0, castTime: 0, channel: 5, anim: 'Spellcasting', animSpeed: 1.0, hitTime: 0.1, targeting: 'custom', behavior: 'blizzard', range: 25, radius: 5,
  damage: { coef: 0.55, type: 'frost', perTick: true }, statuses: [{ status: 'slow', duration: 0.8, magnitude: 0.4 }, { status: 'chill', duration: 3 }],
  tags: ['spell', 'frost', 'aoe', 'channel', 'zone'], vfx: { ground: 'blizzard', impact: 'frost_burst', cast: 'frost_burst' }, sfx: { cast: 'frost_cast' },
  params: { end: 0.3, chain: 0.1, stagger: 1, proc: 0.25, weight: 0, tick: 0.25, costPerSec: 10, followSpeed: 6, element: 2, root: 1 },
});
add({
  id: 'mage_arcane_orb', classId: 'mage', name: 'Gizemli Küre (Arcane Orb)', icon: I('skill-arcane-orb'), unlockLevel: 20, defaultSlot: 'r',
  desc: 'Yavaşça ilerleyen, yolundaki her şeyi delen ve sonunda patlayan bir gizem küresi gönderirsin.',
  cost: 25, cooldown: 4, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.0, hitTime: 0.373, targeting: 'projectile', range: 20, speed: 7, radius: 0.7, count: 1, pierce: 99,
  damage: { coef: 0.5, type: 'arcane' }, tags: ['spell', 'arcane', 'projectile', 'aoe'], vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast', impact: 'explosion' },
  behavior: 'orb',
  params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 2, proc: 0.3, weight: 0, pulse: 0.25, pulseRadius: 2.5, endCoef: 3.0, endRadius: 4, endStagger: 20, slow: 0.5, element: 3 },
});
add({
  id: 'mage_mana_barrier', classId: 'mage', name: 'Mana Kalkanı (Mana Shield)', icon: I('skill-mana-shield'), unlockLevel: 25,
  desc: '8 saniye boyunca hasarı emen bir büyü kalkanıyla korunursun; kalkan dayanırken daha hızlı büyü yaparsın. Kalkan kırılınca çevreye buz patlaması yayılır.',
  cost: 30, cooldown: 25, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.6, targeting: 'self_buff',
  damage: { coef: 1.0, type: 'frost' }, selfStatuses: [{ status: 'shield', duration: 8 }],
  tags: ['spell', 'frost', 'buff', 'defensive'], vfx: { cast: 'shield_bubble', impact: 'frost_nova' }, sfx: { cast: 'buff', impact: 'frost_impact' },
  behavior: 'barrier',
  params: { end: 0.8, chain: 0.1, move: 0.1, stagger: 10, proc: 1, weight: 1, hpPct: 0.25, intMult: 3, breakRadius: 4, castSpeedBonus: 0.2, slow: 0.4 },
});
add({
  id: 'mage_arcane_cataclysm', classId: 'mage', name: 'Kadim Kıyamet (Arcane Cataclysm)', icon: I('skill-arcane-explosion'), unlockLevel: 30,
  desc: 'Gökten yıldızlar yağdırarak çevrendeki düşmanları dövüp son olarak büyük bir gizem dalgasıyla savurursun.',
  cost: 50, cooldown: 70, castTime: 0, channel: 3, anim: 'Spellcast_Long', animSpeed: 0.85, hitTime: 0.4, targeting: 'custom', behavior: 'cataclysm', range: 14, radius: 2, ticks: 15,
  damage: { coef: 1.3, type: 'arcane', perTick: true }, knockback: 5,
  tags: ['ultimate', 'spell', 'arcane', 'aoe', 'channel'], vfx: { cast: 'arcane_burst', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast', impact: 'explosion' },
  params: { end: 0.5, chain: 0.2, stagger: 8, proc: 0.3, weight: 0, fixed: 1, strikes: 15, strikeRadius: 2, novaCoef: 4.0, novaRadius: 8, novaStagger: 60, moveSlow: 0.5, element: 3 },
});

// ======================================================================================================
// HAYDUT (rogue) — Enerji + Kombo Puanı
// ======================================================================================================
add({
  id: 'rogue_basic', classId: 'rogue', name: 'Oto Saldırı (Auto Attack)', icon: I('skill-quick-slash'), defaultSlot: 'lmb',
  desc: 'Çift hançerinle dört vuruşluk oto saldırı zinciri. Son vuruş kanatan bir saplamadır. Her vuruş enerji verir; ikinci ve dördüncü vuruş Kombo Puanı kazandırır.',
  anim: 'Dualwield_Melee_Attack_Slice', targeting: 'melee_arc', range: 2.4, arc: 120, tags: ['melee', 'basic', 'combo'],
  behavior: 'combo', params: { steps: 4, reset: 0.8 },
});

// ======================================================================================================
// GDD_CLASSES_V2 (NC04): the per-class skillset stubs are called once, after the four KayKit classes' rows above.
// The stubs are empty; NC10–NC20 and NC31–NC32 fill their own files only.
// ======================================================================================================
registerMonk(add);
registerPriest(add);
registerShaman(add);
registerDruid(add);
// ======================================================================================================
// GDD_V2 WP5: spec skills (§1.3, non-mage) and the 15 non-mage majors (§2.2). Mage rows belong to T8 (GDD_TALENTS).
// ======================================================================================================
registerArcher(add);
registerPaladin(add);
registerNecromancer(add);
registerWarlock(add);
registerMonkSpecs(add);
registerPriestSpecs(add);
registerShamanSpecs(add);
registerDruidSpecs(add);
registerArcherSpecs(add);
registerPaladinSpecs(add);
registerPaladinHoly(add);
registerNecromancerSpecs(add);
registerWarlockSpecs(add);
registerDemonHunter(add);
registerDemonHunterSpecs(add);
registerEvoker(add);
registerEvokerSpecs(add);
registerLayerMonkArcher(add);
registerLayerPaladinCasters(add);
// GDD_TALENTS (T0): talent skill rows (mage specs §1.3.3, class utilities §1.4). Empty stubs until T8 / T9.
Object.assign(SKILLS, MAGE_SPEC_SKILLS, CLASS_UTIL_SKILLS);
// KIT PK-0: the kit packages' rows (the warlock file holds only the overrides of the coded class-utility rows).
Object.assign(SKILLS, SKILLS_KIT_MAGE, SKILLS_KIT_ROGUE, SKILLS_KIT_WARLOCK);
// OPENING KIT: 4 bar abilities at L1, then one new bar ability at each of L2-L5 (data/openingKit.ts). Writes the row's level and slot
// readers (CharacterState, Progression, ActionBar) use classGrantOrder() from openingKit.ts for the class list.
for (const rows of Object.values(OPENING_KIT)) {
  for (const [id, slot, level] of rows ?? []) {
    const row = SKILLS[id];
    if (!row) throw new Error(`openingKit: unknown skill ${id}`);
    row.unlockLevel = level;
    row.defaultSlot = slot;
  }
}

/** Skill ids of a class in unlock order (8) — convenience for panels. */
export function classSkillIds(classId: SkillDef['classId']): string[] {
  return Object.values(SKILLS).filter((s) => s.classId === classId && !s.id.includes('_basic') && s.unlockLevel >= 1).map((s) => s.id);
}

/** Combo step ids of a basic attack (`knight_basic` -> knight_basic_1..N). */
export function comboSteps(basicId: string): SkillDef[] {
  const n = SKILLS[basicId]?.params?.steps ?? 0;
  const out: SkillDef[] = [];
  for (let i = 1; i <= n; i++) {
    const s = SKILLS[`${basicId}_${i}`];
    if (s) out.push(s);
  }
  return out;
}
