#!/usr/bin/env node
/**
 * Sisli Vadi first chain, end to end, headless (gate): the main chain mq_01..mq_07 and every side quest of the same villages
 * (Gümüşdere npc_g_*, Orta Karakol npc_o_*) that the player's level allows, played the way a player plays them.
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/chain_e2e.mjs        (V=1 prints every step)
 * Real code, not shortcuts:
 *   accept / turnIn / offered / onEvent / useItem / tickEscort / progressRows / state  -> systems/Quests.ts (G.quests)
 *   kills                       -> systems/LootSystem.onEnemyKilled (kill XP, quest kill counter, quest drops through rollDrops)
 *   levels                      -> systems/Progression.addXp (the real XP curve, level-ups, skill points)
 *   interact targets            -> PlayerController.updateInteract's pick (nearest entity in reach that canInteract) and the entities'
 *                                  own canInteract (EscortNpc: active quest only; QuestProp: wanted by an active quest)
 *   props and escorts           -> scenes/world/WorldQuestProps.place() on a World with the Sisli map, escort walk + ambush (QuestEscortRun)
 *   escort routes               -> escortRoute (WorldQuestProps): each segment routed on the nav mask (navCells); a segment without a nav
 *                                  path blocks the run. The escort walks that polyline and the player walks it 2 m behind (no teleport)
 *   walkability                 -> dev/contentCheck buildNav (rooms, collide props, village palisades and gates), A* over its mask
 * Two passes: (1) mq_01..mq_07 alone, a level gate above the chain's own XP is met by grinding the nearest trash camp in band (counted);
 * (2) the side quests of the chain's villages (Gümüşdere, Orta Karakol), each taken when the level allows, in level order.
 * Time: a virtual clock (Date.now) advances by the play time of each action (walk at 6 m/s, kill 9 s, interact 6 s, use 4 s, escort
 * 0.5 s a step), so interact props refill after QUEST_PROP_RESPAWN_SEC as they do in play. The massacre chain is reset per kill.
 * Stand-ins (documented, not gates): the town Kuzgunkale has no nav mask (its walks are straight lines); quest drops are picked up
 * into the bag at once (the ground pickup is not played); a kill's enemy is a harness Actor with the real EnemyDef; escort ambushers
 * die to the real kill path without a model (the harness has no model loader).
 * Camp reach gate (content-check campReachIssues, the same nav flooded from the zone start): every camp or patrol a quest targets has its
 * member spawn points and its wander area walkable and reached from the start, before the chain runs (a centre-only check is not enough).
 * A blocker stops the run at the first failure and names quest, objective (or turn-in) and position. Exit 0 = PASS (one line).
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as H from './harness.mjs';

const { G, world } = H;
const T = 4; // tile size (m), types/dungeons.ts TILE_SIZE
const SEED = 777;
const VERBOSE = !!process.env.V;
const REAL_NOW = Date.now.bind(Date);
const T0 = REAL_NOW();
// virtual clock: interact props refill after QUEST_PROP_RESPAWN_SEC (Date.now in QuestProp); the sim advances it by the time each action takes in play
const clock = { ms: Date.now() };
Date.now = () => clock.ms;
const advance = (sec) => { clock.ms += sec * 1000; };
const WALK_MPS = 6; // Actor.baseMoveSpeed
const KILL_S = 9, INTERACT_S = 6, USE_S = 4; // tools/xp-ledger.mjs pace seconds

const { QuestSystem } = await H.imp('systems/Quests.ts');
const { Progression } = await H.imp('systems/Progression.ts');
const { LootSystem } = await H.imp('systems/LootSystem.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { RNG } = await H.imp('core/utils.ts');
const { QUESTS } = await H.imp('data/world/quests.ts');
const { OPEN_ZONES } = await H.imp('data/dungeons/index.ts');
const { TOWN } = await H.imp('data/town.ts');
const { LAYOUT } = await H.imp('data/world/layout.ts');
const { ENEMIES, BOSSES } = await H.imp('data/enemies.ts');
const { isInteractable } = await H.imp('entities/Interactable.ts');
const { NPC } = await H.imp('entities/NPC.ts');
const { EscortNpc } = await H.imp('entities/interactables/EscortNpc.ts');
const { QuestProp, QUEST_PROP_RESPAWN_SEC } = await H.imp('entities/interactables/QuestProp.ts');
const { WorldQuestProps, escortRoute } = await H.imp('scenes/world/WorldQuestProps.ts');
const { minibossRespawnSec, QUEST_RESPAWN_SEC } = await H.imp('scenes/world/MiniBossDirector.ts');
const cc = await H.imp('dev/contentCheck.ts');
const { familyOf } = await H.imp('data/families.ts');

// ------------------------------------------------------------------------------------------------ data
const SV = OPEN_ZONES.sisli_vadi;
const W = SV.world;
const sceneW = (v) => (v + 0.5) * T; // tile -> metres of the tile centre (packs, POIs, villages: DungeonBuilder convention)
const tileOf = (m) => Math.floor(m / T);

// walkability: the same mask content-check's reachability uses (buildNav), with the models it reads from public/
const PUB = fileURLToPath(new URL('../../public', import.meta.url));
const models = new Map();
for (const u of new Set([...cc.dungeonUrls(SV), ...cc.townUrls(TOWN)])) {
  const f = PUB + u;
  if (!fs.existsSync(f)) { models.set(u, { exists: false }); continue; }
  if (/\/(characters|monsters|enemies|npcs)\//.test(u)) { models.set(u, { exists: true, skinned: true }); continue; }
  if (!/\.(glb|gltf)$/.test(u)) { models.set(u, { exists: true }); continue; }
  try {
    const buf = fs.readFileSync(f);
    const b = cc.glbBoundsFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    models.set(u, b ? { exists: true, box: b.box ?? undefined, skinned: b.skinned } : { exists: /\.gltf$/.test(u) });
  } catch { models.set(u, { exists: true }); }
}
const nav = cc.navFlooded(SV, models); // the nav the game builds, flooded from the zone start (camp reach gate)
const NW = nav.w, NH = nav.h, WALK = nav.walk;

// ------------------------------------------------------------------------------------------------ nav: A* over the mask
const SQ2 = Math.SQRT2;
const openStamp = new Uint32Array(NW * NH);
const closedStamp = new Uint32Array(NW * NH);
const gCost = new Float64Array(NW * NH);
let stampNo = 0;

/** Nearest walkable cell to (x, z) within r metres (cell centre), or null. */
function snapCell(x, z, r) {
  const i0 = Math.floor(x), j0 = Math.floor(z);
  const ok = (i, j) => i >= 0 && j >= 0 && i < NW && j < NH && WALK[j * NW + i] === 1;
  if (ok(i0, j0)) return { i: i0, j: j0 };
  for (let rad = 1; rad <= r; rad++) {
    let best = null, bestD = Infinity;
    for (let j = j0 - rad; j <= j0 + rad; j++) for (let i = i0 - rad; i <= i0 + rad; i++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rad || !ok(i, j)) continue;
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z);
      if (d < bestD) { bestD = d; best = { i, j }; }
    }
    if (best) return best;
  }
  return null;
}
const cellPos = (c) => ({ x: c.i + 0.5, z: c.j + 0.5 });
const parentOf = new Int32Array(NW * NH); // A* parent of each cell (valid for the last astar run's relaxed cells)

