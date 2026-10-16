#!/usr/bin/env node
/**
 * Whole-registry dungeon check (every DUNGEONS entry: the levelling set and the Mythic+ season pool), headless. Reads only; fixes nothing.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/dungeon_all.mjs
 *
 * One line per dungeon, the failures of that dungeon listed under it, then `DUNGEON ALL: N pass, M fail`. Checks:
 *  1. reach: every room is flooded from the start on the nav grid (src/dev/contentCheck.ts buildNav, collide props and door posts)
 *     with all gates open. Then a progression sim: each step clears the non-optional packs in reach, kills the lowest-order alive boss
 *     when its spawn is in reach, and re-evaluates every door with the real resolveGate (src/systems/DungeonEvents.ts) before the next
 *     step. Closed doors are removed from the nav. event_lock and device_lock gates count as solved (no puzzle sim). The boss rooms must
 *     be reached in boss order, and the exit must be reachable once every boss is dead.
 *  2. spawns: every boss spawn lies inside its arena rect (a room with `boss: n`) on walkable ground. Every boss-script anchor lies inside
 *     a boss arena of its dungeon on walkable ground (BOSS_ANCHORS of contentCheck.ts, plus the named tables of src/ai/bosses/*.ts that
 *     are not in it, mirrored in ANCHOR_TABLES below; the scripts keep these as module constants, so they cannot be imported).
 *  3. shortcut: every kill_lock door connects two rooms that are reachable with all gates open, and its opensOn target dies in the
 *     progression.
 *  4. forcesRequired <= the roster forces of the non-optional packs (EnemyDef.forces).
 *  5. smoke: every boss is fought for up to 240 s (sim time) by a solo high-level knight bot with the basic attack. The party of three
 *     (tank, healer, dps) is not run: the harness has one local player and never instantiates BossController (boss scripts are not
 *     run here; see the header of bossFight). Pass per boss: dead, or at least 60 % of its HP lost, and no engine errors.
 */
import * as H from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { G } = H;
const DT = H.DT;
const T = 4;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEATH_PENALTY_S = 30;
const FIGHT_LIMIT_S = 240;
const SMOKE_LEVEL_CAP = 60;

