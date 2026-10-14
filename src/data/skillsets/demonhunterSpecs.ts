/**
 * İblis Avcısı spec rows (AE-3, docs/kits/agile-evoker.md §3.1-§3.2 + the WoW Midnight Yutucu spec): Kaos (Havoc, dps), İntikam (Vengeance,
 * tank), Yutucu (Devourer, dps). Rows shared by the specs (Fel Bıçakları chain, Kaos Darbesi, Göz Işını, Yakıp Yok Etme Aurası, Fel Atılışı,
 * Bulanıklık, Bozucu, Metamorfoz, Av, Karanlık, İntikam Geri Çekilişi) live in demonhunter.ts. Gazap costs are `cost` (negative = gain),
 * Ruh Parçacığı goes through `pip { id: 'soul' }`. Behaviours: combat/skills/demonhunterKit.ts (`kit_dh_*`).
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerDemonHunterSpecs(add: SkillAdd): void {
  // ======================================================================================================
  // KAOS (demonhunter_chaos): Öz Kırılması penceresi
  // ======================================================================================================
  add({
    id: 'demonhunter_essence_break', classId: 'demonhunter', spec: 'demonhunter_chaos', name: 'Öz Kırılması (Essence Break)', icon: I('skill-thunderclap'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '10 metre içindeki herkese %530 gölge hasarı verirsin ve hedefleri 4 saniye açığa çıkarırsın: bu sürede senden aldıkları hasar %60 artar. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.5, hitTime: 0.5, targeting: 'self_aoe', radius: 10, offGcd: true,
    damage: { coef: 5.3, type: 'shadow' }, statuses: [{ status: 'essence_break', duration: 4 }],
    tags: ['offgcd', 'major', 'offensive', 'aoe', 'shadow'], vfx: { cast: 'shockwave', impact: 'shadow_burst' }, sfx: { cast: 'fel_impact', impact: 'explosion' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 14, proc: 1, weight: 2, maxTargets: 8 },
  });

  // ======================================================================================================
  // İNTİKAM (demonhunter_vengeance): fragmanlar, Şeytan Dikenleri + Ateş Mührü aktif savunma
  // ======================================================================================================
  add({
    id: 'demonhunter_fracture', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Kırılma (Fracture)', icon: I('skill-double-strike'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Önündeki düşmana çapraz iki kesikle %75 fiziksel hasar verirsin (Metamorfoz sırasında %20 güçlü). 14 Gazap ve 2 Ruh Parçacığı kazandırır. İki yük, her biri 4.5 saniyede dolar; Şeytan Dikenleri\'ni 0.5 saniye hızlandırır.',
    cost: -14, cooldown: 4.5, charges: 2, castTime: 0, anim: 'Dualwield_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.408, targeting: 'target_instant', range: 4,
    damage: { coef: 0.75, type: 'physical' }, pip: { id: 'soul', gain: 2 }, tags: ['melee', 'builder', 'physical'],
    vfx: { cast: 'glaive_trail', impact: 'hit_blood' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.75, chain: 0.05, move: 0.12, stagger: 6, proc: 0.9, weight: 0, lunge: 1.0, threatMult: 1.5 },
  });
  add({
    id: 'demonhunter_soul_cleave', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Ruh Yarma (Soul Cleave)', icon: I('skill-cleave'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Önündeki 5 metrelik yarım ay alanda %105 fiziksel hasar verirsin ve kendini maks. canının %3.3\'ü kadar iyileştirirsin. Bir Ruh Parçacığı yutarsan hasar ve şifa %40 artar. 22 Gazap harcar. Beş parçacıkta Ruh Bombası\'na dönüşür.',
    cost: 22, cooldown: 0, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.5, hitTime: 0.507, targeting: 'melee_arc', behavior: 'kit_dh_soul_cleave',
    range: 5, arc: 120, damage: { coef: 1.05, type: 'physical' }, pip: { id: 'soul', consume: 1, coefPerPip: 0.42 }, tags: ['melee', 'aoe', 'spender', 'heal', 'physical'],
    vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'heavy_hit' },
    params: { end: 0.95, chain: 0.08, move: 0.2, stagger: 9, proc: 1, weight: 1, lunge: 1.0, maxTargets: 3, threatMult: 1.5, healPct: 0.033, healPerPip: 0.4 },
  });
  add({
    id: 'demonhunter_spirit_bomb', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Ruh Bombası (Spirit Bomb)', icon: I('skill-holy-nova'), unlockLevel: 10,
    desc: 'Beş Ruh Parçacığı varken Ruh Yarma\'nın yerine geçer: tüm parçacıkları yutup 7 metre içindekilere %230 ateş hasarı verirsin; en az 3 düşmana çarparsa maks. canının %6\'sı kadar iyileşirsin. Hedefler 6 saniye zayıflar (verdikleri hasar -%10). 25 Gazap harcar.',
    cost: 25, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.55, targeting: 'self_aoe', behavior: 'kit_dh_spirit_bomb', radius: 7,
    damage: { coef: 2.3, type: 'fire' }, pip: { id: 'soul', consume: 'all', min: 5 }, statuses: [{ status: 'frailty', duration: 6 }],
    replaces: { skill: 'demonhunter_soul_cleave', whileStatus: 'soul_overflow' }, tags: ['spell', 'aoe', 'spender', 'heal', 'fire'],
    vfx: { cast: 'soul_fragment_orb', impact: 'fire_burst' }, sfx: { cast: 'fel_cast', impact: 'fel_impact' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, maxTargets: 8, threatMult: 1.5, healPct: 0.06, healMin: 3 },
  });
  add({
    id: 'demonhunter_fiery_brand', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Ateş Mührü (Fiery Brand)', icon: I('skill-firewall'), unlockLevel: 10, defaultSlot: 'r',
    desc: '30 metre içindeki hedefi 8 saniye mühürlersin: sana verdiği hasar %40 azalır, senden aldığı hasar %10 artar. %115 ateş hasarı verir. İki yük, her biri 30 saniyede dolar.',
    cost: 0, cooldown: 30, charges: 2, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.373, targeting: 'target_instant', range: 30, offGcd: true,
    damage: { coef: 1.15, type: 'fire' }, statuses: [{ status: 'fiery_brand', duration: 8 }], tags: ['offgcd', 'spell', 'defensive', 'fire'],
    vfx: { cast: 'fire_burst', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 4, proc: 0.8, weight: 0, threatMult: 2 },
  });
  add({
    id: 'demonhunter_torment', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'İşkence (Torment)', icon: I('skill-taunt'), unlockLevel: 1, defaultSlot: 'r',
    desc: 'Bir düşmanı sana çevirir: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye. 8 saniye bekleme.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.25, targeting: 'custom', range: 25, behavior: 'provoke', offGcd: true,
    tags: ['offgcd', 'taunt', 'threat'], vfx: { cast: 'mark_loop' }, sfx: { cast: 'buff' }, params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'demonhunter_infernal_strike', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'İnfernal Atılış (Infernal Strike)', icon: I('skill-meteor-impact'), unlockLevel: 10, defaultSlot: 's2',
    desc: 'Hedef noktaya 30 metre sıçrarsın ve indiğin yerde %120 ateş hasarı verirsin; 2 saniye sonra o noktada Alev Mührü patlar (%65 ateş hasarı, yanma). İki yük, her biri 20 saniyede dolar.',
    cost: 0, cooldown: 20, charges: 2, castTime: 0, anim: 'Jump_Full_Long', animSpeed: 1.0, hitTime: 0.5, targeting: 'custom', behavior: 'kit_dh_leap_sigil', range: 30, radius: 5, duration: 0.6, offGcd: true,
    damage: { coef: 1.2, type: 'fire' }, tags: ['offgcd', 'movement', 'aoe', 'fire'], vfx: { cast: 'infernal_fall', impact: 'fire_burst', ground: 'sigil_ground' }, sfx: { cast: 'jump', impact: 'fire_impact' },
    params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 8, proc: 1, weight: 1, sigilCoef: 0.65, sigilDelay: 2, sigilRadius: 5 },
  });
  add({
    id: 'demonhunter_demon_spikes', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Şeytan Dikenleri (Demon Spikes)', icon: I('skill-iron-skin'), unlockLevel: 1, defaultSlot: 's3',
    desc: '8 saniye boyunca zırhın %100, savuşturma şansın %30 artar. İki yük, her biri 20 saniyede dolar; Kırılma ve Ruh Yarma her kullanımda bekleme süresini 0.5 saniye kısaltır.',
    cost: 0, cooldown: 20, charges: 2, castTime: 0, anim: 'Cheer', animSpeed: 2.4, hitTime: 0.25, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'demon_spikes', duration: 8 }], tags: ['offgcd', 'defensive', 'buff'], vfx: { cast: 'bone_armor' }, sfx: { cast: 'guard_hit' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'demonhunter_fel_devastation', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Fel Yıkımı (Fel Devastation)', icon: I('skill-fire-wave'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Önündeki 60 derecelik alana 1.6 saniye boyunca ateş püskürtürsün: en fazla 8 düşmana toplam %535 ateş hasarı verir ve maks. canının %12\'si kadar iyileştirir. Kanal boyunca yavaşlarsın ama kontrole bağışıksın. 30 Gazap harcar. 45 saniye bekleme.',
    cost: 30, cooldown: 45, castTime: 0, channel: 1.6, anim: 'Spellcast_Long', animSpeed: 1.5, hitTime: 0.25, targeting: 'custom', behavior: 'kit_dh_beam', range: 14, arc: 60, offGcd: true,
    damage: { coef: 1.34, type: 'fire' }, tags: ['offgcd', 'major', 'channel', 'aoe', 'heal', 'fire'],
    vfx: { cast: 'dragon_breath_cone', impact: 'fire_burst' }, sfx: { cast: 'fire_whoosh', impact: 'fire_impact' },
    params: { end: 0.9, chain: 0, move: 0.1, stagger: 5, proc: 0.8, weight: 1, tick: 0.45, healPct: 0.12, moveSlow: 0.6, unstoppable: 1, maxTargets: 8, fixed: 1, threatMult: 1.5 },
  });
  add({
    id: 'demonhunter_soul_carver', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Ruh Oyucu (Soul Carver)', icon: I('skill-rend'), unlockLevel: 20, defaultSlot: 'm180',
    desc: 'Önündeki düşmana %200 ateş hasarı verirsin ve 3 saniye boyunca yakarsın (toplam %180 daha). 3 Ruh Parçacığı kazandırır. 60 saniye bekleme.',
    cost: 0, cooldown: 60, castTime: 0, anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.4, hitTime: 0.507, targeting: 'target_instant', range: 4, offGcd: true,
    damage: { coef: 2.0, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.9 }], pip: { id: 'soul', gain: 3 },
    tags: ['offgcd', 'major', 'melee', 'fire'], vfx: { cast: 'fire_burst', impact: 'fire_burst' }, sfx: { cast: 'swing_heavy', impact: 'fire_impact' },
    params: { end: 0.95, chain: 0.08, move: 0.15, stagger: 10, proc: 1, weight: 1, lunge: 1.0, threatMult: 2 },
  });

  // ======================================================================================================
  // YUTUCU (demonhunter_devourer, Midnight): menzilli boşluk büyücüsü. Tüket → Ruh Parçacığı + Gazap, Biç → ruhları yut,
  // Boşluk Metamorfozu (dört parçacık) → Boşluk Işını dönüşür, Çöken Yıldız her kullanımda güçlenir.
  // ======================================================================================================
  add({
    id: 'demonhunter_void_basic', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Kıvılcımı (Void Bolt)', icon: I('skill-arcane-missiles'), defaultSlot: 'lmb',
    desc: 'Eldivenlerinden boşluk kıvılcımları fırlatırsın; her isabet Gazap kazandırır. Üçüncü atış ağır bir boşluk topudur.',
    anim: 'Spellcast_Shoot', targeting: 'target_projectile', range: 22, tags: ['spell', 'basic', 'combo', 'projectile', 'shadow'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  add({
    id: 'demonhunter_void_basic_1', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Kıvılcımı (Void Bolt)', icon: I('skill-arcane-missiles'),
    desc: 'İlk boşluk kıvılcımı.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'target_projectile', range: 22, speed: 30, radius: 0.35, count: 1, pierce: 0,
    damage: { coef: 0.42, type: 'shadow' }, knockback: 0.4, tags: ['spell', 'basic', 'projectile', 'shadow'], homing: 4,
    vfx: { projectile: 'shadow_projectile', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 3, gain: 1, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 1, hand: 0 },
  });
  add({
    id: 'demonhunter_void_basic_2', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Kıvılcımı (Void Bolt)', icon: I('skill-arcane-missiles'),
    desc: 'İkinci boşluk kıvılcımı.', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.373, targeting: 'target_projectile', range: 22, speed: 30, radius: 0.35, count: 1, pierce: 0,
    damage: { coef: 0.42, type: 'shadow' }, knockback: 0.4, tags: ['spell', 'basic', 'projectile', 'shadow'], homing: 4,
    vfx: { projectile: 'shadow_projectile', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 3, gain: 1, proc: 0.7, weight: 0, upper: 1, slow: 0.4, step: 2, hand: 1 },
  });
  add({
    id: 'demonhunter_void_basic_3', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Topu (Void Orb)', icon: I('skill-meteor'),
    desc: 'Ağır bir boşluk topu fırlatırsın.', anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.95, targeting: 'target_projectile', range: 22, speed: 26, radius: 0.5, count: 1, pierce: 0,
    damage: { coef: 0.95, type: 'shadow' }, knockback: 1.2, tags: ['spell', 'basic', 'projectile', 'finisher', 'shadow'], homing: 3,
    vfx: { projectile: 'shadow_projectile', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 1.1, chain: 0.06, move: 0.2, stagger: 8, gain: 2, proc: 1, weight: 1, step: 3, finisher: 1, slow: 0.5 },
  });
  add({
    id: 'demonhunter_consume', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Tüket (Consume)', icon: I('skill-life-drain'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: '22 metre içindeki hedefe izleyen bir boşluk oku fırlatırsın: %85 gölge hasarı verir, 8 Gazap ve 1 Ruh Parçacığı kazandırır. Hareket ederken de kullanılabilir.',
    cost: -8, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.7, hitTime: 0.373, targeting: 'target_projectile', range: 22, speed: 32, radius: 0.45, count: 1, pierce: 0, homing: 5,
    damage: { coef: 0.85, type: 'shadow' }, pip: { id: 'soul', gain: 1 }, tags: ['spell', 'builder', 'projectile', 'shadow'],
    vfx: { cast: 'void_burst', projectile: 'shadow_projectile', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.6, chain: 0.06, move: 0.1, stagger: 3, proc: 0.8, weight: 0, upper: 1, slow: 0.2 },
  });
  add({
    id: 'demonhunter_reap', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Biç (Reap)', icon: I('skill-shadow-grasp'), unlockLevel: 3, defaultSlot: 'q',
    desc: 'Çevrendeki 8 metrelik alanda ruhları biçersin: tüm Ruh Parçacıklarını yutar, düşmanlara %90 + parçacık başına %55 gölge hasarı verir ve yuttuğun her parçacık için 4 Gazap kazanırsın. En az 1 parçacık gerekir. 5 saniye bekleme.',
    cost: 0, cooldown: 5, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.6, targeting: 'self_aoe', behavior: 'kit_dh_reap', radius: 8,
    damage: { coef: 0.9, type: 'shadow' }, pip: { id: 'soul', consume: 'all', min: 1, coefPerPip: 0.55 }, tags: ['spell', 'aoe', 'spender', 'shadow'],
    vfx: { cast: 'void_burst', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 1.0, chain: 0.08, move: 0.2, stagger: 6, proc: 1, weight: 1, maxTargets: 8, furyPerPip: 4 },
  });
  add({
    id: 'demonhunter_void_ray', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Işını (Void Ray)', icon: I('skill-chain-lightning'), unlockLevel: 6, defaultSlot: 'e',
    desc: 'Önünde 18 metrelik bir boşluk ışını kanalize edersin: 2.4 saniye boyunca çizgideki herkese toplam %560 gölge hasarı verir. Işın sırasında yavaşlarsın. 20 Gazap harcar, 10 saniye bekleme. Boşluk Metamorfozu sırasında Boşluk Fırtınası\'na dönüşür.',
    cost: 20, cooldown: 10, castTime: 0, channel: 2.4, anim: 'Spellcast_Long', animSpeed: 1.2, hitTime: 0.25, targeting: 'custom', behavior: 'kit_dh_beam', range: 18,
    damage: { coef: 1.4, type: 'shadow' }, tags: ['spell', 'channel', 'aoe', 'shadow'], vfx: { cast: 'void_ray', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.9, chain: 0, move: 0.1, stagger: 3, proc: 0.6, weight: 0, tick: 0.65, width: 2.4, moveSlow: 0.5, maxTargets: 5, fixed: 1 },
  });
  add({
    id: 'demonhunter_void_storm', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Fırtınası (Void Storm)', icon: I('skill-arcane-explosion'), unlockLevel: 20,
    desc: 'Boşluk Metamorfozu sırasında Boşluk Işını\'nın yerine geçer: 4 saniye boyunca önündeki geniş alana (24 derece, 18 metre) toplam %850 gölge hasarı yağdırır; saniyede 4 Gazap harcar ve Gazap bitince söner.',
    cost: 0, cooldown: 0, castTime: 0, channel: 4, anim: 'Spellcast_Long', animSpeed: 1.2, hitTime: 0.25, targeting: 'custom', behavior: 'kit_dh_beam', range: 18, arc: 24,
    damage: { coef: 0.95, type: 'shadow' }, replaces: { skill: 'demonhunter_void_ray', whileStatus: 'void_meta' }, tags: ['spell', 'channel', 'aoe', 'shadow'],
    vfx: { cast: 'void_ray', impact: 'void_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.9, chain: 0, move: 0.1, stagger: 3, proc: 0.6, weight: 0, tick: 0.45, costPerSec: 4, minResource: 12, moveSlow: 0.4, maxTargets: 8, fixed: 1 },
  });
  add({
    id: 'demonhunter_collapsing_star', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Çöken Yıldız (Collapsing Star)', icon: I('skill-meteor'), unlockLevel: 20, defaultSlot: 'r',
    desc: 'Yalnızca Boşluk Metamorfozu sırasında: hedefin üzerine çöken bir yıldız düşürürsün, 6 metrelik alanda %260 gölge hasarı verir. Her kullanımda %15 daha güçlü olur (en çok 6 kez). 35 Gazap harcar. 2 saniye bekleme.',
    cost: 35, cooldown: 2, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.55, targeting: 'custom', behavior: 'kit_dh_collapsing_star', range: 22, radius: 6,
    damage: { coef: 2.6, type: 'shadow' }, selfStatuses: [{ status: 'collapsing_star', duration: 60 }], tags: ['spell', 'aoe', 'finisher', 'shadow'],
    vfx: { cast: 'void_burst', impact: 'meteor_fall' }, sfx: { cast: 'shadow_cast', impact: 'explosion' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 14, proc: 1, weight: 2, maxTargets: 8, perStack: 0.15, maxStacks: 6 },
  });
  add({
    id: 'demonhunter_void_nova', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Girdabı (Void Nova)', icon: I('skill-arcane-explosion'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Çevrendeki 8 metrelik alanda boşluğu patlatırsın: %180 gölge hasarı verir, 2 Ruh Parçacığı ve 10 Gazap kazandırır. 12 saniye bekleme.',
    cost: -10, cooldown: 12, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.6, targeting: 'self_aoe', radius: 8,
    damage: { coef: 1.8, type: 'shadow' }, pip: { id: 'soul', gain: 2 }, tags: ['spell', 'aoe', 'builder', 'shadow'],
    vfx: { cast: 'void_burst', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, maxTargets: 8 },
  });
  add({
    id: 'demonhunter_void_metamorphosis', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Boşluk Metamorfozu (Void Metamorphosis)', icon: I('skill-curse'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '4 Ruh Parçacığı yutarak boşluk biçimine girersin: bekleme yoktur, süre sabit değildir. Hasarın %25, büyü hızın %15 artar; Boşluk Işını Boşluk Fırtınası\'na dönüşür ve Çöken Yıldız açılır. Gazap saniyede 10 azalır, biçerek ve tüketerek sürdürürsün; Gazap bitince biçim söner. Girerken 40 Gazap kazanır ve 6 metreye %220 gölge hasarı verirsin.',
    cost: 0, cooldown: 3, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'kit_dh_void_meta', radius: 6, offGcd: true,
    damage: { coef: 2.2, type: 'shadow' }, pip: { id: 'soul', cost: 4 }, selfStatuses: [{ status: 'void_meta', duration: 90, magnitude: 10 }],
    tags: ['offgcd', 'major', 'offensive', 'aoe', 'shadow'], vfx: { cast: 'fel_wings', impact: 'void_burst' }, sfx: { cast: 'demon_summon', impact: 'boss_roar' },
    params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 10, proc: 1, weight: 2, furyGain: 40 },
  });
add({
  id: 'demonhunter_chaos_nova', classId: 'demonhunter', spec: 'demonhunter_chaos', name: 'Kaos Nova (Chaos Nova)', icon: I('skill-thunderclap'), unlockLevel: 20,
  desc: 'Çevrendeki 8 metrelik alanda bir kaos dalgası yayarsın: herkese %90 gölge hasarı verir ve 2 saniye sersemletirsin. 45 saniye bekleme.',
  cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
  damage: { coef: 0.9, type: 'shadow' }, statuses: [{ status: 'stun', duration: 2 }],
  tags: ['spell', 'aoe', 'cc', 'shadow'], vfx: { cast: 'void_burst', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
  params: { end: 1.0, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, maxTargets: 8 },
});
add({
  id: 'demonhunter_sigil_of_flame', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Alev Mührü (Sigil of Flame)', icon: I('skill-firewall'), unlockLevel: 10,
  desc: 'Ayaklarının dibine 6 metrelik bir Alev Mührü yerleştirirsin: 1 saniye sonra patlar, içindeki düşmanlara %80 ateş hasarı verir ve 6 saniye yakar. 25 saniye bekleme.',
  cost: 0, cooldown: 25, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.6, targeting: 'self_aoe', radius: 6,
  damage: { coef: 0.8, type: 'fire' }, statuses: [{ status: 'sigil_flame', duration: 6, magnitude: 0.8 }],
  tags: ['spell', 'aoe', 'zone', 'fire'], vfx: { cast: 'sigil_ground', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
  params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 6, proc: 0.9, weight: 1, maxTargets: 8 },
});
add({
  id: 'demonhunter_imprison', classId: 'demonhunter', spec: 'demonhunter_vengeance', name: 'Hapis (Imprison)', icon: I('skill-chain-lightning'), unlockLevel: 10,
  desc: '20 metre içindeki bir düşmanı 4 saniye boyunca hapseder ve sersemletirsin. 30 saniye bekleme.',
  cost: 0, cooldown: 30, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.4, targeting: 'target_instant', range: 20,
  statuses: [{ status: 'stun', duration: 4 }], tags: ['spell', 'cc', 'shadow'],
  vfx: { cast: 'mark_loop' }, sfx: { cast: 'shadow_cast' },
  params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 2, proc: 0.5, weight: 0 },
});
add({
  id: 'demonhunter_silence', classId: 'demonhunter', spec: 'demonhunter_devourer', name: 'Susturma (Silence)', icon: I('skill-thrust'), unlockLevel: 10,
  desc: '20 metre içindeki bir düşmanın büyüsünü keser ve 4 saniye susturur. 30 saniye bekleme.',
  cost: 0, cooldown: 30, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.3, targeting: 'target_instant', behavior: 'interrupt', range: 20,
  offGcd: true, tags: ['offgcd', 'spell', 'interrupt', 'shadow'], vfx: { cast: 'kick_arc', impact: 'interrupt_burst' }, sfx: { cast: 'interrupt' },
  params: { silence: 4, end: 0.55, chain: 0.05, move: 0.1, weight: 0 },
});
}
