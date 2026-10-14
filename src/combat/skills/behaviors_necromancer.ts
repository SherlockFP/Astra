/**
 * Nekromant behaviours (GDD_CLASSES_V2 §14 NC52; kit numbers: docs/kits/plate-melee.md §8 Kemik Muhafızı = Blood DK, §9 Ordu Efendisi =
 * Unholy DK). NC48 creates this file empty; this package fills BEHAVIORS_NECROMANCER and never touches behaviors.ts. Installed into
 * BEHAVIORS by the import at the end of behaviors.ts (microtask fallback, as in plateKit.ts). The full skill -> behaviour map (also the rows
 * that run on behaviours of other files) is docs/kits/necromancer_behaviors.md.
 *
 * behaviour id       what it does / reads (SkillDef.params unless noted)                                  used by
 * -----------------  ---------------------------------------------------------------------------------  --------------------------
 * death_strike       melee strike, heals max(healPctOfRecent x damage taken in `window` s, minHealPct x    necro_death_strike
 *                    max HP) (x vbMult under vampiric_blood), blood_shield absorb = shieldPct x heal
 * strike_self_buff   one strike on the aimed enemy, then def.selfStatuses on the caster (`buffOnMiss`)    necro_marrowrend
 * multi_cleave       `hits` hits (gap s apart) on the target AND on `cleave` more enemies of the cone        necro_heart_strike
 *                    (cleaveMult), def.statuses on every hit
 * scourge_strike     ranged lash; a vile_contagion stack on the target is SPENT: +stackMore, plague          necro_scourge_strike
 *                    eruption (splashCoef to enemies in splashRadius that carry virulent_plague),
 *                    summons `summonPerStack` x def.minion per stack spent
 * death_coil         homing bolt (+dtMore under dark_transformation); heals the caster's `pet` minions       necro_death_coil
 *                    petHealPct; aimed at an own minion it heals that minion (minionHealPct) instead
 * spread_aoe         strike the target and everything in def.radius around it (`maxTargets`); the DoTs of     necro_epidemic
 *                    def.statuses are COPIED from the target (dps and all) to the others; `center 1` = caster
 * death_order        orders every minion (`armyOnly 1` = group army) onto the target: focus, ring teleport,    necro_death_order
 *                    one merged strike (cmdCoef x minions), cleave to `cleaveMax` enemies at cleaveMult
 *                    once `cleaveMin` enemies stand in `cleaveRadius`; spends one vile_contagion; `gain` Öz (PM-NE)
 * empower_minions    Karanlık Dönüşüm: def.selfStatuses on the caster, the caster's `pet` minions deal          necro_dark_transformation
 *                    dmgMult x for the status duration, focus on the aimed enemy
 * summon_ring        def.minion summoned in a ring (`ringRadius`), cap-exempt via minion.ignoreCap,            necro_army_of_the_dead
 *                    def.selfStatuses (army) on the caster
 * magic_shell        magic-only absorb absorbPct x max HP for `dur` s, +rpPerPct Öz per 1 % max HP soaked      necro_anti_magic_shell
 *                    (cap rpCap); the hook is combat/magicShell.ts (Combat.hitLocalPlayer)
 * raise_dead         consumes the nearest corpse (G.corpses) within `corpseRange`, summons def.minion at it    (corpse kits, none in the
 *                    (corpseHpBonus), refunds corpseRefund x cost                                              two DK kits)
 * corpse_explosion   consumes the nearest corpse within `corpseSearch` of the aim point and blasts def.radius  (corpse kits)
 *                    (livingCoef without a corpse, explChain chain explosions at explChainMult)
 *
 * Rows that use behaviours of OTHER files: self_aoe + params.maxTargets (necro_blood_boil), target_instant with def.statuses
 * (necro_outbreak, necro_festering_strike), grip (necro_deaths_grip), interrupt (necro_mind_freeze), self_buff (necro_vampiric_blood,
 * necro_dancing_rune_weapon, necro_icebound_fortitude, necro_deaths_advance), melee_arc / target_projectile chains (basics).
 *
 * Conventions (same as plateKit / behaviors_paladin): begin() delegates to the target_instant begin (range, lunge, line of sight) and fails
 * unpaid with sys.fail('target' | 'range'); remote replays (c.remote) draw visuals only and never throw; heals go through healAmount; damage
 * goes through sys.strike; every behaviour applies def.selfStatuses itself (SkillSystem only does it for kit_* ids). Minion state is owner-
 * authoritative, so minion changes made here replicate through the `minion` channel; spent enemy statuses are spent on the CASTER's view
 * (a client cannot remove a status on the host, see the doc "Known gaps").
 */
