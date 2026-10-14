import { SKILLS } from '../data/skills';
import type { SkillDef, SkillTargeting } from '../types/skills';
import type { ClassId, DamageType } from '../types/common';
import type { VfxId } from '../types/vfx';

/**
 * Charged heavy, riposte and Kritik Vuruş (GDD_V2 §3.2, §3.5, §3.7) as data. They are registered as SkillDefs under
 * `<class>_basic_<kind>` ids (so remote peers replay them through the normal 'cast' channel and the skill book keeps
 * ignoring them: `classSkillIds` skips `_basic` ids). Timings are CLIP seconds (the AnimController clock) unless noted.
 * OWNER: combat module (data).
 */

export interface SwingProfile {
  classId: ClassId;
  id: string;                 // SkillDef id
  name: string;               // Turkish
  anim: string;               // KayKit clip
  animSpeed: number;
  hitTime: number;            // clip s of the impact
  endTime: number;            // clip s of the recovery end
  range: number;
  arc: number;
  coef: number;
  type: DamageType;
  poise: number;              // poise damage (GDD_V2 §3.7)
  knockback: number;
  targeting: SkillTargeting;
  /** projectile heavies / riposte casts */
  projectile?: { speed: number; radius: number; pierce: number; vfx: VfxId };
}

export interface ChargeProfile extends SwingProfile {
  /** clip s where the charge pose freezes (GDD "hold at"). */
  holdFrame: number;
  /** weapon art of the tier-2 release (`WEAPON_ARTS` id). */
  art: string;
}

const ICON = '/assets/icons/skill-sword-slash.svg';

/** Tier 1 = Ağır Vuruş (hold >= the threshold, release < 0.75 s); tier 2 = the class weapon art (held >= 0.75 s). */
export const HEAVY_BY_CLASS: Partial<Record<ClassId, ChargeProfile>> = {
  knight: {
    classId: 'knight', id: 'knight_basic_heavy', name: 'Ağır Darbe', anim: '1H_Melee_Attack_Chop', animSpeed: 1.15,
    holdFrame: 0.18, hitTime: 0.448, endTime: 0.85, range: 3.2, arc: 100, coef: 2.6, type: 'physical', poise: 30, knockback: 1.6,
    targeting: 'melee_arc', art: 'wa_rising_blade',
  },
  barbarian: {
    classId: 'barbarian', id: 'barbarian_basic_heavy', name: 'Kafa Yaran', anim: '2H_Melee_Attack_Chop', animSpeed: 1.0,
    holdFrame: 0.2, hitTime: 0.45, endTime: 0.9, range: 3.6, arc: 120, coef: 3.2, type: 'physical', poise: 40, knockback: 2.5,
    targeting: 'melee_arc', art: 'wa_earthbreaker',
  },
  mage: {
    classId: 'mage', id: 'mage_basic_heavy', name: 'Yüklü Gizem Oku', anim: 'Spellcast_Shoot', animSpeed: 1.0,
    holdFrame: 0.3, hitTime: 0.5, endTime: 0.8, range: 0, arc: 0, coef: 2.8, type: 'arcane', poise: 18, knockback: 0,
    targeting: 'projectile', projectile: { speed: 28, radius: 0.7, pierce: 2, vfx: 'arcane_projectile' }, art: 'wa_starfall_beam',
  },
  rogue: {
    classId: 'rogue', id: 'rogue_basic_heavy', name: 'Delici Hamle', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.0,
    holdFrame: 0.15, hitTime: 0.4, endTime: 0.7, range: 2.8, arc: 60, coef: 3.0, type: 'physical', poise: 24, knockback: 0.5,
    targeting: 'melee_arc', art: 'wa_flurry',
  },
};

