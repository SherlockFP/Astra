/**
 * KIT PK-WARLOCK (docs/kits/casters-rogue.md §10, §11, §g E7 / E11). Warlock kit behaviours, installed into BEHAVIORS by the import
 * at the end of behaviors.ts (microtask fallback, as in rogueKit.ts):
 *   kit_target_spell   single-target instant spell: strikes the soft target (Azap, Yozlaşma, Yakıp Yıkma, Alevlendirme)
 *   kit_darkglare      E7 Karanlık Göz: pulses on every enemy carrying one of your DoTs (a pulse every `interval` s, `pulses` times)
 *   kit_infernal       E7 Cehennem Muhafızı: landing strike + stun, `pulses` fire pulses in r 6, +1 fragment per second
 *   kit_dot_pulse      Kötülük: one pulse of 0.5 per own DoT (max 3) on every enemy carrying one
 *   kit_dark_pact      Karanlık Pakt: sacrifice 20 % of current HP, absorb 2 x the sacrifice for 20 s
 *   kit_seed           Yozlaşma Tohumu: detonates after 12 s in r 10, crowd-scaled, applies Yozlaşma (4 x damage trigger not wired)
 *   kit_shadowburn     Gölge Yakma: instant, +10 fragments on a kill (charge refund not wired)
 *   kit_rain_of_fire   Ateş Yağmuru: 8 ticks over 8 s in r 6, crowd-scaled
 */
import { BEHAVIORS, crowdFactor, groundAt, type Behavior, type CastCtx } from './behaviors';
import { addAbsorb, healAmount } from '../healing';
import { minionDef } from '../../data/minions';
import { G } from '../../game/G';
import type { Enemy } from '../../entities/Enemy';
import type { StatusId } from '../../types/skills';

export const BEHAVIORS_KIT_WARLOCK: Record<string, Behavior> = {};

/** The warlock's own DoT statuses (Kötülük counts these on each enemy). */
const OWN_DOTS: StatusId[] = ['agony', 'corruption', 'unstable_affliction', 'immolate', 'burn'];

function dotCount(e: Enemy): number {
  let n = 0;
  for (const s of OWN_DOTS) if (e.statuses.has(s)) n++;
  return n;
}

/**
 * Soft target of a `custom` spell (SkillSystem picks targets only for melee / dash / shadow step): the hard target of the aim when it
 * is an enemy in range, else the nearest enemy within 60 deg of the aim. Null when nothing qualifies.
 */
