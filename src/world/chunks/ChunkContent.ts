import type { CullLayer } from '../Instancing';

/**
 * What the chunk generator produces for one chunk of a streamed zone (docs/ENGINE_BIGMAPS.md). Plain data, a pure function of the
 * zone data and the chunk coordinates, so every peer gets the same content in any streaming order.
 */

/** One generated scenery instance (position in world metres, `tint` = grey multiplier or null for the model's own colours). */
export interface StreamInstance {
  url: string;
  x: number; y: number; z: number;
  rot: number;
  scale: number;
  tint: number | null;
  cast: boolean;
  receive: boolean;
  layer?: CullLayer;
}

/** A blocking circle on the nav grid (trees, rocks, hill massifs). */
export interface StreamCollider { x: number; z: number; r: number }

export interface ChunkContent {
  cx: number;
  cz: number;
  instances: StreamInstance[];
  colliders: StreamCollider[];
}
