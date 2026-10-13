/**
 * Paladin behaviours (GDD_CLASSES_V2 §14 NC51; kit numbers: docs/kits/plate-melee.md §5-§7). NC48 creates this file empty; the
 * paladin package fills BEHAVIORS_PALADIN and never touches behaviors.ts. Installed into BEHAVIORS by the import at the end of
 * behaviors.ts (microtask fallback, as in plateKit.ts). The full mapping of EVERY paladin skill (also the ones that run on
 * behaviours of other files) is docs/kits/paladin_behaviors.md.
 *
 * behaviour id        reads (SkillDef.params unless noted)                                            used by (paladin skill ids)
 * ------------------  ----------------------------------------------------------------------------  --------------------------------
 * heal_target         def.heal {coef flat}, def.damage (enemy branch), def.allyTarget, def.pip         paladin_holy_shock, _flash_of_light,
 *                     {coefPerPip min}; smartPriority missingHpBonus lowHpBelow lowHpMult healPct      _word_of_glory (Koruma + Kutsal),
 *                     hotCoef hotDur dispel needDebuff healBelow selfRefund gain forbearance          _cleanse, _lay_on_hands
 * heal_aoe            def.heal.coef, def.radius, def.arc (<360 = cone); maxTargets needInjured         paladin_light_of_dawn
 *                     hotPct hotDur
 * heal_bolt           def.heal.coef, def.damage, def.count/spread/range, def.statuses (enemy hit);     paladin_holy_basic_1..3
 *                     gain
 * avengers_shield     def.damage.coef, def.range, def.speed; bounces bounceRange bounceMult silence    paladin_avengers_shield
 *                     lock tauntDur bossTauntDur tauntFirst
 * hammer_of_wrath     def.damage.coef, def.range, def.homing; threshold (0.2)                          paladin_hammer_of_wrath
 * splash_strike       def.damage.coef, def.range, def.arc, def.statuses (primary); splashRadius        paladin_hammer_of_light,
 *                     splashMax splashMult splashStatuses                                              paladin_ret_execution
 * wake_of_ashes       def.range, def.arc, def.damage, def.statuses (burn); stunDur healPct healMax     paladin_wake_of_ashes
 *                     maxTargets stagger
 * divine_steed        def.range (dash length), def.cleanses (roots/slows), def.selfStatuses; speed     paladin_divine_steed
 *                     pathWidth
 * ardent_defender     def.selfStatuses (ardent); expireHealPct                                         paladin_prot_ardent
 *
 * Rows that use behaviours of OTHER files: orbit_hammers (paladin_blessed_hammer), provoke (paladin_reckoning),
 * divine_toll (paladin_divine_toll), interrupt (paladin_rebuke), status_self (paladin_divine_shield), self_buff
 * (paladin_avenging_wrath, paladin_prot_bulwark, paladin_holy_aura_mastery), melee_arc / target_projectile / target_instant /
 * self_aoe / ground_aoe targeting defaults (basic chains, crusader_strike, templar_slash, shield_of_righteous, verdict,
 * judgement, blade_of_justice, divine_storm, consecration).
 *
 * Conventions (same as plateKit / sharedBehaviors): begin() validates before anything is paid and fails with
 * sys.fail('target' | 'range'); remote replays (c.remote) draw visuals only and never throw; heals go through healAmount ->
 * G.combat.healPlayer (a remote ally gets the 'heal' channel, its owner applies it); statuses on a remote ally go out as 'pstatus';
 * statuses on enemies go through G.combat.applyEnemyStatuses (host applies, client asks the host); damage goes through
 * sys.strike. A behaviour applies def.selfStatuses itself (SkillSystem only does that for kit_* ids).
 */
import { G } from '../../game/G';
import { clamp } from '../../core/utils';
import { Projectile } from '../../entities/Projectile';
import { STATUSES } from '../../data/statuses';
import { vfxScale } from '../feel';
import { HEAL_RANGE, addAbsorb, alliesInRange, dispelUpTo, friendlyTargetId, healAmount, healFormula, resolveHealTarget } from '../healing';
import { specSpecial } from '../specs';
import { BEHAVIORS, TARGETING_BEHAVIORS, aimSlope, at, castTarget, clearSight, dist2, impactVfx, muzzle, strikeMany, swingVfx, type Behavior, type CastCtx } from './behaviors';
import { pickChainTarget } from './sharedBehaviors';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DamageResult } from '../Combat';
import type { EntityId } from '../../types/common';
import type { StatusId } from '../../types/skills';
import type { VfxId } from '../../types/vfx';

