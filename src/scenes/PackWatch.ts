import { G } from '../game/G';
import { getDirector } from '../ai/EnemyDirector';
import type { EventScope } from '../core/EventBus';
import type { Enemy } from '../entities/Enemy';
import type { World } from '../world/World';
import type { PackDef } from '../types/dungeons';

type DormantKind = NonNullable<PackDef['dormant']>['kind'];

interface DormantRec {
  id: string;
  x: number;
  z: number;
  r: number;
  kind: DormantKind;
  /** P-16 scripted wake: the pack wakes once every `cleared` pack is dead, plus `delay` seconds. */
  wakeWhen?: { cleared: string[]; delay: number };
  /** Builder clock when every `wakeWhen.cleared` pack was first seen dead (-1 until then). */
  clearedAt: number;
  /** The wake visuals ran (they run once, on the first pull). */
  woke: boolean;
  done: boolean;
}

/**
 * Pack-level behaviour that the PackDef data asks for and the enemy defs alone cannot express (World system):
 *  - `dormant.wakeRadius`: the whole dormant pack (bone piles, coffins, eggs) bursts out when a living player gets within that many
 *    metres of the pack centre (host; `EnemyDirector.pullPack` wakes every member). Without it a def's own wakeRange (6 m) is all that
 *    would ever trigger them.
 *  - `wakeWhen` (P-16): a pack with it ignores proximity; it wakes once every listed pack is dead (plus `delay` s), pulling the
 *    nearest living player. The wake bursts by kind: statue (grey bones), egg (shell burst, 0.3 shake), ceiling (landing, 0.2 shake).
 *  - `stealth`: members of a stealth pack whose def has no `ai.stealthReveal` of its own start at alpha 0.15 on every peer and are
 *    revealed (alpha 1 + smoke puff) when they aggro or take damage. Defs with `stealthReveal` run their own logic in the AI.
 * OWNER: scenes module.
 */
export class PackWatch {
  private dormant: DormantRec[] = [];
  private hidden = new Map<number, Enemy>();
  private ev: EventScope;
  private armed = false;
  private t = 0;
  /** Seconds since the watch was built (ticks every frame, host only); base of the wakeWhen delays. */
  private clock = 0;

  constructor(private world: World) {
    this.ev = G.events.scope();
    this.ev.on('enemy:aggro', (e) => this.reveal(e.enemyId));
    this.ev.on('damage', (e) => {
      if (this.hidden.size) this.reveal(e.targetId);
    });
  }

  /** Remember a dormant pack (tile-corner centre already converted to world metres). Armed later, once every member has spawned. */
  addDormant(pk: PackDef, x: number, z: number): void {
    if (!pk.dormant) return;
    const wakeWhen = pk.wakeWhen ? { cleared: [...pk.wakeWhen.cleared], delay: pk.wakeWhen.delay ?? 0 } : undefined;
    this.dormant.push({ id: pk.id, x, z, r: Math.max(2, pk.dormant.wakeRadius), kind: pk.dormant.kind, wakeWhen, clearedAt: -1, woke: false, done: false });
  }

  /** Start watching (call after the deterministic spawns finished). */
  arm(): void {
    this.armed = true;
  }

  /** Hide a stealth-pack member (unless its def runs its own stealth logic). */
  stealthify(e: Enemy): void {
    if (e.def.ai?.stealthReveal || e.isDead || e.removed) return;
    e.hidden = true;
    e.setAlpha(0.15, true);
    this.hidden.set(e.id, e);
  }

  private reveal(id: number): void {
    const e = this.hidden.get(id);
    if (!e) return;
    this.hidden.delete(id);
    if (e.removed) return;
    e.hidden = false;
    e.setAlpha(1);
    try {
      G.vfx.spawn('stealth_smoke', e.pointAt(0.4));
    } catch {
      /* optional */
    }
  }

  update(dt: number): void {
    if (!this.armed || !this.dormant.length || !G.net.isAuthority) return;
    this.clock += dt;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const dir = getDirector(this.world);
    for (const rec of this.dormant) {
      if (rec.done) continue;
      let lead: Enemy | null = null;
      for (const e of this.world.enemies) {
        if (e.packId === rec.id && e.dormant && !e.isDead && !e.removed) {
          lead = e;
          break;
        }
      }
      if (!lead) {
        rec.done = true; // everybody is awake (or dead)
        continue;
      }
      const ai = lead.ai;
      if (!ai) continue;
      const target = this.wakeTarget(rec);
      if (!target) continue;
      if (!rec.woke) {
        rec.woke = true;
        this.burst(rec);
      }
      dir.pullPack(ai, target);
    }
  }

  /** The player that wakes a dormant pack now, or null while it stays asleep. */
  private wakeTarget(rec: DormantRec): World['players'][number] | null {
    const living = this.world.players.filter((p) => !p.isDead && !p.removed);
    if (rec.wakeWhen) {
      if (rec.clearedAt < 0) {
        if (!rec.wakeWhen.cleared.every((pid) => !this.packAlive(pid))) return null;
        rec.clearedAt = this.clock;
      }
      if (this.clock - rec.clearedAt < rec.wakeWhen.delay) return null;
      let best: World['players'][number] | null = null;
      let bestD = Infinity;
      for (const p of living) {
        const d = Math.hypot(p.position.x - rec.x, p.position.z - rec.z);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    }
    for (const p of living) {
      if (Math.hypot(p.position.x - rec.x, p.position.z - rec.z) <= rec.r) return p;
    }
    return null;
  }

  private packAlive(pid: string): boolean {
    return this.world.enemies.some((e) => e.packId === pid && !e.isDead && !e.removed);
  }

  /** Wake visuals by dormant kind (the frozen statue pose and the egg prop swap belong to the scene and the enemy). */
  private burst(rec: DormantRec): void {
    const at: [number, number, number] = [rec.x, 0.8, rec.z];
    if (rec.kind === 'statue') {
      G.vfx.spawn('death_bones', at, { scale: 1.2 });
    } else if (rec.kind === 'egg') {
      G.vfx.spawn('egg_burst', at, { scale: 1.1 });
      G.events.emit('camera:shake', { intensity: 0.3, duration: 0.3 });
    } else if (rec.kind === 'ceiling') {
      G.vfx.spawn('leap_land', at, { scale: 1.2 });
      G.events.emit('camera:shake', { intensity: 0.2, duration: 0.3 });
    }
  }

  dispose(): void {
    this.ev.dispose();
    this.hidden.clear();
    this.dormant = [];
  }
}
