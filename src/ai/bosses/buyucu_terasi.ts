import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import type { BossController } from '../BossController';
import type { Busy } from '../EnemyAI';
import type { BossHandler, BossScript } from './types';
import { angleTo, beam, circle, dashLine, isTank, pickPlayers, playersIn, rad, ring, statusPlayer, wedge, zone } from './kit';
import { bossLeap, bossString } from './moveBridge';
import { linkHealth, tether, type HealthGroup } from './links';

/**
 * Büyücüler Terası bosses (docs/dungeons/buyucu_terasi.md section 5): Bekçi Arkanotron (energy refuel and orb volleys), Seranel
 * Güneşkamçı (suppression dome, runic marks, raid wave), Gemellus (shared-HP clones, tether, echo lash), Degentrius (void torrent
 * sweep, soak slots, fragment tank buster on the stationary boss). Elden-style strings and leaps use moveBridge.ts.
 * Deviations (engine pieces missing today, see the report): no runic_mark / umbral_splinter / devouring_entropy / neural_link
 * statuses (scripts track the marks and timers themselves, no status icon), no crystal_power, no consuming void DoT, no posture
 * strip list (onBreak only grants a damage window), no enrage2 roar, no boss pull or grab drag (grabs are a root plus a delayed
 * slam), the torrent is a 14-step sweep of two static beams instead of one spinning shape, and orbs move by a direct script step.
 * OWNER: enemies module.
 */

type Pt = { x: number; z: number };

/** GDD tile centre to world metres (same mapping as DungeonScene, world = (tile + 0.5) * 4). */
const W = (t: number): number => (t + 0.5) * 4;
/** Seranel dome centre and radius (world metres): tile (56.5, 24.5), 2 tiles. */
const DOME: Pt & { r: number } = { x: W(56.5), z: W(24.5), r: 8 };
/** Degentrius hub centre (world): the dais, and the hub radius where beams start. */
const HUB_R = 5;
/** Arkanotron wall ports (world metres): the orb spawn points, skipping door gaps (design ORB_PORTS). */
const ORB_PORTS: Pt[] = [[30, 7], [35.5, 7], [41, 7], [26, 11], [26, 18], [45, 10.5], [45, 19], [29, 22], [42, 22]].map(([x, z]) => ({ x: W(x), z: W(z) }));
/** Degentrius soak slots (world): N, E, S, W at 3.2 tiles from the dais, radius 3 m. */
const SOAK: Pt[] = [{ x: W(40.5), z: W(63.3) }, { x: W(43.7), z: W(66.5) }, { x: W(40.5), z: W(69.7) }, { x: W(37.3), z: W(66.5) }];

const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.z - a.z);
const tankOf = (c: BossController): Player | null => c.playersInArena().find((p) => isTank(p)) ?? c.nearestPlayer() ?? null;
const nonTankOf = (c: BossController): Player | null => pickPlayers(c, 1, true)[0] ?? tankOf(c);
const aliveIds = (c: BossController): number => c.playersInArena().length;

// =====================================================================================================================
// Boss 1: Bekçi Arkanotron (energy refuel, seeker orbs, Eterik Prangalar)
// =====================================================================================================================

interface Orb { e: Enemy; t: number }

