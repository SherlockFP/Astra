import * as THREE from 'three';
import type { Relief } from './Relief';

/**
 * Terrain mesh geometry from the baked relief (docs/ENGINE_BIGMAPS.md section 10). OWNER: world module (engine).
 *
 * A patch of the relief grid becomes a triangle mesh whose vertices sit on the grid and whose diagonals follow Relief.groundY's rule
 * (cells with (i + j) even split along (0,0)-(1,1), odd cells along (1,0)-(0,1)), so the drawn surface IS the surface characters,
 * props and the nav grid stand on. Normals are the grid's smooth vertex normals (central differences over the whole relief, not over the
 * patch), so neighbouring chunks shade identically across their seam. Vertices are expressed relative to `originX / originZ` (the mesh
 * position), exactly like the flat quads they replace; the terrain shader reads `position.xz + origin` for its splat / tint lookups.
 */

const _n = { x: 0, y: 1, z: 0 };

/** Geometry of the `cols` x `rows` cells whose first vertex is grid vertex (i0, j0). */
export function reliefPatchGeometry(r: Relief, i0: number, j0: number, cols: number, rows: number, originX: number, originZ: number): THREE.BufferGeometry {
  const vw = cols + 1, vh = rows + 1;
  const pos = new Float32Array(vw * vh * 3), nor = new Float32Array(vw * vh * 3), uv = new Float32Array(vw * vh * 2);
  for (let b = 0; b < vh; b++)
    for (let a = 0; a < vw; a++) {
      const o = b * vw + a;
      const i = i0 + a, j = j0 + b;
      pos[o * 3] = r.ox + i * r.cell - originX;
      pos[o * 3 + 1] = r.vertex(i, j);
      pos[o * 3 + 2] = r.oz + j * r.cell - originZ;
      r.vertexNormal(i, j, _n);
      nor[o * 3] = _n.x; nor[o * 3 + 1] = _n.y; nor[o * 3 + 2] = _n.z;
      uv[o * 2] = a / cols;
      uv[o * 2 + 1] = 1 - b / rows;
    }
  const idx = vw * vh > 65535 ? new Uint32Array(cols * rows * 6) : new Uint16Array(cols * rows * 6);
  let k = 0;
  for (let b = 0; b < rows; b++)
    for (let a = 0; a < cols; a++) {
      const v00 = b * vw + a, v10 = v00 + 1, v01 = v00 + vw, v11 = v01 + 1;
      if (((i0 + a + j0 + b) & 1) === 0) {
        idx[k++] = v00; idx[k++] = v01; idx[k++] = v11;
        idx[k++] = v00; idx[k++] = v11; idx[k++] = v10;
      } else {
        idx[k++] = v00; idx[k++] = v01; idx[k++] = v10;
        idx[k++] = v10; idx[k++] = v01; idx[k++] = v11;
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Streamed chunk (cx, cz) of `size` m: positions relative to the chunk centre. */
export function reliefChunkGeometry(r: Relief, cx: number, cz: number, size: number): THREE.BufferGeometry {
  const i0 = Math.round((cx * size - r.ox) / r.cell), j0 = Math.round((cz * size - r.oz) / r.cell);
  const n = Math.round(size / r.cell);
  return reliefPatchGeometry(r, i0, j0, n, n, cx * size + size / 2, cz * size + size / 2);
}

/** Classic one-mesh terrain: the grid cells inside `half` m around (centreX, centreZ), positions relative to that centre. */
export function reliefTerrainGeometry(r: Relief, centreX: number, centreZ: number, half: number): THREE.BufferGeometry {
  const i0 = Math.max(0, Math.ceil((centreX - half - r.ox) / r.cell)), j0 = Math.max(0, Math.ceil((centreZ - half - r.oz) / r.cell));
  const i1 = Math.min(r.nx - 1, Math.floor((centreX + half - r.ox) / r.cell)), j1 = Math.min(r.nz - 1, Math.floor((centreZ + half - r.oz) / r.cell));
  return reliefPatchGeometry(r, i0, j0, i1 - i0, j1 - j0, centreX, centreZ);
}
