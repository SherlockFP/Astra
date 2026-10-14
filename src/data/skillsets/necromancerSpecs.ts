/**
 * Nekromant spec rows: Kemik Muhafızı (necromancer_bone, Blood Death Knight, tank) and Ordu Efendisi (necromancer_summoner, Unholy Death
 * Knight, dps). PM-NE (docs/kits/plate-melee.md §8a, §9a; behaviour map: docs/kits/necromancer_behaviors.md). Rows shared by both specs
 * (chains, Ölüm Atılışı, Büyü Karşıtı Kalkan, Zihin Dondurma, Buz Gibi Sebat) live in necromancer.ts.
 * Rune costs go through `pip { id: 'rune' }` (SkillSystem.pay), Öz costs through `cost`, Öz gains through `params.gain`.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerNecromancerSpecs(add: SkillAdd): void {
  // ======================================================================================================
  // KEMİK MUHAFIZI (necromancer_bone): Bone Shield charges, Ölüm Darbesi pays back the last 5 s of damage, Ölüm Kancası pulls
  // ======================================================================================================
  add({
    id: 'necro_heart_strike', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kalp Darbesi (Heart Strike)', icon: I('skill-double-strike'), unlockLevel: 10, defaultSlot: 'rmb',
    desc: 'Önündeki düşmana ve yanındaki bir düşmana iki kez %50 fiziksel hasar verirsin (toplam %100) ve ikisini 8 saniye %20 yavaşlatırsın. 1 Rün harcar, 5 Öz kazandırır.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.5, hitTime: 0.44, targeting: 'target_instant', behavior: 'multi_cleave',
    range: 3.2, arc: 90, damage: { coef: 0.5, type: 'physical' }, pip: { id: 'rune', cost: 1 },
    statuses: [{ status: 'slow', duration: 8, magnitude: 0.2 }], tags: ['melee', 'builder', 'physical'],
    vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { hits: 2, gap: 0.12, cleave: 1, gain: 5, end: 0.8, chain: 0.06, move: 0.15, stagger: 6, proc: 0.8, weight: 0, lunge: 0.8, slow: 0.5 },
  });
  add({
    id: 'necro_death_strike', classId: 'necromancer', spec: 'necromancer_bone', name: 'Ölüm Darbesi (Death Strike)', icon: I('skill-life-drain'), unlockLevel: 10, defaultSlot: 'q',
    desc: 'Hedefe %140 fiziksel hasar verirsin ve son 5 saniyede aldığın hasarın %20\'si kadar (en az maks. canının %7\'si) iyileşirsin. İyileşmenin %20\'si kadar Kan Zırhı kazanırsın. 45 Öz harcar. Vampirik Kan sırasında şifa %30 artar.',
    cost: 45, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.56, targeting: 'target_instant', behavior: 'death_strike',
    range: 3.2, arc: 90, damage: { coef: 1.4, type: 'physical' }, tags: ['melee', 'spender', 'heal', 'physical'],
    vfx: { cast: 'heal_burst', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'heavy_hit' },
    params: { window: 5, healPctOfRecent: 0.2, minHealPct: 0.07, vbMult: 1.3, shieldPct: 0.2, shieldCapPct: 0.45, shieldDur: 10, end: 0.9, chain: 0.08, move: 0.18, stagger: 14, proc: 1, weight: 2, lunge: 1.0, threatMult: 1.5 },
  });
  add({
    id: 'necro_marrowrend', classId: 'necromancer', spec: 'necromancer_bone', name: 'İlik Söken (Marrowrend)', icon: I('skill-rend'), unlockLevel: 12, defaultSlot: 'e',
    desc: 'Hedefe %120 fiziksel hasar verirsin ve 30 saniye süren 3 Kemik Zırhı kazanırsın (en çok 10; her yük hasarı %3 azaltır, aldığın her yakın dövüş vuruşu bir yük harcar). 2 Rün harcar, 10 Öz kazandırır.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.4, hitTime: 0.735, targeting: 'target_instant', behavior: 'strike_self_buff',
    range: 3.2, damage: { coef: 1.2, type: 'physical' }, pip: { id: 'rune', cost: 2 },
    selfStatuses: [{ status: 'bone_armor', duration: 30, stacks: 3 }], tags: ['melee', 'builder', 'defensive', 'bone'],
    vfx: { cast: 'bone_burst', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'bone_impact' },
    params: { gain: 10, end: 1.1, chain: 0.08, move: 0.2, stagger: 8, proc: 1, weight: 1, lunge: 0.9 },
  });
  add({
    id: 'necro_deaths_grip', classId: 'necromancer', spec: 'necromancer_bone', name: 'Ölüm Kancası (Death’s Grip)', icon: I('skill-taunt'), unlockLevel: 15, defaultSlot: 'r',
    desc: '30 metre içindeki bir düşmanı 3 metreye kadar kendine çeker ve 3 saniye kışkırtırsın. Boss çekilmez, yalnızca 2 saniye kışkırtılır. 25 saniye bekleme.',
    cost: 0, cooldown: 25, castTime: 0, anim: 'Throw', animSpeed: 1.8, hitTime: 0.615, targeting: 'target_projectile', behavior: 'grip', offGcd: true,
    range: 30, speed: 40, radius: 0.5, tags: ['offgcd', 'taunt', 'threat', 'cc', 'spell', 'shadow'],
    vfx: { cast: 'drain_beam', impact: 'hit_magic' }, sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
    params: { taunt: 3, bossTaunt: 2, pullTo: 3, threatBoost: 100, end: 0.7, chain: 0.05, move: 0.1, weight: 0 },
  });
  add({
    id: 'necro_blood_boil', classId: 'necromancer', spec: 'necromancer_bone', name: 'Kan Kaynatma (Blood Boil)', icon: I('skill-poison-cloud'), unlockLevel: 12, defaultSlot: 's1',
    desc: 'Çevrendeki 5 metrelik alanda en fazla 8 düşmana %140 gölge hasarı verirsin ve hepsine 24 saniye süren Kan Vebası bırakırsın (%140 gölge hasarı). İki yük, her biri 7.5 saniyede dolar.',
    cost: 0, cooldown: 7.5, charges: 2, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.95, targeting: 'self_aoe', radius: 5,
    damage: { coef: 1.4, type: 'shadow' }, statuses: [{ status: 'blood_plague', duration: 24, magnitude: 1 }], tags: ['spell', 'aoe', 'shadow', 'dot', 'builder'],
    vfx: { cast: 'blood_burst', impact: 'hit_blood' }, sfx: { cast: 'corpse_pop', impact: 'explosion' },
    params: { maxTargets: 8, end: 1.2, chain: 0.1, move: 0.2, stagger: 4, proc: 0.6, weight: 1, threatMult: 1.5 },
  });
  add({
    id: 'necro_vampiric_blood', classId: 'necromancer', spec: 'necromancer_bone', name: 'Vampirik Kan (Vampiric Blood)', icon: I('skill-regeneration'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '10 saniye boyunca maks. canın %30 ve aldığın şifa %30 artar; Ölüm Darbesi %30 daha çok iyileştirir. Harcanan her 20 Öz majör bekleme sürelerini 1 saniye azaltır. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'vampiric_blood', duration: 10 }], tags: ['offgcd', 'major', 'defensive', 'buff', 'heal'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' }, params: { end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });
  add({
    id: 'necro_dancing_rune_weapon', classId: 'necromancer', spec: 'necromancer_bone', name: 'Hayalet Orak Dansı (Dancing Rune Weapon)', icon: I('skill-parry'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '12 saniye boyunca hayalet bir orak seni taklit eder: Kalp Darbesi, Kan Kaynatma, İlik Söken ve Ölüm Darbesi\'nin %50\'si kadar ek vuruş yapar; savuşturma penceren genişler. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.6, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'dancing_rune_weapon', duration: 12 }], tags: ['offgcd', 'major', 'offensive', 'defensive', 'buff', 'shadow'],
    vfx: { cast: 'shape_echo' }, sfx: { cast: 'curse_cast' }, params: { end: 1.0, chain: 0.1, move: 0.2, weight: 3 },
  });

  // ======================================================================================================
  // ORDU EFENDİSİ (necromancer_summoner): permanent ghoul, Lesser Ghouls, Army (Ölüm Emri), Karanlık Dönüşüm, Ani Kıyamet
  // ======================================================================================================
  add({
    id: 'necro_scourge_strike', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Ölüm Kırbacı (Scourge Strike)', icon: I('skill-shadow-grasp'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: '25 metre içindeki hedefe %55 gölge hasarlı bir kırbaç vurursun. Hedefte Çürük Bulaşı varsa bir yük harcanır: hasar %35 artar, veba çevredeki vebalı düşmanlara %50 hasarla patlar ve bir Küçük Ghul (8 sn, en çok 3) doğar. 1 Rün harcar, 10 Öz kazandırır. Ani Kıyamet tetikleyebilir.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.373, targeting: 'target_instant', behavior: 'scourge_strike',
    range: 25, damage: { coef: 0.55, type: 'shadow' }, pip: { id: 'rune', cost: 1 }, tags: ['spell', 'builder', 'shadow', 'minion'],
    minion: { id: 'necro_lesser_ghoul', count: 1, cap: 3, group: 'lesser', life: 8 },
    vfx: { cast: 'slash_arc', impact: 'hit_magic' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { gain: 10, stackMore: 0.35, splashCoef: 0.5, splashRadius: 5, splashMax: 8, summonPerStack: 1, end: 0.7, chain: 0.06, move: 0.12, stagger: 4, proc: 0.8, weight: 0 },
  });
  add({
    id: 'necro_death_order', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Ölüm Emri', icon: I('skill-war-cry'), unlockLevel: 20,
    desc: 'Ölüler Ordusu sürerken Ölüm Kırbacı\'nın yerine geçer: ordu ghulleri hedefe atlar ve toplam %200 gölge hasarı verir; 3 ya da daha çok düşman varsa 5 hedefe %50 hasar sıçrar. Çürük Bulaşı yükü harcar. 1 Rün harcar, 10 Öz kazandırır.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.4, hitTime: 0.5, targeting: 'target_instant', behavior: 'death_order',
    range: 30, damage: { coef: 0, type: 'shadow' }, pip: { id: 'rune', cost: 1 }, replaces: { skill: 'necro_scourge_strike', whileStatus: 'army' },
    tags: ['spell', 'builder', 'shadow', 'minion'], vfx: { cast: 'curse_ring', impact: 'grave_rise' }, sfx: { cast: 'curse_cast', impact: 'bone_impact' },
    params: { gain: 10, cmdCoef: 0.25, focusSec: 6, armyOnly: 1, cleaveMin: 3, cleaveRadius: 5, cleaveMax: 5, cleaveMult: 0.5, end: 0.9, chain: 0.06, move: 0.15, weight: 0 },
  });
  add({
    id: 'necro_death_coil', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Ölüm Sarmalı (Death Coil)', icon: I('skill-curse'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Hedefi izleyen bir gölge sarmalı fırlatırsın: %160 gölge hasarı verir ve Kemik Ghul\'unun canının %5\'ini yeniler (kendi minyonuna nişan alırsan onu %20 iyileştirir). 30 Öz harcar; Ani Kıyamet varken bedavadır. Karanlık Dönüşüm sırasında %20 güçlüdür.',
    cost: 30, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.373, targeting: 'target_projectile', behavior: 'death_coil',
    range: 30, speed: 32, radius: 0.5, homing: 5, damage: { coef: 1.6, type: 'shadow' }, tags: ['spell', 'projectile', 'spender', 'shadow'],
    vfx: { cast: 'death_nova', projectile: 'shadow_projectile', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { petHealPct: 0.05, minionHealPct: 0.2, dtMore: 0.2, end: 0.75, chain: 0.06, move: 0.12, stagger: 6, proc: 1, weight: 0 },
  });
  add({
    id: 'necro_festering_strike', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Çürüten Darbe (Festering Strike)', icon: I('skill-poison-dagger'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Önündeki düşmana asanla %70 fiziksel hasar verirsin ve hedefe 20 saniye süren 3 Çürük Bulaşı yükü bırakırsın. 2 Rün harcar, 15 Öz kazandırır. Ani Kıyamet tetikleyebilir.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Stab', animSpeed: 1.5, hitTime: 0.56, targeting: 'target_instant',
    range: 3.2, damage: { coef: 0.7, type: 'physical' }, pip: { id: 'rune', cost: 2 }, statuses: [{ status: 'vile_contagion', duration: 20, stacks: 3 }],
    tags: ['melee', 'builder', 'physical', 'poison'], vfx: { cast: 'poison_burst', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'poison_impact' },
    params: { gain: 15, end: 0.95, chain: 0.06, move: 0.15, stagger: 6, proc: 0.9, weight: 4, lunge: 1.0 },
  });
  add({
    id: 'necro_outbreak', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Salgın Çıkışı (Outbreak)', icon: I('skill-poison-arrow'), unlockLevel: 10, defaultSlot: 'r',
    desc: '25 metre içindeki hedefe %30 gölge hasarı verir ve 21 saniye süren Zehirli Veba bırakırsın (toplam %180 gölge hasarı; süre dolmadan yenilenince kalan süre korunur). 1 Rün harcar.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.373, targeting: 'target_instant',
    range: 25, damage: { coef: 0.3, type: 'shadow' }, pip: { id: 'rune', cost: 1 }, statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 6 }],
    tags: ['spell', 'dot', 'shadow', 'poison'], vfx: { cast: 'poison_projectile', impact: 'poison_cloud' }, sfx: { cast: 'shadow_cast', impact: 'poison_impact' },
    params: { end: 0.7, chain: 0.06, move: 0.12, stagger: 2, proc: 0.5, weight: 0 },
  });
  add({
    id: 'necro_epidemic', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Salgın (Epidemic)', icon: I('skill-poison-cloud'), unlockLevel: 15, defaultSlot: 's1',
    desc: 'Hedefe ve çevresindeki 8 metrelik alanda en fazla 8 düşmana %160 gölge hasarı verirsin; hedefteki Zehirli Veba kalan süresiyle hepsine yayılır. 20 Öz harcar; Ani Kıyamet varken bedavadır. Karanlık Dönüşüm sırasında %20 güçlüdür.',
    cost: 20, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.95, targeting: 'target_instant', behavior: 'spread_aoe',
    range: 25, radius: 8, damage: { coef: 1.6, type: 'shadow' }, statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 1.125 }],
    tags: ['spell', 'aoe', 'spender', 'shadow', 'dot'], vfx: { cast: 'poison_cloud', impact: 'death_nova' }, sfx: { cast: 'shadow_cast', impact: 'corpse_pop' },
    params: { maxTargets: 8, dtMore: 0.2, end: 1.2, chain: 0.1, move: 0.2, stagger: 4, proc: 0.6, weight: 1 },
  });
  add({
    id: 'necro_dark_transformation', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Karanlık Dönüşüm (Dark Transformation)', icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '15 saniye boyunca Kemik Ghul\'un iki kat hasar verir ve seçili hedefe saldırır; Ölüm Sarmalı ve Salgın %20 güçlenir. 45 saniye bekleme.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.6, targeting: 'self_buff', behavior: 'empower_minions', offGcd: true,
    selfStatuses: [{ status: 'dark_transformation', duration: 15 }], tags: ['offgcd', 'major', 'offensive', 'buff', 'minion', 'shadow'],
    vfx: { cast: 'curse_ring' }, sfx: { cast: 'curse_cast' }, params: { dmgMult: 2, end: 1.0, chain: 0.1, move: 0.2, weight: 3 },
  });
  add({
    id: 'necro_army_of_the_dead', classId: 'necromancer', spec: 'necromancer_summoner', name: 'Ölüler Ordusu (Army of the Dead)', icon: I('skill-summon-skeleton'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '1.2 saniyelik büyüyle çevrende 8 Ordu Ghulü doğurursun: 30 saniye yaşarlar, minyon sınırına takılmazlar. 30 saniye boyunca Ölüm Kırbacı, Ölüm Emri\'ne dönüşür. 1 Rün harcar. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 1.2, anim: 'Spellcast_Long', animSpeed: 1.0, hitTime: 1.2, targeting: 'self_buff', behavior: 'summon_ring', offGcd: true,
    pip: { id: 'rune', cost: 1 }, minion: { id: 'necro_army_ghoul', count: 8, life: 30, ignoreCap: true, group: 'army' },
    selfStatuses: [{ status: 'army', duration: 30 }], tags: ['offgcd', 'major', 'offensive', 'summon', 'minion', 'shadow'],
    vfx: { cast: 'grave_rise' }, sfx: { cast: 'raise_dead' }, params: { ringRadius: 4.5, end: 1.4, chain: 0.1, move: 0.2, weight: 3 },
  });

  // ======================================================================================================
  // BUZ KIYICISI (necromancer_frost): Obliterate / Frost Strike builders and spenders, Howling Blast AoE, Killing Machine and Rime procs
  // (WoW Frost Death Knight, docs/WOW_ABILITY_MAP.md; the Frost tree and APL are in talentTrees/raw and rotations_kit_necromancer.ts)
  // ======================================================================================================
  add({
    id: 'necro_obliterate', classId: 'necromancer', spec: 'necromancer_frost', name: 'Yok Edici Darbe (Obliterate)', icon: I('skill-sword-slash'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Önündeki düşmana %100 fiziksel hasar verirsin. 1 Rün harcar, 15 Öz kazandırır. Öldürücü Makine varken bir sonraki Yok Edici Darbe kesin kritik vurur.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.44, targeting: 'target_instant',
    range: 3.2, arc: 90, damage: { coef: 1.0, type: 'physical' }, pip: { id: 'rune', cost: 1 }, tags: ['melee', 'builder', 'physical'],
    vfx: { cast: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    params: { gain: 15, end: 0.9, chain: 0.06, move: 0.15, stagger: 8, proc: 1, weight: 1, lunge: 0.8 },
  });
  add({
    id: 'necro_frost_strike', classId: 'necromancer', spec: 'necromancer_frost', name: 'Buz Darbesi (Frost Strike)', icon: I('skill-thrust'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Önündeki düşmana %130 buz hasarı verirsin. 30 Öz harcar. Kritik vuruşta Öldürücü Makine kazanırsın.',
    cost: 30, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.56, targeting: 'target_instant',
    range: 3.2, arc: 90, damage: { coef: 1.3, type: 'frost' }, tags: ['melee', 'spender', 'frost'],
    vfx: { cast: 'frost_burst', impact: 'hit_magic' }, sfx: { cast: 'swing_heavy', impact: 'frost_impact' },
    params: { end: 0.9, chain: 0.08, move: 0.18, stagger: 10, proc: 1, weight: 2, lunge: 1.0 },
  });
  add({
    id: 'necro_howling_blast', classId: 'necromancer', spec: 'necromancer_frost', name: 'Uluyan Patlama (Howling Blast)', icon: I('skill-ice-bolt'), unlockLevel: 10, defaultSlot: 'e',
    desc: 'Çevrendeki 8 metrelik alanda en fazla 8 düşmana %60 buz hasarı verirsin ve hepsine 24 saniye süren Buz Humması bırakırsın. 1 Rün harcar. Kırağı varken hasar %50 artar.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.0, hitTime: 0.95, targeting: 'self_aoe', radius: 8,
    damage: { coef: 0.6, type: 'frost' }, pip: { id: 'rune', cost: 1 }, statuses: [{ status: 'frost_fever', duration: 24, magnitude: 1 }],
    tags: ['spell', 'aoe', 'frost', 'dot', 'builder'],
    vfx: { cast: 'frost_burst', impact: 'hit_magic' }, sfx: { cast: 'ice_chime', impact: 'frost_impact' },
    params: { maxTargets: 8, end: 1.0, chain: 0.1, move: 0.2, stagger: 4, proc: 0.6, weight: 1 },
  });
  add({
    id: 'necro_remorseless_winter', classId: 'necromancer', spec: 'necromancer_frost', name: 'Acımasız Kış (Remorseless Winter)', icon: I('skill-ground-slam'), unlockLevel: 12, defaultSlot: 's1',
    desc: 'Çevrendeki 8 metrelik alanda en fazla 8 düşmana %40 buz hasarı verirsin ve hepsini 8 saniye %20 yavaşlatırsın. 25 saniye bekleme.',
    cost: 0, cooldown: 25, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.9, targeting: 'self_aoe', radius: 8,
    damage: { coef: 0.4, type: 'frost' }, statuses: [{ status: 'slow', duration: 8, magnitude: 0.2 }], tags: ['spell', 'aoe', 'frost', 'slow'],
    vfx: { cast: 'frost_nova', impact: 'frost_burst' }, sfx: { cast: 'ice_chime', impact: 'frost_impact' },
    params: { maxTargets: 8, end: 1.0, chain: 0.1, move: 0.2, stagger: 4, proc: 0.6, weight: 1 },
  });
  add({
    id: 'necro_empower_rune_weapon', classId: 'necromancer', spec: 'necromancer_frost', name: 'Rün Silahı Güçlendirme (Empower Rune Weapon)', icon: I('skill-war-cry'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Rünlerini anında altı rüne tamamlarsın. 60 saniye bekleme.',
    cost: 0, cooldown: 60, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    pip: { id: 'rune', cost: 0, gain: 6 }, tags: ['offgcd', 'major', 'buff', 'rune'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' }, params: { end: 0.9, chain: 0.1, move: 0.2, weight: 1 },
  });
  add({
    id: 'necro_pillar_of_frost', classId: 'necromancer', spec: 'necromancer_frost', name: 'Buz Sütunu (Pillar of Frost)', icon: I('skill-berserk'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '12 saniye boyunca hasarın %20 artar. 60 saniye bekleme.',
    cost: 0, cooldown: 60, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.6, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'pillar_of_frost', duration: 12 }], tags: ['offgcd', 'major', 'offensive', 'buff', 'frost'],
    vfx: { cast: 'frost_nova' }, sfx: { cast: 'ice_chime' }, params: { end: 1.0, chain: 0.1, move: 0.2, weight: 3 },
  });
  add({
    id: 'necro_frostwyrms_fury', classId: 'necromancer', spec: 'necromancer_frost', name: 'Buz Ejderi Öfkesi (Frostwyrm\'s Fury)', icon: I('skill-curse'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '1.2 saniyelik büyüden sonra 10 metrelik alandaki en fazla 10 düşmana %250 buz hasarı verirsin ve 6 saniye %30 yavaşlatırsın. 180 saniye bekleme.',
    cost: 0, cooldown: 180, castTime: 1.2, anim: 'Spellcast_Long', animSpeed: 1.0, hitTime: 1.2, targeting: 'self_aoe', radius: 10, offGcd: true,
    damage: { coef: 2.5, type: 'frost' }, statuses: [{ status: 'slow', duration: 6, magnitude: 0.3 }], tags: ['offgcd', 'major', 'offensive', 'spell', 'frost', 'aoe'],
    vfx: { cast: 'frost_nova', impact: 'frost_burst' }, sfx: { cast: 'ice_chime', impact: 'frost_impact' },
    params: { maxTargets: 10, end: 1.4, chain: 0.1, move: 0.2, weight: 3 },
  });

  // ======================================================================================================
  // ORTAK (all three specs): Ölüm ve Çürüme (Death and Decay) AoE, unslotted in the spec lists
  // ======================================================================================================
  add({
    id: 'necro_death_and_decay', classId: 'necromancer', name: 'Ölüm ve Çürüme (Death and Decay)', icon: I('skill-poison-cloud'), unlockLevel: 12,
    desc: 'Çevrendeki 8 metrelik alanda en fazla 8 düşmana %60 gölge hasarı verirsin ve hepsine 10 saniye süren Ölüm ve Çürüme bırakırsın. 1 Rün harcar.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.8, targeting: 'self_aoe', radius: 8,
    damage: { coef: 0.6, type: 'shadow' }, pip: { id: 'rune', cost: 1 }, statuses: [{ status: 'death_and_decay', duration: 10, magnitude: 1 }],
    tags: ['spell', 'aoe', 'shadow', 'dot'], vfx: { cast: 'death_nova', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { maxTargets: 8, end: 1.0, chain: 0.1, move: 0.2, stagger: 4, proc: 0.6, weight: 1 },
  });
}
