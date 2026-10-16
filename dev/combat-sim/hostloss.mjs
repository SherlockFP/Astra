// HOST LOSS headless check: a channel host leaves in the middle of a fight, the others keep playing, a joiner still gets in.
// Real NetSession (one per simulated player, fake transport, like channels.mjs), the real Carryover store, the real CampDirector and
// spawnEnemy (only the GLB load is stubbed). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/hostloss.mjs
// Stages: store.*  (net/Carryover.ts: records, chunking, merge rules, untrusted input)
//         fight.*  (a fight in progress: hurt camp member, dead member, wiped camp, a host-dynamic mob; the host walks out; the successor
//                   rebuilds the SAME fight from what the members saw; a control run without records shows the old reset)
//         join.*   (a joiner who arrives while the successor has not claimed yet waits for it instead of electing a second host; a joiner
//                   right after the migration gets in as a member; a full channel whose host left still has the seat)
//         silent.* (the host crashes instead of leaving: same result)
import * as H from './harness.mjs';

const { NetSession } = await H.imp('net/NetSession.ts');
const C = await H.imp('net/Channels.ts');
const M = await H.imp('net/messages.ts');
const { encodePayload } = await H.imp('net/codec.ts');
const { Social } = await H.imp('systems/Social.ts');
const { EventBus } = await H.imp('core/EventBus.ts');
const { PARTY_ID_BASE } = await H.imp('types/common.ts');

const want = (s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s);
let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Waits for `cond`, running the frame update of every simulated player meanwhile (timeouts live in NetSession.update). */
async function until(cond, ms = 3000, step = 4) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    for (const p of peers.values()) p.net.update(step / 1000);
    await sleep(step);
  }
  return !!cond();
}


/* ================================================================================================ fake networks */

/** One fake "room network": rooms by name, JSON-cloned microtask delivery, optional peer-discovery delay, byte counters per sender. */
class FakeNet {
  constructor() {
    this.rooms = new Map();
    this.sent = new Map(); // selfId -> { msgs, bytes, by: { channel: {msgs, bytes} } }
    this.discoveryMs = 0;
  }
  stat(id) {
    let s = this.sent.get(id);
    if (!s) this.sent.set(id, (s = { msgs: 0, bytes: 0, by: {} }));
    return s;
  }
  resetStats() { this.sent.clear(); }
  open(roomId, selfId, discoveryMs = this.discoveryMs) {
    let room = this.rooms.get(roomId);
    if (!room) this.rooms.set(roomId, (room = new Map()));
    if (room.has(selfId)) throw new Error(`duplicate peer ${selfId} in ${roomId}`);
    const tr = new FakeTr(this, room, roomId, selfId);
    room.set(selfId, tr);
    const link = () => {
      if (tr.state === 'closed') return;
      for (const other of room.values()) {
        if (other === tr || other.state === 'closed') continue;
        if (!tr.peers.has(other.selfId)) tr.addPeer(other.selfId);
        if (!other.peers.has(selfId)) other.addPeer(selfId);
      }
    };
    if (discoveryMs > 0) setTimeout(link, discoveryMs);
    else queueMicrotask(link);
    return tr;
  }
}
class FakeTr {
  constructor(net, room, roomId, selfId) {
    this.net = net; this.room = room; this.roomId = roomId; this.selfId = selfId;
    this.kind = 'local'; this.state = 'open';
    this.peers = new Set(); this.handlers = new Map(); this.joinH = new Set(); this.leaveH = new Set();
  }
  getPeers() { return [...this.peers]; }
  hasPeer(p) { return this.peers.has(p); }
  addPeer(id) {
    this.peers.add(id);
    for (const h of [...this.joinH]) h(id);
  }
  removePeer(id) {
    if (!this.peers.delete(id)) return;
    for (const h of [...this.leaveH]) h(id);
  }
  send(channel, data, opts = {}) {
    if (this.state === 'closed') return;
    const json = JSON.stringify(data);
    const targets = opts.to === undefined ? [...this.peers] : [].concat(opts.to).filter((t) => this.peers.has(t));
    const st = this.net.stat(this.selfId);
    for (const to of targets) {
      st.msgs++; st.bytes += json.length;
      const ch = (st.by[channel] ??= { msgs: 0, bytes: 0 });
      ch.msgs++; ch.bytes += json.length;
      queueMicrotask(() => {
        const target = this.room.get(to);
        if (!target || target.state === 'closed' || !target.peers.has(this.selfId)) return;
        for (const h of [...(target.handlers.get(channel) ?? [])]) h(JSON.parse(json), { from: this.selfId, channel, receivedAt: 0, loopback: false });
      });
    }
  }
  on(channel, h) {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(h); this.handlers.set(channel, set);
    return () => set.delete(h);
  }
  onPeerJoin(h) {
    this.joinH.add(h);
    queueMicrotask(() => { for (const p of [...this.peers]) if (this.joinH.has(h) && this.peers.has(p)) h(p); });
    return () => this.joinH.delete(h);
  }
  onPeerLeave(h) { this.leaveH.add(h); return () => this.leaveH.delete(h); }
  onError() { return () => {}; }
  async ping() { return 20; }
  getStats() { return { msgs: 0 }; }
  async leave() { this.drop(); }
  /** Silent loss (crash / network drop): the others see a peer-leave, this side hears nothing. */
  drop() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.room.delete(this.selfId);
    for (const o of this.room.values()) queueMicrotask(() => o.removePeer(this.selfId));
  }
}

