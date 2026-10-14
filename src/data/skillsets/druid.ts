/**
 * CLASS SCAFFOLD: Druid core skillset. Only the placeholder basic attack exists so the class does not crash; the form-based core
 * skills arrive with the druid kit package. Spec-bound rows are in druidSpecs.ts. OWNER: druid kit. Not selectable yet.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerDruid(add: SkillAdd): void {
  // ---- LMB placeholder (taslak): one melee claw swing. The real form-aware basic replaces this with the kit.
  add({
    id: 'druid_basic', classId: 'druid', name: 'Pençe Vuruşu', icon: I('skill-claw-strike'), defaultSlot: 'lmb',
    desc: 'Taslak: önündeki düşmana pençe vurursun. Druid kiti geldiğinde biçimlere göre değişen gerçek temel saldırıyla değişecek.',
    anim: 'Unarmed_Melee_Attack_Punch_A', targeting: 'melee_arc', range: 2.5, arc: 90, tags: ['melee', 'basic', 'physical'],
    damage: { coef: 1.0, type: 'physical' }, hitTime: 0.35,
    params: { end: 0.6, chain: 0.05, move: 0.1, stagger: 3, proc: 0.5, weight: 0 },
  });
}
