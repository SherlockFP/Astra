import { G } from '../game/G';
import { getDirector } from '../ai/EnemyDirector';
import type { EventScope } from '../core/EventBus';
import type { Enemy } from '../entities/Enemy';
import type { World } from '../world/World';
import type { PackDef } from '../types/dungeons';

interface DormantRec {
  id: string;
  x: number;
  z: number;
  r: number;
  done: boolean;
}

/**
 * Pack-level behaviour that the PackDef data asks for and the enemy defs alone cannot express (World system):
 *  - `dormant.wakeRadius`: the whole dormant pack (bone piles, coffins, eggs) bursts out when a living player gets within that many
 *    metres of the pack centre (host; `EnemyDirector.pullPack` wakes every member). Without it a def's own wakeRange (6 m) is all that
 *    would ever trigger them.
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
    this.dormant.push({ id: pk.id, x, z, r: Math.max(2, pk.dormant.wakeRadius), done: false });
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
      for (const p of this.world.players) {
        if (p.isDead || p.removed) continue;
        if (Math.hypot(p.position.x - rec.x, p.position.z - rec.z) <= rec.r) {
          dir.pullPack(ai, p);
          break;
        }
      }
    }
  }

  dispose(): void {
    this.ev.dispose();
    this.hidden.clear();
    this.dormant = [];
  }
}
