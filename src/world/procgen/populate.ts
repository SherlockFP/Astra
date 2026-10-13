import { RNG } from '../../core/utils';
import type { DoorDef, FissureModId, FissureTier, PackDef, PropPlacement, TileRect, ZoneDef } from '../../types/dungeons';
import { circleZone, lt, makeCtx, pack, Props, type MemberTuple, type PackExtra } from '../../data/dungeons/kit';
import { DIR, type Side } from './arenas';
import type { LNode } from './layout';
import { FISSURE_TIERS } from './tiers';
import type { PackRole, PackTpl, ThemeDef } from './themes';

/**
 * Population and dressing of the generated rooms (docs/GDD_PROCGEN.md §4.2). OWNER: world module.
 * Deterministic: every random draw comes from the RNG streams the caller passes in, in a fixed order.
 */

/** Authored ring offsets of a pack's members (tiles from the pack centre); the same constants the hand-made dungeons use. */
const OFFS: [number, number][] = [
  [0.3, 0], [-0.38, 0.35], [0.06, -0.66], [0.48, 0.62], [-0.88, -0.16], [0.83, -0.53],
  [-0.28, 1.03], [-0.53, -1.02], [1.15, 0.42], [-1.2, 0.49], [0.58, -1.23], [0.43, 1.36],
];
const MAX_BODIES = 12;

export interface PopRoom {
  id: string;
  node: LNode;
  rect: TileRect;
  /** Door tiles inside this room (GDD tile coordinates). */
  doorTiles: [number, number][];
}
export interface PopLink {
  roomId: string;
  rect: TileRect;
  side: Side;
  ramp: boolean;
  /** Index of the link in creation order (the first corridor is never populated). */
  i: number;
}

export interface PopIn {
  th: ThemeDef;
  tier: FissureTier;
  level: number;
  mods: readonly FissureModId[];
  key: string;
  rooms: PopRoom[];
  links: PopLink[];
  doors: DoorDef[];
  start: [number, number];
  bosses: { pos: [number, number] }[];
  exit: [number, number];
  rng: RNG;
}
export interface PopOut {
  packs: PackDef[];
  props: Record<string, PropPlacement[]>;
  zones: Record<string, ZoneDef[]>;
  shrines: { pos: [number, number] }[];
  chests: { pos: [number, number]; kind: 'chest_iron' | 'chest_gold' }[];
}

/** Door tiles of `roomId`: the two tiles of every 2 wide door that lie inside that room. */
export function doorTilesOf(doors: DoorDef[], roomId: string): [number, number][] {
  const out: [number, number][] = [];
  for (const d of doors) {
    const w = d.width ?? 1;
    const [dx, dz] = DIR[d.side];
    for (let k = 0; k < w; k++) {
      const tx = d.tile[0] + (d.side === 'n' || d.side === 's' ? k : 0);
      const tz = d.tile[1] + (d.side === 'e' || d.side === 'w' ? k : 0);
      if (d.a === roomId) out.push([tx, tz]);
      else if (d.b === roomId) out.push([tx + dx, tz + dz]);
    }
  }
  return out;
}

/** Keeps a pack's furthest member 0.3 tile inside the walls (walls sit half a tile outside the outer tile centres). */
function fit(rect: TileRect, c: [number, number], list: MemberTuple[]): [number, number] {
  let ex = 0, ez = 0;
  for (const [, ox, oz] of list) { ex = Math.max(ex, Math.abs(ox)); ez = Math.max(ez, Math.abs(oz)); }
  const lo = (v: number, e: number): number => v - 0.5 + 0.3 + e;
  const hi = (v: number, w: number, e: number): number => v + w - 0.5 - 0.3 - e;
  return [
    +Math.min(Math.max(c[0], lo(rect.x, ex)), hi(rect.x, rect.w, ex)).toFixed(2),
    +Math.min(Math.max(c[1], lo(rect.z, ez)), hi(rect.z, rect.h, ez)).toFixed(2),
  ];
}

