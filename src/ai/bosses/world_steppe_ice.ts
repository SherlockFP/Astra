import { G } from '../../game/G';
import type { BossController } from '../BossController';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { StatusApply } from '../../types/skills';
import type { BossScript } from './types';
import { bossFx, bossMsgTo } from '../bossNet';
import { angleTo, busyTarget, distXZ, dashLine, farthestPlayer, floatOver, pickPlayers, ring, ringPoints, rnd, spawnMech, statusPlayer, TAU, wedge } from './kit';

/**
 * Two open-world bosses of the Karakır Bozkırı and the Ayaz Dağları (GDD_OPENWORLD 1.8 / 3.8-style world bosses for 5-10 players):
 *
 * - Ulu-Boz (`wb_ulu_boz`, Kadim Mamut): Toynak Sarsıntısı (frontal cone + three shock rings, Yer Çatlağı stacks on the tank),
 *   Toz Fırtınası (arena-wide sandstorm from the west: stand downwind of a rock or inside a totem's shade), Öfke Hücumu at 20 %
 *   (charge to the farthest player and four Bozkır Kurdu adds).
 * - Zemheri (`wb_ad_zemheri`, Kışın Kadim Canavarı): Buz Nefesi (cone cut by ice pillars: LOS), Kar Fırtınası (frost zones, Donma
 *   stacks while standing still inside, 3 s stun at 5), Buz Çağrısı (Buz Ruhları walk to the boss and heal it on contact; kill them),
 *   Mutlak Sıfır at 25 % (a 360 degree channel: interrupt it, or hide behind the pillars).
 *
 * Every telegraph is a HitShape with `telegraph: true` so the danger shows before it lands. Line-of-sight cuts are computed here:
 * a cone (or the full ring of a blast) is split into angular bands whose reach stops at the first pillar on each ray, so players
 * tucked behind a pillar sit outside the shapes. Host-only, like every boss script.
 * OWNER: enemies module.
 */

type Pt = { x: number; z: number };

/** Ice pillar body (proc_ice_pillar, 1.1 m nav blocker) plus a margin for the player's own radius. */
const PILLAR_R = 1.4;
const TOTEM_R = 3.2;
const ROCK_DOWNWIND = 5;
const ROCK_LATERAL = 2.2;
const DUST_TICK = 1.5;
const DUST_DUR = 20;
const DUST_COEF = 0.5;
const STORM_ZONE_R = 4.5;
const STORM_DUR = 9;
const DONMA_STUN_AT = 5;
const DONMA_STUN_SEC = 3;
const RUH_SPEED = 2.4;
const RUH_HEAL = 0.03;
const RUH_CAP = 6;
const RUH_REACH = 2.2;

/** Cover offsets from the arena centre (metres). Ulu-Boz: rocks shelter from the west wind, totems give a small round shade. */
const ULU_ROCKS: Pt[] = [{ x: -12, z: -6 }, { x: 2, z: -13 }, { x: -4, z: 9 }, { x: 12, z: 8 }];
const ULU_TOTEMS: Pt[] = [{ x: -18, z: 14 }, { x: 17, z: -15 }];
/** Zemheri: four ice pillars at the start of the fight. */
const ZEM_PILLARS: Pt[] = [{ x: -12, z: -8 }, { x: 12, z: -10 }, { x: -6, z: 12 }, { x: 10, z: 9 }];

interface Blocker { x: number; z: number; r: number }

const walkable = (c: BossController, p: Pt): Pt => {
  const nav = c.world.nav;
  if (nav.isWalkable(p.x, p.z)) return p;
  return nav.nearestWalkable(p.x, p.z, 6) ?? p;
};

/** Distance along a ray from (ax,az) at angle `th` (sin/cos convention) until the first pillar, capped at `range`. */
function rayReach(ax: number, az: number, th: number, range: number, blockers: Blocker[]): number {
  const dx = Math.sin(th), dz = Math.cos(th);
  let best = range;
  for (const k of blockers) {
    const px = k.x - ax, pz = k.z - az;
    const along = px * dx + pz * dz;
    if (along <= k.r) continue; // a pillar at the boss's own feet blocks nothing
    const perp = Math.abs(px * dz - pz * dx);
    if (perp >= k.r) continue;
    const t = along - Math.sqrt(k.r * k.r - perp * perp);
    if (t < best) best = Math.max(0.5, t);
  }
  return best;
}