/** Fake lobby for presence: JSON-cloned, flushed on demand (like social.mjs). */
class FakeLobby {
  constructor() { this.trs = new Map(); this.queue = []; }
  join(id) {
    const tr = new LobbyTr(this, id);
    for (const o of this.trs.values()) o.joinH.forEach((h) => h(id));
    this.trs.set(id, tr);
    return tr;
  }
  leave(id) {
    this.trs.delete(id);
    for (const o of this.trs.values()) o.leaveH.forEach((h) => h(id));
  }
  async flush() {
    let g = 0;
    while (this.queue.length && g++ < 100000) {
      const m = this.queue.shift();
      const t = this.trs.get(m.to);
      if (!t) continue;
      for (const h of t.handlers.get(m.channel) ?? []) h(JSON.parse(m.json), { from: m.from, channel: m.channel, receivedAt: 0, loopback: false });
    }
  }
}
class LobbyTr {
  constructor(net, id) { this.net = net; this.selfId = id; this.kind = 'local'; this.roomId = 'lobby'; this.state = 'open'; this.handlers = new Map(); this.joinH = []; this.leaveH = []; }
  getPeers() { return [...this.net.trs.keys()].filter((k) => k !== this.selfId); }
  hasPeer(p) { return this.net.trs.has(p); }
  send(channel, data, opts = {}) {
    const json = JSON.stringify(data);
    for (const to of opts.to ? [].concat(opts.to) : this.getPeers()) this.net.queue.push({ to, from: this.selfId, channel, json });
  }
  on(channel, h) { const s = this.handlers.get(channel) ?? new Set(); s.add(h); this.handlers.set(channel, s); return () => s.delete(h); }
  onPeerJoin(h) { this.joinH.push(h); for (const p of this.getPeers()) h(p); return () => {}; }
  onPeerLeave(h) { this.leaveH.push(h); return () => {}; }
  onError() { return () => {}; }
  async ping() { return 0; }
  getStats() { return {}; }
  async leave() {}
}

const gameNet = new FakeNet();
const lobby = new FakeLobby();
const clock = { t: 1_700_000_000_000 };
const peers = new Map();

const TIMING = { settleMs: 40, graceMs: 90, joinTimeoutMs: 1500, migrateWaitMs: 120, rehomeGraceMs: 400, mergeWindowMs: 20000, ledgerEveryMs: 60 };

const OW = (id = 'sisli_vadi', extra = {}) => ({ dungeonId: id, difficulty: 'normal', keyLevel: 0, seed: 1, affixes: [], enemyLevel: 10, partySize: 1, keyOwner: 'x', spawn: { type: 'gate', id: 'guney_kapisi' }, ...extra });
const DUNGEON = () => ({ dungeonId: 'golge_tapinagi', difficulty: 'normal', keyLevel: 0, seed: 7, affixes: [], enemyLevel: 10, partySize: 1, keyOwner: 'x' });

