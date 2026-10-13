import { G } from '../game/G';
import { VFX_IDS, type VfxId } from '../types/vfx';
import type { World } from '../world/World';
import type { EntityId } from '../types/common';

/**
 * Boss mechanics that need every peer to do something local (push / pull the local player, spawn a cosmetic effect, show floating
 * text, lift a boss off the floor). They ride the existing host-only 'affix' channel with `kind` values starting with `boss_`
 * (the mythic receiver ignores unknown kinds) so no new net channel is needed.
 *
 *   boss_push   data {dx, dz, speed, dur, x?, z?, r?}   wind: constant push of the local player (dodge i-frames ignore it)
 *   boss_pull   data {x, z, speed, dur, stop, r}         drag the local player toward (x,z) until `stop` metres away
 *   boss_fx     text = VfxId, data {x,y,z,s,dur,c,dx,dz,tx,ty,tz}, targetId = follow entity
 *   boss_text   text, data {x,y,z,k}                     floating text (k 0 crit/gold, 1 immune, 2 heal, 3 hurt)
 *   boss_hover  targetId, data {h}                        Enemy.hover (floating bosses)
 *   boss_toast  text, data {pid?}                         toast only for that player (all when pid missing)
 *   boss_revive targetId, data {f}                        Enemy.revive(hpFrac) (Diriltici champion)
 *   boss_alpha  targetId, data {a, i}                     Enemy.setAlpha (vanish / reappear, i=1 instant)
 *   boss_dmgwin targetId, data {dur, mult, arc?, back?}   Enemy.addDamageWindow (vulnerability / frontal block, every peer)
 *   boss_shake  data {i, d}                                camera shake
 *   boss_announce text, data {k}                          world:announce banner (k 0 metin, 1 boss, 2 rare)
 *
 * OWNER: enemies module. Senders run on the host (or offline) and apply locally through the same code path.
 */

export interface BossMsg {
  kind: string;
  targetId?: EntityId;
  data?: Record<string, number>;
  text?: string;
}

interface Force {
  kind: 'push' | 'pull';
  until: number;
  x: number; z: number;
  dx: number; dz: number;
  speed: number;
  stop: number;
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const VFX_SET: ReadonlySet<string> = new Set<string>(VFX_IDS);

class ForceSystem {
  readonly forces: Force[] = [];

  update(dt: number): void {
    if (!this.forces.length) return;
    const world = G.world;
    const p = world?.localPlayer;
    const now = world?.time ?? 0;
    for (let i = this.forces.length - 1; i >= 0; i--) if (now >= this.forces[i].until) this.forces.splice(i, 1);
    if (!world || !p || p.removed || p.isDead || !p.isLocal || p.forcedMove || p.statuses.invulnerable) return;
    let mx = 0, mz = 0;
    for (const f of this.forces) {
      if (f.kind === 'push') {
        mx += f.dx * f.speed;
        mz += f.dz * f.speed;
      } else {
        const dx = f.x - p.position.x, dz = f.z - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d <= f.stop) continue;
        const sp = Math.min(f.speed, (d - f.stop) / Math.max(dt, 1e-3));
        mx += (dx / d) * sp;
        mz += (dz / d) * sp;
      }
    }
    if (mx === 0 && mz === 0) return;
    p.position.x += mx * dt;
    p.position.z += mz * dt;
    world.nav.resolveCircle(p.position, p.radius);
  }
}

const systems = new WeakMap<World, ForceSystem>();

function forcesFor(world: World): ForceSystem {
  let s = systems.get(world);
  if (!s) {
    s = new ForceSystem();
    systems.set(world, s);
    world.addSystem(s);
  }
  return s;
}

