import { GatherNode } from '../../entities/interactables';
import { planField } from '../../systems/Professions';
import { tierOfLevels } from '../../data/professions';
import { RNG } from '../../core/utils';
import type { WorldCtx } from './util';

/**
 * Gather nodes of Sisli Vadi (GDD_LIFE §1.5, MVP): every layout `gatherFields` entry places its `count` nodes around its
 * centre (planField: deterministic from the field id and the map seed, so the whole party sees the same nodes). The node
 * type follows the region's level tier. Depletion is personal and handled by each GatherNode. OWNER: scenes module.
 */
export class WorldGather {
  constructor(private readonly ctx: WorldCtx) {}

  /** Spawn every gather node of the map (local entities; resolves when all are loaded). Never throws. */
  async place(): Promise<number> {
    const { ctx } = this;
    const world = ctx.world;
    const jobs: Promise<void>[] = [];
    let count = 0;
    for (const f of ctx.ext.gather ?? []) {
      const region = ctx.regionAtTile(f.center[0], f.center[1]);
      const tier = region ? tierOfLevels(region.levels) : 1;
      for (const n of planField(f, tier, ctx.seed)) {
        const node = new GatherNode(world.allocLocalId(), { key: n.key, type: n.type, rich: n.rich, respawnSec: f.respawnSec });
        const pt = ctx.snapTile(n.x, n.z, 6);
        node.position.set(pt.x, world.groundY(pt.x, pt.z), pt.z);
        node.object3d.rotation.y = new RNG(`${n.key}:yaw`).next() * Math.PI * 2;
        count++;
        jobs.push(
          node.load().then(
            () => {
              world.add(node);
            },
            (err) => console.warn(`[world] gather node ${n.key} failed to load`, err),
          ),
        );
      }
    }
    await Promise.all(jobs);
    return count;
  }
}