let seq = 0;
/** A simulated player: its own G-like env, a real NetSession on the fake transport, a real Social on the fake lobby. */
function makePeer(name, o = {}) {
  const id = o.id ?? `P${String(++seq).padStart(2, "0")}${name}`.padEnd(20, "x"); // trystero peer ids are 20 chars: byte counts stay realistic
  const events = new EventBus();
  const rec = { go: [], toasts: [], chat: [], hostChanged: [], peerJoined: [], peerLeft: [], leaving: 0 };
  events.on('net:chat', (e) => rec.chat.push(e));
  events.on('net:hostChanged', (e) => rec.hostChanged.push(e));
  events.on('net:peerJoined', (e) => rec.peerJoined.push(e));
  events.on('net:peerLeft', (e) => rec.peerLeft.push(e));
  const pos = { x: o.x ?? 0, z: o.z ?? 0 };
  const state = { inCombat: false };
  const env = {
    events,
    ui: { toast: (t, k) => rec.toasts.push({ t, k }) },
    scenes: { current: null, go: null },
    character: { summary: () => ({ id: `char-${name}`, name, classId: o.cls ?? 'knight', level: o.level ?? 20, itemLevel: 100, rating: 0, variant: 0, ...(o.nation ? { nation: o.nation } : {}) }), save: { mythic: {} } },
    engine: { setBackgroundTick() {}, time: 0 },
    player: { position: pos, get inCombat() { return state.inCombat; } },
    world: { enemies: [], remove() {}, localPlayer: null },
    presence: null,
  };
  const net = new NetSession({
    env, kind: 'local', timing: { ...TIMING, ...(o.timing ?? {}) }, noReplication: true,
    openTransport: async (kind, code) => {
      if (rec.openDelay) await sleep(rec.openDelay);
      return gameNet.open(code, id, rec.discovery ?? o.discovery);
    },
  });
  env.scenes.go = async (sceneId, params) => {
    rec.go.push({ id: sceneId, params });
    env.events.emit('scene:leaving', { from: env.scenes.current?.id ?? null, to: sceneId });
    const from = env.scenes.current?.id ?? null;
    env.scenes.current = null;
    await sleep(2);
    net.sceneReady(sceneId); // a real scene calls this at the end of enter()
    env.scenes.current = { id: sceneId };
    env.events.emit('scene:changed', { from, to: sceneId });
  };
  // presence (real Social on the fake lobby)
  const social = new Social({
    self: () => ({
      name, cls: o.cls ?? 'knight', level: o.level ?? 20, zone: env.scenes.current?.id ?? 'menu', zoneName: '',
      ...(net.channel ? { channel: { zone: net.channel.zone, num: net.channel.num } } : {}),
      ...(net.partyLeader ? { leader: net.partyLeader } : {}),
    }),
    now: () => clock.t, say: () => {}, changed: () => {}, expectNetwork: () => true, ignored: () => false,
  }, { autoTick: false });
  env.presence = social;
  social.wantConnected = true;
  social.attach(lobby.join(id));
  const p = { id, name, net, env, rec, pos, state, social, scenes: env.scenes };
  peers.set(id, p);
  return p;
}

async function syncPresence() {
  clock.t += 1200;
  for (const p of peers.values()) p.social.tick();
  await lobby.flush();
  await sleep(1);
}
async function runUpdates(ms, stepMs = 8) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const p of peers.values()) p.net.update(stepMs / 1000);
    await sleep(stepMs);
  }
}
const goZone = async (p, zone = 'sisli_vadi', params) => {
  await p.net.enterScene('dungeon', params ?? OW(zone));
  await sleep(6);
};
const goTown = async (p) => {
  await p.net.enterScene('town', undefined);
  await sleep(6);
};
async function dispose(p) {
  try { p.net.leaveRoom(); } catch { /* ignore */ }
  try { p.social.dispose(); } catch { /* ignore */ }
  lobby.leave(p.id);
  peers.delete(p.id);
}
async function resetAll() {
  for (const p of [...peers.values()]) {
    try { p.net.leaveRoom(); } catch { /* ignore */ }
    p.social.detach();
    lobby.leave(p.id);
    peers.delete(p.id);
  }
  await sleep(20);
  gameNet.rooms.clear();
  gameNet.resetStats();
  gameNet.discoveryMs = 0;
}
const members = (p) => p.net.members().map((m) => m.peerId).sort();
const slotsOf = (p) => p.net.members().map((m) => m.slot).sort((a, b) => a - b).join(',');
const roomOf = (p) => (p.net.channel ? p.net.channel.key : null);