/**
 * Cone (or blast) from (x,z) over `arc` degrees centred on `center` (radians), reaching `range`, with the pillars cutting their
 * shadow out of it: the arc is split into bands of equal reach and each band is one telegraphed cone. Returns the shape count.
 */
function losFan(c: BossController, o: {
  x: number; z: number; center: number; arc: number; range: number; blockers: Blocker[]; delay: number; coef: number;
  type: 'frost' | 'physical'; name: string; statuses?: StatusApply[];
}): number {
  const n = Math.max(2, Math.round(o.arc / 2));
  const step = (o.arc * Math.PI) / 180 / n;
  const start = o.center - ((o.arc * Math.PI) / 180) / 2;
  const reach: number[] = [];
  for (let i = 0; i <= n; i++) reach.push(Math.round(rayReach(o.x, o.z, start + i * step, o.range, o.blockers) * 2) / 2);
  const bands: { r: number; a0: number; a1: number }[] = [];
  for (let s = 0; s < n; s++) {
    const r = Math.min(reach[s], reach[s + 1]);
    const a0 = start + s * step, a1 = a0 + step;
    const last = bands[bands.length - 1];
    if (last && last.r === r) last.a1 = a1;
    else bands.push({ r, a0, a1 });
  }
  let count = 0;
  for (const b of bands) {
    const mid = (b.a0 + b.a1) / 2;
    const deg = ((b.a1 - b.a0) * 180) / Math.PI + 1; // one degree of overlap so band edges leave no gap
    const id = c.shape({
      shape: { type: 'cone', radius: Math.max(0.5, b.r), angle: Math.min(360, deg) }, x: o.x, z: o.z, dx: Math.sin(mid), dz: Math.cos(mid),
      delay: o.delay, coef: o.coef, type: o.type, telegraph: true, statuses: o.statuses, name: o.name,
    });
    if (id) count++;
  }
  return count;
}

/** Pillars of one tag as blockers (the live entities, so a shattered pillar stops blocking). */
const pillarsOf = (c: BossController, tag: string): Blocker[] => c.adds(tag).map((e) => ({ x: e.position.x, z: e.position.z, r: PILLAR_R }));

/** Ulu-Boz state: the sandstorm clock lives in c.state.dust (cleared on reset). */
interface DustState { until: number; next: number }
const dustState = (c: BossController): DustState | undefined => c.state.dust as DustState | undefined;

/** Ulu-Boz: a player is sheltered from the sandstorm inside a totem's shade or downwind of a rock (the wind blows from the west). */
function sheltered(p: Player, rocks: Enemy[], totems: Enemy[]): boolean {
  const x = p.position.x, z = p.position.z;
  for (const t of totems) if (distXZ(x, z, t.position.x, t.position.z) <= TOTEM_R) return true;
  for (const r of rocks) {
    const dx = x - r.position.x, dz = z - r.position.z;
    if (dx > 0 && dx < ROCK_DOWNWIND && Math.abs(dz) < ROCK_LATERAL) return true;
  }
  return false;
}

