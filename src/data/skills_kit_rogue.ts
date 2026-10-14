/**
 * HAYDUT (rogue) skill rows, retail WoW Midnight layout per docs/WOW_ABILITY_MAP.md §15 and §16. Names are "Türkçe Ad (English)".
 * Owner: combat (data). Merged after data/skills.ts by Object.assign, so these rows are the only definition of each rogue id.
 * Keys (§16): LMB auto attack, 1 = rmb builder, 2 = q spender, 3 = e, 4 = r, 5 = s1 AoE, Q = s2, E = s3, R = s4, X/V/T = m45/m90/m180.
 * Extras without a WoW counterpart (the Simyacı healer rows) are removed. Shift+ rows have no bar slot (second bar, not in code yet).
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;
type Def = Partial<SkillDef> & Pick<SkillDef, 'id' | 'classId' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;
const KIT: Record<string, SkillDef> = {};
function add(d: Def): void {
  KIT[d.id] = { unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, tags: [], ...d } as SkillDef;
}

// ======================================================================================================
// Class-level (all specs): LMB chain, Shadowstep, Kick, Vanish, Feint, Cloak, Kidney Shot, utilities
// ======================================================================================================
const BASIC_NAME = 'Oto Saldırı (Auto Attack)';
const BASIC_ICON = I('skill-quick-slash');
add({
  id: 'rogue_basic_1', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Oto saldırının ilk hançer kesiği. Her vuruş 3 enerji verir.',
  anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.408, targeting: 'melee_arc', range: 2.4, arc: 120,
  damage: { coef: 0.85, type: 'physical' }, tags: ['melee', 'basic'], vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.76, chain: 0.03, move: 0.1, stagger: 2, proc: 0.7, cp: 0, gain: 3, weight: 0, upper: 1, lunge: 0.6, slow: 0.35, step: 1 },
});
add({
  id: 'rogue_basic_2', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Çaprazlama ikinci kesik. Kombo Puanı kazandırır.',
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
  id: 'rogue_basic_4', classId: 'rogue', name: BASIC_NAME, icon: BASIC_ICON, desc: 'Kanatan bitirici saplama: kanama bırakır ve Kombo Puanı verir.',
  anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.35, hitTime: 0.512, targeting: 'melee_arc', range: 2.9, arc: 50,
  damage: { coef: 1.7, type: 'physical' }, knockback: 0.6, statuses: [{ status: 'bleed', duration: 3, magnitude: 0.25 }],
  tags: ['melee', 'basic', 'finisher', 'bleed'], vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.05, move: 0.15, stagger: 6, proc: 1, cp: 1, gain: 3, weight: 1, root: 1, lunge: 1.0, step: 4, finisher: 1 },
});

// Gölge Adımı (Shadowstep): off-GCD, enemy or ally target within 25 m, 2 charges / 30 s, lands behind the target
add({
  id: 'rogue_shadow_step', classId: 'rogue', name: 'Gölge Adımı (Shadowstep)', icon: I('skill-shadow-step'), unlockLevel: 1, defaultSlot: 's2',
  desc: '25 m içindeki bir hedefin (düşman ya da müttefik) arkasına ışınlanırsın; 2 yük, 30 sn. 2 sn boyunca %70 daha hızlı koşarsın.',
  cost: 0, cooldown: 30, charges: 2, castTime: 0, offGcd: true, anim: 'Dodge_Forward', animSpeed: 1.0, hitTime: 0.08,
  targeting: 'custom', range: 25,
  selfStatuses: [{ status: 'iframes', duration: 0.2 }, { status: 'shadowstep_haste', duration: 2 }, { status: 'behind_grace', duration: 1 }],
  tags: ['offgcd', 'movement', 'shadow', 'teleport'], vfx: { cast: 'shadow_burst', impact: 'stealth_smoke', trail: 'shadowstep_streak' }, sfx: { cast: 'whoosh' },
  behavior: 'kit_shadow_step', params: { end: 0.3, chain: 0.0, move: 0.0, weight: 0, offset: 1.2 },
});

// Tekme (Kick): interrupt, 15 s
add({
  id: 'rogue_kick', classId: 'rogue', name: 'Tekme (Kick)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 's4',
  desc: '3 metre içindeki büyü yapan bir düşmanı tekmelersin: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç). Bekleme 15 sn.',
  cost: 0, cooldown: 15, castTime: 0, offGcd: true, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5, hitTime: 0.2,
  targeting: 'melee_arc', range: 3, arc: 120, behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
});

// Kaybol (Vanish): major stealth, 180 s, T (m180) on the rogue specs that carry it
add({
  id: 'rogue_vanish', classId: 'rogue', name: 'Kaybol (Vanish)', icon: I('skill-smoke-bomb'), unlockLevel: 15, defaultSlot: 'm180',
  desc: '3 saniye gizlenirsin ve tehdidin %50 düşer. Suikastçıda ayrıca 6 saniye Gelişmiş Gırtlak Kesme kazanırsın.',
  cost: 0, cooldown: 180, castTime: 0, offGcd: true, anim: 'Dodge_Backward', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'stealth', duration: 3 }, { status: 'improved_garrote', duration: 6 }],
  tags: ['major', 'stealth', 'offgcd'], vfx: { cast: 'stealth_smoke' }, sfx: { cast: 'whoosh' }, params: { major: 180, threatDown: 0.5 },
});

// Aldatma (Feint): defensive, 2 charges / 15 s. E (s3) on the Suikastçı and Outlaw bars
add({
  id: 'rogue_feint', classId: 'rogue', name: 'Aldatma (Feint)', icon: I('skill-shadow-step'), unlockLevel: 15,
  desc: '6 saniye boyunca alanlı saldırılardan %40, diğerlerinden %15 daha az hasar alırsın. 2 yük, 15 sn.',
  cost: 20, cooldown: 15, charges: 2, castTime: 0, offGcd: true, anim: 'Dodge_Backward', animSpeed: 1.6, hitTime: 0.1, targeting: 'self_buff',
  selfStatuses: [{ status: 'feint', duration: 6 }], tags: ['buff', 'defensive', 'offgcd'],
  vfx: { cast: 'shadow_burst' }, sfx: { cast: 'whoosh' }, params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
});

// Böbrek Vuruşu (Kidney Shot): combo-point stun. Duration 1 + 0.5 per point (cap 5 points)
add({
  id: 'rogue_kidney_shot', classId: 'rogue', name: 'Böbrek Vuruşu (Kidney Shot)', icon: I('skill-quick-slash'), unlockLevel: 10,
  desc: 'Kombo Puanlarını harcayarak hedefi sersemletirsin: 1 sn + puan başına 0,5 sn. Shift+ çubuğunda.',
  cost: 25, cooldown: 20, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.4, targeting: 'custom', range: 3, arc: 60,
  damage: { coef: 0.3, type: 'physical' }, statuses: [{ status: 'stun', duration: 1 }], behavior: 'kit_finisher',
  tags: ['melee', 'finisher', 'cc'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 4, weight: 2, mode: 0, base: 0.3, perCp: 0.2, minCp: 1, maxCp: 5, maxTargets: 1, durPerCp: 0.5, root: 1 },
});

// Gölge Pelerini (Cloak of Shadows) is a class row in data/skills_class_utils_other.ts (renamed there). Shift+ only.

// Gizlenme (Stealth): out-of-combat stealth, Shift+. Breaks on attack like the other stealth rows.
add({
  id: 'rogue_stealth', classId: 'rogue', name: 'Gizlenme (Stealth)', icon: I('skill-smoke-bomb'), unlockLevel: 1,
  desc: 'Gizlenirsin. Hareket hızın sabit kalır; saldırınca ya da hasar alınca gizlenme kırılır. Shift+ çubuğunda.',
  cost: 0, cooldown: 2, castTime: 0, anim: 'Dodge_Backward', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'stealth', duration: 30 }], tags: ['buff', 'stealth'], vfx: { cast: 'stealth_smoke' }, sfx: { cast: 'whoosh' },
  params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
});

// Koşu (Sprint): +70 % movement for 8 s, Shift+
add({
  id: 'rogue_sprint', classId: 'rogue', name: 'Koşu (Sprint)', icon: I('skill-shadow-step'), unlockLevel: 5,
  desc: '8 saniye boyunca hareket hızın %70 artar. Bekleme 60 sn. Shift+ çubuğunda.',
  cost: 0, cooldown: 60, castTime: 0, anim: 'Dodge_Forward', animSpeed: 1.2, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'sprint', duration: 8 }], tags: ['buff', 'movement'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'whoosh' },
  params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
});

// Kaçınma (Evasion): dodge chance for 10 s, Shift+
add({
  id: 'rogue_evasion', classId: 'rogue', name: 'Kaçınma (Evasion)', icon: I('skill-shadow-step'), unlockLevel: 12,
  desc: '10 saniye boyunca kaçınma şansın %50 artar. Bekleme 90 sn. Shift+ çubuğunda.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Dodge_Backward', animSpeed: 1.2, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'evasion', duration: 10 }], tags: ['buff', 'defensive'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'whoosh' },
  params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
});

// Kızıl Şişe (Crimson Vial): self absorb 4 s (the heal is wired as an absorb, see rogueKit), Shift+
add({
  id: 'rogue_crimson_vial', classId: 'rogue', name: 'Kızıl Şişe (Crimson Vial)', icon: I('skill-consecration'), unlockLevel: 10,
  desc: 'Bir iksir içerek 4 saniye boyunca emilim kalkanı kazanırsın. Bekleme 30 sn. Shift+ çubuğunda.',
  cost: 0, cooldown: 30, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.3, targeting: 'self_buff', behavior: 'kit_crimson_vial',
  tags: ['defensive', 'heal'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'potion_use' },
  params: { end: 0.6, chain: 0.1, move: 0.1, absorbCoef: 1.2, absorbDur: 4 },
});

// ======================================================================================================
// Suikastçı (rogue_assassin), docs/WOW_ABILITY_MAP.md §15.1
// ======================================================================================================
add({
  id: 'rogue_mutilate', classId: 'rogue', spec: 'rogue_assassin', name: 'Sakatlama (Mutilate)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'İki hançer darbesiyle zehir bırakır ve 2 Kombo Puanı kazandırır.',
  cost: 18, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.35, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.85, type: 'physical' }, statuses: [{ status: 'poison', duration: 12, magnitude: 0.18, stacks: 1 }],
  tags: ['melee', 'spec', 'poison'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 4, cp: 2, weight: 0 },
});
add({
  id: 'rogue_envenom', classId: 'rogue', spec: 'rogue_assassin', name: 'Zehirleme (Envenom)', icon: I('skill-poison-dagger'), unlockLevel: 1, defaultSlot: 'q',
  desc: 'Tüm Kombo Puanlarını harcarsın. Hasar 0,8 + 0,38 x puan. Karanlık Gece aktifken hasar 2 katına çıkar ve 2 puan geri verir.',
  cost: 15, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.5, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.8, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher', 'spec', 'poison'],
  vfx: { trail: 'slash_arc_big', impact: 'poison_burst' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 2, mode: 0, base: 0.8, perCp: 0.38, minCp: 1, maxCp: 5, maxTargets: 1, darkMul: 2, darkRefund: 2 },
});
add({
  id: 'rogue_garrote', classId: 'rogue', spec: 'rogue_assassin', name: 'Gırtlak Kesme (Garrote)', icon: I('skill-poison-dagger'), unlockLevel: 6, defaultSlot: 'e',
  desc: 'Düşmanın boğazını keser: 18 saniye kanama bırakır ve 1 Kombo Puanı kazandırır. Gizlenmişken ya da Gelişmiş Gırtlak Kesme ile kullanılırsa 3 saniye susturur.',
  cost: 20, cooldown: 6, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.5, hitTime: 0.4, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.35, type: 'physical' }, statuses: [{ status: 'garrote', duration: 18, magnitude: 1.35 }],
  tags: ['melee', 'bleed', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 4, cp: 1, weight: 0 },
});
add({
  id: 'rogue_rupture', classId: 'rogue', spec: 'rogue_assassin', name: 'Yırtma (Rupture)', icon: I('skill-poison-dagger'), unlockLevel: 10, defaultSlot: 'r',
  desc: 'Tüm Kombo Puanlarını harcayarak kanama bırakırsın: süre 8 + 4 x puan saniye, her puan başına 0,84 kanama.',
  cost: 12, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.5, targeting: 'custom', range: 3.0, arc: 60,
  // The finisher's coefficient is also the bleed's applying coefficient (dps = coef x magnitude / duration): coef 0 left the bleed at
  // the 0.5 floor. coef 1.0 makes the bleed total 0.84 x CP (4.2 at 5 CP, the §6d budget row).
  damage: { coef: 1.0, type: 'physical' }, statuses: [{ status: 'rupture', duration: 8, magnitude: 0.84 }], behavior: 'kit_finisher',
  tags: ['melee', 'finisher', 'spec', 'bleed'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 2, weight: 1, mode: 0, base: 1.0, perCp: 0, minCp: 1, maxCp: 5, maxTargets: 1, durPerCp: 4, magPerCp: 1 },
});
add({
  id: 'rogue_fan_of_knives', classId: 'rogue', spec: 'rogue_assassin', name: 'Bıçak Yelpazesi (Fan of Knives)', icon: I('skill-fan-of-knives'), unlockLevel: 6, defaultSlot: 's1',
  desc: 'Çevrene bıçak yağdırır ve her düşmana zehir bırakırsın. Vurduğun her düşman için 1 Kombo Puanı (en çok 5).',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.6, targeting: 'self_aoe', radius: 8,
  damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'poison', duration: 6, magnitude: 0.18, stacks: 1 }],
  tags: ['aoe', 'poison', 'projectile', 'spec'], vfx: { cast: 'poison_burst', impact: 'poison_burst', projectile: 'dagger_projectile' }, sfx: { cast: 'dagger_throw' },
  behavior: 'fan', params: { end: 0.96, chain: 0.08, move: 0.15, stagger: 6, proc: 0.7, cpPerTarget: 1, cpMax: 5, weight: 1, slow: 0.5, knives: 12 },
});
add({
  id: 'rogue_crimson_tempest', classId: 'rogue', spec: 'rogue_assassin', name: 'Kızıl Fırtına (Crimson Tempest)', icon: I('skill-blade-storm'), unlockLevel: 12,
  desc: 'Çevredeki düşmanlara kanama bırakan bir fırtına (Yırtma yerine, 3 veya daha fazla düşman varken). Her puan kanamayı artırır. Shift+ çubuğunda.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', radius: 8,
  // Bleed total = hit coefficient x magnitude: 1.2 x (1/3 per point) x 5 = 2.0 at 5 CP (§6 row "bleed 2.0 per target at 5 CP")
  damage: { coef: 1.2, type: 'physical' }, statuses: [{ status: 'rupture', duration: 8, magnitude: 0.3333 }], behavior: 'kit_finisher',
  replaces: { skill: 'rogue_rupture', whileStatus: 'aoe_mode' }, tags: ['aoe', 'finisher', 'spec', 'bleed'],
  vfx: { cast: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 1, mode: 1, base: 1.2, perCp: 0, minCp: 1, maxCp: 5, maxTargets: 8, radius: 8, durPerCp: 4, magPerCp: 1 },
});
add({
  id: 'rogue_kingsbane', classId: 'rogue', spec: 'rogue_assassin', name: 'Kral Belası (Kingsbane)', icon: I('skill-poison-dagger'), unlockLevel: 10, defaultSlot: 'm45',
  desc: '14 saniye boyunca zehir yığınları başına %10 daha fazla hasar veren bir zehir bırakırsın (en çok +%100). +1 Kombo Puanı.',
  cost: 25, cooldown: 45, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.4, targeting: 'melee_arc', range: 3.0, arc: 60,
  damage: { coef: 0.6, type: 'physical' }, statuses: [{ status: 'kingsbane', duration: 14, magnitude: 2.9 }],
  tags: ['major', 'melee', 'poison', 'spec'], vfx: { trail: 'slash_arc', impact: 'poison_burst' }, sfx: { cast: 'swing_heavy' },
  params: { major: 45, cp: 1, stagger: 4, weight: 1, dmgPerPoisonPct: 0.1, dmgPerPoisonCap: 1.0 },
});
add({
  id: 'rogue_deathmark', classId: 'rogue', spec: 'rogue_assassin', name: 'Ölüm İşareti (Deathmark)', icon: I('skill-assassinate'), unlockLevel: 20, defaultSlot: 'm90',
  desc: 'Hedefi 16 saniye işaretlersin: Gırtlak Kesme, Yırtma ve zehir hasarın %75 artar. Karanlık Gece kazanırsın.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.2, hitTime: 0.3, targeting: 'melee_arc', range: 5, arc: 60,
  statuses: [{ status: 'deathmark', duration: 16 }], selfStatuses: [{ status: 'darkest_night', duration: 16 }],
  tags: ['major', 'offensive', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'whisper' }, params: { major: 90, dmgMul: 1.75 },
});

// ======================================================================================================
// Outlaw (rogue_outlaw): Kalleş Darbe builder, Tabanca Atışı, Dilimleme, Gözler Arası finisher, Katliam
// Not in the talent trees yet (no GDD_TALENTS raw tree): the spec is not pickable until one is generated.
// ======================================================================================================
add({
  id: 'rogue_sinister_strike', classId: 'rogue', spec: 'rogue_outlaw', name: 'Kalleş Darbe (Sinister Strike)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'Düşmana hızlı bir kesik atarsın ve 1 Kombo Puanı kazandırırsın.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.35, targeting: 'melee_arc', range: 2.8, arc: 60,
  damage: { coef: 0.9, type: 'physical' }, tags: ['melee', 'spec', 'builder'], vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 4, cp: 1, weight: 0 },
});
add({
  id: 'rogue_crossbow_shot', classId: 'rogue', spec: 'rogue_outlaw', name: 'Tabanca Atışı (Pistol Shot)', icon: I('skill-piercing-shot'), unlockLevel: 3, defaultSlot: 'q',
  desc: 'Tabancanla atış yaparsın: 1 Kombo Puanı kazandırır. Fırsat (Opportunity) aktifken daha fazla hasar verir.',
  cost: 15, cooldown: 0, castTime: 0, anim: '1H_Ranged_Shoot', animSpeed: 1.1, hitTime: 0.32, targeting: 'projectile', range: 30, speed: 45, radius: 0.3, count: 1, pierce: 1,
  damage: { coef: 1.1, type: 'physical' }, tags: ['projectile', 'ranged', 'physical', 'spec', 'builder'],
  vfx: { projectile: 'bolt_projectile', impact: 'hit_spark', cast: 'hit_spark' }, sfx: { cast: 'crossbow_shot' },
  params: { end: 0.64, chain: 0.08, move: 0.15, stagger: 5, proc: 1, cp: 1, weight: 0, upper: 1, slow: 0.5, crossbow: 1 },
});
add({
  id: 'rogue_dispatch', classId: 'rogue', spec: 'rogue_outlaw', name: 'Kesin Darbe (Dispatch)', icon: I('skill-eviscerate'), unlockLevel: 6,
  desc: 'Tüm Kombo Puanlarını harcayarak hedefe ağır bir darbe indirirsin. Her puan hasarı artırır.',
  cost: 25, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.45, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.7, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher', 'spec'],
  vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 2, mode: 0, base: 0.7, perCp: 0.35, minCp: 1, maxCp: 5, maxTargets: 1, root: 1 },
});
add({
  id: 'rogue_slice_and_dice', classId: 'rogue', spec: 'rogue_outlaw', name: 'Dilimleme (Slice and Dice)', icon: I('skill-eviscerate'), unlockLevel: 3, defaultSlot: 'e',
  desc: 'Kombo Puanlarını harcayarak 6 saniye + puan başına 3 saniye boyunca hasarını ve saldırı hızını artıran bir dilimleme kazanırsın.',
  cost: 25, cooldown: 0, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff', behavior: 'kit_buff_finisher',
  selfStatuses: [{ status: 'slice_and_dice', duration: 6 }], tags: ['buff', 'finisher', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
  params: { end: 0.6, chain: 0.1, move: 0.1, weight: 0, minCp: 1, maxCp: 5, base: 6, perCp: 3 },
});
add({
  id: 'rogue_between_the_eyes', classId: 'rogue', spec: 'rogue_outlaw', name: 'Gözler Arası (Between the Eyes)', icon: I('skill-assassinate'), unlockLevel: 1, defaultSlot: 'r',
  desc: 'Kombo Puanlarını harcayarak hedefe ağır bir darbe indirir ve 4 saniye sersemletirsin (boss hariç).',
  cost: 30, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.45, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.6, type: 'physical' }, statuses: [{ status: 'stun', duration: 4 }], behavior: 'kit_finisher',
  tags: ['melee', 'finisher', 'spec', 'cc'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 8, weight: 2, mode: 0, base: 0.6, perCp: 0.4, minCp: 1, maxCp: 5, maxTargets: 1, root: 1 },
});
add({
  id: 'rogue_roll_the_bones', classId: 'rogue', spec: 'rogue_outlaw', name: 'Zar At (Roll the Bones)', icon: I('skill-shadow-step'), unlockLevel: 10,
  desc: '30 saniye boyunca bir rastgele avantaj kazanırsın: saldırı hızı +%10. Shift+ çubuğunda.',
  cost: 25, cooldown: 0, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff',
  selfStatuses: [{ status: 'roll_the_bones', duration: 30 }], tags: ['buff', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
  params: { end: 0.6, chain: 0.1, move: 0.1, weight: 0 },
});
add({
  id: 'rogue_blade_flurry', classId: 'rogue', spec: 'rogue_outlaw', name: 'Bıçak Fırtınası (Blade Flurry)', icon: I('skill-blade-storm'), unlockLevel: 12, defaultSlot: 's1',
  desc: '12 saniye boyunca saldırı hızın %20 artar.',
  cost: 0, cooldown: 30, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'blade_flurry', duration: 12 }], tags: ['buff', 'spec', 'aoe'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
  params: { end: 0.6, chain: 0.1, move: 0.1, weight: 0 },
});
add({
  id: 'rogue_adrenaline_rush', classId: 'rogue', spec: 'rogue_outlaw', name: 'Adrenalin Dürtüsü (Adrenaline Rush)', icon: I('skill-battle-shout'), unlockLevel: 10, defaultSlot: 'm45',
  desc: '20 saniye boyunca enerji yenilenmesi %100, saldırı hızı %30 artar.',
  cost: 0, cooldown: 180, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'adrenaline_rush', duration: 20 }], tags: ['major', 'offensive', 'buff', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 45 },
});
add({
  id: 'rogue_killing_spree', classId: 'rogue', spec: 'rogue_outlaw', name: 'Katliam (Killing Spree)', icon: I('skill-blade-storm'), unlockLevel: 20, defaultSlot: 'm90',
  desc: '10 saniye boyunca verdiğin hasar %20 artar.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'killing_spree', duration: 10 }], tags: ['major', 'offensive', 'buff', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
});

// ======================================================================================================
// Gölge (rogue_subtlety), docs/WOW_ABILITY_MAP.md §15.2
// ======================================================================================================
add({
  id: 'rogue_backstab', classId: 'rogue', spec: 'rogue_subtlety', name: 'Sırttan Bıçak (Backstab)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 'rmb',
  desc: 'Önündeki düşmana bıçağını saplarsın. Arkadan vurursan oyunun arka vuruş bonusu uygulanır. Gizlenmişken kullanırsan Zayıflık Bulma kazanırsın. 1 Kombo Puanı.',
  cost: 16, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', range: 3.0, arc: 45,
  damage: { coef: 0.9, type: 'physical' }, behavior: 'kit_backstab', tags: ['melee', 'backstab', 'spec'],
  vfx: { trail: 'slash_arc', impact: 'backstab_mark' }, sfx: { cast: 'backstab' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 8, cp: 1, weight: 0 },
});
add({
  id: 'rogue_shadowstrike', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Vuruşu (Shadowstrike)', icon: I('skill-shadow-step'), unlockLevel: 10,
  desc: 'Gizlenmişken hedefin arkasına ışınlanıp vurursun: %25 daha fazla hasar, 2 Kombo Puanı ve 10 sn Zayıflık Bulma. Shift+ çubuğunda.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 2.0, hitTime: 0.3, targeting: 'custom', range: 25,
  damage: { coef: 1.4, type: 'physical' }, behavior: 'kit_shadowstrike', tags: ['melee', 'backstab', 'spec', 'teleport'],
  replaces: { skill: 'rogue_backstab', whileStatus: 'stealth' },
  selfStatuses: [{ status: 'find_weakness', duration: 10 }, { status: 'behind_grace', duration: 1 }],
  vfx: { cast: 'shadow_burst', impact: 'crit_finisher_slash', trail: 'shadowstep_streak' }, sfx: { cast: 'backstab' },
  params: { end: 0.6, chain: 0.1, move: 0.15, stagger: 8, cp: 2, stealthMore: 1.25, weight: 0 },
});
add({
  id: 'rogue_eviscerate', classId: 'rogue', spec: 'rogue_subtlety', name: 'İnfaz (Eviscerate)', icon: I('skill-eviscerate'), unlockLevel: 1, defaultSlot: 'q',
  desc: 'Tüm Kombo Puanlarını harcarsın. Her puan hasarı artırır: 0,5 + 0,38 x puan.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.512, targeting: 'custom', range: 3.0, arc: 60,
  damage: { coef: 0.5, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher'],
  vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 8, weight: 2, mode: 0, base: 0.5, perCp: 0.38, minCp: 1, maxCp: 6, maxTargets: 1, root: 1, lunge: 0.8 },
});
add({
  id: 'rogue_black_powder', classId: 'rogue', spec: 'rogue_subtlety', name: 'Kara Barut (Black Powder)', icon: I('skill-eviscerate'), unlockLevel: 10,
  desc: 'Çevrendeki düşmanları patlatan toz bombası. Her puan hasarı artırır. Shift+ çubuğunda; 3 veya daha fazla düşman varken.',
  cost: 20, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', radius: 6,
  damage: { coef: 0.4, type: 'physical' }, behavior: 'kit_finisher', tags: ['aoe', 'finisher', 'spec'],
  replaces: { skill: 'rogue_eviscerate', whileStatus: 'aoe_mode' },
  vfx: { cast: 'smoke_zone', impact: 'slash_arc_big' }, sfx: { cast: 'explosion' },
  params: { end: 0.96, chain: 0.08, move: 0.18, stagger: 6, weight: 2, mode: 1, base: 0.4, perCp: 0.32, minCp: 1, maxCp: 6, maxTargets: 8, radius: 6 },
});
add({
  id: 'rogue_secret_technique', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gizli Teknik (Secret Technique)', icon: I('skill-assassinate'), unlockLevel: 20, defaultSlot: 'r',
  desc: 'Hedefe üç vuruş ve iki gölge kopyasıyla saldırırsın. Her puan hasarı artırır; çevredeki düşmanlara da patlama vurur.',
  cost: 24, cooldown: 25, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.45, targeting: 'custom', range: 3.0,
  damage: { coef: 1.0, type: 'physical' }, behavior: 'kit_finisher', tags: ['melee', 'finisher', 'spec', 'clones'],
  vfx: { cast: 'shadow_burst', impact: 'crit_finisher_slash' }, sfx: { cast: 'swing_heavy' },
  params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 8, weight: 2, mode: 2, base: 1.0, perCp: 0.75, minCp: 1, maxCp: 6, explodeRadius: 6, explodePct: 0.4 },
});
add({
  id: 'rogue_shadow_dance', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Dansı (Shadow Dance)', icon: I('skill-shadow-step'), unlockLevel: 20, defaultSlot: 's3',
  desc: '6 saniye boyunca gizlenirsin; bu sürede gizlenme kırılmaz. Sırttan Bıçak yerine Gölge Vuruşu kullanırsın.',
  cost: 0, cooldown: 20, charges: 1, castTime: 0, offGcd: true, anim: 'Throw', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'shadow_veil_cd', duration: 6 }, { status: 'stealth', duration: 6 }],
  tags: ['buff', 'stealth', 'offgcd', 'spec'], vfx: { cast: 'stealth_smoke' }, sfx: { cast: 'whoosh' },
  params: { end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
});
add({
  id: 'rogue_shuriken_storm', classId: 'rogue', spec: 'rogue_subtlety', name: 'Shuriken Fırtınası (Shuriken Storm)', icon: I('skill-fan-of-knives'), unlockLevel: 1, defaultSlot: 's1',
  desc: 'Çevrene shuriken yağdırırsın. Vurduğun her düşman için 1 Kombo Puanı kazanırsın (en çok 5).',
  cost: 24, cooldown: 0, castTime: 0, anim: 'Throw', animSpeed: 1.8, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
  damage: { coef: 1.0, type: 'physical' }, behavior: 'fan', tags: ['aoe', 'projectile', 'spec'],
  vfx: { cast: 'shadow_burst', impact: 'hit_spark', projectile: 'dagger_projectile' }, sfx: { cast: 'dagger_throw' },
  params: { end: 0.96, chain: 0.08, move: 0.15, stagger: 6, proc: 0.7, cpPerTarget: 1, cpMax: 5, weight: 1, slow: 0.5, knives: 10 },
});
add({
  id: 'rogue_goremaws_bite', classId: 'rogue', spec: 'rogue_subtlety', name: 'Kan Isırığı (Goremaw\'s Bite)', icon: I('skill-blade-storm'), unlockLevel: 10, defaultSlot: 'm45',
  desc: 'Hedefe ısırır: kanama bırakır. 14 saniye boyunca bitirici hamlelerin hasarının %20\'si gölge hasarı olarak tekrarlanır. +2 Kombo Puanı.',
  cost: 16, cooldown: 45, castTime: 0, offGcd: true, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.4, hitTime: 0.4, targeting: 'melee_arc',
  range: 3, arc: 60, damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'bleed', duration: 14, magnitude: 1.2 }, { status: 'goremaw', duration: 14 }],
  tags: ['major', 'melee', 'bleed', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy' },
  params: { major: 45, cp: 2, stagger: 6, weight: 1 },
});
add({
  id: 'rogue_shadow_blades', classId: 'rogue', spec: 'rogue_subtlety', name: 'Gölge Bıçakları (Shadow Blades)', icon: I('skill-blade-storm'), unlockLevel: 10, defaultSlot: 'm90',
  desc: '16 saniye boyunca verdiğin hasar %20 artar. Bu sürede Kombo Puanı kazandıran vuruşlar fazladan 1 puan verir.',
  cost: 0, cooldown: 90, castTime: 0, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'shadow_blades', duration: 16 }], tags: ['major', 'offensive', 'buff', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
});
add({
  id: 'rogue_symbols_of_death', classId: 'rogue', spec: 'rogue_subtlety', name: 'Ölüm Sembolleri (Symbols of Death)', icon: I('skill-assassinate'), unlockLevel: 10, defaultSlot: 'm180',
  desc: '10 saniye boyunca verdiğin hasar %20 artar. Bekleme 120 sn.',
  cost: 0, cooldown: 120, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.2, targeting: 'self_buff',
  selfStatuses: [{ status: 'symbols_of_death', duration: 10 }], tags: ['major', 'offensive', 'buff', 'spec'],
  vfx: { cast: 'buff_aura' }, sfx: { cast: 'whisper' }, params: { major: 180 },
});

export const SKILLS_KIT_ROGUE: Record<string, SkillDef> = KIT;