/* ================================================================================================ extra imports */
const { CampDirector } = await H.imp('scenes/world/CampDirector.ts');
const { tileToWorld } = await H.imp('scenes/world/util.ts');
const { spawnEnemy } = await H.imp('entities/EnemyFactory.ts');
const { Enemy } = await H.imp('entities/Enemy.ts');
const CO = await H.imp('net/Carryover.ts');
const { HOST_DYNAMIC_ID_BASE } = await H.imp('types/common.ts');
const { G, world } = H;

Enemy.prototype.loadModel = async function loadModelStub() {};
G.mplus.onEnemySpawned = () => {};
const perf = { activateM: 70, deactivateM: 110, aiSleepM: 45, maxActiveEnemies: 240, chunkM: 40 };
const TRASH = 'ys_nobet_muhafizi';
const yieldFrames = () => new Promise((r) => setImmediate(r));

/* ================================================================================================ store */
if (want('store')) {
  const base = { defId: TRASH, x: 10, z: 20, yaw: 1, hp: 50, maxHp: 100, level: 8, packId: 'camp_a', tag: '', dead: false, aggro: true, openWorld: true, stealth: false, dormant: false };
  const S = new CO.CarryStore();
  S.note({ ...base, id: 100 }, 1000);
  S.note({ ...base, id: 101, dead: true, hp: 0 }, 1000);
  S.note({ ...base, id: 101, dead: true, hp: 0 }, 9000); // seen dead again later: the time of death stays
  ok('store.dead record keeps its time of death', Math.abs(S.get(101, 11000).age - 10) < 0.01);
  S.note({ ...base, id: 100, hp: 40 }, 5000);
  ok('store.living record refreshes', S.get(100, 6000).hp === 40 && Math.abs(S.get(100, 6000).age - 1) < 0.01);
  S.forgetAlive(100);
  S.forgetAlive(101);
  ok('store.forgetAlive drops living records only', !S.has(100) && S.has(101));
  const big = new CO.CarryStore();
  for (let i = 0; i < 150; i++) big.note({ ...base, id: 200 + i }, 0);
  const chunks = big.encode(1000);
  ok('store.encode chunks (<= CHUNK each, all rows, 16 KB frame safe)', chunks.length === 3 && chunks.every((c) => c.length <= CO.CARRY.CHUNK) && chunks.flat().length === 150 && chunks.every((c) => JSON.stringify({ t: 'ccarry', e: c, end: true }).length < 12000));
  ok('store.encode an empty store still sends one (end marker) message', new CO.CarryStore().encode(0).length === 1);
  const R = new CO.CarryStore();
  for (const c of chunks) R.merge(JSON.parse(JSON.stringify(c)), 50000);
  ok('store.wire round trip', R.size === 150 && R.get(200, 50000).hp === 50 && R.get(200, 50000).packId === 'camp_a' && R.get(200, 50000).aggro === true && Math.abs(R.get(200, 50000).age - 1) < 0.01);
  // merge rules: freshest wins; a death beats a living record
  const A = new CO.CarryStore();
  A.note({ ...base, id: 300, hp: 90 }, 0);
  const wire = (hp, dead, age) => [[300, TRASH, 1, 2, 0, hp, 100, 8, 'camp_a', dead ? 1 : 0, '', age]];
  A.merge(wire(20, false, 5), 10000); // theirs is 5 s old (at 5000), ours is at 0: theirs is newer
  ok('store.merge: the fresher record wins', A.get(300, 10000).hp === 20);
  A.merge(wire(70, false, 9), 10000);
  ok('store.merge: an older record loses', A.get(300, 10000).hp === 20);
  A.merge(wire(0, true, 5.5), 10000);
  ok('store.merge: a death wins over a living record', A.get(300, 10000).dead === true);
  A.merge(wire(80, false, 0), 10000);
  ok('store.merge: a later sighting of the respawned enemy replaces the corpse', A.get(300, 10000).dead === false);
  const J = new CO.CarryStore();
  J.merge([null, 5, [], [1, 2], [0, TRASH, 1, 1, 0, 1, 1, 1, '', 0, '', 0], [5, 'bad id!', 1, 1, 0, 1, 1, 1, '', 0, '', 0], [5, TRASH, NaN, 1, 0, 1, 1, 1, '', 0, '', 0], [6, TRASH, 99999, 1, 0, 9e99, 1, 999, '', 0, '', -4]], 0);
  ok('store.merge: junk rejected, numbers clamped', J.size === 1 && J.get(6, 0).x === 3000 && J.get(6, 0).level === 200 && J.get(6, 0).hp <= 1 && J.get(6, 0).age === 0);
  J.merge('nope', 0);
  const cap = new CO.CarryStore();
  for (let i = 0; i < CO.CARRY.MAX + 50; i++) cap.note({ ...base, id: 1000 + i }, 0);
  ok('store.capped', cap.size <= CO.CARRY.MAX);
  const src = (o) => ({ id: 1, kind: 'enemy', isDead: false, hp: 1, maxHp: 1, level: 1, yaw: 0, position: { x: 0, z: 0 }, def: { id: 'a' }, ...o });
  ok('store.recOf skips own simulation, adds and other kinds', CO.recOf(src({ authority: true })) === null && CO.recOf(src({ ownerId: 5 })) === null && CO.recOf(src({ kind: 'player' })) === null && CO.recOf(src({}))?.defId === 'a');
}

