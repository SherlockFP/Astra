/**
 * İblis Avcısı class rows (AE-3, docs/kits/agile-evoker.md §3, WoW Midnight 12.0): the Fel Bıçakları weapon chain `demonhunter_basic`
 * (+ steps) and the rows shared by the specs: Kaos Darbesi / Yok Ediş, Bıçak Dansı / Ölüm Süpürmesi, Göz Işını, Yakıp Yok Etme Aurası, Fel Atılışı,
 * Bulanıklık, Bozucu, Metamorfoz, Av, Karanlık. The class skill list of data/classes.ts is the pre-spec level bar (Kaos Darbesi, Bıçak Dansı,
 * Göz Işını, Yakıp Yok Etme Aurası, Fel Atılışı, Bulanıklık, Bozucu, Metamorfoz). Kaos (Havoc) is the base row of every shared id; İntikam and Yutucu
 * change them through SpecDef.mods (data/specs_kit_demonhunter.ts). Spec-only rows live in demonhunterSpecs.ts.
 *
 * Numbers follow the §3.1 kit table (coefficients, costs and cooldowns on the 1.0 s GCD profile). Gazap (Fury) costs are `cost`
 * (negative = generates), the chain gives `params.gain` per landed step (multiplied by resourceGainPct). Behaviours: combat/skills/demonhunterKit.ts.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerDemonHunter(add: SkillAdd): void {
  // ======================================================================================================
  // Fel Bıçakları (demonhunter_basic): the dual-wield chain of Kaos and İntikam, Gazap +1 per landed step.
  // ======================================================================================================
  add({
    id: 'demonhunter_basic', classId: 'demonhunter', name: 'Fel Bıçakları', icon: I('skill-quick-slash'), defaultSlot: 'lmb',
    desc: 'İki hançerinle dört vuruşluk bir kombo yaparsın; her isabet Gazap kazandırır. Son vuruş çevreye dönerek doğrar.',
    anim: 'Dualwield_Melee_Attack_Slice', targeting: 'melee_arc', range: 2.6, arc: 120, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.8 },
  });
  add({
    id: 'demonhunter_basic_1', classId: 'demonhunter', name: 'Sağ Pençe', icon: I('skill-quick-slash'),
    desc: 'Sağ hançerle geniş bir kesik.', anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.408, targeting: 'melee_arc',
    range: 2.6, arc: 120, damage: { coef: 0.3, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'glaive_trail' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.72, chain: 0.05, move: 0.12, stagger: 3, gain: 1, proc: 0.7, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 1 },
  });
  add({
    id: 'demonhunter_basic_2', classId: 'demonhunter', name: 'Sol Pençe', icon: I('skill-quick-slash'),
    desc: 'Sol hançerle ters yönden kesik.', anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.5, hitTime: 0.507, targeting: 'melee_arc',
    range: 2.6, arc: 110, damage: { coef: 0.3, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'glaive_trail' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.85, chain: 0.05, move: 0.12, stagger: 3, gain: 1, proc: 0.7, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 2 },
  });
  add({
    id: 'demonhunter_basic_3', classId: 'demonhunter', name: 'Çapraz Saplama', icon: I('skill-thrust'),
    desc: 'İki hançeri birden öne saplarsın.', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.512, targeting: 'melee_arc',
    range: 3.2, arc: 60, damage: { coef: 0.38, type: 'shadow' }, knockback: 0.8, tags: ['melee', 'basic', 'shadow'],
    vfx: { trail: 'glaive_trail', impact: 'shadow_burst' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 5, gain: 1, proc: 0.8, weight: 0, lunge: 1.3, slow: 0.5, step: 3 },
  });
  add({
    id: 'demonhunter_basic_4', classId: 'demonhunter', name: 'İkiz Girdap', icon: I('skill-whirlwind'),
    desc: 'Etrafında dönerek iki hançerle çevreyi doğrarsın.', anim: '2H_Melee_Attack_Spin', animSpeed: 2.0, hitTime: 0.6, targeting: 'melee_arc',
    range: 3.0, arc: 360, damage: { coef: 0.7, type: 'shadow' }, knockback: 1.6, tags: ['melee', 'basic', 'finisher', 'shadow'],
    vfx: { trail: 'spin_slash', impact: 'shadow_burst' }, sfx: { cast: 'swing_heavy', impact: 'heavy_hit' },
    params: { end: 1.05, chain: 0.06, move: 0.2, stagger: 9, gain: 2, proc: 1, weight: 1, root: 1, step: 4, finisher: 1 },
  });

  // ======================================================================================================
  // Kaos Darbesi / Yok Ediş (rmb): Gazap harcayan ana vuruş; Metamorfoz'da Yok Ediş'e dönüşür
  // ======================================================================================================
  add({
    id: 'demonhunter_chaos_strike', classId: 'demonhunter', name: 'Kaos Darbesi', icon: I('skill-double-strike'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Önündeki düşmana iki hançerle %72 gölge hasarı verirsin (4 metre, gerekirse 3 metre atılır). 20 Gazap harcar. Metamorfoz sırasında Yok Ediş\'e dönüşür; Öz Kırılması penceresinde %60 daha çok vurur.',
    cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8, hitTime: 0.408, targeting: 'target_instant', range: 4,
    damage: { coef: 0.72, type: 'shadow' }, tags: ['melee', 'spender', 'shadow'],
    vfx: { cast: 'glaive_trail', impact: 'shadow_burst' }, sfx: { cast: 'swing_light', impact: 'fel_impact' },
    params: { end: 0.72, chain: 0.05, move: 0.12, stagger: 6, proc: 0.9, weight: 0, lunge: 1.0 },
  });
  add({
    id: 'demonhunter_annihilation', classId: 'demonhunter', name: 'Yok Ediş', icon: I('skill-claw-strike'), unlockLevel: 20,
    desc: 'Metamorfoz sırasında Kaos Darbesi\'nin yerine geçer: %94 gölge hasarı verir. 20 Gazap harcar.',
    cost: 20, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.6, hitTime: 0.507, targeting: 'target_instant', range: 4,
    damage: { coef: 0.94, type: 'shadow' }, replaces: { skill: 'demonhunter_chaos_strike', whileStatus: 'metamorphosis' },
    tags: ['melee', 'spender', 'shadow'], vfx: { cast: 'glaive_trail', impact: 'crit_burst' }, sfx: { cast: 'swing_heavy', impact: 'fel_impact' },
    params: { end: 0.85, chain: 0.05, move: 0.12, stagger: 8, proc: 1, weight: 1, lunge: 1.0 },
  });

  // ---- Bıçak Dansı / Ölüm Süpürmesi (q)
  add({
    id: 'demonhunter_blade_dance', classId: 'demonhunter', name: 'Bıçak Dansı', icon: I('skill-blade-storm'), unlockLevel: 3, defaultSlot: 'q',
    desc: 'Çevrendeki 6 metrelik alanda herkese %220 gölge hasarı verirsin. 18 Gazap harcar. 15 saniye bekleme. Metamorfoz sırasında Ölüm Süpürmesi\'ne dönüşür.',
    cost: 18, cooldown: 15, castTime: 0, anim: '2H_Melee_Attack_Spin', animSpeed: 1.8, hitTime: 0.6, targeting: 'self_aoe', radius: 6,
    damage: { coef: 2.2, type: 'shadow' }, tags: ['melee', 'aoe', 'spender', 'shadow'],
    vfx: { cast: 'spin_slash', impact: 'shadow_burst' }, sfx: { cast: 'swing_heavy', impact: 'fel_impact' },
    params: { end: 1.2, chain: 0.08, move: 0.2, stagger: 10, proc: 1, weight: 1, maxTargets: 8 },
  });
  add({
    id: 'demonhunter_death_sweep', classId: 'demonhunter', name: 'Ölüm Süpürmesi', icon: I('skill-whirlwind'), unlockLevel: 20,
    desc: 'Metamorfoz sırasında Bıçak Dansı\'nın yerine geçer: 7 metre içinde herkese %255 gölge hasarı verir. 18 Gazap harcar. 9 saniye bekleme.',
    cost: 18, cooldown: 9, castTime: 0, anim: '2H_Melee_Attack_Spin', animSpeed: 1.8, hitTime: 0.6, targeting: 'self_aoe', radius: 7,
    damage: { coef: 2.55, type: 'shadow' }, replaces: { skill: 'demonhunter_blade_dance', whileStatus: 'metamorphosis' },
    tags: ['melee', 'aoe', 'spender', 'shadow'], vfx: { cast: 'spin_slash', impact: 'shadow_burst' }, sfx: { cast: 'swing_heavy', impact: 'fel_impact' },
    params: { end: 1.2, chain: 0.08, move: 0.2, stagger: 12, proc: 1, weight: 1, maxTargets: 8 },
  });

  // ---- Göz Işını (e): 2.4 sn kanal, 20 m ışın; Kör Gazap sonunda +12 Gazap
  add({
    id: 'demonhunter_eye_beam', classId: 'demonhunter', name: 'Göz Işını', icon: I('skill-piercing-shot'), unlockLevel: 6, defaultSlot: 'e',
    desc: 'Gözlerinden 20 metrelik çift ışın yayarsın; 2.4 saniye boyunca yüzünü çevirdiğin yöne doğru saçılır ve çizgideki herkese toplam %620 gölge hasarı verir. Işın boyunca yavaşlarsın ama kontrole bağışıksın. 15 Gazap harcar, kanal tamamlanırsa 12 Gazap geri verir. 30 saniye bekleme. Girişim varken parlar.',
    cost: 15, cooldown: 30, castTime: 0, channel: 2.4, anim: 'Spellcast_Long', animSpeed: 1.2, hitTime: 0.25, targeting: 'custom', behavior: 'kit_dh_beam',
    range: 20, damage: { coef: 1.55, type: 'shadow' }, tags: ['spell', 'channel', 'aoe', 'shadow'],
    vfx: { cast: 'essence_beam', impact: 'shadow_burst' }, sfx: { cast: 'fel_cast', impact: 'fel_impact' },
    params: { end: 0.9, chain: 0, move: 0.1, stagger: 3, proc: 0.6, weight: 0, tick: 0.65, width: 2, furyEnd: 12, moveSlow: 0.7, unstoppable: 1, maxTargets: 5, fixed: 1 },
  });

  // ---- Yakıp Yok Etme Aurası (s1): 6 sn, çevrede yanar, +20 Gazap
  add({
    id: 'demonhunter_immolation_aura', classId: 'demonhunter', name: 'Yakıp Yok Etme Aurası', icon: I('skill-fire-nova'), unlockLevel: 1, defaultSlot: 's1',
    desc: 'Üzerinde 6 saniye süren bir ateş aurası yakarsın: 7 metre içindeki herkese toplam %265 ateş hasarı verir ve peşinden gelir. 20 Gazap kazandırır. İki yük, her biri 15 saniyede dolar.',
    cost: -20, cooldown: 15, charges: 2, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.55, targeting: 'custom', behavior: 'kit_dh_aura',
    radius: 7, damage: { coef: 0.44, type: 'fire', perTick: true }, tags: ['spell', 'aoe', 'fire', 'zone'],
    vfx: { cast: 'sigil_ground', ground: 'fire_ground', impact: 'hit_magic' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 2, proc: 0.3, weight: 0, ticks: 6, interval: 1, maxTargets: 8 },
  });

  // ---- Fel Atılışı (s2): 12 m, iki yük
  add({
    id: 'demonhunter_fel_rush', classId: 'demonhunter', name: 'Fel Atılışı', icon: I('skill-dash'), unlockLevel: 1, defaultSlot: 's2',
    desc: 'Baktığın yöne 12 metre atılırsın; yolundaki düşmanlara %70 gölge hasarı verirsin. İki yük, her biri 10 saniyede dolar.',
    cost: 0, cooldown: 10, charges: 2, castTime: 0, anim: 'Running_A', animSpeed: 2.2, hitTime: 0.3, targeting: 'dash', range: 12, radius: 2.5, duration: 0.3,
    damage: { coef: 0.35, type: 'shadow' }, offGcd: true, tags: ['offgcd', 'movement', 'shadow'],
    vfx: { cast: 'charge_trail', impact: 'shadow_burst' }, sfx: { cast: 'whoosh', impact: 'fel_impact' },
    params: { end: 0.55, chain: 0.05, move: 0.05, stagger: 4, proc: 0.4, weight: 0, speed: 40, pathCoef: 0.35, pathWidth: 2 },
  });

  // ---- Bulanıklık (s3)
  add({
    id: 'demonhunter_blur', classId: 'demonhunter', name: 'Bulanıklık', icon: I('skill-dodge-roll'), unlockLevel: 10, defaultSlot: 's3',
    desc: '10 saniye boyunca aldığın hasar %35 azalır ve kaçınma şansın %30 artar. 60 saniye bekleme, iki yük.',
    cost: 0, cooldown: 60, charges: 2, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.25, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'blur', duration: 10 }], tags: ['offgcd', 'defensive', 'buff', 'shadow'],
    vfx: { cast: 'buff_aura' }, sfx: { cast: 'blink' }, params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });

  // ---- Bozucu (s4): interrupt
  add({
    id: 'demonhunter_disrupt', classId: 'demonhunter', name: 'Bozucu', icon: I('skill-thrust'), unlockLevel: 10, defaultSlot: 's4',
    desc: '5 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye susturur (boss: yalnızca büyü kesilir). 15 saniye bekleme.',
    cost: 0, cooldown: 15, castTime: 0, anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.6, hitTime: 0.3, targeting: 'target_instant', behavior: 'interrupt', range: 5,
    offGcd: true, tags: ['offgcd', 'melee', 'kick'], vfx: { cast: 'kick_arc', impact: 'interrupt_burst' }, sfx: { cast: 'interrupt' },
    params: { silence: 3, end: 0.55, chain: 0.05, move: 0.1, weight: 0 },
  });

  // ---- Metamorfoz (m90): kanatlar, Kaos Darbesi / Bıçak Dansı dönüşür
  add({
    id: 'demonhunter_metamorphosis', classId: 'demonhunter', name: 'Metamorfoz', icon: I('skill-berserk'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Şeytani biçime bürünürsün: 24 saniye boyunca saldırı ve büyü hızın %25, maks. canın %15 artar; Kaos Darbesi Yok Ediş\'e, Bıçak Dansı Ölüm Süpürmesi\'ne dönüşür. Dönüşürken 5 metre içindekilere %265 gölge hasarı verirsin. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'kit_dh_metamorphosis', radius: 5,
    damage: { coef: 2.65, type: 'shadow' }, selfStatuses: [{ status: 'metamorphosis', duration: 24 }], offGcd: true,
    tags: ['offgcd', 'major', 'offensive', 'aoe', 'shadow'], vfx: { cast: 'fel_wings', impact: 'shadow_burst' }, sfx: { cast: 'demon_summon', impact: 'boss_roar' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 10, proc: 1, weight: 2, healMaxPct: 0.15 },
  });

  // ---- Av (m180, Kaos + Yutucu): hedefe atılır, 6 sn ek hasar
  add({
    id: 'demonhunter_the_hunt', classId: 'demonhunter', name: 'Av', icon: I('skill-leap'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '50 metre içindeki hedefe şimşek gibi atılır, %400 gölge hasarı verir ve hedefi 6 saniye boyunca toplam %395 gölge hasarıyla yakarsın. Sonrasında 10 saniye hasarın %10 artar. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.5, hitTime: 0.4, targeting: 'dash', behavior: 'kit_dh_hunt', range: 50, radius: 3, duration: 0.4,
    damage: { coef: 4.0, type: 'shadow' }, statuses: [{ status: 'the_hunt', duration: 6, magnitude: 0.99 }], selfStatuses: [{ status: 'exergy', duration: 10 }],
    offGcd: true, tags: ['offgcd', 'major', 'offensive', 'movement', 'shadow'], vfx: { cast: 'charge_trail', impact: 'shadow_burst' }, sfx: { cast: 'fel_cast', impact: 'fel_impact' },
    params: { end: 0.8, chain: 0.1, move: 0.15, stagger: 14, proc: 1, weight: 2, speed: 55, pathCoef: 0.2, pathWidth: 2.4 },
  });

  // ---- Karanlık (m45, Yutucu): 8 sn, 8 metre içindeki dostların aldığı hasar %20 azalır
  add({
    id: 'demonhunter_darkness', classId: 'demonhunter', name: 'Karanlık', icon: I('skill-stealth'), unlockLevel: 20,
    desc: 'Bulunduğun yerde 8 saniye süren bir karanlık bölgesi açarsın: içindeki dostların (sen dahil) aldığı hasar %20 azalır. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.5, targeting: 'custom', behavior: 'kit_dh_darkness', radius: 8,
    offGcd: true, tags: ['offgcd', 'major', 'defensive', 'buff', 'zone', 'shadow'], vfx: { cast: 'void_burst', ground: 'shadow_ground' }, sfx: { cast: 'shadow_cast' },
    params: { end: 1.0, chain: 0.1, move: 0.2, weight: 1, dur: 8 },
  });

  // ---- İntikam Geri Çekilişi (Kaos r slot)
  add({
    id: 'demonhunter_vengeful_retreat', classId: 'demonhunter', name: 'İntikam Geri Çekilişi', icon: I('skill-shadow-step'), unlockLevel: 10,
    desc: 'Geriye 8 metre sıçrarsın; kalktığın yerdeki düşmanlara %55 gölge hasarı verip geri savurursun. 6 saniye Girişim kazanırsın (hasar +%12) ve çok kısa süre dokunulmaz olursun. 25 saniye bekleme.',
    cost: 0, cooldown: 25, castTime: 0, anim: 'Dodge_Backward', animSpeed: 1.3, hitTime: 0.1, targeting: 'custom', behavior: 'kit_dh_retreat', radius: 6,
    damage: { coef: 0.55, type: 'shadow' }, selfStatuses: [{ status: 'initiative', duration: 6 }], offGcd: true,
    tags: ['offgcd', 'movement', 'shadow'], vfx: { cast: 'fel_aura' }, sfx: { cast: 'whoosh' },
    params: { end: 0.45, chain: 0.05, move: 0.05, stagger: 4, weight: 0, back: 8, backDur: 0.28, iframes: 0.25 },
  });
}
