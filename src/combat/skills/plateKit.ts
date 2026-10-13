/**
 * KIT PLATE · PM-00b (docs/kits/plate-melee.md §g needs 1-8, 11, 12). Plate-melee engine behaviours, installed into BEHAVIORS by
 * the import at the end of behaviors.ts (microtask fallback, as in rogueKit.ts):
 *   multi_strike     N hits on one target, `gap` s apart, own crit each, hit-stop only on the last; optional cleave (`cleave` extra targets)
 *   grip             Ölüm Kancası: non-boss pulled to `pullTo` m (3), bosses only taunted; a taunt on every target
 *   divine_toll      İlahi Çınlama: `pulses` Holy Shocks (heal the most injured ally in range, else strike the nearest enemy); one
 *                    infusion_of_light roll per cast
 *   shield_block     Kalkan Kaldır: applies shield_block (frontal block 100 %), stores `store` x the blocked damage, and releases it as a
 *                    flat shockwave (4 m / 90 deg) when the status ends or is recast (cap `storeCap` x 300)
 *   heal_self_recent Ölüm Darbesi: heals `healPctOfRecent` of the damage taken in the last `window` s, at least `minHealPct` max HP
 * Also registers the Death Knight rune pip (`TALENT_PIPS.rune`, max 6, +1 per 10 s regen; SkillSystem.regenPips).
 */
import { G } from '../../game/G';
import { BEHAVIORS, type Behavior, type CastCtx } from './behaviors';
import { HEAL_RANGE, alliesInRange, healAlly, healAmount } from '../healing';
import { TALENT_PIPS } from '../../data/specs_talents';
import type { PipDef } from '../../types/classes';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { Actor } from '../../entities/Actor';
import type { EntityId } from '../../types/common';
import type { DamageResult } from '../Combat';

export const BEHAVIORS_KIT_PLATE: Record<string, Behavior> = {};

// ---- rune pip (§g need 1): PipDef.regen, registered here because TALENT_PIPS is a shared table (`Object.assign` as statuses.ts does)
const RUNE_PIP: PipDef = { id: 'rune', name: 'Rün', max: 6, color: '#7fd6e0', icon: 'buff-mana-regen', regen: { every: 10, parallel: true } };
if (!TALENT_PIPS.rune) Object.assign(TALENT_PIPS, { rune: RUNE_PIP });

/** Target of a cast without a usable soft target: the hard aim target when it is an enemy in range, else the nearest enemy in the cone. */
function enemyFor(c: CastCtx, range: number, arc: number): Enemy | null {
  if (c.target && !c.target.isDead && c.target.kind === 'enemy') return c.target as Enemy;
  const w = G.world;
  if (!w) return null;
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of c.sys.enemiesInCone(c.caster, c.dir, range, arc)) {
    const d = Math.hypot(e.position.x - c.caster.position.x, e.position.z - c.caster.position.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

const dist = (a: Actor, b: Actor): number => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

// ---- multi_strike (§g need 5) ----------------------------------------------------------------------------------------------

const multiStrike: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const hits = Math.max(1, Math.round(p.hits ?? 4));
    const gap = p.gap ?? 0.17;
    const cleave = Math.max(0, Math.round(p.cleave ?? 0));
    const range = c.def.range ?? 3;
    const arc = c.def.arc ?? 120;
    const t = enemyFor(c, range, arc);
    if (!t) return;
    const results: DamageResult[] = [];
    const strikeAt = (i: number): void => {
      if (t.isDead || t.removed) return;
      const last = i === hits - 1;
      const r = c.sys.strike(c, t, { noHitstop: !last, weight: last ? 'heavy' : 'light' });
      if (r) results.push(r);
      if (last && cleave > 0) {
        // the optional cleave: the nearest other enemies around the target take 60 % of the hit, once, on the last strike
        for (const x of c.sys.enemiesNear(t.position.x, t.position.z, 3, t.position.y).filter((e) => e !== t && !e.isDead).slice(0, cleave)) {
          const rr = c.sys.strike(c, x, { noHitstop: true, weight: 'light', more: 0.6 });
          if (rr) results.push(rr);
        }
      }
      if (last) c.sys.afterHits(c, results);
    };
    for (let i = 0; i < hits; i++) {
      if (i === 0) strikeAt(0);
      else c.sys.schedule(i * gap, () => strikeAt(i));
    }
  },
};

// ---- grip (§g need 8): Ölüm Kancası -------------------------------------------------------------------------------------

const grip: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const t = enemyFor(c, c.def.range ?? 25, 60);
    if (!t) return;
    const boss = t.isBoss || t.def.rank === 'boss' || t.def.rank === 'miniboss';
    if (boss) {
      c.sys.statusOnly(c, t, [{ status: 'taunt', duration: p.bossTaunt ?? 2 }]);
      return;
    }
    c.sys.statusOnly(c, t, [{ status: 'taunt', duration: p.taunt ?? 3 }]);
    const d = dist(c.caster, t);
    const to = p.pullTo ?? 3;
    if (d > to) {
      const dx = (c.caster.position.x - t.position.x) / d, dz = (c.caster.position.z - t.position.z) / d;
      G.combat?.pullEnemy(t, [dx, dz], d - to);
    }
  },
};

