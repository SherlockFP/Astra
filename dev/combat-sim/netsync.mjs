// NETSYNC headless check (sprint1): mounts, pets and cleanse over the real net layer (src/net/Replication.ts), its wire codec
// (src/net/codec.ts) and the real Social presence (src/systems/Social.ts). Fake transports only, no browser, no network.
//   mount.*    pstate flag 4 (`mounted`): the local ride reaches the wire; a remote rider gets one horse and loses it on dismount
//   codec.*    the mounted bit round trip; an old payload (no bit) reads as not mounted
//   pet.*      presence `pet` -> remote follower: appears, follows its owner, hides with it, goes away with the presence
//   cleanse.*  a dispel on a REMOTE party member asks the host; the host validates (caster in party, rate, owner really has a
//              dispellable debuff, range, not self-cleanse) and sends `cleanse` to the owner; the owner removes it; refusals
//   movement.* Özgürlük Duası's `movement` dispel type: one `cleanse {type}` request for a remote ally (the copy loses the locks
//              at once), the host checks the type and that the owner has one of its statuses, the owner removes them all
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/netsync.mjs      (V=1 prints every PASS)
import * as H from './harness.mjs';

const { G, errors, world, scene } = H;
const { Replication } = await H.imp('net/Replication.ts');
const { Player } = await H.imp('entities/Player.ts');
const { PetFollower } = await H.imp('game/Pet.ts');
const { MOUNT_LIFT } = await H.imp('game/Mount.ts');
const { encodePayload, decodePayload } = await H.imp('net/codec.ts');
const { Social } = await H.imp('systems/Social.ts');
const { PARTY_ID_BASE } = await H.imp('types/common.ts');
const { cleanseMovement } = await H.imp('combat/skills/sharedBehaviors.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------------------------------------ fakes

/**
 * A NetSession stand-in as seen from ONE peer: its member table, what it would send (recorded in `sent`) and the handlers it
 * registers. `request()` / `deliver()` play the wire in: a host-side request handler, or a channel message from `from`.
 */
function fakeNet({ self, role, hostId, members, localSlot }) {
  const peers = new Map(members.map((m) => [m.peerId, { peerId: m.peerId, slot: m.slot, name: m.peerId }]));
  const handlers = new Map();
  const requests = new Map();
  const sent = [];
  return {
    selfId: self, role, hostId, localSlot, peers, sceneIsReady: true, sent,
    on(ch, h) {
      const set = handlers.get(ch) ?? new Set();
      set.add(h);
      handlers.set(ch, set);
      return () => set.delete(h);
    },
    onRequest(kind, h) {
      requests.set(kind, h);
      return () => requests.delete(kind);
    },
    sendRequest(kind, data) { sent.push({ op: 'request', kind, data }); },
    sendTo(peer, channel, payload) { sent.push({ op: 'sendTo', to: peer, channel, payload }); },
    broadcast(channel, payload) { sent.push({ op: 'broadcast', channel, payload }); },
    remotePeers() { return [...peers.values()].filter((p) => p.peerId !== self); },
    peerOfEntity(id) {
      const slot = id - PARTY_ID_BASE;
      if (slot === localSlot) return self;
      for (const p of peers.values()) if (p.slot === slot) return p.peerId;
      return null;
    },
    /** A request arrives at the host (NetSession dispatches it to the registered onRequest handler). */
    request(kind, data, from) { requests.get(kind)?.(data, from); },
    /** A channel message arrives from `from` (the host's `cleanse` to the owner). */
    deliver(ch, payload, from) { for (const h of handlers.get(ch) ?? []) h(payload, from); },
  };
}

/** A real remote Player (the class the game builds for a party member), optionally placed in the harness world. */
function remotePlayer(id, slot, name, [x, z], inWorld = false) {
  const p = new Player({ id, slot, classId: 'priest', name, level: 20, isLocal: false, peerId: `p${slot + 1}` });
  p.position.set(x, 0, z);
  if (inWorld) world.add(p);
  return p;
}

/** Hands a remote player to a Replication as if it had been built for `peerId` (the sims skip the async model load). */
function attachRemote(rep, peerId, player) {
  const rec = { peerId, slot: player.id - PARTY_ID_BASE, world, player, added: true, hasPos: true, pet: new PetFollower(player) };
  rep.remotes.set(peerId, rec);
  return rec;
}

/** A pstate as the wire delivers it (typed object, the codec is applied by NetSession and checked in codec.*). */
const pstate = (over = {}) => ({
  x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, anim: 'Idle', hp: 100, maxHp: 100, res: 10, maxRes: 10, dead: false,
  casting: null, level: 20, dodging: false, statuses: [], shot: null, shotSeq: 0, t: G.engine.time, ...over,
});

/** The local character's getSyncState for the sender (FakePlayer is not a Player). */
function localSync(me) {
  me.getSyncState = () => ({
    x: me.position.x, y: 0, z: me.position.z, yaw: 0, vx: 0, vz: 0, anim: 'Idle', hp: 100, maxHp: 100, res: 10, maxRes: 10,
    dead: false, casting: null, level: 30, dodging: false, statuses: me.statuses.list().map((s) => s.id), shot: null, shotSeq: 0,
  });
}

const pstateSends = (net) => net.sent.filter((s) => s.op === 'broadcast' && s.channel === 'pstate');
const cleanseSends = (net) => net.sent.filter((s) => s.op === 'sendTo' && s.channel === 'cleanse');
const cleanseRequests = (net) => net.sent.filter((s) => s.op === 'request' && s.kind === 'cleanse');

// ================================================================================================ mount.*
{
  const me = H.addPlayer('paladin');   // local character, entity id 1 (slot 0)
  localSync(me);
  const net = fakeNet({ self: 'p1', role: 'client', hostId: 'p2', members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }], localSlot: 0 });
  const rep = new Replication(net);
  rep.setActive(true);
  const owner = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [30, 30]);
  attachRemote(rep, 'p2', owner);
  const horses = () => owner.object3d.children.filter((c) => c.name === 'mount_horse').length;

  // sender: the mounted event reaches the next pstate, and the change is not held for the 1 s keep-alive
  G.events.emit('player:mounted', { on: true });
  G.engine.time += 1;
  net.sent.length = 0;
  rep.update(H.DT);
  ok('mount.send the local ride flag goes out with the pstate', pstateSends(net).at(-1)?.payload.mounted === true);
  G.engine.time += 0.2;
  net.sent.length = 0;
  rep.update(H.DT);
  ok('mount.send unchanged: a second pstate inside 0.3 s is not repeated', pstateSends(net).length === 0);
  G.events.emit('player:mounted', { on: false });
  G.engine.time += 0.2;
  net.sent.length = 0;
  rep.update(H.DT);
  ok('mount.send the dismount clears the flag at once', pstateSends(net).at(-1)?.payload.mounted === false);

  // receiver: one horse per remote rider, lifted like the local model, gone when the flag clears
  rep.onPState(pstate({ x: 30, z: 30, mounted: true }), 'p2');
  ok('mount.recv a mounted remote gets one horse and the model lift', horses() === 1 && owner.modelLift === MOUNT_LIFT);
  rep.onPState(pstate({ x: 30, z: 30, mounted: true }), 'p2');
  ok('mount.recv a repeated mounted state adds no second horse', horses() === 1);
  rep.onPState(pstate({ x: 30, z: 30, mounted: false }), 'p2');
  ok('mount.recv dismount removes the horse and the lift', horses() === 0 && owner.modelLift === 0);
  rep.onPState(pstate({ x: 30, z: 30, mounted: 'yes' }), 'p2');
  ok('mount.recv a non-boolean flag is not mounted (strict)', horses() === 0);
  rep.onPState(pstate({ x: 30, z: 30, mounted: true }), 'p2');
  G.events.emit('net:peerLeft', { peerId: 'p2' });
  ok('mount.recv a peer that leaves takes its horse away', horses() === 0 && owner.modelLift === 0);
  rep.dispose();
}

