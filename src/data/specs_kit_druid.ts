/**
 * KIT Druid SpecDef rows (WoW Midnight 12.0, Turkish): Denge (Balance, DPS), Vahşi (Feral, DPS), Koruyucu (Guardian, TANK),
 * Restorasyon (Restoration, HEALER). Merged into SPECS by data/specs.ts. OWNER: druid kit. Midnight has no hero layer in this game
 * (as for the monk). Shapeshifting is the engine of combat/Forms.ts; the class skills (Doğra, Tırmık, Parçalayıcı Pençe, Çırpınma...) are
 * in data/skillsets/druid.ts and are on the spec bars directly (a `f_cat` / `f_bear` / `f_moon` skill auto-enters its form).
 *
 * Sources (WoW Midnight 12.0, checked 2026-10):
 *   https://www.icy-veins.com/wow/balance-druid-midnight-guide          Eclipse is an active 15 s / 30 s window, Astral Power from Wrath / Starfire, Starsurge / Starfall
 *   https://www.method.gg/guides/restoration-druid                       Restoration overhaul: Harmony counts up to 5 HoTs, Lifebloom / Wild Growth / Swiftmend / Tranquility
 *   https://wp-prod.icy-veins.com/?p=144714                              12.0.7 class tuning: Feral bleeds snapshot only via Tiger's Fury / Prowl, Bloodtalons removed
 *   https://www.wowhead.com/tw/guide/classes/druid/guardian/overview-pve-tank   Guardian: Bear form, Mangle / Thrash / Ironfur / Frenzied Regeneration
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_DRUID: Partial<Record<SpecId, SpecDef>> = {
  // ---- Denge (DPS): Astral Güç from Güneş Gazabı / Yıldız Ateşi, Yıldız Dalgası / Yıldız Yağmuru spend it, active Tutulma
  druid_balance: {
    id: 'druid_balance', classId: 'druid', name: 'Denge', role: 'dps',
    desc: 'Ay ve Güneş\'in büyücüsü: Güneş Gazabı ve Yıldız Ateşi ile Astral Güç biriktirir, Yıldız Dalgası ve Yıldız Yağmuru ile harcarsın. Tutulma penceresinde eşleşen büyü %40 güçlenir; Ay Baykuşu Biçimi\'ne bürünürsün.',
    stats: { castSpeed: 0.08, critChance: 0.03, arcaneDamagePct: 0.06, fireDamagePct: 0.06 },
    mainStat: 'int',
    specials: [
      { id: 'trait_balance', desc: 'Gök Dengesi: Tutulma (15 sn, 30 sn bekleme) Güneş ve Ay arasında sırayla geçer; Güneş Gazabı Güneş\'te, Yıldız Ateşi Ay\'da %40 güçlenir. Göksel Hizalanma ikisini birden açar.', params: { eclipseDur: 15, eclipseMore: 0.4 } },
    ],
    skills: ['druid_bal_basic', 'druid_sunfire', 'druid_starfire', 'druid_starsurge', 'druid_eclipse', 'druid_starfall', 'druid_celestial_alignment', 'druid_fury_of_elune'],
    unlock: {
      druid_bal_basic: 1, druid_sunfire: 10, druid_starfire: 10, druid_celestial_alignment: 10, druid_starsurge: 12, druid_eclipse: 15,
      druid_starfall: 20, druid_fury_of_elune: 20,
    },
    majors: { m45: 'druid_celestial_alignment', m90: 'druid_fury_of_elune' },
    mods: [],
    basic: 'druid_bal_basic',
    defaultBar: {
      lmb: 'druid_bal_basic', rmb: 'druid_wrath', q: 'druid_starfire', e: 'druid_starsurge', s1: 'druid_moonfire', s2: 'druid_sunfire', s3: 'druid_eclipse',
      r: 'druid_starfall', m45: 'druid_celestial_alignment', m90: 'druid_fury_of_elune',
    },
  },

  // ---- Vahşi (DPS): Kedi, Enerji, Kombo Puanı; Tırmık / Parçalama kanamaları, Yırtıcı Isırık, Pars Öfkesi (bleeds snapshot only through it)
  druid_feral: {
    id: 'druid_feral', classId: 'druid', name: 'Vahşi', role: 'dps',
    desc: 'Kedi Biçimi\'nde kanamaları ayakta tutar, Kombo Puanı biriktirip Parçalama ya da Yırtıcı Isırık ile harcarsın. Pars Öfkesi hasarını ve Enerjini patlatır.',
    stats: { attackSpeed: 0.08, critChance: 0.05, bleedDamagePct: 0.12, dodgeChance: 0.03 },
    mainStat: 'dex',
    specials: [
      { id: 'trait_feral', desc: 'Avcı İçgüdüsü: Kedi Biçimi\'nde pençe zincirinin son vuruşu Kombo Puanı verir; Pars Öfkesi sırasında kanamalar %15 daha güçlü açılır (Bloodtalons yok: odak kanamaları ayakta tutmak).', params: { tigerFury: 0.15 } },
    ],
    skills: ['druid_rip', 'druid_swipe', 'druid_feral_fury', 'druid_berserk', 'druid_feral_frenzy'],
    unlock: { druid_rip: 10, druid_swipe: 10, druid_berserk: 10, druid_feral_fury: 12, druid_feral_frenzy: 20 },
    majors: { m45: 'druid_berserk', m90: 'druid_feral_frenzy' },
    mods: [],
    defaultBar: {
      lmb: 'druid_basic', rmb: 'druid_shred', q: 'druid_rake', e: 'druid_rip', s1: 'druid_ferocious_bite', s2: 'druid_swipe', s3: 'druid_feral_fury',
      r: 'druid_barkskin', m45: 'druid_berserk', m90: 'druid_feral_frenzy',
    },
  },

  // ---- Koruyucu (TANK): Ayı, Öfke; Parçalayıcı Pençe / Çırpınma threat, Demir Post armour stacks, Çılgın Yenilenme
  druid_guardian: {
    id: 'druid_guardian', classId: 'druid', name: 'Koruyucu', role: 'tank',
    desc: 'Ayı Biçimi\'nde ön safı tutarsın: Parçalayıcı Pençe ve Çırpınma ile tehdit üretir, Demir Post ile zırhını katlar, Çılgın Yenilenme ile kendini iyileştirirsin. Aldığın hasar Öfke kazandırır.',
    stats: { maxHpPct: 0.30, armorPct: 0.25, dodgeChance: 0.05, threatPct: 1.5 },
    mainStat: 'dex',
    specials: [
      { id: 'trait_guardian', desc: 'Doğanın Muhafızı: Ayı Biçimi\'nde en çok canın %30 fazla; Parçalayıcı Pençe %60, Çırpınma %40 daha fazla tehdit üretir.', params: { mangleThreat: 1.6, thrashThreat: 1.4 } },
    ],
    skills: ['druid_frenzied_regen', 'druid_growl', 'druid_survival_instincts', 'druid_sleeper_rage'],
    unlock: { druid_frenzied_regen: 10, druid_growl: 10, druid_survival_instincts: 10, druid_sleeper_rage: 20 },
    majors: { m45: 'druid_survival_instincts', m90: 'druid_sleeper_rage' },
    mods: [],
    guard: { gauge: 80, arc: 120, blockAmount: 0.4 },
    defaultBar: {
      lmb: 'druid_basic', rmb: 'druid_mangle', q: 'druid_thrash', e: 'druid_ironfur', s1: 'druid_frenzied_regen', s2: 'druid_growl', s3: 'druid_barkskin',
      r: 'druid_travel_form', m45: 'druid_survival_instincts', m90: 'druid_sleeper_rage',
    },
  },

  // ---- Restorasyon (HEALER): HoT layers (Gençleşme, Yeniden Büyüme, Yaşam Çiçeği, Yabani Büyüme), Çabuk İyileşme, Dinginlik
  druid_restoration: {
    id: 'druid_restoration', classId: 'druid', name: 'Restorasyon', role: 'healer',
    desc: 'Doğanın şifacısı: Gençleşme, Yeniden Büyüme, Yaşam Çiçeği ve Yabani Büyüme ile iyileştirmeleri üst üste bindirir, Çabuk İyileşme ile anında şifa verirsin. Dinginlik tüm grubu iyileştirir.',
    stats: { healingPct: 0.30, resourceRegenPct: 0.25, castSpeed: 0.10, threatPct: -0.4 },
    mainStat: 'int',
    specials: [
      { id: 'trait_restoration', desc: 'Armoni: üzerinde kendi iyileştirme etkilerinden (en çok 5) olan hedefe yaptığın her şifa etki başına %6 daha güçlüdür.', params: { harmony: 0.06, harmonyCap: 5 } },
    ],
    skills: ['druid_resto_basic', 'druid_lifebloom', 'druid_swiftmend', 'druid_wild_growth', 'druid_natures_cure', 'druid_ironbark', 'druid_tranquility'],
    unlock: {
      druid_resto_basic: 1, druid_lifebloom: 10, druid_swiftmend: 10, druid_ironbark: 10, druid_wild_growth: 12, druid_natures_cure: 12, druid_tranquility: 20,
    },
    majors: { m45: 'druid_ironbark', m90: 'druid_tranquility' },
    mods: [],
    basic: 'druid_resto_basic',
    defaultBar: {
      lmb: 'druid_resto_basic', rmb: 'druid_rejuvenation', q: 'druid_regrowth', e: 'druid_lifebloom', s1: 'druid_wild_growth', s2: 'druid_swiftmend', s3: 'druid_natures_cure',
      r: 'druid_wrath', m45: 'druid_ironbark', m90: 'druid_tranquility',
    },
  },
};

/** Spec ids of this file (for the sim and the talent tree check). */
export const DRUID_KIT_SPEC_IDS: SpecId[] = ['druid_balance', 'druid_feral', 'druid_guardian', 'druid_restoration'];
