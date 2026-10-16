// SOCIAL headless check: Genel Sohbet / Ticaret / fisilti / presence on the global lobby (src/systems/Social.ts).
// No browser, no network: the real Social service with a fake lobby network (JSON-cloned messages, ordered queue) and a fake clock.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/social.mjs      (V=1 prints every PASS)
// Stages: san.* (sanitization) | rate.* (outgoing + incoming limits) | whisper.* (routing by name, reply) | presence.* (announce, expiry,
//         change, duplicates, cap) | offline.* (no lobby) | cmd.* (slash commands)
import * as H from './harness.mjs';

const { G } = H;
const S = await H.imp('systems/Social.ts');
const { Social, SOCIAL, TokenBucket, cleanChatText, cleanName, cleanClass } = S;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

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
  /** Raw injection as if `from` had sent it (hostile peers need not use Social). */
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
    this.net.sent.push({ channel, bytes: json.length, from: this.selfId, to: opts.to ?? null, json });
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

function makePeer(net, id, name, { cls = 'knight', level = 10, zone = 'town', zoneName = 'Kuzgunkale', ignore = [], network = true } = {}) {
  const lines = [];
  const changes = [];
  const me = { name, cls, level, zone, zoneName };
  const ctx = {
    self: () => ({ ...me }),
    now: () => clock.t,
    say: (l) => lines.push(l),
    changed: (n) => changes.push(n),
    expectNetwork: () => network,
    ignored: (raw) => ignore.map((x) => x.toLowerCase()).includes(raw.toLowerCase()),
  };
  const s = new Social(ctx, { autoTick: false });
  const tr = net.join(id);
  s.wantConnected = true;
  s.attach(tr);
  return { id, s, tr, lines, changes, me, ctx };
}
const chatLines = (p, ch) => p.lines.filter((l) => l.channel === ch);
const sysText = (p) => p.lines.filter((l) => l.channel === 'system').map((l) => l.text);

async function world(names) {
  const net = new FakeNet();
  const peers = names.map((n, i) => makePeer(net, 'p' + (i + 1), n));
  await net.flush();
  return { net, peers };
}

// ================================================================================================ san.*
{
  ok('san.control chars', cleanChatText('a\u0000b\u0007c\u001bd\u007fe') === 'abcde');
  ok('san.bidi + zero width', cleanChatText('x‮y​z⁦w﻿v') === 'xyzwv');
  ok('san.whitespace collapsed', cleanChatText('  a \n\t  b   ') === 'a b');
  ok('san.cap 200', cleanChatText('x'.repeat(500)).length === 200);
  ok('san.cap custom', cleanChatText('x'.repeat(500), 10).length === 10);
  ok('san.non-string', cleanChatText(42) === '' && cleanChatText({ a: 1 }) === '' && cleanChatText(null) === '' && cleanChatText(undefined) === '');
  ok('san.lone surrogate removed', cleanChatText('ab\ud83d') === 'ab' && cleanChatText('\ude00cd') === 'cd');
  ok('san.surrogate pair kept', cleanChatText('a\u{1F600}b') === 'a\u{1F600}b');
  ok('san.cut pair not left half', !/[\ud800-\udbff]$/.test(cleanChatText('x'.repeat(199) + '\u{1F600}')));
  ok('san.html stays literal text', cleanChatText('<img src=x onerror=alert(1)>') === '<img src=x onerror=alert(1)>', 'escaped by the chat renderer (esc), never innerHTML raw');
  ok('san.name: ~ stripped, 20 chars', cleanName('Bob~2') === 'Bob2' && cleanName('N'.repeat(40)).length === 20);
  ok('san.class whitelist', cleanClass('knight') === 'knight' && cleanClass('constructor') === '' && cleanClass('__proto__') === '' && cleanClass(5) === '');

  // over the wire: hostile payloads
  const { net, peers } = await world(['Alp', 'Bora']);
  const [A] = peers;
  net.inject('p2', 'p1', 'lchat', { t: 'lchat', name: 'Bora', text: 'ab\u0000c‮<b>x</b>' + 'z'.repeat(400), cls: 'knight', lvl: 10 });
  await net.flush();
  const l = chatLines(A, 'global')[0];
  ok('san.wire text cleaned + capped', !!l && !/[\u0000‮]/.test(l.text) && l.text.length === 200 && l.text.startsWith('abc<b>x</b>'));
  A.lines.length = 0;
  for (const bad of [null, 5, 'str', [], { text: 5 }, { name: 'Bora' }, { name: 'Bora', text: '   ' }, { name: '', text: 'hi' }, { name: 7, text: 'hi' }, { text: { toString: 1 }, name: 'Bora' }]) {
    clock.t += 5000; // stay clear of the incoming bucket
    net.inject('p2', 'p1', 'lchat', bad);
  }
  await net.flush();
  ok('san.wire garbage dropped', A.lines.length === 0, JSON.stringify(A.lines));
  // class / level validation on presence
  net.inject('p2', 'p1', 'lpres', { t: 'lpres', name: 'Bora', cls: 'hax', lvl: 99999, zone: 'town<script>', zn: 'Z\u0000one' });
  await net.flush();
  const e = A.s.find('Bora');
  ok('san.presence clamps level, drops bad class, cleans zone', !!e && e.lvl === 60 && e.cls === 'knight' && e.zone === 'townscript' && e.zoneName === 'Zone', JSON.stringify(e));
  net.inject('p2', 'p1', 'lpres', { t: 'lpres', name: 'Bora', cls: 'mage', lvl: -4, zone: 'town' });
  await net.flush();
  ok('san.presence negative level -> 1', A.s.find('Bora').lvl === 1);
}

