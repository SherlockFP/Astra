import { NPC } from '../../entities/NPC';
import { tileToWorld, type WorldCtx } from './util';

/**
 * Village NPCs of the open world (GDD_OPENWORLD §2.1): the same NPC entity as the town, placed from `VillageDef.npcs`
 * (metres relative to the village centre). Patrol loops are converted to world metres. Props and buildings are the world
 * builder's (WP5), non-NPC objects (boards, decor) are skipped here. Local entities: every peer spawns its own copy.
 * OWNER: scenes module.
 */
export async function spawnVillageNpcs(ctx: WorldCtx): Promise<number> {
  const jobs: Promise<void>[] = [];
  let count = 0;
  for (const v of ctx.ext.villages) {
    const cx = tileToWorld(v.center[0]), cz = tileToWorld(v.center[1]);
    for (const def of v.npcs) {
      if (def.decor || def.object) continue;
      const path = def.patrol?.path?.length ? def.patrol.path.map(([x, z]) => [cx + x, cz + z] as [number, number]) : null;
      const sx = path ? path[0][0] : cx + def.pos[0];
      const sz = path ? path[0][1] : cz + def.pos[2];
      const npcDef = path && def.patrol ? { ...def, patrol: { path, lap: def.patrol.lap } } : def;
      const e = new NPC(ctx.world.allocLocalId(), npcDef);
      e.position.set(sx, ctx.world.groundY(sx, sz), sz);
      count++;
      jobs.push(
        e.load().then(
          () => {
            ctx.world.add(e);
          },
          (err) => console.warn(`[village] NPC ${def.id} failed to load`, err),
        ),
      );
    }
  }
  await Promise.all(jobs);
  return count;
}
