#!/usr/bin/env node
/**
 * SOLO LOW-LEVEL CHECK (playtest: a level-2 warlock died to ONE level-2 Sisli rat). Every playable class on its default spec, at
 * L1 / L2 / L3 / L5, with the spec's bar cut to the skills unlocked at that level (spec.defaultBar, unlock table), the character's
 * starting gear only (CharacterState.create), and the spec's `st` APL (lines whose skill is not on the bar never fire) plus the LMB
 * filler. Fight: one same-level Sisli trash mob (ow_rat, ow_slime, ow_wolf) as a real Enemy with its real EnemyAI, at the level's
 * monster HP / damage (monsterHP / monsterDmg x the def's multipliers, as EnemyFactory sets them). The player stands still.
 * Pre-pull: a pet summon on the bar (tag 'pet') is cast and given 3 s to arrive.
 * PASS per class and level = every mob is killed within 20 s with >= 50 % HP left. The spec tuning table (CM1) applies (see harness).
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/solo_lowlevel.mjs [--class=warlock,knight] [--level=2] [--verbose]
 *   --verbose prints the bar and the casts per fight. Exit 0 = all pass.
 */
import * as H from './harness.mjs';
import { readdirSync } from 'node:fs';

const { G, world, errors } = H;
const DT = H.DT;
// Repeatable runs: timers read the sim clock (ms), as in balance.mjs.
performance.now = () => G.engine.time * 1000;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return [m[1], m[2] ?? true];
}));
const LEVELS = args.level ? [Number(args.level)] : [1, 2, 3, 5];
const CLASS_FILTER = args.class ? String(args.class).split(',') : null;
const VERBOSE = !!args.verbose;
const MOBS = ['ow_rat', 'ow_slime', 'ow_wolf'];
const TIME_LIMIT = 20;
const MIN_HP = 0.5;
const SPAWN_DIST = 8;

const { ENEMIES } = await H.imp('data/enemies.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { getDirector } = await H.imp('ai/EnemyDirector.ts');
const { monsterHP, monsterDmg } = await H.imp('data/mythicAffixes.ts');
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
const unlockOf = (spec, id) => spec.unlock?.[id] ?? SKILLS[id]?.unlockLevel ?? 1;
/** The spec's starting bar at a level: the default bar with every skill above the level removed (LMB always stays). */
function barFor(spec, L) {
  const bar = {};
  for (const [slot, id] of Object.entries(spec.defaultBar)) {
    if (!id) continue;
    if (slot === 'lmb' || unlockOf(spec, id) <= L) bar[slot] = id;
  }
  return bar;
}
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
  if (p && !p.removed) { p.forcedMove = null; p.position.x = 0; p.position.z = 0; }
}

