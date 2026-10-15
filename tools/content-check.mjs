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
// every open-world MAP (a def with `world`): quests, NPCs and spawns are checked against all of them together (Sisli Vadi + Karakır Bozkırı)
const WORLD_IDS = OPEN_ZONE_IDS.filter((id) => ALL[id]?.world);
const cat = (key) => WORLD_IDS.flatMap((id) => ALL[id].world[key] ?? []);
const ALL_WORLD = {
  regions: cat('regions'), villages: cat('villages'), waypoints: cat('waypoints'), entrances: cat('entrances'), hidden: cat('hidden'), vistas: cat('vistas'),
  landmarks: cat('landmarks'), minibosses: cat('minibosses'), rares: cat('rares'), bosses: cat('bosses'),
  metin: { tiers: WORLD_IDS.flatMap((id) => ALL[id].world.metin?.tiers ?? []), spots: [] },
};
const ALL_WORLD_PACKS = WORLD_IDS.flatMap((id) => ALL[id].packs);
const ALL_WORLD_ROOMS = WORLD_IDS.flatMap((id) => ALL[id].rooms);
// one slice per open-world map: its regions, places (regions, villages, camps and patrols), NPCs and spawnable enemy ids. A quest's
// objectives are checked against the map it belongs to (questZone), so a spawn in another map does not satisfy it.
const ZONES = WORLD_IDS.map((id) => {
  const w = ALL[id].world;
  const regions = new Set((w.regions ?? []).map((r) => r.id));
  // loot tables the map's content rolls: gathering nodes, camps (farm), mini-bosses, rares, metin stones, world bosses, chests
  const tables = new Set([...(w.gather ?? []), ...(w.minibosses ?? []), ...(w.rares ?? []), ...(w.bosses ?? []), ...(w.chests ?? []),
    ...(w.metin?.tiers ?? []), ...ALL[id].packs].map((x) => x?.lootTable).filter(Boolean));
  return {
    id, regions,
    places: new Set([...regions, ...(w.villages ?? []).map((v) => v.id), ...ALL[id].packs.map((p) => p.id)]),
    npcIds: new Set((w.villages ?? []).flatMap((v) => v.npcs.map((n) => n.id))),
    tables,
    world: w, packs: ALL[id].packs,
  };
});
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
/**
 * Kill-target bands (the quest area, WoW style). For every kill objective of a region quest (sq / dq, level q) whose enemy id spawns in
 * camps (rares, mini-bosses and bosses are placed by the level band rule in the reachability check):
 *  (1) the guide has a target: at least one camp or patrol spawning the id in the quest's region has a levelRange inside q-1..q+1;
 *  (2) the guide's camp, the in-band camp nearest to the quest giver's village (the guide starts the player there; the south gate
 *      when the giver is in town), stands 20 m or more clear ground (edge to edge) from every camp of the region whose lowest level is q+2 or more.
 * HARD error per objective (1) and (2).
 */
