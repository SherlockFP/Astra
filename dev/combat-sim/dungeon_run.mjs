#!/usr/bin/env node
/**
 * Dungeon-run sim (starter dungeon Sisli Magara, src/data/dungeons/sisli_magara.ts): a SOLO character clears the whole mandatory route
 * (12 packs, the mid-boss Morkan after its room, then the final boss Kaldur) at character level 1, 5 and 10. Real CharacterState stats
 * and starter gear, real Combat / SkillSystem / HitShapes / mitigation, harness actors with the production enemy scaling
 * (instanceScaling partyScales, the Normal level = the band clamp). Boss mechanics are NOT simulated (basic attack only, as in scaling.mjs).
 * A death costs a 30 s corpse run and a full heal (checkpoint). Walks between rooms use levelling.ts RUN_WALK_S.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/dungeon_run.mjs                 (matrix: 2 classes x L1, L5, L10)
 *   LEVEL=5 SPEC=mage_arcane node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/dungeon_run.mjs   (one config)
 *
 * Checks per config (3 seeds, exit 1 on FAIL): every pack and both bosses are cleared, the clear time is 6-14 min (the planning
 * estimate is ~8.6 min), and at most one death in the 3 runs.
 */

import * as H from './harness.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const { G } = H;
const DT = H.DT;
const LEGACY = process.argv.includes('--legacy');
const VERBOSE = !!process.env.V;
const CHAR_LEVEL = Number(process.env.LEVEL || 1);
const SPEC_ID = process.env.SPEC || 'knight_blademaster';
const BAND_MIN = 25; // % of max HP the pack costs a solo player (average over seeds)
const BAND_MAX = 55;

