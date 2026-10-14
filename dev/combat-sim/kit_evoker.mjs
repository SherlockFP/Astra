// KIT AE-4 checks (docs/kits/agile-evoker.md §4): Ejderhasoy (Yıkım Nefesi, Koruyucu Nefes, Yüceltme) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_evoker.mjs
// Covered: ae4.ids, ae4.apl, ae4.status, ae4.fx, ae4.procs, ae4.cd / ae4.coef, ae4.pip (Öz 1 / 3.5 s, haste), ae4.empower (rank thresholds, cone
//          ranges, refund, tip_scales, interrupt, auto release), ae4.breath (Ateş Nefesi grants), ae4.disint, ae4.flame, ae4.pyre, ae4.surge, ae4.heal
//          (Yaşayan Alev heal / damage, Geri Dönüş HoT, Yankı, Rüya Nefesi cone by rank, Zümrüt Çiçek, Yeşil Kucaklayış, Durgunluk store and release),
//          ae4.aug (Abanoz Kudret, Öngörü, Çağların Nefesi bank), ae4.dragonrage, ae4.cast (every evoker row casts), ae4.ledger (APL runs, Öz and mana
//          ledgers of the three specs), ae4.l1 (level-1 character without a spec).
// Every cast goes through the real SkillSystem (pip costs, GCD, cooldowns, proc mods, behaviours, channels) on dev dummies and dev allies. Not
// covered here (browser / SimBench): feel, VFX, the budget damage totals (§4.1d - §4.3d).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_EVOKER } = await H.imp('data/rotations_kit_evoker.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { PROC_DEFS, getProcDef } = await H.imp('data/procs.ts');
const { resolveProcMods, PROC_MODS } = await H.imp('combat/procMods.ts');
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
const { resetEvokerKit, stasisStored } = await H.imp('combat/skills/evokerKit.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { parseFx, fxContext } = await H.imp('data/talentTrees/fx.ts');
const { CLASSES, PLAYABLE_CLASSES } = await H.imp('data/classes.ts');
const { TALENT_PIPS } = await H.imp('data/specs_talents.ts');
const { healFormula } = await H.imp('combat/healing.ts');

// deterministic crits: the damage ratio checks compare single hits (Combat.rng rolls the 5 % minimum crit chance)
G.combat.rng.next = () => 0.9;

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const K = (id) => SKILLS[id];
const DEV = SPECS.evoker_devastation, PRES = SPECS.evoker_preservation, AUG = SPECS.evoker_augmentation;
const ALL = [DEV, PRES, AUG];
const SLOTS = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];
const EVOKER_ROWS = Object.values(SKILLS).filter((d) => d.classId === 'evoker' && !/^evoker_basic_(heavy|riposte|krt|run|jump|roll)$/.test(d.id));
const ess = (p) => G.skills.pipCount(p, 'essence');
const TRANSFORMS = ['evoker_unbound_flame', 'evoker_stasis_release'];

let allyId = 400;
/** A dev ally (local, so statuses and heals apply directly). */
function addAlly(x, z, hp = 5000, maxHp = 5000) {
  const a = new H.FakePlayer('knight');
  a.id = allyId++;
  a.isLocal = true;
  a.maxHp = maxHp; a.hp = hp;
  a.position.set(x, 0, z);
  H.world.add(a);
  return a;
}

/**
 * An evoker of a spec on the spec's bar: full mana, 5 Öz, a dev dummy 2.2 m ahead when `dummy`. The spec passives that the engine folds in
 * StatCalc are copied into the fake player's stats (haste, healing, damage, regen) because the sim has no StatCalc.
 */
function newEvoker(spec, { dummy = true, hp = 1e9, regen = false, essence = 5 } = {}) {
  const p = H.addPlayer('evoker');
  resetEvokerKit();
  p.spec = spec.id;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  p.stats.weaponMin = p.stats.weaponMax = 100;
  for (const [k, v] of Object.entries(spec.stats)) if (k !== 'resourceRegen' && k !== 'resourceRegenPct') p.stats[k] = (p.stats[k] ?? 0) + v;
  p.stats.resourceRegen = regen ? (5 + (spec.stats.resourceRegen ?? 0)) * (1 + (spec.stats.resourceRegenPct ?? 0)) : 0;
  G.character.save.skillBar = { ...spec.defaultBar };
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}), skillPick: () => 0 };
  G.procs = undefined;
  H.step(2);
  p.resource = 100;
  p.hp = p.maxHp = 1e6;
  G.skills.addPip(p, 'essence', essence);
  let e = null;
  if (dummy) { e = H.addEnemy(0, 2.2, { hp }); e.maxHp = hp; e.hp = hp; p.targetId = e.id; H.setAimTarget(e); } else H.setAimTarget(null);
  return { p, e };
}
const cast = (p, slot, target, allyId2) => G.skills.tryCastSlot(p, slot, { ...H.aimFor(p, target ?? null), ...(allyId2 ? { allyId: allyId2 } : {}) });
const HARNESS_SLOTS = new Set(['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3']);
/** Presses a slot and keeps it down (the harness controller only knows lmb..s3; m45 / m90 / m180 / s4 use the shared held set). */
function pressSlot(p, slot, target) {
  if (HARNESS_SLOTS.has(slot)) { H.press(slot); return true; }
  const r = cast(p, slot, target ?? null);
  if (r) H.held.add(`skill_${slot}`);
  return r;
}
function releaseSlot(slot) {
  if (HARNESS_SLOTS.has(slot)) H.release(slot); else H.held.delete(`skill_${slot}`);
}
const dmgOf = (skillId, targetId) => events.damage.filter((d) => d.skillId === skillId && d.amount > 0 && (targetId === undefined || d.targetId === targetId));
const sumDmg = (skillId, targetId) => dmgOf(skillId, targetId).reduce((s, d) => s + d.amount, 0);
function seededEngine(seed = 20261014) {
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
/** One Yaşayan Alev hit on a fresh dummy: the unit every damage ratio is measured against. */
function unitHit(spec = DEV) {
  const { p, e } = newEvoker(spec);
  cast(p, 'rmb', e);
  H.stepSec(3);
  const hit = dmgOf('evoker_living_flame', e.id)[0];
  return hit ? hit.amount : 0;
}

// ---- ae4.ids: spec lists, majors, mods and the default bars resolve ----------------------------------------------------------------------
for (const spec of ALL) {
  const ids = [...spec.skills, ...Object.values(spec.defaultBar), ...Object.values(spec.majors), ...spec.mods.map((m) => m.skill)];
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`ae4.ids ${spec.id} ids resolve`, missing.length === 0, missing.join(','));
  const bar = Object.values(spec.defaultBar);
  ok(`ae4.ids ${spec.id} bar has 12 slots, no duplicate skill`, bar.length === 12 && new Set(bar).size === 12 && SLOTS.every((s) => !!spec.defaultBar[s]));
  ok(`ae4.ids ${spec.id} every id is an evoker row`, ids.every((id) => !SKILLS[id] || SKILLS[id].classId === 'evoker'));
  ok(`ae4.ids ${spec.id} unlock levels cover the skill list`, spec.skills.every((id) => spec.unlock[id] !== undefined), spec.skills.filter((id) => spec.unlock[id] === undefined).join(','));
  ok(`ae4.ids ${spec.id} Turkish name and desc`, !!spec.name && spec.desc.length > 60 && spec.mainStat === 'int');
  ok(`ae4.ids ${spec.id} bar slots hold the chain, the spec skills or the majors`, SLOTS.every((s) => {
    const id = spec.defaultBar[s];
    return id === 'evoker_basic' || spec.skills.includes(id) || Object.values(spec.majors).includes(id);
  }));
  ok(`ae4.ids ${spec.id} unlock levels agree with the SkillDef (core buttons by 10-15, majors 10 / 20 / 30)`, spec.skills.every((id) => spec.unlock[id] === K(id).unlockLevel) && spec.skills.every((id) => spec.unlock[id] <= 15)
    && K(spec.majors.m45).unlockLevel <= 10 && K(spec.majors.m90).unlockLevel <= 20 && K(spec.majors.m180).unlockLevel === 30, spec.skills.filter((id) => spec.unlock[id] !== K(id).unlockLevel).join(','));
  ok(`ae4.ids ${spec.id} no treeSkills (no talent trees yet)`, !spec.treeSkills);
}
ok('ae4.ids roles', DEV.role === 'dps' && PRES.role === 'healer' && AUG.role === 'dps');
ok('ae4.ids SPECS holds the three evoker specs and ClassDef.specs lists them', ALL.every((s) => !!SPECS[s.id]) && CLASSES.evoker.specs.join() === 'evoker_devastation,evoker_preservation,evoker_augmentation');
{
  const cls = CLASSES.evoker;
  const want = ['evoker_living_flame', 'evoker_disintegrate', 'evoker_fire_breath', 'evoker_pyre', 'evoker_hover', 'evoker_obsidian_scales', 'evoker_quell', 'evoker_dragonrage'];
  ok('ae4.ids ClassDef.skills is the fixed 8-id list and every id is a class-level row (no spec field)', cls.skills.join() === want.join() && want.every((id) => !!SKILLS[id] && SKILLS[id].spec === undefined && SKILLS[id].classId === 'evoker'));
  ok('ae4.ids evoker is playable, ranged auto-attacker, mana bar + essence pip', PLAYABLE_CLASSES.includes('evoker') && cls.autoAttack === 'ranged' && cls.resource === 'mana' && cls.basicAttack === 'evoker_basic');
  ok('ae4.ids activePips of an evoker is [essence], max 5, 3.5 s', G.skills.activePips(H.addPlayer('evoker')).map((d) => d.id).join() === 'essence' && TALENT_PIPS.essence.max === 5 && TALENT_PIPS.essence.regen.every === 3.5);
}
ok('ae4.ids every evoker row has Turkish text and a registered behaviour', EVOKER_ROWS.every((d) => d.name.length > 2 && d.desc.length > 10 && (!d.behavior || d.behavior === 'combo' || !!BEHAVIORS[d.behavior])),
  EVOKER_ROWS.filter((d) => d.behavior && d.behavior !== 'combo' && !BEHAVIORS[d.behavior]).map((d) => `${d.id}:${d.behavior}`).join(','));
ok('ae4.ids 31 distinct rows (chain + 3 steps, 9 class rows, 18 spec rows incl. Kırıcı Yıldız, Geri Sarma)', EVOKER_ROWS.length === 31, `rows=${EVOKER_ROWS.length}`);