/** Edge-to-edge spacing (metres): centre distance less each camp's radius and the 8 m wander of its mobs. */
const WANDER_M = 8, TILE_M = 4;
const centreM = (a, b) => Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) * TILE_M;
const edgeM = (a, b) => centreM(a, b) - (a.radius ?? 8) - (b.radius ?? 8) - 2 * WANDER_M;
/** Severity of the edge-to-edge camp rules: hard errors on Sisli Vadi (r1 rings); other maps report warnings for now. */
const edgeSev = (zoneId) => (zoneId === 'sisli_vadi' ? 'error' : 'warn');
const KILL_BAND_M = 20, KILL_TILE_M = 4;
function killBandIssues(quests, zones) {
  const out = [];
  for (const q of quests.filter(isRegionQuest)) {
    const zone = zones.find((z) => z.regions.has(q.region));
    if (!zone) continue;
    const roomRegion = new Map((zone.world?.regions ?? []).map((r) => [r.roomId, r.id]));
    const inRegion = zone.packs.filter((p) => roomRegion.get(p.roomId) === q.region && p.center);
    const [bLo, bHi] = [q.level - 1, q.level + 1];
    const higher = inRegion.filter((p) => (p.levelRange ?? [1, 99])[0] >= q.level + 2);
    const gapM = (a, b) => edgeM(a, b);
    // the guide's start: the giver's village centre (tiles), or the map's south gate (200, 1) when the giver is in town
    const giverVillage = (zone.world?.villages ?? []).find((v) => v.npcs.some((n) => n.id === q.giver));
    const start = giverVillage ? giverVillage.center : [200, 1];
    for (const o of q.objectives.filter((x) => x.kind === 'kill' && x.target)) {
      const where = `quest ${q.id} [kill ${o.target}]`;
      const spawning = inRegion.filter((p) => p.members.some((m) => m.enemyId === o.target));
      if (!spawning.length) continue; // rare, mini-boss or boss: placed by level band (the reachability check)
      // in the band = the camp's levels overlap q-1..q+1 (camps span 2-3 levels, so a containment test would reject them all)
      const inBand = spawning.filter((p) => (p.levelRange ?? [1, 99])[0] <= bHi && (p.levelRange ?? [1, 99])[1] >= bLo);
      if (!inBand.length) {
        out.push({ level: 'error', where, msg: `no camp of ${o.target} in ${q.region} within the quest band L${bLo}-${bHi}` });
        continue;
      }
      const guide = inBand.reduce((best, c) => (Math.hypot(c.center[0] - start[0], c.center[1] - start[1]) < Math.hypot(best.center[0] - start[0], best.center[1] - start[1]) ? c : best));
      const near = higher.find((h) => h !== guide && gapM(guide, h) < KILL_BAND_M);
      if (near) {
        out.push({ level: zone.id === 'sisli_vadi' && q.region === 'r1' ? 'error' : 'warn', where, msg: `guide camp ${guide.id} (L${guide.levelRange[0]}-${guide.levelRange[1]}) is ${Math.round(gapM(guide, near))} m clear of ${near.id} (L${near.levelRange[0]}+): keep ${KILL_BAND_M} m edge to edge` });
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
 *  - EVERY objective has a reachable source in the map of its quest (questZone: the map of its region, place or giver), so a
 *    spawn in another map does not count:
 *      kill / metin / boss / skill / elite: the target spawns in a camp, patrol, rare, miniboss, metin stone or world boss of that map,
 *        in a region whose level band holds the quest level (world bosses roam: a spawn is enough);
 *      drop: one of its `from` enemies or families spawns in band (the others are warnings);
 *      collect: a quest reward, a drop objective of the same quest, a `from` list with a member that spawns in band (rolled as
 *        QuestSystem.rollDrops does), a kill objective that spawns (the sourceMatches rule), or a loot table that a map roll uses lists
 *        the item (gathering nodes: ore_* / herb_*). A region alone is no source;
 *      use: its item is a start item, a reward or a drop target; interact / use: the prop kind is one scenes/world/WorldQuestProps.ts
 *        places (qo_sack, qo_crystal, qo_banner, qt_*) in the quest region (placed at run time, so it is checked by kind and region);
 *      escort: the quest region is a region of a map (the escort path is built from it at run time);
 *      talk / turn-in: an NPC of the town or a village; explore: an id the game emits (see above);
 *  - prerequisites exist, do not step down in level, form no cycle, and every main quest is reached from MAIN_ROOT (mq_01);
 *  - unlocks that name a waypoint, an entrance or a dungeon must exist (an unregistered zone is only a warning);
 *  - an explore target is a region, waypoint, hidden area, vista or landmark id: the only ids the game emits (Quests.ts listens to
 *    world:regionEntered, waypoint:discovered and scenes/world/Discoveries.ts). Rooms and villages are never emitted.
 */
function questReachIssues(quests, world, npcIds, packs, dungeonIds, zoneIds, npcById, zones, familyOf, lootTables) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const KILL_KINDS = new Set(['kill', 'boss', 'metin', 'elite']); // the kinds QuestSystem.onKill counts (and collect drops follow)
  const spawnsAll = spawnIndex(world, packs);
  // each map's spawns (ZONES): a quest is checked against the map of its region, place or giver
  for (const z of zones) z.spawns = spawnIndex(z.world, z.packs);
  const zoneOf = (q) => zones.find((z) => (q.region && z.regions.has(q.region)) || (q.place && z.places.has(q.place)) || z.npcIds.has(q.giver)) ?? null;
  const zoneRegions = new Set(zones.flatMap((z) => [...z.regions]));
  const allTables = new Set(zones.flatMap((z) => [...z.tables]));
  /** a loot table the map rolls lists the item (gathering nodes yield ore_* / herb_* this way) */
  const tableYields = (zone, item) => [...(zone ? zone.tables : allTables)].some((t) => lootTables[t] && JSON.stringify(lootTables[t]).includes(`"${item}"`));
  const offerers = new Set(quests.flatMap((q) => [q.giver, q.turnIn].filter(Boolean))); // NPCs that give or take in a quest
  const bandOf = new Map((world?.regions ?? []).map((r) => [r.id, r.levels]));
  const allDropTargets = new Set(quests.flatMap((q) => q.objectives.filter((o) => o.kind === 'drop' && o.target).map((o) => o.target)));
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
    // the map of this quest and its spawns; a target that spawns only in another map is an error (the bot cannot reach it here)
    const zone = zoneOf(q);
    const spawns = zone ? zone.spawns : spawnsAll;
    const at = zone ? `map ${zone.id}` : 'any map';
    /** kill-type target: spawns in this map, in a region whose level band holds the quest level (world bosses roam: a spawn is enough). */
    const needSpawn = (ow, id, lvl) => {
      const regs = spawns.get(id);
      if (!regs) {
        err(ow, `${id} spawns in no camp, patrol, rare, miniboss, metin stone or world boss of ${at}${spawnsAll.has(id) ? ' (it spawns in another map)' : ''}`);
        return;
      }
      if (regs.size && ![...regs].some((r) => inBand(r, lvl))) {
        err(ow, `${id} spawns only in ${[...regs].map((r) => `${r} (${bandOf.get(r)?.join('-')})`).join(', ')}: no level band holds quest level ${lvl}`);
      }
    };
    /** a `from` entry (enemy id or family) with a member that spawns in this map within the quest's level band */
    const fromSpawns = (f, lvl) => [...spawns.keys()].some((id) => {
      if (id !== f && familyOf(id) !== f) return false;
      const r = spawns.get(id);
      return !r.size || [...r].some((g) => inBand(g, lvl));
    });
    const kills = q.objectives.filter((o) => KILL_KINDS.has(o.kind));
    const dropTargets = new Set(q.objectives.filter((o) => o.kind === 'drop' && o.target).map((o) => o.target));
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
      // kill-type targets: the enemy must stand in this map (skill: the caster that the player interrupts; elite: a named rare)
      if ((o.kind === 'kill' || o.kind === 'metin' || o.kind === 'boss' || o.kind === 'skill' || o.kind === 'elite') && o.target && o.target !== 'interrupt') {
        needSpawn(ow, o.target, q.level);
      }
      // drop: `from` names the enemies / families the item rolls from; one of them must spawn in band (QuestSystem.rollDrops)
      // drop / collect with `from`: the listed enemies or families roll the item (QuestSystem.rollDrops); one must spawn in band
      if ((o.kind === 'drop' || o.kind === 'collect') && o.from?.length) {
        const usable = o.from.filter((f) => fromSpawns(f, q.level));
        if (o.kind === 'drop' && !usable.length) err(ow, `no drop source: none of ${o.from.join(', ')} spawns in ${at} within level ${q.level}`);
        for (const f of o.from.filter((x) => !usable.includes(x))) warn(ow, `${f} does not spawn in ${at} within level ${q.level}`);
      }
      if (o.kind === 'drop' && !(o.from?.length)) err(ow, 'drop has no source: `from` lists no enemy or family');
      // collect: a quest reward, a drop objective of this quest, a `from` source in band, a kill objective of this quest whose target
      // spawns in this map (the QuestSystem.sourceMatches rule), or a loot table the map rolls. A region alone is no source.
      if (o.kind === 'collect' && o.target) {
        const src = rewardItems.has(o.target) ? 'reward' : dropTargets.has(o.target) ? 'drop'
          : (o.from ?? []).some((f) => fromSpawns(f, q.level)) ? 'from'
          : kills.some((k) => k.target && spawns.has(k.target)) ? 'kill' : tableYields(zone, o.target) ? 'table' : undefined;
        if (!src) err(ow, `${o.target} has no source: no quest reward, no drop objective of this quest, no listed source or kill objective that spawns in ${at}, no loot table of ${at} lists it`);
      }
      // interact / use: a prop the scenes place in the quest's region (scenes/world/WorldQuestProps.ts questPropSpots)
      if (o.kind === 'interact' || o.kind === 'use') {
        if (!/^(qo_(sack|crystal|banner)|qt_)/.test(o.target ?? '')) err(ow, `${o.target} is no quest prop (qo_sack, qo_crystal, qo_banner or qt_*)`);
        if (!q.region || !zoneRegions.has(q.region)) err(ow, 'the prop is placed in the quest region, which is no region of a map');
      }
      if (o.kind === 'use' && o.item) {
        const has = (q.startItems ?? []).some((i) => i.id === o.item) || rewardItems.has(o.item) || allDropTargets.has(o.item);
        if (!has) err(ow, `quest item ${o.item} has no source: no start item, no reward, no drop objective`);
      }
      // escort: the escorted NPC walks the quest region (scenes/world/WorldQuestProps.ts escortPath)
      if (o.kind === 'escort' && (!q.region || !zoneRegions.has(q.region))) err(ow, 'escort walks the quest region, which is no region of a map');
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

/**
 * Starting-zone camp rings (Sisli Koru, r1, WoW-style). Camps and patrols are tile centres (1 tile = 4 m). A quest camp is a camp whose
 * lowest level is 1 or 2. Errors: (1) no camp or patrol of the region whose lowest level is 2 or more above a quest camp stands within
 * 20 m clear ground of it (edge to edge: centre distance less both radii and 8 m of wander per camp); (2) quest camps keep 25 m apart
 * centre to centre (the inner ring of level 1-2 camps).
 */
function campRingIssues(packs, roomId, sev = 'error') {
  const out = [];
  const err = (where, msg) => out.push({ level: sev, where, msg });
  const RING_M = 20, INNER_M = 25;
  const camps = (packs ?? []).filter((p) => p.roomId === roomId && p.center);
  const quest = camps.filter((p) => p.levelRange[0] <= 2);
  const gap = (a, b) => Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) * TILE_M;
  for (const a of quest) {
    for (const c of camps) {
      if (c === a) continue;
      const m = edgeM(a, c);
      if (m < RING_M && c.levelRange[0] >= a.levelRange[0] + 2) {
        err(`camp ${c.id}`, `level ${c.levelRange[0]}+ camp ${Math.round(m)} m clear of quest camp ${a.id} (level ${a.levelRange[0]}): keep 20 m edge to edge`);
      }
    }
  }
  for (let i = 0; i < quest.length; i++) {
    for (let j = i + 1; j < quest.length; j++) {
      const m = gap(quest[i], quest[j]);
      if (m < INNER_M) err(`camp ${quest[j].id}`, `quest camp ${Math.round(m)} m from ${quest[i].id}: level 1-2 camps keep 25 m apart`);
    }
  }
  return out;
}
/**
 * Starting-ring density and quest areas (Sisli Vadi r1, WoW spacing). Mob counts are the expanded camp members (patrols count
 * as camps with a centre). HARD errors:
 *  (1) density: a camp centre of level 1-3 has at most 6 mobs within 25 m (every camp centre within 25 m counts, itself included);
 *  (2) a level 3+ camp keeps 25 m clear of every level 1-2 camp (the L1-2 quest area of the starting ring);
 *  (3) quest-target areas: a quest of level q <= 3 has target camps (camps spawning its kill / drop targets, band overlapping
 *      q-1..q+1). A camp within 25 m of a target camp holds levels q-1..q+1 only; a camp 2+ levels above q keeps 40 m from every
 *      target camp;
 *  (4) a side quest placed at a camp (layout quests.side `place`, level <= 3): its kill / drop targets that spawn within 60 m of
 *      the place stand in camps of its own level and the next one (the Kurt Tehlikesi wolves sit in the L2-3 band).
 *  (5) L1-3 quest areas: a target camp of level 1-3 keeps 30 m from every camp of a higher level (the L2 slime camps of mq_03 stood
 *      1-17 m from L3 goblins); a higher camp that spawns no target still counts.
 * Returns the issues plus the max mobs-within-25-m per band (info line).
 */
function ringDensityIssues(packs, roomId, quests, sideQuests) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const R = 25, OUTER = 20, PLACE = 60, HIGHER = 15;
  const camps = (packs ?? []).filter((p) => p.roomId === roomId && p.center);
  const xy = (p) => [p.center[0] * TILE_M, p.center[1] * TILE_M];
  const gap = (a, b) => { const [ax, az] = xy(a), [bx, bz] = xy(b); return Math.hypot(ax - bx, az - bz); };
  const mobs = (p) => p.members.length;
  const lo = (p) => p.levelRange[0], hi = (p) => p.levelRange[1];
  const spot = (a) => camps.filter((b) => gap(a, b) <= R).reduce((s, b) => s + mobs(b), 0);
  const band = new Map([['L1-2', 0], ['L3', 0], ['L4-5', 0]]);
  for (const a of camps) {
    const s = spot(a);
    const key = lo(a) <= 2 ? 'L1-2' : lo(a) === 3 ? 'L3' : 'L4-5';
    band.set(key, Math.max(band.get(key), s));
    if (lo(a) <= 3 && s > 6) err(`camp ${a.id}`, `${s} mobs within ${R} m (at most 6 in the L1-3 rings)`);
  }
  for (const c of camps.filter((c) => lo(c) >= 3)) {
    for (const q of camps.filter((q) => hi(q) <= 2)) {
      if (gap(c, q) < R) { err(`camp ${c.id}`, `level ${lo(c)} camp ${Math.round(gap(c, q))} m from level 1-2 camp ${q.id}: keep ${R} m clear of the quest area`); break; }
    }
  }
  // (5) every L1-3 camp keeps 15 m clear ground (edge to edge) to every camp of a higher level (the L2 slime camps of mq_03 stood 1-17 m from L3 goblins)
  for (const a of camps.filter((c) => lo(c) <= 3)) {
    for (const c of camps) {
      if (c === a || lo(c) <= lo(a)) continue;
      const m = edgeM(a, c);
      if (m < HIGHER) err(`camp ${a.id}`, `level ${lo(a)} camp ${a.id} is ${Math.round(m)} m clear of level ${lo(c)} camp ${c.id}: keep ${HIGHER} m edge to edge`);
    }
  }
  for (const q of quests) {
    if (q.level > 3) continue;
    const tids = new Set(q.objectives.filter((o) => o.kind === 'kill' || o.kind === 'metin').map((o) => o.target).filter(Boolean));
    for (const o of q.objectives) if (o.kind === 'drop' || (o.kind === 'collect' && o.from?.length)) for (const f of o.from ?? []) tids.add(f);
    if (!tids.size) continue;
    const T = camps.filter((c) => c.members.some((m) => tids.has(m.enemyId)) && hi(c) >= q.level - 1 && lo(c) <= q.level + 1);
    if (!T.length) continue;
    for (const c of camps) {
      if (T.includes(c)) continue;
      const nearT = T.some((t) => gap(c, t) < R);
      if (nearT && (lo(c) < q.level - 1 || hi(c) > q.level + 1)) err(`quest ${q.id}`, `camp ${c.id} (L${lo(c)}-${hi(c)}) inside its target area: only levels ${q.level - 1}-${q.level + 1}`);
      else if (lo(c) >= q.level + 2 && T.some((t) => edgeM(c, t) < OUTER)) err(`quest ${q.id}`, `camp ${c.id} (L${lo(c)}-${hi(c)}) is ${Math.round(Math.min(...T.map((t) => edgeM(c, t))))} m clear of a target camp: keep ${OUTER} m edge to edge`);
    }
  }
  for (const sq of sideQuests ?? []) {
    const q = quests.find((x) => x.id === sq.id);
    const place = camps.find((c) => c.id === sq.place);
    if (!q || !place || q.level > 3) continue;
    const tids = new Set(q.objectives.filter((o) => o.kind === 'kill' || o.kind === 'metin').map((o) => o.target).filter(Boolean));
    for (const o of q.objectives) if (o.kind === 'drop' || (o.kind === 'collect' && o.from?.length)) for (const f of o.from ?? []) tids.add(f);
    const near = camps.filter((c) => gap(c, place) <= PLACE && c.members.some((m) => tids.has(m.enemyId)));
    if (!near.length) { err(`quest ${sq.id}`, `no target camp within ${PLACE} m of ${sq.place}`); continue; }
    for (const c of near) if (lo(c) < q.level || hi(c) > q.level + 1) err(`quest ${sq.id}`, `target camp ${c.id} (L${lo(c)}-${hi(c)}) is outside the L${q.level}-${q.level + 1} band of ${sq.place}`);
  }
  return { issues: out, band };
}
/**
 * Sisli r1 quest placement (WoW quest hubs). Scope: quests of level 1-5 in region r1 (region r1 or a place of r1). HARD errors:
 *  (A) objective distance: every kill / boss / elite / metin / drop / collect-from objective has a spawn within 150 m (centre to centre)
 *      of the quest's giver or turn-in NPC. The spawn is the nearest one of its target that stands in the quest's level band (q-1..q+1):
 *      a camp or patrol (members), a rare (spots), a mini-boss (lair) or, for metin, a metin spot of r1. A side quest's place camp
 *      (layout `place`) must be within 150 m too. Interact / use props and explores are measured by r1PropIssues; escort routes by escortRouteIssues.
 *  (B) side quests of level 1-3 placed at a camp: that camp has at most 4 mobs within 25 m (itself included).
 *  (C) no side quest repeats the objective kind + target of a main quest of its own level (the main quest the player is on at that level).
 */
const PLACE_GIVER_M = 150, PLACE_L13_MOBS = 4;
function r1PlacementIssues(quests, world, roomId, packs) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const camps = (packs ?? []).filter((p) => p.roomId === roomId && p.center);
  const xy = (x, z) => [x * TILE_M, z * TILE_M];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const npcAt = new Map();
  for (const v of world.villages ?? []) for (const n of v.npcs ?? []) npcAt.set(n.id, [(v.center[0] + 0.5) * TILE_M + n.pos[0], (v.center[1] + 0.5) * TILE_M + n.pos[2]]);
  // spawns of the zone: id, centre (m), level band, enemy ids it holds
  const spawns = camps.map((c) => ({ id: c.id, at: xy(c.center[0], c.center[1]), lo: c.levelRange[0], hi: c.levelRange[1], enemies: new Set(c.members.map((m) => m.enemyId)) }));
  for (const r of world.rares ?? []) for (const s of r.spots ?? []) spawns.push({ id: `${r.id}`, at: xy(s[0], s[1]), lo: r.level, hi: r.level, enemies: new Set([r.enemyId]) });
  for (const m of world.minibosses ?? []) if (m.lair) spawns.push({ id: m.id, at: xy(m.lair[0], m.lair[1]), lo: m.level, hi: m.level, enemies: new Set([m.enemyId]) });
  const metinSpots = (world.metin?.spots ?? []).filter((s) => s.regionId === 'r1').map((s) => ({ id: s.id, at: xy(s.pos[0], s.pos[1]) }));
  const mobsWithin = (c, R = 25) => camps.filter((o) => dist(xy(o.center[0], o.center[1]), xy(c.center[0], c.center[1])) <= R).reduce((s, o) => s + o.members.length, 0);
  const inScope = (q) => q.level <= 5 && (q.region === 'r1' || /^r1_/.test(q.place ?? ''));
  const mains = quests.filter((q) => q.main);
  for (const q of quests.filter(inScope)) {
    const where = `quest ${q.id}`;
    const anchors = [q.giver, q.turnIn].filter(Boolean).map((id) => npcAt.get(id)).filter(Boolean);
    const from = (d) => Math.min(...anchors.map((a) => dist(a, d)));
    // (C) a side quest may not repeat a main quest's objective of its own level
    if (!q.main) {
      for (const o of q.objectives) {
        if (!o.target) continue;
        const dup = mains.find((m) => m.level === q.level && m.objectives.some((mo) => mo.kind === o.kind && mo.target === o.target));
        if (dup) err(where, `objective ${o.kind} ${o.target} repeats the main quest ${dup.id} of level ${q.level}: pick another objective type`);
      }
    }
    // (A) every spawn-bound objective has a spawn within PLACE_GIVER_M of the giver or turn-in
    for (const o of q.objectives) {
      const ids = new Set([o.target, ...(o.from ?? [])].filter(Boolean));
      let cands;
      if (o.kind === 'metin') cands = metinSpots;
      else if (['kill', 'boss', 'elite', 'drop', 'collect'].includes(o.kind)) {
        if (o.kind === 'collect' && !o.from?.length) continue; // collect without a source is checked by the reachability rules
        cands = spawns.filter((s) => [...ids].some((id) => s.enemies.has(id)) && s.hi >= q.level - 1 && s.lo <= q.level + 1);
      } else continue;
      if (!anchors.length) continue;
      if (!cands.length) { err(where, `${o.kind} ${o.target ?? ''}: no spawn in the L${q.level - 1}-${q.level + 1} band of r1`); continue; }
      const d = Math.min(...cands.map((c) => from(c.at)));
      if (d > PLACE_GIVER_M) err(where, `${o.kind} ${o.target ?? ''}: nearest in-band spawn is ${Math.round(d)} m from the giver or turn-in (max ${PLACE_GIVER_M} m)`);
    }
    // (A) and (B) for the side quest's place camp
    const place = q.place ? camps.find((c) => c.id === q.place) : null;
    if (place && !q.main) {
      if (anchors.length) {
        const d = from(xy(place.center[0], place.center[1]));
        if (d > PLACE_GIVER_M) err(where, `place ${place.id} is ${Math.round(d)} m from the giver or turn-in (max ${PLACE_GIVER_M} m)`);
      }
      if (q.level <= 3) {
        const n = mobsWithin(place);
        if (n > PLACE_L13_MOBS) err(where, `place ${place.id} has ${n} mobs within 25 m (at most ${PLACE_L13_MOBS} for levels 1-3)`);
      }
    }
  }
  return { issues: out, checked: quests.filter(inScope).length };
}
/**
 * Starting-zone ring bands (Sisli Vadi r1, WoW-style). The rings are centred on the starting village (layout settlement koy_gumusdere)
 * and measured by centre distance in metres: inner (level 1-2) up to RING_INNER_M, middle (level 3) up to RING_MIDDLE_M, outer (level 4-5)
 * beyond. The bounds sit in the gaps of the 7ef67e2 layout (inner camps end at 127 m, middle camps run 137-184 m, outer camps start at
 * 205 m). HARD errors:
 *  (6) every camp and patrol of r1 has a level range inside the band of its ring;
 *  (7) a level 4+ camp that spawns ow_slime keeps SLIME_AREA_M (60 m) centre to centre from every level 1-2 camp that spawns ow_slime
 *      (the L2 slime quest area of mq_03).
 */
const RING_INNER_M = 132, RING_MIDDLE_M = 195, SLIME_AREA_M = 60;
const RING_BAND = { inner: [1, 2], middle: [3, 3], outer: [4, 5] };
function ringBandIssues(packs, roomId, hub) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const camps = (packs ?? []).filter((p) => p.roomId === roomId && p.center);
  const slime = (p) => p.members.some((m) => m.enemyId === 'ow_slime');
  for (const p of camps) {
    const d = Math.hypot(p.center[0] - hub[0], p.center[1] - hub[1]) * TILE_M;
    const ring = d <= RING_INNER_M ? 'inner' : d <= RING_MIDDLE_M ? 'middle' : 'outer';
    const [lo, hi] = RING_BAND[ring];
    const [plo, phi] = p.levelRange;
    if (plo < lo || phi > hi) err(`camp ${p.id}`, `${Math.round(d)} m from the village is in the ${ring} ring (levels ${lo}-${hi}), but the camp is levels ${plo}-${phi}`);
  }
  const questSlime = camps.filter((p) => p.levelRange[1] <= 2 && slime(p));
  for (const c of camps.filter((p) => p.levelRange[0] >= 4 && slime(p))) {
    const q = questSlime.find((a) => centreM(a, c) < SLIME_AREA_M);
    if (q) err(`camp ${c.id}`, `levels ${c.levelRange[0]}-${c.levelRange[1]} slime camp ${Math.round(centreM(q, c))} m from the level 1-2 slime quest camp ${q.id}: keep ${SLIME_AREA_M} m`);
  }
  return out;
}
/**
 * Sisli r1 prop and explore placement (WoW quest hubs), quests of level 1-5 (scope of r1PlacementIssues). HARD errors:
 *  (P1) every interact / use objective has its hand-placed spots (data/world/quest_prop_spots.ts QUEST_PROP_SPOTS): one tile per spot,
 *       interact count + 1, use 1, and no other spot (the runtime places exactly these, scenes/world/WorldQuestProps.ts questPropSpots);
 *  (P2) every spot lies in the r1 room and snaps to ground the map start reaches (the prop reachability rule);
 *  (P3) every spot is within PLACE_GIVER_M of the quest's giver or turn-in NPC;
 *  (P4) every spot is in the quest's ring band: its ring (hub koy_gumusdere, inner / middle / outer as RING_BAND) holds a level within 1
 *       of the quest level (the same band as the spawn rule of the camps);
 *  (E)  an explore objective with a point (hidden area, vista, waypoint, landmark) is within PLACE_GIVER_M of the giver or turn-in and in
 *       the quest's ring band; a region target is measured to its nearest edge.
 */
