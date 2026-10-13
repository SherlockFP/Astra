// KIT PM-KN checks (docs/kits/plate-melee.md §1, §2, f1a, f3, §g) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_knight.mjs
// Covered: pmkn.ids, pmkn.apl, pmkn.cd, pmkn.res, pmkn.coef, pmkn.procs, pmkn.anger, pmkn.block, pmkn.gain, pmkn.mods, pmkn.dropped,
//          pmkn.fx (spec fx triggers, incl. parry -> revenge_ready), pmkn.exec, pmkn.stack, pmkn.bash, pmkn.sweep, pmkn.revenge, pmkn.avatar.
// Not covered here (browser / SimBench): pmkn.ledger (60 s APL rage budget), pmkn.mit (Kalkan Kaldır uptime), hit-stop and VFX feel.
import * as H from './harness.mjs';

const { G, SKILLS } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_KNIGHT } = await H.imp('data/rotations_kit_knight.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { PROC_DEFS, getProcDef } = await H.imp('data/procs.ts');
const { resolveProcMods } = await H.imp('combat/procMods.ts');
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { onSpend } = await H.imp('combat/specials.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const K = (id) => SKILLS[id];
const view = (...ids) => ({ has: (s) => ids.includes(s), stacks: (s) => (ids.includes(s) ? 1 : 0) });

// a minimal CastCtx for behaviours called directly (SkillSystem.makeCtx builds the real one)
function ctxFor(p, def, target = null) {
  return {
    sys: G.skills, caster: p, def, aim: H.aimFor(p, target), dir: [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: false, action: null, target, point: [p.position.x, p.position.z], data: {}, more: 1,
  };
}

const ARMS = SPECS.knight_blademaster;
const PROT = SPECS.knight_protector;

// ---- pmkn.ids: spec lists, majors and both default bars resolve
for (const spec of [ARMS, PROT]) {
  const ids = [...spec.skills, ...Object.values(spec.defaultBar), ...Object.values(spec.majors), ...spec.mods.map((m) => m.skill)];
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`pmkn.ids ${spec.id} ids resolve`, missing.length === 0, missing.join(','));
  ok(`pmkn.ids ${spec.id} bar has at most 12 slots`, Object.keys(spec.defaultBar).length <= 12);
  const bar = Object.values(spec.defaultBar);
  ok(`pmkn.ids ${spec.id} bar has no duplicate skill`, new Set(bar).size === bar.length);
}
ok('pmkn.ids protector majors m45 challenge / m90 avatar / m180 bastion', PROT.majors.m45 === 'knight_challenge' && PROT.majors.m90 === 'knight_avatar' && PROT.majors.m180 === 'knight_unbroken_bastion');
ok('pmkn.ids blademaster majors m45 colossus / m90 avatar / m180 bladestorm', ARMS.majors.m45 === 'knight_colossus_smash' && ARMS.majors.m90 === 'knight_avatar' && ARMS.majors.m180 === 'knight_bladestorm');

// ---- pmkn.apl: skill and status names in the APL rows resolve
for (const sid of ['knight_blademaster', 'knight_protector']) {
  const apl = ROTATIONS_KIT_KNIGHT[sid];
  ok(`pmkn.apl ${sid} rows exist`, !!apl && apl.st.length > 0 && (apl.aoe?.length ?? 0) > 0);
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(knight_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`pmkn.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`pmkn.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
}

// ---- pmkn.status: every status a knight row applies has a StatusDef
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'knight') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  }
  for (const id of ['knight_charge', 'knight_avatar']) {
    for (const s of K(id)?.statuses ?? []) applied.add(s.status);
  }
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('pmkn.status every knight-applied status has a def', missing.length === 0, missing.join(','));
}