export const BEHAVIORS_PALADIN: Record<string, Behavior> = {};

/** Spawn height of a caster-launched bolt (same as the other projectile behaviours). */
const BOLT_Y = 1.35;
/** Families that Wake of Ashes (Küllerin Uyanışı) can stun: demons and the undead (plate-melee §7a). */
const ASH_FAMILIES: ReadonlySet<string> = new Set(['demon', 'undead_bone', 'undead_flesh', 'ghost']);

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------

const rotDir = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
};
const hpFrac = (a: Actor): number => a.hp / Math.max(1, a.maxHp);

/** A living player by entity id (null for unknown ids, dead players, minions and enemies). */
function playerOf(id: EntityId | null | undefined): Player | null {
  if (id === null || id === undefined) return null;
  const p = G.world?.get<Player>(id);
  return p && p.kind === 'player' && !p.isDead && !p.removed ? p : null;
}

/** `a` when it is within `range` of the caster (edge distance), else null. */
const inReach = (c: CastCtx, a: Player | null, range: number): Player | null =>
  a && dist2(a.position, c.caster.position) <= range + a.radius ? a : null;

/** Number of dispellable debuffs an actor carries (data/statuses.ts `dispellable`). */
function dispellableCount(a: Actor): number {
  let n = 0;
  for (const s of a.statuses.list()) {
    const d = STATUSES[s.id];
    if (d && d.kind === 'debuff' && d.dispellable) n++;
  }
  return n;
}

/** The enemy the cast is aimed at (soft / hard target) when it is within `range` (edge distance) and in line of sight. */
function enemyInReach(c: CastCtx, range: number): Enemy | null {
  const t = castTarget(c);
  if (!t || t.team !== 'enemy' || t.isDead) return null;
  if (dist2(t.position, c.caster.position) - t.radius > range) return null;
  return clearSight(c.caster, t) ? (t as Enemy) : null;
}

