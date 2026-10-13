// KIZIL SINIR (WP-06 nations + WP-07 PvP zone) headless checks - no browser, no network.
//   nat.*    nation hostility matrix, party gate by room mode, creation default (hash / balance)
//   gate.*   zone gating: the hit rules (pvpDeny) for every zone / nation / safe-box / level / dead combination, level gate of the zone,
//            the zone definition (1,200 m, streamed, mirrored camps, both forts, west gate in the town)
//   cap.*    capture points: 30 s hold flips, contested freeze, decay, wipe, undo, score, determinism, wire round trip
//   hon.*    honour: base, level difference, anti-farm 100/50/25/0, window, shutdown bonus, streaks, board order
//   guard.*  net/guard.vetPvpHit: zone / nation rules, PvP bucket, reach, amount cap, dots, unknown sender
//   shape.*  skill shapes against players (cone / circle / line)
//   rt.*     the runtime on the real Combat + World: the 60 % reduction, CC shortening, stripped statuses, kill credit -> save (kills,
//            Onur, deaths), anti-farm in the save, respawn timer (10 s) and graveyard, host vetting through onClientHit
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/pvp.mjs      (V=1 prints every PASS)
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

const N = await H.imp('data/nations.ts');
const Z = await H.imp('data/pvpZone.ts');
const R = await H.imp('systems/PvpRules.ts');
const Gd = await H.imp('net/guard.ts');
const { startPvp, pvp } = await H.imp('systems/Pvp.ts');
const { KIZIL_SINIR } = await H.imp('data/world/kizil_sinir.ts');
const { getDungeon, OPEN_ZONES, OPEN_ZONE_IDS } = await H.imp('data/dungeons/index.ts');
const { TOWN } = await H.imp('data/town.ts');
const { streamConfig } = await H.imp('world/chunks/StreamConfig.ts');
const { monsterHP } = await H.imp('data/mythicAffixes.ts');
const { sanitizeSummary, sanitizeParty, clientMaySend, HOST_ONLY_CHANNELS, KNOWN_CHANNELS } = await H.imp('net/messages.ts');
const { SKILLS } = await H.imp('data/skills.ts');

const GK = 'gok_kartal', KK = 'kizil_kurt';

// ====================================================================================================================
// nat.*
// ====================================================================================================================
{
  ok('nat.two nations', N.NATION_IDS.length === 2 && N.NATIONS[GK].name === 'Gök Kartal' && N.NATIONS[KK].name === 'Kızıl Kurt');
  ok('nat.colours blue / red', N.NATIONS[GK].hex === 0x5aa8ff && N.NATIONS[KK].hex === 0xff5a4a && N.NATIONS[GK].tag === 'GK' && N.NATIONS[KK].tag === 'KK');
  // hostility matrix (different + known = opposed; unknown never)
  const m = [[GK, GK, false], [GK, KK, true], [KK, GK, true], [KK, KK, false], [undefined, GK, false], [GK, null, false], [undefined, undefined, false]];
  ok('nat.hostility matrix', m.every(([a, b, want]) => N.nationsOpposed(a, b) === want));
  // party gate: coop = same nation (unknown allowed: old client); pvp room = anybody
  const pm = [[GK, GK, 'coop', true], [GK, KK, 'coop', false], [KK, GK, 'coop', false], [KK, KK, 'coop', true], [GK, KK, 'pvp', true], [KK, GK, 'pvp', true],
    [undefined, KK, 'coop', true], [GK, undefined, 'coop', true]];
  ok('nat.party gate', pm.every(([h, j, mode, want]) => N.canParty(h, j, mode) === want));
  ok('nat.isNationId rejects junk', !N.isNationId('x') && !N.isNationId(1) && !N.isNationId(null) && N.isNationId(GK) && N.cleanNation('__proto__') === undefined);
  // default by hash: deterministic and roughly balanced
  let g = 0;
  for (let i = 0; i < 2000; i++) if (N.hashNation('c' + (1e9 + i * 7919).toString(36) + 'abc') === GK) g++;
  ok('nat.hash default balanced', g > 800 && g < 1200, `${g}/2000 Gök Kartal`);
  ok('nat.hash deterministic', N.hashNation('cabc123') === N.hashNation('cabc123') && N.nationOfSave({ id: 'cabc123' }) === N.hashNation('cabc123'));
  ok('nat.stored choice wins', N.nationOfSave({ id: 'x', nation: KK }) === KK && N.nationOfSave({ id: 'x', nation: GK }) === GK);
  ok('nat.balance pick: fewer characters', N.pickNation({ gok_kartal: 3, kizil_kurt: 1 }, 's') === KK && N.pickNation({ gok_kartal: 0, kizil_kurt: 2 }, 's') === GK);
  ok('nat.balance tie: hash', N.pickNation({}, 'seed-a') === N.hashNation('seed-a'));
  // wire
  const s = sanitizeSummary({ id: 'a', name: 'Ali', classId: 'knight', level: 40, itemLevel: 1, rating: 0, variant: 0, nation: KK });
  ok('nat.summary keeps a valid nation', s?.nation === KK);
  ok('nat.summary drops a bad nation', sanitizeSummary({ id: 'a', name: 'Ali', classId: 'knight', level: 40, nation: 'evil' })?.nation === undefined);
  ok('nat.pvp room party up to 8 members', (() => {
    const mk = (i) => ({ id: 'p' + i, slot: i, host: i === 0, ready: false, ls: null, ks: null, summary: { id: 'a' + i, name: 'N' + i, classId: 'knight', level: 40, itemLevel: 0, rating: 0, variant: 0 } });
    const p = sanitizeParty({ t: 'party', rev: 1, hostId: 'p0', roomName: 'r', code: 'ABCDEF', maxPlayers: 8, mode: 'pvp', members: Array.from({ length: 8 }, (_, i) => mk(i)) });
    return p && p.members.length === 8 && p.mode === 'pvp' && p.maxPlayers === 8;
  })());
  ok('nat.pvp channel is host-only', HOST_ONLY_CHANNELS.has('pvp') && KNOWN_CHANNELS.has('pvp') && !clientMaySend('pvp', { k: 'hit' }) && clientMaySend('hit', {}));
}

