// PUBLIC ZONE CHANNELS headless check (src/net/Channels.ts + src/net/NetSession.ts + src/systems/Social.ts presence).
// No browser, no network: the REAL NetSession (one per simulated player, each with its own G-like environment), the real Social
// presence service and a fake transport (JSON-cloned, microtask-ordered, optional peer-discovery delay) for the game rooms and the lobby.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/channels.mjs      (V=1 prints every PASS)
// Stages: pure.*  (pick / names / election order / successor / interest tiers / ledger / lines)
//         join.*  (first player hosts, fullest-first, overflow to a new channel, stale-presence race, zones are separate, one scene load)
//         elect.* (simultaneous empty-room join: one host; split brain after a late link: the older claim wins, members follow)
//         mig.*   (host leaves: graceful + silent, deterministic successor, roster / slots / ledger / join order survive, re-seed only for
//                  the new host, double loss, a member that never re-handshakes is dropped, forged claims cannot unseat an old host)
//         party.* (party room -> soft party, follow the leader's channel, prefer the leader's channel, combat / cooldown / full guards)
//         cmd.*   (/kanal list and switch)
//         int.*   (interest tiers on the real relay: near full rate, mid ~2 Hz, far none; chat radius; party chat -> say)
//         load.*  (message-rate / bandwidth sim behind the channel capacity)
//         room.*  (party rooms are untouched: hosting from a channel, joining a party, no auto channel inside a party)
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
const info = (...a) => console.log(...a);
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

