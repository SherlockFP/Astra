/**
 * Voxel level of detail, PURE (typed arrays in, typed arrays out; no three.js), so the node sims can run it.
 *
 * The voxel scenery models (tools/voxel, public/assets/models/voxel) are surface meshes of axis-aligned unit faces, every face a flat
 * palette texel (constant uv). That is enough to rebuild the voxel grid exactly:
 *   1. every triangle is rasterised into the unit cells it covers -> a face per (cell, direction) with its palette uv,
 *   2. the exterior is flood-filled through the cell boundaries that carry no face -> solid / empty occupancy (closed shells and
 *      hollow insides both come out right),
 *   3. level 0 is the SAME surface with coplanar same-colour faces merged into rectangles (greedy meshing: identical picture,
 *      fewer triangles); level n>0 first downsamples the occupancy by `factor` (a coarse cell is solid when enough of its children
 *      are), colours each exposed coarse face with the commonest palette texel of the faces under it, then greedy-meshes that.
 * Anything that is not such a mesh (no uv, a triangle that is not axis aligned or whose uv varies, vertices off the grid, a grid too
 * big) returns null and the caller keeps the original geometry. OWNER: world module.
 */

export interface RawMesh {
  position: Float32Array;
  uv: Float32Array;
  /** Triangle list indices; null = every three vertices are a triangle. */
  index: ArrayLike<number> | null;
}

export interface LodMesh {
  position: Float32Array;
  uv: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Per-vertex normals (the face direction), only when `normals` was asked for. */
  normal: Float32Array | null;
  triangles: number;
}

/** The voxel grid of a mesh: unit size, origin, extents and the face colour per (direction, cell). */
export interface VoxelFaces {
  vs: number;
  origin: [number, number, number];
  max: [number, number, number];
  dim: [number, number, number];
  /** Unique palette uv pairs (u0, v0, u1, v1 ...). */
  uvs: number[];
  /** faces[d][cell] = palette index + 1 (0 = no face); d = axis * 2 + (0: facing +, 1: facing -); cell = (z * dy + y) * dx + x of the SOLID cell. */
  faces: Uint16Array[];
  faceCount: number;
}

const MAX_CELLS = 6_000_000;
const EPS = 1e-4;

const cellIndex = (dim: readonly number[], x: number, y: number, z: number): number => (z * dim[1] + y) * dim[0] + x;

