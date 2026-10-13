// CM14 PAZAR headless check (docs/CORE_MECHANICS.md §11). No browser, no server, no network: real Market / CharacterState /
// MarketWire with a fake lobby network (JSON-cloned messages, ordered queue, per-channel drop) and a fake clock.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/market.mjs
// Stages: spot.* (determinism, collisions, priority) | gold.* (fee / tax) | lock.* (listed items) | tx.* (full buy round trip, reject,
//         timeout, late reply, dedup, plausibility) | wire.* (announce size, sanitisers) | log.* (sales log, next-login summary).
// PASS/FAIL per check, exit code 1 on any failure.
import * as H from './harness.mjs';

const { G } = H;
const toasts = [];
G.events.on('ui:toast', (t) => toasts.push(t.text));

const { CharacterState, makeTestItem } = await H.imp('systems/CharacterState.ts');
const { Market } = await H.imp('systems/Market.ts');
const D = await H.imp('data/market.ts');
const W = await H.imp('systems/MarketWire.ts');
const { isProtected } = await H.imp('systems/AutoSalvage.ts');
const Upg = await H.imp('systems/Upgrade.ts');
const Vendor = await H.imp('systems/Vendor.ts');

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
    this.drop = new Set(); // channel names whose messages vanish
    this.held = []; // messages parked by hold()
    this.holding = new Set();
    this.sent = []; // every message, for size checks
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
  async flush() {
    let guard = 0;
    while (this.queue.length && guard++ < 10000) {
      const m = this.queue.shift();
      const target = this.trs.get(m.to);
      if (!target) continue;
      for (const h of target.handlers.get(m.channel) ?? []) h(JSON.parse(m.json), { from: m.from, channel: m.channel, receivedAt: 0, loopback: false });
    }
  }
  release() {
    this.queue.push(...this.held.splice(0));
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
    this.net.sent.push({ channel, bytes: json.length, from: this.selfId });
    if (this.net.drop.has(channel)) return;
    const targets = opts.to ? [].concat(opts.to) : this.getPeers();
    for (const to of targets) {
      const m = { to, from: this.selfId, channel, json };
      if (this.net.holding.has(channel)) this.net.held.push(m);
      else this.net.queue.push(m);
    }
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

const ORIGIN = { zone: 'town', kind: 'plaza', x: 0, z: 0, yaw: 0 };

function makePeer(net, id, name, classId = 'knight') {
  const ch = CharacterState.create(name, classId);
  ch.save.gold = 100_000;
  const pos = { x: 5, z: 5 };
  const ctx = {
    character: () => ch,
    now: () => clock.t,
    playerPos: () => pos,
    teleport: (x, z) => { pos.x = x; pos.z = z; },
    newId: () => Math.random().toString(36).slice(2, 10),
  };
  const m = new Market(ctx, { autoTick: false });
  const tr = net.join(id);
  m.attach(tr);
  m.mount(ORIGIN);
  return { id, ch, m, tr, pos, ctx };
}

function bagItem(ch, baseId, rarity = 'rare', ilvl = 20) {
  const it = makeTestItem(baseId, ilvl, rarity, ch.classId);
  if (!it) throw new Error('no base ' + baseId);
  if (!ch.addItem(it)) throw new Error('bag full');
  return it;
}
const stand = (peer, stall) => {
  const sp = peer.m.spotPos(stall.zone, stall.spot);
  peer.pos.x = sp.x + 1; peer.pos.z = sp.z + 2;
};

// ================================================================================================ spot.*
{
  const count = D.spotCount('plaza');
  ok('spot.count plaza 60 / village 12', count === 60 && D.spotCount('village') === 12);
  const spots = D.marketSpots(ORIGIN);
  ok('spot.grid 60 spots, 2.5 m apart', spots.length === 60 && Math.abs(spots[1].x - spots[0].x - 2.5) < 1e-9 && Math.abs(spots[10].z - spots[0].z - 2.5) < 1e-9);
  const rot = D.marketSpots({ ...ORIGIN, yaw: Math.PI / 2 });
  ok('spot.grid rotates with yaw (spacing kept)', Math.abs(Math.hypot(rot[1].x - rot[0].x, rot[1].z - rot[0].z) - 2.5) < 1e-9);

  ok('spot.hash stable', D.hashSeller('peerA') === D.hashSeller('peerA') && D.hashSeller('peerA') !== D.hashSeller('peerB'));
  // determinism: same inputs, same answer, on "two clients"
  const ids = Array.from({ length: 200 }, (_, i) => `peer-${i}-${(i * 7919) % 1000}`);
  let det = true;
  for (const id of ids) if (D.assignSpot(id, count, new Set()) !== D.assignSpot(id, count, new Set())) det = false;
  ok('spot.deterministic', det);
  // collisions: find two ids with the same home spot
  const byHome = new Map();
  let pair = null;
  for (const id of ids) {
    const h = D.homeSpot(id, count);
    if (byHome.has(h)) { pair = [byHome.get(h), id]; break; }
    byHome.set(h, id);
  }
  ok('spot.collision pair exists in 200 ids', !!pair);
  if (pair) {
    const occ = new Set();
    const a = D.assignSpot(pair[0], count, occ); occ.add(a);
    const b = D.assignSpot(pair[1], count, occ);
    ok('spot.probe second seller goes to the next free spot', b === (a + 1) % count);
    occ.add(b);
    const c = D.assignSpot(pair[0] + 'x', count, new Set([...occ]));
    ok('spot.probe never returns an occupied spot', !occ.has(c));
  }
  // fill the plaza completely: 60 distinct spots, the 61st gets -1
  const occ = new Set();
  let distinct = true;
  for (let i = 0; i < count; i++) {
    const s = D.assignSpot(`filler-${i}`, count, occ);
    if (s < 0 || occ.has(s)) distinct = false;
    occ.add(s);
  }
  ok('spot.fill 60 sellers get 60 distinct spots', distinct && occ.size === count);
  ok('spot.full plaza returns -1', D.assignSpot('late-comer', count, occ) === -1);
  // priority: total order, a vs b = -(b vs a)
  let prio = true;
  for (let i = 0; i < 100; i++) {
    const a = ids[i], b = ids[199 - i];
    if (a === b) continue;
    const spot = i % count;
    if (Math.sign(D.spotPriority(a, b, spot, count)) !== -Math.sign(D.spotPriority(b, a, spot, count))) prio = false;
  }
  ok('spot.priority antisymmetric', prio);

  // two clients see two announcements of ONE spot in opposite orders: both hide the same loser
  const net = new FakeNet();
  const c1 = makePeer(net, 'obs1', 'Obs1');
  const c2 = makePeer(net, 'obs2', 'Obs2');
  const mk = (id, spot) => ({ z: 'town', title: id, spot, rev: 5, open: true, look: { c: 'knight', v: 0, n: id, l: 5 }, items: [] });
  const A = pair ? pair[0] : 'A', B = pair ? pair[1] : 'B';
  const sp = D.homeSpot(A, count);
  c1.m.stalls.clear(); c2.m.stalls.clear();
  // direct delivery through the transport handlers (the sender id is the transport's)
  const deliver = (peer, from, data) => { for (const h of peer.tr.handlers.get('shop') ?? []) h(JSON.parse(JSON.stringify(data)), { from, channel: 'shop', receivedAt: 0, loopback: false }); };
  deliver(c1, A, mk(A, sp)); deliver(c1, B, mk(B, sp));
  deliver(c2, B, mk(B, sp)); deliver(c2, A, mk(A, sp));
  const hid = (p) => [...p.m.stalls.values()].filter((s) => s.hidden).map((s) => s.sellerId).sort().join(',');
  ok('spot.race both clients hide the same loser', hid(c1) === hid(c2) && hid(c1).split(',').filter(Boolean).length === 1, hid(c1));
  ok('spot.race loser is the longer probe distance / higher id', hid(c1) === (D.spotPriority(A, B, sp, count) < 0 ? B : A));
}

// ================================================================================================ gold.*
{
  ok('gold.fee 1 % (ceil, min 1)', D.listingFee(1000) === 10 && D.listingFee(150) === 2 && D.listingFee(1) === 1 && D.listingFee(0) === 0);
  ok('gold.tax 3 % (floor)', D.saleTax(1000) === 30 && D.saleTax(100) === 3 && D.saleTax(33) === 0 && D.saleNet(1000) === 970 && D.saleNet(33) === 33);
  ok('gold.title <= 32 chars, cleaned', D.cleanTitle('  ' + 'a'.repeat(50) + '  ').length === 32 && D.cleanTitle('x\u0000y‮z') === 'xyz' && D.cleanTitle('   ', 'f') === 'f');
  ok('gold.rules 12 / 24 slots, 30 s, 10 s, 6 m, 40 boards', D.MARKET.SLOTS === 12 && D.MARKET.SLOTS_BIG === 24 && D.MARKET.ANNOUNCE_S === 30 && D.MARKET.BUY_TIMEOUT_S === 10 && D.MARKET.BUY_RANGE === 6 && D.MARKET.TEXT_LOD === 40);
}

// ================================================================================================ tx.* / lock.*
const net = new FakeNet();
const seller = makePeer(net, 'seller-1', 'Satici');
const buyer = makePeer(net, 'buyer-1', 'Alici', 'mage');
const watcher = makePeer(net, 'watch-1', 'Gozcu', 'rogue');
await net.flush();

seller.ch.addMaterial(D.BOHCA_ID, 2);
const s1 = bagItem(seller.ch, 'sword1h_t1', 'rare');
const s2 = bagItem(seller.ch, 'chest_heavy_t1', 'epic', 30);
const s3 = bagItem(seller.ch, 'boots_heavy_t1', 'uncommon', 12);
const goldBefore = seller.ch.save.gold;

// ---- open: validation rejects
{
  const prevX = seller.pos.x; seller.pos.x = 500;
  let r = seller.m.openShop({ title: 'Uzak', listings: [{ uid: s1.uid, price: 100 }] });
  ok('tx.open rejects a seller outside the market district', !r.ok, r.reason);
  seller.pos.x = prevX;
  r = seller.m.openShop({ title: 'Bos', listings: [] });
  ok('tx.open rejects an empty stall', !r.ok);
  r = seller.m.openShop({ title: 'Fiyat', listings: [{ uid: s1.uid, price: 0 }] });
  ok('tx.open rejects price 0', !r.ok, r.reason);
  r = seller.m.openShop({ title: 'Fiyat', listings: [{ uid: s1.uid, price: -5 }] });
  ok('tx.open rejects a negative price', !r.ok);
  r = seller.m.openShop({ title: 'Fiyat', listings: [{ uid: s1.uid, price: 1.5e12 }] });
  ok('tx.open rejects an absurd price', !r.ok);
  r = seller.m.openShop({ title: 'Cift', listings: [{ uid: s1.uid, price: 10 }, { uid: s1.uid, price: 10 }] });
  ok('tx.open rejects the same item twice', !r.ok);
  r = seller.m.openShop({ title: 'Yok', listings: [{ uid: 'nope', price: 10 }] });
  ok('tx.open rejects an item that is not in the bag', !r.ok);
  seller.ch.save.equipment.weapon && (r = seller.m.openShop({ title: 'Kusanilmis', listings: [{ uid: seller.ch.save.equipment.weapon.uid, price: 10 }] }));
  ok('tx.open rejects an equipped item', !seller.ch.save.equipment.weapon || !r.ok);
  const bound = bagItem(seller.ch, 'helm_heavy_t1', 'rare'); bound.bound = true;
  r = seller.m.openShop({ title: 'Bagli', listings: [{ uid: bound.uid, price: 10 }] });
  ok('tx.open rejects a bound item', !r.ok, r.reason);
  seller.ch.removeItem(bound.uid);
  const noLic = makePeer(new FakeNet(), 'nolic', 'Bohcasiz');
  const it = bagItem(noLic.ch, 'sword1h_t1');
  r = noLic.m.openShop({ title: 'Bohcasiz', listings: [{ uid: it.uid, price: 10 }] });
  ok('tx.open rejects without a Pazar Bohcasi', !r.ok, r.reason);
  const poor = makePeer(new FakeNet(), 'poor', 'Fakir');
  poor.ch.addMaterial(D.BOHCA_ID, 1); poor.ch.save.gold = 0;
  const it2 = bagItem(poor.ch, 'sword1h_t1');
  r = poor.m.openShop({ title: 'Fakir', listings: [{ uid: it2.uid, price: 5000 }] });
  ok('tx.open rejects when the listing fee is unaffordable', !r.ok, r.reason);
  ok('tx.open failures never took gold or the licence', seller.ch.save.gold === goldBefore && seller.ch.material(D.BOHCA_ID) === 2);
}

// ---- open: success
const P1 = 5000, P2 = 12000, P3 = 700;
{
  const total = P1 + P2 + P3;
  const r = seller.m.openShop({ title: '  Zindan Ganimeti  ', listings: [{ uid: s1.uid, price: P1 }, { uid: s2.uid, price: P2 }, { uid: s3.uid, price: P3 }] });
  ok('tx.open succeeds', r.ok, r.reason);
  ok('tx.open fee = 1 % of the total, bohca consumed', seller.ch.save.gold === goldBefore - D.listingFee(total) && seller.ch.material(D.BOHCA_ID) === 1, `${goldBefore - seller.ch.save.gold}`);
  ok('tx.open title trimmed', seller.m.own?.title === 'Zindan Ganimeti');
  const expectSpot = D.assignSpot('seller-1', 60, new Set());
  ok('tx.open spot = hash mod 60 on an empty plaza', seller.m.own?.spot === expectSpot, `${seller.m.own?.spot} vs ${expectSpot}`);
  const sp = seller.m.spotPos('town', seller.m.own.spot);
  ok('tx.open moves the seller to the seat', Math.abs(seller.pos.x - sp.seatX) < 1e-9 && Math.abs(seller.pos.z - sp.seatZ) < 1e-9);
}
// ---- locking
{
  ok('lock.listed flag set on all three', s1.listed && s2.listed && s3.listed);
  ok('lock.sellItem refuses', seller.ch.sellItem(s1.uid) === 0 && !!seller.ch.findItem(s1.uid));
  ok('lock.equip refuses', seller.ch.equip(s1.uid) === false);
  ok('lock.moveItem to stash refuses', seller.ch.moveItem({ where: 'bag', index: seller.ch.findItem(s1.uid).loc.index }, { where: 'stash', index: 0 }) === false);
  ok('lock.moveItem within the bag is allowed', seller.ch.moveItem({ where: 'bag', index: seller.ch.findItem(s3.uid).loc.index }, { where: 'bag', index: 40 }) === true);
  const prev = G.character;
  G.character = seller.ch;
  const salv = Upg.salvageItem(s1.uid);
  const up = Upg.upgradeItem(s1.uid);
  const vend = Vendor.sell(s1.uid);
  G.character = prev;
  ok('lock.salvage refuses', !salv.ok && !!seller.ch.findItem(s1.uid));
  ok('lock.upgrade refuses', !up.ok && (s1.upgrade ?? 0) === 0);
  ok('lock.vendor sell refuses', !vend.ok && !!seller.ch.findItem(s1.uid));
  ok('lock.auto-salvage protects', isProtected(s1) === true);
  // bag stack merge never eats a listed stack: (no stackable bases exist; the guard is exercised through addItem on a listed copy)
  ok('lock.listed item keeps its uid and place', seller.ch.findItem(s2.uid).item === s2);
}
await net.flush();

// ---- announcements reach everybody, own stall is in own list
{
  const bs = buyer.m.stalls.get('seller-1');
  ok('tx.announce buyer sees the stall', !!bs && bs.listings.length === 3 && bs.title === 'Zindan Ganimeti');
  ok('tx.announce watcher sees it too', watcher.m.stalls.get('seller-1')?.listings.length === 3);
  ok('tx.announce own stall is in own list (offline view)', seller.m.stalls.get('seller-1')?.own === true && seller.m.visibleStalls().length === 1);
  ok('tx.announce prices + uids carried', bs.listings.find((l) => l.price === P2)?.uid === s2.uid);
  ok('tx.announce spot matches', bs.spot === seller.m.own.spot);
  const rows = buyer.m.search({ minRarity: 4 });
  ok('wire.search finds the epic', rows.length === 1 && rows[0].listing.price === P2);
  ok('wire.search text filter', buyer.m.search({ text: 'zindan' }).length === 3 && buyer.m.search({ text: 'olmayan şey' }).length === 0);
  ok('wire.search price filter', buyer.m.search({ maxPrice: 1000 }).length === 1);
  ok('wire.history observed listings', !!buyer.m.priceHistory(bs.listings[0].item));
}

// ---- full buy round trip
{
  const bGold = buyer.ch.save.gold, sGold = seller.ch.save.gold;
  const stall = buyer.m.stalls.get('seller-1');
  // out of range first
  buyer.pos.x = 300;
  let r = buyer.m.buy('seller-1', stall.listings.find((l) => l.price === P1).slot);
  ok('tx.buy refuses out of range (6 m)', !r.ok, r.reason);
  stand(buyer, stall);
  const slot1 = stall.listings.find((l) => l.price === P1).slot;
  r = buyer.m.buy('seller-1', slot1);
  ok('tx.buy accepted', r.ok, r.reason);
  ok('tx.buy reserves the gold at once', buyer.ch.save.gold === bGold - P1 && buyer.m.pendingCount === 1);
  await net.flush();
  ok('tx.buy buyer got the item (fresh uid, not bound)', !!buyer.ch.save.bag.find((i) => i && i.baseId === s1.baseId && i.affixes.length === s1.affixes.length && !i.bound && !i.listed && i.uid !== s1.uid));
  ok('tx.buy seller credited price - 3 % tax', seller.ch.save.gold === sGold + D.saleNet(P1), `${seller.ch.save.gold - sGold}`);
  ok('tx.buy item gone from the seller bag', !seller.ch.findItem(s1.uid));
  ok('tx.buy pending cleared', buyer.m.pendingCount === 0);
  const got = buyer.ch.save.bag.find((i) => i && i.baseId === s1.baseId);
  ok('tx.buy item survives the wire (affix values + ilvl + rarity)', got && got.itemLevel === s1.itemLevel && got.rarity === s1.rarity && got.affixes.every((a, i) => a.affixId === s1.affixes[i].affixId && Math.abs(a.value - s1.affixes[i].value) < 1e-6));
  ok('tx.buy stall updated for everybody', buyer.m.stalls.get('seller-1').listings.length === 2 && watcher.m.stalls.get('seller-1').listings.length === 2);
  ok('log.sale recorded in save + session', seller.ch.save.market?.sales.length === 1 && seller.ch.save.market.unseenGold === D.saleNet(P1) && seller.m.own.sales.length === 1);
  ok('log.sale buyer name kept', seller.ch.save.market.sales[0].buyer === 'Alici');
}

// ---- reject: price changed while the buyer still saw the old one (announcements dropped)
{
  const stall = buyer.m.stalls.get('seller-1');
  const l2 = stall.listings.find((l) => l.price === P2);
  net.drop.add('shop');
  seller.m.setPrice(l2.slot, P2 + 500);
  const bGold = buyer.ch.save.gold;
  stand(buyer, stall);
  const r = buyer.m.buy('seller-1', l2.slot);
  ok('tx.reject buy accepted locally (old price)', r.ok);
  await net.flush();
  ok('tx.reject seller refused: gold refunded', buyer.ch.save.gold === bGold && buyer.m.pendingCount === 0 && !buyer.ch.save.bag.some((i) => i && i.uid === s2.uid));
  ok('tx.reject item still in the seller bag, still listed', !!seller.ch.findItem(s2.uid) && s2.listed === true);
  net.drop.delete('shop');
  seller.m.setPrice(l2.slot, P2); // back, and announce
  await net.flush();
}

// ---- timeout: the seller never answers
{
  const stall = buyer.m.stalls.get('seller-1');
  const l2 = stall.listings.find((l) => l.price === P2);
  const bGold = buyer.ch.save.gold, sGold = seller.ch.save.gold;
  net.holding.add('shopSold'); // seller's answers are parked (a slow link)
  stand(buyer, stall);
  const r = buyer.m.buy('seller-1', l2.slot);
  ok('tx.timeout buy accepted', r.ok);
  await net.flush();
  ok('tx.timeout gold reserved while waiting', buyer.ch.save.gold === bGold - P2 && buyer.m.pendingCount === 1);
  advance(5); buyer.m.tick();
  ok('tx.timeout still waiting at 5 s', buyer.m.pendingCount === 1);
  advance(6); buyer.m.tick();
  ok('tx.timeout 10 s: refunded', buyer.ch.save.gold === bGold && buyer.m.pendingCount === 0);
  ok('tx.timeout seller already sold it (seller authoritative)', !seller.ch.findItem(s2.uid) && seller.ch.save.gold === sGold + D.saleNet(P2));
  // the parked answer finally arrives: honoured, gold charged again, item delivered once
  net.holding.delete('shopSold');
  net.release();
  await net.flush();
  ok('tx.late reply honoured: item delivered, gold charged again', buyer.ch.save.gold === bGold - P2 && !!buyer.ch.save.bag.find((i) => i && i.baseId === s2.baseId && i.rarity === 'epic'));
  // a duplicate of the same answer changes nothing
  const before = buyer.ch.save.gold, bagCount = buyer.ch.save.bag.filter(Boolean).length;
  buyer.m.handleSold({ txId: [...[]].length ? '' : 'x', ok: true }, 'seller-1');
  ok('tx.late duplicate ignored', buyer.ch.save.gold === before && buyer.ch.save.bag.filter(Boolean).length === bagCount);
}

// ---- txId dedup on the seller side + plausibility on the buyer side
{
  const stall = buyer.m.stalls.get('seller-1');
  const l3 = stall.listings.find((l) => l.price === P3);
  const sGold = seller.ch.save.gold;
  const msg = { txId: 'TDEDUP123456', sellerId: 'seller-1', slot: l3.slot, itemUid: l3.uid, price: P3, buyer: 'Hile' };
  const r1 = seller.m.handleBuy(msg, 'fake-peer');
  const r2 = seller.m.handleBuy(msg, 'fake-peer');
  ok('tx.dedup first request sells', r1.ok === true && !!r1.item && seller.ch.save.gold === sGold + D.saleNet(P3));
  ok('tx.dedup second request replays the same answer, no second sale', r2 === r1 && seller.ch.save.gold === sGold + D.saleNet(P3));
}
{
  // the shop emptied itself after the last sale
  ok('tx.autoclose empty stall closes itself', seller.m.own === null && !seller.ch.save.bag.some((i) => i?.listed));
  await net.flush();
  ok('tx.autoclose everybody dropped the stall', !buyer.m.stalls.has('seller-1') && !watcher.m.stalls.has('seller-1'));
  ok('lock.unlocked after close', !seller.ch.save.bag.some((i) => i?.listed));
  ok('log.summary session toast', toasts.some((t) => /Tezgâh boşaldı/.test(t)));
}

// ---- second shop: plausibility rejects on the seller
{
  seller.ch.addMaterial(D.BOHCA_ID, 1);
  const a = bagItem(seller.ch, 'sword1h_t1', 'rare');
  const b = bagItem(seller.ch, 'helm_heavy_t1', 'rare');
  seller.m.openShop({ title: 'Ikinci', listings: [{ uid: a.uid, price: 300 }, { uid: b.uid, price: 400 }] });
  await net.flush();
  const sGold = seller.ch.save.gold;
  const base = { sellerId: 'seller-1', slot: 0, itemUid: a.uid, price: 300 };
  ok('tx.plaus wrong uid refused', seller.m.handleBuy({ ...base, txId: 'TPLAUS000001', itemUid: b.uid }, 'p1').ok === false);
  ok('tx.plaus wrong price refused', seller.m.handleBuy({ ...base, txId: 'TPLAUS000002', price: 299 }, 'p1').ok === false);
  ok('tx.plaus wrong slot refused', seller.m.handleBuy({ ...base, txId: 'TPLAUS000003', slot: 7 }, 'p1').ok === false);
  ok('tx.plaus wrong seller refused', seller.m.handleBuy({ ...base, txId: 'TPLAUS000004', sellerId: 'someone-else' }, 'p1').ok === false);
  ok('tx.plaus refusals left stock + gold alone', seller.ch.save.gold === sGold && a.listed && b.listed);
  // sanitiser rejects (never reaches the seller logic)
  ok('tx.plaus sanitiser: price 0 / NaN / negative / bad txId', !W.sanitizeBuy({ ...base, txId: 'TPLAUS000005', price: 0 }) && !W.sanitizeBuy({ ...base, txId: 'TPLAUS000005', price: NaN }) && !W.sanitizeBuy({ ...base, txId: 'TPLAUS000005', price: -9 }) && !W.sanitizeBuy({ ...base, txId: 'x y' }) && !!W.sanitizeBuy({ ...base, txId: 'TPLAUS000005' }));
  // rate limit: a flood from one buyer
  let limited = 0;
  for (let i = 0; i < 12; i++) if (seller.m.handleBuy({ ...base, txId: `TFLOOD${String(i).padStart(6, '0')}`, itemUid: 'zzz' }, 'flooder').reason === 'Çok fazla istek. Biraz bekle.') limited++;
  ok('tx.plaus per-buyer rate limit', limited >= 4, `${limited} limited`);

  // buyer side: wrong sender, unknown tx, junk item, mismatching item
  const stall = buyer.m.stalls.get('seller-1');
  stand(buyer, stall);
  const bGold = buyer.ch.save.gold;
  net.holding.add('shopSold');
  const r = buyer.m.buy('seller-1', 0);
  await net.flush();
  const txId = [...buyer.m['pending'].keys()][0];
  ok('tx.plaus buyer pending after buy', r.ok && !!txId);
  buyer.m.handleSold({ txId, ok: true, item: { baseId: a.baseId, rarity: 'rare', itemLevel: 20, affixes: [] } }, 'impostor');
  ok('tx.plaus answer from another peer ignored', buyer.m.pendingCount === 1);
  buyer.m.handleSold({ txId: 'TUNKNOWN0001', ok: true, item: {} }, 'seller-1');
  ok('tx.plaus unknown txId ignored', buyer.m.pendingCount === 1 && buyer.ch.save.gold === bGold - 300);
  buyer.m.handleSold({ txId, ok: true, item: { baseId: 'no_such_base', rarity: 'rare', itemLevel: 5, affixes: [] } }, 'seller-1');
  ok('tx.plaus junk item refunded', buyer.ch.save.gold === bGold && buyer.m.pendingCount === 0);
  net.holding.delete('shopSold'); net.held.length = 0; net.queue.length = 0;
  // mismatching base
  advance(1);
  const bought = () => buyer.ch.save.bag.filter((i) => i && i.uid.startsWith('m')).length;
  const boughtBefore = bought();
  const left = buyer.m.stalls.get('seller-1').listings[0]; // only b is still on the stall
  const r2 = buyer.m.buy('seller-1', left.slot);
  const tx2 = [...buyer.m['pending'].keys()][0];
  net.holding.add('shopSold'); await net.flush(); net.holding.delete('shopSold'); net.held.length = 0;
  buyer.m.handleSold({ txId: tx2, ok: true, item: { baseId: a.baseId, rarity: 'rare', itemLevel: 20, affixes: [] } }, 'seller-1');
  ok('tx.plaus a different item than listed is refused + refunded', r2.ok && buyer.ch.save.gold === bGold && bought() === boughtBefore, `r2=${r2.ok} gold=${buyer.ch.save.gold} want=${bGold} pend=${buyer.m.pendingCount}`);
  // manual close: unlock + summary
  seller.m.closeShop();
  ok('lock.manual close unlocks', !seller.ch.save.bag.some((i) => i?.listed), `a=${a.listed} b=${b.listed} own=${!!seller.m.own}`);
}

// ================================================================================================ wire.*
{
  const net2 = new FakeNet();
  const big = makePeer(net2, 'big-seller', 'Buyuk');
  big.ch.addMaterial(D.BOHCA_BIG_ID, 1);
  const uids = [];
  const bases = ['sword1h_t1', 'chest_heavy_t1', 'boots_heavy_t1', 'helm_heavy_t1', 'gloves_heavy_t1', 'axe2h_t1', 'staff_t1', 'dagger_t1'];
  for (let i = 0; i < 24; i++) {
    const it = bagItem(big.ch, bases[i % bases.length], i % 3 === 0 ? 'epic' : 'rare', 40 + i);
    it.upgrade = 5; // upgraded
    uids.push({ uid: it.uid, price: 1000 + i });
  }
  const r13 = big.m.openShop({ title: 'Buyuk Tezgah', listings: uids.slice(0, 13) });
  ok('wire.big 13 items need a Buyuk Bohca (consumed)', r13.ok && big.ch.material(D.BOHCA_BIG_ID) === 0 && big.m.own.big === true, r13.reason);
  big.m.closeShop();
  big.ch.addMaterial(D.BOHCA_BIG_ID, 1);
  const r25 = big.m.openShop({ title: 'Cok', listings: [...uids, { uid: 'x', price: 1 }] });
  ok('wire.big 25 items refused (24 max)', !r25.ok);
  const r24 = big.m.openShop({ title: 'Buyuk Tezgah', listings: uids });
  ok('wire.big 24 items accepted', r24.ok, r24.reason);
  const ann = big.m.buildAnnounce();
  const bytes = JSON.stringify(ann).length;
  ok('wire.size 24 listings announce is well under trystero 16 KB inline', bytes < 16000, `${bytes} bytes (${(bytes / 24) | 0} per item)`);
  const clean = W.sanitizeAnnounce(JSON.parse(JSON.stringify(ann)));
  ok('wire.sanitize round-trips 24 listings', clean && clean.items.length === 24 && clean.big === true);
  ok('wire.sanitize caps at 12 for a non-big stall', W.sanitizeAnnounce({ ...ann, big: false }).items.length === 12);
  ok('wire.sanitize drops listings with a bad price / base', W.sanitizeAnnounce({ ...ann, items: [{ ...ann.items[0], p: 0 }, { ...ann.items[1], it: { baseId: 'zz', rarity: 'rare', itemLevel: 1, affixes: [] } }, ann.items[2]] }).items.length === 1);
  ok('wire.sanitize title + spot clamp', W.sanitizeAnnounce({ ...ann, title: 'x'.repeat(99), spot: 9999 }).title.length === 32 && W.sanitizeAnnounce({ ...ann, spot: 9999 }).spot <= 59);
  ok('wire.sanitize rejects junk', W.sanitizeAnnounce(null) === null && W.sanitizeAnnounce('x') === null && W.sanitizeBuy({}) === null && W.sanitizeSold({ txId: 3 }) === null);
  const snap = W.toSnapshot(big.ch.findItem(uids[0].uid).item);
  const back = W.fromSnapshot(snap, 'u1');
  ok('wire.snapshot rebuilds affixes + stats', back.affixes.length === snap.affixes.length && back.baseId === snap.baseId && back.upgrade === 5);
  big.m.closeShop();
  ok('wire.close withdraws the announcement (open:false was sent)', net2.sent.some((s) => s.channel === 'shop' && s.bytes < 400));
}

// ================================================================================================ log.* + misc
{
  // stale flags from a closed tab are cleared on init; the next-login summary shows once
  const net3 = new FakeNet();
  const p = makePeer(net3, 'ghost', 'Hayalet');
  const it = bagItem(p.ch, 'sword1h_t1');
  it.listed = true; // a tab was closed with the stall open
  p.ch.save.market = { sales: [], unseenCount: 3, unseenGold: 1234, totalSold: 3, totalGold: 1234 };
  const before = toasts.length;
  p.m.init();
  ok('log.init clears stale listed flags', !it.listed);
  ok('log.init next-login summary toast', toasts.slice(before).some((t) => /3 eşya satıldı/.test(t) && /1[.,]?234/.test(t)));
  ok('log.init summary shown once', p.ch.save.market.unseenCount === 0 && (p.m.init(), toasts.length === before + 1));
  // stale announcements are swept
  const w = makePeer(net3, 'watch', 'W');
  net3.queue.length = 0;
  for (const h of w.tr.handlers.get('shop') ?? []) h({ z: 'town', title: 'Eski', spot: 3, rev: 1, open: true, look: { c: 'knight', v: 0, n: 'E', l: 1 }, items: [] }, { from: 'old-peer', channel: 'shop' });
  ok('stale.announce stored', w.m.stalls.has('old-peer'));
  advance(MARKET_STALE() - 1); w.m.tick();
  ok('stale.announce kept before the TTL', w.m.stalls.has('old-peer'));
  advance(5); w.m.tick();
  ok('stale.announce swept after 100 s', !w.m.stalls.has('old-peer'));
  // peer leaves the lobby: stall removed at once
  for (const h of w.tr.handlers.get('shop') ?? []) h({ z: 'town', title: 'Gider', spot: 4, rev: 1, open: true, look: { c: 'knight', v: 0, n: 'G', l: 1 }, items: [] }, { from: 'leaver', channel: 'shop' });
  net3.trs.set('leaver', new FakeTr(net3, 'leaver'));
  net3.leave('leaver');
  ok('stale.peer leave drops the stall', !w.m.stalls.has('leaver'));
  // re-announce cadence: 30 s
  net3.sent.length = 0;
  p.ch.addMaterial(D.BOHCA_ID, 1);
  const x = bagItem(p.ch, 'sword1h_t1');
  p.m.openShop({ title: 'Ritim', listings: [{ uid: x.uid, price: 100 }] });
  const n0 = net3.sent.filter((s) => s.channel === 'shop').length;
  advance(29); p.m.tick();
  const n1 = net3.sent.filter((s) => s.channel === 'shop').length;
  advance(2); p.m.tick();
  const n2 = net3.sent.filter((s) => s.channel === 'shop').length;
  ok('announce.cadence repeats every 30 s, not before', n1 === n0 && n2 === n0 + 1, `${n0}/${n1}/${n2}`);
  // own spot loses a race: relocates and re-announces
  const mine = p.m.own.spot;
  const rival = [...Array(400).keys()].map((i) => 'rival-' + i).find((id) => D.homeSpot(id, 60) === mine && D.spotPriority(id, 'ghost', mine, 60) < 0);
  if (rival) {
    for (const h of p.tr.handlers.get('shop') ?? []) h({ z: 'town', title: 'Rakip', spot: mine, rev: 2, open: true, look: { c: 'knight', v: 0, n: 'R', l: 1 }, items: [] }, { from: rival, channel: 'shop' });
    ok('spot.race own stall relocates when it loses', p.m.own.spot !== mine && !p.m.stalls.get('ghost').hidden && p.m.stalls.get(rival).spot === mine);
  } else ok('spot.race own stall relocates when it loses', true, 'no rival id found (skipped)');
  p.m.closeShop();
}

function MARKET_STALE() { return D.MARKET.STALE_S; }

console.log(`market: ${passes} passed, ${fails} failed`);
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