// ================================================================================================ rate.*
{
  const { net, peers } = await world(['Alp', 'Bora', 'Cem']);
  const [A, B, C] = peers;
  advance(10);
  ok('rate.first message goes', A.s.sendChannel('global', 'merhaba') === true);
  ok('rate.echoed locally as global', chatLines(A, 'global').length === 1 && chatLines(A, 'global')[0].from === 'Alp');
  advance(1.0);
  ok('rate.second inside 1.5 s refused', A.s.sendChannel('global', 'ikinci') === false);
  ok('rate.refusal explained', sysText(A).some((t) => /hızlı/.test(t)));
  advance(0.6);
  ok('rate.after 1.6 s allowed', A.s.sendChannel('global', 'ikinci') === true);
  advance(2);
  ok('rate.duplicate text refused', A.s.sendChannel('global', 'ikinci') === false && sysText(A).some((t) => /tekrar/.test(t)));
  advance(11);
  ok('rate.duplicate allowed after the window', A.s.sendChannel('global', 'ikinci') === true);
  await net.flush();
  ok('rate.others got 3 messages', chatLines(B, 'global').length === 3 && chatLines(C, 'global').length === 3);
  ok('rate.sender name shown', chatLines(B, 'global')[0].from === 'Alp');

  // trade channel
  advance(3);
  A.s.sendChannel('trade', 'WTS kılıç');
  await net.flush();
  ok('rate.trade lands in trade, not global', chatLines(B, 'trade').length === 1 && chatLines(B, 'global').length === 3 && chatLines(B, 'trade')[0].text === 'WTS kılıç');

  advance(10);
  // incoming bucket: a flooding peer is cut at the bucket capacity, others unaffected
  B.lines.length = 0; C.lines.length = 0;
  for (let i = 0; i < 40; i++) net.inject('p1', 'p2', 'lchat', { t: 'lchat', name: 'Alp', text: 'spam' + i, cls: 'knight', lvl: 10 });
  net.inject('p3', 'p2', 'lchat', { t: 'lchat', name: 'Cem', text: 'normal', cls: 'knight', lvl: 10 });
  await net.flush();
  const got = chatLines(B, 'global');
  ok('rate.incoming flood capped at bucket size', got.filter((l) => l.from === 'Alp').length === SOCIAL.RECV_CHAT.cap, 'got ' + got.filter((l) => l.from === 'Alp').length);
  ok('rate.other peer unaffected by the flood', got.some((l) => l.from === 'Cem'));
  advance(10);
  net.inject('p1', 'p2', 'lchat', { t: 'lchat', name: 'Alp', text: 'later', cls: 'knight', lvl: 10 });
  await net.flush();
  ok('rate.bucket refills over time', chatLines(B, 'global').some((l) => l.text === 'later'));

  // whisper flood too
  B.lines.length = 0;
  for (let i = 0; i < 30; i++) net.inject('p1', 'p2', 'lwhis', { t: 'lwhis', name: 'Alp', to: 'Bora', text: 'w' + i });
  await net.flush();
  ok('rate.incoming whisper flood capped', chatLines(B, 'whisper').length === SOCIAL.RECV_WHISPER.cap, 'got ' + chatLines(B, 'whisper').length);

  // presence flood
  for (let i = 0; i < 50; i++) net.inject('p3', 'p1', 'lpres', { t: 'lpres', name: 'Cem' + i, cls: 'mage', lvl: 5, zone: 'town' });
  await net.flush();
  const flooded = A.s.list().find((x) => x.id === 'p3');
  ok('rate.presence flood capped (only the first few applied)', !!flooded && /^Cem[0-5]$/.test(flooded.name), flooded?.name);
  const tb = new TokenBucket(2, 1, 0);
  ok('rate.TokenBucket unit', tb.take(0) && tb.take(0) && !tb.take(0) && !tb.take(400) && tb.take(1100) && !tb.take(1100));
}

// ================================================================================================ whisper.*
{
  const { net, peers } = await world(['Alp', 'Bora', 'Cem']);
  const [A, B, C] = peers;
  advance(10);
  ok('whisper.send to Bora', A.s.whisper('bora', 'selam') === true);
  await net.flush();
  const w = chatLines(B, 'whisper');
  ok('whisper.Bora receives it (from Alp, to Bora)', w.length === 1 && w[0].from === 'Alp' && w[0].to === 'Bora' && w[0].text === 'selam');
  ok('whisper.Cem does not', chatLines(C, 'whisper').length === 0);
  ok('whisper.Cem saw no lwhis traffic', net.sent.filter((m) => m.channel === 'lwhis' && m.to && [].concat(m.to).includes('p3')).length === 0);
  const echo = chatLines(A, 'whisper');
  ok('whisper.sender echo has the target name', echo.length === 1 && echo[0].from === 'Alp' && echo[0].to === 'Bora');
  ok('whisper.reply target set on receiver', B.s.replyTo === 'Alp');
  advance(2);
  ok('whisper./r replies to Alp', B.s.command('r cevap geldi') === true);
  await net.flush();
  const back = chatLines(A, 'whisper').filter((l) => l.from === 'Bora');
  ok('whisper.reply delivered to Alp only', back.length === 1 && back[0].text === 'cevap geldi' && chatLines(C, 'whisper').length === 0);
  ok('whisper.Alp can /r Bora now', A.s.replyTo === 'Bora');

  // not found / self / empty
  advance(2);
  A.lines.length = 0;
  A.s.command('w Yok Kimse selam');
  ok('whisper.unknown name -> Oyuncu bulunamadı', sysText(A).some((t) => t.startsWith('Oyuncu bulunamadı')), JSON.stringify(sysText(A)));
  A.lines.length = 0;
  A.s.command('w Alp ben');
  ok('whisper.self refused', sysText(A).some((t) => /Kendine/.test(t)));
  A.lines.length = 0;
  A.s.command('w Bora');
  ok('whisper.no text -> usage', sysText(A).some((t) => /Kullanım/.test(t)));
  const x = makePeer(net, 'p9', 'Yeni');
  ok('whisper./r with nobody to answer', (x.s.command('r hey'), sysText(x).some((t) => /Yanıtlanacak/.test(t))));

  // spoof resistance: `to` must be the receiver's character; wrong target dropped
  B.lines.length = 0;
  net.inject('p1', 'p2', 'lwhis', { t: 'lwhis', name: 'Alp', to: 'Baska', text: 'yanlış kişi' });
  await net.flush();
  ok('whisper.wrong target name dropped', chatLines(B, 'whisper').length === 0);
  // a peer cannot make a whisper look like it came from someone else: the registry decides by peer id
  advance(30);
  net.inject('p3', 'p2', 'lwhis', { t: 'lwhis', name: 'Alp', to: 'Bora', text: 'ben Alp değilim' });
  await net.flush();
  const spoof = chatLines(B, 'whisper')[0];
  ok('whisper.impersonating an online name gets a suffix', !!spoof && spoof.from !== 'Alp', JSON.stringify(spoof));
  ok('whisper.real Alp still routes to the real peer', B.s.find('Alp').id === 'p1');

  // names with spaces: longest prefix wins
  const sp = makePeer(net, 'p5', 'Kara Şövalye');
  await net.flush();
  advance(2);
  A.lines.length = 0;
  A.s.command('w kara şövalye merhaba usta');
  await net.flush();
  const g = chatLines(sp, 'whisper');
  ok('whisper.name with space parsed', g.length === 1 && g[0].text === 'merhaba usta' && g[0].from === 'Alp', JSON.stringify(g));

  // ignore list
  const ig = makePeer(net, 'p6', 'Deniz', { ignore: ['Alp'] });
  await net.flush();
  advance(2);
  A.s.whisper('Deniz', 'beni duy');
  A.s.sendChannel('global', 'ignore testi');
  await net.flush();
  ok('whisper.ignored sender dropped (whisper + chat)', chatLines(ig, 'whisper').length === 0 && chatLines(ig, 'global').length === 0);

  // a peer that left cannot be whispered
  net.leave('p2');
  await net.flush();
  advance(2);
  A.lines.length = 0;
  ok('whisper.left peer -> not found', A.s.whisper('Bora', 'orada mısın') === false && sysText(A).some((t) => /bulunamadı/.test(t)));
}

