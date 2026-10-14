#!/usr/bin/env node
/**
 * Quest objective types headless check (WoW-style variety, data/world/quests_variety.ts + systems/Quests.ts).
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/questtypes.mjs     (V=1 prints every PASS)
 * Stages: cat.*    the converted levelling quests and bonus quests of the real content (ids, kinds, drop sources, elite ranks, share)
 *         drop.*   kind 'drop': chance per matching kill, `from` filter (id or family), swarm scaling, bag progress, turn-in consumes
 *         elite.*  kind 'elite': named id and rank above trash
 *         int.*    kind 'interact' (onEvent) progresses and completes
 *         use.*    kind 'use' (useItem): one item consumed per use, target filter, completes at count
 *         esc.*    kind 'escort' (tickEscort): seconds accrue while alive, a fall resets the timer, completes at count
 *         bonus.*  progressPct over mixed objectives; the real Sisli bonus quest end to end
 * No browser, no network. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const Q = await H.imp('systems/Quests.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { QUESTS } = await H.imp('data/world/quests.ts');
const { VARIETY, BONUS_QUESTS } = await H.imp('data/world/quests_variety.ts');
const { ENEMIES, BOSSES } = await H.imp('data/enemies.ts');
const { MATERIALS } = await H.imp('data/materials.ts');
const { G } = H;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const KINDS = ['talk', 'kill', 'collect', 'skill', 'boss', 'metin', 'dungeon', 'explore', 'elite', 'drop', 'interact', 'use', 'escort'];
const enemy = (id) => ENEMIES[id] ?? BOSSES[id];

// ------------------------------------------------------------------------------------------------ cat.* (real content)
{
  const byId = new Map(QUESTS.map((q) => [q.id, q]));
  ok('cat.variety-ids', Object.keys(VARIETY).every((id) => byId.has(id) && !byId.get(id).daily), 'every VARIETY id is a non-daily quest');
  ok('cat.kinds-known', QUESTS.every((q) => q.objectives.every((o) => KINDS.includes(o.kind))));
  const drops = QUESTS.flatMap((q) => q.objectives.filter((o) => o.kind === 'drop'));
  ok('cat.drop-items', drops.length > 0 && drops.every((o) => MATERIALS[o.target]?.kind === 'quest'), `${drops.length} drop objectives, targets are quest materials`);
  ok('cat.drop-from', drops.every((o) => o.from?.length && o.from.every((id) => enemy(id))), 'every drop source is a known enemy');
  ok('cat.drop-chance', drops.every((o) => o.chance > 0 && o.chance <= 1));
  const elites = QUESTS.flatMap((q) => q.objectives.filter((o) => o.kind === 'elite'));
  ok('cat.elite-rank', elites.length >= 3 && elites.every((o) => o.count === 1 && ['elite', 'miniboss', 'boss'].includes(enemy(o.target)?.rank)), `${elites.length} named elites, none trash`);
  ok('cat.bonus-count', BONUS_QUESTS.length === 3 && BONUS_QUESTS.every((d) => d.bonus && byId.get(d.id) === d));
  ok('cat.bonus-mixed', BONUS_QUESTS.every((d) => new Set(d.objectives.map((o) => o.kind)).size >= 3), 'kill + drop + elite');
  ok('cat.bonus-regions', BONUS_QUESTS.every((d) => /^r[1-3]$/.test(d.region) && d.place));
  // share of the levelling pool (Sisli Vadi, level 1-15, non-daily, zone regions r1-r4, main and side chains)
  const pool = QUESTS.filter((q) => q.level <= 15 && !q.daily && /^(mq_|sq_)/.test(q.id) && (!q.region || /^r[1-4]$/.test(q.region)));
  const conv = pool.filter((q) => VARIETY[q.id]);
  const share = conv.length / pool.length;
  ok('cat.share', share >= 0.28,`${conv.length} of ${pool.length} levelling quests = ${(share * 100).toFixed(1)} % (target ~30 %)`);
  ok('cat.first-chain-kept', !Object.keys(VARIETY).some((id) => /^mq_0[1-6]_/.test(id)), 'mq_01..06 keep their objectives (pace-check path)');
}

// ------------------------------------------------------------------------------------------------ runtime setup
const T = (id, level, objectives, extra = {}) => ({ id, name: id, level, giver: 'npc_test', objectives, reward: { xpPct: 0 }, text: { offer: '', progress: '', done: '' }, ...extra });
G.character = CharacterState.create('Sim', 'knight');
G.player = { id: 42, position: [0, 0, 0] };
G.net = { isOnline: false };
G.progression ??= { xpToNext: () => 100, addXp() {} };
G.loot ??= { rollItem() { return null; }, dropItem() {} };
const qs = new Q.QuestSystem();
G.quests = qs;
const ch = G.character;
const drop = (target, count, from, chance) => ({ kind: 'drop', target, count, from, chance, text: 'd' });
/** What LootSystem does with rollDrops() results. */
const addDrops = (list) => { for (const d of list) ch.addMaterial(d.id, d.count); };

