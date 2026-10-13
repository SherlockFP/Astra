import { G } from '../../game/G';
import { Chest, Shrine, type ChestTier } from '../../entities/interactables';
import type { ChestSpotDef } from '../../types/dungeons';
import type { Rarity } from '../../types/common';
import { RNG, hashString } from '../../core/utils';
import type { WorldCtx } from './util';

/**
 * Open-world shrines (sh_*) and treasure chests (ch_*) of Sisli Vadi (GDD_OPENWORLD §5.3-5.4). OWNER: scenes module.
 *
 * - Shrines: the five buff shrines of the dungeons, placed from the layout. Each peer may use a shrine again after
 *   `SHRINE_COOLDOWN_SEC` (per player, not shared: nothing is broadcast).
 * - Chests: personal loot. Opening one rolls gold and item drops on this peer only (each player has its own copy, like the
 *   dungeon chests). The respawn timer is a save flag (`world.chest.<id>` = epoch ms when the chest closes again), so a relog
 *   keeps it; `update()` re-arms the chest when the timer ran out.
 * Both spawn without point lights (`noLight`): the map has many of them and the light budget belongs to the builder.
 */

/** Cooldown between two shrine uses on one peer (s). The GDD text says 20 min; the open-world brief asked for 2 min. */
export const SHRINE_COOLDOWN_SEC = 120;

interface ChestRec {
  chest: Chest | null;
  spot: ChestSpotDef;
  flag: string;
  /** Epoch ms when the chest closes again (0 = closed, or not opened yet). */
  respawnAt: number;
}

export class WorldPois {
  private readonly chests: ChestRec[] = [];
  private tick = 0;

  constructor(private readonly ctx: WorldCtx) {}

  /** Spawn every shrine and chest of the map (local entities; resolves when all are loaded). Never throws. */
  async place(): Promise<number> {
    const { ctx } = this;
    const world = ctx.world;
    const jobs: Promise<void>[] = [];
    let count = 0;

    for (const s of ctx.ext.shrines) {
      const pt = ctx.snapTile(s.pos[0], s.pos[1], 8);
      const shrine = new Shrine(world.allocLocalId(), { key: s.id, type: s.type, cooldownSec: SHRINE_COOLDOWN_SEC, noLight: true });
      shrine.position.set(pt.x, world.groundY(pt.x, pt.z), pt.z);
      shrine.object3d.rotation.y = new RNG(hashString(`${s.id}:yaw`)).next() * Math.PI * 2;
      count++;
      jobs.push(
        shrine.load().then(
          () => {
            world.add(shrine);
          },
          (err) => console.warn(`[world] shrine ${s.id} failed to load`, err),
        ),
      );
    }

    for (const c of ctx.ext.chests) {
      const pt = ctx.snapTile(c.pos[0], c.pos[1], 8);
      const flag = `world.chest.${c.id}`;
      const until = Number(G.character?.save.flags[flag] ?? 0) || 0;
      const opened = until > Date.now();
      const tier: ChestTier = c.kind === 'chest_gold' ? 'gold' : c.kind === 'chest_iron' ? 'iron' : 'wood';
      const rec: ChestRec = { chest: null, spot: c, flag, respawnAt: opened ? until : 0 };
      const chest = new Chest(world.allocLocalId(), {
        tier,
        startOpen: opened,
        noLight: true,
        sub: 'Vadi sandığı',
        emptyText: 'Sandık boş',
        onOpen: (ch, first) => {
          if (first) this.loot(rec, ch);
        },
      });
      rec.chest = chest;
      this.chests.push(rec);
      chest.position.set(pt.x, world.groundY(pt.x, pt.z), pt.z);
      chest.object3d.rotation.y = new RNG(hashString(`${c.id}:yaw`)).next() * Math.PI * 2;
      count++;
      jobs.push(
        chest.load().then(
          () => {
            world.add(chest);
          },
          (err) => console.warn(`[world] chest ${c.id} failed to load`, err),
        ),
      );
    }

    await Promise.all(jobs);
    return count;
  }

  /**
   * Personal reward of one opened chest (this peer's copy): gold, one item (chest_iron: 25 % a second, rarer one) and the
   * respawn timer. Wood: min Büyülü, iron: min Büyülü, gold: min Nadir (GDD_OPENWORLD §5.4).
   */
  private loot(rec: ChestRec, chest: Chest): void {
    const ch = G.character;
    if (!ch) return;
    rec.respawnAt = Date.now() + rec.spot.respawnSec * 1000;
    ch.save.flags[rec.flag] = rec.respawnAt;
    ch.persist();

    const lvl = ch.level;
    const pos = chest.position;
    const kind = rec.spot.kind;
    // item level = the region's middle level (GDD: "at region level"); the character level when the chest is off the map
    const region = this.ctx.regionAtTile(rec.spot.pos[0], rec.spot.pos[1]);
    const itemLevel = region ? Math.round((region.levels[0] + region.levels[1]) / 2) : lvl;
    G.loot.dropGold(Math.round((6 + lvl * 3.2) * 6 * 2), pos);
    try {
      const minRarity: Rarity = kind === 'chest_gold' ? 'rare' : 'uncommon';
      G.loot.dropItem(G.loot.rollItem({ itemLevel, classId: ch.classId, minRarity }), pos, { delay: 0.2 });
      if (kind === 'chest_iron' && new RNG(hashString(`${rec.flag}:${rec.respawnAt}`)).chance(0.25)) {
        G.loot.dropItem(G.loot.rollItem({ itemLevel, classId: ch.classId, minRarity: 'rare' }), pos, { delay: 0.4 });
      }
    } catch (e) {
      console.warn('[world] chest roll failed', e);
    }
  }

  /** Per frame: a chest whose respawn timer ran out closes again (checked once a second). */
  update(dt: number): void {
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 1;
    const now = Date.now();
    for (const r of this.chests) {
      if (r.chest && r.chest.opened && r.respawnAt > 0 && now >= r.respawnAt) {
        r.chest.reset();
        r.respawnAt = 0;
      }
    }
  }
}
