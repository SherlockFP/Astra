/**
 * Paladin class rows: the Koruma / Ceza weapon chain `paladin_basic` (+ steps) and the rows shared by two or three specs
 * (Yargı, Gazap Çekici, Haçlı Darbesi, Tapınakçı Kılıcı, İntikamcı Kalkan, İlahi Binek, Işığın Sözü, İntikam Kanatları, Şifa Eli).
 * PM-PA (docs/kits/plate-melee.md §5-§7, f1c; behaviour map: docs/kits/paladin_behaviors.md). The kit file wins over GDD_CLASSES_V2 §4.
 * Spec-only rows live in paladinSpecs.ts (Koruma, Ceza) and paladinHoly.ts (Kutsal). Per-spec numbers of shared ids come from
 * SpecDef.mods (data/specs_paladin.ts): Avenging Wrath cooldown / magnitude, Yargı charges + coefficient, Gazap Çekici coefficient,
 * Işığın Sözü heal / HoT, İntikamcı Kalkan taunt.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd, SkillInput } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPaladin(add: SkillAdd): void {
  // ======================================================================================================
  // Kutsal Zincir (Koruma + Ceza): Σ 2.50 (G1), faith +3/+3/+4/+6, +1 Kutsal Güç on steps 3 and 4 (2 per chain)
  // ======================================================================================================
  add({
    id: 'paladin_basic', classId: 'paladin', name: 'Kutsal Zincir', icon: I('skill-sword-slash'), defaultSlot: 'lmb',
    desc: 'Kılıç, kalkan ve kutsal ışıkla dört vuruşluk bir zincir yaparsın. Son iki vuruş kutsal hasar verir ve birer Kutsal Güç kazandırır.',
    anim: '1H_Melee_Attack_Slice_Horizontal', targeting: 'melee_arc', range: 2.6, arc: 140, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.85 },
  });
  add({
    id: 'paladin_basic_1', classId: 'paladin', name: 'Yemin Kesiği', icon: I('skill-sword-slash'),
    desc: 'Geniş yatay kılıç darbesi.', anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.4, hitTime: 0.427, targeting: 'melee_arc',
    range: 2.6, arc: 140, damage: { coef: 0.4, type: 'physical' }, knockback: 0.5, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.75, chain: 0.04, move: 0.1, stagger: 3, gain: 3, proc: 0.8, weight: 0, upper: 1, lunge: 0.7, slow: 0.45, step: 1 },
  });
  add({
    id: 'paladin_basic_2', classId: 'paladin', name: 'Kalkan Yumruğu', icon: I('skill-shield-bash'),
    desc: 'Kalkanınla önündekilere yumruk atarsın.', anim: 'Block_Attack', animSpeed: 1.5, hitTime: 0.427, targeting: 'melee_arc',
    range: 2.4, arc: 80, damage: { coef: 0.4, type: 'physical' }, knockback: 0.7, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc', impact: 'block_spark' }, sfx: { cast: 'swing_light', impact: 'shield_bash' },
    params: { end: 0.64, chain: 0.04, move: 0.1, stagger: 3, gain: 3, proc: 0.8, weight: 0, upper: 1, lunge: 0.5, slow: 0.5, step: 2 },
  });
  add({
    id: 'paladin_basic_3', classId: 'paladin', name: 'Kutsal Saplama', icon: I('skill-thrust'),
    desc: 'İleri atılarak yapılan kutsal saplama. 1 Kutsal Güç kazandırır.', anim: '1H_Melee_Attack_Stab', animSpeed: 1.75, hitTime: 0.56,
    targeting: 'melee_arc', range: 3.4, arc: 55, damage: { coef: 0.65, type: 'holy' }, knockback: 1.2, tags: ['melee', 'basic', 'holy'],
    pip: { id: 'holypower', gain: 1 }, vfx: { trail: 'holy_slash', impact: 'holy_burst' }, sfx: { cast: 'swing_light', impact: 'holy_impact' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 5, gain: 4, proc: 0.9, weight: 4, upper: 0, lunge: 1.3, slow: 0.5, step: 3 },
  });
  add({
    id: 'paladin_basic_4', classId: 'paladin', name: 'Kutsal Balyoz', icon: I('skill-hammer-of-justice'),
    desc: 'Tüm gücüyle yapılan ağır kutsal balyoz darbesi. 1 Kutsal Güç kazandırır.', anim: '1H_Melee_Attack_Chop', animSpeed: 1.15, hitTime: 0.448,
    targeting: 'melee_arc', range: 3.1, arc: 100, damage: { coef: 1.05, type: 'holy' }, knockback: 2.0, tags: ['melee', 'basic', 'holy', 'finisher'],
    pip: { id: 'holypower', gain: 1 }, vfx: { trail: 'slash_arc_big', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'hammer_hit' },
    params: { end: 0.85, chain: 0.06, move: 0.2, stagger: 9, gain: 6, proc: 1, weight: 1, root: 1, lunge: 0.8, step: 4, finisher: 1, impactRadius: 1.4 },
  });

  // ======================================================================================================
  // Shared builders: Yargı (Koruma e, Ceza r), Gazap Çekici (its transforms), Haçlı Darbesi / Tapınakçı Kılıcı (Ceza)
  // ======================================================================================================
  add({
    id: 'paladin_judgement', classId: 'paladin', name: 'Yargı', icon: I('skill-smite'), unlockLevel: 1,
    desc: 'Hedefe %160 kutsal hasar verir, 10 saniye boyunca %10 daha az hasar vermesini sağlarsın ve 1 Kutsal Güç kazanırsın. İki yük, her biri 12 saniyede dolar. İntikam Kanatları sırasında ya da hedef canının %20\'sinin altındayken Gazap Çekici\'ne dönüşür. 4 İnanç harcarsın.',
    cost: 4, cooldown: 12, charges: 2, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.373, targeting: 'target_projectile',
    range: 20, speed: 55, radius: 0.4, homing: 6, damage: { coef: 1.6, type: 'holy' }, statuses: [{ status: 'judged', duration: 10 }],
    pip: { id: 'holypower', gain: 1 }, tags: ['spell', 'holy', 'projectile', 'builder'],
    vfx: { projectile: 'holy_projectile', impact: 'judgement_pillar' }, sfx: { cast: 'holy_cast', impact: 'holy_impact' },
    params: { end: 0.65, chain: 0.08, move: 0.15, stagger: 6, proc: 1, weight: 0, upper: 1, slow: 0.5, threatMult: 1.5 },
  });
  const hammerOfWrath: SkillInput = {
    id: 'paladin_hammer_of_wrath', classId: 'paladin', name: 'Gazap Çekici', icon: I('skill-hammer-of-justice'), unlockLevel: 15,
    desc: 'Hedefe %400 kutsal hasarlı bir çekiç fırlatırsın ve 1 Kutsal Güç kazanırsın. Yalnızca İntikam Kanatları sırasında ya da hedef canının %20\'sinin altındayken kullanılır (Koruma\'da %280). İki yük, her biri 8 saniyede dolar.',
    cost: 0, cooldown: 8, charges: 2, castTime: 0, anim: 'Throw', animSpeed: 1.4, hitTime: 0.615, targeting: 'target_projectile', behavior: 'hammer_of_wrath',
    range: 22, speed: 36, radius: 0.6, homing: 6, damage: { coef: 4.0, type: 'holy' }, pip: { id: 'holypower', gain: 1 },
    replaces: { skill: 'paladin_judgement', whileStatus: 'wrath_wings' }, tags: ['spell', 'holy', 'projectile', 'builder'],
    vfx: { projectile: 'holy_hammer', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'hammer_hit' },
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 25, proc: 1, weight: 2, threshold: 0.2 },
  };
  add(hammerOfWrath);
  // `replaces` holds one whileStatus: the exec_window (target < 20 % HP) transform is a second row on the same behaviour
  add({
    ...hammerOfWrath, id: 'paladin_hammer_of_wrath_exec', name: 'Gazap Çekici',
    replaces: { skill: 'paladin_judgement', whileStatus: 'exec_window' },
  });
  add({
    id: 'paladin_crusader_strike', classId: 'paladin', name: 'Haçlı Darbesi', icon: I('skill-quick-slash'), unlockLevel: 1,
    desc: 'Önündeki düşmana %100 kutsal hasar verir, 1 Kutsal Güç kazandırır ve 4 saniye boyunca Tapınakçı Kılıcı\'nı açar. 6 saniye bekleme. 5 İnanç harcarsın.',
    cost: 5, cooldown: 6, castTime: 0, anim: '1H_Melee_Attack_Slice_Diagonal', animSpeed: 1.35, hitTime: 0.38, targeting: 'target_instant', range: 2.8,
    damage: { coef: 1.0, type: 'holy' }, pip: { id: 'holypower', gain: 1 }, tags: ['melee', 'holy', 'builder'],
    vfx: { trail: 'holy_slash', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy', impact: 'holy_impact' },
    params: { end: 0.7, chain: 0.06, move: 0.15, stagger: 10, proc: 1, weight: 4, lunge: 0.9, slow: 0.6 },
  });
  add({
    id: 'paladin_templar_slash', classId: 'paladin', spec: 'paladin_retribution', name: 'Tapınakçı Kılıcı', icon: I('skill-double-strike'), unlockLevel: 10,
    desc: 'Haçlı Darbesi\'nden sonraki 4 saniye içinde onun yerine geçer: %60 kutsal hasar verir ve bedavadır.',
    cost: 0, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.5, hitTime: 0.427, targeting: 'target_instant', range: 2.8,
    damage: { coef: 0.6, type: 'holy' }, replaces: { skill: 'paladin_crusader_strike', whileStatus: 'templar_combo' }, tags: ['melee', 'holy'],
    vfx: { trail: 'holy_slash', impact: 'holy_burst' }, sfx: { cast: 'swing_light', impact: 'holy_impact' },
    params: { end: 0.7, chain: 0.06, move: 0.15, stagger: 6, proc: 1, weight: 0, lunge: 0.6, slow: 0.6 },
  });

  // ======================================================================================================
  // Shared utility / tank rows
  // ======================================================================================================
  add({
    id: 'paladin_avengers_shield', classId: 'paladin', name: 'İntikamcı Kalkan', icon: I('skill-shield-bash'), unlockLevel: 10,
    desc: 'Kalkanını fırlatırsın: üç düşmana sekerek her birine %240 kutsal hasar verir, vurduğu düşmanların büyüsünü keser ve 3 saniye susturur. Koruma\'da ilk hedefi 3 saniye kışkırtır (patron: 2 saniye). 15 saniye bekleme. 5 İnanç harcarsın.',
    cost: 5, cooldown: 15, castTime: 0, anim: 'Throw', animSpeed: 1.5, hitTime: 0.615, targeting: 'target_projectile', behavior: 'avengers_shield',
    range: 30, speed: 22, radius: 0.9, homing: 9, damage: { coef: 2.4, type: 'holy' }, tags: ['spell', 'holy', 'projectile', 'taunt', 'kick'],
    vfx: { projectile: 'holy_projectile', impact: 'block_spark' }, sfx: { cast: 'swing_light', impact: 'shield_bash' },
    params: { bounces: 2, bounceRange: 7, bounceMult: 1, silence: 3, lock: 4, tauntDur: 3, bossTauntDur: 2, tauntFirst: 1, threatMult: 2, end: 0.95, chain: 0.1, move: 0.2, stagger: 8, proc: 0.7, weight: 0, slow: 0.6 },
  });
  add({
    id: 'paladin_divine_steed', classId: 'paladin', name: 'İlahi Binek', icon: I('skill-dash'), unlockLevel: 6, defaultSlot: 's2',
    desc: '10 metre atılırsın, köklerden ve yavaşlatmalardan kurtulursun ve 3 saniye boyunca hareket hızın %40 artar. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Running_A', animSpeed: 2.0, targeting: 'dash', behavior: 'divine_steed', range: 10, duration: 0.4, hitTime: 0.4, offGcd: true,
    selfStatuses: [{ status: 'divine_steed', duration: 3 }], cleanses: ['root', 'slow'], tags: ['offgcd', 'movement', 'holy'],
    vfx: { trail: 'charge_trail', cast: 'holy_burst' }, sfx: { cast: 'whoosh' }, params: { end: 0.9, chain: 0.1, move: 0.15, speed: 30, unstoppable: 1, fit: 0, trail: 3 },
  });
  add({
    id: 'paladin_word_of_glory', classId: 'paladin', name: 'Işığın Sözü', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Seçili ya da en yaralı müttefiki (yoksa kendini) %260 iyileştirirsin; hedefin eksik canı kadar daha güçlü olur. Kendine uygulayınca 5 İnanç geri kazanırsın. 3 Kutsal Güç harcar; Parlak Işık varken bedavadır. (Kutsal: %140 şifa + 12 saniyelik yenilenme.)',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.95, targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly',
    heal: { coef: 2.6 }, pip: { id: 'holypower', cost: 3 }, tags: ['spell', 'holy', 'heal', 'spender'],
    vfx: { cast: 'holy_beam', impact: 'heal_pillar' }, sfx: { cast: 'holy_cast' },
    params: { missingHpBonus: 1, selfRefund: 5, end: 1.0, chain: 0.1, move: 0.2, weight: 0 },
  });
  add({
    id: 'paladin_avenging_wrath', classId: 'paladin', name: 'İntikam Kanatları', icon: I('skill-war-cry'), unlockLevel: 10, defaultSlot: 'm90',
    desc: '20 saniye kanatlanırsın: hasarın, şifan ve kritik şansın %15 artar; Yargı, Gazap Çekici\'ne dönüşür. 90 saniye bekleme (Koruma: %10 ve 45 saniye; Ceza: ayrıca iki Işık Çekici açılır).',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'wrath_wings', duration: 20, magnitude: 0.15 }], tags: ['offgcd', 'major', 'offensive', 'buff', 'holy'],
    vfx: { cast: 'wings_aura' }, sfx: { cast: 'war_cry' }, params: { end: 0.9, chain: 0.15, move: 0.2, weight: 3 },
  });
  add({
    id: 'paladin_lay_on_hands', classId: 'paladin', name: 'Şifa Eli', icon: I('skill-prayer'), unlockLevel: 25,
    desc: 'Seçili müttefikin (yoksa en yaralının) canını tamamen yeniler. Hedef 90 saniye boyunca Cezalandırıldı olur. 120 saniye bekleme.',
    cost: 0, cooldown: 120, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.95, targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly',
    heal: { coef: 0 }, statuses: [{ status: 'forbearance', duration: 90 }], tags: ['spell', 'holy', 'heal', 'defensive'],
    vfx: { cast: 'holy_beam', impact: 'heal_pillar' }, sfx: { cast: 'holy_cast' },
    params: { healPct: 1, forbearance: 1, end: 1.0, chain: 0.1, move: 0.2, weight: 0 },
  });
}