/** Rebuilds the voxel faces of a mesh; null when the mesh is not a flat-palette voxel surface. */
export function analyseVoxelMesh(m: RawMesh): VoxelFaces | null {
  const P = m.position, UV = m.uv;
  const nv = P.length / 3;
  if (nv < 3 || UV.length / 2 !== nv) return null;
  // voxel size = the smallest gap between distinct coordinates (per axis, 0.1 mm resolution)
  const o: [number, number, number] = [Infinity, Infinity, Infinity];
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++)
    for (let a = 0; a < 3; a++) {
      const c = P[i * 3 + a];
      if (c < o[a]) o[a] = c;
      if (c > mx[a]) mx[a] = c;
    }
  let vs = Infinity;
  for (let a = 0; a < 3; a++) {
    const set = new Set<number>();
    for (let i = 0; i < nv; i++) set.add(Math.round((P[i * 3 + a] - o[a]) / EPS));
    const sorted = [...set].sort((p, q) => p - q);
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i] - sorted[i - 1]) * EPS;
      if (gap > 5e-4 && gap < vs) vs = gap;
    }
  }
  if (!Number.isFinite(vs)) return null;
  const dim: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) dim[a] = Math.max(1, Math.round((mx[a] - o[a]) / vs));
  if (dim[0] * dim[1] * dim[2] > MAX_CELLS) return null;
  for (let i = 0; i < nv; i++)
    for (let a = 0; a < 3; a++) {
      const g = (P[i * 3 + a] - o[a]) / vs;
      if (Math.abs(g - Math.round(g)) > 0.06) return null; // off the grid: not a voxel mesh
    }

  const total = dim[0] * dim[1] * dim[2];
  const faces: Uint16Array[] = [];
  for (let d = 0; d < 6; d++) faces.push(new Uint16Array(total));
  const uvs: number[] = [];
  const uvId = new Map<number, number>();
  let faceCount = 0;
  const ntri = (m.index ? m.index.length : nv) / 3;
  const tri = (k: number, c: number): number => (m.index ? m.index[k * 3 + c] : k * 3 + c);
  const p = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let t = 0; t < ntri; t++) {
    const i0 = tri(t, 0), i1 = tri(t, 1), i2 = tri(t, 2);
    for (let c = 0; c < 3; c++) {
      const ii = c === 0 ? i0 : c === 1 ? i1 : i2;
      p[c * 3] = P[ii * 3]; p[c * 3 + 1] = P[ii * 3 + 1]; p[c * 3 + 2] = P[ii * 3 + 2];
    }
    // flat colour: the three uvs agree
    const u0 = UV[i0 * 2], v0 = UV[i0 * 2 + 1];
    if (Math.abs(UV[i1 * 2] - u0) > 1e-3 || Math.abs(UV[i2 * 2] - u0) > 1e-3 || Math.abs(UV[i1 * 2 + 1] - v0) > 1e-3 || Math.abs(UV[i2 * 2 + 1] - v0) > 1e-3) return null;
    // normal
    const ex = p[3] - p[0], ey = p[4] - p[1], ez = p[5] - p[2], fx = p[6] - p[0], fy = p[7] - p[1], fz = p[8] - p[2];
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const big = Math.max(ax, ay, az);
    if (big < 1e-12) continue; // degenerate
    const a = ax === big ? 0 : ay === big ? 1 : 2;
    if (big - (ax + ay + az - big) * 1 < big * 0.999) return null; // not axis aligned
    const sgn = (a === 0 ? nx : a === 1 ? ny : nz) > 0 ? 1 : -1;
    const pl = Math.round((p[a] - o[a]) / vs);
    if (Math.abs(p[3 + a] - p[a]) > 1e-3 || Math.abs(p[6 + a] - p[a]) > 1e-3) return null;
    const solidA = sgn > 0 ? pl - 1 : pl;
    if (solidA < 0 || solidA >= dim[a]) continue;
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    // palette id
    const key = Math.round(u0 * 4096) * 8192 + Math.round(v0 * 4096);
    let id = uvId.get(key);
    if (id === undefined) {
      if (uvs.length / 2 >= 65534) return null;
      id = uvs.length / 2;
      uvs.push(u0, v0);
      uvId.set(key, id);
    }
    // rasterise: every unit cell whose centre lies inside the triangle (edges inclusive)
    const umin = Math.min(p[ua], p[3 + ua], p[6 + ua]), umax = Math.max(p[ua], p[3 + ua], p[6 + ua]);
    const vmin = Math.min(p[va], p[3 + va], p[6 + va]), vmax = Math.max(p[va], p[3 + va], p[6 + va]);
    const iu0 = Math.max(0, Math.floor((umin - o[ua]) / vs + 1e-6)), iu1 = Math.min(dim[ua] - 1, Math.ceil((umax - o[ua]) / vs - 1e-6) - 1);
    const iv0 = Math.max(0, Math.floor((vmin - o[va]) / vs + 1e-6)), iv1 = Math.min(dim[va] - 1, Math.ceil((vmax - o[va]) / vs - 1e-6) - 1);
    const au = p[ua], av = p[va], bu = p[3 + ua], bv = p[3 + va], cu = p[6 + ua], cv = p[6 + va];
    const den = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
    if (Math.abs(den) < 1e-12) continue;
    const xyz = [0, 0, 0];
    for (let iv = iv0; iv <= iv1; iv++)
      for (let iu = iu0; iu <= iu1; iu++) {
        const pu = o[ua] + (iu + 0.5) * vs, pv = o[va] + (iv + 0.5) * vs;
        const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / den;
        const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / den;
        const l3 = 1 - l1 - l2;
        const e = -1e-6;
        if (l1 < e || l2 < e || l3 < e) continue;
        xyz[a] = solidA; xyz[ua] = iu; xyz[va] = iv;
        const d = a * 2 + (sgn > 0 ? 0 : 1);
        const ci = cellIndex(dim, xyz[0], xyz[1], xyz[2]);
        if (faces[d][ci] === 0) faceCount++;
        faces[d][ci] = id + 1;
      }
  }
  if (faceCount === 0) return null;
  return { vs, origin: o, max: mx, dim, uvs, faces, faceCount };
}

