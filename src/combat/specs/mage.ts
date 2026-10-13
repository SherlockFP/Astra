/**
 * GDD_TALENTS §1.3.2 mage spec mechanics: Sıcak Seri (Ateş), Buz Parmakları (Buz), Gizem Yükü (Gizem), and the
 * Alev Bariyeri / Büyücü Dokunuşu / Gizem Dalgalanması hooks. OWNER: combat (T8).
 * Imported for its side effects from the end of combat/skills/behaviors.ts (this module registers nothing by itself).
 *
 * T7 owns the cast / hit pipeline and the SpecHooks registry (not built yet). This module is the mage side: pure
 * per-caster state (WeakMap, Map for marks) and the entry points exported as `mageHooks`. T7 calls them:
 *   resolveCast          before a cast pays: cost / cast-time multipliers, crit bonus, damage `more`, frozen ×3
 *   commitCast           after the cast paid and fired: consumes Sıcak Seri / Buz Parmağı, Baraj iadesi, Surge mana, Bariyer
 *   onHit                every damaging instance a caster dealt (DoT ticks flagged `dot: true`)
 *   onFreeze             a frost skill froze a target (once per frozen target)
 *   onDamageTaken        the caster was hit (thorns of Alev Bariyeri)
 *   onBarrierBroken      the Alev Bariyeri shield ran out (the absorb code calls it; returns the nova once)
 *   collectTouchBursts   every frame: expired Büyücü Dokunuşu marks become bursts (+2 Gizem Yükü for the owner)
 *   dotCritMult          DoT crit chance = critChance × this (Sıcak Seri 0.5, 0 otherwise)
 *
 * Notes for the caller:
 * - Gizem Yükü gain and the Barajı consume come from SkillDef.pip (SkillSystem.pay). The hooks only read the charges
 *   (Player.pips.arcane), except the +2 of a burst.
 * - Buz Parmağı charges are counted here (expiry list, the cap renews the soonest one); the status `fingers_of_frost`
 *   mirrors the count for the HUD. Chance rolls use Math.random: they only decide the caster's own buff.
 * - `MageCtx.w` is the caster's weapon average W (0 when unknown: the absorb and the store caps then become 0).
 */
import type { Actor } from '../../entities/Actor';
import type { DamageType } from '../../types/common';
import type { SkillDef, StatusId } from '../../types/skills';
import { clamp } from '../../core/utils';
import { addAbsorb } from '../healing';
import { specHas, specSpecial } from '../specs';
import { MAGE_SPEC_SKILLS } from '../../data/skills_mage_specs';

/** Clock and weapon average of the caller. `now` = world seconds (G.world.time), `w` = the caster's weapon average W. */
export interface MageCtx { now: number; w: number }

/** What a cast changes before it pays. Multipliers, so the caller applies them to its own resolved numbers. */
export interface MageCastMods {
  /** × resolved cost (0 = free). */
  costMult: number;
  /** × resolved cast time (0 = instant). */
  castTimeMult: number;
  /** Added to the caster's crit chance for this cast. */
  critBonus: number;
  /** × damage of this cast (DAHA FAZLA: every strike). */
  more: number;
  /** × damage against a Frozen target (Buz Mızrağı ×3), 1 otherwise. */
  frozenMult: number;
  /** Gizem Yükü this cast spends (Gizem Barajı: all charges at resolve time). */
  spendCharges: number;
  /** Sıcak Seri is consumed on commit. */
  consumeHot: boolean;
  /** Buz Parmağı charges consumed on commit. */
  consumeFingers: number;
}

/** One damaging instance dealt by a caster. */
export interface MageHit {
  source: Actor;
  target: Actor | null;
  def: SkillDef;
  type: DamageType;
  crit: boolean;
  /** Damage-over-time tick: never counts for Sıcak Seri / Buz Parmağı. */
  dot: boolean;
  amount: number;
}

/** Instruction for the attacker's machine: burn a melee attacker of Alev Bariyeri (combat applies it with its own dps). */
export interface BarrierThorn { target: Actor; status: StatusId; duration: number; magnitude: number; sourceId: number }
/** Instruction: Alev Bariyeri nova around the caster (the caller resolves it like any fire area hit). */
export interface BarrierNova { x: number; z: number; radius: number; coef: number; type: DamageType; sourceId: number }
/** Instruction: Büyücü Dokunuşu burst at the marked target's position. */
export interface TouchBurst { owner: Actor; target: Actor; x: number; z: number; radius: number; amount: number; type: DamageType }

