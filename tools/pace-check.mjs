#!/usr/bin/env node
/**
 * Pacing audit (OWNER: content module; F3 "first 10 minutes" + XP parity). Reads the real data the way tools/content-check.mjs
 * does (quests, enemies, Sisli Vadi packs / minibosses / rares / metin tiers) and calls the real XP functions of
 * systems/Progression.ts (xpToNext, monsterXp), so the numbers cannot drift from the game.
 *
 *   node tools/pace-check.mjs            band table + first-10-minutes path
 *
 * Band = 5 levels (1-5, 6-10, ..., 56-59). Per band:
 *   XP to cross     sum of xpToNext(L) over the band's levels (the XP that must be earned to cross the band)
 *   quest XP        one-time quests of the band (main / side / region): xpPct x xpToNext(quest level), and its % of the band
 *                   target ~35 % (allowed 25-45 %)
 *   dailies         daily quests of the band: count, XP if every one is done once, average % of a level per daily (target 5-8 %)
 *   kills           Sıradan (rank trash) and Sürü (swarm) kills to cross the band at the same level
 *
 * First 10 minutes = main quests mq_01..mq_06 in chain order. Assumptions (edit the constants if the design changes):
 *   1 kill / 4 s, talk / explore 30 s, boss / metin 60 s, collect and skill casts 4 s each, turn-in 10 s, dungeon 600 s.
 *   Monster level = the lowest levelRange of the camps that spawn it (conservative), else the miniboss / rare / metin tier level.
 *   Quest XP is granted at turn-in exactly as systems/Quests.ts grantRewards does. Targets: level 2 by 90 s, level 3 at about 240 s
 *   (+-30 s). Non-kill XP (discoveries, vistas, dungeons) is not counted, so the path is a lower bound.
 *
 * Needs Node >= 22.18 (native TypeScript type stripping). Exit code 1 when a first-10-minutes target is missed.
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
const TARGET_L2_S = 90, TARGET_L3_S = 240, TARGET_TOL_S = 30;

const sv = { ...DUNGEONS, ...OPEN_ZONES }.sisli_vadi;
const world = sv?.world;
const packs = sv?.packs ?? [];
const enemy = (id) => ENEMIES[id] ?? BOSSES[id];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const finite = (n) => (isFinite(n) ? n : 0);

const kindOf = (q) => (q.daily ? 'daily' : q.main ? 'main' : /^sq_r\d_/.test(q.id) ? 'region' : /^sq_[gcks]_/.test(q.id) ? 'side' : 'other');
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
    dailies: dailies.length,
    dailyXp,
    dailyPct: avg(dailies.map((q) => q.reward.xpPct)),
    trashKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / monsterXp(L, 'trash', 1, L)))),
    swarmKills: sum(levels.map((L) => Math.ceil(xpToNext(L) / monsterXp(L, 'swarm', 0, L)))),
  };
});

// ---- first 10 minutes: main chain mq_01..mq_06, 1 kill / 4 s, turn-ins 10 s, quest XP at turn-in
const PATH = QUESTS.filter((q) => q.main && /^mq_0[1-6]_/.test(q.id)).sort((a, b) => a.id.localeCompare(b.id));
let t = 0, lvl = 1, xp = 0;
const reached = {};
const gain = (amount) => {
  xp += finite(amount);
  while (lvl < CAP && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; if (reached[lvl] === undefined) reached[lvl] = t; }
};
const timeline = [];
for (const q of PATH) {
  for (const o of q.objectives) {
    const d = o.target ? enemy(o.target) : undefined;
    if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin') {
      const mlvl = mobLevel(o.target, q.level);
      const rank = d ? (d.role === 'swarm' ? 'swarm' : d.rank) : 'trash';
      const n = o.kind === 'kill' ? o.count : 1;
      const secs = o.kind === 'kill' ? KILL_S : o.kind === 'boss' ? BOSS_S : METIN_S;
      for (let i = 0; i < n; i++) { t += secs; if (d) gain(monsterXp(mlvl, rank, d.xp, lvl)); }
    } else if (o.kind === 'collect') t += COLLECT_S * o.count;
    else if (o.kind === 'skill') t += SKILL_S * o.count;
    else if (o.kind === 'talk') t += TALK_S;
    else if (o.kind === 'explore') t += EXPLORE_S;
    else if (o.kind === 'dungeon') t += DUNGEON_S;
  }
  t += TURN_IN_S;
  const qx = questXp(q);
  gain(qx);
  timeline.push({ id: q.id, t, lvl, xp, qx });
}

// ---- report
const f = (n, w) => String(n).padStart(w);
const p1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const kinds = QUESTS.reduce((m, q) => ((m[kindOf(q)] = (m[kindOf(q)] ?? 0) + 1), m), {});
console.log(`pace-check | ${QUESTS.length} quests (${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ')}) | level cap ${CAP}`);
console.log('\nBands (5 levels). quest % = one-time quests / XP to cross the band (target 25-45, ideal 35). dailies: avg % of a level per daily (target 5-8).');
console.log(`${'band'.padEnd(6)}${f('XP to cross', 13)}${f('main', 9)}${f('side', 9)}${f('region', 9)}${f('quest %', 9)}${f('dailies', 9)}${f('d/day XP', 10)}${f('d %', 7)}${f('Sıradan', 9)}${f('Sürü', 8)}`);
for (const r of rows) {
  console.log(`${r.band.padEnd(6)}${f(r.need, 13)}${f(r.main, 9)}${f(r.side, 9)}${f(r.region, 9)}${f(p1(r.oneTimePct) + '%', 9)}${f(r.dailies, 9)}${f(r.dailyXp, 10)}${f(p1(r.dailyPct) + '%', 7)}${f(r.trashKills, 9)}${f(r.swarmKills, 8)}`);
}
const badQuest = rows.filter((r) => r.need && r.oneTime && (r.oneTimePct < 25 || r.oneTimePct > 45));
const badDaily = rows.filter((r) => r.dailies && (r.dailyPct < 5 || r.dailyPct > 8));
console.log(`\nbands outside 25-45 % one-time quest XP: ${badQuest.length ? badQuest.map((r) => r.band).join(', ') : 'none'}`);
console.log(`bands outside 5-8 % per daily: ${badDaily.length ? badDaily.map((r) => r.band).join(', ') : 'none'}`);
console.log('Sıradan / Sürü = kills to cross the band at the same level (rank trash x1, swarm as the game grants it).');

console.log(`\nFirst 10 minutes: ${PATH.map((q) => q.id.slice(0, 5)).join(' ')} (1 kill / ${KILL_S} s, turn-in ${TURN_IN_S} s)`);
for (const s of timeline) console.log(`  ${s.id.padEnd(24)} t=${f(s.t, 4)} s  level ${s.lvl}  xp ${f(s.xp, 4)}  (quest +${s.qx})`);
let bad = 0;
for (const [L, target, label] of [[2, TARGET_L2_S, 'level 2 by 90 s'], [3, TARGET_L3_S, 'level 3 at about 240 s']]) {
  const at = reached[L];
  const ok = at !== undefined && (L === 2 ? at <= target : Math.abs(at - target) <= TARGET_TOL_S);
  if (!ok) bad++;
  console.log(`  ${label}: ${at === undefined ? 'not reached on the path' : `${at} s`} ${ok ? 'PASS' : 'FAIL'}`);
}
process.exit(bad ? 1 : 0);
