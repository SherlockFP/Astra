import { TILE_SIZE, WORLD_PACK_STRIDE, type BossPlacement, type DoorDef, type DungeonDef, type HeightArea, type PropPlacement, type RoomDef, type TileRect, type TownDef, type ZoneDef } from '../types/dungeons';
import type { QuestDef } from '../types/quests';
import type { EnemyAbility, EnemyDef } from '../types/enemies';
import { MUSIC_IDS, SFX_IDS } from '../types/audio';
import { VFX_IDS } from '../types/vfx';
import { GDD_BOSSES, GDD_ROSTER, GDD_SUMMONS } from './contentRoster';

/**
 * Pure validation logic for the content module (dev/content.html). No DOM here.
 * Two position conventions live in the data (see the COORDINATES note in data/dungeons/kit.ts):
 *  - builder side (props, start, exit): world = pos * TILE_SIZE (DungeonBuilder as it is today),
 *  - scene side (packs, bosses, extras, patrols): world = (pos + 0.5) * TILE_SIZE (types/dungeons.ts contract, DungeonScene, map, affixes).
 */

const T = TILE_SIZE;
/** Scene-side tile coordinate -> world metres. */
export const sceneW = (v: number): number => (v + 0.5) * T;

export interface Issue { level: 'error' | 'warn' | 'info'; where: string; msg: string }
export interface Box3 { min: [number, number, number]; max: [number, number, number] }
export interface ModelInfo { exists: boolean; box?: Box3; skinned?: boolean }
export type ModelDb = Map<string, ModelInfo>;

export interface NavMask { w: number; h: number; walk: Uint8Array; reach: Uint8Array }

export interface DungeonReport {
  id: string;
  issues: Issue[];
  nav: NavMask;
  stats: {
    rooms: number; doors: number; packs: number; bosses: number; props: number; collide: number; lights: number; models: number;
    forcesAll: number; forcesNonOptional: number; forcesRequired: number; ratio: number; enemies: number;
    perRoom: Record<string, { props: number; forces: number }>;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// GLB bounds (port of tools/glb-inspect.mjs, enough for AABB of static props)
// ---------------------------------------------------------------------------------------------------------------------
type M4 = number[];
const I4 = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
interface GNode { children?: number[]; mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; skin?: number }
function trs(n: GNode): M4 {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

interface GltfJson {
  scene?: number;
  scenes?: { nodes: number[] }[];
  nodes?: GNode[];
  meshes?: { primitives: { attributes: { POSITION?: number } }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
}

export function glbBoundsFromBuffer(buf: ArrayBuffer): { box: Box3 | null; skinned: boolean } | null {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) return null;
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson;
  const nodes = json.nodes ?? [];
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let skinned = false;
  const visit = (i: number, parent: M4): void => {
    const n = nodes[i];
    const m = mul(parent, trs(n));
    if (n.skin !== undefined) skinned = true;
    if (n.mesh !== undefined) {
      for (const prim of json.meshes?.[n.mesh]?.primitives ?? []) {
        const acc = json.accessors?.[prim.attributes.POSITION ?? -1];
        if (!acc?.min || !acc?.max) continue;
        for (let c = 0; c < 8; c++) {
          const px = c & 1 ? acc.max[0] : acc.min[0], py = c & 2 ? acc.max[1] : acc.min[1], pz = c & 4 ? acc.max[2] : acc.min[2];
          const wx = m[0] * px + m[4] * py + m[8] * pz + m[12];
          const wy = m[1] * px + m[5] * py + m[9] * pz + m[13];
          const wz = m[2] * px + m[6] * py + m[10] * pz + m[14];
          if (wx < min[0]) min[0] = wx; if (wy < min[1]) min[1] = wy; if (wz < min[2]) min[2] = wz;
          if (wx > max[0]) max[0] = wx; if (wy > max[1]) max[1] = wy; if (wz > max[2]) max[2] = wz;
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  for (const r of roots) visit(r, I4());
  if (!isFinite(min[0])) return { box: null, skinned };
  return { box: { min: min as [number, number, number], max: max as [number, number, number] }, skinned };
}

const SKINNED_DIRS = ['/characters/', '/monsters/', '/enemies/', '/npcs/'];

/** Load existence (content-type check: the dev server answers 200 text/html for missing files) and bounds of every url. */
export async function loadModels(urls: Iterable<string>, db: ModelDb = new Map(), onProgress?: (done: number, total: number) => void): Promise<ModelDb> {
  const list = [...new Set(urls)].filter((u) => !db.has(u));
  let done = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < list.length) {
      const url = list[next++];
      try {
        if (SKINNED_DIRS.some((d) => url.includes(d))) {
          const r = await fetch(url, { method: 'HEAD' });
          const ct = r.headers.get('content-type') ?? '';
          db.set(url, { exists: r.ok && !ct.includes('text/html'), skinned: true });
        } else {
          const r = await fetch(url);
          const ct = r.headers.get('content-type') ?? '';
          if (!r.ok || ct.includes('text/html')) db.set(url, { exists: false });
          else {
            const buf = await r.arrayBuffer();
            const b = glbBoundsFromBuffer(buf);
            if (!b) db.set(url, { exists: false });
            else db.set(url, { exists: true, box: b.box ?? undefined, skinned: b.skinned });
          }
        }
      } catch {
        db.set(url, { exists: false });
      }
      onProgress?.(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return db;
}

export const defaultBox: Box3 = { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };

// ---------------------------------------------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------------------------------------------
interface Seg { x0: number; z0: number; x1: number; z1: number }
export interface DoorGeo { def: DoorDef; line: 'x' | 'z'; at: number; lo: number; hi: number }

export function doorGeo(d: DoorDef): DoorGeo {
  const [tx, tz] = d.tile;
  const w = d.width ?? 1;
  if (d.side === 'n') return { def: d, line: 'z', at: tz * T, lo: tx * T, hi: (tx + w) * T };
  if (d.side === 's') return { def: d, line: 'z', at: (tz + 1) * T, lo: tx * T, hi: (tx + w) * T };
  if (d.side === 'w') return { def: d, line: 'x', at: tx * T, lo: tz * T, hi: (tz + w) * T };
  return { def: d, line: 'x', at: (tx + 1) * T, lo: tz * T, hi: (tz + w) * T };
}

export const rectOf = (r: RoomDef) => ({ x0: r.rect.x * T, z0: r.rect.z * T, x1: (r.rect.x + r.rect.w) * T, z1: (r.rect.z + r.rect.h) * T });

function wallSegments(def: DungeonDef, doors: DoorGeo[]): Seg[] {
  const segs: Seg[] = [];
  for (const r of def.rooms) {
    const b = rectOf(r);
    const edges: { line: 'x' | 'z'; at: number; lo: number; hi: number }[] = [
      { line: 'z', at: b.z0, lo: b.x0, hi: b.x1 }, { line: 'z', at: b.z1, lo: b.x0, hi: b.x1 },
      { line: 'x', at: b.x0, lo: b.z0, hi: b.z1 }, { line: 'x', at: b.x1, lo: b.z0, hi: b.z1 },
    ];
    for (const e of edges) {
      let pieces: [number, number][] = [[e.lo, e.hi]];
      for (const d of doors) {
        if (d.line !== e.line || Math.abs(d.at - e.at) > 0.01) continue;
        const next: [number, number][] = [];
        for (const [a, c] of pieces) {
          if (d.hi <= a || d.lo >= c) { next.push([a, c]); continue; }
          if (d.lo > a) next.push([a, d.lo]);
          if (d.hi < c) next.push([d.hi, c]);
        }
        pieces = next;
      }
      for (const [a, c] of pieces) segs.push(e.line === 'z' ? { x0: a, z0: e.at, x1: c, z1: e.at } : { x0: e.at, z0: a, x1: e.at, z1: c });
    }
  }
  return segs;
}

function distToSeg(px: number, pz: number, s: Seg): number {
  const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / l2));
  return Math.hypot(px - (s.x0 + dx * t), pz - (s.z0 + dz * t));
}

/**
 * Posed character statues: the builder measures their collider on the skinned vertices of the frozen first frame (world/Decor
 * posedFootprint: lower 60 %, 5 % trimmed). These are those measurements per unit scale (w x d at rot 0, centre offset), taken
 * headless from the GLBs; unknown models fall back to a 1.1 m square.
 */
const POSED_BOX: Record<string, { w: number; d: number; cx: number; cz: number }> = {
  'Demon_Lord:Idle': { w: 2.727, d: 1.32, cx: -0.007, cz: 0.033 },
  'Knight:Blocking': { w: 1.04, d: 1.05, cx: -0.1, cz: 0.34 },
};

/** Footprint of a collide prop exactly like DungeonBuilder.addProp / blockRect. */
export function propFootprint(p: PropPlacement, box: Box3): { cx: number; cz: number; hx: number; hz: number; rot: number } {
  const scale = p.scale ?? 1;
  const rot = ((p.rot ?? 0) * Math.PI) / 180;
  const x = sceneW(p.pos[0]), z = sceneW(p.pos[1]);
  if (p.pose) {
    // posed statue: the builder blocks a WORLD-aligned rect around the measured body, so rotate the measurement into an AABB
    const base = (p.model.split('/').pop() ?? '').replace(/\.(glb|gltf)$/i, '');
    const q = POSED_BOX[base + ':' + p.pose] ?? { w: 1.1, d: 1.1, cx: 0, cz: 0 };
    const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    return {
      cx: x + (q.cx * Math.cos(rot) + q.cz * Math.sin(rot)) * scale,
      cz: z + (-q.cx * Math.sin(rot) + q.cz * Math.cos(rot)) * scale,
      hx: Math.max(0.35, ((c * q.w + sn * q.d) / 2) * scale * 0.92),
      hz: Math.max(0.35, ((sn * q.w + c * q.d) / 2) * scale * 0.92),
      rot: 0,
    };
  }
  const sx = box.max[0] - box.min[0], sz = box.max[2] - box.min[2];
  const bcx = (box.min[0] + box.max[0]) / 2, bcz = (box.min[2] + box.max[2]) / 2;
  const cx = x + (bcx * Math.cos(rot) + bcz * Math.sin(rot)) * scale;
  const cz = z + (-bcx * Math.sin(rot) + bcz * Math.cos(rot)) * scale;
  return { cx, cz, hx: (sx * scale) / 2 * 0.92, hz: (sz * scale) / 2 * 0.92, rot };
}

function blockRect(nav: NavMask, cx: number, cz: number, hx: number, hz: number, rot: number, m = 0.28): void {
  const rad = Math.hypot(hx, hz) + 1;
  const i0 = Math.max(0, Math.floor(cx - rad)), i1 = Math.min(nav.w - 1, Math.ceil(cx + rad));
  const j0 = Math.max(0, Math.floor(cz - rad)), j1 = Math.min(nav.h - 1, Math.ceil(cz + rad));
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const dx = i + 0.5 - cx, dz = j + 0.5 - cz;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) <= hx + m && Math.abs(lz) <= hz + m) nav.walk[j * nav.w + i] = 0;
  }
}
function blockCircle(nav: NavMask, cx: number, cz: number, r: number): void {
  const i0 = Math.max(0, Math.floor(cx - r - 1)), i1 = Math.min(nav.w - 1, Math.ceil(cx + r + 1));
  const j0 = Math.max(0, Math.floor(cz - r - 1)), j1 = Math.min(nav.h - 1, Math.ceil(cz + r + 1));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(i + 0.5 - cx, j + 0.5 - cz) <= r) nav.walk[j * nav.w + i] = 0;
}

export function buildNav(def: DungeonDef, models: ModelDb): NavMask {
  const W = def.grid.w * T, H = def.grid.h * T;
  const nav: NavMask = { w: W, h: H, walk: new Uint8Array(W * H), reach: new Uint8Array(W * H) };
  const doors = def.doors.map(doorGeo);
  // open-world maps: walkable = union of the room rects (rooms touch each other without walls, see worldIssues)
  const segs = def.world ? [] : wallSegments(def, doors);
  const rects = def.rooms.map(rectOf);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = i + 0.5, pz = j + 0.5;
    if (!rects.some((b) => px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1)) continue;
    let ok = true;
    for (const s of segs) if (distToSeg(px, pz, s) < 0.55) { ok = false; break; }
    if (ok) nav.walk[j * W + i] = 1;
  }
  // door posts
  for (const d of doors) {
    for (const e of [d.lo, d.hi]) blockCircle(nav, d.line === 'z' ? e : d.at, d.line === 'z' ? d.at : e, 0.65);
  }
  // zones apply in array order: blocked zones close cells, bridge / dais zones re-open the cells the layout made walkable
  const base = nav.walk.slice();
  for (const r of def.rooms) for (const z of r.zones ?? []) {
    const reopen = !z.blocked && (z.kind === 'bridge' || z.kind === 'dais');
    if (!z.blocked && !reopen) continue;
    const x0 = z.rect.x * T, z0 = z.rect.z * T, w = z.rect.w * T, h = z.rect.h * T;
    const set = (i: number, j: number): void => { if (i >= 0 && j >= 0 && i < W && j < H) nav.walk[j * W + i] = reopen ? base[j * W + i] : 0; };
    for (let j = Math.floor(z0); j < Math.ceil(z0 + h); j++) for (let i = Math.floor(x0); i < Math.ceil(x0 + w); i++) {
      if (z.shape === 'circle' && Math.hypot(i + 0.5 - (x0 + w / 2), j + 0.5 - (z0 + h / 2)) > w / 2) continue;
      set(i, j);
    }
  }
  // collide props
  for (const r of def.rooms) for (const p of r.props ?? []) {
    if (!p.collide) continue;
    const info = models.get(p.model);
    const box = info?.box ?? defaultBox;
    const f = propFootprint(p, box);
    if (Math.max(f.hx, f.hz) < 0.25) continue;
    blockRect(nav, f.cx, f.cz, f.hx, f.hz, f.rot);
  }
  return nav;
}

function flood(nav: NavMask, sx: number, sz: number): void {
  nav.reach.fill(0);
  let i0 = Math.floor(sx), j0 = Math.floor(sz);
  // spawn area is cleared by the builder (r 2.2): start inside the nearest walkable cell
  let best = -1, bd = 1e9;
  for (let j = j0 - 3; j <= j0 + 3; j++) for (let i = i0 - 3; i <= i0 + 3; i++) {
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h || !nav.walk[j * nav.w + i]) continue;
    const d = Math.hypot(i + 0.5 - sx, j + 0.5 - sz);
    if (d < bd) { bd = d; best = j * nav.w + i; }
  }
  if (best < 0) return;
  const stack = [best];
  nav.reach[best] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const ci = c % nav.w, cj = (c / nav.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= nav.w || nj >= nav.h) continue;
      const n = nj * nav.w + ni;
      if (nav.walk[n] && !nav.reach[n]) { nav.reach[n] = 1; stack.push(n); }
    }
  }
}

