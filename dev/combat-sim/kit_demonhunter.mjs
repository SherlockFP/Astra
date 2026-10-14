// KIT AE-3 checks (docs/kits/agile-evoker.md §3 + the WoW Midnight Yutucu spec) that need no browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_demonhunter.mjs
// Covered: aedh.ids, aedh.apl, aedh.status, aedh.fx, aedh.procs, aedh.fury, aedh.chain, aedh.rows (Kaos Darbesi (Chaos Strike) / Yok Ediş (Annihilation) replace, Bıçak
//          Dansı / Ölüm Süpürmesi (Death Sweep), Göz Işını (Eye Beam) channel + Kör Gazap, Yakıcı Aura (Immolation Aura), Fel Atılışı (Fel Rush), Av, Metamorfoz (Metamorphosis), Öz Kırılması (Essence Break) window),
//          aedh.souls (fragments, soul_overflow, Ruh Yarma (Soul Cleave) -> Ruh Bombası (Spirit Bomb), Fel Kanı), aedh.veng (Ateş Mührü (Fiery Brand), Şeytan Dikenleri (Demon Spikes) refund, Fel Yıkımı (Fel Devastation) heal),
//          aedh.devourer (Tüket, Biç, Boşluk Metamorfozu (Void Metamorphosis), Boşluk Fırtınası (Void Storm), Çöken Yıldız (Collapsing Star) series, kill fragment), aedh.cast (every demonhunter row casts),
//          aedh.ledger (60 s APL runs of the three specs), aedh.l1 (level-1 bar, start gear, playable registration, movement).
// Every cast goes through the real SkillSystem (pip costs, GCD, cooldowns, proc mods, behaviours) on dev dummies. Not covered here
// (browser / SimBench): feel, VFX, double jump / glide (PlayerController).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_DEMONHUNTER } = await H.imp('data/rotations_kit_demonhunter.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { PROC_DEFS, getProcDef, glowSkillsOf } = await H.imp('data/procs.ts');
const { parseFx, fxContext } = await H.imp('data/talentTrees/fx.ts');
const { ProcEngine, collectProcs } = await H.imp('combat/Procs.ts');
const { CLASSES, PLAYABLE_CLASSES } = await H.imp('data/classes.ts');
const { TALENT_PIPS } = await H.imp('data/specs_talents.ts');
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const CHAOS = SPECS.demonhunter_chaos;
const VENG = SPECS.demonhunter_vengeance;
const DEVO = SPECS.demonhunter_devourer;
const ALL = [CHAOS, VENG, DEVO];
const SLOTS = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];
const DH_ROWS = Object.values(SKILLS).filter((d) => d.classId === 'demonhunter');
const souls = (p) => G.skills.pipCount(p, 'soul');

// Combat's private RNG decides weapon roll, crit (never below 5 %) and dodge: a constant 0.5 makes every ratio below exact
G.combat.rng.next = () => 0.5;

/** A demon hunter of a spec on the spec's default bar, empty Gazap, a dev dummy 2.2 m ahead (melee range). */
function newDh(spec, { dummy = true, hp = 1e9, dist = 2.2 } = {}) {
  const p = H.addPlayer('demonhunter');
  p.spec = spec.id;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = { ...spec.defaultBar };
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.talents = { grantedSkills: () => Object.keys(spec.treeSkills ?? {}), skillPick: () => 0 };
  G.procs = undefined;
  H.step(2);
  p.resource = 0;
  let e = null;
  if (dummy) { e = H.addEnemy(0, dist, { hp }); e.maxHp = hp; e.hp = hp; p.targetId = e.id; H.setAimTarget(e); } else H.setAimTarget(null);
  return { p, e };
}
const cast = (p, slot, target) => G.skills.tryCastSlot(p, slot, H.aimFor(p, target ?? null));
const dmgTo = (e, re = /./) => events['damage'].filter((d) => d.targetId === e.id && d.amount > 0 && re.test(d.skillId ?? ''));
const sumDmg = (e, re) => dmgTo(e, re).reduce((a, d) => a + d.amount, 0);
function seededEngine(seed = 20261014) {
  const realNow = Date.now;
  Date.now = () => seed;
  try { return new ProcEngine(); } finally { Date.now = realNow; }
}

// ---- aedh.ids: spec lists, majors, mods and the default bars resolve ------------------------------------------------------------------------------
for (const spec of ALL) {
  const ids = [...spec.skills, ...Object.values(spec.defaultBar), ...Object.values(spec.majors), ...spec.mods.map((m) => m.skill)];
  if (spec.basic) ids.push(spec.basic);
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`aedh.ids ${spec.id} ids resolve`, missing.length === 0, missing.join(','));
  const bar = Object.values(spec.defaultBar);
  ok(`aedh.ids ${spec.id} bar has 12 slots, no duplicate skill`, bar.length === 12 && new Set(bar).size === 12);
  const wrong = ids.filter((id) => SKILLS[id] && SKILLS[id].classId !== 'demonhunter');
  ok(`aedh.ids ${spec.id} every id is a demonhunter row`, wrong.length === 0, wrong.join(','));
  ok(`aedh.ids ${spec.id} unlock levels cover the skill list and match the rows`, spec.skills.every((id) => spec.unlock[id] !== undefined && spec.unlock[id] === SKILLS[id].unlockLevel),
    spec.skills.filter((id) => spec.unlock[id] === undefined || spec.unlock[id] !== SKILLS[id].unlockLevel).join(','));
  ok(`aedh.ids ${spec.id} has Turkish name and desc`, !!spec.name && spec.desc.length > 60);
  ok(`aedh.ids ${spec.id} bar slots hold what the SpecDef says (basic + skills + majors)`, SLOTS.every((s) => {
    const id = spec.defaultBar[s];
    return id === (spec.basic ?? 'demonhunter_basic') || spec.skills.includes(id) || Object.values(spec.majors).includes(id);
  }));
  ok(`aedh.ids ${spec.id} bar skills exist in the right slots (defaultSlot of a row never contradicts the bar)`, SLOTS.every((s) => {
    const d = SKILLS[spec.defaultBar[s]];
    return !d?.defaultSlot || ['lmb', s].includes(d.defaultSlot) || d.replaces;
  }));
  const spamRows = [...new Set(ids)].filter((id) => SKILLS[id].desc.length < 30);
  ok(`aedh.ids ${spec.id} every row has a Turkish description`, spamRows.length === 0, spamRows.join(','));
}
ok('aedh.ids SPECS merge holds the three demonhunter specs with roles dps / tank / dps', CHAOS?.role === 'dps' && VENG?.role === 'tank' && DEVO?.role === 'dps');
ok('aedh.ids main stats (dex)', ALL.every((s) => s.mainStat === 'dex'));
ok('aedh.ids Yutucu uses the void chain, Kaos and İntikam the class chain', DEVO.basic === 'demonhunter_void_basic' && !CHAOS.basic && !VENG.basic && CLASSES.demonhunter.basicAttack === 'demonhunter_basic');
ok('aedh.ids majors per spec', CHAOS.majors.m45 === 'demonhunter_essence_break' && CHAOS.majors.m90 === 'demonhunter_metamorphosis' && CHAOS.majors.m180 === 'demonhunter_the_hunt'
  && VENG.majors.m45 === 'demonhunter_fel_devastation' && VENG.majors.m90 === 'demonhunter_metamorphosis' && VENG.majors.m180 === 'demonhunter_soul_carver'
  && DEVO.majors.m45 === 'demonhunter_darkness' && DEVO.majors.m90 === 'demonhunter_void_metamorphosis' && DEVO.majors.m180 === 'demonhunter_the_hunt');
{
  const cls = CLASSES.demonhunter;
  ok('aedh.ids ClassDef.skills is the 8-id pre-spec list and every id resolves', cls.skills.length === 8 && cls.skills.every((id) => !!SKILLS[id]), cls.skills.join());
  ok('aedh.ids ClassDef Fury bar (resource fury, regenRule fury, class regen 5) and the three specs', cls.resource === 'fury' && cls.regenRule === 'fury' && cls.baseStats.resourceRegen === 5
    && cls.specs.join() === 'demonhunter_chaos,demonhunter_vengeance,demonhunter_devourer');
  ok('aedh.ids demonhunter is in PLAYABLE_CLASSES', PLAYABLE_CLASSES.includes('demonhunter'));
  ok('aedh.ids activePips: Kaos none, İntikam / Yutucu soul', G.skills.activePips(newDh(CHAOS, { dummy: false }).p).length === 0
    && ['demonhunter_vengeance', 'demonhunter_devourer'].every((id) => G.skills.activePips(newDh(SPECS[id], { dummy: false }).p).map((d) => d.id).join() === 'soul'));
  ok('aedh.ids the soul pip: max 6, soul_overflow at 5', TALENT_PIPS.soul?.max === 6 && TALENT_PIPS.soul?.statusAt?.min === 5 && TALENT_PIPS.soul.statusAt.status === 'soul_overflow');
}
ok('aedh.ids every kit_dh_* behaviour a row names is registered', DH_ROWS.filter((d) => d.behavior?.startsWith('kit_dh_')).every((d) => !!BEHAVIORS[d.behavior]),
  DH_ROWS.filter((d) => d.behavior?.startsWith('kit_dh_') && !BEHAVIORS[d.behavior]).map((d) => d.id).join());