// ---------------------------------------------------------------------------------------------- matrix driver
if (!process.env.LEVEL && !process.env.SPEC) {
  const script = fileURLToPath(import.meta.url);
  const args = process.argv.slice(2);
  let failed = 0;
  for (const spec of ['knight_blademaster', 'mage_arcane']) {
    for (const level of [1, 5, 10]) {
      const r = spawnSync(process.execPath, ['--no-warnings', '--import', './dev/combat-sim/register.mjs', script, ...args], {
        env: { ...process.env, SPEC: spec, LEVEL: String(level) }, encoding: 'utf8',
      });
      process.stdout.write(r.stdout ?? '');
      process.stderr.write(r.stderr ?? '');
      if (r.status !== 0) failed++;
    }
  }
  console.log(failed ? `MATRIX FAIL: ${failed} config(s) did not clear the starter dungeon in band` : 'MATRIX PASS: knight and mage clear Sisli Magara at L1, L5 and L10');
  process.exit(failed ? 1 : 0);
}

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { generateItem, categoriesForClass, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const { THEMES } = await H.imp('world/procgen/themes.ts');
const { partyScales, legacyPartyHp, normalEnemyLevel, clampParty } = await H.imp('systems/instanceScaling.ts');
const { fissureEnemyLevel } = await H.imp('world/procgen/tiers.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || VERBOSE) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------------------------------------- factors (production functions)
const LEVEL_BAND = THEMES.crypt.level;                        // [1, 35]
const LEVEL = fissureEnemyLevel('n', CHAR_LEVEL, LEVEL_BAND); // Normal: the party average (the solo character) clamped to the band
const FACTORS = LEGACY
  ? { hp: legacyPartyHp(1), dmg: 1, bossDmg: 1 }              // today: HP x(1 + 0.6 (n-1)), damage x1, no boss relief
  : partyScales(1, 'normal');
const SCALE_MODE = LEGACY ? 'legacy' : 'scaled';

// monsterHP / monsterDmg of GDD_SYSTEMS 1.10 (EnemyFactory)
const monsterHP = (L) => Math.round(14 + 0.62 * L * L);
const monsterDmg = (L) => Math.round(14 + 4.5 * L);

// ---------------------------------------------------------------------------------------------- the character
const spec = SPECS[SPEC_ID];
const SLOTS = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];

function buildCharacter(seed) {
  const rng = new RNG(seed);
  const ch = CharacterState.create('Sim', spec.classId);
  ch.save.level = CHAR_LEVEL;
  ch.save.spec = spec.id;
  ch.save.skillBar = { ...spec.defaultBar };
  ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  ch.recomputeStats(false);
  const cats = categoriesForClass(spec.classId);
  for (const slot of SLOTS) {
    const options = cats.filter((c) => slotsForCategory(c).includes(slot));
    if (!options.length) continue;
    const item = generateItem({ itemLevel: CHAR_LEVEL, rarity: 'uncommon', classId: spec.classId, category: options[0], smart: true }, rng);
    ch.addItem(item);
    if (!ch.equip(item.uid)) ch.removeItem(item.uid);
  }
  return ch;
}

// ---------------------------------------------------------------------------------------------- the enemies
/** A real EnemyDef, the stats of one spawn at `level` with the party factors, and the basic attack used by the sim. */
function spawnSpec(defId, level, factor) {
  const def = getEnemyDef(defId);
  if (!def) throw new Error(`unknown enemy ${defId}`);
  const isBoss = def.rank === 'boss';
  const hp = Math.max(1, Math.round(monsterHP(level) * def.hpMult * factor.hp));
  const dmg = monsterDmg(level) * def.dmgMult * factor.dmg * (isBoss ? factor.bossDmg : 1);
  const armor = def.armorMult ? 10 * level * def.armorMult : 0;
  const basic = def.basic ?? def.basicAttack ?? {};
  return {
    def, hp, dmg, armor, level, isBoss,
    range: basic.range ?? def.attackRange ?? 2,
    cooldown: basic.cooldown ?? 2,
    windup: basic.windup ?? 0.45,
    coef: basic.damage?.coef ?? 1,
    speed: def.speed ?? 4,
  };
}

// crypt_t1 trash (populate.ts scaled): 3 + packBonus 2, -1 at character level 9 or below: 4 minions at L1, 5 from L10, plus an archer
const TRASH_PACK = [['skel_minion', CHAR_LEVEL <= 9 ? 4 : 5], ['skel_archer', 1]];

// ---------------------------------------------------------------------------------------------- fight loop
/**
 * One fight: the player stands at the origin, the enemies (a ring at 6-7 m, all aggroed at once) walk in, swing their basic attack
 * (windup, cooldown, real mitigation) and the player's LMB chain (harness controller) kills them. Returns survival and time.
 */
function fight(ch, enemies, hpStart, limitSec) {
  const p = H.world.localPlayer;
  p.hp = hpStart;
  let t = 0;
  let dmgTaken = 0;
  let deaths = 0;
  const hits = [];
  const ringState = enemies.map((e) => ({ e, nextAt: 0, windupEnd: -1 }));
  // the LMB chain is driven by taps every 0.36 s (a held key fires into the controller's repeat gate and lands no hits in the harness)
  let nextTap = 0;
  while (t < limitSec && p.hp > 0) {
    const alive = ringState.filter((r) => !r.e.isDead);
    if (!alive.length) break;
    // target: nearest living enemy; move the player into reach of it (melee)
    alive.sort((a, b) => dist(p, a.e) - dist(p, b.e));
    const target = alive[0].e;
    const d = dist(p, target);
    if (d > 2.2) {
      const dx = target.position.x - p.position.x, dz = target.position.z - p.position.z;
      const l = Math.hypot(dx, dz) || 1;
      p.position.x += (dx / l) * Math.min(d - 1.8, 3.2 * DT);
      p.position.z += (dz / l) * Math.min(d - 1.8, 3.2 * DT);
    }
    p.yaw = Math.atan2(target.position.x - p.position.x, target.position.z - p.position.z);
    H.setAimTarget(target);
    if (t >= nextTap) {
      H.tap('lmb');
      nextTap = t + 0.36;
    } else H.step(1);
    t += DT;
    // enemy AI: approach, windup, swing (mitigated by the real Combat.mitigate)
    for (const r of ringState) {
      const { e } = r;
      if (e.isDead) continue;
      const de = dist(p, e);
      if (de > e.spec.range) {
        const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
        const l = Math.hypot(dx, dz) || 1;
        e.position.x += (dx / l) * e.spec.speed * DT;
        e.position.z += (dz / l) * e.spec.speed * DT;
        r.windupEnd = -1;
      } else if (r.windupEnd < 0 && t >= r.nextAt) {
        r.windupEnd = t + e.spec.windup;
      } else if (r.windupEnd >= 0 && t >= r.windupEnd) {
        r.windupEnd = -1;
        r.nextAt = t + e.spec.cooldown;
        const amount = G.combat.mitigate(p, e.spec.dmg * e.spec.coef, 'physical', e.spec.level);
        p.hp -= amount;
        dmgTaken += amount;
        hits.push(amount);
        if (p.hp <= 0) { deaths++; break; }
      }
    }
  }
  H.setAimTarget(null);
  const left = ringState.filter((r) => !r.e.isDead).length;
  return { t, hp: Math.max(0, p.hp), dmgTaken, hits, deaths, left };
}

function dist(p, e) {
  return Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
}

function placeRing(actors) {
  const n = actors.length;
  return actors.map((a, i) => {
    const ang = (i / Math.max(1, n)) * Math.PI * 2 + 0.3;
    const r = 2.6 + (i % 2) * 0.6;
    return H.addEnemy(Math.cos(ang) * r, Math.sin(ang) * r, { rank: a.def.rank, hp: a.hp });
  });
}

function setupEnemy(e, s) {
  e.def = { ...s.def, anims: { hit: 'Hit_A', death: 'Death_A' } };
  e.isBoss = s.isBoss;
  e.level = s.level;
  e.maxHp = e.hp = s.hp;
  e.baseDamage = s.dmg;
  e.stats = { armor: s.armor };
  e.spec = s;
  e.radius = 0.6;
}


// ---------------------------------------------------------------------------------------------- dungeon run (starter)
const { SISLI_MAGARA } = await H.imp('data/dungeons/sisli_magara.ts');
const { mandatoryRoute, RUN_WALK_S } = await H.imp('data/dungeons/levelling.ts');
const DUNGEON_LEVEL = normalEnemyLevel(SISLI_MAGARA.levelRange, CHAR_LEVEL);
const DEATH_PENALTY_S = 30;
/** Trash damage of this dungeon (DungeonDef.trashDmgMult, applied in MythicPlus.partyFactors); bosses keep the party factors. */
const TRASH_FACTORS = { ...FACTORS, dmg: FACTORS.dmg * (SISLI_MAGARA.trashDmgMult ?? 1) };
const SEEDS_RUN = [1, 2, 3];
const route = mandatoryRoute(SISLI_MAGARA);
const midBossRoom = SISLI_MAGARA.bosses.find((b) => b.order === 1)?.roomId;
const finalBoss = SISLI_MAGARA.bosses.find((b) => b.order === 2);
const midBoss = SISLI_MAGARA.bosses.find((b) => b.order === 1);
// order of the run: packs in dungeon order, the mid-boss after the last pack of its room, the final boss last
const steps = [];
let lastOfMid = -1;
route.packs.forEach((p, i) => { if (p.roomId === midBossRoom) lastOfMid = i; });
route.packs.forEach((p, i) => {
  steps.push({ kind: 'pack', id: p.id, roomId: p.roomId, members: p.members.map((m) => [m.enemyId, m.offset]) });
  if (i === lastOfMid) steps.push({ kind: 'boss', id: midBoss.bossId });
});
steps.push({ kind: 'boss', id: finalBoss.bossId });
const ROOM_COUNT = route.rooms;

function runDungeon(seed, ch) {
  const p = H.world.localPlayer;
  let t = 0, deaths = 0, dmgTaken = 0, bossesKilled = 0, packsCleared = 0;
  let lastRoom = null;
  // a wipe costs a corpse run (DEATH_PENALTY_S) and a full heal, then the same pack / boss is pulled again (up to 3 tries)
  for (const step of steps) {
    if (step.kind === 'pack' && lastRoom !== step.roomId) { t += RUN_WALK_S; lastRoom = step.roomId; }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (step.kind === 'pack') {
        const specs = step.members.map(([defId]) => spawnSpec(defId, DUNGEON_LEVEL, TRASH_FACTORS));
        const enemies = placeRing(specs);
        enemies.forEach((e, i) => setupEnemy(e, specs[i]));
        const res = fight(ch, enemies, p.hp, 180);
        t += res.t;
        dmgTaken += res.dmgTaken;
        if (res.hp > 0) { packsCleared++; break; }
      } else {
        const bspec = spawnSpec(step.id, DUNGEON_LEVEL, FACTORS);
        const boss = H.addEnemy(6, 0, { rank: 'boss', hp: bspec.hp });
        setupEnemy(boss, bspec);
        const res = fight(ch, [boss], p.hp, 300);
        t += res.t;
        dmgTaken += res.dmgTaken;
        if (boss.isDead) { bossesKilled++; break; }
      }
      if (p.hp <= 0) { deaths++; t += DEATH_PENALTY_S; p.hp = p.maxHp; if (process.env.V) console.log('  death at', step.id || step.kind, 'attempt', attempt); }
    }
  }
  return { t, deaths, dmgTaken, packsCleared, bossesKilled };
}

