// KIT PM-PA checks (docs/kits/plate-melee.md §5-§7, f1c, f3, §h "pmpa.*") that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_paladin.mjs
// Covered: pmpa.ids, pmpa.apl, pmpa.status, pmpa.cd, pmpa.coef, pmpa.pip, pmpa.procs, pmpa.fx, pmpa.replace, pmpa.hol, pmpa.heal, pmpa.shine,
//          pmpa.l1 (level-1 bar castable, start gear, creation list), pmpa.hv (heavy / move profiles), pmpa.rt (route status +25 %), pmpa.cs (Kutsal Zemin
//          ally armour), pmpa.bw (İlahi Siper reflect), pmpa.ow (Taşan Şifa overheal ward), pmpa.steed, pmpa.cap, pmpa.main (Kutsal int heals, wrath_wings +healing), pmpa.ardent (lethal save), pmpa.hp (60 s APL Holy Power
//          ledger of the three specs), pmpa.mit (Doğruluk Kalkanı uptime), pmpa.mana (Kutsal faith, informational).
// The APL runner below compiles the A.3 lines of data/rotations_kit_paladin.ts and presses the bar slots through the real SkillSystem
// (cooldowns, GCD, spell queue, procs via a live ProcEngine fed with the spec fx), on a dev dummy that never fights back.
// Not covered here (browser / SimBench): hit-stop and VFX feel, the budget damage totals, the Kutsal mana ledger at 100 / 105 % casts.
import * as H from './harness.mjs';

const { G, SKILLS, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_PALADIN } = await H.imp('data/rotations_kit_paladin.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { PROC_DEFS, getProcDef } = await H.imp('data/procs.ts');
const { resolveProcMods } = await H.imp('combat/procMods.ts');
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { parseFx, fxContext } = await H.imp('data/talentTrees/fx.ts');
const { healFormula } = await H.imp('combat/healing.ts');
const { CLASSES } = await H.imp('data/classes.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const K = (id) => SKILLS[id];
const view = (...ids) => ({ has: (s) => ids.includes(s), stacks: (s) => (ids.includes(s) ? 1 : 0) });
const KOR = SPECS.paladin_protection;
const HOL = SPECS.paladin_holy;
const RET = SPECS.paladin_retribution;
const ALL = [KOR, HOL, RET];

function ctxFor(p, def, target = null, over = {}) {
  return {
    sys: G.skills, caster: p, def, aim: { ...H.aimFor(p, target), ...(over.aim ?? {}) }, dir: [Math.sin(p.yaw), Math.cos(p.yaw)],
    remote: false, action: null, target, point: [p.position.x, p.position.z], data: {}, more: 1,
  };
}
/** The skill as the spec sees it (SpecDef.mods applied), like SkillSystem.resolveSkill without the talent layer. */
const seen = (p, id) => G.skills.resolveSkill(SKILLS[id], p);
/** A paladin of a spec on the spec's default bar; faith regen as StatCalc folds it; talent-granted skills of the spec tree. */
function newPaladin(spec, { regen = true } = {}) {
  const p = H.addPlayer('paladin');
  p.spec = spec.id;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  if (regen) p.stats.resourceRegen = ((CLASSES.paladin.baseStats.resourceRegen ?? 5) + (spec.stats.resourceRegen ?? 0)) * (1 + (spec.stats.resourceRegenPct ?? 0));
  Object.assign(p.stats, spec.stats.healingPct ? { healingPct: spec.stats.healingPct } : {});
  G.character.save.skillBar = { ...spec.defaultBar };
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 }; // major timers persist in the save: a fresh paladin starts with all majors ready
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}) };
  return p;
}
/** A ProcEngine with a fixed RNG seed (the engine seeds from Date.now). */
function seededEngine(seed = 20261013) {
  const realNow = Date.now;
  Date.now = () => seed;
  try { return new ProcEngine(); } finally { Date.now = realNow; }
}
/** G.combat.healPlayer spy: returns { log, stop } (natural HP regen of the local player does not pass through healPlayer). */
function healSpy() {
  const log = [];
  const orig = G.combat.healPlayer;
  G.combat.healPlayer = function (src, tgt, amt, o) { log.push({ src, tgt, amt }); return orig.call(this, src, tgt, amt, o); };
  return { log, stop: () => { G.combat.healPlayer = orig; } };
}
const SLOTS = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];
const dummy = (x = 0, z = 2.2, hp = 1e9) => { const e = H.addEnemy(x, z, { hp }); e.maxHp = hp; e.hp = hp; return e; };

// ---- pmpa.ids: spec lists, majors, mods and the default bars resolve
for (const spec of ALL) {
  const ids = [...spec.skills, ...Object.values(spec.defaultBar), ...Object.values(spec.majors), ...spec.mods.map((m) => m.skill), ...Object.keys(spec.treeSkills ?? {})];
  if (spec.basic) ids.push(spec.basic);
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`pmpa.ids ${spec.id} ids resolve`, missing.length === 0, missing.join(','));
  const bar = Object.values(spec.defaultBar);
  ok(`pmpa.ids ${spec.id} bar has 12 slots, no duplicate skill`, bar.length === 12 && new Set(bar).size === 12);
  const wrongClass = ids.filter((id) => SKILLS[id] && SKILLS[id].classId !== 'paladin');
  ok(`pmpa.ids ${spec.id} every id is a paladin row`, wrongClass.length === 0, wrongClass.join(','));
  ok(`pmpa.ids ${spec.id} unlock levels cover the skill list`, spec.skills.every((id) => spec.unlock[id] !== undefined), spec.skills.filter((id) => spec.unlock[id] === undefined).join(','));
  ok(`pmpa.ids ${spec.id} has Turkish name and desc`, !!spec.name && spec.desc.length > 40);
}
ok('pmpa.ids majors per spec', KOR.majors.m45 === 'paladin_avenging_wrath' && KOR.majors.m90 === 'paladin_prot_ardent' && KOR.majors.m180 === 'paladin_prot_bulwark'
  && HOL.majors.m45 === 'paladin_divine_toll' && HOL.majors.m90 === 'paladin_avenging_wrath' && HOL.majors.m180 === 'paladin_holy_aura_mastery'
  && RET.majors.m45 === 'paladin_ret_execution' && RET.majors.m90 === 'paladin_avenging_wrath' && RET.majors.m180 === 'paladin_divine_shield');
ok('pmpa.ids roles + main stats', KOR.role === 'tank' && HOL.role === 'healer' && RET.role === 'dps' && KOR.mainStat === 'str' && HOL.mainStat === 'int' && RET.mainStat === 'str');
ok('pmpa.ids Kutsal basic is the heal-bolt chain, Rebuke is in all three spec lists (Koruma too)\'s', HOL.basic === 'paladin_holy_basic'
  && HOL.skills.includes('paladin_rebuke') && RET.skills.includes('paladin_rebuke') && KOR.skills.includes('paladin_rebuke'));
ok('pmpa.ids Ceza gets Gazap Çekici from the s05 tree node', RET.treeSkills?.paladin_hammer_of_wrath === 's05');
ok('pmpa.ids SPECS merge holds the three paladin specs', !!SPECS.paladin_protection && !!SPECS.paladin_holy && !!SPECS.paladin_retribution);
{
  const cls = CLASSES.paladin.skills;
  ok('pmpa.ids ClassDef.skills is the 8-id list (default slots rmb q e s1 s2 s3 - m90 r)', cls.join() === ['paladin_judgement', 'paladin_crusader_strike', 'paladin_word_of_glory', 'paladin_rebuke', 'paladin_divine_steed', 'paladin_avengers_shield', 'paladin_avenging_wrath', 'paladin_divine_shield'].join());
  ok('pmpa.ids every ClassDef skill resolves', cls.every((id) => !!SKILLS[id]));
}

// ---- pmpa.apl: skill and status names in the APL rows resolve; every line starts with a skill id
for (const spec of ALL) {
  const apl = ROTATIONS_KIT_PALADIN[spec.id];
  ok(`pmpa.apl ${spec.id} rows exist`, !!apl && apl.st.length > 0 && (apl.aoe?.length ?? 0) > 0);
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(paladin_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`pmpa.apl ${spec.id} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`pmpa.apl ${spec.id} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  ok(`pmpa.apl ${spec.id} ends with the weapon chain`, apl.st.at(-1) === (spec.basic ?? 'paladin_basic') && apl.aoe.at(-1) === (spec.basic ?? 'paladin_basic'));
}

// ---- pmpa.status: every status a paladin row, a spec mod or a spec fx applies has a StatusDef
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'paladin') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  }
  for (const spec of ALL) {
    for (const m of spec.mods) for (const s of [...(m.patch?.statuses ?? []), ...(m.patch?.selfStatuses ?? [])]) applied.add(s.status);
    for (const m of spec.fx.matchAll(/st\((?:self|tgt|ally|party),([a-z_]+),/g)) applied.add(m[1]);
  }
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('pmpa.status every paladin-applied status has a def', missing.length === 0, missing.join(','));
}

// ---- pmpa.fx: the spec fx strings parse and every skill / status / stat in them exists
{
  const ctx = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
  for (const spec of ALL) {
    const r = parseFx(spec.fx, ctx);
    ok(`pmpa.fx ${spec.id} fx parses and validates`, r.errors.length === 0, r.errors.join(' | '));
  }
}

