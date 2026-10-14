/**
 * Okçu behaviours (GDD_CLASSES_V2 §3.4–§3.5, Midnight-aligned archer kit). BEHAVIORS_ARCHER is installed into BEHAVIORS by the import
 * at the end of this file (microtask fallback, as in plateKit.ts); behaviors.ts is not touched. OWNER: archer package.
 *
 * behaviour id           what it does (SkillDef.params unless noted)                              used by
 * ---------------------  -------------------------------------------------------------------  -----------------------------------
 * archer_charge_shot     channel: holds the draw; the arrow leaves on release (end). Coefficient  archer_aimed_shot
 *                        from the hold (coefMin..coefMax at chargeMax). deadeye stack or the
 *                        quick_draw status (Geri Sıçrayış) = full draw.
 * archer_channel_shoot   one arrow per channel tick (Seri Ateş: tick 0.157 s, 14 arrows)           archer_rapid_fire
 * archer_kill_shot       begin(): x executeCoef / baseCoef (3.0) when the target is under 25 % HP  archer_kill_shot
 * archer_pet_strike      the pet (group 'pet') leaps to a ring round the target and bites once     archer_kill_command
 *                        (coef petCoef, bleed); no pet = "Yoldaş yok", no cost
 * archer_call_pet        no pet: summon (minion_summon row). Pet below mendBelow: heals mend x max  archer_call_pet
 *                        HP over mendSec (a task). Healthy pet: dismissed.
 * archer_trap            ground trap: arms after trapArm s, lives trapLife s, at most trapMax per   archer_snare_trap
 *                        caster; triggers on the first enemies in the radius (strikes with the
 *                        skill's statuses: root and bleed)
 * archer_disengage       backward dash (the stock dash path, facing flipped; no path strikes),      archer_disengage
 *                        origin ring (slow + knockback), selfStatuses applied here, landing arrow
 *                        on the nearest enemy within landRange when the dash ends
 * archer_hunters_mark    applies hunters_mark to the soft target (markSec)                          archer_hunters_mark
 * archer_bestial_wrath   selfStatuses on the caster, wild_wrath on every pet / pack minion           archer_bm_bestial_wrath
 *
 * Remote replays (c.remote) draw visuals only; owner-only effects (damage, minions, statuses) are skipped there.
 */
import { G } from '../../game/G';
import { clamp } from '../../core/utils';
import { sp } from '../specials';
import { BEHAVIORS, TARGETING_BEHAVIORS, castTarget, enemiesIn, groundAt, norm, strikeMany, type Behavior, type CastCtx } from './behaviors';
import type { Enemy } from '../../entities/Enemy';
import type { Minion } from '../../entities/Minion';
import type { MinionAttack } from '../../types/minions';
import type { EntityId } from '../../types/common';

export const BEHAVIORS_ARCHER: Record<string, Behavior> = {};

/** The caster's living enemy target (soft / hard target, or the aim's target), null when none. */
function enemyOf(c: CastCtx): Enemy | null {
  const t = castTarget(c);
  return t && t.team === 'enemy' && !t.isDead && !t.removed ? (t as Enemy) : null;
}

/** The caster's living minions of one group (`pet` or `pack`). */
function minionsOf(c: CastCtx, group: string): Minion[] {
  return G.minions?.ownedBy(c.caster.id, (m) => m.def.group === group) ?? [];
}

// ---------------------------------------------------------------------------------------------------------
// Nişanlı Atış: hold to draw (channel), release fires the arrow
// ---------------------------------------------------------------------------------------------------------

