#!/usr/bin/env node
/**
 * Pacing audit (OWNER: content module; first-hour pace + XP parity). Reads the real data the way tools/content-check.mjs
 * does (quests, enemies, Sisli Vadi packs / minibosses / rares / metin tiers) and calls the real XP functions of
 * systems/Progression.ts (xpToNext, monsterXp), so the numbers cannot drift from the game.
 *
 *   node tools/pace-check.mjs            band table + first-chain path
 *
 * Band = 5 levels (1-5, 6-10, ..., 56-59). Per band:
 *   XP to cross     sum of xpToNext(L) over the band's levels (the XP that must be earned to cross the band)
 *   quest XP        one-time quests of the band (main / side / region): xpPct x xpToNext(quest level), and its % of the band
 *                   target ~35 % (allowed 25-45 %; band 1-5 is the tutorial band and allows 25-60 %)
 *   dailies         daily quests of the band: count, XP if every one is done once, average % of a level per daily (target 5-8 %)
 *   kills           Sıradan (rank trash) and Sürü (swarm) kills to cross the band at the same level
 *
 * First chain = main quests mq_01..mq_07 in chain order (the player's first quests), then every other one-time quest of level 1-5
 * (side, region, chains, bonus) in level order: what a player does in the first hour. Assumptions (edit the constants if the design
 * changes): 1 kill / 4 s (a drop objective needs count / chance kills), talk / explore 30 s, boss / elite / metin 60 s, collect and
 * skill casts 4 s each, interact 6 s, use 4 s, escort its seconds, turn-in 10 s, a walk of 45 s between quests, dungeon 600 s.
 *   Monster level = the lowest levelRange of the camps that spawn it (conservative), else the miniboss / rare / metin tier level.
 *   Quest XP is granted at turn-in exactly as systems/Quests.ts grantRewards does. Targets:
 *     level 2 right after chain quest 2 (not after quest 1), level 3 right after chain quest 4 (not after quest 3),
 *     level 5 at about 35 min (30-40 min, 1800-2400 s) on the whole path.
 *   Non-kill XP (discoveries, vistas, dungeons) is not counted, so the path is a lower bound.
 *
 * Needs Node >= 22.18 (native TypeScript type stripping). Exit code 1 when a first-chain target is missed.
 */
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// resolve extension-less relative imports ("./kit") to .ts files like the bundler does (same hook as content-check.mjs)
const hooks = "export async function resolve(s,c,n){try{return await n(s,c)}catch(e){if((e.code==='ERR_MODULE_NOT_FOUND'||e.code==='ERR_UNSUPPORTED_DIR_IMPORT')&&(s.startsWith('.')||s.startsWith('/'))){for(const suf of ['.ts','/index.ts']){try{return await n(s+suf,c)}catch{}}}throw e}}";
register('data:text/javascript,' + encodeURIComponent(hooks));

const rootPath = fileURLToPath(new URL('..', import.meta.url)).split(String.fromCharCode(92)).join('/');
const ROOT = rootPath.endsWith('/') ? rootPath.slice(0, -1) : rootPath;
const imp = (p) => import(pathToFileURL(`${ROOT}/${p}`).href);
const { Progression } = await imp('src/systems/Progression.ts');
const { LEVEL_CAP } = await imp('src/types/character.ts');
const { QUESTS } = await imp('src/data/world/quests.ts');
const { ENEMIES, BOSSES } = await imp('src/data/enemies.ts');
const { DUNGEONS, OPEN_ZONES } = await imp('src/data/dungeons/index.ts');

// ---- XP curve: the real methods (they use no instance state), so the audit matches addXp / grantKillXp / grantRewards
const P = Progression.prototype;
const xpToNext = (L) => P.xpToNext.call({}, L);
const monsterXp = (lvl, rank, xpMult, playerLvl) => P.monsterXp.call({}, lvl, rank, xpMult, playerLvl);

// ---- pace assumptions (seconds)
const KILL_S = 4, TALK_S = 30, EXPLORE_S = 30, BOSS_S = 60, METIN_S = 60, COLLECT_S = 4, SKILL_S = 4, TURN_IN_S = 10, DUNGEON_S = 600;
const INTERACT_S = 6, USE_S = 4, TRAVEL_S = 45;
/** First chain milestones: level 2 right after chain quest 2, level 3 right after chain quest 4, level 5 at about 35 min. */
const TARGET_L5_S = 2100, TARGET_L5_TOL_S = 300;

