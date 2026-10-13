import type { NationId } from './nations';

/**
 * KIZIL SINIR geometry (WP-07). PURE data shared by the zone definition (data/world/kizil_sinir.ts), the rules (systems/PvpRules.ts),
 * the runtime (systems/Pvp.ts) and the node sims. All positions are METRES in the zone's own frame (x east, z south), tile centres
 * are `(tile + 0.5) * 4`.
 *
 *            z = 0          ┌──────────────────────────────┐
 *                           │  GÖK KARTAL karargâhı (N)     │  base 1, safe box, graveyard
 *            z = 240 m      ├──────────────────────────────┤
 *                           │   ◄── 3 capture points ──►   │  Batı Kule · Kale Kalbi · Doğu Kule (the contested keep, centre)
 *                           │   neutral elite camps         │
 *            z = 960 m      ├──────────────────────────────┤
 *                           │  KIZIL KURT karargâhı (S)     │  base 2, safe box, graveyard
 *            z = 1200 m     └──────────────────────────────┘
 */

export const PVP_ZONE_ID = 'kizil_sinir';
export const PVP_ZONE_NAME = 'Kızıl Sınır';
/** Zone edge (m): 300 x 300 tiles. Above 800 m, so the chunk streamer carries the ground and the scenery. */
export const PVP_ZONE_M = 1200;
export const PVP_TILES = 300;
/** Entry gate: the character must be at least this level (town west gate; the runtime sends under-levelled arrivals back). */
export const PVP_MIN_LEVEL = 35;

const T = 4;
/** Tile coordinate -> metres of the tile centre. */
export const tileM = (t: number): number => (t + 0.5) * T;

export interface PvpBase {
  nation: NationId;
  name: string;
  /** Village id in the zone definition. */
  village: string;
  /** Centre tile (the VillageDef centre). */
  tile: [number, number];
  /** Centre in metres. */
  center: [number, number];
  /** Half extents (m) of the PvP safe box around the centre: nobody can be hurt by another player inside it. */
  safeHalf: [number, number];
  /** Spawn / graveyard (m). The dead of this nation come back here. */
  spawn: [number, number];
  /** Yaw (rad) of a fresh spawn, looking at the keep (forward = (sin yaw, cos yaw)). */
  yaw: number;
}

const mkBase = (nation: NationId, name: string, village: string, tile: [number, number], dz: number, yaw: number): PvpBase => {
  const center: [number, number] = [tileM(tile[0]), tileM(tile[1])];
  return { nation, name, village, tile, center, safeHalf: [64, 48], spawn: [center[0], center[1] + dz], yaw };
};

export const PVP_BASES: Record<NationId, PvpBase> = {
  gok_kartal: mkBase('gok_kartal', 'Gök Kartal Karargâhı', 'ks_gok_karargah', [150, 35], 16, 0),
  kizil_kurt: mkBase('kizil_kurt', 'Kızıl Kurt Karargâhı', 'ks_kizil_karargah', [150, 265], -16, Math.PI),
};

export interface CapturePointDef {
  id: string;
  name: string;
  /** Tile + metres of the centre. */
  tile: [number, number];
  x: number;
  z: number;
  /** Capture radius (m). */
  r: number;
}

const cp = (id: string, name: string, tx: number, tz: number): CapturePointDef => ({ id, name, tile: [tx, tz], x: tileM(tx), z: tileM(tz), r: 14 });

/** The contested keep: three points in a row across the centre, 44 m apart. */
export const CAPTURE_POINTS: CapturePointDef[] = [
  cp('ks_cp_bati', 'Batı Kule', 139, 150),
  cp('ks_cp_kalp', 'Kale Kalbi', 150, 150),
  cp('ks_cp_dogu', 'Doğu Kule', 161, 150),
];

/** Index of a nation in the wire arrays (0 = Gök Kartal, 1 = Kızıl Kurt). */
export const nationIdx = (n: NationId | null | undefined): 0 | 1 | -1 => (n === 'gok_kartal' ? 0 : n === 'kizil_kurt' ? 1 : -1);
export const nationAt = (i: number): NationId | null => (i === 0 ? 'gok_kartal' : i === 1 ? 'kizil_kurt' : null);

/** The nation whose base safe box contains (x, z), else null. */
export function baseAt(x: number, z: number): NationId | null {
  for (const b of Object.values(PVP_BASES)) {
    if (Math.abs(x - b.center[0]) <= b.safeHalf[0] && Math.abs(z - b.center[1]) <= b.safeHalf[1]) return b.nation;
  }
  return null;
}

/** Neutral elite camps: the NW quadrant (tiles); the other three are its mirror images in x and z, so both nations face the same map. */
export const PVP_CAMP_QUADRANT: { at: [number, number]; lv: [number, number]; members: [string, number][]; name: string }[] = [
  { at: [45, 95], lv: [35, 36], members: [['kb_golem', 3]], name: 'Kaya Golemleri' },
  { at: [85, 85], lv: [36, 37], members: [['kb_ork', 4], ['kb_ork_cellat', 2]], name: 'Sınır Orkları' },
  { at: [105, 125], lv: [37, 38], members: [['kb_sovalye', 2], ['kb_hortlak', 3]], name: 'Kurgan Muhafızları' },
  { at: [60, 130], lv: [36, 37], members: [['kb_gergedan', 3]], name: 'Gergedan Sürüsü' },
];

/** Mirror a tile of the NW quadrant: q 0 = as is, 1 = east, 2 = south, 3 = south-east. */
export const mirrorTile = (t: [number, number], q: number): [number, number] => [q & 1 ? PVP_TILES - t[0] : t[0], q & 2 ? PVP_TILES - t[1] : t[1]];
