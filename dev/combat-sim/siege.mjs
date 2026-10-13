#!/usr/bin/env node
// KALE KUSATMASI (MMO pillars WP-14) headless checks - no browser, no network, no wall clock.
//   sched.*  the weekly window: Saturday 17:00 UTC (20:00 UTC+3), 30 min, week grid, determinism, next / running
//   cross.*  calendar phases (soon 5 and 1 min, start, end): order, split without gaps, 10-week count, Turkey clock text
//   guild.*  hostility (systems/SiegeRules.siegeDeny): different guild only, inside the arena, during the window, alive
//   guard.*  net/guard.vetPvpHit with the 'guild' verdict: rejected; the same hit under no verdict passes
//   cap.*    banner (BannerField): 60 s hold, contested freeze, decay, challenger reset, holder keeps, flip events, wire round trip
//   win.*    winner and benefits: nation vote, Pazar tax cut (rounding), Zafer XP multiplier, glow flag
//   rt.*     the runtime on the real Combat + World: host banner from presence, flip after 60 s, contested freeze, end broadcast,
//            save record, client mirror (sg / sgend), stranger ignored, same-guild and closed-window hits refused, victim damage
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/siege.mjs      (V=1 prints every PASS)
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

// console.warn of the guard ([net-guard]) is evidence, not noise
const guardLog = [];
const origWarn = console.warn;
console.warn = (...a) => { const s = a.map(String).join(' '); if (s.includes('[net-guard]')) guardLog.push(s); };

const S = await H.imp('data/siege.ts');
const R = await H.imp('systems/SiegeRules.ts');
const PR = await H.imp('systems/PvpRules.ts');
const Gd = await H.imp('net/guard.ts');
const MK = await H.imp('data/market.ts');
const SG = await H.imp('systems/Siege.ts');
const { monsterHP } = await H.imp('data/mythicAffixes.ts');

const { SIEGE, SIEGE_FORT, WEEK_MS, siegeStartOf, siegeWeekOf, SIEGE_ANCHOR_MS } = S;
const { siegeAt, nextSiege, siegeCrossings, trClock, siegeLines, siegeDeny, BannerField, nationVote, siegeTaxMult, siegeGlow, siegeXpMult, inArena, inBanner } = R;
const GK = 'gok_kartal', KK = 'kizil_kurt';
const SAT = Date.UTC(2026, 9, 17, 17, 0, 0); // Saturday 17 Oct 2026, 17:00 UTC = 20:00 Turkey
const DUR = SIEGE.DUR_SEC * 1000;
const cx = SIEGE_FORT.center[0], cz = SIEGE_FORT.center[1];

// ====================================================================================================================
// sched.*
// ====================================================================================================================
{
  ok('sched.anchor is Saturday 00:00 UTC', new Date(SIEGE_ANCHOR_MS).getUTCDay() === 6 && new Date(SIEGE_ANCHOR_MS).getUTCHours() === 0);
  ok('sched.test date is a Saturday 17:00 UTC', new Date(SAT).getUTCDay() === 6 && new Date(SAT).getUTCHours() === 17 && new Date(SAT).getUTCMinutes() === 0);
  ok('sched.Saturday 17:00 UTC is 20:00 in Turkey (UTC+3)', trClock(SAT) === '17.10 20:00', trClock(SAT));
  ok('sched.every week starts Saturday 17:00 UTC (300 weeks)', (() => {
    for (let w = 2600; w < 2900; w++) {
      const d = new Date(siegeStartOf(w));
      if (d.getUTCDay() !== 6 || d.getUTCHours() !== 17 || d.getUTCMinutes() !== 0) return false;
    }
    return true;
  })());
  ok('sched.start of the test week is siegeStartOf(its week)', siegeStartOf(siegeWeekOf(SAT)) === SAT);
  ok('sched.Saturday 16:59:59 is still the same week (weeks start at midnight)', siegeWeekOf(SAT - 1000) === siegeWeekOf(SAT));
  ok('sched.one week later is exactly WEEK_MS later', siegeStartOf(siegeWeekOf(SAT) + 1) - SAT === WEEK_MS);
  ok('sched.window is 30 minutes', DUR === 1800 * 1000 && SIEGE.DUR_SEC === 1800);
  ok('sched.running from start, inclusive', siegeAt(SAT) !== null && siegeAt(SAT).start === SAT && siegeAt(SAT).end === SAT + DUR);
  ok('sched.last ms running, end exclusive', siegeAt(SAT + DUR - 1) !== null && siegeAt(SAT + DUR) === null);
  ok('sched.not running before the start', siegeAt(SAT - 1) === null);
  ok('sched.next from a moment before the start is this week', nextSiege(SAT - 1).start === SAT);
  ok('sched.next during the window is next week', nextSiege(SAT + 60000).start === SAT + WEEK_MS);
  ok('sched.next after the end is next week', nextSiege(SAT + DUR).start === SAT + WEEK_MS);
  ok('sched.deterministic: same clock, same answer', JSON.stringify(nextSiege(SAT - 5000)) === JSON.stringify(nextSiege(SAT - 5000)) && siegeAt(SAT + 9999) !== null);
  ok('sched.lead times are 5 and 1 minutes', JSON.stringify(SIEGE.LEADS_SEC) === JSON.stringify([300, 60]));
}

