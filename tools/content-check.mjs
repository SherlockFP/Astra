#!/usr/bin/env node
/**
 * Headless content validator (OWNER: content module): runs the same checks as dev/content.html on every dungeon, the open-world
 * zone and the town without a browser or dev server (about half a second).
 *
 *   node tools/content-check.mjs                 all content
 *   node tools/content-check.mjs kemik_mahzeni   one dungeon / sisli_koru / town (several ids allowed)
 *   node tools/content-check.mjs --v             also print info lines
 *
 * Needs Node >= 22.18 (native TypeScript type stripping). Model files are read from public/ (GLB bounds for collide footprints).
 */
import fs from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { DUNGEONS, DUNGEON_IDS, OPEN_ZONES, OPEN_ZONE_IDS } = await imp('src/data/dungeons/index.ts');
const { TOWN } = await imp('src/data/town.ts');
const cc = await imp('src/dev/contentCheck.ts');
const ALL = { ...DUNGEONS, ...OPEN_ZONES };
const ALL_IDS = [...DUNGEON_IDS, ...OPEN_ZONE_IDS];
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const verbose = process.argv.includes('--v');

const urls = new Set();
for (const id of ALL_IDS) for (const u of cc.dungeonUrls(ALL[id])) urls.add(u);
for (const u of cc.townUrls(TOWN)) urls.add(u);
const models = new Map();
for (const u of urls) {
  const f = `${ROOT}/public${u}`;
  if (!fs.existsSync(f)) { models.set(u, { exists: false }); continue; }
  if (/\/(characters|monsters|enemies|npcs)\//.test(u)) { models.set(u, { exists: true, skinned: true }); continue; }
  if (!/\.(glb|gltf)$/.test(u)) { models.set(u, { exists: true }); continue; } // textures, panoramas: existence only
  try {
    const buf = fs.readFileSync(f);
    const b = cc.glbBoundsFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    models.set(u, b ? { exists: true, box: b.box ?? undefined, skinned: b.skinned } : { exists: /\.gltf$/.test(u) });
  } catch { models.set(u, { exists: true }); }
}
let known;
try {
  // mobs, rares, mini-bosses, metin stones (ENEMIES) and bosses (BOSSES, e.g. wb_curukkok)
  const { ENEMIES: E, BOSSES: B } = await imp('src/data/enemies.ts');
  known = (id) => { const d = E[id] ?? B[id]; return d ? (d.forces ?? 0) : undefined; };
} catch { /* GDD roster fallback */ }

// ---- region quests (data/world/quests_extra.ts, ids sq_rN_* / dq_rN_*): spawn, band, chain and giver checks on top of cc.checkQuests
const isRegionQuest = (q) => /^(sq|dq)_r\d_/.test(q.id);
/** enemy / stone / boss id -> regions it spawns in (camp and patrol members, miniboss and metin regionId, rares by level band). */
function spawnIndex(world, packs) {
  const roomRegion = new Map((world?.regions ?? []).map((r) => [r.roomId, r.id]));
  const at = new Map();
  const add = (id, region) => { if (!at.has(id)) at.set(id, new Set()); if (region) at.get(id).add(region); };
  for (const p of packs ?? []) for (const m of p.members) add(m.enemyId, roomRegion.get(p.roomId));
  for (const m of world?.minibosses ?? []) add(m.enemyId, m.regionId);
  for (const t of world?.metin?.tiers ?? []) add(t.enemyId, t.regionId);
  for (const r of world?.rares ?? []) for (const g of world?.regions ?? []) if (r.level >= g.levels[0] && r.level <= g.levels[1]) add(r.enemyId, g.id);
  for (const b of world?.bosses ?? []) add(b.bossId, undefined); // world bosses roam any region
  return at;
}
function regionQuestIssues(quests, world, npcIds, packs) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const spawns = spawnIndex(world, packs);
  const byId = new Map(quests.map((q) => [q.id, q]));
  const band = new Map((world?.regions ?? []).map((r) => [r.id, r.levels]));
  for (const q of quests.filter(isRegionQuest)) {
    const where = `quest ${q.id}`;
    if (!npcIds.has(q.giver)) err(where, `giver ${q.giver} is not an NPC in the town / villages`);
    if (q.turnIn && !npcIds.has(q.turnIn)) err(where, `turn-in ${q.turnIn} is not an NPC in the town / villages`);
    const [lo, hi] = band.get(q.region) ?? [1, 99];
    if (q.level < lo || q.level > hi) err(where, `level ${q.level} is outside the ${q.region} band ${lo}-${hi}`);
    for (const p of q.prereq ?? []) {
      const pd = byId.get(p);
      if (!pd) err(where, `unknown prerequisite ${p}`);
      else if (q.level < pd.level) err(where, `level ${q.level} is below its prerequisite ${p} (${pd.level}): chain levels must not drop`);
    }
    for (const o of q.objectives) {
      const ow = `${where} [${o.kind} ${o.target ?? ''}]`;
      if (o.kind === 'talk' && !npcIds.has(o.target)) err(ow, `npc ${o.target} is not in the town / villages`);
      if ((o.kind === 'kill' || o.kind === 'metin') && o.target) {
        const at = spawns.get(o.target);
        if (!at) err(ow, `${o.target} does not spawn in any camp, rare, miniboss, metin stone or world boss`);
        else if (at.size && !at.has(q.region)) warn(ow, `${o.target} spawns in ${[...at].join(', ')}, not in ${q.region}`);
      }
    }
  }
  return out;
}
/** Per-region counts of the region quests by their id token (k kill, c collect, h hunt, m metin, ch chain, dq daily). */
function regionCounts(quests) {
  const rows = new Map();
  for (const q of quests.filter(isRegionQuest)) {
    const row = rows.get(q.region) ?? { k: 0, c: 0, h: 0, m: 0, ch: 0, daily: 0 };
    if (q.id.startsWith('dq_')) row.daily++;
    else row[/^sq_r\d_(ch|k|c|h|m)\d/.exec(q.id)?.[1] ?? 'k']++;
    rows.set(q.region, row);
  }
  return [...rows].map(([r, c]) => `${r}: kill ${c.k}, collect ${c.c}, hunt ${c.h}, metin ${c.m}, chain ${c.ch}, daily ${c.daily}`);
}

