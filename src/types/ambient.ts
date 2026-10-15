import type { TownNpc } from './dungeons';

/**
 * Ambient life of an open-world zone (GDD_OPENWORLD ambient pass): villagers and travellers on routines, cosmetic critters, deer
 * herds and ambient cues (chimney smoke, lit windows). PURE DATA: the content lives in src/data/world/<zone>_ambient.ts and the
 * runtime in scenes/world/AmbientLife.ts. Positions are WORLD metres (+x east, +z south) unless a field says relative.
 * Everything here is local to each peer (no network): the same seed gives the same critters on every client.
 */

/** One stop of a walking routine: the NPC stands `dwell` seconds (playing `clip` as a loop, else its idle) before it walks on. */
export interface AmbientStop {
  pos: [number, number];
  dwell?: number;
  clip?: string;
}

/**
 * Walking routine (TownNpc.routine): the stops are visited in order and the list closes back on the first one (a two-stop list is a
 * ping-pong). `speed` is walk speed in m/s between stops. Time is the world clock plus `phase` (s), so a walker that streams out and
 * back in stands where the routine says it should (scenes/world/AmbientLife.ts). `walk` = clip name candidate while walking
 * (default 'Walking_A' | 'Walk' | 'Run'). `cart` = model url of a cart pulled 2.6 m behind (travellers).
 */
export interface AmbientRoute {
  stops: AmbientStop[];
  speed: number;
  phase?: number;
  walk?: string;
  cart?: string;
}

/** Cosmetic critters: procedural or instanced meshes, no hitbox, no loot, no XP, never aggro. */
export type CritterKind = 'rabbit' | 'bird' | 'butterfly' | 'frog' | 'chicken';

/** A patch where critters of one kind live (rabbits by a field edge, butterflies in a flower meadow, frogs at a shore...). */
export interface AmbientCritterZone {
  id: string;
  kind: CritterKind;
  center: [number, number];
  radius: number;
  count: number;
}

/** A deer herd grazing in a safe meadow. Neutral: it only moves away from a player who comes close (it never attacks). */
export interface AmbientDeerHerd {
  id: string;
  center: [number, number];
  radius: number;
  count: number;
}

/** Chimney smoke at a point (world metres; y = height of the chimney top). */
export interface AmbientSmoke {
  pos: [number, number];
  y: number;
}

/** A lit window / torch: a warm glow billboard at the point (world metres, y = height). */
export interface AmbientGlow {
  pos: [number, number];
  y: number;
  kind?: 'window' | 'torch';
}

export interface AmbientDef {
  /** Walking NPCs on routines (routine set on each TownNpc; `pos` = the first stop). */
  npcs: TownNpc[];
  critters: AmbientCritterZone[];
  herds: AmbientDeerHerd[];
  smoke: AmbientSmoke[];
  glows: AmbientGlow[];
  /** Local budget per stream chunk (sanity cap for the critter spawner). */
  maxCritters?: number;
}
