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
// every registered dungeon: the levelling set first, then the season dungeons (in DUNGEONS, not in DUNGEON_IDS)
const DUNGEON_ALL = [...new Set([...DUNGEON_IDS, ...Object.keys(DUNGEONS)])];
const ALL = { ...DUNGEONS, ...OPEN_ZONES };
const ALL_IDS = [...DUNGEON_ALL, ...OPEN_ZONE_IDS];
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

// ---- region quests (data/world/quests_extra.ts, ids sq_rN_* / dq_rN_*): the level band of their region and the spawn of their kill targets
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
function regionQuestIssues(quests, world, packs) {
  const out = [];
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const spawns = spawnIndex(world, packs);
  const band = new Map((world?.regions ?? []).map((r) => [r.id, r.levels]));
  for (const q of quests.filter(isRegionQuest)) {
    const where = `quest ${q.id}`;
    const [lo, hi] = band.get(q.region) ?? [1, 99];
    if (q.level < lo || q.level > hi) err(where, `level ${q.level} is outside the ${q.region} band ${lo}-${hi}`);
    for (const o of q.objectives) {
      const ow = `${where} [${o.kind} ${o.target ?? ''}]`;
      if ((o.kind === 'kill' || o.kind === 'metin') && o.target) {
        const at = spawns.get(o.target);
        if (at && at.size && !at.has(q.region)) warn(ow, `${o.target} spawns in ${[...at].join(', ')}, not in ${q.region}`);
      }
    }
  }
  return out;
}
/** The main chain (GDD_OPENWORLD §6.2) starts here; every other main quest must be reached from it through prerequisites. */
const MAIN_ROOT = 'mq_01_kuzgunun_cagrisi';
/**
 * Quest reachability, HARD errors on every quest (GDD_OPENWORLD §6, the runtime rules of systems/Quests.ts):
 *  - giver, turn-in and talk targets are NPCs of some town or village; a talk target is a quest NPC (role 'quest', or it offers
 *    quests) or a dialog NPC (ui.panel 'dialog'), never a plain merchant / guard / citizen;
 *  - a kill / metin / boss target spawns in a camp, patrol, rare, miniboss, metin stone or world boss; a kill, metin or boss
 *    target must spawn in a region whose level band holds the quest level (world bosses roam, so they need only a spawn);
 *  - a collect item has a source: a quest reward, a kill objective that spawns, the quest's region (packs), or any camp when the
 *    quest is region-less (sourceMatches);
 *  - prerequisites exist, do not step down in level, form no cycle, and every main quest is reached from MAIN_ROOT (mq_01);
 *  - unlocks that name a waypoint, an entrance or a dungeon must exist (an unregistered zone is only a warning);
 *  - an explore target is a region, waypoint, hidden area, vista or landmark id: the only ids the game emits (Quests.ts listens to
 *    world:regionEntered, waypoint:discovered and scenes/world/Discoveries.ts). Rooms and villages are never emitted.
 */