// ================================================================================================ presence.*
{
  const { net, peers } = await world(['Alp', 'Bora']);
  const [A, B] = peers;
  ok('presence.both see each other on join', A.s.count() === 2 && B.s.count() === 2);
  const eb = A.s.find('Bora');
  ok('presence.fields carried', !!eb && eb.cls === 'knight' && eb.lvl === 10 && eb.zone === 'town' && eb.zoneName === 'Kuzgunkale' && !eb.self);
  ok('presence.changed event fired with count', A.changes.includes(2));
  ok('presence.list sorted incl. self', A.s.list().map((e) => e.name).join(',') === 'Alp,Bora' && A.s.list().find((e) => e.name === 'Alp').self === true);

  // periodic announce: every 5 s, nothing in between
  const countPres = () => net.sent.filter((m) => m.channel === 'lpres' && m.from === 'p1' && m.to === null).length;
  advance(6); A.s.tick();
  const n1 = countPres();
  advance(2); A.s.tick();
  ok('presence.no re-announce within 5 s', countPres() === n1);
  advance(3.5); A.s.tick();
  ok('presence.re-announce after 5 s', countPres() === n1 + 1);

  // change -> immediate (>= 1 s after the last one)
  A.me.level = 11; A.me.zone = 'dungeon'; A.me.zoneName = 'Zindan';
  advance(1.2); A.s.tick();
  await net.flush();
  ok('presence.change announced right away', countPres() === n1 + 2 && B.s.find('Alp').lvl === 11 && B.s.find('Alp').zone === 'dungeon');
  ok('presence.local self entry follows the character', A.s.find('Alp').lvl === 11);
  A.me.level = 12;
  A.s.poke();
  ok('presence.poke inside the 1 s gap waits', countPres() === n1 + 2);
  advance(1.1); A.s.poke();
  ok('presence.poke after the gap sends', countPres() === n1 + 3);
  await net.flush();

  // expiry: Bora goes silent (no ticks) > 20 s, Alp keeps announcing
  B.s.tick();
  await net.flush();
  let t = 0;
  while (t < 19) { advance(1); A.s.tick(); t++; }
  await net.flush();
  ok('presence.peer silent 19 s is still listed', !!A.s.find('Bora', false));
  advance(2); A.s.tick();
  ok('presence.peer silent > 20 s dropped', A.s.find('Bora', false) === null && A.s.count() === 1);
  ok('presence.expiry fired presence:changed', A.changes[A.changes.length - 1] === 1);
  // it comes back by announcing
  B.s.tick();
  await net.flush();
  ok('presence.peer back after a fresh announce', A.s.count() === 2);
  // any message keeps a peer alive: chat counts as proof of life
  advance(15); A.s.tick();
  B.s.sendChannel('global', 'buradayım');
  await net.flush();
  advance(10); A.s.tick();
  ok('presence.chat refreshes last-seen', A.s.count() === 2);

  // leave
  net.leave('p2');
  await net.flush();
  ok('presence.transport leave drops at once', A.s.count() === 1);

  // bye
  const C = makePeer(net, 'p3', 'Cem');
  await net.flush();
  ok('presence.newcomer visible', A.s.find('Cem') && C.s.find('Alp'));
  C.s.stop();
  await net.flush();
  ok('presence.bye removes the peer', A.s.find('Cem') === null);
  ok('presence.stopped peer lists nobody', C.s.count() === 0 || C.s.count() === 1);

  // duplicate names: oldest keeps the name, the late one is shown with ~2
  const D1 = makePeer(net, 'p7', 'Kopya');
  await net.flush();
  const D2 = makePeer(net, 'p8', 'kopya');
  await net.flush();
  const names = A.s.list().map((e) => e.name);
  ok('presence.duplicate name gets a suffix', names.includes('Kopya') && names.includes('kopya~2'), names.join(','));
  advance(3);
  A.s.command('w kopya~2 hey');
  await net.flush();
  ok('presence.whisper to the suffixed duplicate reaches only that peer', chatLines(D2, 'whisper').length === 1 && chatLines(D1, 'whisper').length === 0);
  net.leave('p7');
  await net.flush();
  ok('presence.duplicate takes the plain name when the older one leaves', A.s.list().map((e) => e.name).includes('kopya'));

  // someone claiming OUR name is the one that gets the suffix
  const imp = makePeer(net, 'p10', 'Alp');
  await net.flush();
  ok('presence.claiming my name does not displace me', A.s.find('Alp').self === true && A.s.find('Alp~2')?.id === 'p10');

  // hard cap
  const A2 = A.s;
  for (let i = 0; i < SOCIAL.MAX_PEERS + 50; i++) net.inject('x' + i, 'p1', 'lpres', { t: 'lpres', name: 'Bot' + i, cls: 'mage', lvl: 3, zone: 'town' });
  await net.flush();
  ok('presence.peer table capped', A2.count() <= SOCIAL.MAX_PEERS + 1, 'count ' + A2.count());
}

