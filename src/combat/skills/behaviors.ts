import * as THREE from 'three';
import { G } from '../../game/G';
import { clamp, yawFromDir, cosmeticRng } from '../../core/utils';
import { TYPE_COLORS, vfxScale, isAreaVfx } from '../feel';
import { Projectile } from '../../entities/Projectile';
import { sp, hasSp, bloodTornado } from '../specials';
import { MAJOR_BEHAVIORS } from '../majors';
import { healAlly, healAmount, healFormula, addAbsorb, dispelUpTo, resolveHealTarget } from '../healing';
import type { SkillSystem, Action } from '../SkillSystem';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DamageResult } from '../Combat';
import type { AimInfo, SkillDef } from '../../types/skills';
import type { VfxId } from '../../types/vfx';

/**
 * Skill behaviours. Every SkillDef.targeting has a default behaviour (TARGETING_BEHAVIORS); `def.behavior` selects a
 * custom one from BEHAVIORS (multi-phase skills: Hücum, Kalkan Duvarı, Dönen Balta, Ölüm Dansı...).
 * The SAME behaviour runs for the caster (damage + visuals) and for remote peers (`c.remote`: visuals only, no damage).
 * OWNER: combat module.
 */
export interface CastCtx {
  sys: SkillSystem;
  caster: Player;
  def: SkillDef;
  aim: AimInfo;
  /** Normalized horizontal facing of the cast [x, z]. */
  dir: [number, number];
  remote: boolean;
  action: Action | null;
  /** Soft target (melee / dash / shadow step), null if none. */
  target: Actor | null;
  /** Ground point [x, z] (clamped to range; the caster for atCaster skills). */
  point: [number, number];
  /** Per-cast scratch space for behaviours. */
  data: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Damage multiplier (DAHA FAZLA) applied to every strike of this cast: echoes, set bonuses. */
  more: number;
  /** True for the free second cast of an echo (never echoes again). */
  echo?: boolean;
  /** Remote replays only: ids of the visual-relevant specials the caster announced in its 'cast' message (default params apply). */
  rsp?: ReadonlySet<string>;
}

export interface Behavior {
  /** Action just created, nothing paid yet. May adjust c.action timings. Return false to abort (no cost, no cooldown). */
  begin?(c: CastCtx): boolean | void;
  /** Every frame while the action runs (dash paths, leap arcs, reticle following). */
  frame?(c: CastCtx, dt: number, elapsed: number): void;
  /** The effect: at the hit time (instant/cast skills) or at the start (channels). */
  fire(c: CastCtx): void;
  /** Channel tick (n = 0,1,2...). Return false to end the channel (e.g. out of resource). */
  tick?(c: CastCtx, n: number): boolean | void;
  /** Channel / action ended. */
  end?(c: CastCtx, reason: 'done' | 'cancel' | 'interrupt'): void;
}

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------

const rot = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
};
const NO_PARAMS: Record<string, number> = {};
/** A special of the CASTER: the local character's for own casts, the owner's announced ids (default params) for remote replays. */
const csp = (c: CastCtx, id: string): Record<string, number> | null => (c.remote ? (c.rsp?.has(id) ? NO_PARAMS : null) : sp(id));
const typeColor = (c: CastCtx): number => TYPE_COLORS[c.def.damage?.type ?? 'physical'];
const at = (p: Actor, y: number): [number, number, number] => [p.position.x, p.position.y + y, p.position.z];
const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const norm = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z);
  return l > 1e-5 ? [x / l, z / l] : [0, 1];
};

function swingVfx(c: CastCtx, range: number, arc: number, big: boolean): void {
  const { caster, def, sys } = c;
  const [dx, dz] = c.dir;
  const id: VfxId = (def.vfx?.trail as VfxId) ?? (big ? 'slash_arc_big' : 'slash_arc');
  // the slash presets place their sprites ~1.0 x scale (1.5 x scale for the big one) in front of the spawn point and reach
  // ~3.1 x / ~4.9 x scale forward: size them so the visible arc ends just beyond the real hit range
  const s = big ? clamp((range + 0.6) / 4.6, 0.75, 1.3) * (arc > 170 ? 1.12 : 1) : clamp((range + 0.4) / 3.0, 0.8, 1.4);
  sys.vfx(id, [caster.position.x, caster.position.y + 1.15, caster.position.z], { dir: [dx, 0, dz], scale: s, color: typeColor(c) });
}

function impactVfx(c: CastCtx, e: Actor, dir: [number, number], n: number): void {
  const id = c.def.vfx?.impact;
  if (!id || n > 4) return;
  // per-target impacts must not draw skill-sized rings under every enemy
  c.sys.vfx(id, at(e, e.height * 0.5), { dir: [dir[0], 0, dir[1]], color: typeColor(c), scale: isAreaVfx(id) ? 0.5 : 1 });
}

/** Strike a list of enemies (nearest first, max N) and apply resource/combo gains once. */
function strikeMany(c: CastCtx, list: Enemy[], max: number, o?: Parameters<SkillSystem['strike']>[2]): DamageResult[] {
  const { caster, sys } = c;
  list.sort((a, b) => dist2(a.position, caster.position) - dist2(b.position, caster.position));
  const out: DamageResult[] = [];
  let n = 0;
  for (const e of list) {
    if (n >= max) break;
    const d = norm(e.position.x - caster.position.x, e.position.z - caster.position.z);
    const r = sys.strike(c, e, { dir: d, ...o });
    if (r) { out.push(r); impactVfx(c, e, d, n); n++; }
  }
  sys.afterHits(c, out);
  return out;
}

/** Aim assist for projectiles: bend up to `maxDeg` toward an enemy near the aim line. */
function assistDir(c: CastCtx, maxDeg = 4): [number, number] {
  const { caster, dir } = c;
  if (c.remote) return dir;
  const w = G.world;
  if (!w) return dir;
  let best: Enemy | null = null;
  let bestLat = 2.2;
  for (const e of w.enemies) {
    if (e.isDead) continue;
    const vx = e.position.x - caster.position.x, vz = e.position.z - caster.position.z;
    const along = vx * dir[0] + vz * dir[1];
    if (along < 1 || along > (c.def.range ?? 25)) continue;
    const lat = Math.abs(-vx * dir[1] + vz * dir[0]) - e.radius * 0.5;
    if (lat < bestLat) { bestLat = lat; best = e; }
  }
  if (!best) return dir;
  const want = Math.atan2(best.position.x - caster.position.x, best.position.z - caster.position.z);
  const cur = Math.atan2(dir[0], dir[1]);
  let diff = want - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const lim = (maxDeg * Math.PI) / 180;
  const a = cur + clamp(diff, -lim, lim);
  return [Math.sin(a), Math.cos(a)];
}

function muzzle(c: CastCtx, d: [number, number], fwd = 0.9, y = 1.35): [number, number, number] {
  const p = c.caster.position;
  return [p.x + d[0] * fwd, p.y + y, p.z + d[1] * fwd];
}

/** Everything inside a circle that is an alive enemy. */
const enemiesIn = (x: number, z: number, r: number): Enemy[] => (G.world ? G.world.enemiesInRadius({ x, z }, r) : []);

// ---------------------------------------------------------------------------------------------------------
// generic targeting behaviours
// ---------------------------------------------------------------------------------------------------------

const meleeArc: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const range = def.range ?? 2.5;
    const arc = def.arc ?? 120;
    const heavy = (def.params?.weight ?? 0) >= 1;
    swingVfx(c, range, arc, heavy);
    if (def.vfx?.cast && def.vfx.cast !== def.vfx.trail) sys.vfx(def.vfx.cast, [caster.position.x + c.dir[0] * 1.0, caster.position.y + 0.15, caster.position.z + c.dir[1] * 1.0], { dir: [c.dir[0], 0, c.dir[1]], scale: vfxScale(def.vfx.cast, range) });
    if (c.remote) return;
    const targets = sys.enemiesInCone(caster, c.dir, range, arc);
    const res = strikeMany(c, targets, def.params?.maxTargets ?? 99);
    // impact AoE around the strike point (finishers / chops)
    const ir = def.params?.impactRadius ?? 0;
    if (ir > 0 && (res.length > 0 || true)) {
      const cx = caster.position.x + c.dir[0] * range * 0.78, cz = caster.position.z + c.dir[1] * range * 0.78;
      const hit = new Set(targets.map((t) => t.id));
      const extra = enemiesIn(cx, cz, ir).filter((e) => !hit.has(e.id));
      if (res.length || extra.length) {
        sys.vfx('ground_slam', [cx, 0.05, cz], { scale: vfxScale('ground_slam', ir * 1.3, 0.35) });
        const more = strikeMany(c, extra, 99, { coef: (def.damage?.coef ?? 1) * 0.6, weight: 'light', noGain: true });
        res.push(...more);
      }
    }
    if (res.length === 0) sys.whiff(c);
  },
};

const projectile: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const count = def.count ?? 1;
    const spread = def.spread ?? 0;
    const base = assistDir(c);
    const heightY = 1.35;
    for (let i = 0; i < count; i++) {
      const d = count > 1 ? rot(base, (i - (count - 1) / 2) * spread) : base;
      sys.fireProjectile(c, d, heightY);
    }
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, muzzle(c, base, 0.9, 1.35), { dir: [base[0], 0, base[1]], scale: 0.6 });
    void caster;
  },
};