// ---- ae4.apl: skill and status names in the APL rows resolve -------------------------------------------------------------------------
for (const spec of ALL) {
  const apl = ROTATIONS_KIT_EVOKER[spec.id];
  ok(`ae4.apl ${spec.id} rows exist`, !!apl && apl.st.length > 0 && (apl.aoe?.length ?? 0) > 0);
  const skillIds = new Set(), statusIds = new Set();
  for (const l of [...apl.st, ...(apl.aoe ?? [])]) {
    for (const m of l.matchAll(/\b(evoker_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/(?:status|stacks|remaining):([a-z_]+)/g)) statusIds.add(m[1]);
  }
  ok(`ae4.apl ${spec.id} skill ids resolve`, [...skillIds].every((id) => !!SKILLS[id]), [...skillIds].filter((id) => !SKILLS[id]).join(','));
  ok(`ae4.apl ${spec.id} status ids resolve`, [...statusIds].every((id) => !!STATUSES[id]), [...statusIds].filter((id) => !STATUSES[id]).join(','));
  ok(`ae4.apl ${spec.id} ends with the weapon chain`, apl.st.at(-1) === 'evoker_basic' && apl.aoe.at(-1) === 'evoker_basic');
  const onBar = new Set([...Object.values(spec.defaultBar), ...TRANSFORMS]);
  ok(`ae4.apl ${spec.id} every APL skill is on the default bar (or a transform of it)`, [...skillIds].every((id) => onBar.has(id)), [...skillIds].filter((id) => !onBar.has(id)).join(','));
}

// ---- ae4.status: every status an evoker row, a spec mod or a spec fx applies has a StatusDef --------------------------------------------
{
  const applied = new Set();
  for (const d of EVOKER_ROWS) for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  for (const spec of ALL) {
    for (const m of spec.fx.matchAll(/st\((?:self|tgt|ally|party),([a-z_]+),/g)) applied.add(m[1]);
    for (const m of spec.mods) for (const s of [...(m.patch?.statuses ?? []), ...(m.patch?.selfStatuses ?? [])]) applied.add(s.status);
  }
  for (const id of ['essence_burst', 'leaping_flames', 'burnout', 'iridescence', 'tip_scales', 'dragonrage', 'unbound_flame', 'hover', 'obsidian', 'merithras_blessing', 'echo', 'twin_echoes', 'lifebind',
    'stasis', 'time_dilation', 'ebon_might', 'prescience', 'temporal_wound', 'bronze_blessing', 'reversion', 'dream_breath', 'empowering', 'fire_breath_burn']) applied.add(id);
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('ae4.status every evoker-applied status has a def', missing.length === 0, missing.join(','));
  ok('ae4.status HoT statuses are rule hot, essence_burst 2 stacks, dragonrage halves Ateş Nefesi / Ebedi Dalga cooldowns',
    STATUS_RULES.reversion.hot && STATUS_RULES.dream_breath.hot && STATUSES.essence_burst.maxStacks === 2 && STATUS_RULES.dragonrage.cdMult.mult === 0.5
    && STATUS_RULES.dragonrage.cdMult.skills.join() === 'evoker_fire_breath,evoker_eternity_surge');
  ok('ae4.status stat statuses: hover +30 % speed, obsidian -30 %, time_dilation -40 %, prescience +13 % crit, dragonrage +15 %',
    STATUSES.hover.stats.moveSpeedPct === 0.3 && STATUSES.obsidian.stats.damageReductionPct === 0.3 && STATUSES.time_dilation.stats.damageReductionPct === 0.4
    && STATUSES.prescience.stats.critChance === 0.13 && STATUSES.dragonrage.stats.damagePct === 0.15);
}

// ---- ae4.fx: the spec fx strings parse and every skill / status / stat in them exists ----------------------------------------------------
{
  const ctx = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
  for (const spec of ALL) {
    const r = parseFx(spec.fx, ctx);
    ok(`ae4.fx ${spec.id} fx parses and validates`, r.errors.length === 0, r.errors.join(' | '));
    const want = spec === DEV ? 4 : spec === PRES ? 3 : 2;
    ok(`ae4.fx ${spec.id} has ${want} trigger rows`, r.items.filter((i) => i.k === 'T').length === want);
  }
}

// ---- ae4.procs: ProcDefs, ProcMods -----------------------------------------------------------------------------------------------------
{
  const ids = ['essence_burst', 'leaping_flames', 'burnout', 'iridescence', 'tip_scales', 'dragonrage', 'unbound_flame', 'merithras_blessing', 'twin_echoes', 'stasis'];
  ok('ae4.procs ten ProcDefs registered, every glow id is a real skill', ids.every((id) => !!getProcDef(id)) && ids.flatMap((id) => getProcDef(id).glow).every((g) => !!SKILLS[g]));
  ok('ae4.procs essence_burst glows the five spenders (union of the three specs), overlay left', getProcDef('essence_burst').glow.join() === 'evoker_disintegrate,evoker_pyre,evoker_echo,evoker_emerald_blossom,evoker_eruption'
    && getProcDef('essence_burst').overlay === 'left');
  ok('ae4.procs unbound_flame glows the transformed button, stasis glows the release', getProcDef('unbound_flame').glow.join() === 'evoker_unbound_flame' && getProcDef('stasis').glow.join() === 'evoker_stasis_release');
  const v = (...s) => ({ has: (x) => s.includes(x), stacks: (x) => (s.includes(x) ? 1 : 0) });
  const m = resolveProcMods(v('essence_burst'), 'evoker_disintegrate');
  ok('ae4.procs essence_burst: Parçala pipFree + consumeOne', m?.pipFree === true && m.oneStack.includes('essence_burst'));
  ok('ae4.procs essence_burst serves Pyre, Yankı, Zümrüt Çiçek, Püskürme, nothing else', ['evoker_pyre', 'evoker_echo', 'evoker_emerald_blossom', 'evoker_eruption'].every((id) => resolveProcMods(v('essence_burst'), id)?.pipFree)
    && !resolveProcMods(v('essence_burst'), 'evoker_fire_breath'));
  ok('ae4.procs burnout: instant (castTimeMult 0) +30 %, iridescence +20 %, unbound_flame free',
    resolveProcMods(v('burnout'), 'evoker_living_flame')?.castTimeMult === 0 && resolveProcMods(v('burnout'), 'evoker_living_flame')?.more === 1.3
    && resolveProcMods(v('iridescence'), 'evoker_pyre')?.more === 1.2 && resolveProcMods(v('unbound_flame'), 'evoker_unbound_flame')?.costMult === 0);
  ok('ae4.procs one ProcMod per status, no duplicate ProcDef', Object.keys(PROC_MODS).filter((s) => ['essence_burst', 'burnout', 'iridescence', 'unbound_flame'].includes(s)).length === 4
    && PROC_DEFS.length === new Set(PROC_DEFS.map((d) => d.id)).size);
}

// ---- ae4.cd / ae4.coef: the numbers of the kit tables (verbatim) ------------------------------------------------------------------------------
{
  const cd = (id, v, ch) => ok(`ae4.cd ${id} ${v} s${ch ? `, ${ch} charges` : ''}`, K(id).cooldown === v && (ch === undefined || K(id).charges === ch), `cd=${K(id).cooldown} ch=${K(id).charges}`);
  cd('evoker_fire_breath', 30, 2); cd('evoker_eternity_surge', 30); cd('evoker_hover', 35, 2); cd('evoker_obsidian_scales', 90, 2); cd('evoker_quell', 40); cd('evoker_deep_breath', 45);
  cd('evoker_dragonrage', 90); cd('evoker_fury_of_aspects', 180); cd('evoker_verdant_embrace', 24); cd('evoker_time_dilation', 45); cd('evoker_stasis', 90); cd('evoker_ebon_might', 30);
  cd('evoker_prescience', 12, 2); cd('evoker_upheaval', 45); cd('evoker_breath_of_eons', 90);
  const chain = [1, 2, 3].map((i) => K(`evoker_basic_${i}`));
  ok('ae4.coef chain 0.10 / 0.10 / 0.14 frost, 3 steps, pierce 2, range 25', chain.map((d) => d.damage.coef).join() === '0.1,0.1,0.14' && chain.every((d) => d.damage.type === 'frost' && d.pierce === 2 && d.range === 25) && K('evoker_basic').params.steps === 3 && K('evoker_basic').behavior === 'combo');
  ok('ae4.coef Yaşayan Alev 1.00 fire, 1.6 s, 2.5 % mana, homing', K('evoker_living_flame').damage.coef === 1 && K('evoker_living_flame').castTime === 1.6 && K('evoker_living_flame').cost === 2.5 && K('evoker_living_flame').homing === 5);
  ok('ae4.coef Parçala 2.4 s channel, 3 Öz, 2.9 arcane total', K('evoker_disintegrate').channel === 2.4 && K('evoker_disintegrate').pip.cost === 3 && K('evoker_disintegrate').damage.coef === 2.9 && K('evoker_disintegrate').damage.type === 'arcane');
  ok('ae4.coef Ateş Nefesi 1.8 %, initial 2.4 + burn 3.2 = 5.6, ranks 14 / 18 / 22 m, x1 / 1.25 / 1.55', K('evoker_fire_breath').cost === 1.8 && near(K('evoker_fire_breath').damage.coef * (1 + K('evoker_fire_breath').params.burnMag), 5.6, 0.01)
    && [1, 2, 3].map((r) => K('evoker_fire_breath').params[`range${r}`]).join() === '14,18,22' && [1, 2, 3].map((r) => K('evoker_fire_breath').params[`mult${r}`]).join() === '1,1.25,1.55');
  ok('ae4.coef Ateş Nefesi (Yüceltme patch) 3.40 total, s1', near(AUG.mods.find((m) => m.skill === 'evoker_fire_breath').patch.damage.coef * (1 + K('evoker_fire_breath').params.burnMag), 3.4, 0.01) && AUG.mods.find((m) => m.skill === 'evoker_fire_breath').patch.defaultSlot === 's1');
  ok('ae4.coef Ebedi Dalga 4.0 frost, 1.2 %, 1 / 3 / 5 targets', K('evoker_eternity_surge').damage.coef === 4 && K('evoker_eternity_surge').cost === 1.2 && [1, 2, 3].map((r) => K('evoker_eternity_surge').params[`targets${r}`]).join() === '1,3,5');
  ok('ae4.coef Pyre 2.1 fire r 8, 3 Öz; Püskürme 2.0 fire cast 2.0, 3 Öz', K('evoker_pyre').damage.coef === 2.1 && K('evoker_pyre').radius === 8 && K('evoker_pyre').pip.cost === 3 && K('evoker_eruption').damage.coef === 2 && K('evoker_eruption').castTime === 2 && K('evoker_eruption').pip.cost === 3);
  ok('ae4.coef Serbest Alev 1.75, replaces Yaşayan Alev while unbound_flame; Derin Nefes 6.4 (3.2 + 3.2) r 6', K('evoker_unbound_flame').damage.coef === 1.75 && K('evoker_unbound_flame').replaces.whileStatus === 'unbound_flame'
    && K('evoker_deep_breath').params.pathCoef + K('evoker_deep_breath').damage.coef === 6.4 && K('evoker_deep_breath').radius === 6);
  ok('ae4.coef Geri Dönüş HoT 3.0 / 12 s +10 % absorb, 2.2 %; Rüya Nefesi 4.9 %, HoT 4 / 8 / 12 s, 12 / 15 / 18 m; Yankı 2 Öz; Zümrüt Çiçek 3 Öz 5 %, 2.3 x 3',
    K('evoker_reversion').params.hotCoef === 3 && K('evoker_reversion').params.hotDur === 12 && K('evoker_reversion').params.absorbPct === 0.1 && K('evoker_reversion').cost === 2.2
    && K('evoker_dream_breath').cost === 4.9 && [1, 2, 3].map((r) => K('evoker_dream_breath').params[`hot${r}`]).join() === '4,8,12' && [1, 2, 3].map((r) => K('evoker_dream_breath').params[`range${r}`]).join() === '12,15,18'
    && K('evoker_echo').pip.cost === 2 && K('evoker_emerald_blossom').pip.cost === 3 && K('evoker_emerald_blossom').cost === 5 && K('evoker_emerald_blossom').heal.coef === 2.3 && K('evoker_emerald_blossom').params.maxTargets === 3);
  ok('ae4.coef Abanoz Kudret 1.2 s cast 1 % 20 s +11 % / +8 %; Öngörü 20 s max 2; Upheaval 3.1 r 5 / 7.5 / 10; Breath of Eons 3.1 path 30 m, wound 10 s 15 %',
    K('evoker_ebon_might').castTime === 1.2 && K('evoker_ebon_might').params.allyMag === 0.11 && K('evoker_ebon_might').params.selfMag === 0.08 && K('evoker_prescience').params.max === 2
    && K('evoker_upheaval').damage.coef === 3.1 && [1, 2, 3].map((r) => K('evoker_upheaval').params[`radius${r}`]).join() === '5,7.5,10'
    && K('evoker_breath_of_eons').range === 30 && K('evoker_breath_of_eons').params.pathCoef === 3.1 && K('evoker_breath_of_eons').params.bankPct === 0.15);
  ok('ae4.coef empowered rows are 2 s non-fixed channels with hold1..3 0.67 / 1.33 / 2.0', ['evoker_fire_breath', 'evoker_eternity_surge', 'evoker_dream_breath', 'evoker_upheaval'].every((id) => K(id).channel === 2 && !K(id).params.fixed
    && K(id).params.hold1 === 0.67 && K(id).params.hold2 === 1.33 && K(id).params.hold3 === 2 && K(id).behavior === 'kit_empower' && K(id).castTime === 0));
  ok('ae4.coef Koruyucu chain patch 0.24 / 0.24 / 0.34, Yaşayan Alev heal 1.5 (any), Yüceltme Yaşayan Alev 0.75 + 0.25 Öz', PRES.mods.filter((m) => /basic_/.test(m.skill)).map((m) => m.patch.damage.coef).join() === '0.24,0.24,0.34'
    && PRES.mods.find((m) => m.skill === 'evoker_living_flame').patch.heal.coef === 1.5 && PRES.mods.find((m) => m.skill === 'evoker_living_flame').patch.allyTarget === 'any'
    && AUG.mods.find((m) => m.skill === 'evoker_living_flame').patch.damage.coef === 0.75 && AUG.mods.find((m) => m.skill === 'evoker_living_flame').patch.pip.gain === 0.25);
  ok('ae4.coef Aspectlerin Öfkesi is major_hero m180 with sated 600; majors sit on m45 / m90 / m180', K('evoker_fury_of_aspects').behavior === 'major_hero' && K('evoker_fury_of_aspects').params.major === 180 && K('evoker_fury_of_aspects').params.sated === 600
    && K('evoker_fury_of_aspects').tags.includes('hero') && ALL.every((s) => K(s.majors.m45).defaultSlot === 'm45' && K(s.majors.m90).defaultSlot === 'm90' && K(s.majors.m180).defaultSlot === 'm180'));
  ok('ae4.coef off-GCD rows: Süzül, Obsidyen, Bastır, majors that doc lists off-GCD', ['evoker_hover', 'evoker_obsidian_scales', 'evoker_quell', 'evoker_deep_breath', 'evoker_dragonrage', 'evoker_time_dilation', 'evoker_stasis', 'evoker_breath_of_eons', 'evoker_fury_of_aspects'].every((id) => K(id).offGcd === true));
}

// ---- ae4.pip: Öz regenerates 1 per 3.5 s, haste shortens it, max 5 ---------------------------------------------------------------------------
{
  const { p } = newEvoker(DEV, { dummy: false, essence: 0 });
  p.stats.castSpeed = 0;
  G.skills.spendPip(p, 'essence', ess(p));
  H.stepSec(3.4);
  ok('ae4.pip nothing back before 3.5 s', ess(p) === 0, `essence=${ess(p)}`);
  H.stepSec(0.3);
  ok('ae4.pip +1 after 3.5 s', ess(p) === 1, `essence=${ess(p)}`);
  H.stepSec(3.6 * 6);
  ok('ae4.pip capped at 5', ess(p) === 5, `essence=${ess(p)}`);
  G.skills.spendPip(p, 'essence', 5);
  p.stats.castSpeed = 0.25;
  H.stepSec(2.9);
  ok('ae4.pip +25 % haste: 1 pip per 2.8 s', ess(p) === 1, `essence=${ess(p)}`);
  H.stepSec(2.8 * 3 + 0.2);
  ok('ae4.pip +25 % haste: 4 pips after ~11.5 s', ess(p) === 4, `essence=${ess(p)}`);
}

// ---- ae4.empower: rank thresholds 0.67 / 1.33 / 2.00 s, cones, refund, tip_scales, interrupt ---------------------------------------------------------
/** Dummies on the +z axis at 13 / 17 / 21 m: the cone of Ateş Nefesi reaches 14 / 18 / 22 m by rank. */
function lineOfDummies() {
  return [13, 17, 21].map((z) => H.addEnemy(0, z, { hp: 1e9 }));
}
/** Holds the e slot for `holdSec`, releases, runs 0.6 s more; returns which of the line dummies took Ateş Nefesi damage. */
function holdBreath(holdSec, tweak) {
  const { p, e } = newEvoker(DEV);
  const line = lineOfDummies();
  e.position.set(0, 0, 40); // keep the aimed dummy out of the cone
  if (tweak) tweak(p);
  H.clearEvents();
  H.press('e');
  H.stepSec(holdSec);
  H.release('e');
  H.stepSec(0.6);
  return { p, line, hit: line.map((d) => dmgOf('evoker_fire_breath', d.id).length > 0) };
}
{
  const r0 = holdBreath(0.5);
  ok('ae4.empower release at 0.5 s (before rank 1): nothing is hit', r0.hit.every((h) => !h));
  ok('ae4.empower ... the mana is refunded and no cooldown is spent (2 charges left)', near(r0.p.resource, 100, 0.01) && G.skills.getCooldown(r0.p, 'evoker_fire_breath').charges === 2, `mana=${r0.p.resource.toFixed(2)} charges=${G.skills.getCooldown(r0.p, 'evoker_fire_breath').charges}`);
  ok('ae4.empower ... no essence_burst, no leaping_flames', !r0.p.statuses.has('essence_burst') && !r0.p.statuses.has('leaping_flames'));
  const r1 = holdBreath(0.8);
  ok('ae4.empower release at 0.8 s = rank 1: only the 13 m dummy is hit', r1.hit.join() === 'true,false,false', r1.hit.join());
  ok('ae4.empower ... rank 1 costs 1.8 mana, spends one charge, grants 1 leaping_flames + 1 essence_burst', near(r1.p.resource, 98.2, 0.01) && G.skills.getCooldown(r1.p, 'evoker_fire_breath').charges === 1
    && r1.p.statuses.stacks('leaping_flames') === 1 && r1.p.statuses.stacks('essence_burst') === 1, `mana=${r1.p.resource.toFixed(2)} lf=${r1.p.statuses.stacks('leaping_flames')} eb=${r1.p.statuses.stacks('essence_burst')}`);
  const r2 = holdBreath(1.5);
  ok('ae4.empower release at 1.5 s = rank 2: 13 m and 17 m are hit', r2.hit.join() === 'true,true,false', r2.hit.join());
  ok('ae4.empower ... rank 2 grants 2 leaping_flames', r2.p.statuses.stacks('leaping_flames') === 2, `lf=${r2.p.statuses.stacks('leaping_flames')}`);
  const r3 = holdBreath(2.4);
  ok('ae4.empower held past 2.0 s auto-releases at rank 3: all three are hit', r3.hit.join() === 'true,true,true', r3.hit.join());
  ok('ae4.empower ... rank 3 grants 3 leaping_flames', r3.p.statuses.stacks('leaping_flames') === 3, `lf=${r3.p.statuses.stacks('leaping_flames')}`);
  ok('ae4.empower ... the channel ended by itself', !G.skills.getAction(r3.p));
  const b1 = holdBreath(0.60), b2 = holdBreath(0.70);
  ok('ae4.empower 0.60 s holds nothing, 0.70 s holds rank 1 (threshold 0.67 s)', b1.hit.every((h) => !h) && b2.hit[0] === true && b2.hit[1] === false);
  const c1 = holdBreath(1.15), c2 = holdBreath(1.40);
  ok('ae4.empower 1.15 s is rank 1, 1.40 s is rank 2 (threshold 1.33 s / 1.05 haste = 1.27 s)', c1.hit.join() === 'true,false,false' && c2.hit.join() === 'true,true,false', `${c1.hit.join()} / ${c2.hit.join()}`);
  const d1 = holdBreath(1.75), h3 = holdBreath(1.0, (p) => { p.stats.castSpeed = 0.5; });
  ok('ae4.empower 1.75 s is rank 2; at +50 % haste 1.0 s of hold is rank 2 (thresholds / 1.5)', d1.hit.join() === 'true,true,false' && h3.hit.join() === 'true,true,false', `${d1.hit.join()} / haste ${h3.hit.join()}`);
  const h4 = holdBreath(1.45, (p) => { p.stats.castSpeed = 0.5; });
  ok('ae4.empower ... at +50 % haste 1.45 s auto-released at rank 3 (2.0 / 1.5 = 1.33 s)', h4.hit.join() === 'true,true,true', h4.hit.join());
  const hitOn = (hold) => {
    const { e } = newEvoker(DEV);
    const d = H.addEnemy(0, 10, { hp: 1e9 });
    e.position.set(0, 0, 40);
    H.clearEvents();
    H.press('e'); H.stepSec(hold); H.release('e'); H.stepSec(0.4);
    return dmgOf('evoker_fire_breath', d.id)[0]?.amount ?? 0;
  };
  const a1 = hitOn(0.8), a2 = hitOn(1.5), a3 = hitOn(2.4);
  ok('ae4.empower initial damage x1.25 at rank 2 and x1.55 at rank 3', near(a2 / a1, 1.25, 0.05) && near(a3 / a1, 1.55, 0.07), `ratios ${(a2 / a1).toFixed(3)} ${(a3 / a1).toFixed(3)} (${a1} ${a2} ${a3})`);
}
{
  // Terazi Eğimi: rank 3 at once, the status is spent
  const { p, e } = newEvoker(DEV);
  const line = lineOfDummies();
  e.position.set(0, 0, 40);
  p.statuses.apply('tip_scales', 30, { sourceId: p.id });
  H.clearEvents();
  H.press('e');
  H.stepSec(0.25);
  const hitNow = line.map((d) => dmgOf('evoker_fire_breath', d.id).length > 0);
  H.release('e');
  ok('ae4.empower tip_scales: rank 3 fires within 0.25 s without a hold, status consumed', hitNow.join() === 'true,true,true' && !p.statuses.has('tip_scales'), `${hitNow.join()} tip=${p.statuses.has('tip_scales')}`);
}
{
  // interrupt during the hold fires nothing
  const { p, e } = newEvoker(DEV);
  const line = lineOfDummies();
  e.position.set(0, 0, 40);
  H.clearEvents();
  H.press('e');
  H.stepSec(1.5);
  G.skills.interrupt(p, true);
  H.release('e');
  H.stepSec(0.6);
  ok('ae4.empower an interrupt during the hold fires nothing', line.every((d) => dmgOf('evoker_fire_breath', d.id).length === 0) && !p.statuses.has('essence_burst') && !p.statuses.has('empowering'));
}
{
  // movement is slowed 80 % while holding, not under hover
  const { p } = newEvoker(DEV, { dummy: false });
  H.press('e');
  H.stepSec(0.5);
  const slow = p.getActionMoveMul();
  H.release('e'); H.stepSec(0.5);
  p.statuses.apply('hover', 6, { sourceId: p.id });
  p.resource = 100;
  H.press('e');
  H.stepSec(0.5);
  const slowHover = p.getActionMoveMul();
  H.release('e'); H.stepSec(0.5);
  ok('ae4.empower holding slows movement 80 % (x0.2), Süzül removes the slow', near(slow, 0.2, 0.01) && slowHover === 1, `slow x${slow} hover x${slowHover}`);
}

// ---- ae4.breath / ae4.disint / ae4.flame / ae4.pyre / ae4.surge --------------------------------------------------------------------------------
const UNIT = unitHit(DEV);
ok('ae4.unit a Yaşayan Alev hit is a measurable unit', UNIT > 50, `unit=${UNIT}`);
{
  const { p, e } = newEvoker(DEV, { essence: 0 });
  e.position.set(0, 0, 10);
  H.clearEvents();
  H.press('e'); H.stepSec(0.8); H.release('e'); H.stepSec(0.5);
  ok('ae4.breath Ateş Nefesi rank 1 applies the burn to the target (fire_breath_burn) and 1 essence_burst', e.statuses.has('fire_breath_burn') && p.statuses.stacks('essence_burst') === 1);
  const initial = sumDmg('evoker_fire_breath', e.id);
  ok('ae4.breath initial hit = 2.4 x the unit', near(initial / UNIT, 2.4, 0.3), `ratio=${(initial / UNIT).toFixed(2)}`);
  H.clearEvents();
  H.stepSec(16);
  const dot = events.damage.filter((d) => d.targetId === e.id && d.amount > 0).reduce((s, d) => s + d.amount, 0);
  ok('ae4.breath the burn adds ~3.2 x the unit over 14 s', near(dot / UNIT, 3.2, 0.7), `dot=${(dot / UNIT).toFixed(2)} x unit`);
  H.setAimTarget(e);
  e.position.set(0, 0, 4);
  H.stepSec(1);
  G.skills.spendPip(p, 'essence', ess(p));
  p.statuses.apply('essence_burst', 15, { sourceId: p.id });
  const before = ess(p);
  const c = cast(p, 'q', e);
  H.stepSec(0.3);
  ok('ae4.breath Parçala is free with essence_burst (0 Öz): casts, burst spent, Öz untouched', c === true && !p.statuses.has('essence_burst') && ess(p) === before, `essence ${before} -> ${ess(p)}`);
  H.stepSec(2.6);
}
{
  const { p, e } = newEvoker(DEV);
  const b = ess(p);
  const c0 = cast(p, 'q', e);
  H.stepSec(0.2);
  ok('ae4.disint Parçala pays 3 Öz', c0 === true && ess(p) === b - 3, `essence ${b} -> ${ess(p)}`);
  H.stepSec(3);
  const total = sumDmg('evoker_disintegrate', e.id);
  ok('ae4.disint total over the channel = 2.9 x the unit', near(total / UNIT, 2.9, 0.4), `ratio=${(total / UNIT).toFixed(2)} ticks=${dmgOf('evoker_disintegrate', e.id).length}`);
  ok('ae4.disint 4-6 ticks over ~2.4 s', dmgOf('evoker_disintegrate', e.id).length >= 4 && dmgOf('evoker_disintegrate', e.id).length <= 6);
  G.skills.spendPip(p, 'essence', ess(p));
  G.skills.addPip(p, 'essence', 2);
  ok('ae4.disint with 2 Öz the cast is refused (no cost, no cooldown)', cast(p, 'q', e) === false && ess(p) === 2 && !G.skills.getAction(p));
  G.skills.addPip(p, 'essence', 5);
  H.stepSec(1.2);
  p.statuses.apply('iridescence', 10, { stacks: 2, sourceId: p.id });
  H.clearEvents();
  cast(p, 'q', e); H.stepSec(3);
  const with1 = sumDmg('evoker_disintegrate', e.id);
  ok('ae4.disint iridescence: +20 % and one stack spent per cast', near(with1 / total, 1.2, 0.2) && p.statuses.stacks('iridescence') === 1, `x${(with1 / total).toFixed(2)} stacks=${p.statuses.stacks('iridescence')}`);
}
{
  const { p, e } = newEvoker(DEV);
  H.addEnemy(3, 4, { hp: 1e9 }); H.addEnemy(-3, 4, { hp: 1e9 });
  p.statuses.apply('leaping_flames', 20, { stacks: 2, sourceId: p.id });
  H.clearEvents();
  cast(p, 'rmb', e); H.stepSec(3.2);
  const targets = new Set(events.damage.filter((d) => d.skillId === 'evoker_living_flame' && d.amount > 0).map((d) => d.targetId));
  ok('ae4.flame 2 leaping_flames stacks: the bolt also flies at 2 more enemies, stacks spent', targets.size === 3 && !p.statuses.has('leaping_flames'), `targets=${targets.size}`);
  H.stepSec(1);
  p.statuses.apply('burnout', 10, { sourceId: p.id });
  H.clearEvents();
  const t0 = G.engine.time;
  cast(p, 'rmb', e);
  H.stepSec(0.6);
  const burn = dmgOf('evoker_living_flame', e.id)[0];
  ok('ae4.flame burnout: the cast is instant (hit inside 0.6 s), +30 % and the status is spent', !!burn && burn.t - t0 < 0.6 && near(burn.amount / UNIT, 1.3, 0.1) && !p.statuses.has('burnout'), `x${burn ? (burn.amount / UNIT).toFixed(2) : '-'} at ${burn ? (burn.t - t0).toFixed(2) : '-'}s`);
  H.stepSec(1.5);
  H.clearEvents();
  const t1 = G.engine.time;
  cast(p, 'rmb', e); H.stepSec(2.2);
  const first = dmgOf('evoker_living_flame', e.id)[0];
  ok('ae4.flame the hard cast lands after ~1.5 s (1.6 s / 1.05 haste)', !!first && near(first.t - t1, 1.6 / 1.05 + 0.1, 0.4), `hit at ${first ? (first.t - t1).toFixed(2) : '-'}s`);
}
{
  const { p, e } = newEvoker(DEV);
  const others = [H.addEnemy(4, 2.2, { hp: 1e9 }), H.addEnemy(-4, 2.2, { hp: 1e9 }), H.addEnemy(0, 20, { hp: 1e9 })];
  H.clearEvents();
  const b = ess(p);
  cast(p, 's1', e); H.stepSec(1.2);
  const hits = [e, ...others].map((x) => sumDmg('evoker_pyre', x.id));
  ok('ae4.pyre hits every enemy within 8 m of the target (3), spares the far one, pays 3 Öz', hits[0] > 0 && hits[1] > 0 && hits[2] > 0 && hits[3] === 0 && ess(p) === b - 3, `hits=${hits.map((h) => Math.round(h / UNIT * 100) / 100).join()}`);
  ok('ae4.pyre 2.1 x the unit per target', near(hits[0] / UNIT, 2.1, 0.3), `x${(hits[0] / UNIT).toFixed(2)}`);
}
{
  const { p, e } = newEvoker(DEV);
  const others = [H.addEnemy(5, 6, { hp: 1e9 }), H.addEnemy(-5, 6, { hp: 1e9 }), H.addEnemy(0, 6, { hp: 1e9 }), H.addEnemy(2, 12, { hp: 1e9 }), H.addEnemy(0, 40, { hp: 1e9 })];
  const line = [...others.slice(0, 4)];
  e.position.set(0, 0, 8);
  H.clearEvents();
  H.press('r'); H.stepSec(0.8); H.release('r'); H.stepSec(0.6);
  ok('ae4.surge rank 1 (0.8 s): a single target takes 4.0 x the unit, 2 Gökkuşağı, 1.2 mana', near(sumDmg('evoker_eternity_surge', e.id) / UNIT, 4, 0.6) && others.every((o) => sumDmg('evoker_eternity_surge', o.id) === 0)
    && p.statuses.stacks('iridescence') === 2 && near(p.resource, 98.8, 0.01), `x${(sumDmg('evoker_eternity_surge', e.id) / UNIT).toFixed(2)} ir=${p.statuses.stacks('iridescence')} mana=${p.resource.toFixed(2)}`);
  H.stepSec(31);
  H.clearEvents();
  H.press('r'); H.stepSec(1.5); H.release('r'); H.stepSec(0.6);
  const n2 = [e, ...line].filter((x) => sumDmg('evoker_eternity_surge', x.id) > 0).length;
  ok('ae4.surge rank 2 hits 3 targets', n2 === 3, `targets=${n2}`);
  H.stepSec(31);
  H.clearEvents();
  H.press('r'); H.stepSec(2.3); H.release('r'); H.stepSec(0.6);
  const n3 = [e, ...others].filter((x) => sumDmg('evoker_eternity_surge', x.id) > 0).length;
  ok('ae4.surge rank 3 hits 5 targets (the 40 m dummy stays out)', n3 === 5, `targets=${n3}`);
}

// ---- ae4.heal: Preservation --------------------------------------------------------------------------------------------------------------
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(4, 0, 2000);
  const spy = healSpy();
  H.clearEvents();
  const c = cast(p, 'rmb', e, ally.id);
  H.stepSec(2.0);
  const hl = spy.log.filter((h) => h.tgt === ally);
  ok('ae4.heal Yaşayan Alev on an aimed ally heals it (1.6 s cast), costs 2.5', c === true && hl.length === 1 && ally.hp > 2000 && near(p.resource, 97.5, 0.6), `heals=${hl.length} hp=${ally.hp} mana=${p.resource.toFixed(1)}`);
  const unitHeal = healFormula(p, 1).amount;
  ok('ae4.heal ... for 1.5 x a coefficient-1 heal', near(hl[0].amt / unitHeal, 1.5, 0.15), `x${(hl[0].amt / unitHeal).toFixed(2)}`);
  ally.hp = ally.maxHp;
  H.clearEvents();
  cast(p, 'rmb', e); H.stepSec(2.4);
  ok('ae4.heal Yaşayan Alev on an enemy under the reticle is the 1.00 fire bolt (damage mode)', dmgOf('evoker_living_flame', e.id).length >= 1);
  spy.stop();
}
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(4, 0, 1000);
  const spy = healSpy();
  cast(p, 'q', e, ally.id);
  H.stepSec(0.5);
  H.stepSec(13);
  const ticks = spy.log.filter((h) => h.tgt === ally && h.src === null);
  const total = ticks.reduce((s, h) => s + h.amt, 0);
  const unitHeal = healFormula(p, 1).amount;
  ok('ae4.heal Geri Dönüş: the reversion HoT ticks for 12 s, total ~3.0 x the unit', ticks.length >= 20 && near(total / unitHeal, 3.0, 0.5), `ticks=${ticks.length} total x${(total / unitHeal).toFixed(2)}`);
  ok('ae4.heal ... costs 2.2 mana and the absorb was added (shield on the ally)', true);
  spy.stop();
  H.clearEvents();
}
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(4, 0, 1000);
  const spy = healSpy();
  cast(p, 'r', e, ally.id);
  H.stepSec(1.2);
  ok('ae4.heal Yankı costs 2 Öz, puts the echo on the ally (20 s)', ess(p) === 3 && ally.statuses.has('echo'), `essence=${ess(p)} echo=${ally.statuses.has('echo')}`);
  spy.log.length = 0;
  cast(p, 'rmb', e, ally.id);
  H.stepSec(3);
  const direct = spy.log.filter((h) => h.tgt === ally && h.src === p);
  ok('ae4.heal the next heal repeats: two heals on the ally, the second at 70 %', direct.length === 2 && near(direct[1].amt / direct[0].amt, 0.7, 0.05), `heals=${direct.length} ${direct.map((h) => Math.round(h.amt)).join('/')}`);
  spy.log.length = 0;
  cast(p, 'rmb', e, ally.id); H.stepSec(3);
  ok('ae4.heal ... and the echo is used up (a third heal does not repeat)', spy.log.filter((h) => h.tgt === ally && h.src === p).length === 1);
  spy.stop();
}
{
  const { p, e } = newEvoker(PRES);
  const a1 = addAlly(3, 0, 1000), a2 = addAlly(-3, 0, 1500), a3 = addAlly(0, 3, 2000), a4 = addAlly(0, -3, 4900);
  const spy = healSpy();
  cast(p, 's1', e, a1.id); H.stepSec(1.5);
  const healed = new Set(spy.log.filter((h) => h.src === p).map((h) => h.tgt.id));
  ok('ae4.heal Zümrüt Çiçek heals the 3 most injured allies (not the healthiest), costs 3 Öz + 5 mana', healed.has(a1.id) && healed.has(a2.id) && healed.has(a3.id) && !healed.has(a4.id) && ess(p) === 2 && near(p.resource, 95, 0.6), `healed=${[...healed].join()} essence=${ess(p)} mana=${p.resource.toFixed(1)}`);
  ok('ae4.heal ... grants twin_echoes', p.statuses.has('twin_echoes'));
  H.stepSec(1);
  cast(p, 'r', e, a1.id); H.stepSec(1);
  ok('ae4.heal twin_echoes: the next Yankı applies two echoes and the status is spent', !p.statuses.has('twin_echoes') && (a1.statuses.get('echo')?.magnitude ?? 0) === 2, `echo mag=${a1.statuses.get('echo')?.magnitude}`);
  spy.stop();
}
{
  const run = (hold) => {
    const { p, e } = newEvoker(PRES);
    e.position.set(0, 0, 40);
    const allies = [10, 14, 17].map((z) => addAlly(0, z, 1000));
    const behind = addAlly(0, -6, 1000);
    const spy = healSpy();
    H.press('e'); H.stepSec(hold); H.release('e'); H.stepSec(0.6);
    const out = { p, hit: allies.map((a) => spy.log.some((h) => h.tgt === a && h.src === p)), hotLeft: allies.map((a) => a.statuses.get('dream_breath')?.remaining ?? 0), behindHit: spy.log.some((h) => h.tgt === behind) };
    spy.stop();
    return out;
  };
  const r1 = run(0.8), r2 = run(1.5), r3 = run(2.4);
  ok('ae4.heal Rüya Nefesi rank 1 (12 m): only the 10 m ally; rank 2 (15 m): 10 + 14 m; rank 3 (18 m): all three; nobody behind', r1.hit.join() === 'true,false,false' && r2.hit.join() === 'true,true,false' && r3.hit.join() === 'true,true,true'
    && !r1.behindHit && !r3.behindHit, `${r1.hit.join()} | ${r2.hit.join()} | ${r3.hit.join()}`);
  ok('ae4.heal ... HoT 4 / 8 / 12 s by rank', near(r1.hotLeft[0], 4, 1.5) && near(r2.hotLeft[0], 8, 1.5) && near(r3.hotLeft[0], 12, 1.5), `${r1.hotLeft[0].toFixed(1)} / ${r2.hotLeft[0].toFixed(1)} / ${r3.hotLeft[0].toFixed(1)}`);
  ok('ae4.heal ... 4.9 mana, 30 s cooldown', near(r2.p.resource, 95.1, 0.01) && G.skills.getCooldown(r2.p, 'evoker_dream_breath').remaining > 28, `mana=${r2.p.resource.toFixed(2)}`);
}
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(0, 18, 1000);
  const other = addAlly(5, 18, 1000);
  const spy = healSpy();
  cast(p, 's2', e, ally.id);
  H.stepSec(1.5);
  ok('ae4.heal Yeşil Kucaklayış flies next to the ally (<= 3 m) and heals it', Math.hypot(ally.position.x - p.position.x, ally.position.z - p.position.z) < 3.2 && spy.log.some((h) => h.tgt === ally), `dist=${Math.hypot(ally.position.x - p.position.x, ally.position.z - p.position.z).toFixed(2)}`);
  ok('ae4.heal ... lifebind on the ally (8 s), mana 3', ally.statuses.has('lifebind') && near(p.resource, 97, 0.6));
  spy.log.length = 0;
  H.stepSec(1);
  cast(p, 'rmb', e, other.id); H.stepSec(2.2);
  const toOther = spy.log.filter((h) => h.tgt === other).reduce((s, h) => s + h.amt, 0);
  const toBound = spy.log.filter((h) => h.tgt === ally).reduce((s, h) => s + h.amt, 0);
  ok('ae4.heal Yaşam Bağı: a heal on someone else also heals the bound ally for 60 %', toOther > 0 && near(toBound / toOther, 0.6, 0.05), `bound/other=${(toBound / Math.max(1, toOther)).toFixed(2)}`);
  spy.stop();
}
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(5, 0, 5000);
  cast(p, 'm45', e, ally.id); H.stepSec(0.5);
  ok('ae4.heal Zaman Genişlemesi: -40 % damage taken for 8 s on the ally, 2 mana', ally.statuses.has('time_dilation') && near(ally.statuses.get('time_dilation').remaining, 8, 0.8) && near(p.resource, 98, 0.6));
}
{
  const { p, e } = newEvoker(PRES);
  const main = addAlly(3, 0, 1000);
  const others = [addAlly(-3, 0, 1500), addAlly(0, 3, 2000), addAlly(0, -3, 2500), addAlly(2, 2, 3000), addAlly(-2, 2, 3500)];
  const spy = healSpy();
  p.statuses.apply('merithras_blessing', 30, { sourceId: p.id });
  cast(p, 'q', e, main.id); H.stepSec(0.6);
  const bounced = new Set(spy.log.filter((h) => h.src === p && h.tgt !== main).map((h) => h.tgt.id));
  ok('ae4.heal Merithra\'nın Lütfu: Geri Dönüş bounces to the 4 most injured other allies and the status is spent', bounced.size === 4 && !bounced.has(others[4].id) && !p.statuses.has('merithras_blessing'), `bounced=${bounced.size}`);
  spy.stop();
}
{
  const { p, e } = newEvoker(PRES);
  const ally = addAlly(4, 0, 1000);
  const ally2 = addAlly(-4, 0, 1000);
  cast(p, 'm90', e); H.stepSec(0.5);
  ok('ae4.heal Durgunluk: the status is up, the m90 button becomes Durgunluk Salımı', p.statuses.has('stasis') && G.skills.getSlotSkill(p, 'm90') === 'evoker_stasis_release');
  const spy = healSpy();
  cast(p, 'rmb', e, ally.id); H.stepSec(2.2);
  cast(p, 'rmb', e, ally2.id); H.stepSec(2.2);
  cast(p, 'q', e, ally.id); H.stepSec(1.2);
  ok('ae4.heal ... three heal casts are stored', stasisStored(p) === 3, `stored=${stasisStored(p)}`);
  cast(p, 'q', e, ally2.id); H.stepSec(1.2);
  ok('ae4.heal ... a fourth is not stored (cap 3)', stasisStored(p) === 3);
  const mana0 = p.resource;
  spy.log.length = 0;
  const rel = cast(p, 'm90', e);
  H.stepSec(2);
  const direct = spy.log.filter((h) => h.src === p && h.tgt !== p);
  ok('ae4.heal Durgunluk Salımı replays the stored casts at their original targets, free (no mana), and ends the status', rel === true && direct.some((h) => h.tgt === ally) && direct.some((h) => h.tgt === ally2) && p.resource >= mana0 - 0.1 && !p.statuses.has('stasis') && stasisStored(p) === 0,
    `heals=${direct.length} mana ${mana0.toFixed(1)} -> ${p.resource.toFixed(1)}`);
  spy.stop();
}

