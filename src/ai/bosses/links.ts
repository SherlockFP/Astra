import { G } from '../../game/G';
import type { BossController } from '../BossController';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';

/**
 * Boss shields, health links, tethers and player links (P-36). Host-only; `tickLinks(c, dt)` runs every boss frame from
 * BossController.tick. State lives in `c.state` (cleared on boss reset).
 * OWNER: enemies module.
 */

const LINK_KEY = '__links';

/** Shared-HP group: all bodies follow one fraction; one death kills the group. */
export interface HealthGroup {
  bodies: Enemy[];
  /** Shared HP fraction (0..1). */
  frac: number;
}

interface Tether {
  player: Player;
  entity: Enemy;
  left: number;
  touchR: number;
  onBreak?: () => void;
  onExpire?: () => void;
}

interface PlayerLink {
  pids: number[];
  r: number;
  coefBase: number;
  tick: number;
  timer: number;
  left: number;
  release: number;
}

interface LinkState {
  health: HealthGroup[];
  tethers: Tether[];
  players: PlayerLink[];
}

function linkState(c: BossController): LinkState {
  let s = c.state[LINK_KEY] as LinkState | undefined;
  if (!s) {
    s = { health: [], tethers: [], players: [] };
    c.state[LINK_KEY] = s;
  }
  return s;
}

/**
 * Boss shield: the `shield` status with magnitude = max HP x pct (absorbs damage until spent). `pct` 0 removes it.
 */
export function bossShield(c: BossController, pct: number): void {
  const e = c.e;
  if (pct <= 0) {
    e.statuses.remove('shield');
    return;
  }
  const amount = e.maxHp * pct;
  e.statuses.apply('shield', 9999, { magnitude: amount, sourceId: e.id, replicated: true });
  G.net?.broadcast('estatus', { targetId: e.id, status: 'shield', duration: 9999, stacks: 1 });
}

/** True while the boss shield is up. */
export function shieldUp(c: BossController): boolean {
  return c.e.statuses.has('shield');
}

/**
 * Shared HP: the bodies take the same HP fraction from now on. Damage to any body lowers all of them to that fraction; healing
 * raises the pool to the highest body. The first body to die kills the rest (G.combat.killEnemy). Returns the group.
 */
export function linkHealth(c: BossController, bodies: Enemy[]): HealthGroup {
  const list = bodies.filter((b) => !b.removed && !b.isDead);
  const frac = list.length ? Math.min(...list.map((b) => b.hpFrac)) : 0;
  const g: HealthGroup = { bodies: list, frac };
  linkState(c).health.push(g);
  return g;
}

/**
 * Tether: while `dur` runs, the player stays within `touchR` metres (default 12) of `entity`. Breaking the distance, or either
 * body dying, calls `onBreak`; running out of time calls `onExpire`.
 */
export function tether(
  c: BossController,
  player: Player,
  entity: Enemy,
  o: { dur: number; onBreak?: () => void; onExpire?: () => void; touchR?: number },
): void {
  linkState(c).tethers.push({ player, entity, left: o.dur, touchR: o.touchR ?? 12, onBreak: o.onBreak, onExpire: o.onExpire });
}

/**
 * Player link: the listed players are chained for `dur` seconds. Every `tick` seconds each linked player that stands more than
 * `r` metres from the group's centre takes a `coefBase` hit. If two linked players drift more than `release` metres apart
 * (default 18) the chain snaps. Fewer than two living members also ends it.
 */
export function linkPlayers(
  c: BossController,
  pids: number[],
  o: { r: number; coefBase: number; tick: number; dur: number; release?: number },
): void {
  linkState(c).players.push({ pids: [...pids], r: o.r, coefBase: o.coefBase, tick: o.tick, timer: o.tick, left: o.dur, release: o.release ?? 18 });
}

/** Advance every link (host). Called from BossController.tick. */
export function tickLinks(c: BossController, dt: number): void {
  const s = linkState(c);
  if (s.health.length) tickHealth(s.health);
  if (s.tethers.length) tickTethers(s.tethers, dt);
  if (s.players.length) tickPlayerLinks(c, s.players, dt);
}

function tickHealth(groups: HealthGroup[]): void {
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    g.bodies = g.bodies.filter((b) => !b.removed);
    const live = g.bodies.filter((b) => !b.isDead);
    if (live.length === 0) {
      groups.splice(i, 1);
      continue;
    }
    if (live.length === g.bodies.length) {
      // nobody dead: apply the pool change (damage lowers, healing raises), then mirror it onto every body
      const low = Math.min(...live.map((b) => b.hpFrac));
      const high = Math.max(...live.map((b) => b.hpFrac));
      if (low < g.frac) g.frac = low;
      else if (high > g.frac) g.frac = high;
      for (const b of live) {
        const want = Math.max(1, Math.round(g.frac * b.maxHp));
        if (b.hp !== want) b.hp = want;
      }
      continue;
    }
    // a body died: the group dies with it
    groups.splice(i, 1);
    for (const b of live) G.combat.killEnemy(b, null);
  }
}

function tickTethers(list: Tether[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    t.left -= dt;
    const dead = t.player.removed || t.player.isDead || t.entity.removed || t.entity.isDead;
    const far = !dead && Math.hypot(t.player.position.x - t.entity.position.x, t.player.position.z - t.entity.position.z) > t.touchR;
    if (dead || far) {
      list.splice(i, 1);
      t.onBreak?.();
      continue;
    }
    if (t.left <= 0) {
      list.splice(i, 1);
      t.onExpire?.();
    }
  }
}

function tickPlayerLinks(c: BossController, list: PlayerLink[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const L = list[i];
    L.left -= dt;
    L.timer -= dt;
    const members = c.world.players.filter((p) => L.pids.includes(p.id) && !p.removed && !p.isDead);
    if (L.left <= 0 || members.length < 2) {
      list.splice(i, 1);
      continue;
    }
    let snapped = false;
    for (let a = 0; a < members.length && !snapped; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const d = Math.hypot(members[a].position.x - members[b].position.x, members[a].position.z - members[b].position.z);
        if (d > L.release) {
          snapped = true;
          break;
        }
      }
    }
    if (snapped) {
      list.splice(i, 1);
      continue;
    }
    if (L.timer > 0) continue;
    L.timer = L.tick;
    let cx = 0, cz = 0;
    for (const p of members) {
      cx += p.position.x;
      cz += p.position.z;
    }
    cx /= members.length;
    cz /= members.length;
    for (const p of members) {
      if (Math.hypot(p.position.x - cx, p.position.z - cz) <= L.r) continue;
      c.shape({ shape: { type: 'circle', radius: 1 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 0, coef: L.coefBase, telegraph: false, type: 'arcane' });
    }
  }
}
