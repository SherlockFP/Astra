/**
 * KIT PK-MAGE (docs/kits/casters-rogue.md §2e, Arkan Füzeler). Behaviours of the mage kit: `homing_missiles` (the channel:
 * five curved missiles every 0.4 s, alternating hands, each steered to the live target by Projectile.curve) and `arcane_blast`
 * (Arkan Patlama: cast hands + charge orbs, then the normal projectile). Also the charge-orb sync (one `arcane_charge_orb`
 * loop per arcane charge, removed on spend). Installed into BEHAVIORS as a side effect of the import at the end of
 * behaviors.ts; the module cycle can leave BEHAVIORS in its temporal dead zone, so installation falls back to a microtask
 * (the same pattern as utilities.ts). OWNER: combat (kit).
 *
 * Not done here (see the PK-MAGE report): the first-frame outward burst of a missile (aim ±35°, +25° pitch for 0.12 s) and the
 * haste scaling of the wave spacing (the channel tick is the engine's fixed `params.tick`).
 */
import { G } from '../../game/G';
import { cosmeticRng } from '../../core/utils';
import { Projectile } from '../../entities/Projectile';
import { BEHAVIORS, TARGETING_BEHAVIORS, type Behavior, type CastCtx } from './behaviors';
import type { SkillSystem } from '../SkillSystem';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { VfxHandle } from '../../vfx/VFX';

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

const rotDir = (d: [number, number], deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [d[0] * c - d[1] * s, d[0] * s + d[1] * c];
};

// ---------------------------------------------------------------------------------------------------------------
// charge orbs (CW-15 `arcane_charge_orb`) and cast hands (CW-15 `cast_hands_arcane`)
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

function castHandsArcane(sys: SkillSystem, caster: Actor): void {
  sys.vfx('cast_hands_arcane', [caster.position.x, caster.position.y + 1.1, caster.position.z], { follow: caster.object3d });
}

// ---------------------------------------------------------------------------------------------------------------
// Arkan Füzeler (homing_missiles)
// ---------------------------------------------------------------------------------------------------------------

/**
 * The enemy a wave goes for. One enemy: the cast's target. Three or more within 10 m of it: the i-th nearest (cycling), so the
 * five missiles fan out. Null without a live enemy target (the missiles then fly straight along the aim).
 */
function pickTarget(c: CastCtx, i: number): Enemy | null {
  const w = G.world;
  const t = c.target;
  if (!w || !t || t.isDead) return null;
  const primary = w.enemies.find((e) => e.id === t.id);
  if (!primary || primary.isDead) return null;
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
    castHandsArcane(c.sys, c.caster);
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
// Arkan Patlama (arcane_blast): cast hands and charge orbs at cast start, then the normal projectile
// ---------------------------------------------------------------------------------------------------------------

const arcaneBlast: Behavior = {
  begin(c) {
    ensureChargeOrbs(c.sys, c.caster);
    castHandsArcane(c.sys, c.caster);
    return true;
  },
  fire(c) {
    TARGETING_BEHAVIORS.projectile.fire(c);
  },
};

export const BEHAVIORS_KIT_MAGE: Record<string, Behavior> = {
  homing_missiles: homingMissiles,
  arcane_blast: arcaneBlast,
};

function installKitMage(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_MAGE);
}

try {
  installKitMage();
} catch {
  queueMicrotask(installKitMage);
}
