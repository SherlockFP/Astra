// NC51 Paladin behaviours (GDD_CLASSES_V2 §14 row 51; docs/kits/plate-melee.md §5-§7). No browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/nc51.mjs
// The real paladin skill rows do not exist yet (PM-PA writes them), so every check uses dev SkillDefs defined here (ids `t_*`).
// Covered: nc51.install, nc51.heal.* (smart ally, formula, missing-HP / low-HP scaling, HoT, remote 'heal' + 'pstatus', self refund,
//          smartPriority, dual target, healBelow, dispel, Lay on Hands), nc51.pips (pip cost / begin-fails-unpaid / coefPerPip),
//          nc51.aoe.* (Light of Dawn), nc51.bolt.* (Işık Oku), nc51.shield.* (İntikamcı Kalkan), nc51.wrath.* (Gazap Çekici),
//          nc51.splash.* (Işık Çekici / İdam Hükmü), nc51.wake.* (Küllerin Uyanışı), nc51.steed.*, nc51.ardent.*, nc51.remote.
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { BEHAVIORS_SHARED } = await H.imp('combat/skills/sharedBehaviors.ts');
const { BEHAVIORS_PALADIN } = await H.imp('combat/skills/behaviors_paladin.ts');
const { STATUSES } = await H.imp('data/statuses.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const IDS = ['heal_target', 'heal_aoe', 'heal_bolt', 'avengers_shield', 'hammer_of_wrath', 'splash_strike', 'wake_of_ashes', 'divine_steed', 'ardent_defender'];

// ---- helpers --------------------------------------------------------------------------------------------------------------------
// a CastCtx for behaviours called directly (the real one is built by SkillSystem.makeCtx; same fields as nc48.mjs)
function ctxFor(p, def, target = null, over = {}) {
  const aim = { ...H.aimFor(p, target), ...(over.aim ?? {}) };
  return {
    sys: G.skills, caster: p, def, aim, dir: over.dir ?? [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: !!over.remote, action: null, target: over.target ?? null, point: [p.position.x, p.position.z], data: {}, more: over.more ?? 1,
  };
}
const testDef = (over = {}) => ({
  id: 't_row', classId: 'paladin', name: 't', desc: '', icon: '', unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0, anim: 'x',
  targeting: 'custom', tags: ['spell'], params: {}, statuses: [], ...over,
});

// SkillSystem.strike spy: records the test rows' hits (restored by spyEnd)
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
const hitsOf = (rowId) => strikeLog.filter((s) => s.rowId === rowId && s.ret);
// G.combat.healPlayer spy (natural hp regen does not go through it, so the heals of the behaviours can be told apart)
let healLog = [];
const origHeal = G.combat.healPlayer;
function healSpyStart() {
  healLog = [];
  G.combat.healPlayer = function (src, tgt, amt, o) { healLog.push({ src, tgt, amt }); return origHeal.call(this, src, tgt, amt, o); };
}
function healSpyEnd() { G.combat.healPlayer = origHeal; }
const projectiles = () => [...H.world.entities.values()].filter((e) => e.kind === 'projectile');

// Math.random pinned for exact heal numbers: weapon roll 90 + 0.5 x 20 = 100, no crit
function withRandom(v, fn) {
  const orig = Math.random;
  Math.random = () => v;
  try { return fn(); } finally { Math.random = orig; }
}
// main stat 100 -> x2, so amount = 100 x coef x 2
const healOf = (coef) => 100 * coef * 2;

let nextAllyId = 300;
function addAlly(x, z, { hpFrac = 0.4, local = true } = {}) {
  const a = new H.FakePlayer('knight');
  a.id = nextAllyId++;
  a.isLocal = local;
  a.authority = local;
  a.maxHp = 5000;
  a.hp = Math.round(5000 * hpFrac);
  a.position.set(x, 0, z);
  H.world.add(a);
  return a;
}
function newPaladin() {
  const p = H.addPlayer('paladin');
  p.yaw = 0;
  p.stats.critChance = 0;
  p.position.set(0, 0, 0);
  return p;
}
// net stub: records every send; `remote` ids resolve to a peer
function netStub(remoteIds = []) {
  const sent = [], toHost = [], bc = [];
  G.net = {
    isAuthority: true, on() {}, peers: new Map(),
    broadcast: (ch, m) => bc.push([ch, m]),
    sendToHost: (ch, m) => toHost.push([ch, m]),
    sendTo: (peer, ch, m) => sent.push([peer, ch, m]),
    peerOfEntity: (id) => (remoteIds.includes(id) ? 'peerR' : null),
  };
  return { sent, toHost, bc };
}

// ---- nc51.install -----------------------------------------------------------------------------------------------------------------
{
  for (const k of IDS) ok(`nc51.install ${k} in BEHAVIORS`, typeof BEHAVIORS[k]?.fire === 'function' && BEHAVIORS_PALADIN[k] === BEHAVIORS[k]);
  ok('nc51.install does not shadow shared / existing keys', !IDS.some((k) => k in BEHAVIORS_SHARED) && IDS.every((k) => !['provoke', 'execute', 'wake_flames', 'divine_toll', 'interrupt'].includes(k)));
  ok('nc51.install registers exactly the documented ids', Object.keys(BEHAVIORS_PALADIN).sort().join() === [...IDS].sort().join());
}

// ---- nc51.heal.*: heal_target on a local ally -------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const ally = addAlly(4, 0, { hpFrac: 0.4 });
  const full = addAlly(-4, 0, { hpFrac: 1 });
  H.step(2);
  const def = testDef({ id: 't_flash', range: 30, heal: { coef: 2.8 }, allyTarget: 'friendly' });
  const c = ctxFor(p, def, null);
  const hp0 = ally.hp;
  const b = BEHAVIORS.heal_target.begin(c);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c));
  ok('nc51.heal.smart begin picks the lowest ally', b === true && c.data.pick?.ally === ally);
  ok('nc51.heal.formula heals W x coef x (1 + main/100)', near(ally.hp - hp0, healOf(2.8), 1), `healed=${ally.hp - hp0}`);
  ok('nc51.heal.full ally untouched', full.hp === 5000);

  // c.more (Işık Aşısı x1.2) scales the heal
  const hp1 = ally.hp;
  const c2 = ctxFor(p, def, null, { more: 1.2 });
  BEHAVIORS.heal_target.begin(c2);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c2));
  ok('nc51.heal.more cast multiplier scales the heal', near(ally.hp - hp1, healOf(2.8 * 1.2), 1), `healed=${ally.hp - hp1}`);

  // the aimed ally (party frame) wins over the smart pick
  ally.hp = 1000; full.hp = 4000;
  const c3 = ctxFor(p, def, null, { aim: { allyId: full.id } });
  BEHAVIORS.heal_target.begin(c3);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c3));
  ok('nc51.heal.aimed ally frame wins over the lowest ally', c3.data.pick?.ally === full && full.hp > 4000 && ally.hp === 1000);

  // out of range: the aimed ally is ignored, the smart pick still resolves inside the range
  full.position.set(50, 0, 0);
  const shortDef = testDef({ id: 't_short', range: 10, heal: { coef: 1 } });
  const c4 = ctxFor(p, shortDef, null, { aim: { allyId: full.id } });
  BEHAVIORS.heal_target.begin(c4);
  ok('nc51.heal.range an aimed ally out of range is not picked', c4.data.pick?.ally !== full);
}

