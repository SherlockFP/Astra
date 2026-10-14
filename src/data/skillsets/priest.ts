/**
 * Rahip (priest) class skills: the LMB basic `priest_basic` (Kutsal Ok, auto attack) and the class skills of the kit (`ClassDef.skills`).
 * WoW Midnight reference (docs/WOW_ABILITY_MAP.md, Priest): Power Word: Shield, Flash Heal, Smite, Renew, Dispel Magic, Psychic Scream,
 * Desperate Prayer and Fade are class rows. Atonement is a Discipline row and is applied by Power Word: Shield, Flash Heal and
 * Radiance (warcraft.wiki.gg/wiki/Atonement). Spec-bound rows are in priestSpecs.ts. Unlock levels are indicative (WoW ~).
 * OWNER: priest kit.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPriest(add: SkillAdd): void {
  // ---- LMB: Kutsal Ok (Auto Attack), one holy bolt (damage). Discipline and Shadow keep it; Holy swaps it for priest_holy_basic (Heal).
  add({
    id: 'priest_basic', classId: 'priest', name: 'Kutsal Ok (Auto Attack)', icon: I('skill-holy-light'), defaultSlot: 'lmb',
    desc: 'Asanın ucundan kutsal bir ok fırlatıp düşmana %100 hasar verirsin. Gölge ve Disiplin yolunda otomatik saldırın budur (WoW: Auto Attack).',
    anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.4, cost: 0, cooldown: 0, castTime: 0,
    targeting: 'target_instant', range: 25, behavior: 'priest_strike', damage: { coef: 1.0, type: 'holy' },
    tags: ['spell', 'basic', 'holy', 'projectile'], vfx: { projectile: 'chi_projectile', impact: 'hit_spark' }, sfx: { cast: 'chi_cast' },
    params: { end: 0.6, chain: 0.03, move: 0.1, stagger: 2, proc: 0.5, weight: 0 },
  });

  // ---- Auto-attack swing (ClassDef.autoSwing): the priest's WoW Auto Attack. A weak staff swing while a foe is in melee reach; the
  // LMB stays the holy bolt cast. Not a bar row (the `_basic` id keeps it out of the skill book lists).
  add({
    id: 'priest_basic_swing', classId: 'priest', name: 'Asa Vuruşu (Auto Attack)', icon: I('skill-holy-light'), unlockLevel: 1,
    desc: 'Asanla yakın vuruş yaparsın. Rahip oto saldırısı: zayıf, ama düşman menzilindeyken hep vurur.',
    anim: '2H_Melee_Attack_Chop', animSpeed: 1.2, hitTime: 0.25, cost: 0, cooldown: 0, castTime: 0,
    targeting: 'melee_arc', range: 2.4, arc: 120, damage: { coef: 0.45, type: 'physical' },
    tags: ['melee', 'basic', 'auto'], vfx: { impact: 'hit_spark' }, sfx: {},
    params: { end: 0.7, chain: 0.5, move: 0.1, stagger: 1, weight: 0 },
  });

  // ---- Core (ClassDef.skills). unlockLevel 1 rows make the level-1 bar (basic + Güç Kalkanı, Hızlı Şifa, Kutsal Ceza).
  add({
    id: 'priest_power_word_shield', classId: 'priest', name: 'Güç Kalkanı (Power Word: Shield)', icon: I('skill-healing-shield'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Bir müttefikine, Şifa gücünün ölçüsünde bir kalkan verirsin; 15 saniye sürer. Disiplinde kalkan aynı zamanda Keffara uygular.',
    cost: 12, cooldown: 4, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'priest_ally', allyTarget: 'friendly', heal: { coef: 2.2 },
    tags: ['spell', 'heal', 'shield', 'buff'], vfx: { cast: 'buff_aura', impact: 'shield_bubble' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { shield: 1, shieldSec: 15, atonement: 1, end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_flash_heal', classId: 'priest', name: 'Hızlı Şifa (Flash Heal)', icon: I('skill-heal'), unlockLevel: 1, defaultSlot: 'q',
    desc: '1.5 saniyelik bir büyüyle müttefikini hızla iyileştirirsin. Disiplinde Keffara da uygular.',
    cost: 16, cooldown: 0, castTime: 1.5, hitTime: 1.5, anim: 'Spellcasting', animSpeed: 1.0,
    targeting: 'custom', behavior: 'priest_ally', allyTarget: 'friendly', heal: { coef: 2.6 },
    tags: ['spell', 'heal'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { atonement: 1, end: 0.7, chain: 0.1, move: 0.1, weight: 0 },
  });
  add({
    id: 'priest_smite', classId: 'priest', name: 'Kutsal Ceza (Smite)', icon: I('skill-smite'), unlockLevel: 1, defaultSlot: 'e',
    desc: 'Hedefe kutsal bir ceza indirip %140 kutsal hasar verirsin. Disiplinde verdiğin hasar müttefiklerini iyileştirir.',
    cost: 8, cooldown: 0, castTime: 1.0, hitTime: 1.0, anim: 'Spellcast_Shoot', animSpeed: 1.0,
    targeting: 'target_instant', range: 25, behavior: 'priest_strike', damage: { coef: 1.4, type: 'holy' },
    tags: ['spell', 'holy'], vfx: { cast: 'holy_burst', impact: 'hit_spark' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.6, chain: 0.08, move: 0.12, stagger: 4, proc: 0.8, weight: 1 },
  });
  add({
    id: 'priest_renew', classId: 'priest', name: 'Yenileme (Renew)', icon: I('skill-renew'), unlockLevel: 1, defaultSlot: 's2',
    desc: 'Müttefikine 15 saniye boyunca her 3 saniyede bir iyileştiren bir yenileme bırakırsın.',
    cost: 10, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'priest_renew', allyTarget: 'friendly', statuses: [{ status: 'renew', duration: 15 }],
    tags: ['spell', 'heal', 'hot'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.6, chain: 0.1, move: 0.15, weight: 0, hotCoef: 0.25, tick: 3 },
  });
  add({
    id: 'priest_dispel', classId: 'priest', name: 'Büyü Arındırma (Dispel Magic)', icon: I('skill-holy-water'), unlockLevel: 12, defaultSlot: 's3',
    desc: 'Bir müttefikinin üzerindeki bir büyü etkisini kaldırır ve ona hafif bir iyileştirme yapar.',
    cost: 10, cooldown: 8, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    targeting: 'custom', behavior: 'priest_ally', allyTarget: 'friendly', heal: { coef: 0.5 },
    tags: ['spell', 'heal', 'dispel'], vfx: { cast: 'buff_aura', impact: 'heal_burst' }, sfx: { cast: 'chi_cast' },
    params: { dispel: 1, end: 0.6, chain: 0.1, move: 0.15, weight: 0 },
  });
  add({
    id: 'priest_psychic_scream', classId: 'priest', name: 'Psişik Çığlık (Psychic Scream)', icon: I('debuff-fear'), unlockLevel: 8, defaultSlot: 's1',
    desc: 'Çevrendeki düşmanlara hasar verip onları 3 saniye korkutarak kaçmaya zorlarsın.',
    cost: 15, cooldown: 30, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.2,
    targeting: 'self_aoe', radius: 8, damage: { coef: 0.6, type: 'shadow' }, statuses: [{ status: 'fear', duration: 3 }],
    tags: ['spell', 'aoe', 'cc', 'shadow'], vfx: { cast: 'aura_ring' }, sfx: { cast: 'boss_roar' },
    params: { end: 0.4, chain: 0.1, move: 0.1, stagger: 6, proc: 1, weight: 1 },
  });
  add({
    id: 'priest_desperate_prayer', classId: 'priest', name: 'Çaresiz Dua (Desperate Prayer)', icon: I('skill-prayer'), unlockLevel: 1,
    desc: 'Kendini anında iyileştirirsin: Şifa gücünün 3 katı kadar can kazanırsın. Yaklaşık 90 saniyede bir kullanılır.',
    cost: 0, cooldown: 90, castTime: 0, hitTime: 0.2, anim: 'Spellcast_Raise', animSpeed: 1.2,
    targeting: 'custom', behavior: 'priest_self', heal: { coef: 3.0 },
    tags: ['spell', 'heal', 'defensive'], vfx: { cast: 'heal_loop', impact: 'heal_burst' }, sfx: { cast: 'chi_cast', impact: 'buff' },
    params: { end: 0.4, chain: 0.1, move: 0.1, weight: 0 },
  });
  add({
    id: 'priest_fade', classId: 'priest', name: 'Solma (Fade)', icon: I('buff-haste'), unlockLevel: 1,
    desc: '10 saniye boyunca hareket hızın %20 artar. Tehdit düşürme bu sürümde yok; hareket hızı bonusu olarak uygulanır.',
    cost: 0, cooldown: 30, castTime: 0, hitTime: 0.1, anim: 'Cheer', animSpeed: 1.2,
    targeting: 'self_buff', selfStatuses: [{ status: 'fade', duration: 10 }],
    tags: ['buff', 'defensive'], vfx: { cast: 'buff_aura' }, sfx: { cast: 'buff' },
    params: { end: 0.4, chain: 0.1, move: 0.1, weight: 0 },
  });
}
