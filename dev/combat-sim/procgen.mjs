// PROCGEN (Kadim Yarıklar) checks: docs/GDD_PROCGEN.md, status: docs/kits/procgen_status.md. No browser, no server.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/procgen.mjs [seeds=50] [--v]
// Stages: id.* (codec, version), det.* (same id -> byte-identical def, other seed -> other def), gen.* (50 seeds x 4 themes x 3 tiers:
//         room count, 3 bosses, final last, connectivity, heights, enemy ids, models on disk, speed), content.* (the shared content
//         validator contentCheck.checkDungeon + checkVerticalDungeon on a sample), net.* (getFissureDef cache / fail closed), rules.*
//         (scaling, unlock, mods). PASS/FAIL per check, exit code 1 on any failure.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../../src/', import.meta.url).href;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const imp = (p) => import(root + p);
const args = process.argv.slice(2);
const SEEDS = parseInt(args.find((a) => /^\d+$/.test(a)) ?? '50', 10);
const verbose = args.includes('--v') || !!process.env.V;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const warns = [];
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

const P = await imp('world/procgen/index.ts');
const { THEMES } = await imp('world/procgen/themes.ts');
const { ARENAS } = await imp('world/procgen/arenas.ts');
const { ENEMIES, BOSSES, getEnemyDef } = await imp('data/enemies.ts');
const { BOSS_SCRIPTS } = await imp('ai/bosses/index.ts');
const { buildHeightfield, F } = await imp('world/Heightfield.ts');
const cc = await imp('dev/contentCheck.ts');
const { getDungeon, DUNGEONS } = await imp('data/dungeons/index.ts');
const { MUSIC_IDS } = await imp('types/audio.ts');

const THEMES_ALL = P.FISSURE_THEMES;
const TIERS = P.FISSURE_TIER_IDS;
const V = P.FISSURE_VERSION;
const T = 4;

// ================================================================================================ id codec
{
  const spec = { theme: 'crypt', tier: 'h', level: 35, seed: 0x1a2b3c4d, v: V };
  const id = P.fissureId(spec);
  ok('id.format', id === `fis.crypt.h.35.1a2b3c4d.${V}`, id);
  const back = P.parseFissureId(id);
  ok('id.roundtrip', !!back && back.theme === 'crypt' && back.tier === 'h' && back.level === 35 && back.seed === 0x1a2b3c4d && back.v === V);
  let bad = 0;
  for (const s of ['', 'fis.', 'fis.crypt.x.35.1a2b3c4d.1', 'fis.nope.n.35.1a2b3c4d.1', 'fis.crypt.n.0.1a2b3c4d.1', 'fis.crypt.n.61.1a2b3c4d.1', 'fis.crypt.n.35.1a2b3c4.1', 'kemik_mahzeni', 'fis.crypt.n.35.1a2b3c4d.1x']) if (P.parseFissureId(s)) bad++;
  ok('id.rejects garbage', bad === 0, `${bad} accepted`);
  ok('id.isFissureId', P.isFissureId(id) && !P.isFissureId('kemik_mahzeni') && !P.isFissureId(undefined));
  ok('id.length fits net ident(48)', id.length <= 32 && /^[A-Za-z0-9_.:-]+$/.test(id), String(id.length));
  let rt = 0;
  for (let i = 0; i < 1000; i++) {
    const s = { theme: THEMES_ALL[i % 4], tier: TIERS[i % 3], level: 1 + (i % 60), seed: (i * 2654435761) >>> 0, v: V };
    const p = P.parseFissureId(P.fissureId(s));
    if (!p || p.theme !== s.theme || p.tier !== s.tier || p.level !== s.level || p.seed !== s.seed) rt++;
  }
  ok('id.roundtrip x1000', rt === 0, `${rt} mismatches`);
  ok('id.difficulty map', P.difficultyOfTier('n') === 'normal' && P.difficultyOfTier('h') === 'heroic' && P.difficultyOfTier('m') === 'mythic' && P.tierOfDifficulty('mythic') === 'm');
  ok('id.getDungeon hook', getDungeon(id)?.id === id && getDungeon(id)?.fissure?.theme === 'crypt');
  ok('id.getDungeon old version fails closed', getDungeon(`fis.crypt.h.35.1a2b3c4d.${V + 1}`) === undefined);
  ok('id.getDungeon garbage fails closed', getDungeon('fis.zzz') === undefined);
}

// ================================================================================================ determinism
{
  let same = 0, differ = 0, n = 0;
  for (const theme of THEMES_ALL) for (const tier of TIERS) {
    for (let s = 1; s <= 5; s++) {
      const spec = { theme, tier, level: 10 + s * 7, seed: s * 40503, v: V };
      const a = JSON.stringify(P.generateFissure(spec));
      const b = JSON.stringify(P.generateFissure(spec));
      const c = JSON.stringify(P.generateFissure({ ...spec, seed: spec.seed + 1 }));
      n++;
      if (a === b) same++;
      if (a !== c) differ++;
    }
  }
  ok('det.same spec -> byte-identical JSON', same === n, `${same}/${n}`);
  ok('det.other seed -> other def', differ === n, `${differ}/${n}`);
  // level and tier change the def too (population scales with them)
  const base = { theme: 'forge', tier: 'n', level: 20, seed: 777, v: V };
  ok('det.other tier -> other def', JSON.stringify(P.generateFissure(base)) !== JSON.stringify(P.generateFissure({ ...base, tier: 'h' })));
  ok('det.other level -> other def id', P.generateFissure(base).id !== P.generateFissure({ ...base, level: 21 }).id);
  // no wall-clock / Math.random dependence: generate under a hostile Math.random and Date.now
  const keep = { r: Math.random, d: Date.now };
  const a = JSON.stringify(P.generateFissure(base));
  Math.random = () => 0.123456; Date.now = () => 42;
  const b = JSON.stringify(P.generateFissure(base));
  Math.random = keep.r; Date.now = keep.d;
  ok('det.independent of Math.random / Date.now', a === b);
  // source tokens: no transcendental math, no random in the generator files
  const dir = ROOT + 'src/world/procgen/';
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(dir + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/Math\.(sin|cos|tan|atan2?|pow|sqrt|exp|log|random)\b|Date\.now|performance\.now/.test(src)) bad.push(f);
  }
  ok('det.no trig / random / clock tokens in world/procgen', bad.length === 0, bad.join(','));
}

