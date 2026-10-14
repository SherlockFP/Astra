/**
 * NC48 shared behaviours (GDD_CLASSES_V2 §14 row 48; plate-melee §g PM-PA / PM-NE rely on them). Installed into BEHAVIORS by the
 * import at the end of behaviors.ts (microtask fallback, as in plateKit.ts):
 *   chain_projectile  a bolt that bounces to the nearest unhit enemy within `bounceRange` up to `bounces` times; leg k deals
 *                     coef x bounceMult^k (Çi Dalgası, Kalkan Savurma; Avenger's Shield with bounces 2)
 *   pip_finisher      generalised eviscerate: coef = damage.coef + pip.coefPerPip x (spent - pip.min); the pip spend itself is paid
 *                     by SkillSystem.pay (pip.consume 'all' | N)
 *   target_status     marks the resolved target: strike (if the row has a coefficient), then def.statuses on it and def.selfStatuses
 *                     on the caster; a bolt when the row is projectile-targeted (Avcı İşareti, Büyücü Dokunuşu, İdam Hükmü)
 *   channel_cone      channel that strikes every enemy in the cone each tick (`params.tick`); on a full channel a final heavy hit
 *                     (`finalCoef`, `finalKnock`, `finalStagger`). Cennet Yumrukları
 *   beam_drain        channel on one beam target: each tick strikes it, heals the caster for `heal` x damage dealt, costs
 *                     `costPerSec`; a kill adds `shardOnKill` shard pips (Kan Emişi, Can Emme)
 *   orbit_hammers     `hammers` hammers circle the caster at `orbitRadius`, one revolution per `orbitTime`; each hammer hits each
 *                     enemy at most once per revolution with `hammerCoef` for `duration` s (Kutsanmış Çekiç)
 * Minion hooks (Kan Emişi `healMinion`, Ölüm Mührü-style minion effects) are NOT implemented here: the minion agent owns them.
 */
import { G } from '../../game/G';
import { Projectile } from '../../entities/Projectile';
import { addAbsorb, alliesInRange, friendlyTargetId, healAlly, healAmount, healFormula } from '../healing';
import { aimSlope, clearSight, BEHAVIORS, castTarget, dist2, enemiesIn, impactVfx, muzzle, strikeMany, swingVfx, type Behavior, type CastCtx } from './behaviors';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { StatusId } from '../../types/skills';
import type { DamageResult } from '../Combat';
import type { VfxId } from '../../types/vfx';

export const BEHAVIORS_SHARED: Record<string, Behavior> = {};

/** Spawn height of a caster-launched bolt (matches the projectile / pip-finisher rows of the existing kits). */
const BOLT_Y = 1.35;

/**
 * Next chain target: the nearest alive candidate within `range` of `from` that is not in `hit`. Pure (no world access) so the sim
 * can check bounce selection directly. Returns null when nothing qualifies.
 */
export function pickChainTarget<T extends { position: { x: number; z: number }; isDead: boolean }>(
  from: { x: number; z: number }, range: number, cands: readonly T[], hit: ReadonlySet<unknown>,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const e of cands) {
    if (e.isDead || hit.has(e)) continue;
    const d = Math.hypot(e.position.x - from.x, e.position.z - from.z);
    if (d > range || d >= bestD) continue;
    bestD = d;
    best = e;
  }
  return best;
}

/** The skill's soft / hard target when it is an alive enemy within `range` (edge distance), else null. */
function targetInRange(c: CastCtx, range: number): Enemy | null {
  const t = castTarget(c);
  if (!t || t.team !== 'enemy') return null;
  return dist2(t.position, c.caster.position) - t.radius <= range ? (t as Enemy) : null;
}

