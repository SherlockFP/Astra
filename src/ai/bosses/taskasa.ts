import { G } from '../../game/G';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { StatusId } from '../../types/skills';
import type { BossController } from '../BossController';
import type { Busy } from '../EnemyAI';
import { bossMsg, bossMsgTo } from '../bossNet';
import { rotatingBeams, trackBeam } from './patterns';
import { bossString } from './moveBridge';
import {
  angleTo, band, beam, busyTarget, circle, dashLine, distXZ, every, farthestPlayer, makeInvulnerable, partyHp,
  playersIn, type Pt, ringPoints, rad, rnd, spawnMech, statusPlayer, TAU, wedge, zone,
} from './kit';
import type { BossScript, BossStrike } from './types';

/**
 * Taşkasa bosses (docs/dungeons/taskasa.md §5): Otomat Seda, Kristal Golem Skarmorak, the Makinistler pair (Brokk and Dorlita)
 * and the final Başsözcü Eirich. Ability keys are the §5 ids verbatim. Host-only, like every boss script.
 *
 * Engine notes (verified against the kit):
 * - Strings run through bossString (moveBridge). The generic shape of a basic attack is cancelled in start() and replaced.
 * - Custom abilities own their geometry; generic cones / bands from the data still fire their own shape and get the handler on top.
 * - Poise break hook is BossScript.onBreak (run by bossBreak on 'poise:break'), not onPoiseBreak.
 * - Local fallbacks (SP-08, SP-09, SP-05, SP-07, SP-24 parts) live in this file; see the notes next to each helper.
 * OWNER: enemies module.
 */

const MAX_SPIKES = 6;
const PAIR: Record<string, string> = { boss_brokk: 'boss_dorlita', boss_dorlita: 'boss_brokk' };

/** Eirich's combat casts (the set that a posture break delays). */
const EIRICH_CASTS = ['eirich_void_claw', 'eirich_leap', 'eirich_grasp', 'eirich_corruption', 'eirich_reckoning', 'eirich_unbridled'];

const SKAR_SEQ = ['smash', 'crash', 'smash', 'crash', 'smash', 'shell'];

interface Rift {
  tag: string;
  sock: number;
  x: number;
  z: number;
  /** Id of the live hazard shape (widened during the Yarık Dalgası). */
  hz: number;
  uses: number;
  cdUntil: number;
  hold: Record<number, number>;
}

