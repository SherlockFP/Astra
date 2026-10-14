import { G } from '../../game/G';
import { METIN_SPECS } from '../../data/enemies';
import type { BossController } from '../BossController';
import { bossFx, bossMsg } from '../bossNet';
import type { BossScript } from './types';
import { angleTo, band, beam, busyTarget, circle, farthestPlayer, floatOver, pickPlayers, ring, ringPoints, rnd, TAU, wedge } from './kit';

/**
 * Open-world boss: Çürükkök, the Mantar Kral (GDD_CONTENT 1.7, `wb_curukkok`, level 10, Çürük Höyük arena r 24 m, no enrage).
 * Abilities: Asa Darbesi (basic cone, data), Spor Bulutu, Mantarcık Çağrısı, Zıplayan Ezici, Çürüme Halkası (below 20% HP).
 * OWNER: enemies module.
 */

const walkable = (c: BossController, p: { x: number; z: number }): { x: number; z: number } => {
  const nav = c.world.nav;
  if (nav.isWalkable(p.x, p.z)) return p;
  return nav.nearestWalkable(p.x, p.z, 6) ?? p;
};

const curukkok: BossScript = {
  abilities: {
    /** Spor Bulutu: 3 poison clouds r 4 m on random players' positions: 1.5 s grow-in (telegraph), then 10 s of coef 0.4 per 0.5 s. */
    curukkok_spores: {
      start(c) {
        floatOver(c.e, 'SPOR BULUTU', 1);
      },
      resolve(c) {
        const targets = pickPlayers(c, 3);
        const pts = targets.length ? targets.map((p) => ({ x: p.position.x, z: p.position.z })) : [c.randomPoint(4)];
        for (const p of pts) {
          c.shape({
            shape: { type: 'circle', radius: 4 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: 1.5, coef: 0.4, type: 'poison', telegraph: true,
            persist: { duration: 10, tick: 0.5 }, vfxOnLand: 'poison_cloud', name: 'Spor Bulutu',
          });
          bossFx('poison_burst', p.x, p.z, { scale: 1.2 });
        }
        G.audio.play('spell_cast', { pos: [c.e.position.x, 1.5, c.e.position.z], pitch: 0.7 });
      },
    },

    /** Mantarcık Çağrısı: 6 Mantarcık hop in from the ring edge (they burst into spore puffs when they die). */
    curukkok_call: {
      start(c) {
        floatOver(c.e, 'MANTARCIKLAR!', 1);
      },
      resolve(c) {
        const a = c.arena;
        const r = Math.max(8, Math.min(a.w, a.h) / 2 - 4);
        const pts = ringPoints(a.cx, a.cz, r, 6, rnd(0, TAU)).map((p) => walkable(c, p));
        c.spawnAdds('ow_mushnub', 6, { positions: pts, tag: 'add' });
        for (const p of pts) bossFx('add_spawn', p.x, p.z, { scale: 1.3 });
        bossMsg('boss_shake', { i: 0.12, d: 0.4 });
      },
    },

    /** Zıplayan Ezici: leaps onto the FARTHEST player: circle r 5 (coef 3.0 + 1 s knockdown), then a ring 5-9 m (coef 1.0). */
    curukkok_jump: {
      start(c, b) {
        const t = farthestPlayer(c, c.e.position.x, c.e.position.z) ?? busyTarget(c, b) ?? c.nearestPlayer();
        const tx = t ? t.position.x : c.e.position.x, tz = t ? t.position.z : c.e.position.z;
        b.data.tx = tx;
        b.data.tz = tz;
        b.data.leap = false;
        // the leap slam's core is perilous (red flash, dodge only); the ring around it stays blockable
        circle(c, tx, tz, 5, b.delay, 3.0, { type: 'physical', statuses: [{ status: 'knockdown', duration: 1 }], name: 'Zıplayan Ezici', vfxOnLand: 'ground_slam', perilous: true });
        ring(c, tx, tz, 5, 9, b.delay, 1.0, { type: 'physical', name: 'Ezici Halkası' });
        floatOver(c.e, 'EZİCİ!', 1);
      },
      tick(c, b, _dt, t) {
        if (b.data.leap || t < b.delay - 0.42) return;
        b.data.leap = true;
        const e = c.e;
        const dx = (b.data.tx as number) - e.position.x, dz = (b.data.tz as number) - e.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) c.dash(dx, dz, Math.min(d, 34), 0.4);
        e.playShot('Jump', 1.4, { fade: 0.04 });
        b.seq = e.anim?.shotSeq ?? b.seq;
      },
      resolve(c, b) {
        const e = c.e;
        G.vfx.spawn('leap_land', [e.position.x, 0.2, e.position.z], { scale: 1.8 });
        if (e.anim?.has('Jump_Land')) {
          e.playShot('Jump_Land', 1.3, { fade: 0.03 });
          b.seq = e.anim.shotSeq;
        }
        G.events.emit('camera:shake', { intensity: 0.45, duration: 0.4 });
        G.events.emit('hitstop', { ms: 60 });
      },
    },

    /** Çürüme Halkası (below 20% HP): a 2 m thick spore ring expanding 0 -> 20 m at 5 m/s (coef 2.0). Roll through it. */
    curukkok_rot_ring: {
      start(c, b) {
        b.data.ox = c.e.position.x;
        b.data.oz = c.e.position.z;
        b.data.k = 0;
        b.total = b.delay + 4 + 0.3;
        floatOver(c.e, 'ÇÜRÜME HALKASI', 1);
      },
      resolve(c, b) {
        bossFx('shockwave', b.data.ox as number, b.data.oz as number, { scale: 3.6, dur: 4, color: 0x9ae060 });
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.5 });
      },
      tick(c, b, _dt, t) {
        const step = 2 / 5; // 2 m band every 0.4 s = 5 m/s
        while ((b.data.k as number) < 10 && t >= b.delay + ((b.data.k as number) - 1) * step) {
          const k = b.data.k as number;
          ring(c, b.data.ox as number, b.data.oz as number, 2 * k, 2 * k + 2, step, 2.0, { type: 'poison', name: 'Çürüme Halkası' });
          b.data.k = k + 1;
        }
      },
    },
  },
};

