// WP-08 achievements and titles headless check (docs/MMO_PILLARS.md). No browser, no server, no network: the real
// systems/Achievements.ts subscribed to the real EventBus, a real CharacterState and the real achievement catalogue.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/achievements.mjs
// Stages: cat.* (catalogue) | ev.* (event -> progress -> unlock once, toast / chat / party / sound) | title.* (titles)
//         save.* (JSON roundtrip, legacy backfill). PASS/FAIL per check, exit code 1 on any failure.
import * as H from './harness.mjs';

const { G } = H;
const toasts = [];
const chat = [];
const unlocks = [];
G.events.on('ui:toast', (t) => toasts.push(t.text));
G.events.on('net:chat', (c) => chat.push(c));
G.events.on('achievement:unlocked', (u) => unlocks.push(u.id));

const { CharacterState } = await H.imp('systems/CharacterState.ts');
const A = await H.imp('systems/Achievements.ts');
const D = await H.imp('data/achievements.ts');
const SaveMod = await H.imp('core/Save.ts').catch(() => null);

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const unlockedIds = () => D.ACHIEVEMENTS.filter((d) => A.isUnlocked(G.character.save, d.id)).map((d) => d.id);
const clearLogs = () => { toasts.length = 0; chat.length = 0; unlocks.length = 0; };
// live toasts wait for the merge window (A.TOAST_MERGE_MS) before they show
const WINDOW = A.TOAST_MERGE_MS + 150;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------ cat.*
{
  const ids = D.ACHIEVEMENTS.map((d) => d.id);
  ok('cat.count', D.ACHIEVEMENTS.length >= 55 && D.ACHIEVEMENTS.length <= 70, `${D.ACHIEVEMENTS.length} achievements`);
  ok('cat.unique-ids', new Set(ids).size === ids.length);
  ok('cat.ids-snake', ids.every((id) => /^[a-z0-9_]+$/.test(id)));
  ok('cat.points', D.ACHIEVEMENTS.every((d) => [5, 10, 25].includes(d.points)));
  ok('cat.target', D.ACHIEVEMENTS.every((d) => Number.isFinite(d.target) && d.target > 0));
  ok('cat.metric-known', D.ACHIEVEMENTS.every((d) => d.metric in D.METRIC_KIND));
  ok('cat.categories', D.ACH_CATEGORIES.every((c) => D.ACHIEVEMENTS.some((d) => d.cat === c.id)), 'every category has an achievement');
  ok('cat.names', D.ACHIEVEMENTS.every((d) => d.name && d.desc));
  const titled = D.ACHIEVEMENTS.filter((d) => d.title);
  ok('cat.titles', titled.length >= 10 && titled.every((d) => d.title.length <= 24), `${titled.length} titles`);
  ok('cat.points-total', D.ACHIEVEMENT_POINTS_TOTAL === D.ACHIEVEMENTS.reduce((s, d) => s + d.points, 0));
  ok('cat.set-metrics', D.ACHIEVEMENTS.filter((d) => D.METRIC_KIND[d.metric] === 'set').length >= 5);
}

// ------------------------------------------------------------------------------------------------ ev.*
G.character = CharacterState.create('Sim', 'knight');
G.player = { id: 42 };
G.net = { isOnline: false };
const sent = [];
const dispose = A.installAchievements();

G.events.emit('player:levelup', { level: 4 });
ok('ev.level-below', !A.isUnlocked(G.character.save, 'sev_lv5'), 'level 4 does not unlock level 5');
clearLogs();
G.events.emit('player:levelup', { level: 5 });
ok('ev.level-unlock', A.isUnlocked(G.character.save, 'sev_lv5'));
ok('ev.unlock-once-event', unlocks.filter((id) => id === 'sev_lv5').length === 1, `events ${unlocks.join(',')}`);
await wait(WINDOW);
ok('ev.toast', toasts.length === 1 && /Çırak/.test(toasts[0]), toasts.join(' | '));
ok('ev.chat-line', chat.some((c) => c.channel === 'system' && c.text === 'Çırak başarımını kazandın!'));
ok('ev.points', A.totalPoints(G.character.save) === 5, `${A.totalPoints(G.character.save)}`);
clearLogs();
G.events.emit('player:levelup', { level: 5 });
G.events.emit('player:levelup', { level: 5 });
ok('ev.unlock-never-twice', unlocks.length === 0 && toasts.length === 0 && chat.length === 0, 'repeat events are silent');

