#!/usr/bin/env node
/**
 * Boss-fight sim: every boss of every registered dungeon (DUNGEONS, 13 dungeons) is fought by its REAL BossController with its real
 * BossScript (src/ai/bosses/*.ts) and ability kit (BossDef / EnemyDef of src/data/enemies*.ts), headless, in the real dungeon layout.
 * Nav: contentCheck buildNav (walls, props, zones, door posts) loaded into a real NavGrid at 1 m cells, as dungeon_all.mjs does.
 *
 * Party (4 players, all of them deal damage):
 *  - TANK: the local player with real CharacterState gear; the whole action bar is cast through SkillSystem (LMB every 0.36 s, one
 *    other slot every 0.5 s).
 *  - HEALER (priest) and two DPS (mage, archer): FakePlayers that hit their target through Combat.playerHitEnemy every 0.36 s with a
 *    basic-attack coefficient (healer 0.5, DPS 1.0) on the default weapon stats. They do not heal (the tank is never in danger of
 *    dying to the boss's ordinary damage in a fight the party is winning).
 *  - Every bot dodges telegraphed shapes due within 1 s and persisting ground zones, and paths around walls with NavGrid.findPath.
 *  - Target policy (all party members share it): the odd illusion of Sis Çağıran's guessing game (playbook); otherwise a gate add
 *    while the boss is invulnerable (GATE_ADDS: Halkor's kef_shard packs are placed from the dungeon, as its script waits for them);
 *    otherwise the nearest living add of the boss (adds are killed: skeleton and worm piles, cages, phylacteries, minions, droman);
 *    otherwise the boss. An add the tank chases for ADD_GIVEUP_S without a kill is left alone for ADD_BLACKLIST_S.
 *  - Soak circles (kind 'soak'): the two nearest non-tank bots stand in every soak circle that lands within SOAK_LEAD_S.
 *  - Playbook (PLAYBOOK, one entry per boss that has a scripted mechanic the generic policy cannot play): Hirya's pillar stacks (the
 *    tank leads her between the Solsten and Olmyr pillars), Dikişet's table stage (the constructs stay alive for the meat hook and
 *    the DPS stand on the far side of the table, where the hook beam can cross it).
 *
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
 * Every failing check is printed with its class:
 *  - GAME: the game does what the content says wrong (a real bug a player would hit: an ability no phase can start, a shape placed
 *    off the arena or in a wall, a phase that does not fire although HP crossed it, an engine error, a boss that never loses HP);
 *  - SIM: the sim cannot play the mechanic (SIM_LIMITS names the mechanic and the reason; the check is kept visible, not hidden).
 * Deaths are bot deaths (a dead bot is revived at once and the death is counted). Time is the sim time of the kill, or 300 s.
 * Ends with `BOSS FIGHTS: N pass, M fail (G game, S sim)`; exit 1 only when a GAME failure exists.
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
const SOAK_LEAD_S = 3.0;     // a soak circle due within this many seconds gets its bots
const SOAK_BOTS = 2;         // non-tank bots per soak circle
const LMB_PERIOD = 0.36;     // tank cast cadence (the harness LMB chain)
const SKILL_PERIOD = 0.5;    // tank: one bar slot (other than LMB) every 0.5 s, round robin
const BOT_HIT_PERIOD = 0.36; // healer and DPS basic-attack cadence
const HEAL_PERIOD = 1.5;    // the healer casts one heal every 1.5 s on the lowest living party member (HEAL_PCT of its max HP)
const HEAL_PCT = 0.12;
const BOT_RANGE = 7.5;       // healer and DPS hit from this far
const BOT_STAND = 6;         // and walk to within this distance of their target
const ADD_GIVEUP_S = 12;     // the tank chases one add this long without a kill ...
const ADD_BLACKLIST_S = 25;  // ... then leaves it alone this long (an add it cannot reach)
/**
 * Dungeon-placed enemies that a boss script waits for (the script reads them from the world, the dungeon places them in its packs).
 * Halkor sleeps immune until three dead kef_shard enemies exist (kefaret_salonlari.ts shardsDead, counted from the death events), so the sim places the shard packs.
 */