import { G } from '../../game/G';
import { clamp } from '../../core/utils';
import { STATUSES } from '../../data/statuses';
import { CLASS_DEFAULT_MINION, minionDef } from '../../data/minions';
import { addAbsorb, healAmount } from '../healing';
import { startMagicShell } from '../magicShell';
import { BEHAVIORS, TARGETING_BEHAVIORS, at, castTarget, impactVfx, swingVfx, type Behavior, type CastCtx } from './behaviors';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Minion } from '../../entities/Minion';
import type { DamageResult } from '../Combat';
import type { MinionAttack, MinionDef } from '../../types/minions';
import type { StatusApply, StatusId } from '../../types/skills';
import type { DamageType } from '../../types/common';

export const BEHAVIORS_NECROMANCER: Record<string, Behavior> = {};

/** Command range of death_order (same as minion_command). */
const COMMAND_RANGE = 40;
/** Group id of the permanent pet (Kemik Ghul). */
const PET_GROUP = 'pet';

// ---------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------

/** The cast's enemy (soft / hard target). Null for none, dead or non-enemy actors. */
function enemyTarget(c: CastCtx): Enemy | null {
  const t = castTarget(c);
  return t && t.team === 'enemy' && !t.isDead && !t.removed ? (t as Enemy) : null;
}

/** begin(): the stock `target_instant` check (target present, range incl. a short melee lunge, line of sight). Resolved lazily (load order). */
function targetInstantBegin(c: CastCtx): boolean {
  return TARGETING_BEHAVIORS.target_instant.begin?.(c) !== false;
}

const hasStatus = (a: Actor, id: StatusId): boolean => a.statuses.has(id);

/** Cast-time factor of Karanlık Dönüşüm for Ölüm Sarmalı / Salgın (`dtMore`). */
const dtFactor = (c: CastCtx): number => (hasStatus(c.caster, 'dark_transformation') ? 1 + (c.def.params?.dtMore ?? 0.2) : 1);

/** Minion def of a summon row ('auto' = the class default). Unknown ids are logged once per call and summon nothing. */
function rowDef(c: CastCtx): MinionDef | undefined {
  const row = c.def.minion;
  if (!row) return undefined;
  const want = row.id === 'auto' ? (CLASS_DEFAULT_MINION[c.caster.classId] ?? '') : row.id;
  const d = minionDef(want);
  if (!d) console.warn(`[necromancer] unknown minion def '${want}' (skill ${c.def.id})`);
  return d;
}

/** Spends one stack of a status on an enemy (the caster's view). The host also tells the clients when the status is gone. */
function spendStack(e: Enemy, id: StatusId): boolean {
  if (!e.statuses.has(id)) return false;
  const ok = e.statuses.consumeStack(id);
  if (ok && !e.statuses.has(id) && (!G.net || G.net.isAuthority)) {
    try { G.net?.broadcast('estatus', { targetId: e.id, status: id, duration: 0, stacks: 0, removed: true }); } catch { /* net not ready */ }
  }
  return ok;
}

/** A synthetic minion attack carrying a command coefficient (Minions.strike -> playerHitEnemy with the owner's stats). */
function commandAtk(c: CastCtx, coef: number): MinionAttack {
  return {
    id: c.def.id, name: c.def.name, kind: 'melee', range: 99, cooldown: 0, hitTime: 0, anim: '',
    coef, type: (c.def.damage?.type ?? 'shadow') as DamageType,
  };
}

/** Living minions of the caster within `COMMAND_RANGE` (optionally only the `army` group). */
function ownedMinions(c: CastCtx, armyOnly: boolean): Minion[] {
  const p = c.caster;
  return (G.minions?.ownedBy(p.id) ?? []).filter((m) =>
    (!armyOnly || m.def.group === 'army') && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) <= COMMAND_RANGE);
}

/** Ring of `n` points of radius `r` around (x, z), the first point at angle `a0`. */
function ringPoints(x: number, z: number, r: number, n: number, a0: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / Math.max(1, n)) * Math.PI * 2;
    out.push([x + Math.sin(a) * r, z + Math.cos(a) * r]);
  }
  return out;
}