/* ================================================================================================ fight */
const ctxFor = (packs) => ({
  world, def: { packs }, seed: 4242, params: { enemyLevel: 6 },
  snapTile: (tx, tz) => ({ x: tileToWorld(tx), z: tileToWorld(tz) }),
  nearestPlayerDist(x, z) {
    let best = Infinity;
    for (const p of world.players) if (!p.removed) best = Math.min(best, Math.hypot(p.position.x - x, p.position.z - z));
    return best;
  },
  aliveEnemies() { let n = 0; for (const e of world.enemies) if (!e.isDead && !e.removed) n++; return n; },
  ev() {},
});
const pack = (id, tx, tz, n, respawnSec) => ({
  id, roomId: 'camp_room', center: [tx, tz], radius: 12, respawnSec,
  members: Array.from({ length: n }, (_, i) => ({ enemyId: TRASH, offset: [i - (n - 1) / 2, 0] })),
});
const alive = (packId) => world.enemies.filter((e) => e.packId === packId && !e.isDead && !e.removed).length;
async function run(director, s) {
  for (let i = 0; i < H.sec(s); i++) { H.step(1); director.update(H.DT); await yieldFrames(); }
}
async function runUntil(director, cond, maxS) {
  for (let i = 0; i < H.sec(maxS); i++) {
    if (cond()) return true;
    H.step(1); director.update(H.DT); await yieldFrames();
  }
  return cond();
}
function clearWorld() {
  for (const e of [...world.enemies]) world.remove(e);
  H.step(2);
}
const replicaOf = (e) => ({
  id: e.id, kind: 'enemy', def: { id: e.def.id }, position: { x: e.position.x, z: e.position.z }, yaw: e.yaw, hp: e.hp, maxHp: e.maxHp, level: e.level,
  packId: e.packId, tag: e.tag ?? '', ownerId: null, aggroed: !!e.aggroed, openWorld: true, isDead: e.isDead, removed: false, authority: false, packStealth: false, dormant: false,
});
const bcasts = [];
const soloNet = (extra = {}) => ({
  isAuthority: true, on() {}, broadcast(c, p) { bcasts.push({ c, p }); }, sendTo() {}, sendToHost() {}, ledgerNote() {}, ledgerRemaining: () => 0,
  carryReady: () => true, carryPeek: () => null, carryTake: () => null, carryRest: () => [], carryDone() {}, ...extra,
});

async function fightRoom(n, timingOver = {}) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = makePeer(`F${i}`, { timing: timingOver });
    await goZone(p);
    await syncPresence();
    p.pos.x = i * 5;
    ps.push(p);
  }
  await runUpdates(80);
  return ps;
}

