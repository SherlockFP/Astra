/**
 * Nekromant class utility rows (necro_raise_dead, necro_chains_of_ice). OWNER: PM-NE.
 * PM-00c split of data/skills_class_utils.ts. Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 * WoW pass (docs/WOW_ABILITY_MAP.md 7.1 / 7.2): the two non-WoW extras are replaced. Ruh Koparma (interrupt + Öz refund, a copy of
 * Mind Freeze) becomes Raise Dead (Ölüleri Diriltme: a timed ghoul). Ruh Yürüyüşü (movement + damage reduction, a copy of Death's
 * Advance) becomes Chains of Ice (Buz Zincirleri: a single-target snare, Frost). The ids necro_soul_snap / necro_spirit_walk are retired.
 * The rows are plain literals (not row()) because they carry minion / sfx fields that the shared row() helper does not type.
 * Level: unlockLevel 99 (granted by the node, as every util row); the spec unlock tables in specs_necromancer.ts set the level-gated copies.
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const NECROMANCER_UTIL_ROWS: SkillDef[] = [
  // ---- Nekromant ----
  {
    id: 'necro_raise_dead', classId: 'necromancer', name: 'Ölüleri Diriltme (Raise Dead)', icon: I('skill-summon-skeleton'),
    unlockLevel: 99, castTime: 0.6, hitTime: 0.6, animSpeed: 1.2,
    desc: 'Yanında 60 saniye kalacak bir Kemik Ghul çağırırsın. Ordu Efendisi\'nin kalıcı ghulu varken bile ek bir ghul doğar. 1 Rün harcar.',
    cost: 0, cooldown: 0, targeting: 'self_buff', anim: 'Spellcast_Raise',
    behavior: 'summon_ring', tags: ['spell', 'summon', 'minion', 'shadow'],
    pip: { id: 'rune', cost: 1 }, minion: { id: 'necro_ghoul', count: 1, life: 60, ignoreCap: true, group: 'lesser' },
    vfx: { cast: 'grave_rise' }, sfx: { cast: 'raise_dead' },
    params: { ringRadius: 1.5, end: 0.6, chain: 0.05, move: 0.1, weight: 0 },
  },
  {
    id: 'necro_chains_of_ice', classId: 'necromancer', name: 'Buz Zincirleri (Chains of Ice)', icon: I('skill-ice-bolt'),
    unlockLevel: 99, castTime: 0, hitTime: 0.373, animSpeed: 1.5,
    desc: 'Bir düşmanı buz zincirleriyle 8 saniye %50 yavaşlatırsın. 1 Rün harcar.',
    cost: 0, cooldown: 0, targeting: 'target_instant', range: 25, anim: 'Spellcast_Shoot',
    pip: { id: 'rune', cost: 1 },
    statuses: [{ status: 'slow', duration: 8, magnitude: 0.5 }],
    tags: ['spell', 'frost', 'cc', 'slow'],
    vfx: { cast: 'frost_burst', impact: 'hit_magic' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { end: 0.7, chain: 0.05, move: 0.1, weight: 0 },
  },
];