/** Keeps a point out of walls (nav circle resolve); silent when the world has no nav (tests). */
function settle(m: Actor): void {
  try { G.world?.nav?.resolveCircle?.(m.position, m.radius); } catch { /* no nav */ }
}

// ---------------------------------------------------------------------------------------------------------
// death_strike: Ölüm Darbesi
// ---------------------------------------------------------------------------------------------------------

const deathStrike: Behavior = {
  begin: targetInstantBegin,
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { swingVfx(c, def.range ?? 3.2, def.arc ?? 90, true); return; }
    const t = enemyTarget(c);
    if (!t) { sys.whiff(c); return; }
    const dir = sys.dirTo(caster, t);
    const r = sys.strike(c, t, { dir, weight: 'heavy' });
    if (r) { sys.afterHits(c, [r]); impactVfx(c, t, dir, 0); }
    // the heal: a share of what the last `window` seconds took, never less than minHealPct of max HP
    const recent = G.combat?.damageTakenWithin(caster, p.window ?? 5) ?? 0;
    let heal = Math.max(recent * (p.healPctOfRecent ?? 0.2), (p.minHealPct ?? 0.07) * caster.maxHp);
    if (hasStatus(caster, 'vampiric_blood')) heal *= p.vbMult ?? 1.3;
    heal *= c.more;
    if (heal > 0) healAmount(caster, caster, heal, false);
    // Mastery Kan Kalkanı: an absorb worth shieldPct of the heal
    const shield = heal * (p.shieldPct ?? 0.2);
    if (shield > 0) addAbsorb(caster, shield, caster.maxHp * (p.shieldCapPct ?? 0.45), p.shieldDur ?? 10, 'blood_shield', caster.id);
    sys.applySelf(c, def.selfStatuses ?? []);
    // red motes into the chest, bigger the more was paid back
    sys.vfx(def.vfx?.cast ?? 'heal_burst', at(caster, 1.2), { color: 0xaa1830, scale: clamp(1 + (heal / Math.max(1, caster.maxHp)) * 4, 1, 2) });
    sys.hitstopMs(70);
    sys.shake(0.15);
    sys.sfx('heavy_hit', t.position);
    sys.sfx('heal', caster.position, { pitch: 0.8 });
  },
};

// ---------------------------------------------------------------------------------------------------------
// strike_self_buff: İlik Söken
// ---------------------------------------------------------------------------------------------------------

const strikeSelfBuff: Behavior = {
  begin: targetInstantBegin,
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) { swingVfx(c, def.range ?? 3.2, def.arc ?? 90, true); return; }
    const t = enemyTarget(c);
    if (!t) { sys.whiff(c); return; }
    const dir = sys.dirTo(caster, t);
    const r = sys.strike(c, t, { dir, weight: 'heavy' });
    if (r) { sys.afterHits(c, [r]); impactVfx(c, t, dir, 0); }
    if (r || (p.buffOnMiss ?? 0) > 0) {
      sys.applySelf(c, def.selfStatuses ?? []);
      sys.vfx(def.vfx?.cast ?? 'bone_burst', at(caster, 1.0), { scale: 0.9 });
      sys.sfx('bone_impact', caster.position);
    } else sys.whiff(c);
  },
};

// ---------------------------------------------------------------------------------------------------------
// multi_cleave: Kalp Darbesi
// ---------------------------------------------------------------------------------------------------------

const multiCleave: Behavior = {
  begin: targetInstantBegin,
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const range = def.range ?? 3.2;
    const arc = def.arc ?? 90;
    if (c.remote) { swingVfx(c, range, arc, true); return; }
    const primary = enemyTarget(c);
    if (!primary) { sys.whiff(c); return; }
    const hits = Math.max(1, Math.round(p.hits ?? 2));
    const gap = p.gap ?? 0.12;
    const dir = sys.dirTo(caster, primary);
    const others = sys.enemiesInCone(caster, dir, range + 1.5, arc)
      .filter((e) => e !== primary && !e.isDead && !e.removed)
      .sort((a, b) => Math.hypot(a.position.x - primary.position.x, a.position.z - primary.position.z) - Math.hypot(b.position.x - primary.position.x, b.position.z - primary.position.z))
      .slice(0, Math.max(0, Math.round(p.cleave ?? 1)));
    const targets = [primary, ...others];
    swingVfx(c, range, arc, false);
    const round = (i: number): void => {
      const last = i === hits - 1;
      const res: DamageResult[] = [];
      targets.forEach((e, k) => {
        if (e.isDead || e.removed) return;
        const r = sys.strike(c, e, { dir: sys.dirTo(caster, e), weight: last ? 'heavy' : 'light', noGain: true, noHitstop: !(last && k === 0), more: k === 0 ? 1 : (p.cleaveMult ?? 1) });
        if (r) { res.push(r); if (i === 0) impactVfx(c, e, dir, k); }
      });
      if (last) sys.afterHits(c, res);   // the Öz gain once per cast
      if (i > 0 || hits === 1) swingVfx(c, range, arc, last);
    };
    for (let i = 0; i < hits; i++) {
      if (i === 0) round(0);
      else sys.schedule(i * gap, () => round(i));
    }
  },
};

