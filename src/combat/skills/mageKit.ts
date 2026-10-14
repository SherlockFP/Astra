/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2e Arkan Füzeler, §3a Ateş, §4a Buz, §2a arcane extras). Behaviours of the mage kit:
 *   homing_missiles   Arkan Füzeler: five curved missiles every 0.4 s, alternating hands, steered to the live target
 *   arcane_blast      Arkan Patlama: arcane cast hands + charge orbs, then the normal projectile
 *   fire_cast         Ateş Topu / Piroblast / Kavurma: fire cast hands, then the normal projectile
 *   frost_cast        Ayaz Oku: frost cast hands, then the normal projectile
 *   fire_blast        Ateş Patlaması: off-GCD, guaranteed crit while Isınıyor (converts it to Sıcak Seri), Ignite spread
 *   flamestrike       Alev Sütunu: ground r 6, crowd-scaled damage
 *   ice_lance         Buz Mızrağı: x3 on a Frozen target, Buz Parmağı or Donma >= 6, 70 % splash on a shatter
 *   flurry            Dondurucu Sağanak: three hits, +1 Donma each, 25 % Dondurucu Yağmur
 *   ray_of_frost      Ayaz Işını: 3.2 s channel, 8 ticks, Kuyruklu Yıldız Hazır after half of it
 *   comet_storm       Kuyruklu Yıldız Yağmuru: seven delayed ground hits (needs comet_ready)
 *   glacial_spike     Buz Sarkıtı: needs glacial_ready, spends the icicles, x1.5 on Donma >= 6, splash
 *   ward_barrier      Buz / Prizmatik Bariyeri: absorb + status
 *   arcane_pulse      Arkan Nabzı: r 8 crowd-scaled damage, +1 Gizem Yükü per enemy struck (max 4)
 *   living_bomb       Canlı Bomba: bolt, 12 s burn fuse, explosion at the last point (or on the target's death)
 *   dragons_breath    Ejderha Nefesi: every enemy inside the 60 degree cone within r 8
 *   evocation         Büyü Çağırma: 6 s channel, mana tick every 1 s
 * plus the charge-orb sync (one `arcane_charge_orb` loop per arcane charge). Installed into BEHAVIORS as a side effect of the
 * import at the end of behaviors.ts; the module cycle can leave BEHAVIORS in its temporal dead zone, so installation falls
 * back to a microtask (the same pattern as utilities.ts). OWNER: combat (kit).
 *
 * Not done here (see the PK-MAGE report): the Füzeler's first-frame outward burst, haste scaling of the channel wave spacing
 * (the engine tick is fixed `params.tick`), Kar Fırtınası as an instant free cast (its legacy channel stays).
 */
import { G } from '../../game/G';
import { cosmeticRng, clamp } from '../../core/utils';
import { Projectile } from '../../entities/Projectile';
import { BEHAVIORS, TARGETING_BEHAVIORS, groundAt, crowdFactor, type Behavior, type CastCtx } from './behaviors';
import { addAbsorb } from '../healing';
import { weaponAvg } from '../specials';
import type { MageCastMods } from '../specs/mage';
import type { SkillSystem } from '../SkillSystem';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { VfxHandle } from '../../vfx/VFX';
import type { StatusId } from '../../types/skills';
import type { VfxId } from '../../types/vfx';

const ARCANE_VIOLET = 0xb78cff;
const BERRAK_WHITE = 0xffffff;
/** Missiles per channel (waves). The engine ticks every `params.tick` = 0.4 s from the hit frame: waves at 0.1, 0.5 ... 1.7 s. */
const WAVES = 5;
const MISSILE_SPEED = 22;
const MISSILE_RANGE = 40;
/** Safety net for a missile that never reaches its target (the curve ends on the target, so this is rarely reached). */
const MISSILE_LIFE = 3;
const RETARGET_R = 12;
/** Three or more enemies within 10 m of the target: each wave picks the next nearest one (fan-out). */
const AOE_MIN = 3;
const AOE_R = 10;
/** Walking speed while channelling (CORE_MECHANICS §10.2): a 50 % move slow, refreshed on every wave. */
const WALK_SLOW = 0.5;
const SALVO_DUR = 15;
const CHARGE_ORBS_MAX = 4;
/** Ateş Patlaması converts Isınıyor into Sıcak Seri for this long (matches the streak duration of trait_pyromancer). */
const HOT_STREAK_DUR = 8;

type School = 'fire' | 'frost' | 'arcane';
const HANDS: Record<School, VfxId> = { fire: 'cast_hands_fire', frost: 'cast_hands_frost', arcane: 'cast_hands_arcane' };

const rotDir = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
};
const norm = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z);
  return l > 1e-5 ? [x / l, z / l] : [0, 1];
};