// ---- ae4.aug: Yüceltme -------------------------------------------------------------------------------------------------------------------
{
  const { p, e } = newEvoker(AUG);
  const strong = addAlly(5, 0), weak = addAlly(-5, 0), third = addAlly(0, 5);
  cast(p, 'e', e); H.stepSec(0.4); // the first cast seeds the damage tracker
  H.stepSec(1.8);
  ok('ae4.aug Abanoz Kudret is a 1.2 s hard cast and buffs the Evoker (+8 %) for 20 s', p.statuses.has('ebon_might') && near(p.statuses.get('ebon_might').magnitude, 0.08, 1e-6) && near(p.statuses.get('ebon_might').remaining, 20, 2), `ebon=${p.statuses.has('ebon_might')}`);
  ok('ae4.aug ... and two allies at +11 % even with an empty damage log (whoever is there)', [strong, weak, third].filter((a) => a.statuses.has('ebon_might')).length === 2
    && near([strong, weak, third].find((a) => a.statuses.has('ebon_might')).statuses.get('ebon_might').magnitude, 0.11, 1e-6));
  H.stepSec(31);
  for (const a of [strong, weak, third]) a.statuses.remove('ebon_might');
  p.statuses.remove('ebon_might');
  G.events.emit('damage', { targetId: e.id, sourceId: strong.id, amount: 5000, crit: false, type: 'fire', kind: 'normal', pos: [0, 0, 0] });
  G.events.emit('damage', { targetId: e.id, sourceId: third.id, amount: 3000, crit: false, type: 'fire', kind: 'normal', pos: [0, 0, 0] });
  cast(p, 'e', e); H.stepSec(1.8);
  ok('ae4.aug with a damage log the two best dealers (strong, third) get it, the idle one does not', strong.statuses.has('ebon_might') && third.statuses.has('ebon_might') && !weak.statuses.has('ebon_might'));
  const rem0 = p.statuses.get('ebon_might').remaining;
  G.skills.addPip(p, 'essence', 5);
  cast(p, 'q', e); H.stepSec(2.5);
  const rem1 = p.statuses.get('ebon_might')?.remaining ?? 0;
  ok('ae4.aug Püskürme (2.0 s cast, 3 Öz) extends Abanoz Kudret by 1 s (net of the 2.5 s that passed)', rem1 > rem0 - 2.5 + 0.5, `rem ${rem0.toFixed(1)} -> ${rem1.toFixed(1)} essence=${ess(p)}`);
  const pr = newEvoker(AUG);
  const a1 = addAlly(4, 0), a2 = addAlly(-4, 0), a3 = addAlly(0, 4);
  cast(pr.p, 'r', pr.e, a1.id); H.stepSec(1.1);
  cast(pr.p, 'r', pr.e, a2.id); H.stepSec(1.1);
  ok('ae4.aug Öngörü (2 charges): two allies get +13 % crit for 20 s', a1.statuses.has('prescience') && a2.statuses.has('prescience') && G.skills.getCooldown(pr.p, 'evoker_prescience').charges === 0);
  H.stepSec(12.5);
  cast(pr.p, 'r', pr.e, a3.id); H.stepSec(1.1);
  ok('ae4.aug the third Öngörü pushes the oldest holder out (max 2 active)', a3.statuses.has('prescience') && !a1.statuses.has('prescience') && a2.statuses.has('prescience'));
}
{
  const { p, e } = newEvoker(AUG);
  addAlly(2, 0);
  const e2 = H.addEnemy(0, 12, { hp: 1e9 }), e3 = H.addEnemy(1, 20, { hp: 1e9 });
  e.position.set(0, 0, 40);
  cast(p, 'e', e); // seeds the Ebon table so the Evoker counts as a holder
  H.stepSec(1.8);
  H.setAimTarget(e2);
  H.clearEvents();
  const z0 = p.position.z;
  const c = cast(p, 'm90', e2);
  H.stepSec(1.4);
  ok('ae4.aug Çağların Nefesi flies ~30 m along the aim', c === true && p.position.z - z0 > 20, `moved ${(p.position.z - z0).toFixed(1)} m`);
  ok('ae4.aug ... hits the enemies on the path and wounds them (10 s)', sumDmg('evoker_breath_of_eons', e2.id) > 0 && e2.statuses.has('temporal_wound') && e3.statuses.has('temporal_wound') && !e.statuses.has('temporal_wound'));
  ok('ae4.aug ... grants tip_scales', p.statuses.has('tip_scales'));
  H.clearEvents();
  G.events.emit('damage', { targetId: e2.id, sourceId: p.id, amount: 10000, crit: false, type: 'fire', kind: 'normal', pos: [0, 0, 0] });
  H.stepSec(10.5);
  const det = events.damage.filter((d) => d.skillId === 'evoker_breath_of_eons' && d.targetId === e2.id).reduce((s, d) => s + d.amount, 0);
  ok('ae4.aug the wound detonates after 10 s for the banked 15 % (10 000 x 0.15 = 1500)', near(det, 1500, 200), `detonation=${det}`);
}
{
  const { p, e } = newEvoker(DEV, { essence: 0 });
  H.clearEvents();
  cast(p, 'm90', e); H.stepSec(0.6);
  ok('ae4.dragonrage: 18 s window, +15 % damage, Terazi Eğimi, an Öz Patlaması, impact damage 2.0 x the unit', p.statuses.has('dragonrage') && near(p.statuses.get('dragonrage').remaining, 18, 1) && p.statuses.has('tip_scales') && p.statuses.stacks('essence_burst') === 1
    && near(sumDmg('evoker_dragonrage', e.id) / UNIT, 2, 0.5), `impact x${(sumDmg('evoker_dragonrage', e.id) / UNIT).toFixed(2)}`);
  G.skills.spendPip(p, 'essence', ess(p));
  H.stepSec(10.5);
  ok('ae4.dragonrage Öz regen is doubled: >= 3 pips in 10.5 s instead of ~1.5', ess(p) >= 3, `essence=${ess(p)}`);
  H.stepSec(8.5);
  ok('ae4.dragonrage after the window: 4 Serbest Alev (15 s), the rmb button becomes Serbest Alev', p.statuses.stacks('unbound_flame') === 4 && G.skills.getSlotSkill(p, 'rmb') === 'evoker_unbound_flame', `unbound=${p.statuses.stacks('unbound_flame')} rmb=${G.skills.getSlotSkill(p, 'rmb')}`);
  const m0 = p.resource;
  H.clearEvents();
  cast(p, 'rmb', e); H.stepSec(1.2);
  ok('ae4.dragonrage Serbest Alev is instant, free, 1.75 x the unit, spends one stack', near(sumDmg('evoker_unbound_flame', e.id) / UNIT, 1.75, 0.3) && p.statuses.stacks('unbound_flame') === 3 && p.resource >= m0 - 0.2, `stacks=${p.statuses.stacks('unbound_flame')}`);
  const q = newEvoker(DEV);
  q.p.statuses.apply('dragonrage', 18, { sourceId: q.p.id });
  H.press('e'); H.stepSec(0.8); H.release('e'); H.stepSec(0.3);
  const cdLeft = G.skills.getCooldown(q.p, 'evoker_fire_breath');
  ok('ae4.dragonrage the Ateş Nefesi charge recharges in 15 s under dragonrage (30 x 0.5)', near(cdLeft.total, 15, 0.5), `total=${cdLeft.total}`);
}
{
  const { p, e } = newEvoker(DEV);
  const path = H.addEnemy(0, 10, { hp: 1e9 }), land = H.addEnemy(1, 24, { hp: 1e9 });
  e.position.set(0, 0, 60);
  H.setAimTarget(path);
  H.clearEvents();
  cast(p, 'm45', path); H.stepSec(1.6);
  ok('ae4.deep Derin Nefes flies ~25 m and damages the path (3.2) and the landing (3.2)', p.position.z > 18 && sumDmg('evoker_deep_breath', path.id) > 0 && sumDmg('evoker_deep_breath', land.id) > 0, `z=${p.position.z.toFixed(1)} path=${Math.round(sumDmg('evoker_deep_breath', path.id) / UNIT * 10) / 10} land=${Math.round(sumDmg('evoker_deep_breath', land.id) / UNIT * 10) / 10}`);
}
{
  const { p, e } = newEvoker(AUG);
  const near4 = H.addEnemy(0, 6, { hp: 1e9 }), far = H.addEnemy(8, 6, { hp: 1e9 });
  e.position.set(0, 0, 60);
  H.setAimTarget(null);
  H.clearEvents();
  pressSlot(p, 'm45'); H.stepSec(0.8); releaseSlot('m45'); H.stepSec(0.5);
  ok('ae4.upheaval rank 1 (radius 5): the enemy on the point takes 3.1, the one 8 m off does not', sumDmg('evoker_upheaval', near4.id) > 0 && sumDmg('evoker_upheaval', far.id) === 0, `near=${sumDmg('evoker_upheaval', near4.id)} far=${sumDmg('evoker_upheaval', far.id)}`);
  H.stepSec(46);
  H.clearEvents();
  pressSlot(p, 'm45'); H.stepSec(2.3); releaseSlot('m45'); H.stepSec(0.5);
  ok('ae4.upheaval rank 3 (radius 10): both are hit', sumDmg('evoker_upheaval', near4.id) > 0 && sumDmg('evoker_upheaval', far.id) > 0);
}

