#!/usr/bin/env node
/**
 * Travel vignettes headless check (data/world/vignettes.ts; scenes/world/VignetteRules.ts, VignetteRun.ts, Vignettes.ts).
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/vignettes.mjs     (V=1 prints every PASS)
 * Stages: data.*   the defs: ids, kinds, durations (<= 90 s), enemy and item ids, the Sisli ring r1 (levels 1-5), lines, rewards
 *         rules.*  the level band, the eligibility and cooldowns, the weighted pick, the anchor window and the 200 m spacing
 *         map.*    the real Sisli Vadi map: the ring's road and POI sites are free of camps, villages, quest spots and escorts
 *         run.*    each kind as a state machine (VignetteRun): starts, completes, pays once, despawns or expires; the escort walk
 *         dir.*    the director on the real map and the real World: a player walking the ring rolls one (anchor 16-60 m away,
 *                  per-player cooldown), the props and the pin appear, the units spawn tagged, every kind's flow runs (fight,
 *                  pop-up, tufts, hold, kills), the rewards are paid, and the despawn leaves nothing behind
 *         escort.*  the escort follow-up needs its route: none (refused), a route through a camp (refused), a clean route (offered)
 *         bystander.* a vignette another player triggers runs for the local player only inside the level band and off their cooldowns
 * The units and the props are real entities of the harness World (FakeEnemy spawns, VignetteProp); the nav is a stub (no route by
 * default; the escort block sets it to a straight route or one through a camp). No browser, no network. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const { G, world, held } = H;

// ------------------------------------------------------------------------------------------------ services the sim reads
const bag = new Map();
const gold = [];
const xpGain = [];
const toasts = [];
const lines = [];
const asks = [];
let askAnswer = true;
G.character.material = (id) => bag.get(id) ?? 0;
G.character.addMaterial = (id, n) => { bag.set(id, (bag.get(id) ?? 0) + n); };
G.character.useMaterial = (id, n) => { const have = bag.get(id) ?? 0; if (have < n) return false; bag.set(id, have - n); return true; };
G.character.addGold = (n) => { gold.push(n); };
G.character.persist = () => {};
G.progression = { addExplorationXp: (p) => { xpGain.push(p); } };
G.ui = {
  say: (_anchor, o) => { lines.push(o.text); },
  toast: (text) => { toasts.push(text); },
  confirm: (text) => { asks.push(text); return Promise.resolve(askAnswer); },
  addWorldLabel: () => ({ remove() {} }),
};
G.barks = { rumor: (_from, text) => { lines.push(text); }, update() {}, dispose() {}, npcLine: () => null };
G.net = { isAuthority: true, role: 'host', broadcast: () => {}, sendTo: () => {} };
G.events.on('ui:toast', ({ text }) => { toasts.push(text); });

let fails = 0;
let passes = 0;
const VERBOSE = !!process.env.V;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || VERBOSE) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const V = await H.imp('data/world/vignettes.ts');
const Rules = await H.imp('scenes/world/VignetteRules.ts');
const { VignetteRun } = await H.imp('scenes/world/VignetteRun.ts');
const { OPEN_ZONES } = await H.imp('data/dungeons/index.ts');
const { getEnemyDef } = await H.imp('data/enemies.ts');
const { MATERIALS } = await H.imp('data/materials.ts');
const { QUESTS } = await H.imp('data/world/quests.ts');
const { WorldCtx } = await H.imp('scenes/world/util.ts');
const { questPropSpots } = await H.imp('scenes/world/WorldQuestProps.ts');
const { VignetteDirector, activeVignettePins } = await H.imp('scenes/world/Vignettes.ts');
const { VignetteProp } = await H.imp('entities/interactables/VignetteProp.ts');

const { VIGNETTE_DEFS, VIGNETTE_RULES, vignetteDef } = V;
const SV = OPEN_ZONES.sisli_vadi;
const R1 = SV.world.regions.find((r) => r.id === 'r1');
const KINDS = ['road_ambush', 'scout_herbs', 'wolf_hunt', 'goblin_sighting', 'stuck_cart'];
const DEF = (id) => {
  const d = vignetteDef(id);
  if (!d) throw new Error(`no def ${id}`);
  return d;
};

// ------------------------------------------------------------------------------------------------ data.*
ok('data.ids-unique', new Set(VIGNETTE_DEFS.map((d) => d.id)).size === VIGNETTE_DEFS.length);
ok('data.kinds-known', VIGNETTE_DEFS.every((d) => KINDS.includes(d.kind)));
ok('data.kinds-covered', KINDS.every((k) => VIGNETTE_DEFS.some((d) => d.kind === k)));
ok('data.durations', VIGNETTE_DEFS.every((d) => d.durSec > 0 && d.durSec <= 90), VIGNETTE_DEFS.map((d) => `${d.id}=${d.durSec}`).join(' '));
ok('data.ring-r1', !!R1 && VIGNETTE_DEFS.every((d) => d.regionId === 'r1'), 'every def on the Sisli ring r1');
ok('data.ring-band', !!R1 && R1.levels[0] === 1 && R1.levels[1] === 5, R1 ? JSON.stringify(R1.levels) : 'no r1');
ok('data.enemies-exist', VIGNETTE_DEFS.every((d) => [...d.enemies, d.herd?.enemyId].filter(Boolean).every((id) => getEnemyDef(id))));
ok('data.herb-item', VIGNETTE_DEFS.filter((d) => d.herb).every((d) => !!MATERIALS[d.herb.item]));
ok('data.followups', VIGNETTE_DEFS.filter((d) => d.kind === 'road_ambush').every((d) => d.followup === 'escort' || d.followup === 'satchel'));
ok('data.escort-short', VIGNETTE_DEFS.filter((d) => d.followup === 'escort').every((d) => (d.escortM ?? 40) <= 60));
ok('data.kills-fit', VIGNETTE_DEFS.filter((d) => d.killsNeeded > 0).every((d) => d.enemies[0] && d.killsNeeded <= d.count));
ok('data.lines', VIGNETTE_DEFS.every((d) => d.lines.start && d.lines.done && (d.followup === undefined || d.lines.ask)));
ok('data.rewards', VIGNETTE_DEFS.every((d) => d.reward.goldPerLevel > 0 && d.reward.xpPct > 0));
ok('data.weights-cooldowns', VIGNETTE_DEFS.every((d) => d.weight > 0 && d.cooldownSec > 0));
ok('data.rules', VIGNETTE_RULES.spacingM === 200 && VIGNETTE_RULES.anchorMinM >= 10 && VIGNETTE_RULES.anchorMaxM <= 80 && VIGNETTE_RULES.rollEveryM > 0 && VIGNETTE_RULES.lingerSec > 0);

// ------------------------------------------------------------------------------------------------ rules.*
ok('rules.ring-level', Rules.ringLevel([1, 5], 1) === 1 && Rules.ringLevel([1, 5], 3) === 3 && Rules.ringLevel([1, 5], 9) === 5 && Rules.ringLevel([1, 5], 0) === 1);
ok('rules.level-eligible', Rules.levelEligible([1, 5], 9) && !Rules.levelEligible([1, 5], 10) && !Rules.levelEligible([1, 5], 0));
ok('rules.eligible-ring', Rules.eligibleDefs(VIGNETTE_DEFS, 'r1', [1, 5], 2, () => true).length === VIGNETTE_DEFS.length);
ok('rules.eligible-other-ring', Rules.eligibleDefs(VIGNETTE_DEFS, 'r2', [5, 10], 2, () => true).length === 0);
ok('rules.eligible-cooldown', Rules.eligibleDefs(VIGNETTE_DEFS, 'r1', [1, 5], 2, (id) => id !== 'vg_izci_otu').every((d) => d.id !== 'vg_izci_otu'));
{
  const total = VIGNETTE_DEFS.reduce((s, d) => s + d.weight, 0);
  const n = 12000;
  const counts = new Map();
  for (let i = 0; i < n; i++) {
    const d = Rules.pickWeighted(VIGNETTE_DEFS, () => (i + 0.5) / n);
    counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  }
  const bad = VIGNETTE_DEFS.filter((d) => Math.abs((counts.get(d.id) ?? 0) - (d.weight / total) * n) > n * 0.005);
  ok('rules.pick-weights', bad.length === 0, bad.map((d) => d.id).join(' ') || 'every def in proportion to its weight');
}
{
  const sites = [{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 10, z: 0 }, { x: 150, z: 0 }, { x: 300, z: 0 }];
  const cands = Rules.anchorCandidates(sites, { x: 0, z: 0 }, []);
  ok('rules.anchor-window', cands.length === 1 && cands[0].x === 50, `${cands.length} candidate(s): only the spot 50 m away is in the 16-60 m window`);
  const near = Rules.anchorCandidates([{ x: 30, z: 0 }, { x: 40, z: 0 }], { x: 0, z: 0 }, [{ x: 0, z: 0 }]);
  ok('rules.anchor-spacing', near.length === 0, 'a spot within 200 m of an active vignette is refused');
  const free = Rules.freeSites([{ x: 5, z: 5 }, { x: 100, z: 0 }], [{ x: 0, z: 0, r: 20 }]);
  ok('rules.exclusions', free.length === 1 && free[0].x === 100);
}

// ------------------------------------------------------------------------------------------------ run.*
const F = (o = {}) => ({ dt: o.dt ?? 0, playerDist: o.dist ?? (() => 1e9), aliveTagged: o.alive ?? 0, herbsInBag: o.herbs ?? 0 });
const near = () => 5;
const at2 = () => 2;
const evs = (list, t) => list.filter((e) => e.t === t);
const runWith = (id, extra = {}) => new VignetteRun({ def: DEF(id), slot: 1, anchor: { x: 0, z: 0 }, level: 1, ...extra });

{ // escort: saved, the pop-up, the escort walks to the end point, paid once, despawns
  const r = new VignetteRun({ def: DEF('vg_yolcu_pusu_escort'), slot: 1, anchor: { x: 0, z: 0 }, level: 3, escortPath: [{ x: 0, z: 0 }, { x: 40, z: 0 }] });
  const b = r.begin();
  ok('run.escort.start', evs(b, 'phase')[0]?.to === 'ambush' && evs(b, 'say').length === 1 && !!r.escort);
  r.onDamage(12);
  r.update(1, F({ alive: 2 }));
  const s = r.update(1, F({ alive: 0 }));
  const g = evs(s, 'grant');
  ok('run.escort.saved', r.phase === 'saved' && g.length === 1 && g[0].why === 'thanks' && g[0].gold === 18 && g[0].xpPct === 1, JSON.stringify(g));
  ok('run.escort.ask', evs(s, 'ask').length === 1 && r.asking === 'followup');
  const a = r.answer(true);
  ok('run.escort.accept', r.phase === 'escort' && evs(a, 'say').length === 1 && r.escort.state === 'idle');
  r.onNpc();
  ok('run.escort.walk', r.escort.state === 'walking');
  let rewards = [];
  let steps = 0;
  while (r.phase !== 'done' && steps < 60) {
    steps++;
    rewards = rewards.concat(evs(r.update(1, F({ dist: near })), 'grant'));
  }
  ok('run.escort.done', r.phase === 'done' && steps <= 25 && steps >= 18, `${steps} s of walking`);
  ok('run.escort.reward', rewards.length === 1 && rewards[0].why === 'reward' && rewards[0].gold === 120 && rewards[0].xpPct === 8, JSON.stringify(rewards));
  let end = [];
  for (let k = 0; k < 10 && !r.isEnded; k++) end = end.concat(evs(r.update(1, F({ dist: near })), 'end'));
  ok('run.escort.despawn', r.isEnded && end.length === 1 && end[0].reason === 'done' && r.age <= 90, `age ${r.age.toFixed(0)} s`);
  ok('run.escort.paid-once', rewards.length === 1 && r.update(1, F()).length === 0);
}
{ // not in the fight: the traveler thanks, no pop-up, no reward, despawns
  const r = runWith('vg_yolcu_pusu_escort', { escortPath: [{ x: 0, z: 0 }, { x: 40, z: 0 }] });
  r.begin();
  let all = [];
  for (let k = 0; k < 12 && r.phase !== 'done'; k++) all = all.concat(r.update(1, F({ alive: 0 })));
  ok('run.bystander.no-offer', r.phase === 'done' && evs(all, 'ask').length === 0 && evs(all, 'grant').length === 0 && evs(all, 'say').length === 1);
}
{ // satchel: a pop-up, the satchel is picked, back to the traveler in range
  const r = runWith('vg_yolcu_pusu_heybe');
  r.begin();
  r.onDamage(5);
  r.update(1, F({ alive: 2 }));
  const s = r.update(1, F({ alive: 0 }));
  ok('run.satchel.ask', evs(s, 'grant')[0]?.gold === 6 && r.asking === 'followup');
  const a = r.answer(true);
  ok('run.satchel.phase', r.phase === 'satchel' && evs(a, 'phase')[0]?.to === 'satchel');
  r.onSatchel();
  ok('run.satchel.carry', r.phase === 'carry');
  const far = r.update(1, F({ dist: () => 30 }));
  ok('run.satchel.far', r.phase === 'carry' && evs(far, 'grant').length === 0);
  const back = r.update(1, F({ dist: at2 }));
  ok('run.satchel.reward', r.phase === 'done' && evs(back, 'grant')[0]?.gold === 30 && evs(back, 'grant')[0]?.xpPct === 6);
}
{ // a pop-up declined: the thanks stays, no mini quest
  const r = runWith('vg_yolcu_pusu_heybe');
  r.begin();
  r.onDamage(5);
  r.update(1, F({ alive: 2 }));
  r.update(1, F({ alive: 0 }));
  r.answer(false);
  ok('run.decline', r.phase === 'done' && evs(r.update(1, F()), 'grant').length === 0);
}
{ // scout: asked by F, herbs from the tufts, the return turns them in automatically in range
  const r = runWith('vg_izci_otu');
  r.begin();
  const q = r.onNpc();
  ok('run.scout.ask', evs(q, 'ask').length === 1 && r.asking === 'herbs');
  r.answer(true);
  ok('run.scout.herbs', r.phase === 'herbs');
  let given = 0;
  for (let k = 0; k < 6; k++) given += evs(r.onTuft(), 'give').length;
  ok('run.scout.tufts-capped', given === 4, `${given} tufts given (count + 1 = 4)`);
  const ready = r.update(1, F({ herbs: 3 }));
  ok('run.scout.return', r.phase === 'return' && evs(ready, 'toast').length === 1);
  const back = r.update(1, F({ herbs: 3, dist: at2 }));
  const take = evs(back, 'take')[0];
  ok('run.scout.auto-turn-in', r.phase === 'done' && take?.item === 'herb_daisy' && take?.n === 3 && evs(back, 'grant')[0]?.gold === 30, JSON.stringify(take));
}
{ // wolf hunt: three pack wolves; the deer do not count
  const r = runWith('vg_kurt_surusu');
  r.begin();
  for (let k = 0; k < 3; k++) r.onKill('ow_deer');
  ok('run.hunt.deer-no', r.phase === 'hunt' && r.kills === 0);
  r.onKill('ow_wolf');
  r.onKill('ow_wolf');
  ok('run.hunt.two-wolves', r.phase === 'hunt' && r.kills === 2);
  const done = r.onKill('ow_wolf');
  ok('run.hunt.done', r.phase === 'done' && evs(done, 'grant')[0]?.gold === 35);
  ok('run.hunt.paid-once', evs(r.onKill('ow_wolf'), 'grant').length === 0);
}
{ // goblin: one kill
  const r = runWith('vg_hazine_goblini');
  r.begin();
  const k = r.onKill('treasure_goblin');
  ok('run.goblin', r.phase === 'done' && evs(k, 'grant')[0]?.gold === 20);
}
{ // stuck cart: the hold finished
  const r = runWith('vg_takili_kagni');
  r.begin();
  const c = r.onCart();
  ok('run.cart', r.phase === 'done' && evs(c, 'grant')[0]?.gold === 25);
  ok('run.cart.once', evs(r.onCart(), 'grant').length === 0);
}
{ // nobody comes: the wave clock saves the traveler after waveWaitSec; a vignette left alone expires at durSec
  const w = runWith('vg_yolcu_pusu_heybe');
  w.begin();
  let saidDone = false;
  for (let k = 0; k < 20 && w.phase !== 'done'; k++) saidDone = saidDone || evs(w.update(1, F()), 'say').length > 0;
  ok('run.no-wave', w.phase === 'done' && saidDone && w.age <= VIGNETTE_RULES.waveWaitSec + 1);
  const t = runWith('vg_yolcu_pusu_escort', { escortPath: [{ x: 0, z: 0 }, { x: 40, z: 0 }] });
  t.begin();
  let end = [];
  for (let k = 0; k < 100 && !t.isEnded; k++) end = end.concat(evs(t.update(1, F({ alive: 2 })), 'end'));
  ok('run.expire', t.isEnded && end.length === 1 && end[0].reason === 'expired' && t.age <= DEF('vg_yolcu_pusu_escort').durSec + 1, `age ${t.age.toFixed(0)} s`);
  ok('run.expire-no-grant', evs(t.update(1, F()), 'grant').length === 0);
}
{ // a late answer after the end changes nothing
  const r = runWith('vg_yolcu_pusu_heybe');
  r.begin();
  r.onDamage(1);
  r.update(1, F({ alive: 0 }));
  for (let k = 0; k < 100 && !r.isEnded; k++) r.update(1, F());
  ok('run.late-answer', r.isEnded && r.answer(true).length === 0 && r.phase === 'expired');
}

// ------------------------------------------------------------------------------------------------ map.* (the real Sisli map)
// the nav stand-in: no route by default; the escort block sets it (a straight route, or one through a camp)
let navStub = () => null;
const built = { nav: { nearestWalkable: (x, z) => ({ x, z }), findPath: (a, b) => navStub(a, b) } };
const ctx = new WorldCtx(world, built, SV, SV.world, { seed: 777, enemyLevel: 1 });
const tileM = (t) => (t + 0.5) * 4;
let eid = 90000;
const spawned = [];
const fakeSpawn = async (w, defId, pos, opts) => {
  const e = new H.FakeEnemy(eid++, pos.x, pos.z, { rank: 'trash' });
  e.def = { id: defId, rank: getEnemyDef(defId)?.rank ?? 'trash', name: defId, role: 'melee', resist: {}, anims: {} };
  e.level = opts.level;
  e.tag = opts.tag ?? '';
  e.escape = () => { e.removed = true; };
  spawned.push({ defId, tag: e.tag, patrol: !!opts.patrol, aggro: !!opts.aggro, level: opts.level });
  w.add(e);
  return e;
};
const me = H.addPlayer('druid', 1);
const dir = new VignetteDirector(ctx, (key) => dir.onMessage(key), { spawn: fakeSpawn });
dir.attach();
const ring = dir.sitesOf('r1');
{
  ok('map.sites', ring.length >= 30, `${ring.length} road and POI sites on r1`);
  ok('map.region', ring.every((s) => ctx.regionAt(s.x, s.z)?.id === 'r1'));
  const C = VIGNETTE_RULES;
  const camps = SV.packs.map((pk) => ({ x: tileM(pk.center[0]), z: tileM(pk.center[1]), r: (pk.radius ?? 12) + C.clearCampM, patrol: (pk.patrol ?? []).map((q) => ({ x: tileM(q[0]), z: tileM(q[1]) })) }));
  ok('map.camps', ring.every((s) => camps.every((c) => dist(s, c) >= c.r && c.patrol.every((q) => dist(s, q) >= C.clearPatrolM))), `${camps.length} camps and patrols in the world`);
  const spots = questPropSpots(ctx, QUESTS.filter((d) => !!d.region && !!ctx.regionById(d.region)));
  ok('map.quest-spots', ring.every((s) => spots.every((q) => dist(s, q) >= C.clearQuestM)), `${spots.length} quest spots`);
  ok('map.villages', ring.every((s) => SV.world.villages.every((v) => dist(s, { x: tileM(v.center[0]), z: tileM(v.center[1]) }) >= Math.max(v.bounds[0], v.bounds[1]) + C.clearVillageM)));
  ok('map.spread', ring.some((s) => dist(s, ring[0]) > 200), 'the ring offers sites more than 200 m apart');
  ok('map.free', ring.every((s) => dir.isFree(s)));
}

// ------------------------------------------------------------------------------------------------ dir.* (the director)
const props = () => [...world.entities.values()].filter((e) => e instanceof VignetteProp && !e.removed);
const tagged = (slot) => world.enemies.filter((e) => e.tag === `vig:${slot}` && !e.removed && !e.isDead);
const slotOf = (defId) => activeVignettePins().find((p) => p.defId === defId);
const kill = (e) => {
  G.events.emit('damage', { targetId: e.id, sourceId: me.id, amount: 5, crit: false, type: 'physical', kind: 'hit', pos: [0, 0, 0] });
  e.hp = 0;
  G.events.emit('death', { entityId: e.id, killerId: me.id, pos: [e.position.x, 0, e.position.z] });
};
const idleFor = async (sec) => {
  for (let k = 0; k < Math.round(sec / 0.5); k++) {
    world.update(0.5);
    dir.update(0.5);
    await tick();
  }
};
const spotsFar = (taken) => {
  const list = ring.filter((s) => dir.isFree(s) && taken.every((t) => dist(s, t) >= 40));
  if (!list.length) throw new Error(`no free ring spot 40 m from the ${taken.length} earlier ones`);
  return list;
};
const taken = [];
/** A spot for the next flow: the previous vignette is over (its 200 m spacing is gone after its linger), 40 m from the others. */
const freshSpot = async () => {
  await idleFor(100);
  const at = spotsFar(taken)[0];
  return at;
};