/** Aimed enemy in reach, else the nearest enemy of the cone (local casts only). `arc` 0 = aimed enemy only. */
function enemyOrNearest(c: CastCtx, range: number, arc: number): Enemy | null {
  const hard = enemyInReach(c, range);
  if (hard || c.remote || arc <= 0) return hard;
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of c.sys.enemiesInCone(c.caster, c.dir, range, arc)) {
    const d = dist2(e.position, c.caster.position);
    if (d < bestD && clearSight(c.caster, e)) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Gives a status to an ally. A remote player gets the 'pstatus' message its owner applies (same path as SkillSystem.applyPartyAt),
 * so the status lands on the player's own machine; a local one is applied directly.
 */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude = 0): void {
  if (c.remote) return;
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** A light beam from the caster's hand toward `to`, scaled by the distance. */
function beamTo(c: CastCtx, to: { position: { x: number; z: number } }, id: VfxId): void {
  const dx = to.position.x - c.caster.position.x, dz = to.position.z - c.caster.position.z;
  const d = Math.hypot(dx, dz) || 1;
  c.sys.vfx(id, at(c.caster, 1.3), { dir: [dx / d, 0, dz / d], scale: clamp(d / 6, 0.7, 2.5) });
}

/** Statuses of a row minus the ones a behaviour drives itself through params. */
const statusesWithout = (c: CastCtx, ...skip: StatusId[]): NonNullable<CastCtx['def']['statuses']> =>
  (c.def.statuses ?? []).filter((s) => !skip.includes(s.status));

/** The pip count a cast paid (set by SkillSystem.pay), 0 for remote replays. */
const pipsSpent = (c: CastCtx): number => (c.data.pipSpent as number | undefined) ?? 0;

// ---------------------------------------------------------------------------------------------------------
// Taşan Şifa (overheal ward)
// ---------------------------------------------------------------------------------------------------------

/** Seconds the overheal absorb lasts, and its ceiling as a share of the healed ally's max HP. */
const WARD_DUR = 10;
const WARD_CAP = 0.15;

/**
 * Kutsal trait (plate-melee.md §6, `trait_holy.overhealWard` 0.4): the share of a heal's overheal that turns into a short absorb on the
 * healed ally. A local ally gets the `shield` absorb with the `overheal_ward` label; a remote ally gets a plain `shield` 'pstatus'
 * (its owner applies it). `over` is what healAmount returned.
 */
function wardOverheal(c: CastCtx, ally: Player, over: number): void {
  if (c.remote || over <= 0) return;
  const share = specSpecial(c.caster, 'trait_holy')?.overhealWard ?? 0;
  if (share <= 0) return;
  const cap = ally.maxHp * WARD_CAP;
  const amount = Math.min(cap, over * share);
  if (amount < 1) return;
  if (ally.isLocal) addAbsorb(ally, amount, cap, WARD_DUR, 'overheal_ward', c.caster.id);
  else giveStatus(c, ally, 'shield', WARD_DUR, amount);
}

// ---------------------------------------------------------------------------------------------------------
// heal_target: Holy Shock / Flash of Light / Word of Glory / Cleanse / Lay on Hands
// ---------------------------------------------------------------------------------------------------------

interface HealPick { ally: Player | null; enemy: Enemy | null }

/**
 * Who a heal_target cast goes to. Order: the aimed ally (aim.allyId, party frame / Alt) first; for `allyTarget 'any'` rows an enemy
 * under the reticle next (damage branch; `healBelow` keeps an ally under that HP fraction ahead of it); then the smart pick of
 * healing.ts (friendly selection > crosshair ally > lowest HP in range > self). `smartPriority 1` skips full-HP allies, `dispel`
 * rows only take allies that carry a dispellable debuff (unless `needDebuff 0`), `forbearance 1` rows skip allies under forbearance
 * (Lay on Hands). When the smart pick is not eligible the most injured eligible ally in reach is used. Null = nothing valid (the cast
 * fails unpaid).
 */
function pickHeal(c: CastCtx): HealPick | null {
  const { caster, def } = c;
  const p = def.params ?? {};
  const range = def.range ?? HEAL_RANGE;
  const needDebuff = (p.dispel ?? 0) > 0 && p.needDebuff !== 0;
  const okAlly = (a: Player): boolean => (!needDebuff || dispellableCount(a) > 0) && !(p.forbearance === 1 && a.statuses.has('forbearance'));
  const explicit = inReach(c, playerOf(c.aim.allyId), range);
  if (explicit && okAlly(explicit)) return { ally: explicit, enemy: null };
  if (def.allyTarget === 'any') {
    const foe = enemyInReach(c, range);
    if (foe) {
      const below = p.healBelow ?? 0;
      if (below > 0) {
        let low: Player | null = null;
        for (const a of alliesInRange(caster, range)) if (hpFrac(a) < below && okAlly(a) && (!low || hpFrac(a) < hpFrac(low))) low = a;
        if (low) return { ally: low, enemy: null };
      }
      return { ally: null, enemy: foe };
    }
  }
  let ally = inReach(c, resolveHealTarget(caster, c.aim, p.smartPriority === 1), range);
  if (ally && !okAlly(ally)) ally = null;
  if (!ally && (needDebuff || p.forbearance === 1)) {
    let best: Player | null = null;
    for (const a of alliesInRange(caster, range)) if (okAlly(a) && (!best || hpFrac(a) < hpFrac(best))) best = a;
    ally = best;
  }
  return ally ? { ally, enemy: null } : null;
}

/** Remote replay of a heal_target cast: a beam toward the announced target (ally frame or enemy), nothing else. */
function remoteHealFx(c: CastCtx): void {
  const id = c.aim.allyId ?? c.aim.targetId;
  const t = id !== null && id !== undefined ? G.world?.getActor(id) : undefined;
  if (t && !t.isDead) {
    beamTo(c, t, c.def.vfx?.cast ?? 'holy_beam');
    c.sys.vfx(t.team === 'enemy' ? 'holy_burst' : 'heal_burst', at(t, t.height * 0.6), { scale: 0.8 });
  } else {
    c.sys.vfx(c.def.vfx?.cast ?? 'holy_beam', at(c.caster, 1.3), { dir: [c.dir[0], 0, c.dir[1]], scale: 1 });
  }
}

const healTarget: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const pick = pickHeal(c);
    if (!pick) { c.sys.fail('target'); return false; }
    c.data.pick = pick;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (c.remote) { remoteHealFx(c); return; }
    const p = def.params ?? {};
    let pick = c.data.pick as HealPick | undefined;
    if (!pick || (pick.ally && pick.ally.isDead) || (pick.enemy && (pick.enemy.isDead || pick.enemy.removed))) pick = pickHeal(c) ?? undefined;
    if (!pick) { sys.whiff(c); return; }

    if (pick.enemy) {
      // damage branch (Holy Shock on an enemy under the reticle)
      const e = pick.enemy;
      const d = sys.dirTo(caster, e);
      beamTo(c, e, def.vfx?.cast ?? 'holy_beam');
      const r = sys.strike(c, e, { dir: d });
      if (r) { sys.afterHits(c, [r]); impactVfx(c, e, d, 0); } else sys.whiff(c);
      sys.applySelf(c, def.selfStatuses ?? []);
      return;
    }

    const ally = pick.ally!;
    const frac = hpFrac(ally);
    const pip = def.pip;
    let coef = def.heal?.coef ?? 0;
    if (pip?.coefPerPip) coef += pip.coefPerPip * Math.max(0, pipsSpent(c) - (pip.min ?? 0));
    coef *= 1 + (p.missingHpBonus ?? 0) * (1 - frac);
    if ((p.lowHpBelow ?? 0) > 0 && frac < p.lowHpBelow) coef *= p.lowHpMult ?? 1.15;
    coef *= c.more;
    const flat = def.heal?.flat ?? 0;
    const raw = (coef > 0 || flat > 0 ? healFormula(caster as Player, coef, flat).amount : 0) + (p.healPct ?? 0) * ally.maxHp;

    // dispel rows (Arındırma): the heal only comes when something was removed
    const dispelN = Math.round(p.dispel ?? 0);
    const removed = dispelN > 0 ? dispelUpTo(ally, dispelN) : 0;
    beamTo(c, ally, def.vfx?.cast ?? 'holy_beam');
    sys.vfx(def.vfx?.impact ?? 'heal_burst', at(ally, ally.height * 0.6), { scale: 1 });
    if (dispelN === 0 || removed > 0) wardOverheal(c, ally, healAmount(caster as Player, ally, raw));

    if ((p.hotCoef ?? 0) > 0) {
      const dur = p.hotDur ?? 12;
      giveStatus(c, ally, 'renew', dur, healFormula(caster as Player, p.hotCoef * c.more).amount / dur);
    }
    for (const s of def.statuses ?? []) giveStatus(c, ally, s.status, s.duration, s.magnitude ?? 0);
    if (ally === caster && (p.selfRefund ?? 0) > 0) sys.addResource(caster, p.selfRefund);
    if ((p.gain ?? 0) > 0) sys.gainResource(caster, p.gain);
    sys.sfx('heal', ally.position);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// heal_aoe: Light of Dawn
// ---------------------------------------------------------------------------------------------------------

/** Allies a heal_aoe hits: alive, inside the radius (and the cone when def.arc < 360), most injured first, at most maxTargets. */
function aoeAllies(c: CastCtx): Player[] {
  const { caster, def } = c;
  const p = def.params ?? {};
  const radius = (def.radius ?? 15) * (1 + c.sys.softStat(caster, 'aoeRadiusPct'));
  const arc = def.arc ?? 360;
  const cosHalf = Math.cos(((arc / 2) * Math.PI) / 180);
  const list = alliesInRange(caster, radius).filter((a) => {
    if (a.isDead || a.removed) return false;
    if (arc >= 360 || a === caster) return true;
    const dx = a.position.x - caster.position.x, dz = a.position.z - caster.position.z;
    const d = Math.hypot(dx, dz);
    return d < 0.5 || (dx * c.dir[0] + dz * c.dir[1]) / d >= cosHalf;
  });
  list.sort((a, b) => hpFrac(a) - hpFrac(b) || a.id - b.id);
  return list.slice(0, Math.max(1, Math.round(p.maxTargets ?? 5)));
}

const healAoe: Behavior = {
  begin(c) {
    if (c.remote) return true;
    // nobody hurt in reach: fail before the Holy Power is paid (needInjured 0 = always cast)
    if ((c.def.params?.needInjured ?? 1) !== 0 && !aoeAllies(c).some((a) => a.hp < a.maxHp)) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 15) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    sys.ring(caster.position.x, caster.position.z, radius, 0xffe9a0);
    sys.vfx(def.vfx?.cast ?? 'aura_ring', at(caster, 0.1), { scale: vfxScale(def.vfx?.cast ?? 'aura_ring', radius) });
    if (c.remote) return;
    const pip = def.pip;
    const coef = ((def.heal?.coef ?? 1) + (pip?.coefPerPip ?? 0) * Math.max(0, pipsSpent(c) - (pip?.min ?? 0))) * c.more;
    const hotDur = p.hotDur ?? 4;
    for (const a of aoeAllies(c)) {
      const amount = healFormula(caster as Player, coef, def.heal?.flat ?? 0).amount;
      wardOverheal(c, a, healAmount(caster as Player, a, amount));
      sys.vfx('heal_burst', at(a, a.height * 0.6), { scale: 0.8 });
      if ((p.hotPct ?? 0) > 0) giveStatus(c, a, 'dawn_hot', hotDur, (amount * p.hotPct) / hotDur);
    }
    sys.sfx('heal_big', caster.position);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// heal_bolt: Işık Oku (the Kutsal weapon chain)
// ---------------------------------------------------------------------------------------------------------

/** The friendly a chain bolt is bent toward: the aimed ally, else the selected friendly when no enemy is aimed. Never the caster. */
function boltAlly(c: CastCtx, range: number): Player | null {
  const aimed = inReach(c, playerOf(c.aim.allyId), range);
  if (aimed && aimed !== c.caster) return aimed;
  if (castTarget(c)) return null;
  const sel = inReach(c, playerOf(friendlyTargetId()), range);
  return sel && sel !== c.caster ? sel : null;
}

/** First ally standing in the lane of a bolt (flat world: lateral < 1.1 m, ahead of the caster, same level), nearer than `before`. */
function laneAlly(c: CastCtx, dir: [number, number], range: number, before: number): Player | null {
  const w = G.world;
  if (!w) return null;
  let best: Player | null = null;
  let bestAlong = before;
  for (const a of w.players) {
    if (a === c.caster || a.isDead || !w.sameLevel(a, c.caster.position.y)) continue;
    const vx = a.position.x - c.caster.position.x, vz = a.position.z - c.caster.position.z;
    const along = vx * dir[0] + vz * dir[1];
    if (along < 0.5 || along > range || along >= bestAlong) continue;
    if (Math.abs(-vx * dir[1] + vz * dir[0]) > 1.1 + a.radius * 0.5) continue;
    bestAlong = along;
    best = a;
  }
  return best;
}

const healBolt: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const count = Math.max(1, def.count ?? 1);
    const spread = def.spread ?? 0;
    const range = def.range ?? 26;
    const foe = enemyInReach(c, range);
    const base: [number, number] = foe ? sys.dirTo(caster, foe) : c.dir;
    if (c.remote) {
      // owner's announced ally frame: a light beam; otherwise the plain bolts fly (visual mode)
      const ally = c.aim.allyId !== null && c.aim.allyId !== undefined ? G.world?.getActor(c.aim.allyId) : undefined;
      if (ally && !ally.isDead && ally !== caster) { beamTo(c, ally, 'holy_beam'); sys.vfx('heal_burst', at(ally, ally.height * 0.6), { scale: 0.7 }); return; }
      for (let i = 0; i < count; i++) sys.fireProjectile(c, count > 1 ? rotDir(base, (i - (count - 1) / 2) * spread) : base, BOLT_Y, foe);
      return;
    }
    const bent = boltAlly(c, range);
    let healed = 0;
    for (let i = 0; i < count; i++) {
      const d = count > 1 ? rotDir(base, (i - (count - 1) / 2) * spread) : base;
      const ally = bent ?? laneAlly(c, d, range, foe ? dist2(foe.position, caster.position) : Infinity);
      if (ally) {
        wardOverheal(c, ally, healAmount(caster as Player, ally, healFormula(caster as Player, (def.heal?.coef ?? 0.4) * c.more).amount));
        sys.vfx('heal_burst', at(ally, ally.height * 0.6), { scale: 0.6 });
        beamTo(c, ally, 'holy_beam');
        healed++;
      } else {
        sys.fireProjectile(c, d, BOLT_Y, foe);
      }
    }
    // the faith refund of the chain comes per bolt: a bolt that hits an enemy pays `gain` in SkillSystem.afterHits, a bolt that heals pays it here
    if (healed > 0 && (p.gain ?? 0) > 0) sys.gainResource(caster, p.gain * healed);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, base, 0.9, BOLT_Y), { dir: [base[0], 0, base[1]], scale: 0.6 });
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// avengers_shield: İntikamcı Kalkan
// ---------------------------------------------------------------------------------------------------------

