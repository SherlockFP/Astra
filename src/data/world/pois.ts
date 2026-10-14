import type {
  ChestSpotDef, EntranceDef, GatherFieldDef, HiddenAreaDef, MiniBossDef, RareSpawnDef, ShrineSpotDef, VistaDef, WaypointDef, WorldBossSched,
} from '../../types/dungeons';
import { LAYOUT } from './layout';

/**
 * Sisli Vadi points of interest (GDD_OPENWORLD §3.8, §5.1-5.8): waypoints, dungeon entrances, shrines, chests, cursed chests,
 * gathering fields, hidden areas, vistas, rares, mini-bosses, world boss schedules, the ghost boat. OWNER: content module.
 * Tile coordinates unless noted (types/dungeons.ts). Positions, counts and respawn timers come from the layout JSON.
 */

/** Waypoint -> village it stands in (the village's respawn point and teleporter). */
const VILLAGE_OF_WAYPOINT: Record<string, string> = {
  wp_gumusdere: 'koy_gumusdere',
  wp_kizilkaya: 'koy_kizilkaya',
  wp_son_ocak: 'kamp_son_ocak',
  wp_ciftlik: 'kamp_ciftlik',
  wp_kanyon: 'kamp_kanyon',
  wp_tarla_karakol: 'kamp_tarla_karakol',
  wp_gecit_karakol: 'kamp_gecit_karakol',
  wp_bataklik_konak: 'kamp_bataklik_konak',
};

export const WAYPOINTS: WaypointDef[] = LAYOUT.waypoints.map((w) => ({
  id: w.id, name: w.name, pos: w.pos, regionId: w.region, villageId: VILLAGE_OF_WAYPOINT[w.id],
}));

/** Dungeon entrances in the open world (§5.2). `look` picks the dressing (crypt door / lava mouth...). */
const ENTRANCE_LOOK: Record<string, EntranceDef['look']> = { ent_kemik_mahzeni: 'crypt', ent_kizil_dokumhane: 'forge' };
export const ENTRANCES: EntranceDef[] = LAYOUT.entrances.map((e) => ({
  id: e.id, name: e.name, dungeonId: e.dungeonId, pos: e.pos, facing: e.facing, minLevel: e.minLevel, regionId: e.region,
  look: ENTRANCE_LOOK[e.id] ?? 'cave',
}));

/** Shrines (§5.3): usable once per player, reusable after 20 min. */
export const SHRINES: ShrineSpotDef[] = LAYOUT.shrines.map((s) => ({ id: s.id, type: s.type as ShrineSpotDef['type'], regionId: s.region, pos: s.pos }));

/** Fixed treasure chests (§5.4): 30 min respawn per player. */
export const CHESTS: ChestSpotDef[] = LAYOUT.chests.map((c) => ({ id: c.id, kind: c.kind, regionId: c.region, pos: c.pos, respawnSec: 1800 }));

/** One Lanetli Sandık per region (§5.4, GDD_CONTENT §1.8). */
export const CURSED: { id: string; regionId: string; pos: [number, number] }[] = LAYOUT.cursedChests.map((c) => ({
  id: c.id, regionId: c.region, pos: c.pos,
}));

/** Gathering fields (§5.5). `radius` is in tiles (as the layout). Loot tables gather_<kind>_<region> are WP4's (loot.ts). */
export const GATHER: GatherFieldDef[] = LAYOUT.gatherFields.map((g) => ({
  id: g.id, kind: g.kind, regionId: g.region, center: g.center, radius: g.radiusTiles, count: g.count, respawnSec: g.respawnSec,
  lootTable: `gather_${g.kind}_${g.region}`,
}));

/** Hidden areas (§5.6): keşif XP 8% (Gölün Adası Mabedi 10%) and the rewards from the GDD table. */
const HIDDEN_REWARDS: Record<string, string[]> = {
  hd_r1: ['chest_wood', 'Gümüş Yele %50 şansla orada'],
  hd_r2: ['chest_iron', '2 Küçük Can İksiri'],
  hd_r3: ['chest_iron x2', 'Efsun Nesnesi %25'],
  hd_r4: ['Şifalı ot alanı (6)', 'chest_gold'],
  hd_r5: ['chest_gold', 'Ejderha Pulu x2'],
  hd_r6: ['shrine_greed', 'chest_gold x2'],
};
export const HIDDEN: HiddenAreaDef[] = LAYOUT.hiddenAreas.map((h) => ({
  id: h.id, name: h.name, regionId: h.region, pos: h.pos, radius: h.radiusTiles, xpPct: h.id === 'hd_r6' ? 10 : 8,
  rewards: HIDDEN_REWARDS[h.id] ?? [],
}));

/** Vistas (§5.8): first visit keşif XP 6%. */
export const VISTAS: VistaDef[] = LAYOUT.vistas.map((v) => ({ id: v.id, name: v.name, regionId: v.region, pos: v.pos, xpPct: 6 }));

/** Rares (§3.5, 28 on the 1600 m map): rare_* enemy defs (WP3) are copies of a base def; loot tables loot_rare_<name> (WP4). */
export const RARES: RareSpawnDef[] = LAYOUT.rares.map((r) => ({
  id: r.id, enemyId: r.id, level: r.level, spots: r.spots, respawnMin: r.respawnMin, announce: true,
  lootTable: `loot_rare_${r.id.replace(/^rare_/, '')}`,
}));

/** Mini-bosses (§3.6, 6): enemy ids mb_*, loot tables loot_mb_r1..r6 (WP4), respawn 20 min. */
export const MINIBOSSES: MiniBossDef[] = LAYOUT.minibosses.map((m) => ({
  id: m.id, enemyId: m.id, level: m.level, lair: m.lair, regionId: m.region, respawnMin: m.respawnMin, lootTable: m.loot,
}));

/**
 * World bosses (§3.8). Çürükkök: alive when the world starts (60 s grace), 15 min respawn, 30 s warning.
 * Alevkanat: first spawn 10 min after the start if a player of level 22+ has entered R5, 40 min respawn, two warnings.
 */
export const WORLD_BOSSES: WorldBossSched[] = [
  { bossId: 'wb_curukkok', firstSec: 60, respawnSec: 900, announceSec: [30], announceText: 'Çürükkök topraktan yükseliyor!' },
  {
    bossId: 'wb_alevkanat', firstSec: 600, respawnSec: 2400, announceSec: [120, 20], minLevelToStart: 22,
    announceText: "Ejder Yuvası'ndan alevler yükseliyor! Alevkanat uyanıyor.",
  },
];

/** Hayalet Kayık (§5.6): the ghost boat on the lake's east shore, reaching the island mabed (hd_r6). */
export const GHOST_BOAT = { id: 'hayalet_kayik', pos: [249.5, 215] as [number, number], island: [197.5, 205] as [number, number] };
