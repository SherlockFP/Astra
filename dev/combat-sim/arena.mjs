// ARENA PvP QUEUE + MATCH + RATING (GDD_PVP_FINDER PV-00/01/02/04, section 3.4) headless checks - no browser, no network.
//   rate.*   Elo, K factor, hidden MMR vs visible rating lag, tiers, titles, seasons, weekly Fetih cap, rewards, leave penalty, anti win-trading
//   cmb.*    combat/pvp.ts: dampening table, incoming damage, diminishing returns, slow floor, hit rules
//   mat.*    net/queue/matcher.ts: arena groups (window, snake teams), dungeon groups (strict / relaxed / partial), determinism, fairness
//   que.*    net/queue/QueueCore.ts on an in-memory lobby bus: proposer = earliest, handshake, host election, timeouts, declines, abuse rules
//   rnd.*    scenes/arena/ArenaMatch.ts: prep / live / round_end flow with a fake clock, dampening, best of 3, draws, forfeit, void
//   wire.*   sanitisers + channel lists (qann / qprop / arena)
//   rt.*     ArenaController on the real Combat + World: hit rules per phase, 34 % arena damage, resilience, CC caps + DR, dampened heals,
//            round flow over the host channel, result -> ladder, dispose
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/arena.mjs      (V=1 prints every PASS)
import * as H from './harness.mjs';

const { G } = H;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const origWarn = console.warn;
console.warn = (...a) => { const s = a.map(String).join(' '); if (!s.includes('[net-guard]')) origWarn(...a); };

const R = await H.imp('scenes/arena/arenaRules.ts');
const C = await H.imp('combat/pvp.ts');
const M = await H.imp('net/queue/matcher.ts');
const { QueueCore, QUEUE_TIMING } = await H.imp('net/queue/QueueCore.ts');
const { ArenaMatch } = await H.imp('scenes/arena/ArenaMatch.ts');
const { ArenaLadder } = await H.imp('systems/ArenaLadder.ts');
const Msg = await H.imp('net/messages.ts');
const Gd = await H.imp('net/guard.ts');
const { monsterHP } = await H.imp('data/mythicAffixes.ts');
const { ARENAS } = await H.imp('data/arenas/index.ts');
const { startArena, arenaController, arenaSpawnFor } = await H.imp('scenes/arena/ArenaController.ts');
const { pvp } = await H.imp('systems/Pvp.ts');

// ====================================================================================================================
// rate.*
// ====================================================================================================================
{
  ok('rate.expected score equal = 0.5, +400 = 0.909', near(R.expectedScore(1500, 1500), 0.5) && near(R.expectedScore(1900, 1500), 1 / (1 + 0.1), 1e-9));
  ok('rate.expected score is symmetric', near(R.expectedScore(1700, 1500) + R.expectedScore(1500, 1700), 1, 1e-12));
  ok('rate.K 48 provisional, 32 after 10 games, 24 from 2100', R.kFactor(0, 1500) === 48 && R.kFactor(9, 1500) === 48 && R.kFactor(10, 1500) === 32 && R.kFactor(30, 2100) === 24 && R.kFactor(5, 2300) === 48);
  ok('rate.fresh win vs equal = +24, loss = -24 (K 48 x 0.5)', R.eloDelta({ teamMmr: 1500, oppMmr: 1500, won: true, games: 0, mmr: 1500 }) === 24 && R.eloDelta({ teamMmr: 1500, oppMmr: 1500, won: false, games: 0, mmr: 1500 }) === -24);
  ok('rate.settled win vs equal = +16', R.eloDelta({ teamMmr: 1500, oppMmr: 1500, won: true, games: 20, mmr: 1500 }) === 16);
  ok('rate.upset pays more than the favourite win', R.eloDelta({ teamMmr: 1300, oppMmr: 1700, won: true, games: 20, mmr: 1300 }) > R.eloDelta({ teamMmr: 1700, oppMmr: 1300, won: true, games: 20, mmr: 1700 }));
  ok('rate.draw changes nothing', R.eloDelta({ teamMmr: 1500, oppMmr: 1800, won: 'draw', games: 3, mmr: 1500 }) === 0);

  const fresh = { rating: 1500, mmr: 1500, games: 0, wins: 0, peak: 1500 };
  const w = R.applyRanked(fresh, 1500, 1500, true);
  ok('rate.applyRanked fresh win = Elo delta within +-1 (GDD 9.4 item 4)', Math.abs(w.step.delta - 24) <= 1 && w.stats.games === 1 && w.stats.wins === 1 && w.stats.peak === 1524, JSON.stringify(w.step));
  const l = R.applyRanked(fresh, 1500, 1500, false);
  ok('rate.applyRanked fresh loss', l.step.delta === -24 && l.stats.wins === 0 && l.stats.peak === 1500);
  const d = R.applyRanked(fresh, 1500, 1800, 'draw');
  ok('rate.applyRanked draw: no change, no game counted', d.step.delta === 0 && d.stats.games === 0);
  const under = { rating: 1500, mmr: 1700, games: 20, wins: 10, peak: 1500 };
  const over = { rating: 1700, mmr: 1500, games: 20, wins: 10, peak: 1700 };
  const base = R.eloDelta({ teamMmr: 1700, oppMmr: 1700, won: true, games: 20, mmr: 1700 });
  ok('rate.hidden MMR above the ladder: gains amplified, losses damped', R.applyRanked(under, 1700, 1700, true).step.delta > base && Math.abs(R.applyRanked(under, 1700, 1700, false).step.delta) < base);
  ok('rate.hidden MMR below the ladder: gains damped, losses amplified', R.applyRanked(over, 1500, 1500, true).step.delta < 16 && Math.abs(R.applyRanked(over, 1500, 1500, false).step.delta) > 16);
  ok('rate.lag never flips the sign and moves at least 1', [under, over].every((s) => R.applyRanked(s, 1600, 1600, true).step.delta >= 1 && R.applyRanked(s, 1600, 1600, false).step.delta <= -1));
  ok('rate.lag bounded to +-50 % of the Elo delta', (() => { const s = { rating: 900, mmr: 2400, games: 20, wins: 0, peak: 900 }; const x = R.applyRanked(s, 1500, 1500, true); return x.step.delta <= Math.round(16 * 1.5) && x.step.delta >= 16; })());
  ok('rate.rating never goes below 0', R.applyRanked({ rating: 5, mmr: 5, games: 0, wins: 0, peak: 5 }, 5000, 0, false).stats.rating === 0);
  ok('rate.farmed win pays a reduced gain only (loss untouched)', R.applyRanked(fresh, 1500, 1500, true, 0.5).step.delta === 12 && R.applyRanked(fresh, 1500, 1500, false, 0).step.delta === -24 && R.applyRanked(fresh, 1500, 1500, true, 0).step.delta === 0);

  // tiers / titles
  const T = (r) => R.tierOf(r).name;
  ok('rate.tier ladder names', T(0) === 'Acemi' && T(1099) === 'Acemi' && T(1100) === 'Savaşçı' && T(1400) === 'Rakip' && T(1500) === 'Rakip' && T(1600) === 'Düellocu' && T(1800) === 'Gladyatör' && T(2100) === 'Şampiyon' && T(2400) === 'Kadim Savaşçı' && T(4000) === 'Kadim Savaşçı');
  ok('rate.tier toNext', R.tierOf(1500).toNext === 100 && R.tierOf(2500).next === null && R.tierOf(2500).toNext === 0);
  ok('rate.titles from Gladyatör up', R.titlesFor(1799, '2v2').length === 0 && R.titlesFor(1800, '2v2').join() === 'pvp_gladyator_2v2' && R.titlesFor(2150, '3v3').join() === 'pvp_gladyator_3v3,pvp_sampiyon_3v3' && R.titlesFor(2400, '1v1').length === 3);
  ok('rate.title names (Turkish)', R.arenaTitleName('pvp_gladyator_2v2') === 'Gladyatör (2v2)' && R.arenaTitleName('pvp_s3_kadim_3v3') === 'Kadim Savaşçı (Sezon 3, 3v3)' && R.arenaTitleName('sav_honor500') === null && R.arenaTitleName('pvp_hack_2v2') === null);

  // seasons and the weekly Fetih cap
  ok('rate.season = 8 weeks, week 1..8', R.seasonOfWeek(0) === 0 && R.seasonOfWeek(7) === 0 && R.seasonOfWeek(8) === 1 && R.weekInSeason(0) === 1 && R.weekInSeason(7) === 8 && R.weekInSeason(8) === 1 && R.weekInSeason(100) === 5);
  ok('rate.weekly Fetih cap schedule 1000 -> 2750 (min 3000)', [1, 2, 3, 4, 5, 6, 7, 8].map(R.fetihWeekCap).join() === '1000,1250,1500,1750,2000,2250,2500,2750');
  ok('rate.soft reset keeps half the distance to 1500', R.softReset(1900) === 1700 && R.softReset(1100) === 1300 && R.softReset(1500) === 1500);
  ok('rate.Mührü only in the last two weeks', !R.isMuhruWeek(6) && R.isMuhruWeek(7) && R.isMuhruWeek(8));

  // rewards (section 4.2)
  const rw = (o) => R.rewardsFor({ ranked: false, outcome: 'win', myMean: 1500, oppMean: 1500, firstWinAvailable: false, onurEarnedToday: 0, fetihEarnedWeek: 0, weekInSeason: 1, ...o });
  ok('rate.unranked win 30 Onur, loss 10, no Fetih', rw({}).onur === 30 && rw({ outcome: 'loss' }).onur === 10 && rw({}).fetih === 0 && rw({ outcome: 'loss' }).fetih === 0);
  ok('rate.ranked win 20 Onur + 30 Fetih, loss 5 + 8', rw({ ranked: true }).onur === 20 && rw({ ranked: true }).fetih === 30 && rw({ ranked: true, outcome: 'loss' }).onur === 5 && rw({ ranked: true, outcome: 'loss' }).fetih === 8);
  ok('rate.ranked win vs a team 100+ higher: +5 Fetih', rw({ ranked: true, oppMean: 1600 }).fetih === 35 && rw({ ranked: true, oppMean: 1599 }).fetih === 30);
  ok('rate.match draw pays half', rw({ outcome: 'draw' }).onur === 15 && rw({ ranked: true, outcome: 'draw' }).fetih === 15);
  ok('rate.first win of the day +100 Onur', rw({ firstWinAvailable: true }).onur === 130 && rw({ firstWinAvailable: true, outcome: 'loss' }).onur === 10 && rw({ firstWinAvailable: true }).firstWin);
  ok('rate.daily Onur cap 1500', rw({ onurEarnedToday: 1490 }).onur === 10 && rw({ onurEarnedToday: 1500 }).onur === 0 && rw({ onurEarnedToday: 1500 }).onurCapped);
  ok('rate.weekly Fetih cap', rw({ ranked: true, fetihEarnedWeek: 990 }).fetih === 10 && rw({ ranked: true, fetihEarnedWeek: 1000 }).fetih === 0 && rw({ ranked: true, fetihEarnedWeek: 1000 }).fetihCapped && rw({ ranked: true, fetihEarnedWeek: 1000, weekInSeason: 2 }).fetih === 30);
  ok('rate.muhru: 1 per ranked win in weeks 7-8 only', rw({ ranked: true, weekInSeason: 7 }).muhru === 1 && rw({ ranked: true, weekInSeason: 6 }).muhru === 0 && rw({ ranked: true, weekInSeason: 8, outcome: 'loss' }).muhru === 0 && rw({ weekInSeason: 8 }).muhru === 0);
  ok('rate.a leaver gets nothing', (() => { const x = rw({ ranked: true, leaver: true }); return x.onur === 0 && x.fetih === 0 && x.muhru === 0; })());
  ok('rate.leave lock 5 / 15 / 30 / 60 / 60 minutes', [1, 2, 3, 4, 5, 9].map(R.leaveLock).join() === '5,15,30,60,60,60');
}

