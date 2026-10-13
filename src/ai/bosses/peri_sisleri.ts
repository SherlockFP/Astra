import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import type { Enemy } from '../../entities/Enemy';
import type { BossController } from '../BossController';
import type { Busy } from '../EnemyAI';
import { bossFx } from '../bossNet';
import type { BossHandler, BossScript } from './types';
import { angleTo, beam, circle, dashLine, makeInvulnerable, partyHp, rad, ringPoints, rnd, statusPlayer, zone } from './kit';
import { bossLeap, bossString } from './moveBridge';
import { bossShield, linkPlayers, shieldUp } from './links';

/**
 * Peri Sisleri bosses (docs/dungeons/peri_sisleri.md section 5): Ingra Malok with Droman Ulfaran, Sis Çağıran (Guessing Game),
 * Tred'ova (Consumption, Mind Link, rush). Elden-style strings, leaps and posture breaks use moveBridge.ts.
 * Deviations (engine pieces missing today): no fixate on larvae or Vulpins, no pull on Zehir Birikimi, no spire wall stun on
 * Kovuk Hücumu, no Death Shroud status (poison DoT instead), no frenzy damage boost, no sigil floor paint, no feast heal.
 * OWNER: enemies module.
 */

type Pt = { x: number; z: number };
const SIGIL_TRAITS = { shape: ['F', 'L'], fill: ['D', 'B'], ring: ['H', 'N'] } as const;
const TANK_CLASSES = new Set<string>(['knight', 'barbarian', 'paladin', 'monk', 'demonhunter']);

const isTankP = (p: Player): boolean => TANK_CLASSES.has(p.classId);
const keyLevel = (): number => G.mplus?.params?.keyLevel ?? 10;

function tankOf(c: BossController): Player | null {
  const ps = c.playersInArena();
  return ps.find(isTankP) ?? c.nearestPlayer() ?? null;
}

function nonTankOf(c: BossController): Player | null {
  const all = c.playersInArena();
  const pool = all.filter((p) => !isTankP(p));
  const list = pool.length ? pool : all;
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

/** Players in the rear 120 degrees (dot < -0.5) within 8 m of the boss. */
function playerBehind(c: BossController): boolean {
  const e = c.e;
  const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
  return c.playersInArena().some((p) => {
    const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
    const d = Math.hypot(dx, dz);
    return d > 0.01 && d <= 8 && (dx * fx + dz * fz) / d < -0.5;
  });
}

/** Sigil plan of the Guessing Game: three identical clones and one odd one (keys 4 and below: all three traits differ). */
export interface SigilPlan { codes: string[]; odd: number; common: string }
export function rollSigils(key: number): SigilPlan {
  const bit = (): number => (Math.random() < 0.5 ? 0 : 1);
  const t = [bit(), bit(), bit()];
  const flipAll = key <= 4;
  const flipOne = Math.floor(Math.random() * 3);
  const code = (v: number[]): string => SIGIL_TRAITS.shape[v[0]] + SIGIL_TRAITS.fill[v[1]] + SIGIL_TRAITS.ring[v[2]];
  const odd = Math.floor(Math.random() * 4);
  const flipped = t.map((v, i) => (flipAll || i === flipOne ? 1 - v : v));
  const codes = [0, 1, 2, 3].map((i) => (i === odd ? code(flipped) : code(t)));
  return { codes, odd, common: code(t) };
}

// =====================================================================================================================
// Boss 1: Ingra Malok (Droman is an add that the tank holds; the embrace is broken by damage or a posture break)
// =====================================================================================================================

const droman = (c: BossController): Enemy | null => {
  const list = c.adds('droman');
  return list.find((e) => !e.isDead) ?? null;
};

function wrath(c: BossController): void {
  const st = c.state;
  st.embrace = null;
  c.vulnerable(1, 0);
  c.stagger(12, 3.0, 12, "DROMAN'IN GAZABI!");
  const d = droman(c);
  if (d && !st.stage2) d.hp = d.maxHp;
  if (d) bossFx('boss_enrage', d.position.x, d.position.z, { dur: 1 });
}

const ingraAbilities: Record<string, BossHandler> = {
  ingra_staff: {
    usable(c, _ab, _target, dist) {
      return dist <= 6;
    },
    start(c) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.2, range: 4.0, arc: 100, windup: 0.75 },
        { coef: 1.2, range: 4.5, arc: 100, windup: 0.44, gap: 0.2 },
        { coef: 2.2, range: 5.0, arc: 90, windup: 0.55, gap: 0.2, knockback: 5 },
      ], { target: t, hold: [0.2, 0.45], cancelOnBreak: true, name: 'Boynuz Biçişi' });
    },
  },
  ingra_sweep: {
    start(c) {
      const e = c.e;
      const t = nonTankOf(c);
      const ang0 = t ? angleTo(e.position.x, e.position.z, t.position.x, t.position.z) : 0;
      for (let i = 0; i < 3; i++) {
        c.schedule(i * 0.35, () => beam(c, e.position.x, e.position.z, ang0 + rad(25) * i, 30, 3, 0.9, 1.8, { name: 'Ruh Süpürmesi' }), 'ingra_sweep');
      }
    },
  },
  ingra_embrace: {
    start(c) {
      const st = c.state;
      const d = droman(c);
      st.embrace = { t: 0, hp0: d ? d.hp : 0 };
      c.vulnerable(0.2, 25);
      for (const p of c.playersInArena()) statusPlayer(p, 'poison', 25, { magnitude: 0.35 });
      bossFx('shadow_ground', c.e.position.x, c.e.position.z, { dur: 25 });
    },
  },
  ingra_visage: {
    start(c) {
      circle(c, c.e.position.x, c.e.position.z, c.arena.r, 2.0, 0.6, { name: 'İtici Görünüm', statuses: [{ status: 'fear', duration: 3 }] });
    },
  },
  ingra_breakfree: {
    start(c) {
      c.state.stage2 = true;
      const d = droman(c);
      if (d) makeInvulnerable(d);
      c.yell('Zincirler kırıldı! Artık ben varım!');
    },
  },
};

