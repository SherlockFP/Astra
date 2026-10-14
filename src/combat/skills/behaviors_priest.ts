/**
 * Rahip behaviours (GDD_CLASSES_V2 Rahip kit, Midnight 12.0 shape). Installed into BEHAVIORS by the import at the end of
 * behaviors.ts (microtask fallback, as in behaviors_monk.ts). OWNER: priest kit. behaviors.ts is not edited.
 *
 * behaviour id        used by (priest skill ids)                           reads (SkillDef.params unless noted)
 * ------------------  -----------------------------------------------------  ----------------------------------------------------
 * priest_strike       priest_basic, priest_smite, priest_shadow_mind_blast,  target_instant (begin), the hit: strikeAtone (Keffara)
 *                     priest_shadow_void_bolt
 * priest_dot          priest_shadow_swp, priest_shadow_vt                    target_instant (begin), def.statuses (DoT)
 * priest_mind_flay    priest_shadow_mind_flay (3 s channel)                  tick (params.tick), def.damage per tick
 * priest_ally         priest_power_word_shield, priest_flash_heal,           shield (absorb = healFormula(heal.coef)),
 *                     priest_dispel, priest_disc_pain_suppression,           shieldSec, dispel (count), atonement (Keffara),
 *                     priest_holy_guardian                                   def.statuses (magnitude 0 unless set)
 * priest_renew        priest_renew                                           hotCoef, tick (s), def.statuses[0] (renew HoT)
 * priest_penance      priest_disc_penance (2 s channel)                      tick; enemy aim = damage (Keffara heal), else heal (no Keffara, 12.1.0)
 * priest_radiance     priest_disc_radiance                                   maxTargets, def.radius (Keffara spread)
 * priest_hymn         priest_holy_hymn (3 s channel)                         def.heal.coef per tick, def.radius
 * priest_rapture      priest_disc_rapture (m90)                              pct (max HP share), dur, def.radius
 * priest_evangelism   priest_disc_evangelism (m45)                           extend (s), def.heal.coef, def.radius
 * priest_execute      priest_shadow_death                                    execute (HP share), executeMult; strike with the row's coef
 * priest_self         priest_desperate_prayer                                def.heal.coef on the caster
 * priest_mending      priest_holy_mending (bounce applied at once, no jumps) maxTargets, bounceRange, def.heal.coef per target
 *
 * Reused from other files (BEHAVIORS keys, no copy): heal_target (priest_holy_serenity), heal_aoe (priest_holy_prayer,
 * priest_holy_sanctify, priest_holy_circle), heal_bolt (priest_holy_basic), minion_summon (priest_shadow_fiend), interrupt
 * (priest_shadow_silence, utilities.ts), self_buff (priest_shadow_voidform, priest_fade, priest_shadow_dispersion: the statuses come
 * from the row's selfStatuses).
 *
 * Keffara (Atonement, Disciplin only): the caster's damage heals every living ally marked by `atonement` within HEAL_RANGE, for
 * 46 % of the damage dealt; beyond 5 marked allies the share is halved (warcraft.wiki.gg/wiki/Atonement). Keffara is kept in
 * the caster's specialisation only (specOf), like the talent it comes from.
 */
import { BEHAVIORS, TARGETING_BEHAVIORS, castTarget, type Behavior, type CastCtx } from './behaviors';
import { HEAL_RANGE, addAbsorb, alliesInRange, dispelUpTo, healAlly, healAmount, healFormula, resolveHealTarget } from '../healing';
import { specOf } from '../specs';
import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { StatusId } from '../../types/skills';

/** Keffara: the Atonement mark (data/statuses_kit_priest.ts), 15 s per application, and its heal share of the damage dealt. */
const KEFFARA: StatusId = 'atonement';
const KEFFARA_SEC = 15;
const KEFFARA_PCT = 0.46;
const KEFFARA_FULL_TARGETS = 5;

/** Only the Disciplin spec applies Keffara (warcraft.wiki.gg/wiki/Atonement: a Discipline talent). */
function isDisc(p: Player): boolean {
  return specOf(p)?.id === 'priest_discipline';
}

/** Friendly pick of a heal (friendly target, crosshair ally, lowest HP in range, else the caster; healing.ts resolver). */
function healPick(c: CastCtx): Player {
  return resolveHealTarget(c.caster, c.aim, false) ?? c.caster;
}

/** The ally a stored pick still stands for: the caster when the pick died meanwhile. */
function pickedAlly(c: CastCtx): Player {
  const a = c.data.ally as Player | undefined;
  return a && !a.isDead && !a.removed ? a : c.caster;
}

