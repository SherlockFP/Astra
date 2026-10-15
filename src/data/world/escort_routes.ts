/**
 * Escort routes of the open world (WoW escort rules, scenes/world/WorldQuestProps.ts). OWNER: content module.
 *
 * Rules (tools/content-check.mjs checks them, HARD errors):
 *  - the route stays inside the quest's level ring (Sisli Vadi: level 1-2 inside 132 m of the ring hub koy_gumusdere, level 3 inside 195 m,
 *    level 4-5 beyond); the hub is (800, 140) m;
 *  - every segment between two waypoints has a nav path (NavGrid, the escort walks it, never a straight line through obstacles);
 *    the route is at most 180 m long in total along those nav paths (the protection timer of a 90 s quest is 180 m of walking at 2 m/s);
 *  - the route never passes within 25 m (edge to edge) of a camp or patrol 2 or more levels above the quest;
 *  - every ambush wave fires at a waypoint in `triggers` (first arrival) and has 1-2 ambushers of the quest's level;
 *  - the escort NPC has `hp`, takes `attackerDps` per ambusher in contact and regenerates `regen` HP/s between waves.
 * Coordinates are world metres (x, z); the runtime snaps each waypoint to the nearest walkable ground within 6 m, then routes each
 * segment on the nav grid (WorldQuestProps.escortRoute). `triggers` are waypoint indices, not nav indices.
 */

export interface EscortRoute {
  /** Quest id (data/world/quests.ts or quests_variety.ts) whose escort objective walks this route. */
  quest: string;
  /** Waypoints in world metres; route[0] is where the NPC starts, the last one is where it stops. */
  route: [number, number][];
  /** Waypoint indices where an ambush wave fires (first arrival only). */
  triggers: number[];
  /** Enemy def of the ambushers (spawned at the quest level). */
  ambushDef: string;
  /** Ambushers per wave (1-2). */
  waveSize: number;
  /** Max HP of the escort NPC. */
  hp: number;
  /** HP lost per second per ambusher in contact with the NPC. */
  attackerDps: number;
  /** HP regenerated per second while no ambusher is alive. */
  regen: number;
}

export const ESCORT_ROUTES: Record<string, EscortRoute> = {
  // mq_04 (level 2, 90 s, three waves): from the south-west road into the village, 144 m
  mq_04_samani_sustur: {
    quest: 'mq_04_samani_sustur',
    route: [[777, 245], [770, 207], [802, 188], [829, 161], [800, 154]],
    triggers: [1, 2, 3],
    ambushDef: 'ow_goblin',
    waveSize: 2,
    hp: 180,
    attackerDps: 4,
    regen: 5,
  },
  // sq_r1_ch02_gozcu_avi (level 2, 40 s, one wave): the same road, shorter, 70 m
  sq_r1_ch02_gozcu_avi: {
    quest: 'sq_r1_ch02_gozcu_avi',
    route: [[779, 232], [782, 199], [799, 166]],
    triggers: [1],
    ambushDef: 'ow_goblin',
    waveSize: 2,
    hp: 150,
    attackerDps: 4,
    regen: 5,
  },
};