// ---- pmkn.cd: cooldowns of the kit tables (§1a / §2a)
ok('pmkn.cd mortal_strike 6 s', K('knight_mortal_strike').cooldown === 6);
ok('pmkn.cd shield_bash 9 s', K('knight_shield_bash').cooldown === 9);
ok('pmkn.cd colossus_smash 45 s', K('knight_colossus_smash').cooldown === 45);
ok('pmkn.cd avatar 90 s', K('knight_avatar').cooldown === 90);
ok('pmkn.cd bladestorm 180 s', K('knight_bladestorm').cooldown === 180);
ok('pmkn.cd bastion 180 s', K('knight_unbroken_bastion').cooldown === 180);
ok('pmkn.cd overpower 12 s, 2 charges', K('knight_overpower').cooldown === 12 && K('knight_overpower').charges === 2);
ok('pmkn.cd shield_block 9 s, 2 charges', K('knight_shield_block').cooldown === 9 && K('knight_shield_block').charges === 2);
ok('pmkn.cd thunder_clap 6 s', K('knight_thunder_clap').cooldown === 6);
ok('pmkn.cd die_by_sword 120 s', K('knight_die_by_sword').cooldown === 120);
ok('pmkn.cd challenge 45 s (protector m45)', K('knight_challenge').cooldown === 45);
ok('pmkn.cd charge base 20 s, protector patch 45 s', K('knight_charge').cooldown === 20
  && PROT.mods.find((m) => m.skill === 'knight_charge')?.patch?.cooldown === 45);

// ---- pmkn.res: resource cost (negative = generates, SkillDef.cost)
ok('pmkn.res mortal_strike costs 25', K('knight_mortal_strike').cost === 25);
ok('pmkn.res execute costs 25 (0 with sudden_death, ProcMod)', K('knight_execute').cost === 25);
ok('pmkn.res rend costs 15', K('knight_rend').cost === 15);
ok('pmkn.res shield_bash generates 15', K('knight_shield_bash').cost === -15);
ok('pmkn.res charge generates 20', K('knight_charge').cost === -20);
ok('pmkn.res thunder_clap generates 5', K('knight_thunder_clap').cost === -5);
ok('pmkn.res challenge generates 15', K('knight_challenge').cost === -15);
ok('pmkn.res shield_block costs 30', K('knight_shield_block').cost === 30);
ok('pmkn.res revenge costs 20 (0 with revenge_ready)', K('knight_revenge').cost === 20);
ok('pmkn.res radiant_cleave costs 20 and refunds 2 x 8', K('knight_radiant_cleave').cost === 20
  && K('knight_radiant_cleave').params.gainPerTarget === 2 && K('knight_radiant_cleave').params.gainPerTargetMax === 8);
ok('pmkn.res colossus_smash free, +5 x 4', K('knight_colossus_smash').cost === 0
  && K('knight_colossus_smash').params.gainPerTarget === 5 && K('knight_colossus_smash').params.gainPerTargetMax === 4);

// ---- pmkn.coef: damage coefficients (sum of the weapon chain 2.50, §1a / §2a)
{
  const basic = ['knight_basic_1', 'knight_basic_2', 'knight_basic_3', 'knight_basic_4'].reduce((s, id) => s + K(id).damage.coef, 0);
  ok('pmkn.coef weapon chain sums to 2.50', near(basic, 2.5, 1e-9), `sum=${basic}`);
}
ok('pmkn.coef shield_bash 3.0', K('knight_shield_bash').damage.coef === 3.0);
ok('pmkn.coef mortal_strike 3.4', K('knight_mortal_strike').damage.coef === 3.4);
ok('pmkn.coef execute 4.4', K('knight_execute').damage.coef === 4.4);
ok('pmkn.coef overpower 2.2', K('knight_overpower').damage.coef === 2.2);
ok('pmkn.coef revenge 2.0 per target', K('knight_revenge').damage.coef === 2.0);
ok('pmkn.coef radiant_cleave 2.0 per target', K('knight_radiant_cleave').damage.coef === 2.0);
ok('pmkn.coef colossus_smash 2.4 AoE', K('knight_colossus_smash').damage.coef === 2.4);
ok('pmkn.coef charge 1.0 (protector patch 1.6)', K('knight_charge').damage.coef === 1.0
  && PROT.mods.find((m) => m.skill === 'knight_charge').patch.damage.coef === 1.6);
ok('pmkn.coef bladestorm 0.9 per tick x 8 ticks', K('knight_bladestorm').damage.coef === 0.9 && K('knight_bladestorm').ticks === 8);
{
  const rend = K('knight_rend').statuses.find((s) => s.status === 'rend');
  ok('pmkn.coef rend DoT totals 2.4 over 15 s', rend && near(rend.magnitude * rend.duration, 2.4, 1e-6), `total=${rend && rend.magnitude * rend.duration}`);
  const tc = K('knight_thunder_clap').statuses.find((s) => s.status === 'rend');
  ok('pmkn.coef thunder_clap rend DoT totals 1.2', tc && near(tc.magnitude * tc.duration, 1.2, 1e-6));
}

