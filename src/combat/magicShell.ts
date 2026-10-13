/**
 * Anti-Magic Shell state (NC52, docs/kits/necromancer_behaviors.md). A MAGIC-ONLY absorb: it soaks every damage type except physical
 * and true, up to `cap` damage, for as long as the `anti_magic_shell` status lives, and refunds Öz (`rpPerPct` per 1 % of max HP
 * soaked, at most `rpCap` per shell). The generic `shield` absorb (StatusEffects.absorb) is type-blind, so this lives beside it:
 * Combat.hitLocalPlayer calls `absorbMagicShell` once, right before `statuses.absorb`.
 * Pure state + the hook; no imports from combat code (Combat imports this file).
 */
import { G } from '../game/G';
import type { Actor } from '../entities/Actor';
import type { DamageType, EntityId } from '../types/common';

interface Shell {
  left: number;
  soaked: number;
  rpPerPct: number;
  rpCap: number;
  rpGiven: number;
}

const shells = new Map<EntityId, Shell>();

/** Damage types the shell soaks. */
export const isMagic = (type: DamageType): boolean => type !== 'physical' && type !== 'true';

/** Starts (or replaces) a shell on `p`: `cap` damage of absorb. The caller applies the `anti_magic_shell` status itself. */
export function startMagicShell(p: Actor, cap: number, rpPerPct = 1, rpCap = 20): void {
  shells.set(p.id, { left: Math.max(0, cap), soaked: 0, rpPerPct, rpCap, rpGiven: 0 });
}

/** Absorb left in the shell of `p` (0 when none / expired). */
export function magicShellLeft(p: Actor): number {
  const s = shells.get(p.id);
  if (!s) return 0;
  if (!p.statuses.has('anti_magic_shell')) { shells.delete(p.id); return 0; }
  return s.left;
}

/** Total damage the shell of `p` has soaked so far (0 when none). */
export function magicShellSoaked(p: Actor): number {
  return shells.get(p.id)?.soaked ?? 0;
}

/** Ends the shell of `p` (status removed too). */
export function endMagicShell(p: Actor): void {
  shells.delete(p.id);
  try { p.statuses.remove('anti_magic_shell'); } catch { /* ignore */ }
}

/** Combat hook: returns the damage that goes through the shell. Never throws. */
export function absorbMagicShell(p: Actor, amount: number, type: DamageType): number {
  try {
    if (amount <= 0 || !isMagic(type)) return amount;
    const s = shells.get(p.id);
    if (!s) return amount;
    if (!p.statuses.has('anti_magic_shell') || s.left <= 0) { shells.delete(p.id); return amount; }
    const take = Math.min(s.left, amount);
    s.left -= take;
    s.soaked += take;
    // Öz refund: rpPerPct per 1 % of max HP soaked, capped per shell
    const want = Math.min(s.rpCap, (s.soaked / Math.max(1, p.maxHp)) * 100 * s.rpPerPct);
    const give = want - s.rpGiven;
    if (give > 0) {
      s.rpGiven = want;
      G.skills?.addResource(p, give);
    }
    if (s.left <= 0.5) endMagicShell(p);
    return amount - take;
  } catch (e) {
    console.error('[magicShell] absorb failed', e);
    return amount;
  }
}
