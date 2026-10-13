import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import type { BossScript } from './types';
import { angleTo, circle, dashLine, every, floatOver, isTank, partyHp, pickPlayers, rad, ring, statusPlayer, zone } from './kit';
import { bossLeap, bossString } from './moveBridge';
import { markPlayers } from './patterns';
import { clearOrbs, fixate, roamingOrb, updateOrbs } from './orbs';

/**
 * Yiğitler Sarayı bosses (docs/dungeons/yigitler_sarayi.md section 5): Heymdal (drakes, horn, leap), Hirya (pillar stacks),
 * Fenrür (retreat with pups, fixation) and Odyn (stage 1 Skovald, stage 2 judgment), one boss entity with two stages.
 * Elden-style strings use bossString; leaps use bossLeap; marks use markPlayers; orbs use roamingOrb.
 *
 * Deviations (engine pieces not in place, see the report): no Aegis of Aggramar ward (-75% damage) so the Ragnarok ticks land
 * at full coefficient; no Statik Alan strip behind the drakes' breath; no rune-pad soak (a brand is cleansed by standing near any
 * pad); no `holy_scorch` / `aegis_ward` / `odyn_favor` / `odyn_blessing` statuses (Favor and Blessing use the `haste` fallback
 * the doc names); no posture-break cancels of Ragnarok or Tempest (only runs with cancelOnBreak are cut); the
 * Felblaze / Tide Crush leaps and the Fenrür frenzy are fixed-time (no stagger interaction).
 * OWNER: enemies module (season dungeon Yiğitler Sarayı).
 */

type Pt = { x: number; z: number };

const FORK_BOSSES = ['boss_hirya', 'boss_fenrur'];
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

function tankOf(c: BossController): Player | null {
  const ps = c.playersInArena();
  return ps.find(isTank) ?? c.nearestPlayer() ?? null;
}

function nonTankOf(c: BossController): Player | null {
  const ps = pickPlayers(c, 1, true);
  return ps[0] ?? null;
}

/** Odyn's Favor (first fork boss dead) or Blessing (second): +move speed for the party. Shared by Hirya and Fenrür. */
export function grantOdynBuff(c: BossController): void {
  const killed = (G.mplus.state?.bossesKilled ?? []).filter((id) => FORK_BOSSES.includes(id) && id !== c.bdef.id);
  for (const p of c.playersInArena()) {
    if (killed.length === 0) statusPlayer(p, 'haste', 75, { magnitude: 0.4 });   // odyn_favor fallback
    else statusPlayer(p, 'haste', 60, { magnitude: 0.7 });                       // odyn_blessing fallback
  }
}

/** Clears orbs and every script key (wipe, reset, death). The controller restores dmgMul and the timers. */
function wipe(c: BossController): void {
  clearOrbs(c);
  for (const k of Object.keys(c.state)) delete c.state[k];
}

// =====================================================================================================================
// Boss 1: Heymdal (Gök Kapısı'nın Bekçisi). Drakes come with each horn; phase 3 adds seeking orbs.
// =====================================================================================================================

