import { G } from '../game/G';
import { yawFromDir } from '../core/utils';
import type { Actor } from '../entities/Actor';
import type { Enemy } from '../entities/Enemy';
import type { EnemyAbility } from '../types/enemies';
import type { Busy, EnemyAI } from './EnemyAI';
import { setAlphaAll } from './bossNet';
import { METIN_PASSIVES } from './metin';
import type { EntityId } from '../types/common';
import { attachTrashTargets } from './trash';

/**
 * Behaviour tables for abilities that are not plain "shape + damage": custom casts (raise dead, soul drain, blink...),
 * passives (frontal block, enrage thresholds, auras, fanatic stacks) and death effects. Looked up by ability id.
 * OWNER: enemies module.
 */
export interface CustomHandler {
  usable?(ai: EnemyAI, ab: EnemyAbility, target: Actor, dist: number): boolean;
  start?(ai: EnemyAI, b: Busy): void;
  resolve?(ai: EnemyAI, b: Busy): void;
  tick?(ai: EnemyAI, b: Busy, dt: number, t: number): void;
  end?(ai: EnemyAI, b: Busy): void;
  abort?(ai: EnemyAI, b: Busy, reason: string): void;
}

export interface PassiveHandler {
  init?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>): void;
  tick?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>, dt: number): void;
  onDamaged?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>, amount: number): void;
  onHp?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>): void;
  onAllyDied?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>, dead: Enemy): void;
  onDeath?(ai: EnemyAI, ab: EnemyAbility, st: Record<string, number>, killerId?: EntityId | null): void;
}

const lerpPos = (e: Enemy) => [e.position.x, e.position.y, e.position.z] as [number, number, number];

/** A dead enemy (corpse) within r of the AI that nobody ate / raised yet. */
export function corpseNear(ai: EnemyAI, r: number): Enemy | null {
  const e = ai.e;
  let best: Enemy | null = null;
  let bd = r;
  for (const o of ai.world.enemies) {
    if (!o.isDead || o.removed || o.tag === 'eaten' || o === e || o.def.id.startsWith('proc_')) continue;
    const d = Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/** Walkable point `dist` metres from (x,z) in the direction (dx,dz), trying a few turned directions. */
export function walkableToward(ai: EnemyAI, x: number, z: number, dx: number, dz: number, dist: number): { x: number; z: number } {
  const nav = ai.world.nav;
  const base = Math.atan2(dx, dz);
  for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4]) {
    for (const f of [1, 0.7, 0.45]) {
      const nx = x + Math.sin(base + turn) * dist * f, nz = z + Math.cos(base + turn) * dist * f;
      if (nav.isWalkable(nx, nz) && nav.lineOfSight(x, z, nx, nz)) return { x: nx, z: nz };
    }
  }
  return { x, z };
}

function teleport(ai: EnemyAI, x: number, z: number, vfx = true): void {
  const e = ai.e;
  if (vfx) G.vfx.spawn('blink', lerpPos(e));
  e.position.x = x;
  e.position.z = z;
  e.velocity.set(0, 0, 0);
  e.interp.clear();
  if (vfx) G.vfx.spawn('blink', lerpPos(e));
}

