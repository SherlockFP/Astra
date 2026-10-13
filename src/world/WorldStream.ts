import type { InstanceBatcher } from './Instancing';
import type { NavGrid } from './NavGrid';
import type { ChunkedTerrain, TerrainChunk } from './TerrainChunks';
import type { ChunkScatter } from './chunks/ChunkScatter';
import type { ChunkContent } from './chunks/ChunkContent';
import { ChunkStreamer, chunkKey, type ChunkFocus } from './chunks/ChunkStreamer';
import type { StreamConfig } from './chunks/StreamConfig';

/**
 * Orchestrates the streaming of a big open-world zone (docs/ENGINE_BIGMAPS.md): the VISUAL ring follows the camera focus (terrain
 * chunk + instanced scenery meshes, built and freed with the chunk), the COLLIDER ring follows every player of the world (the
 * host simulates enemies near remote players too) and writes the trunks / rocks / hill massifs of the generated chunks onto the
 * nav grid. Colliders stay on the grid once written (the grid is dense and tiny next to the meshes), so there is no unload step.
 * Chunk content is a pure function of the zone data (ChunkScatter), so what a peer sees and bumps into never depends on the
 * order the chunks were built in. A jump of the focus (teleport, respawn) rebuilds the ring at once; walking streams a couple of
 * chunks per frame, nearest first. OWNER: world module (engine).
 */

export interface WorldStreamOpts {
  cfg: StreamConfig;
  /** Zone size in tiles (chunk range). */
  tilesW: number;
  tilesH: number;
  batcher: InstanceBatcher;
  nav: NavGrid;
  terrain: ChunkedTerrain;
  scatter: ChunkScatter;
  /** Every player position of this world (colliders stream around all of them). */
  players?: () => readonly ChunkFocus[];
}

interface VisualChunk { terrain: TerrainChunk | null }

export interface WorldStreamStats {
  visualChunks: number;
  colliderChunks: number;
  peakVisual: number;
  loads: number;
  unloads: number;
  pending: number;
  cachedContent: number;
}

/** Terrain exists this far beyond the zone edge (m): the ground under the backdrop forest. */
const TERRAIN_MARGIN_M = 160;
const CONTENT_CACHE = 256;

export class WorldStream {
  readonly visual: ChunkStreamer<VisualChunk>;
  readonly colliders: ChunkStreamer<true>;
  private readonly content = new Map<number, ChunkContent>();
  private lastX = NaN;
  private lastZ = NaN;
  private timer = 0;
  /** Bumped whenever the set of resident visual chunks changed (OccluderFade candidates need a refresh). */
  version = 0;

  constructor(private readonly o: WorldStreamOpts) {
    const { cfg } = o;
    const size = cfg.chunkM;
    const minCx = Math.floor(-TERRAIN_MARGIN_M / size), maxCx = Math.floor((cfg.sizeX + TERRAIN_MARGIN_M) / size);
    const minCz = Math.floor(-TERRAIN_MARGIN_M / size), maxCz = Math.floor((cfg.sizeZ + TERRAIN_MARGIN_M) / size);
    const common = { size, loadM: cfg.viewM, unloadM: cfg.dropM, minCx, maxCx, minCz, maxCz };
    this.visual = new ChunkStreamer<VisualChunk>({
      ...common,
      maxLoads: cfg.maxLoads,
      maxUnloads: cfg.maxUnloads,
      load: (cx, cz) => {
        const terrain = o.terrain.load(cx, cz);
        o.batcher.loadChunk(cx, cz, this.contentOf(cx, cz).instances);
        return { terrain };
      },
      unload: (cx, cz, v) => {
        if (v.terrain) o.terrain.unload(cx, cz, v.terrain);
        o.batcher.unloadChunk(cx, cz);
      },
    });
    this.colliders = new ChunkStreamer<true>({
      ...common,
      maxLoads: cfg.maxLoads * 2,
      maxUnloads: 1 << 20,
      load: (cx, cz) => {
        for (const c of this.contentOf(cx, cz).colliders) o.nav.setCircle(c.x, c.z, c.r, false);
        return true;
      },
      unload: () => undefined,
    });
  }

  /** Generated content of a chunk, cached (a chunk is asked for by both rings and again when it comes back into view). */
  contentOf(cx: number, cz: number): ChunkContent {
    const k = chunkKey(cx, cz);
    const hit = this.content.get(k);
    if (hit) {
      this.content.delete(k);
      this.content.set(k, hit);
      return hit;
    }
    const c = this.o.scatter.generate(cx, cz);
    this.content.set(k, c);
    if (this.content.size > CONTENT_CACHE) this.content.delete(this.content.keys().next().value as number);
    return c;
  }

  private colliderFoci(fx: number, fz: number): ChunkFocus[] {
    const foci: ChunkFocus[] = [{ x: fx, z: fz }];
    for (const p of this.o.players?.() ?? []) foci.push({ x: p.x, z: p.z });
    return foci;
  }

  /** Builds the whole ring around (x, z) now (scene start, teleport, respawn). */
  prime(x: number, z: number): void {
    this.lastX = x;
    this.lastZ = z;
    if (this.visual.update([{ x, z }], true)) this.version++;
    this.colliders.update(this.colliderFoci(x, z), true);
  }

  /** Per frame. Returns true when the visual set changed this call. */
  update(dt: number, x: number, z: number): boolean {
    if (Number.isNaN(this.lastX) || Math.hypot(x - this.lastX, z - this.lastZ) > this.o.cfg.viewM * 0.6) {
      this.prime(x, z); // first call or a jump: do not trickle in a ring around a point the player already left
      return true;
    }
    this.timer -= dt;
    const moved = Math.hypot(x - this.lastX, z - this.lastZ) > 3;
    if (!moved && this.timer > 0 && this.visual.stats.pending === 0) return false;
    this.timer = 0.5;
    this.lastX = x;
    this.lastZ = z;
    const changed = this.visual.update([{ x, z }]);
    this.colliders.update(this.colliderFoci(x, z));
    if (changed) this.version++;
    return changed;
  }

  get stats(): WorldStreamStats {
    const v = this.visual.stats;
    return {
      visualChunks: v.resident, colliderChunks: this.colliders.size, peakVisual: v.peak, loads: v.loads, unloads: v.unloads,
      pending: v.pending, cachedContent: this.content.size,
    };
  }

  dispose(): void {
    this.visual.dispose();
    this.colliders.dispose();
    this.content.clear();
  }
}