/** A* (8-way, no corner cutting) between two cells. Returns the path length (m) or null. */
function astar(a, b) {
  const start = a.j * NW + a.i, goal = b.j * NW + b.i;
  if (start === goal) return { len: 0 };
  stampNo++;
  const hf = [], hi = [];
  const push = (f, idx) => {
    hf.push(f); hi.push(idx);
    let k = hf.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
  };
  const pop = () => {
    const idx = hi[0];
    const lf = hf.pop(), li = hi.pop();
    if (hf.length) {
      hf[0] = lf; hi[0] = li;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < hf.length && hf[l] < hf[m]) m = l;
        if (r < hf.length && hf[r] < hf[m]) m = r;
        if (m === k) break;
        [hf[m], hf[k]] = [hf[k], hf[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
      }
    }
    return idx;
  };
  const h = (i, j) => { const dx = Math.abs(i - b.i), dy = Math.abs(j - b.j); return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy); };
  gCost[start] = 0; openStamp[start] = stampNo; push(h(a.i, a.j), start);
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
  while (hf.length) {
    const idx = pop();
    if (closedStamp[idx] === stampNo) continue;
    closedStamp[idx] = stampNo;
    if (idx === goal) return { len: gCost[goal] };
    const i = idx % NW, j = (idx - i) / NW;
    for (const [di, dj, c] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= NW || nj >= NH) continue;
      const nidx = nj * NW + ni;
      if (!WALK[nidx] || closedStamp[nidx] === stampNo) continue;
      if (di && dj && (!WALK[j * NW + ni] || !WALK[nj * NW + i])) continue;
      const g = gCost[idx] + c;
      if (openStamp[nidx] !== stampNo || g < gCost[nidx]) {
        openStamp[nidx] = stampNo; gCost[nidx] = g; parentOf[nidx] = idx;
        push(g + h(ni, nj), nidx);
      }
    }
  }
  return null;
}

/**
 * The nav path from cell a to cell b as the cell centres after a, ending at b (the NavGrid.findPath convention), or null when
 * unreachable. The escort routes walk these: a route segment without one is a hard failure (the sim blocks on it).
 */
function navCells(a, b) {
  const res = astar(a, b);
  if (!res) return null;
  const s = a.j * NW + a.i;
  if (s === b.j * NW + b.i) return [cellPos(b)];
  const out = [];
  for (let k = b.j * NW + b.i; k !== s; k = parentOf[k]) out.push({ x: (k % NW) + 0.5, z: Math.floor(k / NW) + 0.5 });
  return out.reverse();
}

// ------------------------------------------------------------------------------------------------ run state
class Blocker extends Error {}
const blocker = (msg) => { throw new Blocker(msg); };
const at = (p) => `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})`;
const S = { map: 'town', pos: { x: TOWN.spawn.pos[0], z: TOWN.spawn.pos[2] }, walkM: 0, kills: 0, grind: 0, processed: new Set(), maxWait: 0 };
/** An escort ambush wave is held this long before the harness kills it (past the 25 s charge, inside the 40 s budget). */
const WAVE_HOLD_S = 30;
const log = (msg) => { if (VERBOSE) console.log(`  ${msg}`); };

const ch = CharacterState.create('Sim', 'knight');
G.input.bindingLabel = () => 'K'; // the level-up toast's key label (HUD input)
G.character = ch;
const player = { id: 42, kind: 'player', position: { x: S.pos.x, y: 0, z: S.pos.z }, removed: false, isDead: false, radius: 0.5, refreshStats() {}, pointAt: () => ({ x: 0, y: 1, z: 0 }) };
world.localPlayer = player;
// the local player is one of the world's players (an ambush wave aggroes on the nearest one); no world.update runs here, so no add()
world.players.push(player);
G.player = player;
G.net = undefined;
const qs = new QuestSystem();
G.quests = qs;
qs.rng = new RNG(4242); // the choice-reward rolls are deterministic
G.progression = new Progression();
const loot = new LootSystem();
loot.rng = new RNG(777);
const pending = [];
loot.spawnDrop = (payload) => { pending.push(payload); return null; };
G.loot = loot;
G.mplus.onEnemySpawned = () => {};

/** Ground pickup stand-in: drops leave the ground into the bag at once. */
function pickUp() {
  while (pending.length) {
    const p = pending.shift();
    if (p.kind === 'material') ch.addMaterial(p.material.id, p.material.count);
    else if (p.kind === 'item') ch.addItem(p.item);
    else if (p.kind === 'gold') ch.addGold(p.amount ?? 0);
  }
}

