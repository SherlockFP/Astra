/**
 * CLASS SCAFFOLD: Rahip (priest) core skillset. Only the placeholder basic attack exists so the class does not crash; the eight
 * core skills arrive with the priest kit package (NC-style rows, like monk.ts). Spec-bound rows are in priestSpecs.ts.
 * OWNER: priest kit. Not selectable yet (data/classes.ts, PLAYABLE_CLASSES).
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerPriest(add: SkillAdd): void {
  // ---- LMB placeholder (taslak): one holy bolt. The real basic chain replaces this with the kit.
  add({
    id: 'priest_basic', classId: 'priest', name: 'Kutsal Ok', icon: I('skill-holy-light'), defaultSlot: 'lmb',
    desc: 'Taslak: tek bir kutsal ok fırlatırsın. Rahip kiti geldiğinde gerçek temel zincirle değişecek.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'projectile', 'holy'],
    speed: 40, radius: 0.3, count: 1, pierce: 0, damage: { coef: 1.0, type: 'holy' }, hitTime: 0.4,
    params: { end: 0.6, chain: 0.03, move: 0.1, stagger: 2, proc: 0.5, weight: 0 },
  });
}