/** Target of a single-target row: the aimed / soft target in range, else the nearest enemy in a 120 deg cone (local casts only). */
function singleTarget(c: CastCtx, range: number): Enemy | null {
  const hard = targetInRange(c, range);
  if (hard || c.remote) return hard;
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of c.sys.enemiesInCone(c.caster, c.dir, range, 120)) {
    const d = dist2(e.position, c.caster.position);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/**
 * Spawns one bolt of the skill from `origin` along `dir` (aim slope in vertical worlds, homing for target_projectile rows).
 * `onHit` runs on the owner's machine only; remote replays spawn a visual-only bolt.
 */
function spawnBolt(c: CastCtx, origin: [number, number, number], dir: [number, number], aimAt: Actor | null, onHit: (e: Enemy, pr: Projectile) => void): void {
  const { def, caster, sys } = c;
  const speedMul = 1 + Math.max(0, sys.softStat(caster, 'projectileSpeedPct'));
  Projectile.spawn({
    mode: c.remote ? 'visual' : 'player',
    owner: caster,
    vfx: (def.vfx?.projectile as VfxId) ?? 'arcane_projectile',
    scale: def.radius && def.radius > 0.45 ? 1.4 : 1,
    origin,
    dir,
    speed: (def.speed ?? 25) * speedMul,
    radius: def.radius ?? 0.4,
    range: def.range ?? 25,
    dirY: aimSlope(caster, origin[1], aimAt),
    homing: def.targeting === 'target_projectile' && aimAt && def.homing ? { targetId: aimAt.id, turn: def.homing } : undefined,
    onHit: c.remote ? undefined : (e, pr) => onHit(e, pr),
  });
}

// ---- chain_projectile -----------------------------------------------------------------------------------------------------

const chainProjectile: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const p = def.params ?? {};
    const bounces = Math.max(0, Math.round(p.bounces ?? 0));
    const bounceRange = p.bounceRange ?? 6;
    const mult = p.bounceMult ?? 1;
    const base = def.damage?.coef ?? 1;
    const first = targetInRange(c, def.range ?? 25);
    const dir: [number, number] = first ? sys.dirTo(caster, first) : c.dir;
    const hit = new Set<unknown>();
    const leg = (k: number, origin: [number, number, number], d: [number, number], aimAt: Actor | null): void => {
      spawnBolt(c, origin, d, aimAt, (e, pr) => {
        hit.add(e);
        const hd: [number, number] = [pr.dirX, pr.dirZ];
        const r = sys.strike(c, e, { coef: base * Math.pow(mult, k), dir: hd });
        if (r) { sys.afterHits(c, [r]); impactVfx(c, e, hd, k); }
        if (k >= bounces) return;
        const near = sys.enemiesNear(e.position.x, e.position.z, bounceRange, e.position.y);
        const next = pickChainTarget(e.position, bounceRange, near, hit);
        if (!next) return;
        const nd = sys.dirTo(e, next);
        // the new leg starts a body-length past the enemy it leaves, so the bolt cannot touch that enemy again
        leg(k + 1, [e.position.x + nd[0] * 1.1, e.position.y + BOLT_Y, e.position.z + nd[1] * 1.1], nd, next);
      });
    };
    leg(0, muzzle(c, dir, 0.9, BOLT_Y), dir, first);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, dir, 0.9, BOLT_Y), { dir: [dir[0], 0, dir[1]], scale: 0.6 });
  },
};

// ---- pip_finisher ---------------------------------------------------------------------------------------------------------

const pipFinisher: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const pip = def.pip;
    const range = def.range ?? 2.8;
    const arc = def.arc ?? 60;
    swingVfx(c, range, arc, true);
    if (c.remote) return;
    // pip amount paid by pay() (remote replays carry no spend: visuals only, see the remote branch above)
    const spent = (c.data.pipSpent as number | undefined) ?? 0;
    const min = pip?.min ?? 0;
    const coef = (def.damage?.coef ?? 1) + (pip?.coefPerPip ?? 0) * Math.max(0, spent - min);
    const targets = sys.enemiesInCone(caster, c.dir, range, arc);
    const res = strikeMany(c, targets, p.maxTargets ?? 3, {
      coef, weight: 'heavy', stagger: (p.stagger ?? 8) + (p.staggerPerPip ?? 0) * spent, noGain: true,
      hitstop: 70 + spent * 10, shake: 0.28 + spent * 0.04,
    });
    if (!res.length) sys.whiff(c);
  },
};

// ---- target_status --------------------------------------------------------------------------------------------------------

/** A status-row hit: the coefficient strike (rows with damage only), then the row's statuses on the target. */
function markHit(c: CastCtx, e: Enemy): void {
  const { sys, def, caster } = c;
  const dir = sys.dirTo(caster, e);
  if ((def.damage?.coef ?? 0) > 0) {
    const r = sys.strike(c, e, { dir, statuses: [] });
    if (r) { sys.afterHits(c, [r]); impactVfx(c, e, dir, 0); }
  }
  if (def.statuses?.length) sys.statusOnly(c, e, def.statuses);
}