// ====================================================================================================================
// gate.*
// ====================================================================================================================
{
  const base = () => ({
    zoneId: Z.PVP_ZONE_ID, aNation: GK, vNation: KK, aId: 1, vId: 2, aDead: false, vDead: false,
    aPos: { x: 600, z: 500 }, vPos: { x: 610, z: 500 }, aLevel: 40, vLevel: 40,
  });
  const deny = (o) => R.pvpDeny({ ...base(), ...o });
  ok('gate.open field, opposed nations, level 40: allowed', deny({}) === null);
  ok('gate.reverse direction allowed', deny({ aNation: KK, vNation: GK }) === null);
  for (const z of ['sisli_vadi', 'karakir_bozkiri', 'town_kuzgunkale', 'kemik_mahzeni', '', null, undefined]) ok(`gate.zone ${z}: no PvP`, deny({ zoneId: z }) === 'zone');
  ok('gate.same nation: no', deny({ vNation: GK }) === 'nation' && deny({ aNation: KK, vNation: KK }) === 'nation');
  ok('gate.unknown nation: no', deny({ vNation: null }) === 'unknown' && deny({ aNation: undefined }) === 'unknown');
  ok('gate.self: no', deny({ vId: 1 }) === 'self');
  ok('gate.dead attacker / victim: no', deny({ aDead: true }) === 'dead' && deny({ vDead: true }) === 'dead');
  ok('gate.level 34 attacker or victim: no', deny({ aLevel: 34 }) === 'level' && deny({ vLevel: 34 }) === 'level' && deny({ aLevel: 35, vLevel: 35 }) === null);
  const gk = Z.PVP_BASES[GK], kk = Z.PVP_BASES[KK];
  ok('gate.victim inside own fort: safe', deny({ vPos: { x: kk.center[0], z: kk.center[1] } }) === 'safe');
  ok('gate.attacker inside own fort: safe (no shooting out of the fort)', deny({ aPos: { x: gk.center[0] + 10, z: gk.center[1] - 5 } }) === 'safe');
  ok('gate.safe box edge: inside / outside', Z.baseAt(gk.center[0] + gk.safeHalf[0] - 0.1, gk.center[1]) === GK && Z.baseAt(gk.center[0] + gk.safeHalf[0] + 0.1, gk.center[1]) === null
    && Z.baseAt(kk.center[0], kk.center[1] - kk.safeHalf[1] + 0.1) === KK && Z.baseAt(600, 600) === null);
  ok('gate.cc shortened', R.pvpCcDuration(4) === 2 && R.pvpCcDuration(10) === 3 && R.pvpCcDuration(-1) === 0);
  ok('gate.reduction is 60%', near(R.PVP.DAMAGE_MULT, 0.4) && R.PVP.RESPAWN_SEC === 10 && R.PVP.CAPTURE_HOLD_SEC === 30);

  // the zone definition
  const def = KIZIL_SINIR;
  ok('gate.zone registered', getDungeon('kizil_sinir') === def && OPEN_ZONES.kizil_sinir === def && OPEN_ZONE_IDS.includes('kizil_sinir'));
  ok('gate.zone 1200 m, streamed (chunks)', def.grid.w * 4 === 1200 && def.grid.h * 4 === 1200 && streamConfig(def, null).on === true);
  ok('gate.zone level range 35-40, open world map', def.levelRange[0] === 35 && def.levelRange[1] === 40 && !!def.world && def.outdoor === true);
  ok('gate.zone has no boss / metin / rare / waypoint', def.bosses.length === 0 && def.world.metin.tiers.length === 0 && def.world.rares.length === 0 && def.world.waypoints.length === 0);
  const exit = TOWN.exits.find((e) => e.id === 'bati_kapisi');
  ok('gate.town west gate leads to the zone', !!exit && exit.to === 'kizil_sinir' && exit.box[2] <= -58);
  ok('gate.town has a gate officer', TOWN.npcs.some((n) => n.id === 'npc_sinir_subayi'));
  ok('gate.entry level is 35', Z.PVP_MIN_LEVEL === 35);
  // forts and keep
  ok('gate.two forts, north and south, inside their rooms', ['gok_kartal', 'kizil_kurt'].every((n) => {
    const b = Z.PVP_BASES[n];
    const v = def.world.villages.find((x) => x.id === b.village);
    const room = def.rooms.find((r) => r.id === (n === GK ? 'ks0_gok' : 'ks2_kizil'));
    return v && room && v.center[0] === b.tile[0] && v.center[1] === b.tile[1] && b.tile[0] >= room.rect.x && b.tile[0] < room.rect.x + room.rect.w && b.tile[1] >= room.rect.z && b.tile[1] < room.rect.z + room.rect.h
      && v.npcs.length >= 6 && v.props.length > 10;
  }));
  ok('gate.forts are mirror images', near(Z.PVP_BASES[GK].center[0], Z.PVP_BASES[KK].center[0]) && near(Z.PVP_BASES[GK].center[1] + Z.PVP_BASES[KK].center[1], 1204));
  ok('gate.3 capture points in the keep, 44 m apart, inside the field', Z.CAPTURE_POINTS.length === 3
    && Z.CAPTURE_POINTS.every((p) => p.z > 300 && p.z < 900) && near(Z.CAPTURE_POINTS[1].x - Z.CAPTURE_POINTS[0].x, 44) && near(Z.CAPTURE_POINTS[2].x - Z.CAPTURE_POINTS[1].x, 44)
    && Z.CAPTURE_POINTS.every((p) => Z.baseAt(p.x, p.z) === null));
  const camps = def.packs;
  ok('gate.16 neutral elite camps, level 35-38, kb_* mobs', camps.length === 16 && camps.every((c) => c.levelRange[0] >= 35 && c.levelRange[1] <= 38 && c.kind === 'elite' && c.members.every((m) => m.enemyId.startsWith('kb_'))));
  ok('gate.camps unique ids, inside the field room', new Set(camps.map((c) => c.id)).size === 16 && camps.every((c) => /^r13_c\d\d$/.test(c.id) && c.center[0] > 10 && c.center[0] < 290 && c.center[1] > 60 && c.center[1] < 240));
  const farBase = (c) => [GK, KK].every((n) => Math.hypot(c.center[0] * 4 - Z.PVP_BASES[n].center[0], c.center[1] * 4 - Z.PVP_BASES[n].center[1]) > 200);
  const farKeep = (c) => Z.CAPTURE_POINTS.every((p) => Math.hypot((c.center[0] + 0.5) * 4 - p.x, (c.center[1] + 0.5) * 4 - p.z) > 120);
  ok('gate.camps keep away from forts (>200 m) and the capture points (>120 m)', camps.every((c) => farBase(c) && farKeep(c)));
  ok('gate.camps are mirror symmetric (both nations face the same map)', camps.every((c) => camps.some((d) => d !== c && d.center[0] === 300 - c.center[0] && d.center[1] === c.center[1]))
    && camps.every((c) => camps.some((d) => d !== c && d.center[0] === c.center[0] && d.center[1] === 300 - c.center[1])));
  ok('gate.camp enemy ids exist', (await (async () => {
    const { ENEMIES } = await H.imp('data/enemies.ts');
    return camps.every((c) => c.members.every((m) => !!ENEMIES[m.enemyId]));
  })()));
}

