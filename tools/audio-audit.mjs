#!/usr/bin/env node
/**
 * Audio audit (in-process only). Lists every sfx id from the manifest with its files, duration, peak / RMS level and an
 * estimated trigger rate, so the mix can be judged without listening.
 *
 *   node tools/audio-audit.mjs            table on stdout
 *   node tools/audio-audit.mjs --json     the same rows as JSON
 *
 * Rules: this script never opens, starts or shell-executes media files and spawns no external process. It only reads the bytes
 * of WAV files (peak / RMS / duration from the RIFF header) and the header or last page of OGG files (duration). MP3 and loudness
 * of OGG are not measured ("n/a"). Trigger rates are estimates: the number of source references to an id under src/ times a
 * per-category rate. They say which ids are likely to fire often, not how often they fire.
 */
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./manifest_feel") to .ts files, as the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO_DIR = path.join(ROOT, 'public', 'assets', 'audio');
const SRC_DIR = path.join(ROOT, 'src');
const asJson = process.argv.includes('--json');

const { SFX_MANIFEST, MUSIC_MANIFEST, AMBIENCE_MANIFEST } = await import(pathToFileURL(path.join(SRC_DIR, 'audio', 'manifest.ts')).href);
// the calmer mix (src/audio/mix.ts): trim per id and the cut length, so the table shows the levels the game actually plays at
const { mixTrim, MAX_SEC } = await import(pathToFileURL(path.join(SRC_DIR, 'audio', 'mix.ts')).href);

/* ------------------------------------------------------------------ file analysis */

function readWav(buf) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmt = null;
  let data = null;
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = { off: body, size: Math.min(size, buf.length - body) };
    }
    p = body + size + (size & 1);
  }
  if (!fmt || !data || !fmt.channels || !fmt.rate) return null;
  const bps = fmt.bits / 8;
  const frameBytes = bps * fmt.channels;
  const frames = Math.floor(data.size / frameBytes);
  let peak = 0;
  let sumSq = 0;
  let n = 0;
  const isFloat = fmt.format === 3 || (fmt.format === 0xfffe && fmt.bits === 32);
  for (let i = 0; i < frames * fmt.channels; i++) {
    const o = data.off + i * bps;
    let v;
    if (isFloat && fmt.bits === 32) v = buf.readFloatLE(o);
    else if (fmt.bits === 8) v = (buf[o] - 128) / 128;
    else if (fmt.bits === 16) v = buf.readInt16LE(o) / 32768;
    else if (fmt.bits === 24) v = buf.readIntLE(o, 3) / 8388608;
    else if (fmt.bits === 32) v = buf.readInt32LE(o) / 2147483648;
    else return null;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSq += v * v;
    n++;
  }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);
  return {
    seconds: frames / fmt.rate,
    peakDb: db(peak),
    rmsDb: db(n ? Math.sqrt(sumSq / n) : 0),
  };
}

/** OGG: duration from the id header (rate) and the last page's granule position. Loudness is not measured. */
function oggSeconds(buf) {
  let rate = 0;
  const vi = buf.indexOf('\x01vorbis', 0, 'latin1');
  if (vi >= 0) rate = buf.readUInt32LE(vi + 12);
  else if (buf.indexOf('OpusHead', 0, 'latin1') >= 0) rate = 48000;
  if (!rate) return null;
  const last = buf.lastIndexOf('OggS', buf.length - 1, 'latin1');
  if (last < 0 || last + 14 > buf.length) return null;
  const lo = buf.readUInt32LE(last + 6);
  const hi = buf.readUInt32LE(last + 10);
  if (lo === 0xffffffff && hi === 0xffffffff) return null;
  return (hi * 4294967296 + lo) / rate;
}

const cache = new Map();
function analyseFile(rel) {
  if (cache.has(rel)) return cache.get(rel);
  let out = { file: rel, seconds: null, peakDb: null, rmsDb: null, exists: false };
  const abs = path.join(AUDIO_DIR, rel);
  try {
    if (fs.existsSync(abs)) {
      out.exists = true;
      const buf = fs.readFileSync(abs);
      if (rel.toLowerCase().endsWith('.wav')) {
        const w = readWav(buf);
        if (w) out = { ...out, ...w };
      } else if (rel.toLowerCase().endsWith('.ogg')) {
        out.seconds = oggSeconds(buf);
      }
    }
  } catch {
    /* unreadable: reported as missing duration */
  }
  cache.set(rel, out);
  return out;
}

/* ------------------------------------------------------------------ trigger estimate */