// the roll: a player walks the ring's roads; the first roll starts a vignette near the player
let started = null;
{
  let i = 0;
  let steps = 0;
  while (!started && steps < 4000) {
    const s = ring[i % ring.length];
    i++;
    steps++;
    me.position.set(s.x, 0, s.z);
    dir.update(0.5);
    const pins = activeVignettePins();
    if (pins.length) started = { pin: pins[0], at: { x: s.x, z: s.z }, steps };
  }
  ok('dir.roll.starts', !!started, started ? `after ${started.steps} steps of walking` : 'no roll in 4000 steps');
}
if (started) {
  await tick();
  const p = started.pin;
  const d = dist(p, started.at);
  ok('dir.roll.anchor-window', d >= VIGNETTE_RULES.anchorMinM - 1 && d <= VIGNETTE_RULES.anchorMaxM + 1, `anchor ${d.toFixed(1)} m from the player`);
  ok('dir.roll.anchor-free', dir.isFree(p) && ctx.regionAt(p.x, p.z)?.id === 'r1');
  const def = DEF(p.defId);
  const want = { road_ambush: 2, wolf_hunt: 6, goblin_sighting: 1, scout_herbs: 0, stuck_cart: 0 }[def.kind];
  const got = tagged(p.id).length;
  ok('dir.roll.units', got === want, `${def.name}: ${got} tagged units (want ${want})`);
  ok('dir.roll.level', spawned.filter((s) => s.tag === `vig:${p.id}`).every((s) => s.level === 1), 'units at the ring level of the player (1)');
  const propKinds = { road_ambush: ['traveler'], scout_herbs: ['scout', 'campfire', 'tuft'], wolf_hunt: [], goblin_sighting: [], stuck_cart: ['cart'] }[def.kind];
  const pk = props().map((e) => e.propKind);
  ok('dir.roll.props', propKinds.every((k) => pk.includes(k)) && pk.length === (def.kind === 'scout_herbs' ? 6 : propKinds.length), `props: ${pk.join(',') || 'none'}`);
  // the same player is on cooldown: no second vignette for playerCdSec (the walk keeps going)
  const slots = new Set([p.id]);
  let extra = 0;
  for (let k = 0; k < 240; k++) {
    const s = ring[(k * 3) % ring.length];
    me.position.set(s.x, 0, s.z);
    world.update(0.5);
    dir.update(0.5);
    for (const q of activeVignettePins()) if (!slots.has(q.id)) { slots.add(q.id); extra++; }
    await tick();
  }
  ok('dir.roll.cooldown', extra === 0, `${extra} new vignettes in 120 s on cooldown`);
  // the first one despawns: its units, its props and its pin are gone
  await idleFor(def.durSec + VIGNETTE_RULES.lingerSec + 4);
  ok('dir.roll.despawn-pin', !activeVignettePins().some((q) => q.id === p.id));
  ok('dir.roll.despawn-units', world.enemies.filter((e) => e.tag.startsWith('vig:') && !e.removed).length === 0);
  ok('dir.roll.despawn-props', props().length === 0, `${props().length} props left`);
}

