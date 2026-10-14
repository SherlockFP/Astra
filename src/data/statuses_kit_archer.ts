/**
 * WP-02 Okçu kit StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. OWNER: archer package.
 * Generic bleed / poison / root / slow / burn are the shared rows of data/statuses.ts (not repeated here).
 * Stat values are per stack (StatusDef.stats convention). Hunter's Mark's +8 % damage taken is the `takenMore` rule.
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_ARCHER: Partial<Record<StatusId, StatusDef>> = {
  // ---- Avcı İşareti (core, 12 s on the soft target): the target takes +8 % damage; the caster's +10 % crit is a hook (see the report)
  hunters_mark: { id: 'hunters_mark', name: 'Avcı İşareti', icon: I('debuff-marked'), kind: 'debuff', defaultDuration: 12 },
  // ---- Keskin Nişan (m45, 10 s, 3 stacks): each stack is one instant full draw and +10 % crit (3 stacks = +30 %)
  deadeye: { id: 'deadeye', name: 'Keskin Nişan', icon: I('buff-crit'), kind: 'buff', maxStacks: 3, stats: { critChance: 0.1 }, defaultDuration: 10 },
  // ---- Tam İsabet (m90, 20 s): +50 % crit damage, +40 % attack speed, Odak regen x2 (resourceRegenPct +1.0), arrows pierce +1
  trueshot: { id: 'trueshot', name: 'Tam İsabet', icon: I('buff-crit'), kind: 'buff', stats: { critDamage: 0.5, attackSpeed: 0.4, resourceRegenPct: 1.0, pierce: 1 }, vfx: 'buff_aura', defaultDuration: 20 },
  // ---- Vahşi Gazap (m45, 10 s, on the caster and the pack): +25 % damage. The pet's +50 % attack speed and unstoppable are not modelled
  wild_wrath: { id: 'wild_wrath', name: 'Vahşi Gazap', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.25 }, vfx: 'enrage_aura', defaultDuration: 10 },
  // ---- Geri Sıçrayış window (2.5 s): the next Nişanlı Atış is a full draw
  quick_draw: { id: 'quick_draw', name: 'Hızlı Çekiş', icon: I('buff-haste'), kind: 'buff', maxStacks: 1, defaultDuration: 2.5 },
  // Vahşi Öfke (Frenzy, Dikenli Atış): up to 3 stacks; each stack speeds up the pets' attacks by 10 % (MinionAI.update)
  frenzy: { id: 'frenzy', name: 'Vahşi Öfke', icon: I('buff-strength'), kind: 'buff', maxStacks: 3, defaultDuration: 8, dispellable: false },
  // ---- Son Siper (Hayatta Kalma m90, 12 s): -25 % damage taken
  survivor_ward: { id: 'survivor_ward', name: 'Son Siper', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.25 }, vfx: 'shield_bubble', defaultDuration: 12 },
};

export const STATUS_RULES_KIT_ARCHER: Partial<Record<StatusId, StatusRule>> = {
  hunters_mark: { stack: 'refresh', takenMore: 0.08 },
  deadeye: { stack: 'stack' },
  trueshot: { stack: 'refresh' },
  wild_wrath: { stack: 'refresh' },
  quick_draw: { stack: 'refresh' },
  frenzy: { stack: 'stack' },
  survivor_ward: { stack: 'refresh' },
};
