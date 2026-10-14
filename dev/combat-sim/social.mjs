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