// the flows, each on its own spot 210 m or more from the others
{
  const def = DEF('vg_yolcu_pusu_heybe');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  ok('flow.heybe.start', dir.startAt(def, at, me) === true);
  await tick();
  const pin = slotOf(def.id);
  ok('flow.heybe.pin', !!pin && pin.name === def.name);
  const foes = tagged(pin.id);
  ok('flow.heybe.ambush', foes.length === 2 && foes.every((e) => e.def.id === 'ow_bandit' || e.def.id === 'ow_wolf' || e.def.id === 'ow_bandit_archer'));
  // the wave stands for a moment (the director sees it alive) before the fight
  await idleFor(0.5);
  const a0 = asks.length;
  const g0 = gold.length;
  for (const e of foes) kill(e);
  await idleFor(0.5);
  await tick();
  await tick();
  ok('flow.heybe.thanks', gold.slice(g0).includes(6), `gold ${gold.slice(g0).join(',')}`);
  ok('flow.heybe.pop-up', asks.length === a0 + 1 && asks[asks.length - 1].length > 0);
  const satchel = props().find((e) => e.propKind === 'satchel');
  ok('flow.heybe.satchel-on-road', !!satchel);
  satchel?.interact(me);
  me.position.set(at.x, 0, at.z);
  await idleFor(0.5);
  ok('flow.heybe.reward', gold.slice(g0).includes(30) && xpGain.includes(6), `gold ${gold.slice(g0).join(',')} xp ${xpGain.join(',')}`);
  await idleFor(VIGNETTE_RULES.lingerSec + 1);
  ok('flow.heybe.despawn', !activeVignettePins().some((q) => q.id === pin.id) && props().length === 0 && tagged(pin.id).length === 0);
}
{
  const def = DEF('vg_izci_otu');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  bag.clear();
  ok('flow.izci.start', dir.startAt(def, at, me) === true);
  await tick();
  const pin = slotOf(def.id);
  const scout = props().find((e) => e.propKind === 'scout');
  ok('flow.izci.scout', !!scout && !!pin);
  const a0 = asks.length;
  const g0 = gold.length;
  scout.interact(me);
  await tick();
  await tick();
  ok('flow.izci.pop-up', asks.length === a0 + 1);
  const tufts = props().filter((e) => e.propKind === 'tuft');
  ok('flow.izci.tufts', tufts.length === 4, `${tufts.length} tufts`);
  for (let k = 0; k < 3; k++) tufts[k].interact(me);
  ok('flow.izci.herbs-in-bag', bag.get('herb_daisy') === 3, `bag ${bag.get('herb_daisy') ?? 0}`);
  await idleFor(0.5);
  me.position.set(at.x + 10, 0, at.z);
  await idleFor(0.5);
  ok('flow.izci.walk-back', bag.get('herb_daisy') === 3 && gold.slice(g0).length === 0, 'herbs kept until the turn-in');
  me.position.set(at.x, 0, at.z);
  await idleFor(0.5);
  ok('flow.izci.turn-in', (bag.get('herb_daisy') ?? 0) === 0 && gold.slice(g0).includes(30), `bag ${bag.get('herb_daisy') ?? 0}`);
  await idleFor(VIGNETTE_RULES.lingerSec + 1);
  ok('flow.izci.despawn', !activeVignettePins().some((q) => q.id === pin.id) && props().length === 0);
}
{
  const def = DEF('vg_kurt_surusu');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  ok('flow.kurt.start', dir.startAt(def, at, me) === true);
  await tick();
  const pin = slotOf(def.id);
  const wolves = tagged(pin.id).filter((e) => e.def.id === 'ow_wolf');
  const deer = tagged(pin.id).filter((e) => e.def.id === 'ow_deer');
  ok('flow.kurt.pack', wolves.length === 3 && deer.length === 3 && spawned.filter((s) => s.tag === `vig:${pin.id}` && s.defId === 'ow_wolf').every((s) => s.patrol), `${wolves.length} wolves, ${deer.length} deer`);
  const g0 = gold.length;
  kill(deer[0]);
  kill(wolves[0]);
  kill(wolves[1]);
  await idleFor(0.5);
  ok('flow.kurt.not-yet', gold.length === g0, 'two wolves and a deer do not finish the hunt');
  kill(wolves[2]);
  await idleFor(0.5);
  ok('flow.kurt.reward', gold.slice(g0).includes(35));
  await idleFor(VIGNETTE_RULES.lingerSec + 1);
  ok('flow.kurt.despawn', !activeVignettePins().some((q) => q.id === pin.id) && tagged(pin.id).length === 0);
}
{
  const def = DEF('vg_hazine_goblini');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  ok('flow.goblin.start', dir.startAt(def, at, me) === true);
  await tick();
  const pin = slotOf(def.id);
  const foes = tagged(pin.id);
  ok('flow.goblin.unit', foes.length === 1 && foes[0].def.id === 'treasure_goblin');
  const g0 = gold.length;
  kill(foes[0]);
  await idleFor(0.5);
  ok('flow.goblin.reward', gold.slice(g0).includes(20));
  await idleFor(VIGNETTE_RULES.lingerSec + 1);
  ok('flow.goblin.despawn', !activeVignettePins().some((q) => q.id === pin.id));
}
{
  const def = DEF('vg_takili_kagni');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  ok('flow.cart.start', dir.startAt(def, at, me) === true);
  await tick();
  const pin = slotOf(def.id);
  const cart = props().find((e) => e.propKind === 'cart');
  ok('flow.cart.prop', !!cart && !!pin);
  const g0 = gold.length;
  held.add('interact');
  cart.interact(me);
  await idleFor(7);
  held.delete('interact');
  await tick();
  ok('flow.cart.reward', gold.slice(g0).includes(25), `gold ${gold.slice(g0).join(',')}`);
  await idleFor(VIGNETTE_RULES.lingerSec + 1);
  ok('flow.cart.despawn', !activeVignettePins().some((q) => q.id === pin.id) && props().length === 0);
}
{ // expiry: nobody comes to the cart; the spot is free again after durSec
  const def = DEF('vg_takili_kagni');
  const at = await freshSpot();
  me.position.set(at.x, 0, at.z);
  const g0 = gold.length;
  ok('flow.expire.start', dir.startAt(def, at, me) === true);
  const near2 = { x: at.x + 40, z: at.z };
  ok('flow.expire.spacing', dir.startAt(def, near2, me) === false, 'a second spot 40 m away is refused while one is active');
  await tick();
  const pin = slotOf(def.id);
  await idleFor(def.durSec + VIGNETTE_RULES.lingerSec + 2);
  ok('flow.expire.despawn', !!pin && !activeVignettePins().some((q) => q.id === pin.id) && props().length === 0 && gold.length === g0, 'no reward for a vignette left alone');
}