// ====================================================================================================================
// cross.*
// ====================================================================================================================
{
  const cs = siegeCrossings(SAT - 3600e3, SAT + 3600e3);
  ok('cross.phases in order: soon 5 min, soon 1 min, start, end', cs.map((c) => c.phase).join() === 'soon,soon,start,end', cs.map((c) => c.phase).join());
  ok('cross.when values exact', cs.map((c) => c.when).join() === [SAT - 300e3, SAT - 60e3, SAT, SAT + DUR].join());
  ok('cross.payload at = start (soon/start) or end', cs[0].at === SAT && cs[1].lead === 60 && cs[2].at === SAT && cs[3].at === SAT + DUR);
  ok('cross.from is exclusive, to is inclusive', siegeCrossings(SAT, SAT + 1).length === 0 && siegeCrossings(SAT - 1000, SAT).length === 1 && siegeCrossings(SAT - 300e3, SAT - 60e3).length === 1);
  let split = true;
  const a = SAT - 900e3, b = SAT + 100e3, c = SAT + 2000e3;
  const whole = siegeCrossings(a, c).map((x) => x.phase + x.when).join('|');
  const parts = [...siegeCrossings(a, b), ...siegeCrossings(b, c)].map((x) => x.phase + x.when).join('|');
  split = whole === parts;
  ok('cross.split ranges give the same phases (no gap, no duplicate)', split);
  const ten = siegeCrossings(0, 10 * WEEK_MS);
  ok('cross.ten weeks = 40 phases, ascending', ten.length === 40 && ten.every((x, i) => i === 0 || ten[i - 1].when <= x.when), `${ten.length}`);
  ok('cross.deterministic', JSON.stringify(siegeCrossings(a, c)) === JSON.stringify(siegeCrossings(a, c)));
  ok('cross.siege text clock matches the window', trClock(SAT - 300e3) === '17.10 19:55', trClock(SAT - 300e3));
  const lines = siegeLines(SAT - 600e3, null);
  ok('cross.chat /kusatma: schedule, next time, no holder', lines.length === 3 && lines[0].includes('20:00') && lines[1].includes('17.10 20:00') && lines[2].includes('henüz yok'), lines.join(' / '));
  const run = siegeLines(SAT + 60e3, { gid: 'A', name: 'Kartal Lonca', nation: GK });
  ok('cross.chat /kusatma while running: remaining time and holder', run[1].startsWith('Kuşatma şu an sürüyor') && run[2].includes('Kartal Lonca') && run[2].includes('Gök Kartal'), run.join(' / '));
}