/** A pack centre pushed away from the room's doors (a pack never stands in a door lane); null when no free spot is left. */
function clear(room: { rect: TileRect; doorTiles: [number, number][] }, c: [number, number], list: MemberTuple[]): [number, number] | null {
  let p = fit(room.rect, c, list);
  for (let it = 0; it < 4; it++) {
    let near: [number, number] | null = null;
    let dmin = 2.3;
    for (const d of room.doorTiles) {
      const dd = Math.hypot(d[0] - p[0], d[1] - p[1]);
      if (dd < dmin) { dmin = dd; near = d; }
    }
    if (!near) return p;
    const vx = p[0] - near[0], vz = p[1] - near[1];
    const len = Math.hypot(vx, vz) || 1;
    p = fit(room.rect, [near[0] + (vx / len) * 2.5, near[1] + (vz / len) * 2.5], list);
  }
  return room.doorTiles.some((d) => Math.hypot(d[0] - p[0], d[1] - p[1]) < 1.9) ? null : p;
}

const centerOf = (r: TileRect): [number, number] => [r.x + (r.w - 1) / 2, r.z + (r.h - 1) / 2];
const dist = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Scale a template's member counts by tier, level and the Kalabalık Sürü modifier. */
function scaled(tpl: PackTpl, tier: FissureTier, level: number, mods: readonly FissureModId[]): [string, number][] {
  const r = FISSURE_TIERS[tier];
  const m = tpl.members.map(([id, n]) => [id, n] as [string, number]);
  const lvl = level >= 45 ? 1 : level <= 9 ? -1 : 0;
  const crowd = mods.includes('fm_surusu') ? 1 : 0;
  switch (tpl.role) {
    case 'trash':
      m[0][1] = Math.max(2, m[0][1] + r.packBonus + lvl + crowd);
      break;
    case 'swarm':
      m[0][1] = Math.max(4, m[0][1] + (tier === 'h' ? 2 : tier === 'm' ? 4 : 0) + lvl);
      break;
    case 'caster':
      if (tier === 'm') m[0][1] += 1;
      break;
    case 'mixed':
      if (m.length > 1) m[1][1] = Math.max(1, m[1][1] + (tier === 'n' ? 0 : 1) + crowd);
      break;
    case 'elite': {
      const last = m.length - 1;
      if (last > 0) m[last][1] = Math.max(1, m[last][1] + (tier === 'n' ? 0 : tier === 'h' ? 1 : 2));
      break;
    }
  }
  let total = m.reduce((a, [, n]) => a + n, 0);
  for (let i = m.length - 1; total > MAX_BODIES && i >= 0; i--) {
    const cut = Math.min(m[i][1] - 1, total - MAX_BODIES);
    m[i][1] -= cut;
    total -= cut;
  }
  return m;
}

function members(list: [string, number][], spread = 1): MemberTuple[] {
  const out: MemberTuple[] = [];
  for (const [id, n] of list) {
    for (let k = 0; k < n; k++) {
      const o = OFFS[out.length % OFFS.length];
      out.push([id, +(o[0] * spread).toFixed(3), +(o[1] * spread).toFixed(3)]);
    }
  }
  return out;
}