// ------------------------------------------------------------------------------------------------ escort route and bystanders
const segClear = (a, b) => {
  const n = Math.max(1, Math.ceil(dist(a, b)));
  for (let k = 0; k <= n; k++) if (!dir.isFree({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })) return false;
  return true;
};
/** The road spots an escort from `at` may end on: the director's list (40 m +-10, the 6 nearest to 40 m). */
const escortEnds = (at) => ring
  .filter((s) => s.kind === 'road' && Math.abs(dist(s, at) - 40) <= 10)
  .sort((p, q) => Math.abs(dist(p, at) - 40) - Math.abs(dist(q, at) - 40))
  .slice(0, 6);
const roundPt = (s) => ({ x: Math.round(s.x), z: Math.round(s.z) });
{
  const esc = DEF('vg_yolcu_pusu_escort');
  const spots = ring.map(roundPt).filter((s) => dir.isFree(s) && escortEnds(s).length > 0);
  ok('escort.spots', spots.length >= 3, `${spots.length} free anchors with road spots 30-50 m away`);
  // 1) no route from the anchor: the escort follow-up is refused (a traveler never ends as thanks only)
  navStub = () => null;
  const a1 = spots[0];
  me.position.set(a1.x, 0, a1.z);
  ok('escort.no-route-refused', dir.startAt(esc, a1, me) === false);
  // 2) two free ends whose straight route runs through a camp: refused by the sampled check (the ends alone pass)
  let cross = null;
  for (const a of spots.slice(1)) {
    for (const pk of SV.packs) {
      const c = { x: tileM(pk.center[0]), z: tileM(pk.center[1]) };
      const r = roundPt({ x: 2 * c.x - a.x, z: 2 * c.z - a.z });
      if (!cross && dir.isFree(r)) cross = { a, c };
    }
  }
  ok('escort.cross-spot', !!cross, 'a free anchor whose mirror point through a camp is free too');
  if (cross) {
    navStub = (p) => [{ x: 2 * cross.c.x - p.x, z: 2 * cross.c.z - p.z }];
    me.position.set(cross.a.x, 0, cross.a.z);
    ok('escort.cross-refused', dir.startAt(esc, cross.a, me) === false, 'the straight route runs through a camp');
  }
  // 3) a clean route: the first end the straight line reaches without an exclusion; the pop-up asks after the fight
  const clean = spots.find((a) => a !== a1 && a !== cross?.a && escortEnds(a).some((c) => segClear(a, c)));
  ok('escort.clean-spot', !!clean);
  if (clean) {
    navStub = (p, q) => (segClear(p, q) ? [{ x: q.x, z: q.z }] : null);
    me.position.set(clean.x, 0, clean.z);
    ok('escort.clean-start', dir.startAt(esc, clean, me) === true);
    await tick();
    const pin = slotOf(esc.id);
    ok('escort.clean-pin', !!pin);
    const foes = pin ? tagged(pin.id) : [];
    await idleFor(0.5);
    const a0 = asks.length;
    for (const e of foes) kill(e);
    await idleFor(0.5);
    await tick();
    await tick();
    ok('escort.follow-up-offered', asks.length === a0 + 1, `${asks.length - a0} pop-up(s) after the fight`);
    await idleFor(esc.durSec + VIGNETTE_RULES.lingerSec + 2);
    ok('escort.despawn', !!pin && !activeVignettePins().some((q) => q.id === pin.id) && props().length === 0);
  }
  navStub = () => null;
}
// a bystander: a vignette another player triggers runs for the local player only inside the level band and off their cooldowns
await idleFor(VIGNETTE_RULES.playerCdSec + 1); // the local player's cooldowns from the flows are over
{
  const at = roundPt(ring.find((s) => dir.isFree(s)));
  me.position.set(at.x, 0, at.z);
  const lv = me.level;
  const other = me.id + 1; // the roller is someone else
  // the defs here are off their own cooldowns (the flows used them long ago), so only the level band and the player's cooldown decide
  const heybe = DEF('vg_yolcu_pusu_heybe');
  me.level = 20;
  dir.onMessage(`ev:vig:${heybe.id}:9101:${at.x}:${at.z}:5:${other}`);
  ok('bystander.level-gate', !activeVignettePins().some((q) => q.id === 9101), 'a level 20 bystander gets no run of the L1-5 ring');
  me.level = lv;
  dir.onMessage(`ev:vig:${heybe.id}:9102:${at.x}:${at.z}:1:${other}`);
  ok('bystander.runs', activeVignettePins().some((q) => q.id === 9102));
  dir.onMessage(`ev:vig:vg_izci_otu:9103:${at.x}:${at.z}:1:${other}`);
  ok('bystander.cooldown', !activeVignettePins().some((q) => q.id === 9103), 'the per-player cooldown holds the next vignette');
  await idleFor(heybe.durSec + VIGNETTE_RULES.lingerSec + 2);
  ok('bystander.despawn', !activeVignettePins().some((q) => q.id === 9102) && props().length === 0);
}

// the last check: nothing of the flows is left in the world
await idleFor(VIGNETTE_RULES.playerCdSec / 2);
const living = () => world.enemies.filter((e) => e.tag.startsWith('vig:') && !e.removed && !e.isDead).length;
ok('dir.clean', activeVignettePins().length === 0 && props().length === 0 && living() === 0, `${activeVignettePins().length} pins, ${props().length} props, ${living()} living units`);
ok('dir.lines-spoken', lines.length > 0 && toasts.length > 0, `${lines.length} lines, ${toasts.length} toasts`);

dir.dispose();
console.log(`vignettes: ${passes} PASS, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
