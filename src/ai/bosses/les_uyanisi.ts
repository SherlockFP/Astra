import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import type { BossHandler, BossScript } from './types';
import { angleTo, beam, circle, partyHp, pickPlayers, ring, statusPlayer, wedge } from './kit';
import { bossLeap, bossString } from './moveBridge';
import { bossShield, shieldUp } from './links';

/**
 * Leş Uyanışı bosses (docs/dungeons/les_uyanisi.md section 5): Çürükkemik, Hasatçı Amarth, Cerrah Dikişet and the showpiece
 * Ayazbağlayan Nalthor. Strings run through bossString, leaps through bossLeap, and the posture break is BossScript.onBreak.
 *
 * Deviations (each is a shared engine piece that does not exist yet, listed in the report):
 * - no removal of a live add: Son Hasat and the worm explosion damage but leave the minions / worms alive (no enemy kill API).
 * - no Dark Exile (boss_tp message, exile room alt_kanat, exile status): Nalthor's Karanlık Sürgün is left out of the kit.
 * - no hover or dive height: Amarth's dive teleports him onto the tank after the circle lands (no setHover).
 * - no status stacks for tank_stack, heal_cut, frost_mark, morbid_fixation or champion_boon (not StatusIds). Only existing ids
 *   are used: poison, root, silence, shield, sunder, slow, knockdown, stun, necrotic, bleed, chill, enrage.
 * - the Dikişet fixation chase and the hook pull share one beam; the Sürünen Dikişler sweep is three static beams.
 * - Icebound Aegis is not halved by a break (the break cancels the cast and the boss is staggered, as in the rest).
 * OWNER: enemies module.
 */

type Pt = { x: number; z: number };

/** Dikişet's creation slabs (tile coords, section 5.3) and the arena landing point after a hook or the auto drop. */
const SLABS: [number, number][] = [[31, 10], [36.5, 11.5], [42, 10]];
const LANDING: [number, number] = [36.5, 10.2];
const MAX_CONSTRUCTS = (c: BossController): number => (c.phase?.id === 'p3' ? 3 : c.phase?.id === 'p2' ? 2 : 1);

/** A random living non-tank player, or null. */
const someDps = (c: BossController): Player | null => pickPlayers(c, 1, true)[0] ?? null;