/* ================================================================================================ pure rules */
if (want('pure')) {
  const cap = C.CHANNELS.CAP_WORLD;
  ok('pure.cap world/town are 12, hard max is the entity-id range', C.channelCap('sisli_vadi') === 12 && C.channelCap('town') === 12 && C.CHANNELS.HARD_MAX === M.MAX_SLOTS && M.MAX_SLOTS === 15);
  ok('pure.cap never above the hard max', C.channelCap('x') <= C.CHANNELS.HARD_MAX);
  const { PVP_ZONE_ID } = await H.imp('data/pvpZone.ts');
  ok('pure.cap the PvP zone keeps its 8-player tuning (and the literal matches data/pvpZone)', C.PVP_CHANNEL_ZONE === PVP_ZONE_ID && C.channelCap(PVP_ZONE_ID) === M.MAX_ROOM_SIZE && M.MAX_ROOM_SIZE === 8);

  // names
  ok('pure.key format', C.channelKey('sisli_vadi', 2) === 'zone:sisli_vadi:ch2');
  ok('pure.key parse round trip', JSON.stringify(C.parseChannelKey('zone:sisli_vadi:ch2')) === '{"zone":"sisli_vadi","num":2}');
  ok('pure.key parse rejects junk', [null, 5, 'zone:x:ch0', 'zone:x:ch99', 'zone::ch1', 'party:x:ch1', 'zone:a b:ch1', `zone:${'a'.repeat(40)}:ch1`].every((k) => C.parseChannelKey(k) === null));
  ok('pure.roomcode carries the game version', C.channelRoomCode('town', 1, '0.1.0') === 'zone:town:ch1@0.1.0' && C.channelRoomCode('town', 1, '0.2.0') !== C.channelRoomCode('town', 1, '0.1.0'));
  ok('pure.tag', C.channelTag(3) === 'CH3');

  // zone of a scene
  const iw = (id) => ['sisli_vadi', 'karakir_bozkiri'].includes(id);
  ok('pure.zone town', C.zoneKeyOf('town', undefined, iw) === 'town');
  ok('pure.zone open world', C.zoneKeyOf('dungeon', { dungeonId: 'sisli_vadi' }, iw) === 'sisli_vadi');
  ok('pure.zone dungeon run is private', C.zoneKeyOf('dungeon', { dungeonId: 'golge_tapinagi' }, iw) === null);
  ok('pure.zone junk', C.zoneKeyOf('dungeon', null, iw) === null && C.zoneKeyOf('dungeon', { dungeonId: 5 }, iw) === null && C.zoneKeyOf('menu', undefined, iw) === null && C.zoneKeyOf('dungeon', { dungeonId: 'a b' }, iw) === null);

  // pickChannel
  const m = (o) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  ok('pure.pick empty zone opens channel 1', C.pickChannel(m({}), { cap }) === 1);
  ok('pure.pick fullest below capacity', C.pickChannel(m({ 1: 3, 2: 9, 3: 5 }), { cap }) === 2);
  ok('pure.pick skips a full channel', C.pickChannel(m({ 1: 12, 2: 5, 3: 7 }), { cap }) === 3);
  ok('pure.pick tie -> lowest number', C.pickChannel(m({ 2: 6, 3: 6, 1: 0 }), { cap }) === 2);
  ok('pure.pick all full -> the next channel', C.pickChannel(m({ 1: 12, 2: 12 }), { cap }) === 3);
  ok('pure.pick gap: lowest EMPTY number when nothing has room', C.pickChannel(m({ 1: 12, 3: 12 }), { cap }) === 2);
  ok('pure.pick 11/12 still counts as room', C.pickChannel(m({ 1: 11 }), { cap }) === 1);
  ok('pure.pick prefer wins when it has room', C.pickChannel(m({ 1: 9, 2: 2 }), { cap, prefer: 2 }) === 2);
  ok('pure.pick prefer ignored when full', C.pickChannel(m({ 1: 9, 2: 12 }), { cap, prefer: 2 }) === 1);
  ok('pure.pick exclude (tried / full)', C.pickChannel(m({ 1: 9, 2: 5 }), { cap, exclude: new Set([1]) }) === 2 && C.pickChannel(m({ 1: 9 }), { cap, exclude: new Set([1]) }) === 2);
  ok('pure.pick exhausted -> 0', C.pickChannel(m({ 1: 12, 2: 12 }), { cap, maxChannels: 2 }) === 0 && C.pickChannel(m({}), { cap, exclude: new Set([1, 2, 3]), maxChannels: 3 }) === 0);
  const rows = [
    { self: true, channel: { zone: 'town', num: 1 } }, { self: false, channel: { zone: 'town', num: 1 } }, { self: false, channel: { zone: 'town', num: 2 } },
    { self: false, channel: { zone: 'sisli_vadi', num: 1 } }, { self: false, channel: null }, { self: false },
  ];
  ok('pure.count skips self and other zones', JSON.stringify([...C.countChannels(rows, 'town')]) === '[[1,1],[2,1]]');
  ok('pure.count can include self', C.countChannels(rows, 'town', true).get(1) === 2);

  // lines
  const lines = C.channelLines('Sisli Vadi', m({ 1: 12, 2: 4 }), 2, 12);
  ok('pure.lines header + rows + hint', lines[0] === 'Sisli Vadi - kanallar (CH2):' && lines.some((l) => l.includes('CH1  12/12 (dolu)')) && lines.some((l) => l.includes('CH2  4/12') && l.includes('buradasın')) && lines.some((l) => l.startsWith('  CH3  0/12')) && lines.at(-1).includes('/kanal'));

  // election order is total and clock independent
  const claims = [{ since: 500, id: 'b' }, { since: 100, id: 'z' }, { since: 100, id: 'm' }, { since: 900, id: 'a' }];
  const winners = new Set();
  for (let i = 0; i < 40; i++) {
    const sh = [...claims].sort(() => Math.random() - 0.5);
    winners.add(C.electHost(sh[0], sh.slice(1)).id);
  }
  ok('pure.elect same winner for every view (oldest, then lowest id)', winners.size === 1 && winners.has('m'));
  ok('pure.claimBefore is a strict total order', C.claimBefore({ since: 1, id: 'a' }, { since: 2, id: 'a' }) && !C.claimBefore({ since: 2, id: 'a' }, { since: 1, id: 'a' }) && !C.claimBefore({ since: 1, id: 'a' }, { since: 1, id: 'a' }) && C.claimBefore({ since: 1, id: 'a' }, { since: 1, id: 'b' }));
  const roster = [{ id: 'h', js: 0 }, { id: 'c', js: 3 }, { id: 'a', js: 1 }, { id: 'b', js: 2 }];
  ok('pure.successor = lowest join sequence among survivors', C.successorOf(roster, new Set(['h'])) === 'a' && C.successorOf(roster, new Set(['h', 'a'])) === 'b' && C.successorOf(roster, new Set(['h', 'a', 'b', 'c'])) === null);
  ok('pure.successor tie -> lowest id', C.successorOf([{ id: 'q', js: 4 }, { id: 'f', js: 4 }], new Set()) === 'f');
  const orderA = C.successorOf([...roster].sort(() => Math.random() - 0.5), new Set(['h']));
  ok('pure.successor independent of list order', orderA === 'a');

  // interest tiers
  ok('pure.tier boundaries', C.tierOf(0) === 'near' && C.tierOf(150) === 'near' && C.tierOf(150.01) === 'mid' && C.tierOf(400) === 'mid' && C.tierOf(400.01) === 'none');
  ok('pure.tier unknown distance fails open', C.tierOf(null) === 'near' && C.tierOf(NaN) === 'near');
  const f = new C.InterestFilter();
  let near = 0, mid = 0, far = 0, ev = 0;
  for (let i = 0; i < 150; i++) { // 10 s at 15 Hz
    const t = i * (1000 / 15);
    if (f.allow('stream', 'pstate', 'a', 'n', 100, t)) near++;
    if (f.allow('stream', 'pstate', 'a', 'm', 300, t)) mid++;
    if (f.allow('stream', 'pstate', 'a', 'f', 401, t)) far++;
    if (f.allow('event', 'cast', 'a', 'm', 300, t)) ev++;
  }
  ok('pure.interest near keeps the full rate', near === 150);
  ok('pure.interest mid is thinned to ~2 Hz', mid >= 18 && mid <= 22, `mid=${mid}/10s`);
  ok('pure.interest far gets nothing', far === 0);
  ok('pure.interest events are only cut beyond FAR', ev === 150 && !f.allow('event', 'cast', 'a', 'f', 500, 0));
  ok('pure.interest mid clock is per (channel, from, to)', f.allow('stream', 'pstate', 'x', 'm', 300, 0) && f.allow('stream', 'minion', 'a', 'm', 300, 5));
  f.forget('m');
  ok('pure.interest forget drops the clocks of a peer', f.allow('stream', 'pstate', 'a', 'm', 300, 6000) && f.size >= 1);
  ok('pure.chat radius', C.chatRadius('say') === 25 && C.chatRadius('emote') === 25 && C.chatRadius('yell') === 100 && C.chatRadius(undefined) === null && C.chatRadius('party') === null);

  // ledger
  const L = new C.ChannelLedger();
  L.note('camp:wolves', 100, 1000);
  ok('pure.ledger remaining counts down', Math.abs(L.remaining('camp:wolves', 31000) - 70) < 0.01 && L.remaining('camp:wolves', 200000) === 0 && L.remaining('camp:none', 0) === 0);
  L.note('camp:wolves', 100, 1000);
  const wire = L.encode(31000);
  ok('pure.ledger wire form is [key, remaining s]', wire.length === 1 && wire[0][0] === 'camp:wolves' && Math.abs(wire[0][1] - 70) < 0.2 && !L.dirty);
  const L2 = new C.ChannelLedger();
  L2.merge(wire, 50000);
  ok('pure.ledger merge converts to the local clock', Math.abs(L2.remaining('camp:wolves', 60000) - 60) < 0.3);
  L2.merge([['camp:wolves', 0], ['bad key!', 5], [5, 5], ['x', 'y'], 'junk', ['camp:ok', Infinity]], 60000);
  ok('pure.ledger merge: 0 deletes, junk ignored', L2.remaining('camp:wolves', 60000) === 0 && L2.size === 0);
  const L3 = new C.ChannelLedger();
  for (let i = 0; i < 400; i++) L3.note(`camp:p${i}`, 50, 0);
  ok('pure.ledger is capped', L3.size === C.CHANNELS.LEDGER_MAX);
  L3.note('camp:long', 999999, 0);
  ok('pure.ledger ttl is clamped', L3.remaining('camp:p0', 0) <= 50 && (() => { const l = new C.ChannelLedger(); l.note('k', 999999, 0); return l.remaining('k', 0) <= C.CHANNELS.LEDGER_MAX_TTL_S; })());
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

/* ================================================================================================ join */
if (want('join')) {
  // a lone player opens channel 1 and is its host
  const a = makePeer('Ayaz');
  await goZone(a);
  ok('join.first player hosts CH1', a.net.role === 'host' && a.net.channel?.key === 'zone:sisli_vadi:ch1' && a.net.channelTag === 'CH1');
  ok('join.channel host is not a party', a.net.inParty === false && a.net.isPartyLeader && a.net.partySize === 1 && a.net.partyMembers().length === 1);
  ok('join.the zone scene was built exactly once with the requested params', a.rec.go.length === 1 && a.rec.go[0].id === 'dungeon' && a.rec.go[0].params.dungeonId === 'sisli_vadi' && a.rec.go[0].params.spawn.id === 'guney_kapisi');
  ok('join.host slot 0 / entity id 1, room max 12', a.net.localSlot === 0 && a.net.maxPlayers === 12);
  ok('join.channels never announce on the room browser', a.net.listRooms().length === 0);

  // five more join the same channel (fullest first), each loads its own scene once
  const rest = [];
  for (const n of ['Bora', 'Ceren', 'Deniz', 'Ege', 'Fulya']) {
    await syncPresence();
    const p = makePeer(n);
    await goZone(p, 'sisli_vadi', OW('sisli_vadi', { spawn: { type: 'gate', id: n } }));
    rest.push(p);
  }
  await runUpdates(80);
  ok('join.everyone is in CH1', [a, ...rest].every((p) => roomOf(p) === 'zone:sisli_vadi:ch1'));
  ok('join.roster agrees on every peer', new Set([a, ...rest].map((p) => members(p).join('|'))).size === 1 && members(a).length === 6);
  ok('join.unique slots, host 0, joiners 1..5 in join order', slotsOf(a) === '0,1,2,3,4,5' && rest.map((p) => p.net.localSlot).join(',') === '1,2,3,4,5');
  ok('join.joiners keep their own spawn (scene entered once, after the slot is known)', rest.every((p) => p.rec.go.length === 1 && p.rec.go[0].params.spawn.id === p.name));
  ok('join.joiner is a channel member, not a party member', rest.every((p) => p.net.role === 'client' && p.net.partyMembers().length === 1 && !p.net.inParty && p.net.isPartyLeader && !p.net.isPartyGuest));
  ok('join.no "joined the group" noise in a channel', rest.every((p) => p.rec.chat.filter((c) => c.channel === 'system').length === 0) && a.rec.chat.filter((c) => c.channel === 'system').length === 0);
  ok('join.host gives join sequences 1..5', a.net.members().map((m) => m.js).sort().join(',') === '0,1,2,3,4,5');
  ok('join.host is the only isHost', a.net.members().filter((m) => m.isHost).length === 1 && rest.every((p) => p.net.hostId === a.id));

  // the next player picks CH1 (6/12 -> fullest below capacity)
  await syncPresence();
  const g = makePeer('Gonca');
  await goZone(g);
  ok('join.presence counts steer the next player into the fullest channel', roomOf(g) === 'zone:sisli_vadi:ch1');
  rest.push(g);

  // the town is a separate zone
  const t = makePeer('Tuna');
  await goTown(t);
  ok('join.town has its own channel list', t.net.channel?.key === 'zone:town:ch1' && t.net.role === 'host');
  const t2 = makePeer('Tulin');
  await syncPresence();
  await goTown(t2);
  ok('join.second townsperson joins town CH1', t2.net.channel?.key === 'zone:town:ch1' && t2.net.role === 'client' && t2.rec.go.length === 1 && t2.rec.go[0].id === 'town');
  ok('join.town client enters its scene once', t2.rec.go.length === 1);
  await resetAll();
}

/* ---------------------------------------------------------------- overflow to a new channel */
if (want('join')) {
  const all = [];
  for (let i = 0; i < 12; i++) {
    const p = makePeer(`O${i}`);
    await goZone(p);
    await syncPresence();
    all.push(p);
  }
  await runUpdates(60);
  ok('join.12 players fill CH1', all.every((p) => roomOf(p) === 'zone:sisli_vadi:ch1') && all[0].net.peers.size === 12);
  const x = makePeer('Overflow');
  await goZone(x);
  ok('join.the 13th opens CH2', roomOf(x) === 'zone:sisli_vadi:ch2' && x.net.role === 'host' && x.net.channelTag === 'CH2');
  ok('join.CH1 stays at 12 (the host never over-fills)', all[0].net.peers.size === 12);
  await syncPresence();
  const y = makePeer('Overflow2');
  await goZone(y);
  ok('join.the 14th goes to the fullest channel below capacity (CH2)', roomOf(y) === 'zone:sisli_vadi:ch2' && y.net.role === 'client');
  // the host really rejects: force a join with stale presence (nobody told the newcomer that CH1 is full)
  const z = makePeer('Stale');
  const seen = [];
  // freeze presence: wipe z's registry so it believes the zone is empty and picks CH1 first
  z.social.peers.clear();
  const origPick = z.net.pickChannelNum.bind(z.net);
  z.net.pickChannelNum = (zone, tried) => { const n = tried.size === 0 ? 1 : origPick(zone, tried); seen.push(n); return n; };
  await goZone(z);
  ok('join.stale presence: full reject -> retried on another channel', seen[0] === 1 && seen.length >= 2 && roomOf(z) !== 'zone:sisli_vadi:ch1' && !!z.net.channel, `tried=${seen.join(',')} got=${roomOf(z)}`);
  ok('join.the rejected player entered its scene once', z.rec.go.length === 1);
  await resetAll();
}

/* ================================================================================================ election */
if (want('elect')) {
  // two players open an empty channel at the same moment (discovery faster than the settle window): exactly one hosts
  const a = makePeer('Alp');
  const b = makePeer('Bahar');
  await Promise.all([goZone(a), goZone(b)]);
  await runUpdates(120);
  const hosts = [a, b].filter((p) => p.net.role === 'host');
  ok('elect.simultaneous join: exactly one host', hosts.length === 1 && [a, b].every((p) => roomOf(p) === 'zone:sisli_vadi:ch1'));
  ok('elect.the other one is its member and both agree on the roster', members(a).join() === members(b).join() && members(a).length === 2);
  ok('elect.each scene was entered once', a.rec.go.length === 1 && b.rec.go.length === 1);
  await resetAll();
}
if (want('elect')) {
  // four players, all within the settle window
  const ps = ['A', 'B', 'C', 'D'].map((n) => makePeer(n));
  await Promise.all(ps.map((p) => goZone(p)));
  await runUpdates(150);
  ok('elect.four simultaneous joins: one host, three members', ps.filter((p) => p.net.role === 'host').length === 1 && ps.every((p) => members(p).length === 4));
  const winner = ps.find((p) => p.net.role === 'host');
  const claimant = ps.map((p) => ({ id: p.id, since: p.net.hostClaim?.since })).filter((c) => c.since);
  ok('elect.the host is the oldest settler', claimant.length === 1 && claimant[0].id === winner.id);
  await resetAll();
}
if (want('elect')) {
  // split brain: the second player only discovers the first AFTER both already hosted (slow discovery)
  gameNet.discoveryMs = 260;
  const a = makePeer('Kaan');
  const b = makePeer('Leyla');
  await Promise.all([goZone(a), goZone(b)]);
  const split = a.net.role === 'host' && b.net.role === 'host';
  ok('elect.slow discovery really split the room', split);
  await until(() => [a, b].filter((p) => p.net.role === 'host').length === 1 && [a, b].every((p) => p.net.mig === null), 1500);
  await runUpdates(200);
  const hs = [a, b].filter((p) => p.net.role === 'host');
  ok('elect.split brain merges into one host (older claim wins)', hs.length === 1 && members(a).join() === members(b).join() && members(a).length === 2, `roles=${a.net.role},${b.net.role}`);
  const older = [a, b].sort((p, q) => p.net.hostClaim === null ? 1 : q.net.hostClaim === null ? -1 : 0)[0];
  ok('elect.the loser was a host moments ago and rebuilt its world as a client', hs[0] === older && [a, b].filter((p) => p !== older)[0].rec.go.length >= 1);
  const loser = [a, b].find((p) => p.net.role === 'client');
  ok('elect.loser re-enters its (open-world) scene once more at its own position', loser.rec.go.length === 2 && loser.rec.go[1].params.resumeAt && Number.isFinite(loser.rec.go[1].params.resumeAt.x));
  ok('elect.the winner is not reloaded', hs[0].rec.go.length === 1);
  await resetAll();
}
if (want('elect')) {
  // a three-way split heals into one room
  gameNet.discoveryMs = 240;
  const ps = ['X', 'Y', 'Z'].map((n) => makePeer(n));
  await Promise.all(ps.map((p) => goZone(p)));
  await until(() => ps.filter((p) => p.net.role === 'host').length === 1 && ps.every((p) => members(p).length === 3), 2500);
  await runUpdates(200);
  ok('elect.three-way split heals into one room', ps.filter((p) => p.net.role === 'host').length === 1 && ps.every((p) => members(p).length === 3 && p.net.hostId === ps.find((q) => q.net.role === 'host').id), ps.map((p) => `${p.net.role}:${members(p).length}`).join(' '));
  await resetAll();
}

/* ================================================================================================ migration */
async function room(n, { zone = 'sisli_vadi', town = false } = {}) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    const p = makePeer(`M${i}`);
    if (town) await goTown(p);
    else await goZone(p, zone);
    await syncPresence();
    p.pos.x = i * 5;
    ps.push(p);
  }
  await runUpdates(80);
  return ps;
}
if (want('mig')) {
  // graceful: the host walks out of the zone (into a dungeon run)
  const ps = await room(6);
  const [h, s1, s2, s3, s4, s5] = ps;
  s3.net.ledgerNote; // (client: no-op)
  h.net.ledgerNote('camp:wolves', 100);
  h.net.ledgerNote('camp:bears', 240);
  await runUpdates(200);
  ok('mig.ledger is replicated to every member', ps.slice(1).every((p) => p.net.ledgerRemaining('camp:wolves') > 90 && p.net.ledgerRemaining('camp:bears') > 230));
  const beforeSlots = new Map(ps.map((p) => [p.id, p.net.localSlot]));
  const goCounts = new Map(ps.map((p) => [p.id, p.rec.go.length]));
  await h.net.enterScene('dungeon', DUNGEON());
  await until(() => s1.net.role === 'host', 1500);
  await runUpdates(500);
  ok('mig.host left the channel (its dungeon run is private)', h.net.channel === null && h.net.role === 'offline' && h.rec.go.at(-1).params.dungeonId === 'golge_tapinagi');
  ok('mig.successor = lowest join sequence among the survivors', s1.net.role === 'host' && s1.net.channel?.key === 'zone:sisli_vadi:ch1');
  const rest = [s1, s2, s3, s4, s5];
  ok('mig.everyone else follows the new host', rest.slice(1).every((p) => p.net.role === 'client' && p.net.hostId === s1.id && !p.net.mig));
  ok('mig.nobody lost a slot (entity ids stay stable)', rest.every((p) => p.net.localSlot === beforeSlots.get(p.id)));
  ok('mig.roster is complete and agreed after re-handshake', rest.every((p) => members(p).join() === rest.map((q) => q.id).sort().join()), members(s2).length + ' members');
  ok('mig.members dropped nobody (pendingRehome drained)', s1.net.pendingRehome.size === 0 && s1.net.peers.size === 5);
  ok('mig.the new host re-seeds its OPEN-WORLD scene once, at its own position', s1.rec.go.length === goCounts.get(s1.id) + 1 && s1.rec.go.at(-1).params.resumeAt?.x === s1.pos.x && s1.rec.go.at(-1).params.dungeonId === 'sisli_vadi');
  ok('mig.members are NOT reloaded', rest.slice(1).every((p) => p.rec.go.length === goCounts.get(p.id)));
  ok('mig.hostChanged event on every peer', s1.rec.hostChanged.some((e) => e.self === true) && rest.slice(1).every((p) => p.rec.hostChanged.some((e) => e.hostId === s1.id && e.self === false)));
  ok('mig.the ledger (camp respawn timers) survives the handover', s1.net.ledgerRemaining('camp:wolves') > 80 && s1.net.ledgerRemaining('camp:bears') > 220 && s1.net.ledgerRemaining('camp:bears') <= 240);
  ok('mig.join sequence continues', s1.net.joinSeqCtr === 5);
  // a newcomer after the migration
  await syncPresence();
  const n = makePeer('Newcomer');
  await goZone(n);
  ok('mig.a newcomer joins the migrated channel as a member', n.net.role === 'client' && n.net.hostId === s1.id && s1.net.peers.size === 6);
  ok('mig.the newcomer gets slot 0 (the old host\'s) and the next join sequence', n.net.localSlot === 0 && n.net.members().find((m) => m.peerId === n.id).js === 6);
  ok('mig.the new host receives the ledger on join', n.net.ledgerRemaining('camp:wolves') > 60);
  // the old host comes back through the normal pick
  await syncPresence();
  await goZone(h);
  ok('mig.the old host returns as a member', h.net.role === 'client' && h.net.hostId === s1.id && h.net.channel.num === 1);
  await resetAll();
}
if (want('mig')) {
  // silent loss (crash): no hostleft, only the transport tells
  const ps = await room(4);
  const [h, s1, s2, s3] = ps;
  const tr = h.net.tr;
  tr.drop();
  await until(() => s1.net.role === 'host' && s2.net.hostId === s1.id && s3.net.hostId === s1.id && !s2.net.mig && !s3.net.mig, 2500);
  await runUpdates(300);
  ok('mig.silent host loss: the same successor takes over', s1.net.role === 'host' && s2.net.hostId === s1.id && s3.net.hostId === s1.id);
  ok('mig.silent host loss: roster of 3 agreed', [s1, s2, s3].every((p) => members(p).length === 3));
  ok('mig.the crashed host is gone from the survivors\' rosters', [s1, s2, s3].every((p) => !members(p).includes(h.id)));
  await resetAll();
}
if (want('mig')) {
  // double loss: the host AND the successor vanish together -> the next in join order takes over
  const ps = await room(5);
  const [h, s1, s2, s3, s4] = ps;
  h.net.tr.drop();
  s1.net.tr.drop();
  await until(() => s2.net.role === 'host' && s3.net.hostId === s2.id && s4.net.hostId === s2.id && !s3.net.mig && !s4.net.mig, 3000);
  await runUpdates(300);
  ok('mig.double loss: third in join order hosts', s2.net.role === 'host' && s3.net.hostId === s2.id && s4.net.hostId === s2.id);
  ok('mig.double loss: roster is the three survivors', [s2, s3, s4].every((p) => members(p).length === 3));
  await resetAll();
}
if (want('mig')) {
  // a successor that claims too late / never: skip it
  const ps = await room(4);
  const [h, s1, s2, s3] = ps;
  s1.net.tr.send = () => {}; // s1 is deaf-mute: it stays connected but never speaks (no claim, no welcome)
  h.net.tr.drop();
  await until(() => s2.net.role === 'host' && s3.net.hostId === s2.id && !s3.net.mig, 4000);
  ok('mig.a successor that never claims is skipped after migrateWait', s2.net.role === 'host' && s3.net.hostId === s2.id);
  await resetAll();
}
if (want('mig')) {
  // a member that never re-handshakes with the new host is dropped after the grace period
  const ps = await room(4);
  const [h, s1, s2, s3] = ps;
  s3.net.tr.send = () => {}; // s3 stays connected but mute: it never answers the new host
  h.net.leaveRoom();
  await until(() => s1.net.role === 'host', 1500);
  ok('mig.pending members are kept during the grace period', s1.net.peers.has(s3.id));
  await runUpdates(700);
  ok('mig.a member that never re-handshakes is dropped after rehomeGrace', !s1.net.peers.has(s3.id) && s1.net.peers.size === 2 && s1.net.pendingRehome.size === 0);
  await resetAll();
}
if (want('mig')) {
  // town: promotion without a scene reload (nothing authoritative lives there)
  const ps = await room(3, { town: true });
  const [h, s1, s2] = ps;
  const c1 = s1.rec.go.length;
  h.net.leaveRoom();
  await until(() => s1.net.role === 'host' && s2.net.hostId === s1.id && !s2.net.mig, 2000);
  await runUpdates(200);
  ok('mig.town: the successor hosts without reloading anything', s1.net.role === 'host' && s1.rec.go.length === c1 && s2.rec.go.length === 1);
  await resetAll();
}
if (want('mig')) {
  // a host that is still connected but dead (frozen tab, black-holed route): the members notice the silence and move on
  const ps = [];
  for (let i = 0; i < 4; i++) {
    const p = makePeer(`Z${i}`, { timing: { hostSilenceMs: 2600 } });
    await goZone(p);
    await syncPresence();
    ps.push(p);
  }
  await runUpdates(80);
  const [h, s1, s2, s3] = ps;
  ok('mig.silence: setup', s1.net.hostId === h.id && s2.net.hostId === h.id);
  h.net.update = () => {}; // frozen: no frame loop (no pings)
  h.net.tr.send = () => {};
  await until(() => s1.net.role === 'host' && s2.net.hostId === s1.id && s3.net.hostId === s1.id && !s2.net.mig && !s3.net.mig, 6000);
  ok('mig.silence: a host that went quiet is replaced by the usual successor', s1.net.role === 'host' && s2.net.hostId === s1.id && s3.net.hostId === s1.id);
  ok('mig.silence: the dead host is dropped from the rosters', [s1, s2, s3].every((p) => !members(p).includes(h.id)));
  // the frozen host wakes up and finds a claim of one of its own members: it has been replaced, so it yields (whatever its age)
  h.net.hostSinceMono -= 600_000;
  h.net.lastTickAt = 1; // (a frame loop that last ran ages ago)
  delete h.net.update; // frame loop is back
  const sendBack = Object.getPrototypeOf(h.net.tr).send;
  h.net.tr.send = sendBack;
  h.net.onChannelPeer({ t: 'cpeer', st: 'host', since: Date.now() }, s1.id);
  ok('mig.silence: a woken host yields to the claim of one of its own members', h.net.role === 'client' && h.net.hostId === s1.id, `role=${h.net.role} hostId=${h.net.hostId.slice(0, 6)} s1=${s1.id.slice(0, 6)} mig=${!!h.net.mig}`);
  await resetAll();
}
if (want('mig')) {
  // forged claims: an old host is never talked down, a member never follows a stranger's claim
  const ps = await room(3);
  const [h, s1, s2] = ps;
  h.net.hostSinceMono -= 60_000; // the host is an old host (outside the merge window)
  const evil = makePeer('Evil');
  const etr = gameNet.open('zone:sisli_vadi:ch1@0.1.0', evil.id, 0);
  await sleep(10);
  etr.send('ctl', { t: 'cpeer', st: 'host', since: 1 });
  await sleep(10);
  ok('mig.a forged "I am the older host" claim does not unseat an old host', h.net.role === 'host' && s1.net.hostId === h.id && s2.net.hostId === h.id);
  etr.send('ctl', { t: 'rehome', to: evil.id });
  etr.send('ctl', { t: 'hostleft', next: evil.id });
  await sleep(10);
  ok('mig.members only obey their own host (rehome / hostleft from a stranger are ignored)', s1.net.hostId === h.id && s1.net.mig === null && s2.net.mig === null);
  etr.send('ctl', { t: 'hello', proto: M.PROTOCOL_VERSION, gameVersion: M.GAME_VERSION, summary: { id: 'e', name: 'Evil', classId: 'knight', level: 1, itemLevel: 0, rating: 0, variant: 0 }, keystone: null });
  etr.send('ctl', { t: 'hello', proto: M.PROTOCOL_VERSION, gameVersion: M.GAME_VERSION, summary: { id: 'e', name: 'Evil', classId: 'knight', level: 1, itemLevel: 0, rating: 0, variant: 0 }, keystone: null, ch: 'zone:town:ch1' });
  await sleep(10);
  ok('mig.a hello for the wrong channel / a party hello is rejected', !h.net.peers.has(evil.id));
  etr.send('ctl', { t: 'cledger', e: [['camp:x', 99999]] });
  await sleep(10);
  ok('mig.a ledger from a non-host is ignored', s1.net.ledgerRemaining('camp:x') === 0);
  await resetAll();
}