// ---- pmkn.procs: the ProcDefs and ProcMods of the kit
{
  ok('pmkn.procs sudden_death ProcDef glows execute and barbarian_execute', getProcDef('sudden_death')?.glow.join() === 'knight_execute,barbarian_execute');
  ok('pmkn.procs battlelord ProcDef glows overpower on the right', getProcDef('battlelord')?.overlay === 'right' && getProcDef('battlelord')?.glow.join() === 'knight_overpower');
  ok('pmkn.procs revenge_ready ProcDef glows revenge, both sides', getProcDef('revenge_ready')?.overlay === 'both' && getProcDef('revenge_ready')?.glow.join() === 'knight_revenge');
  ok('pmkn.procs ProcDef ids unique', new Set(PROC_DEFS.map((d) => d.id)).size === PROC_DEFS.length);
  for (const id of ['sudden_death', 'battlelord', 'revenge_ready', 'sweeping']) {
    const glow = getProcDef(id)?.glow ?? [];
    const bad = glow.filter((g) => !SKILLS[g]);
    ok(`pmkn.procs ${id} glow ids resolve`, bad.length === 0, bad.join(','));
  }
  const ex = resolveProcMods(view('sudden_death'), 'knight_execute');
  ok('pmkn.procs sudden_death: execute costs 0, usable at any HP', !!ex && ex.costMult === 0 && ex.anyHp && ex.more === 1.15 && ex.sources.join() === 'sudden_death');
  const ex2 = resolveProcMods(view('sudden_death'), 'barbarian_execute');
  ok('pmkn.procs sudden_death shared with barbarian_execute', !!ex2 && ex2.costMult === 0 && ex2.anyHp);
  const ov = resolveProcMods(view('battlelord'), 'knight_overpower');
  ok('pmkn.procs battlelord: overpower free and does not start its cooldown', !!ov && ov.costMult === 0 && ov.cdFree && ov.sources.join() === 'battlelord');
  const rv = resolveProcMods(view('revenge_ready'), 'knight_revenge');
  ok('pmkn.procs revenge_ready: revenge costs 0, +25 %', !!rv && rv.costMult === 0 && rv.more === 1.25);
  ok('pmkn.procs revenge_ready no longer applies to shield_bash', resolveProcMods(view('revenge_ready'), 'knight_shield_bash') === null);
  ok('pmkn.procs no mod for an unrelated skill', resolveProcMods(view('sudden_death'), 'knight_mortal_strike') === null);
}

// ---- pmkn.anger: spent rage cuts the m45 major (Anger Management, angerPer 20) for both specs
for (const [specId, slotSkill] of [['knight_blademaster', 'knight_colossus_smash'], ['knight_protector', 'knight_challenge']]) {
  const p = H.addPlayer('knight');
  p.spec = specId;
  G.character.save.skillBar.m45 = slotSkill;
  G.skills.startCooldown(p, G.skills.state(p), SKILLS[slotSkill]);
  const before = G.skills.getCooldown(p, slotSkill).remaining;
  onSpend(G.skills, p, 'rage', 100);
  const after = G.skills.getCooldown(p, slotSkill).remaining;
  ok(`pmkn.anger ${specId}: 100 rage cuts ${slotSkill} by 5 s`, near(before - after, 5, 0.05), `cut=${(before - after).toFixed(2)}`);
}

