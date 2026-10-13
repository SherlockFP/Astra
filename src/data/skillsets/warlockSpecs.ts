/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10a / §11a). Spec-bound warlock rows: Azap (warlock_affliction) and Yıkım
 * (warlock_destruction) bar rows, the two spectral summons (E7) and the shared Malevolence major. Class-level rows (the chain,
 * Azap, Yozlaşma, İblis Çemberi, Karanlık Pakt) are in warlock.ts. Spell Lock and Unending Resolve are in skills_kit_warlock.ts.
 * OWNER: combat (data).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerWarlockSpecs(add: SkillAdd): void {
  // =====================================================================================================
  // Azap (warlock_affliction), §10a
  // =====================================================================================================
  add({
    id: 'warlock_haunt', classId: 'warlock', spec: 'warlock_affliction', name: 'Musallat', icon: I('skill-curse'), unlockLevel: 10, defaultSlot: 's1',
    desc: 'Hedefe ruh bağlarsın: 18 saniye boyunca ona verdiğin hasar %16 artar. Hedef ölürse bekleme sıfırlanır.',
    cost: 6, cooldown: 15, castTime: 1.2, hitTime: 1.2, anim: 'Spellcast_Shoot', animSpeed: 1.3, targeting: 'projectile', range: 35, speed: 20, homing: 4,
    damage: { coef: 1.2, type: 'shadow' }, statuses: [{ status: 'haunt', duration: 18 }],
    tags: ['spell', 'projectile', 'shadow', 'spec'], vfx: { projectile: 'soul_wisp', impact: 'shadow_burst' },
    sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
  });

  add({
    id: 'warlock_unstable_affliction', classId: 'warlock', spec: 'warlock_affliction', name: 'Dengesiz Azap', icon: I('skill-curse'), unlockLevel: 10, defaultSlot: 'q',
    desc: '10 Ruh Parçası (1 parça) ve 6 mana harcayarak kararsız bir gölge bırakırsın. 16 saniye sürer; her bırakış ayrı bir örnektir (en çok 3).',
    cost: 6, cooldown: 0, castTime: 1.2, hitTime: 1.2, anim: 'Spellcast_Shoot', animSpeed: 1.5, targeting: 'projectile', range: 30, speed: 26, homing: 6,
    pip: { id: 'shard', cost: 10 },
    damage: { coef: 0.3, type: 'shadow' }, statuses: [{ status: 'unstable_affliction', duration: 16, stacks: 1, magnitude: 7.33 }],
    tags: ['spell', 'projectile', 'shadow', 'dot', 'spec'], vfx: { projectile: 'shadow_projectile', impact: 'unstable_burst' },
    sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
  });

  // Replace-only (q while aoe_mode): Yozlaşma Tohumu. Detonates after 12 s (the 4 x damage trigger is a hook, see report).
  add({
    id: 'warlock_seed_of_corruption', classId: 'warlock', spec: 'warlock_affliction', name: 'Yozlaşma Tohumu', icon: I('skill-curse'), unlockLevel: 12,
    desc: 'Bir tohum bırakırsın: 12 saniye sonra 10 metrelik alanda patlar ve herkese Yozlaşma uygular. Üç veya daha fazla düşman varken Dengesiz Azap yerine gelir.',
    cost: 8, cooldown: 0, castTime: 1.6, hitTime: 1.6, anim: 'Spellcast_Shoot', animSpeed: 1.3, targeting: 'projectile', range: 30, speed: 22, homing: 5,
    pip: { id: 'shard', cost: 10 }, damage: { coef: 4.6, type: 'shadow' },
    replaces: { skill: 'warlock_unstable_affliction', whileStatus: 'aoe_mode' },
    tags: ['aoe', 'spell', 'shadow', 'spec'], behavior: 'kit_seed',
    params: { fuse: 12, radius: 10, coef: 4.6 },
    vfx: { projectile: 'shadow_projectile', impact: 'curse_ring' }, sfx: { cast: 'curse_cast', impact: 'explosion' },
  });

  // Karanlık Göz (m90): 10 pulses over 20 s, 0.55 shadow on every enemy carrying one of your DoTs; own DoT +20 %
  add({
    id: 'warlock_summon_darkglare', classId: 'warlock', spec: 'warlock_affliction', name: 'Karanlık Göz', icon: I('skill-curse'), unlockLevel: 20,
    desc: 'Hedefin yanında bir göz çağırırsın: 20 saniye boyunca, senin DoT taşıyan her düşmana her 2 saniyede bir gölge hasarı verir. Bu sürede DoT hasarın %20 artar.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Summon', animSpeed: 2.4, targeting: 'custom', range: 35,
    behavior: 'kit_darkglare', damage: { coef: 0.55, type: 'shadow' }, selfStatuses: [{ status: 'darkglare_active', duration: 20 }],
    tags: ['major', 'summon', 'spectral', 'shadow', 'spec'], vfx: { cast: 'darkglare_eye', impact: 'curse_ring' },
    sfx: { cast: 'demon_summon', impact: 'curse_cast' },
    params: { major: 90, pulses: 10, interval: 2, radius: 40 },
  });

  // =====================================================================================================
  // Yıkım (warlock_destruction), §11a
  // =====================================================================================================
  add({
    id: 'warlock_incinerate', classId: 'warlock', spec: 'warlock_destruction', name: 'Kül Etme', icon: I('skill-fireball'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Hedefe ateş fırlatırsın. 8 mana; her kullanımda 2 Ruh Parçası kazandırır.',
    cost: 8, cooldown: 0, castTime: 1.6, hitTime: 1.6, anim: 'Spellcast_Shoot', animSpeed: 1.15, targeting: 'projectile', range: 30, speed: 26, homing: 5,
    pip: { id: 'shard', gain: 2 }, damage: { coef: 1.0, type: 'fire' }, tags: ['spell', 'projectile', 'fire', 'spec'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
  });

  add({
    id: 'warlock_conflagrate', classId: 'warlock', spec: 'warlock_destruction', name: 'Alevlendirme', icon: I('skill-fire-breath'), unlockLevel: 3, defaultSlot: 'e',
    desc: 'Hedefi alevlendirirsin: 1,5 ateş hasarı, 5 Ruh Parçası ve 12 saniye iki Dönüş Alevi yığını. İki yükü vardır, 13 saniyede yenilenir.',
    cost: 0, cooldown: 13, charges: 2, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.8, targeting: 'custom', range: 30,
    behavior: 'kit_target_spell', damage: { coef: 1.5, type: 'fire' }, pip: { id: 'shard', gain: 5 },
    selfStatuses: [{ status: 'backdraft', duration: 12, stacks: 2 }], tags: ['spell', 'fire', 'instant', 'spec'],
    vfx: { cast: 'fire_burst', impact: 'hit_spark' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
  });

  add({
    id: 'warlock_immolate', classId: 'warlock', spec: 'warlock_destruction', name: 'Yakıp Yıkma', icon: I('skill-firewall'), unlockLevel: 6, defaultSlot: 'r',
    desc: 'Hedefe ateş bırakırsın: 18 saniye boyunca yanma hasarı verir.',
    cost: 6, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.6, targeting: 'custom', range: 35,
    behavior: 'kit_target_spell', damage: { coef: 0.15, type: 'fire' }, statuses: [{ status: 'immolate', duration: 18, stacks: 1, magnitude: 13.67 }],
    tags: ['spell', 'dot', 'fire', 'instant', 'spec'], vfx: { cast: 'burn_loop', impact: 'fire_burst' }, sfx: { cast: 'fire_cast' },
  });

  // Replace-only (q while exec_window): Gölge Yakma (instant, refunds 10 fragments on a kill; charge refund is a hook)
  add({
    id: 'warlock_shadowburn', classId: 'warlock', spec: 'warlock_destruction', name: 'Gölge Yakma', icon: I('skill-shadow-grasp'), unlockLevel: 10,
    desc: 'Hedefe anlık gölge hasarı verirsin. Öldürürsen 10 Ruh Parçası geri kazanırsın. Hedef canının %20\'sinin altındayken Kaos Oku yerine gelir.',
    cost: 4, cooldown: 12, charges: 2, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.8, targeting: 'custom', range: 30,
    behavior: 'kit_shadowburn', pip: { id: 'shard', cost: 10 }, damage: { coef: 4.0, type: 'shadow' },
    replaces: { skill: 'warlock_chaos_bolt', whileStatus: 'exec_window' }, tags: ['spell', 'shadow', 'instant', 'execute', 'spec'],
    params: { killShards: 10 }, vfx: { cast: 'shadow_burst', impact: 'crit_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
  });

  // Kaos Oku (q, granted by tree s05): 2.4 s cast, 20 fragments, always crits (the crit lock is a hook, see report)
  add({
    id: 'warlock_chaos_bolt', classId: 'warlock', spec: 'warlock_destruction', name: 'Kaos Oku', icon: I('skill-fireball'), unlockLevel: 15, defaultSlot: 'q',
    desc: 'Ağır bir kaos okudur: 2 Ruh Parçası ve 10 mana harcar; her zaman kritik vurur ve ateş direncinin yarısını yok sayar. Dönüş Alevi varken daha hızlı yapılır.',
    cost: 10, cooldown: 0, castTime: 2.4, hitTime: 2.4, anim: 'Spellcast_Raise', animSpeed: 1.0, targeting: 'projectile', range: 30, speed: 22, homing: 4,
    pip: { id: 'shard', cost: 20 }, damage: { coef: 4.4, type: 'fire' }, tags: ['spell', 'projectile', 'fire', 'heavy', 'spec'],
    params: { alwaysCrit: 1, fireResistIgnore: 0.5 },
    vfx: { projectile: 'fire_projectile', impact: 'crit_burst' }, sfx: { cast: 'fel_cast', impact: 'fire_impact' },
  });

  // Ateş Yağmuru (s1): ground r 6, 8 ticks over 8 s, 1.0 per tick, crowd-scaled. 30 fragments.
  add({
    id: 'warlock_rain_of_fire', classId: 'warlock', spec: 'warlock_destruction', name: 'Ateş Yağmuru', icon: I('skill-firewall'), unlockLevel: 12, defaultSlot: 's1',
    desc: 'Yere 8 saniye boyunca ateş yağdırırsın: çevredeki düşmanlara her saniye ateş hasarı verir. 3 Ruh Parçası harcar.',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.2, anim: 'Spellcast_Raise', animSpeed: 1.6, targeting: 'ground_aoe', range: 35, radius: 6,
    pip: { id: 'shard', cost: 30 }, behavior: 'kit_rain_of_fire', damage: { coef: 1.0, type: 'fire' },
    tags: ['aoe', 'fire', 'crowd', 'spec'], params: { ticks: 8, interval: 1, radius: 6 },
    vfx: { ground: 'fire_rain', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
  });

  // Cehennem Muhafızı (m90): landing fire 2.0 r 4 + stun 2 s, 30 pulses of 0.2 r 6 over 30 s, +1 fragment per second
  add({
    id: 'warlock_summon_infernal', classId: 'warlock', spec: 'warlock_destruction', name: 'Cehennem Muhafızı', icon: I('skill-fire-nova'), unlockLevel: 20,
    desc: 'Hedefe bir cehennem muhafızı indirirsin: düşen yerde ateş hasarı verir ve yakındakileri 2 saniye sersemletir. 30 saniye boyunca yakındakilere ateş vurur ve saniyede 1 Ruh Parçası üretir.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Raise', animSpeed: 1.6, targeting: 'ground_aoe', range: 35, radius: 4,
    behavior: 'kit_infernal', damage: { coef: 2.0, type: 'fire' }, statuses: [{ status: 'stun', duration: 2 }],
    tags: ['major', 'summon', 'spectral', 'fire', 'spec'], vfx: { cast: 'infernal_fall', ground: 'shockwave' },
    sfx: { cast: 'demon_summon', impact: 'explosion' },
    params: { major: 90, landRadius: 4, landCoef: 2.0, stun: 2, pulses: 30, interval: 1, coef: 0.2, radius: 6, frag: 1 },
  });

  // =====================================================================================================
  // Shared major (both specs, m45): Kötülük (WoW Malevolence baked in, hero talents are not modelled)
  // =====================================================================================================
  add({
    id: 'warlock_malevolence', classId: 'warlock', name: 'Kötülük', icon: I('skill-curse'), unlockLevel: 10,
    desc: 'Kötülüğü çağırırsın: 20 saniye boyunca %8 hız ve %12 DoT hasarı kazanırsın. Anında, DoT taşıyan her düşmana her DoT için 0,5 gölge hasarı verir (en çok 3 DoT).',
    cost: 0, cooldown: 45, castTime: 0, hitTime: 0.2, anim: 'Spellcast_Raise', animSpeed: 1.8, targeting: 'self_buff',
    behavior: 'kit_dot_pulse', damage: { coef: 0.5, type: 'shadow' }, offGcd: true,
    selfStatuses: [{ status: 'malevolence', duration: 20 }], tags: ['major', 'offensive', 'buff'],
    vfx: { cast: 'fel_aura' }, sfx: { cast: 'fel_cast', impact: 'proc_gain' },
    params: { major: 45, perDot: 0.5, capDots: 3, radius: 30 },
  });
}
