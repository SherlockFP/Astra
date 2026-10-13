// NC52 Nekromant behaviours (GDD_CLASSES_V2 §14 row 52; docs/kits/plate-melee.md §8-§9; map: docs/kits/necromancer_behaviors.md). No browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/nc52.mjs
// The real necromancer skill rows do not exist yet (PM-NE writes them), so every check uses dev SkillDefs defined here (ids `t_*`).
// Covered: nc52.install, nc52.dstrike.* (Ölüm Darbesi), nc52.marrow.* (İlik Söken), nc52.heart.* (Kalp Darbesi), nc52.scourge.* (Ölüm Kırbacı),
//          nc52.coil.* (Ölüm Sarmalı), nc52.epi.* (Salgın), nc52.order.* (Ölüm Emri), nc52.dt.* (Karanlık Dönüşüm), nc52.army.* (Ölüler Ordusu),
//          nc52.ams.* (Büyü Karşıtı Kalkan + the Combat hook), nc52.raise.* / nc52.cexp.* (corpse consumers), nc52.existing.* (rows that run on
//          behaviours of other files), nc52.remote (visual-only replays), nc52.errors.
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { BEHAVIORS_NECROMANCER, empowerMinion } = await H.imp('combat/skills/behaviors_necromancer.ts');
const { BEHAVIORS_SHARED } = await H.imp('combat/skills/sharedBehaviors.ts');
const { BEHAVIORS_PALADIN } = await H.imp('combat/skills/behaviors_paladin.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { Corpses } = await H.imp('combat/Corpses.ts');
const { minionDef } = await H.imp('data/minions.ts');
const { magicShellLeft } = await H.imp('combat/magicShell.ts');
const { STATUSES } = await H.imp('data/statuses.ts');

G.minions = new Minions();
G.corpses = new Corpses();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const IDS = ['death_strike', 'strike_self_buff', 'multi_cleave', 'scourge_strike', 'death_coil', 'spread_aoe', 'death_order', 'empower_minions', 'summon_ring', 'magic_shell', 'raise_dead', 'corpse_explosion'];

// ---- helpers ----------------------------------------------------------------------------------------------------------------------
function ctxFor(p, def, target = null, over = {}) {
  const aim = { ...H.aimFor(p, target), ...(over.aim ?? {}) };
  return {
    sys: G.skills, caster: p, def, aim, dir: over.dir ?? [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: !!over.remote, action: null, target: over.target ?? null, point: over.point ?? [aim.point[0], aim.point[2]], data: {}, more: over.more ?? 1,
  };
}
const testDef = (over = {}) => ({
  id: 't_row', classId: 'necromancer', name: 't', desc: '', icon: '', unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, anim: 'x',
  targeting: 'target_instant', tags: ['melee'], params: {}, statuses: [], damage: { coef: 1, type: 'physical' }, ...over,
});
// SkillSystem.strike spy
let strikeLog = [];
const origStrike = G.skills.strike;
function spyStart() {
  strikeLog = [];
  G.skills.strike = (c, e, o) => {
    const r = origStrike.call(G.skills, c, e, o);
    if (c.def.id.startsWith('t_')) strikeLog.push({ rowId: c.def.id, e, coef: o?.coef, more: o?.more, ret: r });
    return r;
  };
}
function spyEnd() { G.skills.strike = origStrike; }
const hitsOf = (rowId, e) => strikeLog.filter((s) => s.rowId === rowId && s.ret && (!e || s.e === e));
// Combat.playerHitEnemy spy (minion commands go through it)
let hitLog = [];
const origHit = G.combat.playerHitEnemy;
function hitSpyStart() {
  hitLog = [];
  G.combat.playerHitEnemy = function (a, t, spec) { hitLog.push({ t, coef: spec.coef, skillId: spec.skillId }); return origHit.call(this, a, t, spec); };
}
function hitSpyEnd() { G.combat.playerHitEnemy = origHit; }
// heal spy
let healLog = [];
const origHeal = G.combat.healPlayer;
function healSpyStart() {
  healLog = [];
  G.combat.healPlayer = function (src, tgt, amt, o) { healLog.push({ src, tgt, amt }); return origHeal.call(this, src, tgt, amt, o); };
}
function healSpyEnd() { G.combat.healPlayer = origHeal; }
const projectiles = () => [...H.world.entities.values()].filter((e) => e.kind === 'projectile');
function withRandom(v, fn) {
  const orig = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = orig; }
}
function newNecro() {
  const p = H.addPlayer('necromancer');
  G.minions.clearAll('scene');
  G.corpses.clear('cleared');
  p.yaw = 0;
  p.stats.critChance = 0;
  p.position.set(0, 0, 0);
  H.step(2);
  return p;
}
function tick(sec) {
  for (let i = 0; i < H.sec(sec); i++) { H.step(1); G.minions.update(H.DT); G.corpses.update(H.DT); }
}
const foe = (x, z, o = {}) => { const e = H.addEnemy(x, z, { hp: 1e7, ...o }); e.maxHp = e.hp; e.reviveCount = 0; return e; };
const hurt = (p, amount) => G.combat.hitLocalPlayer({ sourceId: null, amount, type: 'physical', unavoidable: true, blockable: false, ignoreIframes: true });
const hurtMagic = (p, amount, type = 'fire') => G.combat.hitLocalPlayer({ sourceId: null, amount, type, unavoidable: true, blockable: false, ignoreIframes: true });

// ---- nc52.install -----------------------------------------------------------------------------------------------------------------
{
  for (const k of IDS) ok(`nc52.install ${k} in BEHAVIORS`, typeof BEHAVIORS[k]?.fire === 'function' && BEHAVIORS_NECROMANCER[k] === BEHAVIORS[k]);
  ok('nc52.install registers exactly the documented ids', Object.keys(BEHAVIORS_NECROMANCER).sort().join() === [...IDS].sort().join());
  const others = new Set([...Object.keys(BEHAVIORS_SHARED), ...Object.keys(BEHAVIORS_PALADIN), 'provoke', 'execute', 'wake_flames', 'multi_strike', 'grip', 'heal_self_recent', 'minion_summon', 'minion_command', 'interrupt']);
  ok('nc52.install does not shadow shared / paladin / plate ids', !IDS.some((k) => others.has(k)));
  ok('nc52.install all statuses the behaviours touch have StatusDefs', ['bone_armor', 'blood_shield', 'blood_plague', 'vile_contagion', 'virulent_plague', 'sudden_doom', 'dark_transformation', 'army', 'anti_magic_shell', 'vampiric_blood', 'shield'].every((s) => !!STATUSES[s]));
}

// ---- nc52.dstrike: Ölüm Darbesi -----------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const t = foe(0, 2.5);
  const def = testDef({ id: 't_dstrike', range: 3.2, arc: 90, damage: { coef: 1.4, type: 'physical' }, params: { window: 5, healPctOfRecent: 0.2, minHealPct: 0.07, shieldPct: 0.2, vbMult: 1.3 } });
  spyStart(); healSpyStart();
  // 1) nothing taken: the 7 % floor (350 of 5000)
  p.hp = 2000;
  let c = ctxFor(p, def, t);
  ok('nc52.dstrike begin passes with a target in melee range', BEHAVIORS.death_strike.begin(c) === true);
  const t0 = t.hp;
  withRandom(0.5, () => BEHAVIORS.death_strike.fire(c));
  ok('nc52.dstrike strikes the target', t.hp < t0 && hitsOf('t_dstrike').length === 1);
  ok('nc52.dstrike no damage taken: heals the 7 % max HP floor', healLog.length === 1 && near(healLog[0].amt, 350, 0.01) && p.hp > 2000, `heal=${healLog[0]?.amt}`);
  const sh = p.statuses.get('shield');
  ok('nc52.dstrike grants a blood_shield absorb of 20 % of the heal (70)', !!sh && near(sh.magnitude, 70, 0.01) && p.statuses.has('blood_shield'), `shield=${sh?.magnitude}`);
  // 2) 3000 damage taken in the window: 20 % = 600 beats the floor
  p.statuses.remove('shield'); p.statuses.remove('blood_shield');
  p.hp = 5000;
  G.combat.recordTaken(p, 3000);
  healLog.length = 0; p.hp = 2000;
  c = ctxFor(p, def, t);
  BEHAVIORS.death_strike.begin(c);
  withRandom(0.5, () => BEHAVIORS.death_strike.fire(c));
  ok('nc52.dstrike heals 20 % of the damage taken in the last 5 s (3000 -> 600)', healLog.length === 1 && near(healLog[0].amt, 600, 0.01), `heal=${healLog[0]?.amt}`);
  ok('nc52.dstrike blood shield 20 % of 600 = 120', near(p.statuses.get('shield')?.magnitude ?? 0, 120, 0.01));
  // 3) Vampirik Kan: x1.3
  p.statuses.remove('shield'); p.statuses.remove('blood_shield');
  p.statuses.apply('vampiric_blood', 10, { sourceId: p.id });
  healLog.length = 0; p.hp = 2000;
  c = ctxFor(p, def, t);
  BEHAVIORS.death_strike.begin(c);
  withRandom(0.5, () => BEHAVIORS.death_strike.fire(c));
  ok('nc52.dstrike under vampiric_blood the heal is x1.3 (780)', healLog.length === 1 && near(healLog[0].amt, 780, 0.01), `heal=${healLog[0]?.amt}`);
  p.statuses.remove('vampiric_blood');
  // 4) the window: damage older than 5 s no longer counts
  H.stepSec(6);
  healLog.length = 0; p.hp = 2000;
  c = ctxFor(p, def, t);
  BEHAVIORS.death_strike.begin(c);
  withRandom(0.5, () => BEHAVIORS.death_strike.fire(c));
  ok('nc52.dstrike old damage is out of the window: back to the floor', healLog.length === 1 && near(healLog[0].amt, 350, 0.01), `heal=${healLog[0]?.amt}`);
  // 5) c.more scales the heal (echo of Hayalet Orak 0.5)
  healLog.length = 0; p.hp = 2000;
  c = ctxFor(p, def, t, { more: 0.5 });
  BEHAVIORS.death_strike.begin(c);
  withRandom(0.5, () => BEHAVIORS.death_strike.fire(c));
  ok('nc52.dstrike an echo (more 0.5) heals half', healLog.length === 1 && near(healLog[0].amt, 175, 0.01), `heal=${healLog[0]?.amt}`);
  // 6) no target: begin fails unpaid
  H.clearEvents();
  const lone = ctxFor(p, def, null);
  ok('nc52.dstrike no target: begin false with a target/range fail event', BEHAVIORS.death_strike.begin(lone) === false && events['skill:fail'].length === 1);
  spyEnd(); healSpyEnd();
}