// ================================================================================================ presence.pvp (lpres `ar`)
{
  const R = await H.imp('scenes/arena/arenaRules.ts');
  const { presenceOf } = R;
  const { net, peers } = await world(['Alp', 'Bora']);
  const [A, B] = peers;
  // the announce carries the best of 2v2 / 3v3 (not 1v1) as { r, b }; the tier is derived by the receiver and never sent
  const best = presenceOf({ '1v1': 1900, '2v2': 1720, '3v3': 1810 });
  ok('presence.pvp best of 2v2 / 3v3 (1v1 ignored), tier derived', best.rating === 1810 && best.bracket === '3v3' && best.tier === 'gladyator', JSON.stringify(best));
  ok('presence.pvp a tie goes to 2v2', presenceOf({ '1v1': 1500, '2v2': 1600, '3v3': 1600 }).bracket === '2v2');
  B.me.arena = best;
  clock.t += 1500;
  B.s.poke();
  await net.flush();
  const sentB = net.sent.filter((m) => m.channel === 'lpres' && m.from === 'p2' && m.to === null).pop();
  const wire = JSON.parse(sentB.json);
  ok('presence.pvp wire field ar = { r, b }, no tier on the wire', JSON.stringify(wire.ar) === '{"r":1810,"b":"3v3"}', JSON.stringify(wire.ar));
  const bora = () => A.s.find('Bora');
  ok('presence.pvp received with the derived tier', bora().pvp?.rating === 1810 && bora().pvp?.tier === 'gladyator' && bora().pvp?.bracket === '3v3', JSON.stringify(bora().pvp));

  // an old client (no ar) clears the rating; the other fields still apply
  net.inject('p2', 'p1', 'lpres', { t: 'lpres', name: 'Bora', cls: 'knight', lvl: 10, zone: 'town' });
  await net.flush();
  ok('presence.pvp absent ar = no rating (old client), other fields kept', bora().pvp === undefined && bora().lvl === 10);

  // validation: clamp to 0..5000, rounding, derived tier, bad bracket / type dropped
  // (each send waits 3 s: the incoming presence bucket refills at 0.5 / s)
  const send = async (ar) => { clock.t += 3000; net.inject('p2', 'p1', 'lpres', { t: 'lpres', name: 'Bora', cls: 'knight', lvl: 10, zone: 'town', ar }); await net.flush(); return bora().pvp; };
  let v = await send({ r: 99999, b: '2v2' });
  ok('presence.pvp rating clamped to the top (5000, kadim)', v?.rating === 5000 && v?.tier === 'kadim', JSON.stringify(v));
  v = await send({ r: -50, b: '3v3' });
  ok('presence.pvp negative clamped to 0 (acemi)', v?.rating === 0 && v?.tier === 'acemi', JSON.stringify(v));
  v = await send({ r: 1099.6, b: '2v2' });
  ok('presence.pvp rounded, 1100 boundary is savasci', v?.rating === 1100 && v?.tier === 'savasci', JSON.stringify(v));
  v = await send({ r: 1500, b: '1v1' });
  ok('presence.pvp 1v1 is not a presence bracket: dropped', v === undefined, JSON.stringify(v));
  v = await send({ r: '1800', b: '2v2' });
  ok('presence.pvp string rating dropped', v === undefined);
  v = await send('2v2');
  ok('presence.pvp non-object dropped', v === undefined);
  v = await send({ r: 1700, b: '3v3', tier: 'kadim', extra: 'x' });
  ok('presence.pvp extra keys ignored, tier from the rating (1700 = duellocu)', v?.rating === 1700 && v?.tier === 'duellocu' && v?.bracket === '3v3', JSON.stringify(v));

  // a rating change is a presence change (presence:changed fires)
  const before = A.changes.length;
  await send({ r: 1800, b: '3v3' });
  ok('presence.pvp a rating change fires presence:changed', A.changes.length > before);

  // the local player: no ladder = no rating; with a ladder the entry carries the best 2v2 / 3v3 and its tier
  ok('presence.pvp self without a ladder has no rating', A.s.find('Alp').pvp === undefined);
  A.me.arena = presenceOf({ '1v1': 1500, '2v2': 1210, '3v3': 1000 });
  clock.t += 1500;
  A.s.tick();
  ok('presence.pvp self rating from the ladder (2v2 1210 = savasci)', A.s.find('Alp').pvp?.rating === 1210 && A.s.find('Alp').pvp?.tier === 'savasci' && A.s.find('Alp').pvp?.bracket === '2v2');
  ok('presence.pvp list carries the ratings of both players', A.s.list().filter((e) => e.pvp).map((e) => e.name).sort().join() === 'Alp,Bora');

  // season table: start dates are the ladder season starts (8 weeks from 2024-01-01); names unique; unnamed seasons read "Sezon N"
  ok('presence.season table start dates = ladder season starts', R.ARENA_SEASONS.every((s) => new Date(s.start + 'T00:00:00Z').getTime() === R.seasonStartMs(s.n)));
  ok('presence.season table names unique and non-empty', new Set(R.ARENA_SEASONS.map((s) => s.name)).size === R.ARENA_SEASONS.length && R.ARENA_SEASONS.every((s) => s.name.trim().length > 0));
  ok('presence.season title: named season, and "Sezon N" past the table', R.seasonTitle(1) === 'Sezon 1: Kızıl Kum' && R.seasonTitle(2) === 'Sezon 2: Ayaz Kılıcı' && R.seasonTitle(19) === 'Sezon 19');
}

// ================================================================================================ offline.*
{
  const net = new FakeNet();
  const lines = [];
  const ctx = {
    self: () => ({ name: 'Yalnız', cls: 'mage', level: 3, zone: 'town', zoneName: 'Kuzgunkale' }),
    now: () => clock.t, say: (l) => lines.push(l), changed() {}, expectNetwork: () => false, ignored: () => false,
  };
  const s = new Social(ctx, { autoTick: false });
  const sys = () => lines.filter((l) => l.channel === 'system').map((l) => l.text);
  ok('offline.status', s.status === 'offline' && s.connected === false);
  s.command('g merhaba');
  ok('offline./g -> Genel sohbete bağlanılamadı', sys().includes('Genel sohbete bağlanılamadı.'), JSON.stringify(sys()));
  ok('offline.nothing echoed as a chat line', lines.every((l) => l.channel === 'system'));
  lines.length = 0;
  s.command('ticaret satılık');
  s.command('w biri selam');
  ok('offline.trade + whisper also say so', sys().filter((t) => t === 'Genel sohbete bağlanılamadı.').length === 2);
  lines.length = 0;
  s.start();
  await new Promise((r) => setTimeout(r, 0));
  ok('offline.start without lobby does not throw and marks failure', s.status === 'offline');
  s.command('kim');
  ok('offline./kim lists only the player + the notice', sys().some((t) => /bağlanılamadı/.test(t)) && sys().some((t) => /Yalnız - Sv 3/.test(t)) && sys().some((t) => /\(1\)/.test(t)), JSON.stringify(sys()));
  ok('offline.count is 1 and list has self', s.count() === 1 && s.list()[0].self === true);

  // start() with a lease that fails, then one that works later
  const s2 = new Social({ ...ctx, expectNetwork: () => true }, { autoTick: false });
  lines.length = 0;
  s2.start(async () => null);
  await new Promise((r) => setTimeout(r, 0));
  s2.sendChannel('global', 'hey');
  ok('offline.lease failed -> same message', sys().includes('Genel sohbete bağlanılamadı.') || sys().includes('Genel sohbete bağlanılıyor...'));
  let released = 0;
  const tr = net.join('z1');
  s2.lastTry = -Infinity;
  await s2.connect(async () => ({ tr, release: () => { released++; } }));
  ok('offline.connect later works', s2.status === 'online');
  s2.stop();
  ok('offline.stop releases the lease', released === 1 && s2.status === 'offline');
}