function r1PropIssues(quests, world, rooms, reach, hub, table) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rectOfRegion = new Map((world.regions ?? []).map((r) => [r.id, rooms.find((x) => x.id === r.roomId)?.rect]).filter(([, rc]) => rc));
  const r1Rect = rectOfRegion.get('r1');
  if (!r1Rect) throw new Error('region r1 has no room in the map');
  const hubM = [hub[0] * TILE_M, hub[1] * TILE_M];
  const ringAt = (p) => { const d = dist(p, hubM); return d <= RING_INNER_M ? 'inner' : d <= RING_MIDDLE_M ? 'middle' : 'outer'; };
  const ringOk = (ring, q) => { const [lo, hi] = RING_BAND[ring]; return hi >= q - 1 && lo <= q + 1; };
  const inRect = (tx, tz) => tx >= r1Rect.x && tx < r1Rect.x + r1Rect.w && tz >= r1Rect.z && tz < r1Rect.z + r1Rect.h;
  const npcAt = new Map();
  for (const v of world.villages ?? []) for (const n of v.npcs ?? []) npcAt.set(n.id, [(v.center[0] + 0.5) * TILE_M + n.pos[0], (v.center[1] + 0.5) * TILE_M + n.pos[2]]);
  const pointOf = new Map([...(world.hidden ?? []), ...(world.vistas ?? []), ...(world.landmarks ?? []), ...(world.waypoints ?? [])]
    .map((p) => [p.id, [(p.pos[0] + 0.5) * TILE_M, (p.pos[1] + 0.5) * TILE_M]]));
  let spots = 0, objectives = 0, explores = 0;
  for (const q of quests.filter((x) => x.level <= 5 && (x.region === 'r1' || /^r1_/.test(x.place ?? '')))) {
    const where = `quest ${q.id}`;
    const anchors = [q.giver, q.turnIn].filter(Boolean).map((id) => npcAt.get(id)).filter(Boolean);
    const nearAnchor = (p) => Math.min(...anchors.map((a) => dist(a, p)));
    for (const o of q.objectives) {
      const ow = `${where} [${o.kind} ${o.target ?? ''}]`;
      if ((o.kind === 'interact' || o.kind === 'use') && o.target && q.region === 'r1') {
        objectives++;
        const want = o.kind === 'interact' ? o.count + 1 : 1;
        const tiles = table[q.id]?.[o.target];
        if (!tiles) { err(ow, 'no hand-placed spots in data/world/quest_prop_spots.ts'); continue; }
        if (tiles.length !== want) err(ow, `${tiles.length} spots placed, the objective needs ${want}`);
        if (!anchors.length) err(ow, 'the quest has no giver or turn-in NPC in a village to measure from');
        tiles.forEach(([tx, tz], i) => {
          const sw = `${ow} [spot ${i}]`;
          spots++;
          if (!inRect(tx, tz)) { err(sw, `tile ${tx},${tz} is outside the r1 room`); return; }
          const s = reach.snap((tx + 0.5) * TILE_M, (tz + 0.5) * TILE_M, 8);
          if (!s || !reach.reachable(s.x, s.z)) { err(sw, `tile ${tx},${tz} snaps to no ground the map start reaches`); return; }
          const p = [s.x, s.z];
          const d = nearAnchor(p);
          if (d > PLACE_GIVER_M) err(sw, `${Math.round(d)} m from the giver or turn-in (max ${PLACE_GIVER_M} m)`);
          const ring = ringAt(p);
          if (!ringOk(ring, q.level)) err(sw, `the ${ring} ring (levels ${RING_BAND[ring].join('-')}) holds no level of L${q.level - 1}-${q.level + 1}`);
        });
      }
      if (o.kind === 'explore' && o.target) {
        explores++;
        if (pointOf.has(o.target)) {
          const p = pointOf.get(o.target);
          const d = nearAnchor(p);
          if (d > PLACE_GIVER_M) err(ow, `${Math.round(d)} m from the giver or turn-in (max ${PLACE_GIVER_M} m)`);
          const ring = ringAt(p);
          if (!ringOk(ring, q.level)) err(ow, `the ${ring} ring (levels ${RING_BAND[ring].join('-')}) holds no level of L${q.level - 1}-${q.level + 1}`);
        } else if (rectOfRegion.has(o.target)) {
          const rc = rectOfRegion.get(o.target);
          const [rx0, rz0] = [rc.x * TILE_M, rc.z * TILE_M];
          const [rx1, rz1] = [(rc.x + rc.w) * TILE_M, (rc.z + rc.h) * TILE_M];
          const edge = (a) => Math.hypot(Math.max(rx0 - a[0], 0, a[0] - rx1), Math.max(rz0 - a[1], 0, a[1] - rz1));
          const d = Math.min(...anchors.map(edge));
          if (d > PLACE_GIVER_M) err(ow, `region ${o.target} is ${Math.round(d)} m from the giver or turn-in (max ${PLACE_GIVER_M} m)`);
        }
      }
    }
  }
  return { issues: out, spots, objectives, explores };
}
/**
 * Escort routes (data/world/escort_routes.ts, WoW escort rules; Sisli Vadi r1, world metres, the hub is the ring centre). HARD errors:
 *  (1) every escort objective of an r1 quest has a route, and every route belongs to a quest with an escort objective;
 *  (2) every waypoint is in the quest's level ring (level 1-2 inside RING_INNER_M of the hub, level 3 inside RING_MIDDLE_M, level 4-5 beyond);
 *  (3) the route is at most ESCORT_MAX_M (180 m) long in total;
 *  (4) the route never passes within ESCORT_CLEAR_M (25 m) edge to edge of a camp or patrol whose lowest level is the quest's level + 2 or more
 *      (edge = segment distance less the camp radius and 8 m of wander);
 *  (5) the triggers are waypoints after the start, a wave holds 1-2 ambushers and the escort NPC has HP.
 */