type Params = Record<string, number>;

// GDD defaults; the spec's own `specials[].params` (merged by T7 when bespoke) override them.
const PYRO: Params = { streakCrits: 2, streakDur: 8, streakCrit: 0.25, burnCrit: 0.5 };
const CRYO: Params = { fofChance: 0.15, fofMax: 2, fofDur: 15, fofCrit: 0.5 };
const ARCANE: Params = { chargeMax: 4, chargeDmg: 0.12, chargeCost: 0.25, manaFloor: 0.4, manaSlope: 0.003 };

/** Parameters of a trait the caster owns (defaults for the rest). */
function trait(a: Actor, id: string, defaults: Params): Params {
  return { ...defaults, ...(specSpecial(a, id) ?? {}) };
}

/** Numbers of a mage skill row (surge, touch, barrier), read from the data row. */
function rowParams(id: string): Params {
  return MAGE_SPEC_SKILLS[id]?.params ?? {};
}

/** Sıcak Seri counts these spells as free while the status lasts. */
const HOT_STREAK_SKILLS: ReadonlySet<string> = new Set(['mage_meteor', 'mage_flame_wave', 'mage_phoenix_flames']);

interface CasterState {
  /** Consecutive critical fire hits (Sıcak Seri counter). */
  streak: number;
  /** Expiry time (world s) of each Buz Parmağı charge. */
  fingers: number[];
}
const casters = new WeakMap<Actor, CasterState>();

function stateOf(a: Actor): CasterState {
  let s = casters.get(a);
  if (!s) {
    s = { streak: 0, fingers: [] };
    casters.set(a, s);
  }
  return s;
}

/** Büyücü Dokunuşu: damage stored on one target by its owner. */
interface Mark { owner: Actor; stored: number; cap: number }
const marks = new Map<Actor, Mark>();

type PipBag = { pips?: Partial<Record<string, number>> };
const charges = (a: Actor): number => (a as Actor & PipBag).pips?.arcane ?? 0;

function setCharges(a: Actor, n: number, max: number): void {
  const bag = a as Actor & PipBag;
  bag.pips = { ...(bag.pips ?? {}), arcane: clamp(n, 0, max) };
}

const manaPct = (a: Actor): number => (a.maxResource > 0 ? a.resource / a.maxResource : 0);
const isArcane = (def: SkillDef): boolean => def.tags.includes('arcane');

// ----------------------------------------------------------------------------------------------------------------
// Buz Parmakları (frost charges)
// ----------------------------------------------------------------------------------------------------------------

/** Live Buz Parmağı count (expired charges are dropped). */
function fingerCount(a: Actor, now: number): number {
  const s = stateOf(a);
  s.fingers = s.fingers.filter((t) => t > now);
  return s.fingers.length;
}

/** Mirrors the count on the HUD status: magnitude = charges, duration = the last one to expire. */
function syncFingerStatus(a: Actor, now: number): void {
  const s = stateOf(a);
  a.statuses.remove('fingers_of_frost');
  if (s.fingers.length === 0) return;
  const last = Math.max(...s.fingers);
  a.statuses.apply('fingers_of_frost', last - now, { magnitude: s.fingers.length, sourceId: a.id });
}

/** Grants one Buz Parmağı (max `fofMax`, each lasts `fofDur`); at the cap the soonest-expiring charge is renewed. */
function grantFinger(a: Actor, ctx: MageCtx): void {
  const p = trait(a, 'trait_cryomancer', CRYO);
  const s = stateOf(a);
  fingerCount(a, ctx.now);
  if (s.fingers.length >= p.fofMax) {
    s.fingers.sort((x, y) => x - y);
    s.fingers[0] = ctx.now + p.fofDur;
  } else {
    s.fingers.push(ctx.now + p.fofDur);
  }
  syncFingerStatus(a, ctx.now);
}

/** Spends the soonest-expiring Buz Parmağı. */
function consumeFinger(a: Actor, ctx: MageCtx): void {
  const s = stateOf(a);
  if (fingerCount(a, ctx.now) === 0) return;
  s.fingers.sort((x, y) => x - y);
  s.fingers.shift();
  syncFingerStatus(a, ctx.now);
}

// ----------------------------------------------------------------------------------------------------------------
// entry points (see the header for who calls what)
// ----------------------------------------------------------------------------------------------------------------

