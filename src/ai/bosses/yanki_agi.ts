import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import type { BossHandler, BossScript } from './types';
import { angleTo, band, beam, circle, farthestPlayer, floatOver, every, partyHp, pickPlayers, ring, spawnMech, statusPlayer, wedge, zone } from './kit';
import { bossLeap, bossString } from './moveBridge';

/**
 * Yankı Ağı bosses (docs/dungeons/yanki_agi.md section 5): Doyumsuz Avanoksa, Gözetmen Anubzek, Hasatçı Kikatal.
 * Each boss has the WoW kit (reduced where the engine piece is missing) and the Elden Ring layer that the engine supports today:
 * a 3-hit string (bossString), a gap closer (bossLeap) and the posture bar (set in enemies_yanki_agi.ts).
 *
 * Coordinates: the design gives GDD tile coordinates; `W()` converts them to world metres ((c + 0.5) * 4), as the dungeon
 * file's `scene side` convention does.
 *
 * NOT built (engine pieces missing; see the report): fixate on the starved crawlers (YSP-04), the roaming swarms and the
 * Kara Kan lane pools as watch zones (YSP-05), the Eye of the Swarm safe circle (YSP-05 safeCircle), the Singularity pull
 * and root immunity (YSP-10), the `faded` and `kara_kan` statuses, the Alarm same-room pull (YSP-07), the Sürü Hastalığı swarm
 * spawn at expiry, the starved-crawler eating passive, and the Ağ Örücü passive spawns are approximations (see each handler).
 * OWNER: enemies module.
 */

const W = (v: number): number => (v + 0.5) * 4;
const TANK_CLASSES = new Set<string>(['knight', 'barbarian', 'paladin', 'monk', 'demonhunter']);
const isTankP = (p: Player): boolean => TANK_CLASSES.has(p.classId);

function tankOf(c: BossController): Player | null {
  const ps = c.playersInArena();
  return ps.find(isTankP) ?? c.nearestPlayer() ?? null;
}

// ---- Boss 1: Doyumsuz Avanoksa -------------------------------------------------------------------------------------------------

/** Egg anchors of the Avanoksa arena (GDD tile coordinates, section 5.1). */
const AV_EGGS: [number, number][] = [[35.5, 35], [35.8, 40], [45.5, 35], [45.5, 40.5], [37.5, 34], [43.5, 42.4]];

const avanoksaAbilities: Record<string, BossHandler> = {
  yk_av_string: {
    start(c) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.0, range: 5.0, arc: 120, windup: 0.7 },
        { coef: 1.0, range: 5.0, arc: 120, windup: 0.45, gap: 0.25 },
        { coef: 2.0, range: 7.0, arc: 90, windup: 1.0, gap: 0.25, parryable: false },
      ], { target: t, hold: [0.5, 0.6], cancelOnBreak: true, name: 'Üçlü Pençe Zinciri' });
    },
  },
  yk_av_bite: {
    start(c) {
      const e = c.e;
      const t = tankOf(c);
      if (!t) return;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      for (const d of [1.0, 1.9, 2.8]) {
        wedge(c, e.position.x, e.position.z, ang, 5.5, 100, d, 1.6, { name: 'Oburca Isırık', type: 'physical' });
      }
      c.schedule(2.8, () => statusPlayer(t, 'exposed', 10, { magnitude: 0.5 }), 'av_exposed');
    },
  },
  yk_av_leap: {
    start(c) {
      const p = pickPlayers(c, 1, true)[0];
      if (!p) return;
      bossLeap(c, { target: p, airtime: 1.4, radius: 6.0, coef: 2.6, name: 'Sıçrayan Ezme' });
      c.schedule(1.4, () => c.vulnerable(1.15, 1.5), 'av_winded');
    },
  },
  yk_av_shrill: {
    start(c) {
      const e = c.e;
      zone(c, e.position.x, e.position.z, c.arena.r + 8, 3.0, 0.5, 0.45, 3.0, { name: 'Uyarı Çığlığı', type: 'poison' });
      const n = Math.max(3, c.partySize() + 1);
      c.schedule(3.0, () => {
        const pool = [...AV_EGGS].sort(() => Math.random() - 0.5).slice(0, n);
        c.spawnAdds('yk_starved_crawler', n, {
          positions: pool.map(([x, z]) => ({ x: W(x), z: W(z) })), tag: 'crawler', hpMult: 0.6 * partyHp(c), aggro: true,
        });
      }, 'av_shrill_adds');
    },
  },
  yk_av_onslaught: {
    start(c) {
      for (let i = 0; i < 5; i++) {
        c.schedule(i * 1.0, () => {
          const puddles: { x: number; z: number }[] = (c.state.puddles ??= []);
          for (const p of c.playersInArena()) {
            const px = p.position.x, pz = p.position.z;
            if (puddles.some((q) => Math.hypot(q.x - px, q.z - pz) < 1.4)) continue;
            const mine = { x: px, z: pz };
            puddles.push(mine);
            // the puddle lasts 25 s; forget it then so the dedupe only sees live puddles
            c.schedule(25, () => { const k = puddles.indexOf(mine); if (k >= 0) puddles.splice(k, 1); }, 'av_puddle_gone');
            zone(c, px, pz, 2.4, 25, 1.0, 0.55, 0.05, { name: 'Ağ Birikintisi', type: 'poison' });
          }
        }, 'av_onslaught');
      }
    },
  },
  yk_av_infest: {
    start(c) {
      const targets = pickPlayers(c, 2, true);
      for (const p of targets) {
        statusPlayer(p, 'poison', 8, { magnitude: 0.35 });
        floatOver(p, 'HASTALIK');
      }
      // TODO(YSP-05): a swarm that roams 45 s spawns at the player at 8 s if the poison is still on (not built).
    },
  },
};