const arkanotronAbilities: Record<string, BossHandler> = {
  arkanotron_slam: {
    start(c, b: Busy) {
      const t = tankOf(c);
      if (!t) return;
      const e = c.e;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      wedge(c, e.position.x, e.position.z, ang, 8, 70, 1.2 + 0.45, 4.5, { knockback: 14, name: 'İtici Darbe' });
      b.total = b.delay + 0.2;
    },
  },
  arkanotron_spin: {
    start(c) {
      const e = c.e;
      const t = tankOf(c);
      const ang = t ? angleTo(e.position.x, e.position.z, t.position.x, t.position.z) : 0;
      wedge(c, e.position.x, e.position.z, ang, 5, 180, 1.0, 1.2, { name: 'Dönen Çevirim' });
      c.schedule(1.4, () => wedge(c, e.position.x, e.position.z, ang + Math.PI, 5, 180, 0.45, 1.2, { name: 'Dönen Çevirim' }), 'arkanotron_spin');
      c.schedule(1.9, () => ring(c, e.position.x, e.position.z, 0, 6.5, 0.54 + 0.45, 2.0, { name: 'Dönen Çevirim', knockback: 6 }), 'arkanotron_spin');
    },
  },
  arkanotron_judgment: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      statusPlayer(t, 'root', 1.1);
      circle(c, t.position.x, t.position.z, 2.2, 1.2 + 1.1, 2.4, { knockback: 5, name: 'Hüküm Yakalaması' });
    },
  },
  arkanotron_lunge: {
    start(c, b: Busy) {
      const t = nonTankOf(c);
      if (!t) return;
      bossLeap(c, { target: t, airtime: 0.55, radius: 3.4, coef: 2.4, name: 'Sıçrayıp Ez', max: 14 });
      b.total = b.delay + 0.6;
    },
  },
  arkanotron_expulsion: {
    start(c) {
      const e = c.e;
      circle(c, e.position.x, e.position.z, 12, 2.0, 2.2, { knockback: 9, name: 'Arkan Püskürtme' });
      zone(c, e.position.x, e.position.z, 4.5, 90, 1.0, 0.12, 2.1, { statuses: [{ status: 'slow', duration: 1, magnitude: 0.35 }], name: 'Arkan Kalıntı' });
    },
  },
  arkanotron_shackles: {
    resolve(c) {
      const picks = pickPlayers(c, Math.min(3, Math.max(2, aliveIds(c) - 1)), true);
      for (const p of picks) {
        statusPlayer(p, 'root', 15);
        circle(c, p.position.x, p.position.z, 1.4, 0.1, 0.35, { name: 'Eterik Prangalar' });
      }
    },
  },
  /** Energy empty: the boss freezes for 20 s, takes +20 % damage and launches three orb volleys at 0, 4 and 8 s. */
  arkanotron_refuel: {
    start(c, b: Busy) {
      b.total = 20.5;
      c.freeze(true);
      c.energy?.pause(true);
      c.vulnerable(1.2, 20);
      c.state.orbs = [];
      for (const at of [0, 4, 8]) c.schedule(at, () => orbVolley(c), 'arkanotron_refuel');
      c.schedule(20, () => refuelEnd(c), 'arkanotron_refuel');
    },
    abort(c) {
      refuelEnd(c);
    },
  },
};

function orbVolley(c: BossController): void {
  const n = aliveIds(c) + 1;
  const order = ORB_PORTS.map((p, i) => ({ p, i })).sort(() => Math.random() - 0.5);
  for (let k = 0; k < n; k++) {
    const port = order[k % order.length].p;
    c.spawnAdds('proc_energy_orb', 1, { positions: [port], aggro: false, tag: 'orb' });
  }
}

function refuelEnd(c: BossController): void {
  c.freeze(false);
  c.energy?.pause(false);
  c.energy?.set(100);
  for (const o of (c.state.orbs as Orb[] | undefined) ?? []) if (!o.e.isDead) o.e.escape();
  c.state.orbs = [];
}

/** Orb movement and resolution, host side. Orbs are invulnerable and resolve only by touch or arrival. */
function updateOrbs(c: BossController, dt: number): void {
  const known = ((c.state.orbs as Orb[] | undefined) ?? []).filter((o) => !o.e.removed && !o.e.isDead);
  const live = new Set(known.map((o) => o.e.id));
  for (const e of c.adds('orb')) if (!live.has(e.id) && !e.isDead) known.push({ e, t: c.now });
  c.state.orbs = known;
  const speed = c.phase?.id === 'p2' ? 5.0 : 4.5;
  const boss = c.e.position;
  for (const o of known.filter((x) => !x.e.isDead)) {
    const pos = o.e.position;
    const dx = boss.x - pos.x, dz = boss.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 2.0) {
      circle(c, boss.x, boss.z, 2.2, 0.05, 2.2, { name: 'Enerji Küresi Sızıntısı' });
      c.dmgMul = 1.2;
      c.schedule(40, () => { c.dmgMul = 1; }, 'orb_leak');
      o.e.escape();
      continue;
    }
    const step = Math.min(d, speed * dt);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    const toucher = c.playersInArena().find((p) => dist({ x: p.position.x, z: p.position.z }, { x: pos.x, z: pos.z }) < 1.3);
    if (toucher) {
      circle(c, pos.x, pos.z, 1.3, 0.05, 0.6, { name: 'Enerji Küresi', type: 'arcane' });
      o.e.escape();
    }
  }
}

