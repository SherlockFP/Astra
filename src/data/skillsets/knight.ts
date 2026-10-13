/**
 * PM-00c (docs/kits/plate-melee.md §h): Şövalye (knight) skill rows, moved verbatim out of data/skills.ts (class rows,
 * the two spec blocks, the knight majors; same relative order as before). OWNER: PM-KN from now on (this file only).
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerKnight(add: SkillAdd): void {
  // ======================================================================================================
  // ŞÖVALYE (knight) — Kararlılık
  // ======================================================================================================
  add({
    id: 'knight_basic', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'), defaultSlot: 'lmb',
    desc: 'Kılıcınla dört vuruşluk bir kombo yaparsın. Son vuruş düşmanı geri iten ağır bir bitiricidir. Her vuruş Kararlılık kazandırır.',
    anim: '1H_Melee_Attack_Slice_Diagonal', targeting: 'melee_arc', range: 2.6, arc: 120, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.85 },
  });
  add({
    id: 'knight_basic_1', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Çapraz kılıç darbesi.', anim: '1H_Melee_Attack_Slice_Diagonal', animSpeed: 1.4, hitTime: 0.38, targeting: 'melee_arc',
    range: 2.6, arc: 120, damage: { coef: 1.0, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.7, chain: 0.04, move: 0.1, stagger: 3, gain: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.7, slow: 0.45, step: 1 },
  });
  add({
    id: 'knight_basic_2', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Geniş yatay kılıç darbesi.', anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.4, hitTime: 0.427, targeting: 'melee_arc',
    range: 2.6, arc: 150, damage: { coef: 1.05, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.75, chain: 0.04, move: 0.1, stagger: 3, gain: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.7, slow: 0.45, step: 2 },
  });
  add({
    id: 'knight_basic_3', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'İleri atılarak yapılan saplama.', anim: '1H_Melee_Attack_Stab', animSpeed: 1.75, hitTime: 0.56, targeting: 'melee_arc',
    range: 3.4, arc: 55, damage: { coef: 1.3, type: 'physical' }, knockback: 0.6, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 5, gain: 5, proc: 0.9, weight: 0, upper: 0, lunge: 1.3, slow: 0.5, step: 3 },
  });
  add({
    id: 'knight_basic_4', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Tüm gücüyle yapılan ağır balyoz darbesi.', anim: '1H_Melee_Attack_Chop', animSpeed: 1.15, hitTime: 0.448, targeting: 'melee_arc',
    range: 3.1, arc: 100, damage: { coef: 2.0, type: 'physical' }, knockback: 1.6, tags: ['melee', 'basic', 'finisher'],
    vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.85, chain: 0.06, move: 0.2, stagger: 9, gain: 6, proc: 1, weight: 1, root: 1, lunge: 0.8, step: 4, finisher: 1, impactRadius: 1.4 },
  });
  add({
    id: 'knight_shield_bash', classId: 'knight', name: 'Kalkan Darbesi', icon: I('skill-shield-bash'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Kalkanınla önündeki düşmanlara vurarak %220 silah hasarı verir, onları sersemletir ve geri itersin.',
    cost: 20, cooldown: 3, castTime: 0, anim: 'Block_Attack', animSpeed: 1.45, hitTime: 0.427, targeting: 'melee_arc', range: 2.8, arc: 100,
    damage: { coef: 2.2, type: 'physical' }, knockback: 2.5, statuses: [{ status: 'stun', duration: 0.8 }],
    tags: ['melee', 'shield', 'cc'], vfx: { impact: 'block_spark', cast: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'shield_bash' },
    params: { end: 0.64, chain: 0.08, move: 0.18, stagger: 25, proc: 1, weight: 2, lunge: 0.6, slow: 0.7 },
  });
  add({
    id: 'knight_charge', classId: 'knight', name: 'Hücum', icon: I('skill-charge'), unlockLevel: 3, defaultSlot: 'q',
    desc: 'Hedefe doğru 12 metreye kadar hücum edersin; yoldaki düşmanları kenara iter, varışta çevrene %160 hasar verip sersemletirsin. 20 Kararlılık kazandırır.',
    cost: -20, cooldown: 10, castTime: 0, anim: 'Running_A', animSpeed: 2.0, targeting: 'dash', range: 12, radius: 3, duration: 0.4, hitTime: 0.4,
    damage: { coef: 1.6, type: 'physical' }, knockback: 1.5, statuses: [{ status: 'stun', duration: 1.2 }],
    tags: ['offgcd', 'melee', 'movement', 'cc'], vfx: { trail: 'charge_trail', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 30, proc: 1, weight: 2, pathCoef: 0.6, pathWidth: 1.5, speed: 30, unstoppable: 1, fit: 0 },
  });
  add({
    id: 'knight_radiant_cleave', classId: 'knight', name: 'Işıltılı Yarma', icon: I('skill-cleave'), unlockLevel: 6, defaultSlot: 'e',
    desc: 'Geniş bir yay çizerek %260 kutsal hasar verir ve vurduğun düşmanları 4 saniye boyunca savunmasız bırakırsın (%15 daha fazla hasar alırlar).',
    cost: 30, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.25, hitTime: 0.427, targeting: 'melee_arc',
    range: 3.5, arc: 180, damage: { coef: 2.6, type: 'holy' }, statuses: [{ status: 'sunder', duration: 4, magnitude: 0.15 }],
    tags: ['melee', 'holy', 'aoe'], vfx: { trail: 'slash_arc_big', impact: 'holy_burst' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.75, chain: 0.08, move: 0.2, stagger: 12, proc: 1, weight: 2, slow: 0.7, root: 1 },
  });
  add({
    id: 'knight_challenge', classId: 'knight', name: 'Meydan Okuma', icon: I('skill-taunt'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Savaş naranla 8 metre içindeki tüm düşmanları 4 saniye boyunca kendine kışkırtır, 6 saniye boyunca %20 daha az hasar alırsın. 30 Kararlılık kazandırır.',
    cost: -30, cooldown: 15, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.5, targeting: 'self_aoe', radius: 8,
    statuses: [{ status: 'taunt', duration: 4 }], selfStatuses: [{ status: 'fortify', duration: 6, magnitude: 0.2 }],
    tags: ['offgcd', 'aoe', 'shout', 'taunt'], vfx: { cast: 'war_cry' }, sfx: { cast: 'war_cry' },
    params: { end: 1.0, chain: 0.1, move: 0.15, weight: 1, slow: 0.7, ringColor: 0xff5533 },
  });
  add({
    id: 'knight_shield_wall', classId: 'knight', name: 'Kalkan Duvarı', icon: I('skill-shield-wall'), unlockLevel: 15, defaultSlot: 's2',
    desc: 'Tuşu basılı tutarak kalkanını kaldırır ve önden gelen tüm saldırıları engellersin. Bıraktığında engellenen hasarın bir kısmını patlamayla geri yansıtırsın.',
    cost: 10, cooldown: 16, castTime: 0, channel: 4, anim: 'Blocking', animSpeed: 1.0, hitTime: 0.15, targeting: 'custom', behavior: 'shield_wall',
    range: 4, arc: 90, damage: { coef: 1.5, type: 'physical' }, knockback: 3,
    tags: ['offgcd', 'melee', 'defensive', 'channel', 'shield'], vfx: { cast: 'shield_bubble', impact: 'shockwave' }, sfx: { cast: 'buff', impact: 'shield_bash' },
    params: { end: 0.6, chain: 0.1, stagger: 40, proc: 1, weight: 2, frontArc: 140, otherReduce: 0.5, moveSlow: 0.6, store: 0.15, storeCap: 10, gainPerBlock: 5 },
  });
  add({
    id: 'knight_consecration', classId: 'knight', name: 'Kutsal Toprak', icon: I('skill-consecration'), unlockLevel: 20, defaultSlot: 's3',
    desc: 'Kılıcını toprağa saplayarak 6 saniye boyunca kutsal bir alan yaratırsın: düşmanlar kutsal hasar alır ve yavaşlar, müttefikler iyileşir.',
    cost: 35, cooldown: 18, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.56, targeting: 'ground_aoe', radius: 5, duration: 6, ticks: 12,
    damage: { coef: 0.45, type: 'holy', perTick: true }, statuses: [{ status: 'slow', duration: 1, magnitude: 0.2 }],
    tags: ['holy', 'aoe', 'zone', 'dot'], vfx: { ground: 'holy_burst', impact: 'holy_burst' }, sfx: { cast: 'ground_slam' },
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 1, proc: 0.2, weight: 1, atCaster: 1, healPct: 0.015, root: 1, slow: 0.6 },
  });
  add({
    id: 'knight_war_banner', classId: 'knight', name: 'Savaş Sancağı', icon: I('skill-battle-shout'), unlockLevel: 25,
    desc: '12 saniye boyunca bir savaş sancağı dikersin: yakındaki müttefikler %15 daha fazla hasar verir ve %20 daha fazla zırh kazanır.',
    cost: 0, cooldown: 40, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.72, targeting: 'summon', range: 8, radius: 10, duration: 12,
    tags: ['aura', 'buff', 'summon'], vfx: { ground: 'buff_aura' }, sfx: { cast: 'buff' }, behavior: 'banner',
    params: { end: 0.8, chain: 0.1, move: 0.15, weight: 1, gainPerSec: 3 },
  });
  add({
    id: 'knight_heavens_judgment', classId: 'knight', name: 'Göksel Hüküm', icon: I('skill-hammer-of-justice'), unlockLevel: 30, defaultSlot: 'r',
    desc: 'Göğe sıçrayıp hedef noktaya inerek %700 kutsal hasar verirsin, düşmanları sersemletir ve savurursun. Ardından 5 saniye boyunca kutsanırsın.',
    cost: 50, cooldown: 60, castTime: 0, anim: 'Jump_Full_Long', targeting: 'leap', range: 10, radius: 6, duration: 0.6, hitTime: 0.6,
    damage: { coef: 7.0, type: 'holy' }, knockback: 4, statuses: [{ status: 'stun', duration: 2 }],
    selfStatuses: [{ status: 'blessed', duration: 5 }],
    tags: ['ultimate', 'holy', 'movement', 'aoe', 'melee'], vfx: { impact: 'holy_burst', ground: 'leap_land' }, sfx: { cast: 'jump', impact: 'explosion' },
    params: { end: 1.1, chain: 0.15, move: 0.3, stagger: 100, proc: 1, weight: 3, fit: 1, unstoppable: 1, knockup: 1, invuln: 0.6 },
  });

  // ---- Koruyucu (knight_protector) ----
  add({
    id: 'knight_provoke', classId: 'knight', spec: 'knight_protector', name: 'Kışkırtma', icon: I('skill-taunt'), unlockLevel: 10,
    desc: 'Bir düşmanı sana çevirir: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.25, targeting: 'custom', range: 25,
    behavior: 'provoke', tags: ['offgcd', 'taunt', 'threat', 'spec'], sfx: { cast: 'buff' }, params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'knight_shield_block', classId: 'knight', spec: 'knight_protector', name: 'Kalkan Kaldır', icon: I('skill-shield-wall'), unlockLevel: 10,
    desc: '6 saniye boyunca önden gelen saldırıların tamamını engellersin ve engellenen hasarın daha fazlasını emersin. İki yük, her biri 9 saniyede dolar.',
    cost: 30, cooldown: 9, charges: 2, castTime: 0, anim: 'Block_Attack', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff',
    selfStatuses: [{ status: 'shield_block', duration: 6 }], tags: ['offgcd', 'defensive', 'mitigation', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_ward_of_oath', classId: 'knight', spec: 'knight_protector', name: 'Yemin Siperi', icon: I('skill-holy-light'), unlockLevel: 15,
    desc: '8 saniye boyunca maks. canının %22\'si kadar bir kalkan kazanırsın. Üst üste kullanınca kalkan birikir (en fazla %45).',
    cost: 35, cooldown: 1.5, castTime: 0, anim: 'Use_Item', animSpeed: 2.5, hitTime: 0.25, targeting: 'custom', behavior: 'absorb_self',
    selfStatuses: [{ status: 'oath_ward', duration: 8 }], params: { absorbPct: 0.22, capPct: 0.45 }, tags: ['defensive', 'absorb', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
  });
  // ---- Kılıç Ustası (knight_blademaster) ----
  add({
    id: 'knight_templar_verdict', classId: 'knight', spec: 'knight_blademaster', name: 'Karar Darbesi', icon: I('skill-hammer-of-justice'), unlockLevel: 10,
    desc: 'Biriken Adalet Puanı kadar güçlü kutsal bir darbe vurursun (1–5 puan). Tüm puanları harcar.',
    cost: 0, cooldown: 0.55, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.55, targeting: 'custom', behavior: 'templar',
    range: 3.2, arc: 100, damage: { coef: 2.0, type: 'holy' }, tags: ['melee', 'holy', 'finisher', 'spec'], params: { stagger: 10, staggerPerPip: 8 },
    sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_wake_of_flames', classId: 'knight', spec: 'knight_blademaster', name: 'Kutsal Alev Dalgası', icon: I('skill-cleave'), unlockLevel: 15,
    desc: 'Önüne kutsal alev dalgası salarsın: vurulanları yakar ve Adalet Puanı kazandırır.',
    cost: 20, cooldown: 9, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'wake_flames',
    range: 9, arc: 70, damage: { coef: 2.2, type: 'holy' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.4 }],
    tags: ['melee', 'holy', 'fire', 'spec'], params: { stagger: 14, pipsHit: 2, pipsExtra: 1, pipsCap: 5 },
  });

  add({
    id: 'knight_unbroken_bastion', classId: 'knight', spec: 'knight_protector', name: 'Sarsılmaz Bastion', icon: I('skill-shield-wall'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '10 saniye boyunca aldığın hasar %40 azalır, sersemletilemez ve geri itilemezsin. Maks. canının %10\'u kadar iyileşirsin ve yakındaki düşmanların dikkatini çekersin.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'major_bastion',
    selfStatuses: [{ status: 'bastion', duration: 10 }], tags: ['major', 'defensive', 'buff'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' }, params: { major: 45, healPct: 0.10, threat: 100, threatR: 8, resGain: 30 },
  });
  add({
    id: 'knight_oath_aegis', classId: 'knight', spec: 'knight_protector', name: "Yemin Aegis'i", icon: I('skill-consecration'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '15 metre içindeki müttefikler 8 saniye boyunca %25 daha az hasar alır ve hemen canlarının %8\'ini geri kazanır. Sen de maks. canının %30\'u kadar kalkan kazanırsın.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', behavior: 'major_aegis',
    selfStatuses: [{ status: 'aegis', duration: 8 }], tags: ['major', 'defensive', 'heal'],
    vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90, range: 15, healPct: 0.08, absorbPct: 0.30 },
  });
  add({
    id: 'knight_zeal', classId: 'knight', spec: 'knight_blademaster', name: 'Gayret', icon: I('skill-battle-shout'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '8 saniye boyunca saldırı hızın %30 artar ve Işıltılı Yarma Kararlılık harcamaz.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.25, targeting: 'self_buff', selfStatuses: [{ status: 'zeal', duration: 8 }],
    tags: ['major', 'offensive', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 45 },
  });
  add({
    id: 'knight_wings_of_judgment', classId: 'knight', spec: 'knight_blademaster', name: 'Hüküm Kanatları', icon: I('skill-hammer-of-justice'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '20 saniye boyunca kutsal kanatlar açarsın: kutsal hasarın %25 artar, kritik şansın %20 ve hareket hızın %15 yükselir.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.3, targeting: 'self_buff', selfStatuses: [{ status: 'wings', duration: 20 }],
    tags: ['major', 'offensive', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
  });
  add({
    id: 'knight_heroism_call', classId: 'knight', spec: 'knight_blademaster', name: 'Kahramanlık Çağrısı', icon: I('skill-battle-shout'), unlockLevel: 30, defaultSlot: 'm180',
    desc: 'Tüm grubunun saldırı ve büyü hızı 40 saniye boyunca %30, hareket hızı %10 artar. Etkilenenler 2.5 dakika Yorgun kalır ve bu etkiyi tekrar alamaz.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.4, targeting: 'custom', behavior: 'major_hero',
    tags: ['major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 180, range: 40, dur: 40, sated: 150 },
  });
}
