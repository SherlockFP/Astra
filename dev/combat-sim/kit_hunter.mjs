// KIT OKÇU (archer) checks (docs/GDD_CLASSES_V2.md §3, Midnight-aligned specs). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_hunter.mjs
// Implemented: kit.hunter.ids (specs, bars, majors), kit.hunter.apl (skill and status ids of the APL rows), kit.hunter.l1 (level-1 bar),
// kit.hunter.focus (costs, gains, regen), kit.hunter.minions (rows, groups, caps, real summons), kit.hunter.routes (route rows),
// kit.hunter.refs (statuses / vfx / sfx ids), kit.hunter.casts (aimed shot, disengage, trap, mark, pet, majors, channel).
// Not implemented here: rotation smoke run (the APL consumer is not in this worktree yet), the Focus stationary bonus (engine hook).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_ARCHER } = await H.imp('data/rotations_kit_archer.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { MINION_DEFS, MINION_GROUP_CAPS } = await H.imp('data/minions.ts');
const { VFX_IDS } = await H.imp('types/vfx.ts');
const { SFX_IDS } = await H.imp('types/audio.ts');
const { Minions } = await H.imp('combat/Minions.ts');
G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

const SPEC_IDS = ['archer_marksman', 'archer_beastmaster', 'archer_survival'];
const CORE = CLASSES.archer.skills;

// ---- kit.hunter.ids: the three specs, their bars, majors and spec skills resolve; the basic chain is complete
for (const sid of SPEC_IDS) {
  const s = SPECS[sid];
  ok(`kit.hunter.ids ${sid} spec exists`, !!s && s.classId === 'archer' && s.role === 'dps');
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors)];
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`kit.hunter.ids ${sid} skills resolve`, missing.length === 0, missing.join(','));
  ok(`kit.hunter.ids ${sid} has a trait special`, (s.specials ?? []).length >= 1 && s.specials.some((x) => x.id.startsWith('trait_')));
  ok(`kit.hunter.ids ${sid} majors sit at m45 / m90 with unlock 10 / 20 or later`,
    (s.unlock[s.majors.m45] ?? 0) === 10 && (s.unlock[s.majors.m90] ?? 0) === 20, `m45=${s.unlock[s.majors.m45]} m90=${s.unlock[s.majors.m90]}`);
  ok(`kit.hunter.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.hunter.ids ${sid} lmb is the archer chain`, s.defaultBar.lmb === 'archer_basic');
}
ok('kit.hunter.ids the chain steps archer_basic_1..4 exist', [1, 2, 3, 4].every((i) => !!SKILLS[`archer_basic_${i}`]));
ok('kit.hunter.ids the eight core skills resolve', CORE.length === 8 && CORE.every((id) => !!SKILLS[id]), CORE.filter((id) => !SKILLS[id]).join(','));
ok('kit.hunter.ids archer_basic is the basic attack of the class', CLASSES.archer.basicAttack === 'archer_basic');

// ---- kit.hunter.l1spec: every spec and the class start at level 1 with >= 4 usable skills on the bar (plus the basic)
for (const sid of [...SPEC_IDS]) {
  const usable = Object.values(SPECS[sid]?.defaultBar ?? {}).filter((id) => id && !/_basic/.test(id) && (SKILLS[id]?.unlockLevel ?? 99) <= 1);
  ok(`kit.hunter.l1spec ${sid} has >= 4 usable skills at level 1`, usable.length >= 4, usable.join(','));
}
{
  const bar1 = CharacterState.defaultBar('archer', 1);
  const usable = Object.values(bar1).filter((id) => id && !/_basic/.test(id) && (SKILLS[id]?.unlockLevel ?? 99) <= 1);
  ok('kit.hunter.l1spec class level-1 bar has >= 4 usable skills', usable.length >= 4, usable.join(','));
}