// Keşif: distinct waypoints; duplicates do not add progress
for (const id of ['wp_a', 'wp_b', 'wp_c', 'wp_d']) G.events.emit('waypoint:discovered', { id });
ok('ev.set-progress', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'kesif_wp5')) === 4);
ok('ev.set-not-yet', !A.isUnlocked(G.character.save, 'kesif_wp5'));
G.events.emit('waypoint:discovered', { id: 'wp_a' });
ok('ev.set-dedupe', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'kesif_wp5')) === 4, 'same id twice counts once');
clearLogs();
G.events.emit('waypoint:discovered', { id: 'wp_e' });
ok('ev.set-unlock', A.isUnlocked(G.character.save, 'kesif_wp5') && unlocks.length === 1, unlocks.join(','));
ok('ev.set-first-wp', A.isUnlocked(G.character.save, 'kesif_wp1'));

// Savaş: kills by the local player only, Metin stones and mechanic units excluded
G.world.entities.set(501, { def: { id: 'orc_grunt' } });
G.world.entities.set(502, { def: { id: 'metin_stone_1' } });
G.world.entities.set(503, { def: { id: 'proc_spiteful' } });
for (let i = 0; i < 9; i++) G.events.emit('death', { entityId: 501, killerId: 42, pos: [0, 0, 0] });
ok('ev.kill-9', !A.isUnlocked(G.character.save, 'sav_kill10'));
G.events.emit('death', { entityId: 502, killerId: 42, pos: [0, 0, 0] });
G.events.emit('death', { entityId: 503, killerId: 42, pos: [0, 0, 0] });
G.events.emit('death', { entityId: 501, killerId: 99, pos: [0, 0, 0] });
ok('ev.kill-filter', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'sav_kill10')) === 9, 'metin / proc / other killer ignored');
clearLogs();
G.events.emit('death', { entityId: 501, killerId: 42, pos: [0, 0, 0] });
ok('ev.kill-10', A.isUnlocked(G.character.save, 'sav_kill10') && unlocks.includes('sav_kill10'));

// Mitik+ and dungeons: a timed key-5 clear; a failed run changes nothing
G.events.emit('run:completed', { state: { dungeonId: 'kemik_mahzeni', difficulty: 'mythicplus', keyLevel: 5, completed: false, failed: true, inTime: false }, record: null, rewards: [] });
ok('ev.run-failed', !A.isUnlocked(G.character.save, 'mit_clear1') && A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'zin_clear1')) === 0);
clearLogs();
G.events.emit('run:completed', { state: { dungeonId: 'kemik_mahzeni', difficulty: 'mythicplus', keyLevel: 5, completed: true, failed: false, inTime: true }, record: null, rewards: [] });
ok('ev.mplus-key5', A.isUnlocked(G.character.save, 'mit_key5') && A.isUnlocked(G.character.save, 'mit_clear1'));
ok('ev.mplus-timed-progress', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'mit_time5')) === 1 && !A.isUnlocked(G.character.save, 'mit_time5'));
ok('ev.dungeon-clear1', A.isUnlocked(G.character.save, 'zin_clear1'));

// Bosses: the same kill reported twice counts once; 50 distinct kills grant a title
G.events.emit('boss:defeated', { bossId: 'b_test', entityId: 900 });
G.events.emit('boss:defeated', { bossId: 'b_test', entityId: 900 });
ok('ev.boss-dedupe', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'zin_boss1')) === 1);
for (let i = 1; i < 50; i++) G.events.emit('boss:defeated', { bossId: 'b_test', entityId: 900 + i });
ok('ev.boss-50', A.isUnlocked(G.character.save, 'zin_boss50'));

// Gold: only gains count
clearLogs();
G.events.emit('player:gold', { gold: 1500, delta: 1500 });
G.events.emit('player:gold', { gold: 500, delta: -1000 });
ok('ev.gold-gain-only', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'eko_gold1k')) === 1500 && A.isUnlocked(G.character.save, 'eko_gold1k'));

// Upgrades: failures and destroys do not count, +9 counts as the highest level
G.events.emit('item:upgraded', { item: {}, success: false, destroyed: false, newLevel: 4 });
G.events.emit('item:upgraded', { item: {}, success: true, destroyed: true, newLevel: 0 });
G.events.emit('item:upgraded', { item: {}, success: true, destroyed: false, newLevel: 9 });
ok('ev.upgrade-max', A.isUnlocked(G.character.save, 'eko_up9') && !A.isUnlocked(G.character.save, 'eko_up12'));

