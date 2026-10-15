#!/usr/bin/env node
/**
 * QUEST BOSS CHECK (playtest: a L4-5 knight lost 348 HP in ~8 s to mq_05's boss Yağmacı Başı Gırtlak (mb_girtlak, lair level 5, ~378 HP)
 * and dealt ~10 damage to it). Every playable class at L4 and L5 against the boss at its lair. The boss is spawned the way MiniBossDirector
 * spawns it (spawnEnemy, aggro off, then aggroed on the player, who walks in). Its summons (Gırtlak Çağrısı) run the real path: EnemyAI.doSummon
 * -> spawnAdds -> hooks.spawn (spawnEnemy). The player keeps the boss as its target: a melee class closes to 2.2 m, a ranged one stands still.
 * Real bar (CharacterState.defaultBar), spec APL and LMB filler (as solo_lowlevel), null spec below L10, pinned clock.
 * ASSERTS (exit 1 when one fails):
 *   - every fight won: the boss dies inside the time limit and the player does not
 *   - median TTK over the fights in 18-35 s
 *   - every fight HP left >= 3 % (sim bots never dodge the telegraphed heavy or the rock rain; players do, so they end higher)
 * The report prints the damage split (boss / adds) for every fight: the cause of a low boss damage.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/quest_boss.mjs [--class=warlock,knight] [--level=4,5] [--verbose]
 *   --verbose prints the casts per fight. Exit 0 = all pass.
 */
import * as H from './harness.mjs';
import { readdirSync } from 'node:fs';

const { G, world, errors } = H;
const DT = H.DT;
// Repeatable runs: timers read the sim clock (ms), as in balance.mjs.
performance.now = () => G.engine.time * 1000;
Date.now = () => 1800000000000 + G.engine.time * 1000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return [m[1], m[2] ?? true];
}));
const LEVELS = args.level ? String(args.level).split(',').map(Number) : [4, 5];
const CLASS_FILTER = args.class ? String(args.class).split(',') : null;
const VERBOSE = !!args.verbose;
/** the player's target: the nearest living add while one is up (it hits the player and dies in a hit or two), then the boss. --target=boss keeps the boss */
const TARGET_BOSS_ONLY = args.target === 'boss';
/** calibration knobs (a diagnostic, not the check): the boss's HP and damage multipliers */
const BOSS_HP_MULT = args['boss-hp'] ? Number(args['boss-hp']) : 1;
const BOSS_DMG_MULT = args['boss-dmg'] !== undefined ? Number(args['boss-dmg']) : 1;
const BOSS_ID = 'mb_girtlak';
const BOSS_LEVEL = 5;
const TIME_LIMIT = 120;
const TTK_MEDIAN = [18, 35];
const HP_MIN = 0.03;
const SPAWN_DIST = 8;
const PLAYER_RUN = 7; // m/s: a melee character walks to the boss
let CHASE = null; // the enemy the character closes on this frame (null: the player stands still)
let CHASE_STOP = 2.2; // melee stops at 2.2 m; a ranged character stands still

