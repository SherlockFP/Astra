// LONCA (WP-05) headless check: serverless guilds on the global lobby (src/systems/Guild.ts + GuildCore.ts).
// No browser, no network: the real Guild + Social services, real CharacterState (gold / save), real WebCrypto, a fake lobby network
// (JSON-cloned messages, ordered queue, peers can leave and return) and a fake clock.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/guild.mjs      (V=1 prints every PASS)
// Stages: core.* (keys, signatures, roster verification, forgeries, ordering, key wrap, permissions) | flow.* (create, invite, accept,
//         decline, ranks, kick, leave, rotation) | chat.* (encryption, spoofing, replay, flood) | gossip.* (version convergence, hostile
//         rosters) | save.* (re-login, tampered save) | disband.*
import * as H from './harness.mjs';

const { G } = H;
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { Social } = await H.imp('systems/Social.ts');
const { Guild } = await H.imp('systems/Guild.ts');
const C = await H.imp('systems/GuildCore.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------ fakes
class FakeNet {
  constructor() {
    this.trs = new Map();
    this.queue = [];
    this.sent = [];
  }
  join(id) {
    const tr = new FakeTr(this, id);
    for (const other of this.trs.values()) other.joinHandlers.forEach((h) => h(id));
    this.trs.set(id, tr);
    return tr;
  }
  leave(id) {
    this.trs.delete(id);
    for (const other of this.trs.values()) other.leaveHandlers.forEach((h) => h(id));
  }
  inject(from, to, channel, data) {
    this.queue.push({ to, from, channel, json: JSON.stringify(data) });
  }
  async flush() {
    let guard = 0;
    while (this.queue.length && guard++ < 100000) {
      const m = this.queue.shift();
      const target = this.trs.get(m.to);
      if (!target) continue;
      for (const h of target.handlers.get(m.channel) ?? []) h(JSON.parse(m.json), { from: m.from, channel: m.channel, receivedAt: 0, loopback: false });
    }
  }
}
class FakeTr {
  constructor(net, id) {
    this.net = net; this.selfId = id; this.kind = 'local'; this.roomId = 'fake'; this.state = 'open';
    this.handlers = new Map(); this.joinHandlers = []; this.leaveHandlers = [];
  }
  getPeers() { return [...this.net.trs.keys()].filter((k) => k !== this.selfId); }
  hasPeer(p) { return this.net.trs.has(p); }
  send(channel, data, opts = {}) {
    const json = JSON.stringify(data);
    this.net.sent.push({ channel, json, from: this.selfId, to: opts.to ?? null });
    const targets = opts.to ? [].concat(opts.to) : this.getPeers();
    for (const to of targets) this.net.queue.push({ to, from: this.selfId, channel, json });
  }
  on(channel, h) {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(h); this.handlers.set(channel, set);
    return () => set.delete(h);
  }
  onPeerJoin(h) { this.joinHandlers.push(h); for (const p of this.getPeers()) h(p); return () => {}; }
  onPeerLeave(h) { this.leaveHandlers.push(h); return () => {}; }
  onError() { return () => {}; }
  async ping() { return 0; }
  getStats() { return {}; }
  async leave() {}
}

const clock = { t: 1_700_000_000_000 };
const advance = (s) => { clock.t += s * 1000; };
let idc = 0;

function makePeer(net, id, name, { level = 12, gold = 10000 } = {}) {
  const ch = CharacterState.create(name, 'knight');
  ch.save.level = level;
  ch.save.gold = gold;
  const peer = { id, name, ch, lines: [], prompts: [], answer: true, opened: 0, changes: 0, net };
  const sctx = {
    self: () => ({ name, cls: 'knight', level: ch.save.level, zone: 'town', zoneName: 'Kuzgunkale' }),
    now: () => clock.t,
    say: (l) => peer.lines.push(l),
    changed: () => {},
    expectNetwork: () => true,
    ignored: () => false,
    guild: () => peer.guild.presenceInfo(),
  };
  peer.social = new Social(sctx, { autoTick: false });
  const gctx = {
    character: () => ch,
    now: () => clock.t,
    say: (l) => peer.lines.push(l),
    changed: () => { peer.changes++; },
    presence: () => peer.social,
    poke: () => peer.social.poke(),
    prompt: async (t) => { peer.prompts.push(t); return peer.answer; },
    expectNetwork: () => true,
    openPanel: () => { peer.opened++; },
    newId: () => 'inv' + (++idc),
  };
  peer.gctx = gctx;
  peer.guild = new Guild(gctx, { autoTick: false });
  peer.online = false;
  connect(peer);
  return peer;
}

function connect(peer) {
  const tr = peer.net.join(peer.id);
  peer.tr = tr;
  peer.social.wantConnected = true;
  peer.social.attach(tr);
  peer.guild.attach(tr);
  peer.social.onGuildPresence = (e) => peer.guild.onPeerGuild(e);
  peer.online = true;
}
function disconnect(peer) {
  peer.net.leave(peer.id);
  peer.social.detach();
  peer.guild.detach();
  peer.online = false;
}

async function settle(net, peers, maxRounds = 16) {
  let quiet = 0;
  for (let i = 0; i < maxRounds && quiet < 3; i++) {
    advance(1.1);
    for (const p of peers) if (p.online) { p.social.tick(); p.guild.tick(); }
    const before = net.sent.length;
    await net.flush();
    await sleep(15);
    await net.flush();
    if (net.queue.length === 0 && net.sent.length === before) quiet++;
    else quiet = 0;
  }
}
const chatLines = (p) => p.lines.filter((l) => l.channel === 'guild');
const sys = (p) => p.lines.filter((l) => l.channel === 'system').map((l) => l.text);
const rosterNames = (p) => p.guild.vr?.body.m.map((m) => `${m.n}:${m.r}`).sort().join(',') ?? '';

// ================================================================================================ core.*
{
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  ok('core.b64u roundtrip', JSON.stringify([...C.unb64u(C.b64u(bytes))]) === JSON.stringify([...bytes]));
  ok('core.b64u rejects junk', C.unb64u('a b') === null && C.unb64u('a') === null && C.unb64u(5) === null);
  ok('core.crypto available', C.guildCryptoAvailable());
  const gid = C.newGuildId();
  ok('core.guild id is 128 random bits', /^[0-9a-f]{32}$/.test(gid) && gid !== C.newGuildId());

  const L = await C.generateMemberKey();
  const O = await C.generateMemberKey();
  const M = await C.generateMemberKey();
  const X = await C.generateMemberKey();
  ok('core.member key = 65 byte raw point', C.isPk(L.pub) && C.unb64u(L.pub).length === 65 && C.unb64u(L.pub)[0] === 4);
  const sig = await C.signText(L.priv, 'hello');
  ok('core.sign / verify', C.isSig(sig) && (await C.verifySig(L.pub, 'hello', sig)));
  ok('core.verify rejects other text / other key / garbage', !(await C.verifySig(L.pub, 'hellO', sig)) && !(await C.verifySig(O.pub, 'hello', sig)) && !(await C.verifySig(L.pub, 'hello', 'x')) && !(await C.verifySig('nope', 'hello', sig)));

  const key = C.newChatKey();
  const kh = await C.keyHash(key);
  const mkBody = async (over = {}) => {
    const m = over.m ?? [{ n: 'Lider', r: 0, pk: L.pub }, { n: 'Subay', r: 1, pk: O.pub }, { n: 'Uye', r: 2, pk: M.pub }];
    const ep = over.ep ?? 1;
    return { v: 1, gid, name: 'Kara Kartallar', ep, rev: over.rev ?? 3, lead: L.pub, kv: 1, kh, ts: 1, m, oc: over.oc ?? (await C.issueCerts(L.priv, gid, m, ep)), ...(over.extra ?? {}) };
  };
  const body = await mkBody();
  const byLeader = await C.signRoster(body, L.priv, L.pub);
  const byOfficer = await C.signRoster(body, O.priv, O.pub);
  const v1 = await C.verifyRoster(byLeader);
  ok('core.roster signed by leader verifies', v1.ok && v1.v.leaderSigned && v1.v.body.m.length === 3);
  const v2 = await C.verifyRoster(byOfficer);
  ok('core.roster signed by an officer (cert) verifies', v2.ok && !v2.v.leaderSigned);
  ok('core.rank-2 member cannot sign', !(await C.verifyRoster(await C.signRoster(body, M.priv, M.pub))).ok);
  ok('core.outsider key cannot sign', !(await C.verifyRoster(await C.signRoster(body, X.priv, X.pub))).ok);
  ok('core.outsider claiming the leader key fails the signature', !(await C.verifyRoster({ ...byLeader, s: (await C.signRoster(body, X.priv, X.pub)).s })).ok);
  ok('core.tampered body fails', (await C.verifyRoster({ ...byLeader, b: byLeader.b.replace('Kara Kartallar', 'Kara Kartallax') })).ok === false);
  ok('core.tampered signature fails', !(await C.verifyRoster({ ...byLeader, s: sig })).ok);
  ok('core.pinned leader / gid enforced', !(await C.verifyRoster(byLeader, { lead: O.pub })).ok && !(await C.verifyRoster(byLeader, { gid: C.newGuildId() })).ok && (await C.verifyRoster(byLeader, { gid, lead: L.pub })).ok);
  for (const [n, bad] of Object.entries({ null: null, num: 5, empty: {}, noSig: { b: byLeader.b, k: L.pub }, bigText: { ...byLeader, b: 'x'.repeat(20000) }, badJson: { ...byLeader, b: '{' } })) {
    ok('core.garbage roster rejected: ' + n, !(await C.verifyRoster(bad)).ok);
  }

  // officer forgeries
  const fakeCert = await C.issueCerts(X.priv, gid, body.m, 1); // certs signed by a non-leader
  ok('core.cert signed by a non-leader rejected', !(await C.verifyRoster(await C.signRoster(await mkBody({ oc: fakeCert }), O.priv, O.pub))).ok);
  const mWith2 = [...body.m, { n: 'Subay2', r: 1, pk: X.pub }];
  const oc1 = await C.issueCerts(L.priv, gid, body.m, 1);
  ok('core.officer cannot add an officer (no cert / hash mismatch)', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: mWith2, oc: oc1 }), O.priv, O.pub))).ok);
  const oc2 = await C.issueCerts(L.priv, gid, mWith2, 1);
  const mDrop = body.m.map((x) => (x.n === 'Subay' ? { ...x, r: 2 } : x));
  ok('core.officer cannot demote itself into a forged set (cert hash)', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: mDrop, oc: oc1 }), O.priv, O.pub))).ok);
  ok('core.leader can add an officer with fresh certs', (await C.verifyRoster(await C.signRoster(await mkBody({ m: mWith2, oc: oc2 }), L.priv, L.pub))).ok);
  ok('core.cert of an older epoch rejected', !(await C.verifyRoster(await C.signRoster(await mkBody({ ep: 2, oc: oc1 }), O.priv, O.pub))).ok);
  const dis = { ...body, dis: 1, m: [body.m[0]], oc: [] };
  ok('core.disband needs the leader', (await C.verifyRoster(await C.signRoster(dis, L.priv, L.pub))).ok && !(await C.verifyRoster(await C.signRoster(dis, O.priv, O.pub))).ok);
  ok('core.duplicate member names / keys rejected', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: [...body.m, { n: 'uye', r: 2, pk: X.pub }] }), L.priv, L.pub))).ok && !(await C.verifyRoster(await C.signRoster(await mkBody({ m: [...body.m, { n: 'Yeni', r: 2, pk: M.pub }] }), L.priv, L.pub))).ok);
  ok('core.two leaders rejected', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: [...body.m, { n: 'Hile', r: 0, pk: X.pub }] }), L.priv, L.pub))).ok);
  ok('core.leader record must carry the leader key', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: [{ n: 'Lider', r: 0, pk: X.pub }, ...body.m.slice(1)] }), L.priv, L.pub))).ok);
  ok('core.too many members rejected', !(await C.verifyRoster(await C.signRoster(await mkBody({ m: [body.m[0], ...Array.from({ length: 45 }, (_, i) => ({ n: 'U' + i, r: 2, pk: i === 0 ? M.pub : C.b64u(new Uint8Array(65).fill(i + 5)) }))] }), L.priv, L.pub))).ok);

  // ordering + transitions
  const mk = async (ep, rev, signer = 'L') => {
    const b = await mkBody({ ep, rev });
    const r = await C.verifyRoster(signer === 'L' ? await C.signRoster(b, L.priv, L.pub) : await C.signRoster(b, O.priv, O.pub));
    return r.v;
  };
  const a = await mk(1, 3), b = await mk(1, 4), c = await mk(2, 1), od = await mk(1, 4, 'O');
  ok('core.order: rev', C.isNewer(b, a) && !C.isNewer(a, b));
  ok('core.order: epoch beats rev', C.isNewer(c, b) && !C.isNewer(b, c));
  ok('core.order: leader-signed beats officer-signed at the same version', C.isNewer(b, od) && !C.isNewer(od, b));
  ok('core.order: same roster is not newer', !C.isNewer(a, a) && C.isNewer(a, null));
  ok('core.rosterVersion monotonic', C.rosterVersion(c.body) > C.rosterVersion(b.body) && C.rosterVersion(b.body) > C.rosterVersion(a.body));
  ok('core.transition: ok / rename / leader / disbanded / pk swap / kv jump',
    C.checkTransition(a.body, b.body) === null
    && C.checkTransition(a.body, { ...b.body, name: 'Baska' }) === 'name'
    && C.checkTransition(a.body, { ...b.body, lead: O.pub }) === 'leader'
    && C.checkTransition({ ...a.body, dis: 1 }, b.body) === 'disbanded'
    && C.checkTransition(a.body, { ...b.body, m: b.body.m.map((x) => (x.n === 'Uye' ? { ...x, pk: X.pub } : x)) }) === 'member key'
    && C.checkTransition(a.body, { ...b.body, kv: 5 }) === 'kv' && C.checkTransition(a.body, { ...b.body, kv: 2 }) === null);

  // key wrap + AEAD
  const w = await C.wrapKey(key, M.pub);
  ok('core.wrap: only the recipient unwraps', (await C.unwrapKey(w, M.priv, M.pub)) === key && (await C.unwrapKey(w, X.priv, X.pub)) === null && (await C.unwrapKey(w, O.priv, O.pub)) === null);
  ok('core.wrap: tampered ciphertext / junk rejected', (await C.unwrapKey({ ...w, ct: w.ct.slice(0, -2) + 'AA' }, M.priv, M.pub)) === null && (await C.unwrapKey({ nope: 1 }, M.priv, M.pub)) === null && (await C.unwrapKey(null, M.priv, M.pub)) === null);
  const e = await C.aesEncrypt(key, 'selam lonca', 'aad1');
  ok('core.aes: roundtrip', (await C.aesDecrypt(key, e.iv, e.ct, 'aad1')) === 'selam lonca');
  ok('core.aes: wrong key / aad / tampering rejected', (await C.aesDecrypt(C.newChatKey(), e.iv, e.ct, 'aad1')) === null && (await C.aesDecrypt(key, e.iv, e.ct, 'aad2')) === null && (await C.aesDecrypt(key, e.iv, e.ct.slice(0, -3) + 'AAA', 'aad1')) === null);
  ok('core.aes: ciphertext hides the text', !e.ct.includes('selam') && !Buffer.from(C.unb64u(e.ct)).toString('latin1').includes('selam'));
  ok('core.key hash stable + key bound', (await C.keyHash(key)) === kh && (await C.keyHash(C.newChatKey())) !== kh);

  // names + permissions
  ok('core.guild name rules', C.cleanGuildName('Kara Kartallar') === 'Kara Kartallar' && C.cleanGuildName('ab') === '' && C.cleanGuildName('x'.repeat(21)) === '' && C.cleanGuildName('<b>x</b>') === '' && C.cleanGuildName("O'Brien-3") === "O'Brien-3" && C.cleanGuildName('Şahin Ocağı') === 'Şahin Ocağı' && C.cleanGuildName(' -x ') === '' && C.cleanGuildName(5) === '' && C.cleanGuildName('a\u0000bc') === 'abc');
  ok('core.perm: invite', C.canInvite(0) && C.canInvite(1) && !C.canInvite(2));
  ok('core.perm: kick', C.canKick(0, 1) && C.canKick(0, 2) && !C.canKick(0, 0) && C.canKick(1, 2) && !C.canKick(1, 1) && !C.canKick(1, 0) && !C.canKick(2, 2) && !C.canKick(2, 0));
  ok('core.perm: promote / demote / disband', C.canPromote(0, 2) && !C.canPromote(1, 2) && !C.canPromote(0, 1) && C.canDemote(0, 1) && !C.canDemote(1, 1) && !C.canDemote(0, 2) && C.canDisband(0) && !C.canDisband(1) && !C.canDisband(2));
}