/** The cast's target as a live enemy (the soft / hard target), null when it is not one or is dead. */
function primaryTarget(c: CastCtx): Enemy | null {
  const t = c.target;
  const w = G.world;
  if (!w || !t || t.isDead) return null;
  return w.enemies.find((e) => e.id === t.id && !e.isDead) ?? null;
}

/** Live enemies within `r` of a ground point. */
function enemiesAt(x: number, z: number, r: number): Enemy[] {
  return G.world ? G.world.enemiesInRadius({ x, z }, r, groundAt(x, z)) : [];
}

/** Cast hands of a school (CW-15 preset) at the caster's hands, following the body. */
function castHands(sys: SkillSystem, caster: Actor, school: School): void {
  sys.vfx(HANDS[school], [caster.position.x, caster.position.y + 1.1, caster.position.z], { follow: caster.object3d });
}

// ---------------------------------------------------------------------------------------------------------------
// charge orbs (CW-15 `arcane_charge_orb`)
// ---------------------------------------------------------------------------------------------------------------

interface OrbState { orbs: VfxHandle[]; seen: number }
const orbStates = new WeakMap<Actor, OrbState>();

/**
 * One orbiting `arcane_charge_orb` loop per arcane charge (pip `arcane`); a spent charge stops its orb. A per-frame task keeps
 * the count in step and is started once per caster. Tasks are cleared on a world reset, so the task stamps `seen` each frame
 * and a stale stamp starts a new one (the state object is shared, so a second task cannot double the orbs).
 */