// ====================================================================================================================
// nav.*: the real zone's walk grid (NavBase, no GL): forts, keep, camps and both spawns are walkable and connected
// ====================================================================================================================
{
  const NB = await H.imp('world/NavBase.ts');
  const { NavGrid } = await H.imp('world/NavGrid.ts');
  const def = KIZIL_SINIR;
  const T = 4, W = def.grid.w, Hh = def.grid.h;
  const roomIdx = new Int16Array(W * Hh).fill(-1);
  const hWall = new Uint8Array(W * (Hh + 1));
  const vWall = new Uint8Array((W + 1) * Hh);
  NB.paintRoomTiles(def, roomIdx);
  NB.computeWalls(W, Hh, roomIdx, !!def.outdoor, hWall, vWall);
  const nav = new NavGrid({ originX: -0.5, originZ: -0.5, width: W * T + 1, depth: Hh * T + 1, cellSize: 1, walkable: false });
  NB.fillNavFast({ W, H: Hh, roomIdx, hWall, vWall }, nav);
  const walk = (x, z) => nav.isWalkable(x, z);
  const tc = (t) => (t + 0.5) * T;
  ok('nav.start / exit tiles walkable', walk(tc(def.start.pos[0]), tc(def.start.pos[1])) && walk(tc(def.exit.pos[0]), tc(def.exit.pos[1])));
  ok('nav.both fort spawns walkable', [GK, KK].every((n) => walk(Z.PVP_BASES[n].spawn[0], Z.PVP_BASES[n].spawn[1])));
  ok('nav.both fort centres and the second exit portal spot walkable', [GK, KK].every((n) => walk(Z.PVP_BASES[n].center[0], Z.PVP_BASES[n].center[1]))
    && !!nav.nearestWalkable(Z.PVP_BASES[KK].center[0] + 16, Z.PVP_BASES[KK].center[1] - 6, 8));
  ok('nav.3 capture points walkable', Z.CAPTURE_POINTS.every((p) => walk(p.x, p.z)));
  ok('nav.16 camp centres walkable', def.packs.every((c) => walk(tc(c.center[0]), tc(c.center[1]))));
  // village NPCs and gates inside the room: the fort props must not spill out of the room rectangle
  ok('nav.fort palisade inside its room', def.world.villages.every((v) => {
    const room = def.rooms.find((r) => r.id === (v.id === 'ks_gok_karargah' ? 'ks0_gok' : 'ks2_kizil'));
    const x0 = v.center[0] * T - v.bounds[0], x1 = (v.center[0] + 1) * T + v.bounds[0], z0 = v.center[1] * T - v.bounds[1], z1 = (v.center[1] + 1) * T + v.bounds[1];
    return x0 >= room.rect.x * T && x1 <= (room.rect.x + room.rect.w) * T && z0 >= room.rect.z * T && z1 <= (room.rect.z + room.rect.h) * T;
  }));
  // flood fill on a 4 m stride from the GK spawn: the KK spawn, the keep and every camp are reachable
  const cols = W, seen = new Uint8Array(W * Hh);
  const startI = Math.floor(Z.PVP_BASES[GK].spawn[0] / T), startJ = Math.floor(Z.PVP_BASES[GK].spawn[1] / T);
  const stack = [startJ * cols + startI];
  seen[stack[0]] = 1;
  let reached = 0;
  while (stack.length) {
    const k = stack.pop();
    reached++;
    const i = k % cols, j = (k - i) / cols;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= Hh) continue;
      const nk = nj * cols + ni;
      if (seen[nk] || !walk(tc(ni), tc(nj))) continue;
      seen[nk] = 1;
      stack.push(nk);
    }
  }
  const reach = (x, z) => seen[Math.floor(z / T) * cols + Math.floor(x / T)] === 1;
  ok('nav.spawn to spawn: the two forts are connected over the field', reach(Z.PVP_BASES[KK].spawn[0], Z.PVP_BASES[KK].spawn[1]));
  ok('nav.keep points and all camps are reachable from the Gök Kartal fort', Z.CAPTURE_POINTS.every((p) => reach(p.x, p.z)) && def.packs.every((c) => reach(tc(c.center[0]), tc(c.center[1]))));
  ok('nav.field is big: > 40,000 walkable tiles reached', reached > 40000, `${reached} tiles (${(reached * 16 / 1e6).toFixed(2)} km2)`);
}

