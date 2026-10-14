import type { DungeonTheme, FloorStyle, TileRect, WallStyle } from './dungeons';
import type { ArenaBracket } from './finder';

/**
 * GDD_PVP_FINDER §3.2.1 (PV-00): arena map definition and the params of one arena match.
 * Data (`src/data/arenas/*`) is owned by the content package; the match flow (src/scenes/arena/*) only reads these shapes.
 */
export interface ArenaDef {
  /** 'kirik_kemer' | 'kizil_halka' | 'buz_havuzu' */
  id: string;
  /** Turkish display name. */
  name: string;
  /** Which brackets may use this map. */
  brackets: ArenaBracket[];
  /** Tiles (TILE_SIZE = 4 m). */
  grid: { w: number; h: number };
  floor: FloorStyle;
  wall: WallStyle;
  theme: DungeonTheme;
  lightColor: number;
  /** Blocking rectangles (tiles), e.g. half-walls and cover blocks. */
  walls: TileRect[];
  /** Tile coordinates; block projectiles and ground AoE line of sight. */
  pillars: { pos: [number, number]; r: number }[];
  /** Tile coordinates, 3 entries each (1v1 uses index 0, 2v2 indices 0-1, 3v3 all). */
  spawns: { A: [number, number][]; B: [number, number][] };
  /** Closed during prep, opened when prep ends. */
  gates: { team: 'A' | 'B'; rect: TileRect }[];
  zones?: { kind: 'ice'; rect: TileRect }[];
}

export interface ArenaParams {
  arenaId: string;
  /** Match id (`mid`, 8 chars). */
  matchId: string;
  bracket: ArenaBracket;
  ranked: boolean;
  /** Peer ids (transport ids; the same ids are used in the lobby and in the game room). */
  teams: { A: string[]; B: string[] };
  seed: number;
  /** Team mean MMRs [A, B] the matcher used (append-only addition: the proposer fills it; the host echoes it in `arena {k:'result'}`). */
  mean?: [number, number];
}

/** Match phases (GDD §3.3.1). `loading` is the time between the scene request and the first prep tick. */
export type ArenaPhase = 'loading' | 'prep' | 'live' | 'round_end' | 'match_end';
