/**
 * Spec registry (GDD_V2 §1.3). OWNER: combat (data, WP5).
 *
 * Six V2 specs of the non-mage classes (knight, barbarian, rogue). The mage specs are superseded by GDD_TALENTS
 * (mage_fire / mage_frost / mage_arcane) and live in data/specs_talents.ts (merged below, owner T8).
 * Passive `stats` are folded once by StatCalc.computeStats (with the solo-role rule, CORE_MECHANICS §1.5).
 * Skill rows of the specs live in data/skills.ts (`spec` field). Majors are in SkillDef.defaultSlot m45/m90/m180.
 *
 * `mods` only lists changes the runtime applies: `patch` (cooldown, cost, statuses) and `params.threat` / `params.threatMult`
 * (the GDD §1.4 threat formula reads them). Everything else in the design text is still open (see the WP5 report).
 */
import type { RoleId, SpecDef, SpecId } from '../types/v2';
import type { StatBlock } from '../types/stats';
import type { ClassId } from '../types/common';
import { TALENT_SPECS } from './specs_talents';

const SPEC_LIST: SpecDef[] = [
  // ---------------------------------------------------------------- Şövalye
  {
    id: 'knight_protector', classId: 'knight', name: 'Koruyucu', role: 'tank',
    desc: 'Kalkan Kaldır ve Yemin Siperi ile aktif azaltma. Tehdit ×3.0, kendi hasarı düşük.',
    stats: { maxHpPct: 0.30, armorPct: 0.40, blockChance: 0.15, blockAmount: 0.10, threatPct: 2.0, damagePct: -0.25, parryWindow: 0.07 },
    specials: [
      { id: 'protector_cheat', desc: '90 saniyede bir ölümcül darbe canını %15\'e indirir ve 1.5 saniye dokunulmazlık verir (Son Savunma).', params: { cooldown: 90, hpLeft: 0.15, invul: 1.5 } },
    ],
    skills: ['knight_provoke', 'knight_shield_block', 'knight_ward_of_oath', 'knight_unbroken_bastion', 'knight_oath_aegis'],
    unlock: { knight_provoke: 10, knight_shield_block: 10, knight_unbroken_bastion: 10, knight_ward_of_oath: 15, knight_oath_aegis: 20 },
    majors: { m45: 'knight_unbroken_bastion', m90: 'knight_oath_aegis' },
    mods: [
      { skill: 'knight_shield_bash', patch: { cooldown: 2.5 }, params: { threat: 300 } },
      { skill: 'knight_radiant_cleave', patch: { cost: 25 }, params: { threatMult: 1.5 } },
      { skill: 'knight_challenge', patch: { cooldown: 12 }, params: { threat: 50 } },
      { skill: 'knight_heavens_judgment', params: { threat: 150 } },
    ],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_shield_bash', q: 'knight_provoke', e: 'knight_radiant_cleave', s1: 'knight_challenge',
      s2: 'knight_shield_block', s3: 'knight_ward_of_oath', r: 'knight_heavens_judgment',
      m45: 'knight_unbroken_bastion', m90: 'knight_oath_aegis',
    },
  },
  {
    id: 'knight_blademaster', classId: 'knight', name: 'Kılıç Ustası', role: 'dps',
    desc: 'Adalet Puanı biriktirip Karar Darbesi ile bitirir. Kahramanlık Çağrısı sahibi.',
    stats: { attackSpeed: 0.10, holyDamagePct: 0.25, critChance: 0.05, meleeDamagePct: 0.10 },
    specials: [{ id: 'blademaster_pips', desc: 'Adalet Puanı (0–5): Kutsal Alev Dalgası biriktirir, Karar Darbesi harcar.', params: { max: 5 } }],
    skills: ['knight_templar_verdict', 'knight_wake_of_flames', 'knight_zeal', 'knight_wings_of_judgment', 'knight_heroism_call'],
    unlock: { knight_templar_verdict: 10, knight_zeal: 10, knight_wake_of_flames: 15, knight_wings_of_judgment: 20, knight_heroism_call: 30 },
    majors: { m45: 'knight_zeal', m90: 'knight_wings_of_judgment', m180: 'knight_heroism_call' },
    mods: [
      // Savaş Çağrısı: no taunt, enemies deal less damage (curse -20% stands in for -10%), the caster takes -20% (fortify, base row)
      { skill: 'knight_challenge', patch: { statuses: [{ status: 'curse', duration: 6 }] } },
    ],
    defaultBar: {
      lmb: 'knight_basic', rmb: 'knight_templar_verdict', q: 'knight_charge', e: 'knight_radiant_cleave', s1: 'knight_wake_of_flames',
      s2: 'knight_consecration', s3: 'knight_shield_bash', r: 'knight_heavens_judgment',
      m45: 'knight_zeal', m90: 'knight_wings_of_judgment', m180: 'knight_heroism_call',
    },
  },
  // ---------------------------------------------------------------- Barbar
  {
    id: 'barbarian_warlord', classId: 'barbarian', name: 'Savaş Lordu', role: 'tank',
    desc: 'Öfke zırhı: hasar aldıkça güçlenir. Demir Duruş ve Kan Zırhı ile aktif savunma.',
    stats: { maxHpPct: 0.30, armorPct: 0.35, lifeSteal: 0.02, threatPct: 1.5, damagePct: -0.25 },
    specials: [{ id: 'warlord_rage_armor', desc: 'Her 1 Öfke puanı için aldığın hasar %0.25 azalır (en fazla %25).', params: { perPoint: 0.0025, max: 0.25 } }],
    skills: ['barbarian_provoke', 'barbarian_iron_stance', 'barbarian_blood_shield', 'barbarian_last_stand', 'barbarian_rallying_roar'],
    unlock: { barbarian_provoke: 10, barbarian_iron_stance: 10, barbarian_blood_shield: 15, barbarian_last_stand: 10, barbarian_rallying_roar: 20 },
    majors: { m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar' },
    mods: [
      { skill: 'barbarian_cleave', params: { threatMult: 1.5 } },
      { skill: 'barbarian_whirlwind', params: { threatMult: 2.0 } },
      // Savaş Narası also taunts 3 s (fear stays 1.5 s), cooldown 16 s
      { skill: 'barbarian_war_cry', patch: { cooldown: 16, statuses: [{ status: 'fear', duration: 1.5 }, { status: 'taunt', duration: 3 }] } },
      { skill: 'barbarian_ancestral_tempest', params: { threatMult: 2.0 } },
    ],
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_cleave', q: 'barbarian_provoke', e: 'barbarian_whirlwind', s1: 'barbarian_war_cry',
      s2: 'barbarian_iron_stance', s3: 'barbarian_blood_shield', r: 'barbarian_ancestral_tempest',
      m45: 'barbarian_last_stand', m90: 'barbarian_rallying_roar',
    },
  },
  {
    id: 'barbarian_butcher', classId: 'barbarian', name: 'Kasap', role: 'dps',
    desc: 'Kanama yığınları ve İdam. Kurt Narası sahibi.',
    stats: { bleedDamagePct: 0.40, bleedChance: 0.15, executeDamagePct: 0.40, attackSpeed: 0.05, resourceGainPct: 0.20 },
    specials: [{ id: 'butcher_bleed_cap', desc: 'Kanama yığın sınırı 8 olur (sınır verisi; motor 5 ile çalışır).', params: { cap: 8 } }],
    skills: ['barbarian_rend', 'barbarian_execute', 'barbarian_bloodbath', 'barbarian_carnage', 'barbarian_wolf_howl'],
    unlock: { barbarian_rend: 10, barbarian_execute: 15, barbarian_bloodbath: 10, barbarian_carnage: 20, barbarian_wolf_howl: 30 },
    majors: { m45: 'barbarian_bloodbath', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl' },
    mods: [],
    defaultBar: {
      lmb: 'barbarian_basic', rmb: 'barbarian_rend', q: 'barbarian_leap', e: 'barbarian_whirlwind', s1: 'barbarian_execute',
      s2: 'barbarian_fissure', s3: 'barbarian_axe_throw', r: 'barbarian_ancestral_tempest',
      m45: 'barbarian_bloodbath', m90: 'barbarian_carnage', m180: 'barbarian_wolf_howl',
    },
  },
  // ---------------------------------------------------------------- Haydut
  {
    id: 'rogue_assassin', classId: 'rogue', name: 'Suikastçı', role: 'dps',
    desc: 'Gizlilik açılışları, arkadan vuruş ve Gölge Dansı. Düşük tehdit.',
    stats: { critChance: 0.06, critDamage: 0.20, attackSpeed: 0.05, parryWindow: 0.04, resourceRegenPct: 0.17, threatPct: -0.2 },
    specials: [
      { id: 'assassin_vanish', desc: 'Gölge Adımı tehdidinin %50\'sini düşürür (veri; tehdit kancası WP4).', params: { threatDown: 0.5 } },
      { id: 'assassin_opener', desc: 'Gizlilik açılış bonusu +%80, arkadan vuruş +%60 (Sırttan Bıçak gizlilikte ×1.8).', params: { openerMore: 0.8, backstabMore: 0.6 } },
    ],
    skills: ['rogue_backstab', 'rogue_garrote', 'rogue_shadow_blades', 'rogue_shadow_dance'],
    unlock: { rogue_backstab: 10, rogue_garrote: 15, rogue_shadow_blades: 10, rogue_shadow_dance: 20 },
    majors: { m45: 'rogue_shadow_blades', m90: 'rogue_shadow_dance' },
    mods: [],
    defaultBar: {
      lmb: 'rogue_basic', rmb: 'rogue_crossbow_shot', q: 'rogue_shadow_step', e: 'rogue_backstab', s1: 'rogue_eviscerate',
      s2: 'rogue_garrote', s3: 'rogue_smoke_bomb', r: 'rogue_death_blossom',
      m45: 'rogue_shadow_blades', m90: 'rogue_shadow_dance',
    },
  },
  {
    id: 'rogue_alchemist', classId: 'rogue', name: 'Simyacı', role: 'healer',
    desc: 'Seyyar şifacı: şişe bombaları, panzehir ve Karışım Puanı. Hızlandırıcı İksir sahibi.',
    stats: { healingPct: 0.25, damagePct: -0.40, resourceRegenPct: 0.33, moveSpeedPct: 0.05 },
    specials: [{ id: 'alchemist_overheal', desc: 'Taşan şifa: fazla şifa 4 saniye boyunca +%10 şifa gücü verir (en fazla %40, yığılır).', params: { perStack: 0.10, cap: 0.40, dur: 4 } }],
    skills: ['rogue_vial_throw', 'rogue_vial_heal', 'rogue_antidote', 'rogue_smoke_ward', 'rogue_mending_draught'],
    unlock: { rogue_vial_throw: 1, rogue_vial_heal: 10, rogue_antidote: 15, rogue_smoke_ward: 15, rogue_mending_draught: 20, rogue_elixir_of_life: 10, rogue_miracle_brew: 20, rogue_haste_elixir: 30 },
    majors: { m45: 'rogue_elixir_of_life', m90: 'rogue_miracle_brew', m180: 'rogue_haste_elixir' },
    basic: 'rogue_vial_throw',
    mods: [],
    defaultBar: {
      lmb: 'rogue_vial_throw', rmb: 'rogue_vial_heal', q: 'rogue_shadow_step', e: 'rogue_smoke_ward', s1: 'rogue_antidote',
      s2: 'rogue_mending_draught', s3: 'rogue_fan_of_knives', r: 'rogue_death_blossom',
      m45: 'rogue_elixir_of_life', m90: 'rogue_miracle_brew', m180: 'rogue_haste_elixir',
    },
  },
];

