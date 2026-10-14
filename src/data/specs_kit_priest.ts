/**
 * Rahip SpecDefs (Disiplin, Kutsal, Gölge). Merged into SPECS by data/specs.ts. Midnight (12.0) shape: Disiplin is an Atonement
 * healer (damage heals allies marked by Keffara), Kutsal is a direct and AoE healer, Gölge is an Insanity (Delilik) DPS with
 * Voidform. Bar keys follow docs/WOW_ABILITY_MAP.md section 16 (1 / 2 / 3 / 4 / 5 / Q / E / R, majors X / V / T). The SpecDef
 * `majors` type needs m45 and m90, so the majors are m45 / m90 (+ m180 where a third exists): Disiplin X Evangelism, V Rapture,
 * T Power Infusion; Kutsal X Divine Hymn, V Guardian Spirit; Gölge X Voidform, V Shadowfiend. OWNER: priest kit.
 */
import type { SpecDef, SpecId } from '../types/v2';

export const SPECS_KIT_PRIEST: Partial<Record<SpecId, SpecDef>> = {
  // ---- Disiplin (HEALER): Keffara (Atonement) on 15 s, 46 % of damage done heals the marked allies
  priest_discipline: {
    id: 'priest_discipline', classId: 'priest', name: 'Disiplin', role: 'healer',
    desc: 'Keffara: verdiğin hasar, Keffara\'lı müttefiklerini iyileştirir. Güç Kalkanı, Hızlı Şifa ve Güç Işıması Keffara uygular; Tövbe hem vurur hem iyileştirir.',
    stats: { healingPct: 0.12, castSpeed: 0.05 },
    specials: [
      { id: 'trait_discipline', desc: 'Keffara: verdiğin hasarın %46\'sı Keffara\'lı müttefiklere geri döner (5 hedefe kadar, sonrası yarı); Keffara 15 sn sürer.', params: { atonementPct: 0.46, atonementCap: 5 } },
    ],
    skills: ['priest_disc_penance', 'priest_disc_radiance', 'priest_disc_pain_suppression', 'priest_disc_rapture', 'priest_disc_evangelism', 'priest_disc_power_infusion'],
    unlock: {
      priest_disc_penance: 10, priest_disc_radiance: 15, priest_disc_pain_suppression: 12,
      priest_disc_rapture: 10, priest_disc_evangelism: 20, priest_disc_power_infusion: 14,
    },
    majors: { m45: 'priest_disc_evangelism', m90: 'priest_disc_rapture', m180: 'priest_disc_power_infusion' },
    mods: [],
    mainStat: 'int',
    defaultBar: {
      lmb: 'priest_basic', rmb: 'priest_power_word_shield', q: 'priest_disc_penance', e: 'priest_flash_heal', r: 'priest_desperate_prayer',
      s1: 'priest_disc_radiance', s2: 'priest_fade', s3: 'priest_disc_pain_suppression',
      m45: 'priest_disc_evangelism', m90: 'priest_disc_rapture', m180: 'priest_disc_power_infusion',
    },
  },

  // ---- Kutsal (HEALER): direct heals, Şifa Duası and Kutsal Söz AoE heals, Onarım Duası, İlahi Ezgi and Koruyucu Ruh majors
  priest_holy: {
    id: 'priest_holy', classId: 'priest', name: 'Kutsal', role: 'healer',
    desc: 'Kutsal Şifa: Hızlı Şifa ve Kutsal Söz ile tek hedefi, Şifa Duası ve Şifa Çemberi ile grubu ayakta tutarsın. İlahi Ezgi ve Koruyucu Ruh ile patlarsın.',
    stats: { healingPct: 0.15, castSpeed: 0.08 },
    specials: [
      { id: 'trait_holy', desc: 'Kutsal Güç: Kutsal Söz sonrası Şifa Çemberi\'nin bekleme süresi 2 sn kısalır.', params: { cdrOnHolyWord: 2 } },
    ],
    skills: ['priest_holy_prayer', 'priest_holy_serenity', 'priest_holy_sanctify', 'priest_holy_circle', 'priest_holy_mending', 'priest_holy_hymn', 'priest_holy_guardian'],
    unlock: {
      priest_holy_basic: 1, priest_holy_prayer: 10, priest_holy_serenity: 10, priest_holy_sanctify: 15, priest_holy_circle: 15,
      priest_holy_mending: 10, priest_holy_hymn: 10, priest_holy_guardian: 20,
    },
    majors: { m45: 'priest_holy_hymn', m90: 'priest_holy_guardian' },
    mods: [],
    basic: 'priest_holy_basic',
    mainStat: 'int',
    defaultBar: {
      lmb: 'priest_holy_basic', rmb: 'priest_holy_serenity', q: 'priest_holy_sanctify', e: 'priest_holy_prayer', r: 'priest_flash_heal',
      s1: 'priest_holy_circle', s2: 'priest_renew', s3: 'priest_holy_mending', s4: 'priest_desperate_prayer',
      m45: 'priest_holy_hymn', m90: 'priest_holy_guardian',
    },
  },

  // ---- Gölge (DPS): Insanity from Mind Blast and the DoTs; Boşluk Oku and Yiyici Veba spend it; Boşluk Formu and Gölge Canavarı majors
  priest_shadow: {
    id: 'priest_shadow', classId: 'priest', name: 'Gölge', role: 'dps',
    desc: 'Delilik: Zihin Patlaması ve gölge acıları Delilik biriktirir; Boşluk Oku ve Yiyici Veba ile harcarsın. Boşluk Formu ile hasarın %20 artar.',
    stats: { critChance: 0.04, damagePct: 0.05 },
    specials: [
      { id: 'trait_shadow', desc: 'Gölge Sızıntısı: gölge acıları %10 ihtimalle bir sonraki Zihin Patlaması\'nın bekleme süresini sıfırlar.', params: { mbResetChance: 0.1 } },
    ],
    skills: ['priest_shadow_mind_blast', 'priest_shadow_swp', 'priest_shadow_vt', 'priest_shadow_mind_flay', 'priest_shadow_void_bolt', 'priest_shadow_devouring', 'priest_shadow_death', 'priest_shadow_dispersion', 'priest_shadow_silence', 'priest_shadow_voidform', 'priest_shadow_fiend'],
    unlock: {
      priest_shadow_mind_blast: 10, priest_shadow_swp: 10, priest_shadow_vt: 12, priest_shadow_mind_flay: 12, priest_shadow_void_bolt: 15,
      priest_shadow_devouring: 12, priest_shadow_death: 14, priest_shadow_dispersion: 16, priest_shadow_silence: 10,
      priest_shadow_voidform: 10, priest_shadow_fiend: 20,
    },
    majors: { m45: 'priest_shadow_voidform', m90: 'priest_shadow_fiend' },
    mods: [],
    mainStat: 'int',
    defaultBar: {
      lmb: 'priest_basic', rmb: 'priest_shadow_mind_blast', q: 'priest_shadow_void_bolt', e: 'priest_shadow_swp', r: 'priest_shadow_vt',
      s1: 'priest_shadow_devouring', s2: 'priest_shadow_mind_flay', s3: 'priest_shadow_dispersion', s4: 'priest_shadow_silence',
      m45: 'priest_shadow_voidform', m90: 'priest_shadow_fiend',
    },
  },
};

/** Spec ids of this file (for the sim and the talent tree check). */
export const PRIEST_KIT_SPEC_IDS: SpecId[] = ['priest_discipline', 'priest_holy', 'priest_shadow'];