const groundAoe: Behavior = {
  fire(c) {
    const { def, sys, caster } = c;
    const p = def.params ?? {};
    const holy = def.id === 'knight_consecration' ? sp('n_holy_light') : null;
    const radius = (def.radius ?? 4) * (1 + sys.softStat(caster, 'aoeRadiusPct') + (holy?.consecrationRadiusPct ?? 0));
    const healPct = (p.healPct ?? 0) + (p.healPct && hasSp('set_holy_vanguard_2') ? 0.015 : 0);
    const [px, pz] = p.atCaster ? [caster.position.x, caster.position.z] : c.point;
    const ticks = def.ticks ?? 0;
    const dur = def.duration ?? 0;
    if (def.vfx?.ground) sys.vfx(def.vfx.ground, [px, 0.05, pz], { scale: vfxScale(def.vfx.ground, radius), duration: dur > 0 ? dur : undefined });
    if (def.vfx?.cast && p.atCaster) sys.vfx(def.vfx.cast, [px, 0.1, pz], { scale: vfxScale(def.vfx.cast, radius) });
    if (ticks > 0 && dur > 0) {
      const every = dur / ticks;
      const zone = {
        x: px, z: pz, radius, duration: dur, tick: every, t: 0, next: every,
        onTick: (z: { x: number; z: number }, n: number) => {
          if (c.remote) return;
          for (const e of enemiesIn(z.x, z.z, radius)) sys.strike(c, e, { tick: true, dir: norm(e.position.x - z.x, e.position.z - z.z), noGain: true, tickIndex: n });
          if (healPct) sys.healAlliesIn(c, z.x, z.z, radius, healPct * every);
          if (holy) sys.applyPartyAt(c, 'empower', 1.6, holy.consecrationAllyDamagePct ?? 0.1, z.x, z.z, radius);
        },
        onEnd: undefined,
      };
      sys.addZone(zone);
      if (!c.remote) {
        if (p.healPct) sys.healAlliesIn(c, px, pz, radius, 0.01);
        if (def.vfx?.impact) sys.vfx(def.vfx.impact, [px, 0.1, pz], { scale: vfxScale(def.vfx.impact, radius) });
        sys.shake(0.2);
      }
    } else if (!c.remote) {
      const list = enemiesIn(px, pz, radius);
      strikeMany(c, list, 99);
      if (def.vfx?.impact) sys.vfx(def.vfx.impact, [px, 0.1, pz], { scale: vfxScale(def.vfx.impact, radius) });
    }
  },
};

const selfAoe: Behavior = {
  fire(c) {
    const { def, sys, caster } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 4) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const pos: [number, number, number] = [caster.position.x, caster.position.y + 0.1, caster.position.z];
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, pos, { scale: vfxScale(def.vfx.cast, radius), color: p.ringColor || undefined });
    sys.ring(caster.position.x, caster.position.z, radius, p.ringColor || typeColor(c));
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    if (p.allyRange && p.allyMore) sys.applyParty(c, 'empower', 8, p.allyMore, p.allyRange);
    if (c.remote) return;
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    if (def.damage && def.damage.coef > 0) {
      strikeMany(c, list, 99);
      if (def.vfx?.impact && list.length) sys.vfx(def.vfx.impact, pos, { scale: vfxScale(def.vfx.impact, radius) });
    } else {
      // status-only shouts (taunt / fear)
      if (def.statuses) for (const e of list) sys.statusOnly(c, e, def.statuses);
      if (list.length) sys.addStaggerPoints(c, list);
      sys.gainFromCost(c);
    }
  },
};

const selfBuff: Behavior = {
  fire(c) {
    const { def, sys, caster } = c;
    if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
    if (def.radius && def.radius > 0 && def.selfStatuses) for (const s of def.selfStatuses) sys.applyParty(c, s.status, s.duration, s.magnitude ?? 0, def.radius);
    if (def.vfx?.cast) sys.vfx(def.vfx.cast, at(caster, 0.1), { scale: 1.1, follow: caster.object3d, duration: 1.2 });
    if (def.params?.hpCostPct && !c.remote) sys.sacrificeHp(c, def.params.hpCostPct);
  },
};

const dash: Behavior = {
  begin(c) {
    if (c.remote) return; // remote peers only replay the impact visuals (position comes from the network)
    const { def, caster, sys } = c;
    const maxD = def.range ?? 10;
    const speed = def.params?.speed ?? 30;
    let dir = c.dir;
    let D = maxD * 0.8;
    const t = c.target;
    if (t) {
      const dx = t.position.x - caster.position.x, dz = t.position.z - caster.position.z;
      dir = norm(dx, dz);
      D = Math.min(maxD, Math.max(0.5, Math.hypot(dx, dz) - (t.radius + caster.radius + 0.5)));
    }
    const w = G.world;
    if (w) {
      const f = w.nav.raycast(caster.position.x, caster.position.z, caster.position.x + dir[0] * D, caster.position.z + dir[1] * D);
      D *= Math.min(1, f) * (f < 1 ? 0.92 : 1);
    }
    if (D < 0.4) D = 0.4;
    const dur = Math.max(0.1, D / speed);
    c.data.dir = dir; c.data.D = D; c.data.dur = dur; c.data.hit = new Set<number>();
    const a = c.action!;
    a.hitAt = dur;
    a.endAt = Math.max(a.endAt, dur + 0.35);
    a.chainAt = dur + 0.12;
    a.moveAt = dur + 0.1;
    a.uninterruptible = true;
    a.faceYaw = yawFromDir(dir[0], dir[1]);
    a.faceUntil = dur + 0.1;
    sys.moveActor(caster, dir[0] * speed, dir[1] * speed, dur);
    caster.statuses.addImmunity('cc', dur + 0.25);
    sys.playClip(caster, 'Running_A', { speed: 2.2, loop: true, fade: 0.05 });
    sys.vfx('charge_trail', at(caster, 0.1), { dir: [dir[0], 0, dir[1]], duration: dur + 0.2, follow: caster.object3d, scale: 1.2 });
    sys.sfx('swing_heavy', caster.position, { pitch: 0.8 });
    sys.shake(0.12);
  },
  frame(c) {
    if (c.remote) return;
    const { def, caster, sys } = c;
    const width = (def.params?.pathWidth ?? 1.5) * 0.5;
    const dir = c.data.dir as [number, number];
    for (const e of enemiesIn(caster.position.x, caster.position.z, width + 0.2)) {
      const hit = c.data.hit as Set<number>;
      if (hit.has(e.id)) continue;
      hit.add(e.id);
      // side push: perpendicular to the dash, towards the side the enemy is on
      const rx = e.position.x - caster.position.x, rz = e.position.z - caster.position.z;
      const side = rx * -dir[1] + rz * dir[0] >= 0 ? 1 : -1;
      sys.strike(c, e, { coef: def.params?.pathCoef ?? 0.6, weight: 'light', knockback: 1.5, dir: [-dir[1] * side, dir[0] * side], statuses: [], noGain: true, stagger: 4 });
      sys.vfx('hit_spark', at(e, e.height * 0.5), { dir: [dir[0], 0, dir[1]] });
    }
  },
  fire(c) {
    const { def, caster, sys } = c;
    const radius = def.radius ?? 3;
    const pos: [number, number, number] = [caster.position.x, 0.1, caster.position.z];
    sys.vfx(def.vfx?.impact ?? 'ground_slam', pos, { scale: vfxScale(def.vfx?.impact ?? 'ground_slam', radius) });
    sys.ring(pos[0], pos[2], radius, 0xffd27a);
    sys.playClip(caster, '1H_Melee_Attack_Stab', { speed: 1.9, fade: 0.04 });
    if (c.remote) return;
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    const res = strikeMany(c, list, 99);
    sys.gainFromCost(c);
    if (!res.length) sys.shake(0.3);
  },
};