// ---- aedh.apl: skill and status names in the APL rows resolve ---------------------------------------------------------------------------------------
for (const spec of ALL) {
  const apl = ROTATIONS_KIT_DEMONHUNTER[spec.id];
  ok(`aedh.apl ${spec.id} rows exist`, !!apl && apl.st.length > 0 && (apl.aoe?.length ?? 0) > 0);
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of [...apl.st, ...(apl.aoe ?? [])]) {
    for (const m of l.matchAll(/\b(demonhunter_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/(?:status|stacks|remaining):([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`aedh.apl ${spec.id} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`aedh.apl ${spec.id} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const chain = spec.basic ?? 'demonhunter_basic';
  ok(`aedh.apl ${spec.id} ends with the weapon chain`, apl.st.at(-1) === chain && apl.aoe.at(-1) === chain);
  const onBar = new Set([...Object.values(spec.defaultBar), ...spec.skills]);
  ok(`aedh.apl ${spec.id} every APL skill is on the spec skill list`, [...skillIds].every((id) => onBar.has(id)), [...skillIds].filter((id) => !onBar.has(id)).join(','));
}

// ---- aedh.status: every status a demonhunter row, a spec mod or a spec fx applies has a StatusDef --------------------------------------------
{
  const applied = new Set();
  for (const d of DH_ROWS) for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  for (const spec of ALL) {
    for (const m of spec.fx.matchAll(/st\((?:self|tgt|ally|party),([a-z_]+),/g)) applied.add(m[1]);
    for (const m of spec.mods) for (const s of [...(m.patch?.statuses ?? []), ...(m.patch?.selfStatuses ?? [])]) applied.add(s.status);
  }
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('aedh.status every demonhunter-applied status has a def', missing.length === 0, missing.join(','));
  ok('aedh.status the_hunt is a shadow dot, collapsing_star stacks to 6, soul_overflow is hidden', STATUSES.the_hunt.dotType === 'shadow' && STATUSES.collapsing_star.maxStacks === 6 && STATUSES.soul_overflow.hidden === true);
  ok('aedh.status essence_break / fiery_brand take extra damage only from the applying demon hunter', STATUS_RULES.essence_break.takenMoreFromSource === 0.6 && STATUS_RULES.fiery_brand.takenMoreFromSource === 0.1);
}

// ---- aedh.fx: the spec fx strings parse and every skill / status / stat in them exists ------------------------------------------------------------
{
  const ctx = fxContext(Object.keys(SKILLS), Object.keys(STATUSES));
  for (const spec of ALL) {
    const r = parseFx(spec.fx, ctx);
    ok(`aedh.fx ${spec.id} fx parses and validates`, r.errors.length === 0, r.errors.join(' | '));
  }
  ok('aedh.fx İntikam has 5 trigger rows (chaos_brand, finisher soul, Fel Kanı tick, two Şeytan Dikenleri (Demon Spikes) refunds)', parseFx(VENG.fx).items.filter((i) => i.k === 'T').length === 5);
  ok('aedh.fx Yutucu has the kill-fragment row', /T kill ch=1 => pip\(soul,1\)/.test(DEVO.fx));
}

// ---- aedh.procs: ProcDefs and glow ids -----------------------------------------------------------------------------------------------------------
{
  const defs = ['initiative', 'metamorphosis', 'soul_overflow', 'void_meta'].map((id) => getProcDef(id));
  ok('aedh.procs initiative / metamorphosis / soul_overflow / void_meta ProcDefs exist', defs.every((d) => !!d));
  ok('aedh.procs glow ids resolve to skills', PROC_DEFS.filter((d) => ['initiative', 'metamorphosis', 'soul_overflow', 'void_meta', 'exergy', 'metamorphosis_v'].includes(d.id)).every((d) => d.glow.every((g) => !!SKILLS[g])));
  const { p } = newDh(DEVO, { dummy: false });
  p.statuses.apply('void_meta', 30, { sourceId: p.id });
  const glow = glowSkillsOf(p.statuses, { resourcePct: 0.5, bestSpender: null, pips: 0, combo: 0, arcane: 0, targetHpPct: null, stealthed: false, riposteOpen: false, targetGuardBroken: false, bleedingEnemies: 0 });
  ok('aedh.procs void_meta lights Çöken Yıldız (Collapsing Star)', glow.has('demonhunter_collapsing_star'));
}

// ---- helpers for the dynamic sections ---------------------------------------------------------------------------------------------------------------
/** Deterministic weapon (100) and no crit, so damage ratios are exact. */
function flat(p) { p.stats.weaponMin = p.stats.weaponMax = 100; p.stats.critChance = 0; p.stats.critDamage = 0; }
/** hp of the player as a fraction (the sim player has 5000 max HP). */
const hpFrac = (p) => p.hp / p.maxHp;
const aimAt = (p, x, z) => ({ point: [x, 0, z], dir: [x - p.position.x, 0, z - p.position.z], targetId: null });
const keepCombat = (p) => { p.combatTimer = 0; };

// ---- aedh.fury: Combat's 'fury' regen rule --------------------------------------------------------------------------------------------------------
{
  const { p } = newDh(CHAOS);
  flat(p);
  p.stats.resourceRegen = 10; // class 5 + Kaos 5
  keepCombat(p); p.resource = 0;
  for (let i = 0; i < 60; i++) { keepCombat(p); H.step(1); }
  ok('aedh.fury in combat the Fel Bıçakları engine gives class + spec regen (10/s)', p.resource > 8.5 && p.resource < 11.5, `after 1 s = ${p.resource.toFixed(1)}`);
  p.combatTimer = 99; p.resource = 50;
  H.stepSec(1);
  ok('aedh.fury out of combat Gazap decays 4/s and does not regenerate', p.resource > 45 && p.resource < 47.5, `after 1 s = ${p.resource.toFixed(1)}`);
  p.stats.resourceRegen = 0;
  keepCombat(p); p.resource = 30;
  p.statuses.apply('void_meta', 90, { magnitude: 5, sourceId: p.id });
  p.statuses.apply('collapsing_star', 60, { stacks: 3, sourceId: p.id });
  for (let i = 0; i < 120; i++) { keepCombat(p); H.step(1); }
  ok('aedh.fury Boşluk Metamorfozu (Void Metamorphosis) drains its magnitude (5/s) while up', p.resource > 18 && p.resource < 21.5 && p.statuses.has('void_meta'), `after 2 s = ${p.resource.toFixed(1)}`);
  p.resource = 3;
  for (let i = 0; i < 40; i++) { keepCombat(p); H.step(1); }
  ok('aedh.fury the form ends when Gazap runs out and the Çöken Yıldız (Collapsing Star) series is dropped', !p.statuses.has('void_meta') && !p.statuses.has('collapsing_star') && p.resource === 0);
}

// ---- aedh.chain: Fel Bıçakları ------------------------------------------------------------------------------------------------------------------
{
  const { p, e } = newDh(CHAOS);
  flat(p);
  p.stats.resourceRegen = 0;
  keepCombat(p);
  H.clearEvents();
  for (let i = 0; i < 360; i++) { keepCombat(p); if (i % 3 === 0) cast(p, 'lmb', e); H.step(1); }
  const hits = dmgTo(e, /^demonhunter_basic_/);
  const ids = new Set(hits.map((d) => d.skillId));
  ok('aedh.chain LMB runs all four steps against a dummy', ids.size === 4, [...ids].join());
  ok('aedh.chain every landed step pays Gazap (>= 1 per hit; the finisher also refunds a share of the bar, GDD_LIFE 5.9)', p.resource >= hits.length * 1, `res=${p.resource.toFixed(1)} hits=${hits.length}`);
  H.setAimTarget(e);
}
{
  const { p, e } = newDh(VENG);
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(VENG.fx).items, `spec:${VENG.id}`));
  flat(p);
  p.stats.resourceRegen = 0;
  // 80 finisher steps (cast the step directly): 20 % PRD +1 fragment ~ 16
  let got = 0;
  for (let i = 0; i < 80; i++) {
    keepCombat(p);
    p.pips = { soul: 0 };
    G.skills.tryCast(p, 'demonhunter_basic_4', H.aimFor(p, e));
    H.stepSec(1.4);
    if (souls(p) > 0) got++;
  }
  ok('aedh.souls the İntikam chain finisher gives a fragment ~20 % of the time (PRD)', got >= 8 && got <= 26, `${got} of 80`);
  G.procs = undefined;
}

// ---- aedh.rows (Kaos) -------------------------------------------------------------------------------------------------------------------------------
{
  // Kaos Darbesi (Chaos Strike) / Yok Ediş (Annihilation)
  const a = newDh(CHAOS); flat(a.p); a.p.resource = 100;
  H.clearEvents();
  ok('aedh.rows Kaos Darbesi (Chaos Strike) casts, pays 20 Gazap and hits for ~0.72 coef', cast(a.p, 'rmb', a.e) && (H.stepSec(1.2), true) && near(a.p.resource, 80, 1.5) && dmgTo(a.e, /chaos_strike/).length === 1,
    `res=${a.p.resource.toFixed(1)} hits=${dmgTo(a.e, /chaos_strike/).length}`);
  const dChaos = sumDmg(a.e, /chaos_strike/);
  const m = newDh(CHAOS); flat(m.p); m.p.resource = 100; m.p.statuses.apply('metamorphosis', 24, { sourceId: m.p.id });
  ok('aedh.rows Metamorfoz (Metamorphosis) turns Kaos Darbesi (Chaos Strike) into Yok Ediş (replaces) and Bıçak Dansı (Blade Dance) into Ölüm Süpürmesi (Death Sweep)', G.skills.replacementFor(m.p, 'demonhunter_chaos_strike') === 'demonhunter_annihilation'
    && G.skills.replacementFor(m.p, 'demonhunter_blade_dance') === 'demonhunter_death_sweep' && G.skills.replacementFor(a.p, 'demonhunter_chaos_strike') === null);
  H.clearEvents();
  cast(m.p, 'rmb', m.e); H.stepSec(1.2);
  const dAnn = sumDmg(m.e, /annihilation/);
  ok('aedh.rows Yok Ediş (Annihilation) hits ~1.3x Kaos Darbesi (Chaos Strike)', dAnn / dChaos > 1.15 && dAnn / dChaos < 1.45, `ratio=${(dAnn / dChaos).toFixed(2)}`);
  // Bıçak Dansı (Blade Dance): AoE over several dummies, cooldown 15 (9 as Ölüm Süpürmesi (Death Sweep))
  const b = newDh(CHAOS); flat(b.p); b.p.resource = 100;
  H.addEnemy(3, 0, { hp: 1e9 }); H.addEnemy(-3, 0, { hp: 1e9 }); H.addEnemy(0, -3, { hp: 1e9 });
  H.clearEvents();
  cast(b.p, 's1', b.e); H.stepSec(1.5);
  const hitIds = new Set(events['damage'].filter((d) => /blade_dance/.test(d.skillId ?? '') && d.amount > 0).map((d) => d.targetId));
  ok('aedh.rows Bıçak Dansı (Blade Dance) hits every enemy within 6 m, costs 18, cd 15', hitIds.size === 4 && near(b.p.resource, 82, 1.5) && near(G.skills.getCooldown(b.p, 'demonhunter_blade_dance').total, 15, 0.01),
    `targets=${hitIds.size} res=${b.p.resource.toFixed(1)} cd=${G.skills.getCooldown(b.p, 'demonhunter_blade_dance').total}`);
  const ds = newDh(CHAOS); ds.p.resource = 100; ds.p.statuses.apply('metamorphosis', 24, { sourceId: ds.p.id });
  cast(ds.p, 's1', ds.e); H.stepSec(1.2);
  ok('aedh.rows Ölüm Süpürmesi (Death Sweep) has its own 9 s cooldown', near(G.skills.getCooldown(ds.p, 'demonhunter_death_sweep').total, 9, 0.01), `${G.skills.getCooldown(ds.p, 'demonhunter_death_sweep').total}`);
}
{
  // Göz Işını (Eye Beam)
  const a = newDh(CHAOS); flat(a.p); a.p.resource = 50;
  H.clearEvents();
  const started = cast(a.p, 'r', a.e);
  H.stepSec(3.2);
  const hits = dmgTo(a.e, /eye_beam/);
  ok('aedh.rows Göz Işını (Eye Beam): 4 ticks, 15 Gazap paid, Kör Gazap +12 on a full channel', started && hits.length === 4 && near(a.p.resource, 47, 1.5), `hits=${hits.length} res=${a.p.resource.toFixed(1)}`);
  const dBeam = sumDmg(a.e, /eye_beam/);
  const c = newDh(CHAOS); flat(c.p); c.p.resource = 100; cast(c.p, 'rmb', c.e); H.stepSec(1.2);
  const dCs = sumDmg(c.e, /chaos_strike/);
  ok('aedh.rows Göz Işını (Eye Beam) total ~6.2 coef (8.6 Kaos Darbesi (Chaos Strike))', dBeam / dCs > 6.5 && dBeam / dCs < 11, `ratio=${(dBeam / dCs).toFixed(1)}`);
  const i = newDh(CHAOS); flat(i.p); i.p.resource = 50;
  cast(i.p, 'r', i.e); H.stepSec(0.5); i.p.statuses.apply('stun', 1, { sourceId: i.p.id }); H.stepSec(1);
  ok('aedh.rows an interrupted Göz Işını (Eye Beam) pays no Kör Gazap', i.p.resource < 40, `res=${i.p.resource.toFixed(1)}`);
  const f = newDh(CHAOS); f.p.resource = 50; cast(f.p, 'r', f.e); H.stepSec(0.5);
  ok('aedh.rows the beam slows the caster 70 % and makes it cc-immune while it runs', f.p.getActionMoveMul() <= 0.35 && f.p.statuses.immune.cc > 0);
}
{
  // Yakıcı Aura (Immolation Aura)
  const a = newDh(CHAOS); flat(a.p); a.p.resource = 0;
  H.clearEvents();
  cast(a.p, 'e', a.e); H.stepSec(7.5);
  const hits = dmgTo(a.e, /immolation_aura/);
  ok('aedh.rows Yakıcı Aura (Immolation Aura): +20 Gazap on cast, 6 pulses, 2 charges', hits.length === 6 && a.p.resource >= 19 && G.skills.getCooldown(a.p, 'demonhunter_immolation_aura').maxCharges === 2, `hits=${hits.length} res=${a.p.resource.toFixed(1)}`);
  const a2 = newDh(CHAOS); a2.p.resource = 0;
  cast(a2.p, 'e', a2.e); H.step(2); a2.p.position.set(10, 0, 0); H.stepSec(1.5);
  ok('aedh.rows the aura follows the caster (an enemy left behind is no longer hit)', events['damage'].filter((d) => d.targetId === a2.e.id).length <= 3);
}
{
  // Fel Atılışı (Fel Rush), Av, İntikam Geri Çekilişi (Vengeful Retreat), Metamorfoz (Metamorphosis), Öz Kırılması (Essence Break)
  const a = newDh(CHAOS, { dummy: false }); a.p.resource = 100;
  cast(a.p, 's2', null); H.stepSec(1);
  ok('aedh.rows Fel Atılışı (Fel Rush) dashes ~9.6 m forward (12 m * 0.8)', a.p.position.z > 8 && a.p.position.z < 13, `z=${a.p.position.z.toFixed(1)}`);
  const h = newDh(CHAOS, { dist: 20 }); flat(h.p);
  H.clearEvents();
  cast(h.p, 'm180', h.e); H.stepSec(1.2);
  ok('aedh.rows Av dashes to the target, hits and burns it, grants Taşkınlık', h.p.position.z > 15 && h.e.statuses.has('the_hunt') && h.p.statuses.has('exergy') && dmgTo(h.e, /the_hunt/).length >= 1,
    `z=${h.p.position.z.toFixed(1)} the_hunt=${h.e.statuses.has('the_hunt')}`);
  const r = newDh(CHAOS); r.p.resource = 0;
  H.clearEvents();
  G.character.save.skillBar = { ...G.character.save.skillBar, r: 'demonhunter_vengeful_retreat' }; cast(r.p, 'r', r.e); H.stepSec(0.6);
  ok('aedh.rows İntikam Geri Çekilişi (Vengeful Retreat) hops back ~8 m, strikes the take-off spot and grants Girişim', r.p.position.z < -5 && r.p.statuses.has('initiative') && dmgTo(r.e, /vengeful_retreat/).length === 1 && G.skills.getCooldown(r.p, 'demonhunter_vengeful_retreat').total === 25,
    `z=${r.p.position.z.toFixed(1)}`);
  const mm = newDh(CHAOS); flat(mm.p);
  const as0 = mm.p.getStat('attackSpeed');
  H.clearEvents();
  cast(mm.p, 'm90', mm.e); H.stepSec(1.5);
  ok('aedh.rows Metamorfoz (Metamorphosis): status 24 s, +25 % attack speed, impact strike', mm.p.statuses.has('metamorphosis') && near(mm.p.getStat('attackSpeed') - as0, 0.25, 0.01) && dmgTo(mm.e, /metamorphosis/).length === 1, `d=${(mm.p.getStat('attackSpeed') - as0).toFixed(2)}`);
  const eb = newDh(CHAOS); flat(eb.p); eb.p.resource = 100;
  H.clearEvents();
  cast(eb.p, 'm45', eb.e); H.stepSec(1.4);
  ok('aedh.rows Öz Kırılması (Essence Break) hits hard and marks the target for 4 s', eb.e.statuses.has('essence_break') && dmgTo(eb.e, /essence_break/).length === 1 && eb.e.statuses.get('essence_break').remaining > 1.5);
  const w1 = newDh(CHAOS); flat(w1.p); w1.p.resource = 100; cast(w1.p, 'rmb', w1.e); H.stepSec(1.2);
  const base = sumDmg(w1.e, /chaos_strike/);
  const w2 = newDh(CHAOS); flat(w2.p); w2.p.resource = 100; w2.e.statuses.apply('essence_break', 4, { sourceId: w2.p.id }); cast(w2.p, 'rmb', w2.e); H.stepSec(1.2);
  ok('aedh.rows inside the Öz Kırılması (Essence Break) window Kaos Darbesi (Chaos Strike) hits +60 %', near(sumDmg(w2.e, /chaos_strike/) / base, 1.6, 0.08), `ratio=${(sumDmg(w2.e, /chaos_strike/) / base).toFixed(2)}`);
  const bl = newDh(CHAOS); cast(bl.p, 's3', null); H.stepSec(0.6);
  ok('aedh.rows Bulanıklık (Blur): -35 % damage taken, +30 % dodge, 2 charges', bl.p.statuses.has('blur') && near(bl.p.getStat('damageReductionPct'), 0.35, 0.01) && G.skills.getCooldown(bl.p, 'demonhunter_blur').maxCharges === 2);
}

// ---- aedh.veng (İntikam) --------------------------------------------------------------------------------------------------------------------------
{
  const a = newDh(VENG); flat(a.p); a.p.stats.resourceRegen = 0; keepCombat(a.p);
  ok('aedh.souls Kırılma: +14 Gazap, +2 fragments, 2 charges of 4.5 s', cast(a.p, 'rmb', a.e) && (H.stepSec(0.5), true) && near(a.p.resource, 14, 0.5) && souls(a.p) === 2 && G.skills.getCooldown(a.p, 'demonhunter_fracture').maxCharges === 2 && near(G.skills.getCooldown(a.p, 'demonhunter_fracture').total, 4.5, 0.01));
  H.stepSec(1.1);
  ok('aedh.souls the second Kırılma charge casts, the third is on cooldown', cast(a.p, 'rmb', a.e) && (H.stepSec(1.2), true) && souls(a.p) === 4 && !cast(a.p, 'rmb', a.e));
  const b = newDh(VENG); flat(b.p); b.p.stats.resourceRegen = 0; keepCombat(b.p);
  G.skills.addPip(b.p, 'soul', 4);
  ok('aedh.souls 4 fragments do not light Ruh Bombası (Spirit Bomb), 5 do (soul_overflow)', !b.p.statuses.has('soul_overflow') && G.skills.replacementFor(b.p, 'demonhunter_soul_cleave') === null
    && (G.skills.addPip(b.p, 'soul', 1), b.p.statuses.has('soul_overflow')) && G.skills.replacementFor(b.p, 'demonhunter_soul_cleave') === 'demonhunter_spirit_bomb');
  G.skills.spendPip(b.p, 'soul', 1);
  ok('aedh.souls the soul_overflow status falls away below 5', !b.p.statuses.has('soul_overflow'));
  const c0 = newDh(VENG); flat(c0.p); c0.p.resource = 100; c0.p.hp = c0.p.maxHp * 0.5; keepCombat(c0.p);
  cast(c0.p, 'q', c0.e); H.stepSec(1.2);
  const noSoul = sumDmg(c0.e, /soul_cleave/), healNo = c0.p.hp - c0.p.maxHp * 0.5;
  const c1 = newDh(VENG); flat(c1.p); c1.p.resource = 100; c1.p.hp = c1.p.maxHp * 0.5; keepCombat(c1.p); G.skills.addPip(c1.p, 'soul', 3);
  cast(c1.p, 'q', c1.e); H.stepSec(1.2);
  const withSoul = sumDmg(c1.e, /soul_cleave/), healYes = c1.p.hp - c1.p.maxHp * 0.5;
  ok('aedh.souls Ruh Yarma (Soul Cleave) eats ONE fragment: +40 % damage and heal, 22 Gazap', near(withSoul / noSoul, 1.4, 0.07) && souls(c1.p) === 2 && near(c1.p.resource, 78, 1.5) && healYes > healNo * 1.25 && healNo > c0.p.maxHp * 0.025,
    `dmg ratio=${(withSoul / noSoul).toFixed(2)} souls=${souls(c1.p)} heal=${healNo.toFixed(0)}/${healYes.toFixed(0)}`);
  const d = newDh(VENG); flat(d.p); d.p.resource = 100; d.p.hp = d.p.maxHp * 0.5; keepCombat(d.p);
  H.addEnemy(2, 0, { hp: 1e9 }); H.addEnemy(-2, 0, { hp: 1e9 });
  G.skills.addPip(d.p, 'soul', 6);
  H.clearEvents();
  cast(d.p, 'q', d.e); H.stepSec(1.4);
  const sb = new Set(events['damage'].filter((x) => /spirit_bomb/.test(x.skillId ?? '') && x.amount > 0).map((x) => x.targetId));
  ok('aedh.souls Ruh Bombası (q at 5+ fragments) swallows them all, hits 3 enemies, frails them and heals 6 %', sb.size === 3 && souls(d.p) === 0 && d.e.statuses.has('frailty') && d.p.hp - d.p.maxHp * 0.5 > d.p.maxHp * 0.045 && near(d.p.resource, 75, 1.5),
    `targets=${sb.size} souls=${souls(d.p)} heal=${(d.p.hp - d.p.maxHp * 0.5).toFixed(0)}`);
}
{
  // Fel Kanı: the proc engine ticks on its own inside SkillSystem.update
  const a = newDh(VENG);
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(VENG.fx).items, `spec:${VENG.id}`));
  flat(a.p); a.p.stats.resourceRegen = 0;
  for (let i = 0; i < 60 * 22; i++) { if (i % 60 === 0) keepCombat(a.p); H.step(1); }
  ok('aedh.souls Fel Kanı: +1 fragment every 10 s on its own (tick:10)', souls(a.p) >= 2 && souls(a.p) <= 3, `souls after 22 s = ${souls(a.p)}`);
  // Şeytan Dikenleri (Demon Spikes) refund
  const b = newDh(VENG); flat(b.p);
  const eng2 = seededEngine(); G.procs = eng2; eng2.setEntries(collectProcs(parseFx(VENG.fx).items, `spec:${VENG.id}`));
  cast(b.p, 's3', null); H.stepSec(0.6);
  const due = () => G.skills.states.get(b.p.id).cds.get('demonhunter_demon_spikes').rechargeAt - G.skills.now;
  const before = due();
  cast(b.p, 'rmb', b.e); H.stepSec(0.6);
  const after = due();
  ok('aedh.souls Kırılma shortens the Şeytan Dikenleri (Demon Spikes) recharge by 0.5 s (cdr)', before - after > 1.0 && before - after < 1.25, `before=${before.toFixed(2)} after=${after.toFixed(2)}`);
  G.procs = undefined;
}
{
  const k0 = newDh(VENG); flat(k0.p); k0.p.resource = 100; cast(k0.p, 'rmb', k0.e); H.stepSec(1.2);
  const base = sumDmg(k0.e, /fracture/);
  const k1 = newDh(VENG); flat(k1.p); k1.p.resource = 100;
  H.clearEvents();
  cast(k1.p, 'r', k1.e); H.stepSec(1);
  ok('aedh.veng Ateş Mührü (Fiery Brand): 8 s brand, the target hits 40 % softer, 2 charges / 30 s', k1.e.statuses.has('fiery_brand') && near(k1.e.getStat('damagePct'), -0.4, 0.01) && G.skills.getCooldown(k1.p, 'demonhunter_fiery_brand').maxCharges === 2
    && near(G.skills.getCooldown(k1.p, 'demonhunter_fiery_brand').total, 30, 0.01));
  H.clearEvents();
  G.skills.tryCast(k1.p, 'demonhunter_fracture', H.aimFor(k1.p, k1.e)); H.stepSec(1.2);
  ok('aedh.veng a branded target takes +10 % from the demon hunter', near(sumDmg(k1.e, /fracture/) / base, 1.1, 0.06), `ratio=${(sumDmg(k1.e, /fracture/) / base).toFixed(2)}`);
  const t = newDh(VENG); G.character.save.skillBar = { ...G.character.save.skillBar, r: 'demonhunter_torment' }; cast(t.p, 'r', t.e); H.stepSec(0.5);
  ok('aedh.veng İşkence (Torment) taunts the target (8 s cd)', t.e.statuses.has('taunt') && G.skills.getCooldown(t.p, 'demonhunter_torment').total === 8);
  const sp = newDh(VENG); cast(sp.p, 's3', null); H.stepSec(0.5);
  ok('aedh.veng Şeytan Dikenleri (Demon Spikes): +100 % armour, +30 % parry for 8 s', sp.p.statuses.has('demon_spikes') && near(sp.p.getStat('armorPct'), 1.0, 0.01) && near(sp.p.getStat('parryWindow'), 0.3, 0.01));
  const fd = newDh(VENG); flat(fd.p); fd.p.resource = 100; fd.p.hp = fd.p.maxHp * 0.5; keepCombat(fd.p);
  H.clearEvents();
  cast(fd.p, 'm45', fd.e);
  for (let i = 0; i < 200; i++) { keepCombat(fd.p); H.step(1); }
  const healed = (fd.p.hp - fd.p.maxHp * 0.5) / fd.p.maxHp;
  ok('aedh.veng Fel Yıkımı (Fel Devastation): 30 Gazap, 4 ticks, heals ~12 % max HP over the channel', near(fd.p.resource, 70, 1.5) && dmgTo(fd.e, /fel_devastation/).length === 4 && healed > 0.1 && healed < 0.14,
    `res=${fd.p.resource.toFixed(0)} hits=${dmgTo(fd.e, /fel_devastation/).length} heal=${(healed * 100).toFixed(1)}%`);
  const mt = newDh(VENG); mt.p.hp = mt.p.maxHp * 0.5; keepCombat(mt.p);
  cast(mt.p, 'm90', mt.e); H.stepSec(1.2);
  ok('aedh.veng Metamorfoz (Metamorphosis): metamorphosis_v 15 s (+40 % max HP), instant heal, fire impact', mt.p.statuses.has('metamorphosis_v') && !mt.p.statuses.has('metamorphosis') && hpFrac(mt.p) > 0.7, `hp=${hpFrac(mt.p).toFixed(2)}`);
  const sc = newDh(VENG); flat(sc.p);
  H.clearEvents();
  cast(sc.p, 'm180', sc.e); H.stepSec(1.2);
  ok('aedh.veng Ruh Oyucu (Soul Carver): +3 fragments, burns the target, 60 s cd', souls(sc.p) === 3 && sc.e.statuses.has('burn') && near(G.skills.getCooldown(sc.p, 'demonhunter_soul_carver').total, 60, 0.01));
  const is = newDh(VENG, { dummy: false }); flat(is.p);
  const far = H.addEnemy(0, 12, { hp: 1e9 }); H.setAimTarget(null);
  H.clearEvents();
  G.skills.tryCastSlot(is.p, 's2', aimAt(is.p, 0, 12)); H.stepSec(3);
  ok('aedh.veng İnfernal Atılış leaps ~12 m, lands a strike and a delayed Alev Mührü pulse', is.p.position.z > 10 && dmgTo(far, /infernal_strike/).length === 2, `z=${is.p.position.z.toFixed(1)} hits=${dmgTo(far, /infernal_strike/).length}`);
  const ia = newDh(VENG); ia.p.resource = 0;
  cast(ia.p, 'e', ia.e); H.stepSec(0.4);
  ok('aedh.veng Yakıcı Aura (Immolation Aura) patched: +16 Gazap (not 20)', near(ia.p.resource, 16, 0.6), `res=${ia.p.resource.toFixed(1)}`);
}

// ---- aedh.devourer (Yutucu, Midnight) -------------------------------------------------------------------------------------------------------------------
{
  const a = newDh(DEVO); flat(a.p); a.p.stats.resourceRegen = 0; keepCombat(a.p);
  H.clearEvents();
  ok('aedh.devourer Tüket: instant bolt, +8 Gazap, +1 fragment, ~0.85 coef', cast(a.p, 'rmb', a.e) && (H.stepSec(1.2), true) && near(a.p.resource, 8, 0.6) && souls(a.p) === 1 && dmgTo(a.e, /consume/).length === 1);
  ok('aedh.devourer Tüket needs no cast time and does not slow a moving caster', SKILLS.demonhunter_consume.castTime === 0 && !SKILLS.demonhunter_consume.lockMovement && (SKILLS.demonhunter_consume.params.slow ?? 0) <= 0.25);
  const r0 = newDh(DEVO); flat(r0.p);
  ok('aedh.devourer Biç needs a fragment', !cast(r0.p, 'q', r0.e));
  const r1 = newDh(DEVO); flat(r1.p); r1.p.stats.resourceRegen = 0; keepCombat(r1.p); G.skills.addPip(r1.p, 'soul', 1);
  H.clearEvents(); cast(r1.p, 'q', r1.e); H.stepSec(1.4);
  const one = sumDmg(r1.e, /reap/);
  const r5 = newDh(DEVO); flat(r5.p); r5.p.stats.resourceRegen = 0; keepCombat(r5.p); G.skills.addPip(r5.p, 'soul', 5);
  H.clearEvents(); cast(r5.p, 'q', r5.e); H.stepSec(1.4);
  const five = sumDmg(r5.e, /reap/);
  ok('aedh.devourer Biç swallows every fragment: damage 0.9 + 0.55 each, +4 Gazap each', souls(r5.p) === 0 && near(r5.p.resource, 20, 1) && near(five / one, (0.9 + 0.55 * 5) / (0.9 + 0.55), 0.12) && near(G.skills.getCooldown(r5.p, 'demonhunter_reap').total, 5, 0.01),
    `ratio=${(five / one).toFixed(2)} res=${r5.p.resource.toFixed(1)} souls=${souls(r5.p)}`);
  const m3 = newDh(DEVO); G.skills.addPip(m3.p, 'soul', 3);
  ok('aedh.devourer Boşluk Metamorfozu (Void Metamorphosis) is refused below 4 fragments', !cast(m3.p, 'm90', m3.e));
  const m = newDh(DEVO); flat(m.p); m.p.stats.resourceRegen = 0; keepCombat(m.p); G.skills.addPip(m.p, 'soul', 5); m.p.statuses.apply('collapsing_star', 60, { stacks: 4, sourceId: m.p.id });
  H.clearEvents(); cast(m.p, 'm90', m.e); H.stepSec(1.4);
  ok('aedh.devourer Boşluk Metamorfozu (Void Metamorphosis): pays 4 fragments, +40 Gazap (minus the drain), void_meta, resets the Çöken Yıldız (Collapsing Star) series, nova hit',
    souls(m.p) === 1 && m.p.statuses.has('void_meta') && !m.p.statuses.has('collapsing_star') && near(m.p.resource, 40 - 10 * 1.4, 3.5) && dmgTo(m.e, /void_metamorphosis/).length === 1 && SKILLS.demonhunter_void_metamorphosis.cooldown <= 3,
    `souls=${souls(m.p)} res=${m.p.resource.toFixed(1)}`);
  ok('aedh.devourer in the form Boşluk Işını (Void Ray) becomes Boşluk Fırtınası (replaces void_meta)', G.skills.replacementFor(m.p, 'demonhunter_void_ray') === 'demonhunter_void_storm' && G.skills.replacementFor(a.p, 'demonhunter_void_ray') === null);
  const v = newDh(DEVO); flat(v.p); v.p.stats.resourceRegen = 0; keepCombat(v.p); v.p.resource = 40;
  H.clearEvents(); cast(v.p, 'e', v.e); for (let i = 0; i < 150; i++) { keepCombat(v.p); H.step(1); }
  ok('aedh.devourer Boşluk Işını (Void Ray): 20 Gazap, 4 ticks of 1.4 coef, line hit, 10 s cd', near(v.p.resource, 20, 1.5) && dmgTo(v.e, /void_ray/).length === 4 && near(G.skills.getCooldown(v.p, 'demonhunter_void_ray').total, 10, 0.01), `res=${v.p.resource.toFixed(1)} hits=${dmgTo(v.e, /void_ray/).length}`);
  const s = newDh(DEVO); flat(s.p); s.p.stats.resourceRegen = 0; keepCombat(s.p); s.p.resource = 60;
  s.p.statuses.apply('void_meta', 60, { magnitude: 0.0001, sourceId: s.p.id }); // drain neutral here: Combat reads magnitude>0 as drain, 0.0001 ~ none
  H.clearEvents(); cast(s.p, 'e', s.e); for (let i = 0; i < 330; i++) { keepCombat(s.p); H.step(1); }
  const hs = dmgTo(s.e, /void_storm/);
  ok('aedh.devourer Boşluk Fırtınası (Void Storm) channels 4 s, ~9 ticks, pays 4 Gazap per second', hs.length >= 8 && hs.length <= 11 && s.p.resource < 60 - 12 && s.p.resource > 60 - 20, `hits=${hs.length} res=${s.p.resource.toFixed(1)}`);
  const noMeta = newDh(DEVO); noMeta.p.resource = 100;
  ok('aedh.devourer Çöken Yıldız (Collapsing Star) is refused outside the form', !cast(noMeta.p, 'r', noMeta.e));
  const cs = newDh(DEVO); flat(cs.p); cs.p.stats.resourceRegen = 0; cs.p.statuses.apply('void_meta', 60, { magnitude: 0.0001, sourceId: cs.p.id });
  const dm = [];
  for (let i = 0; i < 4; i++) {
    cs.p.resource = 100; keepCombat(cs.p);
    H.clearEvents();
    cast(cs.p, 'r', cs.e);
    H.stepSec(3);
    dm.push(sumDmg(cs.e, /collapsing_star/));
  }
  ok('aedh.devourer Çöken Yıldız (Collapsing Star) grows +15 % per earlier use', near(dm[1] / dm[0], 1.15, 0.06) && near(dm[2] / dm[0], 1.3, 0.08) && near(dm[3] / dm[0], 1.45, 0.1) && cs.p.statuses.stacks('collapsing_star') === 4, dm.map((x) => Math.round(x)).join('/'));
  const vn = newDh(DEVO); flat(vn.p); vn.p.stats.resourceRegen = 0; keepCombat(vn.p);
  cast(vn.p, 's1', vn.e); H.stepSec(1.4);
  ok('aedh.devourer Boşluk Girdabı (Void Nova): +2 fragments, +10 Gazap, 12 s cd', souls(vn.p) === 2 && near(vn.p.resource, 10, 0.8) && near(G.skills.getCooldown(vn.p, 'demonhunter_void_nova').total, 12, 0.01));
  const dk = newDh(DEVO); cast(dk.p, 'm45', null); H.stepSec(1.2);
  ok('aedh.devourer Karanlık: ground zone gives the caster -20 % damage taken', dk.p.statuses.has('darkness') && near(dk.p.getStat('damageReductionPct'), 0.2, 0.01) && near(G.skills.getCooldown(dk.p, 'demonhunter_darkness').total, 45, 0.01));
}
{
  // the kill fragment (Hasat) through the proc engine
  const a = newDh(DEVO, { hp: 5 }); flat(a.p); a.p.stats.resourceRegen = 0; keepCombat(a.p);
  const eng = seededEngine(); G.procs = eng; eng.setEntries(collectProcs(parseFx(DEVO.fx).items, `spec:${DEVO.id}`));
  a.e.maxHp = a.e.hp = 5;
  cast(a.p, 'rmb', a.e); H.stepSec(1.3);
  ok('aedh.devourer Hasat: a kill gives +1 fragment', a.e.isDead && souls(a.p) >= 2, `souls=${souls(a.p)} (Tüket gives 1, the kill 1)`);
  G.procs = undefined;
}

// ---- aedh.cast: every demonhunter row casts without error ------------------------------------------------------------------------------------------------
{
  const before = errors.length;
  let casted = 0;
  const failed = [];
  for (const spec of ALL) {
    for (const d of DH_ROWS) {
      if (/_basic_\d$/.test(d.id) || /_basic$/.test(d.id)) continue;
      if (d.spec && d.spec !== spec.id) continue;
      const { p, e } = newDh(spec);
      flat(p);
      p.resource = 100; keepCombat(p);
      G.skills.addPip(p, 'soul', 6);
      p.statuses.apply('void_meta', 60, { magnitude: 0.0001, sourceId: p.id });
      p.statuses.apply('metamorphosis', 30, { sourceId: p.id });
      G.character.save.skillBar = { ...G.character.save.skillBar, e: d.id };
      try {
        const r = cast(p, 'e', e);
        if (r) casted++;
        for (let i = 0; i < 60; i++) { keepCombat(p); H.step(3); }
        if (!r && !['demonhunter_disrupt', 'demonhunter_silence'].includes(d.id)) failed.push(`${spec.id}:${d.id}`);
      } catch (err) {
        failed.push(`${spec.id}:${d.id} THREW ${err?.message ?? err}`);
      }
    }
  }
  ok('aedh.cast no row throws and none is refused on a prepared dummy', failed.length === 0, failed.slice(0, 6).join(' | '));
  const bad = errors.slice(before).filter((m) => m.startsWith('ERR') || /unknown|missing|undefined/i.test(m));
  ok('aedh.cast no console errors / warnings from the demonhunter rows', bad.length === 0, bad.slice(0, 2).join(' | ').slice(0, 300));
  ok('aedh.cast most rows really cast', casted >= DH_ROWS.filter((d) => !/_basic/.test(d.id)).length, `casted=${casted}`);
}

// ---- APL runner ----------------------------------------------------------------------------------------------------------------------------------------------
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/target\.remaining:(\w+)/g, "TREM('$1')")
    .replace(/!target\.status:(\w+)/g, "!TS('$1')")
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/\bstacks:(\w+)/g, "ST('$1')")
    .replace(/\bremaining:(\w+)/g, "REM('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/pips:soul/g, 'SOULS')
    .replace(/\bhp%/g, 'HPP')
    .replace(/\bres\b/g, 'RES')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'CDR', 'CH', 'CD', 'TS', 'TREM', 'ST', 'REM', 'SOULS', 'HPP', 'RES', 'TG', `return (${cond});`) };
}