// ================================================================================================ codec.*
{
  const base = { x: 1, y: 2, z: 3, yaw: 0.5, vx: 0, vz: 0, anim: 'Run', hp: 5, maxHp: 9, res: 1, maxRes: 2, casting: null, level: 3,
    statuses: ['slow'], shot: null, shotSeq: 2, t: 7.5, id: 2 };
  const wire = encodePayload('pstate', { ...base, dead: false, dodging: true, mounted: true });
  const back = decodePayload('pstate', wire);
  ok('codec.mounted round trip, other flags kept', back.mounted === true && back.dodging === true && back.dead === false);
  ok('codec.flags: dodging 2 + mounted 4', wire[11] === 6, `flags=${wire[11]}`);
  const off = decodePayload('pstate', encodePayload('pstate', { ...base, dead: true, dodging: false, mounted: false }));
  ok('codec.not mounted reads false, dead kept', off.mounted === false && off.dead === true);
  const old = decodePayload('pstate', [1, 2, 3, 0.5, 0, 0, 'Run', 5, 9, 1, 2, 1, null, 3, ['slow'], null, 2, 7.5, 2]);
  ok('codec.old wire (flags without bit 4) decodes unmounted', old.mounted === false && old.dead === true);
}

// ================================================================================================ pet.*
// Real Social over a fake lobby (JSON-cloned messages, the same shape systems/social.mjs uses). Alp is the local player.
{
  const clock = { t: 1_700_000_000_000 };
  const advance = (s) => { clock.t += s * 1000; };
  const lobby = { trs: new Map(), queue: [] };
  const flush = () => {
    let guard = 0;
    while (lobby.queue.length && guard++ < 10000) {
      const m = lobby.queue.shift();
      const t = lobby.trs.get(m.to);
      if (!t) continue;
      for (const h of t.handlers.get(m.channel) ?? []) h(JSON.parse(m.json), { from: m.from, channel: m.channel, receivedAt: 0, loopback: false });
    }
  };
  const join = (id) => {
    const tr = {
      selfId: id, kind: 'local', roomId: 'lobby', state: 'open', handlers: new Map(), joinH: [], leaveH: [],
      getPeers: () => [...lobby.trs.keys()].filter((k) => k !== id),
      hasPeer: (p) => lobby.trs.has(p),
      send(channel, data, opts = {}) {
        const json = JSON.stringify(data);
        for (const to of opts.to ? [].concat(opts.to) : tr.getPeers()) lobby.queue.push({ to, from: id, channel, json });
      },
      on(channel, h) { const set = tr.handlers.get(channel) ?? new Set(); set.add(h); tr.handlers.set(channel, set); return () => set.delete(h); },
      onPeerJoin(h) { tr.joinH.push(h); for (const p of tr.getPeers()) h(p); return () => {}; },
      onPeerLeave(h) { tr.leaveH.push(h); return () => {}; },
      onError: () => () => {}, ping: async () => 0, getStats: () => ({}), leave: async () => {},
    };
    for (const other of lobby.trs.values()) other.joinH.forEach((h) => h(id));
    lobby.trs.set(id, tr);
    return tr;
  };
  const makeLobbyPeer = (id, name, pet) => {
    const me = { name, cls: 'knight', level: 10, zone: 'town', zoneName: 'Kuzgunkale', pet };
    const ctx = { self: () => ({ ...me }), now: () => clock.t, say() {}, changed() {}, expectNetwork: () => true, ignored: () => false };
    const s = new Social(ctx, { autoTick: false });
    const tr = join(id);
    s.wantConnected = true;
    s.attach(tr);
    return { s, me };
  };
  const A = makeLobbyPeer('p1', 'Alp', undefined);
  const B = makeLobbyPeer('p2', 'Bora', 'kuzgun');
  flush();
  A.s.tick(); B.s.tick(); flush();
  ok('pet.presence: the lobby shows Bora with its pet', A.s.find('Bora', false)?.pet === 'kuzgun');

  G.presence = A.s;
  const net = fakeNet({ self: 'p1', role: 'client', hostId: 'p2', members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }], localSlot: 0 });
  const rep = new Replication(net);
  rep.setActive(true);
  const bob = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [10, 10], true);
  const rec = attachRemote(rep, 'p2', bob);
  rep.update(H.DT);
  ok('pet.remote follower takes the presence pet', rec.pet.current === 'kuzgun');
  const root = () => rec.pet.model?.root;
  ok('pet.model is in the scene', !!root() && root().parent === scene);

  // follows: behind (1.2 m) and beside (0.9 m) of the owner's yaw (0 = +Z forward)
  bob.position.set(10, 0, 10);
  bob.yaw = 0;
  for (let i = 0; i < 180; i++) rec.pet.update(1 / 60);
  ok('pet.follows its owner: behind and beside', near(root().position.x, 10.9, 0.06) && near(root().position.z, 8.8, 0.06), `at ${root().position.x.toFixed(2)},${root().position.z.toFixed(2)}`);
  bob.position.set(40, 0, -5);
  bob.yaw = Math.PI / 2;
  for (let i = 0; i < 180; i++) rec.pet.update(1 / 60);
  ok('pet.follows a turning owner', near(root().position.x, 38.8, 0.06) && near(root().position.z, -5.9, 0.06), `at ${root().position.x.toFixed(2)},${root().position.z.toFixed(2)}`);

  // hides with its owner and does not slide in from the origin when the owner shows again
  bob.object3d.visible = false;
  rec.pet.update(1 / 60);
  ok('pet.hidden while its owner is hidden', root().visible === false);
  bob.position.set(-20, 0, 5);
  bob.yaw = 0;
  bob.object3d.visible = true;
  rec.pet.update(1 / 60);
  ok('pet.reappears at the owner (no slide from the origin)', near(root().position.x, -19.1, 0.05) && near(root().position.z, 3.8, 0.05), `at ${root().position.x.toFixed(2)},${root().position.z.toFixed(2)}`);

  // presence changes: dismissed, summoned again, then the presence expires
  const shown = root();
  B.me.pet = undefined;
  advance(2);
  B.s.poke();
  flush();
  G.engine.time += 1.1;
  rep.update(H.DT);
  ok('pet.dismissed by the owner: the follower goes', rec.pet.current === null && shown.parent === null);
  B.me.pet = 'tas_peri';
  advance(2);
  B.s.poke();
  flush();
  G.engine.time += 1.1;
  rep.update(H.DT);
  ok('pet.summoned again: a new pet appears', rec.pet.current === 'tas_peri' && root().parent === scene);
  advance(25);
  A.s.tick();
  G.engine.time += 1.1;
  rep.update(H.DT);
  ok('pet.presence expired: the follower goes', A.s.find('Bora', false) === null && rec.pet.current === null);

  // scene change: the follower is released with the old world
  B.me.pet = 'kuzgun';
  advance(2);
  B.s.poke();
  flush();
  G.engine.time += 1.1;
  rep.update(H.DT);
  const old = root();
  G.events.emit('scene:leaving', { from: 'town', to: 'dungeon' });
  ok('pet.scene change releases the remote follower', rep.remotes.size === 0 && old.parent === null && rec.pet.current === null);
  rep.dispose();
  G.presence = undefined;
  world.remove(bob);
}

