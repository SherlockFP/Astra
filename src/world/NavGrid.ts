import * as THREE from 'three';
import { F, VERT, type Heightfield } from './Heightfield';

/**
 * What NavGrid needs from the height model (docs/ENGINE_VERTICALITY.md §4-§5). `rimAt` is the rim policy of the HIGH side of
 * a drop (HeightArea.rim, supplied by DungeonBuilder); absent => 'rail'.
 */
export type NavHeightSource = Pick<Heightfield, 'groundY' | 'flagsAt'> & {
  rimAt?(x: number, z: number): 'rail' | 'ledge' | 'none';
};

/** NAV_F bits = the F flags of Heightfield.ts. Re-exported under the old name for tools/nav-vert-check.mjs. */
export { F as NAV_F };
const EPS = 1e-3;

/**
 * Walkability grid on the XZ plane for collision, line of sight and A* pathfinding.
 * Builders (DungeonBuilder/TownBuilder) fill it; actors call resolveCircle() after moving.
 * cell value: 0 = blocked, 1 = walkable.
 *
 * Vertical grids (dungeons with `vertical: true`) additionally carry per-cell floor heights, F flags and connected
 * regions (attachHeights). Every vertical branch is gated on `floor !== null`; flat grids take the legacy code paths.
 */
/** Cells per side of the minimap / world map images (docs/ENGINE_BIGMAPS.md #22): a 1600 m zone draws at 2 m per pixel. */
export const MAP_MAX_PX = 800;

/** The walkability grid the map images are drawn from: the nav grid itself up to MAP_MAX_PX cells per side, else a downsampled copy. */
export interface MapGrid { cols: number; rows: number; cellSize: number; cells: Uint8Array; /** nav cells per map cell per side */ factor: number }
export function mapGridOf(nav: NavGrid): MapGrid {
  const f = Math.max(1, Math.ceil(Math.max(nav.cols, nav.rows) / MAP_MAX_PX));
  if (f === 1) return { cols: nav.cols, rows: nav.rows, cellSize: nav.cellSize, cells: nav.cells, factor: 1 };
  // a map cell is walkable when at least half of its nav cells are: walls stay visible, thin gaps close
  return { ...nav.downsample(f, 0.5), factor: f };
}

export class NavGrid {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly originX: number;
  readonly originZ: number;
  readonly cells: Uint8Array;
  /** Static floor height per 1 m cell (absolute metres). null on flat grids. */
  floor: Float32Array | null = null;
  /** NAV_F bits per 1 m cell. null on flat grids. */
  flags: Uint8Array | null = null;
  /** Connected component id per standable cell (0 = none). null on flat grids. */
  region: Uint16Array | null = null;
  /** Live height source (lifts, analytic slopes). null on flat grids. */
  hf: NavHeightSource | null = null;
  /** Open-world rolling terrain (attachTerrain): raycastY also stops a ray that dips under the ground. */
  terrain = false;

  constructor(opts: { originX: number; originZ: number; width: number; depth: number; cellSize?: number; walkable?: boolean }) {
    this.cellSize = opts.cellSize ?? 1;
    this.originX = opts.originX;
    this.originZ = opts.originZ;
    this.cols = Math.ceil(opts.width / this.cellSize);
    this.rows = Math.ceil(opts.depth / this.cellSize);
    this.cells = new Uint8Array(this.cols * this.rows).fill(opts.walkable ? 1 : 0);
  }

  get vertical(): boolean { return this.floor !== null; }

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

  /** Raw collision walkability. VOID cells (vertical) are walkable for physics (players fall) but not for planning. */
  isWalkable(x: number, z: number): boolean {
    const c = this.cx(x), r = this.cz(z);
    if (this.cell(c, r) <= 0) return false;
    if (this.flags && (this.flags[r * this.cols + c] & F.VOID)) return false;
    return true;
  }

  /** Open and not a void/ledge cell (§5.2). Flat grid: cell > 0. */
  isStandable(x: number, z: number): boolean {
    return this.standableCell(this.cx(x), this.cz(z));
  }

