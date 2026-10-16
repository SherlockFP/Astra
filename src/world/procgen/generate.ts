import { RNG, hashString } from '../../core/utils';
import type { BossPlacement, DoorDef, DungeonDef, FissureInfo, FissureModId, FissureRoomKind, RoomDef, TileRect } from '../../types/dungeons';
import { stairs } from '../../data/dungeons/kit';
import { ARENAS, BOSS_POOLS, cloneArena, type Side } from './arenas';
import { doorTile, growLayout, type GrowPlan, type LLink, type LNode, type Layout } from './layout';
import { populate, doorTilesOf, type PopLink, type PopRoom } from './populate';
import { FISSURE_MOD_ORDER, FISSURE_TIERS } from './tiers';
import { THEMES, type NamedKind } from './themes';
import { clampLevel, fissureId, type FissureSpec } from './ids';
import { getEnemyDef } from '../../data/enemies';

/**
 * generateFissure(spec) -> DungeonDef: the Kadim Yarıklar generator (docs/GDD_PROCGEN.md D1 / D3 / §4). OWNER: world module.
 *
 * Pure and deterministic: the result depends only on (seed, theme, tier, level, v) through the core RNG (mulberry32, integer ops) and
 * integer geometry. The output is an ordinary DungeonDef (vertical: true), so DungeonBuilder, NavGrid, DungeonScene, enemy ids
 * (DUNGEON_ENEMY_ID_BASE + index over packs then bosses), boss gates and the Loot v3 boss chests work unchanged on every peer.
 *
 * Pipeline: mods -> bosses -> plan (rooms by kind) -> floor tiers -> layout growth (retried per attempt stream, reduced plan as the
 * last resort) -> rooms / connectors / doors -> population -> assembled def. Independent RNG streams per stage so one stage never
 * shifts another.
 */

/** Metres between floor tiers (CORE_MECHANICS §13: stairs bridge them, steps between flat tiles stay <= 0.45 m). */
export const TIER_HEIGHT = 2.0;
const GROW_ATTEMPTS = 96;
const FALLBACK_ATTEMPTS = 300;

const hex8 = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');
const pad2 = (n: number): string => String(n).padStart(2, '0');
const FACING: Record<Side, number> = { n: 180, e: 90, s: 0, w: 270 };

/**
 * Floor tier of every spine room: a seeded random walk with steps of -1 / 0 / +1 (so a map never skips a level), shifted up until it
 * reaches the highest tier, final room on the highest tier reached.
 */
function spineTiers(rng: RNG, len: number, maxTier: number): number[] {
  const t: number[] = [0];
  for (let i = 1; i < len; i++) {
    const r = rng.next();
    const d = r < 0.2 ? -1 : r < 0.7 ? 0 : 1;
    t.push(Math.max(0, Math.min(maxTier, t[i - 1] + d)));
  }
  for (let guard = 0; guard < 40 && Math.max(...t) < maxTier; guard++) {
    // raise the tail from a link that does not already climb: the step stays <= 1
    const j = rng.int(1, len - 1);
    if (t[j] - t[j - 1] > 0) continue;
    for (let k = j; k < len; k++) t[k] = Math.min(maxTier, t[k] + 1);
  }
  t[len - 1] = Math.max(...t);
  return t;
}

