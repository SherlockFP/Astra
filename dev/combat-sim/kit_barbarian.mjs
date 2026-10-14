// KIT PM-BA checks (docs/kits/plate-melee.md §3, §4, f1b, §h PM-BA) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_barbarian.mjs
// Covered: pmba.ids, pmba.bars, pmba.cd, pmba.specs, pmba.replaces, pmba.fx, pmba.rampage, pmba.cleave, pmba.iron, pmba.gory,
//          pmba.execute, pmba.tempest, pmba.heal, pmba.growl, pmba.pummel, pmba.procs, pmba.apl.
//          pmba.fix (execute regression, Kan Susuzluğu heal, shared Kan cooldown, Gore rage, axe boss taunt + ICD, Ezici Balta cap,
//          Yarma threat param, Ani Ölüm one stack).
// Not covered here (SimBench / browser): pmba.ledger (60 s APL rage income), hit-stop and VFX feel.
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { ROTATIONS_KIT_BARBARIAN } = await H.imp('data/rotations_kit_barbarian.ts');
const { PROC_DEFS } = await H.imp('data/procs.ts');
const { PROC_MODS, resolveProcMods, consumeProcMods, cleaveRidersOf } = await H.imp('combat/procMods.ts');
const { parseFx } = await H.imp('data/talentTrees/fx.ts');
const { isMajorDef } = await H.imp('combat/specs.ts');

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

const BUTCHER = SPECS.barbarian_butcher;
const LORD = SPECS.barbarian_warlord;
const SPEC_LIST = [BUTCHER, LORD];