export function ensureChargeOrbs(sys: SkillSystem, caster: Actor): void {
  const now = G.world?.time ?? 0;
  let st = orbStates.get(caster);
  if (st && now - st.seen < 0.5) return;
  if (!st) {
    st = { orbs: [], seen: now };
    orbStates.set(caster, st);
  }
  const state = st;
  state.seen = now;
  sys.addTask(() => {
    state.seen = G.world?.time ?? state.seen;
    const n = Math.min(CHARGE_ORBS_MAX, sys.pipCount(caster, 'arcane'));
    while (state.orbs.length < n) {
      const h = sys.vfx('arcane_charge_orb', [caster.position.x, caster.position.y + 1.2, caster.position.z], { seed: state.orbs.length });
      if (!h) break;
      state.orbs.push(h);
    }
    while (state.orbs.length > n) state.orbs.pop()?.stop();
    return false;
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Arkan Füzeler (homing_missiles)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The enemy a wave goes for. One enemy: the cast's target. Three or more within 10 m of it: the i-th nearest (cycling), so the
 * five missiles fan out. Null without a live enemy target (the missiles then fly straight along the aim).
 */
function pickTarget(c: CastCtx, i: number): Enemy | null {
  const primary = primaryTarget(c);
  const w = G.world;
  if (!w || !primary) return null;
  const near = w.enemiesInRadius({ x: primary.position.x, z: primary.position.z }, AOE_R, null)
    .filter((e) => !e.isDead)
    .sort((a, b) => Math.hypot(a.position.x - primary.position.x, a.position.z - primary.position.z)
      - Math.hypot(b.position.x - primary.position.x, b.position.z - primary.position.z));
  if (near.length >= AOE_MIN) return near[i % near.length];
  return primary;
}

/**
 * Retarget on death (docs/kits/casters-rogue.md §2e): the missile keeps the last known point of its target and picks the
 * nearest living enemy within 12 m of it; none: `homing.targetId` is cleared and the missile flies straight on.
 */
function retargetPulse(first: Enemy): (p: Projectile) => void {
  let lx = first.position.x;
  let lz = first.position.z;
  return (p: Projectile): void => {
    const h = p.opts.homing;
    if (!h || h.targetId == null) return;
    const w = G.world;
    if (!w) return;
    const cur = w.getActor(h.targetId);
    if (cur && !cur.isDead) {
      lx = cur.position.x;
      lz = cur.position.z;
      return;
    }
    const next = w.enemiesInRadius({ x: lx, z: lz }, RETARGET_R, null)
      .filter((e) => !e.isDead && e.id !== h.targetId)
      .sort((a, b) => Math.hypot(a.position.x - lx, a.position.z - lz) - Math.hypot(b.position.x - lx, b.position.z - lz))[0];
    if (next) {
      h.targetId = next.id;
      lx = next.position.x;
      lz = next.position.z;
    } else {
      h.targetId = null;
    }
  };
}

/** One missile lands: coefficient per missile (0.60 with Berrak Zihin, the weak hardcast 0.36), +1 Gizem Mermisi, the hit look. */
function onMissileHit(c: CastCtx, e: Enemy, p: Projectile, i: number, clear: boolean): void {
  const { sys, caster } = c;
  const coef = (c.def.damage?.coef ?? 0.6) * (clear ? 1 : 0.6);
  const r = sys.strike(c, e, { coef, weight: 'light', dir: [p.dirX, p.dirZ], hitstop: 30, shake: 0.02 });
  if (!r) return;
  sys.afterHits(c, [r]);
  if (r.amount > 0) {
    caster.statuses.apply('arcane_salvo', SALVO_DUR, { stacks: 1, sourceId: caster.id });
    sys.vfx('arcane_missile_hit', [e.position.x, e.position.y + e.height * 0.55, e.position.z], { color: clear ? BERRAK_WHITE : ARCANE_VIOLET });
    sys.sfx('arcane_missile_hit', [e.position.x, e.position.y, e.position.z], { pitch: 1 + 0.06 * i });
  }
  if (i === WAVES - 1) {
    sys.shake(0.1);
    if (r.crit) sys.vfx('crit_ring', [e.position.x, e.position.y + 0.9, e.position.z], { color: ARCANE_VIOLET });
  }
}

/** One wave: a missile from the hand of this wave (1, 3, 5 left; 2, 4 right), curved to the target when there is one. */
function fireWave(c: CastCtx, i: number, clear: boolean): void {
  const { caster, sys } = c;
  const [fx, fz] = c.dir;
  const side = i % 2 === 0 ? -1 : 1;
  const ox = caster.position.x + fx * 0.6 - fz * 0.32 * side;
  const oz = caster.position.z + fz * 0.6 + fx * 0.32 * side;
  const oy = caster.position.y + 1.4;
  const target = pickTarget(c, i);

  let dir: [number, number] = c.dir;
  let curve: { lateral: number; rise: number; decay: number } | undefined;
  if (target) {
    const dx = target.position.x - ox;
    const dz = target.position.z - oz;
    const dist = Math.hypot(dx, dz);
    dir = dist > 1e-4 ? [dx / dist, dz / dist] : c.dir;
    // lateral control point: ±1.6 m scaled by distance (0.4 .. 1.4), rise 0.4 .. 1.2 m (docs §2e)
    const lateral = (cosmeticRng.next() * 2 - 1) * 1.6 * Math.min(1.4, Math.max(0.4, dist / 10));
    curve = { lateral, rise: 0.4 + cosmeticRng.next() * 0.8, decay: 1 };
  } else {
    dir = rotDir(c.dir, (i - (WAVES - 1) / 2) * 6);
  }

  let visual: VfxHandle | null = null;
  const proj = Projectile.spawn({
    mode: c.remote ? 'visual' : 'player',
    owner: caster,
    vfx: 'arcane_projectile',
    scale: 1,
    origin: [ox, oy, oz],
    dir,
    speed: MISSILE_SPEED,
    radius: 0.3,
    range: MISSILE_RANGE,
    lifetime: MISSILE_LIFE,
    pierce: 0,
    homing: target ? { targetId: target.id, turn: 0 } : undefined,
    curve,
    pulse: target ? { interval: 0.05, fn: retargetPulse(target) } : undefined,
    onHit: (e, p) => onMissileHit(c, e, p, i, clear),
    onEnd: (p, reason) => {
      visual?.stop();
      if (reason === 'wall') sys.vfx('arcane_missile_hit', [p.position.x, p.position.y, p.position.z], { scale: 0.6, color: clear ? BERRAK_WHITE : ARCANE_VIOLET });
    },
  });
  if (!proj) return;
  visual = sys.vfx('arcane_missile', [ox, oy, oz], { follow: proj.object3d, color: clear ? BERRAK_WHITE : ARCANE_VIOLET, scale: clear ? 1.25 : 1 });
  sys.sfx('arcane_missile_launch', [ox, oy, oz], { pitch: 1 + 0.04 * i });
}

const homingMissiles: Behavior = {
  begin(c) {
    ensureChargeOrbs(c.sys, c.caster);
    castHands(c.sys, c.caster, 'arcane');
    return true;
  },
  fire(c) {
    // the channel starts here; wave 1 is the first tick (same frame), so this only sets the lock-on and the walk speed
    const { sys, caster } = c;
    if (!c.remote) sys.actSlow(caster, WALK_SLOW, 0.5);
    const t = pickTarget(c, 0);
    if (t) sys.vfx('mark_loop', [t.position.x, t.position.y + t.height * 0.5, t.position.z], { follow: t.object3d, color: ARCANE_VIOLET, scale: 0.6, duration: 2.0 });
  },
  tick(c, n) {
    if (n >= WAVES) return true;
    if (!c.remote) c.sys.actSlow(c.caster, WALK_SLOW, 0.5);
    // Berrak Zihin is the clearcasting proc consumed by this cast (procMods resolved at cast start)
    fireWave(c, n, !!c.data.procMods);
    return true;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// school casts: cast hands at cast start, then the spell's own projectile
// ---------------------------------------------------------------------------------------------------------------

const arcaneBlast: Behavior = {
  begin(c) {
    ensureChargeOrbs(c.sys, c.caster);
    castHands(c.sys, c.caster, 'arcane');
    return true;
  },
  fire(c) {
    TARGETING_BEHAVIORS.projectile.fire(c);
  },
};

/** A projectile spell of one school: cast hands at cast start, then the normal projectile (fire / frost rows). */
function schoolCast(school: 'fire' | 'frost'): Behavior {
  return {
    begin(c) {
      castHands(c.sys, c.caster, school);
      return true;
    },
    fire(c) {
      TARGETING_BEHAVIORS.projectile.fire(c);
    },
  };
}

/** Straight bolt along `dir` (toward the target when there is one) with its own hit handler. */
function spawnBolt(c: CastCtx, dir: [number, number], onHitFn: (e: Enemy, p: Projectile) => void, speed: number, range: number): void {
  const { caster } = c;
  const origin: [number, number, number] = [caster.position.x + dir[0] * 0.9, caster.position.y + 1.35, caster.position.z + dir[1] * 0.9];
  Projectile.spawn({
    mode: c.remote ? 'visual' : 'player', owner: caster, vfx: (c.def.vfx?.projectile as VfxId | undefined) ?? 'frost_projectile', scale: 1,
    origin, dir, speed, radius: c.def.radius ?? 0.4, range, pierce: 0, onHit: onHitFn,
  });
}

/** Direction from the caster to the live target, or the aim when there is none. */
function boltDir(c: CastCtx): [number, number] {
  const t = primaryTarget(c);
  if (!t) return c.dir;
  return norm(t.position.x - c.caster.position.x, t.position.z - c.caster.position.z);
}

// ---------------------------------------------------------------------------------------------------------------
// Ateş
// ---------------------------------------------------------------------------------------------------------------

/** Ateş Patlaması (off-GCD, 3 charges): guaranteed crit while Isınıyor, which it converts to Sıcak Seri; Ignite spreads to 2. */
const fireBlast: Behavior = {
  fire(c) {
    const { caster, sys } = c;
    const p = c.def.params ?? {};
    const t = primaryTarget(c);
    if (!t) {
      sys.whiff(c);
      return;
    }
    const forced = caster.statuses.has('heating_up');
    if (forced) {
      caster.statuses.remove('heating_up');
      caster.statuses.apply('hot_streak', HOT_STREAK_DUR, { sourceId: caster.id });
    }
    const r = sys.strike(c, t, { forceCrit: forced, dir: norm(t.position.x - caster.position.x, t.position.z - caster.position.z) });
    if (r) sys.afterHits(c, [r]);
    if (c.remote) return;
    // Ignite spreads to up to two enemies near the target at 60 % of the remaining strength (the row's burn, magnitude scaled)
    const near = enemiesAt(t.position.x, t.position.z, p.spreadR ?? 8).filter((e) => e.id !== t.id).slice(0, p.spreadMax ?? 2);
    for (const e of near) e.statuses.apply('burn', 3, { magnitude: 0.25 * (p.spreadMult ?? 0.6), sourceId: caster.id });
  },
};

/** Alev Sütunu: ground r 6, damage to each enemy scaled by the crowd (8 targets = full), Ignite from the row. */
const flamestrike: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'fire');
    return true;
  },
  fire(c) {
    const { sys } = c;
    const [x, z] = c.point;
    const list = enemiesAt(x, z, c.def.radius ?? 6).slice(0, c.def.params?.maxTargets ?? 8);
    const coef = (c.def.damage?.coef ?? 2.8) * crowdFactor(list.length);
    const res = [];
    for (const e of list) {
      const r = sys.strike(c, e, { coef, dir: norm(e.position.x - x, e.position.z - z) });
      if (r) res.push(r);
    }
    sys.afterHits(c, res);
    sys.vfx('fire_ground', [x, 0.05, z], { scale: 1.5 });
    if (!c.remote) sys.shake(0.08);
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Buz
// ---------------------------------------------------------------------------------------------------------------

/** Donma stacks on a target (the enemy debuff `freezing`). */
const freezeStacks = (e: Enemy): number => e.statuses.get('freezing')?.stacks ?? 0;

/**
 * Buz Mızrağı: x3 on a Frozen target (the engine's frozenMult, set to 3 by resolveCast), and x3 by hand on the other targets
 * when a Buz Parmağı was spent on the cast or the target has Donma >= 6 (that many stacks are spent). A shatter splashes 70 %
 * of its damage to up to three enemies within 6 m.
 */
const iceLance: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'frost');
    return true;
  },
  fire(c) {
    const p = c.def.params ?? {};
    const base = c.def.damage?.coef ?? 0.85;
    const mult = p.shatterMult ?? 3;
    const need = p.freezeNeed ?? 6;
    const byFinger = ((c.data.mage as MageCastMods | undefined)?.consumeFingers ?? 0) > 0;
    spawnBolt(c, boltDir(c), (e, pr) => {
      const frozen = e.statuses.has('freeze');
      const n = freezeStacks(e);
      const byStacks = !frozen && !byFinger && n >= need;
      // the engine already applies x3 on a Frozen target; a finger or the stacks add the x3 by hand elsewhere
      const manual = frozen ? 1 : byFinger || byStacks ? mult : 1;
      if (byStacks) {
        e.statuses.remove('freezing');
        if (n - need > 0) e.statuses.apply('freezing', 15, { stacks: n - need, sourceId: c.caster.id });
      }
      const r = c.sys.strike(c, e, { coef: base * manual, weight: 'light', dir: [pr.dirX, pr.dirZ] });
      if (!r) return;
      c.sys.afterHits(c, [r]);
      if (!frozen && manual === 1) return;
      // the shatter: glass burst and 70 % splash to up to three enemies within 6 m
      c.sys.vfx('shatter_burst', [e.position.x, e.position.y + e.height * 0.5, e.position.z], { scale: 1 });
      c.sys.sfx('ice_shatter', [e.position.x, e.position.y, e.position.z]);
      const splash = (frozen ? 3 : manual) * (p.shatterSplash ?? 0.7) * base;
      const others = enemiesAt(e.position.x, e.position.z, p.splashR ?? 6).filter((o) => o.id !== e.id).slice(0, p.splashMax ?? 3);
      for (const o of others) c.sys.strike(c, o, { coef: splash, weight: 'light', noGain: true, dir: norm(o.position.x - e.position.x, o.position.z - e.position.z) });
    }, 40, 35);
  },
};

/** Buz Sarkıtı (talent): needs glacial_ready (begin refuses otherwise), spends the icicles, x1.5 on Donma >= 6, splash. */
const glacialSpike: Behavior = {
  begin(c) {
    if (!c.caster.statuses.has('glacial_ready')) return false;
    castHands(c.sys, c.caster, 'frost');
    return true;
  },
  fire(c) {
    const p = c.def.params ?? {};
    const base = c.def.damage?.coef ?? 3.3;
    c.caster.statuses.remove('glacial_ready');
    c.caster.statuses.remove('icicles');
    spawnBolt(c, boltDir(c), (e, pr) => {
      const mult = freezeStacks(e) >= (p.freezeNeed ?? 6) ? p.freezeMult ?? 1.5 : 1;
      const r = c.sys.strike(c, e, { coef: base * mult, weight: 'heavy', dir: [pr.dirX, pr.dirZ] });
      if (!r) return;
      c.sys.afterHits(c, [r]);
      c.sys.vfx('frost_burst', [e.position.x, e.position.y + e.height * 0.5, e.position.z], { scale: 1.4 });
      const others = enemiesAt(e.position.x, e.position.z, p.splashR ?? 3).filter((o) => o.id !== e.id).slice(0, p.splashMax ?? 3);
      for (const o of others) c.sys.strike(c, o, { coef: base * (p.splashCoef ?? 0.5), weight: 'light', noGain: true, dir: norm(o.position.x - e.position.x, o.position.z - e.position.z) });
    }, 20, 35);
  },
};

/** Dondurucu Sağanak: three quick hits (+1 Donma each from the row), 25 % chance of Dondurucu Yağmur. Beyin Donması makes it free. */
const flurry: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'frost');
    return true;
  },
  fire(c) {
    const { sys, caster } = c;
    const p = c.def.params ?? {};
    const t = primaryTarget(c);
    if (!t) {
      sys.whiff(c);
      return;
    }
    const res = [];
    for (let i = 0; i < (p.hits ?? 3); i++) {
      const r = sys.strike(c, t, { weight: 'light', dir: norm(t.position.x - caster.position.x, t.position.z - caster.position.z) });
      if (r) res.push(r);
    }
    sys.afterHits(c, res);
    if (res.length && Math.random() < (p.freezingRainChance ?? 0.25)) caster.statuses.apply('freezing_rain', 12, { sourceId: caster.id });
  },
};