// ================================================================================================ flow.*
const net = new FakeNet();
const alp = makePeer(net, 'p1', 'Alp');
const bora = makePeer(net, 'p2', 'Bora');
const cem = makePeer(net, 'p3', 'Cem');
const deniz = makePeer(net, 'p4', 'Deniz');
const efe = makePeer(net, 'p5', 'Efe');
const all = [alp, bora, cem, deniz, efe];
await settle(net, all);
const reasonOf = (r) => (r.ok ? '' : r.reason);

{
  const lowLevel = makePeer(net, 'p9', 'Cuce', { level: 5 });
  const poor = makePeer(net, 'p10', 'Fakir', { gold: 100 });
  await settle(net, [...all, lowLevel, poor]);
  ok('flow.create needs level 10', !(await lowLevel.guild.create('Kara Kartallar')).ok && /Sv 10/.test(reasonOf(await lowLevel.guild.create('Kara Kartallar'))));
  ok('flow.create needs the gold', /altın/.test(reasonOf(await poor.guild.create('Kara Kartallar'))) && poor.ch.save.gold === 100);
  ok('flow.create validates the name', !(await alp.guild.create('ab')).ok && !(await alp.guild.create('<script>')).ok && alp.ch.save.gold === 10000);
  disconnect(lowLevel); disconnect(poor);

  const r = await alp.guild.create('Kara Kartallar');
  ok('flow.create ok', r.ok, reasonOf(r));
  ok('flow.create costs the fee through the wallet', alp.ch.save.gold === 10000 - C.GUILD.CREATE_COST);
  const i = alp.guild.info();
  ok('flow.create: leader, 1 member, key ready, v1', !!i && i.rank === 0 && i.members.length === 1 && i.keyReady && i.rev === 1 && i.ep === 0 && i.leader === 'Alp');
  ok('flow.create persisted in the save', !!alp.ch.save.guild && alp.ch.save.guild.gid === i.gid && C.isPk(alp.ch.save.guild.mk.pub) && alp.ch.save.guild.mk.pub === alp.guild.vr.body.lead);
  ok('flow.create twice refused', /Zaten/.test(reasonOf(await alp.guild.create('Baska Lonca'))) && alp.ch.save.gold === 10000 - C.GUILD.CREATE_COST);
  await settle(net, all);
  ok('flow.presence carries tag, gid, gv', bora.social.find('Alp')?.guild?.name === 'Kara Kartallar' && bora.social.find('Alp').guild.gid === i.gid && bora.social.find('Alp').guild.gv === C.rosterVersion(alp.guild.vr.body));
  ok('flow.tagOf: own is verified, strangers cosmetic', alp.guild.tagOf('Alp') === 'Kara Kartallar' && bora.guild.tagOf('Alp') === 'Kara Kartallar' && bora.guild.tagInfo('Alp').verified === false && bora.guild.tagOf('Efe') === '' && bora.guild.tagOf('') === '');
  const taken = await efe.guild.create('kara kartallar');
  ok('flow.create: a name already announced is refused', /zaten var/.test(reasonOf(taken)) && efe.ch.save.gold === 10000);
}