// ================================================================================================ cleanse.*
const SLOW = 'slow';
{
  // ---- caster side: this peer's dispel on a REMOTE party member asks the host (and only for a dispellable debuff)
  H.addPlayer('paladin');
  const me = G.player;
  localSync(me);
  const owner = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [20, 20], true);
  owner.statuses.apply(SLOW, 5);
  owner.statuses.apply('stun', 2);
  owner.statuses.apply('poison', 5);
  owner.statuses.apply('haste', 10);
  const net = fakeNet({
    self: 'p1', role: 'client', hostId: 'p3',
    members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }], localSlot: 0,
  });
  const rep = new Replication(net);
  rep.setActive(true);
  attachRemote(rep, 'p2', owner);

  owner.statuses.dispel(SLOW);
  const r1 = cleanseRequests(net);
  ok('cleanse.caster: a dispel on a remote debuff asks the host', r1.length === 1 && r1[0].data.target === PARTY_ID_BASE + 1 && r1[0].data.status === SLOW, JSON.stringify(r1));
  net.sent.length = 0;
  owner.statuses.dispel('stun');
  ok('cleanse.caster: a non-dispellable status is not asked', cleanseRequests(net).length === 0);
  owner.statuses.apply('haste', 10);
  owner.statuses.dispel('haste');
  ok('cleanse.caster: a buff is not asked', cleanseRequests(net).length === 0);
  owner.statuses.apply('slow', 5);
  owner.statuses.remove('slow');
  ok('cleanse.caster: a plain removal (not a dispel) is not asked', cleanseRequests(net).length === 0);
  me.statuses.apply('poison', 5);
  me.statuses.dispel('poison');
  ok('cleanse.caster: a dispel on yourself is not asked (local)', cleanseRequests(net).length === 0);
  owner.statuses.dispel('poison');
  ok('cleanse.caster: a valid dispel after the refusals is asked again', cleanseRequests(net).length === 1);
  rep.dispose();
}