// ------------------------------------------------------------------------------------------------ drop.*
{
  qs.registerDefs([T('t_drop', 1, [drop('item_kurt_postu', 2, ['ow_wolf'], 1)])]);
  ok('drop.accept', qs.accept('t_drop'));
  ok('drop.other-kill', qs.rollDrops({ enemyId: 'ow_boar', rank: 'trash' }).length === 0, 'a boar is not in from');
  const got = qs.rollDrops({ enemyId: 'ow_wolf', rank: 'trash' });
  ok('drop.from-roll', got.length === 1 && got[0].id === 'item_kurt_postu' && got[0].count === 1, JSON.stringify(got));
  addDrops(got);
  ok('drop.progress', qs.progressRows('t_drop')[0].have === 1 && qs.state('t_drop') === 'active');
  addDrops(qs.rollDrops({ enemyId: 'ow_wolf', rank: 'trash' }));
  ok('drop.ready', qs.state('t_drop') === 'ready' && qs.progressRows('t_drop')[0].done);
  ok('drop.turn-in', qs.turnIn('t_drop') && qs.state('t_drop') === 'done');
  ok('drop.turn-in-consumes', ch.material('item_kurt_postu') === 0, `bag ${ch.material('item_kurt_postu')}`);

  // family matching: LootSystem passes the family of the killed def (ow_wolf_dire belongs to family ow_wolf)
  qs.registerDefs([T('t_drop_fam', 1, [drop('item_kurt_postu', 1, ['ow_wolf'], 1)])]);
  qs.accept('t_drop_fam');
  ok('drop.family', qs.rollDrops({ enemyId: 'ow_wolf_dire', family: 'ow_wolf', rank: 'elite' }).length === 1);
  ok('drop.family-other', qs.rollDrops({ enemyId: 'ow_bear', family: 'ow_bear', rank: 'trash' }).length === 0);
  addDrops([{ id: 'item_kurt_postu', count: 1 }]); // the family quest is ready; it stays out of the next stages (own item)
}
{
  // rates: chance 0.6 over 2000 kills; chance 0 never (own item); swarm scales the chance by 0.15 / 0.4
  qs.registerDefs([
    T('t_rate', 1, [drop('item_puglin_disi', 1000000, ['ow_puglin'], 0.6)]),
    T('t_zero', 1, [drop('item_tarikat_muhru', 1000000, ['ow_puglin'], 0)]),
  ]);
  qs.accept('t_rate');
  qs.accept('t_zero');
  let hits = 0;
  let zeros = 0;
  for (let i = 0; i < 2000; i++) {
    for (const d of qs.rollDrops({ enemyId: 'ow_puglin', rank: 'trash' })) {
      if (d.id === 'item_puglin_disi') hits++;
      if (d.id === 'item_tarikat_muhru') zeros++;
    }
  }
  ok('drop.rate-0.6', Math.abs(hits / 2000 - 0.6) < 0.04, `${(hits / 2000).toFixed(3)} per kill`);
  ok('drop.zero-chance', zeros === 0);
  let swarm = 0;
  for (let i = 0; i < 4000; i++) {
    for (const d of qs.rollDrops({ enemyId: 'ow_puglin', rank: 'trash', swarm: true })) if (d.id === 'item_puglin_disi') swarm++;
  }
  ok('drop.swarm-scale', Math.abs(swarm / 4000 - 0.6 * (0.15 / 0.4)) < 0.03, `${(swarm / 4000).toFixed(3)} per swarm kill`);
  G.character.save.flags['q.t_rate'] = 'done';
  G.character.save.flags['q.t_zero'] = 'done';
}