const sv = { ...DUNGEONS, ...OPEN_ZONES }.sisli_vadi;
const world = sv?.world;
const packs = sv?.packs ?? [];
const enemy = (id) => ENEMIES[id] ?? BOSSES[id];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const finite = (n) => (isFinite(n) ? n : 0);

const kindOf = (q) => (q.daily ? 'daily' : q.main ? 'main' : /^sq_r\d+_/.test(q.id) ? 'region' : /^sq_[gcks]_/.test(q.id) ? 'side' : 'other');
const questXp = (q) => Math.round((q.reward.xpPct / 100) * xpToNext(q.level));

/** Monster level of a kill target: lowest levelRange of the camps that spawn it, else miniboss / rare / metin tier level. */
function mobLevel(id, fallback) {
  const camp = packs.filter((p) => p.levelRange && p.members.some((m) => m.enemyId === id));
  if (camp.length) return Math.min(...camp.map((p) => p.levelRange[0]));
  const solo = world?.rares?.find((x) => x.enemyId === id) ?? world?.minibosses?.find((x) => x.enemyId === id);
  if (solo) return solo.level;
  const tier = world?.metin?.tiers?.find((x) => x.enemyId === id || x.id === id);
  if (tier) return tier.level;
  return fallback;
}

// ---- band table
const CAP = LEVEL_CAP;
const BANDS = [];
for (let lo = 1; lo < CAP; lo += 5) BANDS.push([lo, Math.min(lo + 4, CAP - 1)]);
/** One-time quest XP % range per band: bands 6+ 25-45 (ideal 35); band 1-5 is the tutorial band, 25-60. */
const QUEST_PCT = (lo) => (lo === 1 ? { min: 25, max: 60 } : { min: 25, max: 45 });

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
    trashKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / monsterXp(L, 'trash', 1, L)))),
    swarmKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / monsterXp(L, 'swarm', 0, L)))),
  };
});

// ---- first chain: mq_01..mq_07 in chain order, then the other one-time quests of level 1-5 (level order)
const CHAIN = QUESTS.filter((q) => q.main && /^mq_0[1-7]_/.test(q.id)).sort((a, b) => a.id.localeCompare(b.id));
const chainIds = new Set(CHAIN.map((q) => q.id));
const REST = QUESTS.filter((q) => !q.daily && !q.main && !chainIds.has(q.id) && q.level <= 5)
  .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
let t = 0, lvl = 1, xp = 0;
const reached = {};
const gain = (amount) => {
  xp += finite(amount);
  while (lvl < CAP && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; if (reached[lvl] === undefined) reached[lvl] = t; }
};
const timeline = [];
/** Runs one quest: walk, objectives (kills give XP, drops roll their kills), turn-in, quest XP. */
function runQuest(q) {
  t += TRAVEL_S;
  for (const o of q.objectives) {
    const d = o.target ? enemy(o.target) : undefined;
    if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin' || o.kind === 'elite') {
      const mlvl = mobLevel(o.target, q.level);
      const rank = d ? (d.role === 'swarm' ? 'swarm' : d.rank) : 'trash';
      const n = o.kind === 'kill' ? o.count : 1;
      const secs = o.kind === 'kill' ? KILL_S : o.kind === 'metin' ? METIN_S : BOSS_S;
      for (let i = 0; i < n; i++) { t += secs; if (d) gain(monsterXp(mlvl, rank, d.xp, lvl)); }
    } else if (o.kind === 'drop') {
      const src = o.from?.[0];
      const sd = src ? enemy(src) : undefined;
      const mlvl = src ? mobLevel(src, q.level) : q.level;
      const rank = sd ? (sd.role === 'swarm' ? 'swarm' : sd.rank) : 'trash';
      const kills = Math.ceil(o.count / (o.chance ?? 0.6));
      for (let i = 0; i < kills; i++) { t += KILL_S; if (sd) gain(monsterXp(mlvl, rank, sd.xp, lvl)); }
    } else if (o.kind === 'collect') t += COLLECT_S * o.count;
    else if (o.kind === 'skill') t += SKILL_S * o.count;
    else if (o.kind === 'interact') t += INTERACT_S * o.count;
    else if (o.kind === 'use') t += USE_S * o.count;
    else if (o.kind === 'escort') t += o.count;
    else if (o.kind === 'talk') t += TALK_S;
    else if (o.kind === 'explore') t += EXPLORE_S;
    else if (o.kind === 'dungeon') t += DUNGEON_S;
  }
  t += TURN_IN_S;
  const qx = questXp(q);
  gain(qx);
  timeline.push({ id: q.id, t, lvl, xp, qx });
}
for (const q of CHAIN) runQuest(q);
const chainEnd = timeline.length;
for (const q of REST) runQuest(q);