const chargeShot: Behavior = {
  fire(c) {
    // the channel starts at the hit frame; the arrow itself waits for the release (end)
    if (c.remote) return;
    const p = c.caster;
    c.data.armed = true;
    // Keskin Nişan: one stack = one instant full draw (the stack is spent on the cast)
    if (p.statuses.has('deadeye')) { p.statuses.consumeStack('deadeye'); c.data.full = true; }
    // Geri Sıçrayış window: the next draw is full
    else if (p.statuses.has('quick_draw')) { p.statuses.remove('quick_draw'); c.data.full = true; }
  },
  frame(c, _dt, elapsed) {
    if (!c.data.armed) return;
    if (c.data.t0 === undefined) c.data.t0 = elapsed;
    // trait_marksman (Keskin Nişancı): chargeSpeed 0.30 draws 30 % faster
    c.data.held = (elapsed - (c.data.t0 as number)) * (1 + (sp('trait_marksman')?.chargeSpeed ?? 0));
  },
  end(c, reason) {
    // a cancelled or interrupted draw (dodge, stun) fires nothing
    if (c.remote || !c.data.armed || reason !== 'done') return;
    const pr = c.def.params ?? {};
    const base = c.def.damage?.coef ?? 2.2;
    const full = c.data.full ? 1 : clamp(((c.data.held as number) ?? 0) / (pr.chargeMax ?? 1), 0, 1);
    const lo = pr.coefMin ?? base;
    const hi = pr.coefMax ?? 4;
    // the stock projectile reads the cast's damage multiplier (c.more): scale the minimum coefficient up to the drawn one
    c.more *= (lo + (hi - lo) * full) / base;
    TARGETING_BEHAVIORS.projectile.fire(c);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Seri Ateş: one arrow per channel tick
// ---------------------------------------------------------------------------------------------------------

const channelShoot: Behavior = {
  fire() {
    // the channel's arrows come from tick(); nothing at the start
  },
  tick(c) {
    TARGETING_BEHAVIORS.projectile.fire(c);
    return true;
  },
};

// ---------------------------------------------------------------------------------------------------------
// Son Atış: execute coefficient under 25 % HP
// ---------------------------------------------------------------------------------------------------------

const killShot: Behavior = {
  begin(c) {
    const pr = c.def.params ?? {};
    const t = castTarget(c);
    if (t && t.maxHp > 0 && t.hp / t.maxHp < (pr.executeBelow ?? 0.25)) c.more *= (pr.executeCoef ?? 6) / (pr.baseCoef ?? 2);
    return true;
  },
  fire(c) {
    TARGETING_BEHAVIORS.projectile.fire(c);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Av Emri: the pet strikes the target
// ---------------------------------------------------------------------------------------------------------

const petStrike: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (minionsOf(c, 'pet').length === 0) {
      G.events?.emit('ui:toast', { text: 'Yoldaş yok', kind: 'warning' });
      return false;
    }
    if (!enemyOf(c)) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const pr = c.def.params ?? {};
    const t = enemyOf(c);
    const pet = minionsOf(c, 'pet')[0];
    if (!t || !pet) return;
    // the pet leaps to a ring 1.5 m round the target (the minion_command move), then bites once
    const ang = Math.atan2(pet.position.x - t.position.x, pet.position.z - t.position.z);
    pet.position.x = t.position.x + Math.sin(ang) * 1.5;
    pet.position.z = t.position.z + Math.cos(ang) * 1.5;
    pet.yaw = Math.atan2(t.position.x - pet.position.x, t.position.z - pet.position.z);
    const bite = pet.def.attacks[0];
    pet.playShot(bite?.anim, bite?.animSpeed ?? 1);
    const atk: MinionAttack = {
      id: c.def.id, name: c.def.name, kind: 'melee', range: 99, cooldown: 0, hitTime: 0, anim: '',
      coef: pr.petCoef ?? 3.2, type: 'physical', stagger: pr.stagger ?? 15,
      statuses: [{ status: 'bleed', duration: pr.bleedSec ?? 5, magnitude: pr.bleedMag ?? 0.6 }],
    };
    G.minions.strike(pet, atk, t);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Yoldaş Çağır: summon, mend or dismiss
// ---------------------------------------------------------------------------------------------------------

const callPet: Behavior = {
  fire(c) {
    if (c.remote) return;
    const pr = c.def.params ?? {};
    const pet = minionsOf(c, 'pet')[0];
    if (!pet || pet.isDead) {
      BEHAVIORS.minion_summon?.fire(c);
      return;
    }
    if (pet.hp < pet.maxHp * (pr.mendBelow ?? 0.7)) {
      // mend: mend x max HP spread over mendSec seconds (one step per frame)
      const total = pet.maxHp * (pr.mend ?? 0.35);
      const sec = pr.mendSec ?? 3;
      let left = sec;
      c.sys.addTask((dt) => {
        if (pet.isDead || pet.removed) return true;
        const step = Math.min(left, dt);
        left -= step;
        pet.hp = Math.min(pet.maxHp, pet.hp + total * (step / sec));
        return left <= 1e-6;
      });
      return;
    }
    // a healthy pet goes back to the pack
    G.minions.despawn(pet, 'owner');
  },
};

// ---------------------------------------------------------------------------------------------------------
// Pençe Tuzağı: ground trap (arm, trigger, expire)
// ---------------------------------------------------------------------------------------------------------

interface TrapRec { x: number; z: number; age: number; spent: boolean }
/** Live traps by caster id (at most `trapMax` per caster; the oldest is removed first). */
const TRAPS = new Map<EntityId, TrapRec[]>();

const trap: Behavior = {
  fire(c) {
    if (c.remote) return;
    const pr = c.def.params ?? {};
    const list = (TRAPS.get(c.caster.id) ?? []).filter((r) => !r.spent);
    while (list.length >= (pr.trapMax ?? 2)) {
      const old = list.shift();
      if (old) old.spent = true;
    }
    const rec: TrapRec = { x: c.point[0], z: c.point[1], age: 0, spent: false };
    list.push(rec);
    TRAPS.set(c.caster.id, list);
    const armAt = pr.trapArm ?? 0.8;
    const life = pr.trapLife ?? 25;
    const radius = c.def.radius ?? 1.8;
    c.sys.vfx(c.def.vfx?.ground ?? 'trap_ring', [rec.x, 0.05, rec.z], { scale: 0.6 });
    c.sys.addTask((dt) => {
      if (rec.spent) return true;
      rec.age += dt;
      if (rec.age >= life) { rec.spent = true; return true; }
      if (rec.age < armAt) return false;
      const hit = enemiesIn(rec.x, rec.z, radius, groundAt(rec.x, rec.z)).filter((e) => !e.isDead && !e.removed);
      if (hit.length === 0) return false;
      rec.spent = true;
      c.sys.vfx('trap_snap', [rec.x, 0.1, rec.z], { scale: 0.6 });
      // strikes apply the skill's statuses (root 2.5 s, bleed 6 s) to every enemy that stepped in
      strikeMany(c, hit, 8);
      return true;
    });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Geri Sıçrayış: backward dash, origin ring, landing arrow
// ---------------------------------------------------------------------------------------------------------

const disengage: Behavior = {
  begin(c) {
    if (c.remote) return;
    const pr = c.def.params ?? {};
    const p = c.caster;
    // the stock dash plans the path from c.dir: flip the facing and drop the soft target (a backward hop)
    c.dir = [-c.dir[0], -c.dir[1]];
    c.target = null;
    if (TARGETING_BEHAVIORS.dash.begin?.(c) === false) return false;
    // self statuses (iframes, quick_draw) are applied here: SkillSystem only does that for kit behaviours
    for (const s of c.def.selfStatuses ?? []) p.statuses.apply(s.status, s.duration, { magnitude: s.magnitude, stacks: s.stacks, sourceId: p.id });
    // origin ring: enemies next to the take-off spot are slowed and pushed away
    for (const e of enemiesIn(p.position.x, p.position.z, pr.ringRadius ?? 3, p.position.y)) {
      e.statuses.apply('slow', pr.ringSlowSec ?? 2, { magnitude: pr.ringSlow ?? 0.4, sourceId: p.id });
      const [nx, nz] = norm(e.position.x - p.position.x, e.position.z - p.position.z);
      e.applyKnockback(nx, nz, pr.ringKnock ?? 2);
    }
    return true;
  },
  fire() {
    // the hop itself runs from begin(); the path hits of the stock dash are not used (no strikes on the way back)
  },
  end(c, reason) {
    // landing arrow on the nearest enemy within landRange of where the hop ended
    if (c.remote || reason !== 'done') return;
    const w = G.world;
    if (!w) return;
    const pr = c.def.params ?? {};
    const p = c.caster;
    let best: Enemy | null = null;
    let bd = pr.landRange ?? 20;
    for (const e of w.enemies) {
      if (e.isDead || e.removed) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    c.dir = norm(best.position.x - p.position.x, best.position.z - p.position.z);
    TARGETING_BEHAVIORS.projectile.fire(c);
  },
};

// ---------------------------------------------------------------------------------------------------------
// Avcı İşareti: mark the soft target
// ---------------------------------------------------------------------------------------------------------

const huntersMark: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = enemyOf(c);
    if (!t) { c.sys.fail('target'); return false; }
    const dist = Math.hypot(t.position.x - c.caster.position.x, t.position.z - c.caster.position.z);
    if (dist > (c.def.range ?? 32) + 1) { c.sys.fail('range'); return false; }
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const t = enemyOf(c);
    if (!t) return;
    const dur = c.def.params?.markSec ?? 12;
    t.statuses.apply('hunters_mark', dur, { sourceId: c.caster.id });
    G.net?.broadcast('estatus', { targetId: t.id, status: 'hunters_mark', duration: dur, stacks: 1 });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Vahşi Gazap (Av Ustası m45): the caster and the pet / pack get wild_wrath
// ---------------------------------------------------------------------------------------------------------

const bestialWrath: Behavior = {
  fire(c) {
    if (c.remote) return;
    const p = c.caster;
    const self = c.def.selfStatuses ?? [];
    for (const s of self) p.statuses.apply(s.status, s.duration, { magnitude: s.magnitude, stacks: s.stacks, sourceId: p.id });
    const dur = self[0]?.duration ?? 10;
    for (const m of G.minions?.ownedBy(p.id, (x) => x.def.group === 'pet' || x.def.group === 'pack') ?? []) {
      m.statuses.apply('wild_wrath', dur, { sourceId: p.id });
    }
  },
};

BEHAVIORS_ARCHER.archer_charge_shot = chargeShot;
BEHAVIORS_ARCHER.archer_channel_shoot = channelShoot;
BEHAVIORS_ARCHER.archer_kill_shot = killShot;
BEHAVIORS_ARCHER.archer_pet_strike = petStrike;
BEHAVIORS_ARCHER.archer_call_pet = callPet;
BEHAVIORS_ARCHER.archer_trap = trap;
BEHAVIORS_ARCHER.archer_disengage = disengage;
BEHAVIORS_ARCHER.archer_hunters_mark = huntersMark;
BEHAVIORS_ARCHER.archer_bestial_wrath = bestialWrath;

function installArcher(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_ARCHER);
}

try {
  installArcher();
} catch {
  queueMicrotask(installArcher);
}