const targetStatus: Behavior = {
  begin(c) {
    const { caster, sys, def } = c;
    // bolt rows fly toward the aim even without a target (the miss is the bolt's own), so only instant rows need one
    if (c.remote || def.targeting === 'projectile' || def.targeting === 'target_projectile') return true;
    const range = def.range ?? 25;
    const t = singleTarget(c, range);
    if (!t) { sys.fail('target'); return false; }
    if (dist2(t.position, caster.position) - t.radius > range || !clearSight(caster, t)) { sys.fail('range'); return false; }
    c.target = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const range = def.range ?? 25;
    if (def.targeting === 'projectile' || def.targeting === 'target_projectile') {
      const t = c.remote ? castTarget(c) as Enemy | null : singleTarget(c, range);
      const d: [number, number] = t ? sys.dirTo(caster, t) : c.dir;
      spawnBolt(c, muzzle(c, d, 0.9, BOLT_Y), d, t, (e) => markHit(c, e));
      if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, d, 0.9, BOLT_Y), { dir: [d[0], 0, d[1]], scale: 0.6 });
      return;
    }
    if (c.remote) return;
    const t = c.target as Enemy | null;
    if (!t || t.isDead) { sys.whiff(c); return; }
    markHit(c, t);
    if (def.selfStatuses?.length) sys.applySelf(c, def.selfStatuses);
  },
};

// ---- channel_cone ---------------------------------------------------------------------------------------------------------

/** The cone of a channel follows the caster's current facing (the cast's direction is only the start). */
function facingDir(c: CastCtx): [number, number] {
  return [Math.sin(c.caster.yaw), Math.cos(c.caster.yaw)];
}

const channelCone: Behavior = {
  fire(c) {
    // the channel's opening pose: one wide swing; the damage comes from the ticks (tick / end below)
    swingVfx(c, c.def.range ?? 4, c.def.arc ?? 100, true);
  },
  tick(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 4;
    const arc = def.arc ?? 100;
    const every = p.tick ?? 0.3;
    if (!c.remote) sys.actSlow(caster, p.moveSlow ?? 0.1, every + 0.1);
    if (c.remote) return true;
    const dir = facingDir(c);
    const res: DamageResult[] = [];
    for (const e of sys.enemiesInCone(caster, dir, range, arc)) {
      const r = sys.strike(c, e, { tick: true, noGain: true, dir: sys.dirTo(caster, e), noHitstop: true });
      if (r) res.push(r);
    }
    if (res.length) sys.afterHits(c, res);
    return true;
  },
  end(c, reason) {
    // only a channel that ran to its end lands the finisher; an interrupted or cancelled one stops at its ticks
    if (reason !== 'done' || c.remote) return;
    const p = c.def.params ?? {};
    const range = c.def.range ?? 4;
    const dir = facingDir(c);
    const targets = c.sys.enemiesInCone(c.caster, dir, range, c.def.arc ?? 100);
    strikeMany(c, targets, 99, {
      coef: p.finalCoef ?? 3, weight: 'heavy', stagger: p.finalStagger, knockback: p.finalKnock, noGain: true,
      hitstop: 80, shake: 0.4,
    });
  },
};

// ---- beam_drain -----------------------------------------------------------------------------------------------------------

