/**
 * GDD_TALENTS §1.4 class utility skill behaviours (the s05 choice of every class tree). OWNER: combat (T9).
 *
 * Behaviours: `interrupt` (every kick), `intercept` (ally dash), `guardian_vow`, `ice_block`, `karma`, `feign`, `spirit_walk`,
 * `status_self` (plain self statuses + cleanse), `intimidate` (shout). Rows: data/skills_class_utils.ts.
 *
 * Damage-side rules are NOT applied here: `talentIncomingDamage()` is the hook Combat.hitLocalPlayer calls once per
 * non-DoT hit, after mitigation and before the absorb shield (T7 wiring). It handles the ward multipliers, the guardian
 * share (routed by the caller, see its doc) and the karma deferral (scheduled as local DoT ticks).
 *
 * Registration: this module is imported for its side effect at the end of combat/skills/behaviors.ts. The merge into
 * BEHAVIORS is attempted at once and deferred to a microtask when the ES module cycle has not defined BEHAVIORS yet.
 */
import { G } from '../../game/G';
import { dispelUpTo, friendlyTargetId, healAmount } from '../healing';
import { BEHAVIORS } from './behaviors';
import type { Behavior, CastCtx } from './behaviors';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DamageType, EntityId } from '../../types/common';
import type { StatusId } from '../../types/skills';

/** A kicked ability cannot restart for this long (GDD_TALENTS §1.4: "lock that ability 4 s", V2 §8.4). */
const KICK_LOCK_SEC = 4;
/** Karma: the deferred share of each hit, paid back as DoT over this many seconds in ticks of KARMA_TICK. */
const KARMA_SHARE = 0.6;
const KARMA_SEC = 6;
const KARMA_TICK = 0.5;
/** Guardian vow: the guardian takes this share of the ward's damage, at most GUARDIAN_CAP of its max HP per second. */
const GUARDIAN_SHARE = 0.3;
const GUARDIAN_CAP = 0.15;
/** Damage multipliers of the wards (taken damage). */
const INTERCEPT_WARD_MUL = 0.75;
const RESOLVE_PACT_MUL = 0.7;
const SPIRIT_WALK_PHYS_MUL = 0.7;
/** Ally dash speed (m/s) and the distance of a forward dash without an ally (m). */
const INTERCEPT_SPEED = 30;
const INTERCEPT_FORWARD = 12;

const DEG = Math.PI / 180;
const at = (a: Actor, y: number): [number, number, number] => [a.position.x, a.position.y + y, a.position.z];
const distXZ = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** A live enemy that is casting something it can be interrupted from. */
function kickable(a: Actor | null | undefined): a is Enemy {
  return !!a && a.kind === 'enemy' && !a.isDead && !a.removed && !!a.cast?.interruptible;
}

/**
 * The enemy a kick cuts: the target of the cast (soft target / aimed target) first, else the nearest interruptible cast
 * inside the reach and the arc (arc 360 = all around). Null when no interruptible cast is in reach.
 */