// ====================================================================================================================
// guild.*  (hostility)
// ====================================================================================================================
{
  const base = { open: true, aIn: true, vIn: true, aId: 1, vId: 2, aDead: false, vDead: false, aGid: 'g1', vGid: 'g2' };
  ok('guild.different guilds inside the arena during the window: allowed', siegeDeny(base) === null);
  ok('guild.same guild: never', siegeDeny({ ...base, vGid: 'g1' }) === 'guild');
  ok('guild.same guild and same nation: still never', siegeDeny({ ...base, vGid: 'g1', aId: 3 }) === 'guild');
  ok('guild.no guild on either side: refused (unknown)', siegeDeny({ ...base, aGid: null }) === 'unknown' && siegeDeny({ ...base, vGid: '' }) === 'unknown');
  ok('guild.window closed: zone', siegeDeny({ ...base, open: false }) === 'zone');
  ok('guild.attacker outside the arena: zone', siegeDeny({ ...base, aIn: false }) === 'zone');
  ok('guild.victim outside the arena: zone', siegeDeny({ ...base, vIn: false }) === 'zone');
  ok('guild.self hit: self', siegeDeny({ ...base, vId: 1 }) === 'self');
  ok('guild.dead victim: dead', siegeDeny({ ...base, vDead: true }) === 'dead');
  ok('guild.dead attacker: dead', siegeDeny({ ...base, aDead: true }) === 'dead');
  ok('guild.arena and banner circles', inArena(cx, cz) && inArena(cx + SIEGE.ARENA_R - 1, cz) && !inArena(cx + SIEGE.ARENA_R + 1, cz));
  ok('guild.banner circle is inside the arena', inBanner(cx, cz) && !inBanner(cx + SIEGE.BANNER_R + 1, cz) && SIEGE.BANNER_R < SIEGE.ARENA_R);
}