// ================================================================================================ generated maps
const sample = []; // defs for the content validator
const stats = { gen: 0, ms: [], rooms: {}, enemies: { n: [], h: [], m: [] }, tiersUsed: { n: new Set(), h: new Set(), m: new Set() }, total: [], spans: [], fallback: 0 };
const problems = new Map();
const bad = (name, info) => { if (!problems.has(name)) problems.set(name, []); const a = problems.get(name); if (a.length < 4) a.push(info); problems.set(name, a); problems.set(name + '#', (problems.get(name + '#') ?? 0) + 1); };
const check = (name, cond, info) => { if (!cond) bad(name, info); };

const propUrls = new Set();
const TIER_RULE = P.FISSURE_TIERS;
const roomAt = (def, tx, tz) => def.rooms.findIndex((r) => tx >= r.rect.x && tx < r.rect.x + r.rect.w && tz >= r.rect.z && tz < r.rect.z + r.rect.h);

for (const theme of THEMES_ALL) {
  for (const tier of TIERS) {
    for (let s = 0; s < SEEDS; s++) {
      const level = tier === 'm' ? 60 : tier === 'h' ? 30 + (s % 31) : 1 + ((s * 7) % 60);
      const spec = { theme, tier, level, seed: ((s + 1) * 2654435761 + theme.length * 97) >>> 0, v: V };
      const warnBefore = warns.length;
      const t0 = performance.now();
      let def;
      try { def = P.generateFissure(spec); } catch (e) { bad('gen.throws', `${theme}/${tier}/${s}: ${e.message}`); continue; }
      stats.ms.push(performance.now() - t0);
      stats.gen++;
      if (warns.length > warnBefore && warns.slice(warnBefore).some((w) => w.includes('reduced layout'))) stats.fallback++;
      const tag = `${theme}/${tier}/${s}`;
      const info = def.fissure;
      const rule = TIER_RULE[tier];
      check('gen.info present', !!info && info.v === V && info.theme === theme && info.tier === tier && info.level === level, tag);
      // ---- rooms
      const generic = info.kinds.filter((k) => k !== 'corridor' && k !== 'ramp').length;
      stats.rooms[generic] = (stats.rooms[generic] ?? 0) + 1;
      stats.total.push(def.rooms.length);
      check('gen.room count 8-14', generic >= 8 && generic <= 14, `${tag}: ${generic}`);
      check('gen.room count within the tier range', generic >= rule.rooms[0] && generic <= rule.rooms[1], `${tag}: ${generic} vs ${rule.rooms}`);
      check('gen.info.rooms matches', info.rooms === generic, tag);
      check('gen.kinds/tiers arrays align with rooms', info.kinds.length === def.rooms.length && info.tiers.length === def.rooms.length, tag);
      check('gen.unique room ids', new Set(def.rooms.map((r) => r.id)).size === def.rooms.length, tag);
      check('gen.vertical + grid', def.vertical === true && def.grid.w >= 20 && def.grid.w <= 110 && def.grid.h >= 20 && def.grid.h <= 110, `${tag}: ${def.grid.w}x${def.grid.h}`);
      stats.spans.push(Math.max(def.grid.w, def.grid.h));
      check('gen.music valid', MUSIC_IDS.includes(def.theme.music), def.theme.music);
      // ---- bosses
      const bs = def.bosses;
      check('gen.exactly 3 bosses', bs.length === 3, `${tag}: ${bs.length}`);
      check('gen.boss orders 1,2,3', bs.map((b) => b.order).join() === '1,2,3', `${tag}: ${bs.map((b) => b.order)}`);
      check('gen.boss ids distinct', new Set(bs.map((b) => b.bossId)).size === 3, tag);
      check('gen.boss defs exist (BossDef with script)', bs.every((b) => BOSSES[b.bossId] && BOSS_SCRIPTS[b.bossId]), `${tag}: ${bs.map((b) => b.bossId)}`);
      check('gen.final is the theme final', bs[2]?.bossId === P.BOSS_POOLS[theme].final && info.finalBossId === bs[2]?.bossId, tag);
      check('gen.guardians from the theme pool', bs.slice(0, 2).every((b) => P.BOSS_POOLS[theme].guardians.includes(b.bossId)) && info.guardians[0] === bs[0].bossId && info.guardians[1] === bs[1].bossId, tag);
      // BossController shifts the baked arena by (spawn - home) and ignores shifts >= 400 m on an axis ("sane" check): keep every boss inside it
      check('gen.boss arena shift < 400 m (BossController sane check)', bs.every((b) => { const a = BOSSES[b.bossId].arena; return Math.abs((b.pos[0] + 0.5) * T - a.homeX) < 390 && Math.abs((b.pos[1] + 0.5) * T - a.homeZ) < 390; }), tag);
      check('gen.boss rooms flagged', bs.every((b) => def.rooms.find((r) => r.id === b.roomId)?.boss === b.order), tag);
      // ---- graph: BFS over doors from the start room
      const startRoom = def.rooms[roomAt(def, Math.floor(def.start.pos[0]), Math.floor(def.start.pos[1]))];
      check('gen.start inside a start room', !!startRoom && info.kinds[def.rooms.indexOf(startRoom)] === 'start', tag);
      const adj = new Map();
      for (const d of def.doors) { (adj.get(d.a) ?? adj.set(d.a, []).get(d.a)).push(d.b); (adj.get(d.b) ?? adj.set(d.b, []).get(d.b)).push(d.a); }
      const dist = new Map([[startRoom?.id, 0]]);
      const q = [startRoom?.id];
      while (q.length) { const c = q.shift(); for (const n of adj.get(c) ?? []) if (!dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); } }
      check('gen.every room reachable from start (door graph)', def.rooms.every((r) => dist.has(r.id)), `${tag}: ${def.rooms.filter((r) => !dist.has(r.id)).length} unreachable`);
      check('gen.door graph is a tree', def.doors.length === def.rooms.length - 1, `${tag}: ${def.doors.length} doors / ${def.rooms.length} rooms`);
      const dB = bs.map((b) => dist.get(b.roomId) ?? -1);
      check('gen.final is last (farther than both guardians; guardian 1 before 2)', dB[0] < dB[1] && dB[1] < dB[2] && dB[2] === Math.max(...bs.map((_, i) => dB[i])), `${tag}: ${dB}`);
      check('gen.final is a dead end (one door)', def.doors.filter((d) => d.a === bs[2]?.roomId || d.b === bs[2]?.roomId).length === 1, tag);
      const lock = def.doors.filter((d) => d.gate === 'boss_lock'), exit = def.doors.filter((d) => d.gate === 'boss_exit');
      check('gen.gates: 3 boss_lock + 2 boss_exit', lock.length === 3 && exit.length === 2, `${tag}: ${lock.length}/${exit.length}`);
      check('gen.gate rooms are boss rooms', lock.every((d) => def.rooms.find((r) => r.id === d.b)?.boss) && exit.every((d) => def.rooms.find((r) => r.id === d.a)?.boss), tag);
      // ---- door geometry: both tiles of a 2 wide door join two room tiles (mirror of the builder warning)
      let doorBad = 0;
      for (const d of def.doors) {
        const dx = d.side === 'e' ? 1 : d.side === 'w' ? -1 : 0, dz = d.side === 's' ? 1 : d.side === 'n' ? -1 : 0;
        for (let k = 0; k < (d.width ?? 1); k++) {
          const tx = d.tile[0] + (d.side === 'n' || d.side === 's' ? k : 0), tz = d.tile[1] + (d.side === 'e' || d.side === 'w' ? k : 0);
          if (def.rooms[roomAt(def, tx, tz)]?.id !== d.a || def.rooms[roomAt(def, tx + dx, tz + dz)]?.id !== d.b) doorBad++;
        }
      }
      check('gen.doors join the two rooms they name', doorBad === 0, `${tag}: ${doorBad}`);
      // ---- rects disjoint
      let overlap = 0;
      for (let i = 0; i < def.rooms.length; i++) for (let j = i + 1; j < def.rooms.length; j++) {
        const a = def.rooms[i].rect, b = def.rooms[j].rect;
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.h && b.z < a.z + a.h) overlap++;
      }
      check('gen.rects disjoint', overlap === 0, `${tag}: ${overlap}`);
      // ---- heights: every door joins floors that differ <= 0.45 unless a stair strip is involved; floors multiples of the tier height
      const hf = buildHeightfield(def, (i, j) => roomAt(def, i, j));
      check('gen.heightfield builds', !!hf, tag);
      if (hf) {
        let stepBad = 0;
        for (const d of def.doors) {
          const w = d.width ?? 1;
          const dx = d.side === 'e' ? 1 : d.side === 'w' ? -1 : 0, dz = d.side === 's' ? 1 : d.side === 'n' ? -1 : 0;
          for (let k = 0; k < w; k++) {
            const tx = d.tile[0] + (d.side === 'n' || d.side === 's' ? k : 0), tz = d.tile[1] + (d.side === 'e' || d.side === 'w' ? k : 0);
            // sample the cell centres next to the boundary on both sides (2 m cells)
            const ax = (tx + 0.5) * T + dx * 1, az = (tz + 0.5) * T + dz * 1, bx = (tx + 0.5) * T + dx * 3, bz = (tz + 0.5) * T + dz * 3;
            const ya = hf.groundY(ax, az), yb = hf.groundY(bx, bz);
            const slope = (hf.flagsAt(ax, az) | hf.flagsAt(bx, bz)) & F.SLOPE;
            if (!slope && Math.abs(ya - yb) > 0.45 + 1e-6) stepBad++;
          }
        }
        check('gen.door steps <= 0.45 m except stairs', stepBad === 0, `${tag}: ${stepBad}`);
      }
      const tierSet = new Set(info.tiers);
      for (const t of tierSet) stats.tiersUsed[tier].add(t);
      check('gen.tiers within the tier max', Math.max(...info.tiers) <= rule.maxTier && Math.min(...info.tiers) >= 0, `${tag}: ${[...tierSet]}`);
      check('gen.at least 2 floor levels (3 on Kahramanlik / Mitik)', tierSet.size >= (tier === 'n' ? 2 : 3), `${tag}: ${[...tierSet]}`);
      {
        const spineTiers = def.rooms.map((r, i) => (!r.optional && info.kinds[i] !== 'corridor' && info.kinds[i] !== 'ramp' ? info.tiers[i] : -1));
        check('gen.final arena on the highest spine tier', info.tiers[def.rooms.findIndex((r) => r.id === bs[2]?.roomId)] === Math.max(...spineTiers), `${tag}: ${spineTiers}`);
      }
      check('gen.rooms carry floorY on the 2 m grid', def.rooms.every((r) => r.floorY !== undefined && Math.abs(r.floorY / P.TIER_HEIGHT - Math.round(r.floorY / P.TIER_HEIGHT)) < 1e-9), tag);
      check('gen.stairs only on ramp rooms', def.rooms.every((r, i) => (r.slopes?.length ?? 0) === (info.kinds[i] === 'ramp' ? 1 : 0)), tag);
      // ---- population
      let enemies = 0;
      const ids = new Set();
      for (const p of def.packs) for (const m of p.members) { enemies++; ids.add(m.enemyId); }
      for (const id of ids) check('gen.enemy defId exists', !!ENEMIES[id], `${tag}: ${id}`);
      check('gen.pack ids unique', new Set(def.packs.map((p) => p.id)).size === def.packs.length, tag);
      check('gen.packs sit in non-arena rooms', def.packs.every((p) => { const r = def.rooms.find((x) => x.id === p.roomId); return !!r && !r.boss; }), tag);
      check('gen.forces declared = roster sum', def.packs.every((p) => p.forces === p.members.reduce((a, m) => a + (ENEMIES[m.enemyId]?.forces ?? 0), 0)), tag);
      stats.enemies[tier].push(enemies);
      for (const r of def.rooms) for (const p of r.props ?? []) propUrls.add(p.model);
      // ---- extras
      const ex = def.extras;
      check('gen.extras: no font of power, chest + shrine inside rooms', !ex.fontOfPower && ex.chests.every((c) => roomAt(def, Math.round(c.pos[0]), Math.round(c.pos[1])) >= 0) && ex.shrines.every((c) => roomAt(def, Math.round(c.pos[0]), Math.round(c.pos[1])) >= 0), tag);
      check('gen.exit inside the final room', roomAt(def, Math.floor(def.exit.pos[0]), Math.floor(def.exit.pos[1])) === def.rooms.findIndex((r) => r.id === bs[2]?.roomId), tag);
      check('gen.mods: count by tier, distinct', info.mods.length === rule.mods && new Set(info.mods).size === info.mods.length, `${tag}: ${info.mods}`);
      if (s < 4) sample.push(def);
    }
  }
}
{
  const runs = stats.gen;
  const exp = THEMES_ALL.length * TIERS.length * SEEDS;
  ok(`gen.all ${exp} maps generated without errors`, runs === exp, `${runs}/${exp}`);
  for (const [name, list] of problems) {
    if (name.endsWith('#')) continue;
    ok(name, false, `${problems.get(name + '#')}x e.g. ${list.join(' | ')}`);
  }
  const names = new Set([...problems.keys()].filter((k) => !k.endsWith('#')));
  // one PASS line per check family that never failed (so the log shows what ran)
  ok('gen.checks clean', names.size === 0, `${names.size} failing`);
  ok('gen.no reduced-layout fallback needed', stats.fallback === 0, `${stats.fallback} of ${runs}`);
  stats.ms.sort((a, b) => a - b);
  const p99 = stats.ms[Math.floor(stats.ms.length * 0.99)] ?? 0;
  ok('gen.speed p99 < 50 ms', p99 < 50, `p50 ${stats.ms[Math.floor(stats.ms.length / 2)]?.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms, max ${stats.ms[stats.ms.length - 1]?.toFixed(1)} ms`);
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const rng = (a) => (a.length ? `${Math.min(...a)}-${Math.max(...a)}` : '-');
  console.log(`rooms (non-connector) histogram: ${JSON.stringify(stats.rooms)}; RoomDefs avg ${avg(stats.total)} (${rng(stats.total)}); grid span max ${Math.max(...stats.spans)}`);
  for (const t of TIERS) {
    const w = TIER_RULE[t].enemies;
    const inWin = stats.enemies[t].filter((n) => n >= w[0] && n <= w[1]).length;
    console.log(`enemies ${t}: avg ${avg(stats.enemies[t])} range ${rng(stats.enemies[t])} (target ${w[0]}-${w[1]}, ${inWin}/${stats.enemies[t].length} inside); floor tiers used ${[...stats.tiersUsed[t]].sort().join(',')}`);
  }
}

