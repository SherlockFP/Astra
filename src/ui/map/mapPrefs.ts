/**
 * Per-viewer map preferences (localStorage, a convenience the game never reads): the tracking mode of the map and the minimap, the
 * minimap rotation (camera or north-up), and the player's own waypoint (a map click). Nothing here is game state.
 * OWNER: hud module (map rendering).
 */
import type { TrackMode } from './mapStyle';

const K_TRACK = 'efsun.map.track';
const K_ROT = 'efsun.minimap.rotate';
const K_WP = 'efsun.map.waypoint';

const TRACK_MODES: TrackMode[] = ['all', 'quest', 'off'];

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, val: string | null): void {
  try {
    if (val === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, val);
  } catch {
    /* storage blocked: the preference lasts the session only */
  }
}

let track: TrackMode | null = null;
export function getTrackMode(): TrackMode {
  if (track === null) {
    const v = read(K_TRACK) as TrackMode | null;
    track = v && TRACK_MODES.includes(v) ? v : 'all';
  }
  return track;
}
/** The next mode in the cycle (all -> quest -> off -> all). */
export function cycleTrackMode(): TrackMode {
  const i = TRACK_MODES.indexOf(getTrackMode());
  track = TRACK_MODES[(i + 1) % TRACK_MODES.length];
  write(K_TRACK, track);
  return track;
}

let north: boolean | null = null;
export function getNorthUp(): boolean {
  if (north === null) north = read(K_ROT) === 'north';
  return north;
}
export function toggleNorthUp(): boolean {
  north = !getNorthUp();
  write(K_ROT, north ? 'north' : 'camera');
  return north;
}

/** The player's waypoint: world metres in one zone. */
export interface MapWaypoint { zone: string; x: number; z: number }
let wp: MapWaypoint | null | undefined;
export function getWaypoint(zone: string): MapWaypoint | null {
  if (wp === undefined) {
    try {
      const raw = read(K_WP);
      wp = raw ? (JSON.parse(raw) as MapWaypoint) : null;
    } catch {
      wp = null;
    }
  }
  return wp && wp.zone === zone ? wp : null;
}
export function setWaypoint(zone: string, x: number, z: number): void {
  wp = { zone, x, z };
  write(K_WP, JSON.stringify(wp));
}
export function clearWaypoint(): void {
  wp = null;
  write(K_WP, null);
}
