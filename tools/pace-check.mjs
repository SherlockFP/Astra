#!/usr/bin/env node
/**
 * Pacing audit (OWNER: content module; first-hour pace + XP parity). The first-hour chain comes from tools/xp-ledger.mjs (the real
 * Progression / Quests / LootSystem formulas on the real quest and camp data). pace-check and the ledger share that module, so the
 * numbers cannot drift between the two tools.
 *
 *   node tools/pace-check.mjs            band table + first-hour pace route (+ greedy route for information)
 *   node tools/xp-ledger.mjs             the full ledger: XP per quest / grind block, level and time after each step
 *
 * Band = 5 levels (1-5, 6-10, ..., 56-59). Per band:
 *   XP to cross     sum of xpToNext(L) over the band's levels (the XP that must be earned to cross the band)
 *   quest XP        one-time quests of the band (main / side / region): xpPct x xpToNext(quest level), and its % of the band
 *                   target ~35 % (allowed 25-45 %; band 1-5 is the tutorial band and allows 25-60 %)
 *   dailies         daily quests of the band: count, XP if every one is done once, average % of a level per daily (target 5-8 %)
 *   kills           Sıradan (rank trash) and Sürü (swarm) kills to cross the band at the same level
 *
 * First-hour targets (pace route, turn-in semantics): level 2 right after chain quest 2, level 3 right after chain quest 4
 * (6-8 min), level 4 at about 15 min (13-17 min), level 5 at about 25 min (24-35 min). Exit code 1 when a target is missed.
 */
import { xpToNext, killXp, questXp, kindOf, replayFirstHour, sideQuestReport, SIDE_MIN_SHARE, QUESTS, LEVEL_CAP } from './xp-ledger.mjs';

const f = (n, w) => String(n).padStart(w);
const p1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const mins = (s) => (s / 60).toFixed(1);

// ---- band table
const CAP = LEVEL_CAP;
const BANDS = [];
for (let lo = 1; lo < CAP; lo += 5) BANDS.push([lo, Math.min(lo + 4, CAP - 1)]);
/** One-time quest XP % range per band: bands 6+ 25-45 (ideal 35); band 1-5 is the tutorial starting zone, 25-150: as in WoW, doing every starting-zone quest out-levels the zone (the XP ledger routes check the actual pace). */
const QUEST_PCT = (lo) => (lo === 1 ? { min: 25, max: 150 } : { min: 25, max: 45 });

const rows = BANDS.map(([lo, hi]) => {
  const levels = range(lo, hi);
  const need = sum(levels.map(xpToNext));
  const inBand = QUESTS.filter((q) => q.level >= lo && q.level <= hi);
  const xpOf = (k) => sum(inBand.filter((q) => kindOf(q) === k).map(questXp));
  const main = xpOf('main'), side = xpOf('side'), region = xpOf('region');
  const oneTime = main + side + region;
  const dailies = inBand.filter((q) => kindOf(q) === 'daily');
  const dailyXp = sum(dailies.map(questXp));
  return {
    band: `${lo}-${hi}`,
    need,
    main, side, region, oneTime,
    oneTimePct: need ? (100 * oneTime) / need : 0,
    quest: QUEST_PCT(lo),
    dailies: dailies.length,
    dailyXp,
    dailyPct: avg(dailies.map((q) => q.reward.xpPct)),
    trashKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / killXp(L, 'trash', 1, L, true)))),
    swarmKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / killXp(L, 'swarm', 0, L, true)))),
  };
});

const kinds = QUESTS.reduce((m, q) => ((m[kindOf(q)] = (m[kindOf(q)] ?? 0) + 1), m), {});
console.log(`pace-check | ${QUESTS.length} quests (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) | level cap ${CAP}`);
console.log('\nBands (5 levels). quest % = one-time quests / XP to cross the band (target 25-45, ideal 35; band 1-5 tutorial 25-150). dailies: avg % of a level per daily (target 5-8).');
console.log(`${'band'.padEnd(6)}${f('XP to cross', 13)}${f('main', 9)}${f('side', 9)}${f('region', 9)}${f('quest %', 9)}${f('dailies', 9)}${f('d/day XP', 10)}${f('d %', 7)}${f('Sıradan', 9)}${f('Sürü', 8)}`);
for (const r of rows) {
  console.log(`${r.band.padEnd(6)}${f(r.need, 13)}${f(r.main, 9)}${f(r.side, 9)}${f(r.region, 9)}${f(p1(r.oneTimePct) + '%', 9)}${f(r.dailies, 9)}${f(r.dailyXp, 10)}${f(p1(r.dailyPct) + '%', 7)}${f(r.trashKills, 9)}${f(r.swarmKills, 8)}`);
}
const badQuest = rows.filter((r) => r.need && r.oneTime && (r.oneTimePct < r.quest.min || r.oneTimePct > r.quest.max));
const badDaily = rows.filter((r) => r.dailies && (r.dailyPct < 5 || r.dailyPct > 8));
console.log(`\nbands outside their one-time quest XP range (25-45 %; band 1-5 25-150 %): ${badQuest.length ? badQuest.map((r) => r.band).join(', ') : 'none'}`);
console.log(`bands outside 5-8 % per daily: ${badDaily.length ? badDaily.map((r) => r.band).join(', ') : 'none'}`);
console.log('Sıradan / Sürü = kills to cross the band at the same level (rank trash x1, swarm as the game grants it).');