const heymdal: BossScript = {
  abilities: {
    hym_combo: {
      start(c) {
        const t = tankOf(c);
        if (!t) return;
        bossString(c, [
          { coef: 1.2, range: 5, arc: 100, windup: 0.75 },
          { coef: 1.4, range: 5, arc: 110, windup: 0.6, gap: 0.55 },
          { coef: 2.6, range: 6, arc: 140, windup: 0.5, gap: 1.0, knockback: 5, parryable: false },
        ], { target: t, cancelOnBreak: true, name: 'Gök Kapısı Üçlemesi' });
      },
    },
    hym_leap: {
      start(c) {
        const t = nonTankOf(c);
        if (!t) return;
        const at = bossLeap(c, { target: t, airtime: 0.9, radius: 4.5, coef: 3.0, name: 'Kapı Çarpması' });
        // the shockwave lands 1.5 s after the leap (ring telegraph 0.9 s)
        c.schedule(1.5, () => ring(c, at.x, at.z, 3, 8, 0.9, 1.2, { name: 'Kapı Depremi' }), 'hym_leap');
      },
    },
    hym_blade: {
      start(c) {
        const t = nonTankOf(c);
        if (!t) return;
        circle(c, t.position.x, t.position.z, 3, 1.2, 0.8, { name: 'Dans Eden Bıçak' });
        zone(c, t.position.x, t.position.z, 3, 12, 2, 0.7, 1.25, { name: 'Dans Eden Bıçak' });
      },
    },
    hym_horn: {
      start(c) {
        const st = c.state;
        st.horns = (st.horns ?? 0) + 1;
        const n = Math.min(1 + st.horns + (st.p2 ? 1 : 0), 4);
        const e = c.e;
        circle(c, e.position.x, e.position.z, c.arena.r + 8, 2.5, 1.2, { name: 'Gökgürültüsü Borusu' });
        c.schedule(2.5, () => {
          const alive = c.adds('drake').filter((d) => !d.isDead).length;
          const k = Math.max(0, Math.min(n, 5 - alive));
          if (k > 0) c.spawnAdds('yg_hym_drake', k, { tag: 'drake', aggro: true, hpMult: 1.2 * partyHp(c) });
          if (st.p3) {
            for (let i = 0; i < 2; i++) {
              roamingOrb(c, { x: e.position.x, z: e.position.z, speed: 3.2, life: 10, r: 1.3, coef: 1.6, seek: nonTankOf(c) });
            }
          }
        }, 'hym_horn');
      },
    },
    hym_storm_call: {
      start(c) {
        c.state.p2 = true;
      },
    },
    hym_wrath: {
      start(c) {
        c.state.p3 = true;
        c.dmgMul *= 1.15;
      },
    },
  },
  update(c, dt) {
    updateOrbs(c, dt);
  },
  onReset(c) {
    wipe(c);
  },
  onDeath(c) {
    clearOrbs(c);
  },
};

// =====================================================================================================================
// Boss 2a: Hirya (Eyra'nın Seçilmişi). Thunder and Holy stacks from the two pillars gate her school of abilities.
// =====================================================================================================================

/** Solsten (thunder, west) and Olmyr (holy, east), GDD tile coordinates (the props sit on the same tiles). */
const SOLSTEN: [number, number] = [23.5, 14.5];
const OLMYR: [number, number] = [31.5, 14.5];

/** Stack bookkeeping: +1 per 4 s inside 8 m of a pillar, -1 per 4 s away from it. Also scales c.dmgMul (+10% per stack). */
function updatePillars(c: BossController, dt: number): void {
  const st = c.state;
  const e = c.e;
  const pT = c.gdd(SOLSTEN[0], SOLSTEN[1]);
  const pH = c.gdd(OLMYR[0], OLMYR[1]);
  every(st, 'pillars', dt, 0.25, () => {
    const step = (key: 'T' | 'H', near: boolean, label: string): void => {
      const acc = key + 'Acc';
      if (near) {
        st[acc] = Math.max(0, st[acc] ?? 0) + 0.25;
        if (st[acc] >= 4) {
          st[acc] = 0;
          st[key] = Math.min(6, (st[key] ?? 0) + 1);
          floatOver(e, `${label} x${st[key]}`);
        }
      } else {
        st[acc] = Math.min(0, st[acc] ?? 0) - 0.25;
        if (st[acc] <= -4) {
          st[acc] = 0;
          st[key] = Math.max(0, (st[key] ?? 0) - 1);
        }
      }
    };
    step('T', dist(e.position, pT) <= 8, 'GÖK');
    step('H', dist(e.position, pH) <= 8, 'IŞIK');
  });
  const mult = 1 + 0.1 * ((st.T ?? 0) + (st.H ?? 0));
  c.dmgMul = (c.dmgMul / (st.stackMul ?? 1)) * mult;
  st.stackMul = mult;
}

