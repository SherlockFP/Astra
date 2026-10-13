#!/usr/bin/env node
// Inspect .glb / .gltf files: nodes, meshes, skins, animations (with durations),
// materials, textures and a world-space AABB of the default scene.
// Usage: node tools/glb-inspect.mjs <file-or-dir> [--json] [--short]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const short = args.includes('--short');
const targets = args.filter((a) => !a.startsWith('--'));

function readGltf(file) {
  const buf = fs.readFileSync(file);
  if (file.toLowerCase().endsWith('.glb')) {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
    const jsonLen = buf.readUInt32LE(12);
    return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  }
  return JSON.parse(buf.toString('utf8'));
}

const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function xform(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

function inspect(file) {
  const g = readGltf(file);
  const out = { file: file.replace(/\\/g, '/'), meshes: [], skins: [], animations: [], materials: [], images: [], nodes: (g.nodes || []).length };
  out.meshes = (g.meshes || []).map((m) => m.name);
  out.skins = (g.skins || []).map((s) => ({ name: s.name, joints: s.joints.length }));
  out.materials = (g.materials || []).map((m) => m.name);
  out.images = (g.images || []).map((im) => im.uri || im.name || `bufferView:${im.bufferView}`);
  out.animations = (g.animations || []).map((a) => {
    let dur = 0;
    for (const s of a.samplers) {
      const acc = g.accessors[s.input];
      if (acc && acc.max) dur = Math.max(dur, acc.max[0]);
    }
    return { name: a.name, duration: +dur.toFixed(3) };
  });
  // world AABB from POSITION accessor bounds of every mesh node in the default scene
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const scene = (g.scenes || [])[g.scene || 0];
  const boneNames = new Set();
  for (const s of g.skins || []) for (const j of s.joints) boneNames.add(g.nodes[j].name);
  out.bones = short ? undefined : [...boneNames];
  const visit = (idx, parent) => {
    const n = g.nodes[idx];
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      for (const prim of g.meshes[n.mesh].primitives) {
        const acc = g.accessors[prim.attributes.POSITION];
        if (!acc || !acc.min) continue;
        const skinned = n.skin !== undefined;
        for (let i = 0; i < 8; i++) {
          const p = [i & 1 ? acc.max[0] : acc.min[0], i & 2 ? acc.max[1] : acc.min[1], i & 4 ? acc.max[2] : acc.min[2]];
          const w = skinned ? p : xform(m, p);
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
        }
      }
    }
    for (const c of n.children || []) visit(c, m);
  };
  if (scene) for (const r of scene.nodes) visit(r, I());
  if (min[0] !== Infinity) {
    out.aabb = { min: min.map((v) => +v.toFixed(3)), max: max.map((v) => +v.toFixed(3)), size: max.map((v, k) => +(v - min[k]).toFixed(3)) };
  }
  // attachment-friendly node names (non-bone named nodes, e.g. hand slots)
  out.namedNodes = short ? undefined : (g.nodes || []).filter((n) => n.name && !boneNames.has(n.name)).map((n) => n.name);
  return out;
}

function walk(p, acc) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f), acc);
  else if (/\.(glb|gltf)$/i.test(p)) acc.push(p);
  return acc;
}

const files = targets.flatMap((t) => walk(t, []));
const results = [];
for (const f of files) {
  try { results.push(inspect(f)); } catch (e) { results.push({ file: f, error: String(e.message || e) }); }
}
if (asJson) console.log(JSON.stringify(results, null, 1));
else for (const r of results) {
  if (r.error) { console.log(`${r.file}: ERROR ${r.error}`); continue; }
  console.log(`\n== ${r.file}`);
  if (r.aabb) console.log(`  size ${r.aabb.size.join(' x ')}  min ${r.aabb.min.join(',')}  max ${r.aabb.max.join(',')}`);
  console.log(`  meshes(${r.meshes.length}): ${r.meshes.slice(0, 12).join(', ')}${r.meshes.length > 12 ? ' ...' : ''}`);
  if (r.skins.length) console.log(`  skins: ${r.skins.map((s) => `${s.name}(${s.joints})`).join(', ')}`);
  if (r.animations.length) console.log(`  animations(${r.animations.length}): ${r.animations.map((a) => `${a.name}[${a.duration}s]`).join(', ')}`);
  if (!short && r.namedNodes?.length) console.log(`  nodes: ${r.namedNodes.slice(0, 40).join(', ')}`);
  console.log(`  materials: ${r.materials.join(', ')}  images: ${r.images.join(', ')}`);
}