function questReachIssues(quests, world, npcIds, packs, dungeonIds, zoneIds, npcById) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const spawns = spawnIndex(world, packs);
  const offerers = new Set(quests.flatMap((q) => [q.giver, q.turnIn].filter(Boolean))); // NPCs that give or take in a quest
  const roomRegion = new Map((world?.regions ?? []).map((r) => [r.roomId, r.id]));
  const packRegions = new Set((packs ?? []).map((p) => roomRegion.get(p.roomId)).filter(Boolean));
  const bandOf = new Map((world?.regions ?? []).map((r) => [r.id, r.levels]));
  const inBand = (region, lvl) => { const b = bandOf.get(region); return !!b && lvl >= b[0] && lvl <= b[1]; };
  const byId = new Map(quests.map((q) => [q.id, q]));
  const rewardItems = new Set(quests.flatMap((q) => (q.reward?.items ?? []).map((i) => i.id)));
  const waypoints = new Set((world?.waypoints ?? []).map((w) => w.id));
  const entrances = new Set((world?.entrances ?? []).map((e) => e.id));
  // the only ids the game emits as `explore` events (see the header): region entry, waypoint discovery, Discoveries spots
  const explorePlaces = new Set([world?.regions, world?.waypoints, world?.hidden, world?.vistas, world?.landmarks]
    .flatMap((list) => (list ?? []).map((p) => p.id)));
  for (const q of quests) {
    const where = `quest ${q.id}`;
    if (!npcIds.has(q.giver)) err(where, `giver ${q.giver} is not an NPC in any town or village`);
    if (q.turnIn && !npcIds.has(q.turnIn)) err(where, `turn-in ${q.turnIn} is not an NPC in any town or village`);
    for (const p of q.prereq ?? []) {
      const pd = byId.get(p);
      if (!pd) err(where, `unknown prerequisite ${p}`);
      else if (q.level < pd.level) err(where, `level ${q.level} is below its prerequisite ${p} (${pd.level}): chain levels must not drop`);
    }
    const kills = q.objectives.filter((o) => o.kind === 'kill' || o.kind === 'metin' || o.kind === 'boss');
    for (const o of q.objectives) {
      const ow = `${where} [${o.kind} ${o.target ?? ''}]`;
      if (o.kind === 'talk' && !npcIds.has(o.target)) err(ow, `npc ${o.target} is not in any town or village`);
      if (o.kind === 'talk' && npcById.has(o.target)) {
        const n = npcById.get(o.target);
        const quest = n.role === 'quest' || offerers.has(n.id) || (n.quests?.length ?? 0) > 0;
        if (!quest && n.ui?.panel !== 'dialog') err(ow, `npc ${o.target} is a ${n.role} with no quest and no dialog panel: talk targets are quest or dialog NPCs`);
      }
      if (o.kind === 'explore' && !explorePlaces.has(o.target)) {
        err(ow, `${o.target} is no region, waypoint, hidden area, vista or landmark: the game emits explore only for those ids`);
      }
      if ((o.kind === 'kill' || o.kind === 'metin' || o.kind === 'boss') && o.target) {
        const regs = spawns.get(o.target);
        if (!regs) err(ow, `${o.target} spawns in no camp, patrol, rare, miniboss, metin stone or world boss`);
        else if (regs.size && ![...regs].some((r) => inBand(r, q.level))) {
          err(ow, `${o.target} spawns only in ${[...regs].map((r) => `${r} (${bandOf.get(r)?.join('-')})`).join(', ')}: no level band holds quest level ${q.level}`);
        }
      }
      if (o.kind === 'collect' && o.target) {
        let src;
        if (rewardItems.has(o.target)) src = 'reward';
        else if (kills.length) src = kills.some((k) => k.target && spawns.has(k.target)) ? 'kill' : undefined;
        else if (q.region) src = packRegions.has(q.region) ? 'region' : undefined;
        else src = (packs ?? []).length ? 'camp' : undefined;
        if (!src) err(ow, `${o.target} has no source: no quest reward, no spawning kill objective, no camp in ${q.region ?? 'the world'}`);
      }
    }
    for (const u of q.unlocks ?? []) {
      const uw = `${where} [unlock ${u}]`;
      if (u.startsWith('wp_')) { if (!waypoints.has(u)) err(uw, 'waypoint is not in the world'); }
      else if (u.startsWith('ent_')) { if (!entrances.has(u)) err(uw, 'entrance is not in the world'); }
      else if (u.startsWith('dungeon:')) { if (!dungeonIds.includes(u.slice('dungeon:'.length))) err(uw, 'dungeon is not registered'); }
      else if (!zoneIds.includes(u)) warn(uw, 'zone is not registered (skeleton map, not authored yet)');
    }
  }
  // prerequisite chains: a cycle is an error; the main chain must be reached from its first quest
  const state = new Map(); // 1 = on the current path, 2 = done
  const visit = (id, path) => {
    if (state.get(id) === 2 || !byId.has(id)) return;
    if (state.get(id) === 1) { err(`quest ${id}`, `prerequisite cycle: ${[...path, id].join(' -> ')}`); return; }
    state.set(id, 1);
    for (const p of byId.get(id).prereq ?? []) visit(p, [...path, id]);
    state.set(id, 2);
  };
  for (const q of quests) visit(q.id, []);
  const succ = new Map();
  for (const q of quests) for (const p of q.prereq ?? []) { if (!succ.has(p)) succ.set(p, []); succ.get(p).push(q.id); }
  const mains = quests.filter((q) => q.main);
  const first = byId.get(MAIN_ROOT); // the main chain is rooted at mq_01 by id, not by layout order
  if (!first) err('main chain', `${MAIN_ROOT} is missing: the main chain must start there`);
  else if (!first.main) err(`quest ${first.id}`, 'the main chain root must be a main quest');
  else if ((first.prereq ?? []).length) err(`quest ${first.id}`, 'the main chain must start here, without a prerequisite');
  else {
    const reach = new Set([first.id]);
    const stack = [first.id];
    while (stack.length) {
      const c = stack.pop();
      for (const n of succ.get(c) ?? []) if (!reach.has(n)) { reach.add(n); stack.push(n); }
    }
    for (const q of mains) if (!reach.has(q.id)) err(`quest ${q.id}`, `main quest is not reachable from ${first.id} through prerequisites`);
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

// registries for the season rules (P-29): ids resolve against the real data modules, not a copy
const { STATUSES } = await imp('src/data/statuses.ts');
const { DEVICES, PROFESSION_NAMES } = await imp('src/data/devices.ts');
const { UNIQUES } = await imp('src/data/uniques.ts');
const LOOT = await imp('src/data/loot.ts');
const { CLASS_IDS } = await imp('src/data/classes.ts');
const { hasProcModel } = await imp('src/ai/procModels.ts');
const { ENEMIES: ENEMY_DEFS, BOSSES: BOSS_DEFS } = await imp('src/data/enemies.ts');
const lootTables = { ...LOOT.LOOT_TABLES, ...LOOT.FARM_TABLES, ...LOOT.METIN_TABLES, ...LOOT.MINIBOSS_TABLES, ...LOOT.RARE_TABLES, ...LOOT.WORLD_BOSS_TABLES, ...LOOT.SEASON_LOOT_TABLES };
const reg = {
  statuses: new Set(Object.keys(STATUSES)),
  devices: DEVICES,
  uniques: new Set(Object.keys(UNIQUES)),
  lootTables,
  classes: new Set(CLASS_IDS),
  professions: new Set(Object.keys(PROFESSION_NAMES)),
  hasProc: hasProcModel,
  enemyDef: (eid) => ENEMY_DEFS[eid] ?? BOSS_DEFS[eid],
  bossIds: new Set(Object.keys(BOSS_DEFS)),
};

let totalErr = 0;
for (const id of ALL_IDS) {
  if (want.length && !want.includes(id)) continue;
  const rep = cc.checkDungeon(ALL[id], models, known, reg);
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
// open-world quests (GDD_OPENWORLD §6): givers, objectives, reward items; an NPC a quest names must stand in the town or a village
// NPC ids are keys (quest givers, turn-ins and talk targets resolve by id): HARD error on an id used twice in the town or any village
if (!want.length || want.includes('town') || want.includes('sisli_vadi')) {
  const owners = new Map();
  const own = (id, where) => { if (!owners.has(id)) owners.set(id, []); owners.get(id).push(where); };
  for (const n of TOWN.npcs) own(n.id, 'town');
  for (const [id, d] of Object.entries(ALL)) for (const v of d.world?.villages ?? []) for (const n of v.npcs) own(n.id, `${id}/${v.id}`);
  const dup = [...owners].filter(([, where]) => where.length > 1);
  const villages = Object.values(ALL).reduce((s, d) => s + (d.world?.villages?.length ?? 0), 0);
  totalErr += dup.length;
  console.log(`\n== npc ids: ${dup.length} errors | ${owners.size} NPCs in the town and ${villages} villages`);
  for (const [id, where] of dup) console.log('  ERR ', `npc ${id}`, '-', `duplicate id in ${where.join(', ')}`);
}
if (!want.length || want.includes('sisli_vadi') || want.includes('quests')) {
  const { QUESTS } = await imp('src/data/world/quests.ts');
  const { MATERIALS } = await imp('src/data/materials.ts');
  const world = ALL.sisli_vadi?.world;
  const npcIds = new Set([...TOWN.npcs.map((n) => n.id), ...(world?.villages ?? []).flatMap((v) => v.npcs.map((n) => n.id))]);
  const placeIds = new Set([...(ALL.sisli_vadi?.rooms ?? []).map((r) => r.id), ...(world?.villages ?? []).map((v) => v.id), ...(ALL.sisli_vadi?.packs ?? []).map((p) => p.id)]);
  const qr = cc.checkQuests(QUESTS, { npcIds, knownEnemy: known ?? (() => undefined), hasItem: (id) => id in MATERIALS, dungeonIds: [...DUNGEON_ALL, ...OPEN_ZONE_IDS], placeIds });
  const e = qr.filter((i) => i.level === 'error'), w = qr.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== quests: ${e.length} errors, ${w.length} warns | ${QUESTS.length} quests`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
  const rq = regionQuestIssues(QUESTS, world, ALL.sisli_vadi?.packs);
  const rw = rq.filter((i) => i.level === 'warn'), re = rq.filter((i) => i.level === 'error');
  totalErr += re.length;
  console.log(`\n== region quests: ${re.length} errors, ${rw.length} warns | ${QUESTS.filter(isRegionQuest).length} quests`);
  for (const line of regionCounts(QUESTS)) console.log(`   ${line}`);
  for (const i of re) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of rw) console.log('  warn', i.where, '-', i.msg);
  const npcById = new Map([...TOWN.npcs, ...(world?.villages ?? []).flatMap((v) => v.npcs)].map((n) => [n.id, n]));
  const xq = questReachIssues(QUESTS, world, npcIds, ALL.sisli_vadi?.packs, DUNGEON_ALL, OPEN_ZONE_IDS, npcById);
  const xe = xq.filter((i) => i.level === 'error'), xw = xq.filter((i) => i.level === 'warn');
  totalErr += xe.length;
  console.log(`\n== quest reachability: ${xe.length} errors, ${xw.length} warns | ${QUESTS.length} quests, ${spawnIndex(world, ALL.sisli_vadi?.packs).size} spawnable ids`);
  for (const i of xe) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of xw) console.log('  warn', i.where, '-', i.msg);
}
if (!want.length || want.includes('town')) {
  // season dungeons (DungeonDef.season / endgame) enter through the world (src/data/world/entrances.ts), not a town portal
  const portalDungeons = DUNGEON_ALL.filter((id) => !ALL[id].season && !ALL[id].endgame);
  const t = cc.checkTown(TOWN, models, portalDungeons, OPEN_ZONE_IDS);
  const e = t.issues.filter((i) => i.level === 'error'), w = t.issues.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== town: ${e.length} errors, ${w.length} warns | props ${t.stats.props} npcs ${t.stats.npcs} lights ${t.stats.lights} models ${t.stats.models}`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
}
console.log(`\nTOTAL ERRORS ${totalErr}`);
process.exit(totalErr ? 1 : 0);