const avanoksa: BossScript = {
  abilities: avanoksaAbilities,
  onPhase(c, _ph, index) {
    if (index === 1) {
      c.cdOverride.set('yk_av_shrill', 30);
      c.cdOverride.set('yk_av_onslaught', 38);
      c.cdOverride.set('yk_av_leap', 18);
      c.cdOverride.set('yk_av_string', 2.6);
    }
  },
};

// ---- Boss 2: Gözetmen Anubzek ----------------------------------------------------------------------------------------------------

const anubzekAbilities: Record<string, BossHandler> = {
  yk_an_string: {
    start(c) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.0, range: 6.0, arc: 60, windup: 0.7 },
        { coef: 1.2, range: 4.5, arc: 150, windup: 0.5, gap: 0.25 },
        { coef: 2.4, range: 4.0, arc: 90, windup: 1.0, gap: 0.25, parryable: false },
      ], { target: t, hold: [0.5, 0.6], cancelOnBreak: true, name: 'Mızrak Zinciri' });
    },
  },
  yk_an_impale: {
    start(c) {
      const e = c.e;
      const t = tankOf(c);
      if (!t) return;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      beam(c, e.position.x, e.position.z, ang, 14, 3, 1.2, 4.0, { name: 'Mızraklama', statuses: [{ status: 'bleed', duration: 10, stacks: 3, magnitude: 0.2 }] });
    },
  },
  yk_an_burrow: {
    start(c) {
      const targets = pickPlayers(c, 2, true);
      targets.forEach((t, i) => {
        circle(c, t.position.x, t.position.z, 11, 1.0 + i * 0.8, 2.4, { name: 'Yer Altı Hücumu', knockback: 4 });
      });
      const t0 = targets[0];
      if (t0) c.schedule(2.0, () => c.teleport(t0.position.x, t0.position.z), 'an_emerge');
    },
  },
  yk_an_echo: {
    start(c) {
      const e = c.e;
      ring(c, e.position.x, e.position.z, 2, 8, 0.5, 2.0, { name: 'Yankı Basışı' });
      ring(c, e.position.x, e.position.z, 8, 16, 1.4, 2.0, { name: 'Yankı Basışı' });
    },
  },
  yk_an_infest: {
    start(c) {
      const n = c.partySize() < 4 ? 2 : 3;
      for (const p of pickPlayers(c, n, true)) {
        statusPlayer(p, 'poison', 10, { magnitude: 0.3 });
        floatOver(p, 'SÜRÜ');
      }
      // TODO(YSP-05): the roaming swarm at expiry is not built.
    },
  },
  yk_an_webmages: {
    start(c) {
      const alive = c.adds('wm').filter((a) => !a.isDead).length;
      const n = Math.min(2, Math.max(0, 4 - alive));
      if (n <= 0) return;
      const spots: [number, number][] = [[23.3, 6.3], [30.7, 6.3], [23.3, 13.7], [30.7, 13.7]];
      const picked = [...spots].sort(() => Math.random() - 0.5).slice(0, n);
      c.spawnAdds('yk_webmage_add', n, { positions: picked.map(([x, z]) => ({ x: W(x), z: W(z) })), tag: 'wm', hpMult: 1.2 * partyHp(c), aggro: true });
    },
  },
};

const anubzek: BossScript = {
  abilities: anubzekAbilities,
  onPhase(c, _ph, index) {
    if (index === 1) {
      c.cdOverride.set('yk_an_burrow', 24);
      c.cdOverride.set('yk_an_infest', 32);
      c.cdOverride.set('yk_an_echo', 20);
      c.cdOverride.set('yk_an_string', 2.4);
    }
  },
};

// ---- Boss 3: Hasatçı Kikatal ----------------------------------------------------------------------------------------------------

/** Spider spots and runner lanes (GDD tile coordinates, section 5.3). */
const KK_SPINNER_SPOTS: [number, number][] = [[49, 29], [61, 29], [55, 22.5]];
const KK_RUNNER_LANES: [number, number][] = [[48.5, 25], [61.5, 26.5], [48.5, 32.5]];