/**
 * Before a cast pays. Reads state only. `def` is the resolved skill (after the spec/talent mods).
 * Sıcak Seri: Meteor / Alev Dalgası / Anka Alevleri are free and instant with +crit while the status lasts.
 * Buz Mızrağı: ×3 against Frozen targets, +crit, spends one Parmak on commit.
 * Gizem Yükü: each charge adds 25 % cost and 12 % arcane damage; mana above 40 % adds 0.3 % per point (cap 18 %).
 * Gizem Dalgalanması: +30 % arcane damage, Gizem Patlaması costs half.
 */
export function resolveCast(caster: Actor, def: SkillDef, ctx: MageCtx): MageCastMods {
  const m: MageCastMods = {
    costMult: 1, castTimeMult: 1, critBonus: 0, more: 1, frozenMult: 1, spendCharges: 0, consumeHot: false, consumeFingers: 0,
  };
  if (HOT_STREAK_SKILLS.has(def.id) && caster.statuses.has('hot_streak') && specHas(caster, 'trait_pyromancer')) {
    m.costMult = 0;
    m.castTimeMult = 0;
    m.critBonus += trait(caster, 'trait_pyromancer', PYRO).streakCrit;
    m.consumeHot = true;
  }
  if (def.id === 'mage_ice_lance' && specHas(caster, 'trait_cryomancer') && fingerCount(caster, ctx.now) > 0) {
    m.frozenMult = 3;
    m.critBonus += trait(caster, 'trait_cryomancer', CRYO).fofCrit;
    m.consumeFingers = 1;
  }
  if (isArcane(def) && specHas(caster, 'trait_arcanist')) {
    const p = trait(caster, 'trait_arcanist', ARCANE);
    const n = clamp(charges(caster), 0, p.chargeMax);
    const manaBonus = p.manaSlope * clamp((manaPct(caster) - p.manaFloor) * 100, 0, 60);
    m.costMult *= 1 + p.chargeCost * n;
    m.more *= (1 + p.chargeDmg * n) * (1 + manaBonus);
    if (def.id === 'mage_arcane_barrage') m.spendCharges = n;
    if (caster.statuses.has('arcane_surge')) {
      const surge = rowParams('mage_arcane_surge');
      m.more *= surge.more ?? 1.3;
      if (def.id === 'mage_arcane_blast') m.costMult *= surge.blastCostMult ?? 0.5;
    }
  }
  return m;
}

/**
 * After the cast paid and fired. Consumes the Sıcak Seri / Buz Parmağı the cast used, refunds Barajı mana,
 * adds Gizem Dalgalanması's instant mana and the Alev Bariyeri shield (healing.addAbsorb, label `blazing_barrier`).
 */
export function commitCast(caster: Actor, def: SkillDef, m: MageCastMods, ctx: MageCtx): void {
  if (m.consumeHot) caster.statuses.remove('hot_streak');
  for (let i = 0; i < m.consumeFingers; i++) consumeFinger(caster, ctx);
  if (m.spendCharges > 0) {
    const refund = (def.params?.refundPerPip ?? 2) * m.spendCharges;
    caster.resource = Math.min(caster.maxResource, caster.resource + refund);
  }
  if (def.id === 'mage_arcane_surge') {
    caster.resource = Math.min(caster.maxResource, caster.resource + (def.params?.manaFlat ?? 40));
  }
  if (def.id === 'mage_blazing_barrier') {
    const p = def.params ?? {};
    const amount = (p.absorbPct ?? 0.22) * caster.maxHp + (p.absorbW ?? 2) * ctx.w;
    addAbsorb(caster, amount, amount, def.selfStatuses?.[0]?.duration ?? 10, 'blazing_barrier', caster.id);
  }
}

/**
 * Every damaging instance a caster dealt. Sıcak Seri: a crit fire hit adds to the streak (a non-crit resets it; at
 * `streakCrits` the status starts). Buz Parmakları: a frost hit rolls `fofChance` (the skill's own `fofChance` or
 * `fofPerPulse` when it has one). Büyücü Dokunuşu: 25 % of the owner's damage on a marked target is stored (cap 30 × W).
 */