// ---- pmkn.block: Kalkan Kaldır row wires the shield_block behaviour; 15 % of the blocked damage is released flat
{
  const row = K('knight_shield_block');
  ok('pmkn.block row behaviour shield_block installed', row.behavior === 'shield_block' && typeof BEHAVIORS.shield_block?.fire === 'function');
  ok('pmkn.block row params store 0.15, storeCap 10, no rage per block', row.params.store === 0.15 && row.params.storeCap === 10 && row.params.gainPerBlock === 0);
  const p = H.addPlayer('knight');
  p.spec = 'knight_protector';
  const e = H.addEnemy(0, 2, { hp: 1e6 });
  e.stats = { armor: 0 };
  p.yaw = 0;
  H.step(2);
  p.resource = 0;
  BEHAVIORS.shield_block.fire(ctxFor(p, row));
  ok('pmkn.block status applied by the row', p.statuses.has('shield_block'));
  G.skills.onBlocked(p, 200, false);
  ok('pmkn.block blocked damage gives no rage', p.resource === 0, `r=${p.resource}`);
  const flats = [];
  const origStrike = G.skills.strike.bind(G.skills);
  G.skills.strike = (c, t, o = {}) => { if (o.flat !== undefined) flats.push(o.flat); return origStrike(c, t, o); };
  p.statuses.remove('shield_block');
  G.skills.strike = origStrike;
  ok('pmkn.block 200 blocked releases 30 flat damage', flats.length >= 1 && near(flats[0], 30, 1e-6), `flat=${flats.join(',')}`);
}

// ---- pmkn.gain: per-target gains through the real afterHits path (flat abilities, chain steps)
{
  const p = H.addPlayer('knight');
  p.spec = 'knight_blademaster';
  const fake = (n) => Array.from({ length: n }, () => ({ amount: 1 }));
  p.resource = 0;
  G.skills.afterHits({ caster: p, def: K('knight_colossus_smash'), data: {}, remote: false, more: 1 }, fake(10));
  ok('pmkn.gain colossus_smash +5 per target, max 4 targets (+20)', near(p.resource, 20, 1e-6), `r=${p.resource}`);
  p.resource = 0;
  G.skills.afterHits({ caster: p, def: K('knight_radiant_cleave'), data: {}, remote: false, more: 1 }, fake(10));
  ok('pmkn.gain radiant_cleave +2 per target, max 8 targets (+16)', near(p.resource, 16, 1e-6), `r=${p.resource}`);
  p.resource = 0;
  G.skills.afterHits({ caster: p, def: K('knight_basic_1'), data: {}, remote: false, more: 1 }, fake(3));
  ok('pmkn.gain basic_1 flat 4 + 1 per extra target hit (3 targets: 4 + 2 = 6)', near(p.resource, 6, 1e-6), `r=${p.resource}`);
  p.resource = 0;
  G.skills.afterHits({ caster: p, def: K('knight_basic_1'), data: {}, remote: false, more: 1 }, fake(1));
  ok('pmkn.gain basic_1 on one target gets no per-target gain (4)', near(p.resource, 4, 1e-6), `r=${p.resource}`);
}

// ---- pmkn.mods: spec patches that change the base rows
{
  const basicMods = PROT.mods.filter((m) => /^knight_basic_\d$/.test(m.skill));
  ok('pmkn.mods protector: basic chain has no per-target gain', basicMods.length === 4 && basicMods.every((m) => m.params?.gainPerTarget === 0));
  const shieldMod = PROT.mods.find((m) => m.skill === 'knight_shield_bash');
  ok('pmkn.mods protector: shield_bash threat 300', shieldMod?.params?.threat === 300);
  const charge = PROT.mods.find((m) => m.skill === 'knight_charge').patch;
  ok('pmkn.mods protector charge: stun 1.5 s, revenge_ready on landing, r 3', charge.statuses?.[0]?.status === 'stun'
    && charge.statuses[0].duration === 1.5 && charge.selfStatuses?.[0]?.status === 'revenge_ready' && charge.radius === 3);
  ok('pmkn.mods blademaster has no mods', ARMS.mods.length === 0);
  ok('pmkn.mods bastion: 8 s, no heal, no major-180 param', K('knight_unbroken_bastion').selfStatuses[0].duration === 8
    && K('knight_unbroken_bastion').params.healPct === 0 && K('knight_unbroken_bastion').params.major === undefined);
  ok('pmkn.mods avatar: +20 % damage, 20 s', K('knight_avatar').selfStatuses[0].status === 'avatar'
    && K('knight_avatar').selfStatuses[0].duration === 20 && K('knight_avatar').selfStatuses[0].magnitude === 0.2);
  ok('pmkn.mods interrupt row is knight_pummel with behaviour interrupt', K('knight_pummel').behavior === 'interrupt' && typeof BEHAVIORS.interrupt?.fire === 'function');
}

