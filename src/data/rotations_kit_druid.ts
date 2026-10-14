/**
 * KIT Druid APL rows (same shape as rotations_kit_monk.ts: A.3 condition DSL, first match wins, the last `st` line is the spec's basic).
 * `pips:astral_power` is Astral Güç (0-100), `pips:combo` the Kombo Puanı (0-5). Used by dev/combat-sim/kit_druid.mjs. OWNER: druid kit.
 * Vahşi / Koruyucu lines press cat / bear buttons; the first press auto-shifts (combat/Forms.ts), so there is no form line.
 */
import type { KitApl } from './rotations_kit_monk';

export const ROTATIONS_KIT_DRUID: Record<string, KitApl> = {
  // ---- Denge: Tutulma window, DoTs up, Yıldız Dalgası at 35 AP, Yıldız Ateşi under Ay, Güneş Gazabı filler
  druid_balance: {
    st: [
      'druid_celestial_alignment if cd_ready(druid_celestial_alignment)',
      'druid_fury_of_elune if cd_ready(druid_fury_of_elune)',
      'druid_eclipse if cd_ready(druid_eclipse) && !status:eclipse_solar && !status:eclipse_lunar',
      'druid_sunfire if !target.status:sunfire',
      'druid_moonfire if !target.status:moonfire',
      'druid_starsurge if pips:astral_power >= 35',
      'druid_starfire if status:eclipse_lunar',
      'druid_wrath',
      'druid_bal_basic',
    ],
    aoe: [
      'druid_celestial_alignment if cd_ready(druid_celestial_alignment)',
      'druid_fury_of_elune if cd_ready(druid_fury_of_elune)',
      'druid_starfall if cd_ready(druid_starfall) && pips:astral_power >= 50',
      'druid_sunfire if !target.status:sunfire',
      'druid_moonfire if !target.status:moonfire',
      'druid_eclipse if cd_ready(druid_eclipse) && !status:eclipse_solar && !status:eclipse_lunar',
      'druid_starfire if status:eclipse_lunar',
      'druid_wrath',
      'druid_bal_basic',
    ],
  },
  // ---- Vahşi: Pars Öfkesi / Vahşileşme on cooldown, Tırmık and Parçalama kept up, Yırtıcı Isırık at 5, Doğra builds
  druid_feral: {
    st: [
      'druid_berserk if cd_ready(druid_berserk)',
      'druid_feral_frenzy if cd_ready(druid_feral_frenzy) && pips:combo <= 1',
      'druid_feral_fury if cd_ready(druid_feral_fury)',
      'druid_rip if pips:combo >= 5 && !target.status:rip',
      'druid_ferocious_bite if pips:combo >= 5',
      'druid_rake if !target.status:rake',
      'druid_shred',
      'druid_basic',
    ],
    aoe: [
      'druid_berserk if cd_ready(druid_berserk)',
      'druid_feral_fury if cd_ready(druid_feral_fury)',
      'druid_feral_frenzy if cd_ready(druid_feral_frenzy) && pips:combo <= 1',
      'druid_rip if pips:combo >= 5 && !target.status:rip',
      'druid_swipe if targets >= 2',
      'druid_rake if !target.status:rake',
      'druid_shred',
      'druid_basic',
    ],
  },
  // ---- Koruyucu: Kükreme on a free target, defensives by HP, Demir Post kept up, Çırpınma then Parçalayıcı Pençe
  druid_guardian: {
    st: [
      'druid_growl if cd_ready(druid_growl) && !target.status:taunt',
      'druid_survival_instincts if cd_ready(druid_survival_instincts) && hp% < 50',
      'druid_sleeper_rage if cd_ready(druid_sleeper_rage)',
      'druid_frenzied_regen if charges(druid_frenzied_regen) >= 1 && hp% < 70',
      'druid_ironfur if !status:ironfur',
      'druid_thrash if cd_ready(druid_thrash)',
      'druid_mangle if cd_ready(druid_mangle)',
      'druid_basic',
    ],
    aoe: [
      'druid_growl if cd_ready(druid_growl) && !target.status:taunt',
      'druid_survival_instincts if cd_ready(druid_survival_instincts) && hp% < 50',
      'druid_thrash if cd_ready(druid_thrash)',
      'druid_ironfur if !status:ironfur',
      'druid_frenzied_regen if charges(druid_frenzied_regen) >= 1 && hp% < 70',
      'druid_mangle if cd_ready(druid_mangle)',
      'druid_basic',
    ],
  },
  // ---- Restorasyon: Dinginlik for a party in need, Çabuk İyileşme on a layered target, HoT layers, Doğa Kıvılcımı filler
  druid_restoration: {
    st: [
      'druid_tranquility if cd_ready(druid_tranquility) && allies.injured >= 3',
      'druid_ironbark if cd_ready(druid_ironbark) && ally.low% < 0.4',
      'druid_swiftmend if cd_ready(druid_swiftmend) && ally.low% < 0.5',
      'druid_wild_growth if cd_ready(druid_wild_growth) && allies.injured >= 3',
      'druid_regrowth if ally.low% < 0.6',
      'druid_lifebloom if ally.low% < 0.95',
      'druid_rejuvenation if ally.low% < 0.9',
      'druid_natures_cure if allies.debuffed',
      'druid_resto_basic',
    ],
  },
};
