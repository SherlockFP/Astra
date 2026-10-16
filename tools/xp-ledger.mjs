#!/usr/bin/env node
/**
 * First-hour XP ledger (single source of truth for tools/pace-check.mjs). Headless replay of the Sisli Vadi first hour with the
 * REAL data and formulas: systems/Progression.ts (xpToNext, monsterXp), data/lowLevelScaling.ts (open-world trash x), the quest
 * data of data/world/quests.ts (XP_PCT applied, applyVariety objectives) and the grant rules of systems/Quests.ts:
 *   - stateOf: a quest is locked while ch.level < def.level (the level GATE, not only the XP base)
 *   - turnIn: quest XP = round(xpPct / 100 x xpToNext(def.level)), granted at turn-in (not at accept)
 *   - kill XP: LootSystem.grantKillXp = monsterXp(camp level, rank, def.xp, player level) x lowLevelKillXpMult for open-world trash / swarm
 *     (camp monsters roll a level uniformly in the camp levelRange: the ledger takes the expectation over that range)
 *
 *   node tools/xp-ledger.mjs     prints the pace route, the greedy route and the side-quest XP per minute
 *
 * Routes (the order a player gets the first hour in):
 *   pace   (side: false) the chain mq_01..mq_07, and the grind (open-world trash at the current level) the level gates need;
 *   greedy (side: true)  the same, plus every available one-time side quest of Gümüşdere (npc_g_*) and Orta Karakol (npc_o_*)
 *                        taken before each chain quest of that town (level <= current level, prereqs done), level order;
 *   then the rest of the level 1-5 one-time quests (level order, same gate rule).
 * Time: TRAVEL_S per quest walk, each objective's own time, TURN_IN_S at turn-in. Not counted (a slight lower bound): exploration
 * XP, dungeons, escort ambush kills, rested bonus, massacre chain, group bonus, Zafer buff.
 *
 * Main chain XP per minute at level L = the pace route's XP (kills and quests) per second while the player is at L (grind
 * included), in the chain phase only. Side quest XP per minute = (its kill XP + quest XP) / its time, at its own level.
 *
 * Needs Node >= 22.18 (native TypeScript type stripping).
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
const { lowLevelKillXpMult, isLowLevelTrashRank } = await imp('src/data/lowLevelScaling.ts');
const { LEVEL_CAP } = await imp('src/types/character.ts');
const { QUESTS } = await imp('src/data/world/quests.ts');
const { ENEMIES, BOSSES } = await imp('src/data/enemies.ts');
const { DUNGEONS, OPEN_ZONES, DUNGEON_IDS } = await imp('src/data/dungeons/index.ts');
const { runXp, runMinutes, isLowLevelDungeon, dungeonKillXpMult, RUN_OVERHEAD_S } = await imp('src/data/dungeons/levelling.ts');

// ---- XP curve: the real methods (they use no instance state)
const P = Progression.prototype;
export const xpToNext = (L) => P.xpToNext.call({}, L);
/** One kill's XP as LootSystem.grantKillXp computes it (without the player-side bonuses): monsterXp, then the open-world trash x. */
export function killXp(lvl, rank, xpMult, playerLvl, openWorld) {
  const xp = P.monsterXp.call({}, lvl, rank, xpMult, playerLvl);
  return openWorld && isLowLevelTrashRank(rank === 'swarm' ? 'trash' : rank, rank === 'swarm' ? 'swarm' : undefined) ? Math.round(xp * lowLevelKillXpMult(lvl)) : xp;
}
export const questXp = (q) => Math.round((q.reward.xpPct / 100) * xpToNext(q.level));
// 'dungeon': a quest whose objective is a dungeon run (Mağaradaki Sis). Its time is the run, which pays its own XP (the dungeon route
// section of pace-check), so the side-quest share rule does not apply to it.
export const kindOf = (q) => (q.daily ? 'daily' : q.main ? 'main' : q.objectives?.some((o) => o.kind === 'dungeon') ? 'dungeon' : /^sq_r\d+_/.test(q.id) ? 'region' : /^sq_[gcks]_/.test(q.id) ? 'side' : 'other');

