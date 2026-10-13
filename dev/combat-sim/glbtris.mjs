// Minimal GLB reader for the headless sims (no textures, no WebGL): builds a THREE.Group of plain Meshes (positions, normals, uvs,
// indices, node transforms) so triangle budgets can be measured from the real model files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const GETTER = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + file);
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { json, bin };
}

function accessor(g, i) {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView ?? 0];
  const [Ctor, size] = COMP[a.componentType];
  const n = NCOMP[a.type];
  const stride = bv.byteStride ?? n * size;
  const out = new Ctor(a.count * n);
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.byteLength);
  const rel = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const get = GETTER[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get](rel + k * stride + c * size, true);
  return { array: out, itemSize: n };
}

/** Builds a THREE.Group from a GLB file. One shared MeshStandardMaterial per file (the voxel files have one palette image each). */
export function glbToGroup(THREE, file) {
  const g = readGlb(file);
  const mat = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const j = g.json;
  const scene = j.scenes?.[j.scene ?? 0];
  const visit = (ni, parent) => {
    const n = j.nodes[ni];
    const o = new THREE.Object3D();
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }
    parent.add(o);
    if (n.mesh !== undefined) {
      for (const p of j.meshes[n.mesh].primitives) {
        if ((p.mode ?? 4) !== 4) continue;
        const geo = new THREE.BufferGeometry();
        for (const [name, key] of [['position', 'POSITION'], ['normal', 'NORMAL'], ['uv', 'TEXCOORD_0']]) {
          if (p.attributes[key] === undefined) continue;
          const a = accessor(g, p.attributes[key]);
          geo.setAttribute(name, new THREE.BufferAttribute(a.array instanceof Float32Array ? a.array : Float32Array.from(a.array), a.itemSize));
        }
        if (p.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(accessor(g, p.indices).array, 1));
        const m = new THREE.Mesh(geo, mat);
        m.name = n.name ?? '';
        o.add(m);
      }
    }
    for (const c of n.children ?? []) visit(c, o);
  };
  for (const ni of scene?.nodes ?? []) visit(ni, root);
  return root;
}

export const trisOfGroup = (root) => {
  let t = 0;
  root.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return t;
};

export const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
export const fileOf = (url) => path.join(publicRoot, url);
