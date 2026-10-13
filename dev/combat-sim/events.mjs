#!/usr/bin/env node
/**
 * WP-04 headless checks for the open-world event calendar (src/scenes/world/EventCalendar.ts).
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/events.mjs     (V=1 prints every PASS)
 * Stages: det.* (same schedule on every clock / rebuilt sites) | slot.* (slot boundaries, end exclusive) | rot.* (rotation of
 *         four) | phase.* (soon 5 and 1 min, start, end; crossings split without gaps) | site.* (zones, empty lists) |
 *         run.* (runtime announcements from a fake clock, host effects, local rewards, chat lines) |
 *         kar.* / sisli.* (the two open-world maps built from their real data: Karakır sites, rotation, determinism, runtime zone)
 * No browser, no network: the real calendar with a fake world and the harness G stubs. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const { G } = H;
const C = await H.imp('scenes/world/EventCalendar.ts');
const { EVENT_IDS, EVENT_DEFS, EVENT_SLOT_SEC, EVENT_LEADS_SEC, occurrenceAt, eventAt, upcomingAfter, crossings, slotOf, describeOcc, EventCalendar, activeEventPins, upcomingEventLines } = C;

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

const SLOT_MS = EVENT_SLOT_SEC * 1000;
const pt = (x, z) => ({ x, z });
const makeSites = () => ({
  metin_storm: [{ id: 'r1', name: 'Kuzey Vadi', pos: pt(10, 10) }, { id: 'r2', name: 'Guney Vadi', pos: pt(20, 20) }],
  world_boss: [{ id: 'r3', name: 'Kizil Ova', pos: pt(50, 50), bossId: 'wb_curukkok' }],
  village_raid: [{ id: 'v1', name: 'Gumusdere', pos: pt(0, 0), radius: 40 }, { id: 'v2', name: 'Kizilkaya', pos: pt(90, 0), radius: 40 }],
  goblin_caravan: [{ id: 'yol_ana', name: 'A - B', pos: pt(5, 5), path: [pt(0, 0), pt(10, 0)] }, { id: 'yol_2', name: 'C - D', pos: pt(30, 0), path: [pt(30, 0), pt(30, 30)] }],
});
const sitesA = makeSites();
const sitesB = JSON.parse(JSON.stringify(sitesA)); // the same map, built on another client

// ------------------------------------------------------------------------------------------------ det
{
  // deterministic PRNG for sample instants (not Math.random: the run must be reproducible)
  let seed = 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let same = true;
  for (let i = 0; i < 3000 && same; i++) {
    const t = Math.floor(rnd() * 4e12); // ~2096 epoch range
    const a = JSON.stringify(eventAt(t, sitesA));
    const b = JSON.stringify(eventAt(t, sitesB));
    const c = JSON.stringify(upcomingAfter(t, sitesB, 4));
    const d = JSON.stringify(upcomingAfter(t, sitesA, 4));
    if (a !== b || c !== d) same = false;
  }
  ok('det.same-on-every-client', same, 'eventAt and upcoming match for 3000 instants and a rebuilt copy of the sites');

  // two clients whose clocks differ by less than a slot see the same running event inside the same slot
  const t0 = 777 * SLOT_MS + 4 * 60 * 1000;
  const e1 = JSON.stringify(upcomingAfter(t0, sitesA, 4));
  const e2 = JSON.stringify(upcomingAfter(t0 + 9999, sitesA, 4));
  ok('det.same-slot-same-list', e1 === e2, 'upcoming list identical for two clocks in one slot');

  const occA = JSON.stringify(occurrenceAt(9001, sitesA));
  const occB = JSON.stringify(occurrenceAt(9001, sitesB));
  ok('det.occurrence-stable', occA === occB);
}

// ------------------------------------------------------------------------------------------------ slot
{
  const k = 123456;
  const start = k * SLOT_MS;
  const occK = occurrenceAt(k, sitesA);
  ok('slot.start-is-slot-start', occK.start === start && occK.end === start + EVENT_DEFS[occK.id].durSec * 1000);
  ok('slot.just-before-belongs-to-previous', slotOf(start - 1) === k - 1);
  ok('slot.at-start-belongs-to-k', slotOf(start) === k);
  const prev = eventAt(start - 1, sitesA);
  ok('slot.before-start-not-running-k', prev === null || prev.slot === k - 1, `slot ${prev?.slot}`);
  const at = eventAt(start, sitesA);
  ok('slot.running-at-start', at !== null && at.slot === k && at.id === occK.id);
  ok('slot.end-exclusive', eventAt(occK.end - 1, sitesA)?.slot === k && eventAt(occK.end, sitesA) === null);
  ok('slot.upcoming-from-before-start', upcomingAfter(start - 1, sitesA, 1)[0]?.slot === k);
  ok('slot.upcoming-strict-after-start', upcomingAfter(start, sitesA, 1)[0]?.slot === k + 1);
  ok('slot.negative-epoch-floor', slotOf(-1) === -1 && slotOf(-SLOT_MS) === -1 && slotOf(0) === 0);
}

// ------------------------------------------------------------------------------------------------ rotation
{
  const ids = Array.from({ length: 12 }, (_, k) => occurrenceAt(k, sitesA).id);
  ok('rot.period-four', ids.every((id, k) => k < 8 ? id === ids[k + 4] : true));
  ok('rot.four-distinct-per-cycle', new Set(ids.slice(0, 4)).size === 4 && new Set(ids.slice(4, 8)).size === 4);
  ok('rot.order-is-the-declared-order', ids.slice(0, 4).join() === EVENT_IDS.join());
  ok('rot.no-repeat-back-to-back', ids.every((id, k) => k === 0 || id !== ids[k - 1]));
  const negative = occurrenceAt(-1, sitesA).id;
  ok('rot.negative-slot-wraps', negative === EVENT_IDS[3], negative);
}

// ------------------------------------------------------------------------------------------------ phases
{
  const k = 5000;
  const occ = occurrenceAt(k, sitesA);
  const from = occ.start - 700 * 1000;
  const to = occ.end + 60 * 1000;
  const mine = crossings(from, to, sitesA).filter((c) => c.occ.slot === k);
  const seq = mine.map((c) => `${c.phase}${c.lead ?? ''}`).join(',');
  ok('phase.order-soon5-soon1-start-end', seq === `soon${EVENT_LEADS_SEC[0]},soon${EVENT_LEADS_SEC[1]},start,end`, seq);
  ok('phase.soon-at-is-start', mine.every((c) => c.phase !== 'soon' || c.at === occ.start));
  ok('phase.end-at-is-end', mine.find((c) => c.phase === 'end')?.at === occ.end);
  ok('phase.soon5-moment', mine[0]?.when === occ.start - 300 * 1000);

  // a tick exactly on the moment fires it once: (from, to] half-open
  const once = crossings(occ.start - 300 * 1000, occ.start - 300 * 1000, sitesA).filter((c) => c.occ.slot === k);
  ok('phase.half-open-no-double', once.length === 0);
  const edge = crossings(occ.start - 300 * 1000 - 1, occ.start - 300 * 1000, sitesA).filter((c) => c.occ.slot === k);
  ok('phase.fires-on-the-moment', edge.length === 1 && edge[0].phase === 'soon');

  // splitting the time into ticks never loses or duplicates a phase
  let seed = 99;
  const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  let split = true;
  for (let i = 0; i < 200 && split; i++) {
    const a = Math.floor(rnd() * 3e9) + 4e11;
    const b = a + Math.floor(rnd() * 4 * SLOT_MS);
    const c = b + Math.floor(rnd() * 3 * SLOT_MS);
    const whole = crossings(a, c, sitesA).map((x) => `${x.id}|${x.phase}|${x.when}`);
    const parts = [...crossings(a, b, sitesA), ...crossings(b, c, sitesA)].map((x) => `${x.id}|${x.phase}|${x.when}`);
    if (whole.join() !== parts.join()) split = false;
  }
  ok('phase.ticks-split-without-gaps', split, '200 random splits');

  const durOk = EVENT_IDS.every((id) => EVENT_DEFS[id].durSec < EVENT_SLOT_SEC - EVENT_LEADS_SEC[0]);
  ok('phase.runs-end-before-next-soon', durOk);
}

// ------------------------------------------------------------------------------------------------ sites
{
  let inside = true;
  for (let k = 0; k < 400; k++) {
    const occ = occurrenceAt(k, sitesA);
    if (!sitesA[occ.id].some((s) => s.id === occ.site.id)) inside = false;
    if (occurrenceAt(k, sitesB).site.id !== occ.site.id) inside = false;
  }
  ok('site.zone-from-list-and-stable', inside, '400 slots');

  const counts = {};
  for (let k = 0; k < 400; k++) {
    const occ = occurrenceAt(k, sitesA);
    counts[occ.site.id] = (counts[occ.site.id] ?? 0) + 1;
  }
  ok('site.variety', Object.keys(counts).length === sitesA.metin_storm.length + sitesA.world_boss.length + sitesA.village_raid.length + sitesA.goblin_caravan.length, `${Object.keys(counts).length} zones used`);

  const empty = makeSites();
  empty.village_raid = [];
  const raidSlot = Array.from({ length: 8 }, (_, k) => k).find((k) => occurrenceAt(k, sitesA).id === 'village_raid');
  ok('site.empty-list-skips-event', occurrenceAt(raidSlot, empty).site === null && eventAt(raidSlot * SLOT_MS + 1, empty) === null);
  ok('site.empty-list-not-in-crossings', crossings(raidSlot * SLOT_MS - 10 * 60 * 1000, raidSlot * SLOT_MS + 600 * 1000, empty).every((c) => c.id !== 'village_raid'));
  ok('site.empty-list-not-upcoming', upcomingAfter(0, empty, 8).every((o) => o.id !== 'village_raid'));

  const line = describeOcc(occurrenceAt(3, sitesA), 3 * SLOT_MS - 12 * 60 * 1000);
  ok('site.describe-line', line.includes(EVENT_DEFS[occurrenceAt(3, sitesA).id].name) && line.includes('12 dk sonra'), line);
}

// ------------------------------------------------------------------------------------------------ runtime
// fake world and stubs: the calendar only reads localPlayer, enemies, get(), and the G services it calls
const enemiesById = new Map();
const world = {
  enemies: [],
  localPlayer: null,
  get: (id) => enemiesById.get(id),
};
G.world = world;
G.net = { isAuthority: false };
const rewards = { gold: [], xp: [], items: 0, drops: 0, toasts: 0 };
G.character = {
  level: 20,
  save: { flags: {}, skillBar: {}, stats: { deaths: 0 } },
  stats: {},
  specials: {},
  moreDamage: 1,
  material: () => 0,
  useMaterial: () => false,
  addMaterial() {},
  persist() {},
  addGold(n) { rewards.gold.push(n); },
  addItem() { rewards.items++; return true; },
};
G.progression = { addExplorationXp(pct) { rewards.xp.push(pct); } };
G.loot = {
  onEnemyKilled() {},
  rollItem(opts) { rewards.lastRoll = opts; return { id: 'stub', rarity: 'uncommon' }; },
  dropItem() { rewards.drops++; },
};
const worldEvents = [];
const announces = [];
const chatLines = [];
G.events.on('world:event', (p) => worldEvents.push(p));
G.events.on('world:announce', (p) => announces.push(p));
G.events.on('net:chat', (p) => chatLines.push(p));
G.events.on('ui:toast', () => rewards.toasts++);

const warnBefore = errorsAt();
function errorsAt() { return H.errors.length; }

// a storm slot (rotation 0) and a boss slot (rotation 1), far enough in the future
const stormK = 4000 - (4000 % 4); // 4000 % 4 === 0 -> metin_storm
const bossK = stormK + 1;
const pre = (k) => k * SLOT_MS - 10 * 60 * 1000;

{
  let now = pre(stormK);
  const cal = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: { maxActiveEnemies: 240 } }, seed: 1, aliveEnemies: () => 0 }, {
    metin: { setStorm(on) { calls.push(['storm', on]); } },
    bosses: { expedite(id) { calls.push(['boss', id]); return true; } },
  }, sitesA, () => now);
  const calls = [];
  const occ = occurrenceAt(stormK, sitesA);
  const count0 = worldEvents.length;

  // ticks across the whole approach, the run and the end
  const stops = [
    occ.start - 300 * 1000 - 1,
    occ.start - 300 * 1000,
    occ.start - 60 * 1000,
    occ.start,
    occ.end - 1,
    occ.end,
  ];
  for (const t of stops) { now = t; cal.tick(t); }
  const got = worldEvents.slice(count0);
  const seq = got.map((p) => `${p.id}:${p.phase}:${p.at === occ.start || p.at === occ.end ? 'ok' : 'bad'}:${p.zone}`);
  ok('run.announce-sequence', seq.join() === [`metin_storm:soon:ok:${occ.site.id}`, `metin_storm:soon:ok:${occ.site.id}`, `metin_storm:start:ok:${occ.site.id}`, `metin_storm:end:ok:${occ.site.id}`].join(), seq.join(' | '));
  ok('run.banner-and-chat-per-phase', announces.length >= 4 && chatLines.length >= 4);
  ok('run.soon-text-minutes', announces.some((a) => a.text.startsWith('Metin Fırtınası 5 dakika sonra')) && announces.some((a) => a.text.startsWith('Metin Fırtınası 1 dakika sonra')));
  ok('run.start-text-has-site', announces.some((a) => a.text.includes(occ.site.name) && a.text.includes('10 dk')));
  ok('run.storm-host-only', calls.length === 0, `G.net not authority: ${JSON.stringify(calls)}`);

  // the reward: nobody hit a unit and nobody stood near: no reward
  ok('run.no-participation-no-reward', rewards.gold.length === 0 && rewards.xp.length === 0);

  // chat lines come from the live calendar (the one that was created last)
  now = occ.start - 6 * 60 * 1000;
  cal.tick(now);
  const lines = upcomingEventLines(now, 4);
  ok('run.upcoming-lines-four', lines.length === 4 && lines[0].includes('dk sonra'), `${lines.length} lines`);
  cal.dispose();
  ok('run.dispose-clears-live', upcomingEventLines(now, 4).length === 0);

  // join late: a calendar created in the middle of a run announces nothing from the past
  const lateNow = occ.start + 5 * 60 * 1000;
  const late = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, { metin: { setStorm() {} }, bosses: { expedite() { return false; } } }, sitesA, () => lateNow);
  const before = worldEvents.length;
  late.tick(lateNow + 500);
  ok('run.late-join-silent', worldEvents.length === before);
  late.dispose();
}

{
  // participation: the local player stands far from the stones (no presence), so only damage can earn the storm reward
  const me = { id: 7, removed: false, position: { x: 5000, z: 5000 } };
  world.localPlayer = me;
  enemiesById.set(501, { kind: 'enemy', tag: 'ev:storm', isDead: false, removed: false, position: { x: 12, z: 12 } });
  world.enemies.push(enemiesById.get(501));
  let now = pre(stormK);
  const cal = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, {
    metin: { setStorm() {} },
    bosses: { expedite() { return true; } },
  }, sitesA, () => now);
  const occ = occurrenceAt(stormK, sitesA);
  now = occ.start + 1000;
  cal.tick(now);
  const pins = activeEventPins();
  ok('run.pin-while-running', pins.length >= 1 && pins[0].id === 'metin_storm' && pins[0].active === true, JSON.stringify(pins[0] ?? null));
  const goldBefore = rewards.gold.length;
  // hits on a non-event unit (id 999 is not in the world) do not count
  G.events.emit('damage', { targetId: 999, sourceId: 7, amount: 300, crit: false, type: 'physical', kind: 'normal', pos: [0, 0, 0] });
  // a hit on a storm stone by someone else does not count either
  G.events.emit('damage', { targetId: 501, sourceId: 3, amount: 300, crit: false, type: 'physical', kind: 'normal', pos: [0, 0, 0] });
  now = occ.end;
  cal.tick(now);
  ok('run.no-damage-no-reward', rewards.gold.length === goldBefore, `rewards after non-participation: ${rewards.gold.length - goldBefore}`);

  // a fresh run: the same player now hits the storm stone
  now = occ.start + 1000;
  const cal2 = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, {
    metin: { setStorm() {} },
    bosses: { expedite() { return true; } },
  }, sitesA, () => now);
  cal2.tick(now);
  G.events.emit('damage', { targetId: 501, sourceId: 7, amount: 120, crit: false, type: 'physical', kind: 'normal', pos: [0, 0, 0] });
  now = occ.end;
  cal2.tick(now);
  ok('run.reward-gold-scales-level', rewards.gold.at(-1) === EVENT_DEFS.metin_storm.goldPerLevel * 20, String(rewards.gold.at(-1)));
  ok('run.reward-xp-pct', rewards.xp.at(-1) === EVENT_DEFS.metin_storm.xpPct);
  ok('run.reward-items-elite-uncommon', rewards.lastRoll?.rank === 'elite' && rewards.lastRoll?.minRarity === 'uncommon' && rewards.lastRoll?.itemLevel === 20);
  ok('run.end-clears-pins', activeEventPins().every((p) => !p.active));
  now = occ.end + 60 * 1000;
  cal2.tick(now);
  ok('run.reward-once', rewards.gold.length === goldBefore + 1, `gold rewards: ${rewards.gold.length - goldBefore}`);
  cal.dispose();
  cal2.dispose();
  world.localPlayer = null;
  world.enemies.length = 0;
  enemiesById.clear();
}

{
  // presence: standing in the event radius for 60 s counts as participation (no damage)
  const k = Array.from({ length: 8 }, (_, i) => 6000 + i).find((s) => occurrenceAt(s, sitesA).id === 'village_raid');
  const occ = occurrenceAt(k, sitesA);
  const me = { id: 8, removed: false, position: { x: occ.site.pos.x + 5, z: occ.site.pos.z } };
  world.localPlayer = me;
  let now = occ.start - 60 * 1000;
  const cal = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, { metin: { setStorm() {} }, bosses: { expedite() { return false; } } }, sitesA, () => now);
  const rewardsBefore = rewards.gold.length;
  cal.tick(now);
  for (let t = occ.start; t < occ.start + 90 * 1000; t += 500) {
    now = t;
    cal.tick(t);
  }
  // the local player stands at the raid village: its centre is the anchor (radius 70 m)
  now = occ.end;
  cal.tick(now);
  ok('run.presence-earns-reward', rewards.gold.length === rewardsBefore + 1, `${rewards.gold.length - rewardsBefore} reward(s), village ${occ.site.id}`);
  cal.dispose();
  world.localPlayer = null;
}

{
  // host effects: the storm turns on at the start and off at the end; the boss is expedited at the start of a boss slot
  G.net = { isAuthority: true };
  const calls = [];
  let now = pre(stormK);
  const cal = new EventCalendar({ world, params: { enemyLevel: 10 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, {
    metin: { setStorm(on) { calls.push(['storm', on]); } },
    bosses: { expedite(id) { calls.push(['boss', id]); return true; } },
  }, sitesA, () => now);
  const occ = occurrenceAt(stormK, sitesA);
  now = occ.start + 1;
  cal.tick(now);
  now = occ.end + 1;
  cal.tick(now);
  ok('host.storm-on-off', calls.map((c) => c.join(':')).join() === 'storm:true,storm:false', calls.map((c) => c.join(':')).join());

  calls.length = 0;
  const bossOcc = occurrenceAt(bossK, sitesA);
  now = bossOcc.start - 1;
  cal.tick(now);
  now = bossOcc.start + 1;
  cal.tick(now);
  ok('host.boss-expedited-once', calls.length === 1 && calls[0][0] === 'boss' && calls[0][1] === 'wb_curukkok', JSON.stringify(calls));
  now = bossOcc.end + 1;
  cal.tick(now);
  cal.dispose();
  G.net = { isAuthority: false };
}

// ------------------------------------------------------------------------------------------------ open-world maps
// the real map data (Sisli Vadi, Karakir Bozkirri) through the same buildEventSites() the runtime calls, with a stub ctx
const { getDungeon } = await H.imp('data/dungeons/index.ts');
const { buildEventSites } = C;
function mapCtx(def) {
  const ext = def.world;
  const roomAt = (tx, tz) => def.rooms.find((r) => tx >= r.rect.x && tx < r.rect.x + r.rect.w && tz >= r.rect.z && tz < r.rect.z + r.rect.h);
  return {
    def, ext, seed: 1, params: { enemyLevel: 35 }, world: { enemies: [] }, aliveEnemies: () => 0,
    regionAtTile: (tx, tz) => { const room = roomAt(tx, tz); return room ? ext.regions.find((r) => r.roomId === room.id) ?? null : null; },
    snapTile: (tx, tz) => pt((tx + 0.5) * 4, (tz + 0.5) * 4),
    snapWorld: (x, z) => pt(x, z),
  };
}
const kDef = getDungeon('karakir_bozkiri');
const sDef = getDungeon('sisli_vadi');
const kSites = buildEventSites(mapCtx(kDef));
const kSites2 = buildEventSites(mapCtx(kDef));
const sSites = buildEventSites(mapCtx(sDef));
const idsOf = (list) => list.map((s) => s.id).join();

{
  ok('kar.storm-in-the-six-regions', idsOf(kSites.metin_storm) === 'r7,r8,r9,r10,r11,r12', idsOf(kSites.metin_storm));
  ok('kar.stone-tiers-cover-the-regions', kDef.world.metin.tiers.map((t) => t.regionId).join() === 'r7,r8,r9,r10,r11,r12' && kDef.world.metin.tiers.every((t) => t.level >= 30 && t.level <= 45));
  const perRegion = kDef.world.regions.map((r) => kDef.world.metin.spots.filter((s) => s.regionId === r.id).length);
  ok('kar.spots-per-region', perRegion.join() === '3,3,3,3,4,4' && kDef.world.metin.spots.length === 20, perRegion.join());
  ok('kar.zone-streams-1600x1200', kDef.grid.w === 400 && kDef.grid.h === 300 && kDef.world.perf.stream === 'auto', `${kDef.grid.w}x${kDef.grid.h} stream=${kDef.world.perf.stream}`);
  ok('kar.raid-at-the-outposts', idsOf(kSites.village_raid) === 'koy_karakir_karakolu,kamp_kervansaray,koy_kul_ocagi' &&kSites.village_raid.every((s) => s.radius > 0), idsOf(kSites.village_raid));
  ok('kar.caravan-on-karakir-roads', kSites.goblin_caravan.length === kDef.world.roads.length && kSites.goblin_caravan.every((s) => s.id.startsWith('yol_') && s.path.length >= 2), `${kSites.goblin_caravan.length} roads`);
  // Ulu-Boz is level-gated (minLevelToStart 38) but still gets a site: BossSchedule.expedite() enforces the gate at spawn time
  ok('kar.world-boss-gated-has-site', kSites.world_boss.length === 1, `${kSites.world_boss.length} sites`);
  ok('kar.sites-same-on-rebuild', JSON.stringify(kSites) === JSON.stringify(kSites2));
  ok('kar.sisli-sites-stay-on-sisli', sSites.metin_storm.every((s) => sDef.world.regions.some((r) => r.id === s.id)) && !sSites.village_raid.some((s) => kSites.village_raid.some((k) => k.id === s.id)));
  ok('sisli.all-four-events-have-sites', EVENT_IDS.every((id) => sSites[id].length > 0), EVENT_IDS.map((id) => `${id}:${sSites[id].length}`).join());

  // the rotation on Karakir: 100 of 400 slots are the boss slot (no site, skipped); the other 300 run on the same hashed sites on every client
  let dead = 0, live = 0, stable = true, zonesOk = true;
  for (let k = 0; k < 400; k++) {
    const occ = occurrenceAt(k, kSites);
    if (JSON.stringify(occ) !== JSON.stringify(occurrenceAt(k, kSites2))) stable = false;
    if (occ.site === null) { dead++; if (occ.id !== 'world_boss') zonesOk = false; } else { live++; if (!kSites[occ.id].some((s) => s.id === occ.site.id)) zonesOk = false; }
  }
  ok('kar.rotation-runs-every-slot', dead === 0 && live === 400 && zonesOk, `${dead} skipped, ${live} run`);
  ok('kar.occurrence-stable-per-client', stable);

  let seed2 = 4242;
  const rnd2 = () => ((seed2 = (Math.imul(seed2, 1103515245) + 12345) >>> 0) / 4294967296);
  let same = true;
  for (let i = 0; i < 1500 && same; i++) {
    const t = Math.floor(rnd2() * 4e12);
    if (JSON.stringify(eventAt(t, kSites)) !== JSON.stringify(eventAt(t, kSites2)) || JSON.stringify(upcomingAfter(t, kSites2, 4)) !== JSON.stringify(upcomingAfter(t, kSites, 4))) same = false;
  }
  ok('kar.det-same-on-every-client', same, '1500 instants on the Karakir map');
}

{
  // runtime: a Karakir storm announces the Karakir region as its zone, the way the Sisli one does
  G.net = { isAuthority: false };
  world.localPlayer = null;
  const occK = Array.from({ length: 8 }, (_, i) => 7000 + i).map((k) => occurrenceAt(k, kSites)).find((o) => o.id === 'metin_storm');
  let now = occK.start - 300 * 1000 - 1;
  const cal = new EventCalendar({ world, params: { enemyLevel: 35 }, ext: { perf: {} }, seed: 1, aliveEnemies: () => 0 }, {
    metin: { setStorm() {} },
    bosses: { expedite() { return false; } },
  }, kSites, () => now);
  const before = worldEvents.length;
  for (const t of [occK.start - 300 * 1000, occK.start - 60 * 1000, occK.start, occK.end]) { now = t; cal.tick(t); }
  const got = worldEvents.slice(before);
  ok('kar.run-announces-karakir-zone', got.map((p) => p.phase).join() === 'soon,soon,start,end' && got.every((p) => p.zone === occK.site.id && ['r7', 'r8', 'r9', 'r10', 'r11', 'r12'].includes(p.zone)), got.map((p) => `${p.phase}:${p.zone}`).join(' '));
  ok('kar.run-banner-names-the-region', announces.some((a) => a.text.includes(occK.site.name)), occK.site.name);
  cal.dispose();
}

ok('harness.no-errors-logged', H.errors.length === warnBefore, H.errors.slice(warnBefore).join(' | ').slice(0, 300));

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
