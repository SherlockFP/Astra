/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §9, §10a, §11a). Class-level warlock rows: the Gölge Oku Zinciri chain, the Azap
 * and Gölge Oku bar rows and the two shared rows (İblis Çemberi, Karanlık Pakt). Spec-bound rows are in warlockSpecs.ts.
 * Projectiles use the existing `projectile` targeting (the `target_projectile` dispatch is not in behaviors.ts yet); the instant
 * single-target spells use the `kit_target_spell` behaviour (warlockKit.ts). Spell Lock and Unending Resolve are overridden in
 * skills_kit_warlock.ts. OWNER: combat (data).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;
const BASIC = 'Gölge Oku Zinciri';

export function registerWarlock(add: SkillAdd): void {
  // ---- LMB chain (§9): 4 steps, coef 0.85 / 0.85 / 1.24 / 2.02 (sum 4.96), +3 mana per hit (step 4 +6).
  // DoT magnitude = DoT total / roll coefficient (Combat: dps = noCrit x magnitude / duration).
  add({
    id: 'warlock_basic', classId: 'warlock', name: BASIC, icon: I('skill-shadow-grasp'), defaultSlot: 'lmb',
    desc: 'Dört adımlık Gölge Oku zinciri. Her vuruş mana kazandırır; dördüncü vuruş yere düşer.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 24, tags: ['spell', 'basic', 'combo', 'shadow'],
    behavior: 'combo', params: { steps: 4, reset: 0.8 },
  });
  add({
    id: 'warlock_basic_1', classId: 'warlock', name: BASIC, icon: I('skill-shadow-grasp'),
    desc: 'İlk Gölge Oku atışı.', anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.35, targeting: 'projectile', range: 24, speed: 28,
    damage: { coef: 0.85, type: 'shadow' }, statuses: [{ status: 'agony', duration: 18, chance: 0.25, stacks: 1, magnitude: 3.0 }],
    tags: ['spell', 'basic', 'projectile', 'shadow'], vfx: { projectile: 'shadow_projectile', impact: 'shadow_burst' },
    sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, gain: 3, weight: 0, step: 1 },
  });
  add({
    id: 'warlock_basic_2', classId: 'warlock', name: BASIC, icon: I('skill-shadow-grasp'),
    desc: 'İkinci Gölge Oku atışı.', anim: 'Spellcast_Shoot', animSpeed: 1.6, hitTime: 0.5, targeting: 'projectile', range: 24, speed: 28,
    damage: { coef: 0.85, type: 'shadow' }, statuses: [{ status: 'agony', duration: 18, chance: 0.25, stacks: 1, magnitude: 3.0 }],
    tags: ['spell', 'basic', 'projectile', 'shadow'], vfx: { projectile: 'shadow_projectile', impact: 'shadow_burst' },
    sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 2, gain: 3, weight: 0, step: 2 },
  });
  add({
    id: 'warlock_basic_3', classId: 'warlock', name: BASIC, icon: I('skill-shadow-grasp'),
    desc: 'Üçüncü, daha ağır Gölge Oku atışı.', anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.6, targeting: 'projectile', range: 24, speed: 28,
    damage: { coef: 1.24, type: 'shadow' }, tags: ['spell', 'basic', 'projectile', 'shadow'],
    vfx: { projectile: 'shadow_projectile', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, stagger: 3, gain: 3, weight: 0, step: 3 },
  });
  add({
    id: 'warlock_basic_4', classId: 'warlock', name: BASIC, icon: I('skill-shadow-grasp'),
    desc: 'Dördüncü vuruş yere düşer; çevresindeki düşmanlara gölge patlaması ve Yozlaşma bırakır.',
    anim: 'Spellcast_Raise', animSpeed: 2.2, hitTime: 0.55, targeting: 'ground_aoe', range: 24, radius: 2.6,
    damage: { coef: 2.02, type: 'shadow' }, statuses: [{ status: 'corruption', duration: 14, chance: 0.5, stacks: 1, magnitude: 0.79 }],
    tags: ['spell', 'basic', 'aoe', 'shadow'], vfx: { ground: 'unstable_burst', impact: 'shadow_burst' },
    sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
    // shardChance 0.2: the +20 % fragment chance of this step (no PRD hook yet, see the PK-WARLOCK report)
    params: { end: 0.9, chain: 0.05, move: 0.15, stagger: 6, gain: 6, weight: 1, step: 4, finisher: 1, shardChance: 0.2 },
  });

  // ---- Gölge Oku (§10a rmb): projectile, 10 mana, 1.6 s cast (WoW 2.0 x 0.8)
  add({
    id: 'warlock_shadow_bolt', classId: 'warlock', name: 'Gölge Oku', icon: I('skill-shadow-grasp'), unlockLevel: 1, defaultSlot: 'rmb',
    desc: 'Hedefe giden bir gölge oku fırlatırsın. 10 mana.', cost: 10, cooldown: 0, castTime: 1.6, hitTime: 1.6,
    anim: 'Spellcast_Shoot', animSpeed: 1.15, targeting: 'projectile', range: 30, speed: 28, homing: 5,
    damage: { coef: 0.95, type: 'shadow' }, tags: ['spell', 'projectile', 'shadow'],
    vfx: { projectile: 'shadow_projectile', impact: 'shadow_burst' }, sfx: { cast: 'shadow_cast', impact: 'shadow_impact' },
  });

  // ---- Azap (§10a e): DoT whose stacks ramp per tick (one stack per cast here; the per-tick ramp is a hook, see report)
  add({
    id: 'warlock_agony', classId: 'warlock', name: 'Azap', icon: I('skill-curse'), unlockLevel: 3, defaultSlot: 'e',
    desc: 'Hedefe Azap bırakırsın: 18 saniye boyunca gölge hasarı verir. Her yığın hasarı artırır (en çok 8).',
    cost: 5, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.7, targeting: 'custom', behavior: 'kit_target_spell',
    range: 35, damage: { coef: 0.25, type: 'shadow' },
    statuses: [{ status: 'agony', duration: 18, stacks: 1, magnitude: 10.2, maxStacks: 8 }],
    tags: ['spell', 'dot', 'shadow', 'instant'], vfx: { cast: 'shadow_burst', impact: 'agony_loop' }, sfx: { cast: 'curse_cast', impact: 'shadow_impact' },
  });

  // ---- Yozlaşma (§10a r): instant DoT
  add({
    id: 'warlock_corruption', classId: 'warlock', name: 'Yozlaşma', icon: I('skill-curse'), unlockLevel: 6, defaultSlot: 'r',
    desc: 'Hedefe Yozlaşma bırakırsın: 14 saniye boyunca gölge hasarı verir.',
    cost: 5, cooldown: 0, castTime: 0, hitTime: 0.3, anim: 'Spellcast_Shoot', animSpeed: 1.6, targeting: 'custom', behavior: 'kit_target_spell',
    range: 35, damage: { coef: 0.2, type: 'shadow' }, statuses: [{ status: 'corruption', duration: 14, stacks: 1, magnitude: 8 }],
    tags: ['spell', 'dot', 'shadow', 'instant'], vfx: { cast: 'shadow_burst', impact: 'corruption_loop' }, sfx: { cast: 'curse_cast' },
  });

  // ---- İblis Çemberi (§9 s2, shared): teleport 14 m, removes roots and slows, off-GCD, CD 30
  add({
    id: 'warlock_demonic_circle', classId: 'warlock', name: 'İblis Çemberi', icon: I('skill-shadow-step'), unlockLevel: 6, defaultSlot: 's2',
    desc: '14 metre ileri ışınlanırsın (hareket yönüne, yoksa nişana). Köklenmeyi ve yavaşlatmayı kaldırır; 6 saniye yerde bir çember bırakır.',
    cost: 0, cooldown: 30, castTime: 0, offGcd: true, anim: 'Dodge_Forward', animSpeed: 1.6, hitTime: 0.1, targeting: 'teleport', range: 14,
    tags: ['offgcd', 'movement', 'teleport'], vfx: { cast: 'curse_ring', impact: 'demon_portal' }, sfx: { cast: 'fel_cast', impact: 'blink' },
    params: { cleanse: 1, ringDur: 6 },
  });

  // ---- Karanlık Pakt (§9 s3, shared): sacrifice 20 % of current HP, absorb 200 % of it for 20 s, CD 60, off-GCD
  add({
    id: 'warlock_dark_pact', classId: 'warlock', name: 'Karanlık Pakt', icon: I('skill-mana-shield'), unlockLevel: 15, defaultSlot: 's3',
    desc: 'Mevcut canının %20\'sini feda edersin; feda ettiğinin 2 katı kadar 20 saniyelik emilim kalkanı alırsın. Öldürmez.',
    cost: 0, cooldown: 60, castTime: 0, offGcd: true, anim: 'Use_Item', animSpeed: 2.0, hitTime: 0.2, targeting: 'self_buff',
    behavior: 'kit_dark_pact', tags: ['defensive', 'shield', 'offgcd'], vfx: { cast: 'shield_bubble' }, sfx: { cast: 'curse_cast', impact: 'life_leech' },
    params: { sacrificePct: 0.2, absorbMult: 2, dur: 20 },
  });
}