/** Non-mage spec registry plus the GDD_TALENTS mage specs (merged in; T8 fills TALENT_SPECS). */
export const SPECS: Partial<Record<SpecId, SpecDef>> = {};
for (const s of SPEC_LIST) SPECS[s.id] = s;
Object.assign(SPECS, TALENT_SPECS);

/** Spec definition by id; undefined while the registry is empty or the id is unknown. */
export function getSpec(id: SpecId | null | undefined): SpecDef | undefined {
  return id ? SPECS[id] : undefined;
}

/** Spec ids of a class in registry order (knight: protector, blademaster). */
export function specsForClass(classId: ClassId): SpecId[] {
  return (Object.values(SPECS) as SpecDef[]).filter((s) => s.classId === classId).map((s) => s.id);
}

/** Passive stat block of a spec (empty for an unknown id). Folded additively by Player.refreshStats. */
export function specStatBlock(id: SpecId | null | undefined): StatBlock {
  return getSpec(id)?.stats ?? {};
}

/**
 * CORE_MECHANICS §2 (CM1): role overrides for specs whose SpecDef is not registered yet (Kemik Ustası has no row, so its role
 * lives here). `necromancer_bone` = tank (Blood Death Knight style). The six new CM1 spec ids follow the §2 table
 * (coverage: 6 tanks, 4 healers, 16 DPS + 1 support). Once a SpecDef exists its own `role` wins.
 */