/** Cuts the enemy's running cast (interruptible only) and locks that ability, like the `interrupt` behaviour. True when a cast was cut. */
function cutCast(c: CastCtx, e: Enemy, lock: number): boolean {
  if (!e.cast?.interruptible) return false;
  const abilityId = e.cast.skillId;
  G.combat.onHardCC(e, c.caster.id);
  if (e.ai) e.ai.setCooldown(abilityId, Math.max(e.ai.cooldownLeft(abilityId), lock));
  G.events.emit('kick:request', { enemyId: e.id, casterId: c.caster.id });
  G.combat.meters.add('interrupt');
  G.net?.broadcast('kick', { id: c.caster.id, ready: c.def.cooldown });
  c.sys.vfx('interrupt_burst', [e.position.x, e.position.y + 1.2, e.position.z], { scale: 0.8 });
  return true;
}

/** One bolt of a chain: owner machines get the hit callback, remote replays a visual copy. */
function spawnShield(c: CastCtx, origin: [number, number, number], dir: [number, number], aimAt: Actor | null, onHit: (e: Enemy, pr: Projectile) => void): void {
  const { def, caster, sys } = c;
  Projectile.spawn({
    mode: c.remote ? 'visual' : 'player', owner: caster, vfx: (def.vfx?.projectile as VfxId) ?? 'holy_projectile',
    scale: def.radius && def.radius > 0.45 ? 1.4 : 1, origin, dir,
    speed: (def.speed ?? 22) * (1 + Math.max(0, sys.softStat(caster, 'projectileSpeedPct'))),
    radius: def.radius ?? 0.9, range: def.range ?? 30, dirY: aimSlope(caster, origin[1], aimAt),
    homing: def.targeting === 'target_projectile' && aimAt && def.homing ? { targetId: aimAt.id, turn: def.homing } : undefined,
    onHit: c.remote ? undefined : (e, pr) => onHit(e, pr),
  });
}