{
  // invite flow
  ok('flow.invite: non-member cannot invite', !(await bora.guild.invite('Cem')).ok);
  ok('flow.invite: unknown player', /bulunamadı/.test(reasonOf(await alp.guild.invite('Yok Boyle'))));
  ok('flow.invite: yourself', !(await alp.guild.invite('Alp')).ok);
  const r = await alp.guild.invite('Bora');
  ok('flow.invite sent', r.ok, reasonOf(r));
  await settle(net, all);
  ok('flow.invite: the target got the popup', bora.prompts.length === 1 && /Alp/.test(bora.prompts[0]) && /Kara Kartallar/.test(bora.prompts[0]));
  ok('flow.invite: accepted -> member (rank Üye) with a verified roster', bora.guild.info()?.rank === 2 && bora.guild.info().members.length === 2 && rosterNames(bora) === rosterNames(alp) && rosterNames(alp) === 'Alp:0,Bora:2');
  ok('flow.invite: the roster was signed by the leader and revision bumped', alp.guild.vr.body.rev === 2 && bora.guild.vr.body.rev === 2 && alp.guild.vr.leaderSigned);
  ok('flow.invite: invitee persisted guild + shared chat key', !!bora.ch.save.guild && bora.ch.save.guild.key === alp.ch.save.guild.key && bora.ch.save.guild.kv === 1);
  ok('flow.invite: member key differs from the leader key', bora.ch.save.guild.mk.pub !== alp.ch.save.guild.mk.pub);
  ok('flow.invite: chat lines announce the join', sys(alp).some((t) => /Bora loncaya katıldı/.test(t)) && sys(bora).some((t) => /katıldın/.test(t)));
  ok('flow.invite: already a member refused', /zaten üye/.test(reasonOf(await alp.guild.invite('Bora'))));
  ok('flow.members: roster view shows online + rank', alp.guild.info().members.every((m) => m.online) && alp.guild.info().members.find((m) => m.name === 'Bora').rankName === 'Üye');
  ok('flow.tagOf: member verified', bora.guild.tagInfo('Alp').verified === true && alp.guild.tagInfo('Bora').verified === true);

  // decline
  cem.answer = false;
  await alp.guild.invite('Cem');
  await settle(net, all);
  ok('flow.decline: popup shown, no membership, inviter told', cem.prompts.length === 1 && !cem.guild.info() && sys(alp).some((t) => /Cem lonca davetini reddetti/.test(t)) && rosterNames(alp) === 'Alp:0,Bora:2');

  // a Üye cannot invite / kick / promote
  ok('flow.perm: member cannot invite', /Lider veya Subay/.test(reasonOf(await bora.guild.invite('Cem'))));
  ok('flow.perm: member cannot kick or promote', !(await bora.guild.kick('Alp')).ok && !(await bora.guild.promote('Bora')).ok && !(await bora.guild.disband()).ok);
  ok('flow.perm: leader cannot leave', /dagit/.test(reasonOf(await alp.guild.leave())));

  // hostile invites
  const invBefore = efe.prompts.length;
  const boraSave = bora.ch.save.guild;
  net.inject('p2', 'p5', 'ginv', { t: 'inv', id: 'x1', gid: boraSave.gid, from: 'Bora', rs: bora.guild.vr.sr, key: boraSave.key }); // a rank-2 member "invites"
  net.inject('p1', 'p5', 'ginv', { t: 'inv', id: 'x2', gid: boraSave.gid, from: 'Alp', rs: alp.guild.vr.sr, key: C.newChatKey() }); // key does not match the signed hash
  net.inject('p1', 'p5', 'ginv', { t: 'inv', id: 'x3', gid: boraSave.gid, from: 'Alp', rs: { ...alp.guild.vr.sr, b: alp.guild.vr.sr.b.replace('Kara', 'Kare') }, key: boraSave.key }); // tampered roster
  net.inject('p1', 'p5', 'ginv', { t: 'inv', id: 'x4', gid: boraSave.gid, from: 'Alp', rs: alp.guild.vr.sr, key: 'zz' });
  net.inject('p1', 'p5', 'ginv', { t: 'inv', id: 'x5', gid: boraSave.gid, from: 'Mallory', rs: alp.guild.vr.sr, key: boraSave.key }); // inviter is not on the roster
  net.inject('p1', 'p5', 'ginv', 'junk');
  await settle(net, all);
  ok('flow.hostile invites never reach the popup', efe.prompts.length === invBefore && !efe.guild.pendingInvite());

  // accept answer from the wrong peer / unknown id is ignored
  net.inject('p5', 'p1', 'ginv', { t: 'acc', id: 'nope', gid: boraSave.gid, name: 'Efe', pk: (await C.generateMemberKey()).pub });
  await settle(net, all);
  ok('flow.unsolicited accept ignored', rosterNames(alp) === 'Alp:0,Bora:2');

  // invitation expiry
  cem.answer = true;
  const ex = makePeer(net, 'p11', 'Gece');
  await settle(net, [...all, ex]);
  ex.gctx.prompt = async () => { await sleep(10); return true; };
  await alp.guild.invite('Gece');
  await settle(net, [...all, ex]);
  ok('flow.invite: late path works for a slow popup', ex.guild.info()?.rank === 2);
  const exLeave = await ex.guild.leave();
  ok('flow.leave: member leaves (signed notice)', exLeave.ok && !ex.guild.info() && !ex.ch.save.guild);
  await settle(net, [...all, ex]);
  ok('flow.leave: leader removed the member and rotated the key', rosterNames(alp) === 'Alp:0,Bora:2' && alp.ch.save.guild.kv === 2 && bora.ch.save.guild.kv === 2 && bora.ch.save.guild.key === alp.ch.save.guild.key);
  disconnect(ex);
}