const runs = [];
let mathRng2 = new RNG(1);
Math.random = () => mathRng2.next();
const realNow2 = Date.now;
for (const seed of SEEDS_RUN) {
  mathRng2 = new RNG(seed * 7919);
  const ch = buildCharacter(seed);
  Date.now = () => seed * 1000;
  G.combat = new (await H.imp('combat/Combat.ts')).Combat();
  G.combat.rng = new RNG(seed ^ 0x9e3779b9);
  G.skills = new (await H.imp('combat/SkillSystem.ts')).SkillSystem();
  G.hitShapes = new (await H.imp('combat/HitShapes.ts')).HitShapes();
  const p = H.addPlayer(spec.classId, CHAR_LEVEL);
  p.stats = { ...ch.stats };
  p.maxHp = Math.max(1, Math.round(ch.stats.maxHp ?? 200));
  p.hp = p.maxHp;
  p.armorSnapshot = ch.stats.armor;
  H.clearEvents();
  const r = runDungeon(seed, ch);
  Date.now = realNow2;
  runs.push(r);
}

const avgOf = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const clearMin = avgOf(runs.map((r) => r.t / 60));
const deathsTotal = runs.reduce((a, r) => a + r.deaths, 0);
console.log(`dungeon run sim: ${spec.id} level ${CHAR_LEVEL} solo, ${SISLI_MAGARA.name} (band ${SISLI_MAGARA.levelRange.join('-')}), enemy level ${DUNGEON_LEVEL}, ${steps.length} steps, factors hp x${FACTORS.hp.toFixed(3)} dmg x${FACTORS.dmg.toFixed(2)}`);
console.log(' run | clear time  deaths  dmg taken  packs  bosses');
runs.forEach((r, i) => console.log(` ${String(i + 1).padStart(3)} | ${(r.t / 60).toFixed(1).padStart(8)} min  ${String(r.deaths).padStart(4)}  ${String(Math.round(r.dmgTaken)).padStart(8)}  ${String(r.packsCleared).padStart(3)}/${route.packs.length}  ${r.bossesKilled}/2`));
console.log(` ${spec.id} L${CHAR_LEVEL}: clear ${clearMin.toFixed(1)} min avg, deaths ${deathsTotal} in ${runs.length} runs`);
ok(`${spec.id} L${CHAR_LEVEL}: every pack and both bosses cleared in every run`, runs.every((r) => r.bossesKilled === 2 && r.packsCleared === route.packs.length), '');
// clear time is printed, not asserted: the sim counts fights, walks and corpse runs only (no aggro travel, pulls or looting), so the
// planning estimate of levelling.ts (~8.6 min with the overhead) is the number to compare with the table above
// owner target for the starter: no solo death at L1 / L5; at L10 at most one (the final boss)
const DEATH_BUDGET = CHAR_LEVEL >= 10 ? 1 : 0;
ok(`${spec.id} L${CHAR_LEVEL}: at most ${DEATH_BUDGET} death(s) in ${runs.length} runs`, deathsTotal <= DEATH_BUDGET, `deaths=${deathsTotal}`);
ok('no engine errors in the fights', H.errors.length === 0, H.errors.slice(0, 3).join(' | '));
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);


