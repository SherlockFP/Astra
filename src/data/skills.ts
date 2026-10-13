import type { SkillDef } from '../types/skills';
// GDD_CLASSES_V2 (NC04): per-class skillset files, wired once here. Each package fills only its own file.
import { registerMonk } from './skillsets/monk';
import { registerArcher } from './skillsets/archer';
import { registerPaladin } from './skillsets/paladin';
import { registerNecromancer } from './skillsets/necromancer';
import { registerWarlock } from './skillsets/warlock';
import { registerMonkSpecs } from './skillsets/monkSpecs';
import { registerArcherSpecs } from './skillsets/archerSpecs';
import { registerPaladinSpecs } from './skillsets/paladinSpecs';
import { registerPaladinHoly } from './skillsets/paladinHoly';
import { registerNecromancerSpecs } from './skillsets/necromancerSpecs';
import { registerWarlockSpecs } from './skillsets/warlockSpecs';
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
  id: 'mage_basic', classId: 'mage', name: 'Gizem Oku', icon: I('skill-arcane-missiles'), defaultSlot: 'lmb',
  desc: 'Asandan gizem okları fırlatırsın. Üçüncü atış üç ok birden gönderir. Her isabet Mana kazandırır.',
  anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'combo', 'projectile', 'arcane'],
  behavior: 'combo', params: { steps: 3, reset: 0.8 },
});
add({
  id: 'mage_basic_1', classId: 'mage', name: 'Gizem Oku', icon: I('skill-arcane-missiles'),
  desc: 'Tek bir gizem oku.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'projectile', range: 25, speed: 30, radius: 0.35, count: 1, pierce: 0,
  damage: { coef: 0.95, type: 'arcane' }, tags: ['spell', 'basic', 'projectile', 'arcane'],
  vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
  params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 1, hand: 0 },
});
add({
  id: 'mage_basic_2', classId: 'mage', name: 'Gizem Oku', icon: I('skill-arcane-missiles'),
  desc: 'İkinci gizem oku.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'projectile', range: 25, speed: 30, radius: 0.35, count: 1, pierce: 0,
  damage: { coef: 0.95, type: 'arcane' }, tags: ['spell', 'basic', 'projectile', 'arcane'],
  vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
  params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 2, hand: 1 },
});
add({
  id: 'mage_basic_3', classId: 'mage', name: 'Gizem Oku', icon: I('skill-arcane-missiles'),
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
  id: 'mage_frost_nova', classId: 'mage', name: 'Buz Halkası', icon: I('skill-frost-nova'), unlockLevel: 3, defaultSlot: 'q',
  desc: 'Çevrendeki düşmanları dondurup %120 buz hasarı verirsin. Güçlü düşmanlar ağır şekilde yavaşlar.',
  cost: 18, cooldown: 9, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.6, hitTime: 0.95, targeting: 'self_aoe', radius: 5,
  damage: { coef: 1.2, type: 'frost' }, statuses: [{ status: 'freeze', duration: 2 }, { status: 'chill', duration: 3, stacks: 5 }],
  tags: ['spell', 'frost', 'aoe', 'cc'], vfx: { cast: 'frost_nova', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
  params: { end: 1.4, chain: 0.1, move: 0.2, stagger: 20, proc: 1, weight: 2, slow: 0.7, element: 2 },
});
add({
  id: 'mage_blink', classId: 'mage', name: 'Işınlanma', icon: I('skill-blink'), unlockLevel: 6, defaultSlot: 'e',
  desc: 'Kısa bir mesafeye ışınlanırsın; ayrıldığın yerde düşmanlara hasar veren bir gizem patlaması bırakırsın.',
  cost: 10, cooldown: 5, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.05, targeting: 'teleport', range: 10, radius: 2.5,
  damage: { coef: 0.8, type: 'arcane' }, statuses: [{ status: 'slow', duration: 2, magnitude: 0.3 }], selfStatuses: [{ status: 'iframes', duration: 0.25 }],
  tags: ['offgcd', 'spell', 'arcane', 'movement'], vfx: { cast: 'blink', impact: 'arcane_burst' }, sfx: { cast: 'blink' },
  params: { end: 0.3, chain: 0.0, move: 0.0, stagger: 5, proc: 0.5, weight: 0, element: 3 },
});
add({
  id: 'mage_meteor', classId: 'mage', name: 'Meteor', icon: I('skill-meteor'), unlockLevel: 10, defaultSlot: 's1',
  desc: 'Hedef noktaya bir meteor çağırırsın: %500 ateş hasarı verir ve yerde 3 saniye yanan bir alan bırakır.',
  cost: 35, cooldown: 8, castTime: 0.6, anim: 'Spellcast_Raise', animSpeed: 1.75, hitTime: 1.05, targeting: 'ground_aoe', range: 25, radius: 4, duration: 3, ticks: 6,
  damage: { coef: 5.0, type: 'fire' }, knockback: 2, statuses: [{ status: 'burn', duration: 3, magnitude: 0.3 }],
  tags: ['spell', 'fire', 'aoe', 'zone'], vfx: { cast: 'fire_burst', impact: 'meteor_fall', ground: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
  behavior: 'meteor',
  params: { end: 1.4, chain: 0.1, move: 0.0, stagger: 50, proc: 1, weight: 2, delay: 0.9, groundCoef: 0.4, groundRadius: 3, groundTick: 0.5, root: 1, element: 1 },
});
add({
  id: 'mage_blizzard', classId: 'mage', name: 'Kar Fırtınası', icon: I('skill-blizzard'), unlockLevel: 15, defaultSlot: 's2',
  desc: 'Tuşu basılı tutarak hedef bölgeye sürekli buz yağdırırsın. Düşmanlar yavaşlar ve sonunda donar. Büyü yaparken yerinde durursun.',
  cost: 15, cooldown: 0, castTime: 0, channel: 5, anim: 'Spellcasting', animSpeed: 1.0, hitTime: 0.1, targeting: 'custom', behavior: 'blizzard', range: 25, radius: 5,
  damage: { coef: 0.55, type: 'frost', perTick: true }, statuses: [{ status: 'slow', duration: 0.8, magnitude: 0.4 }, { status: 'chill', duration: 3 }],
  tags: ['spell', 'frost', 'aoe', 'channel', 'zone'], vfx: { ground: 'blizzard', impact: 'frost_burst', cast: 'frost_burst' }, sfx: { cast: 'frost_cast' },
  params: { end: 0.3, chain: 0.1, stagger: 1, proc: 0.25, weight: 0, tick: 0.25, costPerSec: 10, followSpeed: 6, element: 2, root: 1 },
});
add({
  id: 'mage_arcane_orb', classId: 'mage', name: 'Gizemli Küre', icon: I('skill-arcane-orb'), unlockLevel: 20, defaultSlot: 's3',
  desc: 'Yavaşça ilerleyen, yolundaki her şeyi delen ve sonunda patlayan bir gizem küresi gönderirsin.',
  cost: 25, cooldown: 4, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.0, hitTime: 0.373, targeting: 'projectile', range: 20, speed: 7, radius: 0.7, count: 1, pierce: 99,
  damage: { coef: 0.5, type: 'arcane' }, tags: ['spell', 'arcane', 'projectile', 'aoe'], vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast', impact: 'explosion' },
  behavior: 'orb',
  params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 2, proc: 0.3, weight: 0, pulse: 0.25, pulseRadius: 2.5, endCoef: 3.0, endRadius: 4, endStagger: 20, slow: 0.5, element: 3 },
});
add({
  id: 'mage_mana_barrier', classId: 'mage', name: 'Büyü Kalkanı', icon: I('skill-mana-shield'), unlockLevel: 25,
  desc: '8 saniye boyunca hasarı emen bir büyü kalkanıyla korunursun; kalkan dayanırken daha hızlı büyü yaparsın. Kalkan kırılınca çevreye buz patlaması yayılır.',
  cost: 30, cooldown: 25, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.6, targeting: 'self_buff',
  damage: { coef: 1.0, type: 'frost' }, selfStatuses: [{ status: 'shield', duration: 8 }],
  tags: ['spell', 'frost', 'buff', 'defensive'], vfx: { cast: 'shield_bubble', impact: 'frost_nova' }, sfx: { cast: 'buff', impact: 'frost_impact' },
  behavior: 'barrier',
  params: { end: 0.8, chain: 0.1, move: 0.1, stagger: 10, proc: 1, weight: 1, hpPct: 0.25, intMult: 3, breakRadius: 4, castSpeedBonus: 0.2, slow: 0.4 },
});
add({
  id: 'mage_arcane_cataclysm', classId: 'mage', name: 'Kadim Kıyamet', icon: I('skill-arcane-explosion'), unlockLevel: 30, defaultSlot: 'r',
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
  id: 'rogue_basic', classId: 'rogue', name: 'Hançer Kombosu', icon: I('skill-quick-slash'), defaultSlot: 'lmb',
  desc: 'Çift hançerinle dört vuruşluk hızlı bir kombo yaparsın. Son vuruş kanatan bir saplamadır. Her vuruş Kombo Puanı kazandırır.',
  anim: 'Dualwield_Melee_Attack_Slice', targeting: 'melee_arc', range: 2.4, arc: 120, tags: ['melee', 'basic', 'combo'],
  behavior: 'combo', params: { steps: 4, reset: 0.8 },
});
add({
  id: 'rogue_basic_1', classId: 'rogue', name: 'Hançer Kombosu', icon: I('skill-quick-slash'),
  desc: 'Hızlı hançer kesiği.', anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.408, targeting: 'melee_arc',
  range: 2.4, arc: 120, damage: { coef: 0.85, type: 'physical' }, tags: ['melee', 'basic'],
  vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.76, chain: 0.03, move: 0.1, stagger: 2, proc: 0.7, cp: 1, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 1 },
});
add({
  id: 'rogue_basic_2', classId: 'rogue', name: 'Hançer Kombosu', icon: I('skill-quick-slash'),
  desc: 'Çaprazlama ikinci kesik.', anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.6, hitTime: 0.507, targeting: 'melee_arc',
  range: 2.4, arc: 100, damage: { coef: 0.85, type: 'physical' }, tags: ['melee', 'basic'],
  vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.82, chain: 0.03, move: 0.1, stagger: 2, proc: 0.7, cp: 1, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 2 },
});
add({
  id: 'rogue_basic_3', classId: 'rogue', name: 'Hançer Kombosu', icon: I('skill-quick-slash'),
  desc: 'Seri saplama.', anim: '1H_Melee_Attack_Stab', animSpeed: 2.0, hitTime: 0.56, targeting: 'melee_arc',
  range: 2.9, arc: 45, damage: { coef: 0.95, type: 'physical' }, tags: ['melee', 'basic'],
  vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.88, chain: 0.03, move: 0.1, stagger: 3, proc: 0.7, cp: 1, weight: 0, upper: 1, lunge: 1.0, slow: 0.35, step: 3 },
});
add({
  id: 'rogue_basic_4', classId: 'rogue', name: 'Hançer Kombosu', icon: I('skill-quick-slash'),
  desc: 'Kanatan bitirici saplama.', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.35, hitTime: 0.512, targeting: 'melee_arc',
  range: 2.9, arc: 50, damage: { coef: 1.7, type: 'physical' }, knockback: 0.6, statuses: [{ status: 'bleed', duration: 3, magnitude: 0.25 }],
  tags: ['melee', 'basic', 'finisher', 'bleed'],
  vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.05, move: 0.15, stagger: 6, proc: 1, cp: 1, weight: 1, root: 1, lunge: 1.0, step: 4, finisher: 1 },
});
add({
  id: 'rogue_crossbow_shot', classId: 'rogue', name: 'Arbalet Atışı', icon: I('skill-piercing-shot'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'Arbaletinle delici bir ok atarak %180 hasar verirsin. 1 Kombo Puanı kazandırır.',
  cost: 15, cooldown: 0, castTime: 0, anim: '1H_Ranged_Shoot', animSpeed: 1.1, hitTime: 0.32, targeting: 'projectile', range: 30, speed: 45, radius: 0.3, count: 1, pierce: 1,
  damage: { coef: 1.8, type: 'physical' }, tags: ['projectile', 'ranged', 'physical'],
  vfx: { projectile: 'bolt_projectile', impact: 'hit_spark', cast: 'hit_spark' }, sfx: { cast: 'crossbow_shot' },
  params: { end: 0.64, chain: 0.08, move: 0.15, stagger: 5, proc: 1, cp: 1, weight: 0, upper: 1, slow: 0.5, crossbow: 1 },
});
add({
  id: 'rogue_shadow_step', classId: 'rogue', name: 'Gölge Adımı', icon: I('skill-shadow-step'), unlockLevel: 3, defaultSlot: 'q',
  desc: 'Hedefin arkasına ışınlanırsın; 3 saniye içindeki ilk yakın dövüş vuruşun kesin kritik olur. 1 Kombo Puanı kazandırır.',
  cost: 20, cooldown: 9, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.08, targeting: 'teleport', range: 15,
  selfStatuses: [{ status: 'iframes', duration: 0.2 }, { status: 'ambush', duration: 3 }],
  tags: ['offgcd', 'movement', 'shadow', 'teleport'], vfx: { cast: 'shadow_burst', impact: 'stealth_smoke' }, sfx: { cast: 'whoosh' },
  behavior: 'shadow_step',
  params: { end: 0.3, chain: 0.0, move: 0.0, weight: 0, cp: 1, fallback: 8 },
});
add({
  id: 'rogue_fan_of_knives', classId: 'rogue', name: 'Bıçak Yelpazesi', icon: I('skill-fan-of-knives'), unlockLevel: 6, defaultSlot: 'e',
  desc: 'Çevrene bıçak yağdırarak %150 hasar verir, düşmanları zehirler ve yavaşlatırsın. Vurduğun her düşman için Kombo Puanı kazanırsın.',
  cost: 30, cooldown: 4, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.615, targeting: 'self_aoe', radius: 5,
  damage: { coef: 1.5, type: 'physical' }, statuses: [{ status: 'poison', duration: 4, magnitude: 0.15 }, { status: 'slow', duration: 2, magnitude: 0.3 }],
  tags: ['aoe', 'poison', 'projectile'], vfx: { cast: 'poison_burst', impact: 'poison_burst', projectile: 'dagger_projectile' }, sfx: { cast: 'dagger_throw' },
  behavior: 'fan',
  params: { end: 0.96, chain: 0.08, move: 0.15, stagger: 6, proc: 0.7, cpPerTarget: 1, cpMax: 3, weight: 1, slow: 0.5, knives: 12 },
});
add({
  id: 'rogue_eviscerate', classId: 'rogue', name: 'İnfaz', icon: I('skill-eviscerate'), unlockLevel: 10, defaultSlot: 's1',
  desc: 'Tüm Kombo Puanlarını harcayan ölümcül bir bitirici. Her puan hasarı artırır; 5 puanla hedef kanar ve sersemler.',
  cost: 30, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.512, targeting: 'melee_arc', range: 2.8, arc: 60,
  damage: { coef: 1.4, type: 'physical' }, tags: ['melee', 'finisher', 'bleed'],
  vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  behavior: 'eviscerate',
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 8, staggerPerCp: 6, coefPerCp: 1.2, proc: 1, weight: 2, maxTargets: 3, minCp: 1, root: 1, lunge: 0.8 },
});
add({
  id: 'rogue_bolt_rain', classId: 'rogue', name: 'Ok Yağmuru', icon: I('skill-rain-of-arrows'), unlockLevel: 20, defaultSlot: 's3',
  desc: 'Hedef bölgeye ok yağdırarak 2 saniye boyunca toplam %480 hasar verirsin ve düşmanları yavaşlatırsın.',
  cost: 40, cooldown: 10, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.1, hitTime: 0.32, targeting: 'ground_aoe', range: 22, radius: 5, duration: 2, ticks: 8,
  damage: { coef: 0.6, type: 'physical', perTick: true }, statuses: [{ status: 'slow', duration: 0.6, magnitude: 0.25 }],
  tags: ['projectile', 'aoe', 'ranged', 'zone'], vfx: { ground: 'ground_slam', impact: 'hit_spark', projectile: 'arrow_projectile' }, sfx: { cast: 'crossbow_shot' },
  behavior: 'bolt_rain',
  params: { end: 0.64, chain: 0.1, move: 0.2, stagger: 3, proc: 0.3, weight: 0, tick: 0.25, slow: 0.6, crossbow2: 1 },
});
add({
  id: 'rogue_deadly_venom', classId: 'rogue', name: 'Ölümcül Zehir', icon: I('skill-poison-dagger'), unlockLevel: 25,
  desc: '12 saniye boyunca bıçaklarını ölümcül zehirle kaplarsın: her vuruşta ekstra zehir bindirirsin; İnfaz zehri patlatır.',
  cost: 0, cooldown: 30, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.3, targeting: 'self_buff',
  selfStatuses: [{ status: 'venom', duration: 12 }],
  tags: ['buff', 'poison'], vfx: { cast: 'poison_burst' }, sfx: { cast: 'buff' },
  params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, slow: 0.5 },
});
add({
  id: 'rogue_death_blossom', classId: 'rogue', name: 'Ölüm Dansı', icon: I('skill-assassinate'), unlockLevel: 30, defaultSlot: 'r',
  desc: 'Gölgelere karışıp yakındaki düşmanların arasında dans ederek her birine üç kez saplarsın. Dans bittiğinde 5 Kombo Puanı kazanırsın.',
  cost: 50, cooldown: 60, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 2.5, hitTime: 0.1, targeting: 'custom', behavior: 'death_blossom', range: 12, radius: 2.4,
  damage: { coef: 1.0, type: 'physical' }, tags: ['ultimate', 'melee', 'movement', 'aoe'],
  vfx: { cast: 'shadow_burst', impact: 'hit_blood', trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.3, chain: 0.1, move: 0.0, stagger: 4, proc: 0.4, weight: 0, maxTargets: 8, perTarget: 0.3, strikes: 3, unstoppable: 1, cpEnd: 5, invuln: 2.4 },
});