// ---- nc52.marrow: İlik Söken (+3 Kemik Zırhı charges) ---------------------------------------------------------------------------------
{
  const p = newNecro();
  const t = foe(0, 2.5);
  const def = testDef({ id: 't_marrow', range: 3.2, damage: { coef: 1.2, type: 'physical' }, selfStatuses: [{ status: 'bone_armor', duration: 30, stacks: 3 }] });
  const cast = () => { const c = ctxFor(p, def, t); BEHAVIORS.strike_self_buff.begin(c); BEHAVIORS.strike_self_buff.fire(c); };
  const t0 = t.hp;
  cast();
  ok('nc52.marrow strikes and adds 3 bone_armor charges', t.hp < t0 && p.statuses.stacks('bone_armor') === 3);
  cast(); cast();
  ok('nc52.marrow 3 -> 6 -> 9 charges', p.statuses.stacks('bone_armor') === 9);
  cast();
  ok('nc52.marrow caps at 10 charges', p.statuses.stacks('bone_armor') === 10);
  ok('nc52.marrow the status lasts 30 s', near(p.statuses.get('bone_armor').remaining, 30, 0.2));
  const q = newNecro();
  H.clearEvents();
  const c = ctxFor(q, def, null);
  ok('nc52.marrow no target: begin false, no charges', BEHAVIORS.strike_self_buff.begin(c) === false && q.statuses.stacks('bone_armor') === 0);
}