{
  // promote -> officer invites, officer kicks
  const before = alp.guild.vr.body.ep;
  const p = await alp.guild.promote('Bora');
  ok('flow.promote ok', p.ok, reasonOf(p));
  await settle(net, all);
  ok('flow.promote: epoch bumped, Bora is Subay on both sides', alp.guild.vr.body.ep === before + 1 && bora.guild.info().rank === 1 && rosterNames(bora) === 'Alp:0,Bora:1' && alp.guild.vr.body.oc.length === 1);
  ok('flow.promote: only for members, only the leader', !(await alp.guild.promote('Bora')).ok && !(await bora.guild.promote('Alp')).ok && !(await alp.guild.promote('Nobody')).ok);

  cem.answer = true;
  const r = await bora.guild.invite('Cem');
  ok('flow.officer can invite', r.ok, reasonOf(r));
  await settle(net, all);
  ok('flow.officer-signed roster converged everywhere', cem.guild.info()?.rank === 2 && rosterNames(alp) === 'Alp:0,Bora:1,Cem:2' && rosterNames(cem) === rosterNames(alp) && !alp.guild.vr.leaderSigned);
  ok('flow.officer-signed roster is accepted by the leader at the new revision', alp.guild.vr.body.rev === bora.guild.vr.body.rev && alp.guild.vr.sr.k === bora.ch.save.guild.mk.pub);

  ok('flow.officer cannot kick the leader or promote / disband', !(await bora.guild.kick('Alp')).ok && !(await bora.guild.promote('Cem')).ok && !(await bora.guild.disband()).ok && !(await bora.guild.demote('Bora')).ok);
  ok('flow.member cannot kick', !(await cem.guild.kick('Bora')).ok);

  // an officer cannot sneak a promotion into a roster either (forged on the wire with its real key)
  const forgedBody = JSON.parse(alp.guild.vr.sr.b);
  forgedBody.rev += 1;
  forgedBody.m.find((m) => m.n === 'Cem').r = 1; // Bora tries to make Cem an officer on his own
  forgedBody.oc = [...forgedBody.oc];
  const forged = await C.signRoster(forgedBody, bora.ch.save.guild.mk.priv, bora.ch.save.guild.mk.pub);
  net.inject('p2', 'p1', 'gsync', { t: 'ros', rs: forged });
  net.inject('p2', 'p3', 'gsync', { t: 'ros', rs: forged });
  await settle(net, all);
  ok('flow.officer self-made promotion rejected', rosterNames(alp) === 'Alp:0,Bora:1,Cem:2' && rosterNames(cem) === 'Alp:0,Bora:1,Cem:2');

  const cemKey = cem.ch.save.guild.key;
  const kick = await bora.guild.kick('Cem');
  ok('flow.officer kicks a member', kick.ok, reasonOf(kick));
  await settle(net, all);
  ok('flow.kick: the kicked client noticed and dropped the guild', !cem.guild.info() && !cem.ch.save.guild && sys(cem).some((t) => /çıkarıldın/.test(t)));
  ok('flow.kick: roster converged without Cem, chat key rotated for the rest', rosterNames(alp) === 'Alp:0,Bora:1' && alp.ch.save.guild.kv === 3 && bora.ch.save.guild.kv === 3 && alp.ch.save.guild.key === bora.ch.save.guild.key && alp.ch.save.guild.key !== cemKey);
  ok('flow.kick: the old key cannot read new guild chat', await (async () => {
    const e = await C.aesEncrypt(alp.ch.save.guild.key, 'gizli', C.chatAad(alp.guild.vr.body.gid, 3));
    return (await C.aesDecrypt(cemKey, e.iv, e.ct, C.chatAad(alp.guild.vr.body.gid, 3))) === null;
  })());
}