interface SurgeState {
  t: number;
  a: boolean;
  b: boolean;
  /** Intermission 2 (third rift wave set). */
  second: boolean;
  /** Tag of this surge's casters (survivor count). */
  tag: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Strings (SP-24 fallback: bossString with per-hit windups, times from §5)
// ---------------------------------------------------------------------------------------------------------------------
const SEDA_STRING: BossStrike[] = [
  { coef: 1.0, range: 5, arc: 100, windup: 0.7 },
  { coef: 1.2, range: 5, arc: 100, gap: 0.25, windup: 0.5 },
];
const SEDA_STRING_P2: BossStrike[] = [...SEDA_STRING, { coef: 1.8, range: 5, arc: 100, gap: 0.25, windup: 1.1 }];
const TRIPLE_SLAM: BossStrike[] = [
  { coef: 1.0, range: 5.5, arc: 100, windup: 0.8 },
  { coef: 1.0, range: 5.5, arc: 100, gap: 0.3, windup: 0.45 },
  { coef: 1.8, range: 4, arc: 180, gap: 0.25, windup: 1.15 },
];
const ELDEN_CLAW: BossStrike[] = [
  { coef: 1.0, range: 5.5, arc: 100, windup: 0.75 },
  { coef: 1.0, range: 5.5, arc: 100, gap: 0.25, windup: 0.5 },
  { coef: 2.0, range: 6, arc: 120, gap: 0.25, windup: 1.1 },
];
const BROKK_FLURRY: BossStrike[] = [
  { coef: 0.9, range: 4, arc: 90, windup: 0.75 },
  { coef: 0.9, range: 4, arc: 90, gap: 0.25, windup: 0.45 },
  { coef: 1.6, range: 3.5, arc: 180, gap: 0.25, windup: 1.05 },
];

/** Runs a basic-style string. The generic shape the engine put out at t0 is cancelled; the boss stays busy until the string ends. */
function runString(c: BossController, b: Busy, steps: BossStrike[], endAt: number, name: string): void {
  for (const id of b.shapeIds) G.hitShapes.cancel(id);
  b.shapeIds.length = 0;
  const tgt = busyTarget(c, b) ?? c.target ?? c.nearestPlayer();
  if (!tgt) return;
  b.total = Math.max(b.total, endAt + 0.3);
  bossString(c, steps, { target: tgt, name, cancelOnBreak: true });
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------------------

/**
 * SP-09 fallback: the boss's current target when a player is inside melee reach, else the top-threat player, else the
 * nearest player within 8 m. No class test.
 */
function tankOf(c: BossController): Player | null {
  const t = c.target;
  if (t && t.kind === 'player' && !t.isDead && !t.removed && distXZ(c.e.position.x, c.e.position.z, t.position.x, t.position.z) <= 6.5) {
    return t as Player;
  }
  let best: Player | null = null;
  let bv = -1;
  for (const [id, v] of c.threat) {
    if (v <= bv) continue;
    const a = c.world.getActor(id);
    if (a && a.kind === 'player' && !a.isDead && !a.removed) {
      best = a as Player;
      bv = v;
    }
  }
  return best ?? c.nearestPlayer(8);
}

/** SP-09 fallback for pickPlayers(c, n, avoid): the player to spare goes last. */
function pickSparing(c: BossController, n: number, spare: Player | null): Player[] {
  const all = c.randomPlayers(99);
  const rest = all.filter((p) => p !== spare);
  const last = all.filter((p) => p === spare);
  return [...rest, ...last].slice(0, n);
}

/** SP-09 fallback for tankSwapHint: toast the tank once it holds `stacks` of `status`, and the highest-threat other player. */
function tankSwapHint(c: BossController, status: StatusId, stacks: number, text: string): void {
  const t = tankOf(c);
  if (!t || t.statuses.stacks(status) < stacks) return;
  const throttle: Record<number, number> = (c.state.swapAt ??= {});
  if (c.world.time - (throttle[t.id] ?? -99) < 6) return;
  throttle[t.id] = c.world.time;
  bossMsgTo(t.id, 'boss_toast', {}, { text });
  let second: Player | null = null;
  let sv = -1;
  for (const [id, v] of c.threat) {
    if (id === t.id || v <= sv) continue;
    const a = c.world.getActor(id);
    if (a && a.kind === 'player' && !a.isDead && !a.removed) {
      second = a as Player;
      sv = v;
    }
  }
  if (second) bossMsgTo(second.id, 'boss_toast', {}, { text });
}

/** SP-08 fallback: removal of a status on the host. Remote owners are not told (see the report: needs a removed branch in Combat). */
function removeStatus(p: Player, status: StatusId): void {
  p.statuses.remove(status);
}

/** Common posture-break reaction: stun + vulnerability, and cancel the current windup (never the uninterruptible Shatter). */
function breakReact(c: BossController, stun: number, mult: number, sec: number): void {
  if (c.state.surge) return;
  c.stagger(stun, mult, sec);
  for (const tag of ['shards', 'beam', 'sweep', 'song', 'grasp', 'blink', 'spike']) c.cancelTimers(tag);
  const b = c.busy;
  if (b && b.ab.id !== 'seda_shatter') c.abortBusy('external');
}

/** Leap toward a point (the boss's dash, 0.4 s). */
function leapToward(c: BossController, tx: number, tz: number, maxDist: number): void {
  const e = c.e;
  const dx = tx - e.position.x;
  const dz = tz - e.position.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return;
  c.dash(dx, dz, Math.min(maxDist, d), 0.4);
}

/** Enemy of the paired boss (Brokk <-> Dorlita), alive or not (null when the sibling is gone from the arena). */
function siblingEnemy(c: BossController): Enemy | null {
  const id = pairOf(c);
  if (!id) return null;
  return c.world.enemies.find((o) => o.def.id === id && !o.removed) ?? null;
}

function pairOf(c: BossController): string | undefined {
  return PAIR[c.bdef.id];
}

/** Controller of the living paired boss, or null. */
function siblingCtrl(c: BossController): BossController | null {
  const e = siblingEnemy(c);
  if (!e || e.isDead) return null;
  return (e.ai as unknown as BossController | null) ?? null;
}

/** Both Makinistler engage and reset together (SP-07 fallback: each script pulls its sibling). */
function pairEngage(c: BossController): void {
  const sib = siblingCtrl(c);
  const p = c.nearestPlayer();
  if (sib && !sib.engaged && p) sib.acquire(p, true);
}

/** Survivor of the pair (SP-07 fallback for onSiblingDeath): +75 % damage and a raid fire pulse every 2 s. */
function survivorTick(c: BossController, dt: number): void {
  const st = c.state;
  const sib = siblingEnemy(c);
  if (sib && !sib.isDead) st.sibSeen = true;
  if (st.sibSeen && !st.survivor && (!sib || sib.isDead) && !c.e.isDead) {
    st.survivor = true;
    c.dmgMul *= 1.75;
    c.yell('SESSİZ... KALMAYACAĞIM!');
  }
  if (st.survivor) {
    every(st, 'pulse', dt, 2, () => circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0.05, 0.7, { type: 'fire', telegraph: false, name: 'Susturulmuş Nabız' }));
  }
}

/** Both Makinistler posture-broken within 6 s: Çatlak Uyum (both +30 % for 8 s, Kızgın Kreşendo delayed by 10 s). */
function pairBreak(c: BossController): void {
  const now = c.world.time;
  c.state.brokeAt = now;
  const sib = siblingCtrl(c);
  if (!sib || now - ((sib.state.brokeAt as number | undefined) ?? -99) > 6) return;
  c.vulnerable(1.3, 8);
  sib.vulnerable(1.3, 8);
  const dor = c.bdef.id === 'boss_dorlita' ? c : sib;
  dor.setCooldown('dorlita_crescendo', dor.cooldownLeft('dorlita_crescendo') + 10);
  bossMsg('boss_toast', {}, { text: 'ÇATLAK UYUM! İki sözcü birden açık.' });
}

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Otomat Seda (boss_seda)
// ---------------------------------------------------------------------------------------------------------------------

/** Spike cap and spawn (SP-15 mech spike). The oldest spike goes when a seventh would appear. */
function spawnSpike(c: BossController, p: Pt): void {
  const spikes = c.adds('spike');
  if (spikes.length >= MAX_SPIKES) spikes[0].escape();
  spawnMech(c, 'tk_proc_volatile_spike', p, { tag: 'spike' });
}

/** Spikes within 1.2 m of a line (x,z, ang, length, width) are destroyed (beams, the sweep). */
function clearSpikesAlong(c: BossController, x: number, z: number, ang: number, len: number, width: number): void {
  const sx = Math.sin(ang);
  const sz = Math.cos(ang);
  for (const s of c.adds('spike')) {
    const dx = s.position.x - x;
    const dz = s.position.z - z;
    const along = dx * sx + dz * sz;
    const across = Math.abs(-dx * sz + dz * sx);
    if (along >= -1.2 && along <= len + 1.2 && across <= width / 2 + 1.2) s.escape();
  }
}

/** A spike that stayed armed and got stepped on: circle r 8, knockback 6, Yer Çatlağı on everyone hit. */
function detonateSpike(c: BossController, s: Enemy): void {
  circle(c, s.position.x, s.position.z, 8, 0.05, 1.0, {
    knockback: 6, type: 'physical', name: 'Kararsız Patlama', vfxOnLand: 'ground_slam',
    statuses: [{ status: 'earth_fracture', duration: 8, stacks: 1 }],
  });
  s.escape();
}

function registerEchoes(c: BossController, radius: number): void {
  const e = c.e;
  const list = (c.state.echoes ??= []) as Array<{ pid: number; t0: number }>;
  for (const p of playersIn(c, e.position.x, e.position.z, radius)) {
    if (p.statuses.has('seismic_echo')) list.push({ pid: p.id, t0: c.world.time });
  }
}

const seda: BossScript = {
  init(c) {
    c.state.energy = 0;
    c.state.p2 = false;
    c.state.echoes = [];
    c.state.spikeBorn = {};
    c.state.dwell = {};
    c.state.inertUntil = 0;
  },
  onEngage(c) {
    // solo: Çekirdek Atılışı every 60 s
    if (c.partySize() <= 1) c.cdOverride.set('seda_dive', 60);
  },
  onPhase(c, _ph, index) {
    if (index >= 1) c.state.p2 = true;
  },
  update(c, dt) {
    const st = c.state;
    const now = c.world.time;
    // Energy: full every 40 s (3.75/s below 40 %); Yer Parçalayıcı at 100 (SP-02 fallback, own accumulator)
    st.energy = Math.min(100, (st.energy ?? 0) + (st.p2 ? 3.75 : 2.5) * dt);
    if (st.energy >= 100 && c.castNow('seda_shatter')) st.energy = 0;

    // Spikes: armed 0.8 s after they stand, detonate when a player stays within 3.5 m for 0.35 s (inert after a break)
    const inert = now < (st.inertUntil ?? 0);
    for (const s of c.adds('spike')) {
      if (s.isDead || s.removed) continue;
      const born: number = (st.spikeBorn[s.id] ??= now);
      if (inert || now - born < 0.8) {
        st.dwell[s.id] = 0;
        continue;
      }
      const near = playersIn(c, s.position.x, s.position.z, 3.5).length > 0;
      st.dwell[s.id] = near ? (st.dwell[s.id] ?? 0) + dt : 0;
      if (st.dwell[s.id] >= 0.35) detonateSpike(c, s);
    }

    // Dispel watcher: the echo lost before it expired gives the current tank Sismik Kalkan (-50 % damage, 6 s)
    const echoes = st.echoes as Array<{ pid: number; t0: number }>;
    for (const w of echoes.slice()) {
      const p = c.world.get<Player>(w.pid);
      const gone = !p || p.isDead || p.removed || now - w.t0 >= 30;
      if (gone) {
        echoes.splice(echoes.indexOf(w), 1);
        continue;
      }
      if (p && !p.statuses.has('seismic_echo')) {
        echoes.splice(echoes.indexOf(w), 1);
        const t = tankOf(c);
        if (t) statusPlayer(t, 'seismic_ward', 6);
      }
    }
  },
  onBreak(c) {
    // Posture break: spikes inert for 8 s, energy -30, stun 4 s
    breakReact(c, 4, 1.25, 6);
    c.state.inertUntil = c.world.time + 8;
    c.state.energy = Math.max(0, (c.state.energy ?? 0) - 30);
  },
  abilities: {
    /** Çift Basış: 2-hit string (3 in phase 2), the late hit is delayed. */
    seda_stomp: {
      start(c, b) {
        if (c.phaseIdx >= 1) runString(c, b, SEDA_STRING_P2, 2.8, 'Çift Basış');
        else runString(c, b, SEDA_STRING, 1.45, 'Çift Basış');
      },
    },

    /** Sismik Ezme: the generic cone carries the echo status; the watcher registers who got it. */
    seda_smash: {
      start(c, b) {
        c.schedule(b.delay + 0.4, () => registerEchoes(c, 7), 'echo');
      },
    },

    /** Kararsız Sivri Taşlar: circles under up to min(3, n) players, spikes stand where they land after 1.5 s. */
    seda_spikes: {
      start(c, b) {
        const targets = pickSparing(c, Math.min(3, c.partySize()), tankOf(c));
        const spots: Pt[] = [];
        for (const p of targets) {
          spots.push({ x: p.position.x, z: p.position.z });
          circle(c, p.position.x, p.position.z, 1.5, b.delay + 1.5, 0.8, { knockback: 2, type: 'physical', name: 'Kararsız Sivri Taşlar' });
        }
        c.state.spikeSpots = spots;
      },
      resolve(c) {
        const spots = (c.state.spikeSpots ?? []) as Pt[];
        c.schedule(1.5, () => {
          for (const s of spots) spawnSpike(c, s);
        }, 'spike');
      },
    },

    /** Kırılan Işın: marks min(3, n) players, then a 36 x 2.2 m line at each (aim locks at the mark's end), spikes on the line die. */
    seda_beams: {
      start(c, b) {
        const lock = b.delay + 2.4;
        const n = Math.min(c.state.p2 ? 4 : 3, c.partySize());
        const targets = pickSparing(c, n, tankOf(c));
        for (const p of targets) {
          circle(c, p.position.x, p.position.z, 1.2, lock, 0, { damage: 0, kind: 'friendly', follow: true, sourceId: p.id, name: 'Kırılan Işın' });
        }
        const ids = targets.map((p) => p.id);
        c.schedule(lock, () => {
          const bx = c.e.position.x;
          const bz = c.e.position.z;
          for (const id of ids) {
            const p = c.world.get<Player>(id);
            if (!p || p.isDead || p.removed) continue;
            const ang = angleTo(bx, bz, p.position.x, p.position.z);
            beam(c, bx, bz, ang, 36, 2.2, 0.9, 2.4, { type: 'fire', name: 'Kırılan Işın' });
            c.schedule(0.9, () => clearSpikesAlong(c, bx, bz, ang, 36, 2.2), 'beam');
          }
        }, 'beam');
        b.total = Math.max(b.total, lock + 0.5);
      },
    },

    /** Yer Parçalayıcı (energy 100, uninterruptible): raid-wide, destroys every spike. */
    seda_shatter: {
      start(c, b) {
        const solo = c.partySize() <= 1;
        circle(c, c.arena.cx, c.arena.cz, c.arena.r + 8, b.delay, solo ? 2.4 : 3.4, {
          type: 'physical', name: 'Yer Parçalayıcı', vfxOnLand: 'ground_slam',
        });
        b.total = Math.max(b.total, b.delay + 0.3);
      },
      resolve(c) {
        for (const s of c.adds('spike')) s.escape();
      },
    },

    /** Aşırı Yük (40 %): energy gain up, beam count +1. */
    seda_overclock: {
      start(c) {
        c.state.p2 = true;
      },
    },

    /** Lens Taraması: rotating 36 x 2.2 m beam through 150 deg (SP-06 spin via rotatingBeams), clears spikes it crosses. */
    seda_sweep: {
      usable(c) {
        return c.partySize() >= 2;
      },
      start(c, b) {
        const e = c.e;
        const x = e.position.x;
        const z = e.position.z;
        const a0 = e.yaw - rad(75);
        rotatingBeams(c, {
          origins: { x, z, n: 1 }, speedDeg: 94, dirs: [a0], length: 36, width: 2.2, coef: 1.6, dur: 1.6, delay: b.delay, step: 1.6,
          type: 'fire', name: 'Lens Taraması',
        });
        for (let k = 0; k < 8; k++) {
          const ang = a0 - rad(94) * (k * 0.2);
          c.schedule(b.delay + k * 0.2, () => clearSpikesAlong(c, x, z, ang, 36, 2.2), 'sweep');
        }
        b.total = Math.max(b.total, b.delay + 1.8);
      },
    },

    /** Çekirdek Atılışı: a circle follows a random non-tank for 0.8 s, locks 0.4 s, she leaps and lands. */
    seda_dive: {
      start(c, b) {
        const t = pickSparing(c, 1, tankOf(c))[0];
        if (!t) return;
        b.data.pid = t.id;
        b.data.leapped = 0;
        circle(c, t.position.x, t.position.z, 5.5, b.delay, 3.0, {
          follow: true, sourceId: t.id, knockback: 5, type: 'physical', name: 'Çekirdek Atılışı', vfxOnLand: 'shadow_burst',
        });
        b.total = Math.max(b.total, b.delay + 1.5);
      },
      tick(c, b, _dt, t) {
        if (b.data.leapped === 1 || t < b.delay - 0.4) return;
        b.data.leapped = 1;
        const p = c.world.get<Player>(b.data.pid as number);
        if (p) leapToward(c, p.position.x, p.position.z, 20);
      },
      resolve(c) {
        if (c.phaseIdx >= 1) spawnSpike(c, { x: c.e.position.x, z: c.e.position.z });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Kristal Golem Skarmorak (boss_skarmorak)
// ---------------------------------------------------------------------------------------------------------------------

/** Scripted sequence (fallback for SP-02 costs): Smash 6 s, then Crash / Smash / Crash / Smash every 9 s (7 s below 35 %), Shell. */
function skarSequence(c: BossController, dt: number): void {
  const st = c.state;
  if (st.shellUp) return;
  st.seqT = (st.seqT ?? 6) - dt;
  if (st.seqT > 0) return;
  const kind = SKAR_SEQ[st.seq ?? 0];
  const ok = c.castNow(kind === 'smash' ? 'skar_smash' : kind === 'crash' ? 'skar_crash' : 'skar_shell');
  if (!ok) return;
  st.seq = ((st.seq ?? 0) + 1) % SKAR_SEQ.length;
  st.seqT = c.phaseIdx >= 1 ? 7 : 9;
}

function shellBreak(c: BossController): void {
  const st = c.state;
  st.shellUp = false;
  c.e.statuses.remove('shield');
  breakReact(c, 4, 1.3, 6);
}

function shellSurvive(c: BossController): void {
  c.state.shellUp = false;
  c.e.statuses.remove('shield');
  circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0.05, 8, { type: 'shadow', name: 'Boşluk Patlaması', vfxOnLand: 'shadow_burst' });
}

const skarmorak: BossScript = {
  init(c) {
    c.state.seq = 0;
    c.state.seqT = 6;
    c.state.shellUp = false;
    c.state.p2 = false;
    c.state.shardObjs = [];
  },
  onPhase(c, _ph, index) {
    if (index >= 1) c.state.p2 = true;
  },
  update(c, dt) {
    const st = c.state;
    const e = c.e;
    skarSequence(c, dt);

    // Shards: each one killed erupts (raid circle + Kırılgan)
    const shards = c.adds('shard');
    for (const o of (st.shardObjs ?? []) as Enemy[]) {
      if (!shards.includes(o) && o.isDead) {
        circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0.8, 1.3, {
          type: 'shadow', name: 'Kristal Patlaması', vfxOnLand: 'shadow_burst', statuses: [{ status: 'sunder', duration: 3 }],
        });
      }
    }
    st.shardObjs = shards;

    // Unstable fragments: the first touch within 1.2 m gives Kararsız Enerji
    for (const o of c.adds('frag')) {
      for (const p of playersIn(c, o.position.x, o.position.z, 1.2)) {
        statusPlayer(p, 'unstable_energy', 15, { stacks: 1 });
        o.escape();
        break;
      }
    }

    // Fortified Shell: raid hit every 2 s; break on shield gone; 22 s survive = Boşluk Patlaması
    if (st.shellUp) {
      st.shellT = (st.shellT ?? 0) + dt;
      if (!e.statuses.has('shield')) {
        shellBreak(c);
      } else {
        st.shellNext = (st.shellNext ?? 2) - dt;
        if (st.shellNext <= 0) {
          st.shellNext = 2;
          st.shellN = (st.shellN ?? 0) + 1;
          circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0.05, 0.9 * Math.pow(1.1, st.shellN), { telegraph: false, type: 'shadow', name: 'Boşluk Boşalması' });
        }
        if (st.shellT >= 22) shellSurvive(c);
      }
    }
  },
  onBreak(c) {
    if (c.state.shellUp) {
      shellBreak(c);
      return;
    }
    // outside the shell: stun, cancel the step, delay the next sequence step by 4 s
    breakReact(c, 4, 1.25, 6);
    c.state.seqT = (c.state.seqT ?? 0) + 4;
  },
  abilities: {
    /** Kristal Üçlü: 3-hit string, the third hit delayed. */
    skar_slam: {
      start(c, b) {
        runString(c, b, TRIPLE_SLAM, 2.95, 'Kristal Üçlü');
      },
    },

    /** Kristal Ezme: the generic cone; 3 shards (4 in phase 2) land 7-18 m away after 1.6 s. */
    skar_smash: {
      start(c, b) {
        const count = c.state.p2 ? 4 : Math.min(3, c.partySize() + 1);
        const e = c.e;
        const pts: Pt[] = [];
        for (let i = 0; i < count; i++) {
          for (let k = 0; k < 12; k++) {
            const a = rnd(0, TAU);
            const r = rnd(7, 18);
            const x = e.position.x + Math.sin(a) * r;
            const z = e.position.z + Math.cos(a) * r;
            if (!c.insideArena(x, z, -1) || !c.world.nav.isWalkable(x, z)) continue;
            pts.push({ x, z });
            break;
          }
        }
        const land = b.delay + 1.6;
        for (const p of pts) circle(c, p.x, p.z, 3, land, 1.6, { type: 'physical', name: 'Kristal Düşüşü' });
        c.schedule(land, () => {
          for (const p of pts) spawnMech(c, 'tk_proc_crystal_shard', p, { hpMult: 3 * partyHp(c), tag: 'shard' });
        }, 'shards');
      },
    },

    /** Kararsız Çarpma: raid circle r 15, then one unstable fragment under each living player (15 s). */
    skar_crash: {
      start(c, b) {
        circle(c, c.e.position.x, c.e.position.z, 15, b.delay, 2.0, { type: 'shadow', name: 'Kararsız Çarpma', vfxOnLand: 'shadow_burst' });
      },
      resolve(c) {
        for (const p of c.playersInArena()) {
          spawnMech(c, 'proc_unstable_fragment', { x: p.position.x + rnd(-1.5, 1.5), z: p.position.z + rnd(-1.5, 1.5) }, { tag: 'frag' });
        }
        c.schedule(15, () => {
          for (const o of c.adds('frag')) o.escape();
        }, 'frag');
      },
    },

    /** Güçlendirilmiş Kabuk: absorb shield, raid hits every 2 s; breaking it stuns, surviving 22 s explodes. */
    skar_shell: {
      start(c) {
        const amount = c.e.maxHp * (0.03 + 0.012 * Math.min(6, c.adds('shard').length));
        c.state.shellUp = true;
        c.state.shellT = 0;
        c.state.shellNext = 2;
        c.state.shellN = 0;
        c.e.statuses.apply('shield', 22.5, { magnitude: amount });
      },
      end(c) {
        if (c.state.shellUp) shellSurvive(c);
      },
      abort(c, _b, reason) {
        if (c.inReset || reason === 'death') return;
        c.state.shellUp = false;
        c.e.statuses.remove('shield');
      },
    },

    /** Kristal Boğası: charge line 20 x 3 m at the farthest player, 20 m/s; a wall crash stuns him 3 s. */
    skar_charge: {
      usable(c) {
        return c.partySize() >= 3 && !c.state.shellUp;
      },
      start(c, b) {
        const e = c.e;
        const t = farthestPlayer(c, e.position.x, e.position.z);
        if (!t) return;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        b.data.dx = Math.sin(ang);
        b.data.dz = Math.cos(ang);
        dashLine(c, e.position.x, e.position.z, ang, 20, 3, b.delay, 20, 2.4, { knockback: 6, name: 'Kristal Boğası' });
        b.total = Math.max(b.total, b.delay + 1.3);
      },
      tick(c, b, _dt, t) {
        if (!b.data.ran && t >= b.delay) {
          b.data.ran = 1;
          c.dash(b.data.dx as number, b.data.dz as number, 20, 1.0);
        }
        if (!b.data.checked && t >= b.delay + 1.0) {
          b.data.checked = 1;
          if (!c.insideArena(c.e.position.x, c.e.position.z, -1.5)) c.stagger(3, 1.25, 5);
        }
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Usta Makinistler, Sözcü Brokk and Sözcü Dorlita (boss_brokk, boss_dorlita)
// ---------------------------------------------------------------------------------------------------------------------

/** The scrap cube is owned by Dorlita; Brokk reaches it through the sibling controller. */
function cubeOf(c: BossController): Enemy | null {
  const owner = c.bdef.id === 'boss_dorlita' ? c : siblingCtrl(c);
  return owner?.adds('cube')[0] ?? null;
}

function spawnCube(c: BossController): void {
  spawnMech(c, 'proc_scrap_cube', { x: c.arena.cx, z: c.arena.cz }, { tag: 'cube' });
  const cube = c.adds('cube')[0];
  if (cube) makeInvulnerable(cube);
}

function moveCube(c: BossController): void {
  const cube = cubeOf(c);
  if (!cube) return;
  cube.position.x = c.arena.cx;
  cube.position.z = c.arena.cz;
}

/** One lane wave of Kızgın Kreşendo: a band across the room from a side, with a 6 m safe lane at a random spot. */
function laneWave(c: BossController, side: number, delay: number, coef: number): void {
  const a = c.arena;
  const horiz = side % 2 === 0;
  const L = (horiz ? a.w : a.h) + 6;
  const gap = (Math.random() * 2 - 1) * (L / 2 - 8);
  const pieces: Array<[number, number]> = [[-L / 2, gap - 3], [gap + 3, L / 2]];
  for (const [p0, p1] of pieces) {
    const len = p1 - p0;
    if (len < 0.5) continue;
    const m = (p0 + p1) / 2;
    if (horiz) {
      const z = a.cz + (side === 0 ? -1 : 1) * (a.h / 2 - 2.5);
      band(c, a.cx + m, z, Math.PI / 2, len, 5, delay, coef, { type: 'fire', name: 'Lav Dalgası' });
    } else {
      const x = a.cx + (side === 1 ? 1 : -1) * (a.w / 2 - 2.5);
      band(c, x, a.cz + m, 0, len, 5, delay, coef, { type: 'fire', name: 'Lav Dalgası' });
    }
  }
}

/** Brokk's Hurda Şarkısı: the cube rides the band toward the far block at 22 m/s; Dorlita within 7 m catches it. */
function startSlide(c: BossController, dir: number): void {
  if (cubeOf(c)) c.state.slide = { dir };
}

function blinkAway(c: BossController): void {
  const t = c.target;
  if (!t || c.e.statuses.stunned) return;
  const dx0 = c.e.position.x - t.position.x;
  const dz0 = c.e.position.z - t.position.z;
  const l = Math.hypot(dx0, dz0) || 1;
  for (const r of [12, 8, 4]) {
    const x = t.position.x + (dx0 / l) * r;
    const z = t.position.z + (dz0 / l) * r;
    if (c.insideArena(x, z, -1) && c.world.nav.isWalkable(x, z)) {
      c.teleport(x, z);
      return;
    }
  }
}

const dorlita: BossScript = {
  init(c) {
    c.state.cubeT = 0;
    c.state.survivor = false;
    c.state.sibSeen = false;
  },
  onEngage(c) {
    spawnCube(c);
    pairEngage(c);
  },
  update(c, dt) {
    const st = c.state;
    survivorTick(c, dt);
    // the cube comes back to its pedestal after a burst (5 s)
    if (!cubeOf(c)) {
      st.cubeT = (st.cubeT ?? 0) - dt;
      if (st.cubeT <= 0) {
        spawnCube(c);
        st.cubeT = 0;
      }
    }
  },
  onBreak(c) {
    // Dorlita's break: stun 5 s, cancels a Kızgın Kreşendo in progress (the cube goes back to the pedestal in abort)
    breakReact(c, 5, 1.25, 6);
    pairBreak(c);
  },
  abilities: {
    /** Mekanik Üçlü: 3-hit string, the third hit delayed. */
    dorlita_slam: {
      start(c, b) {
        runString(c, b, TRIPLE_SLAM, 2.95, 'Mekanik Üçlü');
      },
    },

    /** Fırın Atılışı: circle follows a random non-tank, she leaps at the lock and leaves a lava puddle. */
    dorlita_leap: {
      usable(c) {
        return c.partySize() >= 3;
      },
      start(c, b) {
        const t = pickSparing(c, 1, tankOf(c))[0];
        if (!t) return;
        b.data.pid = t.id;
        b.data.leapped = 0;
        circle(c, t.position.x, t.position.z, 5, b.delay, 3.0, { follow: true, sourceId: t.id, type: 'fire', name: 'Fırın Atılışı', vfxOnLand: 'fire_burst' });
        b.total = Math.max(b.total, b.delay + 0.4);
      },
      tick(c, b, _dt, t) {
        if (b.data.leapped === 1 || t < b.delay - 0.4) return;
        b.data.leapped = 1;
        const p = c.world.get<Player>(b.data.pid as number);
        if (p) leapToward(c, p.position.x, p.position.z, 18);
      },
      resolve(c) {
        zone(c, c.e.position.x, c.e.position.z, 4, 8, 0.5, 0.5, 0.05, { type: 'fire', name: 'Lav Birikintisi' });
      },
    },

    /** Lav Topu: line 36 x 3 m at a random player, aim locks 0.5 s before landing (trackBeam). */
    dorlita_cannon: {
      start(c, b) {
        const t = c.randomPlayers(1)[0];
        if (!t) return;
        trackBeam(c, { x: c.e.position.x, z: c.e.position.z }, t, {
          lockAt: Math.max(0, b.delay - 0.5), delay: 0.5, length: 36, width: 3, coef: 2.4, type: 'fire', name: 'Lav Topu',
        });
      },
    },

    /** Kızgın Kreşendo: cube to the centre, raid circle + DoT zone r 20, then lava lanes from the sides. */
    dorlita_crescendo: {
      start(c, b) {
        const cx = c.arena.cx;
        const cz = c.arena.cz;
        moveCube(c);
        circle(c, cx, cz, 20, b.delay, 2.6, { type: 'fire', name: 'Kızgın Kreşendo', vfxOnLand: 'fire_burst' });
        zone(c, cx, cz, 20, 6, 0.5, 0.25, b.delay, { type: 'fire', name: 'Kreşendo Alevi' });
        const sides = c.partySize() >= 3 ? [0, 1, 2, 3] : [Math.random() < 0.5 ? 0 : 2, Math.random() < 0.5 ? 1 : 3];
        sides.forEach((side, i) => laneWave(c, side, b.delay + 0.6 * i, 1.8));
        b.total = Math.max(b.total, b.delay + 0.6 * sides.length + 0.5);
      },
      abort(c, _b, reason) {
        if (reason !== 'death') moveCube(c);
      },
    },
  },
};

const brokk: BossScript = {
  kite: [10, 16],
  init(c) {
    c.state.survivor = false;
    c.state.sibSeen = false;
    c.state.blobNext = {};
  },
  onEngage(c) {
    pairEngage(c);
  },
  update(c, dt) {
    const st = c.state;
    survivorTick(c, dt);

    // Hurda Şarkısı: the cube slides along the band
    const sl = st.slide as { dir: number } | null | undefined;
    if (sl) {
      const cube = cubeOf(c);
      if (!cube || cube.isDead) {
        st.slide = null;
      } else {
        cube.position.x += sl.dir * 22 * dt;
        const dor = siblingEnemy(c);
        if (dor && !dor.isDead && distXZ(dor.position.x, dor.position.z, cube.position.x, cube.position.z) < 7) {
          circle(c, dor.position.x, dor.position.z, 7, 0.05, 3.0, { type: 'physical', name: 'Hurda Yakalama' });
          cube.escape();
          st.slide = null;
          const sibCtrl = siblingCtrl(c);
          if (sibCtrl) sibCtrl.state.cubeT = 5;
        } else if (Math.abs(cube.position.x - c.arena.cx) >= 18) {
          st.slide = null;
          // far block reached: M+ bursts the cube into four magma blobs; otherwise it rolls back to the pedestal
          if (G.mplus?.state?.difficulty === 'mythicplus') {
            const bx = cube.position.x;
            const bz = cube.position.z;
            cube.escape();
            c.spawnAdds('proc_magma_blob', 4, { positions: ringPoints(bx, bz, 2, 4), tag: 'blob', aggro: false });
            st.blobT = 0;
            const sibCtrl = siblingCtrl(c);
            if (sibCtrl) sibCtrl.state.cubeT = 5;
          } else {
            cube.position.x = c.arena.cx;
            cube.position.z = c.arena.cz;
          }
        }
      }
    }

    // Magma blobs: outward at 5 m/s, a 1.8 coef hit each second, gone after 8 s
    if (st.blobT !== undefined) {
      st.blobT = (st.blobT as number) + dt;
      const blobs = c.adds('blob');
      for (const o of blobs) {
        const dx = o.position.x - c.arena.cx;
        const dz = o.position.z - c.arena.cz;
        const d = Math.hypot(dx, dz) || 1;
        o.position.x += (dx / d) * 5 * dt;
        o.position.z += (dz / d) * 5 * dt;
        st.blobNext[o.id] = (st.blobNext[o.id] ?? 1) - dt;
        if (st.blobNext[o.id] <= 0) {
          st.blobNext[o.id] = 1;
          circle(c, o.position.x, o.position.z, 1.5, 0.05, 1.8, { telegraph: false, type: 'fire', name: 'Magma Damlası' });
        }
      }
      if (st.blobT >= 8) {
        for (const o of blobs) o.escape();
        st.blobT = undefined;
      }
    }
  },
  onBreak(c) {
    // Brokk's break: stun 4 s, Erimiş Metal cancelled and its cooldown +8 s
    if (c.busy && c.busy.ab.id === 'brokk_molten') c.setCooldown('brokk_molten', c.cooldownLeft('brokk_molten') + 8);
    breakReact(c, 4, 1.25, 6);
    pairBreak(c);
  },
  abilities: {
    /** Örs Üçlüsü: 3-hit string within 4 m, then a blink 12 m away. */
    brokk_flurry: {
      usable(_c, _ab, _target, dist) {
        return dist <= 4.5;
      },
      start(c, b) {
        runString(c, b, BROKK_FLURRY, 2.75, 'Örs Üçlüsü');
        c.schedule(2.85, () => blinkAway(c), 'blink');
      },
    },

    /** Erimiş Hüzme: ranged tank buster, a fire beam fired at the tank after a 1.4 s telegraph (the beam shows where it lands). */
    brokk_slag: {
      start(c, b) {
        const t = tankOf(c);
        if (!t) return;
        const e = c.e;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        beam(c, e.position.x, e.position.z, ang, 22, 2.6, b.delay, 2.8, { type: 'fire', name: 'Erimiş Hüzme', vfxOnLand: 'fire_burst' });
      },
    },

    /** Hurda Şarkısı: Brokk jumps behind a scrap block, a 44 x 6 m band across the centre, the cube slides at 22 m/s. */
    brokk_scrap_song: {
      start(c, b) {
        const side = Math.random() < 0.5 ? -1 : 1;
        c.teleport(c.arena.cx + side * (c.arena.w / 2 - 3), c.arena.cz);
        band(c, c.arena.cx, c.arena.cz, Math.PI / 2, 44, 6, b.delay, 3.0, {
          type: 'physical', knockback: 8, statuses: [{ status: 'stun', duration: 1.5 }], name: 'Hurda Şarkısı',
        });
        c.schedule(b.delay, () => startSlide(c, -side), 'song');
        b.total = Math.max(b.total, b.delay + 0.4);
      },
    },

    /** Erimiş Metal: interruptible cast, a fire hit with slow on a random player. */
    brokk_molten: {
      start(c, b) {
        const t = c.randomPlayers(1)[0];
        if (!t) return;
        circle(c, t.position.x, t.position.z, 2, b.delay, 2.2, {
          type: 'fire', name: 'Erimiş Metal', vfxOnLand: 'fire_burst', statuses: [{ status: 'slow', duration: 8, magnitude: 0.5 }],
        });
      },
    },

    /** Egzoz Delikleri: 3 of 4 corner vents (1 solo, 2 for a pair), flame pools for 30 s. */
    brokk_vents: {
      start(c, b) {
        const a = c.arena;
        const ix = a.w / 2 - 5;
        const iz = a.h / 2 - 5;
        const pool: Pt[] = [
          { x: a.cx - ix, z: a.cz - iz }, { x: a.cx + ix, z: a.cz - iz }, { x: a.cx - ix, z: a.cz + iz }, { x: a.cx + ix, z: a.cz + iz },
        ];
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const n = Math.min(3, c.partySize());
        for (const v of pool.slice(0, n)) {
          zone(c, v.x, v.z, 5.5, 30, 0.5, 1.2, b.delay, { type: 'fire', name: 'Egzoz Deliği', telegraph: true, vfxOnLand: 'fire_burst' });
        }
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 4 (final): Başsözcü Eirich (boss_eirich)
// ---------------------------------------------------------------------------------------------------------------------

/** Rift sockets: W, E (the two of phase 1), NW, NE, SW, SE. */
function socketPt(c: BossController, i: number): Pt {
  const a = c.arena;
  const ix = a.w / 2 - 6;
  const iz = a.h / 2 - 6;
  const pts: Pt[] = [
    { x: a.cx - ix, z: a.cz }, { x: a.cx + ix, z: a.cz },
    { x: a.cx - a.w / 4, z: a.cz - iz }, { x: a.cx + a.w / 4, z: a.cz - iz },
    { x: a.cx - a.w / 4, z: a.cz + iz }, { x: a.cx + a.w / 4, z: a.cz + iz },
  ];
  return pts[i];
}

function riftsOf(c: BossController): Rift[] {
  return (c.state.rifts ?? []) as Rift[];
}

function freeSocket(c: BossController, exclude: number): number {
  const used = new Set(riftsOf(c).map((r) => r.sock));
  const free = [0, 1, 2, 3, 4, 5].filter((i) => !used.has(i) && i !== exclude);
  if (free.length === 0) return exclude < 0 ? 0 : exclude;
  return free[Math.floor(Math.random() * free.length)];
}

/** Persistent void hazard of a rift: 1.2 coef per 0.5 s within r (optionally growing to scaleTo x r over duration). */
function hazard(c: BossController, x: number, z: number, r: number, duration: number, scaleTo?: number): number {
  return c.track(c.shape({
    shape: { type: 'circle', radius: r }, x, z, dx: 0, dz: 1, delay: 0.05, coef: 1.2, telegraph: false, type: 'shadow',
    persist: { duration, tick: 0.5, scaleTo }, name: 'Boşluk Yarığı',
  }));
}

function openRift(c: BossController, sock: number): void {
  const p = socketPt(c, sock);
  const st = c.state;
  st.riftSeq = (st.riftSeq ?? 0) + 1;
  const tag = `rift${st.riftSeq}`;
  spawnMech(c, 'proc_void_rift', p, { tag });
  const rift: Rift = { tag, sock, x: p.x, z: p.z, hz: hazard(c, p.x, p.z, 3, 9999), uses: 0, cdUntil: 0, hold: {} };
  riftsOf(c).push(rift);
  st.rifts = riftsOf(c);
}

function closeRift(c: BossController, r: Rift): void {
  G.hitShapes.cancel(r.hz);
  for (const o of c.adds(r.tag)) o.escape();
  c.state.rifts = riftsOf(c).filter((x) => x !== r);
}

/** Cleanse spots (SP-08 fallback): stand 3.4 to 15 m from an open rift for 1.6 s; 2 cleanses close it and reopen it elsewhere. */
function riftTick(c: BossController, dt: number): void {
  const st = c.state;
  const now = c.world.time;
  const instant = now < (st.instantUntil ?? 0);
  for (const r of riftsOf(c).slice()) {
    if (r.uses >= 2) {
      const old = r.sock;
      closeRift(c, r);
      openRift(c, freeSocket(c, old));
      continue;
    }
    for (const p of c.playersInArena()) {
      const d = distXZ(r.x, r.z, p.position.x, p.position.z);
      const eligible = d >= 3.4 && d <= 15 && p.statuses.has('void_corruption');
      if (!eligible) {
        delete r.hold[p.id];
        continue;
      }
      if (!instant && now < r.cdUntil) continue;
      r.hold[p.id] = (r.hold[p.id] ?? 0) + dt;
      if (r.hold[p.id] >= (instant ? 0 : 1.6)) {
        removeStatus(p, 'void_corruption');
        r.uses += 1;
        r.cdUntil = now + (instant ? 0 : 2.5);
        r.hold = {};
        bossMsgTo(p.id, 'boss_toast', {}, { text: 'Boşluk Yozlaşması yarığa boşaltıldı' });
        break;
      }
    }
  }
}

function surgeBegin(c: BossController): void {
  const st = c.state;
  st.surgeNo = (st.surgeNo ?? 0) + 1;
  const s: SurgeState = { t: 0, a: false, b: false, second: c.phaseIdx >= 3, tag: `caster${st.surgeNo}` };
  st.surge = s;
  c.teleport(c.arena.cx, c.arena.cz);
  c.setImmune(true);
  c.freeze(true);
  // both rifts widen from 3 m to 7 m over 8 s
  for (const r of riftsOf(c)) {
    G.hitShapes.cancel(r.hz);
    r.hz = hazard(c, r.x, r.z, 3, 8, 7 / 3);
  }
}

function surgeWave(c: BossController, wave: 0 | 1): void {
  const s = c.state.surge as SurgeState;
  const groups: Array<[string, number]> = wave === 0 ? [['tk_ruh', 2]] : [['tk_uluyan', 2], ['tk_hurda', 6]];
  if (wave === 1 && s.second) groups.push(['tk_yagmaci', 2], ['tk_ruh', 2]);
  const R = Math.min(c.arena.w, c.arena.h) * 0.3;
  for (const [id, k] of groups) {
    const count = c.partySize() < 3 ? Math.ceil(k / 2) : k;
    c.spawnAdds(id, count, {
      positions: ringPoints(c.arena.cx, c.arena.cz, R, count, rnd(0, TAU)), hpMult: 3 * partyHp(c), tag: s.tag, aggro: true,
    });
  }
}

function endSurge(c: BossController): void {
  const s = c.state.surge as SurgeState | null;
  if (!s) return;
  c.state.surge = null;
  const alive = c.adds(s.tag).filter((o) => !o.isDead && !o.removed).length;
  for (let i = 0; i < alive; i++) c.dmgMul *= 1.12;
  c.setImmune(false);
  bossMsg('boss_toast', {}, { text: alive > 0 ? `${alive} sözcü ayakta kaldı! Başsözcü güçlendi.` : 'Sözcüler sustu.' });
  c.endMechanicPhase();
}

/** Yarık Dalgası timeline (own intermission, SP-05 fallback): wave A at 0 s, the rifts reach 7 m and wave B at 8 s, ends on dead casters or 24 s. */
function surgeTick(c: BossController, dt: number): void {
  const s = c.state.surge as SurgeState;
  s.t += dt;
  if (!s.a) {
    s.a = true;
    surgeWave(c, 0);
  }
  if (!s.b && s.t >= 8) {
    s.b = true;
    for (const r of riftsOf(c)) {
      G.hitShapes.cancel(r.hz);
      r.hz = hazard(c, r.x, r.z, 7, 9999);
    }
    surgeWave(c, 1);
  }
  const living = c.adds(s.tag).filter((o) => !o.isDead && !o.removed).length;
  if ((s.b && living === 0) || s.t >= 24) endSurge(c);
}

/** Entropik Hesaplaşma: the marker ring follows the player and drops a shrinking pool (SP-06 scaleTo). */
function dropPool(c: BossController, pid: number): void {
  const p = c.world.get<Player>(pid);
  if (!p || p.isDead || p.removed) return;
  c.track(c.shape({
    shape: { type: 'circle', radius: 8 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 0.05, coef: 0.55, telegraph: false,
    type: 'shadow', persist: { duration: 90, tick: 0.5, scaleTo: 2.5 / 8 }, name: 'Entropik Birikinti',
  }));
}

const eirich: BossScript = {
  init(c) {
    c.state.rifts = [];
    c.state.riftSeq = 0;
    c.state.surge = null;
    c.state.corrOn = false;
    c.state.instantUntil = 0;
    c.state.collapse = false;
  },
  onEngage(c) {
    const count = c.partySize() >= 3 ? 2 : 1;
    for (let i = 0; i < count; i++) openRift(c, i);
  },
  onPhase(c, _ph, index) {
    // faster cadence in phase 3 and on
    if (index >= 2) {
      c.cdOverride.set('eirich_void_claw', 13);
      c.cdOverride.set('eirich_reckoning', 34);
      c.cdOverride.set('eirich_corruption', 45);
      c.cdOverride.set('eirich_unbridled', 22);
    }
    if (index >= 1) c.cdOverride.set('eirich_leap', 14);
    // phase 3 (35 %): three rifts open (party of three or more)
    if (index === 4 && c.partySize() >= 3) {
      while (riftsOf(c).length < 3) openRift(c, freeSocket(c, -1));
    }
  },
  update(c, dt) {
    const st = c.state;
    if (st.surge) surgeTick(c, dt);
    riftTick(c, dt);
    // Void Corruption ramp: +1 stack to every living player every 3 s once the first Corruption has been cast
    if (st.corrOn) {
      every(st, 'corrT', dt, 3, () => {
        for (const p of c.playersInArena()) statusPlayer(p, 'void_corruption', 12, { stacks: 1 });
      });
    }
    if (st.collapse) every(st, 'soft', dt, 5, () => (c.dmgMul *= 1.05));
    tankSwapHint(c, 'void_mark', 3, 'Tank değiştir!');
  },
  onBreak(c) {
    // combat phases only: stun 5 s, cancel the windup, the next casts +6 s, cleanses instant for 6 s
    if (c.state.surge) return;
    breakReact(c, 5, 1.25, 6);
    for (const id of EIRICH_CASTS) c.setCooldown(id, c.cooldownLeft(id) + 6);
    c.state.instantUntil = c.world.time + 6;
    for (const r of riftsOf(c)) r.cdUntil = 0;
  },
  abilities: {
    /** Boşluk Üçlüsü: 3-hit string, the third hit delayed and leaves a violet scar. */
    eirich_claw: {
      start(c, b) {
        runString(c, b, ELDEN_CLAW, 2.85, 'Boşluk Üçlüsü');
        c.schedule(2.85, () => zone(c, c.e.position.x, c.e.position.z, 2.5, 4, 0.5, 0.5, 0.05, { type: 'shadow', name: 'Boşluk İzi', telegraph: true }), 'scar');
      },
    },

    /** Boşluk Sıçrayışı: vanishes into a rift, the circle follows a random non-tank, he lands and leaves a void pool. */
    eirich_leap: {
      usable(c) {
        return c.partySize() >= 3;
      },
      start(c, b) {
        const t = pickSparing(c, 1, tankOf(c))[0];
        if (!t) return;
        b.data.pid = t.id;
        b.data.leapped = 0;
        circle(c, t.position.x, t.position.z, 5, b.delay, 3.0, { follow: true, sourceId: t.id, type: 'shadow', name: 'Boşluk Sıçrayışı', vfxOnLand: 'shadow_burst' });
        b.total = Math.max(b.total, b.delay + 0.4);
      },
      tick(c, b, _dt, t) {
        if (b.data.leapped === 1 || t < b.delay - 0.4) return;
        b.data.leapped = 1;
        const p = c.world.get<Player>(b.data.pid as number);
        if (p) leapToward(c, p.position.x, p.position.z, 20);
      },
      resolve(c) {
        zone(c, c.e.position.x, c.e.position.z, 3, 15, 0.5, 0.4, 0.05, { type: 'shadow', name: 'Boşluk Birikintisi' });
      },
    },

    /** Boşluk Kavrayışı: perilous grab on the tank within 4.5 m; a dodge leaves him recovering for 2.5 s (+25 %). */
    eirich_grasp: {
      start(c, b) {
        const e = c.e;
        const t = tankOf(c);
        if (!t) return;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        wedge(c, e.position.x, e.position.z, ang, 4.5, 90, b.delay, 4.2, {
          type: 'shadow', perilous: true, name: 'Boşluk Kavrayışı',
          statuses: [{ status: 'void_mark', duration: 20, stacks: 2 }],
        });
        c.schedule(b.delay + 0.05, () => {
          if (t.isDead || t.removed) return;
          if (distXZ(e.position.x, e.position.z, t.position.x, t.position.z) > 4.5) {
            c.vulnerable(1.25, 2.5);
            c.freeze(true);
            c.schedule(2.5, () => c.freeze(false), 'grasp');
          }
        }, 'grasp');
      },
    },

    /** Boşluk Yozlaşması: the ramp starts; everyone gets the first stack now. */
    eirich_corruption: {
      start(c) {
        c.state.corrOn = true;
      },
      resolve(c) {
        for (const p of c.playersInArena()) statusPlayer(p, 'void_corruption', 12, { stacks: 1 });
      },
    },

    /** Entropik Hesaplaşma: every player gets a marker ring that drops a 90 s pool at its spot. */
    eirich_reckoning: {
      start(c, b) {
        for (const p of c.playersInArena()) {
          const land = b.delay + 1.5;
          c.track(c.shape({
            shape: { type: 'circle', radius: 8 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: land, coef: 0, damage: 0,
            telegraph: true, kind: 'friendly', type: 'shadow', follow: true, sourceId: p.id, name: 'Entropik Hesaplaşma',
          }));
          const pid = p.id;
          c.schedule(land, () => dropPool(c, pid), 'reck');
        }
      },
    },

    /** Dizginsiz Boşluk: a 90 deg, 60 m cone toward a random player, held 3 s (persist 0.5 s ticks). */
    eirich_unbridled: {
      start(c, b) {
        const e = c.e;
        const t = c.randomPlayers(1)[0];
        const ang = t ? angleTo(e.position.x, e.position.z, t.position.x, t.position.z) : e.yaw;
        wedge(c, e.position.x, e.position.z, ang, 60, 90, b.delay, 1.8, { type: 'shadow', persist: { duration: 3, tick: 0.5 }, name: 'Dizginsiz Boşluk' });
        b.total = Math.max(b.total, b.delay + 3.2);
      },
    },

    /** Yarık Dalgası: intermission with casters, the rifts widen (Eirich immune and frozen until the wave ends). */
    eirich_rift_surge: {
      start(c, b) {
        surgeBegin(c);
        b.total = Math.max(b.total, b.delay + 0.3);
      },
    },

    /** Boşluk Çöküşü (15 %): two void bands rotate through the centre for 14 s; soft enrage starts. */
    eirich_collapse: {
      start(c, b) {
        c.state.collapse = true;
        const cx = c.arena.cx;
        const cz = c.arena.cz;
        rotatingBeams(c, {
          origins: { x: cx, z: cz, n: 2 }, dirs: [0, Math.PI], speedDeg: 22, length: 45, width: 5, coef: 1.5, dur: 14,
          step: 0.4, delay: b.delay, type: 'shadow', name: 'Boşluk Çöküşü',
        });
        b.total = Math.max(b.total, b.delay + 0.3);
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------------------------------------------------

export const TASKASA_SCRIPTS: Record<string, BossScript> = {
  boss_seda: seda,
  boss_skarmorak: skarmorak,
  boss_brokk: brokk,
  boss_dorlita: dorlita,
  boss_eirich: eirich,
};

export const TASKASA_SPAWNS: Record<string, string[]> = {
  boss_seda: ['tk_proc_volatile_spike'],
  boss_skarmorak: ['tk_proc_crystal_shard', 'proc_unstable_fragment'],
  boss_brokk: ['proc_scrap_cube', 'proc_magma_blob'],
  boss_dorlita: ['proc_scrap_cube', 'proc_magma_blob'],
  boss_eirich: ['proc_void_rift', 'tk_ruh', 'tk_uluyan', 'tk_hurda', 'tk_yagmaci'],
};