const hirya: BossScript = {
  abilities: {
    hir_spear: {
      start(c) {
        const t = tankOf(c);
        if (!t) return;
        bossString(c, [
          { coef: 1.1, range: 12, arc: 20, windup: 0.7 },
          { coef: 1.1, range: 12, arc: 20, windup: 0.6, gap: 0.45, parryable: true },
          { coef: 2.6, range: 14, arc: 25, windup: 0.5, gap: 0.9, knockback: 6, parryable: false },
        ], { target: t, cancelOnBreak: true, name: 'Çifte Mızrak' });
      },
    },
    hir_dive: {
      start(c) {
        const e = c.e;
        const t = nonTankOf(c);
        if (!t) return;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        dashLine(c, e.position.x, e.position.z, ang, 24, 3, 1.4, 30, 1.4, { name: 'Valkyr Dalışı' });
        circle(c, e.position.x + Math.sin(ang) * 24, e.position.z + Math.cos(ang) * 24, 4.5, 1.6, 2.0, { name: 'Valkyr Dalışı' });
        c.schedule(2.6, () => c.vulnerable(1.3, 2.5), 'hir_dive');
      },
    },
    hir_arcing: {
      usable: (c) => (c.state.T ?? 0) >= 1,
      start(c) {
        markPlayers(c, pickPlayers(c, 4, true), {
          delay: 2.4, r: 4, coef: 2.0, type: 'lightning', name: 'Ark Şimşeği', toast: 'Ark Şimşeği! Dağılın!',
        });
      },
    },
    hir_eye: {
      usable: (c) => (c.state.T ?? 0) >= 1,
      start(c) {
        const e = c.e;
        c.freeze(true);
        ring(c, e.position.x, e.position.z, 4.5, 70, 0.1, 0.65, { name: 'Fırtına Gözü', persist: { duration: 9, tick: 1.5 } });
        c.schedule(9.2, () => c.freeze(false), 'hir_eye');
      },
    },
    hir_sanctify: {
      usable: (c) => (c.state.H ?? 0) >= 1,
      start(c) {
        const p = c.gdd(OLMYR[0], OLMYR[1]);
        const n = c.phase?.id === 'p2' ? 8 : 6;
        for (let i = 0; i < n; i++) {
          roamingOrb(c, { x: p.x, z: p.z, dir: rad((360 * i) / n), speed: 4.5, life: 9, r: 1.4, coef: 1.8, type: 'holy' });
        }
      },
    },
    hir_expel: {
      usable: (c) => (c.state.H ?? 0) >= 1,
      start(c) {
        const t = nonTankOf(c);
        if (!t) return;
        markPlayers(c, [t], { delay: 4.0, r: 8, coef: 3.0, type: 'holy', name: 'Arınma Patlaması', toast: 'Arınma! Uzaklaş!' });
      },
    },
    hir_call: {
      start(c) {
        c.state.stage2 = true;
        c.state.callT = 0;
        for (const p of [SOLSTEN, OLMYR]) {
          c.spawnAdds('yg_valkyr_acolyte', 1, { positions: [c.gdd(p[0], p[1])], aggro: true, tag: 'acolyte', hpMult: 2.5 * partyHp(c) });
        }
      },
    },
  },
  update(c, dt) {
    updateOrbs(c, dt);
    updatePillars(c, dt);
    if (c.state.stage2) {
      every(c.state, 'acolytes', dt, 30, () => {
        const alive = c.adds('acolyte').filter((a) => !a.isDead).length;
        if (alive >= 4) return;
        for (const p of [SOLSTEN, OLMYR]) {
          c.spawnAdds('yg_valkyr_acolyte', 1, { positions: [c.gdd(p[0], p[1])], aggro: true, tag: 'acolyte', hpMult: 2.5 * partyHp(c) });
        }
      });
    }
  },
  onDeath(c) {
    clearOrbs(c);
    grantOdynBuff(c);
  },
  onReset(c) {
    wipe(c);
  },
};

// =====================================================================================================================
// Boss 2b: Fenrür (Sonsuz Av'ın Efendisi). Two mechanic phases on the ledge with pups; fixation on a random non-tank.
// =====================================================================================================================