/** Solid occupancy from the faces: the exterior is flooded through every cell boundary without a face; the rest (and any cell that owns a face) is solid. */
export function solidCells(v: VoxelFaces): Uint8Array {
  const [dx, dy, dz] = v.dim;
  const px = dx + 2, py = dy + 2, pz = dz + 2;
  const ext = new Uint8Array(px * py * pz);
  const pidx = (x: number, y: number, z: number): number => (z * py + y) * px + x;
  const stack = new Int32Array(px * py * pz);
  let sp = 0;
  ext[0] = 1;
  stack[sp++] = 0;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (sp > 0) {
    const cur = stack[--sp];
    const x = cur % px, y = Math.floor(cur / px) % py, z = Math.floor(cur / (px * py));
    for (let k = 0; k < 6; k++) {
      const nx = x + dirs[k][0], ny = y + dirs[k][1], nz = z + dirs[k][2];
      if (nx < 0 || ny < 0 || nz < 0 || nx >= px || ny >= py || nz >= pz) continue;
      const ni = pidx(nx, ny, nz);
      if (ext[ni]) continue;
      // real coordinates of the neighbour (padding shifts by one)
      const rx = nx - 1, ry = ny - 1, rz = nz - 1;
      if (rx >= 0 && ry >= 0 && rz >= 0 && rx < dx && ry < dy && rz < dz) {
        // the neighbour's face towards the cell we come from: moving along +a means the neighbour's -a face
        const a = k >> 1, movingPlus = (k & 1) === 0;
        const d = a * 2 + (movingPlus ? 1 : 0);
        if (v.faces[d][cellIndex(v.dim, rx, ry, rz)] !== 0) continue;
      }
      ext[ni] = 1;
      stack[sp++] = ni;
    }
  }
  const solid = new Uint8Array(dx * dy * dz);
  for (let z = 0; z < dz; z++)
    for (let y = 0; y < dy; y++)
      for (let x = 0; x < dx; x++) {
        const ci = cellIndex(v.dim, x, y, z);
        let own = false;
        for (let d = 0; d < 6 && !own; d++) if (v.faces[d][ci] !== 0) own = true;
        solid[ci] = own || !ext[pidx(x + 1, y + 1, z + 1)] ? 1 : 0;
      }
  return solid;
}

