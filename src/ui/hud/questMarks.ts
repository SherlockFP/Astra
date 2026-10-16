import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import { TILE_SIZE, type DungeonDef, type WorldExtras } from '../../types/dungeons';
import type { QuestKind, QuestObjective } from '../../types/quests';
import type { Enemy } from '../../entities/Enemy';
import { TOWN } from '../../data/town';

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
/**
 * Objective the player clicked in the tracker: the arrow points at it first (over the pinned quest's first open objective). Session
 * state only; it ends when the objective is done or another quest is pinned.
 */
let focus: { questId: string; k: number } | null = null;
export function focusObjective(questId: string, k: number): void {
  focus = { questId, k };
  setPinnedQuest(questId);
}
/** The objective the tracker focused, or null. */
export function focusedObjective(): { questId: string; k: number } | null {
  return focus;
}

export function setPinnedQuest(id: string | null): void {
  if (focus && focus.questId !== id) focus = null;
  G.events?.emit('quest:pinned', { questId: id });
  try {
    if (id) window.localStorage.setItem(PIN_KEY, id);
    else window.localStorage.removeItem(PIN_KEY);
  } catch (err) {
    console.warn('[ui] storage blocked', err);
  }
}

export interface Pt { x: number; z: number }

/** Quest target on the map (blue ring). */
export interface QuestMark extends Pt { questId: string; label: string; kind: QuestKind }
/** Quest giver marker over a village NPC: gold `!` (offer), `?` (turn in) or grey `!` (the next quest waits for the level). */
export interface QuestGiverMark extends Pt { npcId: string; kind: GiverKind }
export type GiverKind = 'offer' | 'turnin' | 'locked';

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
  } catch (err) {
    console.warn('[ui] mplus not ready', err);
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

/** A quest's area (WoW quest area): the camps and patrols of its region whose levels sit inside the band q-1..q+1. */
export interface QuestArea { level: number; region?: string }

/**
 * Pack ids of a quest's area, or null when the quest has no area (no region of its own and no camp place in one). The region is the
 * quest's region, else the region of its layout place (a camp of the map). Camps whose levels miss the band q-1..q+1 are not in the area.
 */
export function questArea(area: QuestArea | undefined, place?: string): Set<string> | null {
  const def = worldDef();
  const ext = def?.world;
  if (!area || !def || !ext) return null;
  const placeRoom = place ? def.packs.find((pk) => pk.id === place)?.roomId : undefined;
  const region = area.region ?? ext.regions.find((r) => r.roomId === placeRoom)?.id;
  const room = ext.regions.find((r) => r.id === region)?.roomId;
  if (!room) return null;
  const [lo, hi] = [area.level - 1, area.level + 1];
  // overlap, not containment: camps span two or three levels (the same band test as tools/content-check.mjs killBandIssues)
  return new Set(def.packs.filter((pk) => pk.roomId === room && (pk.levelRange ?? [1, 99])[0] <= hi && (pk.levelRange ?? [1, 99])[1] >= lo).map((pk) => pk.id));
}

/** Lowest level of a camp (its layout levelRange); 1 for a pack without one. */
function campMinLevel(packId: string): number {
  return worldDef()?.packs.find((pk) => pk.id === packId)?.levelRange?.[0] ?? 1;
}

/**
 * Nearest live enemy whose def id matches (ids of camp mobs, rares, bosses, metin stones). Null when none is alive. With a quest
 * `area`, a camp enemy outside it never counts as the target (enemies off a camp keep no pack id and are not filtered). `maxLevel`:
 * camps whose lowest level is above it are not targets (a level 2 quest's arrow does not walk into a level 3 camp).
 */
function nearestLiveEnemy(ids: string[], area: Set<string> | null, maxLevel?: number): Pt | null {
  const w = G.world;
  const p = G.player ?? w?.localPlayer;
  if (!w || !ids.length) return null;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (const e of w.enemies as Enemy[]) {
    if (e.isDead || e.removed || !e.def || !ids.includes(e.def.id)) continue;
    if (area && e.packId && !area.has(e.packId)) continue;
    if (maxLevel !== undefined && e.packId && campMinLevel(e.packId) > maxLevel) continue;
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
  return enemyIdsOf(o, worldExtras()?.metin.tiers ?? []);
}

/** Enemy ids an objective can match on a map: its target id, or for a metin objective the stones of the map (`tiers`). */
function enemyIdsOf(o: QuestObjective, tiers: { id: string; enemyId: string }[]): string[] {
  if (o.kind !== 'metin') return o.target ? [o.target] : [];
  if (!o.target) return tiers.map((t) => t.enemyId);
  const tier = tiers.find((t) => t.id === o.target);
  return tier ? [tier.enemyId] : [o.target];
}

/**
 * Camp (or patrol) of the open-world map that spawns one of the ids: the quest's own place (layout `place`) when it holds one,
 * else the nearest to the player. The fallback of a kill objective whose enemy is not streamed in (the arrow would hide).
 */
/** Lair of a mini-boss whose enemy id is in `ids`: a boss objective points at the lair (the mini-boss stands there, not in a camp). */
function lairPos(ids: string[]): Pt | null {
  const m = worldDef()?.world?.minibosses?.find((x) => ids.includes(x.enemyId));
  return m ? { x: tileCentreM(m.lair[0]), z: tileCentreM(m.lair[1]) } : null;
}

function campPos(ids: string[], place?: string, area: Set<string> | null = null, maxLevel?: number): Pt | null {
  const def = worldDef();
  if (!def || !ids.length) return null;
  const holds = (pk: { members: { enemyId: string }[] }): boolean => pk.members.some((m) => ids.includes(m.enemyId));
  // maxLevel (the quest's level band top, q+1): a camp whose lowest level is above it is never the arrow's target, even when the
  // quest has no area (the same band as questArea)
  const tooHigh = (id: string): boolean => maxLevel !== undefined && campMinLevel(id) > maxLevel;
  const own = place ? def.packs.find((pk) => pk.id === place) : undefined;
  if (own && holds(own) && (!area || area.has(own.id)) && !tooHigh(own.id)) return { x: tileCentreM(own.center[0]), z: tileCentreM(own.center[1]) };
  const p = G.player ?? G.world?.localPlayer;
  let best: Pt | null = null;
  let bestD = Infinity;
  for (const pk of def.packs) {
    if (!holds(pk) || (area && !area.has(pk.id)) || tooHigh(pk.id)) continue;
    const x = tileCentreM(pk.center[0]);
    const z = tileCentreM(pk.center[1]);
    const d = p ? Math.hypot(x - p.position.x, z - p.position.z) : 0;
    if (d < bestD) {
      bestD = d;
      best = { x, z };
    }
  }
  return best;
}

/**
 * Where one unfinished objective points, or null when it has no place on the map. `place` is the quest's layout place (camp fallback).
 * `area` is the quest's area: a kill objective points only inside it (its camps in the quest's level band), never at an outer-ring camp.
 */
export function objectivePos(o: QuestObjective, place?: string, area?: QuestArea): Pt | null {
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
      { const inArea = questArea(area, place); return nearestLiveEnemy(killIds(o), inArea, area?.level) ?? lairPos(killIds(o)) ?? campPos(killIds(o), place, inArea, area && area.level + 1) ?? nearestLiveEnemy(killIds(o), inArea, area?.level); }
    case 'drop':
    case 'collect':
      // drop / collect hunt the mobs in `from`: the same live-enemy-else-camp fallback as a kill (the WoW objective area, from data)
      { const inArea = questArea(area, place); const ids = o.from ?? []; return nearestLiveEnemy(ids, inArea, area?.level) ?? campPos(ids, place, inArea, area && area.level + 1) ?? nearestLiveEnemy(ids, inArea, area?.level); }
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
        const p = objectivePos(o, def.place, { level: def.level, region: def.region });
        if (p) out.push({ ...p, questId: def.id, label: o.text, kind: o.kind });
      });
    }
  } catch (err) {
    console.warn('[ui] quest data not ready', err);
  }
  return out;
}