// ---- divine_toll (§g need 8): İlahi Çınlama -----------------------------------------------------------------------------

const divineToll: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const pulses = Math.max(1, Math.round(p.pulses ?? 5));
    const interval = p.interval ?? 0.12;
    const healCoef = p.healCoef ?? 1.43;
    const enemyCoef = p.enemyCoef ?? 2;
    const caster = c.caster as Player;
    let infused = false;
    for (let i = 0; i < pulses; i++) {
      c.sys.schedule(i * interval, () => {
        if (caster.isDead) return;
        let ally: Player | null = null;
        let best = 1;
        for (const a of alliesInRange(caster, HEAL_RANGE)) {
          if (a.isDead || a.hp >= a.maxHp) continue;
          const f = a.hp / Math.max(1, a.maxHp);
          if (f < best) { best = f; ally = a; }
        }
        if (ally) {
          healAlly(caster, ally, healCoef);
        } else {
          let near: Enemy | null = null;
          let nd = Infinity;
          for (const e of c.sys.enemiesNear(caster.position.x, caster.position.z, HEAL_RANGE, caster.position.y)) {
            const d = dist(caster, e);
            if (d < nd) { nd = d; near = e; }
          }
          if (near) c.sys.strike(c, near, { coef: enemyCoef, noGain: true, statuses: [] });
        }
        // one infusion_of_light roll per cast (15 % per pulse, plate-melee §4b)
        if (!infused && Math.random() < 0.15) {
          infused = true;
          c.sys.applySelf(c, [{ status: 'infusion_of_light', duration: 15 }]);
        }
      });
    }
  },
};

// ---- shield_block (§g need 12): Kalkan Kaldır ----------------------------------------------------------------------------

/** Per-player store of the active Kalkan Kaldır: the cast that started it (for its params and strike context) and the stored damage. */
interface ShieldStore { ctx: CastCtx; stored: number }
const shieldStores = new Map<EntityId, ShieldStore>();

/** SkillSystem.onBlocked: a frontal block while shield_block is up adds `store` x the blocked damage. */
export function shieldStoreAdd(p: Actor, blocked: number): void {
  const s = shieldStores.get(p.id);
  if (!s || !(blocked > 0)) return;
  s.stored += blocked * (s.ctx.def.params?.store ?? 0.15);
}

/**
 * Releases the stored damage of a Kalkan Kaldır (status end or recast): a 4 m / 90 deg shockwave of flat heavy damage, knockback 3,
 * capped at `storeCap` x 300. Clears the store whether or not anything was stored.
 */
export function shieldStoreRelease(owner: Actor): void {
  const s = shieldStores.get(owner.id);
  if (!s) return;
  shieldStores.delete(owner.id);
  const c = s.ctx;
  const { sys, def } = c;
  const cap = (def.params?.storeCap ?? 10) * 300;
  const flat = Math.min(s.stored, cap);
  sys.vfx('shockwave', [owner.position.x + c.dir[0] * 1.5, 0.1, owner.position.z + c.dir[1] * 1.5], { scale: 1.6, dir: [c.dir[0], 0, c.dir[1]] });
  sys.shake(0.38);
  sys.hitstopMs(70);
  sys.sfx('shield_bash', owner.position);
  if (flat <= 0 || c.remote || owner.isDead) return;
  for (const e of sys.enemiesInCone(owner, c.dir, 4, 90)) {
    sys.strike(c, e, { coef: 0, flat, weight: 'heavy', knockback: 3, noGain: true, statuses: [], dir: sys.dirTo(owner, e) });
  }
}

const shieldBlock: Behavior = {
  fire(c) {
    if (c.remote) return;
    const { caster, sys, def } = c;
    // recast: the previous block releases first (its store is spent here, the new one starts empty)
    shieldStoreRelease(caster);
    shieldStores.set(caster.id, { ctx: c, stored: 0 });
    sys.applySelf(c, [{ status: 'shield_block', duration: def.params?.dur ?? 6 }]);
    sys.vfx('shield_bubble', [caster.position.x + c.dir[0] * 0.9, caster.position.y + 1.2, caster.position.z + c.dir[1] * 0.9], { follow: caster.object3d, duration: def.params?.dur ?? 6, scale: 1.1 });
    sys.sfx('buff', caster.position);
  },
};

// ---- heal_self_recent (§g need 3): Ölüm Darbesi -------------------------------------------------------------------------

const healSelfRecent: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const caster = c.caster as Player;
    const recent = G.combat?.damageTakenWithin(caster, p.window ?? 5) ?? 0;
    const amount = Math.max(recent * (p.healPctOfRecent ?? 0.2), (p.minHealPct ?? 0.07) * caster.maxHp);
    healAmount(caster, caster, amount);
  },
};

Object.assign(BEHAVIORS_KIT_PLATE, {
  multi_strike: multiStrike,
  grip,
  divine_toll: divineToll,
  shield_block: shieldBlock,
  heal_self_recent: healSelfRecent,
});

function installKitPlate(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_KIT_PLATE);
}

try {
  installKitPlate();
} catch {
  queueMicrotask(installKitPlate);
}