{
  // ---- host side: validation, rate limit, the host's own character as owner
  H.addPlayer('paladin');
  const stub = new H.FakePlayer('paladin');   // the host's own character: slot 2 (entity id 3), not in the world
  stub.id = PARTY_ID_BASE + 2;
  stub.position.set(20, 0, 20);
  stub.statuses.apply(SLOW, 5);
  G.player = stub;
  const net = fakeNet({
    self: 'p3', role: 'host', hostId: 'p3', localSlot: 2,
    members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }, { peerId: 'p4', slot: 3 }],
  });
  const rep = new Replication(net);
  rep.setActive(true);
  const owner = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [20, 20]);
  attachRemote(rep, 'p2', owner);
  attachRemote(rep, 'p1', remotePlayer(PARTY_ID_BASE, 0, 'Alp', [25, 20]));
  attachRemote(rep, 'p4', remotePlayer(PARTY_ID_BASE + 3, 3, 'Cem', [25, 20]));
  rep.onPState(pstate({ x: 20, z: 20, statuses: [SLOW, 'stun', 'poison', 'haste'] }), 'p2');
  rep.onPState(pstate({ x: 25, z: 20 }), 'p1');
  rep.onPState(pstate({ x: 25, z: 20 }), 'p4');
  const ask = (data, from = 'p1') => { net.sent.length = 0; net.request('cleanse', data, from); return cleanseSends(net); };
  const at = (dt) => { G.engine.time += dt; };

  let s = ask({ target: PARTY_ID_BASE + 1, status: SLOW });
  ok('cleanse.host valid: passes to the owner as `cleanse`', s.length === 1 && s[0].to === 'p2' && s[0].payload.id === PARTY_ID_BASE + 1 && s[0].payload.status === SLOW && s[0].payload.by === PARTY_ID_BASE, JSON.stringify(s));

  const refused = (name, data, from = 'p1') => { at(0.5); ok(`cleanse.refused ${name}`, ask(data, from).length === 0); };
  refused('a non-dispellable status (stun)', { target: PARTY_ID_BASE + 1, status: 'stun' });
  refused('a buff (haste)', { target: PARTY_ID_BASE + 1, status: 'haste' });
  refused('an unknown status', { target: PARTY_ID_BASE + 1, status: 'nope' });
  refused('an inherited key (constructor)', { target: PARTY_ID_BASE + 1, status: 'constructor' });
  refused('an inherited key (__proto__)', { target: PARTY_ID_BASE + 1, status: '__proto__' });
  refused('a debuff the owner does not have (burn)', { target: PARTY_ID_BASE + 1, status: 'burn' });
  refused('a target outside the party range', { target: 999, status: SLOW });
  refused('a target that is the caster itself', { target: PARTY_ID_BASE, status: SLOW });
  refused('a non-integer target', { target: 2.5, status: SLOW });
  refused('a non-number target', { target: 'abc', status: SLOW });
  refused('an empty request', {});
  refused('a caster that is not in the party', { target: PARTY_ID_BASE + 1, status: SLOW }, 'stranger');
  rep.onPState(pstate({ x: 200, z: 20 }), 'p1');
  refused('a caster out of range (200 m)', { target: PARTY_ID_BASE + 1, status: SLOW });
  rep.onPState(pstate({ x: 25, z: 20 }), 'p1');
  rep.onPState(pstate({ x: 20, z: 20, dead: true, statuses: [SLOW] }), 'p2');
  refused('an owner that is dead', { target: PARTY_ID_BASE + 1, status: SLOW });
  rep.onPState(pstate({ x: 20, z: 20, statuses: [SLOW, 'stun', 'poison', 'haste'] }), 'p2');
  rep.onPState(pstate({ x: 25, z: 20, dead: true }), 'p1');
  refused('a dead caster', { target: PARTY_ID_BASE + 1, status: SLOW });
  rep.onPState(pstate({ x: 25, z: 20 }), 'p1');
  ok('cleanse.host back to valid: the caster is accepted again', ask({ target: PARTY_ID_BASE + 1, status: SLOW }).length === 1);

  // rate limit: a burst of 8 per caster, then 4 a second
  at(10);
  net.sent.length = 0;
  for (let i = 0; i < 20; i++) net.request('cleanse', { target: PARTY_ID_BASE + 1, status: 'poison' }, 'p4');
  ok('cleanse.rate: a burst passes 8 of 20', cleanseSends(net).length === 8, `n=${cleanseSends(net).length}`);
  at(1);
  net.sent.length = 0;
  for (let i = 0; i < 10; i++) net.request('cleanse', { target: PARTY_ID_BASE + 1, status: 'poison' }, 'p4');
  ok('cleanse.rate: one second gives 4 more', cleanseSends(net).length === 4, `n=${cleanseSends(net).length}`);

  // the host's own character as owner: the host removes it itself, no message on the wire
  at(10);
  net.sent.length = 0;
  net.request('cleanse', { target: PARTY_ID_BASE + 2, status: SLOW }, 'p1');
  ok('cleanse.host owner: removed on the host itself, nothing sent', stub.statuses.get(SLOW) === undefined && cleanseSends(net).length === 0);
  rep.dispose();
  G.player = undefined;
}