/** True when every cell within radius r (m) of (x,z) is walkable. */
function clearAt(nav: NavMask, x: number, z: number, r: number, mask: Uint8Array = nav.walk): boolean {
  for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
    if (Math.hypot(i + 0.5 - x, j + 0.5 - z) > r + 0.2) continue;
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h || !mask[j * nav.w + i]) return false;
  }
  return true;
}

export const roomAtTile = (def: DungeonDef, wx: number, wz: number): RoomDef | undefined =>
  def.rooms.find((r) => { const b = rectOf(r); return wx > b.x0 && wx < b.x1 && wz > b.z0 && wz < b.z1; });

// ---------------------------------------------------------------------------------------------------------------------
// Dungeon check
// ---------------------------------------------------------------------------------------------------------------------
export function dungeonUrls(def: DungeonDef): string[] {
  const out = new Set<string>();
  for (const r of def.rooms) for (const p of r.props ?? []) out.add(p.model);
  // P-14 NPC models, P-08 sky images (textures and panoramas: existence only)
  for (const n of def.extras?.npcs ?? []) out.add(n.model);
  if (def.theme.sky?.image) out.add(def.theme.sky.image);
  for (const r of def.rooms) if (r.sky?.image) out.add(r.sky.image);
  // open-world map: village props and npcs, region ground textures and panoramas
  for (const v of def.world?.villages ?? []) {
    for (const p of v.props) out.add(p.model);
    for (const n of v.npcs) { const u = npcUrl(n.model); if (u) out.add(u); }
  }
  for (const r of def.world?.regions ?? []) {
    for (const u of Object.values(r.theme.groundTex)) out.add(u);
    if (r.theme.skyImage) out.add(r.theme.skyImage);
  }
  return [...out];
}

const BOSS_RE = /^boss_/;
/** Flyers may hover over blocked ground (lava, pits). */
const FLYING = new Set(['bone_skull', 'flame_skull', 'forge_imp', 'crypt_wraith', 'frost_wraith', 'ice_bat', 'shade', 'void_imp', 'ow_bat']);

/**
 * Prop ids whose positions are baked into the boss scripts (copies of the tables in src/ai/bosses/*.ts; GDD coordinates).
 * If a script's table changes, change it here and in the dungeon file.
 */
export const BOSS_ANCHORS: Record<string, Record<string, [number, number]>> = {
  golge_tapinagi: {
    seal_socket_1: [15, 6.5], seal_socket_2: [24, 6.5], seal_socket_3: [15, 11.5], seal_socket_4: [24, 11.5],
    priest_platform_1: [15, 3], priest_platform_2: [24, 3], priest_platform_3: [15, 10], priest_platform_4: [24, 10],
    rift_spot_1: [32, 10], rift_spot_2: [38, 10], rift_spot_3: [35, 15],
  },
  kemik_mahzeni: { phylactery_1: [15.5, 31], phylactery_2: [25, 31], phylactery_3: [20, 37], soul_well: [33, 21] },
  buzul_tahti: {
    pylon_1: [17, 2], pylon_2: [23, 2], pylon_3: [17, 8], pylon_4: [23, 8],
    ice_pillar_1: [30.5, 30.5], ice_pillar_2: [36.5, 30.5], ice_pillar_3: [30.5, 35], ice_pillar_4: [36.5, 35],
  },
  kizil_dokumhane: { vent_1: [27, 30], vent_2: [33, 30], vent_3: [27, 36], vent_4: [33, 36], crucible_11: [11, 2.2], crucible_15: [15, 2.2], crucible_19: [19, 2.2] },
};

// ---------------------------------------------------------------------------------------------------------------------
// Vertical dungeons (ENGINE_VERTICALITY §17 validator, V3). Data-only: no three.js, no Heightfield import (this file also
// feeds dev/content.html; Heightfield lands with V1). Floors are rebuilt here per 2 m cell (half a tile) using the same
// resolution order as §4: room floorY, heightAreas, bridge/dais zone y, fall holes (rim - depth), slopes, lifts.
// ---------------------------------------------------------------------------------------------------------------------
/** Mirrors VERT (§2) for the checks below; keep in sync with src/world/Heightfield.ts once it exists. */
const VZ = {
  STEP_UP: 0.45, MAX_GRADE: 0.8, TREAD_RISE: 0.28, TREAD_RISE_MAX: 0.3, TREAD_DEPTH_MIN: 0.45,
  CEIL_MIN: 3, CEIL_LEGACY: 4, CEIL_WARN_MAX: 30, Y_MIN: -60, Y_MAX: 120, FALL_DEPTH: 9, FALL_DEPTH_MAX: 30,
  LIFT_MATCH: 0.15, TIER_CLEAR: 1, TILE_M: 4,
} as const;
const VERTICAL_FALL_KINDS = new Set<ZoneDef['kind']>(['void', 'pit', 'lava']);
const LIFT_MODES = new Set(['call', 'auto', 'script']);

/** True when any §3 vertical field is present on the dungeon or its rooms / zones. */
export function hasVerticalFields(def: DungeonDef): boolean {
  if (def.vertical !== undefined || def.lifts !== undefined) return true;
  return def.rooms.some((r) =>
    r.floorY !== undefined || r.ceiling !== undefined || r.heightAreas !== undefined || r.slopes !== undefined ||
    r.tiers !== undefined || r.openAir !== undefined || (r.zones ?? []).some((z) => z.fall !== undefined || z.depth !== undefined));
}

interface VCell { room: number; floor: number; solid: boolean; fall: boolean; slope: boolean; lift: boolean; area: HeightArea | null }

const vFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHalf = (v: number): boolean => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
const rectInside = (inner: TileRect, outer: TileRect): boolean =>
  inner.x >= outer.x && inner.z >= outer.z && inner.x + inner.w <= outer.x + outer.w && inner.z + inner.h <= outer.z + outer.h;
/** Stair treads, same body as treadCount in §4 (kept local so this file has no dependency on the V1 module). */
export const verticalTreadCount = (yFrom: number, yTo: number): number => Math.max(2, Math.ceil(Math.abs(yTo - yFrom) / VZ.TREAD_RISE));

/**
 * Vertical-dungeon rules E1-E10 (ENGINE_VERTICALITY §17; the numbered list there is referenced by §5, §13, §18 but was never
 * written out, so the numbering below is the one used by the checks and by docs/ENGINE_VERTICALITY.md §18):
 *  E1 shape: rects are positive, on 0.5-tile multiples and inside their room; slope axis/kind valid; start/heights finite.
 *  E2 range: every absolute height (room floor, area, slope end, tier, lift stop, bridge/dais deck, fall floor) in Y_MIN..Y_MAX.
 *  E3 steps: an unrimmed 4-neighbour step > STEP_UP inside a room (outside slopes, lifts, falls) is an error when the high side
 *     has rim 'none'. 'rail' / 'ledge' high sides are finished by the rim pass (§5.3).
 *  E4 lifts: >= 2 strictly ascending stops, valid start/speed/dwell/mode, pad >= 0.5 x 0.5 tile and inside its room.
 *  E5 doors: across each door tile pair |Δ| <= STEP_UP unless one side is a slope.
 *  E6 lifts: every stop equals an adjoining floor (within 0.15 m) so stepping on and off obeys the normal step rule.
 *  E7 falls: `fall` only on void/pit/lava; `depth` in (0, 30] m.
 *  E8 tiers: y above the room's lowest floor under the tier and below its roof (ceiling, or the legacy 4 m).
 *  E9 ceilings: ceiling >= CEIL_MIN (3 m); > 30 m warns; a room without ceiling in a vertical dungeon warns (legacy 4 m).
 *  E10 scope: vertical fields are ignored (warn) on non-vertical dungeons, and on outdoor / world maps (§17.7).
 */
