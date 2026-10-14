// BALANCE PASS (docs/BALANCE.md): headless, deterministic per-spec sim of the 41 playable specs (classes.ts `specs`) at levels 10 / 30 / 60.
// Run:   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/balance.mjs [--level=30] [--spec=knight_protector] [--quick] [--no-check] [--json] [--gear]
//        --quick shortens every fight (smoke run); --no-check prints the table without the band gate; --gear prints the generated gear only.
//        Exit code 1 when a band check fails (or a fight throws).
//
// Pipeline (real data, no fake stats): CharacterState.create -> level -> spec (recomputeStats folds the spec passive) -> gear: per slot,
// CANDIDATES pieces from ItemGen.generateItem (rarity by level, smart rolls) are equipped through CharacterState.equip, scored by role
// (weapon damage x main stat for damage; plus HP and armour for tanks) and the best is kept (best-in-slot, one policy for every class) ->
// Player.refreshStats-style fold (maxHp / resource) -> the spec's rotation APL (data/rotations_kit_*.ts: `st` list for one target, `aoe`
// list for several; `lmb` lines are the weapon-chain filler) pressed on its default bar through the real SkillSystem / Combat /
// StatusEffects / Procs / Minions (minion AI runs each frame).
// Not modelled: talent trees; movement (APL moving / behind are fixed); enemy armour and AI (dummies stand still and never die); the APL's
// `@each` (applied to the primary target); free-text APL lines (listed in the output for data review).
//
// Scenarios (per spec and level; every fight is seeded and runs on fresh combat systems):
//   st    one dummy, 180 s, `st` APL                 -> DPS ST
//   aoe   four dummies in a pack, 60 s, `aoe` APL    -> DPS AoE (total damage / 60 s)
//   tank  tank only, incoming profile, 180 s         -> DTPS after mitigation, self-heal, mitigation %, time-to-die index
//   heal  healer only, 5-man party, 180 s            -> effective HPS, overheal %, reference-tank survival
// The incoming profile is a fixed fraction of the level's reference (median tank max HP and armour at that level), so every tank and healer
// at a level sees the same damage. PROFILE is a sim parameter, not balance data.
import * as H from './harness.mjs';

const { G } = H;
const DT = H.DT;
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return [m[1], m[2] ?? true];
}));
const QUICK = !!args.quick;
const LEVELS = args.level ? [Number(args.level)] : [10, 30, 60];
const SPEC_FILTER = args.spec ? String(args.spec).split(',') : null;

