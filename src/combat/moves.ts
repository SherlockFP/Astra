import { SKILLS } from '../data/skills';
import type { SkillDef } from '../types/skills';
import type { ClassId, DamageType } from '../types/common';
import type { VfxId } from '../types/vfx';
import { FEEL_TABLE, vfxScale } from './feel';
import { behaviorFor, type Behavior } from './skills/behaviors';

/**
 * Running, jump and roll attacks (GDD_V2 §3.3). Each is a free LMB action that replaces the chain step it is triggered from:
 *  - run   : moving at >= 85% move speed for 0.45 s, LMB. Lunge, then the chain continues at step 2.
 *  - jump  : airborne >= 0.12 s, LMB. The hit lands on landing (AoE r) with +25% when the air time was >= 0.4 s. 1.0 s cooldown.
 *            Mage: a 3-bolt volley fired in the air instead.
 *  - roll  : LMB from 0.30 s into a dodge roll, once per roll. The chain continues at step 3.
 * Registered as SkillDefs with `<class>_basic_<kind>` ids (remote peers replay them; classSkillIds skips `_basic`).
 * Timings are CLIP seconds. Behaviour is driven by SkillSystem (tryMoveAttack / startMoveAttack).
 * OWNER: combat module (data + behaviours).
 */

export type MoveKind = 'run' | 'jump' | 'roll';

/** Running attack: ground speed fraction and time before it is ready. */
export const RUN_SPEED_FRAC = 0.85;
export const RUN_ATTACK_SEC = 0.45;
/** Roll attack opens this far into the roll (= PlayerController DODGE_ATTACK_AT). */
export const ROLL_ATTACK_AT = 0.3;
/** Jump attack: airborne time needed, and its cooldown. */
export const JUMP_ATTACK_AIR = 0.12;
export const JUMP_COOLDOWN = 1.0;

export interface MoveProfile {
  classId: ClassId;
  id: string;            // SkillDef id (`<class>_basic_<kind>`)
  name: string;          // Turkish
  anim: string;          // KayKit clip
  animSpeed: number;
  hitTime: number;       // clip s of the impact (run / roll); jump profiles land instead (mage: fires at once)
  endTime: number;       // clip s of the recovery end
  range: number;
  arc: number;
  coef: number;
  type: DamageType;
  poise: number;
  knockback: number;
  /** run: step-in distance (m). */
  lunge?: number;
  /** jump: AoE radius on landing (m). */
  radius?: number;
  /** jump: true = lands (default); false = fires its volley while airborne (mage). */
  landing?: boolean;
  /** projectile volley (mage moves). */
  projectile?: { count: number; spread: number; speed: number; pierce: number; vfx: VfxId };
  /** Combo points (rogue) gained on the hit. */
  combo?: number;
  /** Route token recorded on the impact (combat/routes.ts). */
  token: 'RUN' | 'JMP' | 'ROL';
  /** Chain step the next LMB continues from (run -> 1 = step 2, roll -> 2 = step 3). undefined = chain unchanged. */
  nextStep?: number;
  /** Feel table entry for the hit-stop / shake of each strike. */
  feel: 'runAttack' | 'rollAttack' | 'jumpLand';
}

const ICON = '/assets/icons/skill-sword-slash.svg';

const KN_RUN: MoveProfile = {
  classId: 'knight', id: 'knight_basic_run', name: 'Koşu Hamlesi', anim: '1H_Melee_Attack_Stab', animSpeed: 1.3,
  hitTime: 0.32, endTime: 0.7, range: 2.8, arc: 90, coef: 1.4, type: 'physical', poise: 14, knockback: 0.7,
  lunge: 3, token: 'RUN', nextStep: 1, feel: 'runAttack',
};
const KN_JUMP: MoveProfile = {
  classId: 'knight', id: 'knight_basic_jump', name: 'Göksel Dalış', anim: '1H_Melee_Attack_Chop', animSpeed: 1.0,
  hitTime: 0.3, endTime: 0.6, range: 2.2, arc: 360, coef: 1.6, type: 'holy', poise: 20, knockback: 1.0,
  radius: 2.2, landing: true, token: 'JMP', feel: 'jumpLand',
};
const KN_ROLL: MoveProfile = {
  classId: 'knight', id: 'knight_basic_roll', name: 'Yuvarlanma Kesiği', anim: '1H_Melee_Attack_Slice_Horizontal', animSpeed: 1.3,
  hitTime: 0.3, endTime: 0.7, range: 2.8, arc: 130, coef: 1.6, type: 'physical', poise: 12, knockback: 0.7,
  token: 'ROL', nextStep: 2, feel: 'rollAttack',
};