const avengersShield: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    const bounces = Math.max(0, Math.round(p.bounces ?? 2));
    const bounceRange = p.bounceRange ?? 7;
    const mult = p.bounceMult ?? 1;
    const base = def.damage?.coef ?? 1;
    const first = castTarget(c) as Enemy | null;
    const dir: [number, number] = first ? sys.dirTo(caster, first) : c.dir;
    const hit = new Set<unknown>();
    const riders = statusesWithout(c, 'taunt', 'silence');
    const leg = (k: number, origin: [number, number, number], d: [number, number], aimAt: Actor | null): void => {
      spawnShield(c, origin, d, aimAt, (e, pr) => {
        if (hit.has(e)) return;
        hit.add(e);
        const hd: [number, number] = [pr.dirX, pr.dirZ];
        const r = sys.strike(c, e, { coef: base * Math.pow(mult, k), dir: hd, statuses: riders });
        if (r) { sys.afterHits(c, [r]); impactVfx(c, e, hd, k); }
        if (!e.isDead) {
          const tauntDur = e.def.rank === 'boss' ? (p.bossTauntDur ?? 2) : (p.tauntDur ?? 3);
          // the taunt lands on the first target only (tauntFirst 1, default); tauntFirst 0 taunts every leg
          if (tauntDur > 0 && (k === 0 || p.tauntFirst === 0)) G.combat.applyEnemyStatuses(caster, e, [{ status: 'taunt', duration: tauntDur }]);
          const silence = p.silence ?? 0;
          if (silence > 0) {
            cutCast(c, e, p.lock ?? 4);
            G.combat.applyEnemyStatuses(caster, e, [{ status: 'silence', duration: silence }]);
          }
        }
        sys.vfx('block_spark', [e.position.x, e.position.y + e.height * 0.6, e.position.z], { scale: 0.8 });
        sys.sfx('shield_bash', e.position, { pitch: 1 + 0.06 * k });
        if (k >= bounces) return;
        const next = pickChainTarget(e.position, bounceRange, sys.enemiesNear(e.position.x, e.position.z, bounceRange, e.position.y), hit);
        if (!next) return;
        const nd = sys.dirTo(e, next);
        // the next leg starts clear of the enemy it leaves (its body + the shield's own radius), so it cannot touch that enemy again;
        // a neighbour closer than that gets the leg right in front of it instead
        const off = Math.min(e.radius + (def.radius ?? 0.9) + 0.25, Math.max(0.3, dist2(e.position, next.position) - next.radius - 0.1));
        leg(k + 1, [e.position.x + nd[0] * off, e.position.y + BOLT_Y, e.position.z + nd[1] * off], nd, next);
      });
    };
    leg(0, muzzle(c, dir, 0.9, BOLT_Y), dir, first);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, dir, 0.9, BOLT_Y), { dir: [dir[0], 0, dir[1]], scale: 0.6 });
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// hammer_of_wrath: Gazap Çekici
// ---------------------------------------------------------------------------------------------------------

