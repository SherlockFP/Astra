#!/usr/bin/env node
/**
 * Dungeon completion summary + re-queue, headless. A real CharacterState at level 1 runs the starter dungeon Sisli Magara (normal):
 * the real Progression.addXp (level-up included), real CharacterState.addGold / addItem, the real run tally subscribed to the real
 * EventBus (ui/panels/game/runTally.ts), a run:started -> run:completed pair, then the summary data is read back.
 * Re-queue: the same dungeon and difficulty through the real runStart.ts (buildParams, startRun), which must request a NEW run
 * (new seed, dungeon scene) from the host.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/run_summary.mjs
 *
 * Checks (exit 1 on FAIL): tally.* the XP / level-up / gold / item / time data of the run; requeue.* a new run request.
 */

import * as H from './harness.mjs';

const { G } = H;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { Progression } = await H.imp('systems/Progression.ts');
const { generateItem, categoriesForClass, slotsForCategory } = await H.imp('systems/ItemGen.ts');
const { RNG } = await H.imp('core/utils.ts');
const { SPECS } = await H.imp('data/specs.ts');
const { DUNGEONS } = await H.imp('data/dungeons/index.ts');
const RT = await H.imp('ui/panels/game/runTally.ts');
const RS = await H.imp('ui/panels/game/runSummary.ts');
const RSTART = await H.imp('ui/panels/game/runStart.ts');

const DUNGEON = 'sisli_magara';
const SEED = 4242;
const def = DUNGEONS[DUNGEON];
ok('setup.dungeon', !!def && def.levelRange?.[0] === 1, def ? `levelRange ${def.levelRange}` : 'missing');

// ---------------------------------------------------------------------------------------------- a level 1 character
const spec = SPECS.knight_blademaster;
const rng = new RNG(SEED);
const ch = CharacterState.create('Sim', spec.classId);
ch.save.level = 1;
ch.save.xp = 0;
ch.save.spec = spec.id;
ch.recomputeStats(false);
G.character = ch;
G.progression = new Progression();
// the party view the finder start path reads (a solo player: no peers, leads its own run)
const requests = [];
G.net = {
  selfId: 'local', inParty: false, isPartyLeader: true, isPartyGuest: false, isAuthority: true,
  partyMembers: () => [], partyRemotePeers: () => [], peers: new Map(),
  requestScene: (scene, params) => requests.push({ how: 'requestScene', scene, params }),
  requestSceneFromHost: (scene, params) => requests.push({ how: 'requestSceneFromHost', scene, params }),
  on() {}, onRequest() {}, broadcast() {}, sendTo() {}, sendToHost() {},
};

G.input = { bindingLabel: () => 'K' };
const off = RT.installRunTally(G.events, RS.currentXpPoint, RT.runKeyOf);
const startXp = RS.currentXpPoint();
ok('tally.start-point', startXp?.level === 1 && startXp.xp === 0 && startXp.needed > 0, JSON.stringify(startXp));

// ---------------------------------------------------------------------------------------------- one run
const params = RSTART.buildParams(def, 'normal', { keyOwner: 'local' });
const state = {
  dungeonId: DUNGEON, difficulty: 'normal', keyLevel: 0, affixes: [], seed: SEED, started: true, startTime: 0,
  elapsed: 612.4, timerSec: 0, deaths: 1, deathPenaltySec: 30, forces: 40, forcesRequired: 40, bossesKilled: ['sim_boss_1'],
  bossesTotal: 2, completed: true, failed: false, inTime: true, upgradeLevels: 0, countdown: 0,
};
G.events.emit('run:started', { state });

// 20 kills of a level 1 trash mob, through the real XP path: 800 XP is past the level 1 need (480), so one level-up
let xpGiven = 0;
for (let i = 0; i < 20; i++) {
  const gain = G.progression.monsterXp(1, 'trash', 1, 1) + 20;
  xpGiven += gain;
  G.progression.addXp(gain);
}
ok('tally.levelup-happened', ch.save.level === 2, `level ${ch.save.level}, xp ${ch.save.xp}`);

