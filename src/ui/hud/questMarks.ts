import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import { TILE_SIZE, type DungeonDef, type WorldExtras } from '../../types/dungeons';
import type { QuestKind, QuestObjective } from '../../types/quests';
import type { Enemy } from '../../entities/Enemy';

/**
 * Open-world lookups shared by the HUD (tracker, minimap), the map and the quest panels: region / village / waypoint positions
 * and the map targets of the active quests (GDD_OPENWORLD §5.9, §6.1). Everything is read-only and never throws.
 * OWNER: hud module (ui/hud). Points are WORLD METRES unless a name says tile.
 */

/** Sisli Vadi: the open-world map (GDD_OPENWORLD). */
export const WORLD_ZONE_ID = 'sisli_vadi';

/** Pinned quest for the HUD tracker: a per-viewer convenience (localStorage, never read by the game). */
const PIN_KEY = 'efsun.quest.pin';
export function getPinnedQuest(): string | null {
  try {
    return window.localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}
export function setPinnedQuest(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(PIN_KEY, id);
    else window.localStorage.removeItem(PIN_KEY);
  } catch {
    /* storage blocked */
  }
}

export interface Pt { x: number; z: number }

/** Quest target on the map (blue ring). */
export interface QuestMark extends Pt { questId: string; label: string; kind: QuestKind }
/** Quest giver marker over a village NPC: gold `!` (offer) or `?` (turn in). */
export interface QuestGiverMark extends Pt { npcId: string; kind: 'offer' | 'turnin' }

/** Tile centre (tile index -> metres). */
export const tileCentreM = (t: number): number => (t + 0.5) * TILE_SIZE;

/** True while the running scene is the open-world map (not town, not a dungeon). */
export function inWorldMap(): boolean {
  if (G.scenes?.current?.id !== 'dungeon') return false;
  const id = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId;
  return !!id && !!getDungeon(id)?.world;
}

/** The open-world map of the running scene (falls back to Sisli Vadi outside it, for names). Null when there is none. */
export function worldDef(): DungeonDef | null {
  try {
    const id = G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId;
    const live = id ? getDungeon(id) : undefined;
    if (live?.world) return live;
  } catch {
    /* mplus not ready */
  }
  const d = getDungeon(WORLD_ZONE_ID);
  return d?.world ? d : null;
}

export function worldExtras(): WorldExtras | null {
  return worldDef()?.world ?? null;
}

/** Discovered stone of this character (flag `world.wp.<id>`). */
export const waypointKnown = (id: string): boolean => G.character?.save.flags[`world.wp.${id}`] === true;
/** Region discovered (flag `world.region.<rid>`). */
export const regionKnown = (id: string): boolean => G.character?.save.flags[`world.region.${id}`] === true;

/** Centre of a region's room, world metres. */
export function regionCentre(regionId: string): Pt | null {
  const def = worldDef();
  const ext = def?.world;
  const r = ext?.regions.find((x) => x.id === regionId);
  const room = r && def?.rooms.find((x) => x.id === r.roomId);
  if (!room) return null;
  return { x: (room.rect.x + room.rect.w / 2) * TILE_SIZE, z: (room.rect.z + room.rect.h / 2) * TILE_SIZE };
}

/** World position of a village NPC (villages keep NPC positions in metres relative to the village centre). */
export function npcWorldPos(npcId: string): Pt | null {
  for (const v of worldExtras()?.villages ?? []) {
    const n = v.npcs.find((x) => x.id === npcId);
    if (n) return { x: tileCentreM(v.center[0]) + n.pos[0], z: tileCentreM(v.center[1]) + n.pos[2] };
  }
  return null;
}