let fightNo = 0;
/** One fight: a fresh world, the real character on its spec bar at L, a real mob at SPAWN_DIST, aggroed on the player. */
function fight(classId, L, mobId) {
  const spec = specOf(classId);
  const key = `${classId}@${L}:${mobId}`;
  const seed = hashStr(key);
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
  ch.save.spec = spec.id;
  ch.save.skillBar = barFor(spec, L);
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

  const def = ENEMIES[mobId];
  const mob = new Enemy(9000 + ++fightNo, def);
  mob.level = L;
  mob.position.set(0, 0, SPAWN_DIST);
  mob.homeX = 0;
  mob.homeZ = SPAWN_DIST;
  mob.maxHp = Math.max(1, Math.round(monsterHP(L) * def.hpMult));
  mob.hp = mob.maxHp;
  mob.baseDamage = monsterDmg(L) * def.dmgMult;
  mob.stats = { armor: def.armorMult ? 10 * L * def.armorMult : 0 };
  mob.authority = true;
  world.add(mob);
  mob.ai = new EnemyAI(mob, getDirector(world));
  mob.ai.acquire(p, true);
  p.targetId = mob.id;

  const lines = aplFor(spec, ROT[spec.id]?.st ?? []);
  const maxFrames = Math.round(TIME_LIMIT / DT);
  let outcome = 'timeout';
  let time = TIME_LIMIT;
  for (let f = 0; f < maxFrames; f++) {
    H.setAimTarget(mob);
    pressApl(p, lines, makeEnv(p, mob, [mob]), H.aimFor(p, mob));
    frame();
    if (mob.isDead) { outcome = 'win'; time = (f + 1) * DT; break; }
    if (p.isDead) { outcome = 'dead'; time = (f + 1) * DT; break; }
  }
  H.setAimTarget(null);
  return {
    spec: spec.id, bar: { ...ch.save.skillBar }, outcome, time, hpLeft: p.maxHp > 0 ? Math.max(0, p.hp) / p.maxHp : 0,
    mobHpLeft: mob.maxHp > 0 ? Math.max(0, mob.hp) / mob.maxHp : 0, casts: { ...castLog },
    lines: lines.length, maxHp: p.maxHp, mobDmg: Math.round(mob.baseDamage), mobHp: mob.maxHp,
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
const passOf = (r) => r.outcome === 'win' && r.hpLeft >= MIN_HP && r.time <= TIME_LIMIT;
const cellOf = (byMob) => {
  const rs = MOBS.map((m) => ({ m, r: byMob[m] }));
  const bad = rs.find(({ r }) => !passOf(r));
  if (!bad) {
    const worst = rs.reduce((a, b) => (b.r.hpLeft < a.r.hpLeft ? b : a));
    return { pass: true, text: `ok ${Math.round(worst.r.hpLeft * 100)}%` };
  }
  const { m, r } = bad;
  const tag = m.replace('ow_', '');
  const what = r.outcome === 'win' ? `${Math.round(r.hpLeft * 100)}%` : r.outcome === 'throw' ? 'THROW' : r.outcome;
  return { pass: false, text: `FAIL ${tag} ${what}` };
};
const pad = (s, n) => String(s).padEnd(n);
console.log(`solo low-level: ${classes.length} classes x L${LEVELS.join('/')} vs ${MOBS.join(', ')} (pass = all mobs killed, >= ${MIN_HP * 100}% HP, <= ${TIME_LIMIT} s)`);
console.log(pad('class', 12) + pad('spec', 22) + LEVELS.map((L) => pad('L' + L, 26)).join(''));
const failing = [];
for (const c of classes) {
  if (!results[c]) continue;
  let line = pad(c, 12) + pad(specOf(c).id, 22);
  for (const L of LEVELS) {
    const cell = cellOf(results[c][L]);
    if (!cell.pass) failing.push(`${c}@L${L}`);
    line += pad(cell.text, 26);
  }
  console.log(line);
}
if (VERBOSE) {
  for (const c of classes) for (const L of LEVELS) for (const mob of MOBS) {
    const r = results[c]?.[L]?.[mob];
    if (!r) continue;
    const casts = Object.entries(r.casts ?? {}).map(([k, v]) => `${k.replace(/^[a-z]+_/, '')}x${v}`).join(' ');
    console.log(`  ${c}@L${L} ${mob}: ${r.outcome} t=${(r.time ?? 0).toFixed(1)}s hp=${Math.round((r.hpLeft ?? 0) * 100)}% mobHp=${r.mobHp} mobDmg=${r.mobDmg} maxHp=${r.maxHp} | ${casts || '(no casts)'}${r.error ? ' | ' + r.error : ''}`);
  }
  for (const c of classes) for (const L of LEVELS) console.log(`  bar ${c}@L${L}: ${Object.entries(results[c]?.[L]?.ow_rat?.bar ?? {}).map(([s, id]) => `${s}=${id}`).join(' ')}`);
}
if (specErrors.length) console.log('spec errors: ' + specErrors.join('; '));
const engineErrs = errors.filter((e) => /ERR/.test(e));
if (engineErrs.length) console.log(`engine errors logged: ${engineErrs.length} (first: ${engineErrs[0].slice(0, 160)})`);
const pass = failing.length === 0 && specErrors.length === 0;
console.log(pass ? 'SOLO LOW-LEVEL: all pass' : `SOLO LOW-LEVEL: ${failing.length} class-level(s) fail: ${failing.join(' ')}`);
process.exit(pass ? 0 : 1);