// ---- nc52.heart: Kalp Darbesi (2 hits on the target and on one more enemy of the cone) ---------------------------------------------------
{
  const p = newNecro();
  const a = foe(0, 2.5), b = foe(0.9, 2.6), far = foe(-1.1, 2.7);
  const def = testDef({
    id: 't_heart', range: 3.2, arc: 90, damage: { coef: 0.5, type: 'physical' }, statuses: [{ status: 'slow', duration: 8, magnitude: 0.2 }],
    params: { hits: 2, cleave: 1, gap: 0.12, gain: 5 },
  });
  spyStart();
  p.resource = 50;
  const c = ctxFor(p, def, a);
  BEHAVIORS.multi_cleave.begin(c);
  BEHAVIORS.multi_cleave.fire(c);
  H.stepSec(0.4);
  ok('nc52.heart 2 hits on the target', hitsOf('t_heart', a).length === 2);
  ok('nc52.heart 2 hits on the nearest other enemy of the cone', hitsOf('t_heart', b).length === 2);
  ok('nc52.heart cleave 1: the third enemy is untouched', hitsOf('t_heart', far).length === 0 && far.hp === far.maxHp);
  ok('nc52.heart the slow lands on both targets', a.statuses.has('slow') && b.statuses.has('slow') && !far.statuses.has('slow'));
  ok('nc52.heart Öz gain once per cast (+5)', p.resource > 50 && p.resource <= 55.01, `res=${p.resource}`);
  ok('nc52.heart cleaveMult scales the second target (default 1)', hitsOf('t_heart', b)[0].more === 1);
  // cleave 0: a single target
  const def2 = { ...def, id: 't_heart2', params: { hits: 2, cleave: 0, gap: 0.1 } };
  const c2 = ctxFor(p, def2, a);
  BEHAVIORS.multi_cleave.begin(c2);
  BEHAVIORS.multi_cleave.fire(c2);
  H.stepSec(0.3);
  ok('nc52.heart cleave 0: only the target', hitsOf('t_heart2', a).length === 2 && hitsOf('t_heart2', b).length === 0);
  spyEnd();
}

// ---- nc52.scourge: Ölüm Kırbacı ---------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const t = foe(0, 10), plagued = foe(3, 10), clean = foe(-3, 10), outside = foe(12, 10);
  plagued.statuses.apply('virulent_plague', 20, { dps: 10, magnitude: 6 });
  outside.statuses.apply('virulent_plague', 20, { dps: 10, magnitude: 6 });
  const def = testDef({
    id: 't_scourge', range: 25, damage: { coef: 0.55, type: 'shadow' },
    minion: { id: 'necro_lesser_ghoul', count: 1, cap: 3, group: 'lesser', life: 8 },
    params: { stackMore: 0.35, splashCoef: 0.5, splashRadius: 5 },
  });
  spyStart();
  // no stacks: plain strike, no ghoul, no splash
  let c = ctxFor(p, def, t);
  ok('nc52.scourge begin passes at 10 m (ranged lash)', BEHAVIORS.scourge_strike.begin(c) === true);
  BEHAVIORS.scourge_strike.fire(c);
  ok('nc52.scourge without vile_contagion: one plain hit, no ghoul, no splash', hitsOf('t_scourge', t).length === 1 && hitsOf('t_scourge', t)[0].more === 1 && hitsOf('t_scourge', plagued).length === 0 && G.minions.ownedBy(p.id).length === 0);
  // 3 stacks
  t.statuses.apply('vile_contagion', 20, { stacks: 3 });
  strikeLog.length = 0;
  c = ctxFor(p, def, t);
  BEHAVIORS.scourge_strike.begin(c);
  BEHAVIORS.scourge_strike.fire(c);
  ok('nc52.scourge spends exactly one vile_contagion stack (3 -> 2)', t.statuses.stacks('vile_contagion') === 2);
  ok('nc52.scourge the stack adds +35 % to the hit', near(hitsOf('t_scourge', t)[0].more, 1.35, 1e-9));
  ok('nc52.scourge the eruption splashes plagued enemies within 5 m at 0.5 coef', hitsOf('t_scourge', plagued).length === 1 && hitsOf('t_scourge', plagued)[0].coef === 0.5);
  ok('nc52.scourge enemies without the plague / outside 5 m are spared', hitsOf('t_scourge', clean).length === 0 && hitsOf('t_scourge', outside).length === 0);
  const lesser = G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_lesser_ghoul');
  ok('nc52.scourge summons one Küçük Ghul per stack spent', lesser.length === 1);
  // the other two stacks: lesser group cap 3
  for (let i = 0; i < 3; i++) { const cc = ctxFor(p, def, t); BEHAVIORS.scourge_strike.begin(cc); BEHAVIORS.scourge_strike.fire(cc); }
  ok('nc52.scourge stacks run out at 0 and the lesser cap (3) holds', t.statuses.stacks('vile_contagion') === 0 && G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === 3, `lesser=${G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length}`);
  // splashNeed 0: splash hits everything near
  t.statuses.apply('vile_contagion', 20, { stacks: 1 });
  strikeLog.length = 0;
  const def0 = { ...def, id: 't_scourge0', params: { ...def.params, splashNeed: 0 } };
  const c0 = ctxFor(p, def0, t); BEHAVIORS.scourge_strike.begin(c0); BEHAVIORS.scourge_strike.fire(c0);
  ok('nc52.scourge splashNeed 0 hits unplagued neighbours too', hitsOf('t_scourge0', clean).length === 1);
  // the caster's Öz gain
  const gdef = { ...def, id: 't_scourge_g', params: { gain: 10 } };
  p.resource = 30;
  const cg = ctxFor(p, gdef, t); BEHAVIORS.scourge_strike.begin(cg); BEHAVIORS.scourge_strike.fire(cg);
  ok('nc52.scourge Öz gain +10 via afterHits', p.resource > 30 && p.resource <= 40.01, `res=${p.resource}`);
  spyEnd();
}

