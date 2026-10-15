#!/usr/bin/env node
/**
 * Quest objective types headless check (WoW-style variety, data/world/quests_variety.ts + systems/Quests.ts).
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/questtypes.mjs     (V=1 prints every PASS)
 * Stages: cat.*    the converted levelling quests and bonus quests of the real content (ids, kinds, drop sources, elite ranks, share)
 *         drop.*   kind 'drop': chance per matching kill, `from` filter (id or family), swarm at the same rate, bag progress, turn-in consumes
 *         collect.from.*  kind 'collect' with `from`: rolls from the listed enemies only, at the collect rate (no kill objective)
 *         elite.*  kind 'elite': named id and rank above trash
 *         int.*    kind 'interact' (onEvent) progresses and completes
 *         use.*    kind 'use' (useItem): one item consumed per use, target filter, completes at count
 *         esc.*    kind 'escort' (tickEscort): seconds accrue while alive, a fall resets the timer, completes at count
 *         bonus.*  progressPct over mixed objectives; the real Sisli bonus quest end to end
 *         arrow.*  kill / drop / collect objectives point at their layout camp with no enemy loaded (questMarks objectivePos)
 * No browser, no network. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const Q = await H.imp('systems/Quests.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { QUESTS } = await H.imp('data/world/quests.ts');
const { VARIETY, BONUS_QUESTS } = await H.imp('data/world/quests_variety.ts');
const { ENEMIES, BOSSES } = await H.imp('data/enemies.ts');
const { MATERIALS } = await H.imp('data/materials.ts');
const { QUEST_DROP_CHANCE } = await H.imp('types/quests.ts');
const { G } = H;
const { QuestProp, questPropKind, QUEST_PROP_RESPAWN_SEC } = await H.imp('entities/interactables/QuestProp.ts');
const { questPropSpots, escortPath } = await H.imp('scenes/world/WorldQuestProps.ts');
const { EscortRun } = await H.imp('scenes/world/QuestEscortRun.ts');

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
  // collect with a named source (`from`): no kill objective needed; rolls only from the listed enemies, at the collect rate (QUEST_DROP_CHANCE)
  qs.registerDefs([T('t_cfrom', 1, [{ kind: 'collect', target: 'item_geyik_derisi', count: 1000000, from: ['ow_wolf'], text: 'x' }])]);
  qs.accept('t_cfrom');
  const geyik = (list) => list.filter((d) => d.id === 'item_geyik_derisi').length;
  ok('collect.from-other', geyik(qs.rollDrops({ enemyId: 'ow_boar', rank: 'trash' })) === 0, 'a boar is not in from');
  let hits = 0;
  for (let i = 0; i < 2000; i++) hits += geyik(qs.rollDrops({ enemyId: 'ow_wolf', rank: 'trash' }));
  ok(`collect.from-rate-${QUEST_DROP_CHANCE}`, Math.abs(hits / 2000 - QUEST_DROP_CHANCE) < 0.04, `${(hits / 2000).toFixed(3)} per kill`);
}
{
  // rates: chance 0.6 over 2000 kills; chance 0 never (own item); swarm rolls the same chance (no scaling)
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
  ok('drop.swarm-same-rate', Math.abs(swarm / 4000 - 0.6) < 0.03, `${(swarm / 4000).toFixed(3)} per swarm kill`);
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
  ok('bonus.auto-complete', qs.state('t_bonus') === 'done', qs.state('t_bonus'));
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
  const before = ch.material('pot_hp_1');
  qs.onKill({ enemyId: 'rare_kizil_kuyruk', rank: 'elite' });
  ok('real.bonus-auto-complete', qs.state(bd.id) === 'done' && ch.material('item_goblin_kulagi') === 0, qs.state(bd.id));
  ok('real.bonus-reward', ch.material('pot_hp_1') === before + 2, `pot_hp_1 ${before} -> ${ch.material('pot_hp_1')}`);
}

// ------------------------------------------------------------------------------------------------ props: interact / altar call sites
{
  const p = { id: 42 };
  const interact = (target, count) => ({ kind: 'interact', target, count, text: 'i' });
  ok('prop.kind-map', questPropKind('qo_sack') === 'sack' && questPropKind('qo_crystal') === 'crystal' && questPropKind('qo_banner') === 'banner' && questPropKind('qt_x') === 'altar' && questPropKind('ow_rat') === null);
  const sack = new QuestProp(9001, { key: 'sim:sack:0', target: 'qo_sack', kind: 'sack' });
  await sack.load();
  ok('prop.is-interactable', sack.kind === 'interactable' && sack.propKind === 'sack' && typeof sack.interact === 'function');
  ok('prop.unrelated-prompt', sack.interactPrompt.includes('görevle ilgisi yok'));
  sack.interact(p);
  ok('prop.unrelated-no-flag', G.character.save.flags['qprop.sim:sack:0'] === undefined, 'no active quest wants it: nothing counted, no timer');
  ok('prop.hidden-unwanted', !sack.canInteract(p), 'PlayerController skips it');
  qs.registerDefs([T('t_sack', 1, [interact('qo_sack', 2)])]);
  qs.accept('t_sack');
  ok('prop.wants', qs.wants('interact', 'qo_sack') && sack.interactPrompt.includes('incele') && sack.canInteract(p));
  sack.interact(p);
  ok('prop.counts-once', qs.progressRows('t_sack')[0].have === 1);
  ok('prop.empty-after-use', sack.interactPrompt.includes('boş') && G.character.save.flags['qprop.sim:sack:0'] > Date.now());
  sack.interact(p);
  ok('prop.empty-no-count', qs.progressRows('t_sack')[0].have === 1);
  const realNow = Date.now;
  Date.now = () => realNow() + QUEST_PROP_RESPAWN_SEC * 1000 + 1;
  sack.update(0);
  Date.now = realNow;
  ok('prop.respawns', sack.interactPrompt.includes('incele'));
  const sack2 = new QuestProp(9002, { key: 'sim:sack:1', target: 'qo_sack', kind: 'sack' });
  await sack2.load();
  sack2.interact(p);
  ok('prop.second-completes', qs.state('t_sack') === 'ready');
  ok('prop.turn-in', qs.turnIn('t_sack') && !qs.wants('interact', 'qo_sack'));

  // altar: use of the quest item at the location; startItems on accept
  const altar = new QuestProp(9003, { key: 'sim:altar:0', target: 'qt_sim', kind: 'altar', item: 'item_mezar_tozu' });
  await altar.load();
  ok('use.prompt-missing', altar.interactPrompt.includes('gerekli'));
  qs.registerDefs([T('t_altar', 1, [{ kind: 'use', item: 'item_mezar_tozu', target: 'qt_sim', count: 2, text: 'u' }], { startItems: [{ id: 'item_mezar_tozu', count: 2 }] })]);
  ok('use.accept-start-items', qs.accept('t_altar') && ch.material('item_mezar_tozu') === 2);
  ok('use.prompt-have', altar.interactPrompt.includes('kullan'));
  altar.interact(p);
  ok('use.consumes-one', qs.progressRows('t_altar')[0].have === 1 && ch.material('item_mezar_tozu') === 1);
  altar.interact(p);
  ok('use.ready', qs.state('t_altar') === 'ready' && ch.material('item_mezar_tozu') === 0);
  altar.interact(p);
  ok('use.empty-no-progress', qs.progressRows('t_altar')[0].have === 2);
  qs.turnIn('t_altar');
  const wrong = new QuestProp(9004, { key: 'sim:altar:1', target: 'qt_other', kind: 'altar', item: 'item_mezar_tozu' });
  await wrong.load();
  qs.registerDefs([T('t_altar2', 1, [{ kind: 'use', item: 'item_mezar_tozu', target: 'qt_sim', count: 1, text: 'u' }], { startItems: [{ id: 'item_mezar_tozu', count: 1 }] })]);
  qs.accept('t_altar2');
  wrong.interact(p);
  ok('use.wrong-location', qs.progressRows('t_altar2')[0].have === 0 && ch.material('item_mezar_tozu') === 1);
  ch.useMaterial('item_mezar_tozu', 1);
  qs.turnIn('t_altar2');
}

// ------------------------------------------------------------------------------------------------ chain.* (real Sisli content)
// The first-hour QA's side chain: the Balçık Avı crystal objective (real def, real QuestProp.interact) and the Gözcü Avı escort gate.
{
  const p = { id: 42 };
  const PROP_Q = 'sq_r1_k02_balcik_avi';
  ch.save.level = 2;
  ok('chain.prop-available', qs.state(PROP_Q) === 'available', qs.state(PROP_Q));
  ok('chain.prop-accept', qs.accept(PROP_Q) && qs.state(PROP_Q) === 'active');
  const crystals = [0, 1, 2, 3].map((i) => new QuestProp(9100 + i, { key: `sim:crystal:${i}`, target: 'qo_crystal', kind: 'crystal' }));
  for (const c of crystals) await c.load();
  ok('chain.crystal-prompt', crystals[0].interactPrompt.includes('incele [F]'), crystals[0].interactPrompt);
  ok('chain.crystal-can-interact', crystals.every((c) => c.canInteract(p)));
  for (const c of crystals) c.interact(p);
  const row = qs.progressRows(PROP_Q)[0];
  ok('chain.crystals-count', row.have === 4 && row.need === 4 && row.done && qs.state(PROP_Q) === 'active', `${row.have}/${row.need} ${qs.state(PROP_Q)}`);

  // Gözcü Avı (level 3, prereq Muhtarın Haberi, giver Avcı Yıldız): locked by the prereq, then by the level, then offered
  const CH1 = 'sq_r1_ch01_muhtarin_haberi';
  const ESC = 'sq_r1_ch02_gozcu_avi';
  ch.save.level = 2;
  ok('chain.esc-prereq-id', qs.def(ESC)?.prereq?.[0] === CH1 && !!qs.def(CH1), JSON.stringify(qs.def(ESC)?.prereq));
  ok('chain.esc-locked-by-prereq', qs.state(ESC) === 'locked');
  ok('chain.ch1-accept', qs.accept(CH1));
  qs.onEvent('talk', 'npc_g_avci');
  ok('chain.ch1-ready', qs.state(CH1) === 'ready' && qs.turnIn(CH1));
  ok('chain.esc-open-at-lvl2', qs.state(ESC) === 'available', `at level 2: ${qs.state(ESC)}`);
  ch.save.level = 3;
  ok('chain.esc-offered-lvl3', qs.state(ESC) === 'available' && qs.accept(ESC) && qs.state(ESC) === 'active', qs.state(ESC));
  ch.save.level = 1;
}

// ------------------------------------------------------------------------------------------------ escort.run (state machine, fake deps)
{
  const log = { ticks: [], ambush: [], alive: 0, dist: 0 };
  const deps = {
    playerDist: () => log.dist,
    ambush: (x, z) => { log.ambush.push([x, z]); log.alive = 2; },
    ambushAlive: () => log.alive,
    tick: (s, alive) => log.ticks.push([s, alive]),
    done: () => log.ticks.filter((t) => t[1]).length >= 8,
  };
  const path = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 60, z: 0 }];
  const run = new EscortRun({ path, triggers: [1, 2], speed: 10, leash: 25, failSec: 3 }, deps);
  run.update(1);
  ok('esc.idle-no-move', run.state === 'idle' && run.pos.x === 0 && log.ticks.length === 0);
  ok('esc.start', run.start() && !run.start() && run.state === 'walking');
  run.update(1);
  ok('esc.walks-and-ticks', Math.abs(run.pos.x - 10) < 1e-9 && log.ticks.length === 1 && log.ticks[0][1] === true);
  run.update(2);
  ok('esc.ambush-at-trigger', run.state === 'ambush' && log.ambush.length === 1 && Math.abs(log.ambush[0][0] - 30) < 1e-9);
  run.update(1);
  ok('esc.waits-for-ambush', run.state === 'ambush' && log.ticks.length === 1 && run.pos.x === 30);
  log.alive = 0;
  run.update(1);
  ok('esc.resumes-after-kills', run.state === 'walking');
  let guard = 0;
  while (run.state !== 'done' && guard++ < 200) {
    if (log.alive) log.alive = 0;
    run.update(1);
  }
  ok('esc.completes', run.state === 'done' && log.ambush.length === 2, `ambushes ${log.ambush.length}, state ${run.state}`);
  ok('esc.ticks-only-alive', log.ticks.every((t) => t[1] === true));

  // escort NPC HP: ambushers in contact hit it, it regenerates between waves, at 0 HP the run fails back to the start at full HP
  const hl = { ticks: [], alive: 0, near: 0, dist: 0 };
  const hdeps = { playerDist: () => hl.dist, ambush: () => { hl.alive = 2; hl.near = 2; }, ambushAlive: () => hl.alive, attackersNear: () => hl.near, tick: (s, a) => hl.ticks.push([s, a]), done: () => false };
  const hrun = new EscortRun({ path, triggers: [1], speed: 10, leash: 25, failSec: 3, hp: 100, attackerDps: 5, regen: 10 }, hdeps);
  hrun.start();
  hrun.update(3);
  ok('esc.hp-untouched-before-contact', hrun.hp === 100 && hrun.state === 'ambush', `hp ${hrun.hp}, ${hrun.state}`);
  hrun.update(2);
  ok('esc.hp-contact-damage', Math.abs(hrun.hp - 80) < 1e-9, `hp ${hrun.hp} (2 ambushers x 5 dps x 2 s)`);
  hl.near = 0;
  hl.alive = 0;
  hrun.update(1);
  ok('esc.hp-regen-between-waves', hrun.state === 'walking' && Math.abs(hrun.hp - 90) < 1e-9, `hp ${hrun.hp}, ${hrun.state}`);
  hl.near = 2;
  hl.alive = 2;
  let fallGuard = 0;
  while (hrun.state !== 'idle' && fallGuard++ < 60) hrun.update(1);
  ok('esc.hp-zero-fails-run', hrun.state === 'idle' && hrun.hp === 100 && hrun.pos.x === 0 && hl.ticks.some((t) => t[1] === false), `state ${hrun.state}, hp ${hrun.hp}`);
  ok('esc.hp-pct', new EscortRun({ path, triggers: [], speed: 1, leash: 25, failSec: 3 }, hdeps).hpPct === 1 && hrun.hpPct === 1);

  const far = { ticks: [], ambush: 0, dist: 40 };
  const fdeps = { playerDist: () => far.dist, ambush: () => { far.ambush++; }, ambushAlive: () => 0, tick: (s, a) => far.ticks.push([s, a]), done: () => false };
  const frun = new EscortRun({ path, triggers: [1, 2], speed: 10, leash: 25, failSec: 3 }, fdeps);
  frun.start();
  frun.update(1);
  frun.update(1);
  ok('esc.out-of-range-pauses', frun.state === 'walking' && frun.pos.x === 0 && far.ticks.length === 0);
  frun.update(1);
  ok('esc.fails-and-resets', frun.state === 'idle' && frun.pos.x === 0 && far.ticks.length === 1 && far.ticks[0][1] === false);
  far.dist = 0;
  ok('esc.restart-after-fail', frun.start());
}

// ------------------------------------------------------------------------------------------------ placement (stub context)
{
  const RECTS = { r1: { x: 0, z: 0, w: 100, h: 100 }, r2: { x: 100, z: 0, w: 100, h: 100 }, r3: { x: 200, z: 0, w: 100, h: 100 } };
  const stub = {
    seed: 12345,
    regionRect: (id) => RECTS[id] ?? null,
    regionAtTile: (tx) => ({ id: tx < 100 ? 'r1' : tx < 200 ? 'r2' : 'r3' }),
    snapTile: (tx, tz) => ({ x: tx * 4 + 2, z: tz * 4 + 2 }),
  };
  const defs = [
    { id: 'pq1', region: 'r1', objectives: [{ kind: 'interact', target: 'qo_crystal', count: 3 }, { kind: 'use', item: 'item_mezar_tozu', target: 'qt_pl', count: 1 }] },
    { id: 'pq2', region: 'r1', objectives: [{ kind: 'interact', target: 'qo_crystal', count: 2 }] },
    { id: 'pq3', region: 'rZ', objectives: [{ kind: 'interact', target: 'qo_banner', count: 2 }] },
  ];
  const a = questPropSpots(stub, defs);
  const b = questPropSpots(stub, defs);
  ok('place.spot-count', a.filter((s) => s.target === 'qo_crystal').length === 4 && a.filter((s) => s.kind === 'altar').length === 1 && a.length === 5, `${a.length} spots`);
  ok('place.deterministic', JSON.stringify(a) === JSON.stringify(b));
  ok('place.in-region', a.every((s) => s.region === 'r1' && s.x >= 0 && s.x < 100 * 4 + 4));
  ok('place.unknown-region-skipped', !a.some((s) => s.region === 'rZ'));
  const real = questPropSpots(stub, QUESTS.filter((q) => q.region && /^r[123]$/.test(q.region)));
  ok('place.real-quests', real.length >= 20 && real.every((s) => questPropKind(s.target)), `${real.length} real spots`);
  // escort routes are fixed data (data/world/escort_routes.ts): the runtime only snaps each waypoint to walkable ground (snapWorld)
  const snapStub = { ...stub, snapWorld: (x, z) => ({ x: x + 1, z }) };
  const escRoutes = ['mq_04_samani_sustur', 'sq_r1_ch02_gozcu_avi'].map((id) => escortPath(snapStub, id));
  ok('place.escort-routes', escRoutes.every((p) => !!p && p.length >= 3), escRoutes.map((p) => p?.length ?? 0).join('/') + ' waypoints');
  ok('place.escort-snapped', !!escRoutes[0] && escRoutes[0][0].x === 778 && escRoutes[0][0].z === 245, JSON.stringify(escRoutes[0]?.[0]));
  ok('place.escort-unknown-quest', escortPath(snapStub, 'pe2') === null);
  const len = (p) => p.slice(1).reduce((s, q, k) => s + Math.hypot(q.x - p[k].x, q.z - p[k].z), 0);
  ok('place.escort-length', escRoutes.every((p) => len(p) <= 180), escRoutes.map((p) => Math.round(len(p))).join('/') + ' m (max 180)');
  // the waves must come inside the protection time: every segment at most 40 m
  ok('place.escort-segments', escRoutes.every((p) => p.slice(1).every((q, k) => Math.hypot(q.x - p[k].x, q.z - p[k].z) <= 40)));
}

// ------------------------------------------------------------------------------------------------ wiring (converted quests)
{
  const withNew = QUESTS.filter((q) => q.objectives.some((o) => ['interact', 'use', 'escort'].includes(o.kind)));
  const lv = withNew.filter((q) => q.level <= 10);
  ok('wire.converted-count', withNew.length >= 10 && lv.length === withNew.length, `${withNew.length} quests with interact/use/escort, ${lv.length} at level 1-10`);
  ok('wire.targets-mapped', withNew.every((q) => q.objectives.every((o) => (o.kind !== 'interact' && o.kind !== 'use') || questPropKind(o.target))));
  ok('wire.escort-regions', withNew.filter((q) => q.objectives.some((o) => o.kind === 'escort')).every((q) => /^r\d$/.test(q.region ?? '')));
  ok('wire.use-items', withNew.filter((q) => q.objectives.some((o) => o.kind === 'use')).every((q) => (q.startItems ?? []).some((it) => q.objectives.find((o) => o.kind === 'use').item === it.id)), 'use quests hand the item out on accept');
}

// ------------------------------------------------------------------------------------------------ arrow.* (no enemy loaded)
// The objective arrow and the map rings (ui/hud/questMarks.ts objectivePos) fall back to the layout camp that spawns the objective's
// mobs when no such enemy is streamed in: kill, drop and collect objectives all point somewhere with an empty G.world.
{
  const QM = await H.imp('ui/hud/questMarks.ts');
  const TS = 4;
  G.world = { enemies: [] };
  G.player = { id: 42, position: { x: 0, y: 0, z: 0 } };
  const ext = QM.worldDef();
  const campOf = (id) => ext.packs.find((p) => p.id === id);
  const centreM = (id) => ({ x: (campOf(id).center[0] + 0.5) * TS, z: (campOf(id).center[1] + 0.5) * TS });
  const miss = [];
  let checked = 0;
  for (const q of QUESTS.filter((x) => x.region && /^r[1-4]$/.test(x.region) && !x.daily)) {
    for (const o of q.objectives) {
      if (!['kill', 'drop', 'collect'].includes(o.kind)) continue;
      const ids = o.kind === 'kill' ? [o.target] : o.from ?? [];
      if (!ext.packs.some((p) => p.members.some((m) => ids.includes(m.enemyId)))) continue; // rares and bosses are placed by the level band
      checked++;
      if (!QM.objectivePos(o, q.place, { level: q.level, region: q.region })) miss.push(`${q.id}:${o.kind}`);
    }
  }
  ok('arrow.no-enemy-loaded', checked >= 20 && miss.length === 0, `${checked} camp-held objectives point at a camp${miss.length ? ' - no arrow: ' + miss.join(' ') : ''}`);
  const kurt = QUESTS.find((q) => q.id === 'sq_g_01_kurt_tehlikesi');
  const kp = QM.guideTargetPos(kurt.objectives[0], false, kurt.region, kurt.place, kurt.level);
  ok('arrow.drop-kurt-tehlikesi', kurt.objectives[0].kind === 'drop' && !!kp && kp.x === centreM(kurt.place).x && kp.z === centreM(kurt.place).z, `drop objective points at its camp ${kurt.place}`);
  const geyik = QUESTS.find((q) => q.id === 'sq_g_02_geyik_derisi');
  const gp = QM.guideTargetPos(geyik.objectives[0], false, geyik.region, geyik.place, geyik.level);
  ok('arrow.collect-geyik-derisi', geyik.objectives[0].from.join() === 'ow_deer' && !!gp && gp.x === centreM('r1_c14').x && gp.z === centreM('r1_c14').z, 'collect objective points at the deer camp r1_c14');
  const town = QM.guideTargetPos(kurt.objectives[0], true, kurt.region, kurt.place, kurt.level);
  ok('arrow.town-gate', !!town && town.label === 'Güney Kapısı', `in town a drop objective points at the gate (${town?.label ?? 'none'})`);
}

// ------------------------------------------------------------------------------------------------ escort.start (real wiring)
// WorldQuestProps.place() on the real World: the escort NPC of the ACTIVE quest (mq_04, the Sisli main chain) is the only one F reaches.
// The locked side quest (sq_r1_ch02_gozcu_avi) places a decoy with the same name in r1. F on the NPC walks it (the player follows),
// the ambush is cleared, the quest becomes ready. The decoy never moves.
{
  const { WorldQuestProps } = await H.imp('scenes/world/WorldQuestProps.ts');
  const { EscortNpc } = await H.imp('entities/interactables/EscortNpc.ts');
  const MQ = 'mq_04_samani_sustur';
  const SIDE = 'sq_r1_ch02_gozcu_avi';
  const RECT = { r1: { x: 0, z: 0, w: 200, h: 200 } };
  const world = H.world;
  G.world = world;
  G.quests = qs;
  ch.save.level = 2;
  for (const id of ['mq_01_kuzgunun_cagrisi', 'mq_02_fare_yuvasi', 'mq_03_balcik_temizligi']) ch.save.flags[`q.${id}`] = 'done';
  // earlier stages took the side escort (level 3): start from a character that has not
  delete ch.save.flags[`q.${SIDE}`];
  for (let k = 0; k < 2; k++) delete ch.save.flags[`q.${SIDE}.n${k}`];
  const ctx = {
    world,
    seed: 777,
    regionById: (id) => (RECT[id] ? { id } : undefined),
    regionRect: (id) => RECT[id] ?? null,
    regionAtTile: () => ({ id: 'r1' }),
    snapTile: (tx, tz) => ({ x: tx * 4 + 2, z: tz * 4 + 2 }),
    snapWorld: (x, z) => ({ x, z }),
  };
  // the ambush is spawned by the host (spawnEnemy only spawns on the authority): this stage plays the host
  const netWas = G.net;
  G.net = { isOnline: false, isAuthority: true, broadcast() {}, on() {} };
  const qp = new WorldQuestProps(ctx);
  await qp.place();
  const npcs = [...world.entities.values()].filter((e) => e instanceof EscortNpc);
  ok('escort.two-npcs', npcs.length === 2, `${npcs.length} escort NPCs in r1 (mq_04 + the side quest's decoy)`);
  ok('escort.accept-main', qs.accept(MQ) && qs.state(MQ) === 'active', qs.state(MQ));
  ok('escort.side-not-active', qs.state(SIDE) !== 'active', qs.state(SIDE));
  const player = { id: 42, kind: 'player', position: { x: 0, y: 0, z: 0 }, removed: false, isDead: false };
  world.localPlayer = player;
  G.player = player;
  const live = npcs.find((n) => n.canInteract(player));
  const decoy = npcs.find((n) => n !== live);
  ok('escort.only-active-interactable', !!live && !!decoy && !decoy.canInteract(player) && npcs.filter((n) => n.canInteract(player)).length === 1);
  const at = (n) => { player.position.x = n.position.x + 2; player.position.z = n.position.z; };
  // F at the decoy (2 m away): PlayerController skips it, and a direct interact must not start anything
  at(decoy);
  decoy.interact(player);
  const decoy0 = { x: decoy.position.x, z: decoy.position.z };
  qp.update(0.5);
  ok('escort.decoy-inert', decoy.position.x === decoy0.x && decoy.position.z === decoy0.z && qs.progressRows(MQ)[0].have === 0);
  // F at the real escort: it walks, ambushes are cleared as they come, the protection timer runs out
  const start = { x: live.position.x, z: live.position.z };
  at(live);
  live.interact(player);
  let peakAmbush = 0;
  let frames = 0;
  for (; frames < 4000 && qs.state(MQ) !== 'ready'; frames++) {
    at(live); // the player follows 2 m behind
    peakAmbush = Math.max(peakAmbush, world.enemies.length);
    for (const e of [...world.enemies]) world.remove(e);
    qp.update(0.5);
    await new Promise((r) => setTimeout(r, 0)); // ambush spawns resolve on the event loop
  }
  const walked = Math.hypot(live.position.x - start.x, live.position.z - start.z);
  ok('escort.npc-walks', walked > 20, `moved ${walked.toFixed(1)} m`);
  ok('escort.ambush-spawned', peakAmbush >= 2, `peak ${peakAmbush} ambushers (a wave is 1-2)`);
  ok('escort.completes', qs.state(MQ) === 'ready' && qs.progressRows(MQ)[0].done, `state ${qs.state(MQ)} after ${frames} steps`);
  ok('escort.decoy-never-moves', decoy.position.x === decoy0.x && decoy.position.z === decoy0.z);
  G.net = netWas;
  ch.save.level = 1;
}

console.log(`questtypes: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
