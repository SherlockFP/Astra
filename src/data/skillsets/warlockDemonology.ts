/**
 * WoW Midnight warlock rework (docs/WOW_ABILITY_MAP.md §8, §16): the Demonology spec rows (warlock_demonology: Demonbolt, Hand of
 * Gul'dan, Call Dreadstalkers, Implosion, Felguard, Demonic Tyrant) and the missing rows of the other specs / shared rows:
 * Malefic Rapture (Affliction spender), Havoc and Cataclysm (Destruction), Shadowfury, Mortal Coil and Healthstone (shared).
 * Summons use the minion_summon behaviour (minion rows, data/minions/warlock.ts); Implosion, Demonic Tyrant, Malefic Rapture,
 * Havoc, Cataclysm, Shadowfury, Mortal Coil and Healthstone are behaviours in combat/skills/warlockKit.ts.
 * Registered by registerWarlockSpecs (warlockSpecs.ts). OWNER: combat (data).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerWarlockExtras(add: SkillAdd): void {
  // =====================================================================================================
  // Demonology (warlock_demonology)
  // =====================================================================================================
  add({
    id: 'warlock_demonbolt', classId: 'warlock', spec: 'warlock_demonology', name: 'İblis Oku (Demonbolt)', icon: I('skill-shadow-grasp'),
    unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Hedefe bir iblis oku fırlatırsın: 8 mana, 1,6 sn. Her atış 2 Ruh Parçası kazandırır.',
    cost: 8, cooldown: 0, castTime: 1.6, hitTime: 1.6, anim: 'Spellcast_Shoot', animSpeed: 1.15, targeting: 'projectile', range: 30, speed: 28, homing: 5,
    pip: { id: 'shard', gain: 2 }, damage: { coef: 1.1, type: 'shadow' }, tags: ['spell', 'projectile', 'shadow', 'spec'],
    vfx: { projectile: 'shadow_projectile', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
  });

  add({
    id: 'warlock_hand_of_guldan', classId: 'warlock', spec: 'warlock_demonology', name: "Gul'dan'ın Eli (Hand of Gul'dan)", icon: I('skill-curse'),
    unlockLevel: 10, defaultSlot: 'q',
    desc: "3 Ruh Parçası harcayarak 3 Vahşi Cin çağırırsın. Cinler 20 saniye sonra kaybolur.",
    cost: 0, cooldown: 0, castTime: 1.2, hitTime: 1.2, anim: 'Spellcast_Summon', animSpeed: 1.4, targeting: 'summon',
    behavior: 'minion_summon', pip: { id: 'shard', cost: 30 }, minion: { id: 'warlock_wild_imp', count: 3, life: 20 },
    tags: ['summon', 'spec'], vfx: { cast: 'darkglare_eye' }, sfx: { cast: 'demon_summon' },
  });

  add({
    id: 'warlock_call_dreadstalkers', classId: 'warlock', spec: 'warlock_demonology', name: 'Dreadstalker Çağır (Call Dreadstalkers)', icon: I('skill-curse'),
    unlockLevel: 15, defaultSlot: 'e',
    desc: '2 Ruh Parçası harcayarak 2 Dreadstalker çağırırsın; 12 saniye boyunca saldırırlar.',
    cost: 0, cooldown: 20, castTime: 2.0, hitTime: 2.0, anim: 'Spellcast_Summon', animSpeed: 1.2, targeting: 'summon',
    behavior: 'minion_summon', pip: { id: 'shard', cost: 20 }, minion: { id: 'warlock_dreadstalker', count: 2, life: 12 },
    tags: ['summon', 'spec'], vfx: { cast: 'darkglare_eye' }, sfx: { cast: 'demon_summon' },
  });

  add({
    id: 'warlock_summon_felguard', classId: 'warlock', spec: 'warlock_demonology', name: 'Felguard Çağır (Summon Felguard)', icon: I('skill-curse'),
    unlockLevel: 10, defaultSlot: 's1',
    desc: 'Kalıcı bir Felguard yoldaşı çağırırsın. Ölürse 10 sn sonra ücretsiz geri döner; yeniden çağırmak eskisinin yerine geçer.',
    cost: 20, cooldown: 0, castTime: 2.0, hitTime: 2.0, anim: 'Spellcast_Summon', animSpeed: 1.2, targeting: 'summon',
    behavior: 'minion_summon', minion: { id: 'warlock_felguard', count: 1, group: 'pet' },
    tags: ['summon', 'pet', 'spec'], vfx: { cast: 'darkglare_eye' }, sfx: { cast: 'demon_summon' },
  });

  add({
    id: 'warlock_implosion', classId: 'warlock', spec: 'warlock_demonology', name: 'Patlama (Implosion)', icon: I('skill-fire-nova'),
    unlockLevel: 20, defaultSlot: 'r',
    desc: 'Tüm Vahşi Cinleri patlatırsın: her cin 4 metrelik alandaki düşmanlara ateş hasarı verir ve yok olur.',
    cost: 0, cooldown: 8, castTime: 0, hitTime: 0.5, anim: 'Spellcast_Raise', animSpeed: 1.5, targeting: 'self_buff',
    behavior: 'kit_implosion', damage: { coef: 0.6, type: 'fire' }, tags: ['aoe', 'fire', 'spec'],
    vfx: { ground: 'fire_rain', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
    params: { radius: 4, coef: 0.6 },
  });

  add({
    id: 'warlock_summon_demonic_tyrant', classId: 'warlock', spec: 'warlock_demonology', name: 'Demonik Tiran Çağır (Summon Demonic Tyrant)', icon: I('skill-fire-nova'),
    unlockLevel: 20,
    desc: '15 saniye boyunca yanında duran Demonik Tiran\'ı çağırırsın. Bu sürede yoldaşların hasarı %25 artar.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Summon', animSpeed: 1.5, targeting: 'summon',
    behavior: 'kit_tyrant', minion: { id: 'warlock_demonic_tyrant', count: 1, group: 'guardian', life: 15 },
    selfStatuses: [{ status: 'demonic_power', duration: 15 }], tags: ['major', 'summon', 'spectral', 'spec'],
    vfx: { cast: 'darkglare_eye' }, sfx: { cast: 'demon_summon', impact: 'curse_cast' },
    params: { major: 90 },
  });

  // =====================================================================================================
  // Affliction / Destruction additions
  // =====================================================================================================
  add({
    id: 'warlock_malefic_rapture', classId: 'warlock', spec: 'warlock_affliction', name: 'Kötücül Coşku (Malefic Rapture)', icon: I('skill-curse'),
    unlockLevel: 10, defaultSlot: 'q',
    desc: 'Tüm Ruh Parçalarını harcarsın (en az 1 parça). Yakınındaki DoT taşıyan her düşmana parça başına 0,5 gölge hasarı verirsin.',
    cost: 0, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Raise', animSpeed: 1.6, targeting: 'custom',
    behavior: 'kit_malefic', damage: { coef: 0.5, type: 'shadow' }, tags: ['spell', 'shadow', 'spender', 'spec'],
    vfx: { cast: 'unstable_burst', impact: 'shadow_burst' }, sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
    params: { perShard: 0.5, radius: 12 },
  });

  add({
    id: 'warlock_havoc', classId: 'warlock', spec: 'warlock_destruction', name: 'Kargaşa (Havoc)', icon: I('skill-fireball'),
    unlockLevel: 15,
    desc: 'Hedefe kargaşa bırakırsın: 15 saniye boyunca hedefe vurduğun büyüler yan hedeflere de vurur (yan vuruş kancası bekliyor).',
    cost: 4, cooldown: 30, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.6, targeting: 'custom', range: 30,
    behavior: 'kit_target_spell', damage: { coef: 0.4, type: 'fire' }, statuses: [{ status: 'havoc', duration: 15 }],
    tags: ['spell', 'fire', 'instant', 'spec'], vfx: { cast: 'fire_burst', impact: 'hit_spark' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
  });

  add({
    id: 'warlock_cataclysm', classId: 'warlock', spec: 'warlock_destruction', name: 'Cehennem Kıyameti (Cataclysm)', icon: I('skill-fire-nova'),
    unlockLevel: 20,
    desc: 'Yere bir kıyamet bırakırsın: 8 metrelik alandaki herkese ateş hasarı verir ve Yakıp Yıkma uygular.',
    cost: 10, cooldown: 30, castTime: 1.0, hitTime: 1.0, anim: 'Spellcast_Raise', animSpeed: 1.2, targeting: 'ground_aoe', range: 35, radius: 8,
    behavior: 'kit_cataclysm', damage: { coef: 1.3, type: 'fire' }, statuses: [{ status: 'immolate', duration: 18, stacks: 1, magnitude: 13.67 }],
    tags: ['aoe', 'fire', 'spec'], vfx: { ground: 'fire_rain', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
    params: { radius: 8 },
  });

  // =====================================================================================================
  // Shared rows (all three specs list them; none is on the default bar)
  // =====================================================================================================
  add({
    id: 'warlock_shadowfury', classId: 'warlock', name: 'Gölge Patlaması (Shadowfury)', icon: I('skill-fire-nova'),
    unlockLevel: 15,
    desc: 'Hedef noktada 8 metrelik gölge patlaması yaratırsın: alandakilere hasar verir ve 3 saniye sersemletir.',
    cost: 10, cooldown: 60, castTime: 1.5, hitTime: 1.5, anim: 'Spellcast_Raise', animSpeed: 1.4, targeting: 'ground_aoe', range: 30, radius: 8,
    behavior: 'kit_shadowfury', damage: { coef: 0.8, type: 'shadow' }, tags: ['spell', 'shadow', 'aoe', 'cc'],
    vfx: { ground: 'shockwave', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'explosion' },
    params: { stun: 3, radius: 8 },
  });

  add({
    id: 'warlock_mortal_coil', classId: 'warlock', name: 'Ölüm Halkası (Mortal Coil)', icon: I('skill-curse'),
    unlockLevel: 15,
    desc: 'Hedefe ölüm halkası atarsın: hedefe hasar verir, 4 saniye korkutur ve kendini maksimum canının %20\'si kadar iyileştirirsin.',
    cost: 6, cooldown: 45, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5, targeting: 'custom', range: 30,
    behavior: 'kit_mortal_coil', damage: { coef: 0.6, type: 'shadow' }, tags: ['spell', 'shadow', 'defensive', 'cc'],
    vfx: { cast: 'shadow_burst', impact: 'curse_ring' }, sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
    params: { fear: 4, healPct: 0.2 },
  });

  add({
    id: 'warlock_healthstone', classId: 'warlock', name: 'Sağlık Taşı (Healthstone)', icon: I('skill-iron-skin'),
    unlockLevel: 10,
    desc: 'Bir sağlık taşını kullanırsın: maksimum canının %30\'unu iyileştirir. İki yükü vardır, 60 saniyede bir yenilenir.',
    cost: 0, cooldown: 60, charges: 2, castTime: 1.0, hitTime: 1.0, anim: 'Use_Item', animSpeed: 1.4, targeting: 'self_buff',
    behavior: 'kit_healthstone', tags: ['heal', 'defensive'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'potion_use' }, params: { healPct: 0.3 },
  });
}