/** Gazap Çekici may be thrown under wrath_wings, inside the exec_window watcher, or at a target below `threshold` HP (default 20 %). */
function wrathOpen(c: CastCtx, t: Enemy): boolean {
  const s = c.caster.statuses;
  return s.has('wrath_wings') || s.has('exec_window') || hpFrac(t) < (c.def.params?.threshold ?? 0.2);
}

const hammerOfWrath: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const range = c.def.range ?? 22;
    const t = enemyOrNearest(c, range, 60);
    if (!t) { c.sys.fail('target'); return false; }
    if (!wrathOpen(c, t)) { c.sys.fail('target'); return false; }
    c.target = t;
    c.data.wrathTarget = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const t = ((c.data.wrathTarget as Enemy | undefined) ?? castTarget(c)) as Enemy | null;
    const live = t && !t.isDead && !t.removed ? t : null;
    const d: [number, number] = live ? sys.dirTo(caster, live) : c.dir;
    sys.fireProjectile(c, d, BOLT_Y, live);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, d, 0.9, BOLT_Y), { dir: [d[0], 0, d[1]], scale: 0.6 });
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// splash_strike: Işık Çekici / İdam Hükmü
// ---------------------------------------------------------------------------------------------------------

const splashStrike: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const e = enemyOrNearest(c, c.def.range ?? 3.4, c.def.arc ?? 140);
    if (!e) { c.sys.fail('target'); return false; }
    c.data.primary = e;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 3.4;
    if (c.remote) {
      if ((def.range ?? 3.4) <= 5) swingVfx(c, range, def.arc ?? 140, true);
      if (def.vfx?.cast) sys.vfx(def.vfx.cast, at(caster, 0.1), { scale: 1 });
      return;
    }
    let prim = c.data.primary as Enemy | undefined;
    if (!prim || prim.isDead || prim.removed) prim = enemyOrNearest(c, range, def.arc ?? 140) ?? undefined;
    if (!prim) { sys.whiff(c); return; }
    if (range <= 5) swingVfx(c, range, def.arc ?? 140, true);
    const d = sys.dirTo(caster, prim);
    const results: DamageResult[] = [];
    const first = sys.strike(c, prim, { dir: d, weight: 'heavy', stagger: p.stagger });
    if (first) { results.push(first); impactVfx(c, prim, d, 0); }
    const radius = p.splashRadius ?? 5;
    const near = sys.enemiesNear(prim.position.x, prim.position.z, radius, prim.position.y)
      .filter((e) => e !== prim && !e.isDead && !e.removed)
      .sort((a, b) => dist2(a.position, prim!.position) - dist2(b.position, prim!.position))
      .slice(0, Math.max(0, Math.round(p.splashMax ?? 7)));
    if (def.vfx?.impact) sys.vfx(def.vfx.impact, [prim.position.x, 0.1, prim.position.z], { scale: vfxScale(def.vfx.impact, Math.min(radius, 6)) });
    for (const e of near) {
      const r = sys.strike(c, e, {
        dir: sys.dirTo(prim, e), more: p.splashMult ?? 0.5, weight: 'light', noGain: true, noHitstop: true, statuses: p.splashStatuses === 1 ? undefined : [],
      });
      if (r) results.push(r);
    }
    sys.afterHits(c, results);
    sys.shake(0.2 + 0.05 * Math.min(near.length, 6));
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// wake_of_ashes: Küllerin Uyanışı
// ---------------------------------------------------------------------------------------------------------

