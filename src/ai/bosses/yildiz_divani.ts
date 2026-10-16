import { G } from '../../game/G';
import type { BossController } from '../BossController';
import type { Busy } from '../EnemyAI';
import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import { bossMsg } from '../bossNet';
import type { BossScript } from './types';
import { bossLeap, followWindupFor } from './moveBridge';
import {
  angleTo, beam, busyTarget, circle, distXZ, every, floatOver, farthestPlayer, intermission, movingBand, partyHp, pickPlayers, playersIn,
  ring, ringPoints, rnd, rotatingBeams, spawnMech, statusPlayer, wedge, zone, type Pt, type SO,
} from './kit';

/**
 * Yildiz Divani formal bosses (docs/dungeons/yildiz_divani.md section 5): Devriye Kaptani Gerdan, Taliksa Alevcelenk with the
 * Zumrut Alev emissaries, and Danisman Melandros. OWNER: enemies module.
 *
 * Conventions used below:
 * - `c.gdd(x, z)` takes the tile coordinates of the design doc.
 * - A staged ("ER") string or delayed swing keeps its later hits in `b.data` and spawns them from `tick`, so an abort
 *   (stun, poise break, death) stops the rest of the sequence automatically. A later telegraph is spawned at the moment the
 *   previous hit resolves and carries the hold inside its delay (the landing time is the doc's time).
 * - Posture (SPX-22) is the engine's poise bar. This file only reacts to the break (onBreak): it cancels the cast or channel
 *   and staggers the boss. The bar lockout and regeneration are not implemented here.
 */

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Living tagged adds of this boss. */
function aliveAdds(c: BossController, tag: string): Enemy[] {
  return c.adds(tag).filter((o) => !o.isDead && !o.removed);
}

/** A player stored by id in a busy record, if still alive. */
function livePlayer(c: BossController, id: unknown): Player | null {
  if (typeof id !== 'number') return null;
  const p = c.world.get<Player>(id);
  return p && !p.isDead && !p.removed ? p : null;
}

/** Angle from the boss to the busy target (falls back to the boss facing). */
function aimAt(c: BossController, b: Busy): number {
  const t = busyTarget(c, b);
  return t ? angleTo(c.e.position.x, c.e.position.z, t.position.x, t.position.z) : c.e.yaw;
}