// ================================================================================================ chat.*
{
  net.sent.length = 0;
  alp.lines.length = 0; bora.lines.length = 0; cem.lines.length = 0; efe.lines.length = 0; deniz.lines.length = 0;
  ok('chat.send ok', await bora.guild.chat('Selam lonca, gizli plan: <b>kuzey</b>'));
  await settle(net, all);
  ok('chat.members receive it as a guild line', chatLines(alp).length === 1 && chatLines(alp)[0].from === 'Bora' && chatLines(alp)[0].text === 'Selam lonca, gizli plan: <b>kuzey</b>' && chatLines(bora).length === 1);
  ok('chat.non-members get nothing', chatLines(cem).length === 0 && chatLines(efe).length === 0 && chatLines(deniz).length === 0);
  const gc = net.sent.filter((m) => m.channel === 'gchat');
  ok('chat.only addressed to members, never broadcast', gc.length === 1 && gc[0].to === 'p1' && !net.sent.some((m) => m.channel === 'gchat' && (m.to === null || m.to === 'p5' || m.to === 'p3')));
  ok('chat.wire payload is ciphertext only', gc.every((m) => !/Selam|plan|kuzey|Bora/.test(m.json)) && gc.every((m) => Object.keys(JSON.parse(m.json)).sort().join() === 'ct,gid,iv,kv,t'));

  // replay + spoof + rate
  const wire = JSON.parse(gc[0].json);
  alp.lines.length = 0;
  net.inject('p2', 'p1', 'gchat', wire);
  net.inject('p2', 'p1', 'gchat', wire);
  await settle(net, all);
  ok('chat.replayed ciphertext shown once at most', chatLines(alp).length === 0, 'already seen -> dropped');

  const aSave = alp.ch.save.guild;
  const send = async (signer, claimName, text, ts, to = 'p1', from = 'p2', kv = aSave.kv, key = aSave.key) => {
    const sig = await C.signText(signer.priv, C.chatSignText(aSave.gid, claimName, text, ts));
    const e = await C.aesEncrypt(key, JSON.stringify({ n: claimName, t: text, ts, sig }), C.chatAad(aSave.gid, kv));
    net.inject(from, to, 'gchat', { t: 'gchat', gid: aSave.gid, kv, iv: e.iv, ct: e.ct });
  };
  alp.lines.length = 0;
  await send(bora.ch.save.guild.mk, 'Alp', 'ben lider değilim', clock.t); // Bora (has the key) signs as "Alp"
  await settle(net, all);
  ok('chat.member cannot pose as another member (signature binds name to key)', chatLines(alp).length === 0);
  await send(bora.ch.save.guild.mk, 'Bora', 'gercek', clock.t - 3_600_000);
  await settle(net, all);
  ok('chat.stale timestamp rejected', chatLines(alp).length === 0);
  await send(bora.ch.save.guild.mk, 'Bora', 'gercek', clock.t);
  await settle(net, all);
  ok('chat.genuine crafted line accepted', chatLines(alp).length === 1 && chatLines(alp)[0].text === 'gercek');
  await send(bora.ch.save.guild.mk, 'Bora', 'yanlis sürüm', clock.t + 1, 'p1', 'p2', aSave.kv - 1);
  await send(bora.ch.save.guild.mk, 'Bora', 'yanlis anahtar', clock.t + 2, 'p1', 'p2', aSave.kv, C.newChatKey());
  await send(bora.ch.save.guild.mk, 'Mallory', 'üye degil', clock.t + 3);
  net.inject('p2', 'p1', 'gchat', { t: 'gchat', gid: aSave.gid, kv: aSave.kv, iv: 'x', ct: 'y' });
  net.inject('p2', 'p1', 'gchat', { t: 'gchat', gid: 'f'.repeat(32), kv: aSave.kv, iv: 'x', ct: 'y' });
  net.inject('p2', 'p1', 'gchat', null);
  alp.lines.length = 0;
  await settle(net, all);
  ok('chat.wrong key / key version / unknown sender / junk dropped', chatLines(alp).length === 0);

  alp.lines.length = 0;
  for (let i = 0; i < 14; i++) await send(bora.ch.save.guild.mk, 'Bora', 'sel ' + i, clock.t + 10 + i, 'p1', 'p2');
  await net.flush();
  await sleep(120);
  ok('chat.incoming flood is capped by the token bucket', chatLines(alp).length > 0 && chatLines(alp).length <= 7, 'got ' + chatLines(alp).length);

  // outgoing limits + bad state
  advance(10);
  ok('chat.outgoing: fast second line refused, duplicates refused', (await alp.guild.chat('bir')) === true && (await alp.guild.chat('iki')) === false && sys(alp).some((t) => /hızlı/.test(t)));
  advance(2);
  ok('chat.duplicate text refused', (await alp.guild.chat('bir')) === false);
  ok('chat.not in a guild', (await cem.guild.chat('merhaba')) === false && sys(cem).some((t) => /loncada değilsin/.test(t)));
  ok('chat.slash /l routes to guild chat', (() => { cem.lines.length = 0; return alp.guild.command('l hizli') && alp.guild.command('lonca') && alp.opened === 1 && !alp.guild.command('g selam') && !alp.guild.command('w a b'); })());
  await settle(net, all);
}