// ---- nc51.heal.scale: Word of Glory missing-HP bonus, low-HP mastery, HoT, self refund ---------------------------------------------------
{
  const p = newPaladin();
  const a50 = addAlly(3, 0, { hpFrac: 0.5 });
  const a30 = addAlly(-3, 0, { hpFrac: 0.3 });
  H.step(2);
  const def = testDef({
    id: 't_wog', range: 30, heal: { coef: 2.6 }, allyTarget: 'friendly',
    params: { missingHpBonus: 1, lowHpBelow: 0.35, lowHpMult: 1.15, hotCoef: 1.6, hotDur: 12 },
  });
  // 50 % HP: coef x (1 + 1 x 0.5) = x1.5
  const h50 = a50.hp;
  const c1 = ctxFor(p, def, null, { aim: { allyId: a50.id } });
  BEHAVIORS.heal_target.begin(c1);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c1));
  ok('nc51.heal.missing 50 % HP ally: +50 % heal', near(a50.hp - h50, healOf(2.6 * 1.5), 1), `healed=${a50.hp - h50}`);
  // 30 % HP: x1.7 and the low-HP mastery x1.15
  const h30 = a30.hp;
  const c2 = ctxFor(p, def, null, { aim: { allyId: a30.id } });
  BEHAVIORS.heal_target.begin(c2);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c2));
  ok('nc51.heal.lowhp 30 % HP ally: +70 % and x1.15 mastery', near(a30.hp - h30, healOf(2.6 * 1.7 * 1.15), 1), `healed=${a30.hp - h30}`);
  // HoT: renew on the target, magnitude = total / duration (healed per second)
  const renew = a30.statuses.get('renew');
  const wantMag = healOf(1.6) / 12;
  ok('nc51.heal.hot renew lands with total/duration per second', !!renew && near(renew.magnitude, wantMag, 0.5) && near(renew.remaining, 12, 0.1), `mag=${renew?.magnitude}`);
  const hBefore = a30.hp;
  H.stepSec(3);
  ok('nc51.heal.hot ticks heal the ally over time', a30.hp > hBefore + wantMag * 2, `gain=${(a30.hp - hBefore).toFixed(1)}`);

  // self cast: nobody else hurt -> the caster; selfRefund gives faith back
  const q = newPaladin();
  H.step(2); // the first combat frame resets the resource to its start value
  q.hp = 2500;
  q.resource = 40;
  const selfDef = testDef({ id: 't_wog_self', range: 30, heal: { coef: 2.6 }, params: { selfRefund: 5 } });
  const c3 = ctxFor(q, selfDef, null);
  BEHAVIORS.heal_target.begin(c3);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c3));
  ok('nc51.heal.self falls back to the caster', c3.data.pick?.ally === q && q.hp > 2500);
  ok('nc51.heal.self selfRefund returns faith', near(q.resource, 45, 0.01), `res=${q.resource}`);
}

// ---- nc51.heal.net: a remote ally is healed through the 'heal' channel, its HoT goes out as 'pstatus' --------------------------------------
{
  const p = newPaladin();
  const remote = addAlly(4, 0, { hpFrac: 0.4, local: false });
  const net = netStub([remote.id]);
  H.step(2);
  const def = testDef({ id: 't_wog_net', range: 30, heal: { coef: 1.4 }, params: { hotCoef: 1.6, hotDur: 12 }, statuses: [{ status: 'forbearance', duration: 90 }] });
  const c = ctxFor(p, def, null);
  const hp0 = remote.hp;
  BEHAVIORS.heal_target.begin(c);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c));
  const heals = net.sent.filter((m) => m[1] === 'heal');
  const ps = net.sent.filter((m) => m[1] === 'pstatus');
  ok('nc51.heal.net heal goes to the owner via the heal channel', heals.length === 1 && heals[0][0] === 'peerR' && heals[0][2].targetId === remote.id && near(heals[0][2].amount, healOf(1.4), 1), JSON.stringify(heals[0]?.[2]));
  ok('nc51.heal.net the replica hp is not touched locally', remote.hp === hp0);
  ok('nc51.heal.net HoT and row statuses go out as pstatus', ps.some((m) => m[2].status === 'renew' && m[2].magnitude > 0) && ps.some((m) => m[2].status === 'forbearance'), ps.map((m) => m[2].status).join(','));
  ok('nc51.heal.net the replica carries no local status', !remote.statuses.has('renew'));
  G.net = undefined;
}