function kickTarget(c: CastCtx, range: number, arc: number): Enemy | null {
  const w = G.world;
  if (!w) return null;
  const me = c.caster.position;
  const inReach = (e: Actor): boolean => distXZ(e.position.x, e.position.z, me.x, me.z) - e.radius <= range;
  const inArc = (e: Actor): boolean => {
    if (arc >= 360) return true;
    const dx = e.position.x - me.x, dz = e.position.z - me.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return true;
    return (dx * c.dir[0] + dz * c.dir[1]) / d >= Math.cos((arc / 2) * DEG);
  };
  const aimed = c.aim.targetId != null ? w.getActor(c.aim.targetId) : undefined;
  for (const cand of [c.target, aimed]) {
    if (kickable(cand) && inReach(cand) && inArc(cand)) return cand;
  }
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of w.enemiesInRadius({ x: me.x, z: me.z }, range + 2, me.y)) {
    if (!kickable(e) || !inReach(e) || !inArc(e)) continue;
    const d = distXZ(e.position.x, e.position.z, me.x, me.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** The ally a support skill targets: the aimed ally (aim.allyId), else the selected friendly (U / F1-F5). Never the caster. */
function allyOf(c: CastCtx, range: number): Player | null {
  const w = G.world;
  if (!w) return null;
  const me = c.caster;
  const ok = (p: Player | undefined): p is Player =>
    !!p && p.kind === 'player' && p !== me && !p.isDead && !p.removed &&
    distXZ(p.position.x, p.position.z, me.position.x, me.position.z) <= range + p.radius;
  const aimed = c.aim.allyId != null ? w.get<Player>(c.aim.allyId) : undefined;
  if (ok(aimed)) return aimed;
  const sel = w.get<Player>(friendlyTargetId());
  return ok(sel) ? sel : null;
}

/**
 * Gives a status to any actor. A remote player gets the 'pstatus' message its owner applies (the same path as
 * SkillSystem.applyPartyAt), so the status lands on the player's own machine.
 */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude = 0): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

// ---------------------------------------------------------------------------------------------------------
// kicks
// ---------------------------------------------------------------------------------------------------------

/**
 * Every class kick (GDD_TALENTS §1.4): cuts an interruptible cast, locks the cut ability for 4 s, then applies
 * `params.silence` (default 3 s) and `params.stun` (default 0) to the target. The effects go through StatusEffects.apply,
 * which already makes bosses and minibosses immune to hard CC and silence, so bosses only lose the cast.
 * No interruptible cast in reach: the skill fails before paying (no cost, no cooldown).
 */
const interrupt: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const e = kickTarget(c, c.def.range ?? 3, c.def.arc ?? 360);
    if (!e) { c.sys.fail('target'); return false; }
    c.data.kick = e.id;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const range = def.range ?? 3, arc = def.arc ?? 360;
    // the target picked at begin() still counts when it stayed in reach; otherwise pick again
    const picked = c.data.kick != null ? G.world?.get<Enemy>(c.data.kick as EntityId) : undefined;
    const e = kickable(picked) && distXZ(picked.position.x, picked.position.z, caster.position.x, caster.position.z) - picked.radius <= range + 0.5
      ? picked
      : kickTarget(c, range, arc);
    if (!e || !e.cast) { sys.fail('target'); return; }
    const abilityId = e.cast.skillId;
    // 1. cut the cast (enemy:castEnd + the 'ecast' end message, the same path as a stun)
    G.combat.onHardCC(e, caster.id);
    // 2. the cut ability cannot restart for KICK_LOCK_SEC
    if (e.ai) e.ai.setCooldown(abilityId, Math.max(e.ai.cooldownLeft(abilityId), KICK_LOCK_SEC));
    // 3. feedback: kick:request, meters, the kick tracker of the other players
    G.events.emit('kick:request', { enemyId: e.id, casterId: caster.id });
    G.combat.meters.add('interrupt');
    sys.hitstopMs(50);
    sys.shake(0.15, 0.12);
    sys.sfx('shield_bash', e.position);
    sys.vfx('interrupt_burst', [e.position.x, e.position.y + 1.2, e.position.z], { scale: 0.8 });
    try { G.vfx.damageNumber([e.position.x, e.position.y + e.height, e.position.z], 0, 'crit', 'KESİLDİ!'); } catch { /* cosmetic */ }
    G.net?.broadcast('kick', { id: caster.id, ready: def.cooldown });
    // 4. crowd control on the target (boss immunity is applied by StatusEffects)
    const silence = def.params?.silence ?? 3;
    const stun = def.params?.stun ?? 0;
    if (silence > 0) e.statuses.apply('silence', silence, { sourceId: caster.id });
    if (stun > 0) e.statuses.apply('stun', stun, { sourceId: caster.id });
    if (def.params?.gainRes) sys.addResource(caster, def.params.gainRes);
  },
};

// ---------------------------------------------------------------------------------------------------------
// allies
// ---------------------------------------------------------------------------------------------------------

/** Müdahale: dash to the ally (stops 1.2 m short, max 20 m) or 12 m forward; the ally gets its ward (row statuses). */
const intercept: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const ally = allyOf(c, def.range ?? 20);
    const speed = def.params?.speed ?? INTERCEPT_SPEED;
    let dir: [number, number] = c.dir;
    let dist = def.params?.forward ?? INTERCEPT_FORWARD;
    if (ally) {
      const dx = ally.position.x - caster.position.x, dz = ally.position.z - caster.position.z;
      const d = Math.hypot(dx, dz);
      dist = Math.max(0, d - (caster.radius + ally.radius + 1.2));
      if (d > 1e-4) dir = [dx / d, dz / d];
    }
    if (dist > 0.3) sys.moveActor(caster, dir[0] * speed, dir[1] * speed, dist / speed);
    if (ally) for (const s of def.statuses ?? []) giveStatus(c, ally, s.status, s.duration, s.magnitude ?? 0);
    if (def.params?.gainRes) sys.addResource(caster, def.params.gainRes);
    sys.sfx('whoosh', caster.position);
  },
};