/**
 * Gives a status to an ally. A remote player gets the 'pstatus' message its owner applies (monk pattern). A shield is an absorb
 * (addAbsorb): its magnitude is the absorb amount.
 */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude: number): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  if (status === 'shield') {
    addAbsorb(target, magnitude, magnitude, duration, undefined, c.caster.id);
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** Marks an ally with Keffara (Disciplin only). */
function markKeffara(c: CastCtx, target: Actor): void {
  if (!isDisc(c.caster)) return;
  giveStatus(c, target, KEFFARA, KEFFARA_SEC, 0);
}

/**
 * Keffara heal: the damage dealt heals every living ally marked by Keffara within HEAL_RANGE. Allies past the 5th get half.
 */
function keffaraHeal(c: CastCtx, dealt: number): void {
  if (c.remote || dealt <= 0 || !isDisc(c.caster)) return;
  const marked = alliesInRange(c.caster, HEAL_RANGE).filter((a) => a.statuses.has(KEFFARA));
  marked.forEach((a, i) => healAmount(c.caster, a, dealt * KEFFARA_PCT * (i < KEFFARA_FULL_TARGETS ? 1 : 0.5)));
}

/** One strike of the cast on an enemy (the row's damage, or `coef`), then the Keffara heal of what it dealt. */
function strikeAtone(c: CastCtx, e: Actor, coef?: number): number {
  if (c.remote || e.kind !== 'enemy') return 0;
  const r = c.sys.strike(c, e as Enemy, coef === undefined ? {} : { coef });
  const dealt = r?.amount ?? 0;
  keffaraHeal(c, dealt);
  return dealt;
}

// ---- Instant single-target damage (Kutsal Ok, Kutsal Ceza, Zihin Patlaması, Boşluk Oku): the target_instant pick, then strikeAtone.
const strike: Behavior = {
  begin(c) {
    return TARGETING_BEHAVIORS.target_instant?.begin?.(c);
  },
  frame(c, dt, elapsed) {
    TARGETING_BEHAVIORS.target_instant?.frame?.(c, dt, elapsed);
  },
  fire(c) {
    if (c.remote) return;
    const t = castTarget(c);
    if (t) strikeAtone(c, t);
  },
};

// ---- Gölge acıları (Shadow Word: Pain, Vampiric Touch): the target_instant pick, then the row's DoT statuses on the enemy.
const dot: Behavior = {
  begin(c) {
    return TARGETING_BEHAVIORS.target_instant?.begin?.(c);
  },
  fire(c) {
    if (c.remote) return;
    const t = castTarget(c);
    if (!t || t.kind !== 'enemy') return;
    c.sys.statusOnly(c, t as Enemy, c.def.statuses ?? []);
  },
};

// ---- Zihin Sızması: a 3 s channel on the picked enemy; every tick strikes it (the row's damage) and heals Keffara.
const mindFlay: Behavior = {
  begin(c) {
    if (!c.remote) c.data.foe = castTarget(c);
    return true;
  },
  fire() {},
  tick(c) {
    if (c.remote) return true;
    const foe = c.data.foe as Actor | null | undefined;
    if (!foe || foe.isDead || foe.removed || foe.kind !== 'enemy') return false;
    strikeAtone(c, foe);
    return true;
  },
};

// ---- Güç Kalkanı, Hızlı Şifa, Arındırma, Acı Bastırma, Koruyucu Ruh: one ally, then the row's shield or heal, dispel, statuses, Keffara.
const ally: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    const p = def.params ?? {};
    const target = pickedAlly(c);
    if (p.shield && def.heal?.coef) giveStatus(c, target, 'shield', p.shieldSec ?? 15, healFormula(caster, def.heal.coef).amount);
    else if (def.heal?.coef) healAlly(caster, target, def.heal.coef);
    if (p.dispel) dispelUpTo(target, Math.round(p.dispel));
    for (const st of def.statuses ?? []) giveStatus(c, target, st.status, st.duration, st.magnitude ?? 0);
    if (p.atonement) markKeffara(c, target);
    c.sys.sfx('buff', caster.position);
  },
};

// ---- Yenileme: a heal-over-time on the picked ally; its magnitude is the heal per second (hotCoef per tick, `tick` seconds).
const renew: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const target = pickedAlly(c);
    const st = c.def.statuses?.[0];
    if (st && p.hotCoef) giveStatus(c, target, st.status, st.duration, healFormula(c.caster, p.hotCoef).amount / (p.tick ?? 3));
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Tövbe: a 2 s channel. On an enemy each tick is a holy bolt (strikeAtone); on an ally each tick heals it (Penance applies no Keffara in 12.1.0).
const penance: Behavior = {
  begin(c) {
    if (c.remote) return true;
    const t = castTarget(c);
    if (t && t.kind === 'enemy') c.data.foe = t;
    else c.data.ally = healPick(c);
    return true;
  },
  fire() {},
  tick(c) {
    if (c.remote) return true;
    const foe = c.data.foe as Actor | undefined;
    if (foe) {
      if (foe.isDead || foe.removed) return false;
      strikeAtone(c, foe);
      return true;
    }
    const a = pickedAlly(c);
    healAlly(c.caster, a, c.def.heal?.coef ?? 0.6);
    return true;
  },
};