// ---- nc51.heal.fail: smartPriority 1 and nobody hurt -> fails before anything is paid -----------------------------------------------------
{
  const p = newPaladin();
  addAlly(3, 0, { hpFrac: 1 });
  H.step(2);
  H.clearEvents();
  const def = testDef({ id: 't_inj', range: 30, heal: { coef: 2.8 }, params: { smartPriority: 1 } });
  const c = ctxFor(p, def, null);
  ok('nc51.heal.fail smartPriority 1 with everybody full: begin false', BEHAVIORS.heal_target.begin(c) === false);
  ok('nc51.heal.fail reports the target reason', events['skill:fail'].some((e) => e.reason === 'target'));
}

// ---- nc51.heal.dual: Holy Shock (ally heals, enemy under the reticle takes damage) ---------------------------------------------------------
{
  const p = newPaladin();
  const ally = addAlly(-3, 0, { hpFrac: 0.3 });
  const foe = addEnemy(0, 8);
  H.step(2);
  const def = testDef({ id: 't_shock', range: 25, heal: { coef: 1.43 }, damage: { coef: 2, type: 'holy' }, allyTarget: 'any', targeting: 'custom' });
  // enemy under the reticle -> damage branch
  spyStart();
  const hp0 = ally.hp;
  const c1 = ctxFor(p, def, foe);
  ok('nc51.dual enemy under the reticle: begin picks the enemy', BEHAVIORS.heal_target.begin(c1) === true && c1.data.pick?.enemy === foe);
  BEHAVIORS.heal_target.fire(c1);
  const dmg = hitsOf('t_shock');
  ok('nc51.dual enemy branch strikes with the damage coef', dmg.length === 1 && dmg[0].e === foe && foe.hp < foe.maxHp, `hits=${dmg.length}`);
  ok('nc51.dual enemy branch heals nobody', ally.hp === hp0);
  // aimed ally frame overrides the enemy
  const c2 = ctxFor(p, def, foe, { aim: { allyId: ally.id } });
  BEHAVIORS.heal_target.begin(c2);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c2));
  ok('nc51.dual an aimed ally frame heals even with an enemy targeted', c2.data.pick?.ally === ally && near(ally.hp - hp0, healOf(1.43), 1) && hitsOf('t_shock').length === 1);
  // no enemy: heal branch (smart)
  const c3 = ctxFor(p, def, null);
  BEHAVIORS.heal_target.begin(c3);
  ok('nc51.dual no enemy under the reticle: heal branch', c3.data.pick?.ally === ally && !c3.data.pick?.enemy);
  // healBelow: an ally under 40 % HP is ahead of the enemy
  const guarded = testDef({ id: 't_shock2', range: 25, heal: { coef: 1.43 }, damage: { coef: 2, type: 'holy' }, allyTarget: 'any', params: { healBelow: 0.4 } });
  const c4 = ctxFor(p, guarded, foe);
  BEHAVIORS.heal_target.begin(c4);
  ok('nc51.dual healBelow keeps a hurt ally ahead of the enemy', c4.data.pick?.ally === ally && !c4.data.pick?.enemy);
  ally.hp = 4500;
  const c5 = ctxFor(p, guarded, foe);
  BEHAVIORS.heal_target.begin(c5);
  ok('nc51.dual healBelow lets the enemy through once allies are healthy', c5.data.pick?.enemy === foe);
  // out-of-range enemy
  const far = addEnemy(0, 60);
  H.step(1);
  const c6 = ctxFor(p, def, far);
  const c6pick = BEHAVIORS.heal_target.begin(c6);
  ok('nc51.dual an enemy out of range is not a target (falls back to the ally)', c6pick === true && !c6.data.pick?.enemy);
  spyEnd();
}

// ---- nc51.heal.dispel: Arındırma ---------------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const sick = addAlly(3, 0, { hpFrac: 0.6 });
  const healthy = addAlly(-3, 0, { hpFrac: 0.2 });
  H.step(2);
  sick.statuses.apply('poison', 20, { stacks: 1, sourceId: 99 });
  sick.statuses.apply('bleed', 20, { stacks: 1, sourceId: 99 });
  sick.statuses.apply('slow', 20, { sourceId: 99 });
  const def = testDef({ id: 't_cleanse', range: 30, heal: { coef: 0.5 }, allyTarget: 'friendly', params: { dispel: 2 } });
  const c = ctxFor(p, def, null);
  const b = BEHAVIORS.heal_target.begin(c);
  ok('nc51.dispel picks the ally with a debuff, not the lowest-HP one', b === true && c.data.pick?.ally === sick);
  const hp0 = sick.hp;
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c));
  const left = ['poison', 'bleed', 'slow'].filter((s) => sick.statuses.has(s)).length;
  ok('nc51.dispel removes up to `dispel` debuffs', left === 1, `left=${left}`);
  ok('nc51.dispel heals when something was removed', near(sick.hp - hp0, healOf(0.5), 1), `healed=${sick.hp - hp0}`);
  // nothing dispellable anywhere: fails unpaid
  for (const s of ['poison', 'bleed', 'slow']) sick.statuses.remove(s);
  H.clearEvents();
  const c2 = ctxFor(p, def, null);
  ok('nc51.dispel no debuff anywhere: begin false', BEHAVIORS.heal_target.begin(c2) === false && events['skill:fail'].some((e) => e.reason === 'target'));
  // needDebuff 0 casts anyway, heals nothing without a removal
  const loose = testDef({ id: 't_cleanse2', range: 30, heal: { coef: 0.5 }, params: { dispel: 2, needDebuff: 0 } });
  const c3 = ctxFor(p, loose, null);
  const h0 = healthy.hp;
  ok('nc51.dispel needDebuff 0 still begins', BEHAVIORS.heal_target.begin(c3) === true);
  withRandom(0.5, () => BEHAVIORS.heal_target.fire(c3));
  ok('nc51.dispel no removal -> no heal', healthy.hp === h0 && sick.hp >= 0);
}