// ---- nc52.coil: Ölüm Sarmalı -------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const t = foe(0, 10);
  const pet = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  pet.hp = Math.round(pet.maxHp * 0.5);
  const def = testDef({
    id: 't_coil', targeting: 'target_projectile', tags: ['spell'], range: 30, speed: 32, radius: 0.5, homing: 5, damage: { coef: 1.6, type: 'shadow' },
    params: { petHealPct: 0.05, dtMore: 0.2, minionHealPct: 0.2 },
  });
  const hp0 = pet.hp;
  let c = ctxFor(p, def, t);
  BEHAVIORS.death_coil.fire(c);
  ok('nc52.coil spawns the bolt', projectiles().length === 1);
  ok('nc52.coil heals the pet 5 % of its HP', near(pet.hp - hp0, pet.maxHp * 0.05, 1), `heal=${pet.hp - hp0}`);
  ok('nc52.coil no dark_transformation: more stays 1', c.more === 1);
  const t0 = t.hp;
  H.stepSec(1.2);
  ok('nc52.coil the bolt hits the enemy', t.hp < t0);
  // dark_transformation: +20 %
  p.statuses.apply('dark_transformation', 15, { sourceId: p.id });
  c = ctxFor(p, def, t);
  BEHAVIORS.death_coil.fire(c);
  ok('nc52.coil under dark_transformation the bolt deals +20 %', near(c.more, 1.2, 1e-9));
  H.stepSec(1.2);
  // aimed at an own minion: a heal, no bolt
  pet.hp = Math.round(pet.maxHp * 0.3);
  const before = pet.hp;
  const nProj = projectiles().length;
  c = ctxFor(p, def, null, { aim: { targetId: pet.id } });
  BEHAVIORS.death_coil.fire(c);
  ok('nc52.coil aimed at an own minion heals it 20 % and fires nothing', near(pet.hp - before, pet.maxHp * 0.2, 1) && projectiles().length === nProj, `heal=${pet.hp - before}`);
  // another player's minion is not healed
  pet.hp = Math.round(pet.maxHp * 0.3);
  pet.ownerId = 777;
  c = ctxFor(p, def, null, { aim: { targetId: pet.id } });
  BEHAVIORS.death_coil.fire(c);
  ok('nc52.coil a foreign minion is not healed (bolt flies instead)', pet.hp === Math.round(pet.maxHp * 0.3) && projectiles().length === nProj + 1);
}

// ---- nc52.epi: Salgın ---------------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const T = foe(0, 10), A = foe(3, 10), B = foe(6, 10), C = foe(20, 10);
  const def = testDef({
    id: 't_epi', tags: ['spell'], range: 25, radius: 8, damage: { coef: 1.6, type: 'shadow' },
    statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 6 }], params: { maxTargets: 8, dtMore: 0.2 },
  });
  spyStart();
  // the target carries a plague with a known dps: it is copied to the others
  T.statuses.apply('virulent_plague', 15, { dps: 50, magnitude: 6 });
  let c = ctxFor(p, def, T);
  ok('nc52.epi begin passes with a target', BEHAVIORS.spread_aoe.begin(c) === true);
  BEHAVIORS.spread_aoe.fire(c);
  ok('nc52.epi strikes the target and every enemy within 8 m of it', [T, A, B].every((e) => hitsOf('t_epi', e).length === 1) && hitsOf('t_epi', C).length === 0);
  ok('nc52.epi the plague is spread with the dps of the target (50)', [A, B].every((e) => e.statuses.has('virulent_plague') && near(e.statuses.get('virulent_plague').dps, 50, 0.01)), `dps=${A.statuses.get('virulent_plague')?.dps}`);
  ok('nc52.epi the enemy out of reach has no plague', !C.statuses.has('virulent_plague'));
  // target without the plague: every hit applies the row's own plague (dps from the hit)
  for (const e of [T, A, B]) e.statuses.remove('virulent_plague');
  strikeLog.length = 0;
  c = ctxFor(p, def, T);
  BEHAVIORS.spread_aoe.fire(c);
  ok('nc52.epi without a source plague the row applies its own (dps > 0 on all three)', [T, A, B].every((e) => (e.statuses.get('virulent_plague')?.dps ?? 0) > 0));
  // maxTargets
  const D = foe(1, 11), E = foe(-1, 11);
  const capDef = { ...def, id: 't_epi_cap', params: { maxTargets: 3 } };
  strikeLog.length = 0;
  c = ctxFor(p, capDef, T);
  BEHAVIORS.spread_aoe.fire(c);
  ok('nc52.epi maxTargets 3 (target first, then the nearest)', strikeLog.filter((s) => s.rowId === 't_epi_cap').length === 3 && hitsOf('t_epi_cap', T).length === 1);
  for (const e of [D, E]) H.world.remove(e);
  // dark_transformation +20 %
  p.statuses.apply('dark_transformation', 15, { sourceId: p.id });
  strikeLog.length = 0;
  c = ctxFor(p, def, T);
  BEHAVIORS.spread_aoe.fire(c);
  ok('nc52.epi under dark_transformation every hit is +20 %', hitsOf('t_epi', T)[0] && near(hitsOf('t_epi', T)[0].more, 1.2, 1e-9));
  p.statuses.remove('dark_transformation');
  // no target: begin fails unpaid; centre 1 needs none
  H.clearEvents();
  ok('nc52.epi no target: begin false', BEHAVIORS.spread_aoe.begin(ctxFor(p, def, null)) === false && events['skill:fail'].length === 1);
  const cdef = { ...def, id: 't_epi_c', params: { center: 1, maxTargets: 8 }, radius: 14 };
  strikeLog.length = 0;
  const c2 = ctxFor(p, cdef, null);
  ok('nc52.epi center 1 (caster-centred) needs no target', BEHAVIORS.spread_aoe.begin(c2) === true);
  BEHAVIORS.spread_aoe.fire(c2);
  ok('nc52.epi center 1 strikes everything around the caster', hitsOf('t_epi_c').length >= 2, `hits=${hitsOf('t_epi_c').length}`);
  spyEnd();
}