// ================================================================================================ models on disk
{
  const missing = [...propUrls].filter((u) => !fs.existsSync(ROOT + 'public' + u));
  ok(`gen.prop models exist (${propUrls.size} urls)`, missing.length === 0, missing.slice(0, 4).join(', '));
  const thMissing = [];
  for (const th of Object.values(THEMES)) for (const u of [...th.props.scatter, th.props.center, th.props.brazier]) if (!fs.existsSync(ROOT + 'public' + u)) thMissing.push(u);
  ok('themes: palette models exist', thMissing.length === 0, thMissing.join(', '));
  const idMissing = [];
  for (const th of Object.values(THEMES)) for (const t of [...th.packs, ...th.elites]) for (const [id] of t.members) if (!ENEMIES[id]) idMissing.push(id);
  ok('themes: every template enemy id exists', idMissing.length === 0, idMissing.join(', '));
  const arenaMissing = Object.values(P.BOSS_POOLS).flatMap((p) => [...p.guardians, p.final]).filter((b) => !ARENAS[b] || !BOSSES[b] || !BOSS_SCRIPTS[b]);
  ok('arenas: every pooled boss has an arena, a BossDef and a script', arenaMissing.length === 0, arenaMissing.join(', '));
  const pooled = Object.values(P.BOSS_POOLS).flatMap((p) => [...p.guardians, p.final]);
  const sizes = pooled.map((b) => { const a = BOSSES[b].arena, r = ARENAS[b]; return Math.abs(a.w - r.w * T) + Math.abs(a.h - r.h * T); });
  ok('arenas: room size = baked boss arena size', sizes.every((d) => d === 0), sizes.join(','));
  ok('arenas: every pooled arena has door anchors (final >= 1, guardian >= 2)', Object.values(P.BOSS_POOLS).every((p) => p.guardians.every((g) => ARENAS[g].anchors.length >= 2) && ARENAS[p.final].anchors.length >= 1));
}

