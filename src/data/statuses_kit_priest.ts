/**
 * Rahip StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. OWNER: priest kit.
 * Shared rows reused as they are: `renew` (Yenileme HoT, hot rule), `shield` (absorb, Güç Kalkanı / Koruyucu Ruh / Vecd),
 * `fear` (Psişik Çığlık). Keffara (atonement) is a mark on the ally; its heal is in behaviours_priest.ts.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_PRIEST: Partial<Record<StatusId, StatusDef>> = {
  // Keffara (Atonement): a 15 s mark on an ally; the caster's damage heals every marked ally (behaviours_priest.ts)
  atonement: { id: 'atonement', name: 'Keffara', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  // Acı Bastırma (priest_disc_pain_suppression): -40 % damage taken for 8 s (the rule below)
  pain_suppression: { id: 'pain_suppression', name: 'Acı Bastırma', icon: I('buff-defense'), kind: 'buff' },
  // Gölge Acısı (priest_shadow_swp) and Vampirik Dokunuş (priest_shadow_vt): shadow DoTs, magnitude = share of the hit
  shadow_word_pain: { id: 'shadow_word_pain', name: 'Gölge Acısı', icon: I('debuff-curse'), kind: 'debuff', dotType: 'shadow' },
  vampiric_touch: { id: 'vampiric_touch', name: 'Vampirik Dokunuş', icon: I('debuff-poison'), kind: 'debuff', dotType: 'shadow' },
  // Boşluk Formu (priest_shadow_voidform): +20 % spell damage for 20 s (stats.damagePct is per stack)
  voidform: { id: 'voidform', name: 'Boşluk Formu', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.2 }, vfx: 'haste_trail' },
};

export const STATUS_RULES_KIT_PRIEST: Partial<Record<StatusId, StatusRule>> = {
  atonement: { stack: 'refresh' },
  // -40 % damage taken: x(1 + value) = x0.60
  pain_suppression: { stack: 'refresh', takenMore: -0.4 },
  shadow_word_pain: { stack: 'refresh' },
  vampiric_touch: { stack: 'refresh' },
  voidform: { stack: 'refresh' },
};
