/**
 * Chunk streamer: the resident set of a big open-world zone (docs/ENGINE_BIGMAPS.md). PURE: no three.js, no DOM, no clock, so a
 * node sim can drive it (dev/combat-sim/bigmap.mjs). It decides WHICH chunks are in memory; what a chunk contains is the caller's
 * `load` / `unload` pair (terrain mesh, instanced scenery, nav colliders).
 *
 * Chunks are square cells of `size` metres on the world XZ plane, key = (cx, cz) with cx = floor(x / size). A chunk is wanted when
 * the distance from a focus point to the chunk's square is at most `loadM`, and dropped when every focus is farther than `unloadM`
 * (> loadM: the gap is the hysteresis, so walking along the ring edge never thrashes). Loads run nearest-first, at most
 * `maxLoads` per update (the rest wait for the next call), unloads at most `maxUnloads`. `prime()` loads everything wanted at once
 * (scene start, teleports). The resident count is bounded by the ring area, never by the zone size.
 * Content of a chunk must be a pure function of (cx, cz) and the zone data, so every peer builds the same world regardless of the
 * order and timing the chunks stream in. OWNER: world module (engine).
 */

export interface ChunkFocus { x: number; z: number }

export interface ChunkStreamerOpts<T> {
  /** Chunk edge (m). */
  size: number;
  /** Load radius (m): a chunk whose square is this close to a focus is wanted. */
  loadM: number;
  /** Unload radius (m), > loadM. */
  unloadM: number;
  /** Inclusive chunk index range that exists (outside it nothing is ever loaded). */
  minCx: number; maxCx: number; minCz: number; maxCz: number;
  /** Max chunk loads per update() (default 2). */
  maxLoads?: number;
  /** Max chunk unloads per update() (default 6). */
  maxUnloads?: number;
  load(cx: number, cz: number): T;
  unload(cx: number, cz: number, value: T): void;
}

export interface ChunkStats {
  resident: number;
  peak: number;
  loads: number;
  unloads: number;
  /** Chunks wanted but not yet loaded (budget). */
  pending: number;
}

/** Unique integer key of a chunk (cx, cz within +-32768). */
export const chunkKey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

/** Squared distance from (x, z) to the square [x0, x0+s] x [z0, z0+s] (0 inside). */
export function distSqToSquare(x: number, z: number, x0: number, z0: number, s: number): number {
  const dx = x < x0 ? x0 - x : x > x0 + s ? x - (x0 + s) : 0;
  const dz = z < z0 ? z0 - z : z > z0 + s ? z - (z0 + s) : 0;
  return dx * dx + dz * dz;
}

/** Upper bound of chunks inside the unload radius around `foci` foci: the square ring that covers unloadM in every direction. */
export function maxResidentFor(size: number, unloadM: number, foci = 1): number {
  const n = Math.ceil((2 * unloadM) / size) + 2;
  return n * n * Math.max(1, foci);
}

type Resolved<T> = ChunkStreamerOpts<T> & { maxLoads: number; maxUnloads: number };

export class ChunkStreamer<T> {
  private readonly o: Resolved<T>;
  private readonly map = new Map<number, { cx: number; cz: number; v: T }>();
  private readonly _stats: ChunkStats = { resident: 0, peak: 0, loads: 0, unloads: 0, pending: 0 };
  private readonly want: { cx: number; cz: number; d: number }[] = [];

  constructor(o: ChunkStreamerOpts<T>) {
    this.o = { ...o, maxLoads: o.maxLoads ?? 2, maxUnloads: o.maxUnloads ?? 6 };
    if (!(o.unloadM > o.loadM)) throw new Error('ChunkStreamer: unloadM must exceed loadM');
  }

  get stats(): Readonly<ChunkStats> {
    this._stats.resident = this.map.size;
    return this._stats;
  }

  get size(): number {
    return this.map.size;
  }

  has(cx: number, cz: number): boolean {
    return this.map.has(chunkKey(cx, cz));
  }

  get(cx: number, cz: number): T | undefined {
    return this.map.get(chunkKey(cx, cz))?.v;
  }

  /** Resident chunks in load order (for debug readouts / tests). */
  entries(): { cx: number; cz: number; value: T }[] {
    return [...this.map.values()].map((e) => ({ cx: e.cx, cz: e.cz, value: e.v }));
  }

  /** Streams towards the foci. Returns true when the resident set changed. */
  update(foci: readonly ChunkFocus[], prime = false): boolean {
    const o = this.o;
    let changed = false;
    // ---- unload: farther than unloadM from EVERY focus (a chunk with no focus at all is dropped too)
    const u2 = o.unloadM * o.unloadM;
    const drop: { k: number; d: number }[] = [];
    for (const [k, e] of this.map) {
      let best = Infinity;
      const x0 = e.cx * o.size, z0 = e.cz * o.size;
      for (const f of foci) best = Math.min(best, distSqToSquare(f.x, f.z, x0, z0, o.size));
      if (best > u2) drop.push({ k, d: best });
    }
    // farthest first so a budgeted unload frees the least useful chunks first
    drop.sort((a, b) => b.d - a.d || a.k - b.k);
    let unloads = 0;
    for (const { k } of drop) {
      if (!prime && unloads >= o.maxUnloads) break;
      const e = this.map.get(k)!;
      this.map.delete(k);
      o.unload(e.cx, e.cz, e.v);
      this._stats.unloads++;
      unloads++;
      changed = true;
    }
    // ---- wanted set
    const want = this.want;
    want.length = 0;
    const l2 = o.loadM * o.loadM;
    const span = Math.ceil(o.loadM / o.size) + 1;
    for (const f of foci) {
      const fcx = Math.floor(f.x / o.size), fcz = Math.floor(f.z / o.size);
      for (let cz = Math.max(o.minCz, fcz - span); cz <= Math.min(o.maxCz, fcz + span); cz++)
        for (let cx = Math.max(o.minCx, fcx - span); cx <= Math.min(o.maxCx, fcx + span); cx++) {
          const d = distSqToSquare(f.x, f.z, cx * o.size, cz * o.size, o.size);
          if (d > l2 || this.map.has(chunkKey(cx, cz))) continue;
          want.push({ cx, cz, d });
        }
    }
    // several foci may want the same chunk: nearest entry first, then nearest-first overall (ties by key: deterministic)
    want.sort((a, b) => a.d - b.d || chunkKey(a.cx, a.cz) - chunkKey(b.cx, b.cz));
    let loads = 0;
    let pending = 0;
    const queued = new Set<number>();
    for (const w of want) {
      const k = chunkKey(w.cx, w.cz);
      if (this.map.has(k)) continue; // a second focus wanted the same chunk
      if (!prime && loads >= o.maxLoads) {
        if (queued.has(k)) continue;
        queued.add(k);
        pending++;
        continue;
      }
      const v = o.load(w.cx, w.cz);
      this.map.set(k, { cx: w.cx, cz: w.cz, v });
      this._stats.loads++;
      loads++;
      changed = true;
    }
    this._stats.pending = pending;
    if (this.map.size > this._stats.peak) this._stats.peak = this.map.size;
    return changed;
  }

  /** Loads everything wanted right now, ignoring the per-update budget. */
  prime(foci: readonly ChunkFocus[]): void {
    this.update(foci, true);
  }

  /** Unloads every resident chunk (scene exit). */
  dispose(): void {
    for (const e of this.map.values()) this.o.unload(e.cx, e.cz, e.v);
    this.map.clear();
  }
}