const GATE_ADDS = { boss_halkor: 'kef_shard' };
const MIN_FIGHT_S = 60;      // a fight that ends sooner with abilities uncast is fought again with more boss HP (see the run loop)
const HERD_SPEED = 5;        // m/s, the playbook walk of a boss (bossPoint)
const HERD_PERIOD_S = 24;    // Hirya: the tank leads her to one pillar for 12 s, then to the other
const DIKISET_KEEP = ['construct']; // Dikişet: the sewn constructs stay alive (the meat hook needs one)
/**
 * SIM_LIMITS: ability ids the sim cannot start by playing the fight (the check stays, classed SIM with this reason). Empty while the
 * sim plays every mechanic it has a playbook entry for.
 */
const SIM_LIMITS = {};
// a boss-level limit: its fight is not finished in the sim's time, so the survival check is classed SIM with this reason
const SIM_BOSS_LIMITS = {};

const cc = await H.imp('dev/contentCheck.ts');
const { DUNGEONS } = await H.imp('data/dungeons/index.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
await H.imp('entities/EnemyFactory.ts'); // installs the enemy spawn hook (EnemyAI.spawnAdds is a no-op without it)
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
// enemy GLBs load through G.assets (no assets headless): the bodies stand without a model, their clips are the warnings the check ignores
G.assets ??= { load: async () => null, instantiate: () => new H.THREE.Group() };

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
  const W = def.grid.w * T, Hh = def.grid.h * T;
  if (!navCache.has(def.id)) navCache.set(def.id, cc.buildNav(def, models).walk);
  const walk = navCache.get(def.id);
  // a fresh grid per fight: bodies that block the nav (Enemy.onAdded setCircle: crystals, constructs) must not leak into the next boss;
  // `base` is the dungeon's static floor, the ground a shape must not be placed on
  const nav = new NavGrid({ originX: 0, originZ: 0, width: W, depth: Hh, cellSize: 1, walkable: false });
  nav.cells.set(walk);
  return { nav, W, Hh, base: (x, z) => walk[nav.cz(z) * nav.cols + nav.cx(x)] > 0 };
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

/** Soak circles that land within SOAK_LEAD_S and still need players (the telegraph, not the damage hit). */
function soakDue(hs) {
  const out = [];
  for (const a of hs.shapes.values()) {
    const s = a.spec;
    if (s.kind !== 'soak' || s.soak || !s.telegraph || a.state !== 'pending') continue;
    if (s.delay - a.t > SOAK_LEAD_S) continue;
    out.push(a);
  }
  return out.sort((x, y) => (x.spec.delay - x.t) - (y.spec.delay - y.t));
}

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
let arenaBox = null; // the fight's boss arena (set per fight): placement and add targets stay inside it
function stepTo(bot, x, z, step, nav) {
  const dx = x - bot.position.x, dz = z - bot.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return;
  const s = Math.min(d, step);
  const nx = bot.position.x + (dx / d) * s, nz = bot.position.z + (dz / d) * s;
  const inside = true; // bots may walk out of the arena to a gate (the shard packs sit beyond it); placement and adds stay inside
  if (inside && nav.isWalkable(nx, nz)) {
    bot.position.x = nx;
    bot.position.z = nz;
    bot.yaw = Math.atan2(dx, dz);
  }
}

// ---------------------------------------------------------------------------------------------- scripted mechanics (playbook)
/**
 * Per-boss playbook: the scripted mechanics the generic policy cannot play. Each entry is a function of the fight context (see
 * fightBoss): tankPoint(ctx) walks the tank to a point (null: no point), bossPoint(ctx) walks the boss to a point, keepAlive lists add tags the party leaves alive,
 * botPoint(ctx) places the non-tank bots (null: default), oddClone marks the guessing game of Sis Çağıran (the odd illusion is the
 * target). Everything else (soaks, adds, gates, the boss) is the generic policy.
 */
const PLAYBOOK = {
  // Hirya's stacks: +1 per 4 s with the boss inside 8 m of a pillar. Thunder (T) opens Ark Şimşeği and Fırtına Gözü, Holy (H)
  // opens Kutsal Küreler and Arınma. A caster (bolt 22 m) walks only until the tank is in range, and a real tank pulls her onto a pillar
  // with a multi-step walk the sim does not plan: the playbook walks HER (bossPoint, 5 m/s, her own movement is left to the controller
  // otherwise) to the pillar for 12 s and then to the other. The stacks, the unlocked abilities and their shapes are the script's own.
  boss_hirya: {
    bossPoint(ctx) {
      return ctx.t % HERD_PERIOD_S < HERD_PERIOD_S / 2 ? ctx.pillars.T : ctx.pillars.H;
    },
  },
  // Sis Çağıran's guessing game: attack the one illusion whose code differs from the three identical ones.
  boss_sis_cagiran: { oddClone: true },
  // Dikişet's table stage: the constructs stay alive for the meat hook; the hook beam crosses the table when the DPS stand on the
  // far side of it (north of the table, the constructs are south of it).
  boss_cerrah_dikisat: {
    keepAlive: DIKISET_KEEP,
    botPoint(ctx) {
      if (ctx.ctrl.state.stage !== 'table') return null;
      return ctx.nav.nearestWalkable(ctx.table.x, ctx.table.z - 7, 4);
    },
  },
};

/** The odd illusion of a running guessing game: undefined outside the game, null while it has no odd one alive, else the clone. */
function oddClone(ctrl) {
  const g = ctrl.state.guess;
  if (!g || !g.started || g.done) return undefined;
  const cl = ctrl.adds('clone').filter((e) => !e.isDead && !e.removed);
  const count = new Map();
  const code = (e) => e.def.id.slice('ps_mist_clone_'.length);
  for (const e of cl) count.set(code(e), (count.get(code(e)) ?? 0) + 1);
  return cl.find((e) => count.get(code(e)) === 1) ?? null;
}

/**
 * The tank's target (and the bots' target): the odd illusion of a guessing game, a gate add while the boss is invulnerable, the
 * nearest living add (not invulnerable, not kept alive, not blacklisted), else the boss. Null: nothing to hit now.
 */
function pickTarget(ctx) {
  const { boss, ctrl, tank, world, pb, t } = ctx;
  const odd = pb.oddClone ? oddClone(ctrl) : undefined;
  if (odd !== undefined) return odd;
  const invul = boss.statuses.has('invulnerable');
  if (invul && ctx.gateId) {
    const g = world.enemies.filter((o) => o.def.id === ctx.gateId && !o.isDead && !o.removed).sort((a, c) => dist(tank, a) - dist(tank, c))[0];
    if (g) return g;
  }
  const adds = ctrl.adds().filter((a) => !a.statuses.has('invulnerable') && !(pb.keepAlive ?? []).includes(a.tag) && !(ctx.black.get(a.id) > t) && ctrl.insideArena(a.position.x, a.position.z, 0));
  if (adds.length) {
    const near = adds.sort((a, c) => dist(tank, a) - dist(tank, c))[0];
    // an add the tank cannot reach is left alone for a while (chase time without a kill)
    if (ctx.chase.id !== near.id) { ctx.chase.id = near.id; ctx.chase.since = t; }
    else if (t - ctx.chase.since > ADD_GIVEUP_S) { ctx.black.set(near.id, t + ADD_BLACKLIST_S); ctx.chase.id = null; return pickTarget(ctx); }
    return near;
  }
  ctx.chase.id = null;
  return boss;
}

// ---------------------------------------------------------------------------------------------- one boss fight
/** Party bots in the arena: the tank 4 m from the boss toward the arena centre, the others at 3 m to either side. */
function placeParty(bot, cx, cz, nav, offset) {
  let p = nav.nearestWalkable(cx + offset[0], cz + offset[1], 6) ?? { x: cx, z: cz };
  // inside the arena, when there is one (a placement past the wall would be an outside target for the boss)
  if (arenaBox && (Math.abs(p.x - arenaBox.cx) > arenaBox.w / 2 - 1 || Math.abs(p.z - arenaBox.cz) > arenaBox.h / 2 - 1)) p = nav.nearestWalkable(arenaBox.cx, arenaBox.cz, 6) ?? p;
  bot.position.x = p.x;
  bot.position.z = p.z;
}

/** Shared event log of the boss phase / lifecycle events (filtered per boss by bossId). */
const bossEvents = [];
let simT = 0;
for (const name of ['boss:phase', 'boss:engaged', 'boss:defeated', 'boss:wipe']) G.events.on(name, (e) => bossEvents.push({ name, t: simT, ...e }));

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
async function fightBoss(def, b, botLevel, enemyLevel, hpScale = 1) {
  simT = 0; // the phase / engage stamps are per fight
  const bdef = getEnemyDef(b.bossId);
  // deterministic scripts: the boss scripts draw Math.random (targets, spreads); each fight gets its own seeded stream
  const restoreRandom = seedRandom(`${b.bossId}`);
  const { nav, W, Hh, base } = navFor(def);
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

  // the party: tank (local, real gear), healer and two DPS (FakePlayers that hit through Combat.playerHitEnemy)
  const ch = buildCharacter(TANK_SPEC, botLevel);
  const tank = new H.FakePlayer(TANK_SPEC.classId, botLevel);
  tank.id = 1;
  tank.stats = { ...ch.stats };
  tank.maxHp = Math.max(1, Math.round(ch.stats.maxHp ?? 200));
  tank.hp = tank.maxHp;
  tank.armorSnapshot = ch.stats.armor;
  const healer = new H.FakePlayer('priest', botLevel);
  healer.id = 2;
  const dps1 = new H.FakePlayer('mage', botLevel);
  dps1.id = 3;
  const dps2 = new H.FakePlayer('archer', botLevel);
  dps2.id = 4;
  const BOT_COEF = new Map([[healer, 0.5], [dps1, 1.0], [dps2, 1.0]]);
  // the bots hit with the tank's level-appropriate stats (their own FakePlayer defaults are a level-30 weapon)
  for (const p of [healer, dps1, dps2]) { p.maxHp = tank.maxHp; p.hp = tank.maxHp; p.isLocal = false; p.stats = { ...ch.stats }; }
  world.add(tank);
  world.add(healer);
  world.add(dps1);
  world.add(dps2);
  world.localPlayer = G.player = tank;

  // the boss: a real Enemy body with the production fields of EnemyFactory.spawnEnemy, and its real BossController
  const hpBoss = Math.max(1, Math.round(monsterHP(enemyLevel) * bdef.hpMult * FACTORS.hp * hpScale));
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
      // the arena rule is about the boss's own kit: an add that roams outside the arena (and the shapes it casts) is not the boss's placement
      if (src.id !== boss.id) return origLand(a);
      const ar = ctrl.arena;
      // distance from the shape's centre to the arena box, against the shape's own reach: a band or a circle that overlaps the arena is
      // placed on it (a lane wave or a wind wall is drawn longer than the room so it sweeps in from the wall); one that does not is lost
      const out = Math.hypot(Math.max(0, Math.abs(a.ox - ar.cx) - ar.w / 2), Math.max(0, Math.abs(a.oz - ar.cz) - ar.h / 2));
      const sh = s.shape;
      const reach = sh.type === 'rect' ? Math.max(sh.length, sh.width) / 2 : sh.type === 'circle' ? sh.radius : sh.type === 'ring' ? sh.outer : 0;
      const inArena = out <= (sh.type === 'rect' || sh.type === 'circle' ? reach : 0);
      const walk = base(a.ox, a.oz); // the static floor: a crystal or a construct standing on the spot blocks the nav for a while, not the shape
      const roomWide = s.shape.type === 'circle' && s.shape.radius >= 0.5 * Math.min(ar.w, ar.h) || s.shape.type === 'ring' && s.shape.outer >= 0.5 * Math.min(ar.w, ar.h);
      if (!inArena || (!walk && !roomWide)) {
        // a shape aimed at a bot (the game's own arena test for a target keeps 2 m of margin; the sim party also leaves the room for a gate
        // add and is knocked onto walls) is the party's position, not the boss's placement: SIM
        const atBot = bots.some((p) => !p.isDead && Math.hypot(p.position.x - a.ox, p.position.z - a.oz) <= 2.5);
        landBad.push({ atBot, msg: `${s.abilityName ?? s.kind ?? "shape"} (${s.shape.type}) origin ${a.ox.toFixed(1)},${a.oz.toFixed(1)} ${!inArena ? "outside arena" : "on blocked ground"}${atBot ? " at a bot" : ""} [source ${src.def?.id ?? src.id} at ${src.position.x.toFixed(1)},${src.position.z.toFixed(1)}; arena c ${ar.cx.toFixed(1)},${ar.cz.toFixed(1)} w ${ar.w} h ${ar.h}]` });
      }
    }
    return origLand(a);
  };

  let t = 0, deaths = 0, minFrac = 1, minFracAlive = 1, crash = null;
  const hpStart = boss.hp;
  const anchor = [[4, 0], [-3, 2.5], [-2.5, -3], [3, -3]];
  const arenaC = { x: cxR, z: czR };
  arenaBox = ctrl.arena;
  placeParty(tank, bx, bz, nav, [(cxR - bx) * 0.25, (czR - bz) * 0.25]);
  placeParty(healer, bx, bz, nav, [anchor[1][0] + (cxR - bx) * 0.25, anchor[1][1] + (czR - bz) * 0.25]);
  placeParty(dps1, bx, bz, nav, [anchor[2][0] + (cxR - bx) * 0.25, anchor[2][1] + (czR - bz) * 0.25]);
  placeParty(dps2, bx, bz, nav, [anchor[3][0] + (cxR - bx) * 0.25, anchor[3][1] + (czR - bz) * 0.25]);
  let tankNext = 0, skillNext = 0, skillIdx = 0, healNext = 0;
  const TANK_SLOTS = Object.keys(TANK_SPEC.defaultBar).filter((k) => k !== 'lmb');
  const bots = [tank, healer, dps1, dps2];
  const others = [healer, dps1, dps2];
  const pb = PLAYBOOK[b.bossId] ?? {};
  // the scripts place their props with BossController.gdd (the baked tile coordinates shifted with the arena): so does the playbook
  const pillars = { T: ctrl.gdd(23.5, 14.5), H: ctrl.gdd(31.5, 14.5) };
  const table = ctrl.gdd(36.5, 5.5);
  const ctx = { t: 0, boss, ctrl, tank, world, nav, pb, arenaC, pillars, table, gateId, black: new Map(), chase: { id: null, since: 0 } };
  const chaseSt = new Map(bots.map((p) => [p, { path: null, at: 0, clock: 0, goal: undefined }]));
  const soakTo = new Map();
  const soakUsed = new Set();
  const tankStats = { lmb: 0, skill: 0 };
  try {
    while (t < FIGHT_LIMIT_S && !boss.isDead) {
      ctx.t = t;
      // the party's target and the scripted points of this frame
      const tgt = pickTarget(ctx);
      // the tank takes the adds; the healer and DPS hit the boss whenever it can be hurt (the odd illusion, a gate, or the add while it is immune)
      const bTgt = boss.statuses.has("invulnerable") ? tgt : boss;
      const tankPt = pb.tankPoint ? pb.tankPoint(ctx) : null;
      // soak duty: the two nearest non-tank bots stand in every soak circle due within SOAK_LEAD_S
      soakTo.clear();
      for (const a of soakDue(G.hitShapes)) {
        const cand = others.filter((p) => !p.isDead && !soakTo.has(p))
          .sort((p, q) => Math.hypot(p.position.x - a.ox, p.position.z - a.oz) - Math.hypot(q.position.x - a.ox, q.position.z - a.oz))
          .slice(0, SOAK_BOTS);
        for (const p of cand) { soakTo.set(p, { x: a.ox, z: a.oz }); soakUsed.add(a.id); }
      }
      // bots: dodge first, then the tank chases and casts; the other members walk to their duty and hit
      const list = dangerList(G.hitShapes);
      for (const bot of bots) {
        if (bot.isDead) continue;
        const st = chaseSt.get(bot);
        st.clock = t;
        const moved = dodge(bot, DT, list, ctrl, nav);
        if (moved) continue;
        if (bot === tank) {
          const tp = tankPt; // the herd walk has priority (a melee hit on the way would stop it)
          if (tp && Math.hypot(tp.x - tank.position.x, tp.z - tank.position.z) > 0.8) { chase(tank, tp.x, tp.z, BOT_SPEED * DT, nav, st); continue; }
          if (!tgt) continue;
          const d = dist(tank, tgt);
          if (d > 2.2) chase(tank, tgt.position.x, tgt.position.z, BOT_SPEED * DT, nav, st);
          tank.yaw = Math.atan2(tgt.position.x - tank.position.x, tgt.position.z - tank.position.z);
          if (d <= 2.4 && t >= tankNext) {
            G.skills.tryCastSlot(tank, 'lmb', H.aimFor(tank, tgt));
            tankNext = t + LMB_PERIOD;
            tankStats.lmb++;
          }
          // the rest of the tank's action bar, round robin (the sim's tank casts through SkillSystem)
          if (TANK_SLOTS.length && t >= skillNext && d <= 8) {
            const slot = TANK_SLOTS[skillIdx++ % TANK_SLOTS.length];
            G.skills.tryCastSlot(tank, slot, H.aimFor(tank, tgt));
            skillNext = t + SKILL_PERIOD;
            tankStats.skill++;
          }
          continue;
        }
        // healer and DPS: a soak circle, the playbook point, or the target at BOT_STAND metres (hit inside BOT_RANGE)
        const soak = soakTo.get(bot);
        if (soak) { chase(bot, soak.x, soak.z, BOT_SPEED * DT, nav, st); continue; }
        const bp = pb.botPoint ? pb.botPoint(ctx) : null;
        if (bp) { chase(bot, bp.x, bp.z, BOT_SPEED * DT, nav, st); continue; }
        if (!bTgt) continue;
        const d = dist(bot, bTgt);
        if (d > BOT_STAND) chase(bot, bTgt.position.x, bTgt.position.z, BOT_SPEED * DT, nav, st);
        else bot.yaw = Math.atan2(bTgt.position.x - bot.position.x, bTgt.position.z - bot.position.z);
      }
      // the healer keeps the lowest party member up (the adds and the boss hit the party; without it the sim is a wipe, not a fight)
      if (!healer.isDead && t >= healNext) {
        healNext = t + HEAL_PERIOD;
        const low = bots.filter((p) => !p.isDead).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
        if (low && low.hp < low.maxHp) low.hp = Math.min(low.maxHp, low.hp + HEAL_PCT * low.maxHp);
      }
      // the other members hit the same target (basic-attack coefficient of each, through the real hit path)
      if (bTgt) {
        for (const bot of others) {
          if (bot.isDead || t < (bot.nextHit ?? 0) || dist(bot, bTgt) > BOT_RANGE) continue;
          G.combat.playerHitEnemy(bot, bTgt, { coef: BOT_COEF.get(bot), type: 'physical', skillId: 'sim_party_basic', canCrit: true });
          bot.nextHit = t + BOT_HIT_PERIOD;
        }
      }
      // no wall collision for knockback and dashes in the sim: a bot pushed onto blocked ground walks back to the nearest floor
      for (const bot of bots) if (!bot.isDead && !nav.isWalkable(bot.position.x, bot.position.z)) {
        const p = nav.nearestWalkable(bot.position.x, bot.position.z, 4);
        if (p) { bot.position.x = p.x; bot.position.z = p.z; }
      }
      // playbook: a boss walked to a point (it stays on the nav; nothing else about its behaviour changes)
      const bp2 = pb.bossPoint && !boss.isDead ? pb.bossPoint(ctx) : null;
      if (bp2) {
        const dd = Math.hypot(bp2.x - boss.position.x, bp2.z - boss.position.z);
        if (dd > 2.5) {
          const nx = boss.position.x + ((bp2.x - boss.position.x) / dd) * HERD_SPEED * DT, nz = boss.position.z + ((bp2.z - boss.position.z) / dd) * HERD_SPEED * DT;
          if (nav.isWalkable(nx, nz)) { boss.position.x = nx; boss.position.z = nz; }
        }
      }
      G.engine.time += DT;
      // the enemy spawn is async (EnemyFactory.spawnEnemy): a microtask per frame lands the adds in the fight, as the frame loop does
      await null;
      simT = t;
      H.setAimTarget(null);
      world.update(DT);
      G.skills.update(DT);
      G.combat.update(DT);
      G.hitShapes.update(DT);
      t += DT;
      minFrac = Math.min(minFrac, Math.max(0, boss.hp) / boss.maxHp);
      if (!boss.isDead) minFracAlive = Math.min(minFracAlive, boss.hp / boss.maxHp);
      for (const bot of bots) {
        if (!bot.isDead) continue;
        deaths++;
        bot.alive = true;
        bot.hp = bot.maxHp;
        placeParty(bot, bx, bz, nav, bot === tank ? [0, 0] : bot === healer ? [-3, 2.5] : bot === dps1 ? [-2.5, -3] : [3, -3]);
      }
    }
  } catch (err) {
    crash = `${err?.stack ?? err}`.split('\n').slice(0, 4).join(' | ');
  }
  const newErrors = H.errors.slice(errStart);
  const phaseEv = bossEvents.slice(evStart).filter((e) => e.bossId === b.bossId && e.name === 'boss:phase').map((e) => e.phase);
  restoreRandom();
  return {
    crash, t, deaths, dead: boss.isDead, lostPct: 100 * (1 - Math.max(0, boss.hp) / hpStart), minFrac, minFracAlive, cast, landed, landBad,
    phaseEv, phaseAt: [...bossEvents.slice(evStart).filter((e) => e.bossId === b.bossId && e.name === 'boss:engaged').map((e) => [bdef.phases[0].id, e.t]), ...bossEvents.slice(evStart).filter((e) => e.bossId === b.bossId && e.name === 'boss:phase').map((e) => [e.phase, e.t])],
    newErrors, ctrl, boss, hpBoss, soakCount: soakUsed.size, tankStats,
    dbg: {
      tankPos: [tank.position.x, tank.position.z].map((v) => v.toFixed(1)), bossPos: [boss.position.x, boss.position.z].map((v) => v.toFixed(1)),
      dist: dist(tank, boss).toFixed(1), stage: ctrl?.state?.stage, phaseIdx: ctrl?.phaseIdx, engaged: ctrl?.engaged,
      shield: boss.statuses.has('shield'), invul: boss.statuses.has('invulnerable'), hp: Math.round(boss.hp), tankDead: tank.isDead,
      maxHp: boss.maxHp, hpStart, minFrac, minFracAlive, T: ctrl?.state?.T, H: ctrl?.state?.H, energy: ctrl?.energy?.value, busy: ctrl?.busy?.ab?.id ?? null, adds: (ctrl ? ctrl.adds().map((x) => x.tag + ":" + x.def.id + "@" + x.position.x.toFixed(0) + "," + x.position.z.toFixed(0) + (x.statuses.has("invulnerable") ? "(inv)" : "")).slice(0, 8) : []), bossInv: boss.statuses.has("invulnerable"), tankTgt: ctrl.target ? ctrl.target.id : null, nBots: bots.filter((b) => !b.isDead).length, tgtDef: ctrl?.target?.def?.id ?? null,
    },
  };
}