// gold and two items picked up on the ground (the same events LootSystem.pickup emits)
ch.addGold(137);
G.events.emit('loot:pickedUp', { gold: 137 });
const rng2 = new RNG(SEED + 1);
const cats = categoriesForClass(spec.classId);
const picked = [];
for (const slot of ['chest', 'helm']) {
  const options = cats.filter((c) => slotsForCategory(c).includes(slot));
  if (!options.length) continue;
  const item = generateItem({ itemLevel: 2, rarity: 'uncommon', classId: spec.classId, category: options[0], smart: true }, rng2);
  picked.push(item);
  G.events.emit('loot:pickedUp', { item });
}
ok('tally.items-made', picked.length === 2, `${picked.length} items`);

// ---------------------------------------------------------------------------------------------- completion
G.events.emit('run:completed', { state, record: null, rewards: [] });
const tally = RT.RUN_TALLY.forKey(RT.runKeyOf(state));
ok('tally.produced', !!tally, 'run:completed froze a tally with the run key');
if (tally) {
  ok('tally.xp', tally.xp === xpGiven, `xp ${tally.xp} (given ${xpGiven})`);
  ok('tally.levelups', JSON.stringify(tally.levelUps) === '[2]', JSON.stringify(tally.levelUps));
  ok('tally.start-end', tally.start?.level === 1 && tally.end?.level === 2, `${tally.start?.level} -> ${tally.end?.level}`);
  ok('tally.end-bar', tally.end && tally.end.needed > 0 && tally.end.xp < tally.end.needed, JSON.stringify(tally.end));
  ok('tally.gold', tally.gold === 137, `gold ${tally.gold}`);
  ok('tally.items', tally.items.length === 2 && tally.items.every((it) => it.uid), `${tally.items.length} items`);
  ok('tally.time', RT.runKeyOf(state).endsWith('|612'), RT.runKeyOf(state));
}
ok('tally.summary-fallback', RS.currentXpPoint()?.level === 2 && RT.RUN_TALLY.forKey(RT.runKeyOf(state)) === tally, 'chest-opened card reads the same tally');

// the tally stops at completion: a later pickup belongs to the town, not to this run
G.events.emit('loot:pickedUp', { gold: 999 });
ok('tally.frozen', RT.RUN_TALLY.forKey(RT.runKeyOf(state))?.gold === 137, 'pickups after run:completed are not counted');

// ---------------------------------------------------------------------------------------------- re-queue
// the summary's "Tekrar Sıraya Gir" opens the finder with the same dungeon and difficulty; the finder's start path (runStart) then
// sends the new run to the host. Here: the same params the finder builds for a solo leader.
const again = RSTART.buildParams(def, state.difficulty, { keyOwner: 'local' });
ok('requeue.same-dungeon', again.dungeonId === DUNGEON && again.difficulty === 'normal', `${again.dungeonId} ${again.difficulty}`);
ok('requeue.new-seed', again.seed !== params.seed, `seed ${params.seed} -> ${again.seed}`);
ok('requeue.level-band', again.enemyLevel >= def.levelRange[0] && again.enemyLevel <= def.levelRange[1], `enemy level ${again.enemyLevel}`);
const started = RSTART.startRun(again);
const req = requests.at(-1);
ok('requeue.starts-run', started && req?.scene === 'dungeon' && req.params?.dungeonId === DUNGEON, JSON.stringify(req?.how ?? null));
ok('requeue.params-carried', req?.params?.seed === again.seed && req?.params?.partySize === 1, `seed ${req?.params?.seed}`);

off();
console.log(`\n${passes} passed, ${fails} failed`);
if (H.errors.length) console.log(`console: ${H.errors.length} error/warn line(s)`, H.errors.slice(0, 5));
process.exit(fails ? 1 : 0);