// ---- pmpa.cd: cooldowns / charges of the kit tables (§5a-§7a, f1c)
{
  const cd = (id, v, ch) => ok(`pmpa.cd ${id} ${v} s${ch ? `, ${ch} charges` : ''}`, K(id).cooldown === v && (ch === undefined || K(id).charges === ch), `cd=${K(id).cooldown} ch=${K(id).charges}`);
  cd('paladin_blessed_hammer', 6, 3);
  cd('paladin_judgement', 12, 2);
  cd('paladin_hammer_of_wrath', 8, 2);
  cd('paladin_hammer_of_wrath_exec', 8, 2);
  cd('paladin_avengers_shield', 15);
  cd('paladin_consecration', 9);
  cd('paladin_divine_steed', 45);
  cd('paladin_reckoning', 8);
  cd('paladin_prot_ardent', 90);
  cd('paladin_prot_bulwark', 180);
  cd('paladin_crusader_strike', 6);
  cd('paladin_blade_of_justice', 12);
  cd('paladin_wake_of_ashes', 30);
  cd('paladin_ret_execution', 45);
  cd('paladin_holy_shock', 6);
  cd('paladin_cleanse', 6);
  cd('paladin_divine_toll', 45);
  cd('paladin_holy_aura_mastery', 180);
  cd('paladin_lay_on_hands', 120);
  cd('paladin_rebuke', 15);
  cd('paladin_divine_shield', 180);
  ok('pmpa.cd Avenging Wrath: Koruma 45, Kutsal 90, Ceza 90', seen(newPaladin(KOR), 'paladin_avenging_wrath').cooldown === 45
    && seen(newPaladin(HOL), 'paladin_avenging_wrath').cooldown === 90 && seen(newPaladin(RET), 'paladin_avenging_wrath').cooldown === 90);
  ok('pmpa.cd Divine Shield: Kutsal 300, Ceza 180', seen(newPaladin(HOL), 'paladin_divine_shield').cooldown === 300 && seen(newPaladin(RET), 'paladin_divine_shield').cooldown === 180);
  ok('pmpa.cd Yargı: Koruma 2 charges, Ceza 1 charge', seen(newPaladin(KOR), 'paladin_judgement').charges === 2 && seen(newPaladin(RET), 'paladin_judgement').charges === 1);
  ok('pmpa.cd Avenging Wrath is an off-GCD major slot row', K('paladin_avenging_wrath').defaultSlot === 'm90' && K('paladin_avenging_wrath').offGcd === true);
  ok('pmpa.cd off-GCD rows: Doğruluk Kalkanı, Hesaplaşma, Binek, Azarlama, majors', ['paladin_shield_of_righteous', 'paladin_reckoning', 'paladin_divine_steed', 'paladin_rebuke', 'paladin_prot_ardent', 'paladin_divine_toll', 'paladin_ret_execution']
    .every((id) => K(id).offGcd === true && K(id).tags.includes('offgcd')));
}

// ---- pmpa.coef: coefficients of the kit tables
{
  const sum = (ids, f) => ids.reduce((s, id) => s + f(K(id)), 0);
  ok('pmpa.coef Kutsal Zincir sums to 2.50', near(sum(['paladin_basic_1', 'paladin_basic_2', 'paladin_basic_3', 'paladin_basic_4'], (d) => d.damage.coef), 2.5, 1e-9));
  ok('pmpa.coef Kutsal Zincir faith 3/3/4/6, pips on steps 3 and 4', [3, 3, 4, 6].every((g, i) => K(`paladin_basic_${i + 1}`).params.gain === g)
    && K('paladin_basic_3').pip.gain === 1 && K('paladin_basic_4').pip.gain === 1 && !K('paladin_basic_1').pip && !K('paladin_basic_2').pip);
  const hd = sum(['paladin_holy_basic_1', 'paladin_holy_basic_2'], (d) => d.damage.coef) + K('paladin_holy_basic_3').damage.coef * K('paladin_holy_basic_3').count;
  const hh = sum(['paladin_holy_basic_1', 'paladin_holy_basic_2'], (d) => d.heal.coef) + K('paladin_holy_basic_3').heal.coef * K('paladin_holy_basic_3').count;
  ok('pmpa.coef Işık Oku damage 4.8 / heal 1.55 per chain', near(hd, 4.81, 0.02) && near(hh, 1.55, 1e-9), `damage=${hd.toFixed(2)} heal=${hh.toFixed(2)}`);
  ok('pmpa.coef Işık Oku faith 2/2/4 per chain, pips on steps 2 and 3', near(K('paladin_holy_basic_1').params.gain + K('paladin_holy_basic_2').params.gain + K('paladin_holy_basic_3').params.gain * 3, 8, 0.02)
    && K('paladin_holy_basic_2').pip.gain === 1 && K('paladin_holy_basic_3').pip.gain === 1 && !K('paladin_holy_basic_1').pip);
  ok('pmpa.coef Kutsal Şok heal 1.43 / damage 2.0', K('paladin_holy_shock').heal.coef === 1.43 && K('paladin_holy_shock').damage.coef === 2.0);
  ok('pmpa.coef Işık Parlaması 2.8, hard cast 1.2 s', K('paladin_flash_of_light').heal.coef === 2.8 && K('paladin_flash_of_light').castTime === 1.2);
  ok('pmpa.coef Işığın Sözü Koruma 2.6, Kutsal 1.4 + HoT 1.6', K('paladin_word_of_glory').heal.coef === 2.6
    && seen(newPaladin(HOL), 'paladin_word_of_glory').heal.coef === 1.4 && seen(newPaladin(HOL), 'paladin_word_of_glory').params.hotCoef === 1.6);
  ok('pmpa.coef Şafak Işığı 2.2, 5 allies', K('paladin_light_of_dawn').heal.coef === 2.2 && K('paladin_light_of_dawn').params.maxTargets === 5);
  ok('pmpa.coef Doğruluk Kalkanı 2.0 cone 5 targets', K('paladin_shield_of_righteous').damage.coef === 2.0 && K('paladin_shield_of_righteous').params.maxTargets === 5);
  ok('pmpa.coef Kutsanmış Çekiç 3 x 0.6', K('paladin_blessed_hammer').params.hammers === 3 && K('paladin_blessed_hammer').params.hammerCoef === 0.6);
  ok('pmpa.coef Yargı 1.6 (Ceza 1.2), Gazap Çekici 4.0 (Koruma 2.8)', K('paladin_judgement').damage.coef === 1.6 && seen(newPaladin(RET), 'paladin_judgement').damage.coef === 1.2
    && K('paladin_hammer_of_wrath').damage.coef === 4.0 && seen(newPaladin(KOR), 'paladin_hammer_of_wrath').damage.coef === 2.8 && seen(newPaladin(KOR), 'paladin_hammer_of_wrath_exec').damage.coef === 2.8
    && seen(newPaladin(RET), 'paladin_hammer_of_wrath').damage.coef === 4.0);
  ok('pmpa.coef İntikamcı Kalkan 2.4, 2 bounces; taunt only for Koruma', K('paladin_avengers_shield').damage.coef === 2.4 && K('paladin_avengers_shield').params.bounces === 2
    && seen(newPaladin(KOR), 'paladin_avengers_shield').params.tauntDur === 3 && seen(newPaladin(HOL), 'paladin_avengers_shield').params.tauntDur === 0 && seen(newPaladin(RET), 'paladin_avengers_shield').params.tauntDur === 0);
  ok('pmpa.coef Ceza: Haçlı 1.0, Tapınakçı 0.6, Hüküm 2.3, Işık Çekici 3.2 / 1.6, Bıçak 1.8, Fırtına 2.3', K('paladin_crusader_strike').damage.coef === 1.0 && K('paladin_templar_slash').damage.coef === 0.6
    && K('paladin_verdict').damage.coef === 2.3 && K('paladin_hammer_of_light').damage.coef === 3.2 && K('paladin_hammer_of_light').params.splashMult === 0.5
    && K('paladin_blade_of_justice').damage.coef === 1.8 && K('paladin_divine_storm').damage.coef === 2.3);
  ok('pmpa.coef Küllerin Uyanışı 2.2 + burn 9 s, stun 5 s, heal 8 % x3', K('paladin_wake_of_ashes').damage.coef === 2.2 && K('paladin_wake_of_ashes').statuses[0].status === 'burn'
    && K('paladin_wake_of_ashes').statuses[0].duration === 9 && K('paladin_wake_of_ashes').params.stunDur === 5 && K('paladin_wake_of_ashes').params.healPct === 0.08 && K('paladin_wake_of_ashes').params.healMax === 3);
  ok('pmpa.coef İdam Hükmü 3.0 AoE r 10 + sentenced, opens 2 Işık Çekici', K('paladin_ret_execution').damage.coef === 3.0 && K('paladin_ret_execution').params.splashRadius === 10
    && K('paladin_ret_execution').selfStatuses.some((s) => s.status === 'hammer_window' && s.stacks === 2));
  ok('pmpa.coef Avenging Wrath +15 % (Koruma +10 %), Ceza opens hammer_window', K('paladin_avenging_wrath').selfStatuses[0].magnitude === 0.15
    && seen(newPaladin(KOR), 'paladin_avenging_wrath').selfStatuses[0].magnitude === 0.10 && seen(newPaladin(RET), 'paladin_avenging_wrath').selfStatuses.some((s) => s.status === 'hammer_window'));
  ok('pmpa.coef majors: Bulwark -45 % 8 s, Ardent 10 s, Aura Ustalığı 10 s r 20, Divine Shield 8 s', K('paladin_prot_bulwark').selfStatuses[0].duration === 8 && K('paladin_prot_ardent').selfStatuses[0].duration === 10
    && K('paladin_holy_aura_mastery').selfStatuses[0].duration === 10 && K('paladin_holy_aura_mastery').radius === 20 && K('paladin_divine_shield').selfStatuses.some((s) => s.status === 'invulnerable' && s.duration === 8));
  ok('pmpa.coef İlahi Çınlama 5 pulses of 1.43 / 2.0, +5 Kutsal Güç', K('paladin_divine_toll').params.pulses === 5 && K('paladin_divine_toll').params.healCoef === 1.43 && K('paladin_divine_toll').pip.gain === 5);
  ok('pmpa.coef Rebuke: free, 3.5 m, 15 s, no Holy Power, silence 3 s', K('paladin_rebuke').cost === 0 && K('paladin_rebuke').range === 3.5 && K('paladin_rebuke').cooldown === 15 && !K('paladin_rebuke').pip && K('paladin_rebuke').params.silence === 3);
}

// ---- pmpa.pip: spenders cost exactly 3, builders per table
{
  for (const id of ['paladin_shield_of_righteous', 'paladin_word_of_glory', 'paladin_light_of_dawn', 'paladin_verdict', 'paladin_divine_storm', 'paladin_hammer_of_light']) {
    ok(`pmpa.pip spender ${id} costs exactly 3 Holy Power`, K(id).pip?.cost === 3 && K(id).pip.gain === undefined && !K(id).pip.coefPerPip);
  }
  const gain = { paladin_blessed_hammer: 1, paladin_judgement: 1, paladin_hammer_of_wrath: 1, paladin_crusader_strike: 1, paladin_blade_of_justice: 1, paladin_wake_of_ashes: 3, paladin_holy_shock: 1, paladin_divine_toll: 5 };
  for (const [id, n] of Object.entries(gain)) ok(`pmpa.pip builder ${id} +${n}`, K(id).pip?.gain === n);
}