export const CUSTOM: Record<string, CustomHandler> = {
  // ---- Kemik Büyücüsü: raise up to 3 bone piles as skel_minion at 50% HP (or 2 rattlers when no pile is near) ----------
  skel_mage_raise: {
    resolve(ai) {
      const e = ai.e;
      const piles = ai.dir.pilesNear(e.position.x, e.position.z, 15).slice(0, 3);
      if (piles.length) {
        for (const p of piles) {
          G.vfx.spawn('shadow_burst', [p.x, 0.3, p.z]);
          ai.dir.claimPile(p);
          ai.spawnAdds('skel_minion', 1, { x: p.x, z: p.z, radius: 0.1, hpFrac: 0.5, positions: [{ x: p.x, z: p.z }] });
        }
      } else {
        ai.spawnAdds('skel_rattler', 2, { x: e.position.x, z: e.position.z, radius: 2.5 });
      }
      G.vfx.spawn('shadow_burst', lerpPos(e));
    },
  },

  // ---- Gulyabani: eat a corpse below 40% HP -----------------------------------------------------------------------
  crypt_ghoul_feast: {
    usable(ai) {
      return corpseNear(ai, 6) !== null;
    },
    start(ai, b) {
      const c = corpseNear(ai, 6);
      if (c) {
        c.tag = 'eaten';
        b.data.corpse = c.id;
      }
    },
    resolve(ai, b) {
      const e = ai.e;
      const heal = e.maxHp * (b.ab.healPct ?? 0.3);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      G.vfx.spawn('heal_burst', e.pointAt(0.5));
      G.vfx.spawn('poison_burst', e.pointAt(0.2));
      G.events.emit('heal', { targetId: e.id, sourceId: e.id, amount: Math.round(heal), pos: [e.position.x, e.position.y + e.height, e.position.z] });
      const c = ai.world.get<Enemy>(b.data.corpse as number);
      if (c && !c.removed) c.destroy();
    },
    abort(ai, b) {
      const c = ai.world.get<Enemy>(b.data.corpse as number);
      if (c) c.tag = '';
    },
  },

  // ---- Mahzen Hortlağı: Ruh Emme (channel on one player, heals itself for 300% of the damage) --------------------------
  crypt_wraith_drain: {
    start(_ai, b) {
      b.data.next = 0.5;
    },
    tick(ai, b, _dt, t) {
      const e = ai.e;
      const tgt = b.targetId != null ? ai.world.getActor(b.targetId) : null;
      if (!tgt || tgt.isDead) {
        ai.abortBusy('external');
        return;
      }
      const d = Math.hypot(tgt.position.x - e.position.x, tgt.position.z - e.position.z);
      if (d > 17 || !ai.world.nav.lineOfSight(e.position.x, e.position.z, tgt.position.x, tgt.position.z)) {
        ai.abortBusy('external');
        return;
      }
      ai.faceTo(tgt.position.x - e.position.x, tgt.position.z - e.position.z, 16, _dt);
      if (t >= (b.data.next as number) && t < b.delay) {
        b.data.next = (b.data.next as number) + (b.ab.params?.tick ?? 0.5);
        ai.shape({ shape: { type: 'circle', radius: 0.9 }, x: tgt.position.x, z: tgt.position.z, dx: 0, dz: 1, delay: 0.05, coef: b.ab.damage?.coef ?? 0.5, type: 'shadow', name: b.ab.name });
        const heal = ai.dmg(b.ab.damage?.coef ?? 0.5) * (b.ab.params?.healMult ?? 3);
        e.hp = Math.min(e.maxHp, e.hp + heal);
        G.vfx.spawn('chain_lightning', [e.position.x, e.position.y + e.height * 0.6, e.position.z], { target: [tgt.position.x, tgt.position.y + 1.2, tgt.position.z], color: 0xa060ff, duration: 0.5 });
        G.vfx.spawn('shadow_burst', [tgt.position.x, tgt.position.y + 1.1, tgt.position.z], { scale: 0.5 });
      }
    },
  },

  // ---- Gölge Suikastçısı: Duman Bombası (vanish 2 s, reappear behind a random player) ---------------------------------
  cult_assassin_smoke: {
    resolve(ai, b) {
      const e = ai.e;
      G.vfx.spawn('stealth_smoke', lerpPos(e));
      setAlphaAll(e.id, 0);
      b.total = b.delay + (b.ab.params?.vanish ?? 2);
      b.data.vanished = true;
    },
    end(ai, b) {
      const e = ai.e;
      if (!b.data.vanished) return;
      const ps = ai.players();
      if (ps.length) {
        const p = ps[Math.floor(Math.random() * ps.length)];
        const bx = p.position.x - Math.sin(p.yaw) * 1.7, bz = p.position.z - Math.cos(p.yaw) * 1.7;
        if (ai.world.nav.isWalkable(bx, bz)) teleport(ai, bx, bz, false);
        e.yaw = yawFromDir(p.position.x - e.position.x, p.position.z - e.position.z);
        ai.target = p;
        e.targetId = p.id;
        ai.addThreat(p.id, 50);
      }
      setAlphaAll(e.id, 1);
      G.vfx.spawn('stealth_smoke', lerpPos(e));
      ai.armAmbush();
    },
    abort(ai) {
      setAlphaAll(ai.e.id, 1);
    },
  },

  // ---- Boşluk İblisçiği: blink 8 m away when a player gets within 3 m -------------------------------------------------
  void_imp_hop: {
    resolve(ai, b) {
      const e = ai.e;
      const t = b.targetId != null ? ai.world.getActor(b.targetId) : null;
      let dx = -Math.sin(e.yaw), dz = -Math.cos(e.yaw);
      if (t) {
        dx = e.position.x - t.position.x;
        dz = e.position.z - t.position.z;
      }
      const p = walkableToward(ai, e.position.x, e.position.z, dx, dz, b.ab.params?.blink ?? 8);
      teleport(ai, p.x, p.z);
    },
  },

  // ---- Hazine Goblini: Kaçış Portalı -----------------------------------------------------------------------------------
  tg_portal: {
    resolve(ai) {
      const e = ai.e;
      G.vfx.spawn('portal_swirl', lerpPos(e), { duration: 1.2 });
      G.audio.play('portal_enter', { pos: lerpPos(e) });
      G.events.emit('ui:toast', { text: 'Hazine Goblini kaçtı!', kind: 'warning' });
      ai.e.escape();
    },
    abort(ai) {
      ai.delayEscape(5);
    },
  },
};