if (want('fight')) {
  const packs = [pack('camp_a', 60, 60, 3, 90), pack('camp_c', 180, 60, 2, 40)];
  const ax = tileToWorld(60), az = tileToWorld(60), cx = tileToWorld(180), cz = tileToWorld(60);
  const p1 = H.addPlayer('knight', 10);
  p1.hp = p1.maxHp = 1e9;
  p1.position.set(ax + 15, 0, az);
  const p2 = new H.FakePlayer('knight', 10);
  p2.id = 901;
  world.add(p2);
  p2.hp = p2.maxHp = 1e9;
  p2.position.set(cx + 15, 0, cz);

  // ---- the old host's world: a fight in progress ---------------------------------------------------------------------
  G.net = soloNet();
  const d1 = new CampDirector(ctxFor(packs), perf);
  ok('fight.setup: both camps up', await runUntil(d1, () => alive('camp_a') === 3 && alive('camp_c') === 2, 6));
  const aMembers = world.enemies.filter((e) => e.packId === 'camp_a').sort((x, y) => x.id - y.id);
  const hurt = aMembers[0], dead = aMembers[1], healthy = aMembers[2];
  hurt.hp = Math.round(hurt.maxHp * 0.3);
  hurt.position.x += 3;
  hurt.position.z -= 2;
  const hurtAt = { x: hurt.position.x, z: hurt.position.z };
  const rare = await spawnEnemy(world, TRASH, { x: ax + 28, z: az }, { id: world.allocHostId(), level: 8, openWorld: true, tag: 'rare' });
  rare.hp = Math.round(rare.maxHp * 0.5);
  ok('fight.setup: the rare has a host-dynamic id', rare.id >= HOST_DYNAMIC_ID_BASE);
  G.combat.killEnemy(dead, p1.id);
  for (const e of world.enemies) if (e.packId === 'camp_c' && !e.isDead) G.combat.killEnemy(e, p2.id);
  await run(d1, 0.7);
  ok('fight.setup: one member dead, camp_c wiped', alive('camp_a') === 2 && alive('camp_c') === 0 && dead.isDead);
  const cMembers = world.enemies.filter((e) => e.packId === 'camp_c');
  const ids = { hurt: hurt.id, dead: dead.id, healthy: healthy.id, rare: rare.id, c: cMembers.map((e) => e.id) };

  // ---- the members see parts of it (replicas of the host's snapshots) ---------------------------------------------------
  const ps = await fightRoom(6, { migrateWaitMs: 700, rehomeGraceMs: 600 });
  const [h, s1, s2, s3, s4, s5] = ps;
  s2.env.world.enemies.push(replicaOf(hurt), replicaOf(dead), replicaOf(healthy)); // sees the hurt one, the corpse and the healthy one
  s3.env.world.enemies.push(...cMembers.map(replicaOf)); // sees the wiped camp
  s1.env.world.enemies.push(replicaOf(rare)); // the successor itself only sees the rare
  s4.env.world.enemies.push({ ...replicaOf(hurt), hp: Math.round(hurt.maxHp * 0.5) }); // an OLDER, less hurt view of the same enemy
  await runUpdates(1300);
  s4.env.world.enemies = []; // s4 walked away: its living record goes, but only after s2's fresher sighting is the one that counts
  // the corpses sink and go: the dead stay recorded
  s2.env.world.enemies = s2.env.world.enemies.filter((r) => !r.isDead);
  s3.env.world.enemies = [];
  await runUpdates(1300);
  ok('fight.members record what they saw (living, dead, rare)', s2.net.carry.has(ids.hurt) && s2.net.carry.get(ids.dead, 0)?.dead === true && s3.net.carry.get(ids.c[0], 0)?.dead === true && s1.net.carry.has(ids.rare));
  ok('fight.a corpse that sank stays recorded as dead, a living body that left is forgotten', s3.net.carry.get(ids.c[1], 0)?.dead === true && !s4.net.carry.has(ids.hurt));
  ok('fight.the host itself records nothing (it IS the world)', h.net.carry.size === 0);

  // ---- a joiner arrives while the successor is slow to claim -----------------------------------------------------------
  let promoted = 0;
  const realPromote = s1.net.promoteToHost.bind(s1.net);
  s1.net.promoteToHost = () => { setTimeout(() => { promoted++; realPromote(); }, 260); };
  const late = makePeer('Late', { timing: { migrateWaitMs: 700, rehomeGraceMs: 600 } });
  await syncPresence();
  const lateGo = goZone(late);
  const leave = h.net.enterScene('dungeon', DUNGEON());
  await Promise.all([lateGo, leave]);
  const okHost = await until(() => s1.net.role === 'host' && late.net.role === 'client' && late.net.hostId === s1.id && members(s1).length === 6, 5000);
  ok('join.a joiner arriving during the migration waits for the successor and joins it', okHost, `late=${late.net.role}/${late.net.hostId?.slice(0, 5)} s1=${s1.net.role} n=${members(s1).length}`);
  ok('join.exactly one host in the channel (no second copy was elected)', [h, s1, s2, s3, s4, s5, late].filter((p) => p.net.role === 'host' && p.net.channel?.key === 'zone:sisli_vadi:ch1').length === 1 && promoted === 1);
  ok('join.the late joiner entered its scene once', late.rec.go.length === 1);
  ok('fight.the successor got the records of every member', await until(() => s1.net.carryReady(), 4000));
  const hp = s1.net.carryPeek(ids.hurt);
  ok('fight.hurt member: freshest view wins (30 %, not the 50 % of the old view)', !!hp && Math.abs(hp.hp / hp.maxHp - 0.3) < 0.02);
  ok('fight.dead member and wiped camp arrived as dead', s1.net.carryPeek(ids.dead)?.dead === true && ids.c.every((id) => s1.net.carryPeek(id)?.dead === true));
  ok('fight.the rare (successor own sighting) is in the store', s1.net.carryPeek(ids.rare)?.hp > 0);
  ok('fight.only the host reads the records (a member has none to give)', s2.net.carryPeek(ids.hurt) === null && s2.net.carryTake(ids.hurt) === null);

  // ---- the new world is rebuilt from them ---------------------------------------------------------------------------------
  // control: the OLD behaviour (no records) - everything back at full health, the dead member alive, the wiped camp up again
  clearWorld();
  G.net = soloNet();
  const dc = new CampDirector(ctxFor(packs), perf);
  await runUntil(dc, () => alive('camp_a') === 3 && alive('camp_c') === 2, 6);
  const fresh = world.enemies.filter((e) => e.packId === 'camp_a');
  ok('control: without records the re-seed resets the fight (full HP, dead member back, wiped camp back)', fresh.length === 3 && fresh.every((e) => e.hp === e.maxHp) && alive('camp_c') === 2);
  clearWorld();

  let ready = false;
  bcasts.length = 0;
  G.net = soloNet({
    carryReady: () => ready && s1.net.carryReady(),
    carryPeek: (id) => s1.net.carryPeek(id), carryTake: (id) => s1.net.carryTake(id), carryRest: () => s1.net.carryRest(), carryDone: () => s1.net.carryDone(),
  });
  const d2 = new CampDirector(ctxFor(packs), perf);
  await run(d2, 2);
  ok('fight.the new world waits for the member records before it spawns anything', world.enemies.length === 0);
  ready = true;
  ok('fight.then the camp comes up', await runUntil(d2, () => alive('camp_a') >= 2, 6));
  await run(d2, 0.3);
  const reb = world.enemies.filter((e) => e.packId === 'camp_a' && !e.removed);
  const r0 = world.get(ids.hurt);
  ok('fight.the hurt member is back with its 30 % HP', !!r0 && !r0.isDead && Math.abs(r0.hp / r0.maxHp - 0.3) < 0.02, r0 ? `${(r0.hp / r0.maxHp).toFixed(2)}` : 'missing');
  ok('fight.the hurt member stands where the old host had it', !!r0 && Math.hypot(r0.position.x - hurtAt.x, r0.position.z - hurtAt.z) < 1.5);
  const r1 = world.get(ids.healthy);
  ok('fight.the unhurt member is at full HP', !!r1 && r1.hp === r1.maxHp);
  ok('fight.the dead member stays dead (2 of 3 up)', reb.length === 2 && !world.get(ids.dead));
  ok('fight.the wiped camp is still wiped (its respawn clock kept running)', alive('camp_c') === 0 && ids.c.every((id) => !world.get(id)));
  const rr = world.get(ids.rare);
  ok('fight.the host-dynamic mob is back under its old id with its HP', !!rr && Math.abs(rr.hp / rr.maxHp - 0.5) < 0.02, rr ? `${(rr.hp / rr.maxHp).toFixed(2)}` : 'missing');
  ok('fight.restored bodies are announced to the members (spawn with hpFrac)', bcasts.some((b) => b.c === 'spawn' && b.p.id === ids.hurt && Math.abs(b.p.hpFrac - 0.3) < 0.02) && bcasts.some((b) => b.c === 'spawn' && b.p.id === ids.rare));
  const back = await runUntil(d2, () => alive('camp_c') === 2, 45);
  ok('fight.the wiped camp comes back on its timer', back);
  ok('fight.records are used up once, not applied twice', s1.net.carryPeek(ids.hurt) === null && s1.net.carryPeek(ids.rare) === null);
  s1.net.carryDone();
  ok('fight.carryDone forgets everything', s1.net.carry.size === 0 && s1.net.carryPeek(ids.dead) === null);
  clearWorld();
  G.net = soloNet();

  // ---- a joiner right after the migration -------------------------------------------------------------------------------------
  await syncPresence();
  const after = makePeer('After');
  await goZone(after);
  ok('join.a joiner right after the migration is a member of the new host', after.net.role === 'client' && after.net.hostId === s1.id && members(s1).includes(after.id));
  await runUpdates(60);
  ok('join.the whole room agrees on the roster', [s1, s2, s3, s4, s5, late, after].every((p) => members(p).join() === members(s1).join()) && members(s1).length === 7, [s1, s2, late, after].map((p) => members(p).length).join(','));
  await resetAll();
}

