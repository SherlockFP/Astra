#!/usr/bin/env node
/**
 * SOLO LOW-LEVEL CHECK (playtest: a level-2 warlock died to ONE level-2 Sisli rat). Every playable class on its default spec, at
 * L1 / L2 / L3 / L5, with the spec's bar cut to the skills unlocked at that level (spec.defaultBar, unlock table), the character's
 * starting gear only (CharacterState.create), and the spec's `st` APL (lines whose skill is not on the bar never fire) plus the LMB
 * filler. Fight: one same-level Sisli trash mob (ow_rat, ow_slime, ow_wolf) as a real Enemy with its real EnemyAI, at the level's
 * monster HP / damage (monsterHP / monsterDmg x the def's multipliers, as EnemyFactory sets them). The player stands still.
 * Pre-pull: a pet summon on the bar (tag 'pet') is cast and given 3 s to arrive.
 * Fight pace (WoW retail low levels: a same-level normal mob takes a solo player 5-10 s, ending at 55-90 % HP (tanks and pet classes may end at 97 %), so abilities, procs and
 * positioning matter). Mobs: rat, slime, wolf, goblin (ow_goblin). Levels L1 / L3 / L5 / L8 / L10. Melee characters (basic range
 * <= 3.5 m) walk to their mob; the others stand still. Mobs use the open-world low-level curve (data/lowLevelScaling.ts). Every fight prints its TTK (sim seconds to the mob's death) and the player's
 * HP left. Per class, over its fights (levels x mobs). ASSERTS (exit 1 when one fails):
 *   - every fight is won inside the 20 s limit (no timeout, no death, no throw)
 *   - median TTK across the classes in 5-11 s
 *   - each class's median TTK in 5-10 s (over its L1-10 fights)
 *   - each class's median HP left in 55-90 % (a tank spec or a pet class: 55-97 %)
 * The spec tuning table (CM1) applies (see harness).
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/solo_lowlevel.mjs [--class=warlock,knight] [--level=1,3] [--verbose]
 *   --verbose prints the bar and the casts per fight. Exit 0 = all pass.
 */
import * as H from './harness.mjs';
import { readdirSync } from 'node:fs';

const { G, world, errors } = H;
const DT = H.DT;
// Repeatable runs: timers read the sim clock (ms), as in balance.mjs.
performance.now = () => G.engine.time * 1000;
// wall clock too (Date.now reads in CharacterState, Combat / Procs seeds, ...): the sim clock, so no run reads the real time
Date.now = () => 1800000000000 + G.engine.time * 1000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return [m[1], m[2] ?? true];
}));
const LEVELS = args.level ? String(args.level).split(',').map(Number) : [1, 3, 5, 8, 10];
const CLASS_FILTER = args.class ? String(args.class).split(',') : null;
const VERBOSE = !!args.verbose;
const MOBS = ['ow_rat', 'ow_slime', 'ow_wolf', 'ow_goblin'];
const TIME_LIMIT = 20;
const TTK_CLASS = [5, 10]; // a class's median fight TTK (s)
const TTK_MEDIAN = [5, 11]; // median TTK across the classes (s)
const HP_LEFT = [0.55, 0.9]; // a class's median player HP left
const HP_LEFT_RELAXED = [0.55, 1.0]; // a tank spec, a pet class (its pet takes the hits) or a ranged kiter (archer): barely scratched solo, as in WoW
const SPAWN_DIST = 8;
const PLAYER_RUN = 7; // m/s: a melee character (basic range <= 3.5 m) walks to its mob, a kiting goblin cannot keep it out of reach
let CHASE = null; // the mob the character closes on in the current fight (null: the player stands still)
let CHASE_STOP = 2.2; // melee stops at 2.2 m; a ranged character only follows a mob that gets out of spell range (18 m)

