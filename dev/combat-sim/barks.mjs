// Karakter sözleri (barks) headless check. No browser, no server, no network: the real systems/Barks.ts on the real EventBus, a real
// CharacterState and the real line data (data/barks.ts). UI bubbles and the chat are stubs that record what would show.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/barks.mjs
// Stages: data.* (line pools) | ev.* (triggers fire, once-per-character flags) | cd.* (cooldowns, global gaps, no repeats)
//         hp.* (low HP once per fight) | idle.* (town idle) | world.* (enemy lines, NPC greetings) | set.* (Açık / Az / Kapalı).
// PASS/FAIL per check, exit code 1 on any failure.
import * as H from './harness.mjs';

const { G } = H;

// ---- stubs: the bubble layer and the chat only record what they would show
const says = [];
const rumors = [];
G.ui = {
  say: (anchor, o) => says.push({ anchor, ...o }),
  // the player's own lines go to Genel through addBark, NPC/world lines through addRumor: both are a chat line here
  hud: { chat: { addRumor: (from, text) => rumors.push({ from, text }), addBark: (from, text) => rumors.push({ from, text }) } },
};
G.settings = { data: { characterBarks: 'on' } };
G.world = { entities: new Map() };
G.player = { id: 42, object3d: {}, height: 2, position: { x: 0, z: 0 } };

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const B = await H.imp('systems/Barks.ts');
const D = await H.imp('data/barks.ts');
const { DUNGEONS } = await H.imp('data/dungeons/index.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

// seeded rng so the picks are reproducible
let seed = 12345;
const rng = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x80000000;
};

const clear = () => { says.length = 0; rumors.length = 0; };
const lastSay = () => says[says.length - 1];

// ------------------------------------------------------------------------------------------------ data.*
{
  const pools = [];
  for (const [k, v] of Object.entries(D.PLAYER_LINES)) pools.push([`player.${k}`, v]);
  for (const [cls, m] of Object.entries(D.CLASS_LINES)) for (const [k, v] of Object.entries(m)) pools.push([`class.${cls}.${k}`, v]);
  for (const [role, v] of Object.entries(D.ROLE_LINES)) pools.push([`role.${role}`, v]);
  pools.push(['enemy.aggro', D.ENEMY_AGGRO_LINES], ['enemy.death', D.ENEMY_DEATH_LINES]);
  const triggers = Object.keys(B.RULES);
  ok('data.triggers', triggers.length === 15 && triggers.every((k) => k in D.PLAYER_LINES), `${triggers.length} triggers`);
  ok('data.player-variants', Object.entries(D.PLAYER_LINES).every(([, v]) => v.length >= 6 && v.length <= 8), 'every trigger has 6 to 8 lines');
  ok('data.class-variants', Object.values(D.CLASS_LINES).every((m) => Object.values(m).every((v) => v.length >= 6 && v.length <= 8)));
  ok('data.class-flavour', ['paladin', 'warlock', 'rogue', 'druid'].every((c) => D.CLASS_LINES[c] && Object.keys(D.CLASS_LINES[c]).length === 3));
  ok('data.roles', Object.values(D.ROLE_LINES).length >= 9 && Object.values(D.ROLE_LINES).every((v) => v.length >= 6));
  ok('data.enemy-pools', D.ENEMY_AGGRO_LINES.length >= 6 && D.ENEMY_DEATH_LINES.length >= 6);
  const bad = pools.filter(([, v]) => new Set(v).size !== v.length);
  ok('data.no-duplicates', bad.length === 0, bad.map(([k]) => k).join(', '));
  const long = pools.flatMap(([k, v]) => v.filter((l) => [...l].length > 70).map((l) => `${k}: ${l}`));
  ok('data.raw-length-70', long.length === 0, long.slice(0, 3).join(' | '));
  const names = [...new Set([...Object.values(DUNGEONS).map((d) => d.name), ...Object.values(D.FAMILY_NAMES)])];
  const over = [];
  for (const [k, v] of pools) for (const l of v) for (const n of names) {
    const r = B.fillLine(l, { name: n, family: n });
    if ([...r].length > 70) over.push(`${k} (${[...r].length}): ${r}`);
  }
  ok('data.rendered-length-70', over.length === 0, over.slice(0, 4).join(' | ') + (over.length > 4 ? ` +${over.length - 4}` : ''));
  ok('data.fill', B.fillLine('{name} ve {family}', { name: 'Sisli', family: 'ejderha' }) === 'Sisli ve ejderha');
}

