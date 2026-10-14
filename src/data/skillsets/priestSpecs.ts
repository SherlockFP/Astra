/**
 * Rahip spec-bound skills and majors: Disiplin (priest_discipline, Atonement healer), Kutsal (priest_holy, direct and AoE healer)
 * and Gölge (priest_shadow, Insanity DPS). SpecDef rows are in specs_kit_priest.ts. OWNER: priest kit.
 * Midnight (12.0) sources: Atonement transfers 46 % of damage done to Atonement allies for 15 s (warcraft.wiki.gg/wiki/Atonement);
 * Voidform lasts 20 s and adds 20 % spell damage (warcraft.wiki.gg/wiki/Voidform). Cooldowns, costs and Insanity amounts are picks.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPriestSpecs(add: SkillAdd): void {
  // =====================================================================================================
  // Disiplin (priest_discipline, healer): Keffara (Atonement) turns damage into healing
  // =====================================================================================================
  add({
    id: 'priest_disc_penance', classId: 'priest', spec: 'priest_discipline', name: 'Tövbe', icon: I('skill-prayer'), unlockLevel: 10,
    desc: '2 saniye boyunca hedefine kutsal ok yağdırırsın. Düşmana isabet eden her ok hasar verir ve Keffara\'lı müttefiklerini iyileştirir; müttefike giden her ok onu iyileştirir.',
    cost: 20, cooldown: 12, castTime: 0, channel: 2.0, hitTime: 0.1, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'priest_penance', allyTarget: 'any', damage: { coef: 0.7, type: 'holy' }, heal: { coef: 0.6 },
    tags: ['spell', 'channel', 'heal', 'holy', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.5, chain: 0.1, move: 0.15, weight: 0, tick: 0.5 },
  });
  add({
    id: 'priest_disc_radiance', classId: 'priest', spec: 'priest_discipline', name: 'Kutsal Işın', icon: I('skill-holy-nova'), unlockLevel: 15,
    desc: '1.5 saniyelik bir büyüyle bir müttefikini iyileştirirsin; 12 metre içindeki en fazla 4 müttefikine de Keffara uygularsın.',
    cost: 25, cooldown: 9, castTime: 1.5, hitTime: 1.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'priest_radiance', allyTarget: 'friendly', heal: { coef: 1.6 }, radius: 12,
    tags: ['spell', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { maxTargets: 4, atonement: 1, end: 0.7, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_disc_pain_suppression', classId: 'priest', spec: 'priest_discipline', name: 'Acı Bastırma', icon: I('buff-defense'), unlockLevel: 12,
    desc: 'Bir müttefikin 8 saniye boyunca %40 daha az hasar alır.',
    cost: 0, cooldown: 60, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.4,
    targeting: 'custom', behavior: 'priest_ally', allyTarget: 'friendly', statuses: [{ status: 'pain_suppression', duration: 8 }],
    tags: ['spell', 'buff', 'defensive', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  // Majors: Vecd (m45, party shields) and İncil (m90, Atonement refresh and heal)
  add({
    id: 'priest_disc_rapture', classId: 'priest', spec: 'priest_discipline', name: 'Vecd', icon: I('buff-absorb'), unlockLevel: 10,
    desc: '12 metre içindeki tüm müttefiklerine, maksimum canlarının %15\'i kadar kalkan verirsin; 10 saniye sürer.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'self_aoe', radius: 12, behavior: 'priest_rapture',
    tags: ['major', 'shield', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'shield_bubble' }, sfx: { cast: 'chi_cast' },
    params: { major: 45, pct: 0.15, dur: 10, end: 0.8, chain: 0.1, move: 0.2, weight: 1 },
  });
  add({
    id: 'priest_disc_evangelism', classId: 'priest', spec: 'priest_discipline', name: 'İncil', icon: I('skill-regeneration'), unlockLevel: 20,
    desc: 'Keffara\'sı olan tüm müttefiklerin Keffara süresini 6 saniye uzatır ve onları anında iyileştirirsin.',
    cost: 0, cooldown: 60, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'self_aoe', radius: 30, behavior: 'priest_evangelism', heal: { coef: 1.0 },
    tags: ['major', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { major: 90, extend: 6, end: 0.9, chain: 0.1, move: 0.2, weight: 1 },
  });

  // =====================================================================================================
  // Kutsal (priest_holy, healer): direct heals, AoE heals, Holy Words, Ilahi Ezgi and Koruyucu Ruh
  // =====================================================================================================
  add({
    id: 'priest_holy_basic', classId: 'priest', spec: 'priest_holy', name: 'Kutsal Şifa Oku', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Bir müttefike kutsal bir ok atarsın: onu iyileştirir, düşmana çarparsa hasar verir.',
    cost: 8, cooldown: 0, castTime: 0, hitTime: 0.37, anim: 'Spellcast_Shoot', animSpeed: 1.6,
    targeting: 'projectile', range: 30, speed: 26, count: 1, spread: 0, behavior: 'heal_bolt',
    heal: { coef: 0.8 }, damage: { coef: 0.6, type: 'holy' }, allyTarget: 'friendly',
    tags: ['spell', 'basic', 'projectile', 'heal'], vfx: { projectile: 'chi_projectile', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  add({
    id: 'priest_holy_prayer', classId: 'priest', spec: 'priest_holy', name: 'Şifa Duası', icon: I('skill-prayer'), unlockLevel: 10,
    desc: '2 saniyelik bir duayla 8 metre içindeki en fazla 5 yaralı müttefiki iyileştirirsin.',
    cost: 20, cooldown: 0, castTime: 2.0, hitTime: 2.0, anim: 'Spellcast_Raise', animSpeed: 1.0,
    targeting: 'custom', behavior: 'heal_aoe', allyTarget: 'friendly', heal: { coef: 1.2 }, radius: 8,
    tags: ['spell', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { maxTargets: 5, needInjured: 1, end: 0.8, chain: 0.1, move: 0.1, weight: 1 },
  });
  add({
    id: 'priest_holy_serenity', classId: 'priest', spec: 'priest_holy', name: 'Kutsal Söz: Huzur', icon: I('skill-divine-shield'), unlockLevel: 10,
    desc: 'Anında büyük bir iyileştirme yaparsın: seçtiğin müttefike Şifa gücünün 3,2 katı kadar can verirsin.',
    cost: 10, cooldown: 60, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Shoot', animSpeed: 1.4,
    targeting: 'custom', behavior: 'heal_target', allyTarget: 'friendly', heal: { coef: 3.2 },
    tags: ['spell', 'heal', 'holyword', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_holy_sanctify', classId: 'priest', spec: 'priest_holy', name: 'Kutsal Söz: Kutsama', icon: I('skill-holy-nova'), unlockLevel: 15,
    desc: 'Seçtiğin yerin 10 metre içindeki en fazla 6 yaralı müttefikini kutsal bir ışıkla iyileştirirsin.',
    cost: 15, cooldown: 60, castTime: 0, hitTime: 0.6, anim: 'Spellcast_Raise', animSpeed: 1.1,
    targeting: 'custom', behavior: 'heal_aoe', allyTarget: 'friendly', heal: { coef: 1.4 }, radius: 10,
    tags: ['spell', 'heal', 'aoe', 'holyword', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { maxTargets: 6, needInjured: 1, end: 0.8, chain: 0.1, move: 0.1, weight: 1 },
  });
  add({
    id: 'priest_holy_circle', classId: 'priest', spec: 'priest_holy', name: 'Şifa Çemberi', icon: I('skill-regeneration'), unlockLevel: 15,
    desc: 'Etrafında 6 metrelik bir şifa çemberi kurarsın; içindeki en fazla 5 yaralı müttefik iyileşir.',
    cost: 10, cooldown: 8, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'heal_aoe', allyTarget: 'friendly', heal: { coef: 0.9 }, radius: 6,
    tags: ['spell', 'heal', 'aoe', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { maxTargets: 5, needInjured: 1, end: 0.6, chain: 0.1, move: 0.1, weight: 0 },
  });
  // Majors: İlahi Ezgi (m45, channel HoT on the party) and Koruyucu Ruh (m90, absorb on one ally)
  add({
    id: 'priest_holy_hymn', classId: 'priest', spec: 'priest_holy', name: 'İlahi Ezgi', icon: I('skill-holy-nova'), unlockLevel: 10,
    desc: '3 saniye boyunca 12 metre içindeki tüm müttefiklerini her saniye iyileştirirsin.',
    cost: 0, cooldown: 120, castTime: 0, channel: 3.0, hitTime: 0.1, anim: 'Spellcast_Raise', animSpeed: 1.0,
    targeting: 'custom', behavior: 'priest_hymn', heal: { coef: 0.3 }, radius: 12,
    tags: ['major', 'heal', 'aoe', 'channel', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { major: 45, tick: 1.0, end: 0.3, chain: 0.1, move: 0.2, weight: 0 },
  });
  add({
    id: 'priest_holy_guardian', classId: 'priest', spec: 'priest_holy', name: 'Koruyucu Ruh', icon: I('skill-divine-shield'), unlockLevel: 20,
    desc: 'Bir müttefikine 10 saniye boyunca Şifa gücünün 3 katı kadar bir kalkan verirsin.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'priest_ally', allyTarget: 'friendly', heal: { coef: 3.0 },
    tags: ['major', 'shield', 'spec'], vfx: { cast: 'buff_aura', impact: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 90, shield: 1, shieldSec: 10, end: 0.6, weight: 1 },
  });

  // =====================================================================================================
  // Gölge (priest_shadow, DPS): Insanity (Delilik) from Mind Blast and the DoTs, Voidform and Boşluk Oku, Gölge Canavarı
  // =====================================================================================================
  add({
    id: 'priest_shadow_mind_blast', classId: 'priest', spec: 'priest_shadow', name: 'Zihin Patlaması', icon: I('skill-shadow-grasp'), unlockLevel: 10,
    desc: 'Bir düşmana zihin patlaması gönderip %220 gölge hasarı verirsin. 20 Delilik kazanırsın.',
    cost: 12, cooldown: 7.5, castTime: 1.5, hitTime: 1.5, anim: 'Spellcast_Shoot', animSpeed: 1.0,
    targeting: 'target_instant', range: 25, behavior: 'priest_strike', damage: { coef: 2.2, type: 'shadow' }, pip: { id: 'insanity', gain: 20 },
    tags: ['spell', 'shadow', 'spec'], vfx: { cast: 'buff_aura', impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.7, chain: 0.1, move: 0.15, stagger: 6, proc: 1, weight: 1 },
  });
  add({
    id: 'priest_shadow_swp', classId: 'priest', spec: 'priest_shadow', name: 'Gölge Acısı', icon: I('skill-curse'), unlockLevel: 10,
    desc: 'Bir düşmana 16 saniye süren bir gölge acısı bırakırsın: toplam %80 hasar verir. 10 Delilik kazanırsın.',
    cost: 10, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.4,
    targeting: 'target_instant', range: 25, behavior: 'priest_dot', statuses: [{ status: 'shadow_word_pain', duration: 16, magnitude: 0.8 }],
    pip: { id: 'insanity', gain: 10 },
    tags: ['spell', 'shadow', 'dot', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_shadow_vt', classId: 'priest', spec: 'priest_shadow', name: 'Vampirik Dokunuş', icon: I('skill-shadow-step'), unlockLevel: 12,
    desc: 'Bir düşmana 15 saniye süren bir gölge dokunuşu bırakırsın: toplam %90 hasar verir. 10 Delilik kazanırsın.',
    cost: 12, cooldown: 0, castTime: 1.5, hitTime: 1.5, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'target_instant', range: 25, behavior: 'priest_dot', statuses: [{ status: 'vampiric_touch', duration: 15, magnitude: 0.9 }],
    pip: { id: 'insanity', gain: 10 },
    tags: ['spell', 'shadow', 'dot', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_shadow_mind_flay', classId: 'priest', spec: 'priest_shadow', name: 'Zihin Sızması', icon: I('skill-shadow-grasp'), unlockLevel: 12,
    desc: '3 saniye boyunca hedefine zihin sızması uygularsın: her 0,75 saniyede %50 gölge hasarı verir. Her vuruş 10 Delilik kazandırır.',
    cost: 12, cooldown: 0, castTime: 0, channel: 3.0, hitTime: 0.1, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'priest_mind_flay', damage: { coef: 0.5, type: 'shadow' }, pip: { id: 'insanity', gain: 10 },
    tags: ['spell', 'shadow', 'channel', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.5, chain: 0.1, move: 0.15, weight: 0, tick: 0.75 },
  });
  add({
    id: 'priest_shadow_void_bolt', classId: 'priest', spec: 'priest_shadow', name: 'Boşluk Oku', icon: I('skill-lightning-bolt'), unlockLevel: 15,
    desc: '40 Delilik harcayıp bir düşmana %260 gölge hasarı verirsin.',
    cost: 0, cooldown: 6, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'target_instant', range: 25, behavior: 'priest_strike', damage: { coef: 2.6, type: 'shadow' }, pip: { id: 'insanity', cost: 40 },
    tags: ['spell', 'shadow', 'spec'], vfx: { cast: 'buff_aura', impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 8, proc: 1, weight: 1 },
  });
  // Majors: Boşluk Formu (m45, Voidform: +20 % spell damage for 20 s) and Gölge Canavarı (m90, a Shadowfiend pet for 15 s)
  add({
    id: 'priest_shadow_voidform', classId: 'priest', spec: 'priest_shadow', name: 'Boşluk Formu', icon: I('buff-strength'), unlockLevel: 10,
    desc: '20 saniye boyunca gölge gücün artar: büyü hasarın %20 yükselir.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.2,
    targeting: 'self_buff', selfStatuses: [{ status: 'voidform', duration: 20 }],
    tags: ['major', 'buff', 'shadow', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
  add({
    id: 'priest_shadow_fiend', classId: 'priest', spec: 'priest_shadow', name: 'Gölge Canavarı', icon: I('skill-shadow-grasp'), unlockLevel: 20,
    desc: '15 saniye boyunca yanında savaşan bir gölge canavarı çağırırsın.',
    cost: 0, cooldown: 180, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'priest_shadowfiend', count: 1, group: 'pet', life: 15 },
    tags: ['major', 'summon', 'shadow', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'boss_roar' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });
}