const { spawnEnemy } = await H.imp('entities/EnemyFactory.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { CLASSES, PLAYABLE_CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { RNG } = await H.imp('core/utils.ts');
const { ProcEngine } = await H.imp('combat/Procs.ts');
const { Combat } = await H.imp('combat/Combat.ts');
const { SkillSystem } = await H.imp('combat/SkillSystem.ts');
const { HitShapes } = await H.imp('combat/HitShapes.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { SKILLS } = await H.imp('data/skills.ts');
const { stasisStored } = await H.imp('combat/skills/evokerKit.ts');
// every rotation kit table, keyed by spec id (as solo_lowlevel merges them)
const ROT = {};
for (const f of readdirSync(new URL('../../src/data/', import.meta.url))) {
  if (!/^rotations_kit_.*\.ts$/.test(f)) continue;
  for (const table of Object.values(await H.imp('data/' + f))) Object.assign(ROT, table);
}
// the lair spawn and the summons run the real mythic / party hooks: no run is active (open world), so the scaling is x1 / solo
G.mplus.onEnemySpawned = () => {};
G.mplus.enemyScaling = () => ({ hp: 1, dmg: 1 });

// ---------------------------------------------------------------------------------------------------------------- determinism
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
let mathRng = new RNG(1);
Math.random = () => mathRng.next();
/** Damage the local player takes in the current fight: [time, amount] (feeds the APL token damage_taken_5s). */
let takenLog = [];
G.events.on('damage', (ev) => {
  if (ev.amount > 0 && G.player && ev.targetId === G.player.id) takenLog.push([G.engine.time, ev.amount]);
});
let castLog = {};
G.events.on('skill:cast', (ev) => { if (G.player && ev?.casterId === G.player.id) castLog[ev.skillId] = (castLog[ev.skillId] ?? 0) + 1; });

// ---------------------------------------------------------------------------------------------------------------- character
/** Default spec of a class: the first of its spec list (a class without one falls back to any registered spec of it). */
function specOf(classId) {
  const id = (CLASSES[classId].specs ?? [])[0];
  return SPECS[id] ?? Object.values(SPECS).find((s) => s.classId === classId);
}
/** A pet class from the spec data: a special with a `pet` param (necromancer_summoner's trait_summoner keeps a ghoul) or a pet-tagged skill on its bar. */
const hasPet = (spec) => (spec.specials ?? []).some((s) => (s.params?.pet ?? 0) > 0)
  || Object.values(spec.defaultBar ?? {}).some((id) => SKILLS[id]?.tags?.includes('pet'));
/** The class's bar at a level as the game grants it: CharacterState.defaultBar (the opening kit, openingKit.ts). */
const barFor = (classId, L) => CharacterState.defaultBar(classId, L);
/** Player.refreshStats for a local actor: maxHp / resource from the final stats. */
function syncPlayer(p, ch, spec) {
  const st = ch.stats;
  p.spec = spec.id;
  p.stats = { ...st };
  p.level = ch.level;
  p.resourceType = CLASSES[p.classId].resource;
  p.baseMaxHp = Math.max(1, Math.round((st.maxHp ?? 0) > 0 ? st.maxHp : 100 + p.level * 20));
  p.maxHp = p.baseMaxHp;
  p.hp = p.maxHp;
  p.maxResource = Math.max(1, Math.round((st.maxResource ?? 0) > 0 ? st.maxResource : 100));
  p.resource = p.resourceType === 'rage' ? 0 : p.maxResource;
  p.onStatusesChanged = () => foldMaxHp(p);
  foldMaxHp(p);
}
function foldMaxHp(p) {
  const mods = p.statuses.getStatMods();
  p.maxHp = Math.max(1, Math.round((p.baseMaxHp + (mods.maxHp ?? 0)) * (1 + (mods.maxHpPct ?? 0))));
  p.hp = Math.min(p.hp, p.maxHp);
}

// ---------------------------------------------------------------------------------------------------------------- APL (as balance.mjs)
const CONDITION_GROUP = /[<>=&|!]|^\s*!?\s*(status|target\.|stacks|remaining|pips|cd|charges|res|hp|targets|allies|ally|stealthed|moving|behind|dot_refresh|lmb_step|tgt|damage_taken)/;
function stripAnnotations(s) {
  return s.replace(/(^|\s)\(([^()]*)\)/g, (whole, sp, inner) => (CONDITION_GROUP.test(inner) ? whole : sp));
}
const ALLOWED = new Set(['true', 'false']);
function compile(line, spec) {
  const clean = stripAnnotations(line).replace(/\s+@each\b/g, '').replace(/\b(status|stacks|remaining):(\w+)@tgt\b/g, 'target.$1:$2').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  if (!m) throw new Error(`${spec.id}: bad APL line "${line}"`);
  const self = m[1].replace(/@.*$/, '');
  let c = (m[2] ?? 'true');
  c = c.replace(/\bcd\b(?!\s*\()/g, `E.cd('${self}')`).replace(/\bcharges\b(?!\s*\()/g, `E.charges('${self}')`);
  const rep = [
    [/\bstealthed\b/g, "E.status('stealth')"], [/\blmb_step\b/g, 'E.lmbStep'], [/allies\.debuffed/g, 'E.alliesDebuffed'],
    [/cd_ready\((\w+)\)/g, "E.cdReady('$1')"], [/charges\((\w+)\)/g, "E.charges('$1')"], [/\bcd\((\w+)\)/g, "E.cd('$1')"],
    [/lowest\.status:(\w+)/g, "E.lowestStatus('$1')"], [/lowest\.hp%/g, 'E.allyLowPct'],
    [/target\.status:(\w+)/g, "E.tStatus('$1')"], [/target\.stacks:(\w+)/g, "E.tStacks('$1')"], [/target\.remaining:(\w+)/g, "E.tRemaining('$1')"],
    [/dot_refresh:(\w+)/g, "E.dotRefresh('$1')"], [/status:(\w+)/g, "E.status('$1')"], [/stacks:(\w+)/g, "E.stacks('$1')"],
    [/remaining:(\w+)/g, "E.remaining('$1')"], [/pips:(\w+)/g, "E.pips('$1')"], [/damage_taken_5s/g, 'E.damageTaken5s'],
    [/target\.hp%/g, 'E.tHpPct'], [/target\.hp/g, 'E.tHpFrac'], [/ally\.low%/g, 'E.allyLowPct'], [/allies\.injured/g, 'E.alliesInjured'],
    [/allies\.linked/g, 'E.alliesLinked'], [/tank\.hp%/g, 'E.tankHpPct'], [/\bhp%/g, 'E.hpPct'], [/\bres%/g, 'E.resPct'],
    [/\bmoving\b/g, 'E.moving'], [/\bbehind\b/g, 'E.behind'], [/\b(?:resource|res)\b/g, 'E.res'], [/\bhp\b/g, 'E.hpFrac'],
    [/\binjured\b/g, 'E.alliesInjured'], [/\bstored\b/g, 'E.stored'], [/\btargets\b/g, 'E.targets'], [/\btgt\b/g, 'E.targets'],
  ];
  for (const [re, to] of rep) c = c.replace(re, to);
  const stripped = c.replace(/'[^']*'/g, "''").replace(/E\.\w+/g, 'E');
  const bare = [...stripped.matchAll(/[A-Za-z_][A-Za-z_0-9]*/g)].map((x) => x[0]).filter((w) => !ALLOWED.has(w) && w !== 'E');
  if (bare.length) throw new Error(`${spec.id}: unknown APL token(s) ${[...new Set(bare)].join(',')} in "${line}"`);
  // eslint-disable-next-line no-new-func
  const fn = new Function('E', `return (${c});`);
  const rk = m[1].match(/@rank=(\d)/);
  return { skill: self, line, fn, rank: rk ? Number(rk[1]) : null, empower: SKILLS[self]?.behavior === 'kit_empower' };
}
/** Lines whose skill is not in the spec's table are skipped; free-text lines without `if` are not modelled (as balance.mjs). */
function aplFor(spec, list) {
  const out = [];
  for (const line of list) {
    const first = line.split(/\s/)[0].replace(/@.*$/, '');
    if (first === 'lmb') continue;
    if (!SKILLS[first]) throw new Error(`${spec.id}: APL names an unknown skill "${first}"`);
    if (/\s/.test(line.trim()) && !/\sif\s/.test(stripAnnotations(line))) continue;
    out.push(compile(line, spec));
  }
  return out;
}
function makeEnv(p, e, enemies) {
  const cd = (id) => G.skills.getCooldown(p, id);
  return {
    cdReady: (id) => { const c = cd(id); return c.remaining <= 0 && c.charges >= 1; },
    charges: (id) => cd(id).charges,
    cd: (id) => cd(id).remaining,
    status: (id) => p.statuses.has(id),
    stacks: (id) => p.statuses.stacks(id),
    remaining: (id) => p.statuses.get(id)?.remaining ?? 0,
    tStatus: (id) => !!e && e.statuses.has(id),
    tStacks: (id) => (e ? e.statuses.stacks(id) : 0),
    tRemaining: (id) => (e ? e.statuses.get(id)?.remaining ?? 0 : 0),
    dotRefresh: (id) => (e ? (e.statuses.get(id)?.remaining ?? 0) <= 3 : false),
    pips: (id) => G.skills.pipCount(p, id),
    tHpPct: e ? (e.hp / e.maxHp) * 100 : 0,
    tHpFrac: e ? e.hp / e.maxHp : 0,
    lowestStatus: () => false,
    tankHpPct: 100,
    allyLowPct: 100,
    alliesInjured: 0,
    alliesLinked: 0,
    alliesDebuffed: 0,
    lmbStep: (() => { const st = G.skills.state(p); return (G.skills.now - st.combo.lastEnd > 0.85 ? 0 : st.combo.next) + 1; })(),
    hpPct: (p.hp / p.maxHp) * 100,
    hpFrac: p.hp / p.maxHp,
    damageTaken5s: takenLog.reduce((s, [t, a]) => (t >= G.engine.time - 5 ? s + a : s), 0) / Math.max(1, p.maxHp),
    res: p.resource,
    resPct: (p.resource / Math.max(1, p.maxResource)) * 100,
    moving: false,
    behind: false,
    stored: stasisStored(p),
    targets: enemies.filter((x) => !x.isDead && !x.removed).length,
  };
}
function slotOf(p, id) {
  for (const s of ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180']) {
    if (G.skills.getSlotSkill(p, s) === id) return s;
  }
  return null;
}
// Empowered holds (kit_empower): the held key reads as down while the cast is inside its hold window (as balance.mjs).
const HOLD_DEFAULT = [0.67, 1.33, 2.0];
const EMP = { slot: null, secs: 0 };
const baseDown = G.input.down;
G.input.down = (a) => (EMP.slot && a === `skill_${EMP.slot}` && empHolding() ? true : baseDown(a));
function empHolding() {
  const act = G.skills.getAction(G.player);
  return !!act && act.channel && act.elapsed < EMP.secs;
}
function startHold(p, slot, l) {
  const act = G.skills.getAction(p);
  if (!act || act.skillId !== l.skill || act.elapsed > 0.1) return;
  const def = SKILLS[l.skill];
  const r = l.rank ?? 3;
  EMP.slot = slot;
  EMP.secs = ((def.params?.[`hold${r}`] ?? HOLD_DEFAULT[r - 1]) / (G.skills.speedFactor(p, def) || 1)) + 0.15;
}
/** One frame of the rotation: the first castable line wins; with nothing castable the LMB chain fills (as balance.mjs). */
function pressApl(p, lines, env, aim) {
  let gcdWait = false;
  for (const l of lines) {
    if (!slotOf(p, l.skill)) continue;
    if (!l.fn(env)) continue;
    const cur = G.skills.state(p).cur;
    if (cur && cur.def.id === l.skill && !cur.def.channel && !cur.channel?.active) return true;
    const slot = slotOf(p, l.skill);
    if (G.skills.tryCastSlot(p, slot, aim)) {
      if (l.empower) startHold(p, slot, l);
      return true;
    }
    if (G.skills.state(p).gcdUntil > G.skills.now) gcdWait = true;
  }
  if (gcdWait) return false;
  if (G.skills.getSlotSkill(p, 'lmb') && p.canAct()) return G.skills.tryCastSlot(p, 'lmb', aim);
  return false;
}

// ---------------------------------------------------------------------------------------------------------------- fight
/** One frame: proc clock, world / skills / combat / hit shapes (H.step), then the minions. The player stands on its spawn point. */
function frame() {
  G.procs.update(DT);
  H.step(1);
  G.minions?.update(DT);
  const p = G.player;
  if (!p || p.removed) return;
  p.forcedMove = null;
  const m = CHASE;
  if (!m) { p.position.x = 0; p.position.z = 0; return; }
  if (m.isDead || m.removed) return;
  const d = Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z);
  const step = Math.min(Math.max(0, d - CHASE_STOP), PLAYER_RUN * DT);
  if (step > 0) { p.position.x += ((m.position.x - p.position.x) / d) * step; p.position.z += ((m.position.z - p.position.z) / d) * step; }
}

// ---------------------------------------------------------------------------------------------------------------- damage ledger
/** Damage the local player deals / takes, by the target / source id (a summon has its own id: the boss and its adds split apart). */
const dealt = {};
/** the boss of the current fight: its casts (enemy:castStart) and the casts of the other enemies, by ability id. */
let curBossId = null;
const bossCasts = {};
const addCasts = {};
G.events.on('enemy:castStart', (ev) => {
  if (ev.enemyId === curBossId) bossCasts[ev.abilityId] = (bossCasts[ev.abilityId] ?? 0) + 1;
  else addCasts[ev.abilityId] = (addCasts[ev.abilityId] ?? 0) + 1;
});
const taken = {};
/** enemy id -> def id, kept for the enemies of the fight (a dead add still reads its name). */
let names = {};
G.events.on('damage', (ev) => {
  if (!G.player || !(ev.amount > 0)) return;
  if (ev.sourceId === G.player.id) dealt[ev.targetId] = (dealt[ev.targetId] ?? 0) + ev.amount;
  if (ev.targetId === G.player.id) taken[ev.sourceId] = (taken[ev.sourceId] ?? 0) + ev.amount;
});

// ---------------------------------------------------------------------------------------------------------------- fight
/**
 * One fight: a fresh world, the real character on its spec bar at L, the boss at SPAWN_DIST (spawnEnemy as MiniBossDirector does it),
 * aggroed on the player. Resolves when the boss dies (the quest kill), the player dies or the time limit runs out.
 */
async function fight(classId, L) {
  const spec = specOf(classId);
  const seed = hashStr(`${classId}@${L}:${BOSS_ID}`);
  G.engine.time = 0; // each fight on its own clock: a result no longer depends on the fights run before it
  mathRng = new RNG(seed);
  for (const e of [...world.entities.values()]) world.remove(e);
  world.update(0);
  world.nav.setRect(-99, -99, 99, 99, true);
  G.combat = new Combat();
  G.combat.rng = new RNG(seed ^ 0x9e3779b9);
  G.skills = new SkillSystem();
  G.hitShapes = new HitShapes();
  G.minions = new Minions();
  H.clearEvents();
  const realNow = Date.now;
  Date.now = () => seed;
  try { G.procs = new ProcEngine(); } finally { Date.now = realNow; }
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}) };
  takenLog = [];
  castLog = {};
  EMP.slot = null;
  for (const k of Object.keys(dealt)) delete dealt[k];
  for (const k of Object.keys(taken)) delete taken[k];
  names = {};

  const ch = CharacterState.create('Solo', classId);
  ch.save.level = L;
  ch.save.spec = L >= 10 ? spec.id : null; // the spec is picked at L10: no spec passives below it (CharacterState.spec)
  ch.save.skillBar = barFor(classId, L);
  ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  ch.recomputeStats(false);
  G.character = ch;
  const p = new H.FakePlayer(classId, L);
  world.add(p);
  world.localPlayer = G.player = p;
  syncPlayer(p, ch, spec);
  G.procs.setEntries(ch.fx.procs);
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.resource = p.maxResource;

  // pet on the bar: summoned before the pull, with 3 s for it to arrive (as solo_lowlevel)
  const pet = Object.values(ch.save.skillBar).find((id) => SKILLS[id]?.tags?.includes('pet'));
  if (pet && G.skills.tryCast(p, pet, H.aimFor(p, null))) for (let f = 0; f < Math.round(3 / DT); f++) frame();
  castLog = {};

  // fresh AI director per fight (its AI list and grid would carry the fights before this one into it)
  { const dir = getDirector(world); dir.ais.length = 0; dir.piles.length = 0; dir.packLinks.clear(); dir.grid?.clear?.(); }
  // the lair boss: MiniBossDirector.spawn -> spawnEnemy(id, lair, { level, aggro: false }); the player walking in aggroes it
  const boss = await spawnEnemy(world, BOSS_ID, { x: 0, z: SPAWN_DIST }, { level: BOSS_LEVEL, aggro: false });
  if (!boss) throw new Error(`${BOSS_ID} did not spawn`);
  boss.maxHp = boss.hp = Math.round(boss.maxHp * BOSS_HP_MULT);
  boss.baseDamage *= BOSS_DMG_MULT;
  names[boss.id] = BOSS_ID;
  curBossId = boss.id;
  for (const k of Object.keys(bossCasts)) delete bossCasts[k];
  for (const k of Object.keys(addCasts)) delete addCasts[k];
  boss.ai.acquire(p, true);
  p.targetId = boss.id;

  const melee = (SKILLS[ch.save.skillBar.lmb]?.range ?? 99) <= 3.5;
  CHASE_STOP = melee ? 2.2 : 10;
  const lines = aplFor(spec, ROT[spec.id]?.st ?? []);
  const maxFrames = Math.round(TIME_LIMIT / DT);
  let outcome = 'timeout';
  let time = TIME_LIMIT;
  let addsPeak = 0;
  const addsSeen = new Set();
  for (let f = 0; f < maxFrames; f++) {
    const alive = world.enemies.filter((e) => !e.isDead && !e.removed);
    for (const e of world.enemies) {
      names[e.id] ??= e.def.id;
      if (e.id !== boss.id) addsSeen.add(e.id);
    }
    addsPeak = Math.max(addsPeak, alive.filter((e) => e !== boss).length);
    const adds = alive.filter((e) => e !== boss);
    const near = adds.reduce((a, b) => (Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z) < Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) ? b : a), adds[0]);
    const t = boss.isDead ? null : !TARGET_BOSS_ONLY && near ? near : boss;
    CHASE = melee ? t : null;
    H.setAimTarget(t);
    if (t) p.yaw = Math.atan2(t.position.x - p.position.x, t.position.z - p.position.z); // a real player turns to its target
    pressApl(p, lines, makeEnv(p, t, alive), H.aimFor(p, t));
    frame();
    await new Promise((r) => setImmediate(r)); // the summons resolve their async spawn (loadModel) on the event loop
    if (boss.isDead) { outcome = 'win'; time = (f + 1) * DT; break; }
    if (p.isDead) { outcome = 'dead'; time = (f + 1) * DT; break; }
  }
  H.setAimTarget(null);
  CHASE = null;
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  const dealtBoss = dealt[boss.id] ?? 0;
  const takenBoss = taken[boss.id] ?? 0;
  return {
    spec: spec.id, outcome, time, hpLeft: Math.max(0, p.hp) / p.maxHp, bossHpLeft: Math.max(0, boss.hp) / boss.maxHp,
    dealtBoss, dealtAdds: sum(dealt) - dealtBoss, takenBoss, takenAdds: sum(taken) - takenBoss,
    addsPeak, addsSpawned: addsSeen.size, casts: { ...castLog }, bossCasts: { ...bossCasts }, addCasts: { ...addCasts }, maxHp: p.maxHp,
    bossHp: boss.maxHp, bossDmg: Math.round(boss.baseDamage), melee, pet: hasPet(spec),
  };
}