  private standableCell(c: number, r: number): boolean {
    if (this.cell(c, r) <= 0) return false;
    if (!this.flags) return true;
    return !(this.flags[r * this.cols + c] & (F.VOID | F.LEDGE));
  }

  /** A* / region node: standable and not a lift platform (lifts never join regions). Flat grid: cell > 0. */
  private pathCell(c: number, r: number): boolean {
    if (this.cell(c, r) <= 0) return false;
    if (!this.flags) return true;
    return !(this.flags[r * this.cols + c] & (F.VOID | F.LEDGE | F.LIFT));
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

  /**
   * Floor height at x,z (absolute metres). Dynamic: lifts and analytic slopes via the Heightfield.
   * Flat grid: 0.
   */
  floorAt(x: number, z: number): number {
    return this.hf ? this.hf.groundY(x, z) : 0;
  }

  /** NAV_F bits at x,z (0 on flat grids or outside the grid). */
  flagsAt(x: number, z: number): number {
    if (!this.flags) return 0;
    const c = this.cx(x), r = this.cz(z);
    return this.inBounds(c, r) ? this.flags[r * this.cols + c] : 0;
  }

  /** Connected region id at x,z (0 = none / flat grid). */
  regionAt(x: number, z: number): number {
    if (!this.region) return 0;
    const c = this.cx(x), r = this.cz(z);
    return this.inBounds(c, r) ? this.region[r * this.cols + c] : 0;
  }

  /** True when both points lie in the same non-zero region. Flat grid (no regions): always true. */
  sameRegion(a: { x: number; z: number }, b: { x: number; z: number }): boolean {
    if (!this.region) return true;
    const ra = this.regionAt(a.x, a.z);
    return ra !== 0 && ra === this.regionAt(b.x, b.z);
  }

  /**
   * Attach heights to this grid (vertical dungeons only): fills floor/flags from the Heightfield, runs the rim pass
   * (§5.3) and the region flood (§5.5).
   */
  attachHeights(hf: NavHeightSource): void {
    const N = this.cols * this.rows;
    const floor = new Float32Array(N), flags = new Uint8Array(N);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const x = this.centerX(c), z = this.centerZ(r);
        floor[i] = hf.groundY(x, z);
        flags[i] = hf.flagsAt(x, z);
      }
    this.hf = hf;
    this.floor = floor;
    this.flags = flags;
    this.region = null;
    this.applyRims(hf);
    this.buildRegions();
  }

  /**
   * Open-world terrain (docs/ENGINE_BIGMAPS.md section 10): fills `floor` from the relief (1 m cell centres), no flags, no rim pass,
   * no regions. The relief's grade limit (<= 0.4) keeps every 1 m step under VERT.STEP_UP, so nothing needs rails or cliffs, and
   * skipping the rim pass and the flood fill keeps a 1.9 M cell grid at about 100 ms. Makes `vertical` true (walkLine, resolveMove,
   * raycastY and the rise rule of findPath apply); sameRegion is always true.
   */
  attachTerrain(src: NavHeightSource): void {
    const N = this.cols * this.rows;
    const floor = new Float32Array(N);
    for (let r = 0; r < this.rows; r++) {
      const z = this.centerZ(r);
      for (let c = 0; c < this.cols; c++) floor[r * this.cols + c] = src.groundY(this.centerX(c), z);
    }
    this.hf = src;
    this.floor = floor;
    this.flags = new Uint8Array(N);
    this.region = null;
    this.terrain = true;
  }

  /** Open, not void/slope/lift: a cell the rim pass may act on. */
  private rimEligible(c: number, r: number): boolean {
    if (this.cell(c, r) <= 0) return false;
    return !(this.flags![r * this.cols + c] & (F.VOID | F.SLOPE | F.LIFT));
  }

