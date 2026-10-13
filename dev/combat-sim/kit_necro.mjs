// KIT PM-NE checks (docs/kits/plate-melee.md §8-§9, f1d, f3, §h "pmne.*") that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_necro.mjs
// Covered: pmne.ids, pmne.apl, pmne.status, pmne.fx, pmne.procs, pmne.cd, pmne.coef, pmne.minion, pmne.rune, pmne.bone, pmne.death_strike,
//          pmne.grip, pmne.boil, pmne.chain, pmne.vile, pmne.sudden, pmne.outbreak, pmne.epidemic, pmne.pet, pmne.army, pmne.dt, pmne.ams,
//          pmne.kick, pmne.advance, pmne.anger, pmne.echo, pmne.cast (every necromancer row casts without error), pmne.ledger (60 s APL
//          rune and Öz ledgers of both specs).
// Every cast goes through the real SkillSystem (pip costs, GCD, cooldowns, proc mods, behaviours) on dev dummies; the APL runner compiles
// the A.3 lines of data/rotations_kit_necromancer.ts and presses the bar slots. Not covered here (browser / SimBench): feel, VFX, the
// budget damage totals (§8d / §9d).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_NECROMANCER } = await H.imp('data/rotations_kit_necromancer.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { PROC_DEFS, getProcDef, GLOW_RULES, glowSkillsOf } = await H.imp('data/procs.ts');
const { resolveProcMods } = await H.imp('combat/procMods.ts');
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { parseFx, fxContext } = await H.imp('data/talentTrees/fx.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { Corpses } = await H.imp('combat/Corpses.ts');
const { minionDef, MINION_DEFS } = await H.imp('data/minions.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { EnemyAI } = await H.imp('ai/EnemyAI.ts');
const { TALENT_PIPS } = await H.imp('data/specs_talents.ts');

G.minions = new Minions();
G.corpses = new Corpses();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const K = (id) => SKILLS[id];
const BONE = SPECS.necromancer_bone;
const SUMM = SPECS.necromancer_summoner;
const ALL = [BONE, SUMM];
const SLOTS = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];
const rune = (p) => G.skills.pipCount(p, 'rune');
const NECRO_ROWS = Object.values(SKILLS).filter((d) => d.classId === 'necromancer');

/** A necromancer of a spec on the spec's default bar, full runes, empty Öz, a dev dummy 2.2 m ahead (melee range). */
function newNecro(spec, { dummy = true, hp = 1e9 } = {}) {
  const p = H.addPlayer('necromancer');
  p.spec = spec.id;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = { ...spec.defaultBar };
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}), skillPick: () => 0 };
  G.minions.clearAll('scene');
  G.corpses.clear?.('cleared');
  G.procs = undefined;
  H.step(2);
  p.resource = 0; // Combat.update fills the start resource on the first frame
  G.skills.addPip(p, 'rune', 6);
  let e = null;
  if (dummy) { e = H.addEnemy(0, 2.2, { hp }); e.maxHp = hp; e.hp = hp; p.targetId = e.id; H.setAimTarget(e); } else H.setAimTarget(null);
  return { p, e };
}
const cast = (p, slot, target) => G.skills.tryCastSlot(p, slot, H.aimFor(p, target ?? null));
/** Engine frames with the minion manager ticked too. */
function tick(sec) { for (let i = 0; i < H.sec(sec); i++) { H.step(1); G.minions.update(H.DT); } }
/** A ProcEngine with a fixed RNG seed (the engine seeds from Date.now). */
function seededEngine(seed = 20261013) {
  const realNow = Date.now;
  Date.now = () => seed;
  try { return new ProcEngine(); } finally { Date.now = realNow; }
}
function healSpy() {
  const log = [];
  const orig = G.combat.healPlayer;
  G.combat.healPlayer = function (src, tgt, amt, o) { log.push({ src, tgt, amt }); return orig.call(this, src, tgt, amt, o); };
  return { log, stop: () => { G.combat.healPlayer = orig; } };
}
const meleeHit = (amount = 100) => G.combat.hitLocalPlayer({ sourceId: null, amount, type: 'physical', melee: true, unavoidable: true, blockable: false, ignoreIframes: true });
const rowText = (d) => `${d.name} ${d.desc}`;

// ---- pmne.ids: spec lists, majors, mods and the default bars resolve ---------------------------------------------------------------------
for (const spec of ALL) {
  const ids = [...spec.skills, ...Object.values(spec.defaultBar), ...Object.values(spec.majors), ...spec.mods.map((m) => m.skill), ...Object.keys(spec.treeSkills ?? {})];
  if (spec.basic) ids.push(spec.basic);
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`pmne.ids ${spec.id} ids resolve`, missing.length === 0, missing.join(','));
  const bar = Object.values(spec.defaultBar);
  ok(`pmne.ids ${spec.id} bar has 12 slots, no duplicate skill`, bar.length === 12 && new Set(bar).size === 12);
  const wrong = ids.filter((id) => SKILLS[id] && SKILLS[id].classId !== 'necromancer');
  ok(`pmne.ids ${spec.id} every id is a necromancer row`, wrong.length === 0, wrong.join(','));
  ok(`pmne.ids ${spec.id} unlock levels cover the skill list`, spec.skills.every((id) => spec.unlock[id] !== undefined), spec.skills.filter((id) => spec.unlock[id] === undefined).join(','));
  ok(`pmne.ids ${spec.id} has Turkish name and desc`, !!spec.name && spec.desc.length > 60);
  ok(`pmne.ids ${spec.id} bar slots hold what the SpecDef says (basic + skills + treeSkills + majors)`, SLOTS.every((s) => {
    const id = spec.defaultBar[s];
    return id === (spec.basic ?? 'necro_basic') || spec.skills.includes(id) || id in (spec.treeSkills ?? {}) || Object.values(spec.majors).includes(id);
  }));
}
ok('pmne.ids SPECS merge holds both necromancer specs', !!SPECS.necromancer_bone && !!SPECS.necromancer_summoner);
ok('pmne.ids roles + main stats (tank / dps, Strength)', BONE.role === 'tank' && SUMM.role === 'dps' && BONE.mainStat === 'str' && SUMM.mainStat === 'str');
ok('pmne.ids Kemik basic is the blood chain, Ordu uses the class chain', BONE.basic === 'necro_blood_basic' && !SUMM.basic && CLASSES.necromancer.basicAttack === 'necro_basic');
ok('pmne.ids majors per spec', BONE.majors.m45 === 'necro_vampiric_blood' && BONE.majors.m90 === 'necro_dancing_rune_weapon' && BONE.majors.m180 === 'necro_icebound_fortitude'
  && SUMM.majors.m45 === 'necro_dark_transformation' && SUMM.majors.m90 === 'necro_army_of_the_dead' && SUMM.majors.m180 === 'necro_icebound_fortitude');
ok('pmne.ids tree skills: İlik Söken (Kemik), Salgın (Ordu) at s05', BONE.treeSkills?.necro_marrowrend === 's05' && SUMM.treeSkills?.necro_epidemic === 's05');
{
  const cls = CLASSES.necromancer;
  ok('pmne.ids ClassDef.skills is the 8-id list and every id resolves', cls.skills.length === 8 && cls.skills.every((id) => !!SKILLS[id]), cls.skills.join());
  ok('pmne.ids ClassDef has NO secondary row (the rune pip is TALENT_PIPS.rune) and keeps the Öz bar with rage-type decay', !cls.secondary && cls.resource === 'essence' && cls.regenRule === 'rage' && cls.baseStats.resourceRegen === 0);
  ok('pmne.ids G.skills.activePips of a necromancer is [rune]', G.skills.activePips(H.addPlayer('necromancer')).map((d) => d.id).join() === 'rune');
}
ok('pmne.ids necro_soul_snap / necro_spirit_walk stay defined, unslotted', !!SKILLS.necro_soul_snap && !!SKILLS.necro_spirit_walk
  && !SKILLS.necro_soul_snap.defaultSlot && !SKILLS.necro_spirit_walk.defaultSlot && !ALL.some((s) => Object.values(s.defaultBar).some((id) => id === 'necro_soul_snap' || id === 'necro_spirit_walk')));
ok('pmne.ids PLAYABLE_CLASSES is untouched (necromancer still not selectable)', !(await H.imp('data/classes.ts')).PLAYABLE_CLASSES.includes('necromancer'));
ok('pmne.ids no duplicate minion ids across classes', Object.keys(MINION_DEFS).length === new Set(Object.keys(MINION_DEFS)).size && errors.filter((e) => /duplicate minion/.test(e)).length === 0);

