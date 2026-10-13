// KIT PLATE · PM-00b checks (docs/kits/plate-melee.md §g needs 1-8, 11, 12) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_plate.mjs
// Covered: pm00b.rune, pm00b.consume, pm00b.recent, pm00b.multi_strike, pm00b.rider, pm00b.cdmult, pm00b.anger, pm00b.how,
//          pm00b.gain, pm00b.store, pm00b.grip, pm00b.defs. The hit-stop count is not measured here (feel is browser-side).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { TALENT_PIPS } = await H.imp('data/specs_talents.ts');
const { STATUS_RULES, STATUSES } = await H.imp('data/statuses.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { cleaveRidersOf, cdMultFor } = await H.imp('combat/procMods.ts');
const { onSpend } = await H.imp('combat/specials.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// a minimal CastCtx for behaviours called directly (the real one is built by SkillSystem.makeCtx)
function ctxFor(p, def, target = null) {
  return {
    sys: G.skills, caster: p, def, aim: H.aimFor(p, target), dir: [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: false, action: null, target, point: [p.position.x, p.position.z], data: {}, more: 1,
  };
}
const testDef = (over = {}) => ({
  id: 'test_plate', tags: ['melee'], targeting: 'melee_arc', range: 4, arc: 120, cooldown: 0, cost: 0,
  damage: { coef: 1, type: 'physical' }, params: {}, statuses: [], ...over,
});

// ---- pm00b.defs: rows and behaviours are in place
{
  for (const id of ['multi_strike', 'grip', 'divine_toll', 'shield_block', 'heal_self_recent']) {
    ok(`pm00b.defs behaviour ${id} installed`, typeof BEHAVIORS[id]?.fire === 'function');
  }
  ok('pm00b.defs rune pip max 6, regen every 10 s', TALENT_PIPS.rune?.max === 6 && TALENT_PIPS.rune?.regen?.every === 10);
  ok('pm00b.defs bone_armor consumeOnHit icd 2.5', STATUS_RULES.bone_armor?.consumeOnHit?.icd === 2.5);
  ok('pm00b.defs colossus takenMoreFromSource 0.3', STATUS_RULES.colossus?.takenMoreFromSource === 0.3);
  ok('pm00b.defs sweeping rider 2 targets x0.6', STATUS_RULES.sweeping?.extraTargets === 2 && STATUS_RULES.sweeping?.extraMult === 0.6);
  ok('pm00b.defs ursoc_form cdMult x0.5', STATUS_RULES.ursoc_form?.cdMult?.mult === 0.5);
  ok('pm00b.defs statuses resolve', !!STATUSES.shield_block && !!STATUSES.bone_armor);
}

// ---- pm00b.rune: every spent rune is back 10 s after it was spent (parallel timers, PM-NE), capped at 6 (Death Knight)
{
  const p = H.addPlayer('necromancer');
  G.skills.addPip(p, 'rune', 6);
  G.skills.spendPip(p, 'rune', 6);
  H.stepSec(0.5);
  ok('pm00b.rune starts at 0 after spending 6', G.skills.pipCount(p, 'rune') === 0, `n=${G.skills.pipCount(p, 'rune')}`);
  H.stepSec(9);
  ok('pm00b.rune nothing back before 10 s', G.skills.pipCount(p, 'rune') === 0, `n=${G.skills.pipCount(p, 'rune')}`);
  H.stepSec(1.5);
  ok('pm00b.rune all 6 spent runes are back after 10 s (parallel timers)', G.skills.pipCount(p, 'rune') === 6, `n=${G.skills.pipCount(p, 'rune')}`);
  H.stepSec(30);
  ok('pm00b.rune caps at 6', G.skills.pipCount(p, 'rune') === 6, `n=${G.skills.pipCount(p, 'rune')}`);
  G.skills.spendPip(p, 'rune', 2);
  H.stepSec(5);
  G.skills.spendPip(p, 'rune', 2);
  H.stepSec(5.3);
  ok('pm00b.rune each rune has its own timer (2 back 10 s after the first spend, 2 still recharging)', G.skills.pipCount(p, 'rune') === 4, `n=${G.skills.pipCount(p, 'rune')}`);
  H.stepSec(5);
  ok('pm00b.rune the second pair follows 5 s later', G.skills.pipCount(p, 'rune') === 6, `n=${G.skills.pipCount(p, 'rune')}`);
}

// ---- pm00b.recent: damage taken within 5 s equals what landed
{
  const p = H.addPlayer('knight');
  const before = p.hp;
  G.combat.hitLocalPlayer({ sourceId: null, amount: 300, type: 'physical', unavoidable: true, ignoreIframes: true, blockable: false });
  const landed = before - p.hp;
  ok('pm00b.recent damageTakenWithin(5) equals damage landed', landed > 0 && G.combat.damageTakenWithin(p, 5) === landed,
    `landed=${landed} recent=${G.combat.damageTakenWithin(p, 5)}`);
  H.stepSec(9);
  ok('pm00b.recent entries age out after 8 s', G.combat.damageTakenWithin(p, 5) === 0);
}

// ---- pm00b.consume: Kemik Zırhı loses one stack per melee hit, never faster than 2.5 s
{
  const p = H.addPlayer('necromancer');
  p.statuses.apply('bone_armor', 30, { stacks: 5 });
  const hit = () => G.combat.hitLocalPlayer({ sourceId: null, amount: 20, type: 'physical', melee: true, unavoidable: true, blockable: false, ignoreIframes: true });
  hit(); H.stepSec(0.1); hit(); H.stepSec(0.1); hit();
  ok('pm00b.consume three hits within the ICD remove one stack only', p.statuses.stacks('bone_armor') === 4, `stacks=${p.statuses.stacks('bone_armor')}`);
  H.stepSec(2.5);
  hit();
  ok('pm00b.consume next hit after the ICD removes another stack', p.statuses.stacks('bone_armor') === 3, `stacks=${p.statuses.stacks('bone_armor')}`);
  const r0 = p.statuses.stacks('bone_armor');
  G.combat.hitLocalPlayer({ sourceId: null, amount: 20, type: 'physical', unavoidable: true, blockable: false, ignoreIframes: true });
  ok('pm00b.consume a non-melee hit does not consume', p.statuses.stacks('bone_armor') === r0, `stacks=${r0}`);
}

// ---- pm00b.multi_strike: 4 hits 0.17 s apart on one target
{
  const p = H.addPlayer('barbarian');
  const e = H.addEnemy(0, 2.5);
  p.yaw = 0;
  H.step(2);
  const t0 = G.engine.time;
  H.clearEvents();
  const hp0 = e.hp;
  const times = [];
  const orig = G.combat.playerHitEnemy.bind(G.combat);
  G.combat.playerHitEnemy = (a, t, sp) => { times.push(G.engine.time - t0); return orig(a, t, sp); };
  BEHAVIORS.multi_strike.fire(ctxFor(p, testDef({ params: { hits: 4, gap: 0.17 } }), e));
  H.stepSec(1);
  G.combat.playerHitEnemy = orig;
  ok('pm00b.multi_strike lands four hits', times.length === 4, `hits=${times.length}`);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  ok('pm00b.multi_strike hits are ~0.17 s apart', gaps.every((g) => near(g, 0.17, 0.04)), gaps.map((g) => g.toFixed(3)).join(','));
  ok('pm00b.multi_strike deals damage to the target', e.hp < hp0);
}

// ---- pm00b.rider: Süpürme (sweeping) hits 2 extra targets; the stack is consumed by the cast
{
  const p = H.addPlayer('barbarian');
  p.statuses.apply('sweeping', 6, { stacks: 1 });
  const a = H.addEnemy(0, 2.2, { hp: 1e6 });
  const b = H.addEnemy(1.2, 2.6, { hp: 1e6 });
  const c2 = H.addEnemy(-1.2, 2.6, { hp: 1e6 });
  const d = H.addEnemy(0, 9, { hp: 1e6 });
  p.yaw = 0;
  H.step(2);
  const riders = cleaveRidersOf(p.statuses);
  ok('pm00b.rider cleaveRidersOf sees sweeping (2, x0.6)', riders[0]?.extraTargets === 2 && riders[0]?.extraMult === 0.6);
  const before = [a, b, c2, d].map((x) => x.hp);
  // the rider is spent by the cast it starts (SkillSystem.pay); the direct call above does not go through pay, so spend it here
  const rc = ctxFor(p, testDef({ params: { hits: 1 } }), a);
  rc.data.rider = riders[0];
  p.statuses.consumeStack('sweeping');
  BEHAVIORS.multi_strike.fire(rc);
  H.stepSec(0.5);
  const hit = [a, b, c2, d].map((x, i) => x.hp < before[i]);
  ok('pm00b.rider primary and two nearest extra enemies are hit', hit[0] && hit[1] && hit[2], hit.join(','));
  ok('pm00b.rider the 9 m enemy is not hit', !hit[3]);
  ok('pm00b.rider stack consumed by the cast', !p.statuses.has('sweeping'));
}

// ---- pm00b.cdmult: ursoc_form halves Yarma (barbarian_cleave) cooldown
{
  const p = H.addPlayer('barbarian');
  // barbarian_cleave has no base cooldown in SKILLS: a stand-in row with the same id carries the rider's cooldown
  const def = { id: 'barbarian_cleave', cooldown: 6, tags: [], params: {} };
  const base = G.skills.cooldownOf(p, def);
  p.statuses.apply('ursoc_form', 20);
  const cut = G.skills.cooldownOf(p, def);
  ok('pm00b.cdmult ursoc_form halves barbarian_cleave cooldown', near(cut, base * 0.5, 1e-6) && base > 0, `base=${base.toFixed(2)} cut=${cut.toFixed(2)}`);
  ok('pm00b.cdmult cdMultFor reads the rider', cdMultFor(p.statuses, 'barbarian_cleave') === 0.5 && cdMultFor(p.statuses, 'barbarian_provoke') === 1);
}

// ---- pm00b.anger: 100 rage spent -> m45 remaining -5 s (Anger Management, angerPer 20)
{
  const spec = SPECS.barbarian_warlord;
  const had = spec.specials?.some((x) => x.id === 'trait_anger');
  if (!had) spec.specials = [...(spec.specials ?? []), { id: 'trait_anger', desc: 'sim', params: { angerPer: 20 } }];
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  G.character.save.skillBar.m45 = 'barbarian_leap';
  const def = SKILLS.barbarian_leap;
  G.skills.startCooldown(p, G.skills.state(p), def);
  const before = G.skills.getCooldown(p, 'barbarian_leap').remaining;
  onSpend(G.skills, p, 'rage', 100);
  const after = G.skills.getCooldown(p, 'barbarian_leap').remaining;
  ok('pm00b.anger 100 rage spent cuts m45 by 5 s', near(before - after, 5, 0.05), `cut=${(before - after).toFixed(2)}`);
  onSpend(G.skills, p, 'faith', 100);
  ok('pm00b.anger faith spend does not count', near(G.skills.getCooldown(p, 'barbarian_leap').remaining, after, 1e-6));
  if (!had) spec.specials = spec.specials.filter((x) => x.id !== 'trait_anger');
}

// ---- pm00b.how: exec_window on below 20 % target HP, off at 21 %
{
  const p = H.addPlayer('knight');
  const e = H.addEnemy(0, 3, { hp: 1000 });
  H.setAimTarget(e);
  p.targetId = e.id;
  e.hp = 190; // 19 % of 1000 (maxHp is 100000 by default: set it)
  e.maxHp = 1000;
  H.stepSec(0.6);
  const on = p.statuses.has('exec_window');
  e.hp = 210;
  H.stepSec(0.6);
  const off = !p.statuses.has('exec_window');
  H.setAimTarget(null);
  p.targetId = null;
  ok('pm00b.how exec_window on at 19 %', on);
  ok('pm00b.how exec_window off at 21 %', off);
}

// ---- pm00b.gain: flat ability gain per target (Çelik Girdap +2 x 8 max), chain steps scaled by resourceGainPct
{
  const p = H.addPlayer('barbarian');
  p.resource = 50;
  const fake = (n) => Array.from({ length: n }, () => ({ amount: 1 }));
  G.skills.afterHits({ caster: p, def: testDef({ params: { gainPerTarget: 2, gainPerTargetMax: 8 } }), data: {}, remote: false, more: 1 }, fake(10));
  ok('pm00b.gain ability: +2 per target, max 8 targets (+16)', near(p.resource, 66, 1e-6), `r=${p.resource}`);
  p.resource = 50;
  G.skills.afterHits({ caster: p, def: testDef({ tags: ['basic', 'melee'], params: { gainPerTarget: 1, gainPerTargetMax: 4 } }), data: {}, remote: false, more: 1 }, fake(3));
  ok('pm00b.gain chain step: +1 per target (3 targets, +3)', near(p.resource, 53, 1e-6), `r=${p.resource}`);
}

// ---- pm00b.store: Kalkan Kaldır stores 15 % of blocked damage, releases it flat when the status ends (no rage per block)
{
  const p = H.addPlayer('knight');
  const e = H.addEnemy(0, 2, { hp: 1e6 });
  e.stats = { armor: 0 };
  p.yaw = 0;
  H.step(2);
  p.resource = 0;
  const ctx = ctxFor(p, testDef({ id: 'knight_shield_block', params: { store: 0.15, storeCap: 10, dur: 6 }, targeting: 'self_buff', tags: [] }));
  BEHAVIORS.shield_block.fire(ctx);
  ok('pm00b.store shield_block status applied', p.statuses.has('shield_block'));
  G.skills.onBlocked(p, 200, false);
  ok('pm00b.store no rage from the block', p.resource === 0, `r=${p.resource}`);
  // the released flat value (30 = 200 x 0.15, cap 3000); rollOutgoing then scales flat by main stat like every flat hit
  const flats = [];
  const origStrike = G.skills.strike.bind(G.skills);
  G.skills.strike = (c, t, o = {}) => { if (o.flat !== undefined) flats.push(o.flat); return origStrike(c, t, o); };
  p.statuses.remove('shield_block');
  G.skills.strike = origStrike;
  ok('pm00b.store 200 blocked releases 30 flat damage', flats.length >= 1 && near(flats[0], 30, 1e-6), `flat=${flats.join(',')}`);
}

// ---- pm00b.grip: non-boss pulled to 3 m, boss taunted only
{
  const p = H.addPlayer('knight');
  p.yaw = 0;
  const n = H.addEnemy(0, 10, { rank: 'trash' });
  const b = H.addEnemy(4, 10, { rank: 'boss' });
  H.step(2);
  BEHAVIORS.grip.fire(ctxFor(p, testDef({ params: { pullTo: 3 }, range: 25 }), n));
  H.stepSec(1.5);
  const dn = Math.hypot(n.position.x - p.position.x, n.position.z - p.position.z);
  ok('pm00b.grip non-boss ends ~3 m from the caster', dn <= 3.4 && dn >= 2.6, `d=${dn.toFixed(2)}`);
  const bx = b.position.x, bz = b.position.z;
  BEHAVIORS.grip.fire(ctxFor(p, testDef({ params: { pullTo: 3 }, range: 25 }), b));
  H.stepSec(1.5);
  ok('pm00b.grip boss is taunted and not moved', b.statuses.has('taunt') && near(b.position.x, bx, 1e-3) && near(b.position.z, bz, 1e-3));
}

console.log(fails === 0 ? '\nkit.plate (pm00b): all checks PASS' : `\nkit.plate (pm00b): ${fails} FAIL`);
if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
