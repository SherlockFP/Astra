/**
 * Paladin spec rows: Koruma (paladin_protection) and Ceza (paladin_retribution). PM-PA (docs/kits/plate-melee.md §5a, §7a;
 * behaviour map: docs/kits/paladin_behaviors.md). Rows shared with other specs live in paladin.ts; Kutsal rows in paladinHoly.ts.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPaladinSpecs(add: SkillAdd): void {
  // ======================================================================================================
  // KORUMA (paladin_protection) — Holy Power loop, Doğruluk Kalkanı near-permanent, İntikamcı Kalkan interrupt rhythm
  // ======================================================================================================
  add({
    id: 'paladin_blessed_hammer', classId: 'paladin', spec: 'paladin_protection', name: 'Kutsanmış Çekiç (Blessed Hammer)', icon: I('skill-hammer-of-justice'), unlockLevel: 10,
    desc: 'Çevrende dönen üç kutsal çekiç yaratırsın: her biri %60 kutsal hasar verir, vurduğu düşmanları 3 saniye zayıflatır (%20 daha az hasar) ve düşmanların dikkatini çeker. 1 Kutsal Güç kazandırır. 3 yük, her biri 6 saniyede dolar. 5 İnanç harcarsın.',
    cost: 5, cooldown: 6, charges: 3, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.95, targeting: 'self_aoe', behavior: 'orbit_hammers',
    radius: 4.2, duration: 1.0, damage: { coef: 0.6, type: 'holy' }, statuses: [{ status: 'curse', duration: 3 }], pip: { id: 'holypower', gain: 1 },
    tags: ['spell', 'holy', 'aoe', 'builder'], vfx: { cast: 'holy_hammer' }, sfx: { cast: 'swing_heavy', impact: 'hammer_hit' },
    params: { hammers: 3, orbitTime: 0.9, orbitRadius: 3.2, hammerCoef: 0.6, threatMult: 2.5, end: 1.2, chain: 0.1, move: 0.2, stagger: 5, proc: 0.6, weight: 4 },
  });
  add({
    id: 'paladin_shield_of_righteous', classId: 'paladin', spec: 'paladin_protection', name: 'Doğruluk Kalkanı (Shield of the Righteous)', icon: I('skill-shield-wall'), unlockLevel: 10,
    desc: 'Kalkanınla önündeki en fazla 5 düşmana %200 kutsal hasar verirsin ve 6 saniye boyunca zırhın %40, blok şansın %20 artar. 3 Kutsal Güç harcar. Her kullanımda %50 ihtimalle bir sonraki Işığın Sözü bedavaya gelir (Parlak Işık).',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Block_Attack', animSpeed: 1.5, hitTime: 0.427, targeting: 'melee_arc', range: 3.0, arc: 120, offGcd: true,
    damage: { coef: 2.0, type: 'holy' }, pip: { id: 'holypower', cost: 3 }, tags: ['offgcd', 'melee', 'holy', 'shield', 'defensive', 'spender'],
    vfx: { cast: 'shield_bubble', impact: 'holy_burst' }, sfx: { cast: 'shield_bash', impact: 'holy_impact' },
    params: { maxTargets: 5, threatMult: 2, end: 0.64, chain: 0.08, move: 0.15, stagger: 15, proc: 1, weight: 4 },
  });
  add({
    id: 'paladin_consecration', classId: 'paladin', spec: 'paladin_protection', name: 'Kutsal Zemin (Consecration)', icon: I('skill-consecration'), unlockLevel: 12,
    desc: 'Ayaklarının altında 12 saniye süren kutsal bir zemin yaratırsın: içindeki düşmanlar her saniye %10 kutsal hasar alır ve %15 yavaşlar; zeminde duran dostların zırhı %3 artar. 9 saniye bekleme. 5 İnanç harcarsın.',
    cost: 5, cooldown: 9, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.56, targeting: 'ground_aoe', radius: 5, duration: 12, ticks: 12,
    damage: { coef: 0.1, type: 'holy', perTick: true }, statuses: [{ status: 'slow', duration: 1.5, magnitude: 0.15 }],
    tags: ['holy', 'aoe', 'zone', 'dot'], vfx: { ground: 'holy_ground', impact: 'holy_burst' }, sfx: { cast: 'ground_slam' },
    params: { atCaster: 1, allyArmor: 1, end: 0.95, chain: 0.1, move: 0.2, stagger: 1, proc: 0.2, weight: 1 },
  });
  add({
    id: 'paladin_reckoning', classId: 'paladin', spec: 'paladin_protection', name: 'Hesaplaşma (Hand of Reckoning)', icon: I('skill-taunt'), unlockLevel: 10,
    desc: 'Seçili düşmanı sana çevirirsin: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye. 8 saniye bekleme.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.3, targeting: 'custom', behavior: 'provoke', range: 25, offGcd: true,
    requires: { target: 'enemy' }, tags: ['offgcd', 'taunt', 'threat', 'holy'], vfx: { impact: 'judgement_pillar' }, sfx: { cast: 'holy_cast' },
    params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100, end: 0.5, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'paladin_prot_ardent', classId: 'paladin', spec: 'paladin_protection', name: 'Yılmaz Savunucu (Ardent Defender)', icon: I('skill-iron-skin'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '10 saniye boyunca aldığın hasar %20 azalır. Ölümcül bir darbe alırsan canının %25\'iyle ayakta kalırsın ve etki biter; hiç tetiklenmezse sürenin sonunda canının %20\'sini yenilersin. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.3, targeting: 'custom', behavior: 'ardent_defender', offGcd: true,
    selfStatuses: [{ status: 'ardent', duration: 10 }], tags: ['offgcd', 'major', 'defensive', 'buff', 'holy'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'divine_shield' }, params: { expireHealPct: 0.2, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });
  add({
    id: 'paladin_prot_bulwark', classId: 'paladin', spec: 'paladin_protection', name: 'Kadim Krallar Koruyucusu (Guardian of Ancient Kings)', icon: I('skill-divine-shield'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '8 saniye boyunca aldığın hasar %45 azalır ve kontrol etkilerine bağışık olursun. 180 saniye bekleme.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'bulwark', duration: 8 }], tags: ['offgcd', 'major', 'defensive', 'buff', 'holy'],
    vfx: { cast: 'ancient_guardian' }, sfx: { cast: 'divine_shield' }, params: { end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });

  // ======================================================================================================
  // CEZA (paladin_retribution) — Holy Power spend at 5, Işık Çekici windows, Küllerin Uyanışı, Adalet Savaşı
  // ======================================================================================================
  add({
    id: 'paladin_verdict', classId: 'paladin', spec: 'paladin_retribution', name: 'Nihai Hüküm (Final Verdict)', icon: I('skill-execute'), unlockLevel: 10,
    desc: 'Hedefe %230 kutsal hasar verirsin; yargılı hedefe %25 daha güçlü vurur. 3 Kutsal Güç harcar. %15 ihtimalle Yargı\'nın beklemesini sıfırlar. Işık Çekici açıkken Işık Çekici\'ne dönüşür.',
    cost: 0, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.2, hitTime: 0.448, targeting: 'target_instant', range: 3.2,
    damage: { coef: 2.3, type: 'holy' }, pip: { id: 'holypower', cost: 3 }, route: { from: ['@status:judged'], window: 6, more: 0.25 },
    tags: ['melee', 'holy', 'spender', 'finisher'], vfx: { trail: 'slash_arc_big', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'hammer_hit' },
    params: { end: 0.85, chain: 0.08, move: 0.2, stagger: 20, proc: 1, weight: 2, lunge: 0.8, root: 1 },
  });
  add({
    id: 'paladin_hammer_of_light', classId: 'paladin', spec: 'paladin_retribution', name: 'Işık Çekici (Hammer of Light)', icon: I('skill-hammer-of-justice'), unlockLevel: 10,
    desc: 'Gökten dev bir çekiç indirirsin: hedefe %320, yakındaki 7 düşmana %160 kutsal hasar verir. 3 Kutsal Güç harcar. İntikam Kanatları ya da İdam Hükmü ile açılır; 12 saniyede iki kullanım.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.95, targeting: 'melee_arc', behavior: 'splash_strike', range: 3.4, arc: 140,
    damage: { coef: 3.2, type: 'holy' }, pip: { id: 'holypower', cost: 3 }, replaces: { skill: 'paladin_verdict', whileStatus: 'hammer_window' },
    tags: ['melee', 'holy', 'aoe', 'spender', 'finisher'], vfx: { impact: 'hammer_of_light' }, sfx: { cast: 'hammer_hit', impact: 'explosion' },
    params: { splashRadius: 6, splashMax: 7, splashMult: 0.5, end: 1.0, chain: 0.1, move: 0.25, stagger: 25, proc: 1, weight: 2 },
  });
  add({
    id: 'paladin_blade_of_justice', classId: 'paladin', spec: 'paladin_retribution', name: 'Hüküm Bıçağı (Blade of Justice)', icon: I('skill-assassinate'), unlockLevel: 12,
    desc: 'Hedefe 10 metreden %180 kutsal hasarlı bir kılıç ışını gönderirsin ve 1 Kutsal Güç kazanırsın. 12 saniye bekleme; Adalet Savaşı varken beklemesi sıfırlanır ve %25 daha güçlü vurur.',
    cost: 0, cooldown: 12, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.56, targeting: 'target_instant', range: 10,
    damage: { coef: 1.8, type: 'holy' }, pip: { id: 'holypower', gain: 1 }, tags: ['melee', 'holy', 'builder'],
    vfx: { trail: 'holy_slash', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'holy_impact' },
    params: { end: 0.7, chain: 0.08, move: 0.15, stagger: 8, proc: 1, weight: 0 },
  });
  add({
    id: 'paladin_divine_storm', classId: 'paladin', spec: 'paladin_retribution', name: 'İlahi Fırtına (Divine Storm)', icon: I('skill-whirlwind'), unlockLevel: 10,
    desc: 'Çevrendeki 5.5 metre içindeki en fazla 8 düşmana %230 kutsal hasar veren bir kasırga yaratırsın. 3 Kutsal Güç harcar.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Spin', animSpeed: 2.4, hitTime: 0.6, targeting: 'self_aoe', radius: 5.5,
    damage: { coef: 2.3, type: 'holy' }, pip: { id: 'holypower', cost: 3 }, tags: ['melee', 'holy', 'aoe', 'spender'],
    vfx: { cast: 'spin_slash', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'holy_impact' },
    params: { maxTargets: 8, ringColor: 0xffe9a0, end: 1.0, chain: 0.1, move: 0.25, stagger: 20, proc: 1, weight: 2 },
  });
  add({
    id: 'paladin_wake_of_ashes', classId: 'paladin', spec: 'paladin_retribution', name: 'Küllerin Uyanışı (Wake of Ashes)', icon: I('skill-fire-wave'), unlockLevel: 15,
    desc: 'Önündeki 12 metrelik koniye %220 kutsal hasar verir ve 9 saniye yakarsın; şeytanlar ve ölümsüzler 5 saniye sersemler (boss hariç). Vurduğun her düşman için canının %8\'ini yenilersin (en fazla 3). 3 Kutsal Güç kazandırır. 30 saniye bekleme.',
    cost: 0, cooldown: 30, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'wake_of_ashes', range: 12, arc: 70,
    damage: { coef: 2.2, type: 'holy' }, statuses: [{ status: 'burn', duration: 9, magnitude: 0.45 }], pip: { id: 'holypower', gain: 3 },
    tags: ['melee', 'holy', 'builder', 'defensive'], vfx: { cast: 'wake_of_ashes' }, sfx: { cast: 'explosion', impact: 'holy_cast' },
    params: { stunDur: 5, healPct: 0.08, healMax: 3, end: 1.0, chain: 0.1, move: 0.2, stagger: 14, proc: 1, weight: 2 },
  });
  add({
    id: 'paladin_ret_execution', classId: 'paladin', spec: 'paladin_retribution', name: 'İdam Hükmü (Execution Sentence)', icon: I('skill-meteor-impact'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Hedefe 20 metreden %300 kutsal hasar patlaması gönderirsin; 10 metre içindeki düşmanlar da aynı hasarı alır ve hedef 10 saniye hükümlü kalır. İki Işık Çekici açar. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.373, targeting: 'target_instant', behavior: 'splash_strike', range: 20, arc: 0,
    damage: { coef: 3.0, type: 'holy' }, statuses: [{ status: 'sentenced', duration: 10, magnitude: 0.3 }],
    selfStatuses: [{ status: 'hammer_window', duration: 12, stacks: 2 }], offGcd: true, tags: ['offgcd', 'major', 'holy', 'aoe'],
    vfx: { impact: 'judgement_pillar' }, sfx: { cast: 'holy_cast', impact: 'explosion' },
    params: { splashRadius: 10, splashMax: 8, splashMult: 1, end: 0.6, chain: 0.1, move: 0.15, stagger: 15, proc: 1, weight: 2 },
  });
}