// ================================================================================================ cmd.*
{
  const { net, peers } = await world(['Alp', 'Bora']);
  const [A, B] = peers;
  advance(20);
  ok('cmd./1 and /g are Genel', A.s.command('1 bir') === true);
  advance(2);
  ok('cmd./g', A.s.command('g iki') === true);
  advance(2);
  ok('cmd./2 is Ticaret', A.s.command('2 satılık yüzük') === true);
  advance(2);
  ok('cmd./ticaret', A.s.command('ticaret alıyorum') === true);
  await net.flush();
  ok('cmd.channels routed', chatLines(B, 'global').map((l) => l.text).join('|') === 'bir|iki' && chatLines(B, 'trade').map((l) => l.text).join('|') === 'satılık yüzük|alıyorum');
  A.lines.length = 0;
  A.s.command('g');
  ok('cmd./g without text -> usage', sysText(A).some((t) => /Kullanım/.test(t)));
  A.lines.length = 0;
  A.s.command('YARDIM');
  ok('cmd./yardim prints help', sysText(A).length >= 5 && sysText(A).some((t) => /\/w/.test(t)) && sysText(A).some((t) => /\/kim/.test(t)));
  A.lines.length = 0;
  A.s.command('yardım');
  ok('cmd./yardım (dotless i) too', sysText(A).length >= 5);
  A.lines.length = 0;
  ok('cmd./kim lists everyone', A.s.command('kim') === true && sysText(A).some((t) => /Çevrimiçi oyuncular \(2\)/.test(t)) && sysText(A).some((t) => /^Bora - Sv 10 Şövalye - Kuzgunkale$/.test(t)), JSON.stringify(sysText(A)));
  ok('cmd./who alias', (A.lines.length = 0, A.s.command('who'), sysText(A).length >= 3));
  ok('cmd.unknown commands are not ours', A.s.command('temizle') === false && A.s.command('dance') === false && A.s.command('') === false);
  // /kim truncates long lists
  for (let i = 0; i < 40; i++) net.inject('b' + i, 'p1', 'lpres', { t: 'lpres', name: 'Oyuncu' + i, cls: 'mage', lvl: 3, zone: 'town' });
  await net.flush();
  A.lines.length = 0;
  A.s.command('kim');
  ok('cmd./kim truncates', sysText(A).length <= SOCIAL.WHO_MAX + 3 && sysText(A).some((t) => /daha/.test(t)));
  // channel message while connected only: sent bytes stay small
  const biggest = Math.max(...net.sent.map((m) => m.bytes));
  ok('cmd.wire messages are small', biggest < 700, 'max ' + biggest);
}

