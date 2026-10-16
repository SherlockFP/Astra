#!/usr/bin/env node
/**
 * Boss-fight sim: every boss of every registered dungeon (DUNGEONS, 13 dungeons) is fought by its REAL BossController with its real
 * BossScript (src/ai/bosses/*.ts) and ability kit (BossDef / EnemyDef of src/data/enemies*.ts), headless, in the real dungeon layout.
 * Nav: contentCheck buildNav (walls, props, zones, door posts) loaded into a real NavGrid at 1 m cells, as dungeon_all.mjs does.
 * Party in the arena: TANK (local player, real CharacterState gear, the whole action bar cast through SkillSystem; LMB every 0.36 s and
 * one other bar slot every 0.5 s), HEALER and DPS (FakePlayers that only dodge: a non-local actor cannot cast in SkillSystem, so the
 * sim's damage comes from the tank alone and kill times are an upper bound for a real party). Every bot dodges telegraphed shapes due
 * within 1 s and persisting ground zones, and paths around walls with NavGrid.findPath. The tank attacks the nearest gate add while
 * the boss is invulnerable (GATE_ADDS: Halkor's kef_shard packs are placed from the dungeon, as its script waits for them).
 * The fight runs up to 300 s of sim time at 30 Hz (DT = 1/30; the controller's timers take the same dt). Math.random is seeded per boss.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/boss_fights.mjs
 *   BOSS=<bossId> V=1 node ... dev/combat-sim/boss_fights.mjs    (one boss, with the casts and the final controller state)
 *
 * Per boss (one line each), PASS needs all of:
 *  - no exception thrown, and no ERR line logged during the fight (WARN lines are reported as info only);
 *  - every scripted ability (BossScript.abilities keys, phase abilities, onEnter abilities; passives excluded) cast at least once;
 *  - every hit shape from an enemy source that lands (boss or adds; not projectiles) has its origin inside the boss arena on walkable ground;
 *  - every phase whose HP threshold the boss crossed fired a boss:phase event;
 *  - the boss died, or lost >= 60 % of its HP in the fight.
 * Deaths are bot deaths (a dead bot is revived at once and the death is counted). Time is the sim time of the kill, or 300 s.
 * Ends with `BOSS FIGHTS: N pass, M fail`; exit 1 on any failure.
 */
import * as H from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { G } = H;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const T = 4;                 // nav cells per GDD tile (contentCheck convention); 1 cell = 1 m in scene units
const FIGHT_LIMIT_S = 300;
const DT = 1 / 30;
const ONLY = process.env.BOSS || null;
const VERBOSE = !!process.env.V;
const BOT_SPEED = 6.5;       // m/s, dodge and walk speed of the bots
const DODGE_LEAD_S = 1.0;    // a pending shape due within this many seconds makes the bot move
const LMB_PERIOD = 0.36;     // tank cast cadence (the harness LMB chain)
/**
 * Dungeon-placed enemies that a boss script waits for (the script reads them from the world, the dungeon places them in its packs).
 * Halkor sleeps immune until three dead kef_shard enemies exist (kefaret_salonlari.ts deadShards), so the sim places the shard packs.
 */
const GATE_ADDS = { boss_halkor: 'kef_shard' };
const SKILL_PERIOD = 0.5;    // tank: one bar slot (other than LMB) every 0.5 s, round robin