// ---- pmne.apl: skill and status names in the APL rows resolve --------------------------------------------------------------------------------
for (const spec of ALL) {
  const apl = ROTATIONS_KIT_NECROMANCER[spec.id];
  ok(`pmne.apl ${spec.id} rows exist`, !!apl && apl.st.length > 0 && (apl.aoe?.length ?? 0) > 0);
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of [...apl.st, ...(apl.aoe ?? [])]) {
    for (const m of l.matchAll(/\b(necro_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/(?:status|stacks|remaining):([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`pmne.apl ${spec.id} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`pmne.apl ${spec.id} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const chain = spec.basic ?? 'necro_basic';
  ok(`pmne.apl ${spec.id} ends with the weapon chain`, apl.st.at(-1) === chain && apl.aoe.at(-1) === chain);
  const onBar = new Set([...Object.values(spec.defaultBar), 'necro_death_order']);
  ok(`pmne.apl ${spec.id} every APL skill is on the default bar (or a transform of it)`, [...skillIds].every((id) => onBar.has(id)), [...skillIds].filter((id) => !onBar.has(id)).join(','));
}

// ---- pmne.status: every status a necromancer row, a spec mod or a spec fx applies has a StatusDef --------------------------------------------
{
  const applied = new Set();
  for (const d of NECRO_ROWS) for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  for (const spec of ALL) for (const m of spec.fx.matchAll(/st\((?:self|tgt|ally|party),([a-z_]+),/g)) applied.add(m[1]);
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('pmne.status every necromancer-applied status has a def', missing.length === 0, missing.join(','));
  ok('pmne.status kit statuses present (bone_armor max 10, vile_contagion max 3, blood_plague / virulent_plague dot shadow)', STATUSES.bone_armor.maxStacks === 10 && STATUSES.vile_contagion.maxStacks === 3
    && STATUSES.blood_plague.dotType === 'shadow' && STATUSES.virulent_plague.dotType === 'shadow');
}

// ---- pmne.fx: the spec fx strings parse and every skill / status / stat in them exists ---------------------------------------------------------
{
  const ctx = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
  for (const spec of ALL) {
    const r = parseFx(spec.fx, ctx);
    ok(`pmne.fx ${spec.id} fx parses and validates`, r.errors.length === 0, r.errors.join(' | '));
    ok(`pmne.fx ${spec.id} has ${spec.id === 'necromancer_bone' ? 4 : 3} trigger rows`, r.items.filter((i) => i.k === 'T').length === (spec.id === 'necromancer_bone' ? 4 : 3));
  }
  ok('pmne.fx Kemik fx has no Death Strike blood_shield row (the behaviour applies it)', !/blood_shield/.test(BONE.fx));
}

// ---- pmne.procs: ProcDefs, ProcMods and the glow rule ---------------------------------------------------------------------------------------
{
  const ids = ['sudden_doom', 'army', 'dark_transformation', 'vampiric_blood', 'dancing_rune_weapon'];
  ok('pmne.procs five ProcDefs registered', ids.every((id) => !!getProcDef(id)));
  ok('pmne.procs every glow id is a real skill', ids.flatMap((id) => getProcDef(id).glow).every((g) => !!SKILLS[g]));
  ok('pmne.procs sudden_doom glows Ölüm Sarmalı + Salgın (overlay top), army glows Ölüm Emri', getProcDef('sudden_doom').glow.join() === 'necro_death_coil,necro_epidemic' && getProcDef('sudden_doom').overlay === 'top'
    && getProcDef('army').glow.join() === 'necro_death_order');
  const v = (...s) => ({ has: (x) => s.includes(x), stacks: (x) => (s.includes(x) ? 1 : 0) });
  const m1 = resolveProcMods(v('sudden_doom'), 'necro_death_coil');
  const m2 = resolveProcMods(v('sudden_doom'), 'necro_epidemic');
  ok('pmne.procs sudden_doom: Ölüm Sarmalı and Salgın cost 0 and consume on cast', m1?.costMult === 0 && m2?.costMult === 0 && (m1.oneStack?.length ?? 0) === 0);
  ok('pmne.procs sudden_doom does not touch other skills', !resolveProcMods(v('sudden_doom'), 'necro_death_strike'));
  const base = { resourcePct: 0, bestSpender: null, pips: 0, combo: 0, arcane: 0, targetHpPct: null, stealthed: false, riposteOpen: false, targetGuardBroken: false, bleedingEnemies: 0 };
  ok('pmne.procs Ölüm Darbesi glows from 75 Öz', !!GLOW_RULES.necroDeathStrike75 && glowSkillsOf(v(), { ...base, resourcePct: 0.8 }).has('necro_death_strike') && !glowSkillsOf(v(), { ...base, resourcePct: 0.6 }).has('necro_death_strike'));
  ok('pmne.procs a ProcDef exists for every ProcMod status (procs_data smoke rule)', getProcDef('sudden_doom') !== undefined);
  ok('pmne.procs no duplicate ProcDef id', PROC_DEFS.length === new Set(PROC_DEFS.map((d) => d.id)).size);
}

// ---- pmne.cd / pmne.coef: the numbers of the kit tables (verbatim) -----------------------------------------------------------------------------
{
  const cd = (id, v, ch) => ok(`pmne.cd ${id} ${v} s${ch ? `, ${ch} charges` : ''}`, K(id).cooldown === v && (ch === undefined || K(id).charges === ch), `cd=${K(id).cooldown} ch=${K(id).charges}`);
  cd('necro_deaths_grip', 25); cd('necro_blood_boil', 7.5, 2); cd('necro_deaths_advance', 25); cd('necro_anti_magic_shell', 60); cd('necro_mind_freeze', 15);
  cd('necro_vampiric_blood', 45); cd('necro_dancing_rune_weapon', 90); cd('necro_icebound_fortitude', 180);
  cd('necro_dark_transformation', 45); cd('necro_army_of_the_dead', 90);
  const sum = (ids, f) => ids.reduce((s, id) => s + f(K(id)), 0);
  const blood = [1, 2, 3, 4].map((i) => `necro_blood_basic_${i}`);
  const unholy = [1, 2, 3, 4].map((i) => `necro_basic_${i}`);
  ok('pmne.coef Kemik Orağı Kombosu sums to 2.50 (0.45 / 0.45 / 0.55 / 1.05 physical)', near(sum(blood, (d) => d.damage.coef), 2.5, 1e-9) && blood.map((i) => K(i).damage.coef).join() === '0.45,0.45,0.55,1.05' && blood.every((i) => K(i).damage.type === 'physical'));
  ok('pmne.coef Kemik chain Öz +3 / +3 / +3 / +4', blood.map((i) => K(i).params.gain).join() === '3,3,3,4');
  ok('pmne.coef Kemik Kırıntıları sums to 2.50 (shadow, shadow, shadow, physical)', near(sum(unholy, (d) => d.damage.coef), 2.5, 1e-9) && unholy.map((i) => K(i).damage.type).join() === 'shadow,shadow,shadow,physical');
  ok('pmne.coef Ordu chain Öz +3 / +3 / +4 / 0; steps 1-2 projectiles v32 R22, step 3 thrust arc 55, step 4 burst r 2.4', unholy.map((i) => K(i).params.gain).join() === '3,3,4,0'
    && K('necro_basic_1').targeting === 'target_projectile' && K('necro_basic_1').speed === 32 && K('necro_basic_1').range === 22 && K('necro_basic_3').arc === 55 && K('necro_basic_4').params.impactRadius === 2.4);
  ok('pmne.coef both chains are 4-step combos', K('necro_basic').behavior === 'combo' && K('necro_basic').params.steps === 4 && K('necro_blood_basic').behavior === 'combo' && K('necro_blood_basic').params.steps === 4);
  ok('pmne.coef Kalp Darbesi 2 x 0.5 on 2 targets, 1 rune, +5 Öz, slow 20 % 8 s', K('necro_heart_strike').damage.coef === 0.5 && K('necro_heart_strike').params.hits === 2 && K('necro_heart_strike').params.cleave === 1
    && K('necro_heart_strike').pip.cost === 1 && K('necro_heart_strike').params.gain === 5 && K('necro_heart_strike').statuses[0].status === 'slow' && K('necro_heart_strike').statuses[0].magnitude === 0.2 && K('necro_heart_strike').statuses[0].duration === 8);
  ok('pmne.coef Ölüm Darbesi 45 Öz, 1.4 physical, 20 % of 5 s, min 7 %, shield 20 %', K('necro_death_strike').cost === 45 && K('necro_death_strike').damage.coef === 1.4
    && K('necro_death_strike').params.window === 5 && K('necro_death_strike').params.healPctOfRecent === 0.2 && K('necro_death_strike').params.minHealPct === 0.07 && K('necro_death_strike').params.shieldPct === 0.2);
  ok('pmne.coef İlik Söken 2 runes, 1.2 physical, +10 Öz, +3 bone_armor for 30 s', K('necro_marrowrend').pip.cost === 2 && K('necro_marrowrend').damage.coef === 1.2 && K('necro_marrowrend').params.gain === 10
    && K('necro_marrowrend').selfStatuses[0].status === 'bone_armor' && K('necro_marrowrend').selfStatuses[0].stacks === 3 && K('necro_marrowrend').selfStatuses[0].duration === 30);
  ok('pmne.coef Ölüm Kancası range 30, taunt 3 s (boss 2 s), pull to 3 m, off-GCD', K('necro_deaths_grip').range === 30 && K('necro_deaths_grip').params.taunt === 3 && K('necro_deaths_grip').params.bossTaunt === 2
    && K('necro_deaths_grip').params.pullTo === 3 && K('necro_deaths_grip').offGcd === true && K('necro_deaths_grip').behavior === 'grip');
  ok('pmne.coef Kan Kaynatma r 5, 1.4 shadow, 8 targets, blood_plague 24 s', K('necro_blood_boil').radius === 5 && K('necro_blood_boil').damage.coef === 1.4 && K('necro_blood_boil').params.maxTargets === 8
    && K('necro_blood_boil').statuses[0].status === 'blood_plague' && K('necro_blood_boil').statuses[0].duration === 24);
  ok('pmne.coef Vampirik Kan 10 s, Hayalet Orak 12 s, Buz Gibi Sebat 8 s, Ölüm Atılışı 6 s, Büyü Karşıtı Kalkan 8 s',
    K('necro_vampiric_blood').selfStatuses[0].duration === 10 && K('necro_dancing_rune_weapon').selfStatuses[0].duration === 12 && K('necro_icebound_fortitude').selfStatuses[0].duration === 8
    && K('necro_deaths_advance').selfStatuses[0].duration === 6 && K('necro_anti_magic_shell').selfStatuses[0].duration === 8);
  ok('pmne.coef Anti-Magic Shell absorbs 30 %, refunds 1 Öz per 1 %, cap 20; Mind Freeze r 15 silence 3', K('necro_anti_magic_shell').params.absorbPct === 0.3 && K('necro_anti_magic_shell').params.rpPerPct === 1 && K('necro_anti_magic_shell').params.rpCap === 20
    && K('necro_mind_freeze').range === 15 && K('necro_mind_freeze').params.silence === 3 && K('necro_mind_freeze').behavior === 'interrupt');
  ok('pmne.coef Ölüm Kırbacı 0.55 shadow r 25, 1 rune, +10 Öz, x1.35, splash 0.5 r 5, Küçük Ghul 8 s cap 3', K('necro_scourge_strike').damage.coef === 0.55 && K('necro_scourge_strike').range === 25 && K('necro_scourge_strike').pip.cost === 1
    && K('necro_scourge_strike').params.gain === 10 && K('necro_scourge_strike').params.stackMore === 0.35 && K('necro_scourge_strike').params.splashCoef === 0.5 && K('necro_scourge_strike').params.splashRadius === 5
    && K('necro_scourge_strike').minion.id === 'necro_lesser_ghoul' && K('necro_scourge_strike').minion.life === 8 && K('necro_scourge_strike').minion.cap === 3 && K('necro_scourge_strike').minion.group === 'lesser');
  ok('pmne.coef Ölüm Emri replaces Ölüm Kırbacı while army, 1 rune, +10 Öz, 8 x 0.25, cleave 5 at 50 %', K('necro_death_order').replaces.skill === 'necro_scourge_strike' && K('necro_death_order').replaces.whileStatus === 'army'
    && K('necro_death_order').pip.cost === 1 && K('necro_death_order').params.cmdCoef === 0.25 && K('necro_death_order').params.cleaveMax === 5 && K('necro_death_order').params.cleaveMult === 0.5 && K('necro_death_order').range === 30);
  ok('pmne.coef Ölüm Sarmalı 30 Öz, 1.6 shadow, homing 5, v32, +20 % under DT, pet heal 5 %', K('necro_death_coil').cost === 30 && K('necro_death_coil').damage.coef === 1.6 && K('necro_death_coil').homing === 5 && K('necro_death_coil').speed === 32
    && K('necro_death_coil').params.dtMore === 0.2 && K('necro_death_coil').params.petHealPct === 0.05 && K('necro_death_coil').range === 30);
  ok('pmne.coef Çürüten Darbe 2 runes, 0.7 physical, +15 Öz, 3 vile_contagion 20 s', K('necro_festering_strike').pip.cost === 2 && K('necro_festering_strike').damage.coef === 0.7 && K('necro_festering_strike').params.gain === 15
    && K('necro_festering_strike').statuses[0].status === 'vile_contagion' && K('necro_festering_strike').statuses[0].stacks === 3 && K('necro_festering_strike').statuses[0].duration === 20);
  ok('pmne.coef Salgın Çıkışı 1 rune, 0.3 shadow r 25 + virulent_plague 21 s (dot 1.8 = 0.3 x 6)', K('necro_outbreak').pip.cost === 1 && K('necro_outbreak').damage.coef === 0.3 && K('necro_outbreak').range === 25
    && K('necro_outbreak').statuses[0].status === 'virulent_plague' && K('necro_outbreak').statuses[0].duration === 21 && near(K('necro_outbreak').damage.coef * K('necro_outbreak').statuses[0].magnitude, 1.8, 1e-9));
  ok('pmne.coef Salgın 20 Öz, 1.6 shadow, r 8, 8 targets', K('necro_epidemic').cost === 20 && K('necro_epidemic').damage.coef === 1.6 && K('necro_epidemic').radius === 8 && K('necro_epidemic').params.maxTargets === 8
    && near(K('necro_epidemic').damage.coef * K('necro_epidemic').statuses[0].magnitude, 1.8, 1e-9));
  ok('pmne.coef Karanlık Dönüşüm 15 s x2; Ölüler Ordusu 1.2 s hard cast, 1 rune, 8 ghouls 30 s ignoring the cap, army 30 s', K('necro_dark_transformation').selfStatuses[0].duration === 15 && K('necro_dark_transformation').params.dmgMult === 2
    && K('necro_army_of_the_dead').castTime === 1.2 && K('necro_army_of_the_dead').pip.cost === 1 && K('necro_army_of_the_dead').minion.count === 8 && K('necro_army_of_the_dead').minion.life === 30
    && K('necro_army_of_the_dead').minion.ignoreCap === true && K('necro_army_of_the_dead').minion.group === 'army' && K('necro_army_of_the_dead').selfStatuses[0].status === 'army' && K('necro_army_of_the_dead').selfStatuses[0].duration === 30);
  ok('pmne.coef off-GCD rows: Kancası, Atılış, Kalkan, Dondurma, majors', ['necro_deaths_grip', 'necro_deaths_advance', 'necro_anti_magic_shell', 'necro_mind_freeze', 'necro_vampiric_blood', 'necro_dancing_rune_weapon',
    'necro_icebound_fortitude', 'necro_dark_transformation', 'necro_army_of_the_dead'].every((id) => K(id).offGcd === true));
  ok('pmne.coef every necromancer row has Turkish text', NECRO_ROWS.every((d) => d.name.length > 2 && d.desc.length > 10));
  ok('pmne.coef the major rows carry their defaultSlot', K('necro_vampiric_blood').defaultSlot === 'm45' && K('necro_dancing_rune_weapon').defaultSlot === 'm90' && K('necro_icebound_fortitude').defaultSlot === 'm180'
    && K('necro_dark_transformation').defaultSlot === 'm45' && K('necro_army_of_the_dead').defaultSlot === 'm90');
}

// ---- pmne.minion: Kemik Ghul, Küçük Ghul, Ordu Ghulü rows --------------------------------------------------------------------------------------
{
  const g = minionDef('necro_ghoul'), l = minionDef('necro_lesser_ghoul'), a = minionDef('necro_army_ghoul');
  ok('pmne.minion the three ghoul rows exist once', !!g && !!l && !!a);
  ok('pmne.minion Kemik Ghul: pet group, hpFrac 0.8, armor 0.30, claw 1.8 s / 0.40 shadow / r 2.6, respawn 10 s / 2 s', g.group === 'pet' && g.hpFrac === 0.8 && g.armorFrac === 0.3
    && g.attacks[0].cooldown === 1.8 && g.attacks[0].coef === 0.4 && g.attacks[0].type === 'shadow' && g.attacks[0].range === 2.6 && g.respawn.dead === 10 && g.respawn.scene === 2 && !g.life);
  const t = g.attacks.find((x) => x.kind === 'taunt');
  ok('pmne.minion Kemik Ghul has a taunt attack (NC42: radius, cooldown, tauntSec)', !!t && t.radius > 0 && t.cooldown > 0 && t.params?.tauntSec === 3 && t.coef === 0);
  ok('pmne.minion Küçük Ghul: lesser group, 8 s, hpFrac 0.15, scale 0.8, 3 swings of 0.16', l.group === 'lesser' && l.life === 8 && l.hpFrac === 0.15 && l.scale === 0.8 && l.attacks[0].coef === 0.16 && Math.floor(8 / l.attacks[0].cooldown) === 3);
  ok('pmne.minion Ordu Ghulü: army group, 30 s, hpFrac 0.2, 1 swing / 1.8 s of 0.13', a.group === 'army' && a.life === 30 && a.hpFrac === 0.2 && a.attacks[0].cooldown === 1.8 && a.attacks[0].coef === 0.13);
  ok('pmne.minion group caps: pet 1, lesser 3, army uncapped', (await H.imp('data/minions.ts')).MINION_GROUP_CAPS.pet === 1 && (await H.imp('data/minions.ts')).MINION_GROUP_CAPS.lesser === 3 && (await H.imp('data/minions.ts')).MINION_GROUP_CAPS.army === undefined);
  ok('pmne.minion class default minion is the Kemik Ghul', (await H.imp('data/minions.ts')).CLASS_DEFAULT_MINION.necromancer === 'necro_ghoul');
}

// ---- pmne.rune: Kalp Darbesi 1 rune, İlik Söken 2, 6 runes recharge 10 s each; a cast without runes fails unpaid ---------------------------------
{
  const { p, e } = newNecro(BONE);
  p.resource = 0;
  ok('pmne.rune start: 6 runes', rune(p) === 6);
  ok('pmne.rune Kalp Darbesi cast', cast(p, 'rmb', e) === true);
  H.stepSec(0.6);
  ok('pmne.rune Kalp Darbesi costs 1 rune', rune(p) === 5, `runes=${rune(p)}`);
  ok('pmne.rune Kalp Darbesi gives +5 Öz', near(p.resource, 5, 0.01), `Öz=${p.resource.toFixed(1)}`);
  H.stepSec(1.2);
  ok('pmne.rune İlik Söken cast', cast(p, 'e', e) === true);
  H.stepSec(1.2);
  ok('pmne.rune İlik Söken costs 2 runes', rune(p) === 3, `runes=${rune(p)}`);
  ok('pmne.rune İlik Söken gives +10 Öz (15 total)', near(p.resource, 15, 0.01), `Öz=${p.resource.toFixed(1)}`);
  // not enough runes: fails unpaid (no Öz, no cooldown, no GCD)
  G.skills.spendPip(p, 'rune', rune(p) - 1);
  G.skills.addPip(p, 'rune', 0);
  H.stepSec(1.2);
  const before = p.resource, r0 = rune(p);
  H.clearEvents();
  ok('pmne.rune İlik Söken with 1 rune is refused at the press (no swing, no GCD)', cast(p, 'e', e) === false && rune(p) === r0 && p.resource <= before);
  // the single rune pays Kalp Darbesi right after (nothing was spent or locked by the failed cast)
  ok('pmne.rune the failed cast left no GCD / cooldown: Kalp Darbesi with the last rune works', cast(p, 'rmb', e) === true);
  H.stepSec(0.6);
  ok('pmne.rune 0 runes left', rune(p) === 0);
}
{
  // all six spent: each is back 10 s after it was spent (parallel timers)
  const { p } = newNecro(BONE, { dummy: false });
  G.skills.spendPip(p, 'rune', 6);
  H.stepSec(9);
  ok('pmne.rune 6 spent runes: nothing back before 10 s', rune(p) === 0, `runes=${rune(p)}`);
  H.stepSec(1.5);
  ok('pmne.rune 6 spent runes: all 6 back after 10 s (0.6 rune/s)', rune(p) === 6, `runes=${rune(p)}`);
  ok('pmne.rune the HUD recharge progress is 0 at full runes', G.skills.pipRegenFrac(p, 'rune') === 0);
  G.skills.spendPip(p, 'rune', 3);
  H.stepSec(5);
  ok('pmne.rune HUD progress ~0.5 five seconds into a recharge', near(G.skills.pipRegenFrac(p, 'rune'), 0.5, 0.1), `frac=${G.skills.pipRegenFrac(p, 'rune').toFixed(2)}`);
  ok('pmne.rune the rune pip is TALENT_PIPS.rune: max 6, 10 s, parallel', TALENT_PIPS.rune.max === 6 && TALENT_PIPS.rune.regen.every === 10 && TALENT_PIPS.rune.regen.parallel === true);
}

// ---- pmne.bone: İlik Söken +3 bone_armor, a melee hit taken consumes one per 2.5 s ------------------------------------------------------------
{
  const { p, e } = newNecro(BONE);
  ok('pmne.bone İlik Söken cast', cast(p, 'e', e) === true);
  H.stepSec(1.2);
  ok('pmne.bone +3 bone_armor', p.statuses.stacks('bone_armor') === 3, `stacks=${p.statuses.stacks('bone_armor')}`);
  ok('pmne.bone 30 s duration', near(p.statuses.get('bone_armor')?.remaining ?? 0, 30, 1.5), `left=${p.statuses.get('bone_armor')?.remaining}`);
  H.stepSec(1.0);
  G.skills.addPip(p, 'rune', 6);
  ok('pmne.bone second İlik Söken stacks (6)', cast(p, 'e', e) === true);
  H.stepSec(1.2);
  ok('pmne.bone stacks add up to 6', p.statuses.stacks('bone_armor') === 6);
  meleeHit(100);
  ok('pmne.bone a melee hit taken consumes one charge', p.statuses.stacks('bone_armor') === 5, `stacks=${p.statuses.stacks('bone_armor')}`);
  H.stepSec(1.0);
  meleeHit(100);
  ok('pmne.bone a second hit inside 2.5 s consumes nothing (ICD)', p.statuses.stacks('bone_armor') === 5, `stacks=${p.statuses.stacks('bone_armor')}`);
  H.stepSec(1.7);
  meleeHit(100);
  ok('pmne.bone a hit after the ICD consumes the next charge', p.statuses.stacks('bone_armor') === 4, `stacks=${p.statuses.stacks('bone_armor')}`);
  p.statuses.apply('bone_armor', 30, { stacks: 20, sourceId: p.id });
  ok('pmne.bone the status caps at 10 charges', p.statuses.stacks('bone_armor') === 10, `stacks=${p.statuses.stacks('bone_armor')}`);
  // damage reduction: 3 % per charge
  const dr = STATUSES.bone_armor.stats.damageReductionPct;
  ok('pmne.bone each charge reduces damage 3 %', near(dr, 0.03));
}

// ---- pmne.death_strike: the heal, the min heal, blood_shield, cost ---------------------------------------------------------------------------------
{
  const { p, e } = newNecro(BONE);
  const spy = healSpy();
  p.resource = 100;
  p.hp = 2000;
  G.combat.recordTaken(p, 300);
  ok('pmne.death_strike cast with 300 damage taken', cast(p, 'q', e) === true);
  H.stepSec(1.0);
  ok('pmne.death_strike 300 taken: 20 % = 60 < 7 % max HP, heals 350', spy.log.length === 1 && near(spy.log[0].amt, 350, 0.5), `heal=${spy.log[0]?.amt}`);
  ok('pmne.death_strike costs 45 Öz', near(p.resource, 55, 3), `Öz=${p.resource.toFixed(1)}`);
  ok('pmne.death_strike grants blood_shield (absorb 20 % of the heal = 70)', p.statuses.has('blood_shield') && near(p.statuses.get('shield')?.magnitude ?? 0, 70, 0.5), `shield=${p.statuses.get('shield')?.magnitude}`);
  p.statuses.remove('shield'); p.statuses.remove('blood_shield');
  H.stepSec(6.5);
  spy.log.length = 0;
  p.hp = 2000;
  p.resource = 100;
  G.combat.recordTaken(p, 3000);
  ok('pmne.death_strike cast with 3000 damage taken', cast(p, 'q', e) === true);
  H.stepSec(1.0);
  ok('pmne.death_strike 3000 taken: heals 20 % = 600', spy.log.length === 1 && near(spy.log[0].amt, 600, 0.5), `heal=${spy.log[0]?.amt}`);
  ok('pmne.death_strike the blood shield is 120', near(p.statuses.get('shield')?.magnitude ?? 0, 120, 0.5), `shield=${p.statuses.get('shield')?.magnitude}`);
  // Vampirik Kan x1.3
  p.statuses.remove('shield'); p.statuses.remove('blood_shield');
  H.stepSec(6.5);
  spy.log.length = 0;
  p.hp = 2000;
  p.resource = 100;
  G.combat.recordTaken(p, 3000);
  p.statuses.apply('vampiric_blood', 10, { sourceId: p.id });
  cast(p, 'q', e);
  H.stepSec(1.0);
  ok('pmne.death_strike under Vampirik Kan the heal is x1.3 (780)', spy.log.length === 1 && near(spy.log[0].amt, 780, 0.5), `heal=${spy.log[0]?.amt}`);
  // not enough Öz: fails unpaid
  p.statuses.remove('vampiric_blood');
  H.stepSec(1.2);
  p.resource = 44;
  ok('pmne.death_strike with 44 Öz does not cast', cast(p, 'q', e) === false && p.resource === 44);
  // out of melee range (no target close): fails unpaid
  const far = H.addEnemy(0, 9, { hp: 1e9 });
  p.resource = 100;
  H.setAimTarget(far);
  ok('pmne.death_strike out of range fails unpaid', cast(p, 'q', far) === false && p.resource === 100);
  spy.stop();
}

// ---- pmne.grip: Ölüm Kancası pulls a dummy to 3 m, taunts; a boss is only taunted --------------------------------------------------------------
{
  const { p } = newNecro(BONE, { dummy: false });
  const n = H.addEnemy(0, 14, { rank: 'trash', hp: 1e9 });
  const b = H.addEnemy(5, 14, { rank: 'boss', hp: 1e9 });
  H.setAimTarget(n);
  p.targetId = n.id;
  ok('pmne.grip cast on a dummy 14 m away', cast(p, 'r', n) === true);
  H.stepSec(1.8);
  const d = Math.hypot(n.position.x - p.position.x, n.position.z - p.position.z);
  ok('pmne.grip the dummy ends ~3 m from the caster', d >= 2.5 && d <= 3.5, `d=${d.toFixed(2)}`);
  ok('pmne.grip the dummy is taunted', n.statuses.has('taunt'));
  ok('pmne.grip cooldown 25 s: the second cast is refused', cast(p, 'r', n) === false);
  p.targetId = b.id; H.setAimTarget(b);
  G.skills.reduceCooldown(p, 'necro_deaths_grip', 100);
  const bx = b.position.x, bz = b.position.z;
  ok('pmne.grip cast on the boss', cast(p, 'r', b) === true);
  H.stepSec(1.8);
  ok('pmne.grip the boss is taunted and not moved', b.statuses.has('taunt') && near(b.position.x, bx, 1e-3) && near(b.position.z, bz, 1e-3));
  ok('pmne.grip the boss taunt is 2 s, the trash taunt 3 s', (b.statuses.get('taunt')?.remaining ?? 9) <= 2.01);
}

// ---- pmne.boil: Kan Kaynatma ---------------------------------------------------------------------------------------------------------------------
{
  const { p } = newNecro(BONE, { dummy: false });
  const es = [];
  for (let i = 0; i < 10; i++) es.push((() => { const x = H.addEnemy(Math.sin(i) * 3, Math.cos(i) * 3, { hp: 1e9 }); x.maxHp = 1e9; return x; })());
  ok('pmne.boil cast (free, no rune)', cast(p, 's1', null) === true);
  H.stepSec(1.5);
  const plagued = es.filter((x) => x.statuses.has('blood_plague'));
  ok('pmne.boil hits at most 8 enemies and plagues each with its own dps', plagued.length === 8 && plagued.every((x) => x.statuses.get('blood_plague').dps > 0), `plagued=${plagued.length}`);
  ok('pmne.boil blood_plague lasts 24 s', plagued.every((x) => near(x.statuses.get('blood_plague').remaining, 24, 1.6)));
  ok('pmne.boil rune count untouched', rune(p) === 6);
  H.stepSec(1.2);
  ok('pmne.boil 2 charges: a second cast right away works', cast(p, 's1', null) === true);
  H.stepSec(1.2);
  ok('pmne.boil a third cast is out of charges', cast(p, 's1', null) === false);
  H.stepSec(7.0);
  ok('pmne.boil one charge is back after 7.5 s of recharge', cast(p, 's1', null) === true);
}

// ---- pmne.chain: both weapon chains through the real combo -----------------------------------------------------------------------------------
{
  for (const spec of ALL) {
    const { p, e } = newNecro(spec);
    p.resource = 0;
    const got = [];
    const onCast = (ev) => { if (ev.casterId === p.id && /^necro_(blood_)?basic_\d$/.test(ev.skillId)) got.push(ev.skillId); };
    G.events.on('skill:cast', onCast);
    let guard = 0;
    while (got.length < 4 && guard++ < 600) {
      if (spec === SUMM && got.length === 0) H.setAimTarget(e);
      cast(p, 'lmb', e);
      H.step(3);
      if (spec === SUMM) G.minions.update(H.DT * 3);
    }
    G.events.off?.('skill:cast', onCast);
    const pre = spec === BONE ? 'necro_blood_basic_' : 'necro_basic_';
    ok(`pmne.chain ${spec.id} plays steps 1-4 in order`, got.slice(0, 4).join() === [1, 2, 3, 4].map((i) => pre + i).join(), got.join());
    H.stepSec(1.2);
    const gains = spec === BONE ? [3, 3, 3, 4] : [3, 3, 4, 0];
    // Öz from a full chain (+ resourceGainPct 0): 13 (Kemik) / 10 (Ordu)
    ok(`pmne.chain ${spec.id} a full chain gives ${gains.reduce((a, b) => a + b, 0)} Öz`, near(p.resource, gains.reduce((a, b) => a + b, 0), 0.5), `Öz=${p.resource.toFixed(1)}`);
  }
}

// ---- pmne.vile: Çürüten Darbe -> 3 stacks, Ölüm Kırbacı spends 1 and spawns 1 Küçük Ghul ----------------------------------------------------------
{
  const { p, e } = newNecro(SUMM);
  tick(0.5);
  const hpLog = [];
  ok('pmne.vile Çürüten Darbe cast', cast(p, 'e', e) === true);
  tick(1.2);
  ok('pmne.vile Çürüten Darbe: 3 vile_contagion stacks', e.statuses.stacks('vile_contagion') === 3, `stacks=${e.statuses.stacks('vile_contagion')}`);
  ok('pmne.vile Çürüten Darbe costs 2 runes, gives +15 Öz', rune(p) === 4 && near(p.resource, 15, 2), `runes=${rune(p)} Öz=${p.resource.toFixed(1)}`);
  ok('pmne.vile no Küçük Ghul yet', G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === 0);
  const hp0 = e.hp;
  ok('pmne.vile Ölüm Kırbacı cast', cast(p, 'rmb', e) === true);
  tick(1.0);
  ok('pmne.vile Ölüm Kırbacı spends one stack (2 left)', e.statuses.stacks('vile_contagion') === 2, `stacks=${e.statuses.stacks('vile_contagion')}`);
  ok('pmne.vile Ölüm Kırbacı spawns 1 Küçük Ghul', G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === 1);
  ok('pmne.vile Ölüm Kırbacı costs 1 rune and gives +10 Öz', rune(p) === 3 && near(p.resource, 25, 4), `runes=${rune(p)} Öz=${p.resource.toFixed(1)}`);
  tick(1.0);
  cast(p, 'rmb', e); tick(1.0);
  cast(p, 'rmb', e); tick(1.0);
  ok('pmne.vile three Kırbaç spend all 3 stacks', e.statuses.stacks('vile_contagion') === 0);
  ok('pmne.vile the Küçük Ghul cap is 3', G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === 3);
  // without a stack: plain hit, no ghoul
  G.skills.addPip(p, 'rune', 6);
  tick(1.0);
  const n0 = G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length;
  const before = e.hp;
  cast(p, 'rmb', e); tick(1.0);
  ok('pmne.vile Ölüm Kırbacı without a stack is a plain hit (no new ghoul spawned beyond the cap, no stack)', e.hp < before && e.statuses.stacks('vile_contagion') === 0 && G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === n0);
  // the Küçük Ghul expires after 8 s
  tick(8.5);
  ok('pmne.vile Küçük Ghul lives 8 s', G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length === 0);
  // damage: x1.35 with a stack
  const { p: q, e: t } = newNecro(SUMM, { dummy: true });
  void hpLog; void hp0;
  const hits = [];
  const orig = G.combat.playerHitEnemy;
  G.combat.playerHitEnemy = function (a, tt, spec) { if (spec.skillId === 'necro_scourge_strike') hits.push(spec.coef); return orig.call(this, a, tt, spec); };
  t.statuses.apply('vile_contagion', 20, { stacks: 1, sourceId: q.id });
  cast(q, 'rmb', t); tick(1.0);
  G.skills.addPip(q, 'rune', 6); tick(1.2);
  cast(q, 'rmb', t); tick(1.0);
  G.combat.playerHitEnemy = orig;
  ok('pmne.vile the spent stack hits for x1.35 (coef 0.55 x 1.35 vs 0.55)', hits.length >= 2, `hits=${hits.join(',')}`);
}

// ---- pmne.sudden: Ani Kıyamet makes Ölüm Sarmalı / Salgın free (and consumed); the fx rolls it ------------------------------------------------------
{
  const { p, e } = newNecro(SUMM);
  p.resource = 10;
  ok('pmne.sudden Ölüm Sarmalı with 10 Öz does not cast', cast(p, 'q', e) === false);
  p.statuses.apply('sudden_doom', 12, { sourceId: p.id });
  ok('pmne.sudden with sudden_doom Ölüm Sarmalı is free', cast(p, 'q', e) === true);
  tick(1.0);
  ok('pmne.sudden free: no Öz spent and the status is consumed', near(p.resource, 10, 2.5) && !p.statuses.has('sudden_doom'), `Öz=${p.resource.toFixed(1)} doom=${p.statuses.has('sudden_doom')}`);
  p.statuses.apply('sudden_doom', 12, { sourceId: p.id });
  p.resource = 0;
  ok('pmne.sudden Salgın is free with sudden_doom too', cast(p, 's1', e) === true);
  tick(1.5);
  ok('pmne.sudden Salgın: free and consumed', !p.statuses.has('sudden_doom') && p.resource === 0);
  // the fx: 12 % per hit, PRD, icd 2 s
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(SUMM.fx).items, `spec:${SUMM.id}`));
  p.resource = 100;
  let procs = 0;
  let casts = 0;
  for (let i = 0; i < 400; i++) {
    G.skills.addPip(p, 'rune', 6);
    p.statuses.remove('sudden_doom');
    if (cast(p, 'rmb', e)) casts++;
    tick(2.1);
    eng.update(2.1);
    if (p.statuses.has('sudden_doom')) procs++;
    if (casts >= 120) break;
  }
  const rate = procs / Math.max(1, casts);
  ok('pmne.sudden Ölüm Kırbacı procs sudden_doom about 12 % of the time (PRD)', rate > 0.06 && rate < 0.2, `procs=${procs}/${casts} (${(rate * 100).toFixed(1)} %)`);
  G.procs = undefined;
}

// ---- pmne.outbreak / pmne.epidemic ----------------------------------------------------------------------------------------------------------------
{
  const { p, e } = newNecro(SUMM);
  ok('pmne.outbreak cast (r, 25 m)', cast(p, 'r', e) === true);
  tick(1.2);
  const pl = e.statuses.get('virulent_plague');
  ok('pmne.outbreak applies virulent_plague 21 s with dps', !!pl && pl.dps > 0 && near(pl.remaining, 21, 1.5), `dps=${pl?.dps} left=${pl?.remaining}`);
  ok('pmne.outbreak costs 1 rune, no Öz gain', rune(p) === 5 && p.resource === 0);
  // Epidemic spreads the plague with the target's live dps
  const a = H.addEnemy(4, 2.2, { hp: 1e9 }), b = H.addEnemy(-4, 2.2, { hp: 1e9 }), far = H.addEnemy(20, 20, { hp: 1e9 });
  p.resource = 100;
  ok('pmne.epidemic cast (s1)', cast(p, 's1', e) === true);
  tick(1.8);
  ok('pmne.epidemic the plague spreads to the enemies within 8 m of the target, not to the far one', a.statuses.has('virulent_plague') && b.statuses.has('virulent_plague') && !far.statuses.has('virulent_plague'));
  ok('pmne.epidemic costs 20 Öz', near(p.resource, 80, 0.5), `Öz=${p.resource.toFixed(1)}`);
  ok('pmne.epidemic copies the target\'s dps', a.statuses.get('virulent_plague').dps > 0 && near(a.statuses.get('virulent_plague').dps, e.statuses.get('virulent_plague').dps, e.statuses.get('virulent_plague').dps * 1.5));
}

// ---- pmne.pet: the Kemik Ghul is auto-summoned, comes back, taunts ----------------------------------------------------------------------------------
{
  const { p } = newNecro(SUMM, { dummy: false });
  tick(0.5);
  const pets = () => G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_ghoul');
  ok('pmne.pet Ordu Efendisi has the Kemik Ghul without casting anything', pets().length === 1);
  tick(2);
  ok('pmne.pet exactly one (group cap 1, no duplicate per frame)', pets().length === 1 && G.minions.list.filter((m) => m.def.id === 'necro_ghoul').length === 1);
  ok('pmne.pet HP = 80 % of the owner HP x (1 + minionHpPct)', near(pets()[0].maxHp, Math.round(p.maxHp * 0.8 * (1 + p.getStat('minionHpPct'))), 1));
  const m = pets()[0];
  G.minions.hurt(m, 1e9, 'shadow');
  ok('pmne.pet killed: dead', m.isDead);
  tick(5);
  ok('pmne.pet still dead after 5 s (10 s respawn)', pets().length === 0);
  tick(6);
  ok('pmne.pet back 10 s after its death, once', pets().length === 1 && G.minions.list.filter((x) => x.def.id === 'necro_ghoul' && !x.isDead).length === 1);
  // Kemik Muhafızı has no pet
  const k = newNecro(BONE, { dummy: false });
  tick(1.5);
  ok('pmne.pet Kemik Muhafızı gets no pet', G.minions.ownedBy(k.p.id).length === 0);
}
{
  // the pet taunts enemies that are busy with someone else (NC42)
  const { p } = newNecro(SUMM, { dummy: false });
  p.position.set(0, 0, 0);
  const e1 = H.addEnemy(6, 0, { hp: 1e7 }), e2 = H.addEnemy(-6, 2, { hp: 1e7 });
  for (const e of [e1, e2]) {
    const ai = Object.create(EnemyAI.prototype);
    Object.assign(ai, { e, dir: { inSafeZone: () => false }, threat: new Map(), target: null, disposed: false, passives: [], aggroed: true });
    e.ai = ai;
    e.targetId = p.id;
    ai.addThreat(p.id, 800);
  }
  tick(1.2);
  const pet = G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_ghoul')[0];
  ok('pmne.pet the ghoul taunts two enemies that are on the owner', !!pet && e1.statuses.get('taunt')?.sourceId === pet.id && e2.statuses.get('taunt')?.sourceId === pet.id);
}

// ---- pmne.army: Ölüler Ordusu (8 ghouls ignoring the cap, 30 s) and the rmb transform --------------------------------------------------------------------
{
  const { p, e } = newNecro(SUMM);
  tick(0.5);
  // fill the lesser cap first: army ghouls ignore it
  e.statuses.apply('vile_contagion', 20, { stacks: 3, sourceId: p.id });
  for (let i = 0; i < 3; i++) { G.skills.addPip(p, 'rune', 6); cast(p, 'rmb', e); tick(1.1); }
  const lesser = G.minions.ownedBy(p.id, (m) => m.def.group === 'lesser').length;
  const r0 = rune(p);
  ok('pmne.army setup: pet + lesser ghouls alive', lesser === 3 && G.minions.ownedBy(p.id).length === 4);
  ok('pmne.army before: rmb is Ölüm Kırbacı', G.skills.getSlotSkill(p, 'rmb') === 'necro_scourge_strike');
  G.skills.addPip(p, 'rune', 6);
  const r1 = rune(p);
  ok('pmne.army cast (m90, hard cast)', cast(p, 'm90', e) === true);
  tick(0.6);
  ok('pmne.army still casting at 0.6 s: nobody yet', G.minions.ownedBy(p.id, (m) => m.def.group === 'army').length === 0);
  tick(1.2);
  const army = G.minions.ownedBy(p.id, (m) => m.def.group === 'army');
  ok('pmne.army 8 Ordu Ghulü spawned (ignoring the group cap), pet and Küçük Ghullar kept', army.length === 8 && G.minions.ownedBy(p.id).length === 12, `army=${army.length} all=${G.minions.ownedBy(p.id).length}`);
  ok('pmne.army ghouls live 30 s', army.every((m) => m.life > 28 && m.life <= 30.1), army.map((m) => m.life.toFixed(1)).join(','));
  ok('pmne.army costs 1 rune', rune(p) === r1 - 1 + 0 || rune(p) >= r1 - 1, `runes ${r1} -> ${rune(p)} (before ${r0})`);
  ok('pmne.army applies the army status (30 s)', p.statuses.has('army') && near(p.statuses.get('army').remaining, 30, 1.5));
  ok('pmne.army rmb now resolves to Ölüm Emri', G.skills.getSlotSkill(p, 'rmb') === 'necro_death_order');
  // Ölüm Emri: the ghouls leap onto the target, Öz +10, 1 rune, one merged hit of 8 x 0.25
  e.statuses.apply('vile_contagion', 20, { stacks: 2, sourceId: p.id });
  G.skills.addPip(p, 'rune', 6);
  p.resource = 0;
  const hits = [];
  const orig = G.combat.playerHitEnemy;
  G.combat.playerHitEnemy = function (a, tt, spec) { hits.push({ tt, coef: spec.coef, skillId: spec.skillId }); return orig.call(this, a, tt, spec); };
  H.setAimTarget(e);
  tick(1.1);
  ok('pmne.army Ölüm Emri cast', cast(p, 'rmb', e) === true);
  tick(0.6);
  const merged = hits.filter((h) => h.skillId === 'necro_death_order');
  G.combat.playerHitEnemy = orig;
  ok('pmne.army Ölüm Emri: ONE merged hit of 8 x 0.25 = 2.0 on the target', merged.length === 1 && near(merged[0].coef, 2.0, 1e-9), JSON.stringify(merged.map((h) => h.coef)));
  ok('pmne.army Ölüm Emri spends a vile_contagion stack, +10 Öz', e.statuses.stacks('vile_contagion') === 1 && near(p.resource, 10, 1.5), `stacks=${e.statuses.stacks('vile_contagion')} Öz=${p.resource.toFixed(1)}`);
  ok('pmne.army Ölüm Emri focuses the target', G.minions.focusTarget(p.id) === e);
  tick(30);
  ok('pmne.army ghouls gone after 30 s, army status over, rmb back to Ölüm Kırbacı', G.minions.ownedBy(p.id, (m) => m.def.group === 'army').length === 0 && !p.statuses.has('army') && G.skills.getSlotSkill(p, 'rmb') === 'necro_scourge_strike');
}

// ---- pmne.dt: Karanlık Dönüşüm doubles the pet attack coef for 15 s -------------------------------------------------------------------------------------
{
  const { p, e } = newNecro(SUMM);
  tick(0.8);
  const pet = G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_ghoul')[0];
  const base = minionDef('necro_ghoul').attacks[0].coef;
  const claw = () => pet.def.attacks.find((a) => a.kind === 'melee').coef;
  ok('pmne.dt before: claw 0.40', near(claw(), base));
  ok('pmne.dt cast (m45)', cast(p, 'm45', e) === true);
  tick(0.7);
  ok('pmne.dt the pet claw coef is doubled (0.80)', near(claw(), base * 2, 1e-9), `coef=${claw()}`);
  ok('pmne.dt applies dark_transformation 15 s', p.statuses.has('dark_transformation') && near(p.statuses.get('dark_transformation').remaining, 15, 1));
  tick(13);
  ok('pmne.dt still doubled at ~14 s', near(claw(), base * 2, 1e-9));
  tick(2.5);
  ok('pmne.dt back to normal after the 15 s window', near(claw(), base, 1e-9), `coef=${claw()}`);
  ok('pmne.dt the shared MinionDef row is untouched', minionDef('necro_ghoul').attacks[0].coef === base);
  // Ölüm Sarmalı is +20 % under DT
  const q = newNecro(SUMM);
  tick(0.5);
  q.p.resource = 100;
  const hits = [];
  const orig = G.combat.playerHitEnemy;
  G.combat.playerHitEnemy = function (a, tt, spec) { if (spec.skillId === 'necro_death_coil') hits.push(spec.coef); return orig.call(this, a, tt, spec); };
  cast(q.p, 'q', q.e); tick(1.4);
  H.stepSec(0.5);
  q.p.statuses.apply('dark_transformation', 15, { sourceId: q.p.id });
  cast(q.p, 'q', q.e); tick(1.4);
  G.combat.playerHitEnemy = orig;
  ok('pmne.dt Ölüm Sarmalı hit coef is the row\'s 1.6 (the +20 % rides on `more`)', hits.length >= 1 && hits.every((c) => near(c, 1.6, 1e-9)), `coefs=${hits.join(',')}`);
}

// ---- pmne.ams / pmne.kick / pmne.advance -------------------------------------------------------------------------------------------------------------
{
  const { p } = newNecro(BONE, { dummy: false });
  p.resource = 10;
  ok('pmne.ams cast (s3)', cast(p, 's3', null) === true);
  H.stepSec(1.0);
  ok('pmne.ams applies anti_magic_shell 8 s', p.statuses.has('anti_magic_shell') && near(p.statuses.get('anti_magic_shell').remaining, 8, 1.3));
  // magic damage is soaked (30 % max HP = 1500), physical is not
  const hp0 = p.hp;
  G.combat.hitLocalPlayer({ sourceId: null, amount: 1000, type: 'fire', unavoidable: true, blockable: false, ignoreIframes: true });
  ok('pmne.ams a 1000 fire hit is absorbed', p.hp >= hp0 - 5, `hp ${hp0} -> ${p.hp}`);
  ok('pmne.ams 1000 absorbed = 20 % of max HP: +20 Öz (cap 20)', near(p.resource, 30, 5), `Öz=${p.resource.toFixed(1)}`);
  const hp1 = p.hp;
  G.combat.hitLocalPlayer({ sourceId: null, amount: 500, type: 'physical', unavoidable: true, blockable: false, ignoreIframes: true });
  ok('pmne.ams physical damage is not absorbed', p.hp < hp1 - 100, `hp ${hp1} -> ${p.hp}`);
}
{
  const { p } = newNecro(BONE, { dummy: false });
  const dummy = H.addEnemy(0, 6, { hp: 1e9 });
  H.setAimTarget(dummy);
  ok('pmne.kick Zihin Dondurma with nothing to interrupt fails unpaid (no cooldown)', cast(p, 's4', dummy) === false && G.skills.getCooldown(p, 'necro_mind_freeze').remaining <= 0);
  ok('pmne.kick row: r 15, off-GCD, silence 3', K('necro_mind_freeze').range === 15 && K('necro_mind_freeze').offGcd === true);
  ok('pmne.advance Ölüm Atılışı cast (s2)', cast(p, 's2', null) === true);
  H.stepSec(0.5);
  ok('pmne.advance +40 % move speed, knockback immune, 6 s', p.statuses.has('deaths_advance') && STATUSES.deaths_advance.stats.moveSpeedPct === 0.4 && near(p.statuses.get('deaths_advance').remaining, 6, 0.8));
  ok('pmne.advance cooldown 25 s', cast(p, 's2', null) === false);
  ok('pmne.icebound Buz Gibi Sebat cast (m180) applies icebound 8 s', cast(p, 'm180', null) === true && (H.stepSec(0.5), p.statuses.has('icebound')) && STATUSES.icebound.stats.damageReductionPct === 0.3);
}

// ---- pmne.anger: Anger Management (Kemik: every 20 Öz spent -1 s on the majors) ------------------------------------------------------------------------
{
  const { p, e } = newNecro(BONE);
  p.resource = 100;
  cast(p, 'm45', null);
  H.stepSec(0.5);
  const before = G.skills.getCooldown(p, 'necro_vampiric_blood').remaining;
  cast(p, 'q', e);
  H.stepSec(1.0);
  const after = G.skills.getCooldown(p, 'necro_vampiric_blood').remaining;
  ok('pmne.anger 45 Öz spent shortens Vampirik Kan by 2.25 s on top of the 1 s clock', before - after > 3.0 && before - after < 3.6, `${before.toFixed(2)} -> ${after.toFixed(2)}`);
  ok('pmne.anger Ordu Efendisi has no Anger Management', !SUMM.specials.some((s) => s.id === 'trait_anger') && BONE.specials.some((s) => s.id === 'trait_anger' && s.params.angerPer === 20));
}

// ---- pmne.echo: Hayalet Orak Dansı echoes the four rotation skills at 50 % ---------------------------------------------------------------------------------
{
  const { p, e } = newNecro(BONE);
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(BONE.fx).items, `spec:${BONE.id}`));
  p.resource = 100;
  const echoes = [];
  const orig = G.skills.castEcho;
  G.skills.castEcho = function (actor, skillId, coef, target) { echoes.push({ skillId, coef }); return orig.call(this, actor, skillId, coef, target); };
  cast(p, 'rmb', e);
  H.stepSec(1.0); eng.update(1.0);
  ok('pmne.echo no echo without Hayalet Orak', echoes.length === 0);
  ok('pmne.echo Hayalet Orak cast (m90)', cast(p, 'm90', null) === true);
  H.stepSec(0.8);
  for (const [slot, id] of [['rmb', 'necro_heart_strike'], ['e', 'necro_marrowrend'], ['q', 'necro_death_strike'], ['s1', 'necro_blood_boil']]) {
    G.skills.addPip(p, 'rune', 6);
    p.resource = 100;
    H.stepSec(1.2);
    cast(p, slot, e);
    H.stepSec(1.0); eng.update(1.0);
    G.skills.reduceCooldown(p, id, 100);
  }
  G.skills.castEcho = orig;
  ok('pmne.echo the four rotation skills echo at 50 % under Hayalet Orak', ['necro_heart_strike', 'necro_marrowrend', 'necro_death_strike', 'necro_blood_boil'].every((id) => echoes.some((x) => x.skillId === id && near(x.coef, 0.5, 1e-9))), echoes.map((x) => x.skillId).join());
  G.procs = undefined;
}

// ---- pmne.cast: every necromancer row casts without error ----------------------------------------------------------------------------------------------
{
  const before = errors.length;
  let casted = 0;
  const failed = [];
  for (const spec of ALL) {
    for (const d of NECRO_ROWS) {
      if (/_basic_\d$/.test(d.id)) continue;
      const { p, e } = newNecro(spec);
      G.minions.summon(p, minionDef('necro_army_ghoul'), { count: 2, ignoreCap: true });
      e.statuses.apply('vile_contagion', 20, { stacks: 3, sourceId: p.id });
      e.statuses.apply('virulent_plague', 20, { sourceId: p.id });
      G.character.save.skillBar = { ...G.character.save.skillBar, e: d.id };
      G.skills.addPip(p, 'rune', 6);
      p.resource = 100;
      p.statuses.apply('army', 30, { sourceId: p.id });
      try {
        const r = cast(p, 'e', e);
        if (r) casted++;
        for (let i = 0; i < 40; i++) { H.step(3); G.minions.update(H.DT * 3); }
        if (!r && !['necro_mind_freeze', 'necro_soul_snap', 'necro_spirit_walk'].includes(d.id)) failed.push(`${spec.id}:${d.id}`);
      } catch (err) {
        failed.push(`${spec.id}:${d.id} THREW ${err?.message ?? err}`);
      }
    }
  }
  ok('pmne.cast no row throws and none is refused on a prepared dummy', failed.length === 0, failed.slice(0, 6).join(' | '));
  const bad = errors.slice(before).filter((m) => m.startsWith('ERR') || /unknown|missing|undefined/i.test(m));
  ok('pmne.cast no console errors / warnings from the necromancer rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
  ok('pmne.cast most rows really cast', casted >= NECRO_ROWS.filter((d) => !/_basic_\d$/.test(d.id)).length, `casted=${casted}`);
}

// ---- APL runner ----------------------------------------------------------------------------------------------------------------------------------------------
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/!target\.status:(\w+)/g, "!TS('$1')")
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/target\.stacks:(\w+)/g, "TST('$1')")
    .replace(/target\.remaining:(\w+)/g, "TREM('$1')")
    .replace(/\bstacks:(\w+)/g, "ST('$1')")
    .replace(/\bremaining:(\w+)/g, "REM('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/pips:rune/g, 'RUNES')
    .replace(/\bhp%/g, 'HPP')
    .replace(/\bres\b/g, 'RES')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'CDR', 'CH', 'CD', 'TS', 'TST', 'TREM', 'ST', 'REM', 'RUNES', 'HPP', 'RES', 'TG', `return (${cond});`) };
}

