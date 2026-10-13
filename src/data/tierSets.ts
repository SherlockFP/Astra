/**
 * WoW-style tier sets (GDD_V2 §6, one per spec; re-bound by GDD_TALENTS §1.6 / OT8).
 * OWNER: items (data). Types: types/v2.ts (`TierSetDef`).
 *
 * Conventions:
 * - Set id `tier_<specId>`; piece item id `tier_<specId>_<slot>` (GDD_V2 §6.1). `pieces` holds the Turkish display
 *   name of each slot piece (the same names are shared by the three mage variants, per GDD_TALENTS §1.6).
 * - Bonus ids `ts_<specId>_2` / `ts_<specId>_4` are the `special.id` values combat registers.
 * - Bonuses only count while the equipped spec matches `specId` (enforced by StatCalc / ItemGen, not here).
 *
 * Registered so far (GDD_TALENTS T16): the three mage variants of the V2 Elementalist set
 * (`tier_mage_fire`, `tier_mage_frost`, `tier_mage_arcane`) and the Paladin heavy-armour variant `tier_paladin_holy`
 * (Şafak Habercisi). The V2 ids `tier_mage_elementalist` / `tier_mage_lightbringer` are replaced and not defined here.
 * The other six V2 sets (GDD_V2 §6.2) and the 13 specs without a set are still missing (later content pass).
 */
import type { TierSetDef } from '../types/v2';

export const TIER_SETS: Readonly<Record<string, TierSetDef>> = {
  tier_mage_fire: {
    id: 'tier_mage_fire', specId: 'mage_fire', name: 'Elementlerin Efendisi (Ateş)',
    pieces: {
      helm: 'Elementlerin Efendisi Şapkası',
      shoulders: 'Elementlerin Efendisi Omuzlukları',
      chest: 'Elementlerin Efendisi Cübbesi',
      gloves: 'Elementlerin Efendisi Eldivenleri',
      legs: 'Elementlerin Efendisi Pantolonu',
    },
    bonus2: {
      id: 'ts_mage_fire_2',
      desc: 'Sıcak Seri için 2 yerine 1 kritik yeter (6 sn bekleme); Anka Alevleri +1 sekme.',
    },
    bonus4: {
      id: 'ts_mage_fire_4',
      desc: 'Sıcak Seri bitince %30 şansla yenilenir; Yanış sırasında Meteor bekleme −%50.',
    },
  },
  tier_mage_frost: {
    id: 'tier_mage_frost', specId: 'mage_frost', name: 'Elementlerin Efendisi (Buz)',
    pieces: {
      helm: 'Elementlerin Efendisi Şapkası',
      shoulders: 'Elementlerin Efendisi Omuzlukları',
      chest: 'Elementlerin Efendisi Cübbesi',
      gloves: 'Elementlerin Efendisi Eldivenleri',
      legs: 'Elementlerin Efendisi Pantolonu',
    },
    bonus2: {
      id: 'ts_mage_frost_2',
      desc: 'Buz Parmağı şansı +%10; Parmaklı Buz Mızrağı +%25.',
    },
    bonus4: {
      id: 'ts_mage_frost_4',
      desc: 'Donmuş Küre her darbede %40 Parmak şansı; Ayaz Damarları sırasında Dondurucu Sağanak çift atar.',
    },
  },
  tier_mage_arcane: {
    id: 'tier_mage_arcane', specId: 'mage_arcane', name: 'Elementlerin Efendisi (Gizem)',
    pieces: {
      helm: 'Elementlerin Efendisi Şapkası',
      shoulders: 'Elementlerin Efendisi Omuzlukları',
      chest: 'Elementlerin Efendisi Cübbesi',
      gloves: 'Elementlerin Efendisi Eldivenleri',
      legs: 'Elementlerin Efendisi Pantolonu',
    },
    bonus2: {
      id: 'ts_mage_arcane_2',
      desc: 'Gizem Barajı 4 yükte yarı mana harcar.',
    },
    bonus4: {
      id: 'ts_mage_arcane_4',
      desc: 'Büyücü Dokunuşu patlaması +%30 ve +3 yük; Gizem Dalgalanması sırasında Gizem Patlaması bedava.',
    },
  },
  tier_paladin_holy: {
    id: 'tier_paladin_holy', specId: 'paladin_holy', name: 'Şafak Habercisi',
    pieces: {
      helm: 'Şafak Habercisi Miğferi',
      shoulders: 'Şafak Habercisi Omuzlukları',
      chest: 'Şafak Habercisi Zırhı',
      gloves: 'Şafak Habercisi Eldivenleri',
      legs: 'Şafak Habercisi Pantolonu',
    },
    bonus2: {
      id: 'ts_paladin_holy_2',
      desc: 'Işığın Sözü +%20 iyileştirir, %30 şansla ikinci hedefe %50 sıçrar; Taşan Şifa sınırı %15 → %25.',
    },
    bonus4: {
      id: 'ts_paladin_holy_4',
      desc: 'Tyr\'ın Sığınağı bekleme 90 → 70 sn; Taşan Şifa kalkanlı müttefike Şafak Işığı anında dökülür.',
    },
  },
};