/**
 * The marker of one quest giver: `turnin` (a ready quest is handed in here, or an active quest's open talk objective is this NPC),
 * `offer` (an available quest), `locked` (the giver's next quest waits for the level), or null. Mirrors questMarkFor in
 * scenes/world/QuestMarks.ts, the marker over the NPC's head, so the minimap and the map agree with it.
 */
export function giverKind(npcId: string): GiverKind | null {
  const q = G.quests;
  const ch = G.character;
  if (!q || !ch) return null;
  let best: GiverKind | null = null;
  const rank: Record<GiverKind, number> = { turnin: 3, offer: 2, locked: 1 };
  for (const def of q.all()) {
    const talkIdx = def.objectives.findIndex((o) => o.kind === 'talk' && o.target === npcId);
    if (def.giver !== npcId && def.turnIn !== npcId && talkIdx < 0) continue;
    const s = q.state(def.id);
    let mark: GiverKind | null = null;
    if (s === 'ready' && (def.turnIn ?? def.giver) === npcId) mark = 'turnin';
    else if (s === 'active' && talkIdx >= 0 && !q.progressRows(def.id)[talkIdx]?.done) mark = 'turnin';
    else if (s === 'available' && def.giver === npcId) mark = 'offer';
    else if (s === 'locked' && def.giver === npcId && ch.level < def.level && (def.prereq ?? []).every((p) => q.state(p) === 'done')) mark = 'locked';
    if (mark && (!best || rank[mark] > rank[best])) best = mark;
  }
  return best;
}