const wakeOfAshes: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 12;
    const arc = def.arc ?? 70;
    swingVfx(c, range, arc, true);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, at(caster, 0.1), { dir: [c.dir[0], 0, c.dir[1]], scale: vfxScale(def.vfx.cast, range * 0.5) });
    if (c.remote) return;
    const targets = sys.enemiesInCone(caster, c.dir, range, arc);
    const res = strikeMany(c, targets, Math.round(p.maxTargets ?? 99), { stagger: p.stagger, weight: 'heavy' });
    if (!res.length) { sys.whiff(c); sys.applySelf(c, def.selfStatuses ?? []); return; }
    // demons and the undead are stunned (bosses refuse hard CC inside StatusEffects)
    const stun = p.stunDur ?? 0;
    if (stun > 0) {
      for (const e of targets) {
        if (e.isDead || !ASH_FAMILIES.has(e.def.family ?? '')) continue;
        G.combat.applyEnemyStatuses(caster, e, [{ status: 'stun', duration: stun }]);
      }
    }
    // Sacrosanct Crusade: a share of max HP per enemy hit, capped at healMax hits
    const heal = p.healPct ?? 0;
    if (heal > 0) healAmount(caster as Player, caster as Player, caster.maxHp * heal * Math.min(res.length, Math.round(p.healMax ?? 3)));
    sys.shake(0.3);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// divine_steed: İlahi Binek