// Quests: distinct done quests only
G.events.emit('quest:updated', { questId: 'q_one', state: 'done' });
G.events.emit('quest:updated', { questId: 'q_one', state: 'done' });
G.events.emit('quest:updated', { questId: 'q_two', state: 'active', progress: 1 });
ok('ev.quest-distinct', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'gorev_5')) === 1);

// Sosyal: local whispers count, remote chat does not
G.events.emit('chat:line', { from: 'Diger', text: 'merhaba', channel: 'whisper', local: false });
ok('ev.remote-chat-ignored', !A.isUnlocked(G.character.save, 'sos_whisper1'));
G.events.emit('chat:line', { from: 'Ben', text: 'fısıltı', channel: 'whisper', local: true });
ok('ev.whisper-local', A.isUnlocked(G.character.save, 'sos_whisper1'));

// Party: an unlock is broadcast when online (once), not offline
G.net = { isOnline: true, sendChat: (t) => sent.push(t) };
clearLogs();
G.events.emit('player:levelup', { level: 60 });
// a jump to level 60 unlocks every level milestone at once: one broadcast per unlock
ok('ev.party-broadcast', sent.length === unlocks.length && sent.length >= 2 && sent.some((t) => /Sınır Aşan/.test(t)), `${sent.length} sent, ${unlocks.length} unlocks`);
ok('ev.level-60-unlock', A.isUnlocked(G.character.save, 'sev_lv60'));
G.net = { isOnline: false };

// Sound: an unlock plays the achievement sfx
let sfxId = null;
const prevAudio = G.audio;
G.audio = { play: (id) => { sfxId = id; } };
G.events.emit('player:mounted', { on: true });
G.audio = prevAudio;
ok('ev.sfx-on-unlock', A.isUnlocked(G.character.save, 'eko_mount1') && sfxId === 'achievement', `sfx ${sfxId}`);

// ------------------------------------------------------------------------------------------------ title.*
const save = G.character.save;
ok('title.granted', (save.titles ?? []).includes('zin_boss50') && (save.titles ?? []).includes('sev_lv60'), (save.titles ?? []).join(','));
ok('title.none-by-default', save.title === undefined);
ok('title.choose-earned', A.chooseTitle(save, 'zin_boss50') === true && save.title === 'zin_boss50');
ok('title.reject-unearned', A.chooseTitle(save, 'mit_key15') === false && save.title === 'zin_boss50');
ok('title.reject-no-title-achievement', A.chooseTitle(save, 'sos_chat100') === false);
ok('title.clear', A.chooseTitle(save, null) === true && save.title === undefined);
ok('title.name', A.titleName('zin_boss50') === 'Patron Kırıcı');
ok('title.setTitle', A.setTitle('sev_lv60') === true && G.character.save.title === 'sev_lv60');
A.setTitle(null);
ok('title.setTitle-clear', G.character.save.title === undefined);

// ------------------------------------------------------------------------------------------------ save.*
const points = A.totalPoints(save);
const before = D.ACHIEVEMENTS.map((d) => [d.id, A.progressOf(save, d), A.isUnlocked(save, d.id)]);
const dataCopy = JSON.parse(JSON.stringify(save));
const back = SaveMod ? SaveMod.normaliseCharacterSave(dataCopy) : dataCopy;
ok('save.normalise-loaded', SaveMod !== null && typeof SaveMod.normaliseCharacterSave === 'function', 'core/Save.ts normaliseCharacterSave loads');
const after = D.ACHIEVEMENTS.map((d) => [d.id, A.progressOf(back, d), A.isUnlocked(back, d.id)]);
ok('save.roundtrip-progress', JSON.stringify(before) === JSON.stringify(after));
ok('save.roundtrip-points', A.totalPoints(back) === points, `${A.totalPoints(back)} vs ${points}`);
ok('save.roundtrip-no-reunlock', A.checkUnlocks(back, 1).length === 0);
ok('save.roundtrip-done-time', back.achievements.done.sev_lv5 === save.achievements.done.sev_lv5);
ok('save.roundtrip-titles', JSON.stringify(back.titles) === JSON.stringify(save.titles));