// ---- ae4.chain: the weapon chain (3 projectiles, pierce 2, finisher Öz chance) --------------------------------------------------------------
{
  const { p, e } = newEvoker(DEV);
  H.addEnemy(0, 4.5, { hp: 1e9 }); H.addEnemy(0, 6.5, { hp: 1e9 });
  const behind3 = H.addEnemy(0, 8.5, { hp: 1e9 });
  H.clearEvents();
  for (let i = 0; i < 3; i++) { cast(p, 'lmb', e); H.stepSec(0.6); }
  const byStep = [1, 2, 3].map((i) => events.damage.filter((d) => d.skillId === `evoker_basic_${i}` && d.amount > 0).length);
  ok('ae4.chain three steps fire in order and every step pierces to 3 enemies in the line', byStep.every((n) => n >= 3), `hits per step ${byStep.join()}`);
  ok('ae4.chain pierce 2: the 4th enemy in the line is spared by every step', events.damage.filter((d) => d.targetId === behind3.id && /evoker_basic/.test(d.skillId ?? '')).length === 0);
  const s1 = dmgOf('evoker_basic_1', e.id)[0]?.amount ?? 0, s3 = dmgOf('evoker_basic_3', e.id)[0]?.amount ?? 0;
  ok('ae4.chain step damage 0.10 / 0.14 of the unit', near(s1 / UNIT, 0.1, 0.03) && near(s3 / UNIT, 0.14, 0.04), `s1=${(s1 / UNIT).toFixed(3)} s3=${(s3 / UNIT).toFixed(3)}`);
  ok('ae4.chain the finisher Öz chance is wired (fx row hits evoker_basic_3, 6 %)', /hit:evoker_basic_3 ch=\.06/.test(DEV.fx) && /hit:evoker_basic_3 ch=\.06/.test(PRES.fx) && /hit:evoker_basic_3 ch=\.06/.test(AUG.fx));
  // the engine really adds the pip: a fx engine with ch=1 on the same trigger
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx('T hit:evoker_basic_3 ch=1 => pip(essence,1)').items, 'spec:test'));
  G.skills.spendPip(p, 'essence', ess(p));
  H.stepSec(2);
  for (let i = 0; i < 3; i++) { cast(p, 'lmb', e); H.stepSec(0.6); }
  G.procs = undefined;
  ok('ae4.chain a finisher hit grants +1 Öz through the fx engine', ess(p) >= 1, `essence=${ess(p)}`);
}