// ======================================================================================================
// GDD_CLASSES_V2 (NC04): the per-class skillset stubs are called once, after the four KayKit classes' rows above.
// The stubs are empty; NC10–NC20 and NC31–NC32 fill their own files only.
// ======================================================================================================
registerMonk(add);
// ======================================================================================================
// GDD_V2 WP5: spec skills (§1.3, non-mage) and the 15 non-mage majors (§2.2). Mage rows belong to T8 (GDD_TALENTS).
// ======================================================================================================
// ---- Suikastçı (rogue_assassin) ----
add({
  id: 'rogue_backstab', classId: 'rogue', spec: 'rogue_assassin', name: 'Sırttan Bıçak', icon: I('skill-quick-slash'), unlockLevel: 10,
  desc: 'Önündeki düşmana bıçağını saplarsın. Arkasından vurursan hasar iki katına çıkar ve daha çok Kombo kazanırsın.',
  cost: 25, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', behavior: 'backstab',
  range: 2.6, arc: 45, damage: { coef: 2.2, type: 'physical' }, tags: ['melee', 'backstab', 'spec'], params: { stagger: 8, behindMore: 2, behindCombo: 3, combo: 2, behindStagger: 1.5 },
});
add({
  id: 'rogue_garrote', classId: 'rogue', spec: 'rogue_assassin', name: 'Gırtlak Kesme', icon: I('skill-poison-dagger'), unlockLevel: 15,
  desc: 'Düşmanın boğazını keser: kanama uygular ve 3 saniye susturur (kesme / sessizlik).',
  cost: 30, cooldown: 14, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.0, hitTime: 0.4, targeting: 'melee_arc',
  range: 2.6, arc: 60, damage: { coef: 1.2, type: 'physical' }, statuses: [{ status: 'bleed', duration: 8, magnitude: 2 }, { status: 'silence', duration: 3 }],
  tags: ['offgcd', 'melee', 'bleed', 'interrupt', 'spec'], params: { stagger: 6 },
});
// ---- Simyacı (rogue_alchemist, the healer; basic attack replaces rogue_basic) ----
add({
  id: 'rogue_vial_throw', classId: 'rogue', spec: 'rogue_alchemist', name: 'Şişe Fırlat', icon: I('skill-throw-knife'), unlockLevel: 1,
  desc: 'Bir zehir şişesi fırlatırsın. Düşmana zehir uygular; müttefike fırlatırsan şifa verir.',
  cost: 0, cooldown: 0.4, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.3, targeting: 'projectile', range: 22, speed: 22, radius: 0.4, count: 1,
  behavior: 'vial_throw', damage: { coef: 0.8, type: 'poison' }, statuses: [{ status: 'poison', duration: 6, stacks: 1 }],
  heal: { coef: 1.0 }, tags: ['projectile', 'basic', 'spell', 'spec'], params: { pipsHit: 1 },
});
add({
  id: 'rogue_vial_heal', classId: 'rogue', spec: 'rogue_alchemist', name: 'Şifa Şişesi', icon: I('skill-holy-light'), unlockLevel: 10,
  desc: 'Yere bir şifa şişesi atarsın: çevrendeki müttefikleri iyileştirir ve birkaç saniye şifalı bir gölet bırakır. Her iyileşen müttefik Karışım Puanı kazandırır.',
  cost: 25, cooldown: 0.8, castTime: 0, anim: 'Throw', animSpeed: 1.0, hitTime: 0.45, targeting: 'ground_aoe', range: 22, radius: 3.5,
  behavior: 'vial_heal', heal: { coef: 1.8 }, tags: ['heal', 'aoe', 'spec'], params: { puddleCoef: 0.25, puddleTicks: 6, pipsCap: 2 },
});
add({
  id: 'rogue_antidote', classId: 'rogue', spec: 'rogue_alchemist', name: 'Panzehir', icon: I('skill-consecration'), unlockLevel: 15,
  desc: 'Bir müttefikten en fazla 3 olumsuz etkiyi temizler ve onu iyileştirir; kısa süre yenilenme verir.',
  cost: 15, cooldown: 8, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.3, targeting: 'custom', behavior: 'antidote',
  range: 25, heal: { coef: 0.8 }, tags: ['heal', 'dispel', 'spec'], params: { dispels: 3, regenDur: 4, regenPct: 0.02 },
});
add({
  id: 'rogue_smoke_ward', classId: 'rogue', spec: 'rogue_alchemist', name: 'Duman Siperi', icon: I('skill-smoke-bomb'), unlockLevel: 15,
  desc: '6 saniye boyunca yerde duran bir duman bulutu yaratır: içindeki müttefikler daha az hasar alır, düşmanlar kör olur.',
  cost: 30, cooldown: 20, castTime: 0, anim: 'Throw', animSpeed: 1.0, hitTime: 0.4, targeting: 'ground_aoe', range: 20, radius: 5, duration: 6,
  behavior: 'smoke_ward', tags: ['aoe', 'defensive', 'spec'], params: { drPct: 0.20, blindDur: 1.2 },
});
add({
  id: 'rogue_mending_draught', classId: 'rogue', spec: 'rogue_alchemist', name: 'Mucize Damla', icon: I('skill-mana-shield'), unlockLevel: 20,
  desc: 'Biriken Karışım Puanlarını harcayarak bir müttefiki güçlü şekilde iyileştirirsin. En az bir puan gerekir.',
  cost: 30, cooldown: 0, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'mending',
  range: 25, heal: { coef: 1.6 }, tags: ['heal', 'emergency', 'spec'], params: { perPip: 1.1 },
});
// ---- Majors (§2.2, non-mage rows 1–10 and 16–20) ----
add({
  id: 'rogue_shadow_blades', classId: 'rogue', spec: 'rogue_assassin', name: 'Gölge Bıçakları', icon: I('skill-blade-storm'), unlockLevel: 10, defaultSlot: 'm45',
  desc: '10 saniye boyunca her vuruşun hasarının %25\'i kadar ek gölge hasarı eklenir ve yetenek maliyetlerin %30 azalır.',
  cost: 0, cooldown: 45, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff', selfStatuses: [{ status: 'shadow_blades', duration: 10 }],
  tags: ['major', 'offensive', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 45 },
});
add({
  id: 'rogue_shadow_dance', classId: 'rogue', spec: 'rogue_assassin', name: 'Ölümcül Gölge Dansı', icon: I('skill-shadow-step'), unlockLevel: 20, defaultSlot: 'm90',
  desc: '8 saniye boyunca saldırınca bile gizliliğini kaybetmezsin. Gölge Adımı yenilenir.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.3, targeting: 'custom', behavior: 'major_shadow_dance',
  selfStatuses: [{ status: 'shadow_veil_cd', duration: 8 }], tags: ['major', 'offensive', 'stealth'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'whoosh' },
  params: { major: 90, resetStep: 1 },
});
add({
  id: 'rogue_elixir_of_life', classId: 'rogue', spec: 'rogue_alchemist', name: 'Hayat İksiri Yağmuru', icon: I('skill-consecration'), unlockLevel: 10, defaultSlot: 'm45',
  desc: '15 metre içindeki tüm müttefikleri iyileştirir, 6 saniye boyunca yenilenme verir ve bir olumsuz etkiyi temizler.',
  cost: 0, cooldown: 45, castTime: 0, anim: 'Throw', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'major_elixir',
  heal: { coef: 1.8 }, tags: ['major', 'heal', 'aoe'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'potion_use' },
  params: { major: 45, range: 15, heal: 1.8, regenDur: 6, regenCoef: 0.3, cleanse: 1 },
});
add({
  id: 'rogue_miracle_brew', classId: 'rogue', spec: 'rogue_alchemist', name: 'Mucize Karışım', icon: I('skill-smoke-bomb'), unlockLevel: 20, defaultSlot: 'm90',
  desc: 'Yere bir kazan kurarsın: 10 saniye boyunca içindeki müttefikler %25 daha az hasar alır, saniyede canlarının %6\'sını yenilerler ve zehir/kanamadan arınırlar.',
  cost: 0, cooldown: 90, castTime: 1.0, anim: 'Throw', animSpeed: 1.2, hitTime: 1.0, targeting: 'ground_aoe', range: 22, radius: 6, duration: 10,
  behavior: 'major_brew', tags: ['major', 'defensive', 'heal', 'aoe'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
  params: { major: 90, healPct: 0.06, drPct: 0.25, cleanseEvery: 2 },
});
add({
  id: 'rogue_haste_elixir', classId: 'rogue', spec: 'rogue_alchemist', name: 'Hızlandırıcı İksir', icon: I('skill-battle-shout'), unlockLevel: 30, defaultSlot: 'm180',
  desc: 'Grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı veren bir iksir fırlatırsın. Etkilenenler 2.5 dakika Yorgun kalır.',
  cost: 0, cooldown: 180, castTime: 0, anim: 'Throw', animSpeed: 1.2, hitTime: 0.3, targeting: 'custom', behavior: 'major_hero',
  tags: ['major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'potion_use' }, params: { major: 180, range: 40, dur: 40, sated: 150 },
});

registerArcher(add);
registerPaladin(add);
registerNecromancer(add);
registerWarlock(add);
registerMonkSpecs(add);
registerArcherSpecs(add);
registerPaladinSpecs(add);
registerPaladinHoly(add);
registerNecromancerSpecs(add);
registerWarlockSpecs(add);
registerLayerMonkArcher(add);
registerLayerPaladinCasters(add);
// GDD_TALENTS (T0): talent skill rows (mage specs §1.3.3, class utilities §1.4). Empty stubs until T8 / T9.
Object.assign(SKILLS, MAGE_SPEC_SKILLS, CLASS_UTIL_SKILLS);
// KIT PK-0: the kit packages' rows (the warlock file holds only the overrides of the coded class-utility rows).
Object.assign(SKILLS, SKILLS_KIT_MAGE, SKILLS_KIT_ROGUE, SKILLS_KIT_WARLOCK);

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
