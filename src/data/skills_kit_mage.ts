/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2a, §3a, §4a). Mage kit rows merged into SKILLS after MAGE_SPEC_SKILLS (later
 * wins), so these override the older rows of the same id. Numbers copy the kit tables; the mechanics live in
 * combat/skills/mageKit.ts (behaviours `fire_cast`, `frost_cast`, `fire_blast`, `flamestrike`, `ice_lance`, `flurry`,
 * `ray_of_frost`, `comet_storm`, `glacial_spike`, `ward_barrier`, `arcane_pulse`) and combat/specs/mage.ts (hooks).
 * Majors and the bar slots come from the SpecDefs in specs_kit_mage.ts. OWNER: combat (data).
 *
 * Deviations kept visible here: Ateş Patlaması does not spread Ignite yet (no spread hook), Kar Fırtınası keeps its legacy
 * channel (the kit's instant free form needs the blizzard behaviour), Buz Sarkıtı does not replace Ayaz Oku (no `replaces`).
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

type Row = Partial<SkillDef> & Pick<SkillDef, 'id' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;

/** Same defaults as the mage spec rows: class mage, unlock 99 = granted only by a tree node or a SpecDef. */
function row(d: Row): SkillDef {
  return { classId: 'mage', unlockLevel: 99, cost: 0, cooldown: 0, castTime: 0, hitTime: 0.3, tags: [], ...d } as SkillDef;
}

export const SKILLS_KIT_MAGE: Record<string, SkillDef> = {
  // ------------------------------------------------------------------ Ateş (mage_fire, §3a)
  mage_fireball: row({
    id: 'mage_fireball', name: 'Ateş Topu', icon: I('skill-fireball'), spec: 'mage_fire', unlockLevel: 1,
    desc: '%92 ateş hasarı verir ve yakma (Tutuşma) uygular. Kritik vuruşlar Isınıyor\'u başlatır.',
    cost: 8, castTime: 1.4, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.373,
    targeting: 'projectile', behavior: 'fire_cast', range: 35, speed: 24, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 0.92, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.25 }],
    tags: ['spell', 'projectile', 'fire'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { element: 1, end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 1, weight: 0, upper: 0 },
  }),
  mage_pyroblast: row({
    id: 'mage_pyroblast', name: 'Piroblast', icon: I('skill-fire-wave'), spec: 'mage_fire', unlockLevel: 3,
    desc: '%280 ateş hasarı verir ve yakar. Sıcak Seri varken anında ve bedavadır; kritik vuruşlar Piroklazm\'ı tetikleyebilir.',
    cost: 10, castTime: 3.2, anim: 'Spellcast_Raise', animSpeed: 1, hitTime: 0.5,
    targeting: 'projectile', behavior: 'fire_cast', range: 35, speed: 18, radius: 0.5, count: 1, pierce: 0,
    damage: { coef: 2.8, type: 'fire' }, statuses: [{ status: 'burn', duration: 4, magnitude: 0.7 }],
    tags: ['spell', 'projectile', 'fire', 'big'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { element: 1, hitstop: 40, shake: 0.14, end: 0.9, chain: 0.1, move: 0.2, stagger: 8, proc: 1, weight: 4, upper: 0 },
  }),
  mage_fire_blast: row({
    id: 'mage_fire_blast', name: 'Ateş Patlaması', icon: I('skill-fire-nova'), spec: 'mage_fire', unlockLevel: 6,
    desc: 'Off-GCD, 3 yük (12 sn). %90 ateş hasarı verir. Isınıyor varken kesin kritiktir ve Isınıyor\'u Sıcak Seri\'ye çevirir.',
    cost: 0, cooldown: 12, charges: 3, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2, hitTime: 0.2,
    targeting: 'projectile', behavior: 'fire_blast', range: 35, radius: 0.4, count: 1,
    damage: { coef: 0.9, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.25 }],
    tags: ['offgcd', 'spell', 'fire'],
    vfx: { impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { element: 1, spreadR: 8, spreadMax: 2, spreadMult: 0.6, end: 0.4, chain: 0.05, move: 0.1, stagger: 3, weight: 1, upper: 0 },
  }),
  mage_scorch: row({
    id: 'mage_scorch', name: 'Kavurma', icon: I('skill-fire-breath'), spec: 'mage_fire', unlockLevel: 10,
    desc: '%80 ateş hasarı verir. Hareket yavaşlatması yoktur: hareket halindeyken de atılabilir.',
    cost: 4, castTime: 1.2, anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.4,
    targeting: 'projectile', behavior: 'fire_cast', range: 30, speed: 26, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 0.8, type: 'fire' },
    tags: ['spell', 'projectile', 'fire'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { element: 1, slow: 0, end: 0.6, chain: 0.1, move: 0.2, stagger: 2, proc: 0.5, weight: 0, upper: 1 },
  }),
  mage_flamestrike: row({
    id: 'mage_flamestrike', name: 'Alev Sütunu', icon: I('skill-firewall'), spec: 'mage_fire', unlockLevel: 12,
    desc: 'Hedef noktada r 6 alana %280 ateş hasarı (8 hedefe kadar, hedef sayısına göre azalarak) ve yanma. Sıcak Seri varken anında ve bedavadır.',
    cost: 12, castTime: 2.8, anim: 'Spellcast_Raise', animSpeed: 1.4, hitTime: 0.5,
    targeting: 'ground_aoe', behavior: 'flamestrike', range: 35, radius: 6, count: 1,
    damage: { coef: 2.8, type: 'fire' }, statuses: [{ status: 'burn', duration: 4, magnitude: 0.4 }],
    tags: ['spell', 'aoe', 'fire', 'crowd'],
    vfx: { impact: 'fire_ground' }, sfx: { cast: 'fire_cast', impact: 'explosion' },
    params: { element: 1, maxTargets: 8, end: 1, chain: 0.1, move: 0.2, stagger: 6, proc: 1, weight: 2, upper: 0 },
  }),
  mage_combustion: row({
    id: 'mage_combustion', name: 'Yanış', icon: I('skill-fire-arrow'), spec: 'mage_fire', unlockLevel: 20,
    desc: '12 sn boyunca ateş büyüleri her zaman kritik vurur ve Ateş Patlaması yük iade edebilir.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.3,
    targeting: 'self_buff', selfStatuses: [{ status: 'combustion', duration: 12 }],
    tags: ['major', 'buff', 'fire'],
    vfx: { cast: 'combustion_aura' }, sfx: { cast: 'fire_cast' },
    params: { major: 90, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  }),

  // ------------------------------------------------------------------ Buz (mage_frost, §4a)
  mage_frostbolt: row({
    id: 'mage_frostbolt', name: 'Ayaz Oku', icon: I('skill-ice-bolt'), spec: 'mage_frost', unlockLevel: 1,
    desc: '%120 buz hasarı verir, hedefe Donma uygular ve her isabette bir Buz Sarkıtı biriktirir (5 olunca Buz Sarkıtı hazır olur).',
    cost: 8, castTime: 1.4, anim: 'Spellcast_Shoot', animSpeed: 1.15, hitTime: 0.37,
    targeting: 'projectile', behavior: 'frost_cast', range: 35, speed: 28, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 1.2, type: 'frost' },
    statuses: [{ status: 'chill', duration: 3, stacks: 1 }, { status: 'freezing', duration: 15, stacks: 1 }],
    tags: ['spell', 'projectile', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { element: 2, end: 0.7, chain: 0.1, move: 0.2, stagger: 4, proc: 1, weight: 1, upper: 0 },
  }),
  mage_ice_lance: row({
    id: 'mage_ice_lance', name: 'Buz Mızrağı', icon: I('skill-ice-lance'), spec: 'mage_frost', unlockLevel: 3,
    desc: '%85 buz hasarı. Donmuş hedefe, Buz Parmağı varken veya Donma 6 iken x3 hasar (kırılma): kırılma hasarın %70\'ini yakındaki 3 düşmana da verir.',
    cost: 6, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.2,
    targeting: 'projectile', behavior: 'ice_lance', range: 35, speed: 40, radius: 0.35, count: 1, pierce: 0,
    damage: { coef: 0.85, type: 'frost' },
    tags: ['spell', 'projectile', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { element: 2, shatterMult: 3, shatterSplash: 0.7, splashR: 6, splashMax: 3, freezeNeed: 6, end: 0.5, chain: 0.1, move: 0.2, stagger: 3, proc: 0.5, weight: 1, upper: 0 },
  }),
  mage_flurry: row({
    id: 'mage_flurry', name: 'Dondurucu Sağanak', icon: I('skill-frost-arrow'), spec: 'mage_frost', unlockLevel: 6,
    desc: 'Hedefe 3 hızlı vuruş (her biri %57 buz hasarı) ve her vuruşta +1 Donma. %25 şansla Dondurucu Yağmur kazandırır.',
    cost: 10, cooldown: 30, charges: 2, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2, hitTime: 0.2,
    targeting: 'projectile', behavior: 'flurry', range: 35, count: 1,
    damage: { coef: 0.57, type: 'frost' }, statuses: [{ status: 'freezing', duration: 15, stacks: 1 }],
    tags: ['spell', 'frost'],
    vfx: { impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { element: 2, hits: 3, freezingRainChance: 0.25, end: 0.6, chain: 0.1, move: 0.2, stagger: 1, weight: 0, upper: 0 },
  }),
  mage_frost_nova: row({
    id: 'mage_frost_nova', name: 'Buz Halkası', icon: I('skill-frost-nova'), spec: 'mage_frost', unlockLevel: 10,
    desc: 'Çevrendeki r 5 alana %60 buz hasarı, 3 sn kök ve +2 Donma verir.',
    cost: 12, cooldown: 30, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2.6, hitTime: 0.3,
    targeting: 'self_aoe', radius: 5,
    damage: { coef: 0.6, type: 'frost' },
    statuses: [{ status: 'freeze', duration: 3 }, { status: 'freezing', duration: 15, stacks: 2 }],
    tags: ['spell', 'aoe', 'frost'],
    vfx: { impact: 'frost_nova' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { element: 2, end: 0.8, chain: 0.1, move: 0.2, stagger: 6, proc: 1, weight: 2, upper: 0 },
  }),
  mage_ice_barrier: row({
    id: 'mage_ice_barrier', name: 'Buz Bariyeri', icon: I('skill-ice-block'), spec: 'mage_frost', unlockLevel: 15,
    desc: 'Maks. canının %25\'i + 2 x W kadar 60 sn kalkan verir.',
    cost: 0, cooldown: 30, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.3,
    targeting: 'self_buff', behavior: 'ward_barrier',
    tags: ['defensive', 'shield', 'frost', 'buff'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'frost_cast' },
    params: { absorbPct: 0.25, absorbW: 2, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  }),
  mage_ray_of_frost: row({
    id: 'mage_ray_of_frost', name: 'Ayaz Işını', icon: I('skill-ice-bolt'), spec: 'mage_frost', unlockLevel: 20,
    desc: '3,2 sn kanalize: hedefe 8 kez %52,5 buz hasarı ve her seferinde +1 Donma. Yarıdan fazla tamamlanırsa Kuyruklu Yıldız Hazır olur.',
    cost: 15, cooldown: 45, castTime: 0, channel: 3.2, anim: 'Spellcasting', animSpeed: 1, hitTime: 0.2,
    targeting: 'beam', behavior: 'ray_of_frost', range: 30,
    damage: { coef: 0.525, type: 'frost' }, statuses: [{ status: 'freezing', duration: 15, stacks: 1 }],
    tags: ['major', 'channel', 'frost'],
    vfx: { impact: 'frost_burst' }, sfx: { cast: 'frost_cast' },
    params: { major: 45, tick: 0.4, slow: 0.3, element: 2, weight: 0, upper: 0 },
  }),
  mage_comet_storm: row({
    id: 'mage_comet_storm', name: 'Kuyruklu Yıldız Yağmuru', icon: I('skill-meteor'), spec: 'mage_frost', unlockLevel: 20,
    desc: 'Hedef noktaya 7 kuyruklu yıldız düşürür (0,1 sn aralıkla, her biri %43 buz hasarı, +1 Donma). Yalnızca Kuyruklu Yıldız Hazır iken.',
    cost: 0, cooldown: 0, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 2, hitTime: 0.2,
    targeting: 'ground_aoe', behavior: 'comet_storm', range: 35, radius: 3,
    damage: { coef: 0.43, type: 'frost' }, statuses: [{ status: 'freezing', duration: 15, stacks: 1 }],
    tags: ['spell', 'aoe', 'frost'],
    vfx: { impact: 'meteor_fall' }, sfx: { cast: 'frost_cast', impact: 'explosion' },
    params: { comets: 7, gap: 0.1, cometR: 1.5, element: 2, end: 1, chain: 0.1, move: 0.2, weight: 2, stagger: 3, upper: 0 },
  }),
  mage_glacial_spike: row({
    id: 'mage_glacial_spike', name: 'Buz Sarkıtı', icon: I('skill-ice-lance'), spec: 'mage_frost', unlockLevel: 15,
    desc: 'Hedefe %330 buz hasarı; Donması 6 veya üstüyse x1,5. Hedefin yanındaki 3 düşmana %50 sıçrar. Yalnızca Buz Sarkıtı Hazır iken; tüm Sarkıtları harcar.',
    cost: 10, castTime: 1.4, anim: 'Spellcast_Raise', animSpeed: 1.4, hitTime: 0.5,
    targeting: 'projectile', behavior: 'glacial_spike', range: 35, speed: 20, radius: 0.5, count: 1, pierce: 0,
    damage: { coef: 3.3, type: 'frost' }, statuses: [{ status: 'freezing', duration: 15, stacks: 3 }],
    tags: ['spell', 'projectile', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { element: 2, splashCoef: 0.5, splashR: 3, splashMax: 3, freezeMult: 1.5, freezeNeed: 6, end: 0.9, chain: 0.1, move: 0.2, stagger: 10, proc: 1, weight: 3, upper: 0 },
  }),
  mage_frozen_orb: row({
    id: 'mage_frozen_orb', name: 'Donmuş Küre', icon: I('skill-blizzard'), spec: 'mage_frost', unlockLevel: 20,
    desc: 'Yavaş ilerleyen buz küresi: 8 sn boyunca 12 kez %54 buz hasarı (r 3,2) ve her darbede Buz Parmağı şansı.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5,
    targeting: 'projectile', behavior: 'orb', range: 64, speed: 8, radius: 0.9, count: 1, pierce: 99,
    damage: { coef: 0.54, type: 'frost', perTick: true },
    statuses: [{ status: 'chill', duration: 3, stacks: 1 }],
    tags: ['major', 'burst', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { major: 90, pulse: 0.67, pulses: 12, pulseCoef: 0.54, pulseRadius: 3.2, fofPerPulse: 0.2, endCoef: 0, endRadius: 0, endStagger: 0,
      end: 0.9, chain: 0.1, move: 0.2, weight: 2, element: 2 },
  }),

  // ------------------------------------------------------------------ Gizem extras (mage_arcane, §2a)
  mage_arcane_pulse: row({
    id: 'mage_arcane_pulse', name: 'Arkan Nabzı', icon: I('skill-arcane-explosion'), spec: 'mage_arcane', unlockLevel: 12,
    desc: 'r 8 içindeki düşmanlara gizem hasarı verir (çok hedefte azalarak); vurduğun her düşman için +1 Gizem Yükü (en çok +4).',
    cost: 14, cooldown: 15, castTime: 1.6, anim: 'Spellcast_Raise', animSpeed: 1.3, hitTime: 0.5,
    targeting: 'self_aoe', behavior: 'arcane_pulse', radius: 8,
    damage: { coef: 3.6, type: 'arcane' },
    tags: ['spell', 'aoe', 'arcane', 'crowd'],
    vfx: { impact: 'shockwave' }, sfx: { cast: 'spell_cast', impact: 'arcane_impact' },
    params: { element: 3, pipPerEnemy: 1, pipMax: 4, end: 0.9, chain: 0.1, move: 0.2, stagger: 6, weight: 2, upper: 0 },
  }),
  mage_prismatic_barrier: row({
    id: 'mage_prismatic_barrier', name: 'Prizmatik Bariyer', icon: I('skill-mana-shield'), spec: 'mage_arcane', unlockLevel: 15,
    desc: 'Maks. canının %25\'i + 2 x W kadar 30 sn kalkan verir.',
    cost: 0, cooldown: 30, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.3,
    targeting: 'self_buff', behavior: 'ward_barrier',
    tags: ['defensive', 'shield', 'arcane', 'buff'],
    vfx: { cast: 'shield_bubble' }, sfx: { cast: 'spell_cast' },
    params: { absorbPct: 0.25, absorbW: 2, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  }),
};