const arkanotron: BossScript = {
  abilities: arkanotronAbilities,
  update(c, dt) {
    if (c.state.orbs) updateOrbs(c, dt);
  },
  /** Energy hook names (BossDef.energy onEmpty): dispatched by BossController.hook. */
  refuelFromEmpty(c: BossController) {
    // the edge fires once: a busy boss must queue the cast, or the refuel is lost for the rest of the fight
    if (!c.castNow('arkanotron_refuel')) c.forceAbility('arkanotron_refuel');
  },
  onBreak(c) {
    c.vulnerable(1.25, 4);
  },
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
} as BossScript;

// =====================================================================================================================
// Boss 2: Seranel Güneşkamçı (suppression dome, runic marks, raid silence wave)
// =====================================================================================================================

interface SeranelState { marks: Map<number, number> }

const seranelAbilities: Record<string, BossHandler> = {
  seranel_flurry: {
    start(c, b: Busy) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.0, range: 3.8, arc: 110, windup: 0.7 },
        { coef: 1.0, range: 3.8, arc: 110, gap: 0.25 },
        { coef: 2.2, range: 4.5, arc: 110, gap: 0.25, knockback: 4 },
      ], { target: t, hold: [0.2, 0.5], name: 'Rün Fırtınası' });
      b.total = b.delay + 1.6;
    },
  },
  seranel_dash: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      const e = c.e;
      dashLine(c, e.position.x, e.position.z, angleTo(e.position.x, e.position.z, t.position.x, t.position.z), 12, 2.2, 1.0, 18, 1.8,
        { name: 'Atılış' });
    },
  },
  seranel_leap: {
    start(c, b: Busy) {
      const t = nonTankOf(c);
      if (!t) return;
      bossLeap(c, { target: t, airtime: 0.55, radius: 3.0, coef: 2.6, name: 'Sıçrayan Mızrak', min: 0, max: 14 });
      b.total = b.delay + 0.6;
    },
  },
  /** Runic glaive: two marked players (three in phase 2); a mark detonates after 25 s unless the marked player walks into the dome. */
  seranel_glaive: {
    start(c) {
      const st = seranelState(c);
      const picks = pickPlayers(c, c.phase?.id === 'p2' ? 3 : 2, true);
      for (const p of picks) {
        st.marks.set(p.id, c.now + 25);
        c.schedule(25, () => {
          if (!st.marks.has(p.id)) return;
          st.marks.delete(p.id);
          circle(c, p.position.x, p.position.z, 4, 3.0, 4.0, { name: 'Rün İşareti' });
        }, 'seranel_mark');
      }
    },
  },
  seranel_wave: {
    start(c, b: Busy) {
      b.total = b.delay + 0.5;
      // the bar starts again from empty (about every 38 s, docs/dungeons/buyucu_terasi.md section 5)
      c.energy?.set(0);
      circle(c, c.e.position.x, c.e.position.z, c.arena.r, 3.0, 3.0, { name: 'Sessizlik Dalgası' });
      c.schedule(3.0, () => {
        for (const p of c.playersInArena()) if (dist({ x: p.position.x, z: p.position.z }, DOME) > DOME.r) statusPlayer(p, 'silence', 8);
      }, 'seranel_wave');
    },
  },
  seranel_hastening: {
    start(c) {
      c.e.statuses.apply('empower', 15, { replicated: true });
    },
  },
};

function seranelState(c: BossController): SeranelState {
  if (!c.state.seranel) c.state.seranel = { marks: new Map<number, number>() } as SeranelState;
  return c.state.seranel as SeranelState;
}

const seranel: BossScript = {
  abilities: seranelAbilities,
  init(c) {
    seranelState(c);
    zone(c, DOME.x, DOME.z, DOME.r, 9999, 0.5, 0, 0.05, { statuses: [{ status: 'silence', duration: 1 }], name: 'Bastırma Kubbesi' });
  },
  update(c) {
    const st = seranelState(c);
    for (const p of c.playersInArena()) {
      if (!st.marks.has(p.id)) continue;
      if (dist({ x: p.position.x, z: p.position.z }, DOME) <= DOME.r) {
        st.marks.delete(p.id);
        circle(c, DOME.x, DOME.z, 26, 0.1, 1.3, { statuses: [{ status: 'slow', duration: 3, magnitude: 0.25 }], name: 'Boş Tepki' });
      }
    }
  },
  /** Energy full hook name (BossDef.energy onFull): dispatched by BossController.hook. */
  waveFromFull(c: BossController) {
    // the edge fires once: a busy boss must queue the wave, or it is lost for the rest of the fight
    if (!c.castNow('seranel_wave')) c.forceAbility('seranel_wave');
  },
  onBreak(c) {
    c.e.statuses.remove('empower');
    c.vulnerable(1.25, 4);
  },
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
} as BossScript;