// ---- nc51.heal.loh: Lay on Hands (healPct, refuses forbearance) --------------------------------------------------------------------------
{
  const p = newPaladin();
  const dying = addAlly(3, 0, { hpFrac: 0.05 });
  H.step(2);
  const def = testDef({ id: 't_loh', range: 30, heal: { coef: 0 }, statuses: [{ status: 'forbearance', duration: 90 }], params: { healPct: 1, forbearance: 1 } });
  const c = ctxFor(p, def, null);
  ok('nc51.loh begin accepts a fresh ally', BEHAVIORS.heal_target.begin(c) === true);
  BEHAVIORS.heal_target.fire(c);
  ok('nc51.loh heals 100 % of max HP', dying.hp === 5000, `hp=${dying.hp}`);
  ok('nc51.loh target gets forbearance', dying.statuses.has('forbearance'));
  dying.hp = 100;
  const c2 = ctxFor(p, def, null);
  const b2 = BEHAVIORS.heal_target.begin(c2);
  ok('nc51.loh refuses a target under forbearance (falls back to another ally)', b2 === true && c2.data.pick?.ally !== dying);
}

// ---- nc51.pips: the cost pip, a failed begin pays nothing, coefPerPip (end to end through SkillSystem.tryCast) -----------------------------
{
  SKILLS.t_wog_pip = testDef({
    id: 't_wog_pip', name: 'WoG', unlockLevel: 1, cooldown: 0, hitTime: 0.1, animSpeed: 1, range: 30, behavior: 'heal_target', allyTarget: 'friendly',
    heal: { coef: 2.6 }, pip: { id: 'holypower', cost: 3 }, params: { end: 0.2, smartPriority: 1 }, tags: ['spell', 'heal'],
  });
  SKILLS.t_wog_scale = testDef({
    id: 't_wog_scale', name: 'WoG5', unlockLevel: 1, cooldown: 0, hitTime: 0.1, animSpeed: 1, range: 30, behavior: 'heal_target', allyTarget: 'friendly',
    heal: { coef: 2.6 }, pip: { id: 'holypower', min: 3, consume: 5, coefPerPip: 0.8 }, params: { end: 0.2 }, tags: ['spell', 'heal'],
  });
  const p = newPaladin();
  const ally = addAlly(3, 0, { hpFrac: 0.2 });
  H.step(2);
  G.skills.addPip(p, 'holypower', 5);
  const aim = H.aimFor(p, null);
  const hp0 = ally.hp;
  withRandom(0.5, () => { G.skills.tryCast(p, 't_wog_pip', aim); H.stepSec(0.6); });
  ok('nc51.pips the cast spends exactly 3 Holy Power', G.skills.pipCount(p, 'holypower') === 2, `pips=${G.skills.pipCount(p, 'holypower')}`);
  ok('nc51.pips the heal lands after the cast', near(ally.hp - hp0, healOf(2.6), 1), `healed=${ally.hp - hp0}`);
  // 2 pips left: refused, nothing changes
  const hp1 = ally.hp;
  const ret = G.skills.tryCast(p, 't_wog_pip', aim);
  H.stepSec(0.6);
  ok('nc51.pips under the cost the cast is refused', ret === false && G.skills.pipCount(p, 'holypower') === 2 && ally.hp === hp1);
  // nobody hurt + smartPriority 1: begin fails, the pips stay
  ally.hp = 5000;
  G.skills.addPip(p, 'holypower', 3);
  H.stepSec(1.5);
  const before = G.skills.pipCount(p, 'holypower');
  G.skills.tryCast(p, 't_wog_pip', aim);
  H.stepSec(0.6);
  ok('nc51.pips begin false (nobody hurt) pays no pips', G.skills.pipCount(p, 'holypower') === before, `before=${before} after=${G.skills.pipCount(p, 'holypower')}`);
  // coefPerPip: 5 spent of min 3 -> +2 x 0.8
  ally.hp = 1000;
  G.skills.addPip(p, 'holypower', 5);
  const hp2 = ally.hp;
  withRandom(0.5, () => { G.skills.tryCast(p, 't_wog_scale', aim); H.stepSec(0.6); });
  ok('nc51.pips coefPerPip scales with the pips spent', near(ally.hp - hp2, healOf(2.6 + 0.8 * 2), 1) && G.skills.pipCount(p, 'holypower') === 0, `healed=${ally.hp - hp2}`);
  delete SKILLS.t_wog_pip; delete SKILLS.t_wog_scale;
}

// ---- nc51.aoe.*: Light of Dawn ---------------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const hpFracs = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1];
  const allies = hpFracs.map((f, i) => addAlly(2 + i, 3, { hpFrac: f }));
  const outside = addAlly(40, 0, { hpFrac: 0.1 });
  H.step(2);
  const def = testDef({ id: 't_dawn', radius: 15, heal: { coef: 2.2 }, params: { maxTargets: 5, hotPct: 0.3, hotDur: 4 } });
  const before = allies.map((a) => a.hp);
  const c = ctxFor(p, def, null);
  ok('nc51.aoe begin accepts (injured allies in reach)', BEHAVIORS.heal_aoe.begin(c) === true);
  withRandom(0.5, () => BEHAVIORS.heal_aoe.fire(c));
  const healed = allies.map((a, i) => a.hp > before[i]);
  ok('nc51.aoe heals the 5 most injured allies only', healed.slice(0, 5).every(Boolean) && !healed[5] && !healed[6], healed.join(','));
  ok('nc51.aoe each target gets W x coef', near(allies[0].hp - before[0], healOf(2.2), 1), `healed=${allies[0].hp - before[0]}`);
  ok('nc51.aoe an ally out of the radius is not healed', outside.hp === 500);
  const hot = allies[0].statuses.get('dawn_hot');
  ok('nc51.aoe dawn_hot carries 30 % of the heal over 4 s', !!hot && near(hot.magnitude, (healOf(2.2) * 0.3) / 4, 0.5) && !allies[5].statuses.has('dawn_hot'), `mag=${hot?.magnitude}`);
  // cone: only allies in front
  const q = newPaladin();
  const front = addAlly(0, 6, { hpFrac: 0.3 });
  const back = addAlly(0, -6, { hpFrac: 0.3 });
  H.step(2);
  const coneDef = testDef({ id: 't_dawn_cone', radius: 15, arc: 70, heal: { coef: 1.8 } });
  const cc = ctxFor(q, coneDef, null);
  BEHAVIORS.heal_aoe.begin(cc);
  withRandom(0.5, () => BEHAVIORS.heal_aoe.fire(cc));
  ok('nc51.aoe def.arc < 360 restricts to the cone', front.hp > 1500 && back.hp === 1500, `front=${front.hp} back=${back.hp}`);
  // everybody full: fails unpaid (needInjured), needInjured 0 casts anyway
  front.hp = 5000; back.hp = 5000;
  H.clearEvents();
  ok('nc51.aoe nobody hurt: begin false', BEHAVIORS.heal_aoe.begin(ctxFor(q, coneDef, null)) === false && events['skill:fail'].some((e) => e.reason === 'target'));
  ok('nc51.aoe needInjured 0 always begins', BEHAVIORS.heal_aoe.begin(ctxFor(q, testDef({ id: 't_dawn2', radius: 15, params: { needInjured: 0 } }), null)) === true);
}