export function onHit(hit: MageHit, ctx: MageCtx): void {
  const a = hit.source;
  if (hit.type === 'fire' && !hit.dot && specHas(a, 'trait_pyromancer')) {
    const p = trait(a, 'trait_pyromancer', PYRO);
    const s = stateOf(a);
    if (hit.crit) {
      s.streak += 1;
      if (s.streak >= p.streakCrits) {
        s.streak = 0;
        a.statuses.apply('hot_streak', p.streakDur, { sourceId: a.id });
      }
    } else {
      s.streak = 0;
    }
  }
  if (hit.type === 'frost' && !hit.dot && specHas(a, 'trait_cryomancer')) {
    const chance = hit.def.params?.fofChance ?? hit.def.params?.fofPerPulse ?? trait(a, 'trait_cryomancer', CRYO).fofChance;
    if (Math.random() < chance) grantFinger(a, ctx);
  }
  const t = hit.target;
  if (t && hit.amount > 0 && t.statuses.get('touch_of_magi')?.sourceId === a.id) {
    const p = rowParams('mage_touch_of_magi');
    const cap = (p.storeCapW ?? 30) * ctx.w;
    const mark = marks.get(t) ?? { owner: a, stored: 0, cap };
    mark.cap = cap;
    mark.stored = Math.min(cap, mark.stored + hit.amount * (p.store ?? 0.25));
    marks.set(t, mark);
  }
}

/** A frost skill froze a target (once per frozen target). Buz Halkası: every frozen enemy gives one Buz Parmağı. */
export function onFreeze(caster: Actor, def: SkillDef, ctx: MageCtx): void {
  if (def.id === 'mage_frost_nova' && specHas(caster, 'trait_cryomancer')) grantFinger(caster, ctx);
}

/**
 * The caster was hit (after the shield took its part). A melee attacker of an active Alev Bariyeri burns for 3 s
 * at 60 % of its dps; the caller applies the returned instruction on the attacker's machine.
 */
export function onDamageTaken(defender: Actor, attacker: Actor | null, melee: boolean): BarrierThorn | null {
  if (!attacker || !melee || !defender.statuses.has('blazing_barrier')) return null;
  const p = rowParams('mage_blazing_barrier');
  return { target: attacker, status: 'burn', duration: 3, magnitude: p.thornBurn ?? 0.6, sourceId: defender.id };
}

/** The Alev Bariyeri shield ran out: ends the barrier and returns the r4 fire nova once (null when no barrier). */
export function onBarrierBroken(caster: Actor): BarrierNova | null {
  if (!caster.statuses.has('blazing_barrier')) return null;
  caster.statuses.remove('blazing_barrier');
  const p = rowParams('mage_blazing_barrier');
  return {
    x: caster.position.x, z: caster.position.z, radius: p.breakRadius ?? 4, coef: p.breakNova ?? 2, type: 'fire', sourceId: caster.id,
  };
}

/**
 * Every frame: marks whose Büyücü Dokunuşu status ended become bursts (stored damage, r4 arcane). The owner gets
 * +2 Gizem Yükü per burst. Returns the bursts for the caller to apply.
 */
export function collectTouchBursts(): TouchBurst[] {
  const out: TouchBurst[] = [];
  for (const [target, mark] of marks) {
    if (target.statuses.has('touch_of_magi')) continue;
    marks.delete(target);
    const p = rowParams('mage_touch_of_magi');
    if (mark.stored > 0) {
      out.push({
        owner: mark.owner, target, x: target.position.x, z: target.position.z,
        radius: p.burstRadius ?? 4, amount: mark.stored, type: 'arcane',
      });
    }
    if (specHas(mark.owner, 'trait_arcanist')) {
      setCharges(mark.owner, charges(mark.owner) + (p.pipOnBurst ?? 2), trait(mark.owner, 'trait_arcanist', ARCANE).chargeMax);
    }
  }
  return out;
}

/** DoT crit chance = critChance × this. Sıcak Seri: burnCrit (0.5). Every other caster: 0 (DoT ticks never crit).*/
export function dotCritMult(a: Actor): number {
  return specHas(a, 'trait_pyromancer') ? trait(a, 'trait_pyromancer', PYRO).burnCrit : 0;
}

/** The hook table T7 registers under the trait ids (SpecHooks). Until T7 exists, callers import it directly. */
export const mageHooks = {
  traits: ['trait_pyromancer', 'trait_cryomancer', 'trait_arcanist'] as const,
  resolveCast,
  commitCast,
  onHit,
  onFreeze,
  onDamageTaken,
  onBarrierBroken,
  collectTouchBursts,
  dotCritMult,
};
export type MageHooks = typeof mageHooks;