function resolveTarget(c: CastCtx): Enemy | null {
  if (c.target && !c.target.isDead && c.target.kind === 'enemy') return c.target as Enemy;
  const w = G.world;
  if (!w) return null;
  const range = (c.def.range ?? 30) + 0.5;
  const me = c.caster.position;
  const dist = (e: { position: { x: number; z: number }; radius: number }) =>
    Math.hypot(e.position.x - me.x, e.position.z - me.z) - e.radius;
  const hardId = c.aim.targetId;
  if (hardId !== null && hardId !== undefined) {
    const t = w.getActor(hardId);
    if (t && !t.isDead && t.team === 'enemy' && dist(t) <= range) return t as Enemy;
  }
  let best: Enemy | null = null;
  let bestD = Infinity;
  const cosHalf = Math.cos((60 * Math.PI) / 180);
  for (const e of w.enemies) {
    if (e.isDead) continue;
    const d = dist(e);
    if (d > range) continue;
    const dx = e.position.x - me.x, dz = e.position.z - me.z;
    const l = Math.hypot(dx, dz);
    const cos = l > 0.01 ? (dx * c.dir[0] + dz * c.dir[1]) / l : 1;
    if (cos < cosHalf && d > 0.6) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Begin step shared by the single-target spells: resolves the soft target or aborts (no cost, no cooldown). */
function needTarget(c: CastCtx): boolean {
  if (c.remote) return true;
  const t = resolveTarget(c);
  if (!t) { c.sys.fail('target'); return false; }
  c.target = t;
  return true;
}

/** Single-target instant spell: strikes the resolved target (the def's coefficient and statuses apply). */
const targetSpell: Behavior = {
  begin(c) {
    return needTarget(c);
  },
  fire(c) {
    if (c.remote) return;
    const t = c.target as Enemy | null;
    if (!t || t.isDead) { c.sys.whiff(c); return; }
    c.sys.strike(c, t, {});
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
  },
};

/** Karanlık Göz (E7): the eye sits beside the target; every `interval` s it strikes each enemy carrying one of your DoTs. */
const darkglare: Behavior = {
  begin(c) {
    return needTarget(c);
  },
  fire(c) {
    if (c.remote) return;
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
    const t = c.target;
    if (!t) return;
    const p = c.def.params ?? {};
    const pulses = p.pulses ?? 10, interval = p.interval ?? 2, radius = p.radius ?? 40;
    c.sys.vfx('darkglare_eye', [t.position.x, t.position.y + 2.5, t.position.z], { scale: 1 });
    for (let n = 1; n <= pulses; n++) {
      c.sys.schedule(n * interval, () => {
        const me = c.caster.position;
        for (const e of c.sys.enemiesNear(me.x, me.z, radius)) {
          if (e.isDead || dotCount(e) === 0) continue;
          c.sys.strike(c, e, { noGain: true, statuses: [] });
        }
      });
    }
  },
};

/** Cehennem Muhafızı (E7): landing strike and stun in r 4, then `pulses` fire pulses in r 6 at the same point; +1 fragment per second. */
const infernal: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const x = c.point[0], z = c.point[1];
    const y = groundAt(x, z) ?? c.caster.position.y;
    c.sys.vfx('infernal_fall', [x, y, z], { scale: 1 });
    for (const e of c.sys.enemiesNear(x, z, p.landRadius ?? 4, y)) {
      if (e.isDead) continue;
      c.sys.strike(c, e, { coef: p.landCoef ?? 2.0, noGain: true, statuses: [] });
      c.sys.statusOnly(c, e, [{ status: 'stun', duration: p.stun ?? 2 }]);
    }
    const pulses = p.pulses ?? 30, interval = p.interval ?? 1, radius = p.radius ?? 6;
    for (let n = 1; n <= pulses; n++) {
      c.sys.schedule(n * interval, () => {
        for (const e of c.sys.enemiesNear(x, z, radius, y)) {
          if (e.isDead) continue;
          c.sys.strike(c, e, { coef: p.coef ?? 0.2, noGain: true, statuses: [] });
        }
      });
      c.sys.schedule(n * interval, () => c.sys.addPip(c.caster, 'shard', p.frag ?? 1));
    }
  },
};

/** Kötülük (m45): one pulse on every enemy near the caster, 0.5 per own DoT (at most 3 counted). */
const dotPulse: Behavior = {
  fire(c) {
    if (c.remote) return;
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
    const p = c.def.params ?? {};
    const per = p.perDot ?? 0.5, cap = p.capDots ?? 3, radius = p.radius ?? 30;
    const me = c.caster.position;
    for (const e of c.sys.enemiesNear(me.x, me.z, radius)) {
      if (e.isDead) continue;
      const n = Math.min(cap, dotCount(e));
      if (n <= 0) continue;
      c.sys.strike(c, e, { coef: per * n, noGain: true, statuses: [] });
    }
  },
};

/** Karanlık Pakt (§9 s3): sacrifice a share of current HP (never lethal), absorb twice the sacrifice for 20 s. */
const darkPact: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const before = c.caster.hp;
    c.sys.sacrificeHp(c, p.sacrificePct ?? 0.2);
    const lost = Math.max(0, before - c.caster.hp);
    if (lost <= 0) return;
    addAbsorb(c.caster, lost * (p.absorbMult ?? 2), c.caster.maxHp, p.dur ?? 20, 'dark_pact', c.caster.id);
  },
};