// ---- pmkn.dropped: retired ids keep their rows but have no slot and sit in no spec list or bar
{
  const retired = ['knight_zeal', 'knight_wings_of_judgment', 'knight_heroism_call', 'knight_oath_aegis', 'knight_consecration',
    'knight_shield_wall', 'knight_heavens_judgment', 'knight_war_banner', 'knight_templar_verdict', 'knight_wake_of_flames'];
  const slotted = retired.filter((id) => K(id)?.defaultSlot);
  ok('pmkn.dropped retired rows have no defaultSlot', slotted.length === 0, slotted.join(','));
  const inUse = retired.filter((id) => [ARMS, PROT].some((s) => Object.values(s.defaultBar).includes(id) || s.skills.includes(id)));
  ok('pmkn.dropped retired rows are in no spec list or bar', inUse.length === 0, inUse.join(','));
  ok('pmkn.dropped every retired row still resolves (saved bars, talent nodes)', retired.every((id) => !!SKILLS[id]));
}

// ---- pmkn.fix: the plate-melee gap list (spec fx triggers, execute gate, one-stack Ani Ölüm, shield_block x1.3, sweeping,
// revenge threat / cap, Avatar cleanse). The live ProcEngine is not built by the harness: the spec rows are folded the way
// StatCalc.collectFx folds them (parseFx -> collectProcs), so this exercises the same entries the game registers.
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { parseFx } = await H.imp('data/talentTrees/fx.ts');
const tagsOf = (id) => SKILLS[id].tags;

// 1. spec fx triggers proc: Ani Ölüm (weapon chain hit), Savaş Efendisi (Ölümcül Darbe hit), İntikam Hazır (block, parry)
{
  ok('pmkn.fx blademaster fx parses without errors', parseFx(ARMS.fx).errors.length === 0, parseFx(ARMS.fx).errors.join(' | '));
  ok('pmkn.fx protector fx parses without errors', parseFx(PROT.fx).errors.length === 0, parseFx(PROT.fx).errors.join(' | '));
  const eng = new ProcEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(ARMS.fx).items, 'spec:knight_blademaster'));
  const p = H.addPlayer('knight');
  p.spec = 'knight_blademaster';
  let sdMax = 0;
  for (let i = 0; i < 80; i++) {
    eng.update(3.2); // Ani Ölüm icd 3 s
    eng.emit('hit', { player: p, skillId: 'knight_basic_1', tags: tagsOf('knight_basic_1') });
    sdMax = Math.max(sdMax, p.statuses.stacks('sudden_death'));
  }
  ok('pmkn.fx Ani Ölüm procs from a weapon chain hit (10 %, PRD)', sdMax >= 1, `max stacks=${sdMax}`);
  ok('pmkn.fx Ani Ölüm caps at 2 stacks', sdMax <= 2, `max stacks=${sdMax}`);
  p.statuses.remove('sudden_death');
  for (let i = 0; i < 40; i++) eng.emit('hit', { player: p, skillId: 'knight_rend', tags: tagsOf('knight_rend') });
  ok('pmkn.fx Ani Ölüm ignores non-chain skills', !p.statuses.has('sudden_death'));
  let bl = false;
  for (let i = 0; i < 60 && !bl; i++) {
    eng.update(0.3);
    eng.emit('hit', { player: p, skillId: 'knight_mortal_strike', tags: tagsOf('knight_mortal_strike') });
    bl = p.statuses.has('battlelord');
  }
  ok('pmkn.fx Savaş Efendisi procs from Ölümcül Darbe (25 %, PRD)', bl);
  p.statuses.remove('battlelord');
  for (let i = 0; i < 40; i++) { eng.update(0.3); eng.emit('hit', { player: p, skillId: 'knight_rend', tags: tagsOf('knight_rend') }); }
  ok('pmkn.fx Savaş Efendisi ignores other skills', !p.statuses.has('battlelord'));

  eng.setEntries(collectProcs(parseFx(PROT.fx).items, 'spec:knight_protector'));
  p.spec = 'knight_protector';
  p.statuses.remove('revenge_ready');
  eng.emit('parry', { player: p });
  ok('pmkn.fx perfect parry lights İntikam Hazır (100 %)', p.statuses.has('revenge_ready'));
  p.statuses.remove('revenge_ready');
  let rb = false;
  for (let i = 0; i < 60 && !rb; i++) {
    eng.update(1.6); // block icd 1.5 s
    eng.emit('block', { player: p });
    rb = p.statuses.has('revenge_ready');
  }
  ok('pmkn.fx block lights İntikam Hazır (30 %, PRD)', rb);
  G.procs = undefined;
}