export const PASSIVES: Record<string, PassiveHandler> = {
  ...METIN_PASSIVES,
  bone_golem_armor: {
    onHp(ai, ab, st) {
      if (st.done || ai.e.hpFrac > (ab.params?.hpBelow ?? 0.5)) return;
      st.done = 1;
      const e = ai.e;
      const mag = e.maxHp * (ab.params?.shieldPct ?? 0.2);
      e.statuses.apply('shield', ab.params?.duration ?? 10, { magnitude: mag, sourceId: e.id });
      G.net?.broadcast('estatus', { targetId: e.id, status: 'shield', duration: ab.params?.duration ?? 10, stacks: 1 });
      G.vfx.spawn('shield_bubble', e.pointAt(0.5), { follow: e.model ?? e.object3d, duration: 2 });
    },
  },
  forge_demon_rage: {
    onHp(ai, ab, st) {
      if (st.done || ai.e.hpFrac > (ab.params?.hpBelow ?? 0.3)) return;
      st.done = 1;
      ai.atkMul *= 1 + (ab.params?.atkSpeed ?? 0.4);
      const e = ai.e;
      G.vfx.spawn('enrage_aura', e.pointAt(0.4), { follow: e.model ?? e.object3d, duration: 6 });
      G.vfx.spawn('boss_enrage', e.pointAt(0.5));
    },
  },
  yeti_chest: {
    onHp(ai, ab, st) {
      if (st.done || ai.e.hpFrac > (ab.params?.hpBelow ?? 0.5)) return;
      st.done = 1;
      const e = ai.e;
      const k = 1 + (ab.params?.damage ?? 0.3);
      ai.dmgMul *= k;
      G.vfx.spawn('enrage_aura', e.pointAt(0.4), { follow: e.model ?? e.object3d, duration: ab.params?.duration ?? 10 });
      G.audio.play('boss_roar', { pos: lerpPos(e), pitch: 1.2 });
      ai.schedule(ab.params?.duration ?? 10, () => {
        ai.dmgMul /= k;
      });
    },
  },
  frost_knight_aura: {
    init(_ai, _ab, st) {
      st.t = 0;
    },
    tick(ai, ab, st, dt) {
      if (!ai.aggroed || ai.e.isDead) return;
      st.t += dt;
      if (st.t < (ab.params?.interval ?? 2)) return;
      st.t = 0;
      const e = ai.e;
      ai.shape({
        shape: { type: 'circle', radius: ab.params?.radius ?? 6 }, x: e.position.x, z: e.position.z, dx: 0, dz: 1, delay: 0.02, damage: 0, type: 'frost',
        statuses: [{ status: 'chill', duration: 4, stacks: 1 }], follow: true, name: ab.name,
      });
    },
  },
  cult_acolyte_fanatic: {
    init(_ai, _ab, st) {
      st.stacks = 0;
    },
    onAllyDied(ai, ab, st, dead) {
      if (dead.team !== 'enemy' || dead.def.id.startsWith('proc_')) return;
      const e = ai.e;
      if (Math.hypot(dead.position.x - e.position.x, dead.position.z - e.position.z) > (ab.params?.radius ?? 10)) return;
      const max = ab.params?.maxStacks ?? 5;
      if (st.stacks >= max) {
        st.until = ai.now + (ab.params?.duration ?? 8);
        return;
      }
      st.stacks++;
      st.until = ai.now + (ab.params?.duration ?? 8);
      ai.dmgMul = 1 + (ab.params?.perStack ?? 0.1) * st.stacks;
      G.vfx.spawn('buff_aura', e.pointAt(0.5), { follow: e.model ?? e.object3d, duration: 1 });
      ai.schedule(ab.params?.duration ?? 8, () => {
        if (ai.now >= (st.until ?? 0) - 0.05) {
          st.stacks = 0;
          ai.dmgMul = 1;
        }
      });
    },
  },
};

