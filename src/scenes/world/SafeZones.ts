import { tileToWorld, type WorldCtx } from './util';

/**
 * Village safe boxes (GDD_OPENWORLD §2.2). One query, `isSafe(x, z)`: enemies never aggro a player inside a box (the host's
 * EnemyDirector gets this through setSafeQuery), and combat / loot read the same query. A box is `VillageDef.safe` when the
 * data gives one, else the walled `bounds` around the village centre. OWNER: scenes module.
 */
export class SafeZones {
  private readonly boxes: { name: string; cx: number; cz: number; hx: number; hz: number }[];

  constructor(ctx: WorldCtx) {
    this.boxes = ctx.ext.villages.map((v) => ({
      name: v.name,
      cx: tileToWorld(v.center[0]),
      cz: tileToWorld(v.center[1]),
      hx: v.safe?.halfX ?? v.bounds[0],
      hz: v.safe?.halfZ ?? v.bounds[1],
    }));
  }

  /** True inside any village safe box. Never throws. */
  isSafe(x: number, z: number): boolean {
    for (const b of this.boxes) if (Math.abs(x - b.cx) <= b.hx && Math.abs(z - b.cz) <= b.hz) return true;
    return false;
  }

  /** Name of the village whose box holds (x, z), or null. */
  villageAt(x: number, z: number): string | null {
    for (const b of this.boxes) if (Math.abs(x - b.cx) <= b.hx && Math.abs(z - b.cz) <= b.hz) return b.name;
    return null;
  }
}
