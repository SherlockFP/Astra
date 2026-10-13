/**
 * GDD_TALENTS §0.4 / §1.3.3 / §1.4: StatusDefs of the 13 talent statuses. OWNER: combat (T8 mage statuses, T9 utility statuses
 * share this file). Merged into STATUSES in data/statuses.ts.
 *
 * Durations are NOT stored here: the applying skill or hook passes them (`StatusApply.duration` / `apply(id, duration)`):
 * hot_streak 8 s, fingers_of_frost 15 s, touch_of_magi 8 s, arcane_surge 12 s, blazing_barrier 10 s, intercept_ward 4 s,
 * guardian_vow 8 s, karma_ward 6 s, spirit_walk 4 s, feign_death 4 s, cloak_ward 4 s, resolve_pact 8 s, ice_block 4 s.
 *
 * Stat modifiers are per stack (StatusDef.stats convention). Behaviours that are not a plain stat (absorbs, deferred damage,
 * redirects, CC immunity, Buz Parmağı counting) live in the hooks / behaviours, not here.
 */
import type { StatusDef, StatusId } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const TALENT_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  // ---- mage (T8) ----
  // Sıcak Seri: free fire spells + crit bonus, consumed by the next Meteor / Alev Dalgası / Anka Alevleri.
  hot_streak: { id: 'hot_streak', name: 'Sıcak Seri', icon: I('buff-crit'), kind: 'buff' },
  // Buz Parmağı: up to 2 charges (the count is kept by combat/specs/mage.ts; the status shows it as magnitude).
  fingers_of_frost: { id: 'fingers_of_frost', name: 'Buz Parmağı', icon: I('debuff-freeze'), kind: 'buff', maxStacks: 2 },
  // Büyücü Dokunuşu: marks the target; the stored damage bursts when it ends.
  touch_of_magi: { id: 'touch_of_magi', name: 'Büyücü Dokunuşu', icon: I('debuff-marked'), kind: 'debuff', vfx: 'mark_loop', dispellable: true },
  // Gizem Dalgalanması: resource regeneration ×3 (+200 % per stack = 1 stack); +30 % arcane damage is a hook (mage.ts).
  arcane_surge: { id: 'arcane_surge', name: 'Gizem Dalgalanması', icon: I('buff-mana-regen'), kind: 'buff', stats: { resourceRegenPct: 2.0 }, vfx: 'enrage_aura' },
  // Alev Bariyeri: the shield itself is the `shield` status (healing.addAbsorb); this one is the HUD marker and the thorn/nova owner.
  blazing_barrier: { id: 'blazing_barrier', name: 'Alev Bariyeri', icon: I('buff-absorb'), kind: 'buff', vfx: 'blazing_barrier' },

  // ---- class utilities (T9 uses these ids; the defs are here because the file is shared) ----
  // Müdahale: ally takes 25 % less damage for 4 s.
  intercept_ward: { id: 'intercept_ward', name: 'Müdahale Siperi', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.25 } },
  // Muhafız Yemini: damage redirect to the knight (combat redirects through Combat.redirectDamage).
  guardian_vow: { id: 'guardian_vow', name: 'Muhafız Yemini', icon: I('buff-aura'), kind: 'buff' },
  // Karma Siperi: damage deferred into a DoT (behaviour `karma`).
  karma_ward: { id: 'karma_ward', name: 'Karma Siperi', icon: I('buff-reflect'), kind: 'buff' },
  // Ruh Yürüyüşü: +40 % movement; the physical -30 % taken is a behaviour rule (not a stat here).
  spirit_walk: { id: 'spirit_walk', name: 'Ruh Yürüyüşü', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.4 } },
  // Ölü Taklidi: stealth that survives damage (behaviour `feign`).
  feign_death: { id: 'feign_death', name: 'Ölü Taklidi', icon: I('buff-stealth'), kind: 'buff' },
  // Gölge Pelerini: all cleansable debuffs removed on cast; resistances +60 %.
  cloak_ward: { id: 'cloak_ward', name: 'Gölge Pelerini', icon: I('buff-blessing'), kind: 'buff', stats: { resAll: 0.6 } },
  // Dayanıklılık Sözleşmesi: damage taken -30 %; CC immunity is a behaviour rule.
  resolve_pact: { id: 'resolve_pact', name: 'Dayanıklılık Sözleşmesi', icon: I('buff-strength'), kind: 'buff', stats: { damageReductionPct: 0.3 } },
  // Buz Küresi: invulnerable for 4 s (the `invulnerable` status does the work; this is the HUD marker).
  ice_block: { id: 'ice_block', name: 'Buz Küresi', icon: I('buff-invulnerable'), kind: 'buff' },
};
