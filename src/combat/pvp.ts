import { pvpHitCap } from '../systems/PvpRules';

/**
 * ARENA COMBAT RULES (GDD_PVP_FINDER §3.3.2, §3.6; package PV-01). PURE: no G, no three.js, no clocks of its own (callers pass time),
 * so the node sim (dev/combat-sim/arena.mjs) and the game get the same numbers. The wiring lives in scenes/arena/ArenaController.ts
 * (hit path: hook into systems/Pvp.ts `setPvpHook`, the same attacker-computed / host-vetted / victim-mitigated path the open-world PvP
 * uses) and in Combat.applyHeal (dampening multiplier, `arenaHealMult`).
 *
 * Open-world PvP keeps its own numbers (systems/PvpRules.ts `PVP`); arena values are here and only apply while an arena match runs.
 */

export const ARENA_PVP = {
  /** Arena player -> player damage multiplier (the open world uses PVP.DAMAGE_MULT 0.4). */
  damageMult: 0.34,
  /** Arena: no item-level scaling here (PvE / PvP gear is normalised in StatCalc, GDD §3.7). */
  ilvlScale: null,
  /** Healing received x (1 - dampenPct / 100). */
  healDampen: true,
  /** No single hit removes more than this fraction of max HP. */
  maxHitFracOfMaxHp: 0.45,
  executeCapFrac: 0.25,
  /** Host cap per hit = max(120, hitCapPerIlvl x attacker ilvl) x 2.5 (crit headroom). The shared vet (net/guard.vetPvpHit) caps by level. */
  hitCapPerIlvl: 60,
  /** pvpResilience counts at most this much. */
  resilienceCap: 0.4,
  knockbackMult: 0.5,
  dodgeBreaksRootSlow: true,
} as const;

/** Dampening (Yıpranma, §3.3.2): all healing received and absorbs of players in the arena scale down with the round's live time. */
export const ARENA_DAMP = { startSec: 120, perMinPct: 8, capPct: 50 } as const;

/** Dampening percent (0..50) for `liveSec` seconds since the gates opened this round. */
export function dampenPct(liveSec: number): number {
  if (!(liveSec > ARENA_DAMP.startSec)) return 0;
  return Math.min(ARENA_DAMP.capPct, ((liveSec - ARENA_DAMP.startSec) / 60) * ARENA_DAMP.perMinPct);
}

// ---------------------------------------------------------------------------------------------------------------------
// shared arena combat state (written by the ArenaController, read by Combat)
// ---------------------------------------------------------------------------------------------------------------------

const arenaState = { active: false, damp: 0 };

/** ArenaController: an arena match is running (`active`) with this dampening percentage (host value, last received). */
export function setArenaCombat(active: boolean, dampPct = 0): void {
  arenaState.active = active;
  arenaState.damp = active ? Math.max(0, Math.min(ARENA_DAMP.capPct, Number.isFinite(dampPct) ? dampPct : 0)) : 0;
}
export const arenaCombatActive = (): boolean => arenaState.active;
export const arenaDampPct = (): number => arenaState.damp;
/** Multiplier for healing / absorbs the local player receives (1 outside arenas and at 0 % dampening). */
export const arenaHealMult = (): number => (arenaState.active ? 1 - arenaState.damp / 100 : 1);

// ---------------------------------------------------------------------------------------------------------------------
// damage
// ---------------------------------------------------------------------------------------------------------------------

/** Attacker side, only against players: raw roll x (1 + pvpPower). */
export function pvpOutgoing(raw: number, attackerPvpPower: number): number {
  return raw * (1 + Math.max(0, Number.isFinite(attackerPvpPower) ? attackerPvpPower : 0));
}