function dustUpdate(c: BossController): void {
  const st = dustState(c);
  if (!st) return;
  const now = c.world.time;
  if (now >= st.until) {
    delete c.state.dust;
    return;
  }
  if (now < st.next) return;
  st.next = now + DUST_TICK;
  const rocks = c.adds('rock');
  const totems = c.adds('totem');
  for (const p of c.playersInArena()) {
    if (sheltered(p, rocks, totems)) continue;
    c.shape({
      shape: { type: 'circle', radius: 1.1 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 0.3, coef: DUST_COEF, type: 'physical',
      telegraph: false, name: 'Kum Fırtınası',
    });
  }
}

/** Zemheri state: frost zones, per-player Donma stacks and standing time, the pillars seen last frame and the spirit flag. */
interface FrostState {
  zones: { x: number; z: number; r: number; until: number }[];
  last: Record<number, Pt>;
  still: Record<number, number>;
  donma: Record<number, number>;
  pillars: { id: number; x: number; z: number }[];
  ruhSummoned: boolean;
}
function frostState(c: BossController): FrostState {
  if (!c.state.frost) c.state.frost = { zones: [], last: {}, still: {}, donma: {}, pillars: [], ruhSummoned: false } as FrostState;
  return c.state.frost as FrostState;
}

/** Donma: standing still inside a frost zone adds one stack per second; moving or leaving the zone bleeds them off. 5 stacks = 3 s stun. */
function donmaUpdate(c: BossController, dt: number): void {
  const st = frostState(c);
  const now = c.world.time;
  st.zones = st.zones.filter((z) => z.until > now);
  for (const p of c.playersInArena()) {
    const prev = st.last[p.id];
    const moved = prev ? distXZ(prev.x, prev.z, p.position.x, p.position.z) : 0;
    st.last[p.id] = { x: p.position.x, z: p.position.z };
    const standing = moved / Math.max(dt, 1e-3) < 0.4;
    st.still[p.id] = standing ? (st.still[p.id] ?? 0) + dt : 0;
    const inZone = st.zones.some((z) => distXZ(z.x, z.z, p.position.x, p.position.z) <= z.r + p.radius);
    const cur = st.donma[p.id] ?? 0;
    let next = Math.max(0, cur - dt * 0.5);
    if (inZone && (st.still[p.id] ?? 0) >= 0.5) next = cur + dt;
    if (Math.floor(next) >= DONMA_STUN_AT) {
      statusPlayer(p, 'stun', DONMA_STUN_SEC);
      bossMsgTo(p.id, 'boss_toast', {}, { text: 'DONDUN! Sersemledin.' });
      next = 0;
    }
    st.donma[p.id] = next;
  }
}

/** Zemheri: Buz Ruhları walk at the boss and heal it when they arrive (3 % each). Players must kill them on the way. */
function ruhUpdate(c: BossController, dt: number): void {
  const boss = c.e;
  for (const r of c.adds('ruh')) {
    const dx = boss.position.x - r.position.x, dz = boss.position.z - r.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= RUH_REACH + boss.radius) {
      boss.hp = Math.min(boss.maxHp, boss.hp + boss.maxHp * RUH_HEAL);
      bossFx('heal_burst', boss.position.x, boss.position.z, { scale: 1.1 });
      r.escape();
      continue;
    }
    const s = Math.min(d, RUH_SPEED * dt);
    if (d > 1e-4) {
      r.position.x += (dx / d) * s;
      r.position.z += (dz / d) * s;
    }
  }
}

function summonRuh(c: BossController, n: number): void {
  const pts = ringPoints(c.arena.cx, c.arena.cz, 20, n, rnd(0, TAU)).map((p) => walkable(c, p));
  c.spawnAdds('zemheri_ruh', n, { positions: pts, aggro: false, tag: 'ruh' });
  for (const p of pts) bossFx('add_spawn', p.x, p.z, { scale: 0.9 });
}