// ------------------------------------------------------------------------------------------------ maps, NPCs, props
const regionRects = W.regions.map((r) => {
  const room = SV.rooms.find((x) => x.id === r.roomId);
  return { id: r.id, x: room.rect.x, z: room.rect.z, w: room.rect.w, h: room.rect.h };
});
const regionAtTile = (tx, tz) => {
  const r = regionRects.find((q) => tx >= q.x && tx < q.x + q.w && tz >= q.z && tz < q.z + q.h);
  return r ? { id: r.id } : null;
};
const regionMap = new Map(regionRects.map((r) => [r.id, r]));
const ctx = {
  world, seed: SEED,
  regionById: (id) => (regionMap.has(id) ? { id } : undefined),
  regionRect: (id) => { const r = regionMap.get(id); return r ? { x: r.x, z: r.z, w: r.w, h: r.h } : null; },
  regionAtTile,
  snapTile: (tx, tz, r = 8) => { const c = snapCell(sceneW(tx), sceneW(tz), r); return c ? cellPos(c) : { x: sceneW(tx), z: sceneW(tz) }; },
  snapWorld: (x, z, r = 12) => { const c = snapCell(x, z, r); return c ? cellPos(c) : { x, z }; },
  // the nav path of one escort segment (WorldQuestProps.escortRoute): A* over the same mask; null when none
  navPath: (a, b) => { const ca = snapCell(a.x, a.z, 1), cb = snapCell(b.x, b.z, 1); return ca && cb ? navCells(ca, cb) : null; },
};

// village NPCs: the entity spawnVillageNpcs builds (positions as it computes them), without the model load
const npcs = new Map(); // npc id -> { e, map, village }
let eidNpc = 5000;
for (const v of W.villages) {
  const cx = sceneW(v.center[0]), cz = sceneW(v.center[1]);
  for (const def of v.npcs) {
    if (def.decor || def.object) continue;
    const path = def.patrol?.path?.length ? def.patrol.path.map(([x, z]) => [cx + x, cz + z]) : null;
    const sx = path ? path[0][0] : cx + def.pos[0];
    const sz = path ? path[0][1] : cz + def.pos[2];
    const e = new NPC(eidNpc++, path && def.patrol ? { ...def, patrol: { path, lap: def.patrol.lap } } : def);
    e.position.set(sx, 0, sz);
    world.add(e);
    npcs.set(def.id, { e, map: 'sisli', village: v.id });
  }
}
// town NPCs (Kuzgunkale): their own map, not in the Sisli world
for (const def of TOWN.npcs) {
  if (def.decor || def.object) continue;
  const e = new NPC(9000 + TOWN.npcs.indexOf(def), def);
  e.position.set(def.pos[0], 0, def.pos[2]);
  npcs.set(def.id, { e, map: 'town', village: 'town' });
}
const townList = [...npcs.values()].filter((x) => x.map === 'town').map((x) => x.e);
const sisliStart = { x: sceneW(SV.start.pos[0]), z: sceneW(SV.start.pos[1]) };