  /** §5.3: a drop > STEP_UP to a lower open neighbour is finished by a rail (solid) or a ledge (LEDGE flag) on the high side. */
  private applyRims(hf: NavHeightSource): void {
    const floor = this.floor!, flags = this.flags!;
    const cut: number[] = [], ledge: number[] = [];
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        if (!this.rimEligible(c, r)) continue;
        const i = r * this.cols + c;
        const nbrs: [number, number][] = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
        let drop = false;
        for (const [nc, nr] of nbrs) {
          if (!this.rimEligible(nc, nr)) continue;
          if (floor[i] - floor[nr * this.cols + nc] > VERT.STEP_UP + EPS) { drop = true; break; }
        }
        if (!drop) continue;
        // a neighbouring slope whose end meets this cell within STEP_UP is where the stair/ramp attaches: no rim.
        // The slope end is sampled half a cell from this cell, on the shared edge.
        let attached = false;
        for (const [nc, nr] of nbrs) {
          if (!this.inBounds(nc, nr) || !(flags[nr * this.cols + nc] & F.SLOPE)) continue;
          const px = (this.centerX(c) + this.centerX(nc)) / 2, pz = (this.centerZ(r) + this.centerZ(nr)) / 2;
          if (Math.abs(hf.groundY(px, pz) - floor[i]) <= VERT.STEP_UP + EPS) { attached = true; break; }
        }
        if (attached) continue;
        const rim = hf.rimAt ? hf.rimAt(this.centerX(c), this.centerZ(r)) : 'rail';
        if (rim === 'rail') cut.push(i);
        else if (rim === 'ledge') ledge.push(i);
      }
    // apply after the scan so every decision sees the pre-pass state
    for (const i of cut) { this.cells[i] = 0; flags[i] |= F.LOW | F.RAIL; }
    for (const i of ledge) flags[i] |= F.LEDGE;
  }

  /** Directional step rule of §5.2 (rise from i to j). */
  private canStep(i: number, j: number): boolean {
    const floor = this.floor!, flags = this.flags!;
    const lim = (flags[i] | flags[j]) & F.SLOPE ? VERT.RAMP_PAIR : VERT.STEP_UP;
    return floor[j] - floor[i] <= lim + EPS;
  }

  /**
   * §5.5: flood fill over pathable cells (8-neighbour, no corner cutting). Two cells join when a step is allowed in
   * either direction, which is a superset of the A* edges, so a region mismatch always means "unreachable".
   */
  private buildRegions(): void {
    const N = this.cols * this.rows;
    const reg = new Uint16Array(N);
    const queue = new Int32Array(N);
    let id = 0;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const seed = r * this.cols + c;
        if (reg[seed] || !this.pathCell(c, r)) continue;
        if (id >= 65535) { console.warn('[nav] more than 65535 regions; the rest stay region 0'); break; }
        id++;
        reg[seed] = id;
        let head = 0, tail = 0;
        queue[tail++] = seed;
        while (head < tail) {
          const cur = queue[head++];
          const cc = cur % this.cols, cr = (cur - cc) / this.cols;
          for (let dz = -1; dz <= 1; dz++)
            for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dz) continue;
              const nc = cc + dx, nr = cr + dz;
              if (!this.inBounds(nc, nr)) continue;
              if (dx && dz && (!this.cell(cc + dx, cr) || !this.cell(cc, cr + dz))) continue;
              const ni = nr * this.cols + nc;
              if (reg[ni] || !this.pathCell(nc, nr)) continue;
              if (!this.canStep(cur, ni) && !this.canStep(ni, cur)) continue;
              reg[ni] = id;
              queue[tail++] = ni;
            }
        }
      }
    this.region = reg;
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
      if (!this.cell(this.cx(ax + dx * t), this.cz(az + dz * t))) return (i - 1) / n;
    }
    return 1;
  }

  /**
   * Height-aware shot / camera ray (§5.2). Same DDA as raycast, but a solid LOW cell (rail, parapet) only blocks while the
   * ray's height at that point is at or below its floor + LOW_RAIL. Other solid cells always block. Flat grid = raycast.
   * Returns the blocked fraction like raycast (1 = clear).
   */
  raycastY(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return 1;
    const step = this.cellSize * 0.25;
    const n = Math.ceil(len / step);
    // rolling terrain (Relief): the ground itself blocks a ray that dips under it (a hill between an enemy and a player)
    const ground = this.terrain ? this.floor : null;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + dx * t, z = az + dz * t;
      const c = this.cx(x), r = this.cz(z);
      if (ground && this.inBounds(c, r) && ay + (by - ay) * t < ground[r * this.cols + c] - 0.1) return (i - 1) / n;
      if (this.cell(c, r)) continue;
      if (!this.flags || !this.inBounds(c, r)) return (i - 1) / n;
      const idx = r * this.cols + c;
      if (this.flags[idx] & F.LOW) {
        const y = ay + (by - ay) * t;
        if (y > this.floor![idx] + VERT.LOW_RAIL) continue;
      }
      return (i - 1) / n;
    }
    return 1;
  }

  lineOfSight(ax: number, az: number, bx: number, bz: number): boolean {
    return this.raycast(ax, az, bx, bz) >= 1;
  }

  /**
   * AI / steering line of sight (§5.2): no solid, VOID or LEDGE cell along the segment and no step violation between
   * consecutive samples (rise > STEP_UP, or > RAMP_PAIR when either sample is a slope). Flat grid = lineOfSight.
   */
  walkLine(ax: number, az: number, bx: number, bz: number): boolean {
    if (!this.floor) return this.lineOfSight(ax, az, bx, bz);
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const step = this.cellSize * 0.25;
    const n = Math.max(1, Math.ceil(len / step));
    let prevY = this.floorAt(ax, az);
    let prevSlope = (this.flagsAt(ax, az) & F.SLOPE) !== 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = ax + dx * t, z = az + dz * t;
      if (!this.isStandable(x, z)) return false;
      const y = this.floorAt(x, z);
      const slope = (this.flagsAt(x, z) & F.SLOPE) !== 0;
      const lim = slope || prevSlope ? VERT.RAMP_PAIR : VERT.STEP_UP;
      if (y - prevY > lim + EPS) return false;
      prevY = y;
      prevSlope = slope;
    }
    return true;
  }

  /**
   * Move-and-collide for actors (§5.2). Runs resolveCircle, then on vertical grids refuses floors higher than feetY + step
   * (AIR_STEP when airborne): the offending axis is reverted, trying the x-only then the z-only slide.
   * Returns true on any collision. Flat grid = resolveCircle.
   */
  resolveMove(pos: THREE.Vector3, prevX: number, prevZ: number, radius: number, feetY: number, airborne = false): boolean {
    const hit = this.resolveCircle(pos, radius);
    if (!this.floor) return hit;
    const lim = feetY + (airborne ? VERT.AIR_STEP : VERT.STEP_UP);
    const mx = pos.x - prevX, mz = pos.z - prevZ;
    const ml = Math.hypot(mx, mz);
    const ux = ml > 1e-6 ? mx / ml : 0, uz = ml > 1e-6 ? mz / ml : 0;
    const blocked = (x: number, z: number): boolean => {
      if (this.floorAt(x, z) > lim) return true;
      return ml > 1e-6 && this.floorAt(x + ux * radius, z + uz * radius) > lim;
    };
    if (!blocked(pos.x, pos.z)) return hit;
    if (!blocked(pos.x, prevZ)) { pos.z = prevZ; return true; }
    if (!blocked(prevX, pos.z)) { pos.x = prevX; return true; }
    pos.x = prevX;
    pos.z = prevZ;
    return true;
  }

  nearestWalkable(x: number, z: number, maxRadiusCells = 12): { x: number; z: number } | null {
    const c = this.cx(x), r = this.cz(z);
    if (this.pathCell(c, r)) return { x, z };
    for (let rad = 1; rad <= maxRadiusCells; rad++)
      for (let dr = -rad; dr <= rad; dr++)
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          if (this.pathCell(c + dc, r + dr)) return { x: this.centerX(c + dc), z: this.centerZ(r + dr) };
        }
    return null;
  }

  /** Random walkable point within radius (for wander/scatter). rand() in [0,1). */
  randomNear(x: number, z: number, radius: number, rand: () => number = Math.random): { x: number; z: number } {
    for (let i = 0; i < 20; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * radius;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isStandable(px, pz) && this.lineOfSight(x, z, px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }

  /**
   * A* (8-directional, no corner cutting) + line-of-sight string pulling.
   * Returns world waypoints (excluding start) or null if unreachable within maxNodes.
   * Vertical grids: steps must satisfy the rise rule, cost adds 0.5 per metre of height change, waypoints carry floorAt,
   * and different regions are rejected immediately.
   */
  findPath(from: { x: number; z: number }, to: { x: number; z: number }, maxNodes = 6000): THREE.Vector3[] | null {
    const vert = this.floor !== null;
    const los = (ax: number, az: number, bx: number, bz: number): boolean =>
      vert ? this.walkLine(ax, az, bx, bz) : this.lineOfSight(ax, az, bx, bz);
    if (los(from.x, from.z, to.x, to.z)) return [new THREE.Vector3(to.x, this.floorAt(to.x, to.z), to.z)];
    const start = this.nearestWalkable(from.x, from.z, 4);
    const goal = this.nearestWalkable(to.x, to.z, 6);
    if (!start || !goal) return null;
    const sc = this.cx(start.x), sr = this.cz(start.z), gc = this.cx(goal.x), gr = this.cz(goal.z);
    const W = this.cols;
    const sIdx = sr * W + sc, gIdx = gr * W + gc;
    if (this.region && this.region[sIdx] !== this.region[gIdx]) return null;
    const floor = this.floor;
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
          if (vert ? !this.pathCell(nc, nr) : !this.cell(nc, nr)) continue;
          if (dx && dz && (!this.cell(c + dx, r) || !this.cell(c, r + dz))) continue;
          const ni = nr * W + nc;
          if (closed.has(ni)) continue;
          if (vert && !this.canStep(cur, ni)) continue;
          let ng = g.get(cur)! + (dx && dz ? 1.4142 : 1);
          if (vert) ng += Math.abs(floor![ni] - floor![cur]) * 0.5;
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            open.push(ni, ng + hfn(nc, nr));
          }
        }
    }
    if (sIdx === gIdx) return [new THREE.Vector3(goal.x, this.floorAt(goal.x, goal.z), goal.z)];
    if (!came.has(gIdx)) return null;
    const cellsPath: number[] = [];
    for (let k = gIdx; k !== sIdx; k = came.get(k)!) cellsPath.push(k);
    cellsPath.reverse();
    const pts = cellsPath.map((k) => {
      const px = this.centerX(k % W), pz = this.centerZ(Math.floor(k / W));
      return new THREE.Vector3(px, vert ? this.floorAt(px, pz) : 0, pz);
    });
    pts[pts.length - 1] = new THREE.Vector3(goal.x, this.floorAt(goal.x, goal.z), goal.z);
    // string pulling
    const out: THREE.Vector3[] = [];
    let ax = from.x, az = from.z, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !los(ax, az, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      ax = pts[j].x; az = pts[j].z;
      i = j + 1;
    }
    return out;
  }

  /**
   * Coarse copy for maps and minimaps of big zones (docs/ENGINE_BIGMAPS.md): one byte per `factor` x `factor` block of cells, 1 when
   * at least `minFill` of the block is walkable (default any cell). A 4 km zone has 4001 x 4001 fine cells (a 64 MB canvas as RGBA);
   * factor 4 gives 1001 x 1001. Block (c, r) covers cells [c*factor, (c+1)*factor) x [r*factor, (r+1)*factor).
   */
  downsample(factor: number, minFill = 0): { cols: number; rows: number; cellSize: number; cells: Uint8Array } {
    const f = Math.max(1, Math.floor(factor));
    const cols = Math.ceil(this.cols / f), rows = Math.ceil(this.rows / f);
    const out = new Uint8Array(cols * rows);
    const need = Math.max(1, Math.ceil(minFill * f * f));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        let n = 0;
        const r1 = Math.min(this.rows, (r + 1) * f), c1 = Math.min(this.cols, (c + 1) * f);
        for (let rr = r * f; rr < r1 && n < need; rr++) for (let cc = c * f; cc < c1; cc++) if (this.cells[rr * this.cols + cc]) n++;
        out[r * cols + c] = n >= need ? 1 : 0;
      }
    return { cols, rows, cellSize: this.cellSize * f, cells: out };
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