const cc = await H.imp('dev/contentCheck.ts');
const { DUNGEONS, MPLUS_POOL } = await H.imp('data/dungeons/index.ts');
const { resolveGate, DEVICE_FLAG_PREFIX } = await H.imp('systems/DungeonEvents.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { generateItem, categoriesForClass, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { partyScales, normalEnemyLevel } = await H.imp('systems/instanceScaling.ts');
const { Combat } = await H.imp('combat/Combat.ts');
const { SkillSystem } = await H.imp('combat/SkillSystem.ts');
const { HitShapes } = await H.imp('combat/HitShapes.ts');

const sceneW = (v) => (v + 0.5) * T; // tile -> world metres (the centre of the tile)
const inRectIncl = (x, z, r) => x >= r.rect.x && x <= r.rect.x + r.rect.w && z >= r.rect.z && z <= r.rect.z + r.rect.h;
const propsNear = (def, x, z, rad) => {
  for (const r of def.rooms) for (const p of r.props ?? []) {
    if (p.collide && Math.hypot(p.pos[0] - x, p.pos[1] - z) <= rad) return `${p.id ?? p.model.split('/').pop()} (${p.model.split('/').pop()}) at ${p.pos[0]},${p.pos[1]}`;
  }
  return null;
};
const inRect = (x, z, r) => x > r.rect.x && x < r.rect.x + r.rect.w && z > r.rect.z && z < r.rect.z + r.rect.h;

// ---------------------------------------------------------------------------------------------- anchors (tile coords)
/**
 * Named coordinate tables of the boss scripts that contentCheck.ts BOSS_ANCHORS does not carry (src/ai/bosses/<file>.ts, the
 * constant or the literal c.gdd / c.teleport target, cited per dungeon). Tile coords, the same convention as the dungeon files.
 */
const ANCHOR_TABLES = {
  buyucu_terasi: [ // buyucu_terasi.ts: DOME, ORB_PORTS, SOAK
    ['dome', 56.5, 24.5],
    ...[[30, 7], [35.5, 7], [41, 7], [26, 11], [26, 18], [45, 10.5], [45, 19], [29, 22], [42, 22]].map(([x, z], i) => [`orb_port_${i + 1}`, x, z]),
    ['soak_1', 40.5, 63.3], ['soak_2', 43.7, 66.5], ['soak_3', 40.5, 69.7], ['soak_4', 37.3, 66.5],
  ],
  kizil_dokumhane: [ // dokumhane.ts: Ignaroth's grate rows (x 4.5 / 12.5, z 46.5 / 50.5 / 54.5) and the teleport point c.gdd(8.5, 56)
    ...[46.5, 50.5, 54.5].flatMap((z) => [4.5, 12.5].map((x) => [`grate_${x}_${z}`, x, z])),
    ['teleport_p', 8.5, 56],
  ],
  golge_tapinagi: [['teleport_altar', 19.5, 3.5]], // golge.ts: c.gdd(19.5, 3.5) altar teleport
  kemik_mahzeni: [['teleport_throne', 20, 37.5]], // kemik.ts: c.gdd(20, 37.5) throne teleport
  buzul_tahti: [['teleport_ctr', 20.5, 5.5], ['teleport_dragon', 34.5, 41.2]], // buzul.ts: c.gdd(20.5, 5.5), c.gdd(34.5, 41.2)
  les_uyanisi: [ // les_uyanisi.ts: SLABS, LANDING
    ['slab_1', 31, 10], ['slab_2', 36.5, 11.5], ['slab_3', 42, 10], ['landing', 36.5, 10.2],
  ],
  peri_sisleri: [['droman_spawn', 21.5, 37.5], ['cocoon', 61.5, 58]], // peri_sisleri.ts: c.gdd(21.5, 37.5), c.gdd(61.5, 58)
  yanki_agi: [ // yanki_agi.ts: AV_EGGS, the web-mage spots (line 178), KK_SPINNER_SPOTS, KK_RUNNER_LANES
    ...[[35.5, 35], [35.8, 40], [45.5, 35], [45.5, 40.5], [37.5, 34], [43.5, 42.4]].map(([x, z], i) => [`av_egg_${i + 1}`, x, z]),
    ...[[23.3, 6.3], [30.7, 6.3], [23.3, 13.7], [30.7, 13.7]].map(([x, z], i) => [`web_spot_${i + 1}`, x, z]),
    ...[[49, 29], [61, 29], [55, 22.5]].map(([x, z], i) => [`kk_spinner_${i + 1}`, x, z]),
    ...[[48.5, 25], [61.5, 26.5], [48.5, 32.5]].map(([x, z], i) => [`kk_runner_${i + 1}`, x, z]),
  ],
  yigitler_sarayi: [ // yigitler_sarayi.ts: SOLSTEN, OLMYR, PAD_TILES, PEDESTAL, SKOVALD_GATE, DAIS_TELEPORT, OBLITERATOR_RIM, ledge
    ['solsten', 23.5, 14.5], ['olmyr', 31.5, 14.5],
    ...[[51.5, 13.5], [55.04, 12.04], [56.5, 8.5], [55.04, 4.96], [51.5, 3.5], [47.96, 4.96], [46.5, 8.5], [47.96, 12.04]].map(([x, z], i) => [`pad_${i + 1}`, x, z]),
    ['pedestal', 51.5, 8.5], ['skovald_gate', 51.5, 14.2], ['dais_teleport', 51.5, 6.5],
    ['obliterator_rim_1', 45.5, 8.5], ['obliterator_rim_2', 57.5, 8.5], ['ledge_teleport', 55.2, 44.2],
  ],
  yildiz_divani: [ // yildiz_divani.ts: WELL (soul well), GERDAN_POSTS (beacons), EMISSARIES (spawn points)
    ['soul_well', 22, 4.8],
    ...[[18.5, 39.5], [32.5, 39.5], [18.5, 49.5], [32.5, 49.5]].map(([x, z], i) => [`gerdan_beacon_${i + 1}`, x, z]),
    ['emissary_cazsar', 50.5, 38.5], ['emissary_baalgar', 55.5, 43.5], ['emissary_imakutya', 50, 46],
  ],
};
/** Anchors of one dungeon: contentCheck's BOSS_ANCHORS (prop ids, positions) plus the tables above. */
function anchorsOf(id) {
  const out = [];
  for (const [name, [x, z]] of Object.entries(cc.BOSS_ANCHORS[id] ?? {})) out.push({ name, x, z });
  for (const [name, x, z] of ANCHOR_TABLES[id] ?? []) out.push({ name, x, z });
  return out;
}

// ---------------------------------------------------------------------------------------------- models (as tools/content-check.mjs)
const models = new Map();
for (const def of Object.values(DUNGEONS)) for (const u of cc.dungeonUrls(def)) {
  if (models.has(u)) continue;
  const f = path.join(ROOT, 'public', u);
  if (!fs.existsSync(f)) { models.set(u, { exists: false }); continue; }
  if (/\/(characters|monsters|enemies|npcs)\//.test(u)) { models.set(u, { exists: true, skinned: true }); continue; }
  if (!/\.(glb|gltf)$/.test(u)) { models.set(u, { exists: true }); continue; }
  try {
    const buf = fs.readFileSync(f);
    const b = cc.glbBoundsFromBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    models.set(u, b ? { exists: true, box: b.box ?? undefined, skinned: b.skinned } : { exists: /\.gltf$/.test(u) });
  } catch { models.set(u, { exists: true }); }
}

// ---------------------------------------------------------------------------------------------- grid helpers
/** 4-way flood from the start (contentCheck flood): nearest walkable cell within 3 m of the start, then every connected cell. */
function floodFrom(walk, W, Hh, sx, sz) {
  const reach = new Uint8Array(W * Hh);
  const i0 = Math.floor(sx), j0 = Math.floor(sz);
  let best = -1, bd = 1e9;
  for (let j = j0 - 3; j <= j0 + 3; j++) for (let i = i0 - 3; i <= i0 + 3; i++) {
    if (i < 0 || j < 0 || i >= W || j >= Hh || !walk[j * W + i]) continue;
    const d = Math.hypot(i + 0.5 - sx, j + 0.5 - sz);
    if (d < bd) { bd = d; best = j * W + i; }
  }
  if (best < 0) return reach;
  const stack = [best];
  reach[best] = 1;
  while (stack.length) {
    const c = stack.pop();
    const ci = c % W, cj = (c / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
      const n = nj * W + ni;
      if (walk[n] && !reach[n]) { reach[n] = 1; stack.push(n); }
    }
  }
  return reach;
}
/** Same tolerance as contentCheck.reachable: a reached cell in the 3x3 block around the point (world metres). */
function reachAt(reach, W, Hh, wx, wz) {
  for (let j = Math.floor(wz) - 1; j <= Math.floor(wz) + 1; j++) for (let i = Math.floor(wx) - 1; i <= Math.floor(wx) + 1; i++) {
    if (i >= 0 && j >= 0 && i < W && j < Hh && reach[j * W + i]) return true;
  }
  return false;
}
/** A pack is pulled from a reached cell: its centre when walkable, else (flyers over lava) a reached cell within 3 m. */
function packReached(reach, W, Hh, walk, p) {
  const cx = sceneW(p.center[0]), cz = sceneW(p.center[1]);
  if (clearAt(walk, W, Hh, cx, cz, 0.4)) return reachAt(reach, W, Hh, cx, cz);
  for (let j = Math.floor(cz - 3); j <= Math.floor(cz + 3); j++) for (let i = Math.floor(cx - 3); i <= Math.floor(cx + 3); i++) {
    if (i >= 0 && j >= 0 && i < W && j < Hh && reach[j * W + i] && Math.hypot(i + 0.5 - cx, j + 0.5 - cz) <= 3) return true;
  }
  return false;
}

/** True when every cell within r m of (x, z) is walkable (contentCheck clearAt). */
function clearAt(walk, W, Hh, x, z, r) {
  for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
    if (Math.hypot(i + 0.5 - x, j + 0.5 - z) > r + 0.2) continue;
    if (i < 0 || j < 0 || i >= W || j >= Hh || !walk[j * W + i]) return false;
  }
  return true;
}
/** Cells of a closed door: the opening span on the two wall rows (the door posts stay blocked anyway). */
function doorCells(d, W, Hh) {
  const g = cc.doorGeo(d);
  const out = [];
  if (g.line === 'z') for (let i = g.lo; i < g.hi; i++) for (const j of [g.at - 1, g.at]) out.push(j * W + i);
  else for (let j = g.lo; j < g.hi; j++) for (const i of [g.at - 1, g.at]) out.push(j * W + i);
  return out.filter((k) => k >= 0 && k < W * Hh);
}
const roomsReached = (def, reach, W, Hh) => new Set(def.rooms.filter((r) => {
  for (let j = r.rect.z * T; j < (r.rect.z + r.rect.h) * T; j++) for (let i = r.rect.x * T; i < (r.rect.x + r.rect.w) * T; i++) {
    if (reach[j * W + i]) return true;
  }
  return false;
}).map((r) => r.id));

// ---------------------------------------------------------------------------------------------- progression (gates + kills)
/**
 * Clears the dungeon as a player would (non-optional packs in reach first, then the next boss in order when its spawn is in reach)
 * and re-evaluates every door after each change. Returns the final dead sets, the final nav state and the kill log.
 */
function progression(def, base) {
  const W = base.w, Hh = base.h;
  const packs = def.packs.filter((p) => !p.optional);
  const flags = {};
  for (const d of def.doors) {
    if (d.gate === 'event_lock' && d.event) flags[d.event] = true; // assumed solved (no puzzle sim)
    if (d.gate === 'device_lock' && d.device) flags[DEVICE_FLAG_PREFIX + d.device] = true; // assumed solved
  }
  const dead = { packs: new Set(), bosses: new Set() };
  const killLog = [];
  const forcesOf = (p) => p.members.reduce((s, m) => s + (getEnemyDef(m.enemyId)?.forces ?? 0), 0);
  const bossIn = (roomId) => def.bosses.find((b) => b.roomId === roomId);
  let state = null;
  const evalGates = () => {
    const deadEnemies = new Set();
    for (const p of def.packs) if (dead.packs.has(p.id)) for (const m of p.members) deadEnemies.add(m.enemyId);
    const forcesDone = packs.filter((p) => dead.packs.has(p.id)).reduce((s, p) => s + forcesOf(p), 0) >= def.forcesRequired;
    const walk = base.walk.slice();
    const closed = [];
    for (const d of def.doors) {
      const boss = [d.a, d.b].map(bossIn).find((b) => b) ?? null;
      const facts = {
        flags, deadPacks: dead.packs, killedEnemies: deadEnemies, deadBosses: dead.bosses, forcesDone,
        boss: boss ? { id: boss.bossId, engaged: false, defeated: dead.bosses.has(boss.bossId) } : null,
        earlierBossAlive: boss ? def.bosses.some((b) => b.order < boss.order && !dead.bosses.has(b.bossId)) : false,
      };
      if (resolveGate(d, facts) === false) {
        closed.push(d);
        for (const k of doorCells(d, W, Hh)) walk[k] = 0;
      }
    }
    return { walk, closed, reach: floodFrom(walk, W, Hh, sceneW(def.start.pos[0]), sceneW(def.start.pos[1])) };
  };
  for (let iter = 0; iter < 80; iter++) {
    state = evalGates();
    let changed = false;
    for (const p of packs) {
      if (!dead.packs.has(p.id) && packReached(state.reach, W, Hh, base.walk, p)) { dead.packs.add(p.id); changed = true; }
    }
    const alive = def.bosses.filter((b) => !dead.bosses.has(b.bossId));
    if (alive.length) {
      const lowest = Math.min(...alive.map((b) => b.order));
      for (const b of alive) {
        if (b.order === lowest && reachAt(state.reach, W, Hh, sceneW(b.pos[0]), sceneW(b.pos[1]))) {
          dead.bosses.add(b.bossId);
          killLog.push({ boss: b.bossId, order: b.order, room: b.roomId, iter });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  state = evalGates(); // gates of the final dead sets
  return { dead, killLog, state, packs, forcesOf };
}

// ---------------------------------------------------------------------------------------------- the smoke fight
const DUNGEON_SPEC = 'knight_blademaster'; // tank class; the bot is the only player
const spec = SPECS[DUNGEON_SPEC];
const SLOTS = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];
const FACTORS = partyScales(1, 'normal');
const monsterHP = (L) => Math.round(14 + 0.62 * L * L);
const monsterDmg = (L) => Math.round(14 + 4.5 * L);

function buildCharacter(level) {
  const rng = new RNG(level * 31 + 7);
  const ch = CharacterState.create('Sim', spec.classId);
  ch.save.level = level;
  ch.save.spec = spec.id;
  ch.save.skillBar = { ...spec.defaultBar };
  ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  ch.recomputeStats(false);
  const cats = categoriesForClass(spec.classId);
  for (const slot of SLOTS) {
    const options = cats.filter((c) => slotsForCategory(c).includes(slot));
    if (!options.length) continue;
    const item = generateItem({ itemLevel: level, rarity: 'uncommon', classId: spec.classId, category: options[0], smart: true }, rng);
    ch.addItem(item);
    if (!ch.equip(item.uid)) ch.removeItem(item.uid);
  }
  return ch;
}

/** Boss stats as dungeon_run.spawnSpec: monsterHP / monsterDmg of GDD_SYSTEMS 1.10, the party boss factors. */
function bossSpec(defId, level) {
  const def = getEnemyDef(defId);
  if (!def) throw new Error(`unknown enemy ${defId}`);
  const hp = Math.max(1, Math.round(monsterHP(level) * def.hpMult * FACTORS.hp));
  const dmg = monsterDmg(level) * def.dmgMult * FACTORS.dmg * FACTORS.bossDmg;
  const basic = def.basic ?? def.basicAttack ?? {};
  return {
    def, hp, dmg, level, armor: def.armorMult ? 10 * level * def.armorMult : 0,
    range: basic.range ?? def.attackRange ?? 2, cooldown: basic.cooldown ?? 2, windup: basic.windup ?? 0.45,
    coef: basic.damage?.coef ?? 1, speed: def.speed ?? 4,
  };
}
const dist = (p, e) => Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);

/**
 * One boss fight. The boss stands on its dungeon spawn with NO boss script (BossController is not run headless): it walks in and swings
 * its basic attack (windup, cooldown, real mitigation). The bot walks into reach and taps LMB every 0.36 s (the harness controller).
 * A bot death costs DEATH_PENALTY_S and a full heal, the fight goes on (the boss keeps its HP).
 */
function bossFight(bossId, def, level, enemyLevel) {
  const bs = bossSpec(bossId, enemyLevel);
  const ch = buildCharacter(level);
  G.combat = new Combat();
  G.combat.rng = new RNG(0x51ed);
  G.skills = new SkillSystem();
  G.hitShapes = new HitShapes();
  const p = H.addPlayer(spec.classId, level);
  p.stats = { ...ch.stats };
  p.maxHp = Math.max(1, Math.round(ch.stats.maxHp ?? 200));
  p.hp = p.maxHp;
  p.armorSnapshot = ch.stats.armor;
  H.clearEvents();
  const bx = sceneW(def.pos[0]), bz = sceneW(def.pos[1]);
  const arena = def.arenaRoom;
  const cx = sceneW(arena.rect.x + arena.rect.w / 2), cz = sceneW(arena.rect.z + arena.rect.h / 2);
  const ang = Math.atan2(cx - bx, cz - bz);
  p.position.x = bx + Math.sin(ang) * 6;
  p.position.z = bz + Math.cos(ang) * 6;
  const boss = H.addEnemy(bx, bz, { rank: 'boss', hp: bs.hp });
  boss.def = { ...bs.def, anims: { hit: 'Hit_A', death: 'Death_A' } };
  boss.isBoss = true;
  boss.level = level;
  boss.maxHp = boss.hp = bs.hp;
  boss.baseDamage = bs.dmg;
  boss.stats = { armor: bs.armor };
  boss.spec = bs;
  boss.radius = 0.6;
  const hp0 = boss.hp;
  let t = 0, nextTap = 0, deaths = 0, windupEnd = -1, nextAt = 0, dmgTaken = 0;
  while (t < FIGHT_LIMIT_S && !boss.isDead) {
    const d = dist(p, boss);
    const inReach = d <= 2.2;
    if (!inReach) {
      const dx = boss.position.x - p.position.x, dz = boss.position.z - p.position.z;
      const l = Math.hypot(dx, dz) || 1;
      p.position.x += (dx / l) * Math.min(d - 1.8, 3.2 * DT);
      p.position.z += (dz / l) * Math.min(d - 1.8, 3.2 * DT);
    }
    p.yaw = Math.atan2(boss.position.x - p.position.x, boss.position.z - p.position.z);
    H.setAimTarget(boss);
    if (inReach && t >= nextTap) { H.tap('lmb'); nextTap = t + 0.36; } else H.step(1);
    t += DT;
    if (!boss.isDead) {
      if (dist(p, boss) > bs.range) {
        const dx = p.position.x - boss.position.x, dz = p.position.z - boss.position.z;
        const l = Math.hypot(dx, dz) || 1;
        boss.position.x += (dx / l) * bs.speed * DT;
        boss.position.z += (dz / l) * bs.speed * DT;
        windupEnd = -1;
      } else if (windupEnd < 0 && t >= nextAt) {
        windupEnd = t + bs.windup;
      } else if (windupEnd >= 0 && t >= windupEnd) {
        windupEnd = -1;
        nextAt = t + bs.cooldown;
        const amount = G.combat.mitigate(p, bs.dmg * bs.coef, 'physical', bs.level);
        p.hp -= amount;
        dmgTaken += amount;
      }
    }
    if (p.hp <= 0) { deaths++; t += DEATH_PENALTY_S; p.hp = p.maxHp; }
  }
  H.setAimTarget(null);
  const lostPct = 100 * (1 - Math.max(0, boss.hp) / hp0);
  return { dead: boss.isDead, lostPct, t, deaths, dmgTaken: Math.round(dmgTaken), bossHp: Math.round(hp0) };
}

// ---------------------------------------------------------------------------------------------- run
let nDungeonPass = 0, nDungeonFail = 0;
const totalStart = Date.now();
const ids = [...new Set(Object.keys(DUNGEONS))];
console.log(`dungeon_all: ${ids.length} registered dungeons (MPLUS_POOL ${MPLUS_POOL.length}), smoke bot ${spec.id}, fight limit ${FIGHT_LIMIT_S} s`);
for (const id of ids) {
  const def = DUNGEONS[id];
  const fails = [];
  const fail = (check, msg) => fails.push(`[${check}] ${msg}`);
  const W = def.grid.w * T, Hh = def.grid.h * T;
  const base = { w: W, h: Hh, walk: cc.buildNav(def, models).walk };
  const startWorld = [sceneW(def.start.pos[0]), sceneW(def.start.pos[1])];

  // ---- 1. reach with all gates open
  const openReach = floodFrom(base.walk, W, Hh, startWorld[0], startWorld[1]);
  const openRooms = roomsReached(def, openReach, W, Hh);
  for (const r of def.rooms) if (!openRooms.has(r.id)) fail('reach', `room ${r.id} (rect ${r.rect.x},${r.rect.z} ${r.rect.w}x${r.rect.h}) is not reachable from the start with all gates open`);
  const roomCount = def.rooms.length;

  // ---- 1b. boss order and exit after the progression sim
  const prog = progression(def, base);
  const bossesOrdered = [...def.bosses].sort((a, b) => a.order - b.order);
  const killedSet = prog.dead.bosses;
  for (const b of bossesOrdered) {
    if (killedSet.has(b.bossId)) continue;
    const lowest = Math.min(...bossesOrdered.filter((x) => !killedSet.has(x.bossId)).map((x) => x.order));
    if (b.order !== lowest) continue;
    const closedAdj = prog.state.closed.map((d) => {
      const ra = def.rooms.find((r) => r.id === d.a), rb = def.rooms.find((r) => r.id === d.b);
      const reachA = prog.state.reach && ra && roomsReached({ rooms: [ra] }, prog.state.reach, W, Hh).size > 0;
      const reachB = rb && roomsReached({ rooms: [rb] }, prog.state.reach, W, Hh).size > 0;
      return reachA !== reachB ? `${d.a}|${d.b} ${d.gate}` : null;
    }).filter(Boolean);
    fail('boss-order', `${b.bossId} (order ${b.order}, room ${b.roomId}, spawn ${b.pos[0]},${b.pos[1]}) is not reachable after clearing every reachable pack; closed doors at the frontier: ${closedAdj.join(', ') || 'none (the room is cut off by the nav)'}`);
  }
  const exitOk = reachAt(prog.state.reach, W, Hh, sceneW(def.exit.pos[0]), sceneW(def.exit.pos[1]));
  if (!exitOk) fail('exit', `exit ${def.exit.pos[0]},${def.exit.pos[1]} is not reachable after the progression (${killedSet.size}/${def.bosses.length} bosses dead)`);
  if (killedSet.size === def.bosses.length && !exitOk) fail('exit', `all ${def.bosses.length} bosses dead but the exit ${def.exit.pos} is cut off`);

  // ---- 2. spawns and anchors
  const arenas = def.rooms.filter((r) => r.boss !== undefined);
  for (const b of def.bosses) {
    const room = def.rooms.find((r) => r.id === b.roomId);
    if (!room) { fail('spawn', `${b.bossId} roomId ${b.roomId} is not a room`); continue; }
    if (room.boss === undefined) fail('spawn', `${b.bossId} room ${b.roomId} has no boss arena flag (boss: n)`);
    if (!inRect(b.pos[0], b.pos[1], room)) fail('spawn', `${b.bossId} spawn ${b.pos[0]},${b.pos[1]} is outside its arena ${b.roomId} (rect ${room.rect.x},${room.rect.z} ${room.rect.w}x${room.rect.h})`);
    if (!clearAt(base.walk, W, Hh, sceneW(b.pos[0]), sceneW(b.pos[1]), 1.5)) fail('spawn', `${b.bossId} spawn ${b.pos[0]},${b.pos[1]} (room ${b.roomId}) is on blocked ground`);
  }
  const anchors = anchorsOf(id);
  for (const a of anchors) {
    const arena = arenas.find((r) => inRectIncl(a.x, a.z, r));
    if (!arena) {
      const room = def.rooms.find((r) => inRectIncl(a.x, a.z, r));
      fail('anchor', `${a.name} at ${a.x},${a.z} is outside every boss arena (${room ? `inside room ${room.id}, rect ${room.rect.x},${room.rect.z} ${room.rect.w}x${room.rect.h}` : 'no room'})`);
    }
    if (!clearAt(base.walk, W, Hh, sceneW(a.x), sceneW(a.z), 0.5)) {
      const prop = propsNear(def, a.x, a.z, 1.5);
      fail('anchor', `${a.name} at ${a.x},${a.z}${arena ? ` (arena ${arena.id})` : ''} stands on blocked ground${prop ? `, under prop ${prop}` : ''}`);
    }
  }

  // ---- 3. shortcut kill_lock doors
  const shortcuts = def.doors.filter((d) => d.gate === 'kill_lock');
  for (const d of shortcuts) {
    for (const r of [d.a, d.b]) if (!openRooms.has(r)) fail('shortcut', `kill_lock ${d.a}|${d.b}: room ${r} is not reachable`);
    const o = d.opensOn ?? {};
    const died = (o.pack && prog.dead.packs.has(o.pack)) || (o.enemyId && def.packs.some((p) => !p.optional && prog.dead.packs.has(p.id) && p.members.some((m) => m.enemyId === o.enemyId))) || (o.boss && prog.dead.bosses.has(o.boss));
    const optionalPack = o.pack && def.packs.find((p) => p.id === o.pack)?.optional;
    if (!died && !optionalPack) {
      // nearest reached ground to the target pack (a flyer over lava is pulled from 3 m or less; beyond that only a ranged pull works)
      const pk = def.packs.find((p) => p.id === o.pack);
      let near = Infinity;
      if (pk) for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) if (prog.state.reach[j * W + i]) near = Math.min(near, Math.hypot(i + 0.5 - sceneW(pk.center[0]), j + 0.5 - sceneW(pk.center[1])));
      fail('shortcut', `kill_lock ${d.a}|${d.b} opensOn ${JSON.stringify(o)} never dies in the progression (target pack centre ${pk?.center ?? '?'}, nearest reached ground ${Number.isFinite(near) ? near.toFixed(1) : 'none'} m away)`);
    }
  }

  // ---- 4. forces
  const roster = prog.packs.reduce((s, p) => s + prog.forcesOf(p), 0);
  const unknown = def.packs.filter((p) => !p.optional).flatMap((p) => p.members.filter((m) => getEnemyDef(m.enemyId) === undefined).map((m) => m.enemyId));
  for (const u of [...new Set(unknown)]) fail('forces', `unknown enemy ${u} in a non-optional pack`);
  if (def.forcesRequired > roster) fail('forces', `forcesRequired ${def.forcesRequired} > non-optional roster forces ${roster}`);

  // ---- 5. smoke fight per boss
  const level = def.levelRange?.[1] ?? 30;
  const botLevel = Math.min(level, SMOKE_LEVEL_CAP);
  const enemyLevel = normalEnemyLevel(def.levelRange, botLevel);
  const smoke = [];
  for (const b of def.bosses) {
    const arenaRoom = def.rooms.find((r) => r.id === b.roomId);
    const engineErr0 = H.errors.length;
    let res;
    try {
      res = bossFight(b.bossId, { pos: b.pos, arenaRoom }, botLevel, enemyLevel);
    } catch (e) {
      res = { error: String(e?.message ?? e) };
    }
    if (res.error) { smoke.push(`${b.bossId} THREW ${res.error}`); fail('smoke', `${b.bossId} threw: ${res.error}`); continue; }
    const newErr = H.errors.length - engineErr0;
    const ok = res.dead || res.lostPct >= 60;
    smoke.push(`${b.bossId} ${res.dead ? 'dead' : `${res.lostPct.toFixed(0)}% lost`} in ${res.t.toFixed(0)} s, bot deaths ${res.deaths}, dmg taken ${res.dmgTaken}`);
    if (!ok) fail('smoke', `${b.bossId} survived ${FIGHT_LIMIT_S} s with ${res.lostPct.toFixed(1)}% HP lost (room ${b.roomId}, spawn ${b.pos[0]},${b.pos[1]}, boss hp ${res.bossHp}, bot level ${botLevel})`);
    if (newErr > 0) fail('smoke', `${b.bossId}: ${newErr} engine error(s), first: ${H.errors[engineErr0]}`);
  }

  // ---- report
  const pass = fails.length === 0;
  if (pass) nDungeonPass++; else nDungeonFail++;
  const bossSum = `${killedSet.size}/${def.bosses.length} boss in order`;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id.padEnd(18)} rooms ${openRooms.size}/${roomCount} | ${bossSum} | exit ${exitOk ? 'ok' : 'NO'} | spawns ${def.bosses.length} | anchors ${anchors.length} | shortcuts ${shortcuts.length} | forces ${def.forcesRequired}<=${roster} | smoke ${smoke.length} boss(es) lvl ${botLevel} (enemy ${enemyLevel})`);
  for (const s of smoke) console.log(`      smoke ${s}`);
  for (const f of fails) console.log(`      FAIL ${f}`);
}
console.log(`DUNGEON ALL: ${nDungeonPass} pass, ${nDungeonFail} fail`);
console.log(`elapsed ${((Date.now() - totalStart) / 1000).toFixed(1)} s (wall clock)`);
process.exit(nDungeonFail ? 1 : 0);
