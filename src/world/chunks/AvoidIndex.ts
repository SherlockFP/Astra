/**
 * Spatial hash over the "avoid" circles of a zone (villages, landmarks, camps, POIs...). DungeonBuild.isAvoided scans the whole
 * list, fine for a few hundred circles; a 4 km zone has thousands and the chunk generator asks hundreds of thousands of times,
 * so it asks here instead (bucket lookup). PURE. A circle is stored in every bucket its radius (+ maxPad) can reach, so a query
 * only reads the bucket of the point and still answers exactly: hit(x, z, pad) === some circle has dist < r + pad, for pad <= maxPad.
 */
export interface AvoidCircle { x: number; z: number; r: number }

export class AvoidIndex {
  private readonly buckets = new Map<number, AvoidCircle[]>();
  private count = 0;

  constructor(private readonly list: readonly AvoidCircle[], private readonly cell = 32, readonly maxPad = 16) {
    this.rebuild();
  }

  private static key(c: number, r: number): number {
    return (c + 32768) * 65536 + (r + 32768);
  }

  /** Re-index when the list grew since the last build (hand-placed content is added during the map build). */
  sync(): void {
    if (this.list.length !== this.count) this.rebuild();
  }

  private rebuild(): void {
    this.buckets.clear();
    const cell = this.cell;
    for (const a of this.list) {
      const reach = a.r + this.maxPad;
      const c0 = Math.floor((a.x - reach) / cell), c1 = Math.floor((a.x + reach) / cell);
      const r0 = Math.floor((a.z - reach) / cell), r1 = Math.floor((a.z + reach) / cell);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const k = AvoidIndex.key(c, r);
          let l = this.buckets.get(k);
          if (!l) this.buckets.set(k, (l = []));
          l.push(a);
        }
    }
    this.count = this.list.length;
  }

  hit(x: number, z: number, pad: number): boolean {
    const l = this.buckets.get(AvoidIndex.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (!l) return false;
    for (const a of l) if (Math.hypot(a.x - x, a.z - z) < a.r + pad) return true;
    return false;
  }
}