// 2. knight_execute: <20 % gate (lifted by sudden_death), x1.25 below the threshold, no barbarian cull
{
  const p = H.addPlayer('knight');
  p.spec = 'knight_blademaster';
  p.statuses.remove('sudden_death');
  p.yaw = 0;
  const e = H.addEnemy(0, 2, { hp: 1000 });
  e.maxHp = 1000;
  e.hp = 250;
  H.step(2);
  ok('pmkn.exec refused at 25 % HP without sudden_death', BEHAVIORS.execute.begin(ctxFor(p, K('knight_execute'), e)) === false);
  p.statuses.apply('sudden_death', 12, {});
  ok('pmkn.exec allowed at 25 % HP with sudden_death', BEHAVIORS.execute.begin(ctxFor(p, K('knight_execute'), e)) !== false);
  p.statuses.remove('sudden_death');
  const mores = [];
  const orig = G.skills.strike.bind(G.skills);
  G.skills.strike = (c, t, o = {}) => { if (c.def.id === 'knight_execute') mores.push(o.more); return orig(c, t, o); };
  try {
    e.hp = 150;
    const c15 = ctxFor(p, K('knight_execute'), e);
    if (BEHAVIORS.execute.begin(c15) !== false) BEHAVIORS.execute.fire(c15);
    // 5 % trash: a barbarian-style cull (x20) must not apply to the knight (fresh target; the 15 % one is dead or nearly so)
    const e2 = H.addEnemy(0, 2.3, { hp: 1000, rank: 'trash' });
    e2.maxHp = 1000;
    e2.hp = 50;
    const c05 = ctxFor(p, K('knight_execute'), e2);
    if (BEHAVIORS.execute.begin(c05) !== false) BEHAVIORS.execute.fire(c05);
  } finally {
    G.skills.strike = orig;
  }
  ok('pmkn.exec x1.25 below 20 % HP', mores.length >= 1 && near(mores[0], 1.25, 1e-9), `more=${mores.join(',')}`);
  ok('pmkn.exec no x20 cull for the knight', mores.every((m) => near(m, 1.25, 1e-9)), `more=${mores.join(',')}`);
}

// 3. Ani Ölüm consumes ONE stack per execute (real StatusEffects), free while it lasts
{
  const p = H.addPlayer('knight');
  p.spec = 'knight_blademaster';
  p.statuses.apply('sudden_death', 12, { stacks: 2 });
  ok('pmkn.stack sudden_death holds 2 stacks', p.statuses.stacks('sudden_death') === 2, `stacks=${p.statuses.stacks('sudden_death')}`);
  const e = H.addEnemy(0, 2, { hp: 1e6 });
  e.maxHp = 1e6;
  e.hp = 150000; // 15 %: the cast hits but does not kill
  p.yaw = 0;
  p.resource = 100;
  H.step(2);
  G.character.save.skillBar.q = 'knight_execute';
  H.setAimTarget(e);
  const r0 = p.resource;
  const cast1 = G.skills.tryCastSlot(p, 'q', H.aimFor(p, e));
  ok('pmkn.stack first execute casts', cast1 === true);
  H.stepSec(0.8); // the cost and the proc consumption are paid at the hit frame (SkillSystem.pay)
  ok('pmkn.stack first execute costs no rage', p.resource >= r0 - 0.01, `r0=${r0} r=${p.resource}`);
  ok('pmkn.stack first execute spends one stack (2 -> 1)', p.statuses.stacks('sudden_death') === 1, `stacks=${p.statuses.stacks('sudden_death')}`);
  H.stepSec(1.5);
  const cast2 = G.skills.tryCastSlot(p, 'q', H.aimFor(p, e));
  H.stepSec(1.5);
  H.setAimTarget(null);
  ok('pmkn.stack second execute spends the last stack', cast2 === true && !p.statuses.has('sudden_death'), `cast2=${cast2}`);
}