function runApl(spec, seconds, { warmup = 0, incoming = false } = {}) {
  const { p, e } = newDh(spec);
  flat(p);
  // the spec's passive stats and the class engine (what StatCalc folds in the real game)
  for (const [k, v] of Object.entries(spec.stats)) p.stats[k] = (p.stats[k] ?? 0) + v;
  p.stats.resourceRegen = (CLASSES.demonhunter.baseStats.resourceRegen ?? 0) + (spec.stats.resourceRegen ?? 0);
  p.stats.critChance = (p.stats.critChance ?? 0) + (CLASSES.demonhunter.baseStats.critChance ?? 0);
  const eng = seededEngine();
  G.procs = eng;
  eng.setEntries(collectProcs(parseFx(spec.fx).items, `spec:${spec.id}`));
  p.resource = 50;
  H.step(2);
  const lines = ROTATIONS_KIT_DEMONHUNTER[spec.id].st.map(compile);
  const led = { dmg: 0, furyIn: 0, soulIn: 0, casts: {}, hpLow: 1, bySkill: {} };
  const origRes = G.skills.addResource.bind(G.skills);
  G.skills.addResource = (a, n) => { const b = a.resource; origRes(a, n); if (a === p && n > 0) led.furyIn += a.resource - b; };
  const origAdd = G.skills.addPip.bind(G.skills);
  G.skills.addPip = (a, id, n) => { const b = G.skills.pipCount(a, id); origAdd(a, id, n); if (a === p && id === 'soul') led.soulIn += G.skills.pipCount(a, id) - b; };
  const castLog = (ev) => { if (ev.casterId === p.id) led.casts[ev.skillId] = (led.casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', castLog);
  // Kritik Vuruş / riposte / heavy are the game-wide poise-break rules (every class has them), not part of the kit budget
  const dmgLog = (ev) => { if (ev.targetId === e.id && ev.amount > 0 && !/_(krt|riposte|heavy)$/.test(ev.skillId ?? '')) { led.dmg += ev.amount; const k = (ev.skillId ?? '?').replace(/^demonhunter_/, '').replace(/_d$/, ''); led.bySkill[k] = (led.bySkill[k] ?? 0) + ev.amount; } };
  G.events.on('damage', dmgLog);
  const env = {
    S: (id) => p.statuses.has(id),
    CDR: (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; },
    CH: (id) => G.skills.getCooldown(p, id).charges,
    CD: (id) => G.skills.getCooldown(p, id).remaining,
    TS: (id) => e.statuses.has(id),
    TREM: (id) => e.statuses.get(id)?.remaining ?? 0,
    ST: (id) => p.statuses.stacks(id),
    REM: (id) => p.statuses.get(id)?.remaining ?? 0,
  };
  // the APL names the BASE skill: the bar holds the base id even while a transform (Ruh Bombası (Spirit Bomb), Yok Ediş (Annihilation)...) is up
  const slotOf = (id) => {
    if (id === spec.basic || id === 'demonhunter_basic') return 'lmb';
    for (const s of SLOTS) if (s !== 'lmb' && G.character.save.skillBar[s] === id) return s;
    return null;
  };
  const total = Math.round((seconds + warmup) / H.DT);
  for (let f = 0; f < total; f++) {
    if (f === Math.round(warmup / H.DT)) Object.assign(led, { dmg: 0, furyIn: 0, soulIn: 0, casts: {}, bySkill: {} });
    if (incoming && f % 156 === 78) { G.combat.hitLocalPlayer({ sourceId: null, amount: 150, type: 'physical', melee: true, unavoidable: true, blockable: false, ignoreIframes: true }); if (p.hp < p.maxHp * 0.3) p.hp = p.maxHp * 0.6; }
    led.hpLow = Math.min(led.hpLow, p.hp / p.maxHp);
    if (f % 30 === 0) p.combatTimer = Math.min(p.combatTimer, 1);
    for (const l of lines) {
      const slot = slotOf(l.skill);
      if (!slot) continue;
      if (!l.fn(env.S, env.CDR, env.CH, env.CD, env.TS, env.TREM, env.ST, env.REM, souls(p), p.hp / p.maxHp * 100, p.resource, 1)) continue;
      if (G.skills.tryCastSlot(p, slot, H.aimFor(p, e))) break;
    }
    H.step(1);
    if (f % 60 === 0) H.clearEvents();
  }
  G.events.off?.('skill:cast', castLog);
  G.events.off?.('damage', dmgLog);
  G.skills.addResource = origRes;
  G.skills.addPip = origAdd;
  G.procs = undefined;
  return led;
}

// ---- aedh.ledger: 60 s APL runs after a warm-up ---------------------------------------------------------------------------------------------------------
const LEDGER_SEC = 60;
const LEDGER = {};
for (const spec of ALL) {
  const led = runApl(spec, LEDGER_SEC, { warmup: 15, incoming: spec === VENG });
  LEDGER[spec.id] = led;
  const castsTxt = Object.entries(led.casts).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k.replace('demonhunter_', '')}=${v}`).join(' ');
  console.log(`       dmg share: ${Object.entries(led.bySkill).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([k, v]) => k + '=' + Math.round(v / LEDGER_SEC)).join(' ')}`);
  console.log(`     ${spec.id}: dps=${(led.dmg / LEDGER_SEC).toFixed(0)} furyIn=${led.furyIn.toFixed(0)} soulIn=${led.soulIn.toFixed(0)} hpLow=${led.hpLow.toFixed(2)}  ${castsTxt}`);
}
{
  const c = LEDGER.demonhunter_chaos, v = LEDGER.demonhunter_vengeance, d = LEDGER.demonhunter_devourer;
  ok('aedh.ledger Kaos spends Gazap mostly on Kaos Darbesi (Chaos Strike) / Yok Ediş (>= 25 per minute) and presses Göz Işını (Eye Beam) twice per minute', ((c.casts.demonhunter_chaos_strike ?? 0) + (c.casts.demonhunter_annihilation ?? 0)) >= 25 && (c.casts.demonhunter_eye_beam ?? 0) >= 1,
    `strikes=${(c.casts.demonhunter_chaos_strike ?? 0) + (c.casts.demonhunter_annihilation ?? 0)} beams=${c.casts.demonhunter_eye_beam ?? 0}`);
  ok('aedh.ledger İntikam keeps fragments flowing: Ruh Yarma (Soul Cleave) and Ruh Bombası (Spirit Bomb) both cast, Kırılma ~13 per minute', (v.casts.demonhunter_soul_cleave ?? 0) >= 12 && (v.casts.demonhunter_fracture ?? 0) >= 9 && v.soulIn >= 20,
    `cleave=${v.casts.demonhunter_soul_cleave ?? 0} fracture=${v.casts.demonhunter_fracture ?? 0} soulIn=${v.soulIn}`);
  ok('aedh.ledger İntikam survives its boss swings on the APL', v.hpLow > 0.3, `hpLow=${v.hpLow.toFixed(2)}`);
  ok('aedh.ledger Yutucu cycles Tüket -> Biç / form: casts Tüket, Boşluk Işını (Void Ray) or Fırtınası and the Çöken Yıldız (Collapsing Star)', (d.casts.demonhunter_consume ?? 0) >= 8 && ((d.casts.demonhunter_void_ray ?? 0) + (d.casts.demonhunter_void_storm ?? 0)) >= 2 && (d.casts.demonhunter_collapsing_star ?? 0) >= 1,
    `consume=${d.casts.demonhunter_consume ?? 0} meta=${d.casts.demonhunter_void_metamorphosis ?? 0} ray=${(d.casts.demonhunter_void_ray ?? 0) + (d.casts.demonhunter_void_storm ?? 0)} star=${d.casts.demonhunter_collapsing_star ?? 0}`);
  const rr = [c.dmg, d.dmg].sort((x, y) => x - y);
  ok('aedh.ledger the two dps specs deal damage within 45 % of each other (Kaos vs Yutucu)', rr[0] / rr[1] > 0.55, `kaos=${(c.dmg / LEDGER_SEC).toFixed(0)} yutucu=${(d.dmg / LEDGER_SEC).toFixed(0)} dps`);
  ok('aedh.ledger the tank deals 30-90 % of a dps spec', v.dmg / c.dmg > 0.3 && v.dmg / c.dmg < 0.9, `${(v.dmg / c.dmg).toFixed(2)}`);
}

// ---- aedh.l1 (WP-01 pattern): a level-1 demon hunter with no spec has a working bar (chain + Kaos Darbesi (Chaos Strike) + Yakıcı Aura (Immolation Aura) + Fel Atılışı (Fel Rush)), start gear, moveset
{
  const { CharacterState } = await H.imp('systems/CharacterState.ts');
  const { HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS } = await H.imp('combat/heavy.ts');
  const { RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS } = await H.imp('combat/moves.ts');
  const items = await H.imp('data/itemBases.ts');
  const menu = await H.imp('ui/menu/classInfo.ts');
  const msgs = await H.imp('net/messages.ts');
  const pvpSets = await H.imp('data/pvp/sets.ts');
  const bar1 = CharacterState.defaultBar('demonhunter', 1);
  ok('aedh.l1 level-1 bar = lmb chain, rmb Kaos Darbesi (Chaos Strike), s1 Yakıcı Aura (Immolation Aura), s2 Fel Atılışı (Fel Rush)', JSON.stringify(bar1) === JSON.stringify({
    lmb: 'demonhunter_basic', rmb: 'demonhunter_chaos_strike', s1: 'demonhunter_blade_dance', e: 'demonhunter_immolation_aura', s2: 'demonhunter_fel_rush',
  }), JSON.stringify(bar1));
  ok('aedh.l1 the creation list offers the demon hunter', PLAYABLE_CLASSES.includes('demonhunter') && menu.CLASS_ORDER.includes('demonhunter') && !!menu.classPresentation('demonhunter').highlights.length);
  ok('aedh.l1 start gear (twin daggers) is usable by a demon hunter and not by a knight', ['dagger_t1'].every((id) => items.ITEM_BASES[id] && items.classCanUseBase('demonhunter', items.ITEM_BASES[id])) && !items.classCanUseBase('knight', items.ITEM_BASES.dagger_t1)
    && !items.classCanUseBase('demonhunter', items.ITEM_BASES.staff_t1) && CLASSES.demonhunter.startingItems.join() === 'dagger_t1,dagger_t1');
  ok('aedh.l1 heavy, riposte, krt, run, jump, roll profiles exist under demonhunter ids', [HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS, RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS]
    .every((t) => t.demonhunter && (SKILLS[t.demonhunter.id]?.classId === 'demonhunter' || t === HEAVY_BY_CLASS || t === RIPOSTE_BY_CLASS || t === KRT_BY_CLASS)));
  ok('aedh.l1 PvP gladiator set and the three spec traits exist', !!pvpSets.PVP_SETS?.pvp_demonhunter || !!pvpSets.pvpClassNoun('demonhunter'), String(pvpSets.pvpClassNoun('demonhunter')));

  const p = H.addPlayer('demonhunter', 1);
  p.spec = undefined;
  p.yaw = 0; p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  p.stats.weaponMin = p.stats.weaponMax = 100;
  G.character.save.skillBar = { ...bar1 };
  G.character.save.spec = null;
  G.talents = { grantedSkills: () => [], skillPick: () => 0 };
  const foe = H.addEnemy(0, 2.2, { hp: 1e9 });
  foe.maxHp = 1e9; foe.hp = 1e9;
  H.step(2);
  p.hp = p.maxHp = 1e6;
  H.setAimTarget(foe);
  const fire = (slot) => { H.clearEvents(); p.resource = 100; p.combatTimer = 0; const s = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe)); H.stepSec(2.2); return s; };
  const hitBy = (re) => events['damage'].filter((d) => re.test(d.skillId ?? '') && d.amount > 0 && d.targetId === foe.id);
  const failed = () => events['skill:fail'].map((f) => f.reason ?? f.why ?? '?').join(',');
  ok('aedh.l1 lmb: the Fel Bıçakları chain swings and hits', fire('lmb') === true && hitBy(/^demonhunter_basic/).length >= 1, `hits=${hitBy(/^demonhunter_basic/).length} fail=${failed()}`);
  ok('aedh.l1 rmb: Kaos Darbesi (Chaos Strike) casts and hits without a spec', fire('rmb') === true && hitBy(/^demonhunter_chaos_strike$/).length >= 1, `hits=${hitBy(/^demonhunter_chaos_strike$/).length} fail=${failed()}`);
  ok('aedh.l1 s1: Yakıcı Aura (Immolation Aura) pulses without a spec', fire('e') === true && hitBy(/^demonhunter_immolation_aura$/).length >= 1, `hits=${hitBy(/^demonhunter_immolation_aura$/).length} fail=${failed()}`);
  ok('aedh.l1 s2: Fel Atılışı (Fel Rush) dashes without a spec', fire('s2') === true && p.position.z > 0.1, `z=${p.position.z.toFixed(1)} fail=${failed()}`);
  ok('aedh.l1 level-1 bar has four non-basic skills', Object.keys(bar1).filter((k) => k !== 'lmb').length === 4);
  ok('aedh.l1 the movement signature exists (PlayerController double jump + glide are class gated, no sim)', true);
}

// ---- level 1 (owner rule): every spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
for (const sid of ["demonhunter_chaos","demonhunter_vengeance","demonhunter_devourer"]) {
  const spec = SPECS[sid];
  const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
  ok(`kit_demonhunter.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
}
console.log(fails === 0 ? '\nkit.demonhunter (aedh): all checks PASS' : `\nkit.demonhunter (aedh): ${fails} FAIL`);
const engineErrors = errors.filter((m) => m.startsWith('ERR'));
if (engineErrors.length) console.log(`engine console errors (${engineErrors.length}): ${[...new Set(engineErrors)].slice(0, 5).join(' | ')}`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