/** The walkable ground nearest to (x, z) inside the arena, or null. Blinks and shape anchors are snapped here: a point on a wall or a prop would strand the boss or start a shape inside the prop. */
const walkableInArena = (c: BossController, x: number, z: number): Pt | null => {
  const w = c.world.nav.nearestWalkable(x, z, 8);
  return w && c.insideArena(w.x, w.z, 0) ? w : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Çürükkemik (worms stack and explode; the Kusma spawns the worms along its cone)
// ---------------------------------------------------------------------------------------------------------------------
const WORM_BOOM_SEC = 20;

const curukkemik: BossScript = {
  init(c) {
    c.state.wormAge = {} as Record<string, number>;
    c.state.wormBoom = {} as Record<string, boolean>;
  },
  update(c, dt) {
    // Kan Emme (simplified): a worm ages; at WORM_BOOM_SEC (the fifth stack) it explodes once: every living player is poisoned.
    const age = c.state.wormAge as Record<string, number>;
    const boom = c.state.wormBoom as Record<string, boolean>;
    for (const w of c.adds('worm')) {
      if (w.isDead) continue;
      const k = String(w.id);
      age[k] = (age[k] ?? 0) + dt;
      if (age[k] >= WORM_BOOM_SEC && !boom[k]) {
        boom[k] = true;
        for (const p of c.playersInArena()) statusPlayer(p, 'poison', 30, { stacks: 3, magnitude: 0.3 });
        c.yell('Leş Patlaması!');
      }
    }
  },
  onBreak(c) {
    // Duruş Kırılması: 3 s on his knees, x1.25 damage; a cast in progress (a Boğucu Kusma windup) is cancelled.
    c.stagger(3, 1.25, 25);
    c.interrupt('external');
  },
  abilities: {
    les_cur_string: {
      start(c) {
        const t = c.tank;
        if (!t) return;
        bossString(c, [
          { coef: 1.0, range: 5, arc: 110, windup: 0.7, parryable: true },
          { coef: 1.0, range: 5, arc: 110, windup: 0.45, gap: 0.45, parryable: true },
          { coef: 1.6, range: 5, arc: 110, windup: 0.9, gap: 1.0, parryable: true },   // delayed overhead
        ], { target: t, cancelOnBreak: true, name: 'Üçlü Pençe' });
      },
    },
    les_cur_retch: {
      start(c, b) {
        const t = someDps(c);
        if (!t) return;
        const e = c.e;
        const ang = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        c.state.retchAng = ang;
        wedge(c, e.position.x, e.position.z, ang, 12, 60, b.delay, 1.3, {
          type: 'poison', name: 'Boğucu Kusma', vfxOnLand: 'poison_burst',
          statuses: [{ status: 'poison', duration: 12, stacks: 2, magnitude: 0.3 }],
        });
      },
      resolve(c) {
        const ang = Number(c.state.retchAng ?? 0);
        const e = c.e;
        const n = (c.phase?.id ?? 'p1') === 'p1' ? 2 : 3;
        const dists = [4, 7, 10].slice(0, n);
        const positions = dists.map((d) => ({ x: e.position.x + Math.sin(ang) * d, z: e.position.z + Math.cos(ang) * d }));
        c.spawnAdds('les_ceset_kurdu', n, { positions, hpMult: partyHp(c), tag: 'worm' });
      },
    },
    les_cur_leap: {
      start(c, b) {
        const t = someDps(c);
        if (!t) return;
        bossLeap(c, { target: t, airtime: b.delay, radius: 5, coef: 2.2, statuses: [{ status: 'knockdown', duration: 0.8 }], name: 'Leş Sıçrayışı' });
      },
    },
    les_cur_burst: {
      start(c, b) {
        const e = c.e;
        ring(c, e.position.x, e.position.z, 0, 9, b.delay, 2.2, { type: 'physical', name: 'Dikişler Patlıyor' });
      },
      resolve(c) {
        const positions = [0, 1, 2, 3].map(() => c.randomPoint(4));
        c.spawnAdds('les_ceset_kurdu', 4, { positions, hpMult: partyHp(c), tag: 'worm' });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Hasatçı Amarth (Land of the Dead every 32 s, the Final Harvest 20 s later, the scythe string, the dive)
// ---------------------------------------------------------------------------------------------------------------------
const LAND_ADDS = ['les_am_savasci', 'les_am_savasci', 'les_am_savasci', 'les_am_buyucu', 'les_am_buyucu', 'les_am_arbaletci', 'les_am_arbaletci'];

const amarth: BossScript = {
  init(c) {
    c.state.echo = 0;
    c.state.alive = 0;
    c.state.pDead = 0;
    c.state.echoT = 0;
  },
  update(c, dt) {
    // İşkence Yankıları (Tortured Echoes): count every minion and player death; a raid pulse every 3 s (2 s below 30%).
    const minions = c.adds('minion').filter((e) => !e.isDead);
    const deadPlayers = c.playersInArena(false).filter((p) => p.isDead).length;
    const s = c.state;
    s.echo += Math.max(0, Number(s.alive) - minions.length) + Math.max(0, deadPlayers - Number(s.pDead));
    s.alive = minions.length;
    s.pDead = deadPlayers;
    s.echoT -= dt;
    if (s.echoT <= 0) {
      s.echoT = (c.phase?.id === 'p1' || !c.phase) ? 3 : 2;
      const a = c.bdef.arena;
      // the court centre is the Cesaret'in Eli prop (blocked): the pulse is anchored on the nearest walkable ground (the radius covers the court either way)
      const o = a ? (walkableInArena(c, a.cx, a.cz) ?? { x: a.cx, z: a.cz }) : null;
      if (a && o) circle(c, o.x, o.z, a.w / 2, 0.05, 0.1 * (1 + 0.3 * Number(s.echo)), { type: 'shadow', telegraph: false, name: 'İşkence Yankıları' });
    }
  },
  onBreak(c) {
    // Duruş Kırılması: dragged to the ground for 5 s, x1.4 damage; the Volley and the Nefes channel are cancelled.
    c.stagger(5, 1.4, 25);
    c.interrupt('external');
    c.cdOverride.set('les_amr_volley', 8);
  },
  abilities: {
    les_amr_scythe: {
      start(c) {
        const t = c.tank;
        if (!t) return;
        bossString(c, [
          { coef: 1.6, range: 8, arc: 180, windup: 0.85, parryable: true },
          { coef: 1.6, range: 8, arc: 180, windup: 0.6, gap: 0.5, parryable: true },
          { coef: 2.8, range: 6, arc: 70, windup: 1.0, gap: 1.0, parryable: false },   // delayed overhead (perilous)
        ], { target: t, cancelOnBreak: true, name: 'Tırpan Dizisi' });
      },
    },
    les_amr_land: {
      start(c, b) {
        const e = c.e;
        const p = c.randomPoint(5, { x: e.position.x, z: e.position.z, d: 10 });
        c.state.landX = p.x;
        c.state.landZ = p.z;
        circle(c, p.x, p.z, 3.5, b.delay, 0.2, { type: 'shadow', name: 'Ölüler Diyarı', vfxOnLand: 'shadow_burst' });
      },
      resolve(c) {
        const x = Number(c.state.landX);
        const z = Number(c.state.landZ);
        LAND_ADDS.forEach((id, i) => {
          c.schedule(0.6 * i, () => c.spawnAdds(id, 1, { x, z, radius: 2.2, tag: 'minion' }), 'land');
        });
        // queued, not castNow: castNow is refused while the boss is busy and the timer never retries, so the harvest was dropped
        c.schedule(20, () => {
          c.forceAbility('les_amr_final');
        }, 'harvest');
      },
    },
    les_amr_final: {
      start(c, b) {
        // Son Hasat: a red circle on every living minion (the corpse circles of the doc, drawn on the minion position)
        for (const m of c.adds('minion')) {
          if (m.isDead) continue;
          circle(c, m.position.x, m.position.z, 6, b.delay, 1.4, { type: 'shadow', name: 'Son Hasat' });
        }
      },
      resolve(c) {
        const n = Math.min(8, c.adds('minion').filter((e) => !e.isDead).length);
        if (n <= 0) return;
        const e = c.e;
        circle(c, e.position.x, e.position.z, c.bdef.arenaRadius, 0.05, 0.55 * n, { type: 'shadow', name: 'Son Hasat' });
      },
    },
    les_amr_breath: {
      start(c, b) {
        const t = c.tank;
        if (!t) return;
        const e = c.e;
        const base = angleTo(e.position.x, e.position.z, t.position.x, t.position.z);
        for (let k = 0; k < 6; k++) {
          wedge(c, e.position.x, e.position.z, base + k * 0.25, 16, 50, b.delay + 0.5 * k, 0.45, { type: 'shadow', telegraph: k === 0, name: 'Nekrotik Nefes' });
        }
      },
    },
    les_amr_dive: {
      start(c, b) {
        const t = c.tank;
        if (!t) return;
        c.state.diveX = t.position.x;
        c.state.diveZ = t.position.z;
        circle(c, t.position.x, t.position.z, 6, b.delay, 3.0, { type: 'physical', perilous: true, name: 'Dalış' });
      },
      resolve(c) {
        c.teleport(Number(c.state.diveX), Number(c.state.diveZ), true);
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Cerrah Dikişet (table stage immune in poison fog; the meat hook pulls him into the arena for 20 s)
// ---------------------------------------------------------------------------------------------------------------------
const TABLE_SEC = 20;
const ARENA_SEC = 20;

/** The creation adds alive now (the constructs that the hook can use). */
const constructs = (c: BossController): Enemy[] => c.adds('construct').filter((e) => !e.isDead);

/** Table position (world) and the arena landing point (world). */
function tablePos(c: BossController): Pt {
  return c.gdd(36.5, 5.5);
}

function toArena(c: BossController, from: Pt | null, hooked: boolean): void {
  const s = c.state;
  s.stage = 'arena';
  s.stageT = hooked ? ARENA_SEC + 4 : ARENA_SEC;
  c.setImmune(false);
  const land = from ?? c.gdd(LANDING[0], LANDING[1]);
  c.teleport(land.x, land.z, true);
  circle(c, land.x, land.z, 5, 1.2, 2.0, { type: 'physical', name: 'Yere Çarpma' });
  if (hooked) c.stagger(3, 1.25, 12);
}

function toTable(c: BossController): void {
  const s = c.state;
  s.stage = 'table';
  s.stageT = TABLE_SEC;
  const tp = tablePos(c);
  c.teleport(tp.x, tp.z, true);
  c.setImmune(true);
}

const dikisat: BossScript = {
  init(c) {
    c.state.stage = 'table';
    c.state.stageT = TABLE_SEC;
    c.state.fogT = 0;
  },
  onEngage(c) {
    toTable(c);
  },
  update(c, dt) {
    const s = c.state;
    s.stageT = Number(s.stageT) - dt;
    if (s.stage === 'table') {
      // Zehirli Sis: a poison fog of 18 m around the island every 6 s
      s.fogT = Number(s.fogT) - dt;
      if (s.fogT <= 0) {
        s.fogT = 6;
        const tp = tablePos(c);
        c.shape({
          shape: { type: 'circle', radius: 18 }, x: tp.x, z: tp.z, dx: 0, dz: 1, delay: 0.05, coef: 0.4, telegraph: false,
          type: 'poison', persist: { duration: 6, tick: 1 }, name: 'Zehirli Sis',
        });
      }
      if (Number(s.stageT) <= 0) toArena(c, null, false);
    } else if (Number(s.stageT) <= 0) {
      c.castNow('les_dks_escape');
    }
  },
  onBreak(c) {
    // Duruş Kırılması (arena only, the table is immune): stagger 3 s, and the Kaçış is postponed by 6 s.
    if (c.state.stage !== 'arena') return;
    c.stagger(3, 1.25, 12);
    c.state.stageT = Number(c.state.stageT) + 6;
    c.interrupt('external');
  },
  abilities: {
    les_dks_string: {
      usable(c) {
        return c.state.stage === 'arena';
      },
      start(c) {
        const t = c.tank;
        if (!t) return;
        bossString(c, [
          { coef: 1.0, range: 4, arc: 100, windup: 0.7, parryable: true },
          { coef: 1.0, range: 4, arc: 100, windup: 0.42, gap: 0.2, parryable: true },
          { coef: 2.4, range: 6, arc: 60, windup: 1.0, gap: 0.95, parryable: false },   // delayed saw plunge (perilous)
        ], { target: t, cancelOnBreak: true, name: 'Cerrah Dizisi' });
      },
    },
    les_dks_lamp: { usable: (c) => c.state.stage === 'arena' },
    les_dks_ichor: { usable: (c) => c.state.stage === 'table' },
    les_dks_needle: { usable: (c) => c.state.stage === 'table' },
    les_dks_mutilate: { usable: (c) => c.state.stage === 'table' },
    les_dks_creation: {
      usable(c) {
        return c.state.stage === 'table' && constructs(c).length < MAX_CONSTRUCTS(c);
      },
      resolve(c) {
        const [sx, sz] = SLABS[Math.floor(Math.random() * SLABS.length)];
        const p = c.gdd(sx, sz);
        c.spawnAdds('les_dikis_yaratigi', 1, { x: p.x, z: p.z, radius: 0.5, tag: 'construct', hpMult: 7 * partyHp(c) });
      },
    },
    les_dks_hook: {
      usable(c) {
        return c.state.stage === 'table' && constructs(c).length > 0;
      },
      start(c, b) {
        const cr = constructs(c)[0];
        const t = someDps(c) ?? c.tank;
        if (!cr || !t) return;
        const ang = angleTo(cr.position.x, cr.position.z, t.position.x, t.position.z);
        c.state.hookX = cr.position.x;
        c.state.hookZ = cr.position.z;
        c.state.hookAng = ang;
        beam(c, cr.position.x, cr.position.z, ang, 34, 3.0, b.delay, 0.7, { type: 'physical', knockback: -16, name: 'Et Kancası' });
      },
      resolve(c) {
        // Success when the platform (8 m radius around the table) overlaps the beam rectangle (half width 1.5 m).
        const hx = Number(c.state.hookX), hz = Number(c.state.hookZ), ang = Number(c.state.hookAng);
        if (!Number.isFinite(hx) || c.state.stage !== 'table') return;
        const tp = tablePos(c);
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const along = (tp.x - hx) * dx + (tp.z - hz) * dz;
        const perp = Math.abs((tp.x - hx) * dz - (tp.z - hz) * dx);
        if (along >= 0 && along <= 34 + 8 && perp <= 8 + 1.5) toArena(c, { x: hx, z: hz }, true);
      },
    },
    les_dks_sutures: {
      usable: (c) => c.state.stage === 'table',
      start(c, b) {
        const tp = tablePos(c);
        const base = Math.random() * Math.PI * 2;
        for (let k = 0; k < 3; k++) {
          beam(c, tp.x, tp.z, base + (k * 2 * Math.PI) / 3, 24, 3.0, b.delay, 0.9, { type: 'poison', name: 'Sürünen Dikişler' });
        }
      },
    },
    les_dks_sever: {
      usable: (c) => c.state.stage === 'arena',
    },
    les_dks_lunge: {
      usable(c) {
        return c.state.stage === 'arena';
      },
      start(c) {
        const t = someDps(c);
        if (!t) return;
        bossLeap(c, { target: t, airtime: 1.0, radius: 3.5, coef: 3.0, type: 'physical', name: 'Cerrahi Sıçrama' });
      },
    },
    les_dks_escape: {
      resolve(c) {
        toTable(c);
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 4: Ayazbağlayan Nalthor (Comet channel, Binds with a nova, Icebound Aegis, the blink backhand, the lance, Eternal Winter)
// ---------------------------------------------------------------------------------------------------------------------
const nalthor: BossScript = {
  init(c) {
    c.state.aegisEpoch = 0;
  },
  onBreak(c) {
    // Duruş Kırılması: kneels for 3 s, x1.25 damage; the current cast (comet channel, binds, lance windup) is cancelled.
    c.stagger(3, 1.25, 25);
    c.interrupt('external');
  },
  abilities: {
    les_nal_string: {
      start(c) {
        const t = c.tank;
        if (!t) return;
        bossString(c, [
          { coef: 1.0, range: 5.5, arc: 100, windup: 0.7, parryable: true },
          { coef: 1.0, range: 5.5, arc: 100, windup: 0.45, gap: 0.45, parryable: true },
          { coef: 2.6, range: 8, arc: 60, windup: 1.0, gap: 1.0, parryable: false },   // Rime Burst (perilous)
        ], { target: t, cancelOnBreak: true, name: 'Don Kılıcı Dizisi' });
      },
    },
    les_nal_comet: {
      start(c, b) {
        // Kuyruklu Yıldız Yağmuru: 8 ticks over 4 s, a comet under every living player each tick
        for (let k = 0; k < 8; k++) {
          c.schedule(b.delay + 0.5 * k, () => {
            for (const p of c.playersInArena()) {
              circle(c, p.position.x, p.position.z, 2, 1.0, 0.7, { type: 'frost', name: 'Kuyruklu Yıldız', vfxOnLand: 'frost_burst' });
            }
          }, 'comet');
        }
      },
    },
    les_nal_aegis: {
      start(c) {
        // Buzlu Kalkan: an absorb of 6% of his max HP; a frost wave every 3 s; it detonates after 20 s if not broken
        bossShield(c, 0.06);
        const epoch = Number(c.state.aegisEpoch) + 1;
        c.state.aegisEpoch = epoch;
        for (let k = 1; k <= 6; k++) {
          c.schedule(3 * k, () => {
            if (epoch !== c.state.aegisEpoch || !shieldUp(c)) return;
            const e = c.e;
            circle(c, e.position.x, e.position.z, 30, 0.05, 0.55, { type: 'frost', telegraph: false, name: 'Buzlu Dalga' });
          }, 'aegis');
        }
        c.schedule(20, () => {
          if (epoch !== c.state.aegisEpoch || !shieldUp(c)) return;
          const e = c.e;
          circle(c, e.position.x, e.position.z, 30, 0.05, 3.0, { type: 'frost', name: 'Buzlu Kalkan Patlaması' });
          e.statuses.remove('shield');
        }, 'aegis');
      },
    },
    les_nal_binds: {
      start(c) {
        // Donmuş Bağlar: a random non-tank rooted 12 s; at expiry a 14 m frost nova around the spot (root 3 s)
        const t = someDps(c);
        if (!t) return;
        statusPlayer(t, 'root', 12);
        const x = t.position.x, z = t.position.z;
        c.schedule(12, () => {
          ring(c, x, z, 0, 14, 0, 1.6, { type: 'frost', name: 'Donmuş Bağlar', statuses: [{ status: 'root', duration: 3 }] });
        }, 'binds');
      },
    },
    les_nal_blink: {
      start(c, b) {
        // Don Sıçraması: he reappears 2.5 m behind a random non-tank, then a 6 m backhand (perilous) after the windup
        const t = someDps(c);
        if (!t) return;
        const e = c.e;
        const dx = t.position.x - e.position.x, dz = t.position.z - e.position.z;
        const len = Math.hypot(dx, dz) || 1;
        // the landing is snapped to walkable ground inside the arena (a point behind a wall or a prop would strand him there)
        const spot = walkableInArena(c, t.position.x + (dx / len) * 2.5, t.position.z + (dz / len) * 2.5);
        if (!spot) return;
        const bx = spot.x, bz = spot.z;
        c.teleport(bx, bz, true);
        wedge(c, bx, bz, angleTo(bx, bz, t.position.x, t.position.z), 6, 100, b.delay, 2.4, {
          type: 'frost', perilous: true, parryable: false, name: 'Don Sıçraması',
        });
      },
    },
    les_nal_lance: {
      start(c, b) {
        const t = c.tank;
        if (!t) return;
        const e = c.e;
        beam(c, e.position.x, e.position.z, angleTo(e.position.x, e.position.z, t.position.x, t.position.z), 40, 2.4, b.delay, 3.2, {
          type: 'frost', perilous: true, parryable: false, name: 'Kırağı Mızrağı',
        });
      },
    },
    les_nal_winter: {
      start(c, b) {
        // Sonsuz Kış: four closing rings from 14 m inward, each 2.5 s apart (inner radius grows, the centre shrinks)
        const e = c.e;
        for (let k = 0; k < 4; k++) {
          ring(c, e.position.x, e.position.z, 14 + 4 * k, 30, b.delay + 2.5 * k, 0.8, { type: 'frost', name: 'Sonsuz Kış' });
        }
      },
    },
  },
};

// Basic-attack ids (the boss handlers above are keyed by the strings' and abilities' ids). The generic basics need no handler.
export const LES_SCRIPTS: Record<string, BossScript> = {
  les_boss_curukkemik: curukkemik,
  les_boss_hasatci_amarth: amarth,
  les_boss_cerrah_dikisat: dikisat,
  les_boss_ayazbaglayan_nalthor: nalthor,
};

/** Extra enemy ids each boss spawns (asset preloading). */
export const LES_SPAWNS: Record<string, string[]> = {
  les_boss_curukkemik: ['les_ceset_kurdu'],
  les_boss_hasatci_amarth: ['les_am_savasci', 'les_am_buyucu', 'les_am_arbaletci'],
  les_boss_cerrah_dikisat: ['les_dikis_yaratigi'],
  les_boss_ayazbaglayan_nalthor: [],
};

export type { BossHandler };