const kikatalAbilities: Record<string, BossHandler> = {
  yk_kk_string: {
    start(c) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.2, range: 6.0, arc: 180, windup: 0.75 },
        { coef: 1.2, range: 6.0, arc: 180, windup: 0.45, gap: 0.25 },
        { coef: 2.2, range: 12.0, arc: 30, windup: 1.0, gap: 0.25, parryable: false },
      ], { target: t, hold: [0.5, 0.6], cancelOnBreak: true, name: 'Hasat Zinciri' });
    },
  },
  yk_kk_hook: {
    start(c) {
      const e = c.e;
      const t = tankOf(c);
      if (!t) return;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      beam(c, e.position.x, e.position.z, ang, 10, 2.6, 1.3, 3.5, { name: 'Kan Kancası' });
      // TODO: the kara_kan stacks (2) need a status id that does not exist yet.
    },
  },
  yk_kk_tide: {
    start(c) {
      const e = c.e;
      const far = farthestPlayer(c, e.position.x, e.position.z);
      const ang = far ? angleTo(e.position.x, e.position.z, far.position.x, far.position.z) : e.yaw;
      band(c, e.position.x, e.position.z, ang, 36, 3.5, 1.2, 2.4, { name: 'Kan Gelgiti', type: 'shadow' });
    },
  },
  yk_kk_haul: {
    start(c) {
      const pos = KK_RUNNER_LANES.map(([x, z]) => ({ x: W(x), z: W(z) }));
      c.spawnAdds('yk_bloodworker_run', 3, { positions: pos, tag: 'runner', aggro: false });
    },
  },
  yk_kk_singularity: {
    start(c) {
      const e = c.e;
      circle(c, e.position.x, e.position.z, 10, 3.0, 3.0, { type: 'shadow', knockback: 8, name: 'Kozmik Teklik' });
      // TODO(YSP-10): the 2.8 s pull and the root immunity are not built. A poise break cancels the cast (engine rule).
    },
  },
  yk_kk_poisons: {
    start(c) {
      const targets = pickPlayers(c, 3, false);
      for (const p of targets) {
        statusPlayer(p, 'poison', 8, { magnitude: 0.3 });
        floatOver(p, 'ZEHİR');
        const axis = Math.random() < 0.5 ? 0 : Math.PI / 2;
        c.schedule(8.0, () => band(c, p.position.x, p.position.z, axis, 44, 3, 0.9, 2.2, { name: 'Zehir Patlaması', type: 'poison' }), 'kk_erupt_a');
        c.schedule(9.1, () => band(c, p.position.x, p.position.z, axis, 44, 3, 0.9, 2.2, { name: 'Zehir Patlaması', type: 'poison' }), 'kk_erupt_b');
      }
    },
  },
  yk_kk_webs: {
    start(c) {
      for (const p of pickPlayers(c, 3, false)) {
        circle(c, p.position.x, p.position.z, 3.2, 1.8, 1.8, { name: 'Patlayan Ağlar', statuses: [{ status: 'stun', duration: 2 }], vfxOnLand: 'web_burst' });
      }
    },
  },
};

const kikatal: BossScript = {
  abilities: kikatalAbilities,
  onPhase(c, _ph, index) {
    if (index === 1) {
      c.cdOverride.set('yk_kk_haul', 15);
      c.cdOverride.set('yk_kk_singularity', 40);
      c.cdOverride.set('yk_kk_tide', 20);
      c.cdOverride.set('yk_kk_string', 3.0);
    }
  },
  update(c, dt) {
    // Ağ Örücü passive: one spinner every 15 s, at most 3 alive, at a spinner spot.
    every(c.state, 'sp', dt, 15, () => {
      if (c.adds('spinner').filter((a) => !a.isDead).length >= 3) return;
      const [x, z] = KK_SPINNER_SPOTS[Math.floor(Math.random() * KK_SPINNER_SPOTS.length)];
      c.spawnAdds('yk_web_spinner', 1, { positions: [{ x: W(x), z: W(z) }], tag: 'spinner', hpMult: 0.9 * partyHp(c), aggro: true });
    });
    // A bloodworker that is hit drops a Black Blood pool where it stands (the runner keeps running).
    const dropped: Set<unknown> = (c.state.poolDropped ??= new Set());
    for (const r of c.adds('runner')) {
      if (dropped.has(r) || r.isDead || r.hp >= r.maxHp) continue;
      dropped.add(r);
      spawnMech(c, 'yk_blood_pool', { x: r.position.x, z: r.position.z }, { hpMult: 0.5 * partyHp(c), tag: 'bp' });
    }
  },
};

// ---- registry --------------------------------------------------------------------------------------------------------------

export const YANKI_SCRIPTS: Record<string, BossScript> = {
  boss_avanoksa: avanoksa,
  boss_anubzek: anubzek,
  boss_kikatal: kikatal,
};

/** Extra enemy ids each boss spawns (asset preloading). */
export const YANKI_SPAWNS: Record<string, string[]> = {
  boss_avanoksa: ['yk_starved_crawler', 'yk_ceaseless_swarm'],
  boss_anubzek: ['yk_webmage_add', 'yk_ceaseless_swarm'],
  boss_kikatal: ['yk_bloodworker_run', 'yk_blood_pool', 'yk_web_spinner'],
};
