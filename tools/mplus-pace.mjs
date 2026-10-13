#!/usr/bin/env node
/**
 * Mythic+ pace estimate (P-29, docs/dungeons/_shared_primitives.md): a per-section timer table for one dungeon.
 *
 *   node tools/mplus-pace.mjs kemik_mahzeni                 +10, 5 players, mandatory route
 *   node tools/mplus-pace.mjs kemik_mahzeni --level 12 --party 3 --deaths 1
 *   node tools/mplus-pace.mjs kemik_mahzeni --all           also count optional and skip rooms
 *
 * A planning model, not a simulation. Constants and their sources:
 *  - pull: 31 forces per minute including walking (docs/dungeons/buyucu_terasi.md 6.2)
 *  - walk: 20 s between two sections (buyucu 6.2 says 15 to 25 s)
 *  - boss: 1.4 s of pure party damage per hpMult point at +10 with 5 players, plus 27.5 % mechanics downtime
 *    (buyucu 6.2 says 25 to 30 %). hpMult and enrageTimer come from BOSSES (data/enemies.ts).
 *  - keystone: enemy HP scales 1.08^(L-10) up to +10 and 1.10^(L-10) above (CORE_MECHANICS 6); time scales with it.
 *  - party: enemy HP x {1: 0.45, 2: 0.62, 3: 0.78, 4: 0.89, 5: 1.0}; damage is per player, so time x hpF * 5 / n.
 *  - timer chest: +3 at 60 %, +2 at 80 %, +1 at 100 % of timerSec; each death adds 15 s (CORE_MECHANICS 6).
 * Sections: the route is walked from the start room through doors. Each boss splits the route: the rooms reachable before
 * that boss (earlier bosses are passable, later ones block) form one trash section, then the boss row follows.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch(e2){if(e2.code!=='ERR_MODULE_NOT_FOUND'&&e2.code!=='ERR_UNSUPPORTED_DIR_IMPORT')throw e2}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);

// ---- arguments ----
const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(['--level', '--party', '--deaths']);
const flagValue = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]));
const level = Number(flagValue('--level', 10));
const party = Number(flagValue('--party', 5));
const deaths = Number(flagValue('--deaths', 0));
const includeOptional = argv.includes('--all');

const { DUNGEONS } = await imp('src/data/dungeons/index.ts');
const { ENEMIES, BOSSES } = await imp('src/data/enemies.ts');

if (positional.length !== 1 || !Object.hasOwn(DUNGEONS, positional[0])) {
  console.error(`usage: node tools/mplus-pace.mjs <dungeon id> [--level N] [--party 1..5] [--deaths N] [--all]\nids: ${Object.keys(DUNGEONS).join(', ')}`);
  process.exit(2);
}
if (!(level >= 2 && level <= 40) || !(party >= 1 && party <= 5) || !(deaths >= 0)) {
  console.error('--level must be 2..40, --party 1..5, --deaths 0 or more');
  process.exit(2);
}
const def = DUNGEONS[positional[0]];

// ---- model constants (see header) ----
const PULL_FORCES_PER_MIN = 31;
const WALK_SEC = 20;
const BOSS_SEC_PER_HPMULT = 1.4;
const DOWNTIME = 0.275;
const PARTY_HP = { 1: 0.45, 2: 0.62, 3: 0.78, 4: 0.89, 5: 1.0 };
const DEATH_SEC = 15;
const keyScale = level <= 10 ? 1.08 ** (level - 10) : 1.10 ** (level - 10);
const timeScale = keyScale * ((PARTY_HP[party] * 5) / party);

const forcesOf = (eid) => (ENEMIES[eid] ?? BOSSES[eid])?.forces;
const packForces = (p) => p.forces ?? p.members.reduce((s, m) => s + (forcesOf(m.enemyId) ?? 0), 0);
const unknownEnemies = new Set();
for (const p of def.packs) for (const m of p.members) if (forcesOf(m.enemyId) === undefined) unknownEnemies.add(m.enemyId);

// ---- route: rooms by door adjacency, split at each boss ----
const adj = new Map();
for (const d of def.doors) {
  if (!adj.has(d.a)) adj.set(d.a, []);
  if (!adj.has(d.b)) adj.set(d.b, []);
  adj.get(d.a).push(d.b);
  adj.get(d.b).push(d.a);
}
const sx = def.start.pos[0] + 0.5, sz = def.start.pos[1] + 0.5;
const startRoom = def.rooms.find((r) => sx > r.rect.x && sx < r.rect.x + r.rect.w && sz > r.rect.z && sz < r.rect.z + r.rect.h);
if (!startRoom) {
  console.error(`${def.id}: the start is not inside a room`);
  process.exit(1);
}
const bossRoomIds = new Set(def.bosses.map((b) => b.roomId));
const passed = new Set();
const assigned = new Set(); // the start room is not pre-assigned: it is the first trash section's room, so its packs count

/** Rooms reachable from the start: killed bosses are passable, living ones block. */
function reachableRooms() {
  const seen = new Set([startRoom.id]);
  const queue = [startRoom.id];
  while (queue.length) {
    const c = queue.shift();
    for (const n of adj.get(c) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (!(bossRoomIds.has(n) && !passed.has(n))) queue.push(n); // a living boss room is entered but not crossed
    }
  }
  return seen;
}

