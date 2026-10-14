import type { DungeonDef } from '../../types/dungeons';
import type { Relief } from '../../world/Relief';
import { buildZoneMapPixels } from '../../world/MapImage';

/** A zone picture ready to draw: the canvas covers world [0, widthM] x [0, heightM] in metres (one canvas pixel = a few metres). */
export interface ZoneMapCanvas {
  canvas: HTMLCanvasElement;
  widthM: number;
  heightM: number;
}

/** One picture per open-world def (the zones are static data; a picture is a few MB at most). */
const cache = new Map<string, ZoneMapCanvas>();

/**
 * The zone picture of an open-world def, built once and cached. `relief`: the relief the builder already baked (DungeonScene passes it
 * through primeZoneMap); undefined = bake it here. Null when the picture cannot be made, so the caller keeps the nav-grid map.
 */
export function zoneMapCanvas(def: DungeonDef, relief?: Relief | null): ZoneMapCanvas | null {
  const hit = cache.get(def.id);
  if (hit) return hit;
  try {
    const px = buildZoneMapPixels(def, relief);
    const canvas = document.createElement('canvas');
    canvas.width = px.w;
    canvas.height = px.h;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(px.w, px.h);
    img.data.set(px.rgba);
    g.putImageData(img, 0, 0);
    const out: ZoneMapCanvas = { canvas, widthM: px.widthM, heightM: px.heightM };
    cache.set(def.id, out);
    return out;
  } catch (err) {
    console.warn('[map] zone picture failed, the nav-grid map stays', err);
    return null;
  }
}

/** Called when an open-world zone is built: bakes its picture with the relief the builder already has (no second bake). */
export function primeZoneMap(def: DungeonDef, relief: Relief | null): void {
  if (def.world) zoneMapCanvas(def, relief);
}