/**
 * Alevkanat, Kızıl Ejder (GDD_OPENWORLD §3.8): the canyon dragon. Pençe Darbesi is the basic attack (data). Kuyruk Savurma and
 * Alev Soluğu are cones/circles with a 6 s fire strip, Kanat Çırpma an expanding knockback ring, Yavru Çağrısı summons imps and
 * embers (<= 6 adds of the boss's own), Meteor Yağmuru drops 8 telegraphed circles on random players, Ejder Dalışı is a line
 * from the dragon toward the farthest player that the dragon dashes along. Hovering between dives is not modelled (no flight
 * path yet), the dragon stays on the ground.
 */
const alevkanat: BossScript = {
  abilities: {
    /** Kuyruk Savurma: self circle r 8 m, coef 1.8, knockback 4 m. Telegraph during the windup. */
    alevkanat_tail: {
      start(c, b) {
        circle(c, c.e.position.x, c.e.position.z, 8, b.delay, 1.8, { knockback: 4, name: 'Kuyruk Savurma' });
        floatOver(c.e, 'KUYRUK!', 1);
      },
    },

    /** Alev Soluğu: cone 70 deg, 18 m, coef 2.4 + burn; on landing a 6 s strip of fire (coef 0.5 every 0.5 s) stays behind. */
    alevkanat_breath: {
      start(c, b) {
        const e = c.e;
        b.data.ang = e.yaw;
        wedge(c, e.position.x, e.position.z, e.yaw, 18, 70, b.delay, 2.4, { parryable: false, name: 'Alev Soluğu', statuses: [{ status: 'burn', duration: 4, magnitude: 0.3 }] });
        bossFx('fire_burst', e.position.x + Math.sin(e.yaw) * 2, e.position.z + Math.cos(e.yaw) * 2, { scale: 1.2 });
      },
      resolve(c, b) {
        const ang = (b.data.ang as number) ?? c.e.yaw;
        const x = c.e.position.x + Math.sin(ang) * 9, z = c.e.position.z + Math.cos(ang) * 9;
        band(c, x, z, ang, 18, 4, 0.05, 0.5, { type: 'fire', name: 'Ateş Şeridi', persist: { duration: 6, tick: 0.5 } });
      },
    },

    /** Kanat Çırpma: expanding ring 0 -> 12 m at 6 m/s (2 m bands), coef 1.0, knockback 8 m. Same band pattern as Çürüme Halkası. */
    alevkanat_gust: {
      start(c, b) {
        b.data.ox = c.e.position.x;
        b.data.oz = c.e.position.z;
        b.data.k = 0;
        b.total = b.delay + 2.6;
        floatOver(c.e, 'KANAT ÇIRPMA!', 1);
      },
      resolve(c, b) {
        bossFx('shockwave', b.data.ox as number, b.data.oz as number, { scale: 2.2, dur: 2, color: 0xff8040 });
        G.events.emit('camera:shake', { intensity: 0.25, duration: 0.4 });
      },
      tick(c, b, _dt, t) {
        const step = 2 / 6;
        while ((b.data.k as number) < 6 && t >= b.delay + (b.data.k as number) * step) {
          const k = b.data.k as number;
          ring(c, b.data.ox as number, b.data.oz as number, 2 * k, 2 * k + 2, step, 1.0, { knockback: 8, name: 'Kanat Çırpma' });
          b.data.k = k + 1;
        }
      },
    },

    /** Yavru Çağrısı: 4 Ateş İblisçiği + 2 Kor Elementali jump in (summoned, they give XP). Skipped while 6+ adds are alive. */
    alevkanat_brood: {
      start(c) {
        floatOver(c.e, 'YAVRULAR!', 1);
      },
      resolve(c) {
        if (c.adds('add').length > 6) return;
        c.spawnAdds('ow_imp', 4, { radius: 9, tag: 'add' });
        c.spawnAdds('ow_ember', 2, { radius: 9, tag: 'add' });
        bossFx('add_spawn', c.e.position.x, c.e.position.z, { scale: 2.4 });
        bossMsg('boss_shake', { i: 0.15, d: 0.4 });
      },
    },

    /** Meteor Yağmuru: 8 telegraphed circles r 3.5 m on random players over 5 s (coef 2.2, 1.5 s telegraph each). */
    alevkanat_meteors: {
      start(c) {
        floatOver(c.e, 'METEORLAR!', 1);
      },
      resolve(c) {
        const ps = pickPlayers(c, 8);
        for (let k = 0; k < 8; k++) {
          const p = ps.length ? ps[k % ps.length] : null;
          const base = p ? { x: p.position.x, z: p.position.z } : c.randomPoint(6);
          const x = base.x + rnd(-1, 1), z = base.z + rnd(-1, 1);
          circle(c, x, z, 3.5, 1.5 + k * 0.625, 2.2, { type: 'fire', name: 'Meteor' });
          bossFx('meteor_fall', x, z, { scale: 1 });
        }
        G.audio.play('spell_cast', { pos: [c.e.position.x, 1.5, c.e.position.z], pitch: 0.6 });
      },
    },

    /** Ejder Dalışı: line 30 x 4 m from the dragon toward the farthest player (coef 3.0, 1 s knockdown); the dragon dashes at the end of the windup. */
    alevkanat_dive: {
      start(c, b) {
        const e = c.e;
        const t = farthestPlayer(c, e.position.x, e.position.z) ?? busyTarget(c, b) ?? c.nearestPlayer();
        const tx = t ? t.position.x : e.position.x, tz = t ? t.position.z : e.position.z;
        b.data.tx = tx;
        b.data.tz = tz;
        b.data.leap = false;
        beam(c, e.position.x, e.position.z, angleTo(e.position.x, e.position.z, tx, tz), 30, 4, b.delay, 3.0, {
          name: 'Ejder Dalışı', statuses: [{ status: 'knockdown', duration: 1 }],
        });
        floatOver(e, 'DALIŞ!', 1);
      },
      tick(c, b, _dt, t) {
        if (b.data.leap || t < b.delay - 0.42) return;
        b.data.leap = true;
        const e = c.e;
        const dx = (b.data.tx as number) - e.position.x, dz = (b.data.tz as number) - e.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) c.dash(dx, dz, Math.min(d, 20), 0.4);
        e.playShot('Attack', 1.2, { fade: 0.04 });
      },
      resolve(c) {
        const e = c.e;
        G.vfx.spawn('leap_land', [e.position.x, 0.2, e.position.z], { scale: 2 });
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.5 });
        G.events.emit('hitstop', { ms: 80 });
      },
    },
  },
};

export const WORLD_SCRIPTS: Record<string, BossScript> = {
  wb_curukkok: curukkok,
  wb_alevkanat: alevkanat,
};

/** Every metin stone preloads the mobs its waves and adds spawn (derived from METIN_SPECS: one source of truth). */
const metinSpawns = (): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const [stone, spec] of Object.entries(METIN_SPECS)) {
    const ids = new Set<string>([spec.add.enemyId]);
    for (const w of spec.waves) for (const m of w.members) ids.add(m.enemyId);
    out[stone] = [...ids];
  }
  return out;
};

export const WORLD_SPAWNS: Record<string, string[]> = {
  wb_curukkok: ['ow_mushnub'],
  wb_alevkanat: ['ow_imp', 'ow_ember'],
  ...metinSpawns(),
};