/** Quest markers over the village NPCs that offer, take in or wait on a quest (the open world). */
export function questGiverMarks(): QuestGiverMark[] {
  const out: QuestGiverMark[] = [];
  if (!G.quests || !G.character || !inWorldMap()) return out;
  try {
    for (const v of worldExtras()?.villages ?? []) {
      for (const n of v.npcs) {
        if (!n.quests?.length) continue;
        const kind = giverKind(n.id);
        const p = kind ? npcWorldPos(n.id) : null;
        if (kind && p) out.push({ ...p, npcId: n.id, kind });
      }
    }
  } catch (err) {
    console.warn('[ui] quest data not ready', err);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Quest mobs and quest props (HUD marks: nameplate quest icon, objective focus)                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Enemies an unfinished objective of an active quest still wants: `ids` (their def ids), inside the quest `area` (camp packs) when set. */
export interface QuestMobRule { ids: string[]; area: Set<string> | null }

/**
 * Enemy rules of the active quests: the kill / boss / metin targets of the unfinished objectives and the drop / collect sources
 * (`from`, or the quest's kill targets when the objective names none). Only active quests (not ready, not available), never throws.
 */
export function questMobRules(): QuestMobRule[] {
  const out: QuestMobRule[] = [];
  const q = G.quests;
  if (!q || !G.character) return out;
  try {
    for (const def of q.active()) {
      if (q.state(def.id) !== 'active') continue;
      const rows = q.progressRows(def.id);
      const area = questArea({ level: def.level, region: def.region }, def.place);
      const killTargets = def.objectives.filter((o) => o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin').flatMap((o) => killIds(o));
      def.objectives.forEach((o, k) => {
        if (rows[k]?.done) return;
        let ids: string[] = [];
        if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin') ids = killIds(o);
        else if (o.kind === 'drop' || o.kind === 'collect') ids = o.from?.length ? o.from : killTargets;
        if (ids.length) out.push({ ids, area });
      });
    }
  } catch (err) {
    console.warn('[ui] quest data not ready', err);
  }
  return out;
}

/** True when an enemy is a quest mob of one of the rules: its def id is in the rule and (a camp mob) its pack is in the quest area. */
export function isQuestMob(e: { def?: { id: string } | null; packId?: string | null }, rules: QuestMobRule[]): boolean {
  const id = e.def?.id;
  if (!id || !rules.length) return false;
  return rules.some((r) => r.ids.includes(id) && (!r.area || !e.packId || r.area.has(e.packId)));
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Objective arrow targets (UI_REDESIGN §4.4, UX-20)                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Target of the objective arrow: where to point, what to call it, and which medallion kind to draw. */
export interface GuideTarget extends Pt {
  label: string;
  kind: 'talk' | 'turnin' | 'kill' | 'explore' | 'dungeon';
  /** Stable id: a new key restarts the arrival logic. */
  key: string;
}

/** Centre of a town exit box `[x0, z0, x1, z1]` by exit id (the exits of TOWN, §4.4). */
function townExitCentre(id: string): Pt | null {
  const e = (TOWN.exits ?? []).find((x) => x.id === id);
  if (!e) return null;
  return { x: (e.box[0] + e.box[2]) / 2, z: (e.box[1] + e.box[3]) / 2 };
}

/** Town NPC position (TOWN.npcs, metres, x / z). */
export function townNpcPos(id: string): Pt | null {
  const n = TOWN.npcs.find((x) => x.id === id);
  return n ? { x: n.pos[0], z: n.pos[2] } : null;
}

/** Name of a town NPC, or the id. */
export function townNpcName(id: string): string {
  const t = TOWN.npcs.find((x) => x.id === id)?.name;
  if (t) return t;
  // open-world village NPCs (Muhtar Ferhat ...) live in the map's village list, not in the town: never show the raw id on the arrow
  for (const v of worldExtras()?.villages ?? []) {
    const n = v.npcs.find((x) => x.id === id);
    if (n) return n.name;
  }
  return id;
}

/** The open-world maps and the town gate each one is entered by (TOWN.exits, data/town.ts). */
const MAP_GATES: Record<string, { exit: string; label: string }> = {
  sisli_vadi: { exit: 'guney_kapisi', label: 'Güney Kapısı' },
  karakir_bozkiri: { exit: 'dogu_kapisi', label: 'Doğu Kapısı' },
};

/** Centre of the town gate of an open-world map, with its name. */
function gateCentre(zone: string): (Pt & { label: string }) | null {
  const g = MAP_GATES[zone];
  const p = g ? townExitCentre(g.exit) : null;
  return g && p ? { ...p, label: g.label } : null;
}

/** Does the map hold the objective's place: its enemy (camp, patrol, rare, mini-boss, boss or stone), its NPC or a named place? */
function mapHolds(def: DungeonDef, o: QuestObjective): boolean {
  const ext = def.world;
  const t = o.target ?? '';
  if (!ext) return false;
  if (!t && o.kind !== 'metin') return false;
  switch (o.kind) {
    case 'kill':
    case 'boss':
    case 'metin': {
      const ids = new Set(enemyIdsOf(o, ext.metin.tiers));
      return def.packs.some((p) => p.members.some((m) => ids.has(m.enemyId)))
        || ext.rares.some((r) => ids.has(r.enemyId))
        || ext.minibosses.some((m) => ids.has(m.enemyId))
        || ext.bosses.some((b) => ids.has(b.bossId))
        || ext.metin.tiers.some((x) => ids.has(x.enemyId));
    }
    case 'drop':
    case 'collect':
      return !!o.from?.some((f) => def.packs.some((p) => p.members.some((m) => m.enemyId === f)));
    case 'explore':
      return ext.regions.some((x) => x.id === t) || ext.waypoints.some((x) => x.id === t) || ext.vistas.some((x) => x.id === t)
        || ext.landmarks.some((x) => x.id === t) || ext.hidden.some((x) => x.id === t) || ext.entrances.some((x) => x.id === t)
        || ext.villages.some((x) => x.id === t);
    case 'talk':
      return ext.villages.some((v) => v.npcs.some((n) => n.id === t));
    default:
      return false;
  }
}

/**
 * The open-world map an objective belongs to: the map that holds its enemy, NPC or place, else the map that owns the quest's region
 * (`questRegion`, r1..r6 Sisli Vadi, r7..r10 Karakır Bozkırı). Null when no map claims it.
 */
export function worldZoneOf(o: QuestObjective, questRegion?: string): string | null {
  const maps = Object.keys(MAP_GATES)
    .map((id) => getDungeon(id))
    .filter((d): d is DungeonDef => !!d?.world);
  const held = maps.find((d) => mapHolds(d, o));
  if (held) return held.id;
  if (!questRegion) return null;
  return maps.find((d) => d.world?.regions.some((r) => r.id === questRegion))?.id ?? null;
}

/**
 * Where an objective points for the arrow, scene-aware (§4.4). In town the open-world places are the gates: an objective of an
 * open-world map points at that map's gate (Karakır Bozkırı: the East Gate; Sisli Vadi: the South Gate), dungeons at their portal.
 * On the world map it is the objective's own position. Null when there is no place to point at.
 */
export function guideTargetPos(o: QuestObjective, inTown: boolean, questRegion?: string, place?: string, level?: number): (Pt & { label: string }) | null {
  const tgt = o.target ?? '';
  if (!inTown) {
    const p = objectivePos(o, place, level === undefined ? undefined : { level, region: questRegion });
    return p ? { ...p, label: o.text } : null;
  }
  const zone = worldZoneOf(o, questRegion);
  switch (o.kind) {
    case 'talk': {
      const n = tgt ? townNpcPos(tgt) : null;
      if (n) return { ...n, label: townNpcName(tgt) };
      if (zone) return gateCentre(zone);
      if (tgt.startsWith('npc_g_')) return gateCentre('sisli_vadi');
      return null;
    }
    case 'dungeon': {
      const dId = tgt.split(':')[0];
      const p = dId ? townNpcPos(`portal_${dId}`) : null;
      return p ? { ...p, label: 'Zindan Portalı' } : null;
    }
    case 'explore':
    case 'kill':
    case 'boss':
    case 'metin':
    case 'drop':
    case 'collect':
      return gateCentre(zone ?? 'sisli_vadi');
    default:
      return null;
  }
}

function objectiveKind(o: QuestObjective): GuideTarget['kind'] {
  switch (o.kind) {
    case 'kill':
    case 'boss':
    case 'metin':
    case 'drop':
    case 'collect':
      return 'kill';
    case 'explore':
      return 'explore';
    case 'dungeon':
      return 'dungeon';
    default:
      return 'talk';
  }
}

/** NPC position for the current scene (town NPC in town, the village NPC on the world map). */
function giverPos(npcId: string, inTown: boolean): Pt | null {
  return inTown ? townNpcPos(npcId) : npcWorldPos(npcId);
}

/**
 * The objective arrow's target (§4.4), first hit of the priority list: (1) the pinned active quest's first open objective
 * with a place, (2) a `ready` quest's turn-in NPC, (3) the recommended quest's giver (`recommendedGiver`, from
 * guideEngine.recommend, or the welcome guide target `HudApi.guideTarget`). Null when there is nothing to point at.
 */
export function guideTarget(recommendedGiver: string | null): GuideTarget | null {
  const inTown = G.ui?.mode === 'town';
  const q = G.quests;
  if (q && G.character) {
    try {
      // a tracker click (focusObjective) wins while that objective is still open
      const f = focus;
      const fdef = f ? q.def(f.questId) : undefined;
      if (f && fdef && q.state(fdef.id) === 'active' && !q.progressRows(fdef.id)[f.k]?.done) {
        const fo = fdef.objectives[f.k];
        const fp = fo ? guideTargetPos(fo, inTown, fdef.region, fdef.place, fdef.level) : null;
        if (fp) return { x: fp.x, z: fp.z, label: fp.label, kind: objectiveKind(fo), key: `${fdef.id}#${f.k}` };
      }
      const pinned = getPinnedQuest();
      let pdef = pinned ? q.def(pinned) : undefined;
      // nothing is pinned automatically on accept: follow the first active quest (the same fallback the HUD tracker shows),
      // otherwise the arrow keeps pointing at the guide NPC the player already talked to
      if (!pdef || q.state(pdef.id) !== 'active') pdef = q.active().find((d) => q.state(d.id) === 'active');
      if (pdef) {
        const rows = q.progressRows(pdef.id);
        for (let k = 0; k < pdef.objectives.length; k++) {
          const o = pdef.objectives[k];
          if (rows[k]?.done) continue;
          const p = guideTargetPos(o, inTown, pdef.region, pdef.place, pdef.level);
          if (p) return { x: p.x, z: p.z, label: p.label, kind: objectiveKind(o), key: `${pdef.id}#${k}` };
        }
      }
      for (const d of q.all()) {
        if (q.state(d.id) !== 'ready') continue;
        const id = d.turnIn ?? d.giver;
        const p = giverPos(id, inTown);
        if (p) return { x: p.x, z: p.z, label: townNpcName(id), kind: 'turnin', key: `ready:${d.id}` };
      }
    } catch (err) {
      console.warn('[ui] quest data not ready', err);
    }
  }
  const giver = recommendedGiver ?? G.ui?.hud?.guideTarget ?? null;
  if (giver) {
    const p = giverPos(giver, inTown);
    if (p) return { x: p.x, z: p.z, label: townNpcName(giver), kind: 'talk', key: `giver:${giver}` };
  }
  return null;
}
/* ------------------------------------------------------------------------------------------------------------------ */
/* Live guide target (objective arrow -> minimap pin, tracker sentence, world beam)                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The target the objective arrow resolved last (ObjectiveArrow refreshes it at 2 Hz). Null when there is none. */
let liveGuide: GuideTarget | null = null;
export function setLiveGuide(t: GuideTarget | null): void {
  liveGuide = t;
}
/** The arrow's current target: read by the minimap pin and the tracker's "Ne yapmalıyım?" sentence. */
export function liveGuideTarget(): GuideTarget | null {
  return liveGuide;
}