const leap: Behavior = {
  begin(c) {
    if (c.remote) return;
    const { def, caster, sys } = c;
    const maxD = def.range ?? 10;
    let [px, pz] = c.point;
    let dx = px - caster.position.x, dz = pz - caster.position.z;
    let D = Math.hypot(dx, dz);
    if (D < 0.5) { dx = c.dir[0]; dz = c.dir[1]; D = Math.min(4, maxD); }
    const dir = norm(dx, dz);
    D = Math.min(maxD, D);
    const w = G.world;
    if (w) {
      const f = w.nav.raycast(caster.position.x, caster.position.z, caster.position.x + dir[0] * D, caster.position.z + dir[1] * D);
      if (f < 1) D *= Math.max(0.1, f * 0.9);
    }
    px = caster.position.x + dir[0] * D; pz = caster.position.z + dir[1] * D;
    const air = Math.max(0.25, def.duration ?? 0.55);
    c.data.land = [px, pz]; c.data.air = air; c.data.dir = dir; c.data.arc = Math.min(3.8, 1.2 + D * 0.16);
    const a = c.action!;
    a.hitAt = air;
    a.endAt = air + (def.params?.end ?? 0.8) - (def.hitTime ?? 0);
    a.chainAt = air + 0.15;
    a.moveAt = air + 0.12;
    a.uninterruptible = true;
    a.faceYaw = yawFromDir(dir[0], dir[1]);
    a.faceUntil = air;
    sys.moveActor(caster, (dir[0] * D) / air, (dir[1] * D) / air, air);
    if (def.params?.unstoppable) caster.statuses.addImmunity('cc', air + 0.3);
    if (def.params?.invuln) caster.statuses.apply('invulnerable', def.params.invuln, { sourceId: caster.id });
    const clip = def.anim;
    const clipDur = caster.anim?.clipDuration(clip) ?? 0;
    sys.playClip(caster, clip, { speed: clipDur > 0 ? Math.min(3.5, clipDur / air) : 1, fade: 0.05 });
    sys.landingMarker(px, pz, def.radius ?? 3, air);
    sys.vfx('dodge_dust', at(caster, 0.1), { scale: 1.2 });
    sys.sfx(def.sfx?.cast ?? 'jump', caster.position);
  },
  frame(c, _dt, elapsed) {
    const a = c.data.air as number;
    const k = clamp(elapsed / a, 0, 1);
    const m = c.caster.model;
    if (m) {
      const h = (c.data.arc as number) * 4 * k * (1 - k);
      m.position.y += h - (c.data.prevH ?? 0);
      c.data.prevH = h;
    }
  },
  fire(c) {
    const { def, caster, sys } = c;
    const m = caster.model;
    if (m && c.data.prevH) { m.position.y -= c.data.prevH; c.data.prevH = 0; }
    const radius = (def.radius ?? 3) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const pos: [number, number, number] = [caster.position.x, 0.05, caster.position.z];
    sys.vfx(def.vfx?.impact ?? 'leap_land', pos, { scale: vfxScale(def.vfx?.impact ?? 'leap_land', radius) });
    if (def.vfx?.ground) sys.vfx(def.vfx.ground, pos, { scale: vfxScale(def.vfx.ground, radius) });
    sys.ring(pos[0], pos[2], radius, def.damage?.type === 'holy' ? 0xffe9a0 : 0xffc8a0);
    sys.sfx(def.sfx?.impact ?? 'ground_slam', caster.position);
    const ult = (def.params?.weight ?? 0) >= 3;
    sys.shake(ult ? 0.55 : 0.3);
    if (ult) { sys.hitstopMs(120); G.camera?.kickFov?.(4); }
    if (!ult) G.camera?.punch?.(0.25);
    if (def.selfStatuses && !c.remote) sys.applySelf(c, def.selfStatuses);
    if (c.remote) return;
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    const res = strikeMany(c, list, 99, { knockup: def.params?.knockup });
    sys.gainFromCost(c);
    if (!res.length && !ult) sys.hitstopMs(35);
  },
  end(c) {
    const m = c.caster.model;
    if (m && c.data.prevH) { m.position.y -= c.data.prevH; c.data.prevH = 0; }
  },
};

const teleport: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    const w = G.world;
    const range = def.range ?? 8;
    // direction: movement input relative to camera, else aim direction
    let dir = c.dir;
    const ax = G.input?.moveAxis?.() ?? { x: 0, y: 0 };
    if ((ax.x !== 0 || ax.y !== 0) && G.camera) {
      const b = G.camera.getBasis();
      dir = norm(b.forward.x * ax.y + b.right.x * ax.x, b.forward.z * ax.y + b.right.z * ax.x);
    }
    const from = caster.position.clone();
    let D = range;
    if (w) {
      const f = w.nav.raycast(from.x, from.z, from.x + dir[0] * D, from.z + dir[1] * D);
      if (f < 1) D *= Math.max(0, f * 0.92);
    }
    sys.vfx(def.vfx?.cast ?? 'blink', [from.x, from.y + 1, from.z], { scale: 1.2 });
    if (def.damage && !c.remote) {
      const radius = def.radius ?? 2.5;
      strikeMany(c, enemiesIn(from.x, from.z, radius), 99);
    }
    if (def.selfStatuses && !c.remote) sys.applySelf(c, def.selfStatuses);
    if (!c.remote) {
      caster.position.x = from.x + dir[0] * D;
      caster.position.z = from.z + dir[1] * D;
      w?.nav.resolveCircle(caster.position, caster.radius);
      caster.forcedMove = null;
      caster.velocity.set(0, 0, 0);
    }
    sys.hideModel(caster, 0.07);
    sys.vfx(def.vfx?.cast ?? 'blink', [caster.position.x, caster.position.y + 1, caster.position.z], { scale: 1.2 });
    sys.sfx('blink', caster.position);
    sys.playClip(caster, 'Dodge_Forward', { speed: 1.6, fade: 0.03 });
    if (!c.remote) G.camera?.kickFov?.(-3);
  },
};

const beam: Behavior = {
  fire(c) {
    const { def, caster, sys } = c;
    sys.vfx(def.vfx?.cast ?? 'lightning_strike', at(caster, 1.2), { dir: [c.dir[0], 0, c.dir[1]], scale: 1 });
    if (c.remote) return;
    const len = def.range ?? 10;
    const list = G.world?.actorsInLine({ x: caster.position.x, z: caster.position.z }, { x: c.dir[0], z: c.dir[1] }, len, def.radius ?? 1.2, (a) => a.team === 'enemy') ?? [];
    strikeMany(c, list as unknown as Enemy[], 99);
  },
  tick(c) {
    this.fire(c);
  },
};

const summon: Behavior = {
  fire(c) {
    c.sys.vfx(c.def.vfx?.cast ?? 'buff_aura', at(c.caster, 0.1), { scale: 1 });
  },
};

export const TARGETING_BEHAVIORS: Record<string, Behavior> = {
  melee_arc: meleeArc,
  projectile,
  ground_aoe: groundAoe,
  self_aoe: selfAoe,
  self_buff: selfBuff,
  dash,
  leap,
  teleport,
  beam,
  summon,
};

// ---------------------------------------------------------------------------------------------------------
// custom behaviours
// ---------------------------------------------------------------------------------------------------------

/** Şövalye: Kalkan Duvarı — hold to block frontal hits, release for a stored-damage shockwave. */
const shieldWall: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    c.data.stored = 0;
    sys.setShieldWall(caster, true, c);
    sys.vfx('shield_bubble', [caster.position.x + c.dir[0] * 0.9, caster.position.y + 1.2, caster.position.z + c.dir[1] * 0.9], { follow: caster.object3d, duration: def.channel ?? 4, scale: 1.1 });
    sys.sfx('buff', caster.position);
  },
  tick(c) {
    const { caster, sys, def } = c;
    sys.actSlow(caster, def.params?.moveSlow ?? 0.6, 0.35);
    return true;
  },
  end(c, reason) {
    const { caster, sys, def } = c;
    sys.setShieldWall(caster, false, c);
    if (reason !== 'done') return;
    // release shockwave
    sys.playClip(caster, 'Block_Attack', { speed: 1.7, fade: 0.04 });
    const stored = (c.data.stored as number) ?? 0;
    sys.vfx('shockwave', [caster.position.x + c.dir[0] * 1.5, 0.1, caster.position.z + c.dir[1] * 1.5], { scale: 1.6, dir: [c.dir[0], 0, c.dir[1]] });
    sys.shake(0.38);
    sys.hitstopMs(70);
    sys.sfx('shield_bash', caster.position);
    if (c.remote) return;
    const targets = sys.enemiesInCone(caster, c.dir, def.range ?? 4, def.arc ?? 90);
    const maxStore = (def.params?.storeCap ?? 10) * 30;
    strikeMany(c, targets, 99, { flat: Math.min(stored, maxStore * 10), weight: 'heavy', knockback: def.knockback ?? 3 });
  },
};

/** Şövalye: Savaş Sancağı — a banner planted on the ground buffing allies in an aura. */
const banner: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const range = def.range ?? 8;
    let [px, pz] = c.point;
    const d = Math.hypot(px - caster.position.x, pz - caster.position.z);
    if (d > range) { px = caster.position.x + ((px - caster.position.x) / d) * range; pz = caster.position.z + ((pz - caster.position.z) / d) * range; }
    if (d < 1.2) { px = caster.position.x + c.dir[0] * 1.8; pz = caster.position.z + c.dir[1] * 1.8; }
    const radius = def.radius ?? 10;
    const dur = def.duration ?? 12;
    const mesh = sys.makeBanner();
    mesh.position.set(px, 0, pz);
    G.world?.scene.add(mesh);
    sys.vfx('buff_aura', [px, 0.1, pz], { scale: vfxScale('buff_aura', radius), duration: dur });
    sys.vfx('ground_slam', [px, 0.05, pz], { scale: 0.9 });
    sys.ring(px, pz, radius, 0xe8c15a);
    sys.shake(0.15);
    sys.sfx('buff', [px, 0, pz] as unknown as THREE.Vector3);
    if (!c.remote) sys.setBanner(caster, dur);
    const zone = {
      x: px, z: pz, radius, duration: dur, tick: 1, t: 0, next: 0.05,
      onTick: (z: { x: number; z: number }) => {
        if (c.remote) return;
        sys.applyPartyAt(c, 'banner', 1.6, 0, z.x, z.z, radius);
      },
      onUpdate: (z: { t: number }) => {
        mesh.rotation.y = Math.sin(z.t * 1.3) * 0.05;
        const cloth = mesh.getObjectByName('cloth');
        if (cloth) cloth.rotation.y = Math.sin(z.t * 4) * 0.25;
      },
      onEnd: () => {
        sys.vfx('death_poof', [px, 0.3, pz], { scale: 0.8 });
        mesh.removeFromParent();
        sys.disposeBanner(mesh);
      },
    };
    sys.addZone(zone);
  },
};

