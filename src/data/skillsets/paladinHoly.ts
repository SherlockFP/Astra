/**
 * Paladin · Kutsal (paladin_holy) rows: the Işık Oku heal-bolt chain `paladin_holy_basic` (SpecDef.basic) and the healer spec rows.
 * PM-PA (docs/kits/plate-melee.md §6a; behaviour map: docs/kits/paladin_behaviors.md). Işığın Sözü and İlahi Binek are shared
 * rows in paladin.ts; Kutsal's Işığın Sözü numbers (heal 1.4 + 12 s HoT) come from SpecDef.mods.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPaladinHoly(add: SkillAdd): void {
  // Işık Mekanı (Beacon of Light): one ally holds the beacon; 15 % of each heal you give another ally is copied to it (healing.ts
  // beaconCopy). One beacon at a time (params.exclusive). Duration is open-ended (3600 s) until a new beacon replaces it.
  add({
    id: 'paladin_beacon_of_light', classId: 'paladin', spec: 'paladin_holy', name: 'Işık Mekanı (Beacon of Light)', icon: I('skill-holy-light'), unlockLevel: 10,
    desc: 'Bir müttefike Işık Mekanı koyarsın. Ona verdiğin iyileştirmelerin %15\'i, Işık Mekanı taşıyan müttefike de kopyalanır. Aynı anda yalnızca bir Işık Mekanı olabilir.',
    cost: 10, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'custom', behavior: 'ally_buff', allyTarget: 'friendly', range: 25,
    tags: ['spell', 'holy', 'buff', 'ally'], vfx: { cast: 'buff_aura', impact: 'shield_bubble' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    statuses: [{ status: 'beacon_of_light', duration: 3600, magnitude: 0.15 }],
    params: { exclusive: 1, end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });
  // ======================================================================================================
  // Işık Oku (Kutsal chain): heals the first ally a bolt touches, damages the first enemy. Σ damage 4.8 (Yargı folded into step 3),
  // Σ heal 1.55, faith +2/+2/+4, +1 Kutsal Güç on steps 2 and 3. Step 3 bolts apply `judged`.
  // ======================================================================================================
  add({
    id: 'paladin_holy_basic', classId: 'paladin', spec: 'paladin_holy', name: 'Işık Oku (Holy Bolt)', icon: I('skill-holy-light'),
    desc: 'Işık okları fırlatırsın: ilk çarptığı müttefiki iyileştirir, düşmana kutsal hasar verir. Üçüncü atış üç ok gönderir, düşmanı yargılar (%10 daha az hasar) ve 1 Kutsal Güç kazandırır. Her atış İnanç geri kazandırır.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 26, allyTarget: 'any', tags: ['spell', 'holy', 'basic', 'combo', 'projectile'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  add({
    id: 'paladin_holy_basic_1', classId: 'paladin', spec: 'paladin_holy', name: 'Işık Oku (Holy Bolt)', icon: I('skill-holy-light'),
    desc: 'Işık oku: müttefiki iyileştirir, düşmana hasar verir.', anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.373, targeting: 'projectile', behavior: 'heal_bolt',
    range: 26, speed: 45, radius: 0.4, count: 1, damage: { coef: 1.1, type: 'holy' }, heal: { coef: 0.40 }, knockback: 0.5, allyTarget: 'any',
    tags: ['spell', 'holy', 'basic', 'projectile'], vfx: { projectile: 'holy_projectile', impact: 'holy_burst' }, sfx: { cast: 'holy_cast', impact: 'holy_impact' },
    params: { end: 0.65, chain: 0.04, move: 0.08, stagger: 3, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.35, step: 1, hand: 0 },
  });
  add({
    id: 'paladin_holy_basic_2', classId: 'paladin', spec: 'paladin_holy', name: 'Işık Oku (Holy Bolt)', icon: I('skill-holy-light'),
    desc: 'Işık oku: müttefiki iyileştirir, düşmana hasar verir. 1 Kutsal Güç kazandırır.', anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.373, targeting: 'projectile', behavior: 'heal_bolt',
    range: 26, speed: 45, radius: 0.4, count: 1, damage: { coef: 1.1, type: 'holy' }, heal: { coef: 0.40 }, knockback: 0.7, allyTarget: 'any',
    pip: { id: 'holypower', gain: 1 }, tags: ['spell', 'holy', 'basic', 'projectile'],
    vfx: { projectile: 'holy_projectile', impact: 'holy_burst' }, sfx: { cast: 'holy_cast', impact: 'holy_impact' },
    params: { end: 0.65, chain: 0.04, move: 0.08, stagger: 3, gain: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.35, step: 2, hand: 1 },
  });
  add({
    id: 'paladin_holy_basic_3', classId: 'paladin', spec: 'paladin_holy', name: 'Üçlü Işık (Triple Bolt)', icon: I('skill-holy-nova'),
    desc: 'Üç ışık oku gönderirsin: her biri müttefiki iyileştirir ya da düşmana hasar verir ve düşmanı 10 saniye yargılar. 1 Kutsal Güç kazandırır; %15 ihtimalle Işık Aşısı verir.',
    anim: 'Spellcast_Shoot', animSpeed: 1.2, hitTime: 0.373, targeting: 'projectile', behavior: 'heal_bolt', range: 26, speed: 45, radius: 0.4, count: 3, spread: 8,
    damage: { coef: 0.87, type: 'holy' }, heal: { coef: 0.25 }, knockback: 1.2, allyTarget: 'any', statuses: [{ status: 'judged', duration: 10 }],
    pip: { id: 'holypower', gain: 1 }, tags: ['spell', 'holy', 'basic', 'projectile', 'finisher'],
    vfx: { projectile: 'holy_projectile', impact: 'holy_burst' }, sfx: { cast: 'holy_cast', impact: 'holy_impact' },
    params: { end: 0.7, chain: 0.06, move: 0.12, stagger: 5, gain: 1.33, proc: 0.7, weight: 1, slow: 0.4, step: 3, finisher: 1 },
  });

  // ======================================================================================================
  // Kutsal spec rows
  // ======================================================================================================
  add({
    id: 'paladin_holy_shock', classId: 'paladin', spec: 'paladin_holy', name: 'Kutsal Şok (Holy Shock)', icon: I('skill-heal'), unlockLevel: 1,
    desc: 'Müttefiki %143 iyileştirir ya da imleçteki düşmana %200 kutsal hasar verir; 1 Kutsal Güç kazandırır. %25 ihtimalle Işık Aşısı verir. 6 saniye bekleme. 6 İnanç harcarsın.',
    cost: 6, cooldown: 6, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.373, targeting: 'custom', behavior: 'heal_target', range: 25, allyTarget: 'any',
    heal: { coef: 1.43 }, damage: { coef: 2.0, type: 'holy' }, pip: { id: 'holypower', gain: 1 }, tags: ['spell', 'holy', 'heal', 'builder'],
    vfx: { cast: 'holy_beam', impact: 'heal_burst' }, sfx: { cast: 'holy_cast', impact: 'holy_impact' },
    params: { healBelow: 0.9, end: 0.6, chain: 0.06, move: 0.12, stagger: 8, proc: 1, weight: 4, upper: 1, slow: 0.5 },
  });
  add({
    id: 'paladin_flash_of_light', classId: 'paladin', spec: 'paladin_holy', name: 'Işık Parlaması (Flash of Light)', icon: I('skill-healing-shield'), unlockLevel: 1,
    desc: 'Büyük bir şifa: 1.2 saniyede müttefiki %280 iyileştirirsin. Işık Aşısı varken anında, bedavaya, %20 daha güçlü gelir ve 1 Kutsal Güç kazandırır. 10 İnanç harcarsın.',
    cost: 10, cooldown: 0, castTime: 1.2, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.55, targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly',
    heal: { coef: 2.8 }, procInstant: { status: 'infusion_of_light', consume: true }, tags: ['spell', 'holy', 'heal'],
    vfx: { cast: 'holy_beam', impact: 'heal_burst' }, sfx: { cast: 'holy_cast' },
    params: { smartPriority: 1, end: 0.7, chain: 0.1, move: 0.2, weight: 0 },
  });
  add({
    id: 'paladin_holy_light', classId: 'paladin', spec: 'paladin_holy', name: 'Kutsal Işık (Holy Light)', icon: I('skill-holy-light'), unlockLevel: 20,
    desc: 'Uzun bir hazırlıkla (2.5 saniye) müttefiki %340 iyileştirirsin. Büyük ve yavaş bir şifadır. 14 İnanç harcarsın.',
    cost: 14, cooldown: 0, castTime: 2.5, anim: 'Spellcast_Raise', animSpeed: 1.0, hitTime: 2.3, targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly',
    heal: { coef: 3.4 }, tags: ['spell', 'holy', 'heal'],
    vfx: { cast: 'holy_beam', impact: 'heal_pillar' }, sfx: { cast: 'holy_cast' },
    params: { smartPriority: 1, end: 1.0, chain: 0.1, move: 0.1, weight: 0 },
  });
  add({
    id: 'paladin_cleanse', classId: 'paladin', spec: 'paladin_holy', name: 'Arındırma (Cleanse)', icon: I('skill-holy-water'), unlockLevel: 12,
    desc: 'Müttefikten en fazla 2 temizlenebilir olumsuz etkiyi (zehir, kanama, lanet, yavaşlatma, kök, sessizlik...) kaldırırsın; bir şey kaldırırsan %50 iyileştirirsin. 6 saniye bekleme. 4 İnanç harcarsın.',
    cost: 4, cooldown: 6, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.72, targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly',
    heal: { coef: 0.5 }, tags: ['spell', 'holy', 'heal', 'dispel', 'utility'], vfx: { cast: 'holy_beam', impact: 'heal_burst' }, sfx: { cast: 'holy_cast' },
    params: { dispel: 2, smartPriority: 1, end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'paladin_light_of_dawn', classId: 'paladin', spec: 'paladin_holy', name: 'Şafak Işığı (Light of Dawn)', icon: I('skill-holy-nova'), unlockLevel: 15,
    desc: '15 metre içindeki en yaralı 5 müttefiki %220 iyileştirirsin ve her birine 4 saniyelik küçük bir yenilenme verirsin. 3 Kutsal Güç harcar.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.95, targeting: 'custom', behavior: 'heal_aoe', radius: 15,
    heal: { coef: 2.2 }, pip: { id: 'holypower', cost: 3 }, tags: ['spell', 'holy', 'heal', 'aoe', 'spender'],
    vfx: { cast: 'dawn_dome', impact: 'heal_burst' }, sfx: { cast: 'holy_cast' },
    params: { maxTargets: 5, hotPct: 0.3, hotDur: 4, smartPriority: 1, end: 1.0, chain: 0.1, move: 0.2, weight: 0 },
  });
  add({
    id: 'paladin_divine_toll', classId: 'paladin', spec: 'paladin_holy', name: 'İlahi Çınlama (Divine Toll)', icon: I('skill-prayer'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Beş Kutsal Şok yağdırırsın: en yaralı müttefiklere %143 şifa (müttefik yoksa en yakın düşmanlara %200 hasar). 5 Kutsal Güç kazandırır; %15 ihtimalle Işık Aşısı verir. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'divine_toll', radius: 30, offGcd: true,
    heal: { coef: 1.43 }, damage: { coef: 2.0, type: 'holy' }, pip: { id: 'holypower', gain: 5 }, tags: ['offgcd', 'major', 'spell', 'holy', 'heal', 'aoe'],
    vfx: { cast: 'divine_toll' }, sfx: { cast: 'choir_sting' }, params: { pulses: 5, interval: 0.12, healCoef: 1.43, enemyCoef: 2, end: 0.9, chain: 0.1, move: 0.2, weight: 1 },
  });
  add({
    id: 'paladin_holy_aura_mastery', classId: 'paladin', spec: 'paladin_holy', name: 'Aura Ustalığı (Aura Mastery)', icon: I('skill-prayer'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '10 saniye boyunca 20 metre içindeki tüm müttefikler %20 daha az hasar alır. 180 saniye bekleme.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'self_buff', radius: 20, offGcd: true,
    selfStatuses: [{ status: 'aura_mastery', duration: 10 }], tags: ['offgcd', 'major', 'defensive', 'buff', 'holy'],
    vfx: { cast: 'aura_ring' }, sfx: { cast: 'aura_on' }, params: { end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
}