/** Greedy-meshes per-direction face colour grids (dims `dim`, cell edge `cell` metres) into quads. */
function greedy(v: VoxelFaces, dim: readonly number[], cell: number, faces: Uint16Array[], withNormals: boolean): LodMesh {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [], idx: number[] = [];
  const o = v.origin, mx = v.max;
  const pt = (out: number[], a: number, ua: number, va: number, w: number, iu: number, iv: number): void => {
    const c = [0, 0, 0];
    c[a] = o[a] + w * cell; c[ua] = o[ua] + iu * cell; c[va] = o[va] + iv * cell;
    out.push(Math.min(c[0], mx[0]), Math.min(c[1], mx[1]), Math.min(c[2], mx[2]));
  };
  for (let d = 0; d < 6; d++) {
    const a = d >> 1, plus = (d & 1) === 0;
    const ua = (a + 1) % 3, va = (a + 2) % 3;
    const nu = dim[ua], nv = dim[va];
    const mask = new Uint16Array(nu * nv);
    for (let w = 0; w < dim[a]; w++) {
      let any = false;
      const xyz = [0, 0, 0];
      for (let iv = 0; iv < nv; iv++)
        for (let iu = 0; iu < nu; iu++) {
          xyz[a] = w; xyz[ua] = iu; xyz[va] = iv;
          const val = faces[d][cellIndex(dim, xyz[0], xyz[1], xyz[2])];
          mask[iv * nu + iu] = val;
          if (val) any = true;
        }
      if (!any) continue;
      for (let iv = 0; iv < nv; iv++)
        for (let iu = 0; iu < nu; iu++) {
          const val = mask[iv * nu + iu];
          if (!val) continue;
          let wd = 1;
          while (iu + wd < nu && mask[iv * nu + iu + wd] === val) wd++;
          let ht = 1;
          grow: while (iv + ht < nv) {
            for (let k = 0; k < wd; k++) if (mask[(iv + ht) * nu + iu + k] !== val) break grow;
            ht++;
          }
          for (let j = 0; j < ht; j++) for (let k = 0; k < wd; k++) mask[(iv + j) * nu + iu + k] = 0;
          const wp = plus ? w + 1 : w;
          const base = pos.length / 3;
          const corners: [number, number][] = plus
            ? [[iu, iv], [iu + wd, iv], [iu + wd, iv + ht], [iu, iv + ht]]
            : [[iu, iv], [iu, iv + ht], [iu + wd, iv + ht], [iu + wd, iv]];
          const quad: number[] = [];
          for (const [cu, cv] of corners) pt(quad, a, ua, va, wp, cu, cv);
          // a quad squeezed to nothing by the clamp at the model's far edge is dropped
          const dxl = Math.abs(quad[0] - quad[6]) + Math.abs(quad[1] - quad[7]) + Math.abs(quad[2] - quad[8]);
          if (dxl < 1e-6 && Math.abs(quad[0] - quad[3]) + Math.abs(quad[1] - quad[4]) + Math.abs(quad[2] - quad[5]) < 1e-6) continue;
          for (let q = 0; q < 12; q++) pos.push(quad[q]);
          const u = v.uvs[(val - 1) * 2], vv = v.uvs[(val - 1) * 2 + 1];
          for (let q = 0; q < 4; q++) {
            uv.push(u, vv);
            if (withNormals) nrm.push(a === 0 ? (plus ? 1 : -1) : 0, a === 1 ? (plus ? 1 : -1) : 0, a === 2 ? (plus ? 1 : -1) : 0);
          }
          idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
    }
  }
  const nvert = pos.length / 3;
  return {
    position: Float32Array.from(pos),
    uv: Float32Array.from(uv),
    index: nvert > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx),
    normal: withNormals ? Float32Array.from(nrm) : null,
    triangles: idx.length / 3,
  };
}

/** Level 0: the same surface, coplanar same-colour faces merged. */
export function mergeFaces(v: VoxelFaces, withNormals = false): LodMesh {
  return greedy(v, v.dim, v.vs, v.faces, withNormals);
}

/**
 * Coarser copy: the occupancy is downsampled by `factor` (a coarse cell is solid when at least `keep` of its children are solid, so thin
 * trunks and ragged crowns survive), each exposed coarse face takes the commonest palette texel of the original faces in its cell.
 */