function planNodes(spec: FissureSpec, key: string, mods: readonly FissureModId[], reduced: boolean): { plan: GrowPlan; guardians: [string, string]; finalId: string; minRooms: number } {
  const tr = FISSURE_TIERS[spec.tier];
  const rngOf = (stage: string): RNG => new RNG(hashString(`${key}:${stage}`));
  const pool = BOSS_POOLS[spec.theme];
  const g = rngOf('boss').shuffle([...pool.guardians]);
  const guardians: [string, string] = [g[0], g[1]];
  const pr = rngOf('plan');
  const R = pr.int(tr.rooms[0], tr.rooms[1]);
  const nBranch = reduced ? 0 : Math.max(1, Math.floor((R - 4) * 0.4));
  const nFill = reduced ? 3 : R - 4 - nBranch;
  // filler kinds: ~35 % halls, at least one hall (two on Kahramanlık / Mitik with enough fillers)
  const fill: ('hall' | 'chamber')[] = [];
  for (let i = 0; i < nFill; i++) fill.push(pr.chance(0.35) ? 'hall' : 'chamber');
  const needHalls = nFill >= 4 && spec.tier !== 'n' ? 2 : nFill >= 2 ? 1 : 0;
  for (let guard = 0; guard < 8 && fill.filter((k) => k === 'hall').length < needHalls; guard++) fill[pr.int(0, nFill - 1)] = 'hall';
  // fillers around the bosses: at least one after guardian 2 and one between the guardians (an arena's doors sit on fixed sides, a
  // connecting room lets the corridor turn), the rest before guardian 1
  const c = nFill >= 6 ? 2 : nFill >= 2 ? 1 : 0;
  const b = nFill >= 4 ? 2 : nFill >= 3 ? 1 : 0;
  const a = nFill - b - c;
  const spineKinds: LNode['kind'][] = ['start', ...fill.slice(0, a), 'guardian', ...fill.slice(a, a + b), 'guardian', ...fill.slice(a + b), 'final'];
  const tiers = spineTiers(rngOf('tiers'), spineKinds.length, reduced ? Math.min(1, tr.maxTier) : tr.maxTier);
  const nodes: LNode[] = [];
  let gi = 0;
  spineKinds.forEach((kind, i) => {
    const n: LNode = { idx: nodes.length, kind, tier: tiers[i], spine: true, doors: [] };
    if (kind === 'guardian') {
      n.order = ++gi;
      n.arena = ARENAS[guardians[gi - 1]];
    } else if (kind === 'final') {
      n.order = 3;
      n.arena = ARENAS[pool.final];
    }
    nodes.push(n);
  });
  // branches: a treasure room first, then a shrine (2+ branches), the rest chambers; Yarık Bereketi turns a chamber into treasure
  const bk: ('treasure' | 'shrine' | 'chamber')[] = [];
  for (let i = 0; i < nBranch; i++) bk.push(i === 0 ? 'treasure' : i === 1 ? 'shrine' : 'chamber');
  if (mods.includes('fm_bereket')) {
    const ci = bk.indexOf('chamber');
    if (ci >= 0) bk[ci] = 'treasure';
    else if (bk.length > 1) bk[1] = 'treasure';
  }
  for (const kind of bk) nodes.push({ idx: nodes.length, kind, tier: 0, spine: false, up: kind === 'treasure' && pr.chance(0.3), doors: [] });
  const minRooms = reduced ? 7 : tr.rooms[0];
  return { plan: { nodes, spineLen: spineKinds.length }, guardians, finalId: pool.final, minRooms };
}

/** Moves the layout so its top-left corner is at (2, 2). */
function normalise(lay: Layout): { w: number; h: number } {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const each = (r: TileRect): void => { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.h); };
  for (const n of lay.nodes) if (n.rect) each(n.rect);
  for (const l of lay.links) each(l.rect);
  const dx = 2 - x0, dz = 2 - z0;
  for (const n of lay.nodes) if (n.rect) n.rect = { x: n.rect.x + dx, z: n.rect.z + dz, w: n.rect.w, h: n.rect.h };
  for (const l of lay.links) l.rect = { x: l.rect.x + dx, z: l.rect.z + dz, w: l.rect.w, h: l.rect.h };
  return { w: x1 - x0 + 5, h: z1 - z0 + 5 };
}

/** Tile of connector `c` that lies on the far end (towards room b) for a link travelling `side`. */
function connectorEnd(c: TileRect, side: Side): [number, number] {
  switch (side) {
    case 'n': return [c.x, c.z];
    case 's': return [c.x, c.z + c.h - 1];
    case 'e': return [c.x + c.w - 1, c.z];
    default: return [c.x, c.z];
  }
}

