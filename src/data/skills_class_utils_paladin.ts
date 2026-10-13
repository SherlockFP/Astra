/**
 * Paladin class utility rows (paladin_rebuke, paladin_divine_shield). OWNER: PM-PA.
 * PM-00c split of data/skills_class_utils.ts (rows verbatim). Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const PALADIN_UTIL_ROWS: SkillDef[] = [
  // ---- Paladin ----
  row({
    id: 'paladin_rebuke', classId: 'paladin', name: 'Azarlama', icon: I('skill-smite'),
    desc: '4 metre içindeki büyü yapan bir düşmanı azarlarsın: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç). 1 Kutsal Güç kazanırsın.',
    cost: 10, cooldown: 15, targeting: 'melee_arc', range: 4, arc: 120, anim: '1H_Melee_Attack_Stab', animSpeed: 1.5,
    behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick', 'holy'],
    pip: { id: 'holypower', gain: 1 },
  }),
  row({
    id: 'paladin_divine_shield', classId: 'paladin', name: 'İlahi Kalkan', icon: I('skill-divine-shield'),
    desc: '5 saniye dokunulmaz olursun ve olumsuz etkilerin hepsi temizlenir. Sonraki 90 saniye boyunca Şifa Eli ve İlahi Kalkan kullanamazsın.',
    cost: 0, cooldown: 150, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.2, vfx: { cast: 'buff_aura' },
    behavior: 'status_self', tags: ['defensive', 'holy'],
    // forbearance first: a hostile-kind status cannot land while invulnerable
    selfStatuses: [{ status: 'forbearance', duration: 90 }, { status: 'invulnerable', duration: 5 }],
    params: { cleanse: 1 },
  }),
];