/* ================================================================================================ capacity */
if (want('join')) {
  const ps = await fightRoom(12);
  ok('join.12 players fill the channel', ps.every((p) => p.net.channel?.key === 'zone:sisli_vadi:ch1') && ps[0].net.peers.size === 12);
  void ps[0].net.enterScene('dungeon', DUNGEON());
  await until(() => ps[1].net.role === 'host', 2000);
  await runUpdates(300);
  ok('join.the host left a 12/12 channel: 11 remain, the successor hosts', ps[1].net.role === 'host' && ps[1].net.peers.size === 11);
  await syncPresence();
  const j = makePeer('Seat');
  await goZone(j);
  ok('join.the freed seat is usable (no full-channel false positive)', j.net.channel?.key === 'zone:sisli_vadi:ch1' && j.net.role === 'client' && j.net.hostId === ps[1].id && ps[1].net.peers.size === 12);
  const j2 = makePeer('Seat2');
  await syncPresence();
  await goZone(j2);
  ok('join.the 13th still goes to a new channel', j2.net.channel?.key === 'zone:sisli_vadi:ch2');
  await resetAll();
}

/* ================================================================================================ silent loss */
if (want('silent')) {
  const ps = await fightRoom(4, { migrateWaitMs: 400 });
  const [h, s1, s2, s3] = ps;
  const rep = { id: 105, kind: 'enemy', def: { id: TRASH }, position: { x: 5, z: 5 }, yaw: 0, hp: 20, maxHp: 100, level: 8, packId: 'camp_a', tag: '', ownerId: null, aggroed: true, openWorld: true, isDead: false, removed: false, authority: false, packStealth: false, dormant: false };
  s2.env.world.enemies.push(rep);
  await runUpdates(1200);
  h.net.tr.drop(); // crash: nobody is told
  const up = await until(() => s1.net.role === 'host' && s2.net.hostId === s1.id && s3.net.hostId === s1.id, 4000);
  ok('silent.crash: successor takes over, members follow', up);
  ok('silent.the fight record reaches the successor', await until(() => s1.net.carryReady() && s1.net.carryPeek(105)?.hp === 20, 3000));
  await syncPresence();
  const n = makePeer('Newbie');
  await goZone(n);
  ok('silent.a joiner after the crash gets the channel', n.net.role === 'client' && n.net.hostId === s1.id);
  await resetAll();
}

const errs = H.errors.filter((e) => !/lpres|[social]|local slot changed|\[camps\]|unknown enemy/.test(e));
ok('no unexpected console errors / warnings', errs.length === 0, errs.slice(0, 3).join(' | '));
H.restoreConsole();
console.log(`hostloss: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