/** World position of a named place (region, waypoint, vista, landmark, village, hidden area), or null. */
export function placeWorldPos(id: string): Pt | null {
  const ext = worldExtras();
  if (!ext) return null;
  const tile = (p: [number, number]): Pt => ({ x: tileCentreM(p[0]), z: tileCentreM(p[1]) });
  const reg = regionCentre(id);
  if (reg) return reg;
  const pos =
    ext.waypoints.find((x) => x.id === id)?.pos ??
    ext.vistas.find((x) => x.id === id)?.pos ??
    ext.landmarks.find((x) => x.id === id)?.pos ??
    ext.hidden.find((x) => x.id === id)?.pos ??
    ext.entrances.find((x) => x.id === id)?.pos;
  if (pos) return tile(pos);
  const v = ext.villages.find((x) => x.id === id);
  return v ? tile(v.center) : null;
}

/** Dungeon entrance on the map for a dungeon id (objective `dungeon`). */
export function entranceWorldPos(dungeonId: string): Pt | null {
  const e = worldExtras()?.entrances.find((x) => x.dungeonId === dungeonId);
  return e ? { x: tileCentreM(e.pos[0]), z: tileCentreM(e.pos[1]) } : null;
}

/** Nearest live enemy whose def id matches (ids of camp mobs, rares, bosses, metin stones). Null when none is alive. */
function nearestLiveEnemy(ids: string[]): Pt | null {
  const w = G.world;
  const p = G.player ?? w?.localPlayer;
  if (!w || !ids.length) return null;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (const e of w.enemies as Enemy[]) {
    if (e.isDead || e.removed || !e.def || !ids.includes(e.def.id)) continue;
    const d = p ? Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) : 0;
    if (d < bestD) {
      bestD = d;
      best = { x: e.position.x, z: e.position.z };
    }
  }
  return best;
}

/** Enemy ids a kill objective can match (its target id, or every metin stone for a metin objective). */
function killIds(o: QuestObjective): string[] {
  if (o.kind === 'metin') {
    const tiers = worldExtras()?.metin.tiers ?? [];
    if (!o.target) return tiers.map((t) => t.enemyId);
    const tier = tiers.find((t) => t.id === o.target);
    return tier ? [tier.enemyId] : [o.target];
  }
  return o.target ? [o.target] : [];
}

/** Where one unfinished objective points, or null when it has no place on the map. */
export function objectivePos(o: QuestObjective): Pt | null {
  switch (o.kind) {
    case 'talk':
      return o.target ? npcWorldPos(o.target) : null;
    case 'explore':
      return o.target ? placeWorldPos(o.target) : null;
    case 'dungeon':
      return o.target ? entranceWorldPos(o.target.split(':')[0]) : null;
    case 'kill':
    case 'boss':
    case 'metin':
      return nearestLiveEnemy(killIds(o));
    default:
      return null;
  }
}

/** Map rings for the unfinished objectives of the active quests. */
export function questTargetMarks(): QuestMark[] {
  const out: QuestMark[] = [];
  const q = G.quests;
  if (!q || !G.character || !inWorldMap()) return out;
  try {
    for (const def of q.active()) {
      if (q.state(def.id) !== 'active') continue;
      const rows = q.progressRows(def.id);
      def.objectives.forEach((o, k) => {
        if (rows[k]?.done) return;
        const p = objectivePos(o);
        if (p) out.push({ ...p, questId: def.id, label: o.text, kind: o.kind });
      });
    }
  } catch {
    /* quest data not ready */
  }
  return out;
}

/** Quest markers over the village NPCs that offer or take in a quest. */
export function questGiverMarks(): QuestGiverMark[] {
  const out: QuestGiverMark[] = [];
  const q = G.quests;
  if (!q || !G.character || !inWorldMap()) return out;
  try {
    for (const v of worldExtras()?.villages ?? []) {
      for (const n of v.npcs) {
        if (!n.quests?.length) continue;
        const defs = q.offered(n.id);
        if (!defs.length) continue;
        const kind = defs.some((d) => q.state(d.id) === 'ready') ? 'turnin' : 'offer';
        const p = npcWorldPos(n.id);
        if (p) out.push({ ...p, npcId: n.id, kind });
      }
    }
  } catch {
    /* quest data not ready */
  }
  return out;
}