export function generateFissure(spec: FissureSpec): DungeonDef {
  const th = THEMES[spec.theme];
  const tr = FISSURE_TIERS[spec.tier];
  const level = clampLevel(spec.level);
  const key = `${hex8(spec.seed)}:${spec.theme}:${spec.tier}:${level}:${spec.v}`;
  const rngOf = (stage: string): RNG => new RNG(hashString(`${key}:${stage}`));

  // 1. modifiers (distinct, tier decides how many)
  const mods = rngOf('mods').shuffle([...FISSURE_MOD_ORDER]).slice(0, tr.mods).sort((p, q) => FISSURE_MOD_ORDER.indexOf(p) - FISSURE_MOD_ORDER.indexOf(q));

  // 2-4. plan, tiers, growth
  let lay: Layout | null = null;
  let planned = planNodes(spec, key, mods, false);
  for (let i = 0; i < GROW_ATTEMPTS && !lay; i++) lay = growLayout(planned.plan, rngOf(`grow:${i}`), planned.minRooms, tr.maxTier);
  if (!lay) {
    // last resort: the bare spine (start, 3 fillers, 2 guardians, final; no branches), never seen in 30 000 fuzzed seeds
    planned = planNodes(spec, key, mods, true);
    for (let i = 0; i < FALLBACK_ATTEMPTS && !lay; i++) lay = growLayout(planned.plan, rngOf(`fallback:${i}`), planned.minRooms, tr.maxTier);
    if (!lay) throw new Error(`[fissure] no layout for ${fissureId({ ...spec, level })}`);
    console.warn('[fissure] reduced layout', fissureId({ ...spec, level }));
  }
  const grid = normalise(lay);

  // 5. rooms, connectors, doors
  const nr = rngOf('rooms');
  const rooms: RoomDef[] = [];
  const kinds: FissureRoomKind[] = [];
  const tiersOf: number[] = [];
  const ids: string[] = [];
  lay.nodes.forEach((n, i) => {
    const id = `r${pad2(i)}`;
    ids.push(id);
    const rect = n.rect as TileRect;
    if (n.arena) {
      const room = cloneArena(n.arena, rect, { id, boss: n.order as number, floorY: n.tier * TIER_HEIGHT, ceiling: n.kind === 'final' ? 18 : 14 });
      rooms.push(room);
      kinds.push(n.kind === 'final' ? 'final' : 'guardian');
    } else {
      const arch = n.arch;
      if (!arch) throw new Error('[fissure] room without archetype');
      const named = nr.pick(th.roomNames[n.kind as NamedKind]);
      const room: RoomDef = {
        id, name: named, rect: { ...rect }, floor: (n.kind === 'hall' || n.kind === 'chamber') && nr.chance(0.25) ? th.floorAlt : th.floor, wall: th.wall,
        autoDecor: arch.autoDecor, floorY: n.tier * TIER_HEIGHT, ceiling: arch.ceiling,
      };
      if (th.ceilingDark) room.ceilingDark = true;
      if (!n.spine) room.optional = true;
      rooms.push(room);
      kinds.push(n.kind as FissureRoomKind);
    }
    tiersOf.push(n.tier);
  });
  const doors: DoorDef[] = [];
  const popLinks: PopLink[] = [];
  lay.links.forEach((l: LLink, li) => {
    const a = lay.nodes[l.a], b = lay.nodes[l.b];
    const cid = `c${pad2(li)}`;
    const yA = a.tier * TIER_HEIGHT, yB = b.tier * TIER_HEIGHT;
    const c = l.rect;
    const room: RoomDef = {
      id: cid, name: nr.pick(th.roomNames[l.ramp ? 'ramp' : 'corridor']), rect: { ...c }, floor: th.floor, wall: th.wall, autoDecor: 0.3,
      floorY: yA, ceiling: l.ramp ? 8 : 6,
    };
    if (th.ceilingDark) room.ceilingDark = true;
    if (!b.spine) room.optional = true;
    if (l.ramp) {
      // the stair strip (2 tiles per tier) starts at room a, the rest of the connector is flat at room b's height
      const run = 2 * Math.abs(b.tier - a.tier);
      const horizontal = l.side === 'e' || l.side === 'w';
      const minFirst = l.side === 'e' || l.side === 's'; // room a sits at the min edge
      const strip: TileRect = horizontal
        ? { x: minFirst ? c.x : c.x + c.w - run, z: c.z, w: run, h: 2 }
        : { x: c.x, z: minFirst ? c.z : c.z + c.h - run, w: 2, h: run };
      room.floorY = yB;
      room.slopes = [stairs(strip, horizontal ? 'x' : 'z', minFirst ? yA : yB, minFirst ? yB : yA, { id: `${cid}_s`, style: 'stone' })];
    }
    rooms.push(room);
    kinds.push(l.ramp ? 'ramp' : 'corridor');
    tiersOf.push(Math.min(a.tier, b.tier));
    ids.push(cid);
    const ra = ids[l.a], rb = ids[l.b];
    doors.push({ a: ra, b: cid, tile: doorTile(a.rect as TileRect, l.side, l.aAt), side: l.side, width: 2, gate: a.kind === 'guardian' ? 'boss_exit' : 'none' });
    doors.push({ a: cid, b: rb, tile: connectorEnd(c, l.side), side: l.side, width: 2, gate: b.kind === 'guardian' || b.kind === 'final' ? 'boss_lock' : 'none' });
    popLinks.push({ roomId: cid, rect: c, side: l.side, ramp: l.ramp, i: li });
  });

  // start, bosses, exit
  const startNode = lay.nodes[0];
  const sr = startNode.rect as TileRect;
  const start: [number, number] = [sr.x + (sr.w - 1) / 2, sr.z + (sr.h - 1) / 2];
  const firstSide = startNode.doors[0]?.side ?? 's';
  const bosses: BossPlacement[] = [];
  let finalNode: LNode | null = null;
  lay.nodes.forEach((n, i) => {
    if (!n.arena || !n.order) return;
    const r = n.rect as TileRect;
    bosses.push({ bossId: n.arena.bossId, roomId: ids[i], pos: [r.x + n.arena.bossRel[0], r.z + n.arena.bossRel[1]], facing: n.arena.placement.facing ?? 0, order: n.order });
    if (n.kind === 'final') finalNode = n;
  });
  bosses.sort((p, q) => p.order - q.order);
  const fin = finalNode as LNode | null;
  if (!fin) throw new Error('[fissure] no final room');
  const fr = fin.rect as TileRect;
  const entry = fin.doors[0];
  const exit: [number, number] =
    entry.side === 'n' ? [fr.x + entry.at + 0.5, fr.z + 3] :
    entry.side === 's' ? [fr.x + entry.at + 0.5, fr.z + fr.h - 4] :
    entry.side === 'e' ? [fr.x + fr.w - 4, fr.z + entry.at + 0.5] : [fr.x + 3, fr.z + entry.at + 0.5];

  // 6. population and dressing
  const popRooms: PopRoom[] = lay.nodes.map((n, i) => ({ id: ids[i], node: n, rect: n.rect as TileRect, doorTiles: doorTilesOf(doors, ids[i]) }));
  const pop = populate({
    th, tier: spec.tier, level, mods, key, rooms: popRooms, links: popLinks, doors, start, bosses: bosses.map((b) => ({ pos: b.pos })), exit, rng: rngOf('spawn'),
  });
  for (const r of rooms) {
    if (pop.props[r.id]) r.props = [...(r.props ?? []), ...pop.props[r.id]];
    if (pop.zones[r.id]) r.zones = [...(r.zones ?? []), ...pop.zones[r.id]];
  }
  // forces bar: 1/1.2 of everything that can be killed (the content check keeps 15 % spare); completion is the bosses, not the bar
  let forcesAll = 0;
  for (const p of pop.packs) for (const m of p.members) forcesAll += getEnemyDef(m.enemyId)?.forces ?? 0;
  for (const b of bosses) forcesAll += getEnemyDef(b.bossId)?.forces ?? 0;

  const info: FissureInfo = {
    v: spec.v, theme: spec.theme, tier: spec.tier, level, seed: spec.seed >>> 0, mods,
    guardians: planned.guardians, finalBossId: planned.finalId,
    rooms: kinds.filter((k) => k !== 'corridor' && k !== 'ramp').length, kinds, tiers: tiersOf,
  };
  const id = fissureId({ theme: spec.theme, tier: spec.tier, level, seed: spec.seed, v: spec.v });
  const def: DungeonDef = {
    id, name: th.name, shortName: th.shortName, lore: th.lore, levelRange: [level, level], timerSec: 0,
    forcesRequired: Math.max(1, Math.floor(forcesAll / 1.2)),
    theme: th.theme, grid: { w: grid.w, h: grid.h }, rooms, doors, packs: pop.packs, bosses,
    start: { pos: start, facing: FACING[firstSide] }, exit: { pos: exit },
    extras: {
      // no Kehanet Taşı in a fissure: DungeonScene only builds it when the field is truthy
      fontOfPower: undefined as unknown as [number, number],
      shrines: pop.shrines.map((s) => ({ type: 'shrine_power' as const, pos: s.pos })),
      riftSpots: [],
      chests: pop.chests,
    },
    vertical: true,
    fissure: info,
  };
  return def;
}