const ESCORT_MAX_M = 180, ESCORT_CLEAR_M = 25;
const ringAt = (d) => (d <= RING_INNER_M ? 'inner' : d <= RING_MIDDLE_M ? 'middle' : 'outer');
const ringForLevel = (lv) => (lv <= 2 ? 'inner' : lv === 3 ? 'middle' : 'outer');
function segDistM(p, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const l2 = abx * abx + abz * abz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2)) : 0;
  return Math.hypot(a[0] + abx * t - p[0], a[1] + abz * t - p[1]);
}
function escortRouteIssues(routes, quests, packs, roomId, hub) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const hubM = [hub[0] * TILE_M, hub[1] * TILE_M];
  const camps = (packs ?? []).filter((p) => p.roomId === roomId && p.center).map((p) => ({ id: p.id, at: [p.center[0] * TILE_M, p.center[1] * TILE_M], lo: p.levelRange[0], r: p.radius ?? 8 }));
  const escortQuests = quests.filter((q) => q.region === 'r1' && q.objectives.some((o) => o.kind === 'escort'));
  for (const q of escortQuests) if (!routes[q.id]) err(`quest ${q.id}`, 'escort objective has no route in data/world/escort_routes.ts');
  let maxLen = 0, minClear = Infinity;
  for (const r of Object.values(routes)) {
    const where = `escort ${r.quest}`;
    const q = quests.find((x) => x.id === r.quest);
    if (!q || !q.objectives.some((o) => o.kind === 'escort')) { err(where, 'route of a quest without an escort objective'); continue; }
    const want = ringForLevel(q.level);
    r.route.forEach((p, i) => {
      const d = Math.hypot(p[0] - hubM[0], p[1] - hubM[1]);
      if (ringAt(d) !== want) err(`${where} [waypoint ${i}]`, `${Math.round(d)} m from the hub: outside the ${want} ring of level ${q.level}`);
    });
    let len = 0;
    for (let i = 1; i < r.route.length; i++) len += Math.hypot(r.route[i][0] - r.route[i - 1][0], r.route[i][1] - r.route[i - 1][1]);
    maxLen = Math.max(maxLen, len);
    if (len > ESCORT_MAX_M) err(where, `route ${Math.round(len)} m long (max ${ESCORT_MAX_M} m)`);
    for (const c of camps.filter((c) => c.lo >= q.level + 2)) {
      for (let i = 1; i < r.route.length; i++) {
        const m = segDistM(c.at, r.route[i - 1], r.route[i]) - c.r - WANDER_M;
        minClear = Math.min(minClear, m);
        if (m < ESCORT_CLEAR_M) err(`${where} [segment ${i}]`, `${Math.round(m)} m edge clearance from camp ${c.id} (level ${c.lo}+): keep ${ESCORT_CLEAR_M} m`);
      }
    }
    for (const t of r.triggers) if (!Number.isInteger(t) || t < 1 || t >= r.route.length) err(where, `trigger ${t} is not a waypoint after the start`);
    if (!(r.waveSize >= 1 && r.waveSize <= 2)) err(where, `wave size ${r.waveSize}: 1-2 ambushers per wave`);
    if (!(r.hp > 0)) err(where, 'escort NPC has no HP');
  }
  return { issues: out, routes: Object.keys(routes).length, maxLen, minClear: Number.isFinite(minClear) ? minClear : null };
}