export function checkVerticalDungeon(def: DungeonDef): Issue[] {
  const out: Issue[] = [];
  const id = def.id;
  const err = (where: string, msg: string): void => { out.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { out.push({ level: 'warn', where, msg }); };
  const info = (where: string, msg: string): void => { out.push({ level: 'info', where, msg }); };

  // E10: scope
  if (!def.vertical) {
    if (hasVerticalFields(def)) warn(id, 'vertical fields are set but `vertical` is not true: they are ignored (§17.7)');
    return out;
  }
  if (def.outdoor || def.world) { warn(id, 'vertical is set on an outdoor / world map: vertical fields are ignored in v1 (§17.7)'); return out; }

  const W = def.grid.w, H = def.grid.h, zw = W * 2, zh = H * 2;
  const rooms = def.rooms;
  const roomIdx = new Map(rooms.map((r, i) => [r.id, i]));
  const tileRoom = new Int16Array(W * H).fill(-1);
  rooms.forEach((r, ri) => {
    for (let tz = Math.max(0, r.rect.z); tz < Math.min(H, r.rect.z + r.rect.h); tz++)
      for (let tx = Math.max(0, r.rect.x); tx < Math.min(W, r.rect.x + r.rect.w); tx++) tileRoom[tz * W + tx] = ri;
  });
  const cellRoom = (zi: number, zj: number): number => (zi < 0 || zj < 0 || zi >= zw || zj >= zh ? -1 : tileRoom[(zj >> 1) * W + (zi >> 1)]);
  const inGrid = (zi: number, zj: number): boolean => zi >= 0 && zj >= 0 && zi < zw && zj < zh;
  const cellsOf = (rect: TileRect): { x0: number; x1: number; z0: number; z1: number } =>
    ({ x0: Math.round(rect.x * 2), x1: Math.round((rect.x + rect.w) * 2), z0: Math.round(rect.z * 2), z1: Math.round((rect.z + rect.h) * 2) });
  const forCells = (rect: TileRect, ri: number, fn: (c: VCell, idx: number) => void): void => {
    const { x0, x1, z0, z1 } = cellsOf(rect);
    for (let zj = Math.max(0, z0); zj < Math.min(zh, z1); zj++)
      for (let zi = Math.max(0, x0); zi < Math.min(zw, x1); zi++) if (cellRoom(zi, zj) === ri) fn(cells[zj * zw + zi], zj * zw + zi);
  };

  // ---- E1 shape (before the floors are built, so a bad rect is reported once and cannot skew them) ----
  for (const r of rooms) {
    const shapeOk = (rect: TileRect, where: string, what: string): boolean => {
      if (![rect.x, rect.z, rect.w, rect.h].every(vFinite)) { err(where, `${what}: non-finite rect`); return false; }
      if (rect.w <= 0 || rect.h <= 0) { err(where, `${what}: empty rect`); return false; }
      if (![rect.x, rect.z, rect.w, rect.h].every(isHalf)) err(where, `${what}: rect is not on 0.5-tile multiples`);
      if (!rectInside(rect, r.rect)) err(where, `${what}: rect is outside room ${r.id}`);
      return true;
    };
    (r.heightAreas ?? []).forEach((a, i) => { shapeOk(a.rect, `room ${r.id}`, `heightArea ${a.id ?? i}`); });
    (r.slopes ?? []).forEach((s, i) => {
      const where = `room ${r.id}`;
      if (!shapeOk(s.rect, where, `slope ${s.id ?? i}`)) return;
      if (s.axis !== 'x' && s.axis !== 'z') err(where, `slope ${s.id ?? i}: axis must be x or z`);
      if (s.kind !== 'stairs' && s.kind !== 'ramp') err(where, `slope ${s.id ?? i}: kind must be stairs or ramp`);
      if (!vFinite(s.yFrom) || !vFinite(s.yTo)) return;
      const run = (s.axis === 'x' ? s.rect.w : s.rect.h) * VZ.TILE_M;
      const rise = Math.abs(s.yTo - s.yFrom);
      if (s.kind === 'ramp' && rise / run > VZ.MAX_GRADE + 1e-9) err(where, `ramp ${s.id ?? ''}: grade ${(rise / run).toFixed(2)} > ${VZ.MAX_GRADE}`);
      if (s.kind === 'stairs') {
        const n = verticalTreadCount(s.yFrom, s.yTo);
        if (rise / n > VZ.TREAD_RISE_MAX + 1e-9) err(where, `stairs ${s.id ?? ''}: tread rise ${(rise / n).toFixed(3)} > ${VZ.TREAD_RISE_MAX}`);
        if (run / n < VZ.TREAD_DEPTH_MIN) warn(where, `stairs ${s.id ?? ''}: tread depth ${(run / n).toFixed(2)} m < ${VZ.TREAD_DEPTH_MIN}`);
      }
    });
    (r.tiers ?? []).forEach((t, i) => { shapeOk(t.rect, `room ${r.id}`, `tier ${i} (${t.kind})`); });
  }
  const [sx, sz] = [Math.floor(def.start.pos[0]), Math.floor(def.start.pos[1])];
  if (sx < 0 || sz < 0 || sx >= W || sz >= H) err(id, `start (${def.start.pos.join(', ')}) is outside the grid`);
  else if (tileRoom[sz * W + sx] < 0) err(id, `start (${def.start.pos.join(', ')}) is not inside any room`);

  // ---- floors per 2 m cell (§4 order) ----
  const cells: VCell[] = new Array(zw * zh);
  for (let zj = 0; zj < zh; zj++) for (let zi = 0; zi < zw; zi++) {
    const ri = cellRoom(zi, zj);
    cells[zj * zw + zi] = { room: ri, floor: ri >= 0 ? (rooms[ri].floorY ?? 0) : 0, solid: ri < 0, fall: false, slope: false, lift: false, area: null };
  }
  const fallDepth = new Map<number, number>();
  rooms.forEach((r, ri) => {
    for (const a of r.heightAreas ?? []) forCells(a.rect, ri, (c) => { c.floor = a.y; c.area = a; });
    for (const z of r.zones ?? []) {
      if ((z.kind === 'bridge' || z.kind === 'dais') && z.y !== undefined) forCells(z.rect, ri, (c) => { c.floor = z.y as number; });
      if (z.fall !== undefined && VERTICAL_FALL_KINDS.has(z.kind)) forCells(z.rect, ri, (c, idx) => { c.fall = true; fallDepth.set(idx, z.depth ?? VZ.FALL_DEPTH); });
    }
    for (const s of r.slopes ?? []) forCells(s.rect, ri, (c) => { c.slope = true; });
  });
  for (const l of def.lifts ?? []) {
    const ri = roomIdx.get(l.roomId);
    if (ri === undefined) { err(`lift ${l.id}`, `unknown room ${l.roomId}`); continue; }
    if (l.stops.length) forCells(l.rect, ri, (c) => { c.lift = true; c.floor = Math.min(...l.stops); });
  }
  // fall holes: rim (max floor of the non-fall 4-neighbours) minus depth
  for (const [idx, depth] of fallDepth) {
    const zi = idx % zw, zj = Math.floor(idx / zw), c = cells[idx];
    let rim = -Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = zi + dx, nj = zj + dz;
      if (!inGrid(ni, nj)) continue;
      const n = cells[nj * zw + ni];
      if (!n.solid && !n.fall && n.room === c.room && n.floor > rim) rim = n.floor;
    }
    c.floor = (rim === -Infinity ? c.floor : rim) - depth;
  }

  // per room: lowest floor and top (for ceilings, §4: max floor incl. slope ends and lift stops, + ceiling)
  const roomMax = rooms.map(() => -Infinity), roomMin = rooms.map(() => Infinity);
  cells.forEach((c) => {
    if (c.solid || c.fall || !vFinite(c.floor)) return;
    roomMax[c.room] = Math.max(roomMax[c.room], c.floor);
    roomMin[c.room] = Math.min(roomMin[c.room], c.floor);
  });
  rooms.forEach((r, ri) => {
    for (const s of r.slopes ?? []) if (vFinite(s.yFrom) && vFinite(s.yTo)) roomMax[ri] = Math.max(roomMax[ri], s.yFrom, s.yTo);
  });
  for (const l of def.lifts ?? []) {
    const ri = roomIdx.get(l.roomId);
    if (ri !== undefined) for (const s of l.stops) if (vFinite(s)) roomMax[ri] = Math.max(roomMax[ri], s);
  }
  const roofOf = (ri: number): number => {
    const r = rooms[ri];
    if (r.openAir) return Infinity;
    return roomMax[ri] + (r.ceiling ?? VZ.CEIL_LEGACY);
  };

  // ---- E2 range ----
  const range = (where: string, v: number, what: string): void => {
    if (!vFinite(v)) err(where, `${what} is not a finite number`);
    else if (v < VZ.Y_MIN || v > VZ.Y_MAX) err(where, `${what} ${v} m is outside ${VZ.Y_MIN}..${VZ.Y_MAX}`);
  };
  for (const r of rooms) {
    const where = `room ${r.id}`;
    if (r.floorY !== undefined) range(where, r.floorY, 'floorY');
    for (const a of r.heightAreas ?? []) range(where, a.y, 'heightArea y');
    for (const s of r.slopes ?? []) { range(where, s.yFrom, 'slope yFrom'); range(where, s.yTo, 'slope yTo'); }
    for (const t of r.tiers ?? []) range(where, t.y, `tier ${t.kind} y`);
    for (const z of r.zones ?? []) if (z.y !== undefined && (z.kind === 'bridge' || z.kind === 'dais')) range(where, z.y, `${z.kind} deck y`);
  }
  for (const l of def.lifts ?? []) {
    l.stops.forEach((s, i) => range(`lift ${l.id}`, s, `stop ${i}`));
    if (l.stops.length < 2) err(`lift ${l.id}`, 'needs at least 2 stops');
    for (let i = 1; i < l.stops.length; i++) if (!(l.stops[i] > l.stops[i - 1])) err(`lift ${l.id}`, 'stops must be strictly ascending');
    const where = `lift ${l.id}`;
    if (!(l.rect.w >= 0.5 && l.rect.h >= 0.5)) err(where, 'pad is smaller than 0.5 x 0.5 tile (2 x 2 m)');
    if (!roomIdx.has(l.roomId)) err(where, `unknown room ${l.roomId}`);
    else if (!rectInside(l.rect, rooms[roomIdx.get(l.roomId) as number].rect)) err(where, 'pad is outside its room');
    const start = l.start ?? 0;
    if (!Number.isInteger(start) || start < 0 || start >= l.stops.length) err(where, `start index ${start} is out of range`);
    if (l.speed !== undefined && !(l.speed > 0)) err(where, 'speed must be > 0');
    if (l.dwell !== undefined && !(l.dwell >= 0)) err(where, 'dwell must be >= 0');
    if (l.mode !== undefined && !LIFT_MODES.has(l.mode)) err(where, `unknown mode ${l.mode}`);
  }
  cells.forEach((c, idx) => {
    if (c.solid || !vFinite(c.floor) || (c.floor >= VZ.Y_MIN && c.floor <= VZ.Y_MAX)) return;
    const ri = c.room;
    err(`room ${rooms[ri].id}`, `cell (${idx % zw},${Math.floor(idx / zw)}) floor ${c.floor.toFixed(2)} m is outside ${VZ.Y_MIN}..${VZ.Y_MAX}`);
  });

  // ---- E3 unrimmed steps inside rooms ----
  const nearSlope = (zi: number, zj: number): boolean => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const ni = zi + dx, nj = zj + dz;
    return inGrid(ni, nj) && cells[nj * zw + ni].slope;
  });
  const unrimmed = new Map<number, { n: number; first: string; maxD: number }>();
  for (let zj = 0; zj < zh; zj++) for (let zi = 0; zi < zw; zi++) {
    const c = cells[zj * zw + zi];
    if (c.solid || c.fall || c.slope || c.lift) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
      const ni = zi + dx, nj = zj + dz;
      if (!inGrid(ni, nj)) continue;
      const n = cells[nj * zw + ni];
      if (n.solid || n.fall || n.slope || n.lift || n.room !== c.room) continue;
      if (nearSlope(zi, zj) || nearSlope(ni, nj)) continue;
      const d = c.floor - n.floor;
      if (Math.abs(d) <= VZ.STEP_UP + 1e-3) continue;
      const high = d > 0 ? c : n;
      const rim = high.area?.rim ?? 'rail';
      if (rim !== 'none') continue;
      const u = unrimmed.get(c.room) ?? { n: 0, first: `cells (${zi},${zj})-(${ni},${nj})`, maxD: 0 };
      u.n++; u.maxD = Math.max(u.maxD, Math.abs(d)); unrimmed.set(c.room, u);
    }
  }
  for (const [ri, u] of unrimmed) err(`room ${rooms[ri].id}`, `${u.n} unrimmed step(s) up to ${u.maxD.toFixed(2)} m (rim 'none'), first at ${u.first}: add a slope or a rail/ledge`);

  // ---- E5 doors ----
  for (const d of def.doors) {
    const a = roomIdx.get(d.a), b = roomIdx.get(d.b);
    if (a === undefined || b === undefined) continue;
    const where = `door ${d.a}|${d.b}`;
    const w = d.width ?? 1;
    for (let k = 0; k < w; k++) for (let s = 0; s < 2; s++) {
      const tx = d.tile[0] + (d.side === 'n' || d.side === 's' ? k : 0);
      const tz = d.tile[1] + (d.side === 'e' || d.side === 'w' ? k : 0);
      let ax: number, az: number, bx: number, bz: number;
      if (d.side === 'e') { ax = 2 * tx + 1; az = 2 * tz + s; bx = 2 * tx + 2; bz = az; }
      else if (d.side === 'w') { ax = 2 * tx; az = 2 * tz + s; bx = 2 * tx - 1; bz = az; }
      else if (d.side === 's') { ax = 2 * tx + s; az = 2 * tz + 1; bx = ax; bz = 2 * tz + 2; }
      else { ax = 2 * tx + s; az = 2 * tz; bx = ax; bz = 2 * tz - 1; }
      if (!inGrid(ax, az) || !inGrid(bx, bz)) continue;
      const ca = cells[az * zw + ax], cb = cells[bz * zw + bx];
      if (ca.solid || cb.solid || ca.slope || cb.slope || ca.fall || cb.fall) continue;
      const dd = ca.floor - cb.floor;
      if (Math.abs(dd) > VZ.STEP_UP + 1e-3) err(where, `step ${Math.abs(dd).toFixed(2)} m across the door at tile ${tx},${tz}: needs |Δ| <= ${VZ.STEP_UP} or a slope`);
    }
  }

  // ---- E6 lift stops vs adjoining floors ----
  for (const l of def.lifts ?? []) {
    const ri = roomIdx.get(l.roomId);
    if (ri === undefined) continue;
    const { x0, x1, z0, z1 } = cellsOf(l.rect);
    const ring: number[] = [];
    for (let zi = x0; zi < x1; zi++) { ring.push(...[z0 - 1, z1].map((zj) => (inGrid(zi, zj) ? zj * zw + zi : -1))); }
    for (let zj = z0; zj < z1; zj++) { ring.push(...[x0 - 1, x1].map((zi) => (inGrid(zi, zj) ? zj * zw + zi : -1))); }
    const floors = ring.filter((i) => i >= 0 && cellRoom(i % zw, Math.floor(i / zw)) === ri)
      .map((i) => cells[i]).filter((c) => !c.solid && !c.fall && !c.lift).map((c) => c.floor);
    l.stops.forEach((s, i) => {
      if (!vFinite(s)) return;
      if (!floors.some((f) => Math.abs(f - s) <= VZ.LIFT_MATCH + 1e-6)) err(`lift ${l.id}`, `stop ${i} (${s} m) matches no adjoining floor within ${VZ.LIFT_MATCH} m (E6)`);
    });
  }

  // ---- E7 falls ----
  rooms.forEach((r) => {
    for (const z of r.zones ?? []) {
      if (z.fall === undefined && z.depth === undefined) continue;
      const where = `room ${r.id} zone ${z.kind}`;
      if (!VERTICAL_FALL_KINDS.has(z.kind)) err(where, 'fall / depth are only valid on void, pit or lava zones (E7)');
      if (z.depth !== undefined && !(z.depth > 0 && z.depth <= VZ.FALL_DEPTH_MAX)) err(where, `depth ${z.depth} must be in (0, ${VZ.FALL_DEPTH_MAX}] m`);
    }
  });

  // ---- E8 tiers, E9 ceilings ----
  rooms.forEach((r, ri) => {
    if (r.openAir) { if (r.ceiling !== undefined) info(`room ${r.id}`, 'ceiling ignored on an openAir room'); return; }
    const where = `room ${r.id}`;
    if (r.ceiling === undefined) warn(where, 'vertical dungeon room without ceiling: legacy 4 m geometry (set tall() or ceiling)');
    else if (!vFinite(r.ceiling) || r.ceiling < VZ.CEIL_MIN) err(where, `ceiling ${r.ceiling} m is below ${VZ.CEIL_MIN} m (E9)`);
    else if (r.ceiling > VZ.CEIL_WARN_MAX) warn(where, `ceiling ${r.ceiling} m is above ${VZ.CEIL_WARN_MAX} m`);
    const roof = roofOf(ri);
    for (const t of r.tiers ?? []) {
      let low = Infinity;
      forCells(t.rect, ri, (c) => { if (!c.solid && !c.fall) low = Math.min(low, c.floor); });
      if (low !== Infinity && t.y < low + VZ.TIER_CLEAR) err(where, `tier ${t.kind} at y ${t.y} is not ${VZ.TIER_CLEAR} m above the floor under it (${low.toFixed(2)})`);
      if (vFinite(roof) && t.y > roof - VZ.TIER_CLEAR) err(where, `tier ${t.kind} at y ${t.y} is above the roof (${roof.toFixed(2)})`);
    }
    if (roofOf(ri) !== Infinity && roomMin[ri] !== Infinity) {
      info(where, `floors ${roomMin[ri].toFixed(2)}..${roomMax[ri].toFixed(2)} m, roof ${roofOf(ri).toFixed(2)} m`);
    }
  });

  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Season content rules (K20, docs/dungeons/_shared_primitives.md P-29). The registries come from the caller
