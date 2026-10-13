/**
 * Barbar (barbarian) skill rows. PM-BA (docs/kits/plate-melee.md §3a, §4a, f1b, §h PM-BA): retuned kept rows, the new kit rows
 * (Kasap: bloodthirst, rampage, raging_blow, crushing_blow, avatar; Savaş Lordu: maul, thrash, incarnation) and the dropped / renamed
 * rows that stay defined but unslotted. OWNER: PM-BA (this file only). Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

const RAMPAGE_ANIM = ['2H_Melee_Attack_Slice', 'Unarmed_Melee_Attack_Punch_A', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'];

export function registerBarbarian(add: SkillAdd): void {
  // ======================================================================================================
  // BARBAR (barbarian) — Öfke. Chain + shared rows.
  // ======================================================================================================
  add({
    id: 'barbarian_basic', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'), defaultSlot: 'lmb',
    desc: 'Dev baltanla dört vuruşluk bir kombo yaparsın. Üçüncü vuruş tekmedir, sonuncusu yeri sarsan ağır bir balta darbesidir. Her vuruş Öfke kazandırır.',
    anim: '2H_Melee_Attack_Slice', targeting: 'melee_arc', range: 3.0, arc: 140, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.9 },
  });
  add({
    id: 'barbarian_basic_1', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'Geniş balta savurması.', anim: '2H_Melee_Attack_Slice', animSpeed: 1.5, hitTime: 0.44, targeting: 'melee_arc',
    range: 3.0, arc: 140, damage: { coef: 0.45, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.77, chain: 0.04, move: 0.12, stagger: 5, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 1 },
  });
  add({
    id: 'barbarian_basic_2', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'İleri atılan balta saplaması.', anim: '2H_Melee_Attack_Stab', animSpeed: 1.85, hitTime: 0.56, targeting: 'melee_arc',
    range: 3.3, arc: 55, damage: { coef: 0.5, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.96, chain: 0.04, move: 0.12, stagger: 5, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 0, lunge: 1.4, slow: 0.5, step: 2 },
  });
  add({
    id: 'barbarian_basic_3', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'Düşmanı geri savuran sert bir tekme.', anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5, hitTime: 0.36, targeting: 'melee_arc',
    range: 2.9, arc: 90, damage: { coef: 0.45, type: 'physical' }, knockback: 1.9, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.7, chain: 0.04, move: 0.12, stagger: 10, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.5, slow: 0.45, step: 3 },
  });
  add({
    id: 'barbarian_basic_4', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'Yeri sarsan ağır balta darbesi. Çevreye de hasar verir.', anim: '2H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.735, targeting: 'melee_arc',
    range: 3.2, arc: 80, damage: { coef: 1.1, type: 'physical' }, knockback: 1.8, tags: ['melee', 'basic', 'finisher'],
    vfx: { trail: 'slash_arc_big', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 1.2, chain: 0.06, move: 0.22, stagger: 12, gain: 8, gainExtra: 1, gainMax: 4, proc: 1, weight: 1, root: 1, lunge: 0.9, step: 4, finisher: 1, impactRadius: 1.8 },
  });

  // ---- shared utility rows (Savaş Lordu and Kasap bars)
  add({
    id: 'barbarian_cleave', classId: 'barbarian', name: 'Yarma', icon: I('skill-rend'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Baltanı 130 derecelik bir yayda savurarak %150 silah hasarı verirsin ve düşmanlarda 4 saniye kanama başlatırsın. 12 Öfke kazandırır. Kanlı Fırsat varken bekleme süresi sıfırlanır.',
    cost: -12, cooldown: 6, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.2, hitTime: 0.44, targeting: 'melee_arc', range: 3.6, arc: 130,
    damage: { coef: 1.5, type: 'physical' }, knockback: 0.8, statuses: [{ status: 'bleed', duration: 4, magnitude: 0.3 }],
    tags: ['melee', 'aoe', 'bleed'], vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.77, chain: 0.08, move: 0.2, stagger: 10, proc: 1, weight: 2, slow: 0.7, root: 1, threatMult: 1.5 },
  });
  add({
    id: 'barbarian_leap', classId: 'barbarian', name: 'Sıçrayış', icon: I('skill-leap'), unlockLevel: 3, defaultSlot: 's2',
    desc: 'Hedef noktaya sıçrayıp inişte %120 hasar verirsin ve düşmanları 2,5 saniye yavaşlatırsın. 20 Öfke kazandırır. 20 saniyelik bekleme süresi var.',
    cost: -20, cooldown: 20, castTime: 0, anim: 'Jump_Full_Short', targeting: 'leap', range: 14, radius: 4, duration: 0.55, hitTime: 0.55,
    damage: { coef: 1.2, type: 'physical' }, knockback: 1.5, statuses: [{ status: 'slow', duration: 2.5, magnitude: 0.4 }],
    tags: ['offgcd', 'melee', 'movement', 'aoe'], vfx: { impact: 'leap_land', ground: 'ground_slam' }, sfx: { cast: 'jump', impact: 'ground_slam' },
    params: { end: 0.8, chain: 0.12, move: 0.2, stagger: 25, proc: 1, weight: 2, fit: 1, unstoppable: 1 },
  });
  add({
    id: 'barbarian_whirlwind', classId: 'barbarian', name: 'Kasırga', icon: I('skill-whirlwind'), unlockLevel: 6, defaultSlot: 's1',
    desc: 'Tuşu basılı tutarak 2 saniye boyunca dönersin; çevrendeki tüm düşmanlara hasar verirsin ve dönerken hareket edebilirsin. Her vurduğun düşman için 3 Öfke kazanırsın (en çok 5 düşman). Bitince sonraki iki Kan Susuzluğu, Öfkeli Darbe veya Çılgın Hamle vuruşu yakındaki 3 düşmana da vurur.',
    cost: 0, cooldown: 0, castTime: 0, channel: 2, anim: '2H_Melee_Attack_Spinning', animSpeed: 1.0, hitTime: 0.1, targeting: 'self_aoe', radius: 3.2,
    damage: { coef: 0.38, type: 'physical', perTick: true }, ticks: 8, behavior: 'channel_aoe',
    selfStatuses: [{ status: 'meat_cleaver', duration: 10, stacks: 2 }],
    tags: ['melee', 'aoe', 'channel'], vfx: { cast: 'spin_slash', trail: 'spin_slash' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.3, chain: 0.1, stagger: 2, proc: 0.3, weight: 0, tick: 0.25, moveSlow: 0.6, immuneSlow: 1, gainPerTarget: 3, gainPerTargetMax: 5 },
  });
  add({
    id: 'barbarian_war_cry', classId: 'barbarian', name: 'Savaş Narası', icon: I('skill-war-cry'), unlockLevel: 10,
    desc: 'Kükreyerek yakındaki düşmanları korkutur, 8 saniye boyunca hasarını ve saldırı hızını artırırsın. Müttefiklerin de güçlenir. 40 Öfke kazandırır. (Ayrılmış: artık çubukta yok.)',
    cost: -40, cooldown: 20, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
    statuses: [{ status: 'fear', duration: 1.5 }],
    selfStatuses: [{ status: 'enrage', duration: 8, magnitude: 0.2 }],
    tags: ['aoe', 'shout', 'buff', 'cc'], vfx: { cast: 'war_cry' }, sfx: { cast: 'war_cry' },
    params: { end: 1.0, chain: 0.1, move: 0.15, stagger: 10, weight: 2, slow: 0.7, allyRange: 15, allyMore: 0.1, ringColor: 0xd6452e },
  });
  add({
    id: 'barbarian_fissure', classId: 'barbarian', name: 'Yer Yaran', icon: I('skill-ground-slam'), unlockLevel: 15,
    desc: 'Baltanı yere indirerek 12 metre boyunca ilerleyen bir yarık açarsın; yoldaki düşmanlar %340 hasar alır, sersemler ve havaya fırlar. (Ayrılmış: artık çubukta yok.)',
    cost: 35, cooldown: 7, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.35, hitTime: 0.735, targeting: 'custom', behavior: 'fissure', range: 12, radius: 2.5, speed: 30,
    damage: { coef: 3.4, type: 'physical' }, statuses: [{ status: 'stun', duration: 1.5 }],
    tags: ['melee', 'aoe', 'cc'], vfx: { impact: 'ground_slam', ground: 'shockwave' }, sfx: { cast: 'ground_slam', impact: 'ground_slam' },
    params: { end: 1.2, chain: 0.1, move: 0.25, stagger: 45, proc: 1, weight: 2, knockup: 0.8, root: 1 },
  });
  add({
    id: 'barbarian_axe_throw', classId: 'barbarian', name: 'Kükreyen Balta', icon: I('skill-throw-knife'), unlockLevel: 20, defaultSlot: 'r',
    desc: 'Baltayı 25 metreye fırlatırsın; havada hedefini takip eder ve %70 hasar verir. Hedefi 3 saniye sana kışkırtır (boss için 2 saniye) ve 15 saniye kanatır. 8 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Throw', animSpeed: 1.5, hitTime: 0.615, targeting: 'target_projectile', range: 25, speed: 22, radius: 0.8, pierce: 0, count: 1, homing: 4,
    damage: { coef: 0.7, type: 'physical' }, statuses: [{ status: 'taunt', duration: 3 }, { status: 'rend', duration: 15, magnitude: 1.4 }],
    tags: ['offgcd', 'projectile', 'ranged', 'taunt', 'bleed'], vfx: { projectile: 'bone_projectile', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 6, proc: 0.7, weight: 0, slow: 0.6, tauntFirst: 1, tauntIcd: 12, bossTaunt: 2, threatMult: 1.0 },
  });
  add({
    id: 'barbarian_blood_rage', classId: 'barbarian', name: 'Kan Hiddeti', icon: I('skill-berserk'), unlockLevel: 25, defaultSlot: 's3',
    desc: '8 saniye boyunca can çalma %8, hasar aldığın %30 azalır ve Kan Susuzluğu iyileştirmesi üç katına çıkar. 120 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 120, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.4, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'bloodrage', duration: 8 }],
    tags: ['offgcd', 'buff', 'self'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'war_cry' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 1, slow: 0.6 },
  });
  add({
    id: 'barbarian_ancestral_tempest', classId: 'barbarian', name: 'Ata Fırtınası', icon: I('skill-blade-storm'), unlockLevel: 30, defaultSlot: 'm90',
    desc: '3 saniye boyunca atalarının fırtınasında dönersin: çevrendeki düşmanları içine çeker, her vuruşta %100 hasar verirsin ve bu süre boyunca %30 az hasar alırsın. Can yenilersin. 90 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 90, castTime: 0, channel: 3, anim: '2H_Melee_Attack_Spin', animSpeed: 1.0, hitTime: 0.1, targeting: 'custom', behavior: 'tempest', offGcd: true,
    radius: 6, damage: { coef: 1.0, type: 'physical', perTick: true }, ticks: 6, knockback: 4,
    tags: ['offgcd', 'ultimate', 'melee', 'aoe', 'channel'], vfx: { cast: 'spin_slash', impact: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 0.3, chain: 0.2, stagger: 15, proc: 0.25, weight: 0, minResource: 0, consumeAll: 0, fixed: 1, tick: 0.5, pull: 3, dr: 0.3, unstoppable: 1, healPct: 0.12, threatMult: 2.0 },
  });

  // ======================================================================================================
  // Savaş Lordu (barbarian_warlord): Guardian loop
  // ======================================================================================================
  add({
    id: 'barbarian_provoke', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Kükreyen Kışkırtma', icon: I('skill-war-cry'), unlockLevel: 10,
    desc: 'Ayrılmış: Kükreyen Balta bu işi üstlendi. Bir düşmanı sana çevirir: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.25, targeting: 'custom', range: 25,
    behavior: 'provoke', tags: ['offgcd', 'taunt', 'threat', 'spec'], sfx: { cast: 'buff' }, params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'barbarian_iron_stance', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Demir Duruş', icon: I('skill-shield-wall'), unlockLevel: 10,
    desc: 'Her basışta 7 saniyelik bir Demir Duruş yığını kazanırsın (en çok 3 yığın; her yığın fiziksel hasarı %13 azaltır). 30 Öfke harcar; 0,5 saniyelik bekleme süresi var.',
    cost: 30, cooldown: 0.5, castTime: 0, anim: 'Block_Attack', animSpeed: 1.5, hitTime: 0.2, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'iron_stance', duration: 7 }], tags: ['offgcd', 'defensive', 'mitigation', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'barbarian_blood_shield', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Kan Yenilenmesi', icon: I('skill-mana-shield'), unlockLevel: 15,
    desc: 'Maksimum canının %32\'sini hemen yenilersin. 10 Öfke harcar; 26 saniyelik bekleme süresi var.',
    cost: 10, cooldown: 26, castTime: 0, anim: 'Use_Item', animSpeed: 2.2, hitTime: 0.3, targeting: 'self_buff', behavior: 'self_heal_pct', offGcd: true,
    params: { healPct: 0.32 }, tags: ['offgcd', 'defensive', 'heal', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'barbarian_maul', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Ezici Balta', icon: I('skill-cleave'), unlockLevel: 15,
    desc: '150 derecelik bir yayda 3 düşmana kadar %240 hasar verirsin. 40 Öfke harcar; Kanlı Kürk varsa ücretsizdir.',
    cost: 40, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.2, hitTime: 0.6, targeting: 'melee_arc', range: 3.4, arc: 150,
    damage: { coef: 2.4, type: 'physical' }, knockback: 1, tags: ['melee', 'aoe', 'spender', 'spec'],
    vfx: { trail: 'slash_arc_big', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.9, chain: 0.08, move: 0.2, stagger: 15, proc: 1, weight: 2, maxTargets: 3, cleaveFrac: 0.5, threatMult: 2.0 },
  });
  add({
    id: 'barbarian_thrash', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Paralama', icon: I('skill-blade-storm'), unlockLevel: 12,
    desc: 'Etrafındaki 4 metre içindeki düşmanlara %50 hasar verir ve kanama bırakırsın (en çok 3 yığın, 15 saniye). 5 Öfke kazandırır; 6 saniyelik bekleme süresi var.',
    cost: -5, cooldown: 6, castTime: 0, anim: '2H_Melee_Attack_Spin', animSpeed: 2.2, hitTime: 0.3, targeting: 'self_aoe', radius: 4,
    damage: { coef: 0.5, type: 'physical' }, statuses: [{ status: 'bleed', duration: 15, magnitude: 0.4, stacks: 1, maxStacks: 3 }, { status: 'slow', duration: 4, magnitude: 0.2 }],
    tags: ['melee', 'aoe', 'bleed', 'builder', 'spec'], vfx: { cast: 'spin_slash' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.6, chain: 0.1, stagger: 6, proc: 0.6, weight: 1, threatMult: 2.0 },
  });
  add({
    id: 'barbarian_last_stand', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Son Direniş', icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '8 saniye boyunca aldığın hasar %25 azalır ve kontrol altına alınamazsın. 20 Öfke kazanırsın. 45 saniyelik bekleme süresi var.',
    cost: -20, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'major_last_stand', offGcd: true,
    selfStatuses: [{ status: 'last_stand', duration: 8 }], tags: ['offgcd', 'major', 'defensive', 'buff'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, resGain: 20 },
  });
  add({
    id: 'barbarian_rallying_roar', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Toplayıcı Kükreme', icon: I('skill-war-cry'), unlockLevel: 20,
    desc: 'Ayrılmış: Savaş Lordu artık bu majoru kullanmaz. 20 metre içindeki müttefiklerin maks. canı 12 saniye boyunca %15 artar ve %15 can yenilerler.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', behavior: 'major_rally',
    selfStatuses: [{ status: 'rally', duration: 12 }], tags: ['major', 'defensive', 'heal'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
    params: { major: 90, range: 20, healPct: 0.15, fearR: 8, fearDur: 1.5, threat: 100 },
  });
  add({
    id: 'barbarian_incarnation', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Ata Kılığı', icon: I('skill-berserk'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '20 saniye boyunca maks. canın %15 artar, aldığın hasar %15 azalır ve Yarma ile Paralama bekleme süreleri yarıya iner. 180 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.5, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'ursoc_form', duration: 20 }], tags: ['offgcd', 'major', 'buff'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
  });

  // ======================================================================================================
  // Kasap (barbarian_butcher): Fury
  // ======================================================================================================
  add({
    id: 'barbarian_rend', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Parçala', icon: I('skill-rend'), unlockLevel: 10,
    desc: 'Ayrılmış: Kan Susuzluğu adını aldı. Önündeki düşmanları yarar ve kanama yığını bırakır.',
    cost: 20, cooldown: 6, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.2, hitTime: 0.6, targeting: 'melee_arc',
    range: 3.6, arc: 160, damage: { coef: 1.6, type: 'physical' }, statuses: [{ status: 'bleed', duration: 6, magnitude: 1, stacks: 1 }],
    tags: ['melee', 'bleed', 'spec'], params: { stagger: 12 }, sfx: { cast: 'swing_heavy' },
  });
  add({
    id: 'barbarian_execute', classId: 'barbarian', name: 'İdam', icon: I('skill-cleave'), unlockLevel: 15,
    desc: 'Canı %35\'in altındaki bir düşmanı kesersin (%30 daha fazla hasar). Ani Ölüm yığını varsa 25 Öfke yerine ücretsiz ve her can seviyesinde kullanılabilir. Boss olmayan, canı %10\'un altındaki düşmanı anında öldürür ve 15 Öfke geri kazandırır.',
    cost: 25, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.0, hitTime: 0.8, targeting: 'custom', behavior: 'execute',
    range: 3.2, arc: 70, damage: { coef: 3.5, type: 'physical' }, tags: ['melee', 'execute', 'spender', 'spec'], params: { stagger: 25, threshold: 0.35, cull: 0.10, refund: 15 },
  });
  add({
    id: 'barbarian_bloodbath', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kan Banyosu', icon: I('skill-rend'), unlockLevel: 10,
    desc: 'Pervasızlık sırasında Kan Susuzluğu yerine geçer: %220 hasar verir ve hedefte kanamayı %25 artırır. 8 Öfke kazandırır.',
    cost: -8, cooldown: 4.5, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.6, hitTime: 0.3, targeting: 'target_instant', range: 3.2,
    damage: { coef: 2.2, type: 'physical' }, statuses: [{ status: 'bleed', duration: 6, magnitude: 0.25 }],
    replaces: { skill: 'barbarian_bloodthirst', whileStatus: 'carnage' }, sharedCd: 'blood_strike',
    tags: ['melee', 'builder', 'bleed', 'spec'], vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'explosion' },
    params: { end: 0.8, chain: 0.1, stagger: 12, weight: 2, proc: 1 },
  });
  add({
    id: 'barbarian_bloodthirst', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kan Susuzluğu', icon: I('skill-rend'), unlockLevel: 10,
    desc: 'Bir düşmana %180 hasar verir ve canının bir kısmını geri kazanırsın. 8 Öfke kazandırır; 4,5 saniyelik bekleme süresi var. Her vuruşta %30 olasılıkla 4 saniye Kudurma kazanırsın.',
    cost: -8, cooldown: 4.5, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.4, hitTime: 0.3, targeting: 'target_instant', range: 3.2,
    damage: { coef: 1.8, type: 'physical' }, tags: ['melee', 'builder', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' },
    sharedCd: 'blood_strike', params: { end: 0.7, chain: 0.1, stagger: 8, weight: 1, proc: 1, hitHealPct: 0.03 },
  });
  add({
    id: 'barbarian_raging_blow', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Öfkeli Darbe', icon: I('skill-double-strike'), unlockLevel: 12,
    desc: 'İki hızlı vuruş yaparsın, her biri %80 hasar verir. 12 Öfke kazandırır. İki yük, her biri 8 saniyede dolar.',
    cost: -12, cooldown: 8, charges: 2, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.5, hitTime: 0.2, targeting: 'target_instant', range: 3.2,
    behavior: 'multi_strike', damage: { coef: 0.8, type: 'physical' }, tags: ['melee', 'builder', 'multi', 'spec'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_heavy' }, params: { hits: 2, gap: 0.17, end: 0.8, chain: 0.1, stagger: 8, weight: 1, proc: 1 },
  });
  add({
    id: 'barbarian_crushing_blow', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kemik Ezici', icon: I('skill-double-strike'), unlockLevel: 12,
    desc: 'Pervasızlık sırasında Öfkeli Darbe yerine geçer: iki vuruş, her biri %95 hasar verir ve ikincisi yere vurup yer sarsar. 12 Öfke kazandırır; yükler Öfkeli Darbe ile paylaşılır.',
    cost: -12, cooldown: 8, charges: 2, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.2, targeting: 'target_instant', range: 3.2,
    behavior: 'multi_strike', damage: { coef: 0.95, type: 'physical' }, replaces: { skill: 'barbarian_raging_blow', whileStatus: 'carnage' },
    tags: ['melee', 'builder', 'multi', 'spec'], vfx: { trail: 'slash_arc_big', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { hits: 2, gap: 0.17, end: 0.8, chain: 0.1, stagger: 8, weight: 1, proc: 1 },
  });
  add({
    id: 'barbarian_rampage', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Çılgın Hamle', icon: I('skill-berserk'), unlockLevel: 15,
    desc: 'Dört hızlı vuruş yaparsın, her biri %130 hasar verir. 4 saniye Kudurma kazanırsın (+%15 verilen hasar). 80 Öfke harcar; 1,5 saniyelik bekleme süresi var.',
    cost: 80, cooldown: 1.5, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 2.4, hitTime: 0.2, targeting: 'target_instant', range: 3.2,
    behavior: 'multi_strike', animCycle: RAMPAGE_ANIM, damage: { coef: 1.3, type: 'physical' }, tags: ['melee', 'spender', 'multi', 'spec'],
    vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'heavy_hit' },
    params: { hits: 4, gap: 0.17, end: 0.6, chain: 0.1, stagger: 10, weight: 1, proc: 1 },
  });
  add({
    id: 'barbarian_avatar', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Savaş Avatarı', icon: I('skill-war-cry'), unlockLevel: 20, defaultSlot: 'm45',
    desc: '20 saniye boyunca verdiğin hasar %10 artar. 45 saniyelik bekleme süresi var; Anger Management ile her 20 harcanan Öfke bu süreyi 1 saniye kısaltır.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.4, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'avatar', duration: 20, magnitude: 0.10 }], tags: ['offgcd', 'major', 'buff'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' }, params: { end: 0.7, chain: 0.1, weight: 1 },
  });
  add({
    id: 'barbarian_carnage', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Pervasızlık', icon: I('skill-berserk'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '12 saniye boyunca kritik şansın %20 artar ve Öfke kazanımın %50 yükselir. Kan Susuzluğu Kan Banyosuna, Öfkeli Darbe Kemik Ezici\'ye dönüşür. 90 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.35, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'carnage', duration: 12 }], tags: ['offgcd', 'major', 'offensive', 'buff'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
  });
  add({
    id: 'barbarian_wolf_howl', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kurt Narası', icon: I('skill-war-cry'), unlockLevel: 30, defaultSlot: 'm180',
    desc: 'Kurt gibi uluyarak 40 metre içindeki grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı verirsin. Etkilenenler 10 dakika Yorgun kalır. 180 saniyelik bekleme süresi var.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.0, hitTime: 0.5, targeting: 'custom', behavior: 'major_hero', offGcd: true,
    tags: ['offgcd', 'major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 180, range: 40, dur: 40, sated: 600 },
  });
}