// ---- nc52.order: Ölüm Emri ------------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const T = foe(0, 12);
  const pet = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  const army = G.minions.summon(p, minionDef('necro_army_ghoul'), { count: 4, ignoreCap: true });
  T.statuses.apply('vile_contagion', 20, { stacks: 2 });
  const def = testDef({ id: 't_order', range: 30, damage: { coef: 0, type: 'shadow' }, params: { cmdCoef: 0.25, focusSec: 6, armyOnly: 1, cleaveMin: 3, cleaveRadius: 5, cleaveMax: 5, cleaveMult: 0.5 } });
  hitSpyStart();
  const c = ctxFor(p, def, T);
  ok('nc52.order begin passes with a target and minions', BEHAVIORS.death_order.begin(c) === true);
  BEHAVIORS.death_order.fire(c);
  ok('nc52.order focuses the target', G.minions.focusTarget(p.id) === T);
  ok('nc52.order spends one vile_contagion stack', T.statuses.stacks('vile_contagion') === 1);
  ok('nc52.order the army ghouls leap onto the target (within 2 m), the pet stays', army.every((m) => Math.hypot(m.position.x - T.position.x, m.position.z - T.position.z) < 2) && Math.hypot(pet.position.x - T.position.x, pet.position.z - T.position.z) > 5);
  ok('nc52.order ONE merged hit of cmdCoef x ghouls (4 x 0.25 = 1.0)', hitLog.length === 1 && hitLog[0].t === T && near(hitLog[0].coef, 1.0, 1e-9), JSON.stringify(hitLog.map((h) => h.coef)));
  // with 3+ enemies the order cleaves to up to 5 more at 50 %
  const n1 = foe(2, 12), n2 = foe(-2, 12), n3 = foe(0, 14.5), far = foe(20, 12);
  hitLog.length = 0;
  const c2 = ctxFor(p, def, T);
  BEHAVIORS.death_order.fire(c2);
  const cleaved = hitLog.filter((h) => h.t !== T);
  ok('nc52.order >= 3 enemies: cleave to the neighbours at 50 % (0.5)', cleaved.length === 3 && cleaved.every((h) => near(h.coef, 0.5, 1e-9)) && !cleaved.some((h) => h.t === far), JSON.stringify(cleaved.map((h) => h.coef)));
  ok('nc52.order the primary still takes the full 1.0', near(hitLog.find((h) => h.t === T).coef, 1.0, 1e-9));
  hitSpyEnd();
  // no minions -> unpaid fail
  const q = newNecro();
  const T2 = foe(0, 8);
  H.clearEvents();
  ok('nc52.order no minions: begin false', BEHAVIORS.death_order.begin(ctxFor(q, def, T2)) === false && events['skill:fail'].length === 1);
  // armyOnly 0 commands the pet too
  const pet2 = G.minions.summon(q, minionDef('necro_ghoul'), {})[0];
  const d0 = { ...def, id: 't_order0', params: { cmdCoef: 0.5, armyOnly: 0 } };
  hitSpyStart();
  BEHAVIORS.death_order.fire(ctxFor(q, d0, T2));
  ok('nc52.order armyOnly 0: every minion answers (pet 1 x 0.5)', hitLog.length === 1 && near(hitLog[0].coef, 0.5, 1e-9) && Math.hypot(pet2.position.x - T2.position.x, pet2.position.z - T2.position.z) < 2);
  hitSpyEnd();
}

// ---- nc52.dt: Karanlık Dönüşüm -------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const T = foe(0, 8);
  const pet = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  const lesser = G.minions.summon(p, minionDef('necro_lesser_ghoul'), {})[0];
  const base = pet.def.attacks[0].coef;
  const id0 = pet.def.id;
  const def = testDef({ id: 't_dt', targeting: 'self_buff', tags: [], damage: undefined, selfStatuses: [{ status: 'dark_transformation', duration: 15 }], params: { dmgMult: 2 } });
  const c = ctxFor(p, def, T);
  BEHAVIORS.empower_minions.fire(c);
  ok('nc52.dt applies dark_transformation to the caster', p.statuses.has('dark_transformation'));
  ok('nc52.dt the pet attack coef doubles', near(pet.def.attacks[0].coef, base * 2, 1e-9), `coef=${pet.def.attacks[0].coef} base=${base}`);
  ok('nc52.dt the empowered def keeps its identity (id, group, other attacks, model)', pet.def.id === id0 && pet.def.group === 'pet' && pet.def.model === minionDef('necro_ghoul').model && pet.def.attacks.length === minionDef('necro_ghoul').attacks.length);
  ok('nc52.dt the shared MinionDef row is untouched', minionDef('necro_ghoul').attacks[0].coef === base);
  ok('nc52.dt only the pet is empowered (lesser ghoul unchanged)', lesser.def.attacks[0].coef === minionDef('necro_lesser_ghoul').attacks[0].coef);
  hitSpyStart();
  G.minions.strike(pet, pet.def.attacks[0], T);
  ok('nc52.dt the pet blow reaches Combat with the doubled coef', hitLog.length === 1 && near(hitLog[0].coef, base * 2, 1e-9));
  hitSpyEnd();
  ok('nc52.dt focuses the pet on the aimed enemy', G.minions.focusTarget(p.id) === T);
  BEHAVIORS.empower_minions.fire(ctxFor(p, def, T));
  ok('nc52.dt recasting does not stack (still x2)', near(pet.def.attacks[0].coef, base * 2, 1e-9));
  tick(14);
  ok('nc52.dt still doubled at 14 s', near(pet.def.attacks[0].coef, base * 2, 1e-9));
  tick(2.5);
  ok('nc52.dt back to normal after the 15 s window', pet.def.attacks[0].coef === base, `coef=${pet.def.attacks[0].coef}`);
  ok('nc52.dt empowerMinion is exported for the data package', typeof empowerMinion === 'function');
}

