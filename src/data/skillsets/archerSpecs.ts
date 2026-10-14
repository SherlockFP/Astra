/**
 * GDD_CLASSES_V2 §3.4–§3.5 Okçu spec rows: Nişancı (archer_marksman) spec skills and majors, Av Ustası (archer_beastmaster) spec
 * skills and majors, and the Hayatta Kalma (archer_survival) rows (Midnight-aligned design, see the archer report). OWNER: archer package.
 * Majors: m45 = the L10 major, m90 = the L20 major (GDD §3.5). SpecDef rows are in data/specs_kit_archer.ts.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerArcherSpecs(add: SkillAdd): void {
  // =====================================================================================================
  // Nişancı (archer_marksman, MS): Seri Ateş, Son Atış, Keskin Nişan (m45), Tam İsabet (m90)
  // =====================================================================================================
  add({
    id: 'archer_rapid_fire', classId: 'archer', spec: 'archer_marksman', name: 'Seri Ateş', icon: I('skill-rapid-fire'), unlockLevel: 10, defaultSlot: 's1',
    desc: '2.2 saniye boyunca 14 ok yağdırır, her biri %55 hasar verir. Atış sırasında yavaş hareket edebilirsin.',
    cost: 30, cooldown: 12, castTime: 0, channel: 2.2, hitTime: 0.2, anim: '2H_Ranged_Shooting', holdAnim: '2H_Ranged_Shooting', animSpeed: 1.0,
    targeting: 'projectile', range: 28, speed: 60, radius: 0.3, count: 1, damage: { coef: 0.55, type: 'physical' },
    behavior: 'archer_channel_shoot', tags: ['spec', 'ranged', 'channel', 'projectile', 'physical'],
    vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail' }, sfx: { cast: 'bow_shot' },
    // tick 0.157 s: 14 arrows over the 2.2 s channel; slow 40 % while channelling
    params: { tick: 0.157, spread: 2.5, speed: 60, range: 28, slow: 0.4, stagger: 1, proc: 0.25, weight: 0 },
  });

  add({
    id: 'archer_kill_shot', classId: 'archer', spec: 'archer_marksman', name: 'Son Atış', icon: I('skill-aimed-shot'), unlockLevel: 15, defaultSlot: 's3',
    desc: 'Canı %25\'in altındaki hedefe %600 hasar verir (diğerlerine %200). Avcı İşareti altındaki hedefe +%25 hasar.',
    cost: 25, cooldown: 6, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 0.9, hitTime: 0.32, targeting: 'projectile', range: 35,
    speed: 80, radius: 0.35, count: 1, damage: { coef: 2.0, type: 'physical' },
    behavior: 'archer_kill_shot',
    // Avcı İşareti window: the status form of route (strike reads it, SkillSystem.routeStatusMore), +25 % on a marked target
    route: { from: ['@status:hunters_mark'], window: 12, more: 0.25 },
    tags: ['spec', 'ranged', 'projectile', 'execute', 'physical'],
    vfx: { projectile: 'arrow_projectile', impact: 'crit_burst' }, sfx: { cast: 'bow_shot', impact: 'hit_crit' },
    // executeBelow 0.25 of max HP, executeCoef 6.0 under it, baseCoef 2.0; refundOnKill is a hook (see the report)
    params: { executeBelow: 0.25, executeCoef: 6.0, baseCoef: 2.0, refundOnKill: 1, end: 0.7, chain: 0.1, move: 0.2, stagger: 15, proc: 1, weight: 2 },
  });

  add({
    id: 'archer_ms_deadeye', classId: 'archer', spec: 'archer_marksman', name: 'Keskin Nişan', icon: I('skill-aimed-shot'), unlockLevel: 10,
    desc: '10 saniye boyunca sonraki 3 Nişanlı Atış anında tam çekilir, bedava olur ve %30 ek kritik şansı alır.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.5, hitTime: 0.5, targeting: 'self_buff',
    selfStatuses: [{ status: 'deadeye', duration: 10, stacks: 3 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });

  add({
    id: 'archer_ms_trueshot', classId: 'archer', spec: 'archer_marksman', name: 'Tam İsabet', icon: I('skill-piercing-shot'), unlockLevel: 20,
    desc: '20 saniye boyunca kritik hasarın %50, saldırı hızın %40 artar, Odak yenilenmen iki katına çıkar ve oklar +1 deler.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff',
    selfStatuses: [{ status: 'trueshot', duration: 20 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'war_cry' },
    params: { major: 90, end: 0.8, chain: 0.1, move: 0.15, weight: 1 },
  });

  // =====================================================================================================
  // Av Ustası (archer_beastmaster, BM): Av Emri, Zehirli Ok, Vahşi Gazap (m45), Av Sürüsü (m90)
  // =====================================================================================================
  add({
    id: 'archer_kill_command', classId: 'archer', spec: 'archer_beastmaster', name: 'Av Emri', icon: I('skill-claw-strike'), unlockLevel: 10, defaultSlot: 'e',
    desc: 'Yoldaşına hedefe atılmasını emredersin: %320 hasar verir ve hedefi kanatır. Yoldaşın yoksa emir verilmez.',
    cost: 30, cooldown: 6, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2.0, hitTime: 0.373, targeting: 'custom', range: 16,
    behavior: 'archer_pet_strike', requires: { target: 'enemy' }, damage: { coef: 3.2, type: 'physical' },
    // the bleed rides on the pet's bite (behaviour archer_pet_strike); this row states it for the talent DSL (sdur=bleed)
    statuses: [{ status: 'bleed', duration: 5, magnitude: 0.6 }],
    tags: ['spec', 'pet', 'melee', 'physical'], vfx: { impact: 'hit_blood' }, sfx: { cast: 'wolf_bite', impact: 'wolf_bite' },
    // petCoef = the pet's strike; the bleed (5 s, magnitude 0.6) rides on the pet attack; the pet is the 'pet' group only
    params: { petCoef: 3.2, bleedSec: 5, bleedMag: 0.6, stagger: 15, weight: 2, end: 0.5, chain: 0.05, move: 0.1 },
  });

  add({
    id: 'archer_serpent_sting', classId: 'archer', spec: 'archer_beastmaster', name: 'Zehirli Ok', icon: I('skill-poison-arrow'), unlockLevel: 15, defaultSlot: 's3',
    desc: 'İki kat zehir bindirir (%120 hasar).',
    cost: 20, cooldown: 3, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.6, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 50, radius: 0.3, count: 1, damage: { coef: 1.2, type: 'poison' },
    statuses: [{ status: 'poison', duration: 8, stacks: 2, magnitude: 0.15 }],
    tags: ['spec', 'ranged', 'projectile', 'poison'], vfx: { projectile: 'poison_projectile', impact: 'poison_burst' },
    sfx: { cast: 'bow_shot', impact: 'poison_impact' },
    // spreadOnDeath 1: the poison jumps to the two nearest enemies when the host dies (engine hook, see the report)
    params: { end: 0.64, chain: 0.05, move: 0.12, stagger: 2, proc: 0.7, weight: 0, upper: 1, slow: 0.4, spreadOnDeath: 1 },
  });

  add({
    id: 'archer_bm_bestial_wrath', classId: 'archer', spec: 'archer_beastmaster', name: 'Vahşi Gazap', icon: I('skill-battle-shout'), unlockLevel: 10,
    desc: '10 saniye boyunca sen ve yoldaşın %25 daha çok hasar verir.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'self_buff', behavior: 'archer_bestial_wrath',
    selfStatuses: [{ status: 'wild_wrath', duration: 10 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'wolf_howl' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });

  add({
    id: 'archer_bm_pack_hunt', classId: 'archer', spec: 'archer_beastmaster', name: 'Av Sürüsü', icon: I('skill-claw-strike'), unlockLevel: 20,
    desc: '20 saniye boyunca iki kurt daha çağırırsın; hedefine yoldaşınla birlikte sürü halinde saldırırlar.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Use_Item', animSpeed: 1.6, hitTime: 0.72, targeting: 'summon', behavior: 'minion_summon',
    minion: { id: 'archer_wolf_ally', count: 2, group: 'pack', life: 20 }, tags: ['major', 'summon', 'spec'],
    vfx: { cast: 'pet_summon' }, sfx: { cast: 'wolf_howl' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });

  // =====================================================================================================
  // Hayatta Kalma (archer_survival, SV): Yangın Bombası, Yırtıcı Vuruş, Namlu Patlatıcı (m45), Son Siper (m90)
  // Midnight pre-patch notes: AoE from explosives, melee spender, Boomstick is the big cone. Designed here, not from a Midnight table.
  // =====================================================================================================
  add({
    id: 'archer_sv_wildfire_bomb', classId: 'archer', spec: 'archer_survival', name: 'Yangın Bombası', icon: I('skill-fire-nova'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Hedef noktaya yanıcı bir bomba atarsın: 3,2 m alana %180 ateş hasarı verir ve yakar. 25 Odak harcar.',
    cost: 25, cooldown: 8, castTime: 0, anim: 'Throw', animSpeed: 1.4, hitTime: 0.5, targeting: 'ground_aoe', range: 26, radius: 3.2,
    damage: { coef: 1.8, type: 'fire' }, statuses: [{ status: 'burn', duration: 4, magnitude: 0.4 }],
    tags: ['spec', 'ground', 'aoe', 'fire', 'explosive'], vfx: { ground: 'fire_ground', impact: 'fire_burst' },
    sfx: { cast: 'whoosh', impact: 'explosion' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, slow: 0.3 },
  });

  add({
    id: 'archer_sv_raptor_strike', classId: 'archer', spec: 'archer_survival', name: 'Yırtıcı Vuruş', icon: I('skill-claw-strike'), unlockLevel: 15, defaultSlot: 'e',
    desc: 'Yakın mesafede keskin bir darbe: %220 fiziksel hasar verir. 20 Odak harcar.',
    cost: 20, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.3, targeting: 'melee_arc', range: 2.8, arc: 110,
    damage: { coef: 2.2, type: 'physical' }, tags: ['spec', 'melee', 'physical', 'spender'],
    vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.55, chain: 0.08, move: 0.12, stagger: 4, proc: 0.6, weight: 0 },
  });

  add({
    id: 'archer_sv_boomstick', classId: 'archer', spec: 'archer_survival', name: 'Namlu Patlatıcı', icon: I('skill-fire-wave'), unlockLevel: 10,
    desc: 'Önündeki 60 derecelik koniye 8 metreye kadar yakın mesafe patlaması yaparsın: %260 fiziksel hasar verir ve düşmanları geri iter.',
    cost: 0, cooldown: 30, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.0, hitTime: 0.3, targeting: 'melee_arc', range: 8, arc: 60,
    damage: { coef: 2.6, type: 'physical' }, knockback: 1.5, tags: ['major', 'melee', 'aoe', 'physical', 'spec'],
    vfx: { trail: 'slash_arc_big', impact: 'hit_spark' }, sfx: { cast: 'bow_shot', impact: 'hit_flesh' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, stagger: 10, proc: 1, weight: 1 },
  });

  add({
    id: 'archer_sv_last_stand', classId: 'archer', spec: 'archer_survival', name: 'Son Siper', icon: I('skill-shield-wall'), unlockLevel: 20,
    desc: '12 saniye boyunca aldığın hasar %25 azalır.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.3, targeting: 'self_buff',
    selfStatuses: [{ status: 'survivor_ward', duration: 12 }], tags: ['major', 'defensive', 'buff', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 90, end: 0.8, chain: 0.1, move: 0.15, weight: 0 },
  });
}