/* ================================================================================================ party follow */
if (want('party')) {
  // a party room dissolves into the public world: the soft party remembers its leader
  const a = makePeer('Lider');
  const b = makePeer('Uye1');
  const c = makePeer('Uye2');
  await goTown(a); // channel first (hostRoom leaves it)
  const code = await a.net.hostRoom({ name: 'Grup', maxPlayers: 5 });
  ok('room.hostRoom from a channel opens a normal party room', code.length === 6 && a.net.role === 'host' && a.net.channel === null && a.net.localSlot === 0);
  ok('room.hostRoom re-enters the town scene (the slot changed)', a.rec.go.length === 2 && a.rec.go[1].id === 'town');
  await b.net.joinRoom(code);
  await c.net.joinRoom(code);
  await runUpdates(80);
  ok('room.members join the party room (no channel)', b.net.role === 'client' && b.net.channel === null && b.net.inParty && b.net.isPartyGuest && b.net.members().length === 3);
  ok('room.party members are party members', b.net.partyMembers().length === 3 && a.net.partySize === 3);
  ok('room.a party player is not put into a channel on travel', (await (async () => { await b.net.enterScene('town'); await sleep(10); return b.net.channel === null && b.net.role === 'client'; })()));
  ok('party.soft party: host leads, members follow the host', a.net.partyLeader === 'Lider' && b.net.partyLeader === 'Lider' && c.net.partyLeader === 'Lider');
  // the leader closes the room; everybody lands in the public world
  a.net.leaveRoom();
  await until(() => b.net.role === 'offline' && c.net.role === 'offline', 1500);
  ok('party.the room closing keeps the soft party', b.net.partyLeader === 'Lider' && c.net.partyLeader === 'Lider' && a.net.partyLeader === 'Lider');
  await sleep(10);
  await resetAll();
}
if (want('party')) {
  // leader + two followers in a zone; the leader switches channel and they follow
  const L = makePeer('Kaptan');
  const F1 = makePeer('Gemi1');
  const F2 = makePeer('Gemi2');
  const X = makePeer('Yabanci');
  for (const p of [F1, F2]) p.net.partyLeader = 'Kaptan';
  L.net.partyLeader = 'Kaptan';
  await goZone(L);
  await syncPresence();
  await goZone(F1);
  await syncPresence();
  await goZone(F2);
  await syncPresence();
  ok('party.followers join the leader\'s channel', [L, F1, F2].every((p) => roomOf(p) === 'zone:sisli_vadi:ch1'));
  // an unrelated player joined CH2 earlier? make CH1 the fullest, then a third party member must still pick the LEADER'S channel
  await goZone(X); // X picks CH1 too (fullest) -> 4 players
  await syncPresence();
  // the leader moves to CH2
  const lines = L.net.channelCommand('2');
  ok('party.leader /kanal 2 starts the switch', lines[0].includes('CH2'));
  await until(() => roomOf(L) === 'zone:sisli_vadi:ch2', 2000);
  await syncPresence();
  ok('party.leader is now host of CH2', roomOf(L) === 'zone:sisli_vadi:ch2' && L.net.role === 'host');
  ok('party.leader switch re-entered the zone at its position', L.rec.go.at(-1).params.resumeAt && L.rec.go.at(-1).params.dungeonId === 'sisli_vadi');
  F1.net.nextFollow = 0; F2.net.nextFollow = 0;
  await runUpdates(120);
  await syncPresence();
  F1.net.nextFollow = 0; F2.net.nextFollow = 0;
  await runUpdates(500);
  ok('party.followers follow the leader to CH2', roomOf(F1) === 'zone:sisli_vadi:ch2' && roomOf(F2) === 'zone:sisli_vadi:ch2', `${roomOf(F1)} ${roomOf(F2)}`);
  ok('party.a stranger stays where it was', roomOf(X) === 'zone:sisli_vadi:ch1');
  ok('party.followers keep their follow link', F1.net.partyLeader === 'Kaptan');
  // a follower who chooses another channel leaves the group
  await syncPresence();
  F1.net.lastSwitchAt = -Infinity;
  const l1 = F1.net.channelCommand('3');
  ok('party.manual switch away from the leader ends the follow', F1.net.partyLeader === null && l1.some((l) => l.includes('takip etmiyorsun')));
  await until(() => roomOf(F1) === 'zone:sisli_vadi:ch3', 2000);
  await runUpdates(1100);
  ok('party.an ex-follower does not get dragged back', roomOf(F1) === 'zone:sisli_vadi:ch3');
  await resetAll();
}
if (want('party')) {
  // entering a zone later: the leader's channel is preferred over the fullest one
  const L = makePeer('Reis');
  const crowd = [];
  for (let i = 0; i < 3; i++) crowd.push(makePeer(`C${i}`));
  await goZone(crowd[0]);
  await syncPresence();
  await goZone(crowd[1]);
  await syncPresence();
  await goZone(crowd[2]);
  await syncPresence();
  await goZone(L); // 4 in CH1
  await syncPresence();
  await L.net.channelCommand('2');
  await until(() => roomOf(L) === 'zone:sisli_vadi:ch2', 2000);
  await syncPresence();
  const F = makePeer('Tayfa');
  F.net.partyLeader = 'Reis';
  await syncPresence();
  await goZone(F);
  ok('party.entering a zone prefers the leader\'s channel over the fullest', roomOf(F) === 'zone:sisli_vadi:ch2', roomOf(F));
  // leader's channel full: falls back to the fullest below capacity
  await resetAll();
}
if (want('party')) {
  // switching guards
  const a = makePeer('Gard');
  const b = makePeer('Gard2');
  await goZone(a);
  await syncPresence();
  await goZone(b);
  await syncPresence();
  ok('cmd.not in a channel zone: no channels', makePeer('Menu').net.channelCommand('')[0].includes('kanal yok'));
  const list = a.net.channelCommand('');
  ok('cmd.list shows the zone, counts and the current channel', list[0] === 'Sisli Vadi - kanallar (CH1):' && list.some((l) => l.includes('CH1  2/12') && l.includes('buradasın')) && list.some((l) => l.includes('CH2  0/12')), list.join(' / '));
  ok('cmd.same channel', a.net.channelCommand('1')[0].includes('Zaten CH1'));
  ok('cmd.CH tag accepted', a.net.channelCommand('ch1')[0].includes('Zaten'));
  ok('cmd.bad numbers', a.net.channelCommand('0')[0].includes('1 ile 12') && a.net.channelCommand('13')[0].includes('1 ile 12') && a.net.channelCommand('abc')[0].includes('1 ile 12') && a.net.channelCommand('1.5')[0].includes('1 ile 12'));
  a.state.inCombat = true;
  ok('cmd.refused in combat', a.net.channelCommand('2')[0].includes('Savaşta'));
  a.state.inCombat = false;
  const go0 = a.rec.go.length;
  const r = a.net.channelCommand('2');
  ok('cmd.switch out of combat is accepted', r[0].includes('CH2'));
  ok('cmd.a second switch right away is throttled', a.net.channelCommand('3')[0].includes('Biraz bekle') || a.net.channelCommand('3')[0].includes('Kanal değişimi sürüyor'));
  await until(() => roomOf(a) === 'zone:sisli_vadi:ch2', 2000);
  await runUpdates(40);
  ok('cmd.switch left CH1 (host handover) and joined CH2', roomOf(a) === 'zone:sisli_vadi:ch2' && a.rec.go.length === go0 + 1);
  ok('cmd.the old channel migrated to its remaining member', b.net.role === 'host' && b.net.peers.size === 1 && roomOf(b) === 'zone:sisli_vadi:ch1');
  ok('cmd.the switcher\'s tag changed', a.net.channelTag === 'CH2');
  // a full channel is refused with the numbers
  await syncPresence();
  a.net.lastSwitchAt = -Infinity;
  const fill = [];
  for (let i = 0; i < 12; i++) {
    const p = makePeer(`F${i}`);
    await goZone(p, 'sisli_vadi');
    await syncPresence();
    fill.push(p);
  }
  await syncPresence();
  const full = [...C.countChannels(a.net.presenceRows(), 'sisli_vadi', true)];
  const fullNum = full.find(([, c]) => c >= 12)?.[0];
  ok('cmd.setup produced a full channel', !!fullNum, JSON.stringify(full));
  if (fullNum && fullNum !== a.net.channel.num) {
    a.net.lastSwitchAt = -Infinity;
    ok('cmd.a full channel is refused with the numbers', a.net.channelCommand(String(fullNum))[0].includes('dolu'));
  }
  await resetAll();
}

