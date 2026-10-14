/**
 * Nekromant class rows (Death Knight kits): the Ordu Efendisi weapon chain `necro_basic` (+ steps), the Kemik Muhafızı weapon chain
 * `necro_blood_basic` (+ steps) and the four rows shared by both specs (Ölüm Atılışı, Büyü Karşıtı Kalkan, Zihin Dondurma, Buz Gibi Sebat).
 * PM-NE (docs/kits/plate-melee.md §8-§9, f1d; behaviour map: docs/kits/necromancer_behaviors.md). The kit file wins over GDD_CLASSES_V2 §5.
 * Spec-only rows live in necromancerSpecs.ts. Chains are Σ 2.50 (G1): 0.45 / 0.45 / 0.55 / 1.05. Öz (Runic Power) gains are
 * `params.gain` (chain steps are multiplied by resourceGainPct); the rune pip is TALENT_PIPS.rune (no class `secondary` row).
 * Retired GDD_CLASSES_V2 rows (necro_bone_spear, necro_raise_skeleton, ...) were never defined; necro_soul_snap / necro_spirit_walk stay
 * in skills_class_utils_necromancer.ts, unslotted.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerNecromancer(add: SkillAdd): void {
  // ======================================================================================================
  // Kemik Kırıntıları (necro_basic): Ordu Efendisi / class chain. Steps 1-2 bone shards, 3 staff thrust, 4 ground burst.
  // Öz +3 / +3 / +4 / 0. Ani Kıyamet 12 % per step 3 is a spec fx row (specs_necromancer.ts).
  // ======================================================================================================
  add({
    id: 'necro_basic', classId: 'necromancer', name: 'Kemik Kırıntıları', icon: I('skill-bone-spear'), defaultSlot: 'lmb',
    desc: 'Asandan iki kemik kıymığı fırlatır, ardından asanla saplar ve yerden kemik patlatırsın. Her vuruş Öz kazandırır.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 22, tags: ['spell', 'basic', 'combo', 'shadow'],
    behavior: 'combo', params: { steps: 4, reset: 0.8 },
  });
  add({
    id: 'necro_basic_1', classId: 'necromancer', name: 'Kemik Kıymığı', icon: I('skill-bone-spear'),
    desc: 'İlk kemik kıymığı.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'target_projectile',
    range: 22, speed: 32, radius: 0.35, count: 1, pierce: 0, damage: { coef: 0.45, type: 'shadow' }, knockback: 0.5,
    tags: ['spell', 'basic', 'projectile', 'shadow'], vfx: { projectile: 'bone_projectile', impact: 'hit_magic' },
    sfx: { cast: 'bone_cast', impact: 'shadow_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 3, gain: 3, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 1, hand: 0 },
  });
  add({
    id: 'necro_basic_2', classId: 'necromancer', name: 'Kemik Kıymığı', icon: I('skill-bone-spear'),
    desc: 'İkinci kemik kıymığı.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'target_projectile',
    range: 22, speed: 32, radius: 0.35, count: 1, pierce: 0, damage: { coef: 0.45, type: 'shadow' }, knockback: 0.7,
    tags: ['spell', 'basic', 'projectile', 'shadow'], vfx: { projectile: 'bone_projectile', impact: 'hit_magic' },
    sfx: { cast: 'bone_cast', impact: 'shadow_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 3, gain: 3, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 2, hand: 1 },
  });
  add({
    id: 'necro_basic_3', classId: 'necromancer', name: 'Ruh Mızrağı', icon: I('skill-thrust'),
    desc: 'Asanla ileri atılan gölge saplaması. Ani Kıyamet tetikleyebilir.', anim: '2H_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.56,
    targeting: 'melee_arc', range: 3.2, arc: 55, damage: { coef: 0.55, type: 'shadow' }, knockback: 1.2, tags: ['spell', 'basic', 'melee', 'shadow'],
    vfx: { trail: 'slash_arc', impact: 'hit_magic' }, sfx: { cast: 'swing_light', impact: 'shadow_impact' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 5, gain: 4, proc: 0.8, weight: 4, upper: 0, lunge: 1.0, slow: 0.5, step: 3 },
  });
  add({
    id: 'necro_basic_4', classId: 'necromancer', name: 'Kemik Patlaması', icon: I('skill-bone-spear'),
    desc: 'Asanı yere vurur ve önünde kemik patlatırsın: patlama çevresindeki düşmanlara da hasar verir.', anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.95,
    targeting: 'melee_arc', range: 3.6, arc: 70, damage: { coef: 1.05, type: 'physical' }, knockback: 2.0, tags: ['basic', 'melee', 'finisher', 'bone'],
    vfx: { trail: 'bone_burst', impact: 'death_bones' }, sfx: { cast: 'bone_cast', impact: 'bone_impact' },
    params: { end: 1.0, chain: 0.06, move: 0.2, stagger: 9, gain: 0, proc: 1, weight: 1, root: 1, lunge: 0.6, step: 4, finisher: 1, impactRadius: 2.4, knockup: 0.5 },
  });

  // ======================================================================================================
  // Kemik Orağı Kombosu (necro_blood_basic): Kemik Muhafızı spec basic, 2H skull-scythe staff, Öz +3 / +3 / +3 / +4
  // ======================================================================================================
  add({
    id: 'necro_blood_basic', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kemik Orağı Kombosu', icon: I('skill-sword-slash'), defaultSlot: 'lmb',
    desc: 'Kafatası başlı asanla dört vuruşluk bir kombo yaparsın. Her vuruş Öz kazandırır; son vuruş kemik patlatır.',
    anim: '2H_Melee_Attack_Slice', targeting: 'melee_arc', range: 3.0, arc: 140, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.85 },
  });
  add({
    id: 'necro_blood_basic_1', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kemik Orağı Kombosu', icon: I('skill-sword-slash'),
    desc: 'Geniş orak savurması.', anim: '2H_Melee_Attack_Slice', animSpeed: 1.5, hitTime: 0.44, targeting: 'melee_arc',
    range: 2.8, arc: 140, damage: { coef: 0.45, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.77, chain: 0.04, move: 0.12, stagger: 4, gain: 3, proc: 0.8, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 1 },
  });
  add({
    id: 'necro_blood_basic_2', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kemik Orağı Kombosu', icon: I('skill-sword-slash'),
    desc: 'Ters yönden ikinci orak savurması.', anim: '2H_Melee_Attack_Slice', animSpeed: 1.65, hitTime: 0.44, targeting: 'melee_arc',
    range: 2.8, arc: 120, damage: { coef: 0.45, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.77, chain: 0.04, move: 0.12, stagger: 4, gain: 3, proc: 0.8, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 2 },
  });
  add({
    id: 'necro_blood_basic_3', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kemik Orağı Kombosu', icon: I('skill-thrust'),
    desc: 'İleri atılan asa saplaması.', anim: '2H_Melee_Attack_Stab', animSpeed: 1.85, hitTime: 0.56, targeting: 'melee_arc',
    range: 3.4, arc: 90, damage: { coef: 0.55, type: 'physical' }, knockback: 0.8, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.96, chain: 0.04, move: 0.12, stagger: 5, gain: 3, proc: 0.8, weight: 0, upper: 0, lunge: 1.2, slow: 0.5, step: 3 },
  });
  add({
    id: 'necro_blood_basic_4', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kemik Orağı Kombosu', icon: I('skill-ground-slam'),
    desc: 'Yeri sarsan ağır kemik darbesi. Çevreye de hasar verir.', anim: '2H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.735, targeting: 'melee_arc',
    range: 3.2, arc: 120, damage: { coef: 1.05, type: 'physical' }, knockback: 1.8, tags: ['melee', 'basic', 'finisher', 'bone'],
    vfx: { trail: 'slash_arc_big', impact: 'bone_burst' }, sfx: { cast: 'swing_heavy', impact: 'bone_impact' },
    params: { end: 1.2, chain: 0.06, move: 0.22, stagger: 12, gain: 4, proc: 1, weight: 1, root: 1, lunge: 0.9, step: 4, finisher: 1, impactRadius: 1.8 },
  });

  // ======================================================================================================
  // Shared utility rows (Kemik Muhafızı s2 / s3 / s4 / m180 and Ordu Efendisi s2 / s3 / s4 / m180)
  // ======================================================================================================
  add({
    id: 'necro_deaths_advance', classId: 'necromancer', name: 'Ölüm Atılışı (Death’s Advance)', icon: I('skill-dash'), unlockLevel: 1, defaultSlot: 's2',
    desc: '6 saniye boyunca hareket hızın %40 artar ve geri savrulmaya bağışık olursun. 25 saniye bekleme.',
    cost: 0, cooldown: 25, castTime: 0, anim: 'Running_A', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'deaths_advance', duration: 6 }], tags: ['offgcd', 'movement', 'buff', 'shadow'],
    vfx: { cast: 'shadow_burst', trail: 'charge_trail' }, sfx: { cast: 'whoosh' }, params: { end: 0.6, chain: 0.05, move: 0.05, weight: 0 },
  });
  add({
    id: 'necro_anti_magic_shell', classId: 'necromancer', name: 'Büyü Karşıtı Kalkan (Anti-Magic Shell)', icon: I('skill-mana-shield'), unlockLevel: 15, defaultSlot: 's3',
    desc: '8 saniye boyunca büyü hasarının canının %30\'una kadarını emersin (fiziksel hasar emilmez). Emilen her %1 can için 1 Öz kazanırsın (en çok 20). 60 saniye bekleme.',
    cost: 0, cooldown: 60, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.6, targeting: 'self_buff', behavior: 'magic_shell', offGcd: true,
    selfStatuses: [{ status: 'anti_magic_shell', duration: 8 }], tags: ['offgcd', 'defensive', 'buff', 'shadow'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' }, params: { absorbPct: 0.3, rpPerPct: 1, rpCap: 20, end: 0.9, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'necro_mind_freeze', classId: 'necromancer', name: 'Zihin Dondurma (Mind Freeze)', icon: I('skill-ice-bolt'), unlockLevel: 1, defaultSlot: 's4',
    desc: '15 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye susturur (boss: yalnızca büyü kesilir). 15 saniye bekleme.',
    cost: 0, cooldown: 15, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2.0, hitTime: 0.2, targeting: 'target_instant', behavior: 'interrupt', range: 15, offGcd: true,
    tags: ['offgcd', 'spell', 'kick', 'frost'], vfx: { cast: 'frost_burst', impact: 'interrupt_burst' }, sfx: { cast: 'interrupt', impact: 'frost_impact' },
    params: { silence: 3, end: 0.5, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'necro_icebound_fortitude', classId: 'necromancer', name: 'Buz Gibi Sebat (Icebound Fortitude)', icon: I('skill-ice-block'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '8 saniye boyunca aldığın hasar %30 azalır ve sersemletme / korku gibi kontrol etkilerine bağışık olursun. 180 saniye bekleme.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'icebound', duration: 8 }], tags: ['offgcd', 'major', 'defensive', 'buff', 'frost'],
    vfx: { cast: 'frost_nova' }, sfx: { cast: 'ice_chime' }, params: { end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
}