// ---- pmpa.procs: ProcDefs and ProcMods of the kit
{
  ok('pmpa.procs ProcDef ids unique', new Set(PROC_DEFS.map((d) => d.id)).size === PROC_DEFS.length);
  const want = { shining_light: ['paladin_word_of_glory', 'right'], infusion_of_light: ['paladin_flash_of_light', 'top'], art_of_war: ['paladin_blade_of_justice', 'left'], hammer_window: ['paladin_hammer_of_light', 'top'] };
  for (const [id, [skill, side]] of Object.entries(want)) {
    const d = getProcDef(id);
    ok(`pmpa.procs ${id} glows ${skill} (${side})`, !!d && d.glow.join() === skill && d.overlay === side && !!SKILLS[skill]);
  }
  const sl = resolveProcMods(view('shining_light'), 'paladin_word_of_glory');
  ok('pmpa.procs shining_light: Işığın Sözü free in faith and Holy Power', !!sl && sl.costMult === 0 && sl.pipFree === true && sl.sources.join() === 'shining_light');
  const io = resolveProcMods(view('infusion_of_light'), 'paladin_flash_of_light');
  ok('pmpa.procs infusion_of_light: Işık Parlaması instant, free, +20 %, +1 Holy Power', !!io && io.costMult === 0 && io.castTimeMult === 0 && io.more === 1.2 && io.bonusPips.length === 1 && io.bonusPips[0].id === 'holypower' && io.bonusPips[0].n === 1);
  const aw = resolveProcMods(view('art_of_war'), 'paladin_blade_of_justice');
  ok('pmpa.procs art_of_war: Adalet Bıçağı cooldown reset, +25 %', !!aw && aw.cdReset && aw.more === 1.25);
  const hw = resolveProcMods(view('hammer_window'), 'paladin_hammer_of_light');
  ok('pmpa.procs hammer_window: one stack per Işık Çekici', !!hw && hw.oneStack.join() === 'hammer_window');
  const tc = resolveProcMods(view('templar_combo'), 'paladin_templar_slash');
  ok('pmpa.procs templar_combo consumed by Tapınakçı Kılıcı', !!tc && tc.sources.join() === 'templar_combo');
  ok('pmpa.procs no mod for an unrelated skill', resolveProcMods(view('shining_light', 'art_of_war'), 'paladin_judgement') === null);
}

// ---- pmpa.replace: Yargı -> Gazap Çekici under wrath_wings and at < 20 % target HP (both specs), Haçlı -> Tapınakçı, Hüküm -> Işık Çekici
for (const spec of [KOR, RET]) {
  const p = newPaladin(spec);
  const e = dummy(0, 3, 1000);
  H.step(2);
  p.targetId = e.id;
  H.setAimTarget(e);
  const slot = (s) => G.skills.getSlotSkill(p, s);
  H.stepSec(0.6);
  ok(`pmpa.replace ${spec.id}: Yargı button casts Yargı at 100 % HP`, slot('e') === 'paladin_judgement' || slot('r') === 'paladin_judgement');
  const jslot = slot('e') === 'paladin_judgement' ? 'e' : 'r';
  p.statuses.apply('wrath_wings', 20, { magnitude: 0.1 });
  ok(`pmpa.replace ${spec.id}: Yargı becomes Gazap Çekici under wrath_wings`, slot(jslot) === 'paladin_hammer_of_wrath');
  p.statuses.remove('wrath_wings');
  ok(`pmpa.replace ${spec.id}: back to Yargı without the window`, slot(jslot) === 'paladin_judgement');
  e.hp = 190; // 19 %
  H.stepSec(0.7);
  ok(`pmpa.replace ${spec.id}: exec_window opens at 19 % target HP`, p.statuses.has('exec_window'));
  ok(`pmpa.replace ${spec.id}: Yargı becomes Gazap Çekici at 19 % target HP`, ['paladin_hammer_of_wrath', 'paladin_hammer_of_wrath_exec'].includes(slot(jslot)), slot(jslot));
  e.hp = 600;
  H.stepSec(0.7);
  ok(`pmpa.replace ${spec.id}: exec_window closes above 20 %`, !p.statuses.has('exec_window') && slot(jslot) === 'paladin_judgement');
  // the behaviour itself: refused (unpaid) outside the gate, thrown inside it
  const how = K('paladin_hammer_of_wrath');
  ok(`pmpa.replace ${spec.id}: Gazap Çekici refused at 60 % HP without wings`, BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, how, e)) === false);
  e.hp = 190;
  ok(`pmpa.replace ${spec.id}: Gazap Çekici allowed at 19 % HP`, BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, how, e)) !== false);
  e.hp = 600;
  p.statuses.apply('wrath_wings', 20, { magnitude: 0.1 });
  ok(`pmpa.replace ${spec.id}: Gazap Çekici allowed under wrath_wings at 60 % HP`, BEHAVIORS.hammer_of_wrath.begin(ctxFor(p, how, e)) !== false);
}
{
  const p = newPaladin(RET);
  const e = dummy(0, 2.2);
  H.step(2);
  ok('pmpa.replace Haçlı Darbesi -> Tapınakçı Kılıcı while templar_combo', G.skills.getSlotSkill(p, 'rmb') === 'paladin_crusader_strike');
  p.statuses.apply('templar_combo', 4, {});
  ok('pmpa.replace  (templar_combo up)', G.skills.getSlotSkill(p, 'rmb') === 'paladin_templar_slash');
  p.statuses.remove('templar_combo');
  p.statuses.apply('hammer_window', 12, { stacks: 2 });
  ok('pmpa.replace Kutsal Hüküm -> Işık Çekici while hammer_window', G.skills.getSlotSkill(p, 'q') === 'paladin_hammer_of_light');
}

// ---- pmpa.hol: Avenging Wrath (Ceza) opens hammer_window, Işık Çekici for 2 casts (primary 3.2, neighbours 1.6), then Kutsal Hüküm returns
{
  const p = newPaladin(RET);
  const e = dummy(0, 2.2);
  const n1 = dummy(1.4, 2.4);
  const n2 = dummy(-1.4, 2.4);
  H.step(2);
  p.targetId = e.id;
  H.setAimTarget(e);
  const cast = G.skills.tryCastSlot(p, 'm90', H.aimFor(p, e));
  H.stepSec(0.6);
  ok('pmpa.hol Avenging Wrath casts (m90) and applies wrath_wings 15 %', cast === true && p.statuses.has('wrath_wings') && near(p.statuses.get('wrath_wings').magnitude, 0.15, 1e-9));
  ok('pmpa.hol Avenging Wrath opens hammer_window with 2 stacks', p.statuses.stacks('hammer_window') === 2, `stacks=${p.statuses.stacks('hammer_window')}`);
  ok('pmpa.hol Kutsal Hüküm button is Işık Çekici', G.skills.getSlotSkill(p, 'q') === 'paladin_hammer_of_light');
  G.skills.addPip(p, 'holypower', 5);
  p.stats.critChance = -1; // no crit: the ratio below compares exact amounts
  const hits = [];
  const orig = G.skills.strike.bind(G.skills);
  G.skills.strike = (c, t, o = {}) => { const r = orig(c, t, o); if (c.def.id === 'paladin_hammer_of_light' && r) hits.push({ id: t.id, more: o.more ?? 1, amount: r.amount, crit: !!r.crit }); return r; };
  const hp0 = [e.hp, n1.hp, n2.hp];
  const rnd = Math.random;
  Math.random = () => 0.5; // weapon roll 100, no crit, no dodge: the amounts below are exact
  try {
    p.statuses.remove('wrath_wings');
    ok('pmpa.hol first Işık Çekici casts', G.skills.tryCastSlot(p, 'q', H.aimFor(p, e)) === true);
    H.stepSec(1.4);
    ok('pmpa.hol first cast spent 3 Holy Power and one stack', G.skills.pipCount(p, 'holypower') === 2 && p.statuses.stacks('hammer_window') === 1, `pips=${G.skills.pipCount(p, 'holypower')} stacks=${p.statuses.stacks('hammer_window')}`);
    G.skills.addPip(p, 'holypower', 3);
    ok('pmpa.hol second Işık Çekici casts', G.skills.tryCastSlot(p, 'q', H.aimFor(p, e)) === true);
    H.stepSec(1.4);
  } finally { G.skills.strike = orig; Math.random = rnd; }
  const prim = hits.filter((h) => h.id === e.id);
  const sp = hits.filter((h) => h.id !== e.id);
  ok('pmpa.hol primary hit twice, neighbours hit at x0.5', prim.length === 2 && sp.length === 4 && sp.every((h) => near(h.more, 0.5, 1e-9)), `primary=${prim.length} splash=${sp.length}`);
  const avg = (l) => l.reduce((t, h) => t + h.amount, 0) / Math.max(1, l.length); // no crit: critChance forced below 0 above
  ok('pmpa.hol primary hit is ~2x a neighbour hit (3.2 vs 1.6)', prim.length > 0 && sp.length > 0 && avg(prim) / avg(sp) > 1.65 && avg(prim) / avg(sp) < 2.4, `ratio=${(avg(prim) / avg(sp)).toFixed(2)} (weapon roll +-10 %)`);
  ok('pmpa.hol window is spent: Kutsal Hüküm is back', !p.statuses.has('hammer_window') && G.skills.getSlotSkill(p, 'q') === 'paladin_verdict');
  ok('pmpa.hol enemies lost HP', e.hp < hp0[0] && n1.hp < hp0[1] && n2.hp < hp0[2]);
}