// ================================================================================================ gossip.*
{
  // Deniz joins, then everyone's roster is identical; then divergence while peers are offline
  deniz.answer = true;
  await alp.guild.invite('Deniz');
  await settle(net, all);
  ok('gossip.setup: 3 members', rosterNames(alp) === 'Alp:0,Bora:1,Deniz:2' && rosterNames(deniz) === rosterNames(alp) && deniz.ch.save.guild.kv === alp.ch.save.guild.kv);

  // Deniz goes offline; the leader changes the guild twice (promote, then add Cem again)
  disconnect(deniz);
  await settle(net, all);
  const stale = deniz.guild.vr.body;
  ok('gossip.offline member keeps its last roster', C.rosterVersion(stale) < C.rosterVersion(alp.guild.vr.body) + 1);
  cem.answer = true;
  await alp.guild.promote('Deniz');
  await settle(net, all);
  await alp.guild.invite('Cem');
  await settle(net, all);
  ok('gossip.leader changes propagate to online members', rosterNames(bora) === 'Alp:0,Bora:1,Cem:2,Deniz:1' && rosterNames(alp) === rosterNames(bora));
  // the leader disappears; Deniz returns and only meets Bora (multi hop: Alp -> Bora -> Deniz)
  disconnect(alp);
  await settle(net, all);
  connect(deniz);
  await settle(net, all);
  ok('gossip.returning member pulls the newer roster from another member and converges', rosterNames(deniz) === 'Alp:0,Bora:1,Cem:2,Deniz:1' && C.rosterVersion(deniz.guild.vr.body) === C.rosterVersion(bora.guild.vr.body));
  ok('gossip.the pulled roster is the exact signed one', deniz.guild.vr.sr.s === bora.guild.vr.sr.s && deniz.ch.save.guild.roster.s === bora.guild.vr.sr.s);
  // a Üye (Cem) who was also behind converges too
  ok('gossip.all online members share one version', C.rosterVersion(cem.guild.vr.body) === C.rosterVersion(bora.guild.vr.body));
  // the key that rotated while Deniz was away: Deniz kept kv, the roster kv did not change in this window (promote/invite do not rotate)
  ok('gossip.chat still works after the rejoin (shared key)', await (async () => { cem.lines.length = 0; await deniz.guild.chat('geri döndüm'); await settle(net, all); return chatLines(cem).some((l) => l.from === 'Deniz'); })());
  connect(alp);
  await settle(net, all);
  ok('gossip.leader returns, everyone equal', C.rosterVersion(alp.guild.vr.body) === C.rosterVersion(deniz.guild.vr.body));

  // key rotation while a member is offline: kick Cem (rotate), Deniz offline during it, then Deniz pulls roster + key
  disconnect(deniz);
  const cemSnap = JSON.parse(JSON.stringify(cem.ch.save.guild));
  disconnect(cem);
  await settle(net, all);
  await alp.guild.kick('Cem');
  await settle(net, all);
  const kvNow = alp.ch.save.guild.kv;
  connect(deniz);
  await settle(net, all, 24);
  ok('gossip.offline member recovers the rotated key by asking a member', deniz.ch.save.guild.kv === kvNow && deniz.ch.save.guild.key === alp.ch.save.guild.key && deniz.guild.info().keyReady, `kv ${deniz.ch.save.guild.kv}/${kvNow}`);
  cem.lines.length = 0;
  await deniz.guild.chat('yeni anahtar');
  await settle(net, all);
  ok('gossip.chat flows again on the new key', chatLines(alp).some((l) => l.text === 'yeni anahtar') && chatLines(cem).length === 0);
  // Cem was offline when he was kicked and still holds his old save: when he meets the guild again he pulls the roster and drops out
  cem.ch.save.guild = cemSnap;
  cem.guild.loadedFor = null;
  await cem.guild.ready();
  ok('gossip.kicked-while-offline player still believes he is a member until he meets the guild', cem.guild.info()?.rank === 2);
  connect(cem);
  await settle(net, all, 24);
  ok('gossip.kicked-while-offline player learns of the kick when he pulls', !cem.guild.info() && !cem.ch.save.guild && sys(cem).some((t) => /çıkarıldın/.test(t)));
  ok('gossip.and never saw the new key', cem.lines.every((l) => l.channel !== 'guild'));
}