// =====================================================================================================================
// Boss 3: Gemellus (three bodies, one shared HP pool, tether, echo lash)
// =====================================================================================================================

interface GemState { group: HealthGroup | null }

function gemState(c: BossController): GemState {
  if (!c.state.gem) c.state.gem = { group: null } as GemState;
  return c.state.gem as GemState;
}

/** Spawns two clones at the arena edges and links the bodies into one HP pool after they appear. */
function triplicate(c: BossController): void {
  const cx = c.arena.cx, cz = c.arena.cz;
  c.setImmune(true);
  c.schedule(2.5, () => c.setImmune(false), 'gemellus_triplicate');
  c.spawnAdds('gemellus_clone', 2, { positions: [{ x: cx - 9, z: cz }, { x: cx + 9, z: cz }], aggro: true, tag: 'clone' });
  c.schedule(0.3, () => {
    const st = gemState(c);
    const bodies = [c.e, ...c.adds('clone')];
    st.group = linkHealth(c, bodies);
  }, 'gemellus_link');
}

const gemAbilities: Record<string, BossHandler> = {
  gemellus_triplicate: {
    start(c, b: Busy) {
      b.total = b.delay + 2.5;
      triplicate(c);
    },
  },
  gemellus_lash: {
    start(c, b: Busy) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.0, range: 6, arc: 90, windup: 0.7 },
        { coef: 1.0, range: 6, arc: 90, gap: 0.25 },
        { coef: 1.8, range: 10, arc: 40, gap: 0.25 },
      ], { target: t, hold: [0.2, 0.5], name: 'Üçlü Kamçı' });
      b.total = b.delay + 1.8;
      // each living clone repeats the lash from its own position
      c.schedule(1.2, () => {
        for (const k of c.adds('clone')) {
          if (k.isDead) continue;
          const tp = tankOf(c);
          const ang = tp ? angleTo(k.position.x, k.position.z, tp.position.x, tp.position.z) : 0;
          wedge(c, k.position.x, k.position.z, ang, 6, 90, 1.0, 0.6, { name: 'Yankı Kamçısı' });
        }
      }, 'gemellus_echo');
    },
  },
  gemellus_dive: {
    start(c, b: Busy) {
      const t = nonTankOf(c);
      if (!t) return;
      bossLeap(c, { target: t, airtime: 0.6, radius: 3.2, coef: 2.8, name: 'Boşluğa Dalış' });
      b.total = b.delay + 0.7;
    },
  },
  /** Sinirsel Bağ: a random player is tethered to one clone for 12 s; expiry hits the player, a break is free. */
  gemellus_link: {
    resolve(c) {
      const p = pickPlayers(c, 1, true)[0];
      const clone = c.adds('clone').find((k) => !k.isDead);
      if (!p || !clone) return;
      tether(c, p, clone, {
        dur: 12, touchR: 12,
        onExpire: () => circle(c, p.position.x, p.position.z, 1.5, 1.2, 3.5, { name: 'Sinirsel Patlama' }),
      });
    },
  },
  gemellus_grasp: {
    start(c) {
      const p = pickPlayers(c, 1, true)[0];
      if (!p) return;
      zone(c, p.position.x, p.position.z, 3, 8, 1.0, 0.5, 0.05, { follow: true, sourceId: p.id, name: 'Kozmik Radyasyon' });
    },
  },
  gemellus_sting: {
    start(c) {
      const p = nonTankOf(c);
      if (!p) return;
      const x = p.position.x, z = p.position.z;
      circle(c, x, z, 1.2, 1.4, 3.2, { follow: true, sourceId: p.id, name: 'Kozmik İğne' });
      c.schedule(1.4, () => zone(c, x, z, 3, 6, 1.0, 0.5, 0.05, { name: 'Boşluk Salgısı' }), 'gemellus_sting');
    },
  },
};