/** A pillar that died since last frame shatters: a frost burst on its spot 0.9 s later. */
function shatterWatch(c: BossController): void {
  const st = frostState(c);
  const alive = c.adds('pillar');
  const ids = new Set(alive.map((e) => e.id));
  for (const p of st.pillars) {
    if (ids.has(p.id)) continue;
    c.shape({
      shape: { type: 'circle', radius: 2.6 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: 0.9, coef: 1.0, type: 'frost', telegraph: true,
      statuses: [{ status: 'chill', duration: 4, stacks: 1 }], vfxOnLand: 'frost_burst', name: 'Buz Kırığı',
    });
    bossFx('frost_burst', p.x, p.z, { scale: 1.3 });
  }
  st.pillars = alive.map((e) => ({ id: e.id, x: e.position.x, z: e.position.z }));
}

const ulu: BossScript = {
  abilities: {
    /** Toynak Sarsıntısı: frontal cone 9 m / 110 deg (coef 2.2, one Yer Çatlağı stack on the tank), then three rings roll out 0.6 s apart. */
    ulu_boz_hoof: {
      start(c, b) {
        const e = c.e;
        const x = e.position.x, z = e.position.z;
        const t = busyTarget(c, b) ?? c.nearestPlayer();
        const ang = t ? angleTo(x, z, t.position.x, t.position.z) : e.yaw;
        b.data.ang = ang;
        wedge(c, x, z, ang, 9, 110, b.delay, 2.2, { name: 'Toynak Sarsıntısı', statuses: [{ status: 'earth_fracture', duration: 10, stacks: 1 }] });
        for (let k = 0; k < 3; k++) ring(c, x, z, 3 + k * 4, 5 + k * 4, b.delay + k * 0.6, 1.4, { name: 'Sarsıntı Halkası' });
        floatOver(e, 'TOYNAK!', 1);
      },
      resolve(c) {
        bossFx('shockwave', c.e.position.x, c.e.position.z, { scale: 2.4, dur: 1.2, color: 0xe0c080 });
        G.events.emit('camera:shake', { intensity: 0.35, duration: 0.4 });
      },
    },

    /** Toz Fırtınası: a 20 s arena-wide sandstorm from the west. Every 1.5 s each player outside cover takes a small hit. */
    ulu_boz_storm: {
      start(c) {
        floatOver(c.e, 'TOZ FIRTINASI!', 1);
        c.yell('Rüzgâr batıdan esiyor! Kayaların arkasına sığının!');
      },
      resolve(c) {
        c.state.dust = { until: c.world.time + DUST_DUR, next: c.world.time } as DustState;
        G.events.emit('camera:shake', { intensity: 0.3, duration: 0.5 });
      },
    },

    /** Öfke Hücumu (20 %): four Bozkır Kurdu adds, then a charge along the line to the farthest player (knockdown 1 s). */
    ulu_boz_enrage: {
      start(c, b) {
        const e = c.e;
        const ex = e.position.x, ez = e.position.z;
        c.spawnAdds('kb_kurt', 4, { radius: 8, tag: 'add' });
        const t = farthestPlayer(c, ex, ez) ?? busyTarget(c, b) ?? c.nearestPlayer();
        const tx = t ? t.position.x : ex, tz = t ? t.position.z : ez;
        const ang = angleTo(ex, ez, tx, tz);
        const len = Math.min(30, Math.hypot(tx - ex, tz - ez) + 2);
        b.data.ang = ang;
        b.data.len = len;
        b.data.leap = false;
        dashLine(c, ex, ez, ang, len, 4, b.delay, 18, 2.6, { name: 'Öfke Hücumu', statuses: [{ status: 'knockdown', duration: 1 }] });
        floatOver(e, 'ÖFKE!', 1);
        bossFx('add_spawn', ex, ez, { scale: 1.6 });
      },
      tick(c, b, _dt, t) {
        if (b.data.leap || t < b.delay) return;
        b.data.leap = true;
        const ang = b.data.ang as number, len = b.data.len as number;
        c.dash(Math.sin(ang), Math.cos(ang), len, len / 18);
        c.e.playShot('Charge', 1.3, { fade: 0.04 });
      },
    },
  },
  onPhase(c, _phase, index) {
    if (index >= 1 && !c.state.cover) {
      c.state.cover = true;
      for (const p of ULU_ROCKS) spawnMech(c, 'ulu_kaya', walkable(c, c.at(p.x, p.z)), { tag: 'rock' });
      for (const p of ULU_TOTEMS) spawnMech(c, 'ulu_totem', walkable(c, c.at(p.x, p.z)), { tag: 'totem' });
      bossFx('shockwave', c.e.position.x, c.e.position.z, { scale: 2, dur: 1.5, color: 0xd8b070 });
    }
  },
  update(c) {
    dustUpdate(c);
  },
};

const zemheri: BossScript = {
  abilities: {
    /** Buz Nefesi: cone 16 m / 75 deg toward the target (coef 2.6, chill). The ice pillars cut their shadow out of it. */
    zemheri_breath: {
      start(c, b) {
        const e = c.e;
        const t = busyTarget(c, b) ?? c.nearestPlayer();
        const ang = t ? angleTo(e.position.x, e.position.z, t.position.x, t.position.z) : e.yaw;
        b.data.ang = ang;
        losFan(c, {
          x: e.position.x, z: e.position.z, center: ang, arc: 75, range: 16, blockers: pillarsOf(c, 'pillar'), delay: b.delay, coef: 2.6,
          type: 'frost', name: 'Buz Nefesi', statuses: [{ status: 'chill', duration: 6, stacks: 1 }],
        });
        floatOver(e, 'BUZ NEFESİ!', 1);
      },
      resolve(c) {
        bossFx('frost_burst', c.e.position.x, c.e.position.z, { scale: 1.2 });
      },
    },

    /** Kar Fırtınası: three frost zones (r 4.5 m, 9 s) on random players after a 1.4 s telegraph. Stand still inside: Donma builds. */
    zemheri_storm: {
      start(c, b) {
        const st = frostState(c);
        const ps = pickPlayers(c, 3);
        const pts: Pt[] = ps.length ? ps.map((p) => ({ x: p.position.x, z: p.position.z })) : [c.randomPoint(4)];
        for (const p of pts) {
          c.shape({
            shape: { type: 'circle', radius: STORM_ZONE_R }, x: p.x, z: p.z, dx: 0, dz: 1, delay: b.delay, coef: 0.35, type: 'frost', telegraph: true,
            persist: { duration: STORM_DUR, tick: 1 }, vfxOnLand: 'frost_nova', name: 'Kar Fırtınası',
          });
          st.zones.push({ x: p.x, z: p.z, r: STORM_ZONE_R, until: c.world.time + b.delay + STORM_DUR });
        }
        floatOver(c.e, 'KAR FIRTINASI!', 1);
        c.yell('Kar başlıyor! Hareket edin ya da donun!');
      },
    },

    /** Buz Çağrısı: tops the spirit count up to six. The spirits walk at the boss; the players must kill them first. */
    zemheri_spirits: {
      start(c) {
        floatOver(c.e, 'BUZ RUHLARI!', 1);
      },
      resolve(c) {
        const want = RUH_CAP - c.adds('ruh').length;
        if (want > 0) summonRuh(c, Math.min(want, 4));
      },
    },

    /** Mutlak Sıfır (25 %): a 4.5 s channel, then a full-circle frost blast (coef 3.0, freeze 2 s) that the pillars cut into shadows.
     *  Interrupting the channel stuns the boss and opens a vulnerable window. */
    zemheri_absolute: {
      start(c, b) {
        const e = c.e;
        floatOver(e, 'MUTLAK SIFIR!', 1);
        losFan(c, {
          x: e.position.x, z: e.position.z, center: 0, arc: 360, range: 30, blockers: pillarsOf(c, 'pillar'), delay: b.delay, coef: 3.0,
          type: 'frost', name: 'Mutlak Sıfır', statuses: [{ status: 'freeze', duration: 2 }],
        });
      },
      abort(c, _b, reason) {
        if (c.inReset || reason === 'death' || reason === 'external') return;
        c.stagger(3, 1.5, 6, 'KESİLDİ!');
      },
    },
  },
  onEngage(c) {
    for (const p of ZEM_PILLARS) spawnMech(c, 'proc_ice_pillar', walkable(c, c.at(p.x, p.z)), { hpMult: 3, tag: 'pillar' });
  },
  onPhase(c, _phase, index) {
    const st = frostState(c);
    if (index >= 1 && !st.ruhSummoned) {
      st.ruhSummoned = true;
      summonRuh(c, RUH_CAP);
    }
  },
  update(c, dt) {
    donmaUpdate(c, dt);
    ruhUpdate(c, dt);
    shatterWatch(c);
  },
};

export const WORLD_STEPPE_SCRIPTS: Record<string, BossScript> = {
  wb_ulu_boz: ulu,
  wb_ad_zemheri: zemheri,
};

/** Extra enemy ids the two bosses spawn (asset preloading). */
export const WORLD_STEPPE_SPAWNS: Record<string, string[]> = {
  wb_ulu_boz: ['kb_kurt', 'ulu_kaya', 'ulu_totem'],
  wb_ad_zemheri: ['proc_ice_pillar', 'zemheri_ruh'],
};