// ---- nc51.bolt.*: Işık Oku ---------------------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const foe = addEnemy(0, 10, { hp: 1e6 });
  H.step(2);
  const def = testDef({
    id: 't_bolt', targeting: 'projectile', range: 26, speed: 45, radius: 0.4, count: 1, heal: { coef: 0.4 }, damage: { coef: 1.1, type: 'holy' },
    params: { gain: 2 }, tags: ['spell', 'basic', 'projectile'],
  });
  // enemy only: a damaging bolt
  spyStart();
  BEHAVIORS.heal_bolt.fire(ctxFor(p, def, foe));
  ok('nc51.bolt a bolt with an enemy ahead flies', projectiles().length === 1);
  H.stepSec(1);
  ok('nc51.bolt the bolt damages the enemy it touches', hitsOf('t_bolt').length === 1 && hitsOf('t_bolt')[0].e === foe);
  // aimed ally frame: instant heal, nothing flies
  const ally = addAlly(5, 0, { hpFrac: 0.5 });
  H.step(2);
  const hp0 = ally.hp;
  const hits0 = hitsOf('t_bolt').length;
  const cA = ctxFor(p, def, foe, { aim: { allyId: ally.id } });
  p.resource = 10;
  withRandom(0.5, () => BEHAVIORS.heal_bolt.fire(cA));
  ok('nc51.bolt an aimed ally is healed instantly', near(ally.hp - hp0, healOf(0.4), 1), `healed=${ally.hp - hp0}`);
  ok('nc51.bolt healing an ally launches no damage bolt', projectiles().length === 0);
  H.stepSec(0.5);
  ok('nc51.bolt the ally heal refunds the chain faith', near(p.resource, 12, 0.01) && hitsOf('t_bolt').length === hits0, `res=${p.resource}`);
  spyEnd();
}
{
  // lane test: the first ally standing in the bolt lane is healed, step 3 side bolts fly
  const p = newPaladin();
  const ally = addAlly(0, 12, { hpFrac: 0.5 });
  H.step(2);
  const tri = testDef({
    id: 't_bolt3', targeting: 'projectile', range: 26, speed: 45, radius: 0.4, count: 3, spread: 8, heal: { coef: 0.25 }, damage: { coef: 0.87, type: 'holy' },
    params: { gain: 3 }, tags: ['spell', 'basic', 'projectile'],
  });
  const hp0 = ally.hp;
  p.resource = 10;
  withRandom(0.5, () => BEHAVIORS.heal_bolt.fire(ctxFor(p, tri, null)));
  ok('nc51.bolt step 3: only the bolt that healed pays its faith refund', near(p.resource, 13, 0.01), `res=${p.resource}`);
  ok('nc51.bolt step 3: the centre bolt heals the ally in its lane', near(ally.hp - hp0, healOf(0.25), 1), `healed=${ally.hp - hp0}`);
  ok('nc51.bolt step 3: the two side bolts fly', projectiles().length === 2, `flying=${projectiles().length}`);
  // an enemy in front of the ally takes the bolt instead
  const q = newPaladin();
  const ally2 = addAlly(0, 12, { hpFrac: 0.5 });
  const foe = addEnemy(0, 5, { hp: 1e6 });
  H.step(2);
  const single = testDef({ id: 't_bolt1', targeting: 'projectile', range: 26, speed: 45, radius: 0.4, count: 1, heal: { coef: 0.4 }, damage: { coef: 1, type: 'holy' }, tags: ['spell', 'basic', 'projectile'] });
  const hp1 = ally2.hp;
  BEHAVIORS.heal_bolt.fire(ctxFor(q, single, foe));
  ok('nc51.bolt an enemy nearer than the ally takes the bolt', ally2.hp === hp1 && projectiles().length === 1);
  // a remote ally through the heal channel
  const r = newPaladin();
  const remote = addAlly(0, 8, { hpFrac: 0.5, local: false });
  const net = netStub([remote.id]);
  H.step(2);
  BEHAVIORS.heal_bolt.fire(ctxFor(r, single, null));
  ok('nc51.bolt a remote ally in the lane is healed through the heal channel', net.sent.some((m) => m[1] === 'heal' && m[2].targetId === remote.id));
  G.net = undefined;
}

