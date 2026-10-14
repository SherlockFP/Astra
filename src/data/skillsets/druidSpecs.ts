/**
 * KIT Druid spec-bound skill rows (druid_balance, druid_feral, druid_guardian, druid_restoration). SpecDef rows are in specs_kit_druid.ts.
 * OWNER: druid kit. Midnight (12.0): Eclipse is an active 15 s window (alternates Solar / Lunar), Starsurge / Starfall spend Astral Power,
 * Feral keeps bleeds up and spends combo points (no Bloodtalons), Guardian is Mangle / Thrash / Ironfur / Frenzied Regeneration,
 * Restoration layers HoTs (Mastery: Harmony counts up to 5) with Swiftmend, Wild Growth and Tranquility.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const CAST = { end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 1, weight: 0, upper: 0 };

export function registerDruidSpecs(add: SkillAdd): void {
  // =====================================================================================================
  // Denge (druid_balance, DPS): Astral Güç loop, Eclipse, Ay Baykuşu Biçimi (auto-enter, tag f_moon)
  // =====================================================================================================
  add({
    id: 'druid_bal_basic', classId: 'druid', spec: 'druid_balance', name: 'Ay Işığı (Lunar Strike)', icon: I('skill-arcane-missiles'), unlockLevel: 1,
    desc: 'Hedefe %80 gizem hasarı veren bir ay ışığı oku atarsın ve 3 Astral Güç kazanırsın. Ay Baykuşu Biçimi\'ne geçirir.',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.35, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'target_projectile', range: 30, speed: 28, radius: 0.4, count: 1, pierce: 0, homing: 6, damage: { coef: 0.8, type: 'arcane' },
    pip: { id: 'astral_power', gain: 3 },
    tags: ['spell', 'basic', 'projectile', 'arcane', 'lunar', 'f_moon'], vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { end: 0.8, chain: 0.05, move: 0.1, stagger: 2, proc: 0.6, weight: 0 },
  });
  add({
    id: 'druid_starfire', classId: 'druid', spec: 'druid_balance', name: 'Yıldız Ateşi (Starfire)', icon: I('skill-arcane-orb'), unlockLevel: 1,
    desc: '2 saniyelik büyüyle hedefe %380 gizem hasarı verir ve 12 Astral Güç kazanırsın. Ay Tutulması varken %40 daha güçlüdür.',
    cost: 6, cooldown: 0, castTime: 2.0, anim: 'Spellcast_Raise', animSpeed: 1.0, hitTime: 0.5,
    targeting: 'target_projectile', range: 32, speed: 22, radius: 0.5, count: 1, pierce: 0, homing: 5, damage: { coef: 3.8, type: 'arcane' },
    pip: { id: 'astral_power', gain: 12 }, whileStatusMult: { status: 'eclipse_lunar', mult: 1.4 },
    tags: ['spell', 'projectile', 'arcane', 'lunar', 'f_moon'], vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { ...CAST, element: 3 },
  });
  add({
    id: 'druid_starsurge', classId: 'druid', spec: 'druid_balance', name: 'Yıldız Dalgası (Starsurge)', icon: I('skill-meteor'), unlockLevel: 12,
    desc: '35 Astral Güç harcayarak hedefe anında %520 gizem hasarı verirsin.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'target_projectile', range: 34, speed: 34, radius: 0.5, count: 1, pierce: 0, homing: 8, damage: { coef: 5.2, type: 'arcane' },
    pip: { id: 'astral_power', cost: 35 },
    tags: ['spell', 'projectile', 'arcane', 'spender', 'f_moon'], vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast', impact: 'explosion' },
    params: { ...CAST, element: 3, weight: 1, stagger: 8 },
  });
  add({
    id: 'druid_sunfire', classId: 'druid', spec: 'druid_balance', name: 'Güneş Ateşi (Sunfire)', icon: I('debuff-burn'), unlockLevel: 1,
    desc: 'Hedefe ve çevresindeki en çok 6 düşmana %50 ateş hasarı verir; 14 saniye yakar (toplam %210). Her isabet 2 Astral Güç kazandırır.',
    cost: 6, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_dot', range: 30, radius: 5.5, damage: { coef: 0.5, type: 'fire' },
    statuses: [{ status: 'sunfire', duration: 14, magnitude: 4.25 }], pip: { id: 'astral_power', gain: 2 },
    tags: ['spell', 'dot', 'aoe', 'fire', 'instant', 'solar', 'f_moon'], vfx: { cast: 'fire_burst', impact: 'fire_burst' }, sfx: { cast: 'fire_cast' },
    params: { ...CAST, element: 1, splash: 1, maxTargets: 6, splashMult: 0.8 },
  });
  add({
    id: 'druid_eclipse', classId: 'druid', spec: 'druid_balance', name: 'Tutulma (Eclipse)', icon: I('skill-fire-nova'), unlockLevel: 15,
    desc: '15 saniye süren bir Tutulma başlatırsın; her kullanışta Güneş ve Ay arasında sırayla geçer. Güneş: Güneş Gazabı +%40, Ay: Yıldız Ateşi +%40. +10 Astral Güç verir.',
    cost: 0, cooldown: 30, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.2, offGcd: true, targeting: 'custom', behavior: 'kit_druid_eclipse',
    tags: ['buff', 'f_moon', 'offgcd'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { end: 0.4, chain: 0.1, move: 0.1, weight: 0, dur: 15, ap: 10 },
  });
  add({
    id: 'druid_starfall', classId: 'druid', spec: 'druid_balance', name: 'Yıldız Yağmuru (Starfall)', icon: I('skill-meteor-impact'), unlockLevel: 20, defaultSlot: 'r',
    desc: '50 Astral Güç harcayıp 6 saniye boyunca çevrene yıldızlar yağdırırsın: yarım saniyede bir, menzildeki en çok 5 düşmana %75 gizem hasarı. Hareket edebilirsin.',
    cost: 0, cooldown: 8, castTime: 0, channel: 6, hitTime: 0.1, anim: 'Spellcast_Raise', animSpeed: 1.0, targeting: 'custom', behavior: 'kit_druid_starfall',
    radius: 9, damage: { coef: 0.75, type: 'arcane' }, pip: { id: 'astral_power', cost: 50 },
    tags: ['spell', 'aoe', 'channel', 'arcane', 'spender', 'f_moon'], vfx: { cast: 'arcane_burst', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { end: 0.3, chain: 0.1, stagger: 2, proc: 0.4, weight: 0, tick: 0.5, maxTargets: 5 },
  });
  add({
    id: 'druid_celestial_alignment', classId: 'druid', spec: 'druid_balance', name: 'Göksel Hizalanma (Celestial Alignment)', icon: I('skill-meteor'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '12 saniye boyunca hem Güneş hem Ay Tutulması etkin olur; büyü hızın ve hasarın %10 artar. +40 Astral Güç verir.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.4, hitTime: 0.3, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'celestial_alignment', duration: 12 }, { status: 'eclipse_solar', duration: 12 }, { status: 'eclipse_lunar', duration: 12 }],
    tags: ['major', 'buff', 'f_moon', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, weight: 1, ap: 40 },
  });
  add({
    id: 'druid_fury_of_elune', classId: 'druid', spec: 'druid_balance', name: 'Elune\'nin Hiddeti (Incarnation: Chosen of Elune)', icon: I('skill-blizzard'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Seçtiğin noktaya 8 saniye boyunca bir ay ışığı sütunu indirirsin: her saniye alandaki herkese %180 gizem hasarı verir ve her vuruşta 4 Astral Güç kazandırır.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.2, hitTime: 0.4, targeting: 'ground_aoe', behavior: 'kit_druid_fury',
    range: 30, radius: 6, damage: { coef: 1.8, type: 'arcane' },
    tags: ['major', 'spell', 'aoe', 'arcane', 'f_moon', 'spec'], vfx: { cast: 'arcane_burst', ground: 'holy_ground' }, sfx: { cast: 'spell_cast' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 1, pulses: 8, interval: 1, ap: 4 },
  });

  // =====================================================================================================
  // Vahşi (druid_feral, DPS): Kedi, Kombo Puanı, kanamalar (Tırmık / Parçalama), Pars Öfkesi
  // =====================================================================================================
  add({
    id: 'druid_rip', classId: 'druid', spec: 'druid_feral', name: 'Parçalama (Rip)', icon: I('skill-rend'), unlockLevel: 1,
    desc: 'Kedi Biçimi: tüm Kombo Puanlarını harcayıp derin bir yara açarsın: %80 hasar ve her puan için ek kanama (5 puanda toplam %400, 21 saniye).',
    cost: 30, cooldown: 0, castTime: 0, hitTime: 0.45, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.4,
    targeting: 'custom', behavior: 'kit_finisher', range: 3.0, arc: 70, damage: { coef: 0.8, type: 'physical' },
    statuses: [{ status: 'rip', duration: 6, magnitude: 1.0 }], replaces: { skill: 'druid_rejuvenation', whileStatus: 'form_cat' },
    tags: ['melee', 'finisher', 'bleed', 'physical', 'spec', 'f_cat'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.7, chain: 0.08, move: 0.15, stagger: 4, weight: 1, mode: 0, base: 0.8, perCp: 0, minCp: 1, maxCp: 5, maxTargets: 1, durPerCp: 3, magPerCp: 1 },
  });
  add({
    id: 'druid_swipe', classId: 'druid', spec: 'druid_feral', name: 'Pençe Savurma (Swipe)', icon: I('skill-cleave'), unlockLevel: 10,
    desc: 'Kedi Biçimi: çevrendeki herkese %110 hasar verir; vurduğun her hedef için ilk isabetten 1 Kombo Puanı kazanırsın.',
    cost: 35, cooldown: 0, castTime: 0, hitTime: 0.35, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6,
    targeting: 'self_aoe', radius: 4.2, damage: { coef: 1.1, type: 'physical' }, pip: { id: 'combo', gain: 1 },
    tags: ['melee', 'aoe', 'builder', 'physical', 'spec', 'f_cat'], vfx: { cast: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.7, chain: 0.1, move: 0.15, stagger: 6, proc: 0.8, weight: 1 },
  });
  add({
    id: 'druid_feral_fury', classId: 'druid', spec: 'druid_feral', name: 'Pars Öfkesi (Tiger\'s Fury)', icon: I('buff-strength'), unlockLevel: 12, defaultSlot: 's3',
    desc: 'Kedi Biçimi: 10 saniye boyunca hasarın %15 artar ve 40 Enerji kazanırsın.',
    cost: 0, cooldown: 12, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.15, offGcd: true, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'feral_fury', duration: 10 }], tags: ['buff', 'f_cat', 'offgcd', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'boss_roar' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0, energy: 40 },
  });
  add({
    id: 'druid_berserk', classId: 'druid', spec: 'druid_feral', name: 'Vahşileşme (Berserk)', icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Kedi Biçimi: 15 saniye boyunca Enerji maliyetleri %40 düşer, saldırı hızın %10 artar. 30 Enerji kazanırsın.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.2, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'berserk', duration: 15 }], tags: ['major', 'buff', 'f_cat', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'boss_roar' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, weight: 1, energy: 30 },
  });
  add({
    id: 'druid_feral_frenzy', classId: 'druid', spec: 'druid_feral', name: 'Vahşi Çılgınlık (Feral Frenzy)', icon: I('skill-blade-storm'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Kedi Biçimi: hedefe art arda 5 pençe vurursun (her biri %120), hedefi kanatır ve 5 Kombo Puanı kazanırsın.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.3, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.8,
    targeting: 'melee_arc', behavior: 'multi_strike', range: 3.2, arc: 90, damage: { coef: 1.2, type: 'physical' },
    statuses: [{ status: 'rake', duration: 10, magnitude: 2.2 }], pip: { id: 'combo', gain: 5 },
    tags: ['major', 'melee', 'bleed', 'physical', 'f_cat', 'spec'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { major: 90, end: 1.6, chain: 0.1, move: 0.3, stagger: 4, proc: 0.6, weight: 1, hits: 5, gap: 0.2 },
  });

  // =====================================================================================================
  // Koruyucu (druid_guardian, TANK): Ayı, Öfke, Demir Post, Çılgın Yenilenme
  // =====================================================================================================
  add({
    id: 'druid_frenzied_regen', classId: 'druid', spec: 'druid_guardian', name: 'Çılgın Yenilenme (Frenzied Regeneration)', icon: I('skill-regeneration'), unlockLevel: 1, defaultSlot: 's3',
    desc: 'Ayı Biçimi: 3 saniye boyunca en çok canının %35\'ini geri kazanırsın. İki yükü vardır, 16 saniyede yenilenir.',
    cost: 0, cooldown: 16, charges: 2, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.15, offGcd: true, targeting: 'custom', behavior: 'kit_druid_self',
    replaces: { skill: 'druid_regrowth', whileStatus: 'form_bear' }, tags: ['buff', 'heal', 'defensive', 'f_bear', 'offgcd', 'spec'], vfx: { cast: 'heal_loop' }, sfx: { cast: 'heal' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0, hotPct: 0.35, hotDur: 3 },
  });
  add({
    id: 'druid_growl', classId: 'druid', spec: 'druid_guardian', name: 'Kükreme (Growl)', icon: I('skill-taunt'), unlockLevel: 10, defaultSlot: 'q',
    desc: 'Ayı Biçimi: 25 metre içindeki bir düşmanı 3 saniye kendine saldırmaya zorlarsın (boss: 2 sn).',
    cost: 0, cooldown: 8, castTime: 0, hitTime: 0.2, offGcd: true, anim: 'Cheer', animSpeed: 2.0, targeting: 'custom', behavior: 'provoke', range: 25,
    tags: ['taunt', 'f_bear', 'offgcd', 'spec'], vfx: { cast: 'war_cry' }, sfx: { cast: 'boss_roar' },
    params: { end: 0.4, chain: 0.1, move: 0.1, weight: 0, tauntDur: 3, bossTauntDur: 2, threatBoost: 120 },
  });
  add({
    id: 'druid_survival_instincts', classId: 'druid', spec: 'druid_guardian', name: 'Hayatta Kalma İçgüdüsü (Survival Instincts)', icon: I('buff-invulnerable'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '6 saniye boyunca aldığın hasar %50 azalır. Her biçimde kullanılabilir.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.2, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'survival_instincts', duration: 6 }], tags: ['major', 'buff', 'defensive', 'f_any', 'spec'], vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, weight: 1 },
  });
  add({
    id: 'druid_sleeper_rage', classId: 'druid', spec: 'druid_guardian', name: 'Uyuyanın Öfkesi (Incarnation: Guardian of Ursoc)', icon: I('buff-strength'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Ayı Biçimi: 12 saniye boyunca hasarın %25, canın %15 artar ve aldığın hasar %15 azalır. 40 Öfke kazanırsın.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.2, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'sleeper_rage', duration: 12 }], tags: ['major', 'buff', 'f_bear', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'boss_roar' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.15, weight: 2, rage: 40 },
  });

  // =====================================================================================================
  // Restorasyon (druid_restoration, HEALER): HoT katmanları, Çabuk İyileşme, Yabani Büyüme, Dinginlik
  // =====================================================================================================
  add({
    id: 'druid_resto_basic', classId: 'druid', spec: 'druid_restoration', name: 'Doğa Kıvılcımı (Nature\'s Spark)', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Elinden bir doğa kıvılcımı fırlatırsın: bir müttefiki iyileştirir, düşmana çarparsa hasar verir.',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.37, anim: 'Spellcast_Shoot', animSpeed: 1.6,
    targeting: 'projectile', range: 30, speed: 26, count: 1, spread: 0, behavior: 'heal_bolt',
    heal: { coef: 0.75 }, damage: { coef: 0.55, type: 'poison' }, allyTarget: 'friendly',
    tags: ['spell', 'basic', 'projectile', 'heal', 'nature'], vfx: { projectile: 'poison_projectile', impact: 'heal_burst' }, sfx: { cast: 'heal' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  add({
    id: 'druid_lifebloom', classId: 'druid', spec: 'druid_restoration', name: 'Yaşam Çiçeği (Lifebloom)', icon: I('buff-regen'), unlockLevel: 1,
    desc: 'Müttefikte 12 saniye boyunca her saniye iyileştiren bir çiçek açarsın; süre dolunca çiçek patlar ve ek iyileştirme yapar. Yeniden kullanmak süreyi tazeler.',
    cost: 12, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_hot', range: 30, allyTarget: 'friendly', statuses: [{ status: 'lifebloom', duration: 12 }],
    tags: ['spell', 'heal', 'hot', 'instant', 'nature', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'heal', impact: 'buff' },
    params: { ...CAST, hotCoef: 0.22, tick: 1, bloom: 1.6 },
  });
  add({
    id: 'druid_wild_growth', classId: 'druid', spec: 'druid_restoration', name: 'Yabani Büyüme (Wild Growth)', icon: I('skill-prayer'), unlockLevel: 1,
    desc: '1 saniyelik büyüyle seçtiğin müttefikin çevresindeki en çok 5 yaralı kişiyi anında %60 iyileştirir ve 7 saniye boyunca iyileştirmeye devam edersin.',
    cost: 22, cooldown: 8, castTime: 1.0, anim: 'Spellcast_Raise', animSpeed: 1.2, hitTime: 1.0,
    targeting: 'custom', behavior: 'kit_druid_wild_growth', range: 30, radius: 14, allyTarget: 'friendly', heal: { coef: 0.6 }, statuses: [{ status: 'wild_growth', duration: 7 }],
    tags: ['spell', 'heal', 'aoe', 'hot', 'nature', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'heal_big', impact: 'buff' },
    params: { end: 0.7, chain: 0.1, move: 0.2, weight: 0, hotCoef: 0.3, tick: 1, maxTargets: 5 },
  });
  add({
    id: 'druid_swiftmend', classId: 'druid', spec: 'druid_restoration', name: 'Çabuk İyileşme (Swiftmend)', icon: I('skill-healing-shield'), unlockLevel: 1,
    desc: 'Üzerinde Gençleşme, Yeniden Büyüme ya da Yabani Büyüme olan bir müttefikte o etkiyi tüketip anında %320 iyileştirirsin.',
    cost: 14, cooldown: 10, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.7, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_swiftmend', range: 30, allyTarget: 'friendly', heal: { coef: 3.2 },
    tags: ['spell', 'heal', 'instant', 'nature', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_pillar' }, sfx: { cast: 'heal_big' },
    params: { ...CAST },
  });
  add({
    id: 'druid_natures_cure', classId: 'druid', spec: 'druid_restoration', name: 'Doğa Şifası (Nature\'s Cure)', icon: I('skill-holy-water'), unlockLevel: 12,
    desc: 'Bir müttefikin üzerindeki en çok 2 zehir ya da büyü etkisini kaldırır, ona hafif bir iyileştirme yaparsın.',
    cost: 10, cooldown: 8, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'heal_target', range: 30, allyTarget: 'friendly', heal: { coef: 0.4 },
    tags: ['spell', 'heal', 'dispel', 'nature', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'heal' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, dispel: 2 },
  });
  add({
    id: 'druid_ironbark', classId: 'druid', spec: 'druid_restoration', name: 'Demir Kabuk (Ironbark)', icon: I('skill-iron-skin'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Seçtiğin müttefiğin derisini 12 saniye boyunca kabukla kaplarsın: aldığı hasar %20 azalır.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_hot', range: 30, allyTarget: 'friendly', statuses: [{ status: 'ironbark', duration: 12 }],
    tags: ['major', 'buff', 'defensive', 'nature', 'spec'], vfx: { cast: 'shield_bubble', impact: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.9, chain: 0.1, move: 0.15, weight: 1 },
  });
  add({
    id: 'druid_tranquility', classId: 'druid', spec: 'druid_restoration', name: 'Dinginlik (Tranquility)', icon: I('skill-resurrect'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '6 saniye boyunca doğayı çağırırsın: her saniye 25 metre içindeki tüm müttefiklerini %95 iyileştirirsin. Büyü yapınca ya da hareket edince kesilir.',
    cost: 0, cooldown: 90, castTime: 0, channel: 6, hitTime: 0.1, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'kit_druid_tranq', radius: 25, heal: { coef: 0.95 }, allyTarget: 'friendly',
    tags: ['major', 'spell', 'heal', 'aoe', 'channel', 'nature', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'heal_big' },
    params: { major: 90, end: 0.5, chain: 0.1, move: 0.15, weight: 2, tick: 1 },
  });

  // =====================================================================================================
  // Added rows (WoW Midnight list): Maul (Ayı), Innervate (Restorasyon), Skull Bash / Stampeding Roar (shared)
  // =====================================================================================================
  add({
    id: 'druid_maul', classId: 'druid', spec: 'druid_guardian', name: 'Parçalayıcı Darbe (Maul)', icon: I('skill-ground-slam'), unlockLevel: 10,
    desc: 'Ayı Biçimi: çevrendeki düşmanlara %160 hasar verir. 40 Öfke harcar.',
    cost: 40, cooldown: 0, castTime: 0, hitTime: 0.4, anim: '2H_Melee_Attack_Chop', animSpeed: 1.4,
    targeting: 'self_aoe', radius: 3.5, damage: { coef: 1.6, type: 'physical' },
    tags: ['melee', 'aoe', 'spender', 'physical', 'f_bear', 'spec'], vfx: { cast: 'spin_slash', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { end: 0.8, chain: 0.1, move: 0.15, stagger: 8, proc: 0.8, weight: 1 },
  });
  add({
    id: 'druid_innervate', classId: 'druid', spec: 'druid_restoration', name: 'İlham (Innervate)', icon: I('buff-mana-regen'), unlockLevel: 10,
    desc: 'Seçtiğin müttefike 10 saniye boyunca mana yenilenmesini %100 artırırsın.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.3,
    targeting: 'custom', behavior: 'kit_druid_hot', range: 30, allyTarget: 'friendly', statuses: [{ status: 'innervate', duration: 10 }],
    tags: ['buff', 'spell', 'nature', 'spec'], vfx: { cast: 'buff_aura', impact: 'buff_aura' }, sfx: { cast: 'buff', impact: 'buff' },
    params: { ...CAST, hotCoef: 0 },
  });
  add({
    id: 'druid_skull_bash', classId: 'druid', name: 'Kafatası Vuruşu (Skull Bash)', icon: I('skill-lightning-bolt'), unlockLevel: 10,
    desc: '13 metre içindeki bir düşmanın büyüsünü keser ve 3 saniye susturursun (boss hariç). Her biçimde kullanılabilir.',
    cost: 0, cooldown: 15, castTime: 0, hitTime: 0.2, offGcd: true, anim: 'Spellcast_Shoot', animSpeed: 1.8, targeting: 'custom', range: 13, arc: 360,
    behavior: 'interrupt', tags: ['offgcd', 'kick', 'f_any'], params: { silence: 3 }, vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'swing_heavy', impact: 'stun' },
  });
  add({
    id: 'druid_stampeding_roar', classId: 'druid', name: 'Coşkun Kükreme (Stampeding Roar)', icon: I('buff-haste'), unlockLevel: 15,
    desc: '8 saniye boyunca %30 daha hızlı koşarsın. Her biçimde kullanılabilir.',
    cost: 0, cooldown: 120, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.15, targeting: 'custom', behavior: 'kit_druid_self',
    selfStatuses: [{ status: 'stampeding_roar', duration: 8 }], tags: ['buff', 'movement', 'f_any', 'offgcd'], vfx: { cast: 'haste_trail' }, sfx: { cast: 'whoosh' },
    params: { end: 0.3, chain: 0.05, move: 0.05, weight: 0 },
  });
}