// P-25: per-dungeon trash tables (src/ai/trash) merge into these live records.
attachTrashTargets(CUSTOM, PASSIVES);

/** Death effects (abilities flagged `onDeath`): splits, spore clouds, nova flashes, meltdowns, radial shards. */
export function runOnDeath(ai: EnemyAI, ab: EnemyAbility): void {
  const e = ai.e;
  const x = e.position.x, z = e.position.z;
  const p = ab.params ?? {};
  switch (ab.kind) {
    case 'summon':
      if (ab.summon) ai.spawnAdds(ab.summon.enemyId, ab.summon.count, { x, z, radius: 1.6 });
      G.vfx.spawn(ab.vfx ?? 'add_spawn', [x, 0.3, z]);
      return;
    case 'self_aoe':
    case 'ground_aoe': {
      const radius = ab.shape && ab.shape.type === 'circle' ? ab.shape.radius : 3;
      const type = ab.damage?.type ?? 'fire';
      const delay = Math.max(0.05, ab.windup);
      if (p.persist) {
        ai.shape({ shape: { type: 'circle', radius }, x, z, dx: 0, dz: 1, delay: delay, coef: ab.damage?.coef ?? 0.3, type, persist: { duration: p.persist, tick: p.tick ?? 0.5 }, vfxOnLand: ab.vfx, name: ab.name, statuses: ab.statuses });
      } else {
        ai.shape({ shape: { type: 'circle', radius }, x, z, dx: 0, dz: 1, delay, coef: ab.damage?.coef ?? 1, type, telegraph: delay >= 0.5, vfxOnLand: ab.vfx, name: ab.name, statuses: ab.statuses });
      }
      return;
    }
    case 'custom':
      if (p.lines && ab.shape && ab.shape.type === 'line') {
        const n = p.lines;
        const off = Math.random() * Math.PI;
        for (let i = 0; i < n; i++) {
          const a = off + (i / n) * Math.PI * 2;
          ai.shape({
            shape: ab.shape, x, z, dx: Math.sin(a), dz: Math.cos(a), delay: ab.windup, coef: ab.damage?.coef ?? 1, type: ab.damage?.type ?? 'frost', telegraph: true, name: ab.name,
          });
        }
        G.vfx.spawn(ab.vfx ?? 'frost_burst', [x, 0.6, z]);
      }
      return;
    default:
      return;
  }
}