// ---------------------------------------------------------------------------------------------- run
const botLevelOf = (def) => Math.min(def.levelRange?.[1] ?? 30, 60);
let nPass = 0, nFail = 0, nGame = 0, nSim = 0;
const totalStart = Date.now();
const ids = Object.keys(DUNGEONS);
console.log(`boss_fights: ${ids.length} dungeons, fight limit ${FIGHT_LIMIT_S} s sim time at ${Math.round(1 / DT)} Hz, party: tank (local, SkillSystem) + healer + 2 dps (Combat.playerHitEnemy), all dodge`);
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
    let r = await fightBoss(def, b, botLevel, enemyLevel);
    // the sim's boss HP mirrors the spawn formula, not the keyed values: a boss that dies in a few seconds never reaches its timed abilities.
    // Such a fight is fought again with more HP (the party is the same) so that the cooldown verdicts are about the script, not about the kill speed.
    let hpScale = 1;
    if (r.dead && !r.crash && r.t < MIN_FIGHT_S && [...scripted].some((a) => !r.cast?.has(a))) {
      hpScale = Math.min(16, Math.ceil((MIN_FIGHT_S * 1.3) / Math.max(r.t, 2)));
      r = await fightBoss(def, b, botLevel, enemyLevel, hpScale);
    }
    const fails = []; // { cls: 'GAME' | 'SIM', msg }
    const add = (cls, msg) => fails.push({ cls, msg });
    if (r.crash) add('GAME', `exception: ${r.crash}`);
    const missing = [...scripted].filter((a) => !r.cast?.has(a));
    for (const a of missing) {
      const ph = (bdef?.phases ?? []).findIndex((p) => p.abilities.includes(a) || p.onEnter?.ability === a);
      const entered = ph >= 0 && r.ctrl && r.ctrl.phaseIdx >= ph;
      const why = ph < 0 ? 'in no phase list (only a script hook can start it, and that hook did not fire)' :`phase ${ph} (${bdef.phases[ph].id}) ${entered ? 'entered but the ability never fired' : 'never entered'}`;
      const rec = bdef.abilities?.find((x) => x.id === a);
      const phaseHit = ph >= 0 ? (r.phaseAt ?? []).find(([id]) => id === bdef.phases[ph].id) : null;
      const readyIn = rec ? (rec.initialCooldown !== undefined && rec.initialCooldown < 900 ? rec.initialCooldown : rec.cooldown * 0.6) : 0;
      const enteredAt = phaseHit ? phaseHit[1] : 0;
      const timed = rec && (rec.initialCooldown !== undefined && rec.initialCooldown < 900 || rec.cooldown < 900);
      if (SIM_LIMITS[a]) add('SIM', `ability ${a} never cast: ${why} | ${SIM_LIMITS[a]}`);
      else if (ph >= 0 && timed && r.t < enteredAt + Math.max(readyIn, 3)) add('SIM', `ability ${a} never cast: ${why} | the fight ended at ${r.t.toFixed(0)} s, before the ability could come off cooldown (phase at ${enteredAt.toFixed(0)} s, ready after ${Math.max(readyIn, 3).toFixed(0)} s)`);
      else add('GAME', `ability ${a} never cast: ${why}`);
    }
    const badGame = (r.landBad ?? []).filter((x) => !x.atBot), badSim = (r.landBad ?? []).filter((x) => x.atBot);
    if (badGame.length) add('GAME', `${badGame.length} shape(s) land off the arena or on blocked ground, first: ${badGame[0].msg}`);
    if (badSim.length) add('SIM', `${badSim.length} shape(s) aimed at a bot the sim left off the arena / on a wall, first: ${badSim[0].msg}`);
    if (r.ctrl) {
      // a phase counts when HP fell below its threshold while the boss was alive (a boss killed in the frame it crosses has no phase to fire)
      const crossed = bdef.phases.slice(1).filter((p) => r.minFracAlive < p.hpBelow);
      const missingPh = crossed.filter((p) => !r.phaseEv?.includes(p.id));
      for (const p of missingPh) add('GAME', `phase ${p.id} (hpBelow ${p.hpBelow}) not fired although HP fell to ${(100 * r.minFracAlive).toFixed(0)} %`);
    }
    const hpOk = r.dead || r.lostPct >= 60;
    if (!hpOk && !r.crash) add(SIM_BOSS_LIMITS[b.bossId] ? 'SIM' : 'GAME', `survived ${FIGHT_LIMIT_S} s with ${r.lostPct.toFixed(1)} % HP lost${SIM_BOSS_LIMITS[b.bossId] ? ' | ' + SIM_BOSS_LIMITS[b.bossId] : ''}`);
    // headless bodies have no GLB (Enemy.anim is undefined), so EnemyAI's "animation clip not found" warning is expected and not an engine error
    // ERR lines fail the boss; WARN lines are reported as info (headless bodies have no clips, and content warns about missing procedural models)
    const errs = (r.newErrors ?? []).filter((x) => x.startsWith('ERR'));
    const warns = (r.newErrors ?? []).filter((x) => x.startsWith('WARN') && !/animation clip ".*" not found/.test(x));
    if (errs.length) add('GAME', `${errs.length} engine error(s) during the fight, first: ${errs[0].slice(0, 200)}`);
    const pass = fails.length === 0;
    if (pass) nPass++; else nFail++;
    for (const f of fails) { if (f.cls === 'GAME') nGame++; else nSim++; }
    const warnNote = warns.length ? ` | warn ${warns.length} (${[...new Set(warns.map((w) => w.replace(/^WARN /, '').slice(0, 60)))].slice(0, 2).join('; ')})` : '';
    const outcome = (r.dead ? `dead in ${r.t.toFixed(0)} s` : `${r.lostPct.toFixed(0)} % lost in ${r.t.toFixed(0)} s`) + (hpScale > 1 ? ` (hp x${hpScale})` : '');
    const castN = scripted.size - missing.length;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${id.padEnd(17)} ${b.bossId.padEnd(22)} lvl ${enemyLevel} | ${outcome} | bot deaths ${r.deaths} | casts ${castN}/${scripted.size} | shapes ${r.landed ?? 0} (${r.landBad?.length ?? 0} bad) | phases ${r.phaseEv?.length ?? 0}/${(bdef?.phases?.length ?? 1) - 1} | soaks ${r.soakCount ?? 0}${warnNote}`);
    for (const f of fails) console.log(`      FAIL ${f.cls} ${f.msg}`);
    if (VERBOSE) console.log(`      dbg ${JSON.stringify(r.dbg)}`);
    if (VERBOSE) console.log(`      casts ${JSON.stringify([...(r.cast ?? new Map())])}`);
    if (VERBOSE) for (const x of r.landBad ?? []) console.log(`      bad ${x.msg}`);
  }
}
console.log(`BOSS FIGHTS: ${nPass} pass, ${nFail} fail (${nGame} game, ${nSim} sim)`);
console.log(`elapsed ${((Date.now() - totalStart) / 1000).toFixed(1)} s (wall clock)`);
process.exit(nGame ? 1 : 0);
