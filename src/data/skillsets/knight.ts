/**
 * Şövalye (knight) skill rows. PM-00c (docs/kits/plate-melee.md §h) moved them out of data/skills.ts; PM-KN (§1, §2, f1a, §g)
 * retunes the kept rows and adds the 11 new ids. OWNER: PM-KN (this file only).
 * Retired rows (f1a "dropped" / "renamed") stay defined with no defaultSlot, so saved bars, talent nodes and old saves still resolve.
 * Called once by data/skills.ts with its local add().
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerKnight(add: SkillAdd): void {
  // ======================================================================================================
  // ŞÖVALYE (knight) — Kararlılık. Class-wide rows (both specs)
  // ======================================================================================================
  add({
    id: 'knight_basic', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'), defaultSlot: 'lmb',
    desc: 'Kılıcınla dört vuruşluk bir kombo yaparsın. Son vuruş düşmanı geri iten ağır bir bitiricidir. Her vuruş Kararlılık kazandırır.',
    anim: '1H_Melee_Attack_Slice_Diagonal', targeting: 'melee_arc', range: 2.6, arc: 120, tags: ['melee', 'basic', 'combo'],
    behavior: 'combo', params: { steps: 4, reset: 0.85 },
  });
  // Weapon chain (PM-KN G1): Σ 2.50 physical. Gains 4/4/5/6 R (Arms x1.75 via resourceGainPct); +1 R per extra target hit (max 4).
  add({
    id: 'knight_basic_1', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Çapraz kılıç darbesi.', anim: '1H_Melee_Attack_Slice_Diagonal', animSpeed: 1.4, hitTime: 0.38, targeting: 'melee_arc',
    range: 2.6, arc: 120, damage: { coef: 0.45, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.7, chain: 0.04, move: 0.1, stagger: 3, gain: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.7, slow: 0.45, step: 1, gainPerTarget: 1, gainPerTargetMax: 4, gainExtraOnly: 1 },
  });
  add({
    id: 'knight_basic_2', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Geniş yatay kılıç darbesi.', anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.4, hitTime: 0.427, targeting: 'melee_arc',
    range: 2.6, arc: 150, damage: { coef: 0.50, type: 'physical' }, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.75, chain: 0.04, move: 0.1, stagger: 3, gain: 4, proc: 0.8, weight: 0, upper: 1, lunge: 0.7, slow: 0.45, step: 2, gainPerTarget: 1, gainPerTargetMax: 4, gainExtraOnly: 1 },
  });
  add({
    id: 'knight_basic_3', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'İleri atılarak yapılan saplama.', anim: '1H_Melee_Attack_Stab', animSpeed: 1.75, hitTime: 0.56, targeting: 'melee_arc',
    range: 3.4, arc: 55, damage: { coef: 0.65, type: 'physical' }, knockback: 0.6, tags: ['melee', 'basic'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light' },
    params: { end: 0.95, chain: 0.05, move: 0.12, stagger: 5, gain: 5, proc: 0.9, weight: 0, upper: 0, lunge: 1.3, slow: 0.5, step: 3, gainPerTarget: 1, gainPerTargetMax: 4, gainExtraOnly: 1 },
  });
  add({
    id: 'knight_basic_4', classId: 'knight', name: 'Kılıç Kombosu', icon: I('skill-sword-slash'),
    desc: 'Tüm gücüyle yapılan ağır balyoz darbesi.', anim: '1H_Melee_Attack_Chop', animSpeed: 1.15, hitTime: 0.448, targeting: 'melee_arc',
    range: 3.1, arc: 100, damage: { coef: 0.90, type: 'physical' }, knockback: 1.6, tags: ['melee', 'basic', 'finisher'],
    vfx: { trail: 'slash_arc_big' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.85, chain: 0.06, move: 0.2, stagger: 9, gain: 6, proc: 1, weight: 1, root: 1, lunge: 0.8, step: 4, finisher: 1, impactRadius: 1.4, gainPerTarget: 1, gainPerTargetMax: 4, gainExtraOnly: 1 },
  });

  // ---- Şövalye rows used by both specs (kit PM-KN) ----
  add({
    id: 'knight_pummel', classId: 'knight', name: 'Kesici Darbe', icon: I('skill-double-strike'), unlockLevel: 10,
    desc: '3.5 metre içindeki büyü yapan bir düşmanı vurursun: büyüsü kesilir ve 3 saniye boyunca aynı okulun büyülerini yapamaz (boss: sadece kesilir).',
    cost: 0, cooldown: 15, castTime: 0, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.8, hitTime: 0.3,
    targeting: 'target_instant', range: 3.5, behavior: 'interrupt', offGcd: true, tags: ['offgcd', 'melee', 'kick'],
    vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'interrupt' }, params: { lockout: 3 },
  });
  add({
    id: 'knight_avatar', classId: 'knight', name: 'Savaş Avatarı', icon: I('skill-battle-shout'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '20 saniye boyunca verdiğin hasar %20 artar.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.3, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'avatar', duration: 20, magnitude: 0.2 }], tags: ['major', 'offensive', 'buff'], cleanses: ['root', 'slow'],
    vfx: { cast: 'zeal_aura' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_charge', classId: 'knight', name: 'Hücum', icon: I('skill-charge'), unlockLevel: 3, defaultSlot: 's2',
    desc: 'Hedefe doğru 12 metreye kadar hücum edersin ve %100 silah hasarı verip hedefi kısa süre köklendirirsin. 20 Kararlılık kazandırır.',
    cost: -20, cooldown: 20, castTime: 0, anim: 'Running_A', animSpeed: 2.0, targeting: 'dash', range: 12, duration: 0.4, hitTime: 0.4,
    damage: { coef: 1.0, type: 'physical' }, knockback: 1.5, statuses: [{ status: 'root', duration: 1 }], offGcd: true,
    tags: ['offgcd', 'melee', 'movement', 'cc'], vfx: { trail: 'charge_trail', impact: 'ground_slam' }, sfx: { cast: 'swing_heavy', impact: 'ground_slam' },
    params: { end: 0.9, chain: 0.1, move: 0.15, stagger: 30, proc: 1, weight: 2, pathCoef: 0.6, pathWidth: 1.5, speed: 30, unstoppable: 1, fit: 0, threat: 0 },
  });

  // ---- Kılıç Ustası (knight_blademaster, Arms) ----
  add({
    id: 'knight_mortal_strike', classId: 'knight', spec: 'knight_blademaster', name: 'Ölümcül Darbe', icon: I('skill-sword-slash'), unlockLevel: 10,
    desc: 'Hedefe %340 fiziksel hasar verirsin ve 10 saniye boyunca hedefin aldığı iyileşme %50 azalır. 25 Kararlılık harcarsın.',
    cost: 25, cooldown: 6, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.45, targeting: 'target_instant', range: 3.2,
    damage: { coef: 3.4, type: 'physical' }, statuses: [{ status: 'mortal_wound', duration: 10 }], tags: ['melee', 'physical'],
    vfx: { trail: 'slash_arc_big', impact: 'hit_blood' }, sfx: { cast: 'swing_heavy', impact: 'hit_flesh' }, params: { stagger: 12 },
  });
  add({
    id: 'knight_execute', classId: 'knight', spec: 'knight_blademaster', name: 'Cellat Vuruşu', icon: I('skill-execute'), unlockLevel: 10,
    desc: 'Ağır bir darbeyle %440 fiziksel hasar verirsin; hedef canının %20\'sinin altındaysa %25 daha fazla vurursun. Ani Ölüm aktifken 25 Kararlılık harcamaz.',
    cost: 25, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 0.95, hitTime: 0.45, targeting: 'target_instant', range: 3.2,
    damage: { coef: 4.4, type: 'physical' }, tags: ['melee', 'physical', 'execute'], behavior: 'execute',
    vfx: { trail: 'crit_finisher_slash', impact: 'fire_burst' }, sfx: { cast: 'swing_heavy', impact: 'heavy_hit' },
    params: { stagger: 20, execBonus: 1.25, threshold: 0.2, cull: 0, refund: 0 },
  });
  add({
    id: 'knight_overpower', classId: 'knight', spec: 'knight_blademaster', name: 'Üstün Vuruş', icon: I('skill-sword-slash'), unlockLevel: 10,
    desc: 'Hedefe %220 fiziksel hasar verirsin. İki yük vardır, her biri 12 saniyede dolar. Savaş Efendisi aktifken bedavadır.',
    cost: 0, cooldown: 12, charges: 2, castTime: 0, anim: '1H_Melee_Attack_Slice_Diagonal', animSpeed: 1.5, hitTime: 0.3,
    targeting: 'target_instant', range: 3.0, damage: { coef: 2.2, type: 'physical' }, tags: ['melee', 'physical'],
    vfx: { trail: 'slash_arc' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' }, params: { stagger: 5 },
  });
  add({
    id: 'knight_rend', classId: 'knight', spec: 'knight_blademaster', name: 'Kanatan Kesik', icon: I('skill-rend'), unlockLevel: 12,
    desc: 'Hedefe %60 fiziksel hasar verirsin ve 15 saniye süren bir kanama bırakırsın. 15 Kararlılık harcarsın.',
    cost: 15, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.3, hitTime: 0.35,
    targeting: 'target_instant', range: 3.0, damage: { coef: 0.6, type: 'physical' }, statuses: [{ status: 'rend', duration: 15, magnitude: 0.16 }],
    tags: ['melee', 'physical', 'bleed'], vfx: { trail: 'slash_arc', impact: 'hit_blood' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { stagger: 4 },
  });
  add({
    id: 'knight_radiant_cleave', classId: 'knight', name: 'Çelik Girdap', icon: I('skill-cleave'), unlockLevel: 6, defaultSlot: 's1',
    desc: 'Önündeki 180 derecelik yayda her düşmana %200 fiziksel hasar verirsin. Her vurduğun düşman için 2 Kararlılık geri kazanırsın (en fazla 8 düşman). 20 Kararlılık harcarsın.',
    cost: 20, cooldown: 0, castTime: 0, anim: '2H_Melee_Attack_Spin', animSpeed: 2.0, hitTime: 0.427, targeting: 'melee_arc',
    range: 4.5, arc: 180, damage: { coef: 2.0, type: 'physical' },
    tags: ['melee', 'physical', 'aoe'], onHitsAtLeast: { n: 3, status: 'sweeping', dur: 6 },
    vfx: { trail: 'slash_arc_big', impact: 'spin_slash' }, sfx: { cast: 'swing_heavy' },
    params: { end: 0.75, chain: 0.08, move: 0.2, stagger: 12, proc: 1, weight: 2, slow: 0.7, root: 1, gainPerTarget: 2, gainPerTargetMax: 8 },
  });
  add({
    id: 'knight_die_by_sword', classId: 'knight', spec: 'knight_blademaster', name: 'Kılıç Perdesi', icon: I('skill-shield-wall'), unlockLevel: 15,
    desc: '8 saniye boyunca aldığın hasar %40 azalır ve parry penceren genişler.',
    cost: 0, cooldown: 120, castTime: 0, anim: 'Block', animSpeed: 1.0, hitTime: 0.2, targeting: 'self_buff', offGcd: true,
    selfStatuses: [{ status: 'die_by_sword', duration: 8 }], tags: ['offgcd', 'defensive', 'spec'],
    vfx: { cast: 'aegis_ring' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_colossus_smash', classId: 'knight', spec: 'knight_blademaster', name: 'Dev Ezme', icon: I('skill-hammer-of-justice'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Yere vurarak 5 metre içindeki düşmanlara %240 fiziksel hasar verirsin ve 10 saniye boyunca onlardan %30 daha fazla hasar alırsın. Her vurduğun düşman için 5 Kararlılık kazanırsın (en fazla 4).',
    cost: 0, cooldown: 45, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 0.9, hitTime: 0.35, targeting: 'self_aoe', radius: 5, offGcd: true,
    damage: { coef: 2.4, type: 'physical' }, statuses: [{ status: 'colossus', duration: 10 }], tags: ['major', 'aoe', 'physical'],
    vfx: { ground: 'colossus_smash', impact: 'shockwave' }, sfx: { cast: 'ground_slam', impact: 'explosion' },
    params: { stagger: 15, gainPerTarget: 5, gainPerTargetMax: 4 },
  });
  add({
    id: 'knight_bladestorm', classId: 'knight', spec: 'knight_blademaster', name: 'Bıçak Fırtınası', icon: I('skill-cleave'), unlockLevel: 30, defaultSlot: 'm180',
    desc: '4 saniye boyunca dönerek çevrendeki düşmanlara 8 kez %90 fiziksel hasar verirsin. Bu sürede sersemletilemezsin ve hareket hızın %50 düşer.',
    cost: 0, cooldown: 180, castTime: 0, channel: 4, anim: '2H_Melee_Attack_Spinning', animSpeed: 1.0, hitTime: 0.1, targeting: 'self_aoe', radius: 4,
    offGcd: true, damage: { coef: 0.9, type: 'physical', perTick: true }, ticks: 8, behavior: 'channel_aoe', tags: ['major', 'aoe', 'channel', 'physical'],
    vfx: { ground: 'spin_slash', impact: 'hit_spark' }, sfx: { cast: 'swing_heavy' }, params: { moveSlow: 0.5 },
  });
  add({
    id: 'knight_templar_verdict', classId: 'knight', spec: 'knight_blademaster', name: 'Karar Darbesi', icon: I('skill-hammer-of-justice'), unlockLevel: 10,
    desc: 'Biriken Adalet Puanı kadar güçlü kutsal bir darbe vurursun (1–5 puan). Tüm puanları harcar. (Emekli: Şövalye kiti yenilendi; satır yalnızca eski kayıtlar için durur.)',
    cost: 0, cooldown: 0.55, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.25, hitTime: 0.55, targeting: 'custom', behavior: 'templar',
    range: 3.2, arc: 100, damage: { coef: 2.0, type: 'holy' }, tags: ['melee', 'holy', 'finisher', 'spec'], params: { stagger: 10, staggerPerPip: 8 },
    sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_wake_of_flames', classId: 'knight', spec: 'knight_blademaster', name: 'Kutsal Alev Dalgası', icon: I('skill-cleave'), unlockLevel: 15,
    desc: 'Önüne kutsal alev dalgası salarsın: vurulanları yakar ve Adalet Puanı kazandırır. (Emekli: Şövalye kiti yenilendi.)',
    cost: 20, cooldown: 9, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.6, hitTime: 0.5, targeting: 'custom', behavior: 'wake_flames',
    range: 9, arc: 70, damage: { coef: 2.2, type: 'holy' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.4 }],
    tags: ['melee', 'holy', 'fire', 'spec'], params: { stagger: 14, pipsHit: 2, pipsExtra: 1, pipsCap: 5 },
  });
  add({
    id: 'knight_zeal', classId: 'knight', spec: 'knight_blademaster', name: 'Gayret', icon: I('skill-battle-shout'), unlockLevel: 10,
    desc: '8 saniye boyunca saldırı hızın %30 artar. (Emekli: Dev Ezme ile değiştirildi.)',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 2.0, hitTime: 0.25, targeting: 'self_buff', selfStatuses: [{ status: 'zeal', duration: 8 }],
    tags: ['major', 'offensive', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 45 },
  });
  add({
    id: 'knight_wings_of_judgment', classId: 'knight', spec: 'knight_blademaster', name: 'Hüküm Kanatları', icon: I('skill-hammer-of-justice'), unlockLevel: 20,
    desc: '20 saniye boyunca kutsal kanatlar açarsın: kutsal hasarın %25 artar, kritik şansın %20 ve hareket hızın %15 yükselir. (Emekli: Savaş Avatarı ile değiştirildi.)',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.3, targeting: 'self_buff', selfStatuses: [{ status: 'wings', duration: 20 }],
    tags: ['major', 'offensive', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90 },
  });

  // ---- Koruyucu (knight_protector, Prot) ----
  add({
    id: 'knight_shield_bash', classId: 'knight', name: 'Kalkan Darbesi', icon: I('skill-shield-bash'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Kalkanınla önündeki düşmanlara %300 silah hasarı verir ve onları geri itersin. 15 Kararlılık kazandırır.',
    cost: -15, cooldown: 9, castTime: 0, anim: 'Block_Attack', animSpeed: 1.45, hitTime: 0.427, targeting: 'melee_arc', range: 2.8, arc: 100,
    damage: { coef: 3.0, type: 'physical' }, knockback: 2.5, whileStatusMult: { status: 'shield_block', mult: 1.3 },
    tags: ['melee', 'shield'], vfx: { impact: 'block_spark', cast: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'shield_bash' },
    params: { end: 0.64, chain: 0.08, move: 0.18, stagger: 25, proc: 1, weight: 2, lunge: 0.6, slow: 0.7 },
  });
  add({
    id: 'knight_revenge', classId: 'knight', spec: 'knight_protector', name: 'İntikam', icon: I('skill-cleave'), unlockLevel: 12,
    desc: '150 derecelik önündeki en fazla 5 düşmana %200 fiziksel hasar verirsin. İntikam Hazır aktifken bedavadır ve %25 daha fazla vurur. 20 Kararlılık harcarsın.',
    cost: 20, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.3, hitTime: 0.427, targeting: 'melee_arc',
    range: 3.4, arc: 150, damage: { coef: 2.0, type: 'physical' }, tags: ['melee', 'physical', 'aoe'],
    vfx: { trail: 'slash_arc_big', impact: 'shockwave' }, sfx: { cast: 'swing_heavy', impact: 'hit_armor_plate' },
    params: { stagger: 12, maxTargets: 5, threatMult: 2 },
  });
  add({
    id: 'knight_thunder_clap', classId: 'knight', spec: 'knight_protector', name: 'Gök Gürültüsü', icon: I('skill-hammer-of-justice'), unlockLevel: 12,
    desc: '5 metre içindeki düşmanlara %100 fiziksel hasar verir, 15 saniye süren kanama ve 6 saniye %20 yavaşlatma bırakırsın. 5 Kararlılık kazandırır.',
    cost: -5, cooldown: 6, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.5, targeting: 'self_aoe', radius: 5,
    damage: { coef: 1.0, type: 'physical' },
    statuses: [{ status: 'rend', duration: 15, magnitude: 0.08 }, { status: 'slow', duration: 6, magnitude: 0.2 }],
    tags: ['aoe', 'physical', 'bleed'], vfx: { impact: 'shockwave' }, sfx: { cast: 'ground_slam' }, params: { stagger: 12 },
  });
  add({
    id: 'knight_shield_block', classId: 'knight', spec: 'knight_protector', name: 'Kalkan Kaldır', icon: I('skill-shield-wall'), unlockLevel: 10, defaultSlot: 'e',
    desc: '6 saniye boyunca önden gelen saldırıların tamamını engellersin ve engellenen hasarın %15\'ini depolarsın. Süre bitince ya da yeniden kullanınca depolanan hasar bir şok dalgası olarak patlar. İki yük, her biri 9 saniyede dolar.',
    cost: 30, cooldown: 9, charges: 2, castTime: 0, anim: 'Block_Attack', animSpeed: 1.0, hitTime: 0.2, targeting: 'custom', behavior: 'shield_block',
    offGcd: true, tags: ['offgcd', 'defensive', 'mitigation', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' }, params: { store: 0.15, storeCap: 10, gainPerBlock: 0, dur: 6 },
  });
  add({
    id: 'knight_ward_of_oath', classId: 'knight', spec: 'knight_protector', name: 'Yemin Siperi', icon: I('skill-holy-light'), unlockLevel: 15,
    desc: '8 saniye boyunca maks. canının %22\'si kadar bir kalkan kazanırsın. Üst üste kullanınca kalkan birikir (en fazla %45). 35 Kararlılık harcarsın.',
    cost: 35, cooldown: 1.5, castTime: 0, anim: 'Use_Item', animSpeed: 2.5, hitTime: 0.25, targeting: 'custom', behavior: 'absorb_self',
    selfStatuses: [{ status: 'oath_ward', duration: 8 }], params: { absorbPct: 0.22, capPct: 0.45 }, tags: ['defensive', 'absorb', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
  });
  add({
    id: 'knight_provoke', classId: 'knight', spec: 'knight_protector', name: 'Kışkırtma', icon: I('skill-taunt'), unlockLevel: 10,
    desc: 'Bir düşmanı sana çevirir: 3 saniye kışkırtılır ve tehdit listesinde en üste çıkarsın. Boss için 2 saniye.',
    cost: 0, cooldown: 8, castTime: 0, anim: 'Cheer', animSpeed: 2.2, hitTime: 0.25, targeting: 'custom', range: 25,
    behavior: 'provoke', tags: ['offgcd', 'taunt', 'threat', 'spec'], sfx: { cast: 'buff' }, params: { tauntDur: 3, bossTauntDur: 2, threatBoost: 100 },
  });
  add({
    id: 'knight_challenge', classId: 'knight', spec: 'knight_protector', name: 'Moral Bozma', icon: I('skill-taunt'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '8 metre içindeki düşmanlar 8 saniye boyunca %20 daha az hasar verir. 15 Kararlılık kazandırır.',
    cost: -15, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.5, targeting: 'self_aoe', radius: 8, offGcd: true,
    statuses: [{ status: 'curse', duration: 8 }], tags: ['offgcd', 'aoe', 'shout', 'major'],
    vfx: { cast: 'war_cry' }, sfx: { cast: 'war_cry' }, params: { end: 1.0, chain: 0.1, move: 0.15, weight: 1, slow: 0.7, ringColor: 0xff5533 },
  });
  add({
    id: 'knight_unbroken_bastion', classId: 'knight', spec: 'knight_protector', name: 'Sarsılmaz Bastion', icon: I('skill-shield-wall'), unlockLevel: 10, defaultSlot: 'm180',
    desc: '8 saniye boyunca aldığın hasar %40 azalır ve sersemletilemez ya da geri itilemezsin.',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'custom', behavior: 'major_bastion', offGcd: true,
    selfStatuses: [{ status: 'bastion', duration: 8 }], tags: ['major', 'defensive', 'buff'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' }, params: { healPct: 0, threat: 100, threatR: 8, resGain: 30 },
  });

  // ---- Retired / dropped rows (f1a): still defined so saved bars and talent nodes resolve, no slot, not in any spec ----
  add({
    id: 'knight_shield_wall', classId: 'knight', name: 'Kalkan Duvarı', icon: I('skill-shield-wall'), unlockLevel: 15,
    desc: 'Tuşu basılı tutarak kalkanını kaldırır ve önden gelen tüm saldırıları engellersin. (Emekli: Kalkan Kaldır ile değiştirildi.)',
    cost: 10, cooldown: 16, castTime: 0, channel: 4, anim: 'Blocking', animSpeed: 1.0, hitTime: 0.15, targeting: 'custom', behavior: 'shield_wall',
    range: 4, arc: 90, damage: { coef: 1.5, type: 'physical' }, knockback: 3,
    tags: ['offgcd', 'melee', 'defensive', 'channel', 'shield'], vfx: { cast: 'shield_bubble', impact: 'shockwave' }, sfx: { cast: 'buff', impact: 'shield_bash' },
    params: { end: 0.6, chain: 0.1, stagger: 40, proc: 1, weight: 2, frontArc: 140, otherReduce: 0.5, moveSlow: 0.6, store: 0.15, storeCap: 10, gainPerBlock: 5 },
  });
  add({
    id: 'knight_consecration', classId: 'knight', name: 'Kutsal Toprak', icon: I('skill-consecration'), unlockLevel: 20,
    desc: 'Kılıcını toprağa saplayarak 6 saniye boyunca kutsal bir alan yaratırsın. (Emekli: Paladin kitine taşındı.)',
    cost: 35, cooldown: 18, castTime: 0, anim: '1H_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.56, targeting: 'ground_aoe', radius: 5, duration: 6, ticks: 12,
    damage: { coef: 0.45, type: 'holy', perTick: true }, statuses: [{ status: 'slow', duration: 1, magnitude: 0.2 }],
    tags: ['holy', 'aoe', 'zone', 'dot'], vfx: { ground: 'holy_burst', impact: 'holy_burst' }, sfx: { cast: 'ground_slam' },
    params: { end: 0.95, chain: 0.1, move: 0.2, stagger: 1, proc: 0.2, weight: 1, atCaster: 1, healPct: 0.015, root: 1, slow: 0.6 },
  });
  add({
    id: 'knight_war_banner', classId: 'knight', name: 'Savaş Sancağı', icon: I('skill-battle-shout'), unlockLevel: 25,
    desc: '12 saniye boyunca bir savaş sancağı dikersin: yakındaki müttefikler %15 daha fazla hasar verir ve %20 daha fazla zırh kazanır. (Emekli: Sancak pasifi ile değiştirildi.)',
    cost: 0, cooldown: 40, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.72, targeting: 'summon', range: 8, radius: 10, duration: 12,
    tags: ['aura', 'buff', 'summon'], vfx: { ground: 'buff_aura' }, sfx: { cast: 'buff' }, behavior: 'banner',
    params: { end: 0.8, chain: 0.1, move: 0.15, weight: 1, gainPerSec: 3 },
  });
  add({
    id: 'knight_heavens_judgment', classId: 'knight', name: 'Göksel Hüküm', icon: I('skill-hammer-of-justice'), unlockLevel: 30,
    desc: 'Göğe sıçrayıp hedef noktaya inerek %700 kutsal hasar verirsin. (Emekli: bench dışı; satır talent düğümleri için kalır.)',
    cost: 50, cooldown: 60, castTime: 0, anim: 'Jump_Full_Long', targeting: 'leap', range: 10, radius: 6, duration: 0.6, hitTime: 0.6,
    damage: { coef: 7.0, type: 'holy' }, knockback: 4, statuses: [{ status: 'stun', duration: 2 }],
    selfStatuses: [{ status: 'blessed', duration: 5 }],
    tags: ['ultimate', 'holy', 'movement', 'aoe', 'melee'], vfx: { impact: 'holy_burst', ground: 'leap_land' }, sfx: { cast: 'jump', impact: 'explosion' },
    params: { end: 1.1, chain: 0.15, move: 0.3, stagger: 100, proc: 1, weight: 3, fit: 1, unstoppable: 1, knockup: 1, invuln: 0.6 },
  });
  add({
    id: 'knight_oath_aegis', classId: 'knight', name: "Yemin Aegis'i", icon: I('skill-consecration'), unlockLevel: 20,
    desc: '15 metre içindeki müttefikler 8 saniye boyunca %25 daha az hasar alır. (Emekli: Savaş Avatarı ve Sarsılmaz Bastion ile değiştirildi.)',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.4, hitTime: 0.4, targeting: 'custom', behavior: 'major_aegis',
    selfStatuses: [{ status: 'aegis', duration: 8 }], tags: ['major', 'defensive', 'heal'],
    vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 90, range: 15, healPct: 0.08, absorbPct: 0.30 },
  });
  add({
    id: 'knight_heroism_call', classId: 'knight', name: 'Kahramanlık Çağrısı', icon: I('skill-battle-shout'), unlockLevel: 30,
    desc: 'Tüm grubunun saldırı ve büyü hızı 40 saniye boyunca %30, hareket hızı %10 artar. (Emekli: Şövalye Heroism ailesinde değil; Barbar Savaş Narası.)',
    cost: 0, cooldown: 180, castTime: 0, anim: 'Cheer', animSpeed: 1.2, hitTime: 0.4, targeting: 'custom', behavior: 'major_hero',
    tags: ['major', 'hero', 'buff'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' }, params: { major: 180, range: 40, dur: 40, sated: 150 },
  });
}