// ====================================================================================================================
// cmb.*
// ====================================================================================================================
{
  ok('cmb.dampening table: 0 until 120 s, 8 at 180, 24 at 300, cap 50', C.dampenPct(0) === 0 && C.dampenPct(120) === 0 && C.dampenPct(150) === 4 && C.dampenPct(180) === 8 && C.dampenPct(300) === 24 && C.dampenPct(10000) === 50 && C.dampenPct(-5) === 0 && C.dampenPct(NaN) === 0);
  ok('cmb.dampening monotonic', (() => { let p = 0; for (let t = 0; t < 900; t += 7) { const v = C.dampenPct(t); if (v < p) return false; p = v; } return true; })());
  C.setArenaCombat(false);
  ok('cmb.heal multiplier is 1 outside arenas', C.arenaHealMult() === 1 && !C.arenaCombatActive());
  C.setArenaCombat(true, 24);
  ok('cmb.heal multiplier follows the host value', near(C.arenaHealMult(), 0.76) && C.arenaCombatActive());
  C.setArenaCombat(true, 999);
  ok('cmb.dampening value clamped to 50', C.arenaDampPct() === 50);
  C.setArenaCombat(false);
  ok('cmb.leaving the arena clears dampening', C.arenaHealMult() === 1 && C.arenaDampPct() === 0);

  ok('cmb.pvpOutgoing x(1+power), never negative', near(C.pvpOutgoing(100, 0.25), 125) && C.pvpOutgoing(100, -5) === 100 && C.pvpOutgoing(100, NaN) === 100);
  const inc = (m, res, hp = 100000) => C.pvpIncoming({ mitigated: m, victimPvpResilience: res, inArena: true, maxHp: hp });
  ok('cmb.incoming = mitigated x 0.34', inc(1000, 0) === 340);
  ok('cmb.incoming monotonic in resilience, capped at 40 %', inc(1000, 0.1) < inc(1000, 0) && inc(1000, 0.2) < inc(1000, 0.1) && inc(1000, 0.4) === inc(1000, 0.9) && inc(1000, 0.4) === 204);
  ok('cmb.incoming minimum 1', inc(0, 0) === 1 && inc(1, 0.4) === 1);
  ok('cmb.incoming max-hit cap 45 % of max HP', inc(1e9, 0, 10000) === 4500);
  ok('cmb.world PvP value unchanged (0.4)', C.pvpIncoming({ mitigated: 1000, victimPvpResilience: 0, inArena: false, maxHp: 1e6 }) === 400);
  ok('cmb.hit amount: attacker level cap applies first', C.arenaHitAmount({ raw: 1e12, attackerLevel: 40, victimPvpResilience: 0, maxHp: 1e12 }, monsterHP) === Math.round(Math.max(6000, 12 * monsterHP(40)) * 0.34));

  // diminishing returns: 100 / 50 / 25 / immune, 18 s window
  const dr = new C.CcDiminish();
  const seq = [0, 1, 2, 3].map((i) => dr.apply('stun', 2, i));
  ok('cmb.DR stun 100 / 50 / 25 / immune', seq.join() === '2,1,0.5,0', seq.join());
  ok('cmb.DR shared group: freeze + knockdown count with stun', (() => { const d = new C.CcDiminish(); d.apply('stun', 2, 0); return d.apply('freeze', 2, 1) === 1 && d.apply('knockdown', 1, 2) === 0.25; })());
  ok('cmb.DR groups are separate (stun vs fear vs root vs silence)', (() => { const d = new C.CcDiminish(); d.apply('stun', 2, 0); return d.apply('fear', 2, 1) === 2 && d.apply('root', 2, 1) === 2 && d.apply('silence', 2, 1) === 2; })());
  ok('cmb.DR window resets 18 s after the last application', (() => { const d = new C.CcDiminish(); d.apply('stun', 2, 0); d.apply('stun', 2, 10); const inWin = d.apply('stun', 2, 27); const after = d.apply('stun', 2, 27 + 18.5); return inWin === 0.5 && after === 2; })());
  ok('cmb.DR duration caps (stun 3, freeze 2.5, knockdown 1.2, fear 2.5, root 3, silence 3)', [['stun', 3], ['freeze', 2.5], ['knockdown', 1.2], ['fear', 2.5], ['root', 3], ['silence', 3]].every(([s, c]) => new C.CcDiminish().apply(s, 99, 0) === c));
  ok('cmb.DR ccReduction capped at 40 %', near(new C.CcDiminish().apply('stun', 2, 0, 0.9), 1.2) && near(new C.CcDiminish().apply('stun', 2, 0, 0.2), 1.6));
  ok('cmb.DR immune applications do not extend the window', (() => { const d = new C.CcDiminish(); [0, 1, 2].forEach((t) => d.apply('stun', 2, t)); const imm = d.apply('stun', 2, 3); const stillImm = d.apply('stun', 2, 3 + 17); return imm === 0 && stillImm === 0; })());
  ok('cmb.non-CC statuses pass through untouched', new C.CcDiminish().apply('burn', 4, 0) === 4);
  ok('cmb.slow floor -50 % move speed', C.clampSlow(0.9) === 0.5 && C.clampSlow(0.3) === 0.3 && C.clampSlow(-1) === 0 && C.clampSlow(NaN) === 0);

  const hit = (o) => ({ phase: 'live', aId: 1, vId: 2, aTeam: 'A', vTeam: 'B', aDead: false, vDead: false, ...o });
  ok('cmb.hit rules: live + enemy + alive = allowed', R.arenaDeny(hit({})) === null);
  ok('cmb.hit rules: no damage in prep / round_end / match_end / loading', ['prep', 'round_end', 'match_end', 'loading'].every((p) => R.arenaDeny(hit({ phase: p })) === 'phase'));
  ok('cmb.hit rules: teammate, self, stranger, dead', R.arenaDeny(hit({ vTeam: 'A' })) === 'team' && R.arenaDeny(hit({ vId: 1 })) === 'self' && R.arenaDeny(hit({ vTeam: undefined })) === 'unknown' && R.arenaDeny(hit({ aTeam: undefined })) === 'unknown'
    && R.arenaDeny(hit({ aDead: true })) === 'dead' && R.arenaDeny(hit({ vDead: true })) === 'dead');
}