// ---- nc51.shield.*: İntikamcı Kalkan --------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const A = H.addEnemy(0, 5, { hp: 1e6 });
  const B = H.addEnemy(0, 10, { hp: 1e6 });
  const C = H.addEnemy(3, 14, { hp: 1e6 });
  const D = H.addEnemy(3, 22, { hp: 1e6 });
  A.cast = { skillId: 'fireball', name: 'Ateş Topu', start: 0, duration: 2, channel: false, interruptible: true };
  const locks = new Map();
  A.ai = { setCooldown: (id, s) => locks.set(id, s), cooldownLeft: (id) => locks.get(id) ?? 0, armoredNow: () => false };
  H.step(2);
  H.clearEvents();
  const def = testDef({
    id: 't_shield', targeting: 'target_projectile', homing: 9, range: 30, speed: 22, radius: 0.9, damage: { coef: 2.4, type: 'holy' },
    params: { bounces: 2, bounceRange: 7, bounceMult: 1, silence: 3, lock: 4, tauntDur: 3, bossTauntDur: 2 }, cooldown: 15,
  });
  spyStart();
  BEHAVIORS.avengers_shield.fire(ctxFor(p, def, A));
  H.stepSec(1.5); // the silences last 3 s: check them while they are up
  const hits = hitsOf('t_shield');
  spyEnd();
  ok('nc51.shield hits A, B, C in order (bounces 2)', hits.map((h) => h.e.id).join() === [A, B, C].map((e) => e.id).join(), hits.map((h) => h.e.id).join());
  ok('nc51.shield every leg deals the row coef', hits.every((h) => near(h.coef, 2.4, 1e-9)));
  ok('nc51.shield D (a 4th target) is not reached', !hits.some((h) => h.e === D));
  ok('nc51.shield the taunt lands on the first target only', A.statuses.has('taunt') && !B.statuses.has('taunt') && !C.statuses.has('taunt'));
  ok('nc51.shield silence lands on every target hit', [A, B, C].every((e) => e.statuses.has('silence')) && !D.statuses.has('silence'));
  ok('nc51.shield a running cast is cut', A.cast === null && events['enemy:castEnd'].some((e) => e.enemyId === A.id && e.interrupted));
  ok('nc51.shield the cut ability is locked for `lock` s', (locks.get('fireball') ?? 0) >= 4, `lock=${locks.get('fireball')}`);
  // boss: taunt (short), no silence
  const q = newPaladin();
  const boss = H.addEnemy(0, 6, { hp: 1e6, rank: 'boss' });
  boss.cast = { skillId: 'slam', name: 'Ezme', start: 0, duration: 2, channel: false, interruptible: true };
  H.step(2);
  BEHAVIORS.avengers_shield.fire(ctxFor(q, def, boss));
  H.stepSec(2);
  const tb = boss.statuses.get('taunt');
  ok('nc51.shield boss: short taunt, silence refused by the status rules', !!tb && tb.duration <= 2 && !boss.statuses.has('silence'), `taunt=${tb?.duration}`);
  // tauntFirst 0: every leg taunts
  const r = newPaladin();
  const e1 = H.addEnemy(0, 5, { hp: 1e6 });
  const e2 = H.addEnemy(0, 9, { hp: 1e6 });
  H.step(2);
  BEHAVIORS.avengers_shield.fire(ctxFor(r, { ...def, id: 't_shield2', params: { ...def.params, tauntFirst: 0, silence: 0 } }, e1));
  H.stepSec(1.5);
  ok('nc51.shield tauntFirst 0 taunts every leg, silence 0 silences nobody', e1.statuses.has('taunt') && e2.statuses.has('taunt') && !e1.statuses.has('silence'));
  // client: statuses go to the host as 0-damage hits
  const s = newPaladin();
  const ce = H.addEnemy(0, 5, { hp: 1e6 });
  H.step(2);
  const net = netStub();
  G.net.isAuthority = false;
  BEHAVIORS.avengers_shield.fire(ctxFor(s, { ...def, id: 't_shield3', params: { ...def.params, bounces: 0 } }, ce));
  H.stepSec(2);
  const zero = net.toHost.filter((m) => m[0] === 'hit' && m[1].amount === 0 && m[1].statuses);
  ok('nc51.shield net: a client sends taunt and silence to the host (estatus path)', zero.some((m) => m[1].statuses.some((x) => x.status === 'taunt')) && zero.some((m) => m[1].statuses.some((x) => x.status === 'silence')), `msgs=${zero.length}`);
  G.net = undefined;
}

// ---- nc51.wrath.*: Gazap Çekici ----------------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const t = H.addEnemy(0, 8, { hp: 1e6 });
  H.step(2);
  H.clearEvents();
  const def = testDef({ id: 't_wrath', targeting: 'target_projectile', homing: 9, range: 22, speed: 36, radius: 0.6, damage: { coef: 4, type: 'holy' }, params: { threshold: 0.2 } });
  ok('nc51.wrath full-HP target, no window: begin false', BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, def, t)) === false && events['skill:fail'].some((e) => e.reason === 'target'));
  t.hp = t.maxHp * 0.19;
  const c = ctxFor(p, def, t);
  ok('nc51.wrath target under 20 % HP opens the gate', BEHAVIORS.hammer_of_wrath.begin(c) === true);
  spyStart();
  BEHAVIORS.hammer_of_wrath.fire(c);
  H.stepSec(1.5);
  ok('nc51.wrath the thrown hammer hits the target', hitsOf('t_wrath').length === 1 && hitsOf('t_wrath')[0].e === t);
  spyEnd();
  t.hp = t.maxHp;
  p.statuses.apply('wrath_wings', 20, { magnitude: 0.1, sourceId: p.id });
  ok('nc51.wrath wrath_wings opens the gate at any HP', BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, def, t)) === true);
  p.statuses.remove('wrath_wings');
  p.statuses.apply('exec_window', 5, { sourceId: p.id });
  ok('nc51.wrath the exec_window watcher status opens the gate', STATUSES.exec_window !== undefined && BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, def, t)) === true);
  p.statuses.remove('exec_window');
  ok('nc51.wrath gate shut again after the window', BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, def, t)) === false);
  ok('nc51.wrath no enemy at all: begin false', BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, { ...def, id: 't_wrath2', range: 3 }, null)) === false);
}