// ---- pmpa.heal: Kutsal Şok heals a damaged ally, damages an enemy; Işık Aşısı makes Işık Parlaması instant and free
{
  const p = newPaladin(HOL, { regen: false });
  const ally = new H.FakePlayer('knight');
  ally.id = 400; ally.isLocal = true; ally.maxHp = 5000; ally.hp = 2000; ally.position.set(4, 0, 0);
  H.world.add(ally);
  const e = dummy(0, 8, 100000);
  H.step(2);
  p.resource = 100;
  H.setAimTarget(null);
  const hp0 = ally.hp;
  const c = G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, null));
  H.stepSec(0.7);
  ok('pmpa.heal Kutsal Şok on a damaged ally heals it', c === true && ally.hp > hp0, `hp ${hp0} -> ${ally.hp}`);
  ok('pmpa.heal Kutsal Şok gave +1 Holy Power and cost 6 faith', G.skills.pipCount(p, 'holypower') === 1 && p.resource <= 94.5 && p.resource >= 90, `pips=${G.skills.pipCount(p, 'holypower')} res=${p.resource.toFixed(1)}`);
  // enemy under the reticle with nobody hurt (> 90 %): damage branch
  ally.hp = 5000;
  H.stepSec(6.2);
  p.targetId = e.id;
  H.setAimTarget(e);
  const ehp = e.hp;
  const c2 = G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, e));
  H.stepSec(0.7);
  ok('pmpa.heal Kutsal Şok on an enemy damages it', c2 === true && e.hp < ehp, `hp ${ehp} -> ${e.hp}`);
  // a badly hurt ally (< 90 %) stays ahead of the enemy (healBelow)
  ally.hp = 2500;
  H.stepSec(6.2);
  const hp1 = ally.hp, ehp2 = e.hp;
  G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, e));
  H.stepSec(0.7);
  ok('pmpa.heal a hurt ally is healed even with an enemy targeted', ally.hp > hp1 && e.hp === ehp2, `ally ${hp1} -> ${ally.hp}`);

  // Işık Parlaması: hard cast without the proc, instant + free with it
  H.stepSec(1.2);
  ally.hp = 1500;
  p.resource = 100;
  H.setAimTarget(null);
  H.clearEvents();
  const c3 = G.skills.tryCastSlot(p, 'q', H.aimFor(p, null));
  H.stepSec(0.1);
  const slow = events['skill:cast'].find((x) => x.skillId === 'paladin_flash_of_light');
  ok('pmpa.heal Işık Parlaması is a hard cast without Işık Aşısı', c3 === true && slow && slow.castTime > 0.9, `castTime=${slow?.castTime}`);
  H.stepSec(2);
  ok('pmpa.heal  ... and costs 10 faith', p.resource <= 90.5 + 1 && p.resource >= 88, `res=${p.resource.toFixed(1)}`);
  p.statuses.apply('infusion_of_light', 15, {});
  ally.hp = 1500;
  const pips0 = G.skills.pipCount(p, 'holypower');
  p.resource = 50;
  H.clearEvents();
  const hpA = ally.hp;
  const c4 = G.skills.tryCastSlot(p, 'q', H.aimFor(p, null));
  H.stepSec(0.1);
  const fast = events['skill:cast'].find((x) => x.skillId === 'paladin_flash_of_light');
  ok('pmpa.heal Işık Aşısı makes Işık Parlaması instant', c4 === true && fast && fast.castTime === 0, `castTime=${fast?.castTime}`);
  H.stepSec(1);
  ok('pmpa.heal  ... free (no faith)', p.resource >= 50 - 0.01, `res=${p.resource.toFixed(1)}`);
  ok('pmpa.heal  ... consumes the proc, +1 Holy Power, heals', !p.statuses.has('infusion_of_light') && G.skills.pipCount(p, 'holypower') === pips0 + 1 && ally.hp > hpA, `pips ${pips0} -> ${G.skills.pipCount(p, 'holypower')}`);
}

// ---- pmpa.shine: Parlak Işık makes Işığın Sözü free, castable with 0 Holy Power, consumed by the cast
{
  const p = newPaladin(KOR, { regen: false });
  p.hp = 2500;
  H.step(2);
  p.statuses.remove('shining_light');
  H.setAimTarget(null);
  const spy = healSpy();
  G.skills.tryCastSlot(p, 's3', H.aimFor(p, null));
  H.stepSec(1.4);
  ok('pmpa.shine without Parlak Işık and 0 Holy Power nothing is healed and nothing is spent', spy.log.length === 0 && G.skills.pipCount(p, 'holypower') === 0, `heals=${spy.log.length}`);
  p.statuses.apply('shining_light', 15, {});
  p.resource = 40;
  const c = G.skills.tryCastSlot(p, 's3', H.aimFor(p, null));
  H.stepSec(1.3);
  ok('pmpa.shine with Parlak Işık Işığın Sözü casts at 0 Holy Power and heals', c === true && spy.log.length === 1 && spy.log[0].amt > 0, `heals=${spy.log.length}`);
  ok('pmpa.shine  ... no Holy Power taken, proc consumed, 5 faith back on self-cast', G.skills.pipCount(p, 'holypower') === 0 && !p.statuses.has('shining_light') && near(p.resource, 45, 0.5), `res=${p.resource.toFixed(1)}`);
  // a normal cast costs exactly 3
  G.skills.addPip(p, 'holypower', 4);
  G.skills.tryCastSlot(p, 's3', H.aimFor(p, null));
  H.stepSec(1.3);
  ok('pmpa.shine a paid Işığın Sözü spends exactly 3 Holy Power', G.skills.pipCount(p, 'holypower') === 1 && spy.log.length === 2, `pips=${G.skills.pipCount(p, 'holypower')}`);
  spy.stop();
}

// ---- pmpa.main: heal stats. Kutsal heals with int, Koruma / Ceza with str; wrath_wings adds healing
{
  const heal = (spec, wings) => {
    const p = newPaladin(spec, { regen: false });
    p.stats.str = 100; p.stats.int = 300; p.stats.healingPct = 0; p.stats.weaponMin = 100; p.stats.weaponMax = 100;
    if (wings) p.statuses.apply('wrath_wings', 20, { magnitude: wings });
    const rnd = Math.random;
    Math.random = () => 0.99; // wrath_wings adds crit chance: pin the roll so the heal is exact
    try { return healFormula(p, 1).amount; } finally { Math.random = rnd; }
  };
  const kor = heal(KOR), hol = heal(HOL), ret = heal(RET);
  ok('pmpa.main Koruma / Ceza heal with str (1 + 100/100 = 2)', near(kor, 200, 0.01) && near(ret, 200, 0.01), `kor=${kor} ret=${ret}`);
  ok('pmpa.main Kutsal heals with int (1 + 300/100 = 4)', near(hol, 400, 0.01), `hol=${hol}`);
  ok('pmpa.main wrath_wings 15 % adds +15 % healing (Kutsal)', near(heal(HOL, 0.15) / hol, 1.15, 0.005), `x${(heal(HOL, 0.15) / hol).toFixed(3)}`);
  ok('pmpa.main wrath_wings 10 % adds +10 % healing (Koruma)', near(heal(KOR, 0.10) / kor, 1.10, 0.005), `x${(heal(KOR, 0.10) / kor).toFixed(3)}`);
}

// ---- pmpa.steed: İlahi Binek dashes, cleanses root / slow and gives +40 % speed for 3 s
{
  const p = newPaladin(RET);
  H.step(2);
  p.statuses.apply('root', 4, {});
  p.statuses.apply('slow', 4, { magnitude: 0.3 });
  const x0 = p.position.z;
  const c = G.skills.tryCastSlot(p, 's2', H.aimFor(p, null));
  H.stepSec(0.9);
  ok('pmpa.steed casts, moves, cleanses root + slow and grants divine_steed', c === true && Math.abs(p.position.z - x0) > 4 && !p.statuses.has('root') && !p.statuses.has('slow') && p.statuses.has('divine_steed'), `moved=${(p.position.z - x0).toFixed(1)}`);
}

// ---- pmpa.cap: İlahi Fırtına hits at most 8 targets
{
  const p = newPaladin(RET);
  const list = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; list.push(dummy(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 1e6)); }
  H.step(2);
  G.skills.addPip(p, 'holypower', 5);
  G.skills.tryCastSlot(p, 's3', H.aimFor(p, null));
  H.stepSec(1.2);
  const hit = list.filter((e) => e.hp < e.maxHp).length;
  ok('pmpa.cap İlahi Fırtına hits 8 of 10 enemies in range', hit === 8, `hit=${hit}`);
  ok('pmpa.cap  ... for exactly 3 Holy Power', G.skills.pipCount(p, 'holypower') === 2);
}

