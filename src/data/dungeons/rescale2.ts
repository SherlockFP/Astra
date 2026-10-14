import type { PackDef, RoomDef, TileRect } from '../../types/dungeons';
import type { Props } from './kit';

/**
 * SCALE PASS helper (docs/SCALE_REFERENCE.md section 3; same method as the Kemik Mahzeni pilot). A widened dungeon keeps its
 * hand placed decoration, pack centres, boss spawns, extras and zones in the OLD layout coordinates (OLD); this maps them into
 * the new ROOMS. Each room is scaled on its own axes, so a point keeps its place relative to its room and room edges stay on
 * edges. Pack members (offsets from the centre) and prop sizes are not scaled.
 */
export type Rect4 = [number, number, number, number];

export interface Rescale {
  /** Old-layout point (GDD convention) inside room `id` -> new-layout point. */
  toNew(id: string, x: number, z: number): [number, number];
  /** Old-layout point -> the room that contains it (nearest rect when it sits on a wall line), mapped into that room. */
  at2(x: number, z: number): [number, number];
  /** Props for one room: at(), wall(), torches(), row(), ring() and scatter() take old-layout coordinates. */
  remapProps(p: Props, roomId: string): Props;
  /** Pack centre and patrol points are old-layout coordinates; members stay as offsets. */
  remapPack(p: PackDef): PackDef;
}

export function makeRescale(OLD: Record<string, Rect4>, rooms: RoomDef[]): Rescale {
  const NEW: Record<string, Rect4> = {};
  for (const r of rooms) NEW[r.id] = [r.rect.x, r.rect.z, r.rect.w, r.rect.h];

  const toNew = (id: string, x: number, z: number): [number, number] => {
    const o = OLD[id], n = NEW[id];
    if (!o || !n) throw new Error(`[content] rescale: unknown room ${id}`);
    return [n[0] - 0.5 + (x - o[0] + 0.5) * (n[2] / o[2]), n[1] - 0.5 + (z - o[1] + 0.5) * (n[3] / o[3])];
  };

  const at2 = (x: number, z: number): [number, number] => {
    let best = '';
    let bd = Infinity;
    for (const id of Object.keys(OLD)) {
      const [ox, oz, ow, oh] = OLD[id];
      const dx = Math.max(ox - 0.5 - x, 0, x - (ox + ow - 0.5));
      const dz = Math.max(oz - 0.5 - z, 0, z - (oz + oh - 0.5));
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = id; }
    }
    return toNew(best, x, z);
  };

  const remapProps = (p: Props, roomId: string): Props => {
    const host = p as unknown as {
      at: Props['at']; scatter: Props['scatter']; inDoor: (line: 'x' | 'z', at: number, along: number, margin: number) => boolean;
    };
    const rawAt = host.at.bind(p);
    const rawScatter = host.scatter.bind(p);
    const rawInDoor = host.inDoor.bind(p);
    let raw = false;
    host.at = (model, x, z, o) => {
      if (raw) return rawAt(model, x, z, o);
      const [nx, nz] = toNew(roomId, x, z);
      return rawAt(model, nx, nz, o);
    };
    // wall() asks whether a wall prop sits in a door gap: compare in the new layout (the door list is new)
    host.inDoor = (line, at, along, margin) => {
      if (line === 'z') {
        const [nx, nz] = toNew(roomId, along, at);
        return rawInDoor('z', nz, nx, margin);
      }
      const [nx, nz] = toNew(roomId, at, along);
      return rawInDoor('x', nx, nz, margin);
    };
    host.scatter = (count, models, area, o, opt) => {
      const [x0, z0] = toNew(roomId, area.x0, area.z0);
      const [x1, z1] = toNew(roomId, area.x1, area.z1);
      raw = true;
      try {
        return rawScatter(count, models, { x0, z0, x1, z1 }, o, opt);
      } finally {
        raw = false;
      }
    };
    return p;
  };

  const remapPack = (p: PackDef): PackDef => {
    const [cx, cz] = toNew(p.roomId, p.center[0], p.center[1]);
    return { ...p, center: [cx, cz], ...(p.patrol ? { patrol: p.patrol.map(([x, z]) => toNew(p.roomId, x, z)) } : {}) };
  };

  return { toNew, at2, remapProps, remapPack };
}

/** Old rect as a TileRect (what the room callbacks receive: old-layout coordinates). */
export const oldTileRect = (OLD: Record<string, Rect4>, id: string): TileRect => {
  const [x, z, w, h] = OLD[id];
  return { x, z, w, h };
};
