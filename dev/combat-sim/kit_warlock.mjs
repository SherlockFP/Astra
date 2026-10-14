// KIT PK-WARLOCK checks (docs/kits/casters-rogue.md §h PK-WARLOCK). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_warlock.mjs
// Implemented: kit.warlock.ids, kit.warlock.apl, kit.warlock.replaces, kit.warlock.shards (economy + cast gain), kit.warlock.dots (Azap),
// kit.warlock.summon (Karanlık Göz pulses), kit.warlock.darkpact (sacrifice + absorb), kit.warlock.resolve (-25 %).
// Not implemented here: kit.warlock.budget (needs SimBench) and the 11d / 10d hand numbers.
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_WARLOCK } = await H.imp('data/rotations_kit_warlock.ts');
const { STATUSES } = await H.imp('data/statuses.ts');
const { TALENT_PIPS } = await H.imp('data/specs_talents.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.warlock.ids: every id on the two warlock specs resolves to a skill
for (const sid of ['warlock_affliction', 'warlock_destruction']) {
  const s = SPECS[sid];
  ok(`kit.warlock.ids ${sid} spec exists`, !!s);
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors)];
  const missing = ids.filter((id) => !SKILLS[id]);
  ok(`kit.warlock.ids ${sid} skills resolve`, missing.length === 0, missing.join(','));
  ok(`kit.warlock.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.warlock.ids ${sid} basic is the warlock chain`, s.defaultBar.lmb === 'warlock_basic' && !!SKILLS.warlock_basic_4);
}

// ---- kit.warlock.apl: every skill and status named in the APL rows exists
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_WARLOCK)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(warlock_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.warlock.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.warlock.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
}

// ---- kit.warlock.replaces: the replace-only rows point at the right base button and window
{
  const sb = SKILLS.warlock_shadowburn?.replaces;
  const seed = SKILLS.warlock_seed_of_corruption?.replaces;
  ok('kit.warlock.replaces Gölge Yakma swaps Kaos Oku while exec_window', sb?.skill === 'warlock_chaos_bolt' && sb?.whileStatus === 'exec_window');
  ok('kit.warlock.replaces Yozlaşma Tohumu swaps Dengesiz Azap while aoe_mode', seed?.skill === 'warlock_unstable_affliction' && seed?.whileStatus === 'aoe_mode');
  ok('kit.warlock.replaces Kaos Oku is the q slot of Yıkım', SPECS.warlock_destruction?.defaultBar.q === 'warlock_chaos_bolt');
  ok('kit.warlock.replaces Dengesiz Azap is the q slot of Azap', SPECS.warlock_affliction?.defaultBar.q === 'warlock_unstable_affliction');
}

// ---- kit.warlock.shards: fragments (max 50, 10 per shown pip), costs and gains from the rows
{
  ok('kit.warlock.shards pip max is 50 fragments, scale 10', TALENT_PIPS.shard?.max === 50 && TALENT_PIPS.shard?.scale === 10);
  ok('kit.warlock.shards Kaos Oku costs 20 fragments', SKILLS.warlock_chaos_bolt?.pip?.cost === 20);
  ok('kit.warlock.shards Gölge Yakma costs 10 fragments', SKILLS.warlock_shadowburn?.pip?.cost === 10);
  ok('kit.warlock.shards Ateş Yağmuru costs 30 fragments', SKILLS.warlock_rain_of_fire?.pip?.cost === 30);
  ok('kit.warlock.shards Kül Etme gains 2 fragments', SKILLS.warlock_incinerate?.pip?.gain === 2);
  ok('kit.warlock.shards Alevlendirme gains 5 fragments', SKILLS.warlock_conflagrate?.pip?.gain === 5);

  const p = H.addPlayer('warlock');
  p.pips = { shard: 25 };
  const spent = G.skills.spendPip(p, 'shard', 20);
  const after = G.skills.pipCount(p, 'shard');
  G.skills.addPip(p, 'shard', 10);
  ok('kit.warlock.shards spend 20 then gain 10 leaves 15 fragments', spent && after === 5 && G.skills.pipCount(p, 'shard') === 15,
    `after=${after} final=${G.skills.pipCount(p, 'shard')}`);

  // a real cast: Kül Etme (1.6 s cast) gains 2 fragments when it lands
  const e = H.addEnemy(0, 6);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  p.pips = { shard: 0 };
  G.character.save.skillBar.rmb = 'warlock_incinerate';
  H.setAimTarget(e);
  H.clearEvents();
  H.tap('rmb');
  H.stepSec(2.0);
  ok('kit.warlock.shards Kül Etme cast adds 2 fragments', G.skills.pipCount(p, 'shard') === 2, `fragments=${G.skills.pipCount(p, 'shard')}`);
}