// ================================================================================================ shared content validator on a sample
{
  const models = new Map();
  const load = (urls) => {
    for (const u of urls) {
      if (models.has(u)) continue;
      const f = ROOT + 'public' + u;
      if (!fs.existsSync(f)) { models.set(u, { exists: false }); continue; }
      if (/\/(characters|monsters|enemies|npcs)\//.test(u)) { models.set(u, { exists: true, skinned: true }); continue; }
      if (!/\.(glb|gltf)$/.test(u)) { models.set(u, { exists: true }); continue; }
      try {
        const buf = fs.readFileSync(f);
        const b = cc.glbBoundsFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        models.set(u, b ? { exists: true, box: b.box ?? undefined, skinned: b.skinned } : { exists: /\.gltf$/.test(u) });
      } catch { models.set(u, { exists: true }); }
    }
  };
  const known = (id) => { const d = ENEMIES[id] ?? BOSSES[id]; return d ? (d.forces ?? 0) : undefined; };
  let errs = 0, warnCount = 0, checked = 0, vErrs = 0;
  const firstErrs = [];
  const sub = sample.filter((_, i) => i % 3 === 0);
  for (const def0 of sample) {
    // checkDungeon reads extras.fontOfPower: the field is deliberately absent in a fissure
    const def = { ...def0, extras: { ...def0.extras, fontOfPower: def0.start.pos } };
    load(cc.dungeonUrls(def));
    const rep = cc.checkDungeon(def, models, known, {});
    checked++;
    for (const i of rep.issues) {
      if (i.level === 'error') { errs++; if (firstErrs.length < 8) firstErrs.push(`${def.id} ${i.where}: ${i.msg}`); }
      if (i.level === 'warn') warnCount++;
    }
    for (const i of cc.checkVerticalDungeon(def)) if (i.level === 'error') vErrs++;
  }
  ok(`content.checkDungeon errors = 0 on ${checked} generated maps`, errs === 0, `${errs} errors, ${warnCount} warnings; ${firstErrs.join(' || ')}`);
  ok('content.checkVerticalDungeon (E1-E10) errors = 0', vErrs === 0, String(vErrs));
  void sub;
}

// ================================================================================================ real NavGrid (vertical A*): stairs, doors, regions
{
  const { NavGrid } = await imp('world/NavGrid.ts');
  const dirOf = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
  /** The DungeonBuilder.buildGrid classification (walls on room edges, carved doors, 1 m lattice) + attachHeights, without three.js. */
  const buildNav = (def) => {
    const W = def.grid.w, H = def.grid.h;
    const nav = new NavGrid({ originX: -0.5, originZ: -0.5, width: W * T + 1, depth: H * T + 1, cellSize: 1, walkable: false });
    const roomIdx = new Int16Array(W * H).fill(-1);
    def.rooms.forEach((r, idx) => { for (let z = r.rect.z; z < r.rect.z + r.rect.h; z++) for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) roomIdx[z * W + x] = idx; });
    const tr = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : roomIdx[j * W + i]);
    const hWall = new Uint8Array((H + 1) * W), vWall = new Uint8Array(H * (W + 1));
    for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) hWall[j * W + i] = tr(i, j - 1) !== tr(i, j) ? 1 : 0;
    for (let j = 0; j < H; j++) for (let i = 0; i <= W; i++) vWall[j * (W + 1) + i] = tr(i - 1, j) !== tr(i, j) ? 1 : 0;
    for (const d of def.doors) {
      const width = Math.max(1, d.width ?? 1), tx = d.tile[0], tz = d.tile[1];
      if (d.side === 'n' || d.side === 's') { const j = d.side === 'n' ? tz : tz + 1; for (let k = 0; k < width; k++) hWall[j * W + tx + k] = 0; }
      else { const i = d.side === 'w' ? tx : tx + 1; for (let k = 0; k < width; k++) vWall[(tz + k) * (W + 1) + i] = 0; }
    }
    const hasH = (i, j) => i >= 0 && i < W && j >= 0 && j <= H && hWall[j * W + i] === 1;
    const hasV = (i, j) => j >= 0 && j < H && i >= 0 && i <= W && vWall[j * (W + 1) + i] === 1;
    for (let cz = 0; cz <= H * T; cz++) for (let cx = 0; cx <= W * T; cx++) {
      const mx = cx % T, mz = cz % T, i = Math.floor(cx / T), j = Math.floor(cz / T);
      let walk;
      if (mx !== 0 && mz !== 0) walk = tr(i, j) >= 0;
      else if (mx === 0 && mz !== 0) walk = !hasV(i, j) && tr(i - 1, j) >= 0 && tr(i, j) >= 0;
      else if (mz === 0 && mx !== 0) walk = !hasH(i, j) && tr(i, j - 1) >= 0 && tr(i, j) >= 0;
      else walk = !hasH(i, j) && !hasH(i - 1, j) && !hasV(i, j) && !hasV(i, j - 1) && tr(i - 1, j - 1) >= 0 && tr(i, j - 1) >= 0 && tr(i - 1, j) >= 0 && tr(i, j) >= 0;
      if (walk) nav.setCell(cx, cz, 1);
    }
    const hf = buildHeightfield(def, tr);
    nav.attachHeights({ groundY: (x, z) => hf.groundY(x, z), flagsAt: (x, z) => hf.flagsAt(x, z), rimAt: () => 'rail' });
    return nav;
  };
  const w = (c) => (c + 0.5) * T;
  let navBad = 0, pathBad = 0, tested = 0, firstBad = '';
  for (const def of sample) {
    const nav = buildNav(def);
    tested++;
    const s0 = nav.nearestWalkable(w(def.start.pos[0]), w(def.start.pos[1]), 6);
    const targets = [...def.bosses.map((b) => ['boss ' + b.bossId, b.pos]), ['exit', def.exit.pos], ...def.packs.map((p) => ['pack ' + p.id, p.center]), ...(def.extras.chests ?? []).map((c) => ['chest', c.pos])];
    for (const [name, pos] of targets) {
      const t = nav.nearestWalkable(w(pos[0]), w(pos[1]), 6);
      if (!s0 || !t) { navBad++; if (!firstBad) firstBad = def.id + ' ' + name + ' not walkable'; continue; }
      if (!nav.sameRegion(s0, t)) { navBad++; if (!firstBad) firstBad = def.id + ' ' + name + ' other region'; continue; }
      const path = nav.findPath(s0, t, 60000);
      if (!path || !path.length) { pathBad++; if (!firstBad) firstBad = def.id + ' ' + name + ' no path'; }
    }
  }
  {
    const def0 = sample.find((d) => d.fissure.kinds.includes('ramp'));
    const stripped = { ...def0, rooms: def0.rooms.map((r) => ({ ...r, slopes: undefined })) };
    const nav = buildNav(stripped);
    const s0 = nav.nearestWalkable(w(def0.start.pos[0]), w(def0.start.pos[1]), 6);
    const t = nav.nearestWalkable(w(def0.exit.pos[0]), w(def0.exit.pos[1]), 6);
    ok('nav.negative control: without the stair strips the exit is unreachable', !!s0 && !!t && !nav.sameRegion(s0, t));
  }
  ok(`nav.start reaches every pack / boss / chest / exit by A* on the real vertical NavGrid (${tested} maps)`, navBad === 0 && pathBad === 0, `regions ${navBad}, paths ${pathBad}; ${firstBad}`);
}