// ---- first hour: the ledger's pace route (chain + the grind its level gates need)
const pace = replayFirstHour({ side: false });
const greedy = replayFirstHour({ side: true });
console.log('\nFirst hour, pace route (ledger: chain mq_01..07 with the level gates, grind where a gate is above the player):');
const lastChain = pace.steps.findIndex((s) => s.kind === 'quest' && s.id.startsWith('mq_07'));
for (const s of pace.steps.slice(0, lastChain + 1)) {
  if (s.kind === 'grind') console.log(`  ${s.id.padEnd(30)} t=${f(s.t, 5)} s (${mins(s.t)} min)  level ${s.lvl}  xp ${f(Math.round(s.xp), 5)}`);
  else console.log(`  ${s.id.padEnd(30)} t=${f(s.t, 5)} s (${mins(s.t)} min)  level ${s.lvl}  xp ${f(Math.round(s.xp), 5)}  (quest +${s.quest}, gate L${s.gate})`);
}
console.log(`  then ${pace.steps.length - lastChain - 1} one-time quests of level 1-5 (xp-ledger.mjs prints them)`);
console.log(`  level 2 at ${pace.reached[2]} s, level 3 at ${pace.reached[3]} s, level 4 at ${pace.reached[4]} s, level 5 at ${pace.reached[5]} s`);
console.log(`  greedy route (also takes every side quest of Gümüşdere / Orta Karakol on the way):${Object.entries(greedy.reached).slice(0, 5).map(([L, t]) => `L${L}@${mins(t)}min`).join(' ')}`);

let bad = 0;
const check = (ok, label, detail) => { if (!ok) bad++; console.log(`  ${label}: ${detail} ${ok ? 'PASS' : 'FAIL'}`); };
const chainSteps = pace.steps.filter((s) => s.kind === 'quest' && s.id.startsWith('mq_'));
const lvlAfterChain = (i) => chainSteps[i - 1]?.lvl ?? 1;
check(lvlAfterChain(2) >= 2 && lvlAfterChain(1) < 2, 'level 2 right after chain quest 2', `level ${lvlAfterChain(1)} after quest 1, ${lvlAfterChain(2)} after quest 2`);
check(lvlAfterChain(4) >= 3 && lvlAfterChain(3) < 3, 'level 3 right after chain quest 4', `level ${lvlAfterChain(3)} after quest 3, ${lvlAfterChain(4)} after quest 4`);
const window = (L, lo, hi) => {
  const t = pace.reached[L];
  check(t !== undefined && t >= lo * 60 && t <= hi * 60, `level ${L} at ${lo}-${hi} min`, t === undefined ? 'not reached' : `${mins(t)} min`);
};
window(3, 6, 8);
window(4, 13, 17);
window(5, 24, 35);

// greedy route (every side quest of the towns taken): faster than the chain alone, because side quests now pay their time
const gReached = (L, maxMin) => {
  const t = greedy.reached[L];
  check(t !== undefined && t <= maxMin * 60, `greedy route: level ${L} by ${maxMin} min`, t === undefined ? 'not reached' : `${mins(t)} min`);
};
gReached(3, 9);
gReached(5, 30);

// side quests of levels 1-5: XP per minute (ledger time incl. walking, kill XP included) >= SIDE_MIN_SHARE of the main chain's at their level
const sides = sideQuestReport(pace.rate);
const under = sides.filter((s) => s.share < SIDE_MIN_SHARE);
check(under.length === 0, `side quests >= ${Math.round(SIDE_MIN_SHARE * 100)} % of the main XP/min at their level (${sides.length} quests)`,
  under.length ? under.map((s) => `${s.id} ${Math.round(s.share * 100)} %`).join(', ') : 'all pass');
bad += badQuest.length + badDaily.length;
process.exit(bad ? 1 : 0);