// ---------------------------------------------------------------------------------------------------------------- report
const classes = PLAYABLE_CLASSES.filter((c) => !CLASS_FILTER || CLASS_FILTER.includes(c));
const fights = [];
for (const c of classes) {
  if (!specOf(c)) { fights.push({ c, L: 0, r: { outcome: 'no spec' } }); continue; }
  for (const L of LEVELS) {
    let r;
    try {
      r = await fight(c, L);
    } catch (err) {
      r = { outcome: 'throw', error: String(err?.message ?? err).slice(0, 200), time: 0, hpLeft: 0, bossHpLeft: 1, dealtBoss: 0, dealtAdds: 0, takenBoss: 0, takenAdds: 0, addsPeak: 0, addsSpawned: 0, casts: {} };
    }
    fights.push({ c, L, r });
  }
}
const pad = (s, n) => String(s).padEnd(n);
const pct = (x) => `${Math.round(x * 100)}%`;
const median = (xs) => { const v = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!v.length) return NaN; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const sec = (x) => (Number.isFinite(x) ? `${x.toFixed(1)}s` : '--');
const share = (r) => (r.dealtBoss + r.dealtAdds > 0 ? r.dealtBoss / (r.dealtBoss + r.dealtAdds) : 0);
console.log(`quest boss: ${BOSS_ID} (mq_05 Yağmacı Başı Gırtlak, lair L${BOSS_LEVEL}) vs ${classes.length} classes at L${LEVELS.join('/')}`);
console.log(pad('fight', 16) + pad('result', 9) + pad('TTK', 9) + pad('player HP', 12) + pad('boss HP', 10) + pad('dmg boss', 10) + pad('dmg adds', 10) + pad('boss share', 12) + pad('adds seen', 11) + 'taken boss/adds');
for (const f of fights) {
  const r = f.r;
  const tag = `${f.c}@L${f.L}`;
  console.log(pad(tag, 16) + pad(r.outcome, 9) + pad(sec(r.outcome === 'win' ? r.time : NaN), 9) + pad(pct(r.hpLeft ?? 0), 12)
    + pad(pct(r.bossHpLeft ?? 1), 10) + pad(Math.round(r.dealtBoss ?? 0), 10) + pad(Math.round(r.dealtAdds ?? 0), 10)
    + pad(pct(share(r)), 12) + pad(r.addsSpawned ?? 0, 11) + `${Math.round(r.takenBoss ?? 0)}/${Math.round(r.takenAdds ?? 0)}`);
  if (VERBOSE) {
    const casts = Object.entries(r.casts ?? {}).map(([k, v]) => `${k.replace(/^[a-z]+_/, '')}x${v}`).join(' ');
    const bc = Object.entries(r.bossCasts ?? {}).map(([k, v]) => `${k}x${v}`).join(' ');
    console.log(`  bar ${f.c}@L${f.L}: ${spec_ids(f.c)} | boss hp ${r.bossHp} dmg ${r.bossDmg} | boss casts ${bc || '(none)'} | adds peak ${r.addsPeak} | player casts ${casts || '(none)'}${r.error ? ' | ' + r.error : ''}`);
  }
}
function spec_ids(c) { const s = specOf(c); return s ? s.id : '-'; }
const won = fights.filter((f) => f.r.outcome === 'win');
if (won.length) {
  const lo = won.reduce((a, b) => (b.r.time < a.r.time ? b : a));
  const hi = won.reduce((a, b) => (b.r.time > a.r.time ? b : a));
  console.log(`TTK min ${sec(lo.r.time)} (${lo.c}@L${lo.L}), max ${sec(hi.r.time)} (${hi.c}@L${hi.L})`);
}
const engineErrs = errors.filter((e) => /ERR/.test(e));
if (engineErrs.length) console.log(`engine errors logged: ${engineErrs.length} (first: ${engineErrs[0].slice(0, 160)})`);