const cc = await H.imp('dev/contentCheck.ts');
const { DUNGEONS } = await H.imp('data/dungeons/index.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
const { World } = await H.imp('world/World.ts');
const { NavGrid } = await H.imp('world/NavGrid.ts');
const { BossController } = await H.imp('ai/BossController.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const { BOSS_SCRIPTS } = await H.imp('ai/bosses/index.ts');
const { Combat } = await H.imp('combat/Combat.ts');
const { SkillSystem } = await H.imp('combat/SkillSystem.ts');
const { HitShapes } = await H.imp('combat/HitShapes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { generateItem, categoriesForClass, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { partyScales, normalEnemyLevel } = await H.imp('systems/instanceScaling.ts');

// the sim owns these service stubs (the harness covers the common ones); missing methods are no-ops, never silent data
G.vfx = new Proxy(G.vfx, { get: (t, k) => (k in t ? t[k] : () => ({ alive: false, stop() {}, setPosition() {}, setProgress() {}, setTransform() {}, cancel() {} })) });
G.audio = new Proxy(G.audio, { get: (t, k) => (k in t ? t[k] : () => {}) });
G.mplus = Object.assign({ state: null, decorateHitShape: (_enemy, spec) => spec, enemyScaling: () => ({ hp: 1, dmg: 1 }), partyHpMult: () => 1, partyFactors: () => null, onEnemySpawned() {} }, G.mplus);
G.minions ??= { spawn() {}, update() {}, list: () => [] };

const sceneW = (v) => (v + 0.5) * T; // tile -> world metres (the centre of the tile)
const dist = (a, b) => Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);

// ---------------------------------------------------------------------------------------------- models and nav (as dungeon_all)
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
const navCache = new Map();
/** The dungeon's walkable grid (cc.buildNav) loaded into a real NavGrid with 1 m cells: cell (i, j) = scene metres (i, j). */
function navFor(def) {
  if (navCache.has(def.id)) return navCache.get(def.id);
  const W = def.grid.w * T, Hh = def.grid.h * T;
  const walk = cc.buildNav(def, models).walk;
  const nav = new NavGrid({ originX: 0, originZ: 0, width: W, depth: Hh, cellSize: 1, walkable: false });
  nav.cells.set(walk);
  const out = { nav, W, Hh };
  navCache.set(def.id, out);
  return out;
}

// ---------------------------------------------------------------------------------------------- scaling (as dungeon_all / spawnEnemy)
const FACTORS = partyScales(1, 'normal');
const monsterHP = (L) => Math.round(14 + 0.62 * L * L);
const monsterDmg = (L) => Math.round(14 + 4.5 * L);
const SLOTS = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];
const TANK_SPEC = SPECS.knight_blademaster;

/** The tank's character: real CharacterState stats and generated uncommon gear at the bot level (as dungeon_all.buildCharacter). */
function buildCharacter(spec, level) {
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

// ---------------------------------------------------------------------------------------------- hit shape geometry
/** Does the footprint of a TelegraphShape placed at (ox, oz) facing (dx, dz) cover the ground point (x, z)? */
function covers(sh, ox, oz, dx, dz, x, z) {
  const px = x - ox, pz = z - oz;
  const d = Math.hypot(px, pz);
  const along = px * dx + pz * dz;
  const perp = Math.abs(-px * dz + pz * dx);
  switch (sh.type) {
    case 'circle': return d <= sh.radius;
    case 'ring': return d >= sh.inner && d <= sh.outer;
    case 'cone': {
      if (d > sh.radius) return false;
      if (d < 1e-6) return true;
      return along / d >= Math.cos((sh.angle * Math.PI) / 360);
    }
    case 'line': return along >= 0 && along <= sh.length && perp <= sh.width / 2;
    case 'rect': return Math.abs(along) <= sh.length / 2 && perp <= sh.width / 2;
    default: return false;
  }
}

/** Shapes a bot must leave: pending enemy windups due within DODGE_LEAD_S, and persisting ground zones. Projectiles and soaks are skipped. */
function dangerList(hs) {
  const out = [];
  for (const a of hs.shapes.values()) {
    const s = a.spec;
    if (!s.shape || s.projectile || s.kind === 'safe' || s.kind === 'friendly' || s.kind === 'soak') continue;
    if (a.state === 'pending' && s.telegraph && s.delay - a.t <= DODGE_LEAD_S) out.push(a);
    else if (a.state === 'persist') out.push(a);
  }
  return out;
}
const dangerAt = (list, x, z) => list.reduce((n, a) => n + (covers(a.spec.shape, a.ox, a.oz, a.dx, a.dz, x, z) ? 1 : 0), 0);

/** Walk one bot out of the danger: the reachable point (2, 3.5 or 5 m, 16 directions) with the least danger, then the nearest. */
function dodge(bot, dt, list, ctrl, nav) {
  const here = dangerAt(list, bot.position.x, bot.position.z);
  if (!here) return false;
  let best = null, bestScore = Infinity;
  for (let k = 0; k < 16; k++) {
    const ang = (k * Math.PI) / 8;
    for (const r of [2, 3.5, 5]) {
      const x = bot.position.x + Math.cos(ang) * r, z = bot.position.z + Math.sin(ang) * r;
      if (!nav.isWalkable(x, z) || !ctrl.insideArena(x, z, 0)) continue;
      const score = dangerAt(list, x, z) * 100 + r;
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  if (!best) return false;
  stepTo(bot, best.x, best.z, BOT_SPEED * dt, nav);
  return true;
}

/** Walk toward (x, z) along a NavGrid path (re-planned every 0.6 s): the straight step when it is walkable, else the path. */
function chase(bot, x, z, step, nav, st) {
  const d = Math.hypot(x - bot.position.x, z - bot.position.z);
  if (d < 1e-4) return;
  const direct = Math.min(d, step);
  const nx = bot.position.x + ((x - bot.position.x) / d) * direct, nz = bot.position.z + ((z - bot.position.z) / d) * direct;
  if (nav.isWalkable(nx, nz) && d < 6) { stepTo(bot, x, z, step, nav); return; }
  if (!st.path || st.at <= st.clock || st.goal !== undefined && Math.hypot(st.goal.x - x, st.goal.z - z) > 1.5) {
    st.path = nav.findPath({ x: bot.position.x, z: bot.position.z }, { x, z }) ?? [];
    st.at = st.clock + 0.6;
    st.goal = { x, z };
  }
  while (st.path.length && Math.hypot(st.path[0].x - bot.position.x, st.path[0].z - bot.position.z) < 0.6) st.path.shift();
  if (st.path.length) stepTo(bot, st.path[0].x, st.path[0].z, step, nav);
}

/** Move a bot up to `step` metres toward (x, z), never onto unwalkable ground. */
function stepTo(bot, x, z, step, nav) {
  const dx = x - bot.position.x, dz = z - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const s = Math.min(d, step);
  const nx = bot.position.x + (dx / d) * s, nz = bot.position.z + (dz / d) * s;
  if (nav.isWalkable(nx, nz)) {
    bot.position.x = nx;
    bot.position.z = nz;
    bot.yaw = Math.atan2(dx, dz);
  }
}

// ---------------------------------------------------------------------------------------------- one boss fight
/** Party bots in the arena: the tank 4 m from the boss toward the arena centre, healer and DPS at 3 m to either side. */
function placeParty(bot, cx, cz, nav, offset) {
  const p = nav.nearestWalkable(cx + offset[0], cz + offset[1], 6) ?? { x: cx, z: cz };
  bot.position.x = p.x;
  bot.position.z = p.z;
}

/** Shared event log of the boss phase / lifecycle events (filtered per boss by bossId). */
const bossEvents = [];
for (const name of ['boss:phase', 'boss:engaged', 'boss:defeated', 'boss:wipe']) G.events.on(name, (e) => bossEvents.push({ name, ...e }));

/** Math.random replaced by a seeded stream (mulberry32 over an FNV-1a hash of `key`); returns the restore function. */
function seedRandom(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  let s = h >>> 0;
  const orig = Math.random;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = orig; };
}

/**
 * Fights one boss. Returns the measurements; never throws (an exception is returned as `crash`).
 */
function fightBoss(def, b, botLevel, enemyLevel) {
  const bdef = getEnemyDef(b.bossId);
  // deterministic scripts: the boss scripts draw Math.random (targets, spreads); each fight gets its own seeded stream
  const restoreRandom = seedRandom(`${b.bossId}`);
  const { nav, W, Hh } = navFor(def);
  const world = new World(new H.THREE.Scene(), nav);
  G.world = world;
  G.combat = new Combat();
  G.combat.rng = new RNG(0x51ed);
  G.skills = new SkillSystem();
  G.hitShapes = new HitShapes();
  G.character.save.skillBar = { ...TANK_SPEC.defaultBar };
  G.character.classId = TANK_SPEC.classId;
  G.character.specials = {};
  const errStart = H.errors.length;
  const evStart = bossEvents.length;

  // the party: tank (local, real gear), healer and DPS (stand-ins that only dodge)
  const ch = buildCharacter(TANK_SPEC, botLevel);
  const tank = new H.FakePlayer(TANK_SPEC.classId, botLevel);
  tank.id = 1;
  tank.stats = { ...ch.stats };
  tank.maxHp = Math.max(1, Math.round(ch.stats.maxHp ?? 200));
  tank.hp = tank.maxHp;
  tank.armorSnapshot = ch.stats.armor;
  const healer = new H.FakePlayer('priest', botLevel);
  healer.id = 2;
  const dps = new H.FakePlayer('mage', botLevel);
  dps.id = 3;
  for (const p of [healer, dps]) { p.maxHp = tank.maxHp; p.hp = tank.maxHp; p.isLocal = false; }
  world.add(tank);
  world.add(healer);
  world.add(dps);
  world.localPlayer = G.player = tank;

  // the boss: a real Enemy body with the production fields of EnemyFactory.spawnEnemy, and its real BossController
  const hpBoss = Math.max(1, Math.round(monsterHP(enemyLevel) * bdef.hpMult * FACTORS.hp));
  const dmgBoss = monsterDmg(enemyLevel) * bdef.dmgMult * FACTORS.dmg * FACTORS.bossDmg;
  const bx = sceneW(b.pos[0]), bz = sceneW(b.pos[1]);
  const room = def.rooms.find((r) => r.id === b.roomId);
  const cxR = sceneW(room.rect.x + room.rect.w / 2), czR = sceneW(room.rect.z + room.rect.h / 2);
  const boss = new Enemy(500, bdef);
  boss.authority = true;
  boss.level = enemyLevel;
  boss.homeX = bx;
  boss.homeZ = bz;
  boss.position.set(bx, 0, bz);
  boss.object3d.position.set(bx, 0, bz);
  boss.yaw = Math.atan2(cxR - bx, czR - bz);
  boss.maxHp = boss.hp = hpBoss;
  boss.baseDamage = dmgBoss;
  boss.stats = bdef.armorMult ? { armor: 10 * enemyLevel * bdef.armorMult } : {};
  boss.dynamic = false;
  boss.forcesCounted = false;
  boss.ownerId = null;
  boss.tag = '';
  boss.packId = null;
  world.add(boss);
  // the dungeon's gate enemies (GATE_ADDS): every pack member of that enemy, at the pack centre, with its own AI (as a pack spawn)
  const gateId = GATE_ADDS[b.bossId];
  if (gateId) {
    let k = 0;
    for (const pk of def.packs) for (const m of pk.members) {
      if (m.enemyId !== gateId) continue;
      const gdef = getEnemyDef(gateId);
      const g = new Enemy(600 + k++, gdef);
      g.authority = true;
      g.level = enemyLevel;
      g.homeX = g.position.x = sceneW(pk.center[0]);
      g.homeZ = g.position.z = sceneW(pk.center[1]);
      g.object3d.position.set(g.position.x, 0, g.position.z);
      g.maxHp = g.hp = Math.max(1, Math.round(monsterHP(enemyLevel) * gdef.hpMult * FACTORS.hp));
      g.baseDamage = monsterDmg(enemyLevel) * gdef.dmgMult * FACTORS.dmg;
      g.stats = {};
      g.dynamic = false;
      g.forcesCounted = false;
      world.add(g);
      g.ai = new EnemyAI(g, getDirector(world));
    }
  }
  let ctrl;
  try {
    boss.setLocomotion?.('idle');
    ctrl = new BossController(boss, getDirector(world));
    boss.ai = ctrl;
  } catch (err) {
    restoreRandom();
    return { crash: `BossController ctor: ${err?.stack ?? err}`, bossHp: hpBoss, boss, ctrl: null };
  }

  // measurements
  const cast = new Map();
  const origStart = ctrl.startAbility.bind(ctrl);
  ctrl.startAbility = (ab, target, dd) => { cast.set(ab.id, (cast.get(ab.id) ?? 0) + 1); return origStart(ab, target, dd); };
  let landed = 0;
  const landBad = [];
  const origLand = G.hitShapes.land.bind(G.hitShapes);
  G.hitShapes.land = (a) => {
    const s = a.spec;
    const src = s.sourceId !== null ? world.get(s.sourceId) : undefined;
    if (src && src.kind === 'enemy' && !s.projectile) {
      landed++;
      const inArena = ctrl.insideArena(a.ox, a.oz, 0);
      const walk = nav.isWalkable(a.ox, a.oz);
      if (!inArena || !walk) {
        const a0 = ctrl.arena; landBad.push(`${s.abilityName ?? s.kind ?? "shape"} (${s.shape.type}) origin ${a.ox.toFixed(1)},${a.oz.toFixed(1)} ${!inArena ? "outside arena" : "on blocked ground"} [source ${src.def?.id ?? src.id} at ${src.position.x.toFixed(1)},${src.position.z.toFixed(1)}; arena c ${a0.cx.toFixed(1)},${a0.cz.toFixed(1)} w ${a0.w} h ${a0.h}]`);
      }
    }
    return origLand(a);
  };

  let t = 0, deaths = 0, minFrac = 1, crash = null;
  const hpStart = boss.hp;
  const anchor = [[4, 0], [-3, 2.5], [-2.5, -3]];
  placeParty(tank, bx, bz, nav, [(cxR - bx) * 0.25, (czR - bz) * 0.25]);
  placeParty(healer, bx, bz, nav, [anchor[1][0] + (cxR - bx) * 0.25, anchor[1][1] + (czR - bz) * 0.25]);
  placeParty(dps, bx, bz, nav, [anchor[2][0] + (cxR - bx) * 0.25, anchor[2][1] + (czR - bz) * 0.25]);
  let tankNext = 0, skillNext = 0, skillIdx = 0;
  const chaseSt = { path: null, at: 0, clock: 0, goal: undefined };
  const nearestGate = (p) => world.enemies
    .filter((o) => o.def.id === gateId && !o.isDead && !o.removed)
    .sort((a, c) => dist(p, a) - dist(p, c))[0];
  const TANK_SLOTS = Object.keys(TANK_SPEC.defaultBar).filter((k) => k !== "lmb");
  const bots = [tank, healer, dps];
  try {
    while (t < FIGHT_LIMIT_S && !boss.isDead) {
      // bots: dodge first, then the tank chases and casts
      const list = dangerList(G.hitShapes);
      for (const bot of bots) {
        if (bot.isDead) continue;
        const moved = dodge(bot, DT, list, ctrl, nav);
        if (bot !== tank || moved || tank.isDead) continue;
        // target: the boss, or while it is invulnerable (a gate not yet open) the nearest living gate add
        const invul = boss.statuses.has('invulnerable');
        const tgt = invul ? nearestGate(tank) ?? boss : boss;
        const d = dist(tank, tgt);
        if (d > 2.2) chase(tank, tgt.position.x, tgt.position.z, BOT_SPEED * DT, nav, chaseSt);
        tank.yaw = Math.atan2(tgt.position.x - tank.position.x, tgt.position.z - tank.position.z);
        if (d <= 2.4 && t >= tankNext) {
          G.skills.tryCastSlot(tank, 'lmb', H.aimFor(tank, tgt));
          tankNext = t + LMB_PERIOD;
        }
        // the rest of the tank's action bar, round robin (the sim's only casting player, see the header)
        if (TANK_SLOTS.length && t >= skillNext && d <= 8) {
          const slot = TANK_SLOTS[skillIdx++ % TANK_SLOTS.length];
          G.skills.tryCastSlot(tank, slot, H.aimFor(tank, tgt));
          skillNext = t + SKILL_PERIOD;
        }
      }
      G.engine.time += DT;
      chaseSt.clock = t;
      H.setAimTarget(null);
      world.update(DT);
      G.skills.update(DT);
      G.combat.update(DT);
      G.hitShapes.update(DT);
      t += DT;
      minFrac = Math.min(minFrac, Math.max(0, boss.hp) / boss.maxHp);
      for (const bot of bots) {
        if (!bot.isDead) continue;
        deaths++;
        bot.alive = true;
        bot.hp = bot.maxHp;
        placeParty(bot, bx, bz, nav, bot === tank ? [0, 0] : bot === healer ? [-3, 2.5] : [-2.5, -3]);
      }
    }
  } catch (err) {
    crash = `${err?.stack ?? err}`.split('\n').slice(0, 4).join(' | ');
  }
  const newErrors = H.errors.slice(errStart);
  const phaseEv = bossEvents.slice(evStart).filter((e) => e.bossId === b.bossId && e.name === 'boss:phase').map((e) => e.phase);
  restoreRandom();
  return {
    crash, t, deaths, dead: boss.isDead, lostPct: 100 * (1 - Math.max(0, boss.hp) / hpStart), minFrac, cast, landed, landBad,
    phaseEv, newErrors, ctrl, boss, hpBoss,
    dbg: {
      tankPos: [tank.position.x, tank.position.z].map((v) => v.toFixed(1)), bossPos: [boss.position.x, boss.position.z].map((v) => v.toFixed(1)),
      dist: dist(tank, boss).toFixed(1), stage: ctrl?.state?.stage, phaseIdx: ctrl?.phaseIdx, engaged: ctrl?.engaged,
      shield: boss.statuses.has('shield'), invul: boss.statuses.has('invulnerable'), hp: Math.round(boss.hp), tankDead: tank.isDead,
    },
  };
}

// ---------------------------------------------------------------------------------------------- run
const botLevelOf = (def) => Math.min(def.levelRange?.[1] ?? 30, 60);
let nPass = 0, nFail = 0;
const totalStart = Date.now();
const ids = Object.keys(DUNGEONS);
console.log(`boss_fights: ${ids.length} dungeons, fight limit ${FIGHT_LIMIT_S} s sim time at ${Math.round(1 / DT)} Hz, bots: tank (local) + healer + dps (dodge only)`);
for (const id of ids) {
  const def = DUNGEONS[id];
  const botLevel = botLevelOf(def);
  const enemyLevel = normalEnemyLevel(def.levelRange, botLevel);
  for (const b of [...def.bosses].sort((x, y) => x.order - y.order)) {
    if (ONLY && b.bossId !== ONLY) continue;
    const script = BOSS_SCRIPTS[b.bossId] ?? { abilities: {} };
    const bdef = getEnemyDef(b.bossId);
    const scripted = new Set([...Object.keys(script.abilities ?? {})]);
    for (const ph of bdef?.phases ?? []) {
      for (const a of ph.abilities) scripted.add(a);
      if (ph.onEnter?.ability) scripted.add(ph.onEnter.ability);
    }
    // passives (params.passive) and on-death hooks run through the passive / death pipelines, never through startAbility
    for (const ab of bdef?.abilities ?? []) if (ab.params?.passive || ab.params?.onDeath) scripted.delete(ab.id);
    const r = fightBoss(def, b, botLevel, enemyLevel);
    const fails = [];
    if (r.crash) fails.push(`exception: ${r.crash}`);
    const missing = [...scripted].filter((a) => !r.cast?.has(a));
    for (const a of missing) {
      const ph = (bdef?.phases ?? []).findIndex((p) => p.abilities.includes(a) || p.onEnter?.ability === a);
      const why = ph < 0 ? 'in no phase list (only a script hook can start it, and that hook did not fire)' :`phase ${ph} (${bdef.phases[ph].id}) ${r.ctrl && r.ctrl.phaseIdx >= ph ? 'entered but the ability never fired' : 'never entered'}`;
      fails.push(`ability ${a} never cast: ${why}`);
    }
    if (r.landBad?.length) fails.push(`${r.landBad.length} shape(s) land off the arena or on blocked ground, first: ${r.landBad[0]}`);
    if (r.ctrl) {
      const crossed = bdef.phases.slice(1).filter((p) => r.minFrac < p.hpBelow);
      const missingPh = crossed.filter((p) => !r.phaseEv?.includes(p.id));
      for (const p of missingPh) fails.push(`phase ${p.id} (hpBelow ${p.hpBelow}) not fired although HP fell to ${(100 * r.minFrac).toFixed(0)} %`);
    }
    const hpOk = r.dead || r.lostPct >= 60;
    if (!hpOk && !r.crash) fails.push(`survived ${FIGHT_LIMIT_S} s with ${r.lostPct.toFixed(1)} % HP lost`);
    // headless bodies have no GLB (Enemy.anim is undefined), so EnemyAI's "animation clip not found" warning is expected and not an engine error
    // ERR lines fail the boss; WARN lines are reported as info (headless bodies have no clips, and content warns about missing procedural models)
    const errs = (r.newErrors ?? []).filter((x) => x.startsWith('ERR'));
    const warns = (r.newErrors ?? []).filter((x) => x.startsWith('WARN') && !/animation clip ".*" not found/.test(x));
    if (errs.length) fails.push(`${errs.length} engine error(s) during the fight, first: ${errs[0].slice(0, 200)}`);
    const pass = fails.length === 0;
    if (pass) nPass++; else nFail++;
    const warnNote = warns.length ? ` | warn ${warns.length} (${[...new Set(warns.map((w) => w.replace(/^WARN /, '').slice(0, 60)))].slice(0, 2).join('; ')})` : '';
    const outcome = r.dead ? `dead in ${r.t.toFixed(0)} s` : `${r.lostPct.toFixed(0)} % lost in ${r.t.toFixed(0)} s`;
    const castN = scripted.size - missing.length;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id.padEnd(17)} ${b.bossId.padEnd(22)} lvl ${enemyLevel} | ${outcome} | bot deaths ${r.deaths} | casts ${castN}/${scripted.size} | shapes ${r.landed ?? 0} (${r.landBad?.length ?? 0} bad) | phases ${r.phaseEv?.length ?? 0}/${(bdef?.phases?.length ?? 1) - 1}${warnNote}`);
    for (const f of fails) console.log(`      FAIL ${f}`);
    if (VERBOSE) console.log(`      dbg ${JSON.stringify(r.dbg)}`);
    if (VERBOSE) console.log(`      casts ${JSON.stringify([...(r.cast ?? new Map())])}`);
  }
}
console.log(`BOSS FIGHTS: ${nPass} pass, ${nFail} fail`);
console.log(`elapsed ${((Date.now() - totalStart) / 1000).toFixed(1)} s (wall clock)`);
process.exit(nFail ? 1 : 0);
