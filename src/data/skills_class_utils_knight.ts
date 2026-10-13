/**
 * Şövalye class utility rows (knight_intercept, knight_guardian_vow). OWNER: PM-KN.
 * PM-00c split of data/skills_class_utils.ts (rows verbatim). Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const KNIGHT_UTIL_ROWS: SkillDef[] = [
  // ---- Şövalye ----
  row({
    id: 'knight_intercept', classId: 'knight', name: 'Müdahale', icon: I('skill-charge'),
    desc: 'Seçtiğin müttefike 20 metreye kadar atılırsın (seçili müttefik yoksa 12 metre ileri). Müttefik 4 saniye boyunca %25 daha az hasar alır; sen de 20 Kararlılık kazanırsın.',
    cost: 0, cooldown: 20, targeting: 'custom', anim: 'Dodge_Forward', animSpeed: 1.4, range: 20,
    behavior: 'intercept', tags: ['movement', 'defensive', 'ally'],
    statuses: [{ status: 'intercept_ward', duration: 4 }],
    params: { speed: 30, forward: 12, gainRes: 20 },
  }),
  row({
    id: 'knight_guardian_vow', classId: 'knight', name: 'Muhafız Yemini', icon: I('skill-shield-wall'),
    desc: '25 metre içindeki seçtiğin müttefike 8 saniye boyunca yemin edersin: onun aldığı hasarın %30\'unu sen üstlenirsin (saniyede en fazla maks. canının %15\'i).',
    cost: 0, cooldown: 30, targeting: 'custom', anim: 'Cheer', animSpeed: 1.6, range: 25,
    behavior: 'guardian_vow', tags: ['defensive', 'buff', 'ally'],
    statuses: [{ status: 'guardian_vow', duration: 8 }],
  }),
];