/** Ayaz Işını: 3.2 s channel of 8 ticks on the target; slows the caster to 70 %; half a channel grants Kuyruklu Yıldız Hazır. */
const rayOfFrost: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'frost');
    return true;
  },
  fire(c) {
    c.data.rayTicks = 0;
    if (!c.remote) c.sys.actSlow(c.caster, c.def.params?.slow ?? 0.3, 0.5);
  },
  tick(c, n) {
    const t = primaryTarget(c);
    if (!t) return false;
    const { caster, sys } = c;
    if (!c.remote) sys.actSlow(caster, c.def.params?.slow ?? 0.3, 0.5);
    c.data.rayTicks = n + 1;
    sys.vfx('drain_beam', [caster.position.x, caster.position.y + 1.2, caster.position.z], {
      target: [t.position.x, t.position.y + t.height * 0.6, t.position.z], color: 0x8fe3ff, duration: 0.45,
    });
    if (c.remote) return true;
    sys.strike(c, t, { tick: true, noGain: true, dir: norm(t.position.x - caster.position.x, t.position.z - caster.position.z) });
    return true;
  },
  end(c, reason) {
    if (reason === 'done' && (c.data.rayTicks ?? 0) >= 4) c.caster.statuses.apply('comet_ready', 8, { sourceId: c.caster.id });
  },
};