// ------------------------------------------------------------------------------------------------ elite.*
{
  qs.registerDefs([T('t_elite', 1, [{ kind: 'elite', target: 'rare_gumus_yele', count: 1, text: 'e' }, { kind: 'kill', target: 'ow_wolf', count: 2, text: 'k' }])]);
  qs.accept('t_elite');
  qs.onKill({ enemyId: 'rare_gumus_yele', rank: 'trash' });
  ok('elite.trash-rank', qs.progressRows('t_elite')[0].have === 0, 'a trash mob with the elite id does not count');
  qs.onKill({ enemyId: 'ow_wolf', rank: 'trash' });
  ok('elite.kill-row', qs.progressRows('t_elite')[1].have === 1 && qs.progressRows('t_elite')[0].have === 0);
  qs.onKill({ enemyId: 'rare_gumus_yele', rank: 'elite' });
  ok('elite.named-kill', qs.progressRows('t_elite')[0].have === 1 && qs.state('t_elite') === 'active');
  qs.onKill({ enemyId: 'ow_wolf', rank: 'trash' });
  ok('elite.ready', qs.state('t_elite') === 'ready');
  qs.registerDefs([T('t_elite_no_id', 1, [{ kind: 'elite', count: 1, text: 'e' }])]);
  qs.accept('t_elite_no_id');
  qs.onKill({ enemyId: 'rare_gumus_yele', rank: 'elite' });
  ok('elite.needs-id', qs.progressRows('t_elite_no_id')[0].have === 0, 'an elite objective without a target never matches');
}

// ------------------------------------------------------------------------------------------------ int.*
{
  qs.registerDefs([T('t_int', 1, [{ kind: 'interact', target: 'prop_sack', count: 3, text: 'i' }])]);
  qs.accept('t_int');
  qs.onEvent('interact', 'prop_crate');
  ok('int.other-object', qs.progressRows('t_int')[0].have === 0);
  qs.onEvent('interact', 'prop_sack');
  qs.onEvent('interact', 'prop_sack');
  ok('int.progress', qs.progressRows('t_int')[0].have === 2 && qs.state('t_int') === 'active');
  qs.onEvent('interact', 'prop_sack');
  ok('int.complete', qs.state('t_int') === 'ready');
  ok('int.turn-in', qs.turnIn('t_int'));
}

// ------------------------------------------------------------------------------------------------ use.*
{
  qs.registerDefs([T('t_use', 1, [{ kind: 'use', item: 'item_cadi_otu', target: 'prop_altar', count: 2, text: 'u' }])]);
  qs.accept('t_use');
  ok('use.no-item', !qs.useItem('item_cadi_otu', 'prop_altar'), 'nothing in the bag');
  ch.addMaterial('item_cadi_otu', 3);
  ok('use.wrong-target', !qs.useItem('item_cadi_otu', 'prop_well') && ch.material('item_cadi_otu') === 3);
  ok('use.first', qs.useItem('item_cadi_otu', 'prop_altar') && ch.material('item_cadi_otu') === 2 && qs.progressRows('t_use')[0].have === 1);
  ok('use.second-ready', qs.useItem('item_cadi_otu', 'prop_altar') && qs.state('t_use') === 'ready' && ch.material('item_cadi_otu') === 1);
  ok('use.done-no-more', !qs.useItem('item_cadi_otu', 'prop_altar') && ch.material('item_cadi_otu') === 1, 'a completed objective takes no more items');
  ch.useMaterial('item_cadi_otu', 1);
}

