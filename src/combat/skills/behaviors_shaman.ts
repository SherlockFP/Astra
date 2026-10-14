/**
 * Şaman behaviours (WoW Midnight 12.0 direction). Installed into BEHAVIORS by the import at the end of behaviors.ts (microtask
 * fallback, as in behaviors_monk.ts). Owner: shaman kit.
 *
 * behaviour id          used by (shaman skill ids)           reads (SkillDef.params unless noted)
 * --------------------  -----------------------------------  -------------------------------------------------------------
 * shaman_hot            shaman_riptide                       def.heal.coef (instant, on the picked ally), def.statuses[0] (HoT),
 *                                                            hotCoef per tick and tick (s): magnitude = heal per second
 * shaman_chain_heal     shaman_chain_heal                    def.heal.coef on the first ally; bounces, bounceRange, bounceMult
 * shaman_rain           shaman_healing_rain                  def.heal.coef on each ally in def.radius, def.statuses[0] HoT,
 *                                                            hotCoef, tick. The area is centred on the caster (ground placement
 *                                                            is not modelled).
 * shaman_stream_totem   shaman_stream_totem, shaman_tide_totem summons the totem (minion_summon), then gives def.statuses[0] (HoT)
 *                                                            to every ally in def.radius: hotCoef per tick, tick (s)
 *
 * Reused from other files: minion_summon (totems, wolves: def.minion), self_buff (ghost wolf, bloodlust, majors),
 * interrupt (Rüzgâr Kesişi), heal_bolt (Şifa Atışı), heal_target (Şifalı Dalga, Ruh Arındırma), chain_projectile (Zincir Yıldırım).
 *
 * Not in the engine yet (see the shaman report): Stormkeeper's two-cast counter, Doğa Çabukluğu's instant-cast rule,
 * Enhancement's Windfury proc, the Girdap points-per-hit rule beyond the pip gains on the rows.
 */
import { G } from '../../game/G';
import { BEHAVIORS, type Behavior, type CastCtx } from './behaviors';
import { alliesInRange, healAlly, healFormula, resolveHealTarget } from '../healing';
import type { Actor } from '../../entities/Actor';
import type { Player } from '../../entities/Player';
import type { StatusId } from '../../types/skills';

/** Friendly pick of a heal (healing.ts resolver), the caster when no ally is picked. */
function healPick(c: CastCtx): Player {
  return resolveHealTarget(c.caster, c.aim, false) ?? c.caster;
}

/** The ally a stored pick still stands for: the caster when the pick died meanwhile. */
function pickedAlly(c: CastCtx): Player {
  const a = c.data.ally as Player | undefined;
  return a && !a.isDead && !a.removed ? a : c.caster;
}

/** Gives a status to an ally. A remote player gets the 'pstatus' message its owner applies (monk giveStatus pattern). */
function giveStatus(c: CastCtx, target: Actor, status: StatusId, duration: number, magnitude: number): void {
  if (target.kind === 'player' && !(target as Player).isLocal) {
    const peer = G.net?.peerOfEntity(target.id);
    if (peer) G.net?.sendTo(peer, 'pstatus', { targetId: target.id, status, duration, magnitude, sourceId: c.caster.id });
    return;
  }
  target.statuses.apply(status, duration, { magnitude, sourceId: c.caster.id });
}

/** HP per second of a HoT: hotCoef x the caster's healing, spread over `tick` seconds. */
function hotPerSec(c: CastCtx): number {
  const p = c.def.params ?? {};
  if (!p.hotCoef) return 0;
  return healFormula(c.caster, p.hotCoef).amount / (p.tick ?? 2);
}

// ---- Gel-Git Dalgası (riptide): an instant heal on the picked ally, then the HoT (statuses[0]) for its duration.
const shamanHot: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const target = pickedAlly(c);
    if (c.def.heal?.coef) healAlly(c.caster, target, c.def.heal.coef);
    const st = c.def.statuses?.[0];
    if (st) giveStatus(c, target, st.status, st.duration, hotPerSec(c));
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Zincir Şifa (chain heal): the picked ally, then up to `bounces` injured allies near the last one. Each bounce heals
// `bounceMult` times the one before. A bounce target is healed once.
const chainHeal: Behavior = {
  begin(c) {
    if (!c.remote) c.data.ally = healPick(c);
    return true;
  },
  fire(c) {
    if (c.remote) return;
    const p = c.def.params ?? {};
    const first = pickedAlly(c);
    const coef0 = c.def.heal?.coef ?? 0;
    if (coef0 > 0) healAlly(c.caster, first, coef0);
    const used = new Set<Actor>([first]);
    let last: Actor = first;
    let coef = coef0;
    const bounces = p.bounces ?? 2;
    for (let k = 0; k < bounces; k++) {
      coef *= p.bounceMult ?? 0.7;
      const next = alliesInRange(last, p.bounceRange ?? 10)
        .filter((a) => !used.has(a) && !a.isDead && !a.removed && a.hp < a.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (!next) break;
      used.add(next);
      if (coef > 0) healAlly(c.caster, next, coef);
      last = next;
    }
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Yağmur Fırtınası (healing rain): an instant heal on every injured-or-not ally in the area, then the rain HoT for each.
const rain: Behavior = {
  fire(c) {
    if (c.remote) return;
    const r = c.def.radius ?? 8;
    const coef = c.def.heal?.coef ?? 0;
    const st = c.def.statuses?.[0];
    const per = hotPerSec(c);
    const allies: Actor[] = [c.caster, ...alliesInRange(c.caster, r)];
    const seen = new Set<Actor>();
    for (const a of allies) {
      if (seen.has(a)) continue;
      seen.add(a);
      if (coef > 0) healAlly(c.caster, a as Player, coef);
      if (st) giveStatus(c, a, st.status, st.duration, per);
    }
    c.sys.sfx('buff', c.caster.position);
  },
};

// ---- Şifa Akıntısı Totemi / Gelgit Totemi: summons the totem (minion_summon, the def.minion row), then gives its HoT to every
// ally in the radius (the caster included). Remote replays do nothing; the owner's peer summons the totem.
const streamTotem: Behavior = {
  fire(c) {
    if (c.remote) return;
    BEHAVIORS.minion_summon?.fire?.(c);
    const r = c.def.radius ?? 10;
    const st = c.def.statuses?.[0];
    if (!st) return;
    const per = hotPerSec(c);
    const allies: Actor[] = [c.caster, ...alliesInRange(c.caster, r)];
    const seen = new Set<Actor>();
    for (const a of allies) {
      if (seen.has(a)) continue;
      seen.add(a);
      giveStatus(c, a, st.status, st.duration, per);
    }
    c.sys.sfx('buff', c.caster.position);
  },
};

export const BEHAVIORS_SHAMAN: Record<string, Behavior> = {
  shaman_hot: shamanHot,
  shaman_chain_heal: chainHeal,
  shaman_rain: rain,
  shaman_stream_totem: streamTotem,
};

function installShaman(): void {
  Object.assign(BEHAVIORS, BEHAVIORS_SHAMAN);
}

try {
  installShaman();
} catch {
  queueMicrotask(installShaman);
}