// ================================================================================================ net / cache
{
  const id = P.fissureId({ theme: 'frost', tier: 'm', level: 60, seed: 99, v: V });
  const a = P.getFissureDef(id), b = P.getFissureDef(id);
  ok('net.getFissureDef returns the cached def', !!a && a === b);
  ok('net.getFissureDef never throws on junk', ['', 'x', 'fis.', 'fis.crypt.n.5.zzzzzzzz.1', 'fis.crypt.n.5.00000001.99'].every((s) => P.getFissureDef(s) === undefined));
  // two "peers": separate generation of the same id gives identical defs (host + client)
  const x = JSON.stringify(P.generateFissure(P.parseFissureId(id))), y = JSON.stringify(a);
  ok('net.peers regenerate the identical def from the id alone', x === y);
  // enemy ids are positional: packs then bosses (DUNGEON_ENEMY_ID_BASE + index)
  const order = a.packs.flatMap((p) => p.members.map((m) => m.enemyId)).concat(a.bosses.map((bb) => bb.bossId));
  ok('net.enemy order = packs then bosses', order.length === a.packs.reduce((n, p) => n + p.members.length, 0) + 3 && order.slice(-3).join() === a.bosses.map((bb) => bb.bossId).join());
  // the hand-made dungeons are untouched
  ok('net.hand-made dungeons unaffected', !!DUNGEONS.kemik_mahzeni && getDungeon('kemik_mahzeni') === DUNGEONS.kemik_mahzeni && !('fissure' in DUNGEONS.kemik_mahzeni));
}

