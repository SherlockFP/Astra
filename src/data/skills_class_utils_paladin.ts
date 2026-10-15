/**
 * Paladin class utility rows (paladin_rebuke, paladin_divine_shield). OWNER: PM-PA.
 * PM-00c split of data/skills_class_utils.ts (rows verbatim); PM-PA retune (docs/kits/plate-melee.md f1c): Azarlama costs nothing, reaches
 * 3.5 m and no longer gives Holy Power (baseline s4 of Kutsal and Ceza, unlocked at L10 by SpecDef.unlock; Koruma gets it from the
 * class s05A talent); İlahi Kalkan lasts 8 s, cooldown 180 (Ceza m180; Kutsal s3 patches it to 300 s; Koruma: bench).
 * Merged into CLASS_UTIL_SKILLS by data/skills_class_utils.ts.
 */
import type { SkillDef } from '../types/skills';
import { I, row } from './skills_class_utils_row';

export const PALADIN_UTIL_ROWS: SkillDef[] = [
  // ---- Paladin ----
  {
    ...row({
      id: 'paladin_rebuke', classId: 'paladin', name: 'Azarlama (Rebuke)', icon: I('skill-smite'),
      desc: '3.5 metre içindeki büyü yapan bir düşmanı azarlarsın: büyüsü kesilir ve 3 saniye sessizlik alır (boss hariç). 15 saniye bekleme. Kutsal ve Ceza için 10. seviyede açılır.',
      cost: 0, cooldown: 15, targeting: 'melee_arc', range: 3.5, arc: 120, anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.8,
      behavior: 'interrupt', tags: ['offgcd', 'melee', 'kick', 'holy'],
      vfx: { impact: 'interrupt_burst' }, params: { silence: 3 },
    }),
    unlockLevel: 1,
    offGcd: true,
  },
  {
    ...row({
      id: 'paladin_divine_shield', classId: 'paladin', name: 'İlahi Kalkan', icon: I('skill-divine-shield'),
      desc: '8 saniye dokunulmaz olursun ve olumsuz etkilerin hepsi temizlenir. Sonraki 90 saniye boyunca Şifa Eli ve İlahi Kalkan kullanamazsın. 180 saniye bekleme (Kutsal: 300).',
      cost: 0, cooldown: 180, targeting: 'self_buff', anim: 'Cheer', animSpeed: 1.4, vfx: { cast: 'shield_bubble' },
      behavior: 'status_self', tags: ['offgcd', 'defensive', 'holy'],
      // forbearance first: a hostile-kind status cannot land while invulnerable
      selfStatuses: [{ status: 'forbearance', duration: 90 }, { status: 'invulnerable', duration: 8 }],
      params: { cleanse: 1 },
    }),
    unlockLevel: 15,
    defaultSlot: 'm180',
    offGcd: true,
  },
];
