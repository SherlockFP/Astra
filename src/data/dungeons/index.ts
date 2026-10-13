import type { DungeonDef } from '../../types/dungeons';
import { KEMIK_MAHZENI } from './kemik_mahzeni';
import { KIZIL_DOKUMHANE } from './kizil_dokumhane';
import { BUZUL_TAHTI } from './buzul_tahti';
import { GOLGE_TAPINAGI } from './golge_tapinagi';
import { SISLI_KORU } from './sisli_koru';
import { SISLI_VADI } from '../world/sisli_vadi';
import { TASKASA } from './taskasa';
import { PERI_SISLERI } from './peri_sisleri';
import { YILDIZ_DIVANI } from './yildiz_divani';
import { YIGITLER_SARAYI } from './yigitler_sarayi';
import { LES_UYANISI } from './les_uyanisi';
import { KEFARET_SALONLARI } from './kefaret_salonlari';
import { YANKI_AGI } from './yanki_agi';
import { BUYUCU_TERASI } from './buyucu_terasi';

/** OWNER: content module. One file per dungeon in this folder, registered here. */
export const DUNGEONS: Record<string, DungeonDef> = {
  [KEMIK_MAHZENI.id]: KEMIK_MAHZENI,
  [KIZIL_DOKUMHANE.id]: KIZIL_DOKUMHANE,
  [BUZUL_TAHTI.id]: BUZUL_TAHTI,
  [GOLGE_TAPINAGI.id]: GOLGE_TAPINAGI,
  // Mythic+ season dungeons: in DUNGEONS (keys, portals, content checks) but NOT in DUNGEON_IDS (levelling set).
  [TASKASA.id]: TASKASA,
  [PERI_SISLERI.id]: PERI_SISLERI,
  [YILDIZ_DIVANI.id]: YILDIZ_DIVANI,
  [YIGITLER_SARAYI.id]: YIGITLER_SARAYI,
  [LES_UYANISI.id]: LES_UYANISI,
  [KEFARET_SALONLARI.id]: KEFARET_SALONLARI,
  [YANKI_AGI.id]: YANKI_AGI,
  [BUYUCU_TERASI.id]: BUYUCU_TERASI,
};
/** Stable display / progression order (level 8 -> 52). */
export const DUNGEON_IDS: string[] = [KEMIK_MAHZENI.id, KIZIL_DOKUMHANE.id, BUZUL_TAHTI.id, GOLGE_TAPINAGI.id];

/**
 * Mythic+ season pool (P-05), rotation order. Keys, portals, Group Finder and leaderboards read this via MythicPlus.dungeonPool().
 * Empty until the 8 season dungeons land; while empty, MythicPlus.dungeonPool() falls back to DUNGEON_IDS.
 */
export const MPLUS_POOL: string[] = [
  YILDIZ_DIVANI.id, YIGITLER_SARAYI.id, LES_UYANISI.id, PERI_SISLERI.id, KEFARET_SALONLARI.id, YANKI_AGI.id, TASKASA.id, BUYUCU_TERASI.id,
]; // Mythic+ Season 1 pool (8/8)

/**
 * Open-world zones expressed as DungeonDef. Deliberately NOT part of DUNGEONS / DUNGEON_IDS: those drive the keystone UI,
 * portals and M+ scaling. Reach them with getDungeon(id) or OPEN_ZONES.
 * `sisli_koru` (outdoor zone, live until WP2) and `sisli_vadi` (open-world MAP with `world`, GDD_OPENWORLD §9.1; WP1 stub).
 */
export const OPEN_ZONES: Record<string, DungeonDef> = {
  [SISLI_KORU.id]: SISLI_KORU,
  [SISLI_VADI.id]: SISLI_VADI,
};
export const OPEN_ZONE_IDS: string[] = [SISLI_KORU.id, SISLI_VADI.id];

/**
 * Legacy zone id -> current id. The town's South Gate (data/town.ts `guney_kapisi`) leads to 'sisli_vadi' since WP2, so the old
 * 'sisli_koru' id (saves, scripts, the dev scene picker) resolves to the open-world map.
 */
export const LEGACY_ZONE_ALIASES: Record<string, string | undefined> = {
  sisli_koru: 'sisli_vadi',
};

/** Dungeon or open-world zone by id (legacy ids resolved through LEGACY_ZONE_ALIASES). */
export const getDungeon = (id: string): DungeonDef | undefined => {
  const key = LEGACY_ZONE_ALIASES[id] ?? id;
  return DUNGEONS[key] ?? OPEN_ZONES[key];
};
