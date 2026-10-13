/**
 * Scene parameter contracts (passed to SceneManager.go()).
 * OWNER: scenes module (MenuScene, TownScene, DungeonScene, LoadingScene implement GameScene).
 */
export interface TownParams {
  /** Where to spawn: the plaza, in front of the M+ portal hall after a run, or just inside the south gate (back from the open world). */
  spawnAt?: 'default' | 'portal' | 'south';
  /** Show the end-of-run summary panel on arrival. */
  runSummary?: unknown;
}

/** Open world: where a party member appears when a world map (DungeonDef.world) is entered. */
export type WorldSpawn = { type: 'gate' | 'village' | 'waypoint' | 'entrance'; id: string };

export interface DungeonParams {
  dungeonId: string;
  difficulty: 'normal' | 'heroic' | 'mythic' | 'mythicplus';
  keyLevel: number;
  seed: number;
  /** Decided once by whoever starts the run (host) so every peer agrees across the weekly rollover. */
  affixes: import('../types/mythic').AffixId[];
  /** Enemy level for the whole run (normal: party average level; mythic/M+: GDD rule, e.g. 60). */
  enemyLevel: number;
  partySize: number;
  /** REAL peer id (G.net.selfId of the keystone owner; offline: G.net.selfId). Never ''. */
  keyOwner: string;
  /** Open world: where to appear when the dungeon def is an open-world map (default: its start point). */
  spawn?: WorldSpawn;
  /** Set by a world entrance: the exit portal of this dungeon sends the party back to that open-world spawn. */
  returnTo?: { dungeonId: string; spawn: WorldSpawn };
  /** GDD_ITEMS_V2 §5.2.7 (IT-00): house visit. Entity id (`CampMsg.o` / `HomeMsg.o` style) of the house owner; the interior shows their layout. */
  homeOwner?: number;
}