const groups = []; // { rooms } for trash sections, { boss } for boss rows, in route order
const warnings = [];
for (const b of [...def.bosses].sort((x, y) => x.order - y.order)) {
  const reach = reachableRooms();
  if (!reach.has(b.roomId)) warnings.push(`boss ${b.bossId} room ${b.roomId} is not reachable from the start`);
  // the boss's own room is entered before the fight: its packs are pulled in the trash section just before the boss row
  groups.push({ rooms: [...reach].filter((r) => !assigned.has(r) && (!bossRoomIds.has(r) || r === b.roomId)) });
  groups[groups.length - 1].rooms.forEach((r) => assigned.add(r));
  groups.push({ boss: b });
  passed.add(b.roomId);
  assigned.add(b.roomId);
}
const tail = [...reachableRooms()].filter((r) => !assigned.has(r) && !bossRoomIds.has(r));
if (tail.length) groups.push({ rooms: tail });

const routeRoom = (r) => includeOptional || !(r.optional || r.skip);
const routeRoomIds = new Set(def.rooms.filter(routeRoom).map((r) => r.id));
const packsOf = (roomIds) => def.packs.filter((p) => roomIds.includes(p.roomId) && routeRoomIds.has(p.roomId) && (includeOptional || !p.optional));
{
  const counted = new Set(groups.flatMap((g) => g.rooms ?? []));
  const stray = def.packs.filter((p) => routeRoomIds.has(p.roomId) && !counted.has(p.roomId) && (includeOptional || !p.optional));
  if (stray.length) warnings.push(`${stray.length} packs in route rooms the walk never reaches (${[...new Set(stray.map((p) => p.roomId))].join(', ')}): not counted`);
}