const fenrur: BossScript = {
  abilities: {
    fen_string: {
      start(c) {
        const t = tankOf(c);
        if (!t) return;
        bossString(c, [
          { coef: 1.1, range: 4.5, arc: 110, windup: 0.6, statuses: [{ status: 'bleed', duration: 6, stacks: 1, magnitude: 0.2 }] },
          { coef: 1.2, range: 5, arc: 120, windup: 0.5, gap: 0.4 },
          { coef: 2.8, range: 6, arc: 90, windup: 0.5, gap: 0.9, knockback: 4, parryable: false },
        ], { target: t, cancelOnBreak: true, name: 'Av Üçlüsü' });
      },
    },
    fen_frenzy: {
      start(c) {
        const e = c.e;
        c.freeze(true);
        zone(c, e.position.x, e.position.z, 9, 3, 0.75, 0.75, 1.2, { name: 'Pençe Çılgınlığı' });
        c.schedule(4.2, () => c.freeze(false), 'fen_frenzy');
      },
    },
    fen_howl: {
      start(c) {
        const e = c.e;
        circle(c, e.position.x, e.position.z, c.arena.r, 1.4, 0, {
          name: 'Sessiz Uluma', statuses: [{ status: 'silence', duration: 3 }],
        });
      },
    },
    fen_leap: {
      start(c) {
        const far = nonTankOf(c);
        if (far) {
          bossLeap(c, {
            target: far, airtime: 0.9, radius: 5, coef: 3.0, name: 'Çifte Atılış',
            statuses: [{ status: 'bleed', duration: 8, stacks: 1, magnitude: 0.2 }],
          });
        }
        c.schedule(1.9, () => {
          const t = tankOf(c);
          if (t) bossLeap(c, { target: t, airtime: 0.8, radius: 3, coef: 2.2, name: 'Çifte Atılış' });
        }, 'fen_leap');
      },
    },
    fen_scent: {
      start(c) {
        const t = nonTankOf(c);
        if (!t) return;
        fixate(c, t, {
          seconds: 6, speed: 6.6, catchR: 1.5,
          onCatch: (o) => circle(c, o.x, o.z, 3, 0.05, 4.5, {
            name: 'Kan Kokusu',
            statuses: [{ status: 'knockdown', duration: 1.5 }, { status: 'bleed', duration: 8, stacks: 2, magnitude: 0.2 }],
          }),
        });
      },
    },
    fen_retreat: {
      start(c) {
        const st = c.state;
        const e = c.e;
        c.setImmune(true);
        c.freeze(true);
        const ledge = c.gdd(55.2, 44.2);
        c.teleport(ledge.x, ledge.z);
        const pups = c.phase?.id === 'p4' ? 5 : 4;
        for (let i = 0; i < pups; i++) {
          c.schedule(i * 1.5, () => c.spawnAdds('yg_worg_summoned', 1, { tag: 'pup', aggro: true }), 'fen_retreat');
        }
        c.schedule(18, () => {
          const near = c.adds('pup').filter((p) => !p.isDead && dist(p.position, e.position) <= 10).length;
          for (let i = 0; i < Math.min(3, near); i++) c.dmgMul *= 1.15;
          st.retreat = false;
          c.setImmune(false);
          c.freeze(false);
          c.endMechanicPhase();
        }, 'fen_retreat');
      },
    },
  },
  onDeath(c) {
    clearOrbs(c);
    grantOdynBuff(c);
  },
  update(c, dt) {
    updateOrbs(c, dt);
  },
  onReset(c) {
    wipe(c);
  },
};

// =====================================================================================================================
// Boss 3 (finale): Odyn. Stage 1 is Skovald (an encounter add) while Odyn is held immune; stage 2 is Odyn's judgment.
// =====================================================================================================================