/** Riposte (Karşı Vuruş) after a parry: forced crit, poise (GDD_V2 §3.5). */
export const RIPOSTE_BY_CLASS: Partial<Record<ClassId, SwingProfile>> = {
  knight: { classId: 'knight', id: 'knight_basic_riposte', name: 'Kutsal Karşılık', anim: '1H_Melee_Attack_Stab', animSpeed: 1.3, hitTime: 0.35, endTime: 0.7, range: 3.5, arc: 90, coef: 3.5, type: 'physical', poise: 60, knockback: 0.5, targeting: 'melee_arc' },
  barbarian: { classId: 'barbarian', id: 'barbarian_basic_riposte', name: 'Kemik Kıran', anim: '2H_Melee_Attack_Chop', animSpeed: 1.1, hitTime: 0.4, endTime: 0.8, range: 3.5, arc: 120, coef: 4.0, type: 'physical', poise: 70, knockback: 1.0, targeting: 'melee_arc' },
  mage: { classId: 'mage', id: 'mage_basic_riposte', name: 'Karşı Büyü', anim: 'Spellcast_Shoot', animSpeed: 1.2, hitTime: 0.3, endTime: 0.6, range: 0, arc: 0, coef: 3.0, type: 'arcane', poise: 40, knockback: 0, targeting: 'projectile', projectile: { speed: 30, radius: 0.5, pierce: 0, vfx: 'arcane_projectile' } },
  rogue: { classId: 'rogue', id: 'rogue_basic_riposte', name: 'Gölge Karşılığı', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.3, hitTime: 0.3, endTime: 0.6, range: 3.5, arc: 60, coef: 4.0, type: 'physical', poise: 50, knockback: 0, targeting: 'melee_arc' },
};

/** Kritik Vuruş (finisher on a poise-broken / marked enemy): the class heavy clip at x1.3 (GDD_V2 §3.7). */
export const KRT_BY_CLASS: Partial<Record<ClassId, SwingProfile>> = {
  knight: { classId: 'knight', id: 'knight_basic_krt', name: 'Kritik Vuruş', anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.2, endTime: 0.55, range: 3.2, arc: 180, coef: 5.0, type: 'physical', poise: 0, knockback: 0, targeting: 'melee_arc' },
  barbarian: { classId: 'barbarian', id: 'barbarian_basic_krt', name: 'Kritik Vuruş', anim: '2H_Melee_Attack_Chop', animSpeed: 1.3, hitTime: 0.2, endTime: 0.55, range: 3.2, arc: 180, coef: 5.0, type: 'physical', poise: 0, knockback: 0, targeting: 'melee_arc' },
  mage: { classId: 'mage', id: 'mage_basic_krt', name: 'Kritik Vuruş', anim: 'Spellcast_Shoot', animSpeed: 1.3, hitTime: 0.2, endTime: 0.55, range: 3.2, arc: 180, coef: 5.0, type: 'arcane', poise: 0, knockback: 0, targeting: 'melee_arc' },
  rogue: { classId: 'rogue', id: 'rogue_basic_krt', name: 'Kritik Vuruş', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.3, hitTime: 0.2, endTime: 0.55, range: 3.2, arc: 180, coef: 5.0, type: 'physical', poise: 0, knockback: 0, targeting: 'melee_arc' },
};

/**
 * Guard counter (Siper Karşılığı, GDD_V2 §3.4): LMB while the guard stance is up and an enemy is in reach. A quick bash that
 * spends `GUARD_COUNTER_COST` gauge (a break from it drops the guard like a blocked break). Only classes with a sustained guard.
 */
export const GUARD_COUNTER_BY_CLASS: Partial<Record<ClassId, SwingProfile>> = {
  knight: { classId: 'knight', id: 'knight_basic_counter', name: 'Siper Karşılığı', anim: 'Block_Attack', animSpeed: 1.5, hitTime: 0.22, endTime: 0.5, range: 2.4, arc: 90, coef: 1.2, type: 'physical', poise: 30, knockback: 0.8, targeting: 'melee_arc' },
  barbarian: { classId: 'barbarian', id: 'barbarian_basic_counter', name: 'Siper Karşılığı', anim: '2H_Melee_Attack_Chop', animSpeed: 1.6, hitTime: 0.2, endTime: 0.46, range: 2.4, arc: 90, coef: 1.2, type: 'physical', poise: 30, knockback: 0.8, targeting: 'melee_arc' },
};
/** Guard gauge spent by one guard counter, and the lockout between two of them (s). */
export const GUARD_COUNTER_COST = 10;
export const GUARD_COUNTER_CD = 0.6;

// Paladin (PM-PA): the knight's sword-and-shield moveset under its own ids (remote replays and the combo routes look up by id); the
// tier-2 heavy is the mace art (wa_crushing_blow), the class weapon is a mace.
{
  const kn = HEAVY_BY_CLASS.knight!;
  HEAVY_BY_CLASS.paladin = { ...kn, classId: 'paladin', id: 'paladin_basic_heavy', name: 'Kutsal Ağır Darbe', art: 'wa_crushing_blow' };
  RIPOSTE_BY_CLASS.paladin = { ...RIPOSTE_BY_CLASS.knight!, classId: 'paladin', id: 'paladin_basic_riposte', name: 'Kutsal Karşılık' };
  KRT_BY_CLASS.paladin = { ...KRT_BY_CLASS.knight!, classId: 'paladin', id: 'paladin_basic_krt' };
  GUARD_COUNTER_BY_CLASS.paladin = { ...GUARD_COUNTER_BY_CLASS.knight!, classId: 'paladin', id: 'paladin_basic_counter' };
}