// ---- rows ----
const rows = [];
let clock = 0;
let cumForces = 0;
let reachedRequired = null; // run clock (s) when the cumulative forces first reach forcesRequired
const required = def.forcesRequired;
let trashIndex = 0;
let bossIndex = 0;
for (const g of groups) {
  const walk = rows.length ? WALK_SEC : 0;
  if (g.boss) {
    bossIndex++;
    const hpMult = BOSSES[g.boss.bossId]?.hpMult ?? 75;
    const enrage = BOSSES[g.boss.bossId]?.enrageTimer;
    if (BOSSES[g.boss.bossId] === undefined) warnings.push(`boss ${g.boss.bossId} is not in BOSSES: hpMult 75 assumed`);
    const sec = (BOSS_SEC_PER_HPMULT * hpMult * timeScale) / (1 - DOWNTIME);
    clock += walk + sec;
    rows.push({
      name: `B${bossIndex}`, label: g.boss.bossId.replace(/^boss_/, ''), rooms: g.boss.roomId, packs: 0, forces: 0,
      sec: walk + sec, clock, cum: null, note: enrage !== undefined ? (sec > enrage ? `ENRAGE at ${enrage} s` : `enrage ${enrage} s`) : '',
    });
  } else {
    const ps = packsOf(g.rooms);
    if (!ps.length && !g.rooms.length) continue;
    trashIndex++;
    const forces = ps.reduce((s, p) => s + packForces(p), 0);
    const pull = ((forces / PULL_FORCES_PER_MIN) * 60) * timeScale;
    const rowStart = clock;
    clock += walk + pull;
    const before = cumForces;
    cumForces += forces;
    if (reachedRequired === null && required > 0 && cumForces >= required && forces > 0) {
      reachedRequired = rowStart + walk + pull * ((required - before) / forces);
    }
    rows.push({
      name: `S${trashIndex}`, label: g.rooms.join(', ') || '-', rooms: '', packs: ps.length, forces,
      sec: walk + pull, clock, cum: cumForces, note: '',
    });
  }
}
const total = clock + deaths * DEATH_SEC;
const routeForces = rows.reduce((s, r) => s + r.forces, 0);

// ---- output ----
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const timer = def.timerSec;
const pctOf = (s, base) => `${((s / base) * 100).toFixed(0)}%`;
const widths = [5, 36, 5, 7, 7, 8, 9, 7, 22];
const cells = (c) => c.map((v, i) => String(v).padEnd(widths[i])).join(' ');
const label = (r) => r.label;
console.log(`\n== ${def.id}: +${level}, ${party} player${party === 1 ? '' : 's'}${deaths ? `, ${deaths} death(s)` : ''}, ${includeOptional ? 'all rooms' : 'mandatory route'} | timer ${mmss(timer)} | route forces ${routeForces}/${required} (${required ? ((routeForces / required) * 100).toFixed(1) : '-'}%)`);
console.log(`   time x${timeScale.toFixed(2)} (keystone x${keyScale.toFixed(2)}, party ${party}), walk ${WALK_SEC} s, pull ${PULL_FORCES_PER_MIN}/min, boss downtime ${(DOWNTIME * 100).toFixed(1)}%\n`);
console.log(cells(['Row', 'Section', 'Packs', 'Forces', 'Cum %', 'Section', 'Clock', 'Timer', 'Note']));
console.log(widths.map((w) => '-'.repeat(w)).join(' '));
for (const r of rows) {
  const cumPct = r.cum === null || !required ? '' : `${((r.cum / required) * 100).toFixed(1)}`;
  const clockNow = r.clock + deaths * DEATH_SEC;
  console.log(cells([
    r.name, label(r).slice(0, 36), r.packs || '', r.forces || '', cumPct, mmss(r.sec), mmss(clockNow), pctOf(clockNow, timer), r.note,
  ]));
}
const chest = total <= timer * 0.6 ? '+3' : total <= timer * 0.8 ? '+2' : total <= timer ? '+1' : 'untimed';
console.log(`\ntotal ${mmss(total)} of ${mmss(timer)} (${pctOf(total, timer)}), ${total <= timer ? `margin ${mmss(timer - total)}` : `over by ${mmss(total - timer)}`}, timer chest ${chest}`);
if (reachedRequired !== null) console.log(`forces reach ${(required)} (100%) at ${mmss(reachedRequired)}`);
for (const w of warnings) console.log(`warn: ${w}`);
if (required && routeForces < required) console.log(`warn: the route holds ${routeForces} forces, below forcesRequired ${required}`);
if (unknownEnemies.size) console.log(`warn: forces unknown for ${[...unknownEnemies].join(', ')} (counted as 0)`);
const offRoute = def.packs.filter((p) => !routeRoomIds.has(p.roomId) || (!includeOptional && p.optional));
if (offRoute.length) console.log(`off route: ${offRoute.length} packs, ${offRoute.reduce((s, p) => s + packForces(p), 0)} forces (--all counts them)`);