// ------------------------------------------------------------------------------------------------ setup
G.character = CharacterState.create('Sim', 'paladin');
G.character.save.flags ??= {};
const bark = B.installBarks(rng);
let t0 = 0;
const at = (sec) => { // advance the service clock to `sec` seconds
  if (sec > t0) bark.update(sec - t0);
  t0 = sec;
};
const emit = (name, p) => G.events.emit(name, p);

// ------------------------------------------------------------------------------------------------ ev.* (triggers)
at(0);
clear();
emit('player:levelup', { level: 5 });
ok('ev.levelup-bubble', says.length === 1 && says[0].own === true && says[0].kind === 'say' && says[0].anchor === G.player.object3d);
ok('ev.levelup-line-from-class-pool', D.CLASS_LINES.paladin.levelup.includes(lastSay().text), lastSay()?.text);
ok('ev.levelup-rumor', rumors.length === 1 && rumors[0].from === 'Sim' && rumors[0].text === lastSay().text);

// zone: first entry only (save flag)
at(40); clear();
emit('region:entered', { id: 'sisli_vadi', name: 'Sisli Vadi', subtitle: '', levelRange: [1, 5], danger: 1 });
ok('ev.zone-first', says.length === 1 && D.PLAYER_LINES.zone.some((l) => B.fillLine(l, { name: 'Sisli Vadi' }) === says[0].text), says[0]?.text);
ok('ev.zone-flag', G.character.save.flags['bark.zone.sisli_vadi'] === true);
at(200); clear();
emit('region:entered', { id: 'sisli_vadi', name: 'Sisli Vadi', subtitle: '', levelRange: [1, 5], danger: 1 });
ok('ev.zone-second-silent', says.length === 0);

// dungeon: first run only
at(300); clear();
const runState = { dungeonId: 'kemik_mahzeni', difficulty: 'normal', keyLevel: 0, affixes: [], seed: 1, started: true };
emit('run:started', { state: runState });
ok('ev.dungeon-first', says.length === 1 && says[0].text.includes(DUNGEONS.kemik_mahzeni?.name ?? 'kemik_mahzeni'), says[0]?.text);
at(400); clear();
emit('run:started', { state: runState });
ok('ev.dungeon-second-silent', says.length === 0);

// loot: rare and epic speak, common does not, legendary counts as epic
at(500); clear();
emit('loot:pickedUp', { item: { rarity: 'common' } });
ok('ev.loot-common-silent', says.length === 0);
emit('loot:pickedUp', { item: { rarity: 'rare' } });
ok('ev.loot-rare', says.length === 1 && rumors.length === 1);
at(600); clear();
emit('loot:pickedUp', { item: { rarity: 'legendary' } });
ok('ev.loot-legendary-epic-pool', says.length === 1 && D.PLAYER_LINES.loot_epic.includes(lastSay().text), lastSay()?.text);

// boss kill: the paladin's own pool
at(700); clear();
emit('boss:defeated', { bossId: 'x', entityId: 9 });
ok('ev.boss-kill-class-pool', says.length === 1 && D.CLASS_LINES.paladin.boss_kill.includes(lastSay().text), lastSay()?.text);

// resurrect, quest, achievement, mount, pvp, arena
at(800); clear();
emit('player:revived', { entityId: 42, local: false });
ok('ev.revive-remote-silent', says.length === 0);
emit('player:revived', { entityId: 42, local: true });
ok('ev.revive-local', says.length === 1);
at(850); clear();
emit('quest:updated', { questId: 'q1', state: 'active' });
ok('ev.quest-active-silent', says.length === 0);
emit('quest:updated', { questId: 'q1', state: 'done' });
ok('ev.quest-done', says.length === 1);
at(1000); clear();
emit('achievement:unlocked', { id: 'a1', name: 'x', points: 5 });
ok('ev.achievement', says.length === 1);
at(1100); clear();
emit('player:mounted', { on: false });
ok('ev.mount-off-silent', says.length === 0);
emit('player:mounted', { on: true });
ok('ev.mount-on', says.length === 1);
at(1200); clear();
emit('pvp:flag', { on: true, zone: true });
ok('ev.pvp-zone', says.length === 1);
at(1300); clear();
emit('arena:result', { winner: 'B', won: false, why: 'normal', score: [0, 2], bracket: '2v2', ranked: false, rating: null, rewards: { onur: 0, fetih: 0, muhru: 0 } });
ok('ev.arena-loss-silent', says.length === 0);
emit('arena:result', { winner: 'A', won: true, why: 'normal', score: [2, 0], bracket: '2v2', ranked: false, rating: null, rewards: { onur: 0, fetih: 0, muhru: 0 } });
ok('ev.arena-win', says.length === 1);