const { SPECS } = await H.imp('data/specs.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { generateItem, categoriesForClass, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { ProcEngine } = await H.imp('combat/Procs.ts');
const { Combat } = await H.imp('combat/Combat.ts');
const { SkillSystem } = await H.imp('combat/SkillSystem.ts');
const { HitShapes } = await H.imp('combat/HitShapes.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { ROTATIONS_KIT_ARCHER } = await H.imp('data/rotations_kit_archer.ts');
const { ROTATIONS_KIT_BARBARIAN } = await H.imp('data/rotations_kit_barbarian.ts');
const { ROTATIONS_KIT_DEMONHUNTER } = await H.imp('data/rotations_kit_demonhunter.ts');
const { ROTATIONS_KIT_DRUID } = await H.imp('data/rotations_kit_druid.ts');
const { ROTATIONS_KIT_EVOKER } = await H.imp('data/rotations_kit_evoker.ts');
const { ROTATIONS_KIT_KNIGHT } = await H.imp('data/rotations_kit_knight.ts');
const { ROTATIONS_KIT_MAGE } = await H.imp('data/rotations_kit_mage.ts');
const { ROTATIONS_KIT_MONK } = await H.imp('data/rotations_kit_monk.ts');
const { ROTATIONS_KIT_NECROMANCER } = await H.imp('data/rotations_kit_necromancer.ts');
const { ROTATIONS_KIT_PALADIN } = await H.imp('data/rotations_kit_paladin.ts');
const { ROTATIONS_KIT_PRIEST } = await H.imp('data/rotations_kit_priest.ts');
const { ROTATIONS_KIT_ROGUE } = await H.imp('data/rotations_kit_rogue.ts');
const { ROTATIONS_KIT_SHAMAN } = await H.imp('data/rotations_kit_shaman.ts');
const { ROTATIONS_KIT_WARLOCK } = await H.imp('data/rotations_kit_warlock.ts');
const { SKILLS } = await H.imp('data/skills.ts');
const { stasisStored } = await H.imp('combat/skills/evokerKit.ts');

const ROT = { ...ROTATIONS_KIT_ARCHER, ...ROTATIONS_KIT_BARBARIAN, ...ROTATIONS_KIT_DEMONHUNTER, ...ROTATIONS_KIT_DRUID, ...ROTATIONS_KIT_EVOKER, ...ROTATIONS_KIT_KNIGHT, ...ROTATIONS_KIT_MAGE, ...ROTATIONS_KIT_MONK, ...ROTATIONS_KIT_NECROMANCER, ...ROTATIONS_KIT_PALADIN, ...ROTATIONS_KIT_PRIEST, ...ROTATIONS_KIT_ROGUE, ...ROTATIONS_KIT_SHAMAN, ...ROTATIONS_KIT_WARLOCK };

/** Bands (the brief's targets). */
const BAND = { dpsSpread: 0.08, tankLo: 0.70, tankHi: 0.80, aoeLeaderMax: 1.35, ttdSpread: 0.05 };
/** Fight profile (sim parameters; fractions of the level's reference HP). */
const PROFILE = {
  swingEvery: 1.5, swing: 0.055, // boss melee (physical, parryable)
  magicEvery: 4.0, magic: 0.07, // boss periodic magic (fire, not blockable)
  addEvery: 2.5, add: 0.02, adds: 3, // three adds, each a melee swing
  partyEvery: 2.0, partyFrac: 0.5, // healer fight: DPS allies take half a swing every 2 s
};
const SLOTS = ['weapon', 'offhand', 'helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];
const RARITY_AT = (L) => (L >= 60 ? 'epic' : L >= 30 ? 'rare' : 'uncommon');
const DURATION = { st: 180, aoe: 60, tank: 180, heal: 180 };
if (QUICK) for (const k of Object.keys(DURATION)) DURATION[k] = Math.max(10, Math.round(DURATION[k] / 6));

// ---------------------------------------------------------------------------------------------------------------- determinism
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
let mathRng = new RNG(1);
Math.random = () => mathRng.next();
/** Damage the local player takes in the current fight: [time, amount] (feeds the APL token damage_taken_5s). */
let takenLog = [];
G.events.on('damage', (ev) => {
  if (ev.amount > 0 && G.player && ev.targetId === G.player.id) takenLog.push([G.engine.time, ev.amount]);
});

// ---------------------------------------------------------------------------------------------------------------- characters
/** Gear score by role: weapon damage x (1 + main stat / 100) is the damage proxy; tanks also value max HP and armour. */
function gearScore(ch, spec) {
  const st = ch.stats;
  const main = spec.mainStat ?? CLASSES[spec.classId].mainStat;
  const power = (((st.weaponMin ?? 0) + (st.weaponMax ?? 0)) / 2) * (1 + (st[main] ?? 0) / 100);
  if (spec.role === 'tank') return power * 0.2 + (st.maxHp ?? 0) * 0.5 + (st.armor ?? 0) * 0.3;
  if (spec.role === 'healer') return power * 0.5 + (st.maxHp ?? 0) * 0.3;
  return power;
}

const CANDIDATES = 6;
/**
 * Best-in-slot per slot from CANDIDATES generated pieces: each candidate is equipped through CharacterState.equip, scored by gearScore and
 * reverted; the best is equipped last. One policy for every class (no random category), so class power comes from the data, not the roll.
 */
function equipBest(ch, spec, L, key) {
  const cls = spec.classId;
  const rng = new RNG(hashStr(`gear:${key}`));
  const cats = categoriesForClass(cls);
  for (const slot of SLOTS) {
    const options = cats.filter((c) => slotsForCategory(c).includes(slot));
    if (!options.length) continue;
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < CANDIDATES; k++) {
      const category = options[k % options.length];
      const item = generateItem({ itemLevel: L, rarity: RARITY_AT(L), classId: cls, category, smart: true }, rng);
      ch.addItem(item);
      if (!ch.equip(item.uid)) { ch.removeItem(item.uid); continue; }
      const score = gearScore(ch, spec);
      const placed = Object.entries(ch.save.equipment).find(([, it]) => it && it.uid === item.uid)?.[0];
      if (score > bestScore) { bestScore = score; best = item; }
      if (placed) ch.unequip(placed);
      ch.removeItem(item.uid);
    }
    if (best) {
      ch.addItem(best);
      ch.equip(best.uid);
    }
  }
}

/** A real character: spec passive folded by recomputeStats, best-in-slot gear through the CharacterState API. */
function buildCharacter(spec, L, key) {
  const ch = CharacterState.create('Balance', spec.classId);
  ch.save.level = L;
  ch.save.spec = spec.id;
  ch.save.skillBar = { ...spec.defaultBar };
  ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  ch.recomputeStats(false);
  equipBest(ch, spec, L, key);
  return ch;
}

/** Player.refreshStats for a local actor: maxHp / resource from the final stats. */
function syncPlayer(p, ch, spec) {
  const st = ch.stats;
  p.spec = spec.id;
  p.stats = { ...st };
  p.level = ch.level;
  p.resourceType = CLASSES[p.classId].resource;
  const baseHp = (st.maxHp ?? 0) > 0 ? st.maxHp : 100 + p.level * 20;
  const baseRes = (st.maxResource ?? 0) > 0 ? st.maxResource : 100;
  p.maxHp = Math.max(1, Math.round(baseHp));
  p.hp = p.maxHp;
  p.maxResource = Math.max(1, Math.round(baseRes));
  p.resource = p.resourceType === 'rage' ? 0 : p.maxResource;
}

/** Reference values at a level: the median tank (max HP and armour) sets the incoming profile and the reference tank of the healer fight. */
const refCache = new Map();
function refOf(L) {
  if (refCache.has(L)) return refCache.get(L);
  const tanks = Object.values(SPECS).filter((s) => s.role === 'tank' && s.classId in CLASSES);
  const mid = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const stats = tanks.map((s) => buildCharacter(s, L, `${s.id}@${L}`).stats);
  const v = { hp: mid(stats.map((s) => s.maxHp ?? 0)) || 100 + L * 20, armor: mid(stats.map((s) => s.armor ?? 0)) };
  refCache.set(L, v);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------- fight setup
/** Fresh combat systems, seeded streams, the real character as local player on its spec bar; the world is emptied of old fight actors. */
function setupFight(spec, L, key, scenario) {
  const seed = hashStr(`${key}:${scenario}`);
  mathRng = new RNG(seed);
  for (const e of [...G.world.entities.values()]) G.world.remove(e);
  G.world.update(0);
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
  const ch = buildCharacter(spec, L, key);
  G.character = ch;
  const p = new H.FakePlayer(spec.classId, L);
  G.world.add(p);
  G.world.localPlayer = G.player = p;
  syncPlayer(p, ch, spec);
  G.procs.setEntries(ch.fx.procs);
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.resource = p.maxResource;
  takenLog = [];
  return { ch, p };
}

/** Dummy range by the spec's basic: melee arc (2.2 m) or spell / projectile (6 m). */
function rangeOf(spec) {
  const basic = SKILLS[spec.basic ?? spec.defaultBar.lmb];
  const melee = !basic || (basic.targeting ?? '').includes('melee') || (basic.tags ?? []).includes('melee');
  return melee ? 2.2 : 6;
}

function dummy(x, z, L, armor = 0) {
  const hp = 1e12;
  const e = H.addEnemy(x, z, { hp });
  e.level = L;
  e.maxHp = hp;
  e.hp = hp;
  e.stats = { ...(e.stats ?? {}), armor };
  return e;
}

// ---------------------------------------------------------------------------------------------------------------- APL
/** A parenthesised group is a condition when it has a comparison / logic operator or opens with a condition token. */
const CONDITION_GROUP = /[<>=&|!]|^\s*!?\s*(status|target\.|stacks|remaining|pips|cd|charges|res|hp|targets|allies|ally|stealthed|moving|behind|dot_refresh|lmb_step|tgt|damage_taken)/;
/** Strips the APL's free-text annotations: "(with X)", "(pull opener)", "(Raze behaviour: cone 3 targets)" (any group that is not a condition). */
function stripAnnotations(s) {
  // only a group that opens a clause (start of the line or after a space) is an annotation; cd_ready(x) / cd(x) are calls
  return s.replace(/(^|\s)\(([^()]*)\)/g, (whole, sp, inner) => (CONDITION_GROUP.test(inner) ? whole : sp));
}

const ALLOWED = new Set(['true', 'false']);
/** Compiles an APL line into a predicate over the fight env. Unknown identifiers throw (no silent misreads). */
function compile(line, spec) {
  const clean = stripAnnotations(line)
    .replace(/\s+@each\b/g, '')
    .replace(/\b(status|stacks|remaining):(\w+)@tgt\b/g, 'target.$1:$2')
    .replace(/\s+/g, ' ')
    .trim();
  const m = clean.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  if (!m) throw new Error(`${spec.id}: bad APL line "${line}"`);
  const self = m[1].replace(/@.*$/, ''); // evoker_fire_breath@rank=1: the rank suffix selects a rank, the bar slot is the skill
  let c = (m[2] ?? 'true');
  // bare cd / charges name the line's own skill (cd == 0, charges >= 1)
  c = c.replace(/\bcd\b(?!\s*\()/g, `E.cd('${self}')`).replace(/\bcharges\b(?!\s*\()/g, `E.charges('${self}')`);
  const rep = [
    [/\bstealthed\b/g, "E.status('stealth')"],
    [/\blmb_step\b/g, 'E.lmbStep'],
    [/allies\.debuffed/g, 'E.alliesDebuffed'],
    [/cd_ready\((\w+)\)/g, "E.cdReady('$1')"],
    [/charges\((\w+)\)/g, "E.charges('$1')"],
    [/\bcd\((\w+)\)/g, "E.cd('$1')"],
    [/lowest\.status:(\w+)/g, "E.lowestStatus('$1')"], // healer fight: the most injured ally carries the status
    [/lowest\.hp%/g, 'E.allyLowPct'],
    [/target\.status:(\w+)/g, "E.tStatus('$1')"],
    [/target\.stacks:(\w+)/g, "E.tStacks('$1')"],
    [/target\.remaining:(\w+)/g, "E.tRemaining('$1')"],
    [/dot_refresh:(\w+)/g, "E.dotRefresh('$1')"],
    [/status:(\w+)/g, "E.status('$1')"],
    [/stacks:(\w+)/g, "E.stacks('$1')"],
    [/remaining:(\w+)/g, "E.remaining('$1')"],
    [/pips:(\w+)/g, "E.pips('$1')"],
    [/damage_taken_5s/g, 'E.damageTaken5s'],
    [/target\.hp%/g, 'E.tHpPct'],
    [/target\.hp/g, 'E.tHpFrac'],
    [/ally\.low%/g, 'E.allyLowPct'],
    [/allies\.injured/g, 'E.alliesInjured'],
    [/allies\.linked/g, 'E.alliesLinked'],
    [/tank\.hp%/g, 'E.tankHpPct'],
    [/\bhp%/g, 'E.hpPct'],
    [/\bres%/g, 'E.resPct'],
    [/\bmoving\b/g, 'E.moving'],
    [/\bbehind\b/g, 'E.behind'],
    [/\b(?:resource|res)\b/g, 'E.res'],
    [/\bhp\b/g, 'E.hpFrac'],
    [/\binjured\b/g, 'E.alliesInjured'], // bare `injured`: allies below 90 % (as allies.injured)
    [/\bstored\b/g, 'E.stored'], // evoker Durgunluk store (heals held by stasis)
    [/\btargets\b/g, 'E.targets'],
    [/\btgt\b/g, 'E.targets'],
  ];
  for (const [re, to] of rep) c = c.replace(re, to);
  // every remaining bare identifier must be whitelisted (E.* accesses and quoted ids are stripped first)
  const stripped = c.replace(/'[^']*'/g, "''").replace(/E\.\w+/g, 'E');
  const bare = [...stripped.matchAll(/[A-Za-z_][A-Za-z_0-9]*/g)].map((x) => x[0]).filter((w) => !ALLOWED.has(w) && w !== 'E');
  if (bare.length) throw new Error(`${spec.id}: unknown APL token(s) ${[...new Set(bare)].join(',')} in "${line}"`);
  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('E', `return (${c});`);
  } catch (e) {
    throw new Error(`${spec.id}: APL condition does not parse "${c}" (from "${line}"): ${e.message}`);
  }
  return { skill: self, line, fn };
}

/** APL lines the sim does not model (free text without `if`): reported in the output for data review, never guessed. */
const APL_NOTES = new Set();
/** The compiled lines of a list: `lmb` lines are the filler (LMB is always pressed when nothing else casts); other lines must name a known skill. */
function aplFor(spec, list) {
  const out = [];
  for (const line of list) {
    const first = line.split(/\s/)[0].replace(/@.*$/, '');
    if (first === 'lmb') continue;
    if (!SKILLS[first]) throw new Error(`${spec.id}: APL names an unknown skill "${first}"`);
    if (/\s/.test(line.trim()) && !/\sif\s/.test(stripAnnotations(line))) { APL_NOTES.add(`${spec.id}: not modelled "${line}"`); continue; }
    out.push(compile(line, spec));
  }
  return out;
}

/** Fight-side env for a condition: the local player p, the primary enemy, the enemy list and the allies. */
function makeEnv(p, e, enemies, allies) {
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
    lowestStatus: (id) => { const a = allies.length ? allies.reduce((m, x) => (x.hp / x.maxHp < m.hp / m.maxHp ? x : m)) : null; return !!a && a.statuses.has(id); },
    tankHpPct: allies.length ? (allies[0].hp / allies[0].maxHp) * 100 : 100, // healer fight: allies[0] is the reference tank
    allyLowPct: allies.length ? Math.min(...allies.map((a) => (a.hp / a.maxHp) * 100)) : 100,
    alliesInjured: allies.filter((a) => a.hp < a.maxHp * 0.9).length,
    alliesLinked: 0,
    alliesDebuffed: 0, // no debuffs on allies in the fight profile
    // next position of the weapon chain (the kit runners' lmb_step: the chain resets 0.85 s after its last hit)
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

/** Slot of a skill on the bar (null when the APL names a skill the bar does not carry). */
function slotOf(p, id) {
  for (const s of ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180']) {
    if (G.skills.getSlotSkill(p, s) === id) return s;
  }
  return null;
}

/** One frame of the rotation: the first castable line wins; with nothing castable the basic chain fills (a player holding LMB). */
function pressApl(p, lines, env, aim) {
  for (const l of lines) {
    const slot = slotOf(p, l.skill);
    if (!slot) continue;
    if (!l.fn(env)) continue;
    if (G.skills.tryCastSlot(p, slot, aim)) return true;
  }
  if (G.skills.getSlotSkill(p, 'lmb') && p.canAct()) return G.skills.tryCastSlot(p, 'lmb', aim);
  return false;
}

// ---------------------------------------------------------------------------------------------------------------- measurement
/** One fight frame: proc PRD clock, world / skills / combat / hit shapes (H.step), then the minions' own AI (Game runs it outside step). */
function frame() {
  G.procs.update(DT);
  H.step(1);
  G.minions?.update(DT);
}

/** Damage p deals to enemies (sourced to p, or to a minion owned by p). */
function damageMeter(p, enemyIds) {
  const m = { dealt: 0, byAbility: {} };
  const off = G.events.on('damage', (ev) => {
    if (!enemyIds.has(ev.targetId) || !(ev.amount > 0)) return;
    if (ev.sourceId !== p.id && !(G.minions?.list?.find((x) => x.id === ev.sourceId)?.ownerId === p.id)) return;
    m.dealt += ev.amount;
    const k = ev.skillId ?? '?';
    m.byAbility[k] = (m.byAbility[k] ?? 0) + ev.amount;
  });
  m.stop = off;
  return m;
}

/** Heals: self heals keep the real path (applyHeal); ally heals are applied here (non-local actors have no network path). */
function installHealSpy(p, allies) {
  const led = { effective: 0, raw: 0, self: 0 };
  const orig = G.combat.healPlayer;
  G.combat.healPlayer = function (src, tgt, amount, opts) {
    if (!tgt || tgt.isDead || !(amount > 0)) return;
    if (tgt === p) {
      const before = p.hp;
      orig.call(this, src, tgt, amount, opts);
      const eff = Math.max(0, p.hp - before);
      led.self += eff; led.effective += eff; led.raw += amount;
      return;
    }
    if (allies.includes(tgt)) {
      const before = tgt.hp;
      tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
      const eff = tgt.hp - before;
      led.effective += eff; led.raw += amount;
      return;
    }
    orig.call(this, src, tgt, amount, opts);
  };
  return { led, restore: () => { G.combat.healPlayer = orig; } };
}

// ---------------------------------------------------------------------------------------------------------------- scenarios
function runDps(spec, L, key, scenario) {
  const { p } = setupFight(spec, L, key, scenario);
  const r = rangeOf(spec);
  // a tight pack in front of the player (inside the melee arc / the spell's area); the single target is the first point
  const pack = r < 3 ? [[0, 1.8], [0.8, 2.1], [-0.8, 2.1], [0, 2.5]] : [[0, r], [1, r + 0.5], [-1, r + 0.5], [0, r + 1.2]];
  const enemies = (scenario === 'aoe' ? pack : [[0, r]]).map(([x, z]) => dummy(x, z, L));
  p.targetId = enemies[0].id;
  const meter = damageMeter(p, new Set(enemies.map((e) => e.id)));
  const lines = aplFor(spec, scenario === 'aoe' ? ROT[spec.id].aoe : ROT[spec.id].st);
  const seconds = DURATION[scenario];
  const aim = H.aimFor(p, enemies[0]);
  for (let f = 0; f < Math.round(seconds / DT); f++) {
    H.setAimTarget(enemies[0]);
    pressApl(p, lines, makeEnv(p, enemies[0], enemies, []), aim);
    frame();
  }
  meter.stop();
  return { dealt: meter.dealt, dps: meter.dealt / seconds, byAbility: meter.byAbility };
}

/** Incoming hits due this frame: the boss (melee swings, periodic magic) and the adds. */
function dueHits(sched, bossId, addIds, ref) {
  const out = [];
  const T = sched.clock;
  if (sched.swing <= T) { sched.swing += PROFILE.swingEvery; out.push({ sourceId: bossId, amount: PROFILE.swing * ref.hp, type: 'physical', melee: true, parryable: true, sourceLevel: sched.L }); }
  if (sched.magic <= T) { sched.magic += PROFILE.magicEvery; out.push({ sourceId: bossId, amount: PROFILE.magic * ref.hp, type: 'fire', blockable: false, sourceLevel: sched.L }); }
  if (sched.add <= T) { sched.add += PROFILE.addEvery; for (let i = 0; i < PROFILE.adds; i++) out.push({ sourceId: addIds[i % addIds.length], amount: PROFILE.add * ref.hp, type: 'physical', melee: true, parryable: true, sourceLevel: sched.L }); }
  return out;
}

function runTank(spec, L, key) {
  const { p } = setupFight(spec, L, key, 'tank');
  const ref = refOf(L);
  const boss = dummy(0, 2.2, L);
  const adds = [dummy(-3, 4, L), dummy(3, 4, L), dummy(0, 5.5, L)];
  p.targetId = boss.id;
  const meter = damageMeter(p, new Set([boss.id, ...adds.map((a) => a.id)]));
  const spy = installHealSpy(p, []);
  const lines = aplFor(spec, ROT[spec.id].st);
  const sched = { L, clock: 0, swing: 0.5, magic: 2, add: 1 };
  const taken = { raw: 0, mit: 0, hits: 0, avoided: 0 };
  const seconds = DURATION.tank;
  let diedAt = null;
  const offDeath = G.events.on('death', (ev) => { if (ev?.targetId === p.id || ev?.id === p.id) diedAt ??= G.engine.time; });
  const aim = H.aimFor(p, boss);
  for (let f = 0; f < Math.round(seconds / DT) && !p.isDead; f++) {
    sched.clock = f * DT;
    H.setAimTarget(boss);
    pressApl(p, lines, makeEnv(p, boss, [boss, ...adds], []), aim);
    for (const hit of dueHits(sched, boss.id, adds.map((a) => a.id), ref)) {
      taken.raw += hit.amount; taken.hits++;
      const r = G.combat.hitLocalPlayer(hit);
      if (!r) continue;
      if (r.amount > 0) taken.mit += r.amount; else taken.avoided++;
    }
    frame();
  }
  offDeath();
  spy.restore();
  meter.stop();
  const net = taken.mit / seconds - spy.led.self / seconds;
  return {
    died: !!p.isDead || diedAt !== null, dtpsRaw: taken.raw / seconds, dtps: taken.mit / seconds, selfHps: spy.led.self / seconds,
    mitigation: taken.raw > 0 ? 1 - taken.mit / taken.raw : 0, avoidedPct: taken.hits ? taken.avoided / taken.hits : 0,
    // time-to-die index: how long the tank's pool lasts against the net (after self-heal) incoming damage
    ttd: net > 0 ? p.maxHp / net : Infinity, dealt: meter.dealt,
  };
}

function runHeal(spec, L, key) {
  const { p } = setupFight(spec, L, key, 'heal');
  const ref = refOf(L);
  // the party: the reference tank (median tank HP and armour) and three DPS allies, all non-local (healed by the spy)
  const party = [];
  for (let i = 0; i < 4; i++) {
    const a = new H.FakePlayer('knight', L);
    a.id = 900 + i; a.isLocal = false; a.maxHp = ref.hp; a.hp = ref.hp; a.position.set(3 + i, 0, -2 - i);
    a.stats = { ...a.stats, armor: i === 0 ? ref.armor : 0 };
    H.world.add(a);
    party.push(a);
  }
  const tank = party[0];
  const boss = dummy(0, 2.2, L);
  p.targetId = boss.id;
  const spy = installHealSpy(p, party);
  const lines = aplFor(spec, ROT[spec.id].st);
  const sched = { L, clock: 0, swing: 0.5, magic: 2, add: 1, party: 0.5 };
  const tankTaken = { raw: 0, mit: 0 };
  let tankDownAt = null;
  const aim = H.aimFor(p, boss);
  for (let f = 0; f < Math.round(DURATION.heal / DT); f++) {
    sched.clock = f * DT;
    H.setAimTarget(boss);
    pressApl(p, lines, makeEnv(p, boss, [boss], party), aim);
    // the reference tank takes the boss profile through its own armour; DPS allies take the party stream
    for (const hit of dueHits(sched, boss.id, [boss.id], ref)) {
      const lost = G.combat.mitigate(tank, hit.amount, hit.type, L);
      tankTaken.raw += hit.amount;
      tankTaken.mit += lost;
      tank.hp -= lost;
    }
    if (sched.party <= sched.clock) {
      sched.party += PROFILE.partyEvery;
      for (const a of party.slice(1)) a.hp -= G.combat.mitigate(a, PROFILE.partyFrac * PROFILE.swing * ref.hp, 'physical', L);
    }
    if (tank.hp <= 0 && tankDownAt === null) tankDownAt = f * DT;
    frame();
  }
  spy.restore();
  return {
    hps: spy.led.effective / DURATION.heal, overhealPct: spy.led.raw > 0 ? 1 - spy.led.effective / spy.led.raw : 0,
    tankDtpsRaw: tankTaken.raw / DURATION.heal, tankDtps: tankTaken.mit / DURATION.heal, tankSurvived: tankDownAt === null,
    tankMinPct: Math.max(0, tank.hp) / ref.hp, refHp: ref.hp,
  };
}

// ---------------------------------------------------------------------------------------------------------------- driver
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const pct = (x) => (x * 100).toFixed(1) + '%';
const fmt = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US').replace(/,/g, ' ') : '-');

// playable = listed in its class (classes.ts `specs`; a class with no list, the mage, takes all its registered specs); legacy stubs such as rogue_alchemist are registered but not pickable
const specs = Object.values(SPECS).filter((s) => (s.classId in CLASSES) && (CLASSES[s.classId].specs ? CLASSES[s.classId].specs.includes(s.id) : true) && (!SPEC_FILTER || SPEC_FILTER.includes(s.id)));
const rangeFor = (id) => rangeOf(SPECS[id]);

if (args.gear) { // gear report: what the best-in-slot policy equipped per spec and level (no fights)
  for (const L of LEVELS) for (const spec of specs) {
    const ch = buildCharacter(spec, L, `${spec.id}@${L}`);
    const main = spec.mainStat ?? CLASSES[spec.classId].mainStat;
    const eq = Object.entries(ch.save.equipment).map(([s, i]) => `${s}:${i.baseId}/${i.rarity[0]}${i.itemLevel}`);
    process.stdout.write(`L${L} ${spec.id} maxHp=${Math.round(ch.stats.maxHp ?? 0)} armor=${Math.round(ch.stats.armor ?? 0)} wMin=${Math.round(ch.stats.weaponMin ?? 0)} wMax=${Math.round(ch.stats.weaponMax ?? 0)} ${main}=${Math.round(ch.stats[main] ?? 0)} | ${eq.length} slots: ${eq.join(' ')}\n`);
  }
  process.exit(0);
}

const rows = [];
const errorsSeen = [];
for (const L of LEVELS) {
  for (const spec of specs) {
    const key = `${spec.id}@${L}`;
    const row = { id: spec.id, role: spec.role, level: L, cls: spec.classId, range: rangeFor(spec.id) };
    try {
      if (spec.role === 'healer') {
        const h = runHeal(spec, L, key);
        Object.assign(row, { hps: h.hps, overheal: h.overhealPct, dtps: h.tankDtps, dtpsRaw: h.tankDtpsRaw, tankSurvived: h.tankSurvived, tankMinPct: h.tankMinPct });
      } else {
        const st = runDps(spec, L, key, 'st');
        const aoe = runDps(spec, L, key, 'aoe');
        Object.assign(row, { dpsSt: st.dps, dpsAoe: aoe.dps, byAbility: st.byAbility });
        if (spec.role === 'tank') {
          const t = runTank(spec, L, key);
          Object.assign(row, { dtps: t.dtps, dtpsRaw: t.dtpsRaw, selfHps: t.selfHps, mitigation: t.mitigation, ttd: t.ttd, died: t.died });
        }
      }
    } catch (e) {
      row.error = String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
      errorsSeen.push(`${key}: ${row.error}`);
    }
    rows.push(row);
    if (!args.quiet) process.stderr.write(`${key} st=${Math.round(row.dpsSt ?? 0)} aoe=${Math.round(row.dpsAoe ?? 0)} hps=${Math.round(row.hps ?? 0)}\n`);
  }
}

// ---------------------------------------------------------------------------------------------------------------- report + bands
const failures = [];
for (const L of LEVELS) {
  const at = rows.filter((r) => r.level === L && !r.error);
  const dps = at.filter((r) => r.role === 'dps');
  const tanks = at.filter((r) => r.role === 'tank');
  const medSt = median(dps.map((r) => r.dpsSt));
  const medAoe = median(dps.map((r) => r.dpsAoe));
  for (const r of dps.concat(tanks)) { r.vsMed = r.dpsSt / medSt; r.aoeVsMed = r.dpsAoe / medAoe; }
  for (const r of dps) if (Math.abs(r.vsMed - 1) > BAND.dpsSpread) failures.push(`L${L} ${r.id} ST ${pct(r.vsMed)} of median (band ±8%)`);
  for (const r of tanks) if (r.vsMed < BAND.tankLo || r.vsMed > BAND.tankHi) failures.push(`L${L} ${r.id} tank ST ${pct(r.vsMed)} of median (band 70-80%)`);
  const melee = dps.filter((r) => r.range < 3), ranged = dps.filter((r) => r.range >= 3);
  if (melee.length && ranged.length) {
    const mm = median(melee.map((r) => r.dpsSt)), mr = median(ranged.map((r) => r.dpsSt));
    if (Math.abs(mm / mr - 1) > BAND.dpsSpread) failures.push(`L${L} melee vs ranged median ${pct(mm / mr - 1)} (band ±8%)`);
  }
  for (const r of dps.concat(tanks)) if (r.aoeVsMed > BAND.aoeLeaderMax) failures.push(`L${L} ${r.id} AoE ${r.aoeVsMed.toFixed(2)}x median (max 1.35x)`);
  for (const r of tanks) if (r.died) failures.push(`L${L} ${r.id} died in the tank profile`);
  for (const r of at.filter((x) => x.role === 'healer')) {
    if (!r.tankSurvived) failures.push(`L${L} ${r.id} let the reference tank die`);
    if (r.hps < r.dtps) failures.push(`L${L} ${r.id} HPS ${fmt(r.hps)} < reference tank damage after mitigation ${fmt(r.dtps)}`);
  }
  if (tanks.length) {
    const tt = median(tanks.map((r) => r.ttd));
    for (const r of tanks) if (Math.abs(r.ttd / tt - 1) > BAND.ttdSpread) failures.push(`L${L} ${r.id} TTD index ${(r.ttd / tt).toFixed(2)}x median (band ±5%)`);
  }
}

const out = [];
out.push('| level | spec | role | DPS ST | % med | DPS AoE (4 tgt) | AoE % med | HPS | DTPS (after mit.) | self-HPS | mitigation | TTD (s) |');
out.push('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  const ttd = r.ttd === undefined ? '-' : (Number.isFinite(r.ttd) ? Math.round(r.ttd) : 'inf');
  out.push(`| ${r.level} | ${r.id} | ${r.role} | ${fmt(r.dpsSt)} | ${r.vsMed !== undefined ? pct(r.vsMed) : '-'} | ${fmt(r.dpsAoe)} | ${r.aoeVsMed !== undefined ? pct(r.aoeVsMed) : '-'} | ${r.hps !== undefined ? fmt(r.hps) : '-'} | ${r.dtps !== undefined ? fmt(r.dtps) : '-'} | ${r.selfHps !== undefined ? fmt(r.selfHps) : '-'} | ${r.mitigation !== undefined ? pct(r.mitigation) : '-'} | ${ttd} |`);
}
console.log(out.join('\n'));
if (APL_NOTES.size) console.log('\nAPL lines not modelled by the sim (data review):\n' + [...APL_NOTES].join('\n'));
if (args.json) console.log(JSON.stringify(rows));
if (errorsSeen.length) console.log('\nERRORS:\n' + errorsSeen.join('\n'));
if (args['no-check']) process.exit(errorsSeen.length ? 1 : 0);
if (failures.length || errorsSeen.length) {
  console.log('\nBAND FAILURES (' + (failures.length + errorsSeen.length) + '):\n' + [...failures, ...errorsSeen].join('\n'));
  process.exit(1);
}
console.log('\nbands: PASS');
process.exit(0);
