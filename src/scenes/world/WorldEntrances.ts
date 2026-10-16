import { G } from '../../game/G';
import { DungeonPortal } from '../../entities/interactables/Portal';
import { PLACED_ENTRANCE_DUNGEONS } from '../../data/world/entrances';
import type { VfxHandle } from '../../vfx/VFX';
import { tileToWorld, type WorldCtx } from './util';

/** Fog puff cadence at a gate (s) and the radius (m) around the player inside which a gate spawns its fog. */
const FOG_EVERY_SEC = 4;
const FOG_NEAR_M = 70;

/**
 * Physical dungeon gates of the open world (the layout entrances listed in PLACED_ENTRANCE_DUNGEONS, data/world/entrances.ts).
 * Each gate gets a glowing portal (the Zindan Bulucu door: interact opens the finder with that dungeon preselected) and a fog
 * cloud at the cave mouth that comes back every few seconds while a player is near. The cave dressing itself is placed by
 * WorldDecor. Pins on the map come from the entrance list (ui/map/worldPins.ts). OWNER: scenes module.
 */
export class WorldEntrances {
  private readonly portals: { x: number; z: number; fog: VfxHandle | null; fogAt: number }[] = [];
  private tick = 0;

  constructor(private readonly ctx: WorldCtx) {}

  /** Spawns the portal of every placed gate (local entities). Never throws; resolves with the number of gates. */
  async place(): Promise<number> {
    const { ctx } = this;
    const world = ctx.world;
    const jobs: Promise<void>[] = [];
    for (const e of ctx.ext.entrances) {
      if (!PLACED_ENTRANCE_DUNGEONS.includes(e.dungeonId)) continue;
      const x = tileToWorld(e.pos[0]), z = tileToWorld(e.pos[1]);
      const portal = new DungeonPortal(world.allocLocalId(), { dungeonId: e.dungeonId, name: e.name.replace(/ Girişi$/, '') });
      portal.position.set(x, world.groundY(x, z), z);
      portal.object3d.rotation.y = (e.facing * Math.PI) / 180;
      this.portals.push({ x, z, fog: null, fogAt: 0 });
      jobs.push(
        portal.load().then(
          () => {
            world.add(portal);
          },
          (err) => console.warn(`[world] entrance ${e.id} portal failed to load`, err),
        ),
      );
    }
    await Promise.all(jobs);
    return this.portals.length;
  }

  /** Per frame: the fog of each gate comes back every FOG_EVERY_SEC while a live player is within FOG_NEAR_M. */
  update(dt: number): void {
    if (!this.portals.length) return;
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 0.5;
    const now = Date.now();
    const players = this.ctx.livePlayers();
    for (const g of this.portals) {
      const near = players.some((p) => Math.hypot(p.position.x - g.x, p.position.z - g.z) < FOG_NEAR_M);
      if (!near || now < g.fogAt) continue;
      g.fogAt = now + FOG_EVERY_SEC * 1000;
      try {
        g.fog = G.vfx.spawn('smoke_zone', [g.x, this.ctx.world.groundY(g.x, g.z) + 0.2, g.z], { color: 0xc4d8d4, scale: 2.2 });
      } catch {
        g.fog = null;
      }
    }
  }
}