const ingra: BossScript = {
  abilities: ingraAbilities,
  onEngage(c) {
    const st = c.state;
    if (st.spawned) return;
    st.spawned = true;
    st.embrace = null;
    st.stage2 = false;
    c.spawnAdds('ps_droman', 1, { positions: [c.gdd(21.5, 37.5)], tag: 'droman', hpMult: 28 * partyHp(c), aggro: true });
  },
  update(c, dt) {
    const st = c.state;
    const d = droman(c);
    if (d) {
      const floor = 0.12 * d.maxHp;
      if (d.hp < floor) d.hp = floor;
      if (!st.embrace && !st.stage2 && d.hp < d.maxHp) d.hp = Math.min(d.maxHp, d.hp + 0.03 * d.maxHp * dt);
    }
    const emb = st.embrace as { t: number; hp0: number } | null;
    if (emb) {
      emb.t += dt;
      if (d && emb.hp0 - d.hp >= 0.15 * d.maxHp) {
        wrath(c);
      } else if (emb.t >= 25) {
        circle(c, c.e.position.x, c.e.position.z, c.arena.r, 0.1, 3.5, { name: 'Karanlık Patlaması' });
        st.embrace = null;
        c.vulnerable(1, 0);
      }
    }
    if (st.stage2 && !emb) {
      st.wrathT = (st.wrathT ?? 0) + dt;
      if (st.wrathT >= 20) {
        st.wrathT = 0;
        wrath(c);
      }
    }
  },
  onBreak(c) {
    // a posture break on Ingra during the Droman window reads as a free damage window (bossBreak runs this once per break)
    c.vulnerable(1.25, 2);
  },
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
};

// =====================================================================================================================
// Boss 2: Sis Çağıran (the Guessing Game: 3 identical illusions and one odd one)
// =====================================================================================================================

interface GuessState {
  started: boolean;
  done: boolean;
  t: number;
  odd: string;
  wrong: number;
  known: Map<number, string>;
  handled: Set<number>;
}