/** Apply a boss message to this peer (called locally by senders and by the 'affix' receiver on clients). */
export function applyBossMsg(m: BossMsg): void {
  const world = G.world;
  if (!world || !m || typeof m.kind !== 'string') return;
  const d = m.data ?? {};
  try {
    switch (m.kind) {
      case 'boss_push': {
        const lp = world.localPlayer;
        if (!lp) return;
        const r = num(d.r);
        if (r > 0 && Math.hypot(lp.position.x - num(d.x), lp.position.z - num(d.z)) > r) return;
        const l = Math.hypot(num(d.dx), num(d.dz)) || 1;
        forcesFor(world).forces.push({ kind: 'push', until: world.time + Math.min(10, num(d.dur, 1)), x: 0, z: 0, dx: num(d.dx) / l, dz: num(d.dz) / l, speed: num(d.speed, 5), stop: 0 });
        return;
      }
      case 'boss_pull': {
        const lp = world.localPlayer;
        if (!lp) return;
        const r = num(d.r);
        if (r > 0 && Math.hypot(lp.position.x - num(d.x), lp.position.z - num(d.z)) > r) return;
        forcesFor(world).forces.push({ kind: 'pull', until: world.time + Math.min(10, num(d.dur, 1)), x: num(d.x), z: num(d.z), dx: 0, dz: 0, speed: num(d.speed, 6), stop: num(d.stop, 1.5) });
        return;
      }
      case 'boss_fx': {
        const id = m.text ?? '';
        if (!VFX_SET.has(id)) return;
        const ent = m.targetId != null ? world.get(m.targetId) : undefined;
        const opts: Record<string, unknown> = {};
        if (d.s) opts.scale = d.s;
        if (d.dur) opts.duration = d.dur;
        if (d.c) opts.color = d.c;
        if (d.dx !== undefined || d.dz !== undefined) opts.dir = [num(d.dx), 0, num(d.dz)];
        if (d.tx !== undefined) opts.target = [num(d.tx), num(d.ty, 1), num(d.tz)];
        if (ent) opts.follow = (ent as unknown as { model?: import('three').Object3D }).model ?? ent.object3d;
        G.vfx.spawn(id as VfxId, [num(d.x), num(d.y, 0.2), num(d.z)], opts);
        return;
      }
      case 'boss_text': {
        const kinds = ['crit', 'immune', 'heal', 'player_hurt'] as const;
        G.vfx.damageNumber([num(d.x), num(d.y, 2.4), num(d.z)], 0, kinds[Math.max(0, Math.min(3, Math.round(num(d.k))))], String(m.text ?? '').slice(0, 40));
        return;
      }
      case 'boss_hover': {
        const e = m.targetId != null ? (world.get(m.targetId) as unknown as { hover?: number } | undefined) : undefined;
        if (e) e.hover = num(d.h);
        return;
      }
      case 'boss_toast': {
        if (d.pid !== undefined && world.localPlayer?.id !== d.pid) return;
        G.events.emit('ui:toast', { text: String(m.text ?? '').slice(0, 80), kind: 'boss' });
        return;
      }
      case 'boss_revive': {
        const e = m.targetId != null ? (world.get(m.targetId) as unknown as { revive?: (f: number) => void } | undefined) : undefined;
        e?.revive?.(Math.max(0.05, Math.min(1, num(d.f, 0.5))));
        return;
      }
      case 'boss_alpha': {
        const e = m.targetId != null ? (world.get(m.targetId) as unknown as { setAlpha?: (a: number, instant?: boolean) => void } | undefined) : undefined;
        e?.setAlpha?.(num(d.a, 1), d.i > 0);
        return;
      }
      case 'boss_dmgwin': {
        const e = m.targetId != null ? (world.get(m.targetId) as unknown as { addDamageWindow?: (s: number, m: number, arc?: number, back?: number) => void } | undefined) : undefined;
        e?.addDamageWindow?.(Math.min(60, num(d.dur, 3)), num(d.mult, 1), d.arc ? num(d.arc) : undefined, num(d.back, 1));
        return;
      }
      case 'boss_shake':
        G.events.emit('camera:shake', { intensity: num(d.i, 0.2), duration: num(d.d, 0.3) });
        return;
      case 'boss_announce':
        // world banner on every peer (kind 0 metin, 1 boss, 2 rare)
        G.events.emit('world:announce', { text: m.text ?? '', kind: num(d.k) === 1 ? 'boss' : num(d.k) === 2 ? 'rare' : 'metin' });
        return;
      default:
        return;
    }
  } catch (err) {
    console.warn('[boss] message failed', m.kind, err);
  }
}

/** Host/offline: broadcast to every other peer and apply locally. */
export function bossMsg(kind: string, data: Record<string, number> = {}, opts: { text?: string; targetId?: EntityId } = {}): void {
  const m: BossMsg = { kind, data, text: opts.text, targetId: opts.targetId };
  try {
    if (G.net && G.net.isAuthority) G.net.broadcast('affix', m);
  } catch { /* offline */ }
  applyBossMsg(m);
}

/** Host/offline: deliver to the peer that owns player `playerId` only (the local player is handled directly). */
export function bossMsgTo(playerId: EntityId, kind: string, data: Record<string, number> = {}, opts: { text?: string } = {}): void {
  const m: BossMsg = { kind, data: { ...data, pid: playerId }, text: opts.text };
  const lp = G.world?.localPlayer;
  if (lp && lp.id === playerId) {
    applyBossMsg(m);
    return;
  }
  try {
    const peer = G.net?.peerOfEntity(playerId);
    if (peer) G.net.sendTo(peer, 'affix', m);
  } catch { /* ignore */ }
}

/** Cosmetic effect on every peer. */
export function bossFx(id: VfxId, x: number, z: number, o: { y?: number; scale?: number; dur?: number; color?: number; follow?: EntityId; dir?: [number, number]; to?: [number, number, number] } = {}): void {
  const data: Record<string, number> = { x, z, y: o.y ?? 0.2 };
  if (o.scale) data.s = o.scale;
  if (o.dur) data.dur = o.dur;
  if (o.color) data.c = o.color;
  if (o.dir) {
    data.dx = o.dir[0];
    data.dz = o.dir[1];
  }
  if (o.to) {
    data.tx = o.to[0];
    data.ty = o.to[1];
    data.tz = o.to[2];
  }
  bossMsg('boss_fx', data, { text: id, targetId: o.follow });
}

/** Floating text above a world point on every peer. */
export function bossText(text: string, x: number, y: number, z: number, k = 0): void {
  bossMsg('boss_text', { x, y, z, k }, { text });
}

let netFor: unknown = null;

/** Register the client-side receiver once per NetSession (called by EnemyFactory with the other enemies channels). */
export function registerBossNet(): void {
  const net = G.net;
  if (!net || netFor === net) return;
  netFor = net;
  net.on('affix', (m, from) => {
    try {
      if (net.isAuthority || from !== net.hostId || !m || typeof m.kind !== 'string' || !m.kind.startsWith('boss_')) return;
      applyBossMsg(m as BossMsg);
    } catch (err) {
      console.warn('[boss] receiver failed', err);
    }
  });
}

/** Fade an enemy in / out on every peer (Gölge Adımı, Duman Bombası). */
export function setAlphaAll(id: EntityId, a: number, instant = false): void {
  bossMsg('boss_alpha', { a, i: instant ? 1 : 0 }, { targetId: id });
}