// ---- nc52.army: Ölüler Ordusu -----------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  G.minions.summon(p, minionDef('necro_ghoul'), {});
  const def = testDef({
    id: 't_army', targeting: 'self_buff', tags: [], damage: undefined, castTime: 1.2,
    minion: { id: 'necro_army_ghoul', count: 8, life: 30, ignoreCap: true, group: 'army' },
    selfStatuses: [{ status: 'army', duration: 30 }], params: { ringRadius: 4.5 },
  });
  BEHAVIORS.summon_ring.fire(ctxFor(p, def));
  const ghouls = G.minions.ownedBy(p.id, (m) => m.def.group === 'army');
  ok('nc52.army 8 Ordu Ghulü, the pet stays (9 minions)', ghouls.length === 8 && G.minions.ownedBy(p.id).length === 9);
  ok('nc52.army they stand in a ring of ~4.5 m round the caster', ghouls.every((m) => near(Math.hypot(m.position.x, m.position.z), 4.5, 0.8)), ghouls.map((m) => Math.hypot(m.position.x, m.position.z).toFixed(1)).join(','));
  ok('nc52.army 30 s lifetime', ghouls.every((m) => near(m.life, 30, 0.1)));
  ok('nc52.army applies the army status (30 s)', p.statuses.has('army') && near(p.statuses.get('army').remaining, 30, 0.2));
  BEHAVIORS.summon_ring.fire(ctxFor(p, def));
  ok('nc52.army ignores the group cap but the owner cap (14) holds', G.minions.ownedBy(p.id).length === 14, `alive=${G.minions.ownedBy(p.id).length}`);
  const r = ctxFor(p, def, null, { remote: true });
  const n = G.minions.ownedBy(p.id).length;
  BEHAVIORS.summon_ring.fire(r);
  ok('nc52.army a remote replay summons nothing', G.minions.ownedBy(p.id).length === n);
  tick(31);
  ok('nc52.army the ghouls expire after 30 s', G.minions.ownedBy(p.id, (m) => m.def.group === 'army').length === 0);
}

// ---- nc52.ams: Büyü Karşıtı Kalkan ---------------------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  p.resource = 10;
  const def = testDef({ id: 't_ams', targeting: 'self_buff', tags: [], damage: undefined, selfStatuses: [{ status: 'anti_magic_shell', duration: 8 }], params: { absorbPct: 0.3, rpPerPct: 1, rpCap: 20 } });
  BEHAVIORS.magic_shell.fire(ctxFor(p, def));
  ok('nc52.ams status on, absorb = 30 % max HP (1500)', p.statuses.has('anti_magic_shell') && near(magicShellLeft(p), 1500, 0.01));
  const hp0 = p.hp;
  hurtMagic(p, 500, 'fire');
  ok('nc52.ams a 500 fire hit is soaked completely', p.hp === hp0 && near(magicShellLeft(p), 1000, 0.01), `hp=${p.hp} left=${magicShellLeft(p)}`);
  ok('nc52.ams Öz refund: 500 / 5000 = 10 % of max HP -> +10', near(p.resource, 20, 0.01), `res=${p.resource}`);
  hurt(p, 400);
  ok('nc52.ams physical damage is NOT soaked', p.hp < hp0 && near(magicShellLeft(p), 1000, 0.01), `hp=${p.hp}`);
  const hp1 = p.hp;
  hurtMagic(p, 1500, 'shadow');
  ok('nc52.ams the rest of the shell goes, the overflow (500) hurts', near(hp1 - p.hp, 500, 2) && magicShellLeft(p) === 0, `lost=${hp1 - p.hp}`);
  ok('nc52.ams the status ends with the shell', !p.statuses.has('anti_magic_shell'));
  ok('nc52.ams Öz refund is capped (20 per shell): 10 + 20 = 30 at most', near(p.resource, 30, 0.01), `res=${p.resource}`);
  // after the shell: magic hurts again
  const hp2 = p.hp;
  hurtMagic(p, 300, 'fire');
  ok('nc52.ams no shell: magic damage hurts again', p.hp < hp2);
  // expiry by time
  const q = newNecro();
  BEHAVIORS.magic_shell.fire(ctxFor(q, def));
  H.stepSec(9);
  const hq = q.hp;
  hurtMagic(q, 400, 'frost');
  ok('nc52.ams expires after 8 s', q.hp < hq && magicShellLeft(q) === 0);
  // true damage passes; recast replaces
  const r = newNecro();
  BEHAVIORS.magic_shell.fire(ctxFor(r, def));
  hurtMagic(r, 200, 'true');
  ok('nc52.ams true damage is not magic', near(magicShellLeft(r), 1500, 0.01));
  hurtMagic(r, 1000, 'fire');
  BEHAVIORS.magic_shell.fire(ctxFor(r, def));
  ok('nc52.ams a recast refills the shell', near(magicShellLeft(r), 1500, 0.01));
}