/** Barbar: Kasırga — channelled spin damaging everything around the caster. */
const channelAoe: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    sys.vfx('spin_slash', at(caster, 1.0), { follow: caster.object3d, duration: def.channel ?? 6, scale: vfxScale('spin_slash', def.radius ?? 3.2) });
    caster.statuses.addImmunity('slow', 0.6);
  },
  tick(c, n) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (!c.remote) {
      const costPerTick = (p.costPerSec ?? 0) * (p.tick ?? 0.25) * sys.costMult(caster, def);
      if (n > 0 && !sys.spend(caster, costPerTick)) return false;
      caster.statuses.addImmunity('slow', 0.5);
      sys.actSlow(caster, p.moveSlow ?? 0.25, 0.4);
    }
    const radius = (def.radius ?? 3.2) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    if (n % 2 === 0) sys.vfx('slash_arc', at(caster, 1.0), { dir: [Math.sin(n), 0, Math.cos(n)], scale: Math.max(0.8, radius / 3.1), color: 0xffc8a0 });
    if (c.remote) return true;
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    for (const e of list) {
      sys.strike(c, e, { tick: true, noGain: true, dir: norm(e.position.x - caster.position.x, e.position.z - caster.position.z), knockback: 0.25 });
    }
    if (list.length) { sys.shake(0.06); sys.sfx('hit_flesh', caster.position, { volume: 0.5, pitchVar: 0.2 }); }
    // Kasırganın Yüreği: enemies further out are dragged in
    const hs = sp('leg_heart_of_storm');
    if (hs) {
      for (const e of enemiesIn(caster.position.x, caster.position.z, hs.pullRadius ?? 6)) {
        const dx = caster.position.x - e.position.x, dz = caster.position.z - e.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.8) continue;
        G.combat.pullEnemy(e, [dx / dist, dz / dist], Math.min(dist - 1.5, 0.9));
      }
    }
    // Kurt Kanı (4): a seeking blood tornado every second
    if (n % 4 === 0 && hasSp('set_wolfblood_4')) bloodTornado(sys, c, { coefPerSec: 1.2 });
    return true;
  },
  end(c) {
    c.sys.vfx('dodge_dust', at(c.caster, 0.1), { scale: 1 });
  },
};

/** One fissure travelling along `dir` (more = damage multiplier, staggerMul scales its stagger points). */
function runFissure(c: CastCtx, dir: [number, number], more: number, staggerMul: number): void {
  const { caster, sys, def } = c;
  const [dx, dz] = dir;
  const len = def.range ?? 12;
  const speed = def.speed ?? 30;
  const width = def.radius ?? 2.5;
  const ox = caster.position.x + dx * 1.2, oz = caster.position.z + dz * 1.2;
  sys.vfx('ground_slam', [ox, 0.05, oz], { scale: 1.3 });
  const hit = new Set<number>();
  let front = 0;
  let nextRock = 0;
  sys.addTask((dt) => {
    const nf = Math.min(len, front + speed * dt);
    // rocks erupt sequentially along the line
    while (nextRock <= nf) {
      sys.vfx(nextRock % 3.2 < 1.6 ? 'ground_slam' : 'shockwave', [ox + dx * nextRock, 0.05, oz + dz * nextRock], { scale: 0.7 });
      nextRock += 1.6;
    }
    if (!c.remote) {
      const list = G.world?.actorsInLine({ x: ox, z: oz }, { x: dx, z: dz }, nf, width, (a) => a.team === 'enemy' && !hit.has(a.id)) ?? [];
      for (const a of list) {
        hit.add(a.id);
        const e = a as unknown as Enemy;
        sys.strike(c, e, { dir: [dx, dz], knockup: def.params?.knockup, weight: 'heavy', knockback: 0.5, more, stagger: (def.params?.stagger ?? 0) * staggerMul });
        sys.vfx('hit_spark', at(e, e.height * 0.4), { dir: [dx, 0, dz] });
      }
    }
    front = nf;
    return front >= len;
  });
}

/** Barbar: Yer Yaran — a fissure travelling along a line (Kafatası Yaran: three fissures in a fan). */
const fissure: Behavior = {
  fire(c) {
    const { caster, sys } = c;
    sys.shake(0.4);
    sys.hitstopMs(60);
    G.camera?.punch?.(0.3);
    sys.sfx('ground_slam', caster.position);
    const ss = csp(c, 'leg_skullsplitter');
    const n = ss ? Math.max(1, Math.round(ss.fissures ?? 3)) : 1;
    const spread = ss ? ss.spreadDeg ?? 30 : 0;
    for (let i = 0; i < n; i++) {
      const ang = n > 1 ? (i - (n - 1) / 2) * (spread / (n - 1)) : 0;
      runFissure(c, n > 1 ? rot(c.dir, ang) : c.dir, ss ? ss.coef ?? 0.6 : 1, ss ? 1 + (ss.staggerPct ?? 0.3) : 1);
    }
    if (!c.remote) sys.gainFromCost(c);
  },
};

/** Barbar: Dönen Balta — boomerang axe hitting on the way out and back. */
const boomerang: Behavior = {
  fire(c) {
    const { def, sys, caster } = c;
    const d = assistDir(c, 3);
    const start = muzzle(c, d, 0.8, 1.3);
    Projectile.spawn({
      mode: c.remote ? 'visual' : 'player', owner: caster, vfx: (def.vfx?.projectile as VfxId) ?? 'bone_projectile', scale: 1.4,
      origin: start, dir: d, speed: def.speed ?? 22, radius: def.radius ?? 0.8, range: def.range ?? 14, pierce: 99, boomerang: true, spin: 18,
      onHit: (e) => {
        const r = sys.strike(c, e, { dir: d, weight: 'light', stagger: def.params?.stagger });
        if (r) { sys.vfx('hit_blood', at(e, e.height * 0.5), { dir: [d[0], 0, d[1]] }); sys.afterHits(c, [r]); }
      },
      onEnd: (p, reason) => {
        if (reason === 'caught') sys.sfx('swing_light', caster.position, { pitch: 1.3 });
        if (reason === 'wall') sys.vfx('hit_spark', [p.position.x, p.position.y, p.position.z]);
      },
    });
    sys.vfx('slash_arc', muzzle(c, d, 1.2, 1.2), { dir: [d[0], 0, d[1]], scale: 0.9, color: 0xffc8a0 });
  },
};

/** Büyücü: Büyü Kalkanı — absorb shield, +cast speed while it holds, frost burst when it ends. */
const barrier: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    sys.vfx('shield_bubble', at(caster, 1.1), { follow: caster.object3d, duration: 8, scale: 1.2 });
    sys.sfx('buff', caster.position);
    if (c.remote) return;
    const amount = caster.maxHp * (p.hpPct ?? 0.25) + (p.intMult ?? 3) * caster.getStat('int');
    caster.statuses.apply('shield', def.selfStatuses?.[0]?.duration ?? 8, { magnitude: amount, sourceId: caster.id });
    sys.setBarrier(caster, true, c);
  },
};

/** One meteor falling on (px, pz): telegraph, impact, burning patch. `more` scales the damage (set bonus extra meteors). */
function dropMeteor(c: CastCtx, px: number, pz: number, more: number, delayExtra = 0): void {
  const { caster, sys, def } = c;
  const p = def.params ?? {};
  const radius = (def.radius ?? 4) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
  const delay = (p.delay ?? 0.9) + delayExtra;
  sys.vfx('meteor_fall', [px, 0, pz], { duration: delay, scale: radius / 3 });
  sys.telegraphFriendly(px, pz, radius, delay);
  sys.sfx('fire_cast', [px, 0, pz] as unknown as THREE.Vector3, { pitch: 0.7 });
  sys.schedule(delay, () => {
    sys.vfx('fire_burst', [px, 0.3, pz], { scale: vfxScale('fire_burst', radius * 1.1) });
    sys.vfx('ground_slam', [px, 0.05, pz], { scale: vfxScale('ground_slam', radius * 0.9) });
    sys.vfx(def.vfx?.ground ?? 'fire_ground', [px, 0.05, pz], { scale: vfxScale('fire_ground', p.groundRadius ?? 3), duration: def.duration ?? 3 });
    sys.ring(px, pz, radius, 0xff7a30);
    sys.sfx('explosion', [px, 0, pz] as unknown as THREE.Vector3);
    const near = caster.position.distanceTo(new THREE.Vector3(px, caster.position.y, pz));
    sys.shake(clamp(0.5 * (1 - near / 28), 0.08, 0.5) * (more < 1 ? 0.6 : 1), 0.35);
    if (!c.remote) {
      sys.hitstopMs(more < 1 ? 40 : 80);
      const list = enemiesIn(px, pz, radius);
      for (const e of list) sys.strike(c, e, { dir: norm(e.position.x - px, e.position.z - pz), weight: 'heavy', noGain: true, more });
      sys.afterHits(c, []);
    }
    const gr = p.groundRadius ?? 3;
    const tickEvery = p.groundTick ?? 0.5;
    sys.addZone({
      x: px, z: pz, radius: gr, duration: def.duration ?? 3, tick: tickEvery, t: 0, next: tickEvery,
      onTick: (z) => {
        if (c.remote) return;
        for (const e of enemiesIn(z.x, z.z, gr)) {
          sys.strike(c, e, { coef: (p.groundCoef ?? 0.4) * more, tick: true, noGain: true, statuses: [{ status: 'burn', duration: 2, magnitude: 0.3 }], knockback: 0, dir: norm(e.position.x - z.x, e.position.z - z.z) });
        }
      },
    });
  });
}

/** Büyücü: Meteor — cast, then it falls onto the aim point and leaves a burning patch (Başbüyücü (4): two more small ones). */
const meteor: Behavior = {
  fire(c) {
    const [px, pz] = c.point;
    dropMeteor(c, px, pz, 1);
    if (c.remote ? c.rsp?.has('set_archmage_legacy_4') : hasSp('set_archmage_legacy_4')) {
      for (let i = 0; i < 2; i++) {
        const a = cosmeticRng.next() * Math.PI * 2;
        dropMeteor(c, px + Math.cos(a) * 1.5, pz + Math.sin(a) * 1.5, 0.6, 0.18 * (i + 1));
      }
    }
  },
};