// ---------------------------------------------------------------------------------------------------------

/**
 * The dash of the engine (nav-clamped, CC-immune while it runs) without its landing slam and path damage, then the speed buff of the
 * row's selfStatuses at the end of the dash. Roots / slows go away through the row's `cleanses` when the cast is paid. Use
 * targeting 'dash' on the row (the cost is then paid before the move starts); the soft target is dropped so the steed never homes.
 */
const divineSteed: Behavior = {
  begin(c) {
    c.target = null;
    return TARGETING_BEHAVIORS.dash.begin ? TARGETING_BEHAVIORS.dash.begin(c) : true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx('haste_trail', at(caster, 0.1), { follow: caster.object3d, duration: def.params?.trail ?? 3, scale: 1.2 });
    sys.vfx(def.vfx?.cast ?? 'holy_burst', at(caster, 0.1), { scale: 0.7 });
    sys.sfx('whoosh', caster.position);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// ardent_defender: Yılmaz Savunucu
// ---------------------------------------------------------------------------------------------------------

/** Cast counter per player: a recast supersedes the pending expiry heal of the earlier cast. */
const ardentEpoch = new Map<EntityId, number>();

/**
 * Applies the row's `ardent` status; when it runs out unspent (still on the caster just before it ends) the caster heals
 * `expireHealPct` of max HP. The lethal-hit save itself is a `T lethal` proc on the spec (data package, see paladin_behaviors.md).
 */
const ardentDefender: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    sys.vfx('shield_bubble', at(caster, 1.1), { follow: caster.object3d, duration: 1.2, scale: 1.0 });
    sys.applySelf(c, def.selfStatuses ?? []);
    if (c.remote) return;
    const dur = def.selfStatuses?.find((s) => s.status === 'ardent')?.duration ?? 10;
    const pct = p.expireHealPct ?? 0.2;
    const epoch = (ardentEpoch.get(caster.id) ?? 0) + 1;
    ardentEpoch.set(caster.id, epoch);
    if (pct <= 0) return;
    sys.schedule(Math.max(0.1, dur - 0.05), () => {
      if (ardentEpoch.get(caster.id) !== epoch || caster.isDead || !caster.statuses.has('ardent')) return;
      healAmount(caster as Player, caster as Player, caster.maxHp * pct);
      sys.vfx('heal_burst', at(caster, 1.0), { scale: 1 });
    });
  },
};

Object.assign(BEHAVIORS_PALADIN, {
  heal_target: healTarget,
  heal_aoe: healAoe,
  heal_bolt: healBolt,
  avengers_shield: avengersShield,
  hammer_of_wrath: hammerOfWrath,
  splash_strike: splashStrike,
  wake_of_ashes: wakeOfAshes,
  divine_steed: divineSteed,
  ardent_defender: ardentDefender,
});

function installPaladin(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_PALADIN);
}

try {
  installPaladin();
} catch {
  queueMicrotask(installPaladin);
}