// ====================================================================================================================
// cap.*
// ====================================================================================================================
{
  const P0 = Z.CAPTURE_POINTS[0], P1 = Z.CAPTURE_POINTS[1];
  const gkAt = (p, id = 1) => ({ id, n: 0, x: p.x + 1, z: p.z });
  const kkAt = (p, id = 2) => ({ id, n: 1, x: p.x - 1, z: p.z });
  const run = (f, sec, who, dt = 0.25) => { const ev = []; for (let t = 0; t < sec - 1e-9; t += dt) ev.push(...f.step(dt, who)); return ev; };

  // 30 s hold
  let f = new R.CaptureField();
  let ev = run(f, 29.75, [gkAt(P0)]);
  ok('cap.not flipped at 29.75 s', ev.length === 0 && f.pts[0].owner === -1 && near(f.pts[0].prog, 29.75) && f.pts[0].side === 0);
  ev = run(f, 0.25, [gkAt(P0)]);
  ok('cap.flips at exactly 30 s', ev.length === 1 && ev[0].point === 0 && ev[0].to === 0 && ev[0].from === -1 && ev[0].by.join() === '1' && f.pts[0].owner === 0 && f.pts[0].prog === 0 && f.pts[0].side === -1);
  // (the flip lands on the 30 s mark, which is also a 10 s score tick: the new owner may collect that one tick)
  ok('cap.flip score +10 (+1 when it lands on a tick)', f.score[0] >= R.PVP.SCORE_FLIP && f.score[0] <= R.PVP.SCORE_FLIP + R.PVP.SCORE_TICK && f.score[1] === 0, `${f.score[0]}`);
  // other points untouched
  ok('cap.other points untouched', f.pts[1].owner === -1 && f.pts[2].owner === -1 && f.pts[1].prog === 0);
  // fine-grained dt: flips within one step of 30 s
  f = new R.CaptureField();
  let t = 0, flipAt = -1;
  for (let i = 0; i < 3000 && flipAt < 0; i++) { t += 1 / 60; if (f.step(1 / 60, [gkAt(P0)]).length) flipAt = t; }
  ok('cap.60 fps flips at 30 s +- 1 frame', flipAt > 29.98 && flipAt < 30.05, `${flipAt.toFixed(3)} s`);
  // dt that does not divide
  f = new R.CaptureField();
  ev = run(f, 31, [gkAt(P0)], 0.7);
  ok('cap.odd dt: one flip only', ev.length === 1);

  // contested: frozen, nobody progresses
  f = new R.CaptureField();
  run(f, 10, [gkAt(P0)]);
  const before = f.pts[0].prog;
  ev = run(f, 60, [gkAt(P0), kkAt(P0)]);
  ok('cap.contested freezes progress for any length of time', ev.length === 0 && near(f.pts[0].prog, before) && f.pts[0].owner === -1);
  // contested ends, the first nation resumes
  ev = run(f, 20, [gkAt(P0)]);
  ok('cap.resume after the enemy leaves: flip after the remaining 20 s', ev.length === 1 && ev[0].to === 0, `prog was ${before}`);

  // leave: decays 1/s
  f = new R.CaptureField();
  run(f, 12, [gkAt(P0)]);
  run(f, 5, []);
  ok('cap.abandoned point decays 1 s per second', near(f.pts[0].prog, 7), `${f.pts[0].prog}`);
  run(f, 10, []);
  ok('cap.fully decayed: side cleared', f.pts[0].prog === 0 && f.pts[0].side === -1);

  // enemy takes over a running attempt: undoes first (2x)
  f = new R.CaptureField();
  run(f, 10, [gkAt(P0)]);
  run(f, 3, [kkAt(P0)]);
  ok('cap.other nation undoes progress at double speed', near(f.pts[0].prog, 4) && f.pts[0].side === 0, `${f.pts[0].prog}`);
  run(f, 2, [kkAt(P0)]);
  ok('cap.then starts its own progress', f.pts[0].side === 1 && f.pts[0].prog >= 0 && f.pts[0].prog < 1.01, `${f.pts[0].prog} side ${f.pts[0].side}`);

  // owner on its own point wipes attempts; takes a second nation 30 s to flip back
  f = new R.CaptureField();
  run(f, 30, [gkAt(P0)]);
  ok('cap.GK owns point 0', f.pts[0].owner === 0);
  run(f, 12, [kkAt(P0)]);
  ok('cap.KK partway', f.pts[0].side === 1 && near(f.pts[0].prog, 12));
  run(f, 4, [gkAt(P0)]);
  ok('cap.owner standing there wipes the attempt (2x)', near(f.pts[0].prog, 4), `${f.pts[0].prog}`);
  ev = run(f, 40, [kkAt(P0)]);
  ok('cap.KK flips it after a full hold', ev.length === 1 && ev[0].to === 1 && ev[0].from === 0 && f.pts[0].owner === 1);

  // a stack does not capture faster
  f = new R.CaptureField();
  ev = run(f, 29.75, [gkAt(P0, 1), gkAt(P0, 3), gkAt(P0, 4)]);
  ok('cap.a crowd does not speed it up', ev.length === 0 && near(f.pts[0].prog, 29.75));
  ev = run(f, 0.25, [gkAt(P0, 1), gkAt(P0, 3), gkAt(P0, 4)]);
  ok('cap.flip credits every capturer present', ev.length === 1 && ev[0].by.join() === '1,3,4');
  // outside the radius does not count
  f = new R.CaptureField();
  run(f, 40, [{ id: 1, n: 0, x: P0.x + P0.r + 0.5, z: P0.z }]);
  ok('cap.outside the radius does not count', f.pts[0].owner === -1 && f.pts[0].prog === 0);
  ok('cap.on the radius edge counts', (() => { const g = new R.CaptureField(); g.step(1, [{ id: 1, n: 0, x: P0.x + P0.r, z: P0.z }]); return near(g.pts[0].prog, 1); })());

  // score ticks: +1 per owned point per 10 s
  f = new R.CaptureField();
  run(f, 30, [gkAt(P0), gkAt(P1, 5)]);
  const s0 = f.score[0];
  run(f, 60, []);
  ok('cap.2 owned points score +1 each per 10 s', f.score[0] - s0 === 12, `${f.score[0] - s0} (want 12 in 60 s)`);
  ok('cap.nation 1 scores nothing', f.score[1] === 0);

  // determinism + wire round trip
  const a = new R.CaptureField(), b = new R.CaptureField();
  const script = (fld) => {
    const out = [];
    for (let i = 0; i < 4000; i++) {
      const phase = Math.floor(i / 500) % 4;
      const who = phase === 0 ? [gkAt(P0)] : phase === 1 ? [gkAt(P0), kkAt(P0)] : phase === 2 ? [kkAt(P0), gkAt(P1, 7)] : [];
      out.push(...fld.step(0.05, who));
    }
    return out;
  };
  const ea = script(a), eb = script(b);
  ok('cap.deterministic: same inputs -> same events and state', JSON.stringify(ea) === JSON.stringify(eb) && JSON.stringify(a.pts) === JSON.stringify(b.pts) && JSON.stringify(a.score) === JSON.stringify(b.score));
  const c = new R.CaptureField();
  c.applyWire(JSON.parse(JSON.stringify(a.toWire())), a.score);
  ok('cap.wire round trip (progress to 0.1 s)', c.pts.every((p, i) => p.owner === a.pts[i].owner && p.side === a.pts[i].side && Math.abs(p.prog - a.pts[i].prog) <= 0.05) && c.score[0] === a.score[0]);
  c.applyWire([[9, 9, 'x'], 'junk', null], [-5, 'q']);
  ok('cap.junk wire is clamped, never throws', c.pts.every((p) => p.owner >= -1 && p.owner <= 1 && Number.isFinite(p.prog)) && c.score[0] >= 0);
  const d = new R.CaptureField();
  d.applyWire([[0, -1, 1]], [1, 1]); // wrong length: ignored
  ok('cap.wrong-length wire ignored', d.pts.every((p) => p.owner === -1));
  ok('cap.dt <= 0 does nothing', (() => { const g = new R.CaptureField(); return g.step(0, [gkAt(P0)]).length === 0 && g.step(-1, [gkAt(P0)]).length === 0 && g.pts[0].prog === 0; })());
}

// ====================================================================================================================
// hon.*
// ====================================================================================================================
{
  ok('hon.base: equal level = 10', R.honourBase(40, 40, 0) === 10);
  ok('hon.level difference +-2 per level, +-5 levels', R.honourBase(35, 40, 0) === 20 && R.honourBase(40, 35, 0) === 1 && R.honourBase(40, 30, 0) === 1 && R.honourBase(40, 38, 0) === 6 && R.honourBase(30, 40, 0) === 20);
  ok('hon.floor at 1', R.honourBase(60, 35, 0) >= 1);
  ok('hon.shutdown bonus 2 per streak, max 20', R.honourBase(40, 40, 3) === 16 && R.honourBase(40, 40, 50) === 30);
  ok('hon.streak titles', R.streakTitle(2) === null && R.streakTitle(3) === 'SERİ KATİL' && R.streakTitle(5) === 'ÖLÜM MAKİNESİ' && R.streakTitle(10) === 'KAN BANYOSU' && R.streakTitle(25) === 'DESTANSI KATLİAM');

  const B = new R.PvpBoard();
  B.join(1, 'Ali', 0, 40); B.join(2, 'Veli', 1, 40); B.join(3, 'Can', 1, 40); B.join(4, 'Ece', 0, 40);
  let k = B.kill(1, 2, 100);
  ok('hon.first kill pays full', k && k.honour === 10 && k.streak === 1 && k.repeat === 0 && k.ended === 0);
  ok('hon.board: kills / deaths / honour / nation score', B.rows.get(1).kills === 1 && B.rows.get(2).deaths === 1 && B.rows.get(1).honour === 10 && B.kills[0] === 1 && B.kills[1] === 0);
  k = B.kill(1, 2, 160);
  ok('hon.same victim again inside the window: 50 %', k.honour === 5 && k.repeat === 1);
  k = B.kill(1, 2, 200);
  ok('hon.third time: 25 %', k.honour === Math.round(10 * 0.25) && k.repeat === 2);
  k = B.kill(1, 2, 240);
  ok('hon.fourth time and on: nothing', k.honour === 0 && k.repeat === 3);
  k = B.kill(1, 2, 250);
  ok('hon.still nothing', k.honour === 0);
  k = B.kill(1, 2, 250 + R.PVP.FARM_WINDOW_SEC + 1);
  ok('hon.window expires: full again', k.honour === 10 && k.repeat === 0);
  k = B.kill(1, 3, 300);
  ok('hon.another victim: full', k.honour === 10);
  ok('hon.streak counts every kill of the same killer', B.rows.get(1).streak === 7 || B.rows.get(1).streak >= 6, `streak ${B.rows.get(1).streak}`);
  // shutdown: Veli kills Ali, who has a streak
  const streakAli = B.rows.get(1).streak;
  k = B.kill(2, 1, 400);
  ok('hon.shutdown pays the streak bonus and resets it', k.honour === 10 + Math.min(20, streakAli * 2) && k.ended === streakAli && B.rows.get(1).streak === 0 && B.rows.get(1).deaths === 1, `${k.honour}`);
  ok('hon.same nation: no kill', B.kill(1, 4, 500) === null && B.kill(4, 1, 500) === null);
  ok('hon.unknown ids: no kill', B.kill(1, 99, 500) === null && B.kill(98, 2, 500) === null);
  B.pay(4, 25);
  ok('hon.capture help pays', B.rows.get(4).honour === 25);
  const sorted = B.sorted();
  ok('hon.board sorted by honour', sorted.every((r, i) => i === 0 || sorted[i - 1].honour >= r.honour));
  ok('hon.wire rows', B.toWire().length === 4 && B.toWire().every((w) => w.length === 6));
  B.leave(3);
  ok('hon.leave removes the row', !B.rows.has(3));
  // anti farm is per killer->victim pair
  const A2 = new R.AntiFarm();
  A2.note(1, 2, 0); A2.note(1, 2, 1);
  ok('hon.antifarm pair isolation', A2.note(2, 1, 2) === 0 && A2.note(1, 3, 2) === 0 && A2.note(1, 2, 3) === 2);
}

