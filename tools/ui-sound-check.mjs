#!/usr/bin/env node
/**
 * UI sound check (headless, no audio is decoded or played). Reads the sfx manifest, the mix tables (src/audio/mix.ts) and the
 * default settings, then asserts:
 *   1. duration: every UI click-class sound is at most 150 ms audible (file length, capped by UI_MAX_SEC),
 *   2. peak cap: at default settings (uiVolume 0.35, master 0.8) the loudest pool entry stays below -20 dBFS, assuming the
 *      decoded file peaks at 0 dBFS (OGG is not decoded here, so this is the worst case; WAV files are read for their real peak),
 *   3. one trigger per click: a second UI click sound inside UI_BURST_SEC is dropped, a click after it is allowed, hover never
 *      blocks a click, and the hover blip is off by default,
 *   4. the interface bus is scaled (UI_BUS_SCALE) and low-passed (UI_TONE_HZ) as Audio.ts applies it.
 *
 *   node tools/ui-sound-check.mjs
 *
 * Exit code 1 on any failure. Needs Node >= 22.18 (native TypeScript type stripping), like tools/controls-check.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./manifest_feel") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){let last=e;for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(err){last=err}}throw last}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AUDIO_DIR = path.join(ROOT, 'public', 'assets', 'audio');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { SFX_MANIFEST } = await imp('src/audio/manifest.ts');
const MIX = await imp('src/audio/mix.ts');
const { DEFAULT_SETTINGS } = await imp('src/core/Settings.ts');

const MAX_DURATION_S = 0.15;
const PEAK_CAP_DB = -20;
const DEFAULT_MASTER = 0.8;

let checks = 0;
const failures = [];
function check(ok, msg) {
  checks++;
  if (!ok) failures.push(msg);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`);
}

/** Duration in seconds from an OGG (last page granule over the id header rate) or a WAV (RIFF data size); null if unknown. */
function fileSeconds(rel) {
  const abs = path.join(AUDIO_DIR, rel);
  if (!fs.existsSync(abs)) return null;
  const buf = fs.readFileSync(abs);
  if (rel.endsWith('.wav')) {
    let rate = 0, channels = 0, bits = 0, dataSize = 0;
    let p = 12;
    while (p + 8 <= buf.length) {
      const id = buf.toString('ascii', p, p + 4);
      const size = buf.readUInt32LE(p + 4);
      if (id === 'fmt ') { channels = buf.readUInt16LE(p + 10); rate = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22); }
      if (id === 'data') dataSize = size;
      p += 8 + size + (size & 1);
    }
    return rate && channels && bits ? dataSize / (rate * channels * (bits / 8)) : null;
  }
  if (rel.endsWith('.ogg')) {
    const vi = buf.indexOf('\x01vorbis', 0, 'latin1');
    if (vi < 0) return null;
    const rate = buf.readUInt32LE(vi + 12);
    const last = buf.lastIndexOf('OggS', buf.length - 1, 'latin1');
    if (!rate || last < 0 || last + 14 > buf.length) return null;
    const lo = buf.readUInt32LE(last + 6);
    const hi = buf.readUInt32LE(last + 10);
    return (hi * 4294967296 + lo) / rate;
  }
  return null;
}

/** Peak in dBFS of a WAV file (8/16/24/32-bit PCM or float); null for OGG, which this check does not decode. */
function wavPeakDb(rel) {
  if (!rel.endsWith('.wav')) return null;
  const buf = fs.readFileSync(path.join(AUDIO_DIR, rel));
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(p + 8), bits: buf.readUInt16LE(p + 22) };
    if (id === 'data') data = { off: p + 8, size: Math.min(size, buf.length - p - 8) };
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data) return null;
  const bps = fmt.bits / 8;
  let peak = 0;
  for (let o = data.off; o + bps <= data.off + data.size; o += bps) {
    let v;
    if (fmt.format === 3) v = buf.readFloatLE(o);
    else if (fmt.bits === 8) v = (buf[o] - 128) / 128;
    else if (fmt.bits === 16) v = buf.readInt16LE(o) / 32768;
    else if (fmt.bits === 24) v = buf.readIntLE(o, 3) / 8388608;
    else if (fmt.bits === 32) v = buf.readInt32LE(o) / 2147483648;
    else return null;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -120;
}

