/**
 * KIT Druid StatusDefs and STATUS_RULES, merged into STATUSES / STATUS_RULES by data/statuses.ts. OWNER: druid kit.
 *
 * Shapeshift forms are statuses (combat/Forms.ts): their `stats` are the armour / health / speed modifiers of the form. Midnight (12.0)
 * numbers where the design gives them: Eclipse is an ACTIVE 15 s window (Güneş Gazabı +40 % under Solar, Yıldız Ateşi +40 % under Lunar,
 * SkillDef.whileStatusMult), Mastery: Harmony counts up to 5 HoTs (behaviors_druid.ts), Bear Ironfur stacks, Frenzied Regeneration is a
 * 3 s heal over time. DoTs carry `dotType`; the applying skill gives the magnitude (damage coefficient of the whole DoT).
 */
import type { StatusDef, StatusId } from '../types/skills';
import type { StatusRule } from './statuses';

const I = (n: string) => `/assets/icons/${n}.svg`;

export const STATUSES_KIT_DRUID: Partial<Record<StatusId, StatusDef>> = {
  // ---- forms (Forms.ts): permanent until left; the stats are the form's passive
  form_moonkin: { id: 'form_moonkin', name: 'Ay Baykuşu Biçimi', icon: I('skill-arcane-orb'), kind: 'buff', stats: { armorPct: 0.6, castSpeed: 0.05, critChance: 0.02 } },
  form_cat: { id: 'form_cat', name: 'Kedi Biçimi', icon: I('skill-claw-strike'), kind: 'buff', stats: { moveSpeedPct: 0.12, critChance: 0.04, dodgeChance: 0.05, armorPct: 0.1 } },
  form_bear: { id: 'form_bear', name: 'Ayı Biçimi', icon: I('skill-iron-skin'), kind: 'buff', stats: { armorPct: 1.0, maxHpPct: 0.25, threatPct: 0.5, damageReductionPct: 0.05 } },
  form_travel: { id: 'form_travel', name: 'Yolcu Biçimi', icon: I('skill-dash'), kind: 'buff', stats: { moveSpeedPct: 0.4 } },

  // ---- Denge
  eclipse_solar: { id: 'eclipse_solar', name: 'Güneş Tutulması', icon: I('skill-fire-nova'), kind: 'buff', vfx: 'buff_aura' },
  eclipse_lunar: { id: 'eclipse_lunar', name: 'Ay Tutulması', icon: I('skill-arcane-missiles'), kind: 'buff', vfx: 'buff_aura' },
  celestial_alignment: { id: 'celestial_alignment', name: 'Göksel Hizalanma', icon: I('skill-meteor'), kind: 'buff', stats: { castSpeed: 0.1, damagePct: 0.1 }, vfx: 'buff_aura' },
  moonfire: { id: 'moonfire', name: 'Ay Ateşi', icon: I('debuff-curse'), kind: 'debuff', dotType: 'arcane' },
  sunfire: { id: 'sunfire', name: 'Güneş Ateşi', icon: I('debuff-burn'), kind: 'debuff', dotType: 'fire' },

  // ---- Vahşi
  rake: { id: 'rake', name: 'Tırmık', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical' },
  rip: { id: 'rip', name: 'Parçalama', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical' },
  thrash: { id: 'thrash', name: 'Çırpınma', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical' },
  feral_fury: { id: 'feral_fury', name: 'Pars Öfkesi', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.15 } },
  berserk: { id: 'berserk', name: 'Vahşileşme', icon: I('skill-berserk'), kind: 'buff', stats: { costReductionPct: 0.4, attackSpeed: 0.1, moveSpeedPct: 0.1 }, vfx: 'enrage_aura' },
  cat_dash: { id: 'cat_dash', name: 'Atılma', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.6 } },

  // ---- Koruyucu
  ironfur: { id: 'ironfur', name: 'Demir Post', icon: I('buff-defense'), kind: 'buff', maxStacks: 4, stats: { armorPct: 0.25 } },
  barkskin: { id: 'barkskin', name: 'Meşe Kabuğu', icon: I('skill-iron-skin'), kind: 'buff', stats: { armorPct: 0.3 } },
  frenzied: { id: 'frenzied', name: 'Çılgın Yenilenme', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  survival_instincts: { id: 'survival_instincts', name: 'Hayatta Kalma İçgüdüsü', icon: I('buff-invulnerable'), kind: 'buff' },
  sleeper_rage: { id: 'sleeper_rage', name: 'Uyuyanın Öfkesi', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.25, maxHpPct: 0.15 }, vfx: 'enrage_aura' },

  // ---- Restorasyon: HoTs (magnitude = HP per second, the `hot` rule ticks it)
  rejuvenation: { id: 'rejuvenation', name: 'Gençleşme', icon: I('skill-renew'), kind: 'buff', vfx: 'heal_loop' },
  regrowth: { id: 'regrowth', name: 'Yeniden Büyüme', icon: I('skill-regeneration'), kind: 'buff', vfx: 'heal_loop' },
  lifebloom: { id: 'lifebloom', name: 'Yaşam Çiçeği', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  wild_growth: { id: 'wild_growth', name: 'Yabani Büyüme', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  ironbark: { id: 'ironbark', name: 'Demir Kabuk', icon: I('skill-iron-skin'), kind: 'buff' },
  omen_clarity: { id: 'omen_clarity', name: 'Berraklık Alameti', icon: I('buff-mana-regen'), kind: 'buff' },
};

export const STATUS_RULES_KIT_DRUID: Partial<Record<StatusId, StatusRule>> = {
  form_moonkin: { stack: 'refresh' },
  form_cat: { stack: 'refresh' },
  form_bear: { stack: 'refresh' },
  form_travel: { stack: 'refresh' },
  eclipse_solar: { stack: 'refresh' },
  eclipse_lunar: { stack: 'refresh' },
  celestial_alignment: { stack: 'refresh' },
  moonfire: { stack: 'strongest' }, // dps snapshot: a stronger re-application wins, the timer takes the longer
  sunfire: { stack: 'strongest' }, // dps snapshot: a stronger re-application wins, the timer takes the longer
  rake: { stack: 'strongest' }, // dps snapshot: a stronger re-application wins, the timer takes the longer
  rip: { stack: 'strongest' }, // dps snapshot: a stronger re-application wins, the timer takes the longer
  thrash: { stack: 'strongest' }, // dps snapshot: a stronger re-application wins, the timer takes the longer
  feral_fury: { stack: 'refresh' },
  berserk: { stack: 'refresh' },
  cat_dash: { stack: 'refresh' },
  ironfur: { stack: 'stack' },
  barkskin: { stack: 'refresh', takenMore: -0.2 },
  frenzied: { stack: 'refresh', hot: true },
  survival_instincts: { stack: 'refresh', takenMore: -0.5 },
  sleeper_rage: { stack: 'refresh', takenMore: -0.15 },
  rejuvenation: { stack: 'refresh', hot: true, pandemic: 0.3 },
  regrowth: { stack: 'refresh', hot: true, pandemic: 0.3 },
  lifebloom: { stack: 'refresh', hot: true, pandemic: 0.3 },
  wild_growth: { stack: 'refresh', hot: true },
  ironbark: { stack: 'refresh', takenMore: -0.2 },
  omen_clarity: { stack: 'refresh' },
};
