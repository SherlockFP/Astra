#!/usr/bin/env node
/**
 * Party-size and level scaling check (src/systems/instanceScaling.ts): a SOLO character against the Normal rift (Kadim Yarik, crypt
 * theme, band 1-35): one trash pack (crypt_t1 after the Normal trash scaling) and the first boss of the crypt arena
 * (boss_bekci_kaldur). Real CharacterState stats and starter gear, real Combat / SkillSystem / HitShapes / mitigation; the enemies are
 * harness actors whose HP, damage and cadence come from their real EnemyDef (hpMult, dmgMult, basic attack) and the production scaling
 * functions. Boss mechanics (BossController scripts) are NOT simulated: the boss only swings its basic attack.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/scaling.mjs                  (matrix: the band check)
 *   LEVEL=15 SPEC=mage_arcane node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/scaling.mjs   (one config)
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/scaling.mjs --legacy         (today's numbers, baseline)
 *
 * Matrix: knight_blademaster and mage_arcane at character level 1 and 15, one child process each. Per config, over 5 seeds (exit 1 on
 * FAIL): the trash pack costs the solo player 25-55 % of max HP on average (band), at most one death in the 5 runs, sane pack and boss
 * TTK. The 5-player factors are unchanged (HP 3.4 = old GDD factor, damage 1, no boss relief) and the Normal level is clamped.
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
    for (const level of [1, 15]) {
      const r = spawnSync(process.execPath, ['--no-warnings', '--import', './dev/combat-sim/register.mjs', script, ...args], {
        env: { ...process.env, SPEC: spec, LEVEL: String(level) }, encoding: 'utf8',
      });
      process.stdout.write(r.stdout ?? '');
      process.stderr.write(r.stderr ?? '');
      if (r.status !== 0) failed++;
    }
  }
  console.log(failed ? `MATRIX FAIL: ${failed} config(s) out of band` : 'MATRIX PASS: knight and mage at L1 and L15 in band');
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

// ---------------------------------------------------------------------------------------------- 5-player and level checks
if (CHAR_LEVEL === 1) {
  const p5 = partyScales(5, 'normal');
  ok('5 players: HP factor = old GDD factor (3.4)', near(p5.hp, legacyPartyHp(5)), `hp=${p5.hp}`);
  ok('5 players: damage factor 1.0 (unchanged)', p5.dmg === 1 && p5.bossDmg === 1, `dmg=${p5.dmg} boss=${p5.bossDmg}`);
  ok('Mythic+ has no party factor at any size', [1, 2, 3, 4, 5].every((n) => near(partyScales(n, 'mythicplus').hp, 1) && partyScales(n, 'mythicplus').dmg === 1));
  ok('Normal level clamps to the band', normalEnemyLevel([8, 18], 1) === 8 && normalEnemyLevel([8, 18], 12) === 12 && normalEnemyLevel([8, 18], 40) === 18);
  ok('clampParty bounds', clampParty(0) === 1 && clampParty(9) === 5);
}

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

// ---------------------------------------------------------------------------------------------- run
const SEEDS = [1, 2, 3, 4, 5];
const results = [];
let mathRng = new RNG(1);
Math.random = () => mathRng.next();
const realNow = Date.now;

for (const seed of SEEDS) {
  mathRng = new RNG(seed * 7919);
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

  // trash pack
  const trashSpecs = [];
  for (const [defId, n] of TRASH_PACK) for (let k = 0; k < n; k++) trashSpecs.push(spawnSpec(defId, LEVEL, FACTORS));
  const trash = placeRing(trashSpecs);
  trash.forEach((e, i) => setupEnemy(e, trashSpecs[i]));
  const trashRes = fight(ch, trash, p.maxHp, 120);
  const trashTtk = trashRes.t;

  // first boss, the player carries the HP left from the pack (no regen between them)
  const bossSpec = spawnSpec('boss_bekci_kaldur', LEVEL, FACTORS);
  const boss = H.addEnemy(6, 0, { rank: 'boss', hp: bossSpec.hp });
  setupEnemy(boss, bossSpec);
  let bossRes = { t: 0, hp: trashRes.hp, dmgTaken: 0, deaths: 0, left: 1 };
  if (trashRes.hp > 0) bossRes = fight(ch, [boss], trashRes.hp, 300);

  Date.now = realNow;
  results.push({
    seed, trash: { ttk: trashTtk, hpLeft: trashRes.hp, taken: trashRes.dmgTaken, dead: trashRes.hp <= 0, left: trashRes.left },
    boss: { ttk: bossRes.t, hpLeft: bossRes.hp, taken: bossRes.dmgTaken, dead: (bossRes.hp <= 0 && bossRes.left > 0) || trashRes.hp <= 0, killed: boss.isDead },
    maxHp: p.maxHp, armor: ch.stats.armor,
  });
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (v, m) => Math.round((100 * v) / m);
console.log(`scaling sim (${SCALE_MODE}): ${spec.id} level ${CHAR_LEVEL} solo, rift crypt Normal level ${LEVEL}, pack ${TRASH_PACK.map(([d, n]) => n + 'x' + d).join(' + ')}, factors hp x${FACTORS.hp.toFixed(3)} dmg x${FACTORS.dmg.toFixed(2)} boss x${FACTORS.bossDmg.toFixed(2)}`);
console.log(' seed | maxHP armor | pack TTK  HP left  taken | boss TTK  HP left  killed');
for (const r of results) {
  console.log(
    ` ${String(r.seed).padStart(4)} | ${String(r.maxHp).padStart(5)} ${String(r.armor).padStart(5)} | ${r.trash.ttk.toFixed(1).padStart(7)}s ${String(pct(r.trash.hpLeft, r.maxHp)).padStart(6)}% ${String(pct(r.trash.taken, r.maxHp)).padStart(5)}% | ${r.boss.ttk.toFixed(1).padStart(6)}s ${String(pct(r.boss.hpLeft, r.maxHp)).padStart(6)}% ${String(r.boss.killed ? 'yes' : 'no').padStart(6)}`,
  );
}
const packDeaths = results.filter((r) => r.trash.dead).length;
const deaths = results.filter((r) => r.boss.dead).length;
const trashTtks = results.map((r) => r.trash.ttk);
const bossTtks = results.filter((r) => r.boss.killed).map((r) => r.boss.ttk);
const takenPct = avg(results.map((r) => pct(r.trash.taken, r.maxHp)));
console.log(` ${spec.id} L${CHAR_LEVEL}: pack costs ${takenPct.toFixed(0)} % HP on average; deaths in ${results.length} runs: ${deaths}; pack TTK avg ${avg(trashTtks).toFixed(1)} s; boss TTK avg ${bossTtks.length ? avg(bossTtks).toFixed(1) : 'n/a'} s`);

if (!LEGACY) {
  ok(`${spec.id} L${CHAR_LEVEL}: pack costs 25-55 % HP on average`, takenPct >= BAND_MIN && takenPct <= BAND_MAX, `avg ${takenPct.toFixed(1)} %`);
  ok(`${spec.id} L${CHAR_LEVEL}: at most 1 death in the pack fights`, packDeaths <= 1, `deaths=${packDeaths}`);
  ok('pack TTK in a sane range (1-60 s)', avg(trashTtks) >= 1 && avg(trashTtks) <= 60, `avg ${avg(trashTtks).toFixed(1)} s`);
  // the boss is basic-attack only here (no mechanics, no defensives): its numbers are printed, not asserted
  if (bossTtks.length) console.log(`  boss (basic only, info): killed ${bossTtks.length}/${results.length}, TTK avg ${avg(bossTtks).toFixed(1)} s`);
}
ok('no engine errors in the fights', H.errors.length === 0, H.errors.slice(0, 3).join(' | '));
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