// ---- pace assumptions (seconds)
export const KILL_S = 9, GRIND_KILL_S = 9, TALK_S = 30, EXPLORE_S = 30, BOSS_S = 60, METIN_S = 60, COLLECT_S = 4, SKILL_S = 4, TURN_IN_S = 10, DUNGEON_S = 600;
export const INTERACT_S = 6, USE_S = 4, TRAVEL_S = 45;
/** Side quests must earn at least this share of the main chain's XP per minute at their level (director rule). */
export const SIDE_MIN_SHARE = 0.8;

const sv = { ...DUNGEONS, ...OPEN_ZONES }.sisli_vadi;
const world = sv?.world;
const packs = sv?.packs ?? [];
export const enemy = (id) => ENEMIES[id] ?? BOSSES[id];
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);

/** Kill XP of a target: expectation over its camp levelRange (camp members roll the level), else the solo tier level. */
export function killXpOf(id, rank, xpMult, playerLvl, fallbackLevel) {
  const camp = packs.find((p) => p.levelRange && p.members.some((m) => m.enemyId === id));
  if (camp) {
    const [a, b] = camp.levelRange;
    const xs = range(a, b).map((L) => killXp(L, rank, xpMult, playerLvl, true));
    return sumOf(xs) / xs.length;
  }
  const solo = world?.rares?.find((x) => x.enemyId === id) ?? world?.minibosses?.find((x) => x.enemyId === id);
  const tier = world?.metin?.tiers?.find((x) => x.enemyId === id || x.id === id);
  const L = solo?.level ?? tier?.level ?? fallbackLevel;
  return killXp(L, rank, xpMult, playerLvl, false);
}

/**
 * Expected XP of one open-world trash kill for a player of level L who grinds where the camps of level L spawn: the mean over every
 * member of the camps whose levelRange contains L, each at its level range (expectation). Falls back to a level-L trash kill.
 */
export function grindXpAt(L) {
  const camps = packs.filter((p) => p.levelRange && p.levelRange[0] <= L && L <= p.levelRange[1]);
  const xs = [];
  for (const p of camps) {
    const [a, b] = p.levelRange;
    for (const m of p.members) {
      const d = enemy(m.enemyId);
      if (!d) continue;
      const rank = d.role === 'swarm' ? 'swarm' : d.rank;
      for (const Lm of range(a, b)) xs.push(killXp(Lm, rank, d.xp, L, true));
    }
  }
  return xs.length ? sumOf(xs) / xs.length : killXp(L, 'trash', 1, L, true);
}

/** Monster level used for display only: lowest camp level, else tier level. */
export function mobLevel(id, fallback) {
  const camp = packs.filter((p) => p.levelRange && p.members.some((m) => m.enemyId === id));
  if (camp.length) return Math.min(...camp.map((p) => p.levelRange[0]));
  const solo = world?.rares?.find((x) => x.enemyId === id) ?? world?.minibosses?.find((x) => x.enemyId === id);
  if (solo) return solo.level;
  const tier = world?.metin?.tiers?.find((x) => x.enemyId === id || x.id === id);
  if (tier) return tier.level;
  return fallback;
}

/** Town of an NPC by its id prefix: npc_g_ Gümüşdere, npc_o_ Orta Karakol, else the id itself. */
export const townOf = (npcId) => (npcId?.startsWith('npc_g_') ? 'gumusdere' : npcId?.startsWith('npc_o_') ? 'orta_karakol' : npcId);

const CHAIN = QUESTS.filter((q) => q.main && /^mq_0[1-7]_/.test(q.id)).sort((a, b) => a.id.localeCompare(b.id));
const SIDE_TOWN = QUESTS.filter((q) => !q.daily && !q.main && q.level <= 5 && /^npc_(g|o)_/.test(q.giver ?? ''));
const REST_ALL = QUESTS.filter((q) => !q.daily && !q.main && q.level <= 5);

