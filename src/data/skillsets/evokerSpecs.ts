/**
 * Ejderhasoy spec rows (AE-4, docs/kits/agile-evoker.md §4.1-§4.3): Yıkım Nefesi (Devastation), Koruyucu Nefes (Preservation),
 * Yüceltme (Augmentation). Rows shared by the specs (chain, Yaşayan Alev, Parçala, Ateş Nefesi, Pyre, Süzül, Obsidyen Pullar, Bastır,
 * Ejder Öfkesi, Aspectlerin Öfkesi) live in evoker.ts. Behaviours: combat/skills/evokerKit.ts (kit_* ids), heals use kit_heal.
 * Numbers are the doc's coefficients (heal coef = healFormula coef; damage coef = weapon roll x coef). Called once by data/skills.ts.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerEvokerSpecs(add: SkillAdd): void {
  // ======================================================================================================
  // YIKIM NEFESİ (evoker_devastation)
  // ======================================================================================================
  add({
    id: 'evoker_unbound_flame', classId: 'evoker', spec: 'evoker_devastation', name: 'Serbest Alev (Unbound Flame)', icon: I('skill-fire-arrow'), unlockLevel: 20,
    desc: 'Ejder Öfkesi\'nden sonra 15 saniye boyunca Yaşayan Alev\'in yerine geçer: anında, bedava ve %175 ateş hasarlı bir alev. %25 ihtimalle Öz Patlaması verir. Dört yükü vardır.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.373, targeting: 'target_projectile', behavior: 'kit_living_flame',
    range: 25, speed: 34, radius: 0.5, homing: 6, damage: { coef: 1.75, type: 'fire' }, replaces: { skill: 'evoker_living_flame', whileStatus: 'unbound_flame' },
    tags: ['spell', 'fire', 'projectile', 'builder'], vfx: { cast: 'fire_burst', projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { end: 0.8, chain: 0.05, move: 0.1, stagger: 4, weight: 0, proc: 1 },
  });
  add({
    id: 'evoker_eternity_surge', classId: 'evoker', spec: 'evoker_devastation', name: 'Ebedi Dalga (Eternity Surge)', icon: I('skill-ice-bolt'), unlockLevel: 10, defaultSlot: 'r',
    desc: 'Tuşu basılı tut (0.67 / 1.33 / 2 saniye): bırakınca zamanı yırtan bir dalga 1 / 3 / 5 hedefe %400 buz hasarı verir. 2 Gökkuşağı yükü kazandırır. 30 saniye bekleme. %1.2 Mana.',
    cost: 1.2, cooldown: 30, castTime: 0, channel: 2.0, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.05, targeting: 'custom', behavior: 'kit_empower',
    range: 25, damage: { coef: 4.0, type: 'frost' },
    tags: ['spell', 'frost', 'channel', 'empower'], vfx: { cast: 'dragon_breath_cone', impact: 'frost_burst' }, sfx: { cast: 'dragon_breath', impact: 'ice_chime' },
    params: { tick: 0.1, empower: 1, kind: 2, hold1: 0.67, hold2: 1.33, hold3: 2.0, targets1: 1, targets2: 3, targets3: 5, stagger: 4, weight: 1, proc: 1 },
  });
  add({
    id: 'evoker_deep_breath', classId: 'evoker', spec: 'evoker_devastation', name: 'Derin Nefes (Deep Breath)', icon: I('skill-meteor'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Kanatlanıp 25 metre ileri uçarsın: yol boyunca ve indiğin 6 metrelik alanda her düşmana %320 + %320 ateş hasarı. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Jump_Full_Long', animSpeed: 0.9, hitTime: 0.3, targeting: 'dash', behavior: 'kit_flight', offGcd: true,
    range: 25, radius: 6, damage: { coef: 3.2, type: 'fire' }, tags: ['offgcd', 'major', 'movement', 'spell', 'fire', 'aoe', 'ranged'],
    vfx: { cast: 'wings_aura', trail: 'fire_ground', impact: 'meteor_fall' }, sfx: { cast: 'fire_whoosh', impact: 'boss_roar' },
    params: { speed: 22, pathCoef: 3.2, pathWidth: 5, end: 1.0, chain: 0.1, move: 0.2, weight: 2, stagger: 6 },
  });
  // Kırıcı Yıldız (WoW builder): a star lands on the reticle, 8 m fire burst, +1 Öz. No free bar slot (Shift+ bar not in code).
  add({
    id: 'evoker_shattering_star', classId: 'evoker', spec: 'evoker_devastation', name: 'Kırıcı Yıldız (Shattering Star)', icon: I('skill-meteor-impact'), unlockLevel: 10,
    desc: 'İmlece bir yıldız düşürür: 8 metre içindeki en çok 5 düşmana %150 ateş hasarı verir ve 1 Öz kazandırır. Bedava, bekleme yok.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5, targeting: 'target_instant', behavior: 'kit_aoe_strike',
    range: 25, radius: 8, damage: { coef: 1.5, type: 'fire' }, pip: { id: 'essence', gain: 1 },
    tags: ['spell', 'fire', 'aoe', 'builder'], vfx: { cast: 'meteor_fall', impact: 'fire_burst', ground: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
    params: { maxTargets: 5, falloff: 0.9, stagger: 4, weight: 1, proc: 1, end: 1.0, chain: 0.08, move: 0.15 },
  });

  // ======================================================================================================
  // KORUYUCU NEFES (evoker_preservation): every heal runs on kit_heal / the empower channel; HoTs are `reversion` / `dream_breath` (rule hot)
  // ======================================================================================================
  add({
    id: 'evoker_reversion', classId: 'evoker', spec: 'evoker_preservation', name: 'Geri Dönüş (Reversion)', icon: I('skill-renew'), unlockLevel: 10, defaultSlot: 'q',
    desc: '30 metre içindeki bir müttefike anında 12 saniyelik şifa verir (toplam %300) ve bu şifanın %10\'u kadar emici kalkan ekler. %15 ihtimalle Öz Patlaması verir. Merithra\'nın Lütfu varken şifa en yaralı 4 müttefike sıçrar. %2.2 Mana.',
    cost: 2.2, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.3, targeting: 'custom', behavior: 'kit_heal', allyTarget: 'friendly',
    range: 30, tags: ['spell', 'holy', 'heal', 'hot', 'builder'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'heal', impact: 'heal' },
    params: { hotCoef: 3.0, hotDur: 12, absorbPct: 0.10, bounce: 1, echoable: 1, end: 0.8, chain: 0.05, move: 0.1, weight: 0, stagger: 0 },
  });
  add({
    id: 'evoker_dream_breath', classId: 'evoker', spec: 'evoker_preservation', name: 'Rüya Nefesi (Dream Breath)', icon: I('skill-regeneration'), unlockLevel: 10, defaultSlot: 'e',
    desc: 'Tuşu basılı tut (0.67 / 1.33 / 2 saniye): bırakınca önündeki konide (12 / 15 / 18 metre) en çok 6 müttefik anında %80 iyileşir ve 4 / 8 / 12 saniyelik şifa kazanır. 2. kademeden itibaren %25 ihtimalle Merithra\'nın Lütfu. 30 saniye bekleme. %4.9 Mana.',
    cost: 4.9, cooldown: 30, castTime: 0, channel: 2.0, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.05, targeting: 'custom', behavior: 'kit_empower',
    range: 18, arc: 60, heal: { coef: 0.8 }, allyTarget: 'friendly', tags: ['spell', 'holy', 'heal', 'channel', 'aoe', 'empower'],
    vfx: { cast: 'dragon_breath_cone', impact: 'heal_burst' }, sfx: { cast: 'dragon_breath', impact: 'heal' },
    params: {
      tick: 0.1, empower: 1, kind: 3, hold1: 0.67, hold2: 1.33, hold3: 2.0, range1: 12, range2: 15, range3: 18, hot1: 4, hot2: 8, hot3: 12,
      hotCoefPerSec: 0.25, maxTargets: 6, blessRank: 2, blessChance: 0.25, echoable: 1, stagger: 0, weight: 0,
    },
  });
  add({
    id: 'evoker_echo', classId: 'evoker', spec: 'evoker_preservation', name: 'Yankı (Echo)', icon: I('skill-prayer'), unlockLevel: 10, defaultSlot: 'r',
    desc: '30 metre içindeki bir müttefike 20 saniye süren bir yankı bırakırsın: ona yapacağın bir sonraki şifa %70 güçle kendini tekrarlar. İkiz Yankılar varken iki yankı bırakır. 2 Öz harcar; Öz Patlaması varken bedavadır.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'kit_echo', allyTarget: 'friendly',
    range: 30, pip: { id: 'essence', cost: 2 }, tags: ['spell', 'holy', 'heal', 'buff', 'spender'], vfx: { cast: 'heal_loop', impact: 'shape_echo' }, sfx: { cast: 'buff', impact: 'buff' },
    params: { dur: 20, echoes: 1, twinEchoes: 2, end: 0.8, chain: 0.05, move: 0.1, weight: 0, stagger: 0 },
  });
  add({
    id: 'evoker_emerald_blossom', classId: 'evoker', spec: 'evoker_preservation', name: 'Zümrüt Çiçek (Emerald Blossom)', icon: I('skill-holy-nova'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Müttefikin etrafında 8 metrelik bir çiçek açar: en yaralı 3 müttefiği %230 iyileştirir ve sonraki Yankı\'yı ikiz yapar. 3 Öz harcar (Öz Patlaması varken bedava). %5 Mana.',
    cost: 5, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'kit_blossom', allyTarget: 'friendly',
    range: 30, radius: 8, heal: { coef: 2.3 }, pip: { id: 'essence', cost: 3 }, selfStatuses: [{ status: 'twin_echoes', duration: 15 }],
    tags: ['spell', 'holy', 'heal', 'aoe', 'spender'], vfx: { cast: 'heal_pillar', impact: 'heal_burst', ground: 'heal_loop' }, sfx: { cast: 'heal_big', impact: 'heal' },
    params: { maxTargets: 3, echoable: 1, end: 1.0, chain: 0.08, move: 0.15, weight: 1, stagger: 0 },
  });
  add({
    id: 'evoker_verdant_embrace', classId: 'evoker', spec: 'evoker_preservation', name: 'Yeşil Kucaklayış (Verdant Embrace)', icon: I('skill-heal'), unlockLevel: 10, defaultSlot: 's2',
    desc: '25 metre içindeki bir müttefikin yanına süzülür ve onu %200 iyileştirirsin; 8 saniye boyunca başkalarına yaptığın şifanın %60\'ı bağlı müttefike de gider. 24 saniye bekleme. %3 Mana.',
    cost: 3, cooldown: 24, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.4, hitTime: 0.3, targeting: 'custom', behavior: 'kit_verdant', allyTarget: 'friendly',
    range: 25, heal: { coef: 2.0 }, tags: ['spell', 'holy', 'heal', 'movement'], vfx: { cast: 'dragon_trail', impact: 'heal_burst' }, sfx: { cast: 'whoosh', impact: 'heal' },
    params: { speed: 28, lifebindDur: 8, lifebindPct: 0.6, echoable: 1, end: 0.8, chain: 0.08, move: 0.15, weight: 0, stagger: 0 },
  });
  add({
    id: 'evoker_time_dilation', classId: 'evoker', spec: 'evoker_preservation', name: 'Zaman Genişlemesi (Time Dilation)', icon: I('ui-hourglass'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '30 metre içindeki bir müttefik 8 saniye boyunca %40 daha az hasar alır. 45 saniye bekleme. %2 Mana.',
    cost: 2, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'kit_time_dilation', offGcd: true, allyTarget: 'friendly',
    range: 30, tags: ['offgcd', 'major', 'defensive', 'buff', 'heal'], vfx: { cast: 'time_ripple' }, sfx: { cast: 'time_warp' },
    params: { dur: 8, end: 0.8, chain: 0.1, move: 0.15, weight: 1 },
  });
  add({
    id: 'evoker_stasis', classId: 'evoker', spec: 'evoker_preservation', name: 'Durgunluk (Stasis)', icon: I('skill-ice-block'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '30 saniye boyunca yapacağın sonraki 3 şifa büyüsünün kopyaları saklanır. Düğme Durgunluk Salımı\'na dönüşür: saklanan şifalar bedavaya, aynı hedeflerde yeniden gerçekleşir. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'kit_stasis', offGcd: true,
    selfStatuses: [{ status: 'stasis', duration: 30 }], tags: ['offgcd', 'major', 'buff', 'heal', 'frost'], vfx: { cast: 'time_ripple' }, sfx: { cast: 'time_warp' },
    params: { store: 3, end: 0.9, chain: 0.1, move: 0.15, weight: 1 },
  });
  add({
    id: 'evoker_stasis_release', classId: 'evoker', spec: 'evoker_preservation', name: 'Durgunluk Salımı (Stasis Release)', icon: I('skill-resurrect'), unlockLevel: 20,
    desc: 'Durgunluk\'ta saklanan şifaları (en çok 3) bedavaya, aynı hedeflerde yeniden gerçekleştirir.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'kit_stasis_release', offGcd: true,
    replaces: { skill: 'evoker_stasis', whileStatus: 'stasis' }, tags: ['offgcd', 'buff', 'heal', 'frost'], vfx: { cast: 'time_ripple' }, sfx: { cast: 'heal_big' },
    params: { gap: 0.35, end: 0.8, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Geri Sarma (WoW major heal): 40 m around the chosen ally, the 5 most injured heal for 2.8 (blossom model). No bar slot (Shift+).
  add({
    id: 'evoker_rewind', classId: 'evoker', spec: 'evoker_preservation', name: 'Geri Sarma (Rewind)', icon: I('skill-resurrect'), unlockLevel: 15,
    desc: 'Zamanı geri sarar: 40 metre içindeki en yaralı 5 müttefiki %280 iyileştirir. 180 saniye bekleme. Bar yuvası yoktur (ikinci bar).',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.3, targeting: 'custom', behavior: 'kit_blossom', offGcd: true, allyTarget: 'friendly',
    range: 30, radius: 40, heal: { coef: 2.8 }, tags: ['offgcd', 'major', 'heal', 'holy', 'aoe'],
    vfx: { cast: 'time_ripple', impact: 'heal_burst' }, sfx: { cast: 'time_warp', impact: 'heal' },
    params: { maxTargets: 5, end: 0.8, chain: 0.1, move: 0.15, weight: 1, stagger: 0 },
  });

  // ======================================================================================================
  // YÜCELTME (evoker_augmentation)
  // ======================================================================================================
  add({
    id: 'evoker_eruption', classId: 'evoker', spec: 'evoker_augmentation', name: 'Püskürme (Eruption)', icon: I('skill-meteor-impact'), unlockLevel: 10, defaultSlot: 'q',
    desc: '2 saniyelik büyüyle hedefte yer yarılır: %200 ateş hasarı, 8 metre içinde 5 düşmana daha %180. Her kullanım Abanoz Kudret\'i 1 saniye uzatır (en çok 30). 3 Öz harcar; Öz Patlaması varken bedavadır. Gökkuşağı hasarı %20 artırır.',
    cost: 0, cooldown: 0, castTime: 2.0, anim: 'Spellcast_Raise', animSpeed: 1.2, hitTime: 0.6, targeting: 'target_instant', behavior: 'kit_aoe_strike',
    range: 25, radius: 8, damage: { coef: 2.0, type: 'fire' }, pip: { id: 'essence', cost: 3 },
    tags: ['spell', 'fire', 'aoe', 'spender'], vfx: { cast: 'fire_burst', impact: 'ground_slam', ground: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { maxTargets: 6, falloff: 0.9, extendEbon: 1, stagger: 5, weight: 1, proc: 1, end: 1.0, chain: 0.08, move: 0.15 },
  });
  add({
    id: 'evoker_ebon_might', classId: 'evoker', spec: 'evoker_augmentation', name: 'Abanoz Kudret (Ebon Might)', icon: I('skill-war-cry'), unlockLevel: 10, defaultSlot: 'e',
    desc: '1.2 saniyelik büyüyle 40 metre içindeki en çok hasar veren 2 müttefikin hasarını 20 saniye boyunca %11, kendi hasarını %8 artırırsın. 30 saniye bekleme. %1 Mana.',
    cost: 1, cooldown: 30, castTime: 1.2, anim: 'Spellcast_Raise', animSpeed: 1.2, hitTime: 0.6, targeting: 'custom', behavior: 'kit_ebon_might',
    range: 40, tags: ['spell', 'fire', 'buff'], vfx: { cast: 'ebon_wings' }, sfx: { cast: 'buff', impact: 'choir_sting' },
    params: { dur: 20, count: 2, allyMag: 0.11, selfMag: 0.08, end: 1.0, chain: 0.08, move: 0.15, weight: 0 },
  });
  add({
    id: 'evoker_prescience', classId: 'evoker', spec: 'evoker_augmentation', name: 'Öngörü (Prescience)', icon: I('buff-crit'), unlockLevel: 10, defaultSlot: 'r',
    desc: '25 metre içindeki bir müttefikin kritik şansını 20 saniye boyunca %13 artırırsın (aynı anda en çok 2 müttefik). Her kullanım %30 ihtimalle Öz Patlaması verir. 12 saniye bekleme, 2 yük.',
    cost: 0, cooldown: 12, charges: 2, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'kit_prescience', allyTarget: 'friendly',
    range: 25, tags: ['spell', 'arcane', 'buff'], vfx: { cast: 'prescience_rune' }, sfx: { cast: 'buff' }, params: { dur: 20, max: 2, end: 0.8, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'evoker_upheaval', classId: 'evoker', spec: 'evoker_augmentation', name: 'Yer Sarsıntısı (Upheaval)', icon: I('skill-ground-slam'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Tuşu basılı tut (0.67 / 1.33 / 2 saniye): bırakınca imleçteki zemin 5 / 7.5 / 10 metre yarıçapta patlar ve her düşmana %310 fiziksel hasar verir. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, channel: 2.0, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.05, targeting: 'custom', behavior: 'kit_empower',
    range: 25, radius: 10, damage: { coef: 3.1, type: 'physical' }, tags: ['major', 'physical', 'channel', 'aoe', 'empower', 'spell'],
    vfx: { cast: 'dragon_breath_cone', ground: 'quaking_ring', impact: 'ground_slam' }, sfx: { cast: 'ground_slam', impact: 'explosion' },
    params: {
      tick: 0.1, empower: 1, kind: 4, hold1: 0.67, hold2: 1.33, hold3: 2.0, radius1: 5, radius2: 7.5, radius3: 10, maxTargets: 20, stagger: 6, weight: 2, proc: 1,
    },
  });
  add({
    id: 'evoker_breath_of_eons', classId: 'evoker', spec: 'evoker_augmentation', name: 'Çağların Nefesi (Breath of Eons)', icon: I('skill-fire-wave'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '30 metre uçarak geçtiğin yoldaki düşmanlara %310 ateş hasarı verir ve 10 saniyelik Zamansal Yara bırakır: yara, Abanoz Kudret sahiplerinin verdiği hasarın %15\'ini biriktirir ve süre bitince patlatır. Terazi Eğimi kazanırsın. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Jump_Full_Long', animSpeed: 0.9, hitTime: 0.3, targeting: 'dash', behavior: 'kit_flight', offGcd: true,
    range: 30, selfStatuses: [{ status: 'tip_scales', duration: 30 }], statuses: [{ status: 'temporal_wound', duration: 10 }],
    tags: ['offgcd', 'major', 'movement', 'spell', 'fire', 'aoe', 'ranged'], vfx: { cast: 'wings_aura', trail: 'time_ripple', impact: 'shockwave' }, sfx: { cast: 'time_warp', impact: 'boss_roar' },
    params: { speed: 24, pathCoef: 3.1, pathWidth: 5, wound: 1, woundDur: 10, bankPct: 0.15, landing: 0, end: 1.0, chain: 0.1, move: 0.2, weight: 2, stagger: 6 },
  });
}
