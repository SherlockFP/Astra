/**
 * AE-3 (docs/kits/agile-evoker.md §3.1 / §3.2 + the WoW Midnight (12.0) third Demon Hunter spec): SpecDef rows of the İblis Avcısı, merged
 * into SPECS by data/specs.ts. Kaos (Havoc, dps, Gazap), İntikam (Vengeance, tank, Gazap + Ruh Parçacığı), Yutucu (Devourer, dps, Gazap +
 * Ruh Parçacığı, menzilli boşluk büyücüsü). Majors: Kaos Öz Kırılması / Metamorfoz / Av; İntikam Fel Yıkımı / Metamorfoz / Ruh Oyucu;
 * Yutucu Karanlık / Boşluk Metamorfozu / Av.
 *
 * Gazap (Fury): ClassDef.baseStats.resourceRegen 5 is the Fel Bıçakları engine (in combat only, Combat 'fury' regen rule); the spec stat
 * `resourceRegen` adds to it (Kaos +5 = 10/s, İntikam +1 = 6/s, Yutucu +0 = 5/s). `fx` rows are the PRD / tick triggers read by
 * StatCalc.collectFx -> ProcEngine: Kaos Damgası (chaos_brand) on every hit, İntikam Fel Kanı (+1 fragment per 10 s, 20 % per finisher
 * step), Şeytan Dikenleri refunds, Yutucu Hasat (+1 fragment per kill).
 * Hero talents (Midnight: Aldrachi Biçici, Yara İzli, Yok Edici) are not a layer of the talent system; they are late A/B choices in the spec trees.
 * Yutucu is an Intellect spec in retail; the item pool of this class rolls Agility only, so its mainStat stays 'dex'.
 * OWNER: combat (data).
 */
import type { SpecDef, SpecId } from '../types/v2';

const CHAOS_BRAND = 'T hit ch=1 icd=5 => st(tgt,chaos_brand,30)';

