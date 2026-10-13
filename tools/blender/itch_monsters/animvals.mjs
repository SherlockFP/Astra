// animvals.mjs - print the first N sample values of one animation channel (read-only GLB).
// node animvals.mjs <file.glb> <animName> <nodeName> <path:rotation|translation|scale> [N=4]
import fs from 'node:fs';
const [,, file, an, nn, path, N = '4'] = process.argv;
const buf = fs.readFileSync(file);
const jl = buf.readUInt32LE(12);
const g = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
const bin = buf.subarray(20 + jl + 8);
function acc(i) {
  const a = g.accessors[i], bv = g.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const out = [];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  for (let k = 0; k < a.count; k++) { const row = []; for (let c = 0; c < comps; c++) row.push(bin.readFloatLE(off + (k * comps + c) * 4)); out.push(row); }
  return out;
}
const anim = g.animations.find((a) => a.name === an);
const ni = g.nodes.findIndex((n) => n.name === nn);
const ch = anim.channels.find((c) => c.target.node === ni && c.target.path === path);
if (!ch) { console.log('no channel'); process.exit(); }
const s = anim.samplers[ch.sampler];
const t = acc(s.input), v = acc(s.output);
for (let k = 0; k < Math.min(+N, t.length); k++) console.log(t[k][0].toFixed(4), v[k].map((x) => x.toFixed(4)).join(' '));
console.log('... keys', t.length, 'last', t[t.length - 1][0].toFixed(4), v[v.length - 1].map((x) => x.toFixed(4)).join(' '));
