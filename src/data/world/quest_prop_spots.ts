/**
 * Quest prop spots of the open world (scenes/world/WorldQuestProps.ts questPropSpots). OWNER: content module.
 *
 * Hand-placed spots for the interact / use props of the Sisli Vadi level 1-5 quests in region r1 (WoW quest hubs: a quest's objects lie
 * close to its giver or turn-in). Each quest objective has its own spots, so two quests never share a prop, and a spot is a tile
 * (1 tile = 4 m, tile centre) snapped to walkable ground by the runtime (ctx.snapTile). Counts: interact `count + 1` spots, use 1 spot.
 *
 * Rules (tools/content-check.mjs checks them, HARD errors):
 *  - every spot is within 150 m (centre to centre) of the quest's giver or turn-in NPC;
 *  - every spot is inside the quest's ring band: the ring of the spot (inner up to 132 m, middle up to 195 m, outer beyond, from the
 *    hub koy_gumusdere at (800, 140) m) holds a level that is within 1 level of the quest (the spawn band rule of the camps);
 *  - every spot snaps to ground the map start reaches (the nav the QA bot and the player use).
 * Coordinates are tiles (x, z).
 */
export const QUEST_PROP_SPOTS: Record<string, Record<string, [number, number][]>> = {
  // level 2 main quest: the altar of the kutsama stone, turn-in at the watch
  mq_03_balcik_temizligi: {
    qt_kutsama_tasi: [[197, 71]],
  },
  // level 4 side quest (giver: the watch, place r1_g053)
  sq_g_03_orumcek_aglari: {
    qo_sack: [[265, 55], [261, 59], [256, 62], [250, 62]],
  },
  // level 1 side quest (giver: the farm)
  sq_r1_k01_ambar_sicanlari: {
    qo_sack: [[218, 52], [213, 55], [207, 55], [202, 53], [197, 49], [195, 44]],
  },
  // level 2 side quest (giver: the headman)
  sq_r1_k02_balcik_avi: {
    qo_crystal: [[211, 39], [207, 43], [202, 46], [196, 46], [190, 44]],
  },
  // level 3 side quest (giver: the hunter)
  sq_r1_k03_goblin_yagmasi: {
    qo_banner: [[190, 50], [185, 48], [180, 44], [178, 39], [177, 33]],
  },
  // level 4 side quest (giver: the farm)
  sq_r1_k07_domuz_avi: {
    qo_banner: [[233, 47], [229, 55], [222, 62], [234, 37]],
  },
  // level 4 side quest (giver: the nun)
  sq_r1_c03_sifali_mantar: {
    qo_sack: [[233, 35], [227, 12], [232, 23], [236, 39], [230, 51]],
  },
  // level 5 side quest (giver: the watch)
  sq_r1_m01_keder_metinleri: {
    qo_crystal: [[245, 61], [254, 33], [259, 34], [264, 38]],
  },
};