// ------------------------------------------------------------------------------------------------ cd.* (cooldowns, gaps, no repeats)
// a fresh service so the picks start clean
const bark2 = B.installBarks(rng);
void bark2;
bark.dispose();
bark2.dispose();
const svc = B.installBarks(rng);
let now = 5000;
const adv = (sec) => { svc.update(sec); now += sec; };
svc.update(0);
clear();
G.events.emit('player:levelup', { level: 6 });
const first = lastSay()?.text;
ok('cd.first-fires', says.length === 1);
clear();
adv(10);
G.events.emit('loot:pickedUp', { item: { rarity: 'epic' } });
ok('cd.global-20s-blocks', says.length === 0, 'a second player bark 10 s after the first is held');
adv(15); // now 25 s after the first: the 20 s global gap is over, the levelup cooldown (30 s) is not
G.events.emit('player:levelup', { level: 7 });
ok('cd.trigger-30s-blocks', says.length === 0, 'the same trigger 25 s after it is held');
adv(10); // 35 s after the first
G.events.emit('player:levelup', { level: 7 });
ok('cd.trigger-expired-fires', says.length === 1);
// no repeats in a row: many levelups far apart, each line differs from the one before
const seq = [];
for (let i = 0; i < 24; i++) {
  adv(40);
  clear();
  G.events.emit('player:levelup', { level: 8 + i });
  if (says.length) seq.push(lastSay().text);
}
ok('cd.sequence-fires', seq.length === 24, `${seq.length}/24`);
ok('cd.no-repeat-in-row', seq.every((l, i) => i === 0 || l !== seq[i - 1]));
ok('cd.pool-varies', new Set(seq).size >= 4, `${new Set(seq).size} distinct of 24`);
ok('cd.lines-from-pool', seq.every((l) => D.CLASS_LINES.paladin.levelup.includes(l)));

// class and generic pools are separate keys: a knight's levelup comes from the generic pool
svc.dispose();
const knightSvc = B.installBarks(rng);
G.character = CharacterState.create('Kılıç', 'knight');
G.character.save.flags ??= {};
clear();
knightSvc.update(1000);
G.events.emit('player:levelup', { level: 3 });
ok('cd.knight-generic-pool', says.length === 1 && D.PLAYER_LINES.levelup.includes(lastSay().text), lastSay()?.text);
ok('cd.knight-rumor-name', rumors[0]?.from === 'Kılıç');
knightSvc.dispose();
G.character = CharacterState.create('Sim', 'paladin');
G.character.save.flags ??= {};

// ------------------------------------------------------------------------------------------------ hp.* (low HP once per fight)
const hpSvc = B.installBarks(rng);
hpSvc.update(2000);
clear();
G.events.emit('player:resources', { hp: 20, maxHp: 100, res: 0, maxRes: 100 });
ok('hp.low-fires', says.length === 1 && D.CLASS_LINES.paladin.low_hp.includes(lastSay().text), lastSay()?.text);
clear();
G.events.emit('player:resources', { hp: 10, maxHp: 100, res: 0, maxRes: 100 });
ok('hp.once-per-fight', says.length === 0);
G.events.emit('player:resources', { hp: 0, maxHp: 100, res: 0, maxRes: 100 });
ok('hp.zero-is-death-not-low', says.length === 0);
G.events.emit('player:resources', { hp: 70, maxHp: 100, res: 0, maxRes: 100 }); // re-arm
hpSvc.update(200); // past the 120 s low_hp cooldown
clear();
G.events.emit('player:resources', { hp: 15, maxHp: 100, res: 0, maxRes: 100 });
ok('hp.rearmed-after-recover', says.length === 1, 'a second fight fires again');
hpSvc.dispose();