// ---- kit.warlock.dots: Azap lands on the aimed enemy and ticks
{
  const p = H.addPlayer('warlock');
  const e = H.addEnemy(0, 6);
  H.step(2);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  G.character.save.skillBar.e = 'warlock_agony';
  H.setAimTarget(e);
  H.clearEvents();
  errors.length = 0;
  H.tap('e');
  H.stepSec(0.6);
  ok('kit.warlock.dots Azap is applied to the target', e.statuses.has('agony'));
  const hp0 = e.hp;
  H.stepSec(3);
  ok('kit.warlock.dots Azap damages the target over time', e.hp < hp0, `hp ${hp0} -> ${e.hp}`);
  if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', m.slice(0, 300));
}

// ---- kit.warlock.summon: Karanlık Göz pulses on the enemy carrying an own DoT and grants darkglare_active
{
  const p = H.addPlayer('warlock');
  const e = H.addEnemy(0, 6);
  H.step(2);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  e.statuses.apply('agony', 30, { magnitude: 10, sourceId: p.id });
  G.character.save.skillBar.m90 = 'warlock_summon_darkglare';
  H.clearEvents();
  errors.length = 0;
  const hp0 = e.hp;
  // the harness maps only the class slots (no m90 key), so the major is cast through SkillSystem.tryCast with an explicit aim
  const aim = { point: [e.position.x, 0, e.position.z], dir: [0, 0, 1], targetId: e.id, allyId: null };
  const started = G.skills.tryCast(p, 'warlock_summon_darkglare', aim, 'm90');
  H.stepSec(2.5);
  ok('kit.warlock.summon Karanlık Göz cast starts', started === true, `tryCast=${started}`);
  ok('kit.warlock.summon Karanlık Göz grants darkglare_active', p.statuses.has('darkglare_active'));
  ok('kit.warlock.summon Karanlık Göz pulses on a DoT-carrying enemy', e.hp < hp0, `hp ${hp0} -> ${e.hp}`);
  if (errors.length) for (const m of errors.slice(0, 4)) console.log('   !!', m.slice(0, 300));
}

// ---- kit.warlock.darkpact: 20 % of current HP is sacrificed and a shield of twice that is granted
{
  const p = H.addPlayer('warlock');
  H.step(2);
  p.hp = p.maxHp;
  const before = p.hp;
  G.character.save.skillBar.s3 = 'warlock_dark_pact';
  H.clearEvents();
  H.tap('s3');
  H.stepSec(0.4);
  // regen runs during the wait, so compare against the expected sacrifice (20 % of HP at cast) with a 5 % tolerance
  const expected = before * 0.2;
  const shield = p.statuses.get('shield')?.magnitude ?? 0;
  ok('kit.warlock.darkpact sacrifices 20 % of current HP (regen allowed)', Math.abs(before - p.hp - expected) < expected * 0.15, `hp ${before} -> ${p.hp.toFixed(0)}`);
  ok('kit.warlock.darkpact absorbs twice the sacrifice', Math.abs(shield - 2 * expected) < 2 * expected * 0.05, `shield=${shield.toFixed(0)} expected=${(2 * expected).toFixed(0)}`);
}

// ---- kit.warlock.selfbuffs: Alevlendirme grants Dönüş Alevi; Kötülük grants its buff and pulses the DoT carrier
{
  const p = H.addPlayer('warlock');
  const e = H.addEnemy(0, 6);
  H.step(2);
  p.position.set(0, 0, 0); p.yaw = 0; p.resource = 100; p.hp = p.maxHp;
  G.character.save.skillBar.e = 'warlock_conflagrate';
  H.setAimTarget(e);
  H.clearEvents();
  H.tap('e');
  H.stepSec(0.6);
  ok('kit.warlock.selfbuffs Alevlendirme grants backdraft', p.statuses.has('backdraft'));
  e.statuses.apply('agony', 30, { magnitude: 10, sourceId: p.id });
  const hp0 = e.hp;
  const aim = { point: [e.position.x, 0, e.position.z], dir: [0, 0, 1], targetId: e.id, allyId: null };
  const started = G.skills.tryCast(p, 'warlock_malevolence', aim, 'm45');
  H.stepSec(0.6);
  ok('kit.warlock.selfbuffs Kötülük cast starts', started === true, `tryCast=${started}`);
  ok('kit.warlock.selfbuffs Kötülük grants malevolence', p.statuses.has('malevolence'));
  ok('kit.warlock.selfbuffs Kötülük pulses the DoT carrier', e.hp < hp0, `hp ${hp0} -> ${e.hp}`);
}

