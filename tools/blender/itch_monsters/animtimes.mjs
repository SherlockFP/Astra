// animtimes.mjs - per animation: sampler input (time) min / max / key count of the longest channel (read-only GLB JSON).
// node tools/blender/itch_monsters/animtimes.mjs <file.glb> [nameFilter]
import fs from 'node:fs';
const buf = fs.readFileSync(process.argv[2]);
const g = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const filt = process.argv[3];
for (const a of g.animations || []) {
  if (filt && !a.name.includes(filt)) continue;
  let mn = 1e9, mx = -1e9, n = 0;
  for (const s of a.samplers) { const acc = g.accessors[s.input]; mn = Math.min(mn, acc.min[0]); mx = Math.max(mx, acc.max[0]); n = Math.max(n, acc.count); }
  console.log(a.name.padEnd(28), 'tmin', mn.toFixed(4), 'tmax', mx.toFixed(4), 'maxkeys', n, 'channels', a.channels.length);
}