// ------------------------------------------------------------------------------------------------ idle.* (town)
const idleSvc = B.installBarks(rng);
clear();
G.events.emit('scene:changed', { from: 'dungeon', to: 'town' });
idleSvc.update(1);
for (let i = 0; i < 290; i++) idleSvc.update(1); // 291 s standing still
ok('idle.not-yet', says.length === 0);
for (let i = 0; i < 20; i++) idleSvc.update(1); // 311 s
ok('idle.fires-after-300', says.length === 1 && D.PLAYER_LINES.idle_town.includes(lastSay().text), lastSay()?.text);
G.player.position.x = 30; // walked away: the idle counter restarts
idleSvc.update(1);
clear();
for (let i = 0; i < 290; i++) idleSvc.update(1);
G.player.position.x = 0;
for (let i = 0; i < 20; i++) idleSvc.update(1);
ok('idle.moving-resets', says.length === 0);
G.events.emit('scene:changed', { from: 'town', to: 'dungeon' });
clear();
for (let i = 0; i < 400; i++) idleSvc.update(1);
ok('idle.town-only', says.length === 0);
idleSvc.dispose();

// ------------------------------------------------------------------------------------------------ world.* (enemies, NPC greetings)
const elite = { id: 'kara_savasci', name: 'Kara Savaşçı', rank: 'elite', family: 'humanoid' };
const elite2 = { id: 'kemik_kral', name: 'Kemik Kral', rank: 'elite' };
const boss = { id: 'mahzen_efendisi', name: 'Mahzen Efendisi', rank: 'boss', phases: [{ id: 'p1', hpBelow: 1.01, abilities: [] }] };
const trash = { id: 'kurt', name: 'Kurt', rank: 'trash', family: 'beast' };
G.world.entities.set(100, { def: elite, height: 2, object3d: {} });
G.world.entities.set(101, { def: elite2, height: 2, object3d: {} });
G.world.entities.set(102, { def: boss, height: 3, object3d: {} });
G.world.entities.set(103, { def: trash, height: 1, object3d: {} });
const wSvc = B.installBarks(rng);
wSvc.update(3000);
clear();
G.events.emit('enemy:aggro', { enemyId: 100, targetId: 42 });
ok('world.elite-aggro', says.length === 1 && says[0].kind === 'npc' && says[0].name === 'Kara Savaşçı' && D.ENEMY_AGGRO_LINES.includes(says[0].text));
clear();
G.events.emit('enemy:aggro', { enemyId: 101, targetId: 42 });
ok('world.gap-8s-blocks', says.length === 0, 'another elite 0 s later');
wSvc.update(9);
G.events.emit('enemy:aggro', { enemyId: 101, targetId: 42 });
ok('world.other-elite-after-gap', says.length === 1);
wSvc.update(10); // t = 3019: the same elite is still inside its 90 s cooldown
clear();
G.events.emit('enemy:aggro', { enemyId: 100, targetId: 42 });
ok('world.same-elite-cd-90s', says.length === 0, 'the same elite 19 s later is held');
wSvc.update(80); // t = 3099: 99 s after its line
G.events.emit('enemy:aggro', { enemyId: 100, targetId: 42 });
ok('world.same-elite-after-cd', says.length === 1);
clear();
G.events.emit('enemy:aggro', { enemyId: 102, targetId: 42 });
ok('world.boss-with-phases-silent', says.length === 0, 'a boss with phases keeps its own yells');
G.events.emit('enemy:aggro', { enemyId: 100, targetId: 7 });
ok('world.aggro-other-target-silent', says.length === 0);
G.events.emit('death', { entityId: 100, killerId: 42, pos: [0, 0, 0] });
ok('world.gap-applies-to-death', !rumors.some((r) => r.from === 'Kara Savaşçı'), 'a death line right after another world line waits for the 8 s gap (the first humanoid kill may speak its own family line)');
wSvc.update(10);
G.world.entities.set(106, { def: { id: 'yaban_kurdu', name: 'Yaban Kurdu', rank: 'miniboss' }, height: 2, object3d: {} });
clear();
G.events.emit('death', { entityId: 106, killerId: 42, pos: [0, 0, 0] });
ok('world.miniboss-death-line', rumors.length === 1 && rumors[0].from === 'Yaban Kurdu' && D.ENEMY_DEATH_LINES.includes(rumors[0].text), rumors[0]?.text);
clear();
// family: first kill of a family speaks, the next one does not
G.world.entities.set(104, { def: trash, height: 1, object3d: {} });
wSvc.update(200);
G.events.emit('death', { entityId: 103, killerId: 42, pos: [0, 0, 0] });
ok('world.family-first-kill', says.length === 1 && D.PLAYER_LINES.family.some((l) => says[0].text === B.fillLine(l, { family: 'vahşi yaratık' })), says[0]?.text);
ok('world.family-flag', G.character.save.flags['bark.fam.beast'] === true);
clear();
wSvc.update(200);
G.events.emit('death', { entityId: 104, killerId: 42, pos: [0, 0, 0] });
ok('world.family-second-silent', says.every((s) => !s.text.includes('vahşi yaratık')));
wSvc.dispose();