// 4. Kalkan Darbesi x1.3 while shield_block is up, and the block is NOT consumed
{
  const bash = (withBlock) => {
    const p = H.addPlayer('knight');
    p.spec = 'knight_protector';
    p.yaw = 0;
    H.addEnemy(0, 2, { hp: 1e6 });
    H.step(2);
    G.character.save.skillBar.rmb = 'knight_shield_bash';
    if (withBlock) p.statuses.apply('shield_block', 6, {});
    const seen = [];
    const orig = G.skills.strike.bind(G.skills);
    G.skills.strike = (c, t, o = {}) => { if (c.def.id === 'knight_shield_bash') seen.push(c.more); return orig(c, t, o); };
    try { H.tap('rmb'); H.stepSec(1); } finally { G.skills.strike = orig; }
    return { seen, blockUp: p.statuses.has('shield_block') };
  };
  const withB = bash(true);
  const noB = bash(false);
  ok('pmkn.bash Kalkan Darbesi x1.3 under shield_block', withB.seen.length >= 1 && near(withB.seen[0], 1.3, 1e-9), `more=${withB.seen.join(',')}`);
  ok('pmkn.bash the block is not consumed by the bash', withB.blockUp === true);
  ok('pmkn.bash no multiplier without shield_block', noB.seen.length >= 1 && near(noB.seen[0], 1, 1e-9), `more=${noB.seen.join(',')}`);
}

// 5. Çelik Girdap applies sweeping when it hits >= 3 enemies (not with 2)
{
  const sweepAfter = (n) => {
    const p = H.addPlayer('knight');
    p.spec = 'knight_blademaster';
    p.yaw = 0;
    p.resource = 100;
    G.character.save.skillBar.s1 = 'knight_radiant_cleave';
    for (const [x, z] of [[0, 2], [0.6, 2.4], [-0.6, 2.4], [0.3, 3.2]].slice(0, n)) H.addEnemy(x, z, { hp: 1e6 });
    H.step(2);
    H.tap('s1');
    H.stepSec(1);
    return p.statuses.has('sweeping');
  };
  ok('pmkn.sweep Çelik Girdap on 2 enemies: no sweeping', sweepAfter(2) === false);
  ok('pmkn.sweep Çelik Girdap on 3 enemies: sweeping 6 s', sweepAfter(3) === true);
}

// 6. Revenge: threat x2 on every hit, 5-target cap
{
  const p = H.addPlayer('knight');
  p.spec = 'knight_protector';
  p.yaw = 0;
  p.resource = 100;
  p.statuses.remove('revenge_ready');
  G.character.save.skillBar.q = 'knight_revenge';
  for (const [x, z] of [[0, 2], [0.5, 2.2], [-0.5, 2.2], [0.8, 2.6], [-0.8, 2.6], [0.3, 3], [-0.3, 3]]) H.addEnemy(x, z, { hp: 1e6 });
  H.step(2);
  const threat = [];
  const origHit = G.combat.playerHitEnemy.bind(G.combat);
  G.combat.playerHitEnemy = (a, t, s) => { if (s.skillId === 'knight_revenge') threat.push(s.threatMult); return origHit(a, t, s); };
  try { H.tap('q'); H.stepSec(1); } finally { G.combat.playerHitEnemy = origHit; }
  ok('pmkn.revenge threat x2 on each hit', threat.length > 0 && threat.every((m) => m === 2), `threat=${threat.join(',')}`);
  ok('pmkn.revenge hits at most 5 targets', threat.length === 5, `hits=${threat.length}`);
}

// 7. Savaş Avatarı cleanses root and slow when cast
{
  const p = H.addPlayer('knight');
  p.spec = 'knight_blademaster';
  p.resource = 100;
  p.statuses.apply('root', 2, {});
  p.statuses.apply('slow', 2, {});
  const pre = p.statuses.has('root') && p.statuses.has('slow');
  G.character.save.skillBar.m90 = 'knight_avatar';
  const cast = G.skills.tryCastSlot(p, 'm90', H.aimFor(p));
  H.stepSec(0.8); // paid at the hit frame
  ok('pmkn.avatar root and slow are on the caster before the cast', pre);
  ok('pmkn.avatar cast starts', cast === true);
  ok('pmkn.avatar cleanses root and slow, grants avatar', !p.statuses.has('root') && !p.statuses.has('slow') && p.statuses.has('avatar'));
}

console.log(fails === 0 ? '\nkit.knight (pmkn): all checks PASS' : `\nkit.knight (pmkn): ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