/** The beam's target: the aimed / soft target when in range, else the nearest enemy along the aim line. */
function beamTarget(c: CastCtx, range: number): Enemy | null {
  const hard = targetInRange(c, range);
  if (hard) return hard;
  if (c.remote) return null;
  const w = G.world;
  const line = w?.actorsInLine({ x: c.caster.position.x, z: c.caster.position.z }, { x: c.dir[0], z: c.dir[1] }, range, c.def.radius ?? 1.2, (a) => a.team === 'enemy' && !a.isDead, c.caster.position.y) ?? [];
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of line as unknown as Enemy[]) {
    const d = dist2(e.position, c.caster.position);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

const beamDrain: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = beamTarget(c, c.def.range ?? 12);
    if (!t) { c.sys.fail('target'); return false; }
    c.target = t;
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx('drain_beam', [caster.position.x, caster.position.y + 1.2, caster.position.z], { follow: caster.object3d, duration: def.channel ?? 6, scale: 1 });
    if (c.target) sys.vfx('drain_beam', [c.target.position.x, c.target.position.y + c.target.height * 0.5, c.target.position.z], { duration: def.channel ?? 6, scale: 0.8 });
    if (!c.remote) sys.actSlow(caster, def.params?.moveSlow ?? 0.5, 0.6);
  },
  tick(c, n) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const every = p.tick ?? 0.5;
    if (c.remote) return true;
    const cost = (p.costPerSec ?? 0) * every * sys.costMult(caster, def);
    if (n > 0 && cost > 0 && !sys.spend(caster, cost)) return false;
    sys.actSlow(caster, p.moveSlow ?? 0.5, every + 0.1);
    const t = c.target as Enemy | null;
    const range = (def.range ?? 12) + (t?.radius ?? 0);
    if (!t || t.isDead || t.removed || dist2(t.position, caster.position) > range || !clearSight(caster, t)) return false;
    const r = sys.strike(c, t, { tick: true, noGain: true, dir: sys.dirTo(caster, t), noHitstop: true });
    if (r && r.amount > 0) healAmount(caster, caster, r.amount * (p.heal ?? 0.5), true);
    // TODO(minions, NC41): p.healMinion (Kan Emişi heals minions within 8 m for 50 %) once the Minions manager exposes its list
    if (t.isDead && (p.shardOnKill ?? 0) > 0) sys.addPip(caster, 'shard', p.shardOnKill);
    return true;
  },
};

// ---- orbit_hammers --------------------------------------------------------------------------------------------------------

const orbitHammers: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const n = Math.max(1, Math.round(p.hammers ?? 3));
    const period = Math.max(0.2, p.orbitTime ?? 0.9);
    const radius = p.orbitRadius ?? def.radius ?? 4.2;
    const life = def.duration ?? 6;
    const coef = p.hammerCoef ?? 0.6;
    const hitGap = period * 0.9;
    const lastHit = new Map<string, number>();
    let t = 0;
    let vfxT = 0;
    sys.addTask((dt) => {
      t += dt;
      if (t >= life || caster.isDead) return true;
      const a0 = (2 * Math.PI * t) / period;
      const pos: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * 2 * Math.PI) / n;
        pos.push([caster.position.x + Math.cos(a) * radius, caster.position.z + Math.sin(a) * radius]);
      }
      if (!c.remote) {
        const res: DamageResult[] = [];
        pos.forEach(([hx, hz], i) => {
          for (const e of enemiesIn(hx, hz, 1.3, caster.position.y)) {
            if (e.isDead) continue;
            const key = `${i}:${String(e.id)}`;
            if (t - (lastHit.get(key) ?? -Infinity) < hitGap) continue;
            lastHit.set(key, t);
            const r = sys.strike(c, e, { coef, weight: 'light', noGain: true, noHitstop: true, dir: sys.dirTo(caster, e) });
            if (r) res.push(r);
          }
        });
        if (res.length) sys.afterHits(c, res);
      }
      vfxT += dt;
      if (vfxT >= 0.25) {
        vfxT = 0;
        for (const [hx, hz] of pos) sys.vfx('holy_hammer', [hx, caster.position.y + 1.2, hz], { scale: 0.8 });
      }
      return false;
    });
  },
};

// ---- Midnight defensive / utility rows -----------------------------------------------------------------------------------
// Generic: each reads its numbers from params, statuses, selfStatuses or a minion, so a new row of the same shape is data only.

/** Movement locks that Özgürlük Duası (`params.cleanse`) removes from its ally. */
const MOVE_LOCKS: StatusId[] = ['root', 'slow', 'act_root'];

/**
 * The ally a support row targets: the aimed ally (aim.allyId), else the selected friendly (U / F1-F5). Null when neither is alive,
 * in reach and not the caster.
 */
function supportAlly(c: CastCtx, range: number): Player | null {
  const w = G.world;
  if (!w) return null;
  const me = c.caster;
  const ok = (p: Player | undefined): p is Player =>
    !!p && p.kind === 'player' && p !== me && !p.isDead && !p.removed && dist2(p.position, me.position) <= range + p.radius;
  const aimed = c.aim.allyId != null ? w.get<Player>(c.aim.allyId) : undefined;
  if (ok(aimed)) return aimed;
  const sel = friendlyTargetId();
  const picked = sel != null ? w.get<Player>(sel) : undefined;
  return ok(picked) ? picked : null;
}