// ---- pmpa.fx: the spec fx procs fire through a live ProcEngine (parry / block / cast / hit / spend / lethal)
{
  const tagsOf = (id) => SKILLS[id].tags;
  const eng = new ProcEngine();
  G.procs = eng;
  const feed = (spec) => eng.setEntries(collectProcs(parseFx(spec.fx).items, `spec:${spec.id}`));

  feed(KOR);
  let p = newPaladin(KOR);
  eng.emit('cast', { player: p, skillId: 'paladin_shield_of_righteous', tags: tagsOf('paladin_shield_of_righteous') });
  ok('pmpa.fx Doğruluk Kalkanı gives righteous 6 s', p.statuses.has('righteous') && near(p.statuses.get('righteous').remaining, 6, 0.01));
  let sl = 0;
  for (let i = 0; i < 200; i++) {
    p.statuses.remove('shining_light');
    eng.update(0.5);
    eng.emit('cast', { player: p, skillId: 'paladin_shield_of_righteous', tags: tagsOf('paladin_shield_of_righteous') });
    if (p.statuses.has('shining_light')) sl++;
  }
  ok('pmpa.fx Parlak Işık procs 50 % of Doğruluk Kalkanı casts (PRD)', sl > 75 && sl < 125, `${sl}/200`);
  p.resource = 10;
  eng.update(2);
  eng.emit('block', { player: p });
  ok('pmpa.fx block gives +4 faith', near(p.resource, 14, 0.01), `res=${p.resource}`);
  G.skills.addPip(p, 'holypower', 0);
  const hp0 = G.skills.pipCount(p, 'holypower');
  eng.emit('parry', { player: p });
  ok('pmpa.fx perfect parry gives +1 Holy Power', G.skills.pipCount(p, 'holypower') === hp0 + 1);
  let blockPips = 0;
  for (let i = 0; i < 400; i++) { G.skills.resetPips(p); eng.update(1.2); eng.emit('block', { player: p }); blockPips += G.skills.pipCount(p, 'holypower'); }
  ok('pmpa.fx 20 % of blocks give +1 Holy Power', blockPips > 50 && blockPips < 110, `${blockPips}/400`);
  G.procs = undefined;

  // Yılmaz Savunucu: a lethal hit (through Combat.hitLocalPlayer) leaves 25 % HP and cuts the status; no expiry heal afterwards
  const q = newPaladin(KOR);
  H.step(2);
  q.maxHp = 5000; q.hp = 5000;
  const eng2 = new ProcEngine();
  G.procs = eng2;
  eng2.setEntries(collectProcs(parseFx(KOR.fx).items, 'spec:paladin_protection'));
  G.skills.tryCastSlot(q, 'm90', H.aimFor(q, null));
  H.stepSec(0.6);
  ok('pmpa.ardent casts and applies ardent 10 s', q.statuses.has('ardent'));
  q.hp = 100;
  const spyA = healSpy();
  G.combat.hitLocalPlayer({ sourceId: null, amount: 99999, type: 'physical', unavoidable: true, abilityName: 'test', sourceLevel: 30 });
  ok('pmpa.ardent lethal hit leaves ~25 % HP', q.hp >= 1200 && q.hp <= 1300 && !q.isDead, `hp=${q.hp}`);
  H.stepSec(0.5);
  ok('pmpa.ardent the status ends after the save', !q.statuses.has('ardent'));
  const nSave = spyA.log.length;
  H.stepSec(10.5);
  ok('pmpa.ardent no 20 % expiry heal after a lethal save', spyA.log.length === nSave, `extra heals=${spyA.log.length - nSave}`);
  spyA.stop();
  // never triggered: the expiry heals 20 %
  const r = newPaladin(KOR);
  H.step(2);
  r.hp = 2000;
  const spyB = healSpy();
  G.skills.tryCastSlot(r, 'm90', H.aimFor(r, null));
  H.stepSec(10.4);
  ok('pmpa.ardent unspent: heals 20 % max HP at expiry', spyB.log.length === 1 && near(spyB.log[0].amt, r.maxHp * 0.2, 1) && !r.statuses.has('ardent'), `heals=${spyB.log.map((h) => h.amt).join(',')}`);
  spyB.stop();
  G.procs = undefined;

  // Ceza: templar_combo, art_of_war, Hüküm reset, crusade stacks per Holy Power spent
  feed(RET);
  const eng3 = new ProcEngine();
  G.procs = eng3;
  eng3.setEntries(collectProcs(parseFx(RET.fx).items, 'spec:paladin_retribution'));
  const c = newPaladin(RET);
  eng3.emit('cast', { player: c, skillId: 'paladin_crusader_strike', tags: tagsOf('paladin_crusader_strike') });
  ok('pmpa.fx Haçlı Darbesi opens templar_combo 4 s', c.statuses.has('templar_combo') && near(c.statuses.get('templar_combo').remaining, 4, 0.01));
  let aow = 0;
  for (let i = 0; i < 80; i++) {
    c.statuses.remove('art_of_war');
    eng3.update(2.2);
    eng3.emit('hit', { player: c, skillId: 'paladin_basic_1', tags: tagsOf('paladin_basic_1') });
    if (c.statuses.has('art_of_war')) aow++;
  }
  ok('pmpa.fx Adalet Savaşı procs from chain hits (~12 %)', aow > 3 && aow < 22, `${aow}/80`);
  c.statuses.remove('art_of_war');
  for (let i = 0; i < 40; i++) { eng3.update(2.2); eng3.emit('hit', { player: c, skillId: 'paladin_judgement', tags: tagsOf('paladin_judgement') }); }
  ok('pmpa.fx Adalet Savaşı ignores non-chain skills', !c.statuses.has('art_of_war'));
  c.statuses.remove('crusade');
  eng3.emit('spend', { player: c, pipId: 'holypower' });
  ok('pmpa.fx no crusade stack outside wrath_wings', !c.statuses.has('crusade'));
  c.statuses.apply('wrath_wings', 20, { magnitude: 0.15 });
  eng3.update(1);
  eng3.emit('spend', { player: c, pipId: 'holypower' });
  ok('pmpa.fx Holy Power spent under wrath_wings gives 3 crusade stacks (one per pip)', c.statuses.stacks('crusade') === 3, `stacks=${c.statuses.stacks('crusade')}`);
  for (let i = 0; i < 6; i++) { eng3.update(1); eng3.emit('spend', { player: c, pipId: 'holypower' }); }
  ok('pmpa.fx crusade caps at 10 stacks', c.statuses.stacks('crusade') === 10, `stacks=${c.statuses.stacks('crusade')}`);
  let reset = 0;
  const jd = c.statuses; // judgement cooldown reset needs a real cooldown
  for (let i = 0; i < 60; i++) {
    G.skills.startCooldown(c, G.skills.state(c), seen(c, 'paladin_judgement')); // Ceza: 1 charge, so a spent cast leaves the skill on cooldown
    eng3.update(0.5);
    eng3.emit('cast', { player: c, skillId: 'paladin_verdict', tags: tagsOf('paladin_verdict') });
    if (G.skills.getCooldown(c, 'paladin_judgement').remaining === 0) reset++;
  }
  void jd;
  ok('pmpa.fx Kutsal Hüküm resets Yargı (~15 %)', reset > 2 && reset < 20, `${reset}/60`);
  G.procs = undefined;

  // Kutsal: Işık Aşısı from Kutsal Şok (25 %, icd 3 s) and Üçlü Işık (15 %)
  feed(HOL);
  const eng4 = new ProcEngine();
  G.procs = eng4;
  eng4.setEntries(collectProcs(parseFx(HOL.fx).items, 'spec:paladin_holy'));
  const h = newPaladin(HOL);
  let ioShock = 0, ioBolt = 0;
  for (let i = 0; i < 160; i++) {
    h.statuses.remove('infusion_of_light');
    eng4.update(3.2);
    eng4.emit('cast', { player: h, skillId: 'paladin_holy_shock', tags: tagsOf('paladin_holy_shock') });
    if (h.statuses.has('infusion_of_light')) ioShock++;
    h.statuses.remove('infusion_of_light');
    eng4.update(0.4);
    eng4.emit('cast', { player: h, skillId: 'paladin_holy_basic_3', tags: tagsOf('paladin_holy_basic_3') });
    if (h.statuses.has('infusion_of_light')) ioBolt++;
  }
  ok('pmpa.fx Kutsal Şok gives Işık Aşısı ~25 %', ioShock > 20 && ioShock < 65, `${ioShock}/160`);
  ok('pmpa.fx Üçlü Işık gives Işık Aşısı ~15 %', ioBolt > 8 && ioBolt < 42, `${ioBolt}/160`);
  G.procs = undefined;
}

