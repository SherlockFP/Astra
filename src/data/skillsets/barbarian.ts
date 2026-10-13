/**
 * PM-00c (docs/kits/plate-melee.md §h): Barbar (barbarian) skill rows, moved verbatim out of data/skills.ts (class rows,
 * the two spec blocks, the barbarian majors; same relative order as before). OWNER: PM-BA from now on (this file only).
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerBarbarian(add: SkillAdd): void {
  // ======================================================================================================
  // BARBAR (barbarian) — Öfke
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
    range: 3.0, arc: 140, damage: { coef: 1.1, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.77, chain: 0.04, move: 0.12, stagger: 5, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.6, slow: 0.5, step: 1 },
  });
  add({
    id: 'barbarian_basic_2', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'İleri atılan balta saplaması.', anim: '2H_Melee_Attack_Stab', animSpeed: 1.85, hitTime: 0.56, targeting: 'melee_arc',
    range: 3.3, arc: 55, damage: { coef: 1.1, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.96, chain: 0.04, move: 0.12, stagger: 5, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 0, lunge: 1.4, slow: 0.5, step: 2 },
  });
  add({
    id: 'barbarian_basic_3', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'Düşmanı geri savuran sert bir tekme.', anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.5, hitTime: 0.36, targeting: 'melee_arc',
    range: 2.9, arc: 90, damage: { coef: 1.0, type: 'physical' }, knockback: 1.9, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.7, chain: 0.04, move: 0.12, stagger: 10, gain: 5, gainExtra: 1, gainMax: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.5, slow: 0.45, step: 3 },
  });
  add({
    id: 'barbarian_basic_4', classId: 'barbarian', name: 'Balta Kombosu', icon: I('skill-double-strike'),
    desc: 'Yeri sarsan ağır balta darbesi. Çevreye de hasar verir.', anim: '2H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.735, targeting: 'melee_arc',
    range: 3.2, arc: 80, damage: { coef: 2.2, type: 'physical' }, knockback: 1.8, tags: ['melee', 'basic', 'finisher'],
    vfx: { trail: 'slash_arc_big', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 1.2, chain: 0.06, move: 0.22, stagger: 12, gain: 8, gainExtra: 1, gainMax: 4, proc: 1, weight: 1, root: 1, lunge: 0.9, step: 4, finisher: 1, impactRadius: 1.8 },
  });
  add({
    id: 'barbarian_cleave', classId: 'barbarian', name: 'Yarma', icon: I('skill-rend'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Baltanı geniş bir yayda savurarak %240 silah hasarı verirsin ve düşmanlarda kanama başlatırsın.',
    cost: 25, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.2, hitTime: 0.44, targeting: 'melee_arc', range: 3.6, arc: 200,
    damage: { coef: 2.4, type: 'physical' }, knockback: 0.8, statuses: [{ status: 'bleed', duration: 4, magnitude: 0.3 }],
    tags: ['melee', 'aoe', 'bleed'], vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.77, chain: 0.08, move: 0.2, stagger: 10, proc: 1, weight: 2, slow: 0.7, root: 1 },
  });
  add({
    id: 'barbarian_leap', classId: 'barbarian', name: 'Sıçrayış', icon: I('skill-leap'), unlockLevel: 3, defaultSlot: 'q',
    desc: 'Hedef noktaya sıçrayıp inişte %220 hasar verirsin ve düşmanları yavaşlatırsın. 15 Öfke kazandırır.',
    cost: -15, cooldown: 9, castTime: 0, anim: 'Jump_Full_Short', targeting: 'leap', range: 14, radius: 4, duration: 0.55, hitTime: 0.55,
    damage: { coef: 2.2, type: 'physical' }, knockback: 1.5, statuses: [{ status: 'slow', duration: 2.5, magnitude: 0.4 }],
    tags: ['offgcd', 'melee', 'movement', 'aoe'], vfx: { impact: 'leap_land', ground: 'ground_slam' }, sfx: { cast: 'jump', impact: 'ground_slam' },
    params: { end: 0.8, chain: 0.12, move: 0.2, stagger: 25, proc: 1, weight: 2, fit: 1, unstoppable: 1 },
  });
  add({
    id: 'barbarian_whirlwind', classId: 'barbarian', name: 'Kasırga', icon: I('skill-whirlwind'), unlockLevel: 6, defaultSlot: 'e',
    desc: 'Tuşu basılı tutarak bir kasırga gibi dönersin ve çevrendeki tüm düşmanlara sürekli hasar verirsin. Dönerken hareket edebilirsin.',
    cost: 10, cooldown: 0, castTime: 0, channel: 6, anim: '2H_Melee_Attack_Spinning', animSpeed: 1.0, hitTime: 0.1, targeting: 'self_aoe', radius: 3.2,
    damage: { coef: 0.7, type: 'physical', perTick: true }, ticks: 24, behavior: 'channel_aoe',
    tags: ['melee', 'aoe', 'channel'], vfx: { cast: 'spin_slash', trail: 'spin_slash' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.3, chain: 0.1, stagger: 2, proc: 0.3, weight: 0, tick: 0.25, costPerSec: 16, moveSlow: 0.25, immuneSlow: 1, gain: 0 },
  });
  add({
    id: 'barbarian_war_cry', classId: 'barbarian', name: 'Savaş Narası', icon: I('skill-war-cry'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Kükreyerek yakındaki düşmanları korkutur, 8 saniye boyunca hasarını ve saldırı hızını artırırsın. Müttefiklerin de güçlenir. 40 Öfke kazandırır.',
    cost: -40, cooldown: 20, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
    statuses: [{ status: 'fear', duration: 1.5 }],
    selfStatuses: [{ status: 'enrage', duration: 8, magnitude: 0.2 }],
    tags: ['aoe', 'shout', 'buff', 'cc'], vfx: { cast: 'war_cry' }, sfx: { cast: 'war_cry' },
    params: { end: 1.0, chain: 0.1, move: 0.15, stagger: 10, weight: 2, slow: 0.7, allyRange: 15, allyMore: 0.1, ringColor: 0xd6452e },
  });
  add({
    id: 'barbarian_fissure', classId: 'barbarian', name: 'Yer Yaran', icon: I('skill-ground-slam'), unlockLevel: 15, defaultSlot: 's2',
    desc: 'Baltanı yere indirerek 12 metre boyunca ilerleyen bir yarık açarsın; yoldaki düşmanlar %340 hasar alır, sersemler ve havaya fırlar.',
    cost: 35, cooldown: 7, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.35, hitTime: 0.735, targeting: 'custom', behavior: 'fissure', range: 12, radius: 2.5, speed: 30,
    damage: { coef: 3.4, type: 'physical' }, statuses: [{ status: 'stun', duration: 1.5 }],
    tags: ['melee', 'aoe', 'cc'], vfx: { impact: 'ground_slam', ground: 'shockwave' }, sfx: { cast: 'ground_slam', impact: 'ground_slam' },
    params: { end: 1.2, chain: 0.1, move: 0.25, stagger: 45, proc: 1, weight: 2, knockup: 0.8, root: 1 },
  });
  add({
    id: 'barbarian_axe_throw', classId: 'barbarian', name: 'Dönen Balta', icon: I('skill-throw-knife'), unlockLevel: 20, defaultSlot: 's3',
    desc: 'Dönen bir balta fırlatırsın; gidişte ve dönüşte değdiği her düşmana %160 hasar verir ve kanatır.',
    cost: 15, cooldown: 2, castTime: 0, anim: 'Throw', animSpeed: 1.5, hitTime: 0.615, targeting: 'projectile', range: 14, speed: 22, radius: 0.8, pierce: 99, count: 1,
    damage: { coef: 1.6, type: 'physical' }, statuses: [{ status: 'bleed', duration: 3, magnitude: 0.2 }],
    tags: ['projectile', 'melee', 'bleed'], vfx: { projectile: 'bone_projectile', impact: 'hit_blood' }, sfx: { cast: 'swing_light' },
    behavior: 'boomerang',
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 6, proc: 0.7, weight: 0, slow: 0.6 },
  });
  add({
    id: 'barbarian_blood_rage', classId: 'barbarian', name: 'Kan Hiddeti', icon: I('skill-berserk'), unlockLevel: 25,
    desc: 'Mevcut canının %15\'ini feda ederek 10 saniye boyunca çılgına dönersin: can çalma, hasar ve Öfke üretimin artar, yavaşlatılamazsın.',
    cost: 0, cooldown: 35, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.4, targeting: 'self_buff',
    selfStatuses: [{ status: 'bloodrage', duration: 10 }],
    tags: ['buff', 'self'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'war_cry' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 1, hpCostPct: 0.15, slow: 0.6 },
  });
  add({
    id: 'barbarian_ancestral_tempest', classId: 'barbarian', name: 'Ata Fırtınası', icon: I('skill-blade-storm'), unlockLevel: 30, defaultSlot: 'r',
    desc: 'En az 50 Öfke harcayarak atalarının ruhunu çağırır, devasa bir fırtınayla çevrendeki düşmanları içine çekip parçalarsın. Harcanan her Öfke hasarı %1 artırır.',
    cost: 0, cooldown: 50, castTime: 0, channel: 2.4, anim: '2H_Melee_Attack_Spin', animSpeed: 1.0, hitTime: 0.1, targeting: 'custom', behavior: 'tempest',
    radius: 6, damage: { coef: 1.5, type: 'physical', perTick: true }, ticks: 8, knockback: 4,
    tags: ['ultimate', 'melee', 'aoe', 'channel'], vfx: { cast: 'spin_slash', impact: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 0.3, chain: 0.2, stagger: 15, proc: 0.25, weight: 0, minResource: 50, consumeAll: 1, fixed: 1, tick: 0.3, pull: 3, dr: 0.3, unstoppable: 1 },
  });

  // ---- Savaş Lordu (barbarian_warlord) ----
  add({
    id: 'barbarian_provoke', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Kükreyen Kışkırtma', icon: I('skill-war-cry'), unlockLevel: 10,
    desc: 'Bir düşmanı sana çevirir: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.25, targeting: 'custom', range: 25,
    behavior: 'provoke', tags: ['offgcd', 'taunt', 'threat', 'spec'], sfx: { cast: 'buff' }, params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'barbarian_iron_stance', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Demir Duruş', icon: I('skill-shield-wall'), unlockLevel: 10,
    desc: '5 saniye boyunca fiziksel hasarın %35\'ini azaltırsın ve sersemletilemezsin. İki yük, her biri 8 saniyede dolar.',
    cost: 20, cooldown: 8, charges: 2, castTime: 0, anim: 'Block_Attack', animSpeed: 1.5, hitTime: 0.2, targeting: 'self_buff',
    selfStatuses: [{ status: 'iron_stance', duration: 5 }], tags: ['offgcd', 'defensive', 'mitigation', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'barbarian_blood_shield', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Kan Zırhı', icon: I('skill-mana-shield'), unlockLevel: 15,
    desc: '8 saniye boyunca maks. canının %20\'si kadar bir kalkan kazanırsın (en fazla %45).',
    cost: 40, cooldown: 3, castTime: 0, anim: 'Use_Item', animSpeed: 2.2, hitTime: 0.3, targeting: 'custom', behavior: 'absorb_self',
    selfStatuses: [{ status: 'blood_shield', duration: 8 }], params: { absorbPct: 0.20, capPct: 0.45 }, tags: ['defensive', 'absorb', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
  });
  // ---- Kasap (barbarian_butcher) ----
  add({
    id: 'barbarian_rend', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Parçala', icon: I('skill-rend'), unlockLevel: 10,
    desc: 'Önündeki düşmanları yarar; vuruş kanamaya yol açar ve her vurulan düşmana bir kanama yığını ekler.',
    cost: 20, cooldown: 6, castTime: 0, anim: '2H_Melee_Attack_Slice', animSpeed: 1.2, hitTime: 0.6, targeting: 'melee_arc',
    range: 3.6, arc: 160, damage: { coef: 1.6, type: 'physical' }, statuses: [{ status: 'bleed', duration: 6, magnitude: 1, stacks: 1 }],
    tags: ['melee', 'bleed', 'spec'], params: { stagger: 12 }, sfx: { cast: 'swing_heavy' },
  });
  add({
    id: 'barbarian_execute', classId: 'barbarian', spec: 'barbarian_butcher', name: 'İdam', icon: I('skill-cleave'), unlockLevel: 15,
    desc: 'Canı %35\'in altındaki bir düşmanı kesersin. Kanama yığınına göre daha çok vurur; %10\'un altındaki (boss olmayan) düşmanı anında öldürür.',
    cost: 30, cooldown: 5, castTime: 0, anim: '2H_Melee_Attack_Chop', animSpeed: 1.0, hitTime: 0.8, targeting: 'custom', behavior: 'execute',
    range: 3.2, arc: 70, damage: { coef: 5.0, type: 'physical' }, tags: ['melee', 'execute', 'spec'], params: { stagger: 25, threshold: 0.35, cull: 0.10, refund: 15, bleedCoef: 0.4 },
  });

  add({
    id: 'barbarian_last_stand', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Son Direniş', icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '10 saniye boyunca maks. canın %30 artar, aldığın hasar %20 azalır ve kontrol altına alınamazsın. 30 Öfke kazanırsın.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'custom', behavior: 'major_last_stand',
    selfStatuses: [{ status: 'last_stand', duration: 10 }], tags: ['major', 'defensive', 'buff'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, resGain: 30 },
  });
  add({
    id: 'barbarian_rallying_roar', classId: 'barbarian', spec: 'barbarian_warlord', name: 'Toplayıcı Kükreme', icon: I('skill-war-cry'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '20 metre içindeki müttefiklerin maks. canı 12 saniye boyunca %15 artar ve hemen %15 can yenilerler. Yakındaki düşmanlar korkar ve dikkatini sana verir.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', behavior: 'major_rally',
    selfStatuses: [{ status: 'rally', duration: 12 }], tags: ['major', 'defensive', 'heal'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' },
    params: { major: 90, range: 20, healPct: 0.15, fearR: 8, fearDur: 1.5, threat: 100 },
  });
  add({
    id: 'barbarian_bloodbath', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kan Banyosu', icon: I('skill-rend'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '12 metre içindeki tüm kanamalar kalan hasarlarının %150\'siyle patlar. Patlayan her düşman için Öfke ve can kazanırsın.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.3, targeting: 'custom', behavior: 'major_bloodbath',
    tags: ['major', 'offensive', 'bleed'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'explosion' },
    params: { major: 45, range: 12, mult: 1.5, resGain: 20, healPct: 0.015, healCap: 0.12 },
  });
  add({
    id: 'barbarian_carnage', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Katliam Çılgınlığı', icon: I('skill-berserk'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '15 saniye boyunca hasarın %35, saldırı hızın %30 artar; yavaşlatılamaz ve köklenemezsin. Aldığın iyileştirme %30 azalır.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.35, targeting: 'self_buff', selfStatuses: [{ status: 'carnage', duration: 15 }],
    tags: ['major', 'offensive', 'buff'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
  });
  add({
    id: 'barbarian_wolf_howl', classId: 'barbarian', spec: 'barbarian_butcher', name: 'Kurt Narası', icon: I('skill-war-cry'), unlockLevel: 30, defaultSlot: 'm180',
    desc: 'Kurt gibi uluyarak tüm grubuna 40 saniye boyunca %30 saldırı/büyü hızı ve %10 hareket hızı verirsin. Etkilenenler 2.5 dakika Yorgun kalır.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.0, hitTime: 0.5, targeting: 'custom', behavior: 'major_hero',
    tags: ['major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 180, range: 40, dur: 40, sated: 150 },
  });
}