const BB_RUN: MoveProfile = {
  classId: 'barbarian', id: 'barbarian_basic_run', name: 'Balta Atılışı', anim: '2H_Melee_Attack_Chop', animSpeed: 1.0,
  hitTime: 0.35, endTime: 0.8, range: 4.0, arc: 160, coef: 1.5, type: 'physical', poise: 18, knockback: 0.8,
  lunge: 4, token: 'RUN', nextStep: 1, feel: 'runAttack',
};
const BB_JUMP: MoveProfile = {
  classId: 'barbarian', id: 'barbarian_basic_jump', name: 'Yer Çökertme', anim: '2H_Melee_Attack_Chop', animSpeed: 1.0,
  hitTime: 0.3, endTime: 0.6, range: 3.0, arc: 360, coef: 2.0, type: 'physical', poise: 28, knockback: 1.2,
  radius: 3.0, landing: true, token: 'JMP', feel: 'jumpLand',
};
const BB_ROLL: MoveProfile = {
  classId: 'barbarian', id: 'barbarian_basic_roll', name: 'Dönen Kesik', anim: '2H_Melee_Attack_Chop', animSpeed: 1.2,
  hitTime: 0.3, endTime: 0.7, range: 3.0, arc: 200, coef: 1.6, type: 'physical', poise: 14, knockback: 0.8,
  token: 'ROL', nextStep: 2, feel: 'rollAttack',
};

const MG_RUN: MoveProfile = {
  classId: 'mage', id: 'mage_basic_run', name: 'Koşarak Atış', anim: 'Spellcast_Shoot', animSpeed: 1.2,
  hitTime: 0.3, endTime: 0.6, range: 25, arc: 0, coef: 0.7, type: 'arcane', poise: 8, knockback: 0,
  projectile: { count: 3, spread: 8, speed: 30, pierce: 0, vfx: 'arcane_projectile' }, token: 'RUN', feel: 'runAttack',
};
const MG_JUMP: MoveProfile = {
  classId: 'mage', id: 'mage_basic_jump', name: 'Süzülen Salvo', anim: 'Spellcast_Shoot', animSpeed: 1.0,
  hitTime: 0.05, endTime: 0.5, range: 25, arc: 0, coef: 0.8, type: 'arcane', poise: 8, knockback: 0,
  projectile: { count: 3, spread: 10, speed: 30, pierce: 0, vfx: 'arcane_projectile' }, landing: false, token: 'JMP', feel: 'runAttack',
};
const MG_ROLL: MoveProfile = {
  classId: 'mage', id: 'mage_basic_roll', name: 'Çapraz Atış', anim: 'Spellcast_Shoot', animSpeed: 1.2,
  hitTime: 0.3, endTime: 0.6, range: 25, arc: 0, coef: 1.2, type: 'arcane', poise: 8, knockback: 0,
  projectile: { count: 3, spread: 12, speed: 32, pierce: 1, vfx: 'arcane_projectile' }, token: 'ROL', feel: 'rollAttack',
};

const RG_RUN: MoveProfile = {
  classId: 'rogue', id: 'rogue_basic_run', name: 'Kayan Bıçak', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.2,
  hitTime: 0.25, endTime: 0.6, range: 4.0, arc: 70, coef: 1.1, type: 'physical', poise: 10, knockback: 0.5,
  lunge: 2.5, combo: 1, token: 'RUN', nextStep: 1, feel: 'runAttack',
};
const RG_JUMP: MoveProfile = {
  classId: 'rogue', id: 'rogue_basic_jump', name: 'Kuş Saldırısı', anim: 'Dualwield_Melee_Attack_Chop', animSpeed: 1.0,
  hitTime: 0.3, endTime: 0.6, range: 2.0, arc: 360, coef: 1.7, type: 'physical', poise: 12, knockback: 0.5,
  radius: 1.6, landing: true, combo: 2, token: 'JMP', feel: 'jumpLand',
};
const RG_ROLL: MoveProfile = {
  classId: 'rogue', id: 'rogue_basic_roll', name: 'Arkadan Dönüş', anim: 'Dualwield_Melee_Attack_Stab', animSpeed: 1.3,
  hitTime: 0.3, endTime: 0.6, range: 3.0, arc: 120, coef: 1.3, type: 'physical', poise: 10, knockback: 0.5,
  token: 'ROL', feel: 'rollAttack',
};