// ---- nc51.splash.*: Işık Çekici / İdam Hükmü ----------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const prim = H.addEnemy(0, 2.5, { hp: 1e9 });
  const others = [];
  for (let i = 0; i < 9; i++) others.push(H.addEnemy(-3 + i * 0.75, 4 + (i % 2), { hp: 1e9 }));
  const farAway = H.addEnemy(0, 30, { hp: 1e9 });
  H.step(2);
  const def = testDef({
    id: 't_hol', targeting: 'melee_arc', range: 3.4, arc: 140, damage: { coef: 3.2, type: 'holy' },
    selfStatuses: [{ status: 'hammer_window', duration: 12, stacks: 2 }], params: { splashRadius: 6, splashMax: 7, splashMult: 0.5 },
  });
  spyStart();
  const c = ctxFor(p, def, prim);
  ok('nc51.splash begin finds the primary target', BEHAVIORS.splash_strike.begin(c) === true && c.data.primary === prim);
  BEHAVIORS.splash_strike.fire(c);
  const hits = hitsOf('t_hol');
  spyEnd();
  ok('nc51.splash primary + splashMax others are hit', hits.length === 8 && hits[0].e === prim, `hits=${hits.length}`);
  ok('nc51.splash splash hits carry splashMult', hits.slice(1).every((h) => near(h.more, 0.5, 1e-9)) && hits[0].more === undefined);
  ok('nc51.splash enemies outside the splash radius are untouched', farAway.hp === farAway.maxHp);
  ok('nc51.splash the row selfStatuses land (hammer_window x2)', p.statuses.has('hammer_window') && p.statuses.stacks('hammer_window') === 2, `stacks=${p.statuses.stacks('hammer_window')}`);
  // nobody around: begin fails unpaid
  const q = newPaladin();
  H.clearEvents();
  ok('nc51.splash no target: begin false', BEHAVIORS.splash_strike.begin(ctxFor(q, def, null)) === false && events['skill:fail'].some((e) => e.reason === 'target'));
  // ranged (Execution Sentence): the aimed enemy 18 m away, splash around IT, statuses only on the primary
  const r = newPaladin();
  const far = H.addEnemy(0, 18, { hp: 1e9 });
  const mate = H.addEnemy(2, 19, { hp: 1e9 });
  H.step(2);
  const ex = testDef({ id: 't_exec', targeting: 'target_instant', range: 20, arc: 0, damage: { coef: 3, type: 'holy' }, statuses: [{ status: 'sentenced', duration: 10 }], params: { splashRadius: 10, splashMax: 8, splashMult: 1 } });
  spyStart();
  const ce = ctxFor(r, ex, far);
  BEHAVIORS.splash_strike.begin(ce);
  BEHAVIORS.splash_strike.fire(ce);
  spyEnd();
  ok('nc51.splash ranged: blast on the aimed enemy and its neighbours', hitsOf('t_exec').some((h) => h.e === far) && hitsOf('t_exec').some((h) => h.e === mate));
  ok('nc51.splash statuses stay on the primary (splashStatuses 0)', far.statuses.has('sentenced') && !mate.statuses.has('sentenced'));
}

// ---- nc51.wake.*: Küllerin Uyanışı -------------------------------------------------------------------------------------------------------
{
  const p = newPaladin();
  const demon = H.addEnemy(0, 4, { hp: 1e9 });
  demon.def.family = 'demon';
  const bones = H.addEnemy(1, 6, { hp: 1e9 });
  bones.def.family = 'undead_bone';
  const beast = H.addEnemy(-1, 8, { hp: 1e9 });
  beast.def.family = 'beast';
  const boss = H.addEnemy(0, 10, { hp: 1e9, rank: 'boss' });
  boss.def.family = 'demon';
  const behind = H.addEnemy(0, -4, { hp: 1e9 });
  behind.def.family = 'demon';
  H.step(2);
  p.hp = 1000;
  const def = testDef({
    id: 't_wake', range: 12, arc: 70, damage: { coef: 2.2, type: 'holy' }, statuses: [{ status: 'burn', duration: 9, magnitude: 1 }],
    params: { stunDur: 5, healPct: 0.08, healMax: 3 },
  });
  BEHAVIORS.wake_of_ashes.fire(ctxFor(p, def, null));
  ok('nc51.wake strikes the cone', demon.hp < demon.maxHp && beast.hp < beast.maxHp && boss.hp < boss.maxHp && behind.hp === behind.maxHp);
  ok('nc51.wake the burn rider lands', demon.statuses.has('burn') && beast.statuses.has('burn'));
  ok('nc51.wake stuns demons and the undead', demon.statuses.has('stun') && bones.statuses.has('stun') && !beast.statuses.has('stun'));
  ok('nc51.wake a boss is not stunned', !boss.statuses.has('stun'));
  ok('nc51.wake heals 8 % max HP per enemy hit, max 3 hits', near(p.hp, 1000 + 5000 * 0.08 * 3, 1), `hp=${p.hp}`);
  const lone = newPaladin();
  H.step(2);
  lone.hp = 1000;
  BEHAVIORS.wake_of_ashes.fire(ctxFor(lone, def, null));
  ok('nc51.wake nobody in the cone: no heal, no throw', lone.hp === 1000);
}

// ---- nc51.steed.*: İlahi Binek (end to end: the dash + the speed buff) ---------------------------------------------------------------------
{
  SKILLS.t_steed = testDef({
    id: 't_steed', name: 'Steed', cooldown: 0, castTime: 0, hitTime: 0.1, animSpeed: 1, targeting: 'dash', range: 10, behavior: 'divine_steed',
    selfStatuses: [{ status: 'divine_steed', duration: 3 }], cleanses: ['root', 'slow'], params: { speed: 30, end: 0.2 }, tags: ['movement', 'offgcd'],
  });
  const p = newPaladin();
  const foe = H.addEnemy(0, 5, { hp: 1e9 });
  H.step(2);
  p.statuses.apply('slow', 10, { sourceId: 99 });
  p.statuses.apply('root', 10, { sourceId: 99 });
  const ok1 = G.skills.tryCast(p, 't_steed', H.aimFor(p, foe));
  H.stepSec(0.8);
  ok('nc51.steed the cast starts', ok1 === true);
  ok('nc51.steed dashes ~8 m (0.8 x range) and never homes on the enemy', near(p.position.z, 8, 1.5) && foe.hp === foe.maxHp, `z=${p.position.z.toFixed(2)}`);
  ok('nc51.steed the speed buff lands after the dash', p.statuses.has('divine_steed'));
  ok('nc51.steed roots and slows are removed by the cast', !p.statuses.has('slow') && !p.statuses.has('root'));
  delete SKILLS.t_steed;
}

