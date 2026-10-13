/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §9 s4 / m180). Overrides of the two coded class-utility rows (skills_class_utils.ts),
 * merged into SKILLS by data/skills.ts after CLASS_UTIL_SKILLS. The other warlock rows live in data/skillsets/. OWNER: combat (data).
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const SKILLS_KIT_WARLOCK: Record<string, SkillDef> = {
  // Büyü Kilidi (§9 s4): range 30 -> 40, cost 10 -> 0, CD 24 kept, off-GCD, interrupt (silence 3 s, bosses lose the cast only)
  warlock_spell_lock: {
    id: 'warlock_spell_lock', classId: 'warlock', name: 'Büyü Kilidi', icon: I('skill-curse'), unlockLevel: 10, defaultSlot: 's4',
    desc: '40 metre içindeki büyü yapan bir düşmanın büyüsünü keser ve 3 saniye sessizlik verir (boss hariç).',
    cost: 0, cooldown: 24, castTime: 0, hitTime: 0.2, offGcd: true, anim: 'Spellcast_Shoot', animSpeed: 1.8,
    targeting: 'custom', range: 40, arc: 360, behavior: 'interrupt', tags: ['offgcd', 'spell', 'kick'],
    params: { silence: 3 }, vfx: { impact: 'interrupt_burst' }, sfx: { cast: 'fel_cast', impact: 'interrupt' },
  },
  // Bitmeyen Kararlılık (§9 m180): CD 60 -> 180, -25 % damage taken (status resolve_pact), silence / interrupt / pushback immune
  warlock_unending_resolve: {
    id: 'warlock_unending_resolve', classId: 'warlock', name: 'Bitmeyen Kararlılık', icon: I('skill-iron-skin'), unlockLevel: 30,
    desc: '8 saniye boyunca aldığın hasar %25 azalır; sessizlik, kesinti ve geri itilmeye karşı bağışık olursun.',
    cost: 0, cooldown: 180, castTime: 0, hitTime: 0.2, offGcd: true, anim: 'Cheer', animSpeed: 1.6,
    targeting: 'self_buff', behavior: 'status_self', tags: ['major', 'defensive'],
    selfStatuses: [{ status: 'resolve_pact', duration: 8 }], vfx: { cast: 'shield_bubble' }, sfx: { cast: 'buff' },
    params: { major: 180, silenceImmune: 1, interruptImmune: 1, pushbackImmune: 1 },
  },
};
