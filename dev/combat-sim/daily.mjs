#!/usr/bin/env node
/**
 * WP-10 daily loop headless checks (docs/MMO_PILLARS.md): src/systems/DailyLoop.ts and the three daily achievements.
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/daily.mjs     (V=1 prints every PASS)
 * Stages: day.* (04:00 day key, shifts, flag pruning) | streak.* (consecutive logins, missed day reset, rewards) |
 *         rest.* (rested accrual while resting or logged out, cap 1.5 levels, kills x2 until consumed, level cap) |
 *         wq.* (6 deterministic world quests per zone and day, rotation, progress cap) | gd.* (daily dungeon pick) |
 *         vil.* (village boxes) | ach.* (the three daily achievements and their metrics) | wire.* (static wiring)
 * No browser, no network. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const D = await H.imp('systems/DailyLoop.ts');
const B = await H.imp('systems/Bounties.ts');
const A = await H.imp('systems/Achievements.ts');
const ACH = await H.imp('data/achievements.ts');
const DUNGEONS_MOD = await H.imp('data/dungeons/index.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const local = (y, mo, d, h, mi = 0) => new Date(y, mo, d, h, mi, 0);

// ------------------------------------------------------------------------------------------------ day.*
{
  ok('day.reset-0359', B.bountyDayKey(local(2026, 9, 13, 3, 59)) === 20261012, `${B.bountyDayKey(local(2026, 9, 13, 3, 59))}`);
  ok('day.reset-0400', B.bountyDayKey(local(2026, 9, 13, 4, 0)) === 20261013);
  ok('day.midnight-after-reset', B.bountyDayKey(local(2026, 9, 14, 0, 30)) === 20261013, 'still the 13th bounty day until 04:00');
  ok('day.shift-month', D.shiftDayKey(20261001, -1) === 20260930);
  ok('day.shift-year', D.shiftDayKey(20261231, 1) === 20270101);
  ok('day.shift-leap', D.shiftDayKey(20240228, 1) === 20240229 && D.shiftDayKey(20240229, 1) === 20240301);
  ok('day.shift-back-7', D.shiftDayKey(20261013, -7) === 20261006);
  const flags = { 'bounty.20261013.reroll': 1, 'wq.20261012.sisli_vadi.wq_kill40': 9, 'wq.20261013.sisli_vadi.wq_kill40': 3, 'gd.20261012.done': true, 'gd.20261013.done': true, 'q.main': true };
  D.pruneDayFlags(flags, 20261013);
  ok('day.prune-old', !('wq.20261012.sisli_vadi.wq_kill40' in flags) && !('gd.20261012.done' in flags));
  ok('day.prune-keeps-today', flags['wq.20261013.sisli_vadi.wq_kill40'] === 3 && flags['gd.20261013.done'] === true);
  ok('day.prune-keeps-other', flags['bounty.20261013.reroll'] === 1 && flags['q.main'] === true);
}

// ------------------------------------------------------------------------------------------------ streak.*
{
  const fresh = D.loginStep({ streak: 0, streakDay: 0 }, 20261013);
  ok('streak.first-login', fresh.fresh && fresh.streak === 1);
  const cont = D.loginStep({ streak: 3, streakDay: 20261012 }, 20261013);
  ok('streak.consecutive', cont.fresh && cont.streak === 4);
  const same = D.loginStep({ streak: 4, streakDay: 20261013 }, 20261013);
  ok('streak.same-day-noop', !same.fresh && same.streak === 4);
  const missed = D.loginStep({ streak: 5, streakDay: 20261011 }, 20261013);
  ok('streak.missed-day-resets', missed.fresh && missed.streak === 1, `streak ${missed.streak}`);
  const month = D.loginStep({ streak: 2, streakDay: 20260930 }, 20261001);
  ok('streak.across-month', month.fresh && month.streak === 3);
  // ten days in a row, then a gap, then two more
  let d = { streak: 0, streakDay: 0 };
  let day = 20261001;
  for (let i = 0; i < 10; i++) {
    const s = D.loginStep(d, day);
    d = { streak: s.streak, streakDay: day };
    day = D.shiftDayKey(day, 1);
  }
  ok('streak.ten-days', d.streak === 10, `${d.streak}`);
  day = D.shiftDayKey(day, 1); // skip one day
  const s2 = D.loginStep(d, day);
  d = { streak: s2.streak, streakDay: day };
  ok('streak.gap-resets-after-ten', d.streak === 1);
  const r1 = D.loginReward(1, 30), r7 = D.loginReward(7, 30), r8 = D.loginReward(8, 30);
  ok('streak.reward-day1', r1.gold === 750 && r1.muhru === 0, JSON.stringify(r1));
  ok('streak.reward-day7', r7.gold === 5250 && r7.muhru === 2, JSON.stringify(r7));
  ok('streak.reward-cycle', r8.gold === r1.gold && r8.muhru === 0, 'day 8 starts the cycle again');
  ok('streak.reward-small', D.loginReward(7, 60).gold < 100 * 60 * 2, 'a login stays below two bounty gold rewards at level 60');
}

// ------------------------------------------------------------------------------------------------ rest.*
{
  const XP = 10000;
  const d = { rested: 0, restedAt: T0 };
  let gained = D.accrueRested(d, T0 + 8 * HOUR, true, XP);
  ok('rest.8h-rest-5pct', near(gained, 0.05 * XP) && near(d.rested, 500), `${gained}`);
  const field = { rested: 0, restedAt: T0 };
  gained = D.accrueRested(field, T0 + 8 * HOUR, false, XP);
  ok('rest.field-no-accrual', gained === 0 && field.rested === 0 && field.restedAt === T0 + 8 * HOUR);
  // logged out after 1 h in the field: only the time after the last tick counts
  const mixed = { rested: 0, restedAt: T0 };
  D.accrueRested(mixed, T0 + HOUR, false, XP); // field hour, no accrual
  gained = D.accrueRested(mixed, T0 + 3 * HOUR, true, XP); // 2 h logged out
  ok('rest.offline-after-field', near(gained, 2 * (0.05 / 8) * XP), `${gained}`);
  // cap 1.5 levels
  const capped = { rested: 0, restedAt: T0 };
  D.accrueRested(capped, T0 + 1000 * HOUR, true, XP);
  ok('rest.cap-1.5-levels', near(capped.rested, 1.5 * XP), `${capped.rested}`);
  gained = D.accrueRested(capped, T0 + 2000 * HOUR, true, XP);
  ok('rest.at-cap-no-more', gained === 0 && near(capped.rested, 1.5 * XP));
  ok('rest.cap-value', near(D.restedCap(XP), 15000));
  ok('rest.level-cap-zero', D.restedCap(Infinity) === 0);
  const maxed = { rested: 999, restedAt: T0 };
  gained = D.accrueRested(maxed, T0 + 5 * HOUR, true, Infinity);
  ok('rest.max-level-no-accrual', gained === 0 && maxed.rested === 999);
  // first ever login: no gap, no accrual
  const newbie = { rested: 0, restedAt: 0 };
  gained = D.accrueRested(newbie, T0, true, XP);
  ok('rest.new-character-no-gap', gained === 0 && newbie.restedAt === T0);
  // kills x2 until consumed
  const pool = { rested: 50 };
  const b1 = D.consumeRested(pool, 30);
  ok('rest.kill-doubled', b1 === 30 && pool.rested === 20, `bonus ${b1}, pool ${pool.rested}`);
  const b2 = D.consumeRested(pool, 30);
  ok('rest.kill-partial-last', b2 === 20 && pool.rested === 0, `bonus ${b2}`);
  const b3 = D.consumeRested(pool, 30);
  ok('rest.kill-after-empty-single', b3 === 0 && pool.rested === 0);
  ok('rest.zero-base-safe', D.consumeRested({ rested: 10 }, 0) === 0);
  // the save helpers
  const save = { flags: {}, achievements: undefined };
  const dd = D.dailySave(save);
  ok('rest.save-created', dd.rested === 0 && dd.restedAt === 0 && dd.streak === 0 && dd.streakDay === 0 && save.daily === dd);
  ok('rest.pool-clamped-to-cap', D.restedPool({ daily: { rested: 99999, restedAt: 0, streak: 0, streakDay: 0 } }, XP) === 1.5 * XP);
  ok('rest.pool-empty-save', D.restedPool({}, XP) === 0);
}

// ------------------------------------------------------------------------------------------------ wq.*
{
  const ZONES = D.WORLD_QUEST_ZONES;
  ok('wq.zones', ZONES.length === 2 && ZONES.includes('sisli_vadi') && ZONES.includes('karakir_bozkiri') && !ZONES.includes('kizil_sinir'));
  const pool = D.WORLD_QUEST_POOL;
  ok('wq.pool-unique', new Set(pool.map((q) => q.id)).size === pool.length && pool.length >= D.WORLD_QUESTS_PER_ZONE);
  ok('wq.pool-kinds', pool.every((q) => ['kill', 'elite', 'boss', 'metin', 'gold'].includes(q.kind) && q.target > 0));
  const ids = (z, day) => D.pickWorldQuests(z, day).map((q) => q.id);
  const a1 = ids('sisli_vadi', 20261013), a2 = ids('sisli_vadi', 20261013);
  ok('wq.six-per-zone', a1.length === 6, `${a1.length}`);
  ok('wq.unique-in-day', new Set(a1).size === 6);
  ok('wq.deterministic', a1.join() === a2.join());
  let sameDaily = true;
  const sets = new Set();
  for (let i = 0; i < 30; i++) {
    const day = D.shiftDayKey(20261001, i);
    const s = ids('sisli_vadi', day);
    sets.add([...s].sort().join());
    if (s.length !== 6 || new Set(s).size !== 6) sameDaily = false;
  }
  ok('wq.rotates-over-30-days', sets.size >= 10, `${sets.size} distinct sets`);
  ok('wq.always-six-unique', sameDaily);
  const k1 = ids('karakir_bozkiri', 20261013);
  let zonesDiffer = false;
  for (let i = 0; i < 10; i++) {
    const day = D.shiftDayKey(20261001, i);
    if (ids('sisli_vadi', day).join() !== ids('karakir_bozkiri', day).join()) zonesDiffer = true;
  }
  ok('wq.zones-differ', zonesDiffer && k1.length === 6);
  // progress and board
  const flags = { [`wq.20261013.sisli_vadi.wq_kill40`]: 45 };
  const kill40 = pool.find((q) => q.id === 'wq_kill40');
  ok('wq.progress-capped', D.worldQuestProgress(flags, 'sisli_vadi', 20261013, kill40) === 40);
  ok('wq.progress-other-day-zero', D.worldQuestProgress(flags, 'sisli_vadi', 20261014, kill40) === 0);
  ok('wq.progress-other-zone-zero', D.worldQuestProgress(flags, 'karakir_bozkiri', 20261013, kill40) === 0);
  const board = D.worldQuestBoard(flags, 'sisli_vadi', 20261013);
  ok('wq.board-size', board.length === 6);
  const row = board.find((r) => r.def.id === 'wq_kill40');
  if (row) ok('wq.board-done-flag', row.done === (row.progress >= 40));
  ok('wq.board-kill40-when-picked', !row || (row.progress === 40 && row.done === true));
  // gold quests take a sum; a day's flags are pruned by pruneDayFlags
  ok('wq.kind-metin-exists', pool.some((q) => q.kind === 'metin') && pool.some((q) => q.kind === 'gold'));
}

// ------------------------------------------------------------------------------------------------ gd.*
{
  ok('gd.below-8-none', D.pickDailyDungeon(20261013, 5) === null);
  const ids = DUNGEONS_MOD.DUNGEON_IDS;
  const pick30 = D.pickDailyDungeon(20261013, 30);
  ok('gd.in-dungeon-list', ids.includes(pick30), `${pick30}`);
  ok('gd.deterministic', D.pickDailyDungeon(20261013, 30) === pick30 && D.pickDailyDungeon(20261013, 30) === pick30);
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const p = D.pickDailyDungeon(D.shiftDayKey(20261001, i), 30);
    if (p) seen.add(p);
  }
  ok('gd.random-over-days', seen.size >= 2, `${[...seen].join(', ')}`);
  for (let lvl = 8; lvl <= 52; lvl += 4) {
    const p = D.pickDailyDungeon(20261013, lvl);
    const r = DUNGEONS_MOD.DUNGEONS[p]?.levelRange;
    ok(`gd.level-${lvl}-reachable`, !!p && r[0] <= lvl, `${p}`);
  }
}

// ------------------------------------------------------------------------------------------------ vil.*
{
  // a village at tile (100, 100): centre (402, 402) m, walled half size 40 m, a smaller safe box of 5 m
  const v = { id: 'v', name: 'V', center: [100, 100], bounds: [40, 40], spawn: { pos: [0, 0], facing: 0 }, props: [], npcs: [], gates: [] };
  const vs = { ...v, safe: { halfX: 5, halfZ: 5 } };
  ok('vil.inside-walls', D.inVillageBox([v], 402 + 30, 402 - 20));
  ok('vil.outside-walls', !D.inVillageBox([v], 402 + 50, 402));
  ok('vil.safe-box-smaller', !D.inVillageBox([vs], 402 + 10, 402) && D.inVillageBox([vs], 402 + 4, 402 - 4));
  ok('vil.no-villages', !D.inVillageBox([], 0, 0));
}

// ------------------------------------------------------------------------------------------------ ach.*
{
  const byId = Object.fromEntries(ACH.ACHIEVEMENTS.map((a) => [a.id, a]));
  for (const id of ['gorev_gun7', 'gorev_dunya30', 'gorev_gunzindan10']) ok(`ach.${id}-exists`, !!byId[id]);
  ok('ach.metrics-known', ['loginStreak', 'worldQuests', 'dailyDungeons'].every((m) => m in ACH.METRIC_KIND));
  ok('ach.loginStreak-max', ACH.METRIC_KIND.loginStreak === 'max');
  ok('ach.add-kinds', ACH.METRIC_KIND.worldQuests === 'add' && ACH.METRIC_KIND.dailyDungeons === 'add');
  ok('ach.count-in-range', ACH.ACHIEVEMENTS.length >= 55 && ACH.ACHIEVEMENTS.length <= 70, `${ACH.ACHIEVEMENTS.length}`);
  const save = { level: 1, xp: 0, flags: {}, stats: {} };
  A.raise(save, 'loginStreak', 6);
  ok('ach.streak6-not-yet', !A.checkUnlocks(save, T0).some((x) => x.id === 'gorev_gun7'));
  A.raise(save, 'loginStreak', 7);
  ok('ach.streak7-unlocks', A.checkUnlocks(save, T0).some((x) => x.id === 'gorev_gun7'));
  for (let i = 0; i < 30; i++) A.bump(save, 'worldQuests', 1);
  ok('ach.world30-unlocks', A.checkUnlocks(save, T0).some((x) => x.id === 'gorev_dunya30'));
  for (let i = 0; i < 9; i++) A.bump(save, 'dailyDungeons', 1);
  ok('ach.gunzindan-9-no', !A.isUnlocked(save, 'gorev_gunzindan10'));
  A.bump(save, 'dailyDungeons', 1);
  const u = A.checkUnlocks(save, T0).find((x) => x.id === 'gorev_gunzindan10');
  ok('ach.gunzindan-10-title', !!u && u.title === 'Günün Kahramanı' && save.titles.includes('gorev_gunzindan10'));
}

// ------------------------------------------------------------------------------------------------ wire.*
{
  const src = (rel) => readFileSync(fileURLToPath(new URL(`../../src/${rel}`, import.meta.url)), 'utf8');
  const loot = src('systems/LootSystem.ts');
  ok('wire.kill-xp-uses-rested', /addXp\(xp \+ restedKillBonus\(xp\)\)/.test(loot));
  ok('wire.quests-untouched', !/DailyLoop/.test(src('systems/Quests.ts')) && !/restedKillBonus/.test(src('systems/Quests.ts')), 'quest XP never reads the rested pool');
  ok('wire.bounties-untouched', !/restedKillBonus/.test(src('systems/Bounties.ts')));
  ok('wire.game-installs', /installDailyLoop\(\)/.test(src('game/Game.ts')));
  ok('wire.xp-strip-tint', /restedPool\(/.test(src('ui/hud/XpStrip.ts')));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