// (tools/content-check.mjs, dev/content) so this file keeps no data imports. A missing registry turns its rules off.
// Season dungeons (`isSeasonDungeon`) get errors; the four legacy dungeons get the same findings as warnings.
// ---------------------------------------------------------------------------------------------------------------------

/** Data the season rules resolve ids against. Every field is optional: a missing registry switches its rules off. */
export interface ContentRegistries {
  /** STATUSES keys (data/statuses.ts). */
  statuses?: ReadonlySet<string>;
  /** DEVICES (data/devices.ts): effect, and for `open_gate` the door it opens. */
  devices?: Readonly<Record<string, { effect: string; gateDoor?: string }>>;
  /** UNIQUES keys (data/uniques.ts). */
  uniques?: ReadonlySet<string>;
  /** Every loot table (data/loot.ts) by id, with its unique list. */
  lootTables?: Readonly<Record<string, { uniqueIds?: string[] }>>;
  /** CLASS_IDS (data/classes.ts). */
  classes?: ReadonlySet<string>;
  /** PROFESSION_NAMES keys (data/devices.ts). */
  professions?: ReadonlySet<string>;
  /** hasProcModel (ai/procModels.ts): does a `PROC:<key>` model have a builder. */
  hasProc?: (key: string) => boolean;
  /** ENEMIES and BOSSES, full definitions. */
  enemyDef?: (id: string) => EnemyDef | undefined;
  /** BOSSES keys. Season bosses are checked here instead of the GDD roster. */
  bossIds?: ReadonlySet<string>;
}

/** Inputs the season rules take from checkDungeon. */
export interface SeasonCtx {
  nav: NavMask;
  reachable: (wx: number, wz: number) => boolean;
  enemyForces: (eid: string) => number | undefined;
  forces: { all: number; mandatory: number; required: number };
}

export const isSeasonDungeon = (def: DungeonDef): boolean => def.season !== undefined || def.endgame === true;

const HAZARD_KINDS: readonly string[] = ['lava_burst', 'icicle_drop', 'debris_fall', 'plague_vent', 'lightning_strike'];
const GATE_KINDS: readonly string[] = ['none', 'open', 'boss_lock', 'boss_exit', 'forces_lock', 'event_lock', 'kill_lock', 'device_lock'];
const GATE_STYLES: readonly string[] = ['portcullis', 'arcane', 'fel', 'wood', 'thorn', 'bone', 'web', 'stone'];
const DORMANT_KINDS: readonly string[] = ['bones', 'coffin', 'egg', 'ceiling', 'statue'];
const ZONE_LOOKS: readonly string[] = ['cloud', 'abyss'];

/** First-windup floor (s) of one ability, GDD_CREATURES 1.2 (melee curve, projectile 0.60, line and ground 0.90, perilous 1.00). */
export function windupFloor(a: EnemyAbility): number {
  if (a.perilous) return 1.0;
  const coef = a.damage?.coef ?? 1.0;
  switch (a.kind) {
    case 'melee': case 'cone': case 'charge': return Math.min(1.2, Math.max(0.45, 0.45 + 0.25 * coef));
    case 'projectile': return 0.6;
    case 'line': case 'ground_aoe': case 'self_aoe': return 0.9;
    default: return 0;
  }
}

/** `DeviceDef.gateDoor` names a door: `roomA|roomB` in either order, optionally `@x,y` for the door tile. */
function gateDoorMatches(gateDoor: string, d: DoorDef): boolean {
  const [pair, at] = gateDoor.split('@');
  if (pair.split('|').sort().join('|') !== [d.a, d.b].sort().join('|')) return false;
  return at === undefined || at === `${d.tile[0]},${d.tile[1]}`;
}

/**
 * P-29 rules that the 8 season packages need: pack and boss references, gate pairs (event, kill, device, boss), device and
 * interactable extras, statuses, hazard kinds, proc bodies, loot uniques, trash windup, kick and dispel flags, the forces
 * slack (115 to 130 %, the 115 % floor is in checkDungeon) and the boss count (3, groups count once).
 */