export function downsample(v: VoxelFaces, factor: number, keep = 0.2, withNormals = false): LodMesh {
  const f = Math.max(2, Math.round(factor));
  const solid = solidCells(v);
  const cd: [number, number, number] = [Math.ceil(v.dim[0] / f), Math.ceil(v.dim[1] / f), Math.ceil(v.dim[2] / f)];
  const nC = cd[0] * cd[1] * cd[2];
  const count = new Uint16Array(nC);
  const coarseOf = (x: number, y: number, z: number): number => cellIndex(cd, Math.floor(x / f), Math.floor(y / f), Math.floor(z / f));
  for (let z = 0; z < v.dim[2]; z++)
    for (let y = 0; y < v.dim[1]; y++)
      for (let x = 0; x < v.dim[0]; x++) if (solid[cellIndex(v.dim, x, y, z)]) count[coarseOf(x, y, z)]++;
  const thr = Math.max(1, Math.round(f * f * f * keep));
  const solidC = new Uint8Array(nC);
  for (let c = 0; c < nC; c++) solidC[c] = count[c] >= thr ? 1 : 0;
  // thin vertical features (trunks, dead branches, stems) are one voxel wide and never fill a coarse cell: a cell that holds a whole
  // vertical column of solid voxels stays solid, so a dead tree keeps its height
  // (unless that would more than triple the volume: a field of corn stalks must not turn into fat posts)
  const withColumns = solidC.slice();
  for (let z = 0; z < v.dim[2]; z++)
    for (let x = 0; x < v.dim[0]; x++) {
      let run = 0;
      for (let y = 0; y < v.dim[1]; y++) {
        run = solid[cellIndex(v.dim, x, y, z)] ? run + 1 : 0;
        if (run >= f && y % f === f - 1) withColumns[coarseOf(x, y, z)] = 1;
      }
    }
  let volFine = 0, volCoarse = 0;
  for (let i = 0; i < solid.length; i++) volFine += solid[i];
  for (let c = 0; c < nC; c++) volCoarse += withColumns[c];
  if (volCoarse * f * f * f <= volFine * 3) solidC.set(withColumns);

  // colours: commonest palette id per (coarse cell, direction) and per coarse cell
  const U = v.uvs.length / 2 + 1;
  const tally = new Map<number, number>();
  const anyTally = new Map<number, number>();
  for (let z = 0; z < v.dim[2]; z++)
    for (let y = 0; y < v.dim[1]; y++)
      for (let x = 0; x < v.dim[0]; x++) {
        const ci = cellIndex(v.dim, x, y, z);
        const cc = coarseOf(x, y, z);
        for (let d = 0; d < 6; d++) {
          const id = v.faces[d][ci];
          if (!id) continue;
          const k = (cc * 6 + d) * U + id;
          tally.set(k, (tally.get(k) ?? 0) + 1);
          const k2 = cc * U + id;
          anyTally.set(k2, (anyTally.get(k2) ?? 0) + 1);
        }
      }
  const bestDir = new Uint16Array(nC * 6), bestDirN = new Uint16Array(nC * 6);
  for (const [k, n] of tally) {
    const id = k % U, cd6 = Math.floor(k / U);
    if (n > bestDirN[cd6]) { bestDirN[cd6] = n; bestDir[cd6] = id; }
  }
  const bestAny = new Uint16Array(nC), bestAnyN = new Uint16Array(nC);
  for (const [k, n] of anyTally) {
    const id = k % U, cc = Math.floor(k / U);
    if (n > bestAnyN[cc]) { bestAnyN[cc] = n; bestAny[cc] = id; }
  }

  const faces: Uint16Array[] = [];
  for (let d = 0; d < 6; d++) faces.push(new Uint16Array(nC));
  for (let z = 0; z < cd[2]; z++)
    for (let y = 0; y < cd[1]; y++)
      for (let x = 0; x < cd[0]; x++) {
        const c = cellIndex(cd, x, y, z);
        if (!solidC[c]) continue;
        for (let d = 0; d < 6; d++) {
          const a = d >> 1, s = (d & 1) === 0 ? 1 : -1;
          const n = [x, y, z];
          n[a] += s;
          const out = n[a] < 0 || n[a] >= cd[a];
          if (!out && solidC[cellIndex(cd, n[0], n[1], n[2])]) continue;
          let id = bestDir[c * 6 + d] || bestAny[c];
          if (!id) {
            // a coarse cell made of interior voxels only: borrow the colour of a coloured neighbour
            for (let e = 0; e < 6 && !id; e++) {
              const m = [x, y, z];
              m[e >> 1] += (e & 1) === 0 ? 1 : -1;
              if (m[0] < 0 || m[1] < 0 || m[2] < 0 || m[0] >= cd[0] || m[1] >= cd[1] || m[2] >= cd[2]) continue;
              id = bestAny[cellIndex(cd, m[0], m[1], m[2])];
            }
          }
          faces[d][c] = id || 1;
        }
      }
  return greedy(v, cd, v.vs * f, faces, withNormals);
}

/** Convenience for callers that start from a RawMesh. */
export function lodOf(m: RawMesh, factor: number, keep?: number, withNormals = false): LodMesh | null {
  const v = analyseVoxelMesh(m);
  if (!v) return null;
  return factor <= 1 ? mergeFaces(v, withNormals) : downsample(v, factor, keep, withNormals);
}
