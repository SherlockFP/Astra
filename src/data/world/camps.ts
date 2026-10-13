import type { PackDef, PackMember } from '../../types/dungeons';
import { LAYOUT, round2, type LMember, type LPack, type LPatrol } from './layout';
import { ROOM_OF_REGION } from './regions';

/**
 * Sisli Vadi camps (70) and patrols (11) as PackDefs (GDD_OPENWORLD §3.2-3.6, §9.1). OWNER: content module.
 * Camp and patrol order = layout order; the deterministic enemy id of member m of pack p is
 * DUNGEON_ENEMY_ID_BASE + p * WORLD_PACK_STRIDE + m (types/dungeons.ts), so keep this order stable.
 * Mob ids (ow_*, skel_*, cult_*, ...) and rare / mini-boss ids are defined by the enemies module (WP3).
 */

/** Farm spot loot table per pack id (layout `farmSpots`, §3.7). */
const FARM_LOOT = new Map(LAYOUT.farmSpots.map((f) => [f.pack, f.lootTable]));

/** Expand {enemyId, count} groups into one entry per mob, in order. */
function expand(members: LMember[]): string[] {
  return members.flatMap((m) => Array.from({ length: m.count }, () => m.enemyId));
}

/**
 * Member offsets (tile units from the pack centre): a golden-angle spiral inside the camp radius, the same layout the
 * old Sisli Koru camps used. The first mob stands on the centre when the pack has more than one member.
 */
function spread(enemyIds: string[], radiusM: number): PackMember[] {
  const rT = Math.min(2.6, (radiusM / 4) * 0.55);
  return enemyIds.map((enemyId, i) => {
    const a = i * 2.39996;
    const d = i === 0 && enemyIds.length > 1 ? 0 : rT * Math.sqrt((i + 0.5) / enemyIds.length);
    return { enemyId, offset: [round2(Math.sin(a) * d), round2(Math.cos(a) * d)] };
  });
}

/** Mobs that rise from graves / bone piles (dormant camps). */
const isCoffinMob = (id: string): boolean => /^(skel_|crypt_|ow_zombie|ow_ghoul|ow_wraith)/.test(id);

function kindOf(flags: string[], patrol: boolean): NonNullable<PackDef['kind']> {
  if (patrol) return 'patrol';
  if (flags.some((f) => f.startsWith('farm:'))) return 'farm';
  if (flags.includes('elite')) return 'elite';
  return 'camp';
}

function campOf(p: LPack): PackDef {
  const flags = p.flags ?? [];
  const ids = expand(p.members);
  const pack: PackDef = {
    id: p.id,
    roomId: ROOM_OF_REGION[p.region],
    center: p.center,
    members: spread(ids, p.radius),
    respawnSec: p.respawnSec,
    levelRange: p.levelRange,
    radius: p.radius,
    kind: kindOf(flags, false),
    note: [p.name, p.note].filter(Boolean).join(' · '),
  };
  const lootTable = FARM_LOOT.get(p.id);
  if (lootTable) pack.lootTable = lootTable;
  if (flags.includes('dormant')) pack.dormant = { kind: ids.some(isCoffinMob) ? 'coffin' : 'bones', wakeRadius: 12 };
  if (flags.includes('stealth')) pack.stealth = true;
  return pack;
}

/** Patrols walk the layout loop; the members spawn on its first point. */
function patrolOf(p: LPatrol): PackDef {
  return {
    id: p.id,
    roomId: ROOM_OF_REGION[p.region],
    center: p.patrol[0],
    members: spread(expand(p.members), 8),
    patrol: p.patrol,
    respawnSec: p.respawnSec,
    levelRange: p.levelRange,
    radius: 8,
    kind: kindOf([], true),
    note: p.name,
  };
}

/** The 70 camps (layout `packs`). */
export const WORLD_CAMPS: PackDef[] = LAYOUT.packs.map(campOf);
/** The 11 patrols (layout `patrols`). */
export const WORLD_PATROLS: PackDef[] = LAYOUT.patrols.map(patrolOf);
/** Everything the scene spawns as a pack, camps first (indices feed the enemy id scheme). */
export const WORLD_PACKS: PackDef[] = [...WORLD_CAMPS, ...WORLD_PATROLS];