/** Yozlaşma Tohumu (§10a): planted on the target (or the aim point); detonates after `fuse` s in r `radius`. */
const seed: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const t = resolveTarget(c);
    let x = t ? t.position.x : c.point[0];
    let z = t ? t.position.z : c.point[1];
    const coef = p.coef ?? 4.6, radius = p.radius ?? 10;
    c.sys.schedule(p.fuse ?? 12, () => {
      if (t && !t.isDead) { x = t.position.x; z = t.position.z; }
      const y = groundAt(x, z) ?? c.caster.position.y;
      const list = c.sys.enemiesNear(x, z, radius, y);
      const k = crowdFactor(list.length);
      c.sys.vfx('curse_ring', [x, y, z], { scale: 1 });
      for (const e of list) {
        if (e.isDead) continue;
        c.sys.strike(c, e, { coef: coef * k, noGain: true, statuses: [{ status: 'corruption', duration: 14, stacks: 1, magnitude: 0.35 }] });
      }
    });
  },
};

/** Gölge Yakma (§11a): instant; a kill refunds 10 fragments. */
const shadowburn: Behavior = {
  begin(c) {
    return needTarget(c);
  },
  fire(c) {
    if (c.remote) return;
    const t = c.target as Enemy | null;
    if (!t || t.isDead) { c.sys.whiff(c); return; }
    const r = c.sys.strike(c, t, {});
    if (r?.killed) c.sys.addPip(c.caster, 'shard', c.def.params?.killShards ?? 10);
  },
};

/** Ateş Yağmuru (§11a s1): `ticks` ticks over `ticks` s on the ground point, crowd-scaled per tick. */
const rainOfFire: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const x = c.point[0], z = c.point[1];
    const radius = p.radius ?? 6, ticks = p.ticks ?? 8, interval = p.interval ?? 1;
    for (let n = 1; n <= ticks; n++) {
      c.sys.schedule(n * interval, () => {
        const list = c.sys.enemiesNear(x, z, radius);
        const k = crowdFactor(list.length);
        for (const e of list) {
          if (e.isDead) continue;
          c.sys.strike(c, e, { coef: 1.0 * k, noGain: true, statuses: [] });
        }
      });
    }
  },
};

/** Implosion (Demonology): every own Wild Imp bursts on the enemies within its radius, then it is gone (no respawn). */
const implosion: Behavior = {
  fire(c) {
    if (c.remote || !G.minions) return;
    const p = c.def.params ?? {};
    for (const m of G.minions.ownedBy(c.caster.id)) {
      if (m.def.id !== 'warlock_wild_imp') continue;
      for (const e of c.sys.enemiesNear(m.position.x, m.position.z, p.radius ?? 4, m.position.y)) {
        if (e.isDead) continue;
        c.sys.strike(c, e, { coef: p.coef ?? 0.6, noGain: true, statuses: [] });
      }
      G.minions.despawn(m, 'owner');
    }
  },
};

/** Demonic Tyrant (Demonology): the tyrant joins the caster for its life, and the caster gains the empower status. */
const tyrant: Behavior = {
  fire(c) {
    if (c.remote) return;
    const row = c.def.minion;
    const def = minionDef('warlock_demonic_tyrant');
    if (def && row && G.minions) G.minions.summon(c.caster, def, { count: row.count, group: row.group, life: row.life });
    c.sys.applySelf(c, c.def.selfStatuses ?? []);
  },
};

/** Malefic Rapture (Affliction): spends every fragment (at least one shard); each enemy with one of your DoTs takes per-shard damage. */
const malefic: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (c.sys.pipCount(c.caster, 'shard') < 10) { c.sys.fail('resource'); return false; }
    const me = c.caster.position;
    const p = c.def.params ?? {};
    if (!c.sys.enemiesNear(me.x, me.z, p.radius ?? 12).some((e) => !e.isDead && dotCount(e) > 0)) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const shards = Math.floor(c.sys.consumePips(c.caster, 'shard') / 10);
    if (shards <= 0) return;
    const me = c.caster.position;
    const p = c.def.params ?? {};
    for (const e of c.sys.enemiesNear(me.x, me.z, p.radius ?? 12)) {
      if (e.isDead || dotCount(e) === 0) continue;
      c.sys.strike(c, e, { coef: (p.perShard ?? 0.5) * shards, noGain: true, statuses: [] });
    }
  },
};