export function populate(inp: PopIn): PopOut {
  const { th, tier, level, mods, rng } = inp;
  const tr = FISSURE_TIERS[tier];
  const packs: PackDef[] = [];
  const props: Record<string, PropPlacement[]> = {};
  const zones: Record<string, ZoneDef[]> = {};
  const shrines: PopOut['shrines'] = [];
  const chests: PopOut['chests'] = [];
  let seq = 0;
  const pid = (): string => `f_p${String(++seq).padStart(2, '0')}`;
  const pickTpl = (role: PackRole): PackTpl => {
    const pool = role === 'elite' ? th.elites : th.packs.filter((p) => p.role === role);
    return rng.weighted(pool.length ? pool : th.packs, (p) => p.weight);
  };

  // Yarık Bereketi: one extra elite pack (the first chamber / hall slot that would be a normal pack)
  const bereket = mods.includes('fm_bereket');
  let bereketLeft = bereket ? 1 : 0;

  const nearDoor = (room: PopRoom, p: [number, number], r: number): boolean => room.doorTiles.some((d) => dist(d, p) < r);

  for (const room of inp.rooms) {
    const n = room.node;
    const rect = room.rect;
    const optional = !n.spine;
    if (n.kind === 'start' || n.kind === 'guardian' || n.kind === 'final') continue;
    if (n.kind === 'treasure' || n.kind === 'shrine') {
      // a dead end: the pack stands between door and back wall, the chest / shrine at the back
      const side = (n.doors[0]?.side ?? 'n') as Side;
      const [dx, dz] = DIR[side];
      const c = centerOf(rect);
      const reach = Math.min(rect.w, rect.h) / 2 - 1.6;
      const back: [number, number] = [+(c[0] - dx * reach).toFixed(2), +(c[1] - dz * reach).toFixed(2)];
      const front: [number, number] = [+(c[0] + dx * 0.8).toFixed(2), +(c[1] + dz * 0.8).toFixed(2)];
      if (n.kind === 'treasure') chests.push({ pos: back, kind: tier === 'm' ? 'chest_gold' : 'chest_iron' });
      else shrines.push({ pos: back });
      const tpl = pickTpl(n.kind === 'treasure' ? 'elite' : 'mixed');
      const list = members(scaled(tpl, tier, level, mods));
      const at = clear(room, front, list) ?? fit(rect, front, list);
      packs.push(pack(pid(), room.id, at[0], at[1], undefined, list, { optional }));
      continue;
    }
    // chamber / hall: one pack per archetype slot
    const arch = n.arch;
    if (!arch) continue;
    const hallPacks: PackDef[] = [];
    for (const slot of arch.slots) {
      const center: [number, number] = [rect.x + slot.at[0], rect.z + slot.at[1]];
      let role: PackRole = slot.role;
      if (role === 'elite') role = rng.chance(tr.eliteChance) ? 'elite' : 'trash';
      else if (bereketLeft > 0 && (role === 'trash' || role === 'mixed')) { role = 'elite'; bereketLeft--; }
      const tpl = pickTpl(role);
      const extra: PackExtra = {};
      if (optional) extra.optional = true;
      // behaviours: dormant (crypt), stealth (shadow)
      if (role !== 'elite') {
        if (th.dormant && (role === 'trash' || role === 'swarm') && rng.chance(th.dormant.chance)) extra.dormant = { kind: th.dormant.kind, wakeRadius: th.dormant.wake };
        else if (th.stealthChance && (role === 'trash' || role === 'caster') && rng.chance(th.stealthChance)) extra.stealth = true;
      }
      // hall trash: 25 % patrol one leg across the hall
      if (n.kind === 'hall' && role === 'trash' && !extra.dormant && rng.chance(0.25)) {
        const legs: [number, number][] = [[center[0] + 3, center[1]], [center[0] - 3, center[1]], [center[0], center[1] + 3], [center[0], center[1] - 3]];
        const ok = legs.find((e) => e[0] >= rect.x + 1.5 && e[0] <= rect.x + rect.w - 2.5 && e[1] >= rect.z + 1.5 && e[1] <= rect.z + rect.h - 2.5 && !nearDoor(room, e, 2.6)
          && !arch.slots.some((s) => dist([rect.x + s.at[0], rect.z + s.at[1]], e) < 2.2));
        if (ok) extra.patrol = [center, ok];
      }
      const list = members(scaled(tpl, tier, level, mods));
      const at = clear(room, center, list);
      if (!at || packs.some((q) => q.roomId === room.id && dist(q.center, at) < 2.8)) continue;
      const p = pack(pid(), room.id, at[0], at[1], undefined, list, extra);
      packs.push(p);
      if (n.kind === 'hall' && !extra.patrol) hallPacks.push(p);
    }
    // linked pulls: consecutive hall packs, 50 %
    for (let i = 0; i + 1 < hallPacks.length; i += 2) {
      if (rng.chance(0.5)) hallPacks[i].linkedTo = [hallPacks[i + 1].id];
    }
  }

  // corridors: 60 % hold a small swarm (flat corridors of 3+ tiles, never the first one)
  for (const l of inp.links) {
    if (l.ramp || l.i === 0) continue;
    const r = l.rect;
    const long = l.side === 'e' || l.side === 'w' ? r.w : r.h;
    if (long < 3 || !rng.chance(0.6)) continue;
    const tpl = pickTpl('swarm');
    const c: [number, number] = l.side === 'e' || l.side === 'w' ? [r.x + (r.w - 1) / 2, r.z + 0.5] : [r.x + 0.5, r.z + (r.h - 1) / 2];
    packs.push(pack(pid(), l.roomId, c[0], c[1], undefined, members([[tpl.members[0][0], 4]], 0.9), {}));
  }

  // ---- dressing: scatter, centre props, braziers, rune circles (ids / colours from the theme) ----
  const points = [
    { x: inp.start[0], z: inp.start[1], r: 2.4 },
    { x: inp.exit[0], z: inp.exit[1], r: 2.4 },
    ...inp.bosses.map((b) => ({ x: b.pos[0], z: b.pos[1], r: 3.2 })),
  ];
  const ctx = makeCtx(inp.key, inp.doors, packs, points);
  const torch = th.theme.torchColor;
  const busy = (room: PopRoom, p: [number, number], r: number): boolean =>
    nearDoor(room, p, r + 0.4) || packs.some((pk) => pk.roomId === room.id && dist(pk.center, p) < r + 1.2) || dist(inp.start, p) < r || dist(inp.exit, p) < r;
  for (const room of inp.rooms) {
    const n = room.node;
    if (n.kind === 'guardian' || n.kind === 'final') continue;
    const rect = room.rect;
    const p = new Props(ctx, room.id);
    const c = centerOf(rect);
    const area = Props.inner(rect, 1.3);
    if (n.kind === 'start') {
      // two braziers in the back corners, banners are the builder's business
      const spots: [number, number][] = [[rect.x + 1, rect.z + 1], [rect.x + rect.w - 2, rect.z + rect.h - 2], [rect.x + rect.w - 2, rect.z + 1], [rect.x + 1, rect.z + rect.h - 2]];
      let placed = 0;
      for (const s of spots) {
        if (placed >= 2 || busy(room, s, 1.6)) continue;
        p.at(th.props.brazier, s[0], s[1], { collide: true, light: lt(torch, 1.3, 9, true, 1.3) });
        placed++;
      }
      p.scatter(3, th.props.scatter, area, {}, { minDist: 1.0 });
      zones[room.id] = [circleZone('rune', c[0], c[1], 2.2, { color: th.zoneColor, glow: th.zoneGlow, glowIntensity: 0.5 })];
    } else if (n.kind === 'hall') {
      if (!busy(room, c, 2.4) && !packs.some((pk) => pk.roomId === room.id && pk.patrol?.some((w) => dist(w, c) < 2.6))) {
        p.at(th.props.center, c[0], c[1], { collide: true });
      }
      p.scatter(7, th.props.scatter, area, {}, { minDist: 1.0 });
      zones[room.id] = [circleZone('rune', c[0], c[1], 2.6, { color: th.zoneColor, glow: th.zoneGlow, glowIntensity: 0.45 })];
    } else if (n.kind === 'chamber') {
      p.scatter(4, th.props.scatter, area, {}, { minDist: 1.0 });
    } else {
      p.scatter(n.kind === 'treasure' ? 5 : 3, th.props.scatter, area, {}, { minDist: 1.0 });
    }
    if (p.list.length) props[room.id] = p.list;
  }
  return { packs, props, zones, shrines, chests };
}