// NPC greetings: the NPC's own lines first, else the role's; no repeat in a row; silent on Az and Kapalı
const npcSvc = B.installBarks(rng);
const own = ['Silahın +15 olsun da gör...', 'Örsüm susmaz, demir dinlenmez.'];
const picksOwn = Array.from({ length: 12 }, () => npcSvc.npcLine('npc_demirci', 'blacksmith', own));
ok('npc.own-lines', picksOwn.every((l) => own.includes(l)));
ok('npc.no-repeat-in-row', picksOwn.every((l, i) => i === 0 || l !== picksOwn[i - 1]));
const picksRole = Array.from({ length: 12 }, () => npcSvc.npcLine('npc_x', 'quest', []));
ok('npc.role-lines', picksRole.every((l) => D.ROLE_LINES.quest.includes(l)));
ok('npc.role-no-repeat', picksRole.every((l, i) => i === 0 || l !== picksRole[i - 1]));
ok('npc.no-pool-silent', npcSvc.npcLine('npc_y', 'stash', []) === null, 'a role with no lines and no own lines stays silent');
npcSvc.dispose();

// ------------------------------------------------------------------------------------------------ set.* (Açık / Az / Kapalı)
const setSvc = B.installBarks(rng);
setSvc.update(5000);
G.settings.data.characterBarks = 'few';
clear();
G.events.emit('loot:pickedUp', { item: { rarity: 'rare' } });
ok('set.few-hides-minor', says.length === 0, 'rare loot is not an important moment on Az');
G.events.emit('player:levelup', { level: 9 });
ok('set.few-keeps-levelup', says.length === 1);
setSvc.update(40); // the cooldown is x3 on Az: 90 s
G.events.emit('player:levelup', { level: 10 });
ok('set.few-cooldown-x3', says.length === 1, 'the level-up 40 s after the last one is still held on Az');
setSvc.update(60);
G.events.emit('player:levelup', { level: 11 });
ok('set.few-cooldown-expired', says.length === 2);
clear();
G.world.entities.set(105, { def: elite2, height: 2, object3d: {} });
setSvc.update(500);
G.events.emit('enemy:aggro', { enemyId: 105, targetId: 42 });
ok('set.few-no-enemy-lines', says.length === 0);
ok('set.few-no-npc-lines', setSvc.npcLine('npc_z', 'quest', []) === null);
G.settings.data.characterBarks = 'off';
clear();
setSvc.update(600);
G.events.emit('player:levelup', { level: 12 });
G.events.emit('boss:defeated', { bossId: 'x', entityId: 9 });
ok('set.off-silent', says.length === 0 && rumors.length === 0);
ok('set.off-npc-null', setSvc.npcLine('npc_z', 'quest', []) === null);
G.settings.data.characterBarks = 'on';
clear();
setSvc.update(700);
G.events.emit('player:levelup', { level: 13 });
ok('set.on-again', says.length === 1);
setSvc.dispose();

// dispose: the events stop
const offSvc = B.installBarks(rng);
offSvc.dispose();
clear();
offSvc.update(9000);
G.events.emit('player:levelup', { level: 14 });
ok('dispose.silent-after', says.length === 0);

// ------------------------------------------------------------------------------------------------ report
console.log(`${passes} passed, ${fails} failed`);
const realErrors = H.errors.filter((e) => !/tsx|rolldown|Deprecat/i.test(e));
if (realErrors.length) console.log('console:', realErrors.slice(0, 5).join(' | '));
process.exitCode = fails ? 1 : 0;