/** Cataclysm (Destruction): one strike on every enemy in the ground radius; the def's statuses (Yakıp Yıkma) apply to each. */
const cataclysm: Behavior = {
  fire(c) {
    if (c.remote) return;
    const x = c.point[0], z = c.point[1];
    const y = groundAt(x, z) ?? c.caster.position.y;
    c.sys.vfx('fire_rain', [x, y, z], { scale: 1 });
    for (const e of c.sys.enemiesNear(x, z, c.def.params?.radius ?? 8, y)) {
      if (!e.isDead) c.sys.strike(c, e, {});
    }
  },
};

/** Shadowfury: a shadow burst in the ground radius that stuns every enemy in it. */
const shadowfury: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const x = c.point[0], z = c.point[1];
    const y = groundAt(x, z) ?? c.caster.position.y;
    for (const e of c.sys.enemiesNear(x, z, p.radius ?? 8, y)) {
      if (e.isDead) continue;
      c.sys.strike(c, e, {});
      c.sys.statusOnly(c, e, [{ status: 'stun', duration: p.stun ?? 3 }]);
    }
  },
};

/** Mortal Coil: a strike and a fear on the soft target, and the caster heals a share of max HP. */
const mortalCoil: Behavior = {
  begin(c) {
    return needTarget(c);
  },
  fire(c) {
    if (c.remote) return;
    const t = c.target as Enemy | null;
    if (!t || t.isDead) { c.sys.whiff(c); return; }
    const p = c.def.params ?? {};
    c.sys.strike(c, t, {});
    c.sys.statusOnly(c, t, [{ status: 'fear', duration: p.fear ?? 4 }]);
    healAmount(c.caster, c.caster, c.caster.maxHp * (p.healPct ?? 0.2));
  },
};

/** Healthstone: heals the caster for a share of max HP (charges and cooldown come from the def). */
const healthstone: Behavior = {
  fire(c) {
    if (c.remote) return;
    healAmount(c.caster, c.caster, c.caster.maxHp * (c.def.params?.healPct ?? 0.3));
  },
};

BEHAVIORS_KIT_WARLOCK.kit_target_spell = targetSpell;
BEHAVIORS_KIT_WARLOCK.kit_implosion = implosion;
BEHAVIORS_KIT_WARLOCK.kit_tyrant = tyrant;
BEHAVIORS_KIT_WARLOCK.kit_malefic = malefic;
BEHAVIORS_KIT_WARLOCK.kit_cataclysm = cataclysm;
BEHAVIORS_KIT_WARLOCK.kit_shadowfury = shadowfury;
BEHAVIORS_KIT_WARLOCK.kit_mortal_coil = mortalCoil;
BEHAVIORS_KIT_WARLOCK.kit_healthstone = healthstone;
BEHAVIORS_KIT_WARLOCK.kit_darkglare = darkglare;
BEHAVIORS_KIT_WARLOCK.kit_infernal = infernal;
BEHAVIORS_KIT_WARLOCK.kit_dot_pulse = dotPulse;
BEHAVIORS_KIT_WARLOCK.kit_dark_pact = darkPact;
BEHAVIORS_KIT_WARLOCK.kit_seed = seed;
BEHAVIORS_KIT_WARLOCK.kit_shadowburn = shadowburn;
BEHAVIORS_KIT_WARLOCK.kit_rain_of_fire = rainOfFire;

function installKitWarlock(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_WARLOCK);
}

try {
  installKitWarlock();
} catch {
  queueMicrotask(installKitWarlock);
}
