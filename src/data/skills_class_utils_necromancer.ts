/**
 * Nekromant class utility rows (necro_soul_snap, necro_spirit_walk). OWNER: PM-NE.
 * PM-00c split of data/skills_class_utils.ts (rows verbatim). Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const NECROMANCER_UTIL_ROWS: SkillDef[] = [
  // ---- Nekromant ----
  row({
    id: 'necro_soul_snap', classId: 'necromancer', name: 'Ruh Koparma', icon: I('skill-curse'),
    desc: '20 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye sessizlik verir (boss hariç). Başarılı kesmede 10 Öz geri kazanırsın.',
    cost: 10, cooldown: 20, targeting: 'custom', range: 20, arc: 360, anim: 'Spellcast_Shoot', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick'],
    params: { silence: 3, gainRes: 10 },
  }),
  row({
    id: 'necro_spirit_walk', classId: 'necromancer', name: 'Ruh Yürüyüşü', icon: I('skill-teleport'),
    desc: '4 saniye boyunca hareketin %40 artar, düşmanların içinden geçersin ve fiziksel hasarın %30 azalır.',
    cost: 15, cooldown: 45, targeting: 'self_buff', anim: 'Spellcast_Raise', animSpeed: 1.6, vfx: { cast: 'buff_aura' },
    behavior: 'spirit_walk', tags: ['movement', 'defensive'],
    selfStatuses: [{ status: 'spirit_walk', duration: 4 }],
  }),
];