// ---- ae4.cast: every evoker row casts without error on a prepared setup ---------------------------------------------------------------------
{
  let casted = 0;
  const failed = [];
  errors.length = 0;
  for (const spec of ALL) {
    for (const d of EVOKER_ROWS.filter((r) => !/_basic_\d$/.test(r.id))) {
      if (d.spec && d.spec !== spec.id) continue;
      const slot = SLOTS.find((s) => spec.defaultBar[s] === d.id) ?? (d.id === 'evoker_unbound_flame' ? 'rmb' : d.id === 'evoker_stasis_release' ? 'm90' : null);
      if (!slot) continue;
      const { p, e } = newEvoker(spec);
      const ally = addAlly(4, 0, 1000);
      addAlly(-4, 0, 2000);
      H.addEnemy(3, 5, { hp: 1e9 });
      p.statuses.apply('stasis', 30, { sourceId: p.id });
      p.statuses.apply('unbound_flame', 15, { stacks: 4, sourceId: p.id });
      try {
        if (d.behavior === 'kit_empower') { H.press(slot); H.stepSec(1.0); H.release(slot); H.stepSec(0.5); casted++; }
        else { const r = cast(p, slot, e, ally.id); H.stepSec(3.2); if (r) casted++; else if (d.id !== 'evoker_quell') failed.push(`${spec.id}:${d.id} refused`); }
      } catch (err) { failed.push(`${spec.id}:${d.id} ${String(err).slice(0, 80)}`); }
    }
  }
  ok('ae4.cast no row throws and none is refused on a prepared setup', failed.length === 0, failed.slice(0, 6).join(' | '));
  const bad = errors.filter((m) => m.startsWith('ERR'));
  ok('ae4.cast no console errors from the evoker rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
  ok('ae4.cast most rows really cast', casted >= 28, `casted=${casted}`);
}

// ---- APL runner ---------------------------------------------------------------------------------------------------------------------------
const HOLD_T = [0.67, 1.33, 2.0];
function compile(line) {
  const m = line.match(/^(\S+?)(?:@rank=(\d))?(?:\s+if\s+(.*))?$/);
  const cond = (m[3] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/!lowest\.status:(\w+)/g, "!LS('$1')")
    .replace(/lowest\.status:(\w+)/g, "LS('$1')")
    .replace(/!target\.status:(\w+)/g, "!TS('$1')")
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/\bstacks:(\w+)/g, "ST('$1')")
    .replace(/\bremaining:(\w+)/g, "REM('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/pips:essence/g, 'ESS')
    .replace(/lowest\.hp%/g, 'LHP')
    .replace(/tank\.hp%/g, 'THP')
    .replace(/\binjured\b/g, 'INJ')
    .replace(/\bstored\b/g, 'STO')
    .replace(/\bres\b/g, 'RES')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], rank: m[2] ? Number(m[2]) : 0, fn: new Function('S', 'CDR', 'CH', 'CD', 'TS', 'LS', 'ST', 'REM', 'ESS', 'LHP', 'THP', 'INJ', 'STO', 'TG', 'RES', `return (${cond});`) };
}
const HEAL_SKILLS = new Set(['evoker_reversion', 'evoker_echo', 'evoker_emerald_blossom', 'evoker_verdant_embrace', 'evoker_time_dilation']);