// ================================================================================================ rules
{
  const R = P.FISSURE_TIERS;
  const s1 = P.fissureScaling({ tier: 'n', mods: [] }, false), s2 = P.fissureScaling({ tier: 'm', mods: ['fm_zirh', 'fm_zalim'] }, false), s3 = P.fissureScaling({ tier: 'm', mods: ['fm_zirh', 'fm_zalim'] }, true);
  ok('rules.scaling normal = 1/1', s1.hp === 1 && s1.dmg === 1);
  ok('rules.scaling mitik trash (zirh): hp x1.9 x1.25', Math.abs(s2.hp - 1.9 * 1.25) < 1e-9 && Math.abs(s2.dmg - 1.5) < 1e-9);
  ok('rules.scaling mitik boss (zalim): hp x1.8 x1.2, dmg x1.4 x1.1', Math.abs(s3.hp - 1.8 * 1.2) < 1e-9 && Math.abs(s3.dmg - 1.4 * 1.1) < 1e-9);
  ok('rules.tier table', R.n.mods === 0 && R.h.mods === 1 && R.m.mods === 2 && R.n.difficulty === 'normal' && R.h.difficulty === 'heroic' && R.m.difficulty === 'mythic');
  ok('rules.unlock: normal open, heroic needs level 30 + a normal clear, mitik needs 60 + 3 heroic clears',
    P.fissureUnlock('n', 1, {}).ok && !P.fissureUnlock('h', 29, { n: 5 }).ok && !P.fissureUnlock('h', 30, {}).ok && P.fissureUnlock('h', 30, { n: 1 }).ok
    && !P.fissureUnlock('m', 60, { h: 2 }).ok && P.fissureUnlock('m', 60, { h: 3 }).ok && P.fissureUnlock('m', 60, {}, true).ok);
  ok('rules.enemy level: normal follows the party, heroic >= 30, mitik 60', P.fissureEnemyLevel('n', 12) === 12 && P.fissureEnemyLevel('h', 12) === 30 && P.fissureEnemyLevel('h', 44) === 44 && P.fissureEnemyLevel('m', 20) === 60 && P.fissureEnemyLevel('n', 99) === 60);
  ok('rules.item level caps 62 / 64 / 68', P.fissureItemLevel('n', 60, true) === 62 && P.fissureItemLevel('h', 60, true) === 64 && P.fissureItemLevel('m', 60, true) === 68 && P.fissureItemLevel('n', 10, false) === 11);
  ok('rules.end rewards scale with tier', P.fissureEndRewards('n', 20, []).gold === 800 && P.fissureEndRewards('m', 60, ['fm_bereket']).gold === Math.round(60 * 160 * 1.25) && P.fissureEndRewards('m', 60, []).dragonCoins === 2);
  const lvl = (l) => P.generateFissure({ theme: 'crypt', tier: 'n', level: l, seed: 5, v: V }).packs.reduce((n, p) => n + p.members.length, 0);
  ok('rules.pack sizes scale with level', lvl(60) > lvl(5), `${lvl(5)} -> ${lvl(60)} bodies`);
}