/**
 * Escort routes on the nav mask (dev/contentCheck navReach, the headless stand-in for NavGrid.findPath; WorldQuestProps.escortRoute at
 * load). HARD errors: every waypoint snaps to walkable ground within 6 m; every segment between two waypoints has a nav path (the escort
 * walks it, a segment without one would stall the escort); the nav path of the whole route is at most ESCORT_MAX_M long.
 */
function escortNavIssues(routes, reach) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  let maxLen = 0;
  for (const r of Object.values(routes)) {
    const where = `escort ${r.quest}`;
    const wps = r.route.map(([x, z]) => reach.snap(x, z, 6));
    let bad = false;
    wps.forEach((p, i) => {
      if (!p) { bad = true; err(`${where} [waypoint ${i}]`, `no walkable ground within 6 m of ${r.route[i][0]}, ${r.route[i][1]}`); }
    });
    if (bad) continue;
    let total = 0;
    for (let i = 1; i < wps.length; i++) {
      const path = reach.navPath(wps[i - 1], wps[i]);
      if (!path) { err(`${where} [segment ${i}]`, `no nav path from waypoint ${i - 1} to ${i}: the escort cannot walk it`); continue; }
      for (let k = 1; k < path.length; k++) total += Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z);
    }
    maxLen = Math.max(maxLen, total);
    if (total > ESCORT_MAX_M) err(where, `nav route ${Math.round(total)} m long (max ${ESCORT_MAX_M} m)`);
  }
  return { issues: out, maxLen };
}

