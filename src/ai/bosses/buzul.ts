import { G } from '../../game/G';
import { yawFromDir } from '../../core/utils';
import type { BossController } from '../BossController';
import type { Player } from '../../entities/Player';
import { bossFx, bossMsg, bossMsgTo, bossText } from '../bossNet';
import type { BossScript } from './types';
import {
  angleTo, busyTarget, circle, clearPrisons, dashLine, distXZ, makeInvulnerable, partyHp, pickPlayers, rnd, spawnMech, TAU, trapPlayer, updatePrisons, zone, type Pt,
} from './kit';

/**
 * Buzul Tahtı bosses (GDD_CONTENT 4.3.5): Ak Pençe, Ayaz Ana, Donmuş Kral Tuğrul (+ Kırağı the frost dragon).
 * OWNER: enemies module.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Ak Pençe
// ---------------------------------------------------------------------------------------------------------------------
const PILLAR_LIFE = 20;

const akpence: BossScript = {
  init(c) {
    c.state.charging = null;
  },
  update(c) {
    const st = c.state;
    const e = c.e;
    const now = c.world.time;
    // Buz Sarkıtı pillars expire after 20 s (the expiry time is part of the replicated tag)
    for (const o of c.adds()) {
      if (!o.tag.startsWith('pillar:')) continue;
      if (o.isDead || now >= Number(o.tag.slice(7))) {
        bossFx('frost_burst', o.position.x, o.position.z, { scale: 0.8 });
        o.escape();
      }
    }
    // Öfkeli Hücum: a pillar in the way shatters and the charging boss is stunned for 5 s (+50% damage taken)
    const ch = st.charging as { until: number; dx: number; dz: number } | null;
    if (ch) {
      if (now >= ch.until) st.charging = null;
      else {
        for (const o of c.adds()) {
          if (!o.tag.startsWith('pillar:') || o.isDead) continue;
          const fx = o.position.x - e.position.x, fz = o.position.z - e.position.z;
          const fwd = fx * ch.dx + fz * ch.dz, lat = Math.abs(fx * ch.dz - fz * ch.dx);
          if (fwd > -0.5 && fwd <= e.radius + o.radius + 0.9 && lat <= o.radius + 1.3) {
            bossFx('frost_burst', o.position.x, o.position.z, { scale: 1.4 });
            o.escape();
            e.forcedMove = null;
            e.velocity.set(0, 0, 0);
            st.charging = null;
            try {
              G.hitShapes.cancelBySource(e.id);
            } catch { /* ignore */ }
            c.stagger(5, 1.5, 5);
            G.events.emit('camera:shake', { intensity: 0.5, duration: 0.5 });
            break;
          }
        }
      }
    }
  },
  abilities: {
    /** Kar Çığı: 10 random circles + 1 under each player (coef 2 + stun 1 s); 3-5 of them leave a Buz Sarkıtı pillar for 20 s. */
    akpence_avalanche: {
      start(c, b) {
        const pts: Pt[] = [];
        for (let i = 0; i < 10; i++) pts.push(c.randomPoint(3));
        const rand = pts.slice();
        for (const p of c.playersInArena()) pts.push({ x: p.position.x, z: p.position.z });
        for (const p of pts) circle(c, p.x, p.z, 2.5, b.delay, 2.0, { type: 'frost', statuses: [{ status: 'stun', duration: 1 }], name: 'Kar Çığı', vfxOnLand: 'frost_burst' });
        // pillars: random impacts at least 6 m apart, at least 3 of them
        const chosen: Pt[] = [];
        for (const p of rand) if (chosen.length < 5 && chosen.every((q) => distXZ(q.x, q.z, p.x, p.z) >= 6)) chosen.push(p);
        for (let tries = 0; chosen.length < 3 && tries < 20; tries++) {
          const p = c.randomPoint(4);
          if (chosen.every((q) => distXZ(q.x, q.z, p.x, p.z) >= 6)) chosen.push(p);
        }
        const until = c.world.time + b.delay + PILLAR_LIFE;
        c.schedule(b.delay + 0.05, () => {
          for (const p of chosen) spawnMech(c, 'proc_ice_pillar', p, { hpMult: 3, tag: `pillar:${until.toFixed(1)}` });
        }, 'pil');
        bossMsg('boss_toast', {}, { text: 'Çığ geliyor! Buz sarkıtlarını siper olarak kullan.' });
      },
    },

    /** Öfkeli Hücum: fixates a random player for 3 s, then charges 30 m at 16 m/s toward where they stood. */
    akpence_charge: {
      start(c, b) {
        const t = pickPlayers(c, 1)[0] ?? busyTarget(c, b);
        if (!t) return;
        b.data.pid = t.id;
        b.data.shot = false;
        b.total = b.delay + 30 / 16 + 0.6;
        bossMsgTo(t.id, 'boss_toast', {}, { text: 'Ak Pençe seni gözüne kestirdi!' });
        bossFx('curse_loop', t.position.x, t.position.z, { follow: t.id, dur: 3.2, y: 1.2 });
        bossText('!', t.position.x, 3.2, t.position.z, 3);
      },
      tick(c, b, dt, t) {
        const e = c.e;
        const p = b.data.pid != null ? c.world.getActor(b.data.pid as number) : undefined;
        const live = p && !p.isDead ? p : null;
        if (t < b.delay - 0.7) {
          if (live) c.faceTo(live.position.x - e.position.x, live.position.z - e.position.z, 10, dt);
          return;
        }
        if (b.data.shot) return;
        b.data.shot = true;
        const ang = live ? angleTo(e.position.x, e.position.z, live.position.x, live.position.z) : e.yaw;
        b.data.ang = ang;
        e.yaw = ang;
        b.data.len = dashLine(c, e.position.x, e.position.z, ang, 30, 4, 0.7, 16, 4.0, {
          type: 'physical', statuses: [{ status: 'knockdown', duration: 1.5 }], name: 'Öfkeli Hücum',
        });
      },
      resolve(c, b) {
        const ang = (b.data.ang as number | undefined) ?? c.e.yaw;
        const len = (b.data.len as number | undefined) ?? 30;
        const dur = Math.max(0.2, len / 16);
        if (len > 0.5) {
          c.dash(Math.sin(ang), Math.cos(ang), len, dur);
          c.state.charging = { until: c.world.time + dur + 0.2, dx: Math.sin(ang), dz: Math.cos(ang) };
        }
        G.vfx.spawn('charge_trail', c.e.pointAt(0.3), { dir: [Math.sin(ang), 0, Math.cos(ang)], duration: 1.9 });
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.4 });
      },
      end(c) {
        c.state.charging = null;
      },
      abort(c) {
        c.state.charging = null;
      },
    },

    /** Yaşlı Öfke (30%): +30% attack speed. */
    akpence_frenzy: {
      resolve(c) {
        c.atkMul *= 1.3;
        G.vfx.spawn('enrage_aura', c.e.pointAt(0.4), { follow: c.e.model ?? c.e.object3d, duration: 3600 });
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Ayaz Ana
// ---------------------------------------------------------------------------------------------------------------------
const PYLONS: [number, number][] = [[17.5, 2.5], [24.7, 2.5], [17.5, 9.7], [24.7, 9.7]];

interface Blizzard { pid: number; x: number; z: number; t: number; next: number }

const ayazana: BossScript = {
  init(c) {
    c.state.prisons = [];
    c.state.blizzards = [];
  },
  update(c, dt) {
    const st = c.state;
    updatePrisons(c, dt);
    // Kar Fırtınası: a r 6 circle crawling after its victim at 3 m/s for 8 s
    const list = st.blizzards as Blizzard[];
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      z.t += dt;
      const p = c.world.getActor(z.pid);
      if (p && !p.isDead) {
        const dx = p.position.x - z.x, dz = p.position.z - z.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.1) {
          const s = Math.min(3 * dt, d);
          z.x += (dx / d) * s;
          z.z += (dz / d) * s;
        }
      }
      z.next -= dt;
      if (z.next <= 0) {
        z.next = 0.5;
        circle(c, z.x, z.z, 6, 0.5, 0.6, { type: 'frost', statuses: [{ status: 'chill', duration: 3, stacks: 1 }], name: 'Kar Fırtınası' });
        bossFx('blizzard', z.x, z.z, { dur: 0.8, scale: 2.6 });
      }
      if (z.t >= 8) list.splice(i, 1);
    }
  },
  onReset(c) {
    clearPrisons(c);
    (c.state.blizzards as Blizzard[]).length = 0;
  },
  abilities: {
    /** Dondurucu Nova: 2.5 s cast (not interruptible), circle r 8 around her, coef 2.5 + freeze 2 s. */
    ayazana_nova: {
      start(c, b) {
        const e = c.e;
        circle(c, e.position.x, e.position.z, 8, b.delay, 2.5, {
          type: 'frost', statuses: [{ status: 'freeze', duration: 2 }], follow: true, name: 'Dondurucu Nova', vfxOnLand: 'frost_nova',
        });
      },
    },

    /** Buz Mezarı: 1 random player (2 with a party of 4+) is frozen in a breakable ice block for up to 6 s. */
    ayazana_ice_tomb: {
      start(c, b) {
        const n = c.playersInArena(false).length >= 4 ? 2 : 1;
        const ids: number[] = [];
        for (const p of pickPlayers(c, n)) {
          ids.push(p.id);
          c.track(circle(c, p.position.x, p.position.z, 1.5, b.delay, 0.3, { follow: true, sourceId: p.id, type: 'frost', name: 'Buz Mezarı' }));
          bossMsgTo(p.id, 'boss_toast', {}, { text: 'Buz Mezarı! Seni kurtarmaları için müttefiklerine ihtiyacın var.' });
        }
        c.state.tombFor = ids;
      },
      resolve(c) {
        const ids = (c.state.tombFor ?? []) as number[];
        for (const id of ids) {
          const p = c.world.get<Player>(id);
          if (!p || p.isDead) continue;
          trapPlayer(c, p, { defId: 'proc_ice_tomb', prefix: 'tomb', hpMult: 5 * partyHp(c), status: 'freeze', maxAge: 6, soloAge: 2.5, soloHit: 1.5 });
          bossFx('frost_burst', p.position.x, p.position.z, { scale: 1.0 });
        }
        c.state.tombFor = [];
      },
    },

    /** Kar Fırtınası: follows a random player. */
    ayazana_blizzard: {
      start(c) {
        const p = pickPlayers(c, 1)[0];
        c.state.blizPick = p ? p.id : null;
      },
      resolve(c) {
        const id = c.state.blizPick as number | null;
        const p = id != null ? c.world.getActor(id) : undefined;
        if (!p) return;
        (c.state.blizzards as Blizzard[]).push({ pid: p.id, x: p.position.x, z: p.position.z, t: 0, next: 0 });
        bossMsgTo(p.id, 'boss_toast', {}, { text: 'Kar Fırtınası seni takip ediyor! Gruptan uzaklaştır.' });
      },
    },

    /** Ayna Sureti (70% / 40%): she blinks to the centre (immune 1 s), 3 mirror images appear on 3 of the 4 pylons for up to 30 s. */
    ayazana_mirror: {
      start(c) {
        c.setImmune(true);
      },
      resolve(c) {
        const ctr = c.gdd(20.5, 5.5);
        c.teleport(ctr.x, ctr.z);
        c.schedule(1.0, () => c.setImmune(false), 'imm');
        const order = PYLONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
        const hp = 4 * partyHp(c);
        for (const [x, z] of order) {
          const p = c.gdd(x, z);
          c.spawnAdds('ayaz_image', 1, { positions: [p], hpMult: hp, tag: 'image', aggro: true });
          bossFx('frost_nova', p.x, p.z, { scale: 0.9 });
        }
        c.cdOverride.set('ayazana_blizzard', 9);
        c.setCooldown('ayazana_blizzard', 1.5);
        c.schedule(30, () => {
          for (const o of c.adds('image')) {
            bossFx('frost_burst', o.position.x, o.position.z, { scale: 0.8 });
            o.escape();
          }
          c.cdOverride.delete('ayazana_blizzard');
        }, 'img');
        bossMsg('boss_toast', {}, { text: 'Aynalar! Buz Mızraklarını kes ve suretleri yok et.' });
      },
      abort(c) {
        if (!c.inReset) c.setImmune(false);
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Donmuş Kral Tuğrul + Kırağı
// ---------------------------------------------------------------------------------------------------------------------
const PILLARS: [number, number][] = [[29.5, 31.5], [43.5, 31.5], [29.5, 42.5], [43.5, 42.5]];

interface Dragon {
  mode: 'orbit' | 'wind' | 'breathe' | 'landed';
  ang: number;
  breathT: number;
  t: number;
  ready: boolean;
  from?: Pt;
  to?: Pt;
  dir?: Pt;
  lat?: Pt;
  off?: number;
  fxT?: number;
  safeIds?: number[];
}

/** Dragon (Kırağı) host-side entity. */
function dragonEnt(c: BossController) {
  return c.adds('dragon')[0];
}

/** Buz Nefesi: pick a side, band 48 x 12 across the arena, green shadows behind the pillars. */
function startBreath(c: BossController, d: Dragon): void {
  const a = c.arena;
  const dr = dragonEnt(c);
  if (!dr) return;
  const sx = Math.sin(d.ang), sz = Math.cos(d.ang);
  let D: Pt; // direction of the breath (from the dragon across the arena)
  if (Math.abs(sx) > Math.abs(sz)) D = { x: -Math.sign(sx) || -1, z: 0 };
  else D = { x: 0, z: -Math.sign(sz) || -1 };
  const L: Pt = { x: -D.z, z: D.x };
  const off = rnd(-9, 9);
  const P0: Pt = { x: a.cx - D.x * 24 + L.x * off, z: a.cz - D.z * 24 + L.z * off };
  d.mode = 'wind';
  d.t = 0;
  d.from = { x: dr.position.x, z: dr.position.z };
  d.to = P0;
  d.dir = D;
  d.lat = L;
  d.off = off;
  d.fxT = 0;
  d.safeIds = [];
  dr.playShot('No', 1, { fade: 0.05 });
  // pillar shadows (u along the breath, v across it)
  const shadows: { lo: number; hi: number; u0: number }[] = [];
  for (const [gx, gz] of PILLARS) {
    const pp = c.gdd(gx, gz);
    const rx = pp.x - P0.x, rz = pp.z - P0.z;
    const u = rx * D.x + rz * D.z, v = rx * L.x + rz * L.z;
    if (u <= 0 || u > 49) continue;
    const lo = Math.max(-6, v - 1.1), hi = Math.min(6, v + 1.1);
    if (hi - lo < 0.2) continue;
    shadows.push({ lo, hi, u0: u + 0.6 });
  }
  const bps = new Set<number>([-6, 6]);
  for (const s of shadows) {
    bps.add(s.lo);
    bps.add(s.hi);
  }
  const edges = [...bps].sort((p, q) => p - q);
  const at = (u: number, v: number): Pt => ({ x: P0.x + D.x * u + L.x * v, z: P0.z + D.z * u + L.z * v });
  for (let i = 0; i < edges.length - 1; i++) {
    const v0 = edges[i], v1 = edges[i + 1];
    if (v1 - v0 < 0.15) continue;
    const mid = (v0 + v1) / 2;
    const cover = shadows.filter((s) => s.lo <= mid && mid <= s.hi);
    const minU = cover.length ? Math.min(...cover.map((s) => s.u0)) : 48;
    const ctr = at(minU / 2, mid);
    // exposed part: damages
    c.shape({
      shape: { type: 'rect', width: v1 - v0, length: minU }, x: ctr.x, z: ctr.z, dx: D.x, dz: D.z, delay: 3.0, coef: 5.0, type: 'frost',
      statuses: [{ status: 'freeze', duration: 3 }], telegraph: true, name: 'Buz Nefesi',
    });
    // shadow part (green, display only: cancelled just before it would land)
    if (cover.length) {
      const len = 48 - minU;
      const sc = at(minU + len / 2, mid);
      const id = c.shape({
        shape: { type: 'rect', width: v1 - v0, length: len }, x: sc.x, z: sc.z, dx: D.x, dz: D.z, delay: 3.4, damage: 0, type: 'frost', telegraph: true, kind: 'safe', name: 'Gölge',
      });
      d.safeIds!.push(c.track(id));
    }
  }
  c.schedule(3.0, () => {
    for (const id of d.safeIds ?? []) {
      try {
        G.hitShapes.cancel(id);
      } catch { /* ignore */ }
    }
  }, 'brs');
  bossMsg('boss_toast', {}, { text: 'Kırağı nefes alıyor! Buz sütunlarının arkasına saklan!' });
}

function updateDragon(c: BossController, d: Dragon, dt: number): void {
  const dr = dragonEnt(c);
  if (!dr || dr.removed) return;
  const a = c.arena;
  if (!d.ready) {
    d.ready = true;
    makeInvulnerable(dr);
  }
  switch (d.mode) {
    case 'orbit': {
      d.ang += (10 / 30) * dt;
      dr.position.x = a.cx + Math.sin(d.ang) * 30;
      dr.position.z = a.cz + Math.cos(d.ang) * 30;
      dr.yaw = yawFromDir(Math.cos(d.ang), -Math.sin(d.ang));
      d.breathT -= dt;
      if (d.breathT <= 0 && c.phaseIdx === 1) startBreath(c, d);
      break;
    }
    case 'wind': {
      d.t += dt;
      const k = Math.min(1, d.t / 1.5);
      const e = k * k * (3 - 2 * k);
      dr.position.x = d.from!.x + (d.to!.x - d.from!.x) * e;
      dr.position.z = d.from!.z + (d.to!.z - d.from!.z) * e;
      dr.yaw = yawFromDir(d.dir!.x, d.dir!.z);
      if (d.t >= 3.0) {
        d.mode = 'breathe';
        d.t = 0;
        d.fxT = 0;
        dr.playShot('Punch', 0.7, { loop: true, loopFor: 2.2, fade: 0.05 });
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.5 });
      }
      break;
    }
    case 'breathe': {
      d.t += dt;
      d.fxT = (d.fxT ?? 0) - dt;
      if (d.fxT <= 0) {
        d.fxT = 0.2;
        const u = Math.min(46, 3 + d.t * 20);
        bossFx('frost_burst', d.to!.x + d.dir!.x * u, d.to!.z + d.dir!.z * u, { scale: 1.3 });
      }
      if (d.t >= 2.0) {
        dr.anim?.cancelOneShot(0.15);
        // resume the orbit from the nearest point of the circle
        d.ang = Math.atan2(dr.position.x - a.cx, dr.position.z - a.cz);
        d.mode = 'orbit';
        d.breathT = 15; // "every 20 s": the breath itself took 5 s
      }
      break;
    }
    default:
      break;
  }
}

const tugrul: BossScript = {
  init(c) {
    c.state.dragon = null;
  },
  update(c, dt) {
    const d = c.state.dragon as Dragon | null;
    if (d) updateDragon(c, d, dt);
  },
  onDeath(c) {
    for (const o of c.adds('dragon')) o.escape();
  },
  onReset(c) {
    c.state.dragon = null;
  },
  abilities: {
    /** Ayaz İşareti: every player is marked for 6 s; expiry: burst r 6 (coef 2.0, NOT the marked player) + ice patch r 3 for 15 s. */
    tugrul_frost_mark: {
      start(c) {
        for (const p of c.playersInArena()) {
          c.track(c.shape({
            shape: { type: 'ring', inner: 0.9, outer: 6 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 6.0, coef: 2.0, type: 'frost',
            telegraph: true, follow: true, sourceId: p.id, name: 'Ayaz İşareti', vfxOnLand: 'frost_burst',
          }));
          bossMsgTo(p.id, 'boss_toast', {}, { text: 'Ayaz İşareti! Gruptan uzaklaş, yama kenara bırak.' });
          c.schedule(6.0, () => {
            if (p.removed || c.e.isDead) return;
            zone(c, p.position.x, p.position.z, 3, 15, 0.5, 0.05, 0.1, { type: 'frost', statuses: [{ status: 'slow', duration: 1.0, magnitude: 0.5 }], vfxOnLand: 'frost_ground', name: 'Buz Yaması' });
          }, 'mark');
        }
      },
    },

    /** Ölümcül Dönüş: r 7 telegraph, then a 2.4 s spin drifting toward the farthest player (3 hits of coef 1.5). */
    tugrul_spin: {
      start(c, b) {
        const e = c.e;
        let far: number | null = null;
        let bd = -1;
        for (const p of c.playersInArena()) {
          const dd = distXZ(e.position.x, e.position.z, p.position.x, p.position.z);
          if (dd > bd) {
            bd = dd;
            far = p.id;
          }
        }
        b.data.far = far;
        b.data.h = 0;
        b.total = b.delay + 2.4 + 0.4;
        circle(c, e.position.x, e.position.z, 7, b.delay, 0.05, { follow: true, type: 'physical', name: 'Ölümcül Dönüş' });
      },
      resolve(c) {
        c.e.playShot('2H_Melee_Attack_Spin', 1, { fade: 0.04 });
        try {
          G.audio.play('whoosh', { pos: [c.e.position.x, 1, c.e.position.z], pitch: 0.7 });
        } catch { /* ignore */ }
      },
      tick(c, b, dt, t) {
        const s = t - b.delay;
        if (s < 0) return;
        const e = c.e;
        if (s < 2.4) {
          const tgt = b.data.far != null ? c.world.getActor(b.data.far as number) : undefined;
          if (tgt && !tgt.isDead) c.slide(tgt.position.x - e.position.x, tgt.position.z - e.position.z, 3, dt, false);
        }
        const H = [0.6, 1.17, 1.7];
        while ((b.data.h as number) < 3 && s >= H[b.data.h as number]) {
          b.data.h = (b.data.h as number) + 1;
          circle(c, e.position.x, e.position.z, 7, 0.05, 1.5, { telegraph: false, type: 'physical', name: 'Ölümcül Dönüş', vfxOnLand: 'spin_slash' });
        }
      },
    },

    /** Kırağı Göklerde (55%): the dragon starts circling; Buz Nefesi 5 s later and every 20 s. */
    tugrul_dragon_phase: {
      resolve(c) {
        const a = c.arena;
        const ang = rnd(0, TAU);
        c.state.dragon = { mode: 'orbit', ang, breathT: 5, t: 0, ready: false } as Dragon;
        c.spawnAdds('npc_kiragi', 1, { positions: [{ x: a.cx + Math.sin(ang) * 30, z: a.cz + Math.cos(ang) * 30 }], aggro: false, tag: 'dragon' });
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.6 });
        c.cdOverride.set('tugrul_frost_mark', 25);
      },
    },

    /** Tahtın Gazabı (25%): pillars shatter, the dragon lands behind the throne, +25% damage, faster marks / spins. */
    tugrul_wrath: {
      resolve(c) {
        for (const [gx, gz] of PILLARS) {
          const p = c.gdd(gx, gz);
          bossFx('frost_burst', p.x, p.z, { scale: 2.0, y: 1.5 });
          c.world.nav.setCircle(p.x, p.z, 1.2, true);
        }
        const dr = dragonEnt(c);
        const d = c.state.dragon as Dragon | null;
        if (dr) {
          const t = c.gdd(34.5, 41.2);
          dr.position.x = t.x;
          dr.position.z = t.z;
          dr.yaw = Math.PI;
          bossMsg('boss_hover', { h: 0 }, { targetId: dr.id });
          dr.playShot('No', 1);
        }
        if (d) d.mode = 'landed';
        c.dmgMul *= 1.25;
        c.cdOverride.set('tugrul_frost_mark', 15);
        c.cdOverride.set('tugrul_spin', 20);
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
        G.events.emit('camera:shake', { intensity: 0.5, duration: 0.6 });
      },
    },
  },
};

export const BUZUL_SCRIPTS: Record<string, BossScript> = {
  boss_ak_pence: akpence,
  boss_ayaz_ana: ayazana,
  boss_tugrul: tugrul,
};

export const BUZUL_SPAWNS: Record<string, string[]> = {
  boss_ak_pence: ['proc_ice_pillar'],
  boss_ayaz_ana: ['ayaz_image', 'proc_ice_tomb'],
  boss_tugrul: ['npc_kiragi'],
};