// Warlock / Nekromant (WP-01): no guard, so the Mage's staff-and-tome moveset (projectile heavy and riposte, arcane KRT) under their own
// ids, typed shadow. The tier-2 heavy keeps the staff art (wa_starfall_beam).
{
  const mg = HEAVY_BY_CLASS.mage!;
  HEAVY_BY_CLASS.warlock = { ...mg, classId: 'warlock', id: 'warlock_basic_heavy', name: 'Yüklü Lanet Oku', type: 'shadow' };
  RIPOSTE_BY_CLASS.warlock = { ...RIPOSTE_BY_CLASS.mage!, classId: 'warlock', id: 'warlock_basic_riposte', name: 'Karşı Lanet', type: 'shadow' };
  KRT_BY_CLASS.warlock = { ...KRT_BY_CLASS.mage!, classId: 'warlock', id: 'warlock_basic_krt', type: 'shadow' };
  HEAVY_BY_CLASS.necromancer = { ...mg, classId: 'necromancer', id: 'necro_basic_heavy', name: 'Yüklü Kemik Mızrağı', type: 'shadow' };
  RIPOSTE_BY_CLASS.necromancer = { ...RIPOSTE_BY_CLASS.mage!, classId: 'necromancer', id: 'necro_basic_riposte', name: 'Kemik Karşılığı', type: 'shadow' };
  KRT_BY_CLASS.necromancer = { ...KRT_BY_CLASS.mage!, classId: 'necromancer', id: 'necro_basic_krt', type: 'shadow' };
}

// WP-02 Keşiş (GDD_CLASSES_V2 §2.4 / §2.6 / §4.3): the fist heavy "Ejder Yumruğu" (cross, hit 0.50), "Çi Karşılığı" riposte (poise 55,
// +2 Çi on the forced crit), the palm KRT and the hand-guard counter; tier 2 = the fist art wa_tiger_barrage.
{
  const bb = HEAVY_BY_CLASS.barbarian!;
  HEAVY_BY_CLASS.monk = {
    ...bb, classId: 'monk', id: 'monk_basic_heavy', name: 'Ejder Yumruğu', anim: 'Unarmed_Melee_Attack_Punch_B', animSpeed: 1.2,
    holdFrame: 0.18, hitTime: 0.5, endTime: 0.9, range: 3.0, arc: 100, coef: 2.6, type: 'physical', poise: 30, knockback: 1.6,
    targeting: 'melee_arc', art: 'wa_tiger_barrage',
  };
  RIPOSTE_BY_CLASS.monk = {
    classId: 'monk', id: 'monk_basic_riposte', name: 'Çi Karşılığı', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.3, hitTime: 0.35, endTime: 0.7,
    range: 2.8, arc: 90, coef: 3.5, type: 'physical', poise: 55, knockback: 0.5, targeting: 'melee_arc',
  };
  KRT_BY_CLASS.monk = {
    classId: 'monk', id: 'monk_basic_krt', name: 'Kritik Vuruş', anim: 'Unarmed_Melee_Attack_Kick', animSpeed: 1.3, hitTime: 0.2, endTime: 0.55,
    range: 3.0, arc: 180, coef: 5.0, type: 'physical', poise: 0, knockback: 0, targeting: 'melee_arc',
  };
  GUARD_COUNTER_BY_CLASS.monk = {
    classId: 'monk', id: 'monk_basic_counter', name: 'Siper Karşılığı', anim: 'Unarmed_Melee_Attack_Punch_A', animSpeed: 1.6, hitTime: 0.22, endTime: 0.5,
    range: 2.4, arc: 90, coef: 1.2, type: 'physical', poise: 30, knockback: 0.8, targeting: 'melee_arc',
  };
}