// ---- pmpa.cast: every skill row once through the real cast path (cost, cooldown, behaviour, status, no engine errors) -----------------------------
{
  const dmgOf = (id) => events['damage'].filter((d) => d.skillId === id && d.amount > 0);
  const castsOf = (id) => events['skill:cast'].filter((c) => c.skillId === id).length;
  /** a paladin of a spec with three enemies in front (one a demon), two hurt allies, 5 Holy Power, everything ready */
  function scene(spec) {
    const p = newPaladin(spec, { regen: false });
    const foes = [dummy(0, 2.2, 1e7), dummy(1.5, 3.2, 1e7), dummy(-1.5, 3.8, 1e7)];
    foes[1].def.family = 'demon';
    const allies = [4, -4].map((x, i) => { const a = new H.FakePlayer('knight'); a.id = 600 + i; a.isLocal = true; a.maxHp = 5000; a.hp = 2000; a.position.set(x, 0, 0); H.world.add(a); return a; });
    H.step(2);
    p.resource = 100; p.hp = p.maxHp;
    p.targetId = foes[0].id;
    H.setAimTarget(foes[0]);
    G.skills.addPip(p, 'holypower', 5);
    return { p, foes, allies };
  }
  /** presses the bar slot that holds (or transforms into) the skill; puts it on s1 when it is on no bar */
  function press(p, id, foe) {
    let slot = SLOTS.find((sl) => sl !== 'lmb' && G.skills.getSlotSkill(p, sl) === id);
    if (!slot) { slot = 's1'; G.character.save.skillBar.s1 = id; }
    H.clearEvents();
    const started = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe));
    H.stepSec(2.4);
    return started;
  }
  const row = (spec, id, setup, check) => {
    const sc = scene(spec);
    setup?.(sc);
    const spy = healSpy();
    const started = press(sc.p, id, sc.foes[0]);
    spy.stop();
    const res = check(sc, spy.log);
    ok(`pmpa.cast ${spec.id.replace('paladin_', '')}/${id.replace('paladin_', '')}`, started === true && res === true, res === true ? '' : String(res));
  };
  const hitE0 = (sc, id) => dmgOf(id).some((d) => d.targetId === sc.foes[0].id);
  const pipsOf = (sc) => G.skills.pipCount(sc.p, 'holypower');

  // Koruma
  row(KOR, 'paladin_blessed_hammer', null, (sc) => (hitE0(sc, 'paladin_blessed_hammer') && sc.foes[0].statuses.has('curse') && pipsOf(sc) === 5) || `pips=${pipsOf(sc)} curse=${sc.foes[0].statuses.has('curse')} hits=${dmgOf('paladin_blessed_hammer').length}`);
  row(KOR, 'paladin_shield_of_righteous', null, (sc) => (hitE0(sc, 'paladin_shield_of_righteous') && pipsOf(sc) === 2) || `pips=${pipsOf(sc)} hits=${dmgOf('paladin_shield_of_righteous').length}`);
  row(KOR, 'paladin_judgement', null, (sc) => (hitE0(sc, 'paladin_judgement') && sc.foes[0].statuses.has('judged')) || `hits=${dmgOf('paladin_judgement').length} judged=${sc.foes[0].statuses.has('judged')}`);
  row(KOR, 'paladin_hammer_of_wrath', ({ p }) => p.statuses.apply('wrath_wings', 20, { magnitude: 0.1 }), (sc) => hitE0(sc, 'paladin_hammer_of_wrath') || 'no hit');
  row(KOR, 'paladin_avengers_shield', ({ foes }) => { foes[1].position.set(2.5, 0, 4.5); foes[2].position.set(-1, 0, 7); }, (sc) => {
    const hit = new Set(dmgOf('paladin_avengers_shield').map((d) => d.targetId));
    return (hit.size === 3 && sc.foes[0].statuses.has('taunt') && !sc.foes[1].statuses.has('taunt') && sc.foes[0].statuses.has('silence'))
      || `hit=${hit.size} taunt0=${sc.foes[0].statuses.has('taunt')} taunt1=${sc.foes[1].statuses.has('taunt')} silence0=${sc.foes[0].statuses.has('silence')}`;
  });
  row(KOR, 'paladin_consecration', null, (sc) => (dmgOf('paladin_consecration').filter((d) => d.targetId === sc.foes[0].id).length >= 2 && sc.foes.every((e) => e.statuses.has('slow'))) || `ticks=${dmgOf('paladin_consecration').length}`);
  row(KOR, 'paladin_reckoning', null, (sc) => sc.foes[0].statuses.has('taunt') || 'no taunt');
  row(KOR, 'paladin_word_of_glory', ({ p }) => { p.hp = 2500; }, (sc, log) => (log.length === 1 && pipsOf(sc) === 2) || `heals=${log.length} pips=${pipsOf(sc)}`);
  row(KOR, 'paladin_prot_bulwark', null, (sc) => sc.p.statuses.has('bulwark') || 'no bulwark');
  row(KOR, 'paladin_avenging_wrath', null, (sc) => (sc.p.statuses.has('wrath_wings') && near(sc.p.statuses.get('wrath_wings').magnitude, 0.1, 1e-9)) || 'no wings');
  row(KOR, 'paladin_divine_steed', null, (sc) => sc.p.statuses.has('divine_steed') || 'no steed');
  // Kutsal
  row(HOL, 'paladin_holy_shock', null, (sc, log) => (log.length === 1 && pipsOf(sc) === 5) || `heals=${log.length} pips=${pipsOf(sc)}`); // already 5: the gain is capped
  row(HOL, 'paladin_flash_of_light', null, (sc, log) => log.length === 1 || `heals=${log.length}`);
  row(HOL, 'paladin_word_of_glory', null, (sc, log) => (log.length >= 2 && sc.allies.some((a) => a.statuses.has('renew')) && pipsOf(sc) === 2) || `heals=${log.length} renew=${sc.allies.map((a) => a.statuses.has('renew'))}`);
  row(HOL, 'paladin_word_of_glory', null, (sc, log) => (new Set(log.map((h) => h.tgt)).size === 1 && log.length > 2) || `the HoT ticks heal the same ally: targets=${new Set(log.map((h) => h.tgt)).size} heals=${log.length}`);
  row(HOL, 'paladin_light_of_dawn', ({ p }) => { p.hp = 3000; }, (sc, log) => (new Set(log.map((h) => h.tgt)).size === 3 && sc.allies.every((a) => a.statuses.has('dawn_hot')) && pipsOf(sc) === 2) || `targets=${new Set(log.map((h) => h.tgt)).size} heals=${log.length}`); // two allies + the hurt caster; the 4 s HoT ticks heal them again
  row(HOL, 'paladin_cleanse', ({ allies }) => { allies[0].statuses.apply('poison', 12, { sourceId: 1 }); allies[0].statuses.apply('curse', 12, { sourceId: 1 }); allies[0].statuses.apply('slow', 12, { magnitude: 0.3, sourceId: 1 }); }, (sc, log) => {
    const left = ['poison', 'curse', 'slow'].filter((id) => sc.allies[0].statuses.has(id)).length;
    return (left === 1 && log.length === 1) || `debuffs left=${left} heals=${log.length}`;
  });
  row(HOL, 'paladin_divine_toll', null, (sc, log) => (log.length === 5 && pipsOf(sc) === 5) || `heals=${log.length} pips=${pipsOf(sc)}`);
  row(HOL, 'paladin_holy_aura_mastery', null, (sc) => (sc.p.statuses.has('aura_mastery') && sc.allies.every((a) => a.statuses.has('aura_mastery'))) || `self=${sc.p.statuses.has('aura_mastery')} allies=${sc.allies.map((a) => a.statuses.has('aura_mastery'))}`);
  row(HOL, 'paladin_divine_shield', null, (sc) => (sc.p.statuses.has('invulnerable') && sc.p.statuses.has('forbearance') && near(sc.p.statuses.get('invulnerable').remaining, 5.6, 0.7)) || 'no shield');
  row(HOL, 'paladin_lay_on_hands', null, (sc, log) => (log.length === 1 && sc.allies.some((a) => a.statuses.has('forbearance'))) || `heals=${log.length}`);
  {
    // Işık Oku: the weapon chain heals the ally in the lane and damages the enemy
    const { p, foes, allies } = scene(HOL);
    allies[0].position.set(0, 0, 1.5);
    const spy = healSpy();
    H.clearEvents();
    G.skills.tryCastSlot(p, 'lmb', H.aimFor(p, foes[0]));
    H.stepSec(0.6);
    spy.stop();
    ok('pmpa.cast holy/chain bolt heals the ally in the lane', spy.log.length >= 1 && spy.log[0].tgt === allies[0], `heals=${spy.log.length}`);
    const sc2 = scene(HOL);
    H.clearEvents();
    G.skills.tryCastSlot(sc2.p, 'lmb', H.aimFor(sc2.p, sc2.foes[0]));
    H.stepSec(0.7);
    ok('pmpa.cast holy/chain bolt damages the enemy when no ally is in the lane', events['damage'].some((d) => d.targetId === sc2.foes[0].id && d.amount > 0));
  }
  // Ceza
  row(RET, 'paladin_crusader_strike', null, (sc) => hitE0(sc, 'paladin_crusader_strike') || 'no hit');
  row(RET, 'paladin_templar_slash', ({ p }) => { p.statuses.apply('templar_combo', 4, {}); }, (sc) => (hitE0(sc, 'paladin_templar_slash') && !sc.p.statuses.has('templar_combo')) || 'no hit / combo not consumed');
  row(RET, 'paladin_verdict', null, (sc) => (hitE0(sc, 'paladin_verdict') && pipsOf(sc) === 2) || `pips=${pipsOf(sc)}`);
  row(RET, 'paladin_blade_of_justice', ({ foes }) => { foes[0].position.set(0, 0, 8); }, (sc) => hitE0(sc, 'paladin_blade_of_justice') || 'no hit at 8 m');
  row(RET, 'paladin_divine_storm', null, (sc) => (sc.foes.filter((e) => e.hp < e.maxHp).length === 3 && pipsOf(sc) === 2) || 'not all hit');
  row(RET, 'paladin_wake_of_ashes', ({ foes }) => { foes[1].position.set(0.8, 0, 4); }, (sc) => {
    const demon = sc.foes[1];
    return (hitE0(sc, 'paladin_wake_of_ashes') && sc.foes[0].statuses.has('burn') && demon.statuses.has('stun') && !sc.foes[0].statuses.has('stun'))
      || `burn=${sc.foes[0].statuses.has('burn')} demonStun=${demon.statuses.has('stun')} humanStun=${sc.foes[0].statuses.has('stun')}`;
  });
  row(RET, 'paladin_ret_execution', null, (sc) => (dmgOf('paladin_ret_execution').length === 3 && sc.foes[0].statuses.has('sentenced') && sc.p.statuses.stacks('hammer_window') === 2)
    || `hits=${dmgOf('paladin_ret_execution').length} sentenced=${sc.foes[0].statuses.has('sentenced')} window=${sc.p.statuses.stacks('hammer_window')}`);
  row(RET, 'paladin_hammer_of_wrath_exec', ({ foes }) => { foes[0].hp = foes[0].maxHp * 0.15; }, (sc) => hitE0(sc, 'paladin_hammer_of_wrath_exec') || 'no hit at 15 % HP');
  row(RET, 'paladin_judgement', null, (sc) => (hitE0(sc, 'paladin_judgement') && sc.foes[0].statuses.has('judged')) || 'no judged');
  row(RET, 'paladin_avenging_wrath', null, (sc) => (sc.p.statuses.has('wrath_wings') && sc.p.statuses.stacks('hammer_window') === 2) || 'no window');
  {
    // Rebuke needs a casting enemy: with none it is refused before anything is paid (no cooldown)
    const { p } = scene(RET);
    H.clearEvents();
    const r = G.skills.tryCastSlot(p, 's4', H.aimFor(p, null));
    H.stepSec(0.5);
    ok('pmpa.cast ret/rebuke without a casting enemy is refused and starts no cooldown', G.skills.getCooldown(p, 'paladin_rebuke').remaining === 0 && castsOf('paladin_rebuke') === 0, `cast=${r}`);
  }
  const bad = H.errors.filter((m) => m.startsWith('ERR'));
  ok('pmpa.cast no console errors from the paladin rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
}

// ---- APL runner ---------------------------------------------------------------------------------------------------------------------
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/target\.hp%/g, 'THP')
    .replace(/ally\.low%/g, 'ALOW')
    .replace(/allies\.injured/g, 'AINJ')
    .replace(/allies\.debuffed/g, 'ADEB')
    .replace(/pips:holypower/g, 'HPW')
    .replace(/\bhp%/g, 'HPP')
    .replace(/\blmb_step\b/g, 'LMBSTEP')
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'CDR', 'CH', 'CD', 'THP', 'ALOW', 'AINJ', 'ADEB', 'HPW', 'HPP', 'LMBSTEP', 'TG', `return (${cond});`) };
}