export const SPECS_KIT_DEMONHUNTER: Partial<Record<SpecId, SpecDef>> = {
  // ---- Kaos (Havoc): Göz Işını + Öz Kırılması patlama penceresi, Metamorfoz iki tuşu dönüştürür
  demonhunter_chaos: {
    id: 'demonhunter_chaos', classId: 'demonhunter', name: 'Kaos (Havoc)', role: 'dps', mainStat: 'dex',
    desc: 'Gözleri bağlı, hızlı ve acımasız: Fel Bıçakları saniyede 10 Gazap üretir, Kaos Darbesi ile harcarsın. İntikam Geri Çekilişi ardından Göz Işını, Öz Kırılması ve Metamorfoz ile patlama penceresi açarsın; çift zıplama ve süzülmeyle sürekli hareket halindesin.',
    stats: { critChance: 0.06, attackSpeed: 0.05, shadowDamagePct: 0.15, resourceRegen: 5 },
    specials: [
      { id: 'trait_havoc', desc: 'Fel Bıçakları: savaşta saniyede 5 ek Gazap (toplam 10); zincir vuruşları +1 Gazap daha verir.', params: { furyRegen: 10 } },
    ],
    skills: [
      'demonhunter_chaos_nova',
      'demonhunter_chaos_strike', 'demonhunter_annihilation', 'demonhunter_blade_dance', 'demonhunter_death_sweep', 'demonhunter_eye_beam',
      'demonhunter_vengeful_retreat', 'demonhunter_immolation_aura', 'demonhunter_fel_rush', 'demonhunter_blur', 'demonhunter_disrupt',
      'demonhunter_essence_break', 'demonhunter_metamorphosis', 'demonhunter_the_hunt',
    ],
    unlock: {
      demonhunter_chaos_nova: 20,
      demonhunter_chaos_strike: 1, demonhunter_immolation_aura: 1, demonhunter_fel_rush: 1, demonhunter_blade_dance: 1, demonhunter_eye_beam: 4,
      demonhunter_vengeful_retreat: 10, demonhunter_blur: 10, demonhunter_disrupt: 3, demonhunter_essence_break: 10,
      demonhunter_metamorphosis: 20, demonhunter_annihilation: 20, demonhunter_death_sweep: 20, demonhunter_the_hunt: 30,
    },
    majors: { m45: 'demonhunter_essence_break', m90: 'demonhunter_metamorphosis', m180: 'demonhunter_the_hunt' },
    mods: [],
    fx: CHAOS_BRAND,
    defaultBar: {
      lmb: 'demonhunter_basic', rmb: 'demonhunter_chaos_strike', q: 'demonhunter_chaos_nova', e: 'demonhunter_immolation_aura', r: 'demonhunter_eye_beam',
      s1: 'demonhunter_blade_dance', s2: 'demonhunter_fel_rush', s3: 'demonhunter_blur', s4: 'demonhunter_disrupt',
      m45: 'demonhunter_essence_break', m90: 'demonhunter_metamorphosis', m180: 'demonhunter_the_hunt',
    },
  },

  // ---- İntikam (Vengeance): Kırılma -> fragmanlar -> Ruh Yarma / Ruh Bombası, Şeytan Dikenleri + Ateş Mührü
  demonhunter_vengeance: {
    id: 'demonhunter_vengeance', classId: 'demonhunter', name: 'İntikam (Vengeance)', role: 'tank', mainStat: 'dex',
    desc: 'Ruh parçacıklarını yutarak ayakta kalan şeytani tank. Kırılma Gazap ve parçacık üretir, Ruh Yarma yutup iyileştirir, beş parçacıkta Ruh Bombası patlar. Şeytan Dikenleri ve Ateş Mührü aktif savunmandır; Fel Yıkımı ve Metamorfoz büyük sığınaklarındır.',
    stats: { maxHpPct: 0.30, armorPct: 0.15, dodgeChance: 0.05, lifeSteal: 0.04, threatPct: 1.5, damagePct: -0.25, resourceRegen: 1 },
    specials: [
      { id: 'trait_vengeance', desc: 'Fel Kanı: 10 saniyede bir kendiliğinden +1 Ruh Parçacığı; son zincir vuruşu %20 şansla +1 parçacık verir. Savaşta saniyede 1 ek Gazap.', params: { soulPer10s: 1, finisherSoul: 0.2 } },
    ],
    skills: [
      'demonhunter_imprison',
      'demonhunter_sigil_of_flame',
      'demonhunter_fracture', 'demonhunter_soul_cleave', 'demonhunter_spirit_bomb', 'demonhunter_fiery_brand', 'demonhunter_torment',
      'demonhunter_immolation_aura', 'demonhunter_infernal_strike', 'demonhunter_fel_rush', 'demonhunter_demon_spikes', 'demonhunter_disrupt',
      'demonhunter_fel_devastation', 'demonhunter_metamorphosis', 'demonhunter_soul_carver',
    ],
    unlock: {
      demonhunter_imprison: 10,
      demonhunter_sigil_of_flame: 10,
      demonhunter_fracture: 1, demonhunter_soul_cleave: 1, demonhunter_fel_rush: 1, demonhunter_torment: 5, demonhunter_demon_spikes: 2, demonhunter_immolation_aura: 1,
      demonhunter_spirit_bomb: 10, demonhunter_fiery_brand: 10, demonhunter_infernal_strike: 10, demonhunter_fel_devastation: 10, demonhunter_disrupt: 3,
      demonhunter_metamorphosis: 20, demonhunter_soul_carver: 20,
    },
    majors: { m45: 'demonhunter_fel_devastation', m90: 'demonhunter_metamorphosis', m180: 'demonhunter_soul_carver' },
    // the shared rows change for the tank (docs §3.2): Yakıp Yok Etme Aurası weaker, Metamorfoz = 15 s fire form with +40 % max HP
    mods: [
      { skill: 'demonhunter_immolation_aura', patch: { cost: -16, damage: { coef: 0.31, type: 'fire', perTick: true } } },
      { skill: 'demonhunter_metamorphosis', patch: { damage: { coef: 1.55, type: 'fire' }, selfStatuses: [{ status: 'metamorphosis_v', duration: 15 }] }, params: { healMaxPct: 0.25 } },
    ],
    fx: [
      CHAOS_BRAND,
      'T hit:demonhunter_basic_4 ch=.2 => pip(soul,1)',
      'T tick:10 => pip(soul,1)',
      'T cast:demonhunter_fracture => cdr(demonhunter_demon_spikes,0.5)',
      'T cast:demonhunter_soul_cleave => cdr(demonhunter_demon_spikes,0.5)',
    ].join(' ;; '),
    defaultBar: {
      lmb: 'demonhunter_basic', rmb: 'demonhunter_fracture', q: 'demonhunter_soul_cleave', e: 'demonhunter_immolation_aura', r: 'demonhunter_fiery_brand',
      s1: 'demonhunter_sigil_of_flame', s2: 'demonhunter_fel_rush', s3: 'demonhunter_demon_spikes', s4: 'demonhunter_disrupt',
      m45: 'demonhunter_fel_devastation', m90: 'demonhunter_metamorphosis', m180: 'demonhunter_soul_carver',
    },
  },

  // ---- Yutucu (Devourer, Midnight): menzilli boşluk büyücüsü
  demonhunter_devourer: {
    id: 'demonhunter_devourer', classId: 'demonhunter', name: 'Yutucu (Devourer)', role: 'dps', mainStat: 'dex', basic: 'demonhunter_void_basic',
    desc: 'Orta menzilden boşluk büyüsü saçan ruh yutucu. Tüket hareket halindeyken bile Gazap ve Ruh Parçacığı üretir, Biç parçacıkları yutup çevreyi biçer; 4 parçacıkla Boşluk Metamorfozu\'na girersin: Boşluk Işını fırtınaya döner, Çöken Yıldız her seferinde güçlenir, ama Gazap hızla erir.',
    stats: { shadowDamagePct: 0.15, critChance: 0.05, castSpeed: 0.05 },
    specials: [
      { id: 'trait_devourer', desc: 'Hasat: her öldürme +1 Ruh Parçacığı verir. Boşluk Metamorfozu bekleme tanımaz ve sabit süresi yoktur; Gazap bitince söner.', params: { soulOnKill: 1 } },
    ],
    skills: [
      'demonhunter_silence',
      'demonhunter_void_basic', 'demonhunter_consume', 'demonhunter_reap', 'demonhunter_void_ray', 'demonhunter_void_storm',
      'demonhunter_collapsing_star', 'demonhunter_void_nova', 'demonhunter_fel_rush', 'demonhunter_blur', 'demonhunter_disrupt',
      'demonhunter_darkness', 'demonhunter_void_metamorphosis', 'demonhunter_the_hunt',
    ],
    unlock: {
      demonhunter_silence: 10,
      demonhunter_void_basic: 1, demonhunter_consume: 1, demonhunter_fel_rush: 1, demonhunter_reap: 1, demonhunter_void_ray: 6,
      demonhunter_void_nova: 1, demonhunter_blur: 10, demonhunter_disrupt: 3,
      demonhunter_void_storm: 20, demonhunter_collapsing_star: 20, demonhunter_darkness: 20, demonhunter_void_metamorphosis: 20, demonhunter_the_hunt: 30,
    },
    majors: { m45: 'demonhunter_darkness', m90: 'demonhunter_void_metamorphosis', m180: 'demonhunter_the_hunt' },
    mods: [],
    fx: [CHAOS_BRAND, 'T kill ch=1 => pip(soul,1)'].join(' ;; '),
    defaultBar: {
      lmb: 'demonhunter_void_basic', rmb: 'demonhunter_consume', q: 'demonhunter_reap', e: 'demonhunter_void_ray', r: 'demonhunter_collapsing_star',
      s1: 'demonhunter_void_nova', s2: 'demonhunter_fel_rush', s3: 'demonhunter_blur', s4: 'demonhunter_silence',
      m45: 'demonhunter_darkness', m90: 'demonhunter_void_metamorphosis', m180: 'demonhunter_the_hunt',
    },
  },
};