/** GDD §3.6 verbatim: damage after armour / resist, the arena multiplier, resilience and the max-hit cap. Minimum 1. */
export function pvpIncoming(args: { mitigated: number; victimPvpResilience: number; inArena: boolean; maxHp: number }): number {
  let v = args.mitigated * (args.inArena ? ARENA_PVP.damageMult : 0.4);
  v *= 1 - Math.min(ARENA_PVP.resilienceCap, Math.max(0, args.victimPvpResilience || 0));
  v = Math.min(v, ARENA_PVP.maxHitFracOfMaxHp * Math.max(1, args.maxHp));
  return Math.max(1, Math.round(v));
}

/**
 * Victim side for the hook path: the hit that arrives is the attacker's raw roll (already x pvpPower, vetted by the host). This turns it
 * into the amount handed to Combat.hitLocalPlayer, which then applies i-frames, parry, dodge, block, armour and resists (the 'mitigate'
 * step of §3.6 runs inside hitLocalPlayer, after this scaling). Capped by the attacker level, then by the max-hit fraction of max HP.
 */
export function arenaHitAmount(
  a: { raw: number; attackerLevel: number; victimPvpResilience: number; maxHp: number },
  monsterHP: (level: number) => number,
): number {
  const capped = Math.min(Math.max(0, Number.isFinite(a.raw) ? a.raw : 0), pvpHitCap(a.attackerLevel, monsterHP));
  return pvpIncoming({ mitigated: capped, victimPvpResilience: a.victimPvpResilience, inArena: true, maxHp: a.maxHp });
}

// ---------------------------------------------------------------------------------------------------------------------
// crowd control against players (GDD_LIFE §7.4 table, §3.6)
// ---------------------------------------------------------------------------------------------------------------------

export type CcGroup = 'hard' | 'fear' | 'root' | 'silence';
/** DR groups: stun / freeze / knockdown share one; fear (and blind) one; root; silence. Slows are not on DR. */
export const CC_GROUP: Readonly<Record<string, CcGroup>> = {
  stun: 'hard', freeze: 'hard', knockdown: 'hard', fear: 'fear', blind: 'fear', root: 'root', silence: 'silence',
};
/** Duration cap (s) of one application against a player, before DR. */
export const CC_CAP_SEC: Readonly<Record<string, number>> = {
  stun: 3, freeze: 2.5, knockdown: 1.2, fear: 2.5, blind: 2.5, root: 3, silence: 3,
};
/** 100 % / 50 % / 25 % / immune, window refreshed by every application. */
export const CC_DR = { steps: [1, 0.5, 0.25, 0] as readonly number[], windowSec: 18, ccReductionCap: 0.4, slowFloor: 0.5 } as const;

/** Slow strength (0..1 move speed loss) is capped at the floor: no player is slowed more than 50 %. Slows are not on DR. */
export const clampSlow = (magnitude: number): number => Math.min(CC_DR.slowFloor, Math.max(0, Number.isFinite(magnitude) ? magnitude : 0));

/**
 * Diminishing returns of ONE victim. The victim's peer owns it (it applies the statuses); `now` is a seconds clock. `apply` returns the
 * duration to apply (0 = immune or not a hard CC), and advances the DR state only when something is applied.
 */
export class CcDiminish {
  private readonly g = new Map<CcGroup, { n: number; t: number }>();

  /** How many applications of `group` count inside the window right now. */
  count(group: CcGroup, now: number): number {
    const e = this.g.get(group);
    return e && now - e.t <= CC_DR.windowSec ? e.n : 0;
  }

  apply(status: string, baseSec: number, now: number, ccReduction = 0): number {
    const group = CC_GROUP[status];
    if (!group) return Math.max(0, baseSec);
    const cap = CC_CAP_SEC[status] ?? 3;
    const n = this.count(group, now);
    const mult = CC_DR.steps[Math.min(n, CC_DR.steps.length - 1)];
    if (mult <= 0) return 0;
    const red = Math.min(CC_DR.ccReductionCap, Math.max(0, ccReduction || 0));
    const dur = Math.min(cap, Math.max(0, baseSec)) * mult * (1 - red);
    if (dur <= 0) return 0;
    this.g.set(group, { n: n + 1, t: now });
    return dur;
  }

  clear(): void {
    this.g.clear();
  }
}