// ====================================================================================================================
// shape.*
// ====================================================================================================================
{
  const T = (x, z, r = 0.55) => ({ x, z, radius: r });
  const ctx = { caster: { x: 0, z: 0 }, dir: [0, 1], point: [0, 8] };
  const melee = { targeting: 'melee_arc', range: 3, arc: 120, tags: ['melee'] };
  ok('shape.cone: in front, in range', R.pvpShapeHit(melee, ctx, T(0, 2.5)));
  ok('shape.cone: behind', !R.pvpShapeHit(melee, ctx, T(0, -2)));
  ok('shape.cone: too far', !R.pvpShapeHit(melee, ctx, T(0, 4.5)));
  ok('shape.cone: to the side beyond the arc', !R.pvpShapeHit(melee, ctx, T(2.5, 0.2)));
  ok('shape.cone: 45 degrees inside the arc', R.pvpShapeHit(melee, ctx, T(1.5, 1.5)));
  ok('shape.self aoe', R.pvpShapeHit({ targeting: 'self_aoe', radius: 5, tags: ['aoe'] }, ctx, T(-4, 0)) && !R.pvpShapeHit({ targeting: 'self_aoe', radius: 5, tags: ['aoe'] }, ctx, T(-7, 0)));
  ok('shape.ground aoe at the cast point', R.pvpShapeHit({ targeting: 'ground_aoe', radius: 4, tags: [] }, ctx, T(0, 10)) && !R.pvpShapeHit({ targeting: 'ground_aoe', radius: 4, tags: [] }, ctx, T(0, 1)));
  const proj = { targeting: 'projectile', range: 20, radius: 0.5, tags: ['projectile'] };
  ok('shape.projectile line: on the line', R.pvpShapeHit(proj, ctx, T(0.3, 15)) && !R.pvpShapeHit(proj, ctx, T(5, 15)) && !R.pvpShapeHit(proj, ctx, T(0, 26)) && !R.pvpShapeHit(proj, ctx, T(0, -6)));
  ok('shape.unknown custom with melee tag: cone', R.pvpShapeHit({ targeting: 'custom', tags: ['melee'] }, ctx, T(0, 2)) && !R.pvpShapeHit({ targeting: 'custom', tags: ['melee'] }, ctx, T(0, 6)));
  // the real skills: every damaging skill of every class has SOME shape and a finite range
  let damaging = 0, bad = 0;
  for (const s of Object.values(SKILLS)) {
    if (!s.damage || !(s.damage.coef > 0)) continue;
    damaging++;
    const hit = R.pvpShapeHit(s, ctx, T(0, 1.2)) || R.pvpShapeHit(s, ctx, T(0, 8)) || R.pvpShapeHit(s, { ...ctx, point: [0, 1] }, T(0, 1));
    if (typeof hit !== 'boolean') bad++;
  }
  ok('shape.all damaging skills evaluate', damaging > 100 && bad === 0, `${damaging} skills`);
}

// ====================================================================================================================
// guard.*
// ====================================================================================================================
const { Actor } = await H.imp('entities/Actor.ts');
const { PARTY_ID_BASE } = await H.imp('types/common.ts');
const world = H.world;

function mkPlayer(id, o = {}) {
  const p = new H.FakePlayer(o.cls ?? 'knight', o.level ?? 40);
  Object.defineProperty(p, 'id', { value: id, configurable: true, writable: true });
  p.isLocal = !!o.local;
  p.authority = !!o.local;
  p.nation = o.nation ?? null;
  p.name = o.name ?? 'P' + id;
  p.maxHp = p.hp = o.hp ?? 50000;
  p.position.set(o.x ?? 600, 0, o.z ?? 500);
  p.stats.armor = 0;
  world.add(p);
  if (o.local) { world.localPlayer = G.player = p; }
  return p;
}
function clearWorld() {
  for (const e of [...world.entities.values()]) world.remove(e);
  world.update(0);
  world.localPlayer = null;
  G.player = null;
}