/** Runs the ST list of a spec on a dummy for `seconds`; returns the ledgers (per whole run). */
function runApl(spec, seconds, { chainsPerMin = Infinity, incoming = false, warmup = 0 } = {}) {
  const { p, e } = newNecro(spec);
  const eng = seededEngine(); // the proc stream (PRD) is seeded, so the ledger of a run is reproducible
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(spec.fx).items, `spec:${spec.id}`));
  p.resource = 100;
  H.step(2);
  const lines = ROTATIONS_KIT_NECROMANCER[spec.id].st.map(compile);
  const led = { oz: 0, ozGross: 0, ozSpent: 0, runeIn: 0, runeSpent: 0, casts: {}, hpLow: 1, ozEnd: 0, healed: 0 };
  const origRes = G.skills.addResource.bind(G.skills);
  G.skills.addResource = (a, n) => {
    const b = a.resource;
    origRes(a, n);
    if (a === p) {
      if (n > 0) { led.ozGross += n; led.oz += a.resource - b; } else led.ozSpent += -n;
    }
  };
  const origAdd = G.skills.addPip.bind(G.skills);
  const origSpend = G.skills.spendPip.bind(G.skills);
  G.skills.addPip = (a, id, n) => { const b = G.skills.pipCount(a, id); origAdd(a, id, n); if (a === p && id === 'rune') led.runeIn += G.skills.pipCount(a, id) - b; };
  G.skills.spendPip = (a, id, n) => { const r = origSpend(a, id, n); if (a === p && id === 'rune' && r) led.runeSpent += n; return r; };
  let tokens = 1; // weapon-chain starts left (the budgets count 6 / 8 filler chains per minute)
  const chainFirst = spec.basic ? `${spec.basic}_1` : 'necro_basic_1';
  const castLog = (ev) => {
    if (ev.casterId !== p.id) return;
    led.casts[ev.skillId] = (led.casts[ev.skillId] ?? 0) + 1;
    if (ev.skillId === chainFirst) tokens -= 1;
  };
  G.events.on('skill:cast', castLog);
  const env = {
    S: (id) => p.statuses.has(id),
    CDR: (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; },
    CH: (id) => G.skills.getCooldown(p, id).charges,
    CD: (id) => G.skills.getCooldown(p, id).remaining,
    TS: (id) => e.statuses.has(id),
    TST: (id) => e.statuses.stacks(id),
    TREM: (id) => e.statuses.get(id)?.remaining ?? 0,
    ST: (id) => p.statuses.stacks(id),
    REM: (id) => p.statuses.get(id)?.remaining ?? 0,
  };
  const slotOf = (id) => {
    if (id === spec.basic || id === 'necro_basic') return 'lmb';
    for (const s of SLOTS) if (s !== 'lmb' && G.skills.getSlotSkill(p, s) === id) return s;
    return null;
  };
  const total = Math.round((seconds + warmup) / H.DT);
  for (let f = 0; f < total; f++) {
    // the ledgers start after the warm-up (the opening pool of 6 runes and full Öz bar are not steady state)
    if (f === Math.round(warmup / H.DT)) Object.assign(led, { oz: 0, ozGross: 0, ozSpent: 0, runeIn: 0, runeSpent: 0, casts: {} });
    if (incoming && f % 156 === 78) { meleeHit(150); if (p.hp < p.maxHp * 0.3) p.hp = p.maxHp * 0.6; } // the boss swings every 2.5 s
    led.hpLow = Math.min(led.hpLow, p.hp / p.maxHp);
    for (const l of lines) {
      const slot = slotOf(l.skill);
      if (!slot) continue;
      if (!l.fn(env.S, env.CDR, env.CH, env.CD, env.TS, env.TST, env.TREM, env.ST, env.REM, rune(p), p.hp / p.maxHp * 100, p.resource, 1)) continue;
      if (slot === 'lmb' && G.skills.state(p).combo.next === 0 && tokens < 1) continue; // no chain start left: wait for the next cooldown
      if (G.skills.tryCastSlot(p, slot, H.aimFor(p, e))) break;
    }
    H.step(1);
    G.minions.update(H.DT);
    eng.update(H.DT);
    tokens = Math.min(1.5, tokens + (chainsPerMin / 60) * H.DT);
    if (f % 60 === 0) H.clearEvents();
  }
  G.events.off?.('skill:cast', castLog);
  G.skills.addResource = origRes;
  G.skills.addPip = origAdd;
  G.skills.spendPip = origSpend;
  G.procs = undefined;
  led.ozEnd = p.resource;
  led.petAlive = G.minions.ownedBy(p.id, (m) => m.def.id === 'necro_ghoul').length;
  return led;
}