// ---- nc52.raise / nc52.cexp: corpse consumers -----------------------------------------------------------------------------------------------------
{
  const p = newNecro();
  const def = testDef({
    id: 't_raise', targeting: 'self_buff', tags: ['spell'], damage: undefined, cost: 25,
    minion: { id: 'necro_ghoul', count: 1, cap: 4, group: 'skeleton' }, params: { corpseRange: 12, corpseHpBonus: 0.4, corpseRefund: 1.0 },
  });
  H.clearEvents();
  ok('nc52.raise no corpse: begin fails unpaid', BEHAVIORS.raise_dead.begin(ctxFor(p, def)) === false && events['skill:fail'].length === 1);
  G.corpses.add(5, 0, 'orc', 'trash', 7, { id: 1 });
  G.corpses.add(9, 0, 'orc', 'elite', 7, { id: 2 });
  G.corpses.add(30, 0, 'orc', 'trash', 7, { id: 3 });
  const c = ctxFor(p, def);
  ok('nc52.raise a corpse within 12 m: begin passes', BEHAVIORS.raise_dead.begin(c) === true);
  p.resource = 10;
  BEHAVIORS.raise_dead.fire(c);
  const m = G.minions.ownedBy(p.id)[0];
  ok('nc52.raise consumes the nearest corpse (5 m) and raises a minion on it', !!m && G.corpses.list.length === 2 && !G.corpses.list.some((x) => x.id === 1) && near(m.position.x, 5, 0.5));
  ok('nc52.raise corpseHpBonus +40 % HP', m && near(m.maxHp, Math.round(p.maxHp * minionDef('necro_ghoul').hpFrac * 1.4), 2) && m.hp === m.maxHp, `maxHp=${m?.maxHp}`);
  ok('nc52.raise refunds the cost (25)', near(p.resource, 35, 0.01), `res=${p.resource}`);
  ok('nc52.raise the corpse beyond range is left alone', G.corpses.list.some((x) => x.id === 3));
  // needCorpse 0: summons at the caster without one
  G.corpses.clear('cleared');
  const free = { ...def, id: 't_raise_free', params: { needCorpse: 0 } };
  const before = G.minions.ownedBy(p.id).length;
  const c2 = ctxFor(p, free);
  ok('nc52.raise needCorpse 0: begin passes without a corpse', BEHAVIORS.raise_dead.begin(c2) === true);
  BEHAVIORS.raise_dead.fire(c2);
  ok('nc52.raise needCorpse 0: still raises one', G.minions.ownedBy(p.id).length === before + 1);

  // corpse_explosion
  const q = newNecro();
  const e1 = foe(10, 10, { hp: 1e7 }), e2 = foe(11, 10), far = foe(25, 10);
  G.corpses.add(10.5, 10, 'orc', 'trash', 7, { id: 50 });
  const xdef = testDef({ id: 't_cexp', targeting: 'ground_aoe', tags: ['spell'], range: 16, radius: 4.2, damage: { coef: 3.6, type: 'shadow' }, params: { corpseSearch: 6, livingCoef: 0.4 } });
  spyStart();
  H.clearEvents();
  const noCorpse = ctxFor(q, xdef, null, { point: [25, 25] });
  const xdef0 = { ...xdef, id: 't_cexp0', params: { corpseSearch: 6, livingCoef: 0 } };
  ok('nc52.cexp no corpse near the point and no livingCoef: begin fails', BEHAVIORS.corpse_explosion.begin(ctxFor(q, xdef0, null, { point: [25, 25] })) === false);
  ok('nc52.cexp a corpse within 6 m of the aim point: begin passes', BEHAVIORS.corpse_explosion.begin(ctxFor(q, xdef, null, { point: [12, 10] })) === true);
  const cx = ctxFor(q, xdef, null, { point: [12, 10] });
  BEHAVIORS.corpse_explosion.fire(cx);
  ok('nc52.cexp consumes the corpse', G.corpses.list.length === 0);
  ok('nc52.cexp blasts everything within 4.2 m of the corpse, not the far one', hitsOf('t_cexp', e1).length === 1 && hitsOf('t_cexp', e2).length === 1 && hitsOf('t_cexp', far).length === 0);
  ok('nc52.cexp full strength with a corpse (more 1)', hitsOf('t_cexp', e1)[0].more === 1);
  // without a corpse: livingCoef 0.4 on the aim point
  strikeLog.length = 0;
  const cl = ctxFor(q, xdef, null, { point: [10.5, 10] });
  ok('nc52.cexp livingCoef rows may blast without a corpse', BEHAVIORS.corpse_explosion.begin(cl) === true);
  BEHAVIORS.corpse_explosion.fire(cl);
  ok('nc52.cexp the living blast is 0.4 x', hitsOf('t_cexp', e1).length === 1 && near(hitsOf('t_cexp', e1)[0].more, 0.4, 1e-9));
  // chain: a kill leaves a corpse that explodes again at x0.5
  const r = newNecro();
  const k1 = foe(10, 10, { hp: 1 }); k1.hp = 1; k1.maxHp = 1;
  const k2 = foe(12, 10, { hp: 1e7 });
  G.corpses.add(10, 10, 'orc', 'trash', 7, { id: 60 });
  strikeLog.length = 0;
  const cdef = { ...xdef, id: 't_cexp_chain', params: { corpseSearch: 6, explChain: 2, explChainMult: 0.5 } };
  BEHAVIORS.corpse_explosion.fire(ctxFor(r, cdef, null, { point: [10, 10] }));
  H.stepSec(1);
  const k2hits = hitsOf('t_cexp_chain', k2);
  ok('nc52.cexp chain: the blast kills k1, its corpse goes off again at 0.5', k1.isDead && k2hits.length >= 2 && near(k2hits[0].more, 1, 1e-9) && near(k2hits[1].more, 0.5, 1e-9), `k1dead=${k1.isDead} k2hits=${k2hits.map((h) => h.more).join(',')}`);
  spyEnd();
}