/** Kuyruklu Yıldız Yağmuru: seven comets 0.1 s apart on the target point (needs comet_ready; begin refuses otherwise). */
const cometStorm: Behavior = {
  begin(c) {
    return c.caster.statuses.has('comet_ready');
  },
  fire(c) {
    const p = c.def.params ?? {};
    const [x, z] = c.point;
    const base = c.def.damage?.coef ?? 0.43;
    for (let k = 0; k < (p.comets ?? 7); k++) {
      c.sys.schedule(k * (p.gap ?? 0.1), () => {
        c.sys.vfx('frost_burst', [x, 0.6, z], { scale: 0.6 });
        if (c.remote) return;
        for (const e of enemiesAt(x, z, p.cometR ?? 1.5)) c.sys.strike(c, e, { coef: base, weight: 'light', dir: norm(e.position.x - x, e.position.z - z) });
      });
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------
// shields (Buz / Prizmatik Bariyeri) and Gizem Nabzı
// ---------------------------------------------------------------------------------------------------------------

/** The status and duration of each ward (its absorb is the row's absorbPct x max HP + absorbW x W). */
const WARD: Partial<Record<string, [StatusId, number]>> = {
  mage_ice_barrier: ['ice_barrier', 60],
  mage_prismatic_barrier: ['prismatic_barrier', 30],
};

const wardBarrier: Behavior = {
  fire(c) {
    const ward = WARD[c.def.id];
    if (!ward || c.remote) return;
    const [status, dur] = ward;
    const p = c.def.params ?? {};
    const amount = (p.absorbPct ?? 0.25) * c.caster.maxHp + (p.absorbW ?? 2) * weaponAvg(c.caster);
    addAbsorb(c.caster, amount, amount, dur, status, c.caster.id);
    c.caster.statuses.apply(status, dur, { sourceId: c.caster.id });
  },
};

/** Arkan Nabzı: everything within r 8 takes the crowd-scaled hit; +1 Gizem Yükü per enemy struck (max 4). */
const arcanePulse: Behavior = {
  begin(c) {
    ensureChargeOrbs(c.sys, c.caster);
    castHands(c.sys, c.caster, 'arcane');
    return true;
  },
  fire(c) {
    const { caster, sys } = c;
    const p = c.def.params ?? {};
    const r = c.def.radius ?? 8;
    const list = G.world ? G.world.enemiesInRadius({ x: caster.position.x, z: caster.position.z }, r, caster.position.y) : [];
    const coef = (c.def.damage?.coef ?? 3.6) * crowdFactor(Math.min(list.length, 8));
    sys.ring(caster.position.x, caster.position.z, r, ARCANE_VIOLET);
    sys.vfx('shockwave', [caster.position.x, 0.1, caster.position.z], { scale: r / 3, color: ARCANE_VIOLET });
    if (c.remote) return;
    const res = [];
    for (const e of list) {
      const hit = sys.strike(c, e, { coef, dir: norm(e.position.x - caster.position.x, e.position.z - caster.position.z) });
      if (hit) res.push(hit);
    }
    sys.afterHits(c, res);
    if (res.length) sys.addPip(caster, 'arcane', clamp(res.length * (p.pipPerEnemy ?? 1), 0, p.pipMax ?? 4));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Ejderha Nefesi (cone), Canlı Bomba (fuse), Büyü Çağırma (mana channel)
// ---------------------------------------------------------------------------------------------------------------

/** Ejderha Nefesi: every enemy inside the caster's cone (params.cone degrees, full angle) within def.radius takes the hit. */
const dragonsBreath: Behavior = {
  fire(c) {
    const { caster, sys } = c;
    const p = c.def.params ?? {};
    const cosHalf = Math.cos(((p.cone ?? 60) / 2) * Math.PI / 180);
    const reach = c.def.radius ?? 8;
    const [fx, fz] = c.dir;
    sys.vfx('fire_burst', [caster.position.x + fx * 2, caster.position.y + 1, caster.position.z + fz * 2], { scale: 1.2 });
    if (c.remote) return;
    const list = G.world ? G.world.enemiesInRadius({ x: caster.position.x, z: caster.position.z }, reach, caster.position.y) : [];
    const res = [];
    for (const e of list) {
      const dx = e.position.x - caster.position.x;
      const dz = e.position.z - caster.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4 || (dx * fx + dz * fz) / d < cosHalf) continue;
      const hit = sys.strike(c, e, { dir: norm(dx, dz) });
      if (hit) res.push(hit);
    }
    sys.afterHits(c, res);
    sys.shake(0.06);
  },
};

/**
 * Canlı Bomba: a bolt at the target (the row's coefficient and burn). The bomb keeps the target's last point and explodes there
 * when params.fuse (12 s) ends or the target dies: params.explodeCoef on every enemy within params.explodeR. One bomb per cast.
 */
const livingBomb: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'fire');
    return true;
  },
  fire(c) {
    const { sys } = c;
    const p = c.def.params ?? {};
    if (!primaryTarget(c)) {
      sys.whiff(c);
      return;
    }
    spawnBolt(c, boltDir(c), (e) => {
      if (c.remote) return;
      const hit = sys.strike(c, e, {});
      if (hit) sys.afterHits(c, [hit]);
      const until = (G.world?.time ?? 0) + (p.fuse ?? 12);
      let lx = e.position.x;
      let lz = e.position.z;
      sys.addTask(() => {
        if (!e.isDead) {
          lx = e.position.x;
          lz = e.position.z;
        }
        if (!e.isDead && (G.world?.time ?? 0) < until) return false;
        sys.vfx('fire_burst', [lx, 0.6, lz], { scale: 1.4 });
        const res = [];
        for (const x of enemiesAt(lx, lz, p.explodeR ?? 3)) {
          const h = sys.strike(c, x, { coef: p.explodeCoef ?? 1.2, dir: norm(x.position.x - lx, x.position.z - lz) });
          if (h) res.push(h);
        }
        sys.afterHits(c, res);
        return true;
      });
    }, c.def.speed ?? 26, c.def.range ?? 30);
  },
};

/** Büyü Çağırma: a channel (def.channel 6 s); each tick (params.tick = 1 s) restores params.manaPct of max mana. */
const evocation: Behavior = {
  begin(c) {
    castHands(c.sys, c.caster, 'arcane');
    return true;
  },
  fire(c) {
    c.caster.statuses.apply('evocation', c.def.channel ?? 6, { sourceId: c.caster.id });
  },
  tick(c) {
    if (!c.remote) c.sys.addResource(c.caster, c.caster.maxResource * (c.def.params?.manaPct ?? 0.16));
    return true;
  },
  end(c) {
    c.caster.statuses.remove('evocation');
  },
};

export const BEHAVIORS_KIT_MAGE: Record<string, Behavior> = {
  homing_missiles: homingMissiles,
  arcane_blast: arcaneBlast,
  fire_cast: schoolCast('fire'),
  frost_cast: schoolCast('frost'),
  fire_blast: fireBlast,
  flamestrike,
  ice_lance: iceLance,
  flurry,
  ray_of_frost: rayOfFrost,
  comet_storm: cometStorm,
  glacial_spike: glacialSpike,
  ward_barrier: wardBarrier,
  arcane_pulse: arcanePulse,
  living_bomb: livingBomb,
  dragons_breath: dragonsBreath,
  evocation,
};

function installKitMage(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_MAGE);
}

try {
  installKitMage();
} catch {
  queueMicrotask(installKitMage);
}