// ====================================================================================================================
// guard.*  (net/guard.vetPvpHit)
// ====================================================================================================================
{
  const world = H.world;
  for (const e of [...world.entities.values()]) world.remove(e);
  world.update(0);
  const victim = new H.FakePlayer('knight', 40);
  Object.defineProperty(victim, 'id', { value: 1, configurable: true, writable: true });
  victim.isLocal = false;
  victim.position.set(600, 0, 500);
  world.add(victim);
  const sender = new H.FakePlayer('knight', 40);
  Object.defineProperty(sender, 'id', { value: 2, configurable: true, writable: true });
  sender.isLocal = false;
  sender.position.set(600, 0, 505);
  world.add(sender);
  G.net = { peers: new Map([['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]), isAuthority: true, selfId: 'host', hostId: 'host' };
  Gd.resetPvpGuard();
  guardLog.length = 0;
  ok('guard.a legitimate siege hit passes (no verdict)', Gd.vetPvpHit('pB', victim, undefined, false, 1000, null) === 1000);
  ok('guard.a guild verdict drops it', Gd.vetPvpHit('pB', victim, undefined, false, 1000, 'guild') === null);
  ok('guard.a zone verdict drops it too', Gd.vetPvpHit('pB', victim, undefined, false, 1000, 'zone') === null);
  ok('guard.the refusal is logged with the verdict', guardLog.some((l) => l.includes('pvp-guild')), guardLog[0]);
  delete G.net;
  for (const e of [...world.entities.values()]) world.remove(e);
  world.update(0);
}

// ====================================================================================================================
// cap.*  (the banner)
// ====================================================================================================================
const P = (id, gid, x = cx, z = cz, nation = GK, gname = gid) => ({ id, gid, gname, nation, x, z });
const run = (f, who, secs) => { const out = []; for (let i = 0; i < secs; i++) out.push(...f.step(1, who)); return out; };
{
  let f = new BannerField();
  ok('cap.nothing without presence', run(f, [], 100).length === 0 && f.prog === 0 && f.holder === null);
  f = new BannerField();
  const ev59 = run(f, [P(1, 'A')], 59);
  ok('cap.59 s alone: no flip yet', ev59.length === 0 && f.holder === null && f.prog === 59);
  const ev1 = run(f, [P(1, 'A')], 1);
  ok('cap.60 s alone: flips to A', ev1.length === 1 && ev1[0].type === 'flip' && f.holder && f.holder.gid === 'A' && ev1[0].from === null && f.prog === 0);
  f = new BannerField();
  run(f, [P(1, 'A')], 30);
  run(f, [P(1, 'A'), P(2, 'B', cx + 1)], 100);
  ok('cap.two guilds inside: contested, progress frozen at 30 for 100 s', f.prog === 30 && f.holder === null, `prog ${f.prog}`);
  run(f, [P(1, 'A')], 29);
  ok('cap.after the contest A needs only the rest (59 s)', f.prog === 59 && f.holder === null);
  const flipped = run(f, [P(1, 'A')], 1);
  ok('cap.the 60th second flips', flipped.length === 1 && f.holder.gid === 'A');
  // holder keeps, challenger B resets when alone, decays when nobody is there
  f = new BannerField();
  run(f, [P(1, 'A')], 60);
  run(f, [P(2, 'B')], 30);
  ok('cap.holder A, challenger B alone 30 s: progress 30', f.holder.gid === 'A' && f.prog === 30 && f.cap.gid === 'B');
  run(f, [], 10);
  ok('cap.empty banner: progress runs back 1 per second', f.prog === 20, `prog ${f.prog}`);
  run(f, [P(3, 'A')], 10);
  ok('cap.holder alone: the challenger\'s progress runs back too', f.prog === 10 && f.holder.gid === 'A', `prog ${f.prog}`);
  run(f, [P(2, 'B')], 10);
  ok('cap.challenger B returns and completes after the rest', f.prog === 20 && f.holder.gid === 'A');
  const fl = run(f, [P(2, 'B')], 40);
  ok('cap.B takes the banner at exactly 60 s of progress, from A', fl.length === 1 && f.holder.gid === 'B' && fl[0].from.gid === 'A' && fl[0].to.gid === 'B', JSON.stringify(fl[0]?.to));
  ok('cap.players outside the banner circle are not counted', (() => { const g = new BannerField(); run(g, [P(9, 'Z', cx + 40, cz)], 100); return g.prog === 0 && g.holder === null; })());
  // a challenger switching to another guild restarts the count
  f = new BannerField();
  run(f, [P(1, 'A')], 40);
  run(f, [P(2, 'B')], 1);
  ok('cap.a different guild alone restarts the progress', f.cap.gid === 'B' && f.prog === 1, `${f.cap?.gid} ${f.prog}`);
  // determinism and wire
  const seq = [[P(1, 'A')], [P(1, 'A'), P(2, 'B')], [], [P(2, 'B')], [P(2, 'B')]];
  const r1 = new BannerField(), r2 = new BannerField();
  const o1 = [], o2 = [];
  for (let i = 0; i < 300; i++) {
    const who = seq[i % seq.length];
    o1.push(JSON.stringify(r1.step(0.7, who)), JSON.stringify(r1.toWire()));
    o2.push(JSON.stringify(r2.step(0.7, who)), JSON.stringify(r2.toWire()));
  }
  ok('cap.deterministic: same inputs, same states and events', o1.join() === o2.join());
  const mirror = new BannerField();
  mirror.applyWire(JSON.parse(JSON.stringify(r1.toWire())));
  ok('cap.wire round trip keeps the holder and the progress', JSON.stringify(mirror.holder) === JSON.stringify(r1.holder) && near(mirror.prog, Math.round(r1.prog * 10) / 10, 0.11));
  mirror.applyWire({ h: 'junk', c: 5, p: 'x' });
  ok('cap.junk wire is harmless', mirror.holder === null && mirror.prog === 0);
  const wire = new BannerField();
  wire.applyWire({ h: null, c: '', p: 999 });
  ok('cap.progress from the wire is clamped to 60', wire.prog === SIEGE.HOLD_SEC);
  // delta dt zero or negative: nothing moves
  const z = new BannerField();
  run(z, [P(1, 'A')], 5);
  ok('cap.dt <= 0 does nothing', z.step(0, [P(1, 'A')]).length === 0 && z.step(-3, [P(1, 'A')]).length === 0 && z.prog === 5);
}

// ====================================================================================================================
// win.*  (winner and benefits)
// ====================================================================================================================
{
  ok('win.nation vote: majority wins', nationVote([GK, GK, KK]) === GK && nationVote([KK, KK, null]) === KK);
  ok('win.nation vote: tie and empty give none (no Zafer on a tie)', nationVote([GK, KK]) === null && nationVote([]) === null && nationVote([null]) === null);
  const f = new BannerField();
  run(f, [P(1, 'A', cx, cz, GK, 'Kartal Lonca')], 60);
  ok('win.holder at the end is the winner', f.holder && f.holder.gid === 'A' && f.holder.name === 'Kartal Lonca' && f.holder.nation === GK);
  run(f, [P(2, 'B', cx, cz, KK, 'Kurt Lonca')], 60);
  ok('win.the later holder replaces the earlier one with its nation', f.holder.gid === 'B' && f.holder.nation === KK);
  ok('win.Pazar tax: 3 % of 1000 = 30', MK.saleTax(1000) === 30 && MK.saleTax(1000, 1) === 30);
  ok('win.Pazar tax: holder guild members pay 10 % less (27)', MK.saleTax(1000, siegeTaxMult({ gid: 'A' }, 'A')) === 27);
  ok('win.Pazar tax: others and the no-guild pay the full tax', siegeTaxMult({ gid: 'A' }, 'B') === 1 && siegeTaxMult(null, 'A') === 1 && siegeTaxMult({ gid: 'A' }, null) === 1);
  ok('win.Pazar tax: floors (33 gold sale stays tax free for members)', MK.saleTax(33, siegeTaxMult({ gid: 'A' }, 'A')) === 0);
  ok('win.glow flag only for the holder guild', siegeGlow({ gid: 'A' }, 'A') && !siegeGlow({ gid: 'A' }, 'B') && !siegeGlow(null, 'A') && !siegeGlow({ gid: 'A' }, null));
  const now = SAT + 5000;
  ok('win.Zafer: +5 % XP while it runs, normal after 1 hour', near(siegeXpMult(now + SIEGE.ZAFER_SEC * 1000, now), 1.05) && siegeXpMult(now - 1, now) === 1 && siegeXpMult(undefined, now) === 1);
  ok('win.Zafer is one hour', SIEGE.ZAFER_SEC === 3600 && SIEGE.ZAFER_XP_PCT === 5);
  ok('win.tax cut is 10 %', near(SIEGE.TAX_CUT, 0.1));
}

// ====================================================================================================================
// rt.*  (the runtime)
// ====================================================================================================================
{
  const world = H.world;
  const mkPlayer = (id, o = {}) => {
    const p = new H.FakePlayer(o.cls ?? 'knight', o.level ?? 40);
    Object.defineProperty(p, 'id', { value: id, configurable: true, writable: true });
    p.isLocal = !!o.local;
    p.authority = !!o.local;
    p.nation = o.nation ?? null;
    p.name = o.name ?? 'P' + id;
    p.maxHp = p.hp = o.hp ?? 100000;
    p.position.set(o.x ?? cx, 0, o.z ?? cz);
    p.stats.armor = 0;
    world.add(p);
    if (o.local) { world.localPlayer = G.player = p; }
    return p;
  };
  const clearWorld = () => {
    for (const e of [...world.entities.values()]) world.remove(e);
    world.update(0);
    world.localPlayer = null;
    G.player = null;
  };
  clearWorld();
  H.clearEvents();
  const host = mkPlayer(1, { local: true, nation: GK, name: 'Ali', x: cx, z: cz, hp: 100000 });
  // Veli starts far away (outside the arena): he walks in later
  const B = mkPlayer(2, { nation: KK, name: 'Veli', x: cx + 200, z: cz, hp: 100000 });
  const C = mkPlayer(3, { nation: GK, name: 'Can', x: cx - 2, z: cz, hp: 100000 });
  const guilds = { Veli: { gid: 'G-KK', name: 'Kurt Lonca', gv: 1 }, Can: { gid: 'G-GK', name: 'Kartal Lonca', gv: 1 } };
  G.presence = { find: (name) => ({ name, raw: name, guild: guilds[name] ?? null, nat: undefined }) };
  G.guild = { info: () => ({ gid: 'G-GK', name: 'Kartal Lonca' }), presenceInfo: () => ({ gid: 'G-GK', name: 'Kartal Lonca', gv: 1 }) };
  const sent = [], bc = [], handlers = new Map();
  const net = {
    peers: new Map([['host', { peerId: 'host', slot: 0, name: 'Ali' }], ['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]),
    isAuthority: true, isOnline: true, selfId: 'host', hostId: 'host',
    peerOfEntity: (id) => (id === 1 ? 'host' : id === 2 ? 'pB' : id === 3 ? 'pC' : null),
    sendTo: (peer, ch, m) => sent.push({ peer, ch, m }),
    broadcast: (ch, m) => bc.push({ ch, m }),
    sendToHost: () => {},
    on: (ch, h) => { handlers.set(ch, h); return () => handlers.delete(ch); },
  };
  G.net = net;
  G.character.save.guild = { gid: 'G-GK' };
  G.character.nation = GK;
  delete G.character.save.siege;
  G.character.persist = () => {};
  const chat = [];
  G.events.on('net:chat', (e) => chat.push(e));
  let clock = SAT - 60e3;
  const rt = SG.startSiege({ world, scene: H.scene, now: () => clock });

  rt.update(1);
  ok('rt.before the window: no banner broadcast', bc.filter((b) => b.ch === 'pvp' && b.m.k === 'sg').length === 0);
  clock = SAT;
  rt.update(1);
  const sg1 = bc.filter((b) => b.ch === 'pvp' && b.m.k === 'sg').pop();
  ok('rt.window opens: host steps the banner with the guild in the circle', sg1 && sg1.m.c === 'G-GK' && near(sg1.m.p, 1, 0.11), JSON.stringify(sg1?.m));
  for (let i = 0; i < 58; i++) rt.update(1);
  ok('rt.59 s: still no holder', rt.field.holder === null && near(rt.field.prog, 59, 0.11), `prog ${rt.field.prog}`);
  rt.update(1);
  ok('rt.60 s: G-GK takes the banner, flip announced in chat', rt.field.holder && rt.field.holder.gid === 'G-GK' && chat.some((c) => c.text.includes('bayrağını ele geçirdi')),
    `holder ${JSON.stringify(rt.field.holder)} prog ${rt.field.prog} chat ${chat.map((c) => c.text).join(' | ')}`);
  // a rival guild steps in: contested freezes
  B.position.set(cx + 3, 0, cz + 3);
  for (let i = 0; i < 90; i++) rt.update(1);
  ok('rt.a rival guild in the circle: contested, holder kept, no progress', rt.field.holder.gid === 'G-GK' && rt.field.prog === 0 && rt.field.cap === null);
  // holder leaves: the rival completes alone
  host.position.set(0, 0, 0);
  C.position.set(0, 0, 0);
  for (let i = 0; i < 60; i++) rt.update(1);
  ok('rt.the rival alone for 60 s takes the banner from G-GK', rt.field.holder && rt.field.holder.gid === 'G-KK' && rt.field.holder.nation === KK, JSON.stringify(rt.field.holder));
  // hits during the window: rival guild hits a G-GK player, same guild never
  host.position.set(cx, 0, cz);
  C.position.set(cx - 2, 0, cz);
  const hit = { targetId: 3, amount: 800, crit: false, type: 'true', skillId: undefined, statuses: [], knockback: 0, dir: [0, 1] };
  rt.hostHit(null, B, C, hit);
  ok('rt.hit across guilds in the arena is forwarded once to the victim peer', sent.length === 1 && sent[0].m.k === 'hit' && sent[0].m.amount === 800 && sent[0].m.from === 2 && sent[0].peer === 'pC', `${sent.length}`);
  sent.length = 0;
  rt.hostHit(null, host, C, { ...hit, targetId: 3 });
  ok('rt.same guild hit: refused', sent.length === 0);
  // victim: host takes 40 % of a rival hit (the attacker stands 2 m away)
  const hp0 = host.hp;
  B.position.set(cx + 2, 0, cz + 2);
  rt.victimReceive({ k: 'hit', to: 'self', amount: 1000, type: 'true', crit: false, dir: [0, 1], aLvl: 40, aIlvl: 0, seq: 1, from: 2, statuses: [] });
  ok('rt.victim takes 40 % of a rival guild hit', hp0 - host.hp === 400, `lost ${hp0 - host.hp}`);
  const hp1 = host.hp;
  // same guild attacker: nothing
  rt.victimReceive({ k: 'hit', to: 'self', amount: 1000, type: 'true', crit: false, dir: [0, 1], aLvl: 40, aIlvl: 0, seq: 2, from: 3, statuses: [] });
  ok('rt.victim refuses a same-guild attacker', hp1 === host.hp, `lost ${hp1 - host.hp}`);
  // window end: the holder wins, broadcast and saved
  clock = SAT + DUR;
  rt.update(1);
  const end = bc.filter((b) => b.ch === 'pvp' && b.m.k === 'sgend').pop();
  ok('rt.window closes: sgend broadcast with the holder and nation', end && end.m.h && end.m.h.gid === 'G-KK' && end.m.n === KK && end.m.w === SIEGE_WEEK_OF(SAT), JSON.stringify(end?.m));
  ok('rt.the winner is saved on the local character', G.character.save.siege && G.character.save.siege.holder && G.character.save.siege.holder.gid === 'G-KK' && G.character.save.siege.holder.week === SIEGE_WEEK_OF(SAT));
  ok('rt.no Zafer for the other nation', G.character.save.siege.zaferUntil === undefined);
  ok('rt.the banner is reset after the end', rt.field.holder === null && rt.field.prog === 0);
  ok('rt.closed window: refused hits', (() => { sent.length = 0; rt.hostHit(null, B, C, hit); return sent.length === 0; })());
  rt.dispose();
  ok('rt.dispose removes the hit hook', SG.siegeRuntime() === null);

  // client mirror: a peer of the host, not the host itself
  G.net = { ...net, isAuthority: false, hostId: 'host', on: net.on };
  G.character.nation = KK;
  G.character.save.siege = undefined;
  clock = SAT + 2 * DUR;
  const cl = SG.startSiege({ world, scene: H.scene, now: () => clock });
  handlers.get('pvp')({ k: 'sg', h: { gid: 'G-GK', name: 'Kartal Lonca', nation: GK }, c: '', p: 0 }, 'stranger');
  ok('rt.client ignores banners from a non-host peer', cl.field.holder === null);
  handlers.get('pvp')({ k: 'sg', h: { gid: 'G-GK', name: 'Kartal Lonca', nation: GK }, c: 'G-KK', p: 12.5 }, 'host');
  ok('rt.client mirrors the host banner (holder and progress)', cl.field.holder && cl.field.holder.gid === 'G-GK' && near(cl.field.prog, 12.5) && cl.field.cap.gid === 'G-KK');
  handlers.get('pvp')({ k: 'sgend', w: 2999, h: { gid: 'G-GK', name: 'Kartal Lonca', nation: GK }, n: GK }, 'host');
  ok('rt.client: the winning nation (not ours: Kızıl Kurt) gets no Zafer', G.character.save.siege.holder.gid === 'G-GK' && G.character.save.siege.zaferUntil === undefined);
  G.character.nation = GK;
  handlers.get('pvp')({ k: 'sgend', w: 3000, h: { gid: 'G-GK', name: 'Kartal Lonca', nation: GK }, n: GK }, 'host');
  ok('rt.client of the winning nation: 1 hour Zafer (+5 % XP)', near(G.character.save.siege.zaferUntil - clock, 3600e3) && siegeXpMult(G.character.save.siege.zaferUntil, clock) === 1.05);
  handlers.get('pvp')({ k: 'sgend', w: 3001, h: { gid: 'x'.repeat(200), name: 'Y', nation: 'nope' }, n: null }, 'host');
  ok('rt.client: a junk holder record is cleaned (no nation, short gid rejected)', G.character.save.siege.holder === null, JSON.stringify(G.character.save.siege.holder));
  handlers.get('pvp')({ k: 'sgend', w: 'x', h: null, n: null }, 'host');
  ok('rt.client: a junk sgend is ignored', G.character.save.siege.holder === null);
  cl.dispose();
  G.net = null;
  G.presence = undefined;
  G.guild = undefined;
  clearWorld();
}

function SIEGE_WEEK_OF(ms) { return siegeWeekOf(ms); }

console.warn = origWarn;
console.log(`\nSIEGE sim: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