{
  // ---- owner side: the host's `cleanse` removes the debuff from our own character, only from the host, only for us
  const me = H.addPlayer('priest');
  world.remove(me);            // the world is keyed by id: leave it (removals apply on update) before the id changes to the owner's slot
  world.update(0);
  me.id = PARTY_ID_BASE + 1;
  world.add(me);               // back in the world under the owner's entity id (sendPState needs it)
  localSync(me);
  me.statuses.apply(SLOW, 5);
  me.statuses.apply('stun', 2);
  me.statuses.apply('poison', 5);
  const net = fakeNet({ self: 'p2', role: 'client', hostId: 'p3', members: [{ peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }], localSlot: 1 });
  const rep = new Replication(net);
  rep.setActive(true);

  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, status: SLOW, by: PARTY_ID_BASE }, 'p1');
  ok('cleanse.owner refused when it is not from the host', me.statuses.get(SLOW) !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 2, status: SLOW, by: PARTY_ID_BASE }, 'p3');
  ok('cleanse.owner refused for another entity', me.statuses.get(SLOW) !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, status: 'stun', by: PARTY_ID_BASE }, 'p3');
  ok('cleanse.owner refused for a non-dispellable status', me.statuses.get('stun') !== undefined);
  net.deliver('cleanse', { id: String(PARTY_ID_BASE + 1), status: SLOW, by: PARTY_ID_BASE }, 'p3');
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, status: 42, by: PARTY_ID_BASE }, 'p3');
  net.deliver('cleanse', null, 'p3');
  ok('cleanse.owner refused for junk payloads', me.statuses.get(SLOW) !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, status: SLOW, by: PARTY_ID_BASE }, 'p3');
  ok('cleanse.owner removes the debuff from its own character', me.statuses.get(SLOW) === undefined && me.statuses.get('poison') !== undefined);

  // the owner's next pstate carries the new list (what the caster's copy follows)
  net.sent.length = 0;
  G.engine.time += 1;
  rep.update(H.DT);
  const sentStatuses = pstateSends(net).at(-1)?.payload.statuses ?? [];
  ok('cleanse.owner: the next pstate no longer lists the removed debuff', !sentStatuses.includes(SLOW) && sentStatuses.includes('poison'), JSON.stringify(sentStatuses));
  rep.dispose();
}