// ---------------------------------------------------------------------------------------------------------
// scourge_strike: Ölüm Kırbacı
// ---------------------------------------------------------------------------------------------------------

const scourgeStrike: Behavior = {
  begin: targetInstantBegin,
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) {
      const id = c.aim.targetId;
      const t = id !== null && id !== undefined ? G.world?.getActor(id) : undefined;
      if (t) sys.vfx(def.vfx?.cast ?? 'slash_arc', at(caster, 1.2), { dir: [c.dir[0], 0, c.dir[1]], scale: 1, color: 0x6f3a8f });
      return;
    }
    const t = enemyTarget(c);
    if (!t) { sys.whiff(c); return; }
    const dir = sys.dirTo(caster, t);
    const spent = spendStack(t, 'vile_contagion');
    const r = sys.strike(c, t, { dir, more: spent ? 1 + (p.stackMore ?? 0.35) : 1 });
    const res: DamageResult[] = r ? [r] : [];
    if (r) impactVfx(c, t, dir, 0);
    if (spent) {
      // the plague erupts: a splash on every other enemy near the target that carries virulent_plague
      const need = (p.splashNeed ?? 1) > 0;
      const near = sys.enemiesNear(t.position.x, t.position.z, p.splashRadius ?? 5, t.position.y)
        .filter((e) => e !== t && !e.isDead && !e.removed && (!need || e.statuses.has('virulent_plague')))
        .slice(0, Math.max(0, Math.round(p.splashMax ?? 8)));
      for (const e of near) {
        sys.strike(c, e, { coef: p.splashCoef ?? 0.5, weight: 'light', noGain: true, noHitstop: true, statuses: [], dir: sys.dirTo(t, e) });
        sys.vfx('poison_burst', at(e, e.height * 0.5), { scale: 0.6 });
      }
      sys.vfx('corpse_explosion', at(t, t.height * 0.5), { scale: 0.45 });
      // one Lesser Ghoul per stack spent
      const md = rowDef(c);
      if (md && G.minions) {
        const row = c.def.minion!;
        G.minions.summon(caster, md, { count: Math.max(1, Math.round(p.summonPerStack ?? 1)), cap: row.cap, group: row.group, life: row.life, ignoreCap: row.ignoreCap });
      }
    }
    if (res.length) sys.afterHits(c, res); else sys.whiff(c);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// apocalypse: Kıyamet (Ordu Efendisi, Festering Wounds = vile_contagion)
// ---------------------------------------------------------------------------------------------------------

/** Spends up to `max` vile_contagion stacks of an enemy (one spendStack per stack); returns how many were spent. */
function spendStacksUpTo(e: Enemy, id: StatusId, max: number): number {
  let n = 0;
  while (n < max && spendStack(e, id)) n++;
  return n;
}