export const SPEC_ROLE_OVERRIDES: Partial<Record<SpecId, RoleId>> = {
  necromancer_bone: 'tank',
  demonhunter_chaos: 'dps',
  demonhunter_vengeance: 'tank',
  evoker_devastation: 'dps',
  evoker_preservation: 'healer',
  evoker_augmentation: 'dps',
  rogue_subtlety: 'dps',
};

/**
 * CORE_MECHANICS §2 (CM1): Turkish names of the six new spec ids (compile-only stubs; no SpecDef rows until the CM10 / CM12 kits).
 * Not read by the runtime yet.
 */
export const NEW_SPEC_NAMES_TR: Partial<Record<SpecId, { classId: ClassId; name: string }>> = {
  demonhunter_chaos: { classId: 'demonhunter', name: 'Kaos' },
  demonhunter_vengeance: { classId: 'demonhunter', name: 'İntikam' },
  evoker_devastation: { classId: 'evoker', name: 'Yıkım Nefesi' },
  evoker_preservation: { classId: 'evoker', name: 'Koruyucu Nefes' },
  evoker_augmentation: { classId: 'evoker', name: 'Yüceltme' },
  rogue_subtlety: { classId: 'rogue', name: 'Gölge' },
};

/** Role of a spec: its SpecDef.role when registered, else SPEC_ROLE_OVERRIDES (undefined for unknown ids). */
export function specRole(id: SpecId | null | undefined): RoleId | undefined {
  if (!id) return undefined;
  return getSpec(id)?.role ?? SPEC_ROLE_OVERRIDES[id];
}
