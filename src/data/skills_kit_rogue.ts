/**
 * KIT PK-ROGUE (docs/kits/casters-rogue.md §5, §7a, §g E2 / E3). Full rows of the rogue kit that replace the legacy rows of
 * data/skills.ts (merged after them by Object.assign). Owned by combat (data).
 * Done here: LMB chain retune, Gölge spec rows (Gölge Adımı v2, Sırttan Bıçak, Gölge Vuruşu, İnfaz, Kara Barut, Gizli Teknik,
 * Gölge Dansı, Shuriken Fırtınası) and the class-level Aldatma. Not yet: Suikastçı and Simyacı rows, Kan Isırığı, Kaybol, Tekme.
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;
type Def = Partial<SkillDef> & Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;
const KIT: Record<string, SkillDef> = {};
function add(d: Def): void {
  KIT[d.id] = { unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, tags: [], ...d } as SkillDef;
}

// ---- LMB chain (shared by all rogue specs): +3 energy per hit, combo point only on steps 2 and 4 (§5)
const BASIC_NAME = 'Hançer Kombosu';
const BASIC_ICON = I('skill-quick-slash');
add({
  id: 'rogue_basic_1', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Hızlı hançer kesiği.',
  anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.408, targeting: 'melee_arc', range: 2.4, arc: 120,
  damage: { coef: 0.85, type: 'physical' }, tags: ['melee', 'basic'], vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.76, chain: 0.03, move: 0.1, stagger: 2, proc: 0.7, cp: 0, gain: 3, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 1 },
});
add({
  id: 'rogue_basic_2', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Çaprazlama ikinci kesik.',
  anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.6, hitTime: 0.507, targeting: 'melee_arc', range: 2.4, arc: 100,
  damage: { coef: 0.85, type: 'physical' }, tags: ['melee', 'basic'], vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.82, chain: 0.03, move: 0.1, stagger: 2, proc: 0.7, cp: 1, gain: 3, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 2 },
});
add({
  id: 'rogue_basic_3', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Seri saplama.',
  anim: '1H_Melee_Attack_Stab', animSpeed: 2.0, hitTime: 0.56, targeting: 'melee_arc', range: 2.9, arc: 45,
  damage: { coef: 0.95, type: 'physical' }, tags: ['melee', 'basic'], vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.88, chain: 0.03, move: 0.1, stagger: 3, proc: 0.7, cp: 0, gain: 3, weight: 0, upper: 1, lunge: 1.0, slow: 0.35, step: 3 },
});
add({
  id: 'rogue_basic_4', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Kanatan bitirici saplama.',
  anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.35, hitTime: 0.512, targeting: 'melee_arc', range: 2.9, arc: 50,
  damage: { coef: 1.7, type: 'physical' }, knockback: 0.6, statuses: [{ status: 'bleed', duration: 3, magnitude: 0.25 }],
  tags: ['melee', 'basic', 'finisher', 'bleed'], vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.05, move: 0.15, stagger: 6, proc: 1, cp: 1, gain: 3, weight: 1, root: 1, lunge: 1.0, step: 4, finisher: 1 },
});

// ---- Gölge Adımı v2 (E3, §7e): off-GCD, enemy or ally target within 25 m, 2 charges / 30 s, lands behind the target
add({
  id: 'rogue_shadow_step', classId: 'rogue', name: 'Gölge Adımı', icon: I('skill-shadow-step'), unlockLevel: 3, defaultSlot: 's2',
  desc: '25 m içindeki bir hedefin (düşman ya da müttefik) arkasına ışınlanırsın; 2 yük, 30 sn. Hedefin arkasında 1,2 m mesafeye geçer, ardından 2 sn boyunca %70 daha hızlı koşarsın.',
  cost: 0, cooldown: 30, charges: 2, castTime: 0, offGcd: true, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.08,
  targeting: 'custom', range: 25,
  selfStatuses: [{ status: 'iframes', duration: 0.2 }, { status: 'shadowstep_haste', duration: 2 }, { status: 'behind_grace', duration: 1 }],
  tags: ['offgcd', 'movement', 'shadow', 'teleport'], vfx: { cast: 'shadow_burst', impact: 'stealth_smoke', trail: 'shadowstep_streak' }, sfx: { cast: 'whoosh' },
  behavior: 'kit_shadow_step', params: { end: 0.3, chain: 0.0, move: 0.0, weight: 0, offset: 1.2 },
});

// ---- Sırttan Bıçak (§7a): the rear bonus is Combat's game-wide rule; no extra multiplier here (legacy x1.8 stealth factor dropped)
add({
  id: 'rogue_backstab', classId: 'rogue', spec: 'rogue_subtlety', name: 'Sırttan Bıçak', icon: I('skill-quick-slash'), unlockLevel: 10, defaultSlot: 'rmb',
  desc: 'Önündeki düşmana bıçağını saplarsın. Arkadan vurursan oyunun arka vuruş bonusu uygulanır. Gizlenmişken kullanırsan Zayıflık Bulma kazanırsın. 1 Kombo Puanı.',
  cost: 16, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', range: 3.0, arc: 45,
  damage: { coef: 0.9, type: 'physical' }, behavior: 'kit_backstab', tags: ['melee', 'backstab', 'spec'],
  vfx: { trail: 'slash_arc', impact: 'backstab_mark' }, sfx: { cast: 'backstab' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 8, cp: 1, weight: 0 },
});

// ---- Gölge Vuruşu (§7a): replaces Sırttan Bıçak while stealthed; same placement as Gölge Adımı, +25 % damage, 2 CP
add({
  id: 'rogue_shadowstrike', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Vuruşu', icon: I('skill-shadow-step'), unlockLevel: 10,
  desc: 'Gizlenmişken hedefin arkasına ışınlanıp vurursun: %25 daha fazla hasar, 2 Kombo Puanı ve 10 sn Zayıflık Bulma.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 2.0, hitTime: 0.3, targeting: 'custom', range: 25,
  damage: { coef: 1.4, type: 'physical' }, behavior: 'kit_shadowstrike', tags: ['melee', 'backstab', 'spec', 'teleport'],
  replaces: { skill: 'rogue_backstab', whileStatus: 'stealth' },
  selfStatuses: [{ status: 'find_weakness', duration: 10 }, { status: 'behind_grace', duration: 1 }],
  vfx: { cast: 'shadow_burst', impact: 'crit_finisher_slash', trail: 'shadowstep_streak' }, sfx: { cast: 'backstab' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 8, cp: 2, stealthMore: 1.25, weight: 0 },
});

// ---- Finishers (E2 `finisher` behaviour; params.mode 0 = single target, 1 = area around the caster, 2 = clones)
add({
  id: 'rogue_eviscerate', classId: 'rogue', spec: 'rogue_subtlety', name: 'İnfaz', icon: I('skill-eviscerate'), unlockLevel: 10, defaultSlot: 'q',
  desc: 'Tüm Kombo Puanlarını harcarsın. Her puan hasarı artırır: 0,5 + 0,38 x puan.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.512, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.5, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher'],
  vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 8, weight: 2, mode: 0, base: 0.5, perCp: 0.38, minCp: 1, maxCp: 6, maxTargets: 1, root: 1, lunge: 0.8 },
});
add({
  id: 'rogue_black_powder', classId: 'rogue', spec: 'rogue_subtlety', name: 'Kara Barut', icon: I('skill-eviscerate'), unlockLevel: 10,
  desc: 'Çevrendeki düşmanları patlatan toz bombası. Her puan hasarı artırır. İnfaz yerine gelir, 3 veya daha fazla düşman varken.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', radius: 6,
  damage: { coef: 0.4, type: 'physical' }, behavior: 'kit_finisher', tags: ['aoe', 'finisher', 'spec'],
  replaces: { skill: 'rogue_eviscerate', whileStatus: 'aoe_mode' },
  vfx: { cast: 'smoke_zone', impact: 'slash_arc_big' }, sfx: { cast: 'explosion' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 2, mode: 1, base: 0.4, perCp: 0.32, minCp: 1, maxCp: 6, maxTargets: 8, radius: 6 },
});
add({
  id: 'rogue_secret_technique', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gizli Teknik', icon: I('skill-assassinate'), unlockLevel: 20, defaultSlot: 'r',
  desc: 'Hedefe üç vuruş ve iki gölge kopyasıyla saldırırsın. Her puan hasarı artırır; çevredeki düşmanlara da patlama vurur.',
  cost: 24, cooldown: 25, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.45, targeting: 'custom', range: 3.0,
  damage: { coef: 1.0, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher', 'spec', 'clones'],
  vfx: { cast: 'shadow_burst', impact: 'crit_finisher_slash' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 8, weight: 2, mode: 2, base: 1.0, perCp: 0.75, minCp: 1, maxCp: 6, explodeRadius: 6, explodePct: 0.4 },
});

// ---- Gölge Dansı (§7a): 6 s unbreakable stealth; stealth kept for the duration (PK-0 rule)
add({
  id: 'rogue_shadow_dance', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Dansı', icon: I('skill-shadow-step'), unlockLevel: 20, defaultSlot: 'e',
  desc: '6 saniye boyunca gizlenirsin; bu sürede gizlenme kırılmaz. Sırttan Bıçak yerine Gölge Vuruşu kullanırsın.',
  cost: 0, cooldown: 20, charges: 1, castTime: 0, offGcd: true, anim: 'Throw', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'shadow_veil_cd', duration: 6 }, { status: 'stealth', duration: 6 }],
  tags: ['buff', 'stealth', 'offgcd', 'spec'], vfx: { cast: 'stealth_smoke' }, sfx: { cast: 'whoosh' },
  params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
});

// ---- Shuriken Fırtınası (§7a): +1 CP per target (cap 5), radial throw (legacy 'fan' behaviour)
add({
  id: 'rogue_shuriken_storm', classId: 'rogue', spec: 'rogue_subtlety', name: 'Shuriken Fırtınası', icon: I('skill-fan-of-knives'), unlockLevel: 6, defaultSlot: 's1',
  desc: 'Çevrene shuriken yağdırırsın. Vurduğun her düşman için 1 Kombo Puanı kazanırsın (en çok 5).',
  cost: 24, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.8, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
  damage: { coef: 1.0, type: 'physical' }, behavior: 'fan', tags: ['aoe', 'projectile', 'spec'],
  vfx: { cast: 'shadow_burst', impact: 'hit_spark', projectile: 'dagger_projectile' }, sfx: { cast: 'dagger_throw' },
  params: { end: 0.96, chain: 0.08, move: 0.15, stagger: 6, proc: 0.7, cpPerTarget: 1, cpMax: 5, weight: 1, slow: 0.5, knives: 10 },
});

// ---- Aldatma (class skill, §5): 2 charges, off-GCD. The damage reduction is a Combat hook (not wired yet, see report).
add({
  id: 'rogue_feint', classId: 'rogue', name: 'Aldatma', icon: I('skill-shadow-step'), unlockLevel: 15, defaultSlot: 's3',
  desc: '6 saniye boyunca alanlı saldırılardan %40, diğerlerinden %15 daha az hasar alırsın. 2 yük, 15 sn.',
  cost: 20, cooldown: 15, charges: 2, castTime: 0, offGcd: true, anim: 'Dodge_Backward', animSpeed: 1.6, hitTime: 0.1, targeting: 'self_buff',
  selfStatuses: [{ status: 'feint', duration: 6 }], tags: ['buff', 'defensive', 'offgcd'],
  vfx: { cast: 'shadow_burst' }, sfx: { cast: 'whoosh' }, params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
});

// ======================================================================================================
// Shared majors and class-level rows (§5, §6a/§7a): Kaybol, Tekme (override), Kan Isırığı, Gölge Bıçakları
// ======================================================================================================
add({
  id: 'rogue_vanish', classId: 'rogue', name: 'Kaybol', icon: I('skill-smoke-bomb'), unlockLevel: 15, defaultSlot: 'm180',
  desc: '3 saniye gizlenirsin ve tehdidin %50 düşer. Suikastçıda ayrıca 6 saniye Gelişmiş Gırtlak Kesme kazanırsın.',
  cost: 0, cooldown: 180, castTime: 0, offGcd: true, anim: 'Dodge_Backward', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'stealth', duration: 3 }, { status: 'improved_garrote', duration: 6 }],
  tags: ['major', 'stealth', 'offgcd'], vfx: { cast: 'stealth_smoke' }, sfx: { cast: 'whoosh' }, params: { major: 180, threatDown: 0.5 },
});
add({
  id: 'rogue_kick', classId: 'rogue', name: 'Tekme', icon: I('skill-quick-slash'), unlockLevel: 10, defaultSlot: 's4',
  desc: '3 metre içindeki büyü yapan bir düşmanı tekmelersin: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç). Bekleme 15 sn.',
  cost: 0, cooldown: 15, castTime: 0, offGcd: true, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5, hitTime: 0.2,
  targeting: 'melee_arc', range: 3, arc: 120, behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
});
add({
  id: 'rogue_goremaws_bite', classId: 'rogue', spec: 'rogue_subtlety', name: 'Kan Isırığı', icon: I('skill-blade-storm'), unlockLevel: 10, defaultSlot: 'm45',
  desc: 'Hedefe ısırır: kanama bırakır. 14 saniye boyunca bitirici hamlelerin hasarının %20\'si gölge hasarı olarak tekrarlanır. +2 Kombo Puanı.',
  cost: 16, cooldown: 45, castTime: 0, offGcd: true, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.4, hitTime: 0.4, targeting: 'melee_arc',
  range: 3, arc: 60, damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'bleed', duration: 14, magnitude: 1.2 }, { status: 'goremaw', duration: 14 }],
  tags: ['major', 'melee', 'bleed', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { major: 45, cp: 2, stagger: 6, weight: 1 },
});
add({
  id: 'rogue_shadow_blades', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Bıçakları', icon: I('skill-blade-storm'), unlockLevel: 10, defaultSlot: 'm90',
  desc: '16 saniye boyunca verdiğin hasar %20 artar. Bu sürede Kombo Puanı kazandıran vuruşlar fazladan 1 puan verir.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'shadow_blades', duration: 16 }], tags: ['major', 'offensive', 'buff', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
});

// ======================================================================================================
// Suikastçı (rogue_assassin), docs/kits/casters-rogue.md §6a
// ======================================================================================================
add({
  id: 'rogue_mutilate', classId: 'rogue', spec: 'rogue_assassin', name: 'Sakatlama', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'İki hançer darbesiyle zehir bırakır ve 2 Kombo Puanı kazandırır.',
  cost: 18, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.35, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.85, type: 'physical' }, statuses: [{ status: 'poison', duration: 12, magnitude: 0.18, stacks: 1 }],
  tags: ['melee', 'spec', 'poison'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 4, cp: 2, weight: 0 },
});
add({
  id: 'rogue_envenom', classId: 'rogue', spec: 'rogue_assassin', name: 'Zehirleme', icon: I('skill-poison-dagger'), unlockLevel: 3, defaultSlot: 'q',
  desc: 'Tüm Kombo Puanlarını harcarsın. Hasar 0,8 + 0,38 x puan. Karanlık Gece aktifken hasar 2 katına çıkar ve 2 puan geri verir.',
  cost: 15, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.5, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.8, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher', 'spec', 'poison'],
  vfx: { trail: 'slash_arc_big', impact: 'poison_burst' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 2, mode: 0, base: 0.8, perCp: 0.38, minCp: 1, maxCp: 5, maxTargets: 1, darkMul: 2, darkRefund: 2 },
});
add({
  id: 'rogue_garrote', classId: 'rogue', spec: 'rogue_assassin', name: 'Gırtlak Kesme', icon: I('skill-poison-dagger'), unlockLevel: 6, defaultSlot: 'e',
  desc: 'Düşmanın boğazını keser: 18 saniye kanama bırakır ve 1 Kombo Puanı kazandırır. Gizlenmişken ya da Gelişmiş Gırtlak Kesme ile kullanılırsa 3 saniye susturur.',
  cost: 20, cooldown: 6, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.5, hitTime: 0.4, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.35, type: 'physical' }, statuses: [{ status: 'garrote', duration: 18, magnitude: 1.35 }],
  tags: ['melee', 'bleed', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 4, cp: 1, weight: 0 },
});
add({
  id: 'rogue_rupture', classId: 'rogue', spec: 'rogue_assassin', name: 'Yırtma', icon: I('skill-poison-dagger'), unlockLevel: 10, defaultSlot: 'r',
  desc: 'Tüm Kombo Puanlarını harcayarak kanama bırakırsın: süre 8 + 4 x puan saniye, her puan başına 0,84 kanama.',
  cost: 12, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.5, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0, type: 'physical' }, statuses: [{ status: 'rupture', duration: 8, magnitude: 0.84 }], behavior: 'kit_finisher',
  tags: ['melee', 'finisher', 'spec', 'bleed'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 2, weight: 1, mode: 0, base: 0, perCp: 0, minCp: 1, maxCp: 5, maxTargets: 1, durPerCp: 4, magPerCp: 1 },
});
add({
  id: 'rogue_crimson_tempest', classId: 'rogue', spec: 'rogue_assassin', name: 'Kızıl Fırtına', icon: I('skill-blade-storm'), unlockLevel: 12,
  desc: 'Çevredeki düşmanlara kanama bırakan bir fırtına (Yırtma yerine, 3 veya daha fazla düşman varken). Her puan kanamayı artırır.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', radius: 8,
  damage: { coef: 1.2, type: 'physical' }, statuses: [{ status: 'rupture', duration: 8, magnitude: 0.4 }], behavior: 'kit_finisher',
  replaces: { skill: 'rogue_rupture', whileStatus: 'aoe_mode' }, tags: ['aoe', 'finisher', 'spec', 'bleed'],
  vfx: { cast: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 1, mode: 1, base: 1.2, perCp: 0, minCp: 1, maxCp: 5, maxTargets: 8, radius: 8, durPerCp: 4, magPerCp: 1 },
});
add({
  id: 'rogue_fan_of_knives', classId: 'rogue', spec: 'rogue_assassin', name: 'Bıçak Yelpazesi', icon: I('skill-fan-of-knives'), unlockLevel: 12, defaultSlot: 's1',
  desc: 'Çevrene bıçak yağdırır ve her düşmana zehir bırakırsın. Vurduğun her düşman için 1 Kombo Puanı (en çok 5).',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.6, targeting: 'self_aoe', radius: 8,
  damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'poison', duration: 6, magnitude: 0.18, stacks: 1 }],
  tags: ['aoe', 'poison', 'projectile', 'spec'], vfx: { cast: 'poison_burst', impact: 'poison_burst', projectile: 'dagger_projectile' }, sfx: { cast: 'dagger_throw' },
  behavior: 'fan', params: { end: 0.96, chain: 0.08, move: 0.15, stagger: 6, proc: 0.7, cpPerTarget: 1, cpMax: 5, weight: 1, slow: 0.5, knives: 12 },
});
add({
  id: 'rogue_kingsbane', classId: 'rogue', spec: 'rogue_assassin', name: 'Kral Belası', icon: I('skill-poison-dagger'), unlockLevel: 10, defaultSlot: 'm45',
  desc: '14 saniye boyunca zehir yığınları başına %10 daha fazla hasar veren bir zehir bırakırsın (en çok +%100). +1 Kombo Puanı.',
  cost: 25, cooldown: 45, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.4, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.6, type: 'physical' }, statuses: [{ status: 'kingsbane', duration: 14, magnitude: 2.9 }],
  tags: ['major', 'melee', 'poison', 'spec'], vfx: { trail: 'slash_arc', impact: 'poison_burst' }, sfx: { cast: 'swing_heavy' },
  params: { major: 45, cp: 1, stagger: 4, weight: 1, dmgPerPoisonPct: 0.1, dmgPerPoisonCap: 1.0 },
});
add({
  id: 'rogue_deathmark', classId: 'rogue', spec: 'rogue_assassin', name: 'Ölüm İşareti', icon: I('skill-assassinate'), unlockLevel: 20, defaultSlot: 'm90',
  desc: 'Hedefi 16 saniye işaretlersin: Gırtlak Kesme, Yırtma ve zehir hasarın %75 artar. Karanlık Gece kazanırsın.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.2, hitTime: 0.3, targeting: 'melee_arc', range: 5, arc: 60,
  statuses: [{ status: 'deathmark', duration: 16 }], selfStatuses: [{ status: 'darkest_night', duration: 16 }],
  tags: ['major', 'offensive', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'whisper' }, params: { major: 90, dmgMul: 1.75 },
});

// ======================================================================================================
// Simyacı (rogue_alchemist), docs/kits/casters-rogue.md §8a. Legacy rows of the healer's behaviour keys (vial_heal, antidote,
// smoke_ward, mending, major_elixir) stay in data/skills.ts; the rows here are the new ones and the retuned throw.
// ======================================================================================================
add({
  id: 'rogue_acid_flask', classId: 'rogue', spec: 'rogue_alchemist', name: 'Asit Şişesi', icon: I('skill-throw-knife'), unlockLevel: 3, defaultSlot: 'rmb',
  desc: 'Hedefe asit şişesi atarsın: zehir bırakır ve Simya Bağı\'na hasar beslersin. Yaklaşık 1,2 saniye hazırlanır.',
  cost: 20, cooldown: 0, castTime: 1.2, anim: 'Throw', animSpeed: 1.3, hitTime: 1.2, targeting: 'target_projectile', range: 25, speed: 18, homing: 4,
  damage: { coef: 2.5, type: 'poison' }, statuses: [{ status: 'poison', duration: 6, magnitude: 0.18, stacks: 1 }],
  tags: ['projectile', 'spell', 'spec', 'poison'], vfx: { projectile: 'poison_projectile', impact: 'poison_burst' }, sfx: { cast: 'dagger_throw', impact: 'poison_impact' },
  params: { end: 0.9, chain: 0.1, move: 0.1 },
});
add({
  id: 'rogue_ward_potion', classId: 'rogue', spec: 'rogue_alchemist', name: 'Koruyucu İksir', icon: I('skill-mana-shield'), unlockLevel: 6, defaultSlot: 'e',
  desc: 'Bir müttefike koruyucu iksir verirsin: emilim kalkanı ve 15 saniye Simya Bağı. Kendine 12 saniye Köpüren Karışım verir.',
  cost: 25, cooldown: 7.5, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.3, targeting: 'custom', range: 30, allyTarget: 'friendly',
  behavior: 'kit_ward_potion', tags: ['shield', 'spec', 'heal'], vfx: { cast: 'shield_bubble', impact: 'shield_bubble' }, sfx: { cast: 'potion_use' },
  selfStatuses: [{ status: 'brew_boost', duration: 12 }],
  params: { end: 0.6, chain: 0.1, move: 0.1, absorbCoef: 1.5, linkDur: 15, absorbDur: 15 },
});
add({
  id: 'rogue_ascendant_brew', classId: 'rogue', spec: 'rogue_alchemist', name: 'Yüce Karışım', icon: I('skill-consecration'), unlockLevel: 30, defaultSlot: 'm180',
  desc: '6 saniye boyunca azami canının %60\'ı kadar emilim kalkanı alırsın ve kontrol edilemezsin.',
  cost: 0, cooldown: 180, castTime: 1.2, anim: 'Spellcast_Long', animSpeed: 1.0, hitTime: 1.2, targeting: 'custom', behavior: 'kit_ascendant',
  selfStatuses: [{ status: 'ascendant', duration: 6 }], tags: ['major', 'defensive', 'heal', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'potion_use' }, params: { major: 180, absorbPct: 0.6, dur: 6 },
});
add({
  id: 'rogue_haste_elixir', classId: 'rogue', name: 'Hızlandırıcı İksir', icon: I('skill-battle-shout'), unlockLevel: 99,
  desc: 'Haydut için kaldırıldı.', cost: 0, cooldown: 180, castTime: 0, anim: 'Throw', targeting: 'custom',
  behavior: 'major_hero', tags: ['major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'potion_use' }, params: { major: 180, range: 40, dur: 40, sated: 150 },
});

export const SKILLS_KIT_ROGUE: Record<string, SkillDef> = KIT;
