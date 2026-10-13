import { G } from '../../game/G';
import type { BossController } from '../BossController';
import { bossFx, bossMsg, bossMsgTo } from '../bossNet';
import type { BossScript } from './types';
import { band, beam, busyTarget, circle, dashLine, distXZ, every, floatOver, playersIn, rad, ringPoints, ring, rnd, TAU } from './kit';

/**
 * Kızıl Dökümhane bosses (GDD_CONTENT 4.2.5): Dökümcü Usta Gurz, Magma Devi Ateşyürek, Mavi Alev Ignaroth.
 * OWNER: enemies module.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Dökümcü Usta Gurz
// ---------------------------------------------------------------------------------------------------------------------
const gurz: BossScript = {
  abilities: {
    /** Örs Darbesi: leaps onto the target's position: circle r 4 (knockdown) then a ring 4-10 m. */
    gurz_anvil_slam: {
      start(c, b) {
        const t = busyTarget(c, b) ?? c.nearestPlayer();
        const tx = t ? t.position.x : c.e.position.x, tz = t ? t.position.z : c.e.position.z;
        b.data.tx = tx;
        b.data.tz = tz;
        b.data.leap = false;
        // the anvil slam is a big slam: perilous (red flash, dodge only); its outer ring stays blockable
        circle(c, tx, tz, 4, b.delay, 4.0, { type: 'physical', statuses: [{ status: 'knockdown', duration: 1 }], name: 'Örs Darbesi', vfxOnLand: 'ground_slam', perilous: true });
        ring(c, tx, tz, 4, 10, b.delay, 1.0, { type: 'physical', name: 'Örs Darbesi Halkası' });
      },
      tick(c, b, _dt, t) {
        if (b.data.leap || t < b.delay - 0.42) return;
        b.data.leap = true;
        const e = c.e;
        const dx = (b.data.tx as number) - e.position.x, dz = (b.data.tz as number) - e.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) c.dash(dx, dz, Math.min(d, 32), 0.4);
        e.playShot('Jump', 1.4, { fade: 0.04 });
        b.seq = e.anim?.shotSeq ?? b.seq;
      },
      resolve(c) {
        const e = c.e;
        G.vfx.spawn('leap_land', [e.position.x, 0.2, e.position.z], { scale: 1.6 });
        G.events.emit('camera:shake', { intensity: 0.45, duration: 0.4 });
        G.events.emit('hitstop', { ms: 60 });
      },
    },

    /** Erimiş Döküm: 2 of the 3 crucibles pour N-S lava lines (36 x 3 m): impact coef 2.5 then a burning strip for 12 s. */
    gurz_molten_pour: {
      start(c, b) {
        const xs = [11, 15, 19].sort(() => Math.random() - 0.5).slice(0, 2);
        const z0 = c.arena.cz - 18;
        for (const gx of xs) {
          const wx = c.gdd(gx, 0).x;
          beam(c, wx, z0, 0, 36, 3, b.delay, 2.5, { type: 'fire', name: 'Erimiş Döküm' });
          c.shape({
            shape: { type: 'line', length: 36, width: 3 }, x: wx, z: z0, dx: 0, dz: 1, delay: b.delay, coef: 0.5, type: 'fire', telegraph: false,
            persist: { duration: 12, tick: 0.5 }, name: 'Yanan Lav',
          });
          c.schedule(b.delay, () => {
            for (let i = 0; i < 6; i++) bossFx('fire_ground', wx, z0 + 3 + i * 6, { dur: 12, scale: 1.1 });
          }, 'fx');
        }
        floatOver(c.e, 'ERİMİŞ DÖKÜM', 1);
      },
    },

    /** Körük Esintisi: 3 s gust pushes every player south (+z) at 6 m/s toward the lava channel. */
    gurz_bellows: {
      start(c) {
        floatOver(c.e, 'KÖRÜK!', 1);
      },
      resolve(c) {
        bossMsg('boss_push', { dx: 0, dz: 1, speed: 6, dur: 3 });
        bossMsg('boss_shake', { i: 0.12, d: 3 });
        const a = c.arena;
        for (let i = 0; i < 4; i++) bossFx('ambient_dust', a.cx + (i - 1.5) * 9, a.cz - 10, { dur: 3, scale: 2 });
        G.audio.play('whoosh', { pos: [c.e.position.x, 1, c.e.position.z], pitch: 0.55 });
      },
    },

    /** Çalışın Köleler! (66% / 33%): 6 goblins from the west door, an orc at 33%. */
    gurz_call_slaves: {
      resolve(c) {
        const a = c.arena;
        const door = { x: a.cx - a.w / 2 + 3, z: a.cz };
        c.spawnAdds('forge_goblin', 6, { x: door.x, z: door.z, radius: 4, tag: 'add' });
        if (c.phaseIdx >= 2) c.spawnAdds('forge_orc', 1, { x: door.x + 1.5, z: door.z, radius: 1.5, tag: 'add' });
        bossFx('add_spawn', door.x, door.z, { scale: 2 });
        G.events.emit('camera:shake', { intensity: 0.2, duration: 0.4 });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Magma Devi Ateşyürek
// ---------------------------------------------------------------------------------------------------------------------
/** Volkanik Patlama: 6 random circles r 3 + 1 under every player, each leaves a lava pool for 10 s. */
function eruption(c: BossController, delay: number): void {
  const pts = [] as { x: number; z: number }[];
  for (let i = 0; i < 6; i++) pts.push(c.randomPoint(3));
  for (const p of c.playersInArena()) pts.push({ x: p.position.x, z: p.position.z });
  for (const p of pts) {
    circle(c, p.x, p.z, 3, delay, 2.5, { type: 'fire', name: 'Volkanik Patlama', vfxOnLand: 'fire_burst' });
    c.shape({
      shape: { type: 'circle', radius: 3 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: delay + 0.1, coef: 0.6, type: 'fire', telegraph: false,
      persist: { duration: 10, tick: 0.5 }, vfxOnLand: 'fire_ground', name: 'Lav Birikintisi',
    });
  }
  G.events.emit('camera:shake', { intensity: 0.2, duration: 0.3 });
}

const VENTS: [number, number][] = [[27, 30], [33, 30], [27, 36], [33, 36]];

const atesyurek: BossScript = {
  init(c) {
    c.state.heat = {};
    c.state.vent = [0, 0, 0, 0]; // world.time until which each vent is closed
    c.state.ventT = {};
  },
  onPhase(c, ph) {
    if (ph.id === 'p3') c.cdOverride.set('atesyurek_eruption', 12);
  },
  update(c, dt) {
    const st = c.state;
    const players = c.playersInArena();
    // Kızgın Kalp: +1 Sıcaklık stack per player every 5 s (1% max HP per second per stack), cleared on an open cooling vent
    every(st, 'heatT', dt, 5, () => {
      for (const p of players) {
        st.heat[p.id] = (st.heat[p.id] ?? 0) + 1;
        bossMsgTo(p.id, 'boss_toast', {}, { text: `Sıcaklık x${st.heat[p.id]} - soğutma menfezine dur!` });
      }
    });
    every(st, 'heatTick', dt, 1, () => {
      for (const p of players) {
        const n = st.heat[p.id] ?? 0;
        if (n <= 0) continue;
        c.track(c.shape({
          shape: { type: 'circle', radius: 0.9 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 0.12, damage: Math.max(1, p.maxHp * 0.01 * n), type: 'true',
          telegraph: false, follow: true, sourceId: p.id, name: 'Sıcaklık',
        }));
      }
    });
    const now = c.world.time;
    for (let i = 0; i < VENTS.length; i++) {
      if (now < st.vent[i]) continue;
      const v = c.gdd(VENTS[i][0], VENTS[i][1]);
      for (const p of players) {
        const key = `${p.id}:${i}`;
        if (distXZ(v.x, v.z, p.position.x, p.position.z) <= 2.2) {
          st.ventT[key] = (st.ventT[key] ?? 0) + dt;
          if (st.ventT[key] >= 1.0 && (st.heat[p.id] ?? 0) > 0) {
            st.heat[p.id] = 0;
            st.vent[i] = now + 20;
            st.ventT[key] = 0;
            bossFx('frost_burst', v.x, v.z, { scale: 0.9 });
            bossMsgTo(p.id, 'boss_toast', {}, { text: 'Soğudun! Menfez 20 saniye kapandı.' });
          }
        } else st.ventT[key] = 0;
      }
    }
    // hard enrage: an extra Volkanik Patlama every 4 s
    if (c.isEnraged) every(st, 'hardT', dt, 4, () => eruption(c, 1.8));
  },
  abilities: {
    atesyurek_eruption: {
      start(c, b) {
        eruption(c, b.delay);
      },
    },

    /** Magma Dalgası: a 2 m thick ring expanding 0 -> 20 m at 6 m/s (coef 3.0 + knockback); roll through it. */
    atesyurek_magma_wave: {
      start(c, b) {
        b.data.ox = c.e.position.x;
        b.data.oz = c.e.position.z;
        b.data.k = 0;
        b.total = b.delay + 3.4 + 0.3;
      },
      resolve(c, b) {
        bossFx('shockwave', b.data.ox as number, b.data.oz as number, { scale: 4, dur: 3.4 });
        G.events.emit('camera:shake', { intensity: 0.35, duration: 0.5 });
      },
      tick(c, b, _dt, t) {
        const step = 1 / 3;
        while ((b.data.k as number) < 10 && t >= b.delay + ((b.data.k as number) - 1) * step) {
          const k = b.data.k as number;
          ring(c, b.data.ox as number, b.data.oz as number, 2 * k, 2 * k + 2, step, 3.0, { type: 'fire', knockback: 4, name: 'Magma Dalgası' });
          b.data.k = k + 1;
        }
      },
    },

    /** Lav Dökümü (50%): 4 lava slimes climb out of the lava edge. */
    atesyurek_spawn_slimes: {
      resolve(c) {
        const a = c.arena;
        const pts = ringPoints(a.cx, a.cz, 13.5, 4, rnd(0, TAU));
        c.spawnAdds('lava_slime', 4, { positions: pts, tag: 'add' });
        for (const p of pts) bossFx('fire_burst', p.x, p.z, { scale: 1.1 });
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.5 });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Mavi Alev Ignaroth
// ---------------------------------------------------------------------------------------------------------------------
interface Walls { t: number; ang: number; next: number; speed: number }
interface Gates { t: number; waves: boolean[]; rows: number; rowT: number }

function endGates(c: BossController): void {
  c.state.gates = null;
  c.setImmune(false);
  c.e.playShot('Jump', 1.2, { fade: 0.05 });
  c.endMechanicPhase();
}

const ignaroth: BossScript = {
  init(c) {
    c.state.alt = false;
    c.state.fury = false;
    c.state.walls = null;
    c.state.gates = null;
  },
  update(c, dt) {
    const st = c.state;
    const e = c.e;
    // Alev Duvarları: two crossing 32 x 2 m bands rotating around the boss
    const w = st.walls as Walls | null;
    if (w) {
      w.t += dt;
      w.ang += rad(w.speed) * dt;
      w.next -= dt;
      if (w.next <= 0) {
        w.next = 1 / 3;
        const a = w.ang + rad(w.speed) * (1 / 3);
        band(c, e.position.x, e.position.z, a, 32, 2, 1 / 3, 1.0, { type: 'fire', name: 'Alev Duvarları' });
        band(c, e.position.x, e.position.z, a + Math.PI / 2, 32, 2, 1 / 3, 1.0, { type: 'fire', name: 'Alev Duvarları' });
      }
      if (w.t >= 8) st.walls = null;
    }
    // Dökümhane Kapıları: add waves + vent rows while he sits on the altar
    const g = st.gates as Gates | null;
    if (g) {
      g.t += dt;
      const spots = (n: number) => Array.from({ length: n }, () => c.randomPoint(5));
      if (!g.waves[0] && g.t >= 0) {
        g.waves[0] = true;
        c.spawnAdds('forge_imp', 4, { positions: spots(4), tag: 'gate' });
      }
      if (!g.waves[1] && g.t >= 10) {
        g.waves[1] = true;
        c.spawnAdds('forge_demon', 1, { positions: spots(1), tag: 'gate' });
        c.spawnAdds('forge_imp', 2, { positions: spots(2), tag: 'gate' });
      }
      if (!g.waves[2] && g.t >= 18) {
        g.waves[2] = true;
        c.spawnAdds('flame_skull', 4, { positions: spots(4), tag: 'gate' });
      }
      g.rowT -= dt;
      if (g.rowT <= 0) {
        g.rowT = 3;
        const z = [29.5, 32.5, 35.5][g.rows++ % 3];
        for (const x of [2, 5]) {
          const p = c.gdd(x, z);
          circle(c, p.x, p.z, 3, 1.5, 2.0, { type: 'fire', name: 'Zemin Menfezi', vfxOnLand: 'fire_burst' });
        }
      }
      const alive = c.adds('gate').filter((o) => !o.isDead && !o.removed).length;
      if (g.t >= 30 || (g.waves[2] && g.t > 20 && alive === 0)) endGates(c);
    }
  },
  onReset(c) {
    c.state.walls = null;
    c.state.gates = null;
  },
  abilities: {
    /** Pençe Kombosu: alternates Weapon / Punch swings. */
    ignaroth_combo: {
      start(c, b) {
        const e = c.e;
        c.state.alt = !c.state.alt;
        if (c.state.alt && e.anim?.has('Punch')) {
          e.playShot('Punch', b.speed, { fade: 0.03 });
          b.seq = e.anim.shotSeq;
          b.clip = 'Punch';
        }
      },
    },

    /** Mavi Alev Hücumu: charges at the FARTHEST player (30 x 4 m), blue fire trail for 8 s. */
    ignaroth_charge: {
      start(c, b) {
        const e = c.e;
        const ang = Math.atan2(b.dx, b.dz);
        const x = e.position.x, z = e.position.z;
        b.data.ang = ang;
        dashLine(c, x, z, ang, 30, 4, b.delay, 38, 3.5, { type: 'fire', knockback: 5, name: 'Mavi Alev Hücumu' });
        c.shape({
          shape: { type: 'line', length: 30, width: 3 }, x, z, dx: Math.sin(ang), dz: Math.cos(ang), delay: b.delay + 0.8, coef: 0.6, type: 'fire', telegraph: false,
          persist: { duration: 8, tick: 0.5 }, name: 'Mavi Alev İzi',
        });
        c.schedule(b.delay + 0.5, () => {
          for (let i = 0; i < 6; i++) bossFx('fire_ground', x + Math.sin(ang) * (2 + i * 5), z + Math.cos(ang) * (2 + i * 5), { dur: 8, scale: 1.2, color: 0x4080ff });
        }, 'fx');
      },
      resolve(c, b) {
        const ang = b.data.ang as number;
        c.dash(Math.sin(ang), Math.cos(ang), 30, 0.8);
        G.vfx.spawn('charge_trail', c.e.pointAt(0.3), { dir: [Math.sin(ang), 0, Math.cos(ang)], duration: 0.8 });
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.5 });
      },
    },

    /** Göktaşı: yellow soak circle r 5 (>= 8 m from the boss). Nobody inside = everyone takes coef 4 and he gains +20% damage. */
    ignaroth_meteor: {
      start(c) {
        const e = c.e;
        const p = c.randomPoint(5, { x: e.position.x, z: e.position.z, d: 8 });
        const n = Math.max(1, c.playersInArena().length);
        c.shape({
          shape: { type: 'circle', radius: 5 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: 5.0, damage: c.dmg(3 * n), type: 'fire', telegraph: true, kind: 'soak', soak: true,
          name: 'Göktaşı', vfxOnLand: 'fire_burst',
        });
        c.schedule(3.9, () => bossFx('meteor_fall', p.x, p.z, { scale: 1.8 }), 'fx');
        // the host checks the circle when the meteor lands: nobody inside = raid wipe damage + enrage
        c.schedule(5.0, () => {
          if (c.e.isDead || playersIn(c, p.x, p.z, 5).length > 0) return;
          const a = c.arena;
          c.shape({ shape: { type: 'circle', radius: a.r + 6 }, x: a.cx, z: a.cz, dx: 0, dz: 1, delay: 0.05, coef: 4, type: 'fire', telegraph: false, name: 'Göktaşı' });
          c.dmgMul *= 1.2;
          c.schedule(15, () => (c.dmgMul /= 1.2), 'enr');
          floatOver(c.e, '+%20 HASAR', 1);
        }, 'meteor');
        bossMsg('boss_toast', {}, { text: 'Göktaşı! Sarı çemberde toplanın!' });
      },
    },

    /** Alev Duvarları: 2 lines crossing at the boss, rotating 25 deg/s (35 in Mavi Öfke) for 8 s. */
    ignaroth_flame_walls: {
      resolve(c) {
        c.state.walls = { t: 0, ang: Math.random() * TAU, next: 0, speed: c.state.fury ? 35 : 25 } as Walls;
      },
    },

    /** Dökümhane Kapıları (65%): leaps onto the altar, immune, add waves + vent rows for 30 s. */
    ignaroth_gates: {
      start(c) {
        c.setImmune(true);
        c.freeze(true);
      },
      resolve(c) {
        const p = c.gdd(3.5, 35.5);
        c.teleport(p.x, p.z, false);
        G.vfx.spawn('leap_land', [p.x, 0.2, p.z], { scale: 1.6 });
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.4 });
        c.state.gates = { t: 0, waves: [false, false, false], rows: 0, rowT: 1.5 } as Gates;
        bossMsg('boss_toast', {}, { text: 'Dökümhane efendine hizmet ediyor! Zemin menfezlerine dikkat!' });
      },
      abort(c) {
        if (c.inReset) return;
        if (!c.state.gates) c.state.gates = { t: 0, waves: [false, false, false], rows: 0, rowT: 1.5 } as Gates;
      },
    },

    /** Mavi Öfke (30%): +20% attack speed, faster Göktaşı / Hücum, walls rotate at 35 deg/s. */
    ignaroth_fury: {
      resolve(c) {
        c.state.fury = true;
        c.atkMul *= 1.2;
        c.cdOverride.set('ignaroth_meteor', 20);
        c.cdOverride.set('ignaroth_charge', 12);
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
      },
    },
  },
};

export const DOKUMHANE_SCRIPTS: Record<string, BossScript> = {
  boss_dokumcu_gurz: gurz,
  boss_atesyurek: atesyurek,
  boss_ignaroth: ignaroth,
};

export const DOKUMHANE_SPAWNS: Record<string, string[]> = {
  boss_dokumcu_gurz: ['forge_goblin', 'forge_orc'],
  boss_atesyurek: ['lava_slime', 'lava_slimelet'],
  boss_ignaroth: ['forge_imp', 'forge_demon', 'flame_skull'],
};