// ---- pmba.ids: every id of both specs resolves; the bars fit 12 slots; replacement rows exist
{
  for (const s of SPEC_LIST) {
    const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors)];
    const missing = ids.filter((id) => !SKILLS[id]);
    ok(`pmba.ids ${s.id} skills resolve`, missing.length === 0, missing.join(','));
    ok(`pmba.ids ${s.id} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
    ok(`pmba.ids ${s.id} skills are barbarian`, ids.every((id) => SKILLS[id]?.classId === 'barbarian'));
  }
  ok('pmba.ids barbarian_bloodbath replaces bloodthirst', SKILLS.barbarian_bloodbath?.replaces?.skill === 'barbarian_bloodthirst'
    && SKILLS.barbarian_bloodbath?.replaces?.whileStatus === 'carnage');
  ok('pmba.ids barbarian_crushing_blow replaces raging_blow', SKILLS.barbarian_crushing_blow?.replaces?.skill === 'barbarian_raging_blow'
    && SKILLS.barbarian_crushing_blow?.replaces?.whileStatus === 'carnage');
  ok('pmba.ids kept old rows stay defined', ['barbarian_rend', 'barbarian_war_cry', 'barbarian_fissure', 'barbarian_rallying_roar', 'barbarian_provoke']
    .every((id) => !!SKILLS[id]));
}

// ---- pmba.bars: majors line up with the m45 / m90 / m180 slots and isMajorDef
{
  for (const s of SPEC_LIST) {
    ok(`pmba.bars ${s.id} majors on their slots`, s.defaultBar.m45 === s.majors.m45 && s.defaultBar.m90 === s.majors.m90
      && s.defaultBar.m180 === s.majors.m180);
    ok(`pmba.bars ${s.id} majors are major skills`, [s.majors.m45, s.majors.m90, s.majors.m180].every((id) => isMajorDef(SKILLS[id])));
    ok(`pmba.bars ${s.id} lmb is the chain`, s.defaultBar.lmb === 'barbarian_basic');
  }
  ok('pmba.bars Kasap bar: rmb bloodthirst, q rampage, e raging blow', BUTCHER.defaultBar.rmb === 'barbarian_bloodthirst'
    && BUTCHER.defaultBar.q === 'barbarian_rampage' && BUTCHER.defaultBar.e === 'barbarian_raging_blow');
  // Warrior rework (docs/WOW_ABILITY_MAP.md §3.2): Warlord bar moved to Protection keys; Yarma and Paralama are no longer on it.
  ok('pmba.bars Lord bar: rmb shield block, q shield slam, e revenge, s1 thunder clap', LORD.defaultBar.rmb === 'barbarian_iron_stance'
    && LORD.defaultBar.q === 'barbarian_shield_slam' && LORD.defaultBar.e === 'barbarian_revenge' && LORD.defaultBar.s1 === 'barbarian_thunder_clap');
  ok('pmba.bars pummel is s4 on both specs', BUTCHER.defaultBar.s4 === 'barbarian_pummel' && LORD.defaultBar.s4 === 'barbarian_pummel');
}

// ---- pmba.cd: cooldowns of the table rows (seconds) and charges
{
  const cd = {
    barbarian_bloodthirst: 4.5, barbarian_rampage: 1.5, barbarian_raging_blow: 8, barbarian_crushing_blow: 8, barbarian_execute: 0,
    barbarian_cleave: 6, barbarian_leap: 20, barbarian_axe_throw: 8, barbarian_blood_rage: 120, barbarian_ancestral_tempest: 90,
    barbarian_iron_stance: 0.5, barbarian_blood_shield: 26, barbarian_last_stand: 45, barbarian_thrash: 6, barbarian_incarnation: 180,
    barbarian_avatar: 45, barbarian_carnage: 90, barbarian_wolf_howl: 180, barbarian_pummel: 15,
  };
  for (const [id, want] of Object.entries(cd)) ok(`pmba.cd ${id} ${want} s`, SKILLS[id]?.cooldown === want, `got ${SKILLS[id]?.cooldown}`);
  ok('pmba.cd raging blow has 2 charges', SKILLS.barbarian_raging_blow?.charges === 2 && SKILLS.barbarian_crushing_blow?.charges === 2);
  ok('pmba.cd iron stance has no charges', !SKILLS.barbarian_iron_stance?.charges);
  ok('pmba.cd Yarma generates 12 rage', SKILLS.barbarian_cleave?.cost === -12, `cost=${SKILLS.barbarian_cleave?.cost}`);
  ok('pmba.cd rampage costs 80 rage', SKILLS.barbarian_rampage?.cost === 80);
  ok('pmba.cd maul costs 40 rage', SKILLS.barbarian_maul?.cost === 40);
  ok('pmba.cd execute costs 25 rage, 3.5 coef', SKILLS.barbarian_execute?.cost === 25 && SKILLS.barbarian_execute?.damage?.coef === 3.5);
}

// ---- pmba.specs: no damagePct on either spec (G10); Lord rage armor 15 %; Kasap trait_anger 20; Lord ursoc_fury
{
  ok('pmba.specs no damagePct on Lord / Kasap (G10)', LORD.stats.damagePct === undefined && BUTCHER.stats.damagePct === undefined);
  const rage = LORD.specials.find((x) => x.id === 'warlord_rage_armor');
  ok('pmba.specs warlord_rage_armor max .15, per point .0015', rage?.params?.max === 0.15 && rage?.params?.perPoint === 0.0015);
  ok('pmba.specs ursoc_fury absorb .35 on Lord', !!LORD.specials.find((x) => x.id === 'ursoc_fury' && x.params?.absorb === 0.35));
  const anger = BUTCHER.specials.find((x) => x.id === 'trait_anger');
  ok('pmba.specs Kasap trait_anger angerPer 20', anger?.params?.angerPer === 20);
  ok('pmba.specs Lord Kan Yenilenmesi via s05 tree slot', LORD.treeSkills?.barbarian_blood_shield === 's05');
  ok('pmba.specs Kasap İdam via s05 tree slot', BUTCHER.treeSkills?.barbarian_execute === 's05');
  ok('pmba.specs Lord threat mods on cleave / thrash / maul',
    ['barbarian_cleave', 'barbarian_thrash', 'barbarian_maul'].every((id) => LORD.mods.some((m) => m.skill === id && m.params?.threatMult)));
  const unlockOk = (s) => s.skills.every((id) => s.unlock[id] !== undefined);
  ok('pmba.specs every spec skill has an unlock level', unlockOk(BUTCHER) && unlockOk(LORD));
  ok('pmba.specs pummel unlocks at 10 on both', BUTCHER.unlock.barbarian_pummel === 10 && LORD.unlock.barbarian_pummel === 10);
}

// ---- pmba.fx: the spec fx strings parse and carry the design triggers
{
  const has = (items, trig, filter, status) => items.some((it) => it.k === 'T' && it.trig === trig
    && (filter === undefined || it.filter === filter) && JSON.stringify(it).includes(`"${status}"`));
  const bfx = parseFx(BUTCHER.fx).items;
  const lfx = parseFx(LORD.fx).items;
  ok('pmba.fx Kasap parses to 3 T items', bfx.filter((it) => it.k === 'T').length === 3, `n=${bfx.filter((it) => it.k === 'T').length}`);
  ok('pmba.fx Kasap Kan Susuzluğu applies enrage', has(bfx, 'cast', 'barbarian_bloodthirst', 'enrage'));
  ok('pmba.fx Kasap Çılgın Hamle applies enrage', has(bfx, 'cast', 'barbarian_rampage', 'enrage'));
  ok('pmba.fx Kasap melee hit applies sudden_death', bfx.some((it) => it.k === 'T' && it.trig === 'hit' && JSON.stringify(it).includes('"sudden_death"')));
  ok('pmba.fx Lord parses to 5 T items', lfx.filter((it) => it.k === 'T').length === 5, `n=${lfx.filter((it) => it.k === 'T').length}`);
  ok('pmba.fx Lord Paralama / Yarma hit apply gore', has(lfx, 'hit', 'barbarian_thrash', 'gore') && has(lfx, 'hit', 'barbarian_cleave', 'gore'));
  ok('pmba.fx Lord Demir Duruş / Ezici Balta cast apply the gory procs',
    has(lfx, 'cast', 'barbarian_iron_stance', 'gory_maul') && has(lfx, 'cast', 'barbarian_maul', 'gory_iron'));
}

// ---- pmba.replaces: Pervasızlık turns rmb / e into the transforms, and back when it ends
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_butcher';
  p.statuses.remove('carnage');
  ok('pmba.replaces no carnage: rmb is Kan Susuzluğu', G.skills.replacementFor(p, 'barbarian_bloodthirst') === null);
  p.statuses.apply('carnage', 12);
  ok('pmba.replaces carnage: rmb resolves to Kan Banyosu', G.skills.replacementFor(p, 'barbarian_bloodthirst') === 'barbarian_bloodbath');
  ok('pmba.replaces carnage: e resolves to Kemik Ezici', G.skills.replacementFor(p, 'barbarian_raging_blow') === 'barbarian_crushing_blow');
  p.statuses.remove('carnage');
  ok('pmba.replaces carnage gone: back to base skills', G.skills.replacementFor(p, 'barbarian_bloodthirst') === null);
}

// ---- pmba.rampage: four hits 0.17 s apart on one target, coef 1.30 per hit
{
  const p = H.addPlayer('barbarian');
  const e = H.addEnemy(0, 2.5, { hp: 1e6 });
  p.yaw = 0;
  H.step(2);
  const t0 = G.engine.time;
  const times = [];
  const orig = G.combat.playerHitEnemy.bind(G.combat);
  G.combat.playerHitEnemy = (a, t, sp) => { times.push(G.engine.time - t0); return orig(a, t, sp); };
  const hp0 = e.hp;
  BEHAVIORS.multi_strike.fire(ctxFor(p, SKILLS.barbarian_rampage, e));
  H.stepSec(1);
  G.combat.playerHitEnemy = orig;
  ok('pmba.rampage lands four hits', times.length === 4, `hits=${times.length}`);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  ok('pmba.rampage hits are ~0.17 s apart', gaps.length === 3 && gaps.every((g) => near(g, 0.17, 0.04)), gaps.map((g) => g.toFixed(3)).join(','));
  ok('pmba.rampage deals damage to the target', e.hp < hp0);
  ok('pmba.rampage uses multi_strike with 4 hits', SKILLS.barbarian_rampage.behavior === 'multi_strike' && SKILLS.barbarian_rampage.params?.hits === 4);
}

// ---- pmba.cleave: Kasırga applies two meat_cleaver stacks (8 s after the channel); the rider reaches 3 extra targets at 60 %
{
  const p = H.addPlayer('barbarian');
  p.statuses.remove('meat_cleaver');
  const w = SKILLS.barbarian_whirlwind;
  ok('pmba.cleave Kasırga applies meat_cleaver x2', w.selfStatuses?.some((s) => s.status === 'meat_cleaver' && s.stacks === 2));
  ok('pmba.cleave Kasırga costs no rage, 2 s channel, 8 ticks', w.cost === 0 && w.channel === 2 && w.ticks === 8);
  p.statuses.apply('meat_cleaver', 8, { stacks: 2 });
  ok('pmba.cleave two stacks up', p.statuses.stacks('meat_cleaver') === 2, `n=${p.statuses.stacks('meat_cleaver')}`);
  p.statuses.apply('meat_cleaver', 8, { stacks: 1 });
  ok('pmba.cleave a third stack is capped at 2', p.statuses.stacks('meat_cleaver') === 2, `n=${p.statuses.stacks('meat_cleaver')}`);
  const riders = cleaveRidersOf(p.statuses);
  ok('pmba.cleave rider is 3 extra targets at x0.6', riders[0]?.extraTargets === 3 && riders[0]?.extraMult === 0.6);
  p.statuses.remove('meat_cleaver');
  ok('pmba.cleave the rider is gone with the stacks', cleaveRidersOf(p.statuses).length === 0);
}

// ---- pmba.iron: three casts -> 3 stacks (39 % DR), the stack timer runs out after 7 s
{
  const p = H.addPlayer('barbarian');
  p.statuses.remove('iron_stance');
  for (let i = 0; i < 3; i++) p.statuses.apply('iron_stance', 7, {});
  ok('pmba.iron three casts give 3 stacks', p.statuses.stacks('iron_stance') === 3, `n=${p.statuses.stacks('iron_stance')}`);
  ok('pmba.iron stance def: 13 % DR per stack, max 3', STATUSES.iron_stance.stats?.damageReductionPct === 0.13 && STATUSES.iron_stance.maxStacks === 3);
  ok('pmba.iron stacks rule is stack', STATUS_RULES.iron_stance?.stack === 'stack');
  H.stepSec(7.5);
  ok('pmba.iron stacks gone after 7 s', !p.statuses.has('iron_stance'), `n=${p.statuses.stacks('iron_stance')}`);
  ok('pmba.iron stance is off the GCD', SKILLS.barbarian_iron_stance.offGcd === true && SKILLS.barbarian_iron_stance.tags.includes('offgcd'));
}

// ---- pmba.gory: a Demir Duruş cast frees the next Ezici Balta and vice versa; Yarma resets with gore
{
  const p = H.addPlayer('barbarian');
  p.statuses.remove('gory_maul'); p.statuses.remove('gory_iron'); p.statuses.remove('gore');
  p.statuses.apply('gory_maul', 12, {});
  const rm = resolveProcMods(p.statuses, 'barbarian_maul');
  ok('pmba.gory gory_maul makes Ezici Balta free', !!rm && rm.costMult === 0 && rm.sources.includes('gory_maul'));
  const used = consumeProcMods(p.statuses, rm);
  ok('pmba.gory gory_maul is consumed by the cast', used === 0 && !p.statuses.has('gory_maul'));
  p.statuses.apply('gory_iron', 12, {});
  const ri = resolveProcMods(p.statuses, 'barbarian_iron_stance');
  ok('pmba.gory gory_iron makes Demir Duruş free', !!ri && ri.costMult === 0);
  consumeProcMods(p.statuses, ri);
  p.statuses.apply('gore', 10, {});
  const rg = resolveProcMods(p.statuses, 'barbarian_cleave');
  ok('pmba.gory gore resets Yarma and adds 15 %', !!rg && rg.cdReset === true && near(rg.more, 1.15, 1e-6));
  ok('pmba.gory mods exist for the three statuses', !!PROC_MODS.gore && !!PROC_MODS.gory_maul && !!PROC_MODS.gory_iron);
}

// ---- pmba.execute: Ani Ölüm (sudden_death) lifts the 35 % gate; without it the target must be under 35 %
{
  const p = H.addPlayer('barbarian');
  p.yaw = 0;
  const e = H.addEnemy(0, 2, { hp: 1000 });
  e.maxHp = 1000;
  e.hp = 900;
  H.step(2);
  p.statuses.remove('sudden_death');
  const ctx = ctxFor(p, SKILLS.barbarian_execute, e);
  const blocked = BEHAVIORS.execute.begin(ctx) === false;
  ok('pmba.execute refused at 90 % HP without sudden_death', blocked);
  p.statuses.apply('sudden_death', 12, {});
  const ctx2 = ctxFor(p, SKILLS.barbarian_execute, e);
  ok('pmba.execute allowed at 90 % HP with sudden_death', BEHAVIORS.execute.begin(ctx2) !== false);
  p.statuses.remove('sudden_death');
  e.hp = 300;
  ok('pmba.execute allowed at 30 % HP', BEHAVIORS.execute.begin(ctxFor(p, SKILLS.barbarian_execute, e)) !== false);
}

// ---- pmba.tempest: Ata Fırtınası spends no rage (consumeAll 0), heals 12 % over 6 ticks, 3 s channel
{
  const p = H.addPlayer('barbarian');
  const d = SKILLS.barbarian_ancestral_tempest;
  ok('pmba.tempest 3 s channel, 6 ticks, 90 s', d.channel === 3 && d.ticks === 6 && d.cooldown === 90);
  ok('pmba.tempest no rage gate or spend', d.params?.minResource === 0 && d.params?.consumeAll === 0 && d.cost === 0);
  ok('pmba.tempest heals 12 % over the channel', d.params?.healPct === 0.12);
  p.spec = 'barbarian_warlord';
  p.hp = p.maxHp;
  H.step(2);
  p.resource = 60;
  // m45 / m90 / m180 are not mapped by the harness key table: cast through SkillSystem.tryCast
  const cast = G.skills.tryCast(p, 'barbarian_ancestral_tempest', H.aimFor(p, null), 'm90');
  H.stepSec(0.3);
  ok('pmba.tempest starts its channel', cast === true && p.statuses.has('fortify'), `cast=${cast}`);
  ok('pmba.tempest keeps the rage (no consume)', p.resource >= 55, `r=${p.resource.toFixed(1)}`);
}

// ---- pmba.heal: Kan Yenilenmesi heals 32 % of max HP (immediate; the design's 3 s HoT is not wired)
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  p.hp = p.maxHp * 0.5;
  // the row is granted by the s05 tree node (treeSkills), so the cast is tested through the behaviour itself
  const before = p.hp;
  BEHAVIORS.self_heal_pct.fire(ctxFor(p, SKILLS.barbarian_blood_shield));
  const gained = p.hp - before;
  ok('pmba.heal Kan Yenilenmesi restores 32 % of max HP', near(gained / p.maxHp, 0.32, 0.005), `gained=${(gained / p.maxHp * 100).toFixed(1)} %`);
  ok('pmba.heal Kan Yenilenmesi is a tree grant (s05)', LORD.treeSkills?.barbarian_blood_shield === 's05');
  ok('pmba.heal Kan Yenilenmesi costs 10 rage, 26 s', SKILLS.barbarian_blood_shield.cost === 10 && SKILLS.barbarian_blood_shield.cooldown === 26);
}

// ---- pmba.growl: Kükreyen Balta is a homing target projectile; it taunts and applies rend
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  const e = H.addEnemy(0, 12, { hp: 1e6 });
  p.yaw = 0;
  p.position.set(0, 0, 0);
  H.step(2);
  G.character.save.skillBar.r = 'barbarian_axe_throw';
  H.setAimTarget(e);
  p.targetId = e.id;
  p.resource = 0;
  H.clearEvents();
  errors.length = 0;
  H.tap('r');
  H.stepSec(1.5);
  H.setAimTarget(null);
  p.targetId = null;
  const fails1 = (events['skill:fail'] ?? []).map((f) => f.reason);
  ok('pmba.growl Kükreyen Balta casts without a fail', fails1.length === 0, fails1.join(','));
  ok('pmba.growl the axe taunts the target', e.statuses.has('taunt'));
  ok('pmba.growl the axe applies rend', e.statuses.has('rend'));
  ok('pmba.growl target projectile, range 25, no pierce', SKILLS.barbarian_axe_throw.targeting === 'target_projectile'
    && SKILLS.barbarian_axe_throw.range === 25 && (SKILLS.barbarian_axe_throw.pierce ?? 0) === 0);
  if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', String(m).slice(0, 300));
}

// ---- pmba.whirl: Kasırga gains 3 rage per distinct enemy hit in the cast (max 5), once per target
{
  const p = H.addPlayer('barbarian');
  p.yaw = 0;
  H.step(2);
  const ens = [H.addEnemy(0, 1.5, { hp: 1e6 }), H.addEnemy(1, 1.8, { hp: 1e6 }), H.addEnemy(-1, 1.8, { hp: 1e6 })];
  p.resource = 0;
  const ctx = ctxFor(p, SKILLS.barbarian_whirlwind);
  BEHAVIORS.channel_aoe.tick(ctx, 0);
  BEHAVIORS.channel_aoe.tick(ctx, 1);
  ok('pmba.whirl +3 rage per distinct target, not per tick', near(p.resource, 9, 1e-6), `r=${p.resource.toFixed(2)}`);
  ok('pmba.whirl the three enemies are all hit by the tick', ens.every((e) => e.hp < 1e6));
}

// ---- pmba.pummel: 15 s, free, silence 3 s, stun 0.8 s, off the GCD
{
  const pm = SKILLS.barbarian_pummel;
  ok('pmba.pummel 15 s, free, silence 3, stun 0.8', pm.cooldown === 15 && pm.cost === 0 && pm.params?.silence === 3 && pm.params?.stun === 0.8);
  ok('pmba.pummel is off the GCD', pm.tags.includes('offgcd') && pm.behavior === 'interrupt');
}

// ---- pmba.procs: every barbarian status has a proc row (overlay / glow) where the table says so, and the APL names resolve
{
  for (const id of ['gore', 'gory_maul', 'gory_iron', 'meat_cleaver', 'carnage', 'ursoc_form']) {
    ok(`pmba.procs ${id} has a ProcDef`, PROC_DEFS.some((d) => d.id === id && d.status === id));
    ok(`pmba.procs ${id} has a status def`, !!STATUSES[id]);
  }
  ok('pmba.procs gore glows Yarma', PROC_DEFS.find((d) => d.id === 'gore')?.glow.includes('barbarian_cleave'));
  ok('pmba.procs Ani Ölüm stays in the shared table', PROC_MODS.sudden_death?.skills.includes('barbarian_execute'));

  for (const [sid, apl] of Object.entries(ROTATIONS_KIT_BARBARIAN)) {
    const lines = [...apl.st, ...(apl.aoe ?? [])];
    const skillIds = new Set();
    const statusIds = new Set();
    for (const l of lines) {
      for (const m of l.matchAll(/\b(barbarian_[a-z_]+)/g)) skillIds.add(m[1]);
      for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
    }
    const bad = [...skillIds].filter((id) => !SKILLS[id]);
    ok(`pmba.apl ${sid} skill ids resolve`, bad.length === 0, bad.join(','));
    const runtime = new Set(['sudden_death']);
    const badS = [...statusIds].filter((id) => !STATUSES[id] && !runtime.has(id));
    ok(`pmba.apl ${sid} status ids resolve`, badS.length === 0, badS.join(','));
  }
}

// ---- pmba.defs: every barbarian row's behaviour is installed (or a targeting kind)
{
  const { TARGETING_BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
  const bad = Object.values(SKILLS).filter((d) => d.classId === 'barbarian' && d.behavior && d.behavior !== 'combo'
    && !BEHAVIORS[d.behavior] && !TARGETING_BEHAVIORS[d.behavior]).map((d) => `${d.id}:${d.behavior}`);
  ok('pmba.defs barbarian behaviours are installed', bad.length === 0, bad.join(','));
  ok('pmba.defs self_heal_pct installed', typeof BEHAVIORS.self_heal_pct?.fire === 'function');
}

// ---- pmba.fix: the barbarian gap list (Kan Susuzluğu heal, Gore rage, axe boss taunt + ICD, Ezici Balta cap, shared
// Kan cooldown, Ani Ölüm one stack, threat param) and a regression of the shared execute behaviour (35 % gate, x1.3, x20 cull)
const tagsOf = (id) => SKILLS[id].tags;
const spyStrike = (id, into) => {
  const orig = G.skills.strike.bind(G.skills);
  G.skills.strike = (c, t, o = {}) => { if (c.def.id === id) into.push({ more: o.more, id: t.id, c }); return orig(c, t, o); };
  return () => { G.skills.strike = orig; };
};

// 0. regression: the shared execute behaviour keeps the barbarian numbers (x1.3 under 35 %, x20 on a trash / elite under 10 %)
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_butcher';
  p.yaw = 0;
  p.statuses.remove('sudden_death');
  const e = H.addEnemy(0, 2, { hp: 1000, rank: 'trash' });
  e.maxHp = 1000;
  e.hp = 300;
  H.step(2);
  const hits = [];
  const restore = spyStrike('barbarian_execute', hits);
  try {
    const c = ctxFor(p, SKILLS.barbarian_execute, e);
    if (BEHAVIORS.execute.begin(c) !== false) BEHAVIORS.execute.fire(c);
  } finally { restore(); }
  ok('pmba.exec regression x1.3 under 35 % HP', hits.length === 1 && near(hits[0].more, 1.3, 1e-9), `more=${hits.map((h) => h.more).join(',')}`);
  const p2 = H.addPlayer('barbarian');
  p2.spec = 'barbarian_butcher';
  p2.yaw = 0;
  p2.statuses.remove('sudden_death');
  const e2 = H.addEnemy(0, 2, { hp: 1000, rank: 'trash' });
  e2.maxHp = 1000;
  e2.hp = 50;
  H.step(2);
  const hits2 = [];
  const restore2 = spyStrike('barbarian_execute', hits2);
  try {
    const c = ctxFor(p2, SKILLS.barbarian_execute, e2);
    if (BEHAVIORS.execute.begin(c) !== false) BEHAVIORS.execute.fire(c);
  } finally { restore2(); }
  ok('pmba.exec regression x20 cull under 10 % HP on trash', hits2.length === 1 && near(hits2[0].more, 20, 1e-9), `more=${hits2.map((h) => h.more).join(',')}`);
}

// 1. Kan Susuzluğu heals 3 % max HP per landed hit
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_butcher';
  p.yaw = 0;
  p.resource = 100;
  H.addEnemy(0, 2, { hp: 1e6 });
  H.step(2);
  G.character.save.skillBar.rmb = 'barbarian_bloodthirst';
  // count the heal calls of the hit itself (raw HP also drifts up during any barbarian action, so HP deltas are not used)
  const heals = [];
  const origHeal = G.combat.healPlayer.bind(G.combat);
  G.combat.healPlayer = (s, t, a, o) => { heals.push(a); return origHeal(s, t, a, o); };
  try { H.tap('rmb'); H.stepSec(0.8); } finally { G.combat.healPlayer = origHeal; }
  ok('pmba.bloodthirst heals 3 % of max HP on hit (one heal of 150)', heals.length === 1 && near(heals[0], 0.03 * p.maxHp, 1e-6), `heals=${heals.map((h) => h.toFixed(2)).join(',')}`);
  ok('pmba.bloodthirst heal param is hitHealPct 0.03', SKILLS.barbarian_bloodthirst.params.hitHealPct === 0.03 && SKILLS.barbarian_bloodthirst.params.healPct === undefined);
}

// 2. Kan Susuzluğu / Kan Banyosu share one cooldown group
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_butcher';
  p.yaw = 0;
  p.resource = 100;
  H.addEnemy(0, 2, { hp: 1e6 });
  H.step(2);
  G.character.save.skillBar.rmb = 'barbarian_bloodthirst';
  ok('pmba.shared both rows carry the group', SKILLS.barbarian_bloodthirst.sharedCd === 'blood_strike' && SKILLS.barbarian_bloodbath.sharedCd === 'blood_strike');
  ok('pmba.shared Kan Banyosu is ready before any cast', G.skills.getCooldown(p, 'barbarian_bloodbath').remaining <= 0);
  H.tap('rmb');
  H.stepSec(0.8);
  const bb = G.skills.getCooldown(p, 'barbarian_bloodbath').remaining;
  ok('pmba.shared Kan Susuzluğu starts the Kan Banyosu cooldown (4.5 s)', bb > 3 && bb <= 4.5 + 0.01, `remaining=${bb.toFixed(2)}`);
}

// 3. Gore (Kanlı Fırsat) grants +5 rage on the Yarma that consumes it
{
  const yarma = (withGore) => {
    const p = H.addPlayer('barbarian');
    p.spec = 'barbarian_warlord';
    p.yaw = 0;
    H.addEnemy(0, 2, { hp: 1e6 });
    H.step(2);
    G.character.save.skillBar.rmb = 'barbarian_cleave';
    if (withGore) p.statuses.apply('gore', 10, {});
    p.resource = 0;
    H.tap('rmb');
    H.stepSec(0.8);
    return p.resource;
  };
  const a = yarma(false);
  const b = yarma(true);
  ok('pmba.gore Kanlı Fırsat adds +5 rage on Yarma', near(b - a, 5, 0.01), `without=${a.toFixed(2)} with=${b.toFixed(2)}`);
}

// 4. Kükreyen Balta: boss taunt 2 s, and a 12 s taunt internal cooldown per enemy
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  p.position.set(0, 0, 0);
  p.yaw = 0;
  p.resource = 0;
  const boss = H.addEnemy(0, 12, { hp: 1e6, rank: 'boss' });
  H.step(2);
  G.character.save.skillBar.r = 'barbarian_axe_throw';
  H.setAimTarget(boss);
  p.targetId = boss.id;
  H.tap('r');
  H.stepSec(1.5);
  const first = boss.statuses.get('taunt');
  ok('pmba.axe boss taunt lasts 2 s (not 3)', !!first && near(first.duration, 2, 0.01), `duration=${first?.duration}`);
  boss.statuses.remove('taunt');
  H.stepSec(8);
  H.tap('r');
  H.stepSec(1.5);
  ok('pmba.axe taunt is on its 12 s internal cooldown (second throw)', !boss.statuses.has('taunt'));
  boss.statuses.remove('taunt');
  H.stepSec(8);
  H.tap('r');
  H.stepSec(1.5);
  H.setAimTarget(null);
  p.targetId = null;
  ok('pmba.axe taunt returns after the 12 s internal cooldown', boss.statuses.has('taunt'));
}

// 5. Ezici Balta hits at most 3 targets
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  p.yaw = 0;
  G.character.save.skillBar.q = 'barbarian_maul';
  for (const [x, z] of [[0, 2], [0.5, 2.2], [-0.5, 2.2], [0.8, 2.6], [-0.8, 2.6]]) H.addEnemy(x, z, { hp: 1e6 });
  H.step(2);
  p.resource = 100; // rage decays out of combat: set it after the warm-up steps
  const hits = [];
  const restore = spyStrike('barbarian_maul', hits);
  try { H.tap('q'); H.stepSec(1); } finally { restore(); }
  ok('pmba.maul Ezici Balta caps at 3 targets (5 in the arc)', hits.length === 3 && new Set(hits.map((h) => h.id)).size === 3, `hits=${hits.length}`);
}

// 6. Yarma threat rides the threatMult param (1.5); Paralama and Ezici Balta 2.0
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_warlord';
  p.yaw = 0;
  p.resource = 100;
  H.addEnemy(0, 2, { hp: 1e6 });
  H.step(2);
  const seen = [];
  const origHit = G.combat.playerHitEnemy.bind(G.combat);
  G.combat.playerHitEnemy = (a, t, s) => { if (s.skillId === 'barbarian_cleave') seen.push(s.threatMult); return origHit(a, t, s); };
  try { G.character.save.skillBar.rmb = 'barbarian_cleave'; H.tap('rmb'); H.stepSec(0.8); } finally { G.combat.playerHitEnemy = origHit; }
  ok('pmba.threat Yarma threatMult 1.5 reaches the hit', seen.length >= 1 && seen.every((m) => m === 1.5), `threat=${seen.join(',')}`);
}

// 7. Ani Ölüm: a barbarian execute spends one stack (real StatusEffects, the consume path of SkillSystem.pay).
// barbarian_execute is granted by the talent node s05, so the sim does not cast it from the bar; the knight's execute covers the cast.
{
  const p = H.addPlayer('barbarian');
  p.spec = 'barbarian_butcher';
  p.statuses.apply('sudden_death', 12, { stacks: 2 });
  const r1 = resolveProcMods(p.statuses, 'barbarian_execute');
  ok('pmba.stack barbarian execute: sudden_death makes it free at any HP', !!r1 && r1.costMult === 0 && r1.anyHp);
  consumeProcMods(p.statuses, r1);
  ok('pmba.stack barbarian execute spends one sudden_death stack (2 -> 1)', p.statuses.stacks('sudden_death') === 1, `stacks=${p.statuses.stacks('sudden_death')}`);
  consumeProcMods(p.statuses, resolveProcMods(p.statuses, 'barbarian_execute'));
  ok('pmba.stack the last sudden_death stack goes with the next execute', !p.statuses.has('sudden_death'));
}

// ---- level 1 (owner rule): every spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
for (const sid of ["barbarian_warlord","barbarian_butcher"]) {
  const spec = SPECS[sid];
  const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
  ok(`kit_barbarian.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
}
console.log(fails === 0 ? '\nkit.barbarian (pmba): all checks PASS' : `\nkit.barbarian (pmba): ${fails} FAIL`);
if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