/* ================================================================================================ interest management on the real relay */
if (want('int')) {
  const mk = [];
  const spots = { H: [0, 0], N: [50, 0], M: [300, 0], F: [500, 0], S: [10, 0] };
  for (const n of Object.keys(spots)) {
    const p = makePeer(n);
    await goZone(p);
    await syncPresence();
    p.pos.x = spots[n][0];
    p.pos.z = spots[n][1];
    mk.push(p);
  }
  const [H0, N, Mid, Far, S] = mk;
  ok('int.setup: one channel of 5', mk.every((p) => roomOf(p) === 'zone:sisli_vadi:ch1') && H0.net.peers.size === 5);
  // fake mono clock only now (the rooms are settled): 15 Hz for 8 s
  let t = 1000;
  for (const p of mk) p.net.opts.monoNow = () => t;
  const got = new Map(mk.map((p) => [p.id, { fromS: 0, fromH: 0 }]));
  for (const p of mk) p.net.on('pstate', (pl, from) => { const g = got.get(p.id); if (from === S.id) g.fromS++; if (from === H0.id) g.fromH++; });
  const sendP = (p) => p.net.broadcast('pstate', { x: p.pos.x, y: 0, z: p.pos.z, yaw: 0, vx: 1, vz: 0, anim: 'Running_A', hp: 100, maxHp: 100, res: 10, maxRes: 100, dead: false, casting: null, level: 20, dodging: false, statuses: [], shot: null, shotSeq: 0, t: t / 1000, id: PARTY_ID_BASE + p.net.localSlot });
  // prime: the host learns everybody's position from one round of pstate (before that it fails open), then count
  for (const p of mk) sendP(p);
  await sleep(15);
  for (const g of got.values()) { g.fromS = 0; g.fromH = 0; }
  t += 600;
  const FRAMES = 15 * 8;
  for (let i = 0; i < FRAMES; i++) {
    t += 1000 / 15;
    // the senders also send their position to the host every frame (the host learns where everybody is)
    for (const p of mk) if (p !== H0) sendP(p);
    sendP(H0);
    await sleep(0);
  }
  await sleep(20);
  const gN = got.get(N.id), gM = got.get(Mid.id), gF = got.get(Far.id);
  ok('int.near peers (50 m) get the full 15 Hz of the sender', gN.fromS >= FRAMES - 2 && gN.fromS <= FRAMES, `near=${gN.fromS}/${FRAMES}`);
  ok('int.mid peers (300 m) get ~2 Hz', gM.fromS >= 14 && gM.fromS <= 22, `mid=${gM.fromS} in 8 s`);
  ok('int.far peers (500 m) get nothing', gF.fromS === 0 && gF.fromH === 0, `far=${gF.fromS}/${gF.fromH}`);
  ok('int.the host\'s own stream is gated the same way', got.get(N.id).fromH >= FRAMES - 2 && got.get(Mid.id).fromH >= 14 && got.get(Mid.id).fromH <= 22, `hostN=${got.get(N.id).fromH} hostM=${got.get(Mid.id).fromH}`);
  ok('int.everyone still has the full roster (presence only beyond 400 m)', mk.every((p) => p.net.members().length === 5));
  // a peer walking into range gets full rate immediately
  Far.pos.x = 100;
  sendP(Far);
  t += 1000 / 15;
  sendP(S);
  await sleep(5);
  const before = got.get(Far.id).fromS;
  for (let i = 0; i < 10; i++) { t += 1000 / 15; sendP(Far); sendP(S); await sleep(0); }
  await sleep(10);
  ok('int.walking into range restores the full rate at once', got.get(Far.id).fromS - before >= 9, `+${got.get(Far.id).fromS - before}/10`);
  // casts are cut beyond FAR only
  const castGot = { near: 0, mid: 0, far: 0 };
  Far.pos.x = 500;
  sendP(Far);
  await sleep(5);
  N.net.on('cast', () => castGot.near++);
  Mid.net.on('cast', () => castGot.mid++);
  Far.net.on('cast', () => castGot.far++);
  for (let i = 0; i < 5; i++) S.net.broadcast('cast', { casterId: 1, skillId: 'x', x: 0, z: 0 });
  await sleep(20);
  ok('int.cast events: near + mid get all, far none', castGot.near === 5 && castGot.mid === 5 && castGot.far === 0, JSON.stringify(castGot));
  // chat radius
  const chat = { near: 0, mid: 0, far: 0 };
  for (const [key, p] of [['near', N], ['mid', Mid], ['far', Far]]) p.rec.chat.length = 0;
  S.pos.x = 0; N.pos.x = 20; Mid.pos.x = 60; Far.pos.x = 500;
  for (const p of mk) sendP(p);
  await sleep(10);
  S.net.sendChat('merhaba', 'say');
  S.net.sendChat('bagiriyorum', 'yell');
  S.net.sendChat('grup', 'party');
  await sleep(20);
  const heard = (p) => p.rec.chat.filter((c) => c.from === 'S').map((c) => c.text);
  ok('int.say is heard within 25 m only', heard(N).includes('merhaba') && !heard(Mid).includes('merhaba') && !heard(Far).includes('merhaba'), JSON.stringify([heard(N), heard(Mid), heard(Far)]));
  ok('int.yell is heard within 100 m', heard(N).includes('bagiriyorum') && heard(Mid).includes('bagiriyorum') && !heard(Far).includes('bagiriyorum'));
  ok('int.party chat in a channel is sent as "say"', heard(N).includes('grup') && !heard(Mid).includes('grup') && S.rec.chat.some((c) => c.text === 'grup' && c.channel === 'say'));
  await resetAll();
}

