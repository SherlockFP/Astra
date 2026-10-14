/**
 * CLASS SCAFFOLD: Şaman (shaman) core skillset. Only the placeholder basic attack exists so the class does not crash; the core
 * skills arrive with the shaman kit package. Spec-bound rows are in shamanSpecs.ts. OWNER: shaman kit. Not selectable yet.
 */
import type { SkillAdd } from './types';

const I = (n: string) => `/assets/icons/${n}.svg`;

export function registerShaman(add: SkillAdd): void {
  // ---- LMB placeholder (taslak): one lightning bolt. The real basic chain replaces this with the kit.
  add({
    id: 'shaman_basic', classId: 'shaman', name: 'Şimşek Atışı', icon: I('skill-lightning-bolt'), defaultSlot: 'lmb',
    desc: 'Taslak: tek bir şimşek fırlatırsın. Şaman kiti geldiğinde gerçek temel zincirle değişecek.',
    anim: 'Spellcast_Shoot', targeting: 'projectile', range: 25, tags: ['spell', 'basic', 'projectile', 'lightning'],
    speed: 40, radius: 0.3, count: 1, pierce: 0, damage: { coef: 1.0, type: 'lightning' }, hitTime: 0.4,
    params: { end: 0.6, chain: 0.03, move: 0.1, stagger: 2, proc: 0.5, weight: 0 },
  });
}