// WP-02 Okçu (GDD_CLASSES_V2 §3.3 / §3.6): "Yüklü Ok" (hold the aim, release the shot, pierce 2) and the backstep riposte
// "Gölge Adımı Atışı" (point-blank piercing arrow, poise 45, forced crit). Tier 2 = the bow art wa_piercing_bolt (crossbow family).
{
  HEAVY_BY_CLASS.archer = {
    classId: 'archer', id: 'archer_basic_heavy', name: 'Yüklü Ok', anim: '2H_Ranged_Shoot', animSpeed: 1.0,
    holdFrame: 0.3, hitTime: 0.32, endTime: 0.8, range: 0, arc: 0, coef: 3.0, type: 'physical', poise: 24, knockback: 0.6,
    targeting: 'projectile', projectile: { speed: 70, radius: 0.4, pierce: 2, vfx: 'arrow_projectile' }, art: 'wa_piercing_bolt',
  };
  RIPOSTE_BY_CLASS.archer = {
    classId: 'archer', id: 'archer_basic_riposte', name: 'Gölge Adımı Atışı', anim: '2H_Ranged_Shoot', animSpeed: 1.2, hitTime: 0.3, endTime: 0.6,
    range: 3.0, arc: 0, coef: 3.5, type: 'physical', poise: 45, knockback: 0.5, targeting: 'projectile',
    projectile: { speed: 60, radius: 0.4, pierce: 99, vfx: 'arrow_projectile' },
  };
}

// AE-3 / AE-4: İblis Avcısı = the Rogue's dual-glaive moveset under its own ids (typed shadow, tier-2 art wa_flurry); Ejderhasoy = the Mage's
// staff moveset (frost, tier-2 art wa_starfall_beam).
{
  HEAVY_BY_CLASS.demonhunter = { ...HEAVY_BY_CLASS.rogue!, classId: 'demonhunter', id: 'demonhunter_basic_heavy', name: 'Fel Delici Hamle', type: 'shadow' };
  RIPOSTE_BY_CLASS.demonhunter = { ...RIPOSTE_BY_CLASS.rogue!, classId: 'demonhunter', id: 'demonhunter_basic_riposte', name: 'Kör Karşılık', type: 'shadow' };
  KRT_BY_CLASS.demonhunter = { ...KRT_BY_CLASS.rogue!, classId: 'demonhunter', id: 'demonhunter_basic_krt', type: 'shadow' };
  HEAVY_BY_CLASS.evoker = { ...HEAVY_BY_CLASS.mage!, classId: 'evoker', id: 'evoker_basic_heavy', name: 'Yüklü Ejder Nefesi', type: 'frost' };
  RIPOSTE_BY_CLASS.evoker = { ...RIPOSTE_BY_CLASS.mage!, classId: 'evoker', id: 'evoker_basic_riposte', name: 'Karşı Nefes', type: 'frost' };
  KRT_BY_CLASS.evoker = { ...KRT_BY_CLASS.mage!, classId: 'evoker', id: 'evoker_basic_krt', type: 'frost' };
}

/** Weapon art (tier 2) ids per class (WEAPON_ARTS). */
export function weaponArtVfx(artId: string): VfxId {
  return `weapon_art_${artId}` as VfxId;
}

function toSkillDef(p: SwingProfile): SkillDef {
  const proj = p.projectile;
  return {
    id: p.id, classId: p.classId, name: p.name, desc: p.name, icon: ICON, unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0,
    anim: p.anim, animSpeed: p.animSpeed, hitTime: p.hitTime, targeting: p.targeting, range: p.range || undefined, arc: p.arc || undefined,
    speed: proj?.speed, radius: proj?.radius, pierce: proj?.pierce,
    damage: { coef: p.coef, type: p.type }, knockback: p.knockback,
    tags: p.targeting === 'projectile' ? ['spell', 'projectile', 'heavy'] : ['melee', 'heavy'],
    vfx: proj ? { projectile: proj.vfx } : { trail: 'slash_arc_big' },
    sfx: { cast: 'swing_heavy' },
    params: { end: p.endTime, weight: 2, stagger: p.poise, move: 0.1 },
  } as SkillDef;
}

/** Every synthetic heavy / riposte / finisher def, merged into the shared registry (remote replays look them up by id). */
export const HEAVY_SKILLS: Record<string, SkillDef> = {};
for (const table of [HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS, GUARD_COUNTER_BY_CLASS] as const) {
  for (const p of Object.values(table)) {
    if (!p) continue;
    HEAVY_SKILLS[p.id] = toSkillDef(p);
  }
}
Object.assign(SKILLS, HEAVY_SKILLS);