export function checkSeasonRules(def: DungeonDef, ctx: SeasonCtx, reg: ContentRegistries = {}): Issue[] {
  const out: Issue[] = [];
  const id = def.id;
  const season = isSeasonDungeon(def);
  const err = (where: string, msg: string): void => { out.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { out.push({ level: 'warn', where, msg }); };
  const bad = season ? err : warn;
  const roomById = new Map(def.rooms.map((r) => [r.id, r]));
  const packById = new Map(def.packs.map((p) => [p.id, p]));
  const bossRooms = new Set(def.bosses.map((b) => b.roomId));
  const statusOk = (s: string): boolean => !reg.statuses || reg.statuses.has(s);
  const onGround = (wx: number, wz: number, r: number): boolean => clearAt(ctx.nav, wx, wz, r) && ctx.reachable(wx, wz);
  const inRoom = (tx: number, tz: number): boolean => roomAtTile(def, sceneW(tx), sceneW(tz)) !== undefined;
  const dupes = (ids: string[], where: string, what: string): void => {
    const seen = new Set<string>();
    for (const i of ids) { if (seen.has(i)) err(where, `duplicate ${what} id ${i}`); seen.add(i); }
  };

  // ---- bosses: count (groups count once, M+ bossesTotal) ----
  const groups = new Set<string>();
  let solo = 0;
  for (const b of def.bosses as (BossPlacement & { group?: string })[]) { if (b.group) groups.add(b.group); else solo++; }
  const bossCount = solo + groups.size;
  if (season && bossCount < 3) err(id, `season dungeon needs at least 3 bosses (a group counts once): found ${bossCount}`);
  if (season) for (const r of def.rooms) if (r.boss && !bossRooms.has(r.id)) err(`room ${r.id}`, 'flagged boss but has no boss placement');

  // ---- forces: 115 to 130 % of forcesRequired; the mandatory route must cover it in season dungeons ----
  const { all, mandatory, required } = ctx.forces;
  if (required > 0 && !def.outdoor && !def.world) {
    if (all / required > 1.3) bad(id, `forces available ${all} = ${((all / required) * 100).toFixed(1)}% of required ${required}: above the 130% slack ceiling`);
    if (season && mandatory < required) err(id, `mandatory route ${mandatory} is below forcesRequired ${required}`);
  }

  // ---- packs ----
  for (const p of def.packs) {
    const w = `pack ${p.id}`;
    for (const l of p.linkedTo ?? []) if (!packById.has(l)) err(w, `linkedTo ${l} is not a pack of this dungeon`);
    if (p.dormant && !DORMANT_KINDS.includes(p.dormant.kind)) err(w, `unknown dormant kind ${p.dormant.kind}`);
    if (p.dormant && !(p.dormant.wakeRadius > 0)) err(w, 'dormant wakeRadius must be > 0');
    for (const c of p.wakeWhen?.cleared ?? []) if (!packById.has(c)) err(w, `wakeWhen names unknown pack ${c}`);
    if (p.wakeWhen?.delay !== undefined && p.wakeWhen.delay < 0) err(w, 'wakeWhen.delay is negative');
  }

  // ---- rooms: ambience, atmosphere, storms, zones, hazards, props ----
  for (const r of def.rooms) {
    const w = `room ${r.id}`;
    if (r.atmosphere !== undefined && !def.atmospheres?.[r.atmosphere]) err(w, `atmosphere ${r.atmosphere} is not in DungeonDef.atmospheres`);
    for (const a of r.ambience ?? []) {
      const aw = `${w} ambience ${a.id}`;
      if (!(SFX_IDS as readonly string[]).includes(a.id)) err(aw, 'unknown sfx id');
      if (!(a.radius > 0)) err(aw, 'radius must be > 0');
      if (!(a.volume >= 0 && a.volume <= 1)) err(aw, 'volume must be 0..1');
      if (a.every && !(a.every[0] >= 0 && a.every[0] <= a.every[1])) err(aw, 'every must be [min, max] with 0 <= min <= max');
      if (a.pos && roomAtTile(def, sceneW(a.pos[0]), sceneW(a.pos[1])) !== r) warn(aw, 'pos is outside its room');
    }
    if (r.storm) {
      if (!(r.storm.strength > 0)) err(w, 'storm strength must be > 0');
      if (!(r.storm.every[0] > 0 && r.storm.every[0] <= r.storm.every[1])) err(w, 'storm every must be [min, max] with 0 < min <= max');
    }
    for (const z of r.zones ?? []) if (z.look !== undefined && !ZONE_LOOKS.includes(z.look)) err(`${w} zone`, `unknown look ${z.look}`);
    for (const h of r.hazards ?? []) {
      const hw = `${w} hazard ${h.kind}`;
      if (!HAZARD_KINDS.includes(h.kind)) err(hw, 'unknown hazard kind');
      if (!(h.interval > 0) || !(h.warn >= 0) || !(h.radius > 0)) err(hw, 'interval and radius must be > 0, warn >= 0');
      if (h.groundedBy) {
        for (const [px, pz] of h.groundedBy.pos) if (roomAtTile(def, sceneW(px), sceneW(pz)) !== r) err(hw, `rod ${px},${pz} is outside its room`);
        if (!(h.groundedBy.radius > 0)) err(hw, 'groundedBy radius must be > 0');
        if (h.groundedBy.status !== undefined && !statusOk(h.groundedBy.status)) err(hw, `groundedBy status ${h.groundedBy.status} is not in STATUSES`);
      }
    }
    for (const p of r.props ?? []) {
      const pw = `${w} prop ${p.id ?? p.model.split('/').pop()}`;
      if (p.tag === 'device') {
        if (reg.devices && (!p.device || !(p.device in reg.devices))) err(pw, `device id ${p.device ?? '(none)'} is not in DEVICES`);
      } else if (p.device !== undefined) warn(pw, 'device is set on a prop that is not tag device');
      if (p.sfx !== undefined && !(SFX_IDS as readonly string[]).includes(p.sfx)) err(pw, `unknown sfx ${p.sfx}`);
      if (p.onBreak) {
        if (p.tag !== 'breakable') warn(pw, 'onBreak on a prop that is not tag breakable');
        const z = p.onBreak.zone;
        if (!(z.radius > 0) || !(z.duration > 0)) err(pw, 'onBreak zone radius and duration must be > 0');
        if (!statusOk(z.status)) err(pw, `onBreak status ${z.status} is not in STATUSES`);
      }
      if (p.spinNode !== undefined && p.spin === undefined) warn(pw, 'spinNode without spin');
      if (p.bob !== undefined && !(p.bob[0] >= 0 && p.bob[1] > 0)) err(pw, 'bob must be [amplitude >= 0, hz > 0]');
    }
  }

  // ---- doors: gate kinds and their pairs (event, kill, device, boss) ----
  const deviceProps = new Set<string>();
  for (const r of def.rooms) for (const p of r.props ?? []) if (p.tag === 'device' && p.device) deviceProps.add(p.device);
  for (const d of def.doors) {
    const dw = `door ${d.a}|${d.b}`;
    if (!GATE_KINDS.includes(d.gate ?? 'none')) err(dw, `unknown gate ${d.gate}`);
    if (d.gateStyle !== undefined && !GATE_STYLES.includes(d.gateStyle)) warn(dw, `unknown gateStyle ${d.gateStyle}`);
    if (season && d.gate === 'boss_lock' && !(bossRooms.has(d.a) || bossRooms.has(d.b))) err(dw, 'boss_lock leads into no room with a boss');
    if (d.gate === 'event_lock') {
      if (!d.event) err(dw, 'event_lock without event');
      else if (!(def.events && d.event in def.events)) err(dw, `event ${d.event} is not in DungeonDef.events`);
    }
    if (d.gate === 'kill_lock') {
      const o = d.opensOn;
      if (!o || !(o.pack || o.enemyId || o.boss)) err(dw, 'kill_lock without opensOn (pack, enemyId or boss)');
      if (o?.pack && !packById.has(o.pack)) err(dw, `opensOn.pack ${o.pack} is not a pack`);
      if (o?.enemyId && ctx.enemyForces(o.enemyId) === undefined) err(dw, `opensOn.enemyId ${o.enemyId} is not an enemy`);
      if (o?.boss && !def.bosses.some((b) => b.bossId === o.boss)) err(dw, `opensOn.boss ${o.boss} is not a boss of this dungeon`);
    }
    if (d.gate === 'device_lock') {
      if (!d.device) err(dw, 'device_lock without device');
      else if (reg.devices) {
        const dev = reg.devices[d.device];
        if (!dev) err(dw, `device ${d.device} is not in DEVICES`);
        else {
          if (dev.effect !== 'open_gate') err(dw, `device ${d.device} has effect ${dev.effect}: a device_lock needs open_gate`);
          if (dev.gateDoor !== undefined && !gateDoorMatches(dev.gateDoor, d)) err(dw, `device ${d.device} opens ${dev.gateDoor}, not this door`);
        }
        if (!deviceProps.has(d.device)) err(dw, `no prop with tag device ${d.device} in this dungeon: the lock cannot be solved`);
      }
    }
    for (const q of d.requires ?? []) if (!packById.has(q)) err(dw, `requires pack ${q}, which is not a pack`);
  }

  // ---- enemies: proc bodies, loot tables and uniques, trash windup (season), kick and dispel flags, statuses, summons ----
  const used = new Set<string>([...def.packs.flatMap((p) => p.members.map((m) => m.enemyId)), ...def.bosses.map((b) => b.bossId)]);
  for (const eid of used) {
    const e = reg.enemyDef?.(eid);
    if (!e) continue; // unknown ids are reported by checkDungeon
    const w = `enemy ${eid}`;
    if (e.model.startsWith('PROC:') && reg.hasProc && !reg.hasProc(e.model.slice(5))) err(w, `proc body ${e.model.slice(5)} has no builder in ai/procModels.ts`);
    if (e.lootTable && reg.lootTables && !(e.lootTable in reg.lootTables)) warn(w, `loot table ${e.lootTable} is not registered: the rank table is used`);
    for (const u of (e.lootTable ? reg.lootTables?.[e.lootTable]?.uniqueIds : undefined) ?? []) {
      if (reg.uniques && !reg.uniques.has(u)) err(w, `loot table ${e.lootTable} lists unknown unique ${u}`);
    }
    for (const a of [e.basicAttack, ...e.abilities]) {
      const aw = `${w} ${a.id}`;
      if (season && e.rank !== 'boss' && e.role !== 'swarm') {
        const floor = windupFloor(a);
        if (a.windup < floor) err(aw, `windup ${a.windup} s is under the ${floor} s floor for ${a.kind} (GDD_CREATURES 1.2)`);
        if (a.interruptible && (a.castTime ?? 0) > 0 && (a.castTime ?? 0) < 1) err(aw, `interruptible cast ${a.castTime} s is under 1.0 s`);
      }
      if (a.interruptible && a.kick === undefined) warn(aw, 'interruptible ability has no kick priority (P-23)');
      if (a.kick !== undefined && ![0, 1, 2].includes(a.kick)) err(aw, `kick ${a.kick} is not 0, 1 or 2`);
      if (a.dispel !== undefined && !statusOk(a.dispel)) warn(aw, `dispel ${a.dispel} is not in STATUSES (P-23)`);
      for (const s of a.statuses ?? []) if (!statusOk(s.status)) err(aw, `status ${s.status} is not in STATUSES`);
      if (a.summon && reg.enemyDef && !reg.enemyDef(a.summon.enemyId)) err(aw, `summons ${a.summon.enemyId}, which is not in ENEMIES or BOSSES`);
    }
  }

  // ---- extras: NPCs, boons, stations, transits, winch drops, checkpoints, affix-safe spots ----
  const ex = def.extras;
  if (ex) {
    dupes((ex.npcs ?? []).map((n) => n.id), id, 'npc');
    for (const n of ex.npcs ?? []) {
      const w = `npc ${n.id}`;
      if (!inRoom(n.pos[0], n.pos[1])) err(w, `at ${n.pos[0]},${n.pos[1]} is not inside a room`);
      for (const c of n.requires?.classes ?? []) if (reg.classes && !reg.classes.has(c)) err(w, `requires unknown class ${c}`);
      for (const p of n.requires?.professions ?? []) if (reg.professions && !reg.professions.has(p)) err(w, `requires unknown profession ${p}`);
      if (n.holdSeconds !== undefined && !(n.holdSeconds > 0)) err(w, 'holdSeconds must be > 0');
    }
    dupes((ex.boons ?? []).map((b) => b.id), id, 'boon');
    for (const b of ex.boons ?? []) {
      const w = `boon ${b.id}`;
      if (!inRoom(b.pos[0], b.pos[1])) err(w, 'is not inside a room');
      if (!statusOk(b.status)) err(w, `status ${b.status} is not in STATUSES`);
      if (!(b.duration > 0)) err(w, 'duration must be > 0');
    }
    dupes((ex.stations ?? []).map((s) => s.id), id, 'station');
    for (const s of ex.stations ?? []) {
      const w = `station ${s.id}`;
      if (!inRoom(s.pos[0], s.pos[1])) err(w, 'is not inside a room');
      if (!statusOk(s.status)) err(w, `status ${s.status} is not in STATUSES`);
      if (!(s.duration > 0)) err(w, 'duration must be > 0');
    }
    for (const t of ex.transits ?? []) {
      const w = `transit ${t.id}`;
      for (const [sx, sz] of t.stops) if (!onGround(sceneW(sx), sceneW(sz), 0.6)) err(w, `stop ${sx},${sz} is blocked or unreachable`);
      if (t.speed !== undefined && !(t.speed > 0)) err(w, 'speed must be > 0');
    }
    dupes((ex.dropProps ?? []).map((d) => d.id), id, 'drop prop');
    for (const d of ex.dropProps ?? []) {
      const w = `drop prop ${d.id}`;
      if (!onGround(sceneW(d.pos[0]), sceneW(d.pos[1]), 0.6)) err(w, `pos ${d.pos[0]},${d.pos[1]} is blocked or unreachable`);
      if (!onGround(sceneW(d.winch[0]), sceneW(d.winch[1]), 0.6)) err(w, `winch ${d.winch[0]},${d.winch[1]} is blocked or unreachable`);
      if (!(d.ring > 0)) err(w, 'ring must be > 0');
      if (!(d.dmgPctMax > 0 && d.dmgPctMax <= 100)) err(w, `dmgPctMax ${d.dmgPctMax} must be in (0, 100]`);
      if (d.eliteCap > d.dmgPctMax) bad(w, `eliteCap ${d.eliteCap} is above dmgPctMax ${d.dmgPctMax}`);
      if (!(d.stun >= 0) || !(d.playerCoef > 0)) err(w, 'stun must be >= 0 and playerCoef > 0');
    }
    for (const [cx, cz] of ex.checkpoints ?? []) if (!onGround(sceneW(cx), sceneW(cz), 0.6)) err(id, `checkpoint ${cx},${cz} is blocked or unreachable`);
    if (ex.checkpoints && ex.checkpoints.length > bossCount) warn(id, `${ex.checkpoints.length} checkpoints for ${bossCount} bosses: a checkpoint needs a boss before it`);
    for (const s of ex.affixSafe ?? []) {
      if (!(s.r > 0) || s.x < 0 || s.z < 0 || s.x > def.grid.w || s.z > def.grid.h) err(id, `affixSafe ${s.x},${s.z} r ${s.r} is outside the grid or has no radius`);
    }
  }
  return out;
}

export function checkDungeon(def: DungeonDef, models: ModelDb, knownEnemy?: (id: string) => number | undefined, reg: ContentRegistries = {}): DungeonReport {
  const issues: Issue[] = [];
  const err = (where: string, msg: string): void => { issues.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { issues.push({ level: 'warn', where, msg }); };
  const info = (where: string, msg: string): void => { issues.push({ level: 'info', where, msg }); };
  const id = def.id;

  // ---- unique ids ----
  const seen = new Map<string, number>();
  for (const r of def.rooms) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  for (const [k, n] of seen) if (n > 1) err(`${id}`, `duplicate room id ${k}`);
  const packIds = new Map<string, number>();
  for (const p of def.packs) packIds.set(p.id, (packIds.get(p.id) ?? 0) + 1);
  for (const [k, n] of packIds) if (n > 1) err(`${id}`, `duplicate pack id ${k}`);
  const roomById = new Map(def.rooms.map((r) => [r.id, r]));

  // ---- rooms inside grid, non-overlapping ----
  for (const r of def.rooms) {
    const { x, z, w, h } = r.rect;
    if (x < 0 || z < 0 || x + w > def.grid.w || z + h > def.grid.h) err(`room ${r.id}`, `outside the ${def.grid.w}x${def.grid.h} grid`);
    if (w < 1 || h < 1) err(`room ${r.id}`, 'empty rect');
  }
  for (let i = 0; i < def.rooms.length; i++) for (let j = i + 1; j < def.rooms.length; j++) {
    const a = def.rooms[i].rect, b = def.rooms[j].rect;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.h && b.z < a.z + a.h) err(`room ${def.rooms[i].id}`, `overlaps ${def.rooms[j].id}`);
  }

  // ---- doors on shared boundaries ----
  const doorKeys = new Set<string>();
  for (const d of def.doors) {
    const where = `door ${d.a}|${d.b}`;
    const a = roomById.get(d.a), b = roomById.get(d.b);
    if (!a || !b) { err(where, 'unknown room'); continue; }
    const key = [d.a, d.b].sort().join('|') + `@${d.tile}`;
    if (doorKeys.has(key)) err(where, 'duplicate door'); doorKeys.add(key);
    const w = d.width ?? 1;
    for (let k = 0; k < w; k++) {
      const tx = d.tile[0] + (d.side === 'n' || d.side === 's' ? k : 0);
      const tz = d.tile[1] + (d.side === 'e' || d.side === 'w' ? k : 0);
      const inA = tx >= a.rect.x && tx < a.rect.x + a.rect.w && tz >= a.rect.z && tz < a.rect.z + a.rect.h;
      const dx = d.side === 'e' ? 1 : d.side === 'w' ? -1 : 0, dz = d.side === 's' ? 1 : d.side === 'n' ? -1 : 0;
      const nx = tx + dx, nz = tz + dz;
      const inB = nx >= b.rect.x && nx < b.rect.x + b.rect.w && nz >= b.rect.z && nz < b.rect.z + b.rect.h;
      if (!inA) err(where, `tile ${tx},${tz} is not inside room ${d.a}`);
      if (!inB) err(where, `neighbour tile ${nx},${nz} (side ${d.side}) is not inside room ${d.b}`);
    }
    if (d.gate === 'boss_lock' && !(b.boss || a.boss)) warn(where, 'boss_lock door touches no boss room');
    if (d.gate === 'boss_exit' && !a.boss) warn(where, 'boss_exit door does not start in a boss room');
  }

  // ---- bosses ----
  const orders = new Set<number>();
  for (const b of def.bosses) {
    const r = roomById.get(b.roomId);
    if (!r) { err(`boss ${b.bossId}`, `unknown room ${b.roomId}`); continue; }
    orders.add(b.order);
    const seasonBoss = !def.outdoor && isSeasonDungeon(def) && reg.bossIds !== undefined;
    const bossOk = def.outdoor ? /^(wb_|boss_)/.test(b.bossId) : seasonBoss ? (reg.bossIds?.has(b.bossId) ?? false) : BOSS_RE.test(b.bossId) && GDD_BOSSES.includes(b.bossId);
    if (!bossOk) err(`boss ${b.bossId}`, def.outdoor ? 'open-world boss ids start with wb_' : seasonBoss ? 'not a boss in BOSSES' : 'not in the GDD boss list');
    if (!r.boss && !def.outdoor) warn(`boss ${b.bossId}`, `room ${r.id} is not flagged boss`);
  }
  // legacy dungeons: exactly 3 bosses; season dungeons: at least 3, groups count once (checkSeasonRules)
  if (!def.outdoor && !isSeasonDungeon(def) && def.bosses.length !== 3) err(id, `expected 3 bosses, found ${def.bosses.length}`);
  if (!def.outdoor && !orders.has(3)) err(id, 'no final boss (order 3)');

  // ---- theme ----
  if (!(MUSIC_IDS as readonly string[]).includes(def.theme.music)) err(id, `unknown music ${def.theme.music}`);
  if (def.theme.fogNear >= def.theme.fogFar) err(id, 'fogNear >= fogFar');
  if (!def.outdoor && !['dungeon_crypt', 'dungeon_fire', 'dungeon_frost', 'dungeon_shadow', 'dungeon_taskasa', 'dungeon_peri_sisleri'].includes(def.theme.music)) warn(id, 'theme music is not a dungeon track');

  // ---- connectivity (room graph from the start room) ----
  const startRoom = def.rooms.find((r) => {
    const sx = def.start.pos[0] + 0.5, sz = def.start.pos[1] + 0.5;
    return sx > r.rect.x && sx < r.rect.x + r.rect.w && sz > r.rect.z && sz < r.rect.z + r.rect.h;
  });
  if (!startRoom) err(id, 'start is not inside a room');
  else if (!def.world) { // open-world maps connect by adjacency (the nav flood below + worldIssues), not by doors
    const adj = new Map<string, string[]>();
    for (const d of def.doors) { (adj.get(d.a) ?? adj.set(d.a, []).get(d.a)!).push(d.b); (adj.get(d.b) ?? adj.set(d.b, []).get(d.b)!).push(d.a); }
    const vis = new Set([startRoom.id]);
    const q = [startRoom.id];
    while (q.length) { const c = q.pop()!; for (const n of adj.get(c) ?? []) if (!vis.has(n)) { vis.add(n); q.push(n); } }
    for (const r of def.rooms) if (!vis.has(r.id)) err(`room ${r.id}`, 'not reachable from the start room through doors');
  }

  // ---- nav, flood fill ----
  const nav = buildNav(def, models);
  flood(nav, sceneW(def.start.pos[0]), sceneW(def.start.pos[1]));
  /** wx / wz in world metres. */
  const reachable = (wx: number, wz: number): boolean => {
    for (let j = Math.floor(wz) - 1; j <= Math.floor(wz) + 1; j++) for (let i = Math.floor(wx) - 1; i <= Math.floor(wx) + 1; i++) {
      if (i >= 0 && j >= 0 && i < nav.w && j < nav.h && nav.reach[j * nav.w + i]) return true;
    }
    return false;
  };

  // ---- enemy ids, forces, pack positions ----
  const enemyForces = (eid: string): number | undefined => knownEnemy?.(eid) ?? (eid in GDD_ROSTER ? GDD_ROSTER[eid] : undefined);
  let forcesAll = 0, forcesNon = 0, enemies = 0;
  const perRoom: Record<string, { props: number; forces: number }> = {};
  for (const r of def.rooms) perRoom[r.id] = { props: r.props?.length ?? 0, forces: 0 };
  for (const p of def.packs) {
    const where = `pack ${p.id}`;
    const room = roomById.get(p.roomId);
    if (!room) { err(where, `unknown room ${p.roomId}`); continue; }
    let sum = 0;
    for (const m of p.members) {
      const f = enemyForces(m.enemyId);
      if (f === undefined) { err(where, `unknown enemy id ${m.enemyId}`); continue; }
      if (GDD_SUMMONS.includes(m.enemyId)) warn(where, `${m.enemyId} is a summon-only unit`);
      sum += f;
      enemies++;
      const wx = sceneW(p.center[0] + m.offset[0]), wz = sceneW(p.center[1] + m.offset[1]);
      const rr = rectOf(room);
      if (!(wx > rr.x0 + 0.9 && wx < rr.x1 - 0.9 && wz > rr.z0 + 0.9 && wz < rr.z1 - 0.9)) err(where, `${m.enemyId} at ${(wx / T).toFixed(2)},${(wz / T).toFixed(2)} is outside ${room.id} (or hugging a wall)`);
      else if (!FLYING.has(m.enemyId) && !clearAt(nav, wx, wz, 0.4)) err(where, `${m.enemyId} at ${(wx / T).toFixed(2)},${(wz / T).toFixed(2)} stands on blocked cells (prop / zone)`);
      else if (!FLYING.has(m.enemyId) && !reachable(wx, wz)) err(where, `${m.enemyId} at ${(wx / T).toFixed(2)},${(wz / T).toFixed(2)} is not reachable from the start`);
    }
    if (p.forces !== undefined && p.forces !== sum) err(where, `declared forces ${p.forces} != roster sum ${sum}`);
    forcesAll += sum;
    if (!p.optional) forcesNon += sum;
    perRoom[p.roomId].forces += sum;
    if (p.patrol) for (const w of p.patrol) {
      const wx = sceneW(w[0]), wz = sceneW(w[1]);
      if (!clearAt(nav, wx, wz, 0.6)) err(where, `patrol waypoint ${w} is blocked`);
    }
  }
  const required = def.forcesRequired;
  const ratio = required > 0 ? forcesAll / required : 0;
  if (!def.outdoor && ratio < 1.15) err(id, `forces available ${forcesAll} < required x1.15 (${(required * 1.15).toFixed(0)})`);
  if (!def.outdoor && forcesNon < required) warn(id, `non-optional forces ${forcesNon} < required ${required} (needs optional packs)`);
  info(id, required > 0 ? `forces ${forcesAll} available = ${(ratio * 100).toFixed(1)}% of ${required}; non-optional ${forcesNon} (${((forcesNon / required) * 100).toFixed(1)}%)` : `open world: ${def.packs.length} camps, ${enemies} mobs, no M+ forces`);

  // ---- start / exit / bosses / extras on walkable ground ----
  const pt = (name: string, wx: number, wz: number, r = 0.6): void => {
    if (!clearAt(nav, wx, wz, r)) err(`${id}`, `${name} at ${(wx / T).toFixed(2)},${(wz / T).toFixed(2)} (world tiles) is on blocked ground`);
    else if (!reachable(wx, wz)) err(`${id}`, `${name} at ${(wx / T).toFixed(2)},${(wz / T).toFixed(2)} (world tiles) is not reachable`);
  };
  pt('start', sceneW(def.start.pos[0]), sceneW(def.start.pos[1]), 1.0);
  pt('exit', sceneW(def.exit.pos[0]), sceneW(def.exit.pos[1]), 1.2);
  for (const b of def.bosses) pt(`boss ${b.bossId}`, sceneW(b.pos[0]), sceneW(b.pos[1]), 1.5);
  if (def.extras) {
    // the Font of Power is a collidable prop itself: only check it is inside a room
    if (!roomAtTile(def, sceneW(def.extras.fontOfPower[0]), sceneW(def.extras.fontOfPower[1]))) err(id, 'fontOfPower is not inside a room');
    for (const s of def.extras.shrines) if (!roomAtTile(def, sceneW(s.pos[0]), sceneW(s.pos[1]))) err(id, `shrine ${s.type} is not inside a room`);
    for (const s of def.extras.riftSpots) pt('riftSpot', sceneW(s[0]), sceneW(s[1]), 0.5);
    for (const c of def.extras.chests ?? []) if (!roomAtTile(def, sceneW(c.pos[0]), sceneW(c.pos[1]))) err(id, 'chest is not inside a room');
    if (def.extras.shrines.length !== 2) warn(id, 'GDD: two shrines per dungeon');
  } else if (!def.outdoor) warn(id, 'no extras (font of power / shrines / rift spots)');

  // ---- props ----
  let nProps = 0, nCollide = 0, nLights = 0;
  const urls = new Set<string>();
  const doors = def.doors.map(doorGeo);
  for (const r of def.rooms) {
    const rr = rectOf(r);
    const props = r.props ?? [];
    props.forEach((p, idx) => {
      nProps++;
      urls.add(p.model);
      const where = `${r.id} prop#${idx} ${p.model.split('/').pop()}`;
      if (p.collide) nCollide++;
      if (p.light) nLights++;
      const wx = sceneW(p.pos[0]), wz = sceneW(p.pos[1]);
      // inside own room (wall mounted pieces sit on the boundary)
      const slack = 0.9;
      if (!(p.id ?? '').startsWith('facade') && !(wx >= rr.x0 - slack && wx <= rr.x1 + slack && wz >= rr.z0 - slack && wz <= rr.z1 + slack)) err(where, `at ${p.pos[0].toFixed(2)},${p.pos[1].toFixed(2)} lies outside room ${r.id}`);
      const info2 = models.get(p.model);
      if (info2 && !info2.exists) err(where, 'model file missing');
      if (p.vfx && !(VFX_IDS as readonly string[]).includes(p.vfx)) err(where, `unknown vfx ${p.vfx}`);
      // wall mounted prop inside a door gap
      for (const d of doors) {
        const along = d.line === 'z' ? wx : wz, across = d.line === 'z' ? wz : wx;
        if (Math.abs(across - d.at) < 1.0 && along > d.lo - 1.0 && along < d.hi + 1.0 && !p.collide && (p.y ?? 0) > 1.2) warn(where, `wall prop near door ${d.def.a}|${d.def.b}`);
        if (Math.abs(across - d.at) < 1.0 && along > d.lo && along < d.hi && p.collide) err(where, `collide prop inside door gap ${d.def.a}|${d.def.b}`);
      }
      if (p.collide) {
        const bx = info2?.box ?? defaultBox;
        const f = propFootprint(p, bx);
        for (const pk of def.packs) for (const m of pk.members) {
          const mx = sceneW(pk.center[0] + m.offset[0]), mz = sceneW(pk.center[1] + m.offset[1]);
          const dx = mx - f.cx, dz = mz - f.cz;
          const lx = dx * Math.cos(f.rot) - dz * Math.sin(f.rot), lz = dx * Math.sin(f.rot) + dz * Math.cos(f.rot);
          if (Math.abs(lx) < f.hx + 0.9 && Math.abs(lz) < f.hz + 0.9) { err(where, `collide prop is within 0.9 m of ${pk.id}:${m.enemyId}`); break; }
        }
        const specials: [string, number, number][] = [
          ['start', sceneW(def.start.pos[0]), sceneW(def.start.pos[1])], ['exit', sceneW(def.exit.pos[0]), sceneW(def.exit.pos[1])],
          ...def.bosses.map((b) => [`boss ${b.bossId}`, sceneW(b.pos[0]), sceneW(b.pos[1])] as [string, number, number]),
        ];
        for (const [nm, qx, qz] of specials) {
          const dx = qx - f.cx, dz = qz - f.cz;
          const lx = dx * Math.cos(f.rot) - dz * Math.sin(f.rot), lz = dx * Math.sin(f.rot) + dz * Math.cos(f.rot);
          if (Math.abs(lx) < f.hx + 1.4 && Math.abs(lz) < f.hz + 1.4 && p.id !== 'font_of_power') err(where, `collide prop is too close to ${nm}`);
        }
      }
    });
    // collide props overlapping each other at ground level
    for (let a = 0; a < props.length; a++) for (let b = a + 1; b < props.length; b++) {
      const A = props[a], B = props[b];
      if (!A.collide || !B.collide) continue;
      if ((A.y ?? 0) > 0.5 || (B.y ?? 0) > 0.5) continue;
      const fa = propFootprint(A, models.get(A.model)?.box ?? defaultBox), fb = propFootprint(B, models.get(B.model)?.box ?? defaultBox);
      const ra = Math.min(fa.hx, fa.hz), rb = Math.min(fb.hx, fb.hz);
      if (Math.hypot(fa.cx - fb.cx, fa.cz - fb.cz) < (ra + rb) * 0.75) warn(`${r.id}`, `collide props overlap: ${A.model.split('/').pop()} / ${B.model.split('/').pop()} at ${A.pos[0].toFixed(1)},${A.pos[1].toFixed(1)}`);
    }
    if (r.props && r.props.length > 0 && rr.x1 - rr.x0 > 0) {
      // door lane sanity: all door cells must stay walkable
    }
  }

  // anchors the boss scripts hard-code (GDD coordinates): the props that carry these ids must stand exactly there
  const anchors = BOSS_ANCHORS[id];
  if (anchors) {
    const byId = new Map<string, PropPlacement>();
    for (const r of def.rooms) for (const p of r.props ?? []) if (p.id) byId.set(p.id, p);
    for (const [pid, [ax, az]] of Object.entries(anchors)) {
      const p = byId.get(pid);
      if (!p) err(id, `boss anchor prop '${pid}' is missing (ai/bosses expects it at ${ax}, ${az})`);
      else if (Math.abs(p.pos[0] - ax) > 0.05 || Math.abs(p.pos[1] - az) > 0.05) err(id, `boss anchor '${pid}' is at ${p.pos[0]}, ${p.pos[1]} but ai/bosses expects ${ax}, ${az}`);
    }
  }

  // door lanes must be walkable
  for (const d of doors) {
    const steps = Math.round(d.hi - d.lo);
    let blocked = 0;
    for (let k = 1; k < steps - 1; k++) {
      const a = d.lo + k + 0.5;
      const wx = d.line === 'z' ? a : d.at, wz = d.line === 'z' ? d.at : a;
      const i = Math.floor(wx), j = Math.floor(wz);
      const cells = [[i, j], [i - 1, j - 1], [i - 1, j], [i, j - 1]];
      if (!cells.some(([ci, cj]) => ci >= 0 && cj >= 0 && ci < nav.w && cj < nav.h && nav.walk[cj * nav.w + ci])) blocked++;
    }
    if (blocked > 0) err(`door ${d.def.a}|${d.def.b}`, `${blocked} blocked cells on the opening line`);
  }

  // open-world map (GDD_OPENWORLD §9.1): regions, villages, POIs, metin, bosses, textures
  if (def.world) for (const e of worldIssues(def, nav, reachable, enemyForces, models)) issues.push(e);

  for (const u of urls) {
    const m = models.get(u);
    if (!m) warn(id, `model not loaded: ${u}`);
    else if (!m.exists) err(id, `missing model ${u}`);
  }

  // props per room sanity (told in info)
  const empty = def.rooms.filter((r) => !r.props || r.props.length < 4).map((r) => r.id);
  if (empty.length && !def.world) warn(id, `rooms with fewer than 4 hand placed props: ${empty.join(', ')}`);
  issues.push(...checkVerticalDungeon(def));
  issues.push(...checkSeasonRules(def, { nav, reachable, enemyForces, forces: { all: forcesAll, mandatory: forcesNon, required } }, reg));

  return {
    id,
    issues,
    nav,
    stats: {
      rooms: def.rooms.length, doors: def.doors.length, packs: def.packs.length, bosses: def.bosses.length, props: nProps, collide: nCollide,
      lights: nLights, models: urls.size, forcesAll, forcesNonOptional: forcesNon, forcesRequired: required, ratio, enemies, perRoom,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Town check
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
// Open-world map checks (GDD_OPENWORLD §9.1) and quest data checks (§6)
// ---------------------------------------------------------------------------------------------------------------------

/** Scene-side tile point -> world metres (the convention of packs, extras and POIs). */
const tileM = (p: [number, number]): [number, number] => [sceneW(p[0]), sceneW(p[1])];

/**
 * Checks for a world map (DungeonDef.world). Called from checkDungeon with its nav and reachability. Walkability is the union of
 * the room rects, so every region room centre must be reachable from the start; POIs must stand on reachable ground; villages
 * must be whole (gates and spawn inside the walls, no NPC inside a building); camps must stay out of the safe zones and fit the
 * enemy id stride; every enemy / boss id must be defined (WP3) and every model / texture file must exist.
 */
function worldIssues(
  def: DungeonDef, nav: NavMask, reachable: (wx: number, wz: number) => boolean,
  knownForces: (eid: string) => number | undefined, models: ModelDb,
): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, msg: string): void => { out.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { out.push({ level: 'warn', where, msg }); };
  const info = (where: string, msg: string): void => { out.push({ level: 'info', where, msg }); };
  const w = def.world;
  if (!w) return out;
  const regionIds = new Set(w.regions.map((r) => r.id));
  const roomIds = new Set(def.rooms.map((r) => r.id));
  const fileOk = (where: string, u: string): void => { const m = models.get(u); if (m && !m.exists) err(where, `missing file ${u}`); };

  const uniq = (label: string, ids: string[]): void => {
    const seen = new Set<string>();
    for (const i of ids) { if (seen.has(i)) err(`${label} ${i}`, 'duplicate id'); seen.add(i); }
  };
  uniq('region', w.regions.map((r) => r.id));
  uniq('village', w.villages.map((v) => v.id));
  uniq('waypoint', w.waypoints.map((x) => x.id));
  uniq('entrance', w.entrances.map((x) => x.id));
  uniq('metin spot', w.metin.spots.map((x) => x.id));
  uniq('metin tier', w.metin.tiers.map((x) => x.id));
  uniq('rare', w.rares.map((x) => x.id));
  uniq('miniboss', w.minibosses.map((x) => x.id));
  uniq('shrine', w.shrines.map((x) => x.id));
  uniq('chest', w.chests.map((x) => x.id));
  uniq('cursed chest', w.cursed.map((x) => x.id));
  uniq('gather field', w.gather.map((x) => x.id));
  uniq('hidden area', w.hidden.map((x) => x.id));
  uniq('vista', w.vistas.map((x) => x.id));
  uniq('landmark', w.landmarks.map((x) => x.id));

  // regions: room link, levels, atmosphere; the room centre must be walkable from the start
  for (const r of w.regions) {
    const where = `region ${r.id}`;
    if (!roomIds.has(r.roomId)) err(where, `unknown room ${r.roomId}`);
    if (r.levels[0] > r.levels[1]) err(where, 'levels reversed');
    if (r.theme.fogNear >= r.theme.fogFar) err(where, 'fogNear >= fogFar');
    if (!(MUSIC_IDS as readonly string[]).includes(r.theme.music)) err(where, `unknown music ${r.theme.music}`);
    if (r.theme.ambientVfx && !(VFX_IDS as readonly string[]).includes(r.theme.ambientVfx)) err(where, `unknown vfx ${r.theme.ambientVfx}`);
    for (const u of Object.values(r.theme.groundTex)) fileOk(where, u);
    if (r.theme.skyImage) fileOk(where, r.theme.skyImage);
    const room = def.rooms.find((x) => x.id === r.roomId);
    if (room && !reachable((room.rect.x + room.rect.w / 2) * TILE_SIZE, (room.rect.z + room.rect.h / 2) * TILE_SIZE)) {
      err(where, `room ${room.id} centre is not reachable from the start`);
    }
  }
  for (const r of def.rooms) if (!w.regions.some((x) => x.roomId === r.id)) info(def.id, `room ${r.id} has no region (bridge / approach / island)`);

  // villages: whole walls, spawn and gates inside, waypoint link, NPCs standing clear of buildings
  for (const v of w.villages) {
    const where = `village ${v.id}`;
    const [bx, bz] = v.bounds;
    const [cx, cz] = tileM(v.center);
    if (!reachable(cx, cz)) err(where, 'centre is not reachable (water or outside the rooms)');
    if (Math.abs(v.spawn.pos[0]) > bx || Math.abs(v.spawn.pos[1]) > bz) err(where, `spawn ${v.spawn.pos} lies outside the walls`);
    if (v.waypointId && !w.waypoints.some((x) => x.id === v.waypointId)) err(where, `unknown waypoint ${v.waypointId}`);
    if (!v.waypointId) warn(where, 'no waypoint stone within 8 tiles of the centre');
    for (const g of v.gates) if (Math.abs(g.pos[0]) > bx + 0.5 || Math.abs(g.pos[1]) > bz + 0.5) err(where, `gate ${g.id} lies outside the walls`);
    for (const p of v.props) fileOk(where, p.model);
    for (const n of v.npcs) {
      const nw = `npc ${n.id}`;
      if (Math.abs(n.pos[0]) > bx + 1 || Math.abs(n.pos[2]) > bz + 1) err(nw, 'outside the village bounds');
      for (const p of v.props) {
        if (!p.collide) continue;
        const m = models.get(p.model);
        const s = p.scale ?? 1;
        const size = m?.box ? [(m.box.max[0] - m.box.min[0]) * s, (m.box.max[2] - m.box.min[2]) * s] : [2, 2];
        const rot = ((p.rot ?? 0) * Math.PI) / 180;
        const dx = n.pos[0] - p.pos[0], dz = n.pos[2] - p.pos[2];
        const lx = dx * Math.cos(rot) - dz * Math.sin(rot), lz = dx * Math.sin(rot) + dz * Math.cos(rot);
        if (Math.abs(lx) < (size[0] / 2) * 0.9 && Math.abs(lz) < (size[1] / 2) * 0.9) err(nw, `stands inside ${p.model.split('/').pop()}`);
      }
    }
  }

  // camps and patrols: stride of the enemy ids, clear of the safe zones, not stacked
  for (const p of def.packs) {
    if (p.members.length > WORLD_PACK_STRIDE) err(`pack ${p.id}`, `${p.members.length} members exceed WORLD_PACK_STRIDE (${WORLD_PACK_STRIDE}): enemy ids would collide`);
    if (p.kind === 'patrol' && (!p.patrol || p.patrol.length < 2)) err(`pack ${p.id}`, 'patrol needs at least two points');
    for (const v of w.villages) {
      // the safe zone is the walled area (bounds); camps must not start inside it
      const dxm = (p.center[0] - v.center[0]) * TILE_SIZE, dzm = (p.center[1] - v.center[1]) * TILE_SIZE;
      if (Math.abs(dxm) < v.bounds[0] && Math.abs(dzm) < v.bounds[1]) err(`pack ${p.id}`, `centre lies inside the safe zone of ${v.id}`);
    }
  }
  const camps = def.packs.filter((p) => p.kind !== 'patrol');
  for (let i = 0; i < camps.length; i++) for (let j = i + 1; j < camps.length; j++) {
    const a = camps[i], b = camps[j];
    if (Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) < 5) warn(`pack ${a.id}`, `centre is closer than 5 tiles (20 m) to ${b.id}`);
  }

  // metin: stones and waves are defined, four spots per region, spots walkable
  const spotsIn = new Map<string, number>();
  for (const s of w.metin.spots) {
    const where = `metin spot ${s.id}`;
    if (!regionIds.has(s.regionId)) err(where, `unknown region ${s.regionId}`);
    spotsIn.set(s.regionId, (spotsIn.get(s.regionId) ?? 0) + 1);
    const [mx, mz] = tileM(s.pos);
    if (!reachable(mx, mz)) err(where, `at ${s.pos} is not reachable`);
  }
  for (const r of w.regions) { const n = spotsIn.get(r.id) ?? 0; if (n !== 4) warn(`region ${r.id}`, `${n} metin spots (GDD: 4 per region)`); }
  for (const t of w.metin.tiers) {
    const where = `metin ${t.id}`;
    if (!regionIds.has(t.regionId)) err(where, `unknown region ${t.regionId}`);
    if (knownForces(t.enemyId) === undefined) err(where, `stone enemy ${t.enemyId} is not defined (enemies module)`);
    if (t.waves.length !== 5) err(where, `${t.waves.length} waves (GDD: 5)`);
    for (const wv of t.waves) for (const m of wv.members) if (knownForces(m.enemyId) === undefined) err(where, `wave mob ${m.enemyId} is not defined`);
    if (knownForces(t.add.enemyId) === undefined) err(where, `periodic add ${t.add.enemyId} is not defined`);
  }

  // points of interest: region link, walkable ground, defined enemies
  // rooms without a region are bridges / approaches / islands: an island is reached by boat (ghost boat), so it may be unreachable
  const islands = def.rooms.filter((r) => !w.regions.some((x) => x.roomId === r.id));
  const onIsland = (pos: [number, number]): boolean => islands.some((r) =>
    pos[0] >= r.rect.x && pos[0] <= r.rect.x + r.rect.w && pos[1] >= r.rect.z && pos[1] <= r.rect.z + r.rect.h);
  const at = (where: string, regionId: string | undefined, pos: [number, number]): void => {
    if (regionId !== undefined && !regionIds.has(regionId)) err(where, `unknown region ${regionId}`);
    const [px, pz] = tileM(pos);
    if (!reachable(px, pz) && !onIsland(pos)) err(where, `at ${pos} is not reachable (blocked, water or outside the rooms)`);
  };
  for (const x of w.waypoints) at(`waypoint ${x.id}`, x.regionId, x.pos);
  for (const x of w.entrances) at(`entrance ${x.id}`, x.regionId, x.pos);
  for (const x of w.shrines) at(`shrine ${x.id}`, x.regionId, x.pos);
  for (const x of w.chests) at(`chest ${x.id}`, x.regionId, x.pos);
  for (const x of w.cursed) at(`cursed chest ${x.id}`, x.regionId, x.pos);
  for (const x of w.hidden) at(`hidden area ${x.id}`, x.regionId, x.pos);
  for (const x of w.vistas) at(`vista ${x.id}`, x.regionId, x.pos);
  for (const x of w.landmarks) at(`landmark ${x.id}`, x.regionId, x.pos);
  for (const x of w.gather) at(`gather ${x.id}`, x.regionId, x.center);
  for (const x of w.rares) {
    for (const s of x.spots) at(`rare ${x.id}`, undefined, s);
    if (knownForces(x.enemyId) === undefined) err(`rare ${x.id}`, `enemy ${x.enemyId} is not defined (enemies module)`);
  }
  for (const x of w.minibosses) {
    at(`miniboss ${x.id}`, x.regionId, x.lair);
    if (knownForces(x.enemyId) === undefined) err(`miniboss ${x.id}`, `enemy ${x.enemyId} is not defined (enemies module)`);
  }
  for (const b of w.bosses) {
    if (!def.bosses.some((d) => d.bossId === b.bossId)) err(`boss schedule ${b.bossId}`, 'no BossPlacement with this id');
    if (knownForces(b.bossId) === undefined) err(`boss schedule ${b.bossId}`, 'boss def is not defined (enemies module)');
  }
  for (const b of def.bosses) if (knownForces(b.bossId) === undefined) err(`boss ${b.bossId}`, 'boss def is not defined (enemies module)');
  const g = w.ghostBoat;
  if (g && !w.water.some((x) => g.pos[0] >= x.rect.x - 4 && g.pos[0] <= x.rect.x + x.rect.w + 4 && g.pos[1] >= x.rect.z - 4 && g.pos[1] <= x.rect.z + x.rect.h + 4)) {
    warn(`ghost boat ${g.id}`, 'more than 4 tiles from any water');
  }
  return out;
}

/**
 * Quest data checks (GDD_OPENWORLD §6): unique ids, prerequisites, givers / turn-ins that exist as NPCs (hub NPCs without a
 * layout entry are warnings), objective targets (enemy ids via `knownEnemy`, dungeon ids, places, items), reward items.
 */
export function checkQuests(
  quests: QuestDef[],
  opts: { npcIds: Set<string>; knownEnemy: (id: string) => number | undefined; hasItem: (id: string) => boolean; dungeonIds: string[]; placeIds: Set<string> },
): Issue[] {
  const out: Issue[] = [];
  const err = (where: string, msg: string): void => { out.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { out.push({ level: 'warn', where, msg }); };
  const ids = new Set<string>();
  for (const q of quests) { if (ids.has(q.id)) err(`quest ${q.id}`, 'duplicate id'); ids.add(q.id); }
  for (const q of quests) {
    const where = `quest ${q.id}`;
    if (!opts.npcIds.has(q.giver)) warn(where, `giver ${q.giver} is not an NPC in the town / villages (hub not authored yet?)`);
    if (q.turnIn && !opts.npcIds.has(q.turnIn)) warn(where, `turn-in ${q.turnIn} is not an NPC in the town / villages`);
    for (const p of q.prereq ?? []) if (!ids.has(p)) err(where, `unknown prerequisite ${p}`);
    if (q.objectives.length === 0) err(where, 'no objectives');
    if (!(q.reward.xpPct > 0)) err(where, 'xpPct must be positive');
    for (const o of q.objectives) {
      const ow = `${where} [${o.kind} ${o.target ?? ''}]`;
      if (!(o.count >= 1)) err(ow, 'count below 1');
      if (!o.text.trim()) err(ow, 'empty objective text');
      if (!o.target) continue;
      if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'skill' || o.kind === 'metin') {
        if (opts.knownEnemy(o.target) === undefined) err(ow, `enemy / stone ${o.target} is not defined (enemies module)`);
      } else if (o.kind === 'talk') {
        if (!opts.npcIds.has(o.target)) warn(ow, `npc ${o.target} is not in the town / villages`);
      } else if (o.kind === 'collect') {
        if (!opts.hasItem(o.target)) err(ow, `item ${o.target} is not in data/materials.ts`);
      } else if (o.kind === 'dungeon') {
        if (!opts.dungeonIds.includes(o.target.split(':')[0])) err(ow, `unknown dungeon ${o.target}`);
      } else if (o.kind === 'explore') {
        if (!opts.placeIds.has(o.target)) err(ow, `place ${o.target} is not a room, village or camp`);
      }
    }
    for (const r of q.reward.items ?? []) if (!opts.hasItem(r.id)) err(where, `reward item ${r.id} is not in data/materials.ts`);
  }
  return out;
}

export interface TownReport { issues: Issue[]; stats: { props: number; npcs: number; lights: number; models: number } }

/** NPC model short names used by the scenes module (NPC.ts BASE_URL); 'prop' / 'portal' / 'dummy' are drawn by interactables. */
const NPC_BASE: Record<string, string> = {
  Knight: '/assets/models/characters/Knight.glb', Barbarian: '/assets/models/characters/Barbarian.glb', Mage: '/assets/models/characters/Mage.glb',
  Rogue: '/assets/models/characters/Rogue.glb', Rogue_Hooded: '/assets/models/characters/Rogue_Hooded.glb',
  King: '/assets/models/npcs/King.glb', Worker: '/assets/models/npcs/Worker.glb',
};
const NPC_VIRTUAL = new Set(['prop', 'portal', 'dummy']);
/** Resolved url of an NPC model (null for virtual models, undefined = unknown short name). */
export function npcUrl(model: string): string | null | undefined {
  if (NPC_VIRTUAL.has(model)) return null;
  if (NPC_BASE[model]) return NPC_BASE[model];
  return model.includes('/') ? model : undefined;
}

export function townUrls(town: TownDef): string[] {
  const out = new Set<string>();
  for (const p of town.props) out.add(p.model);
  for (const n of town.npcs) { const u = npcUrl(n.model); if (u) out.add(u); if (n.object) { out.add(n.object.model); for (const e of n.object.extra ?? []) out.add(e.model); } }
  return [...out];
}

export function checkTown(town: TownDef, models: ModelDb, dungeonIds: string[], zoneIds: string[] = []): TownReport {
  const issues: Issue[] = [];
  const err = (where: string, msg: string): void => { issues.push({ level: 'error', where, msg }); };
  const warn = (where: string, msg: string): void => { issues.push({ level: 'warn', where, msg }); };
  const info = (where: string, msg: string): void => { issues.push({ level: 'info', where, msg }); };
  const ids = new Map<string, number>();
  for (const n of town.npcs) ids.set(n.id, (ids.get(n.id) ?? 0) + 1);
  for (const [k, n] of ids) if (n > 1) err('town', `duplicate npc id ${k}`);
  const half = town.size[0] / 2;
  const roles = new Set(town.npcs.map((n) => n.role));
  for (const need of ['blacksmith', 'merchant', 'alchemist', 'stash', 'keystone', 'trainer', 'bounty', 'lobby', 'guard', 'citizen', 'portal'] as const) {
    if (!roles.has(need)) err('town', `missing npc role ${need}`);
  }
  for (const d of dungeonIds) {
    const portals = town.npcs.filter((n) => n.role === 'portal' && n.dungeonId === d);
    if (portals.length !== 1) err('town', `dungeon ${d} needs exactly one portal, found ${portals.length}`);
  }
  for (const n of town.npcs) {
    const where = `npc ${n.id}`;
    if (Math.abs(n.pos[0]) > half + 1 || Math.abs(n.pos[2]) > half + 1) err(where, `outside the town (${n.pos})`);
    const nu = npcUrl(n.model);
    if (nu === undefined) err(where, `unknown npc model ${n.model}`);
    const m = nu ? models.get(nu) : undefined;
    if (m && !m.exists) err(where, `missing model ${n.model}`);
    if (n.object) for (const u of [n.object.model, ...(n.object.extra ?? []).map((e) => e.model)]) { const mo = models.get(u); if (mo && !mo.exists) err(where, `missing object model ${u}`); }
    if (n.role === 'portal' && !n.dungeonId) err(where, 'portal without dungeonId');
    if (n.role === 'portal' && n.dungeonId && !dungeonIds.includes(n.dungeonId)) err(where, `unknown dungeon ${n.dungeonId}`);
    if (!n.name) err(where, 'no Turkish name');
  }
  let lights = 0;
  town.props.forEach((p, i) => {
    const where = `prop#${i} ${p.model.split('/').pop()}`;
    const m = models.get(p.model);
    if (m && !m.exists) err(where, `missing model ${p.model}`);
    if (p.light) lights++;
    if (Math.abs(p.pos[0]) > half + 90 || Math.abs(p.pos[2]) > half + 90) err(where, `way outside the town (${p.pos})`);
    if (p.vfx && !(VFX_IDS as readonly string[]).includes(p.vfx)) err(where, `unknown vfx ${p.vfx}`);
  });
  // npc vs collide props
  for (const n of town.npcs) {
    for (const p of town.props) {
      if (!p.collide) continue;
      const m = models.get(p.model);
      const s = p.scale ?? 1;
      const bx = m?.box ? [(m.box.max[0] - m.box.min[0]) * s, (m.box.max[2] - m.box.min[2]) * s] : (p.box ?? [(p.radius ?? 1) * 2, (p.radius ?? 1) * 2]);
      const rot = ((p.rot ?? 0) * Math.PI) / 180;
      const dx = n.pos[0] - p.pos[0], dz = n.pos[2] - p.pos[2];
      const lx = dx * Math.cos(rot) - dz * Math.sin(rot), lz = dx * Math.sin(rot) + dz * Math.cos(rot);
      if (Math.abs(lx) < bx[0] / 2 * 0.9 && Math.abs(lz) < bx[1] / 2 * 0.9 && Math.abs(n.pos[1] - p.pos[1]) < 1.5) err(`npc ${n.id}`, `stands inside collide prop ${p.model.split('/').pop()} at ${p.pos[0]},${p.pos[2]}`);
    }
  }
  if (town.spawn) {
    for (const p of town.props) {
      if (!p.collide) continue;
      const d = Math.hypot(p.pos[0] - town.spawn.pos[0], p.pos[2] - town.spawn.pos[2]);
      if (d < (p.radius ?? 1) + 1.5) err('town', `spawn is inside / next to collide prop ${p.model.split('/').pop()}`);
    }
  }
  // the builder skips its default walls when any prop path matches /wall_|fence_stone/, and drops its default notice board when a
  // board / signpost prop stands within 12 m of it
  town.props.forEach((p, i) => {
    if (/wall_|fence_stone/.test(p.model)) err(`prop#${i} ${p.model.split('/').pop()}`, 'model path matches the builder wall regex: the default town walls would be skipped');
    if (/notice|signpost/.test(p.model) && Math.hypot(p.pos[0] - 8, p.pos[2] - 18) < 12) err(`prop#${i} ${p.model.split('/').pop()}`, 'within 12 m of the default notice board: the builder would drop the board the BountyBoard adopts');
    if (/lobby_obelisk|notice_board|waypoint_stone|mplus_portal/.test(p.model)) warn(`prop#${i}`, `${p.model.split('/').pop()} is a builder default adopted by an interactable`);
  });
  // props / npcs on the terrace need y = terrace height
  for (const t of town.terraces ?? []) {
    for (const n of town.npcs) if (n.pos[0] >= t.box[0] && n.pos[0] <= t.box[2] && n.pos[2] >= t.box[1] && n.pos[2] <= t.box[3] && n.pos[1] !== t.y) warn(`npc ${n.id}`, `stands on terrace ${t.id} but y = ${n.pos[1]} (terrace y ${t.y})`);
    town.props.forEach((p, i) => {
      if (p.pos[0] >= t.box[0] && p.pos[0] <= t.box[2] && p.pos[2] >= t.box[1] && p.pos[2] <= t.box[3] && p.pos[1] < t.y - 0.01 && !p.model.includes('/buildings/')) warn(`prop#${i} ${p.model.split('/').pop()}`, `inside terrace ${t.id} but y = ${p.pos[1]}`);
    });
  }
  for (const e of town.exits ?? []) if (Math.abs(e.box[0]) > half + 5 || Math.abs(e.box[2]) > half + 5) err('town', `exit ${e.id} outside the map`);
  for (const e of town.exits ?? []) if (!dungeonIds.includes(e.to) && !zoneIds.includes(e.to)) warn('town', `exit ${e.id} leads to ${e.to}, which is not registered (skeleton map?)`);
  info('town', `${town.props.length} props, ${town.npcs.length} npcs`);
  return { issues, stats: { props: town.props.length, npcs: town.npcs.length, lights, models: new Set(town.props.map((p) => p.model)).size } };
}