/** Gives a status to an actor. A remote player gets the 'pstatus' message its owner applies (the utilities giveStatus pattern). */
function giveSupportStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude: number): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/**
 * Ally buff (Işık Mekanı, Koruma Duası, Özgürlük Duası): the picked ally (the caster when `params.self` and no ally is picked) gets
 * the row's `statuses` (magnitude = the status's magnitude). `params.cleanse` removes the movement locks from it. `params.forbearance`
 * refuses a target that still has `forbearance`. `params.exclusive` removes the caster's previous copy of the first status from the
 * other local allies (one Beacon of Light at a time; a remote ally's copy is left to its owner).
 */
const allyBuff: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const p = c.def.params ?? {};
    const target: Actor | null = supportAlly(c, c.def.range ?? 25) ?? (p.self ? c.caster : null);
    if (!target) { c.sys.fail('target'); return false; }
    if (p.forbearance && target.statuses.has('forbearance')) { c.sys.fail('target'); return false; }
    c.data.target = target;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    const p = def.params ?? {};
    if (c.remote) return;
    const target = c.data.target as Actor | undefined;
    if (!target || target.isDead) return;
    const own = def.statuses?.[0]?.status;
    if (p.exclusive && own) {
      for (const b of G.world?.players ?? []) if (b !== target && b.statuses.get(own)?.sourceId === caster.id) b.statuses.remove(own);
    }
    if (p.cleanse) for (const id of MOVE_LOCKS) if (target.statuses.has(id)) target.statuses.remove(id);
    for (const s of def.statuses ?? []) giveSupportStatus(c, target, s.status, s.duration, s.magnitude ?? 0);
    sys.vfx(def.vfx?.cast ?? 'shield_bubble', [target.position.x, target.position.y + 1.1, target.position.z], { follow: target.object3d, duration: 1.2, scale: 1.0 });
    sys.sfx('buff', caster.position);
  },
};

/**
 * Absorb (Yaşam Kozası, Toprak Duvarı Totemi): an absorb shield of `params.absorbPct` x max HP (ceiling `params.capPct`, default the
 * same) for statuses[0].duration seconds, on the picked ally or the caster. With `params.radius` every living ally in that radius
 * (caster included) gets one: a party shield. `def.minion` (a totem) is summoned first through minion_summon. A remote ally gets its
 * shield from its owner ('pstatus' with the amount), since addAbsorb works on local actors only.
 */
const absorbAlly: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (!c.def.params?.radius) c.data.target = supportAlly(c, c.def.range ?? 25) ?? c.caster;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    const p = def.params ?? {};
    if (c.remote) return;
    if (def.minion) BEHAVIORS.minion_summon?.fire?.(c);
    const st = def.statuses?.[0];
    const dur = st?.duration ?? 8;
    const targets: Actor[] = p.radius ? [caster, ...alliesInRange(caster, p.radius)] : [(c.data.target as Actor | undefined) ?? caster];
    const seen = new Set<Actor>();
    for (const a of targets) {
      if (seen.has(a) || a.isDead) continue;
      seen.add(a);
      const amount = a.maxHp * (p.absorbPct ?? 0.2);
      const cap = a.maxHp * (p.capPct ?? p.absorbPct ?? 0.2);
      if (a.kind === 'player' && !(a as Player).isLocal) giveSupportStatus(c, a, 'shield', dur, amount);
      else addAbsorb(a, amount, cap, dur, st?.status, caster.id);
    }
    sys.sfx('buff', caster.position);
  },
};

/**
 * Ruh Bağı (Spirit Link): summons the totem (def.minion), then every second for def.duration (6 s) the living allies in def.radius
 * (caster included) are lifted to the party's HP share (sum of HP / sum of max HP). Only allies below that share gain HP (healPlayer,
 * raw). The healthiest local players come down to the same share (never below 1 HP): a remote player's HP is owned by its peer and no
 * message lowers it, so remote allies are only lifted. Approximation of the Midnight redistribution (see the Midnight report).
 */