// ---- nc52.existing: rows that run on behaviours of other files --------------------------------------------------------------------------------------
{
  // Kan Kaynatma: self_aoe + maxTargets + blood_plague on every hit (no new behaviour)
  const p = newNecro();
  const es = [];
  for (let i = 0; i < 10; i++) es.push(foe(Math.sin(i) * 3, Math.cos(i) * 3));
  const bb = testDef({ id: 't_blood_boil', targeting: 'self_aoe', tags: ['spell'], radius: 5, damage: { coef: 1.4, type: 'shadow' }, statuses: [{ status: 'blood_plague', duration: 24, magnitude: 1 }], params: { maxTargets: 8 } });
  const { TARGETING_BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
  TARGETING_BEHAVIORS.self_aoe.fire(ctxFor(p, bb));
  const plagued = es.filter((e) => e.statuses.has('blood_plague'));
  ok('nc52.existing blood_boil (self_aoe) hits max 8 and applies blood_plague with dps', plagued.length === 8 && plagued.every((e) => e.statuses.get('blood_plague').dps > 0), `plagued=${plagued.length}`);
  for (const e of es) H.world.remove(e);

  // Outbreak / Çürüten Darbe: plain target_instant with statuses (dps resolved from the hit, stacks add)
  const t = foe(0, 10);
  const ob = testDef({ id: 't_outbreak', tags: ['spell'], range: 25, damage: { coef: 0.3, type: 'shadow' }, statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 6 }] });
  TARGETING_BEHAVIORS.target_instant.begin(ctxFor(p, ob, t));
  TARGETING_BEHAVIORS.target_instant.fire(ctxFor(p, ob, t));
  ok('nc52.existing outbreak (target_instant) applies virulent_plague with dps', (t.statuses.get('virulent_plague')?.dps ?? 0) > 0 && near(t.statuses.get('virulent_plague').remaining, 21, 0.2));
  const fs = testDef({ id: 't_festering', range: 3.2, damage: { coef: 0.7, type: 'physical' }, statuses: [{ status: 'vile_contagion', duration: 20, stacks: 3 }] });
  const near1 = foe(0, 2.5);
  TARGETING_BEHAVIORS.target_instant.begin(ctxFor(p, fs, near1));
  TARGETING_BEHAVIORS.target_instant.fire(ctxFor(p, fs, near1));
  ok('nc52.existing festering_strike (target_instant) adds 3 vile_contagion stacks', near1.statuses.stacks('vile_contagion') === 3);
  TARGETING_BEHAVIORS.target_instant.fire(ctxFor(p, fs, near1));
  ok('nc52.existing vile_contagion caps at 3 stacks', near1.statuses.stacks('vile_contagion') === 3);
  ok('nc52.existing grip / interrupt / self_buff / minion_summon / minion_command are installed', ['grip', 'interrupt', 'self_buff', 'minion_summon', 'minion_command'].every((k) => typeof (BEHAVIORS[k] ?? TARGETING_BEHAVIORS[k])?.fire === 'function'));
}

// ---- nc52.remote: visual replays never throw and never change state ------------------------------------------------------------------------------
{
  const p = newNecro();
  const t = foe(0, 3);
  const pet = G.minions.summon(p, minionDef('necro_ghoul'), {})[0];
  G.corpses.add(4, 0, 'orc', 'trash', 1, { id: 9 });
  const rows = {
    death_strike: testDef({ id: 't_r1', range: 3.2 }),
    strike_self_buff: testDef({ id: 't_r2', range: 3.2, selfStatuses: [{ status: 'bone_armor', duration: 30, stacks: 3 }] }),
    multi_cleave: testDef({ id: 't_r3', range: 3.2, params: { hits: 2, cleave: 1 } }),
    scourge_strike: testDef({ id: 't_r4', range: 25, minion: { id: 'necro_lesser_ghoul', count: 1, cap: 3, group: 'lesser', life: 8 } }),
    death_coil: testDef({ id: 't_r5', targeting: 'target_projectile', range: 30, speed: 32, homing: 5 }),
    spread_aoe: testDef({ id: 't_r6', range: 25, radius: 8, statuses: [{ status: 'virulent_plague', duration: 21, magnitude: 6 }] }),
    death_order: testDef({ id: 't_r7', range: 30, params: { cmdCoef: 0.5 } }),
    empower_minions: testDef({ id: 't_r8', selfStatuses: [{ status: 'dark_transformation', duration: 15 }] }),
    summon_ring: testDef({ id: 't_r9', minion: { id: 'necro_army_ghoul', count: 8, life: 30, ignoreCap: true, group: 'army' }, selfStatuses: [{ status: 'army', duration: 30 }] }),
    magic_shell: testDef({ id: 't_r10', selfStatuses: [{ status: 'anti_magic_shell', duration: 8 }] }),
    raise_dead: testDef({ id: 't_r11', minion: { id: 'necro_ghoul', count: 1, cap: 4, group: 'skeleton' } }),
    corpse_explosion: testDef({ id: 't_r12', radius: 4 }),
  };
  const hp = t.hp, minions = G.minions.ownedBy(p.id).length, corpses = G.corpses.list.length, petHp = pet.hp;
  let threw = '';
  for (const [id, def] of Object.entries(rows)) {
    try {
      const c = ctxFor(p, def, t, { remote: true });
      BEHAVIORS[id].begin?.call(BEHAVIORS[id], c);
      BEHAVIORS[id].fire(c);
    } catch (e) {
      threw += `${id}: ${e?.message ?? e}; `;
    }
  }
  const untouched = t.hp === hp;   // before the world runs on (the pet would bite the dummy)
  H.stepSec(2);
  ok('nc52.remote no behaviour throws on a remote replay', threw === '', threw);
  ok('nc52.remote no damage, minions, corpses, statuses or heals', untouched && G.minions.ownedBy(p.id).length === minions && G.corpses.list.length === corpses && pet.hp === petHp
    && !p.statuses.has('bone_armor') && !p.statuses.has('army') && !p.statuses.has('anti_magic_shell') && !p.statuses.has('dark_transformation') && !t.statuses.has('virulent_plague'));
}

// ---- errors from the run ---------------------------------------------------------------------------------------------------------------------------
ok('nc52.errors no console errors from the necromancer behaviours', errors.filter((e) => /necromancer|behaviors|death_|corpse|magicShell|Corpses|Minions|SkillSystem/i.test(e)).length === 0, errors.slice(0, 3).join(' | '));

console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