/** Büyücü: Kar Fırtınası — channelled frost storm that follows the reticle. */
const blizzard: Behavior = {
  begin(c) {
    c.data.pos = [c.point[0], c.point[1]];
    c.data.fx = null;
  },
  frame(c, dt) {
    const p = c.data.pos as [number, number];
    // follow the live reticle at followSpeed
    const [tx, tz] = c.sys.liveGroundPoint(c);
    const speed = (c.def.params?.followSpeed ?? 6) * dt;
    const dx = tx - p[0], dz = tz - p[1];
    const d = Math.hypot(dx, dz);
    if (d > 0.01) { const k = Math.min(1, speed / d); p[0] += dx * k; p[1] += dz * k; }
    const fx = c.data.fx as { setPosition?: (x: number, y: number, z: number) => void } | null;
    fx?.setPosition?.(p[0], 0.05, p[1]);
    if (!c.remote) c.sys.actRoot(c.caster, 0.2);
  },
  fire(c) {
    const { sys, def } = c;
    const p = c.data.pos as [number, number];
    const radius = def.radius ?? 5;
    c.data.fx = sys.vfx('blizzard', [p[0], 0.05, p[1]], { scale: vfxScale('blizzard', radius), duration: (def.channel ?? 5) + 0.3 });
    sys.sfx('frost_cast', c.caster.position);
    c.caster.statuses.addImmunity('slow', 0.3);
  },
  tick(c, n) {
    const { sys, def, caster } = c;
    const pr = def.params ?? {};
    const p = c.data.pos as [number, number];
    const radius = (def.radius ?? 5) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    if (!c.remote && n > 0) {
      const cost = (pr.costPerSec ?? 0) * (pr.tick ?? 0.25) * sys.costMult(caster, def);
      if (!sys.spend(caster, cost)) return false;
    }
    // falling ice shards
    for (let i = 0; i < 2; i++) {
      const a = cosmeticRng.next() * Math.PI * 2, r = Math.sqrt(cosmeticRng.next()) * radius;
      sys.vfx('frost_burst', [p[0] + Math.cos(a) * r, 0.2, p[1] + Math.sin(a) * r], { scale: 0.35 });
    }
    if (c.remote) return true;
    for (const e of enemiesIn(p[0], p[1], radius)) {
      sys.strike(c, e, { tick: true, noGain: true, dir: norm(e.position.x - p[0], e.position.z - p[1]) });
    }
    sys.shake(0.03);
    return true;
  },
  end(c) {
    const fx = c.data.fx as { stop?: () => void } | null;
    fx?.stop?.();
  },
};

/** Büyücü: Gizemli Küre — slow piercing orb that pulses and explodes at the end. */
const orb: Behavior = {
  fire(c) {
    const { def, sys, caster } = c;
    const p = def.params ?? {};
    const d = assistDir(c, 3);
    const origin = muzzle(c, d, 1.0, 1.4);
    const pulseR = p.pulseRadius ?? 2.5;
    let exploded = false;
    const explode = (x: number, z: number) => {
      if (exploded) return;
      exploded = true;
      const er = p.endRadius ?? 4;
      sys.vfx('arcane_burst', [x, 1.0, z], { scale: vfxScale('arcane_burst', er) });
      sys.ring(x, z, er, 0xff6bd8);
      sys.sfx('explosion', [x, 0, z] as unknown as THREE.Vector3);
      sys.shake(0.38, 0.3);
      if (c.remote) return;
      sys.hitstopMs(85);
      for (const e of enemiesIn(x, z, er)) {
        sys.strike(c, e, { coef: p.endCoef ?? 3, weight: 'heavy', stagger: p.endStagger ?? 20, noGain: true, dir: norm(e.position.x - x, e.position.z - z), knockback: 1.5 });
      }
    };
    Projectile.spawn({
      mode: 'visual', owner: caster, vfx: (def.vfx?.projectile as VfxId) ?? 'arcane_projectile', scale: 2.2, origin, dir: d,
      speed: def.speed ?? 7, radius: 0.7, range: def.range ?? 20, pierce: 99,
      pulse: {
        interval: p.pulse ?? 0.25,
        fn: (pr) => {
          sys.vfx('arcane_burst', [pr.position.x, pr.position.y, pr.position.z], { scale: 0.7 });
          if (c.remote) return;
          for (const e of enemiesIn(pr.position.x, pr.position.z, pulseR)) {
            sys.strike(c, e, { tick: true, noGain: true, dir: norm(e.position.x - pr.position.x, e.position.z - pr.position.z), knockback: 0 });
          }
          sys.shake(0.04);
        },
      },
      onEnd: (pr, reason) => {
        if (reason === 'removed') return;
        explode(pr.position.x, pr.position.z);
      },
    });
    sys.vfx('arcane_burst', origin, { scale: 0.6 });
  },
};

/** Büyücü: Kadim Kıyamet — star strikes on random enemies, final nova. */
const cataclysm: Behavior = {
  begin(c) {
    c.data.strikes = 0;
  },
  fire(c) {
    const { caster, sys } = c;
    sys.vfx('arcane_burst', at(caster, 1.0), { scale: 2, follow: caster.object3d, duration: 3 });
    sys.sfx('spell_cast', caster.position, { pitch: 0.7 });
    sys.shake(0.2, 0.4);
    sys.fogTint(0x6a2a8a, (c.def.channel ?? 3) + 0.4);
  },
  tick(c, n) {
    const { caster, sys, def } = c;
    const pr = def.params ?? {};
    const total = pr.strikes ?? 15;
    if (n >= total) return true;
    const range = def.range ?? 14;
    const sr = pr.strikeRadius ?? 2;
    let x: number, z: number;
    const list = c.remote ? [] : enemiesIn(caster.position.x, caster.position.z, range).filter((e) => !e.isDead);
    if (list.length) {
      // elites/bosses first, then random
      const prio = list.filter((e) => e.def.rank !== 'trash');
      const pool = prio.length && n % 2 === 0 ? prio : list;
      const e = pool[Math.floor(cosmeticRng.next() * pool.length)];
      x = e.position.x; z = e.position.z;
    } else {
      const a = cosmeticRng.next() * Math.PI * 2, r = 3 + cosmeticRng.next() * (range - 4);
      x = caster.position.x + Math.cos(a) * r; z = caster.position.z + Math.sin(a) * r;
    }
    sys.vfx('lightning_strike', [x, 0, z], { scale: 1.2, color: 0xff6bd8 });
    sys.vfx('arcane_burst', [x, 0.3, z], { scale: sr / 1.4 });
    sys.shake(0.1, 0.15);
    sys.sfx('lightning_impact', [x, 0, z] as unknown as THREE.Vector3, { volume: 0.7, pitchVar: 0.2 });
    if (!c.remote) {
      sys.hitstopMs(30);
      for (const e of enemiesIn(x, z, sr)) {
        sys.strike(c, e, { tick: true, weight: 'light', noGain: true, dir: norm(e.position.x - x, e.position.z - z), shake: 0.1 });
      }
    }
    return true;
  },
  end(c, reason) {
    if (reason !== 'done') return;
    const { caster, sys, def } = c;
    const pr = def.params ?? {};
    const nr = pr.novaRadius ?? 8;
    sys.vfx('arcane_burst', at(caster, 0.5), { scale: vfxScale('arcane_burst', nr) });
    sys.vfx('shockwave', [caster.position.x, 0.1, caster.position.z], { scale: vfxScale('shockwave', nr) });
    sys.ring(caster.position.x, caster.position.z, nr, 0xff6bd8);
    sys.sfx('explosion', caster.position);
    sys.shake(0.65, 0.5);
    sys.hitstopMs(120);
    sys.playClip(caster, 'Spellcast_Shoot', { speed: 1.2, fade: 0.04 });
    if (c.remote) return;
    const list = enemiesIn(caster.position.x, caster.position.z, nr);
    for (const e of list) {
      sys.strike(c, e, { coef: pr.novaCoef ?? 4, weight: 'ultimate', stagger: pr.novaStagger ?? 60, knockback: def.knockback ?? 5, noGain: true, dir: norm(e.position.x - caster.position.x, e.position.z - caster.position.z) });
    }
  },
};