// ------------------------------------------------------------------------------------------------ esc.*
{
  qs.registerDefs([T('t_esc', 1, [{ kind: 'escort', count: 60, text: 'x' }])]);
  qs.accept('t_esc');
  qs.tickEscort(20, true);
  qs.tickEscort(20, true);
  ok('esc.accrue', qs.progressRows('t_esc')[0].have === 40 && qs.state('t_esc') === 'active');
  qs.tickEscort(20, false);
  ok('esc.fall-resets', qs.progressRows('t_esc')[0].have === 0 && qs.state('t_esc') === 'active', 'the quest stays active');
  qs.tickEscort(30, true);
  qs.tickEscort(30, true);
  ok('esc.complete', qs.state('t_esc') === 'ready' && qs.progressRows('t_esc')[0].done);
}

// ------------------------------------------------------------------------------------------------ bonus.*
{
  qs.registerDefs([T('t_bonus', 1, [
    { kind: 'kill', target: 'ow_wolf', count: 2, text: 'k' },
    drop('item_tarikat_muhru', 2, ['ow_wolf'], 1),
    { kind: 'elite', target: 'rare_gumus_yele', count: 1, text: 'e' },
  ], { bonus: true })]);
  qs.accept('t_bonus');
  ok('bonus.start', qs.progressPct('t_bonus') === 0);
  qs.onKill({ enemyId: 'ow_wolf', rank: 'trash' });
  addDrops(qs.rollDrops({ enemyId: 'ow_wolf', rank: 'trash' }));
  ok('bonus.mixed-third', qs.progressPct('t_bonus') === 33, `${qs.progressPct('t_bonus')} %`);
  qs.onKill({ enemyId: 'ow_wolf', rank: 'trash' });
  addDrops(qs.rollDrops({ enemyId: 'ow_wolf', rank: 'trash' }));
  qs.onKill({ enemyId: 'rare_gumus_yele', rank: 'elite' });
  ok('bonus.complete', qs.state('t_bonus') === 'ready' && qs.progressPct('t_bonus') === 100, `${qs.progressPct('t_bonus')} %`);
}

// ------------------------------------------------------------------------------------------------ real Sisli bonus quest, end to end
{
  const bd = BONUS_QUESTS[0];
  ch.save.level = bd.level;
  ok('real.bonus-accept', qs.accept(bd.id) && qs.state(bd.id) === 'active', bd.id);
  for (let i = 0; i < 6; i++) qs.onKill({ enemyId: 'ow_goblin', rank: 'trash' });
  let rolls = 0;
  while (ch.material('item_goblin_kulagi') < 4 && rolls < 5000) {
    rolls++;
    addDrops(qs.rollDrops({ enemyId: 'ow_goblin', rank: 'trash' }));
  }
  ok('real.bonus-drops', ch.material('item_goblin_kulagi') === 4, `${rolls} goblin kills to 4 ears`);
  ok('real.bonus-pct-two-thirds', qs.progressPct(bd.id) === 67, `${qs.progressPct(bd.id)} %`);
  qs.onKill({ enemyId: 'rare_kizil_kuyruk', rank: 'elite' });
  ok('real.bonus-ready', qs.state(bd.id) === 'ready' && qs.progressPct(bd.id) === 100);
  const before = ch.material('pot_hp_1');
  ok('real.bonus-turn-in', qs.turnIn(bd.id) && qs.state(bd.id) === 'done' && ch.material('item_goblin_kulagi') === 0);
  ok('real.bonus-reward', ch.material('pot_hp_1') === before + 2, `pot_hp_1 ${before} -> ${ch.material('pot_hp_1')}`);
}

console.log(`questtypes: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