/** Source references per id (quoted id under src/, excluding the manifests, the type list and the alias table). */
function countSiteRefs() {
  const ids = Object.keys(SFX_MANIFEST);
  const counts = new Map(ids.map((id) => [id, 0]));
  const skip = new Set(['manifest.ts', 'manifest_feel.ts', 'aliases.ts', 'audio.ts']);
  const text = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(ent.name) && !(p.includes(path.join('src', 'audio')) && skip.has(ent.name)) && ent.name !== 'audio.ts') {
        text.push(fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(SRC_DIR);
  const all = text.join('\n');
  for (const id of ids) {
    const re = new RegExp(`['"\`]${id}['"\`]`, 'g');
    counts.set(id, (all.match(re) || []).length);
  }
  // voices are built as voice_<pack>_<kind>: count the kind inside voice('<kind>' calls
  const voiceKinds = new Map();
  for (const m of all.matchAll(/\.voice\(\s*['"`](\w+)['"`]/g)) voiceKinds.set(m[1], (voiceKinds.get(m[1]) ?? 0) + 1);
  for (const id of ids) {
    const m = /^voice_(warrior|mage|orc)_(\w+)$/.exec(id);
    if (m) counts.set(id, voiceKinds.get(m[2]) ?? 0);
  }
  return counts;
}

const LOOPS = /(_loop|^charge_loop|^heartbeat_loop|^bubble_loop|^drain_loop|^eye_beam_loop|^waltz_loop|^flies_loop|^lift_hum|^camp_crackle|^chandelier|^crowd_murmur)/;
/** Per-site rate (triggers per minute) by category. A rough guess; the audit reports it as an estimate. */
function rateFor(id) {
  if (LOOPS.test(id)) return 0;
  if (/^footstep/.test(id)) return 110;
  if (/^(hit_|swing_|block$|dodge$|whoosh$|shield_bash$|parry$|guard_hit$|weak_hit$|resist_hit$|heavy_hit$|weapon_art$|interrupt$|backstab$|riposte$|cast_pushback$)/.test(id) || /_impact$/.test(id)) return 45;
  if (/^voice_/.test(id)) return 8;
  if (/^ui_hover$/.test(id)) return 30;
  if (/^ui_|^quest_|^achievement|^chat$|^countdown/.test(id)) return 6;
  if (/^(gold_pickup|item_pickup|loot_drop)/.test(id) || /^enemy_(death|aggro|idle|hurt)/.test(id)) return 6;
  return 2;
}

/* ------------------------------------------------------------------ rows */

const sites = countSiteRefs();
const rows = Object.keys(SFX_MANIFEST).sort().map((id) => {
  const e = SFX_MANIFEST[id];
  const files = [...e.f, ...(e.ly ?? [])];
  const an = e.f.map(analyseFile);
  const secs = an.map((a) => a.seconds).filter((x) => x != null);
  const wav = an.filter((a) => a.peakDb != null);
  const peak = wav.length ? Math.max(...wav.map((a) => a.peakDb)) : null;
  const rms = wav.length ? wav.reduce((s, a) => s + a.rmsDb, 0) / wav.length : null;
  const missing = files.filter((f) => !analyseFile(f).exists).length;
  const refs = sites.get(id) ?? 0;
  const rate = rateFor(id);
  return {
    id,
    variants: e.f.length,
    file: e.f[0],
    missing,
    seconds: secs.length ? Math.max(...secs) : null,
    peakDb: peak,
    rmsDb: rms,
    v: e.v,
    trim: mixTrim(id),
    effV: +(e.v * mixTrim(id)).toFixed(3),
    maxSec: MAX_SEC[id] ?? null,
    pv: e.pv,
    mv: e.mv,
    refs,
    estPerMin: refs * rate,
  };
});

const f1 = (x) => (x == null ? 'n/a' : x.toFixed(1));
const f2 = (x) => (x == null ? 'n/a' : x.toFixed(2));

if (asJson) {
  process.stdout.write(JSON.stringify({ sfx: rows, music: Object.keys(MUSIC_MANIFEST).length, ambience: Object.keys(AMBIENCE_MANIFEST).length }, null, 2) + '\n');
} else {
  const head = ['id', 'var', 'file (first)', 'miss', 'sec', 'peak dBFS', 'rms dBFS', 'v', 'trim', 'eff v', 'cut s', 'pv', 'mv', 'refs', 'est/min'];
  const lines = rows.map((r) => [r.id, r.variants, r.file, r.missing, f2(r.seconds), f1(r.peakDb), f1(r.rmsDb), r.v, r.trim, r.effV, r.maxSec ?? '-', r.pv, r.mv, r.refs, r.estPerMin]);
  const w = head.map((h, i) => Math.max(h.length, ...lines.map((l) => String(l[i]).length)));
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  process.stdout.write(fmt(head) + '\n');
  for (const l of lines) process.stdout.write(fmt(l) + '\n');
  process.stdout.write(
    `\n${rows.length} sfx ids, ${Object.keys(MUSIC_MANIFEST).length} music, ${Object.keys(AMBIENCE_MANIFEST).length} ambience. ` +
      'sec = longest variant (WAV, OGG header); peak / rms from WAV only; est/min = refs x category rate (estimate).\n',
  );
}