/** Barbar: Ata Fırtınası — consume all rage, channelled tornado pulling enemies in. */
const tempest: Behavior = {
  begin(c) {
    if (c.remote) return;
    const { caster, def, sys } = c;
    const min = def.params?.minResource ?? 50;
    if (caster.resource < min) { sys.fail('resource'); return false; }
    c.data.rage = caster.resource;
  },
  fire(c) {
    const { caster, sys, def } = c;
    if (!c.remote) {
      const rage = caster.resource;
      c.data.rage = rage;
      caster.resource = 0;
      c.data.bonus = 1 + Math.min(1, rage * 0.01);
      caster.statuses.addImmunity('cc', (def.channel ?? 2.4) + 0.2);
      caster.statuses.apply('fortify', (def.channel ?? 2.4) + 0.2, { magnitude: def.params?.dr ?? 0.3, sourceId: caster.id });
    }
    sys.vfx('spin_slash', at(caster, 1.0), { follow: caster.object3d, duration: def.channel ?? 2.4, scale: vfxScale('spin_slash', def.radius ?? 6) });
    sys.vfx('enrage_aura', at(caster, 0.2), { follow: caster.object3d, duration: def.channel ?? 2.4, scale: 1.5 });
    sys.sfx('war_cry', caster.position, { pitch: 0.8 });
    sys.shake(0.3, 0.4);
  },
  tick(c, n) {
    const { caster, sys, def } = c;
    const pr = def.params ?? {};
    const total = def.ticks ?? 8;
    const radius = def.radius ?? 6;
    const last = n >= total - 1;
    sys.vfx('slash_arc_big', at(caster, 1.0), { dir: [Math.sin(n * 1.7), 0, Math.cos(n * 1.7)], scale: Math.max(0.9, radius / 4.9), color: 0xff7a5a });
    sys.shake(0.1 + (last ? 0.3 : 0), 0.2);
    if (c.remote) return n < total;
    caster.statuses.addImmunity('cc', 0.5);
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    const bonus = (c.data.bonus as number) ?? 1;
    for (const e of list) {
      const d = norm(e.position.x - caster.position.x, e.position.z - caster.position.z);
      if (last) sys.strike(c, e, { more: bonus, weight: 'heavy', knockback: def.knockback ?? 4, dir: d, noGain: true, stagger: 25 });
      else sys.strike(c, e, { more: bonus, tick: true, knockback: pr.pull ? 1.2 : 0, dir: [-d[0], -d[1]], noGain: true });
    }
    if (last) sys.hitstopMs(100);
    else if (list.length) sys.sfx('hit_flesh', caster.position, { volume: 0.5, pitchVar: 0.25 });
    return n < total - 1;
  },
  end(c) {
    c.sys.vfx('ground_slam', [c.caster.position.x, 0.05, c.caster.position.z], { scale: 2.4 });
  },
};

/** Haydut: Gölge Adımı — teleport behind the target. */
const shadowStep: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const w = G.world;
    const from = caster.position.clone();
    sys.vfx('shadow_burst', at(caster, 1.0), { scale: 1.3 });
    sys.vfx('stealth_smoke', at(caster, 0.3), { scale: 1.1 });
    sys.hideModel(caster, 0.08);
    if (!c.remote) {
      const range = def.range ?? 15;
      const t = c.target;
      let nx: number, nz: number, face: [number, number];
      if (t && dist2(t.position, from) <= range + t.radius) {
        // behind the target: opposite to its facing
        const fx = Math.sin(t.yaw), fz = Math.cos(t.yaw);
        const off = t.radius + caster.radius + 0.55;
        nx = t.position.x - fx * off; nz = t.position.z - fz * off;
        face = norm(t.position.x - nx, t.position.z - nz);
      } else {
        const D = Math.min(def.params?.fallback ?? 8, range);
        let dd = D;
        if (w) { const f = w.nav.raycast(from.x, from.z, from.x + c.dir[0] * D, from.z + c.dir[1] * D); if (f < 1) dd = D * f * 0.9; }
        nx = from.x + c.dir[0] * dd; nz = from.z + c.dir[1] * dd;
        face = c.dir;
      }
      caster.position.x = nx; caster.position.z = nz;
      w?.nav.resolveCircle(caster.position, caster.radius);
      caster.yaw = yawFromDir(face[0], face[1]);
      caster.forcedMove = null;
      if (def.selfStatuses) sys.applySelf(c, def.selfStatuses);
      sys.addCombo(caster, def.params?.cp ?? 1);
    }
    sys.vfx('shadow_burst', at(caster, 1.0), { scale: 1.3 });
    sys.sfx('whoosh', caster.position, { pitch: 1.4 });
    sys.playClip(caster, 'Dodge_Forward', { speed: 1.8, fade: 0.03 });
    G.camera?.kickFov?.(-3);
  },
};

/** Haydut: Bıçak Yelpazesi — radial knife throw. */
const fan: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = def.radius ?? 5;
    const n = p.knives ?? 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const d: [number, number] = [Math.sin(a), Math.cos(a)];
      Projectile.spawn({
        mode: 'visual', owner: caster, vfx: (def.vfx?.projectile as VfxId) ?? 'dagger_projectile', scale: 0.8,
        origin: [caster.position.x + d[0] * 0.7, caster.position.y + 1.2, caster.position.z + d[1] * 0.7], dir: d, speed: 22, radius: 0.1, range: radius, pierce: 99, spin: 14,
      });
    }
    sys.vfx(def.vfx?.cast ?? 'poison_burst', at(caster, 1.0), { scale: vfxScale(def.vfx?.cast ?? 'poison_burst', radius) });
    sys.ring(caster.position.x, caster.position.z, radius, 0x7dff5a);
    sys.shake(0.12);
    sys.sfx('dagger_throw', caster.position);
    if (c.remote) return;
    const list = enemiesIn(caster.position.x, caster.position.z, radius);
    const res = strikeMany(c, list, 99, { noGain: true });
    if (res.length) sys.addCombo(caster, Math.min(p.cpMax ?? 3, res.length * (p.cpPerTarget ?? 1)));
  },
};

/** Haydut: İnfaz — spends all combo points for a huge finisher; 5 points bleed + stun; venom bursts poison. */
const eviscerate: Behavior = {
  begin(c) {
    if (c.remote) return;
    const { caster, sys, def } = c;
    const need = def.params?.minCp ?? 1;
    if (sys.comboPoints(caster) < need) { sys.fail('resource'); return false; }
    c.data.cp = sys.comboPoints(caster);
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const cp = c.remote ? 3 : sys.consumeCombo(caster);
    const range = def.range ?? 2.8;
    swingVfx(c, range, def.arc ?? 60, true);
    sys.vfx('hit_blood', [caster.position.x + c.dir[0] * range * 0.6, caster.position.y + 1.1, caster.position.z + c.dir[1] * range * 0.6], { dir: [c.dir[0], 0, c.dir[1]], scale: 1.2 });
    if (c.remote) return;
    const coef = (def.damage?.coef ?? 1.4) + (p.coefPerCp ?? 1.2) * cp;
    const targets = sys.enemiesInCone(caster, c.dir, range, def.arc ?? 60);
    const statuses = cp >= 5 ? [{ status: 'bleed' as const, duration: 4, magnitude: 1.0 }, { status: 'stun' as const, duration: 0.5 }] : undefined;
    const venom = caster.statuses.has('venom');
    const sv4 = cp >= 5 && hasSp('set_shadow_veil_4');
    const res = strikeMany(c, targets, p.maxTargets ?? 3, {
      coef, weight: 'heavy', stagger: (p.stagger ?? 8) + (p.staggerPerCp ?? 6) * cp, statuses, noGain: true, hitstop: 70 + cp * 10, shake: 0.28 + cp * 0.04,
      more: sv4 ? 2.5 : 1,
    });
    // Gölge Peçesi (4): a full finisher resets Gölge Adımı; Fısıltı refunds Kombo Puanları
    if (sv4) sys.resetCooldown(caster, 'rogue_shadow_step');
    const wh = sp('leg_whisper');
    if (wh && cp >= 5) sys.addCombo(caster, wh.refundCombo ?? 2);
    // Zehir Patlaması
    if (venom && res.length) {
      for (const e of targets.slice(0, p.maxTargets ?? 3)) {
        const ps = e.statuses.get('poison');
        if (!ps || ps.dps <= 0) continue;
        const total = ps.dps * ps.remaining * 1.5;
        e.statuses.remove('poison');
        sys.vfx('poison_burst', at(e, e.height * 0.5), { scale: 1.6 });
        sys.ring(e.position.x, e.position.z, 3, 0x7dff5a);
        for (const o of enemiesIn(e.position.x, e.position.z, 3)) {
          sys.strike(c, o, { coef: 0, flat: total, type: 'poison', tick: true, noGain: true, canCrit: false, dir: norm(o.position.x - e.position.x, o.position.z - e.position.z) });
        }
      }
    }
    if (cp >= 5) sys.vfx('crit_burst', at(caster, 1.2), { scale: 1.2 });
    if (!res.length) sys.whiff(c);
  },
};

/** Haydut: Duman Bombası — smoke zone: enemies blind, the Haydut stealthed. */
const smoke: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const radius = def.radius ?? 5;
    const dur = def.duration ?? 5;
    const px = caster.position.x, pz = caster.position.z;
    // the stealth_smoke preset lingers around ONE point (body sized): a cloud of puffs fills the whole zone
    sys.vfx('stealth_smoke', [px, 0.3, pz], { scale: 1.5, duration: dur });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      sys.vfx('stealth_smoke', [px + Math.cos(a) * radius * 0.62, 0.3, pz + Math.sin(a) * radius * 0.62], { scale: 1.25, duration: dur });
    }
    sys.telegraphFriendly(px, pz, radius, dur);
    sys.ring(px, pz, radius, 0x9a9a9a);
    sys.sfx('dagger_throw', caster.position, { pitch: 0.7 });
    sys.shake(0.08);
    if (c.remote) return;
    sys.applySelf(c, def.selfStatuses ?? []);
    let blindT = 0;
    sys.addZone({
      x: px, z: pz, radius, duration: dur, tick: 0.25, t: 0, next: 0.05,
      onTick: (z) => {
        blindT += 0.25;
        for (const e of enemiesIn(z.x, z.z, radius)) {
          if (blindT >= 1 || blindT === 0.25) {
            sys.statusOnly(c, e, [{ status: 'blind', duration: 2 }]);
            if (!G.net || G.net.isAuthority) { if (e.targetId === caster.id) e.targetId = null; }
          }
        }
        if (blindT >= 1) blindT = 0;
        if (dist2(caster.position, z) <= radius) caster.statuses.apply('stealth', 1.2, { sourceId: caster.id });
      },
    });
  },
};

