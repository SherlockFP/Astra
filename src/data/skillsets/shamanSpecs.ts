/**
 * Şaman spec-bound skill rows: Elementel (shaman_elemental, ranged DPS), Geliştirme (shaman_enhancement, melee DPS) and
 * Restorasyon (shaman_restoration, healer). SpecDef rows are in specs_kit_shaman.ts. OWNER: shaman kit.
 *
 * Names follow WoW Midnight (docs/WOW_ABILITY_MAP.md section 12). Ids are kept from the first pass where the talent raw
 * rows (talentTrees/raw/shaman.ts, generated) name them: shaman_totem_fire is now the Fire Elemental (a mobile summon).
 *
 * Totems and elementals are summoned minions (data/minions/shaman.ts). Healing totem and Healing Rain effects are behaviours in
 * combat/skills/behaviors_shaman.ts. The spec basics: shaman_basic (Elementel), shaman_enh_basic (a 3-step auto attack chain,
 * Girdap per step), shaman_resto_basic (Healing Surge, a fast heal bolt).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const CHAIN = 'Otomatik Saldırı (Auto Attack)';

export function registerShamanSpecs(add: SkillAdd): void {
  // Ruh Bağı Totemi (Spirit Link Totem), Restorasyon: a 6 s totem; every second the allies within 10 m are lifted to their shared HP share
  // (behaviour hp_redistribute: equalises the party; local allies above the share come down; see the Midnight report).
  add({
    id: 'shaman_spirit_link', classId: 'shaman', spec: 'shaman_restoration', name: 'Ruh Bağı Totemi (Spirit Link Totem)', icon: I('skill-regeneration'), unlockLevel: 20,
    desc: 'Yere bir ruh bağı totemi dikersin; 6 saniye boyunca 10 metre içindeki müttefiklerin canı, grubun ortalama can oranına doğru yükselir; en canlı müttefikin canı ise o orana iner. 120 saniye bekleme.',
    cost: 15, cooldown: 120, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'hp_redistribute', radius: 10, duration: 6,
    minion: { id: 'shaman_spirit_link_totem', count: 1, group: 'lesser', life: 6 },
    tags: ['totem', 'heal', 'spec', 'defensive'], vfx: { cast: 'pet_summon', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });
  // Toprak Duvarı Totemi (Earthen Wall), Restorasyon, T (m180): a 15 s totem; allies within 10 m get an absorb of 10 % of max HP (cap 20 %)
  add({
    id: 'shaman_earthen_wall', classId: 'shaman', spec: 'shaman_restoration', name: 'Toprak Duvarı Totemi (Earthen Wall)', icon: I('skill-shield-wall'), unlockLevel: 16,
    desc: 'Yere bir toprak duvarı totemi dikersin; 15 saniye boyunca 10 metre içindeki müttefiklerin maks. canının %10\'u kadar emici kalkan alır (en fazla %20).',
    cost: 20, cooldown: 90, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'absorb_ally', range: 25,
    minion: { id: 'shaman_earthen_wall_totem', count: 1, group: 'lesser', life: 15 },
    statuses: [{ status: 'earthen_wall', duration: 15 }],
    tags: ['totem', 'defensive', 'spec', 'absorb'], vfx: { cast: 'pet_summon', impact: 'shield_bubble' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { radius: 10, absorbPct: 0.1, capPct: 0.2, end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });
  // =====================================================================================================
  // Elementel (shaman_elemental, DPS, ranged). Girdap is spent by Toprak Şoku and Deprem, grown by Yıldırım Oku and Lav Patlaması.
  // =====================================================================================================
  add({
    id: 'shaman_flame_shock', classId: 'shaman', spec: 'shaman_elemental', name: 'Alev Şoku (Flame Shock)', icon: I('debuff-burn'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Hedefe bir alev şoku bırakırsın: %50 ateş hasarı verir ve 12 saniye boyunca yakar.',
    cost: 10, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.4,
    targeting: 'projectile', range: 30, speed: 35, radius: 0.3, count: 1,
    damage: { coef: 0.5, type: 'fire' }, statuses: [{ status: 'burn', duration: 12 }],
    tags: ['spell', 'projectile', 'fire', 'dot', 'spec'], vfx: { projectile: 'fire_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  add({
    id: 'shaman_lava_burst', classId: 'shaman', spec: 'shaman_elemental', name: 'Lav Patlaması (Lava Burst)', icon: I('skill-fireball'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Lav topu fırlatırsın: %300 ateş hasarı verir ve 10 Girdap kazandırır. 8 saniyelik bekleme süresi vardır.',
    cost: 14, cooldown: 8, castTime: 1.8, hitTime: 1.8, anim: 'Spellcast_Shoot', animSpeed: 1.0,
    targeting: 'projectile', range: 30, speed: 30, radius: 0.5, count: 1,
    damage: { coef: 3.0, type: 'fire' }, pip: { id: 'maelstrom', gain: 10 },
    tags: ['spell', 'projectile', 'fire', 'spec'], vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 6, weight: 1, upper: 0 },
  });
  add({
    id: 'shaman_earth_shock', classId: 'shaman', spec: 'shaman_elemental', name: 'Toprak Şoku (Earth Shock)', icon: I('debuff-shock'), unlockLevel: 10, defaultSlot: 's1',
    desc: '60 Girdap harcayarak %260 fiziksel hasar verirsin. Hedef 6 saniye boyunca daha fazla hasar alır.',
    cost: 0, cooldown: 6, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Shoot', animSpeed: 1.6,
    targeting: 'projectile', range: 30, speed: 45, radius: 0.3, count: 1,
    damage: { coef: 2.6, type: 'physical' }, pip: { id: 'maelstrom', cost: 60, min: 60 }, statuses: [{ status: 'shock', duration: 6 }],
    tags: ['spell', 'projectile', 'spender', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.5, chain: 0.05, move: 0.1, stagger: 4, weight: 0 },
  });
  add({
    id: 'shaman_chain_lightning', classId: 'shaman', spec: 'shaman_elemental', name: 'Zincir Yıldırım (Chain Lightning)', icon: I('skill-chain-lightning'), unlockLevel: 15, defaultSlot: 's2',
    desc: 'Düşmanlar arasında 3 kez sekip her biri için %160 yıldırım hasarı veren bir yıldırım fırlatırsın. 6 Girdap kazandırır.',
    cost: 16, cooldown: 0, castTime: 1.6, hitTime: 1.6, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'projectile', range: 28, speed: 30, radius: 0.6, count: 1, behavior: 'chain_projectile',
    damage: { coef: 1.6, type: 'lightning' }, pip: { id: 'maelstrom', gain: 6 },
    tags: ['spell', 'projectile', 'lightning', 'chain', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 0.8, weight: 0, upper: 1, slow: 0.5, bounces: 3, bounceRange: 8, bounceMult: 0.8 },
  });
  add({
    id: 'shaman_elemental_blast', classId: 'shaman', spec: 'shaman_elemental', name: 'Elementel Patlama (Elemental Blast)', icon: I('skill-meteor'), unlockLevel: 20,
    desc: '2 saniyelik yüklemenin ardından %220 yıldırım hasarı veren bir patlama fırlatırsın ve 12 Girdap kazanırsın. 12 saniyede bir kullanılır.',
    cost: 14, cooldown: 12, castTime: 2.0, hitTime: 2.0, anim: 'Spellcast_Shoot', animSpeed: 1.0,
    targeting: 'projectile', range: 30, speed: 30, radius: 0.5, count: 1,
    damage: { coef: 2.2, type: 'lightning' }, pip: { id: 'maelstrom', gain: 12 },
    tags: ['spell', 'projectile', 'lightning', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 5, weight: 1, upper: 0 },
  });
  // Deprem (Earthquake): Girdap harcar (50+), 8 saniye boyunca 8 m içinde sarsıntı; her sarsıntı hasar verir
  add({
    id: 'shaman_earthquake', classId: 'shaman', spec: 'shaman_elemental', name: 'Deprem (Earthquake)', icon: I('skill-cleave'), unlockLevel: 20,
    desc: 'Girdap harcayarak (en az 50) 8 metre içinde 8 saniye boyunca sarsıntı yaratırsın; her sarsıntı hedeflere hasar verir.',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'ground_aoe', range: 25, radius: 8, duration: 8, ticks: 4,
    damage: { coef: 0.5, type: 'physical', perTick: true }, pip: { id: 'maelstrom', cost: 50, min: 50 },
    tags: ['spell', 'aoe', 'spender', 'spec'], vfx: { impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'punch_hit' },
    params: { end: 0.7, chain: 0.1, move: 0.2, stagger: 4, weight: 1 },
  });
  add({
    id: 'shaman_totem_earthbind', classId: 'shaman', spec: 'shaman_elemental', name: 'Toprak Bağlama Totemi (Earthbind Totem)', icon: I('debuff-root'), unlockLevel: 15,
    desc: 'Yere bir toprak bağlama totemi dikersin; 20 saniye boyunca yakındaki düşmanları kısa süre köklendirir.',
    cost: 20, cooldown: 30, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'shaman_earthbind_totem', count: 1, group: 'lesser', life: 20 },
    tags: ['totem', 'summon', 'root', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });
  // Fırtına Bekçisi (m45): the next 2 Lightning Bolts are instant and empowered (status stormkeeper, 2 stacks, one spent per bolt; proc mod)
  add({
    id: 'shaman_stormkeeper', classId: 'shaman', spec: 'shaman_elemental', name: 'Fırtına Bekçisi (Stormkeeper)', icon: I('skill-thunderstorm'), unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Sonraki iki Yıldırım Okunu anında ve güçlendirilmiş atarsın. 20 saniye içinde kullanılmazsa biter.',
    cost: 0, cooldown: 60, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.6,
    targeting: 'self_buff', selfStatuses: [{ status: 'stormkeeper', duration: 20, stacks: 2 }],
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Ateş Elementali (Fire Elemental, id kept as shaman_totem_fire): a mobile fire elemental for 30 s (r key, long cooldown)
  add({
    id: 'shaman_totem_fire', classId: 'shaman', spec: 'shaman_elemental', name: 'Ateş Elementali (Fire Elemental)', icon: I('skill-summon-skeleton'), unlockLevel: 20, defaultSlot: 'r',
    desc: 'Yanında 30 saniye boyunca savaşan bir ateş elementali çağırırsın; yakındaki düşmanlara ateş saldırısı yapar.',
    cost: 0, cooldown: 240, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'shaman_fire_elemental', count: 1, group: 'infernal', life: 30 },
    tags: ['major', 'summon', 'fire', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });
  // Yükseliş (m90): +25 % damage dealt for 15 s
  add({
    id: 'shaman_ascendance', classId: 'shaman', spec: 'shaman_elemental', name: 'Yükseliş (Ascendance)', icon: I('skill-meteor'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '15 saniye boyunca büyü hasarın %25 artar.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'self_buff', selfStatuses: [{ status: 'empower', duration: 15, magnitude: 0.25 }],
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'war_cry' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });
  // Toprak Elementali (Earth Elemental, m180): a tank elemental for 60 s that draws the enemies to it
  add({
    id: 'shaman_earth_elemental', classId: 'shaman', spec: 'shaman_elemental', name: 'Toprak Elementali (Earth Elemental)', icon: I('skill-summon-skeleton'), unlockLevel: 25, defaultSlot: 'm180',
    desc: '60 saniye boyunca yanında duran bir toprak elementali çağırırsın; düşmanları kendine çeker.',
    cost: 0, cooldown: 300, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'shaman_earth_elemental', count: 1, group: 'golem', life: 60 },
    tags: ['major', 'summon', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'chi_cast' },
    params: { major: 180, end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  });

  // =====================================================================================================
  // Geliştirme (shaman_enhancement, DPS, melee). Girdap is grown by the weapon chain and spent by Girdap Patlaması.
  // =====================================================================================================
  // Auto attack chain (3 steps, weight 0 · 0 · 4). Girdap 4 / 4 / 6 per full chain (14). Engine stand-in for the weapon auto attack.
  add({
    id: 'shaman_enh_basic', classId: 'shaman', spec: 'shaman_enhancement', name: CHAIN, icon: I('skill-double-strike'), unlockLevel: 1,
    desc: 'Silahınla üç vuruşluk bir zincir yaparsın. Her vuruş Girdap kazandırır; üçüncüsü ağır bir savurmadır.',
    anim: 'Dualwield_Melee_Attack_Stab', targeting: 'melee_arc', range: 2.6, arc: 90, tags: ['melee', 'basic', 'spec'],
    behavior: 'combo', params: { steps: 3, reset: 0.8 },
  });
  add({
    id: 'shaman_enh_basic_1', classId: 'shaman', spec: 'shaman_enhancement', name: 'Ana El Vuruşu (Main-hand)', icon: I('skill-double-strike'),
    desc: 'Zincirin ilk vuruşu. 4 Girdap kazandırır.',
    anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.8, hitTime: 0.38, targeting: 'melee_arc', range: 2.6, arc: 90, knockback: 0.4,
    damage: { coef: 0.9, type: 'physical' }, pip: { id: 'maelstrom', gain: 4 },
    tags: ['melee', 'basic'], vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.8, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, weight: 0, step: 1 },
  });
  add({
    id: 'shaman_enh_basic_2', classId: 'shaman', spec: 'shaman_enhancement', name: 'Yan El Vuruşu (Off-hand)', icon: I('skill-double-strike'),
    desc: 'Zincirin ikinci, yan elin vuruşu. 4 Girdap kazandırır.',
    anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.7, hitTime: 0.42, targeting: 'melee_arc', range: 2.6, arc: 100, knockback: 0.5,
    damage: { coef: 0.95, type: 'physical' }, pip: { id: 'maelstrom', gain: 4 },
    tags: ['melee', 'basic'], vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.85, chain: 0.03, move: 0.08, stagger: 3, proc: 0.7, weight: 0, step: 2 },
  });
  add({
    id: 'shaman_enh_basic_3', classId: 'shaman', spec: 'shaman_enhancement', name: 'Fırtına Çarpması (Smash)', icon: I('skill-cleave'),
    desc: 'Zincirin sonu: silahınla yere çarparsın. Çevrene %150 hasar verir ve 6 Girdap kazandırır.',
    anim: '2H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.5, targeting: 'melee_arc', range: 3.0, arc: 80, knockback: 1.2,
    damage: { coef: 1.5, type: 'physical' }, pip: { id: 'maelstrom', gain: 6 },
    tags: ['melee', 'basic', 'finisher'], vfx: { trail: 'slash_arc_big', impact: 'palm_shock' }, sfx: { cast: 'swing_heavy', impact: 'punch_hit' },
    params: { end: 0.95, chain: 0.06, move: 0.2, stagger: 8, proc: 1, weight: 4, step: 3, finisher: 1, impactRadius: 1.5 },
  });
  // Fırtına Vuruşu (Stormstrike, rmb, L1): a weapon strike on a 7.5 s cooldown, +10 Girdap
  add({
    id: 'shaman_stormstrike', classId: 'shaman', spec: 'shaman_enhancement', name: 'Fırtına Vuruşu (Stormstrike)', icon: I('skill-quick-slash'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Silahınla bir fırtına vuruşu yaparsın: %240 hasar verir ve 10 Girdap kazandırır. 7.5 saniyede bir kullanılabilir.',
    cost: 0, cooldown: 7.5, castTime: 0, hitTime: 0.4, anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.5,
    targeting: 'melee_arc', range: 3.0, arc: 120, damage: { coef: 2.4, type: 'physical' }, pip: { id: 'maelstrom', gain: 10 },
    tags: ['melee', 'builder', 'spec'], vfx: { trail: 'slash_arc', impact: 'hit_spark' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.7, chain: 0.08, move: 0.18, stagger: 6, proc: 1, weight: 4, lunge: 0.6 },
  });
  add({
    id: 'shaman_lava_lash', classId: 'shaman', spec: 'shaman_enhancement', name: 'Lav Kamçısı (Lava Lash)', icon: I('skill-whirlwind'), unlockLevel: 10, defaultSlot: 'e',
    desc: 'Silahına lav sararak %180 ateş hasarı verirsin; hedef 8 saniye boyunca yanar. 6 Girdap kazandırır.',
    cost: 0, cooldown: 8, castTime: 0, hitTime: 0.35, anim: '2H_Melee_Attack_Chop', animSpeed: 1.4,
    targeting: 'melee_arc', range: 3.5, arc: 80, damage: { coef: 1.8, type: 'fire' }, pip: { id: 'maelstrom', gain: 6 },
    statuses: [{ status: 'burn', duration: 8 }],
    tags: ['melee', 'fire', 'spec'], vfx: { trail: 'slash_arc', impact: 'fire_burst' }, sfx: { cast: 'swing_light', impact: 'punch_hit' },
    params: { end: 0.7, chain: 0.08, move: 0.15, stagger: 5, proc: 1, weight: 2 },
  });
  add({
    id: 'shaman_crash_lightning', classId: 'shaman', spec: 'shaman_enhancement', name: 'Çatırdayan Yıldırım (Crash Lightning)', icon: I('skill-thunderstorm'), unlockLevel: 10, defaultSlot: 's2',
    desc: 'Çevrendeki düşmanlara %120 yıldırım hasarı verir ve onları 6 saniye sarsarsın. 8 Girdap kazandırır.',
    cost: 0, cooldown: 8, castTime: 0, hitTime: 0.5, anim: '2H_Melee_Attack_Spin', animSpeed: 1.2,
    targeting: 'self_aoe', radius: 6, damage: { coef: 1.2, type: 'lightning' }, pip: { id: 'maelstrom', gain: 8 },
    statuses: [{ status: 'shock', duration: 6 }],
    tags: ['melee', 'aoe', 'lightning', 'spec'], vfx: { cast: 'spin_slash', impact: 'hit_spark' }, sfx: { cast: 'swing_heavy', impact: 'punch_hit' },
    params: { end: 0.9, chain: 0.1, move: 0.2, stagger: 6, proc: 1, weight: 2 },
  });
  // Girdap Patlaması (Maelstrom Weapon, s1, L10): spends 50+ Girdap; the hit grows with the spent stacks (0.01 per Girdap point)
  add({
    id: 'shaman_maelstrom_spender', classId: 'shaman', spec: 'shaman_enhancement', name: 'Girdap Patlaması (Maelstrom Weapon)', icon: I('skill-chain-lightning'), unlockLevel: 1, defaultSlot: 's1',
    desc: '50 Girdap harcarsın; harcadığın her Girdap noktası için hasar artar (taban %260 yıldırım hasarı).',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.4, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'projectile', range: 25, speed: 40, radius: 0.4, count: 1,
    damage: { coef: 2.6, type: 'lightning' }, pip: { id: 'maelstrom', cost: 50, min: 50, coefPerPip: 0.01 },
    tags: ['spell', 'projectile', 'lightning', 'spender', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 6, weight: 1 },
  });
  // Don Şoku (Frost Shock, L10, not on the default bar): a frost bolt that slows the target for 6 s
  add({
    id: 'shaman_frost_shock', classId: 'shaman', spec: 'shaman_enhancement', name: 'Don Şoku (Frost Shock)', icon: I('debuff-slow'), unlockLevel: 10,
    desc: '%80 buz hasarı verir ve hedefi 6 saniye boyunca yavaşlatır. 6 saniyede bir kullanılır.',
    cost: 10, cooldown: 6, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'projectile', range: 25, speed: 40, radius: 0.3, count: 1,
    damage: { coef: 0.8, type: 'frost' }, statuses: [{ status: 'slow', duration: 6 }],
    tags: ['spell', 'projectile', 'frost', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  // Ruh Kurdu Çağrısı (Feral Spirit, m90): two spirit wolves for 15 s (group pack, cap 2)
  add({
    id: 'shaman_feral_spirit', classId: 'shaman', spec: 'shaman_enhancement', name: 'Ruh Kurdu Çağrısı (Feral Spirit)', icon: I('skill-summon-skeleton'), unlockLevel: 20, defaultSlot: 'm90',
    desc: '15 saniye boyunca yanında savaşan iki ruh kurdu çağırırsın.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'summon', behavior: 'minion_summon', minion: { id: 'shaman_spirit_wolf', count: 2, group: 'pack', life: 15 },
    tags: ['major', 'summon', 'spec'], vfx: { cast: 'pet_summon' }, sfx: { cast: 'chi_cast' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });
  // Doğal Öfke (Doom Winds, m45): +30 % attack speed for 12 s
  add({
    id: 'shaman_enh_unleash', classId: 'shaman', spec: 'shaman_enhancement', name: 'Doğal Öfke (Doom Winds)', icon: I('skill-berserk'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '12 saniye boyunca %30 daha hızlı vurursun.',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.8,
    targeting: 'self_buff', selfStatuses: [{ status: 'unleash', duration: 12 }],
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'enrage_aura' }, sfx: { cast: 'war_cry' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Yükseliş (Ascendance, Geliştirme, m180): +25 % damage dealt for 15 s
  add({
    id: 'shaman_enh_ascendance', classId: 'shaman', spec: 'shaman_enhancement', name: 'Yükseliş (Ascendance)', icon: I('skill-meteor'), unlockLevel: 25, defaultSlot: 'm180',
    desc: '15 saniye boyunca verdiğin hasar %25 artar.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.4,
    targeting: 'self_buff', selfStatuses: [{ status: 'empower', duration: 15, magnitude: 0.25 }],
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'war_cry' },
    params: { major: 180, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  });

  // =====================================================================================================
  // Restorasyon (shaman_restoration, HEALER). Mana is the resource; Girdap is not used by this spec.
  // =====================================================================================================
  add({
    id: 'shaman_resto_basic', classId: 'shaman', spec: 'shaman_restoration', name: 'Şifa Atışı (Healing Surge)', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Hızlı bir şifa atarsın: bir müttefiki iyileştirir, düşmana çarparsa hafif hasar verir.',
    cost: 8, cooldown: 0, castTime: 0, hitTime: 0.37, anim: 'Spellcast_Shoot', animSpeed: 1.6,
    targeting: 'projectile', range: 30, speed: 26, count: 1, spread: 0, behavior: 'heal_bolt',
    heal: { coef: 0.8 }, damage: { coef: 0.6, type: 'lightning' }, allyTarget: 'friendly',
    tags: ['spell', 'basic', 'projectile', 'heal', 'spec'], vfx: { projectile: 'chi_projectile', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, weight: 0 },
  });
  add({
    id: 'shaman_healing_wave', classId: 'shaman', spec: 'shaman_restoration', name: 'Şifalı Dalga (Healing Wave)', icon: I('skill-heal'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: '1.5 saniyede bir müttefikini büyük ölçüde iyileştirirsin.',
    cost: 14, cooldown: 0, castTime: 1.5, hitTime: 1.5, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'heal_target', heal: { coef: 2.2 }, allyTarget: 'friendly',
    tags: ['spell', 'heal', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.8, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Gel-Git Dalgası (Riptide): instant heal and a 15 s HoT (0.25 of the heal per 3 s tick; numbers are picks)
  add({
    id: 'shaman_riptide', classId: 'shaman', spec: 'shaman_restoration', name: 'Gel-Git Dalgası (Riptide)', icon: I('skill-regeneration'), unlockLevel: 1, defaultSlot: 'q',
    desc: 'Bir müttefikine anında iyileştirme verir ve 15 saniye boyunca her 3 saniyede bir yeniden iyileştirirsin. 6 saniyede bir kullanılır.',
    cost: 10, cooldown: 6, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'shaman_hot', heal: { coef: 1.0 }, allyTarget: 'friendly',
    statuses: [{ status: 'riptide', duration: 15 }],
    tags: ['spell', 'heal', 'hot', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, hotCoef: 0.25, tick: 3 },
  });
  // Zincir Şifa (Chain Heal): 3 targets, 1.2 s cast; each bounce heals 70 % of the one before (bounces 2)
  add({
    id: 'shaman_chain_heal', classId: 'shaman', spec: 'shaman_restoration', name: 'Zincir Şifa (Chain Heal)', icon: I('skill-holy-nova'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Bir müttefikini iyileştirir; iyileşme yakındaki iki yaralı müttefike sıçrar ve her sıçrayışta %30 azalır.',
    cost: 18, cooldown: 0, castTime: 1.2, hitTime: 1.2, anim: 'Spellcasting', animSpeed: 1.1,
    targeting: 'custom', behavior: 'shaman_chain_heal', heal: { coef: 1.4 }, allyTarget: 'friendly',
    tags: ['spell', 'heal', 'chain', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.7, chain: 0.1, move: 0.15, weight: 0, bounces: 2, bounceRange: 10, bounceMult: 0.7 },
  });
  add({
    id: 'shaman_purify_spirit', classId: 'shaman', spec: 'shaman_restoration', name: 'Ruh Arındırma (Purify Spirit)', icon: I('skill-holy-water'), unlockLevel: 10, defaultSlot: 's2',
    desc: 'Bir müttefikinin üzerindeki en çok 2 zehir ya da büyü etkisini kaldırırsın; ona hafif bir iyileştirme de verirsin.',
    cost: 8, cooldown: 8, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'heal_target', heal: { coef: 0.5 }, allyTarget: 'friendly',
    tags: ['spell', 'heal', 'dispel', 'spec'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, dispel: 2 },
  });
  // Şifa Akıntısı Totemi (Healing Stream Totem): a stationary totem for 15 s; allies within 10 m get a 15 s HoT (0.2 per 2 s tick)
  add({
    id: 'shaman_stream_totem', classId: 'shaman', spec: 'shaman_restoration', name: 'Şifa Akıntısı Totemi (Healing Stream Totem)', icon: I('skill-prayer'), unlockLevel: 10,
    desc: 'Yere bir şifa totemi dikersin; 15 saniye boyunca 10 metre içindeki müttefiklerin her 2 saniyede bir iyileşir.',
    cost: 15, cooldown: 30, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'shaman_stream_totem', radius: 10,
    minion: { id: 'shaman_stream_totem', count: 1, group: 'lesser', life: 15 },
    statuses: [{ status: 'stream_totem', duration: 15 }],
    tags: ['totem', 'heal', 'hot', 'spec'], vfx: { cast: 'pet_summon', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.05, move: 0.1, weight: 0, hotCoef: 0.2, tick: 2 },
  });
  // Şifa Yağmuru (Healing Rain): 8 m ground area (placed on the caster in the engine), instant heal 0.6 and an 8 s HoT
  add({
    id: 'shaman_healing_rain', classId: 'shaman', spec: 'shaman_restoration', name: 'Şifa Yağmuru (Healing Rain)', icon: I('skill-rain-of-arrows'), unlockLevel: 15, defaultSlot: 's1',
    desc: 'Yakındaki yaralı müttefiklerini anında iyileştirir ve 8 saniye boyunca yağmur gibi iyileştirmeye devam edersin.',
    cost: 22, cooldown: 10, castTime: 1.0, hitTime: 1.0, anim: 'Spellcast_Raise', animSpeed: 1.1,
    targeting: 'ground_aoe', range: 25, radius: 8, duration: 8, behavior: 'shaman_rain',
    heal: { coef: 0.6 }, statuses: [{ status: 'rain_hot', duration: 8 }],
    tags: ['spell', 'heal', 'aoe', 'hot', 'spec'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.8, chain: 0.1, move: 0.15, weight: 1, hotCoef: 0.15, tick: 2 },
  });
  // Doğa Çabukluğu (Nature's Swiftness, m45): casts are instant for 8 s (castSpeed +100 %; the exact instant-cast rule is not modelled)
  add({
    id: 'shaman_nature_swiftness', classId: 'shaman', spec: 'shaman_restoration', name: "Doğa Çabukluğu (Nature's Swiftness)", icon: I('skill-prayer'), unlockLevel: 10, defaultSlot: 'm45',
    desc: '8 saniye boyunca büyülerin çok daha hızlı yapılır (Büyü Hızı +%100).',
    cost: 0, cooldown: 60, castTime: 0, hitTime: 0.3, anim: 'Cheer', animSpeed: 1.6,
    targeting: 'self_buff', selfStatuses: [{ status: 'swiftness', duration: 8 }],
    tags: ['major', 'buff', 'spec'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'chi_cast' },
    params: { major: 45, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  });
  // Gelgit Totemi (Healing Tide Totem, m90): a 12 s healing totem, the stream behaviour with 0.35 per 2 s tick, radius 14
  add({
    id: 'shaman_tide_totem', classId: 'shaman', spec: 'shaman_restoration', name: 'Gelgit Totemi (Healing Tide Totem)', icon: I('skill-resurrect'), unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Yere büyük bir gelgit totemi dikersin; 12 saniye boyunca 14 metre içindeki müttefiklerin ciddi biçimde iyileşir.',
    cost: 0, cooldown: 120, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.3,
    targeting: 'custom', behavior: 'shaman_stream_totem', radius: 14,
    minion: { id: 'shaman_tide_totem', count: 1, group: 'lesser', life: 12 },
    statuses: [{ status: 'stream_totem', duration: 12 }],
    tags: ['major', 'totem', 'heal', 'spec'], vfx: { cast: 'pet_summon', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { major: 90, end: 0.9, chain: 0.1, move: 0.2, weight: 2, hotCoef: 0.35, tick: 2 },
  });
}