function endGame(c: BossController, g: GuessState): void {
  g.done = true;
  c.freeze(false);
  c.setImmune(false);
  c.state.guess = null;
  c.endMechanicPhase();
}

function timeoutGame(c: BossController, g: GuessState, stunless: boolean): void {
  for (const e of c.adds('clone')) {
    if (e.isDead) continue;
    circle(c, e.position.x, e.position.z, 8, 0.1, 2.0, { type: 'poison', name: 'Sis Patlaması' });
  }
  if (stunless) c.yell('Oyun bitti, sis kazandı!');
  endGame(c, g);
}

function beginGame(c: BossController): void {
  const g = c.state.guess as GuessState | null;
  if (!g) return;
  const plan = rollSigils(keyLevel());
  g.odd = plan.codes[plan.odd];
  c.setImmune(true);
  c.freeze(true);
  const slots = ringPoints(c.arena.cx, c.arena.cz, 12.8, 8);
  const order = slots.map((s, i) => ({ s, i })).sort(() => Math.random() - 0.5).slice(0, 4);
  plan.codes.forEach((code, i) => {
    const slot = order[i]?.s;
    if (slot) c.spawnAdds('ps_mist_clone_' + code, 1, { positions: [slot], aggro: false, tag: 'clone' });
  });
  g.started = true;
  c.yell('Zeminle uyuşmayan illüzyonu vur!');
}

const guessAbility: BossHandler = {
  start(c, b: Busy) {
    b.total = b.delay + 1.4;
    const g: GuessState = { started: false, done: false, t: 0, odd: '', wrong: 0, known: new Map(), handled: new Set() };
    c.state.guess = g;
    c.schedule(1.2, () => beginGame(c), 'sis_guess');
  },
  tick(c, _b: Busy, dt: number) {
    const g = c.state.guess as GuessState | null;
    if (!g || g.done || !g.started) return;
    g.t += dt;
    const current = c.adds('clone');
    const ids = new Set<number>();
    for (const e of current) {
      ids.add(e.id);
      if (!g.known.has(e.id)) g.known.set(e.id, e.def.id.slice('ps_mist_clone_'.length));
    }
    for (const [id, code] of g.known) {
      if (g.handled.has(id)) continue;
      const e = current.find((x) => x.id === id);
      const dead = !e || e.isDead;
      if (!dead) continue;
      g.handled.add(id);
      if (code === g.odd) {
        c.stagger(5, 1.6, 8, 'YAKALANDI!');
        endGame(c, g);
        return;
      }
      g.wrong++;
      if (g.wrong <= 2) {
        circle(c, c.e.position.x, c.e.position.z, c.arena.r, 0.1, keyLevel() <= 5 ? 3.0 : 3.6, { knockback: 6, type: 'poison', name: 'Hay Aksi!' });
        c.yell('Hay aksi, yanlış tilki!');
      } else {
        timeoutGame(c, g, true);
        return;
      }
    }
    if (g.t >= 20) timeoutGame(c, g, false);
  },
};

const sisAbilities: Record<string, BossHandler> = {
  mist_patty: {
    resolve(c) {
      const t = tankOf(c);
      if (!t) return;
      bossString(c, [
        { coef: 1.0, range: 3.5, arc: 100, windup: 0.7 },
        { coef: 1.0, range: 3.5, arc: 100, windup: 0.42, gap: 0.2 },
        { coef: 1.6, range: 4.0, arc: 100, windup: 0.49, gap: 0.2, knockback: 4, statuses: [{ status: 'fear', duration: 5 }] },
      ], { target: t, cancelOnBreak: true, name: 'Pasta Pasta' });
    },
  },
  mist_burst: {
    start(c) {
      const n = (c.state.burst ?? 0) as number;
      c.state.burst = n + 1;
      circle(c, c.e.position.x, c.e.position.z, c.arena.r, 2.0, 1.0 * (1 + 0.15 * n), { type: 'poison', telegraph: false, name: 'Cezalı Patlama' });
    },
  },
  mist_dodgeball: {
    start(c) {
      const e = c.e;
      const t = nonTankOf(c);
      if (!t) return;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      const hold = rnd(0.3, 0.6);
      beam(c, e.position.x, e.position.z, ang, 44, 3.2, 1.3 + hold, 2.4, { knockback: 4, type: 'poison', name: 'Kaçınma Topu' });
    },
  },
  mist_freeze: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      const a = Math.random() * Math.PI * 2;
      const pos = { x: t.position.x + 20 * Math.sin(a), z: t.position.z + 20 * Math.cos(a) };
      c.spawnAdds('ps_vulpin', 1, { positions: [pos], aggro: true, tag: 'vulpin' });
    },
  },
  mist_dance: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      const land = bossLeap(c, { target: t, min: 8, max: 28, airtime: 1.1, radius: 3.2, coef: 2.2, name: 'Sis Dansı' });
      for (let k = 0; k < 4; k++) {
        c.schedule(1.1 + 0.7, () => beam(c, land.x, land.z, (k * Math.PI) / 2, 9, 2, 0.05, 1.0, { type: 'poison', name: 'Sis Dansı' }), 'sis_dance');
      }
    },
  },
  mist_guess: guessAbility,
};