let totalErr = 0;
for (const id of ALL_IDS) {
  if (want.length && !want.includes(id)) continue;
  const rep = cc.checkDungeon(ALL[id], models, known);
  const e = rep.issues.filter((i) => i.level === 'error'), w = rep.issues.filter((i) => i.level === 'warn'), n = rep.issues.filter((i) => i.level === 'info');
  totalErr += e.length;
  const s = rep.stats;
  console.log(`\n== ${id}: ${e.length} errors, ${w.length} warns | rooms ${s.rooms} packs ${s.packs} enemies ${s.enemies} props ${s.props} (collide ${s.collide}, lights ${s.lights}) models ${s.models} forces ${s.forcesAll}/${s.forcesRequired}`);
  const x = ALL[id].world;
  if (x) console.log(`   world: ${x.regions.length} regions, ${x.villages.length} villages, ${x.waypoints.length} waypoints, ${x.entrances.length} entrances, ${x.metin.tiers.length} metin tiers / ${x.metin.spots.length} spots, ${x.rares.length} rares, ${x.minibosses.length} minibosses, ${x.bosses.length} world bosses, ${ALL[id].packs.length} camps and patrols`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
  if (verbose) for (const i of n) console.log('  info', i.where, '-', i.msg);
}
// open-world quests (GDD_OPENWORLD §6): givers, objectives, reward items; hub NPCs without a layout entry are warnings
if (!want.length || want.includes('sisli_vadi') || want.includes('quests')) {
  const { QUESTS } = await imp('src/data/world/quests.ts');
  const { MATERIALS } = await imp('src/data/materials.ts');
  const world = ALL.sisli_vadi?.world;
  const npcIds = new Set([...TOWN.npcs.map((n) => n.id), ...(world?.villages ?? []).flatMap((v) => v.npcs.map((n) => n.id))]);
  const placeIds = new Set([...(ALL.sisli_vadi?.rooms ?? []).map((r) => r.id), ...(world?.villages ?? []).map((v) => v.id), ...(ALL.sisli_vadi?.packs ?? []).map((p) => p.id)]);
  const qr = cc.checkQuests(QUESTS, { npcIds, knownEnemy: known ?? (() => undefined), hasItem: (id) => id in MATERIALS, dungeonIds: [...DUNGEON_IDS, ...OPEN_ZONE_IDS], placeIds });
  const e = qr.filter((i) => i.level === 'error'), w = qr.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== quests: ${e.length} errors, ${w.length} warns | ${QUESTS.length} quests`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
  const rq = regionQuestIssues(QUESTS, world, npcIds, ALL.sisli_vadi?.packs);
  const re = rq.filter((i) => i.level === 'error'), rw = rq.filter((i) => i.level === 'warn');
  totalErr += re.length;
  console.log(`\n== region quests: ${re.length} errors, ${rw.length} warns | ${QUESTS.filter(isRegionQuest).length} quests`);
  for (const line of regionCounts(QUESTS)) console.log(`   ${line}`);
  for (const i of re) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of rw) console.log('  warn', i.where, '-', i.msg);
}
if (!want.length || want.includes('town')) {
  const t = cc.checkTown(TOWN, models, DUNGEON_IDS, OPEN_ZONE_IDS);
  const e = t.issues.filter((i) => i.level === 'error'), w = t.issues.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== town: ${e.length} errors, ${w.length} warns | props ${t.stats.props} npcs ${t.stats.npcs} lights ${t.stats.lights} models ${t.stats.models}`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
}
console.log(`\nTOTAL ERRORS ${totalErr}`);
process.exit(totalErr ? 1 : 0);