const hpRedistribute: Behavior = {
  fire(c) {
    if (c.remote) return;
    const { caster, def, sys } = c;
    if (def.minion) BEHAVIORS.minion_summon?.fire?.(c);
    const r = def.radius ?? 10;
    const dur = def.duration ?? 6;
    const tick = (): void => {
      const seen = new Set<Actor>();
      const party: Player[] = [];
      for (const a of [caster, ...alliesInRange(caster, r)]) {
        if (seen.has(a) || a.isDead) continue;
        seen.add(a);
        party.push(a);
      }
      const hp = party.reduce((s, a) => s + a.hp, 0);
      const mx = party.reduce((s, a) => s + a.maxHp, 0);
      if (mx <= 0) return;
      const share = hp / mx;
      for (const a of party) {
        const want = share * a.maxHp;
        if (a.hp < want - 0.5) G.combat.healPlayer(caster, a, want - a.hp, { raw: true, quiet: true });
        else if (a.hp > want + 0.5 && a.kind === 'player' && (a as Player).isLocal) (a as Player).hp = Math.max(1, want);
      }
    };
    tick();
    for (let i = 1; i < Math.ceil(dur); i++) sys.schedule(i, tick);
    sys.sfx('buff', caster.position);
  },
};

/**
 * Ölüm Dokunuşu (Touch of Death): the melee target dies outright when it has less HP than the caster's max HP. A boss or miniboss
 * dies below `params.bossPct` of its own max HP (default 0.15). Otherwise the row's strike lands with damage.coef.
 */
const executeThreshold: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = singleTarget(c, c.def.range ?? 3.2);
    if (!t) { c.sys.fail('target'); return false; }
    c.data.target = t;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    const p = def.params ?? {};
    swingVfx(c, def.range ?? 3.2, def.arc ?? 120, true);
    if (c.remote) return;
    const t = c.data.target as Enemy | undefined;
    if (!t || t.isDead) return;
    const boss = t.def.rank === 'boss' || t.def.rank === 'miniboss';
    const lethal = boss ? t.hp / Math.max(1, t.maxHp) < (p.bossPct ?? 0.15) : t.hp < caster.maxHp;
    if (lethal) {
      if (def.vfx?.impact) sys.vfx(def.vfx.impact, [t.position.x, t.position.y + 1.2, t.position.z], { scale: 1.0 });
      G.combat.killEnemy(t, caster.id);
      return;
    }
    sys.strike(c, t, { coef: def.damage?.coef ?? 4.5, stagger: p.stagger ?? 20, weight: 'heavy' });
  },
};

/**
 * Coşku (Exhilaration): heals the caster for def.heal.coef and its living pet (minion group 'pet') for params.petCoef (default the same
 * coef). The pet belongs to this peer, so it is healed directly.
 */
const healSelfPet: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const p = def.params ?? {};
    const coef = def.heal?.coef ?? 0.5;
    healAlly(caster, caster, coef);
    for (const pet of G.minions?.ownedBy(caster.id, (m) => m.def.group === 'pet') ?? []) {
      if (pet.isDead) continue;
      pet.hp = Math.min(pet.maxHp, pet.hp + healFormula(caster, p.petCoef ?? coef).amount);
    }
    sys.vfx(def.vfx?.cast ?? 'shield_bubble', [caster.position.x, caster.position.y + 1.1, caster.position.z], { follow: caster.object3d, duration: 1.2, scale: 1.0 });
    sys.sfx('buff', caster.position);
  },
};

/**
 * Tehdit Saptırma (Misdirection): for selfStatuses[0].duration seconds (8 s) the caster's threat is booked on the picked ally, the tank.
 * The `misdirection` status's sourceId is that ally; EnemyAI.onDamaged reads it. No ally in reach: the row fails before paying.
 */
const misdirect: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const ally = supportAlly(c, c.def.range ?? 25);
    if (!ally) { c.sys.fail('target'); return false; }
    c.data.target = ally;
    return true;
  },
  fire(c) {
    const { caster, def, sys } = c;
    if (c.remote) return;
    const ally = c.data.target as Actor | undefined;
    if (!ally || ally.isDead) return;
    caster.statuses.apply('misdirection', def.selfStatuses?.[0]?.duration ?? 8, { sourceId: ally.id });
    sys.sfx('buff', caster.position);
  },
};

Object.assign(BEHAVIORS_SHARED, {
  chain_projectile: chainProjectile,
  pip_finisher: pipFinisher,
  target_status: targetStatus,
  channel_cone: channelCone,
  beam_drain: beamDrain,
  orbit_hammers: orbitHammers,
  ally_buff: allyBuff,
  absorb_ally: absorbAlly,
  hp_redistribute: hpRedistribute,
  execute_threshold: executeThreshold,
  heal_self_pet: healSelfPet,
  misdirect,
});

function installShared(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_SHARED);
}

try {
  installShared();
} catch {
  queueMicrotask(installShared);
}
