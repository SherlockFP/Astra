import type { EnemyAbility, EnemyDef } from '../../types/enemies';

/**
 * WoW-style trash roles (OWNER: enemies module). Derived from data that every def already carries (`role`, `rank`, `flying`,
 * `ai.*` and the model path), so the roster needs no edits: casters and healers keep range and cast interruptible spells,
 * archers kite a little, humanoids flee at low HP and call their pack. Pure functions, no engine imports (safe to use from
 * EnemyAI and from the sims).
 */

/** Humanoid models: the `characters/` set (mages, knights, rogues, barbarians...) and the orc and goblin monsters. */
const HUMANOID_MODEL = /\/characters\/|\/monsters\/(?:Orc|Goblin)\.glb$/;

/** Trash and elites only: bosses, minibosses and summons keep their scripted behaviour. */
const TRASH_LIKE = (def: EnemyDef): boolean => def.rank === 'trash' || def.rank === 'elite';

/** A humanoid trash / elite mob (WoW "humanoid" creature type): the ones that flee and call for help at low HP. */
export function isHumanoid(def: EnemyDef): boolean {
  return HUMANOID_MODEL.test(def.model ?? '');
}

/** Humanoids flee below 20 % HP (WoW fleeing mobs). Flyers, summons, stationary and neutral bodies never do. */
export function fleesAtLowHp(def: EnemyDef): boolean {
  if (!TRASH_LIKE(def) || !isHumanoid(def) || def.flying || def.speed <= 0) return false;
  const ai = def.ai;
  return !ai?.summoned && !ai?.stationary && !ai?.neutral && !ai?.flee;
}

/**
 * Preferred distance band [min, max] (m) of a ranged or caster role. An explicit `ai.kite` wins. Casters and healers keep
 * range (9-15 m), archers only step back a little (7-11 m). Melee roles return null.
 */
export function kiteBandFor(def: EnemyDef): [number, number] | null {
  if (def.ai?.kite) return def.ai.kite;
  if (!TRASH_LIKE(def) || def.flying || def.ai?.stationary || def.attackRange < 5) return null;
  if (def.role === 'caster' || def.role === 'healer') return [9, 15];
  if (def.role === 'ranged') return [7, 11];
  return null;
}

/** Cast time (s) of a trash caster / healer spell that has none in its data: 1.2 s interruptible cast bar, else 0. */
export const SPELL_CAST_S = 1.2;

/**
 * Trash casters and healers cast their non-basic ground / projectile / line spells with an interruptible cast bar (WoW mob
 * casts). Basic attacks stay instant. Returns the cast time to use (0 = leave the ability as it is).
 */
export function spellCastTime(def: EnemyDef, ab: EnemyAbility, isBasic: boolean): number {
  if (isBasic || (ab.castTime ?? 0) > 0 || def.rank !== 'trash') return ab.castTime ?? 0;
  if (def.role !== 'caster' && def.role !== 'healer') return 0;
  if (ab.kind === 'projectile' || ab.kind === 'ground_aoe' || ab.kind === 'self_aoe' || ab.kind === 'line') return SPELL_CAST_S;
  return 0;
}

/** Heal threshold: trash and elite healers only heal allies below 80 % HP (bosses keep their 97 %). */
export function healBelow(def: EnemyDef): number {
  return TRASH_LIKE(def) ? 0.8 : 0.97;
}

/**
 * WoW leash for trash and elites that have no explicit leash: they evade home (full reset) when pulled this far from their
 * spawn. Summons, stationary bodies, neutrals and fleers keep their own rules; 0 = no default leash.
 */
export const DEFAULT_LEASH_M = 30;
export function defaultLeashFor(def: EnemyDef): number {
  if (!TRASH_LIKE(def)) return 0;
  const ai = def.ai;
  return ai?.summoned || ai?.stationary || ai?.neutral || ai?.flee ? 0 : DEFAULT_LEASH_M;
}