// ---- kit.hunter.apl: every skill and status named in the APL rows exists
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_ARCHER)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(archer_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.hunter.apl ${sid} skill ids resolve`, badSkills.length === 0 && skillIds.size > 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.hunter.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  ok(`kit.hunter.apl ${sid} has st and aoe lines`, apl.st.length > 0 && (apl.aoe ?? []).length > 0);
}
ok('kit.hunter.apl every archer spec has an APL', SPEC_IDS.every((sid) => !!ROTATIONS_KIT_ARCHER[sid]));

// ---- kit.hunter.l1: a level-1 archer has the chain and at least three usable skills at unlock 1
{
  const bar1 = CharacterState.defaultBar('archer', 1);
  const slots = Object.entries(bar1).filter(([slot]) => slot !== 'lmb');
  const usable = slots.filter(([, id]) => SKILLS[id]?.unlockLevel === 1);
  ok('kit.hunter.l1 level-1 bar starts with archer_basic', bar1.lmb === 'archer_basic', JSON.stringify(bar1));
  ok('kit.hunter.l1 level-1 bar has at least three skills at unlock 1', usable.length >= 3, usable.map(([s, id]) => `${s}=${id}`).join(' '));
  ok('kit.hunter.l1 level-1 bar has aimed shot on rmb', bar1.rmb === 'archer_aimed_shot');
}

// ---- kit.hunter.focus: costs and gains from the rows; Focus is the class resource with regen 8/s
{
  ok('kit.hunter.focus resource is focus with 8 regen', CLASSES.archer.resource === 'focus' && CLASSES.archer.baseStats.resourceRegen === 8);
  const costs = {
    archer_aimed_shot: 25, archer_disengage: 10, archer_multishot: 30, archer_call_pet: 0,
    archer_snare_trap: 20, archer_explosive_arrow: 35, archer_hunters_mark: 0, archer_arrow_storm: 40,
  };
  const bad = Object.entries(costs).filter(([id, c]) => SKILLS[id]?.cost !== c).map(([id]) => id);
  ok('kit.hunter.focus core costs match GDD §3.4', bad.length === 0, bad.join(','));
  const gains = [1, 2, 3, 4].map((i) => SKILLS[`archer_basic_${i}`]?.params?.gain ?? 0);
  const chainGain = gains.reduce((a, b) => a + b, 0) + (SKILLS.archer_basic_2?.params?.gainExtra ?? 0);
  ok('kit.hunter.focus the basic chain gains 22-24 Focus', chainGain >= 22 && chainGain <= 24, `gains=${gains.join('/')} total=${chainGain}`);
  ok('kit.hunter.focus Seri Ateş costs 30 and channels 2.2 s', SKILLS.archer_rapid_fire?.cost === 30 && SKILLS.archer_rapid_fire?.channel === 2.2);
  ok('kit.hunter.focus Av Emri costs 30 and Zehirli Ok 20', SKILLS.archer_kill_command?.cost === 30 && SKILLS.archer_serpent_sting?.cost === 20);
  ok('kit.hunter.focus Son Atış costs 25', SKILLS.archer_kill_shot?.cost === 25);
  ok('kit.hunter.focus Yırtıcı Vuruş costs 20 and Yangın Bombası 25', SKILLS.archer_sv_raptor_strike?.cost === 20 && SKILLS.archer_sv_wildfire_bomb?.cost === 25);

  const p = H.addPlayer('archer', 1);
  p.yaw = 0; p.position.set(0, 0, 0); p.resource = 100; p.hp = p.maxHp;
  G.character.save.skillBar.rmb = 'archer_aimed_shot';
  const e = H.addEnemy(0, 6, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  p.resource = 100;
  H.setAimTarget(e);
  H.clearEvents();
  H.tap('rmb');
  H.stepSec(0.35);
  ok('kit.hunter.focus Nişanlı Atış pays 25 Focus when the draw starts', p.resource < 80 && p.resource > 70, `resource=${p.resource.toFixed(1)}`);
  H.stepSec(2.5);
}

// ---- kit.hunter.minions: the wolf and the pack wolves, their groups and caps; summon rows resolve
{
  const wolf = MINION_DEFS.archer_wolf;
  const ally = MINION_DEFS.archer_wolf_ally;
  ok('kit.hunter.minions archer_wolf is the pet (group pet, respawn 10 s)', !!wolf && wolf.group === 'pet' && wolf.respawn?.dead === 10 && wolf.ownerClass === 'archer');
  ok('kit.hunter.minions archer_wolf_ally is the pack (group pack, life 20 s)', !!ally && ally.group === 'pack' && ally.life === 20 && ally.ownerClass === 'archer');
  ok('kit.hunter.minions group caps: pet 1, pack 2', MINION_GROUP_CAPS.pet === 1 && MINION_GROUP_CAPS.pack === 2);
  ok('kit.hunter.minions the wolf has a bite and a lunge', !!wolf && wolf.attacks.map((a) => a.anim).includes('Bite') && wolf.attacks.some((a) => a.kind === 'leap'));
  const rows = Object.values(SKILLS).filter((s) => s.classId === 'archer' && s.minion);
  const missing = rows.filter((s) => !MINION_DEFS[s.minion.id]).map((s) => `${s.id}:${s.minion.id}`);
  ok('kit.hunter.minions every archer summon row resolves to a minion def', rows.length >= 2 && missing.length === 0, missing.join(','));
}

// ---- kit.hunter.refs: statuses, route status forms, vfx and sfx ids of the archer rows exist
{
  const rows = Object.values(SKILLS).filter((s) => s.classId === 'archer');
  const statusRefs = new Set();
  for (const s of rows) {
    for (const st of [...(s.statuses ?? []), ...(s.selfStatuses ?? [])]) statusRefs.add(st.status);
    for (const f of s.route?.from ?? []) if (f.startsWith('@status:')) statusRefs.add(f.slice(8));
    for (const m of s.replaces ? [s.replaces.whileStatus] : []) statusRefs.add(m);
  }
  const badStatus = [...statusRefs].filter((id) => !STATUSES[id]);
  ok('kit.hunter.refs archer status ids have StatusDefs', badStatus.length === 0, badStatus.join(','));
  const badVfx = rows.flatMap((s) => Object.values(s.vfx ?? {})).filter((v) => !VFX_IDS.includes(v));
  ok('kit.hunter.refs archer vfx ids exist', badVfx.length === 0, [...new Set(badVfx)].join(','));
  const badSfx = rows.flatMap((s) => Object.values(s.sfx ?? {})).filter((v) => !SFX_IDS.includes(v));
  ok('kit.hunter.refs archer sfx ids exist', badSfx.length === 0, [...new Set(badSfx)].join(','));
  ok('kit.hunter.refs rows of the three specs carry classId archer', rows.some((s) => s.spec === 'archer_survival') && rows.some((s) => s.spec === 'archer_beastmaster') && rows.some((s) => s.spec === 'archer_marksman'));
}

// ---- kit.hunter.routes: route rows of the GDD §1.4 table (status forms where the engine reads them)
{
  ok('kit.hunter.routes Geri Sıçrayış gives quick_draw; Nişanlı Atış reads it (full draw)',
    SKILLS.archer_disengage?.selfStatuses?.some((s) => s.status === 'quick_draw') && SKILLS.archer_aimed_shot?.behavior === 'archer_charge_shot');
  const ex = SKILLS.archer_explosive_arrow?.route;
  ok('kit.hunter.routes Tuzak -> Patlayıcı Ok: +35 % on a rooted target', !!ex && ex.from.includes('@status:root') && ex.more === 0.35);
  const ks = SKILLS.archer_kill_shot?.route;
  ok('kit.hunter.routes Avcı İşareti -> Son Atış: +25 % while marked', !!ks && ks.from.includes('@status:hunters_mark') && ks.more === 0.25);
}

// ---- kit.hunter.casts: real casts in the sim world
{
  // Nişancı: Avcı İşareti marks the target; Keskin Nişan gives three stacks; Seri Ateş fires a stream
  const p = H.addPlayer('archer', 25);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  const e = H.addEnemy(0, 8, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  const aim = H.aimFor(p, e);
  H.setAimTarget(e);
  const marked = G.skills.tryCast(p, 'archer_hunters_mark', aim, 'r');
  H.stepSec(2.0);
  ok('kit.hunter.casts Avcı İşareti marks the target for 12 s', marked === true && e.statuses.has('hunters_mark'), `tryCast=${marked}`);

  p.resource = 100;
  const deadeye = G.skills.tryCast(p, 'archer_ms_deadeye', aim, 'm45');
  H.stepSec(2.0);
  ok('kit.hunter.casts Keskin Nişan grants three deadeye stacks', deadeye === true && p.statuses.stacks('deadeye') === 3, `stacks=${p.statuses.stacks('deadeye')}`);

  // Seri Ateş is a channel: the key is held (the release ends it), so the stream runs for the whole 2.2 s
  G.character.save.skillBar.s1 = 'archer_rapid_fire';
  p.resource = 100;
  H.clearEvents();
  errors.length = 0;
  H.press('s1');
  H.stepSec(2.6);
  H.release('s1');
  H.stepSec(0.5);
  const hits = events['damage'].filter((d) => d.skillId === 'archer_rapid_fire' && d.amount > 0).length;
  ok('kit.hunter.casts Seri Ateş fires a stream of arrows while held', hits >= 8, `hits=${hits}`);
  if (errors.length) for (const m of errors.slice(0, 3)) console.log('   !!', String(m).slice(0, 300));
}

{
  // Nişanlı Atış: hold the draw for a full charge; the arrow leaves on release
  const p = H.addPlayer('archer', 1);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  const e = H.addEnemy(0, 6, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  G.character.save.skillBar.rmb = 'archer_aimed_shot';
  H.setAimTarget(e);
  H.clearEvents();
  H.press('rmb');
  H.stepSec(1.4);
  H.release('rmb');
  H.stepSec(0.8);
  const shots = events['damage'].filter((d) => d.skillId === 'archer_aimed_shot' && d.amount > 0);
  ok('kit.hunter.casts Nişanlı Atış fires one arrow on release', shots.length >= 1, `shots=${shots.length}`);
  const big = shots.length ? Math.max(...shots.map((d) => d.amount)) : 0;
  p.resource = 100;
  H.clearEvents();
  H.press('rmb');
  H.stepSec(0.5);
  H.release('rmb');
  H.stepSec(0.8);
  const quick = events['damage'].filter((d) => d.skillId === 'archer_aimed_shot' && d.amount > 0);
  const short = quick.length ? Math.max(...quick.map((d) => d.amount)) : 0;
  ok('kit.hunter.casts a full draw hits harder than a quick release', big > short && short > 0, `full=${big.toFixed(0)} quick=${short.toFixed(0)}`);
}

{
  // Geri Sıçrayış: a backward hop with quick_draw; the position moves away from the aim
  const p = H.addPlayer('archer', 10);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  H.step(2);
  const z0 = p.position.z;
  const started = G.skills.tryCast(p, 'archer_disengage', { point: [0, 0, 6], dir: [0, 0, 1], targetId: null, allyId: null }, 'q');
  H.stepSec(0.8);
  ok('kit.hunter.casts Geri Sıçrayış hops backwards and grants quick_draw', started === true && p.position.z < z0 - 2 && p.statuses.has('quick_draw'),
    `tryCast=${started} dz=${(p.position.z - z0).toFixed(2)}`);
}

{
  // Pençe Tuzağı: arms, then roots the enemy that stands in its radius
  const p = H.addPlayer('archer', 15);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  const e = H.addEnemy(0, 4, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  const started = G.skills.tryCast(p, 'archer_snare_trap', { point: [0, 0, 4], dir: [0, 0, 1], targetId: null, allyId: null }, 's2');
  H.stepSec(3.0);
  ok('kit.hunter.casts Pençe Tuzağı arms and roots the enemy in its radius', started === true && e.statuses.has('root'), `tryCast=${started}`);
}

{
  // Av Emri: no pet = no cost; with a pet (Yoldaş Çağır) the wolf bites
  const p = H.addPlayer('archer', 10);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  const e = H.addEnemy(0, 3, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  H.setAimTarget(e);
  const aim = H.aimFor(p, e);
  const r0 = p.resource;
  G.skills.tryCast(p, 'archer_kill_command', aim, 'e');
  H.stepSec(0.6);
  ok('kit.hunter.casts Av Emri without a pet costs nothing', p.resource >= r0 - 0.5, `resource ${r0} -> ${p.resource.toFixed(1)}`);

  const summoned = G.skills.tryCast(p, 'archer_call_pet', aim, 's1');
  H.stepSec(1.5);
  const pets = G.minions.ownedBy(p.id, (m) => m.def.group === 'pet');
  ok('kit.hunter.casts Yoldaş Çağır summons one wolf', summoned === true && pets.length === 1, `pets=${pets.length}`);
  const hp0 = e.hp;
  G.skills.tryCast(p, 'archer_kill_command', aim, 'e');
  H.stepSec(1.5);
  ok('kit.hunter.casts Av Emri makes the wolf strike the target', e.hp < hp0 && e.statuses.has('bleed'), `hp ${hp0} -> ${e.hp}`);

  // a healthy pet goes back to the pack on the second Yoldaş Çağır (after the 6 s cooldown)
  H.stepSec(6.5);
  G.skills.tryCast(p, 'archer_call_pet', aim, 's1');
  H.stepSec(0.6);
  ok('kit.hunter.casts Yoldaş Çağır on a healthy pet dismisses it', G.minions.ownedBy(p.id, (m) => m.def.group === 'pet').length === 0);
}

{
  // Av Ustası: Vahşi Gazap (self and the pack) and Av Sürüsü (two pack wolves)
  const p = H.addPlayer('archer', 20);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  const e = H.addEnemy(0, 5, { hp: 1e9 });
  e.maxHp = 1e9; e.hp = 1e9;
  H.step(2);
  const aim = H.aimFor(p, e);
  const wrath = G.skills.tryCast(p, 'archer_bm_bestial_wrath', aim, 'm45');
  H.stepSec(0.6);
  ok('kit.hunter.casts Vahşi Gazap grants wild_wrath to the caster', wrath === true && p.statuses.has('wild_wrath'));
  H.stepSec(2.0);
  const pack = G.skills.tryCast(p, 'archer_bm_pack_hunt', aim, 'm90');
  H.stepSec(2.0);
  const wolves = G.minions.ownedBy(p.id, (m) => m.def.group === 'pack');
  ok('kit.hunter.casts Av Sürüsü summons two pack wolves', pack === true && wolves.length === 2, `pack=${wolves.length}`);
}

{
  // Hayatta Kalma: Son Siper grants survivor_ward; Yangın Bombası burns the target area
  const p = H.addPlayer('archer', 20);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  H.step(2);
  const ward = G.skills.tryCast(p, 'archer_sv_last_stand', { point: [0, 0, 0], dir: [0, 0, 1], targetId: null, allyId: null }, 'm90');
  H.stepSec(0.6);
  ok('kit.hunter.casts Son Siper grants survivor_ward', ward === true && p.statuses.has('survivor_ward'));
}

console.log(fails === 0 ? '\nkit.hunter: all checks PASS' : `\nkit.hunter: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