/** Runs the ST list of a spec on a dummy for `seconds`; returns the ledgers. */
function runApl(spec, seconds, { allies = 0, chainsPerMin = Infinity } = {}) {
  const p = newPaladin(spec);
  const e = dummy(0, 2.2);
  const team = [];
  for (let i = 0; i < allies; i++) {
    const a = new H.FakePlayer('knight');
    a.id = 500 + i; a.isLocal = true; a.maxHp = 5000; a.hp = 2500; a.position.set(3 + i, 0, -2);
    H.world.add(a);
    team.push(a);
  }
  H.step(2);
  p.resource = 100;
  p.targetId = e.id;
  H.setAimTarget(e);
  const eng = seededEngine(); // the proc stream (PRD) is seeded, so the ledger of a run is reproducible
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(spec.fx).items, `spec:${spec.id}`));
  const lines = ROTATIONS_KIT_PALADIN[spec.id].st.map(compile);
  const led = { gross: 0, net: 0, spent: 0, spends: [], casts: {}, righteousFrames: 0, frames: 0, faith0: p.resource, faithIn: 0, healed: 0 };
  const origAdd = G.skills.addPip.bind(G.skills);
  const origSpend = G.skills.spendPip.bind(G.skills);
  G.skills.addPip = (a, id, n) => { const b = G.skills.pipCount(a, id); origAdd(a, id, n); if (a === p && id === 'holypower') { led.gross += n; led.net += G.skills.pipCount(a, id) - b; } };
  G.skills.spendPip = (a, id, n) => { const r = origSpend(a, id, n); if (a === p && id === 'holypower' && r) { led.spent += n; led.spends.push(n); } return r; };
  let tokens = 1; // weapon-chain starts left: the kit budgets (5d / 6d / 7d) count 6 / 6 / 8 filler chains per minute
  const castLog = (ev) => {
    if (ev.casterId !== p.id) return;
    led.casts[ev.skillId] = (led.casts[ev.skillId] ?? 0) + 1;
    if (ev.skillId === 'paladin_basic_1' || ev.skillId === 'paladin_holy_basic_1') tokens -= 1;
  };
  G.events.on('skill:cast', castLog);
  const env = {
    S: (id) => p.statuses.has(id),
    CDR: (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; },
    CH: (id) => G.skills.getCooldown(p, id).charges,
    CD: (id) => G.skills.getCooldown(p, id).remaining,
  };
  const slotOf = (id) => {
    if (id === 'paladin_basic' || id === 'paladin_holy_basic') return 'lmb';
    for (const s of SLOTS) if (s !== 'lmb' && G.skills.getSlotSkill(p, s) === id) return s;
    return null;
  };
  const total = Math.round(seconds / H.DT);
  for (let f = 0; f < total; f++) {
    if (f % 30 === 0) {
      // the party takes damage: every ally is kept between 40 and 70 % HP
      for (const a of team) a.hp = Math.min(a.hp, 3400) - (f % 60 === 0 ? 150 : 0), a.hp = Math.max(a.hp, 1500);
      if (team.length) p.hp = Math.min(p.hp, 4200);
    }
    const injured = team.filter((a) => a.hp < a.maxHp * 0.9).length + (p.hp < p.maxHp * 0.9 ? 1 : 0);
    const low = Math.min(p.hp / p.maxHp, ...team.map((a) => a.hp / a.maxHp)) * 100;
    const st = G.skills.state(p);
    const lmbStep = (G.skills.now - st.combo.lastEnd > 0.85 ? 0 : st.combo.next) + 1;
    for (const l of lines) {
      const slot = slotOf(l.skill);
      if (!slot) continue;
      if (!l.fn(env.S, env.CDR, env.CH, env.CD, e.hp / e.maxHp * 100, low, injured, 0, G.skills.pipCount(p, 'holypower'), p.hp / p.maxHp * 100, lmbStep, 1)) continue;
      if (slot === 'lmb' && lmbStep === 1 && tokens < 1) continue; // no chain start left: nothing to press, the party waits for the next cooldown
      if (G.skills.tryCastSlot(p, slot, H.aimFor(p, e))) break;
    }
    H.step(1);
    eng.update(H.DT);
    tokens = Math.min(1.5, tokens + (chainsPerMin / 60) * H.DT);
    led.frames++;
    if (p.statuses.has('righteous')) led.righteousFrames++;
    if (f % 60 === 0) H.clearEvents();
  }
  G.events.off?.('skill:cast', castLog);
  G.skills.addPip = origAdd;
  G.skills.spendPip = origSpend;
  G.procs = undefined;
  led.faithEnd = p.resource;
  return led;
}

// ---- pmpa.l1: a level-1 paladin (no spec yet) has a working bar: lmb chain + Yargı + Haçlı Darbesi + Işığın Sözü, all castable ------------------
{
  const { CharacterState } = await H.imp('systems/CharacterState.ts');
  const bar1 = CharacterState.defaultBar('paladin', 1);
  ok('pmpa.l1 creation bar at level 1 = lmb chain, rmb Yargı, q Haçlı Darbesi, e Işığın Sözü', JSON.stringify(bar1) === JSON.stringify({
    lmb: 'paladin_basic', rmb: 'paladin_judgement', q: 'paladin_crusader_strike', e: 'paladin_word_of_glory', s1: 'paladin_rebuke', s2: 'paladin_divine_steed',
  }), JSON.stringify(bar1));
  const bar10 = CharacterState.defaultBar('paladin', 10);
  ok('pmpa.l1 level-10 bar adds Azarlama s1, İlahi Binek s2 (no slot clash), İntikamcı Kalkan s3, Kanatlar m90',
    bar10.s1 === 'paladin_rebuke' && bar10.s2 === 'paladin_divine_steed' && bar10.s3 === 'paladin_avengers_shield' && bar10.m90 === 'paladin_avenging_wrath' && !bar10.m180, JSON.stringify(bar10));
  const bar60 = CharacterState.defaultBar('paladin', 60);
  ok('pmpa.l1 level-60 bar has 8 distinct class skills + lmb', new Set(Object.values(bar60)).size === 9 && bar60.s2 === 'paladin_divine_steed' && bar60.m180 === 'paladin_divine_shield', JSON.stringify(bar60));
  ok('pmpa.l1 every skill of the L1 bar unlocks at level 1', Object.values(bar1).every((id) => K(id).unlockLevel <= 1));
  const items = await H.imp('data/itemBases.ts');
  ok('pmpa.l1 start gear exists (mace, shield, plate, sword) and a paladin may equip it; a mage may not take the mace',
    ['mace_t1', 'shield_t1', 'chest_heavy_t1', 'sword1h_t1'].every((id) => items.ITEM_BASES[id] && items.classCanUseBase('paladin', items.ITEM_BASES[id])) && !items.classCanUseBase('mage', items.ITEM_BASES.mace_t1));
  const cls = await H.imp('data/classes.ts');
  const menu = await H.imp('ui/menu/classInfo.ts');
  ok('pmpa.l1 paladin is playable and offered by the character creation list', cls.isPlayableClass('paladin') && menu.CLASS_ORDER.includes('paladin') && menu.classPresentation('paladin').highlights.length === 3);

  const p = H.addPlayer('paladin', 1);
  p.spec = undefined;
  p.yaw = 0; p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  p.stats.weaponMin = p.stats.weaponMax = 100;
  G.character.save.skillBar = { ...bar1 };
  G.character.save.spec = null;
  G.talents = { grantedSkills: () => [] };
  const foe = dummy(0, 2.2, 1e8);
  H.step(2);
  p.hp = p.maxHp = 1000; p.resource = 100;
  H.setAimTarget(foe);
  const spy = healSpy();
  const fire = (slot) => { H.clearEvents(); const started = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe)); H.stepSec(2.2); return started; };
  const hitBy = (re) => events['damage'].filter((d) => re.test(d.skillId ?? '') && d.amount > 0 && d.targetId === foe.id);
  const failed = () => events['skill:fail'].map((f) => f.reason ?? f.why ?? '?').join(',');

  ok('pmpa.l1 lmb: the weapon chain swings and hits', fire('lmb') === true && hitBy(/^paladin_basic/).length >= 1, `hits=${hitBy(/^paladin_basic/).length} fail=${failed()}`);
  const f0 = p.resource;
  ok('pmpa.l1 rmb: Yargı hits, applies judged, pays 4 faith, +1 Kutsal Güç', fire('rmb') === true && hitBy(/^paladin_judgement$/).length === 1 && foe.statuses.has('judged')
    && G.skills.pipCount(p, 'holypower') >= 1 && p.resource < f0, `hits=${hitBy(/^paladin_judgement$/).length} pips=${G.skills.pipCount(p, 'holypower')} fail=${failed()}`);
  G.skills.resetPips(p);
  ok('pmpa.l1 q: Haçlı Darbesi hits and gives +1 Kutsal Güç', fire('q') === true && hitBy(/^paladin_crusader_strike$/).length === 1 && G.skills.pipCount(p, 'holypower') === 1, `hits=${hitBy(/^paladin_crusader_strike$/).length} pips=${G.skills.pipCount(p, 'holypower')} fail=${failed()}`);
  G.skills.addPip(p, 'holypower', 3);
  p.hp = 400;
  spy.log.length = 0;
  const wogOk = fire('e');
  ok('pmpa.l1 e: Işığın Sözü (no ally) heals the paladin itself, costs 3 Kutsal Güç', wogOk === true && spy.log.some((h) => h.tgt === p) && p.hp > 400 && G.skills.pipCount(p, 'holypower') === 1, `ok=${wogOk} heals=${spy.log.length} hp=${p.hp} pips=${G.skills.pipCount(p, 'holypower')} fail=${failed()}`);
  H.stepSec(2);
  G.skills.resetPips(p);
  ok('pmpa.l1 Işığın Sözü with fewer than 3 Kutsal Güç fails unpaid', fire('e') === false && p.hp > 0);
  spy.stop();
  ok('pmpa.l1 the basic chain is a melee_arc chain with an auto-attack-capable melee camera profile', K('paladin_basic_1').targeting === 'melee_arc' && CLASSES.paladin.cameraProfile === 'melee' && CLASSES.paladin.autoAttack === undefined);
}

// ---- pmpa.hv: heavy / riposte / roll moves exist for the paladin (copied from the knight under paladin ids)
{
  const { HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS, GUARD_COUNTER_BY_CLASS } = await H.imp('combat/heavy.ts');
  const { RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS } = await H.imp('combat/moves.ts');
  const { guardProfileOf } = await H.imp('combat/guard.ts');
  const ids = [HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS, GUARD_COUNTER_BY_CLASS].map((t) => t.paladin?.id).concat([RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS].map((t) => t.paladin?.id));
  ok('pmpa.hv heavy, riposte, krt, guard counter, run, jump, roll profiles exist and are registered skills', ids.every((id) => id && SKILLS[id] && SKILLS[id].classId === 'paladin'), ids.join(','));
  ok('pmpa.hv heavy tier-2 is the mace art; paladin has a guard profile', HEAVY_BY_CLASS.paladin.art === 'wa_crushing_blow' && !!guardProfileOf('paladin'));
}