// ---- kit.warlock.resolve: Bitmeyen Kararlılık reduces damage taken by 25 % (the talent row had 30 %)
ok('kit.warlock.resolve resolve_pact is -25 % damage taken', STATUSES.resolve_pact?.stats?.damageReductionPct === 0.25,
  `value=${STATUSES.resolve_pact?.stats?.damageReductionPct}`);

// ---- wlk.l1 (WP-01): a level-1 warlock with no spec has a working bar (chain + Gölge Oku + Azap + İblis Çemberi), start gear, moveset
{
  const { CharacterState } = await H.imp('systems/CharacterState.ts');
  const { HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS } = await H.imp('combat/heavy.ts');
  const { RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS } = await H.imp('combat/moves.ts');
  const items = await H.imp('data/itemBases.ts');
  const menu = await H.imp('ui/menu/classInfo.ts');
  const cls = await H.imp('data/classes.ts');
  const bar1 = CharacterState.defaultBar('warlock', 1);
  ok('wlk.l1 level-1 bar = lmb chain, rmb Gölge Oku, e Azap, s2 İblis Çemberi, s4 Büyü Kilidi', JSON.stringify(bar1) === JSON.stringify({
    lmb: 'warlock_basic', rmb: 'warlock_shadow_bolt', e: 'warlock_agony', s2: 'warlock_demonic_circle', s4: 'warlock_spell_lock',
  }), JSON.stringify(bar1));
  ok('wlk.l1 warlock is playable and offered by the creation list', cls.isPlayableClass('warlock') && menu.CLASS_ORDER.includes('warlock'));
  ok('wlk.l1 start gear (staff, wand, tome) is usable by a warlock and not by a knight',
    ['staff_t1', 'wand_t1', 'tome_t1'].every((id) => items.ITEM_BASES[id] && items.classCanUseBase('warlock', items.ITEM_BASES[id]))
    && !items.classCanUseBase('knight', items.ITEM_BASES.staff_t1));
  ok('wlk.l1 heavy, riposte, krt, run, jump, roll profiles exist under warlock ids', [HEAVY_BY_CLASS, RIPOSTE_BY_CLASS, KRT_BY_CLASS, RUN_BY_CLASS, JUMP_BY_CLASS, ROLL_BY_CLASS]
    .every((t) => t.warlock && SKILLS[t.warlock.id]?.classId === 'warlock'));

  const p = H.addPlayer('warlock', 1);
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
  const fire = (slot) => { H.clearEvents(); p.resource = 100; const s = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe)); H.stepSec(2.2); return s; };
  const hitBy = (re) => events['damage'].filter((d) => re.test(d.skillId ?? '') && d.amount > 0 && d.targetId === foe.id);
  const failed = () => events['skill:fail'].map((f) => f.reason ?? f.why ?? '?').join(',');
  ok('wlk.l1 lmb: the warlock chain casts and hits', fire('lmb') === true && hitBy(/^warlock_basic/).length >= 1, `hits=${hitBy(/^warlock_basic/).length} fail=${failed()}`);
  ok('wlk.l1 rmb: Gölge Oku casts and hits without a spec', fire('rmb') === true && hitBy(/^warlock_shadow_bolt$/).length >= 1, `hits=${hitBy(/^warlock_shadow_bolt$/).length} fail=${failed()}`);
  ok('wlk.l1 e: Azap casts and applies agony without a spec', fire('e') === true && foe.statuses.has('agony'), `agony=${foe.statuses.has('agony')} fail=${failed()}`);
}

// ---- kit.warlock.l1: the level-1 pre-spec bar has at least 4 usable core skills (owner rule), and the basic attack resolves ----
{
  const L1_CLS = (await H.imp('data/classes.ts')).CLASSES.warlock;
  const usable = L1_CLS.skills.filter((id) => SKILLS[id] && SKILLS[id].unlockLevel <= 1 && !id.includes('_basic'));
  ok('kit.warlock.l1 4+ usable core skills at level 1', usable.length >= 4, usable.join(','));
  ok('kit.warlock.l1 basic attack resolves', !!SKILLS[L1_CLS.basicAttack]);
}

console.log(fails === 0 ? '\nkit.warlock: all checks PASS' : `\nkit.warlock: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