// ---- nc51.ardent.*: Yılmaz Savunucu ------------------------------------------------------------------------------------------------------
{
  const def = testDef({ id: 't_ardent', targeting: 'self_buff', selfStatuses: [{ status: 'ardent', duration: 10 }], params: { expireHealPct: 0.2 } });
  const selfHeals = (p) => healLog.filter((h) => h.src === p && h.tgt === p && h.amt > 900);
  const p = newPaladin();
  H.step(2);
  healSpyStart();
  BEHAVIORS.ardent_defender.fire(ctxFor(p, def, null));
  ok('nc51.ardent applies the ardent status', p.statuses.has('ardent'));
  H.stepSec(9.5);
  ok('nc51.ardent no heal before the status runs out', selfHeals(p).length === 0);
  H.stepSec(1);
  ok('nc51.ardent unspent: heals 20 % max HP at expiry', selfHeals(p).length === 1 && near(selfHeals(p)[0].amt, 1000, 0.01) && !p.statuses.has('ardent'), JSON.stringify(selfHeals(p).map((h) => h.amt)));
  // spent (a lethal save removed it): no heal
  const q = newPaladin();
  H.step(2);
  healSpyStart();
  BEHAVIORS.ardent_defender.fire(ctxFor(q, def, null));
  H.stepSec(4);
  q.statuses.remove('ardent');
  H.stepSec(8);
  ok('nc51.ardent spent early: no expiry heal', selfHeals(q).length === 0);
  // recast supersedes the pending heal of the first cast: exactly one heal
  const r = newPaladin();
  H.step(2);
  healSpyStart();
  BEHAVIORS.ardent_defender.fire(ctxFor(r, def, null));
  H.stepSec(5);
  BEHAVIORS.ardent_defender.fire(ctxFor(r, def, null));
  H.stepSec(11);
  ok('nc51.ardent a recast leaves exactly one expiry heal', selfHeals(r).length === 1, `heals=${selfHeals(r).length}`);
  healSpyEnd();
}

// ---- nc51.remote: remote replays are visual only, never throw, never touch hp ---------------------------------------------------------------
{
  const p = newPaladin();
  const ally = addAlly(4, 0, { hpFrac: 0.4 });
  const foe = H.addEnemy(0, 4, { hp: 1e6 });
  H.step(2);
  const rows = {
    heal_target: testDef({ id: 't_r1', range: 30, heal: { coef: 2 }, damage: { coef: 2, type: 'holy' }, allyTarget: 'any' }),
    heal_aoe: testDef({ id: 't_r2', radius: 15, heal: { coef: 2 } }),
    heal_bolt: testDef({ id: 't_r3', targeting: 'projectile', range: 26, speed: 45, radius: 0.4, count: 3, spread: 8, heal: { coef: 0.4 }, damage: { coef: 1, type: 'holy' } }),
    avengers_shield: testDef({ id: 't_r4', targeting: 'target_projectile', range: 30, speed: 22, radius: 0.9, damage: { coef: 2.4, type: 'holy' }, params: { bounces: 2, silence: 3 } }),
    hammer_of_wrath: testDef({ id: 't_r5', targeting: 'target_projectile', range: 22, speed: 36, damage: { coef: 4, type: 'holy' } }),
    splash_strike: testDef({ id: 't_r6', range: 3.4, arc: 140, damage: { coef: 3, type: 'holy' } }),
    wake_of_ashes: testDef({ id: 't_r7', range: 12, arc: 70, damage: { coef: 2, type: 'holy' }, params: { stunDur: 5, healPct: 0.08 } }),
    divine_steed: testDef({ id: 't_r8', targeting: 'dash', range: 10, selfStatuses: [{ status: 'divine_steed', duration: 3 }] }),
    ardent_defender: testDef({ id: 't_r9', selfStatuses: [{ status: 'ardent', duration: 10 }], params: { expireHealPct: 0.2 } }),
  };
  const allyHp = ally.hp, foeHp = foe.hp;
  healSpyStart();
  let threw = '';
  for (const [id, def] of Object.entries(rows)) {
    try {
      const c = ctxFor(p, def, foe, { remote: true, aim: { allyId: ally.id } });
      BEHAVIORS[id].begin?.call(BEHAVIORS[id], c);
      BEHAVIORS[id].fire(c);
    } catch (e) {
      threw += `${id}: ${e?.message ?? e}; `;
    }
  }
  H.stepSec(3);
  ok('nc51.remote no behaviour throws on a remote replay', threw === '', threw);
  const healCalls = healLog.length;
  healSpyEnd();
  ok('nc51.remote no heals and no damage (ally, enemy)', healCalls === 0 && ally.hp === allyHp && foe.hp === foeHp, `heals=${healCalls} ally=${ally.hp} foe=${foe.hp}`);
  ok('nc51.remote no statuses are applied to the caster or the enemy', !p.statuses.has('ardent') && !p.statuses.has('divine_steed') && !foe.statuses.has('silence') && !foe.statuses.has('stun'));
}

// ---- errors from the run: none expected from the new code -------------------------------------------------------------------------------
ok('nc51.errors no console errors from the paladin behaviours', errors.filter((e) => /paladin|behaviors|heal_|avengers|splash|wake_of|steed|ardent|SkillSystem|healing/i.test(e)).length === 0, errors.slice(0, 3).join(' | '));

console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);

function addEnemy(x, z, opts) { return H.addEnemy(x, z, opts); }