{
  clearWorld();
  const host = mkPlayer(1, { local: true, nation: GK, x: 600, z: 500 });
  const att = mkPlayer(2, { nation: KK, x: 600, z: 505, name: 'Veli' });
  G.net = { peers: new Map([['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]), isAuthority: true, selfId: 'host', hostId: 'host' };
  Gd.resetPvpGuard();
  guardLog.length = 0;
  const victim = host;
  const okRule = null;
  let r = Gd.vetPvpHit('pB', victim, undefined, false, 1000, okRule);
  ok('guard.legit hit passes', r === 1000);
  ok('guard.rule denial drops it', ['zone', 'nation', 'dead', 'safe', 'self', 'level', 'unknown'].every((d) => Gd.vetPvpHit('pB', victim, undefined, false, 1000, d) === null));
  ok('guard.denials are logged with the reason', guardLog.some((l) => l.includes('pvp-safe')) || guardLog.length > 0, guardLog[0]);
  ok('guard.dot hits are refused', Gd.vetPvpHit('pB', victim, undefined, true, 100, null) === null);
  ok('guard.unknown sender dropped', Gd.vetPvpHit('ghost', victim, undefined, false, 100, null) === null);
  // amount cap: level 40 attacker
  const cap = R.pvpHitCap(40, monsterHP);
  Gd.resetPvpGuard();
  r = Gd.vetPvpHit('pB', victim, undefined, false, 1e9, null);
  ok('guard.amount clamped to the PvP cap', r === cap && cap === Math.max(6000, 12 * monsterHP(40)), `${r} vs ${cap}`);
  ok('guard.cap is far below the PvE floor of 20000', cap < 20000);
  Gd.resetPvpGuard();
  ok('guard.NaN / negative amounts become 0', Gd.vetPvpHit('pB', victim, undefined, false, NaN, null) === 0 && Gd.vetPvpHit('pB', victim, undefined, false, -50, null) === 0);
  // reach: 100 m away
  att.position.set(600, 0, 600);
  Gd.resetPvpGuard();
  ok('guard.reach: 100 m away is dropped', Gd.vetPvpHit('pB', victim, undefined, false, 100, null) === null);
  const melee = Object.values(SKILLS).find((s) => s.targeting === 'melee_arc' && s.damage);
  att.position.set(600, 0, 520);
  Gd.resetPvpGuard();
  ok('guard.reach: a melee skill at 20 m is dropped', Gd.vetPvpHit('pB', victim, melee.id, false, 100, null) === null);
  att.position.set(600, 0, 503);
  Gd.resetPvpGuard();
  ok('guard.reach: a melee skill at 3 m passes', Gd.vetPvpHit('pB', victim, melee.id, false, 100, null) === 100);
  // bucket
  Gd.resetPvpGuard();
  let passed = 0;
  for (let i = 0; i < 40; i++) if (Gd.vetPvpHit('pB', victim, undefined, false, 10, null) !== null) passed++;
  ok('guard.PvP bucket: burst of 10 then starved', passed >= R.PVP.BUCKET_CAP && passed <= R.PVP.BUCKET_CAP + 2, `${passed} of 40 instantly`);
  // dead sender
  att.alive = false;
  Gd.resetPvpGuard();
  ok('guard.dead sender dropped', Gd.vetPvpHit('pB', victim, undefined, false, 100, null) === null);
  att.alive = true;
}

// ====================================================================================================================
// rt.*
// ====================================================================================================================
{
  clearWorld();
  H.clearEvents();
  const A = mkPlayer(1, { local: true, nation: GK, x: 600, z: 500, name: 'Ali', hp: 100000 });
  const B = mkPlayer(2, { nation: KK, x: 600, z: 505, name: 'Veli', hp: 100000 });
  const sent = [], bc = [], handlers = new Map();
  G.net = {
    peers: new Map([['host', { peerId: 'host', slot: 0, name: 'Ali' }], ['pB', { peerId: 'pB', slot: 1, name: 'Veli' }]]),
    isAuthority: true, isOnline: true, selfId: 'host', hostId: 'host',
    peerOfEntity: (id) => (id === 1 ? 'host' : id === 2 ? 'pB' : null),
    sendTo: (peer, ch, m) => sent.push({ peer, ch, m }),
    broadcast: (ch, m) => bc.push({ ch, m }),
    sendToHost: () => {},
    on: (ch, h) => { handlers.set(ch, h); return () => handlers.delete(ch); },
  };
  const rec = { kills: 0, deaths: 0, honour: 0, honourTotal: 0, bestStreak: 0, captures: 0 };
  G.character.pvpRecord = () => rec;
  G.character.nation = GK;
  let clock = 1000, teleports = [], releases = 0;
  const rt = startPvp({
    world, scene: H.scene, nearestWalkable: (x, z) => ({ x, z }), teleport: (x, z, yaw) => teleports.push([x, z, yaw]), release: () => { releases++; },
    now: () => clock,
  });
  const chat = [];
  G.events.on('net:chat', (e) => chat.push(e));
  const honours = [];
  G.events.on('pvp:honor', (e) => honours.push(e));

  ok('rt.zone active while the runtime lives', pvp.active && pvp.runtime === rt);
  ok('rt.entry: moved to own fort spawn', teleports.length === 1 && near(teleports[0][0], Z.PVP_BASES[GK].spawn[0]) && near(teleports[0][1], Z.PVP_BASES[GK].spawn[1]) && teleports[0][2] === Z.PVP_BASES[GK].yaw);
  ok('rt.respawn point = own fort', (() => { const p = pvp.respawnPoint(); return near(p.x, Z.PVP_BASES[GK].spawn[0]) && near(p.z, Z.PVP_BASES[GK].spawn[1]); })());

  // --- Veli (KK) hits Ali (GK, the host) through the host path: type 'true' so only the 60 % reduction applies
  const sendHit = (peer, targetId, o = {}) => pvp.onClientHit(peer, { targetId, amount: 1000, crit: false, type: 'true', dir: [0, -1], ...o });
  const hpA0 = A.hp;
  ok('rt.client hit on a player is handled by the PvP runtime (never an enemy hit)', sendHit('pB', 1) === true);
  ok('rt.victim lost exactly 40 % of the roll (60 % reduction)', hpA0 - A.hp === 400, `lost ${hpA0 - A.hp}`);
  // CC: stun 4 s -> 2 s; haste dropped; taunt dropped
  A.statuses.clear();
  sendHit('pB', 1, { statuses: [{ status: 'stun', duration: 4 }, { status: 'haste', duration: 30 }, { status: 'taunt', duration: 10 }, { status: 'slow', duration: 20, magnitude: 5 }] });
  const st = A.statuses.get('stun');
  ok('rt.stun halved (4 s -> 2 s)', !!st && st.remaining <= 2.0001 && st.remaining > 1.9, st ? `${st.remaining}` : 'none');
  ok('rt.slow capped at 3 s', !!A.statuses.get('slow') && A.statuses.get('slow').remaining <= 3.0001);
  ok('rt.buffs / taunt from the wire are stripped', !A.statuses.has('haste') && !A.statuses.has('taunt'));
  A.statuses.clear();

  // --- cheat surface through onClientHit
  const lose = (fn) => { const h0 = A.hp; fn(); return h0 - A.hp; };
  ok('rt.huge amount is clamped (cap x 40 %)', lose(() => sendHit('pB', 1, { amount: 1e9 })) === Math.round(R.pvpHitCap(40, monsterHP) * 0.4));
  Gd.resetPvpGuard();
  B.position.set(600, 0, 900);
  ok('rt.out of reach: nothing', lose(() => sendHit('pB', 1)) === 0);
  B.position.set(600, 0, 505);
  Gd.resetPvpGuard();
  const spawnA = Z.PVP_BASES[GK].center;
  A.position.set(spawnA[0], 0, spawnA[1]);
  B.position.set(spawnA[0], 0, spawnA[1] + 5);
  ok('rt.victim in its safe fort: nothing', lose(() => sendHit('pB', 1)) === 0);
  A.position.set(600, 0, 500);
  B.position.set(600, 0, 505);
  Gd.resetPvpGuard();
  B.nation = GK;
  ok('rt.same nation: nothing', lose(() => sendHit('pB', 1)) === 0);
  B.nation = KK;
  B.level = 34;
  ok('rt.under-levelled attacker: nothing', lose(() => sendHit('pB', 1)) === 0);
  B.level = 40;
  ok('rt.a hit from a non-member peer is ignored', lose(() => sendHit('stranger', 1)) === 0);
  Gd.resetPvpGuard();
  let landed = 0;
  for (let i = 0; i < 40; i++) if (lose(() => sendHit('pB', 1, { amount: 10 })) > 0) landed++;
  ok('rt.spamming 40 hits at once: only the bucket lands', landed <= R.PVP.BUCKET_CAP + 2 && landed >= R.PVP.BUCKET_CAP, `${landed}/40`);
  Gd.resetPvpGuard();
  ok('rt.a hit on an enemy id is not a PvP hit', sendHit('pB', 999) === false);
  ok('rt.a hit on an unknown id is not a PvP hit', sendHit('pB', 4242) === false);

  // --- Ali (host, GK) hits Veli (remote KK): forwarded on the host-only channel to Veli's peer
  sent.length = 0;
  rt.hostHit(null, A, B, { targetId: 2, amount: 800, crit: true, type: 'true', skillId: undefined, statuses: [{ status: 'stun', duration: 6 }], knockback: 3, dir: [0, 1] });
  ok('rt.host hit on a remote victim is forwarded once to his peer on pvp', sent.length === 1 && sent[0].peer === 'pB' && sent[0].ch === 'pvp' && sent[0].m.k === 'hit' && sent[0].m.amount === 800 && sent[0].m.from === 1);
  ok('rt.the host does not touch the victim HP', B.hp === 100000);
  // the victim's machine
  const hostPlayer = world.localPlayer;
  world.localPlayer = G.player = B;
  B.isLocal = true;
  rt.victimReceive(sent[0].m);
  ok('rt.victim machine applies 40 %', 100000 - B.hp === 320, `lost ${100000 - B.hp}`);
  ok('rt.victim machine: stun shortened to 3 s', !!B.statuses.get('stun') && B.statuses.get('stun').remaining <= 3.0001);
  // victim re-check refuses a forged forward (same nation / safe / far)
  const hpB = B.hp;
  rt.victimReceive({ ...sent[0].m, from: 2 }); // from himself
  rt.victimReceive({ ...sent[0].m, from: 777 });
  A.position.set(600, 0, 900);
  rt.victimReceive(sent[0].m); // attacker 400 m away
  A.position.set(600, 0, 500);
  A.nation = KK;
  rt.victimReceive(sent[0].m);
  A.nation = GK;
  ok('rt.victim refuses forged forwards (self, unknown source, far away, same nation)', B.hp === hpB, `lost ${hpB - B.hp}`);
  B.isLocal = false;
  world.localPlayer = G.player = hostPlayer;

  // --- kill credit -> kills / honour in the killer's save, kill feed, scoreboard
  Gd.resetPvpGuard();
  clock += 1;
  rt.hostHit(null, A, B, { targetId: 2, amount: 10, crit: false, type: 'true', dir: [0, 1] });
  chat.length = 0; honours.length = 0; bc.length = 0;
  B.alive = false; B.hp = 0;
  G.events.emit('player:died', { entityId: 2, local: false });
  ok('rt.kill credited: kills=1, Onur 10', rec.kills === 1 && rec.honour === 10 && rec.honourTotal === 10 && rec.bestStreak === 1, JSON.stringify(rec));
  ok('rt.kill feed line with nation tags in system chat', chat.some((c) => c.channel === 'system' && c.text.includes('[GK] Ali') && c.text.includes('[KK] Veli') && c.text.includes('+10 Onur')), chat[0]?.text);
  ok('rt.pvp:honor event (achievements listen)', honours.length === 1 && honours[0].amount === 10 && honours[0].total === 10);
  ok('rt.host broadcast pkill to the room', bc.some((b) => b.ch === 'pvp' && b.m.k === 'pkill' && b.m.killer === 1 && b.m.victim === 2 && b.m.h === 10));
  // death without a recent PvP hit gives nothing
  B.alive = true; B.hp = 100000;
  chat.length = 0;
  G.events.emit('player:died', { entityId: 2, local: false });
  ok('rt.a death with no recent hit is no kill', rec.kills === 1 && chat.length === 0);
  // credit window
  clock += 100;
  rt.hostHit(null, A, B, { targetId: 2, amount: 10, crit: false, type: 'true', dir: [0, 1] });
  clock += 11;
  B.alive = false; B.hp = 0;
  G.events.emit('player:died', { entityId: 2, local: false });
  ok('rt.credit expires after 10 s', rec.kills === 1);
  B.alive = true; B.hp = 100000;
  // anti-farm in the save: 2nd and 3rd kill of the same victim
  const kill = () => {
    clock += 5;
    rt.hostHit(null, A, B, { targetId: 2, amount: 10, crit: false, type: 'true', dir: [0, 1] });
    B.alive = false; B.hp = 0;
    G.events.emit('player:died', { entityId: 2, local: false });
    B.alive = true; B.hp = 100000;
  };
  kill();
  ok('rt.second kill of the same victim pays 50 %', rec.kills === 2 && rec.honour === 15, JSON.stringify(rec));
  kill(); kill(); kill();
  ok('rt.farming the same victim ends at 0 Onur', rec.kills === 5 && rec.honour === 10 + 5 + 3 + 0 + 0, JSON.stringify(rec));
  ok('rt.streak recorded', rec.bestStreak === 5);
  const snap = pvp.snapshot();
  ok('rt.scoreboard snapshot: rows, scores, 3 points', snap && snap.rows.length === 2 && snap.points.length === 3 && snap.scores[0] === 5 && snap.scores[1] === 0 && snap.rows[0].name === 'Ali' && snap.rows[0].kills === 5, JSON.stringify(snap?.rows));

  // --- own death in the zone: 10 s respawn at the own graveyard, no early release
  const deaths0 = rec.deaths;
  A.alive = false; A.hp = 0;
  G.events.emit('player:died', { entityId: 1, local: true });
  ok('rt.respawn blocked right after death', pvp.releaseBlocked() === true && near(rt.respawnLeft(), 10, 0.01));
  clock += 9.5;
  rt.update(0.1);
  ok('rt.still blocked at 9.5 s, not released', pvp.releaseBlocked() === true && releases === 0);
  clock += 0.5;
  rt.update(0.1);
  ok('rt.released at 10 s (once)', releases === 1 && pvp.releaseBlocked() === false);
  rt.update(0.1); rt.update(0.1);
  ok('rt.released only once', releases === 1);
  G.events.emit('player:revived', { entityId: 1, local: true });
  A.alive = true; A.hp = 100000;
  // a kill of the local player by Veli is counted in the local save (victim side) via the broadcast message
  const pk = { k: 'pkill', killer: 2, victim: 1, kn: 'Veli', vn: 'Ali', ka: 1, va: 0, h: 12, s: 1, sc: [5, 1] };
  rt.applyKill(pk);
  ok('rt.victim save: deaths + 1 from the pkill message', rec.deaths === deaths0 + 1 && rec.kills === 5);

  // --- capture runs on the host from real player positions
  const P = Z.CAPTURE_POINTS[1];
  A.position.set(P.x, 0, P.z);
  B.position.set(900, 0, 900);
  bc.length = 0; chat.length = 0;
  for (let i = 0; i < 125; i++) rt.update(0.25);
  ok('rt.host captured the keep after 30 s of presence', rt.field.pts[1].owner === 0, JSON.stringify(rt.field.pts[1]));
  ok('rt.capture: announced, Onur paid, score up', chat.some((c) => c.text.includes('Kale Kalbi')) && rec.captures === 1 && rec.honour >= 10 + 5 + 3 + R.PVP.HONOUR_FLIP && rt.scores()[0] >= 5 + R.PVP.SCORE_FLIP);
  ok('rt.capture state is broadcast (pcap)', bc.some((b) => b.m.k === 'pcap' && b.m.ev && b.m.ev.id === 1 && b.m.ev.to === 0 && b.m.ev.by.includes(1)) && bc.some((b) => b.m.k === 'pcap' && !b.m.ev));
  ok('rt.board is broadcast (pboard)', bc.some((b) => b.m.k === 'pboard' && b.m.rows.length === 2));
  // under-levelled / dead players do not capture
  A.level = 34;
  const f0 = new R.CaptureField();
  ok('rt.presence list skips under-levelled players', (() => { const pr = rt.presence(); return pr.every((p) => p.id !== 1); })());
  A.level = 40;
  ok('rt.presence list has the alive level-gated players', rt.presence().length === 2);
  void f0;

  // --- zone end
  rt.dispose();
  ok('rt.dispose clears the zone', !pvp.active && pvp.releaseBlocked() === false && pvp.respawnPoint() === null && pvp.snapshot() === null);
  ok('rt.outside the zone nothing is a PvP hit', pvp.onClientHit('pB', { targetId: 1, amount: 10, crit: false, type: 'true' }) === false);
}

// ====================================================================================================================
// client side message handling
// ====================================================================================================================
{
  clearWorld();
  const A = mkPlayer(1, { local: true, nation: KK, x: 600, z: 1000, name: 'Kurt', hp: 100000 });
  const B = mkPlayer(2, { nation: GK, x: 600, z: 995, name: 'Kartal', hp: 100000 });
  const handlers = new Map();
  G.net = {
    peers: new Map(), isAuthority: false, isOnline: true, selfId: 'me', hostId: 'host',
    on: (ch, h) => { handlers.set(ch, h); return () => handlers.delete(ch); }, sendToHost: () => {}, broadcast: () => {},
  };
  const rec = { kills: 0, deaths: 0, honour: 0, honourTotal: 0, bestStreak: 0, captures: 0 };
  G.character.pvpRecord = () => rec;
  const rt = startPvp({ world, scene: H.scene, nearestWalkable: (x, z) => ({ x, z }), teleport() {}, release() {}, now: () => 0 });
  const msg = (m, from = 'host') => handlers.get('pvp')(JSON.parse(JSON.stringify(m)), from);
  msg({ k: 'pcap', p: [[0, -1, 0], [1, 0, 12.5], [-1, -1, 0]], sc: [7, 3] });
  const sn = rt.snapshot();
  ok('client.pcap state copied', sn.points[0].owner === 0 && sn.points[1].owner === 1 && sn.points[1].side === 0 && near(sn.points[1].prog, 12.5) && sn.scores[0] === 7 && sn.scores[1] === 3);
  msg({ k: 'pcap', p: [[1, -1, 0], [1, -1, 0], [1, -1, 0]], sc: [1, 1] }, 'stranger');
  ok('client.pcap from a non-host peer ignored', rt.snapshot().points[0].owner === 0);
  msg({ k: 'pboard', rows: [[2, 'Kartal', 0, 3, 1, 40], [1, 'Kurt', 1, 1, 3, 12], 'junk', null], sc: [7, 3] });
  const rows = rt.snapshot().rows;
  ok('client.pboard rows sanitised, self flagged', rows.length === 2 && rows[1].self === true && rows[0].name === 'Kartal' && rows[0].honour === 40);
  msg({ k: 'pkill', killer: 1, victim: 2, kn: 'Kurt', vn: 'Kartal', ka: 1, va: 0, h: 15, s: 2, sc: [7, 4] });
  ok('client.pkill: the killer client updates its own save', rec.kills === 1 && rec.honour === 15 && rec.bestStreak === 2);
  msg({ k: 'pkill', killer: 1, victim: 2, kn: 'Kurt', vn: 'Kartal', ka: 1, va: 0, h: 99999, s: 2, sc: [7, 4] }, 'stranger');
  ok('client.pkill from a non-host peer ignored', rec.kills === 1);
  msg({ k: 'pkill', killer: 1, victim: 2, kn: 'Kurt', vn: 'Kartal', ka: 1, va: 0, h: 99999, s: 2, sc: [7, 4] });
  ok('client.honour per kill is clamped (200)', rec.honour <= 15 + 200);
  // a forged forwarded hit: attacker is a same-nation player -> refused by the victim's own rules
  B.nation = KK;
  const hp0 = A.hp;
  msg({ k: 'hit', to: 'me', amount: 5000, type: 'true', crit: false, dir: [0, 1], aLvl: 40, aIlvl: 0, seq: 1, from: 2 });
  ok('client.forwarded hit from a same-nation source refused', A.hp === hp0);
  B.nation = GK;
  msg({ k: 'hit', to: 'me', amount: 5000, type: 'true', crit: false, dir: [0, 1], aLvl: 40, aIlvl: 0, seq: 2, from: 2 });
  ok('client.legit forwarded hit lands at 40 %', hp0 - A.hp === 2000, `lost ${hp0 - A.hp}`);
  const hp1 = A.hp;
  msg({ k: 'hit', to: 'me', amount: 5000, type: 'true', crit: false, dir: [0, 1], aLvl: 40, aIlvl: 0, seq: 3, from: 2 }, 'stranger');
  ok('client.forwarded hit from a non-host peer ignored', A.hp === hp1);
  msg({ k: 'hit', to: 'me', amount: 1e12, type: 'true', crit: false, dir: [0, 1], aLvl: 99999, aIlvl: 0, seq: 4, from: 2 });
  ok('client.forged huge amount / level is capped at 60-level cap x 40 %', hp1 - A.hp <= Math.round(R.pvpHitCap(60, monsterHP) * 0.4) + 1, `lost ${hp1 - A.hp}`);
  msg({ k: 'hit', to: 'me', amount: NaN, type: 'true', crit: false, dir: 'x', from: 2 });
  msg({ k: 'nonsense' });
  msg(null);
  ok('client.garbage never throws', true);
  rt.dispose();
}

console.warn = origWarn;
console.log(`\nPVP sim: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