// ====================================================================================================================
// mat.*
// ====================================================================================================================
const cand = (id, o = {}) => ({
  peerId: id, age: o.age ?? 1,
  entry: {
    t: 'qann', proto: 3, gameVersion: 'x', key: o.key ?? 'arena:2v2:r', shard: 1, name: id, classId: o.cls ?? 'knight', level: 40, ilvl: 100, roles: o.roles ?? [],
    rating: o.rating ?? 1500, ...(o.mmr !== undefined ? { mmr: o.mmr } : {}), since: o.since ?? 1000, rev: 1, ...(o.keyLevel ? { keyLevel: o.keyLevel } : {}),
  },
});
const shuffled = (arr, seed) => {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
{
  ok('mat.key parsing', M.parseQueueKey('arena:3v3:r')?.bracket === '3v3' && M.parseQueueKey('arena:3v3:r').ranked && M.parseQueueKey('arena:1v1:u').ranked === false && M.parseQueueKey('dun:rnd:heroic:b4')?.random === true
    && M.parseQueueKey('dun:kemik_mahzeni:mplus:12')?.level === 12 && M.parseQueueKey('arena:4v4:r') === null && M.parseQueueKey('junk') === null);
  ok('mat.key helpers', M.arenaKey('2v2', true) === 'arena:2v2:r' && M.arenaKey('1v1', false) === 'arena:1v1:u' && M.randomDungeonKey('heroic', 33) === 'dun:rnd:heroic:b4');
  ok('mat.keys: equal match, M+ same dungeon within 2, nothing else', M.keysCompatible('arena:2v2:r', 'arena:2v2:r') && !M.keysCompatible('arena:2v2:r', 'arena:2v2:u') && M.keysCompatible('dun:a:mplus:10', 'dun:a:mplus:12')
    && !M.keysCompatible('dun:a:mplus:10', 'dun:a:mplus:13') && !M.keysCompatible('dun:a:mplus:10', 'dun:b:mplus:10') && !M.keysCompatible('dun:a:heroic:5', 'dun:a:heroic:6'));
  ok('mat.rating window 150 + 25 per 10 s, cap 600', M.ratingWindow(0) === 150 && M.ratingWindow(9.9) === 150 && M.ratingWindow(10) === 175 && M.ratingWindow(60) === 300 && M.ratingWindow(1000) === 600);
  ok('mat.queue bar window', JSON.stringify(M.windowFor(1500, 0)) === '[1350,1650]' && M.windowFor(100, 1000)[0] === 0);

  // arena: sizes
  const pool = (n, f) => Array.from({ length: n }, (_, i) => cand('p' + (i + 1), { since: 1000 + i, rating: 1500, ...f?.(i) }));
  ok('mat.2v2 needs 4, 1v1 needs 2, 3v3 needs 6', M.matchArena(pool(3), 'arena:2v2:r', 0) === null && M.matchArena(pool(4), 'arena:2v2:r', 0)?.members.length === 4
    && M.matchArena(pool(1, () => ({ key: 'arena:1v1:r' })), 'arena:1v1:r', 0) === null && M.matchArena(pool(2, () => ({ key: 'arena:1v1:r' })), 'arena:1v1:r', 0)?.members.length === 2
    && M.matchArena(pool(5, () => ({ key: 'arena:3v3:r' })), 'arena:3v3:r', 0) === null && M.matchArena(pool(6, () => ({ key: 'arena:3v3:r' })), 'arena:3v3:r', 0)?.members.length === 6);
  ok('mat.ranked and unranked do not mix', M.matchArena(pool(4, (i) => ({ key: i < 2 ? 'arena:2v2:r' : 'arena:2v2:u' })), 'arena:2v2:r', 100) === null);
  ok('mat.stale entries (age > 12 s) do not count', M.matchArena(pool(4, (i) => ({ age: i === 3 ? 13 : 1 })), 'arena:2v2:r', 0) === null);
  ok('mat.duplicate peer ids count once', M.matchArena([...pool(3), cand('p1', { since: 1000 })], 'arena:2v2:r', 0) === null);
  // window
  const wide = pool(4, (i) => ({ rating: [1500, 1500, 1500, 1800][i] }));
  ok('mat.a 300-point gap needs waiting (window 150 -> 300 after 60 s)', M.matchArena(wide, 'arena:2v2:r', 0) === null && M.matchArena(wide, 'arena:2v2:r', 59) === null && M.matchArena(wide, 'arena:2v2:r', 60)?.members.length === 4);
  ok('mat.hidden MMR decides, not the visible rating', M.matchArena(pool(4, (i) => ({ rating: 1500, mmr: [1500, 1500, 1500, 2100][i] })), 'arena:2v2:r', 0) === null && M.mmrOf(cand('x', { rating: 1500, mmr: 1700 }).entry) === 1700 && M.mmrOf(cand('x', { rating: 1500 }).entry) === 1500);
  // snake teams and fairness
  const r4 = pool(4, (i) => ({ rating: [1700, 1600, 1500, 1400][i] }));
  const m4 = M.matchArena(r4, 'arena:2v2:r', 100);
  ok('mat.snake draft A B B A (best + worst vs the middle two)', m4.teams.A.join() === 'p1,p4' && m4.teams.B.join() === 'p2,p3' && m4.mean[0] === 1550 && m4.mean[1] === 1550);
  ok('mat.3v3 snake A B B A A B', (() => {
    const m = M.matchArena(pool(6, (i) => ({ key: 'arena:3v3:r', rating: [1800, 1700, 1600, 1500, 1400, 1300][i] })), 'arena:3v3:r', 200);
    return m.teams.A.join() === 'p1,p4,p5' && m.teams.B.join() === 'p2,p3,p6';
  })());
  // fairness over random pools: team mean gap stays small, every team has teamSize players
  let worst = 0, bad = 0;
  for (let s = 1; s <= 200; s++) {
    const rs = shuffled(Array.from({ length: 6 }, (_, i) => 1200 + ((s * 37 + i * 211) % 600)), s);
    const m = M.matchArena(rs.map((r, i) => cand('q' + i, { key: 'arena:3v3:r', rating: r, since: 1000 + i })), 'arena:3v3:r', 600);
    if (!m) { bad++; continue; }
    if (m.teams.A.length !== 3 || m.teams.B.length !== 3) bad++;
    worst = Math.max(worst, Math.abs(m.mean[0] - m.mean[1]));
  }
  ok('mat.fairness: 200 random 3v3 pools, team mean gap <= 200 and always 3 + 3', bad === 0 && worst <= 200, `worst ${worst}`);
  // the anchor is the oldest, the group is the tightest run containing it
  const rr = [cand('old', { since: 1, rating: 1500 }), cand('a', { since: 5, rating: 1450 }), cand('b', { since: 6, rating: 1520 }), cand('c', { since: 7, rating: 1700 }), cand('d', { since: 8, rating: 1480 })];
  const pk = M.matchArena(rr, 'arena:2v2:r', 0);
  ok('mat.anchor = oldest, tightest neighbour run', pk && pk.members[0].peerId === 'old' && !pk.members.some((c) => c.peerId === 'c') && pk.spread <= 70, pk ? pk.members.map((c) => c.peerId).join() : 'null');
  // determinism: 60 shuffles of the same pool give the identical group, teams and proposer
  const ref = JSON.stringify(M.matchArena(rr, 'arena:2v2:r', 30));
  ok('mat.deterministic: pool order never changes the result', Array.from({ length: 60 }, (_, i) => JSON.stringify(M.matchArena(shuffled(rr, i + 3), 'arena:2v2:r', 30))).every((x) => x === ref));
  ok('mat.proposer = earliest since, ties by smaller peer id', M.proposerOf([cand('b', { since: 5 }), cand('a', { since: 5 }), cand('c', { since: 4 })]) === 'c' && M.proposerOf([cand('b', { since: 5 }), cand('a', { since: 5 })]) === 'a' && M.proposerOf([]) === null);

  // dungeon
  const D = (id, roles, since, extra) => cand(id, { key: 'dun:rnd:heroic:b4', roles, since, ...extra });
  const full = [D('t', ['tank'], 1), D('h', ['healer'], 2), D('d1', ['dps'], 3), D('d2', ['dps'], 4), D('d3', ['dps'], 5), D('d4', ['dps'], 6)];
  const g = M.matchDungeon(full, 'dun:rnd:heroic:b4', 0);
  ok('mat.dungeon strict 1 tank + 1 healer + 3 dps, oldest dps win', g && g.relaxed === 'none' && g.members.length === 5 && g.members.map((x) => x.cand.peerId).join() === 't,h,d1,d2,d3' && g.members.map((x) => x.role).join() === 'tank,healer,dps,dps,dps');
  ok('mat.dungeon without a tank waits', M.matchDungeon(full.filter((c) => c.peerId !== 't'), 'dun:rnd:heroic:b4', 0) === null && M.matchDungeon(full.filter((c) => c.peerId !== 't'), 'dun:rnd:heroic:b4', 59) === null);
  const noTank = M.matchDungeon(full.filter((c) => c.peerId !== 't'), 'dun:rnd:heroic:b4', 60);
  ok('mat.dungeon at 60 s: a dps fills the missing tank slot', noTank && noTank.relaxed === 'tank' && noTank.members.length === 5 && noTank.members[0].role === 'tank');
  const noHealer = M.matchDungeon(full.filter((c) => c.peerId !== 'h'), 'dun:rnd:heroic:b4', 60);
  ok('mat.dungeon at 60 s: a missing healer is filled too', noHealer && noHealer.relaxed === 'healer' && noHealer.members.length === 5);
  ok('mat.dungeon missing both tank and healer stays strict until 120 s', M.matchDungeon(full.filter((c) => c.peerId !== 't' && c.peerId !== 'h'), 'dun:rnd:heroic:b4', 60) === null);
  const part = M.matchDungeon(full.filter((c) => c.peerId !== 't' && c.peerId !== 'h').slice(0, 3), 'dun:rnd:heroic:b4', 120);
  ok('mat.dungeon at 120 s: a partial group of 3 starts', part && part.relaxed === 'partial' && part.members.length === 3);
  ok('mat.dungeon fewer than 3 never starts', M.matchDungeon(full.slice(0, 2), 'dun:rnd:heroic:b4', 9999) === null);
  ok('mat.dungeon multi-role peers fill the slot that leaves the group complete', (() => {
    const p = [D('a', ['tank', 'dps'], 1), D('b', ['healer'], 2), D('c', ['dps'], 3), D('d', ['dps'], 4), D('e', ['dps'], 5)];
    const m = M.matchDungeon(p, 'dun:rnd:heroic:b4', 0);
    return m && m.members.length === 5 && m.members[0].cand.peerId === 'a' && m.members[0].role === 'tank';
  })());
  ok('mat.dungeon deterministic under shuffles', (() => {
    const r0 = JSON.stringify(M.matchDungeon(full, 'dun:rnd:heroic:b4', 0));
    return Array.from({ length: 40 }, (_, i) => JSON.stringify(M.matchDungeon(shuffled(full, i + 9), 'dun:rnd:heroic:b4', 0))).every((x) => x === r0);
  })());
  ok('mat.M+ keys match within +-2 and the match uses compatible entries', (() => {
    const p = [cand('t', { key: 'dun:kemik:mplus:10', roles: ['tank'], since: 1 }), cand('h', { key: 'dun:kemik:mplus:12', roles: ['healer'], since: 2 }),
      cand('a', { key: 'dun:kemik:mplus:11', roles: ['dps'], since: 3 }), cand('b', { key: 'dun:kemik:mplus:10', roles: ['dps'], since: 4 }), cand('c', { key: 'dun:kemik:mplus:13', roles: ['dps'], since: 5 })];
    const late = M.matchDungeon(p, 'dun:kemik:mplus:10', 120);
    return M.matchDungeon(p, 'dun:kemik:mplus:10', 0) === null && late && late.members.length === 4 && !late.members.some((x) => x.cand.peerId === 'c');
  })());
  ok('mat.missing roles for the queue bar', (() => {
    const m = M.missingRoles([D('d1', ['dps'], 1), D('d2', ['dps'], 2)], 'dun:rnd:heroic:b4');
    return m.tank === true && m.healer === true && m.dps === 2;
  })());
}

// ====================================================================================================================
// que.*  (QueueCore on an in-memory lobby bus, fake clock)
// ====================================================================================================================
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function makeLobby(ids, o = {}) {
  const clock = { t: 100000, wall: 1_700_000_000_000 };
  const inbox = [];
  const cores = new Map();
  const log = { host: [], join: [], sent: [] };
  const pendingJoins = [];
  const drop = new Set(); // `${to}:${ch}` filters
  for (const [i, id] of ids.entries()) {
    const io = {
      selfId: id, proto: 3, gameVersion: 'g1',
      now: () => clock.t, wall: () => clock.wall + i,
      broadcast: (ch, data) => { for (const to of ids) if (to !== id) inbox.push({ to, from: id, ch, data }); log.sent.push({ from: id, ch, to: '*' }); },
      sendTo: (ch, to, data) => { inbox.push({ to, from: id, ch, data }); log.sent.push({ from: id, ch, to }); },
      self: () => ({ name: id, classId: 'knight', level: 40, ilvl: 100 }),
      newMid: () => 'M' + String(log.host.length + 1).padStart(7, '0'),
      newCode: () => 'ABCDEF',
      arenaMap: () => 'kirik_kemer',
      host: async (p) => {
        log.host.push({ id, p });
        const okHost = o.hostOk ? o.hostOk(id, p) : true;
        // the room exists now: every pending joinRoom of this match completes
        if (okHost) for (const j of pendingJoins.filter((x) => x.mid === p.mid)) j.res({ ok: true });
        if (o.hostWait) await o.hostWait; // the proposer is still opening / waiting for its room while the member is already in it
        return okHost;
      },
      // joinRoom only completes once the proposer's room is up (default); o.joinOk overrides
      join: (p, proposer) => { log.join.push({ id, p, proposer }); return o.joinOk ? Promise.resolve(o.joinOk(id, p)) : new Promise((res) => pendingJoins.push({ mid: p.mid, res })); },
    };
    cores.set(id, new QueueCore(io));
  }
  const deliver = () => {
    while (inbox.length) {
      const m = inbox.shift();
      if (drop.has(`${m.to}:${m.ch}`) || drop.has(`${m.to}:*`)) continue;
      const c = cores.get(m.to);
      if (!c) continue;
      if (m.ch === 'qann') c.onAnnounce(m.from, m.data);
      else if (m.ch === 'qcancel') c.onCancel(m.from, m.data);
      else if (m.ch === 'qprop') c.onProposal(m.from, m.data);
      else if (m.ch === 'qack') c.onAck(m.from, m.data);
      else if (m.ch === 'qdecl') c.onDecline(m.from, m.data);
    }
  };
  const run = async (ms, step = 500) => {
    for (let t = 0; t < ms; t += step) {
      clock.t += step;
      clock.wall += step;
      for (const c of cores.values()) c.tick();
      deliver();
      await settle();
      deliver();
      await settle();
    }
  };
  return { clock, cores, log, drop, run, deliver, inbox };
}

{
  // 2v2, four peers enter 10 ms apart: p1 is the earliest and must be the only proposer
  const L = makeLobby(['p1', 'p2', 'p3', 'p4']);
  const rat = { p1: 1500, p2: 1510, p3: 1490, p4: 1500 };
  for (const id of L.cores.keys()) { L.clock.wall += 10; const r = L.cores.get(id).enter('arena:2v2:r', { rating: rat[id], mmr: rat[id] }); if (!r.ok) ok('que.enter ' + id, false, r.reason); }
  L.deliver();
  await L.run(6000);
  ok('que.exactly one host() call, by the earliest queuer', L.log.host.length === 1 && L.log.host[0].id === 'p1', JSON.stringify(L.log.host.map((h) => h.id)));
  ok('que.the other three joined the proposer', L.log.join.length === 3 && L.log.join.every((j) => j.proposer === 'p1' && j.p.code === 'ABCDEF' && j.p.mid === L.log.host[0].p.mid));
  const pr = L.log.host[0].p;
  ok('que.proposal: pvp mode, 2v2 ranked, map from the proposer, 4 members', pr.mode === 'pvp' && pr.bracket === '2v2' && pr.ranked && pr.arenaId === 'kirik_kemer' && pr.members.length === 4);
  ok('que.proposal teams: snake by MMR, two + two, every member once', pr.teams.A.length === 2 && pr.teams.B.length === 2 && new Set([...pr.teams.A, ...pr.teams.B]).size === 4 && pr.teams.A.join() === 'p2,p3' && pr.teams.B.join() === 'p1,p4', JSON.stringify(pr.teams));
  ok('que.proposal members carry the MMR', pr.members.find((m) => m.peerId === 'p2').rating === 1510);
  ok('que.everybody ends in_match, nobody proposed twice', [...L.cores.values()].every((c) => c.state().phase === 'in_match') && L.log.sent.filter((s) => s.ch === 'qprop').length === 3);
  ok('que.members acked once each', L.log.sent.filter((s) => s.ch === 'qack').length === 3);
  ok('que.entering the match cancels the queue entry for the others', L.log.sent.filter((s) => s.ch === 'qcancel').length === 4);
  const c1 = L.cores.get('p1');
  c1.finish();
  ok('que.finish() returns to idle', c1.state().phase === 'idle' && c1.state().key === null);
}
{
  // not enough players: nothing happens, the window grows with waiting
  const L = makeLobby(['p1', 'p2', 'p3', 'p4']);
  const rat = { p1: 1500, p2: 1500, p3: 1500, p4: 1900 };
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:2v2:r', { rating: rat[id], mmr: rat[id] }); }
  await L.run(10000);
  ok('que.a 400-point outlier is not matched in the first 10 s', L.log.host.length === 0 && L.cores.get('p1').state().phase === 'searching');
  ok('que.queue state reports the rating window and the pool', (() => { const s = L.cores.get('p1').state(); return s.window && s.window[0] === 1500 - 175 && s.window[1] === 1500 + 175 && s.pool === 4; })(), JSON.stringify(L.cores.get('p1').state().window));
  await L.run(60000);
  ok('que.after ~70 s the window (600 cap, 300 at 60 s... 400 needs 100 s) still holds', L.log.host.length === 0);
  await L.run(40000);
  ok('que.after ~110 s the window reaches 400+ and the group forms', L.log.host.length === 1, `host calls ${L.log.host.length}`);
}
{
  // a member that never answers: ack timeout 8 s, the others are withdrawn and re-queued, the silent one is skipped for 30 s
  const L = makeLobby(['p1', 'p2', 'p3', 'p4']);
  L.drop.add('p4:qprop');
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:2v2:u', { rating: 1500 }); }
  L.deliver();
  await L.run(3000);
  ok('que.proposal sent, waiting for the silent member', L.cores.get('p1').state().phase === 'proposed' && L.log.host.length === 0);
  ok('que.acking members are busy (flagged in qann)', L.cores.get('p2').state().phase === 'joining');
  await L.run(QUEUE_TIMING.ackMs);
  ok('que.ack timeout: nobody is hosted, everybody searches again', L.log.host.length === 0 && ['p1', 'p2', 'p3'].every((id) => L.cores.get(id).state().phase === 'searching'), ['p1', 'p2', 'p3'].map((id) => L.cores.get(id).state().phase).join());
  ok('que.withdrawn members got a qdecl(moved)', L.log.sent.some((s) => s.ch === 'qdecl' && s.from === 'p1'));
  L.drop.clear();
  await L.run(QUEUE_TIMING.skipMs + 6000);
  ok('que.after the skip time the full group forms (re-queued at the old position, same proposer)', L.log.host.length === 1 && L.log.host[0].id === 'p1', `host ${L.log.host.length}`);
}
{
  // a member that declines (busy): counted as a miss only when not busy; two real declines in 5 min -> cooldown
  const L = makeLobby(['p1', 'p2']);
  L.cores.get('p2').onProposal = () => {}; // never answers
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:1v1:r', { rating: 1500 }); }
  L.deliver();
  await L.run(QUEUE_TIMING.ackMs + 2000);
  ok('que.1v1 silent opponent: no host, proposer back to searching', L.log.host.length === 0 && L.cores.get('p1').state().phase === 'searching');
  await L.run(QUEUE_TIMING.skipMs + QUEUE_TIMING.ackMs + 3000);
  ok('que.second miss inside 5 min -> 2 min cooldown: no more proposals to him', (() => {
    const props = L.log.sent.filter((s) => s.ch === 'qprop' && s.from === 'p1').length;
    return props >= 2 && L.cores.get('p1').state().phase === 'searching';
  })());
  const before = L.log.sent.filter((s) => s.ch === 'qprop').length;
  await L.run(60000);
  ok('que.the cooldown holds (no proposal for the next minute)', L.log.sent.filter((s) => s.ch === 'qprop').length === before);
}
{
  // proposer fails to host: members are told, everybody re-queues
  const L = makeLobby(['p1', 'p2'], { hostOk: () => false });
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:1v1:r', { rating: 1500 }); }
  L.deliver();
  const notices = [];
  L.cores.get('p1').onChange((s, n) => { if (n) notices.push(n.k); });
  await L.run(3000);
  ok('que.host failure: joinFail notice, back to searching', notices.includes('joinFail') && L.cores.get('p1').state().phase !== 'in_match');
  ok('que.host failure: the member was released (qdecl cancel)', L.log.sent.some((s) => s.ch === 'qdecl' && s.from === 'p1'));
}
{
  // the member joins the proposer's room first and then cancels its entry (it leaves the lobby pools): a proposer that is still hosting keeps the match
  let gate;
  const hostWait = new Promise((r) => { gate = r; });
  const L = makeLobby(['p1', 'p2'], { hostWait });
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:1v1:r', { rating: 1500 }); }
  L.deliver();
  const notices = [];
  L.cores.get('p1').onChange((s, n) => { if (n) notices.push(n.k); });
  await L.run(3000);
  ok('que.member entered the match and cancelled its entry while the proposer is still hosting', L.cores.get('p2').state().phase === 'in_match' && L.log.sent.some((s) => s.ch === 'qcancel' && s.from === 'p2'));
  ok("que.the hosting proposer is not thrown back to the queue by the member's qcancel", L.cores.get('p1').state().phase === 'joining' && !notices.includes('declined'), L.cores.get('p1').state().phase + ' ' + notices.join());
  gate();
  await L.run(1000);
  ok('que.... and reaches in_match once its room is ready', L.cores.get('p1').state().phase === 'in_match' && !notices.includes('declined'));
}
{
  // member cannot join the room: joinFail + re-queue at the old position
  const L = makeLobby(['p1', 'p2'], { joinOk: () => ({ ok: false, reason: 'Oda dolu.' }) });
  const notes = [];
  L.cores.get('p2').onChange((s, n) => { if (n) notes.push(n); });
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:1v1:u', { rating: 1500 }); }
  L.deliver();
  await L.run(2500);
  ok('que.join failure: reason shown, member searching again', notes.some((n) => n.k === 'joinFail' && n.reason === 'Oda dolu.') && L.cores.get('p2').state().phase !== 'in_match');
}
{
  // cancel in every phase
  const L = makeLobby(['p1', 'p2', 'p3']);
  const c = L.cores.get('p1');
  ok('que.cancel while idle is a no-op', (c.cancel(), c.state().phase === 'idle'));
  c.enter('arena:2v2:r', { rating: 1500 });
  ok('que.second enter refused', c.enter('arena:2v2:r', {}).ok === false && c.enter('arena:2v2:r', {}).reason === 'Zaten bir kuyruktasın.');
  c.cancel();
  ok('que.cancel sends qcancel and goes idle', c.state().phase === 'idle' && L.log.sent.some((s) => s.ch === 'qcancel' && s.from === 'p1'));
  ok('que.invalid keys / dungeon without a role refused', c.enter('arena:9v9:r', {}).ok === false && c.enter('dun:rnd:heroic:b4', {}).ok === false && c.enter('dun:rnd:heroic:b4', { roles: ['tank'] }).ok === true);
  c.cancel();
  c.setLock(L.clock.t + 120000);
  ok('que.lock refuses entering with a Turkish reason', (() => { const r = c.enter('arena:2v2:r', {}); return !r.ok && r.reason.includes('dk'); })());
  L.clock.t += 121000;
  ok('que.lock expires', c.enter('arena:2v2:r', {}).ok === true);
  c.cancel();
  ok('que.max wait 15 min -> timeout notice and idle', await (async () => {
    const L2 = makeLobby(['p1']);
    const c2 = L2.cores.get('p1');
    let got = false;
    c2.onChange((s, n) => { if (n?.k === 'timeout') got = true; });
    c2.enter('arena:2v2:r', {});
    await L2.run(QUEUE_TIMING.maxWaitMs + 2000, 5000);
    return got && c2.state().phase === 'idle';
  })());
}
{
  // anti-abuse (2.9.5)
  const L = makeLobby(['me', 'evil', 'p2']);
  const me = L.cores.get('me');
  me.enter('arena:2v2:r', { rating: 1500 });
  const ann = (id, o = {}) => ({ t: 'qann', proto: 3, gameVersion: 'g1', key: 'arena:2v2:r', shard: 1, name: id, classId: 'knight', level: 40, ilvl: 100, roles: [], rating: 1500, since: 5, rev: 1, ...o });
  me.onAnnounce('p2', ann('p2'));
  ok('que.a normal announcement joins the pool', me.poolSize() === 1);
  for (let i = 0; i < 5; i++) me.onAnnounce('evil', ann('evil', { rev: i + 1 }));
  ok('que.more than 2 announcements per second: sender dropped and muted', me.poolSize() === 1);
  L.clock.t += 5000;
  me.onAnnounce('evil', ann('evil', { rev: 99 }));
  ok('que.still muted 5 s later', me.poolSize() === 1);
  L.clock.t += 31000;
  me.onAnnounce('evil', ann('evil', { rev: 100 }));
  ok('que.mute ends after 30 s', me.poolSize() === 2);
  me.onAnnounce('p2', ann('p2', { rev: 0 }));
  ok('que.stale rev ignored, wrong protocol / version ignored', (() => { const n = me.poolSize(); me.onAnnounce('x1', ann('x1', { proto: 2 })); me.onAnnounce('x2', ann('x2', { gameVersion: 'old' })); return me.poolSize() === n; })());
  ok('que.garbage never throws', (() => { for (const g of [null, 5, 'x', {}, { t: 'qann' }, { t: 'qann', key: 'arena:2v2:r' }, [], { t: 'qann', key: 'a'.repeat(100), classId: 'knight', since: 1 }]) { me.onAnnounce('g', g); me.onProposal('g', g); me.onAck('g', g); me.onCancel('g', g); me.onDecline('g', g); } return true; })());

  // proposals: only from the earliest member of the proposal (as seen locally), only with me inside, only for my key
  const L2 = makeLobby(['me', 'p1', 'p2', 'p3'], { joinOk: () => ({ ok: true }) });
  const c = L2.cores.get('me');
  c.enter('arena:2v2:r', { rating: 1500 });
  const mk = (id, since) => ann(id, { since });
  c.onAnnounce('p1', mk('p1', 100));
  c.onAnnounce('p2', mk('p2', 200));
  c.onAnnounce('p3', mk('p3', 300));
  const members = ['me', 'p1', 'p2', 'p3'].map((peerId) => ({ peerId, role: null, classId: 'knight', level: 40, ilvl: 100, rating: 1500 }));
  const prop = (mid, from, o = {}) => ({ t: 'qprop', mid, key: 'arena:2v2:r', shard: 1, code: 'ABCDEF', mode: 'pvp', dungeonId: null, diff: null, keyLevel: 0, bracket: '2v2', ranked: true, teams: { A: ['me', 'p1'], B: ['p2', 'p3'] }, arenaId: 'kirik_kemer', members, affixes: [], ...o });
  const acks = () => L2.log.sent.filter((s) => s.ch === 'qack').length;
  c.onProposal('p2', prop('AAAAAAAA', 'p2'));
  ok('que.proposal from a later queuer (p1 is earlier) refused', acks() === 0 && c.state().phase === 'searching');
  c.onProposal('stranger', prop('BBBBBBBB', 'stranger'));
  ok('que.proposal from a peer not in the pool refused', acks() === 0);
  c.onProposal('p1', prop('CCCCCCCC', 'p1', { members: members.slice(1) }));
  ok('que.proposal without me refused', acks() === 0);
  c.onProposal('p1', prop('DDDDDDDD', 'p1', { key: 'arena:2v2:u' }));
  ok('que.proposal for another key refused', acks() === 0);
  c.onProposal('p1', prop('EEEEEEEE', 'p1', { teams: { A: ['me'], B: ['p2', 'p3', 'p1'] } }));
  ok('que.arena proposal with broken teams refused', acks() === 0);
  c.onProposal('p1', prop('FFFFFFFF', 'p1', { code: '0O1I' }));
  ok('que.proposal with a bad room code refused', acks() === 0);
  c.onProposal('p1', prop('GGGGGGGG', 'p1'));
  ok('que.the legitimate proposal (earliest proposer) is acked and joined', acks() === 1 && c.state().phase === 'joining' && L2.log.join.length === 1 && L2.log.join[0].proposer === 'p1');
  c.onProposal('p2', prop('HHHHHHHH', 'p2'));
  ok('que.a second proposal while joining gets busy', L2.log.sent.some((s) => s.ch === 'qdecl' && s.to === 'p2'));
  await settle();
  ok('que.join result moves the member to in_match', c.state().phase === 'in_match');
}
{
  // two simultaneous proposers (both think they are first): the later one steps down
  const L = makeLobby(['p1', 'p2', 'p3', 'p4']);
  // p2 queued earlier than p1 in p1's view? both still see p1.since < p2.since, so only p1 proposes.
  for (const id of L.cores.keys()) { L.clock.wall += 10; L.cores.get(id).enter('arena:2v2:u', { rating: 1500 }); }
  L.deliver();
  await L.run(5000);
  ok('que.never two proposals for one group', L.log.sent.filter((s) => s.ch === 'qprop').length === 3 && L.log.host.length === 1);
}

// ====================================================================================================================
// rnd.*
// ====================================================================================================================
const mkMatch = (o = {}) => {
  const ev = [];
  const hp = { a1: 1, a2: 1, b1: 1, b2: 1 };
  const m = new ArenaMatch({ matchId: 'MID00001', bracket: '2v2', ranked: true, teams: { A: ['a1', 'a2'], B: ['b1', 'b2'] }, mean: [1500, 1520], ...o }, (e) => ev.push(e), (p) => hp[p] ?? 0);
  const tickSec = (s, step = 0.5) => { for (let t = 0; t < s - 1e-9; t += step) m.tick(step); };
  return { m, ev, hp, tickSec, phases: () => ev.filter((e) => e.k === 'phase').map((e) => e.ph + (e.round ? e.round : '')) };
};
{
  const X = mkMatch();
  ok('rnd.starts in loading, nothing ticks before begin', X.m.phase === 'loading' && (X.tickSec(10), X.ev.length === 0));
  X.m.begin();
  ok('rnd.begin -> prep 30 s, round 1, everybody alive', X.m.phase === 'prep' && X.m.left === 30 && X.m.round === 1 && X.m.alive.size === 4 && X.ev[0].ph === 'prep' && X.ev[0].left === 30);
  X.m.down('a1');
  ok('rnd.nobody can die in prep', X.m.alive.size === 4);
  X.tickSec(29.5);
  ok('rnd.still prep at 29.5 s', X.m.phase === 'prep');
  X.tickSec(0.5);
  ok('rnd.gates open at 30 s: live, 300 s on the clock, damp 0', X.m.phase === 'live' && near(X.m.left, 300) && X.ev.some((e) => e.k === 'phase' && e.ph === 'live') && X.ev.some((e) => e.k === 'damp' && e.pct === 0));
  X.tickSec(120);
  ok('rnd.dampening 0 % at 120 s live', X.m.dampPct === 0 && X.ev.filter((e) => e.k === 'damp').every((e) => e.pct === 0));
  X.tickSec(60);
  ok('rnd.dampening 8 % at 180 s', near(X.m.dampPct, 8) && X.ev.filter((e) => e.k === 'damp').pop().pct === 8);
  ok('rnd.damp announced once per second (~181 messages by 180 s)', (() => { const n = X.ev.filter((e) => e.k === 'damp').length; return n >= 178 && n <= 183; })(), String(X.ev.filter((e) => e.k === 'damp').length));
  X.m.down('b1');
  X.m.down('b2');
  ok('rnd.deaths emit out events with the team', X.ev.filter((e) => e.k === 'out').map((e) => e.peer + e.team).join() === 'b1B,b2B');
  X.tickSec(0.5);
  ok('rnd.a wiped team loses the round: round_end 15 s, score 1-0, round winner A', X.m.phase === 'round_end' && X.m.score[0] === 1 && X.m.left === 15 && X.ev.filter((e) => e.k === 'phase').pop().rw === 'A');
  X.tickSec(15);
  ok('rnd.after the intermission prep of round 2: everybody alive again, clock reset', X.m.phase === 'prep' && X.m.round === 2 && X.m.alive.size === 4 && X.m.liveSec === 0 && X.m.dampPct === 0);
  X.tickSec(30);
  X.m.down('b1'); X.m.down('b2');
  X.tickSec(0.5);
  ok('rnd.second round win ends the match 2-0: match_end + result', X.m.over && X.m.result.winner === 'A' && X.m.result.why === 'normal' && X.m.result.score.join() === '2,0' && X.ev.filter((e) => e.k === 'result').length === 1);
  ok('rnd.the result carries the team means', X.m.result.mean.join() === '1500,1520');
  X.tickSec(100);
  ok('rnd.nothing happens after match_end', X.ev.filter((e) => e.k === 'result').length === 1 && X.m.phase === 'match_end');
  ok('rnd.phase sequence', X.phases().join() === 'prep1,live1,round_end1,prep2,live2,match_end2', X.phases().join());
}
{
  // best of 3: A, B, then the decider by time-out with more fighters alive
  const X = mkMatch();
  X.m.begin(); X.tickSec(30); X.m.down('b1'); X.m.down('b2'); X.tickSec(0.5); X.tickSec(15 + 30);
  X.m.down('a1'); X.m.down('a2'); X.tickSec(0.5);
  ok('rnd.1-1 after B wins round 2', X.m.score.join() === '1,1' && X.m.phase === 'round_end');
  X.tickSec(15 + 30);
  X.m.down('b2');
  X.tickSec(300);
  ok('rnd.round 3 time-out: more fighters alive wins and decides the match', X.m.over && X.m.result.winner === 'A' && X.m.result.score.join() === '2,1', JSON.stringify(X.m.result));
}
{
  // time-out ties: HP sum, then a draw round; two draw rounds make a match draw
  const X = mkMatch();
  X.m.begin(); X.tickSec(30);
  X.m.down('a2'); X.m.down('b2');
  X.hp.a1 = 0.9; X.hp.b1 = 0.4;
  X.tickSec(300);
  ok('rnd.time-out, equal fighters: the larger HP sum wins', X.m.score.join() === '1,0' && X.ev.filter((e) => e.k === 'phase').pop().rw === 'A');
  const Y = mkMatch();
  Y.m.begin(); Y.tickSec(30);
  Y.tickSec(300);
  ok('rnd.time-out, everything equal: draw round, not a score', Y.m.score.join() === '0,0' && Y.m.draws === 1 && Y.ev.filter((e) => e.k === 'phase').pop().rw === 'draw' && Y.m.phase === 'round_end');
  Y.tickSec(15);
  ok('rnd.a draw round is replayed (round counter moves, still best of 3)', Y.m.phase === 'prep' && Y.m.round === 2);
  Y.tickSec(30 + 300);
  ok('rnd.second draw round: match draw', Y.m.over && Y.m.result.winner === 'draw' && Y.m.result.why === 'draw', JSON.stringify(Y.m.result));
  const Z = mkMatch();
  Z.m.begin(); Z.tickSec(30);
  Z.m.down('a1'); Z.m.down('a2'); Z.m.down('b1'); Z.m.down('b2');
  Z.tickSec(0.5);
  ok('rnd.everybody dead in the same tick: draw round', Z.m.draws === 1 && Z.m.score.join() === '0,0');
  const W = mkMatch();
  W.m.begin(); W.tickSec(30); W.m.down('a1'); W.m.down('a2'); W.tickSec(0.5);
  ok('rnd.1v1 style: the dead stay out of the round only', W.m.score.join() === '0,1');
}
{
  // forfeit / void
  const X = mkMatch();
  X.m.begin(); X.tickSec(40);
  X.m.leave('a2');
  ok('rnd.a leaver forfeits the match for his team: other team wins 2-0', X.m.over && X.m.result.winner === 'B' && X.m.result.why === 'forfeit' && X.m.result.score.join() === '0,2' && X.ev.some((e) => e.k === 'forfeit' && e.peer === 'a2'));
  const Y = mkMatch();
  Y.m.leave('b1');
  ok('rnd.leaving before the first prep voids the match', Y.m.over && Y.m.result.why === 'void' && Y.m.result.winner === 'draw');
  const Z = mkMatch();
  Z.m.begin(); Z.tickSec(40); Z.m.voidMatch();
  ok('rnd.host leaves: void (no winner)', Z.m.over && Z.m.result.why === 'void');
  Z.m.leave('a1'); Z.m.voidMatch();
  ok('rnd.leaving a finished match changes nothing', Z.m.result.why === 'void' && Z.ev.filter((e) => e.k === 'result').length === 1);
  const V = mkMatch();
  V.m.begin(); V.tickSec(30 + 2); V.m.leave('nobody');
  ok('rnd.a stranger leaving is ignored', !V.m.over);
  const S = mkMatch();
  S.m.begin(); S.tickSec(30); S.m.down('b1'); S.m.down('b2'); S.tickSec(0.5); S.tickSec(5);
  S.m.leave('b1');
  ok('rnd.forfeit during the intermission ends the match', S.m.over && S.m.result.why === 'forfeit' && S.m.result.winner === 'A');
  const O = mkMatch({ bracket: '1v1', teams: { A: ['a1'], B: ['b1'] } });
  O.m.begin(); O.tickSec(30); O.m.down('b1'); O.tickSec(0.5); O.tickSec(15 + 30); O.m.down('b1'); O.tickSec(0.5);
  ok('rnd.1v1 flow to 2-0', O.m.over && O.m.result.winner === 'A');
}

// ====================================================================================================================
// ladder (rate.* continued): persistence on a plain save
// ====================================================================================================================
function makeLadder(o = {}) {
  const save = { titles: [] };
  const wallet = { onur_puani: 0, fetih_puani: 0, fetih_muhru: 0 };
  const caps = { onur: 0, fetih: 0 };
  const st = { week: o.week ?? 0, day: o.day ?? 20261014, now: 1_800_000_000_000, persists: 0, honors: 0, ratings: [], titles: [] };
  const ladder = new ArenaLadder({
    save: () => save, persist: () => { st.persists++; }, week: () => st.week, day: () => st.day, nowMs: () => st.now,
    addMaterial: (id, n) => { wallet[id] += n; },
    grantOnur: (n) => { const g = Math.min(Math.floor(n), Math.max(0, 1500 - caps.onur)); caps.onur += g; wallet.onur_puani += g; return g; },
    grantFetih: (n) => { const cap = R.fetihWeekCap(R.weekInSeason(st.week)); const g = Math.min(Math.floor(n), Math.max(0, cap - caps.fetih)); caps.fetih += g; wallet.fetih_puani += g; return g; },
    onurToday: () => ({ earned: caps.onur, cap: 1500 }), fetihWeek: () => ({ earned: caps.fetih, cap: R.fetihWeekCap(R.weekInSeason(st.week)) }),
    onHonor: (n) => { st.honors += n; }, onRating: (b, x, y) => st.ratings.push([b, x, y]), onTitle: (id) => st.titles.push(id),
  });
  return { ladder, save, wallet, caps, st };
}
const res = (o = {}) => ({ bracket: '2v2', ranked: true, winner: 'A', why: 'normal', myTeam: 'A', mean: [1500, 1500], opponents: ['x', 'y'], ...o });
{
  const { ladder, save, wallet, st } = makeLadder();
  ok('rate.ladder: first read creates the profile (1500 everywhere, season 1, persisted)', ladder.rating('2v2') === 1500 && ladder.mmr('3v3') === 1500 && save.arena.season === 0 && ladder.season().season === 1 && ladder.season().week === 1 && st.persists >= 1);
  const a = ladder.applyResult(res());
  ok('rate.ladder: ranked win +24, games 1, wins 1, peak', a.outcome === 'win' && a.rating.delta === 24 && ladder.rating('2v2') === 1524 && save.arena.games['2v2'] === 1 && save.arena.wins['2v2'] === 1 && save.arena.peak['2v2'] === 1524);
  ok('rate.ladder: other brackets untouched', ladder.rating('1v1') === 1500 && ladder.rating('3v3') === 1500);
  ok('rate.ladder: ranked win pays 20 + 100 (first win) Onur, 30 Fetih', a.rewards.onur === 120 && a.rewards.fetih === 30 && a.rewards.firstWin && wallet.onur_puani === 120 && wallet.fetih_puani === 30 && st.honors === 120);
  const b = ladder.applyResult(res({ opponents: ['p', 'q'] }));
  ok('rate.ladder: the first-win bonus is once a day', b.rewards.firstWin === false && b.rewards.onur === 20 && wallet.onur_puani === 140);
  st.day++;
  const c = ladder.applyResult(res({ opponents: ['r', 's'] }));
  ok('rate.ladder: a new day brings it back', c.rewards.firstWin && c.rewards.onur === 120);
  const l = ladder.applyResult(res({ winner: 'B', opponents: ['t', 'u'] }));
  ok('rate.ladder: ranked loss lowers the rating, pays 5 Onur + 8 Fetih', l.outcome === 'loss' && l.rating.delta < 0 && l.rewards.onur === 5 && l.rewards.fetih === 8);
  const before = ladder.rating('2v2');
  const u = ladder.applyResult(res({ ranked: false, winner: 'A', opponents: ['v', 'w'] }));
  ok('rate.ladder: unranked changes no rating, pays Onur only', ladder.rating('2v2') === before && u.rating === null && u.rewards.fetih === 0 && u.rewards.onur === 30);
  const dr = ladder.applyResult(res({ winner: 'draw', why: 'draw', opponents: ['x1', 'y1'] }));
  ok('rate.ladder: match draw: rating unchanged (delta 0), half rewards', dr.outcome === 'draw' && dr.rating && dr.rating.delta === 0 && ladder.rating('2v2') === before && dr.rewards.fetih === 15);
  const w0 = wallet.onur_puani;
  const vd = ladder.applyResult(res({ why: 'void', winner: 'draw' }));
  ok('rate.ladder: void match: nothing at all', vd.outcome === 'void' && vd.rating === null && wallet.onur_puani === w0 && vd.rewards.onur === 0);
  const lv = ladder.applyResult(res({ winner: 'B', why: 'forfeit', leaver: true, opponents: ['z1', 'z2'] }));
  ok('rate.ladder: a leaver loses rating and gets no rewards', lv.rating.delta < 0 && lv.rewards.onur === 0 && lv.rewards.fetih === 0 && wallet.onur_puani === w0);
  ok('rate.ladder: best() and tier()', ladder.best() === Math.max(ladder.rating('1v1'), ladder.rating('2v2'), ladder.rating('3v3')) && ladder.tier('2v2').name === R.tierOf(ladder.rating('2v2')).name);
  ok('rate.ladder: rating event fired per change', st.ratings.length >= 4 && st.ratings.every(([bk, x, y]) => bk === '2v2' && x !== y));
}
{
  // leave penalty
  const { ladder, st } = makeLadder();
  const mins = [ladder.penalizeLeave(), ladder.penalizeLeave(), ladder.penalizeLeave(), ladder.penalizeLeave(), ladder.penalizeLeave()];
  ok('rate.ladder: forfeits escalate the queue lock 5 / 15 / 30 / 60 / 60', mins.join() === '5,15,30,60,60');
  ok('rate.ladder: the lock is a timestamp in the future', ladder.lockRemainingMs() > 59 * 60000 && ladder.lockedUntil() > st.now);
  st.now += 61 * 60000;
  ok('rate.ladder: the lock expires', ladder.lockRemainingMs() === 0);
  st.day++;
  ok('rate.ladder: the next day starts at 5 min again', ladder.penalizeLeave() === 5);
}
{
  // caps: ranked wins until the weekly cap (week 1: 1000) and the daily cap (1500 Onur)
  const { ladder, wallet, caps, st } = makeLadder();
  let lastFetih = -1;
  for (let i = 0; i < 60; i++) { const r = ladder.applyResult(res({ opponents: ['o' + i, 'p' + i] })); lastFetih = r.rewards.fetih; }
  ok('rate.cap: weekly Fetih stops at 1000 in week 1', wallet.fetih_puani === 1000 && caps.fetih === 1000 && lastFetih === 0, `${wallet.fetih_puani}`);
  ok('rate.cap: the Fetih info shows earned / cap', ladder.season().fetih.earned === 1000 && ladder.season().fetih.cap === 1000);
  st.week = 1;
  caps.fetih = 0;
  const r = ladder.applyResult(res({ opponents: ['n1', 'n2'] }));
  ok('rate.cap: next week the cap is 1250 and earning resumes', r.rewards.fetih > 0 && ladder.season().week === 2 && ladder.season().fetih.cap === 1250);
  ok('rate.cap: daily Onur never above 1500', wallet.onur_puani <= 1500, `${wallet.onur_puani}`);
}
{
  // muhru in the last two weeks; anti win-trading
  const { ladder, wallet } = makeLadder({ week: 6 });
  ladder.applyResult(res({ opponents: ['a', 'b'] }));
  ok('rate.muhru: ranked win in week 7 pays 1 Fetih mührü', wallet.fetih_muhru === 1);
  const L2 = makeLadder();
  const deltas = [0, 1, 2, 3].map(() => L2.ladder.applyResult(res({ opponents: ['same', 'pair'] })).rating.delta);
  ok('rate.anti-trade: the same opponents inside an hour pay 100 / 50 / 25 / 0 % of the gain', deltas[0] > deltas[1] && deltas[1] > deltas[2] && deltas[3] === 0 && deltas[2] >= 0, deltas.join());
  const fet = (() => { const L3 = makeLadder(); return [0, 1, 2, 3].map(() => L3.ladder.applyResult(res({ opponents: ['same', 'pair'] })).rewards.fetih); })();
  ok('rate.anti-trade: Fetih from the farmed wins shrinks too', fet.join() === '30,15,7,0', fet.join());
  const L4 = makeLadder();
  ok('rate.anti-trade: a different opponent set resets it', (() => { L4.ladder.applyResult(res({ opponents: ['s', 'p'] })); return L4.ladder.applyResult(res({ opponents: ['q', 'r'] })).rewards.fetih === 30; })());
}
{
  // season rollover
  const { ladder, save, st } = makeLadder({ week: 5 });
  ladder.profile();
  save.arena.rating['2v2'] = 1900; save.arena.mmr['2v2'] = 1900; save.arena.peak['2v2'] = 2150; save.arena.games['2v2'] = 40; save.arena.wins['2v2'] = 22;
  save.arena.rating['3v3'] = 1300; save.arena.mmr['3v3'] = 1300; save.arena.peak['3v3'] = 1450;
  st.week = 8;
  ladder.profile();
  ok('rate.season: the new season soft-resets rating + MMR, clears games and wins', save.arena.season === 1 && ladder.rating('2v2') === 1700 && ladder.mmr('2v2') === 1700 && ladder.rating('3v3') === 1400 && save.arena.games['2v2'] === 0 && save.arena.wins['2v2'] === 0);
  ok('rate.season: peak restarts at the new rating', save.arena.peak['2v2'] === 1700);
  ok('rate.season: the ended season is archived', save.arena.history.length === 1 && save.arena.history[0].season === 0 && save.arena.history[0].best['2v2'] === 2150);
  ok('rate.season: titles by the PEAK of the ended season (Gladyatör + Şampiyon for 2150)', save.titles.includes('pvp_s1_gladyator_2v2') && save.titles.includes('pvp_s1_sampiyon_2v2') && !save.titles.includes('pvp_s1_kadim_2v2') && !save.titles.some((t) => t.endsWith('3v3')), save.titles.join());
  ok('rate.season: title toast hook fired', st.titles.length === 2);
  ladder.profile();
  ok('rate.season: reading again does not roll twice', ladder.rating('2v2') === 1700 && save.arena.history.length === 1);
  const r2 = ladder.applyResult(res({ opponents: ['a', 'b'] }));
  ok('rate.season: ranked games in the new season start provisional again (K 48)', r2.rating.delta === 24);
  // a ranked win that crosses 1800 grants the permanent title
  save.arena.rating['2v2'] = 1795; save.arena.mmr['2v2'] = 1795; save.arena.peak['2v2'] = 1795; save.arena.games['2v2'] = 30;
  ladder.applyResult(res({ opponents: ['c', 'd'], mean: [1800, 1800] }));
  ok('rate.titles: crossing 1800 in a ranked win grants "Gladyatör" (2v2) once', save.titles.filter((t) => t === 'pvp_gladyator_2v2').length === 1);
}
{
  const p = R.normaliseProfile({ rating: { '2v2': 1800 } }, 4);
  ok('rate.old / partial profiles are completed', p.rating['2v2'] === 1800 && p.rating['1v1'] === 1500 && p.mmr['3v3'] === 1500 && p.games['1v1'] === 0 && p.history.length === 0 && p.season === 4 && p.firstWinDay === -1 && p.leaves.n === 0);
  ok('rate.no save: the ladder is inert', (() => { const l = new ArenaLadder({ save: () => null, persist() {}, week: () => 0, day: () => 1, nowMs: () => 0, addMaterial() {}, grantOnur: () => 0, grantFetih: () => 0, onurToday: () => ({ earned: 0, cap: 1500 }), fetihWeek: () => ({ earned: 0, cap: 1000 }) }); return l.rating('2v2') === 1500 && l.applyResult(res()).outcome === 'void' && l.penalizeLeave() === 0; })());
}

// ====================================================================================================================
// wire.*
// ====================================================================================================================
{
  ok('wire.protocol bumped to 3, lobby / game room ids follow', Msg.PROTOCOL_VERSION === 3 && Msg.LOBBY_ROOM_ID === 'efsun-lobby-v3' && Msg.GAME_ROOM_PREFIX === 'efsun-g3-');
  ok('wire.lobby channels carry the queue messages', ['qann', 'qcancel', 'qprop', 'qack', 'qdecl'].every((c) => Msg.LOBBY_CHANNELS.includes(c) && Msg.QUEUE_CHANNELS.includes(c)) && Msg.LOBBY_CHANNELS.every((c) => c.length <= 32));
  ok('wire.arena is a known, host-only game channel', Msg.KNOWN_CHANNELS.has('arena') && Msg.HOST_ONLY_CHANNELS.has('arena') && !Msg.clientMaySend('arena', { k: 'phase' }) && Msg.clientMaySend('hit', {}));
  ok('wire.NET constants (section 8.1)', Msg.NET.QUEUE_ANN_MS === 3000 && Msg.NET.QUEUE_TTL_MS === 12000 && Msg.NET.QUEUE_ACK_TIMEOUT_MS === 8000 && Msg.NET.QUEUE_MAX_WAIT_MS === 900000 && Msg.NET.ARENA_PREP_SEC === 30 && Msg.NET.ARENA_ROUND_SEC === 300 && Msg.NET.ARENA_INTERMISSION_SEC === 15 && Msg.NET.PHIT_MAX_PER_SEC === 12);
  const A = { t: 'qann', proto: 3, gameVersion: 'g', key: 'arena:2v2:r', shard: 1, name: '  Ali‮\u0000  Veli  ', classId: 'knight', level: 99, ilvl: 5000, roles: ['tank', 'tank', 'x', 'dps', 'healer', 'dps'], rating: 99999, mmr: -5, since: 123, rev: 7 };
  const s = Msg.sanitizeQueueAnnounce(A);
  ok('wire.qann sanitised: name cleaned, level / ilvl / rating clamped, roles unique + known', s && s.name === 'Ali Veli' && s.level === 60 && s.ilvl === 999 && s.rating === 5000 && s.mmr === 0 && s.roles.join() === 'tank,dps,healer');
  ok('wire.qann rejects bad keys / classes / since', Msg.sanitizeQueueAnnounce({ ...A, key: 'arena:9v9:r' }) === null && Msg.sanitizeQueueAnnounce({ ...A, key: 'x'.repeat(80) }) === null && Msg.sanitizeQueueAnnounce({ ...A, classId: 'god' }) === null && Msg.sanitizeQueueAnnounce({ ...A, since: 'now' }) === null && Msg.sanitizeQueueAnnounce({ ...A, t: 'ann' }) === null
    && Msg.sanitizeQueueAnnounce(null) === null);
  ok('wire.qann dungeon keys + key level clamp + busy flag', (() => { const d = Msg.sanitizeQueueAnnounce({ ...A, key: 'dun:kemik_mahzeni:mplus:12', keyLevel: 99, dungeons: ['a', 'b', 'c', 'd', 'e'], busy: true }); return d && d.keyLevel === 30 && d.dungeons.length === 4 && d.busy === true; })());
  ok('wire.qcancel / qack', Msg.sanitizeQueueCancel({ t: 'qcancel', key: 'arena:1v1:u', shard: 1 })?.key === 'arena:1v1:u' && Msg.sanitizeQueueCancel({ t: 'qcancel', key: 'zzz' }) === null
    && Msg.sanitizeMatchAck({ t: 'qack', mid: 'ABCD1234' })?.t === 'qack' && Msg.sanitizeMatchAck({ t: 'qdecl', mid: 'ABCD1234', reason: 'busy' })?.reason === 'busy' && Msg.sanitizeMatchAck({ t: 'qack', mid: 'short' }) === null && Msg.sanitizeMatchAck({ t: 'qdecl', mid: 'ABCD1234', reason: 'evil' })?.reason === undefined);
  const mem = (id) => ({ peerId: id, role: null, classId: 'mage', level: 40, ilvl: 100, rating: 1500 });
  const P = { t: 'qprop', mid: 'ABCD1234', key: 'arena:2v2:r', shard: 1, code: 'k7q 2xm', mode: 'pvp', bracket: '2v2', ranked: true, teams: { A: ['a', 'b'], B: ['c', 'd'] }, arenaId: 'kirik_kemer', members: ['a', 'b', 'c', 'd'].map(mem), keyLevel: 0, affixes: [] };
  const sp = Msg.sanitizeMatchProposal(P);
  ok('wire.qprop: room code normalised, teams + members kept', sp && sp.code === 'K7Q2XM' && sp.teams.A.join() === 'a,b' && sp.members.length === 4 && sp.mode === 'pvp' && sp.bracket === '2v2' && sp.arenaId === 'kirik_kemer');
  ok('wire.qprop rejects: bad mid / code / no members / arena without teams / too many players', Msg.sanitizeMatchProposal({ ...P, mid: 'x' }) === null && Msg.sanitizeMatchProposal({ ...P, code: 'AAA' }) === null && Msg.sanitizeMatchProposal({ ...P, members: [] }) === null
    && Msg.sanitizeMatchProposal({ ...P, teams: null }) === null && Msg.sanitizeMatchProposal({ ...P, teams: { A: ['1', '2', '3', '4', '5', '6'], B: ['7'] } }).teams.A.length === 4);
  ok('wire.qprop members: duplicates dropped, max 6', Msg.sanitizeMatchProposal({ ...P, members: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(mem) }).members.length === 6 && Msg.sanitizeMatchProposal({ ...P, members: ['a', 'a', 'b'].map(mem) }).members.length === 2);
  const AM = (o) => Msg.sanitizeArenaMsg(o);
  ok('wire.arena msgs: phase / damp / out / forfeit / result / start', AM({ k: 'phase', m: 'ABCD1234', ph: 'prep', round: 1, left: 30, score: [0, 0] })?.ph === 'prep' && AM({ k: 'damp', m: 'ABCD1234', pct: 24 })?.pct === 24 && AM({ k: 'out', m: 'ABCD1234', peer: 'p9', team: 'B' })?.team === 'B'
    && AM({ k: 'forfeit', m: 'ABCD1234', peer: 'p9' })?.peer === 'p9' && AM({ k: 'result', m: 'ABCD1234', winner: 'A', why: 'normal', score: [2, 1], mean: [1500, 1600] })?.mean[1] === 1600
    && AM({ k: 'start', m: 'ABCD1234', arenaId: 'kirik_kemer', bracket: '2v2', ranked: true, teams: { A: ['a'], B: ['b'] }, seed: 5 })?.bracket === '2v2');
  ok('wire.arena msgs clamp / reject garbage', AM({ k: 'damp', m: 'ABCD1234', pct: 9999 }).pct === 50 && AM({ k: 'phase', m: 'ABCD1234', ph: 'live', round: 99, left: -4, score: [9, 9] }).round === 9 && AM({ k: 'phase', m: 'ABCD1234', ph: 'live', round: 1, left: 1, score: [9, 9] }).score.join() === '2,2'
    && AM({ k: 'phase', m: 'ABCD1234', ph: 'nope', round: 1 }) === null && AM({ k: 'out', m: 'ABCD1234', peer: 'p', team: 'C' }) === null && AM({ k: 'x', m: 'ABCD1234' }) === null && AM({ k: 'damp', m: 'bad' }) === null && AM(null) === null && AM({ k: 'result', m: 'ABCD1234', winner: 'Z', why: 'normal' }) === null);
}

// ====================================================================================================================
// rt.*  (ArenaController on the real Combat + World)
// ====================================================================================================================
function mkPlayer(id, o = {}) {
  const p = new H.FakePlayer(o.cls ?? 'knight', o.level ?? 60);
  Object.defineProperty(p, 'id', { value: id, configurable: true, writable: true });
  p.isLocal = !!o.local;
  p.authority = !!o.local;
  p.name = o.name ?? 'P' + id;
  p.maxHp = p.hp = o.hp ?? 100000;
  p.position.set(o.x ?? 20, 0, o.z ?? 22);
  p.stats.armor = 0;
  H.world.add(p);
  if (o.local) { H.world.localPlayer = G.player = p; }
  return p;
}
function clearWorld() {
  for (const e of [...H.world.entities.values()]) H.world.remove(e);
  H.world.update(0);
  H.world.localPlayer = null;
  G.player = null;
}
{
  clearWorld();
  H.clearEvents();
  const def = ARENAS.kirik_kemer;
  const params = { arenaId: 'kirik_kemer', matchId: 'MID00001', bracket: '2v2', ranked: true, teams: { A: ['host', 'pC'], B: ['pB', 'pD'] }, seed: 7, mean: [1500, 1540] };
  const A = mkPlayer(1, { local: true, name: 'Ali', x: 6, z: 22 });
  const B = mkPlayer(2, { name: 'Veli', x: 12, z: 22 });
  const Cc = mkPlayer(3, { name: 'Can', x: 8, z: 24 });
  const D = mkPlayer(4, { name: 'Deniz', x: 14, z: 24 });
  const sent = [], bc = [], handlers = new Map();
  const net = {
    peers: new Map([['host', { peerId: 'host', slot: 0, name: 'Ali' }], ['pB', { peerId: 'pB', slot: 1, name: 'Veli' }], ['pC', { peerId: 'pC', slot: 2, name: 'Can' }], ['pD', { peerId: 'pD', slot: 3, name: 'Deniz' }]]),
    isAuthority: true, isOnline: true, role: 'host', selfId: 'host', hostId: 'host', lastLeave: null,
    peerOfEntity: (id) => ({ 1: 'host', 2: 'pB', 3: 'pC', 4: 'pD' })[id] ?? null,
    sendTo: (peer, ch, m) => sent.push({ peer, ch, m }),
    broadcast: (ch, m) => bc.push({ ch, m }),
    sendToHost: () => {},
    on: (ch, h) => { handlers.set(ch, h); return () => handlers.delete(ch); },
    leaveRoom: () => { net.left = true; }, enterScene: async () => {}, queue: { matchOver: () => { net.over = true; } },
  };
  G.net = net;
  const applied = [];
  G.arenaLadder = { applyResult: (r) => { applied.push(r); return { outcome: 'win', rating: { before: 1500, after: 1524, delta: 24 }, rewards: { onur: 120, fetih: 30, muhru: 0, firstWin: true }, titles: [] }; }, penalizeLeave: () => { net.penalised = true; return 5; } };
  G.character.recomputeStats = () => {};
  G.character.save.name = 'Ali';
  G.skills.reset = G.skills.reset ?? (() => {});
  const gates = [], tele = [];
  const nav = { setRect: (...a) => gates.push(a) };
  const evs = { phase: [], damp: [], out: [], result: [], rating: [] };
  G.events.on('arena:phase', (e) => evs.phase.push(e));
  G.events.on('arena:damp', (e) => evs.damp.push(e));
  G.events.on('arena:out', (e) => evs.out.push(e));
  G.events.on('arena:result', (e) => evs.result.push(e));
  G.events.on('pvp:rating', (e) => evs.rating.push(e));
  const sp = arenaSpawnFor(params, def, 'host');
  ok('rt.spawn: team A faces east at the first A spawn, B west', near(sp.x, 6) && near(sp.z, 22) && sp.team === 'A' && near(sp.yaw, Math.PI / 2) && arenaSpawnFor(params, def, 'pD').team === 'B' && near(arenaSpawnFor(params, def, 'pD').yaw, -Math.PI / 2) && near(arenaSpawnFor(params, def, 'pC').z, def.spawns.A[1][1] * 4));
  const ctl = startArena({ world: H.world, scene: H.scene, built: { nav }, params, def, teleport: (x, z, yaw) => tele.push([x, z, yaw]) });
  ok('rt.controller registered: current, hook door, arena combat state', arenaController() === ctl && C.arenaCombatActive() && ctl.myTeam === 'A' && ctl.isHost());
  ok('rt.loading: no damage before the match starts', (() => { const h = A.hp; pvp.onClientHit('pB', { targetId: 1, amount: 1000, crit: false, type: 'true', dir: [-1, 0] }); return A.hp === h; })());

  Gd.resetPvpGuard();
  ctl.hostBegin();
  ok('rt.hostBegin: start + prep go out on the arena channel, phase applied locally', bc.some((b) => b.ch === 'arena' && b.m.k === 'start' && b.m.m === 'MID00001') && bc.some((b) => b.ch === 'arena' && b.m.k === 'phase' && b.m.ph === 'prep' && b.m.left === 30) && ctl.snapshot().phase === 'prep' && evs.phase.length === 1 && evs.phase[0].ph === 'prep');
  ok('rt.prep: moved to the team spawn, gates closed, invulnerable, cooldowns reset', tele.length === 1 && near(tele[0][0], 6) && gates.length === def.gates.length && gates.every((g) => g[4] === false) && A.statuses.has('invulnerable'));
  const hp0 = A.hp;
  pvp.onClientHit('pB', { targetId: 1, amount: 1000, crit: false, type: 'true', dir: [-1, 0] });
  ok('rt.prep: hits are dropped by the host rule', A.hp === hp0);
  bc.length = 0;
  for (let i = 0; i < 60; i++) ctl.update(0.5);
  const snap = ctl.snapshot();
  ok('rt.after 30 s: live, gates open, invulnerability removed', snap.phase === 'live' && gates.slice(-def.gates.length).every((g) => g[4] === true) && !A.statuses.has('invulnerable') && bc.some((b) => b.m.k === 'phase' && b.m.ph === 'live'));
  ok('rt.the HUD snapshot', snap.myTeam === 'A' && snap.round === 1 && snap.bracket === '2v2' && snap.ranked && snap.fighters.length === 4 && snap.fighters.find((f) => f.self).name === 'Ali' && snap.mapName === 'Kırık Kemer' && snap.left > 0);

  // hits in the live phase
  const send = (peer, targetId, o = {}) => { Gd.resetPvpGuard(); return pvp.onClientHit(peer, { targetId, amount: 1000, crit: false, type: 'true', dir: [-1, 0], ...o }); };
  const lose = (fn) => { const h = A.hp; fn(); return h - A.hp; };
  ok('rt.live: an enemy hit lands at 34 % (arena multiplier)', lose(() => send('pB', 1)) === 340);
  ok('rt.live: the hook handles player targets, never enemy ids', send('pB', 1) === true && send('pB', 999) === false);
  ok('rt.live: a teammate cannot hurt me', lose(() => send('pC', 1)) === 0);
  ok('rt.live: a stranger cannot hurt me', lose(() => send('stranger', 1)) === 0);
  A.stats.pvpResilience = 0.2;
  ok('rt.resilience 20 % -> 272', lose(() => send('pB', 1)) === 272);
  A.stats.pvpResilience = 0.9;
  ok('rt.resilience counts at most 40 % -> 204', lose(() => send('pB', 1)) === 204);
  A.stats.pvpResilience = 0;
  ok('rt.forged huge amount is clamped by the level cap', lose(() => send('pB', 1, { amount: 1e12 })) === C.arenaHitAmount({ raw: 1e12, attackerLevel: 60, victimPvpResilience: 0, maxHp: A.maxHp }, monsterHP));
  ok('rt.max-hit cap: never more than 45 % of max HP', lose(() => send('pB', 1, { amount: 1e12 })) <= A.maxHp * 0.45 + 1);
  A.hp = A.maxHp;
  // victim re-check: a forwarded hit for a teammate / from a far attacker is refused
  const hpv = A.hp;
  B.position.set(400, 0, 400);
  ctl.victimReceive?.({});
  send('pB', 1);
  ok('rt.an attacker far out of reach hurts nobody (host reach check)', A.hp === hpv);
  B.position.set(12, 0, 22);

  // CC: caps + diminishing returns
  const stunFor = (dur) => { A.statuses.clear(); send('pB', 1, { amount: 10, statuses: [{ status: 'stun', duration: dur }] }); return A.statuses.get('stun')?.remaining ?? 0; };
  const d1 = stunFor(6), d2 = stunFor(6), d3 = stunFor(6), d4 = stunFor(6);
  ok('rt.stun: capped at 3 s, then 50 %, 25 %, immune', near(d1, 3, 0.05) && near(d2, 1.5, 0.05) && near(d3, 0.75, 0.05) && d4 === 0, [d1, d2, d3, d4].map((x) => x.toFixed(2)).join());
  A.statuses.clear();
  send('pB', 1, { amount: 10, statuses: [{ status: 'slow', duration: 4, magnitude: 0.9 }] });
  const slow = A.statuses.get('slow');
  ok('rt.slow: strength floored at 50 %', !!slow && (slow.magnitude === undefined || slow.magnitude <= 0.5 + 1e-9), JSON.stringify(slow && slow.magnitude));
  A.statuses.clear();
  send('pB', 1, { amount: 10, statuses: [{ status: 'haste', duration: 30 }, { status: 'taunt', duration: 9 }] });
  ok('rt.buffs / taunt from the wire are stripped', !A.statuses.has('haste') && !A.statuses.has('taunt'));
  A.statuses.clear();

  // dampening reaches Combat heals
  A.hp = 50000;
  G.combat.healPlayer(null, A, 1000);
  ok('rt.heals at 0 % dampening are whole', A.hp === 51000);
  C.setArenaCombat(true, 24);
  A.hp = 50000;
  G.combat.healPlayer(null, A, 1000);
  ok('rt.heals under 24 % dampening are 760', A.hp === 50760, String(A.hp));
  C.setArenaCombat(true, 0);

  // deaths -> out -> round end -> next prep
  H.events['player:died'] ??= [];
  bc.length = 0;
  G.events.emit('player:died', { entityId: 2, local: false });
  ok('rt.a death in the live phase: out message, event, still fighting', bc.some((b) => b.m.k === 'out' && b.m.peer === 'pB' && b.m.team === 'B') && evs.out.length === 1 && evs.out[0].name === 'Veli' && ctl.snapshot().phase === 'live');
  G.events.emit('player:died', { entityId: 4, local: false });
  ctl.update(0.5);
  ok('rt.last enemy down: round_end, score 1-0, round winner A', ctl.snapshot().phase === 'round_end' && ctl.snapshot().score.join() === '1,0' && evs.phase.pop().rw === 'A');
  ok('rt.round_end: nobody can be hurt (invulnerable)', A.statuses.has('invulnerable'));
  for (let i = 0; i < 30; i++) ctl.update(0.5);
  ok('rt.round 2 prep: back at the spawn, gates closed again, full HP', ctl.snapshot().phase === 'prep' && ctl.snapshot().round === 2 && A.hp === A.maxHp && gates.slice(-def.gates.length).every((g) => g[4] === false) && tele.length >= 2);
  for (let i = 0; i < 60; i++) ctl.update(0.5);
  ok('rt.round 2 live', ctl.snapshot().phase === 'live');
  // dampening over the host channel: after 180 s live -> 8 %
  bc.length = 0;
  for (let i = 0; i < 360; i++) ctl.update(0.5);
  const dm = bc.filter((b) => b.m.k === 'damp').pop();
  ok('rt.dampening: 8 % announced at 180 s and applied to Combat', dm && dm.m.pct === 8 && C.arenaDampPct() === 8 && near(C.arenaHealMult(), 0.92) && evs.damp.pop().pct === 8, JSON.stringify(dm));
  ok('rt.dampening shows up in the snapshot', ctl.snapshot().dampPct === 8);
  // round 2: A wins again -> match over, result, ladder
  G.events.emit('player:died', { entityId: 2, local: false });
  G.events.emit('player:died', { entityId: 4, local: false });
  ctl.update(0.5);
  const sn = ctl.snapshot();
  ok('rt.2-0: match_end with a result for my team', sn.phase === 'match_end' && sn.result && sn.result.winner === 'A' && sn.result.won === true && sn.result.why === 'normal' && sn.exitIn > 19);
  ok('rt.result goes out on the arena channel with the team means', bc.some((b) => b.m.k === 'result' && b.m.winner === 'A' && b.m.mean.join() === '1500,1540'));
  ok('rt.the owner applies ITS OWN result to the ladder (team, means, opponents)', applied.length === 1 && applied[0].bracket === '2v2' && applied[0].ranked && applied[0].myTeam === 'A' && applied[0].winner === 'A' && applied[0].mean.join() === '1500,1540' && applied[0].opponents.join() === 'pB,pD' && !applied[0].leaver);
  ok('rt.arena:result + pvp:rating events for the HUD', evs.result.length === 1 && evs.result[0].won === true && evs.result[0].rating.delta === 24 && evs.result[0].rewards.onur === 120 && evs.rating.length === 1 && evs.rating[0].after === 1524);
  ok('rt.the result is applied once', (() => { ctl.update(0.1); return applied.length === 1; })());
  C.setArenaCombat(true, 0);
  ctl.update(21);
  ok('rt.after 20 s the controller leaves: queue reset, room left, host re-enters town', net.over === true && net.left === true);
  ctl.dispose();
  ok('rt.dispose: no leave penalty after a finished match', net.penalised !== true && applied.length === 1);
  ok('rt.dispose clears the arena state and the hit door', !C.arenaCombatActive() && C.arenaHealMult() === 1 && arenaController() === null && pvp.onClientHit('pB', { targetId: 1, amount: 100, type: 'true', dir: [0, 1] }) === false);
}
{
  // leaving a live match: a loss, no rewards, a queue lock; a vanished host: void
  clearWorld();
  const def = ARENAS.kirik_kemer;
  const params = { arenaId: 'kirik_kemer', matchId: 'MID00002', bracket: '1v1', ranked: true, teams: { A: ['host'], B: ['pB'] }, seed: 7, mean: [1500, 1500] };
  mkPlayer(1, { local: true, x: 6, z: 22 });
  mkPlayer(2, { x: 12, z: 22 });
  const handlers = new Map();
  const applied = [];
  const net = {
    peers: new Map([['host', { peerId: 'host', slot: 0, name: 'Ali' }], ['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]), isAuthority: true, isOnline: false, role: 'host', selfId: 'host', hostId: 'host', lastLeave: null,
    peerOfEntity: (id) => (id === 1 ? 'host' : id === 2 ? 'pB' : null), sendTo() {}, broadcast() {}, sendToHost() {}, on: (ch, h) => { handlers.set(ch, h); return () => handlers.delete(ch); },
    leaveRoom() {}, enterScene: async () => {}, queue: { matchOver() {} },
  };
  G.net = net;
  G.arenaLadder = { applyResult: (r) => { applied.push(r); return { outcome: 'loss', rating: null, rewards: { onur: 0, fetih: 0, muhru: 0 }, titles: [] }; }, penalizeLeave: () => { net.penalised = true; return 15; } };
  const ctl = startArena({ world: H.world, scene: H.scene, built: { nav: { setRect() {} } }, params, def, teleport() {} });
  ctl.hostBegin();
  for (let i = 0; i < 70; i++) ctl.update(0.5);
  ctl.dispose();
  ok('rt.walking out of a live match: ranked loss as a leaver + queue lock', applied.length === 1 && applied[0].leaver === true && applied[0].winner === 'B' && applied[0].why === 'forfeit' && net.penalised === true);

  // a client whose host closed the room: void, no penalty
  clearWorld();
  mkPlayer(1, { local: true, x: 6, z: 22 });
  mkPlayer(2, { x: 12, z: 22 });
  applied.length = 0;
  net.penalised = false;
  net.isAuthority = false; net.role = 'client'; net.selfId = 'pB'; net.hostId = 'host';
  net.peers = new Map([['host', { peerId: 'host', slot: 0, name: 'Ali' }], ['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]);
  net.peerOfEntity = (id) => (id === 1 ? 'host' : id === 2 ? 'pB' : null);
  for (const e of H.world.entities.values()) e.isLocal = e.id === 2;
  H.world.localPlayer = G.player = [...H.world.entities.values()].find((e) => e.id === 2);
  const cl = startArena({ world: H.world, scene: H.scene, built: { nav: { setRect() {} } }, params: { ...params, matchId: 'MID00003' }, def, teleport() {} });
  const hm = handlers.get('arena');
  ok('rt.client: arena channel registered, ignores messages from non-hosts and wrong match ids', typeof hm === 'function' && (hm({ k: 'phase', m: 'MID00003', ph: 'prep', round: 1, left: 30, score: [0, 0] }, 'stranger'), cl.snapshot().phase === 'loading') && (hm({ k: 'phase', m: 'OTHER000', ph: 'prep', round: 1, left: 30, score: [0, 0] }, 'host'), cl.snapshot().phase === 'loading'));
  hm({ k: 'phase', m: 'MID00003', ph: 'prep', round: 1, left: 30, score: [0, 0] }, 'host');
  hm({ k: 'phase', m: 'MID00003', ph: 'live', round: 1, left: 300, score: [0, 0] }, 'host');
  ok('rt.client follows the host phases', cl.snapshot().phase === 'live' && cl.myTeam === 'B' && !cl.isHost());
  hm({ k: 'damp', m: 'MID00003', pct: 16 }, 'host');
  ok('rt.client applies the host dampening value', C.arenaDampPct() === 16);
  net.role = 'offline'; net.lastLeave = 'host_closed';
  cl.dispose();
  ok('rt.host closed the room mid-match: a void result (no loss, no penalty)', applied.length === 1 && applied[0].why === 'void' && !applied[0].leaver && net.penalised === false, JSON.stringify(applied));
}

console.warn = origWarn;
console.log(`\nARENA sim: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