/* ================================================================================================ load / capacity */
if (want('load')) {
  // What decides the room size: the host relays every position stream to everybody else. Worst case = everybody in one clump, all moving.
  const samplePState = { x: 123.45, y: 0.5, z: -67.89, yaw: 1.57, vx: 4.2, vz: -1.1, anim: 'Running_A', hp: 4200, maxHp: 5200, res: 80, maxRes: 100, dead: false, casting: null, level: 42, dodging: false, statuses: ['bleed', 'haste'], shot: null, shotSeq: 3, t: 812.345, id: 5 };
  const env = { c: 'pstate', p: encodePayload('pstate', samplePState), s: 0, f: 'abcdefghijklmnopqrst' };
  const pBytes = JSON.stringify(env).length;
  const sampleMinion = { t: 812.3, minions: Array.from({ length: 6 }, (_, i) => ({ id: 900000 + i, defId: 'necro_ghoul', ownerId: 5, x: 120.5 + i, z: -66.1, yaw: 1.2, anim: 'Running_A', hp: 400, maxHp: 500, life: 20.5 })) };
  const mBytes = JSON.stringify({ c: 'minion', p: sampleMinion, s: 0, f: 'abcdefghijklmnopqrst' }).length;
  const HZ = M.NET.PLAYER_STATE_HZ;
  // bytes/s the HOST sends with everybody inside NEAR: its own stream to n-1 peers + the relay of the n-1 clients to the n-2 others = (n-1)^2 pstates;
  // each necromancer's minion list (a client's, relayed to n-2 peers) adds (n-2) copies at MINION_HZ
  const upload = (n, necros = 0) => (n - 1) * (n - 1) * HZ * pBytes + necros * (n - 2) * M.NET.MINION_HZ * mBytes;
  const kbs = (b) => Math.round(b / 1024);
  const mbit = (b) => (b * 8) / 1e6;
  info(`  load: pstate on the wire ${pBytes} B (positional array), minion list (6) ${mBytes} B`);
  for (const n of [4, 8, 12, 15]) info(`  load: ${String(n).padStart(2)} players all moving in one clump -> host upload ${String(kbs(upload(n))).padStart(4)} KB/s (${mbit(upload(n)).toFixed(1)} Mbit/s), with 3 necromancers ${String(kbs(upload(n, 3))).padStart(4)} KB/s (${mbit(upload(n, 3)).toFixed(1)} Mbit/s)`);
  // budget: ~5 Mbit/s of host upload for the player streams in the WORST case (everybody in one clump, all moving, three necromancers with a
  // full minion army). Home broadband uplinks are 10-20 Mbit/s and the same pipe carries snapshots, events and the lobby.
  const BUDGET = 640 * 1024;
  const cap = C.channelCap('sisli_vadi');
  ok('load.the chosen capacity fits the worst-case budget (clump + 3 necromancers)', upload(cap, 3) <= BUDGET, `${kbs(upload(cap, 3))} KB/s`);
  ok('load.the pstate-only worst case is far inside it', upload(cap) <= BUDGET * 0.55, `${kbs(upload(cap))} KB/s`);
  ok('load.15 (the entity-id ceiling) fits the pstate-only case but NOT the minion case: that is why the cap is 12', upload(15) <= BUDGET && upload(15, 3) > BUDGET, `${kbs(upload(15))} / ${kbs(upload(15, 3))} KB/s`);
  ok('load.a bigger room only ever gets more expensive (no free lunch)', [4, 8, 12, 15].every((n, i, a) => i === 0 || upload(n, 3) > upload(a[i - 1], 3)));
  ok('load.each client downloads only (n-1) streams', ((12 - 1) * HZ * pBytes) / 1024 < 60, `${kbs((12 - 1) * HZ * pBytes)} KB/s down`);

  // measure it on the real relay: 12 sessions in one clump for 3 s at 15 Hz, then spread over 1.2 km
  const mk = [];
  for (let i = 0; i < 12; i++) {
    const p = makePeer(`L${i}`);
    await goZone(p);
    await syncPresence();
    mk.push(p);
  }
  await runUpdates(60);
  ok('load.setup: 12 in one channel', mk.every((p) => roomOf(p) === 'zone:sisli_vadi:ch1') && mk[0].net.peers.size === 12);
  let t = 1000;
  for (const p of mk) p.net.opts.monoNow = () => t;
  const hostId = mk[0].id;
  const run = async (place, seconds) => {
    gameNet.resetStats();
    for (const p of mk) p.net.interest.clear();
    place();
    const frames = Math.round(HZ * seconds);
    for (let i = 0; i < frames; i++) {
      t += 1000 / HZ;
      for (const [k, p] of mk.entries()) p.net.broadcast('pstate', { ...samplePState, x: p.pos.x, z: p.pos.z, id: PARTY_ID_BASE + p.net.localSlot });
      await sleep(0);
    }
    await sleep(15);
    const st = gameNet.stat(hostId);
    return { bytesPerS: st.bytes / seconds, msgsPerS: st.msgs / seconds };
  };
  // first one frame to teach the host where everybody is (positions come from the stream itself)
  mk.forEach((p) => { p.pos.x = 0; p.pos.z = 0; });
  await run(() => {}, 0.2);
  const clump = await run(() => mk.forEach((p, i) => { p.pos.x = (i % 4) * 3; p.pos.z = Math.floor(i / 4) * 3; }), 3);
  info(`  load: measured, 12 in a clump: host sends ${Math.round(clump.msgsPerS)} msg/s, ${kbs(clump.bytesPerS)} KB/s (${mbit(clump.bytesPerS).toFixed(1)} Mbit/s); model says ${kbs(upload(12))} KB/s`);
  ok('load.measured clump matches the model (the relay does no hidden multiplication)', clump.bytesPerS <= upload(12) * 1.08 && clump.bytesPerS >= upload(12) * 0.85, `${kbs(clump.bytesPerS)} vs ${kbs(upload(12))}`);
  ok('load.measured clump is inside the budget', clump.bytesPerS <= BUDGET, `${kbs(clump.bytesPerS)} KB/s`);
  const spread = await run(() => mk.forEach((p, i) => { p.pos.x = i * 120; p.pos.z = 0; }), 3);
  info(`  load: measured, 12 spread over 1.3 km (120 m apart): host sends ${Math.round(spread.msgsPerS)} msg/s, ${kbs(spread.bytesPerS)} KB/s (${mbit(spread.bytesPerS).toFixed(2)} Mbit/s) = ${Math.round((spread.bytesPerS / clump.bytesPerS) * 100)} % of the clump`);
  ok('load.interest management cuts a spread-out channel to under a third of the clump', spread.bytesPerS < clump.bytesPerS / 3, `${Math.round((spread.bytesPerS / clump.bytesPerS) * 100)} %`);
  const split2 = await run(() => mk.forEach((p, i) => { p.pos.x = i < 6 ? i * 2 : 600 + i * 2; p.pos.z = 0; }), 3);
  info(`  load: measured, two groups of 6, 600 m apart: ${kbs(split2.bytesPerS)} KB/s (${Math.round((split2.bytesPerS / clump.bytesPerS) * 100)} % of the clump)`);
  ok('load.two far groups only hear themselves', split2.bytesPerS < clump.bytesPerS * 0.55, `${Math.round((split2.bytesPerS / clump.bytesPerS) * 100)} %`);
  await resetAll();
}

