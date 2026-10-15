import { Graveyard } from '../../entities/interactables/Graveyard';
import type { Pt, WorldCtx } from './util';

/**
 * Mezarlıklar (WoW graveyards, spirit healers): the release points of the dead on an open-world map. Released players appear at the
 * graveyard nearest the body that no living camp stands within GRAVEYARD_CAMP_M of. Local per peer (every peer releases its own
 * character). Data: data/world/graveyards.ts (GraveyardDef). OWNER: scenes module.
 */

/** A camp (or patrol) this close to a graveyard (m, centre to centre) keeps the graveyard out of the release choice. */
export const GRAVEYARD_CAMP_M = 35;

export interface GraveyardSpot { id: string; name: string; x: number; z: number }

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Nearest graveyard to `from` (m) that no living camp centre stands within GRAVEYARD_CAMP_M of. When every graveyard is blocked, the
 * nearest one of all (a release always has a place). Null when the map has no graveyard.
 */
export function nearestGraveyard(graves: readonly GraveyardSpot[], from: Pt, livingCamps: readonly Pt[]): GraveyardSpot | null {
  let free: GraveyardSpot | null = null;
  let freeD = Infinity;
  let any: GraveyardSpot | null = null;
  let anyD = Infinity;
  for (const g of graves) {
    const d = dist(g, from);
    if (d < anyD) {
      any = g;
      anyD = d;
    }
    if (d < freeD && livingCamps.every((c) => dist(c, g) >= GRAVEYARD_CAMP_M)) {
      free = g;
      freeD = d;
    }
  }
  return free ?? any;
}

export class GraveyardNetwork {
  private spots: GraveyardSpot[] = [];

  constructor(private readonly ctx: WorldCtx) {}

  /** Number of graveyards of the map. */
  get size(): number {
    return this.spots.length;
  }

  /** Spawns a spirit healer at every graveyard of the map (local entities). Resolves when all are loaded. */
  async place(): Promise<number> {
    const { ctx } = this;
    this.spots = (ctx.ext.graveyards ?? []).map((g) => {
      const pt = ctx.snapTile(g.pos[0], g.pos[1], 8);
      return { id: g.id, name: g.name, x: pt.x, z: pt.z };
    });
    await Promise.all(
      this.spots.map((s) => {
        const m = new Graveyard(ctx.world.allocLocalId(), s.name);
        m.position.set(s.x, ctx.world.groundY(s.x, s.z), s.z);
        return m.load().then(
          () => {
            ctx.world.add(m);
          },
          (err) => console.warn(`[graveyards] ${s.id} failed to load`, err),
        );
      }),
    );
    return this.spots.length;
  }

  /** Release point (world m) for a dead player whose body lies at `from`; null when the map has no graveyard. */
  release(from: Pt, livingCamps: readonly Pt[]): Pt | null {
    const g = nearestGraveyard(this.spots, from, livingCamps);
    return g ? { x: g.x, z: g.z } : null;
  }
}