/**
 * A quest's objectives as time segments: one per walk, kill (its XP read at the player's level when it runs), other objective,
 * turn-in (quest XP). Single source for the replay and for the side-quest rate.
 */
export function questSegments(q) {
  const segs = [{ secs: TRAVEL_S }];
  for (const o of q.objectives) {
    const d = o.target ? enemy(o.target) : undefined;
    if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin' || o.kind === 'elite') {
      const rank = d ? (d.role === 'swarm' ? 'swarm' : d.rank) : 'trash';
      const n = o.kind === 'kill' ? o.count : 1;
      const secs = o.kind === 'kill' ? KILL_S : o.kind === 'metin' ? METIN_S : BOSS_S;
      for (let i = 0; i < n; i++) segs.push({ secs, mob: d ? { id: o.target, rank, xpMult: d.xp, fallback: q.level } : null });
    } else if (o.kind === 'drop') {
      const src = o.from?.[0];
      const sd = src ? enemy(src) : undefined;
      const rank = sd ? (sd.role === 'swarm' ? 'swarm' : sd.rank) : 'trash';
      const kills = Math.ceil(o.count / (o.chance ?? 0.6));
      for (let i = 0; i < kills; i++) segs.push({ secs: KILL_S, mob: sd ? { id: src, rank, xpMult: sd.xp, fallback: q.level } : null });
    } else if (o.kind === 'collect') segs.push({ secs: COLLECT_S * o.count });
    else if (o.kind === 'skill') segs.push({ secs: SKILL_S * o.count });
    else if (o.kind === 'interact') segs.push({ secs: INTERACT_S * o.count });
    else if (o.kind === 'use') segs.push({ secs: USE_S * o.count });
    else if (o.kind === 'escort') segs.push({ secs: o.count });
    else if (o.kind === 'talk') segs.push({ secs: TALK_S });
    else if (o.kind === 'explore') segs.push({ secs: EXPLORE_S });
    else if (o.kind === 'dungeon') segs.push({ secs: DUNGEON_S });
  }
  segs.push({ secs: TURN_IN_S, quest: questXp(q) });
  return segs;
}
/** XP of one segment for a player of level `lvl`. */
const segXp = (seg, lvl) => (seg.mob ? killXpOf(seg.mob.id, seg.mob.rank, seg.mob.xpMult, lvl, seg.mob.fallback) : seg.quest ?? 0);

/** Time and XP of a whole quest for a player of level `lvl` (no state). */
export function questCost(q, lvl = q.level) {
  const segs = questSegments(q);
  return { secs: sumOf(segs.map((s) => s.secs)), xp: sumOf(segs.map((s) => segXp(s, lvl))), killXp: sumOf(segs.filter((s) => s.mob).map((s) => segXp(s, lvl))) };
}

/**
 * Replays the first hour (see the header). Returns { steps, reached, t, lvl, xp, grindKills, rate }.
 *  steps: one row per quest taken or grind block: { kind, id, t, lvl, xp, quest, gate, grind } (lvl / xp after the step).
 *  reached[L]: seconds at which level L was first reached.
 *  rate[L]: { secs, xp } of the chain phase (chain quests and grind) spent at level L (for the main chain XP per minute).
 */