{
  // ---- caster's copy: the owner's pstate after the removal takes the debuff off the remote copy too
  H.addPlayer('paladin');
  const net = fakeNet({
    self: 'p1', role: 'client', hostId: 'p3',
    members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }], localSlot: 0,
  });
  const rep = new Replication(net);
  rep.setActive(true);
  const copy = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [20, 20], true);
  attachRemote(rep, 'p2', copy);
  rep.onPState(pstate({ x: 20, z: 20, statuses: [SLOW, 'poison'] }), 'p2');
  ok('cleanse.copy shows the debuff before the removal', copy.statuses.get(SLOW) !== undefined);
  rep.onPState(pstate({ x: 20, z: 20, statuses: ['poison'] }), 'p2');
  ok('cleanse.copy follows the owner: the removed debuff leaves the remote copy', copy.statuses.get(SLOW) === undefined && copy.statuses.get('poison') !== undefined);
  rep.dispose();
  world.remove(copy);
}

// ================================================================================================ movement.*
{
  // ---- caster side (Özgürlük Duası on a remote ally): one typed request, the copy loses the locks at once
  H.addPlayer('paladin');
  const me = G.player;
  localSync(me);
  const net = fakeNet({
    self: 'p1', role: 'client', hostId: 'p3',
    members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }], localSlot: 0,
  });
  const rep = new Replication(net);
  rep.setActive(true);
  const copy = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [20, 20], true);
  copy.statuses.apply(SLOW, 5);
  copy.statuses.apply('root', 4);
  copy.statuses.apply('stun', 2);
  copy.statuses.apply('poison', 5);
  const prevNet = G.net;
  G.net = net;
  cleanseMovement(copy);
  const r1 = cleanseRequests(net);
  ok('movement.caster: a remote ally gets one request, typed movement', r1.length === 1 && r1[0].data.target === PARTY_ID_BASE + 1 && r1[0].data.type === 'movement' && r1[0].data.status === undefined, JSON.stringify(r1));
  ok('movement.caster: the copy loses root and slow at once, keeps stun and poison', copy.statuses.get(SLOW) === undefined && copy.statuses.get('root') === undefined && copy.statuses.get('stun') !== undefined && copy.statuses.get('poison') !== undefined);
  net.sent.length = 0;
  cleanseMovement(copy);
  ok('movement.caster: nothing left to remove, nothing sent', cleanseRequests(net).length === 0 && net.sent.length === 0);
  me.statuses.apply(SLOW, 5);
  cleanseMovement(me);
  ok('movement.caster: a local ally is a plain removal, no request', me.statuses.get(SLOW) === undefined && net.sent.length === 0);
  G.net = prevNet;
  rep.dispose();
  world.remove(copy);
}