/**
 * Solo main quests (layout quests.main `solo`: the chain quests a lone level 1-4 player finishes). HARD error: the quest area (its
 * `place`, a layout pack id) is never an elite-flagged pack. The elite camp (r1_c04) is the mini-boss area of mq_05, a group fight.
 */
function soloQuestIssues(layoutPacks, layoutMain) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  for (const m of (layoutMain ?? []).filter((x) => x.solo)) {
    const place = (layoutPacks ?? []).find((p) => p.id === m.place);
    if (!place) err(`quest ${m.id}`, `solo quest area ${m.place} is no camp of the layout`);
    else if ((place.flags ?? []).includes('elite')) err(`quest ${m.id}`, `solo quest area ${place.id} is an elite pack: point it at a non-elite camp`);
  }
  return out;
}
/**
 * Graveyards (WoW spirit healers, data/world/graveyards.ts). HARD errors on a map that declares graveyards:
 *  (1) each graveyard stands in a region of its map and 35 m or more from every camp and patrol centre (tiles, 1 tile = 4 m);
 *  (2) every quest area of the map has a graveyard within 250 m. A quest area is the quest giver's village (when the giver stands in
 *      one) and each in-band camp (levels q-1..q+1 of the quest's region) that spawns a kill / metin / elite / boss / skill target.
 * A map with region quests but no graveyards yet is a warning (its quests use the stone / map-start fallback).
 */