{
  // hostile rosters on the wire
  const aSave = alp.ch.save.guild;
  const good = JSON.stringify(alp.guild.vr.sr);
  const snapshot = () => rosterNames(alp) + '|' + alp.guild.vr.body.rev + '|' + alp.guild.vr.body.ep;
  const before = snapshot();
  const E = await C.generateMemberKey();
  const bodyNow = JSON.parse(alp.guild.vr.sr.b);

  // 1. outsider adds himself, signs with his own key
  const b1 = { ...bodyNow, rev: bodyNow.rev + 5, m: [...bodyNow.m, { n: 'Efe', r: 2, pk: E.pub }] };
  net.inject('p5', 'p1', 'gsync', { t: 'ros', rs: await C.signRoster(b1, E.priv, E.pub) });
  net.inject('p5', 'p2', 'gsync', { t: 'ros', rs: await C.signRoster(b1, E.priv, E.pub) });
  // 2. outsider founds a look-alike guild: same id and name, himself as leader
  const b2 = { ...bodyNow, rev: bodyNow.rev + 9, lead: E.pub, m: [{ n: 'Efe', r: 0, pk: E.pub }], oc: [] };
  net.inject('p5', 'p1', 'gsync', { t: 'ros', rs: await C.signRoster(b2, E.priv, E.pub) });
  // 3. a rank-2 member signs a roster that makes him leader's equal
  const b3 = { ...bodyNow, rev: bodyNow.rev + 3 };
  const memberKey = deniz.ch.save.guild.mk; // Deniz is Subay: still not allowed to sign a roster that is not valid
  b3.m = b3.m.map((m) => (m.n === 'Deniz' ? { ...m, r: 0 } : m));
  net.inject('p4', 'p1', 'gsync', { t: 'ros', rs: await C.signRoster(b3, memberKey.priv, memberKey.pub) });
  // 4. replay of an old valid roster (rollback)
  const old = deniz.ch.save.guild.roster; // identical now; make a lower revision from a saved copy in Bora's earlier state
  const lower = await (async () => {
    const lb = { ...bodyNow, rev: Math.max(1, bodyNow.rev - 2) };
    return C.signRoster(lb, aSave.mk.priv, aSave.mk.pub);
  })();
  net.inject('p2', 'p1', 'gsync', { t: 'ros', rs: lower });
  // 5. tampered, truncated, junk
  net.inject('p2', 'p1', 'gsync', { t: 'ros', rs: { ...alp.guild.vr.sr, b: alp.guild.vr.sr.b.replace('"Alp"', '"Alq"') } });
  net.inject('p2', 'p1', 'gsync', { t: 'ros', rs: 'x' });
  net.inject('p2', 'p1', 'gsync', { t: 'ros' });
  net.inject('p2', 'p1', 'gsync', { t: 'req', gid: 5 });
  net.inject('p2', 'p1', 'gsync', { t: 'key', gid: aSave.gid, kv: 99, w: {} });
  net.inject('p2', 'p1', 'gsync', { t: 'kreq', gid: aSave.gid, kv: aSave.kv, name: 'Efe' });
  net.inject('p5', 'p1', 'gsync', { t: 'leave', gid: aSave.gid, name: 'Bora', ts: clock.t, sig: await C.signText(E.priv, C.leaveSignText(aSave.gid, 'Bora', clock.t)) }); // forged leave notice
  net.inject('p5', 'p1', 'gsync', 42);
  await settle(net, all);
  ok('gossip.hostile rosters / notices change nothing (outsider, look-alike, non-officer, rollback, tampering, junk, forged leave)', snapshot() === before && rosterNames(bora) === rosterNames(alp), snapshot() + ' vs ' + before);
  ok('gossip.hostile key push changes nothing', alp.ch.save.guild.kv === aSave.kv && alp.guild.info().keyReady);
  ok('gossip.the same roster re-sent is harmless', (() => { net.inject('p2', 'p1', 'gsync', { t: 'ros', rs: JSON.parse(good) }); return true; })());
  await settle(net, all);
  ok('gossip.state intact', snapshot() === before);

  // revoked officer: Deniz is demoted, then tries the old-epoch forgery with a still-valid old certificate
  const oldCertRoster = deniz.guild.vr.sr; // officer-signed or leader-signed at the old epoch (kept for the replay)
  const oldBody = JSON.parse(oldCertRoster.b);
  const denizKey = deniz.ch.save.guild.mk;
  const d = await alp.guild.demote('Deniz');
  ok('gossip.demote ok', d.ok, reasonOf(d));
  await settle(net, all);
  ok('gossip.demote bumps the epoch; the old officer is a plain member everywhere', alp.guild.vr.body.ep > oldBody.ep && deniz.guild.info().rank === 2 && bora.guild.info().members.find((m) => m.name === 'Deniz').rank === 2);
  const forgeBody = { ...oldBody, rev: 900000, kv: oldBody.kv };
  const forged = await C.signRoster(forgeBody, denizKey.priv, denizKey.pub);
  ok('gossip.revoked officer old-epoch roster is self-consistent (the limit)', (await C.verifyRoster(forged, { gid: oldBody.gid, lead: oldBody.lead })).ok);
  const snap2 = snapshot();
  net.inject('p4', 'p1', 'gsync', { t: 'ros', rs: forged });
  net.inject('p4', 'p2', 'gsync', { t: 'ros', rs: forged });
  await settle(net, all);
  ok('gossip.but peers on the newer epoch ignore it (epoch wins over revision)', snapshot() === snap2 && rosterNames(bora) === rosterNames(alp));
  ok('gossip.demoted member cannot invite or kick any more', !(await deniz.guild.invite('Efe')).ok && !(await deniz.guild.kick('Bora')).ok);
}

