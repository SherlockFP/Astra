/**
 * Spatial bucket index of the camps of an open-world map (docs/ENGINE_BIGMAPS.md). PURE (no three.js, no game state).
 *
 * CampDirector used to test every camp against every player twice a second. That is fine for 80 camps, but a 4 km zone has
 * thousands, nearly all of them asleep far from everybody. A camp only needs attention when it is active, waiting for its respawn
 * timer, or a player is within `activateM + radius` of it, so the director asks this index for the third group and keeps the other
 * two as small sets. `near` is a SUPERSET of the camps that pass the exact distance test (the director still tests exactly).
 */
export interface IndexedCamp { cx: number; cz: number; radius: number }

export class CampIndex {
  private readonly buckets = new Map<number, number[]>();
  private readonly maxRadius: number;

  constructor(camps: readonly IndexedCamp[], private readonly cell = 128) {
    let maxR = 0;
    camps.forEach((c, i) => {
      maxR = Math.max(maxR, c.radius);
      const k = CampIndex.key(Math.floor(c.cx / cell), Math.floor(c.cz / cell));
      let l = this.buckets.get(k);
      if (!l) this.buckets.set(k, (l = []));
      l.push(i);
    });
    this.maxRadius = maxR;
  }

  private static key(c: number, r: number): number {
    return (c + 32768) * 65536 + (r + 32768);
  }

  /** Slots (indices into the camps array) of camps that may lie within `reach` m of the radius edge of any point, ascending. */
  near(points: readonly { x: number; z: number }[], reach: number): number[] {
    const out = new Set<number>();
    const span = reach + this.maxRadius;
    for (const p of points) {
      const c0 = Math.floor((p.x - span) / this.cell), c1 = Math.floor((p.x + span) / this.cell);
      const r0 = Math.floor((p.z - span) / this.cell), r1 = Math.floor((p.z + span) / this.cell);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const l = this.buckets.get(CampIndex.key(c, r));
          if (l) for (const i of l) out.add(i);
        }
    }
    return [...out].sort((a, b) => a - b);
  }
}