// ---- Kutsal Işın: the picked ally is healed, then up to `maxTargets` allies within `radius` of it are marked with Keffara.
const radiance: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    const target = pickedAlly(c);
    if (def.heal?.coef) healAlly(caster, target, def.heal.coef);
    if (isDisc(caster)) {
      const others = alliesInRange(target, def.radius ?? 12).filter((a) => a !== target).slice(0, def.params?.maxTargets ?? 4);
      for (const a of [target, ...others]) markKeffara(c, a);
    }
    c.sys.sfx('buff', caster.position);
  },
};

// ---- İlahi Ezgi: a 3 s channel; each tick heals every ally within `radius` (the caster included) for heal.coef.
const hymn: Behavior = {
  fire(c) {
    c.sys.sfx('buff', c.caster.position);
  },
  tick(c) {
    if (c.remote) return true;
    const { caster, def } = c;
    const list = alliesInRange(caster, def.radius ?? 12);
    if (!list.includes(caster)) list.push(caster);
    for (const a of list) healAlly(caster, a, def.heal?.coef ?? 0.3);
    return true;
  },
};

// ---- Vecd (m45): every ally within `radius` gets an absorb of `pct` of its max HP for `dur` seconds.
const rapture: Behavior = {
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    const p = def.params ?? {};
    const list = alliesInRange(caster, def.radius ?? 12);
    if (!list.includes(caster)) list.push(caster);
    for (const a of list) giveStatus(c, a, 'shield', p.dur ?? 10, (p.pct ?? 0.15) * a.maxHp);
    c.sys.sfx('buff', caster.position);
  },
};

// ---- İncil (m90): every ally marked with Keffara gets `extend` more seconds of it, and is healed for heal.coef.
const evangelism: Behavior = {
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    const extend = def.params?.extend ?? 6;
    for (const a of alliesInRange(caster, def.radius ?? 30)) {
      const st = a.statuses.get(KEFFARA);
      if (!st) continue;
      a.statuses.apply(KEFFARA, st.remaining + extend, { magnitude: 0, sourceId: caster.id });
      healAlly(caster, a, def.heal?.coef ?? 1.0);
    }
    c.sys.sfx('buff', caster.position);
  },
};

// ---- Gölge Ölümü (Shadow Word: Death): the target_instant pick, then the strike; below `execute` (HP share) the coef is `executeMult` times.
const execute: Behavior = {
  begin(c) {
    return TARGETING_BEHAVIORS.target_instant?.begin?.(c);
  },
  frame(c, dt, elapsed) {
    TARGETING_BEHAVIORS.target_instant?.frame?.(c, dt, elapsed);
  },
  fire(c) {
    if (c.remote) return;
    const t = castTarget(c);
    if (!t || t.kind !== 'enemy') return;
    const p = c.def.params ?? {};
    const low = t.hp / Math.max(1, t.maxHp) < (p.execute ?? 0.2);
    strikeAtone(c, t, (c.def.damage?.coef ?? 1) * (low ? (p.executeMult ?? 3) : 1));
  },
};

// ---- Desperate Prayer: the caster is healed for heal.coef (no ally pick).
const self: Behavior = {
  begin() {
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    if (def.heal?.coef) healAlly(caster, caster, def.heal.coef);
    c.sys.sfx('buff', caster.position);
  },
};

// ---- Onarım Duası (Prayer of Mending): the picked ally, then up to `maxTargets` - 1 injured allies within `bounceRange` of it
// are healed for heal.coef each. The jumps are applied at once (no bounce hook on hit yet).
const mending: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const { caster, def } = c;
    const p = def.params ?? {};
    const target = pickedAlly(c);
    const coef = def.heal?.coef ?? 1.0;
    healAlly(caster, target, coef);
    const others = alliesInRange(target, p.bounceRange ?? 15)
      .filter((a) => a !== target && a.hp < a.maxHp)
      .sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)
      .slice(0, Math.max(0, (p.maxTargets ?? 5) - 1));
    for (const a of others) healAlly(caster, a, coef);
    c.sys.sfx('buff', caster.position);
  },
};

export const BEHAVIORS_PRIEST: Record<string, Behavior> = {
  priest_strike: strike,
  priest_dot: dot,
  priest_mind_flay: mindFlay,
  priest_ally: ally,
  priest_renew: renew,
  priest_penance: penance,
  priest_radiance: radiance,
  priest_hymn: hymn,
  priest_rapture: rapture,
  priest_evangelism: evangelism,
  priest_execute: execute,
  priest_self: self,
  priest_mending: mending,
};

function installPriest(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_PRIEST);
}

try {
  installPriest();
} catch {
  queueMicrotask(installPriest);
}