// ================================================================================================ player.* (systems/PlayerSocial.ts)
// Friends list (store, corrupt data, dedupe, cap), duel state machine (invite, timeout, countdown, flag radius, HP floor),
// trade state machine (request, offers, locks, atomic swap). Pure modules: no network, no DOM.
{
  const PS = await H.imp('systems/PlayerSocial.ts');
  const { DuelMachine, DUEL, addFriend, removeFriend, isFriend, loadFriends, saveFriends, FRIENDS_KEY, FRIENDS_MAX, TradeMachine, TRADE } = PS;

  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  saveFriends(['Ayşe', 'Mert'], store);
  ok('player.friends roundtrip', JSON.stringify(loadFriends(store)) === JSON.stringify(['Ayşe', 'Mert']));
  mem.set(FRIENDS_KEY, '{not json');
  ok('player.friends corrupt data reads empty', loadFriends(store).length === 0);
  mem.set(FRIENDS_KEY, JSON.stringify(['Ali', 'ali', ' Veli~2 ', 42, '']));
  ok('player.friends load dedupes and cleans', JSON.stringify(loadFriends(store)) === JSON.stringify(['Ali', 'Veli2']), JSON.stringify(loadFriends(store)));
  ok('player.friends blocked storage reads empty', loadFriends({ getItem() { throw new Error('denied'); }, setItem() {} }).length === 0);
  let threw = false;
  try { saveFriends(['x'], { getItem() { return null; }, setItem() { throw new Error('quota'); } }); } catch { threw = true; }
  ok('player.friends failed write does not throw', !threw);
  ok('player.friends match is case-insensitive', isFriend(['Ali'], 'ALI') && !isFriend(['Ali'], 'Ali2'));
  const dup = addFriend(['Ali'], 'ali', 'Ben');
  ok('player.friends add rejects duplicate', !dup.ok && /zaten/.test(dup.reason));
  ok('player.friends add rejects self', !addFriend([], 'Ben', 'ben').ok);
  ok('player.friends add accepts new name', addFriend(['Ali'], 'Cem', 'Ben').ok === true);
  ok('player.friends cap', !addFriend(Array.from({ length: FRIENDS_MAX }, (_, i) => 'p' + i), 'Zed', 'Ben').ok);
  ok('player.friends remove is case-insensitive', JSON.stringify(removeFriend(['Ali', 'Cem'], 'ALI')) === '["Cem"]');

  const d = new DuelMachine();
  const t0 = 1000;
  ok('player.duel invite needs two different players', !d.invite(t0, 'Ali', 'ali') && d.state === 'idle');
  ok('player.duel invite opens', d.invite(t0, 'Ali', 'Veli') && d.state === 'invited');
  ok('player.duel only the target accepts', !d.accept(t0, 'Ali') && d.state === 'invited');
  d.tick(t0 + DUEL.INVITE_TIMEOUT_MS - 1);
  ok('player.duel invite open before 30 s', d.state === 'invited');
  d.tick(t0 + DUEL.INVITE_TIMEOUT_MS);
  ok('player.duel invite times out at 30 s', d.state === 'ended' && d.snapshot().reason === 'timeout');
  d.reset();
  d.invite(t0, 'Ali', 'Veli');
  ok('player.duel decline by target', d.decline('Veli') && d.snapshot().reason === 'declined');
  d.reset();
  d.invite(t0, 'Ali', 'Veli');
  ok('player.duel challenger cancels', d.decline('Ali') && d.snapshot().reason === 'cancel');
  d.reset();
  d.invite(t0, 'Ali', 'Veli');
  ok('player.duel accept starts countdown', d.accept(t0, 'Veli') && d.state === 'countdown');
  d.tick(t0 + DUEL.COUNTDOWN_MS - 1);
  ok('player.duel countdown holds before 3 s', d.state === 'countdown');
  d.tick(t0 + DUEL.COUNTDOWN_MS, { a: 0, b: 0 });
  ok('player.duel live after countdown', d.state === 'active');
  d.tick(t0 + 5000, { a: 0, b: DUEL.RADIUS + 1 });
  ok('player.duel leaving the flag forfeits', d.state === 'ended' && d.snapshot().winner === 'Ali' && d.snapshot().reason === 'leave');
  d.reset();
  d.invite(t0, 'Ali', 'Veli'); d.accept(t0, 'Veli'); d.tick(t0 + DUEL.COUNTDOWN_MS);
  ok('player.duel surrender by challenger', d.surrender('Ali') && d.snapshot().winner === 'Veli' && d.snapshot().reason === 'surrender');
  d.reset();
  d.invite(t0, 'Ali', 'Veli'); d.accept(t0, 'Veli'); d.tick(t0 + DUEL.COUNTDOWN_MS, { a: 1, b: 1 });
  ok('player.duel lethal hit leaves the victim at 1 HP and ends it', d.damage('Veli', 40, 100) === DUEL.FLOOR_HP && d.snapshot().winner === 'Ali' && d.snapshot().reason === 'hp');
  d.reset();
  ok('player.duel damage ignored outside an active duel', d.damage('Veli', 40, 100) === 40);
  d.invite(t0, 'Ali', 'Veli'); d.accept(t0, 'Veli'); d.tick(t0 + DUEL.COUNTDOWN_MS);
  ok('player.duel non-lethal hit keeps the duel going', d.damage('Ali', 100, 30) === 70 && d.state === 'active');

  const tr = new TradeMachine();
  ok('player.trade request then accept opens the window', tr.request('Ali', 'Veli') && tr.state === 'requested' && tr.accept('Veli') && tr.state === 'open');
  const wrong = new TradeMachine();
  wrong.request('Ali', 'Veli');
  ok('player.trade only the invited side accepts', !wrong.accept('Ali') && wrong.state === 'requested');
  ok('player.trade offer needs an open window', tr.offer('Ali', { gold: 50, items: ['sword_1'] }));
  tr.offer('Veli', { gold: 0, items: ['shield_2', 'potion_3'] });
  tr.lock('Ali');
  ok('player.trade one-sided confirm does not complete', tr.confirm('Ali') === null && tr.state === 'open' && tr.sides().a.accepted === true);
  tr.lock('Veli');
  const sw = tr.confirm('Veli');
  ok('player.trade both accepted swaps atomically', !!sw && tr.state === 'done' && sw.toA.gold === 0 && sw.toB.gold === 50 && sw.toB.items[0] === 'sword_1' && sw.toA.items.length === 2, JSON.stringify(sw));
  const t2 = new TradeMachine();
  t2.request('Ali', 'Veli'); t2.accept('Veli');
  t2.offer('Ali', { gold: 5, items: [] }); t2.lock('Ali'); t2.lock('Veli'); t2.confirm('Ali');
  t2.offer('Veli', { gold: 1, items: [] });
  ok('player.trade an offer change clears locks and accepts', t2.sides().a.locked === false && t2.sides().a.accepted === false && t2.state === 'open');
  ok('player.trade rejects negative gold and duplicate items', !t2.offer('Ali', { gold: -1, items: [] }) && !t2.offer('Ali', { gold: 1, items: ['a', 'a'] }));
  ok('player.trade rejects too many items', !t2.offer('Ali', { gold: 0, items: Array.from({ length: TRADE.MAX_ITEMS + 1 }, (_, i) => 'i' + i) }));
  ok('player.trade a stranger cannot offer', !t2.offer('Zed', { gold: 1, items: [] }));
  ok('player.trade cancel closes the window', t2.cancel('Veli') && t2.state === 'cancelled' && !t2.lock('Ali'));
}