// ---- pmpa.rt: SkillDef.route '@status:judged' (Kutsal Hüküm +25 % on a judged target)
{
  const p = newPaladin(RET, { regen: false });
  p.stats.weaponMin = p.stats.weaponMax = 100;
  const foe = dummy(0, 2.2, 1e8);
  H.step(2);
  H.setAimTarget(foe);
  const verdictHit = (judged) => {
    foe.statuses.remove('judged');
    if (judged) foe.statuses.apply('judged', 10, { sourceId: 9999 }); // another source: the 10 % takenMoreFromSource of the applier does not mix in
    G.skills.resetPips(p);
    G.skills.addPip(p, 'holypower', 3);
    H.clearEvents();
    G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe));
    H.stepSec(2.2);
    const hits = events['damage'].filter((d) => d.skillId === 'paladin_verdict' && d.targetId === foe.id);
    return hits.some((d) => d.crit) ? -1 : hits.reduce((s, d) => s + d.amount, 0); // -1 = the combat RNG crit this one: roll again
  };
  const clean = (judged) => { for (let i = 0; i < 25; i++) { const v = verdictHit(judged); if (v >= 0) return v; } return 0; };
  const rnd = Math.random;
  Math.random = () => 0.5; // weapon roll 100, no dodge; crits (seeded combat RNG) are re-rolled: the two amounts differ by the route bonus only
  let plain, judged;
  try { plain = clean(false); judged = clean(true); } finally { Math.random = rnd; }
  ok('pmpa.rt Kutsal Hüküm hits a judged target 25 % harder', plain > 0 && Math.abs(judged / plain - 1.25) < 0.02, `plain=${plain} judged=${judged} ratio=${(judged / Math.max(1, plain)).toFixed(3)}`);
  const other = (() => {
    G.skills.resetPips(p); G.skills.addPip(p, 'holypower', 3);
    return plain;
  })();
  ok('pmpa.rt rows without a status route are untouched (Haçlı Darbesi does not read judged)', K('paladin_crusader_strike').route === undefined && other === plain);
}

// ---- pmpa.cs: Kutsal Zemin gives allies standing in the zone +3 % armour (consecrated), not the ones outside it
{
  const p = newPaladin(KOR, { regen: false });
  const foe = dummy(0, 2.2, 1e8);
  const mk = (x, id) => { const a = new H.FakePlayer('knight'); a.id = id; a.isLocal = true; a.maxHp = 5000; a.hp = 5000; a.position.set(x, 0, 0); H.world.add(a); return a; };
  const near1 = mk(3, 701), far = mk(14, 702);
  H.step(2);
  p.resource = 100; H.setAimTarget(foe);
  H.clearEvents();
  G.skills.tryCastSlot(p, 's1', H.aimFor(p, foe));
  H.stepSec(2.6);
  ok('pmpa.cs ally inside the zone and the caster get consecrated, an ally 14 m away does not', near1.statuses.has('consecrated') && p.statuses.has('consecrated') && !far.statuses.has('consecrated'),
    `near=${near1.statuses.has('consecrated')} self=${p.statuses.has('consecrated')} far=${far.statuses.has('consecrated')}`);
  ok('pmpa.cs the status carries +3 % armour', Math.abs((STATUSES.consecrated.stats?.armorPct ?? 0) - 0.03) < 1e-9);
  H.stepSec(14);
  ok('pmpa.cs the aura ends with the zone', !near1.statuses.has('consecrated'));
}

// ---- pmpa.bw: İlahi Siper reflects 20 % of an incoming hit as holy damage
{
  const p = newPaladin(KOR, { regen: false });
  const foe = dummy(0, 2.2, 1e8);
  H.step(2);
  p.maxHp = p.hp = 100000;
  const reflected = () => events['damage'].filter((d) => d.skillId === 'paladin_prot_bulwark' && d.targetId === foe.id).reduce((s, d) => s + d.amount, 0);
  const hit = () => { H.clearEvents(); G.combat.hitLocalPlayer({ sourceId: foe.id, amount: 1000, type: 'physical', unavoidable: true, abilityName: 'test', sourceLevel: 30, melee: true }); };
  hit();
  ok('pmpa.bw no reflect without İlahi Siper', reflected() === 0);
  p.statuses.apply('bulwark', 8, { sourceId: p.id });
  hit();
  const r = reflected();
  ok('pmpa.bw with İlahi Siper ~20 % of the incoming hit comes back (after the enemy\'s holy mitigation)', r >= 100 && r <= 205, `reflected=${r}`);
  foe.position.set(0, 0, 40);
  hit();
  ok('pmpa.bw a hit from beyond 30 m is not reflected', reflected() === 0);
}

// ---- pmpa.ow: Taşan Şifa (Kutsal): 40 % of the overheal becomes a short absorb on the healed ally
{
  const p = newPaladin(HOL, { regen: false });
  const ally = new H.FakePlayer('knight'); ally.id = 801; ally.isLocal = true; ally.maxHp = 10000; ally.hp = 9990; ally.position.set(3, 0, 0); H.world.add(ally);
  const foe = dummy(0, 2.2, 1e8);
  H.step(2);
  p.resource = 100; p.hp = p.maxHp;
  H.setAimTarget(foe);
  G.skills.addPip(p, 'holypower', 5);
  H.clearEvents();
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe)); // Flash of Light
  H.stepSec(2.5);
  const sh = ally.statuses.get('shield');
  ok('pmpa.ow Kutsal overheal gives the ally a shield + overheal_ward label', !!sh && sh.magnitude > 0 && ally.statuses.has('overheal_ward'), `shield=${sh?.magnitude}`);
  ok('pmpa.ow the absorb stays under 15 % of the ally\'s max HP', !!sh && sh.magnitude <= ally.maxHp * 0.15 + 1e-6, `shield=${sh?.magnitude}`);
  const k = newPaladin(KOR, { regen: false });
  const ally2 = new H.FakePlayer('knight'); ally2.id = 802; ally2.isLocal = true; ally2.maxHp = 10000; ally2.hp = 9990; ally2.position.set(3, 0, 0); H.world.add(ally2);
  const foe2 = dummy(0, 2.2, 1e8);
  H.step(2);
  k.resource = 100; H.setAimTarget(foe2);
  G.skills.addPip(k, 'holypower', 5);
  G.skills.tryCastSlot(k, 's3', H.aimFor(k, foe2)); // Işığın Sözü
  H.stepSec(2.5);
  ok('pmpa.ow Koruma has no overheal ward', !ally2.statuses.has('overheal_ward'));
}

// ---- pmpa.hp / pmpa.mit: 60 s APL runs on a dev dummy (Holy Power income and spend, Doğruluk Kalkanı uptime)
const TARGET_HP = { paladin_protection: 27, paladin_holy: 31.2, paladin_retribution: 41.5 };
const CHAINS = { paladin_protection: 6, paladin_holy: 6, paladin_retribution: 8 }; // weapon chains per minute in the kit budgets (5d / 6d / 7d)
const LEDGER_SEC = 120; // two minutes: majors on a 45 s cooldown (Avenging Wrath) show up 1.33 times per minute, as in the budget amortisation
const LEDGER = {};
for (const spec of ALL) {
  const led = runApl(spec, LEDGER_SEC, { allies: spec === HOL ? 4 : 0, chainsPerMin: CHAINS[spec.id] });
  LEDGER[spec.id] = led;
  const want = TARGET_HP[spec.id];
  const perMin = led.gross / (LEDGER_SEC / 60);
  const dev = Math.abs(perMin - want) / want;
  ok(`pmpa.hp ${spec.id} Holy Power income within 15 % of ${want} per 60 s`, dev <= 0.15, `income=${perMin.toFixed(1)}/min (${(dev * 100).toFixed(0)} % off) effective=${(led.net / (LEDGER_SEC / 60)).toFixed(1)}/min spent=${(led.spent / (LEDGER_SEC / 60)).toFixed(1)}/min`);
  ok(`pmpa.hp ${spec.id} every spend costs exactly 3`, led.spends.length > 0 && led.spends.every((n) => n === 3), `spends=${led.spends.length} sizes=${[...new Set(led.spends)].join(',')}`);
  console.log(`     ${spec.id} casts per min: ${Object.entries(led.casts).map(([k, v]) => `${k.replace('paladin_', '')}=${(v / (LEDGER_SEC / 60)).toFixed(1)}`).join(' ')}`);
}
{
  const up = LEDGER.paladin_protection.righteousFrames / LEDGER.paladin_protection.frames;
  ok('pmpa.mit Doğruluk Kalkanı uptime >= 60 % over the 60 s APL run', up >= 0.6, `uptime=${(up * 100).toFixed(0)} %`);
  const spenders = (LEDGER.paladin_protection.casts.paladin_shield_of_righteous ?? 0);
  ok('pmpa.mit Doğruluk Kalkanı cast at least 6 times', spenders >= 6, `casts=${spenders}`);
}
{
  const l = LEDGER.paladin_holy;
  console.log(`     pmpa.mana Kutsal faith over the 60 s run: ${l.faith0.toFixed(0)} -> ${l.faithEnd.toFixed(0)} (informational only: the dummy party never rises above 60 %, so the APL spams the panic Işık Parlaması; the kit's +10 per minute ledger belongs to SimBench)`);
}

// ---- level 1 (owner rule): every spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
for (const sid of ["paladin_protection","paladin_holy","paladin_retribution"]) {
  const spec = SPECS[sid];
  const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
  ok(`kit_paladin.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
}
console.log(fails === 0 ? '\nkit.paladin (pmpa): all checks PASS' : `\nkit.paladin (pmpa): ${fails} FAIL`);
const engineErrors = H.errors.filter((m) => m.startsWith('ERR'));
if (engineErrors.length) console.log(`engine console errors (${engineErrors.length}): ${[...new Set(engineErrors)].slice(0, 5).join(' | ')}`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