{
  // ---- host side: a typed request passes when the owner has ANY status of the type; unknown and inherited types are refused
  H.addPlayer('paladin');
  const stub = new H.FakePlayer('paladin');   // the host's own character: slot 2 (entity id 3), not in the world
  stub.id = PARTY_ID_BASE + 2;
  stub.position.set(20, 0, 20);
  stub.statuses.apply(SLOW, 5);
  stub.statuses.apply('root', 5);
  G.player = stub;
  const net = fakeNet({
    self: 'p3', role: 'host', hostId: 'p3', localSlot: 2,
    members: [{ peerId: 'p1', slot: 0 }, { peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }],
  });
  const rep = new Replication(net);
  rep.setActive(true);
  const owner = remotePlayer(PARTY_ID_BASE + 1, 1, 'Bora', [20, 20]);
  attachRemote(rep, 'p2', owner);
  attachRemote(rep, 'p1', remotePlayer(PARTY_ID_BASE, 0, 'Alp', [25, 20]));
  rep.onPState(pstate({ x: 20, z: 20, statuses: [SLOW, 'stun', 'poison'] }), 'p2');
  rep.onPState(pstate({ x: 25, z: 20 }), 'p1');
  const ask = (data, from = 'p1') => { net.sent.length = 0; net.request('cleanse', data, from); return cleanseSends(net); };
  const at = (dt) => { G.engine.time += dt; };

  let s = ask({ target: PARTY_ID_BASE + 1, type: 'movement' });
  ok('movement.host valid: the owner gets `cleanse` with the type', s.length === 1 && s[0].to === 'p2' && s[0].payload.id === PARTY_ID_BASE + 1 && s[0].payload.type === 'movement' && s[0].payload.status === undefined && s[0].payload.by === PARTY_ID_BASE, JSON.stringify(s));
  const refused = (name, data, from = 'p1') => { at(0.5); ok(`movement.refused ${name}`, ask(data, from).length === 0); };
  refused('an unknown type', { target: PARTY_ID_BASE + 1, type: 'nope' });
  refused('an inherited key as type (constructor)', { target: PARTY_ID_BASE + 1, type: 'constructor' });
  refused('an inherited key as type (__proto__)', { target: PARTY_ID_BASE + 1, type: '__proto__' });
  refused('a status id given as a type (stun)', { target: PARTY_ID_BASE + 1, type: 'stun' });
  refused('a non-string type', { target: PARTY_ID_BASE + 1, type: 42 });
  rep.onPState(pstate({ x: 20, z: 20, statuses: ['stun', 'poison'] }), 'p2');
  refused('an owner with no status of the type', { target: PARTY_ID_BASE + 1, type: 'movement' });
  rep.onPState(pstate({ x: 20, z: 20, statuses: ['root'] }), 'p2');
  ok('movement.host: one status of the type (root alone) is enough', ask({ target: PARTY_ID_BASE + 1, type: 'movement' }).length === 1);

  // the host's own character: removed on the host itself, nothing on the wire
  at(10);
  net.sent.length = 0;
  net.request('cleanse', { target: PARTY_ID_BASE + 2, type: 'movement' }, 'p1');
  ok('movement.host owner: the host removes the locks itself, nothing sent', stub.statuses.get(SLOW) === undefined && stub.statuses.get('root') === undefined && cleanseSends(net).length === 0);
  rep.dispose();
  G.player = undefined;
}

