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
    id: 'archer_rapid_fire', classId: 'archer', spec: 'archer_marksman', name: 'Seri Ateş (Rapid Fire)', icon: I('skill-rapid-fire'), unlockLevel: 10, defaultSlot: 's1',
    desc: '2.2 saniye boyunca 14 ok yağdırır, her biri %55 hasar verir. Atış sırasında yavaş hareket edebilirsin.',
    cost: 30, cooldown: 12, castTime: 0, channel: 2.2, hitTime: 0.2, anim: '2H_Ranged_Shooting', holdAnim: '2H_Ranged_Shooting', animSpeed: 1.0,
    targeting: 'projectile', range: 28, speed: 60, radius: 0.3, count: 1, damage: { coef: 0.55, type: 'physical' },
    behavior: 'archer_channel_shoot', tags: ['spec', 'ranged', 'channel', 'projectile', 'physical'],
    vfx: { projectile: 'arrow_projectile', trail: 'arrow_trail' }, sfx: { cast: 'bow_shot' },
    // tick 0.157 s: 14 arrows over the 2.2 s channel; slow 40 % while channelling
    params: { tick: 0.157, spread: 2.5, speed: 60, range: 28, slow: 0.4, stagger: 1, proc: 0.25, weight: 0 },
  });

  add({
    id: 'archer_kill_shot', classId: 'archer', spec: 'archer_marksman', name: 'Son Atış (Kill Shot)', icon: I('skill-aimed-shot'), unlockLevel: 15, defaultSlot: 's3',
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
    id: 'archer_ms_deadeye', classId: 'archer', spec: 'archer_marksman', name: 'Keskin Nişan (Deadeye)', icon: I('skill-aimed-shot'), unlockLevel: 10,
    desc: '10 saniye boyunca sonraki 3 Nişanlı Atış anında tam çekilir, bedava olur ve %30 ek kritik şansı alır.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.5, hitTime: 0.5, targeting: 'self_buff',
    selfStatuses: [{ status: 'deadeye', duration: 10, stacks: 3 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.5, chain: 0.1, move: 0.1, weight: 0 },
  });

  add({
    id: 'archer_ms_trueshot', classId: 'archer', spec: 'archer_marksman', name: 'Tam İsabet (Trueshot)', icon: I('skill-piercing-shot'), unlockLevel: 20,
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
    id: 'archer_kill_command', classId: 'archer', spec: 'archer_beastmaster', name: 'Av Emri (Kill Command)', icon: I('skill-claw-strike'), unlockLevel: 1, defaultSlot: 'e',
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
    id: 'archer_serpent_sting', classId: 'archer', spec: 'archer_beastmaster', name: 'Yılan Sokumu (Serpent Sting)', icon: I('skill-poison-arrow'), unlockLevel: 15, defaultSlot: 's3',
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
    id: 'archer_bm_bestial_wrath', classId: 'archer', spec: 'archer_beastmaster', name: 'Vahşi Gazap (Bestial Wrath)', icon: I('skill-battle-shout'), unlockLevel: 10,
    desc: '10 saniye boyunca sen ve yoldaşın %25 daha çok hasar verir.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Cheer', animSpeed: 1.8, hitTime: 0.3, targeting: 'self_buff', behavior: 'archer_bestial_wrath',
    selfStatuses: [{ status: 'wild_wrath', duration: 10 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'wolf_howl' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });

  add({
    id: 'archer_bm_pack_hunt', classId: 'archer', spec: 'archer_beastmaster', name: 'Vahşi Çağrı (Call of the Wild)', icon: I('skill-claw-strike'), unlockLevel: 20,
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
    id: 'archer_sv_wildfire_bomb', classId: 'archer', spec: 'archer_survival', name: 'Yangın Bombası (Wildfire Bomb)', icon: I('skill-fire-nova'), unlockLevel: 1, defaultSlot: 's1',
    desc: 'Hedef noktaya yanıcı bir bomba atarsın: 3,2 m alana %180 ateş hasarı verir ve yakar. 25 Odak harcar.',
    cost: 25, cooldown: 8, castTime: 0, anim: 'Throw', animSpeed: 1.4, hitTime: 0.5, targeting: 'ground_aoe', range: 26, radius: 3.2,
    damage: { coef: 1.8, type: 'fire' }, statuses: [{ status: 'burn', duration: 4, magnitude: 0.4 }],
    tags: ['spec', 'ground', 'aoe', 'fire', 'explosive'], vfx: { ground: 'fire_ground', impact: 'fire_burst' },
    sfx: { cast: 'whoosh', impact: 'explosion' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 1, slow: 0.3 },
  });

  add({
    id: 'archer_sv_raptor_strike', classId: 'archer', spec: 'archer_survival', name: 'Yırtıcı Vuruş (Raptor Strike)', icon: I('skill-claw-strike'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Yakın mesafede keskin bir darbe: %220 fiziksel hasar verir. 20 Odak harcar.',
    cost: 20, cooldown: 0, castTime: 0, anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.3, targeting: 'melee_arc', range: 2.8, arc: 110,
    damage: { coef: 2.2, type: 'physical' }, tags: ['spec', 'melee', 'physical', 'spender'],
    vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'hit_flesh' },
    params: { end: 0.55, chain: 0.08, move: 0.12, stagger: 4, proc: 0.6, weight: 0 },
  });

  add({
    id: 'archer_sv_boomstick', classId: 'archer', spec: 'archer_survival', name: 'Namlu Patlatıcı (Boomstick)', icon: I('skill-fire-wave'), unlockLevel: 10,
    desc: 'Önündeki 60 derecelik koniye 8 metreye kadar yakın mesafe patlaması yaparsın: %260 fiziksel hasar verir ve düşmanları geri iter.',
    cost: 0, cooldown: 30, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.0, hitTime: 0.3, targeting: 'melee_arc', range: 8, arc: 60,
    damage: { coef: 2.6, type: 'physical' }, knockback: 1.5, tags: ['major', 'melee', 'aoe', 'physical', 'spec'],
    vfx: { trail: 'slash_arc_big', impact: 'hit_spark' }, sfx: { cast: 'bow_shot', impact: 'hit_flesh' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, stagger: 10, proc: 1, weight: 1 },
  });

  add({
    id: 'archer_sv_last_stand', classId: 'archer', spec: 'archer_survival', name: 'Hayatta Kalma Yarışı (Survival of the Fittest)', icon: I('skill-shield-wall'), unlockLevel: 10,
    desc: '12 saniye boyunca aldığın hasar %25 azalır.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.3, targeting: 'self_buff',
    selfStatuses: [{ status: 'survivor_ward', duration: 12 }], tags: ['major', 'defensive', 'buff', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 45, end: 0.8, chain: 0.1, move: 0.15, weight: 0 },
  });

  // =====================================================================================================
  // Added rows (Midnight core list, docs/WOW_ABILITY_MAP.md §5). Keys: see the bars in specs_kit_archer.ts.
  // =====================================================================================================
  // Gizemli Ok (Arcane Shot), Nişancı: the q spender, arcane damage
  add({
    id: 'archer_arcane_shot', classId: 'archer', spec: 'archer_marksman', name: 'Gizemli Ok (Arcane Shot)', icon: I('skill-piercing-shot'), unlockLevel: 1,
    desc: 'Gizemli enerjili bir ok atarsın: %240 gizem hasarı verir. 25 Odak harcar.',
    cost: 25, cooldown: 0, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.2, hitTime: 0.32, targeting: 'projectile', range: 35,
    speed: 70, radius: 0.35, count: 1, pierce: 0, damage: { coef: 2.4, type: 'arcane' },
    tags: ['spec', 'ranged', 'projectile', 'arcane', 'spender'], vfx: { projectile: 'arrow_projectile', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.6, chain: 0.08, move: 0.15, stagger: 6, proc: 0.8, weight: 1 },
  });
  // Kobra Atışı (Cobra Shot), Av Ustası: the rmb builder (Odak from params.gain)
  add({
    id: 'archer_cobra_shot', classId: 'archer', spec: 'archer_beastmaster', name: 'Kobra Atışı (Cobra Shot)', icon: I('skill-piercing-shot'), unlockLevel: 1,
    desc: 'Hızlı bir ok atarsın: %110 hasar verir ve 10 Odak kazandırır.',
    cost: 0, cooldown: 0, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.8, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 60, radius: 0.3, count: 1, pierce: 0, damage: { coef: 1.1, type: 'physical' },
    tags: ['spec', 'ranged', 'projectile', 'physical', 'builder'], vfx: { projectile: 'arrow_projectile', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 3, proc: 0.7, gain: 10, weight: 0, upper: 1, slow: 0.2 },
  });
  // Dikenli Atış (Barbed Shot), Av Ustası: builder on a cooldown (the pet frenzy is a hook, see the report)
  add({
    id: 'archer_barbed_shot', classId: 'archer', spec: 'archer_beastmaster', name: 'Dikenli Atış (Barbed Shot)', icon: I('skill-claw-strike'), unlockLevel: 10,
    desc: 'Dikenli bir ok atarsın: %90 hasar verir ve 5 Odak kazandırır. Vahşi Öfke yığını (en çok 3, 8 sn) kazanırsın: her yığın yoldaşlarının saldırı hızını %10 artırır. 8 saniye bekleme.',
    cost: 0, cooldown: 8, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.6, hitTime: 0.32, targeting: 'projectile', range: 28,
    speed: 60, radius: 0.3, count: 1, pierce: 0, damage: { coef: 0.9, type: 'physical' },
    tags: ['spec', 'ranged', 'projectile', 'physical', 'builder'], vfx: { projectile: 'arrow_projectile', impact: 'hit_spark' },
    sfx: { cast: 'bow_shot', impact: 'arrow_hit' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 3, proc: 0.7, gain: 5, weight: 0, upper: 1, slow: 0.2 },
  });
  // Karşı Atış (Counter Shot), Av Ustası: the interrupt (interrupt behaviour, as in utilities.ts)
  add({
    id: 'archer_counter_shot', classId: 'archer', spec: 'archer_beastmaster', name: 'Karşı Atış (Counter Shot)', icon: I('skill-thrust'), unlockLevel: 1,
    desc: '25 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye boyunca aynı okulun büyülerini yapmasını engeller (boss: yalnızca büyü kesilir). 20 saniye bekleme.',
    cost: 0, cooldown: 20, castTime: 0, anim: '2H_Ranged_Shoot', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'target_instant', range: 25, behavior: 'interrupt', offGcd: true,
    tags: ['offgcd', 'ranged', 'interrupt', 'spec'], vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'interrupt' },
    params: { lockout: 3, end: 0.5, chain: 0.05, move: 0.1, weight: 0 },
  });
  // Donma Tuzağı (Freezing Trap), Av Ustası: the Pençe Tuzağı trap that freezes instead of rooting (one trap at a time)
  add({
    id: 'archer_freezing_trap', classId: 'archer', spec: 'archer_beastmaster', name: 'Donma Tuzağı (Freezing Trap)', icon: I('skill-snare-trap'), unlockLevel: 15,
    desc: 'Yere bir tuzak kurarsın (30 sn, en fazla 1). Düşman basınca 4 saniye donar ve hasar alır.',
    cost: 20, cooldown: 30, castTime: 0, anim: 'Throw', animSpeed: 1.5, hitTime: 0.615, targeting: 'ground_aoe', range: 7, radius: 1.8,
    behavior: 'archer_trap', damage: { coef: 0.8, type: 'physical' }, statuses: [{ status: 'freeze', duration: 4 }],
    tags: ['trap', 'ground', 'aoe', 'physical', 'spec'], vfx: { ground: 'trap_ring', impact: 'trap_snap' }, sfx: { cast: 'trap_arm', impact: 'trap_snap' },
    params: { trapArm: 0.8, trapMax: 1, trapLife: 30, stagger: 8, proc: 1, weight: 1, end: 0.95, chain: 0.1, move: 0.2 },
  });
  // Kaplumbağa Vaşağı (Aspect of the Turtle), Hayatta Kalma: 8 s of invulnerability
  add({
    id: 'archer_aspect_turtle', classId: 'archer', spec: 'archer_survival', name: 'Kaplumbağa Vaşağı (Aspect of the Turtle)', icon: I('skill-shield-wall'), unlockLevel: 15,
    desc: '8 saniye boyunca hiçbir hasar almazsın. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.5, hitTime: 0.3, targeting: 'self_buff', behavior: 'status_self',
    selfStatuses: [{ status: 'invulnerable', duration: 8 }], tags: ['defensive', 'spec'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });
  // Koordineli Saldırı (Coordinated Assault), Hayatta Kalma (m90): +15 % damage for 20 s; the pet strike part is a hook
  add({
    id: 'archer_coordinated_assault', classId: 'archer', spec: 'archer_survival', name: 'Koordineli Saldırı (Coordinated Assault)', icon: I('skill-battle-shout'), unlockLevel: 20,
    desc: '20 saniye boyunca hasarın %15 artar. 90 saniye bekleme.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Cheer', animSpeed: 1.6, hitTime: 0.3, targeting: 'self_buff', behavior: 'status_self',
    selfStatuses: [{ status: 'empower', duration: 20, magnitude: 0.15 }], tags: ['major', 'buff', 'spec'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'war_cry' },
    params: { major: 90, end: 0.8, chain: 0.1, move: 0.15, weight: 1 },
  });
}
