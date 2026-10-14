#!/usr/bin/env node
/**
 * Ulu-Boz (wb_ulu_boz) and Zemheri (wb_ad_zemheri) world-boss scripts, headless (src/ai/bosses/world_steppe_ice.ts).
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/worldbosses.mjs      (V=1 prints every PASS)
 *
 * Stages: data.* (ids, handlers, phases, rows, pet and loot wiring) | geo.* (pillar line-of-sight cuts, measured with the HitShapes
 * cone test) | ulu.* (cover, sandstorm shelter and clock, hoof, enrage) | zem.* (Donma, spirits and their heal, shatter, the absolute
 * channel and its interrupt) | fight.* (a 10-minute fixture fight per boss through the real handlers, phases by HP).
 * A fixture controller stands in for BossController (shape, adds, spawnAdds, dash, stagger, yell); the handlers and their timing
 * are the real ones: start / tick / resolve / end run from a small busy loop like EnemyAI's. No browser, no server. Exit 0 = all PASS.
 */
import * as H from './harness.mjs';

const { G, errors } = H;
const { BOSS_SCRIPTS } = await H.imp('ai/bosses/index.ts');
const { BOSSES, ENEMIES } = await H.imp('data/enemies.ts');
const { WORLD_STEPPE_SPAWNS } = await H.imp('ai/bosses/world_steppe_ice.ts');
const { PET_BY_ID, petItemId } = await H.imp('data/pets.ts');
const { WORLD_BOSS_TABLES } = await H.imp('data/loot.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// deterministic random source (mulberry32): every run prints the same numbers
let seed = 20261014;
const rng = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = (a, b) => a + rng() * (b - a);

const ZEM_LOOT = WORLD_BOSS_TABLES.loot_wb_ad_zemheri;

// ---- net stub: records what the scripts send to the owning peer (pstatus for stuns, affix for toasts) ----------------------------
const sent = [];
G.net = {
  isAuthority: false,
  peerOfEntity: (id) => `peer${id}`,
  sendTo: (peer, kind, msg) => sent.push({ peer, kind, msg }),
  broadcast: () => {},
};
const stunsOf = (id) => sent.filter((s) => s.kind === 'pstatus' && s.msg.status === 'stun' && s.msg.targetId === id).length;

/** HitShapes cone test (src/combat/HitShapes.ts): distance gate, then the arc with the body's slack. */
function coneHit(shape, ox, oz, dx, dz, px, pz, pr = 0.4) {
  const vx = px - ox, vz = pz - oz;
  const dist = Math.hypot(vx, vz);
  if (dist > shape.radius + pr) return false;
  if (dist <= pr + 0.15) return true;
  const cos = (vx * dx + vz * dz) / dist;
  const half = (shape.angle / 2) * (Math.PI / 180);
  const slack = Math.atan2(pr, dist);
  return Math.acos(clamp(cos, -1, 1)) <= half + slack;
}

const finite = (...xs) => xs.every((x) => typeof x === 'number' && Number.isFinite(x));

// ---- fixture fight ------------------------------------------------------------------------------------------------------------------
/**
 * One boss fight on a fixture. `hpAt(t)` is the boss HP fraction over time. cast(id, target) starts an ability through the real
 * handler; advance(sec) runs frames (tick / resolve / end / update / phases by HP / the ability picker).
 */
function makeFight(bossId, { players: nPlayers = 6, hpAt = () => 1 } = {}) {
  const def = BOSSES[bossId];
  const script = BOSS_SCRIPTS[bossId];
  if (!def || !script) throw new Error(`no def or script for ${bossId}`);
  const arena = def.arena;
  const cx = arena.cx, cz = arena.cz;
  const half = arena.w / 2 - 3;
  let now = 0;
  let nextId = 1000;
  let nextShape = 1;
  let wandering = true;
  const shapes = [];
  const adds = [];
  const yells = [];
  const staggers = [];
  const dashes = [];
  const spawnLog = [];
  const timers = [];
  const cancelled = new Set();
  const castLog = {};
  const castTimes = [];
  const phaseLog = [];
  const exceptions = [];
  const nonFinite = [];

  const boss = {
    id: 1, kind: 'enemy', def, name: def.name, isDead: false, removed: false, radius: def.radius, height: 3, maxHp: 1000, hp: 1000,
    position: { x: cx, y: 0, z: cz }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, forcedMove: null,
    get hpFrac() { return this.hp / this.maxHp; },
    playShot() {}, statuses: { apply() {}, remove() {}, clear() {}, has: () => false, get: () => undefined },
    pointAt() { return { x: this.position.x, y: 1, z: this.position.z }; },
  };

  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    players.push({
      id: 100 + i, kind: 'player', isLocal: false, isDead: false, removed: false, radius: 0.4, classId: i === 0 ? 'knight' : 'mage', spec: undefined,
      position: { x: cx + rnd(-half, half) * 0.6, y: 0, z: cz + rnd(-half, half) * 0.6 }, wp: null,
    });
  }
  const nav = { isWalkable: () => true, nearestWalkable: (x, z) => ({ x, z }), lineOfSight: () => true, resolveCircle() {} };
  const find = (id) => [boss, ...players, ...adds].find((a) => a.id === id);
  const world = { time: 0, nav, players, enemies: adds, get: find, getActor: find, localPlayer: undefined };

  const alivePlayers = () => players.filter((p) => !p.isDead && !p.removed);
  const c = {
    e: boss, state: {}, arena: { cx, cz, w: arena.w, h: arena.h, r: 28 }, world, inReset: false, engaged: true,
    at: (ox, oz) => ({ x: cx + ox, z: cz + oz }),
    randomPoint: () => ({ x: cx + rnd(-half, half), z: cz + rnd(-half, half) }),
    playersInArena: () => alivePlayers().filter((p) => Math.abs(p.position.x - cx) <= arena.w / 2 + 2 && Math.abs(p.position.z - cz) <= arena.h / 2 + 2),
    randomPlayers: (n) => alivePlayers().sort(() => rng() - 0.5).slice(0, n),
    nearestPlayer(maxDist = Infinity) {
      let best = null;
      let bd = maxDist;
      for (const p of alivePlayers()) {
        const d = Math.hypot(p.position.x - boss.position.x, p.position.z - boss.position.z);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    partySize: () => players.length,
    adds: (tag) => adds.filter((a) => !a.isDead && !a.removed && (!tag || a.tag === tag)),
    spawnAdds(defId, count, o = {}) {
      if (!ENEMIES[defId]) exceptions.push(`spawn of unknown def ${defId}`);
      const pts = o.positions ?? [];
      for (let i = 0; i < count; i++) {
        const p = pts[i] ?? { x: boss.position.x + rnd(-4, 4), z: boss.position.z + rnd(-4, 4) };
        adds.push({
          id: nextId++, kind: 'enemy', defId, ownerId: boss.id, tag: o.tag ?? '', aggro: o.aggro !== false, isDead: false, removed: false,
          radius: ENEMIES[defId]?.radius ?? 0.8, height: 1, maxHp: 100, hp: 100, position: { x: p.x, y: 0, z: p.z },
          escape() { this.removed = true; },
        });
      }
      spawnLog.push({ t: now, defId, n: count, tag: o.tag ?? '' });
    },
    shape(o) {
      const id = nextShape++;
      shapes.push({ t: now, o: { ...o }, id });
      if (busy) busy.shapeIds.push(id); // EnemyAI.shape does the same, so an interrupt can cancel them
      if (!finite(o.x ?? 0, o.z ?? 0, o.delay ?? 0) || (o.shape && !finite(...Object.values(o.shape).filter((v) => typeof v === 'number')))) nonFinite.push(o);
      return id;
    },
    yell(text) { yells.push({ t: now, text }); },
    stagger(stun, vulnMult, vulnSec, text) { staggers.push({ t: now, stun, vulnMult, vulnSec, text }); },
    vulnerable() {},
    dash(dx, dz, dist, dur) { dashes.push({ t: now, dx, dz, dist, dur }); },
    schedule(delay, fn) { timers.push({ at: now + delay, fn }); },
    cancelTimers() {},
    setImmune() {}, freeze() {}, endMechanicPhase() {},
    teleport(x, z) { boss.position.x = x; boss.position.z = z; },
    forceAbility() {},
    castNow() { return false; },
    get tank() { return null; },
  };

  // ---- busy loop (EnemyAI.startAbility / tickBusy / endBusy) ----
  let busy = null;
  let gcdUntil = 0;
  const readyAt = {};
  const forced = [];
  let phaseIdx = -1;
  let phase = null;
  const abilityOf = (id) => def.abilities.find((a) => a.id === id);
  const handlerOf = (id) => script.abilities[id];

  function enterPhase(i) {
    const ph = def.phases[i];
    if (!ph) return;
    phaseIdx = i;
    phase = ph;
    phaseLog.push({ t: now, id: ph.id, hp: boss.hpFrac });
    if (i > 0 && ph.onEnter?.yell) yells.push({ t: now, text: ph.onEnter.yell });
    if (ph.onEnter?.ability) forced.push(ph.onEnter.ability);
    for (const id of ph.abilities) {
      const ab = abilityOf(id);
      if (ab && readyAt[id] === undefined) readyAt[id] = now + (ab.initialCooldown ?? ab.cooldown * 0.6);
    }
    script.onPhase?.(c, ph, i);
  }

  function cast(id, target = null) {
    const ab = abilityOf(id);
    if (!ab) throw new Error(`no ability ${id} on ${bossId}`);
    if (busy) throw new Error('boss busy');
    const t = target ?? c.nearestPlayer() ?? boss;
    const castTime = ab.castTime ?? 0;
    const delay = Math.max(ab.windup ?? 0.05, castTime, ab.params?.delay ?? 0);
    busy = {
      ab, t0: now, delay, castTime, total: delay + 0.8, lockAt: now + delay * 0.6, clip: null, seq: 0, impact: 0, speed: 1, resolved: false,
      channel: 0, targetId: t.id, tx: t.position.x, tz: t.position.z, dx: Math.sin(boss.yaw), dz: Math.cos(boss.yaw), castId: castTime > 0,
      shapeIds: [], data: {},
    };
    readyAt[id] = now + ab.cooldown;
    castLog[ab.name] = (castLog[ab.name] ?? 0) + 1;
    castTimes.push({ name: ab.name, t: now });
    handlerOf(id)?.start?.(c, busy);
    return busy;
  }

  /** Interrupt (BossController.abortBusy): the handler's abort runs and the busy shapes are cancelled. */
  function interrupt(reason) {
    if (!busy) return;
    const b = busy;
    busy = null;
    for (const s of shapes) if (b.shapeIds.includes(s.id)) cancelled.add(s.id);
    handlerOf(b.ab.id)?.abort?.(c, b, reason);
  }

  function frame(dt) {
    now += dt;
    world.time = now;
    boss.hp = clamp(boss.maxHp * hpAt(now), 1, boss.maxHp);
    // phases by HP (one per frame, like BossController.fightFrame)
    const next = def.phases[phaseIdx + 1];
    if (next && boss.hpFrac < next.hpBelow) enterPhase(phaseIdx + 1);
    // players wander (waypoint walk) unless a test pins them
    for (const p of wandering ? players : []) {
      if (!p.wp || Math.hypot(p.wp.x - p.position.x, p.wp.z - p.position.z) < 0.5) p.wp = { x: cx + rnd(-half, half), z: cz + rnd(-half, half) };
      const dx = p.wp.x - p.position.x, dz = p.wp.z - p.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const s = Math.min(d, 4 * dt);
      p.position.x += (dx / d) * s;
      p.position.z += (dz / d) * s;
    }
    // ability: the busy one, else the first forced or ready ability of the phase
    if (busy) {
      const t = now - busy.t0;
      const h = handlerOf(busy.ab.id);
      if (!busy.resolved && t >= busy.delay) {
        busy.resolved = true;
        h?.resolve?.(c, busy);
      }
      h?.tick?.(c, busy, dt, t);
      if (t >= busy.total) {
        h?.end?.(c, busy);
        busy = null;
        gcdUntil = now + 0.7;
      }
    } else if (now >= gcdUntil) {
      let pick = null;
      while (forced.length && !pick) {
        const id = forced.shift();
        if (abilityOf(id)) pick = id;
      }
      if (!pick && phase) {
        for (const id of phase.abilities) {
          const ab = abilityOf(id);
          if (ab && (readyAt[id] ?? 0) <= now) { pick = id; break; }
        }
      }
      if (pick) cast(pick, c.nearestPlayer() ?? boss);
    }
    script.update?.(c, dt);
    for (const tm of timers.filter((x) => x.at <= now)) tm.fn();
    timers.splice(0, timers.length, ...timers.filter((x) => x.at > now));
  }

  function advance(sec, dt = 0.1) {
    const n = Math.round(sec / dt);
    for (let i = 0; i < n; i++) {
      try {
        frame(dt);
      } catch (err) {
        exceptions.push(String(err?.stack ?? err).split('\n').slice(0, 2).join(' | '));
        break;
      }
    }
  }

  const engage = () => {
    enterPhase(0);
    script.onEngage?.(c);
  };
  return {
    c, boss, players, shapes, adds, yells, staggers, dashes, spawnLog, castLog, castTimes, phaseLog, exceptions, nonFinite, cancelled, forced,
    cast, interrupt, advance, engage, enterPhase, frame,
    wander: (on) => { wandering = on; },
    get busy() { return busy; },
    get now() { return now; },
    cx, cz,
    /** Shapes emitted at or after `t0`, optionally of one ability name. */
    since: (t0, name) => shapes.filter((s) => s.t >= t0 && (!name || s.o.name === name)),
  };
}

// ---- data wiring -------------------------------------------------------------------------------------------------------------------------
for (const id of ['wb_ulu_boz', 'wb_ad_zemheri']) {
  const def = BOSSES[id];
  const script = BOSS_SCRIPTS[id];
  ok(`data.${id} has a script`, !!script && !!def);
  const customRows = (def?.abilities ?? []).filter((a) => a.kind === 'custom');
  ok(`data.${id} every custom row has a handler`, customRows.length > 0 && customRows.every((a) => !!script?.abilities[a.id]), customRows.filter((a) => !script?.abilities[a.id]).map((a) => a.id).join(','));
  const phaseIds = (def?.phases ?? []).flatMap((p) => p.abilities);
  ok(`data.${id} phases name existing rows`, phaseIds.every((x) => (def?.abilities ?? []).some((a) => a.id === x) || x === def?.basicAttack?.id), phaseIds.join(','));
  const hps = (def?.phases ?? []).map((p) => p.hpBelow);
  ok(`data.${id} phase thresholds fall`, hps.length === 3 && hps.every((v, i) => i === 0 || v < hps[i - 1]), hps.join(' > '));
  const forcedRows = (def?.phases ?? []).map((p) => p.onEnter?.ability).filter(Boolean);
  ok(`data.${id} forced phase abilities exist`, forcedRows.every((x) => (def?.abilities ?? []).some((a) => a.id === x)));
  ok(`data.${id} spawn list is wired`, !!WORLD_STEPPE_SPAWNS[id] && WORLD_STEPPE_SPAWNS[id].every((x) => !!ENEMIES[x]), WORLD_STEPPE_SPAWNS[id]?.join(','));
}
{
  const ulu = BOSSES.wb_ulu_boz;
  ok('data.ulu phases 100 / 65 / 20 %', near(ulu.phases[1].hpBelow, 0.65, 1e-9) && near(ulu.phases[2].hpBelow, 0.2, 1e-9));
  ok('data.ulu enrage phase forces the charge', ulu.phases[2].onEnter?.ability === 'ulu_boz_enrage');
  const zem = BOSSES.wb_ad_zemheri;
  ok('data.zemheri phases 100 / 50 / 25 %', near(zem.phases[1].hpBelow, 0.5, 1e-9) && near(zem.phases[2].hpBelow, 0.25, 1e-9));
  const abs = zem.abilities.find((a) => a.id === 'zemheri_absolute');
  ok('data.zemheri absolute channel is interruptible, kick 2', abs?.interruptible === true && abs?.kick === 2 && abs?.castTime === 4.5);
  ok('data.mechanic defs exist', ['ulu_kaya', 'ulu_totem', 'zemheri_ruh', 'proc_ice_pillar'].every((x) => !!ENEMIES[x]));
  ok('data.pet buz_tilkisi taught by the Zemheri drop table', !!PET_BY_ID.buz_tilkisi && ZEM_LOOT?.bonus.some((b) => b.id === petItemId('buz_tilkisi') && b.chance > 0 && b.chance < 1), JSON.stringify(ZEM_LOOT?.bonus));
  ok('data.pet item id', petItemId('buz_tilkisi') === 'pet_buz_tilkisi');
}

// ---- geometry: pillar line of sight ----------------------------------------------------------------------------------------------------
{
  // boss at the arena centre, one ice pillar 6 m straight ahead (+z), the breath aimed at a player 10 m out behind it
  const F = makeFight('wb_ad_zemheri', { players: 3, hpAt: () => 0.6 });
  F.wander(false);
  F.c.spawnAdds('proc_ice_pillar', 1, { positions: [F.c.at(0, 6)], tag: 'pillar', aggro: false });
  const target = F.players[0];
  target.position = F.c.at(0, 10);
  const t0 = F.now;
  F.cast('zemheri_breath', target);
  const breath = F.since(t0, 'Buz Nefesi').filter((s) => s.o.shape.type === 'cone');
  F.advance(2.5);
  const at = (x, z) => ({ x: F.cx + x, z: F.cz + z });
  const hitBy = (list, p) => list.some((s) => coneHit(s.o.shape, s.o.x, s.o.z, s.o.dx, s.o.dz, p.x, p.z));
  const behind = at(0, 10), front = at(0, 4), side = at(3, 10);
  ok('geo.breath: the breath is a set of telegraphed cones', breath.length >= 2 && breath.every((s) => s.o.telegraph === true), `${breath.length} cones`);
  ok('geo.breath: a player behind the pillar is outside every cone', !hitBy(breath, behind));
  ok('geo.breath: a player in front of the pillar is hit', hitBy(breath, front));
  ok('geo.breath: a player beside the shadow is hit', hitBy(breath, side));
  ok('geo.breath: range 16 m', Math.max(...breath.map((s) => s.o.shape.radius)) <= 16 + 1e-9);

  // the full-circle blast: the same pillar cuts a shadow out of the ring
  const t1 = F.now;
  F.cast('zemheri_absolute');
  const blast = F.since(t1, 'Mutlak Sıfır');
  ok('geo.blast: pieces land at the channel end (4.5 s)', blast.length >= 2 && blast.every((s) => near(s.o.delay, 4.5, 1e-9)), `${blast.length} pieces`);
  ok('geo.blast: a player behind the pillar is outside the blast', !hitBy(blast, behind));
  ok('geo.blast: a player on the open side is hit', hitBy(blast, at(-8, 0)));
  ok('geo.blast: a player beside the pillar is hit', hitBy(blast, side));
}

// ---- ulu-boz ------------------------------------------------------------------------------------------------------------------------------
{
  const F = makeFight('wb_ulu_boz', { players: 4 });
  F.wander(false);
  F.engage();
  // hoof: a frontal cone and three rings
  const p0 = F.players[0];
  p0.position = F.c.at(0, 5);
  const t0 = F.now;
  F.cast('ulu_boz_hoof', p0);
  const cones = F.since(t0, 'Toynak Sarsıntısı').filter((s) => s.o.shape.type === 'cone');
  const rings = F.since(t0, 'Sarsıntı Halkası').filter((s) => s.o.shape.type === 'ring');
  ok('ulu.hoof: one 9 m / 110 deg frontal cone', cones.length === 1 && near(cones[0].o.shape.radius, 9, 1e-9) && near(cones[0].o.shape.angle, 110, 1e-9));
  ok('ulu.hoof: three rings with gaps between them', rings.length === 3 && rings.every((r, i) => near(r.o.shape.inner, 3 + i * 4, 1e-9) && near(r.o.shape.outer, 5 + i * 4, 1e-9)));
  ok('ulu.hoof: rings roll out 0.6 s apart', rings.length === 3 && near(rings[1].o.delay - rings[0].o.delay, 0.6, 1e-6) && near(rings[2].o.delay - rings[1].o.delay, 0.6, 1e-6));
  ok('ulu.hoof: the cone stacks Yer Çatlağı on the tank', cones[0]?.o.statuses?.[0]?.status === 'earth_fracture' && cones[0].o.statuses[0].stacks === 1);
  F.advance(2.4);

  // phase 2 spawns the cover once: four rocks and two totems
  F.enterPhase(1);
  F.enterPhase(1);
  const rocks = F.adds.filter((a) => a.tag === 'rock' && !a.removed);
  const totems = F.adds.filter((a) => a.tag === 'totem' && !a.removed);
  ok('ulu.cover: four rocks and two totems at phase 2, once', rocks.length === 4 && totems.length === 2, `${rocks.length} rocks ${totems.length} totems`);

  // shelter: downwind of a rock (within 5 m, 2.2 m across the west wind) or inside a totem's 3.2 m shade
  F.c.state.dust = { until: F.now + 1e6, next: 0 };
  const probe = (x, z) => {
    F.players.forEach((p, i) => { p.position = F.c.at(-40, -40 + i); });
    const p = F.players[0];
    p.position = { x, z };
    F.shapes.length = 0;
    F.c.state.dust.next = 0; // a tick is due now
    F.frame(0.01);
    return F.shapes.filter((s) => s.o.name === 'Kum Fırtınası' && s.o.x === x && s.o.z === z).length;
  };
  const rock = rocks[0], tot = totems[0];
  ok('ulu.shelter: downwind of a rock is sheltered', probe(rock.position.x + 2, rock.position.z) === 0);
  ok('ulu.shelter: upwind of a rock is exposed', probe(rock.position.x - 2, rock.position.z) === 1);
  ok('ulu.shelter: beside a rock (4 m across the wind) is exposed', probe(rock.position.x + 2, rock.position.z + 4) === 1);
  ok('ulu.shelter: inside a totem shade is sheltered', probe(tot.position.x + 1, tot.position.z + 1) === 0);
  ok('ulu.shelter: outside the totem shade is exposed', probe(tot.position.x + 5, tot.position.z) === 1);
  delete F.c.state.dust;

  // the storm clock: a 20 s sandstorm (ticks every 1.5 s) that starts when the windup ends
  F.players.forEach((p, i) => { p.position = F.c.at(-30 + i * 2, 18); });
  const t1 = F.now;
  F.cast('ulu_boz_storm');
  F.advance(2.1);
  const dust = F.c.state.dust;
  ok('ulu.storm: the sandstorm runs 20 s from the windup end', !!dust && near(dust.until - t1, 2.0 + 20, 0.25), `until ${(dust?.until - t1)?.toFixed(2)}`);
  F.advance(22);
  const ticks = [...new Set(F.since(t1, 'Kum Fırtınası').map((s) => s.t.toFixed(2)))];
  ok('ulu.storm: a tick every 1.5 s while it lasts', ticks.length >= 13 && ticks.length <= 15, `${ticks.length} ticks`);
  ok('ulu.storm: the clock ends with no ticks after it', F.c.state.dust === undefined && F.since(F.now - 1, 'Kum Fırtınası').length === 0);

  // enrage: four Bozkır Kurdu adds, then the charge along the line to the farthest player
  const t2 = F.now;
  F.cast('ulu_boz_enrage');
  ok('ulu.enrage: four Bozkır Kurdu adds', F.spawnLog.some((s) => s.defId === 'kb_kurt' && s.n === 4 && s.t >= t2));
  const lines = F.since(t2, 'Öfke Hücumu');
  ok('ulu.enrage: the charge telegraphs 4 m line pieces', lines.length >= 2 && lines.every((s) => s.o.shape.type === 'line' && near(s.o.shape.width, 4, 1e-9)), `${lines.length} pieces`);
  F.advance(F.busy.delay + 0.2 - (F.now - F.busy.t0));
  const dash = F.dashes.find((d) => d.t >= t2);
  ok('ulu.enrage: the boss dashes once the windup ends', !!dash && dash.dist > 2 && dash.dist <= 30 + 1e-9, JSON.stringify(dash));
  F.advance(3);
  ok('ulu.local: no exceptions, no non-finite shape', F.exceptions.length === 0 && F.nonFinite.length === 0, F.exceptions.join(' ; '));
}

// ---- zemheri ------------------------------------------------------------------------------------------------------------------------------
{
  const F = makeFight('wb_ad_zemheri', { players: 4, hpAt: () => 0.6 });
  F.wander(false);
  F.engage();
  ok('zem.engage: four ice pillars', F.adds.filter((a) => a.tag === 'pillar' && !a.removed).length === 4);

  // Kar Fırtınası and Donma: a still player inside a zone builds stacks and is stunned at 5, a walking one is not
  F.players.forEach((p, i) => { p.position = F.c.at(-30 + i, -15); });
  F.cast('zemheri_storm');
  F.advance(1.6);
  const zones = F.c.state.frost?.zones ?? [];
  ok('zem.storm: three frost zones of 4.5 m for 9 s', zones.length === 3 && zones.every((z) => near(z.r, 4.5, 1e-9)) && zones.every((z) => near(z.until - F.now, 9 + 1.4 - 1.6, 0.3)), `${zones.length} zones`);
  const zone = zones[0];
  const still = F.players[0], walker = F.players[1];
  const stillBefore = stunsOf(still.id), walkerBefore = stunsOf(walker.id);
  for (let i = 0; i < 80; i++) {
    still.position = { x: zone.x, z: zone.z };
    walker.position = { x: zone.x + Math.sin(i * 0.9) * 2.4, z: zone.z + Math.cos(i * 0.9) * 2.4 };
    F.frame(0.1);
  }
  ok('zem.donma: a still player inside a zone is stunned (3 s) at 5 stacks', stunsOf(still.id) - stillBefore >= 1 && sent.some((s) => s.msg.status === 'stun' && s.msg.duration === 3), `stuns ${stunsOf(still.id) - stillBefore}`);
  ok('zem.donma: a player who keeps moving is never stunned', stunsOf(walker.id) - walkerBefore === 0, `stuns ${stunsOf(walker.id) - walkerBefore}`);

  // Buz Çağrısı: six spirits at phase 2, walking at the boss; one that arrives heals the boss 3 % and is gone
  F.enterPhase(1);
  ok('zem.spirits: six Buz Ruhu at phase 2', F.spawnLog.some((s) => s.defId === 'zemheri_ruh' && s.n === 6));
  const ruhs = F.adds.filter((a) => a.tag === 'ruh' && !a.removed && !a.isDead);
  ok('zem.spirits: six alive', ruhs.length === 6, `${ruhs.length}`);
  const far = ruhs[0];
  far.position = F.c.at(0, 14);
  const d0 = Math.hypot(far.position.x - F.boss.position.x, far.position.z - F.boss.position.z);
  F.frame(1.0);
  const d1 = Math.hypot(far.position.x - F.boss.position.x, far.position.z - F.boss.position.z);
  ok('zem.spirits: a spirit walks at the boss (2.4 m/s)', near(d0 - d1, 2.4, 0.15), `closed ${(d0 - d1).toFixed(2)} m`);
  const arrive = ruhs[1];
  arrive.position = F.c.at(0, 2.5);
  const hpBefore = F.boss.hp;
  F.frame(0.1);
  ok('zem.spirits: a spirit that reaches the boss heals it 3 %', near(F.boss.hp - hpBefore, F.boss.maxHp * 0.03, 1e-6), `hp ${hpBefore} -> ${F.boss.hp}`);
  ok('zem.spirits: and is gone', arrive.removed === true);

  // ice pillar shatter: a pillar that dies bursts once on its spot
  const pillar = F.adds.find((a) => a.tag === 'pillar' && !a.removed);
  F.frame(0.1);
  const px = pillar.position.x, pz = pillar.position.z;
  pillar.isDead = true;
  const t1 = F.now;
  F.frame(0.1);
  F.frame(0.1);
  const shatter = F.since(t1, 'Buz Kırığı');
  ok('zem.shatter: a dead pillar bursts on its spot, once', shatter.length === 1 && near(shatter[0].o.x, px, 1e-9) && near(shatter[0].o.delay, 0.9, 1e-9), `${shatter.length}`);

  // Mutlak Sıfır: an external cancel does nothing, a CC interrupt staggers the boss and cancels the blast
  F.enterPhase(2);
  F.forced.length = 0;
  F.players.forEach((p) => { p.position = F.c.at(-20, -20); });
  F.cast('zemheri_absolute');
  F.advance(1.2);
  const tExt = F.now;
  F.interrupt('external');
  ok('zem.interrupt: an external cancel does not stagger the boss', F.staggers.length === 0);
  F.advance(0.1);
  const tc = F.now;
  F.cast('zemheri_absolute');
  const blastShapes = F.since(tc, 'Mutlak Sıfır').map((s) => s.id);
  F.advance(1.2);
  F.interrupt('cc');
  const st = F.staggers.find((s) => s.t >= tc);
  ok('zem.interrupt: a CC interrupt staggers the boss (3 s stun, 1.5x for 6 s)', !!st && st.stun === 3 && st.vulnMult === 1.5 && st.vulnSec === 6, JSON.stringify(st));
  ok('zem.interrupt: the blast shapes of the interrupted channel are cancelled', blastShapes.length > 0 && blastShapes.every((id) => F.cancelled.has(id)), `${blastShapes.length}`);
  ok('zem.interrupt: an external cancel was not counted as a stagger', tExt < tc && F.staggers.length === 1);
  ok('zem.local: no exceptions, no non-finite shape', F.exceptions.length === 0 && F.nonFinite.length === 0, F.exceptions.join(' ; '));
}

// ---- 10-minute fights ---------------------------------------------------------------------------------------------------------------------
/** Boss HP: linear from 100 % to 5 % over the 600 s fight, so the phase thresholds fall at fixed times. */
const hpLinear = (t) => clamp(1 - (0.95 * t) / 600, 0.05, 1);

function fullFight(bossId, label, expect) {
  const F = makeFight(bossId, { players: 7, hpAt: hpLinear });
  const killsAt = [];
  let maxRuh = 0;
  let pillarKilled = false;
  F.engage();
  for (let i = 0; i < 6000 && F.exceptions.length === 0; i++) {
    F.frame(0.1);
    // the party kills a spirit now and then (every 8 s, 60 %), and one pillar at 150 s (a shatter)
    if (i % 80 === 79) {
      const ruh = F.adds.find((a) => a.tag === 'ruh' && !a.removed && !a.isDead);
      if (ruh && rng() < 0.6) { ruh.isDead = true; killsAt.push(F.now); }
    }
    if (!pillarKilled && F.now >= 150) {
      const pl = F.adds.find((a) => a.tag === 'pillar' && !a.removed && !a.isDead);
      if (pl) { pl.isDead = true; pillarKilled = true; }
    }
    maxRuh = Math.max(maxRuh, F.adds.filter((a) => a.tag === 'ruh' && !a.removed && !a.isDead).length);
  }
  const q = (name, cond, info) => ok(`${label}.${name}`, cond, info);
  q('ten minutes without an exception', F.exceptions.length === 0 && F.now >= 599.9, F.exceptions.slice(0, 2).join(' ; '));
  q('no non-finite shape', F.nonFinite.length === 0, `${F.nonFinite.length}`);
  q('no console errors', errors.length === 0, errors.slice(0, 2).join(' ; '));
  const phases = F.phaseLog.map((p) => p.id).join(',');
  q('phases p1 p2 p3 in order', phases === 'p1,p2,p3', phases);
  for (const [id, t] of expect.phaseTimes) {
    const entry = F.phaseLog.find((p) => p.id === id);
    q(`phase ${id} near ${t} s`, !!entry && Math.abs(entry.t - t) <= 1.0, `${entry?.t?.toFixed(1)}`);
  }
  for (const [name, min] of expect.casts) q(`cast "${name}" at least ${min}`, (F.castLog[name] ?? 0) >= min, `${F.castLog[name] ?? 0}`);
  if (expect.firstCast) {
    const [name, phaseId] = expect.firstCast;
    const first = F.castTimes.find((x) => x.name === name);
    const p = F.phaseLog.find((x) => x.id === phaseId);
    q(`first "${name}" soon after entering ${phaseId}`, !!first && !!p && first.t >= p.t && first.t - p.t < 6, `${first?.t?.toFixed(1)} vs ${p?.t?.toFixed(1)}`);
  }
  if (expect.onlyIn) {
    const [name, phaseId] = expect.onlyIn;
    const p = F.phaseLog.find((x) => x.id === phaseId);
    const early = F.castTimes.filter((x) => x.name === name && x.t < p.t);
    q(`"${name}" is never cast before ${phaseId}`, early.length === 0, `${early.length} early`);
  }
  for (const [defId, min] of expect.spawns) {
    const n = F.spawnLog.filter((s) => s.defId === defId).reduce((a, s) => a + s.n, 0);
    q(`spawns ${defId} at least ${min}`, n >= min, `${n}`);
  }
  q('no more than 6 spirits alive at once', maxRuh <= 6, `${maxRuh}`);
  if (expect.ruhKills) q('the party killed spirits on the way', killsAt.length >= 1, `${killsAt.length}`);
  if (expect.shatter) q('a pillar shattered mid-fight', F.shapes.some((s) => s.o.name === 'Buz Kırığı'));
  if (expect.stormTicks) q('sandstorm ticks fired', F.shapes.some((s) => s.o.name === 'Kum Fırtınası'));
  q('the boss is alive at the end', F.boss.hp > 0 && !F.boss.isDead, `${F.boss.hp.toFixed(1)}`);
  q('no interrupt was simulated, so no stagger', F.staggers.length === 0);
  return F;
}

fullFight('wb_ulu_boz', 'fight.ulu', {
  phaseTimes: [['p1', 0], ['p2', 221], ['p3', 505]],
  casts: [['Toynak Sarsıntısı', 20], ['Toz Fırtınası', 3], ['Öfke Hücumu', 1]],
  firstCast: ['Öfke Hücumu', 'p3'],
  spawns: [['kb_kurt', 4]],
  stormTicks: true,
});
fullFight('wb_ad_zemheri', 'fight.zem', {
  phaseTimes: [['p1', 0], ['p2', 316], ['p3', 474]],
  casts: [['Buz Nefesi', 10], ['Kar Fırtınası', 4], ['Buz Çağrısı', 1], ['Mutlak Sıfır', 1]],
  firstCast: ['Mutlak Sıfır', 'p3'],
  onlyIn: ['Mutlak Sıfır', 'p3'],
  spawns: [['zemheri_ruh', 6], ['proc_ice_pillar', 4]],
  ruhKills: true,
  shatter: true,
});

console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} FAILED`} (${passes} passed, ${fails} failed)`);
process.exit(fails === 0 ? 0 : 1);
