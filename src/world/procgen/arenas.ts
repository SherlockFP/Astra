import type { BossPlacement, DungeonDef, FissureThemeId, RoomDef, TileRect, ZoneDef } from '../../types/dungeons';
import { KEMIK_MAHZENI } from '../../data/dungeons/kemik_mahzeni';
import { KIZIL_DOKUMHANE } from '../../data/dungeons/kizil_dokumhane';
import { BUZUL_TAHTI } from '../../data/dungeons/buzul_tahti';
import { GOLGE_TAPINAGI } from '../../data/dungeons/golge_tapinagi';

/**
 * Boss arenas for the generated maps. OWNER: world module.
 *
 * The user decision for Kadim Yarıklar: guardians and final bosses are EXISTING bosses (their BossDef, script and loot table are
 * untouched). A BossController derives its arena from the BossDef's baked rect and the spawn point (shifted by the spawn offset),
 * so the generated boss room must be the boss's own room: same size, same props / zones, the boss at the same spot of the room.
 * This module reads that room out of the hand-made dungeon the boss lives in and clones it to any position; the door anchors
 * (side + offset along the edge) are the original doors, which are known to be clear of props, bridges and zones.
 */

export type Side = 'n' | 's' | 'e' | 'w';
export const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };
export const DIR: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/** A 2-tile wide door position on a room edge. `at` = offset (tiles) of its first tile along the edge (x for n/s, z for e/w). */
export interface Anchor { side: Side; at: number }

export interface ArenaSrc {
  bossId: string;
  /** Hand-made dungeon the room comes from. */
  from: string;
  /** Theme the boss belongs to. */
  home: FissureThemeId;
  room: RoomDef;
  placement: BossPlacement;
  w: number;
  h: number;
  /** Boss spawn relative to the room's rect origin (GDD tile coordinates). */
  bossRel: [number, number];
  anchors: Anchor[];
}

const SOURCES: { def: DungeonDef; home: FissureThemeId; bossIds: string[] }[] = [
  { def: KEMIK_MAHZENI, home: 'crypt', bossIds: ['boss_bekci_kaldur', 'boss_olucagiran_morkan', 'boss_azrakel'] },
  { def: KIZIL_DOKUMHANE, home: 'forge', bossIds: ['boss_dokumcu_gurz', 'boss_atesyurek', 'boss_ignaroth'] },
  { def: BUZUL_TAHTI, home: 'frost', bossIds: ['boss_ak_pence', 'boss_ayaz_ana', 'boss_tugrul'] },
  { def: GOLGE_TAPINAGI, home: 'shadow', bossIds: ['boss_nefris', 'boss_kevvas', 'boss_zakhar'] },
];

/** The original doors of a room as anchors seen from inside the room (openings 2 tiles wide or more; the anchor is the first tile). */
function anchorsOf(def: DungeonDef, room: RoomDef): Anchor[] {
  const out: Anchor[] = [];
  const seen = new Set<string>();
  for (const d of def.doors) {
    if ((d.width ?? 1) < 2) continue;
    let side: Side;
    let along: number;
    if (d.a === room.id) {
      side = d.side;
      along = d.side === 'n' || d.side === 's' ? d.tile[0] - room.rect.x : d.tile[1] - room.rect.z;
    } else if (d.b === room.id) {
      side = OPPOSITE[d.side];
      along = d.side === 'n' || d.side === 's' ? d.tile[0] - room.rect.x : d.tile[1] - room.rect.z;
    } else continue;
    const key = `${side}${along}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ side, at: along });
  }
  return out;
}

/** bossId -> arena source, built once at import from the four levelling dungeons. */
export const ARENAS: Record<string, ArenaSrc> = (() => {
  const out: Record<string, ArenaSrc> = {};
  for (const s of SOURCES) {
    for (const bossId of s.bossIds) {
      const placement = s.def.bosses.find((b) => b.bossId === bossId);
      const room = placement ? s.def.rooms.find((r) => r.id === placement.roomId) : undefined;
      if (!placement || !room) continue;
      out[bossId] = {
        bossId, from: s.def.id, home: s.home, room, placement, w: room.rect.w, h: room.rect.h,
        bossRel: [placement.pos[0] - room.rect.x, placement.pos[1] - room.rect.z],
        anchors: anchorsOf(s.def, room),
      };
    }
  }
  return out;
})();

/** Boss pools per theme: the two levelling-dungeon guardians (plus one borrowed from a kindred theme) and the dungeon's last boss. */
export const BOSS_POOLS: Record<FissureThemeId, { guardians: string[]; final: string }> = {
  crypt: { guardians: ['boss_bekci_kaldur', 'boss_olucagiran_morkan', 'boss_nefris'], final: 'boss_azrakel' },
  forge: { guardians: ['boss_dokumcu_gurz', 'boss_atesyurek'], final: 'boss_ignaroth' },
  frost: { guardians: ['boss_ak_pence', 'boss_ayaz_ana'], final: 'boss_tugrul' },
  shadow: { guardians: ['boss_nefris', 'boss_kevvas', 'boss_olucagiran_morkan'], final: 'boss_zakhar' },
};

const shiftRect = (r: TileRect, dx: number, dz: number): TileRect => ({ x: r.x + dx, z: r.z + dz, w: r.w, h: r.h });

/**
 * The arena room at `rect` (same size as the source room). Props, zones and ambience emitters are translated by the offset
 * between the two rects; dais / bridge deck heights (absolute in a vertical dungeon) get the room's floor added.
 */
export function cloneArena(src: ArenaSrc, rect: TileRect, over: { id: string; boss: number; floorY: number; ceiling: number }): RoomDef {
  const dx = rect.x - src.room.rect.x, dz = rect.z - src.room.rect.z;
  const r: RoomDef = { ...src.room, id: over.id, rect: shiftRect(rect, 0, 0), boss: over.boss, floorY: over.floorY, ceiling: over.ceiling };
  if (src.room.props) r.props = src.room.props.map((p) => ({ ...p, pos: [p.pos[0] + dx, p.pos[1] + dz] as [number, number] }));
  if (src.room.zones) {
    r.zones = src.room.zones.map((z): ZoneDef => {
      const nz: ZoneDef = { ...z, rect: shiftRect(z.rect, dx, dz) };
      if ((z.kind === 'dais' || z.kind === 'bridge') && z.y !== undefined) nz.y = z.y + over.floorY;
      return nz;
    });
  }
  if (src.room.ambience) r.ambience = src.room.ambience.map((a) => (a.pos ? { ...a, pos: [a.pos[0] + dx, a.pos[1] + dz] as [number, number] } : { ...a }));
  return r;
}