// ================================================================================================ the real DungeonBuilder (headless, assets stubbed)
// buildDungeon runs end to end on a fake canvas with every GLB reported missing: it exercises the vertical geometry (stairs, ceilings,
// rim pass), walls / carved doors, gates, props and the builder's own NavGrid on the generated defs; only the model pieces are absent.
{
  const THREE = await import(new URL('../../node_modules/three/build/three.module.js', import.meta.url).href);
  const ctx2d = () => new Proxy({}, { get: (t, k) => (k === 'createImageData' || k === 'getImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : k === 'measureText' ? () => ({ width: 10 }) : (...a) => new Proxy({}, { get: () => () => undefined })), set: () => true });
  const mkCanvas = () => ({ width: 64, height: 64, style: {}, getContext: () => ctx2d(), toDataURL: () => '', addEventListener() {} });
  globalThis.document = globalThis.document ?? { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, classList: { add() {} }, appendChild() {}, setAttribute() {} }), body: { appendChild() {} }, addEventListener() {} };
  globalThis.window = globalThis.window ?? { addEventListener() {}, location: { search: '' }, devicePixelRatio: 1 };
  const { G } = await imp('game/G.ts');
  G.assets = { load: async () => null, instantiate: () => new THREE.Group(), texture: () => new THREE.Texture(), cloneMaterials() {} };
  G.vfx = { spawn: () => ({ alive: false, stop() {}, setPosition() {} }) };
  G.audio = { play() {} };
  const { buildDungeon } = await imp('world/DungeonBuilder.ts');
  let built = 0, bErr = 0, gateBad = 0, regionBad = 0, first = '';
  const w = (c) => (c + 0.5) * T;
  for (const def of sample) {
    try {
      const b = await buildDungeon(def, new THREE.Scene());
      built++;
      if (b.gates.size !== 5) gateBad++;
      const s0 = b.nav.nearestWalkable(w(def.start.pos[0]), w(def.start.pos[1]), 6);
      for (const [name, pos] of [['exit', def.exit.pos], ...def.bosses.map((bb) => ['boss ' + bb.bossId, bb.pos])]) {
        const t = b.nav.nearestWalkable(w(pos[0]), w(pos[1]), 6);
        if (!s0 || !t || !b.nav.sameRegion(s0, t) || !b.nav.findPath(s0, t, 60000)) { regionBad++; if (!first) first = def.id + ' ' + name; }
      }
      b.dispose?.();
    } catch (e) { bErr++; if (!first) first = def.id + ' ' + String(e.stack).split(String.fromCharCode(10)).slice(0, 3).join(' | '); }
  }
  ok(`builder.DungeonBuilder builds ${sample.length} generated maps headless without errors`, bErr === 0 && built === sample.length, `${bErr} errors; ${first}`);
  ok('builder.5 boss gates per map (3 boss_lock + 2 boss_exit)', gateBad === 0, String(gateBad));
  ok('builder.real nav: start reaches exit and all 3 bosses (A*)', regionBad === 0, `${regionBad}; ${first}`);
}

// ================================================================================================ UI: finder tab "Kadim Yarıklar" (fake DOM)
{
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent("export async function load(u,c,n){ if(u.endsWith('.css')) return {format:'module',source:'export default \"\";',shortCircuit:true}; return n(u,c); }"));
  class FakeNode {}
  class FakeEl extends FakeNode {
    constructor(tag) { super(); this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.attrs = {}; this.cls = new Set(); this.listeners = {}; this.hidden = false; this.title = ''; this.disabled = false; }
    get classList() { const c = this.cls; return { add: (...a) => a.forEach((x) => c.add(x)), remove: (...a) => a.forEach((x) => c.delete(x)), toggle: (k, f) => (f === undefined ? (c.has(k) ? c.delete(k) : c.add(k)) : f ? c.add(k) : c.delete(k)), contains: (k) => c.has(k) }; }
    append(...c) { for (const x of c) if (x != null) this.children.push(x); }
    appendChild(c) { this.children.push(c); return c; }
    insertBefore(c) { this.children.push(c); return c; }
    set textContent(v) { this.children = v ? [String(v)] : []; }
    get textContent() { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
    removeEventListener() {}
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getContext() { return ctx2dUi; }
    click() { (this.listeners.click ?? []).forEach((f) => f({})); }
  }
  const ctx2dUi = new Proxy({}, { get: (t, k) => (k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => undefined), set: () => true });
  globalThis.Node = FakeNode;
  globalThis.HTMLElement = FakeEl;
  globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => String(t), body: new FakeEl('body'), addEventListener() {}, getElementById: () => null };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, location: { search: '' }, localStorage: { getItem: () => null }, devicePixelRatio: 1, setInterval, clearInterval, setTimeout };
  const { G } = await imp('game/G.ts');
  const toasts = [];
  G.character = { level: 35, classId: 'knight', save: { flags: { 'fis.clear.n': 2 } }, itemLevel: () => 40 };
  G.net = { isOnline: false, isAuthority: true, selfId: 'me', peers: new Map(), remotePeers: () => [], partyMembers: () => [] };
  G.audio = { play() {} };
  G.ui = { toast: (t) => toasts.push(t) };
  try {
    const { FissureTab } = await imp('ui/panels/game/finderFissure.ts');
    let launched = null;
    const tab = new FissureTab({ rerender: () => tab.render(), inDungeon: () => false, launch: (p, l) => { launched = { p, l }; } });
    tab.open();
    tab.render();
    const text = (n) => (typeof n === 'string' ? n : (n.children ?? []).map(text).join(' '));
    const t = text(tab.el);
    ok('ui.tab renders themes, difficulties, map info', ['Mezarlık Yarığı', 'Kor Yarığı', 'Buzul Yarığı', 'Gölge Yarığı', 'ZORLUK', 'Normal', 'Kahramanlık', 'Mitik', 'Son Patron', 'Yeniden Çevir'].every((k) => t.includes(k)), t.slice(0, 120));
    const prim = tab.primary();
    ok('ui.primary enabled for a level 35 character', prim.show && !prim.disabled && prim.label === 'Yarığa Gir');
    prim.run();
    const spec = launched && P.parseFissureId(launched.p.dungeonId);
    ok('ui.launch params: self-describing id, difficulty, seed, level, no key', !!spec && launched.p.difficulty === 'normal' && launched.p.keyLevel === 0 && launched.p.seed === spec.seed && launched.p.enemyLevel === spec.level && spec.level === 35 && launched.p.affixes.length === 0 && launched.p.fissure.v === V);
    const btns = [];
    const find = (n) => { if (typeof n === 'string') return; if (n.cls?.has('fd-diff')) btns.push(n); (n.children ?? []).forEach(find); };
    find(tab.el);
    ok('ui.Kahramanlik open (level 35 + 2 normal clears), Mitik locked', btns.length === 3 && !btns[1].cls.has('is-locked') && btns[2].cls.has('is-locked'));
    btns[2].click();
    ok('ui.locked Mitik click only toasts the reason', toasts.some((x) => x.includes('60')) && tab.primary().label === 'Yarığa Gir');
    btns[1].click();
    tab.primary().run();
    ok('ui.Kahramanlik launch maps to heroic', launched.p.difficulty === 'heroic' && P.parseFissureId(launched.p.dungeonId).tier === 'h');
    G.net.isOnline = true; G.net.isAuthority = false; G.net.inParty = true; G.net.isPartyLeader = false; // channels: the party leader (not the channel host) opens runs
    ok('ui.a non-leader party member cannot open the Yarik', tab.primary().disabled && /oda sahibi/i.test(tab.primary().label));
    G.net.isOnline = false; G.net.isAuthority = true; G.net.inParty = false; G.net.isPartyLeader = true;
    G.character.save.flags = {};
    tab.open();
    ok('ui.Kahramanlik locked without a Normal clear', !tab.primary().disabled && (tab.tier === 'n'));
  } catch (e) {
    ok('ui.finder tab runs', false, String(e.stack).split(String.fromCharCode(10)).slice(0, 4).join(' | '));
  }
}

console.log(`${fails ? 'FAILED' : 'PASS'}: ${passes} checks passed, ${fails} failed (${SEEDS} seeds x ${THEMES_ALL.length} themes x ${TIERS.length} tiers)`);
process.exit(fails ? 1 : 0);