/** Haydut: Ok Yağmuru — falling bolts over an area in waves. */
const boltRain: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = (def.radius ?? 5) * (1 + sys.softStat(caster, 'aoeRadiusPct'));
    const [px, pz] = c.point;
    const waves = def.ticks ?? 8;
    const every = p.tick ?? 0.25;
    sys.sfx('crossbow_shot', caster.position);
    sys.telegraphFriendly(px, pz, radius, waves * every);
    sys.sfx('whoosh', [px, 0, pz] as unknown as THREE.Vector3, { pitch: 1.5, volume: 0.5 });
    sys.addZone({
      x: px, z: pz, radius, duration: waves * every, tick: every, t: 0, next: 0.2,
      onTick: (z) => {
        for (let i = 0; i < 5; i++) {
          const a = cosmeticRng.next() * Math.PI * 2, r = Math.sqrt(cosmeticRng.next()) * radius;
          const bx = z.x + Math.cos(a) * r, bz = z.z + Math.sin(a) * r;
          Projectile.spawn({
            mode: 'visual', owner: caster, vfx: (def.vfx?.projectile as VfxId) ?? 'arrow_projectile', scale: 0.9,
            origin: [bx, 9, bz], dir: [0, 1], speed: 1, radius: 0.1, range: 1, pitch: Math.PI / 2,
            lob: { to: [bx, bz], duration: 0.2, arc: 0 },
            onEnd: (pr, reason) => { if (reason === 'arrive') sys.vfx('hit_spark', [bx, 0.15, bz], { scale: 0.5 }); },
          });
        }
        if (c.remote) return;
        for (const e of enemiesIn(z.x, z.z, radius)) {
          sys.strike(c, e, { tick: true, noGain: true, dir: norm(e.position.x - z.x, e.position.z - z.z), knockback: 0 });
        }
        sys.shake(0.05);
        sys.sfx('hit_flesh', [z.x, 0, z.z] as unknown as THREE.Vector3, { volume: 0.4, pitchVar: 0.3 });
      },
    });
  },
};

/** Haydut: Ölüm Dansı — untargetable multi-strike dance between up to 8 enemies. */
const deathBlossom: Behavior = {
  begin(c) {
    if (c.remote) return;
    const { caster, sys, def } = c;
    const range = def.range ?? 12;
    const list = enemiesIn(caster.position.x, caster.position.z, range).filter((e) => !e.isDead);
    if (!list.length) { sys.fail('target'); return false; }
    list.sort((a, b) => dist2(a.position, caster.position) - dist2(b.position, caster.position));
    c.data.targets = list.slice(0, def.params?.maxTargets ?? 8);
    const per = def.params?.perTarget ?? 0.3;
    const total = (c.data.targets as Enemy[]).length * per + 0.25;
    const a = c.action!;
    a.hitAt = 0.02;
    a.endAt = total;
    a.chainAt = total;
    a.moveAt = total;
    a.uninterruptible = true;
    c.data.idx = 0;
    c.data.stepT = 0;
    c.data.per = per;
    c.data.total = total;
    caster.statuses.apply('invulnerable', total + 0.1, { sourceId: caster.id });
    caster.statuses.addImmunity('cc', total + 0.2);
    sys.hideModelFor(caster, total, 0.45);
  },
  frame(c, dt, elapsed) {
    const { caster, sys, def } = c;
    if (c.remote) return;
    const targets = c.data.targets as Enemy[];
    const per = c.data.per as number;
    const idx = Math.floor(elapsed / per);
    const strikes = def.params?.strikes ?? 3;
    // advance to the next target
    while ((c.data.idx as number) <= idx && (c.data.idx as number) < targets.length) {
      const i = c.data.idx as number;
      const t = targets[i];
      c.data.idx = i + 1;
      if (!t || t.isDead) continue;
      const from = caster.position.clone();
      const d = norm(t.position.x - from.x, t.position.z - from.z);
      caster.position.x = t.position.x - d[0] * (t.radius + 0.7);
      caster.position.z = t.position.z - d[1] * (t.radius + 0.7);
      G.world?.nav.resolveCircle(caster.position, caster.radius);
      caster.yaw = yawFromDir(d[0], d[1]);
      sys.vfx('shadow_burst', [from.x, from.y + 1, from.z], { scale: 0.9 });
      sys.vfx('shadow_burst', at(caster, 1.0), { scale: 0.9 });
      const clips = ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Chop', 'Dualwield_Melee_Attack_Stab'];
      for (let s = 0; s < strikes; s++) {
        sys.schedule(s * (per / strikes) * 0.9, () => {
          if (!t || t.isDead) return;
          sys.playClip(caster, clips[(i + s) % clips.length], { speed: 3.2, fade: 0.02 });
          const dd = norm(t.position.x - caster.position.x, t.position.z - caster.position.z);
          sys.strike(c, t, { weight: 'light', dir: dd, noGain: true, hitstop: 32, shake: 0.12 });
          sys.vfx('slash_arc', at(t, t.height * 0.55), { dir: [dd[0], 0, dd[1]], scale: 1.1, color: 0xa46bff });
          sys.vfx('hit_blood', at(t, t.height * 0.5), { dir: [dd[0], 0, dd[1]], scale: 0.8 });
          sys.sfx('swing_light', caster.position, { pitch: 1.2 + s * 0.1, volume: 0.6 });
        });
      }
    }
    void dt;
  },
  fire(c) {
    c.sys.sfx('whoosh', c.caster.position, { pitch: 0.8 });
    c.sys.shake(0.15);
  },
  end(c, reason) {
    const { caster, sys, def } = c;
    sys.showModel(caster);
    if (c.remote || reason !== 'done') return;
    sys.addCombo(caster, def.params?.cpEnd ?? 5);
    sys.vfx('shadow_burst', at(caster, 1.0), { scale: 1.2 });
    sys.hitstopMs(50);
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// GDD_V2 WP5 spec skills (non-mage): taunt, absorbs, pip builders/spenders, backstab, healer kit.
// ---------------------------------------------------------------------------------------------------------------------

/** Nearest living enemy the cast can reach: the soft target when it is in the cone, else the first one in the cone. */
function pickEnemy(c: CastCtx, range: number, arc: number): Enemy | null {
  const t = c.target;
  if (t && t.kind === 'enemy' && !t.isDead && Math.hypot(t.position.x - c.caster.position.x, t.position.z - c.caster.position.z) <= range) return t as Enemy;
  return c.sys.enemiesInCone(c.caster, c.dir, range, arc)[0] ?? null;
}

/** Kışkırtma (knight_provoke / barbarian_provoke): taunt 3 s (boss 2 s), threat set to max(current, top × 1.10) + 100. */
const provoke: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (!pickEnemy(c, c.def.range ?? 25, 60)) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    const { caster, def } = c;
    if (c.remote) return;
    const p = def.params ?? {};
    const e = pickEnemy(c, def.range ?? 25, 60);
    if (!e) return;
    e.statuses.apply('taunt', e.def.rank === 'boss' ? (p.bossTauntDur ?? 2) : (p.tauntDur ?? 3), { sourceId: caster.id });
    if (e.authority && e.ai) {
      let top = 0;
      for (const v of e.ai.threat.values()) if (v > top) top = v;
      const cur = e.ai.threat.get(caster.id) ?? 0;
      e.ai.threat.set(caster.id, Math.max(cur, top * 1.1) + (p.threatBoost ?? 100));
    }
    c.sys.sfx('buff', caster.position);
  },
};

/** Absorb on self: magnitude = absorbPct × max HP, cap capPct (the shield status of Actor.statuses.absorb). */
const absorbSelf: Behavior = {
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    const st = def.selfStatuses?.[0];
    c.sys.vfx('shield_bubble', at(caster, 1.1), { follow: caster.object3d, duration: 1.2, scale: 1.0 });
    if (c.remote) return;
    addAbsorb(caster, caster.maxHp * (p.absorbPct ?? 0.2), caster.maxHp * (p.capPct ?? 0.45), st?.duration ?? 8, st?.status, caster.id);
    c.sys.sfx('buff', caster.position);
  },
};

/** Karar Darbesi: spends 1–5 Adalet pips; coefficient 2.0 + 1.0 × pips, poise 10 + 8 × pips, 5 pips = knockback. */
const templar: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const pips = c.caster.pips?.adalet ?? 0;
    if (pips < 1) { c.sys.fail('resource'); return false; }
    c.data.pips = pips;
    return true;
  },
  fire(c) {
    const { caster, def } = c;
    swingVfx(c, def.range ?? 3.2, def.arc ?? 100, true);
    if (c.remote) return;
    const p = def.params ?? {};
    const pips = (c.data.pips as number | undefined) ?? (caster.pips?.adalet ?? 0);
    const targets = c.sys.enemiesInCone(caster, c.dir, def.range ?? 3.2, def.arc ?? 100);
    strikeMany(c, targets, 99, { coef: 2.0 + pips, weight: pips >= 5 ? 'heavy' : 'light', stagger: (p.stagger ?? 10) + (p.staggerPerPip ?? 8) * pips, knockback: pips >= 5 ? 2 : 0 });
    caster.pips = { ...(caster.pips ?? {}), adalet: 0 };
  },
};