/** Kıyamet: spends every Çürük Bulaşı stack on the target (up to params.maxStacks), one Kemik Ghul per stack and a hit per stack. */
const apocalypse: Behavior = {
  begin: targetInstantBegin,
  fire(c) {
    if (c.remote) return;
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const t = enemyTarget(c);
    if (!t) { sys.whiff(c); return; }
    const spent = spendStacksUpTo(t, 'vile_contagion', Math.max(1, Math.round(p.maxStacks ?? 8)));
    if (spent === 0) { sys.whiff(c); return; }
    const dir = sys.dirTo(caster, t);
    const r = sys.strike(c, t, { dir, coef: (p.coef ?? 0.25) * spent });
    sys.vfx('corpse_explosion', at(t, t.height * 0.5), { scale: 0.3 + 0.05 * spent });
    const md = rowDef(c);
    const row = def.minion;
    if (md && row && G.minions) G.minions.summon(caster, md, { count: spent, cap: row.cap, group: row.group, life: row.life, ignoreCap: row.ignoreCap });
    if (r) sys.afterHits(c, [r]); else sys.whiff(c);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// death_coil: Ölüm Sarmalı
// ---------------------------------------------------------------------------------------------------------

/** An own (owner = caster) living minion under the reticle, if the aim points at one. */
function aimedOwnMinion(c: CastCtx): Minion | null {
  const id = c.aim.targetId;
  const a = id !== null && id !== undefined ? G.world?.getActor(id) : undefined;
  if (!a || a.kind !== 'minion' || a.isDead || a.removed) return null;
  const m = a as Minion;
  return m.ownerId === c.caster.id ? m : null;
}

function healMinion(m: Minion, frac: number): void {
  if (m.isDead || m.removed || frac <= 0) return;
  m.hp = Math.min(m.maxHp, m.hp + m.maxHp * frac);
}

const deathCoil: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (!c.remote) {
      const own = aimedOwnMinion(c);
      if (own) {
        // aimed at an own minion: a heal instead of the bolt
        healMinion(own, p.minionHealPct ?? 0.2);
        sys.vfx('heal_burst', at(own, own.height * 0.6), { color: 0x9b6bff, scale: 0.9 });
        sys.sfx('heal', own.position);
        return;
      }
    }
    const t = castTarget(c);
    const d = t ? sys.dirTo(caster, t) : c.dir;
    if (!c.remote) {
      c.more *= dtFactor(c);
      for (const m of G.minions?.ownedBy(caster.id, (x) => x.def.group === PET_GROUP) ?? []) healMinion(m, p.petHealPct ?? 0.05);
    }
    sys.fireProjectile(c, d, 1.35, t);
    sys.vfx(def.vfx?.cast ?? 'death_nova', [caster.position.x + d[0] * 0.9, caster.position.y + 1.35, caster.position.z + d[1] * 0.9], { dir: [d[0], 0, d[1]], scale: 0.5 });
    if (!c.remote) sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// spread_aoe: Salgın
// ---------------------------------------------------------------------------------------------------------

/** The DoT statuses of a row (the ones with a dotType), and the rest. */
function splitDots(list: readonly StatusApply[]): { dots: StatusApply[]; rest: StatusApply[] } {
  const dots: StatusApply[] = [];
  const rest: StatusApply[] = [];
  for (const s of list) (STATUSES[s.status]?.dotType ? dots : rest).push(s);
  return { dots, rest };
}

const spreadAoe: Behavior = {
  begin(c) {
    return (c.def.params?.center ?? 0) > 0 ? true : targetInstantBegin(c);
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = def.radius ?? 8;
    const centered = (p.center ?? 0) > 0;
    const t = centered ? null : enemyTarget(c);
    const origin: Actor = t ?? caster;
    sys.vfx(def.vfx?.cast ?? 'poison_cloud', at(origin, 0.2), { scale: clamp(radius / 5, 0.8, 2) });
    sys.ring(origin.position.x, origin.position.z, radius, 0x8fbf6a);
    if (c.remote) return;
    if (!centered && !t) { sys.whiff(c); return; }
    const list = sys.enemiesNear(origin.position.x, origin.position.z, radius, origin.position.y)
      .filter((e) => !e.isDead && !e.removed)
      .sort((a, b) => (a === t ? -1 : b === t ? 1 : Math.hypot(a.position.x - origin.position.x, a.position.z - origin.position.z) - Math.hypot(b.position.x - origin.position.x, b.position.z - origin.position.z)))
      .slice(0, Math.max(1, Math.round(p.maxTargets ?? 8)));
    if (t && !list.includes(t)) list.unshift(t);
    const { dots, rest } = splitDots(def.statuses ?? []);
    const more = dtFactor(c);
    const res: DamageResult[] = [];
    list.forEach((e, n) => {
      // copy every DoT the target already carries (dps included); the others get the row's own application (dps from the hit)
      const spread: StatusApply[] = dots.map((s) => {
        const have = t && e !== t ? t.statuses.get(s.status) : undefined;
        return have && have.dps > 0 ? { status: s.status, duration: Math.max(s.duration * 0.5, have.remaining), magnitude: have.magnitude, dps: have.dps } : s;
      });
      const dir = sys.dirTo(caster, e);
      const r = sys.strike(c, e, { dir, more, noGain: true, noHitstop: n > 0, weight: e === t ? 'heavy' : 'light', statuses: [...rest, ...spread] });
      if (r) { res.push(r); impactVfx(c, e, dir, n); }
    });
    if (res.length) sys.afterHits(c, res); else sys.whiff(c);
    sys.applySelf(c, def.selfStatuses ?? []);
    sys.shake(0.18);
    sys.sfx('corpse_pop', origin.position, { volume: 0.8 });
  },
};

// ---------------------------------------------------------------------------------------------------------
// death_order: Ölüm Emri
// ---------------------------------------------------------------------------------------------------------

const deathOrder: Behavior = {
  begin(c) {
    if (c.remote) return true;
    if (!enemyTarget(c)) { c.sys.fail('target'); return false; }
    if (ownedMinions(c, (c.def.params?.armyOnly ?? 0) > 0).length === 0) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    if (c.remote) return;
    const t = enemyTarget(c);
    if (!t || !G.minions) { sys.whiff(c); return; }
    spendStack(t, 'vile_contagion');
    G.minions.focus(caster, t.id, p.focusSec ?? 6);
    const list = ownedMinions(c, (p.armyOnly ?? 0) > 0);
    const coef = p.cmdCoef ?? 0;
    if (coef > 0 && list.length) {
      // the ghouls leap onto the target; their blows land as ONE merged hit per enemy (coef x ghoul count)
      const pts = ringPoints(t.position.x, t.position.z, 1.5, list.length, 0);
      list.forEach((m, i) => {
        m.position.x = pts[i][0];
        m.position.z = pts[i][1];
        m.yaw = Math.atan2(t.position.x - m.position.x, t.position.z - m.position.z);
        m.playShot(m.def.attacks[0]?.anim, m.def.attacks[0]?.animSpeed ?? 1);
        sys.vfx('curse_ring', at(m, 0.1), { scale: 0.5 });
      });
      const total = coef * list.length;
      G.minions.strike(list[0], commandAtk(c, total), t);
      const near = sys.enemiesNear(t.position.x, t.position.z, p.cleaveRadius ?? 5, t.position.y).filter((e) => !e.isDead && !e.removed);
      if (near.length >= Math.round(p.cleaveMin ?? 3)) {
        near.filter((e) => e !== t).slice(0, Math.max(0, Math.round(p.cleaveMax ?? 5))).forEach((e) => {
          G.minions.strike(list[0], commandAtk(c, total * (p.cleaveMult ?? 0.5)), e);
        });
      }
    }
    // PM-NE: the Öz gain of the row (+10, once per order; the merged minion hit goes through Combat.playerHitEnemy, not sys.strike)
    if ((p.gain ?? 0) > 0) sys.gainResource(caster, p.gain);
    sys.vfx(def.vfx?.cast ?? 'curse_ring', at(t, 0.1), { scale: 1 });
    sys.sfx('curse_cast', caster.position);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// empower_minions: Karanlık Dönüşüm
// ---------------------------------------------------------------------------------------------------------

/**
 * Makes `m` deal `mult` x damage until world time `until`. The engine has no per-minion damage modifier (Minions.strike reads the
 * owner's minionDamagePct only), so the minion gets a copy of its def whose attack `coef` is a getter: it reads `mult` while the
 * window is open and the base value afterwards. A leaked copy (respawn entry, scene change) is therefore harmless once the window is
 * over. Re-empowering never nests copies.
 */
export function empowerMinion(m: Minion, until: number, mult: number): void {
  const holder = m as unknown as { def: MinionDef };
  const base = (holder.def as MinionDef & { __orig?: MinionDef }).__orig ?? holder.def;
  const clone: MinionDef & { __orig?: MinionDef } = {
    ...base,
    attacks: base.attacks.map((a) => {
      const copy = { ...a };
      Object.defineProperty(copy, 'coef', { get: () => a.coef * ((G.world?.time ?? 0) < until ? mult : 1), enumerable: true, configurable: true });
      return copy;
    }),
  };
  Object.defineProperty(clone, '__orig', { value: base, enumerable: false });
  holder.def = clone;
}

const empowerMinions: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const dur = def.selfStatuses?.find((s) => s.status === 'dark_transformation')?.duration ?? p.dur ?? 15;
    sys.vfx(def.vfx?.cast ?? 'curse_ring', at(caster, 0.1), { scale: 1.2 });
    sys.sfx('curse_cast', caster.position);
    if (c.remote) return;
    sys.applySelf(c, def.selfStatuses ?? []);
    const until = (G.world?.time ?? 0) + dur;
    for (const m of G.minions?.ownedBy(caster.id, (x) => x.def.group === PET_GROUP) ?? []) {
      empowerMinion(m, until, p.dmgMult ?? 2);
      sys.vfx('bone_burst', at(m, m.height * 0.5), { scale: 1.2 });
    }
    // the dark bolt: the pet goes for the aimed enemy
    const t = enemyTarget(c);
    if (t) G.minions?.focus(caster, t.id, p.focusSec ?? dur);
  },
};

// ---------------------------------------------------------------------------------------------------------
// summon_ring: Ölüler Ordusu
// ---------------------------------------------------------------------------------------------------------

const summonRing: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = p.ringRadius ?? 4.5;
    sys.vfx(def.vfx?.cast ?? 'grave_rise', at(caster, 0.1), { scale: clamp(radius / 3, 1, 2) });
    sys.vfx('shockwave', at(caster, 0.1), { scale: clamp(radius / 3, 1, 2) });
    sys.shake(0.3);
    sys.sfx('raise_dead', caster.position);
    if (c.remote) return;
    const row = def.minion;
    const md = rowDef(c);
    if (row && md && G.minions) {
      const ms = G.minions.summon(caster, md, { count: row.count, cap: row.cap, group: row.group, life: row.life, ignoreCap: row.ignoreCap });
      const pts = ringPoints(caster.position.x, caster.position.z, radius, ms.length, caster.yaw);
      ms.forEach((m, i) => {
        m.position.x = pts[i][0];
        m.position.z = pts[i][1];
        settle(m);
        sys.vfx('grave_rise', at(m, 0.1), { scale: 0.6 });
      });
    }
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

// ---------------------------------------------------------------------------------------------------------
// magic_shell: Büyü Karşıtı Kalkan
// ---------------------------------------------------------------------------------------------------------

const magicShell: Behavior = {
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const dur = def.selfStatuses?.find((s) => s.status === 'anti_magic_shell')?.duration ?? p.dur ?? 8;
    sys.vfx(def.vfx?.cast ?? 'shield_bubble', at(caster, 1.2), { follow: caster.object3d, duration: dur, scale: 1.1, color: 0x9b6bff });
    sys.sfx('buff', caster.position);
    if (c.remote) return;
    const cap = caster.maxHp * (p.absorbPct ?? 0.3);
    startMagicShell(caster, cap, p.rpPerPct ?? 1, p.rpCap ?? 20);
    caster.statuses.apply('anti_magic_shell', dur, { magnitude: cap, sourceId: caster.id });
    sys.applySelf(c, (def.selfStatuses ?? []).filter((s) => s.status !== 'anti_magic_shell'));
  },
};

// ---------------------------------------------------------------------------------------------------------
// corpse consumers: raise_dead, corpse_explosion (G.corpses, NC45)
// ---------------------------------------------------------------------------------------------------------

/** Search centre of a corpse skill: the aim point (`atPoint 1`) or the caster. */
function corpseCentre(c: CastCtx): [number, number] {
  return (c.def.params?.atPoint ?? 0) > 0 ? c.point : [c.caster.position.x, c.caster.position.z];
}

const raiseDead: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const p = c.def.params ?? {};
    if ((p.needCorpse ?? 1) <= 0) return true;
    const [x, z] = corpseCentre(c);
    if (!G.corpses?.nearest(x, z, p.corpseRange ?? 12, c.caster.position.y)) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    sys.vfx(def.vfx?.cast ?? 'grave_rise', at(caster, 0.1), { scale: 1 });
    sys.sfx('raise_dead', caster.position);
    if (c.remote) return;
    const [cx, cz] = corpseCentre(c);
    const corpse = G.corpses?.take(cx, cz, p.corpseRange ?? 12, caster.position.y) ?? null;
    if (!corpse && (p.needCorpse ?? 1) > 0) { sys.whiff(c); return; }
    const md = rowDef(c);
    const row = def.minion;
    if (!md || !row || !G.minions) return;
    const ms = G.minions.summon(caster, md, { count: row.count, cap: row.cap, group: row.group, life: row.life, ignoreCap: row.ignoreCap });
    if (corpse) {
      ms.forEach((m, i) => {
        const a = (i / Math.max(1, ms.length)) * Math.PI * 2;
        m.position.x = corpse.x + (ms.length > 1 ? Math.sin(a) * 1.2 : 0);
        m.position.z = corpse.z + (ms.length > 1 ? Math.cos(a) * 1.2 : 0);
        m.position.y = corpse.y;
        settle(m);
        m.maxHp = Math.round(m.maxHp * (1 + (p.corpseHpBonus ?? 0.4)));
        m.hp = m.maxHp;
      });
      sys.vfx('grave_rise', [corpse.x, corpse.y + 0.1, corpse.z], { scale: 1 });
      if ((p.corpseRefund ?? 0) > 0 && def.cost > 0) sys.addResource(caster, def.cost * p.corpseRefund);
    }
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

const corpseExplosion: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const p = c.def.params ?? {};
    const near = G.corpses?.nearest(c.point[0], c.point[1], p.corpseSearch ?? 6, c.caster.position.y);
    if (!near && (p.livingCoef ?? 0) <= 0) { c.sys.fail('target'); return false; }
    return true;
  },
  fire(c) {
    const { caster, sys, def } = c;
    const p = def.params ?? {};
    const radius = def.radius ?? 4.2;
    const corpse = c.remote ? null : (G.corpses?.take(c.point[0], c.point[1], p.corpseSearch ?? 6, caster.position.y) ?? null);
    const x = corpse?.x ?? c.point[0], z = corpse?.z ?? c.point[1];
    sys.vfx(def.vfx?.impact ?? 'corpse_explosion', [x, (corpse?.y ?? caster.position.y) + 0.5, z], { scale: clamp(radius / 3, 0.8, 2) });
    sys.ring(x, z, radius, 0x8fbf6a);
    sys.shake(0.25);
    sys.sfx('corpse_pop', [x, 0, z]);
    if (c.remote) return;
    // without a corpse the blast is a smaller one on the aim point (livingCoef x), only if something stands there
    const base = corpse ? 1 : (p.livingCoef ?? 0);
    const chainGens = Math.max(0, Math.round(p.explChain ?? 0));
    const blast = (bx: number, bz: number, mult: number, gen: number): void => {
      const list = sys.enemiesNear(bx, bz, radius, corpse?.y ?? caster.position.y).filter((e) => !e.isDead && !e.removed).slice(0, Math.max(1, Math.round(p.maxTargets ?? 99)));
      if (!list.length) return;
      const res: DamageResult[] = [];
      const killed: Enemy[] = [];
      list.forEach((e, i) => {
        const dir: [number, number] = [e.position.x - bx, e.position.z - bz];
        const l = Math.hypot(dir[0], dir[1]) || 1;
        const r = sys.strike(c, e, { more: mult, noGain: gen > 0, weight: 'heavy', noHitstop: gen > 0 || i > 0, dir: [dir[0] / l, dir[1] / l] });
        if (r) { res.push(r); if (r.killed) killed.push(e); }
      });
      sys.afterHits(c, res);
      if (gen >= chainGens) return;
      // enemies the blast killed leave a corpse of their own: it goes off too, weaker
      for (const e of killed) {
        const cc = G.corpses?.take(e.position.x, e.position.z, 1.5, e.position.y);
        sys.schedule(0.25, () => blast(cc?.x ?? e.position.x, cc?.z ?? e.position.z, mult * (p.explChainMult ?? 0.5), gen + 1));
      }
    };
    blast(x, z, base > 0 ? base : 0, 0);
    sys.applySelf(c, def.selfStatuses ?? []);
  },
};

Object.assign(BEHAVIORS_NECROMANCER, {
  death_strike: deathStrike,
  strike_self_buff: strikeSelfBuff,
  multi_cleave: multiCleave,
  scourge_strike: scourgeStrike,
  apocalypse,
  death_coil: deathCoil,
  spread_aoe: spreadAoe,
  death_order: deathOrder,
  empower_minions: empowerMinions,
  summon_ring: summonRing,
  magic_shell: magicShell,
  raise_dead: raiseDead,
  corpse_explosion: corpseExplosion,
});

function installNecromancer(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_NECROMANCER);
}

try {
  installNecromancer();
} catch {
  queueMicrotask(installNecromancer);
}