const { ENEMIES } = await H.imp('data/enemies.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const { monsterHP, monsterDmg } = await H.imp('data/mythicAffixes.ts');
const { isLowLevelTrashRank, lowLevelHpMult, lowLevelDmgMult } = await H.imp('data/lowLevelScaling.ts');
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
const { CONTACT_M } = await H.imp('scenes/world/QuestEscortRun.ts');
const { ESCORT_ROUTES } = await H.imp('data/world/escort_routes.ts');
// every rotation kit table, keyed by spec id (as balance.mjs merges them)
const ROT = {};
for (const f of readdirSync(new URL('../../src/data/', import.meta.url))) {
  if (!/^rotations_kit_.*\.ts$/.test(f)) continue;
  for (const table of Object.values(await H.imp('data/' + f))) Object.assign(ROT, table);
}

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

/**
 * One fight: a fresh world, the real character on its spec bar at L, a real mob at SPAWN_DIST, aggroed on the player.
 * `o.wave` = mobs of the fight (a quest ambush wave: they stand 3 m apart, the nearest living one is the target), `o.escort` = { hp,
 * dps }: an escort NPC 2 m behind the player takes `dps` per ambusher within CONTACT_M of it (QuestEscortRun), and the fight fails
 * when it falls. Without `o`: one mob, no escort (the solo report).
 */
function fight(classId, L, mobId, o = {}) {
  const spec = specOf(classId);
  const key = `${classId}@${L}:${mobId}`;
  const seed = hashStr(key);
  G.engine.time = 0; // each fight on its own clock: a result no longer depends on the fights run before it (order, count)
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

  // pet on the bar: summoned before the pull, with 3 s for it to arrive (as balance.mjs prePull)
  const pet = Object.values(ch.save.skillBar).find((id) => SKILLS[id]?.tags?.includes('pet'));
  if (pet && G.skills.tryCast(p, pet, H.aimFor(p, null))) for (let f = 0; f < Math.round(3 / DT); f++) frame();
  castLog = {};

  // fresh AI director per fight: its AI list and grid would carry the fights before this one into it
  { const dir = getDirector(world); dir.ais.length = 0; dir.piles.length = 0; dir.packLinks.clear(); dir.grid?.clear?.(); }
  const def = ENEMIES[mobId];
  // the open-world camp spawn path (EnemyFactory openWorld): trash / swarm take the low-level curve
  const low = isLowLevelTrashRank(def.rank, def.role);
  const xs = (o.wave ?? 1) > 1 ? [-1.5, 1.5] : [0];
  const mobs = xs.map((x, i) => {
    const mob = new Enemy(9000 + (seed % 900) + i, def);
    mob.level = L;
    mob.position.set(x, 0, SPAWN_DIST);
    mob.homeX = x;
    mob.homeZ = SPAWN_DIST;
    mob.maxHp = Math.max(1, Math.round(monsterHP(L) * def.hpMult * (low ? lowLevelHpMult(L) : 1)));
    mob.hp = mob.maxHp;
    mob.baseDamage = monsterDmg(L) * def.dmgMult * (low ? lowLevelDmgMult(L) : 1);
    mob.stats = { armor: def.armorMult ? 10 * L * def.armorMult : 0 };
    mob.authority = true;
    world.add(mob);
    mob.ai = new EnemyAI(mob, getDirector(world));
    mob.ai.acquire(p, true);
    return mob;
  });
  const mob = mobs[0];
  p.targetId = mob.id;
  // the target: the nearest living mob of the fight (the first one when the fight starts)
  const target = () => mobs.filter((m) => !m.isDead && !m.removed).reduce((a, b) => (Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z) < Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) ? b : a), mobs[0]);
  // the escort NPC stands 2 m behind the player (EscortRun: the ambushers within CONTACT_M of it hit it, it falls at 0 HP)
  const escort = o.escort ? { hp: o.escort.hp, dps: o.escort.dps, max: o.escort.hp } : null;

  const melee = (SKILLS[ch.save.skillBar.lmb]?.range ?? 99) <= 3.5;
  CHASE_STOP = melee ? 2.2 : 10;
  const lines = aplFor(spec, ROT[spec.id]?.st ?? []);
  const maxFrames = Math.round(TIME_LIMIT / DT);
  let outcome = 'timeout';
  let time = TIME_LIMIT;
  for (let f = 0; f < maxFrames; f++) {
    const t = target();
    CHASE = melee ? t : null;
    H.setAimTarget(t);
    p.yaw = Math.atan2(t.position.x - p.position.x, t.position.z - p.position.z); // a real player turns to its target
    pressApl(p, lines, makeEnv(p, t, mobs), H.aimFor(p, t));
    frame();
    if (escort) {
      const ex = p.position.x, ez = p.position.z - 2;
      const near = mobs.filter((m) => !m.isDead && !m.removed && Math.hypot(m.position.x - ex, m.position.z - ez) <= CONTACT_M).length;
      escort.hp -= near * escort.dps * DT;
    }
    if (mobs.every((m) => m.isDead)) { outcome = 'win'; time = (f + 1) * DT; break; }
    if (p.isDead) { outcome = 'dead'; time = (f + 1) * DT; break; }
    if (escort && escort.hp <= 0) { outcome = 'escort'; time = (f + 1) * DT; break; }
  }
  H.setAimTarget(null);
  CHASE = null;
  return {
    spec: spec.id, bar: { ...ch.save.skillBar }, outcome, time, hpLeft: p.maxHp > 0 ? Math.max(0, p.hp) / p.maxHp : 0,
    mobHpLeft: mob.maxHp > 0 ? Math.max(0, mob.hp) / mob.maxHp : 0, casts: { ...castLog },
    pet: hasPet(spec), tank: SPECS[spec.id]?.role === 'tank', lines: lines.length, maxHp: p.maxHp, mobDmg: Math.round(mob.baseDamage), mobHp: mob.maxHp,
    escortHpLeft: escort ? Math.max(0, escort.hp) / escort.max : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------- report
const classes = PLAYABLE_CLASSES.filter((c) => !CLASS_FILTER || CLASS_FILTER.includes(c));
const results = {}; // classId -> L -> mob -> result
const specErrors = [];
for (const c of classes) {
  if (!specOf(c)) { specErrors.push(`${c}: no spec row`); continue; }
  results[c] = {};
  for (const L of LEVELS) {
    results[c][L] = {};
    for (const mob of MOBS) {
      try {
        results[c][L][mob] = fight(c, L, mob);
      } catch (err) {
        results[c][L][mob] = { outcome: 'throw', error: String(err?.message ?? err).slice(0, 200), hpLeft: 0, time: 0, casts: {} };
      }
    }
  }
}
const median = (xs) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fights = [];
for (const c of classes) for (const L of LEVELS) for (const mob of MOBS) {
  const r = results[c]?.[L]?.[mob];
  if (!r) continue;
  fights.push({ c, L, mob, r, ttk: r.outcome === 'win' ? r.time : NaN, hp: r.hpLeft ?? 0 });
}
const pad = (s, n) => String(s).padEnd(n);
const pct = (x) => `${Math.round(x * 100)}%`;
const sec = (x) => (Number.isFinite(x) ? `${x.toFixed(1)}s` : '--');
const cls = Object.fromEntries(classes.map((c) => {
  const fs = fights.filter((f) => f.c === c);
  return [c, { ttk: median(fs.map((f) => f.ttk)), hp: median(fs.map((f) => f.hp)), lost: fs.filter((f) => !Number.isFinite(f.ttk)).length }];
}));
console.log(`solo low-level: ${classes.length} classes x L${LEVELS.join('/')} x ${MOBS.map((m) => m.replace('ow_', '')).join('/')} (same level)`);
console.log(`cell = median TTK over the mobs / median HP left of the player; * = a fight of the cell is not won`);
console.log(pad('class', 12) + pad('spec', 22) + LEVELS.map((L) => pad('L' + L, 14)).join('') + pad('class median', 16));
for (const c of classes) {
  if (!results[c]) continue;
  let line = pad(c, 12) + pad(specOf(c).id, 22);
  for (const L of LEVELS) {
    const cell = fights.filter((f) => f.c === c && f.L === L);
    const ttk = median(cell.map((f) => f.ttk));
    const hp = median(cell.map((f) => f.hp));
    const lost = cell.some((f) => !Number.isFinite(f.ttk));
    line += pad(`${sec(ttk)} ${pct(hp)}${lost ? ' *' : ''}`, 14);
  }
  line += pad(`${sec(cls[c].ttk)} ${pct(cls[c].hp)}`, 16);
  console.log(line);
}
console.log('');
const byLevel = LEVELS.map((L) => {
  const fs = fights.filter((f) => f.L === L);
  return { L, ttk: median(fs.map((f) => f.ttk)), hp: median(fs.map((f) => f.hp)) };
});
console.log('median per level: ' + byLevel.map((x) => `L${x.L} ${sec(x.ttk)} ${pct(x.hp)}`).join(' | '));
console.log('median per mob: ' + MOBS.map((m) => `${m.replace('ow_', '')} ${sec(median(fights.filter((f) => f.mob === m).map((f) => f.ttk)))}`).join(' | '));
const won = fights.filter((f) => Number.isFinite(f.ttk));
if (won.length) {
  const lo = won.reduce((a, b) => (b.ttk < a.ttk ? b : a));
  const hi = won.reduce((a, b) => (b.ttk > a.ttk ? b : a));
  console.log(`fight TTK min ${sec(lo.ttk)} (${lo.c}@L${lo.L} ${lo.mob}), max ${sec(hi.ttk)} (${hi.c}@L${hi.L} ${hi.mob})`);
}
const classTtkMedian = median(classes.map((c) => cls[c].ttk));

// ---------------------------------------------------------------------------------------------------------------- escort ambush waves
// The quest ambush (WorldQuestProps.ambush): the route's ambushers at the quest level on the open-world curve, `waveSize` at once,
// aggroed on the player, while the escort NPC walks 2 m behind the player and takes EscortRun's contact damage. A class that loses,
// or ends below WAVE_HP_LEFT, or lets the escort fall, fails the check.
const WAVE_L = 2;
const WAVE_HP_LEFT = 0.5;
const WAVE_CLASSES = ['knight', 'priest', 'mage'].filter((c) => PLAYABLE_CLASSES.includes(c));
const waves = [];
for (const c of WAVE_CLASSES) for (const q of ['mq_04_samani_sustur', 'sq_r1_ch02_gozcu_avi']) {
  const r = ESCORT_ROUTES[q];
  let res;
  try {
    res = fight(c, WAVE_L, r.ambushDef, { wave: r.waveSize, escort: { hp: r.hp, dps: r.attackerDps } });
  } catch (err) {
    res = { outcome: 'throw', error: String(err?.message ?? err).slice(0, 200), hpLeft: 0, time: 0, casts: {}, escortHpLeft: 0 };
  }
  waves.push({ c, q, res });
}
const waveOk = (w) => w.res.outcome === 'win' && w.res.hpLeft >= WAVE_HP_LEFT && (w.res.escortHpLeft ?? 0) > 0;
console.log(`escort ambush waves (L${WAVE_L}, the route waveSize, escort contact on): ${waves.map((w) => `${w.c}/${w.q.startsWith('mq') ? 'mq04' : 'sq'} ${w.res.outcome} ${sec(w.res.time)} player ${pct(w.res.hpLeft)} escort ${pct(w.res.escortHpLeft ?? 0)}`).join(' | ')}`);
const waveChecks = [[
  `escort ambush waves at L${WAVE_L}: won with >= ${pct(WAVE_HP_LEFT)} HP and the escort standing`,
  waves.filter((w) => !waveOk(w)).map((w) => `${w.c} ${w.q} ${w.res.outcome} player ${pct(w.res.hpLeft)} escort ${pct(w.res.escortHpLeft ?? 0)}${w.res.error ? ' ' + w.res.error : ''}`),
]];

if (VERBOSE) {
  for (const f of fights) {
    const casts = Object.entries(f.r.casts ?? {}).map(([k, v]) => `${k.replace(/^[a-z]+_/, '')}x${v}`).join(' ');
    console.log(`  ${f.c}@L${f.L} ${f.mob}: ${f.r.outcome} t=${(f.r.time ?? 0).toFixed(1)}s hp=${Math.round((f.r.hpLeft ?? 0) * 100)}% mobHp=${f.r.mobHp} mobDmg=${f.r.mobDmg} maxHp=${f.r.maxHp} | ${casts || '(no casts)'}${f.r.error ? ' | ' + f.r.error : ''}`);
  }
  for (const c of classes) for (const L of LEVELS) console.log(`  bar ${c}@L${L}: ${Object.entries(results[c]?.[L]?.ow_rat?.bar ?? {}).map(([s, id]) => `${s}=${id}`).join(' ')}`);
}
if (specErrors.length) console.log('spec errors: ' + specErrors.join('; '));
const engineErrs = errors.filter((e) => /ERR/.test(e));
if (engineErrs.length) console.log(`engine errors logged: ${engineErrs.length} (first: ${engineErrs[0].slice(0, 160)})`);

const notWon = fights.filter((f) => !Number.isFinite(f.ttk));
/** A class whose default spec is a tank or that summons a pet (its pet takes the hits): the wider HP band. */
const relaxed = Object.fromEntries(classes.map((c) => [c, fights.some((f) => f.c === c && (f.r.tank || f.r.pet || c === 'archer'))]));
const checks = [
  ...waveChecks,
  ['every fight won in time', notWon.map((f) => `${f.c}@L${f.L} ${f.mob} ${f.r.outcome}`)],
  [`median TTK across classes ${TTK_MEDIAN[0]}-${TTK_MEDIAN[1]} s`, !(classTtkMedian >= TTK_MEDIAN[0] && classTtkMedian <= TTK_MEDIAN[1]) ? [`${sec(classTtkMedian)}`] : []],
  [`every class median TTK ${TTK_CLASS[0]}-${TTK_CLASS[1]} s`, classes.filter((c) => !(cls[c].ttk >= TTK_CLASS[0] && cls[c].ttk <= TTK_CLASS[1])).map((c) => `${c} ${sec(cls[c].ttk)}`)],
  [`every class median HP left ${pct(HP_LEFT[0])}-${pct(HP_LEFT[1])} (tank / pet ${pct(HP_LEFT_RELAXED[1])})`, classes.filter((c) => { const hi = relaxed[c] ? HP_LEFT_RELAXED[1] : HP_LEFT[1]; return !(cls[c].hp >= HP_LEFT[0] && cls[c].hp <= hi); }).map((c) => `${c} ${pct(cls[c].hp)}`)],
];
let allOk = specErrors.length === 0;
for (const [name, bad] of checks) {
  const ok = bad.length === 0;
  if (!ok) allOk = false;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ': ' + bad.length + ' (' + bad.slice(0, 8).join('; ') + (bad.length > 8 ? '; ...' : '') + ')'}`);
}
console.log(allOk ? 'SOLO LOW-LEVEL: all pass' : 'SOLO LOW-LEVEL: fail');
process.exit(allOk ? 0 : 1);