const sis: BossScript = {
  abilities: sisAbilities,
  kite: [8, 14],
  onBreak(c) {
    // Kırık Dans: a posture break outside the games trips her mid-dance
    c.stagger(4, 1.25, 4, 'KIRIK DANS!');
  },
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
};

// =====================================================================================================================
// Boss 3: Tred'ova (Consumption at 70 % and 40 %, Mind Link, marked prey, leap and a rush from stage 2 and 3)
// =====================================================================================================================

interface ConsumeState { t: number; missileT: number; tickT: number; consumes: number }

function endConsume(c: BossController, broken: boolean): void {
  const st = c.state;
  st.consume = null;
  c.freeze(false);
  if (broken) {
    c.stagger(3, 1.5, 5, 'KALKAN KIRILDI!');
  } else {
    st.consumes = ((st.consumes ?? 0) as number) + 1;
    // M+ key 7 and up: three parasites after an unbroken Consumption
    if (keyLevel() >= 7) {
      const ps = c.randomPlayers(3);
      const ids = ['ps_parasite_p', 'ps_parasite_i', 'ps_parasite_d'];
      ps.forEach((p, i) => c.spawnAdds(ids[i], 1, { positions: [{ x: p.position.x, z: p.position.z }], aggro: true, tag: 'parasite' }));
    }
  }
  c.endMechanicPhase();
}