/** Muhafız Yemini: the ally gets `guardian_vow` (sourceId = the caster, read by talentIncomingDamage on the ally's side). */
const guardianVow: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const ally = allyOf(c, c.def.range ?? 25);
    if (!ally) { c.sys.fail('target'); return false; }
    c.data.ally = ally.id;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const ally = G.world?.get<Player>(c.data.ally as EntityId | undefined);
    if (!ally || ally.isDead) return;
    for (const s of def.statuses ?? []) giveStatus(c, ally, s.status, s.duration, s.magnitude ?? 0);
    sys.vfx('shield_bubble', at(ally, 1.1), { follow: ally.object3d, duration: 1.2, scale: 1.0 });
    sys.sfx('buff', caster.position);
  },
};

// ---------------------------------------------------------------------------------------------------------
// self
// ---------------------------------------------------------------------------------------------------------

/** Buz Küresi: 4 s invulnerable and frozen (no moves, no skills), root/slow cleansed, 20% max HP back when it ends. */
const iceBlock: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    const dur = def.params?.dur ?? 4;
    sys.vfx('shield_bubble', at(caster, 1.1), { follow: caster.object3d, duration: dur, scale: 1.2 });
    if (c.remote) return;
    // freeze first: StatusEffects refuses hostile kinds while invulnerable
    caster.statuses.apply('freeze', dur, { sourceId: caster.id });
    caster.statuses.apply('invulnerable', dur, { sourceId: caster.id });
    dispelUpTo(caster, 99, ['root', 'slow']);
    sys.sfx('buff', caster.position);
    const healPct = def.params?.healPct ?? 0.2;
    sys.schedule(dur, () => {
      if (!caster.isDead) healAmount(caster, caster, caster.maxHp * healPct, false);
    });
  },
};

/**
 * Plain self statuses from the row (`selfStatuses`, in row order), optional cleanse (`params.cleanse`) and cc immunity
 * (`params.ccImmune` seconds). Used by karma, spirit walk, cloak, divine shield and resolve rows.
 */
const selfStatus: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, at(caster, 0.1), { follow: caster.object3d, duration: 1.2, scale: 1.1 });
    if (c.remote) return;
    if (def.params?.cleanse) dispelUpTo(caster, 99);
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    if (def.params?.ccImmune) caster.statuses.addImmunity('cc', def.params.ccImmune);
    sys.sfx('buff', caster.position);
  },
};

/**
 * Ölü Taklidi: every enemy the caster is on the threat table of forgets it, and the enemy's current target is dropped.
 * Only enemies this peer has authority over are changed (the same rule as the provoke behaviour).
 */
const feign: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    sys.vfx('stealth_smoke', at(caster, 0.2), { follow: caster.object3d, duration: 1.5, scale: 1.0 });
    if (c.remote) return;
    for (const e of G.world?.enemies ?? []) {
      if (e.isDead || e.removed || !e.authority || !e.ai) continue;
      e.ai.threat.delete(caster.id);
      if (e.ai.target === caster) e.ai.target = null;
    }
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    sys.sfx('buff', caster.position);
  },
};

// ---------------------------------------------------------------------------------------------------------
// area
// ---------------------------------------------------------------------------------------------------------