export function replayFirstHour({ side = false } = {}) {
  const gateOf = (q) => q.level;
  let t = 0, lvl = 1, xp = 0, grindKills = 0, tracking = true;
  const reached = {};
  const done = new Set();
  const steps = [];
  const rate = {};
  const gain = (amount) => {
    xp += Number.isFinite(amount) ? amount : 0;
    while (lvl < LEVEL_CAP && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; if (reached[lvl] === undefined) reached[lvl] = t; }
  };
  /** One time step: seconds pass, `amount` XP is earned at the current level. */
  const advance = (secs, amount) => {
    if (tracking) { const r = (rate[lvl] ??= { secs: 0, xp: 0 }); r.secs += secs; r.xp += Number.isFinite(amount) ? amount : 0; }
    t += secs;
    gain(amount);
  };

  function runQuest(q) {
    for (const seg of questSegments(q)) advance(seg.secs, segXp(seg, lvl));
    done.add(q.id);
    steps.push({ kind: 'quest', id: q.id, t, lvl, xp, quest: questXp(q), gate: q.level });
  }

  /** Grinds open-world trash at the current level until `toLevel` (the gate). */
  function grindTo(toLevel) {
    const start = t, lv0 = lvl;
    let kills = 0;
    while (lvl < toLevel && lvl < LEVEL_CAP) { advance(GRIND_KILL_S, grindXpAt(lvl)); kills++; }
    grindKills += kills;
    if (kills) steps.push({ kind: 'grind', id: `grind L${lv0}->L${lvl} (${kills} kills)`, t, lvl, xp, secs: t - start, grind: kills });
  }

  /** Takes every available one-time side quest of `town` (level <= current level, prereqs done), level order. */
  function townSide(town) {
    for (;;) {
      const next = SIDE_TOWN
        .filter((q) => !done.has(q.id) && townOf(q.giver) === town && gateOf(q) <= lvl && (q.prereq ?? []).every((p) => done.has(p)))
        .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))[0];
      if (!next) return;
      runQuest(next);
    }
  }

  for (const q of CHAIN) {
    const town = townOf(q.giver);
    if (side) townSide(town);
    if (lvl < gateOf(q)) { grindTo(gateOf(q)); if (side) townSide(town); }
    runQuest(q);
  }
  tracking = false;
  for (const q of REST_ALL.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))) {
    if (done.has(q.id)) continue;
    if (lvl < gateOf(q)) grindTo(gateOf(q));
    runQuest(q);
  }
  return { steps, reached, t, lvl, xp, grindKills, rate };
}

/** Main chain XP per second at level L from the pace route's chain-phase rate table (nearest level with data when L has none). */
export function mainXpPerSec(L, rate = replayFirstHour().rate) {
  for (let d = 0; d < 10; d++) {
    for (const k of [L - d, L + d]) { const r = rate[k]; if (r && r.secs > 0) return r.xp / r.secs; }
  }
  return 0;
}

/**
 * Side quests of levels 1-5 (side and region kinds, one-time): their XP per minute against the main chain's at their level.
 * suggestPct = the xpPct that makes the quest reach SIDE_MIN_SHARE of the main rate (kill XP counts, quest XP is the rest).
 */
export function sideQuestReport(rate = replayFirstHour().rate) {
  const sides = QUESTS.filter((q) => !q.main && !q.daily && q.level <= 5 && (kindOf(q) === 'side' || kindOf(q) === 'region'));
  return sides.map((q) => {
    const c = questCost(q, q.level);
    const main = mainXpPerSec(q.level, rate);
    const xpPerMin = ((c.killXp + questXp(q)) / c.secs) * 60;
    const mainPerMin = main * 60;
    const need = SIDE_MIN_SHARE * main * c.secs - c.killXp;
    const suggestPct = Math.max(1, Math.ceil((need / xpToNext(q.level)) * 100));
    return {
      id: q.id, level: q.level, secs: c.secs, killXp: c.killXp, questXp: questXp(q), xpPct: q.reward.xpPct,
      xpPerMin, mainPerMin, share: mainPerMin ? xpPerMin / mainPerMin : Infinity, suggestPct,
      town: townOf(q.giver), inGreedy: SIDE_TOWN.some((s) => s.id === q.id),
    };
  });
}