/** Kutsal Alev Dalgası: cone burst; +2 Adalet on the first target, +1 per extra target (cap 5). */
const wakeFlames: Behavior = {
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    swingVfx(c, def.range ?? 9, def.arc ?? 70, true);
    if (c.remote) return;
    const targets = c.sys.enemiesInCone(caster, c.dir, def.range ?? 9, def.arc ?? 70);
    strikeMany(c, targets, 99, { stagger: p.stagger ?? 14 });
    if (!targets.length) return;
    const gain = (p.pipsHit ?? 2) + Math.max(0, targets.length - 1) * (p.pipsExtra ?? 1);
    caster.pips = { ...(caster.pips ?? {}), adalet: Math.min(p.pipsCap ?? 5, (caster.pips?.adalet ?? 0) + gain) };
  },
};

/** Sırttan Bıçak: ×2 from behind (rear 100°), +2 Kombo (+3 from behind); ×1.8 from stealth. */
function behindTarget(e: Enemy, caster: Actor): boolean {
  const fwdX = Math.sin(e.yaw), fwdZ = Math.cos(e.yaw);
  let dx = caster.position.x - e.position.x, dz = caster.position.z - e.position.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  return fwdX * dx + fwdZ * dz < -0.64;
}
const backstab: Behavior = {
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    swingVfx(c, def.range ?? 2.6, def.arc ?? 45, false);
    if (c.remote) return;
    const stealth = caster.statuses.has('stealth') ? 1.8 : 1;
    let combo = 0;
    for (const e of c.sys.enemiesInCone(caster, c.dir, def.range ?? 2.6, def.arc ?? 45)) {
      const behind = behindTarget(e, caster);
      c.sys.strike(c, e, { more: (behind ? (p.behindMore ?? 2) : 1) * stealth, stagger: (p.stagger ?? 8) * (behind ? (p.behindStagger ?? 1.5) : 1), weight: 'light' });
      combo = Math.max(combo, behind ? (p.behindCombo ?? 3) : (p.combo ?? 2));
    }
    if (combo > 0) c.sys.addCombo(caster, combo);
  },
};

/** Demir Duruş / Kalkan Kaldır are self buffs (selfBuff); their charges live on the SkillDef. Execute: see below. */

/** İdam: usable only on targets under 35% HP (no cost otherwise); coefficient 5.0 + 0.4 × bleed stacks; culls trash/elites under 10%. */
const execute: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const p = c.def.params ?? {};
    const t = c.sys.enemiesInCone(c.caster, c.dir, c.def.range ?? 3.2, c.def.arc ?? 70).find((e) => e.hp / Math.max(1, e.maxHp) < (p.threshold ?? 0.35));
    if (!t) { c.sys.fail('target'); return false; }
    c.data.target = t;
    return true;
  },
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    swingVfx(c, def.range ?? 3.2, def.arc ?? 70, true);
    if (c.remote) return;
    const t = c.data.target as Enemy | undefined;
    if (!t || t.isDead) return;
    const bleed = t.statuses.get('bleed')?.stacks ?? 0;
    const cull = t.hp / Math.max(1, t.maxHp) < (p.cull ?? 0.1) && (t.def.rank === 'trash' || t.def.rank === 'elite');
    c.sys.strike(c, t, { coef: 5.0 + (p.bleedCoef ?? 0.4) * bleed, stagger: p.stagger ?? 25, more: cull ? 20 : 1, weight: 'heavy' });
    if (t.isDead) c.sys.addResource(caster, p.refund ?? 15);
  },
};

/** Şişe Fırlat (alchemist lmb): ally aimed = instant heal; otherwise the normal projectile (poison). */
const vialThrow: Behavior = {
  begin(c) {
    return projectile.begin ? projectile.begin(c) : undefined;
  },
  frame(c, dt, el) {
    projectile.frame?.(c, dt, el);
  },
  fire(c) {
    const { caster, def } = c;
    const ally = c.aim.allyId != null ? G.world?.get<Player>(c.aim.allyId) : null;
    if (ally && ally.kind === 'player' && !ally.isDead && Math.hypot(ally.position.x - caster.position.x, ally.position.z - caster.position.z) <= (def.range ?? 22)) {
      if (!c.remote) {
        healAlly(caster, ally, def.heal?.coef ?? 1.0);
        caster.pips = { ...(caster.pips ?? {}), karisim: Math.min(5, (caster.pips?.karisim ?? 0) + 1) };
      }
      c.sys.sfx('potion_use', caster.position);
      return;
    }
    projectile.fire(c);
  },
  end(c, reason) {
    projectile.end?.(c, reason);
  },
};

/** Şifa Şişesi: ground splash heal (1.8×W) to allies in 3.5 m, +1 Karışım per ally (max 2), then a 6 s puddle (0.25×W/s). */
const vialHeal: Behavior = {
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    const [x, z] = c.point;
    const r = def.radius ?? 3.5;
    const near = (): Player[] => (G.world?.players ?? []).filter((a) => !a.isDead && Math.hypot(a.position.x - x, a.position.z - z) <= r + a.radius);
    c.sys.ring(x, z, r, TYPE_COLORS.physical);
    c.sys.sfx('potion_use', [x, 0, z]);
    if (c.remote) return;
    let gained = 0;
    for (const a of near()) {
      healAlly(caster, a, def.heal?.coef ?? 1.8);
      if (gained < (p.pipsCap ?? 2)) gained++;
    }
    caster.pips = { ...(caster.pips ?? {}), karisim: Math.min(5, (caster.pips?.karisim ?? 0) + gained) };
    const per = healFormula(caster, p.puddleCoef ?? 0.25).amount;
    for (let i = 1; i <= (p.puddleTicks ?? 6); i++) c.sys.schedule(i, () => { for (const a of near()) healAmount(caster, a, per); });
  },
};

/** Panzehir: removes up to 3 dispellable debuffs from an ally (or self), heals 0.8×W, short regen. */
const antidote: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = resolveHealTarget(c.caster, c.aim, false);
    if (!t) { c.sys.fail('target'); return false; }
    c.data.target = t;
    return true;
  },
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    c.sys.vfx('shield_bubble', at(caster, 1.0), { duration: 1.0, scale: 0.8 });
    if (c.remote) return;
    const t = (c.data.target as Player | undefined) ?? caster;
    dispelUpTo(t, p.dispels ?? 3);
    healAlly(caster, t, def.heal?.coef ?? 0.8);
    t.statuses.apply('regen', p.regenDur ?? 4, { magnitude: t.maxHp * (p.regenPct ?? 0.02), sourceId: caster.id });
  },
};

/** Duman Siperi: 6 s ground cloud (r 5 m): allies DR 20%, enemies blinded (50% miss). */
const smokeWard: Behavior = {
  fire(c) {
    const { caster, def, sys } = c;
    const p = def.params ?? {};
    const [x, z] = c.point;
    const r = def.radius ?? 5;
    sys.vfx('shield_bubble', [x, 0.2, z], { scale: r * 0.5, duration: def.duration ?? 6 });
    if (c.remote) return;
    const tick = (): void => {
      sys.applyPartyAt(c, 'fortify', 1.2, p.drPct ?? 0.2, x, z, r);
      for (const e of sys.enemiesNear(x, z, r)) e.statuses.apply('blind', p.blindDur ?? 1.2, { sourceId: caster.id });
    };
    tick();
    for (let i = 1; i < Math.ceil(def.duration ?? 6); i++) sys.schedule(i, tick);
  },
};

/** Mucize Damla: needs at least one Karışım pip; heal (1.6 + 1.1 × pips) × W, consumes every pip. */
const mending: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const pips = c.caster.pips?.karisim ?? 0;
    if (pips < 1) { c.sys.fail('resource'); return false; }
    const t = resolveHealTarget(c.caster, c.aim, false);
    if (!t) { c.sys.fail('target'); return false; }
    c.data.target = t;
    c.data.pips = pips;
    return true;
  },
  fire(c) {
    const { caster, def } = c;
    const p = def.params ?? {};
    c.sys.vfx('shield_bubble', at(caster, 1.0), { duration: 1.0, scale: 0.9 });
    if (c.remote) return;
    const t = (c.data.target as Player | undefined) ?? caster;
    const pips = (c.data.pips as number | undefined) ?? 0;
    healAlly(caster, t, (def.heal?.coef ?? 1.6) + (p.perPip ?? 1.1) * pips);
    caster.pips = { ...(caster.pips ?? {}), karisim: 0 };
  },
};

export const BEHAVIORS: Record<string, Behavior> = {
  provoke,
  absorb_self: absorbSelf,
  templar,
  wake_flames: wakeFlames,
  backstab,
  execute,
  vial_throw: vialThrow,
  vial_heal: vialHeal,
  antidote,
  smoke_ward: smokeWard,
  mending,
  ...MAJOR_BEHAVIORS,
  shield_wall: shieldWall,
  banner,
  channel_aoe: channelAoe,
  fissure,
  boomerang,
  barrier,
  meteor,
  blizzard,
  orb,
  cataclysm,
  tempest,
  shadow_step: shadowStep,
  fan,
  eviscerate,
  smoke,
  bolt_rain: boltRain,
  death_blossom: deathBlossom,
};

export function behaviorFor(def: SkillDef): Behavior {
  return (def.behavior && BEHAVIORS[def.behavior]) || TARGETING_BEHAVIORS[def.targeting] || meleeArc;
}

// GDD_TALENTS: side-effect modules that register talent behaviours (T9 utilities) and the spec hook tables (T8 mage).
// The mage tables are registered under their trait ids (specials.ts registerSpecHooks, GDD_TALENTS T7).
import './utilities';
import { mageHooks } from '../specs/mage';
import { registerSpecHooks } from '../specials';
for (const trait of mageHooks.traits) registerSpecHooks(trait, mageHooks);