/* ================================================================================================ party rooms untouched */
if (want('room')) {
  const a = makePeer('Oda1');
  const b = makePeer('Oda2');
  await goTown(a);
  ok('room.a channel player can host a party room from the town', true);
  const code = await a.net.hostRoom({ name: 'X' });
  await b.net.enterScene('town');
  await sleep(10);
  ok('room.party room announce flows exist (not announced when public=false) and the code is a normal 6-letter code', /^[A-Z2-9]{6}$/.test(code));
  // a dungeon run request from the party host moves the party (old behaviour)
  a.net.requestScene('dungeon', DUNGEON());
  await sleep(10);
  ok('room.a party host still moves the party with requestScene (no channel logic)', a.net.sceneSeq === 1 && a.net.channel === null && a.rec.go.at(-1).params.dungeonId === 'golge_tapinagi');
  await resetAll();
}
if (want('room')) {
  // no network: ?net=offline keeps the old direct path
  const events = new EventBus();
  const calls = [];
  const env = { events, ui: { toast() {} }, scenes: { current: null, go: async (id, params) => { calls.push({ id, params }); } }, character: { summary: () => ({ id: 'x', name: 'Solo', classId: 'knight', level: 1, itemLevel: 0, rating: 0, variant: 0 }), save: { mythic: {} } }, engine: { setBackgroundTick() {} } };
  const net = new NetSession({ env, kind: null, noReplication: true });
  await net.enterScene('dungeon', OW());
  ok('room.offline: no channel, the scene is entered directly', net.channel === null && net.role === 'offline' && calls.length === 1 && calls[0].params.dungeonId === 'sisli_vadi');
  net.requestScene('town', { spawnAt: 'south' });
  ok('room.offline: requestScene still works synchronously', calls.length === 2 && calls[1].id === 'town');
  const off2 = new NetSession({ env, kind: 'local', channels: false, noReplication: true });
  await off2.enterScene('town', undefined);
  ok('room.channels switched off: direct scene', off2.channel === null && calls.length === 3);
}
if (want('room')) {
  // dungeon runs and travel away from a zone
  const a = makePeer('Gez');
  await goZone(a);
  ok('room.travel: zone -> channel', a.net.channel?.num === 1);
  await a.net.enterScene('dungeon', DUNGEON());
  ok('room.travel: a dungeon run leaves the channel and builds the scene once', a.net.channel === null && a.net.role === 'offline' && a.rec.go.at(-1).params.dungeonId === 'golge_tapinagi' && a.net.localSlot === 0);
  await syncPresence();
  await goZone(a);
  ok('room.travel: back in the zone it takes a channel again', a.net.channel?.num === 1);
  await goTown(a);
  ok('room.travel: zone -> town switches channel zones', a.net.channel?.key === 'zone:town:ch1');
  // a scene change nobody announced (return scroll / tool): the channel follows the scene
  const w = makePeer('Rulo');
  await goZone(w);
  await w.env.scenes.go('town', { spawnAt: 'south' });
  await until(() => w.net.channel?.zone === 'town', 2000);
  ok('room.a direct G.scenes.go to the town moves the player to a town channel', w.net.channel?.zone === 'town');
  await w.env.scenes.go('menu');
  await sleep(20);
  ok('room.going to the menu leaves the channel', w.net.channel === null && w.net.role === 'offline');
  await resetAll();
}
if (want('room')) {
  // leaving the game while a channel join is still settling must not enter the scene afterwards
  const a = makePeer('Cikis');
  a.rec.discovery = 0;
  const p = a.net.enterScene('dungeon', OW());
  await sleep(10);
  a.net.leaveRoom();
  await p;
  await sleep(120);
  ok('room.leaving during the settle window cancels the join (no scene, no room)', a.rec.go.length === 0 && a.net.channel === null && a.net.role === 'offline' && gameNet.rooms.get('zone:sisli_vadi:ch1@0.1.0')?.size === 0 || !gameNet.rooms.get('zone:sisli_vadi:ch1@0.1.0')?.size);
  // a join that can never complete falls back to a solo scene
  const b = makePeer('Yalniz');
  b.net.opts.openTransport = async () => { throw new Error('no relays'); };
  await b.net.enterScene('dungeon', OW());
  ok('room.no network: solo fallback with a toast', b.rec.go.length === 1 && b.net.channel === null && b.rec.toasts.some((t) => t.t.includes('Kanala bağlanılamadı')));
  await resetAll();
}

const errs = H.errors.filter((e) => !/lpres|[social]|local slot changed/.test(e));
ok('no unexpected console errors / warnings from the net layer', errs.length === 0, errs.slice(0, 3).join(' | '));
H.restoreConsole();
console.log(`channels: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