// ---- report
const f = (n, w) => String(n).padStart(w);
const p1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const kinds = QUESTS.reduce((m, q) => ((m[kindOf(q)] = (m[kindOf(q)] ?? 0) + 1), m), {});
console.log(`pace-check | ${QUESTS.length} quests (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) | level cap ${CAP}`);
console.log('\nBands (5 levels). quest % = one-time quests / XP to cross the band (target 25-45, ideal 35; band 1-5 tutorial 25-60). dailies: avg % of a level per daily (target 5-8).');
console.log(`${'band'.padEnd(6)}${f('XP to cross', 13)}${f('main', 9)}${f('side', 9)}${f('region', 9)}${f('quest %', 9)}${f('dailies', 9)}${f('d/day XP', 10)}${f('d %', 7)}${f('Sıradan', 9)}${f('Sürü', 8)}`);
for (const r of rows) {
  console.log(`${r.band.padEnd(6)}${f(r.need, 13)}${f(r.main, 9)}${f(r.side, 9)}${f(r.region, 9)}${f(p1(r.oneTimePct) + '%', 9)}${f(r.dailies, 9)}${f(r.dailyXp, 10)}${f(p1(r.dailyPct) + '%', 7)}${f(r.trashKills, 9)}${f(r.swarmKills, 8)}`);
}
const badQuest = rows.filter((r) => r.need && r.oneTime && (r.oneTimePct < r.quest.min || r.oneTimePct > r.quest.max));
const badDaily = rows.filter((r) => r.dailies && (r.dailyPct < 5 || r.dailyPct > 8));
console.log(`\nbands outside their one-time quest XP range (25-45 %; band 1-5 25-60 %): ${badQuest.length ? badQuest.map((r) => r.band).join(', ') : 'none'}`);
console.log(`bands outside 5-8 % per daily: ${badDaily.length ? badDaily.map((r) => r.band).join(', ') : 'none'}`);
console.log('Sıradan / Sürü = kills to cross the band at the same level (rank trash x1, swarm as the game grants it).');

console.log(`\nFirst chain: ${CHAIN.map((q) => q.id.slice(0, 5)).join(' ')} (then ${REST.length} one-time quests of level 1-5)`);
for (const s of timeline.slice(0, chainEnd)) console.log(`  ${s.id.padEnd(24)} t=${f(s.t, 4)} s  level ${s.lvl}  xp ${f(s.xp, 4)}  (quest +${s.qx})`);
console.log(`  then ${REST.length} quests (level 1-5): level 5 at ${reached[5] ?? '-'} s`);
let bad = 0;
const check = (ok, label, detail) => { if (!ok) bad++; console.log(`  ${label}: ${detail} ${ok ? 'PASS' : 'FAIL'}`); };
const lvlAfter = (i) => timeline[i - 1]?.lvl ?? 1;
check(lvlAfter(2) >= 2 && lvlAfter(1) < 2, 'level 2 right after chain quest 2', `level ${lvlAfter(1)} after quest 1, ${lvlAfter(2)} after quest 2`);
check(lvlAfter(4) >= 3 && lvlAfter(3) < 3, 'level 3 right after chain quest 4', `level ${lvlAfter(3)} after quest 3, ${lvlAfter(4)} after quest 4`);
const at5 = reached[5];
check(at5 !== undefined && Math.abs(at5 - TARGET_L5_S) <= TARGET_L5_TOL_S, 'level 5 at about 30-40 min',
  at5 === undefined ? 'not reached on the path' : `${at5} s (${(at5 / 60).toFixed(1)} min)`);
bad += badQuest.length + badDaily.length;
process.exit(bad ? 1 : 0);
