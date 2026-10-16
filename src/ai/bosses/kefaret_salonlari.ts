import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import { bossFx } from '../bossNet';
import type { BossHandler, BossScript } from './types';
import { angleTo, beam, circle, dashLine, every, ring, ringPoints, statusPlayer, wedge } from './kit';
import { bossLeap } from './moveBridge';

/**
 * Kefaret Salonları bosses (docs/dungeons/kefaret_salonlari.md section 5), simplified to the engine pieces in the repo:
 *  - Halkor: holds (immune, frozen) until the three shards of the chambers are dead (dead `kef_shard` enemies in the world),
 *    then ground circles and four beams; a leash frightens players who stand outside the rotunda (r 22 m, every 3 s).
 *    Deviation: no stair exemption for the leash, no shard beams, no rune-ring ticks.
 *  - Ekelon: a leap onto a random player (6 m landing ring), a cross of two wedges and a charge line.
 *  - Alyez: judgment beams at three players, two seal circles and a root on a non-tank.
 *    Deviation: no Kefaret Kapları (vessels), no Hayalet Cemaat adds.
 *  - Velkaan: a harvest ring, four beams from the arena corners and a pride burst (no sinstone statue entities).
 * Ability ids match the boss defs in src/data/enemies_kefaret_salonlari.ts. OWNER: enemies module.
 */

const TANK_CLASSES = new Set<string>(['knight', 'barbarian', 'paladin', 'monk', 'demonhunter']);
const isTankP = (p: Player): boolean => TANK_CLASSES.has(p.classId);

/** A random player in the arena, optionally skipping the tank. */
function randomPlayer(c: BossController, skipTank = false): Player | null {
  const all = c.playersInArena();
  const pool = skipTank ? all.filter((p) => !isTankP(p)) : all;
  const list = pool.length ? pool : all;
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

/**
 * Halkor's awakening. The party kills the three shards in their chambers long before it reaches the pit, so the boss is not engaged
 * (update() does not run) and the corpses leave the world 20 s after the death (Combat.corpseLifetime): the deaths are recorded as
 * they happen, per boss, in a ledger that survives the fight reset (a wipe after the awakening must not put Halkor back to sleep
 * with no shard left to kill).
 */
const shardLedger = new WeakMap<BossController, Set<number>>();

function shardsDead(c: BossController): number {
  let dead = shardLedger.get(c);
  if (!dead) {
    const seen = new Set<number>();
    dead = seen;
    shardLedger.set(c, seen);
    const off = G.events.on('death', (d) => {
      if (c.e.removed) {
        off();
        return;
      }
      const e = G.world?.enemies.find((o) => o.id === d.entityId);
      if (!e || e.def.id !== 'kef_shard' || seen.has(e.id)) return;
      seen.add(e.id);
      if (seen.size >= 3) wakeHalkor(c);
    });
  }
  return dead.size;
}

function wakeHalkor(c: BossController): void {
  if (c.state.awake) return;
  c.state.awake = true;
  c.setImmune(false);
  c.freeze(false);
  bossFx('boss_enrage', c.e.position.x, c.e.position.z, { dur: 1.2 });
}

// ---- Boss 1: Halkor -----------------------------------------------------------------------------------------------------------

const halkor: BossScript = {
  abilities: {
    halkor_quake: {
      start(c) {
        const e = c.e;
        for (let i = 0; i < 2; i++) {
          const p = randomPlayer(c);
          if (p) circle(c, p.position.x, p.position.z, 5, 1.0 + i * 0.3, 1.0, { name: 'Günah Depremi' });
        }
        ring(c, e.position.x, e.position.z, 9, 14, 1.4, 0.6, { name: 'Günah Halkası' });
      },
    },
    halkor_beams: {
      start(c) {
        const e = c.e;
        const base = Math.random() * Math.PI * 2;
        for (let i = 0; i < 4; i++) {
          beam(c, e.position.x, e.position.z, base + (i * Math.PI) / 2, 22, 3, 1.0, 1.4, { name: 'Kızıl Işın' });
        }
      },
    },
    halkor_rage: {
      start(c) {
        const e = c.e;
        ring(c, e.position.x, e.position.z, 0, 8, 1.2, 1.5, { name: 'Mezar Öfkesi' });
      },
    },
  } satisfies Record<string, BossHandler>,

  init(c: BossController) {
    // Halkor sleeps under the dome until the third shard dies (the awakening; see update)
    c.state.awake = false;
    if (shardsDead(c) >= 3) {
      c.state.awake = true;
      return;
    }
    c.setImmune(true);
    c.freeze(true);
  },

  update(c, dt) {
    if (!c.state.awake) {
      if (shardsDead(c) >= 3) wakeHalkor(c);
      return;
    }
    // sin leash: players outside the rotunda (r 22 m) are frightened every 3 s
    every(c.state, 'leash', dt, 3, () => {
      const e = c.e;
      for (const p of c.playersInArena()) {
        if (Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) > 22) statusPlayer(p, 'fear', 3);
      }
    });
  },
};

