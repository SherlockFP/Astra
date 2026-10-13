import { G } from '../../game/G';
import { Waypoint } from '../../entities/interactables';
import type { WaypointDef } from '../../types/dungeons';
import { worldToTile, type Pt, type WorldCtx } from './util';

/**
 * Işınlanma Taşları (GDD_OPENWORLD §5.1, §2.6): the eleven fast-travel stones of Sisli Vadi. Walking within 6 m of a stone
 * discovers it (flag `world.wp.<id>`, +2% exploration XP, toast) and makes it the respawn point (flag `world.respawn`).
 * Travel happens only through a Işınlayıcı NPC (`travel()`), never from a bare stone. Fare and cooldown follow §2.6.
 * Local per peer: every peer discovers and respawns for its own character. OWNER: scenes module.
 */

/** Activation radius of a stone (m). */
const STONE_RADIUS = 6;
/** Exploration XP for a first discovery (% of xpToNext). */
const DISCOVERY_XP_PCT = 2;
/** Cooldown between two trips (s). */
const TRAVEL_COOLDOWN = 30;
/** Tiles per fare hop. */
const HOP_TILES = 60;
/** No travel while the local player was hit or hit something in the last seconds (Actor.combatTimer). */
const POST_COMBAT_LOCK_SEC = 5;

/** Fare of a trip (gold): `round(10 + 1.5 * level) * hops`, hops = min(4, 1 + floor(tiles / 60)). */
export function waypointFare(level: number, distTiles: number): number {
  const hops = Math.min(4, 1 + Math.floor(distTiles / HOP_TILES));
  return Math.round(10 + 1.5 * level) * hops;
}

export class WaypointNetwork {
  private readonly stones = new Map<string, Waypoint>();
  private lastTravelAt = -Infinity;

  constructor(private readonly ctx: WorldCtx, private readonly teleport: (x: number, z: number, yaw: number) => void) {}

  /** Discovered stones of this character (flags). */
  known(id: string): boolean {
    return G.character?.save.flags[`world.wp.${id}`] === true;
  }

  /** Spawn every stone (local entities; resolves when all are loaded). */
  async place(): Promise<number> {
    const { ctx } = this;
    const jobs: Promise<void>[] = [];
    for (const w of ctx.ext.waypoints) {
      const known = this.known(w.id);
      const pt = ctx.snapTile(w.pos[0], w.pos[1], 8);
      // always starts asleep: every approach re-sets this character's respawn point, the toast only once per character
      const stone = new Waypoint(ctx.world.allocLocalId(), {
        active: false,
        autoRadius: STONE_RADIUS,
        toast: known ? null : `Işınlanma Taşı keşfedildi: ${w.name}`,
        onActivate: () => this.discover(w),
      });
      stone.position.set(pt.x, ctx.world.groundY(pt.x, pt.z), pt.z);
      this.stones.set(w.id, stone);
      jobs.push(
        stone.load().then(
          () => {
            ctx.world.add(stone);
          },
          (err) => console.warn(`[waypoints] ${w.id} failed to load`, err),
        ),
      );
    }
    await Promise.all(jobs);
    return this.stones.size;
  }

  private discover(w: WaypointDef): void {
    const ch = G.character;
    if (!ch) return;
    const key = `world.wp.${w.id}`;
    const first = ch.save.flags[key] !== true;
    ch.save.flags[key] = true;
    ch.save.flags['world.respawn'] = w.id;
    ch.persist();
    if (first) {
      G.events.emit('waypoint:discovered', { id: w.id });
      try {
        G.progression.addExplorationXp(DISCOVERY_XP_PCT);
      } catch {
        /* progression not ready */
      }
    }
  }

  /** The respawn point of the last stone this character activated (world metres), or null. */
  respawnPoint(): Pt | null {
    const id = G.character?.save.flags['world.respawn'];
    if (typeof id !== 'string') return null;
    const w = this.ctx.ext.waypoints.find((x) => x.id === id);
    if (!w) return null;
    return this.ctx.snapTile(w.pos[0], w.pos[1], 8);
  }

  /** Destination of a stone for the travel panel: world point and the fare from `fromPos` (metres) at the local level. */
  quote(toId: string, fromPos: Pt): { id: string; name: string; cost: number } | null {
    const w = this.ctx.ext.waypoints.find((x) => x.id === toId);
    if (!w || !G.character) return null;
    const dist = Math.hypot(w.pos[0] - worldToTile(fromPos.x), w.pos[1] - worldToTile(fromPos.z));
    return { id: w.id, name: w.name, cost: waypointFare(G.character.level, dist) };
  }

  /**
   * Trip to a discovered stone: combat lock, cooldown, gold and the destination check, then the teleport. Returns the Turkish
   * message (empty when the trip started).
   */
  travel(toId: string, fromPos: Pt, now: number): string {
    const ch = G.character;
    if (!ch) return 'Karakter yok.';
    if (!this.known(toId)) return 'Bu taş henüz keşfedilmedi.';
    // no trips right after a fight: the local player must be out of combat for POST_COMBAT_LOCK_SEC (the caller toasts the text)
    const me = G.player;
    if (me && me.combatTimer < POST_COMBAT_LOCK_SEC) return 'Savaşta ışınlanamazsın';
    if (now - this.lastTravelAt < TRAVEL_COOLDOWN) return `Işınlanma için ${Math.ceil(TRAVEL_COOLDOWN - (now - this.lastTravelAt))} sn bekle.`;
    const q = this.quote(toId, fromPos);
    if (!q) return 'Hedef bulunamadı.';
    if (!ch.spendGold(q.cost)) return `Yetersiz altın (${q.cost} altın gerekli).`;
    const w = this.ctx.ext.waypoints.find((x) => x.id === toId);
    if (!w) return 'Hedef bulunamadı.';
    const pt = this.ctx.snapTile(w.pos[0], w.pos[1], 8);
    this.lastTravelAt = now;
    this.teleport(pt.x, pt.z, this.ctx.built.startYaw);
    G.events.emit('player:gold', { gold: ch.save.gold, delta: -q.cost });
    return '';
  }

  dispose(): void {
    this.stones.clear();
  }
}