const tredAbilities: Record<string, BossHandler> = {
  tred_bite: {
    start(c) {
      const st = c.state;
      st.biteN = ((st.biteN ?? 0) as number) + 1;
      const t = tankOf(c);
      if (!t) return;
      const stack = st.biteN % 2 === 0 ? [{ status: 'asit_yarasi' as const, duration: 8, stacks: 1 }] : undefined;
      bossString(c, [
        { coef: 1.0, range: 6, arc: 100, windup: 0.7 },
        { coef: 1.0, range: 6, arc: 100, windup: 0.42, gap: 0.2, statuses: stack },
      ], { target: t, cancelOnBreak: true, name: 'Çift Isırık' });
    },
  },
  tred_tail: {
    usable(c) {
      return playerBehind(c);
    },
    start(c) {
      circle(c, c.e.position.x, c.e.position.z, 7, 1.0, 2.0, { knockback: 4, name: 'Kuyruk Savurma' });
    },
  },
  tred_acid: {
    start(c) {
      const consumes = (c.state.consumes ?? 0) as number;
      const n = 3 + consumes;
      for (let i = 0; i < n; i++) {
        const t = nonTankOf(c);
        if (!t) continue;
        const x = t.position.x, z = t.position.z;
        circle(c, x, z, 3.5, 1.5, 2.0, { type: 'poison', name: 'Asit Fırlatma' });
        zone(c, x, z, 3.5, 14, 1.0, 0.3, 1.5, { type: 'poison', name: 'Asit Birikintisi' });
      }
    },
  },
  tred_marked: {
    start(c) {
      const t = nonTankOf(c);
      if (t) statusPlayer(t, 'sunder', 20);
      c.spawnAdds('ps_larva', 4, { positions: ringPoints(c.e.position.x, c.e.position.z, 3, 4), aggro: true, tag: 'larva' });
    },
  },
  tred_mindlink: {
    start(c) {
      const n = c.partySize() < 4 ? 2 : 3;
      const ps = c.randomPlayers(n);
      if (ps.length >= 2) linkPlayers(c, ps.map((p) => p.id), { r: 14, coefBase: 0.3, tick: 1, dur: 10, release: 30 });
    },
  },
  tred_coalesce: {
    start(c) {
      circle(c, c.e.position.x, c.e.position.z, 15, 5.0, 3.2, { type: 'poison', name: 'Zehir Birikimi' });
    },
  },
  tred_leap: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      const land = bossLeap(c, { target: t, min: 8, max: 28, airtime: 1.2, radius: 4.5, coef: 2.8, type: 'poison', name: 'Sıçrayıp Ezme' });
      for (let k = 0; k < 4; k++) {
        c.schedule(1.2 + 0.7, () => beam(c, land.x, land.z, (k * Math.PI) / 2, 10, 2, 0.5, 1.0, { type: 'poison', name: 'Sıçrayıp Ezme' }), 'tred_leap');
      }
    },
  },
  tred_rush: {
    start(c) {
      const t = nonTankOf(c);
      if (!t) return;
      const e = c.e;
      const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
      dashLine(c, e.position.x, e.position.z, ang, 24, 4, 1.2, 18, 3.0, { name: 'Kovuk Hücumu', type: 'physical' });
    },
  },
  tred_consume: {
    start(c, b: Busy) {
      b.total = b.delay + 14.5;
      const cocoon = c.gdd(61.5, 56);
      c.teleport(cocoon.x, cocoon.z - 3);
      c.freeze(true);
      bossShield(c, 0.06);
      c.state.consume = { t: 0, missileT: 1.2, tickT: 2, consumes: c.state.consumes ?? 0 } as ConsumeState;
      bossFx('consumption_swirl', cocoon.x, cocoon.z, { dur: 14 });
    },
    tick(c, _b: Busy, dt: number) {
      const k = c.state.consume as ConsumeState | null;
      if (!k) return;
      k.t += dt;
      if (!shieldUp(c)) {
        endConsume(c, true);
        return;
      }
      k.tickT -= dt;
      if (k.tickT <= 0) {
        k.tickT = 2;
        circle(c, c.e.position.x, c.e.position.z, c.arena.r, 0.05, 0.5, { type: 'poison', telegraph: false, name: 'Tüketme' });
      }
      k.missileT -= dt;
      if (k.missileT <= 0) {
        k.missileT = 1.2;
        const t = nonTankOf(c);
        if (t) circle(c, t.position.x, t.position.z, 2.5, 0.5, 1.6, { type: 'poison', name: 'Anima Füzesi' });
      }
      if (k.t >= 14) endConsume(c, false);
    },
    abort(c) {
      if (c.state.consume) endConsume(c, false);
    },
  },
  tred_frenzy: {
    start(c) {
      c.yell('Açlık çılgınlığı!');
    },
  },
};

const tredova: BossScript = {
  abilities: tredAbilities,
  onReset(c) {
    for (const k of Object.keys(c.state)) delete c.state[k];
  },
};

// =====================================================================================================================
// registry
// =====================================================================================================================

export const PERI_SCRIPTS: Record<string, BossScript> = {
  boss_ingra_malok: ingra,
  boss_sis_cagiran: sis,
  boss_tredova: tredova,
};

const CLONE_IDS: string[] = [];
for (const shape of ['F', 'L']) for (const fill of ['D', 'B']) for (const ring of ['H', 'N']) CLONE_IDS.push('ps_mist_clone_' + shape + fill + ring);

export const PERI_SPAWNS: Record<string, string[]> = {
  boss_ingra_malok: ['ps_droman'],
  boss_sis_cagiran: ['ps_vulpin', ...CLONE_IDS],
  boss_tredova: ['ps_larva', 'ps_parasite_p', 'ps_parasite_i', 'ps_parasite_d'],
};