// ================================================================================================ psoc.* (systems/PlayerSocialNet.ts round trips)
// Two real PlayerSocialNet services on the fake lobby (FakeNet, JSON-cloned, ordered). A shared room map stands in for the world.
{
  const PSN = await H.imp('systems/PlayerSocialNet.ts');
  const PS = await H.imp('systems/PlayerSocial.ts');
  const lobby = new FakeNet();
  const room = new Map(); // name -> { name, x, z, hp, maxHp }
  const peerOf = new Map(); // name -> lobby peer id
  const nameOfPeer = new Map();
  const held = new Set();
  const HP = 100;

  function mk(name, id, x, z, { items = [], gold = 100, gear = [], party = null } = {}) {
    const tr = lobby.join(id);
    const bagItems = items.map((i) => ({ ...i }));
    const g = { v: gold };
    const bag = {
      gold: () => g.v,
      addGold: (n) => { g.v += n; },
      spendGold: (n) => { if (g.v < n) return false; g.v -= n; return true; },
      find: (uid) => bagItems.find((i) => i.uid === uid) ?? null,
      removeItem: (uid) => { const k = bagItems.findIndex((i) => i.uid === uid); if (k < 0) return false; bagItems.splice(k, 1); return true; },
      addItem: (it) => { if (bagItems.length >= 8) return false; bagItems.push({ ...it }); return true; },
      freeSlots: () => 8 - bagItems.length,
    };
    const me = { name, x, z, hp: HP, maxHp: HP };
    room.set(name, me);
    peerOf.set(name, id);
    nameOfPeer.set(id, name);
    const out = { sys: [], toasts: [], req: [], duel: [], trade: [], gear: [], follow: [], joined: [], closed: [] };
    const deps = {
      now: () => clock.t,
      selfName: () => name,
      self: () => room.get(name) ?? null,
      roomPlayer: (n) => (n !== name && room.get(n)) || null,
      peerIdOf: (n) => (peerOf.has(n) && lobby.trs.has(peerOf.get(n)) ? peerOf.get(n) : null),
      nameOf: (p) => nameOfPeer.get(p) ?? null,
      send: (peer, msg) => { tr.send('psoc', { t: 'psoc', ...msg }, { to: peer }); return true; },
      setHp: (hp) => { me.hp = hp; },
      bag,
      gearRows: () => gear,
      partyCode: () => party,
      hostParty: async () => { party = 'PARTY' + name.slice(0, 2).toUpperCase(); return party; },
      joinParty: (c) => out.joined.push(c),
      moveHeld: () => held.has('move'),
      faceToward: (x2, z2) => { me.yaw = Math.atan2(x2 - me.x, z2 - me.z); },
      sys: (t) => out.sys.push(t),
      toast: (t) => out.toasts.push(t),
      ui: {
        request: (r) => out.req.push(r),
        requestClosed: (id) => out.closed.push(id),
        duel: (s) => out.duel.push(s),
        trade: (v) => out.trade.push(v),
        gear: (n, rows) => out.gear.push({ n, rows }),
        follow: (n) => out.follow.push(n),
      },
    };
    const svc = new PSN.PlayerSocialNet(deps);
    tr.on('psoc', (d, m) => svc.onWire(d, m.from));
    return { svc, out, bag, bagItems, g, me, id };
  }
  const tick = async (...svcs) => { for (const s of svcs) s.svc.tick(); await lobby.flush(); };
  const reqId = (p) => p.out.req.at(-1)?.id;
  const sword = { uid: 'sw1', baseId: 'sword_iron', rarity: 'common', itemLevel: 5 };
  const shield = { uid: 'sh1', baseId: 'shield_oak', rarity: 'rare', itemLevel: 7 };

  // ---- duel: request -> popup -> accept -> countdown -> active -> strikes -> 1 HP end
  let A = mk('Ali', 'aaaaa1', 0, 0);
  let B = mk('Veli', 'bbbbb2', 2, 0);
  ok('psoc.duel request out', A.svc.requestDuel('Veli') === null);
  await lobby.flush();
  ok('psoc.duel target gets a popup with 30 s', B.out.req.length === 1 && B.out.req[0].kind === 'duel' && B.out.req[0].from === 'Ali' && B.out.req[0].deadline - clock.t === 30000, JSON.stringify(B.out.req));
  B.svc.respond(reqId(B), true);
  await lobby.flush();
  ok('psoc.duel accept starts countdown on both', A.svc.duel.state === 'countdown' && B.svc.duel.state === 'countdown');
  advance(3); await tick(A, B);
  ok('psoc.duel active after 3-2-1', A.svc.duel.state === 'active' && B.svc.duel.state === 'active');
  // strikes: 7% of 100 HP = 7 per hit, every 1.5 s, both ways while in reach
  advance(2); await tick(A);
  ok('psoc.duel strike lands (100 -> 93)', B.me.hp === 93, 'hp ' + B.me.hp);
  // only A ticks here: B's own strikes would race A's (the symmetric case is covered by the next block)
  for (let i = 0; i < 20 && B.me.hp > 1; i++) { advance(1.6); await tick(A); }
  ok('psoc.duel victim stops at 1 HP', B.me.hp === 1, 'hp ' + B.me.hp);
  ok('psoc.duel 1 HP ends it: winner announced on both', A.svc.duel.snapshot().winner === 'Ali' && B.svc.duel.snapshot().winner === 'Ali' && A.out.sys.some((t) => /kazandın|kazandı/.test(t)) && B.out.sys.some((t) => /Ali kazandı/.test(t)), JSON.stringify([A.out.sys, B.out.sys]));
  A.svc.tick(); B.svc.tick();
  await lobby.flush();
  ok('psoc.duel state is ended on both after the end message', A.svc.duel.state === 'ended' && B.svc.duel.state === 'ended');

  // ---- duel: leaving the 40 m flag forfeits, the other side learns from `end`
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 0, 0);
  room.get('Ali').x = 0; room.get('Veli').x = 10;
  A.svc.requestDuel('Veli'); await lobby.flush();
  B.svc.respond(reqId(B), true); await lobby.flush();
  advance(3); await tick(A, B);
  room.get('Veli').x = 100; // 95 m from the start midpoint
  await tick(A, B); await tick(A, B);
  ok('psoc.duel stepping out of the flag forfeits', B.svc.duel.snapshot().reason === 'leave' && B.svc.duel.snapshot().winner === 'Ali', JSON.stringify(B.svc.duel.snapshot()));
  ok('psoc.duel forfeit reaches the other side', A.svc.duel.snapshot().reason === 'leave' && A.svc.duel.snapshot().winner === 'Ali', JSON.stringify(A.svc.duel.snapshot()));

  // ---- duel: decline, busy refusal, 30 s timeout
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 1, 0);
  A.svc.requestDuel('Veli'); await lobby.flush();
  B.svc.respond(reqId(B), false); await lobby.flush();
  ok('psoc.duel decline ends on the challenger side', A.svc.duel.snapshot().reason === 'declined' && B.svc.duel.state === 'ended');
  A.svc.requestDuel('Veli'); await lobby.flush();
  ok('psoc.duel busy refuses a second challenge', typeof A.svc.requestTrade('Veli') === 'string');
  advance(31); await tick(A, B);
  ok('psoc.duel unanswered invite times out on both', A.svc.duel.snapshot().reason === 'timeout' && B.svc.duel.snapshot().reason === 'timeout' && B.out.closed.length >= 1);

  // ---- trade: request -> accept -> offers -> lock -> accept -> atomic swap
  A = mk('Ali', 'aaaaa1', 0, 0, { items: [sword], gold: 100 });
  B = mk('Veli', 'bbbbb2', 3, 0, { items: [shield], gold: 50 });
  ok('psoc.trade request', A.svc.requestTrade('Veli') === null);
  await lobby.flush();
  B.svc.respond(reqId(B), true); await lobby.flush();
  ok('psoc.trade window opens on both', A.svc.trade.state === 'open' && B.svc.trade.state === 'open');
  ok('psoc.trade offer goes across', A.svc.tradeOffer(30, ['sw1']) === null);
  await lobby.flush();
  ok('psoc.trade partner sees the offer', B.svc.tradeView().them.gold === 30 && B.svc.tradeView().theirItems[0].uid === 'sw1');
  ok('psoc.trade offer of a missing item refused', A.svc.tradeOffer(0, ['nope']) !== null);
  ok('psoc.trade offer above gold refused', A.svc.tradeOffer(999, []) !== null);
  B.svc.tradeOffer(0, ['sh1']); await lobby.flush();
  ok('psoc.trade lock before accept', A.svc.tradeAccept() !== null, 'accept needs lock');
  A.svc.tradeLock(); await lobby.flush();
  B.svc.tradeLock(); await lobby.flush();
  ok('psoc.trade both locked', A.svc.tradeView().them.locked && B.svc.tradeView().them.locked);
  A.svc.tradeAccept(); await lobby.flush();
  ok('psoc.trade one accept does not swap', A.svc.trade.state === 'open' && A.bagItems.some((i) => i.uid === 'sw1'));
  B.svc.tradeAccept(); await lobby.flush();
  ok('psoc.trade swap runs once on both sides', A.svc.trade.state === 'done' && B.svc.trade.state === 'done');
  ok('psoc.trade items moved', !A.bagItems.some((i) => i.uid === 'sw1') && A.bagItems.some((i) => i.uid === 'sh1') && B.bagItems.some((i) => i.uid === 'sw1') && !B.bagItems.some((i) => i.uid === 'sh1'));
  ok('psoc.trade gold moved', A.g.v === 70 && B.g.v === 80, `A ${A.g.v} B ${B.g.v}`);

  // ---- trade: walking away cancels both sides
  A = mk('Ali', 'aaaaa1', 0, 0, { items: [sword] });
  B = mk('Veli', 'bbbbb2', 3, 0, { items: [shield] });
  A.svc.requestTrade('Veli'); await lobby.flush();
  B.svc.respond(reqId(B), true); await lobby.flush();
  room.get('Veli').x = 25;
  await tick(A, B);
  ok('psoc.trade more than 10 m apart cancels', A.svc.trade.state === 'cancelled' && B.svc.trade.state === 'cancelled' && A.bagItems.some((i) => i.uid === 'sw1'));

  // ---- trade: decline
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 3, 0);
  A.svc.requestTrade('Veli'); await lobby.flush();
  B.svc.respond(reqId(B), false); await lobby.flush();
  ok('psoc.trade decline closes', A.svc.trade.state === 'cancelled' && B.svc.trade.state === 'cancelled');

  // ---- party invite: host a room when solo, invitee joins by code
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 3, 0);
  const pr = await A.svc.requestParty('Veli');
  await lobby.flush();
  ok('psoc.party invite sent with the room code', pr === null && B.out.req.at(-1)?.kind === 'party');
  B.svc.respond(reqId(B), true); await lobby.flush();
  ok('psoc.party invitee joins the room code', B.out.joined.length === 1 && B.out.joined[0] === 'PARTYAL');

  // ---- gear view: request and answer over the wire
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 3, 0, { gear: [{ s: 'weapon', n: 'Demir Kılıç', r: 'rare', l: 12 }] });
  A.svc.requestGear('Veli'); await lobby.flush();
  ok('psoc.gear view shows the target equipment', A.out.gear.length === 1 && A.out.gear[0].rows[0].n === 'Demir Kılıç' && A.out.gear[0].n === 'Veli', JSON.stringify(A.out.gear));

  // ---- follow: axis toward the target, stops inside 3 m, gives up beyond 30 m, stops on a move key
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 5, 0);
  ok('psoc.follow starts', A.svc.follow('Veli') === null && A.svc.followTarget === 'Veli');
  ok('psoc.follow walks toward a target 5 m away', JSON.stringify(A.svc.followAxis()) === '{"x":0,"y":1}');
  room.get('Veli').x = 1;
  ok('psoc.follow stands within 3 m', JSON.stringify(A.svc.followAxis()) === '{"x":0,"y":0}');
  room.get('Veli').x = 40;
  ok('psoc.follow gives up beyond 30 m', A.svc.followAxis() === null && A.svc.followTarget === null);
  room.get('Veli').x = 5;
  A.svc.follow('Veli');
  held.add('move');
  ok('psoc.follow stops on a move key', A.svc.followAxis() === null && A.svc.followTarget === null);
  held.clear();

  // ---- wire hygiene: malformed or unknown senders are dropped
  A = mk('Ali', 'aaaaa1', 0, 0);
  B = mk('Veli', 'bbbbb2', 3, 0);
  const junk = [null, 'x', { op: 'hit', id: 'bad' }, { op: 'hit', id: 'abcdef', dmg: -5 }, { op: 'tOffer', id: 'abcdef', gold: 1, items: [{ uid: '' }] }, { op: 'nope', id: 'abcdef' }];
  for (const j of junk) B.svc.onWire(j, 'aaaaa1');
  B.svc.onWire({ op: 'req', id: 'abcdef', kind: 'duel', to: 'Veli' }, 'stranger-peer');
  ok('psoc.wire junk and unknown senders are ignored', B.out.req.length === 0 && B.svc.duel.state === 'idle');
  ok('psoc.wire parser refuses bad ops', PS.parsePsoc({ op: 'hit', id: 'abcdef', dmg: 1.5 }) === null && PS.parsePsoc({ op: 'req', id: 'AB', kind: 'duel', to: 'x' }) === null);
  ok('psoc.wire parser accepts a good request', PS.parsePsoc({ op: 'req', id: 'abcdef', kind: 'trade', to: 'Veli' })?.kind === 'trade');
  await lobby.flush();
}

console.log(`social: ${passes} passed, ${fails} failed`);
H.restoreConsole();
if (H.errors.length) {
  const real = H.errors.filter((e) => !/send failed/.test(e));
  if (real.length) {
    console.log('console errors/warnings during the run:');
    for (const e of real.slice(0, 10)) console.log('  ' + e);
  }
}
console.log(fails === 0 ? 'PASS' : 'FAIL');
process.exit(fails === 0 ? 0 : 1);
