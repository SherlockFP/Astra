import type { DoorDef, PackDef, PropPlacement, RoomDef, TileRect } from '../../types/dungeons';
import { type KitCtx, type Props, bossAt, decorator, makeCtx, rectsOf } from './kit';

/**
 * SCALE PASS helper (docs/SCALE_REFERENCE.md section 3, same method as the kemik_mahzeni pilot). The layout was widened, so the
 * hand placed decoration, packs, bosses, anchors and extras are still written in the OLD layout coordinates (oldRect).
 * They are remapped proportionally into the new room rects (each room scales on its own axes), so every prop keeps its place
 * relative to its room and walls keep their edges. Pack members are offsets from the centre and stay as they are.
 */

export type Rect4 = [number, number, number, number];
type Area = { x0: number; z0: number; x1: number; z1: number };

export interface RescaleOpts {
  seed: string;
  oldRect: Record<string, Rect4>;
  rooms: RoomDef[];
  doors: DoorDef[];
  packsRaw: PackDef[];
  /** Old-layout reserved anchors (start, font, exit, bosses, shrines): x, z, radius. */
  anchors: { x: number; z: number; r: number }[];
}

export interface Rescale {
  packs: PackDef[];
  ctx: KitCtx;
  toNew(roomId: string, x: number, z: number): [number, number];
  at2(x: number, z: number): [number, number];
  near(x: number, z: number, r: number): { x: number; z: number; r: number };
  bossAtNew(bossId: string, roomId: string, x: number, z: number, facing: number, order: number): ReturnType<typeof bossAt>;
  D: { out: Record<string, PropPlacement[]>; room(id: string, fn: (p: Props, r: TileRect) => void): void };
}

export function makeRescale(o: RescaleOpts): Rescale {
  const newRect = (id: string): Rect4 => {
    const r = o.rooms.find((q) => q.id === id)?.rect;
    if (!r) throw new Error(`[content] rescale: unknown room ${id}`);
    return [r.x, r.z, r.w, r.h];
  };
  /** Old-layout point -> new-layout point inside the same room. A room edge sits at centre - 0.5. */
  const toNew = (roomId: string, x: number, z: number): [number, number] => {
    const [ox, oz, ow, oh] = o.oldRect[roomId];
    const [nx, nz, nw, nh] = newRect(roomId);
    return [nx - 0.5 + (x - ox + 0.5) * (nw / ow), nz - 0.5 + (z - oz + 0.5) * (nh / oh)];
  };
  /** Old-layout point -> the room that contains it (nearest rect when it sits on a wall line), mapped into that room. */
  const at2 = (x: number, z: number): [number, number] => {
    let best = Object.keys(o.oldRect)[0];
    let bd = Infinity;
    for (const id of Object.keys(o.oldRect)) {
      const [ox, oz, ow, oh] = o.oldRect[id];
      const dx = Math.max(ox - 0.5 - x, 0, x - (ox + ow - 0.5));
      const dz = Math.max(oz - 0.5 - z, 0, z - (oz + oh - 0.5));
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = id; }
    }
    return toNew(best, x, z);
  };
  const near = (x: number, z: number, r: number): { x: number; z: number; r: number } => {
    const [nx, nz] = at2(x, z);
    return { x: nx, z: nz, r };
  };
  const remapPack = (p: PackDef): PackDef => {
    const [cx, cz] = toNew(p.roomId, p.center[0], p.center[1]);
    return { ...p, center: [cx, cz], ...(p.patrol ? { patrol: p.patrol.map(([x, z]) => toNew(p.roomId, x, z)) } : {}) };
  };
  const packs = o.packsRaw.map(remapPack);
  const bossAtNew = (bossId: string, roomId: string, x: number, z: number, facing: number, order: number) => {
    const [nx, nz] = toNew(roomId, x, z);
    return bossAt(bossId, roomId, nx, nz, facing, order);
  };
  const ctx = makeCtx(o.seed, o.doors, packs, o.anchors.map((a) => near(a.x, a.z, a.r)));
  const decor = decorator(ctx, rectsOf(o.rooms));

  /** Props for one room: at() and scatter() take old-layout coordinates; the decorator's collision lists stay in new coordinates. */
  const remapProps = (p: Props, roomId: string): Props => {
    const host = p as unknown as { at: Props['at']; scatter: Props['scatter'] };
    const rawAt = host.at.bind(p);
    const rawScatter = host.scatter.bind(p);
    let raw = false;
    host.at = (model, x, z, opt) => {
      if (raw) return rawAt(model, x, z, opt);
      const [nx, nz] = toNew(roomId, x, z);
      return rawAt(model, nx, nz, opt);
    };
    host.scatter = (count, models, area: Area, opt, sopt) => {
      const [x0, z0] = toNew(roomId, area.x0, area.z0);
      const [x1, z1] = toNew(roomId, area.x1, area.z1);
      raw = true;
      try {
        return rawScatter(count, models, { x0, z0, x1, z1 }, opt, sopt);
      } finally {
        raw = false;
      }
    };
    return p;
  };
  const D = {
    out: decor.out,
    room(id: string, fn: (p: Props, r: TileRect) => void): void {
      const [x, z, w, h] = o.oldRect[id];
      decor.room(id, (p) => fn(remapProps(p, id), { x, z, w, h }));
    },
  };
  return { packs, ctx, toNew, at2, near, bossAtNew, D };
}