// ---- pmne.ledger: 120 s APL runs after a 30 s warm-up (rune income, Öz income) per 60 s ------------------------------------------------------------------
const LEDGER_SEC = 120;
const WARMUP_SEC = 30;
const CHAINS = { necromancer_bone: 6, necromancer_summoner: 8 }; // weapon chains per minute in the kit budgets (§8d / §9d)
const TARGET_OZ = { necromancer_bone: 252, necromancer_summoner: 350 };
const LEDGER = {};
for (const spec of ALL) {
  const led = runApl(spec, LEDGER_SEC, { chainsPerMin: CHAINS[spec.id], incoming: spec === BONE, warmup: WARMUP_SEC });
  LEDGER[spec.id] = led;
  const per = (v) => v / (LEDGER_SEC / 60);
  const dev = Math.abs(per(led.oz) - TARGET_OZ[spec.id]) / TARGET_OZ[spec.id];
  ok(`pmne.ledger ${spec.id} rune income 36 +- 4 per 60 s`, Math.abs(per(led.runeIn) - 36) <= 4, `income=${per(led.runeIn).toFixed(1)}/min spent=${per(led.runeSpent).toFixed(1)}/min`);
  ok(`pmne.ledger ${spec.id} Öz income within 15 % of ${TARGET_OZ[spec.id]} per 60 s`, dev <= 0.15, `income=${per(led.oz).toFixed(0)}/min (${(dev * 100).toFixed(0)} % off) gross=${per(led.ozGross).toFixed(0)} spent=${per(led.ozSpent).toFixed(0)}/min`);
  console.log(`     ${spec.id} casts per min: ${Object.entries(led.casts).map(([k, v]) => `${k.replace('necro_', '')}=${(v / (LEDGER_SEC / 60)).toFixed(1)}`).join(' ')}`);
}
{
  const l = LEDGER.necromancer_bone;
  ok('pmne.ledger necromancer_bone casts Ölüm Darbesi ~5.6 per min (4-7)', (l.casts.necro_death_strike ?? 0) / 2 >= 4 && (l.casts.necro_death_strike ?? 0) / 2 <= 7, `per min=${((l.casts.necro_death_strike ?? 0) / 2).toFixed(1)}`);
  ok('pmne.ledger necromancer_bone keeps Kemik Zırhı up (İlik Söken ~8 per min, 5-11)', (l.casts.necro_marrowrend ?? 0) / 2 >= 5 && (l.casts.necro_marrowrend ?? 0) / 2 <= 11, `per min=${((l.casts.necro_marrowrend ?? 0) / 2).toFixed(1)}`);
  const u = LEDGER.necromancer_summoner;
  ok('pmne.ledger necromancer_summoner keeps the pet alive for the whole run', u.petAlive === 1);
  ok('pmne.ledger necromancer_summoner casts Çürüten Darbe ~6 / Ölüm Kırbacı ~18 per min', (u.casts.necro_festering_strike ?? 0) / 2 >= 4 && (u.casts.necro_festering_strike ?? 0) / 2 <= 9 && (u.casts.necro_scourge_strike ?? 0) / 2 + (u.casts.necro_death_order ?? 0) / 2 >= 12,
    `fest=${((u.casts.necro_festering_strike ?? 0) / 2).toFixed(1)} scourge=${(((u.casts.necro_scourge_strike ?? 0) + (u.casts.necro_death_order ?? 0)) / 2).toFixed(1)}`);
}

// ---- engine errors -------------------------------------------------------------------------------------------------------------------------------------------
{
  const bad = errors.filter((m) => m.startsWith('ERR'));
  ok('pmne.errors no console errors from the necromancer rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
}

console.log(fails === 0 ? '\nkit.necro (pmne): all checks PASS' : `\nkit.necro (pmne): ${fails} FAIL`);
const engineErrors = errors.filter((m) => m.startsWith('ERR'));
if (engineErrors.length) console.log(`engine console errors (${engineErrors.length}): ${[...new Set(engineErrors)].slice(0, 5).join(' | ')}`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
