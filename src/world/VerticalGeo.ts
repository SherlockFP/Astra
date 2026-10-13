/**
 * Procedural geometry for vertical dungeons (docs/ENGINE_VERTICALITY.md §7.2, §7.4, §7.6). OWNER: world (V4).
 *
 * Pure THREE geometry in world space, one merged BufferGeometry per kind. Every height is read from the Heightfield (or the
 * NavGrid floor copied from it), so the drawn treads, ramps, rails and cliffs agree with groundY by construction. Materials
 * and meshes are created by the caller (DungeonBuilder); nothing here touches the scene or the batcher.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldUVBox } from './ProceduralAssets';
import { F, VERT, treadTop, type BuiltSlope, type Heightfield } from './Heightfield';
import type { NavGrid } from './NavGrid';
import type { DecorTier, RoomDef } from '../types/dungeons';

/** Mirrors TILE_SIZE (4 m). */
const T = 4;
type V3 = [number, number, number];

/** Collects world-space boxes and flat quads, then merges them into one non-indexed geometry. */
class Batch {
  private parts: THREE.BufferGeometry[] = [];

  /** Axis-aligned box between two world corners (degenerate boxes are skipped). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 1e-4 || h <= 1e-4 || d <= 1e-4) return;
    const g = worldUVBox(w, h, d, 0.25).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.parts.push(g);
  }

  /** Flat quad with an explicit normal. Materials using it must be DoubleSide (winding is not enforced). */
  quad(p: [V3, V3, V3, V3], n: V3): void {
    const verts = [p[0], p[1], p[2], p[0], p[2], p[3]];
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    for (const v of verts) {
      pos.push(v[0], v[1], v[2]);
      uv.push((v[0] + v[2]) * 0.25, v[1] * 0.25);
      nor.push(n[0], n[1], n[2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.parts.push(g);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    this.parts.forEach((g) => g.dispose());
    this.parts = [];
    return merged;
  }
}

/** Unit normal of a quad given by its first corner and two edge directions (flipped to point up when `up`). */
function normalOf(a: V3, b: V3, c: V3, up: boolean): V3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: V3 = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  if (up && n[1] < 0) n = [-n[0], -n[1], -n[2]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Stairs (kind 'stairs': one box per tread, top = treadTop, same as groundY) or ramp (kind 'ramp': a sloped top quad plus the two
 * side walls down to the underside). `part: 'carpet'` lays a thin strip on the treads (stairs only; ramps return null).
 */
export function slopeGeometry(s: BuiltSlope, part: 'body' | 'carpet'): THREE.BufferGeometry | null {
  const b = new Batch();
  const a0 = s.axis === 'x' ? s.x0 : s.z0, a1 = s.axis === 'x' ? s.x1 : s.z1; // along the strip
  const c0 = s.axis === 'x' ? s.z0 : s.x0, c1 = s.axis === 'x' ? s.z1 : s.x1; // across the strip
  const bottom = Math.min(s.yFrom, s.yTo) - 0.6;
  // (u along, v across, y) -> world [x, y, z]
  const P = (u: number, v: number, y: number): V3 => (s.axis === 'x' ? [u, y, v] : [v, y, u]);
  // axis-aligned box from along-range [u0,u1], across-range [v0,v1], height [y0,y1]
  const B = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number): void => {
    if (s.axis === 'x') b.box(u0, y0, v0, u1, y1, v1);
    else b.box(v0, y0, u0, v1, y1, u1);
  };
  const span = a1 - a0;

  if (s.kind === 'stairs') {
    const n = Math.max(1, s.treads);
    for (let i = 0; i < n; i++) {
      const u0 = a0 + (span * i) / n, u1 = a0 + (span * (i + 1)) / n;
      const top = treadTop(s.yFrom, s.yTo, i, n);
      if (part === 'body') B(u0, u1, c0, c1, bottom, top);
      else {
        const w = c1 - c0;
        B(u0 + 0.05, u1 - 0.05, c0 + w * 0.2, c1 - w * 0.2, top, top + 0.02);
      }
    }
    return b.build();
  }

  if (part === 'carpet') return null;
  const p0 = P(a0, c0, s.yFrom), p1 = P(a1, c0, s.yTo), p2 = P(a1, c1, s.yTo), p3 = P(a0, c1, s.yFrom);
  b.quad([p0, p1, p2, p3], normalOf(p0, p1, p3, true));
  // side walls at both edges of the ramp, from the sloped top down to the underside
  const outward = (sign: number): V3 => (s.axis === 'x' ? [0, 0, sign] : [sign, 0, 0]);
  const side = (v: number, sign: number): void => {
    const q0 = P(a0, v, s.yFrom), q1 = P(a1, v, s.yTo), q2 = P(a1, v, bottom), q3 = P(a0, v, bottom);
    b.quad([q0, q1, q2, q3], outward(sign));
  };
  side(c0, -1);
  side(c1, 1);
  return b.build();
}

/**
 * Low balustrade on every RAIL cell (NavGrid flag set by the rim pass, §5.3): a thin 0.9 m wall on the cell edge that faces each
 * lower neighbour. The rail cell itself is blocked for nav, so the wall and the collision agree.
 */
export function railGeometry(nav: NavGrid): THREE.BufferGeometry | null {
  const flags = nav.flags, floor = nav.floor;
  if (!flags || !floor) return null;
  const b = new Batch();
  const H = 0.9, TH = 0.14;
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let r = 0; r < nav.rows; r++)
    for (let c = 0; c < nav.cols; c++) {
      const i = r * nav.cols + c;
      if (!(flags[i]! & F.RAIL)) continue;
      const fl = floor[i]!, cx = nav.centerX(c), cz = nav.centerZ(r);
      for (const [dx, dz] of dirs) {
        const nc = c + dx, nr = r + dz;
        if (!nav.inBounds(nc, nr)) continue;
        if (fl - floor[nr * nav.cols + nc]! <= VERT.STEP_UP) continue;
        const ex = cx + dx * 0.5, ez = cz + dz * 0.5;
        if (dx !== 0) b.box(ex - TH / 2, fl, cz - 0.5, ex + TH / 2, fl + H, cz + 0.5);
        else b.box(cx - 0.5, fl, ez - TH / 2, cx + 0.5, fl + H, ez + TH / 2);
      }
    }
  return b.build();
}

/**
 * Vertical faces where two adjacent 2 m cells of the SAME room differ in floor height (§7.2). Cross-room edges are left to the
 * wall pieces (they already run from the lower floor up), slopes/lifts/voids have their own geometry.
 */
export function cliffGeometry(hf: Heightfield): THREE.BufferGeometry | null {
  const b = new Batch();
  const { zw, zh, floor2, flags2, roomOf2 } = hf;
  const BAD = F.VOID | F.LIFT | F.SLOPE;
  const ok = (a: number, c: number): boolean =>
    roomOf2[a]! >= 0 && roomOf2[a] === roomOf2[c] && !((flags2[a]! | flags2[c]!) & BAD);
  for (let zj = 0; zj < zh; zj++)
    for (let zi = 0; zi < zw; zi++) {
      const a = zj * zw + zi;
      if (zi + 1 < zw) {
        const c = a + 1, d = floor2[a]! - floor2[c]!;
        if (Math.abs(d) > 0.05 && ok(a, c)) {
          const x = (zi + 1) * 2, z0 = zj * 2, z1 = z0 + 2;
          const lo = Math.min(floor2[a]!, floor2[c]!), hi = Math.max(floor2[a]!, floor2[c]!);
          b.quad([[x, lo, z0], [x, lo, z1], [x, hi, z1], [x, hi, z0]], d > 0 ? [1, 0, 0] : [-1, 0, 0]);
        }
      }
      if (zj + 1 < zh) {
        const c = a + zw, d = floor2[a]! - floor2[c]!;
        if (Math.abs(d) > 0.05 && ok(a, c)) {
          const z = (zj + 1) * 2, x0 = zi * 2, x1 = x0 + 2;
          const lo = Math.min(floor2[a]!, floor2[c]!), hi = Math.max(floor2[a]!, floor2[c]!);
          b.quad([[x0, lo, z], [x1, lo, z], [x1, hi, z], [x0, hi, z]], d > 0 ? [0, 0, 1] : [0, 0, -1]);
        }
      }
    }
  return b.build();
}

/**
 * Decorative upper structure (§7.6): gallery / balcony slab with balustrade and support columns, ring (slab band around the
 * rect border), colonnade, windows (frames plus a separate glass batch) and ceiling beams. Returns a stone and a glass geometry.
 * Edges that lie on the room outline touch a wall: they get no balustrade and no columns.
 */
export function tierGeometry(
  tier: DecorTier,
  room: RoomDef | undefined,
  hf: Heightfield,
  topY: number,
): { stone: THREE.BufferGeometry | null; glass: THREE.BufferGeometry | null } {
  const stone = new Batch(), glass = new Batch();
  const r = tier.rect;
  const x0 = r.x * T, z0 = r.z * T, x1 = (r.x + r.w) * T, z1 = (r.z + r.h) * T;
  const y = tier.y;
  const depth = tier.depth ?? 3;
  const rx0 = room ? room.rect.x * T : -Infinity, rx1 = room ? (room.rect.x + room.rect.w) * T : Infinity;
  const rz0 = room ? room.rect.z * T : -Infinity, rz1 = room ? (room.rect.z + room.rect.h) * T : Infinity;
  const wallX = (x: number): boolean => Math.abs(x - rx0) < 0.01 || Math.abs(x - rx1) < 0.01;
  const wallZ = (z: number): boolean => Math.abs(z - rz0) < 0.01 || Math.abs(z - rz1) < 0.01;

  const rail = (xa: number, za: number, xb: number, zb: number): void => {
    if (xa === xb) stone.box(xa - 0.06, y, Math.min(za, zb), xa + 0.06, y + 1, Math.max(za, zb));
    else stone.box(Math.min(xa, xb), y, za - 0.06, Math.max(xa, xb), y + 1, za + 0.06);
  };
  const column = (px: number, pz: number): void => {
    const floor = hf.groundY(px, pz);
    stone.box(px - 0.25, floor - 0.2, pz - 0.25, px + 0.25, y - 0.4, pz + 0.25);
  };
  const columnsAlong = (xa: number, za: number, xb: number, zb: number): void => {
    const len = Math.hypot(xb - xa, zb - za);
    const n = Math.max(1, Math.floor(len / 6));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      column(xa + (xb - xa) * t, za + (zb - za) * t);
    }
  };
  /** Balustrade and columns on each footprint edge that is not on the room outline (`wall` skips columns). */
  const edges = (ax0: number, az0: number, ax1: number, az1: number): void => {
    const edge = (xa: number, za: number, xb: number, zb: number, onWall: boolean): void => {
      if (onWall) return;
      rail(xa, za, xb, zb);
      if (!tier.wall) columnsAlong(xa, za, xb, zb);
    };
    edge(ax0, az0, ax1, az0, wallZ(az0));
    edge(ax0, az1, ax1, az1, wallZ(az1));
    edge(ax0, az0, ax0, az1, wallX(ax0));
    edge(ax1, az0, ax1, az1, wallX(ax1));
  };

  switch (tier.kind) {
    case 'gallery':
    case 'balcony': {
      stone.box(x0, y - 0.4, z0, x1, y, z1);
      edges(x0, z0, x1, z1);
      break;
    }
    case 'ring': {
      stone.box(x0, y - 0.4, z0, x1, y, z0 + depth);
      stone.box(x0, y - 0.4, z1 - depth, x1, y, z1);
      stone.box(x0, y - 0.4, z0 + depth, x0 + depth, y, z1 - depth);
      stone.box(x1 - depth, y - 0.4, z0 + depth, x1, y, z1 - depth);
      edges(x0 + depth, z0 + depth, x1 - depth, z1 - depth);
      break;
    }
    case 'colonnade': {
      const longX = r.w >= r.h;
      const n = Math.max(2, tier.count ?? 4);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (longX) { column(x0 + (x1 - x0) * t, z0 + 0.7); column(x0 + (x1 - x0) * t, z1 - 0.7); }
        else { column(x0 + 0.7, z0 + (z1 - z0) * t); column(x1 - 0.7, z0 + (z1 - z0) * t); }
      }
      break;
    }
    case 'windows': {
      const horizontal = r.h < r.w;
      const n = Math.max(1, tier.count ?? 3);
      const len = horizontal ? x1 - x0 : z1 - z0;
      const spacing = tier.spacing ?? len / n;
      for (let k = 0; k < n; k++) {
        const u = (horizontal ? x0 : z0) + (k + 0.5) * Math.min(spacing, len / n);
        const cx = horizontal ? u : x0 + 0.5, cz = horizontal ? z0 + 0.5 : u;
        const fw = horizontal ? 1.2 : 0.35, fd = horizontal ? 0.35 : 1.2;
        stone.box(cx - fw / 2, y, cz - fd / 2, cx + fw / 2, y + 2.4, cz + fd / 2);
        glass.box(cx - fw / 2 + 0.12, y + 0.15, cz - fd / 2 + 0.12, cx + fw / 2 - 0.12, y + 2.25, cz + fd / 2 - 0.12);
      }
      break;
    }
    case 'beams': {
      if (!Number.isFinite(topY)) break;
      const longX = r.w >= r.h;
      const n = Math.max(1, Math.floor(((longX ? x1 - x0 : z1 - z0)) / 3));
      for (let k = 0; k <= n; k++) {
        const u = (longX ? x0 : z0) + ((longX ? x1 - x0 : z1 - z0) * k) / n;
        if (longX) stone.box(u - 0.2, topY - 1.6, z0, u + 0.2, topY - 1, z1);
        else stone.box(x0, topY - 1.6, u - 0.2, x1, topY - 1, u + 0.2);
      }
      break;
    }
  }
  return { stone: stone.build(), glass: glass.build() };
}