const GY_CAMP_M = 35, GY_SERVE_M = 250, GY_TILE_M = 4;
function graveyardIssues(zone, quests) {
  const out = [];
  const err = (where, msg) => out.push({ level: 'error', where, msg });
  const warn = (where, msg) => out.push({ level: 'warn', where, msg });
  const xy = (p) => ({ x: p[0] * GY_TILE_M, z: p[1] * GY_TILE_M });
  const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const graves = (zone.world?.graveyards ?? []).map((g) => ({ id: g.id, region: g.regionId, ...xy(g.pos) }));
  const regQuests = quests.filter((q) => q.region && zone.regions.has(q.region));
  if (!graves.length) {
    if (regQuests.length) warn(`map ${zone.id}`, `no graveyards authored: ${regQuests.length} region quests use the stone / map-start fallback`);
    return out;
  }
  const seen = new Set();
  for (const g of graves) {
    if (seen.has(g.id)) err(`graveyard ${g.id}`, 'duplicate id');
    seen.add(g.id);
    if (!zone.regions.has(g.region)) err(`graveyard ${g.id}`, `region ${g.region} is not a region of ${zone.id}`);
    const camp = zone.packs.find((p) => p.center && gap(g, xy(p.center)) < GY_CAMP_M);
    if (camp) err(`graveyard ${g.id}`, `camp ${camp.id} is ${Math.round(gap(g, xy(camp.center)))} m away: keep ${GY_CAMP_M} m from every camp`);
  }
  for (const q of regQuests) {
    const areas = [];
    const giverV = (zone.world?.villages ?? []).find((v) => v.npcs.some((n) => n.id === q.giver));
    if (giverV) areas.push({ where: `village ${giverV.id}`, p: xy(giverV.center) });
    const reg = (zone.world?.regions ?? []).find((r) => r.id === q.region);
    const lo = q.level - 1, hi = q.level + 1;
    for (const o of q.objectives) {
      if (!o.target || !['kill', 'metin', 'elite', 'boss', 'skill'].includes(o.kind) || !reg) continue;
      for (const p of zone.packs) {
        if (!p.center || p.roomId !== reg.roomId || !p.members.some((m) => m.enemyId === o.target)) continue;
        if (p.levelRange[0] > hi || p.levelRange[1] < lo) continue;
        areas.push({ where: `camp ${p.id}`, p: xy(p.center) });
      }
    }
    const far = areas.find((a) => !graves.some((g) => gap(g, a.p) <= GY_SERVE_M));
    if (far) err(`quest ${q.id}`, `${far.where} has no graveyard within ${GY_SERVE_M} m`);
  }
  return out;
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
if (!want.length || want.includes('town') || WORLD_IDS.some((id) => want.includes(id))) {
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
if (!want.length || WORLD_IDS.some((id) => want.includes(id)) || want.includes('quests')) {
  const { QUESTS } = await imp('src/data/world/quests.ts');
  const { MATERIALS } = await imp('src/data/materials.ts');
  const world = ALL_WORLD;
  const npcIds = new Set([...TOWN.npcs.map((n) => n.id), ...(world?.villages ?? []).flatMap((v) => v.npcs.map((n) => n.id))]);
  // places an `explore` objective may name: rooms, villages, camps, and the ids the game emits (regions, waypoints, hidden areas, vistas, landmarks)
  const placeIds = new Set([...ALL_WORLD_ROOMS.map((r) => r.id), ...world.villages.map((v) => v.id), ...ALL_WORLD_PACKS.map((p) => p.id),
    ...[world.regions, world.waypoints, world.hidden, world.vistas, world.landmarks].flatMap((l) => l.map((p) => p.id))]);
  const qr = cc.checkQuests(QUESTS, { npcIds, knownEnemy: known ?? (() => undefined), hasItem: (id) => id in MATERIALS, dungeonIds: [...DUNGEON_ALL, ...OPEN_ZONE_IDS], placeIds });
  const e = qr.filter((i) => i.level === 'error'), w = qr.filter((i) => i.level === 'warn');
  totalErr += e.length;
  console.log(`\n== quests: ${e.length} errors, ${w.length} warns | ${QUESTS.length} quests`);
  for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of w) console.log('  warn', i.where, '-', i.msg);
  const rq = regionQuestIssues(QUESTS, world, ALL_WORLD_PACKS);
  const rw = rq.filter((i) => i.level === 'warn'), re = rq.filter((i) => i.level === 'error');
  totalErr += re.length;
  console.log(`\n== region quests: ${re.length} errors, ${rw.length} warns | ${QUESTS.filter(isRegionQuest).length} quests`);
  for (const line of regionCounts(QUESTS)) console.log(`   ${line}`);
  for (const i of re) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of rw) console.log('  warn', i.where, '-', i.msg);
  const kb = killBandIssues(QUESTS, ZONES);
  const kbE = kb.filter((i) => i.level === 'error'), kbW = kb.filter((i) => i.level === 'warn');
  totalErr += kbE.length;
  console.log(`\n== kill bands: ${kbE.length} errors, ${kbW.length} warns | a band camp per kill target, the guide's camp 20 m clear (edge to edge)`);
  for (const i of kbE) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of kbW) console.log('  warn', i.where, '-', i.msg);
  const npcById = new Map([...TOWN.npcs, ...(world?.villages ?? []).flatMap((v) => v.npcs)].map((n) => [n.id, n]));
  const { familyOf } = await imp('src/data/families.ts');
  const xq = questReachIssues(QUESTS, world, npcIds, ALL_WORLD_PACKS, DUNGEON_ALL, OPEN_ZONE_IDS, npcById, ZONES, familyOf, { ...lootTables, ...LOOT.GATHER_TABLES });
  const xe = xq.filter((i) => i.level === 'error'), xw = xq.filter((i) => i.level === 'warn');
  totalErr += xe.length;
  console.log(`\n== quest reachability: ${xe.length} errors, ${xw.length} warns | ${QUESTS.length} quests, ${spawnIndex(world, ALL_WORLD_PACKS).size} spawnable ids`);
  for (const i of xe) console.log('  ERR ', i.where, '-', i.msg);
  for (const i of xw) console.log('  warn', i.where, '-', i.msg);
}
// quest NPCs of the open-world maps: every quest giver, turn-in and talk target (and every 'quest' role NPC) stands on clear ground and is
// path-reachable from the map's start, on the nav checkDungeon builds (rooms, props, village palisades with their gates)
if (!want.length || WORLD_IDS.some((id) => want.includes(id))) {
  let gE = 0, gN = 0;
  const offerers = new Set(); // NPC ids that give, take in or are talked to by a quest
  const { QUESTS: ALL_QUESTS } = await imp('src/data/world/quests.ts');
  for (const q of ALL_QUESTS) {
    if (q.giver) offerers.add(q.giver);
    if (q.turnIn) offerers.add(q.turnIn);
    for (const o of q.objectives ?? []) if (o.kind === 'talk' && o.target) offerers.add(o.target);
  }
  for (const z of ZONES) {
    if (want.length && !want.includes(z.id)) continue;
    const reach = cc.navReach(ALL[z.id], models);
    for (const v of z.world.villages) {
      const cx = (v.center[0] + 0.5) * 4, cz = (v.center[1] + 0.5) * 4; // scene tile centre -> metres (contentCheck sceneW)
      for (const n of v.npcs) {
        if (!offerers.has(n.id) && n.role !== 'quest') continue;
        gN++;
        const wx = cx + n.pos[0], wz = cz + n.pos[2];
        const where = `npc ${n.id}`;
        const at = `${v.id} at ${(wx / 4).toFixed(2)},${(wz / 4).toFixed(2)} (world tiles)`;
        if (!reach.walkable(wx, wz, 0.8)) { gE++; console.log('  ERR ', where, '-', `${at} stands on blocked ground`); }
        else if (!reach.reachable(wx, wz)) { gE++; console.log('  ERR ', where, '-', `${at} is not reachable from the map start`); }
      }
    }
  }
  totalErr += gE;
  console.log(`\n== quest npc ground: ${gE} errors | ${gN} quest NPCs checked on clear, reachable ground`);
}
// quest props of the open-world maps (scenes/world/WorldQuestProps.ts questPropSpots): interact / use props (qo_sack, qo_crystal,
// qo_banner, qt_*) land on a tile of their quest's region, snapped to the nearest walkable cell (pickPoint + snapTile). Every candidate
// tile of the region must snap to ground the map start reaches, so no seed can put a prop where the player (or the QA bot) cannot walk.
if (!want.length || WORLD_IDS.some((id) => want.includes(id))) {
  let pE = 0, pN = 0;
  const { QUESTS: PROP_QUESTS } = await imp('src/data/world/quests.ts');
  for (const z of ZONES) {
    if (want.length && !want.includes(z.id)) continue;
    const propRegions = new Set(PROP_QUESTS.filter((q) => q.region && q.objectives.some((o) => (o.kind === 'interact' || o.kind === 'use') && o.target)).map((q) => q.region));
    if (!propRegions.size) continue;
    const reach = cc.navReach(ALL[z.id], models);
    for (const rid of propRegions) {
      const reg = z.world.regions?.find((r) => r.id === rid);
      const room = reg && ALL[z.id].rooms.find((r) => r.id === reg.roomId);
      if (!room) continue; // a region of another map
      let n = 0, bad = 0;
      const first = [];
      for (let tz = room.rect.z; tz < room.rect.z + room.rect.h; tz++) for (let tx = room.rect.x; tx < room.rect.x + room.rect.w; tx++) {
        n++;
        const s = reach.snap((tx + 0.5) * TILE_M, (tz + 0.5) * TILE_M, 8);
        if (s && reach.reachable(s.x, s.z)) continue;
        bad++;
        if (first.length < 3) first.push(`${((tx + 0.5) * TILE_M).toFixed(0)},${((tz + 0.5) * TILE_M).toFixed(0)}`);
      }
      pN += n;
      if (bad) { pE++; console.log('  ERR ', `region ${rid} (${z.id})`, '-', `${bad} of ${n} candidate prop tiles snap to ground the map start cannot reach (e.g. at x,z ${first.join(' | ')})`); }
    }
  }
  totalErr += pE;
  console.log(`\n== quest props: ${pE} errors | ${pN} candidate tiles of ${[...new Set(PROP_QUESTS.filter((q) => q.region && q.objectives.some((o) => o.kind === 'interact' || o.kind === 'use')).map((q) => q.region))].length} prop regions checked on reachable ground`);
}
// starting-zone camp rings (Sisli Vadi r1): the level 1-2 camps keep 25 m apart, and no level 2+ jump within 40 m of a quest camp
if (!want.length || WORLD_IDS.some((id) => want.includes(id))) {
  for (const id of WORLD_IDS) {
    const r1 = ALL[id].world?.regions?.find((r) => r.id === 'r1');
    if (!r1) continue;
    const ri = campRingIssues(ALL[id].packs, r1.roomId, edgeSev(id));
    const { QUESTS: RING_QUESTS } = await imp('src/data/world/quests.ts');
    const layout = JSON.parse(fs.readFileSync(`${ROOT}/src/data/world/sisli_vadi.layout.json`, 'utf8').replace(/^﻿/, ''));
    const dn = ringDensityIssues(ALL[id].packs, r1.roomId, RING_QUESTS, layout.quests?.side ?? []);
    const si = soloQuestIssues(layout.packs, layout.quests?.main ?? []);
    const hub = layout.settlements?.find((x) => x.id === 'koy_gumusdere')?.center;
    if (!hub) throw new Error('settlement koy_gumusdere (the ring hub) is missing from the layout');
    const rb = ringBandIssues(ALL[id].packs, r1.roomId, hub);
    const pl = r1PlacementIssues(RING_QUESTS, ALL[id].world, r1.roomId, ALL[id].packs);
    const { QUEST_PROP_SPOTS } = await imp('src/data/world/quest_prop_spots.ts');
    const pp = r1PropIssues(RING_QUESTS, ALL[id].world, ALL[id].rooms, cc.navReach(ALL[id], models), hub, QUEST_PROP_SPOTS);
    const e = [...ri, ...dn.issues, ...si, ...rb, ...pl.issues, ...pp.issues].filter((i) => i.level === 'error');
    totalErr += e.length;
    console.log(`\n== camp rings ${id} r1: ${e.length} errors | ${ALL[id].packs.filter((p) => p.roomId === r1.roomId).length} camps and patrols | max mobs within 25 m: L1-2 ${dn.band.get('L1-2')}, L3 ${dn.band.get('L3')}, L4-5 ${dn.band.get('L4-5')} | r1 placement: ${pl.checked} quests L1-5 within ${PLACE_GIVER_M} m of their giver`);
    console.log(`== r1 props and explores: ${pp.objectives} prop objectives (${pp.spots} hand-placed spots), ${pp.explores} explore objectives, checked against the giver or turn-in (${PLACE_GIVER_M} m) and the ring band`);
    for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  }
}
// escort routes (Sisli Vadi r1): the route stays in the quest's level ring, at most 180 m, 25 m edge clearance from camps 2+ levels higher
if (!want.length || WORLD_IDS.some((id) => want.includes(id))) {
  const { ESCORT_ROUTES } = await imp('src/data/world/escort_routes.ts');
  const { QUESTS: ESC_QUESTS } = await imp('src/data/world/quests.ts');
  for (const id of WORLD_IDS) {
    const r1 = ALL[id].world?.regions?.find((r) => r.id === 'r1');
    if (!r1) continue;
    const layout = JSON.parse(fs.readFileSync(`${ROOT}/src/data/world/sisli_vadi.layout.json`, 'utf8').replace(/^﻿/, ''));
    const hub = layout.settlements?.find((x) => x.id === 'koy_gumusdere')?.center;
    if (!hub) throw new Error('settlement koy_gumusdere (the ring hub) is missing from the layout');
    const ei = escortRouteIssues(ESCORT_ROUTES, ESC_QUESTS, ALL[id].packs, r1.roomId, hub);
    const ni = escortNavIssues(ESCORT_ROUTES, cc.navReach(ALL[id], models));
    const e = [...ei.issues, ...ni.issues].filter((i) => i.level === 'error');
    totalErr += e.length;
    console.log(`\n== escort routes ${id} r1: ${e.length} errors | ${ei.routes} routes, longest ${Math.round(ei.maxLen)} m straight / ${Math.round(ni.maxLen)} m nav (max ${ESCORT_MAX_M} m), closest camp 2+ levels higher ${ei.minClear === null ? '-' : Math.round(ei.minClear) + ' m edge'}`);
    for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
  }
}
// graveyards (WoW spirit healers): every open-world map that declares them; every region quest of the map has one within 250 m
if (!want.length || WORLD_IDS.some((id) => want.includes(id)) || want.includes('graveyards')) {
  const { QUESTS: GY_QUESTS } = await imp('src/data/world/quests.ts');
  for (const z of ZONES) {
    const gi = graveyardIssues(z, GY_QUESTS);
    const e = gi.filter((i) => i.level === 'error'), w = gi.filter((i) => i.level === 'warn');
    totalErr += e.length;
    console.log(`\n== graveyards ${z.id}: ${e.length} errors, ${w.length} warns | ${z.world?.graveyards?.length ?? 0} graveyards, ${GY_QUESTS.filter((q) => q.region && z.regions.has(q.region)).length} region quests`);
    for (const i of e) console.log('  ERR ', i.where, '-', i.msg);
    for (const i of w) console.log('  warn', i.where, '-', i.msg);
  }
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