const gemellus: BossScript = {
  // the triplicate ability runs at the pull and at 50 % through the phase onEnter tables (enemies_buyucu_terasi.ts)
  abilities: gemAbilities,
  onBreak(c) {
    c.vulnerable(1.25, 4);
  },
  onReset(c) {
    gemState(c).group = null;
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
} as BossScript;

// =====================================================================================================================
// Boss 4: Degentrius (stationary; fragment, entropy, void torrent sweep, soak slots, null bomb)
// =====================================================================================================================

const degAbilities: Record<string, BossHandler> = {
  degentrius_fragment: {
    start(c, b: Busy) {
      const t = tankOf(c);
      if (!t) return;
      const hold = 0.4;
      circle(c, t.position.x, t.position.z, 8, 1.2 + hold, 1.0, { knockback: 9, name: 'Dev Parça' });
      circle(c, t.position.x, t.position.z, 2, 1.2 + hold, 3.2, { name: 'Dev Parça (tank)' });
      b.total = b.delay + hold;
    },
  },
  degentrius_reach: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      statusPlayer(t, 'root', 1.5);
      circle(c, c.e.position.x, c.e.position.z, 2.4, 1.5, 2.6, { knockback: 4, name: 'Boşluk Eli' });
    },
  },
  degentrius_waves: {
    start(c) {
      const e = c.e;
      ring(c, e.position.x, e.position.z, 5, 8, 1.0, 1.6, { name: 'Üç Dalga' });
      ring(c, e.position.x, e.position.z, 11, 14, 1.4, 1.6, { name: 'Üç Dalga' });
      ring(c, e.position.x, e.position.z, 17, 20, 1.9, 1.6, { name: 'Üç Dalga' });
    },
  },
  /** Yutan Entropi: three players; each one's four entropy lines fire when their timer runs out (6 / 9 / 12 s). */
  degentrius_entropy: {
    start(c) {
      const picks = pickPlayers(c, Math.min(3, aliveIds(c)), false);
      picks.forEach((p, i) => {
        c.schedule(6 + 3 * i, () => {
          const x = p.position.x, z = p.position.z;
          for (let k = 0; k < 4; k++) beam(c, x, z, (k * Math.PI) / 2, 24, 1.6, 1.0, 1.4, { statuses: [{ status: 'slow', duration: 5, magnitude: 0.7 }], name: 'Yutan Entropi' });
        }, 'degentrius_entropy');
      });
    },
  },
  /** Boşluk Seli: two opposite beams start 5 m from the dais and sweep 14 degrees per step (14 steps). */
  degentrius_torrent: {
    start(c) {
      const cx = c.arena.cx, cz = c.arena.cz;
      const base = Math.random() * Math.PI * 2;
      for (let k = 0; k < 14; k++) {
        const at = 2.5 + k * 1.0;
        const ang = base + rad(14 * k);
        for (const side of [0, Math.PI]) {
          const a = ang + side;
          const sx = cx + HUB_R * Math.sin(a), sz = cz + HUB_R * Math.cos(a);
          beam(c, sx, sz, a, 17, 3.2, at, 2.0, { statuses: [{ status: 'stun', duration: 3 }], name: 'Boşluk Seli' });
        }
      }
    },
  },
  /** Kararsız Boşluk Özü: four soak slots, 1.2 s telegraph; an empty slot at impact is a raid hit. */
  degentrius_essence: {
    start(c) {
      const times = [3.5, 5.5, 7.5, 9.5];
      times.forEach((t, i) => {
        const slot = SOAK[i];
        c.schedule(t - 1.2, () => circle(c, slot.x, slot.z, 3, 1.2, 1.8, { name: 'Kararsız Boşluk Özü' }), 'degentrius_essence');
        c.schedule(t, () => {
          if (playersIn(c, slot.x, slot.z, 3).length === 0) {
            circle(c, c.arena.cx, c.arena.cz, 21, 0.05, 2.5, { name: 'Boşluk Yıkımı' });
          }
        }, 'degentrius_essence');
      });
    },
  },
  degentrius_nullbomb: {
    start(c) {
      const t = tankOf(c);
      if (!t) return;
      circle(c, t.position.x, t.position.z, 3, 5.0, 3.5, { follow: true, sourceId: t.id, name: 'Boşluk Bombası' });
    },
  },
};

const degentrius: BossScript = {
  abilities: degAbilities,
  onBreak(c) {
    c.vulnerable(1.25, 4);
  },
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
} as BossScript;

/** Boss id -> script (registered in ai/bosses/index.ts; see the report). */
export const BUYUCU_SCRIPTS: Record<string, BossScript> = {
  boss_arkanotron: arkanotron,
  boss_seranel: seranel,
  boss_gemellus: gemellus,
  boss_degentrius: degentrius,
};

/** Extra enemy ids each boss spawns (asset preloading). */
export const BUYUCU_SPAWNS: Record<string, string[]> = {
  boss_arkanotron: ['proc_energy_orb'],
  boss_seranel: [],
  boss_gemellus: ['gemellus_clone'],
  boss_degentrius: [],
};
