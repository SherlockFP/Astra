/**
 * WP-02 Keşiş kit StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. OWNER: monk package.
 *
 * Numbers follow docs/GDD_CLASSES_V2.md §2.1 / §2.4 / §2.5 / §2.10 and §1.11 (Sarsma pool). Shared rows that already exist in
 * data/statuses.ts are NOT redefined here: slow, root, taunt, empower (+10 % Storm, Earth and Fire),
 * sunder (shared rule is 15 %; the monk's own Doğan Güneş debuff is `rising_sun` at the GDD 12 %).
 * Hooks that the engine does not read yet are listed in the monk report (stagger pool accrual, brewed effect, tigerlust trait).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_MONK: Partial<Record<StatusId, StatusDef>> = {
  // Sheilun'un Armağanı (Mistweaver): one stack per Canlandırma / Sarmalayan Sis cast (proc st(self,...)); up to 5, spent by monk_mw_sheilun_gift
  sheilun_gift: { id: 'sheilun_gift', name: "Sheilun'un Armağanı", icon: I('buff-regen'), kind: 'buff', maxStacks: 5, defaultDuration: 30, dispellable: false },
  // ---- Akış (trait_flow) and the Çi Torpedo self-buff: +20 % attack speed for 2.5 s
  chi_flow: { id: 'chi_flow', name: 'Çi Akışı', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.2 } },
  // ---- Kaplan Hırsı (monk_tigers_lust): +35 % move speed, +15 % attack speed for 6 s (slow and root are cleansed by the skill)
  tigerlust: { id: 'tigerlust', name: 'Kaplan Hırsı', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.35, attackSpeed: 0.15 } },
  // ---- Kaplan Öfkesi (monk_ww_tigers_fury): +30 % attack speed and double energy regen for 12 s
  tigerfury: { id: 'tigerfury', name: 'Kaplan Öfkesi', icon: I('buff-strength'), kind: 'buff', stats: { attackSpeed: 0.3, resourceRegenPct: 1.0 } },
  // ---- Güçlendirici İksir (monk_bm_fortifying_brew): +20 % max HP for 15 s; the -20 % damage taken is the rule below
  fortifying: { id: 'fortifying', name: 'Güçlendirici İksir', icon: I('buff-defense'), kind: 'buff', stats: { maxHpPct: 0.2 } },
  // ---- Fıçı Darbesi mark (6 s on the enemy). The GDD names the status but gives no effect; kept as a marker (see report).
  brewed: { id: 'brewed', name: 'Demlenmiş', icon: I('debuff-poison'), kind: 'debuff' },
  // ---- Sarsma pool (§1.11, Demci): the pool value is the magnitude (HP). Hidden; the HUD bar reads stagger:changed.
  stagger_pool: { id: 'stagger_pool', name: 'Sarsma', icon: I('buff-absorb'), kind: 'buff', hidden: true },
  // ---- Monk-only ids appended to the union (see types/skills.ts)
  // Cennet Yumrukları (monk_fists_of_fury): -30 % damage taken while the channel runs
  fists_guard: { id: 'fists_guard', name: 'Yumruk Siperi', icon: I('buff-defense'), kind: 'buff' },
  // Doğan Güneş Tekmesi (monk_rising_sun_kick): +12 % damage taken for 6 s
  rising_sun: { id: 'rising_sun', name: 'Doğan Güneş', icon: I('debuff-armor-break'), kind: 'debuff' },
  // Yıldırım Çayı (monk_mw_thunder_tea, m45): the next heals are free and +50 %; one stack per heal
  thunder_tea: { id: 'thunder_tea', name: 'Yıldırım Çayı', icon: I('buff-mana-regen'), kind: 'buff', maxStacks: 3 },
  // Sis HoTs (monk_mw_renewing_mist, monk_mw_enveloping_mist): magnitude is HP per second (STATUS_RULES hot)
  renewing_mist: { id: 'renewing_mist', name: 'Yenileyen Sis', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  enveloping_mist: { id: 'enveloping_mist', name: 'Sarmalayan Sis', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
};

export const STATUS_RULES_KIT_MONK: Partial<Record<StatusId, StatusRule>> = {
  sheilun_gift: { stack: 'stack' },
  chi_flow: { stack: 'refresh' },
  tigerlust: { stack: 'refresh' },
  tigerfury: { stack: 'refresh' },
  // -20 % damage taken: x(1 + value) = x0.80
  fortifying: { stack: 'refresh', takenMore: -0.2 },
  brewed: { stack: 'refresh' },
  // the pool value is overwritten by Arındırıcı İksir and by the accrual hook (magnitude exact, duration kept)
  stagger_pool: { stack: 'override' },
  // -30 % damage taken while Cennet Yumrukları runs
  fists_guard: { stack: 'refresh', takenMore: -0.3 },
  // +12 % damage taken (GDD 12 %; the shared sunder row is 15 %, not changed)
  rising_sun: { stack: 'refresh', takenMore: 0.12 },
  thunder_tea: { stack: 'stack' },
  renewing_mist: { stack: 'refresh', hot: true },
  enveloping_mist: { stack: 'refresh', hot: true },
};