/* ------------------------------------------------------------------ 1 + 2: every click-class UI sound */

const uiIds = Object.keys(SFX_MANIFEST).filter((id) => MIX.isUiClickSound(id));
check(uiIds.length >= 10, `found ${uiIds.length} UI click-class sound ids in the manifest`);

for (const id of uiIds) {
  const def = SFX_MANIFEST[id];
  const cap = MIX.MAX_SEC[id] ?? (MIX.isUiClickSound(id) ? MIX.UI_MAX_SEC : 0);
  let worstSec = 0;
  let worstPeak = -Infinity;
  let missing = 0;
  def.f.forEach((rel, i) => {
    const sec = fileSeconds(rel);
    if (sec == null) { missing++; return; }
    const audible = cap > 0 ? Math.min(sec, cap) : sec;
    if (audible > worstSec) worstSec = audible;
    // worst-case output peak at default settings: file peak (0 dBFS if not measurable here) x per-id gain chain
    const fileDb = wavPeakDb(rel) ?? 0;
    const trim = MIX.mixTrim(id);
    const gain = (def.v) * trim * (def.fg?.[i] ?? 1) * (DEFAULT_SETTINGS.uiVolume) * MIX.UI_BUS_SCALE * DEFAULT_MASTER * 1.05;
    const outDb = fileDb + 20 * Math.log10(gain || 1e-9);
    if (outDb > worstPeak) worstPeak = outDb;
  });
  check(missing === 0, `${id}: all ${def.f.length} files exist`);
  check(worstSec <= MAX_DURATION_S + 1e-9, `${id}: audible length ${Math.round(worstSec * 1000)} ms <= 150 ms`);
  check(worstPeak <= PEAK_CAP_DB, `${id}: worst output peak ${worstPeak.toFixed(1)} dBFS <= ${PEAK_CAP_DB} dBFS at default settings`);
}

/* ------------------------------------------------------------------ 3: one trigger per click */

check(MIX.uiBurstAllowed(-9, 1.0), 'first UI click in silence plays');
check(!MIX.uiBurstAllowed(1.0, 1.0), 'second UI click at the same instant (button + handler) is dropped');
check(!MIX.uiBurstAllowed(1.0, 1.0 + MIX.UI_BURST_SEC / 2), 'second UI click inside the burst window is dropped');
check(MIX.uiBurstAllowed(1.0, 1.0 + MIX.UI_BURST_SEC + 0.001), 'a click after the burst window plays');
check(MIX.isUiClickSound('ui_click') && MIX.isUiClickSound('ui_tab'), 'ui_click and ui_tab are click-class (one per click)');
check(!MIX.isUiClickSound('ui_hover'), 'hover is not click-class, so it can never block the click after it');
check(MIX.UI_CLICK_GAP >= 0.05 && MIX.UI_HOVER_GAP >= 0.1, 'per-id gaps: click >= 50 ms, hover >= 100 ms (rapid-fire spam)');
check(DEFAULT_SETTINGS.uiHoverSfx === false, 'hover blip is off by default (uiHoverSfx)');

/* ------------------------------------------------------------------ 4: bus shaping */

check(MIX.UI_BUS_SCALE > 0 && MIX.UI_BUS_SCALE < 1, `interface bus scale ${MIX.UI_BUS_SCALE} lowers the UI bus below the slider`);
check(MIX.UI_TONE_HZ >= 3000 && MIX.UI_TONE_HZ <= 6000, `interface low-pass ${MIX.UI_TONE_HZ} Hz (3-6 kHz range)`);

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
