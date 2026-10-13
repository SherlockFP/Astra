import type { NetChannels } from '../../types/net';
import { TILE_SIZE, type DungeonDef, type WorldExtras, type WorldRegion } from '../../types/dungeons';
import type { World } from '../../world/World';
import type { BuiltDungeon } from '../../world/DungeonBuilder';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { DungeonParams } from '../scenes';
import { getEnemyDef } from '../../data/enemies';

/**
 * Shared helpers of the open-world runtime (GDD_OPENWORLD §1.5, §9.4). OWNER: scenes module (WP6).
 * Tile <-> metre conversion follows DungeonBuilder / DungeonScene: a tile centre is (t + 0.5) * TILE_SIZE.
 */

/** Tile coordinate -> world metres of the tile centre. */
export const tileToWorld = (c: number): number => (c + 0.5) * TILE_SIZE;
/** World metres -> tile index. */
export const worldToTile = (m: number): number => Math.floor(m / TILE_SIZE);

export interface Pt { x: number; z: number }

export const distM = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

export const nameOfDef = (defId: string): string => getEnemyDef(defId)?.name ?? defId;

/** `spawn` channel payload that re-creates a host enemy on a peer (explicit id). Used for late joiners. */
export function spawnPayloadOf(e: Enemy): NetChannels['spawn'] {
  return {
    id: e.id,
    defId: e.def.id,
    x: e.position.x,
    z: e.position.z,
    level: e.level,
    packId: e.packId,
    facing: e.yaw,
    tag: e.tag || undefined,
    hpFrac: e.hpFrac,
  };
}

/** Deterministic seed of one world map run (the same on every peer: it travels in DungeonParams). */
export const worldSeedOf = (dungeonId: string): number => {
  let h = 2166136261;
  for (let i = 0; i < dungeonId.length; i++) h = Math.imul(h ^ dungeonId.charCodeAt(i), 16777619);
  return (h >>> 0) || 1;
};

/**
 * Per-map context shared by every open-world director: the built map, the world, the region lookup and the host
 * announcement helper. Created once by WorldRuntime.
 */
export class WorldCtx {
  /** Set by WorldRuntime: broadcast an `ev:*` key on the 'gate' channel and apply it on this peer too. */
  ev: (key: string) => void = () => {};
  private readonly rects: { region: WorldRegion; x: number; z: number; w: number; h: number }[];

  constructor(
    readonly world: World,
    readonly built: BuiltDungeon,
    readonly def: DungeonDef,
    readonly ext: WorldExtras,
    readonly params: DungeonParams,
  ) {
    this.rects = ext.regions.map((region) => {
      const rc = def.rooms.find((r) => r.id === region.roomId)?.rect ?? { x: 0, z: 0, w: 0, h: 0 };
      return { region, x: rc.x, z: rc.z, w: rc.w, h: rc.h };
    });
  }

  get seed(): number {
    return this.params.seed;
  }

  regionAtTile(tx: number, tz: number): WorldRegion | null {
    for (const r of this.rects) if (tx >= r.x && tx < r.x + r.w && tz >= r.z && tz < r.z + r.h) return r.region;
    return null;
  }

  regionAt(x: number, z: number): WorldRegion | null {
    return this.regionAtTile(worldToTile(x), worldToTile(z));
  }

  regionById(id: string): WorldRegion | undefined {
    return this.ext.regions.find((r) => r.id === id);
  }

  /** Walkable point nearest to a tile centre (falls back to the raw centre). */
  snapTile(tx: number, tz: number, radius = 16): Pt {
    const x = tileToWorld(tx), z = tileToWorld(tz);
    return this.built.nav.nearestWalkable(x, z, radius) ?? { x, z };
  }

  snapWorld(x: number, z: number, radius = 12): Pt {
    return this.built.nav.nearestWalkable(x, z, radius) ?? { x, z };
  }

  /** Distance (m) from (x,z) to the nearest player entity of this world; Infinity when there is none. Dead players count. */
  nearestPlayerDist(x: number, z: number): number {
    let best = Infinity;
    for (const p of this.world.players) {
      if (p.removed) continue;
      const d = distM(p.position.x, p.position.z, x, z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Player entities that are not removed (dead ones included). */
  livePlayers(): Player[] {
    return this.world.players.filter((p) => !p.removed);
  }

  /** Live player entities within `r` metres of (x,z). */
  playersWithin(x: number, z: number, r: number): Player[] {
    return this.world.players.filter((p) => !p.removed && distM(p.position.x, p.position.z, x, z) <= r);
  }

  /** Enemies alive on this peer (host: the 240 cap of GDD §1.5). */
  aliveEnemies(): number {
    let n = 0;
    for (const e of this.world.enemies) if (!e.isDead && !e.removed) n++;
    return n;
  }
}

/** Keys of the `gate` channel used by the open world (GDD §9.4). */
export const EV = {
  metin: (spotId: string, what: 'on' | 'off' | 'dead') => `ev:metin:${spotId}:${what}`,
  rare: (rareId: string, what: 'up' | 'dead', spotIdx = 0) => `ev:rare:${rareId}:${what}${what === 'up' ? `:${spotIdx}` : ''}`,
  boss: (bossId: string, what: 'warn' | 'up' | 'dead', sec = 0) => `ev:boss:${bossId}:${what}${what === 'warn' ? `:${sec}` : ''}`,
  goblin: 'ev:goblin',
  champ: (entityId: number, mod: string) => `ev:champ:${entityId}:${mod}`,
} as const;