const notWon = fights.filter((f) => f.r.outcome !== 'win');
const ttkMedian = median(won.map((f) => f.r.time));
const hpBad = fights.filter((f) => !(f.r.hpLeft >= HP_MIN));
const checks = [
  ['every fight won (boss dead, player alive, inside the time limit)', notWon.map((f) => `${f.c}@L${f.L} ${f.r.outcome}${f.r.error ? ' ' + f.r.error : ''}`)],
  [`median TTK ${TTK_MEDIAN[0]}-${TTK_MEDIAN[1]} s`, !(ttkMedian >= TTK_MEDIAN[0] && ttkMedian <= TTK_MEDIAN[1]) ? [sec(ttkMedian)] : []],
  [`every fight HP left >= ${pct(HP_MIN)}`, hpBad.map((f) => `${f.c}@L${f.L} ${pct(f.r.hpLeft)}`)],
];
let allOk = true;
for (const [name, bad] of checks) {
  const ok = bad.length === 0;
  if (!ok) allOk = false;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + bad.length + ' (' + bad.slice(0, 8).join('; ') + (bad.length > 8 ? '; ...' : '') + ')'}`);
}
console.log(allOk ? 'QUEST BOSS: all pass' : 'QUEST BOSS: fail');
process.exit(allOk ? 0 : 1);