export const RUN_BY_CLASS: Partial<Record<ClassId, MoveProfile>> = { knight: KN_RUN, barbarian: BB_RUN, mage: MG_RUN, rogue: RG_RUN };
export const JUMP_BY_CLASS: Partial<Record<ClassId, MoveProfile>> = { knight: KN_JUMP, barbarian: BB_JUMP, mage: MG_JUMP, rogue: RG_JUMP };
export const ROLL_BY_CLASS: Partial<Record<ClassId, MoveProfile>> = { knight: KN_ROLL, barbarian: BB_ROLL, mage: MG_ROLL, rogue: RG_ROLL };
export const MOVE_BY_KIND: Record<MoveKind, Partial<Record<ClassId, MoveProfile>>> = { run: RUN_BY_CLASS, jump: JUMP_BY_CLASS, roll: ROLL_BY_CLASS };

function toSkillDef(p: MoveProfile): SkillDef {
  const proj = p.projectile;
  const feel = FEEL_TABLE[p.feel];
  return {
    id: p.id, classId: p.classId, name: p.name, desc: p.name, icon: ICON, unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0,
    anim: p.anim, animSpeed: p.animSpeed, hitTime: p.hitTime,
    targeting: proj ? 'projectile' : 'melee_arc', range: proj ? p.range : p.range || undefined, arc: proj ? undefined : p.arc || undefined,
    speed: proj?.speed, radius: proj ? 0.35 : undefined, pierce: proj?.pierce, count: proj?.count, spread: proj?.spread,
    damage: { coef: p.coef, type: p.type }, knockback: p.knockback,
    tags: proj ? ['spell', 'projectile', 'move'] : ['melee', 'move'],
    vfx: proj ? { projectile: proj.vfx } : { trail: 'slash_arc' },
    sfx: proj ? undefined : { cast: 'swing_light' },
    params: { end: p.endTime, weight: 0, stagger: p.poise, move: 0.1, hitstop: feel.stop, shake: feel.trauma },
  } as SkillDef;
}

/** Every move def, merged into the shared registry (remote replays look them up by id). */
export const MOVE_SKILLS: Record<string, SkillDef> = {};
for (const p of [KN_RUN, KN_JUMP, KN_ROLL, BB_RUN, BB_JUMP, BB_ROLL, MG_RUN, MG_JUMP, MG_ROLL, RG_RUN, RG_JUMP, RG_ROLL]) {
  MOVE_SKILLS[p.id] = toSkillDef(p);
}
Object.assign(SKILLS, MOVE_SKILLS);

/**
 * Behaviour of a move (SkillSystem fires it at the impact). Melee and volleys reuse the normal behaviours of their def; a
 * landing jump is an AoE around the caster. Route tokens are recorded here, on the impact.
 */
export function moveBehavior(kind: MoveKind, p: MoveProfile): Behavior {
  if (kind === 'jump' && p.landing !== false) return landingBehavior(p);
  const def = SKILLS[p.id];
  const base = def ? behaviorFor(def) : undefined;
  return {
    fire: (c) => {
      c.sys.noteRoute(c.caster, p.token, c.action);
      if (p.combo) c.sys.addCombo(c.caster, p.combo);
      base?.fire(c);
    },
  };
}

function landingBehavior(p: MoveProfile): Behavior {
  return {
    fire: (c) => {
      const caster = c.caster;
      const sys = c.sys;
      const r = p.radius ?? 1.2;
      const x = caster.position.x, z = caster.position.z;
      sys.noteRoute(caster, p.token, c.action);
      // the landing thump is always shown, hit or not; hit-stop only comes from actual strikes
      sys.vfx('ground_slam', [x, 0.05, z], { scale: vfxScale('ground_slam', r * 1.3, 0.35) });
      sys.sfx('ground_slam', caster.position, { pitchVar: 0.08 });
      sys.shake(FEEL_TABLE.jumpLand.trauma, 0.22);
      if (c.remote) return;
      if (p.combo) sys.addCombo(caster, p.combo);
      for (const e of sys.enemiesNear(x, z, r)) {
        sys.strike(c, e, {
          coef: p.coef, type: p.type, weight: 'heavy', stagger: p.poise, knockback: p.knockback,
          hitstop: FEEL_TABLE.jumpLand.stop, shake: FEEL_TABLE.jumpLand.trauma,
        });
      }
    },
  };
}
