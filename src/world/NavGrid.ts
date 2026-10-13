import * as THREE from 'three';

/**
 * Walkability grid on the XZ plane for collision, line of sight and A* pathfinding.
 * Builders (DungeonBuilder/TownBuilder) fill it; actors call resolveCircle() after moving.
 * cell value: 0 = blocked, 1 = walkable.
 */
export class NavGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cells: Uint8Array;

  constructor(opts: { originX: number; originZ: number; width: number; depth: number; cellSize?: number; walkable?: boolean }) {
    this.cellSize = opts.cellSize ?? 1;
    this.originX = opts.originX;
    this.originZ = opts.originZ;
    this.cols = Math.ceil(opts.width / this.cellSize);
    this.rows = Math.ceil(opts.depth / this.cellSize);
    this.cells = new Uint8Array(this.cols * this.rows).fill(opts.walkable ? 1 : 0);
  }

  // ---- coordinates ----
  cx(x: number): number { return Math.floor((x - this.originX) / this.cellSize); }
  cz(z: number): number { return Math.floor((z - this.originZ) / this.cellSize); }
  centerX(c: number): number { return this.originX + (c + 0.5) * this.cellSize; }
  centerZ(r: number): number { return this.originZ + (r + 0.5) * this.cellSize; }
  inBounds(c: number, r: number): boolean { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; }

  cell(c: number, r: number): number {
    return this.inBounds(c, r) ? this.cells[r * this.cols + c] : 0;
  }
  setCell(c: number, r: number, v: number): void {
    if (this.inBounds(c, r)) this.cells[r * this.cols + c] = v;
  }

  isWalkable(x: number, z: number): boolean {
    return this.cell(this.cx(x), this.cz(z)) > 0;
  }

  /** Mark a world-space axis-aligned rectangle. */
  setRect(x0: number, z0: number, x1: number, z1: number, walkable: boolean): void {
    const c0 = this.cx(Math.min(x0, x1)), c1 = this.cx(Math.max(x0, x1) - 1e-6);
    const r0 = this.cz(Math.min(z0, z1)), r1 = this.cz(Math.max(z0, z1) - 1e-6);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.setCell(c, r, walkable ? 1 : 0);
  }

  /** Mark a world-space circle (props, pillars). */
  setCircle(x: number, z: number, radius: number, walkable: boolean): void {
    const c0 = this.cx(x - radius), c1 = this.cx(x + radius);
    const r0 = this.cz(z - radius), r1 = this.cz(z + radius);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        if (Math.hypot(this.centerX(c) - x, this.centerZ(r) - z) <= radius + this.cellSize * 0.35) this.setCell(c, r, walkable ? 1 : 0);
      }
  }

  /**
   * Push a circle out of blocked cells (in place). Returns true if a collision happened.
   * Call after integrating movement.
   */
  resolveCircle(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const c0 = this.cx(pos.x - radius), c1 = this.cx(pos.x + radius);
      const r0 = this.cz(pos.z - radius), r1 = this.cz(pos.z + radius);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          if (this.cell(c, r)) continue;
          const minX = this.originX + c * this.cellSize, minZ = this.originZ + r * this.cellSize;
          const px = Math.max(minX, Math.min(pos.x, minX + this.cellSize));
          const pz = Math.max(minZ, Math.min(pos.z, minZ + this.cellSize));
          let dx = pos.x - px, dz = pos.z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 < 1e-8) {
            // center inside a blocked cell: push towards nearest walkable neighbour
            const n = this.nearestWalkable(pos.x, pos.z, 6);
            if (n) { pos.x = n.x; pos.z = n.z; }
            hit = moved = true;
            continue;
          }
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          pos.x += dx * (radius - d);
          pos.z += dz * (radius - d);
          hit = moved = true;
        }
      if (!moved) break;
    }
    return hit;
  }

  /** Distance along a->b until the first blocked cell (DDA). Returns 1 if clear (fraction of the segment). */
  raycast(ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return 1;
    const step = this.cellSize * 0.25;
    const n = Math.ceil(len / step);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.isWalkable(ax + dx * t, az + dz * t)) return (i - 1) / n;
    }
    return 1;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return this.raycast(ax, az, bx, bz) >= 1;
  }

  nearestWalkable(x: number, z: number, maxRadiusCells = 12): { x: number; z: number } | null {
    const c = this.cx(x), r = this.cz(z);
    if (this.cell(c, r)) return { x, z };
    for (let rad = 1; rad <= maxRadiusCells; rad++)
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.cell(c + dc, r + dr)) return { x: this.centerX(c + dc), z: this.centerZ(r + dr) };
        }
    return null;
  }

  /** Random walkable point within radius (for wander/scatter). rand() in [0,1). */
  randomNear(x: number, z: number, radius: number, rand: () => number = Math.random): { x: number; z: number } {
    for (let i = 0; i < 20; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isWalkable(px, pz) && this.lineOfSight(x, z, px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }

  /**
   * A* (8-directional, no corner cutting) + line-of-sight string pulling.
   * Returns world waypoints (excluding start) or null if unreachable within maxNodes.
   */
  findPath(from: { x: number; z: number }, to: { x: number; z: number }, maxNodes = 6000): THREE.Vector3[] | null {
    if (this.lineOfSight(from.x, from.z, to.x, to.z)) return [new THREE.Vector3(to.x, 0, to.z)];
    const start = this.nearestWalkable(from.x, from.z, 4);
    const goal = this.nearestWalkable(to.x, to.z, 6);
    if (!start || !goal) return null;
    const sc = this.cx(start.x), sr = this.cz(start.z), gc = this.cx(goal.x), gr = this.cz(goal.z);
    const W = this.cols;
    const sIdx = sr * W + sc, gIdx = gr * W + gc;
    const g = new Map<number, number>([[sIdx, 0]]);
    const came = new Map<number, number>();
    const open = new MinHeap();
    const hfn = (c: number, r: number) => {
      const dx = Math.abs(c - gc), dz = Math.abs(r - gr);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    open.push(sIdx, hfn(sc, sr));
    const closed = new Set<number>();
    let expanded = 0;
    while (open.size) {
      const cur = open.pop()!;
      if (cur === gIdx) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxNodes) return null;
      const c = cur % W, r = (cur - c) / W;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nc = c + dx, nr = r + dz;
          if (!this.cell(nc, nr)) continue;
          if (dx && dz && (!this.cell(c + dx, r) || !this.cell(c, r + dz))) continue;
          const ni = nr * W + nc;
          if (closed.has(ni)) continue;
          const ng = g.get(cur)! + (dx && dz ? 1.4142 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            open.push(ni, ng + hfn(nc, nr));
          }
        }
    }
    if (sIdx === gIdx) return [new THREE.Vector3(goal.x, 0, goal.z)];
    if (!came.has(gIdx)) return null;
    const cellsPath: number[] = [];
    for (let k = gIdx; k !== sIdx; k = came.get(k)!) cellsPath.push(k);
    cellsPath.reverse();
    const pts = cellsPath.map((k) => new THREE.Vector3(this.centerX(k % W), 0, this.centerZ(Math.floor(k / W))));
    pts[pts.length - 1] = new THREE.Vector3(goal.x, 0, goal.z);
    // string pulling
    const out: THREE.Vector3[] = [];
    let ax = from.x, az = from.z, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineOfSight(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }

  /** Debug texture-friendly dump (1 byte per cell). */
  toImageData(): ImageData {
    const img = new ImageData(this.cols, this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i] ? 255 : 0;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    return img;
  }
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number { return this.ids.length; }
  push(id: number, key: number): void {
    this.ids.push(id); this.keys.push(key);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p); i = p;
    }
  }
  pop(): number | undefined {
    if (!this.ids.length) return undefined;
    const top = this.ids[0];
    const lastId = this.ids.pop()!, lastKey = this.keys.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId; this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < this.ids.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.ids.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