/** Prints the ledger: XP per quest and per grind block, level after each step, and XP to cross each level. */
export function printLedger(res = replayFirstHour()) {
  const f = (n, w) => String(n).padStart(w);
  console.log('XP to cross each level (xpToNext) L1..L6:', [1, 2, 3, 4, 5, 6].map((L) => `L${L}=${xpToNext(L)}`).join('  '));
  console.log('step                              t(s)  level   xp  quest xp  gate');
  for (const s of res.steps) {
    if (s.kind === 'grind') console.log(`${s.id.padEnd(32)}${f(s.t, 6)}  L${s.lvl}  ${f(Math.round(s.xp), 5)}`);
    else console.log(`${s.id.padEnd(32)}${f(s.t, 6)}  L${s.lvl}  ${f(Math.round(s.xp), 5)}  ${f(s.quest, 8)}  L${s.gate}`);
  }
  console.log(`reached: ${Object.entries(res.reached).map(([L, t]) => `L${L}@${t}s`).join(' ')}  | grind kills ${res.grindKills}`);
}

/**
 * Dungeon-only route (second first-hour path): the lowest low-level dungeon (levelling.ts, Kemik Mahzeni), run again and again at
 * the player's level (enemy level = level clamped to the band), solo or in a group of `group` (every member gets the group's
 * 1 + 0.05 (n - 1) kill XP, the pulls take the same time). Each run = the mandatory route's minutes + DUNGEON_RUN_OVERHEAD_S
 * (queue, walk in, rest). Returns { def, runs: [{ lvl, xp, t }], reached, t } (reached[L] = seconds to reach level L).
 */
export const DUNGEON_RUN_OVERHEAD_S = RUN_OVERHEAD_S;
export const lowLevelDungeon = () => DUNGEON_IDS.map((id) => DUNGEONS[id]).find((d) => isLowLevelDungeon(d));
export function replayDungeonRoute({ group = 1, toLevel = 10 } = {}) {
  const def = lowLevelDungeon();
  const band = def.levelRange;
  const runSecs = runMinutes(def) * 60 + DUNGEON_RUN_OVERHEAD_S;
  const monsterXp = (L, rank, xpMult, pl) => P.monsterXp.call({}, L, rank, xpMult, pl);
  const groupMult = 1 + 0.05 * (group - 1);
  let t = 0, lvl = 1, xp = 0;
  const reached = {}, runs = [];
  while (lvl < toLevel && runs.length < 200) {
    const enemyLvl = Math.max(band[0], Math.min(band[1], lvl));
    const gain = runXp(def, enemyLvl, monsterXp) * groupMult;
    runs.push({ lvl, xp: gain, t, mult: dungeonKillXpMult(def, enemyLvl) });
    t += runSecs;
    xp += gain;
    while (lvl < toLevel && xp >= xpToNext(lvl)) { xp -= xpToNext(lvl); lvl++; if (reached[lvl] === undefined) reached[lvl] = t; }
  }
  const atLevel = {};
  for (const L of [1, 5, 10]) atLevel[L] = runXp(def, Math.max(band[0], Math.min(band[1], L)), monsterXp) * groupMult;
  return { def, runSecs, runs, reached, t, atLevel };
}

export { QUESTS, LEVEL_CAP };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const pace = replayFirstHour({ side: false });
  console.log('PACE ROUTE (chain + the grind its level gates need)');
  printLedger(pace);
  console.log('\nGREEDY ROUTE (same, plus every side quest of Gümüşdere / Orta Karakol the player takes on the way)');
  const g = replayFirstHour({ side: true });
  printLedger(g);
  console.log('\nMAIN CHAIN XP/min by level:', [1, 2, 3, 4, 5].map((L) => `L${L}=${(mainXpPerSec(L, pace.rate) * 60).toFixed(0)}`).join(' '));
  console.log('SIDE QUESTS (level 1-5): share of the main XP/min at their level, must be >= ' + SIDE_MIN_SHARE);
  for (const s of sideQuestReport(pace.rate)) {
    console.log(`  ${s.id.padEnd(30)} L${s.level} ${String(Math.round(s.secs)).padStart(4)}s  kill ${String(Math.round(s.killXp)).padStart(4)}  quest ${String(s.questXp).padStart(4)} (${s.xpPct}%)  ${s.xpPerMin.toFixed(0).padStart(4)}/min  main ${s.mainPerMin.toFixed(0)}/min  share ${(s.share * 100).toFixed(0)}%  suggest ${s.suggestPct}%`);
  }
}