/** The eight rune pads on the ring of radius 5 tiles around the Aegis pedestal (GDD tile coordinates). */
const PAD_TILES: [number, number][] = [
  [51.5, 13.5], [55.04, 12.04], [56.5, 8.5], [55.04, 4.96], [51.5, 3.5], [47.96, 4.96], [46.5, 8.5], [47.96, 12.04],
];
const PEDESTAL: [number, number] = [51.5, 8.5];
const SKOVALD_GATE: [number, number] = [51.5, 14.2];
const DAIS_TELEPORT: [number, number] = [51.5, 6.5];
const OBLITERATOR_RIM: [number, number][] = [[45.5, 8.5], [57.5, 8.5]];

/** Ragnarok: 6 fire ticks every 1.5 s over the whole arena (coefficients as the doc). The Aegis ward is NOT implemented. */
function ragnarok(c: BossController, t0: number): void {
  const center = c.gdd(PEDESTAL[0], PEDESTAL[1]);
  const coefs = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
  coefs.forEach((coef, i) => {
    c.schedule(t0 + 1.5 * i, () => circle(c, center.x, center.z, c.arena.r, 0.6, coef, { name: 'Ragnarok', type: 'holy' }), 'odn_s1');
  });
  for (let k = 0; k < 3; k++) {
    c.schedule(t0 + 3 * k, () => {
      for (const p of pickPlayers(c, 3, false)) {
        circle(c, p.position.x, p.position.z, 3, 2.0, 1.5, { name: 'Yas Alevi' });
        zone(c, p.position.x, p.position.z, 3, 8, 0.5, 0.5, 2.05, { name: 'Yas Alevi' });
      }
    }, 'odn_s1');
  }
}

