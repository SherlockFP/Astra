import { TILE_SIZE, type DungeonDef } from '../../types/dungeons';
import { maxResidentFor } from './ChunkStreamer';

/**
 * Streaming configuration of an open-world zone (docs/ENGINE_BIGMAPS.md). PURE (no three.js): resolved from the DungeonDef only,
 * so every peer and the node sims get the same numbers. A zone streams when `world.perf.stream` is 'on', or 'auto' (the default)
 * and the zone is larger than STREAM_AUTO_M on either axis. Sisli Vadi (640 m) therefore keeps its single-terrain, build-everything
 * path unchanged; a dev can force the streamed path on it with `?stream=1` (and back with `?stream=0`).
 */

/** Zones up to this size (m) build everything at load ('auto'). */
export const STREAM_AUTO_M = 800;
/** Default streaming chunk edge (m): 16 tiles. */
export const STREAM_CHUNK_M = 64;
/** Largest supported zone edge (m): the nav grid is dense (1 m cells, 16.8 MB at 4096 m) and the room index is Int16 per tile. */
export const MAX_ZONE_M = 4400;
/** The view radius never goes below / above these (m); fog far above ~250 m also needs a longer camera far plane. */
export const VIEW_MIN_M = 96;
export const VIEW_MAX_M = 320;

export interface StreamConfig {
  /** Terrain + scenery stream by chunk. */
  on: boolean;
  /** Chunk edge (m), a multiple of 16. */
  chunkM: number;
  /** Chunks whose square is within this distance of the focus are built. */
  viewM: number;
  /** ... and dropped beyond this distance (hysteresis). */
  dropM: number;
  /** Max chunk builds / drops per frame. */
  maxLoads: number;
  maxUnloads: number;
  /** Upper bound of resident visual chunks around one focus (the sim asserts the real count stays below it). */
  maxResident: number;
  /** Zone size (m). */
  sizeX: number;
  sizeZ: number;
}

/** Dev override from the page URL: `?stream=1` forces streaming, `?stream=0` forces the single-terrain path, absent = data. */
export function streamOverride(): boolean | null {
  try {
    const s = (globalThis as { location?: { search?: string } }).location?.search;
    if (!s) return null;
    const v = new URLSearchParams(s).get('stream');
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

/** Widest fog far (m) of the zone's regions, else the zone theme's. */
export function widestFogFar(def: DungeonDef): number {
  let far = def.theme.fogFar;
  for (const r of def.world?.regions ?? []) far = Math.max(far, r.theme.fogFar);
  return far;
}

export function streamConfig(def: DungeonDef, override: boolean | null = streamOverride()): StreamConfig {
  const sizeX = def.grid.w * TILE_SIZE, sizeZ = def.grid.h * TILE_SIZE;
  const perf = def.world?.perf;
  const mode = perf?.stream ?? 'auto';
  let on = !!def.outdoor && !!def.world && (mode === 'on' || (mode === 'auto' && Math.max(sizeX, sizeZ) > STREAM_AUTO_M));
  if (override !== null && def.outdoor && def.world) on = override;
  const chunkM = Math.max(32, Math.round((perf?.streamChunkM ?? STREAM_CHUNK_M) / 16) * 16);
  const view = Math.max(VIEW_MIN_M, Math.min(VIEW_MAX_M, perf?.viewM ?? widestFogFar(def) + 64));
  const dropM = view + Math.max(32, chunkM / 2);
  return {
    on, chunkM, viewM: view, dropM, maxLoads: 2, maxUnloads: 6,
    maxResident: maxResidentFor(chunkM, dropM),
    sizeX, sizeZ,
  };
}