/** Korkutucu Haykırış: normal enemies fear (elites half, through StatusEffects); bosses and minibosses take `curse` (-20% damage). */
const intimidate: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    const r = def.radius ?? 6;
    sys.ring(caster.position.x, caster.position.z, r, 0xd9a441);
    sys.sfx('war_cry', caster.position);
    if (c.remote) return;
    const fear = def.params?.fear ?? 6;
    const curse = def.params?.curse ?? 6;
    for (const e of G.world?.enemiesInRadius({ x: caster.position.x, z: caster.position.z }, r, caster.position.y) ?? []) {
      if (e.isDead) continue;
      if (e.isBoss || e.def.rank === 'miniboss') e.statuses.apply('curse', curse, { sourceId: caster.id });
      else e.statuses.apply('fear', fear, { sourceId: caster.id });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// incoming damage (hook for Combat.hitLocalPlayer, T7 wiring)
// ---------------------------------------------------------------------------------------------------------

/** Routes a guardian's share to the guardian. Return true when the guardian took it (only then the victim keeps less). */
export type GuardianRoute = (guardianId: EntityId, amount: number, type: DamageType) => boolean;

interface GuardianWindow { t0: number; sum: number }
const guardianWindows = new Map<EntityId, GuardianWindow>();

interface KarmaPool { left: number; end: number; type: DamageType; sourceId: EntityId | null; next: number }
const karmaPools = new Map<EntityId, KarmaPool>();

/**
 * Schedules karma damage on the victim's own machine: DoT ticks every 0.5 s until `end`, each through hitLocalPlayer
 * (isDot, floorHp 1: the DoT never kills). Returns false when the damage could not be scheduled.
 */
function deferKarma(victim: Player, amount: number, type: DamageType, sourceId: EntityId | null): boolean {
  const w = G.world;
  const sys = G.skills;
  if (!w || !sys || !(amount > 0)) return false;
  const now = w.time;
  const cur = karmaPools.get(victim.id);
  if (cur && now < cur.end) { cur.left += amount; cur.type = type; return true; }
  const pool: KarmaPool = { left: amount, end: now + KARMA_SEC, type, sourceId, next: now + KARMA_TICK };
  karmaPools.set(victim.id, pool);
  sys.addTask(() => {
    const t = w.time;
    if (victim.removed || victim.isDead) {
      if (karmaPools.get(victim.id) === pool) karmaPools.delete(victim.id);
      return true;
    }
    if (t < pool.next && t < pool.end) return false;
    pool.next = t + KARMA_TICK;
    // the remaining damage is spread over the remaining ticks; the last tick (or an overdue pool) pays everything left
    const ticks = Math.max(1, Math.round((pool.end - t) / KARMA_TICK));
    const dmg = pool.left / ticks;
    pool.left -= dmg;
    if (dmg > 0.01) G.combat.hitLocalPlayer({ sourceId: pool.sourceId, amount: dmg, type: pool.type, isDot: true, floorHp: 1 });
    if (t >= pool.end - 1e-3 || pool.left <= 0.01) {
      if (karmaPools.get(victim.id) === pool) karmaPools.delete(victim.id);
      return true;
    }
    return false;
  });
  return true;
}

/**
 * The incoming-damage hook of the talent utility wards. Call it from Combat.hitLocalPlayer for the LOCAL player, once per
 * damaging hit that is not a DoT tick (`hit.isDot` false), after mitigate() / damage reduction / takenMore and before
 * statuses.absorb(). Returns the damage the victim keeps.
 *
 * - intercept_ward x0.75, resolve_pact x0.7, spirit_walk x0.7 for physical hits.
 * - guardian_vow (ward source = the guardian): 30% of the hit is offered to the guardian, at most 15% of the guardian's
 *   max HP per second. `route` must deliver it (a local guardian, or a net message to its owner) and return true; without
 *   a route, or when it returns false, the victim keeps that share (no damage is lost).
 * - karma_ward: 60% of the hit is deferred into a 6 s DoT on the victim's machine (floor 1 HP).
 */
export function talentIncomingDamage(victim: Player, amount: number, type: DamageType, sourceId: EntityId | null, route?: GuardianRoute): number {
  if (!(amount > 0)) return 0;
  const st = victim.statuses;
  let kept = amount;
  if (st.has('resolve_pact')) kept *= RESOLVE_PACT_MUL;
  if (st.has('intercept_ward')) kept *= INTERCEPT_WARD_MUL;
  if (type === 'physical' && st.has('spirit_walk')) kept *= SPIRIT_WALK_PHYS_MUL;

  const vow = st.get('guardian_vow');
  if (vow && vow.sourceId != null && route) {
    const guardian = G.world?.get<Player>(vow.sourceId);
    const maxHp = guardian?.maxHp ?? victim.maxHp;
    const now = G.world?.time ?? 0;
    let win = guardianWindows.get(vow.sourceId);
    if (!win || now - win.t0 >= 1) { win = { t0: now, sum: 0 }; guardianWindows.set(vow.sourceId, win); }
    const share = Math.min(kept * GUARDIAN_SHARE, Math.max(0, GUARDIAN_CAP * maxHp - win.sum));
    if (share > 0 && route(vow.sourceId, share, type)) {
      win.sum += share;
      kept -= share;
    }
  }

  if (st.has('karma_ward')) {
    const deferred = kept * KARMA_SHARE;
    if (deferKarma(victim, deferred, type, sourceId)) kept -= deferred;
  }
  return Math.max(0, kept);
}

// ---------------------------------------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------------------------------------

/** Behaviour ids of the §1.4 rows (`SkillDef.behavior`). */
export const UTILITY_BEHAVIORS: Record<string, Behavior> = {
  interrupt,
  intercept,
  guardian_vow: guardianVow,
  ice_block: iceBlock,
  karma: selfStatus,
  feign,
  spirit_walk: selfStatus,
  status_self: selfStatus,
  intimidate,
};

function installUtilityBehaviors(): void {
  Object.assign(BEHAVIORS, UTILITY_BEHAVIORS);
}

// Side effect of the import at the end of behaviors.ts: BEHAVIORS is still in its temporal dead zone while this module
// evaluates inside that cycle, so the merge falls back to a microtask (casts happen long after module evaluation).
try {
  installUtilityBehaviors();
} catch {
  queueMicrotask(installUtilityBehaviors);
}
