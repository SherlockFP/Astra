import { G } from '../game/G';
import { VFX_IDS, type VfxId } from '../types/vfx';
import type { World } from '../world/World';
import type { EntityId } from '../types/common';
import type { StatusId } from '../types/skills';

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
        if (pullBlocked(p)) continue; // rooted: pulls do nothing (push still moves)
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
      case 'boss_energy':
        energyView = { v: num(d.v), max: num(d.max, energyView?.max ?? 0) };
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

// ---- K11 (P-31, P-38): boss energy, lock limit, pull gate. Pure logic, no three.js, so the smoke can run it headless. ----

/** Snapshot of the boss energy bar as last received (cyan second bar in the boss frame; UI reads it). */
let energyView: { v: number; max: number } | null = null;

/** The energy bar as last replicated to this peer (null when the boss has no energy). */
export function bossEnergyView(): { v: number; max: number } | null {
  return energyView;
}

/** Config subset of BossDef.energy (types/enemies.ts). */
export interface BossEnergyCfg {
  max: number;
  start?: number;
  regen?: number;           // per second; negative drains
  onFull?: string;          // BossScript hook name, called on the rising edge to max
  onEmpty?: string;         // BossScript hook name, called on the falling edge to 0
  costs?: Record<string, number>;
}

/**
 * Host-side energy bar. `step(dt)` regenerates (or drains) and replicates `boss_energy` every 0.25 s; `onFull` / `onEmpty`
 * fire once per crossing. `pause` freezes regen (scripted phases can hold the bar), `spend` pays an ability's `costs` entry.
 */
export class BossEnergy {
  readonly max: number;
  readonly start: number;
  readonly regen: number;
  private v: number;
  private paused = false;
  private sendT = 0;
  private wasFull = false;
  private wasEmpty = false;
  readonly cfg: BossEnergyCfg;
  private readonly fire: { full?: () => void; empty?: () => void };
  private readonly send: (v: number, max: number) => void;

  constructor(
    cfg: BossEnergyCfg,
    fire: { full?: () => void; empty?: () => void } = {},
    send: (v: number, max: number) => void = (v, max) => bossMsg('boss_energy', { v, max }),
  ) {
    this.cfg = cfg;
    this.fire = fire;
    this.send = send;
    this.max = Math.max(0, cfg.max);
    this.start = clampN(cfg.start ?? 0, 0, this.max);
    this.regen = cfg.regen ?? 0;
    this.v = this.start;
    this.syncEdges();
  }

  get value(): number {
    return this.v;
  }

  /** Set without firing hooks (scripts resetting the bar). */
  set(v: number): void {
    this.v = clampN(v, 0, this.max);
    this.syncEdges();
  }

  /** Add (or subtract) and fire the edge hooks. */
  add(d: number): void {
    this.v = clampN(this.v + d, 0, this.max);
    this.edges();
  }

  pause(on: boolean): void {
    this.paused = on;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  canPay(abilityId: string): boolean {
    return this.v >= (this.cfg.costs?.[abilityId] ?? 0);
  }

  /** Pay the ability's cost when affordable; abilities without a cost are always free. */
  spend(abilityId: string): boolean {
    const cost = this.cfg.costs?.[abilityId] ?? 0;
    if (cost <= 0) return true;
    if (this.v < cost) return false;
    this.add(-cost);
    return true;
  }

  /** Back to the start value, regen running again (boss reset). */
  reset(): void {
    this.paused = false;
    this.sendT = 0;
    this.set(this.start);
  }

  step(dt: number): void {
    if (!this.paused && this.regen !== 0) this.add(this.regen * dt);
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.25;
      this.send(Math.round(this.v), this.max);
    }
  }

  private edges(): void {
    if (this.v >= this.max) {
      if (!this.wasFull) {
        this.wasFull = true;
        this.fire.full?.();
      }
    } else this.wasFull = false;
    if (this.v <= 0) {
      if (!this.wasEmpty) {
        this.wasEmpty = true;
        this.fire.empty?.();
      }
    } else this.wasEmpty = false;
  }

  private syncEdges(): void {
    this.wasFull = this.v >= this.max;
    this.wasEmpty = this.v <= 0;
  }
}

function clampN(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** True when a mechanic phase has been locked for longer than `limit` seconds (BossScript.lockLimit, default 150 s). */
export function lockExpired(lockedAt: number, fightT: number, limit = 150): boolean {
  return fightT - lockedAt > limit;
}

/** A rooted player ignores pull forces (boss_pull, ForceSystem). */
export function pullBlocked(p: { statuses: { has(id: StatusId): boolean } }): boolean {
  return p.statuses.has('root');
}

/** Fade an enemy in / out on every peer (Gölge Adımı, Duman Bombası). */
export function setAlphaAll(id: EntityId, a: number, instant = false): void {
  bossMsg('boss_alpha', { a, i: instant ? 1 : 0 }, { targetId: id });
}
