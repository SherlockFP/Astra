/**
 * Barbar class utility rows (barbarian_pummel, barbarian_intimidating_shout). OWNER: PM-BA.
 * PM-00c split of data/skills_class_utils.ts (rows verbatim). Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const BARBARIAN_UTIL_ROWS: SkillDef[] = [
  // ---- Barbar ----
  row({
    id: 'barbarian_pummel', classId: 'barbarian', name: 'Yumruk Darbesi', icon: I('skill-double-strike'),
    desc: '3 metre içindeki büyü yapan bir düşmanı yumruklarsın: büyüsü kesilir, 4 saniye boyunca aynı büyüyü yapamaz ve 0,8 saniye sersemler (boss hariç).',
    cost: 10, cooldown: 12, targeting: 'melee_arc', range: 3, arc: 120, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick'],
    params: { silence: 0, stun: 0.8 },
  }),
  row({
    id: 'barbarian_intimidating_shout', classId: 'barbarian', name: 'Korkutucu Haykırış', icon: I('skill-battle-shout'),
    desc: 'Çevrendeki 6 metre içindeki boss olmayan düşmanlar 6 saniye korkar (seçkin düşmanlar 3 saniye); bosslar 6 saniye boyunca %20 daha az hasar verir.',
    cost: 0, cooldown: 40, targeting: 'self_aoe', radius: 6, anim: 'Cheer', animSpeed: 1.4,
    behavior: 'intimidate', tags: ['shout', 'cc'],
    params: { fear: 6, curse: 6 },
  }),
];