const odyn: BossScript & { lockLimit?: number } = {
  lockLimit: 420,
  abilities: {
    odn_trial: {
      start(c) {
        const st = c.state;
        st.stage = 1;
        st.s1t = 0;
        c.setImmune(true);
        c.freeze(true);
        c.suppressBasic = true;
        const g = c.gdd(SKOVALD_GATE[0], SKOVALD_GATE[1]);
        c.spawnAdds('yg_skovald', 1, { positions: [g], aggro: true, tag: 'skovald', hpMult: 48 * partyHp(c) });
        c.yell("Skovald, Aegis'i almak için Şan Salonu'na dalıyor!");
        for (const t0 of [16, 38]) {
          c.schedule(t0 - 1.5, () => c.yell("Ragnarok! Aegis'i al!"), 'odn_s1');
          ragnarok(c, t0);
        }
        c.schedule(25, () => c.spawnAdds('yg_tideskorn_add', 2, { aggro: true, tag: 'tideskorn' }), 'odn_s1');
        c.schedule(60, () => c.spawnAdds('yg_tideskorn_add', 2, { aggro: true, tag: 'tideskorn' }), 'odn_s1');
      },
    },
    odn_trinity: {
      start(c) {
        const t = tankOf(c);
        if (!t) return;
        bossString(c, [
          { coef: 1.0, range: 9, arc: 40, windup: 0.8 },
          { coef: 1.0, range: 9, arc: 40, windup: 0.6, gap: 0.5, parryable: true },
          { coef: 2.4, range: 9, arc: 200, windup: 0.5, gap: 1.0, knockback: 6, parryable: false },
        ], { target: t, cancelOnBreak: true, name: 'Üçlü Hüküm' });
      },
    },
    odn_brand: {
      start(c) {
        const pads = PAD_TILES.map(([x, z]) => c.gdd(x, z));
        markPlayers(c, c.playersInArena(), { delay: 12, r: 1.6, coef: 0, type: 'holy', name: 'Rünik Damga', toast: 'Damga! Padine koş!' });
        c.schedule(12, () => {
          for (const p of c.playersInArena()) {
            const onPad = pads.some((q) => dist(p.position, q) <= 2.4);
            if (onPad) statusPlayer(p, 'empower', 12, { magnitude: 0.3 });   // rune_blessed fallback
            else circle(c, p.position.x, p.position.z, 1.6, 0.05, 3.2, { type: 'holy', name: 'Rünik Damga', statuses: [{ status: 'sunder', duration: 15 }] });
          }
        }, 'odn_brand');
      },
    },
    odn_spears: {
      start(c) {
        const alive = c.playersInArena().length;
        const n = c.state.p3 ? 4 : alive <= 3 ? 2 : 3;
        for (const p of pickPlayers(c, n, true)) {
          circle(c, p.position.x, p.position.z, 4, 2.2, 3.2, { name: 'Işık Mızrakları' });
          zone(c, p.position.x, p.position.z, 3, 14, 2, 0.6, 2.25, { name: 'Işık Mızrakları' });
        }
      },
    },
    odn_tempest: {
      start(c) {
        const e = c.e;
        circle(c, e.position.x, e.position.z, c.arena.r, 4.0, 4.0, { name: 'Parlak Fırtına', type: 'holy', knockback: 14 });
      },
    },
    odn_obliterator: {
      start(c) {
        const pos = c.gdd(...OBLITERATOR_RIM[Math.random() < 0.5 ? 0 : 1]);
        c.spawnAdds('yg_obliterator', 1, { positions: [pos], aggro: true, tag: 'obliterator', hpMult: 7 * partyHp(c) });
      },
    },
    odn_plunge: {
      start(c) {
        const t = nonTankOf(c);
        if (!t) return;
        circle(c, t.position.x, t.position.z, 7, 1.4, 4.0, { name: 'Yargı Düşüşü', type: 'holy' });
        zone(c, t.position.x, t.position.z, 7, 6, 1.0, 0.6, 1.45, { name: 'Yargı Düşüşü', type: 'holy' });
        c.schedule(1.4, () => c.vulnerable(1.25, 2.0), 'odn_plunge');
      },
    },
    odn_rain: {
      start(c) {
        for (const p of pickPlayers(c, 2, false)) {
          circle(c, p.position.x, p.position.z, 3, 1.5, 2.5, { type: 'lightning', name: 'Yıldırım Yağmuru' });
        }
        for (let i = 0; i < 6; i++) {
          const r = c.randomPoint(3);
          circle(c, r.x, r.z, 3, 1.5, 2.5, { type: 'lightning', name: 'Yıldırım Yağmuru' });
        }
      },
    },
    odn_judgment: {
      start(c) {
        c.state.p3 = true;
        c.dmgMul *= 1.1;
      },
    },
  },
  update(c, dt) {
    updateOrbs(c, dt);
    const st = c.state;
    if (st.stage !== 1) return;
    st.s1t = (st.s1t ?? 0) + dt;
    // Skovald dead (give the spawn two seconds to register): stage 2 starts, Odyn steps down to the dais.
    if (st.s1t > 2 && !c.adds('skovald').some((s) => !s.isDead)) {
      st.stage = 2;
      c.cancelTimers('odn_s1');
      c.yell('Kral düştü... şimdi sizi sınayacağım.');
      c.setImmune(false);
      c.freeze(false);
      c.suppressBasic = false;
      const d = c.gdd(DAIS_TELEPORT[0], DAIS_TELEPORT[1]);
      c.teleport(d.x, d.z);
      c.endMechanicPhase();
    }
  },
  onReset(c) {
    c.cancelTimers('odn_s1');
    wipe(c);
  },
  onDeath(c) {
    clearOrbs(c);
  },
};

// ---- registry --------------------------------------------------------------------------------------------------------------------

export const YIGITLER_SARAYI_SCRIPTS: Record<string, BossScript> = {
  boss_heymdal: heymdal,
  boss_hirya: hirya,
  boss_fenrur: fenrur,
  boss_odyn: odyn,
};

/** Encounter adds each boss spawns (asset preloading). */
export const YIGITLER_SARAYI_SPAWNS: Record<string, string[]> = {
  boss_heymdal: ['yg_hym_drake'],
  boss_hirya: ['yg_valkyr_acolyte'],
  boss_fenrur: ['yg_worg_summoned'],
  boss_odyn: ['yg_skovald', 'yg_tideskorn_add', 'yg_obliterator'],
};
