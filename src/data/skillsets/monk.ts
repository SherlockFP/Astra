/**
 * GDD_CLASSES_V2 §2.3–§2.4 Keşiş: monk_basic combo (4 steps) and the 8 core skills (NC10). Spec-bound rows are in monkSpecs.ts.
 * Numbers are the GDD's; `unlockLevel` deviates from the GDD on monk_chi_torpedo (L1, GDD L3) and monk_blackout_kick (L1, GDD L10)
 * so the level-1 bar has three usable skills (GDD §2 table lists only Kaplan Avucu at L1). Hit times marked † in the GDD are estimates.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const BASIC = 'Keşiş Kombosu (Auto Attack)';

export function registerMonk(add: SkillAdd): void {
  // ---- LMB chain (§2.3): 4 steps, Çi 1 / 1 / 0 / 1 (3 per full chain), weights 0 · 0 · 4 · 1 (4 = medium)
  add({
    id: 'monk_basic', classId: 'monk', name: BASIC, icon: I('skill-double-strike'), defaultSlot: 'lmb',
    desc: 'Yumruk ve tekmelerle dört vuruşluk bir kombo yaparsın. Üçüncü vuruş düşmanı havaya sıçratan bir tekme, sonuncusu çift avuç darbesidir. Vuruşlar Çi kazandırır.',
    anim: 'Unarmed_Melee_Attack_Punch_A', targeting: 'melee_arc', range: 2.5, arc: 90, tags: ['melee', 'basic', 'combo', 'unarmed'],
    behavior: 'combo', params: { steps: 4, reset: 0.8 },
  });
  add({
    id: 'monk_basic_1', classId: 'monk', name: 'Sert Yumruk (Jab)', icon: I('skill-double-strike'),
    desc: 'Kombonun ilk, hızlı yumruğu. Çi kazandırır.',
    anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.9, hitTime: 0.41, targeting: 'melee_arc', range: 2.5, arc: 90, knockback: 0.5,
    damage: { coef: 0.78, type: 'physical' }, pip: { id: 'chi', gain: 1 },
    tags: ['melee', 'basic', 'unarmed'], vfx: { trail: 'fist_trail', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.82, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 1 },
  });
  add({
    id: 'monk_basic_2', classId: 'monk', name: 'Çapraz Yumruk (Cross)', icon: I('skill-double-strike'),
    desc: 'İkinci, daha güçlü çapraz yumruk. Çi kazandırır.',
    anim: 'Unarmed_Melee_Attack_Punch_B', animSpeed: 1.85, hitTime: 0.5, targeting: 'melee_arc', range: 2.5, arc: 100, knockback: 0.7,
    damage: { coef: 0.82, type: 'physical' }, pip: { id: 'chi', gain: 1 },
    tags: ['melee', 'basic', 'unarmed'], vfx: { trail: 'fist_trail', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 2 },
  });
  add({
    id: 'monk_basic_3', classId: 'monk', name: 'Yükselen Tekme (Kick)', icon: I('skill-leap'),
    desc: 'Düşmanı havaya sıçratan orta ağırlıkta bir tekme. Yılan Tekmesi zincirinin çıkışıdır.',
    anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5, hitTime: 0.36, targeting: 'melee_arc', range: 3.0, arc: 80, knockback: 1.2,
    damage: { coef: 1.22, type: 'physical' },
    tags: ['melee', 'basic', 'unarmed', 'kick'], vfx: { trail: 'kick_arc', impact: 'chi_burst' }, sfx: { cast: 'swing_light', impact: 'kick_hit' },
    params: { end: 0.7, chain: 0.04, move: 0.1, stagger: 5, proc: 0.8, weight: 4, upper: 0, lunge: 0.9, slow: 0.45, step: 3, knockup: 0.45, kick: 1 },
  });
  add({
    id: 'monk_basic_4', classId: 'monk', name: 'Çift Avuç (Double Palm)', icon: I('skill-double-strike'),
    desc: 'Kombonun finali: çift avuçla yere vuran bir darbe; çevresinde halka ve toz yayar. Çi kazandırır.',
    anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.35, hitTime: 0.512, targeting: 'melee_arc', range: 3.0, arc: 70, knockback: 2.0,
    damage: { coef: 1.74, type: 'physical' }, pip: { id: 'chi', gain: 1 },
    tags: ['melee', 'basic', 'unarmed', 'finisher'], vfx: { trail: 'slash_arc_big', impact: 'palm_shock' }, sfx: { cast: 'swing_heavy', impact: 'punch_hit' },
    params: { end: 0.96, chain: 0.06, move: 0.2, stagger: 9, proc: 1, weight: 1, root: 1, lunge: 1.0, step: 4, finisher: 1, impactRadius: 1.7 },
  });

  // ---- Core skills (§2.4). Sv·Slot: level and default bar slot. Mal = cost (energy and/or Çi), BS = cooldown (s).
  add({
    id: 'monk_tiger_palm', classId: 'monk', name: 'Kaplan Avucu (Tiger Palm)', icon: I('skill-claw-strike'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Avucunla %220 hasar vurur ve 2 Çi kazanırsın.',
    cost: 20, cooldown: 0, castTime: 0, hitTime: 0.5, anim: 'Unarmed_Melee_Attack_Punch_B', animSpeed: 1.7,
    targeting: 'melee_arc', range: 2.8, arc: 100, damage: { coef: 2.2, type: 'physical' }, pip: { id: 'chi', gain: 2 },
    tags: ['melee', 'builder', 'unarmed'], vfx: { trail: 'fist_trail', impact: 'chi_burst' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.08, move: 0.18, stagger: 8, proc: 1, weight: 4, lunge: 1.0, slow: 0.6 },
  });
  // GDD L3; L1 here (see the file header)
  add({
    id: 'monk_chi_torpedo', classId: 'monk', name: 'Çi Torpidosu (Roll)', icon: I('skill-dash'), unlockLevel: 1, defaultSlot: 'q',
    desc: '12 metreye kadar Çi\'yle süzülür, yoldaki düşmanları iter ve varışta çevrene %160 hasar verirsin. Ardından 2.5 sn daha hızlı vurursun.',
    cost: 10, cooldown: 9, castTime: 0, hitTime: 0.4, anim: 'Running_A', animSpeed: 2.0,
    targeting: 'dash', range: 12, radius: 2.2, speed: 30, damage: { coef: 1.6, type: 'physical' }, knockback: 1.5,
    pip: { id: 'chi', gain: 1 }, selfStatuses: [{ status: 'chi_flow', duration: 2.5 }], behavior: 'monk_torpedo',
    tags: ['melee', 'movement', 'unarmed'], vfx: { trail: 'dragon_trail', impact: 'palm_shock' }, sfx: { cast: 'whoosh', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 18, proc: 1, weight: 2, pathCoef: 0.8, pathWidth: 1.6, speed: 30, unstoppable: 1, fit: 0 },
  });
  add({
    id: 'monk_spinning_crane', classId: 'monk', name: 'Dönen Turna Tekmesi (Spinning Crane Kick)', icon: I('skill-whirlwind'), unlockLevel: 1, defaultSlot: 'e',
    desc: '2 Çi harcayıp 1.5 sn boyunca dönerek çevrendeki herkese %55 hasarı 6 kez vurursun. Dönerken hareket edebilirsin.',
    cost: 0, cooldown: 6, castTime: 0, channel: 1.5, hitTime: 0.1, anim: '2H_Melee_Attack_Spinning', animSpeed: 1.0,
    targeting: 'custom', behavior: 'channel_aoe', radius: 3.2, damage: { coef: 0.55, type: 'physical' }, pip: { id: 'chi', cost: 2 },
    tags: ['melee', 'aoe', 'channel', 'unarmed'], vfx: { cast: 'spin_slash' }, sfx: { cast: 'whoosh' },
    params: { end: 0.3, chain: 0.1, stagger: 2, proc: 0.3, weight: 0, tick: 0.25, moveSlow: 0.5, immuneSlow: 1 },
  });
  add({
    id: 'monk_blackout_kick', classId: 'monk', name: 'Kara Tekme (Blackout Kick)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 's1',
    desc: '1 Çi harcayan ağır bir tekme: %300 hasar verir ve düşmanı geri iter.',
    cost: 15, cooldown: 2.5, castTime: 0, hitTime: 0.36, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.3,
    targeting: 'melee_arc', range: 3.0, arc: 120, damage: { coef: 3.0, type: 'physical' }, knockback: 1.2, pip: { id: 'chi', cost: 1 },
    // Fıçı Darbesi -> Kara Tekme within 3 s: -1.5 s on the Keg Smash cooldown (Demci loop)
    route: { from: ['monk_keg_smash'], window: 3, refund: { skill: 'monk_keg_smash', sec: 1.5 } },
    tags: ['melee', 'kick', 'spender', 'unarmed'], vfx: { trail: 'kick_arc', impact: 'chi_burst' }, sfx: { cast: 'swing_heavy', impact: 'kick_hit' },
    params: { end: 0.75, chain: 0.08, move: 0.18, stagger: 12, proc: 1, weight: 2, lunge: 1.0, root: 1, knockup: 0.3, kick: 1 },
  });
  add({
    id: 'monk_flying_serpent', classId: 'monk', name: 'Uçan Yılan Tekmesi (Flying Serpent Kick)', icon: I('skill-leap'), unlockLevel: 15, defaultSlot: 's2',
    desc: 'Hedefe doğru bir yılan gibi sıçrayıp inişte %260 hasar verirsin. Yükselen Tekme\'den hemen sonra kullanırsan %35 daha güçlüdür ve Çi harcamaz.',
    cost: 0, cooldown: 10, castTime: 0, hitTime: 0.55, anim: 'Jump_Full_Short', animSpeed: 1.0,
    targeting: 'leap', range: 12, radius: 3.5, duration: 0.55, damage: { coef: 2.6, type: 'physical' }, knockback: 1.5,
    statuses: [{ status: 'slow', duration: 2.5, magnitude: 0.3 }], pip: { id: 'chi', cost: 2 },
    // "Jab-Jab-Rising Kick -> Flying Serpent": within 1.4 s of the kick, +35 % and no Çi
    route: { from: ['monk_basic_3'], window: 1.4, more: 0.35, free: true },
    tags: ['melee', 'movement', 'kick', 'aoe'], vfx: { trail: 'dragon_trail', impact: 'palm_shock', ground: 'leap_land' }, sfx: { cast: 'jump', impact: 'kick_hit' },
    params: { end: 0.8, chain: 0.12, move: 0.2, stagger: 22, proc: 1, weight: 2, fit: 1, unstoppable: 1, knockup: 0.6, kick: 1 },
  });
  add({
    id: 'monk_chi_wave', classId: 'monk', name: 'Çi Dalgası (Chi Wave)', icon: I('skill-lightning-bolt'), unlockLevel: 20, defaultSlot: 's3',
    desc: 'Düşmanlar arasında 3 kez sekip her biri için %200 gizem hasarı veren bir Çi dalgası fırlatırsın. Bir Çi kazanırsın.',
    cost: 25, cooldown: 7, castTime: 0, hitTime: 0.373, anim: 'Spellcast_Shoot', animSpeed: 1.3,
    targeting: 'projectile', range: 18, speed: 20, radius: 0.7, count: 1, pierce: 0, behavior: 'chain_projectile',
    damage: { coef: 2.0, type: 'arcane' }, pip: { id: 'chi', gain: 1 },
    tags: ['spell', 'projectile', 'arcane', 'chi'], vfx: { projectile: 'chi_projectile', impact: 'chi_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 0.8, weight: 0, upper: 1, slow: 0.5, bounces: 3, bounceRange: 6.5, bounceMult: 0.9 },
  });
  // GDD slot is the bench ("kitap"): no defaultSlot, the player binds it
  add({
    id: 'monk_tigers_lust', classId: 'monk', name: "Kaplan Hırsı (Tiger's Lust)", icon: I('skill-berserk'), unlockLevel: 25,
    desc: '6 saniye boyunca %35 daha hızlı koşar, %15 daha hızlı vurur, yavaşlatma ve kök etkilerinden kurtulursun.',
    cost: 0, cooldown: 30, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.8,
    targeting: 'self_buff', behavior: 'monk_self', selfStatuses: [{ status: 'tigerlust', duration: 6 }], cleanses: ['slow', 'root'],
    tags: ['buff', 'movement'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'buff' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 0, cleanse: 1, slow: 0.6 },
  });
  add({
    id: 'monk_fists_of_fury', classId: 'monk', name: 'Cennet Yumrukları (Fists of Fury)', icon: I('skill-blade-storm'), unlockLevel: 30, defaultSlot: 'r',
    desc: '3 Çi harcayarak 3 saniye boyunca önündeki düşmanlara yumruk yağdırırsın (10 vuruş), son vuruş %300 hasarla savurur. Bu sırada durdurulamazsın ve %30 daha az hasar alırsın.',
    cost: 0, cooldown: 60, castTime: 0, channel: 3.0, hitTime: 0.1, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 2.2,
    animCycle: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
    targeting: 'custom', behavior: 'monk_fists', range: 4.0, arc: 100, damage: { coef: 1.1, type: 'physical' }, pip: { id: 'chi', cost: 3 },
    selfStatuses: [{ status: 'fists_guard', duration: 3 }],
    tags: ['melee', 'aoe', 'channel', 'ultimate', 'unarmed'], vfx: { cast: 'chi_burst', impact: 'hit_spark' }, sfx: { cast: 'swing_heavy', impact: 'punch_hit' },
    // finalWeight 3 (ultimate) is written for the engine; channel_cone's finisher still reads heavy (see the monk report).
    // dr / threatMult are the talent bases (0 extra reduction, x1 threat); the 30 % itself is the fists_guard status.
    params: { end: 0.3, chain: 0.2, tick: 0.3, fixed: 1, unstoppable: 1, stagger: 3, proc: 0.25, weight: 0, finalCoef: 3.0, finalKnock: 4, finalStagger: 30, finalWeight: 3, moveSlow: 0.1, dr: 0, threatMult: 1 },
  });
  // Kargı Eli Vuruşu (Spear Hand Strike): the class interrupt, shared by Demci and Rüzgâr Yürüyen (interrupt behaviour, as in utilities.ts)
  add({
    id: 'monk_spear_hand_strike', classId: 'monk', name: 'Kargı Eli Vuruşu (Spear Hand Strike)', icon: I('skill-thrust'), unlockLevel: 1,
    desc: '5 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye boyunca aynı okulun büyülerini yapmasını engeller (boss: yalnızca büyü kesilir). 15 saniye bekleme.',
    cost: 0, cooldown: 15, castTime: 0, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'target_instant', range: 5, behavior: 'interrupt', offGcd: true,
    tags: ['offgcd', 'melee', 'kick', 'unarmed'], vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'interrupt' },
    params: { lockout: 3 },
  });
}