// Legacy save (before WP-08): no block; backfill brings the counters the game already keeps
const legacy = CharacterState.create('Eski', 'knight').save;
delete legacy.achievements;
legacy.level = 30;
legacy.stats.kills = 120;
legacy.stats.bossKills = 2;
legacy.stats.dungeonsCompleted = 5;
legacy.flags['world.wp.a'] = true;
legacy.flags['world.wp.b'] = true;
legacy.flags['world.region.r1'] = true;
legacy.flags['q.main_1'] = 'done';
legacy.flags['q.main_1.n0'] = 3;
const firstRun = A.backfill(legacy, 5);
ok('save.backfill-level', A.isUnlocked(legacy, 'sev_lv30'));
ok('save.backfill-kills', A.isUnlocked(legacy, 'sav_kill10') && A.progressOf(legacy, D.ACHIEVEMENTS.find((d) => d.id === 'sav_kill10')) === 120);
ok('save.backfill-flags', A.progressOf(legacy, D.ACHIEVEMENTS.find((d) => d.id === 'kesif_wp5')) === 2 && A.isUnlocked(legacy, 'kesif_reg1') && A.isUnlocked(legacy, 'gorev_1'));
ok('save.backfill-returns-new', firstRun.some((d) => d.id === 'sev_lv30') && firstRun.some((d) => d.id === 'sav_kill10'));
ok('save.backfill-idempotent', A.backfill(legacy, 6).length === 0 && legacy.achievements.v === 1);

// ------------------------------------------------------------------------------------------------ batch.*
// A scene change backfills silently (one summary line, no toast, no party echo); live unlocks in one window share a toast.
{
  await wait(WINDOW); // flush toasts queued by the stages above
  const main = G.character;
  G.net = { isOnline: true, sendChat: (t) => sent.push(t) };
  const legacyCh = CharacterState.create('Toplu', 'knight');
  delete legacyCh.save.achievements;
  legacyCh.save.level = 30;
  legacyCh.save.stats.kills = 120;
  legacyCh.save.stats.bossKills = 2;
  G.character = legacyCh;
  sent.length = 0;
  clearLogs();
  G.events.emit('scene:changed', { id: 'world' });
  const sys = chat.filter((c) => c.channel === 'system');
  ok('batch.backfill-one-line', sys.length === 1 && /^\d+ başarım kazandın \(toplam \d+ puan\)$/.test(sys[0]?.text ?? ''), sys.map((c) => c.text).join(' | '));
  ok('batch.backfill-count', unlocks.length >= 3 && sys[0]?.text === `${unlocks.length} başarım kazandın (toplam ${A.totalPoints(legacyCh.save)} puan)`, `${unlocks.length} unlocks`);
  ok('batch.backfill-silent', toasts.length === 0 && sent.length === 0, `toasts ${toasts.length}, party ${sent.length}`);
  // live: two unlocks in one window -> one merged toast, but one chat line each
  const mergeCh = CharacterState.create('Birlesik', 'knight');
  G.character = mergeCh;
  clearLogs();
  G.events.emit('player:levelup', { level: 5 });
  G.events.emit('waypoint:discovered', { id: 'merge_a' });
  ok('batch.live-both-unlocked', A.isUnlocked(mergeCh.save, 'sev_lv5') && A.isUnlocked(mergeCh.save, 'kesif_wp1'));
  ok('batch.live-toast-waits', toasts.length === 0, 'the toast waits for the window');
  await wait(WINDOW);
  ok('batch.live-one-toast', toasts.length === 1 && /^2 başarım kazanıldı: /.test(toasts[0]), toasts.join(' | '));
  ok('batch.live-chat-each', chat.filter((c) => c.channel === 'system' && /başarımını kazandın!$/.test(c.text)).length === 2);
  ok('batch.live-party-each', sent.length === 2, `party ${sent.length}`);
  G.character = main;
  G.net = { isOnline: false };
}

// The disposer detaches every subscription: later events change nothing
dispose();
const wpBefore = A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'kesif_wp5'));
G.events.emit('waypoint:discovered', { id: 'wp_after_dispose' });
ok('ev.dispose', A.progressOf(G.character.save, D.ACHIEVEMENTS.find((d) => d.id === 'kesif_wp5')) === wpBefore);

console.log(`achievements: ${passes} passed, ${fails} failed`);
H.restoreConsole();
// Errors from this system fail the run. Other console noise (the headless harness has no stat services, so
// CharacterState.recomputeStats logs once per character) is shown but does not.
const mine = H.errors.filter((e) => /achievements/.test(e));
const other = H.errors.filter((e) => !/achievements/.test(e));
if (other.length) console.log(`(${other.length} harness console messages, not from this system; first: ${other[0].slice(0, 120)})`);
if (mine.length) for (const e of mine.slice(0, 10)) console.log('  ' + e);
console.log(fails === 0 && mine.length === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 && mine.length === 0 ? 0 : 1);