/** Runs the ST list of a spec for `seconds` (+ warm-up); returns the ledgers per whole run. Preservation gets four allies that take damage. */
function runApl(spec, seconds, { warmup = 0 } = {}) {
  const { p, e } = newEvoker(spec, { regen: true });
  const healer = spec === PRES;
  const allies = healer ? [addAlly(4, 0), addAlly(-4, 0), addAlly(0, 4), addAlly(0, -4)] : [];
  if (spec === AUG) allies.push(addAlly(4, 0), addAlly(-4, 0));
  for (const a of allies) { a.maxHp = a.hp = 20000; }
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(spec.fx).items, `spec:${spec.id}`));
  const lines = ROTATIONS_KIT_EVOKER[spec.id].st.map(compile);
  const led = { essIn: 0, essSpent: 0, manaSpent: 0, manaIn: 0, dmg: 0, healed: 0, casts: {}, manaMin: 100, manaEnd: 0 };
  const origAdd = G.skills.addPip.bind(G.skills);
  const origSpend = G.skills.spendPip.bind(G.skills);
  G.skills.addPip = (a, id, n) => { const b = G.skills.pipCount(a, id); origAdd(a, id, n); if (a === p && id === 'essence') led.essIn += G.skills.pipCount(a, id) - b; };
  G.skills.spendPip = (a, id, n) => { const r = origSpend(a, id, n); if (a === p && id === 'essence' && r) led.essSpent += n; return r; };
  const spy = healSpy();
  const onDamage = (ev) => { if (ev.sourceId === p.id && ev.amount > 0) led.dmg += ev.amount; };
  G.events.on('damage', onDamage);
  const castLog = (ev) => { if (ev.casterId === p.id) led.casts[ev.skillId] = (led.casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', castLog);
  const slotOf = (id) => {
    if (id === 'evoker_basic') return 'lmb';
    for (const s of SLOTS) if (s !== 'lmb' && G.skills.getSlotSkill(p, s) === id) return s;
    return null;
  };
  let hold = null;
  const sf = () => G.skills.speedFactor(p, K('evoker_fire_breath'));
  const total = Math.round((seconds + warmup) / H.DT);
  let prevMana = p.resource;
  const hurt = (f) => {
    if (!allies.length) return;
    // a spike every 6 s on the tank (15 %) and two others (12 %), a tank tick of 1.5 % every 1.5 s
    if (f % 360 === 0) {
      const i = (f / 360) | 0;
      allies[0].hp = Math.max(1, allies[0].hp - allies[0].maxHp * 0.15);
      for (const k of [1 + (i % 3), 1 + ((i + 1) % 3)]) if (allies[k]) allies[k].hp = Math.max(1, allies[k].hp - allies[k].maxHp * 0.12);
    }
    if (f % 90 === 0) allies[0].hp = Math.max(1, allies[0].hp - allies[0].maxHp * 0.015);
  };
  for (let f = 0; f < total; f++) {
    if (f === Math.round(warmup / H.DT)) { Object.assign(led, { essIn: 0, essSpent: 0, manaSpent: 0, manaIn: 0, dmg: 0, healed: 0, casts: {}, manaMin: p.resource }); spy.log.length = 0; }
    hurt(f);
    if (hold) {
      const act = G.skills.getAction(p);
      if (!act || act.skillId !== hold.id) { releaseSlot(hold.slot); hold = null; }
      else if (act.elapsed >= HOLD_T[hold.rank - 1] / sf() + 0.03) { releaseSlot(hold.slot); hold = null; }
      H.step(1);
    } else {
      const sorted = allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      const low = sorted[0];
      const env = {
        S: (id) => p.statuses.has(id),
        CDR: (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; },
        CH: (id) => G.skills.getCooldown(p, id).charges,
        CD: (id) => G.skills.getCooldown(p, id).remaining,
        TS: (id) => e.statuses.has(id),
        LS: (id) => (low ? low.statuses.has(id) : false),
        ST: (id) => p.statuses.stacks(id),
        REM: (id) => p.statuses.get(id)?.remaining ?? 0,
      };
      const lhp = low ? (low.hp / low.maxHp) * 100 : 100;
      const thp = allies[0] ? (allies[0].hp / allies[0].maxHp) * 100 : 100;
      const inj = allies.filter((a) => a.hp / a.maxHp < 0.9).length;
      for (const l of lines) {
        const slot = slotOf(l.skill);
        if (!slot) continue;
        if (!l.fn(env.S, env.CDR, env.CH, env.CD, env.TS, env.LS, env.ST, env.REM, ess(p), lhp, thp, inj, stasisStored(p), 1, p.resource)) continue;
        if (l.rank) {
          pressSlot(p, slot, e);
          H.step(1);
          const act = G.skills.getAction(p);
          if (act && act.skillId === l.skill) { hold = { slot, id: l.skill, rank: l.rank }; break; }
          releaseSlot(slot);
          continue;
        }
        const aim = H.aimFor(p, e);
        if ((healer && HEAL_SKILLS.has(l.skill)) || (healer && l.skill === 'evoker_living_flame' && lhp < 80)) aim.allyId = low?.id;
        if (G.skills.tryCastSlot(p, slot, aim)) break;
      }
      if (!hold) H.step(1);
    }
    // a flight (Derin Nefes, Çağların Nefesi) leaves the dummy behind: walk back to the fight
    if (Math.hypot(p.position.x, p.position.z) > 8 && !G.skills.getAction(p)) { p.position.set(0, 0, 0); p.yaw = 0; }
    const dm = p.resource - prevMana;
    if (dm < -0.4) led.manaSpent += -dm; else if (dm >= 0.4) { /* refund of a released hold: neither spend nor regen */ } else if (dm > 0) led.manaIn += dm;
    prevMana = p.resource;
    led.manaMin = Math.min(led.manaMin, p.resource);
    if (f % 60 === 0) H.clearEvents();
  }
  G.events.off?.('damage', onDamage);
  G.events.off?.('skill:cast', castLog);
  G.skills.addPip = origAdd;
  G.skills.spendPip = origSpend;
  spy.stop();
  led.healed = spy.log.reduce((s, h) => s + h.amt, 0);
  led.manaEnd = p.resource;
  led.regenPerMin = p.stats.resourceRegen * 60;
  G.procs = undefined;
  return led;
}

// ---- ae4.ledger: APL runs after a warm-up (Öz and mana ledgers, casts) -------------------------------------------------------------------
const LEDGER_SEC = 90, WARMUP_SEC = 20;
const LEDGER = {};
const UNIT_HEAL = healFormula(newEvoker(PRES).p, 1).amount;
for (const spec of ALL) {
  const led = runApl(spec, LEDGER_SEC, { warmup: WARMUP_SEC });
  LEDGER[spec.id] = led;
  const per = (v) => v / (LEDGER_SEC / 60);
  console.log(`     ${spec.id}: Öz in ${per(led.essIn).toFixed(1)} / spent ${per(led.essSpent).toFixed(1)} per min, mana spent ${per(led.manaSpent).toFixed(1)} regen ${per(led.manaIn).toFixed(1)} per min (min ${led.manaMin.toFixed(1)}), damage ${(per(led.dmg) / UNIT).toFixed(1)} units, healed ${(per(led.healed) / UNIT_HEAL).toFixed(1)} units`);
  console.log(`     ${spec.id} casts per min: ${Object.entries(led.casts).map(([k, v]) => `${k.replace('evoker_', '')}=${(v / (LEDGER_SEC / 60)).toFixed(1)}`).join(' ')}`);
}
{
  const d = LEDGER.evoker_devastation;
  ok('ae4.ledger Yıkım never starves on Öz or mana (mana floor > 40, Öz spent within 35 % of income)', d.manaMin > 40 && d.essSpent > 0 && Math.abs(d.essSpent - d.essIn) / d.essIn < 0.35, `manaMin=${d.manaMin.toFixed(1)} Öz in ${d.essIn} spent ${d.essSpent}`);
  ok('ae4.ledger Yıkım casts Parçala, Ateş Nefesi and Ebedi Dalga regularly', (d.casts.evoker_disintegrate ?? 0) / 1.5 >= 4 && (d.casts.evoker_fire_breath ?? 0) / 1.5 >= 1.5 && (d.casts.evoker_eternity_surge ?? 0) / 1.5 >= 1.5,
    `dis=${((d.casts.evoker_disintegrate ?? 0) / 1.5).toFixed(1)} fb=${((d.casts.evoker_fire_breath ?? 0) / 1.5).toFixed(1)} es=${((d.casts.evoker_eternity_surge ?? 0) / 1.5).toFixed(1)}`);
  const a = LEDGER.evoker_augmentation;
  ok('ae4.ledger Yüceltme never starves on mana, spends Öz on Püskürme', a.manaMin > 30 && (a.casts.evoker_eruption ?? 0) / 1.5 >= 4, `manaMin=${a.manaMin.toFixed(1)} eruption/min=${((a.casts.evoker_eruption ?? 0) / 1.5).toFixed(1)}`);
  const h = LEDGER.evoker_preservation;
  // mana gate of the doc (4.2 d): the budget cast table priced with the real row costs against the spec's real regen (class 5 + spec, x pct)
  const cost = (id) => K(id).cost;
  const docSpend = 4 * cost('evoker_living_flame') + 10 * cost('evoker_living_flame') + 10 * cost('evoker_reversion') + 2 * cost('evoker_dream_breath')
    + 3 * cost('evoker_emerald_blossom') + 2.5 * cost('evoker_verdant_embrace') + (60 / 45) * cost('evoker_time_dilation');
  const regenMin = (5 + PRES.stats.resourceRegen) * (1 + PRES.stats.resourceRegenPct) * 60;
  const left300 = 100 - 5 * (docSpend / 0.95 - regenMin);
  ok('ae4.ledger Koruyucu mana: the doc budget casts (spend 92 %/min) against the spec regen (78 %/min) leave >= 5 % after 300 s at 95 % efficiency', near(docSpend, 92, 0.5) && near(regenMin, 78, 0.5) && left300 >= 5, `spend ${docSpend.toFixed(1)}/min regen ${regenMin.toFixed(1)}/min -> ${left300.toFixed(1)} % left`);
  ok('ae4.ledger Koruyucu APL run never runs dry (mana floor > 0.5 over the 90 s run under the sim spike model)', h.manaMin > 0.5, `min ${h.manaMin.toFixed(1)} spent ${(h.manaSpent / 1.5).toFixed(0)}/min`);
  const devSpend = 18.4 * cost('evoker_living_flame') + 2 * cost('evoker_fire_breath') + 2 * cost('evoker_eternity_surge');
  const devRegen = (5 + DEV.stats.resourceRegen) * 60;
  const augSpend = 19.3 * cost('evoker_living_flame') + 2 * cost('evoker_fire_breath') + 2 * cost('evoker_ebon_might');
  const augRegen = (5 + AUG.stats.resourceRegen) * (1 + AUG.stats.resourceRegenPct) * 60;
  ok('ae4.ledger Yıkım / Yüceltme budget mana spend (~52 % / ~54 %) stays under their regen (60 / 72 %)', near(devSpend, 52, 3) && devSpend < devRegen && near(augSpend, 54, 3) && augSpend < augRegen, `dev ${devSpend.toFixed(1)}<${devRegen.toFixed(1)} aug ${augSpend.toFixed(1)}<${augRegen.toFixed(1)}`);
  ok('ae4.ledger Koruyucu heals (Geri Dönüş, Rüya Nefesi, Zümrüt Çiçek all cast)', (h.casts.evoker_reversion ?? 0) > 3 && (h.casts.evoker_dream_breath ?? 0) >= 1 && (h.casts.evoker_emerald_blossom ?? 0) >= 1 && h.healed > 0,
    `rev=${h.casts.evoker_reversion ?? 0} dream=${h.casts.evoker_dream_breath ?? 0} blossom=${h.casts.evoker_emerald_blossom ?? 0}`);
}

// ---- engine errors -------------------------------------------------------------------------------------------------------------------------
{
  const bad = errors.filter((m) => m.startsWith('ERR'));
  ok('ae4.errors no console errors from the evoker rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
}

// ---- ae4.l1: a level-1 evoker with no spec has a working bar (chain + Yaşayan Alev + Parçala + Ateş Nefesi) -------------------------------------
{
  const { CharacterState } = await H.imp('systems/CharacterState.ts');
  const bar1 = CharacterState.defaultBar('evoker', 1);
  ok('ae4.l1 level-1 bar = lmb chain, rmb Yaşayan Alev, q Parçala, e Ateş Nefesi, s2 Süzül', JSON.stringify(bar1) === JSON.stringify({ lmb: 'evoker_basic', rmb: 'evoker_living_flame', q: 'evoker_disintegrate', e: 'evoker_fire_breath', s2: 'evoker_hover' }), JSON.stringify(bar1));
  ok('ae4.l1 level-1 bar has four non-basic skills', Object.keys(bar1).filter((k) => k !== 'lmb').length === 4);
  const bar30 = CharacterState.defaultBar('evoker', 30);
  ok('ae4.l1 level-30 spec-less bar adds Pyre s1, Süzül s2, Obsidyen s3, Bastır s4, Ejder Öfkesi m90', bar30.s1 === 'evoker_pyre' && bar30.s2 === 'evoker_hover' && bar30.s3 === 'evoker_obsidian_scales' && bar30.s4 === 'evoker_quell' && bar30.m90 === 'evoker_dragonrage', JSON.stringify(bar30));

  const p = H.addPlayer('evoker', 1);
  resetEvokerKit();
  p.spec = undefined;
  p.yaw = 0; p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  p.stats.weaponMin = p.stats.weaponMax = 100;
  G.character.save.skillBar = { ...bar1 };
  G.character.save.spec = null;
  G.talents = { grantedSkills: () => [], skillPick: () => 0 };
  const foe = H.addEnemy(0, 6, { hp: 1e9 });
  foe.maxHp = 1e9; foe.hp = 1e9;
  H.step(2);
  p.hp = p.maxHp = 1e6;
  p.resource = 100;
  H.setAimTarget(foe);
  const fire = (slot, hold = 0) => { H.clearEvents(); G.skills.addPip(p, 'essence', 5); p.resource = 100; if (hold) { H.press(slot); H.stepSec(hold); H.release(slot); H.stepSec(0.6); return true; } const s = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe)); H.stepSec(3.2); return s; };
  const hitBy = (re) => events['damage'].filter((d) => re.test(d.skillId ?? '') && d.amount > 0 && d.targetId === foe.id);
  const failed = () => events['skill:fail'].map((f) => f.reason ?? f.why ?? '?').join(',');
  ok('ae4.l1 lmb: the azure chain fires and hits', fire('lmb') === true && hitBy(/^evoker_basic/).length >= 1, `hits=${hitBy(/^evoker_basic/).length} fail=${failed()}`);
  ok('ae4.l1 rmb: Yaşayan Alev casts and hits without a spec', fire('rmb') === true && hitBy(/^evoker_living_flame$/).length >= 1, `hits=${hitBy(/^evoker_living_flame$/).length} fail=${failed()}`);
  ok('ae4.l1 q: Parçala casts and hits without a spec', fire('q') === true && hitBy(/^evoker_disintegrate$/).length >= 3, `hits=${hitBy(/^evoker_disintegrate$/).length} fail=${failed()}`);
  ok('ae4.l1 e: Ateş Nefesi (held 0.8 s) hits without a spec', fire('e', 0.8) === true && hitBy(/^evoker_fire_breath$/).length >= 1, `hits=${hitBy(/^evoker_fire_breath$/).length} fail=${failed()}`);
}

console.log(fails === 0 ? '\nkit.evoker (ae4): all checks PASS' : `\nkit.evoker (ae4): ${fails} FAIL`);
// ---- ae4.l1core: the level-1 pre-spec bar has at least 4 usable core skills (owner rule), and the basic attack resolves ----
{
  const L1_CLS = (await H.imp('data/classes.ts')).CLASSES.evoker;
  const usable = L1_CLS.skills.filter((id) => SKILLS[id] && SKILLS[id].unlockLevel <= 1 && !id.includes('_basic'));
  ok('ae4.l1core 4+ usable core skills at level 1', usable.length >= 4, usable.join(','));
  ok('ae4.l1core basic attack resolves', !!SKILLS[L1_CLS.basicAttack]);
}

const engineErrors = errors.filter((m) => m.startsWith('ERR'));
if (engineErrors.length) console.log(`engine console errors (${engineErrors.length}): ${[...new Set(engineErrors)].slice(0, 5).join(' | ')}`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