{
  // ---- owner side: the host's typed `cleanse` removes every status of the type from our own character, and only that
  const me = H.addPlayer('priest');
  world.remove(me);
  world.update(0);
  me.id = PARTY_ID_BASE + 1;
  world.add(me);
  localSync(me);
  me.statuses.apply(SLOW, 5);
  me.statuses.apply('root', 4);
  me.statuses.apply('stun', 2);
  me.statuses.apply('poison', 5);
  const net = fakeNet({ self: 'p2', role: 'client', hostId: 'p3', members: [{ peerId: 'p2', slot: 1 }, { peerId: 'p3', slot: 2 }], localSlot: 1 });
  const rep = new Replication(net);
  rep.setActive(true);

  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, type: 'movement', by: PARTY_ID_BASE }, 'p1');
  ok('movement.owner refused when it is not from the host', me.statuses.get(SLOW) !== undefined && me.statuses.get('root') !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 2, type: 'movement', by: PARTY_ID_BASE }, 'p3');
  ok('movement.owner refused for another entity', me.statuses.get(SLOW) !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, type: 'constructor', by: PARTY_ID_BASE }, 'p3');
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, type: 'stun', by: PARTY_ID_BASE }, 'p3');
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, type: 42, by: PARTY_ID_BASE }, 'p3');
  ok('movement.owner refused for an unknown or junk type', me.statuses.get(SLOW) !== undefined && me.statuses.get('stun') !== undefined);
  net.deliver('cleanse', { id: PARTY_ID_BASE + 1, type: 'movement', by: PARTY_ID_BASE }, 'p3');
  ok('movement.owner removes root and slow, keeps stun and poison', me.statuses.get(SLOW) === undefined && me.statuses.get('root') === undefined && me.statuses.get('stun') !== undefined && me.statuses.get('poison') !== undefined);
  rep.dispose();
}

// ---------------------------------------------------------------------------------------------- report
G.player = undefined;
const total = passes + fails;
console.log(fails === 0 && errors.length === 0 ? `\nnetsync: ${passes} passed, 0 failed (${total} checks)` : `\nnetsync: ${passes} passed, ${fails} FAILED`);
if (errors.length) for (const m of errors.slice(0, 8)) console.log('   !!', String(m).slice(0, 300));
H.restoreConsole?.();
process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