// ---- Boss 2: Taş Komutan Ekelon -----------------------------------------------------------------------------------------------

const ekelon: BossScript = {
  abilities: {
    ekelon_leap: {
      start(c) {
        const t = randomPlayer(c, true);
        if (!t) return;
        bossLeap(c, { target: t, airtime: 1.0, radius: 6, coef: 1.0, name: 'Taş Parçalayan Sıçrayış', statuses: [{ status: 'stun', duration: 1 }] });
      },
    },
    ekelon_cross: {
      start(c) {
        const e = c.e;
        const ang = e.yaw;
        wedge(c, e.position.x, e.position.z, ang, 6, 90, 1.1, 1.0, { name: 'Haç Kılıcı' });
        wedge(c, e.position.x, e.position.z, ang + Math.PI / 2, 6, 90, 1.1, 1.0, { name: 'Haç Kılıcı' });
      },
    },
    ekelon_charge: {
      start(c) {
        const e = c.e;
        const t = randomPlayer(c, true);
        if (!t) return;
        const a = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        dashLine(c, e.position.x, e.position.z, a, 22, 4, 1.0, 16, 1.0, { name: 'Ölüm Hücumu' });
      },
    },
  } satisfies Record<string, BossHandler>,
};

// ---- Boss 3: Yüce Hâkim Alyez -------------------------------------------------------------------------------------------------

const alyez: BossScript = {
  kite: [10, 16],
  abilities: {
    alyez_judgment: {
      start(c) {
        const e = c.e;
        for (let i = 0; i < 3; i++) {
          const t = randomPlayer(c);
          if (!t) continue;
          const a = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
          beam(c, e.position.x, e.position.z, a, 25, 3, 1.2, 1.3, { name: 'Hüküm Işığı' });
        }
      },
    },
    alyez_seal: {
      start(c) {
        for (let i = 0; i < 2; i++) {
          const p = randomPlayer(c);
          if (p) circle(c, p.position.x, p.position.z, 4, 1.0 + i * 0.2, 1.2, { name: 'Mühür' });
        }
      },
    },
    alyez_bind: {
      start(c) {
        const t = randomPlayer(c, true);
        if (t) statusPlayer(t, 'root', 2);
      },
    },
  } satisfies Record<string, BossHandler>,
};

// ---- Boss 4 (final): Baş Kamarar Velkaan -------------------------------------------------------------------------------------

const velkaan: BossScript = {
  abilities: {
    velkaan_harvest: {
      start(c) {
        const e = c.e;
        ring(c, e.position.x, e.position.z, 4, 9, 1.3, 1.2, { name: 'Hasat Halkası' });
      },
    },
    velkaan_statues: {
      start(c) {
        const e = c.e;
        // four beams from the statue plinths on the corners of the 12 m circle, aimed at the centre
        for (const a of ringPoints(e.position.x, e.position.z, 12, 4, Math.PI / 4)) {
          beam(c, a.x, a.z, angleTo(a.x, a.z, e.position.x, e.position.z), 26, 3, 1.4, 1.2, { name: 'Dört Heykel' });
        }
      },
    },
    velkaan_pride: {
      start(c) {
        const e = c.e;
        c.yell('Kibrim sizi ezer!');
        ring(c, e.position.x, e.position.z, 0, 8, 2.0, 1.5, { name: 'Kibir Patlaması' });
      },
    },
  } satisfies Record<string, BossHandler>,
};

// ---- registry ----------------------------------------------------------------------------------------------------------------

export const KEFARET_SCRIPTS: Record<string, BossScript> = {
  boss_halkor: halkor,
  boss_ekelon: ekelon,
  boss_alyez: alyez,
  boss_velkaan: velkaan,
};

export const KEFARET_SPAWNS: Record<string, string[]> = {
  boss_halkor: ['kef_shard'],
  boss_ekelon: [],
  boss_alyez: ['kef_tormented'],
  boss_velkaan: [],
};
