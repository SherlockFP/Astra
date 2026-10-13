import type { EnemyDef } from '../types/enemies';
import { COMBAT_FEEL } from './feel';

/**
 * Poise (Duruş, GDD_V2 §3.7): the existing stagger bar, now per EnemyDef. Pure rules; Combat owns the state and the break.
 * Rank defaults x family multiplier; `def.poise` overrides the rank default; elite/mini/boss scale with party size.
 * OWNER: combat module.
 */

const RANK_POISE: Record<string, number> = { swarm: 6, trash: 24, elite: 100, miniboss: 300, boss: 600 };
/** Seconds the enemy is locked against poise damage after a break (GDD_V2 §3.7 table). */
const RANK_LOCK: Record<string, number> = { trash: 8, elite: 12, miniboss: 15, boss: 25 };
/** Share of the target's max HP the Kritik Vuruş adds (GDD_V2 §3.7), before the 20 x W cap. */
const RANK_FINISH_PCT: Record<string, number> = { swarm: 0.25, trash: 0.25, elite: 0.12, miniboss: 0.06, boss: 0.025 };
/** Family multipliers on max poise (GDD_V2 §3.7). Families not listed are x1.0. */
const FAMILY_POISE: Partial<Record<string, number>> = { golem: 1.5, dragon: 1.3, beast: 0.8, ghost: 0.6 };
/** Hyper-armour per rank (GDD_V2 §3.7 table): the share of a heavy windup that cannot be flinched. */
const RANK_HYPER_ARMOR: Partial<Record<string, number>> = { trash: 0, elite: 0.5, miniboss: 0.8, boss: 1 };
/** Parry poise damage per rank (GDD_V2 §3.5). Trash and swarm break instantly (see parryPoise). */
const PARRY_POISE: Partial<Record<string, number>> = { elite: 60, miniboss: 90, boss: 120 };

/** Swarm = role 'swarm' (GDD_CONTENT: rank 'trash' + swarm role). */
export function isSwarm(def: EnemyDef): boolean {
  return String(def.role) === 'swarm';
}

/** Table key: swarm (a trash-rank role) has its own poise row. */
function rankKey(def: EnemyDef): string {
  return isSwarm(def) ? 'swarm' : def.rank;
}

/** Party factor for elite / mini / boss poise: x(1 + 0.5 (n - 1)). */
export function partyPoiseFactor(def: EnemyDef, partySize: number): number {
  const scales = def.rank === 'elite' || def.rank === 'miniboss' || def.rank === 'boss';
  return scales ? 1 + 0.5 * (Math.max(1, partySize) - 1) : 1;
}

/** Max poise of an enemy for a party of `partySize` (0 = no poise bar: stanceBreakable false or unknown rank). */
export function poiseMax(def: EnemyDef, partySize: number): number {
  if (def.stanceBreakable === false) return 0;
  const base = def.poise ?? (RANK_POISE[rankKey(def)] ?? 0) * (FAMILY_POISE[String(def.family ?? '')] ?? 1);
  if (!base) return 0;
  return base * partyPoiseFactor(def, partySize);
}

export function poiseRegenRate(def: EnemyDef): number {
  return def.poiseRegen ?? 0.1;
}

export function poiseDelay(def: EnemyDef): number {
  return def.poiseDelay ?? 3;
}

/** Seconds a broken enemy stays immune to poise damage after its break window (0 for swarm). */
export function breakLock(def: EnemyDef): number {
  return isSwarm(def) ? 0 : RANK_LOCK[def.rank] ?? 0;
}

/** Hyper-armour fraction 0..1 (`def.hyperArmor` overrides the rank default). Swarm never has it. */
export function hyperArmorOf(def: EnemyDef): number {
  if (isSwarm(def)) return 0;
  const v = def.hyperArmor ?? RANK_HYPER_ARMOR[def.rank] ?? 0;
  return Math.max(0, Math.min(1, v));
}

/** Break window: 2.0 s, or the 0.4 s swarm flinch. */
export function breakSeconds(def: EnemyDef): number {
  return isSwarm(def) ? COMBAT_FEEL.poiseSwarmFlinch : COMBAT_FEEL.poiseBreakSec;
}

/** Poise dealt by a parry. Trash and swarm return Infinity (instant break, 0.8 s recoil); bosses are never recoiled. */
export function parryPoise(def: EnemyDef, partySize: number): number {
  if (isSwarm(def) || def.rank === 'trash') return Infinity;
  const base = PARRY_POISE[def.rank] ?? 0;
  if (def.rank === 'boss') return base * Math.min(3, partyPoiseFactor(def, partySize));
  return base;
}

/** Kritik Vuruş bonus (share of the target's max HP) by rank. */
export function finisherPctMaxHp(def: EnemyDef): number {
  return RANK_FINISH_PCT[rankKey(def)] ?? 0.12;
}
