#!/usr/bin/env node
// verify-monsters.mjs - read-only checks of the converted monster GLBs against the build reports and the PSX conventions
// in docs/assets/itch-kits.md. No Blender, no browser, no server (parses the GLB JSON and the PNG headers only).
//
//   node tools/verify-monsters.mjs            -> prints one line per file and a PASS/FAIL summary (exit code 1 on FAIL)
//
// Checked per GLB: no glTF extensions, embedded PNG textures <= 256 px, NEAREST samplers, metallic 0 / roughness 1,
// alpha mode (MASK; BLEND only for the ooze jelly), skinned mesh present, animation count + names + durations vs the
// report (the clips start at t = 0 and are as long as the source clip), triangle count vs the report, and that every
// texture variant file exists and is <= 256 px.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const REP = path.join(ROOT, 'tools/blender/itch_monsters/_reports');
const MODELS = path.join(ROOT, 'public/assets/models/itch');
const TEX = path.join(ROOT, 'public/assets/textures/itch');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'));
  const bin = buf.subarray(20 + jl + 8);
  return { json, bin, size: buf.length };
}
function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
function accMinMax(g, i) { const a = g.accessors[i]; return { min: a.min, max: a.max, count: a.count }; }

const results = [];
function check(name, file, expect) {
  const errs = [], notes = [];
  let g, bin, size;
  try { ({ json: g, bin, size } = readGlb(file)); } catch (e) { results.push({ name, ok: false, errs: ['cannot read: ' + e.message], notes }); return; }
  if (g.extensionsUsed?.length || g.extensionsRequired?.length) errs.push('extensions: ' + JSON.stringify(g.extensionsUsed));
  // textures
  const texPx = [];
  for (const im of g.images || []) {
    if (im.bufferView === undefined) { errs.push('image not embedded'); continue; }
    const bv = g.bufferViews[im.bufferView];
    const wh = pngSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
    if (!wh) { errs.push('image not PNG'); continue; }
    texPx.push(wh.join('x'));
    if (wh[0] > 256 || wh[1] > 256) errs.push(`texture ${wh.join('x')} > 256`);
  }
  for (const t of g.textures || []) {
    const s = g.samplers?.[t.sampler];
    if (!s || s.magFilter !== 9728 || ![9728, 9984].includes(s.minFilter)) errs.push('sampler not NEAREST');
  }
  // materials
  const alpha = [];
  for (const m of g.materials || []) {
    const p = m.pbrMetallicRoughness || {};
    if (p.metallicFactor !== 0) errs.push(`${m.name}: metallic ${p.metallicFactor}`);
    if (p.roughnessFactor !== undefined && p.roughnessFactor !== 1) errs.push(`${m.name}: roughness ${p.roughnessFactor}`);
    if (m.normalTexture || m.emissiveTexture || p.metallicRoughnessTexture) errs.push(`${m.name}: extra PBR textures`);
    const am = m.alphaMode || 'OPAQUE';
    if (am !== 'OPAQUE') alpha.push(`${m.name}=${am}`);
    if (am === 'BLEND' && m.name !== 'ooze_body') errs.push(`${m.name}: BLEND (only ooze_body may blend)`);
    if (m.name === 'wasp_wing' && am !== 'MASK') errs.push('wasp_wing must be MASK');
  }
  // skin + tris
  if (!g.skins?.length) errs.push('no skin');
  let tris = 0;
  for (const m of g.meshes || []) for (const p of m.primitives) {
    if (p.attributes.JOINTS_0 === undefined || p.attributes.WEIGHTS_0 === undefined) errs.push(`${m.name}: not skinned`);
    tris += (p.indices !== undefined ? g.accessors[p.indices].count : g.accessors[p.attributes.POSITION].count) / 3;
  }
  if (expect.tris !== undefined && Math.round(tris) !== expect.tris) errs.push(`tris ${tris} != report ${expect.tris}`);
  // animations
  const anims = g.animations || [];
  if (anims.length !== expect.clips.length) errs.push(`animations ${anims.length} != expected ${expect.clips.length}`);
  const want = new Map(expect.clips.map((c) => [c.name, c.seconds]));
  const got = new Set();
  for (const a of anims) {
    got.add(a.name);
    let t0 = 1e9, t1 = -1e9;
    for (const s of a.samplers) { const mm = accMinMax(g, s.input); t0 = Math.min(t0, mm.min[0]); t1 = Math.max(t1, mm.max[0]); }
    if (!a.channels.length) errs.push(`${a.name}: no channels`);
    if (Math.abs(t0) > 1e-4) errs.push(`${a.name}: starts at ${t0.toFixed(4)}`);
    const w = want.get(a.name);
    if (w === undefined) errs.push(`${a.name}: unexpected clip`);
    else if (Math.abs(t1 - w) > 0.5 / 30 + 1e-3) errs.push(`${a.name}: ${t1.toFixed(3)} s != ${w} s`);
  }
  for (const n of want.keys()) if (!got.has(n)) errs.push(`missing clip ${n}`);
  // texture variants on disk
  for (const v of expect.variantFiles || []) {
    if (!fs.existsSync(v)) { errs.push('missing variant ' + path.relative(ROOT, v)); continue; }
    const wh = pngSize(fs.readFileSync(v));
    if (!wh || wh[0] > 256 || wh[1] > 256) errs.push('variant too large ' + path.basename(v));
  }
  notes.push(`${(size / 1024).toFixed(0)} KB`, `${Math.round(tris)} tris`, `${anims.length} anims`, `tex ${texPx.join(',') || 'none'}`, alpha.join(' ') || 'opaque');
  results.push({ name, ok: errs.length === 0, errs, notes });
}

// UAL
const ual = readJson(path.join(REP, 'ual.json'));
check('ual/UAL_clips.glb', path.join(MODELS, 'ual/UAL_clips.glb'), { tris: ual.tris, clips: ual.clips.map((c) => ({ name: c.name, seconds: c.seconds })) });
// Bestiary
const bes = readJson(path.join(REP, 'bestiary.json'));
for (const m of bes.monsters) {
  check(`bestiary/${m.id}.glb`, path.join(MODELS, `bestiary/${m.id}.glb`), {
    tris: m.tris, clips: m.clips.map((c) => ({ name: c.name, seconds: c.seconds })),
    variantFiles: m.variants.map((v) => path.join(TEX, 'bestiary', v + '.png')),
  });
}
// Creatures
const cre = readJson(path.join(REP, 'creatures.json'));
for (const c of cre) {
  check(`creatures/${c.id}.glb`, path.join(MODELS, `creatures/${c.id}.glb`), {
    tris: c.tris, clips: c.clips.map((x) => ({ name: x.name, seconds: x.seconds })),
    variantFiles: c.variants.map((v) => path.join(TEX, 'creatures', v + '.png')),
  });
}

let bad = 0;
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(28)} ${r.notes.join(' | ')}`);
  for (const e of r.errs) { console.log('        - ' + e); }
  if (!r.ok) bad++;
}
console.log(`\n${results.length - bad}/${results.length} files pass`);
process.exit(bad ? 1 : 0);