// quest props and escorts: the real placement on the Sisli world
// the village safe boxes, as WorldRuntime sets them: enemies never pick a player inside one, a scripted escort ambush does (it fights there)
const { SafeZones } = await H.imp('scenes/world/SafeZones.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const safeZones = new SafeZones({ ext: { villages: W.villages } });
getDirector(world).setSafeQuery((x, z) => safeZones.isSafe(x, z));
const placer = new WorldQuestProps(ctx);
const placed = await placer.place();
if (placed === 0) blocker('no quest prop or escort NPC was placed on the Sisli map (WorldQuestProps.place)');
log(`placed ${placed} quest props and escort NPCs`);
const escortOwner = new Map(); // escort NPC entity -> quest id (position of its path start, WorldQuestProps.place)
const escortRoutes = new Map(); // quest id -> escortRoute result: the nav polyline of its route, or the error of a segment with no nav path
for (const d of QUESTS) {
  if (!d.region || !regionMap.has(d.region) || !d.objectives.some((o) => o.kind === 'escort')) continue;
  const built = escortRoute(ctx, d.id);
  escortRoutes.set(d.id, built);
  if ('error' in built) continue;
  const path = built.route.path;
  const npc = [...world.entities.values()].find((e) => e instanceof EscortNpc && Math.hypot(e.position.x - path[0].x, e.position.z - path[0].z) < 0.01);
  if (npc) escortOwner.set(npc, d.id);
}

// ------------------------------------------------------------------------------------------------ interact pick (PlayerController.updateInteract)
const pickList = (map) => (map === 'town' ? townList : [...world.entities.values()]);
function pickF(map, p = player) {
  let best = null, bestD = 1e9;
  for (const e of pickList(map)) {
    if (e.removed) continue;
    if (!(e.kind === 'npc' || e.kind === 'interactable' || e.kind === 'loot')) continue;
    if (!isInteractable(e)) continue;
    const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
    if (d > e.interactRange + e.radius || d >= bestD) continue;
    if (e.canInteract && !e.canInteract(p)) continue;
    best = e; bestD = d;
  }
  return best;
}
const who = (e) => {
  if (!e) return 'nothing';
  if (e instanceof EscortNpc) return `escort NPC of ${escortOwner.get(e) ?? '?'}`;
  if (e instanceof QuestProp) return `prop ${e.target}`;
  if (e instanceof NPC) return `NPC ${e.def.id} (${e.def.name})`;
  return `${e.kind} ${e.id}`;
};

/**
 * F on `expected`: the pick must be it, and no other quest-gated escort may be F-enabled (a locked or finished quest's same-named
 * escort took F before: commit 514bba4). With the escort gate removed every escort is F-enabled and the check names the decoy.
 */
function fOn(expected, label, map) {
  const picked = pickF(map);
  if (picked !== expected) blocker(`${label}: F picks ${who(picked)} at ${at(player.position)}, not ${who(expected)}`);
  // an escort F: every other escort NPC must refuse F (its quest is not active); the decoys share the real one's name
  if (expected instanceof EscortNpc) {
    const allowed = [...world.entities.values()].filter((e) => e instanceof EscortNpc && e !== expected && e.canInteract(player));
    if (allowed.length) {
      const other = allowed[0];
      blocker(`${label}: ${who(other)} at ${at(other.position)} is F-enabled while its quest is ${qs.state(escortOwner.get(other) ?? '?')}: F there would take the escort of ${escortOwner.get(expected)}`);
    }
  }
  return picked;
}

// ------------------------------------------------------------------------------------------------ walking
/** Walk from the current position to `to` over the nav mask (snap radius r m around the target). Returns the metres walked. */
function walkTo(to, label, r = 12) {
  if (S.map === 'town') {
    const d = Math.hypot(to.x - S.pos.x, to.z - S.pos.z);
    S.pos = { x: to.x, z: to.z }; S.walkM += d; advance(d / WALK_MPS); movePlayer();
    return d;
  }
  const a = snapCell(S.pos.x, S.pos.z, 3);
  if (!a) blocker(`${label}: start ${at(S.pos)} is not walkable`);
  const b = snapCell(to.x, to.z, r);
  if (!b) blocker(`${label}: no walkable ground within ${r} m of ${at(to)}`);
  const res = astar(a, b);
  if (!res) blocker(`${label}: no nav path from ${at(S.pos)} to ${at(to)} (rooms, props and palisades of the map)`);
  S.pos = cellPos(b);
  S.walkM += res.len;
  advance(res.len / WALK_MPS);
  movePlayer();
  return res.len;
}
const movePlayer = () => { player.position.x = S.pos.x; player.position.z = S.pos.z; };
/** Path length from the current position without moving (null when unreachable). */
function pathLen(to, r = 12) {
  if (S.map === 'town') return Math.hypot(to.x - S.pos.x, to.z - S.pos.z);
  const a = snapCell(S.pos.x, S.pos.z, 3), b = snapCell(to.x, to.z, r);
  if (!a || !b) return null;
  const res = astar(a, b);
  return res ? res.len : null;
}

/** Walk to an NPC (its F reach) on its own map; leaves the town through the south gate the first time. */
function walkToNpc(npcId, label) {
  const rec = npcs.get(npcId);
  if (!rec) blocker(`${label}: no NPC ${npcId} in the world data`);
  if (rec.map !== S.map) {
    if (rec.map === 'sisli' && S.map === 'town') { S.map = 'sisli'; S.pos = { ...sisliStart }; movePlayer(); log('leave town by the south gate'); }
    else blocker(`${label}: NPC ${npcId} is on another map`);
  }
  walkTo(rec.e.position, `${label} (${npcId} ${rec.e.def.name})`, 3);
  const reach = rec.e.interactRange + rec.e.radius;
  const d = Math.hypot(rec.e.position.x - S.pos.x, rec.e.position.z - S.pos.z);
  if (d > reach) blocker(`${label}: ${npcId} (${rec.e.def.name}) at ${at(rec.e.position)} is ${d.toFixed(1)} m away, F reach ${reach.toFixed(1)} m`);
  return rec.e;
}

// ------------------------------------------------------------------------------------------------ kills (real LootSystem path)
let killCounter = 0;
/** One kill of enemy `defId` at `at` (the player stands there): LootSystem.onEnemyKilled, then the ground pickup. */
function kill(defId, pos, opt) {
  const def = ENEMIES[defId] ?? BOSSES[defId];
  if (!def) blocker(`no enemy def ${defId}`);
  const e = H.addEnemy(pos.x, pos.z, { rank: def.rank });
  e.def = def;
  e.level = opt.level;
  e.openWorld = true;
  e.packId = opt.packId ?? null;
  e.champion = false;
  e.isBoss = def.rank === 'boss';
  if (defId.startsWith('metin_')) G.events.emit('damage', { targetId: e.id, sourceId: player.id, amount: 1 });
  // kills are spaced ~9 s apart in play (tools/xp-ledger KILL_S): the massacre chain (1.5 s window) has expired before each kill
  loot.chain = { count: 0, timer: 0, xp: 0, paid: 0 };
  advance(KILL_S);
  loot.onEnemyKilled(e);
  world.remove(e);
  pickUp();
  S.kills++;
  killCounter++;
}

// ------------------------------------------------------------------------------------------------ sources of a target
const TILE_CENTRE = (p) => ({ x: sceneW(p[0]), z: sceneW(p[1]) });
/**
 * Metin spot clearance (content-check's rule, GDD_OPENWORLD §4): a stone of Sisli Koru (r1, tier level 1-5) keeps 30 m edge to edge from
 * every camp (centre distance less the camp radius and its 8 m wander). A metin objective is only playable if every spot of its tier holds.
 */
const METIN_CLEAR_M = 30;
function metinClearanceAssert(tierId, label) {
  const tier = (W.metin?.tiers ?? []).find((t) => t.id === tierId);
  if (!tier || tier.regionId !== 'r1' || tier.level > 5) return;
  for (const s of LAYOUT.metinSpots) {
    if (s.tier !== tierId) continue;
    const a = TILE_CENTRE(s.pos);
    let m = Infinity;
    for (const p of SV.packs) {
      if (!p.center) continue;
      const c = TILE_CENTRE(p.center);
      m = Math.min(m, Math.hypot(c.x - a.x, c.z - a.z) - (p.radius ?? 8) - 8);
    }
    if (m < METIN_CLEAR_M) blocker(`${label}: metin spot ${s.id} is ${Math.round(m)} m clear of a camp (keep ${METIN_CLEAR_M} m edge to edge)`);
  }
}

/** Every place that spawns one of `ids` on this map: camps / patrols (members), rares (spots), mini-bosses (lair), metin stones (spots). */
function sourcesOf(ids) {
  const out = [];
  for (const p of SV.packs) {
    const members = p.members.filter((m) => ids.includes(m.enemyId));
    if (!members.length) continue;
    out.push({ label: p.id, pos: TILE_CENTRE(p.center), level: p.levelRange, packId: p.id, members, kind: 'pack' });
  }
  for (const r of W.rares) {
    if (!ids.includes(r.enemyId)) continue;
    for (const s of r.spots) out.push({ label: `${r.id} spot ${s}`, pos: TILE_CENTRE(s), level: [r.level, r.level], members: [{ enemyId: r.enemyId }], kind: 'spot' });
  }
  for (const m of W.minibosses) {
    if (!ids.includes(m.enemyId)) continue;
    out.push({ label: `${m.id} lair ${m.lair}`, pos: TILE_CENTRE(m.lair), level: [m.level, m.level], members: [{ enemyId: m.enemyId }], kind: 'lair' });
  }
  const tiers = new Map((W.metin?.tiers ?? []).map((t) => [t.id, t]));
  for (const s of LAYOUT.metinSpots) {
    if (!ids.includes(s.tier)) continue;
    const t = tiers.get(s.tier);
    out.push({ label: `${s.id} (${s.tier})`, pos: TILE_CENTRE(s.pos), level: [t?.level ?? 1, t?.level ?? 1], members: [{ enemyId: s.tier }], kind: 'metin' });
  }
  return out;
}

/** Mini-boss quest bosses: the lair is a source on this map, a quest-wanted lair refills in <= 90 s, the layout timer is unchanged otherwise. */
function bossLairAssert(enemyId, label) {
  const mb = W.minibosses.find((m) => m.enemyId === enemyId);
  if (!mb) return; // a boss of the boss list, not a lair
  if (!sourcesOf([enemyId]).some((c) => c.kind === 'lair')) blocker(`${label}: lair of ${enemyId} is not a source`);
  if (minibossRespawnSec(mb, true) > 90 || QUEST_RESPAWN_SEC > 90) blocker(`${label}: quest respawn of ${enemyId} is over 90 s`);
  if (minibossRespawnSec(mb, false) !== mb.respawnMin * 60) blocker(`${label}: layout respawn of ${enemyId} changed`);
  log(`lair boss ${enemyId} at ${mb.lair}: quest respawn ${QUEST_RESPAWN_SEC} s`);
}

/** Walks to the nearest reachable source of `ids` (in-band sources first). Returns the chosen source. */
function goToSource(ids, band, label) {
  const cands = sourcesOf(ids);
  if (!cands.length) blocker(`${label}: no source on this map spawns ${ids.join(' / ')}`);
  const inBand = (c) => c.level[1] >= band[0] && c.level[0] <= band[1];
  const ranked = cands.map((c) => ({ c, d: Math.hypot(c.pos.x - S.pos.x, c.pos.z - S.pos.z), ok: inBand(c) }))
    .sort((a, b) => (a.ok === b.ok ? a.d - b.d : a.ok ? -1 : 1));
  let tried = 0;
  for (const { c } of ranked) {
    if (tried++ >= 14) break;
    if (pathLen(c.pos, 8) === null) continue;
    walkTo(c.pos, `${label}: source ${c.label}`, 8);
    log(`source ${c.label} at ${at(c.pos)} L${c.level.join('-')}`);
    return c;
  }
  blocker(`${label}: ${cands.length} sources of ${ids.join(' / ')}, none reachable from ${at(S.pos)} (first: ${cands[0].label} at ${at(cands[0].pos)})`);
}

/** Kills at a source until `done()`. Mobs cycle through the source's members; the level cycles through its range. */
function farm(src, done, label, cap, status) {
  let n = 0;
  while (!done()) {
    if (n++ > cap) blocker(`${label}: ${cap} kills at ${src.label} and still not done (${status()})`);
    const member = src.members[n % src.members.length];
    const lo = src.level[0], hi = src.level[1];
    const level = lo + (killCounter % (hi - lo + 1));
    kill(member.enemyId, src.pos, { level, packId: src.packId });
  }
}

// ------------------------------------------------------------------------------------------------ objectives
const prog = (def, k) => qs.progressRows(def.id)[k];
const objOf = (def, k) => `${def.id} objective ${k + 1} (${def.objectives[k].kind} ${def.objectives[k].target ?? ''})`;

async function doObjective(def, k) {
  const o = def.objectives[k];
  const band = [def.level - 1, def.level + 2];
  const label = objOf(def, k);
  // a bonus quest (quests_variety BONUS_QUESTS) turns itself in with its last objective: the progress rows are gone then, the state is done
  const done = () => !!prog(def, k)?.done || qs.state(def.id) === 'done';
  const status = () => `quest ${qs.state(def.id)}, rows ${JSON.stringify(qs.progressRows(def.id).map((r) => [r.have, r.need]))}`;
  switch (o.kind) {
    case 'talk': {
      const npc = walkToNpc(o.target, label);
      fOn(npc, label, npcs.get(o.target).map);
      qs.onEvent('talk', o.target);
      break;
    }
    case 'kill': case 'boss': case 'metin': case 'elite': {
      if (o.kind === 'boss') bossLairAssert(o.target, label);
      if (o.kind === 'metin') metinClearanceAssert(o.target, label);
      const ids = [o.target];
      const src = goToSource(ids, band, label);
      farm(src, done, label, 60 * o.count + 60, status);
      break;
    }
    case 'drop': case 'collect': {
      const ids = o.from ?? def.objectives.filter((x) => ['kill', 'boss', 'metin', 'elite'].includes(x.kind)).map((x) => x.target);
      if (!ids.length) blocker(`${label}: a collect objective with no source (no from list, no kill objective)`);
      const src = goToSource(ids, band, label);
      farm(src, done, label, 60 * o.count + 60, status);
      break;
    }
    case 'interact': case 'use': {
      const isUse = o.kind === 'use';
      const tried = new Set();
      let guard = 0, waits = 0;
      while (!done()) {
        if (guard++ > 40) blocker(`${label}: no usable prop of ${o.target} left`);
        const all = [...world.entities.values()].filter((e) => e instanceof QuestProp && e.target === o.target);
        if (!all.length) blocker(`${label}: no prop of ${o.target} placed in region ${def.region ?? '?'}`);
        const props = all.filter((e) => !tried.has(e));
        if (!props.length) { // every prop is empty: the player waits for the refill (QUEST_PROP_RESPAWN_SEC)
          if (waits++ >= 3) blocker(`${label}: all ${all.length} props of ${o.target} stay empty`);
          advance(QUEST_PROP_RESPAWN_SEC + 1); tried.clear(); log(`wait for ${o.target} to refill`); continue;
        }
        props.sort((a, b) => Math.hypot(a.position.x - S.pos.x, a.position.z - S.pos.z) - Math.hypot(b.position.x - S.pos.x, b.position.z - S.pos.z));
        const prop = props.find((p) => pathLen(p.position, 3) !== null) ?? props[0];
        if (pathLen(prop.position, 3) === null) blocker(`${label}: prop ${o.target} at ${at(prop.position)} is not reachable from ${at(S.pos)}`);
        walkTo(prop.position, label, 3);
        if (Math.hypot(prop.position.x - S.pos.x, prop.position.z - S.pos.z) > prop.interactRange + prop.radius) blocker(`${label}: prop at ${at(prop.position)} out of F reach`);
        fOn(prop, label, 'sisli');
        const before = prog(def, k)?.have ?? 0;
        if (isUse && ch.material(o.item) < 1) blocker(`${label}: ${o.item} not in the bag (have ${ch.material(o.item)})`);
        advance(isUse ? USE_S : INTERACT_S);
        prop.interact(player);
        pickUp();
        // an interact prop is empty for QUEST_PROP_RESPAWN_SEC after a use; an altar only when the use did nothing
        if (!isUse || (prog(def, k)?.have ?? 0) === before) tried.add(prop);
      }
      break;
    }
    case 'escort': {
      const npc = [...escortOwner.entries()].find(([, id]) => id === def.id)?.[0];
      if (!npc) blocker(`${label}: no escort NPC was placed for this quest in ${def.region ?? '?'}`);
      walkTo(npc.position, label, 3);
      if (Math.hypot(npc.position.x - S.pos.x, npc.position.z - S.pos.z) > npc.interactRange + npc.radius) blocker(`${label}: escort NPC at ${at(npc.position)} out of F reach`);
      fOn(npc, label, 'sisli');
      npc.interact(player);
      if (!/yolda/.test(npc.interactPrompt)) blocker(`${label}: F did not start the escort (prompt "${npc.interactPrompt}")`);
      // the escort walks the nav polyline of its route (every segment between two waypoints has a nav path, else blocked above); the
      // player walks the same polyline 2 m behind it, so every step of both is on walkable cells
      const built = escortRoutes.get(def.id);
      if (!built || 'error' in built) blocker(`${label}: escort route has no nav path (${built ? built.error : 'no route in the data'})`);
      const P = built.route.path;
      const arc = [0];
      for (let i = 1; i < P.length; i++) arc.push(arc[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
      let ni = 0;
      let frames = 0;
      let last = { x: npc.position.x, z: npc.position.z };
      const run = placer.escortRun(def.id);
      const seen = new Set();
      let charged = false;
      while (!done()) {
        if (frames++ > 4000) blocker(`${label}: escort not finished after ${frames} steps (prompt "${npc.interactPrompt}")`);
        placer.update(0.5);
        advance(0.5);
        await new Promise((r) => setTimeout(r, 0));
        const np = npc.position;
        S.walkM += Math.hypot(np.x - last.x, np.z - last.z);
        last = { x: np.x, z: np.z };
        const dn = (i) => Math.hypot(P[i].x - np.x, P[i].z - np.z);
        while (ni + 1 < P.length && dn(ni + 1) <= dn(ni)) ni++; // the escort's place on its polyline, never back
        const target = Math.max(0, arc[ni] - 2);
        let j = 0;
        while (j + 1 < P.length && arc[j + 1] <= target) j++;
        S.pos = { x: P[j].x, z: P[j].z }; movePlayer();
        // the wave is real EnemyAI: each ambusher must be in combat the first time it is seen (a scripted ambush aggroes at spawn, past
        // the pull cap and the village boxes). The wave is held WAVE_HOLD_S seconds (past the 25 s charge), then the harness plays the
        // player and kills it through the real kill path (their XP is open-world XP)
        for (const e of [...world.enemies]) {
          if (e.kind !== 'enemy' || e.isDead || e.removed) continue;
          if (!seen.has(e)) {
            seen.add(e);
            if (!(e.ai?.aggroed && e.ai.target)) blocker(`${label}: ambusher ${who(e)} at ${at(e.position)} is not in combat when it spawns`);
          }
          S.maxWait = Math.max(S.maxWait, run.ambushWaitSec);
          if (run.charging) charged = true;
          if (run.ambushWaitSec < WAVE_HOLD_S) continue;
          e.openWorld = true;
          loot.chain = { count: 0, timer: 0, xp: 0, paid: 0 };
          loot.onEnemyKilled(e);
          world.remove(e);
          S.kills++;
        }
        pickUp();
      }
      // the protection time runs out at the end of the route: the escort must have walked every segment to its last waypoint
      if (Math.hypot(last.x - P[P.length - 1].x, last.z - P[P.length - 1].z) > 1.5) blocker(`${label}: escort completed at ${at(last)}, short of its route end ${at(P[P.length - 1])}`);
      // a wave never holds the escort past AMBUSH_RESUME_SEC (40 s budget), and a wave held past the charge time was charged
      if (S.maxWait > 40) blocker(`${label}: escort waited ${S.maxWait.toFixed(1)} s on an ambush (budget 40 s)`);
      if (S.maxWait >= 25 && !charged) blocker(`${label}: a wave held ${S.maxWait.toFixed(1)} s never charged the escort`);
      break;
    }
    case 'explore': {
      const id = o.target;
      // the Group Finder opening (I, or the micro menu / a dungeon portal): FinderPanel.onOpen emits it, no place to walk to
      if (id === 'finder') { qs.onEvent('explore', id); break; }
      const hid = W.hidden.find((h) => h.id === id);
      const wp = W.waypoints.find((w) => w.id === id);
      const vil = W.villages.find((v) => v.id === id);
      const reg = regionMap.get(id);
      const spot = hid ?? wp ?? vil ?? (reg ? { pos: [reg.x + reg.w / 2, reg.z + reg.h / 2] } : null);
      if (!spot) blocker(`${label}: no place ${id} on this map`);
      const c = TILE_CENTRE(spot.pos);
      walkTo(c, label, 6);
      if (Math.hypot(c.x - S.pos.x, c.z - S.pos.z) > (hid ? hid.radius : 2) * T + 4) blocker(`${label}: ${id} at ${at(c)} is not reached`);
      if (hid) { ch.save.flags[`world.found.${id}`] = true; qs.onEvent('explore', id); } // Discoveries.check: the spot is found once, then the explore event
      else if (wp) G.events.emit('waypoint:discovered', { id });
      else if (reg) G.events.emit('world:regionEntered', { regionId: id, name: id, first: true });
      else qs.onEvent('explore', id);
      break;
    }
    case 'dungeon': {
      const [dungeonId, difficulty] = o.target.split(':');
      const ent = W.entrances.find((e) => e.dungeonId === dungeonId);
      if (!ent) blocker(`${label}: no entrance of ${dungeonId} on this map`);
      if (ch.level < ent.minLevel) blocker(`${label}: entrance ${ent.name} needs level ${ent.minLevel}, player is ${ch.level}`);
      walkTo(TILE_CENTRE(ent.pos), label, 4);
      G.events.emit('run:completed', { state: { dungeonId, difficulty, failed: false, completed: true }, record: null, rewards: [] });
      break;
    }
    default:
      blocker(`${label}: no handler for objective kind ${o.kind} in this sim`);
  }
  if (!done()) blocker(`${label}: objective not done after its action (${prog(def, k)?.have}/${prog(def, k)?.need})`);
  log(`done ${label}`);
}

// ------------------------------------------------------------------------------------------------ quests
const villageNpcIds = (vid) => [...npcs.entries()].filter(([, r]) => r.village === vid).map(([id]) => id);

/** Accept `def` at its giver (F on the giver, the quest offered there). */
function acceptAt(def) {
  const giver = walkToNpc(def.giver, `${def.id} giver`);
  fOn(giver, `${def.id} giver`, npcs.get(def.giver).map);
  const offered = qs.offered(def.giver).some((d) => d.id === def.id);
  if (!offered) blocker(`${def.id}: not offered at ${def.giver} (state ${qs.state(def.id)}, player L${ch.level}, needs L${def.level}${def.prereq ? `, prereq ${def.prereq.join(',')} ${def.prereq.map((p) => qs.state(p)).join(',')}` : ''})`);
  if (!qs.accept(def.id)) blocker(`${def.id}: accept refused (state ${qs.state(def.id)})`);
  log(`accept ${def.id} at ${def.giver} L${ch.level} xp ${ch.save.xp}`);
}

/** Turn in `def` at its turn-in NPC (F on that NPC, the quest ready there); choice quests take option 0. */
function turnInAt(def) {
  if (qs.state(def.id) === 'done' && def.bonus) { S.processed.add(def.id); log(`${def.id} completed by itself (bonus area)`); return; }
  const npcId = def.turnIn ?? def.giver;
  const npc = walkToNpc(npcId, `${def.id} turn-in`);
  fOn(npc, `${def.id} turn-in`, npcs.get(npcId).map);
  if (!qs.offered(npcId).some((d) => d.id === def.id)) blocker(`${def.id}: not ready at ${npcId} (state ${qs.state(def.id)}, progress ${def.objectives.map((o, k) => `${prog(def, k)?.have}/${o.count}`).join(' ')})`);
  if (!qs.turnIn(def.id, def.reward.choice ? 0 : undefined)) blocker(`${def.id}: turn-in refused at ${npcId} (state ${qs.state(def.id)})`);
  S.processed.add(def.id);
  log(`turned in ${def.id} at ${npcId} L${ch.level} xp ${ch.save.xp}`);
}

/** Level gate: grinds the open world (the nearest trash camp in band) until the quest's level is reached. */
function ensureLevel(def) {
  let guard = 0;
  while (ch.level < def.level) {
    if (guard++ > 2500) blocker(`${def.id}: level gate L${def.level}, player still L${ch.level} after ${S.grind} grind kills (xp ${ch.save.xp})`);
    const L = ch.level;
    const camps = SV.packs.filter((p) => p.kind !== 'boss' && p.levelRange[1] >= L - 1 && p.levelRange[0] <= L + 1 && p.members.some((m) => ENEMIES[m.enemyId]?.rank === 'trash'));
    if (!camps.length) blocker(`${def.id}: level gate L${def.level}, no trash camp for L${L}`);
    const c = camps.map((p) => ({ p, d: Math.hypot(sceneW(p.center[0]) - S.pos.x, sceneW(p.center[1]) - S.pos.z) })).sort((a, b) => a.d - b.d)[0].p;
    const members = c.members.filter((m) => ENEMIES[m.enemyId]?.rank === 'trash');
    const src = { label: c.id, pos: TILE_CENTRE(c.center), level: c.levelRange, packId: c.id, members };
    if (!S.grindAt || S.grindAt.label !== c.id) { walkTo(src.pos, `grind at ${c.id}`, 8); S.grindAt = src; }
    kill(members[S.grind % members.length].enemyId, src.pos, { level: c.levelRange[0] + (S.grind % (c.levelRange[1] - c.levelRange[0] + 1)), packId: c.id });
    S.grind++;
    if (S.grind % 50 === 0) log(`grind ${S.grind}: L${ch.level} xp ${ch.save.xp}`);
  }
  if (S.grind) log(`level gate ${def.id}: L${ch.level} after ${S.grind} grind kills`);
}

/** Full cycle of one quest: accept, objectives in order, turn-in. */
async function doQuest(def) {
  acceptAt(def);
  for (let k = 0; k < def.objectives.length; k++) await doObjective(def, k);
  turnInAt(def);
}

/** Every side quest the village's NPCs offer that is available now (level, prereqs), in level order, until none is left. */
async function doVillageSide(vid) {
  if (!vid || vid === 'town') return;
  const ids = new Set(villageNpcIds(vid));
  for (let pass = 0; pass < 40; pass++) {
    const next = QUESTS.filter((q) => !q.main && !q.daily && ids.has(q.giver) && !S.processed.has(q.id) && qs.state(q.id) === 'available')
      .sort((a, b) => a.level - b.level)[0];
    if (!next) break;
    if (ch.level < next.level) break;
    await doQuest(next);
    log(`side ${next.id} done`);
    S.processed.add(next.id);
  }
}

// ------------------------------------------------------------------------------------------------ the chain
const CHAIN = [];
{
  let cur = QUESTS.find((q) => q.main && !q.prereq?.length);
  while (cur && /^mq_0[1-7]_/.test(cur.id)) {
    CHAIN.push(cur);
    cur = QUESTS.find((q) => q.main && q.prereq?.[0] === cur.id);
  }
}

/**
 * Camp reach gate: every camp or patrol a quest targets on this map (kill / boss / elite / metin targets, drop / collect sources) has each
 * member spawn point and its wander area (camp radius + 8 m) walkable and reached from the zone start. A camp whose centre sits behind a
 * ruin wall fails here even when the other members are reachable: the quest then stalls in play.
 */
function campGate() {
  const local = new Set(SV.world.villages.flatMap((v) => v.npcs.map((n) => n.id)));
  const zoneQuests = QUESTS.filter((q) => (q.region && regionMap.has(q.region)) || local.has(q.giver));
  const { issues, checked, failing } = cc.campReachIssues(nav, SV.packs, cc.questTargetOf(zoneQuests, familyOf), 'error');
  if (VERBOSE) console.log(`camp reach: ${checked} quest-targeted camps and patrols, ${failing} cut off from the start`);
  if (issues.length) blocker(`${issues.length} quest camp(s) cut off from the start (camp reach gate), first ${issues[0].where}: ${issues[0].msg}`);
}

async function run() {
  campGate();
  if (CHAIN.length !== 7) blocker(`the chain from mq_01 does not reach mq_07 (${CHAIN.map((q) => q.id).join(', ')})`);
  // pass 1: the main chain alone, as its level gates allow (a gate above the chain's own XP is met by grinding, counted)
  const villages = new Set();
  for (const q of CHAIN) {
    ensureLevel(q);
    acceptAt(q);
    villages.add(npcs.get(q.giver)?.village);
    for (let k = 0; k < q.objectives.length; k++) await doObjective(q, k);
    turnInAt(q);
    villages.add(npcs.get(q.turnIn ?? q.giver)?.village);
    if (VERBOSE) console.log(`chain ${q.id}: L${ch.level} walk ${S.walkM.toFixed(0)} m, grind ${S.grind}`);
  }
  // pass 2: the side quests offered by the same villages' givers, in level order, each one when the player's level allows it
  for (const vid of villages) if (vid && vid !== 'town') await doVillageSide(vid);
}

// ------------------------------------------------------------------------------------------------ run and report
const errBefore = H.errors.length;
let ok = true;
try {
  await run();
} catch (err) {
  ok = false;
  if (err instanceof Blocker) console.log(`FAIL chain_e2e: ${err.message}`);
  else console.log(`FAIL chain_e2e: runtime error at ${S.pos.x.toFixed(0)}, ${S.pos.z.toFixed(0)}: ${err?.stack?.split('\n').slice(0, 3).join(' | ')}`);
}
const quests = QUESTS.filter((q) => qs.state(q.id) === 'done' && S.processed.has(q.id));
const mainDone = CHAIN.filter((q) => qs.state(q.id) === 'done').length;
const sideDone = quests.length - mainDone;
const secs = ((REAL_NOW() - T0) / 1000).toFixed(1);
// the headless harness has no model loader: the escort's ambushers spawn without a model (their load error is expected, the quest logic is not touched)
const HARNESS_GAPS = /model load failed for (ow_|skel_|rare_|mb_)|mplus.onEnemySpawned/;
const unexpected = H.errors.slice(errBefore).filter((x) => !HARNESS_GAPS.test(x));
if (ok && unexpected.length) {
  ok = false;
  console.log(`FAIL chain_e2e: ${unexpected.length} console error(s) during the chain, first: ${[...new Set(unexpected.map((x) => x.slice(0, 200)))].slice(0, 3).join(' || ')}`);
}
if (ok) {
  console.log(`PASS chain_e2e: ${quests.length} quests done (chain ${mainDone}/7, side ${sideDone}), final level ${ch.level}, walk ${S.walkM.toFixed(0)} m, ${secs} s`);
}
H.restoreConsole();
process.exit(ok ? 0 : 1);
