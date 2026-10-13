/**
 * KIT PK-ROGUE E8 (docs/kits/casters-rogue.md §8b, §g). Simya Bağı (`alchemy_link`): every damaging hit of the Simyacı heals each
 * linked ally for 46 % of that damage. The first 5 injured linked allies get the full share, the rest x0.5 (lowest HP first).
 * Heals go through the existing heal channel (healing.ts healAmount). Called by Combat.kitHitHooks after each landed direct hit
 * of a rogue_alchemist (DoT ticks do not pulse the link).
 */
import type { Player } from '../entities/Player';
import { healAmount } from './healing';

export const LINK_FRACTION = 0.46;
export const LINK_FULL_TARGETS = 5;
export const LINK_BEYOND = 0.5;

/** Linked allies of the Simyacı (alive, not the caster, carrying the `alchemy_link` status). */
export function linkedAllies(caster: Player, allies: readonly Player[]): Player[] {
  return allies.filter((a) => a !== caster && !a.isDead && a.statuses.has('alchemy_link'));
}

/**
 * Applies one Simya Bağı pulse for `damage` dealt by the Simyacı. Returns the total healing done.
 * Pure selection rule + healAmount per ally; the caller passes the party (or any ally list).
 */
export function applyAlchemyLink(caster: Player, damage: number, allies: readonly Player[]): number {
  if (!(damage > 0)) return 0;
  const injured = linkedAllies(caster, allies)
    .filter((a) => a.hp < a.maxHp)
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  let total = 0;
  injured.forEach((a, i) => {
    const share = damage * LINK_FRACTION * (i < LINK_FULL_TARGETS ? 1 : LINK_BEYOND);
    total += healAmount(caster, a, share, true);
  });
  return total;
}