function nearestOf(c: BossController, players: Player[]): Player | null {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of players) {
    const d = distXZ(c.e.position.x, c.e.position.z, p.position.x, p.position.z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Distance from (px, pz) to the segment that starts at (ax, az), heads along `ang` and is `len` long. */
function segDist(px: number, pz: number, ax: number, az: number, ang: number, len: number): number {
  const dx = Math.sin(ang), dz = Math.cos(ang);
  const u = Math.max(0, Math.min(len, (px - ax) * dx + (pz - az) * dz));
  return Math.hypot(ax + dx * u - px, az + dz * u - pz);
}

/** Gece Pinari (the Melandros well) in tile coordinates. */
const WELL: [number, number] = [22, 4.8];

/**
 * Pending: the Nightwell poison flag (`nightwell_poisoned`) lives in DungeonScene.dungeonEvents (a getter on the scene, not on G).
 * G has no reference to it, so the flag reads as false until SPX-08 exposes it.
 */
function nightwellPoisoned(): boolean {
  // TODO(SPX-08): read nightwell_poisoned from the dungeon event store once it is reachable from G.
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Devriye Kaptani Gerdan
// ---------------------------------------------------------------------------------------------------------------------
/** Beacon posts (tile coordinates). */
const GERDAN_POSTS: [number, number][] = [[18.5, 39.5], [32.5, 39.5], [18.5, 49.5], [32.5, 49.5]];

/**
 * BossController.engage() sets `mode = 'idle'` after EnemyAI.acquire() has set `'chase'`, so a freshly engaged boss sits in
 * idleTick and never reaches combatTick (no ability, no basic). onEngage runs after that reset, so the script puts the brain
 * back into chase here. Remove once engage() keeps the acquire mode (the engine file is outside this module).
 */
function resumeChase(c: BossController): void {
  if (c.e.aggroed && c.target) c.mode = 'chase';
}

const gerdan: BossScript = {
  onEngage(c) {
    resumeChase(c);
    for (const [x, z] of GERDAN_POSTS) {
      spawnMech(c, 'proc_beacon', c.gdd(x, z), { hpMult: 3 * partyHp(c), tag: 'beacon' });
    }
  },
  onBreak(c) {
    const b = c.currentBusy;
    // a break during the Solemn Night flask cancels it; its abort applies the flask stagger
    if (b && b.ab.id === 'gerdan_flask') {
      c.abortBusy('external');
      return;
    }
    c.stagger(4, 1.25, 4, 'SERSEMLEDI!');
  },
  abilities: {
    /** Rezonans Darbesi: a front and a rear cone (r 7, 100 deg), coef 2.6 arcane + stun 2 s, perilous (dodge only). */
    gerdan_resonant: {
      start(c, b) {
        const e = c.e;
        const ang = aimAt(c, b);
        e.yaw = ang;
        const o: SO = { type: 'arcane', statuses: [{ status: 'stun', duration: 2 }], perilous: true, name: 'Rezonans Darbesi' };
        wedge(c, e.position.x, e.position.z, ang, 7, 100, b.delay, 2.6, o);
        wedge(c, e.position.x, e.position.z, ang + Math.PI, 7, 100, b.delay, 2.6, o);
      },
    },

    /** Caddeyi Supurme: a 46 x 3 beam through each of clamp(floor(n / 2), 1, 3) players, coef 2.8 arcane. Not while Lockdown stacks exist. */
    gerdan_sweeper: {
      usable(c) {
        return !c.playersInArena().some((p) => p.statuses.stacks('arcane_lockdown') > 0);
      },
      start(c, b) {
        const e = c.e;
        const count = Math.min(3, Math.max(1, Math.floor(c.playersInArena().length / 2)));
        for (const p of pickPlayers(c, count, true)) {
          const ang = angleTo(e.position.x, e.position.z, p.position.x, p.position.z);
          beam(c, e.position.x, e.position.z, ang, 46, 3, b.delay, 2.8, { type: 'arcane', name: 'Caddeyi Supurme' });
        }
      },
    },

    /** Arcane Kilitlenme: raid telegraph, then 3 stacks of arcane_lockdown on every living player for 20 s. */
    gerdan_lockdown: {
      start(c, b) {
        // display-only raid circle (the doc gives no radius or damage): the stacks are the mechanic
        circle(c, c.e.position.x, c.e.position.z, 8, b.delay, 0, { name: 'Arcane Kilitlenme' });
      },
      resolve(c) {
        for (const p of c.playersInArena()) statusPlayer(p, 'arcane_lockdown', 20, { stacks: 3 });
      },
    },

    /** Sinyal Fenerini Yak: interruptible 2.2 s cast; on completion the nearest intact beacon spawns 2 Uyanik Nobetci. */
    gerdan_signal: {
      resolve(c) {
        const beacons = aliveAdds(c, 'beacon');
        if (!beacons.length) return;
        let best = beacons[0];
        let bd = Infinity;
        for (const o of beacons) {
          const d = distXZ(c.e.position.x, c.e.position.z, o.position.x, o.position.z);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        const x = best.position.x, z = best.position.z;
        c.spawnAdds('ys_uyanik_nobetci', 2, { positions: [{ x: x - 1.2, z }, { x: x + 1.2, z }], aggro: true, tag: 'nobetci' });
      },
    },

    /** Solemn Gecesi Sisesi: 2.5 s cast. Completed: +30% damage and attack speed. Interrupted or posture broken: 4 s stagger, +30% taken for 6 s. */
    gerdan_flask: {
      resolve(c) {
        c.dmgMul *= 1.3;
        c.atkMul *= 1.3;
        floatOver(c.e, '+%30');
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
      },
      abort(c, b, reason) {
        if (b.resolved || reason === 'death' || c.inReset) return;
        c.stagger(4, 1.3, 6, 'SISE BOZULDU!');
      },
    },

    /** Nobet Ucleme: cone 4.0 m (windup 0.70), cone 4.6 m 120 deg (0.4 s gap, windup 0.75), then a delayed overhead circle r 3.5 (0.6 s hold, windup 0.95). */
    gerdan_string: {
      start(c, b) {
        const e = c.e;
        const ang = aimAt(c, b);
        e.yaw = ang;
        b.data.h = 1;
        wedge(c, e.position.x, e.position.z, ang, 4.0, 100, b.delay, 1.0, { type: 'physical', name: 'Nobet Ucleme' });
        b.total = b.delay + 0.4 + 0.75 + 0.6 + 0.95 + 0.25;
      },
      tick(c, b, _dt, t) {
        const e = c.e;
        const h = num(b.data.h);
        if (h === 1 && t >= b.delay + 0.4) {
          b.data.h = 2;
          wedge(c, e.position.x, e.position.z, aimAt(c, b), 4.6, 120, 0.75, 1.2, { type: 'physical', name: 'Nobet Ucleme' });
        } else if (h === 2 && t >= b.delay + 1.15) {
          b.data.h = 3;
          const ang = aimAt(c, b);
          const fx = e.position.x + Math.sin(ang) * 3, fz = e.position.z + Math.cos(ang) * 3;
          circle(c, fx, fz, 3.5, 0.6 + 0.95, 2.0, { type: 'physical', statuses: [{ status: 'knockdown', duration: 0.8 }], name: 'Nobet Ucleme' });
        }
      },
    },

    /** Sehir Kapisi Atilisi: 14 x 3 lane on a random non-tank (windup 1.05), coef 2.4 + knockdown, dash 14 m, then 1.5 s recovery. A beacon on the lane is rammed: it breaks and Gerdan is stunned 2 s. */
    gerdan_gate: {
      start(c, b) {
        const e = c.e;
        const t = pickPlayers(c, 1, true)[0] ?? busyTarget(c, b);
        if (!t) return;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        b.data.ang = ang;
        e.yaw = ang;
        beam(c, e.position.x, e.position.z, ang, 14, 3, b.delay, 2.4, {
          type: 'physical', statuses: [{ status: 'knockdown', duration: 1 }], name: 'Sehir Kapisi Atilisi',
        });
        b.total = b.delay + 0.4 + 1.5 + 0.25;
      },
      resolve(c, b) {
        const e = c.e;
        const ang = num(b.data.ang, e.yaw);
        let rammed = false;
        for (const o of aliveAdds(c, 'beacon')) {
          if (segDist(o.position.x, o.position.z, e.position.x, e.position.z, ang, 14) <= o.radius + 1.5) {
            o.escape();
            rammed = true;
          }
        }
        // TODO(SPX-22): the ram also deals 40 posture; there is no API to add posture damage to a boss yet.
        if (rammed) {
          c.stagger(2, 1.0, 0, 'NOBET KIRILDI!');
          return;
        }
        c.dash(Math.sin(ang), Math.cos(ang), 14, 0.4);
      },
    },

    /** Nobet Atlayisi: a shadow follows a random non-tank for the windup, then Gerdan leaps to the locked spot (0.4 s air), coef 2.2, then 1.2 s recovery. */
    gerdan_leap: {
      start(c, b) {
        const t = pickPlayers(c, 1, true)[0] ?? busyTarget(c, b);
        if (!t) return;
        b.data.pid = t.id;
        // display-only shadow that follows the target during the windup
        circle(c, t.position.x, t.position.z, 4.5, b.delay, 0, { follow: true, sourceId: t.id, name: 'Nobet Atlayisi' });
        b.total = b.delay + 0.4 + 1.2 + 0.25;
      },
      tick(c, b, _dt, t) {
        // the leap starts when the windup ends (the lock)
        if (b.data.leaped || t < b.delay) return;
        b.data.leaped = true;
        const target = livePlayer(c, b.data.pid);
        if (!target) return;
        bossLeap(c, {
          target, airtime: 0.4, radius: 4.5, coef: 2.2, type: 'physical', statuses: [{ status: 'knockdown', duration: 1 }], name: 'Nobet Atlayisi',
        });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Taliksa Alevcelenk and the Zumrut Alev emissaries
// ---------------------------------------------------------------------------------------------------------------------
/** The covenant members: unit, tile position, HP multiplier (x partyHp). */
const EMISSARIES: [string, number, number, number][] = [
  ['ys_cazsar', 50.5, 38.5, 18],
  ['ys_baalgar', 55.5, 43.5, 14],
  ['ys_imakutya', 50, 46, 16],
];

/** Kizil Sozlesme: each living emissary gives Taliksa +20% damage; each member takes -15% per other living member (1.1 s windows, every 1 s). */
function covenant(c: BossController): void {
  const emis = aliveAdds(c, 'emissary');
  const f = 1 + 0.2 * emis.length;
  const prev = num(c.state.covF, 1);
  if (f !== prev) {
    c.dmgMul = (c.dmgMul / prev) * f;
    c.state.covF = f;
  }
  const members: Enemy[] = [c.e, ...emis];
  const others = members.length - 1;
  if (others <= 0) return;
  const mult = Math.max(0.3, 1 - 0.15 * others);
  for (const m of members) bossMsg('boss_dmgwin', { dur: 1.1, mult }, { targetId: m.id });
}

const taliksa: BossScript = {
  init(c) {
    c.state.covF = 1;
    // the emissaries stand idle until the pull (aggro off); the covenant links them in update()
    // TODO(SPX-22): link the emissaries to the fight on onEngage once the summoned-link API exists.
    for (const [id, x, z, hp] of EMISSARIES) {
      c.spawnAdds(id, 1, { positions: [c.gdd(x, z)], aggro: false, tag: 'emissary', hpMult: hp * partyHp(c) });
    }
  },
  onEngage(c) {
    resumeChase(c);
  },
  update(c, dt) {
    every(c.state, 'cov', dt, 1.0, () => covenant(c));
  },
  onBreak(c) {
    const b = c.currentBusy;
    // a posture break cancels the Yakici Siddet channel
    if (b && b.ab.id === 'taliksa_intensity') c.abortBusy('external');
    c.stagger(4, 1.25, 4, 'SERSEMLEDI!');
  },
  abilities: {
    /** Cehennem Patlamasi: circle r 3 under every player (coef 2.4 fire + knockdown), burning ground r 3 for 12 s, one imp per two players hit. */
    taliksa_eruption: {
      start(c, b) {
        const pts: Pt[] = c.playersInArena().map((p) => ({ x: p.position.x, z: p.position.z }));
        c.state.eruptPts = pts;
        for (const p of pts) {
          circle(c, p.x, p.z, 3, b.delay, 2.4, { type: 'fire', statuses: [{ status: 'knockdown', duration: 1 }], name: 'Cehennem Patlamasi' });
          zone(c, p.x, p.z, 3, 12, 1.0, 0.5, b.delay, { name: 'Cehennem Patlamasi' });
        }
      },
      resolve(c) {
        const pts = (c.state.eruptPts ?? []) as Pt[];
        const imps = Math.floor(pts.length / 2);
        if (imps > 0) c.spawnAdds('ys_yanan_iblis', imps, { positions: pts.slice(0, imps), aggro: true, tag: 'imp' });
        c.state.eruptPts = [];
      },
    },

    /** Yakici Siddet: 8 s channel, a raid pulse of coef 0.7 fire every 2.0 s (1.5 s in P2), each pulse adds ys_intensity. A posture break cancels it. */
    taliksa_intensity: {
      start(c, b) {
        b.data.k = 0;
      },
      tick(c, b, _dt, t) {
        const p2 = c.phaseIdx >= 1;
        const interval = p2 ? 1.5 : 2.0;
        const count = p2 ? 5 : 4;
        const k = num(b.data.k);
        if (k >= count || t < b.delay + k * interval) return;
        b.data.k = k + 1;
        circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0.3, 0.7, { type: 'fire', name: 'Yakici Siddet' });
        for (const p of c.playersInArena()) statusPlayer(p, 'ys_intensity', 12, { stacks: 1 });
      },
    },

    /** Solan Ruh: interruptible 2.0 s cast on a random player: withering_soul (20 s, one stack). */
    taliksa_withering: {
      start(c, b) {
        const t = pickPlayers(c, 1)[0];
        if (t) b.data.pid = t.id;
      },
      resolve(c, b) {
        const p = livePlayer(c, b.data.pid);
        if (p) statusPlayer(p, 'withering_soul', 20, { stacks: 1 });
      },
    },

    /** Alev Kirbaci: cone 6 m 70 deg on the nearest player (windup 0.75), then after a 0.5 s gap and 0.4 s hold a circle r 6 around her, coef 1.6 (windup 0.85). */
    taliksa_whip: {
      usable(c) {
        return playersIn(c, c.e.position.x, c.e.position.z, 6).length > 0;
      },
      start(c, b) {
        const e = c.e;
        const near = nearestOf(c, c.playersInArena());
        if (!near) return;
        const ang = angleTo(e.position.x, e.position.z, near.position.x, near.position.z);
        b.data.ang = ang;
        b.data.h = 0;
        wedge(c, e.position.x, e.position.z, ang, 6, 70, b.delay, 1.2, { type: 'fire', name: 'Alev Kirbaci' });
        b.total = b.delay + 0.5 + 0.4 + 0.85 + 0.25;
      },
      tick(c, b, _dt, t) {
        if (num(b.data.h) > 0 || t < b.delay + 0.5) return;
        b.data.h = 1;
        circle(c, c.e.position.x, c.e.position.z, 6, 0.4 + 0.85, 1.6, { type: 'fire', name: 'Alev Kirbaci' });
      },
    },

    /** Gecikmis Alev Kureleri: 3 fire orbs leave 0.45 s apart for random players; each detonates r 3 (coef 1.3) 1.2 s after launch at the spot its player stood on. */
    taliksa_orbs: {
      start(c, b) {
        pickPlayers(c, 3).forEach((p, k) => {
          circle(c, p.position.x, p.position.z, 3, b.delay + k * 0.45 + 1.2, 1.3, { type: 'fire', name: 'Gecikmis Alev Kureleri' });
        });
      },
    },

    /** Cehennem Sicrayisi (P2): marker on the farthest player (1.3 s), leap in 0.35 s, coef 2.0 fire, 2 imps and a 6 s fel crack r 4, then 1.2 s recovery. */
    taliksa_leap: {
      start(c, b) {
        const far = farthestPlayer(c, c.e.position.x, c.e.position.z);
        if (!far) return;
        b.data.pid = far.id;
        // display-only landing marker for the whole 1.3 s telegraph
        circle(c, far.position.x, far.position.z, 4, 1.3, 0, { name: 'Cehennem Sicrayisi' });
        b.total = b.delay + 0.35 + 1.2 + 0.25;
      },
      resolve(c, b) {
        const far = livePlayer(c, b.data.pid);
        if (!far) return;
        const L = bossLeap(c, { target: far, airtime: 0.35, radius: 4, coef: 2.0, type: 'fire', name: 'Cehennem Sicrayisi' });
        b.data.lx = L.x;
        b.data.lz = L.z;
      },
      tick(c, b, _dt, t) {
        if (b.data.spawned || typeof b.data.lx !== 'number' || t < b.delay + 0.35) return;
        b.data.spawned = true;
        const lx = num(b.data.lx), lz = num(b.data.lz);
        c.spawnAdds('ys_yanan_iblis', 2, { positions: [{ x: lx - 1.5, z: lz }, { x: lx + 1.5, z: lz }], aggro: true, tag: 'imp' });
        zone(c, lx, lz, 4, 6, 1.0, 0.5, 0.05, { name: 'Cehennem Sicrayisi' });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Danisman Melandros
// ---------------------------------------------------------------------------------------------------------------------
/** Blade image cap: 5, or 8 with 4+ players on Mythic+. */
function imageCap(c: BossController): number {
  return c.partySize() >= 4 && G.mplus?.state?.difficulty === 'mythicplus' ? 8 : 5;
}

/** Leave a blade image where Melandros stands; the oldest image goes when the cap is reached. */
function leaveImage(c: BossController): void {
  const list = aliveAdds(c, 'image');
  const cap = imageCap(c);
  while (list.length >= cap) list.shift()?.escape();
  c.spawnAdds('ys_melandros_imaj', 1, {
    positions: [{ x: c.e.position.x, z: c.e.position.z }], aggro: false, tag: 'image', hpMult: 1.2 * partyHp(c),
  });
}

/** Yankilanan Bicaklar: the rotating beams of the echo intermission. Adjacent images turn in opposite directions. */
function echoBeams(c: BossController, pts: Pt[]): void {
  const cx = c.arena.cx, cz = c.arena.cz;
  const dirs = pts.map((p) => angleTo(p.x, p.z, cx, cz));
  const pick = (parity: number): { origins: Pt[]; dirs: number[] } => ({
    origins: pts.filter((_, i) => i % 2 === parity),
    dirs: dirs.filter((_, i) => i % 2 === parity),
  });
  const even = pick(0), odd = pick(1);
  rotatingBeams(c, { origins: even.origins, dirs: even.dirs, speedDeg: 24, length: 28, width: 2.4, coef: 1.1, dur: 14, name: 'Yankilanan Bicaklar' });
  rotatingBeams(c, { origins: odd.origins, dirs: odd.dirs, speedDeg: -24, length: 28, width: 2.4, coef: 1.1, dur: 14, name: 'Yankilanan Bicaklar' });
}

const melandros: BossScript = {
  onEngage(c) {
    resumeChase(c);
  },
  onBreak(c) {
    const b = c.currentBusy;
    // a posture break cancels the Dilimleyen Kasirga channel
    if (b && b.ab.id === 'melandros_maelstrom') c.abortBusy('external');
    c.stagger(4, 1.25, 4, 'SERSEMLEDI!');
  },
  abilities: {
    /** Bicak Dalgasi: circle follows a non-tank for 1.0 s, locks, then he leaves an image, dashes to the lock and hits coef 2.2 + bleed. */
    melandros_surge: {
      start(c, b) {
        const t = pickPlayers(c, 1, true)[0] ?? busyTarget(c, b);
        if (!t) return;
        b.data.pid = t.id;
        circle(c, t.position.x, t.position.z, 3.5, 1.0, 0, { follow: true, sourceId: t.id, name: 'Bicak Dalgasi' });
        b.total = b.delay + 0.5;
      },
      tick(c, b, _dt, t) {
        if (b.data.locked || t < 1.0) return;
        b.data.locked = true;
        const p = livePlayer(c, b.data.pid);
        if (!p) return;
        b.data.lx = p.position.x;
        b.data.lz = p.position.z;
        circle(c, p.position.x, p.position.z, 3.5, b.delay - 1.0 + 0.35, 2.2, {
          type: 'physical', statuses: [{ status: 'bleed', duration: 6, magnitude: 0.25 }], name: 'Bicak Dalgasi',
        });
      },
      resolve(c, b) {
        if (typeof b.data.lx !== 'number') return;
        const e = c.e;
        leaveImage(c);
        const dx = num(b.data.lx) - e.position.x, dz = num(b.data.lz) - e.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1) c.dash(dx, dz, d, 0.35);
      },
    },

    /** Delici Ruzgar: a 44 x 2.5 line from Melandros and from every living image, all at the same non-tank, coef 2.6. */
    melandros_gale: {
      start(c, b) {
        const t = pickPlayers(c, 1, true)[0] ?? busyTarget(c, b);
        if (!t) return;
        const sources: Pt[] = [c.e.position, ...aliveAdds(c, 'image').map((o) => o.position)];
        for (const s of sources) {
          const ang = angleTo(s.x, s.z, t.position.x, t.position.z);
          beam(c, s.x, s.z, ang, 44, 2.5, b.delay, 2.6, { type: 'physical', name: 'Delici Ruzgar' });
        }
      },
    },

    /** Dilimleyen Kasirga: 0.8 s cast, then a 6 s channel: a raid pulse (coef 0.9) every 1.0 s and a r 6 circle (coef 1.2) under each image. A posture break cancels it. */
    melandros_maelstrom: {
      start(c, b) {
        b.data.k = 0;
      },
      tick(c, b, _dt, t) {
        const k = num(b.data.k);
        if (k >= 6 || t < b.delay + k) return;
        b.data.k = k + 1;
        circle(c, c.arena.cx, c.arena.cz, c.arena.r, 0, 0.9, { type: 'physical', telegraph: false, name: 'Dilimleyen Kasirga' });
        for (const o of aliveAdds(c, 'image')) {
          circle(c, o.position.x, o.position.z, 6, 0.5, 1.2, { type: 'physical', name: 'Dilimleyen Kasirga' });
        }
      },
    },

    /** Kusatan Ruzgarlar (P3+): three 7 m wind walls sweep the balcony west to east, 12 m apart, coef 1.6 + stun 1.5 s. */
    melandros_winds: {
      resolve(c) {
        const cx = c.arena.cx, cz = c.arena.cz;
        // a wall's first piece sits 3.5 m past its start (half the 7 m width): keep that origin 1 m inside the west edge
        const west = cx - c.arena.w / 2 + 1 - 3.5;
        for (let k = 0; k < 3; k++) {
          const off = -12 * k;
          movingBand(c, { x: Math.max(cx - 18 + off, west), z: cz }, { x: cx + 18 + off, z: cz }, {
            speed: 8, width: 7, coef: 1.6, stun: 1.5, name: 'Kusatan Ruzgarlar',
          });
        }
      },
    },

    /** Yankilanan Bicaklar (70%): 14 s intermission. 8 images ring the centre and channel rotating beams; ring pulses at 5 s and 10 s; images detonate at 14 s. */
    melandros_echo: {
      start(c) {
        for (const o of aliveAdds(c, 'image')) o.escape();
        const cx = c.arena.cx, cz = c.arena.cz;
        const pts = ringPoints(cx, cz, 13, 8);
        c.spawnAdds('ys_melandros_imaj', 8, { positions: pts, aggro: false, tag: 'image', hpMult: 1.2 * partyHp(c) });
        echoBeams(c, pts);
        intermission(c, {
          dur: 14,
          teleportTo: { x: cx, z: cz },
          addWaves: [
            { at: 5, run: (cc: BossController) => ring(cc, cc.arena.cx, cc.arena.cz, 7, 40, 2.0, 2.4, { type: 'physical', name: 'Yankilanan Bicaklar' }) },
            { at: 10, run: (cc: BossController) => ring(cc, cc.arena.cx, cc.arena.cz, 7, 40, 2.0, 2.4, { type: 'physical', name: 'Yankilanan Bicaklar' }) },
            {
              at: 14,
              run: (cc: BossController) => {
                for (const o of aliveAdds(cc, 'image')) {
                  circle(cc, o.position.x, o.position.z, 5, 0.05, 1.8, { type: 'physical', name: 'Yankilanan Bicaklar' });
                  o.escape();
                }
              },
            },
          ],
          onEnd: (cc: BossController) => {
            // reappears at a random wall
            const a = cc.arena;
            const side = Math.floor(Math.random() * 4);
            if (side === 0) cc.teleport(a.cx - a.w / 2 + 4, rnd(a.cz - a.h / 2 + 5, a.cz + a.h / 2 - 5));
            else if (side === 1) cc.teleport(a.cx + a.w / 2 - 4, rnd(a.cz - a.h / 2 + 5, a.cz + a.h / 2 - 5));
            else if (side === 2) cc.teleport(rnd(a.cx - a.w / 2 + 5, a.cx + a.w / 2 - 5), a.cz - a.h / 2 + 4);
            else cc.teleport(rnd(a.cx - a.w / 2 + 5, a.cx + a.w / 2 - 5), a.cz + a.h / 2 - 4);
          },
        });
      },
    },

    /** Gece Pinari'ndan Ic (25%): runs to the well, channels 5 s immune. Unpoisoned: +30% damage and attack speed, heals 5%. Poisoned: loses 12% max HP and is staggered 6 s (+80% taken for 8 s). */
    melandros_nightwell: {
      start(c, b) {
        const e = c.e;
        const w = c.gdd(WELL[0], WELL[1]);
        const dx = w.x - e.position.x, dz = w.z - e.position.z;
        const d = Math.hypot(dx, dz);
        c.setImmune(true);
        if (d > 0.5) c.dash(dx, dz, d, 2.5);
        b.data.done = false;
      },
      tick(c, b, _dt, t) {
        if (b.data.done || t < b.delay + 5) return;
        b.data.done = true;
        const e = c.e;
        if (nightwellPoisoned()) {
          e.hp = Math.max(1, e.hp - 0.12 * e.maxHp);
          c.stagger(6, 1.8, 8, 'ZEHIRLENDI!');
        } else {
          c.dmgMul *= 1.3;
          c.atkMul *= 1.3;
          e.hp = Math.min(e.maxHp, e.hp + 0.05 * e.maxHp);
          floatOver(e, '+%30');
        }
      },
      end(c) {
        c.setImmune(false);
      },
      abort(c) {
        c.setImmune(false);
      },
    },

    /** Pinar Tasmasi (25%+, unpoisoned only): 20 rings of 2 m from the well out to 40 m at 6 m/s, coef 2.0. Each point is reached by one ring only. */
    melandros_overflow: {
      usable() {
        return !nightwellPoisoned();
      },
      start(c, b) {
        const w = c.gdd(WELL[0], WELL[1]);
        for (let k = 1; k <= 20; k++) {
          ring(c, w.x, w.z, 2 * k - 2, 2 * k, b.delay + k / 3, 2.0, { type: 'physical', name: 'Pinar Tasmasi' });
        }
      },
    },

    /** Ruzgar Dansi: thrust (windup 0.68), slash cone 3.2 m 100 deg 0.4 s later, then after a 0.5 s hold a lunge dash 6 m with a 6 x 1.2 line, coef 1.8. */
    melandros_dance: {
      start(c, b) {
        const e = c.e;
        const ang = aimAt(c, b);
        e.yaw = ang;
        b.data.h = 1;
        beam(c, e.position.x, e.position.z, ang, 3.2, 1.0, b.delay, 0.9, { type: 'physical', name: 'Ruzgar Dansi' });
        b.total = b.delay + 0.4 + followWindupFor(0.9) + 1.4 + 0.25;
      },
      tick(c, b, _dt, t) {
        const e = c.e;
        const h = num(b.data.h);
        const t2 = b.delay + 0.4;
        const t3 = t2 + followWindupFor(0.9);
        if (h === 1 && t >= t2) {
          b.data.h = 2;
          wedge(c, e.position.x, e.position.z, aimAt(c, b), 3.2, 100, followWindupFor(0.9), 0.9, { type: 'physical', name: 'Ruzgar Dansi' });
        } else if (h === 2 && t >= t3) {
          b.data.h = 3;
          const ang = aimAt(c, b);
          b.data.lang = ang;
          beam(c, e.position.x, e.position.z, ang, 6, 1.2, 1.4, 1.8, { type: 'physical', name: 'Ruzgar Dansi' });
        } else if (h === 3 && t >= t3 + 1.4) {
          b.data.h = 4;
          const ang = num(b.data.lang, e.yaw);
          c.dash(Math.sin(ang), Math.cos(ang), 6, 0.3);
        }
      },
    },

    /** Sahte Hamle: lane (14 x 2.5) toward a non-tank, a 8.4 m feint dash that stops, 0.5 s hold, re-aimed 0.45 s flash, then a real 14 m dash with coef 2.4 + bleed. 1.2 s recovery. */
    melandros_feint: {
      start(c, b) {
        const e = c.e;
        const t = pickPlayers(c, 1, true)[0] ?? busyTarget(c, b);
        if (!t) return;
        b.data.pid = t.id;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        b.data.ang = ang;
        b.data.h = 0;
        // display-only lane marker (coef 0) for the windup
        beam(c, e.position.x, e.position.z, ang, 14, 2.5, b.delay, 0, { name: 'Sahte Hamle' });
        b.total = b.delay + 0.36 + 0.5 + 0.45 + 0.5 + 1.2;
      },
      tick(c, b, _dt, t) {
        const e = c.e;
        const h = num(b.data.h);
        const d = b.delay;
        if (h === 0 && t >= d) {
          b.data.h = 1;
          const ang = num(b.data.ang, e.yaw);
          c.dash(Math.sin(ang), Math.cos(ang), 8.4, 0.36);
        } else if (h === 1 && t >= d + 0.36 + 0.5) {
          b.data.h = 2;
          const target = livePlayer(c, b.data.pid);
          const ang2 = target ? angleTo(e.position.x, e.position.z, target.position.x, target.position.z) : num(b.data.ang, e.yaw);
          b.data.ang2 = ang2;
          beam(c, e.position.x, e.position.z, ang2, 14, 2.5, 0.45, 2.4, {
            type: 'physical', statuses: [{ status: 'bleed', duration: 6, magnitude: 0.25 }], name: 'Sahte Hamle',
          });
        } else if (h === 2 && t >= d + 0.36 + 0.5 + 0.45) {
          b.data.h = 3;
          const ang2 = num(b.data.ang2, e.yaw);
          c.dash(Math.sin(ang2), Math.cos(ang2), 14, 0.5);
        }
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Registration (ai/bosses/index.ts)
// ---------------------------------------------------------------------------------------------------------------------
export const YILDIZ_SCRIPTS: Record<string, BossScript> = {
  boss_gerdan: gerdan,
  boss_taliksa: taliksa,
  boss_melandros: melandros,
};

export const YILDIZ_SPAWNS: Record<string, string[]> = {
  boss_gerdan: ['proc_beacon', 'ys_uyanik_nobetci'],
  boss_taliksa: ['ys_cazsar', 'ys_baalgar', 'ys_imakutya', 'ys_yanan_iblis'],
  boss_melandros: ['ys_melandros_imaj'],
};