// ================================================================================================ save.*
{
  const aCh = alp.ch;
  const again = new Guild(alp.gctx, { autoTick: false });
  await again.ready();
  const i1 = again.info();
  const i0 = alp.guild.info();
  ok('save.re-login restores the guild from the save', !!i1 && i1.gid === i0.gid && i1.rank === 0 && i1.members.length === i0.members.length && i1.keyReady && again.presenceInfo().gv === alp.guild.presenceInfo().gv);
  const other = CharacterState.create('Zed', 'knight');
  other.save.guild = JSON.parse(JSON.stringify(aCh.save.guild));
  other.save.guild.roster.b = other.save.guild.roster.b.replace('Kara Kartallar', 'Kara Kartallax');
  const tamper = new Guild({ ...alp.gctx, character: () => other }, { autoTick: false });
  await tamper.ready();
  ok('save.tampered roster in the save is dropped', tamper.info() === null && !other.save.guild);
  const bad = CharacterState.create('Yed', 'knight');
  bad.save.guild = { gid: 'nope' };
  const junk = new Guild({ ...alp.gctx, character: () => bad }, { autoTick: false });
  await junk.ready();
  ok('save.junk guild data is dropped without throwing', junk.info() === null && !bad.save.guild);
  const none = new Guild({ ...alp.gctx, character: () => null }, { autoTick: false });
  ok('save.no character -> no guild, no throw', none.info() === null && none.presenceInfo() === null && none.tagOf('x') === '');
  ok('save.guild is plain JSON (survives the save round trip)', JSON.stringify(JSON.parse(JSON.stringify(aCh.save.guild))) === JSON.stringify(aCh.save.guild));
}

// ================================================================================================ disband.*
{
  ok('disband.only the leader (command needs the word)', !(await bora.guild.disband()).ok && (alp.guild.command('lonca dagit'), true));
  await settle(net, all);
  ok('disband.without confirmation nothing happens', !!alp.guild.info() && sys(alp).some((t) => /dagit evet/.test(t)));
  const r = await alp.guild.disband();
  ok('disband.leader disbands', r.ok, reasonOf(r));
  await settle(net, all);
  ok('disband.every client dropped the guild + save', !alp.guild.info() && !alp.ch.save.guild && !bora.guild.info() && !bora.ch.save.guild && !deniz.guild.info() && !deniz.ch.save.guild);
  ok('disband.presence no longer announces the tag', bora.social.find('Alp')?.guild === undefined && alp.guild.presenceInfo() === null);
  ok('disband.members were told', sys(bora).some((t) => /dağıtıldı/.test(t)));
  // a dissolved guild can be founded again by anyone
  const again = await efe.guild.create('Kara Kartallar');
  ok('disband.name is free again', again.ok, reasonOf(again));
}

// ================================================================================================ cmd.* / misc
{
  const x = makePeer(net, 'p20', 'Komut');
  await settle(net, [...all, x]);
  const run = async (s) => { x.lines.length = 0; x.guild.command(s); await sleep(30); await settle(net, [x]); return sys(x).join(' | '); };
  ok('cmd.help lists commands', /\/lonca kur/.test(await run('lonca yardim')));
  ok('cmd.info without a guild', /loncada değilsin/.test(await run('lonca bilgi')));
  ok('cmd.kur without a name', /Kullanım/.test(await run('lonca kur')));
  ok('cmd.kur creates (Turkish letters in the sub-command are normalised)', /kurdun/.test(await run('lonca kur Şahin Ocağı')) && x.guild.info()?.name === 'Şahin Ocağı');
  ok('cmd.ayrıl for a leader explains', /dagit/.test(await run('lonca ayrıl')));
  ok('cmd.unknown subcommand prints help', /lonca kur/.test(await run('lonca blabla')));
  ok('cmd.not ours', x.guild.command('kim') === false && x.guild.command('') === false);
  disconnect(x);
  ok('misc.invite without a lobby', /bağlanılamadı/.test(reasonOf(await x.guild.invite('Efe'))));
}

console.log(`\nguild: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
